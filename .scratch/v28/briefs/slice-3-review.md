# Slice 3 review — kid photos on the onboarding kids card

You are `orchestrator-reviewer`, fresh context. **Do not load workflow skills.**

Repo: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.
**Slice commit: `0c08024`.** Its base is `c9ab382` (recorded at dispatch in `.scratch/v28/ledger.md`).
**Diff with `scripts/slice-diff.sh 3` if it exists, otherwise `git diff c9ab382 0c08024 -- src/ e2e/`.**
⚠️ **Diff against THAT base, not an arbitrary older commit** — a wrong base has already produced one
false finding in this batch.

Read first: `plan.md` §6 slice 3, `.scratch/v28/briefs/slice-3.md`, `docs/agents/code-structure.md`.

## What the slice must be, and the questions I want answered

The shape was **ruled, with two alternatives measured and rejected** (brief §"the ruled shape"): the kid
row is written **inside the photo's `onConfirm`** — validate → `addKid` (keeping the returned `Kid`) →
`uploadKidPhoto` — because `useCropStep` closes the `ImageBitmap` in a `finally` the moment `onConfirm`
resolves, so there is no "crop now, upload later". Judge the diff against **that**, not against a shape
you would have chosen.

1. **Is the ruled ordering actually implemented, and is it safe?** Specifically: does the row get its
   `kid.id` before the upload needs it, and what happens if `addKid` succeeds and `uploadKidPhoto` fails
   — is that state honest to the parent and recoverable, or a silent half-write?
2. **Continue must write only rows that have no `kid` yet.** Verify it cannot double-write a row that the
   photo path already persisted. This is the acceptance criterion I widened deliberately — state whether
   it holds by mechanism or only by test.
3. **The converse direction:** `removeKidRow` used to drop local state only, so a parent could "delete" a
   kid that still existed in the DB. Confirm the fix, and say what happens when `removeKid` fails.
4. **Photo rendering must never touch the raw `avatar_url` column** — kid photos are private, so it goes
   through `useKidPhotoUrls`. Confirm no path renders the raw column, including the error/absent cases.
5. **Kids remain optional and must never block the run.** The card is skippable; a failed photo must not
   trap the parent. Look for a path where a bad photo makes Continue unreachable.
6. **The e2e spec must not be vacuous.** It claims to prove the object lands and `avatar_url` is set, and
   that removal deletes the real row. **Say how you know it can fail** — a spec that would pass against a
   broken implementation is the defect this batch cares most about.

## The builder's own finding — I need your judgement, not agreement

The builder self-caught a bug in its first draft: its wrapper called the confirm handler
**fire-and-forget** (`void handleKidPhotoConfirm`), so the hook's `finally` closed the bitmap while the
encoder was still reading it, and **the failure disguised itself as "the chosen area is outside the
image"** — a wrong diagnosis aimed at the crop rect. It fixed the instance and asked for a **repo-level
guard** against the class.

**Answer explicitly:** is a guard warranted, and if so what would it actually check? A `useCropStep`
call site can lose the `await` by any indirection (a prop, a callback registry), which is what happened.
**If a guard is not practically enforceable, say that** — a guard that cannot fail is worse than none —
and say what would make the next occurrence loud instead of silent.

## Also assess

- The commit adds a **new file with no trailing newline** (`e2e/onboarding-kid-photo.e2e.ts`). **That is
  already ruled to slice 8b's sweep — do not file it as a finding**, it is noted here only so you do not
  spend time on it.
- `MAX_KIDS_PER_PROFILE`'s error path: does it surface honestly without trapping the card?
- Anything the diff does that the plan did not ask for, and anything the plan asked for that is absent.

## Verdict

**PASS | NEEDS_CHANGES | BLOCKED**, then findings. **Every finding must cite `file:line` and must state
what breaks and for whom** — a finding I cannot act on is not a finding. Order them by severity, and
**say plainly if you found nothing**: "PASS with no findings" is a complete and welcome answer.
