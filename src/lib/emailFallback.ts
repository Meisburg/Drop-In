/**
 * The app's email-fallback seam — the browser twin of the drain's fallback
 * decision.
 *
 * Two runtimes, ONE implementation, exactly as `src/lib/resend.ts` re-exports
 * `supabase/functions/_shared/resend.ts`: the Deno sender imports the shared
 * module directly, the app and the vitest spec import it through this file. The
 * shared module is pure — it takes every fact as an argument and reads no
 * global, no env and no `window` — so there is nothing to adapt for the browser.
 *
 * Every value and every type is re-exported, so a consumer never has to reach
 * across the `src/` boundary and the two runtimes can never drift. There are no
 * tsconfig path aliases in this repo, hence the relative path with the explicit
 * `.ts` extension.
 */
export { classifySendResult, decideEmailFallback } from '../../supabase/functions/_shared/emailFallback.ts'
export type {
  EmailFallbackAction,
  EmailFallbackDecision,
  EmailFallbackFacts,
  SendVerdict,
} from '../../supabase/functions/_shared/emailFallback.ts'
