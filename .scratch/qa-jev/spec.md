# QA lane spec — Jev "fresh-eyes" pass on the live site after each ship

Date: 2026-09-17 · Origin: the Jev spike (validating the
browser-use/jev-ultrafast pipeline on this box) came back clean — Wikipedia
done in 2.6 s, the live app's `/` correctly BLOCKs at the auth wall, and
`/login` verifies `done` in 174 ms / 0 actions. The founder chose to bake
that capability into the factory as a durable QA lane rather than a one-off.

## What this is

A repeatable, idempotent runbook (`scripts/qa-jev.sh`) that runs a Jev
pass against the **live** site the moment code ships. Jev gives a fresh,
logged-out browser a narrow natural-language goal and reports
`done` / `blocked` — a cheap "did this ship break the front door" check,
the stand-in for human eyes on the post-ship hook.

It is **factory tooling**, not a product slice: it touches nothing under
`src/` or `supabase/`. The coordinator owns it (like
`scripts/cdp-migration-tooling.sh`), so it is built here, not routed to the
dev agent. It rides the existing coordinator loop as one post-ship step.

## What ships

1. **`scripts/qa-jev.sh`** — the whole runbook: bootstrap a pinned
   `jev-ultrafast` clone under gitignored `.qa/jev`, re-apply the tracked
   local fix, `uv sync`, regenerate the clone's `.env` from the two
   gitignored key sources, launch a clean CDP Chrome on `:9333`, run one Jev
   pass on the target, print a verdict + exit code. Subcommands: default
   run, `--prep` (attach), `--fresh`, `stop`.
2. **`scripts/qa-jev.patch`** — the one tracked local delta over the pinned
   commit (a 2-line `response_format` env guard in `jev_ultrafast/model.py`,
   because NInfer only accepts `{"type":"text"}`). Reproducible: any fresh
   clone at the pin + this patch reproduces the working tree.
3. **`.qa/`** (gitignored, durable) — the clone + its `uv` venv, the clean
   Chrome profile, and `.qa/ninfer.env` (the NInfer key, 600). Nothing here
   ships; the key never leaves the box.
4. **`AGENTS.md`** — one coordinator-loop step: after each ship + live check,
   run `scripts/qa-jev.sh` and record the verdict in task-state.
5. **`task-state.md`** — the tooling note (this lane exists, how it's invoked,
   its exit codes, where the verdicts land).

## Design notes (why these choices)

- **Default target is `/login`, not `/`.** Everything in the app is gated
  behind auth; Jev correctly BLOCKs on `/` (the auth wall is working, not
  broken). `/login` is the one page a fresh browser can verify without
  credentials — the "front door" of the product. `--url`/`--goal` override
  for deeper checks.
- **Durable `.qa/`, not `/tmp`.** The spike lived in `/tmp` and dies on a
  wipe. The clone + venv + profile live in `.qa/` so a reboot or `/tmp`
  wipe re-bootstraps from the tracked pin + patch, no re-cloning knowledge.
- **Port 9333, not 9222.** 9222 belongs to the Supabase-migration Chrome
  (`scripts/cdp-migration-tooling.sh`, session-bearing profile). The QA lane
  uses its own clean, persistent profile on 9333 so the two never collide.
- **NInfer is the free text helper.** The `model.py` guard lets `qwen3.8-27b`
  (via local NInfer, `http://127.0.0.1:18080/v1`) drive the agent with no
  second paid key; the TypeSafe key comes from `~/.typesafe_key`.
- **Exit codes are the contract.** 0 = PASS (done) · 1 = BLOCKED ·
  2 = error/exception · 3 = inconclusive. The coordinator loops on 0; a
  non-zero verdict is surfaced, not silently decided.