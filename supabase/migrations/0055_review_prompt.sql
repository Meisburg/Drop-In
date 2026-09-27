-- ===========================================================================
-- V26 slice 1 (migration 0055): the `review_due` notification kind — the kind
-- exists end to end, with NO producer.
-- ===========================================================================
--
-- What this does: widens ONE existing CHECK constraint and replaces ONE
-- existing function. It adds no table, no column, no index, no policy, no
-- trigger, and no row. Strictly additive and re-paste-safe: this is a
-- LIVE-DATABASE migration (the project holds real family data), so every
-- statement is guarded.
--
-- WHAT IT DELIBERATELY DOES NOT DO — read this before "finishing" it:
--
--   * NO PRODUCER. Nothing here scans, sends, or writes a notification.
--     `catchUpReviewDue`, `REVIEW_PROMPT_WINDOW_HOURS` and the sender wiring
--     are V26 slices 2 and 3; this slice creates only the KIND, the copy rule
--     and the URL rule, so a reviewer can see the name is legal everywhere it
--     must be legal before anything can create one.
--   * NO TRIGGER. `notify_playdate_cancelled()` (0041 section 3) is untouched,
--     and no new trigger is added. A review prompt is CLOCK-produced, so it
--     belongs to the every-5-minutes sender scan, not to a row event.
--   * NO RLS OR POLICY CHANGE. `notification_log` keeps its one owner-only
--     SELECT policy (0032 pin c).
--
-- WHY `review_due` AND NOT `ended`: `'ended'` (0041) already means "the host
-- ended it early — don't head out". A review prompt is the opposite moment, in
-- the opposite direction (the drop-in is over; go read — and rate — where it
-- happened), and it carries different copy. Reusing `'ended'` would make one
-- row mean two contradictory things and would collapse the two into ONE
-- notification by the `unique (profile_id, kind, playdate_id)` key.
--
-- THE HONESTY PIN (hard rule, not a style note): the copy says
--   body: 'You said you were going — rate the place.'
-- and NOT "you went". `going_pings` (0007) has NO status column and no
-- check-in exists anywhere in the schema, so a ping is a STATED INTENTION, not
-- evidence of attendance. "You went" would be a falsehood for every no-show —
-- i.e. for the exact parent most likely to be prompted. Every twin of this
-- string is pinned char-for-char (TS `buildNotificationPayload` in
-- supabase/functions/_shared/pushCopy.ts, and the SQL branch below).
--
-- PINNED DECISIONS
--
-- (a) THE KIND LIST IS THE SAME SIX IN ALL SEVEN PLACES. `notification_log.
--     kind`'s CHECK is one of seven hand-maintained descriptions of one
--     constraint (the DB CHECK; `NOTIFICATION_KINDS` in pushCopy.ts;
--     `EMAIL_KINDS` in emailCopy.ts; the `NotificationKind` union +
--     `NOTIFICATION_KIND_COPY` in src/lib/push.ts; `notification_payload`'s
--     CASE branches; and the hand-written name array + docstring in
--     `e2e/push-subscribe.e2e.ts`, which `npm run verify` cannot see because
--     e2e is a separate lane — that omission is how the sixth toggle rendered
--     unasserted until review caught it). `src/lib/email.test.ts` asserts the
--     two lists are equal and `src/lib/push.test.ts` pins the list from the
--     app side; both are green with six entries.
--
-- (b) THE `notification_payload` BRANCH IS DELIBERATELY UNREACHABLE IN
--     PRODUCTION — recorded here so a reviewer does not re-litigate it.
--     `review_due` is clock-produced: the slice-3 scan builds the row's
--     title/body/url in TypeScript exactly as `catchUpStartingSoon` already
--     does (supabase/functions/send-push/index.ts), so no trigger ever calls
--     `notification_payload` with this kind. Section 2 exists for TWIN PARITY
--     with the TS rule — the same reason 0041 added its `ended` branch to the
--     same function — and its absence would be a silent divergence the day
--     somebody wires a trigger anyway.
--
--     THE ONE PLACE PARITY CANNOT BE EXACT, stated plainly: the pinned
--     signature is `(text, uuid, text, text, int)` and gains NO parameter, so
--     the function has no place-id argument. The `review_due` URL branch
--     therefore reads the place id from the SECOND argument position (the
--     caller must put the place id there); every other kind keeps `t.link`
--     char-for-char. Unreachable (pin b), so this cannot affect a live row.
--
--     CALLER PRECONDITION — A NULL PLACE ID FAILS HARD, SO GATE ON IT.
--     Because there is no place-id parameter, there is also no SQL fallback:
--     `'/place/' || null::text || '/details'` is NULL. That NULL then meets
--     `notification_log.url`, which is `text not null`
--     (0032_notification_log.sql:163), so a caller or trigger that passes NULL
--     — e.g. for a HOME drop-in, `playdates.place_id` being nullable BY DESIGN
--     (0030_playdates_place.sql:83, and 0030's pin (a): every post created
--     before it carries NULL) — produces a FAILED INSERT, not a fallback. The
--     TS twin can fall back to the drop-in route (`pushCopy.ts`, the
--     `placeId === '' ? url : reviewPromptUrl(placeId)` branch); this SQL
--     branch CANNOT, and pretending otherwise would be the silent divergence
--     this file exists to prevent. So: ANY caller MUST gate on
--     `place_id IS NOT NULL` and MUST NEVER pass NULL. That is also the
--     product-correct gate, not merely a defensive one — a home drop-in has no
--     place to rate (0052's `reviews` is place-keyed), which is the same reason
--     the slice-3 scan will skip a NULL place_id. Section 3 PROBES this and
--     asserts the NULL url, so the sharp edge is machine-visible rather than a
--     header claim.
--
-- (c) THE FUNCTION'S EXECUTE POSTURE AND `prosecdef`/`stable` FLAGS ARE
--     UNCHANGED FROM 0041: this file re-issues 0032's revokes (public, anon,
--     authenticated) and its `grant execute … to service_role`, and the
--     DROP + CREATE carries 0041:254-256's body verbatim — `language sql`,
--     `stable`, `set search_path = public, pg_temp`, and NOT
--     `security definer`. The function has never been SECURITY DEFINER (0032
--     and 0041 both omit it; it is a pure formatter with no table access), so
--     adding the flag here would be a privilege change dressed as a copy
--     change, and it would break Slice 1's own acceptance criterion 3 ("the
--     same `prosecdef`/`stable` as before"). Do NOT add it. Section 3's
--     read-back ASSERTS `prosecdef = false` rather than trusting this comment.
--
-- Idempotent + re-paste-safe (the 0016/0019/0041 structure): the kind CHECK is
-- 0032's INLINE unnamed constraint, so its guards match by COLUMN (any table
-- CHECK whose key includes `kind`) rather than by the auto-name — robust to
-- the auto-name, and the add re-creates it explicitly named. A second paste
-- drops the six-value constraint and re-adds it identically: a no-op, not an
-- error. The function is DROP + CREATE (it returns a table — the
-- 0021/0028/0032/0041 structure).
--
-- Apply order: independent, but assumes 0041 is applied (it is — the last
-- applied migration is 0054). Section 1 widens the FIVE-value constraint
-- 0041 left behind, so applying this before 0041 would still produce the
-- correct six-value constraint (section 1 drops whatever kind CHECK exists).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Widen notification_log.kind's CHECK (0041's 5-value constraint becomes
--    the 6-value one). 0032 declared it inline (0032:155), so Postgres
--    auto-named it `notification_log_kind_check`; the guards match by column
--    (any table CHECK whose key includes `kind`) so a re-paste is safe
--    regardless of the auto-name (pin a).
-- ---------------------------------------------------------------------------
do $$
declare
  v_conname text;
