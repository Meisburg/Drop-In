/**
 * send-push — the V8 ticket 08 sender (Supabase Edge Function, Deno), now the
 * ONE sender for TWO transports.
 *
 * One job, run every 5 minutes by pg_cron (or by hand): turn the
 * `notification_log` rows we OWE into real Web Push POSTs — and, when a parent
 * has NO registered device at all, into an email instead. Email is a FALLBACK
 * BRANCH inside `drain()`, not a second function and not a second queue: a
 * second function draining the same `sent_at is null` rows would race this one
 * for the same rows.
 *
 * THE EMAIL TRANSPORT IS SELECTABLE, SMTP PREFERRED. Gmail SMTP
 * (`SMTP_USER` + `SMTP_PASS` + `EMAIL_FROM`) is the PRIMARY path: the account
 * already carries Drop In's auth email and is proven live, and it needs no
 * sending domain. Resend HTTP stays available (`_shared/resend.ts`, untouched)
 * for when a domain exists. When NEITHER is configured the branch is not
 * silently skipped — the row is stamped with the NAME of the missing secret
 * (`_shared/emailTransport.ts`), because that stamp is the only record of why
 * nothing was delivered.
 *
 *  1. CATCH-UP SCANS (`starting_soon` and `review_due`). Both are properties of
 *     the CLOCK, not of any write, so they are the two kinds no trigger can
 *     produce. The `starting_soon` scan looks for posts that (a) start within
 *     the next 60 minutes, (b) are still on, (c) someone pinged, and (d) have no
 *     `notification_log` row for that person yet. The `review_due` scan looks
 *     for place-backed posts that (a) are still on, (b) ended within the last
 *     24 hours (`REVIEW_PROMPT_WINDOW_HOURS`), (c) someone pinged, (d) have no
 *     `review_due` row for that person yet, and (e) have not already rated the
 *     place. Each inserts the rows it is
 *     about to send, in the same invocation. The other four kinds come from the
 *     SECURITY DEFINER triggers: `ping_received`, `new_comment` and `cancelled`
 *     in migration 0032, and `ended` in 0041 — which replaces 0032's cancelled
 *     function so the same trigger emits both notifying statuses.
 *  2. DRAIN. Every row with `sent_at is null`, newest last: post it, stamp
 *     `sent_at` (or `error`), and DELETE any subscription the push service
 *     answers 404/410 for (the endpoint is dead: the browser unsubscribed, the
 *     app was deleted, or the subscription was rotated). A row whose recipient
 *     has NO subscription is handed to the email fallback: configured and
 *     addressable → send the email; otherwise stamp it exactly as before.
 *
 * NAMING DEBT, RECORDED RATHER THAN HIDDEN. The function is still called
 * `send-push` even though it now sends email too. The name is retained
 * DELIBERATELY: renaming it means a redeploy plus a `pg_cron` job change (the
 * job `send-push-every-5-minutes` calls this URL), which is deployment work this
 * slice does not own. The pure decisions live in `../_shared/emailFallback.ts`
 * (which the app's `src/lib/emailFallback.ts` re-exports and
 * `src/lib/emailFallback.test.ts` unit-tests), so this file is wiring only.
 *
 * SAFE TO INVOKE REPEATEDLY, and that is the design, not a hope: the unique
 * key `(profile_id, kind, playdate_id)` (migration 0032) plus
 * `ignoreDuplicates` on insert means a second run of the scan creates nothing,
 * and the drain only ever reads UNSENT rows — so a double-fire (two cron
 * ticks, a manual kick, a retry) cannot double-send. There is no in-memory
 * dedupe anywhere in this file, on purpose.
 *
 * NOT RUNNABLE BY ANON. Two walls, both required:
 *   * `verify_jwt` is ON for the function (the Supabase default), and
 *   * the handler compares the bearer token to `SUPABASE_SERVICE_ROLE_KEY`
 *     itself — a signed-in parent's own (perfectly valid) JWT would otherwise
 *     pass the first wall and let them trigger a drain on demand.
 * Deploy with the default JWT verification; pg_cron sends the service-role
 * key as the bearer token (see docs/push-setup.md).
 *
 * The copy rules live in `../_shared/pushCopy.ts` — the same module the app's
 * `src/lib/push.ts` re-exports and `src/lib/push.test.ts` unit-tests, so the
 * wording sent here is the wording pinned by the vitest spec.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import {
  buildNotificationPayload,
  isNotificationKind,
  notificationDedupeKey,
  type NotificationKind,
} from '../_shared/pushCopy.ts'
import { FALLBACK_BASE_URL, buildEmailPayload, type EmailEnv } from '../_shared/emailCopy.ts'
import { sendEmail } from '../_shared/resend.ts'
import { sendEmailViaSmtp, smtpConfigFrom } from '../_shared/smtp.ts'
import { smtpDeps } from '../_shared/smtpDeno.ts'
import { chooseTransport } from '../_shared/emailTransport.ts'
import { classifySendResult, decideEmailFallback } from '../_shared/emailFallback.ts'
import {
  REVIEW_PROMPT_WINDOW_HOURS,
  isReviewPromptCandidate,
  reviewPromptRow,
} from '../_shared/reviewScan.ts'

/**
 * The email fallback's configuration, read ONCE at module scope. `Deno.env` is
 * not a reactive source in an Edge Function — the isolate is created per
 * invocation — so there is nothing to gain from re-reading it inside the loop.
 *
 * `TRANSPORT` is the PRECEDENCE decision (`_shared/emailTransport.ts`): SMTP
 * when `SMTP_USER` + `SMTP_PASS` + `EMAIL_FROM` are all non-blank (Gmail is the
 * primary path), else Resend when `RESEND_API_KEY` + `EMAIL_FROM` are non-blank,
 * else `disabled` with the NAME of the missing secret in `reason`. Either way
 * there is nothing to gain from re-deciding per row, and a missing secret means
 * the drain keeps its old behaviour rather than failing every row on a request
 * that could never be accepted.
 */
