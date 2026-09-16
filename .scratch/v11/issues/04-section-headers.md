# 04: Restrained section headers (not hero images)

**What to build:** A small illustrated section header component, applied to
the five main pages. Each header is a compact band (~64px): soft gradient
background, a small icon, the page title (kept as the `<h1>`), and a
ONE-LINE section-specific tagline. The feed/cards stay above the fold —
this is a header, not a full-bleed hero. No images.

**Why:** Founder judgment call (V11): hero images were proposed and rejected
as too loud for a utility app; "restrained" = soft gradient + icon + one
line of copy that tells the parent what THIS screen is for.

**Status:** TODO

## Mechanics (pinned)

- NEW component `src/components/SectionHeader.tsx`:
  - Props: `{ icon: string; title: string; tagline: string }` — `icon` is an
    SVG path (the existing `NAV_ICONS` string-path pattern, `App.tsx` lines
    334-350: `NavIcon` renders `<svg>` with `fill="none" stroke="currentColor"`).
  - Rendering (Tailwind v4 — CSS-based config in `src/index.css`, no
    `tailwind.config.*`; NOTE: `grep gradient` in `src/` returns NOTHING
    today, so this introduces the app's first gradient — keep it soft):
    a rounded band `rounded-xl border border-indigo-100 bg-gradient-to-br
    from-indigo-50 via-white to-slate-50 px-4 py-3`, flex row: a 20px icon
    in a 32px rounded tile (`bg-indigo-100 text-indigo-600`), then a column
    with the `<h1>` (`text-lg font-semibold font-display text-slate-900` —
    21px, the section-title step of the type scale; NOT text-xl) and the
    tagline (`text-sm text-slate-600`).
  - Exactly one `<h1>` per page (the component owns it). 44px touch rule is
    irrelevant (no interaction).
- Pages that get it (replace the bare
  `<h1 className="text-xl font-semibold text-slate-900">…</h1>`):
  | Page | Title | Tagline | Icon |
  |---|---|---|---|
  | `FeedPage.tsx` (lines 642 AND 756 — both "Near you" branches) | Near you | Drop-ins around your area | `NAV_ICONS.nearby` |
  | `BrowsePage.tsx` (line 194) | Places | Find a place to gather | `NAV_ICONS.browse` |
  | `NewPlaydatePage.tsx` (line 1004) | Post a drop-in | Where, when, and who's coming | `NAV_ICONS.post` |
  | `EditPlaydatePage.tsx` (line 311) | Edit your drop-in | Update the plan | `NAV_ICONS.post` |
  | `ProfilePage.tsx` (line 788) | Your family | Your profile, kids, and posts | `NAV_ICONS.profile` |
  - If `NAV_ICONS` lacks a fit icon, add one (gear-style stroke paths, same
    stroke width) rather than importing a new icon library.
- OUT OF SCOPE (keep their plain h1s): error/empty states
  (PlaydateDetailPage's "We couldn't find this drop-in" etc.), Onboarding,
  Login, ResetPassword, Mod, UserPage (`/u/:handle` — it's a public view,
  not an app screen).
- E2E: specs asserting the TITLE text (`getByText('Post a drop-in')` etc.)
  stay green because the title string is unchanged inside the h1. Verify no
  spec does an exact full-page text match that the new tagline would break
  (grep the five taglines in `e2e/` → expect 0 hits before writing them).
  post-fast's tap count is unaffected (the header is non-interactive).

## Acceptance criteria

- [ ] `SectionHeader` rendered on the five pages; each page still has exactly
      one h1; taglines read as one line at 390px width (no wrap on the
      common widths, else shorten the copy).
- [ ] At 390x844 the first feed card (Nearby) / first place row (Places) is
      within the first viewport — the header costs <~72px.
- [ ] No raster images anywhere in the headers; `npm run build && npm run
      test` exit 0; e2e suite green with no title-assertion edits.
- [ ] Error/empty states and public pages untouched.

**Migration check:** NONE. `supabase/` untouched.

**Depends on:** run BEFORE ticket 06 (06 restructures /profile; do 04's
header on today's page, then 06 re-points it at the reorganized page — and
add a "Settings" header to the new /settings page in 06).