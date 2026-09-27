/**
 * The app's transport-gate seam — the twin of
 * `supabase/functions/_shared/emailTransport.ts`, exactly as
 * `src/lib/emailFallback.ts` re-exports its shared module.
 *
 * Two runtimes, ONE implementation: the Deno sender imports the shared module
 * directly, the app and the vitest spec import it through this file. The shared
 * module reads no global, so nothing here has to adapt it and
 * `src/lib/emailTransport.test.ts` can pin every branch explicitly.
 *
 * Every value and every type is re-exported, so a consumer never has to reach
 * across the `src/` boundary and the two runtimes can never drift. There are no
 * tsconfig path aliases in this repo, hence the relative path with the explicit
 * `.ts` extension.
 */
export { chooseTransport } from '../../supabase/functions/_shared/emailTransport.ts'
export type {
  TransportChoice,
  TransportEnv,
  TransportKind,
} from '../../supabase/functions/_shared/emailTransport.ts'
