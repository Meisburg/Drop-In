# Builder routing: cloud lanes vs local lanes

Written 2026-10-07 21:05 by Hermes. **This is the fix for the lane deaths.** Read
with `docs/agents/lane-health.md` (the diagnosis) and `compute-split.md` (where
jobs run).

---

## The problem this solves

The 5090's KV cache is 122,880 tokens. Coding lanes carry 30-50k-token contexts.
So **the local box supports roughly 2 concurrent coding lanes, and 3-4
over-subscribes it** — requests queue server-side, a queued lane looks dead, and
it gets restarted, losing work in flight.

Measured today: 3 lanes live, `running=5 waiting=4`, decode down to 27.8 tok/s.

**Cloud lanes cost the 5090 nothing.** They have no local context, no KV
allocation, no queue. That is the whole point.

---

## The split

| Lane | Model | Why |
|---|---|---|
| Builder (the ONE local lane) | **local** `ninfer/qwen3.8-27b` | free, and the GPU is otherwise idle |
| Builder 2+ | **cloud** `ollama-cloud/deepseek-v4.1-flash` | absorbs every extra lane with **zero** local KV cost |
| Review / ocr | **cloud** `ollama-cloud/glm-5.3` | different family than the builder, so it cross-judges rather than self-reviews |
| Orchestrator (Pi) | cloud (already) | needs reasoning, no repo context pressure |

**Result: exactly ONE local builder lane. Everything else on cloud.**

## Why one, not two (the arithmetic)

The server's `--kv-capacity` is **163,840 tokens TOTAL**, shared across every lane:

| Local lanes | Context each | Verdict |
|---|---|---|
| **1** | **full ~98k window** | ✅ the lane keeps its whole window |
| 2 | ~80k on paper | ⚠️ cache fragments, prefills collide |
| 3 | ~54k each | ❌ **`CONTEXT_WINDOW_EXCEEDED`** — observed on `wQ:p19` |

A coding session fills 54k in minutes. That is precisely the error the operator saw.

**Local is the scarce resource; cloud is the metered one. Spend the metered one.**

## The budget reality (measured 2026-10-07 21:05)

```
weekly   35.8% used · cap 70,700 req · resets in 3.83 days
session   0.7% used · cap  4,060 req · resets in 4.96 hours
verdict  OK -> cloud ok
```

**~64% of weekly and ~99% of the session window are free.** Cloud capacity is not
the constraint; the local KV cache is.

**Two hard rules from the playbook, unchanged:**

1. **A hard 429 kills a cloud lane silently** — after the prompt, with zero files
   changed. Never leave a cloud lane unsupervised across a cap boundary. The
   lane-health watcher checks the budget before it re-dispatches.
2. **Ollama Cloud is for PARALLEL agents — extra capacity, not the default.** The
   5090 stays the primary. Cloud absorbs the overflow that the KV cache cannot.

---

## How to dispatch a cloud builder

The alias table in `~/.pi/agent/pstack-models.md` already routes:
```
opus    -> ollama-cloud/deepseek-v4.1-flash:cloud   1M ctx
fable   -> ollama-cloud/glm-5.3                     1M ctx
sonnet  -> ninfer/qwen3.8-27b                       local, 98K ctx
```

So a lane is cloud or local purely by which alias it runs on. Name the model in
the brief:

- **Local lane** → `sonnet` / `ninfer/qwen3.8-27b`
- **Cloud lane** → `opus` (deepseek) or `fable` (glm)

**Before dispatching a cloud lane:**
```bash
~/fleet/bin/ollama-cloud-budget --json    # verdict must not be CRIT
```
- `OK` → dispatch
- `WARN` → local only, do not start a new cloud lane
- `CRIT` → local only, do not escalate for any reason

---

## The rule, in one line

**One builder on the 5090. Everything beyond that goes to cloud, gated on budget.**

The local box is a scarce, KV-bounded resource. Cloud is a metered one. Spending
the metered resource to protect the scarce one is the correct trade — and you have
64% of the metered resource unused.

---

## What changes in practice

1. **Pi should never run 3+ local builders.** Cap local at 1-2; the watcher reports
   when it is exceeded.
2. **Parallel slices take cloud lanes.** Same worktrees, same one-writer rule, just
   a cloud model behind it.
3. **The lane-health watcher gains a budget check** before any re-dispatch, so a
   retry can never start on a nearly-empty meter.
4. **`kv-probe` becomes a pre-flight check for local lanes only**, not for cloud.

**Not changed:** the one-writer-per-worktree rule, the never-push rule, the
verification requirements. Routing is orthogonal to all of them.