const SMTP_USER = (Deno.env.get('SMTP_USER') ?? '').trim()
const SMTP_PASS = (Deno.env.get('SMTP_PASS') ?? '').trim()
const SMTP_HOST = (Deno.env.get('SMTP_HOST') ?? '').trim()
const SMTP_PORT = (Deno.env.get('SMTP_PORT') ?? '').trim()
const RESEND_API_KEY = (Deno.env.get('RESEND_API_KEY') ?? '').trim()
const EMAIL_FROM = (Deno.env.get('EMAIL_FROM') ?? '').trim()
const EMAIL_REPLY_TO = (Deno.env.get('EMAIL_REPLY_TO') ?? '').trim()
const PUBLIC_BASE_URL = (Deno.env.get('PUBLIC_BASE_URL') ?? '').trim()

/** Which transport this deployment has, and (when disabled) what is missing. */
const TRANSPORT = chooseTransport({
  smtpUser: SMTP_USER,
  smtpPass: SMTP_PASS,
  resendApiKey: RESEND_API_KEY,
  emailFrom: EMAIL_FROM,
})

/** There is a transport to call at all — the flag `decideEmailFallback` wants. */
const EMAIL_ENABLED = TRANSPORT.kind !== 'disabled'

/** The SMTP branch's config, from the same secrets. Unused when disabled. */
const SMTP_CONFIG = smtpConfigFrom({
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
  EMAIL_REPLY_TO,
  SMTP_HOST,
  SMTP_PORT,
})

/** Links are built against the configured origin, else the pinned deployment
 *  fallback — a relative link in an inbox is a dead link. */
const EMAIL_ENV: EmailEnv = {
  baseUrl: PUBLIC_BASE_URL !== '' ? PUBLIC_BASE_URL : FALLBACK_BASE_URL,
  replyTo: EMAIL_REPLY_TO,
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

/** Posts starting within this many minutes get a `starting_soon` row. */
const STARTING_SOON_WINDOW_MINUTES = 60

/** Per-invocation caps, so a big backlog can never blow the function timeout:
 *  the next tick picks up where this one stopped (nothing is lost — an unsent
 *  row is simply still unsent). */
const MAX_ROWS_PER_RUN = 200
const MAX_SENDS_PER_RUN = 400

/** How many posts the catch-up scan inspects in one go. */
const MAX_SCAN_POSTS = 500

interface PushSubscriptionRow {
  id: string
  profile_id: string
  endpoint: string
  p256dh: string | null
  auth: string | null
}

interface LogRow {
  id: string
  profile_id: string
  kind: string
  playdate_id: string | null
  title: string
  body: string
  url: string
}

interface WebPushError {
  statusCode?: number
  body?: string
  message?: string
}

interface WebPushModule {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload?: string,
  ): Promise<unknown>
}

