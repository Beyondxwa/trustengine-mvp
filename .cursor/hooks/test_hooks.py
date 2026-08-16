#!/usr/bin/env python3
"""Dependency-free regression tests for secret_scan.py and verify_gate.py.

Stdlib only, no pytest. Exercises scan_file() from secret_scan.py (via
temp files) and scan_line_for_placeholders() from verify_gate.py directly.
Prints PASS/FAIL per case and exits 1 if any case fails.

Run: python3 .cursor/hooks/test_hooks.py
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import secret_scan  # noqa: E402
import verify_gate  # noqa: E402

FAILURES = []

# --- secret_scan.py: JWT anon-key false positive (bug 1) -------------------

ANON_JWT_ENV_LINE = (
    "EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0.Xy7bQ2f9KmZ"
)
ANON_JWT_FALLBACK_LINE = (
    "const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "
    "'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0.Xy7bQ2f9KmZ';"
)
SERVICE_ROLE_JWT_LINE = (
    "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUifQ.Xy7bQ2f9KmZ"
)

# --- secret_scan.py: missing token families (bug 2) -------------------------

SECRET_SCAN_CASES = [
    (ANON_JWT_ENV_LINE, False, "Supabase anon key in env var form must NOT be flagged"),
    (ANON_JWT_FALLBACK_LINE, False, "Supabase anon key in a JS fallback expression must NOT be flagged"),
    (SERVICE_ROLE_JWT_LINE, True, "Supabase service_role JWT must still be flagged"),
    ("const key = 'sk_test_4eC39HqLyjWDarjtT1zdp7dc00000abc';", True, "Stripe sk_test_ key must be flagged"),
    ("const key = 'rk_live_4eC39HqLyjWDarjtT1zdp7dc00000abc';", True, "Stripe rk_live_ key must be flagged"),
    ("const key = 'rk_test_4eC39HqLyjWDarjtT1zdp7dc00000abc';", True, "Stripe rk_test_ key must be flagged"),
    ("const token = 'xoxb-1234567890-abcdefghijklmnop';", True, "Slack xoxb- token must be flagged"),
    ("const token = 'xoxp-1234567890-abcdefghijklmnop';", True, "Slack xoxp- token must be flagged"),
    ("const token = 'gho_16C7e42F292c6912E7710c838347Ae178B4a';", True, "GitHub gho_ token must be flagged"),
    ("const token = 'ghu_16C7e42F292c6912E7710c838347Ae178B4a';", True, "GitHub ghu_ token must be flagged"),
    ("const token = 'ghs_16C7e42F292c6912E7710c838347Ae178B4a';", True, "GitHub ghs_ token must be flagged"),
    ("const token = 'ghr_16C7e42F292c6912E7710c838347Ae178B4a';", True, "GitHub ghr_ token must be flagged"),
    ("const token = 'ghp_16C7e42F292c6912E7710c838347Ae178B4a';", True, "GitHub ghp_ token (pre-existing) must still be flagged"),
]


def check_secret_scan(line: str, should_flag: bool, description: str) -> None:
    fd, path = tempfile.mkstemp(suffix=".ts")
    try:
        with os.fdopen(fd, "w") as fh:
            fh.write(line)
        findings = secret_scan.scan_file(path)
        flagged = bool(findings)
        ok = flagged == should_flag
        status = "PASS" if ok else "FAIL"
        print(f"{status}: expect_flag={should_flag!s:<5} got_flag={flagged!s:<5} | {description}")
        print(f"      line={line!r}")
        if findings:
            print(f"      findings={findings}")
        if not ok:
            FAILURES.append((description, line, should_flag, flagged, findings))
    finally:
        if os.path.exists(path):
            os.unlink(path)


# --- verify_gate.py: quoted-string / comment false positives (bug 3) -------

VERIFY_GATE_CASES = [
    (
        "// this endpoint returns: any shape the server sends",
        ": any",
        False,
        "`: any` inside a // comment is prose, must NOT be flagged",
    ),
    (
        'logger.info("no console.log( in prod");',
        "console.log(",
        False,
        "`console.log(` inside a string literal must NOT be flagged",
    ),
    (
        "const foo: any = bar();",
        ": any",
        True,
        "a real `: any` type annotation must still be flagged",
    ),
    (
        "console.log('debug');",
        "console.log(",
        True,
        "a real console.log( call must still be flagged",
    ),
]


def check_verify_gate(line: str, label: str, should_flag: bool, description: str) -> None:
    findings = []
    verify_gate.scan_line_for_placeholders(line, "test.ts", 1, findings)
    flagged = any(f"`{label}`" in f for f in findings)
    ok = flagged == should_flag
    status = "PASS" if ok else "FAIL"
    print(f"{status}: expect_flag={should_flag!s:<5} got_flag={flagged!s:<5} | {description}")
    print(f"      line={line!r}")
    if findings:
        print(f"      findings={findings}")
    if not ok:
        FAILURES.append((description, line, should_flag, flagged, findings))


def main() -> int:
    print("=== secret_scan.py: JWT role-awareness + new token families ===")
    for line, should_flag, description in SECRET_SCAN_CASES:
        check_secret_scan(line, should_flag, description)

    print("\n=== verify_gate.py: quoted-string / comment awareness ===")
    for line, label, should_flag, description in VERIFY_GATE_CASES:
        check_verify_gate(line, label, should_flag, description)

    total = len(SECRET_SCAN_CASES) + len(VERIFY_GATE_CASES)
    passed = total - len(FAILURES)
    print(f"\n{passed}/{total} passed")

    if FAILURES:
        print("\nFAILURES:")
        for description, line, should_flag, flagged, findings in FAILURES:
            print(
                f"  {description}\n"
                f"    line={line!r} expected_flag={should_flag} got_flag={flagged} findings={findings}"
            )
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
