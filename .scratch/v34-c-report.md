# V34-C — the onboarding Finish transition

**Sentinel:** V34-C-ONBOARD-FINISH-T2F6
**Branch:** `onb-finish-t2f6` (worktree `/tmp/pd-wt/onb-finish-t2f6`)
**Slice:** `muzkg290` — *"When you click on finish here, I feel like it jumps into
the main app really quickly and it's like kind of jarring. Maybe there should be
some kind of animation state or loading state or like building your profile
state or something."* — anchored on `/onboarding`

---

## What shipped

Between the Finish tap and the feed landing, the parent now sees a **"Building
your profile…"** state: a `role="status"` region with the house's busy spinner
(the `animate-spin` + `motion-reduce:animate-none` pair `ModPage.tsx:220`
already uses). It is driven by the **real completion work** — `updateHomeZipRadius`
and the session `refresh()` — plus a **500 ms minimum visible window**, and it
is rendered inside the run's existing `'finish'` branch, so the feed landing
itself is byte-for-byte the navigation that was there before.

### Files

| File | Change |
|---|---|
| `src/lib/onboardingCompletion.ts` | **new** — the pure rule: the hold and the phase |
| `src/lib/onboardingCompletion.test.ts` | **new** — 16 legs, incl. source-level call-site pins |
| `e2e/onboarding-finish-transition.e2e.ts` | **new** — 3 legs (state→feed, reduced motion, failure path) |
| `src/pages/OnboardingPage.tsx` | the `completing` state, the transition render, the save handler's hold |
| `src/lib/firstRunCopy.ts` | `FIRST_RUN_COMPLETION_COPY` — the sentence, as data |
| `scripts/guards/copy-field-consumption-guard.mjs` | registers the new copy const (the documented "visible act") |
| `scripts/guards/copy-field-consumption-guard.check.mjs` | reconciles the field count 8 → 9 (see *Reconciliations*) |

## The number I chose, and why — **500 ms**

The brief asked for the minimum, stated, under ~600 ms. 500 ms, on three
anchors:

1. **The house's longest authored moment is the boot splash at 300 ms**
   (`DESIGN.md`, Motion). A finish transition is a lesser moment than the
   brand's arrival, but its job is to be *read*, where the splash's is to be
   *felt*.
2. **~400 ms is the usual floor** for "this is a transition, not a flicker";
   below it a viewer reads the frame as a stutter.
3. **The measured cost** (below): the floor is the whole of the growth, and it
   stays under the brief's ceiling.

Not `600` — a floor *at* the brief's ceiling leaves no room below it. Not `300`
— a flash that short reads as a glitch.

## Measured before/after signup time (acceptance 4)

Paired runs, three each, same probe, same machine, same private port, live
Supabase. The window is **Finish tap → the feed's "Near you" heading visible**.

| | run 1 | run 2 | run 3 | **mean** |
|---|---|---|---|---|
| **BEFORE** (pre-slice) | 381 ms | 341 ms | 340 ms | **354 ms** |
| **AFTER** (this slice) | 837 ms | 861 ms | 853 ms | **850 ms** |

**Growth: ≈ 496 ms — essentially exactly the chosen 500 ms floor.** The write's
own time is *absorbed* by the floor rather than stacked on top of it, so the
growth does not scale with the network. The new spec's own leg prints the same
measurement on every run (1141–1159 ms there, because that window also includes
Playwright's click actionability); it asserts `total < floor + 3000 ms`.

## Acceptance, leg by leg

1. **State appears between the tap and the feed, then the feed lands as
   before.** `e2e/onboarding-finish-transition.e2e.ts` test 1: a fresh viewer
   signs up, walks the run, taps Finish, and the spec asserts
   `onboarding-completing` is **visible with the copy and `role="status"`**,
   *then* the feed heading, `pathname === '/'`, the feed location line carrying
   the right zip, and the state **gone** once the feed is up. Asserting only the
   feed would pass with the state absent — the ordering is the pin.
2. **Reduced motion: the copy appears, nothing animates.** Test 2 runs in a
   context created with Playwright's `reducedMotion: 'reduce'` (the spec first
   asserts `matchMedia('(prefers-reduced-motion: reduce)').matches` is really
   `true`, so it cannot pass over the animated build), then asserts the copy is
   visible and that **every element inside the state has computed
   `animationName === 'none'`**. That is a measurement of what the browser would
   run, not a claim about markup — a dropped `motion-reduce:animate-none` fails
   here.
3. **A failed completion surfaces its existing error and never the success
   state.** Test 3 intercepts the real `profiles` PATCH and answers 500, so
   `updateHomeZipRadius` throws on the app's genuine failure path. It then
   asserts the area card's own `role="alert"` is visible, waits
   `floor + 250 ms`, and asserts `onboarding-completing` has **count 0** and the
   URL is still `/onboarding`. `completing` is set only on the success leg and
   cleared in the catch, so the success state cannot co-render with a failure.
4. **Walk time does not grow past the minimum.** Measured above: 496 ms growth
   against a 500 ms floor.
5. **Every signup-walking spec keeps passing.** On the private port 4213:
   `onboarding-finish-transition`, `signup-zip-fallback`, `onboarding-resume`,
   `onboarding-gate`, `onboarding-kid-photo`, `zip-radius` → **25 passed, 1
   failed**, the failure being a **pre-existing** defect (below). `finishSignup`
   in `e2e/fixtures.ts` is **untouched**.

### Stability