const sender = webpush as unknown as WebPushModule

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

function errorMessage(error: unknown): string {
  if (error === null || error === undefined) return 'unknown error'
  if (typeof error === 'string') return error
  const candidate = error as WebPushError
  if (typeof candidate.message === 'string' && candidate.message !== '') return candidate.message
  if (typeof candidate.body === 'string' && candidate.body !== '') return candidate.body
  return JSON.stringify(error).slice(0, 300)
}

/** A push service's 404/410 means "this endpoint is gone" — the documented
 *  prune path (the only automated delete of a `push_subscriptions` row). */
function isDeadSubscription(error: unknown): boolean {
  const status = (error as WebPushError | null)?.statusCode
  return status === 404 || status === 410
}

/**
 * Insert the `starting_soon` rows that are missing, and report how many were
 * created. Reads through the admin client (service role → RLS bypassed), which
 * is required: the log's policies deliberately have no authenticated INSERT.
 */
async function catchUpStartingSoon(admin: SupabaseClient): Promise<number> {
  const now = Date.now()
  const until = new Date(now + STARTING_SOON_WINDOW_MINUTES * 60 * 1000).toISOString()

  // (a)+(b)+(c): who pinged a post that is still on and starts inside the
  // window. The !inner embed is what makes the playdate filters restrict the
  // join rather than blank out the embed.
  const { data: pingRows, error: pingError } = await admin
    .from('going_pings')
    .select(
      'profile_id, playdate_id, playdate:playdates!going_pings_playdate_id_fkey!inner ( id, title, starts_at, status )',
    )
    .gt('playdate.starts_at', new Date(now).toISOString())
    .lte('playdate.starts_at', until)
    .eq('playdate.status', 'on')
    .limit(MAX_SCAN_POSTS)

  if (pingError) throw pingError

  const pings = (pingRows ?? []) as unknown as Array<{
    profile_id: string
    playdate_id: string
    playdate: { id: string; title: string | null; starts_at: string; status: string } | null
  }>
  if (pings.length === 0) return 0

  const postIds = [...new Set(pings.map((row) => row.playdate_id))]
  const titles = new Map<string, string | null>()
  for (const row of pings) titles.set(row.playdate_id, row.playdate?.title ?? null)

  // (d): who has already been told. `.in()` on a non-empty list only — an empty
  // `.in()` matches nothing, which would make every candidate look unsent.
  const { data: existingRows, error: existingError } = await admin
    .from('notification_log')
    .select('profile_id, playdate_id')
    .eq('kind', 'starting_soon')
    .in('playdate_id', postIds)

  if (existingError) throw existingError

  const told = new Set(
    ((existingRows ?? []) as Array<{ profile_id: string; playdate_id: string }>).map(
      (row) => `${row.profile_id}:${row.playdate_id}`,
    ),
  )

  const candidates = pings.filter((row) => !told.has(`${row.profile_id}:${row.playdate_id}`))
  if (candidates.length === 0) return 0

  // The going count for the body ("1 family is going" / "N families are going").
  const { data: goingRows, error: goingError } = await admin
    .from('going_pings')
    .select('playdate_id')
    .in('playdate_id', postIds)

  if (goingError) throw goingError

  const goingByPost = new Map<string, number>()
  for (const row of (goingRows ?? []) as Array<{ playdate_id: string }>) {
    goingByPost.set(row.playdate_id, (goingByPost.get(row.playdate_id) ?? 0) + 1)
  }

  const insertRows = candidates.map((row) => {
    const kind: NotificationKind = 'starting_soon'
    const payload = buildNotificationPayload({
      kind,
      playdateId: row.playdate_id,
      postTitle: titles.get(row.playdate_id) ?? null,
      goingCount: goingByPost.get(row.playdate_id) ?? 0,
    })
    return {
      profile_id: row.profile_id,
      kind,
      playdate_id: row.playdate_id,
      ...payload,
    }
  })

  // ignoreDuplicates is the second half of the anti-double-send wall: a
  // concurrent invocation that inserted the same rows first wins, and this one
  // creates nothing.
  const { error: insertError } = await admin
    .from('notification_log')
    .upsert(insertRows, {
      onConflict: 'profile_id,kind,playdate_id',
      ignoreDuplicates: true,
    })

  if (insertError) throw insertError
  return insertRows.length
}

