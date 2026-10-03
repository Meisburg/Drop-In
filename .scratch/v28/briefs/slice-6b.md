# Slice 6b — `check-acceptance-greps`: a zero-hit claim must say where it looked

*(One of four subjects slice 6 was split into. **6b is only this guard.** The `skipLabel` prop and the copy-field
guard are 6a; the repo-wide `escapeForRegExp` dedupe is 6c; the repo-wide honesty guard is 6d.)*

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing.** Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## The defect class, and it was made twice in an hour

A planning document claimed a **zero** over an **unscoped directory**: *"`rg "of 5" src/` → 0 hits."* **It was
never zero** — the pattern matched unrelated things in files the claim was not about, and a bare directory cannot
tell "the thing is gone" apart from "unrelated hits exist."

**⚠️ RE-MEASURE EVERY NUMBER BELOW — they are MOVING, and this brief's predecessor proved it.** The original
slice-6 brief said `rg "of 5" src/` yields **32 hits**; **measured today it is 12**, because r1's sweep already
removed most of them. **Copying a moving measurement is how a brief becomes wrong.** The recorded instances:

| Instance | State |
|---|---|
| `plan.md:241` — *"⚠️ **A blanket `rg "of 5" src/` is NOT [scoped]**"* | **verified present today** |
| `plan.md:302` — *"Measured today, `rg -n "middle name" src/` matches three files"* | **verified present today** |
| `.scratch/v28/briefs/explore-r2-restructure.md:65` — `rg -n "of 5" src/ e2e/` | **verified present today** |
| `.scratch/v28/briefs/slice-2.md:49` — *"That criterion is itself a defect."* | re-measure before citing |
| `rg -n "hasPhoto" src/` — the unrelated local | **moved: now `src/lib/places.ts:1075-1076`**, plus a third mention at `src/lib/avatarUrl.test.ts:6` (was cited as `:1070`) |

## ⚠️ THE TRAP THE PLAN DID NOT SEE — the guard would fire on its own documentation

The plan's mechanism was to *"extract every acceptance grep line from `plan.md` and `.scratch/v28/briefs/*.md`."*
**Measured: those documents QUOTE the bad greps as defects** — `plan.md:241` is *quoting* a bad grep in order to
condemn it, and `explore-r2-restructure.md:65` quotes another. **A naive prose parser fails on the documentation of
the rule it enforces, and would fail on the brief that exists to explain the defect.** That is not a nit: it is
the difference between a guard and a nuisance.

**RULED (do not re-litigate): the guard reads TAGGED claims only**, on an explicit convention **you define and
document in the guard's own header** — a line tag such as `ACCEPTANCE-GREP:` — so that a **claim** is
machine-distinguishable from a **quotation of a bad claim**. Then:
1. **Retrofit the tag onto the real acceptance greps** in `plan.md` and the slice briefs.
2. Add the second, purely syntactic rule, which is the actual defect class: **a zero-hit claim's scope must name a
   path, not a bare directory.**

**Both rules are deterministic. A prose parser is not.**

## ⚠️ And the exemption, which is an existing ruling and not a loophole

**Slice 4's ruling F1: *"Comments that describe a removal are EXEMPT from zero-hit acceptance greps."*** A comment
saying *"this used to be `hasPhoto`"* is honest documentation, not a hit. The guard must implement that exemption
**deliberately and state it**, not accidentally through a pattern that happens not to match.

## Registration — measured, and a guard that is not registered does not run

`scripts/guards/run-all.sh`:
- Guards are named in a **hard-coded `for guard in …` list** at **`:61`** (currently six).
- Checkers are registered **separately** via `run_check()` (`:85`), with four callers at **`:100-103`**.
- **`.check.mjs`, NOT `.test.mjs`** — `npm test` discovers `*.test.mjs`, and **a top-level `process.exit()` inside
  the vitest runner kills the run** (the file says so at `:78-84`).
- The standard you are held to, from that same file: *"A rule whose own behavior is unchecked is a rule that can
  silently stop holding — **a checker that matches nothing looks exactly like a clean repo.**"*

## Acceptance — demonstrate each, both halves

1. **The guard passes on the CURRENT `plan.md` and briefs — which STILL QUOTE the bad greps as defects.** (If it
   cannot, the tag convention is wrong, not the documents.)
