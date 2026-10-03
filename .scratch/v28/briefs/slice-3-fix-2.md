# Slice 3 — FIX ROUND 2 (resume the original builder)

Fix round 1 (`3f51d53`) passed the reviewer and the verifier. **Then `ocr` reviewed the fix diff and found
five things that need doing, one of them a REGRESSION your F3 change introduced.** Six of the seven
findings are grouped here or in 8b; **two are already assigned to 8b and are not yours** (the F3 test's
flake window, and the inert `eslint-disable`).

**⚠️ THE REGRESSION IS THE POINT OF THIS ROUND.** A fix that trades a bug for a bug is not a fix, and this
one does — so fix R1 first, and read R2 before deciding the key's new shape, because they touch the same
line.

**If any of the five cannot be done well, STOP and report which.** Partial and honest beats complete-looking.

---

## R1 — [`ocr`, MEDIUM] The F3 keying killed the re-pick refresh: a re-picked photo never appears

*"`uploadKidPhoto` returns a deterministic ref (`kidPhotoStoredRef(uid, kidId)`), so a re-pick on an
already-persisted row changes nothing in this key — same kid id, marker still 1, same `avatar_url` string.
`persistedKids` keeps its identity, so `useKidPhotoUrls`'s minting effect never re-runs, the signed URL
stays byte-identical, the `<img>` never re-fetches, and the newly uploaded photo (which overwrote the
canonical path) is invisible for the rest of the mount. Before this change the memo was keyed on `kidRows`
identity, so the re-pick's `setKidRows` re-minted as a side effect and the image refreshed — this fix
killed that refresh along with the keystroke churn."*

**I verified every link in that chain: `kidPhotoStoredRef` is deterministic (same uid + kidId → same
string), and `persistedKidKey` is only `${kid.id}:${avatar_url ? 1 : 0}`.** So a re-pick writes the same
`avatar_url` value, the key does not move, and the card keeps showing the old image. **The photo IS
uploaded correctly — the card just lies about it**, which is the worst version of this bug for a parent
who re-picked because the first photo was wrong.

**⚠️ AND NOTE WHY THE REVIEWER MISSED IT:** it considered this exact case and reasoned *"the only possible
`kid` delta is a re-pick's re-attached `avatar_url` — same canonical ref, same non-empty marker — and that
is all the hook consumes"* — **and concluded that was fine. But "the hook only consumes the id set" is
precisely why it cannot see new bytes at the same path.** A correct premise with a wrong conclusion.

**`ocr`'s suggestion:** fold a per-row generation counter into the key, incremented in
`handleKidPhotoConfirm`'s re-pick branch. **That is the shape I want: the key must change when the IMAGE
changes, not when the id set changes.** Whatever you choose, **a re-pick must produce a fresh mint** — and
pin it, because that is the property that just silently broke.

## R2 — [`ocr`, LOW] `crypto.randomUUID()` is called INSIDE the state updater

*"updaters should be pure (StrictMode double-invokes them, so each invocation mints a different key, and
the committed row's key depends on which invocation React settles)."*

**Verified at `OnboardingPage.tsx:594`.** Hoist the key out:

```ts
function addKidRow() {
  setKidsError(null)
  const key = crypto.randomUUID()
  setKidRows((rows) => [...rows, { key, name: '', age: '', kid: null }])
}
```

**This is the same line as R3 — do them together.**

## R3 — [`ocr`, MEDIUM] `crypto.randomUUID` does not exist in a non-secure context

*"`crypto.randomUUID` is only available in secure contexts (HTTPS/localhost); in a plain-HTTP deployment it
is `undefined` and this call throws an uncaught `TypeError` that breaks 'Add another kid' with no
user-visible error. It is also the only client-side id source in the repo — no fallback exists."*

**The severity is lower than it sounds** — production and the preview are HTTPS, and `localhost` counts as
secure — **but a phone testing against a LAN address (`http://192.168.x.x`) is NOT a secure context, and
the human playtests on her phone.** The key only needs session-uniqueness, not cryptographic strength.

**Put a small helper in `src/lib/`** (with its sibling `.test.ts` — the build law requires it) that falls
back to `Date.now()` + `Math.random()`. **That also gives R2 somewhere to live.**

## R4 — [`ocr`, LOW] The blank-age rule now exists in three page-local forms — one of them still wrong

*"The F1 blank-age→NaN rule is now duplicated in the page (`invalidKidRows` + here) while the third site —
`handleKidsContinue`'s write path — still uses the old `Number(row.age)`, which fabricates age 0 on a blank
age. It is safe today only because `invalidKidRows` runs first… the rule is a domain decision encoded in
three slightly different page-local forms."*

**Verified: `OnboardingPage.tsx:791` is still `addKid(session.user.id, row.name, Number(row.age))`.** It
is safe only by the *order* of two unrelated statements — **which is exactly the kind of trap this batch
keeps finding.** "Safe because something else runs first" is a fact that a future edit can delete.

**Extract one pure helper next to `validateKidAge` in `src/lib/db.ts`** (`kidAgeFromInput(ageInput: string):
number`, blank → `NaN`) and call it from **all three sites**. That is the build law, and it removes the
duplication F1's fix created rather than adding a fourth copy.

## R5 — [`ocr`, LOW] F4 only sets the error, never clears it — and its comment claims parity it does not have

*"The new F4 wiring only ever SETS the shared `kidsError` (`onBeginError={setKidsError}`) and never clears
it on a successful pick. The name card's picker clears `photoError` before each attempt, so the F4 doc
comment's claim of parity ('the name card's picker does the same') is inaccurate. Consequence: a rejected
file (e.g. >5MB) shows its error; a subsequent valid pick + confirm then leaves the stale rejection
message on the card next to the successfully added photo — and on a persisted row the name/age inputs are
disabled, so `updateKidRow` can't clear it either."*

**Verified: the name card clears at `:449`, `:472` and `:903`; the kids card never does.** Fix the
behaviour **and** the comment — **the comment is the part I care about most, because a comment that claims
parity is how the next reader stops checking.**

---

## Not yours (already in 8b)

- **The F3 test's flake window** (the fixed 800 ms sleep before the src-equality assertion).
- **The inert `eslint-disable`** (two of them guard one memo; determine which by removing).

## Acceptance

1. **A re-pick on a persisted row produces a fresh mint and the card shows the NEW image** — pinned by a
   test, since this is the property that just broke silently.
2. The row key is generated outside the updater, via a `src/lib/` helper **with a sibling test**, and
   `crypto.randomUUID` is not called bare.
3. `kidAgeFromInput` is one pure function in `src/lib/db.ts` called from **all three** sites, with tests.
4. A rejected file's message does not survive a successful pick, and the comment says what is true.
5. `npm run verify` exits 0 — **67 files / 1993 tests / 0 errors / 81 warnings** — and **the count must
   rise for the new lib test**, so say by how much.

## Verify

`npm run verify` + `e2e/onboarding-kid-photo.e2e.ts` + `e2e/onboarding-resume.e2e.ts` +
`e2e/signup-zip-fallback.e2e.ts` (the kids card is in all three). **Two known flakes — re-run once before
reporting either:** `scripts/guards/no-bypass-guard` and `e2e/places.e2e.ts:2759`. Kill listeners **by
port**, never `pkill -f`.

## Report

**Committed as: `<sha7>`**, then per finding: what changed and the output that proves it. **For R1, say
explicitly how the test would FAIL if the key went back to ignoring the re-pick** — that is the whole
point of the round.
