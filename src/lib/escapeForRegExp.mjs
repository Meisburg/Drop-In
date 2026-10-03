/**
 * THE repo's one regex-escape implementation.
 *
 * Escape a value before interpolating it into a RegExp: it is DATA, and an
 * unescaped metacharacter silently over-matches (or throws).
 *
 * WHY THIS IS `.mjs` AND NOT `.ts` — the boundary, measured, not assumed.
 * This helper has two kinds of caller and only one of them speaks TypeScript:
 *
 *   - the app and the e2e suite are TypeScript and import it by path;
 *   - the deterministic guards under `scripts/guards/` are plain `.mjs` node
 *     scripts run as `node <guard>.mjs`. A `.mjs` file CANNOT import a
 *     TypeScript module: node has no loader for `./x.ts`, and the module that
 *     used to own this helper (`firstRunTour.ts`) also imports `./places`
 *     extensionless — which node cannot resolve either. Running the guards
 *     under node's `--experimental-strip-types` was rejected: `engines.node`
 *     is `>=22` and the flag is off by default there, so that cure would break
 *     the guards on the runtime the repo declares it supports.
 *
 * A vanilla-JS module is therefore the only form EVERY caller can load, so the
 * escape lives here ONCE and every caller imports this file — no second copy to
 * drift. TypeScript callers get the type from `escapeForRegExp.d.mts` beside
 * this file (a `.mjs` import takes its types from the matching `.d.mts`, which
 * is what avoids `allowJs` on the app's tsconfig — a protected config).
 *
 * `scripts/guards/regexp-escape-guard.mjs` fails the build if a sixth inline
 * copy of the pattern appears, or if this file stops being the one copy.
 *
 * NOT the same escape, deliberately excluded: the `/[^a-z0-9]/`-class
 * SANITIZERS in `src/components/RsvpConfirmationDialog.tsx`,
 * `src/components/ModalShell.tsx`, `src/lib/photoStorage.ts` and
 * `scripts/backfill-place-hours.mjs` STRIP characters rather than escape them.
 * Different character class, different replacement — merging them into this
 * function would be a behaviour change, so they stay as they are.
 */
export function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
