# ADR 0006 — Moderator tooling: a recommendation, not a build

**Status:** Proposed. **Date:** 2026-10-08.
**Annotation:** `muye39z4` — *"It's cool that you thought about adding moderator tools.
You know, if you can make any recommendations to me, I'd love to hear about them. for
additional tools."*

**This ADR builds nothing.** It answers the founder's request for recommendations, on
top of the moderation surface that already exists. Implementation is a later, separate
decision.

---

## 1 — What already exists (discovered, not assumed)

Before recommending anything, the current moderation surface, from the source:

| Surface | Where | What it does |
|---|---|---|
| The role | `profiles.moderators` (migration 0009) | a boolean on the profile; `canModerate` (`lib/moderation.ts`) is the pure guard |
| The wall | `App.tsx` route guard + RLS (`0008`) | non-moderators are redirected **and** get 0 rows from `listReports` — two independent walls |
| The queue | `/mod`, `ModPage.tsx` | the report list: reason, reporter/reported handles, the reported post, timestamp |
| Report actions | `ModPage.tsx` | **hide a post** (`playdates.hidden_at`), **ban a profile** (`profiles.banned_at`) — both final in v1, no un-hide/un-ban UI |
| Places write | `0062_place_photo_moderation.sql` | a **moderator-only UPDATE** policy on `places` (the only non-postgres write to the directory) |
| Photo review | `0063_place_photo_review_state.sql` + `PlacePhotoAdmin.tsx` | `photo_review_state` is `'confirmed'` / `'unreviewed'`; `'unreviewed'` photos are stored on the row but **not shown to parents** until a moderator confirms. The photo tool is on `/mod`, lazy-loaded, with a name filter — because scrolling 239 rows is not a tool anyone uses twice |

**The two things this inventory teaches:**

1. **There is already one review queue with a real lifecycle** (the photo tool).
   Anything new should be built *on that flow*, never beside it — a second queue
   with its own state machine is how moderation becomes two systems that disagree.
2. **v1's moderation is deliberately final** (no un-hide/un-ban). That was a choice,
   not an oversight, and it is the right default for a two-parent operation. Any
   recommendation that adds an undo must say why the finality is now wrong.

---

## 2 — The recommendation: three tools, ranked

**One recommendation, ranked, not a menu.** If only one is built, build #1.

### #1 — Un-hide and un-ban (make the final actions reversible)

**The gap:** both report actions are final in v1. A moderator who hides the wrong
post, or bans a parent who turns out to be the victim of a misreport, has no path
back — the only recovery is a manual database write by the operator.

**Why it is first:** it is the smallest change with the largest risk reduction, and it
is the one that removes a *fear* from using the tools at all. A moderator who knows a
mistake is permanent will under-act, which is its own failure mode. Both actions
already write a timestamp (`hidden_at`, `banned_at`) — the undo is a null write and a
button beside the existing one, on the same row.

**Cost:** one button per action, one confirmation. No new table, no new role.

### #2 — The suggestion intake queue (the `place_suggestions` half)

**The context:** the founder asked for user-addable places (`muyfptn4`). The scope
pass established that `places` is seed-only by design (no INSERT policy), so the
correct shape is a separate `place_suggestions` table with pending/accepted/rejected
— the intake was briefed as its own slice (`muzk…-suggest`).

**Why it is second:** it is already scoped and it reuses #1's lesson — a moderator
queue with a status column. It is the natural second user of the `/mod` page, and the
photo tool proves the lazy-load-with-a-filter shape works at this scale.

**Depends on:** the suggestion-intake slice landing first. This ADR does not build it.

### #3 — A "recently actioned" log (read-only)

**The gap:** once an action is taken, `/mod` forgets it. There is no way to see what
was hidden or who was banned last week, so a moderator cannot audit their own
decisions or spot a pattern (the same reporter filing three reports, one parent
repeatedly reported).

**Why it is third:** it is genuinely useful but purely additive — it fixes no
inability to act, only an inability to *review*. And it is the one that most invites
scope creep (filters, dates, exports), so it should be built last and small: a
reverse-chronological list of the last N actions with who/when/what.

---

## 3 — What I recommend AGAINST

- **Roles beyond "moderator".** The design already has one boolean. A three-tier
  (user / moderator / administrator) role model is the permissions engine the groups
  work explicitly deferred — it multiplies every policy and every UI by the number of
  tiers. Two parents do not need three roles. Revisit when there is a third person
  doing moderation who must not be able to ban.
- **Any new queue with its own state machine.** Extend the one that exists.
- **Auto-moderation / ML triage.** With this volume (4 reviews on 234 places; a
  handful of reports), a human reads everything faster than a model could be trusted.
  It is the right call at 1000x the volume, not here.
- **A public moderator log.** Naming who was banned, publicly, is a punishment tool.
  The log in #3 is moderator-only.

---

## 4 — The decision this ADR asks for

**Build #1 (un-hide / un-ban) as the next moderation slice?** It is small, it removes
a permanent-failure mode, and it needs no new schema. #2 attaches to the suggestion
work already scoped; #3 waits.

Nothing in this ADR is implemented. No code was written.
