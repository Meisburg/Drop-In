# 07 — Your own drop-in must appear in your own feed

**Status:** ready-for-agent
**Type:** Bug (or Product Improvement — rule it in the report)
**Source:** Perplexity PCR 003 → `D4`

## What happens

`listRadiusFeed` (`src/lib/db.ts:599-640`) runs posts through `filterFeed`, which
filters on `withinRadius(...)` with **no host exemption**. With
`DEFAULT_RADIUS_MILES = 5` (`src/lib/feed.ts:72`), a parent who lives in 98134
and posts at Green Lake Park (7.18 mi, computed from
`supabase/migrations/0012_zip_radius.sql:111` and `0029_places.sql:253`) **cannot
see their own drop-in** without widening the radius by hand. The "Posted!" banner
does not link to it either (that half is ticket 03).

The fallback exists but is buried: `Hosted drop-ins` on the profile
(`src/components/ProfileView.tsx:981,994`).

## Acceptance criteria

1. A viewer's **own active (not-cancelled, not-ended) drop-in** appears in their
   radius feed regardless of distance, and is visually distinguishable as theirs
   (the feed already knows: `src/pages/FeedPage.tsx:951-957`).
2. No other viewer's results change — this is a self-exemption only, and it must
   not widen anyone else's radius.
3. Ended and cancelled posts are still excluded by the existing rules; the
   "See past drop-ins" affordance keeps working.
4. Unit coverage for: own post outside radius → included; another parent's post
   at the same distance → excluded.

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/zip-radius.e2e.ts e2e/feed-empty-state.e2e.ts
```

## Likely files

- `src/lib/db.ts` — the union/exemption at the query or the feed-assembly seam
- `src/lib/feed.ts` + `src/lib/feed.test.ts` — if the rule is expressed as a pure
  filter, keep it there
- `src/pages/FeedPage.tsx` — only if the card needs a "yours" treatment

## Considerations

- **Do not fix this by warning at post time instead.** The reviewer's evidence is
  the vanishing act; the honest fix is that your own post is visible to you.
- The feed assembles posts and their pings in a known order; an exemption added
  in the wrong layer can silently drop the pings. Cover that in the e2e.
- Watch `e2e/card-circles.e2e.ts`, which depends on the broad `going_pings`
  SELECT and on the feed's degradation path.
- A self-exemption is a **privacy-safe** change: it exposes a post to its own
  host, nothing more. Say so in the report so the reviewer does not have to
  re-derive it.
