# Design review: Drop In — Apple HIG

> Run 2026-09-23. Reviewed with the `apple-design` skill
> (`/home/jmeisburg/Projects/skills/apple-design-skill-main/`).
> Scope: **web PWA**, so Apple's *principles* and *foundations* (accessibility,
> color, typography, layout, writing) plus its mobile conventions translated per
> `cross-platform.md`. Evidence is source and tokens, not rendered screenshots —
> every figure below is computed from actual hex values and class names.
>
> References actually opened: `accessibility.md`, `layout.md`, `typography.md`,
> `color.md`, `dark-mode.md`, `designing-for-ios.md`, `tab-bars.md`, `sheets.md`,
> `buttons.md`, `motion.md`, `writing.md`, `feedback.md`, `loading.md`,
> `search-fields.md`, `cross-platform.md`.

## Summary

**Overall rating: Needs work.** A well-built app with an unusually disciplined
design system — a role-based type scale, a documented palette carrying its own
contrast figures in comments, correct dialog semantics, and a `mobile-audit.mjs`
gate that enforces tap targets and contrast. The craft floor is high. What's
missing is one whole axis of the platform and one whole class of accessibility.

**Thesis:** clear and good — *a warm, calm noticeboard for neighborhood
playdates, where the invitation is the object.*

**The thing it will be remembered by:** the terracotta-on-warm-cream palette, a
deliberate move off the indigo SaaS default, reasoned about in
`index.css:100-129`. A real point of view, not a template.

**Systemic gaps:** no dark mode at all, and errors invisible to screen readers.

---

## Critical

### 1. Form errors are never announced to screen readers
**What:** 65 elements render validation and failure text as a plain red
`<p>`/`<span>`. **0** `aria-live` regions and **0** `role="alert"` in the app.
`LoginPage.tsx:418`, `OnboardingPage.tsx:533`, `PlaydateFormFields.tsx:791`,
`LoginPage.tsx:351`.
**Why:** `accessibility.md › Vision`: "Convey information with more than color
alone." `writing.md › Best practices`: "display it as close to the problem as
possible." A screen-reader user taps "Post drop-in", validation fails, and they
hear silence.
**Fix:** `role="alert"` on every error node, linked via `aria-describedby` with
`aria-invalid` on the control. `ReportDialog.tsx:118` already sets `aria-invalid`
— generalize that. Also focus the first invalid field on failed submit.

### 2. `text-slate-400` used for body text — 3.30:1
**What:** `#94867e` computes **3.30:1** on `#fbf7f4`, **3.52:1** on white. Used
at `text-xs` (14px) in `InboxPage.tsx:112`, `:165`, `:837` (timestamps, sender
names), and for secondary text/icons in `PlaceDirectory.tsx:593`, `:685`, `:905`.
The token's own comment (`index.css:134`) says "NOT for body copy".
**Why:** `accessibility.md`: "Up to 17 pts — All — 4.5:1". 3.30:1 is below the
floor at every size.
**Fix:** `text-slate-400` → `text-slate-500` (`#66737a`, **4.59:1**) at those
three Inbox nodes. Non-text glyphs may keep `slate-400` if they carry a name.

### 3. No dark mode whatsoever
**What:** `0` `dark:` variants, `0` `prefers-color-scheme`, `0` `color-scheme`.
`index.html:6` ships one `theme-color` with no dark variant; all ~18 tokens at
`index.css:130-175` are single light-only values.
**Why:** `dark-mode.md › Best practices`: "people often choose Dark Mode as their
default interface style, and they generally expect all apps and games to respect
their preference… they may think your app is broken." `color.md`: "If you define
a custom color, make sure to supply light and dark variants."
**Fix:** `@media (prefers-color-scheme: dark)` re-pointing the same token names,
`color-scheme: light dark` on `:root`, a dark `theme-color` meta, and a dark
`background_color`. **Do not** add an in-app appearance toggle — `dark-mode.md`
explicitly warns against one.

---

## Improvements

| Sev | Finding | Evidence | Principle |
|---|---|---|---|
| **High** | Layout clamped to a phone column at every width | `max-w-md` × 12 (`App.tsx:193,235,254`); only 15 responsive prefixes app-wide, nearly all cosmetic | `layout.md`: "Determine layout based on size classes, not device type or orientation" |
| **High** | "Post" is an action inside the bottom nav | `App.tsx:264` | `tab-bars.md`: "Use a tab bar to support navigation, not to provide actions" |
| **High** | Active tab conveyed by color alone | `App.tsx:360-362` — `text-indigo-600` vs `text-slate-600`, identical weight/size | `accessibility.md`: "Convey information with more than color alone" |
| **Medium** | Nav icons outline-only | `icons.ts:7-15`, `App.tsx:372-386`, `fill="none"` | `tab-bars.md`: "Prefer filled symbols or icons" |
| **Medium** | No unread badge on Inbox | `App.tsx:252-268` | `tab-bars.md`: "Use a badge to indicate that critical information is available" |
| **Medium** | 1 `motion-reduce:` vs 79 transitions | only `SplashScreen.tsx:70` | `motion.md`: "Make motion optional" |
| **Medium** | Dialogs don't trap or restore focus | `activeElement` referenced nowhere in `src/` | `accessibility.md › Mobility` |
| **Medium** | No search anywhere | no `type="search"`, no search route | `search-fields.md`: "Consider showing suggested search terms" |
| **Medium** | No swipe gestures on rows / back | 0 `onTouchStart`/`onTouchMove` | `designing-for-ios.md`: "swipe to navigate back or initiate actions in a list row" |
| ~~Low~~ **RETRACTED** | ~~Mixed button capitalization~~ — **this finding was wrong.** Both cited strings are not buttons: "Add to Home Screen" is instructional prose (`push.ts:181`, `NotificationsSection.tsx:241`) and "Closest to me" is a native `<option>` (`PlaceDirectory.tsx:647`). A V22 audit of every `<button>`/`submitLabel` found **0** title-case labels — the app is already consistently sentence-case. Corrected 2026-09-23. | — | — |

