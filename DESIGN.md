---
name: Drop In
description: A warm neighbourhood noticeboard for low-commitment playdates.
colors:
  page: "#ffffff"
  white: "#ffffff"
  slate-50: "#fbf7f4"
  slate-100: "#f4ece6"
  slate-200: "#eee3dc"
  slate-300: "#ddcec5"
  slate-400: "#94867e"
  slate-500: "#66737a"
  slate-600: "#5a676e"
  slate-700: "#4a575e"
  slate-800: "#3b4a52"
  slate-900: "#2f4858"
  indigo-50: "#fdf1ec"
  indigo-100: "#fbe2d7"
  indigo-200: "#f7c9b4"
  indigo-300: "#f0a686"
  indigo-400: "#ec8259"
  indigo-500: "#e8552f"
  indigo-600: "#c8411c"
  indigo-700: "#a63615"
  indigo-800: "#8a2c11"
  indigo-900: "#7a2710"
  emerald-100: "#e2f0d6"
  emerald-700: "#3f6b28"
  green-700: "#47802e"
  amber-50: "#fef8e8"
  amber-100: "#fdf0cf"
  amber-200: "#f7dfa2"
  amber-700: "#8a6410"
  amber-800: "#6f5009"
  sky-100: "#e2eef7"
  sky-700: "#1d5b7a"
typography:
  display:
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "-0.012em"
  heading:
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.012em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.625rem"
  body-large:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: "1.75rem"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
rounded:
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  full: "9999px"
spacing:
  tight: "8px"
  gap: "12px"
  gutter: "16px"
  touch: "44px"
components:
  button-primary:
    backgroundColor: "{colors.indigo-600}"
    textColor: "{colors.white}"
    rounded: "{rounded.xl}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.indigo-700}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-700}"
    rounded: "{rounded.xl}"
    padding: "0 12px"
    height: "44px"
  button-icon:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-700}"
    rounded: "{rounded.full}"
    size: "44px"
  card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-900}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.slate-800}"
    rounded: "{rounded.xl}"
    padding: "10px 12px"
    height: "44px"
  status-chip:
    backgroundColor: "{colors.emerald-100}"
    textColor: "{colors.emerald-700}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Drop In

## Overview

**Creative North Star: "The Neighborhood Noticeboard"**

Drop In's interface is a noticeboard pinned where the neighbourhood already
walks: terracotta ink on white paper, a handwritten card you read in three
seconds and act on without ceremony. Nothing here is trying to sell anything.
The system's whole job is to make one perishable fact — *this is happening, at
this place, starting then, and you may simply turn up* — legible to a tired
adult holding a phone one-handed, sometimes in the sun.

The aesthetic philosophy follows from that. **Warm, but not soft.** The paper is
white and the borders are visible; the warmth lives in a single committed
terracotta and in a neutral ramp with a brown cast rather than a blue one. **One
voice, raised once.** There is exactly one saturated hue in the product, and it
is spent on the thing the parent should act on. **Measured, not eyeballed.**
Every text token in `src/index.css` carries its own WCAG ratio in a comment, and
`scripts/mobile-audit.mjs` re-measures the rendered pixels and fails the build
below the floor — this is a system that treats contrast as a build error, not a
taste question. **Native by default.** Body copy is the system stack; the
display face appears only where the product needs a voice.

The confirmed visual anti-reference is **indigo SaaS utility**. The palette
comments at `src/index.css:120-149` record the move off it, and
`scripts/design-detect.mjs` keeps the rule. Peanut's *structure* was adopted —
a warm neutral and one committed accent — while Peanut's coral-red was
deliberately rejected as the market's "app for moms" signal, because Drop In is
for both parents. Terracotta is the colour-wheel neighbour that keeps the
temperature without borrowing the meaning.

**Key Characteristics:**

- White page, warm-cast neutral ramp, one terracotta accent.
- Two terracotta tones with different jobs: `indigo-500` is the brand hue,
  `indigo-600` is the action/text tone.
- A role-based type scale whose `text-sm` is 17px body copy, not "small".
- Flat cards defined by a border; shadow is reserved for things that float.
- 44px tap targets and a 16px text-control floor, enforced by a script.
- Motion is colour-only by default, and every transition is cancelled under
  `prefers-reduced-motion`.
