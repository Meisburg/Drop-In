"""Behavior test for scripts/check_ponytail_debt.py.

Per the factory's guard bar: "a guard that parses source should ship a test
proving the checker actually fires — a rule that silently stops matching is
worse than no rule." Each test seeds one defect class into a throwaway repo and
requires the exact exit code the guard promises.

    python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import check_ponytail_debt as cpd  # noqa: E402


class TempRepo(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def write(self, rel, body):
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
        return p


class CleanRepo(TempRepo):
    def test_no_markers_passes(self):
        self.write("app.py", "def f():\n    return 1\n")
        code, result = cpd.check(self.root)
        self.assertEqual(code, 0)
        self.assertEqual(result["markers"], 0)
        self.assertEqual(cpd.main(["--root", str(self.root)]), 0)


class GoodMarkers(TempRepo):
    def test_marker_with_trigger_passes(self):
        self.write("cache.py", "x = 1  # ponytail: global lock, per-account locks if throughput matters\n")
        self.assertEqual(cpd.main(["--root", str(self.root)]), 0)

    def test_slash_comment_counts(self):
        self.write("ui.js", "// ponytail: inline styles, extract a stylesheet when theming lands\n")
        code, result = cpd.check(self.root)
        self.assertEqual(code, 0)
        self.assertEqual(result["markers"], 1)

    def test_report_lists_the_ledger(self):
        self.write("a.py", "# ponytail: naive scan, index it when p95 passes 200ms\n")
        code, result = cpd.check(self.root)
        self.assertEqual(code, 0)
        self.assertTrue(result["ledger"][0]["has_trigger"])


class RottingMarkers(TempRepo):
    def test_marker_without_trigger_fails(self):
        self.write("cache.py", "x = 1  # ponytail: global lock\n")
        code, result = cpd.check(self.root)
        self.assertEqual(code, 1)
        self.assertEqual(result["no_trigger"], 1)
        self.assertIn("cache.py:1", result["findings"][0])
        # the gate must actually exit non-zero, not just report
        self.assertEqual(cpd.main(["--root", str(self.root)]), 1)

    def test_empty_marker_fails(self):
        self.write("x.py", "# ponytail:\n")
        self.assertEqual(cpd.main(["--root", str(self.root)]), 1)

    def test_report_mode_is_not_a_gate(self):
        self.write("cache.py", "# ponytail: global lock\n")
        self.assertEqual(cpd.main(["--root", str(self.root), "--report"]), 0)
        self.assertEqual(cpd.main(["--root", str(self.root), "--json"]), 1)


class NotMarkers(TempRepo):
    def test_prose_files_are_ignored(self):
        # A doc that explains the convention is not a deferral. Markdown headings
        # are `#` comments to a naive scanner, which is the false positive this
        # suffix rule exists to prevent.
        self.write("docs/notes.md", "# ponytail: this section only describes the convention\n")
        self.write("README.md", "// ponytail: also prose\n")
        code, result = cpd.check(self.root)
        self.assertEqual(code, 0)
        self.assertEqual(result["markers"], 0)

    def test_vendor_dirs_are_ignored(self):
        self.write("node_modules/pkg/bad.py", "# ponytail: vendored, no trigger here\n")
        self.assertEqual(cpd.main(["--root", str(self.root)]), 0)

    def test_marker_must_be_in_a_comment(self):
        self.write("app.py", 'MSG = "ponytail: this is a string, not a marker"\n')
        self.assertEqual(cpd.main(["--root", str(self.root)]), 0)


class JsonOutput(TempRepo):
    def test_json_is_parseable_and_status_matches(self):
        self.write("a.py", "# ponytail: no trigger\n")
        code, result = cpd.check(self.root)
        self.assertEqual(code, 1)
        payload = json.loads(json.dumps({"status": code, **result}))
        self.assertEqual(payload["status"], 1)
        self.assertEqual(payload["no_trigger"], 1)


if __name__ == "__main__":
    unittest.main()
