# Slice 3c — The resume nudge, and the name card's prefill

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → Slice 3c first (**the orchestrator amended it — read it fresh**),
then `docs/agents/code-structure.md`. Slices 1–3b are done and verified; a new
parent now signs up and lands in the interview.

Two items. **The second one is a real regression that would ship to the first
cohort, and the fix is smaller than you would expect.**

## Item 1 — the resume nudge (the whole point)

An unfinished run is **never a wall**: a dismissible "finish setting up" line whose
action is the card the parent left off on, ignorable forever.

- **The decision logic already exists and is tested.** `src/lib/firstRun.ts`
  exports `FirstRunFacts { signedIn, hasName, hasKids, hasPhoto, hasZip }`,
  `nextUnfinishedCard(facts): FirstRunCardId | null`, `FIRST_RUN_CARDS`,
  `isSkippable`, `progressLabel`. **Call `nextUnfinishedCard` — do not
  hard-code a card.** `null` means the run is finished, so nothing renders.
- **Placement:** in `ProtectedShell` (`src/App.tsx`), alongside the
  `PushOptInPrompt` mount (~`:345`), suppressed on `/onboarding` by the **same
  `isFirstRun` constant** 3a created (`:211`) — decision 16: the first run shows
  neither.

### ⚠️ THE FACT-SOURCING QUESTION — decide it, then report the decision

`hasName` and `hasZip` are **free** (the session carries the profile row and
`homeZipSet`; `hasPhoto` is `profile.avatar_url`, also on the row). **`hasKids` is
not** — measured: `listKids(profileId)` is a separate query
(`src/lib/db.ts:2924`) and **nothing in the shell knows about kids today**. There
is an existing completeness seam worth reading first: `db.ts:2511`'s
`MissingProfileItem = 'photo' | 'bio' | 'kids'` with a kids-count branch at
`:2522`.

So pick one, **and say which and why**:
1. a lazy kids read that only runs when the nudge's preconditions already hold —
   the honest cost is one extra query on routes where the nudge is eligible;
2. reuse the existing completeness read, if it returns what you need without a new
   query on every route;
3. report that neither is acceptable and say why — **do not** silently feed
   `nextUnfinishedCard` a guessed `hasKids`, because a guessed fact makes its
   answer wrong in a way that is invisible.

### ⚠️ THE MUTUAL-EXCLUSION MECHANISM — find it or report that it is missing

The plan requires the nudge to **never render at the same time as
`PushOptInPrompt`**. Measured: `PushOptInPrompt` decides internally
(`src/components/PushOptInPrompt.tsx:72-190`, with several `useState`s and a
`suppressed` guard), and its trigger is armed into **sessionStorage**
(`armPushPromptForAction`, see its docblock at `:34`). So the armed state may be
readable — **check before you invent.** If there is no clean seam, **report it
with a proposal** rather than adding a cross-component flag; a new global to
coordinate two banners is a bigger change than this slice should make silently.

### Acceptance criteria (item 1)

- Renders only for a signed-in parent with an unfinished run; the target comes
  from `nextUnfinishedCard` — **not a hard-coded card**.
- **Never co-renders with `PushOptInPrompt`**, and does not render on `/onboarding`.
- Dismissible, stays dismissed for the session. Never blocks, never modals, never
  redirects (decision 3, ADR 0001). The feed and every other route stay usable.
- Tap target ≥44px, visible focus cue, dismissal announced (`npm run a11y:focus`
  is part of the gate).
- No wall: a parent who never taps it reaches everything they could before.

## Item 2 — a new parent must not be shown their email address as their name

**A real regression 3b introduced, verified by the orchestrator.** Before 3b the
name card was reachable only for first-time social sign-in, where the provider's
metadata yields a real name. **3b routes every email signup through that card**,
and the prefill comes out as the email's local part:

```
src/pages/OnboardingPage.tsx:64   suggestedHandle(session?.user.user_metadata ?? null,
                                                   session?.user.email ?? null)
```

`suggestedHandle`'s candidate list is
`[metadata?.full_name, metadata?.name, metadata?.user_name, email?.split('@')[0]]`
(`src/lib/oauth.ts:126`) — so with no metadata it returns the email fragment, its
own test pins it (`oauth.test.ts:58`: `suggestedHandle({}, 'nicole@x.com')` →
`'nicole'`), and the name card pre-fills **"nicole" as the parent's first name**.

**And here is the part that makes this a one-argument fix:** the very next helper
already documents the correct behaviour — `splitSuggestedName`'s **rule 1** says

> *"**No name at all → both empty.** The fields stay blank rather than prefilled
> with the email's local part: 'sam.rivera@gmail.com' is not a name."*

**The caller defeats its own helper's documented intent by passing the email.**

So: **stop passing the email at that call site** — pass `null` — and an email
signup pre-fills nothing, which is exactly what rule 1 says should happen.

**Do NOT change `suggestedHandle`'s contract.** Its email fallback is right for the
caller it was written for, and its tests pin it. Change the **caller**.

**Acceptance criteria (item 2)**

- A new **email** signup's name card pre-fills **nothing**.
- A **social** sign-in with real name metadata still pre-fills as it does today
  (first name, and the last name when the provider gave two words).
- `suggestedHandle` and `splitSuggestedName` are unchanged, and their tests pass
  untouched.
- Say in the report which argument you changed and what `splitSuggestedName`
  receives now.

## ⚠️ Watch item from 3b's reviewer — check it, do not assume it

If supabase-js ever emitted its `SIGNED_IN` event **after** the first
`/onboarding` commit, the chain would be: `/onboarding` bounces to `/login`
(`OnboardingPage.tsx:174-175`), the fresh `/login` mount has `justSignedUp =
false`, so its guard sends the parent to `/` (`LoginPage.tsx:68-69`) —
**stranded on the feed with no profile row and no nudge.** The reviewer could not
prove it from the diff and believes supabase-js emits synchronously during
`signUp`, so it is **not** a 3b defect. **Read the flow and say whether the nudge
makes that state survivable. If you can prove the race is real, report it as a
finding — do not fix it silently.**

## Verify

```
npm run verify
npx playwright test e2e/golden-path.e2e.ts
```

Paste real tails: lint at the **80 warnings / 0 errors** baseline, tests at **65
files / 1975 tests**. Note the marker's `auth.setup.ts` now walks the new signup
sequence — if the golden path fails there, the flow is wrong, and it is a report,
not a spec edit.

## Out of scope

`src/pages/LoginPage.tsx`, the kids/photo/area cards (4, 5, 6), `e2e/**` other
than what a failing run forces you to report, `src/lib/firstRun.ts`,
`src/lib/oauth.ts`, `plan.md`, `task-state.md`, `.scratch/**`, `.opencode/**`.

## Commit and report

Scoped `git add`. Only when green:

```
V28 slice 3c: the resume nudge, and an email signup is not offered its own address as a name
```

Report:

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
Fact sourcing: <which option you chose, and why>
Mutual exclusion: <the seam you found, or "none exists — proposal below">
Prefill: <the argument changed, and what splitSuggestedName receives now>
Social sign-in still prefills: <how you know>
Watch item: <can you prove the race? your finding or your reasoning>
Commands run: <real tails; lint vs 80/0; tests vs 65/1975>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
