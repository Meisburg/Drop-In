# Slice 6c — the escape dedupe + the guard's false COVERAGE echo — builder report

**Committed as:** `ce3479c` — the commit that introduces this file, from
`git log --oneline --diff-filter=A -- .scratch/v28/reports/slice-6c.md` (the `--diff-filter=A`
matters: a bare `-1` on this path returns the *pin* commit below, because the pin also touches the
file). A file cannot name the commit that creates it, so the id was written in by the pin commit that
immediately follows this one (slice 6b's convention, done in-slice instead of deferred to a micro
round).

**Scope:** the regex-escape one-liner deduplicated from five copies to one, the drift guard that
keeps it at one, and the one appended line of guard OUTPUT that still printed a false claim.
No public interface changed; `firstRunTour.ts` exports one fewer name (see below).

---

## 1. The enumeration, reproduced — and the SECOND false zero I hit while reproducing it

**Before: FIVE copies, and the brief's list is exactly right.** Reproduced with the pattern the
brief used, `--fixed-strings`, plus a positive control first (does the instrument match a copy I
know is there?), because a false zero from a broken instrument is this batch's recurring failure:

```
$ PAT='[.*+?^${}()|[\]\\]/g'
$ printf '%s' "$PAT" | od -c | head -2      # proof the pattern survived the shell
0000000   [   .   *   +   ?   ^   $   {   }   (   )   |   [   \   ]   \
0000020   \   ]   /   g

$ grep -n --fixed-strings -- "$PAT" src/lib/firstRunTour.ts     # POSITIVE CONTROL
301:  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

$ git grep -n --fixed-strings -- "$PAT" -- .
e2e/place-directory-in-new.e2e.ts:109:  await expect(placeInput).toHaveValue(new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
e2e/weekly-series.e2e.ts:90:  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
scripts/guards/stale-locator-guard.mjs:202:  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
scripts/guards/vacuous-absence-guard.mjs:243:        .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
src/lib/firstRunTour.ts:301:  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
$ git grep --fixed-strings -- "$PAT" -- . | wc -l
5
```

| # | Site | Form |
|---|---|---|
| 1 | `src/lib/firstRunTour.ts:301` | the canonical exported `escapeForRegExp` |
| 2 | `e2e/weekly-series.e2e.ts:90` | a private function of the same name |
| 3 | `e2e/place-directory-in-new.e2e.ts:109` | inline, inside a `new RegExp(...)` |
| 4 | `scripts/guards/stale-locator-guard.mjs:202` | inline, `const escaped = text.replace(...)` |
| 5 | `scripts/guards/vacuous-absence-guard.mjs:243` | inline, inside a `.map()` |

### ⚠️ The instrument I inherited produced a SECOND false zero — and this one is the batch's lesson

I ran the *same* `git grep` command right after making the edits and it printed **`0`**:

```
$ git grep --fixed-strings -- "$PAT" -- . | wc -l
0
```

**That zero was a lie, and not because the pattern was mangled.** `git grep` only searches files git
knows about — and the one surviving copy was in a file I had just created and not yet staged. The
correct instrument for "how many copies are in the tree" must see untracked files:

```
$ git grep --untracked --fixed-strings -- "$PAT" -- . | wc -l
1
$ grep -rn --fixed-strings --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.mjs' -- "$PAT" .
./.scratch/guard-a03fc54.mjs:635:const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
./src/lib/escapeForRegExp.mjs:37:  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
```

**⚠️ CORRECTION — added in fix round 1, post-verification. The `1` above no longer reproduces, and
its successor number is NOT a copy count.** The reviewer found the report presenting that command's
output as the after-count while it had already become false, and the builder's warning about it
lived only in a return message — ephemeral — and reached neither this report nor a commit message.
**So the authoritative instrument is named here, in the artifact: `node
scripts/guards/regexp-escape-guard.mjs`, which reports exactly one hit in code (the implementation at
`src/lib/escapeForRegExp.mjs:37`, exit 0).** Re-running the `git grep` above counts *this report's own
prose*, because the pattern is quoted whenever it is discussed:

```
$ git grep --untracked --fixed-strings -- "$PAT" -- . | cut -d: -f1 | sort | uniq -c | sort -rn
     14 .scratch/v28/reports/slice-6c.md
      1 src/lib/escapeForRegExp.mjs
      1 docs/agents/code-structure.md
```

