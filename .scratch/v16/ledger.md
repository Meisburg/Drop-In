# V16 ledger — plan: .scratch/v16/spec.md

Batch opened 2026-09-21. Base commit at batch start: `aafb0a4`.
Per-ticket gate: `npm run build && npm run test`.
Batch gate: full suite + lint + playtest lane.

One line per event. This file survives compaction — trust it and `git log`
over recollection. A commit named here exists in git even if no context
remembers making it.

---

V16: batch opened (base aafb0a4) — 7 tickets in .scratch/v16/spec.md
V16: facts established by explorer subagent f23f7452 — no owner modal (it is a
  Link to /u/:handle → UserPage.tsx); kid photos owner-only by construction;
  5 notification toggles already exist; radius CHECK blocks 1 mile;
  likes cap is UI-only (LIKES_MAX_LENGTH, no migration needed)
V16: founder decision round complete ("accept all") — Q1 widen radius CHECK to
  1–35; Q2 notification discoverability not new kinds; Q3 kid photos on
  /u/:handle when isOwnProfile only; Q4 reorder UserPage.tsx only; Q5 defects
  now, redesign separate; Q6 measurable rules + route screenshots; Q7 merge
  three attendee toggles
V16 t01: dispatched (base aafb0a4) — copy removals + one rewrite; agent 79a305f2
