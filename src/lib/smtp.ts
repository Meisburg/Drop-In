/**
 * The app's SMTP seam — the browser/Node twin of the sender's primary email
 * transport, exactly as `src/lib/resend.ts` re-exports
 * `supabase/functions/_shared/resend.ts`.
 *
 * Two runtimes, ONE implementation: the Deno sender imports the shared module
 * directly, the app and the vitest spec import it through this file. The shared
 * module is pure — it takes a `SmtpDeps` client factory rather than importing a
 * mail library — so nothing here has to adapt it for the browser and
 * `src/lib/smtp.test.ts` can hand it a counting fake without opening a socket.
 *
 * The `npm:`-free boundary is deliberate and load-bearing: if
 * `_shared/smtp.ts` imported nodemailer, this file would drag an `npm:`
 * specifier into a vitest run under Node and the spec would not load. The real
 * client lives in `_shared/smtpDeno.ts`, which only the Edge Function imports.
 *
 * Every value and every type is re-exported, so a consumer never has to reach
 * across the `src/` boundary and the two runtimes can never drift. There are no
 * tsconfig path aliases in this repo, hence the relative path with the explicit
 * `.ts` extension.
 */
export {
  SMTP_DEFAULT_HOST,
  SMTP_DEFAULT_PORT,
  classifySmtpFailure,
  sendEmailViaSmtp,
  smtpConfigFrom,
  smtpErrorCode,
  smtpStatusFromResponse,
} from '../../supabase/functions/_shared/smtp.ts'
export type {
  EmailMessage,
  SendResult,
  SmtpClientLike,
  SmtpConfig,
  SmtpDeps,
  SmtpMessage,
} from '../../supabase/functions/_shared/smtp.ts'
