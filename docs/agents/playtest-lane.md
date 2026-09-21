# Playtest lane — repro-before-accept for bot-built slices

Established 2026-09-18 (Grokbot Galaxy 3-day playbook: "only if they can
reproduce it can we trust that the agent understands"). A slice is not done
on green unit tests alone; it must also survive the playtest lane.

## What it is

`scripts/playtest_check.py` drives the BUILT app (`dist/`) in a dedicated
headless Chrome — isolated profile `~/.hermes/playtest-hl`, CDP port 9444,
zero visible windows — and checks each route in
`.scratch/playtest/routes.json` for:

- page loads and mounts (non-empty body text),
- required text present (`must_contain`),
- no uncaught JS errors or unhandled rejections,
- a screenshot per route saved as evidence in `.scratch/playtest/`.

Verdict lands in `verdict.md` / `verdict.json` (PASS/FAIL, exit 0/1).

## Orchestrator acceptance loop

1. Serve `dist/` (any static SPA server with index.html fallback).
2. Run the script with the current `routes.json`.
3. Record the verdict in task-state.md next to the unit-gate result.
4. FAIL blocks acceptance exactly like a red gate; screenshot + JS error
   text are the reproduction handoff to the dev agent.

## Rules

- No visible browser windows, ever (fleet rule).
- One dedicated headless Chrome for the lane; stop it after the run.
- Extend `routes.json` when a slice adds a reachable route — the lane grows
  with the app instead of being rebuilt per batch.
- Auth-gated flows: assert on the signed-out render (correct gate copy, no
  crash); deeper flows stay with the e2e suite — this lane is the cheap
  always-on repro instrument, not a replacement for e2e.

**A TRAP, learned the hard way (V16 round 12):** this script has NO auth
support — it never loads a storage state, so **every** route it visits is
fetched signed-out. Adding an auth-gated path to `routes.json` therefore
produces a PASS whose screenshot is the LOGIN page: the route redirects at the
shell gate, `chars`/`errors` come from the login render, and the entry asserts
nothing about the page you meant to cover. That is worse than no coverage,
because the verdict reads as green.

Concretely: `/u/:handle` was added and then removed for exactly this reason. That
route IS covered — by ten e2e specs that navigate to `/u/<handle>` under the
marker's `storageState` (`avatar`, `profile-posts`, `profile-kid-photos`,
`kid-photo-exposure`, `kid-names-privacy`, `host-retention`, `loop-closing`,
`polish`, `feed-ended-out`, `profiles-v2`). Before adding a route here, check
whether it is public; if it is not, the e2e lane is where it belongs.

## First verified run (2026-09-18)

3 routes (/ , /login, /reset-password) — PASS, 0 JS errors, 3 screenshots.
Note: assertions must match rendered text exactly — the app uses the curly
apostrophe (didn't), a straight-quote needle failed once. Copy needles from
the rendered page, not from source strings.