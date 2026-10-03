# Slice 3 — optional kid photos on the kids card

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything.**
Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` section 6, slice 3, and fact 5** — this brief is a pointer with measurements.

## Why this slice exists, precisely

`uploadKidPhoto` **requires a persisted `kidId`** (`src/lib/db.ts:3092` — it writes the object to
`kidPhotoPath(profileId, kidId)` and then points that row's `avatar_url` at it). `addKid` **does
return the id** (`db.ts:2946`, `.select().single()` → a full `Kid`). **The onboarding kids card
discards it** at `OnboardingPage.tsx:391`: `await addKid(session.user.id, row.name, Number(row.age))`
— the return value is thrown away. That missing id is the whole slice.

## ⚠️ The hard constraint that decides the design (measured, not assumed)

**`useCropStep` closes the bitmap as soon as your `onConfirm` resolves.** From
`src/components/useCropStep.tsx`:

```ts
try {
  // Awaited BEFORE the close: the encoder reads this bitmap, so closing it
  // first would blank the upload instead of the preview.
  await onConfirm(source, rect)
} finally {
  setBusy(false)
  setPending(null)
  source.close()
}
```

**So there is no "crop now, upload later."** An `ImageBitmap` is ~48MB decoded and it is released in
that `finally` — anything that wants those pixels must finish inside `onConfirm`. Any design that
buffers "the cropped photo" for a later Continue must first turn it into a `Blob` **inside**
`onConfirm` (`prepareAvatarFile(source, rect)` exists and is exported, `db.ts:2559`) — and there is
**no blob-taking upload seam today** (`uploadKidPhoto` takes `source` + `rect`), so that path needs
a new `db.ts` function plus its sibling test under the build law.

## The shape this slice takes (decided — the write-timing change is behaviour, not mechanics)

**The row is written inside the photo's `onConfirm`, then the photo is uploaded to it.** Concretely,
for a kid row whose photo is confirmed:

1. validate that row with the same pure `validateKid` the card already uses,
2. `const kid = await addKid(session.user.id, row.name, Number(row.age))` — **keep the return**,
3. `await uploadKidPhoto(session.user.id, kid.id, source, rect)` — inside the same `onConfirm`,
   before the hook's `finally` closes the bitmap,
4. remember `kid.id` on the row, so **`handleKidsContinue` (`:377-400`) writes only rows with no id
   yet** and never double-adds.

**Why this shape and not the alternatives** (both were measured, both rejected, and the reasons are
worth not rediscovering):

- *Encode-at-confirm + upload on Continue* — needs a **new `db.ts` seam** (no blob-taking upload
  exists) and its sibling test, to buy nothing this shape doesn't have.
- *Two-phase card: Continue writes the kids, then the rows grow photo controls re-using
  `KidPhotoControl` verbatim* — the lowest-risk mechanics, but it puts a second Continue in front of
  the parent and makes the photo a separate act from "adding the kid", which is the opposite of this
  slice's objective. **If you find a measurement that makes the decided shape unsafe, stop and
  report it rather than silently switching** — that is a plan defect and I would rather hear it.

## Constraints you must respect (all measured)

- **`useCropStep` cannot be called inside a `kids.map` callback** — hooks run at a component's top
  level. The repo already solved this: see the comment at `ProfilePage.tsx:1750-1762` and the
  existing `KidPhotoControl` (`ProfilePage.tsx:2204`, which **requires a `kidId`** — that requirement
  is exactly what this card cannot satisfy, which is why it needs its own small per-row child).
  **One small child component per row; the parent owns the shared busy flag** so two rows never race.
- **Kid photos are PRIVATE.** `uploadKidPhoto` → `uploadPrivatePhotoObject`; reading the column
  directly is wrong. **Render through `useKidPhotoUrls`** (`src/components/useKidPhotoUrls.ts:43`,
  used at `ProfilePage.tsx:716`) — never the raw `avatar_url`.
- **`MAX_KIDS_PER_PROFILE = 5`** (`db.ts:2364`); `addKid` enforces it itself and throws.
- **A kid saved without a photo is normal, not an error** — the card's Skip and the blank-row skip
  paths must keep working untouched.
- The card's `testId="first-run-kids-card"` (`:702`) and the "Add a kid" control (`:712`) are used
  by specs — keep them.

## Acceptance criteria (demonstrate each; do not restate it)

1. Adding a kid **with** a photo stores it — the object lands in the kid-photos bucket at the
   canonical `<uid>/kids/<kidId>` path, and the row's `avatar_url` carries the bucket-qualified ref.
2. **It renders** via the signed-URL path (`useKidPhotoUrls`), not the raw column.
3. Adding a kid **without** a photo is unaffected — the row still validates and writes exactly as
   today.
4. **No orphan in either direction:**
   a. a photo is **never** attached to a kid row that does not exist, and
   b. a row written at photo-confirm time is **still saved** — pressing Continue afterwards does not
      write it twice, and **removing that row removes the real row** (today `removeKidRow` only drops
      local state, which would leak a kid the parent believed they deleted).
5. The cap still holds: `addKid`'s `MAX_KIDS_PER_PROFILE` error surfaces in the card rather than
   trapping the run.
6. A photo-confirm failure (validation, or the upload) leaves the card usable and the message
   honest — it must not strand the row in a state where Continue writes it again.
7. `npm run verify` exits 0.

## Verify

`npm run verify`. **Targeted e2e only:** at minimum `e2e/onboarding-resume.e2e.ts` and
`e2e/signup-zip-fallback.e2e.ts` (both ride the kids card's hop — `finishSignup` waits on it).
There is existing kid-photo coverage worth reading before you add any:
`e2e/kid-photo-exposure.e2e.ts`, `e2e/profile-kid-photos.e2e.ts`, `e2e/kid-names-privacy.e2e.ts`.
Kill listeners **by port**, never `pkill -f`.

**Two known flakes — re-run once before reporting either:** `scripts/guards/no-bypass-guard` (fails
under parallel load, passes 26/26 isolated) and `e2e/places.e2e.ts:2759`.

## Report format

- **Committed as: `<sha7>`** — or say plainly *"not committed"* and why. An absent field is read as
  evidence, not silence.
- Files changed with `+/-` counts.
- For each acceptance criterion: **the command and its raw output tail.**
- **State explicitly which shape you built** and, if you deviated from the decided one, the
  measurement that forced it.
- `npm run verify`: exit code, test-file count, test count, lint counts.
- Anything the plan did not anticipate — **say it rather than quietly fixing it.**
