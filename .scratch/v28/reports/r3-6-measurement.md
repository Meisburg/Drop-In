# r3-6 MEASUREMENT — the deletion boundary is ambiguous. No implementation attempted.

**Date 2026-10-03. Nothing edited, staged, or committed for r3-6. Tree untouched by me.**

---

## 1. Every consumer of `first-run-finish-card` (measured, 12 hits / 3 files)

| file | lines | what it is |
|---|---|---|
| `src/components/HowItWorksCard.tsx` | `:29` comment, `:37` the default prop | **the producer** |
| `e2e/fixtures.ts` | `:480` comment, `:605` `finishSignup`'s read | **the shared walk** |
| `e2e/signup-zip-fallback.e2e.ts` | `:223, :295, :380, :568, :578, :798, :868, :1002` | **8 assertions** |

**`e2e/auth.setup.ts` carries NO hit** — confirmed again this turn. It walks the ending
*through* `finishSignup` (`:95`) and never names the testid itself. The plan's earlier
"four named files / 11 hits" figure was approximate; the measured figure is **3 files /
12 hits**.

### The blast radius behind the shared walk

- **`finishSignup` is called by 19 spec files**; `finishSignup` + `signUpViewer` appear in
  **23**. Every one of them walks the ending.

### The one consumer a rename cannot satisfy

`e2e/signup-zip-fallback.e2e.ts:568` is a **`not.toBeVisible()`** — an assertion about the
ending's **ABSENCE**:

```
await page.waitForTimeout(300)
await expect(page.getByTestId('first-run-finish-card')).not.toBeVisible()
await expect(page.getByTestId('first-run-area-card')).toBeVisible()
```

Its meaning is *"a stale save did NOT already render the ending."* **If the ending stops
existing, this assertion is vacuously true** — it would keep passing while testing nothing.
That is the D-030 shape (*an instrument that matches nothing looks exactly like a clean
repo*) and it must be **replaced by an assertion with content**, not renamed.

---

## 2. What actually renders after the last card today

`OnboardingPage.tsx:1473-1475`:

```ts
if (paintedView === 'finish') {
  return <HowItWorksCard onGoToFeed={() => navigate('/', { replace: true })} />
}
```

`resolveCard` answers `'finish'` when `hasProfile && hasZip`. The tour card renders **IN
PLACE**, and its own comment (`:1455-1472`) records why it must render **before** the
`kids-pending` and `loadError` branches — including a **reachable** case: a returning
parent whose `loadZipCodes()` fails resolves to `'finish'` **carrying a `loadError`**.

### ⚠️ THE GAP THE PLAN DOES NOT NAME

**Deleting the ending does not automatically "land the parent in the app".** The tour
card is what currently does that, via its CTA. `OnboardingPage`'s save **does not
navigate** — its own comment at `:255` says *"the area card's save no longer navigates —
this card IS the landing."*

So removing the ending leaves `paintedView === 'finish'` rendering **nothing that the
current code provides**: the run would fall through to the `loadError` check and then to
the **area card**, which is wrong for a finished parent.

**The redirect is deliberately NOT a bounce.** `App.tsx:404-406`:

```ts
const redirect =
  isFirstRun ? resolveOnboardingRedirect(signedIn) : shellRedirect(signedIn, pathname)
```

and `resolveOnboardingRedirect` (`lib/onboarding.ts:69-72`) returns `'/login'` for
signed-out and **`null` otherwise** — i.e. **a signed-in parent is never redirected off
`/onboarding`**. That was V28 slice 6's defect #19 fix ("no feed bounce"), and
`onboarding.test.ts:64` pins it.

**Therefore r3-6 must ADD a destination** — either a `navigate('/', { replace: true })` on
the finish path, or a redirect rule — and **that is new behaviour, not a deletion.** The
plan's acceptance ("landing the parent in the app") silently assumes it happens; nothing
in the tree makes it happen.

---

## 3. The contradiction in the plan's own acceptance

The slice says both of these:

1. *"finishing the last card lands the parent **in the app**, on the feed, with the nav
   visible — **no interstitial screen**"*; and
2. *"`HowItWorksCard`'s fate is decided here: **if its content survives into item 3's
   tooltips, move it there**; if not, delete it with its exports by name"*.

**Item 3 is r3-7 — the NEXT slice — and it has not run.** So this slice is asked to decide
`HowItWorksCard`'s fate based on an outcome that does not exist yet.

Additionally: `firstRunTour.ts` (+ its 21KB test) and `TOUR_TAXONOMY_CLAIMS` are read by
`copy-taxonomy-guard`. The plan correctly says **do not delete `firstRunTour.ts` here**,
because item 3 is its likely consumer — which means **`HowItWorksCard` cannot be fully
deleted either** without either orphaning the module or pre-deciding r3-7.

---

## 4. What is NOT ambiguous

- The **testid relocation** is mechanical: 12 hits, 3 files, and the fixture's walk.
- The **`not.toBeVisible()` replacement** is required and its shape is clear (assert the
  parent is on the feed, or that the area card is still showing — the assertion must have
  content).
- **`auth.setup.ts` needs no direct edit** (it goes through `finishSignup`).
- **The 8d radius-select divergence is untouched and stays open.**

## 5. The specific conflict

This is the plan's own class: *a slice that reverses or removes a named decision without
naming it.* The decision here is V28 slice 6's **defect #19** — "the run ends on its own
card, never a feed bounce" — pinned by `onboarding.test.ts:64` and by the `App.tsx:405`
ternary. **r3-6 removes the card that decision installed and must therefore introduce the
bounce that decision forbade.** That reversal is intended (the human's item 2), but it must
be **named and recorded** before the edit, exactly as r3-3/A14 and r3-5 were.

**Stop recorded. Awaiting the boundary ruling.**
