# Review brief — V28 Slice 3c at `0b0ad3d`

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are a fresh-context reviewer. Judge **only** `0b0ad3d`'s diff against
`plan.md`'s **Slice 3c** and the contract below. Read `plan.md` Slice 3c and
`docs/agents/code-structure.md`. Do not edit, fix, commit, or run the gate.

**Scope is 2 files, +197/−8:** `src/App.tsx`, `src/pages/OnboardingPage.tsx`.
Anything else in the diff is a finding.

The slice does two things: (1) a dismissible "finish setting up" **resume nudge**
in the shell whose target comes from `nextUnfinishedCard(facts)`, and (2) a
**regression fix**: `OnboardingPage.tsx` no longer passes the email to
`suggestedHandle`, so an email signup is not offered its own email local part as
a first name.

## Answer these, each with file:line evidence

1. **The one-argument fix.** Is the call site correct — `suggestedHandle(metadata,
   null)` — with `suggestedHandle` and `splitSuggestedName` themselves unchanged?
   Prove the helper is untouched (`git show 0b0ad3d -- src/lib/oauth.ts` must be
   empty). A social sign-in with real name metadata must still prefill; an email
   signup must prefill **nothing**. Say how you know for each.

2. **⚠️ THE SHARPEST ONE — THE NUDGE LINKS INTO CARDS THAT DO NOT EXIST YET.**
   Slices 4 (kids, photo), 5 (area) and 6 (finish) are **not built**. So today a
   parent with a name and no zip gets `nextUnfinishedCard` = `'kids' | 'photo' |
   'area'` (or `'name'` with no profile row), and the nudge links to
   `/onboarding`, which still renders the **old** page. Determine exactly:
   - Where does the nudge's action navigate (cite the line)?
   - **What copy does it show for each card?** Read `FIRST_RUN_COPY` and quote
     it. **Does the copy claim a specific card** ("Finish adding your kids") —
     which would be a claim about a step that does not exist yet — **or is it
     generic**?
   - Is the resulting label/landing mismatch a **lie**, a **harmless generic
     invite**, or a **dead end**? Say which, and justify. This batch's whole
     thesis is that the app must not claim things that are not true, so do not
     wave this through.

3. **The fact derivation.** The component assembles `FirstRunFacts` inline.
   - `hasName: true` because `profile !== null`. Is that sound — is
     `profiles.display_name` really NOT NULL, so a profile row implies a name?
     Check the schema, not the comment.
   - `hasPhoto` is an inline `avatar_url !== undefined && !== null && !== ''`.
     **Does `src/lib/` already have a predicate for exactly this shape?** (See
     `src/lib/homeZip.ts`'s `hasHomeZip` for the precedent this repo set.) If it
     does, or if the build law says this belongs in `lib/` as a testable pure
     function while React only renders, that is a finding.
   - `hasZip: false` is **hard-coded**, justified by the earlier `homeZipSet`
     early return. Is that gap airtight — can `homeZipSet` be false while the
     run is genuinely complete, or true while `nextUnfinishedCard` would say
     otherwise? Are the session's `homeZipSet` and `firstRun.ts`'s `hasZip` the
     same signal (both via `hasHomeZip`)? State the direction of any mismatch and
     whether it fails safe.

4. **The new lint warning.** The builder reports **81 warnings / 0 errors**
   against an 80/0 baseline — one new `react(set-state-in-effect)` in this
   slice's effect. Identify the exact call site. Is it avoidable by deriving the
   value in render instead of setting it (the effect body sets `setCard(null)`
   and `setCard('name')` synchronously)? Say whether you would require the fix or
   accept the warning, and why.

5. **The mutual-exclusion residual — verify it, then judge the proposal.** The
   builder chose the armed-trigger seam (`armedPushTrigger` /
   `subscribePushArmed`) and reported a residual: after the push prompt's "Not
   now", the trigger clears but a held note lives in `PushOptInPrompt`'s local
   state, so the nudge can co-render beside it. **Verify that claim from the
   code** — is the residual real, what exactly opens and closes it, and does the
   browser-**denied** variant really avoid it (the builder says the denied path
   uses `clearArmedPushPrompt`, deliberately without `notifyArmed`)? Then judge
   the stated criterion ("never co-renders with `PushOptInPrompt`"): is a
   bounded, outside-the-interview co-render a **violation worth blocking on**, or
   an **accepted residual**? Note: the nudge mounts on the `navRenders` seam, so
   confirm whether **during the interview** the criterion holds absolutely.

6. **The dismissal.** Where is it stored, for how long, and does it match "stays
   dismissed for the session"? Can it ever block, modal, or redirect (decision 3
   and ADR 0001 — the requirement must never be a wall)? Is the dismissal
   announced to assistive tech, and does the target stay reachable after
   dismissal?

7. **`navRenders` is load-bearing here.** Confirm it is exactly `!isFirstRun` and
   that the nudge (like `PushOptInPrompt`) is therefore **absent on
   `/onboarding`** — decision 16's "the first run shows neither". Quote both the
   definition and the mount.

8. **Does the watch item hold up?** The builder reports the SIGNED_IN race is
   **not provable**: supabase-js's `signUp` awaits `_notifyAllSubscribers('SIGNED_IN', …)`
   before resolving. Check whether that is consistent with what the code in this
   repo actually relies on, and say whether the reasoning is sound or merely
   plausible. Also: does the nudge make a stranded state survivable as claimed?

9. **Scope and leftovers.** Exactly the 2 files? Any stray `console.log`,
   TODO, dead code, un-named state, or an un-cited claim in a comment that the
   code does not support? **This batch has caught three separate stale comments
   that "read true".** Also: is `.scratch/v28/verify-nudge-3c.mjs` genuinely
   outside the commit?

## Verdict

`PASS` | `NEEDS_CHANGES` | `BLOCKED`, plus every finding as
`file:line — what is wrong — why it matters — how you would fix it`, marking each
**blocking** or **non-blocking**. A finding that turns out to be an accepted
residual must still be written down with its ruling, never dropped. If you cannot
prove something from the diff, say so rather than asserting it.
