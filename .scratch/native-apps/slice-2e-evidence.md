# Evidence — slice 2e: the Android shell stops serving a stale bundle after an update

All commands below were run **this session (2026-10-06, ~16:30–17:10 local)** by the
orchestrator-builder agent on the local **Pixel_9_Pro AVD**. Logs, scripts, probe
output and the three APKs are in `.scratch/native-apps/2e/`. **No physical phone is
attached** (`adb devices -l` → only `emulator-5554`; `lsusb` → no phone-like device).

Result in one line: the defect was **reproduced under control** (first launch after an
update served a bundle the installed APK no longer contained, for the whole session,
and the worker stayed registered), and the fix makes the transition **one launch,
once** — after which the shell serves the APK's own bundle with **no worker and no
caches**, which is measured on the **next** update as a **zero-length window**.

## 1. The fix (4 tracked files, one comment)

| File | Change |
|---|---|
| `vite.config.ts` | `injectRegister: false` on `VitePWA` — the build no longer injects `<script src="/registerSW.js">`. That tag registered a worker in the shell unconditionally, before any app code ran. `sw.js` is **still built and shipped** (the transition needs it, §3). |
| `src/lib/serviceWorkerPolicy.ts` (new) | The one decision: `serviceWorkerAction(shell)` → `register` in a browser, `unregister` in either shell; `applyServiceWorkerPolicy` executes it with injected deps; `startServiceWorkerPolicy()` is the app-start wiring (platform check via the existing `nativePushShellPlatform` seam, `load` listener attached synchronously, unregister then drop Cache Storage). |
| `src/lib/serviceWorkerPolicy.test.ts` (new) | 4 tests: the decision table (`null`/`android`/`ios`), that the shell never registers and a browser never unregisters, and a pin on `injectRegister: false` in `vite.config.ts` (the second way the shell could start registering again). |
| `src/main.tsx` | Calls `startServiceWorkerPolicy()`. This replaces the injected script as the one registrar. |
| `src/lib/notificationSectionCopy.ts` | **Comment-only.** Its "the record" paragraph said the shell ships the unconditional registration and the worker registers; that is now false, so it was corrected to the past tense with a one-line pointer to 2e. No copy string, no code. |

The web path is unchanged in behaviour: a browser still registers `/sw.js` with scope
`/` at the same point in startup (on `load`), from the app bundle instead of from a
second script the build injected.

## 2. BEFORE — the defect, reproduced with the technique that found it

A true pre-fix APK was built from **`git archive HEAD`** into `/tmp` (read-only export;
no worktree, no checkout, nothing the concurrent session's uncommitted files could
collide with) — `2e/app-debug-BEFORE.apk`, whose only bundle is
`index-C-0szsBk.js` and whose `index.html` contains
`vite-plugin-pwa:register-sw" src="/registerSW.js"`.

The AVD held 2dii's end state (bundle `index-C9b6OlYG.js`, worker registered, precache
holding `index.html` + that bundle). Installing the pre-fix APK over it:

```
the APK's own bundle   : index-C-0szsBk.js
pre-install            : loaded index-C9b6OlYG.js  regs [https://localhost/sw.js]
                         precache [index.html rev 6f8d52f0, assets/index-C9b6OlYG.js]
t+1s … t+10s           : loaded index-C9b6OlYG.js   ← A BUNDLE THE INSTALLED APK NO LONGER CONTAINS
t+2s                   : precache gains [index.html rev 38270a3f, assets/index-C-0szsBk.js]  (new SW installing)
t+3s … t+10s           : precache = the APK's own pair; LOADED SCRIPT STAYS index-C9b6OlYG.js
reload 1..4            : loaded index-C-0szsBk.js
cold relaunch          : loaded index-C-0szsBk.js   regs [https://localhost/sw.js]   ← still registered
```

That is the parent-facing defect: a SPA loads once, so "the first page load" is the
whole session, and **the registration survives**, so it recurs on every update.

## 3. AFTER — the one-update transition, then permanently clean

Installing `2e/app-debug-AFTER.apk` (bundle `index-BFvGZzFV.js`, **no**
`register-sw` tag, `sw.js` still shipped) over the pre-fix install:

