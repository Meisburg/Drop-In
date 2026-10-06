# Settings: an index on the phone, a pane on the desktop — spec (2026-10-05)

**Status:** brief only. Nothing built. Written before any builder is dispatched
(`AGENTS.md`: a slice with no acceptance criteria + verification command is a plan
defect, not a builder problem).

**Founder's ask, as taken over (the objective's wording, verbatim):**

> *"Phone: a drill-down index (Notifications · Near you · Following & saved ·
> Appearance · Account), one screen per category. Desktop: a left pane beside the
> existing nav rail. Notifications alone is a screen today (status, turn-on,
> email toggle, eight kind toggles, quiet hours, 'Recent alerts')."*

⚠️ **The verbatim founder report is NOT in this repo.** The wording above is the
handover's paraphrase and the only source. Two decisions below therefore wait on
the founder rather than being decided here (§7). Nothing else in this brief
depends on them.

---

## 1. What the code does today (read, not assumed)

`src/pages/SettingsPage.tsx` is ONE scrolling column of **six** `SettingsSection`
blocks, in this order:

| # | `id` | Title | Body component | line |
|---|---|---|---|---|
| 1 | `notifications` | Notifications | `NotificationsSection` (625 lines) | `:198` |
| 2 | `near-you` | Near you | `BrowsingSection` | `:206` |
| 3 | `saved` | Following & saved | inline: the follows list + unfollow + undo | `:218` |
| 4 | `privacy` | Privacy & safety | `PrivacySection` | `:331` |
| 5 | `appearance` | Appearance | `ThemeToggle` | `:343` |
| 6 | `account` | Account | `AccountSection` | `:347` |

Above them sits one `settings-profile-link` row to `/profile` (`:189`).

Three facts that shape the slice, all measured 2026-10-05:

- **The sections are heavy.** `NotificationsSection` alone is 625 lines and
  carries the push status, the turn-on/off control, the iOS install card, the
  email opt-out, **eight** `push-pref-<kind>` toggles, quiet hours (toggle +
  start + end) and a collapsed `push-recent` "Recent alerts" list. On a phone
  this is a long scroll before a parent reaches *Appearance*, let alone
  *Account*.
- **The deep-link mechanism has ZERO in-app callers.** `grep -rn "/settings#" src/`
  returns only two comments (`SettingsSection.tsx:6`, `SettingsPage.tsx:44`) and
  the `useEffect` that implements it (`SettingsPage.tsx:109-115`). No component
  links to `/settings#notes`. So the index may own the URLs without breaking a
  single in-app caller — but the mechanism is *advertised* in prose and a
  bookmark may exist, so it must keep working (§4).
- **Nine bare navigations in six specs.** `page.goto('/settings')` appears at
  `loop-closing:712`, `moderator-door:43,74`, `profiles-v2:82`,
  `push-subscribe:484,541,954`, `sign-out:47`, `zip-radius:60`; **15 spec files**
  mention `/settings` at all. Every one of those nine lands on the top of the
  page today and must be told what to expect after the change. **This is the
  slice's real cost, and it is not optional** — a restructure that leaves a spec
  looking for `notifications-section` on the index screen is a red suite.

## 2. The decision (this is the shape; build it, do not re-open it)

- **Below `md` (the phone): an INDEX, then a SCREEN.** `/settings` renders the
  index — five rows, one per category, each a 44px+ tap target with the category
  name and one honest line of what it holds. Tapping a row pushes a real URL and
  renders ONLY that category's body, with a back control to the index.
- **At `md` and up: a LEFT PANE inside `<main>`, beside the existing nav rail.**
  The shell already puts the nav in its own `4.5rem` grid column
  (`App.tsx:495`, `md:grid-cols-[4.5rem_minmax(0,1fr)]`), so the settings pane is
  a second grid INSIDE `<main>` — `md:grid-cols-[14rem_minmax(0,1fr)]` — with the
  same index list in the left cell and the selected category's body in the right.
  No shell change, and the nav rail's geometry does not move.
- **One component per category, and the index is a table, not five copies.** The
  five rows are data (`lib/settingsIndex.ts`, a `readonly` array of
  `{ id, label, blurb, icon }`), the same way `TOUR_LINES` and
  `SETTINGS_SECTIONS`-style seams already work here. The phone screen and the
  desktop pane read the same array, so the two arrangements cannot drift.

⚠️ **THE DESKTOP PANE IS A SECOND CONTENT COLUMN, AND `DESIGN.md` SAYS THAT IS A
PRODUCT DECISION, NOT A BREAKPOINT.** The One-Column Rule, verbatim
(`DESIGN.md:365-368`):

> **The One-Column Rule.** The layout is a phone column. Widening the viewport
> gives the column air and moves the navigation to the side; it never lengthens a
> line of body copy. **A desktop layout with a second content column has to be a
> product decision, not a breakpoint.**

The founder's ask IS that decision, so the pane is permitted — but the slice owes
the repo a record of it rather than quietly adding a `md:grid-cols-` to a page.
**Do this in the same slice:** add an ADR (`docs/adr/0004-settings-pane-is-a-product-decision.md`
— the next free number; check `docs/adr/` first) recording the ask, the rule it
exceptions, and the constraint that survives: the index is a NAVIGATION column,
the body keeps the phone measure (`max-w-md`), and no OTHER page gains a second
column from this precedent. Without that record, the next reader sees a
`md:grid-cols-[14rem_minmax(0,1fr)]` and the rule looks broken.

## 3. The five categories, and where the sixth thing goes