- A phone-width column at every viewport; wide screens get a rail, not a
  different layout.

## Colors

One committed accent on a warm-cast neutral ramp, with three semantic status
tints that never compete with it.

> **Read this before touching a colour class.** The terracotta tokens are named
> `--color-indigo-*`. The *names* are legacy; the *values* are terracotta.
> `bg-indigo-600` is a deep rust, not indigo. This was implemented by overriding
> the stock Tailwind scales in `src/index.css:213-222` rather than editing ~450
> call sites, so every contrast relationship the components were designed around
> survived the rebrand. Do not "fix" the names, and do not add a real indigo.

### Primary

- **Terracotta Brand Hue** (`#e8552f`, `indigo-500`): the logo mark, the icon,
  the boot splash, and large decorative fills — anything that is *identity*
  rather than *action*. It reaches only 3.64:1 as text or under white text, so
  it never carries a label.
- **Terracotta Action Tone** (`#c8411c`, `indigo-600`): filled primary buttons,
  links, and the accent text on a card's footer action. It exists because the
  brand hue fails AA in that role: `#c8411c` is 4.97:1 on the page background
  and 4.97:1 reversed.
- **Terracotta Deep** (`#a63615`, `indigo-700`): the hover fill for a primary
  button, and emphasis text. 6.65:1 on the page.

### Tertiary

Status tints. Each pairs a light tint background with a dark text tone, and each
means exactly one thing (`src/index.css:224-238`).

- **Park Green** (`#e2f0d6` / `#3f6b28`, `emerald-100` / `emerald-700`):
  "Happening now" and the host status chip. 5.28:1 on its own tint.
- **Going Green** (`#47802e`, `green-700`): the "I'm going" / "Going" pill fill,
  white on green at 4.78:1.
- **Gold** (`#fdf0cf` / `#8a6410`, `amber-100` / `amber-700`): "Starts soon".
  4.74:1 on its own tint. `amber-50` / `amber-800` is the quieter pairing used
  by well panels (`WhileAwayCard`, `NotificationsSection`, onboarding).
- **Sky** (`#e2eef7` / `#1d5b7a`, `sky-100` / `sky-700`): the "Rain likely"
  forecast badge only. 6.29:1 on its own tint.

### Neutral

The ramp has a **brown cast, not a blue one** — that is what makes a white page
feel warm. Every figure below is measured against the current page background,
`#ffffff`.

- **Page** (`#ffffff`, `page`): the screen background. It is its own token, not
  `slate-50`, precisely so the 38 fill/hover sites on white cards keep working —
  see the reversal recorded at `src/index.css:150-174`.
- **Warm Fill** (`#fbf7f4`, `slate-50`): the quiet hover tint and inert wells.
  47 call sites. **Not the page.**
- **Inert Tint** (`#f4ece6`, `slate-100`): inert chips, e.g. "Ended".
- **Hairline Border** (`#eee3dc`, `slate-200`): the default border on cards and
  the bottom nav.
- **Strong Border** (`#ddcec5`, `slate-300`): inputs and secondary buttons.
- **Lowest Emphasis** (`#94867e`, `slate-400`): 3.52:1 — **not for body copy**.
  Decorative glyphs and icons that carry a name only.
- **Meta Text** (`#66737a`, `slate-500`): timestamps, sender names, captions.
  4.89:1.
- **Most-Used Tone** (`#5a676e`, `slate-600`): secondary labels. 5.83:1.
- **Body Copy** (`#4a575e`, `slate-700`): 7.46:1.
- **Emphasis** (`#3b4a52`, `slate-800`): 9.18:1.
- **Headings** (`#2f4858`, `slate-900`): 9.59:1.

**Errors are not brand.** The `red-*` scale is deliberately left at Tailwind's
stock values — semantic, never themed. Borders use `red-300`/`red-400`, text
`red-600`/`red-700`.

### Dark appearance

Dark mode re-points **the same token names** under `:root[data-theme='dark']`
(`src/index.css:281-369`), so no component knows which appearance it is in. The
frontmatter above is the light default; these are the dark values.

