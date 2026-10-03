# Model routing (Strata / DSH specifics)

Read this **when changing agent models, debugging a slow or costly lane, or
wondering which model handled a slice.**

## The split

The factory runs two models on purpose:

- **Cloud** `deepseek-v4.1-flash:cloud` (via Ollama) — the orchestrator and any
  escalated fix round. Judgment, routing, adjudication.
- **Local** `qwen3.8-flash-next-iq3_s` (via Strata 'max' on the RTX 5090, port
  8081) — every builder, reviewer, verifier, and explorer. The volume work, on
  hardware we own.

Configured per profile in `~/.dsh/profiles/<profile>/cordis.patch.yml`:
`tool-subagent` and `tool-subagent-fork` carry `agentOptions: {provider:
flash-next-max, model: qwen3.8-flash-next-iq3_s}`, and `agent-default-model` sets
the same for the session. The two old homes for this are both dead under dsh
0.2.0 — `~/.dsh/settings.yaml` was imported into the profile layer, and nothing
reads `~/.dsh/.agent-presets/` any more (presets are bundles now, and the live
one is the shipped `standard`).

**Known gap:** `tool-workflow` and `tool-ralph` carry no `agentOptions`, so their
workers fall back to the agent default — which is the local Strata lane too, so
they no longer spend cloud tokens, but they inherit the lane rather than pinning
it.

## Cloud lane: primary is Ollama Cloud, fallback is DeepSeek's API (recorded 2026-09-28)

The escalation lane's `deepseek-v4.1-flash:cloud` routes through **Ollama Cloud** — the
`:cloud` tag served by the local daemon at `127.0.0.1:11434`. Confirmed live
2026-09-28 with a one-token probe (HTTP 200, real completion, `fp_ollama`).

1. **Primary: Ollama Cloud.** Same daemon the human already runs; quota is the only
   failure mode (V24's outage, 2026-09-25, was Ollama's weekly limit — not a config
   or model problem).
2. **Fallback: DeepSeek's direct API** (`deepseek-flash` on api.deepseek.com) — the
   same model, bypassing Ollama's quota entirely. Pricing has a clock: $0.15 in /
   $0.60 out off-peak, $0.30 / $1.20 at peak (weekdays 01:00–04:00 and 06:00–10:00
   UTC, Beijing business hours). Credentials state 2026-09-28: pi holds a stored
   DeepSeek credential (`/login`, `auth.json`), but the `DEEPSEEK_API_KEY` shell var
   the dsh/opencode lanes would read is **still unset** — the human creates the key,
   the env export is the only remaining step.
3. **Not a fallback but noted:** GLM-5.3-Flash ($0.15/$0.50 flat, no peak window) is
   the cheaper-of-the-two only inside DeepSeek's peak windows; the benchmark evidence
   for agentic coding work (our lane's workload) favors DeepSeek (Vals AI, shared
   harness: Terminal-Bench 2.1 74.5 vs 62.9, SkillsBench 69.8 vs 40.2).

### Reasoning effort on the cloud lane (probed 2026-09-28)

`deepseek-v4.1-flash` takes effort on the wire as **`reasoning_effort` strings only** —
a numeric dial is rejected by Ollama's endpoint (`cannot unmarshal number … of type
string`). Verified accepted, probed 2026-09-28 via the local daemon proxying `:cloud`:
`low`, `medium`, `high`, `max`. Behavior confirmed: the identical p(25) task produced
580 / 683 / 760 reasoning chars at `low` / field-omitted / `high` — the dial measurably
moves reasoning. `max` was accepted without error; its upstream tier is not yet
measured.

Effort policy by job (whoever holds the dial — agent curl calls, pi `/thinking`,
dispatch briefs):

| Job | `reasoning_effort` |
|---|---|
| routing, probes, quick verdicts, retries | `low` |
| everyday orchestrator turns | `medium` (the wire default) |
| review verdicts, adjudication, plan-reading | `high` |
| escalation rounds 4–5, breaker support | `max` |

pi wiring (2026-09-28): pi's startup model is now `ollama-cloud/deepseek-v4.1-flash:cloud`
(`~/.pi/agent/settings.json` `defaultProvider` + `defaultModel`), and the model entry in
`~/.pi/agent/models.json` carries a `thinkingLevelMap` (`minimal`→`low`, identity for
`low`/`medium`/`high`, `xhigh`/`max`→`max`) so every pi thinking level sends a
wire-verified string. In-session variability is the pi `/thinking` command (Ctrl+S
saves a startup default); the agent flags when a task warrants a bump. **This section
does not apply to the local Strata lane** — sampler and thinking values there are
request-level, and an absent temperature is the engine's greedy default (see
Strata specifics).

## Strata specifics

- Endpoint: `http://127.0.0.1:8081/v1`, model id `qwen3.8-flash-next-iq3_s`.
- Context window: **131,072 tokens** (the engine's `--max-context`, int8 KV). That
  is the *ceiling*, not a target — budget slices well under it (~40–60K) rather
  than treating the window as usable space.
- One lane at a time, one GPU: `strata-max.service` holds the card, and its config
  stops `ninfer-serve.service` when it loads. Switch with
  `systemctl --user start|stop strata-max`, not by editing an endpoint. The NInfer
  lane (`qwen3.8-27b`, port 18080) still exists, and is where these pins point if
  you switch back.
- Samplers are **request-level** here, unlike NInfer's presets: the server forwards
  what a request asks for and otherwise keeps the engine default, which is greedy.
  That is what makes the per-agent frontmatter `temperature` (0.1–0.3) in
  `.opencode/agents/` load-bearing — do not remove it.
- Thinking is request-level too: the server defaults to thinking on and returns the
  trace in `reasoning_content`; `enable_thinking: false` turns it off.

## Measuring the steering payload

Anything loaded up front is paid for on **every model provider request**, in
tokens *and* in attention. Measure it rather than assuming:

```bash
bash .scratch/context-load.sh
```

It totals the always-on payload (AGENTS.md + agent definitions) against the 98k
local window, and flags navigation pointers that no longer resolve. Keep the
always-on total under ~5% of the window.
