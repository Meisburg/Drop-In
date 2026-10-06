# Draft: the handover's items 6 and 7 are ALREADY DONE (evidence), for the task-state entry

Written 2026-10-05 ~21:26 while the map-and-distance builder finished its gate.
These two are stable measurements of HEAD `434f744` + the working tree, and they
exist so the ledger does not re-dispatch work that has shipped. Numbers for item 1
are deliberately absent — they belong to the run, not to this draft.

## Item 6 — all three "small defects" shipped in V32, before this handover

The handover's snapshot (`62cec8f`) predates the commits that fixed them.

| Defect as the handover states it | State | Evidence |
|---|---|---|
| "the reaction pill is 28px — extend its HIT area to 44px, do not grow the drawn pill" | **FIXED** | `src/lib/db.ts:5576-5578` → `reactionHitAreaClasses()` returns `'flex h-11 -my-2 items-center'`; the drawn pill keeps `h-7` (`reactionButtonClasses`, pinned by `src/lib/db-messages.test.ts:664-676`). Shipped `a9dc8a6`, and the `-my-2` is load-bearing: a plain `h-11` added 16px to every message row and `e2e/inbox-thread-geometry.e2e.ts` caught it (recorded in `task-state.md:33`, fixed by `f534850`). |
| "Tab is trapped by the editor's ModalShell while the crop dialog is open" | **FIXED** | `src/lib/focusTrap.ts:115` `shouldYieldToNestedDialog`, consumed at `src/components/FocusTrap.tsx:84`, sibling-tested at `src/lib/focusTrap.test.ts:116-131`; `src/components/CropPhotoDialog.tsx:119-124` records the second half — the dialog had NO trap of its own, so yielding alone let Tab escape to `BODY`. Shipped `ad5f09f`. |
| "public.messages has NO DELETE policy (migration 0042 is SELECT+INSERT only), so spec cleanup silently removes nothing" | **FIXED** | `supabase/migrations/0064_messages_delete_sender.sql` exists, is applied live, and is **read back**: migration `0064` was applied on 2026-10-05 and `e2e/dm.e2e.ts` then ran 4/4 with the leftover count flat at 22 instead of growing (`task-state.md:33`). The policy is sender-only by design (`sender_id = auth.uid()`), with the omission of moderator/recipient DELETE written down as deliberate. |

**Nothing to build for item 6. The only work is recording it.**

## Item 7 — the audit sweep has been RUN, over exactly the named surfaces

`docs/audits/launch-audit-2026-10-05.md` (246 lines, committed) is the
measurement, and it is the first one over the signed-in surfaces nothing had
measured: **feed, post form, drop-in detail, onboarding, profile, settings** —
**18 measurements** at 390×844 and 1440×900 in a signed-in browser, because
`mobile-audit.mjs` and the Impeccable tool both reach only signed-out routes.

- **Zero horizontal overflow, zero console errors, zero 4xx** across the 18.
- **Two real defects, both since fixed in `a9dc8a6`:** the signed-in drop-in
  page's Share / Add to calendar / Report were 45×26, 119×26, 51×26 against the
  public view's 44px twins; the onboarding area card's radius select was 358×41.
- **It refuted as much as it found:** all **13** sub-44 flags on `/settings` are
  hidden inputs inside labels measuring 44px or more (wrappers measured 324×86,
  280×46, 292×66, 324×44, 103×44), and `design-detect`'s single runtime finding
  is the boot splash at t=300 ms, gone by t=1500 ms.
- **The lane gap it found (F3) is partly closed:** the shell checks that
  `layout-width-check.mjs` could never pass now run — and are proven able to
  fail — in `scripts/signed-in-audit.mjs`, which refuses to report a pass with no
  session (`NOT MEASURED`, exit 2).

**The gaps it declares, and they are the remaining honest work for item 7**
(`launch-audit-2026-10-05.md:192-209`): visual craft (no image input in that
session), signed-in contrast, POPULATED states (the live DB has 0 upcoming
drop-ins, so the feed measured is empty and no comment thread rendered),
gestures, signed-in dark mode, keyboard traversal. Only the populated-state and
keyboard gaps are agent-doable this week.

## What this means for the handover's plan

Items 6 and 7 are closed by evidence, not by a new slice. The remaining real
work is items 1, 2, 3, and 5 (+ the item-4 and item-5 briefs, which now exist as
`.scratch/settings-restructure/spec.md` and `.scratch/reviews-inline/spec.md`),
plus one NEW defect filed on the way: `.scratch/e2e-marker-token/spec.md`.
