# Slice 4b — The photo card, the bio field leaves, and the avatar predicate

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → **Slice 4b**, then `docs/agents/code-structure.md`. Slices 1–4a
are done and verified; a new parent signs up, lands in the interview, meets the
name card and the kids card, and can fill kids in for real.

**Four jobs. Job 2 is a settled product decision that has no other home, and job 3
is worse than the plan first said.** Order matters — do them in this order.

## Job 1 — the photo card (card 4 of 5)

Reuses the crop step; a working Skip; reads **`4 of 5`**.

**Measured facts (trust the file over my line numbers):**
- `const photoCrop = useCropStep(async (source, rect) => { … await uploadAvatar(...) })`
  at `OnboardingPage.tsx:143-148`; `handlePhotoChange` at `:198`; state
  `photoAdded`/`photoError` at `:122`/`:124`; the field UI at `:643-654`, inside
  the block I am calling the family block.
- `useCropStep`'s API is `useCropStep(onConfirm, validateFile?) → { beginCrop, dialog, busy }`
  (`src/components/useCropStep.tsx:26-45`). **Reuse it as-is — do not rebuild it.**
  It already validates size and type *before* decoding.
- **Render the card's `title`/`body`/`primaryLabel` from `FIRST_RUN_COPY.photo`** —
  4a established the pattern for `name` and `kids`; follow it, hard-code nothing.

**Acceptance:** a rejected file shows the existing error and does not trap the card;
Skip advances writing nothing; a failed upload is surfaced and does not block
Continue; the card reads `4 of 5`; **`finishSignup` in `e2e/fixtures.ts` walks the
new hop.**

## Job 2 — ⚠️ REMOVE THE BIO FIELD FROM THE FIRST RUN (decision 15, plan defect #21)

**Decision 15 is settled: "Bio drops out of the first run. Stays on the existing
`/settings` nudge and V27's parent-card editor." Measured: nothing implemented it.**
The bio field is still rendered **and still written** from this page — `bio`
(`:125`), `bioError` (`:126`), the `updateBio` call inside `handleContinue`
(`:306-313`), and the field itself (`:662-664`).

**This was not a deliberate deferral** — the plan said bio work was out of scope,
but it meant the *`profiles.bio` column* (ticket `01-retire-profiles-bio.md`), not
this field. So it fell between the two and nobody owned it.

**Delete the bio field from the first run:** its state, its validation surface, its
write in `handleContinue`, and its markup. `/settings` keeps its own editor — do
not touch it, and do not touch the `profiles.bio` column.

**Then grep, do not assume:** `rg -n "bio" e2e/ src/pages/OnboardingPage.tsx` — a
spec that fills the bio through the signup walk would now break, and
`finishSignup` is consumed by 17 spec files. Report what you found. Also fix the
page-header comment (`:49-52`) that still lists `kids` and `bio` as saved by the
location Continue — the reviewer already flagged it as stale, and after you it is
staler.

## Job 3 — ⚠️ EXTRACT THE AVATAR PREDICATE — it is worse than a duplicate

The plan first said this rule was inlined twice. **Measured, it exists in three
subtly different forms:**

| site | form |
|---|---|
| `src/App.tsx:167` (the nudge) | `avatar_url !== undefined && !== null && !== ''` |
| `src/pages/ProfilePage.tsx:1218` | `avatar_url !== null && !== undefined` — **no empty-string check** |
| `src/lib/places.ts:1068` | `photo_url !== null && !== ''` — a **different field**, and no `undefined` check |

The build law and this repo's own precedent — `src/lib/homeZip.ts`'s `hasHomeZip`,
whose `zip != null && zip !== ''` covers `null` and `undefined` in one clause — say
this belongs in `src/lib/` as a **tested pure function**. Extract
`hasAvatarUrl(url: string | null | undefined): url is string` with a sibling test,
and use it in the nudge.

**Then answer, in your report: is `ProfilePage.tsx:1218`'s missing empty-string
clause a live bug?** i.e. can `profiles.avatar_url` actually be `''`? If yes, that
site would render an `<img src="">`. **Report the answer — do not change
`ProfilePage.tsx`** (out of scope; if it is a real bug it becomes its own
obligation).

**The nudge stays GENERIC — do NOT add this card's title to it** (defect #20's
ruling: the generic line is never wrong, and naming a card couples the shell to the
card inventory).

## Job 4 — three small findings from 4a's review, all in your files

1. **F3** — `OnboardingPage.tsx:626-627`: the parenthetical
   `(first name + age only, the privacy pin)` described **kids**; 4a moved kids to
   its card, so it now dangles off "photo + bio". Move or drop it.
2. **F4** — `e2e/fixtures.ts:397`: the comment says "the **18** specs that consume
   this helper". **The real count is 17** (verified by grep), and **the wrong number
   came from the orchestrator's own plan and brief** — the builder wrote down what I
   told it. Correct it, or drop the number.
3. **F6** — sibling cards use different busy strings: `'Please wait…'`
   (`OnboardingPage.tsx:396`) vs `'Saving…'` (`:481`). Transient busy labels may stay
   inline — pick **one** string and use it in both.

## Verify

```
npm run verify
npx playwright test e2e/avatar.e2e.ts
npx playwright test e2e/golden-path.e2e.ts
```

Paste real tails. **State the lint count against 81 warnings / 0 errors** (adding a
second new warning is a finding, not a detail) and the test count against **65 files
/ 1978 tests**. If a spec fails because the bio field left or the photo card
arrived, that is the flow changing — **fix the helper's walk and report it; never
delete or loosen an assertion to go green.**

**If your context fills before all four jobs are done, STOP and report with the
partial diff rather than committing a half-dismantled family block.**

## Out of scope

`src/pages/ProfilePage.tsx`, `/settings`, the `profiles.bio` column and
`updateBio`'s definition, the area card (5) and the finish card (6),
`src/lib/firstRun.ts`, `FIRST_RUN_COPY`'s `area`/`account` entries, `e2e/**` beyond
`fixtures.ts` and what a failure forces you to report, `plan.md`, `task-state.md`,
`.scratch/**`.

## Commit and report

Scoped `git add`. Only when green:

```
V28 slice 4b: the photo card, the bio field leaves the first run, and hasAvatarUrl is extracted
```

Report:

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
Photo card: <what it reuses; how Skip and a rejected file behave>
Bio removal: <what you deleted; what the e2e grep found; the header comment fixed?>
hasAvatarUrl: <the signature and semantics; is ProfilePage:1218 a live bug? your evidence>
The three findings (F3/F4/F6): <done, or why not>
Nudge: <confirm you did NOT add the card's title>
Commands run: <real tails; lint vs 81/0; tests vs 65 files/1978>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
