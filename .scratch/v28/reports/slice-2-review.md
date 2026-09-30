# Slice 2 review — 2e784d3 (base aac2bab) — orchestrator-reviewer

## Verdict: PASS

The diff satisfies all six acceptance criteria of plan §6 slice 2 on direct inspection:
the photo re-homes onto the name card with the crop step on confirm and Continue never
waiting on (or gated by) an upload; `createProfile` gains the ruled optional parameter with
one call site and the idempotent path untouched; both r2-D4 copy defects are fixed; the
two-sided zero-hit criterion passes on BOTH halves; every trap is byte-identical; the
load-bearing selectors are intact; and the new e2e spec is non-vacuous — it reads the row
back over REST and the object back off the storage API, so it cannot pass on fixtures.
Zero defects in the diff. One premise of the review brief (Q8) is itself a misattribution,
adjudicated below. The single open item is process, not diff: no green `npm run verify`
is recorded at 2e784d3 yet (ledger ends after the grep-verification section), so the slice
gate stays open until the verify lane runs.

## The eight questions

**Q1 — the six acceptance criteria.** All met on inspection; the gate run is open.
1. *Upload on card 2 stores the avatar; card advances; a FAILED upload never blocks
   Continue* — met by code inspection. The upload runs in the crop dialog's confirm
   callback (`OnboardingPage.tsx:247-258`); its catch only sets `photoError` (`:255`), and
   `handleCreateProfile` reads neither `photoError` nor `photoUploading`; the card's only
   `primaryDisabled` is `handleBusy` (`:612`). A failed/absent upload leaves
   `pendingAvatarUrl` null and Continue runs `createProfile(name, undefined)` (`:563`).
   The no-photo walk is the unchanged `signUpViewer` hop (the fixtures.ts diff is
   comment-only, `e2e/fixtures.ts:383-391`). End-to-end proof of the happy path lives in
   `e2e/name-card-photo.e2e.ts`; its green run is not yet recorded (open item below). The
   FAILED-upload branch is proven by inspection (there is no gating code), not by a test —
   a storage failure is not cheaply simulatable in e2e; acceptable under the pending-state
   rule, recorded as residual risk.
2. *Photo does not gate Continue; 17 spec files walk the hop* — met. `signUpViewer`'s
   behaviour is unchanged; only its docblock was updated.
3. *Copy names only rendered fields; hint actionable* — met. Name body
   (`firstRunCopy.ts:41`) names first/last name and the photo only; the handle-taken hint
   (`OnboardingPage.tsx:569`) now says "try a different first or last name" — no phantom
   middle-name field.
4. *Scoped zero-hit, two-sided* — both halves pass: `middle name|middle initial` in
   `OnboardingPage.tsx` → **0 hits**; `git diff aac2bab 2e784d3 -- src/lib/oauth.ts
   src/lib/oauth.test.ts` → **empty** (byte-identical). A builder that swept the innocent
   files would have shown up in that diff.
5. *Stale comments owned* — met. `e2e/avatar.e2e.ts:1-7` docblock rewritten for the
   photo-on-name-card (marker drives `/profile` because it already has a row), per "the
   slice that breaks a claim owns it".
6. *Verify (`npm run verify`)* — **OPEN**: no green run recorded at 2e784d3.

**Q2 — `createProfile` change safe.** Yes. `avatarUrl?: string` optional
(`db.ts:351-353`); the insert spreads `avatar_url` only when defined (`db.ts:364-369`);
the idempotent 23505→getProfile catch is absent from the diff. Call-site count: exactly
**one** production call, `OnboardingPage.tsx:563` (every other hit is an import, comment,
or e2e docblock). Pre-slice measurement was one; it is still one. No second caller.

**Q3 — the two-sided zero-hit.** Verified both halves as in Q1.4. Blanket-form defect did
not recur.

**Q4 — is `e2e/name-card-photo.e2e.ts` non-vacuous?** Yes. Named assertions:
- Row carries the URL: `expect(row.avatar_url).not.toBeNull()` (`:183`),
  `toContain('/avatars/<uid>/avatar')` (`:184`), `toMatch(/\?v=\d+$/)` (`:185`) — read back
  over REST with the viewer's own JWT. If the URL never reached the INSERT, the column is
  null and `:183` fails.
- Object in the bucket: owner-JWT read of
  `storage/v1/object/avatars/<uid>/avatar` must return 200 with `image/jpeg`
  (`:193-194`) — proves the object exists, not just that the column points somewhere.
- The card walks: `first-run-kids-card` visible after Continue (`:156`).
It doubles as the build-law sibling test for the new parameter (lib-sibling rule,
`docs/agents/code-structure.md:68`): `createProfile` appears in **no**
`src/lib/*.test.ts` (measured), so the e2e is the seam's only test home, and the spec's
docblock says so.

**Q5 — was adding the e2e file necessary?** Yes — two independent obligations: (a)
acceptance #1 demands end-to-end proof (object AND row) that no existing spec provides
(`avatar.e2e.ts` deliberately drives `/profile` with an already-onboarded marker);
(b) the sibling test for the new `createProfile` parameter can only execute against the
live PostgREST/Storage seam, which exists only in e2e. The addition is a plan file-list
gap of the same class as the blessed `db.ts` — not builder creep. Judge: necessary.