2. **It fails on both recorded pre-fix fixtures** — the bare-directory scope and the unscoped-pattern case — with
   the fixtures **seeded by you** and the red pasted.
3. **Its `.check.mjs` proves the checker fires**, and exits 0 when run directly. **A checker that matches nothing
   looks exactly like a clean repo** — so show it matching something.
4. `run-all.sh` includes the new guard **in both places**.
5. `npm run verify` exits 0.

## The two rules, stated so the boundary is visible

State in the guard's header, **and demonstrate in your report with one real example of each**:
- a **tagged claim** the guard inspects, and
- an **untagged quotation** of a bad grep that it correctly ignores.

## Verify

`npm run verify`, plus the new `.check.mjs` run directly. **This slice touches no `src/` file** — if it seems to
need to, **stop and say so**; that is a different slice.

**Four named flake modes** — re-run once before believing any red: `no-bypass-guard`,
`e2e/places.e2e.ts:2759`, vite-4173 / trace-artifact-ENOENT, teardown `close()` throwing *"Target page, context or
browser has been closed"*. Kill listeners **by port**, never `pkill -f`.

## Report

- **`Committed as: <sha7>`** — or *"not committed"* and why; **an absent field is read as evidence.**
- Files changed with `+/-` counts.
- **The tag convention, one tagged claim, and one untagged quotation.**
- Both halves of each acceptance run: **raw output tails.**
- **Which numbers in this brief you had to re-measure, and what they were** — the brief already carries a stale
  one on purpose, and finding it is part of the job.
- `npm run verify`: exit code, test-file count, test count, lint errors **and warnings**.
- Anything the brief did not anticipate — **say it rather than quietly fixing it.**

---

## APPENDED — a STANDING RULE adopted from 6a's builder, and it applies to EVERY guard you write

6a's builder reported this, and I am adopting it as a rule rather than leaving it to per-guard taste:

> *"The guard's own zero-fields tripwire fired **twice** during development and caught two real parser bugs (a wrong
> brace index, a wrong literal depth). **A guard that fails when it matches nothing is the only reason those were
> not shipped as a silently-clean checker.** Worth making a standing rule, not a per-guard act of taste."*

**So: every guard and every `.check.mjs` you write must ship a case where it MATCHES NOTHING and FAILS.** The
guards file already states the standard (*"a checker that matches nothing looks exactly like a clean repo"*) —
**your job is to make that structural instead of aspirational**, in the place that states the bar, so the next
guard author inherits it.

**And it is not hypothetical here: 6b's own guard is prose-shaped.** A tagged-claim parser that finds **zero**
tagged claims is the single most likely way this guard ships green and useless. **Your checker must include that
exact case** — a corpus with no tagged claims — and it must **fail**.

**Two more things 6a's builder proved, which apply to you:**
- **Its seeded-red half was produced in a `/tmp` COPY of the source tree, never in the repo.** That is the standard
  here: **do not leave a seeded violation in the working tree**, and do not commit one.
- **It declared its own scope question rather than deciding it silently** (it added a public type its brief had not
  authorized, and said *"revert it if the reviewer calls it scope"*). **If this brief does not authorize something
  you find you need, say so in the report rather than absorbing it into the diff.**

---

## APPENDED — a REAL limitation in an existing guard, found by a verifier on another slice

A verification lane checked `scripts/guards/no-bypass-guard` while judging a `--no-verify` commit, and reported this
about the guard itself:

> *"the no-bypass guard's HISTORY grep only sees `--no-verify` on **non-standard reflog action text** (a plain
> commit's action text is its subject and is filtered), so **its PASS is not by itself evidence about the flag**."*

**So a guard whose stated job includes catching a bypass cannot see the bypass in the common case, and reports PASS
on a repo where one happened.** *An instrument that matches nothing looks exactly like a clean repo* — the very
sentence in the guards file you are already being held to.

**You are building a guard in this same directory, so this is in scope: either (a) fix `no-bypass-guard` so its
history check actually sees `--no-verify`, or (b) make it state what it does and does not cover, with a checker that
proves the blind spot exists.** *(b) is the honest floor; (a) is better if it is small.* **Do not silently leave it,
and do not claim it is fixed without a seeded failure that would previously have passed.**
