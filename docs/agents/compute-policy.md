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

**It WAS unenforceable on 2026-10-02**, and the router proved it then. Both
causes below have since been fixed and the table has moved. The historical
snapshot is kept because it is what the fixes were measured against:

| task kind (2026-10-02) | routed to | why then |
|---|---|---|
| builder | cloud | local rejected: no model clears the floor |
| reviewer | cloud | `strata-max` reasoning 2 < 3 |
| verifier | cloud | `ninfer` tool_use 2 < 3 |
| researcher | cloud | `strata-max` reasoning 2 < 3 |
| ocr | cloud | `ninfer` tool_use 2 < 3 |
| **explorer** | **fr-1/glm-4.7-flash** | the only local route that survives |
| gate | no model | deterministic; correctly needs none |

**RE-MEASURED 2026-10-04** (`node scripts/factory/factory.mjs route <kind>`) —
**local-first now holds for five of the seven kinds** (builder, reviewer,
verifier, ocr, explorer). `researcher` still falls back to cloud and `gate`
correctly needs no model. Do not use the old table to predict a route:

| task kind | routed to | why |
|---|---|---|
| builder | `ninfer/qwen3.8-27b` | capability floors met, admissible, cost_tier 0 (local-preferred) |
| reviewer | `ninfer/qwen3.8-27b` | same |
| verifier | `ninfer/qwen3.8-27b` | same |
| **ocr** | `ninfer/qwen3.8-27b` | same |
| **explorer** | `ninfer/qwen3.8-27b` | same |
| researcher | `ollama-cloud/deepseek-v4.1-flash:cloud` | preferred tier unavailable — falls back to cost_tier 2 |
| gate | no model | deterministic; correctly needs none |

Two independent causes, **both now fixed** (each verified 2026-10-04):

1. ~~**ADMISSIBILITY.**~~ **FIXED.** `strata` and `ninfer` now carry
   `footprint_source: "measured"` in `factory/config.json` (ninfer 3 GB RAM /
   24 GB VRAM; strata 48 GB / 13 GB), each with a `MEASURED 2026-10-02` evidence
   string. Change 1 below is what fixed it. ⚠️ **One number is still
   unreconciled, and it is a known open item rather than a fixed one:**
   `strata-max` declares `ram_gb: 55` while **its own `footprint_evidence` says
   52 is the measured figure and 55 was the unit banner's estimate**. The router
   uses the declared **55**, and `scripts/factory/scheduler.test.mjs:299` pins it
   (`/RAM: needs 62 GB/` = 55 + task 3 + reserve 4) — lowering the config to the
   measured 52 fails 4 tests in that file. Reconciling them means moving the
   config and that assertion **together**, in its own slice. It is recorded here
   rather than done silently.
2. ~~**CAPABILITY.**~~ **FIXED for `ninfer`.** Its `tool_use` is **3**, not 2 —
   `_tool_use_source` records the empirical verification, verbatim: *"Was
   declared tool_use: 2, which failed the builder/reviewer/verifier floor of 3
   and sent every lane to cloud."* `strata` (reasoning 1) and `strata-max`
   (reasoning 2) remain below the reviewer floor and are still correctly not
   preferred.

**Cause 2 was the uncomfortable one, and the fix honoured the principle.** Those
levels are declared policy, not benchmarks (see `_capability_source`), so the old
cloud default was the arithmetic of numbers nobody measured. **The dishonest fix
was to raise them until the router prefers local — that fabricates a
capability.** What happened instead: `ninfer`'s `tool_use` was **measured** (one
round trip to `POST /v1/chat/completions` with a tool schema returned
`finish_reason=tool_calls`), and `strata`'s and `strata-max`'s declared levels
were left alone.

## What is actually available

### This machine — tailnet node `omarchy-2`, local hostname `omarchy`, `100.120.87.29`, **the 5090**

> **Name note (re-measured 2026-10-04).** The tailnet node for `100.120.87.29`
> is **`omarchy-2`**. The bare name `omarchy` is a *different* machine
> (`100.97.204.54`, offline 26 d). The local hostname on this box really is
> `omarchy`, which is why the doc and `tailscale status` disagreed. Both names
> are given above so neither has to be guessed.

RTX 5090, 32 GB VRAM (`nvidia-smi --query-gpu=memory.total` → `32607 MiB`),
62 GB RAM (`free -g` → 62 total, 37 available). Both re-verified 2026-10-04.

Three local inference servers. **They are mutually exclusive** — the scheduler
gives all three the same `exclusive` resource, the two `strata` units also
declare `Conflicts=` against each other, and the engine config's `before_load`
list keeps `ninfer` off them — so **the 5090 serves exactly one local model at a
time.** This is the single most important constraint in this document: it means
the 5090 cannot run a builder and a reviewer concurrently. (⚠️ Corrected
2026-10-04: this paragraph used to say the units' `Conflicts=` is what covers all
three. It is not — see the note under the unit table below.)

**⚠️ THE STATE COLUMN WAS ROTATED — corrected 2026-10-04.** The 2026-10-02
snapshot had assigned each unit the state of another one, and the roles have
since swapped: the description this doc gave `ninfer-serve` is the description
that belongs to `strata-max`.