| Token | Dark value | Note |
|---|---|---|
| `page` | `#181412` | warm near-black, never pure `#000` |
| `slate-50` | `#181412` | the dark page and the darkening hover tint |
| `slate-100` | `#3a312b` | inert chips |
| `slate-200` | `#4a4038` | default border |
| `slate-300` | `#5c5047` | strong border |
| `slate-400` | `#9d8f86` | 5.84:1 page / 5.21:1 card |
| `slate-500` | `#b0a69d` | 7.66:1 page |
| `slate-600` | `#c6bdb4` | 9.88:1 page |
| `slate-700` | `#dbd2c9` | body copy, 12.26:1 page |
| `slate-800` | `#ebe3da` | 14.41:1 page |
| `slate-900` | `#f7f2ec` | headings, 16.44:1 page |
| `indigo-500` | `#e8552f` | the brand hue does not move |
| `indigo-600` | `#f07a52` | **lighter**, because its role flips to text/links |
| `indigo-700` | `#f28b64` | 7.54:1 page |
| `emerald-100` / `700` | `#26331e` / `#9fd07e` | 7.49:1 on its own tint |
| `amber-50` / `100` / `200` | `#2a2415` / `#332c1a` / `#4a3f26` | dark tints |
| `amber-700` / `800` | `#e0bd6a` / `#d4ad52` | 7.69:1 / 7.27:1 |
| `sky-100` / `700` | `#1c2a33` / `#7cc4e8` | 7.64:1 on its own tint |

Three CSS-level overrides complete it, all deliberately token-level rather than
call-site edits: `.bg-white` becomes the dark card surface `#241f1c`;
`.bg-indigo-600.text-white` flips its label to `#181412` (because white on the
lighter action fill is only 2.76:1); and `#boot-splash` becomes `#181412` so a
stored-dark parent never sees a terracotta flash on a cold load.

Appearance is a **user choice**, not an OS follow: light is the default,
`dark` is an explicit opt-in, and "Match my phone" (`system`) is a stored third
choice — see `src/lib/theme.ts`. `color-scheme` follows the chosen theme so form
controls and scrollbars agree.

### Named Rules

**The One Voice Rule.** There is exactly one saturated hue in the product. It is
spent on the single action a parent should take and on the brand mark. If a
screen has two competing accents, one of them is wrong — the status tints are
tints, and they are the only other colour allowed.

**The Two Tones Rule.** `indigo-500` is identity; `indigo-600` is action and
text. Never put a label on `-500` (3.64:1) and never use `-600` for a large
decorative fill (it turns the accent into a surface). A fill under white text
uses `-600`; a logo or splash uses `-500`.

**The Measured Rule.** Every text colour in the system has its contrast ratio
recorded next to its value in `src/index.css`, and `scripts/mobile-audit.mjs`
re-measures the painted pixels. A new colour is not added until its ratio on the
page — and on its own tint, where it has one — is written down.

## Typography

**Display Font:** Bricolage Grotesque (self-hosted woff2, `font-weight: 400 800`
variable, `font-display: swap`)
**Body Font:** the system stack — `-apple-system, BlinkMacSystemFont, 'Segoe UI',
Roboto, 'Helvetica Neue', 'Noto Sans', Arial, sans-serif`

**Character:** a warm, slightly quirky grotesque for headings against the
parent's own operating system for everything they read. Identity lives in the
display face; reading text stays native on both iOS and Android. The display
face is attached **by element** (`h1, h2, h3` at `src/index.css:78-83`), so every
page gets it without a single component opting in, with tracking tightened to
`-0.012em` so it reads as a display face rather than as larger body text.

### Hierarchy

The scale is **defined by role, not by relative name** — and it was raised on
purpose, because the first phone feedback was "the text is just too small all
over the place" (`src/index.css:3-32`). In this codebase **"sm" means body
copy**, not "small":

- **Page Heading** (`600`, `1.625rem` / 26px, `2rem` / 32px, tracking
  `-0.012em`): the one heading at the top of a page. `text-xl` on an `h1`.
- **Section / Card Title** (`600`, `1.3125rem` / 21px, `1.75rem` / 28px):
  section headers and card headlines. `text-lg` on an `h2`/`h3`.
- **Lead** (`400–500`, `1.125rem` / 18px, `1.75rem` / 28px): a form control's
  own text and short lead-in copy. `text-base`.
