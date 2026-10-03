# Slice 3 — FIX ROUND 1 (resume the original builder)

You built slice 3 (`0c08024`). **Three lanes ran: the verifier PASSED, and both the reviewer and `ocr`
returned findings.** They **independently found the same two defects**, and each found things the other
missed — so read all of these; none of them is noise.

**You are the right person for this**: the file below is one you just wrote, and two of these findings
are about invariants you designed.

**⚠️ IF YOU CANNOT DO ALL SIX WELL INSIDE ONE CONTEXT, STOP AND SAY SO.** Six findings in one file you
know well is plausible; a rushed job on the row-identity refactor is not worth it. **Say which ones you
did and which you did not** — a partial, honest round beats a complete-looking one.

---

## F1 — [BOTH LANES, BLOCKING] The photo-confirm write accepts rows the card's own rule rejects

**Reviewer (B1):** *"The photo path prepares age as `const age = Number(row.age)` and feeds it to
`validateKid` (line 628). `Number('')` is `0`, and `validateKidAge(0)` passes (`src/lib/db.ts:2508` — 0
is a legal integer in 0–17), so: a name-only row (blank age) with a confirmed photo is persisted as a
kid with `age = 0`, while the card's own validation seam — `invalidKidRows`, line 583:
`row.age.trim() === '' ? NaN : Number(row.age)` — rejects that exact row at Continue. And a fully
**blank** row with a confirmed photo writes a kid with `first_name = NULL, age = 0` — the card's rule is
'blank rows are skipped, not written.' … the row then has frozen (disabled) name/age inputs, so the
fabricated age 0 cannot be corrected on the card, only in /settings."*

**`ocr` independently, same line:** *"`Number('')` is `0`, so a row with a blank age (only a name typed,
or a photo picked on an otherwise-blank row) passes `validateKid` — which accepts 0 — and `addKid`
writes a kid with age 0. This contradicts both the card's own seam (`invalidKidRows` maps blank age →
NaN → rejected) and the 'same pure seam' comment directly above. Mirror `invalidKidRows` instead of
bare `Number`."*

**I verified both legs, and the blank-row leg is real for a reason worth knowing:** `validateKidName`
**returns `null` for a blank name** — its own comment says *"No rule fires on a blank name any more"* —
so `validateKid('', 0)` passes, which is exactly why `invalidKidRows` needs its blank-row early return at
`:582`. **Do not "simplify" that away.**

**RULING: mirror the card's rule exactly — the blank-age conversion AND the blank-row skip — so the photo
confirm and Continue agree on what a writable row is.** The card stays usable on rejection: not written,
not uploaded, the same message Continue would show.

## F2 — [BOTH LANES] Index-based row identity: two separate index-shift bugs

**Reviewer (N1):** *"both `setKidRows` maps key on `i === index` … rows above can shift while
`addKid`/`uploadKidPhoto` is in flight: a row's Remove button is only disabled when THAT row holds the
lock … removing a row above during an in-flight confirm re-indexes the array. The attach then hits the
wrong row … or no row at all — the target stays `kid: null`, so Continue writes the kid a second time
(the exact duplicate-write invariant this slice claims to prevent) and Remove later drops local state
while the real DB row is left orphaned."*

**`ocr` (separate finding, same root):** *"`index` is captured at click time, but the filter runs only
after the awaited `removeKid` round-trip. Two rapid removes of two persisted rows … filter already-shifted
state: with rows [P0, P1], removing P0 then P1 lands P1's `filter((_, i) => i !== 1)` on `[P1]`, which
KEEPS it — a ghost row for a kid that was just deleted in the DB."*

**RULING: give each row a stable client-generated identity and attach every post-`await` write to that
identity, not to `index`.** That fixes the in-flight attach, the double-remove ghost, and the
`key={index}` render key in one stroke. **Both lanes agree this is the durable fix; `ocr` also offers
gating Remove on the whole lock window — that closes the narrow race but leaves the ghost, so prefer the
identity.**

**⚠️ This is a refactor of a data shape you wrote, so pin it:** the two tests in
`e2e/onboarding-kid-photo.e2e.ts` must still pass, and the double-write invariants they assert are the
point of the exercise.

## F3 — [`ocr`, MEDIUM] The signed-URL memo re-mints on every keystroke

*"the memo is keyed on `kidRows`, so ANY `kidRows` mutation — typing in a non-persisted row's name/age,
adding/removing a row — yields a fresh array … `photoKidIds` then recomputes with a new identity, and
that array is a dependency of its minting effect — so while even one persisted kid has a photo, every
keystroke triggers a batched `signedKidPhotoUrls` re-mint. This is at odds with the comment claiming the
hook 'only re-mints when the id set actually changes, not on every render of the page'."*

