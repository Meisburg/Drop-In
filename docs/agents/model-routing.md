# The local model (Strata specifics)

Read this **when the local model will not start, when a lane has to know which
model it is talking to, or when measuring what the steering payload costs.**

**Routing is not here.** Which model a task gets is a capability and resource
decision and it belongs to the scheduler — `docs/agents/factory.md` is that
record, and `factory/config.json` is its registry. This file carries only what is
true of the local server itself.

## What is running

- **`strata-max`** — systemd user unit, `http://127.0.0.1:8081/v1`, model
  `qwen3.8-flash-next-iq3_s`. Context 131072. Idle-unload 3600 s, so it releases
  ~55 GB after an hour of silence and the next request pays a reload.
- **`ninfer-serve`** — `http://127.0.0.1:18080/v1`, model `qwen3.8-27b`.
- **`strata-serve`** — `http://127.0.0.1:8080/v1`, the coder model.

**All three are mutually exclusive and the registry says so.** Their units
declare `Conflicts=`, and the scheduler gives each the same `exclusive` resource,
so two local inference servers cannot be admitted at once. Starting `strata-max`
while `ninfer-serve` holds VRAM does not fail cleanly — it crash-loops with
`the 512 experts do not fit in VRAM`, which is what it did 55 times on
2026-10-02. **Check with `factory doctor` rather than by starting something.**

## Agent definitions live outside this repo

The running harness is **pi**, and its agent definitions are in
`~/.pi/agent/agents/` — ported from the in-repo `.opencode/agents/`. That is a
real gap and it is named rather than hidden: those files steer every lane and
they are **not version-controlled with this repo and not scanned by
`scripts/steering-lint.sh`**, whose file set is repo-relative. A change to a
lane's behaviour made there leaves no diff, no review and no artifact.

## Measuring the steering payload

Anything loaded up front is paid for on **every** provider request, in tokens
*and* in attention. Measure it rather than assuming:

```bash
bash .scratch/context-load.sh
```

It totals the always-on payload against the local window and flags navigation
pointers that no longer resolve. Keep the always-on total under ~5% of the
window.

## Local-model quirks worth knowing

- **Do not pass request-level sampler overrides.** Strata applies the model's
  per-mode presets; overriding temperature disables the per-mode switch.
- **The per-agent `temperature` in the agent frontmatter is deliberate** (0.1–0.3)
  — the harness default is greedy, which triggered reasoning loops on this model.
- **The local window is much smaller than a frontier model's.** Size a slice
  against the window, not against a cloud model's smart zone.