- **Body** (`400`, `1.0625rem` / **17px** — iOS body size, `1.625rem` / 26px):
  the default voice; feeds, addresses, message text, dialogs. `text-sm`.
- **Label / Meta** (`500`, `0.875rem` / 14px, `1.25rem` / 20px): status chips,
  timestamps, captions, secondary rows. `text-xs`.

Line heights are declared **with** the sizes (`--text-*--line-height` in the
`@theme` block), because raising a font size without its leading is what makes
bumped type look cramped.

Weights in practice: `font-medium` (234 uses) for controls, buttons, labels and
meta; `font-semibold` (102 uses) for headings and emphasis; `font-bold` is
effectively absent (6 uses). Nothing is uppercase.

### Named Rules

**The "sm" Means Body Rule.** `text-sm` is 17px body copy; `text-xs` is 14px and
is the **floor**. Nothing in the product renders below 14px, and
`scripts/mobile-audit.mjs` fails the build if anything does.

**The Element Rule.** The display face belongs to `h1`, `h2` and `h3`, never to
a size utility. If something needs Bricolage, it should be a heading; if it is
not semantic enough to be one, it does not get the display face.

**The Native Reading Rule.** Body copy is never set in Bricolage. Reading text —
addresses, message bodies, form values — stays on the system stack, because a
parent reads this outdoors and the platform's own face is the one their eyes are
tuned to.

## Layout

**A single phone-width column at every viewport.** The content measure is
`max-w-md` (448px) on phones and is *capped* rather than expanded on wide
screens: the shell becomes a grid at `md` (768px) —
`md:grid-cols-[4.5rem_minmax(0,1fr)]` (`src/App.tsx:429`) — so the nav becomes a
72px left rail and the content keeps its phone measure in the remaining column.
Cards are additionally `md:max-w-md` inside the feed's `max-w-3xl` list column,
so a 768px-wide screen gets whitespace, not longer lines
(`src/components/DropInCard.tsx:322-334`). There are **no `lg:` or `xl:`
breakpoints in the app at all**.

- **Header:** `pt-safe sticky top-0 z-10 border-b border-slate-200 bg-white`,
  inner content `mx-auto w-full max-w-md px-4 py-1 md:max-w-none`
  (`src/App.tsx:433-435`).
- **Bottom navigation (phone):** `pb-safe fixed inset-x-0 bottom-0 z-10 border-t
  border-slate-200 bg-white`; at `md` it becomes `md:sticky md:top-16 md:z-0
  md:h-[calc(100dvh-4rem)] md:border-r md:border-t-0` — the same markup, a
  different edge (`src/App.tsx:487`).
- **Safe areas are explicit, never assumed.** `viewport-fit=cover` plus the
  `pt-safe` / `pb-safe` utilities (`src/index.css:377-383`) and a
  `pb-[calc(6rem+env(safe-area-inset-bottom))]` on `<main>`, so the notch and the
  home indicator are padded rather than guessed at.
- **Spacing rhythm:** Tailwind's 4px step. The reused values are `gap-2` (8px)
  inside a control cluster, `gap-3`/`px-3` (12px) for control padding,
  `gap-4`/`p-4` (16px) between cards and inside a card body. Vertical rhythm in
  the feed is `gap-4` between cards, `gap-2` inside one.
- **Horizontal padding of page content is 16px** (`px-4`), scaled by nothing.

### Named Rules

**The One-Column Rule.** The layout is a phone column. Widening the viewport
gives the column air and moves the navigation to the side; it never lengthens a
line of body copy. A desktop layout with a second content column has to be a
product decision, not a breakpoint.

**The 44px Floor Rule.** Every control a thumb can hit is at least 44×44px —
`min-h-11`, `min-w-11`, `h-11 w-11` (187 uses across 40 files), including
third-party map controls, which are raised in CSS with documented specificity
reasoning (`src/index.css:404-440`). Nothing interactive is exempt, including
popup close buttons (`src/index.css:566-588`).

**The 16px Control Rule.** Every text input, textarea and select renders at
16px under `(pointer: coarse)` or `max-width: 640px` (`src/index.css:396-402`).
It is keyed on the **input device**, not the viewport, because a landscape phone
is 844px wide and would slip past a width rule; iOS Safari zooms the viewport
when a focused control is smaller than that.

