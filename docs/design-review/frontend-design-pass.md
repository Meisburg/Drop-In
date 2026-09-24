# Frontend-design pass — Drop In mobile UI/UX

> Run on `fm/drop-in-mobile-ui-ux`. Lens: Anthropic's `frontend-design` plugin
> (`skills/frontend-design/SKILL.md`). This document is the design pass Phase A
> requires: the subject-matter grounding, the **rendered** current state, the
> chosen direction, the token/type/layout plan, and a ranked change list with
> evidence. Phase B implements the items that need no product-owner decision.
>
> Rendered evidence: `docs/design-review/before/` and `docs/design-review/after/`
> — 390×844 and 320×812, light and dark, on a real built bundle served on port
> 4191 (not the shared 4173 lane) and signed in with a throwaway `e2e-*` marker.

## 1. Subject-matter grounding

Drop In is **a noticeboard for one afternoon, in one neighborhood**. A parent
who has run out of ideas posts a low-commitment invitation — a time, a place,
"come by if you like" — and another parent nearby decides to show up. The
content is *perishable* ("now" and "soon" matter and decay within hours) and
*place-centric* (a park, a pool, a library carry meaning an address does not).
The reader is a tired adult holding a phone one-handed, sometimes in bright
daylight, sometimes at night, often while supervising a child. The app is a PWA
with no browser chrome, so its own type, color, and rhythm are the whole
experience.

That subject is what the design has to sound like. A noticeboard is not a
dashboard: its notices are read in the order a person needs them — *what's on
now → where → who's going* — and the board itself should disappear behind the
notices.

## 2. The rendered current state (looked at, not inferred)

Screenshots at `docs/design-review/before/`. What the pixels actually show:

- **Every route opens with the same chrome.** Feed, Places, Profile, Settings,
  and Inbox all begin with an identical device: a rounded gradient card
  (`from-indigo-50 via-white to-slate-50`), an 8×8 terracotta-tinted icon tile,
  the page `h1`, and a tagline. It is the single most-repeated element in the
  app and reads as template chrome rather than as the page's own voice.
- **The header card is visibly broken in dark mode.** `via-white` is not
  re-pointed by the dark token block (which only overrides `.bg-white`), so the
  "Near you" card renders as a glaring white→grey gradient on the dark page.
  See `docs/design-review/before/feed-dark-390.png`.
- **The feed is card-kit.** A white rounded card with `shadow-sm`, a title, a
  green pill, and four stacked lines (age, place, `time · distance`, host),
  separated by a hairline, then a pill button and a `More info ›` line. The
  time — the perishable fact the product is built around — is buried inside a
  mixed meta line at the same weight as everything else.
- **Day grouping is an all-caps eyebrow.** "TODAY" is `uppercase tracking-wide`
  at 14px, exactly the tracked-out label the skill lists as a generated-UI tell.
  The DOM text is "Today"; only CSS shouts it.
- **The bottom nav wraps when a tab is active.** "Drop Ins" set at `font-semibold`
  does not fit one line at 320px and breaks to "Drop" / "Ins"; at 390px it also
  breaks in some font-load states. See `before/feed-light-320.png`.
- **Copy breaks the brand's own sentence-case rule.** Settings renders
  "Add Drop In to your Home Screen" (title case) in two places, against
  `PRODUCT.md`'s explicit "sentence case … the app's current mix is a defect".
- **Empty and loading states are honest but plain.** Inbox's empty state is a
  real invitation with a button; Profile's is a centered "No posts yet." in a
  bordered card; the feed's loading is a bare centered "Loading…".

The palette, the raised type scale, the display/body split, the measured
contrast gate, the tap-target floors, and the boot splash are all genuinely
good and unchanged by this pass. Two detector false positives
(`ai-color-palette`, `gray-on-color`) were re-verified against the tree at this
branch point and are **left alone**: `--color-indigo-600` is `#c8411c`
terracotta, not purple.

## 3. The chosen direction, and the one memorable quality

**Direction — "the noticeboard, not the dashboard."** Strip the repeated
decorative chrome and let the display face and the content's real hierarchy
carry every screen. A page header becomes a printed notice heading: the screen's
name in Bricolage, left-aligned, with no box, no gradient, no icon tile. The
feed's day label is set the same way, so "Today" reads as the top of a list
rather than as a badge. The time a drop-in happens becomes the loud fact in each
card. Cards lose the uniform grey shadow and stand on their border, like paper
on a board.

**The one memorable quality — the time-forward feed.** Open the app and the
first loud thing your eye lands on is *when* something is on, set in the
display face, with a live marker beside it. Everything around it stays quiet.
This is the skill's "spend your boldness in one place": the feed's time is the
boldness; the chrome is what gets removed.

