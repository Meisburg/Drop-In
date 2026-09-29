# Slice 4c — The sequence is driven by the facts, not by flags

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → **Slice 4c**, then `docs/agents/code-structure.md`. Slices 1–4b are
done and verified. The interview runs: name card → kids card → photo card →
location view. **The cards are shown based on local flags, so a returning parent
restarts the sequence — and can write duplicate kids.**

## The defect (plan defect #22, measured)

- `const [kidsCardDone, setKidsCardDone] = useState(false)` (`OnboardingPage.tsx:134`)
  gated by `if (!kidsCardDone) {` (`:470`); `photoCardDone` (`:144`) gated at `:560`.
  **Both flags start `false` on every mount.**
- **`nextUnfinishedCard` is not used in the page at all** (verified: zero hits).
- Meanwhile the shell's resume **nudge** picks its target from **facts**
  (`src/App.tsx`). So the nudge says one thing and the page does another.

**The consequence is not the plan's accepted "up to two extra taps."** A parent who
finishes **kids → photo** and abandons **at the area card** — the **last** card, so
**the most likely abandonment point** — re-enters and is shown the **kids card
again**. Re-answering it calls `addKid` again →
**duplicate kids rows** (`addKid` caps at 5, it does not dedupe).

Decision 6 says *"resume at the card they left. Never a wall, **never a restart**."*

## What to do

Keep the page's linear order, but make **each gate fact-aware**:

- name card — `profile === null` (already true)
- **kids card — `!kidsCardDone && !hasKids`**
- **photo card — `!photoCardDone && !hasAvatarUrl(profile.avatar_url)`**
  (`hasAvatarUrl` is free: `src/lib/avatarUrl.ts`, built by 4b)
- then the location view

The kids fact needs the same read the shell already does — the page currently holds
only local `kidRows` (`:127`) and **never reads kids**.

**Do not re-key the nudge**, and do not build the area card (Slice 5) or the finish
card (Slice 6).

## ⚠️ THE FLAG *AND* THE FACT ARE BOTH REQUIRED — THE FACT ALONE CAUSES A SKIP LOOP

`nextUnfinishedCard` returns `'kids'` whenever `hasKids` is false — **including for a
parent who deliberately skipped**. Its own docblock says so:

> *"A **skipped** optional card IS re-offered while the run is unfinished … That is
> up to two extra taps, on cards that still show Skip … **Do NOT add one** [step
> column]."* — `src/lib/firstRun.ts:56-60`

So a gate of `!hasKids` **alone** would re-render the kids card the instant Skip is
tapped, **forever**. **The flag advances the session; the fact handles the
re-entry.** Write both clauses on every card, and prove Skip still advances in a
test.

## Acceptance criteria

- A parent who **already has kids and a photo and no zip** lands on the **location
  view**, not on the kids card.
- A parent re-entering the interview **cannot write duplicate kids**.
- **Skip still advances immediately for every card** — no card re-appears after its
  own Skip in the same session.
- For a **fresh** parent (all flags false) the first card shown equals
  `nextUnfinishedCard(facts)`. (Within a session a flag may legitimately point
  further along — Skip is a session-level "seen it". Say so in a test name.)
- `finishSignup` (17 consumers) still walks the flow for a **brand-new** parent.

## Files

`src/pages/OnboardingPage.tsx`, `e2e/fixtures.ts` if the walk changes,
`src/lib/firstRun.ts` **only if you find its semantics wrong** (report first), and
**any spec a failure forces you to change — but report it rather than silently
widening scope.**

## Verify

```
npm run verify
npx playwright test e2e/golden-path.e2e.ts
```

Paste real tails. **Lint is expected at 0 errors / 81 warnings** — a **second** new
warning is a finding. Tests are expected at **66 files / 1981 tests**; if you add a
test, say the new number and why.

**If the change cannot be made without altering the nudge, the area card, or
`firstRun.ts`'s exported semantics, STOP and report — do not widen scope silently.**

## Commit and report

```
V28 slice 4c: a returning parent resumes at the card they left, not at the start
```

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
The gates: <each card's gate expression, quoted>
The skip loop: <how you proved Skip still advances>
Kids read: <how the page learns hasKids, and its cost>
Nudge/area/finish card: <confirm untouched>
Commands run: <real tails; lint vs 81; tests vs 66 files/1981>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
