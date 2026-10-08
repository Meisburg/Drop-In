# v35-C report — the radius default returns to five miles (`muydy8tg`)

**Sentinel:** `V35-C-FIVE-MILES-N6T4`
**Status:** DONE
**Branch:** `five-miles-n6t4` @ `/tmp/pd-wt/five-miles-n6t4` · **Base:** `HEAD` · **Not pushed.**

---

## 1. The founder ruling

> *"Maybe let's make five miles the default for now."* — `muydy8tg-2zne8j`

This **reverses migration 0066**, which narrowed the default from 5 to 1 on an
earlier ruling. The reversal is deliberate and recorded as such in the migration
comment ("for now" — a tuning value, not a structural decision).

## 2. What changed

| File | Change |
|---|---|
| `src/lib/feed.ts` | `DEFAULT_RADIUS_MILES` 1 → 5; three docblocks state the reversal and name the ruling |
| `src/lib/feed.test.ts` | the radius-escape expectations move with the default (see §4) |
| `src/lib/places.test.ts` | the sibling radius expectations follow the same constant |
| `supabase/migrations/0069_radius_default_five.sql` | **new** — `alter column profiles.radius_miles set default 5` |

**One named constant.** Every read site already resolves the default through
`DEFAULT_RADIUS_MILES` (`profile.radius_miles ?? DEFAULT_RADIUS_MILES`), so no
literal `5` was scattered. The DB column default is the backstop and now agrees
with the code constant.

## 3. Migration 0069 — applied twice, read back

```
BEFORE:  column_default = "1"
APPLY 1: → applying 0069_radius_default_five.sql (2113 bytes) … ✓ OK
READBACK: column_default = "5"
APPLY 2: → applying 0069_radius_default_five.sql (2113 bytes) … ✓ OK   (idempotent)
READBACK: column_default = "5"
```

`set default` rewrites no rows, so no data-loss exception is needed and the
statement is inherently re-runnable. No constraint changed (the 0045 CHECK is
1–35, and 5 was already legal inside it).

## 4. ⚠️ The two test failures the gate caught, and why the tests were wrong

The first gate run failed 2 tests. Both encoded a **false premise**: that a
radius *below* the new default earns a narrow "Back to 5 miles" escape.

The implementation offers the narrow escape only when
`radiusMiles > DEFAULT_RADIUS_MILES`. At 1 or 2 miles the parent is already
**narrower** than the default; a "Back to 5 miles" button there would *widen*,
which is the widen escape's job. So at 1 and 2 only the two widen escapes render.

The tests were corrected to assert the real contract:
- `radiusEscapes(1)` → `[20, 35]` (no narrow escape below the default)
- `radiusEscapes(2)` → `[20, 35]`
- `radiusEscapes(10)` → `[5, 20, 35]` (10 > 5, so the narrow escape is real)

This is the repo's named "acceptance test that cannot fail" class in reverse —
an assertion that would have *pinned a behaviour the product does not have*.
The gate is what caught it.

## 5. Gate

```
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only
  server.host change (another session), not this slice" npm run verify
```

- `build` ✓ · `typecheck:e2e` ✓
- `test` ✓ **92 files / 2709 tests**
- `lint` ✓ 88 warnings, **0 errors**
- `a11y:focus` ✓ PASS
- `steering-lint` ✗ — **the only red**, and only this fresh worktree's five
  `docs/agents/*` pointers (another lane's, untracked in this checkout). Not this
  slice's.
- `guards` ✓ **GUARDS: PASS — all deterministic rules hold** (185 checks)

## 6. Scope

```
src/lib/feed.ts        the constant + three docblocks
src/lib/feed.test.ts   the escape expectations
src/lib/places.test.ts the sibling radius expectations
supabase/migrations/0069_radius_default_five.sql   new
```

Nothing pushed. `origin/master` untouched.
