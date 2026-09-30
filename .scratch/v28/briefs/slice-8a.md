# Slice 8a — make the code and the record honest

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything.**
Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` §6 slice 8** — it was split in two; **this is 8a**, and 8b (the mechanical sweep,
its guard, and the tools) is **not yours**. Do not do 8b's work here.

**Why the split:** slice 8 accumulated eleven workstreams, which is more than one builder context can
hold. The split is by **independence**, not size. Every item below is "something the code or a
comment claims that is not true any more."

## 1. Wire-or-delete — five orphans, each by name

For **each**, decide wire or delete, and prove it with a grep. **Never leave a test pinning a
function nobody calls** — that is the batch's standing rule.

| Symbol | Where | Note |
|---|---|---|
| `missingProfileItems` + `MissingProfileItem` | `src/lib/db.ts:2513,2511` | 0 production callers |
| `needsOnboarding` | `src/lib/onboarding.ts:30` | 0 production callers |
| `hasAvatarUrl` | `src/lib/avatarUrl.ts:19` | **slice 2 answered this one: NO legitimate use** — the name card renders only when `profile === null`, so there is never an existing photo to test. Check what else `avatarUrl.ts` exports before you touch the file, and take its test with it. |
| `restHeaders`' write-only headers | `e2e/onboarding-resume.e2e.ts:109` | `Content-Type` / `Prefer: return=representation` lost their only writer when the avatar-seed PATCH was deleted. Trim to what the GET needs. |

## 2. The stale-claim sweep — and ⚠️ grep, do not trust this list

Comments that assert something the app no longer does. **Line numbers below were measured at
different times and at least one has already been fixed by a later slice** — so **re-grep each claim
before editing**, and name the claim, not the line:

- `e2e/no-zip-notice.e2e.ts` — the walk "stops BEFORE the photo and area cards" (there is no photo
  card; the walk stops after the name card).
- `e2e/avatar.e2e.ts` — "the onboarding 'Add a photo' step is only reachable for users without a home
  zip" (slice 2 re-homed the photo onto the name card, so re-read this and fix what is now false).
- `src/App.tsx` — the nudge docblock still saying the kids/area cards **"do not exist yet"** (they
  shipped in slices 4a/5) and that **"no cards read `FIRST_RUN_COPY`"** (they do). **The plan first
  cited this at `:93` and measurement put the text at `:87`** — another reason to grep.

**Sweep the whole class, not just these three**: grep for other comments that describe the first run
as it was before r2 (the five-card sequence, the photo card as a step, `hasPhoto` as a live fact).
Report what you found and what you left, **with the reason** — a comment you judged still true is a
decision worth recording.

## 2b. Two more from slice 4 (both found by reading a claim against the code it describes)

- **`src/components/PlaceMap.tsx` — the V28 slice 4 audit comment misdescribes the marker-group effect.**
  It says the marker-group effect *"re-keys to the empty key and adds an empty layer group"* for a
  `markers: []` mount. **It does neither:** that effect's first statement is
  `if (map === null || markers.length === 0) return`, so with no markers it returns immediately.
  **The OUTCOME is correct** — the home pin and the radius circle are drawn by the separate overlay
  effect, which is why the pin-only spec sees the disc — so **do not change any behaviour.** Correct the
  comment to say the effect **early-returns** and that a pin-only mount needs nothing from it. **This is
  the batch's recurring class: a comment that describes a mechanism the code does not run.**
- **`zipFromAddressQueryBounded` is now production-orphaned, and the comment that names it is stale.**
  Slice 4 replaced the card's call with `locationFromAddressQueryBounded`, so the zip-only sibling has
  **no production caller left** — only its own unit tests (`src/lib/geocode.test.ts`), which do keep it
  alive so it is not dead code in the strict sense. **But `src/lib/onboarding.ts:16-20` still says the
  fallback note is "triggered by the card's bounded address lookup (`lib/geocode`'s
  `zipFromAddressQueryBounded`)" — which is no longer true.** Decide and report: **wire it back or delete
  it**, and either way **fix the comment**, because right now it points the next reader at the wrong
  function. *(Slice 4 deliberately left both alone: the file was out of its scope, and reporting an
  orphan beats silently deleting something on a guess.)*

## 3. The deferred 7c items

- **Extract `resolveCard(facts, skippedCards)`** — the card-resolution decision, pulled out of its
  current home so it is a pure, testable seam.
- **`ProfilePage.tsx:1218`'s missing empty-string clause** — a validation seam that does not handle
  `''` the way its siblings do. Fix it, and pin it in its sibling test.
- **The `finishSignup` pre-resolved-zip option** (`e2e/fixtures.ts`) — so a spec that already knows
  the zip does not re-walk the lookup.
- **Remove `e2e/auth.setup.ts`'s duplicated walk** — it repeats a sequence `finishSignup` already
  owns.

## Acceptance

1. Every symbol in the table is **either called somewhere or deleted, with its test** — and the report
   shows the `rg` output proving which.
2. Every stale claim is either corrected or reported with a reason for leaving it.
3. `resolveCard` is a pure function with a sibling test.
4. `npm run verify` exits 0.

## Verify

`npm run verify`. **Targeted e2e only**, and the `finishSignup` changes make
`e2e/onboarding-resume.e2e.ts` + `e2e/signup-zip-fallback.e2e.ts` mandatory. **`e2e/auth.setup.ts`
is every spec's setup** — if you break it, every spec fails, so run at least two specs that use it.
Kill listeners **by port**, never `pkill -f`.

**Two known flakes — re-run once before reporting either:** `scripts/guards/no-bypass-guard` and
`e2e/places.e2e.ts:2759`.

**⚠️ Do NOT sweep trailing newlines or add a newline guard** — that is 8b, and doing it here creates
a 65-file diff inside a hygiene slice, which is the blanket-sweep defect this batch has hit four
times.

## Report format

- **Committed as: `<sha7>`** — or say plainly *"not committed"* and why; an absent field is read as
  evidence.
- Files changed with `+/-` counts.
- **The wire-or-delete decision for each of the five symbols, by name**, with the grep that proves it.
- For each acceptance criterion: the command and its raw output tail.
- `npm run verify`: exit code, test-file count, test count, lint counts.
- Anything the plan did not anticipate — **say it rather than quietly fixing it.**
