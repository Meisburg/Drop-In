# Where each job runs (the compute split)

Written 2026-10-07 by Hermes. **Decision made, not a menu.** This replaces the
"put fr-1 to work as a cloud worker" advice in `fleet-capacity.md`, which was
wrong — a cloud-model worker gains nothing from another machine, because the
rate meter is shared.

Read with `parallel-development.md` (concurrency rules) and `fleet-capacity.md`
(measured capacity).

---

## The principle

**A rate meter cannot be parallelised by adding machines.** If the bottleneck is
Ollama's 4,060 requests per 5 hours, then ten machines and one machine hit the
same wall. Adding a host to a cloud-worker pool buys *nothing*.

What another machine *can* buy:

| Resource | Distributed by adding hosts? |
|---|---|
| Cloud model throughput | **No** — shared meter |
| Local GPU inference | Yes, but only if the host has a usable GPU |
| **CPU + RAM for GPU-irrelevant work** | **Yes** |
| Uptime across reboots | Yes |
| Fault isolation | Yes |

So the useful question is never "can I add a worker?" It is **"is this job
GPU-irrelevant and resource-heavy?"** If yes, another machine helps. If no, it is
overhead.

---

## The split

### Runs on the 5090 (`arch`) — the box you work on
- Anything that needs the local model (dsh builders, review, orchestration).
- Anything interactive — you are sitting here.
- **Cloud subagents.** They are cheap: an API call with its own context window.
  Ten of them cost a few GB of RAM, not a fleet.

### Runs on fr-2 — the test runner
**Decision: the overnight Playwright suite moves here.**

Why fr-2 specifically (measured today):

| host | free RAM | node | herdr | repo | deps | browsers | verdict |
|---|---|---|---|---|---|---|---|
| fr-1 | **2GB** | v26.8.1 | yes | yes | yes | yes | **no** — an Ollama llama-server holds 21GB resident |
| **fr-2** | **18GB** | v26.7.0 | yes | yes | yes | yes | **YES** |
| fr-3 | 6GB | none | yes | no | — | — | needs provisioning |

fr-2 has everything the suite needs, already: repo at `1ba9bc1`, `node_modules`,
`.env`, Playwright chromium-1243, both preview ports free, and a live-Supabase
route that answers (401 = alive).

Why this is the right job for it:

- **69 serial Playwright specs, 40+ minutes, CPU-heavy, zero GPU.** Exactly the
  GPU-irrelevant case.
- It currently runs on the machine you are working on, competing with your editor,
  your browser and the local model. Moving it frees the whole box.
- `.scratch/overnight/` is a gitignored artifact directory, so a remote run costs
  nothing to collect — the decision log is a file to copy back.
- No cloud cost at all.

### Does not get used (yet)
- **fr-1** — its RAM is committed to the Ollama llama-server. Leave it serving
  memory; do not repurpose it. If that server is ever retired, fr-1 becomes the
  better runner (20 cores).
- **fr-3** — 8 cores, 6GB free, no node, no repo. Provisioning it costs more than
  it returns. Revisit only if fr-2 proves to be a bottleneck.
- **freellmapi** — rejected on experience (slow, restrictive).
- **fr-1/2/3 as cloud worker pool** — rejected on principle. Shared meter.

---

## The one rule

**GPU-irrelevant and resource-heavy → another machine. Everything else → local.**

Do not add hosts to a cloud pool. Do not run a test suite on the box you are
working on when an idle 12-core machine is sitting on the tailnet.

---

## What this changes

1. **WIRED 2026-10-07.** The overnight job (`0f2f09574e7d`) now runs its suite on
   fr-2 and collects only the decision log back. Entrypoint:
   `~/.hermes/scripts/cron-overnight-verify.py` (falls back to local if fr-2 is
   unreachable, so the job always reports). Manual invocation:
   `bash scripts/fr2-run-suite.sh`.
   - The report line ends with `[on fr-2 (offloaded)]` so the log always says
     where it ran.
   - Deps note: fr-2's `node_modules` is NOT rsynced (deliberately — it is large
     and machine-local). After a `package.json` change, run
     `ssh fr-2 'cd ~/Projects/playdate-app && npm install'` **once**, or the
     remote build fails with `Cannot find module '@capacitor/*'`.
   - fr-2's git cannot fetch from this box (no key this box accepts), so the sync
     is a one-way **rsync push** of the tree, excluding `.git`, `node_modules`,
     `.env`, `.scratch`, `dist`, `test-results`.
2. `fleet-capacity.md`'s "put fr-1 to work" recommendation is superseded by this
   file.
3. fr-1 keeps doing what it already does (serving memory). That is a real job.
4. Cloud lanes stay bounded by the Ollama meter, wherever they run — so route
   them on the 5090 and keep the pre-dispatch budget check in the path.
