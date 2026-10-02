# Slice 8b — mechanical determinism + the guard findings adjudicated in from 8a

Builder: `orchestrator-builder` (fresh context). Branch `Meisburg/onboarding`.
Base measured at `aa331d0` (the dispatch tip). This report is written FIRST and appended as produced.

**Scope, and where it came from.** The dispatch names two artifacts: `.scratch/v28/briefs/slice-8b.md`
(items 1 and 2 only — the trailing-newline sweep then its guard, and `scripts/slice-diff.sh`) **plus every
guard finding adjudicated in from slice 8a** (D-031, enumerated in `factory/work/v28-r2-8b.json`). This
document is `slice-8b` in that three-way split; the other two briefs are other slices (see the section
"What the three brief variants are for", below).

## The three brief variants — what each is for, and which is authoritative

| brief | subject | report | mine? |
|---|---|---|---|
| `slice-8b.md` | the ORIGINAL document: 219 lines, seven workstreams, ten top-level sections. Its own `⚠️ SCOPE CUT` header says **do only items 1 and 2** (newline sweep + its guard; `scripts/slice-diff.sh`) and that every other section "is someone else's turn". | this file | **YES — items 1 and 2, plus the inherited 8a guard findings from the dispatch.** |
| `slice-8b-2.md` | the TEST-HONESTY half: the Enter-key guard spec (item A), the failed-upload route-abort spec (item B), the two honesty fixes in `e2e/name-card-photo.e2e.ts` (item C). | `.scratch/v28/reports/slice-8b-2.md` | no |
| `slice-8b-3.md` | the CODE-FIX half: `useCropStep`'s `onConfirm` `\| void` (item A), the unguarded post-unmount effect (item B), the five honesty fixes slice 3's fix round left behind (item C). | `.scratch/v28/reports/slice-8b-3.md` | no |

**Authoritative for my scope:** `slice-8b.md` as constrained by its own SCOPE CUT (items 1 + 2), **plus** the
guard findings the dispatch explicitly registers here. The other two briefs are separate work items and I did
not touch their subjects — the only file they share with me is `scripts/guards/run-all.sh` (not protected),
which item 1 requires me to edit.

## Item table

*(appended as each item lands — symbol, re-measured line, change, proving command, raw result)*

### Item 1 — the trailing-newline sweep, then its guard, in that order

**Re-measured line numbers: none — this item has no line anchors. It has a COUNT, and the count was wrong
three ways in three documents.**

| source | count | scope | verdict |
|---|---|---|---|
| the dispatch | 65 | — | stale |
| `slice-8b.md` | 78 | `src/` 44, `e2e/` 21, `scripts/` 13 | stale breakdown |
| ledger's own correction | 79 | `src/` 44, `e2e/` 22, `scripts/` 13 | stale breakdown |
| **measured here at `aa331d0`** | **78** | **`src/` 45, `e2e/` 20, `scripts/` 13** | **used** |

Scope question, decided by measurement, not preference: the scan set is the repo's **code tree** —
`src/`, `e2e/`, `scripts/` (323 tracked files). Repo-wide over *all* tracked text files the number is **166**,
and the extra 88 are `.scratch/**` history (61), `supabase/migrations` (20), `docs/agents` + `.opencode/agents`
(9), and eight root files. Two of those root files are `vite.config.ts` and `playwright.config.ts`, which are
PROTECTED check configs: sweeping them would leave `config-guard` red against the merge-base forever, which is
the opposite of "the guard goes green after the sweep". The guard therefore states that boundary in its header
rather than pretending to a scope it does not read.

**Commit A — the sweep.**

```
$ node /tmp/sweep.mjs
files to sweep: 78
swept: 78
$ git show --stat --oneline HEAD | tail -1
 78 files changed, 78 insertions(+), 78 deletions(-)
$ git diff -w --stat          # whitespace-only proof
(empty)
$ git diff --numstat | awk '$1!=1 || $2!=1'
(empty)                        # every file is exactly +1/-1
```

Committed as: **`d75c5e9`** — `8b item 1, commit A: the trailing-newline sweep`. Exactly the 78 files; the
report you are reading was not in it (it was untracked at that moment).

**Commit B — the guard `scripts/guards/trailing-newline-guard.mjs` (+ its `.check.mjs`).**

Registered in BOTH hard-coded places in `scripts/guards/run-all.sh`: the `for guard in …` list and the
`run_check` block. `.check.mjs`, never `.test.mjs` (a top-level `process.exit()` in a `*.test.mjs` kills the
vitest run).

Pre-fix proof, run against the real pre-sweep tree (`git worktree add --detach /tmp/prefix-tree aa331d0`):

```
$ node scripts/guards/trailing-newline-guard.mjs /tmp/prefix-tree
  323 text file(s) read, 0 empty …, 0 binary …
  FINDING: e2e/address-maps.e2e.ts — no newline at end of file
  …
PRE-FIX EXIT=1
$ grep -c "FINDING:" /tmp/prefix.out
78
$ grep "FINDING:" /tmp/prefix.out | sed 's#.*FINDING: ##; s#/.*##' | sort | uniq -c
     20 e2e
     13 scripts
     45 src
```

The guard's own run on the swept tree, and its behavior checker (seed + mutation for the file rule AND for the
D-030 empty-scan rule):

```
$ node scripts/guards/trailing-newline-guard.mjs
  325 text file(s) read, 0 empty …, 0 binary …
PASS — the newline convention holds across the scan set.
GUARD EXIT=0
$ node scripts/guards/trailing-newline-guard.check.mjs
  ✓ a text file with no newline at EOF is CAUGHT and named
  ✓ MUTATION: dropping the last-byte test lets that seed PASS (so check 1 can fail)
  ✓ control: a text file WITH its newline passes
  ✓ control: an empty file and a binary file are counted, not read as text and not failed
  ✓ an EMPTY scan is a FINDING (D-030: zero is not health)
  ✓ MUTATION: dropping the empty-scan test lets that seed PASS (so check 4 can fail)
  ✓ an UNTRACKED text file is read (git --others, not just the index)
  ✓ control: a file OUTSIDE the scan set does not fire the rule
PASS — all 8 checks: the guard fires on the defect and only on it.
CHECK EXIT=0
```

Committed as: **see commit B below.**

