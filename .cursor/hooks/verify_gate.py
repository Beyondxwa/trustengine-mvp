#!/usr/bin/env python3
"""stop hook.

Reads a JSON payload from stdin with "status", "loop_count", and
"workspace_roots" fields. Runs the real verification commands (typecheck /
lint / test / build) for every workspace touched by the current diff and
scans the diff for placeholder/cheat patterns. If everything is clean it
prints {} so the turn is allowed to finish. If something is wrong it prints
{"followup_message": "..."} describing exactly what failed and how to fix
it, sending the agent back to fix its own work.

This hook must fail open: any internal exception results in {} so a bug
here never blocks the agent from finishing a turn.
"""

import json
import os
import re
import subprocess
import sys

REPO_ROOT = os.getcwd()
COMMAND_TIMEOUT_SECONDS = 180

# File extensions we treat as "shipped code" for the placeholder/cheat scan.
# Documentation, rule, and config files are intentionally excluded because
# they legitimately discuss these tokens (e.g. this repo's own AGENTS.md and
# .cursor/rules/*.mdc describe what NOT to do).
CODE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".go", ".rb", ".java", ".kt", ".swift",
    ".c", ".cc", ".cpp", ".h", ".hpp", ".rs", ".php",
}

EXCLUDED_PATH_PARTS = (
    "/.cursor/",
    "/.archive/",
    "/node_modules/",
    "/.git/",
    "/dist/",
    "/build/",
    "/.next/",
    "/.expo/",
    "/coverage/",
)

PLACEHOLDER_TOKEN_RULES = [
    (re.compile(r"\bTODO\b"), "TODO"),
    (re.compile(r"\bFIXME\b"), "FIXME"),
    (re.compile(r"\bNotImplementedError\b"), "NotImplementedError"),
    (re.compile(r"@ts-ignore\b"), "@ts-ignore"),
    (re.compile(r"type:\s*ignore\b"), "type: ignore"),
    (re.compile(r"\bconsole\.log\s*\("), "console.log("),
    (re.compile(r"\b(it|test|describe)\.only\s*\("), "it/describe/test.only("),
    (re.compile(r"\.skip\s*\("), ".skip("),
    (re.compile(r":\s*any\b"), ": any"),
    (
        # The exact bug class this repo actually shipped: a button that
        # claims to do something but just shows "not built yet" text.
        re.compile(
            r"Alert\.alert\s*\([^)]*\b(coming soon|todo|not implemented)\b",
            re.IGNORECASE,
        ),
        "Alert.alert(placeholder message)",
    ),
]

# A standalone "placeholder" word — NOT a substring match, so RN/testing
# identifiers like placeholderTextColor, placeholderColor,
# getByPlaceholderText, and getByPlaceholder never match (they're one
# continuous camelCase token with no word boundary around "placeholder").
PLACEHOLDER_WORD_RE = re.compile(r"\bplaceholder\b", re.IGNORECASE)

# Labels for which a match inside a quoted string literal is prose/UI copy/
# data, not real code, and should not be flagged: logger.info("no
# console.log( in prod") is a log message, and <TextInput placeholder="TODO
# list name" /> is UI copy, not a stub.
QUOTED_STRING_EXEMPT_LABELS = {"console.log(", ": any", "TODO", "FIXME"}

_QUOTED_SPAN_RE = re.compile(
    r"\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`"
)


def _quoted_spans(line: str):
    return [(m.start(), m.end()) for m in _QUOTED_SPAN_RE.finditer(line)]


def _in_any_span(pos: int, spans) -> bool:
    return any(start <= pos < end for start, end in spans)


def _comment_start_index(line: str, path: str) -> int:
    """Return the index where a comment starts on this line, or -1 if the
    line has no comment marker. `#` is only treated as a comment marker for
    Python files, since `#` is a normal character elsewhere (hex colors,
    URL fragments, etc.) and would otherwise cause false positives."""
    candidates = []
    for marker in ("//", "/*"):
        idx = line.find(marker)
        if idx != -1:
            candidates.append(idx)
    if path.endswith(".py"):
        idx = line.find("#")
        if idx != -1:
            candidates.append(idx)
    return min(candidates) if candidates else -1


def run(cmd, cwd=None, timeout=COMMAND_TIMEOUT_SECONDS):
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            shell=isinstance(cmd, str),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.returncode, (proc.stdout or "") + (proc.stderr or "")
    except subprocess.TimeoutExpired as exc:
        return 124, f"TIMEOUT after {timeout}s running: {cmd}\n{exc}"
    except FileNotFoundError as exc:
        return 127, str(exc)


def git(args, cwd=None):
    code, out = run(["git"] + args, cwd=cwd or REPO_ROOT)
    return code, out


def is_excluded_path(path: str) -> bool:
    normalized = "/" + path.replace(os.sep, "/")
    return any(part in normalized for part in EXCLUDED_PATH_PARTS)


