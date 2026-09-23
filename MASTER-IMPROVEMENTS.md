# Master improvement list — Drop In

> Synthesis of two independent reviews run 2026-09-23:
> - **Apple HIG review** (`DESIGN-REVIEW.md`) — principles, foundations, platform
>   conformance, craft. Human-judgment lens.
> - **Impeccable audit** (`AUDIT.md`) — 5 measurable dimensions, bundled
>   detector, scored 10/20. Mechanical lens.
>
> Sources: `PRODUCT.md` (product truth), `DESIGN.md` (incumbent visual system),
> `AUDIT.md` (technical), `DESIGN-REVIEW.md` (HIG).

---

## 1. Where the two reviews agree (high confidence — do these)

These were found independently by both lenses. That convergence is the strongest
signal in this document: a mechanical detector and a judgment-based HIG pass
reaching the same conclusion about different evidence is hard to argue with.

| # | Finding | Apple HIG said | Impeccable said |
|---|---|---|---|
| A1 | **Errors never announced** — 65 nodes, 0 live regions | Critical: `accessibility.md` "more than color alone" | P1: WCAG 4.1.3 Status Messages |
| A2 | **No dark mode** — 0 `dark:`, 0 `prefers-color-scheme` | Critical: `dark-mode.md` "expect all apps to respect their preference" | P1: Theming scored **1/4** |
| A3 | **Phone-only layout** — `max-w-md` × 12, 15 responsive prefixes | High: `layout.md` "based on size classes, not device type" | P2: Responsive scored **1/4** |
| A4 | **Low-contrast secondary text** — `slate-400` at 3.30:1 | Critical: 4.5:1 floor for ≤17pt | Detector: `low-contrast` rule |
| A5 | **No reduced-motion** — 1 `motion-reduce:` vs 79 transitions | Medium: `motion.md` "make motion optional" | P2: Accessibility dimension |
| A6 | **No focus trap/restore in dialogs** | Medium: `accessibility.md › Mobility` | P3: keyboard navigation |

A4 is the one worth noting precisely: the HIG review computed 3.30:1 from the
token hex on the *three Inbox nodes*, while the detector's own `low-contrast`
hits landed on the **mockup files** — different locations, same root cause (a
low-emphasis token used where a readable one belongs). Fix both.

---

## 2. Where they disagree — and who is right

### 2.1 The tab bar: an action in a navigation bar

**Apple HIG: High finding.** `tab-bars.md › Best practices`: "Use a tab bar to
support navigation, not to provide actions." "Post" (`App.tsx:264`) is an action
sitting in a nav bar.

**Impeccable: silent.** It has no rule for this. Its detector looks at color,
contrast, and shape — not information architecture. The tool cannot see it.

**Ruling: the HIG review is right, and Impeccable is simply blind here.**
Impeccable is a *visual quality* instrument; navigation semantics are outside its
scope. This is the clearest example of why both lenses were needed.

### 2.2 The `ai-color-palette` / `gray-on-color` hits

**Impeccable: 3 warnings** — `LoginPage.tsx:248`, `ResetPasswordPage.tsx:61`
("purple/violet"), `InboxPage.tsx:169` (gray on colored).

**Apple HIG: no such finding** — in fact the HIG review *praised* the palette as
"the app's best idea" and praised the reasoning behind it.

**Ruling: the HIG review is right; the detector is wrong.** Verified:
`--color-indigo-600: #c8411c` (`index.css:156`) is terracotta, not purple. The
rule matches the *class name*. And `slate-900` on `indigo-100` computes to
**7.75:1** — comfortably passing, and exactly the "darker shade of the
background" the rule recommends.

This is the reverse of 2.1: the mechanical tool produces false positives on a
deliberate deviation, and only the judgment lens can tell a violation from a
decision. **Do not "fix" these.** Add a reason to `design-detect.mjs`'s ACCEPTED
list so the gate stops re-reporting them.

### 2.3 Bundle size and lazy loading

**Impeccable: P2 findings** (828 KB / 228 KB gzip, zero code splitting, zero
lazy images).

**Apple HIG: silent.** The skill's scope is design, not performance.

**Ruling: Impeccable is right and adds real value the HIG lens cannot.** Worth
acting on, though P2 is the honest severity — this is a correctness-first
codebase, and the app works; it is just slower to first paint than it needs to
be on cellular.

### 2.4 Mockups in the build output — **my claim was wrong, corrected**

**Impeccable: found it** (11 `low-contrast` hits in `public/logo-mockup.html`
and `public/color-compare.html`).

**Apple HIG: would not have looked.** Neither would I, without the detector
pointing at those files.

