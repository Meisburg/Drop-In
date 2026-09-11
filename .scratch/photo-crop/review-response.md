# Fresh-context review of the crop feature — findings and resolutions

**Status:** closed 2026-09-11. Reviewer: an independent subagent with no prior
context on this work. **Verdict: NEEDS_CHANGES** — one high-severity defect and a
tier of real smaller ones. All were fixed except one nit, which is accepted with a
reason below.

The reviewer was asked to attack four things: whether the preview really equals the
encode, the geometry maths, React correctness in the dialog/hook, and behavioural
regressions. Its priority-1 and priority-2 categories came back **clean**, and it
verified the maths independently rather than by reading the test file: a 270,000-case
fuzz of the real `photoCrop.ts` found zero non-square, non-finite, out-of-bounds,
divide-by-zero or gap-producing cases, and it confirmed `clampCropState` is genuinely
sufficient — so the extra origin clamp in `cropRectFor` is defensive rather than
papering over a real hole. It also confirmed the drag sign convention and the
source-px/window-px units from scratch.

## 1. HIGH — `imageOrientation: 'from-image'` broke every upload on older engines

`useCropStep.tsx` passed `{ imageOrientation: 'from-image' }` to `createImageBitmap`.
That member is a **WebIDL enum**, and WebIDL *throws* a `TypeError` for an enum value
the engine does not know — unknown dictionary KEYS are ignored, unknown enum VALUES
are not. The value only exists in Chrome/Edge 112+, Firefox 111+ and Safari 16+, while
**Vite 8's own build-target floor is `chrome111 / edge111 / firefox114 / safari16.4`**
(verified in `node_modules/vite/dist/node/chunks/node.js`) — so Chrome and Edge 111 sit
*inside* this project's declared support envelope. There the call threw, the `catch`
turned it into "Could not read that image. Try a different photo.", and **no photo could
be uploaded at all**, with a message that blamed the user's file. It also bought
nothing: `from-image` is the default in every engine that has the value.

**Fixed:** the option is gone; plain `createImageBitmap(file)` honours EXIF identically
on modern engines and cannot throw on old ones. The reasoning lives at the call site,
because "just be explicit" is exactly what a future reader would try to re-add.

**Guarded so it cannot come back:** `scripts/crop-flow-harness.html` now wraps
`createImageBitmap` and records the argument count of every call; the verification
asserts it is always 1. Because no *current* browser can reproduce the original throw,
the guard is checked for vacuity in the same run — a patched engine is installed that
throws when handed any options object, and the old call is confirmed to fail against it
while the shipped path succeeds.

## 2. The rest of the tier, all fixed

| # | Finding | Fix |
|---|---|---|
| 2 | A decode resolving **after unmount** leaked the bitmap, contradicting the hook's own docstring (the unmount cleanup ran before `pendingRef` was set) | Added `mountedRef`, re-armed in the effect BODY — not assumed true, because StrictMode runs mount→cleanup→mount and a flag that is only ever lowered would reject every photo in dev |
| 3 | Pointer bookkeeping could **permanently wedge** pan/pinch (a missed `pointerup` left `size >= 2` with a null base, so the handler did nothing forever), and a **3→2 finger lift kept a stale pinch base** and jumped the zoom | `syncPointers()` re-derives the base from the pointers down *right now*, on every add/remove; the move handler self-heals a null base; `onLostPointerCapture` is wired as a release |
| 4 | Wheel zoom dropped deltas when events outpaced renders (base read from a lagging ref) | Derived inside the updater from `current` |
| 5 | Escape was not gated on `busy` while the backdrop click was | Gated, matching the backdrop |
| 6 | The e2e comment claimed it proved "a square upload" when nothing read the stored object | It now **fetches the stored object back** and asserts it is square and ≥512px, and the header comment states precisely what the spec does and does not prove (framing is proven by the unit tests and the harnesses, not here) |
| 7 | User-facing copy still promised "a 256px square" after ticket 04 | Copy and four stale comments updated |
| 8 | Nothing guarded the encoder's `rect`, and `AVATAR_SIZE_PX` had no test — reverting ticket 04 would have failed nothing | `isDrawableRect()` added to the pure module (6 tests) and enforced in `prepareAvatarFile` (a zero/non-finite rect otherwise yields a blank JPEG with no error); `AVATAR_SIZE_PX` and `AVATAR_MAX_BYTES` pinned in `db-v2.test.ts` |
| 9 | The evidence for the central claim was deliberately gitignored, so nobody else could reproduce it | The three harnesses moved to **`scripts/`** and are now TRACKED, with a `.gitignore` note explaining why |
| 10 | `validateAvatarFile`'s doc implied the gate was enforced inside the upload path | The doc now says where the gate actually lives (`useCropStep.beginCrop`), that the AC holds **by convention** rather than by construction, and what the alternative would cost (a second ~48MB decode per photo) |
| 11 | `DrawTransform` returned `scale`, leaving the caller to multiply out the draw size | It now carries `drawWidth`/`drawHeight`, the preview consumes them, and assertions were added |

## 12. Accepted, not fixed

The hook returns `busy` and no product caller reads it (the pages track their own
flags; the dialog is busy-gated internally). Kept: the flow harness uses it, it is part
of a coherent hook surface (a future caller will want to disable its own control), and
removing it would be churn for a nit.

## What is still NOT verified, after all of this

- **Any real WebKit/Safari engine.** No WebKit binary is installed here; finding 1's
  Safari/iOS impact rests on version data, not a local repro.
- **EXIF orientation on a real camera file.** Preview and encode share one decoded
  bitmap so they cannot disagree *with each other*; whether that bitmap is upright for
  a file carrying a non-identity orientation tag has not been exercised end to end.
  Ticket 03's AC still stands open on this.
- **The e2e suite itself** — it signs a marker up against the live Supabase project, a
  mutation, so it was only listed (`--list`: 19 tests, well-formed), never run.
- **Whether 512px is visibly sharp in the lightbox** — perceptual, needs a phone.
