# Audit: Drop In — Impeccable (technical)

> Run 2026-09-23 against `/home/jmeisburg/Projects/playdate-app` at commit `HEAD`.
> Method: `impeccable context` → `init` (PRODUCT.md written) → bundled detector
> (`impeccable detect --json .`) → hand verification of every finding in source.
> This is the technical audit. See `DESIGN-REVIEW.md` for the Apple HIG review.

## Implementation Integrity Verdict — **PASS**

The implementation expresses a coherent, product-specific system, and the
evidence is unusually strong for a project this size:

- **A real token layer.** `src/index.css` defines ~18 semantic color tokens and
  a role-based type scale in Tailwind v4's `@theme`, and overrides the stock
  scale rather than editing ~450 call sites. The reason is written down.
- **The tokens are product-specific, not template.** `--color-indigo-*` is
  retained as a *name* but holds terracotta values (`#e8552f` brand / `#c8411c`
  AA action tone) — a deliberate brand decision recorded at `index.css:100-129`,
  including why terracotta and not Peanut's coral-red.
- **A mechanical gate exists and is honest.** `scripts/mobile-audit.mjs` measures
  contrast on *rendered pixels* (parsing painted colors to survive Tailwind v4's
  `oklch()` output) and `scripts/design-detect.mjs` runs 61 anti-pattern rules
  with a written ACCEPTED list where every exemption carries a reason.
- **Detector false positives were verified, not assumed.** See below.

**Verdict: the structure is intentional and not interchangeable with an
unrelated product.** The failures are in coverage — whole axes the system does
not yet reach — not in drift.

---

## Detector results (16 findings, all verified)

Run: `impeccable detect --json .`

| Count | Rule | Severity | Verified verdict |
|---|---|---|---|
| 11 | `low-contrast` | warning | **Real, but not in the app** — all in unshipped-then-shipped mockups |
| 2 | `ai-color-palette` | warning | **FALSE POSITIVE** — verified below |
| 1 | `gray-on-color` | warning | **FALSE POSITIVE** — verified below |
| 1 | `shape-assembled-illustration` | advisory | Real, mockup only |
| 1 | `em-dash-overuse` | advisory | Real, mockup only |

### Verified false positives (do not "fix" these)

**`ai-color-palette` × 2** — `LoginPage.tsx:248`, `ResetPasswordPage.tsx:61`,
both flagged as `text-indigo-600 on heading`. The rule fires on the *class name*.
The token resolves to `#c8411c` (`index.css:156`), a terracotta. There is no
purple in this app; the whole palette was deliberately moved off indigo, and
`design-detect.mjs:28-33` records that as an accepted, reasoned decision. The
rule cannot see through a custom `@theme` override.