**Ruling (corrected 2026-09-23): real finding, but my severity was inflated by a
bad verification.** I originally wrote that the mockups "resolve with HTTP 200 on
the live site" and called it public exposure. **The 200s were Vercel's SPA
fallback**, not the files: `vercel.json` rewrites every path to `/index.html`, so
a nonsense URL answers 200 too. The served body was 4,747 bytes — byte-identical
to `dist/index.html` — while the real mockups are 10,886 and 11,777 bytes. They
were also gitignored on purpose, with a `.gitignore` comment warning they'd ship
if committed, and were never committed, so a git-based deploy could not ship them.

What survives: they **were** copied into local `dist/`, so they'd have shipped in
any deploy produced by uploading that directory instead of building from git — a
latent risk, not a live one. The contrast failures the detector found are genuine.
Moving them out of `public/` was still the right fix and is done (V22 slice 3);
severity drops from "public exposure" to P3 hygiene.

**Why this is written up rather than quietly edited:** I criticized the detector
for reporting findings it had not verified. I then reported a finding I had not
verified — a status code as proof of content. The correction belongs in the
record.


### 2.5 Search, swipe gestures, badges, icon fill

**Apple HIG: five separate findings** (search absent, no swipe on rows, no Inbox
badge, outline-only nav icons, color-only active tab).

**Impeccable: silent on all five.** No rule covers affordance inventory.

**Ruling: HIG is right, all are real, and all are genuinely lower priority
than the agreement list.** These are platform-conformance refinements. Note the
honest caveat: swipe-to-go-back is Low for a web PWA because the browser owns
that gesture.

---

## 3. Master list — ranked

One list, both lenses merged, ordered by *value per unit of risk*. Severity
prefixes: **P0** blocking · **P1** major · **P2** minor · **P3** polish.

### Now — accessibility and correctness (no design decisions needed, ~1 day)

| # | Action | File(s) | Sev | Source |
|---|---|---|---|---|
| 1 | `role="alert"` + `aria-describedby` + `aria-invalid` on all 65 error/status nodes; focus the first invalid field on failed submit | `LoginPage.tsx:351,418`, `OnboardingPage.tsx:533`, `PlaydateFormFields.tsx:791`, +~20 | P1 | **Both** |
| 2 | `text-slate-400` → `text-slate-500` on the three body-text nodes (3.30:1 → 4.59:1) | `InboxPage.tsx:112,165,837` | P1 | **Both** |
| 3 | Move `logo-mockup.html` + `color-compare.html` out of `public/` | `public/` → `.scratch/` | P3 | Impeccable |
| 4 | Add the 3 verified false positives to `design-detect.mjs` ACCEPTED, with reasons | `scripts/design-detect.mjs` | P3 | Impeccable |
| 5 | Trap focus in dialogs and restore `document.activeElement` on close | `ConfirmDialog.tsx`, `DeletePlaydateDialog.tsx`, `ReportDialog.tsx` | P3 | **Both** |
| 6 | Extend `motion-reduce:` beyond the splash (per-transition, not a blanket kill) | 79 `transition-`/`animate-` sites | P2 | **Both** |
| 7 | `focus:` → `focus-visible:` on inputs and buttons | ~37 sites, `PlaydateFormFields.tsx:286` et al. | P3 | Both |

**Why first:** every item is a small, mechanical edit with a verifiable outcome,
and items 1–2 block real users today. Nothing here requires a design decision or
touches the brand. Items 1, 2, 5, 6, 7 also raise the Impeccable Accessibility
score (currently 2/4) without any visual change.

### Next — the two structural axes (~3–5 days)

| # | Action | File(s) | Sev | Source |
|---|---|---|---|---|
| 8 | **Dark mode.** `@media (prefers-color-scheme: dark)` re-pointing the same token names; `color-scheme: light dark` on `:root`; dark `theme-color` meta; dark `background_color` in the manifest | `src/index.css:130-175`, `index.html:6`, `vite.config.ts:35-58` | P1 | **Both** |
| 9 | **Regular-width layout.** Two columns at ≥768 px (list + detail); bottom nav → rail/sidebar; cap measure not layout | `App.tsx:193,235,254` + 12 `max-w-md` | P2 | **Both** |
| 10 | Code-split the map: `React.lazy` the map components and `/browse` so `/login` and `/` don't carry Leaflet | `App.tsx:20`, `FeedPage.tsx:5`, `NewPlaydatePage.tsx:9`, `PlacePage.tsx:4` | P2 | Impeccable |
| 11 | `loading="lazy"` + intrinsic dimensions on list imagery | 17 `<img>` tags | P2 | Impeccable |

**Why next:** 8 and 9 are the two axes the token system doesn't yet reach, and
they're the two dimensions where Impeccable scored 1/4. Both are real design
work, not mechanical edits — 8 needs a genuine dark palette designed *for* the
terracotta (a mechanical inversion will look wrong), and 9 needs a layout
decision. Do them together: both are "the design system grows a second axis."

### Later — platform conformance and craft (~2–3 days)