| unit | model | endpoint | state (measured 2026-10-04) | footprint |
|---|---|---|---|---|
| `strata-serve` | qwen3.8-flash-next-coder-iq1_m | `:8080` | **inactive (dead)** — `:8080` refuses on the host itself | **47.5 GB RAM peak, 12.7 GB VRAM**, from the config's `footprint_evidence` (`MemoryPeak` = 50957361152). ⚠️ The live `systemctl --user show strata-serve -p MemoryPeak` reads **`[not set]`** — an inactive unit that has not run this boot keeps no peak, so this figure is the recorded measurement, not a repeatable one. |
| `strata-max` | qwen3.8-flash-next-iq3_s | `:8081` | **activating (auto-restart) — crash-looping** — `status=1/FAILURE`, **`NRestarts` 4934 and climbing** (3544 → 4934 across ~2 h — read it, never quote it), Mem peak 855 MB; `:8081` refuses | **52 GB RAM measured** — the unit banner's 55 is still what `config.json` declares (cause 1 above), 30 GB VRAM |
| `ninfer-serve` | qwen3.8-27b | `:18080` | **active (running)** — **NRestarts 0**, holds 25340 MiB, `/v1/models` → 200 serving `qwen3.8-27b` | 24 GB VRAM; **3 GB RAM** — the config's `footprint_evidence` records 2.3 GB after loading and answering, and the live `MemoryPeak` reads 2.69 GiB (2890633216 bytes) |

**Why the rotation happened — and it is this document's own thesis working in
reverse.** ⚠️ **Corrected 2026-10-04: the `Conflicts=` mechanism stated here (and
in the audit that produced it) was WRONG.** `ninfer-serve` declares only
`Conflicts=shutdown.target` — it does **not** conflict with either strata unit
(`systemctl --user show ninfer-serve -p Conflicts --value`). The two strata units
conflict with **each other** (`strata-serve Conflicts=… strata-max.service`, and
the reverse). What actually keeps `ninfer` and `strata` apart is the engine
config's `before_load` list — the units' own comments say so — plus the
scheduler's `exclusive` resource. **The conclusion is unaffected:** `ninfer` holds
the card (25.3 of 32.6 GB), so the two units the old table called *running* are
the two that cannot run, and the one it called *crash-looping* is the one carrying
every lane.

### Why `ninfer` used to be locked out — the lock has since moved (2026-10-04)

**This section is history: it describes 2026-10-02, when `strata-serve` held the
card. Today `ninfer` holds it and serves every lane, and `strata-max` is the one
crash-looping.** The mechanism it documents is still the governing rule, so it is
kept:

**The crash loop is the `exclusive` rule working, and its message is exact:**

```
ninfer-serve: model weights require 18015238912 bytes of device memory,
              but only 17931894784 bytes are free before loading weights
```

18.0 GB needed, 17.9 GB free — **83 MB short, because `strata-serve` was holding
12.7 GB of the 32 GB card at that moment.** `ninfer` was not defective; it was
**locked out**, and it would keep restarting forever while `strata` ran. The same
lock now runs the other way: `strata-max` needs 30 GB of a card that `ninfer` is
holding 25.3 GB of, which is why **its** `NRestarts` is 3544.

`libcudart.so.13` is **present** (`ldconfig -p` → `/opt/cuda/lib64`, CUDA 13.3,
driver 610.57.04). The `cannot open shared object file` lines in its journal are
from **Sep 08** and are stale. The binary is fine.

**Consequence for the whole policy (re-measured 2026-10-04).** The strongest
local model that *could* clear the builder floor is `strata-max` (reasoning 2,
coding 3, tool_use 3, ctx 131072) at **52 GB RAM** and 30 GB VRAM — but it cannot
take the card from `ninfer`, and the router does not prefer it. **The lanes route
to `ninfer` today, and that is working** (see the routing table above). Freeing
the 5090 for `strata-max` is still a resource decision rather than a
configuration one, which is why this document does not take it.

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

`DESKTOP-JMR591K` (Windows, 40 d), `jon-1` (26 d), `omarchy` `100.97.204.54`
(26 d).

> **Corrected 2026-10-04, then corrected AGAIN the same evening: `omarchy-5`
> flaps, so do not put it in either list.** It read `active` (relay "sea") when
> this correction was first written, and `offline, last seen 4h ago` under two
> hours later (`tailscale status | grep omarchy-5`). It is a tailnet node that
> comes and goes; **re-read it rather than trusting this line.** The ages above
> are drift from the 2026-10-02 snapshot (+2 d), not errors — and they are drift
> too, so re-measure them.

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
| 7 | Point DSH's own model at local (`dsh-model local`) | ~~`dsh-model show` reports the cloud DeepSeek~~ — **DONE, it reports local now** | yes |

**✅ Change 7 is DONE and functional (re-measured 2026-10-04).** `dsh-model show`
→ `{'provider': 'qwen-local', 'model': 'qwen3.8-27b'}` — **which is `ninfer`** —
and `ninfer` is `active (running)`, holding the card and answering on `:18080`.
The caveat this section used to carry ("DSH's local mode is currently a target
that will not start") is **stale: the target starts.** `dsh-model cloud` reverts
it.

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