begin
  select c.conname
    into v_conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid
                         and a.attnum = any (c.conkey)
   where c.conrelid = 'public.notification_log'::regclass
     and c.contype = 'c'
     and a.attname = 'kind'
   limit 1;
  if v_conname is not null then
    execute format(
      'alter table public.notification_log drop constraint %I', v_conname
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid
                           and a.attnum = any (c.conkey)
     where c.conrelid = 'public.notification_log'::regclass
       and c.contype = 'c'
       and a.attname = 'kind'
  ) then
    alter table public.notification_log
      add constraint "notification_log_kind_check"
      check (kind in ('ping_received', 'starting_soon', 'cancelled',
                      'new_comment', 'ended', 'review_due'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The copy rule (pins b and c): `notification_payload` gains the
--    `review_due` branch. DROP + CREATE — it returns a table (the
--    0021/0028/0032/0041 structure); every other branch is carried over
--    char-for-char from 0041:246-301.
-- ---------------------------------------------------------------------------
drop function if exists public.notification_payload(text, uuid, text, text, int);

create function public.notification_payload(
  p_kind text,
  p_playdate_id uuid,
  p_post_title text,
  p_actor_name text,
  p_going_count int
)
returns table (title text, body text, url text)
language sql
stable
set search_path = public, pg_temp
as $$
  with t as (
    select
      -- A post whose title is unreadable (a pre-0005 row, or a title that was
      -- cleared) falls back to "your drop-in" rather than rendering `"null"`
      -- or an empty pair of quotes — the same fallback the feed's while-away
      -- copy uses (src/lib/feed.ts, quotedTitle).
      coalesce(nullif(btrim(p_post_title), ''), 'your drop-in') as subject,
      coalesce(nullif(btrim(p_actor_name), ''), 'A parent') as actor,
      greatest(coalesce(p_going_count, 0), 0) as going,
      '/playdate/' || p_playdate_id::text as link
  )
  select
    case p_kind
      when 'ping_received' then t.actor || ' is going'
      when 'new_comment' then t.actor || ' commented'
      when 'cancelled' then 'Cancelled: "' || t.subject || '"'
      -- 0041: honest history (pin d) — an early end is labelled "Ended",
      -- not "Cancelled".
      when 'ended' then 'Ended: "' || t.subject || '"'
      when 'starting_soon' then 'Starting soon: "' || t.subject || '"'
      -- 0055: `How was "<subject>"?` — char-for-char the TS title in
      -- buildNotificationPayload's `review_due` branch (pin b).
      when 'review_due' then 'How was "' || t.subject || '"?'
      else 'Drop In'
    end as title,
    case p_kind
      when 'ping_received' then 'to "' || t.subject || '"'
      when 'new_comment' then 'on "' || t.subject || '"'
      -- The "don't drive to an empty park" sentence (0032 pin e).
      when 'cancelled' then 'The host called it off — don''t head out.'
      -- 0041: the same sentence class for the early-end case (pin d).
      when 'ended' then 'The host ended it — don''t head out.'
      when 'starting_soon' then
        'Starts within the hour · '
        || case
              -- The zero branch (see the amendment note in 0032's header): a
              -- NULL/0 count says who is actually coming rather than printing
              -- "0 families are going" at a parent who is going.
              when t.going <= 0 then 'you''re the only one going so far'
              when t.going = 1 then '1 family is going'
              else t.going::text || ' families are going'
            end
      -- 0055: NOT "you went" (the header's honesty pin). `going_pings` has no
      -- status column and no check-in exists, so a ping is a stated intention
      -- and this sentence stays true for a no-show too.
      when 'review_due' then 'You said you were going — rate the place.'
      else ''
    end as body,
    -- 0055: the review prompt opens the PLACE, not the drop-in. The pinned
    -- signature has no place-id parameter (see the header), so this branch
    -- reads the place id from the second argument position; every other kind
    -- keeps `t.link` char-for-char.
    --
    -- NULL IN, NULL OUT — A CALLER MUST GATE ON `place_id IS NOT NULL` (header
    -- pin b). `'/place/' || null::text || '/details'` is NULL, there is no SQL
    -- fallback (the second argument is the place id, so `t.link` is NULL too
    -- when it is NULL), and `notification_log.url` is `text not null`
    -- (0032:163): passing NULL turns a home drop-in into a FAILED INSERT. The
    -- TS twin falls back to the drop-in route; this branch cannot, and must
    -- never be called as if it could. Section 3 probes exactly this and
    -- asserts the NULL url.
    --
    -- NO ENCODING QUESTION HERE, unlike the TS twin: `reviewPromptUrl` applies
    -- `encodeURIComponent` to match the canonical `placeDetailsPath`
    -- (src/lib/places.ts), but this argument is TYPED `uuid`, so it can never
    -- contain `/` or any character encoding would alter. The two spellings
    -- agree by construction for every value this branch can be handed.
    case p_kind
      when 'review_due' then '/place/' || p_playdate_id::text || '/details'
      else t.link
    end as url
  from t;
$$;

-- The EXECUTE posture is 0032's (re-issued so this file is self-contained):
-- the formatter is the SENDER's; the schema owner (the dashboard SQL path the
-- coordinator's probe uses) can always call it.
revoke execute on function public.notification_payload(text, uuid, text, text, int) from public;
revoke execute on function public.notification_payload(text, uuid, text, text, int) from anon;
revoke execute on function public.notification_payload(text, uuid, text, text, int) from authenticated;
grant execute on function public.notification_payload(text, uuid, text, text, int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Read-back — the migration asserts its own effect rather than assuming it.
-- ---------------------------------------------------------------------------
-- The house lesson (V18): a 2xx write touching zero rows exits 0 with a
-- reassuring log. These are READ-ONLY probes; they raise if the kind CHECK was
-- not actually widened, if a second stray kind CHECK survived, if the function
-- lost its pinned signature, its STABLE flag or its `prosecdef` flag, if the
-- `review_due` branch does not render the pinned strings, or if the NULL
-- place-id contract (header pin b) has changed. The functional probes are
-- possible because the schema owner always holds EXECUTE (0032's own note)
-- and the function is STABLE — it writes nothing.
do $$
declare
  missing text[] := array[]::text[];
  v_def text;
  v_count int;
  v_title text;
  v_body text;
  v_url text;
  v_url_null text;
  v_volatile text;
  v_prosecdef boolean;
begin
  -- (1) Exactly one CHECK on `kind`, and it is the widened six-value one. A
  --     surviving five-value twin is the failure that looks like success: the
  --     insert would fail with a constraint the reader is not looking at.
  select count(*) into v_count
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid
                         and a.attnum = any (c.conkey)
   where c.conrelid = 'public.notification_log'::regclass
     and c.contype = 'c'
     and a.attname = 'kind';

  if v_count <> 1 then
    missing := array_append(
      missing, format('expected exactly 1 CHECK on kind, found %s', v_count)
    );
  end if;

  select pg_get_constraintdef(c.oid) into v_def
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid
                         and a.attnum = any (c.conkey)
   where c.conrelid = 'public.notification_log'::regclass
     and c.contype = 'c'
     and a.attname = 'kind'
   limit 1;

  -- The new value is admitted, and the existing five were not lost on the way.
  if v_def is null or position('review_due' in v_def) = 0 then
    missing := array_append(missing, 'kind CHECK does not admit review_due');
  end if;
  if v_def is null or position('ping_received' in v_def) = 0 then
    missing := array_append(missing, 'kind CHECK lost the pre-existing kinds');
  end if;

  -- (2) The function is the SAME signature it has always had, still STABLE, and
  --     with the SAME `prosecdef` flag it has always had (pin c: SECURITY
  --     DEFINER is absent in 0032 and 0041 and this file does not add it). All
  --     three are ASSERTED, not printed — a value that is only printed is a
  --     claim, and this read-back exists to prove the migration's own effect
  --     (0052's rule). `to_regprocedure` returns NULL rather than raising, so
  --     an absent function is reported rather than aborting the read-back.
  select p.provolatile::text, p.prosecdef
    into v_volatile, v_prosecdef
    from pg_proc p
   where p.oid = to_regprocedure(
           'public.notification_payload(text, uuid, text, text, int)'
         );

  if v_volatile is null then
    missing := array_append(
      missing,
      'function public.notification_payload(text, uuid, text, text, int)'
    );
  else
    if v_volatile <> 's' then
      missing := array_append(missing, 'notification_payload is no longer STABLE');
    end if;
    if v_prosecdef is distinct from false then
      missing := array_append(
        missing,
        format('notification_payload prosecdef changed to %s', v_prosecdef)
      );
    end if;
  end if;

  -- (3) The branch actually RENDERS the pinned copy (not merely exists). Only
  --     run when (2) found the function, so the failure message stays honest.
  if v_volatile is not null then
    select pl.title, pl.body, pl.url
      into v_title, v_body, v_url
      from public.notification_payload(
             'review_due', gen_random_uuid(), 'Green Lake', null, null
           ) pl;

    if v_title is distinct from 'How was "Green Lake"?' then
      missing := array_append(missing, format('review_due title is %L', v_title));
    end if;
    if v_body is distinct from 'You said you were going — rate the place.' then
      missing := array_append(missing, format('review_due body is %L', v_body));
    end if;
    if v_url is null or v_url not like '/place/%/details' then
      missing := array_append(missing, format('review_due url is %L', v_url));
    end if;

    -- (4) The NULL PLACE-ID CONTRACT, probed rather than asserted in prose
    --     (header pin b). A caller MUST gate on `place_id IS NOT NULL`: this
    --     branch has no SQL fallback, and a NULL url would hit
    --     `notification_log.url`'s NOT NULL (0032:163) as a failed insert.
    --     PASSING this probe is the proof that the sharp edge is real and
    --     stays documented; a future "helpful" fallback added here would fail
    --     it and force the contract to be re-read instead of silently
    --     changing.
    select pl.url
      into v_url_null
      from public.notification_payload(
             'review_due', null::uuid, 'Green Lake', null, null
           ) pl;

    if v_url_null is not null then
      missing := array_append(
        missing,
        format(
          'review_due with a NULL place id must yield a NULL url (the caller gates on place_id IS NOT NULL), got %L',
          v_url_null
        )
      );
    end if;
  end if;

  if array_length(missing, 1) is not null then
    raise exception '0055 read-back FAILED — %', array_to_string(missing, '; ');
  end if;

  raise notice '0055 read-back OK — kind CHECK admits 6 kinds including review_due; notification_payload stable (security definer = %), review_due → % / %', v_prosecdef, v_title, v_url;
end
$$;