**Why this is not the generic default.** The control the skill describes is a
warm-cream page with a high-contrast serif and a terracotta accent — which is
*already this app's committed brand* (terracotta `#e8552f` on warm off-white
`#fbf7f4`), documented and reasoned about in `src/index.css`. So the risk here is
not inventing that look; it is that a warm-cream/terracotta palette with a
repeated rounded-card kit slides into the SaaS-card tell. The deliberate move is
therefore *subtractive and typographic*: remove the card-kit chrome and the
all-caps eyebrows, and let the existing display face do the work. That is
specific to this brief — a noticeboard for perishable neighborhood plans — and
would not be the right answer for, say, a finance dashboard.

**Against the generic-prompt control.** Asked generically to "make a
neighborhood playdate app look better," the default output is: keep every card,
add a gradient hero, accent one word in a headline, and add entrance animations.
This pass does the opposite — it deletes the gradient header, deletes the icon
tiles, avoids accenting a single word, and adds no entrance motion.

## 4. Token / type / layout plan

**Color — no new tokens; one defect removed.** Keep terracotta `#e8552f` /
`#c8411c`, the warm neutral ramp, and the park-green / gold / sky status tints
exactly as they are. The dark-mode gradient defect is fixed by *removing* the
gradient (`via-white` was the un-re-pointed value), not by adding a dark token.

**Type — the existing faces, a sharper hierarchy.**
- Masthead `h1`: Bricolage Grotesque, `text-xl` (26px), `font-semibold`,
  `text-slate-900`, left-aligned; tagline `text-sm` `text-slate-600`.
- Day label: Bricolage Grotesque, `text-lg` (21px), `font-semibold`,
  sentence case, no uppercase/tracking.
- Card title: already Bricolage via the global `h1,h2,h3` rule at `text-base`
  (18px) — unchanged.
- Card meta: window elevated to `text-slate-900 font-semibold`; place and host
  stay on `text-slate-700` / `text-slate-600`.
- Body stays the system stack, as `PRODUCT.md` commits.

**Layout — one left-aligned column, borders instead of shadows.**
- Content stays in the existing `max-w-md` phone measure (desktop layout is out
  of scope; the `md:` two-column shell is untouched).
- Remove `shadow-sm` from the feed card and from the header/empty-state surfaces
  where a uniform soft shadow is only kit; keep the hairline border and the warm
  background for separation.
- The bottom-nav label must not wrap: `whitespace-nowrap` with tightened
  horizontal padding, verified at 320px by `mobile-audit.mjs`.

**Motion.** No new motion. Action feedback stays; non-user-triggered entrances
are deliberately absent.

**Writing.** Sentence case everywhere, including the two settings strings that
broke it.

## 5. Ranked change list (with evidence)

Ordered by value per unit of risk. Items marked **implemented** are Phase B;
**verified fixed** means re-checked against the tree at this branch point and
found already done, so not re-touched.

| # | Change | Evidence | Status |
|---|---|---|---|
| 1 | De-card the page masthead (`SectionHeader`): drop the gradient, the border, and the icon tile; set the `h1` in Bricolage at 26px. Fixes the dark-mode gradient defect in the same edit. | `before/feed-dark-390.png` (glaring white gradient), `before/{feed,browse,profile,settings,inbox}-light-390.png` (same card five times) | implemented |
| 2 | Feed day labels: `uppercase tracking-wide text-sm` → Bricolage sentence-case `text-lg`. DOM text unchanged ("Today"). | `before/feed-light-390.png` ("TODAY") | implemented |
| 3 | Feed card: elevate the time window to the loud meta line; drop the uniform `shadow-sm` so cards stand on their border. | `before/feed-light-390.png` (time buried at equal weight) | implemented |
| 4 | Bottom-nav label: stop "Drop Ins" wrapping to two lines when active. | `before/feed-light-320.png`, `before/feed-dark-390.png` | implemented |
| 5 | Settings copy: "Add Drop In to your Home Screen" → sentence case. | `before/settings-light-390.png` | implemented |
| 6 | Profile's "No posts yet." empty state — de-card the centered shrug into a quiet left-aligned line. | `before/profile-light-390.png` | implemented |
| 7 | Errors never announced (`role="alert"`, `aria-describedby`, `aria-invalid`) | source + `MASTER-IMPROVEMENTS.md` A1 | **verified fixed** — 29 `role="alert"` nodes on the tree; not re-fixed |
| 8 | Low-contrast `text-slate-400` Inbox nodes | `MASTER-IMPROVEMENTS.md` A4 | **verified fixed** — Inbox nodes re-pointed to `slate-500`; not re-fixed |
| 9 | Dark mode | `MASTER-IMPROVEMENTS.md` A2 | **verified fixed** — ships as a user choice via `data-theme` in `src/index.css` + `/settings`; not redone |
| 10 | Focus trap/restore in dialogs | `MASTER-IMPROVEMENTS.md` A6 | **verified fixed** — `FocusTrap` wired into all three dialogs; not re-fixed |
| 11 | Reduced-motion beyond the splash | `MASTER-IMPROVEMENTS.md` A6 | **verified fixed** — 84 `motion-reduce:` sites; not re-fixed |
| 12 | `focus:` → `focus-visible:` | `MASTER-IMPROVEMENTS.md` A7 | **verified fixed** — 109 `focus-visible:`, zero bare `focus:`; not re-fixed |
| 13 | Mockups out of `public/` | `MASTER-IMPROVEMENTS.md` A3 | **verified fixed** — no mockup HTML in `public/`; not re-fixed |
| 14 | Desktop/regular-width layout | out of scope | not attempted |
| 15 | Move "Post" out of the tab bar | out of scope | **verified already moved** — the nav is Feed/Inbox/Places/Profile; `/new` lives on the feed |
| 16 | Logo mark / DM unread dot | other lanes own these surfaces | not touched |

