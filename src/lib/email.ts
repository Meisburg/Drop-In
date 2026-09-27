/**
 * The app's email seam — the browser twin of the sender's copy rules.
 *
 * Two runtimes, ONE implementation: the Deno sender
 * (`supabase/functions/send-push/index.ts`) imports the shared module directly,
 * and the app imports it through this re-export, exactly as `src/lib/push.ts`
 * re-exports `pushCopy.ts`. The rules themselves stay pure — they take the base
 * URL as a parameter and read no global — so only this file knows where the
 * browser's base URL comes from, which is what keeps `emailCopy.ts`
 * unit-testable without a DOM and identical in Deno and the browser.
 */
// The local binding is needed for `clientEmailEnv`'s return type: a re-export
// (`export … from`) does not put a name in this module's scope.
import type { EmailEnv } from '../../supabase/functions/_shared/emailCopy.ts'

export {
  EMAIL_KINDS,
  FALLBACK_BASE_URL,
  TITLE_FALLBACK,
  buildEmailPayload,
  emailSubject,
  emailUrl,
  escapeHtml,
  isEmailKind,
} from '../../supabase/functions/_shared/emailCopy.ts'
export type {
  EmailEnv,
  EmailKind,
  EmailPayload,
  EmailRow,
} from '../../supabase/functions/_shared/emailCopy.ts'

/**
 * The base the browser hands to `buildEmailPayload`. An explicit
 * `VITE_PUBLIC_BASE_URL` wins, so a preview/staging build can point its links at
 * the deployment rather than at whatever host served the page; otherwise the
 * live origin is correct by construction.
 */
export function clientBaseUrl(): string {
  return import.meta.env.VITE_PUBLIC_BASE_URL ?? window.location.origin
}

/**
 * The env the app hands `buildEmailPayload`. The browser has no reply-to
 * configured — there is no mailbox to point at — so `replyTo` is the empty
 * string, which is the path that exercises the `/settings` opt-out fallback
 * rather than inventing a mailbox that does not exist.
 */
export function clientEmailEnv(): EmailEnv {
  return { baseUrl: clientBaseUrl(), replyTo: '' }
}
