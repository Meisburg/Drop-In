# Slice 6a — `skipLabel` stops lying, and the guard that makes unconsumed copy a defect

*(Slice 6 was split by the orchestrator into 6a/6b/6c/6d **by subject**. Its brief had tripled since it was
written — the honesty guard, the escape dedupe and a rule from slice 5 were all appended to it — which is the
batch's own recorded failure mode: a hygiene slice grows from every review faster than it is dispatched. **6a is
only Part 1 and Part 2. Do not start anything else.**)*

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing.** Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## Part 1 — the lie

**Measured on the current tree, so re-measure before you trust a line number here:**

| Fact | Where |
|---|---|
| `skipLabel?: string` — an **optional** field | `src/lib/firstRunCopy.ts:19` |
| `skipLabel: 'Skip for now'` — set on the **`kids`** entry **only** | `src/lib/firstRunCopy.ts:48` |
| the test pins only that it is **non-empty**, and that the other three cards leave it undefined | `src/lib/firstRunCopy.test.ts:28-31` |
| the chrome renders the **hard-coded word `Skip`** | `src/components/FirstRunCard.tsx:117-119` |
| **no other `src/` file reads `skipLabel`** | `rg -n "skipLabel" src/ --glob '!*.test.*'` returns only the two lines above |

**So the module's field is read by nobody and describes words that never appear.** The field is a lie about the
UI, in the module whose whole job is to hold the UI's words.

**The fix is truthfulness, not a redesign: keep the rendered word `Skip`.** The e2e specs assert the Skip control
**by role and name** (`signup-zip-fallback`, `onboarding-resume`), so changing the word would break them for no
product reason.

**The mechanism is decided by the file's own documented design — match it, do not invent a second convention.**
`FirstRunCard.tsx`'s header (`:14-15`, `:50-51`) records that skippability is *the caller's* decision and that
`primaryLabel` **is a PROP so the caller keeps its own copy** — *"the chrome renders it, it never composes it."*
**So `skipLabel` becomes a prop, symmetrically**, passed by the caller exactly as `primaryLabel` is, **not** the
chrome reaching into the copy module.

**The call sites, measured:** `OnboardingPage.tsx` renders `FirstRunCard` three times and passes `primaryLabel`
at `:1187`, `:1349` and `:1465`. **The kids card is the one at `:1340-1349`** (`kidsCopy.primaryLabel`) — that is
the card whose module entry carries `skipLabel`. **Pass the prop there, and nowhere else** (the other three cards
declare no `skipLabel`, which the test already pins).

## Part 2 — the guard: an unconsumed copy field is a defect

**This is the fourth instance of the class in this batch**, which is the batch's own rule for when a guard is owed:
*the second occurrence means build a guard, not another one-off fix.*

**Rule: every field of `FIRST_RUN_COPY` must be consumed somewhere in `src/`, or be explicitly allowlisted in the
guard with a written reason.** A field nobody reads is a lie waiting to be told.

**Registration is measured, and a guard that is not registered does not run** (`scripts/guards/run-all.sh`):
- Guards are named in a **hard-coded `for guard in …` list** — currently six, at **`:61`**
  (`lib-sibling-guard config-guard no-bypass-guard fixture-marker-guard vacuous-absence-guard stale-locator-guard`).
- Checkers are registered **separately** inside the `run_check` block (`:85` defines `run_check`; four existing
  callers at `:100-103`).
- **`.check.mjs`, NOT `.test.mjs`** — and the reason is in the file's own comment (`:78-84`): `npm test`
  discovers `*.test.mjs`, **and a top-level `process.exit()` inside the vitest runner kills the run.**
- The bar that file sets, quoted because it is the standard you are being held to: *"A rule whose own behavior is
  unchecked is a rule that can silently stop holding — a checker that matches nothing looks exactly like a clean
  repo."* And: *"Fix the cause; do not silence the guard."*

**The trap you must avoid — the definition site is not a consumer.** A field's own declaration and the module's
own test are **not** evidence that anybody reads it. State in the guard's header exactly what counts as
consumption and what is excluded, and say why.

## Acceptance — demonstrate each

1. **The module and the UI agree**, and `rg -n "skipLabel" src/` shows a **render/consumption site**, not only the
   module — i.e. **the field is read**.
2. **The guard passes on HEAD and FAILS when a field is made unconsumed** — seed it, show the red, restore it, and
   **paste both outputs**.
3. **Its `.check.mjs` proves the checker fires** (per the file's own bar above) — and exits 0 when run directly.
4. `run-all.sh` includes the new guard **in both places**.
5. `npm run verify` exits 0.

## Verify

`npm run verify`, plus the new `.check.mjs` run directly. **Targeted e2e only**: `signup-zip-fallback` and
`onboarding-resume` assert the Skip control by role and name — run them, and say whether the rendered word
changed (it must not).

**Four named flake modes** — re-run once before believing any red: `no-bypass-guard`,
`e2e/places.e2e.ts:2759`, vite-4173 / trace-artifact-ENOENT, and a teardown `close()` throwing *"Target page,
context or browser has been closed"*. Kill listeners **by port**, never `pkill -f`.

## Report

- **`Committed as: <sha7>`** — or say plainly *"not committed"* and why; **an absent field is read as evidence.**
- Files changed with `+/-` counts.
- Per criterion: **the command and its raw output tail** — for the guard, **both halves** (passing and seeded red).
- The guard's exact consumption rule, and **one example of a reference that does NOT count and why**.
- `npm run verify`: exit code, test-file count, test count, lint errors **and warnings**.
- Anything the brief did not anticipate — **say it rather than quietly fixing it.**