**I verified the re-mint: real.** `useKidPhotoUrls`'s effect deps are `[ownerProfileId, mintKey,
photoKidIds]`, and `photoKidIds` is a fresh array whenever `kids` identity changes.

**⚠️ BUT I could NOT verify the second half of the claim — that it "blanks the rendered photos until the
mint settles."** The guard is `if (resolved.key !== mintKey) return {}`, and **`mintKey` is a string
built from the id set, so it does NOT change when only the array identity does.** So the guard should
hold and the photos should not blank. **MEASURE IT OR SAY YOU COULD NOT: fix the re-mint (real), and
report what actually happens to the rendered photos rather than repeating the claim.** Inheriting a
severity neither of us proved is how a false finding gets written into the record.

**And the comment must stop lying either way** — say what the hook actually does.

## F4 — [`ocr`, MEDIUM] A rejected file is a silent no-op, and the kid rows disagree with the card above them

*"The `beginCrop` return value is discarded, so a rejected file is a silent no-op: `beginCrop` returns a
user-facing message for the ≤5MB/image-only gate, an unreadable decode, or a 0×0 image … Picking a phone
photo over 5MB opens no dialog and shows no error — the control just stays 'Add photo'. This page's own
name-card picker handles it explicitly … so the kid rows now behave inconsistently with the card above
them."*

**Verified: `void crop.beginCrop(file)` at `OnboardingPage.tsx:134`, while the name card does
`const error = await photoCrop.beginCrop(file)` and surfaces it.** *"The control just stays 'Add photo'"*
is a dead end for a parent on a phone.

**RULING: surface it on the card** (`setKidsError`, or an `onBeginError` prop — your call).

## F5 — [`ocr`, LOW] The photo lock is never released on unmount

*"This effect reports the lock on state changes but never releases it on unmount. Rows are keyed by
`index`, so when the list shrinks … the holder's `key` vanishes, its `useCropStep` unmounts and closes
the bitmap, but no component ever calls `onLockChange(index, false)`. `kidPhotoLockIndex` is then
stranded at a nonexistent index and `primaryDisabled={kidsSaving || kidPhotoLockIndex !== null}` leaves
Continue disabled for the rest of the mount (only Skip escapes)."*

**RULING: release the lock in an unmount cleanup.** **Note F2 may remove `key={index}`, but the unmount
case survives it** — a row can still be removed while its dialog is open — so fix this even if F2 lands.

## F6 — [REVIEWER, and it is a LIVE bug outside your diff] The same fire-and-forget class, one screen away

*"`src/pages/ProfilePage.tsx:2222–2224`: the existing per-kid `KidPhotoControl` wrapper is
`useCropStep(async (source, rect) => { onUpload(kidId, source, rect) })` — **the call is not awaited**,
`onUpload` is typed `(...) => void`, and the call site at `ProfilePage.tsx:1373` passes
`(k, source, rect) => void handleKidPhotoUpload(k, source, rect)`. This is the same shape you self-caught
in your own first draft … It is not exercised by any e2e, which is how it survived."*

**I verified it: `:2223` `onUpload(kidId, source, rect)` with the `void` type at `:2217`, and `:1373`
`void handleKidPhotoUpload(...)`.** It is the bug you found in your first draft, still live in the
shipped profile screen.

**RULING: fix it here — 2 lines.** Also **change both upload callbacks from `(...) => void` to
`(...) => Promise<void>`** (here and `KidRowPhoto`): **the `void` type is what let the floating call stay
invisible to the type system**, which is why this survived a review and two e2e runs.

**Run `e2e/profile-kid-photos.e2e.ts`** — `ProfilePage` is not your file, and it has its own spec.

---

## What is NOT yours

- **The trailing newline** on `e2e/onboarding-kid-photo.e2e.ts` — ruled to 8b's sweep; **do not fix it
  here** (a sweep belongs in its own commit).
- **The guard against this await class**, and **making the encoder's error loud** (a closed `0×0` bitmap
  should say *"the crop step released the bitmap before the upload finished"* instead of the misleading
  *"the chosen area is outside the image"*) — both to **8b**. **Do not build the guard now.**
- **The Continue-loop retry double-write** (`OnboardingPage.tsx:705–712`, pre-existing) — filed as an
  issue, not this round.

## Acceptance

1. **F1:** a name-only row and a blank row, each with a confirmed photo, **write nothing** — and say how
   you know (ideally an assertion in the existing spec, which is the cheapest place to prove it).
2. **F2:** every post-`await` write attaches by identity; `key` is no longer the array index; both
   existing tests still pass.
3. **F3:** no re-mint while typing in a non-persisted row; the comment tells the truth; **and you report
   what actually happens to rendered photos**, measured.
4. **F4:** an oversized/invalid file surfaces a message on the card.
5. **F5:** removing a row whose dialog is open does not strand Continue.
6. **F6:** the `ProfilePage` call is awaited by a `Promise<void>`-typed callback, and
   `e2e/profile-kid-photos.e2e.ts` passes.
7. **`npm run verify` exits 0** — report file/test counts and lint counts, and compare them against
   **67 files / 1993 tests / 0 errors / 81 warnings**.

## Verify

`npm run verify`, plus: `e2e/onboarding-kid-photo.e2e.ts`, `e2e/onboarding-resume.e2e.ts`,
`e2e/signup-zip-fallback.e2e.ts`, **`e2e/profile-kid-photos.e2e.ts`**. **Two known flakes — re-run once
before reporting either:** `scripts/guards/no-bypass-guard` and `e2e/places.e2e.ts:2759`. Kill listeners
**by port**, never `pkill -f`.

## Report

- **Committed as: `<sha7>`** — or say plainly *"not committed"* and why.
- **Per finding F1–F6: what you changed, and the command output that proves it.**
- **F3's measured answer** about the rendered photos.
- If you fixed fewer than six, **say which and why** — that is an acceptable report.