def parse_changed_files(porcelain_output: str):
    """Return list of (status, path) tuples from `git status --porcelain`."""
    files = []
    for line in porcelain_output.splitlines():
        if not line.strip():
            continue
        status = line[:2]
        rest = line[3:]
        if " -> " in rest:
            rest = rest.split(" -> ", 1)[1]
        files.append((status, rest.strip().strip('"')))
    return files


def detect_package_manager(workspace_dir: str) -> str:
    d = workspace_dir
    while True:
        if os.path.exists(os.path.join(d, "pnpm-lock.yaml")):
            return "pnpm"
        if os.path.exists(os.path.join(d, "yarn.lock")):
            return "yarn"
        if os.path.exists(os.path.join(d, "bun.lockb")):
            return "bun"
        if os.path.exists(os.path.join(d, "package-lock.json")):
            return "npm"
        parent = os.path.dirname(d)
        if parent == d or not parent.startswith(REPO_ROOT):
            break
        d = parent
    return "npm"


def run_script_command(pm: str, script: str) -> list:
    if pm == "npm":
        return ["npm", "run", script]
    if pm == "yarn":
        return ["yarn", script]
    if pm == "pnpm":
        return ["pnpm", "run", script]
    if pm == "bun":
        return ["bun", "run", script]
    return ["npm", "run", script]


def find_workspace_roots(changed_files):
    roots = set()
    for _status, path in changed_files:
        abs_path = os.path.normpath(os.path.join(REPO_ROOT, path))
        d = os.path.dirname(abs_path)
        found = None
        while True:
            if os.path.exists(os.path.join(d, "package.json")) or os.path.exists(
                os.path.join(d, "pyproject.toml")
            ):
                found = d
                break
            parent = os.path.dirname(d)
            if parent == d:
                break
            if not (d == REPO_ROOT or d.startswith(REPO_ROOT + os.sep)):
                break
            d = parent
        if found:
            roots.add(found)
    return sorted(roots)


def check_js_workspace(workspace_dir: str, failures: list, evidence: list):
    package_json_path = os.path.join(workspace_dir, "package.json")
    try:
        with open(package_json_path, "r", encoding="utf-8") as fh:
            pkg = json.load(fh)
    except Exception as exc:
        failures.append(f"{workspace_dir}: could not parse package.json ({exc})")
        return

    scripts = pkg.get("scripts", {}) or {}
    deps = {}
    deps.update(pkg.get("dependencies", {}) or {})
    deps.update(pkg.get("devDependencies", {}) or {})
    is_expo_or_rn = "expo" in deps or "react-native" in deps

    pm = detect_package_manager(workspace_dir)

    wanted = ["typecheck", "type-check", "tsc", "lint", "test"]
    if not is_expo_or_rn:
        wanted.append("build")

    ran_any_typecheck = False
    for script_name in wanted:
        if script_name in ("typecheck", "type-check", "tsc"):
            ran_any_typecheck = True
        if script_name not in scripts:
            continue
        cmd = run_script_command(pm, script_name)
        rel = os.path.relpath(workspace_dir, REPO_ROOT) or "."
        label = f"[{rel}] {' '.join(cmd)}"
        code, output = run(cmd, cwd=workspace_dir)
        evidence.append(f"$ {label}\n{output.strip()[-4000:]}")
        if code != 0:
            failures.append(f"{label} failed (exit {code})")

    has_typecheck_script = any(
        s in scripts for s in ("typecheck", "type-check", "tsc")
    )
    if not has_typecheck_script and os.path.exists(
        os.path.join(workspace_dir, "tsconfig.json")
    ):
        rel = os.path.relpath(workspace_dir, REPO_ROOT) or "."
        label = f"[{rel}] npx tsc --noEmit"
        code, output = run(["npx", "tsc", "--noEmit"], cwd=workspace_dir)
        evidence.append(f"$ {label}\n{output.strip()[-4000:]}")
        if code != 0:
            failures.append(f"{label} failed (exit {code})")


def check_python_workspace(workspace_dir: str, failures: list, evidence: list):
    pyproject_path = os.path.join(workspace_dir, "pyproject.toml")
    try:
        with open(pyproject_path, "r", encoding="utf-8") as fh:
            content = fh.read()
    except Exception as exc:
        failures.append(f"{workspace_dir}: could not read pyproject.toml ({exc})")
        return

    rel = os.path.relpath(workspace_dir, REPO_ROOT) or "."

    if "mypy" in content:
        label = f"[{rel}] python3 -m mypy ."
        code, output = run(["python3", "-m", "mypy", "."], cwd=workspace_dir)
        evidence.append(f"$ {label}\n{output.strip()[-4000:]}")
        if code != 0:
            failures.append(f"{label} failed (exit {code})")

    if "ruff" in content:
        label = f"[{rel}] python3 -m ruff check ."
        code, output = run(["python3", "-m", "ruff", "check", "."], cwd=workspace_dir)
        evidence.append(f"$ {label}\n{output.strip()[-4000:]}")
        if code != 0:
            failures.append(f"{label} failed (exit {code})")

    if "pytest" in content:
        label = f"[{rel}] python3 -m pytest -q"
        code, output = run(["python3", "-m", "pytest", "-q"], cwd=workspace_dir)
        evidence.append(f"$ {label}\n{output.strip()[-4000:]}")
        if code != 0:
            failures.append(f"{label} failed (exit {code})")


