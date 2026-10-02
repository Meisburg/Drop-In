# Slice 6c — FIX ROUND 4 (V28 r2)

**Brief:** `.scratch/v28/briefs/slice-6c-fix-4.md` (authoritative for this round).
**Base:** `7fe7003`; the brief itself was committed at `9f20d02`, and the tree HEAD when this round started was `99d044f`.
**Round 3's slice commits:** `20773ee` + `b4a8b73`. Round-3 lanes: verifier PASS, reviewer NEEDS_CHANGES.
**This report was written first and appended to as evidence was produced** — the OOM convention the brief
requires.

**Machine state, not a finding.** Routed to cloud (`ollama-cloud/deepseek-v4.1-flash:cloud`) because the local
`strata-max` worker needs 30 GB VRAM and `ninfer-serve` holds the GPU. `strata-max` was never started and
`ninfer-serve` was never stopped; neither is reported as a finding.

**The three habits held.** No `rg -r` this round. Every shell needle went into a file and was passed with `-f`.
Every number, count and history fact below comes from the command quoted beside it, recorded in the same call
that produced it — and **no number is labelled `HEAD`**. Where a raw tail would have written a bare-`HEAD`
count, the label is rendered `<HEAD>` in this report and that is disclosed at the point of use: the rule this
round adds would otherwise fire on its own evidence, and that is the correct outcome, not a reason to weaken
the rule (see the N3 section).

---

## Per-finding table

Every row's proof is a command whose raw output is pasted below.

| # | Finding | Verdict | What changed | Command that proves it | Raw result |
|---|---|---|---|---|---|
| **B1 (BLOCKING)** | `.scratch/v28/reports/slice-6c-fix-3.md:526` is a NEW bare-`HEAD` count label | FIXED | the count now names the commit it was measured at (`71bdd55`); one line, no number changed | `git ls-tree -r --name-only 71bdd55 .scratch \| wc -l` and `… 20773ee … \| wc -l` | `276` and `277`. The round-3 report is itself the 277th tracked file, so the label was unreproducible by construction — the sentence is committed in the commit that moves the tree. After the edit `:526` reads `276 tracked `.scratch` files at 71bdd55 …`. |
| **N1** | `factory-guard.mjs:315`: a blank line inside a header truncates the `instrument-headers-honest` scan | FIXED | the header scan `continue`s past a blank line instead of treating it as "not a comment"; a behaviour seed for exactly that shape is added | the orchestrator's blank-line repro, run against the committed guard and the working guard | before (`git show 99d044f:scripts/guards/factory-guard.mjs`): `grep -c instrument-headers-honest` → `0`. After: `1`, finding at `zz-blank.mjs:4`. |
| **N2** | `factory-guard.mjs:347`: the `ok —` line claims a check it skipped | FIXED | the `ok —` line emits only the claims whose scan actually ran; a behaviour check plus a control are added | the orchestrator's root-with-no-`scripts/guards` scenario, re-run | the `ok —` line now ends `every floor meetable, every artifact present` — no header claim. The `note —` still discloses the skip. |
| **N3** | the class rule `no-bare-head-count` (the other half of B1) | FIXED | a new forward-only rule in `factory-guard.mjs` with a recorded baseline, registered in the header rule list and the `ok —` line; three behaviour checks | a `/tmp` root with a seeded label; `node scripts/guards/factory-guard.check.mjs` | seeded → `FINDING [no-bare-head-count]` and exit 1; baselined control → PASS; dated control → PASS. Baseline size `23` printed at run time. |
| **N4** | `.scratch/v28/reports/slice-6c-fix-3.md:129`: a `HEAD` identity label on a hash | FIXED | the trailing comment names `04921d8` instead of `HEAD`; the number it justifies is untouched | `node scripts/guards/regexp-escape-guard.check.mjs \| grep -c "^  [✓✗]"` | `12` — unchanged, so the label was the only edit. |
| **N5** | `.scratch/v28/reports/slice-6c-fix-3.md:16`: wording framing the brief's quotation as the brief's instruction | FIXED | `rejects the brief's own wording` → `rejects the brief's quotation of the old docstring, not the brief's instruction`, keeping the file's line count | `sed -n '16p'` on the report | now agrees with round-3's own N2 row at `:31` (**REJECTED as worded, FIXED as a claim**). |

