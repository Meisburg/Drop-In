/**
 * The app's Resend seam — the browser twin of the sender's transport wrapper.
 *
 * Two runtimes, ONE implementation, exactly as `src/lib/email.ts` re-exports
 * `supabase/functions/_shared/emailCopy.ts`: the Deno sender imports the shared
 * module directly, the app and the vitest spec import it through this file. The
 * shared module is pure-ish — it takes `fetch` in `ResendDeps` rather than
 * reaching for a global — so nothing here has to adapt it for the browser, and
 * tests can hand it a fake without touching the network.
 *
 * Every value and every type is re-exported, so a consumer never has to reach
 * across the `src/` boundary and the two runtimes can never drift. There are no
 * tsconfig path aliases in this repo, hence the relative path with the explicit
 * `.ts` extension.
 */
export { RESEND_ENDPOINT, sendEmail } from '../../supabase/functions/_shared/resend.ts'
export type {
  EmailMessage,
  ResendConfig,
  ResendDeps,
  SendResult,
} from '../../supabase/functions/_shared/resend.ts'
