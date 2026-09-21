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

**Then tell me it's done** and I will verify it from here by checking that a
1-mile radius saves, and record it in task-state.

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
