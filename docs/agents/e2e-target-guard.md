# E2E target guard

**Enforcer:** `scripts/guards/e2e-target-guard.mjs` (runs inside `npm run guards`,
which runs inside `npm run verify`).
**Behavior proof:** `scripts/guards/e2e-target-guard.check.mjs` — 15 seeded
shapes, 11 that must refuse and 4 that must accept.
**Policy file:** `e2e/.e2e-target.json`.

## Why this exists

Every other control around the e2e suite governs what a spec **writes**:
the marker convention (`docs/agents/e2e-fixture-convention.md`), the sweep that
removes markers, and `0060`'s rule that a fixture action notifies nobody. All of
them share one assumption — that the suite is aimed at the live project, and the
damage must therefore be cleaned up afterwards.

That assumption is the defect. The convention doc states the durable fix in its
own words: *"a separate Supabase project or branch for e2e, so the marker set and
real parents are never in the same database."* The measured cost of not having it
sits two paragraphs above that sentence: **1195** accounts swept, ~40 more created
in the 90 minutes after, and the 2026-10-03 incident where a real parent's
`going_pings` row was destroyed by a cascade from a marker parent.

Marker hygiene is what makes that damage **recoverable**. Pointing the suite
somewhere else is what makes it **not happen**. This guard is the target half.

## What it checks

The project ref that `e2e/` will actually talk to — resolved from the same place
the specs resolve it (`readSupabaseEnv()` → the repo `.env`) — against the
allowlist in `e2e/.e2e-target.json`.

```json
{
  "testRefs": [],
  "productionRef": {
    "ref": "ayzvjwxbxyrcgyoeaxuk",
    "environment": "production",
    "reason": "why running against real parents' database is acceptable right now",
    "expires": "2026-11-15",
    "extensionsUsed": 0,
    "extensions": []
  }
}
```

Two ways to pass:

- the ref is listed in `testRefs` — **the state this guard exists to reach**; or
- the ref matches `productionRef`, which declares its environment, carries a
  written `reason`, and has an `expires` date still in the future.

## The rules, and why each one is a rule

| Rule | Why |
| --- | --- |
| `.env` readable, ref parseable | An unresolvable target is a finding, not a pass. |
| Config file exists and parses | Nothing declares the target → nothing vouches for it. |
| `environment` is the literal `"production"` | The failure is a target that **looks** declared while nobody said which environment it is. The environment is stated, never inferred. |
| `reason` non-empty | A waiver nobody had to justify is a waiver nobody reconsiders. |
| `expires` is a future `YYYY-MM-DD` | A waiver that never ends is how the separate test project never gets built. |
| `extensionsUsed` ≤ 1 | **See below.** |
| `extensionsUsed` equals `extensions.length` | A count with no dates behind it is a number someone typed. |
| Every extension has `reason` + `on` | An extension with no stated cause is indistinguishable from forgetting to fix it. |

### Why one extension, and not just a date

A date alone is a chore: change the string, stay green, learn nothing. The first
renewal is permitted and must be **recorded** in `extensions`. The second is
refused outright — the only ways forward are the two the convention doc already
names: build the separate test project, or argue for production in the open.
The refusal is not escapable by a flag.

### Why it fails CLOSED

Deliberately the opposite of `is_e2e_profile(uuid)` in migration `0060`. That
predicate fails **open** because its failure mode is *every parent's alerts
switched off at once* — worse than the noise it exists to stop. This guard's
failure mode is *the suite did not run*, so refusing to run is strictly better
than running blind against a target it cannot identify.

## What it does NOT cover

- **Rows already in production.** That is the sweep's job
  (`scripts/sweep-e2e-markers.mjs`), not the repo's.
- **The live database.** It never contacts Supabase, by design: a guard that
  needs credentials to pass is a guard that gets skipped.
- **Whether a waiver is honest.** It checks that a reason exists and a date has
  not passed. It cannot read minds, and it should not pretend to.
- **Operational sequencing.** This guard does not tell you *when* it is safe to
  run e2e. Until a separate test project exists, a production run still writes
  fixtures real parents can see, and must be followed by the collateral-aware
  sweep. Do not run the full suite while the beta is live.

## Changing the policy

Editing `e2e/.e2e-target.json` is a **reviewable act**, not a config tweak —
that is why the policy is a git-tracked file rather than an environment
variable. An env var does not appear in a diff; a changed expiry date does.

Changing the guard's own logic additionally requires updating
`e2e-target-guard.check.mjs` with the shape that proves the new rule fires. A
rule whose behavior is unchecked looks exactly like a clean repo.