/**
 * Insert the `review_due` rows that are missing, and report how many were
 * created. The other clock-produced catch-up scan, beside
 * `catchUpStartingSoon`, and deliberately its twin: same source of truth
 * (`going_pings`), same two-wall idempotence (the exclusion read, then the
 * `ignoreDuplicates` upsert), same `MAX_SCAN_POSTS` bound, one clock read. It
 * adds one more exclusion read: a parent who already has a `reviews` row for
 * the drop-in's place is never asked to rate it again (rule (f) in
 * `../_shared/reviewScan.ts`).
 *
 * "It finished" is a property of the CLOCK, not of any write — nothing sets
 * `'ended'` automatically (only a host ending early does, `0041`), so a
 * naturally-expired drop-in keeps `status = 'on'` forever and no trigger can
 * produce this kind. Hence the scan, and hence nothing to change in `pg_cron`.
 *
 * THIS IS WIRING ONLY. WHO gets asked and WHAT the row says are decided in the
 * pure `../_shared/reviewScan.ts` (vitest-pinned by `src/lib/reviewScan.test.ts`),
 * because this file cannot be unit-tested — `scripts/deno-check-functions.sh`
 * only type-checks it and `scripts/deno-test-functions.sh` runs one SMTP file.
 * No rule, comparison or validity check is added here.
 */