Fourteen of them are the places this report writes the pattern out to discuss it, and one is the prose
quotation in `docs/agents/code-structure.md`'s "The one-copy rule" section — `.md` is not in the guard's
extension list, so that is not a code hit. Measured in fix round 1 with the needle written to a file and
matched with `git grep --untracked -F -f <needle-file> -- .` rather than put on a command line; the code
trees alone — `-- src e2e scripts supabase` — return **1**.

**Do not quote a total from that command, including the one above: it grows by one every time the pattern
is written down anywhere, including in the sentence that explains it.** The breakdown was re-measured twice
inside fix round 1 and moved (15 report hits and no docs hit, then 14 plus one docs hit, then this file's
own paste of the pattern) — which is the drift this correction exists to name. The only stable figure is
the guard's: **one hit, in `src/lib/escapeForRegExp.mjs`, exit 0**. The two guard files hold **zero** raw
hits — they write it split or escaped so the detector cannot count itself. **Read the guard's number, not
this command's.**

**Both instruments agree on the truth: one copy in repo code.** `--untracked` respects `.gitignore`
and sees the new file; the raw `grep -r` additionally surfaces one occurrence in gitignored scratch.

**The guard I added uses an `fs` walk, not `git grep`, for exactly this reason** — a `git`-based
detector would have reported a clean tree for an unstaged sixth copy.

---

## 2. The count, before and after — every survivor named with its reason

