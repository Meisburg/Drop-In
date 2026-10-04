# 03 — The "Posted!" banner must not outlive the post

**Status:** ready-for-agent
**Type:** Bug
**Source:** Deepseek PCR 010, first half → `D6`

## What happens

`src/pages/FeedPage.tsx:225-229` reads `justPosted` from router state. Nothing
clears it on render — the only clearer is `dismissJustPosted`
(`:1075-1078`), fired by the Dismiss control. Router state lives in
`history.state`, which **survives a reload**, so a parent who refreshes the feed
after posting is told again that they just posted. Stale state that reads as a
second event is a trust bug, not a cosmetic one.

Separately, the banner does not lead to the post it announces
(`src/pages/FeedPage.tsx:1115`): it carries Share and Dismiss only.

## Acceptance criteria

1. After a successful post, the banner shows once. Reloading the feed does **not**
   restore it, and neither does navigating away and back.
2. Dismiss still clears it immediately.
3. The banner offers a way to open the drop-in it announces — or, if that is
   deliberately omitted, a code comment says why and the ticket's report records
   the decision.
4. The Share control's behaviour is unchanged.

## Verification

```bash
npm run verify
npm run test:e2e -- e2e/share-after-post.e2e.ts
```

There is **no existing coverage of `justPosted`** (grep `justPosted` across
`e2e/` returns nothing). Add a focused reload assertion — post, assert the banner,
`page.reload()`, assert it is gone. Put it in `e2e/share-after-post.e2e.ts`
unless a closer spec exists by the time you start.

## Likely files

- `src/pages/FeedPage.tsx`

## Considerations

- Clearing by resetting React state alone leaves `history.state` dirty and the
  banner returns on the next reload. Consume it: `navigate('/', { replace: true,
  state: null })` (or the equivalent `history.replaceState`) once, on mount.
- Keep the post-acquisition path identical for `sticky-post.e2e.ts` and
  `share-after-post.e2e.ts`.
- Root cause is the same class as ticket 01 — a surface trusting state it has not
  verified. If both are in one builder context, land them as two slices, not one
  diff.
