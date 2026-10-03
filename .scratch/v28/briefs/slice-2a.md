# Builder brief — V28 Slice 2a (the write sites ask for a location in place)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**
(branch `Meisburg/onboarding`, base `aaae132`).

## Read first

1. `plan.md` → **Slice 2a only** (and the Risks note about why 2a comes before
   2b). Slice 1 is done and is not your concern.
2. `docs/agents/code-structure.md` — the build law.

Do **not** read `PlaydateDetailPage.tsx` (2,803 lines) or `NewPlaydatePage.tsx`
(1,547) whole. The exact functions are named below; read around them.

## Why this slice exists and why it is FIRST

The batch moves the location requirement off the app-wide wall and onto the
writes. If the wall came down first, the requirement would be **removed, not
moved** — a parent with no home ZIP could ping or host with no location. So the
guards land first, while the wall is still standing, and only then (Slice 2b)
does the wall come down. **At no point may the requirement be absent.**

## The slice

### 1. New shared component — `src/components/LocationRequiredNotice.tsx`

A short presentational line: we need a place before you can do this, with a real
control whose action reaches `/onboarding` (the area card). Requirements:

- ≥44px tap target, a visible focus cue, and it must pass `npm run a11y:focus`.
- Presentational only — **no data access, no routing logic** (the build law:
  React renders and does not decide). It takes whatever it needs as props.
- Reuse the existing empty-state/notice styling patterns in
  `src/components/RadiusEmptyState.tsx` rather than inventing new ones.

### 2. The ping site — `src/pages/PlaydateDetailPage.tsx:875`

`async function handlePingToggle()` is the signed-in going action; it reaches
`togglePing(playdateId)` (`src/lib/db.ts:1622`). The viewer is available as
`profile` from `useSessionContext()` (`PlaydateDetailPage.tsx:375`).

- With `profile?.home_zip` unset, **do not call `togglePing` to SET the ping**;
  show the notice instead.
- **Clearing a ping must stay allowed.** The guard blocks *setting*, not
  *clearing* — otherwise a parent who somehow holds a ping without a zip is
  trapped unable to withdraw it. If the toggle is already on, let it turn off.
- With a zip set, behaviour is exactly as today.

### 3. The host site — `src/pages/NewPlaydatePage.tsx:1115`

`async function handleSubmit(e: FormEvent)` calls `createPlaydate(...)` at line
1162. The viewer's profile is available at line 325.

- With `profile?.home_zip` unset, **do not call `createPlaydate`**; show the
  notice. Do not silently discard the form's values — the parent should be able
  to set a location and come back to finish.
- With a zip set, behaviour is exactly as today.

Follow the existing defensive pattern rather than inventing one:
`NewPlaydatePage.tsx:905` and `FeedPage.tsx:399` already handle an unset
`home_zip` for the map pin by returning null.

## Out of scope — do not touch

- `src/lib/onboarding.ts` — the gate change is Slice 2b. **The wall stays up in
  this slice.**
- `src/pages/FeedPage.tsx` — the no-zip feed state is Slice 2c.
- `src/App.tsx`, anything under `e2e/`, `plan.md`, `task-state.md`,
  `.scratch/v28/ledger.md`, `.opencode/`.

## Acceptance criteria

- With `profile.home_zip` unset: the ping action writes no ping and shows the
  notice; `handleSubmit` calls no `createPlaydate` and shows the notice.
- With a zip set: both paths are unchanged.
- Clearing an existing ping still works with no zip.
- The notice's action reaches `/onboarding`; it is a real control, not a string.
- No other page changed; `useSessionContext()`'s surface unchanged.

## Verification

```
npm run verify
npx playwright test e2e/golden-path.e2e.ts
```

Paste the real output tails (test counts, the GUARDS line, the e2e summary).
**If `golden-path` fails, report the failure; do not edit the spec to make it
pass** — that spec is a lane this batch must not silently retune (Slice 7 owns
spec changes).

**If both sites will not land cleanly, land the ping site, stop, and report
DONE for the ping and BLOCKED for the host** — naming exactly what remains.
Half-wiring both is the failure mode this slice exists to avoid.

## Commit

Scoped `git add` of the files you changed (the orchestrator's records may be in
the tree). Commit only when the gate is green:

```
V28 slice 2a: the ping and the host action require a location in place
```

Do **not** push.

## Report back

```
Status: DONE | BLOCKED
Files changed:
  - <path> <what changed and why>
Commands run:
  - <command> -> <result>   (real output tails)
Gate green: yes | no
Commit: <sha>
Risks: <or "none">
Unresolved questions: <or "none">
```
