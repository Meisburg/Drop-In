/**
 * App glyph vocabulary (bottom nav + section headers): 24px viewBox, stroked,
 * currentColor — one visual family (stroke width 1.8). Shared module: App's
 * bottom nav (NavIcon) and SectionHeader (V11 ticket 04) both render these,
 * and the pages pass one to SectionHeader without importing the root App
 * component (which imports the pages — a cycle).
 */
export const NAV_ICONS = {
  nearby: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  browse: 'M4 6h16 M4 12h16 M4 18h16',
  post: 'M12 5v14 M5 12h14',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5 20a7 7 0 0 1 14 0',
  // V14 ticket 01: the inbox envelope (2nd bottom-nav tab) — the suggested
  // path from the ticket: envelope outline + flap, stroked like the family.
  inbox: 'M4 6h16v12H4Z M4 6l8 6 8-6',
  // V11 ticket 06: the header gear (top nav, signed-in only) — the door to /settings.
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z',
  // V24 slice 02: the shared back-control glyph — a left chevron in the same
  // stroked family (24px viewBox, stroke 1.8, currentColor). It replaces the
  // ad-hoc "←" text arrows on the page-level back controls.
  'chevron-left': 'M15 6l-6 6 6 6',
  // The place-save bookmark: a ribbon with a notched bottom, in the same stroked
  // family (24px viewBox, stroke 1.8, currentColor). The place control's pressed
  // state fills this silhouette instead of stroking it, so "saved" is never
  // colour-only — the fill channel is paired with the label flip (Save → Saved).
  bookmark: 'M6 4h12v17l-6-4-6 4Z',
  // V24 slice 04: the search field's magnifying glass (the inbox's "Message a
  // parent" picker) — a lens circle + handle in the same stroked family, so it
  // matches the rest of the icon set rather than being a pasted-in glyph.
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M16.2 16.2 21 21',
} as const

/**
 * V22 slice 12: FILLED variants of the four nav destinations — the platform's
 * preferred active state (Apple HIG: filled icons in the tab bar; the active
 * tab is also marked by font weight, so the channel is not color-only).
 *
 * Same 24px viewBox and currentColor as NAV_ICONS above, but `fill` instead of
 * stroke: the shapes are the SAME silhouettes (pin, envelope, plus, person),
 * just solid, so a tab reads as "here" at a glance without a hue shift. The
 * stroked family stays for in-content glyphs (SectionHeader etc.) — this map
 * exists ONLY for the nav.
 */
export const NAV_ICONS_FILLED = {
  // A solid map pin with a punched-out dot (the even-odd rule makes the inner
  // circle a hole, keeping the pin's center readable against any background).
  nearby: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  // A solid envelope with a white flap line cut through it.
  inbox: 'M4 6h16v12H4Z M4 6l8 6 8-6',
  // A solid plus — the post action's shape. V24 slice 05: it lives in the nav's
  // CENTRE again (PostActionButton, a raised circular "+") after the founder
  // overrode V22 slice 12 on 2026-09-25; the HIG deviation is deliberate.
  post: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6Z',
  // A solid head + shoulders silhouette.
  profile: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z M5 20a7 7 0 0 1 14 0Z',
  // A solid "list" glyph for the Places tab (three bars, the same silhouette as
  // the stroked browse icon above, just filled).
  browse: 'M4 5h16v3H4Z M4 10.5h16v3H4Z M4 16h16v3H4Z',
} as const

/**
 * V17 t01: PLACE-KIND glyphs — the illustration a place card's photo slot
 * falls back to while `places.photo_url` is NULL for every seeded row
 * (`types.ts:307`; real photos are t05, a separate batch).
 *
 * Deliberately the SAME visual family as NAV_ICONS above: 24px viewBox,
 * stroked, `currentColor`, stroke width 1.8 — so a card's slot reads as part
 * of this app rather than a pasted-in picture, and no new icon dependency
 * enters the bundle.
 *
 * The key is the place's `kind`, verbatim from `PLACE_KINDS`
 * (`lib/places.ts:73-84`, the 0029 CHECK constraint's mirror) — the ten kinds
 * the DB allows, so every seeded row draws SOMETHING and an unknown kind
 * falls back to `other` at the call site rather than rendering an empty box.
 *
 * Shape, not illustration: each glyph is a small number of primitives that
 * stay legible at the slot's rendered size, and every one is visually
 * distinct from its neighbours (the pool's water line vs. the splash pad's
 * droplets; the library's open book vs. the museum's columned portico).
 */
