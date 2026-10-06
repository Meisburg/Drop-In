# The audit lanes disagree about which app they measure — spec (2026-10-05)

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

## 3. Acceptance criteria

1. `E2E_BASE_URL=http://localhost:4191 node scripts/mobile-audit.mjs` measures
   `:4191` — proven by its own first line naming that URL — with a preview of THIS
   build running there.
2. The same, for `layout-width-check.mjs`.
3. `signed-in-audit.mjs` keeps its current behaviour (it already complies; if you
   touch it, it must keep printing its target first).
4. With no `E2E_BASE_URL` and no argument, each lane's target is **exactly what it
   is today** — this slice must not move a default.
5. `npm run verify` exits 0.

**Status:** ready-for-agent. Not dispatched at the time of writing because a
different builder owned the tree; it is the F3 family of the launch audit's
remaining lane maintenance.
