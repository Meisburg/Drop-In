# Slice 2 — the parent's photo joins the name card, and the two copy defects die with it

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing anything.**
Worktree: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Read `plan.md` section 6, slice 2** — this brief is a pointer with measurements, not a
replacement for the plan.

## Why this slice exists

Slice 1 (1a + 1b) deleted the standalone photo card, so the parent's photo is currently **nowhere**
in the first run. r2-D2 says it belongs on the **name card**. That card is also where both of the
playtest's copy defects live, which is why r2-D4 deliberately bundled them into one slice: same
file, same card, same screen.

## Measured facts (I ran these; they correct the plan in two places)

- **The crop machinery survived 1b.** `useCropStep` lives in `src/components/useCropStep.tsx:26`
  and is still called by `ProfilePage.tsx:447,475,2222` (the avatar one is `:469-481`, ending in
  `uploadAvatar(userId, source, rect)`). **This is a re-import, not a rebuild.** `uploadAvatar` is
  `src/lib/db.ts:2657`, signature `(profileId, source, rect) → Promise<string>`.
- ⚠️ **The copy defect is at `OnboardingPage.tsx:515`, not the `:561` the plan first said.** 1b's
  deletions moved it. A stale line reference is how the last two briefs went wrong; measure before
  you edit.
- **The honest version of that hint already exists one page over** — `ProfilePage.tsx:835`:
  `“${err.handle}” is already taken — pick a different display name.` That form is actionable and
  names no phantom field. The onboarding one is the odd one out.
- **The name card's selectors are load-bearing:** `testId="first-run-name-card"`
  (`OnboardingPage.tsx:551`), and the specs locate the inputs by `input[autocomplete="given-name"]`
  / `input[autocomplete="family-name"]` (React spells the prop `autoComplete`, which is why a
  lowercase grep misses it). **Do not change either attribute.**
- **`signUpViewer` (`e2e/fixtures.ts:360-380`) fills given-name/family-name and clicks
  `/^Continue/` with NO photo.** Many spec files ride that hop.
- **`finishSignup`'s own doc comment (`e2e/fixtures.ts:385-387`) already forward-references this
  slice:** "1b deleted the photo card … the photo now joins the name card in slice 2." It is
  waiting for you to be right.

## Files in scope

- `src/pages/OnboardingPage.tsx` — the name card ("card 2"): add the photo block (re-using
  `useCropStep` + `uploadAvatar`), and fix the hint at `:515`
- `src/lib/firstRunCopy.ts` — the `name` entry's `body` (`:35`) only
- `src/pages/ProfilePage.tsx` — **only if** you reuse a component from it and must export it
- `e2e/fixtures.ts` — **only if** the name-card hop genuinely changes shape
- any comment left false by the photo no longer being a *step* — **start with
  `e2e/avatar.e2e.ts:3-5`**, which explains why that spec drives `/profile` instead of onboarding

## ⚠️ The trap in this slice: a zero-hit claim that sweeps up innocent files

The plan's first acceptance was **`rg -n "middle name" src/` → 0 hits. That criterion is itself a
defect.** Measured today it matches **three** files, and only one is yours:

| File | What it is | Yours? |
|---|---|---|
| `src/pages/OnboardingPage.tsx:515` | **the defect** — advises a middle name/initial | ✅ fix it |
| `src/lib/oauth.ts:154` | a comment about an OAuth provider losing middle names | ❌ **do not touch** |
| `src/lib/oauth.test.ts:163` | a test name — "middle names survive" | ❌ **do not touch** |

Obeying the blanket grep means rewriting unrelated OAuth code and its test — **a new defect, not a
fix.** This is the third time this class has appeared in the batch (after `of 5` and `hasPhoto`),
which is why slice 6 ships a guard for it.

**Your criterion instead:** `rg -n "middle name|middle initial" src/pages/OnboardingPage.tsx`
→ **0 hits** — and the other two files **byte-identical** in `git diff`.

## What to build

1. **The photo joins card 2.** First name, last name, and the parent's photo on one card. Match the
   behaviour the deleted card had: **the write happens on the crop confirm**, so pressing Continue
   or simply advancing **never** waits on an upload.