export const PLACE_KIND_ICONS = {
  // A tree on a mound — the generic "green space" read.
  park: 'M12 21v-4 M7 17a4 4 0 0 1 .6-7.9 5 5 0 0 1 9.6 0A4 4 0 0 1 17 17Z',
  // A swing set: frame, two ropes, a seat.
  playground: 'M4 20V7 M20 20V7 M4 7h16 M8 7v7 M16 7v7 M6.5 14h4',
  // A roof over a play mat — "fun, but indoors".
  indoor_play: 'M3 10.5 12 4l9 6.5 M5 10.8V20h14v-9.2 M9.5 20v-5h5v5',
  // A columned portico — the museum.
  museum: 'M3 9.5 12 4l9 5.5 M6 12v7 M10 12v7 M14 12v7 M18 12v7 M3 20h18',
  // A water line with a ladder.
  pool: 'M3 15.5c2 0 2-1.4 4-1.4s2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 4 1.4 M3 19.2c2 0 2-1.4 4-1.4s2 1.4 4 1.4 2-1.4 4-1.4 2 1.4 4 1.4 M8 12.5V5 M14 12.5V5 M8 8h6',
  // Droplets mid-splash.
  splash_pad: 'M12 4.5v3 M12 16.5c0-3 3-3.2 3-6a3 3 0 0 0-6 0c0 2.8 3 3 3 6 M6 11.5v2 M18 11.5v2 M19.5 19c-1.5 0-1.8-1-3-1s-1.5 1-3 1-1.8-1-3-1-1.5 1-3 1',
  // An open book.
  library: 'M12 6.5C10.2 5.2 7.6 4.8 4.5 5v12.5c3.1-.2 5.7.2 7.5 1.5 1.8-1.3 4.4-1.7 7.5-1.5V5c-3.1-.2-5.7.2-7.5 1.5Z M12 6.5v12.5',
  // A sun over a shoreline wave.
  beach: 'M12 6.5V4 M6.9 8.6 5.5 7.2 M17.1 8.6l1.4-1.4 M8.3 4.6a5 5 0 0 1 7.4 0 M4 20c1.5 0 1.8-1.2 3.2-1.2S8.7 20 10.2 20s1.7-1.2 3.1-1.2S15 20 16.5 20s1.7-1.2 3.5-1.2',
  // A switchback path.
  trail: 'M7 20c0-2.5 6-2.5 6-5s-6-2.5-6-5 6-2.5 6-5 M7 20h11',
  // A map pin with a dot — the honest "we know the kind is 'other'".
  other: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
} as const

/**
 * V21 t03: REACTION-KIND glyphs — the emoji each message reaction renders as.
 *
 * Deliberately EMOJI (not stroked SVG paths like NAV_ICONS / PLACE_KIND_ICONS):
 * reactions are expressive colour, and the six faces + heart + thumb read at a
 * glance in a way line-art would not. The key is the reaction's `kind`, verbatim
 * from `REACTION_KINDS` (`lib/db.ts`, migration 0049's CHECK mirror) — the six
 * kinds the DB allows, so every row renders SOMETHING and an unknown kind falls
 * back to `like` at the call site rather than rendering an empty box.
 *
 * The glyph map lives here (components/) exactly where PLACE_KIND_ICONS lives;
 * the KINDS list lives in lib/ (db.ts) exactly where PLACE_KINDS lives (places.ts).
 */
export const REACTION_GLYPHS = {
  like: '👍',
  love: '❤️',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
  angry: '😠',
} as const
