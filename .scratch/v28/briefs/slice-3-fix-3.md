# Slice 3 — FIX ROUND 3 (resume the original builder)

**⚠️ READ THIS FIRST: THE PRODUCT CODE IS CORRECT. THE TEST IS WRONG. DO NOT CHANGE THE PRODUCT.**

Fix round 2's re-pick fix is right, and I have verified the mechanism end to end. What failed is the
**pin** you added for it — and it failed for a timing reason, not a logic one. **Changing product behaviour
in response to this round would break something that works.**

## What happened

The verifier ran `e2e/onboarding-kid-photo.e2e.ts` and got **1 failed, 5 passed**:

```
✘  6 fix round 2 (R1): a re-picked photo on a persisted row re-mints and the card shows the NEW image
   Error: the re-pick overwrote the canonical path with DIFFERENT bytes (photo B, not photo A)
   expect(received).toBe(expected)
   Expected: false   Received: true
```

**But you reported 6/6 passing after your mutation test.** **Both reports are accurate** — that is the
signature of a race, and it is exactly why a single green sample is weak evidence. **You did not make a
false claim, and you should not now "fix" a defect that the evidence says is not there.**

## Why the mechanism is sound — the chain I verified

1. `uploadKidPhoto` -> `uploadPrivatePhotoObject`, which writes with **`upsert: true`**
   (`src/lib/db.ts:2748`). **An overwrite of an existing object is supported.**
2. `photoGen` is bumped **only inside the success branch** of the re-pick (the `catch` does not bump).
3. **The verifier watched the fresh mint fire** — the key changed, which can only happen through the
   `photoGen` bump, which can only happen on success.
4. **Therefore the upload succeeded and the object WAS overwritten with the new bytes.**

So the assertion that failed was reading the object **before the overwrite became visible to that read**.
The test does one byte fetch immediately after the confirm; on a slower read path it gets photo A.

## The fix — make the assertion wait, don't make the product change

- **Poll the object's bytes until they differ from photo A** (bounded, with a clear failure message naming
  what was waited for). A single fetch is an assumption about timing; this file already contains one
  timing assumption 8b owns.
- **Do the same for the `src`-swap assertion if it is equally immediate** — same class, same file, same
  fix. Say whether you changed it.
- **Do NOT touch `upsert`**, the re-pick branch, `photoGen`, or `kidRowKey`.
- **Do NOT touch the F3 flake window** (`waitForTimeout(800)`, spec `:265`) — that is 8b's, deliberately.

## Acceptance

1. The new test **passes repeatedly** — run it **at least 3 times** and report each result. One green run
   is what got us here.
2. **Prove the assertion can still fail**: re-run your mutation (remove `photoGen` from the key) and show
   the test going red **for the fresh-mint reason**, then restore. A wait that is so generous it can never
   fail is the vacuity class, and this branch of the batch has ruled on that twice.
3. `npm run verify` exits 0 — **68 files / 2001 tests / 0 errors / 81 warnings**.
4. The three specs pass: `onboarding-kid-photo`, `onboarding-resume`, `signup-zip-fallback`.

## Verify

As above. **Two known flakes — re-run once before reporting either:** `scripts/guards/no-bypass-guard` and
`e2e/places.e2e.ts:2759`. Kill listeners **by port**, never `pkill -f`.

## Report

**Committed as: `<sha7>`**, the **three run results** for the changed spec (not one), the mutation re-proof,
and the acceptance numbers. If you believe the product IS at fault despite the chain above, **say so and
stop** rather than changing it — that would be a real finding and I want it argued, not assumed.
