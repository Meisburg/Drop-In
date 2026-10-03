# Compute and model policy

Read this **before dispatching any lane, choosing a model, or wondering why a
task went to the cloud.** It is the written form of the founder's execution
policy: prefer the local 5090 and the tailnet, use cloud as an exception.

Everything below was **measured on this machine, 2026-10-02**, with the command
that produced it. Nothing is inferred from a name. Where a number is a declared
policy rather than a measurement, it says so.

## The finding that matters most

**The factory already says `local-preferred`.** `factory/config.json` carries
`policies.cost = "local-preferred"`, `cost_tier` ascending (local 0, tailnet 1,
cloud 2), and a documented cloud fallback. The policy is not missing.

**It is unenforceable**, and the router proves it. `factory route <kind>` on the
day this was written:

| task kind | routed to | why |
|---|---|---|
| builder | cloud | local rejected: no model clears the floor |
| reviewer | cloud | `strata-max` reasoning 2 < 3 |
| verifier | cloud | `ninfer` tool_use 2 < 3 |
| researcher | cloud | `strata-max` reasoning 2 < 3 |
| ocr | cloud | `ninfer` tool_use 2 < 3 |
| **explorer** | **fr-1/glm-4.7-flash** | the only local route that survives |
| gate | no model | deterministic; correctly needs none |

Two independent causes, and they need different fixes:

1. **ADMISSIBILITY.** `strata` and `ninfer` have `footprint_source:
   "unmeasured"`, and this registry refuses an unmeasured footprint. `strata-max`
   is declared `resident` and is **not running**. A model that cannot be admitted
   cannot be preferred, however cheap it is.
2. **CAPABILITY.** The remaining local models carry hand-declared capability
   levels below the task floors — `strata` reasoning **1**, `ninfer` tool_use
   **2**, `strata-max` reasoning **2** against a reviewer floor of 3.

**Cause 2 is the uncomfortable one.** Those levels are declared policy, not
benchmarks (see `_capability_source`), so the cloud default is the arithmetic of
numbers nobody measured. **The dishonest fix is to raise them until the router
prefers local. That fabricates a capability.** The honest fixes are to measure
them, or to accept the cloud route and say so.

## What is actually available

### This machine — `omarchy`, `100.120.87.29`, **the 5090**

RTX 5090, 32 GB VRAM (`nvidia-smi --query-gpu=memory.total`), 62 GB RAM.

Three local inference servers. **They are mutually exclusive** — the units
declare `Conflicts=` and the scheduler gives all three the same `exclusive`
resource, so **the 5090 serves exactly one local model at a time.** This is the
single most important constraint in this document: it means the 5090 cannot run
a builder and a reviewer concurrently.

| unit | model | endpoint | state | footprint |
|---|---|---|---|---|
| `strata-serve` | qwen3.8-flash-next-coder-iq1_m | `:8080` | active | **47.5 GB RAM peak, 12.7 GB VRAM** (measured `systemctl show MemoryPeak` = 50957361152; `nvidia-smi` per-process) |
| `strata-max` | qwen3.8-flash-next-iq3_s | `:8081` | **inactive/dead** | 55 GB RAM, 30 GB VRAM (measured, from the unit banner and a prior `nvidia-smi`) |
| `ninfer-serve` | qwen3.8-27b | `:18080` | **activating/auto-restart — crash-looping** | 24 GB VRAM; RAM unmeasured |

### Why `ninfer` cannot start — and it is not broken

**The crash loop is the `exclusive` rule working, and its message is exact:**

```
ninfer-serve: model weights require 18015238912 bytes of device memory,
              but only 17931894784 bytes are free before loading weights
```

18.0 GB needed, 17.9 GB free — **83 MB short, because `strata-serve` is holding
12.7 GB of the 32 GB card at that moment.** `ninfer` is not defective; it is
**locked out**, and it will keep restarting forever while `strata` runs.

`libcudart.so.13` is **present** (`ldconfig -p` → `/opt/cuda/lib64`, CUDA 13.3,
driver 610.57.04). The `cannot open shared object file` lines in its journal are
from **Sep 08** and are stale. The binary is fine.

