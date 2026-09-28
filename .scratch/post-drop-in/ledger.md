# Ledger — V27 /new posting experience (`Meisburg/post-drop-in`)

Append-only. One line per event; a `RULING:` line per product judgment call.
Branch is STAGING — the coordinator serializes merges to master; this session
never pushes.

- 2026-09-27 baseline complete: secondary "Duplicate a previous drop-in" control, `shrink-0` row overflow fix (+ `e2e/post-again-overflow.e2e.ts`), and time presets (`lib/feed.timePresets` + `e2e/time-presets.e2e.ts`). `npm run verify` EXIT=0; targeted e2e green. Committed as the batch base.
- 2026-09-27 plan: V27 batch written to `plan.md` (4 slices, acceptance criteria + verification commands each).
- 2026-09-27 Slice 1: dispatched (sticky Post bar with live read-back).