`Nothing was rejected outright.` The N5 edit is a wording fix and the N4 number (12) reproduces, so no finding
was argued wrong.

### Report-label diffs (raw)

```
$ sed -n '16p;129p;526p' .scratch/v28/reports/slice-6c-fix-3.md
beside it, in the same call that recorded it. One finding **rejects the brief's quotation of the old docstring**, not the brief's
$ node scripts/guards/regexp-escape-guard.check.mjs | grep -c "^  [✓✗]"      # this run's check == 04921d8's check, same sha256
   276 tracked `.scratch` files at 71bdd55 — see the N1 table). Left alone and **correct as written**: it is
$ git diff --stat .scratch/v28/reports/slice-6c-fix-3.md
 .scratch/v28/reports/slice-6c-fix-3.md | 8 ++++----
 1 file changed, 4 insertions(+), 4 deletions(-)
```

(The B1 measurement, produced in the same call:)

```
$ git ls-tree -r --name-only 71bdd55 .scratch | wc -l
276
$ git ls-tree -r --name-only 20773ee .scratch | wc -l
277
$ git ls-tree -r --name-only 99d044f .scratch | wc -l
280
```

---

## N3 — `no-bare-head-count`

**The rule.** A count in a report or a brief must name the commit it was measured at. A count written as
`N … at HEAD` is unreproducible by construction: the commit that carries the sentence is the one that MOVES
`HEAD`, so the number was measured at one commit and read at another. This class has now cost four review
rounds.

**The seam.** `--root`, the same seam every other rule in this guard uses — so the rule is testable in a
throwaway root and never touches the repo when it is being checked. It reads `.scratch/v28/reports/` and
`.scratch/v28/briefs/` under the root, every `.md`, line by line.

**The match.**