**Consequence for the whole policy:** the strongest local model that can clear
the builder floor is `strata-max` (reasoning 2, coding 3, tool_use 3, ctx
131072). It needs 55 GB RAM and 30 GB VRAM. **Freeing the 5090 is therefore the
single highest-leverage action available**, and it is a resource decision, not a
configuration one — which is why this document does not take it.

**Never start or stop an inference server on an agent's own judgement** (D-001,
D-004). Report the trade; the human decides.

Ollama also runs here on `:11434`, but it holds **only `hemmingway*` (a
creative-writing model) and two cloud passthroughs.** There is **no local coding
model on this box's ollama.** Do not route here expecting one.

The desktop is a real consumer: Orca IDE ~225 MiB and Chrome ~356 MiB of VRAM are
charged to the GPU before any model loads.

### fr-1 — `100.92.51.0` — **online** (it was measured UNREACHABLE earlier in the
batch and the registry still carries that verdict)

Ollama on `:11434`, no auth (`ollama-ignores-keys`). **The most capable available
local box**, and its best model is not registered:

`qwen3.5:35b-a3b` 23.9 GB · `glm-4.7-flash:latest` 19.0 GB · `qwen3:14b` 9.3 GB ·
`gemma4:12b-it-qat` 7.2 GB · `qwen3.5:9b` 6.6 GB · `qwen3.5:4b` 3.4 GB

### fr-2 — `100.126.251.111` — online, `:8080`, bearer key

`gemma4-12b-qat-q4` (multimodal). **Not in the factory registry at all** — it
exists only in `~/.pi/agent/models.json`, so the factory cannot route to it.

### fr-3 — `100.79.67.85` — online, `:8080`, bearer key

`qwen3.5-4b-mtp-q4` (multimodal). Likewise unregistered.

**SSH limits, measured:** `fr-2` refuses publickey/password; `fr-3` is refused by
tailnet policy. **These two are inference endpoints only — no shell. Do not plan
work that needs to run commands there.**

### Offline, and therefore not to be planned against

`DESKTOP-JMR591K` (Windows, 38 d), `omarchy-5` (4 d), `jon-1` (24 d), `omarchy`
`100.97.204.54` (24 d).

## The routing policy

**Compute and model are two decisions.** Answer both, in this order.

1. **Local and tailnet before cloud.** `cost_tier` ascending, cloud only on
   justification (§ Cloud).
2. **The 5090 for work that needs it**: architecture, hard reasoning, complex
   implementation, difficult debugging. It is the only box with a 32 GB GPU and
   the only one holding the coder and 27B-class models.
3. **The other tailnet machines for everything lighter**: exploration, research,
   summarisation, small edits, parallel work that does not need the 5090.
4. **Deterministic work runs where the project environment lives** — `npm run
   verify`, e2e, lint. It needs no reasoning model and must not occupy one.
5. **Never move work to cloud because it is simpler.** The cloud path is the
   default today only because of the two causes above, and that is a defect to
   fix, not a policy to follow.

### The 5090 versus another local machine

**Use the 5090 when the task needs** a local model at 27B+ parameters, a long
context, or a coder model — and when **exactly one** such task will run at a
time, because of `Conflicts=`.

**Use a tailnet machine when** the work is bounded and lighter than the floors
above, when it can run in parallel, or when it is deterministic. `fr-1`'s
`qwen3.5:35b-a3b` is the strongest non-5090 option and is currently unregistered.

**Do not use the 5090 for trivial work.** It is the scarcest resource here: one
model at a time, and a resident model costs 47–55 GB of a 62 GB machine.

### When cloud is justified

All four must be true, and the run log must say which:

1. **No admissible local model clears the task's capability floor** — and the
   floor itself is justified, not inflated.
2. **The local route is unavailable for a resource reason** the scheduler can
   name: the 5090 is held by another resident model, or the machine is down.
3. **The task is on the critical path and the local route would serialise it**
   behind the `Conflicts=` constraint in a way that costs more than the tokens.
