/**
 * prefill-playdate — the V10 ticket 03 edge function (Supabase Edge Function,
 * Deno). The server half of "Describe it instead" on /new.
 *
 * ONE JOB: a parent types one sentence ("Green Lake tomorrow 10 to noon, best
 * for 2-5"); this function turns it into the structured form fields the /new
 * summary will read back, by calling the configured LLM with a JSON-schema-
 * constrained prompt. It is NOT a chat: one request in, one field set out.
 *
 * THE PRIVACY CONTRACT (spec: .scratch/v10/spec.md, enforced in review):
 *   * The request body is `{ text, todayIso, timezone }` — the sentence the
 *     parent chose to type plus the two clock facts the relative-date rule
 *     needs. NOTHING else crosses: no kid ids, no profile fields, no DB
 *     reads (this function never opens a Supabase client at all).
 *   * `text` is NEVER logged — not on success, not on failure, not in an
 *     error path. An error response never echoes input.
 *   * The LLM provider is configured by secrets (`LLM_API_KEY`,
 *     `LLM_BASE_URL`, `LLM_MODEL`); the zero-retention choice is the human's
 *     recorded decision.
 *   * The client runs the result through the SAME validation a hand-filled
 *     form gets (src/lib/prefill.ts → mergePrefill): invalid fields are
 *     dropped, never coerced, and nothing is ever auto-posted — the parent
 *     reviews the summary and taps Post.
 *
 * WALLS (the send-push discipline, inverted — this one is FOR parents):
 *   * `verify_jwt` is ON (the Supabase default), so the bearer must be a real
 *     Supabase JWT; and
 *   * the handler itself verifies the bearer with `auth.getUser(token)` — a
 *     service-role key is NOT a user, so cron-style callers get 401 here
 *     (that inversion is the point: send-push is service-role only, this is
 *     user-only).
 *   * A per-user in-memory rate limit (10/min) bounds an abusive client; the
 *     isolation is per function instance, which is fine for a bound (an
 *     attacker's budget scales with instances, not below it).
 *
 * Deploy (the send-push precedent, coordinator-owned):
 *   supabase functions deploy prefill-playdate --project-ref ayzvjwxbxyrcgyoeaxuk
 *   supabase secrets set LLM_API_KEY=... LLM_BASE_URL=... LLM_MODEL=...
 */

// ---------------------------------------------------------------------------
// Shared shapes (duplicated from src/lib/feed.ts on purpose: this file runs
// in Deno, the app runs in Vite — the ONE thing shared is the contract, and
// the contract is pinned by tests on BOTH sides. The numbers here are the
// app's own pinned constants: TIME_STEP_MINUTES 30, the duration chips
// [60, 90, 120, 180], TITLE_MAX_LENGTH 80.)

const TIME_STEP_MINUTES = 30
const DURATION_CHIPS = [60, 90, 120, 180]
const TITLE_MAX_LENGTH = 80
const TEXT_MAX_LENGTH = 300
const START_DATE_MAX_DAYS_AHEAD = 60
const RATE_LIMIT_PER_MINUTE = 10

/** The prefill field set the response may carry (the app's whitelist). */
interface PrefillFields {
  title?: string
  place?: string
  startDate?: string
  startMinutes?: number
  durationMinutes?: number
  ageHint?: string
  details?: string
}