```
the APK's own bundle   : index-BFvGZzFV.js
pre-install            : loaded index-C-0szsBk.js  regs [sw.js]
t+1s … t+10s           : loaded index-C-0szsBk.js   ← THE ONE-UPDATE TRANSITION (the old bundle has no unregister code)
t+3s                   : precache = [index.html rev c4bf60ce, assets/index-BFvGZzFV.js]
reload 1               : loaded index-BFvGZzFV.js  regs []  cacheKeys []  ← new bundle AND the shell unregistered + dropped the precache
reload 2..4            : loaded index-BFvGZzFV.js  regs []  cacheKeys []
cold relaunch          : loaded index-BFvGZzFV.js  regs []  cacheKeys []
```

**No reload loop**: four consecutive reloads and a force-stop relaunch all landed on the
APK's own bundle and stayed there. The transition is exactly one launch, and it is the
last launch that has a worker in the shell.

## 4. The NEXT update has a zero-length window (the payoff)

`2e/app-debug-THIRD.apk` (bundle `index-DgRm7gyg.js`, the current tree's build, no tag)
installed over the fixed install — after an **emulator reboot**, which also shows the
unregistration persists across a device restart:

```
state after the emulator reboot : loaded index-BFvGZzFV.js  regs []  cacheKeys []
the new APK's own bundle        : index-DgRm7gyg.js
t+1s … t+10s                    : loaded index-DgRm7gyg.js  regs []  cacheKeys []   ← ZERO stale window
reload 1..4, cold relaunch      : loaded index-DgRm7gyg.js  regs []  cacheKeys []
```

So the fix does not merely move the window: for every update **after** this one, the
first launch already serves the bundle the APK actually contains.

## 5. The web half — still registers, still controls, still offline (criterion 2)

Against `npm run preview` serving the **same** `dist/` the shell was built from
(`.scratch/native-apps/2e/web-sw-check.out`, and the repo's own guard
`scripts/verify-pwa.mjs`, `verify-pwa.out`):

```
htmlHasRegisterSwTag : false          html script tags: ["/assets/index-BFvGZzFV.js"]
/registerSW.js       : not a real file (the 200 is the SPA fallback's body — asserted by body, not status)
serviceWorker.ready  : scope http://localhost:4173/  active true
after a reload       : controlled true   controllerUrl http://localhost:4173/sw.js
web-push prereqs     : 'PushManager' in window true   typeof Notification "function"   register() is a function
registrations        : 1
verify-pwa.mjs       : serviceWorkerControls true; cold OFFLINE reload paints the shell
                       (title "Drop In", #root present, body text = the app's own copy); all icons 200
```

The registration now comes from `src/lib/serviceWorkerPolicy.ts` — the only registrar
left — and the precache it installs still serves a cold offline load. The web's own
regression guard was not modified and still passes.

## 6. The gate (criterion 3) — both exit codes, on the same bytes

```
$ npm run verify                                     # literal, plain
Test Files  90 passed (90)      Tests  2657 passed (2657)      (+1 file / +4 tests from this slice; 2dii measured 89 / 2653)
Found 87 warnings and 0 errors.  (oxlint)
PASS a11y:focus · PASS steering-lint · PASS build law · PASS git hooks · factory-guard: all 185 checks passed
GUARDS: FAIL — 1 guard(s) reported findings:
  - config-guard            ← "CHANGED: vite.config.ts / FINDING: a file that defines a check was modified."
VERIFY_PLAIN_EXIT=1

$ ALLOW_CONFIG_CHANGE="<the reason below>" npm run verify
GUARDS: PASS — all deterministic rules hold.        VERIFY_ALLOW_EXIT=0     (same 90/2657, same lint)
```

`vite.config.ts` is a protected path, so an uncommitted change to it is a **finding by
design** — the guard exists so a check file cannot change silently. The reason recorded
(for the commit body verbatim), and the orchestrator's ruling on 2026-10-06 is to take
this path:

> slice 2e: VitePWA injectRegister:false — the build's injected /registerSW.js registered a service worker in the Android shell, whose workbox precache then served the PREVIOUS bundle on the first launch after an update (measured on the AVD; the app is a SPA that loads once, so that was the whole session). src/lib/serviceWorkerPolicy.ts now owns the decision: a browser registers /sw.js, the shell unregisters and drops the precache. No check is weakened — the injected script is replaced by an explicit, tested registration that the web path still performs.

Once the change is on `origin/master` the guard stops firing (it diffs merge-base
`origin/master HEAD`), so CI needs no variable — as `docs/agents/ci.md` §"When CI is red"
item 3 and the v23 ledger both record.

The plain run above is the honest red: **every stage except `config-guard` was green on
these bytes**, and no other guard reported anything.

## 7. The pins, RED first (criterion 4)

```
$ npx vitest run src/lib/serviceWorkerPolicy.test.ts                    4 passed (4)
RED 1: serviceWorkerAction returns 'register' unconditionally
       → 2 failed | 2 passed   (the shell-registers-again case, both halves)
RED 2: vite.config.ts injectRegister: 'auto'
       → 1 failed | 3 passed   (the build re-injecting /registerSW.js)
both files then md5-restored: md5sum -c → OK (the mutation lived only inside those two commands)
```

## 8. Risks and what is NOT proven

1. **Debug build only.** A release APK cannot be installed over the AVD's existing
   install without `adb uninstall`, which destroys the precache under test (2dii's
   method note). The mechanism — a precached `index.html` — does not depend on the
   build variant, but the release form is **inferred, not measured**.
2. **iOS shell**: the decision is pinned by unit test (`'ios'` → unregister); there is no
   Apple host here, so the iOS path is **UNPROVEN on a device**.
3. **Cache wipe is safe by code, not by measurement**: `PUSH_PREFS_CACHE` is a *mirror*
   of `localStorage` — `writePushPrefs` writes localStorage first, then the cache, then
   the (fire-and-forget) `postMessage` (`src/lib/pushClient.ts:260-306`) — and in the
   shell the `push` handler that reads that cache no longer exists. Nothing in the shell
   is lost by clearing it. Not measured end-to-end (that would need a marker sign-in).
4. **One real behaviour delta, recorded**: with no registration in the shell,
   `navigator.serviceWorker.ready` never settles there. The only site that awaits it in
   the shell is `messageServiceWorker` inside `writePushPrefs`, which is called as
   `void writePushPrefs(...)` after its durable writes (`pushClient.ts:285-295`), so the
   pending promise has no user-visible effect. The other three `ready` sites are web-push
   paths the shell cannot reach: `refreshPushSubscription` returns at `mayRepair()` →
   `pushSupported()` false, and `subscribeToPush`/`disablePush` sit behind
   `decideOptInControl`, which renders no web-push control in the shell
   (`NotificationsSection.tsx:285-295`). No file outside the diff was changed for this;
   it is stated so a reviewer can rule on it.
5. **Untracked heavy artifacts**: `2e/app-debug-{BEFORE,AFTER,THIRD}.apk` are 6–7 MB
   each and `.scratch/` is **not** gitignored. They are evidence and must not be staged.

## 9. Production side effects: none

No account, row or fixture was created this session — the emulator work used the AVD's
existing install and its existing session, and every measurement was a read of WebView
state. **No marker email to sweep.** The web half was local `vite preview` + headless
chromium only; no `npx playwright test` was run at all (the runbook's production-write
ban), and `scripts/verify-pwa.mjs` and the new `web-sw-check.mjs` write nothing.

Environment change: the AVD now runs the fixed **debug** build (`index-DgRm7gyg.js`),
with no service worker registered and no caches; the emulator was left running
(`adb emu kill` stops it).

## 10. Collision discipline (another session is live in this workspace)

No `git stash`, no `git checkout -- <file>`, no `git add -A`, no `git restore`, no
commit. The other session's files were never opened for writing; its
`PlaceDirectory.tsx` broke `tsc -b` twice during this slice (once at 16:38, again at
~17:05) and both times the gate was **waited on and re-run**, never "fixed". My five
files were unchanged between the builds and the gate runs
(`2e/fixed-tree.md5` → `md5sum -c` = OK after the green run).
