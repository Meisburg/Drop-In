# APPLY THIS — migration 0045 (the one live defect)

**Status:** the deployed app offers "Within 1 mile" and the database rejects it.
`t09` made the rejection readable, but it is still a rejection. This fixes it.

**Time:** about 60 seconds. **Risk:** none — it is a constraint WIDEN, so no
existing row can become invalid, and it is idempotent (safe to run twice).

---

## Option C — paste it yourself (no token, no sharing, ~60s)

1. Open **https://supabase.com/dashboard/project/ayzvjwxbxyrcgyoeaxuk/sql/new**
2. Paste the block below.
3. Click **Run**.

```sql
alter table public.profiles drop constraint if exists "profiles_radius_miles_chk";

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_radius_miles_chk'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint "profiles_radius_miles_chk" check (radius_miles between 1 and 35);
  end if;
end
$$;
```

Expected: "Success. No rows returned."

### Then confirm it in the SAME window (one more Run)

Paste this and Run. It reads the constraint back out of the catalog, so it
proves the change landed rather than assuming the first statement worked:

```sql
select pg_get_constraintdef(oid) as now_enforced
from pg_constraint
where conname = 'profiles_radius_miles_chk'
  and conrelid = 'public.profiles'::regclass;
```

**Success looks like exactly this** (verified against a real Postgres 16, not
guessed — note the TRIPLE parentheses, which is what the catalog actually
renders for a `between`):

| now_enforced |
|---|
| `CHECK (((radius_miles >= 1) AND (radius_miles <= 35)))` |

If it still shows `>= 2`, the widen did not take — re-run the first block (it is
idempotent, so running it twice is safe and expected).

**Then tell me it's done** and I will verify from here that a 1-mile radius
actually saves, run the migration-acceptance e2e test that is waiting for this
exact moment, and record it in task-state. That test
(`e2e/feed-empty-state.e2e.ts` → "a 1-mile radius really saves") currently FAILS
— it is the acceptance check for this migration and it flips green when the
widen lands.

---

## Option B — hand me a token (I do it, no browser)

1. Open **https://supabase.com/dashboard/account/tokens**
2. Generate a token named e.g. `dsh-migration-0045`.
3. Paste it to me as `sbp_…`.

I call `api.supabase.com/v1/projects/<ref>/database/query` with `fetch` — **no
browser window opens on your machine** — then you revoke the token.

---

## Option A — let me run the existing script

Say **"apply 0045 via script"**. `scripts/apply-migration.mjs` extracts a token
from your logged-in Chrome via CDP, which **opens a dashboard tab briefly** in
the window you are working in. This is why it needs your explicit yes.

---

## Why this matters (one line)

Until this runs, a real user can pick "Within 1 mile" and be told it isn't
allowed. After it runs, it works. Nothing else in the batch is outstanding
except the two product rulings.
