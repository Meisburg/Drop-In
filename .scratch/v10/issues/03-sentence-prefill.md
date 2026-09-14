# 03: Sentence prefill — "Describe it instead" (one LLM call, no chat)

**What to build:** On /new, a collapsed "Describe it instead" affordance under
the quick-fill preset card. Tapping it opens a single-line text box + a
"Fill the form" button. One sentence ("Green Lake tomorrow 10 to noon, best
for 2-5") → POST to the `prefill-playdate` edge function → structured fields
→ `mergePrefill` writes them into the form → the existing summary read-back
shows what will be posted → the parent taps Post. The LLM never writes and
never converses.

**Why:** audit findings #1 and #4 — a NEW place still costs typing, and
"tomorrow at 10" is a fiddly date control behind the disclosure. One sentence
beats six taps for a distracted parent. Full research:
`.scratch/agent-post-page/research.md` (recommendation d).

**Status:** ready-for-agent — HUMAN DECISION before deploy: LLM provider
(zero-retention API terms required). Code can be built against
`LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL` secrets without naming the
provider.

**Status note:** dispatch AFTER tickets 01+02 land (same page, one writer).

## Mechanics (pinned)

**Edge function `supabase/functions/prefill-playdate/index.ts` (Deno):**
- Modeled on `send-push` (supabase/functions/send-push/index.ts): same CORS
  shape, `verify_jwt` ON, and the handler verifies the bearer is a real user
  JWT via `supabase.auth.getUser(token)` (service-role callers rejected —
  the send-push wall inverts: this one is FOR signed-in parents only)
- Request body: `{ text: string, todayIso: string, timezone: string }` — the
  sentence + clock facts ONLY. The function fetches nothing from the DB.
- Calls the LLM with a JSON-schema-constrained prompt; returns
  200 `{ fields: { title?, place?, startDate?, startMinutes?, durationMinutes?,
  ageHint?, details? } }`. Server-side guards: `text` ≤ 300 chars, response
  parsed against the schema, unknown keys dropped, `startMinutes` must be
  0–1410, `durationMinutes` one of [60,90,120,180], `startDate` must parse as
  ISO date and be within today..today+60d (relative dates resolved from
  todayIso/timezone BY THE LLM PROMPT — no tz math server-side)
- **No logging of `text`** (no console.log of the body, error responses never
  echo input). 400 on bad shape, 429 on >10 req/min per user (in-memory
  counter is fine; function-isolated), 502 on LLM failure
- Deploy: `supabase functions deploy prefill-playdate --project-ref
  ayzvjwxbxyrcgyoeaxuk` (the send-push precedent) + secrets set. Coordinator
  runs this after review.

**Client `src/lib/prefill.ts` (pure, unit-tested):**
- `mergePrefill(values, patch, addressTouched): { values, errors? }` —
  whitelist the seven fields; clamp `startMinutes` to the 30-min grid
  (`TIME_STEP_MINUTES`), `durationMinutes` to `PLAYDATE_DURATIONS_MINUTES`,
  title to `TITLE_MAX_LENGTH` with the generated-title fallback; place goes
  through `stripPlaceAlias`-safe text handling and sets picker closed; NEVER
  touches neighborhoodId (the LLM may not set it — a place pick later fills
  it), NEVER touches selectedKidIds
- `prefillFetch(text, todayIso, timezone, fetchImpl)` — thin caller, abortable,
  degrades to a quiet inline error line on failure (never a crash, never a
  blocked Post)

**Page wiring (NewPlaydatePage):**
- Collapsed affordance in the quick-fill card area; on success, patch values +
  open nothing else — the summary read-back IS the review surface
- After prefill, place text is free text (no placeId) unless it exactly
  matches a directory name (`resolvePlaceByName`, the applyRecentPlace rule)
  so the post never claims coordinates the LLM didn't earn
- The parent's own edits after prefill always win (mergePrefill only writes
  once, on button press)

## Acceptance criteria

- [ ] Pure unit suite: mergePrefill clamps grid/duration/title; drops unknown
      keys; invalid `startDate` dropped not coerced; neighborhoodId and kids
      never change; output passes validatePlaydateForm or the field is dropped
- [ ] Edge function unit-ish (Deno test or vitest against extracted pure
      schema-guard): oversize text → 400; unknown key → dropped; out-of-range
      minutes → dropped; bad JWT → 401; rate limit → 429
- [ ] e2e `prefill.e2e.ts` (mock function route): type sentence → tap Fill →
      summary shows the fields → Post lands the post; failure case shows the
      quiet error and the form is untouched; NO e2e calls a real LLM
- [ ] Privacy pins asserted: request body contains ONLY
      text/todayIso/timezone (code review + a test that snapshots the request
      body); no `text` in any console/error path (grep gate in review)
- [ ] Real deploy probe (coordinator, after human picks provider): curl with a
      real JWT → 200 subset of fields; anon → 401; sentence with a kid's name
      round-trips WITHOUT the name being echoed into logs (fn logs checked)
- [ ] `npm run build && npm run test` exit 0 (full e2e at batch gate)

**Migration check:** NONE — new function + secrets only; `supabase/migrations/`
untouched.

**Depends on:** tickets 01+02 merged (one writer on NewPlaydatePage);
`LLM_*` secrets + provider choice before the DEPLOY step only.