/**
 * The REAL SMTP client — DENO ONLY. This is the ONE place a mail library
 * appears in the repository.
 *
 * WHY IT IS A SEPARATE FILE FROM `_shared/smtp.ts`, AND WHY THAT SPLIT IS
 * LOAD-BEARING: `_shared/smtp.ts` is PURE — it names no library, so the vitest
 * spec `src/lib/smtp.test.ts` can import it (through the app seam
 * `src/lib/smtp.ts`) and run under plain Node. An `npm:` specifier anywhere in
 * that import graph would break the Node runner, and a `Deno` global would break
 * it too. The library therefore lives HERE, behind the `SmtpDeps` seam that the
 * pure module declares: swapping the library (denomailer, a raw socket client,
 * Gmail's HTTP API) is a one-file change and no test moves.
 *
 * This file is imported ONLY by `supabase/functions/send-push/index.ts`, which
 * vitest never loads. The PURE helpers this adapter needs — the reply-code parse
 * (`smtpStatusFromResponse`) and the env-to-config mapping (`smtpConfigFrom`) —
 * live in `_shared/smtp.ts` and ARE unit-tested there. What remains untested
 * HERE is only the nodemailer wiring itself: `createTransport`, `sendMail`, and
 * the `close()` call. That wiring is deliberately thin, and its whole job is to
 * speak nodemailer's dialect and let its errors through: every failure path is
 * CLASSIFIED by `sendEmailViaSmtp` in the pure module, so swallowing an error
 * here would destroy the retry verdict. Do not add a try/catch to `sendMail`.
 *
 * The `npm:` specifier matches how this repo already imports its other Deno
 * dependencies (`npm:@supabase/supabase-js@2`, `npm:web-push@3` in
 * `send-push/index.ts`), which is the brief's own criterion.
 */
import nodemailer from 'npm:nodemailer@6'

import {
  smtpStatusFromResponse,
  type SmtpClientLike,
  type SmtpConfig,
  type SmtpDeps,
  type SmtpMessage,
} from './smtp.ts'

/** The structural slice of nodemailer this adapter uses. */
interface NodemailerTransport {
  sendMail(message: Record<string, unknown>): Promise<{ response?: unknown }>
  close(): void
}

interface NodemailerModule {
  createTransport(options: {
    host: string
    port: number
    secure: boolean
    auth: { user: string; pass: string }
  }): NodemailerTransport
}

const mailer = nodemailer as unknown as NodemailerModule

/**
 * The real transport, injected into the pure `sendEmailViaSmtp`. One connection
 * per call and closed in the caller's `finally`, so a long drain cannot leak
 * sockets.
 */
export const smtpDeps: SmtpDeps = {
  async connect(config: SmtpConfig): Promise<SmtpClientLike> {
    const transport = mailer.createTransport({
      host: config.host,
      port: config.port,
      // Implicit TLS on 465, per the verified account (`smtp_port=465`); a
      // caller that sets `secure` explicitly wins.
      secure: config.secure ?? (config.port === 465),
      auth: { user: config.user, pass: config.pass },
    })

    return {
      async send(message: SmtpMessage): Promise<{ status: number }> {
        // Deliberately NOT wrapped: a rejection reaches `sendEmailViaSmtp`,
        // which reads `responseCode` off it and decides retry vs retire.
        const info = await transport.sendMail({
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: message.replyTo,
          headers: message.headers,
        })
        return { status: smtpStatusFromResponse(info.response) }
      },
      close(): void {
        transport.close()
      },
    }
  },
}
