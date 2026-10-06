# Slice 2b-ii builder brief — make the native registration REACHABLE (the consumer 2b never shipped)

> **Read in this order:**
> 1. `.scratch/native-apps/slice-2b-brief.md` — the slice this completes.
> 2. `src/lib/nativePushToken.ts` — the seam you are wiring. Read it in full.
> 3. `src/components/NotificationsSection.tsx` — where the wiring goes.
> 4. `src/lib/pushClient.ts` — the WEB path's surface, for symmetry.
> 5. `docs/agents/code-structure.md` — the build law.

## Why this slice exists (a defect in MY brief, recorded rather than hidden)

Slice 2b built and tested `src/lib/nativePushToken.ts` thoroughly — 22 tests, the
permission-order rule pinned, every failure an outcome. **But nothing in the app
calls it.** Verified this session:

```
grep -rn "registerForNativePush\|registerNativePushToken" src/ | grep -v nativePushToken
→ no matches (only the test file references them)
```

So `device_tokens` can never receive a row from the app, and plan slice 2's
acceptance criterion — *"a parent with the app closed receives a real alert"* —
is **structurally unreachable**, not merely unverified. Slice 2b's brief scoped
"the app's registration seam" and never required the consumer; that was the
brief's gap, and this slice closes it.

**There is also no opt-out path.** `src/lib/nativePushToken.ts` exports no
unregister/delete helper, but migration `0065_device_tokens.sql` documents the
opposite as the design:

> "Turn off notifications" (the /settings toggle) deletes THIS row, which is the
> whole opt-out: with no device row the sender has nothing to address natively.

A parent who turns notifications off must actually stop being reachable.

## Scope

1. **`src/components/NotificationsSection.tsx`** — the /settings Notifications
   surface: wire the NATIVE path beside the existing web one.
2. **`src/lib/nativePushToken.ts`** — add the opt-out (a delete of the device
   row) if it does not already exist as a small, testable helper.
3. Tests for both, per the build law.
4. **`docs/push-setup.md`** — a native/FCM section. The doc currently has ZERO
   native content (it is titled "Web push setup"), yet the FCM credential is now
   a prerequisite for the native channel. Record: the secret's NAME
   (`FCM_SERVICE_ACCOUNT_JSON`), where it comes from (Firebase console → Project
   settings → Service accounts → *Generate new private key* — a DIFFERENT
   artifact from `google-services.json`, which is client config), that it goes in
   Edge Function **secrets and never the repo**, and that a missing/malformed
   value now logs one `console.warn` naming the reason and silently disables the
   native channel (the sender falls back to web push, then email). Follow the
   file's existing tone: state what is proven versus what is still unverified.
   **Do not put a secret value or a real project id in the doc.**

## Carried-forward nit from slice 2b's review (one line, do it while you are here)

`supabase/functions/_shared/nativePush.test.ts:225-226` in
`classifyNativePushFailure`'s credential contrast test asserts
`expect(result.error).not.toContain('pruned')` under the comment *"The recorded
error must not tell a human the device was deleted."* That assertion can no
longer fail for the reason it claims: `nativePushFailure` returns the
**provider's own message verbatim** when one exists
(`nativePush.ts`: "error prefers the provider's own words"), so `result.error`
at that point is the FCM text, never our verdict wording. The real assertions
either side of it (`deadToken === false`, outcome `'failed'`) hold, and the
verdict reason is separately pinned for 13 credential shapes.

Fix it honestly, whichever way reads better: either re-point the assertion at
the thing that carries the wording (`classifyNativePushFailure(shape).reason`),
or delete the assertion and its comment. **Do not leave a comment claiming a
check the line cannot make.** Keep the surrounding assertions unchanged.

Note for accuracy: the drain does NOT lose the operator fact — on a prune it
records the literal `'token gone (pruned)'` itself (`send-push/index.ts`), so
this is a test-honesty tidy, not a behaviour bug. That is why it is a nit and
not a fix round of its own.

## Requirements

