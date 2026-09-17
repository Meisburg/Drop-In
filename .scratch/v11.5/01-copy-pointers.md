# V11.5 ticket 01 — stale /profile→/settings copy pointers

> Polish batch following V11 t06 (settings reorg). Origin: V11 t06 reviewer
> finding-(a), parked as the RANKED 1 follow-up in `.scratch/v11/HANDOFF.md`
> and the V11 section of `task-state.md`. This batch is the V11.5 open thread
> from that record.

- **Status:** DONE — 2026-09-17 — code b092886 + comment fold-in 5d85caa; gate: build exit 0, 818/818 unit, lint 0, e2e spot-check 3/3; pushed 05c9981..5a81d5c + live (entry index-Cw5AYnKF.js carries the new copy, old copy 0); review fix db.ts:3582 in the V11.5 review-fix commit
- **Batch:** V11.5 (copy polish only — no behavior, no migration, no routes)

## Background

V11 t06 (`e5d1462`) moved every editable control from `/profile` to a new
`/settings` route (ProfilePage became the read-only "what others see" view;
SettingsPage owns profile editing, location, kids, notifications, and the
Following lists). The reorg updated its own in-scope cross-references, but
copy that *predates* t06 still points at "/profile" as the place to edit.

## What changes (user-facing strings only)

1. `src/pages/OnboardingPage.tsx` — 6 strings:
   - line 210: `` `${err.message} You can add it later in your profile.` ``
   - line 211: `'Could not save your bio. You can add it later in your profile.'`
   - line 223: `` `${err.message} You can add your kids later in your profile.` ``
   - line 224: `'Could not add your kids. You can add them later in your profile.'`
   - line 282: `change it later in your profile.` (display-name step prose)
   - line 338: `anytime in your profile.` (location step prose)
   All become "…in your settings." (prose lines keep their existing phrasing
   around the swap).
2. `src/pages/UserPage.tsx:564` — "On your Following list (/profile) —" →
   "On your Following list (/settings) —" (the Following list moved to
   /settings in t06; verified `SettingsPage.tsx:1233` renders it).
3. `src/pages/PlacePage.tsx:408` — "keep it on your /profile Following list."
   → "keep it on your /settings Following list."

## Verified constraints

- No unit test or e2e spec pins any of the 8 old strings (grep across `src/`
  and `e2e/`: zero matches outside the files being edited). No test edits
  expected.
- No routes, no behavior, no migration (`supabase/` untouched).

## Acceptance criteria

- [x] The 8 strings updated as above; no other source changes in the ticket commit.
- [x] `npm run build` exit 0.
- [x] `npm run test` 818/818 (or current count if changed upstream — no test
      edits expected).
- [x] `npm run lint` 0 errors.
- [x] Spot-check in the built app: /onboarding shows the settings wording;
      /u/:handle Following line points at /settings.

## Optional fold-in (RANKED 2 — separate commit, comment-only)

Stale `/profile` comments + doc nits from the same t06 review, zero runtime
effect: `db.ts:2403-2405`, `db.ts:3547/3609`, `db-v2.test.ts:108`,
`WhileAwayCard.tsx:5`, `push.ts:47/385/573`, `pushClient.ts:11/143/200/392/463`,
`OnboardingPage.tsx:138/203/386`, wrong historical note
`e2e/push-subscribe.e2e.ts:493`, JSDoc indent `e2e/loop-closing.e2e.ts:27`.
Fold in only with the founder's go (default: include — it is the same reviewer
finding list and touching prose-only).

## Discipline

- One writer; re-read a file before editing.
- Gate re-run by the coordinator, never trusted from the builder alone.
- No push without explicit human authorization.