2. **Fix the hint at `:515`** so it advises something the card can actually do. The card renders a
   First name field and a Last name field and nothing else — so "add a middle name or initial" is
   advice the user cannot follow. `ProfilePage.tsx:835`'s "pick a different display name" is the
   shape to match, or better: name the fields that exist.
3. **Fix the body at `firstRunCopy.ts:35`** — *"A first name is plenty"* sits directly above a Last
   name field. Say what the name **is for**: it is how other parents find and recognise you, i.e.
   the public handle. **Do not** turn this into a lecture about privacy.

## Two things the review lanes handed you

**1. The deleted photo card's copy, recovered verbatim** — the reviewer read the deleted hunk so you
do not have to dig through git history. A parent already saw these words in the playtest:

- title: `Add a photo`
- body: `A picture helps parents spot you at the drop-in. Add one whenever you are ready.`
- primaryLabel: `Continue`
- skipLabel: `Skip for now`

**You are not obliged to reuse it** — the name card's photo is a different context (no separate
card, no Skip control, the photo sits beside the name fields) — **but prefer it where it fits**, and
say in your report if you changed it and why. Do not resurrect the `skipLabel`: the name card is not
skippable (that is the `skipLabel` lie slice 6 is fixing).

**2. `hasAvatarUrl` is now a dead export — you get first refusal on it.** At `525fdcf`,
`src/lib/avatarUrl.ts:19` has **zero non-test consumers**: `App.tsx` and this page both dropped
their imports when the photo card went. If the name card's photo control has a legitimate use for it
(the obvious one: deciding whether to show "Add a photo" or the existing photo), **consume it and
say so in your report.** If it does not, **say that too** — it then joins slice 8's wire-or-delete
list rather than lingering as a third dead export (fact 11 already tracks two).

## Acceptance criteria (all must be demonstrated, not asserted)

1. Uploading a photo on card 2 stores the avatar (the crop confirm writes it) **and the card still
   advances**.
2. **The photo does NOT gate Continue.** `signUpViewer` fills the two name fields and clicks
   Continue **with no photo**; **17 spec files** ride that. A gated Continue hangs all of them.
3. The name-card copy names only fields the card renders, and the hint is actionable.
4. `rg -n "middle name|middle initial" src/pages/OnboardingPage.tsx` → **0 hits**, while
   `src/lib/oauth.ts` and `src/lib/oauth.test.ts` are **untouched**.
5. `src/lib/firstRunCopy.test.ts` keeps passing **unchanged where it matters**: it asserts only that
   the body is **non-empty** (`:22`), that the name card has **no `skipLabel`** (`:30`), and that
   `primaryLabel` matches **`/^Continue/`** (`:37`). **The wording is not pinned, so a copy rewrite
   needs no test edit — but do not weaken those three.**
6. `npm run verify` exits 0.

## Verify

`npm run verify` (build + test + lint + a11y:focus + steering-lint + guards).

**Targeted e2e only — never the full sweep inside a slice.** Run
`e2e/onboarding-resume.e2e.ts` and `e2e/signup-zip-fallback.e2e.ts` at minimum (they ride the name
card's hop). Kill any listener **by port**, never `pkill -f`.

**Two known flakes — re-run once before reporting either:** `scripts/guards/no-bypass-guard` (fails
under parallel load, passes 26/26 isolated) and `e2e/places.e2e.ts:2759`.

## Report format (every field, and `Committed as` is mandatory)

- **Committed as: `<sha7>`** — or say plainly *"not committed"* and why. An absent field is treated
  as evidence, not silence.
- Files changed, with `+/-` line counts.
- Each acceptance criterion: **the command you ran and its raw output tail** — not a restatement.
- For criterion 4: the **before/after grep output** for all three files.
- For criterion 2: the spec file(s) you ran and their pass/skip/fail counts.
- `npm run verify`: exit code, test-file count, test count, lint counts.
- Anything you found that the plan did not anticipate — **say it rather than quietly fixing it.**
