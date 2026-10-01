/**
 * Types for the vanilla-JS `escapeForRegExp.mjs` beside this file. The two
 * share a basename on purpose: an import of `./escapeForRegExp.mjs` takes its
 * types from this declaration, which is what lets the all-TypeScript app import
 * the guard-shareable implementation without `allowJs` in `tsconfig.app.json`.
 * Keep the signature in step with the `.mjs`; a wrong signature fails
 * `npm run typecheck` at the call sites.
 */
export declare function escapeForRegExp(value: string): string
