/**
 * send-push — the V8 ticket 08 sender (Supabase Edge Function, Deno).
 *
 * One job, run every 5 minutes by pg_cron (or by hand): turn the
 * `notification_log` rows we OWE into real Web Push POSTs.
 *
 *  1. CATCH-UP SCAN (`starting_soon` only). "Starts in an hour" is a property
 *     of the CLOCK, not of any write, so it is the one kind no trigger can
 *     produce. This function scans for posts that (a) start within the next 60
 *     minutes, (b) are still on, (c) someone pinged, and (d) have no
 *     `notification_log` row for that person yet — then inserts the rows it is
 *     about to send, in the same invocation. The other three kinds are
 *     produced by the SECURITY DEFINER triggers in migration 0032.
 *  2. DRAIN. Every row with `sent_at is null`, newest last: post it, stamp
 *     `sent_at` (or `error`), and DELETE any subscription the push service
 *     answers 404/410 for (the endpoint is dead: the browser unsubscribed, the
 *     app was deleted, or the subscription was rotated).
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
    if (subscriptions.length === 0) {
      await admin
        .from('notification_log')
        .update({ sent_at: new Date().toISOString(), error: 'no subscription' })
        .eq('id', row.id)
      skipped += 1
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
    const drained = await drain(admin)
    return json({ ok: true, startingSoonCreated: scanned, ...drained })
  } catch (error) {
    return json({ ok: false, error: errorMessage(error) }, 500)
  }
})
