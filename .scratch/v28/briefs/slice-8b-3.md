# Slice 8b-3 — the three code fixes slice 3's fix round left behind

*(The third subject the old `slice-8b.md` was split into. **8b-1 is the mechanical half** (trailing-newline sweep +
guard, `slice-diff.sh`); **8b-2 is the test-honesty half**. Do not do their work.)*

Read `docs/agents/code-structure.md`. **One builder's worth; if it does not fit, STOP after a coherent subset and say
which parts you did.**

**⚠️ RE-MEASURE EVERY LINE NUMBER** — this brief comes from a document written several slices ago and anchors have
drifted repeatedly since (one module's line numbers moved by 48 last week).

## Item A — [MEASURED STILL LIVE TODAY] `useCropStep`'s `onConfirm` admits `| void`

`src/components/useCropStep.tsx:27` still reads:

```ts
onConfirm: (source: ImageBitmap, rect: CropRect) => Promise<void> | void,
```

**That `| void` means a caller may hand back a callback whose promise nobody awaits**, and the call site at `:134`
does `await onConfirm(source, rect)` — **so an unawaited implementation silently resolves the await immediately and
the crop step closes its bitmap in its `finally` while the work is still running.** *This is the class slice 3 spent
three rounds on: an async step whose completion is assumed rather than awaited.*

**Tighten the type to `Promise<void>` and prove it**: the change should **fail to compile** for an implementation that
returns nothing-async. Show the compile error. *If any real call site cannot satisfy `Promise<void>`, STOP and report
that instead of adding a cast — a cast would re-open exactly the hole.*

## Item B — the unguarded post-unmount effect in `OnboardingPage.tsx`

The original brief (`slice-8b.md` §5) names **one effect that can set state after unmount**. **Re-measure whether it
is still unguarded** — that file already carries several `mountedRef`/`cancelled` guards, so this may already be
fixed. **If it is fixed, say so and skip it** (an item that is already done is evidence about the brief, not work for
you); if not, guard it in the shape the file already uses, **not a new one.**

## Item C — the five small honesty fixes

`slice-8b.md` §7 lists five items slice 3's fix round left behind. **Read them there, re-measure each anchor, and do
the ones still live — saying plainly which were already done.**

**One you can check immediately, and it is one of them:** `e2e/weekly-series.e2e.ts:21` imports `readMarkerSession`
unused. *Harmless, but it is the kind of thing that makes a reader distrust the file's other imports.*

## Acceptance

1. **Item A has the compile error shown**, and the `await` at the call site is now load-bearing.
2. **Items B and C: each is either fixed or reported as already fixed**, with the measurement.
3. **No new guard convention invented** where the file already has one.
4. `npm run verify` exits 0 — **70 files / 2030 tests**, **81 warnings / 0 errors** (the baseline must not move; if
   your change moves it, say why).
5. **Write your report to `.scratch/v28/reports/slice-8b-3.md`** with raw tails, committed with the slice.

## Verify

`npm run verify`, `npm run typecheck`. If a changed file is exercised by an e2e spec, run **that spec twice** — report
every run, **one at a time**. **Four named flake modes** — re-run once before believing any red. Kill listeners **by
port**.

## Report

**`Committed as: <sha7>` from `git log --oneline -1`**, the compile error for item A, and per item for B/C: fixed or
already-fixed, with the measurement.
