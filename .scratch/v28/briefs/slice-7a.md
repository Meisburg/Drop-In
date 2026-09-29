# Slice 7a — Two deterministic guards (and the two lines that prove one of them fires)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

Read `plan.md` → **Slice 7a**, then **`scripts/guards/run-all.sh`**,
**`scripts/guards/fixture-marker-guard.mjs`** and
**`scripts/guards/fixture-marker-guard.check.mjs`** — those three ARE your template.
Also read `docs/agents/borrowed-guards.md` (the test a new guard must pass).

Twelve builder slices are done and verified. This slice builds **the machinery that
stops two defect classes recurring**, because both have already recurred:

- **Class 1 — the vacuous assertion.** Twice. `e2e/signup-zip-fallback.e2e.ts:148-149`
  asserts `toHaveCount(0)` for elements that **cannot render on the page the spec is
  on**, so the counts are structurally guaranteed. The first instance was the old
  `:106` of the same spec.
- **Class 2 — a locator pointing at a string the app no longer renders.** **Three
  times**: `e2e/fixtures.ts`, `e2e/auth.setup.ts`, and `e2e/onboarding-resume.e2e.ts`
  (which waited on a `"Set your location"` heading three times after that step became
  the area card). Each time a slice renamed UI and a spec went red for a reason the
  brief never anticipated. **That class is also the orchestrator's own recurring
  scope-line failure, which is why it gets a guard instead of a fourth manual sweep.**

## The contract a guard must meet (from the existing ones — read them first)

- **Deterministic and credential-free.** It either finds a violation or it does not.
  No network, no live DB, no tokens.
- **It fails on the real defect class**, never on a stylistic preference.
- **⚠️ IT SHIPS A `.check.mjs` THAT PROVES IT FIRES.** The documented failure mode is
  *"it passed"*: a regex checker that silently stopped matching looks exactly like a
  clean repo. So the check **seeds the defect into a throwaway copy and requires a
  non-zero exit** — the existing guard seeds three. Yours must seed at least one real
  instance of its class, using the cases above as the fixtures.
- **It is wired into `run-all.sh`** and added to that file's rule list with its doc.
- **Document "WHAT IT IS NOT."** Every existing guard says explicitly what it cannot
  see and why it stays silent. **A guard that produces false positives gets disabled,
  and a disabled guard is worse than no guard** — so its false-positive story must be
  written down, not discovered.

## Guard 1 — vacuous `toHaveCount(0)` assertions

A `toHaveCount(0)` is only **evidence** if the element could have rendered on that
path. The reviewer's suggestion, which you may improve on: reject a `toHaveCount(0)`
whose locator target is a testid that renders on a **different route**. A tractable
rule of your own design is welcome — **say in your report what rule you chose and why
it is tractable**, and document the false positives you deliberately do not chase
(dynamically composed locators, data-driven strings).

**This guard's first finding is real and in the repo now:**
`e2e/signup-zip-fallback.e2e.ts:148-149` — cut both lines. The test's meaning is
already carried by `:141-145` (the feed is about the **resolved** zip with **no ZIP
typed anywhere in the test**), and the header comment can keep the intent. **Do not
weaken anything else in that spec.**

## Guard 2 — locators pointing at strings `src/` no longer renders

Check the plain string literals used in `e2e/` locators — `getByRole('heading' |
'button', { name: '…' })`, `getByText('…')`, `getByPlaceholder('…')`,
`getByTestId('…')` — against the strings that still exist somewhere in `src/`.
Report the ones that do not. Skip template literals and variable locators (say so in
"what it is not").

**This guard must be GREEN on the repo as it stands.** If it is not, **the stale
locators it finds are real test bugs** — fix them in this slice; that is the class
that has cost three rounds. **If it finds more than ten sites, STOP and report the
list rather than fixing them all in one context** — a bounded list I can slice is
worth more than a half-finished sweep.

## Do NOT do these (they are deliberately deferred, not forgotten)

- **The dead-export "pinned by a test, read by nobody" sweep** (`skipLabel`,
  `missingProfileItems`, `needsOnboarding`) → a later hygiene slice.
- **The phrase-based stale-claim sweep** (`App.tsx:86`/`:90-92`/`:387`,
  `OnboardingPage.tsx:262`, `e2e/places-map-view.e2e.ts:119`,
  `docs/social-login-setup.md:77`, the `"nudge banner"` vocabulary) → the same later
  slice.
- **The `resolveCard` extraction**, **`ProfilePage.tsx:1218`**, and the
  **`finishSignup` pre-resolved-zip option** → the same later hygiene slice.
- **`e2e/auth.setup.ts`'s duplicated walk** → the same slice, not here.
- **The batch-end lanes** (full e2e suite, marker sweep, the no-zip e2e) → `7b`.

They are deferred because **the human's playtest is the only lane that can falsify the
flow**, and it should run before the hygiene work takes another two contexts.

## Verify

```
bash scripts/guards/run-all.sh                 # the new guards, with their lines
node scripts/guards/<your-guard>.check.mjs     # each proves it fires
npm run verify                                 # guards run LAST; paste the GUARDS line
```

Paste real tails. **Lint at 0 errors / 81 warnings**; tests against **66 files / 1989
tests** (say the new number if you add tests); **the GUARDS line verbatim, and say
whether it still says `PASS — all deterministic rules hold.`**

**Prove each new guard FIRES** — paste the `.check.mjs` output showing the seeded
defect being caught with a non-zero exit, and say what would have to break for the
guard to stop firing.

## Commit and report

```
V28 slice 7a: two guards for the two classes that recurred
```

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
Guard 1: <the rule you chose, why it is tractable, its false-positive story, the seeded defect its check uses>
Guard 2: <same; and the stale locators it found, if any>
The two vacuous lines: <cut, with the test's meaning still carried by which assertions>
Wiring: <run-all.sh rule-list entry + the doc you pointed it at>
Commands run: <real tails; both check.mjs outputs; the GUARDS line verbatim>
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
