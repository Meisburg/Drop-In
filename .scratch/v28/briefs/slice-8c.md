# Slice 8c — the kid-photo spec's mint/src assertions, made honest under second granularity

*(A hygiene slice. Small by design. **Do not expand it** — if you find a second subject, report it and I will
split, because this batch has twice paid for a hygiene slice that grew from every review.)*

You are `orchestrator-builder`. **Read `docs/agents/code-structure.md` before writing.** Worktree
`/home/jmeisburg/orca/workspaces/playdate-app/onboarding`, branch `Meisburg/onboarding`.

## The subject

`e2e/onboarding-kid-photo.e2e.ts` pins the kids card's photo minting. Its F3 leg counts signed-URL mints across
keystrokes and asserts the rendered `src` **stays put** (`:286-290`):

```js
expect(
  (await img.getAttribute('src')) ?? '',
  'the settled signed URL must stay put across keystrokes (no re-mint => no swap)',
).toBe(srcAfterAdd)
```

## ⚠️ WHAT I MEASURED, AND — IMPORTANTLY — WHAT I DID NOT

**Measured, so you can rely on it:**
- The mint is **batched**, not per-path: `useKidPhotoUrls.ts:20` — *"One `createSignedUrls` call for the whole kid
  list, never one [per kid]"*. The spec counts requests to `/object/sign/` (`:259-261`).
- **The `src` assertion is NOT the strong one — the COUNT is.** `:278-282` asserts
  `signRequests.length - mintsBeforeKeystrokes` **`.toBe(0)`**. So if a re-mint did happen, the count catches it
  **independently of whether the URL changed.**
- **The spec is already unusually honest about the pre-fix behaviour** (`:249-256`): *"measured: it never BLANKED —
  the new URL is valid for the same object — but the `<img>` reloaded on every keystroke."* **That is the shape
  this batch wants: the comment says what was actually observed, not what would have been convenient.**
- The residual is declared too (`:252-256`): an "Add another kid" click still triggers **one** mint because the
  hook's effect keys on the array's identity, not the id set.

**⚠️ NOT MEASURED BY ME — and this is why the slice exists:** a Supabase signed URL's token is believed to be
**second-granular** (the JWT's `iat`/`exp`), so **two mints inside the same second can produce byte-identical
URLs.** I did **not** prove that here, and I did **not** enumerate every `src`/mint assertion in the file.
**Your first job is to settle both**, with a command and its output, **before** you change anything:
1. **Enumerate** every mint-count and `src`-comparison assertion in the file (and say which are which).
2. **Determine whether a re-mint can yield a byte-identical URL within one second** — from the code
   (`photoStorage`'s expiry constant, the storage client's token shape) or by measurement. **If you cannot settle
   it, say so; an unproven mechanism must not be written into a comment as a fact.**

## The rule this slice enforces

**An assertion must be strong enough to fail for the reason it names.** A `src` equality assertion whose failure
mode is masked by token granularity is **not** evidence that no re-mint happened — the **count** is. So:

- **Where the count already carries the claim, say so in the assertion's message** (the message currently reads
  *"no re-mint => no swap"*, which **infers the cause from the wrong signal** — the arrow runs the other way:
  the count proves the re-mint, the `src` merely agrees).
- **Where a `src` comparison is the ONLY signal, strengthen it** or state its limit in the test.
- **Do not add a new assertion that can only pass.** Slice 5's best move was making a bad state
  **unconstructable**; the second-best was stating a limit honestly. **Both are acceptable; a silent weak
  assertion is not.**

## Acceptance — demonstrate each, both halves

1. **The enumeration**, with the command, and the two measurements above settled (or their unsettledness stated).
2. **Every mint/src assertion either strengthened or labelled** — with the reason, in the test.
3. **The file's own honesty preserved**: the pre-fix observation comment stays true; if you reword it, it must
   still describe what was measured.
4. **A non-vacuity proof**: mutate the thing one of these assertions names and **show it failing**; restore and
   show it passing. **Paste both.**
5. `npm run verify` exits 0, and `e2e/onboarding-kid-photo.e2e.ts` runs green — **at least twice**, both reported.

## Verify

`npm run verify`; `npx playwright test e2e/onboarding-kid-photo.e2e.ts` **×2**; and `e2e/name-card-photo.e2e.ts`
**×2**, because it shares `useKidPhotoUrls`' sibling hook and the same mint path.

**Four named flake modes** — re-run once before believing any red: `no-bypass-guard`,
`e2e/places.e2e.ts:2759`, vite-4173 / trace-artifact-ENOENT, teardown `close()` throwing *"Target page, context or
browser has been closed"*. **The second-granularity token issue is a fifth candidate** — if you hit a `src`
assertion that flips between runs, that is the reason to investigate it, not to loosen it. Kill listeners **by
port**, never `pkill -f`.

## Report

- **`Committed as: <sha7>`** — or *"not committed"* and why; **an absent field is read as evidence.**
- Files changed with `+/-` counts.
- **The token-granularity finding** — settled or explicitly unsettled, with the evidence.
- Both halves of each acceptance run: **raw output tails.**
- `npm run verify`: exit code, test-file count, test count, lint errors **and warnings**.
- Anything the brief did not anticipate — **say it rather than quietly fixing it.**
