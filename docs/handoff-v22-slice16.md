# Handoff: V22 → V23 (the family-photo order fix)

> Written 2026-09-23 by the V22 session, standing down after a concurrent-writer
> collision with V23. **V23 owns this checkout from here.**
> Read `.scratch/v23/ledger.md` and `plan-v23.md` first; this file adds only what
> V23 does not have.

## Why V22 stopped

Two agents were editing this checkout at once (V22 from ~07:00, V23 from ~12:47).
Both ledgers record the clobber; it was mutual and invisible until the two were
compared. V22's work is committed and pushed, so V22 is the cheaper session to
stop. **One writer per checkout was violated — see the proposed rule at the end.**

## V22's final state (all committed, pushed, deployed)

| Commit | What |
|---|---|
| `67544b0` | V22 slices 1–13: the design-quality batch |
| `7dd74ce` | V22 s14: light default + dark opt-in toggle |
| `ff49d0c` | V22 s15: edit-profile kids-before-parents |

Gate on `ff49d0c`: 1156 tests, 0 lint errors, 6-stage `verify` PASS.
Docs: `V22-SUMMARY.md`, `AUDIT.md`, `DESIGN-REVIEW.md`, `MASTER-IMPROVEMENTS.md`,
`PRODUCT.md`, per-slice evidence in `.scratch/v22/ledger.md`.

## THE UNFINISHED WORK — this is the point of this file

**The human's report (their own pasted text, ground truth):**

READ VIEW (`/profile`, the one they LIKE):
```
Profile / This is what other families see. / Edit profile
@Jon Meisburg ... Hosted 10 drop-ins
About the kids
About the parents
  @Jon Meisburg's photo
  "Energetic kiddos looking to connect..." (the bio)
  @Jon Meisburg's family photo      <- INSIDE the parents card, AFTER the bio
Hosted drop-ins
```

EDIT MODE (behind "Edit profile"):
```
Profile / Let families get to know you! / Done
Your photo & name
A photo of your family              <- ITS OWN CARD, 2nd POSITION
About the kids
About the parents
The parents
Linked parent
```

Their words: *"I like the profile page just as it is. I just think that when you
click edit profile, it shouldn't be out of order information that's different
from the profile page."*

### The actual mismatch: THE FAMILY PHOTO'S POSITION

- **Read view:** `src/components/ProfileView.tsx` ~505-515 renders the family
  photo as the CLOSER **inside** the "About the parents" card, after the bio.
  On screen it is **4th**.
- **Edit view:** `src/pages/ProfilePage.tsx` ~1160-1192 renders it as its **own
  card in the 2nd position**, before the kids.

Same information, two different positions. That is what makes the editor feel
like a different page.

### What it is NOT

**Kids-vs-parents was never the problem.** Both surfaces are already kids-first.
V22 burned ~3 rounds on this because it was built from the human's *prose
description* of the read view rather than from the rendered page, and verified
against a test account with no bio/kids/photo (so the check measured an empty
list and "passed"). V22 s15's kids/parents move was factually correct and is not
a regression — keep it — but it was aimed at the wrong target.

## The root cause both sessions found independently

`profileBlurbOrder()` in `src/lib/photoStorage.ts` **computes** a block order.
**Nothing uses it for layout** — the JSX hard-codes its own sequence. A seam that
describes an order the JSX ignores is worse than no seam: it reads as
authoritative and it is why this drifted and why both sessions misread it.

**V23 owns this file.** V22's spec and V23's slice 16 are the same fix. Make the
seam real (or delete it and replace it), then have BOTH surfaces render from it.

## The fix, as V22 specified it (fold into V23's slice 16)

1. **One shared ordered description** of the profile's blocks; both surfaces
   consume it. Prefer making `profileBlurbOrder` authoritative over inventing a
   parallel concept. Keep it pure + sibling-tested (build law).
2. **Move the EDIT surface's family photo** so its on-screen position matches the
   read view's — after the bio, in the parents region, not 2nd before the kids.
   It must stay a reachable, obvious Add/Change control.
3. **Do NOT change the read view.** The human likes it as-is. Touching
   `ProfileView.tsx` is only acceptable as a zero-visual-delta refactor to
   consume the shared constant.
4. **The check must compare the TWO SURFACES AGAINST EACH OTHER** — not each
   against a pinned constant. `scripts/profile-order-check.mjs` already exists
   (V22 wrote it) and currently checks the pinned order only. Extend it to fail
   when the two surfaces diverge, naming both sequences.
5. **Prove it red-green.** Run the extended check before the reorder (capture the
   FAIL showing the divergence), then after (capture the PASS). A comparison
   check never observed to fail is not a check.

## The generalizable lesson (this repo keeps re-learning it)

**A check that passes is not the property holding.** V22 recorded four instances,
then caused a fifth: a byte-offset analysis of the minified bundle was presented
as proof of render order. Byte offsets group module definitions; they say nothing
about mount order. V23's own ledger records the same class (an acceptance test —
`scrollWidth <= clientWidth` — that is TRUE on the buggy code).

The fix is always the same: **replace the proxy with a real assertion** against
the rendered artifact.

## Proposed rule for `AGENTS.md`

> **One writer per checkout.** Before dispatching any builder, confirm no other
> session is active: `git status` / `git stash list` must be clean, and a second
> session's ledger must not be live. Two agents ran concurrently here on
> 2026-09-23 and silently reverted each other's work for over an hour; neither
> noticed until the ledgers were compared. The existing "one builder at a time"
> invariant covers builders within a session, not sessions within a checkout.

## Artifacts worth keeping

- `scripts/profile-order-check.mjs` — the profile-order checker (extend it)
- `scripts/theme-contract-check.mjs` — light-default/dark-opt-in contract, 10 checks
- `scripts/a11y-dom-check.mjs`, `focus-indicator-check.mjs`, `dark-mode-check.mjs`,
  `layout-width-check.mjs` — the other V22 gates
- `docs/design-review/*.png` — the screenshots the human reviewed