4. **A specific technical reason** — a capability the local models measurably do
   not have.

**Not justified:** the cloud path being the default, being already configured, or
being faster. Local execution is preferred even when cloud would be quicker.

**Budget rule.** Cloud spend is a metered resource like RAM. When a provider is
near its credit ceiling, its `cost_tier` route is suspended and the fallback is
the next tier down, not "carry on". The current provider is near its ceiling; see
§ The immediate situation.

## DSH execution pattern

**Orca is not the router.** `docs/agents/orca.md` is explicit: *"Orca is a
workspace, not an orchestrator."* It owns worktrees, terminals, the diff view and
its browser. **It never owns plan state, tickets, the ledger, or routing.**

**Compute and model selection belong to the factory scheduler**
(`factory/config.json`, `scripts/factory/scheduler.mjs`), **and the orchestrator
applies them.** Asking Orca to choose a computer per task would put routing
authority in the pane, which is the one thing `orca.md` forbids.

### Stay in this session when

- the work is **one bounded slice** with one writer — the default;
- it needs the plan, the ledger, or the acceptance record — those live here;
- it needs a migration applied, a live check, or a human decision;
- routing and verification must be observed by the coordinator.

### Delegate to another worker when

- the work is **independent and read-only** — exploration, research, review;
- it is a **second writer-free opinion** — a fresh-context review;
- it is **deterministic and can run elsewhere** — a gate, a targeted spec;
- it is **parallel and light enough** for a tailnet machine.

**Serialise writers.** One writer per worktree. The 5090's `Conflicts=` makes
this physical, not just procedural.

### The shape of a normal slice

1. Orchestrator routes: `factory route builder` → the model the scheduler picks.
2. If it falls back to cloud, that is a **scheduling outcome**: recorded, not
   escalated — but if it falls back **every time**, that is this document's cause
   1 or 2 and it is a defect.
3. Builder runs in its own worktree. One writer.
4. Reviewer — fresh context, and a different model family where available.
5. Verifier — deterministic, needs no reasoning model at all.
6. `ocr`, then the deterministic guards.
7. Acceptance, ledger, next slice.

## Configuration changes required

| # | change | why | honest? |
|---|---|---|---|
| 1 | Record `strata`'s measured footprint (47.5 GB / 12.7 GB) | it is running *right now* and the scheduler is blind to it | yes — measured |
| 2 | Reconcile `strata-max`: declared `resident`, actually dead | a resident model that is not running misreports the whole RAM picture | yes |
| 3 | Register `fr-2` and `fr-3` | they serve models and the factory cannot see them | yes |
| 4 | Register `fr-1`'s `qwen3.5:35b-a3b` | the strongest available local model, invisible to the router | yes — **capability level needs a decision, see below** |
| 5 | Re-probe `fr-1` | its registry entry says UNREACHABLE; it answers | yes |
| 6 | Suspend the near-ceiling cloud route | the credit budget rule above | yes |
| 7 | Point DSH's own model at local (`dsh-model local`) | `dsh-model show` currently reports the cloud DeepSeek — the same meter | yes |

**Change 7 needs a caveat that matters.** `dsh-model local` was run, and it sets
DSH to `qwen-local/qwen3.8-27b` — **which is `ninfer`.** As § above shows,
`ninfer` cannot load while `strata` holds the card, so DSH's local mode is
currently a target that will not start. The switch is correct as *intent* and
non-functional as *state*, and the fix is the same resource decision.
`dsh-model cloud` reverts it.

**Change 4 needs a human decision and this document will not make it for you.**
Declaring a capability level is either a **measurement** or a **fabrication**.
The registry's own `_capability_source` convention already distinguishes them;
the new entry must say which it is.

### What was done, and what was deliberately not

**Done (measured, reversible):**

- `strata`'s footprint recorded as **48 GB RAM / 13 GB VRAM** — previously
  `unmeasured`, which made the one local model **actually running** inadmissible
  and left the scheduler blind to 41 GB of resident memory.
- `dsh-model local` — DSH's default moved off the metered cloud provider.
- This document written, and made reachable from `AGENTS.md`.

