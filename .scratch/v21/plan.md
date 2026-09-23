# Implementation Plan: V21 — the phones-review batch

> Owned by the orchestrator. Written BEFORE any builder dispatch.
> Gate per slice: `npm run verify` unless a slice pins more.

## Goal

All ten tickets in `.scratch/v21/spec.md` shipped: the nav says "Drop Ins" and
no longer offers Places; the place list + map live inside `/new`'s "Where?"
block; reactions grow to six; the avatar is a circle; the duplicate picker stops
spilling; the hosted count reveals history; parents are invited by name; the
edit-profile order matches the profile; the feed defaults to a list with a map
toggle; the header's duplicate profile link is gone. Success = full gate green
plus a targeted e2e spec per behavioural ticket, and a mobile audit that keeps
the 44px/16px floors (V21 adds several new tap targets).

## Non-goals

- Restyling `/browse`'s internals; t02 relocates a surface.
- Reaction notifications or free-text reactions.
- Changing the kid-photo or public-handle privacy posture.

## Interfaces (pinned by the orchestrator — builders do not re-decide)

- **Reaction kinds** live in `src/lib/db.ts` as an exported const, e.g.
  `export const REACTION_KINDS = ['like','love','laugh','wow','sad','angry'] as const`
  with a matching glyph map, mirroring the existing `PLACE_KINDS`/`PLACE_KIND_ICONS`
  house pattern (`components/icons.ts`). The DB `kind` column stores the
  `REACTION_KINDS` string, never the emoji.
- **Uniqueness stays (message_id, profile_id)** — one reaction per person per
  message; `kind` is a mutable attribute. `applyReactionToggle` is generalised
  to `applyReactionSet(states, messageId, kind | null)`; existing behaviour for
  `like` must remain provably intact.
- **`/browse` keeps its route.** t02 removes the NAV TAB only.
- **t07's search is a pure seam**: `searchProfilesByName(query, limit)` in
  `src/lib/db.ts` returning `{ display_name, handle }`-only rows, with the RLS
  posture documented in the migration/ticket. Signed-in only, capped at 8.
- **Edit/read order** is pinned as the array `['user','kid','parents','drop-ins']`
  and both surfaces derive from it, so drift is structurally impossible.

## Slices

### Slice 1: t01 — nav label + t10 — header link removal
- **Objective:** `/`'s nav tab reads "Drop Ins"; the header no longer links the
  profile.
- **Files in scope:** `src/App.tsx`, plus any spec asserting the "Nearby" tab
  literal or the header handle link.
- **Approach:** label string swap; delete the `profile` `Link` block
  (`App.tsx:203-208`), keeping the gear and sign-out. Confirm the feed heading
  is NOT renamed (verify before editing).
- **Acceptance criteria:**
  - The bottom nav renders exactly `Drop Ins · Inbox · Post · Profile` (4 tabs).
  - No `Places` tab exists.
  - `grep -rn "Nearby" src/` returns no nav-label occurrence.
  - No header link to `/u/`; the gear and Sign out remain.
- **Verification command:** `npm run verify && npx playwright test e2e/playtest-routes.e2e.ts 2>/dev/null || true`
- **Budget:** small. **Depends on:** nothing.

### Slice 2: t05 — avatar circle + t04 — duplicate picker overflow
- **Objective:** the profile avatar is a true circle; the duplicate list's rows
  never spill their container.
- **Files in scope:** `src/pages/ProfilePage.tsx`,
  `src/pages/NewPlaydatePage.tsx`.
- **Approach (t05):** ONE owner for avatar size. The wrapper button and the
  `<img>` must not each carry a size; the `h-11 w-11` and `h-20 w-20` variants
  must agree. (t04): give the row's text `min-w-0` + `truncate` (or wrap) so a
  long place name cannot widen the box.
- **Acceptance criteria:**
  - Measured in a real browser at 753×650 and 390px: the avatar's
    `getBoundingClientRect()` width EQUALS its height (±1px).
  - The duplicate list's `scrollWidth <= clientWidth` with a long place name.
  - A unit or e2e test pins both (an e2e measuring bounding boxes is acceptable
    and preferred for the avatar).
- **Verification command:** `npm run verify`
- **Budget:** small. **Depends on:** nothing.

### Slice 3: t03 — six reactions (migration 0049)
- **Objective:** a message can be reacted to with any of six kinds; a person has
  at most one reaction per message; changing kind replaces it.
- **Files in scope:** `supabase/migrations/0049_message_reaction_kinds.sql`,
  `src/lib/db.ts`, `src/lib/db-messages.test.ts`, `src/pages/InboxPage.tsx`,
  `e2e/reactions.e2e.ts`.
- **Approach:** add `kind text not null default 'like'` with a CHECK against the
  six values; keep the unique index on (message_id, profile_id) and change the
  write path to upsert. The picker is a bounded row of 6 buttons, each ≥44px.
- **Acceptance criteria:**
  - Migration is idempotent (applied TWICE cleanly).
  - `REACTION_KINDS` has 6 entries with a glyph each.
  - Toggling the SAME kind removes it; a DIFFERENT kind replaces in place (count
    does not increment).
  - The existing `like` tests still pass, plus new tests per rule above.
  - e2e proves the round trip against the live DB.