| Index row | `id` | What it holds | Today's source |
|---|---|---|---|
| Notifications | `notifications` | push status, turn on/off, iOS card, email opt-out, the eight kind toggles, quiet hours, Recent alerts | `NotificationsSection.tsx` (unchanged) |
| Near you | `near-you` | the saved discovery radius | `BrowsingSection.tsx` (unchanged) |
| Following & saved | `saved` | followed families, saved places, unfollow + undo | `SettingsPage.tsx:218-329` (moves) |
| Appearance | `appearance` | light / dark / match my phone | `ThemeToggle.tsx` (unchanged) |
| Account | `account` | download your data, sign out, delete your account | `AccountSection.tsx` (unchanged) |

⚠️ **`Privacy & safety` is the sixth section and the objective's index lists
five.** It has a real body (`PrivacySection`, the block list) and real deep-link
prose. It cannot simply vanish. §7 makes this the founder's call; the default
this brief is written against is **six index rows, Privacy & safety between
Following & saved and Appearance** (keeping today's order), because merging it
into Account would put "who you have blocked" behind a row labelled "Account",
which is a worse lie than a longer index.

## 4. Interfaces to pin (a builder must not improvise these)

Routes (`src/App.tsx`'s route table — new routes join the playtest `routes.json`):

- `/settings` → the index (phone) / index + **no** body (desktop, until a
  category is chosen; on desktop the first category is selected by default so
  the pane is never empty).
- `/settings/notifications`, `/settings/near-you`, `/settings/saved`,
  `/settings/privacy`, `/settings/appearance`, `/settings/account` → that
  category's screen.
- **The old hash must not 404.** On `/settings` with a hash matching a known id,
  `<Navigate replace>` to the matching path (the `SettingsPage.tsx:109-115`
  scroll effect is then deleted with a comment saying why). Keep the six ids
  EXACTLY as they are — a rename is a second, silent break of every external
  bookmark.

Test ids that must survive byte-for-byte (specs select on them):
`settings-profile-link`, `notifications-section`, `push-status`, `push-turn-on`,
`push-turn-off`, `push-config-note`, `push-ios-card`, `push-ios-dismiss`,
`push-install-button`, `push-fallback-note`, `email-optout`, `email-optout-toggle`,
`email-optout-note`, `email-optout-error`, `push-error`, `push-notice`,
`push-kind-prefs`, `push-pref-<kind>`, `quiet-hours`, `quiet-hours-toggle`,
`quiet-hours-start`, `quiet-hours-end`, `push-recent`, `following-error`,
`following-empty`, `unfollow-family`, `unfollow-place`, `settings-radius`.

New ids this slice introduces (name them, do not leave them to taste):
`settings-index`, `settings-index-row-<id>`, `settings-back`, `settings-pane`.

## 5. Acceptance criteria

1. At 390×844, `/settings` renders the index and **no** category body; each row
   is a single tap target ≥44px with an accessible name carrying the category
   word (`getByRole('link', { name: /Notifications/ })` resolves).
2. Tapping a row navigates to its path and renders **only** that category's
   body, plus a back control that returns to the index.
3. At 1280×900 the index and the selected body are BOTH visible, the index in a
   left pane, and the pane sits inside `<main>` to the right of the existing nav
   rail (assert the pane's `x` is greater than the rail's right edge).
4. `/settings#notifications` and `/settings#saved` land on that category's
   screen (the hash maps through, replace-not-push).
5. Every control listed in §4 is reachable and has its test id, on the screen
   §3 assigns it to.
6. The nine `page.goto('/settings')` call sites are updated to navigate to the
   screen they actually need, and every spec in §1's list is green.
7. No category body renders twice in the DOM at either width (the drift risk the
   one-component-per-category rule exists to remove) — assert a control's
   `toHaveCount(1)` at 390 and at 1280.
8. `npm run verify` stays green and the test count GROWS; `node
   scripts/signed-in-audit.mjs` stays exit 0 (it measures `/settings` × 3
   widths and will see the new layout).

## 6. Verification recipe (private port — never a bare playwright run)

`playwright.config.ts` sets `reuseExistingServer: true` and `:4173` belongs to a
sibling checkout, so:

```bash
npm run build
npx vite preview --port 4191 --strictPort &
E2E_BASE_URL=http://localhost:4191 npx playwright test \
  e2e/push-subscribe.e2e.ts e2e/email-optout.e2e.ts e2e/zip-radius.e2e.ts \
  e2e/sign-out.e2e.ts e2e/moderator-door.e2e.ts e2e/profiles-v2.e2e.ts
# kill the preview BY PORT afterwards
```

`E2E_BASE_URL` (the V32 constant in `e2e/fixtures.ts`) replaces the whole
temp-config dance; do not add a `playwright.private.config.ts`.

## 7. Open decisions — the founder's, not the builder's

1. **Does Privacy & safety get an index row, or fold elsewhere?** Default in §3
   is a sixth row. The alternative (Account) was rejected in writing above so the
   choice is visible rather than implied.
2. **On desktop, does the index keep a selection at all stages, or is
   `/settings` an empty right pane until a category is clicked?** Default: select
   the first category, so the pane is never blank.
3. **Does the phone screen keep a swipe-back / iOS-style gesture, or only the
   `settings-back` control?** Default: the control only — the repo has no
   gesture convention to inherit.

## 8. Not in scope

- Any change to what a category CONTAINS (the notification kinds, the radius
  editor, the follows list, the theme radios, account deletion). This slice moves
  and indexes; it does not edit copy or behaviour.
- The `/profile` row (`settings-profile-link`) — it stays at the top of the
  index; it is a door to another page, not a sixth category.
- The shell's nav rail, its breakpoint, or the header.
- A search box, a settings-wide filter, or per-category sub-indexes.
