# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — Seattle-area parents.** A parent holding a phone, one-handed, often
while supervising a child, asking one question: *"is anything happening near us
right now that we could just show up to?"* They are not planning a birthday
party; they are filling an afternoon. They may be new to the neighborhood and
know nobody yet, which makes the first interaction high-stakes emotionally and
low-stakes practically.

**Second — caregivers and nannies** (confirmed by the human, 2026-09-23).
A nanny or au pair arranging the day for someone else's kids. This is why no
surface may assume the signed-in person is the child's legal parent, and why the
vocabulary is "host" / "going" rather than "mom" / "dad". Their kids' details
belong to the family they work for, so the same privacy rules apply unchanged.

## Product Purpose

Drop In lets a parent post a low-commitment playdate — a time, a place, and
"come by if you like" — and lets nearby parents see what is happening today and
decide to show up. Success is a parent who was facing a long afternoon alone and
ends up at a playground with another family, without having arranged anything in
advance.

## Positioning

**Low-commitment drops-ins.** The mechanism is that an invitation is an *open
signal*, not a scheduled appointment: no RSVP is required to attend, no headcount
is promised to the host, and no one is stood up if nobody comes. This is what
separates it from a group chat (which requires knowing people and coordinating
in advance) and from an event-planning app (which requires committing). The
post is a standing invitation to a time and place; "I'm going" is a courtesy
signal, not a transaction.

## Operating Context

- Used on a phone, in the browser or as an installed PWA (standalone, offline
  shell verified). Almost always portrait, often one-handed, sometimes outdoors
  in bright light and sometimes at night.
- Time-critical: "happening now" and "starts soon" are the states that matter,
  and they decay within hours. Content is perishable by design.
- Place-centric: a park, a pool, a playground, a library. The map is a primary
  surface, not a decoration.
- Seattle-specific today (zip-radius browsing, seeded place directory). Anything
  written must not hard-code an assumption that blocks a second city.
- Parents arrive from a share link, possibly signed out, and must be able to see
  a public drop-in's surface before authenticating.

## Capabilities and Constraints

Confirmed functionality (from `plan.md`, `README.md`, and the route table):

- Post, edit, duplicate, and delete a drop-in (time, place, duration, kids).
- Browse a feed filtered by radius and home zip; map and directory views.
- "I'm going" signal, comments, follows, and parent-to-parent inbox messaging
  scoped to a shared drop-in.
- Kid and family profiles with photos; first name + age only, no public kid
  profiles. Parents authenticate before seeing anything.
- Moderation: reporting, a moderator route, account suspension.
- Web push notifications and an install prompt.

Technical constraints:

- Vite 6 / React 18 / TypeScript / Tailwind CSS v4 (CSS-first `@theme` tokens) /
  react-router / Supabase / vite-plugin-pwa.
- Design tokens are overridden inside `src/index.css` `@theme`, deliberately
  rather than editing call sites. The type scale is role-based and raised:
  `text-sm` is 17px body (iOS body size), `text-xs` is 14px, floor 14px.
- A design gate already exists and must not regress: `scripts/mobile-audit.mjs`
  (tap targets ≥44px, text controls ≥16px, overflow, measured WCAG contrast) and
  `scripts/design-detect.mjs` (61 deterministic anti-pattern rules).
- Privacy is structural, not a setting: kids appear as first name + age, and RLS
  backs the app-layer rules.

Explicitly undecided: nothing about the visual world is settled here. Dark mode,
wide-screen layout, and any visual rework are open (see `DESIGN.md` when it
exists).

## Brand Commitments

- **Name:** Drop In. The verb is the product — you drop in.
- **Voice:** warm, plain, unhurried, and never cute at someone's expense. It
  speaks to a tired adult, not to a child. Sentence case ("Post drop-in") suits
  this voice better than title case; the app's current mix is a defect, not a
  decision.
- **Palette (human decision, 2026-09-11):** terracotta `#e8552f` as the single
  committed brand hue, with `#c8411c` as the AA-safe action/text tone, on a warm
  off-white `#fbf7f4` base. Park green, gold, and sky are semantic status tints.
  Indigo is deliberately gone — the reason is recorded in `src/index.css`.
- **Type:** Bricolage Grotesque for display/headings; the system stack for body
  and controls. Identity lives in the display face; reading text stays native.
- These are binding. Future work extends them; it does not replace them without
  the human deciding to.

## Evidence on Hand

- **Real implementation:** the full app at `/home/jmeisburg/Projects/playdate-app`,
  live at `https://drop-in-mu.vercel.app`. This is the primary evidence.
- **Real data:** a seeded Seattle place directory (`src/lib/places.ts`, a
  ten-kind vocabulary), real photos being backfilled, real migrations under
  `supabase/migrations/`.
- **Real assets:** app icons and iOS startup images generated from SVG sources
  (`scripts/build-icons.sh`, `scripts/build-splash.mjs`); a logo mark drawn in
  `src/components/DropInMark.tsx` and duplicated frame-exact in the static boot
  splash in `index.html`.
- **Real automation:** unit tests (`src/lib/*.test.ts`), Playwright e2e, the
  mobile audit, the design detector, and a PWA offline verification script.
- **Absence to respect:** there are no testimonials, no user counts, no press,
  and no analytics claims. Do not fabricate them into any surface.

## Product Principles

1. **Showing up must stay easy.** Any feature that adds a required step before a
   parent can attend — an RSVP, a payment, a profile completion — is working
   against the product. Optimize for "I can be there in ten minutes."
2. **Perishable content leads.** Now and soon outrank later. The interface should
   make today legible at a glance and let the past recede quietly.
3. **Strangers are the default, and that is fine.** Trust is built by structural
   privacy and clear intent, not by social proof. Never require a connection to
   participate.
4. **The place is half the invitation.** A park, a pool, a library carry meaning a
   street address does not. Treat place as content, not metadata.
5. **Protect the child by not collecting.** First name and age is the ceiling for
   what a child's record holds anywhere a stranger can reach it.

## Accessibility & Inclusion

- The audience is tired adults on phones, frequently one-handed and sometimes in
  bright outdoor light. Large type, high contrast, and generous targets are
  product requirements, not polish.
- The app already commits to measurable floors and must keep them: 44px targets,
  16px minimum text controls, WCAG AA contrast on rendered pixels, no text below
  14px. These are enforced by `scripts/mobile-audit.mjs`.
- Screen-reader support is expected at parity with visual use — the app's error
  and status text must be announced, not merely shown (see audit finding: this
  is currently a gap).
- Respect system preferences: reduced motion, and the platform appearance
  setting. Appearance is a parent's choice on `/settings` — **Light** (the
  default), **Dark**, or **Match my phone** (follows `prefers-color-scheme`).
  The V22 decision was light-default with dark opt-in and no OS-follow; V27
  added the OS-follow option without changing the light default, because a
  phone that switches at night should not require a per-app hunt.
