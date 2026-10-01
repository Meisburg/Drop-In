# Slice 6b — FIX ROUND 1 — builder report

**Committed as:** the single commit that introduces this file. A report cannot contain the hash
of the commit that creates it, so the sha7 is in the builder's return message from
`git log --oneline -1`.

**Scope:** the six dead locators (B1), the four smaller findings (B2/B3/B5/B6), and this report.
No `src/` file touched; no public interface changed.

---

## B1 — six dead locators, corrected to re-measured lines

`plan.md` did **not** move during this round: none of the edits below lives in `plan.md`, so
the reflow that orphaned the locators did not recur. Every locator was re-measured **after**
all edits, with `sed -n '<N>p' <file>` and `grep -n '<text>' <file>`.

| reference | before | after | how measured |
|---|---|---|---|
| `scripts/guards/check-acceptance-greps.mjs:16` | `plan.md:239` | `plan.md:241` | `grep -n 'A blanket `rg "of 5" src/` is NOT' plan.md` → `241:` |
| `scripts/guards/check-acceptance-greps.mjs:17` | `plan.md:300` | `plan.md:302` | `grep -n 'Measured today, `rg -n "middle name" src/`' plan.md` → `302:` |
| `scripts/guards/check-acceptance-greps.check.mjs:15` | `plan.md:239` | `plan.md:241` | as above |
| `.scratch/v28/briefs/slice-6b.md:21` | `plan.md:239` | `plan.md:241` | `sed -n '241p' plan.md` |
| `.scratch/v28/briefs/slice-6b.md:22` | `plan.md:300` | `plan.md:302` | `sed -n '302p' plan.md` |
| `.scratch/v28/briefs/slice-6b.md:30` | `plan.md:239` | `plan.md:241` | as above |
| `.scratch/v28/briefs/slice-6.md:55` | `plan.md:239` | `plan.md:241` | as above |
| `.scratch/v28/briefs/slice-6.md:56` | `plan.md:300` | `plan.md:302` | as above |

Six distinct dead locators across eight references (the guard header held two, the checker one,
the two briefs five).

After-edit evidence:

```
$ sed -n '241p' plan.md
  e2e/onboarding-resume.e2e.ts` → **0 hits**. ⚠️ **A blanket `rg "of 5" src/` is NOT
$ sed -n '302p' plan.md
    instance of the class slice 6's guard exists for. Measured today, `rg -n "middle name" src/`