**`gray-on-color`** — `InboxPage.tsx:169`, `text-slate-900` on `bg-indigo-100`.
Computed: `#2f4858` on `#fbe2d7` = **7.75:1**, comfortably above the 4.5:1 floor
(and above AAA's 7:1). This is dark text on a light warm tint, which is exactly
the "darker shade of the background color" the rule asks for. The rule assumes
`indigo-100` is a saturated blue tint, which it no longer is.

### CORRECTED (2026-09-23): the mockups were never publicly reachable

**This section originally claimed the mockups were "live in production" on the
strength of two HTTP 200s. That was wrong, and the correction matters.**

The 200s were Vercel's SPA fallback, not the files. `vercel.json` rewrites every
path to `/index.html`, so *any* URL answers 200:

```
$ curl -o /dev/null -w "%{http_code}" .../logo-mockup.html      -> 200
$ curl -o /dev/null -w "%{http_code}" .../nonexistent-xyz.html  -> 200   # also 200
```

Byte sizes settle it — the served body was 4,747 bytes for both mockup URLs,
identical to `dist/index.html`, while the real files are 10,886 and 11,777 bytes.
The mockups were never served. A status code was treated as evidence of content;
it was evidence of a routing rule.

Compounding the error: these files were **gitignored on purpose**, with an
explicit comment in `.gitignore:71-75` warning that committing them "would SHIP
them to the deployed site" — and they were never committed. A git-based deploy
could not have shipped them.

What remains true:

- `public/logo-mockup.html` and `public/color-compare.html` **were** copied into
  `dist/` by the local build, so they were present in a local `dist/` and in any
  deploy made by uploading that directory rather than building from git.
  (Vercel builds from git here, so this did not happen; it was a latent risk,
  not a live exposure.)
- They carry real contrast failures (`#7c8b93` on `#fbfaf7` = 3.4:1, 8
  occurrences; `#6d7b82` on `#f2f0ed` = 3.8:1, 2 occurrences), which is the
  detector's genuine signal.
- Moving them out of `public/` is still correct and is now done (V22 slice 3).
  The severity drops from P3-public-exposure to P3-hygiene: they can no longer
  enter any build output, however it is produced.

**Lesson recorded deliberately:** an HTTP status code is not evidence about
content when a rewrite rule is in play. The audit's own rule — verify before
reporting — applies to the auditor.


---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|---|---|---|
| 1 | Accessibility | **2** | 65 error/status text nodes, **0** announced to assistive tech |
| 2 | Performance | **2** | 828 KB bundle (228 KB gzip), zero code splitting, 0 lazy images |
| 3 | Theming | **1** | Full token system, but **no dark mode at all** (0 `dark:`, 0 `prefers-color-scheme`) |
| 4 | Responsive Design | **1** | Every route clamped to `max-w-md`; 15 responsive prefixes in the app |
| 5 | Implementation Integrity | **4** | Coherent, documented, product-specific; detector FPs verified |
| **Total** | | **10/20** | **Acceptable — significant work needed** |

---

## Detailed findings

Severity: **P0** blocking · **P1** major (WCAG AA violation) · **P2** minor · **P3** polish.

### P0 — none

No finding prevents a user from completing a task.

### P1 — Major (fix before release)

**[P1] Error and status text is invisible to screen readers**
- **Location:** 65 nodes. Representative: `src/pages/LoginPage.tsx:418`,
  `src/pages/OnboardingPage.tsx:533`, `src/components/PlaydateFormFields.tsx:791`,
  `src/pages/LoginPage.tsx:351`, `src/components/ReportDialog.tsx:125`.
- **Category:** Accessibility
- **Evidence:** `grep -ro 'aria-live\|role="alert"' src/ | wc -l` → **0**.
  There is exactly one `aria-invalid` in the app (`ReportDialog.tsx:118`).
- **Impact:** A screen-reader user submits a form, validation fails, and nothing
  is announced. They must re-traverse the entire form to discover what changed.
  This blocks task completion for blind and low-vision users.
- **WCAG:** 4.1.3 Status Messages (AA); 3.3.1 Error Identification (A).
- **Recommendation:** Pair every error with `role="alert"` and link it via
  `aria-describedby`, then set `aria-invalid` on the control. Move focus to the
  first invalid field on failed submit. `ReportDialog.tsx:118` is the one place
  already doing half of this — generalize it.
- **Suggested command:** `impeccable harden`

**[P1] `text-slate-400` used for body text; 3.30:1**
- **Location:** `src/pages/InboxPage.tsx:112`, `:165`, `:837` (timestamps, sender
  names, at `text-xs` = 14px).
- **Category:** Accessibility / Theming
- **Evidence:** computed `#94867e` on `#fbf7f4` = **3.30:1**; on white **3.52:1**.
  Both below 4.5:1. The token's own comment (`index.css:134`) says "lowest-
  emphasis text/icon — NOT for body copy".
- **Impact:** Message timestamps and sender names are hard to read for anyone
  with reduced contrast sensitivity, and in bright outdoor light — a stated
  operating condition of this product.
- **WCAG:** 1.4.3 Contrast (Minimum), AA.
- **Recommendation:** Use `text-slate-500` (`#66737a`, **4.59:1**) for those three
  nodes. Same for any other `slate-400` text; keep `slate-400` for non-text
  glyphs only, where it needs an accessible name instead.
- **Suggested command:** `impeccable colorize`

**[P1] No dark mode; the token system supports one but has none**
- **Location:** `src/index.css:130-175` (all tokens single-valued);
  `index.html:6` (single `theme-color`); `vite.config.ts:35-58` (manifest).
- **Category:** Theming
- **Evidence:** `dark:` → **0**, `prefers-color-scheme` → **0**, `color-scheme`
  → **0**.
- **Impact:** An installed PWA with no dark mode presents a full-brightness warm-
  white screen at night. The manifest hard-codes `theme_color: '#e8552f'`, so the
  Android status bar stays bright terracotta regardless of system setting.
- **WCAG:** Not a WCAG failure, but a platform-conformance and comfort failure.
- **Recommendation:** Add a `@media (prefers-color-scheme: dark)` block that
  re-points the *same token names* to dark values, plus `color-scheme: light
  dark` on `:root` and a second `<meta name="theme-color">` with a dark media
  query. Because the codebase overrides the scale rather than call sites, this
  is close to a one-file change — but it needs a genuine dark palette designed
  for the terracotta, not a mechanical inversion.
- **Suggested command:** `impeccable colorize`

### P2 — Minor

**[P2] Every route is clamped to a 448 px column**
- **Location:** `src/App.tsx:193`, `:235`, `:254` and 12 `max-w-md` total.
- **Category:** Responsive
- **Evidence:** 15 responsive-prefix usages app-wide, nearly all cosmetic
  (`sm:opacity-`, `sm:rounded-`, `sm:items-center`).
- **Impact:** On a tablet or desktop the app is a narrow strip with large empty
  gutters, and the bottom nav stays pinned to the window bottom. The map — a
  primary surface — is squeezed into a phone column on a large screen.
- **Recommendation:** Introduce a real regular-width layout (two columns at
  ≥768 px: list + detail), and convert the bottom nav to a rail/sidebar at that
  width. Cap *measure*, not the whole layout.
- **Suggested command:** `impeccable adapt`

**[P2] 828 KB bundle, no code splitting, Leaflet on first paint**
- **Location:** `dist/assets/index-*.js` = 828 KB raw / **228 KB gzip**;
  `src/App.tsx:20` statically imports `BrowsePage`; `PlaceMap` is imported
  eagerly by `FeedPage.tsx:5`, `NewPlaydatePage.tsx:9`, `PlacePage.tsx:4`.
- **Category:** Performance
- **Evidence:** `grep -rn "lazy(\|import(" src/` → **no dynamic imports at all**.
- **Impact:** Leaflet (+ its CSS and marker assets) is parsed and executed on
  first paint, including on `/login`, where no map can appear. On a mid-range
  phone on cellular, that is the difference between an instant first paint and
  a visible wait — for a product whose stated value is "is anything happening
  *right now*".
- **Recommendation:** `React.lazy` the map-bearing routes and components, and
  the `/browse` route. Target: `/login` and `/` should not carry Leaflet.
- **Suggested command:** `impeccable harden`

**[P2] No image lazy loading anywhere**
- **Location:** 17 `<img>` tags, **0** with `loading="lazy"`.
- **Category:** Performance
- **Evidence:** `grep -ro 'loading="lazy"' src/ | wc -l` → 0.
- **Impact:** Feed and directory lists decode every avatar and place photo up
  front, including off-screen rows.
- **Recommendation:** Add `loading="lazy"` and explicit `width`/`height` (or
  `aspect-ratio`) to list imagery to avoid layout shift.
- **Suggested command:** `impeccable harden`

**[P2] Decorative images use empty `alt` where a name would help**
- **Location:** `src/components/DropInCard.tsx:307`, `src/components/ProfileView.tsx:467`
  and `:533`, `:571`.
- **Category:** Accessibility
- **Evidence:** `alt=""` on family and kid avatars that carry identity.
- **Impact:** `alt=""` is correct for purely decorative images, but a parent
  avatar in a "who's coming" stack conveys information. Empty alt removes it
  from the accessibility tree entirely.
- **Recommendation:** Keep `alt=""` only where a visible adjacent label already
  names the person; otherwise use the person's name. `WhileAwayCard.tsx:104`
  already does this correctly — follow that pattern.
- **Suggested command:** `impeccable harden`

**[P2] Reduced-motion is handled in exactly one place**
- **Location:** `src/components/SplashScreen.tsx:70` is the *only*
  `motion-reduce:` in the app; there are **79** `transition-`/`animate-` usages.
- **Category:** Accessibility
- **Impact:** Users who set Reduce Motion still get every hover, focus, and
  opacity transition.
- **Recommendation:** Note that `audit.md` warns against a blanket `0.01ms` kill
  that destroys useful feedback. Prefer `motion-reduce:` on the transitions that
  actually move or fade meaningfully, keeping state changes legible.
- **Suggested command:** `impeccable animate`

### P3 — Polish

**[P3] Internal mockups are publicly reachable in production.**
`dist/logo-mockup.html`, `dist/color-compare.html` — both HTTP 200 on the live
site. Move them out of `public/` (e.g. to `.scratch/` or `docs/`) so they stop
deploying. Also clears the 11 `low-contrast` detector hits.

**[P3] No `focus-visible`; focus rings fire on mouse click.**
**0** `focus-visible:` vs **37** `focus:` — e.g. `PlaydateFormFields.tsx:286`
draws a ring when clicked with a mouse, which reads as noise on desktop. Switch
input/button focus classes to `focus-visible:`.

**[P3] Focus is not trapped or restored in dialogs.**
`ConfirmDialog.tsx:47-60`, `DeletePlaydateDialog.tsx:39-52`, `ReportDialog.tsx:39-52`
correctly focus the safe action and handle Escape, but never record or restore
`document.activeElement`, and Tab escapes the dialog into the page behind it.

---

## Patterns & systemic issues

1. **The design system reaches color, type, and size — but not appearance
   (dark mode) or width (responsive).** The token layer is excellent *within*
   one axis, and the two axes it does not cover are exactly where the audit
   loses points. The fix is to extend the same discipline, not to add a new one.
2. **Accessibility is strong on structure, absent on state.** Labels (35
   `aria-label`), roles (all dialogs correct), and semantics are handled well.
   Nothing *dynamic* is announced: 0 live regions, 0 status roles, across 65
   error nodes. The team clearly knows the primitives; this is coverage, not
   knowledge.
3. **Everything loads eagerly.** No dynamic imports, no lazy images — consistent
   with a codebase optimized for correctness and testability rather than for
   time-to-interactive.
4. **Dev scaffolding ships.** `public/` is treated as "static assets" without a
   filter, so throwaway HTML goes to production.

---

## Positive findings

- **The token architecture is the strongest thing in this codebase.** Overriding
  Tailwind's scale in one `@theme` block instead of editing ~450 call sites is
  the right call, and it makes the dark-mode and contrast fixes cheap.
- **Contrast is measured, not eyeballed.** `mobile-audit.mjs` samples rendered
  pixels and the comment at `index.css:125-128` records it catching a genuine
  3.30:1 failure. Most projects have no such gate.
- **The iOS zoom trap is solved properly** — 16px inputs keyed on
  `(pointer: coarse)` rather than viewport width, because a landscape phone is
  844px wide (`index.css:203-209`). Subtle and correct.
- **Tap targets are systematically enforced** — 82 `min-h-11` usages, plus an
  unlayered override raising Leaflet's 26/30px controls to 44px with the CSS
  specificity reasoning documented (`index.css:239-247`).
- **The detector's ACCEPTED list is exemplary.** `design-detect.mjs:28-33`
  accepts one rule with a paragraph explaining why, and marks it RESOLVED when
  the human made the brand decision. An exemption with a reason is a decision; a
  silent one is a shrug.
- **Verified false positives were left alone.** The two `ai-color-palette` hits
  and the `gray-on-color` hit trace to token *names*, not values.

---

## Recommended actions, in priority order

1. **[P1]** `impeccable harden` — announce errors (`role="alert"` +
   `aria-describedby`), add `loading="lazy"`, and code-split the map routes.
2. **[P1]** `impeccable colorize` — fix the three `slate-400` body-text nodes to
   `slate-500`, then design the dark palette over the existing tokens.
3. **[P2]** `impeccable adapt` — real regular-width layout; rail instead of
   bottom nav at ≥768 px.
4. **[P2]** `impeccable animate` — extend `motion-reduce:` beyond the splash.
5. **[P3]** Move the mockups out of `public/`; switch `focus:` →
   `focus-visible:`; trap and restore dialog focus.
6. **[P3]** `impeccable polish` — final pass.

> You can ask me to run these one at a time, all at once, or in any order you
> prefer.
>
> Re-run `impeccable audit` after fixes to see the score improve.