| # | Action | File(s) | Sev | Source |
|---|---|---|---|---|
| 12 | Move "Post" out of the tab bar to a prominent action on the Feed; free the tab for Search or Places | `App.tsx:264,252-268` | High | HIG only |
| 13 | Non-color active-tab state (weight + filled icon) — color alone fails ~8% of men | `App.tsx:360-362` | High | HIG only |
| 14 | Filled nav icon variants, keeping the stroke family for in-content glyphs | `components/icons.ts:7-15`, `App.tsx:372-386` | Medium | HIG only |
| 15 | Unread badge on the Inbox tab | `App.tsx:252-268` | Medium | HIG only |
| 16 | Collapse the 3 routes to settings (header gear + Profile tab + Profile's own link) | `App.tsx:206-212` | — | HIG only |
| 17 | ~~Standardize button capitalization~~ — **RETRACTED, nothing to do.** No mixed capitalization exists: every `<button>`/`submitLabel` is already sentence case (verified by scanning all of them). The two strings the HIG review cited are instructional prose and a `<option>`, not buttons. | — | — | HIG only (corrected) |
| 18 | Named `alt` on identity avatars where no adjacent label names the person | `DropInCard.tsx:307`, `ProfileView.tsx:467,533,571` | P2 | Impeccable |

**Why last:** all quality-of-life or conformance. Item 12 is the most valuable
here and 13 should land with it — they're one coherent change to the tab bar.

### Explicitly decided against

- **Do not "fix" the `ai-color-palette` or `gray-on-color` detector hits.** The
  palette is a deliberate, documented brand decision; the rule reads class names
  and cannot see through a `@theme` override.
- **Do not add an app-level appearance toggle** when adding dark mode.
  `dark-mode.md` is explicit: an app-specific switch makes people adjust two
  settings and can read as broken.
- **Do not add swipe-to-go-back.** Low value in a web PWA where the browser owns
  the gesture, and `accessibility.md` requires a tap alternative anyway (which
  the "Back to today" links already provide).
- **Do not invert the dark palette mechanically.** Design it against the
  terracotta.

---

## 4. What both reviews say to keep

The convergence runs both ways — both lenses independently praised the same
things, which means these are genuinely strong and a refactor should protect
them:

1. **The token architecture.** One `@theme` block overriding Tailwind's scale
   instead of ~450 call sites. Impeccable scored Implementation Integrity
   **4/4** — its highest mark — and the HIG review called the palette "the
   app's best idea."
2. **Measured contrast, not eyeballed.** `mobile-audit.mjs` samples rendered
   pixels; the HIG review verified the palette's own documented figures
   (white on `#e8552f` = 3.64:1, on `#c8411c` = 4.97:1) and found them accurate.
3. **Tap targets and the iOS zoom trap.** 82 `min-h-11` usages; 16px inputs
   keyed on `(pointer: coarse)` because a landscape phone is 844px wide.
4. **Dialog semantics.** All three dialogs have correct roles, `aria-modal`,
   `aria-labelledby`, focus-on-safe-action, and Escape. Only the trap and
   restore are missing.
5. **The type scale.** `--text-sm` = 17px (iOS body), floor 14px — exactly what
   `typography.md` specifies, and the reasoning is written down.
6. **The boot splash.** Frame-exact HTML→React handoff, `motion-reduce` applied.
   Both lenses read this as the app's signature moment.

---

## 5. Score trajectory

| | Now | After "Now" | After "Next" | After "Later" |
|---|---|---|---|---|
| Impeccable Accessibility | 2 | **4** | 4 | 4 |
| Impeccable Theming | 1 | 1 | **3** | 3 |
| Impeccable Responsive | 1 | 1 | **4** | 4 |
| Impeccable Performance | 2 | 2 | **4** | 4 |
| Impeccable Integrity | 4 | 4 | 4 | 4 |
| **Impeccable total** | **10/20** | **12/20** | **19/20** | **19/20** |
| HIG rating | Needs work | Needs work | **Good** | **Good** |

The "Next" block is where the score actually moves: those are the two dimensions
scoring 1/4, and they're worth 6 points between them.

---

## 6. Method note (what each lens could and could not see)

Worth recording so the next audit doesn't re-derive it:

- **Impeccable found things HIG could not:** the mockups shipping to production,
  the 828 KB eager bundle, the zero-lazy-loading pattern, and the three false
  positives that needed *disproving*.
- **HIG found things Impeccable cannot see at all:** an action in a navigation
  bar, absent search, missing swipe affordances, missing badges, icon fill,
  color-only state, and capitalization inconsistencies. Impeccable has no
  information-architecture, affordance, or copy rules.
- **Both missed nothing the other found *and verified true*.** Every
  disagreement resolved to one lens being out of scope or producing a false
  positive on a deliberate deviation — never to a genuine contradiction. That
  is the argument for running both: neither is a superset, and the one
  false-positive cluster (`ai-color-palette`) would have caused real damage if
  acted on alone.
