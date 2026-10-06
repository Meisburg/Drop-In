# Brief — the location note that reads as an app setting (founder's own note, unanswered)

## The founder's words (2026-09-xx 15:24, pinned to `p.text-xs.text-slate-600`)

> *"I'm not sure why it says location is off for a drop-in. I never turned it off
> and it should just be on by default, right I also don't see in the settings
> where you turn it off or on either."*

**Both sentences are the copy's fault.** The note says *"Location is off for Drop
In"* — which reads as a setting **of the app**. It is actually the **browser's
per-site permission**, and the app has no such setting at all. His second
sentence (*"I don't see in the settings where you turn it off or on"*) is the
natural next move for someone told otherwise — he went looking for a setting that
does not exist. **Nothing has answered this note.** `git log -S "Location is off
for Drop In"` finds exactly one commit, `1459b79`, which **predates** it.

## What exists today (measured this turn)

The sentence exists **twice**, with its clauses **swapped**, and **nothing pins
either** (`grep -rn "Location is off" src/lib/` → nothing):

| Site | String |
|---|---|
| `src/components/LocationModal.tsx:203` | `'Location is off for Drop In. Turn it on in your browser settings, or type an address.'` |
| `src/pages/OnboardingPage.tsx:1196` | `'Location is off for Drop In. Type your address instead, or turn it on in your browser settings.'` |

This is the **one-copy rule firing on a string**, and it is why the two sites
already disagree in emphasis.

**The `denied` branch is the only wrong one — and the repo already contains the
correct framing.** The `unsupported` branch at `LocationModal.tsx:199` says
*"**This browser** cannot share your location. Type an address instead."* — it
names the **browser** and never implies an app setting. That is the model to
follow.

The neighbouring messages are near-duplicates across the two files too
(`LocationModal.tsx:199,203,207` vs `OnboardingPage.tsx:1192,1196,1200`).

## The task

1. **A `src/lib/` module** (e.g. `locationCopy.ts`) holding the shared location
   notes as pure values/functions, consumed by **both** call sites — per the
   build law (`docs/agents/code-structure.md`: domain logic in `src/lib/` as pure
   functions, **every `lib/*.ts` ships a sibling `lib/*.test.ts`**).
2. **Rewrite the `denied` sentence** so it:
   - does **NOT** read as a setting of this app (no "for Drop In" as the subject),
   - names the **browser** as the thing holding the permission,
   - puts the **actionable alternative** (typing an address) in reach — the
     parent is stuck at that moment and needs a way forward, not a diagnosis,
   - stays in the app's voice: plain, warm, no jargon, and **not** scolding. Read
     `src/lib/notificationSectionCopy.ts` and `src/lib/firstRunCopy.ts` for the
     house voice.
3. **Unify or deliberately vary the neighbouring messages.** The two sites differ
   slightly (`'Type an address instead'` vs `'Type your address instead'`) — that
   may be intentional because onboarding has the address field on screen. Decide,
   and **say which you chose and why** in a comment. Do NOT vary silently.
4. **Pin it with a sibling test** that would fail if the sentence regressed to
   the old framing. Specifically test that the `denied` copy does **not** contain
   the reading the founder had. Consider asserting on the *property* (the browser
   is named; the string does not open with `Location is off for Drop In`), not
   merely a snapshot of the new sentence — a snapshot test would pass forever
   after any edit, and the point is that this framing must not come back.

## Acceptance criteria

1. The `denied` note names the browser and no longer reads as an app setting, at
   **both** sites.
2. One home for the copy; the two sites cannot drift.
3. A sibling test pins the corrected framing, and **fails** against the old
   string (prove it: seed the old string, watch it go red, restore).
4. `npm run verify` exit 0.

## ⚠️ COLLISION WARNING — read before you touch anything

`src/components/LocationModal.tsx` carries **ANOTHER SESSION'S UNCOMMITTED WORK**
(a V31 locate-button animation, roughly **lines 348–380**, with `index.css`
support). **Do not revert, reformat, restage, or "tidy" it.** Your edit is at
**line ~203** and the two are far apart.

- Do **NOT** run `git stash`, `git checkout -- <file>`, or `git add -A`.
- Do **NOT** commit — the orchestrator stages by hunk and commits.
- Do **NOT** touch `.gitignore`, `src/index.css`, `src/pages/FeedPage.tsx`, or
  that button block.
- If you need a red-green mutation in a dirty file, back it up byte-for-byte and
  restore from the backup, then prove the restore — **and never restore the file
  from git**, which would silently destroy the other session's work.

## Verification command

`npm run verify` (build + test + lint) plus a focused run of your new sibling
test. **Never a bare `npx playwright test`** — it writes to production. No e2e
spec asserts the old text (checked: `grep -rn "browser settings" e2e/` → nothing),
so no spec needs updating; confirm that yourself rather than trusting this line.