The transition's own spec was run **10 times consecutively**: **10/10 pass**,
zero `element(s) not found`, measurement 1142–1636 ms. This matters because the
first two designs of this slice both failed intermittently — see below.

## The gate

```
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only
server.host change (another session), not this slice" npm run verify
→ exit 0
```

- build ✓, `typecheck:e2e` ✓
- **2721 unit tests / 93 files passed**
- lint: 0 errors (88 pre-existing warnings)
- `a11y:focus` ✓, `steering-lint` **PASS** (clean — not red)
- `GUARDS: PASS — all deterministic rules hold.`

`npm run guards` standalone: **GUARDS: PASS**.

Signup specs ran on **private port 4213** (minted the marker there; the server
was killed by port/PID, never `pkill -f`). Everything staged **by path only**.

## The two defects this slice found in ITSELF, and how

Both were found by *running the spec repeatedly*, not by reading the code. They
are recorded because each is a trap a later editor can fall back into.

### 1. The state could be batched out of existence entirely

The first cut measured the floor **from the tap** and returned `0` once the
write had outlasted it ("the state was on screen the whole time"). That
reasoning is wrong in React: when the awaits resolve before the next paint,
`setCompleting(true)` and `setCompleting(false)` land in **one commit**, and the
state is painted in **no frame at all** — on exactly the fast connections where
a parent is most likely to be jarred. Measured: `onboarding-completing`
"element(s) not found" on warm spec runs, with a screenshot showing the **feed
already painted** and the first-run tooltips up.

**Fix:** the window is anchored at the moment the state appears
(`completionHoldRemainingMs(visibleSince, visibleSince)`), so the floor is
*always full* and the clear can never share the creating commit — plus a real
paint wait (rAF, then a `setTimeout(0)` queued from inside it) before the
handoff. A lone `requestAnimationFrame` runs *before* the paint and is not
enough.

### 2. Rendering it at the tap broke the card's own in-flight state

The second cut set the flag at the tap and rendered the transition **above every
card branch**. That unmounted the area card the instant it was tapped — and two
existing specs hold this very PATCH open and assert the **card's** state:
`signup-zip-fallback.e2e.ts`'s frozen-zip-field leg (`saving` disables the field,
which still shows the value being written) and its navigation-guard leg (back and
forward are refused while `saving`). Both failed with `element(s) not found`.

**Fix — and it is the shipped design:** the **card owns tap → settle**
(byte-for-byte as before this slice) and the **transition owns settle → feed**.
`setCompleting(true)` sits after `await refresh()`. The regression's own guard is
pinned at the source level in `onboardingCompletion.test.ts` (the index of
`setCompleting(true)` must be greater than `await refresh()`'s).

## The one failing spec is PRE-EXISTING, and proved so

`e2e/signup-zip-fallback.e2e.ts:333` — *"blur + Finish … the card shows its pin +
radius circle"* — fails with the Leaflet radius circle's SVG `d` not changing on
a radius change. It is upstream of the finish path (it never reaches the
navigation) and it **fails identically on the baseline** with this slice stashed
and rebuilt:

```
$ git stash -u && npm run build && npx playwright test e2e/signup-zip-fallback.e2e.ts:333
  ✘  … blur + Finish on the same address issues exactly ONE request… (32.8s)
  1 failed
```

It is not fixed here: it is a map-overlay re-key defect outside this slice's
scope, and touching it would be an unrequested change to a different surface.

## A harness note that cost real time, recorded so it costs nobody else any

This spec creates three real accounts per run against the **live** Supabase
project, and this project's project-wide signup path is **rate limited**. A
throttled run leaves the browser on `/login` with the app's own *"Request rate
limit reached"* alert, and the walk never starts — which showed up as the
**first later assertion** failing, i.e. as `onboarding-completing` "element(s)
not found", accusing the slice of the very bug it fixes.

The spec's own signup helper now **detects the throttle and `test.skip`s with
the cause named**, so a throttled run is never reported as a product finding.
(The existing `signup-zip-fallback.e2e.ts` and friends do not have this gate —
they report the same throttle as `toHaveURL` timeouts; that is a pre-existing
harness weakness in those files and is out of this slice's scope.)

## Reconciliations (explicit, not silent)

- `scripts/guards/copy-field-consumption-guard.mjs`: `FIRST_RUN_COMPLETION_COPY`
  added to `COPY_MODULES`. This is the act that guard's own header demands
  ("Adding a copy module, or a copy const, means adding it here — a visible
  act"). The const is deliberately **not** `as const`, because the guard cannot
  resolve an asserted literal's shape and reports it as blind — a finding, not a
  pass.
- `scripts/guards/copy-field-consumption-guard.check.mjs`: one seed asserted
  `declared fields: 8`; the module now declares **9**. The expectation was moved
  to 9 **with the reason in the code**, and the guard's own pre-seed run was read
  to confirm all nine are listed and read. The seed still fails on a *dropped*
  field, which is the defect class it exists for — this is a reconciliation, not
  a relaxation.
- `src/lib/onboardingCompletion.ts` module-level comment records the two defects
  above, because the *wrong* design is the one a reader would naturally reach
  for.

## Not done, deliberately

- `HowItWorksCard` / `firstRunTour.ts` are untouched (r3-7's tooltips are their
  likely consumer; `copy-taxonomy-guard` is coupled to `TOUR_TAXONOMY_CLAIMS`).
- The pre-existing `signup-zip-fallback.e2e.ts:333` radius-circle defect is
  reported, not fixed.
- The other signup specs' lack of a rate-limit gate is reported, not fixed.
