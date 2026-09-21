# Code structure — the build law for this repo

**Who this is for:** every `orchestrator-builder` subagent before it writes a
line, and every `orchestrator-reviewer` when it judges quality. This file is
the written form of a convention this repo already follows. It is law, not a
suggestion.

**Why it exists:** models get the job done, and they get it done in a sloppy
way when nobody says otherwise. The workflow is the part that is not native to
the agent, so it has to be written down. This is that writing.

## The one rule

**Business logic lives in `src/lib/`, as pure functions where possible.
React components render; they do not decide.**

If you are writing an `if` that encodes a *rule* inside a `.tsx` file, stop.
That rule belongs in `src/lib/`.

## The three layers

```
src/lib/         logic + tests     ← the rules live here
src/pages/       route shells      ← compose lib + components, own data loading
src/components/  presentation      ← render props, emit callbacks
```

### 1. `src/lib/` — the service layer

One module per domain concern: `trust.ts`, `feed.ts`, `auth.ts`, `series.ts`,
`places.ts`, `ics.ts`, `moderation.ts`, `follows.ts`.

Every module follows three rules:

**(a) Pure decisions are separated from execution.** The canonical example is
`src/lib/trust.ts`:

```ts
/** What a ping toggle should do, decided purely (the caller executes it). */
export type PingDecision = 'noop-host' | 'ping' | 'unping'

export function planPing(existingPing: boolean, isHost: boolean): PingDecision {
  if (isHost) return 'noop-host'
  return existingPing ? 'unping' : 'ping'
}
```

The decision is a *pure function* — trivially testable, no mocks. The
execution (`togglePingWithClient`) sits beside it and takes its dependency as
a parameter.

**(b) Dependencies are injected, never imported ambiently.** The Supabase
client is a **parameter**, not a module-level singleton:

```ts
export async function togglePingWithClient(
  client: SupabaseClient,
  playdateId: string,
): Promise<boolean>
```

This is why tests need no database and no browser. The Supabase-facing wrapper
lives in `db.ts`; the testable logic lives in the domain module. Follow this
split.

**(c) Every module ships with its test.** `src/lib/trust.ts` ↔
`src/lib/trust.test.ts`. 24 modules, 24 tests. A new `lib/` module without a
sibling `.test.ts` is an incomplete slice.

### 2. `src/pages/` — route shells

Pages compose. They call `lib/` functions, hold component state, and load
data. They may branch on *presentation* (`isLoading ? <Spinner/> : <List/>`).

They must not encode domain rules. If a page decides *whether a user is
allowed to do something*, that decision belongs in `lib/`.

### 3. `src/components/` — presentation

Render what they are given; emit callbacks for what happened. No `lib/`
imports for rule logic, no direct Supabase calls.

## Test discipline

- **Vitest** for `lib/` logic: `npm run test`. Pure functions and
  mock-injected clients only — no network, no database.
- **Playwright** for flows: `npm run test:e2e`.
- A test that asserts nothing is a defect, not coverage. The reviewer will
  reject it.
- Prefer testing the *pure decision* over the execution path. `planPing` gets
  a table of inputs; `togglePingWithClient` gets one round-trip test.

## What the reviewer checks

Against the diff, not the builder's description:

1. Does any `.tsx` file encode a domain rule that belongs in `lib/`?
2. Does any `lib/` function import a module-level Supabase client instead of
   taking one as a parameter?
3. Does a new `lib/*.ts` module lack its `lib/*.test.ts` sibling?
4. Do the tests assert real behavior, or merely exercise lines?
5. Is there duplication of a logic block across files?

Findings must cite `file:line`.

## The 5-minute read test

A human should understand your full diff in a few minutes. If it takes longer,
the slice was too big — say so in Risks rather than growing the diff.
