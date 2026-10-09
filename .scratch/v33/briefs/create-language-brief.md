SENTINEL: CREATE-LANGUAGE-HOST-DROPIN-P9Q2

Slice: the create affordances use Jon's decided language (host/create, never "start").
Repo: ~/Projects/playdate-app. Base: HEAD. Do not push.
OWN WORKTREE — derived from THIS FILENAME (/tmp/pd-wt/create-language).
Commit on branch create-language; never touch main or another lane's path.

## Jon's decision (2026-10-08, verbatim)
- "I finally decided, it should be CREATE A DROP-IN." (the + action)
- "They should say HOST A DROP IN because you're not STARTING it right away."
- The feed must read clearly as "drop-ins others are HOSTING near you" — distinct
  from the "+" where YOU create one. (`mv0cg1d6`, `mv0ceczk`, `mv0culjp`, `mv0czk74`)

## Work — copy/label pass (no behavior change)
1. The "+" action's name: `PostActionButton.tsx` `aria-label="Post a drop-in"` →
   **"Create a drop-in"**. This is the app's ONE create affordance.
2. Every **"Start a drop-in"** affordance (PlaceDirectory.tsx row action + invite
   line, PlaceMap.tsx place panel) → **"Host a drop-in"**. These mean "host one AT
   this place" (the PlacePrefill path), so "Host" is right, not "Create".
3. The **feed** surface label/title: make it read as drop-ins others are hosting near
   you. Grep App.tsx / FeedPage for the feed's visible label and any one-line subtitle;
   if a subtitle is absent, ADD ONE short honest line, e.g. "Drop-ins other parents are
   hosting near you." Keep it to one line (minimalism); do not invent a hero.
4. Keep the placeholder example copy ("e.g. Playground time at Green Lake") as-is.

## What must NOT change
- The routes (/new), the PlacePrefill wiring, any behavior. This is a LABEL pass.
- Testids stay the same (only human-visible text/aria changes). If a spec asserts the
  OLD string, update that spec in the SAME diff.

## Acceptance
1. The + action's accessible name is "Create a drop-in".
2. No user-visible "Start a drop-in" remains (grep clean; update any spec asserting it).
3. The feed states, in one line, that these are drop-ins others are hosting.
4. No layout shift at 390px (labels fit; no overflow).

## Gate
ALLOW_CONFIG_CHANGE="vite.config.ts: another lane's unstaged dev-only change, not this slice" npm run verify
ALLOW_CONFIG_CHANGE="vite.config.ts: …" npm run guards   # GUARDS: PASS
Run any e2e spec whose locator names the old copy (grep e2e/ for "Start a drop-in"/"Post a drop-in").
The gate must be FULLY green — no waivers. Stage BY PATH ONLY.

Report .scratch/create-language-report.md, then reply:
Sentinel: CREATE-LANGUAGE-HOST-DROPIN-P9Q2
Status: DONE | BLOCKED
Commit: <sha7>
