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