# r3-1 INCIDENT — a real user's `going_pings` row was deleted by the e2e marker sweep

**Status: PUBLICATION BLOCKER. Recorded as an incident, NOT as a clean pass.**

**When:** 2026-10-03, the confirmed production sweep (`delete` mode).
**Outcome:** the sweep removed 2445 marker rows as intended **and** destroyed one
non-marker row. It **self-reported the failure** and exited 4.

```
SWEEP FAILED VERIFICATION — do not treat this release as clean:
  - going_pings: total went 5 → 4, expected 5 (claimed removal 0)
```

**Evidence, preserved unmodified:**
- `.scratch/v28/reports/r3-1-delete.txt` — the raw `delete` output, exit 4
- `.scratch/v28/reports/r3-1-verify.txt` — `verify` mode, exit 0 (marker-free)
- `.scratch/v28/reports/r3-1-confirmation.md` — what the human authorized

---

## Root cause — a CASCADE the sweep's WHERE clause did not model

**The sweep's scoping is correct for every row it names.** `going_pings` is scoped
`profile_id in VICTIMS` where `VICTIMS = select id from auth.users where email like 'e2e-%'`
(`scripts/lib/sweep-e2e.mjs:35,50`). Measured after the fact: **0 pings remain whose
`profile_id` is an e2e profile.** So the `going_pings` delete statement did **not** match
the destroyed row. It never saw it.

**The row was destroyed by a CASCADE from a parent the sweep legitimately deleted.**

Measured, from `information_schema.referential_constraints`:

| FK | delete_rule |
|---|---|
| `going_pings.playdate_id → playdates` | **CASCADE** |
| `going_pings.profile_id → profiles` | **CASCADE** |

The chain, exactly:

1. An `e2e-*` marker host owned a drop-in (one of the **3** marker `playdates` rows).
2. A **real** (non-`e2e`) parent pinged that drop-in. Their `going_pings` row has a
   `profile_id` that is **not** in `VICTIMS` — so the sweep's own clause never matched it,
   and the pre-delete count correctly reported `going_pings` marker rows = **0**.
3. The sweep deleted the marker-hosted `playdates` row (`host_profile_id in VICTIMS`).
4. PostgreSQL's `ON DELETE CASCADE` then deleted every `going_pings` row pointing at it —
   **including the real parent's.**

**So the count/delete pair was never a race.** The count was truthful at t0 and the delete
was truthful at t1: zero marker pings. The row that vanished was never in the marker set.
This is a **data-model** defect, not a timing defect — which is why the sweep's own
`total went 5 → 4` check, the only check that could see it, caught it.

### The hazard is not one table — it is a surface

Every FK below is `CASCADE`, so each parent the sweep deletes can silently take children
whose own clause never matched them:

| child | parent | consequence |
|---|---|---|
| `going_pings.playdate_id` | `playdates` | **the incident** |
| `comments.playdate_id` | `playdates` | real comments on an e2e-hosted drop-in |
| `comments.parent_id` | `comments` | real replies under a deleted comment |
| `playdate_kids.playdate_id` | `playdates` | real kids RSVP'd to an e2e drop-in |
| `playdate_kids.kid_id` | `kids` | — |
| `comments.author_profile_id` | `profiles` | — |
| `reports.reporter_profile_id` | `profiles` | — |
| `blocks.blocker_profile_id` / `blocked_profile_id` | `profiles` | — |
| `memberships.profile_id` | `profiles` | — |
| `follows.follower_profile_id` / `followee_profile_id` | `profiles` | **a real parent's follow of an e2e account** |
| `kids.profile_id` | `profiles` | — |
| `push_subscriptions.profile_id` | `profiles` | — |
| `playdate_series.host_profile_id` | `profiles` | — |
| `playdates.host_profile_id` | `profiles` | **the whole class: deleting an e2e host deletes the drop-in a real parent joined** |

**`follows` and `going_pings` are the two that hit real parents without the parent being a
marker.** Both are now covered by the fix's rule.

---

## Data recovery

**Not recoverable by this repo.** The deleted row was a `going_pings` row whose only
columns are `playdate_id, profile_id, created_at` (measured). Restoring it would require
knowing which of the 3 deleted drop-ins the parent had pinged — and those drop-ins were
e2e fixtures, so re-creating the ping would point a real parent at a test drop-in that was
itself deliberately removed.

- **Supabase PITR / backups:** whether the project retains point-in-time recovery is a
  plan question only the human can answer; this repo has no backup tooling and I did not
  touch the dashboard. **If PITR exists, the row is recoverable within the retention
  window.**
- **Practical impact:** one ping on a **test** drop-in. The drop-in itself is gone, so the
  ping had no remaining meaning. The harm is real but small — **and that is luck, not a
  safety property.** The same cascade against a real host's drop-in would have destroyed
  real RSVPs.

---

## Why the existing verification was right to be the thing that caught it

`verificationProblems` (`scripts/lib/sweep-e2e.mjs:101-122`) checks two independent things:
no marker survived, **and** each table's total moved by exactly the claimed marker count.
Only the second can observe a cascade — the deleted row was never a marker, so the marker
count went to zero exactly as intended.

**It is NOT weakened by this fix. It is strengthened** (see the fix note below).

---

## THE FIX

**Principle adopted: the sweep may delete only what it can POSITIVELY identify as
e2e-owned, and it must refuse when a cascade would reach anything else.**

A pre-delete, read-only **collateral gate** now runs before any delete. It is not
skippable — there is no flag that bypasses it, and `delete` refuses when it fails.

### `CASCADE_HAZARDS` (`scripts/lib/sweep-e2e.mjs`)

