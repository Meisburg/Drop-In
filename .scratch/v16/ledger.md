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
V16 t01: complete (commit 9050706) — copy changes; gates build 0 + 898/898 +
  lint 0 errors; playtest PASS 8 routes 0 JS errors; login copy confirmed in
  screenshot route_login.png. SPEC DEFECT found: the founder's Login string
  never existed on /login (git log -S empty; it lives only at InboxPage.tsx:682
  from 29625a4) — builder returned BLOCKED rather than inventing copy.
  Ruling: replaced the /login brand line instead.
V16 t08: ocr wired as third review lane (open-code-review v1.12.8, npm global).
  Custom provider 'ninfer' -> local NInfer /v1, protocol openai, model
  qwen3.8-27b. PROVED it works: reviewed b259d6a..9050706, 6 files, 212,798
  tokens, 1m20s, tool use (13 code_search + 11 file_read + 4 file_find).
  It found 1 REAL defect on its first run: the committed absolute symlink at
  .opencode/skills/verification-before-completion (mode 120000) would dangle
  on every other checkout. FIXED by vendoring the SKILL.md as real content
  (mode 100644, matching i-have-adhd).
  Ruling: ocr is a COMPLEMENT, not a replacement — its own README trades
  recall for precision, and it reviews code only (skips .md/config as
  unsupported_ext).
V16: playtest lane PASS on the t01 tree (8 routes, 0 uncaught JS errors).
  Tooling note: Chrome must be launched with --remote-allow-origins='*' or
  CDP handshake 403s; script needs `uv run --with websocket-client`.