### Explicitly not done (and why)

- **No brand-level re-direction.** Direction 3 keeps the committed palette and
  faces; a re-direction is a product-owner decision and is escalated, not taken.
- **No second appearance toggle** — `/settings` already owns appearance.
- **No new runtime dependency.** Every change uses the existing stack.
- **The two detector false positives** (`ai-color-palette`, `gray-on-color`) are
  left alone; they trace to token *names*, not values.

## 6. Phase B results

**Implemented** (all within the existing brand direction, no new dependency):

1. `src/components/SectionHeader.tsx` — de-chromed page masthead. No box, no
   gradient, no icon tile; the `h1` is Bricolage at 26px with the tagline under
   it. The dark-mode gradient defect is gone because the gradient is gone.
2. `src/pages/FeedPage.tsx` — day label is now Bricolage sentence case at 21px
   (DOM text still "Today", so `feed-ended-out.e2e.ts`'s `toHaveText('Today')`
   is unaffected).
3. `src/components/DropInCard.tsx` — the time window is wrapped in its own
   `font-semibold text-slate-900` span so "when" is the loud meta line; the
   uniform `shadow-sm` is removed so cards stand on their border. Text content
   is byte-identical, so the specs that pin the meta line still read the same
   string.
4. `src/App.tsx` — `NavTab` stacks icon over label at every width (matching its
   own V6 doc comment, which had drifted from the horizontal code) and the label
   is `whitespace-nowrap`. The four tabs now fit one line each at 320px with 0px
   overflow; previously "Drop Ins" broke to two lines and the row clipped.
5. `src/components/NotificationsSection.tsx` — "Add Drop In to your Home
   Screen" → "Add Drop In to your home screen" (two sites), restoring the
   brand's sentence-case rule documented in `PRODUCT.md`.
6. `src/components/ProfileView.tsx` — the "No posts yet." empty state is a
   quiet left line rather than a centered bordered card.

**The repo's own phone-level gates, run fresh after the change:**

- `npm run verify` → **EXIT 0.** Build, unit tests, lint, `a11y:focus`,
  `steering-lint`, and all deterministic guards pass (including the no-bypass
  guard, which is green in this worktree).
- `node scripts/mobile-audit.mjs http://localhost:4191` → **All mobile checks
  passed** across 320/375/390/430 portrait and 844×390 / 667×375 landscape, in
  both appearance passes: no horizontal overflow, no text control under 16px,
  no tap target under 44px, no text below 14px, no contrast failure.

**States.** Empty states verified rendered (Inbox
`after/inbox-light-390.png`; Profile `after/profile-light-390.png`). The cold-
start/loading state is the branded terracotta splash (`after/state-loading-390.png`),
which the two prior reviews praised and this pass leaves alone. Focus states are
unchanged and covered by the existing `focus-visible:` ring family
(`after/state-focus-login-390.png`). Error and disabled states are unchanged by
this pass (no error/disabled surface was edited).

**Self-critique — restraint.** The skill's "remove one accessory" test was
applied to the largest change: the masthead was reduced to type alone, and the
icon tile was the accessory removed. Two further temptations were refused: (a)
accenting a single word in the masthead, and (b) adding any entrance animation
to the feed — the direction's boldness is spent on the time-forward card, so the
rest stays quiet. The feed card still carries a lot of rows (title, status pill,
age, place, time, host, divider, going line, button, "More info"); each has a
job and each is pinned by an existing spec, so none was cut for looks.

**Known limitation.** The full Playwright e2e lane was deliberately not run from
this copy (`e2e/` drives the live Supabase project and the shared 4173 port, and
it is a batch-end lane per `docs/agents/browser-lanes.md`). The card-meta and
nav-label assertions were checked against the rendered DOM by hand instead
(text content is unchanged by the span/class edits). The `no-mistakes` pipeline
run owns the full e2e gate.