- **Before: 5** (all in tracked repo code; the brief's table confirmed exactly).
- **After: 1.**

| # | After | Reason it survives |
|---|---|---|
| 1 | `src/lib/escapeForRegExp.mjs:37` | **The single implementation.** Every other site now imports it. |

**No other survivors.** The four non-canonical sites were converted, each to one import plus one
call — and the old and new expressions are byte-identical in effect:

```
$ git show HEAD:src/lib/firstRunTour.ts | grep -n 'return value.replace'
301:  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
$ grep -n 'return value.replace' src/lib/escapeForRegExp.mjs
37:  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

$ git show HEAD:e2e/weekly-series.e2e.ts | sed -n '90p'
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
$ git show HEAD:e2e/place-directory-in-new.e2e.ts | sed -n '109p'
  await expect(placeInput).toHaveValue(new RegExp(firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
$ grep -n 'escapeForRegExp' e2e/place-directory-in-new.e2e.ts
40:import { escapeForRegExp } from '../src/lib/escapeForRegExp.mjs'
110:  await expect(placeInput).toHaveValue(new RegExp(escapeForRegExp(firstName)))

$ git show HEAD:scripts/guards/vacuous-absence-guard.mjs | sed -n '243p'
        .map((seg) => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
$ grep -n 'escapeForRegExp(seg)' scripts/guards/vacuous-absence-guard.mjs
244:        .map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeForRegExp(seg)))
```

The behaviour is pinned byte-for-byte by a test rather than by eye — the whole class in, the whole
class out:

```ts
expect(escapeForRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\')
```

---

## 3. The `.mjs` boundary decision — MEASURED, not assumed

The brief's constraint is that a `.mjs` file cannot import a TypeScript module, so two of the five
copies (sites 4 and 5) might not be reachable. **I measured both halves of that claim instead of
taking it on faith, and then measured the option the brief did not name.**

**(a) A `.mjs` cannot import the app's TypeScript — measured twice, two different reasons.**

```
# On the DECLARED FLOOR. package.json engines.node is ">=22", and type-stripping is OFF by
# default there (this run disables it explicitly, which is Node 22's behaviour):
$ node --no-experimental-strip-types try-import-ts.mjs
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for
  /home/jmeisburg/orca/workspaces/playdate-app/onboarding/src/lib/firstRunTour.ts

# And even on Node 26, where stripping IS on, it still fails — for a different reason:
$ node try-import-ts.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '/home/jmeisburg/orca/workspaces/playdate-app/onboarding/src/lib/places'
  imported from /home/jmeisburg/orca/workspaces/playdate-app/onboarding/src/lib/firstRunTour.ts
```

The second failure is the decisive one and it is structural: `tsconfig.app.json` uses
`moduleResolution: "bundler"`, so every `src/` import is extensionless (`./places`). Node cannot
resolve those, ever, without a bundler. So a guard importing the TypeScript helper is not a flag you
could turn on — it is a build-shape mismatch.

**(b) The option the brief named — "a plain-JS module both can import" — taken all the way to ONE
copy instead of two.** A vanilla-JS module is the only form every caller can load:

```
$ node -e "import('./src/lib/escapeForRegExp.mjs').then(m => console.log('guard-style import OK:', JSON.stringify(m.escapeForRegExp('a.b'))))"
guard-style import OK: "a\\.b"
```

So the implementation is `src/lib/escapeForRegExp.mjs` — vanilla JS, importable by the app, the e2e
suite **and** the two `node <guard>.mjs` guard scripts. **This is a total dedupe (5 → 1), not the
"documented two-copy boundary" the brief permitted as the fallback**, so no survivor needs a "cannot
reach the helper" reason.

**(c) The TypeScript side needs a declaration, and `allowJs` is not available.** A `.mjs` import
takes its types from a sibling `.d.mts`; that is what keeps the app's `tsc -b` happy. The
alternative — `allowJs: true` in `tsconfig.app.json` — was **rejected before trying it**, because
`tsconfig.app.json` is in `config-guard.sh`'s `PROTECTED` list:

```
$ grep -n 'tsconfig.app.json' scripts/guards/config-guard.sh
  "tsconfig.app.json",
```

Changing a protected config to make a one-line dedupe possible is exactly the contortion the brief
forbade. The declaration file costs one line and touches no config. `npm run typecheck` is exit 0
with it (see §6).

---

## 4. The placement question — answered, not assumed

**Choice: MOVED.** The canonical helper left `src/lib/firstRunTour.ts` (a copy module — an odd home
for a repo-wide regex utility, as the brief says) and now lives in its own `src/lib/` module, **with
its sibling test**: `src/lib/escapeForRegExp.mjs` ↔ `src/lib/escapeForRegExp.test.ts`.

`firstRunTour.ts` now imports it and no longer exports it; its only importer was its own sibling test,
which was re-pointed:

```
$ git diff --stat src/lib/firstRunTour.ts src/lib/firstRunTour.test.ts
 src/lib/firstRunTour.test.ts |  2 +-
 src/lib/firstRunTour.ts      | 11 +----------
```

Its stale JSDoc ("the same one-liner existed in THREE places — two here, one in the e2e") went with
the function it described; the boundary prose now lives in the new module's header.

**A naming caveat, stated rather than hidden:** `lib-sibling-guard` walks `src/lib/*.ts`, so it does
**not** see `escapeForRegExp.mjs` or `escapeForRegExp.d.mts` — the module count it prints is 55 both
before and after this slice. The build law's sibling rule is satisfied in substance (the test exists
and is run), but that guard's count does not prove it. See Risks.

**The four excluded lookalikes** (different character classes — different *function*, not a copy):
`RsvpConfirmationDialog.tsx:47` and `ModalShell.tsx:112` (`/[^a-zA-Z0-9_-]/` → `''`, sanitising a
`useId()` into an element id), `photoStorage.ts:209` (`/[^a-z0-9]/` → `''`, normalising a file
extension), `backfill-place-hours.mjs:229` (`/[^a-z0-9]+/` → `' '`, slugifying a name). **They strip
characters; the escape protects metacharacters.** Merging any of them into `escapeForRegExp` would be
a behaviour change, so they are untouched. The full sweep that establishes there are no others:

