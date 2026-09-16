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
} as const