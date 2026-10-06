# The audit lanes disagree about which app they measure — spec (2026-10-05)

> ## ⚠️ PARTLY LANDED (`3188ea6`), AND THIS BRIEF'S POPULATION WAS WRONG — RE-MEASURED
>
> The first version of this file named **three** scripts because I grepped three
> files. **The real population is EIGHT**, and only three of them read the env var.
> Measured (`grep -rln 'localhost:4173\|localhost:4180' scripts/`):
>
> | script | reads `E2E_BASE_URL`? |
> |---|---|
> | `signed-in-audit.mjs` | ✅ yes (and announces its target) |
> | `mobile-audit.mjs` | ✅ yes — **fixed in `3188ea6`**, now announces too |
> | `layout-width-check.mjs` | ✅ yes — **fixed in `3188ea6`**, announces first |
> | `a11y-dom-check.mjs` | ❌ **NO** — `argv[2] ?? 'http://localhost:4173'` |
> | `dark-mode-check.mjs` | ❌ **NO** — same shape (found by running it: `ERR_CONNECTION_REFUSED` at `http://localhost:4173/login`) |
> | `focus-trap-check.mjs` | ❌ **NO** — same shape |
> | `profile-order-check.mjs` | ❌ **NO** — same shape |
> | `theme-contract-check.mjs` | ❌ **NO** — same shape |
>
> So the fix is **3/8 done**, and the remaining five are ONE identical change each.
> This is the same mistake twice in one session — a narrow grep read as a complete
> population (the other was the marker-token mechanism) — which is why the measured
> list is now in the file rather than the number three.

**Found while re-running the signed-in audit for the settings slice**, and it cost
one wrong measurement before it was spotted (recorded in `task-state.md` and in the
launch audit's addendum).

## 1. The defect, measured

The V32 change that unified the e2e suites on **`E2E_BASE_URL`** ("the ONE base URL,
read from the environment so a run can be pointed at a private port",
`playwright.config.ts`) reached the SPECS and **one** of the three audit lanes.
Read from the scripts today:

| script | how it picks its target | does it say what it measured? |
|---|---|---|
| `scripts/signed-in-audit.mjs:34` | `process.env.E2E_BASE_URL ?? process.argv[2] ?? 'http://localhost:4180'` | **yes** — `signed-in-audit against <BASE>` |
| `scripts/mobile-audit.mjs:20` | `process.argv[2] ?? 'http://localhost:4173'` — **no `E2E_BASE_URL` at all** | **NO** — it prints nothing about the target |
| `scripts/layout-width-check.mjs:20` | `process.argv[2] ?? 'http://localhost:4173'` — **no `E2E_BASE_URL` at all** | yes |

So `E2E_BASE_URL=http://localhost:4191 node scripts/mobile-audit.mjs` **silently
measures `:4173`** — the port the handover names as owned by a sibling checkout —
and never says so. `layout-width-check.mjs` has the same blind spot but at least
announces the URL it used.

**This is the exact class the repo already closed once.** The handover's e2e rule
exists because *"another checkout's preview owns that port, so a local run can
silently test the WRONG APP"*; the specs were fixed with one constant and the
private-port recipe, and the lanes were left behind. And it is not theoretical: my
own `signed-in-audit.mjs` run defaulted to `:4180`, where a **stale preview from
17:07** was still listening, and reported two `nav is a left rail` failures that do
not exist in this tree. It announced its target, which is the only reason the
mistake was caught in one read.

## 2. The fix (small, and it is one precedence rule)

In all three scripts, the same first-come order the specs already use:

```
process.env.E2E_BASE_URL ?? process.argv[2] ?? '<the default that is documented today>'
```

and **every one of them prints `… against <BASE>` as its first line, before it
measures anything** — `mobile-audit.mjs` is the one that currently does not, and it
is the one that would have misled a reader the longest.

Do NOT change what any lane MEASURES, and do NOT change a lane's default port if
that default is documented somewhere (a default that changes silently is its own
bug; the point is that `E2E_BASE_URL` must win, and that the chosen target is
always visible).

**Optional, and worth it if it is cheap:** refuse to measure when the port is
already served by a process the script did not start, or at least print a warning
naming the listener's pid. The failure mode here is "measured someone else's
build", and a loud line beats a silent one.

## 2b. The remaining five (one identical change each)

In `a11y-dom-check.mjs:31`, `dark-mode-check.mjs:22`, `focus-trap-check.mjs:24`,
`profile-order-check.mjs:71` and `theme-contract-check.mjs:19`, every one of which
is exactly `const BASE = process.argv[2] ?? 'http://localhost:4173'`:

```
const BASE = process.env.E2E_BASE_URL ?? process.argv[2] ?? 'http://localhost:4173'
```

plus the same mandatory first line (`<lane> against <BASE>`) that §2 requires, so a
reader can never again wonder which build a lane measured. **The defaults do not
move.** Do not change what any lane checks.

## 2c. ⚠️ THE LANES ARE ORIGIN-BOUND, AND THAT IS SILENT TOO (measured 2026-10-06)

Pointing a lane at a port **other than the one the marker session was minted on**
does not measure the wrong app — it measures the app **SIGNED OUT**, because a
Playwright `storageState` restores `localStorage` per **origin**. Measured: the
stored state's origin is `http://localhost:4191`, and running
`E2E_BASE_URL=http://localhost:4192 node scripts/profile-order-check.mjs` (a preview
of the same build) **timed out waiting for `getByTestId('edit-profile')`** — the
signed-in editor never rendered. The same lane on `:4191` passed in seconds.

So `E2E_BASE_URL` is necessary but not sufficient for a lane that needs a session:
**re-mint the marker on the port you are about to use**, with
`E2E_BASE_URL=http://localhost:<port> npx playwright test e2e/auth.setup.ts e2e/zip-radius.e2e.ts`
(that is what the e2e specs do implicitly, which is why they are not hit by this).
Worth a loud line in each session-bound lane if anyone wants to close it properly:
if the page renders signed out, say "the marker session's origin is <X> and I am
pointed at <Y> — re-mint with the setup spec" instead of timing out on a selector.

## 3. Acceptance criteria

1. ✅ DONE (`3188ea6`) — `E2E_BASE_URL=…:4191 node scripts/mobile-audit.mjs`
   measures `:4191`, proven by its first line naming that URL.
2. ✅ DONE (`3188ea6`) — the same for `layout-width-check.mjs`.
2b. **ALL FIVE of §2b behave the same way**, each proven by its own first line
   naming `:4191` while a preview of this build runs there. (Some of them need a
   drop-in id or a session and will SKIP their deep checks — that is their designed
   behaviour and it must be reported as SKIP, not as a pass.)
3. `signed-in-audit.mjs` keeps its current behaviour (it already complies; if you
   touch it, it must keep printing its target first).
4. With no `E2E_BASE_URL` and no argument, each lane's target is **exactly what it
   is today** — this slice must not move a default.
5. `npm run verify` exits 0.

**Status:** ready-for-agent. Not dispatched at the time of writing because a
different builder owned the tree; it is the F3 family of the launch audit's
remaining lane maintenance.