## Elevation & Depth

**The system is flat at rest and uses borders, not shadows, to separate
content.** A card's edge is a 1px `slate-200` hairline; there is no ambient
shadow under a list or a card, which is what lets a 24-card feed stay calm.
Depth is a *state*, not a decoration: `shadow-sm` (61 uses) appears only on
small floating controls that must lift off a busy surface — the round back
button (`src/components/BackControl.tsx:51`), inline chip buttons — and
`shadow-lg` / `shadow-xl` (10 uses total) are reserved for genuinely floating
layers: the modal panel (`src/components/ModalShell.tsx:168`), the image
lightbox, and the map popup panel. A modal also earns its depth from a
`bg-slate-900/40` backdrop rather than from a heavier shadow.

### Shadow Vocabulary

- **`shadow-sm`** (`0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`):
  the resting lift for a circular icon control sitting on content.
- **`shadow-lg`** (`0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`):
  the modal / overlay panel.
- **`shadow-xl`** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`):
  the lightbox and the map's floating panel.
- **Map popup wrapper** (`0 4px 16px rgb(15 23 42 / 0.18)`, `src/index.css:457-460`):
  the one hand-authored shadow, on a Leaflet-owned element the token system
  cannot reach.

### Named Rules

**The Flat-By-Default Rule.** Cards and rows are flat and bordered at rest. A
shadow appears only when an element genuinely floats above the page — an
overlay, a lightbox, or a control sitting on top of imagery. "It looked a bit
plain" is not a reason to add one.

**The Two-Shadow Rule.** There are two elevation steps in this product:
inline-control (`shadow-sm`) and overlay (`shadow-lg`/`shadow-xl`). If a new
surface seems to need `shadow-md`, it is really one of those two.

## Shapes

**One radius carries the product.** `rounded-xl` (0.75rem / 12px) is the default
for anything with a body — cards, buttons, inputs, panels, wells — at 241 uses,
and it is what makes the interface read as friendly rather than technical. The
second shape in the language is the **pill**: `rounded-full` (96 uses) is
reserved for things that are round by nature — status chips, the "Going" pill,
avatars, circular icon buttons, the unread dot. `rounded-md` (0.375rem, 18
uses) appears on small inline controls inside dense settings lists, and
`rounded-lg` (0.5rem, 13 uses) on icon buttons inside a dialog header.
`rounded-2xl` (1rem, 8 uses) is used for larger panels and sheets.

There is no border-radius token in the `@theme` block — the app uses Tailwind's
stock radius scale deliberately, so a designer reading a class name sees the
same number a Tailwind-aware tool does.

Silhouette is otherwise quiet: 1px hairlines, no double borders, no decorative
frames, no gradients, no clipped geometry. The one geometric signature is
**full-bleed**: the boot splash is edge-to-edge terracotta, and the feed's cards
sit on a white page with no page-level container chrome.

### Named Rules

**The `rounded-xl` Default Rule.** If a surface holds content or is a control,
it is `rounded-xl`. Reach for another radius only when the shape is
semantically round (a pill, an avatar, a dot) or when the element is a small
inline control inside an already-rounded container.

**The Pill Means Status Rule.** A pill is never a content container. If
something is `rounded-full` and it is not a chip, an avatar, a dot, or an
icon-only button, it is wrong.

**The Full-Bleed Rule.** The page has no frame. Colour reaches the edge of the
screen on the splash and in the bottom nav; nothing draws an outer border around
the app.

## Components

The character is **plain and roomy**: generous padding, 44px targets, one
radius, borders instead of shadows, and feedback expressed as a colour change.

### Buttons

- **Shape:** `rounded-xl`, `min-h-11` (44px), `text-sm font-medium`,
  `transition-colors motion-reduce:transition-none`, `disabled:opacity-50`.
- **Primary:** `bg-indigo-600 text-white px-4` — the action tone, never the
  brand hue. Hover deepens to `hover:bg-indigo-700` where a hover state exists
  (7 sites); many primary buttons have no hover change at all, which is
  deliberate on touch-first surfaces.
- **Secondary:** `border border-slate-300 bg-white text-slate-700 px-3`, hover
  `hover:bg-slate-50`.
- **Destructive:** the secondary shape with `border-red-300 text-red-700`, or
  `hover:text-red-600` as a text action. Destructive actions are never filled
  red.
- **Icon-only:** `h-11 w-11 rounded-full border border-slate-300 bg-white
  text-slate-700 shadow-sm`, hover `hover:bg-slate-50` — the back control is the
  canonical one (`src/components/BackControl.tsx:49-52`).
- **Pill / RSVP:** `rounded-full border px-3 min-h-11 text-sm font-medium`, used
  for "I'm going" where the state is the label's meaning
  (`src/components/DropInCard.tsx:593`).
- **Press feedback is minimal:** `active:scale-95` appears twice in the whole
  app. Feedback is colour and state, not animation.

### Chips

- **Status chip:** `rounded-full bg-<tint>-100 px-2 py-0.5 text-xs font-medium
  text-<tint>-700` — `emerald` for "Happening now", `amber` for "Starts soon",
  `slate` for "Ended" / "Cancelled" (`src/components/DropInCard.tsx:377-389`).
  A chip is 14px text in a pill, never a filled button.
- **Filter chips** are the same pill with a border, and selection is carried by
  `border-indigo-500 ring-2 ring-indigo-200` rather than by fill alone
  (`src/components/PlacesMapView.tsx:482`).

### Cards / Containers

- **Corner Style:** `rounded-xl`.
- **Background:** `bg-white` on the white page (the dark-mode override re-points
  `.bg-white` to `#241f1c`, so "white" means "card surface" in both themes).
