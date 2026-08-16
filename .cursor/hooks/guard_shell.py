#!/usr/bin/env python3
"""beforeShellExecution hook.

Reads a JSON payload from stdin with a "command" field and decides whether
the command should be allowed, denied, or should require the user's explicit
confirmation ("ask").

This hook must FAIL OPEN: any internal error results in {"permission":
"allow"} so a bug here never blocks legitimate work. Guardrails you can't
trust to fail safely are worse than no guardrails.
"""

import json
import re
import sys


def _deny(user_message: str, agent_message: str) -> dict:
    return {
        "permission": "deny",
        "user_message": user_message,
        "agent_message": agent_message,
    }


def _ask(user_message: str, agent_message: str) -> dict:
    return {
        "permission": "ask",
        "user_message": user_message,
        "agent_message": agent_message,
    }


def _allow() -> dict:
    return {"permission": "allow"}


# Each entry: (compiled regex, deny/ask factory taking the matched command)
DENY_RULES = [
    (
        re.compile(r"\brm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*)\b"),
        lambda cmd: _deny(
            "Blocked a recursive force-delete (rm -rf).",
            "rm -rf is blocked by policy. Archive instead: "
            "mv <path> .archive/<YYYY-MM-DD>/<path>",
        ),
    ),
    (
        re.compile(r"\brmdir\b"),
        lambda cmd: _deny(
            "Blocked a directory delete (rmdir).",
            "rmdir is blocked by policy. Archive instead: "
            "mv <path> .archive/<YYYY-MM-DD>/<path>",
        ),
    ),
    (
        re.compile(r"\bgit\s+push\b.*(--force(-with-lease)?\b|\s-f\b)"),
        lambda cmd: _deny(
            "Blocked a force push.",
            "git push --force (or -f / --force-with-lease) is blocked by "
            "policy. Confirm explicitly with the user before ever "
            "force-pushing.",
        ),
    ),
    (
        re.compile(r"\bgit\s+reset\s+--hard\b"),
        lambda cmd: _deny(
            "Blocked a hard reset (discards local work).",
            "git reset --hard is blocked by policy. Use git stash or a soft "
            "reset, or confirm explicitly with the user first.",
        ),
    ),
    (
        re.compile(r"\bgit\s+clean\s+.*-\w*[fd]\w*[fd]?\b"),
        lambda cmd: _deny(
            "Blocked git clean -fd (permanently deletes untracked files).",
            "git clean -fd is blocked by policy. Archive files you want to "
            "remove instead of deleting untracked work.",
        ),
    ),
    (
        re.compile(r"\bgit\s+rebase\b"),
        lambda cmd: _deny(
            "Blocked a git rebase (history rewrite).",
            "git rebase is blocked by policy. History rewrites need "
            "explicit user confirmation first.",
        ),
    ),
    (
        re.compile(r"\bgit\s+filter-branch\b|\bfilter-branch\b"),
        lambda cmd: _deny(
            "Blocked git filter-branch (history rewrite).",
            "filter-branch is blocked by policy. History rewrites need "
            "explicit user confirmation first.",
        ),
    ),
    (
        re.compile(r"(^|[\s;&|])sudo\b"),
        lambda cmd: _deny(
            "Blocked a sudo command.",
            "sudo is blocked by policy in this environment.",
        ),
    ),
    (
        re.compile(
            r"\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(bash|sh|zsh)\b"
        ),
        lambda cmd: _deny(
            "Blocked piping a remote script directly into a shell.",
            "Piping curl/wget output into bash/sh is blocked by policy. "
            "Download, inspect, then run explicitly.",
        ),
    ),
    (
        re.compile(r"\bchmod\s+777\b"),
        lambda cmd: _deny(
            "Blocked chmod 777 (world-writable permissions).",
            "chmod 777 is blocked by policy. Use the minimum permissions "
            "needed instead.",
        ),
    ),
    (
        re.compile(r"\bdd\s+if="),
        lambda cmd: _deny(
            "Blocked a raw dd if= disk/device operation.",
            "dd if= is blocked by policy — it can destroy a disk. Confirm "
            "explicitly with the user first.",
        ),
    ),
    (
        re.compile(r"\bmkfs(\.\w+)?\b"),
        lambda cmd: _deny(
            "Blocked mkfs (formats a filesystem).",
            "mkfs is blocked by policy. Confirm explicitly with the user "
            "first.",
        ),
    ),
    (
        re.compile(r":\(\)\s*\{\s*:\s*\|\s*:\s*&?\s*\}\s*;\s*:"),
        lambda cmd: _deny(
            "Blocked a fork bomb pattern.",
            "That command matches a fork-bomb pattern and is blocked.",
        ),
    ),
    (
        re.compile(r"\bdocker\s+system\s+prune\b.*-a\b"),
        lambda cmd: _deny(
            "Blocked docker system prune -a (deletes all unused images).",
            "docker system prune -a is blocked by policy. Confirm "
            "explicitly with the user first.",
        ),
    ),
    (
        re.compile(r"\bkubectl\s+delete\b"),
        lambda cmd: _deny(
            "Blocked kubectl delete.",
            "kubectl delete is blocked by policy. Confirm explicitly with "
            "the user first.",
        ),
    ),
    (
        re.compile(r"\bterraform\s+(apply|destroy)\b"),
        lambda cmd: _deny(
            "Blocked terraform apply/destroy.",
            "terraform apply/destroy is blocked by policy. Confirm "
            "explicitly with the user first.",
        ),
    ),
    (
        re.compile(r"\b(DROP|TRUNCATE)\s+TABLE\b", re.IGNORECASE),
        lambda cmd: _deny(
            "Blocked a destructive SQL statement (DROP/TRUNCATE TABLE).",
            "DROP/TRUNCATE TABLE is blocked by policy. Confirm explicitly "
            "with the user first, and prefer a reversible migration.",
        ),
    ),
    (
        re.compile(r"\baws\s+\S+\s+delete-[\w-]+"),
        lambda cmd: _deny(
            "Blocked a destructive AWS delete- command.",
            "aws ... delete-* commands are blocked by policy. Confirm "
            "explicitly with the user first.",
        ),
    ),
    (
        re.compile(r"\bnpm\s+publish\b"),
        lambda cmd: _deny(
            "Blocked npm publish.",
            "npm publish is blocked by policy. Confirm explicitly with the "
            "user first — publishing is irreversible.",
        ),
    ),
    (
        re.compile(
            r"\b(cat|type)\b[^|]*(\.env\b|id_rsa\b|\.pem\b)[^|]*\|\s*(curl|wget|nc|ncat|netcat)\b"
        ),
        lambda cmd: _deny(
            "Blocked piping a secret/key file into a network command.",
            "Piping .env, id_rsa, or .pem contents into curl/wget/nc is "
            "blocked by policy — this looks like credential exfiltration.",
        ),
    ),
]

ASK_RULES = [
    (
        re.compile(r"\bgit\s+push\b"),
        lambda cmd: _ask(
            "This will push to a remote branch.",
            "git push contacts a remote. Confirm with the user before "
            "proceeding.",
        ),
    ),
    (
        re.compile(r"\b(vercel|fly|netlify)\b.*\bdeploy\b|\bvercel\s+--prod\b"),
        lambda cmd: _ask(
            "This will deploy to a hosting provider.",
            "Deploys (vercel/fly/netlify) need explicit confirmation before "
            "running.",
        ),
    ),
    (
        re.compile(r"\bprisma\s+migrate\s+(deploy|reset)\b"),
        lambda cmd: _ask(
            "This will run a Prisma migration against a real database.",
            "prisma migrate deploy/reset needs explicit confirmation before "
            "running.",
        ),
    ),
]


def evaluate(command: str) -> dict:
    for pattern, factory in DENY_RULES:
        if pattern.search(command):
            return factory(command)
    for pattern, factory in ASK_RULES:
        if pattern.search(command):
            return factory(command)
    return _allow()


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        command = payload.get("command", "") or ""
        result = evaluate(command)
    except Exception:
        result = _allow()
    print(json.dumps(result))


if __name__ == "__main__":
    main()
