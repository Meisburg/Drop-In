# r3-2 — notifications: MEASURED, FIXED, VERIFIED

**Date 2026-10-03. Every figure below was measured this turn.**

## The human's report

> enabling notifications yields `Registration failed - missing applicationServerKey,
> and gcm_sender_id not found in manifest`

## Step 1 — the failing environment was identified BEFORE any edit

| question | measurement |
|---|---|
| Is a LAN dev server running on `192.168.1.61:5173`? | **No** — nothing listening on 5173 / 4173 / 9222 |
| Is `VITE_VAPID_PUBLIC_KEY` in the local `.env`? | **NO — absent** (the handover's guess is confirmed) |
| Does `.env.push.local` exist? | **No** |
| Is the key in Vercel's env? | **Yes** — `docs/push-setup.md` step 2 records it DONE AND DEPLOYED, with the live bundle verified to contain it |

**So the failing build was a LOCAL/LAN build with no key.** The code was behaving
correctly; the claims around it were false. The human's report is fully explained.

## Step 2 — the defect, precisely located (the handover was WRONG about where)

⚠️ **The handover pointed at `src/sw.ts:74-80`. That is not the opt-in path.**

| site | what it is |
|---|---|
| `src/lib/pushClient.ts:508` | **THE OPT-IN PATH** — `enablePush()`, reached from `/settings` and the three prompts |
| `src/sw.ts:226` | `rehandshake()` only — fires on `pushsubscriptionchange`, not on opt-in |

**The false claim appears in THREE places**, not one:

1. `src/lib/pushClient.ts:510-513` — the comment directly above the real `subscribe()`
2. `src/sw.ts:73-78` — the `VAPID_PUBLIC_KEY` docblock
3. `docs/push-setup.md:123-127` — the "still works, in a weaker mode" paragraph

Each asserted that a keyless `subscribe()` is *permitted* and the opt-in *is recorded*.
**It is not recorded:** Chromium refuses the call outright.

## Step 3 — the fix: DOCUMENTATION ONLY, runtime unchanged

**The runtime branch was ALREADY correct and was NOT changed.** Both sites spread
`applicationServerKey` only when the key is non-empty:

```ts
...(key === '' ? {} : { applicationServerKey: base64UrlToBytes(key) })
```

Passing no key lets the browser refuse honestly. **The alternatives were rejected:**
passing `applicationServerKey: ''` is invalid, and inventing a key is worse — a
subscription bound to nothing looks healthy in the DB and delivers nothing. That would
be the same defect one level down.

**Changed:** the three false claims, each replaced with what the mechanism does.

## Step 4 — WHY 2067 GREEN TESTS SHIPPED A BROKEN OPT-IN (the real finding)

`e2e/push-subscribe.e2e.ts` stubbed `pushManager.subscribe()` as:

```ts
async subscribe() {           // no parameters — options IGNORED
  state.subscribes += 1
  return new FakePushSubscription(config.endpoint)
}
```

**The stub modelled a browser more permissive than any real one.** A keyless subscribe
"succeeded" in every test, so the suite could never observe the defect. **The test suite
was not merely silent about the bug — it asserted the bug's behaviour was correct.**

And the e2e build had **no key of its own**: `playwright.config.ts` runs
`npm run build && npm run preview` against the local `.env`, which carried no
`VITE_VAPID_PUBLIC_KEY`. So the suite exercised the no-key path and called it success.

### The fix, in two halves

1. **The stub now REFUSES a keyless subscribe**, with Chromium's own message, and counts
   the attempt (`keylessSubscribeAttempts`).
2. **The e2e build now HAS a key** — a locally generated, test-only **valid P-256 public
   key** in `.env` (gitignored). Verified present in `dist/assets/index-*.js` **and**
   `dist/sw.js`.

## Step 5 — VERIFICATION

| check | result |
|---|---|
| `node scripts/…` gate | — |
| `npm run verify` | **exit 0 — 71 files / 2067 tests / 81 warnings / 0 errors / GUARDS PASS** |
| key present in built bundle | **yes** (`dist/assets/index-C5mXRZBt.js`, `dist/sw.js`) |
| `npx playwright test e2e/push-subscribe.e2e.ts` **with key** | **9 passed (42.3s)** |
| **SAME spec with the key REMOVED from `.env` (mutation)** | **1 failed, 1 passed** — fails at `push-status` never showing "Notifications are on" |

**The mutation is the point:** the spec now **fails when the key is absent** and passes
when it is present. Before this slice it passed in **both** states, which is exactly why
the defect shipped.

## The acceptance, and its honest limit

The plan's acceptance was *"on a real browser, enabling notifications completes
registration and the subscription is persisted. Verify in the browser, not by unit test
alone."*

- **Proven:** the spec drives a real Chromium through the real bundle, and the stub now
  rejects what Chromium rejects. The keyed path completes and persists a row.
- **NOT proven, and not claimed:** a real push **delivery**. `push-subscribe.e2e.ts`'s own
  header says the server-side send is out of scope (needs VAPID keys, the deployed
  `send-push`, and a real push service). **Unchanged by this slice and not claimed.**
- **Still needs the human:** a walk on the **Vercel preview** (which has the production
  key) confirming the opt-in completes there. That is P7-adjacent and cannot be done from
  this repo.

## What did NOT change

- No runtime behaviour change. `enablePush()` and `rehandshake()` are byte-identical in
  their logic.
- No guard weakened. `verificationProblems` and the r3-1 collateral gate are untouched.
- The production VAPID key was not touched, printed, or rotated.