- **Border:** `border border-slate-200`, with the hover state shifting the border
  to `border-indigo-300` rather than moving the card — `transition-colors
  motion-reduce:transition-none hover:border-indigo-300`
  (`src/components/DropInCard.tsx:332`).
- **Shadow Strategy:** none at rest. See Elevation & Depth.
- **Internal Padding:** the body is a `block p-4` link; a footer action row sits
  under a `border-t border-slate-100` hairline at `px-4 py-2` with the action
  text in `text-indigo-600` (`DropInCard.tsx:364`, `:644`).
- **Past content recedes by opacity**, not by becoming a different card: a
  finished or cancelled drop-in is the same card at `opacity-60`.

### Inputs / Fields

- **Style:** `min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5`,
  text at `text-base` (18px) with `text-slate-800`; a select's chosen value is
  `text-indigo-700 font-medium` to read as a decision
  (`src/components/PlaydateFormFields.tsx:362`).
- **Focus:** the default outline is removed and replaced everywhere by
  `focus-visible:ring-2` — `ring-indigo-200` (39 sites) on light surfaces,
  `ring-indigo-500` (29 sites) where a stronger ring is needed — usually paired
  with `focus-visible:border-indigo-500`. `scripts/focus-indicator-check.mjs`
  runs in `npm run verify` as `a11y:focus`, so a control without a visible focus
  ring fails the gate.
- **Error:** the border turns `border-red-400` and the message is rendered with
  `role="alert"` (38 sites) so it is announced, not merely shown; the control
  takes `aria-invalid`.
- **Status text** uses `role="status"` (13 sites) — the "Removed. Undo" line is
  the pattern (`src/components/UndoLine.tsx:28-32`).

### Navigation

- **Style:** a bottom tab bar on phones — `fixed inset-x-0 bottom-0` with a
  `border-t border-slate-200` hairline on `bg-white`, safe-area padded
  (`src/App.tsx:487`).
- **At `md` it becomes a left rail:** the same `<nav>` switches to
  `md:sticky md:top-16 md:z-0 md:h-[calc(100dvh-4rem)] md:border-r md:border-t-0`
  inside a `md:grid-cols-[4.5rem_minmax(0,1fr)]` shell.
- **Typography and states:** labels at `text-xs`, active state carried by
  colour plus an icon change — not by colour alone.
- **The centre action:** the Post affordance sits in the middle of the tab bar
  as a brand-hue mark, not as a fourth tab (the nav supports navigation; Post is
  an action, and the founder overrode the opposite convention on purpose —
  `src/App.tsx:494-509`).

### Modal / Sheet

