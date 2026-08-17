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
#
# The "rm" rule intentionally matches ANY invocation of rm — not just
# `-rf` — because the doctrine is "never hard delete", full stop. Flags
# (short, combined, separated, or long-form like --recursive --force) do
# not change that a plain `rm important.env` or `rm login.tsx` is still a
# permanent, unrecoverable delete. We only require that "rm" appears at a
# command boundary (start of the string, or right after a shell command
# separator: ; && || | or a newline, with optional leading whitespace) so
# we don't false-positive on substrings like "confirm" or "perform".
_CMD_BOUNDARY = r"(?:^|;|&&|\|\||\||\n)\s*"
DENY_RULES = [
    (
        re.compile(_CMD_BOUNDARY + r"rm\b"),
        lambda cmd: _deny(
            "Blocked rm (any invocation — hard deletes are never allowed).",
            "rm is blocked by policy, with or without flags. Archive "
            "instead: mv <path> .archive/<YYYY-MM-DD>/<path>",
        ),
    ),
    (
        re.compile(_CMD_BOUNDARY + r"rmdir\b"),
        lambda cmd: _deny(
            "Blocked a directory delete (rmdir).",
            "rmdir is blocked by policy. Archive instead: "
            "mv <path> .archive/<YYYY-MM-DD>/<path>",
        ),
    ),
    (
        re.compile(r"\bfind\b[^;&|\n]*(-delete\b|-exec\s+rm\b)"),
        lambda cmd: _deny(
            "Blocked find ... -delete / find ... -exec rm (bulk hard delete).",
            "find -delete and find -exec rm are blocked by policy — they "
            "are hard deletes with no rm needed to trigger this rule. "
            "Archive matched files instead, e.g. by moving them into "
            "mv -t .archive/<YYYY-MM-DD>/ <matches>.",
        ),
    ),
    (
        # xargs piping into rm/rmdir routes around the plain-rm command-boundary
        # rule above (the "rm" here never sits at a command boundary — it's an
        # argument to xargs). Flags between xargs and rm/rmdir are allowed
        # (xargs -0 rm -f, xargs -n1 rm, etc).
        re.compile(r"\bxargs\b(?:\s+-\S+)*\s+(rm|rmdir)\b"),
        lambda cmd: _deny(
            "Blocked xargs piping into rm/rmdir (hard delete).",
            "xargs ... rm/rmdir is blocked by policy — it is still a hard "
            "delete, just routed through xargs. Archive instead: "
            "mv <path> .archive/<YYYY-MM-DD>/<path>",
        ),
    ),
    (
        # Deletion via an interpreter's inline code string (python3 -c "...",
        # node -e "...") also routes around the plain-rm rule since there is
        # no shell "rm" token at all.
        re.compile(
            r"(?:^|\s)-(c|e)\s[\s\S]*?"
            r"\b(shutil\.rmtree|os\.remove|os\.unlink|os\.rmdir"
            r"|fs\.rmSync|fs\.rmdirSync|fs\.unlinkSync"
            r"|rmSync|rmdirSync|unlinkSync)\b"
        ),
        lambda cmd: _deny(
            "Blocked an inline interpreter delete (-c/-e script calling a filesystem-delete function).",
            "Calling shutil.rmtree / os.remove / os.unlink / os.rmdir / "
            "fs.rmSync / fs.rmdirSync / fs.unlinkSync from an inline -c or "
            "-e script is blocked by policy — it is still a hard delete. "
            "Archive instead: mv <path> .archive/<YYYY-MM-DD>/<path>",
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
        re.compile(r"\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b", re.IGNORECASE),
        lambda cmd: _deny(
            "Blocked a destructive SQL statement (DROP/TRUNCATE TABLE/DATABASE/SCHEMA).",
            "DROP/TRUNCATE TABLE, DATABASE, or SCHEMA is blocked by policy. "
            "Confirm explicitly with the user first, and prefer a "
            "reversible migration.",
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
    (
        # supabase db reset drops and recreates the database — against a
        # linked (real) project this destroys data outright, so it belongs
        # in the deny tier alongside git reset --hard / terraform destroy,
        # not the ask tier.
        re.compile(r"\b(?:npx\s+)?supabase\s+db\s+reset\b"),
        lambda cmd: _deny(
            "Blocked supabase db reset (destroys the database).",
            "supabase db reset is blocked by policy — against a linked "
            "project it destroys real data. Confirm explicitly with the "
            "user first.",
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
    (
        # Deploying a Supabase Edge Function (this repo calls
        # create-qr-session and invite-staff) replaces production behavior
        # for every user instantly, with no review step — same tier as
        # `vercel --prod`. `supabase db push` pushes schema changes against
        # the linked (real) project and belongs here too.
        re.compile(r"\b(?:npx\s+)?supabase\s+(?:functions\s+deploy|db\s+push)\b"),
        lambda cmd: _ask(
            "This will deploy a Supabase Edge Function or push schema changes to a real project.",
            "supabase functions deploy / supabase db push need explicit "
            "confirmation before running — they affect production "
            "instantly with no rollback step.",
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
