# Model routing (NInfer / DSH specifics)

Read this **when changing agent models, debugging a slow or costly lane, or
wondering which model handled a slice.**

## The split

The factory runs two models on purpose:

- **Cloud** `deepseek-v4.1-flash:cloud` (via Ollama) — the orchestrator and any
  escalated fix round. Judgment, routing, adjudication.
- **Local** `qwen3.8-27b` (via NInfer on the RTX 5090, port 18080) — every
  builder, reviewer, verifier, and explorer. The volume work, on hardware we own.

Configured in `~/.dsh/settings.yaml` (`agent-default-model`) and pinned per tool
in `~/.dsh/.agent-presets/code/agent.cordis.yml`: `tool-subagent` and
`tool-subagent-fork` both carry `agentOptions: {provider: qwen-local, model:
qwen3.8-27b}`.

**Known gap:** `tool-workflow` and `tool-ralph` carry no `agentOptions`, so their
workers fall back to the agent default — cloud. Fan-out through those tools
spends cloud tokens; `subagent` is the local path.

## NInfer specifics

- Endpoint: `http://127.0.0.1:18080/v1`, model id `qwen3.8-27b`.
- Context window: **98,304 tokens** — this is the *ceiling*. Budget slices well
  under it (see `docs/agents/coordinator.md`).
- Do not pass request-level sampler overrides; NInfer applies Qwen3.8's per-mode
  presets. Overriding temperature disables the per-mode switch.
- Deliberate exception: per-agent frontmatter `temperature` (0.1–0.3) in
  `.opencode/agents/` is intentional — opencode's implicit default is 0 (greedy),
  which triggered reasoning loops on this artifact.
- The 262K ceiling is a ceiling, not a target — keep each agent under ~40–60K
  tokens. The orchestration pattern is what keeps contexts small.

## Measuring the steering payload

Anything loaded up front is paid for on **every model provider request**, in
tokens *and* in attention. Measure it rather than assuming:

```bash
bash .scratch/context-load.sh
```

It totals the always-on payload (AGENTS.md + agent definitions) against the 98k
local window, and flags navigation pointers that no longer resolve. Keep the
always-on total under ~5% of the window.