- **Verification command:** `npm run verify`
- **Budget:** medium — this is the batch's one migration. **Depends on:** nothing.

### Slice 4: t09 — feed list/map toggle
- **Objective:** the feed opens as a soonest-first LIST, with a top toggle to
  the map view.
- **Files in scope:** `src/pages/FeedPage.tsx`, a pure seam for the view state
  (e.g. `src/lib/feedView.ts` + test), `e2e/` spec.
- **Approach:** a two-state control at the top of the feed; list is the default.
  The map band (V19 t02) becomes the map view's content. Persist the choice
  only if the house pattern already persists similar UI state — otherwise
  default every visit (do NOT invent storage).
- **Acceptance criteria:**
  - First load shows the list, no map.
  - The toggle switches both ways and both are ≥44px.
  - Soonest-first order unchanged in list view.
  - e2e asserts default=list and the round trip.
- **Verification command:** `npm run verify`
- **Budget:** medium. **Depends on:** nothing (independent of t02's nav work).

### Slice 5: t08 — edit-profile order + t06 — hosted history
- **Objective:** the edit surface's section order equals the read surface's
  (user, kid, parents, drop-ins); the hosted count reveals the past events.
- **Files in scope:** `src/pages/ProfilePage.tsx`, `src/pages/UserPage.tsx`,
  possibly a shared order const + test.
- **Approach:** derive both surfaces from one pinned order array. For t06, make
  the "Hosted N drop-ins" line expand to the past events (reuse the existing
  hosted-posts read if one exists; otherwise a bounded query).
- **Acceptance criteria:**
  - An ORDER test asserts both surfaces emit the same sequence.
  - Tapping the hosted line reveals past events; a parent with 0 hosted sees the
    line unchanged (or absent) and no empty list.
  - New controls ≥44px.
- **Verification command:** `npm run verify`
- **Budget:** medium. **Depends on:** nothing.

### Slice 6: t07 — invite a parent by name
- **Objective:** typing a first/last name suggests matching parents; selecting
  one sends the link invite.
- **Files in scope:** `src/lib/db.ts` (+ test), `src/pages/ProfilePage.tsx`,
  `e2e/account-links.e2e.ts`.
- **Approach:** pure `searchProfilesByName` seam with a cap of 8; debounce in the
  page; render name + handle. The existing @handle path must keep working
  (additive, not a replacement) unless the founder's words forbid it — they do
  not, so BOTH entry points live.
- **Acceptance criteria:**
  - Typing 2+ chars returns at most 8 matches, name + handle only.
  - Signed-out/anon cannot enumerate (RLS or an RPC that refuses anon).
  - Selecting a result starts the existing invite flow.
  - A test proves the cap and the no-extra-fields rule.
- **Verification command:** `npm run verify`
- **Budget:** medium. **Depends on:** nothing.

### Slice 7: t02 — the map + list move into `/new`'s "Where?" block
- **Objective:** a parent picking a place on `/new` can browse the list and see
  them on a map, without leaving the form; the Places tab is gone.
- **Files in scope:** `src/pages/NewPlaydatePage.tsx`,
  `src/components/PlaydateFormFields.tsx`, `src/pages/BrowsePage.tsx` (extract
  a reusable surface), `src/App.tsx`, `e2e/routes.json` if the playtest list
  changes.
- **Approach:** the LAST slice in the batch, because it is the highest-risk and
  it consumes the nav change from Slice 1. Extract the browse list+map into a
  component both `/browse` and `/new` render, so capability does not fork; give
  `/new`'s Where block the extracted surface behind a "Browse places" affordance
  that does not push the form off-screen. `/browse` keeps its route.
- **Acceptance criteria:**
  - From `/new`, a parent can open the place list, see the map, filter by kind,
    search, and SELECT a place into the form.
  - Tapping a map marker selects that place (the V20 popup behaviour survives).
  - The Places tab is gone; `/browse` still answers 200 when visited directly.
  - No capability regression: every control reachable on `/browse` before is
    reachable on `/browse` after (extraction is not a reduction).
  - New controls ≥44px; inputs ≥16px.
- **Verification command:** `npm run verify` then the targeted places + new specs.
- **Budget:** LARGE — split across multiple builder runs if it overruns 98k.
- **Depends on:** Slice 1 (the nav change).

## Risks / open questions

- t02's extraction could regress the V20 map popup. Mitigation: the map
  component is reused, never re-implemented, and the popup spec must stay green.
- t03's migration is the only DB-touching slice; it must be applied twice to
  prove idempotency, and the live apply needs the documented path.

---

## Status log (orchestrator appends after every phase transition)

- 2026-09-23 — V21 opened. 11 annotations triaged into 10 tickets. Spec
  `.scratch/v21/spec.md`, plan this file, ledger `.scratch/v21/ledger.md`.
  Task-state.md was found to be MISSING its V20 entry (V20 is committed as
  `e2d55d7` but never recorded) — recorded as a backlog item.