$ sed -n '239p' plan.md
  src/components/FirstRunCard.tsx src/lib/firstRun.ts` → **0 hits**.
$ sed -n '300p' plan.md
    actionable.
$ grep -n 'A blanket `rg "of 5" src/` is NOT' plan.md
241:  e2e/onboarding-resume.e2e.ts` → **0 hits**. ⚠️ **A blanket `rg "of 5" src/` is NOT
440:  **quote the bad greps as defects**: `plan.md:241` ("⚠️ A blanket `rg "of 5" src/` is NOT
$ grep -n 'Measured today, `rg -n "middle name" src/`' plan.md
302:    instance of the class slice 6's guard exists for. Measured today, `rg -n "middle name" src/`
441:  [scoped]"), `plan.md:302` ("Measured today, `rg -n "middle name" src/` matches three files"),
```

`git grep -n 'plan.md:239\|plan.md:300'` now returns only the fix brief that *names* them and
the ledger (dated records, left alone). The guard/checker's two other live citations —
`slice-2.md:49` and `explore-r2-restructure.md:65` — were re-measured and are still correct:

```
$ sed -n '49p' .scratch/v28/briefs/slice-2.md
The plan's first acceptance was **`rg -n "middle name" src/` → 0 hits. That criterion is itself a
$ sed -n '65p' .scratch/v28/briefs/explore-r2-restructure.md
   - `rg -n "of 5" src/ e2e/`
```

## B2 — FIXED: `-H` without `-n` (the residual of this slice's own flag bug)

F1's comment detection strips the `path:line:` prefix, but only `-H` was forced. `rg -H` on a
single-file scope prints `f.ts:// a comment with zz` — **no line number** — so `contentOf()`
fails, `isComment` reads the raw `f.ts:// …` line, and a comment-only hit counts as a HIT.
Latent for the seven live claims (all carry `-n`), so the reviewer called it right: one flag over
from the `-H` bug this slice already fixed.

Fix: both `execFileSync('rg', …)` calls now force `-H -n`, and the `contentOf` comment says why
both are needed. Seed: checker case 10 — a comment-only hit with a doc command that carries no
`-n`. Pre-fix the seed is red for exactly the reason above:

```
  ✗ F1 holds when the claim command does NOT carry -n (the guard forces -H -n) — exit 1:
      - plan.md:1 — claim asserts 0 hit(s); the grep actually reports 1. The claim is false.
```

## B3 — FIXED (tightened): a `>` blockquote tag was admitted as a claim

The list-marker allowance included `>\s*`, so a line-leading tag inside a **quoted example**
in a blockquote was read as a claim. No live instance (the seven live claims use only whitespace,
`-`, or `N.` markers), but the boundary was slacker than the header said.

Fix: `TAG` drops the `>\s*` branch, and the header now states that `>` is deliberately **not** a
list marker here (leading whitespace stays, because the live `plan.md` claims are indented).
I chose to tighten rather than state-only because acceptance criterion 3 wants a checker case for
a changed rule, and a tightened regex is testable in exactly the reviewer's constructed shape.
Seed: checker case 11 — a blockquote `> ACCEPTANCE-GREP:` over a bare directory, plus one real
scoped claim; the quoted example must be ignored. Pre-fix it is read as a claim and rule 1 fires:

```
  ✗ a blockquote (`>`) line-leading tag is a QUOTATION, not a claim — exit 1:
      - plan.md:1 — scope `src/` is a bare directory — a zero over a directory cannot tell
        "the thing is gone" from "unrelated hits exist". Name the paths the claim is about.
```

## B4 — FIXED: the named false negative, corrected in the guard header

The prior builder named the false negative only in its (uncommitted) report, so there was no
on-disk text to edit; the reviewer's `:109-130` locator points into that report, which does not
exist in the tree. I put the corrected statement where a reader of the guard will find it — the
guard's own **WHAT IT IS NOT** prose boundary — with the corrected locator and the corrected
reason:

- locator: `.scratch/v28/reports/slice-2-review.md:38-39` (**not** `:35`) —
  `sed -n '38,39p'` shows `4. *Scoped zero-hit, two-sided* — … \`middle name|middle initial\` in` /
  `` `OnboardingPage.tsx` → **0 hits**; …``.
- it names **no backticked `rg` command** (so it is not a claim shape even if the tag were
  line-leading), and it is **out of corpus as well as mid-line** (the corpus is `plan.md` +
  `.scratch/v28/briefs/*.md`; a report is never read).
- its duplicate **IS tagged**: `sed -n '107p' .scratch/v28/briefs/slice-2.md` →
  `4. ACCEPTANCE-GREP: \`rg -n "middle name|middle initial" src/pages/OnboardingPage.tsx\` → **0 hits**, while`
  and `sed -n '306p' plan.md` → `    ACCEPTANCE-GREP: \`rg -n "middle name|middle initial" src/pages/OnboardingPage.tsx\``.

## B5 — FIXED: the no-bypass mechanism sentence

The header said *"The filter that skips git's own prose shapes (below) is the same filter that
makes the ordinary bypass invisible."* The checker's own premise proves the raw reflog contains
**no** `--no-verify` at all, so no filter is hiding anything. The conclusion stands; the
mechanism did not. New sentence: the plain case writes the flag nowhere, so the prose filter has
nothing to skip — that is why the common case is outside the check.

## B6 — FIXED (seeded): the second visibility path

The header named a wrapper-recorded reflog action text as a visible path, and no checker case
seeded it (FAST_PUSH_LOG and the unwired `hooksPath` were the proven two). I chose to **seed**
rather than demote. Checker case 3 records a wrapper action with `GIT_REFLOG_ACTION` (a real git
mechanism: the action text becomes `push-wrapper: git push --no-verify: <subject>`, which is not
one of git's prose shapes) and requires the guard to refuse:

```
  ✓ the HISTORY check fires on a WRAPPER-recorded reflog action text
```

The header now says the blind spot AND both visible paths are proven by the checker.

---

## Acceptance evidence

### `npm run verify` — exit 0

```
$ npm run verify ; echo exit=$?
> drop-in@0.0.0 build
> tsc -b && vite build
...
✓ built in 236ms
...
> drop-in@0.0.0 test
> vitest run
 Test Files  69 passed (69)
      Tests  2027 passed (2027)
...
> drop-in@0.0.0 lint
... (81 `warning` lines, 0 `error` lines)
> drop-in@0.0.0 a11y:focus
PASS — every control that suppresses its outline provides a focus cue
> drop-in@0.0.0 steering-lint
Steering-layer lint — 24 file(s)
...
GUARDS: PASS — all deterministic rules hold.
exit=0
```

### `run-all.sh` — exit 0 (both guards + both checkers registered and green)

```
===========================================================
GUARDS: PASS — all deterministic rules hold.
$ bash scripts/guards/run-all.sh ; echo exit=$?
exit=0
```

### The acceptance-grep guard, run directly — exit 0

```
$ node scripts/guards/check-acceptance-greps.mjs ; echo exit=$?
check-acceptance-greps: 90 planning document(s), 7 tagged claim(s), 97 untagged quotation line(s) ignored.
  ok   — plan.md:238 `rg -n "of 5" src/pages/OnboardingPage.tsx src/pages/LoginPage.tsx
  src/components/FirstRunCard.tsx src/lib/firstRun.ts` → 0 hit(s), observed 0.
  ok   — plan.md:240 `rg -n "first-run-photo-card" src/pages/OnboardingPage.tsx
  e2e/onboarding-resume.e2e.ts` → 0 hit(s), observed 0.
  ok   — plan.md:306 `rg -n "middle name|middle initial" src/pages/OnboardingPage.tsx` → 0 hit(s), observed 0.
  ok   — .scratch/v28/briefs/slice-1b-r2.md:81 `rg -n "of 5" src/pages/OnboardingPage.tsx src/pages/LoginPage.tsx src/components/FirstRunCard.tsx src/lib/firstRun.ts` → 0 hit(s), observed 0.
  ok   — .scratch/v28/briefs/slice-1b-r2.md:82 `rg -n "first-run-photo-card" src/pages/OnboardingPage.tsx e2e/onboarding-resume.e2e.ts` → 0 hit(s), observed 0.
  ok   — .scratch/v28/briefs/slice-1b-r2.md:83 `rg -n "hasPhoto"
  src/App.tsx src/pages/OnboardingPage.tsx src/lib/avatarUrl.test.ts e2e/onboarding-resume.e2e.ts` → 0 hit(s), observed 0.
  ok   — .scratch/v28/briefs/slice-2.md:107 `rg -n "middle name|middle initial" src/pages/OnboardingPage.tsx` → 0 hit(s), observed 0.
clean — every tagged acceptance claim names a path and matches the tree.
exit=0
```

### The acceptance-grep checker, run directly — 14/14, exit 0

```
$ node scripts/guards/check-acceptance-greps.check.mjs ; echo exit=$?
  ✓ the real plan.md + briefs pass
  ✓ the real run read a non-zero number of tagged claims (it matched something)
  ✓ an untagged quotation of a bad grep is IGNORED (the tag is the boundary)
  ✓ a zero claim over a BARE DIRECTORY fails (rule 1, isolated)
  ✓ a scoped zero claim whose grep reports hits fails (rule 2, isolated)
  ✓ the recorded `rg "of 5" src/` → 0-hits fixture FAILS
  ✓ the recorded `rg "hasPhoto" src/` → 0-hits fixture FAILS
  ✓ F1 — a zero claim whose only hit is a COMMENT passes (a removal note is not a hit)
  ✓ F1 — the same claim with the mention in CODE fails (the exemption is not a loophole)
  ✓ a corpus with NO tagged claims FAILS (an instrument that matches nothing is not a pass)
  ✓ a tagged claim with no SCOPE fails (nothing to check is not a pass)
  ✓ a tagged claim with no COUNT fails (a claim that cannot be read is not one that holds)
  ✓ F1 holds when the claim command does NOT carry -n (the guard forces -H -n)
  ✓ a blockquote (`>`) line-leading tag is a QUOTATION, not a claim
check-acceptance-greps check: all 14 checks passed.
exit=0
```

### The no-bypass guard, run directly — exit 0

```
$ bash scripts/guards/no-bypass-guard.sh ; echo exit=$?
No-bypass guard — git hook enforcement
===========================================================
  ok — core.hooksPath = scripts/git-hooks
  ok — scripts/git-hooks/pre-push exists and is executable
  COVERAGE: HISTORY reads the reflog's action text and FAST_PUSH_LOG, never a command line.
    A plain 'git commit --no-verify' leaves no trace this check can read, so the PASS/FAIL
    below is NOT evidence about the flag — only a wrapper-recorded bypass or a FAST_PUSH_LOG
    line is visible (see scripts/guards/no-bypass-guard.check.mjs).

PASS — git hook enforcement is intact.
exit=0
```

### The no-bypass checker, run directly — 6/6, exit 0

```
$ node scripts/guards/no-bypass-guard.check.mjs ; echo exit=$?
  ✓ premise: the seeded commit was made with --no-verify and git kept no trace of the flag
  ✓ THE BLIND SPOT: the guard reports PASS on a repo where --no-verify was used
  ✓ the guard STATES its coverage in the run (the PASS does not read as evidence about the flag)
  ✓ the HISTORY check still fires on a bypass it CAN see (FAST_PUSH_LOG)
  ✓ the HISTORY check fires on a WRAPPER-recorded reflog action text
  ✓ the STATIC check still fires when core.hooksPath is unwired
no-bypass-guard check: all 6 checks passed (the stated blind spot is proven, not asserted).
exit=0
```

### Criterion 3 — the two new rules' seeds fail against the pre-fix guard

`git show HEAD:scripts/guards/check-acceptance-greps.mjs` was temporarily put back as the guard,
the new checker was run against it, and the guard was restored (md5 equal afterwards):

```
  ✗ F1 holds when the claim command does NOT carry -n (the guard forces -H -n) — exit 1:
      - plan.md:1 — claim asserts 0 hit(s); the grep actually reports 1. The claim is false.
  ✗ a blockquote (`>`) line-leading tag is a QUOTATION, not a claim — exit 1:
      - plan.md:1 — scope `src/` is a bare directory — a zero over a directory cannot tell
        "the thing is gone" from "unrelated hits exist". Name the paths the claim is about.
check-acceptance-greps check: 2 of 14 check(s) failed — the guard is not doing its job.
exit=1
```

### Files changed

```
 .scratch/v28/briefs/slice-6.md                  |  4 +--
 .scratch/v28/briefs/slice-6b.md                 |  6 ++--
 scripts/guards/check-acceptance-greps.check.mjs | 44 +++++++++++++++++++++++--
 scripts/guards/check-acceptance-greps.mjs       | 33 +++++++++++++------
 scripts/guards/no-bypass-guard.check.mjs        | 27 ++++++++++++---
 scripts/guards/no-bypass-guard.sh               | 20 ++++++-----
 .scratch/v28/reports/slice-6b-fix-1.md          | (this file)
```

---

## Anything the brief did not anticipate

1. **The quotation count is 97, not the recorded 95.** The difference is the fix-round brief
   itself: `slice-6b-fix-1.md` is in the briefs corpus and its two `rg`-mention lines are counted
   as quotations. The verifier measured 95 at `09d9af5`, before the orchestrator committed that
   brief; at HEAD the corpus reports 90 documents / 7 claims / 97 quotations. Nothing regressed —
   the boundary grew with the corpus.

2. **B4 had no on-disk target.** The false negative was named only in the prior builder's
   uncommitted report (the reviewer's `:109-130` points there), so I fixed it in the guard's own
   boundary prose. If the orchestrator wants it in the ledger instead, that is a one-line move —
   the ledger was left untouched per the brief's "dated records stay" rule.

3. **A `>`-marker `ACCEPTANCE-GREP` line is now a quotation, not just "stated".** Tightening the
   regex was slightly more than "say so", but it is the rule the header already claimed and it
   gives criterion 3 its seed.

## Risks

- `ladder:` I considered building the reviewer's routed "live-vs-dated `file.md:NNN` citation
  check" (the class this fix round is an instance of) and did **not**: the honest version needs a
  live-versus-dated distinction the brief did not authorize, and a half-built version would be
  new surface. It stays a named future item.
- The B4 note in the guard header adds new `file:line` citations
  (`slice-2-review.md:38-39`, `slice-2.md:107`, `plan.md:306`) to a file that nothing checks for
  staleness. They are correct at this commit; that is exactly the class the reviewer routed.
- Pre-existing: `run-all.sh`'s comment still says "the two checkers" when there are seven —
  outside this slice's subject, left untouched, named here.