def get_added_lines_for_tracked_file(path: str):
    lines = []
    for diff_args in (
        ["diff", "--unified=0", "--", path],
        ["diff", "--cached", "--unified=0", "--", path],
    ):
        code, out = git(diff_args)
        if code != 0:
            continue
        for line in out.splitlines():
            if line.startswith("+++") or line.startswith("---"):
                continue
            if line.startswith("+"):
                lines.append(line[1:])
    return lines


def get_lines_for_untracked_file(path: str):
    abs_path = os.path.join(REPO_ROOT, path)
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as fh:
            return fh.readlines()
    except Exception:
        return []


def scan_line_for_placeholders(line: str, path: str, line_no: int, findings: list):
    quoted_spans = None
    comment_idx = _comment_start_index(line, path)

    for pattern, label in PLACEHOLDER_TOKEN_RULES:
        match = pattern.search(line)
        if not match:
            continue

        if label in QUOTED_STRING_EXEMPT_LABELS:
            if quoted_spans is None:
                quoted_spans = _quoted_spans(line)
            if _in_any_span(match.start(), quoted_spans):
                continue

        if label == ": any" and comment_idx != -1 and match.start() > comment_idx:
            # Prose after a `//` comment marker (e.g. "// returns: any
            # shape"), not a real `: any` type annotation.
            continue

        findings.append(f"{path}:{line_no}: forbidden pattern `{label}` -> {line.strip()[:120]}")

    # "placeholder" is only a finding when it is a standalone word (so
    # placeholderTextColor / placeholderColor / getByPlaceholderText /
    # getByPlaceholder never match — they're one continuous identifier with
    # no word boundary around "placeholder") AND it sits inside a comment.
    # A `placeholder="Email"` JSX prop, or UI copy, is not a leftover TODO
    # marker; a `// placeholder: wire up X later` comment is.
    word_match = PLACEHOLDER_WORD_RE.search(line)
    if word_match and comment_idx != -1 and word_match.start() > comment_idx:
        findings.append(
            f"{path}:{line_no}: placeholder comment -> {line.strip()[:120]}"
        )


def scan_changed_files_for_placeholders(changed_files):
    findings = []
    for status, path in changed_files:
        if is_excluded_path(path):
            continue
        _, ext = os.path.splitext(path)
        if ext not in CODE_EXTENSIONS:
            continue
        is_untracked = status.strip() == "??"
        lines = (
            get_lines_for_untracked_file(path)
            if is_untracked
            else get_added_lines_for_tracked_file(path)
        )
        for idx, line in enumerate(lines, start=1):
            scan_line_for_placeholders(line, path, idx, findings)
    return findings


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
    except Exception:
        payload = {}

    try:
        loop_count = int(payload.get("loop_count", 0) or 0)
    except Exception:
        loop_count = 0

    try:
        if loop_count >= 3:
            print(json.dumps({}))
            return

        code, porcelain = git(["status", "--porcelain"])
        if code != 0 or not porcelain.strip():
            print(json.dumps({}))
            return

        changed_files = parse_changed_files(porcelain)
        workspace_roots = find_workspace_roots(changed_files)

        failures = []
        evidence = []

        for workspace_dir in workspace_roots:
            if is_excluded_path(workspace_dir + os.sep):
                continue
            if os.path.exists(os.path.join(workspace_dir, "package.json")):
                check_js_workspace(workspace_dir, failures, evidence)
            elif os.path.exists(os.path.join(workspace_dir, "pyproject.toml")):
                check_python_workspace(workspace_dir, failures, evidence)

        placeholder_findings = scan_changed_files_for_placeholders(changed_files)

        if not failures and not placeholder_findings:
            print(json.dumps({}))
            return

        message_parts = []
        if failures:
            message_parts.append(
                "Verification gate FAILED — the following checks did not pass:\n"
                + "\n".join(f"- {f}" for f in failures)
            )
        if placeholder_findings:
            message_parts.append(
                "Placeholder / cheat patterns found in changed code:\n"
                + "\n".join(f"- {f}" for f in placeholder_findings)
            )
        message_parts.append(
            "Fix instructions: address every item above in the actual source "
            "(do not skip, delete, or weaken a test, and do not suppress with "
            "@ts-ignore/type: ignore/any/except: pass). Re-run the failing "
            "command locally, confirm it is green, then finish the turn."
        )
        evidence_blob = "\n\n".join(evidence)
        message_parts.append("\nEvidence (real command output):\n" + evidence_blob[-6000:])

        followup = "\n\n".join(message_parts)
        print(json.dumps({"followup_message": followup}))
    except Exception:
        print(json.dumps({}))


if __name__ == "__main__":
    main()