```
$ git grep --untracked -n --fixed-strings -- '.replace(/[' -- .
scripts/backfill-place-hours.mjs:229:    .replace(/[^a-z0-9]+/g, ' ')
scripts/guards/fixture-marker-guard.mjs:175:  return literal.replace(/^[`'"]/, '').replace(/[`'"]$/, '')
src/components/ModalShell.tsx:112:  const titleId = `modal-shell-title-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
src/components/RsvpConfirmationDialog.tsx:47:  const bodyId = `rsvp-confirmation-body-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
src/lib/escapeForRegExp.mjs:37:  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
src/lib/photoStorage.ts:209:  const cleaned = ext.toLowerCase().replace(/^\.+/, '').replace(/[^a-z0-9]/g, '')
```

---

## 5. The drift guard — and an honest statement of what it cannot do

`scripts/guards/regexp-escape-guard.mjs` (+ `regexp-escape-guard.check.mjs`), registered in
`run-all.sh`'s loop and in its `run_check` list.

**What it cannot do:** it does **not** make a sixth inline copy unconstructable — retyping the
one-liner is always possible. So it is a *detector*, and the header says so.

**What it does do, and why it cannot degrade into a fake pass:** the expected state is **exactly one
occurrence, in the sanctioned file**. So a sixth copy fails **and a zero fails** — a needle that
stopped matching (implementation renamed, deleted, or the pattern mistyped) is a finding, never a
silent pass. That is the batch's own doctrine ("an instrument that matches nothing looks exactly like
a clean repo") built into the exit code rather than promised in a comment.

It also deliberately avoids the trap I fell into in §1: it **walks the filesystem**, so a copy in a
file the author has not staged is caught. Its scope is written down (a list of directory **NAMES**,
plus the code extensions; `.scratch` skipped whole and stated as uncounted) and the header states it.

**⚠️ CORRECTION — fix round 1.** The parenthetical above once read "skips generated and gitignored
harness dirs", which was FALSE twice over, and the reviewer measured both directions: git TRACKS 260
files under `.scratch/` (23 of them `.mjs`), so a copy seeded in one passed silently while the header
called that directory gitignored harness state; and `.vitest/`, which IS gitignored, was **not**
skipped, so a generated cache file holding the literal **failed the lane**. The header and the
printed scope line now state the mechanism (directory names, `.scratch` uncounted and why,
`.vitest` skipped), `.mts`/`.cts` joined the scanned extensions, and
`regexp-escape-guard.check.mjs` pins both directions in three new cases — **9 checks, not 6**, so the
`all 6 checks passed` line quoted below is the `ce3479c` tail, not today's. Current tails:
`.scratch/v28/reports/slice-6c-fix-1.md`.

**What the drift the two review lanes named actually is:** `ocr` said *"implementations that drift
independently — a missed metacharacter in one silently over-matches the pin."* With **one**
implementation there is no second copy to drift: that failure mode is gone by construction, and what
remains (a future hand-copied sixth copy) is what the detector covers.

`run-all.sh` now runs it, and the check proves the guard fires on every seeded defect:

```
$ node scripts/guards/regexp-escape-guard.mjs ; echo exit=$?
Regexp-escape guard — one escape implementation
===========================================================
  found: src/lib/escapeForRegExp.mjs:37
  ok — one implementation, at src/lib/escapeForRegExp.mjs:37
  ok — every other caller imports it (scope: the whole tree minus generated/harness dirs)

PASS — the escape has exactly one home.
exit=0

$ node scripts/guards/regexp-escape-guard.check.mjs ; echo exit=$?
  ✓ clean tree passes and names the one implementation
  ✓ a sixth copy in e2e/ is CAUGHT and named
  ✓ a sixth copy in scripts/ is CAUGHT (the guard scripts are covered too)
  ✓ a ZERO count FAILS — an instrument that matched nothing is not a pass
  ✓ one copy in the WRONG file FAILS — the count is not the whole rule
  ✓ restored sandbox passes again

regexp-escape-guard check: all 6 checks passed.
exit=0
```

**The check earned its keep immediately:** its first run was **2/6 red**, because my seed string was
built with one backslash too few (`[\\]` instead of `[\]`) and so seeded a file the guard correctly
did not match. A guard whose seeds had been trusted-but-unverified would have shipped looking green
while proving nothing.

---

## 6. The appended line: the guard OUTPUT that made a false claim

`scripts/guards/no-bypass-guard.sh` printed, on every run, that *"only a wrapper-recorded bypass or a
FAST_PUSH_LOG line is visible"*. **That is false** — a `GIT_REFLOG_ACTION='… git push --no-verify'
git push` writes the flag to no `.git/logs` file at all, and the guard reads only `logs/HEAD`. The
guard's header already carried the corrected statement; the echo could not be fixed then because a
prior round's acceptance required identical stdout.

The echo now says what the guard actually sees, and the blind-spot sentence is kept:

```
$ bash scripts/guards/no-bypass-guard.sh
No-bypass guard — git hook enforcement
===========================================================
  ok — core.hooksPath = scripts/git-hooks
  ok — scripts/git-hooks/pre-push exists and is executable
  COVERAGE: HISTORY reads the reflog's action text on logs/HEAD and FAST_PUSH_LOG, never a command line.
    A plain 'git commit --no-verify' leaves no trace this check can read, so the PASS/FAIL
    below is NOT evidence about the flag — only a non-prose reflog action text on logs/HEAD
    or a FAST_PUSH_LOG line is visible (see scripts/guards/no-bypass-guard.check.mjs).