**Not done, on purpose:**

- **The 5090 was not freed.** Stopping `strata` to let `strata-max` or `ninfer`
  load is a resource decision (D-001/D-004 forbid an agent taking it alone).
- **No capability level was raised.** Raising `strata`'s `reasoning: 1` until the
  router picks local would fabricate a capability and silence the true reason
  local is unused.
- **`fr-2` and `fr-3` were not registered.** They need declared capability levels
  nobody has measured; registering them with invented numbers would put
  fabrication into the registry the router trusts.

## The immediate situation

**The orchestrator session itself — this session — runs on
`ollama-cloud/deepseek-v4.1-flash:cloud`, the provider nearest its credit
ceiling.** Every turn is metered. `dsh-model show` reports the same model as
DSH's default.

The cheapest correct action available today is therefore not a config edit:
**move the coordinator itself to a local model.** A coordinator reasons and
routes; it does not need the frontier model, and it is the single largest
consumer because it is always on.

## The target state — IQ3_S is the primary, ninfer is the fallback

**This is a deliberate change of target, decided by the human on 2026-10-02.**
`strata-max/qwen3.8-flash-next-iq3_s` is the model this factory WANTS building and
reasoning. `ninfer/qwen3.8-27b` is the fallback that carries the work until the
machine can hold the primary. Cloud is an exception lane, not a replacement.

### Why the primary is not running today — and it is not the model

Measured 2026-10-02, four loads, all in `factory/config.json`'s `footprint_evidence`:

| what | measured |
|---|---|
| pinned host arena | **46.84 GiB**, fixed |
| weights and KV state | ~4.8 GB |
| total RAM | **~52 GB** |
| VRAM | **31.8 GB — the whole card** |
| load | 20 s |
| generation | **71.8 tok/s** (MTP speculation) |
| context | **131072**, full |
| tool use | **verified 4/4**, correct name and arguments |

It works. It is fast. What it cannot do is leave headroom: admission needs
`52 + 4 reserve + 3 task = 59 GB`, the machine reports **~2 GB available** while it
runs. **The binding constraint is RAM headroom, not the model.**

Two things were established that stop the obvious workarounds:

1. **The expert cache is a COPY, not a relocation.** `--kv q4_0` plus a halved
   context grew the resident expert cache 11330 -> 11989 slots and the arena
   stayed **46.84 GiB, unchanged**. Freeing VRAM does not free RAM.
2. **The reserve is not to be weakened, and no capacity number is to be adjusted
   to force admission.** The correct fix is more RAM.

### The correct fix

**The machine has two EMPTY DIMM slots and a ceiling of 192 GiB** (2 x 32 GiB
DDR5-5600 installed). Adding 2 x 32 GB takes it to 128 GB: `128 - 52 - 13 other`
leaves roughly **35 GB of headroom**, comfortably above the 7 GB that admission
needs. **That is the whole fix. Nothing else has to change.**

### How the automatic switch works — and where it comes from

**Nothing is reconfigured after the upgrade.** The router already orders the two
correctly, and `factory/config.json` now says WHY on purpose:

- Both are `cost_tier 0`, so both are local-preferred.
- Both clear the builder floor.
- `strata-max` carries **`preference: -1`** (lower wins; default 0), applied after
  the cost tier and before capability headroom.

That `preference` matters more than it looks. The tie-break it precedes,
`capabilityHeadroom`, **sums raw units** — a context window counted in tokens
beside a reasoning level out of five. `strata-max` wins that sum by 32768 points
purely because 131072 is a bigger number than 98304. **So the factory's primary
model was being chosen by an accidental unit scale.** The preference makes the
order intentional, and it means normalising that sum later cannot silently flip
which model builds the app. It is **not** a capability claim: no declared
capability value was raised to produce it (D-034).

### What the factory will route once the RAM is installed

