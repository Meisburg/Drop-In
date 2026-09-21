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
