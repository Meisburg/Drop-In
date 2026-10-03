# Review brief — V28 Slice 4c at `f8fe01d`

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are a fresh-context reviewer. Judge **only** `f8fe01d`'s diff against
`plan.md`'s **Slice 4c** and the contract below. Read `plan.md` Slice 4c and
`docs/agents/code-structure.md`. Do not edit, fix, commit, or run the gate.

**Scope:** 3 files, +307/−3 — `src/pages/OnboardingPage.tsx`,
`e2e/onboarding-resume.e2e.ts` (**new**), `e2e/fixtures.ts`. Anything else is a
finding. **Note the new spec was not in the brief's file list** — the brief did
require a test proving Skip still advances, and the repo has **zero `.tsx` test
files**, so decide whether the expansion was *forced* (justified) or a silent scope
widening.

The slice fixes **plan defect #22**: the page showed its cards from local flags
(`kidsCardDone`/`photoCardDone`, both `false` on every mount) while the resume
**nudge** picks its target from **facts** — so a parent who finished kids and photo
and abandoned at the area card (the **last** card, the most likely abandonment
point) was shown the **kids card again**, and re-answering it could **duplicate kids
rows**.

## Answer these, each with file:line evidence

1. **The gates — and the trap.** The brief warned that a gate of `!hasKids` **alone**
   would re-render the kids card the instant Skip is tapped, forever, because
   `nextUnfinishedCard` returns `'kids'` whenever `hasKids` is false *including for a
   deliberate skip* (`src/lib/firstRun.ts:56-60`). Confirm the gates carry **both**
   clauses (`!kidsCardDone && !hasKids`, `!photoCardDone && !hasAvatarUrl(...)`) and
   that **Skip still advances in-session**. Is the `hasKids === null` in-flight state
   sound — and **can it hang** (nothing settles the read, so the card never shows and
   the run stalls)? Trace the failure path.

2. **The lazy kids read.** It fires on `[session, profile, kidsCardDone]` and returns
   early when `kidsCardDone`. Is it correctly **inert after Skip** (no re-fire), and
   is a **failed** read genuinely non-blocking (a skippable error line, never a
   wall)? The builder reports the read fires **twice** during the name-card flow as
   the profile identity settles — is that harmless, or does it risk a **stale
   `hasKids`** overwriting a newer one (i.e. a race where the second response is
   older)? That is the thing worth checking, not the count.

3. **⚠️ THE STRUCTURAL QUESTION — IS THE DECISION IN THE WRONG LAYER?** `nextUnfinishedCard`
   already lives in `lib/`, but the **session-flag override** (the "flag OR fact"
   rule) is inline in the `.tsx`. The build law says *"React components render; they
   do not decide"*, and **this repo has zero `.tsx` test files** — so the only way to
   pin a gating rule is an **expensive e2e spec**. Would a pure
   `lib/` function (e.g. `resolveCard(facts, skippedCards)`) make this rule
   unit-testable and remove the need to prove it through Playwright? Say whether you
   would **require** that refactor, **recommend** it for a later slice, or judge the
   inline gates acceptable — with your reasoning. Do not simply assert the build law;
   weigh it against the cost of moving code that now has passing e2e proof.

4. **The new spec — does it prove the CLAIMS, not just the happy path?** Read both
   tests. Does test 1 genuinely establish that the kids table holds **exactly one**
   row afterwards (i.e. would it FAIL if the duplicate write happened)? Does test 2
   genuinely pin the skip-loop trap (would it fail if a gate dropped the flag clause)?
   Or is either assertion vacuous — the class of defect this batch already caught once
   (`signup-zip-fallback.e2e.ts:106`)? Also: does the spec respect the **marker
   convention** for fixtures it creates (prefix + the sweep's expectations)?

5. **The new fixtures helper.** `readSessionFromBrowserPage` reads a JWT out of the
   page's `localStorage`. Is that the legitimate in-browser twin of
   `readMarkerSession`, or does it hard-code storage-key internals that will break
   silently when supabase-js changes its key? Is the JWT **ever logged, written to
   disk, or committed**?

6. **The photo fact's seeding.** The resume spec sets the photo fact via an
   owner-scoped REST `PATCH profiles.avatar_url` rather than a real upload. Is that
   acceptable for *this* test's purpose (the gate reads the string predicate
   `hasAvatarUrl`), and does the real upload path stay pinned elsewhere
   (`avatar.e2e.ts`)? Say whether this leaves the gate's *behaviour* proven or only
   its *input* faked.

7. **The flaky unit test.** The builder reports one vitest failure in the 2nd of 4
   consecutive runs, passing 3 isolation re-runs (1981/1981), and that no changed file
   has a vitest test. Is the reasoning sound — **could this diff have caused it?**

8. **Scope and leftovers.** Exactly 3 files? Any stray `console.log`, TODO, dead
   code, or an uncited claim in a comment this diff **writes** (this batch has caught
   eight stale comments, one of which a slice created the same day)? Does the diff
   leave the **stale `App.tsx:86`/`:90-92` docblocks** untouched, as Slice 7 owns them?

## Verdict

`PASS` | `NEEDS_CHANGES` | `BLOCKED`, plus every finding as
`file:line — what is wrong — why it matters — how you would fix it`, marking each
**blocking** or **non-blocking**. Write accepted residuals down with their ruling
rather than dropping them. If you cannot prove something, say so.
