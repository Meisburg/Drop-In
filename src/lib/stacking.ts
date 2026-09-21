/**
 * UI stacking tokens — the z-index values that are a COMPARISON against another
 * library's numbers rather than a taste call.
 *
 * WHY THIS IS ITS OWN MODULE (V16 t07, found by the `ocr` review lane): these
 * were first written in `src/lib/db.ts`, which is the wrong home twice over.
 *
 *  1. **Conceptually** they are a rendering concern, not a data-layer decision.
 *     Nothing about the database determines what a modal must out-stack.
 *  2. **Practically** `db.ts` has real module-scope side effects: it reads
 *     `import.meta.env`, THROWS when `VITE_SUPABASE_URL`/`ANON_KEY` are absent,
 *     and calls `createClient(...)` at import time. A purely presentational
 *     component (`ImageLightbox`, which previously imported only `react`) that
 *     imported `db.ts` for one class string would drag the entire data layer
 *     and a Supabase client into any test that rendered it. Importing a
 *     constant must not boot a database client.
 *
 * This module imports NOTHING and has no side effects, so any layer may depend
 * on it — which is what a shared UI token has to be.
 */

/**
 * The z-index a MODAL must wear to out-stack Leaflet's OWN controls.
 *
 * THE DEFECT IT EXISTS FOR: both modals in `BrowsePage.tsx` wore Tailwind's
 * `z-50`, which the built stylesheet emits as `.z-50{z-index:50}`. Leaflet's
 * controls sit far above that, so the +/− zoom box and the attribution line
 * painted ON TOP of the dimmed backdrop and the dialog. The founder
 * photographed it.
 *
 * THE LAYERS THAT MATTER, read from the shipped stylesheets rather than guessed
 * (this is the part the first attempt got wrong — it stopped at 800):
 *
 *     Leaflet  .leaflet-control              z-index:  800
 *     Leaflet  .leaflet-top/.leaflet-bottom  z-index: 1000   <-- the REAL ceiling
 *     app      modal backdrop (z-50)         z-index:   50
 *     app      lightbox                      z-index: 1200
 *
 * `.leaflet-control` is 800, but the zoom control is WRAPPED in
 * `.leaflet-top`/`.leaflet-bottom`, which are **1000** — so 800 is not the
 * number to beat. A modal has to clear 1000.
 *
 * WHY 1100 AND NOT 900: the first attempt chose `z-[900]`, which beats 800 and
 * LOSES to 1000 — it would have left the bug half-fixed while looking fixed.
 * 900 is also above the lightbox's old value (60), which would have lifted the
 * modals ABOVE the app-wide image lightbox, rendering a tapped photo BEHIND
 * the dialog. The constraint is a BAND, not a floor:
 *
 *     Leaflet panes/controls  <= 1000
 *     a modal over a map         1100
 *     the image lightbox         1200   (always the topmost overlay)
 *
 * Lowering Leaflet's index globally was rejected: that is a shared-component
 * change for a modal-local bug, and it would weaken every map.
 *
 * NOTE FOR FUTURE CALL SITES: the other fixed overlays in this repo
 * (ConfirmDialog, CropPhotoDialog, DeletePlaydateDialog, ReportDialog,
 * SplashScreen) still use `z-50`. None of them renders on a map page today, so
 * none is broken — but if one is ever shown over a Leaflet map, it inherits
 * this exact defect and must use this token instead.
 */
export const MODAL_OVER_LEAFLET_Z_CLASS = 'z-[1100]'

/**
 * The z-index the app-wide image lightbox wears.
 *
 * It must out-stack EVERYTHING, including a modal that is itself out-stacking
 * Leaflet — see `MODAL_OVER_LEAFLET_Z_CLASS` for the full layer table and why
 * this is 1200 rather than the 60 it used to be. The lightbox is the one
 * overlay a user can reach from inside another overlay (tap a photo in a
 * dialog), so it can never be the thing that loses the comparison.
 */
export const IMAGE_LIGHTBOX_Z_CLASS = 'z-[1200]'