One portal shell owns every dialog (`src/components/ModalShell.tsx`): a
`bg-slate-900/40` backdrop, a `w-full max-w-sm rounded-xl border border-slate-200
bg-white p-4 shadow-lg` panel at `z-50`, `role="dialog"` + `aria-modal` with a
real `aria-labelledby`, a focus trap, Escape and backdrop dismissal that both
yield while a write is in flight, a body scroll lock, and a top-right dismiss
control at `min-h-11 min-w-11 rounded-lg text-slate-500`. It enters with
`animate-modal-pop` — 140ms, `opacity 0→1` and `scale(0.96)→scale(1)`,
`ease-out` — cancelled at the call site by `motion-reduce:animate-none`.
Larger surfaces (place picker, photo admin) use the same language at
`rounded-2xl`. Native `alert()`/`confirm()` appear nowhere in product source.

### Motion

- **The default transition is colour only:** `transition-colors` (117 sites),
  each paired with `motion-reduce:transition-none` (120 sites). Tailwind's
  default duration and easing apply (150ms,
  `cubic-bezier(0.4, 0, 0.2, 1)`); the only authored animation is
  `animate-modal-pop` at 140ms `ease-out`.
- Anything JS-driven reads the preference through
  `src/components/usePrefersReducedMotion.ts`; the splash (300ms) is the one
  longer moment, and it is the brand's arrival, not decoration.

### Signature: the boot splash

A full-bleed terracotta frame (`#e8552f`) rendered in `index.html` before any
CSS loads, carrying the logo mark, then handed frame-for-frame to the React
splash so a cold start is brand rather than a white flash. A stored-dark parent
gets `#181412` instead, via the `#boot-splash` override
(`src/index.css:359-368`). It is the one place the brand hue fills the screen —
and the reason `indigo-500` must stay unaltered in both themes.

## Do's and Don'ts

### Do:

- **Do** keep `text-sm` as body copy at 17px and `text-xs` as the 14px floor. If
  something feels too big, it is usually the padding, not the type.
- **Do** use `indigo-600` for a filled action and `indigo-500` for the mark,
  splash, and large identity fills — and record the contrast ratio in
  `src/index.css` beside any new text colour.
- **Do** give every control `min-h-11` (or `h-11 w-11`), including icon-only
  ones; Map and Leaflet controls are not exempt and are fixed in CSS.
- **Do** use `rounded-xl` for anything with a body and `rounded-full` only for
  status chips, pills, avatars, dots and circular icon buttons.
- **Do** separate content with a 1px `slate-200` border at rest; use
  `shadow-sm` only for a control that genuinely floats, and `shadow-lg`/`xl` only
  for overlays.
- **Do** convey state with a border, ring or icon change as well as colour —
  active tab, selected chip and error field all do.
- **Do** attach the display face by making something a real `h1`/`h2`/`h3`.
- **Do** pair every `transition-*` with `motion-reduce:transition-none`, and
  every `animate-*` with `motion-reduce:animate-none`.
- **Do** announce state changes: `role="alert"` for errors, `role="status"` for
  outcomes like "Removed. Undo".

### Don't:

- **Don't** add a second accent hue. The status tints (`emerald`, `green`,
  `amber`, `sky`) are semantics, not a palette; they are never used
  decoratively and never as an action colour.
- **Don't** rename the `indigo-*` tokens or "correct" them to real indigo —
  their values are terracotta and `src/index.css:120-149` records why.
- **Don't** use `slate-50` (`#fbf7f4`) as a page background. The page is
  `--color-page` (`#ffffff`, `#181412` in dark); `slate-50` is the fill/hover
  tint on white cards, and re-pointing it drags 38 surfaces with it.
- **Don't** set body copy in Bricolage, or render any text below 14px.
- **Don't** use `slate-400` (`#94867e`, 3.52:1) for body copy — `mobile-audit`
  will fail it, and its own comment says so.
- **Don't** put white text on an `indigo-500` fill (3.64:1) or trust white on
  the dark-mode `indigo-600` fill (2.76:1 — the shell flips that label to
  `#181412`).
- **Don't** theme the `red-*` scale: it is semantic error colour and stays at
  Tailwind's stock values in both appearances.
- **Don't** introduce a second elevation step, an outer page frame, or a
  gradient — the system is flat, borderless-at-the-edge, and unshaded by
  default.
