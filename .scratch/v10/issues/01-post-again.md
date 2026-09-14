# 01: Post again — the whole last post, one tap

**What to build:** On /new, a chip ABOVE the "Recent places" chips (only when
the parent has ≥1 past post): **"Post again: <generated title or place> ·
<day label>"**. One tap prefills the ENTIRE last post — place, address,
neighborhood, duration, details, kids — then moves the start to the NEXT
30-minute slot (today if that slot is still ahead, otherwise tomorrow, same
minutes). The summary read-back updates; the parent adjusts anything they
want and taps Post. Nothing submits itself.

**Why:** the audit found the bottleneck for a returning parent is RECALL, not
tapping — recent *places* are remembered (V8 t01) but not the whole post.
Playdates are habitual (same park, same kids); the clone makes the second
post ~2 taps.

**Status:** ready-for-agent

## Mechanics (pinned — do not re-decide)

- New db seam `listLastOwnPlaydate(): Promise<LastPost | null>` in
  `src/lib/db.ts`, modeled on `listRecentOwnPlaces` (db.ts:928): the parent's
  most recent non-cancelled playdate with `playdate_kids` kid ids (0022 join,
  host's own kids), ordered `starts_at desc`, limit 1. Mock-client pattern
  (`queryLastOwnPlaydateWithClient`) per house style. RLS already scopes it.
- Pure seam `cloneLastPost(prev, last, nowIso)` in `src/lib/feed.ts`:
  - writes place/address/neighborhoodId/durationMinutes/details/title
    (re-run `generatedTitle` rules; a stored title may name last week's date
    shape — keep the stored title if ≤80 chars, else regenerate)
  - `startDate`/`startMinutes`: next 30-min slot from `nowIso` that is ≥ the
    stored start's slot-time-of-day if still ahead today, else tomorrow at
    the stored slot (reuse `nextSlotMinutes` / `stepTimeMinutes` math; DST-
    agnostic local-midnight rules per feed.ts conventions)
  - returns values + kidIds; page applies via existing setters
    (values, address, addressTouched=false, placeId via `resolvePlaceByName`,
    kidIds state, picker closed) — the SAME invariants as `applyRecentPlace`
    (NewPlaydatePage.tsx:528): address owned by the chip, place-text edit
    clears it, title follows the generated rule unless touched
- Kids: prefill the `selectedKidIds` state ONLY with ids that still exist in
  the mounted `kids` list (a deleted kid must not resurrect as a ghost chip)

## Acceptance criteria

- [ ] Chip renders only when `listLastOwnPlaydate` returns a post; absent
      (not disabled) for a parent with no posts or on load error (degrade to
      today's form, never a crash — the listKids-load pattern)
- [ ] One tap → summary read-back shows place (+address), day/time, kids;
      Post lands a feed card identical to a hand-filled clone (unit: the
      pure seam's output passes `validatePlaydateForm` for every fixture)
- [ ] Time rule unit-pinned: 14:10 now + last post 15:00 → today 15:00;
      16:10 now + last post 15:00 → tomorrow 15:00; slot lands on the
      30-minute grid; `startOfTodayIso`-style fixed-clock tests
- [ ] Editing after clone is free: place-text edit clears app-written address,
      title edit sticks, kids toggleable — no field is locked
- [ ] New e2e `post-again.e2e.ts`: seed a post via the existing
      golden-path helpers, reload /new, tap the chip, tap Post → feed shows
      the clone with the advanced time; second case: chip absent for a
      no-post parent
- [ ] Existing e2e unaffected (the chip adds an affordance; it does not move
      any existing control — `post-fast.e2e.ts` tap-count AC must stay true)
- [ ] `npm run build && npm run test && npx playwright test
      e2e/post-again.e2e.ts e2e/post-fast.e2e.ts e2e/quick-post.e2e.ts` exit 0

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** nothing.