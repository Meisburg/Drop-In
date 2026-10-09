# The software factory: fleet capacity, measured

Written 2026-10-07 by Hermes. **Read this with `parallel-development.md`** — that
file covers the concurrency rules and the five-stage ladder; this one covers
*where* the lanes can actually run, based on measurements taken today.

The first draft of `parallel-development.md` said "your ceiling is 4 lanes, not
2,500 PRs/month." That was written against ONE machine. The fleet is four
machines plus a 338-slot cloud router. Correction below.

---

## 1. What poteto actually does (four layers)

From the interview clipping:

> *"coordinator agents... really good at sort of delegating and not doing work of
> their own but they manage and supervise... they spawn sub agents."*

> *"how I arrive at 2,000 or however many PRs is the fact that I have all these
> **loops** set up."*

> *"the big unlock... is working backwards of **how do I get to the point where my
> agent can merge its own code**."*

> *"graph bots that look at my Slack channels, look at my X, or my emails, or
> linear... they have routines that subscribe."*

| Layer | What it is | Scaling unit |
|---|---|---|
| 1. Trigger | bots watch channels; work arrives uninitiated | **channels watched** |
| 2. Coordinator | supervisors that delegate, never build | **coordinators** |
| 3. Builders | workers in separate worktrees | **machines × lanes** |
| 4. Auto-merge | agent merges its own code | **verification coverage** |

**The scaling unit is coordinators, not builders.** One coordinator → ~4 lanes.
Adding builders behind one coordinator just lengthens its queue.

---

## 2. Measured capacity

### The 5090 (`arch`) — local inference
Live test against ninfer today (Qwen 3.8 27B, NVFP4, ~25GB resident):

| Concurrency | Throughput | Note |
|---|---|---|
| 1 | 0.50 req/s | what runs now |
| 2 | 0.89 req/s | |
| **4** | **1.62 req/s** | **3.2x — the sweet spot** |
| 6 | 1.33 req/s | degrades past the knee |

**Registry doctrine wins over my measurement** (`fleet.json → ninfer_budget`):

```
builder: 2   review: 1   orchestrator: 1   → 4 in-flight, against 6 server slots
assumed_safe_concurrency: 3 (builder-class)
"the server is not the budget"
"Do not raise until KV pressure has been measured."
```

Follow the registry: 2 builders max on the 5090, because it reserves slots for
review and orchestration. That is *more* correct than "4 builders."

### The other machines — cloud-model workers, no GPU needed
| Host | CPU | RAM | Disk | Ready? |
|---|---|---|---|---|
| **fr-1** | 20 cores | 31GB | 521GB | **YES** — node v26.8.1, herdr, git 2.55, tmux, repo clone |
| **fr-2** | 12 cores | 31GB | 1.6TB | node/herdr status to confirm |
| **fr-3** | 8 cores | 15GB | — | reachable as `bernie@100.79.67.85`, **no node yet** |

**The key realisation: a cloud-model worker does not need a GPU.** It needs CPU,
RAM and network — all three present. `fr-1` is a fully provisioned worker today.

Your instinct was that these machines are weak for local AI. Correct. But they do
not need to run a local model: **they call a model that is running somewhere
else.** That is what makes them useful.

### Cloud capacity — freellmapi (the big one)
Self-hosted router on the 5090. Docker `freellmapi-freellmapi-1`, listening
`127.0.0.1:3001`, key at `~/.config/freellmapi/key`.

**338 model slots exposed, 103 available, all routed through provider free-tiers:**

| Slot | Context | Note |
|---|---|---|
| `claude-opus-5.5` | 1M | frontier, free-tier routed |
| `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna` | 1M | |
| `grok-4.7` | 1M | |
| `gemini-3.8-flash` | 1M | |
| `deepseek-v4.1-flash` | 1M | what Pi already uses |
| `qwen3.8-27b` | 262k | local fallback |
| `auto` / `fusion` | 1M | router picks / panel + judge |

Routing strategy is `priority` (set 2026-10-05), tier-0 primary = omarchy ninfer,
with local fallbacks registered. Quota caveat from the registry: *"groq 250
req/day (tightest workhorse meter)"* — the router spreads across providers, but
the tightest meter is the practical limit.

**fr-1 can already reach both** over Tailscale: `ninfer:18080` returns 401 (alive,
needs auth) and freellmapi is reachable once the port is right (3001, not 4000).

---

## 3. The corrected ceiling

Not 4 lanes. This:

| Tier | Capacity | Cost |
|---|---|---|
| 5090 local | 2 builders + 1 review + 1 orchestrator | free (already paid) |
| fr-1, fr-2, fr-3 | 3 cloud-model workers | free-tier |
| freellmapi router | ~100 available slots, quota-bound | free-tier |
| Ollama Cloud | overflow, budget-gated | subscription |

**Realistic steady state: 6–9 concurrent lanes**, with cloud as overflow rather
than the primary. The binding constraints are **the tightest free-tier meter** and
**how many coordinators you run** — not the GPUs.

---

## 4. Revised order of operations

The five stages live in `parallel-development.md`. The ordering changes given what
fr-1 actually is:

1. **Stage 1 — read-only lanes concurrent.** Free, permitted by the spine today.
   Measure batch wall-clock before and after.
2. **Stage 3 — fr-1 joins as a worker.** Do this *before* a second local builder,
   because fr-1 is already provisioned and adds a lane without touching the 5090's
   KV budget at all. Then fr-2.
3. **Stage 4 — a second coordinator.** The real multiplier. Two supervisors, two
   workstreams, disjoint slice sets, **separate task boards.**
4. **Stage 2 — second builder on the 5090.** Only after 1 and 3 prove clean, and
   cap at 2 per the registry.
5. **Stage 5 — agents merge their own code.** Needs full `verify-drop-in`
   coverage and a week of clean overnight runs. Foundation already exists:
   `docs/agents/auto-push.md` (three-condition gate, 2026-09-17).

**Rationale for the reorder:** fr-1 costs nothing to add and does not consume the
5090's KV budget, whereas a second local builder does. Take the free lane first.

---

## 5. Honest differences from poteto

| | Poteto | You |
|---|---|---|
| Hardware | cloud, effectively unbounded | 4 machines, 4 local lanes + ~100 free slots |
| Trigger | bots on Slack/X/Linear | agentation annotations only |
| Coordinators | several | one |
| Merge | agents self-merge | you gate; auto-push doc exists but unused |
| Models | frontier paid | frontier **free-tier routed** |

**Her 2,500 comes from layers 1 and 4, not layer 3.** Trigger loops and
auto-merge. More builders with no trigger layer and no auto-merge just produces
more unreviewed work sitting in a queue.

**Where your leverage is:** Stage 1 (free throughput), Stage 3 (free lane),
Stage 4 (the multiplier), Stage 5 (makes it safe).

---

## 6. First moves

1. **Stage 1 today** — free, permitted, measurable.
2. **Measure batch wall-clock** before and after. If it does not drop, stop.
3. **Then put fr-1 to work** — three machines' worth of worker capacity is sitting
   idle right now.
4. **A second coordinator before a second local builder** — coordinators multiply;
   builders just queue.
