#!/usr/bin/env python3
"""check_ponytail_debt.py — harvest `ponytail:` markers, and fail the ones that will rot.

WHY THIS EXISTS
The builder is told to mark a deliberate simplification — a real corner cut on
purpose — with a `ponytail:` comment naming its ceiling and the upgrade trigger
(see `.opencode/agents/orchestrator-builder.md`, "The smallest diff that works").
That convention has exactly one silent failure mode: a marker that names no
trigger. It reads like diligence, and it means "later" with nothing that will
ever make later arrive. Ponytail's own debt skill tags these `no-trigger` and
names them as the ones that rot; this is that rule as a deterministic check, so
the convention cannot quietly become decoration.

WHAT IT CHECKS
  1. Every `ponytail:` marker in a source comment names an upgrade trigger
     (if / when / until / once / unless / after / revisit / upgrade / replace /
     switch).
  2. Nothing else. Markers in prose files are ignored on purpose — only `#` and
     `//` comments count, so a doc explaining the convention is not a marker.

USAGE
    python3 scripts/check_ponytail_debt.py [--root DIR] [--report] [--json]

    --report prints the harvested ledger (one row per marker) and exits 0. That is
    the view worth reading at the end of a batch: what did we defer, and does
    each deferral say what would end it?

EXIT
    0 = every marker names a trigger (or there are none)
    1 = findings (file:line, with the marker text)
    2 = the scan itself failed — a guard that cannot read its input must never
        report success
"""

from __future__ import annotations

import argparse
import json as jsonlib
import re
import sys
from pathlib import Path

MARKER = re.compile(r"(?P<lead>^|\s)(?P<intro>#|//)\s*ponytail:\s*(?P<text>.*)$")
TRIGGER = re.compile(
    r"\b(if|when|until|once|unless|after|before|revisit|upgrade|replace|switch)\b",
    re.I,
)
# Prose is not source: a markdown heading or a doc line is not a marker.
TEXT_SUFFIXES = {".md", ".mdx", ".rst", ".txt", ".adoc"}
SKIP_DIRS = {
    ".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build",
    ".next", ".cache", "vendor", "target", ".tox", ".mypy_cache", ".pytest_cache",
}


def _inside_string(line: str, pos: int) -> bool:
    """True when the character at `pos` sits inside a quoted string on this line.

    A marker written as a literal -- `self.write("x  # ponytail: ...")` in a test
    fixture, or a UI string that quotes the convention -- is not a comment. A guard
    that fires on those is a guard somebody switches off, so count unescaped quotes
    before the match: an odd count means we are inside one. Deterministic, per line,
    and it needs no parser.
    """
    for quote in ('"', "'", "`"):
        n, i = 0, 0
        while i < pos:
            if line[i] == "\\":
                i += 2
                continue
            if line[i] == quote:
                n += 1
            i += 1
        if n % 2:
            return True
    return False


def scan(root: Path):
    """-> (markers, errors). markers: list of (relpath, lineno, text)."""
    markers, errors = [], []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() in TEXT_SUFFIXES:
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        try:
            body = path.read_text(encoding="utf-8", errors="strict")
        except (UnicodeDecodeError, OSError):
            continue                      # binary or unreadable: not a comment carrier
        rel = path.relative_to(root).as_posix()
        for i, line in enumerate(body.splitlines(), start=1):
            m = MARKER.search(line)
            if m and not _inside_string(line, m.start("intro")):
                markers.append((rel, i, m.group("text").strip()))
    return markers, errors


def check(root: Path) -> tuple[int, dict]:
    try:
        markers, errors = scan(root)
    except OSError as e:
        return 2, {"error": f"scan failed: {e}"}

    findings = []
    for rel, line, text in markers:
        if not TRIGGER.search(text):
            findings.append(
                f"{rel}:{line}: marker names no upgrade trigger — "
                f"write `ponytail: <ceiling>, <trigger>`. Got: {text or '(empty)'!r}"
            )
    return (1 if findings else 0), {
        "markers": len(markers),
        "no_trigger": len(findings),
        "findings": findings,
        "ledger": [
            {"file": rel, "line": line, "text": text,
             "has_trigger": bool(TRIGGER.search(text))}
            for rel, line, text in markers
        ],
        "errors": errors,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fail `ponytail:` markers that name no upgrade trigger.")
    ap.add_argument("--root", default=None, help="repo root (default: the script's parent)")
    ap.add_argument("--report", action="store_true", help="print the harvested ledger, exit 0")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parent.parent
    code, result = check(root)

    if args.json:
        print(jsonlib.dumps({"status": code, **result}, indent=2))
        return code
    if code == 2:
        print(f"check_ponytail_debt: {result['error']}", file=sys.stderr)
        return 2

    if args.report:
        print(f"ponytail debt — {result['markers']} marker(s), {result['no_trigger']} with no trigger")
        print("=" * 59)
        for row in result["ledger"]:
            tag = "ok" if row["has_trigger"] else "NO-TRIGGER"
            print(f"  {row['file']}:{row['line']}  [{tag}]  {row['text']}")
        if not result["markers"]:
            print("  none — nothing deferred, or nothing marked")
        return 0

    print(f"ponytail debt — {result['markers']} marker(s), {result['no_trigger']} with no trigger")
    print("=" * 59)
    if result["findings"]:
        for f in result["findings"]:
            print(f"  FINDING: {f}")
        print()
        print("FAIL — a deferral with no trigger is a deferral that never ends.")
        return 1
    print("PASS — every deliberate simplification says what would end it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