- **Native path when running inside the shell; web path in a browser.** The
  existing seam already returns `'unsupported'` when Capacitor is absent — use
  that rather than inventing a second detection. In a browser the current web
  opt-in behaviour must be **byte-for-byte unchanged**; that regression is the
  one this slice is most likely to cause, and `e2e/push-subscribe.e2e.ts` is the
  lane that catches it.
- **The opt-out must DELETE the `device_tokens` row** (migration pin above). A
  toggle that leaves the row behind keeps the parent reachable after they said
  stop.
- **Permission flow BEFORE `register()`** — already implemented inside the seam
  (`checkPermissions` → `requestPermissions` → `register`). Do not re-implement
  it in the component; call the seam.
- **Never claim notifications are on when they are not.** The seam returns
  `'blocked'`, `'error'`, `'unsupported'`, `'empty-token'` outcomes with reasons.
  Every one of those must reach the parent as an honest message — this is the
  same failure class as trap #1 in the parent brief (a token stored that can
  never produce a visible alert, while the parent believes they are subscribed).
- Reuse the existing notice/tone plumbing in the component. Match the file's
  existing style; do not restructure it.

## A defect landed in the same seam — ALREADY FIXED, do not re-fix it

`ocr` found, and the orchestrator confirmed, that `src/lib/nativePushToken.ts`
used to fall through to `register()` when the SECOND permission reading was
still `'prompt'`/`'prompt-with-rationale'`/empty (only `'blocked'` was
guarded). **That is fixed and committed at `d49be5b`** — a second `'request'`
now returns `blocked` with `NATIVE_PUSH_UNCONFIRMED_PERMISSION_REASON`, and it
is pinned for `'prompt'`, `'prompt-with-rationale'` and `''`.

Build ON that. Do not revert it, and do not re-implement the permission flow in
the component — call the seam.

## Files another session has open — do not touch

`src/index.css`, `src/pages/FeedPage.tsx`, `src/components/LocationModal.tsx`,
and the `.gitignore` pair. `src/components/NotificationsSection.tsx` is NOT one
of them and is yours.

## Out of scope

- APNs/iOS anything (2a stays deferred).
- Any change to `send-push` or the server transport.
- Any change to the web-push behaviour.
- The `token`→`fid` deprecation (no action until the timeline or plugin moves).

## State you are building on (already true — do not redo)

- Migration `0065_device_tokens.sql` **is applied to production** (verified live
  this session: RLS on, 4 policies, all scoped to `authenticated`).
- Fix round 1 is committed at `d49be5b`: a credential failure can never classify
  as a dead token, a codeless 404 keeps the device, `namesTheToken` is tightened
  to the registration-token sense, and a second `'request'` permission reading
  now returns `blocked` instead of registering.
- The sender (`send-push`) already has the native branch and reads
  `device_tokens`; a missing `FCM_SERVICE_ACCOUNT_JSON` skips it cleanly.
- **`FCM_SERVICE_ACCOUNT_JSON` is still absent** from the Edge Function secrets,
  so the native channel cannot actually send yet. Your wiring is what makes a
  token get WRITTEN; the secret is what makes a send possible. Both are needed
  before the device check can pass, and the secret is the founder's step.

## Verification — run these, this turn, and paste real output

```bash
npm run verify
npx vitest run src/lib/nativePushToken.test.ts src/lib/push.test.ts
nice -n 19 npx playwright test e2e/push-subscribe.e2e.ts
```

The last one is a TARGETED spec run against the live project — see
`docs/agents/browser-lanes.md`. **Never run a bare `npx playwright test`.**

⚠️ **The native path itself cannot be driven here**: it needs a real device with
the app installed, and there is no FCM service-account key on this box. So the
native registration/opt-out is proven by **unit tests with injected
dependencies**, and the device run is recorded as UNPROVEN. Never infer it. Say
which parts a device would have to confirm.

## Return format (exactly this)

    Status: DONE | BLOCKED
    Files changed:
      - <path> <one-line summary of what changed and why>
    Commands run:
      - <command> -> <result>
    Risks: <or "none">
    Unresolved questions: <or "none">
