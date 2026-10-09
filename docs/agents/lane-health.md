# Lane health: why lanes stall, and how to prevent it

Written 2026-10-07 21:00 by Hermes, after measuring the actual cause of the V33
lane deaths. **This supersedes the "tight briefs fixed it" theory** — brief length
was a contributing factor, not the mechanism.

Read with `docs/agents/compute-split.md` (where jobs run) and
`docs/agents/parallel-development.md` (the concurrency ladder).

---

## The diagnosis (measured, not inferred)

Pi reported that the local builder lane "died in 4 of 9 sessions" and attributed it
to long briefs. That was wrong, or at best partial. The measurements:

| Observation | Value | Meaning |
|---|---|---|
| builder CPU time | **47 seconds in 6h 49m** | it is not computing; it is blocked |
| builder children | **none** | no tool running, no build, no test |
| Time since last tool call | **25m 40s** | far past any real tool |
| ninfer scheduler | `running=5 waiting=4` | **the server is queueing** |
| ninfer decode | as low as **27.8 tok/s** (median 145) | contention, 5x degradation |
| KV capacity | 122,880 tokens total | the binding limit |

**The mechanism:** with 4 coding lanes each carrying a 30-50k token context, the
sum exceeds the 122,880-token KV capacity. Requests queue server-side. A lane
sitting in `waiting` emits no output, advances no step counter, and is
**indistinguishable from a dead lane** on the pane. The operator (or the
orchestrator) concludes it died, and restarts it — losing the work in flight.

**So the deaths were self-inflicted by concurrency, not by brief quality.** Tight
briefs helped incidentally, because shorter briefs mean smaller contexts, which
delays the KV overflow. That is why the fix "worked" without being the cause.

**The measurement that would have caught it:** `~/fleet/bin/kv-probe` prints:

> *"any 'waiting=' above 0 means the server is queueing, i.e. this concurrency is
> past the comfortable point."*

There is no ambiguity in that sentence. It should be run before any batch that
uses more than one lane.

---

## The prevention protocol (three layers)

### Layer 1 — measure before dispatch (the cap is a number, not a guess)

```bash
~/fleet/bin/kv-probe
```

- `waiting=0` at the intended concurrency → **proceed.**
- `waiting>0` → **reduce the lane count** until it reads 0, or shrink the contexts.
- Record the number. Do not exceed it.

**Current measured state (2026-10-07): `waiting=4` at 4 lanes → over the line.**

**Practical cap for coding-sized contexts: 2 lanes**, per the registry's own
`ninfer_budget` (`builder: 2, review: 1, orchestrator: 1`). The registry was right
and the "4 lanes = 3.2x" figure from the earlier test was measured on trivial
requests — it does not transfer to 50k-token prompts. **Withdraw that figure.**

### Layer 2 — detect correctly (process state, never the pane)

```bash
~/fleet/bin/fleet-stall-check wQ:p15 --repo ~/Projects/playdate-app --grace 240
```

- `0 WORKING` / `1 THINKING` → leave it alone.
- `2 STALLED` → the exact recovery command is printed. Use it.

**A lane whose pane looks frozen may be working.** Always judge from process
state. This tool already exists and is correct; the gap is that nobody runs it.

### Layer 3 — recover automatically (the part that was missing)

Detecting a stall at 25 minutes is too late. The proactive piece is a watcher that:

1. Runs `fleet-stall-check` against the builder pane on a schedule.
2. On a **STALLED** verdict (not THINKING — that is a real distinction), it
   re-dispatches the same brief from `.scratch/v33/briefs/` to the same pane.
3. Records the retry in the ledger so the operator sees it happened.
4. Never retries more than N times for one brief, so a genuinely broken slice
   surfaces instead of looping.

**Do not build this until Layer 1 is respected.** Auto-recovery on an
over-subscribed server just churns: it kills a queued lane and re-queues it,
making the queue longer. Fix the cap first, then automate recovery.

---

## What to do, in order

1. **Cap concurrent coding lanes at 2.** Run `kv-probe` and confirm `waiting=0`.
2. **Rotate at batch boundaries only** (already the rule; just do not raise the cap).
3. **Build the auto-recovery watcher** once the cap holds — re-dispatch on a
   verified STALLED verdict, max 3 retries, every retry logged.
4. **Keep `.scratch/v33/BATCH-STATE.md`** — Pi's resumable snapshot is the reason
   a lane death costs minutes instead of the batch. That instinct was correct.

---

## The correction to tell Pi

Pi's report said the lane deaths were fixed by tighter briefs. Tell it the
measured cause was **KV contention at 4 concurrent lanes** (`running=5 waiting=4`,
decode down to 27.8 tok/s), and the fix is **2 concurrent coding lanes**, verified
with `kv-probe` before dispatch. Brief length remains good practice for a different
reason — a smaller context delays the overflow and leaves headroom — but it is not
the root cause, and treating it as such would leave the bug live.