PASS — git hook enforcement is intact.
```

The check that owns this line still passes — it asserts on the two substrings I kept, not on the
false one:

```
$ grep -n "STATES its coverage" -A2 scripts/guards/no-bypass-guard.check.mjs
128:    'the guard STATES its coverage in the run (the PASS does not read as evidence about the flag)',
129:    /COVERAGE: HISTORY reads the reflog's action text/.test(r.out) && /NOT evidence about the flag/.test(r.out),
```

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

`logs/HEAD` is named because that is the file the grep actually reads
(`RELOG="$(git rev-parse --git-path logs/HEAD)"`, line 200).

---

## 7. Acceptance evidence

### `npm run verify` — exit 0 (fresh, after the last edit)

```
$ npm run verify ; echo exit=$?
> drop-in@0.0.0 build
> tsc -b && vite build
✓ built in 1.06s
✓ built in 73ms
> drop-in@0.0.0 test
> vitest run
 Test Files  70 passed (70)
      Tests  2030 passed (2030)
> drop-in@0.0.0 lint
> oxlint --ignore-pattern '.scratch/**' ...
   (81 warning lines, 0 error lines)
> drop-in@0.0.0 a11y:focus
PASS — every control that suppresses its outline provides a focus cue
> drop-in@0.0.0 steering-lint
PASS — steering layer is clean.
> drop-in@0.0.0 guards
> bash scripts/guards/run-all.sh
...
Regexp-escape guard — one escape implementation
===========================================================
  found: src/lib/escapeForRegExp.mjs:37
  ok — one implementation, at src/lib/escapeForRegExp.mjs:37
  ok — every other caller imports it (scope: the whole tree minus generated/harness dirs)

PASS — the escape has exactly one home.
...
GUARDS: PASS — all deterministic rules hold.
exit=0
```

Exit 0 · **70 test files · 2030 tests · 81 lint warnings · 0 lint errors** (the same 81 warnings as
the slice-6b baseline: this diff adds none) · both guard checkers green.

The 4 new tests are `src/lib/escapeForRegExp.test.ts`; the suite went 2027 → 2030 (I deleted one
redundant case mid-slice — see §8).

### The two specs whose escaping changed — twice each, every run reported

```
$ npx playwright test e2e/weekly-series.e2e.ts          # run 1
  ✓  1 [setup] › e2e/auth.setup.ts:59:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (10.6s)
  ✓  2 [chromium] › e2e/weekly-series.e2e.ts:29:1 › the repeat-weekly toggle is absent from /new (4.5s)
  2 passed (33.1s)

$ npx playwright test e2e/weekly-series.e2e.ts          # run 2
  ✓  1 [setup] › e2e/auth.setup.ts:59:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (5.7s)
  ✓  2 [chromium] › e2e/weekly-series.e2e.ts:29:1 › the repeat-weekly toggle is absent from /new (6.3s)
  2 passed (31.6s)

$ npx playwright test e2e/place-directory-in-new.e2e.ts # run 1
  ✓  1 [setup] › e2e/auth.setup.ts:59:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (7.8s)
  ✓  2 [chromium] › ... › the place directory is reachable from /new, with its map and list (V21 t02) (9.2s)
  ✓  3 [chromium] › ... › the directory sheet can be dismissed without picking (V21 t02) (1.9s)
  ✓  4 [chromium] › ... › the directory sheet traps focus, closes on Escape, and scrolls (V23 slice 3) (3.6s)
  ✓  5 [chromium] › ... › typing in the place field still opens inline suggestions (V23 slice 3 regression guard) (1.5s)
  5 passed (37.7s)