async function catchUpReviewDue(admin: SupabaseClient): Promise<number> {
  // ONE clock read, handed to both the query bound and the predicate, so the
  // two walls cannot disagree about what "now" is.
  const now = new Date()
  const windowMs = REVIEW_PROMPT_WINDOW_HOURS * 60 * 60 * 1000
  const since = new Date(now.getTime() - windowMs).toISOString()

  // (a)+(b)+(c): who pinged a place-backed post that is still on and ended
  // inside the window. The !inner embed is what makes the playdate filters
  // restrict the join rather than blank out the embed. `status = 'on'` is the
  // only signal a naturally-expired drop-in is over, so 'cancelled' and 'ended'
  // ("don't head out") can never reach the mapper. These SQL-side filters are a
  // SECOND, independent wall — the predicate below is the rule.
  const { data: pingRows, error: pingError } = await admin
    .from('going_pings')
    .select(
      'profile_id, playdate_id, playdate:playdates!going_pings_playdate_id_fkey!inner ( id, title, ends_at, status, place_id )',
    )
    .eq('playdate.status', 'on')
    .lt('playdate.ends_at', now.toISOString())
    .gte('playdate.ends_at', since)
    .not('playdate.place_id', 'is', null)
    .limit(MAX_SCAN_POSTS)

  if (pingError) throw pingError

  const pings = (pingRows ?? []) as unknown as Array<{
    profile_id: string
    playdate_id: string
    playdate: {
      id: string
      title: string | null
      ends_at: string | null
      status: string
      place_id: string | null
    } | null
  }>
  if (pings.length === 0) return 0

  const postIds = [...new Set(pings.map((row) => row.playdate_id))]

  // (d): who has already been told. `.in()` on a non-empty list only — an empty
  // `.in()` matches nothing, which would make every candidate look unsent.
  const { data: existingRows, error: existingError } = await admin
    .from('notification_log')
    .select('profile_id, playdate_id')
    .eq('kind', 'review_due')
    .in('playdate_id', postIds)

  if (existingError) throw existingError

  const told = new Set(
    ((existingRows ?? []) as Array<{ profile_id: string; playdate_id: string }>).map(
      (row) => `${row.profile_id}:${row.playdate_id}`,
    ),
  )

  // THE ANTI-NAG WALL: never ask a parent to review a place they already
  // reviewed. `reviews` is one row per `(place_id, author_profile_id)` (0052) —
  // the same record the place page writes. `.in()` on a non-empty list only,
  // like the `told` read above.
  const placeIds = [
    ...new Set(
      pings
        .map((row) => row.playdate?.place_id)
        .filter((id): id is string => typeof id === 'string' && id.trim() !== ''),
    ),
  ]
  const reviewed = new Set<string>()
  if (placeIds.length > 0) {
    const { data: reviewRows, error: reviewError } = await admin
      .from('reviews')
      .select('place_id, author_profile_id')
      .in('place_id', placeIds)
    if (reviewError) throw reviewError
    for (const row of (reviewRows ?? []) as Array<{ place_id: string; author_profile_id: string }>) {
      reviewed.add(`${row.author_profile_id}:${row.place_id}`)
    }
  }

  // THE PREDICATE IS CALLED BEFORE THE MAPPER, ALWAYS. `reviewPromptRow` is
  // deliberately total and does NOT re-run `isReviewPromptCandidate`, so a row
  // reaching the mapper unfiltered would yield a fallback url instead of being
  // dropped. Filter with the rule first; map second.
  const insertRows = pings
    .filter((row) => !told.has(`${row.profile_id}:${row.playdate_id}`))
    .filter((row) =>
      isReviewPromptCandidate(
        {
          status: row.playdate?.status,
          endsAt: row.playdate?.ends_at,
          placeId: row.playdate?.place_id,
          alreadyReviewed: reviewed.has(`${row.profile_id}:${row.playdate?.place_id ?? ''}`),
        },
        now,
      ),
    )
    .map((row) =>
      reviewPromptRow({
        profileId: row.profile_id,
        playdateId: row.playdate_id,
        placeId: row.playdate?.place_id,
        title: row.playdate?.title ?? null,
      }),
    )

  if (insertRows.length === 0) return 0

  // ignoreDuplicates is the second half of the anti-double-send wall: a
  // concurrent invocation that inserted the same rows first wins, and this one
  // creates nothing. The unique key IS the idempotence — no in-memory dedupe.
  const { error: insertError } = await admin
    .from('notification_log')
    .upsert(insertRows, {
      onConflict: 'profile_id,kind,playdate_id',
      ignoreDuplicates: true,
    })

  if (insertError) throw insertError
  return insertRows.length
}

