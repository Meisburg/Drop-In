# Review brief — V28 Slice 4b at `2828952`

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

You are a fresh-context reviewer. Judge **only** `2828952`'s diff against
`plan.md`'s **Slice 4b** and the contract below. Read `plan.md` Slice 4b and
`docs/agents/code-structure.md`. Do not edit, fix, commit, or run the gate.

**Scope:** 6 files, +172/−97 — `src/pages/OnboardingPage.tsx`, `src/App.tsx`,
`src/lib/avatarUrl.ts` (**new**), `src/lib/avatarUrl.test.ts` (**new**),
`e2e/fixtures.ts`, `e2e/auth.setup.ts`. Anything else is a finding.

The slice had four jobs: the **photo card** (card 4 of 5), **removing the bio
field** (decision 15 / defect #21), **extracting `hasAvatarUrl`**, and three small
findings from 4a's review.

## Answer these, each with file:line evidence

1. **The photo card.** Trace that Skip advances writing **nothing**; that a rejected
   file shows the existing error and **does not trap** the card (Continue stays
   live); and that a failed upload surfaces the error and **does not block**
   Continue. Is `useCropStep` genuinely **reused, not rebuilt**? Does the card read
   `4 of 5` via `progressLabel('photo')` and its `title`/`body`/`primaryLabel` from
   **`FIRST_RUN_COPY.photo`** with nothing hard-coded?

2. **The bio removal — is it COMPLETE?** Decision 15: bio drops out of the first
   run. Confirm the state (`bio`/`bioError`), the validation surface, the
   `updateBio` call inside `handleContinue`, **the imports** (`updateBio`,
   `BIO_MAX_LENGTH`), and the markup are all gone. Then **grep for any surviving
   path that can still write bio from this page** — `rg -n "bio" src/pages/OnboardingPage.tsx`
   — and classify every hit. Is the page-header comment (`:49-52`) now accurate?

3. **`hasAvatarUrl`.** Paste the function and its test. Is
   `url != null && url !== ''` the right semantics (matching `homeZip.ts`'s
   `hasHomeZip` precedent), is it a correct **type guard** (`url is string`) used
   correctly at `src/App.tsx:167`, and does the test actually cover
   `null`/`undefined`/`''`/a real URL — i.e. would it fail if the empty-string
   clause were dropped?

4. **Judge the builder's answer to the ProfilePage question.** It reports that
   `ProfilePage.tsx:1218`'s missing empty-string clause is **not a live bug**: the
   only writers of `profiles.avatar_url` are `uploadAvatar` (a Supabase public URL
   containing a `?v=` cache-buster — structurally non-empty) and `clearAvatar`
   (null), while an out-of-band REST `{avatar_url: ''}` **would** render
   `<img src="">` because the column is a plain nullable `text` with no CHECK.
   **Verify both halves from the code** — is the writer claim complete (grep for
   every write of `avatar_url`), and is the latent-gap reasoning sound? This
   distinction — latent vs live — is the answer the orchestrator wanted; say
   whether it was earned.

5. **⚠️ VERIFY THE ORCHESTRATOR'S DEFECT #22 CLAIM, IN BOTH DIRECTIONS.** The
   orchestrator believes the page's card sequence is **flag-driven**
   (`kidsCardDone:134` → `if (!kidsCardDone)` at `:470`; `photoCardDone:144` →
   `:560`), that **`nextUnfinishedCard` is not used in the page at all**, and that
   the consequence is that a parent who already has kids and a photo and no zip is
   **shown the kids card again** (and can write **duplicate kids** via `addKid`).
   Check every part of that. **If it is wrong, say so plainly** — and if it is
   right, say whether the consequence is real and how likely it is (note the area
   card is **last**, so abandoning there is the normal case). This is the
   orchestrator's finding; treat it with no more charity than a builder's.

6. **`e2e/auth.setup.ts` — the scope question.** The brief declared `e2e/**`
   beyond `fixtures.ts` out of scope, and the builder changed `auth.setup.ts`
   anyway, flagging it rather than hiding it. **Did it touch any assertion, or only
   add the walk?** Is the setup walk correct for **both** skippable cards, and does
   the same `Skip` locator genuinely re-resolve onto the photo card after the kids
   card's Skip as the comment claims? Would the spec be **deterministic** (it drives
   the project every chromium spec depends on)?

7. **The three findings.** F3 (the dangling parenthetical — the builder says it
   lived in the family-block comment that was deleted with the block; is the
   remaining "Kids (first name + age only)" label right?), F4 (`fixtures.ts:397`
   now 17 — **verify the count**, and note the wrong 18 came from the
   orchestrator's plan), F6 (busy strings unified on `'Saving…'` in all three
   sibling cards). Confirm each or say why not.

8. **`finishSignup`'s new photo hop.** Is it faithful (a Skip, matching the
   chrome control) and does it stay deterministic for its **17** consumers? Does
   the helper's walk still describe the real flow for a **brand-new** parent?

9. **Scope and leftovers.** Exactly 6 files? Any stray `console.log`, TODO, dead
   code, unused import left by the bio removal, or an **uncited claim in a
   comment** this diff does not support? **This batch has caught seven stale
   comments**, including one the previous slice created — check the comments this
   diff *writes*, not only the ones it deletes.

## Verdict

`PASS` | `NEEDS_CHANGES` | `BLOCKED`, plus every finding as
`file:line — what is wrong — why it matters — how you would fix it`, marking each
**blocking** or **non-blocking**. Write accepted residuals down with their ruling
rather than dropping them. If you cannot prove something, say so.
