# 06 — The empty feed should say what is just outside the radius

**Status:** ready-for-agent
**Type:** Product Improvement
**Source:** Deepseek PCR 002 → `D3`
**Decision (founder, 2026-10-04):** add the count now. **Suggested places are out
of scope** — they wait for the 5-parent test (they edge into the blocked
empty-feed CTA).

## What happens

The empty state says only `Nothing within 5 miles yet.`
(`src/lib/feed.ts:2301`), then offers two escapes — `Widen to 20 miles` and
`See everything in Seattle` (`src/lib/feed.ts:2368-2389`, pinned by
`src/lib/feed.test.ts:2457-2460`). The parent is asked to gamble a tap with no
idea whether anything is out there. The page already fetched the set; the count
is right there.

## Acceptance criteria

1. When the radius is empty **but the fetched set is not**, the empty state says
   how many drop-ins are just outside the radius, and widening still works from
   that state.
2. When the fetched set is genuinely empty, the copy does **not** invent a count
   — no "0 drop-ins nearby", no fabricated activity.
3. The honest sentence `Nothing within N miles yet.` survives when it is true.
4. `DEFAULT_RADIUS_MILES = 5` is unchanged
   (`src/lib/feed.test.ts:2464` still passes).
5. Unit coverage in `src/lib/feed.test.ts` for: zero fetched, some outside,
   some inside (no empty state at all).

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/feed-empty-state.e2e.ts
```

## Likely files

- `src/lib/feed.ts` — a pure selector for the beyond-radius count
- `src/components/RadiusEmptyState.tsx` — the copy
- `src/pages/FeedPage.tsx:1273-1279` — pass the count in
- `src/lib/feed.test.ts` — sibling tests (build law)

## Considerations

- **Do not re-enable `showPostCta`.** The empty state's missing post CTA is a
  recorded decision (`src/components/RadiusEmptyState.tsx:57-62`) awaiting the
  5-parent test. This ticket changes the *sentence*, not the controls.
- The count must come from data the page already holds. If it requires a new
  query, stop and report — that changes the ticket's shape.
- Match the existing vocabulary (`drop-in`, `families`) and the curly apostrophe
  convention already in the copy.
