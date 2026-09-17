# 04: Profile self-view + post-again — kids' photos come back (owner-only), and the clone closes out

**What to build:**
1. **Kids' photos re-surface on the owner's /profile self-view only** —
   founder decision. Since V9 t11 the kids' photos live in the PRIVATE
   `kid-photos` bucket (0038; `PHOTO_BUCKET`, `src/lib/photoStorage.ts:58`)
   and today only /settings renders them (`SettingsPage.tsx:75`). The
   owner's own /profile "Kids" card (name + age today, `:233-250`) gains
   the photo, read back the same batched, best-effort way /settings does.
   **Every other surface stays photo-free** — the /u/:handle visitor view,
   feed cards, place pages: the V9 t11 invariant (`kid-photo-exposure.e2e.ts`
   stays green, untouched where possible).
2. **Post-again closes out.** The clone of the last post
   (`cloneLastPost`, `src/lib/feed.ts:2317`; `clonedStart` `:2284`)
   pre-fills /new through the `post-again` slot
   (`NewPlaydatePage.tsx:1113-1127`, the button `:1119`,
   `applyLastPost` `:1120`) and the Duplicate entry points —
   `App.tsx:288-304` (router state `duplicate` / `place`),
   `NewPlaydatePage.tsx:225-262` (duplicate prefill),
   `PlaydateDetailPage.tsx:1934-1942` (host panel), `ProfilePage.tsx:149-152`
   (own-posts row) — so place, start slot, duration, kids, and description
   all land pre-filled and the user only picks the new time.

**Why:** Founder ask (V12): the self-view is where the parent checks "what
do we look like" — the kids' photos are the human part of that, and they
were over-removed (they vanished from the owner's own view along with the
public ones). And "post again" should finish the job it started.

**Status:** ready-for-agent

## Mechanics (pinned)

- `src/pages/ProfilePage.tsx` (300 lines): the documented read-only order
  `:20-39`; the Photo card `:176-198`; the family photo (display only)
  `:203-216`; About `:222-228`; the Kids card `:233-250` (the `kid-row`
  testid `:244`, `kidLabel` at `:245` — the same seam /u/:handle renders);
  "Your posts" `:252-288` (Upcoming / Past via `renderPostRow`, the
  Duplicate button `:149-152`).
- `src/lib/db.ts:960` `listLastOwnPlaydate` (the clone source).
- `src/lib/feed.ts`: `clonedStart` `:2284`, `cloneLastPost` `:2317`.
- `e2e/post-again.e2e.ts` (204 lines): the two tests — clone + post
  (`:93`) and the no-chip case (`:155`); the seed `:69-91`; the
  `clonedStart` import `:35`; `stepStartTimeOnce` at `:44` / `:85`; the
  `post-again` testid at `:108` / `:166`.
- The bucket read path is the one /settings already uses
  (`SettingsPage.tsx:75` — "read back through a batched, best-effort" fetch
  of the private `kid-photos` bucket; object path
  `kid-photos/<uid>/kids/<kidId>`, `src/lib/types.ts:324`) — reuse it, do
  not re-invent a URL.

## Acceptance criteria

1. The owner's /profile "Kids" card shows each kid's photo (signed-in
   owner only; the batched best-effort read — a missing/failed photo
   degrades to the name + age row, no error state).
2. Zero kids' photo rendering outside the owner's self-view: the /u/:handle
   visitor view, feed cards, and place pages are photo-free
   (`kid-photo-exposure.e2e.ts` green, unmodified where possible).
3. Post-again / Duplicate from all four entry points pre-fills place,
   start slot (`clonedStart`), duration, kids, and description on /new;
   the user's only required input is the new time. `e2e/post-again.e2e.ts`
   green (extend the no-chip test if the prefill shape changes).
4. `npm run build && npm run test` exit 0; full e2e green; lint 0 errors.

**Migration check:** NONE (the private bucket + policies are 0038, already
applied; this ticket only adds a read on the owner's self-view).

**Depends on:** none.