| lane | model | local? |
|---|---|---|
| builder | `strata-max/qwen3.8-flash-next-iq3_s` | ✅ |
| verifier | `strata-max/...` | ✅ |
| explorer | `strata-max/...` | ✅ |
| ocr | `strata-max/...` | ✅ |
| **reviewer** | **`ninfer/qwen3.8-27b`** | ✅ |
| researcher | `ollama-cloud/deepseek-v4.1-flash:cloud` | cloud |

**Cloud leaves the build loop entirely; the researcher lane is the only one left.**
The reviewer is a different model by necessity: `strata-max` declares
`reasoning: 2` against a reviewer floor of `3`, so the model that builds **can
never be the model that reviews**. Independence here is enforced by capability,
not by bookkeeping.

### Verify the switch in one command

    node scripts/factory/factory.mjs route builder

`strata-max/qwen3.8-flash-next-iq3_s` is the primary active. `ninfer/qwen3.8-27b`
means the RAM is not there yet — **not a fault, the fallback doing its job.**
`node scripts/factory/factory.mjs doctor` shows the arithmetic behind it.

The behaviour is pinned by `scripts/factory/scheduler.test.mjs`, including a case
that switches the builder from `ninfer` to the primary on **admissibility alone**
with nothing reconfigured, and two mutation-proven cases that go red if the
preference stops being applied or starts outranking the cost tier.

### Known-open, recorded rather than smoothed over

- **The reviewer is the SAME FAMILY as the builder** (both Qwen). D-035 found that
  a shared blind spot is one verdict counted twice; only a different family buys
  independence from *prior*. `ollama-cloud/glm-5.3` (GLM) is the family-independent
  option and remains available for a genuinely independent review. **This is a
  deliberate, recorded trade, not an oversight.**
- **The two models cannot be loaded at once.** Both want the whole 32 GB card, so
  moving between the builder and its reviewer is a **model swap of roughly 20-30 s**
  per lane. The factory serialises it correctly through `exclusive:
  local-inference`; it is a cost, not a fault.
- **`--expert-cache-per-layer` is UNAVAILABLE.** It fails the engine's own
  `ExpertCache::verify_slot` and the engine exits rather than serving corrupt
  expert data. Recorded in `factory/config.json` under `unavailable_flags`.
- **`MAP_HUGETLB` is unavailable**, so the 46.84 GiB arena is backed by 4 KB pages.
  Configuring a hugetlb pool is a real, small win (page tables and TLB pressure),
  and it is a system change, not a factory change.
- **`strata-max` still declares `residency: resident`**, which is false — it is
  loaded on demand and cannot be resident alongside a satisfiable reserve on this
  machine. Left as declared rather than quietly edited, and recorded here.

### The ONE machine step at upgrade time — and why it is not automatic yet

**Routing switches by itself. Loading the model does not, and that is deliberate:**

- **D-004: the factory never starts or stops an inference server on an agent's own
  judgement.** It chooses a model and prints the command; a human decision, or an
  explicit authorisation, starts it. The comment in `factory.mjs` says exactly this,
  and hardening it into an automatic start would quietly remove a safety property
  that was chosen on purpose.
- **All three units are `enabled`, and only `strata-max` and `strata-serve` declare
  `Conflicts=`.** Today that is harmless: `strata-max` cannot fit, so it fails and
  `ninfer-serve` carries every lane. **After the RAM upgrade both would try to load
  at login — 31.8 GB plus 23.4 GB against a 32 GB card — and whichever loses is
  decided by startup order.** That is a race, not a policy.

**So do this once, when the RAM is in:**

    systemctl --user disable --now ninfer-serve

That is the whole machine step. Leave it disabled while the primary is viable:
`ninfer` remains registered, still clears every floor it cleared before, and the
router reaches for it whenever `strata-max` is not admissible. **Disabling a unit
does not remove a model from the registry — the fallback stays a fallback.**

**This is NOT to be done before the RAM arrives.** Switching the conflict today
would leave a machine where nothing local loads and every lane falls to cloud —
strictly worse than the current state, in which the fallback is doing exactly its
job. The ordering matters more than the edit.

**Recorded rather than built:** the factory could in principle start the routed
model itself. It does not, and that is a decision to revisit with the human rather
than to take by momentum.
