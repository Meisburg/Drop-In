# Ledger — V27 /new posting experience (`Meisburg/post-drop-in`)

Append-only. One line per event; a `RULING:` line per product judgment call.
Branch is STAGING — the coordinator serializes merges to master; this session
never pushes.

- 2026-09-27 baseline complete: secondary "Duplicate a previous drop-in" control, `shrink-0` row overflow fix (+ `e2e/post-again-overflow.e2e.ts`), and time presets (`lib/feed.timePresets` + `e2e/time-presets.e2e.ts`). `npm run verify` EXIT=0; targeted e2e green. Committed as the batch base.
- 2026-09-27 plan: V27 batch written to `plan.md` (4 slices, acceptance criteria + verification commands each).
- 2026-09-27 Slice 1: dispatched (sticky Post bar with live read-back).
- 2026-09-27 Slice 1: complete (commit `8e7f474`; `npm run verify` EXIT=0 · 1795 tests · GUARDS PASS; e2e 13/13 — sticky-post + post-fast + post-edit-delete).
  RULING: `/new` HIDES the in-form submit rather than adding a second "Post drop-in" — two controls with the same accessible name would strict-mode-fail every posting spec.
  RULING: the bar's read-back is day · start · place only (duration/address stay on the form); an unanswered place reads "Add a place".
- 2026-09-27 Slice 2: dispatched (vibe chips for the details field).
- 2026-09-27 Slice 2: complete (commit `76f2778`; `npm run verify` EXIT=0 · 1802 tests · GUARDS PASS; e2e 8/8 — vibe-chips + post-edit-delete).
  RULING: chips APPEND on a new line rather than replace, so a parent's own words survive; an empty/whitespace field is the only case a chip's sentence becomes the whole text.
- 2026-09-27 Slice 3: dispatched (privacy preview + trust line).
- 2026-09-27 Slice 3: complete (commit `ef9aac1`; `npm run verify` EXIT=0 · 1806 tests · GUARDS PASS; e2e 8/8 — privacy-preview + post-edit-delete).
  NOTE: the shared `:4173` preview was held by the `places` worktree, so the e2e lane ran on a private `:4174` with `reuseExistingServer: false` (temp `playwright.noreuse.config.ts`, untracked, deleted after).
  RULING: the trust note says "Only nearby parents can see this", never a radius number — `/new` does not load the profile radius, so a specific figure would be a false claim.
- 2026-09-27 Slice 4: dispatched (share prompt after posting).
- 2026-09-27 Slice 4: complete (commit `9073c2b`; `npm run verify` EXIT=0 · 1806 tests · GUARDS PASS; e2e 5/5 — share-after-post + post-again).
  RULING: the success prompt lives on the FEED via router state (URL stays exactly `/`) rather than a `/new` success modal — a modal would break every existing `waitForURL('/')` spec.
  RULING: Share tries Web Share first, then the clipboard fallback with a transient "Copied"; a cancelled sheet or a denied clipboard stays silent (never scold a parent for declining).
- 2026-09-27 V27 batch: all 4 slices committed. Final tip gate run (verify + combined targeted e2e across every touched surface) — see report.