interface PrefillRequest {
  text: string
  todayIso: string
  timezone: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

/** The bearer token, or ''. (Never logged.) */
function bearerOf(request: Request): string {
  return (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
}

// ---------------------------------------------------------------------------
// Guards over the LLM's answer — the pure rules the vitest suite pins too
// (they are the app's own whitelist/clamps; an unknown key, an off-grid
// minute, a fifth duration chip or a too-far date is DROPPED, never coerced).

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00`)
  return !Number.isNaN(parsed.getTime())
}

/** Days between two ISO dates (calendar days, no timezone math needed). */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`)
  const to = new Date(`${toIso}T00:00:00`)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * The schema guard: keep ONLY the seven known fields with legal values, with
 * the date bounded to today..today+60d. The input is whatever `JSON.parse`
 * produced — treated as unknown and read defensively (the LLM's answer is
 * untrusted data, same as any wire input).
 */
export function prefillFieldsFrom(raw: unknown, todayIso: string): PrefillFields {
  const out: PrefillFields = {}
  if (raw === null || typeof raw !== 'object') return out
  const r = raw as Record<string, unknown>

  if (typeof r.title === 'string') {
    const title = r.title.trim()
    if (title !== '') out.title = title.slice(0, TITLE_MAX_LENGTH)
  }
  if (typeof r.place === 'string') {
    const place = r.place.trim()
    if (place !== '') out.place = place.slice(0, 120)
  }
  if (typeof r.startDate === 'string' && isIsoDate(r.startDate)) {
    const delta = daysBetween(todayIso, r.startDate)
    // A past date or a beyond-the-horizon one is dropped, not clamped: the
    // form's own date control is the recovery path.
    if (delta >= 0 && delta <= START_DATE_MAX_DAYS_AHEAD) out.startDate = r.startDate
  }
  if (typeof r.startMinutes === 'number' && Number.isInteger(r.startMinutes)) {
    if (r.startMinutes >= 0 && r.startMinutes < 24 * 60) {
      out.startMinutes = Math.round(r.startMinutes / TIME_STEP_MINUTES) * TIME_STEP_MINUTES
    }
  }
  if (typeof r.durationMinutes === 'number' && DURATION_CHIPS.includes(r.durationMinutes)) {
    out.durationMinutes = r.durationMinutes
  }
  if (typeof r.ageHint === 'string') {
    const ageHint = r.ageHint.trim()
    if (ageHint !== '') out.ageHint = ageHint.slice(0, 40)
  }
  if (typeof r.details === 'string') {
    const details = r.details.trim()
    if (details !== '') out.details = details.slice(0, 500)
  }
  return out
}

/** The request body's guard: the three keys, in range, nothing else read. */
export function prefillRequestFrom(raw: unknown): PrefillRequest | null {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.text !== 'string') return null
  const text = r.text.trim()
  if (text === '' || text.length > TEXT_MAX_LENGTH) return null
  if (typeof r.todayIso !== 'string' || !isIsoDate(r.todayIso)) return null
  if (typeof r.timezone !== 'string' || r.timezone.trim() === '') return null
  return { text, todayIso: r.todayIso, timezone: r.timezone.trim() }
}

// ---------------------------------------------------------------------------
// The prompt: relative dates resolved BY THE MODEL against todayIso (no
// timezone math server-side — the app's clock rules stay in one place). The
// schema is the response's shape; the guard above is the backstop.

const SYSTEM_PROMPT = [
  'You extract playdate details from a parent\u2019s sentence into JSON.',
  'Return ONLY JSON with these optional keys (omit a key when the sentence does not state it):',
  '{"title","place","startDate","startMinutes","durationMinutes","ageHint","details"}',
  '- startDate: "YYYY-MM-DD". Resolve relative days ("tomorrow") from the provided today date.',
  '- startMinutes: minutes since midnight, on a 30-minute grid (e.g. 600 = 10:00 AM).',
  '- durationMinutes: one of 60, 90, 120, 180.',
  '- ageHint: only an explicit age statement like "best for 2-5" (max 40 chars).',
  '- details: extra notes the parent wrote, trimmed (max 500 chars).',
  '- title: only if the parent stated one; otherwise omit (the app generates it).',
  'Never invent a place, time or age the sentence does not state. Output JSON only.',
].join('\n')

function userPrompt(request: PrefillRequest): string {
  // The prompt carries the clock facts, NOT the app's identity, NOT a kid
  // name — only what the parent typed and the two date anchors.
  return [
    `Today is ${request.todayIso}. The parent says:`,
    request.text,
  ].join('\n')
}

interface LlmConfig {
  apiKey: string
  baseUrl: string
  model: string
}