$ npx playwright test e2e/place-directory-in-new.e2e.ts # run 2
  ✓  1 [setup] › e2e/auth.setup.ts:59:1 › sign up the marker, onboard it (zip + radius), save the signed-in state (9.1s)
  ✓  2 [chromium] › ... › the place directory is reachable from /new, with its map and list (V21 t02) (4.9s)
  ✓  3 [chromium] › ... › the directory sheet can be dismissed without picking (V21 t02) (1.4s)
  ✓  4 [chromium] › ... › the directory sheet traps focus, closes on Escape, and scrolls (V23 slice 3) (4.0s)
  ✓  5 [chromium] › ... › typing in the place field still opens inline suggestions (V23 slice 3 regression guard) (3.8s)
  5 passed (40.9s)
```

**4/4 runs green, 14/14 tests, no re-run needed** — none of the four named flake modes appeared.
(No listener was left on 4173 between runs; nothing was killed, so no `pkill` risk was taken. The two
guard scripts I changed are exercised by the guards lane above, whose `run_check` lines are green.)

### Both halves

- **Proves it works:** the guard finds exactly one copy; the check proves it fires on a sixth copy in
  both `e2e/` and `scripts/`; `npm run verify` exit 0; both changed specs pass twice.
- **Proves the old behaviour is preserved:** §2's byte-identical before/after expression plus the
  whole-class assertion in `escapeForRegExp.test.ts`, and the e2e specs above exercising the callers
  whose escaping changed (they assert against real rendered labels and a real place name).

---

## 8. Anything the brief did not anticipate

1. **`git grep` reports a FALSE ZERO on untracked files, and that bit me mid-slice.** §1. The brief
   warned about a *mangled pattern*; the mangling was already fixed. This is a second, independent
   way the same command lies, and it is the reason the new guard walks the filesystem instead of
   shelling out to git. **The orchestrator's enumeration instrument (`git grep`) cannot be reused for
   a post-change count.**
2. **A sixth occurrence exists in gitignored scratch: `.scratch/guard-a03fc54.mjs:635`.** It is a
   review lane's frozen snapshot of the copy-field guard (three such snapshots sit in `.scratch/`),
   is untracked, and is excluded by `.gitignore:50` (`.scratch/**/*.mjs` — *"throwaway probe/scratch
   scripts … must never ride a push"*). **It is not repo code and I did not touch it.** The guard
   skips `.scratch` for this reason, and the header says so. Worth knowing: this is also why the
   brief's *"FOUR copies total repo-wide"* (slice 6.md) and the ledger's *"FIVE"* differ from each
   other — the parent brief's four were the copies found before the two guard scripts were included.
   **Five in tracked code is the right number, and 6c's table has it exactly right.**
3. **A fifth lookalike the brief did not list:** `scripts/guards/fixture-marker-guard.mjs:175`
   (`stripQuotes`: `/[`'"]/` anchored at each end, stripping a quote). The brief named four; the
   sweep in §4 shows this one too. Same disposition — it strips, it does not escape — and the new
   guard's header names it alongside the other four.
4. **`tsconfig.app.json` is a protected config, which decided the design.** `allowJs` (the obvious
   way to make TypeScript import a `.js` module) is off the table without an `ALLOW_CONFIG_CHANGE`
   commit, so the `.d.mts` declaration is not a stylistic preference — it is the only route that
   keeps the change out of a protected file.
5. **I added and then deleted a test case, and the reason is a lint warning.** A 4th test asserting
   `() => new RegExp('a(b')` throws drew a *new* `no-invalid-regexp` warning from oxlint. The case was
   **redundant anyway** — the round-trip table already contains `'a(b'`, so an unescaped `(` throws
   there — so I deleted it rather than suppress the warning. That is why the diff adds 0 lint
   warnings and the suite is 2030, not 2031.
6. **`run-all.sh`'s own comment said "the two checkers that carry real logic"** when there are seven
   (eight with mine). A previous lane left it deliberately ("outside this slice's subject"). Since my
   diff adds a line to the very block that sentence introduces, leaving it would have extended a false
   statement, so I deleted the word "two". One word, no other prose touched.

---

## Files changed