Note the honest caveat on swipe: Low priority for a web PWA, since the browser
owns back-swipe, and `accessibility.md` requires a tap alternative regardless —
which the "Back to today" links (`PlaydateDetailPage.tsx:1393`) already provide.

---

## Craft notes

**The palette is the app's best idea and is genuinely reasoned.** `index.css:100-129`
explains the move off indigo, why terracotta rather than Peanut's coral-red
("that hue is the market's 'app for moms' signal, and Drop In is for both
parents"), and why two terracotta tones exist. I verified the figures: white on
`#e8552f` = **3.64:1**, white on `#c8411c` = **4.97:1**, `#c8411c` on the page
background = **4.66:1**. The reasoning holds.

**The type scale is the second strong decision.** `index.css:3-32` documents
raising the whole scale by redefining tokens rather than editing 250 call sites,
because the de-facto body was 14px when iOS body is 17px. `--text-sm` is now
17px, `--text-xs` 14px, floor 14px — satisfying `typography.md`'s
"Default size 17 pt, Minimum size 11 pt". The display/body split (Bricolage
Grotesque by element for headings, system stack for body) is right, and is what
`typography.md › Using system fonts` and `branding.md` describe.

**Signature element:** the terracotta full-bleed splash, continued frame-for-frame
from static HTML into React so a cold start is brand rather than a white flash.
Real craft, and the one moment of boldness with everything around it quiet.

**Restraint:** 4 tabs, one accent, semantic status tints. `color.md`: "Avoid
using the same color to mean different things" — that holds.

**Remove one accessory:** the header gear (`App.tsx:206-212`) plus the Profile
tab plus Profile's own settings link is three routes to one destination.

---

## What works

1. **Contrast is measured, not eyeballed.** `mobile-audit.mjs` computes WCAG AA
   from rendered pixels (parsing painted colors to survive Tailwind v4's
   `oklch()`); `index.css:125-128` records it catching a real 3.30:1 failure.
2. **Tap targets systematically enforced.** 82 `min-h-11` usages, and
   `index.css:239-247` raises Leaflet's 26/30px controls to 44px with the CSS
   specificity reasoning documented. `buttons.md`: "at least 44x44 pt."
3. **The iOS zoom trap is handled at input-device level.** `index.css:203-209`
   forces 16px inputs under `(pointer: coarse)`, because a landscape phone is
   844px wide and slips past a `max-width` rule. `accessibility.md`'s
   "Adaptable" principle, correctly implemented.
4. **Safe areas are explicit.** `pt-safe`/`pb-safe` (`index.css:184-190`) plus
   `viewport-fit=cover` and a `pb-[calc(6rem+env(safe-area-inset-bottom))]` on
   `<main>`. `layout.md › Guides and safe areas`.
5. **Dialog semantics are real.** All three dialogs have `role="dialog"`,
   `aria-modal`, `aria-labelledby`, focus-on-safe-action, and Escape. Zero
   native `alert()`/`confirm()` in non-test source. `modality.md` satisfied.
6. **Icon-only controls are labelled.** 35 `aria-label` usages covering the gear
   (`App.tsx:209`), lightbox (`ImageLightbox.tsx:72`), map controls
   (`PlaceDirectory.tsx:557,594`), and every profile photo control.
7. **Inputs are properly named** via wrapping `<label>` + `<span>` text
   (`LoginPage.tsx:314-330`) — valid and screen-reader-correct.
8. **Empty states invite action.** `RadiusEmptyState.tsx:109` pairs the message
   with a real button. `writing.md`: "Provide clear next steps."

---

## Platform notes

- **Mobile vs desktop.** Findings 1–3 and the High/Medium items above are
  platform-independent. The `max-w-md` clamp and absent search only bite on
  tablet/desktop widths. Swipe is the only genuinely iOS-specific item, and it's
  Low here.
- **Install context.** Because this installs via `apple-mobile-web-app-capable`
  (`index.html:12`), there is no browser chrome. That raises the stakes on the
  dark-mode finding (no escape to browser UI) and on the tab-bar finding (no
  toolbar to hold the Post action).
- **The existing gates are the right home for these fixes.** `mobile-audit.mjs`
  already checks targets, 16px inputs, overflow, and contrast;
  `design-detect.mjs` runs 61 anti-pattern rules. Adding a `prefers-color-scheme:
  dark` pass and a `role="alert"` presence check would put the top two findings
  under the same automated gate — more durable than hand-fixing.
- **No contradiction with existing decisions.** Nothing here argues against the
  terracotta palette, the raised type scale, or the display/body split. The
  accepted `ai-color-palette` entry in `design-detect.mjs:28-33` stands.

---

**Suggested order:** accessibility (1, 2, motion, dialog focus) → dark mode (3)
→ tab-bar restructure (Post action, active state, filled icons, badge, search)
→ wide-screen layout → polish (capitalization, alt text).