The 17 measured `ON DELETE CASCADE` edges reachable from a parent the sweep deletes.
Each row names: the doomed parent + its marker clause, the child, the child's FK column,
and **the child's OWN marker clause**.

For each edge the gate asks: *how many child rows sit behind a doomed marker parent
WITHOUT matching the child's own marker clause?* Those are rows the sweep never named
and could not count. **Any non-zero answer refuses the run (exit 5).**

### Why a pre-delete gate, and not "delete the children first"

Deleting the children explicitly would still delete a real parent's row — it would only
make the destruction *deliberate* instead of incidental. The requirement is that real
user data cannot be deleted, so the sweep must **decline**, not re-order.

### Why not a race fix

There is no race to fix. Both reads were honest: the marker count for `going_pings` was a
truthful zero at t0 *and* t1. Wrapping the delete in a transaction would make the
destruction atomic and equally wrong. **The defect is the deletion model, not the timing.**

### Fail-closed, three ways

- an **empty** probe refuses (D-030: an empty measurement is never a pass)
- a **non-array** probe refuses
- an **unreadable** blocker count refuses

## REGRESSION COVERAGE

`scripts/lib/sweep-e2e.check.mjs` (in the gate via `run-all.sh:134`), new checks:

| check | pins |
|---|---|
| **THE INCIDENT** | a real parent's ping behind a marker drop-in **refuses** |
| the refusal names the cascade edge | the message names `child.column -> parent.id`, not just a count |
| the refusal says "never named" | the reason states the rows were outside the sweep's clauses |
| a clean probe proceeds | all-zero is the only shape that runs |
| empty / non-array / unreadable refuse | fail-closed in three shapes |
| **every scope literal is `e2e-`** | no clause widened |
| every parent AND child clause references `VICTIMS` | no de-scoped hazard |
| the probe selects the parent uuid | `select 1` (uuid = integer, PG 42883) cannot regress silently |
| 17 edges covered | an unmodelled edge is an unguarded one |

**Mutation-tested this turn.** Four mutations, each required to make the checker exit
non-zero, plus one that legitimately cannot be caught:

| mutation | result |
|---|---|
| gate removed (pre-fix behaviour) | **caught** (exit 1) |
| `ACCOUNT_MARKER` emptied → scope = all accounts | **caught** (exit 1) |
| a hazard `childClause` de-scoped (`is not null`) | **caught** (exit 1) — *after* the coverage was added |
| a hazard `parentClause` de-scoped | **caught** (exit 1) |
| `select p.id` → `select 1` | **caught** (exit 1) |
| fail-open on an empty probe | **caught** (exit 1) |
| widening a literal that does **not** feed the probe | **not caught, correctly** — the probe's scope comes from the single `victimsClause()`, so that literal is dead for this invariant |

⚠️ **One mutation SURVIVED the first version of this test** (a de-scoped `childClause`),
and the coverage above exists because of it. A declared guard is not a working guard
until a mutation proves it can fail.

## END-TO-END PROOF, against the real production probe

Reproduced in a **rolled-back transaction** (nothing persisted; verified after: 52 users /
52 profiles / 21 playdates / 4 pings, identical to before, `e2e-simhost` absent):

1. inserted an `e2e-` host + profile + drop-in;
2. inserted **one** `going_pings` row from a REAL (non-`e2e`) profile to it;
3. ran the **real** `collateralProbeQuery()`.

Result: **`b0 = 1`** (`going_pings.playdate_id -> playdates`), **every other edge 0**.

**The gate refuses, and it refuses specifically** — one edge fires, not all 17.

## DATA RECOVERY

**Not recoverable from this repo.** The row was a `going_pings` row; its only columns are
`playdate_id, profile_id, created_at` (measured). Its drop-in was an e2e fixture that was
deliberately removed, so re-creating the ping would point a real parent at test data.

- **If the Supabase project has PITR enabled**, the row is recoverable within the
  retention window. **This repo has no backup tooling and I did not touch the dashboard —
  it is a plan question for the human.**
- **Practical impact: small but real.** One ping on a test drop-in that no longer exists.
  **That is luck, not safety** — the same cascade against a real host's drop-in would have
  destroyed real RSVPs.

## DURABILITY — why a sweep is the wrong long-term answer

**The e2e suite drives the LIVE production Supabase project.** `playwright.config.ts` and
`e2e/fixtures.ts:61-67` read `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` **from the repo
`.env`** — the same project ref (`ayzvjwxbxyrcgyoeaxuk`) that serves real parents. There is
no separate test project. `docs/agents/e2e-fixture-convention.md` states it plainly:
*"Every spec writes real rows to the same database real parents read."*

**Measured scale of the churn:** the 2026-10-03 sweep removed 1195 accounts; ~40 more
markers were created by e2e runs in the ~90 minutes after it. **A manual sweep is a
snapshot of a stream.** Publication on this architecture means re-running a destructive
production script before every release, forever.

**Options, ranked:**

1. **BEST — a separate Supabase project (or branch) for e2e.** The only option that
   removes the class of defect rather than managing it. Real parents can never be in the
   marker set because they are not in the same database. Cost: `.env` split, migrations
   applied to both, seed data for the specs that assume a populated directory.
2. **GOOD — automated, pre-release cleanup with the safety gate** (this fix, run by CI or
   a documented release step). Cheap, and now safe — but the sweep stays destructive and
   the window between runs keeps leaking fixtures into the feed.
3. **WEAK — a publication cleanup step only.** What exists today. It leaks between
   releases and depends on a human remembering; the 2026-10-03 incident is what that
   produces.

**Recommendation: 1, with 2 as the bridge.** Option 2 is now safe to run but does not stop
real parents seeing fixtures between releases — which is the actual product harm.

