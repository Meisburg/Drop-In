# Brief template — the shape every slice brief must take

> Copy this file, fill the `<…>` slots, delete the guidance you did not use, and
> give it to ONE worker in ONE worktree. A brief that does not state its
> acceptance criteria and its verification command is not ready — it is a wish.

## The rules behind this template (each one is paid for)

| Rule | Why — the evidence, not the theory |
|---|---|
| **The worker does NOT write unit or integration tests** | Kun Chen's deepswe eval (2026-10-08): agent-written tests are a restatement of the agent's own interpretation, so they cannot be more accurate than the code. 65% unit / 35% integration, **neither bucket improved success rate**; disabling even *existing* tests on 44 tasks changed nothing. |
| **The brief NAMES the spec to run** | Same reason, inverted: a browser spec checks observable reality, not the agent's belief. `muzk0bae`'s worker was confident, its own tests passed, and `e2e/places.e2e.ts` V19 t02 caught the regression it caused. That error class is invisible to unit tests. |
| **Verification is external and mechanical** | A headless worker reported commit `c273402` — **a hash that never existed**. The sandbox had discarded its writes. A worker's success claim is evidence of nothing; `git log` is evidence. |
| **One worker, one worktree, one slice** | `dsh tui` sessions cannot be created on demand or revived once finished; a lane that reads "sessionless" has usually just *finished*. Ephemeral workers (spawn → work → exit) cannot stall. |
| **A slice may not edit shared scaffolding** | Four parallel slices all edited `AGENTS.md`, `CONTEXT.md`, `RELEASE-CHECKLIST.md`, `vite.config.ts` → every branch conflicted. Once that stopped, the next two merges were clean. |
| **Test the change, not the codebase** | Your e2e suite costs 30–90 min per slice. Running the ONE spec the slice touches is ~1 min and caught today's regression. The full suite belongs at merge time and overnight, not per slice. |

---

## 1 — Header

```
SENTINEL: <SLICE-ID>-<SHORT-SLUG>-<4 random chars, uppercase>
```

**Slice `<id>` — <one line, the outcome, not the activity>.**

Repo: `~/Projects/playdate-app`. Base: HEAD (`<sha7>`). **Do not push.**

Work in YOUR OWN worktree — this is the only slice you will run:

```bash
git worktree add /tmp/pd-wt/<slice-id> -b <slice-id> HEAD
cd /tmp/pd-wt/<slice-id> && npm install --silent 2>/dev/null || true
```

All commands run inside `/tmp/pd-wt/<slice-id>`.

📌 **A FRESH WORKTREE HAS NO `.env`.** `e2e-target-guard` resolves the e2e target from
it, so `npm run guards` fails with *"Cannot read .env — the e2e target cannot be
resolved"* until the untracked local file is present. `fleet-run` copies it for you; if
you launched the worktree yourself, copy `~/Projects/playdate-app/.env` (and
`e2e/.auth/`) in by hand. They stay untracked and are never staged.

📌 **WORK ECONOMICALLY.** A fresh session's window is ~98k tokens and it goes fast.
Read only what this brief names; **edit first, verify after**. If you open a fourth
file that this brief does not name, stop and start editing.

---

## 2 — The annotation, verbatim

> *"<the founder's own words, quoted exactly — never paraphrased>"*
> — `<annotation id>`, page `<url>`, element `<sourceFile>`

**Anchor located BY CONTENT, never by line number** (line numbers are a snapshot of
whatever the dev server was serving when he annotated):

- File: `<path>`
- Searchable string: `<the literal text or attribute to find>`
- If the anchor cannot be found, say so and report **BLOCKED** — do not guess.

---

## 3 — What to change, and what NOT to touch

**Change:** <concretely, the smallest edit that satisfies the annotation>

**Do NOT touch:**

- `<file/area outside scope>`
- `AGENTS.md`, `CONTEXT.md`, `docs/RELEASE-CHECKLIST.md`, `vite.config.ts` — the
  orchestrator owns these. If the slice seems to need a change there, report it in
  the brief's report file instead of editing.
- Another lane's worktree or paths. Stage **by path only**; never `git add -A`.

---

## 4 — Acceptance criteria (checkable statements)

1. <observable behaviour, phrased so it can be checked>
2. <…>

**Do NOT write new tests to prove these.** They are checked by the spec named in §5.

---

## 5 — Verification (quote raw output)

**Tier 1 — always (mechanical, ~30s):**

```bash
npm run typecheck
npm run guards        # expect: GUARDS: PASS, exit 0
```

**Tier 2 — the ONE spec this slice touches (~1 min):**

```bash
<exact playwright command for the spec file this slice changes>
```

> If this slice genuinely needs a NEW e2e spec (the founder asked for one, or no
> existing spec covers the behaviour), say so here explicitly — otherwise **do not
> write one**. Do not write unit or integration tests under any circumstances.

**Do NOT run the full suite.** That happens at merge, not here.

---

## 6 — Report and reply

Report to **`.scratch/<slice-id>-report.md`**: what changed, the raw output of the
commands above, and — if nothing needed changing — say so explicitly.

Reply with only:

```
Sentinel: <SENTINEL from §1>
Status: DONE | BLOCKED
Commit: <sha7>
Report: .scratch/<slice-id>-report.md
```

If it needs a **human decision** or a **PAID data source**, reply **BLOCKED** with
one clear question. A BLOCKED with a real question is a good outcome, not a failure.

---

## Notes for the orchestrator (not for the worker)

- **Never trust the worker's `Commit:` line.** Verify with
  `git -C /tmp/pd-wt/<slice-id> rev-list --count <base>..HEAD`. `fleet-run` does this.
- **Merge within ~30 min** of the commit, or park the branch. Stale branches become
  conflicts; fresh ones merge cleanly.
- **Do not let a worker write tests.** If a brief arrives with "add unit tests for
  this", strip that line — the evidence says it adds cost and no value.

### The two-strikes rule

**A slice gets TWO attempts. If the second produces no code commit, it is closed and
re-scoped — never dispatched a third time.**

Why: `v33-7b` was re-dispatched six times on 2026-10-08. Every pass re-verified the
same already-shipped code, wrote more prose, and burned cloud tokens. Nobody asked
*"why does this keep not finishing?"* Two attempts is enough to learn a slice is
mis-scoped; a third is a loop.

**On the second failure, do one of these — not a retry:**

1. **Check whether the work already shipped.** `v33-7b` and `muzk8c1g` both turned out
   to be satisfied at base. A report-only commit is then the CORRECT outcome, and the
   slice closes. Verify with `git log --all --grep=<slice>` and by grepping the source
   for the testids the brief names.
2. **If it genuinely isn't done, the brief is wrong.** Re-scope it: shrink it, name the
   exact anchor, or split it.
3. **If it needs a human decision, park it** and state the question. A parked slice with
   a clear question is a good outcome.

Record the attempt count in the report. A slice with no recorded attempts is retried
forever.
