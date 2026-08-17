#!/usr/bin/env python3
"""afterFileEdit hook.

Reads a JSON payload from stdin with a "file_path" field, scans that file
for common secret patterns, and reports any findings with file:line context.

Must fail open: any internal exception results in {} (no finding reported),
because a scanner that can crash the whole edit flow is worse than no
scanner.
"""

import base64
import json
import os
import re
import sys

SKIP_SUFFIXES = (".example", ".sample", ".template")

# A raw JWT is only a *finding* if it's a real secret. Supabase's anon key is
# a JWT by construction, ships in client code on purpose (it's what
# EXPO_PUBLIC_SUPABASE_ANON_KEY holds), and is protected by RLS, not by
# secrecy — flagging it as a P0 secret is a false positive that trains
# people to ignore this scanner. We decode the JWT payload and check its
# "role" claim: an anon role is not a finding, a service_role (or anything
# else we can't positively identify as anon) still is.
JWT_ANON_LINE_HINTS = ("EXPO_PUBLIC_", "ANON_KEY")

# Substrings that make a matched line an obvious placeholder rather than a
# real secret, so it is skipped.
PLACEHOLDER_MARKERS = (
    "xxxx",
    "your_",
    "your-",
    "<your",
    "example",
    "placeholder",
    "changeme",
    "REPLACE_ME",
    "dummy",
    "fake",
    "0000000000",
    "1111111111",
)

FINDINGS = [
    (
        "AWS access key",
        re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b"),
    ),
    (
        "OpenAI-style secret key",
        re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"),
    ),
    (
        "Anthropic secret key",
        re.compile(r"\bsk-ant-[A-Za-z0-9\-_]{20,}\b"),
    ),
    (
        "GitHub token (ghp_/gho_/ghu_/ghs_/ghr_)",
        re.compile(r"\bgh[opusr]_[A-Za-z0-9]{30,}\b"),
    ),
    (
        "Private key block",
        re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"),
    ),
    (
        "Connection string with embedded password",
        re.compile(r"\b\w+://[^\s:@/]+:[^\s:@/]+@[^\s/]+"),
    ),
    (
        "Supabase service role key reference",
        re.compile(r"SUPABASE_SERVICE_ROLE(_KEY)?\s*[:=]\s*['\"]?[^\s'\"]{8,}", re.IGNORECASE),
    ),
    (
        "Raw JWT",
        re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    ),
    (
        "Stripe live secret key",
        re.compile(r"\bsk_live_[A-Za-z0-9]{10,}\b"),
    ),
    (
        "Stripe test secret key",
        re.compile(r"\bsk_test_[A-Za-z0-9]{10,}\b"),
    ),
    (
        "Stripe restricted key",
        re.compile(r"\brk_(live|test)_[A-Za-z0-9]{10,}\b"),
    ),
    (
        "Stripe webhook signing secret",
        re.compile(r"\bwhsec_[A-Za-z0-9]{10,}\b"),
    ),
    (
        "Slack token",
        re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    ),
    (
        "Twilio auth token",
        re.compile(r"\bAC[0-9a-fA-F]{32}\b"),
    ),
]

RAW_JWT_LABEL = "Raw JWT"


def should_skip_file(path: str) -> bool:
    lower = path.lower()
    for suffix in SKIP_SUFFIXES:
        if suffix in lower:
            return True
    return False


def is_placeholder_line(line: str) -> bool:
    lowered = line.lower()
    return any(marker.lower() in lowered for marker in PLACEHOLDER_MARKERS)


def _decode_jwt_role(token: str):
    """Best-effort decode of a JWT's payload segment to read its "role"
    claim. Returns 'anon', 'service_role', or None if the token can't be
    decoded or has no role claim we recognize."""
    parts = token.split(".")
    if len(parts) < 2:
        return None
    payload = parts[1]
    padded = payload + "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode(
            "utf-8", errors="ignore"
        )
    except Exception:
        return None
    if '"role":"anon"' in decoded or '"role": "anon"' in decoded:
        return "anon"
    if '"role":"service_role"' in decoded or '"role": "service_role"' in decoded:
        return "service_role"
    return None


def _is_anon_jwt_line(line: str, token: str) -> bool:
    if any(hint in line for hint in JWT_ANON_LINE_HINTS):
        return True
    return _decode_jwt_role(token) == "anon"


def scan_file(path: str):
    findings = []
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            lines = fh.readlines()
    except Exception:
        return findings

    for idx, line in enumerate(lines, start=1):
        if is_placeholder_line(line):
            continue
        for label, pattern in FINDINGS:
            match = pattern.search(line)
            if not match:
                continue
            if label == RAW_JWT_LABEL and _is_anon_jwt_line(line, match.group(0)):
                continue
            findings.append((label, idx, line.strip()[:160]))
    return findings


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        file_path = payload.get("file_path", "") or ""

        if not file_path or should_skip_file(file_path) or not os.path.isfile(file_path):
            print(json.dumps({}))
            return

        findings = scan_file(file_path)
        if not findings:
            print(json.dumps({}))
            return

        label, line_no, _snippet = findings[0]
        location = f"{file_path}:{line_no}"
        all_locations = ", ".join(
            f"{file_path}:{ln} ({lbl})" for lbl, ln, _ in findings
        )

        result = {
            "user_message": (
                f"Possible secret detected in {location} ({label}). "
                "Remove it and rotate the credential."
            ),
            "agent_message": (
                f"secret_scan found possible secrets: {all_locations}. "
                "Do not commit this. Remove the literal secret, move it to "
                "an environment variable / secrets manager, and rotate the "
                "credential if it was ever real."
            ),
        }
        print(json.dumps(result))
    except Exception:
        print(json.dumps({}))


if __name__ == "__main__":
    main()