```
/(?<![\d/.\w])\d+(?![/\d])\s+(?:[a-z`][\w`.-]*\s+){0,4}\bat (?:the )?HEAD\b/
```

a number, then at most four lowercase-looking words, then `at HEAD` or `at the HEAD`. It deliberately does NOT
match a number that comes AFTER the phrase (`… at HEAD the corpus reports 90 documents`), and it does not match
a ratio or path fragment (`5/6/8`) or a section number (`4.3`) — those were the two false-positive shapes in
the first draft.

**Forward-only, and the baseline.** `factory/decisions.md` D-011 item 2 rules that a historical record KEEPS
its original label — a record retro-edited to look always-right is not evidence. So the known occurrences are
recorded in `BARE_HEAD_BASELINE`, a `Map` keyed `file::matched-text` with a per-key count, and the rule fails
only when a file's running count for a key exceeds the recorded one. The baseline's size is printed at RUN TIME
on every invocation (a size typed into a header would go stale in this file's own text), so it can only shrink
by a deliberate edit.

**Printed baseline size: `23` recorded occurrences across `13` keys.** Raw, as printed by the guard:

```
  note — no-bare-head-count: baseline holds 23 recorded occurrence(s); a count labelled HEAD must not be added
```

The 13 keys (the matched label rendered `… at <HEAD>` here so this report is not itself a new occurrence):

| key | recorded |
|---|---|
| `.scratch/v28/briefs/slice-6c-fix-2.md :: 265 at <HEAD>` | 1 |
| `.scratch/v28/briefs/slice-6c-fix-3.md :: 265 at <HEAD>` | 2 |
| `.scratch/v28/briefs/slice-6c-fix-4.md :: 265 at <HEAD>` | 1 |
| `.scratch/v28/reports/slice-6c-fix-1-review.md :: 265 at <HEAD>` | 4 |
| `.scratch/v28/reports/slice-6c-fix-1-verify.md :: 265 at <HEAD>` | 1 |
| `.scratch/v28/reports/slice-6c-fix-2-review.md :: 265 at <HEAD>` | 4 |
| `.scratch/v28/reports/slice-6c-fix-2-review.md :: 271 at <HEAD>` | 1 |
| `.scratch/v28/reports/slice-6c-fix-2-review.md :: 439 at <HEAD>` | 1 |
| `.scratch/v28/reports/slice-6c-fix-2-verify.md :: 265 at <HEAD>` | 3 |
| `.scratch/v28/reports/slice-6c-fix-3-review.md :: 265 at <HEAD>` | 1 |
| `.scratch/v28/reports/slice-6c-fix-3-review.md :: 276 tracked `.scratch` files at <HEAD>` | 1 |
| `.scratch/v28/reports/slice-6c-fix-3-verify.md :: 265 at <HEAD>` | 1 |
| `.scratch/v28/reports/slice-6c-fix-3.md :: 265 at <HEAD>` | 2 |

Every one of the 23 is in another lane's file (a review/verify report), the orchestrator's brief, or the
round-3 builder report's own needle reproduction (`slice-6c-fix-3.md:87-89`) — **none is in `slice-6c-fix-4.md`,
because this report writes the label `<HEAD>` throughout, which the rule does not match.** D-011 item 2 keeps
them; the rule is forward-only over exactly that list.

### Seeded failure (a NEW occurrence in a `/tmp` root)

The seed is a report under a throwaway root — the label is written `<HEAD>` in this transcript for the reason
above; the seeded file itself carried the literal.

```
$ node scripts/guards/factory-guard.mjs --root /tmp/n3-new      # .scratch/v28/reports/zz-new.md holds the seeded label
Factory guard — the scheduler registry and the work state
===========================================================
  note — no scripts/guards under this root; instrument headers unchecked here
  note — no-bare-head-count: baseline holds 23 recorded occurrence(s); a count labelled HEAD must not be added
  FINDING [no-bare-head-count]: .scratch/v28/reports/zz-new.md:1: a count is labelled HEAD and cannot be reproduced — name the commit it was measured at: "276 tracked `.scratch` files at <HEAD>"

FAIL — 1 factory finding(s).
EXIT=1
```

### Baselined control (D-011 honoured)

A root whose report is a **recorded** occurrence — the same file::label as a baseline key — still passes:

```
$ node scripts/guards/factory-guard.mjs --root /tmp/n3-based     # .scratch/v28/reports/slice-6c-fix-1-review.md holds 265 at <HEAD>
  note — no scripts/guards under this root; instrument headers unchecked here
  note — no-bare-head-count: baseline holds 23 recorded occurrence(s); a count labelled HEAD must not be added
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every report and brief count naming the commit it was measured at

PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT=0
```

### Dated control (naming the commit passes)

```
$ node scripts/guards/factory-guard.mjs --root /tmp/n3-dated     # .scratch/v28/reports/zz-dated.md holds 276 … at 71bdd55
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every report and brief count naming the commit it was measured at
PASS
EXIT=0
```

### Exact behaviour-check output

```
  ✓ a typed count AFTER a blank line in the header is CAUGHT
  ✓ with no scripts/guards the summary does NOT claim the headers were checked
  ✓ with a scanned guard the summary DOES claim the headers were checked (control)
  ✓ a report labelling a count HEAD is CAUGHT
  ✓ a RECORDED historical label still passes (D-011 control)
  ✓ a report naming the commit it measured at passes (control)

factory-guard check: all 26 checks passed.
```

---

## N1 — the blank line inside a header (raw, before and after)

```
$ printf '#!/usr/bin/env node\n// first comment\n\n// all 9 checks passed after a blank line\nprocess.exit(0)\n' > /tmp/nb2/scripts/guards/zz-blank.mjs
$ node /tmp/before-guard-6c4.mjs --root /tmp/nb2 | grep -c instrument-headers-honest     # the committed guard (git show HEAD:…)
0
$ node scripts/guards/factory-guard.mjs --root /tmp/nb2 | grep -c instrument-headers-honest
1
$ node scripts/guards/factory-guard.mjs --root /tmp/nb2
  FINDING [instrument-headers-honest]: zz-blank.mjs:4: the header types a count of this instrument's own cases — print the count the run derives instead: "// all 9 checks passed after a blank line"
```

The same shape is now a permanent behaviour check (`a typed count AFTER a blank line in the header is CAUGHT`),
so the fix cannot silently regress.

## N2 — the `ok —` line claims only what it checked (raw)

```
$ node scripts/guards/factory-guard.mjs --root /tmp/nb-root      # factory/config.json, NO scripts/guards
Factory guard — the scheduler registry and the work state
===========================================================
  note — no scripts/guards under this root; instrument headers unchecked here
  note — no-bare-head-count: baseline holds 23 recorded occurrence(s); a count labelled HEAD must not be added
  note — no .scratch/v28/reports or briefs under this root; report and brief counts unchecked here
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present

PASS — the registry can be trusted and no work item claims evidence it does not have.
```

The `ok —` line ends at the two claims that were actually verified; the header claim is gone when no header
was scanned. The control (`with a scanned guard the summary DOES claim the headers were checked`) proves the
claim is not simply always dropped.

---

## Self-check: the rule against this report

The brief requires: grep this report for `at HEAD` before committing, and run the new rule's own pattern over
it. Raw below (line numbers are as of the run that produced this block; inserting this block shifts the ones
beneath it).

```
$ grep -n "at HEAD" .scratch/v28/reports/slice-6c-fix-4.md
66:`N … at HEAD` is unreproducible by construction: the commit that carries the sentence is the one that MOVES
80:a number, then at most four lowercase-looking words, then `at HEAD` or `at the HEAD`. It deliberately does NOT
81:match a number that comes AFTER the phrase (`… at HEAD the corpus reports 90 documents`), and it does not match
213:The brief requires: grep this report for `at HEAD` before committing, and run the new rule's own pattern over
304:  shape (a small count written just before the phrase, inside ordinary prose). That is the intended class — the brief asked for "a digit near `at HEAD`" —
$ echo $?
0
```

**Non-empty, and every hit is the phrase alone or a number AFTER it — none is the bare-`<HEAD>` count shape.**
The rule's own pattern over this same file, run in the same call, returns zero:

```
$ node -e '… the rule's /…/ against .scratch/v28/reports/slice-6c-fix-4.md …'
matches: 0
$ node scripts/guards/factory-guard.mjs            # the whole repo, this report included
  ok — 5 model(s), 8 task kind(s), 1 work item(s); every floor meetable, every artifact present, every instrument header stating only what it can point at, every report and brief count naming the commit it was measured at

PASS — the registry can be trusted and no work item claims evidence it does not have.
EXIT=0
```

The first draft of the "Risks" line below wrote its example with a number directly before the phrase, and the
rule's own pattern caught it (one match). The sentence was reworded; the rule was not weakened — which is the
outcome the brief asked for.

---

## `npm run verify` — measured numbers

```
> npm run build && npm run test && npm run lint && npm run a11y:focus && npm run steering-lint && npm run guards
```

| measure | value | delta vs the brief's `7fe7003` figure | accounted for |
|---|---|---|---|
| test files | `71 passed (71)` | `0` | no `.test.*` file is in this diff; the new checks are `.check.mjs` behaviour checks, run by `run-all.sh`, not discovered by vitest |
| tests | `2067 passed (2067)` | `0` | same reason — the run-time guard counter moved (`20` → `26`), but that counter is not a vitest test |
| lint warnings | `81` (`grep -c ': warning '`) | `0` | a first draft of the new regex used two unnecessary escapes (`\/`, `\-`) and measured `83`; both were removed before commit, so the final tree is back to the brief's `81` |
| lint errors | `0` (`grep -c ': error '`) | `0` | — |
| steering-lint | `AGENTS.md (1789 words, ceiling 1800)` | untouched | `AGENTS.md` was not edited |
| guards | `GUARDS: PASS` | — | `factory-guard.check.mjs` `26` run-time checks, `regexp-escape-guard.check.mjs` `12` |

`EXIT=0` for the whole `verify`.

### Raw verify tail

```
  ✓ the same root with honest headers passes (control)
  ✓ a typed count AFTER a blank line in the header is CAUGHT
  ✓ with no scripts/guards the summary does NOT claim the headers were checked
  ✓ with a scanned guard the summary DOES claim the headers were checked (control)
  ✓ a report labelling a count HEAD is CAUGHT
  ✓ a RECORDED historical label still passes (D-011 control)
  ✓ a report naming the commit it measured at passes (control)

factory-guard check: all 26 checks passed.

===========================================================
GUARDS: PASS — all deterministic rules hold.
```

---

## Counter agreement (the run-time counter vs an independent count)

```
$ node scripts/guards/factory-guard.check.mjs | tail -1
factory-guard check: all 26 checks passed.
$ grep -cE '^\s+check\(' scripts/guards/factory-guard.check.mjs
26
$ grep -c 'check(' scripts/guards/factory-guard.check.mjs          # incl. the `const check = …` definition
27
```

`26` (run time) == `26` (independent `check(` call lines); the `27` is the definition site, not a case.
`regexp-escape-guard.check.mjs`: `12` check lines, `all 12 checks passed`, map still `12`.

---

## Noticed and NOT fixed (each named with `file:line`)

1. **`scripts/guards/run-all.sh:44-51`** — the one-line description of `factory-guard` in the guard list does
   not enumerate the newer rules (`no-bare-head-count`, `agent-model-in-registry`,
   `independence-satisfiable`). It is a summary, not an enumeration, and the brief put the authoritative rule
   list in `factory-guard.mjs`, which is where it now lives. Left alone (same call as round 3's item 4).
2. **`scripts/guards/factory-guard.mjs`** (the new `checkReportHeadCounts`) — the scan covers
   `.scratch/v28/reports/` and `.scratch/v28/briefs/` only. A bare-`HEAD` count in
   `.scratch/v28/ledger.md`, `plan.md`, or an older-version lane is not scanned. The brief named
   the reports and briefs; widening the scope is the orchestrator's decision, not this slice's.
3. **`.scratch/v28/reports/slice-6c-fix-3.md:87-89`** — the round-3 report's `printf` needle and its echoed
   output both carry the label. They are a *reproduction of a needle*, not a measurement label, and D-011 item 2
   keeps them; they are 2 of the 23 baselined occurrences. Left alone.
4. **`.scratch/v28/reports/slice-6c-fix-3-review.md:36`** — the round-3 reviewer quotes B1's sentence verbatim
   (label intact). It is another lane's record; D-011 item 2 keeps it; it is 1 of the 23. Left alone.
5. **`.scratch/v28/briefs/slice-6c-fix-4.md:121`** — this round's own brief quotes the surviving label in its
   N3 instruction. It is the orchestrator's document; it is 1 of the 23. Left alone.
6. **`factory-guard.mjs`'s two extra lint warnings** (the first regex draft) are recorded here only so the
   `83 → 81` delta is accounted for; they were fixed before commit.

## Risks and ceilings (`ladder:`)

- **`ladder:` "tracked" is implemented as "present on disk under the root".** The brief said "scan tracked
  markdown". The guard's seam is `--root` and its behaviour check runs in git-less temp roots, so a
  `git ls-files` call would make the rule untestable through the seam it is checked with. In the real repo every
  `.scratch/v28/reports/*.md` and `.scratch/v28/briefs/*.md` is tracked, so the behaviour is equivalent there.
- **`ladder:` the baseline is count-aware per `file::matched-text`.** A new occurrence that is byte-identical
  to a baselined key *up to* that key's recorded count is not caught — a fifth `265-at-<HEAD>` in a file that
  already records four would fire, but four would not. This is the strictest forward-only form that keeps the
  historical records byte-identical (D-011 item 2); keying on line numbers would have shrunk on any unrelated
  edit above it.
- **`ladder:` the match is deliberately loose-ish.** It fires on a genuine new count-in-prose of the same
  shape (a small count written just before the phrase, inside ordinary prose). That is the intended class — the brief asked for "a digit near `at HEAD`" —
  and the baseline makes history free; a future builder writing legitimate prose of that shape must edit the
  baseline deliberately, which is the point.
- **`ladder:` the N2 fix conditions only the header and report claims.** `every floor meetable` and
  `every artifact present` remain unconditional even when there are zero work items or zero capability floors.
  Pre-existing, and outside this slice's scope.
