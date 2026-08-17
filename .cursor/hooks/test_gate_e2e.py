#!/usr/bin/env python3
"""Functional (end-to-end) tests for verify_gate.py.

Stdlib only, no pytest. Unit tests on regexes cannot catch the class of bug
this file exists to catch: `git status --porcelain` collapses a fully
untracked directory into a single entry ending in "/" with none of the
files inside it listed, so a hook that reads that output and skips
extension-less entries never scans anything inside a brand-new directory —
silently. The exact scenario an agent hits every time it creates a new
route/screen directory.

Each test builds a real throwaway git repository in a temp directory, runs
verify_gate.py as a real subprocess against it (so REPO_ROOT / os.getcwd()
inside the hook matches the temp repo, exactly like a real invocation), and
asserts on the real JSON it prints to stdout.

Run: python3 .cursor/hooks/test_gate_e2e.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
VERIFY_GATE_PATH = os.path.join(HOOKS_DIR, "verify_gate.py")

FAILURES = []


def sh(args, cwd, check=True):
    proc = subprocess.run(
        args, cwd=cwd, capture_output=True, text=True, timeout=60
    )
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"command failed: {args}\nstdout={proc.stdout}\nstderr={proc.stderr}"
        )
    return proc


def make_repo(tmp_dir: str) -> None:
    sh(["git", "init", "-q"], cwd=tmp_dir)
    sh(["git", "config", "user.email", "test@example.com"], cwd=tmp_dir)
    sh(["git", "config", "user.name", "Test"], cwd=tmp_dir)
    with open(os.path.join(tmp_dir, "README.md"), "w") as fh:
        fh.write("test repo\n")
    sh(["git", "add", "."], cwd=tmp_dir)
    sh(["git", "commit", "-q", "-m", "init"], cwd=tmp_dir)


def write_file(repo_dir: str, rel_path: str, content: str) -> None:
    abs_path = os.path.join(repo_dir, rel_path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)
    with open(abs_path, "w") as fh:
        fh.write(content)


def run_verify_gate(repo_dir: str, payload: dict):
    proc = subprocess.run(
        [sys.executable, VERIFY_GATE_PATH],
        cwd=repo_dir,
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=120,
    )
    stdout = proc.stdout.strip()
    try:
        parsed = json.loads(stdout) if stdout else None
    except Exception:
        parsed = None
    return proc.returncode, stdout, parsed, proc.stderr


def report(name: str, ok: bool, detail: str) -> None:
    status = "PASS" if ok else "FAIL"
    print(f"{status}: {name}")
    print(f"      {detail}")
    if not ok:
        FAILURES.append((name, detail))


def test_clean_repo_returns_empty():
    """A repo with zero changes (nothing staged, unstaged, or untracked)
    must return {} immediately — there is nothing to verify."""
    tmp_dir = tempfile.mkdtemp(prefix="gate_e2e_clean_")
    try:
        make_repo(tmp_dir)
        code, stdout, parsed, stderr = run_verify_gate(
            tmp_dir, {"status": "completed", "loop_count": 0}
        )
        ok = code == 0 and parsed == {}
        report(
            "clean repo (no changes) -> {}",
            ok,
            f"exit={code} stdout={stdout!r} stderr={stderr[:300]!r}",
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_loop_count_3_returns_empty():
    """loop_count >= 3 must short-circuit to {} before any git/diff/script
    work happens, even when the repo is genuinely dirty with real
    violations — the anti-loop budget is exhausted, not the violations."""
    tmp_dir = tempfile.mkdtemp(prefix="gate_e2e_loopcount_")
    try:
        make_repo(tmp_dir)
        # Dirty the repo with an obvious violation — loop_count >= 3 must
        # short-circuit before any of this is even inspected.
        write_file(
            tmp_dir,
            "dirty.ts",
            'console.log("should never be reached");\n// TODO: never checked\n',
        )
        code, stdout, parsed, stderr = run_verify_gate(
            tmp_dir, {"status": "completed", "loop_count": 3}
        )
        ok = code == 0 and parsed == {}
        report(
            "loop_count >= 3 (even with a dirty repo) -> {}",
            ok,
            f"exit={code} stdout={stdout!r} stderr={stderr[:300]!r}",
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_new_directory_is_scanned():
    """A file inside a brand-new, entirely untracked directory is scanned.

    Before the --untracked-files=all fix, `git status --porcelain`
    collapsed the whole new directory (apps/mobile/app/(main)/settings/)
    into one extension-less entry and the file inside it was never
    scanned, so this exact repro (placeholder comment + Alert.alert +
    `: any` + console.log() all in one new file) produced zero findings."""
    tmp_dir = tempfile.mkdtemp(prefix="gate_e2e_newdir_")
    try:
        make_repo(tmp_dir)
        rel_path = "apps/mobile/app/(main)/settings/subscription.tsx"
        content = (
            '// placeholder: RevenueCat purchases.getOfferings()\n'
            'const restore = () => Alert.alert("Coming soon");\n'
            "const data: any = null;\n"
            'console.log("subscription", data);\n'
        )
        write_file(tmp_dir, rel_path, content)
        # Deliberately left untracked (no `git add`) — this is exactly the
        # state right after an agent creates a new file/directory.
        code, stdout, parsed, stderr = run_verify_gate(
            tmp_dir, {"status": "completed", "loop_count": 0}
        )
        has_followup = isinstance(parsed, dict) and "followup_message" in parsed
        message = parsed.get("followup_message", "") if has_followup else ""
        expected_hits = [
            f"{rel_path}:1: placeholder comment",
            f"{rel_path}:2: forbidden pattern `Alert.alert(placeholder message)`",
            f"{rel_path}:3: forbidden pattern `: any`",
            f"{rel_path}:4: forbidden pattern `console.log(`",
        ]
        missing = [h for h in expected_hits if h not in message]
        ok = code == 0 and has_followup and not missing
        detail = (
            f"exit={code} has_followup={has_followup} missing={missing}\n"
            f"      stdout={stdout[:1500]!r}"
        )
        report(
            "new untracked directory's file is scanned and all 4 findings are reported with correct line numbers",
            ok,
            detail,
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_modified_file_reports_real_line_numbers():
    """A finding in a modified (tracked) file cites its real file line
    number.

    The line number must come from parsing the diff's `@@ -a,b +c,d @@`
    hunk header, not from enumerating the collected "+" lines — a file
    with a violation inserted deep in the file (line 15 of 21) must not be
    misreported as line 1 (the Nth-added-line-across-the-diff count)."""
    tmp_dir = tempfile.mkdtemp(prefix="gate_e2e_linenos_")
    try:
        make_repo(tmp_dir)
        original = "\n".join(f"const line{i} = {i};" for i in range(1, 21)) + "\n"
        write_file(tmp_dir, "src/big.ts", original)
        sh(["git", "add", "."], cwd=tmp_dir)
        sh(["git", "commit", "-q", "-m", "add big.ts"], cwd=tmp_dir)

        lines = original.splitlines()
        # Insert a real violation at file line 15 (1-indexed), far from the
        # top of the file, so a naive "Nth added line" count (which would
        # report line 1) is clearly wrong.
        lines.insert(14, 'console.log("deep in the file");')
        write_file(tmp_dir, "src/big.ts", "\n".join(lines) + "\n")

        code, stdout, parsed, stderr = run_verify_gate(
            tmp_dir, {"status": "completed", "loop_count": 0}
        )
        has_followup = isinstance(parsed, dict) and "followup_message" in parsed
        message = parsed.get("followup_message", "") if has_followup else ""
        expected = "src/big.ts:15: forbidden pattern `console.log(`"
        wrong = "src/big.ts:1: forbidden pattern `console.log(`"
        ok = code == 0 and has_followup and expected in message and wrong not in message
        report(
            "modified file cites the real file line number (15), not the added-line index (1)",
            ok,
            f"exit={code} has_followup={has_followup}\n      stdout={stdout[:1500]!r}",
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_green_repo_returns_empty():
    """A repo with real passing scripts and a clean diff returns {}.

    Proves the gate can PASS, not just fire: real (trivial, fast)
    typecheck/lint/test scripts that all succeed, plus a new file with no
    forbidden patterns, must not produce a false failure."""
    tmp_dir = tempfile.mkdtemp(prefix="gate_e2e_green_")
    try:
        make_repo(tmp_dir)
        write_file(
            tmp_dir,
            "package.json",
            json.dumps(
                {
                    "name": "gate-e2e-green",
                    "private": True,
                    "scripts": {
                        "typecheck": "true",
                        "lint": "true",
                        "test": "true",
                    },
                }
            ),
        )
        sh(["git", "add", "."], cwd=tmp_dir)
        sh(["git", "commit", "-q", "-m", "add package.json"], cwd=tmp_dir)

        write_file(tmp_dir, "src/index.ts", "export const answer = 42;\n")

        code, stdout, parsed, stderr = run_verify_gate(
            tmp_dir, {"status": "completed", "loop_count": 0}
        )
        ok = code == 0 and parsed == {}
        report(
            "green repo (real passing scripts, clean diff) -> {}",
            ok,
            f"exit={code} stdout={stdout!r} stderr={stderr[:800]!r}",
        )
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


TESTS = [
    test_clean_repo_returns_empty,
    test_loop_count_3_returns_empty,
    test_new_directory_is_scanned,
    test_modified_file_reports_real_line_numbers,
    test_green_repo_returns_empty,
]


def main() -> int:
    for test_fn in TESTS:
        test_fn()

    total = len(TESTS)
    passed = total - len(FAILURES)
    print(f"\n{passed}/{total} passed")

    if FAILURES:
        print("\nFAILURES:")
        for name, detail in FAILURES:
            print(f"  {name}\n    {detail}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
