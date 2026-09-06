#!/usr/bin/env python3
"""CAS PDF -> JSON bridge for Ledger's CAS import (Portfolio Adoption Plan,
2026-09-05). Thin wrapper over `casparser.read_cas_pdf` — all real parsing
logic lives in that library; this script only exists so Node can invoke it
as a local subprocess (Import Privacy, AGENTS.md rule #23: parsing stays on
this machine, never an external API call).

Usage: python3 cas_parser.py <pdf_path> <password>

Prints the parsed CAS as JSON to stdout on success. On failure, prints a
one-line error to stderr and exits non-zero — distinguishing a wrong
password from any other parse failure via a distinct exit code, since the
caller (Node) needs to tell those apart (PasswordRequiredError vs. a
generic parse error).
"""

import sys

EXIT_OK = 0
EXIT_BAD_PASSWORD = 2
EXIT_PARSE_ERROR = 3

def main() -> int:
    if len(sys.argv) != 3:
        print("usage: cas_parser.py <pdf_path> <password>", file=sys.stderr)
        return EXIT_PARSE_ERROR

    pdf_path, password = sys.argv[1], sys.argv[2]

    try:
        import casparser
    except ImportError:
        print(
            "casparser is not installed — run `pnpm install` to set it up automatically "
            "(scripts/setup-python.mjs), or `pip install -r scripts/requirements.txt` manually",
            file=sys.stderr,
        )
        return EXIT_PARSE_ERROR

    try:
        result_json = casparser.read_cas_pdf(pdf_path, password, output="json")
    except Exception as exc:  # casparser raises its own exception types;
        # caught broadly since the only thing Node needs is "bad password"
        # vs. "anything else" — the exact exception class isn't surfaced
        # to the user either way (services/casImport.ts's own error mapping
        # never shows a raw parser message, same posture as every other
        # import adapter in this codebase).
        message = str(exc).lower()
        if "password" in message:
            print(str(exc), file=sys.stderr)
            return EXIT_BAD_PASSWORD
        print(str(exc), file=sys.stderr)
        return EXIT_PARSE_ERROR

    sys.stdout.write(result_json)
    return EXIT_OK

if __name__ == "__main__":
    sys.exit(main())
