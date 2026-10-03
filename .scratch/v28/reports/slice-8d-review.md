# slice-8d-review — INDEPENDENT fresh-context review (GLM) of the DeepSeek builder's typed-zip slice

Code range `b7db5b7..5f575e0` (verified single-commit range: `git rev-parse 5f575e0^` = `b7db5b7cb7c55a0…`;
branch `Meisburg/onboarding`), report commit `5711c69`. All counts below name these SHAs, never "HEAD".
Worktree status at review time: clean (`git status --porcelain` empty). The builder's claim about leaving
others' `factory/work/*.json` unstaged is consistent with `git show 5f575e0 --stat` (exactly 2 files) and
`+74/-40` matches `git diff --numstat`.

## Verdict: PASS

No blocking findings. The diff is correct, complete for both defects, in scope, build-law-compliant, and
non-vacuously pinned. The shape argument — the decisive question — survives independent audit.

## The DECISIVE question: is the freeze the fourth wall?

**No. The builder's argument is correct, not a rationalisation.** Measured, not taken from the report:

1. **The re-check genuinely degenerates here.** `src/pages/OnboardingPage.tsx:899` captures `typedZip` and
   `:905` consumes it in `await saveLocation(typedZip)` with **no `await` between** (`validateHomeZip`,
   `src/lib/feed.ts:140`, is a synchronous regex). A re-check at the point of use has nothing live to read —
   there is no `homeZipRef` (grep: `setHomeZip` has exactly one call site, `:1640`), so the comparison reads
   the closure against itself — precisely the `A !== A` defect slice 4's fix-2 comment records. Slice 4's
   shape spans a lookup await that the field's text can move across; this path's capture→use window is
   zero-width. The mid-save divergence window is **during** the write, and a re-check cannot observe inside
   its own await.
2. **Slice 4's refusal does not transfer.** Its committed words (`OnboardingPage.tsx:944-948`) refuse locking
   the field "for the duration of a Finish-initiated **lookup**": there the field IS the operation's live
   input, a mid-flight correction is meaningful (the re-check then refuses the stale save and the parent
   re-taps Finish), and the refused freeze would need "its own six-path audit" for a NEW pending escape.
   Here the frozen field's text is dead after the capture: a mid-write edit cannot be re-submitted (handler
   guard `:897` refuses while `saving`; primary already disabled — `:1502` + `FirstRunCard.tsx:113,121`),
   success swaps the card, failure re-enables with the value that was actually written. The freeze removes
   no recovery action the parent had.
3. **Four-path freeze audit (the brief's wall test):** throw/reject → `saveLocation`'s `catch` +
   `finally { setSaving(false) }` (`:1086` set true, `:1113` cleared; the only statement between
   `setSaving(true)` and `try` is `setError(null)`, which cannot throw) → re-enabled. Unmount → input
   unmounted; React 18 state-set is inert; a remount is a fresh instance. Second tap → refused twice
   (`:897` guard; `primaryDisabled`). Hang → the card was **already** non-submittable pre-diff via the
   untoucched `:1502`; the freeze inherits the pre-existing `saving` exposure and adds no terminal state.
   No path leaves the input disabled on an otherwise-idle card. **Not the fourth wall.**

## Defect 1's gate: what it started and stopped watching, and whether it re-couples

- **Started watching:** the save-authoritative set — the parent's own typed text (`homeZip.trim() !== ''`,
  `:1630`), i.e. exactly what Finish will write.
- **Stopped being bound to:** the NOTE's visibility. The field is no longer a child of the
  `zipFallbackShown` block — though it did not stop watching it (OR arm kept), so the visible set is a
  strict superset; nothing previously visible is now hidden (verified against the whole hunk).
  What **wholly** stopped watching `zipFallbackShown` is the **ALERT**: single gate `zipError !== null`
  (`:1671`), outside every block.
- **Re-coupling audit — none found.** Field↔alert co-render is guaranteed not by gates but by state
  structure: `setZipError`'s ONLY call site is `:902`, behind `typedZip !== ''` (so the field's gate is
  already true at set time); `setHomeZip`'s ONLY call site is `:1640`, and `:1641` clears the error in the
  same batch as any change that could empty the field. Verified by exhaustive grep, not taken from the
  comment.
- **The gate is load-bearing both ways** (checked the alternatives): leaving the field on the note's gate
  would orphan the alert over a missing field; gating the field on the error instead would make the typed
  value vanish from the screen **after** the error is cleared while Finish would still write it — the same
  defect in a dress. `zipFallbackShown || homeZip.trim() !== ''` is the minimal correct gate.
- Committed leg (`:727`, asserts at `:788-791`) demonstrates alert visible + note hidden + field visible,
  then fixes the zip and finishes the card (no wall), and the pre-fix red tail in the builder's report shows
  both field and alert absent — the reachability claim is real.

## Leg 8's `toBeDisabled()`: honest, and it is the only observable — verified