function llmConfig(): LlmConfig | null {
  const apiKey = Deno.env.get('LLM_API_KEY') ?? ''
  const baseUrl = Deno.env.get('LLM_BASE_URL') ?? ''
  const model = Deno.env.get('LLM_MODEL') ?? ''
  if (apiKey === '' || baseUrl === '' || model === '') return null
  return { apiKey, baseUrl, model }
}

/**
 * The OpenAI-compatible chat call (the lowest-common-denominator protocol —
 * OpenAI, Anthropic's compat shim, Google's compat endpoint and most local
 * servers all speak it, so the human's provider choice stays a SECRETS
 * change, not a code change). Returns the first choice's message content.
 */
async function callLlm(config: LlmConfig, request: PrefillRequest): Promise<unknown> {
  // The OpenAI-compat surface is not uniform: `response_format` is rejected
  // 400 by some servers (gpt-5 family included), and `temperature` sampling
  // controls are rejected by reasoning models (o-series, gpt-5). Both are
  // OPTIMIZATIONS, not requirements — the prompt already demands JSON-only
  // and the guard drops anything unparsable — so the call retries once
  // without the offending fields before giving up. The probe evidence
  // (2026-09-14) pinned this: gpt-4o-mini answered with both set, but the
  // 502 path must not depend on that.
  const base = {
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(request) },
    ],
  }
  let response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      ...base,
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  })
  if (!response.ok && (response.status === 400 || response.status === 422)) {
    response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(base),
    })
  }
  if (!response.ok) {
    // The provider's error TEXT may echo the request — never surface it.
    throw new Error(`llm http ${response.status}`)
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('llm returned no content')
  }
  return JSON.parse(content)
}

// ---------------------------------------------------------------------------
// Rate limiting (per instance, per user — a bound, not a guarantee).

const RATE_BUCKETS = new Map<string, number[]>()

function rateLimited(userId: string, nowMs: number): boolean {
  const windowStart = nowMs - 60_000
  const hits = (RATE_BUCKETS.get(userId) ?? []).filter((ts) => ts > windowStart)
  if (hits.length >= RATE_LIMIT_PER_MINUTE) {
    RATE_BUCKETS.set(userId, hits)
    return true
  }
  hits.push(nowMs)
  RATE_BUCKETS.set(userId, hits)
  // The map is keyed by user id and only grows by distinct active users;
  // drop stale entries opportunistically so a busy instance stays bounded.
  if (RATE_BUCKETS.size > 1000) {
    for (const [key, timestamps] of RATE_BUCKETS) {
      if (timestamps.every((ts) => ts <= windowStart)) RATE_BUCKETS.delete(key)
      if (RATE_BUCKETS.size <= 500) break
    }
  }
  return false
}

// ---------------------------------------------------------------------------

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405)
  }

  const config = llmConfig()
  if (config === null) {
    return json({ error: 'LLM is not configured — set LLM_API_KEY / LLM_BASE_URL / LLM_MODEL' }, 503)
  }

  // The walls: verify_jwt (platform) + a real user check (here). The admin
  // key is NOT a user, so this rejects service-role callers by design.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const token = bearerOf(request)
  if (supabaseUrl === '' || anonKey === '' || token === '') {
    return json({ error: 'missing bearer token' }, 401)
  }
  let userId = ''
  try {
    const { createClient } = await import('npm:@supabase/supabase-js@2')
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.getUser(token)
    if (error !== null || data.user === null) {
      return json({ error: 'invalid token' }, 401)
    }
    userId = data.user.id
  } catch {
    return json({ error: 'invalid token' }, 401)
  }
  if (rateLimited(userId, Date.now())) {
    return json({ error: 'too many requests' }, 429)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  const parsed = prefillRequestFrom(body)
  if (parsed === null) {
    return json({ error: 'expected { text, todayIso, timezone } with a 1-300 char text' }, 400)
  }

  try {
    const raw = await callLlm(config, parsed)
    return json({ fields: prefillFieldsFrom(raw, parsed.todayIso) })
  } catch {
    // The error's own text is never surfaced (it may echo input).
    return json({ error: 'the prefill service could not process that' }, 502)
  }
})