**Q6 — traps intact.** `git diff aac2bab 2e784d3` on `src/lib/reviews.ts`,
`src/lib/reviews.test.ts`, `src/pages/PlaceDirectory.tsx`, `src/pages/PlaceDetailsPage.tsx`,
`src/pages/InboxPage.tsx`, `src/lib/places.ts` → **empty** (all star-rating `of 5` sites,
the Inbox note, places.ts untouched). The `hasAvatarUrl` **export**
(`src/lib/avatarUrl.ts`) is untouched, has **zero** consumers in `src/` (only its own
test imports it), and remains a dead export for slice 8 as the plan says.

**Q7 — load-bearing selectors.** All intact in the post-slice file:
`testId="first-run-name-card"` (`OnboardingPage.tsx:613`),
`autoComplete="given-name"` (`:638`), `autoComplete="family-name"` (`:657`),
`primaryLabel: 'Continue'` (`firstRunCopy.ts:42`, unchanged). The e2e's
`getByRole('button', { name: /^Continue/ })` and `'Use this photo'` confirm
(`src/components/CropPhotoDialog.tsx:330`) match the real UI.

**Q8 — the "Untouched" description. (The parent's specific ask.)**

The 4/−3 comment-only edit is NOT in this slice.
`git diff aac2bab 2e784d3 -- src/lib/avatarUrl.test.ts` is **empty**. That docblock hunk
landed in commit `525fdcf` ("V28 r2 slice 1b"), which is an ancestor of the slice-1 close
(`449d940`) and therefore of the slice-2 base — and slice 1b's plan file list explicitly
included `src/lib/avatarUrl.test.ts` (`:7`). The brief's premise ("but
`src/lib/avatarUrl.test.ts` changed 4/−3") is a misattribution to the slice base: it
examined the file against a base OLDER than the closed slice 1, not against `aac2bab`.

Against the actual slice diff the report's "Untouched" is correct BOTH literally (neither
`avatarUrl.ts` nor `avatarUrl.test.ts` is among the 6 changed files, and the report's file
list matches the diff) AND substantively (export untouched, zero consumers, dead until
slice 8). **The description is good enough — no correction owed.**

**Does it merit a guard? No, not for this.** (1) The ledger rule already recorded —
"a builder's 'untouched' is a claim about what it MEANS; comment-only edits are still
edits and must be named" — targets the REAL class, which is 1b Risk 3 (F4): a report that
described a different edit than the diff made. That guard stands as-is. (2) This case is
not a second sample of that class; it is a misattribution in the review chain (a
pre-slice edit from the closed slice 1b read as if it were slice-2 work). Hardening a
guard against a phantom second sample would codify the error. (3) The mechanical check
that catches this class — `git diff <slice-base> <slice-tip> -- <file>` before declaring a
recurrence — IS the pre-slice-state check the brief already demands for every finding.
Recommendation: amend the ledger's "second occurrence" record (`.scratch/v28/ledger.md`
2647-2653) to note the attribution error; add the base-check line to the review
checklist; do NOT add a new guard.

## Repeat-of-a-previous-round class? (explicit, checked against pre-slice state)

**No finding repeats a previous round's class** — and that conclusion is itself the
pre-slice check paying off: the would-be second occurrence (the 4/−3 "untouched" case)
is **pre-slice** (`525fdcf`, slice 1b, CLOSED at `449d940`), not slice-2 work; I verified
it against `aac2bab` rather than assuming the slice did it. Likewise the transient
`'Uploading…'` visibility assertion (`e2e/name-card-photo.e2e.ts:150`) is an INHERITED
convention, byte-analogous to `e2e/avatar.e2e.ts:112` (pre-existing), not a new defect.

## Findings

1. **Non-blocking — verify gate open.** No green `npm run verify` / Playwright run is
   recorded at `2e784d3`; the ledger ends after its grep-verification. Plan §6 slice 2's
   gate is `npm run verify`. Dispatch the verify lane (slice-1 precedent: closed by the
   verifier's 14/14) before closing the slice. Nothing in the diff requires it; this is
   the gate itself.
2. **Non-blocking — inherited transient-assertion flake risk.**
   `e2e/name-card-photo.e2e.ts:150` asserts the busy state `'Uploading…'` is visible; for
   a tiny PNG the upload can complete before the poll and the text will have flipped to
   'Photo added', failing the assertion. The same pattern exists at
   `e2e/avatar.e2e.ts:112`, so this is a repo convention, not a slice defect; if it
   flakes, the fix belongs to the class, not this spec alone.
3. **Non-blocking — ledger hygiene.** `.scratch/v28/ledger.md:2647-2653` records the
   "Untouched" case as the "second slice in a row"; the evidence shows it is an
   attribution error, not a builder mis-description. Correct the record; do not add a
   guard.

## Residual risks

- The failed-upload-does-not-gate path is proven by inspection only (no test simulates a
  storage failure). A future refactor that adds a Continue-time check of `photoError` or
  `photoUploading` would silently break the pending-state rule; the load-bearing comment
  (`OnboardingPage.tsx:225-239`) covers the upload no-op side, not that one.
- The slice gate (green `npm run verify` at 2e784d3) is open until the verify lane runs.