/** The drain. Returns the counters the caller reports. */
async function drain(admin: SupabaseClient): Promise<{
  rows: number
  sent: number
  failed: number
  skipped: number
  pruned: number
}> {
  let sent = 0
  let failed = 0
  let skipped = 0
  let pruned = 0
  let sends = 0

  const { data: logRows, error: logError } = await admin
    .from('notification_log')
    .select('id, profile_id, kind, playdate_id, title, body, url')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_ROWS_PER_RUN)

  if (logError) throw logError

  const rows = (logRows ?? []) as LogRow[]

  for (const row of rows) {
    if (sends >= MAX_SENDS_PER_RUN) break

    const { data: subscriptionRows, error: subscriptionError } = await admin
      .from('push_subscriptions')
      .select('id, profile_id, endpoint, p256dh, auth')
      .eq('profile_id', row.profile_id)

    if (subscriptionError) throw subscriptionError

    const subscriptions = (subscriptionRows ?? []) as PushSubscriptionRow[]

    // No device has opted in (a denial, or they turned it off). The row is
    // stamped anyway: it is not "owed" any more — it is the /profile fallback
    // list's content — and leaving it unsent would make every future tick
    // re-read it forever.
    //
    // …UNLESS a transport is configured, in which case "no device" is no longer
    // "no way to reach them": an iPhone parent who never completed the push
    // opt-in (iOS web push needs the app installed to the home screen) still
    // gets told. The email branch below is a FALLBACK INSIDE this drain, on
    // purpose — a second function draining the same `sent_at is null` rows
    // would race this one for them. The unique key
    // `(profile_id, kind, playdate_id)` plus `sent_at is null` remains the only
    // anti-double-send wall; there is still no in-memory dedupe.
    if (subscriptions.length === 0) {
      if (TRANSPORT.kind === 'disabled') {
        // Not configured. Keep the EXISTING behaviour, including the LEADING
        // part of the error string — other things read it, and the honest
        // reading is "we had no way to reach them" — but APPEND the transport's
        // own reason, the same way the decision branch below does. Without it
        // the row says only that email is off; with it the row names the
        // missing secret, and that row is the only record of why no parent was
        // told.
        await admin
          .from('notification_log')
          .update({
            sent_at: new Date().toISOString(),
            error: `no subscription (email disabled: ${TRANSPORT.reason})`.slice(0, 500),
          })
          .eq('id', row.id)
        skipped += 1
        continue
      }

      // Resolve the recipient. NEITHER read may throw out of the loop: one
      // unreadable row must not strand every notification behind it. A failed
      // read is `undefined`, which for the opt-out column means "fall through
      // and send" (see the header of _shared/emailFallback.ts) and for the
      // address means "we have nowhere to send", which the decision reports.
      let optout: boolean | undefined
      let email: string | null | undefined

      try {
        const { data, error } = await admin
          .from('profiles')
          .select('email_optout')
          .eq('id', row.profile_id)
          .maybeSingle()
        if (error) throw error
        optout = (data as { email_optout: boolean } | null)?.email_optout
      } catch (error) {
        // Pre-0053 project (the column is absent → 42703) or a failed read. NOT
        // `true`: an unreadable opt-out column is not a parent asking us to stop.
        console.error(`send-push: could not read email_optout for ${row.profile_id}:`, errorMessage(error))
        optout = undefined
      }

      try {
        const { data, error } = await admin.auth.admin.getUserById(row.profile_id)
        if (error) throw error
        email = data.user?.email
      } catch (error) {
        console.error(`send-push: could not read the email address for ${row.profile_id}:`, errorMessage(error))
        email = undefined
      }

      const decision = decideEmailFallback({ emailEnabled: EMAIL_ENABLED, optout, email })

      if (decision.action !== 'send-email') {
        // Same stamp as the unconfigured path, with the decision's own reason
        // appended so the queue row records WHY this parent was not reached.
        await admin
          .from('notification_log')
          .update({
            sent_at: new Date().toISOString(),
            error: `no subscription (${decision.reason})`.slice(0, 500),
          })
          .eq('id', row.id)
        skipped += 1
        continue
      }

      // The cap counts EMAILS exactly as it counts pushes — an attempt is an
      // attempt, or the per-invocation cap stops meaning anything.
      sends += 1

      const emailPayload = buildEmailPayload(row, EMAIL_ENV)
      // SMTP first (the primary transport), Resend second — the same precedence
      // `chooseTransport` decided above. Both branches resolve the SAME
      // `SendResult`, so the stamping below cannot tell them apart.
      const result =
        TRANSPORT.kind === 'smtp'
          ? await sendEmailViaSmtp(smtpDeps, { to: email ?? '', ...emailPayload }, SMTP_CONFIG)
          : await sendEmail(
              { fetch },
              { to: email ?? '', ...emailPayload },
              { apiKey: RESEND_API_KEY, from: EMAIL_FROM, replyTo: EMAIL_REPLY_TO },
            )
      const verdict = classifySendResult(result)

      if (verdict === 'sent') {
        await admin
          .from('notification_log')
          .update({ sent_at: new Date().toISOString(), error: 'sent:email' })
          .eq('id', row.id)
        sent += 1
        continue
      }

      if (verdict === 'retry') {
        // DO NOT STAMP. The transport said "come back later" — SMTP 4xx (421/
        // 450/451/452), a Resend 429/5xx, or a connection/TLS failure that
        // never reached a status — so `sent_at` stays null and the next
        // 5-minute tick picks the row up again. Stamping here would mark the
        // notification delivered and DROP it forever — the parent would never be
        // told about the playdate, which is the exact failure this slice exists
        // to remove.
        failed += 1
        continue
      }

      // Terminal: the identical request will fail identically forever — an SMTP
      // 5xx (550 is an ADDRESS REJECTION), a Resend 4xx that is not a rate
      // limit, or a misconfiguration — so it IS stamped. Leaving it unsent
      // would make every future tick retry a bad address and starve every
      // notice queued behind it (this drain is oldest-first, and the cap is a
      // send budget).
      const detail = result.ok ? 'unknown' : result.error
      await admin
        .from('notification_log')
        .update({
          sent_at: new Date().toISOString(),
          error: `email failed: ${detail}`.slice(0, 500),
        })
        .eq('id', row.id)
      failed += 1
      continue
    }

    const kind: NotificationKind = isNotificationKind(row.kind) ? row.kind : 'starting_soon'
    const payload = JSON.stringify({
      title: row.title,
      body: row.body,
      url: row.url,
      kind,
      // The dedupe key AS the notification tag: the service worker uses it to
      // replace a repeat of the same event instead of stacking a second buzz —
      // the same semantics as 0032's unique constraint.
      tag: notificationDedupeKey({
        profileId: row.profile_id,
        kind,
        playdateId: row.playdate_id,
      }),
    })

    const errors: string[] = []
    for (const subscription of subscriptions) {
      if (sends >= MAX_SENDS_PER_RUN) break

      if (
        subscription.p256dh === null ||
        subscription.p256dh === '' ||
        subscription.auth === null ||
        subscription.auth === ''
      ) {
        errors.push('subscription has no encryption keys')
        continue
      }

      sends += 1
      try {
        await sender.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        )
        sent += 1
        await admin
          .from('push_subscriptions')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', subscription.id)
      } catch (error) {
        if (isDeadSubscription(error)) {
          // 404/410: the endpoint is dead. Delete the row — the prune.
          await admin.from('push_subscriptions').delete().eq('id', subscription.id)
          pruned += 1
          errors.push('endpoint gone (pruned)')
          continue
        }
        failed += 1
        errors.push(errorMessage(error))
      }
    }

    // ATTEMPT-ONCE, and the reason is a missing column rather than a
    // preference: `sent_at` is stamped even when every send failed, because a
    // retry needs an attempt counter (0032's columns are pinned: sent_at +
    // error, no counter), and rows drain OLDEST FIRST — so a permanently
    // failing row left unsent would sit at the head of the queue and starve
    // every notification behind it. Losing one attempt on a transient push
    // service error is the smaller harm; `error` records exactly what happened,
    // and the /profile fallback list still shows the notice.
    await admin
      .from('notification_log')
      .update({
        sent_at: new Date().toISOString(),
        error: errors.length === 0 ? null : errors.join('; ').slice(0, 500),
      })
      .eq('id', row.id)
  }

  return { rows: rows.length, sent, failed, skipped, pruned }
}
Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (supabaseUrl === '' || serviceRoleKey === '') {
    return json({ error: 'function is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  // The second wall (see the header): a valid *user* JWT must not be able to
  // run the drain. Only the service-role key gets past this line.
  const bearer = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (bearer === '' || bearer !== serviceRoleKey) {
    return json({ error: 'send-push is service-role only' }, 401)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? ''

  if (vapidPublic === '' || vapidPrivate === '' || vapidSubject === '') {
    // Fail LOUDLY and clearly (the OAuth slice's posture): the human-owned
    // console steps in docs/push-setup.md are not finished. Rows stay unsent
    // and nothing is stamped, so the backlog drains the moment the secrets
    // exist — this returns 503 rather than 200 so a cron monitor sees it.
    return json(
      {
        error: 'VAPID keys are not configured — see docs/push-setup.md',
        sent: 0,
      },
      503,
    )
  }

  sender.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  try {
    const scanned = await catchUpStartingSoon(admin)
    const reviewDueScanned = await catchUpReviewDue(admin)
    const drained = await drain(admin)
    return json({
      ok: true,
      startingSoonCreated: scanned,
      reviewDueCreated: reviewDueScanned,
      ...drained,
    })
  } catch (error) {
    return json({ ok: false, error: errorMessage(error) }, 500)
  }
})
