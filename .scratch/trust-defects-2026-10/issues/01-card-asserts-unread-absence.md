# 01 — A card must not assert an absence it never read

**Status:** ready-for-agent
**Type:** Bug (honesty)
**Source:** Deepseek PCR 007 + Perplexity PCR 007 → `D1` in
`docs/product/external-review-triage-2026-10-04.md`
**Blocks:** nothing. **Do this one first** — it is the highest-severity defect in
the batch.

## What happens

`DropInCard` renders `No one’s going yet` whenever `goingLine === null`
(`src/components/DropInCard.tsx:556-559`), and `buildGoingLine` returns null at
zero pings (`src/lib/feed.ts:1417`). The feed passes ping data, so it is right
there. The **profile and place** call sites pass none at all:

- `src/components/ProfileView.tsx:997-1002` (upcoming) and `:1013-1018` (past)
- `src/pages/PlacePage.tsx:682-687`
- `src/pages/PlaceDetailsPage.tsx:695-700`

So a drop-in with two families going is labelled empty on the host's own profile
— the exact contradiction two independent reviewers hit. The component's comment
at `src/components/DropInCard.tsx:257` claims a loaded/null rule the code does
not honour.

The same lie was already found and fixed once on the detail page
(`e2e/feed-empty-state.e2e.ts:335-349`, `task-state.md:819`); the card surfaces
were never covered.

## Acceptance criteria

1. A profile or place card for a drop-in with ≥1 going ping renders the real
   going line — the same line the feed renders for the same post.
2. When ping data has **not loaded or the read failed**, the card renders **no
   absence line at all**. It must never print `No one’s going yet` from unread
   state.
3. The feed's existing two-variant wording is unchanged (`No one’s going yet`
   only for a *loaded* zero on your own post; `No one’s said they’re going yet`
   for another family's).
4. A **rendered** regression exists: post with ≥1 going ping → open the host's
   profile → the count is on screen and the absence string is not.

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/profile-posts.e2e.ts e2e/card-circles.e2e.ts
```

`e2e/card-circles.e2e.ts` is the pattern to copy (it already pins the feed card's
going line, including the case where the ping read degrades). Add the assertion
where it can actually render the profile card; a source grep is not a rendered
assertion.

## Likely files

- `src/components/DropInCard.tsx` — a three-state render (loading / loaded-empty
  / loaded-nonempty), e.g. an explicit `pingsLoaded` prop; do not infer "loaded"
  from an empty array.
- `src/lib/db.ts` — a batched ping read for a set of posts (the profile already
  has the post ids). Per the build law, a `lib/` module ships a sibling test.
- `src/components/ProfileView.tsx`, `src/pages/PlacePage.tsx`,
  `src/pages/PlaceDetailsPage.tsx` — pass the data through.

## Considerations

- Mirror the existing unavailable-state precedent rather than inventing a
  fourth convention (`host-going-count-unavailable`).
- `e2e/card-circles.e2e.ts` documents that a missing `going_pings.created_at`
  column degrades the feed to no going lines. Whatever you add must degrade the
  same way — **silence, not a lie**.
- This is the one ticket where the diff will cross `lib/` + a page + tests; split
  the slice at the `lib/` seam if it does not fit one builder context.