The builder's disclosure matches the mechanism: on success the card swaps (any discarded mid-write edit
leaves no post-hoc trace); on failure nothing is written and the retry writes whatever the field then holds —
so the divergence has **no post-write observable**. The leg (`e2e/signup-zip-fallback.e2e.ts:810`) holds the
real PATCH in a route gate, asserts `toBeDisabled()` (**`:861`**) AND `toHaveValue(marker.homeZip)`
(`:862`) during the window — "frozen AND still showing the value being written" — then releases, waits for
the finish card and asserts the feed carries that zip. One residual over-fit, disclosed and acceptable:
`toBeDisabled()` would also red on a different valid closure (e.g. readOnly) — it pins one mechanism, not
the class. Since the mechanism here IS the user-visible truth (the window is closed iff the input cannot
move), the shape is honest.

## The second subject: verified real; reporting-not-fixing was right — but under-declared

The address input (`OnboardingPage.tsx:1496-1520`) has no `disabled`; slice 4's re-check (`:950`) runs
**before** `saveLocation`, not after — so an edit during the address-path write diverges exactly as claimed.
Given the brief scoped Defect 2 to `typedZip` and ordered split-on-third-subject, not fixing was correct.

**However the subject is a family and the report names one member** (UNDER-DECLARED BOUNDARY): the
**radius select** (`:1683-1700`) is also editable while `saving`, and **both** save paths write the tap-time
`closure radiusMiles` (`:1089`) — it is at least as reachable as the address case. The builder's own report
names address+radius as "stay editable" only in passing (§2) and records the second subject as
address-only (§5.3). Goes to the split decision, not to this diff.

## Standing hunt (D-025 / D-030) on what this diff ADDED — known-opens for the ledger (last slice)

- **D-025 instance (prose invariant, unpinned).** `:1664-1669` asserts "the only setter … the onChange …
  always co-render" — TRUE today (verified as above), but no test or guard pins the two single-site
  premises; a second `setZipError` site or a future `homeZip` reset would silently break "always
  co-render". Record known-open.
- **D-025 sibling (unpinned path).** The freeze comment's "the existing `finally` re-enables it on every
  path" (`:1644-1655`) is reading-audited (see §2 above) but no e2e leg anywhere exercises the
  save-**failure** path on this card (no abort/5xx leg in the spec) — re-enable-on-throw is prose-only.
- **Prose imprecision.** `:1648` calls the await a "one-round-trip write"; `saving` spans
  `updateHomeZipRadius` (`:1089`) **and** `refresh()` (`:1097`) — two round trips. The window is the
  freeze's true span; substance unaffected.
- **Boundary worth a line in the ledger.** The field gate watches **trimmed** text: a whitespace-only
  `homeZip` with the note hidden hides the field holding the parent's (blank) input, and Finish proceeds
  down the address path. Invariant-consistent ("or to nothing" — nothing is written from it), pre-fix the
  same text vanished with the note; record as a declared boundary, not a defect.
- **D-030: no instance added.** Both new legs assert presence (alert visible, field disabled + valued,
  finish card, feed text); none passes on a zero-observation. `PROFILES_ROUTE` (`:808`) is a new const in
  one file only — no one-copy duplication (checked across `e2e/`).

## Verification gate: builder's evidence vs the diff

Report's raw tails are real and corrigible: the quoted red/green lines cite spec line numbers exactly 13
below the committed file (`:714/:775/:797/:848` quoted vs committed `:727/:788/:810/:861`) because the
13-line header item (diff `@@ -57,6 +57,19`) was appended **after** the runs, before commit — comment-only,
no assertion moved; substance corroborated by the committed assertions themselves. `npm run verify` (71
files / 2063 tests / exit 0, `5f575e0`) matches the batch's closed-gate baseline and no `src/lib` file
changed in the range, so the count arithmetic is consistent. I did not run the suite (reviewer gate —
evidence-presence is the judged question, and it is present). The e2e file is append-only (`+163/-0`) — the
four prior fix-round pins were demonstrably untouched.

## Requirements traceability

- Acceptance 1 (Defect 1 reachability settled) → met: browser leg + pre-fix red tail showing `#err-zip`
  absent with the note hidden.
- Acceptance 2 (error visible where the parent looks, not re-hideable) → met: alert on a solo gate
  (`:1671`), outside every block; pinned by leg 7.
- Acceptance 3 (Defect 2 fixed, shape + rejected alternatives stated) → met: `disabled={saving}` (`:1656`)
  over the existing audited `saving` flag; alternatives rejected in report §2; re-check correctly ruled
  inapplicable.
- Acceptance 4 (non-vacuity proofs, both halves) → met: reverted-source red tails for both legs in the
  report; committed legs green ×3 (§4 tails).
- Acceptance 5 (`npm run verify` exit 0) → reported with output at `5f575e0`; corroborated structurally, not
  re-run by this reviewer.
- Scope/structure → met: two files, every changed line traces to the two defects; no lib rule in a page
  (validation already lives in `src/lib/feed.ts`), no new module needing a sibling test, no churn.

## Recommended next action

Accept the slice; record the four known-opens above (radius-select divergence, D-025 prose invariants,
save-failure re-enable leg gap, whitespace-only gate boundary) in the ledger with the SHAs this review
names.