```
 e2e/place-directory-in-new.e2e.ts        |  3 ++-
 e2e/weekly-series.e2e.ts                 |  6 +-----
 scripts/guards/no-bypass-guard.sh        |  6 +++---
 scripts/guards/run-all.sh                |  9 +++++++--
 scripts/guards/stale-locator-guard.mjs   |  4 ++--
 scripts/guards/vacuous-absence-guard.mjs |  3 ++-
 src/lib/firstRunTour.test.ts             |  2 +-
 src/lib/firstRunTour.ts                  | 11 +----------
 8 files changed, 19 insertions(+), 25 deletions(-)

new: src/lib/escapeForRegExp.mjs        (the one implementation)
new: src/lib/escapeForRegExp.d.mts      (types for the TS side)
new: src/lib/escapeForRegExp.test.ts    (behaviour, 3 cases)
new: scripts/guards/regexp-escape-guard.mjs        (the drift detector)
new: scripts/guards/regexp-escape-guard.check.mjs  (its 6-case proof)
new: .scratch/v28/reports/slice-6c.md   (this file)
```

---

## Risks

- **`lib-sibling-guard` cannot see the new module.** It walks `src/lib/*.ts`; `escapeForRegExp.mjs`
  and its `.d.mts` are invisible to it, so the module count it prints (55) does not change and cannot
  prove the sibling rule for this module. The sibling test exists and runs in `npm test`, but a
  reviewer who trusts that guard's count would be trusting a blind spot. **The guard could be widened
  to `.mjs`/`.mts`, which is a change to a guard outside this slice's subject.**
- **`src/lib/escapeForRegExp.mjs` is not type-checked.** Without `allowJs`, `tsc` ignores `.js`/`.mjs`
  files entirely; only the `.d.mts` is in the program. The implementation is one line and its
  behaviour is pinned by test, but a type error inside the `.mjs` itself would not be caught by
  `npm run typecheck`. The `.d.mts` must be kept in step by hand if the signature ever changes.
- **`ladder:`** I climbed past "leave the canonical in `firstRunTour.ts` and give it a second copy for
  the guards" because a `.d.mts`-plus-`.mjs` pair buys a genuinely single implementation with no
  config change — but the honest cost is a `src/lib/` module that no existing guard or type-checker
  verifies. I judged one unverified leaf module lower-risk than two implementations that the batch's
  own two lanes already named as a drift hazard; that trade is the orchestrator's to reverse, and it
  is one file move.
- **A `.mjs` in `src/lib/` is new to this repo** (the directory was 100% TypeScript). The header
  explains why, and the reason is measured in §3 — but it will look unusual to a reader who has not
  read that header.
- **Pre-existing dead import, left alone:** `e2e/weekly-series.e2e.ts:21` imports `readMarkerSession`,
  which nothing uses. It is unused at HEAD too, so my change did not orphan it; per the slice rules I
  left it and name it here rather than widening the diff.
- **The drift detector is a detector, not a prohibition.** A future author can still hand-copy the
  one-liner; they will simply be told. Making a sixth copy *unconstructable* is not available here —
  that is stated in the guard's own header, not only here.

---

## Fix round 1 (post-verification) — what this report got wrong

Two blockers and two smaller items, all fixed in this round. Measurements and raw tails:
`.scratch/v28/reports/slice-6c-fix-1.md`.

| Finding | Status |
|---|---|
| **G1** — the guard's stated scope was not `SKIP_DIRS`: a copy in a TRACKED `.scratch` code file was uncounted while the header called that directory gitignored, AND a generated `.vitest` cache file failed the lane | **fixed** — the sentence and the mechanism now say the same thing (skip is by directory NAME; `.scratch` skipped whole, uncounted, with the number and the reason; `.vitest` added). Both directions are pinned in the check, which now runs 9 cases |
| **G2** — the `git grep` after-count above was presented as one and had become sixteen | **fixed** — correction inline in §1, naming `scripts/guards/regexp-escape-guard.mjs` as the authoritative instrument |
| **G3** — `.mts` excluded from `SCAN_EXT` | **fixed** — `.mts`/`.cts` are scanned; a seeded `.d.mts` copy is caught, and that case is proven load-bearing |
| **G4** — the batch's guard-authoring rule (write the rule into `docs/` first) was unmet | **fixed** — `docs/agents/code-structure.md`, new section "The one-copy rule" |

Unchanged, because they are the orchestrator's rulings rather than defects: the dedupe itself (5 → 1),
the `.d.mts` declaration-drift cost, and the `lib-sibling-guard` blind spot (still globs `*.ts`).
