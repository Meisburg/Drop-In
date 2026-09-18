# 01: QA lane — `scripts/qa-jev.sh` runs a Jev fresh-eyes pass on the live site after each ship

**What to build:** A single idempotent runbook, `scripts/qa-jev.sh`, that
bootstraps the pinned `jev-ultrafast` clone under gitignored `.qa/jev`,
launches a clean CDP Chrome on `:9333`, and runs one Jev pass against the
live site (default target `/login`), printing a verdict + exit code. Plus the
wiring: `scripts/qa-jev.patch` (the tracked local model.py fix), `.qa/` added
to `.gitignore`, one post-ship step in the coordinator loop (AGENTS.md), and
a tooling note in task-state.md. Full rationale in `../spec.md`.

**Why:** The Jev spike proved the pipeline (Wikipedia done 2.6 s; live `/`
correctly BLOCKs at the auth wall; `/login` done in 174 ms). This ticket
makes it a durable factory capability: after every ship, a fresh browser
confirms the front door still works, without a human having to go look.

**Status:** ready-for-agent

## Acceptance criteria

- **AC1 — bootstrap is reproducible from tracked state only.** With `.qa/jev`
  deleted, `scripts/qa-jev.sh` re-clones `browser-use/jev-ultrafast` at pin
  `452c1ad`, applies `scripts/qa-jev.patch`, and `uv sync`s — no other local
  state required. With `.qa/jev` present at the pin, it reuses the clone
  (idempotent, no re-clone).
- **AC2 — keys never ship.** `.qa/` (clone, venv, Chrome profile,
  `.qa/ninfer.env`, generated clone `.env`) is gitignored; `git status` stays
  clean after a run. `qa-jev.patch` is tracked. `~/.typesafe_key` is read,
  never copied into the repo.
- **AC3 — Chrome isolation.** The QA Chrome runs on `:9333` with a clean
  persistent profile under `.qa/chrome-9333`; it never touches the `:9222`
  migration Chrome or its session-bearing profile. `--fresh` wipes the QA
  profile; `stop` kills only the QA Chrome.
- **AC4 — verdict contract.** Exit codes: 0 = PASS (`done`), 1 = BLOCKED,
  2 = Jev crashed, 3 = inconclusive (no recognizable final status). The
  verdict line + last tick + landing URL are printed, and the full Jev
  output is captured to `.qa/last-run.out` / `.qa/last-run.err`.
- **AC5 — live run passes.** `bash scripts/qa-jev.sh` (default target)
  exits 0 against the live site: a fresh browser confirms the Drop In
  sign-in screen renders (email field + a sign-in control visible).
- **AC6 — the coordinator loop knows.** AGENTS.md coordinator section gains
  exactly one step: after ship + live check, run `scripts/qa-jev.sh` and
  record the verdict in task-state.md. task-state.md carries the matching
  tooling note (invocation, exit codes, where verdicts land).

## Verification command

```
bash scripts/qa-jev.sh          # AC1-AC5: bootstraps, runs the live pass, exit 0
git status --porcelain          # AC2: nothing under .qa/ staged or untracked
```

## Mechanics (pinned)

- Pin `452c1ad2dd628008f1d5608f28158d76e49e6cc0`; patch = the
  `TEXT_MODEL_NO_RESPONSE_FORMAT` env guard hunk in `jev_ultrafast/model.py`
  (NInfer rejects `response_format: json_object`); regenerated clone `.env`
  carries `TEXT_MODEL_NO_RESPONSE_FORMAT=1`, `TEXT_MODEL_BASE_URL` from
  `.qa/ninfer.env`, `BU_CDP_URL=http://127.0.0.1:9333`.
- Jev entrypoint: `uv run --env-file .env python examples/run.py --url URL
  --goal 'goal'`; tick lines `NNN ms  N actions  done|blocked`, final line =
  landing URL (verified against the spike's live output).
- The NInfer serve is expected up at `http://127.0.0.1:18080/v1` (the
  `ninfer-serve` process); if unreachable, the run fails at the first model
  call and the coordinator surfaces it — the script does not auto-start it.