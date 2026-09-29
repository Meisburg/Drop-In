# Fix round 1 — V28 Slice 7a (the guard does not catch its own headline defect)

**Working directory: `/home/jmeisburg/orca/workspaces/playdate-app/onboarding`**

The slice is a good slice and Guard 1's find is **real**. But the review did the one
thing the doctrine demands — *"the failure mode of a guard is not 'it crashed', it is
**it passed**"* — **and applied it to your guard.** It **gutted each guard in a temp
copy** and ran **the committed Guard 2 against the pre-defect
`e2e/places-map-view.e2e.ts` (from `1631939^`)**, which **exits 0**. So
`places-see-map` was **never caught by the committed guard.**

**The orchestrator has verified the mechanism.** `literalPresent` (`:158`) step 3 splits
the literal and accepts a prefix that is merely a **substring** of `src/`
(`plainSrcText` requires only 4 chars — `"plac"` matches `placePath`) plus a suffix
matching **`allShapes`, which includes `partShapes`** — the deliberately weak shapes —
and `src/lib/feed.ts:293`'s `` `${y}-${m}-${d}` `` yields statics **`["-","-"]`**, which
matches **any three hyphen-separated segments**. So `places-see-map` is "proved present".

## What must change

1. **⚠️ MAKE GUARD 2 CATCH `places-see-map`.** Gate the two-part pool so a
   punctuation-only shape cannot power it, and tighten the plain half so it is not a
   loose 4-char **substring** (`"plac"` inside `placePath` is not evidence). Require the
   shape half to pin **at least one alphanumeric static**, and the plain half to be a
   **bounded token** rather than any substring.
   **Then prove it: run the fixed guard against `git show 1631939^:e2e/places-map-view.e2e.ts`
   and paste the output showing it now REPORTS that literal.** That is the only
   acceptable proof, and it is the exact test the review used.
2. **Seed the realistic shape into `stale-locator-guard.check.mjs`.** Today it seeds only
   `zzgonezz-button` — a synthetic literal whose prefix is **not** in `src/`, i.e. it
   tests the *easy* half of the rule. Add the **hyphenated dead testid whose 4+ char
   prefix IS verbatim in `src/`** (use `places-see-map` itself, or a synthetic twin with
   the same shape), so the hole cannot silently reopen.
3. **⚠️ CORRECT THE ATTRIBUTION — AND THIS IS MINE AS MUCH AS YOURS.** `plan.md` and the
   comment at `e2e/places-map-view.e2e.ts:1493-1497` both claim the **guard's first
   positive-usage finding**. That is **not reproducible from the committed guard.**
   Rewrite both to state the truth: **the defect was real and is now fixed; the committed
   guard did NOT catch it; and this check now anchors the shape it missed.** Do **not**
   invent an explanation for how it was originally found — if you can show it, show it,
   and if not, say it is not established.
4. **⚠️ PUT `/browse` IN GUARD 1's ROUTE TABLE.** The review found it missing (the table
   has 15 entries and no `/browse`), and the suite's **densest absence-pin cluster** —
   `places.e2e.ts` (56), `places-map-view.e2e.ts` (21), plus `feed-empty-state`,
   `feed-ended-out`, `hearts-collection`, `place-filters` — is therefore **silently
   skipped with no note**. Either fix the derivation (the reviewer points at a JSX
   comment between `element={` and its `<Suspense` child) **or print a note for every
   route the table does not match** — a silent skip is the one thing the doctrine forbids.
5. **State Guard 1's ACTUAL coverage in its header.** It judges **25** assertions; the
   dominant escape (helper-driven navigation → "no route established in its own block")
   swallows most of the suite's absence pins. Say so — the nominal coverage is 1237-ish
   sites and the real one is 25 assertions plus printed notes.
6. **Document the cross-route-absence false positive.** A legitimate future spec that
   *deliberately* asserts an absence across routes (a redirect/gate test) is a Guard 1
   finding with **no tolerance mechanism today**. Either document that cutting with a
   comment is the sanctioned response, or add an allowlist/annotation. Do not leave it
   undocumented — a guard that blocks a legitimate pattern gets disabled.

## Also

- **Run the Playwright lane for the spec you changed.** The commit has **no e2e-run
  evidence** for the `places-map-view` fix (the verify lane ran guards/tests/lint only).
  Run that spec and paste the result.
- Guard 1's find **stands as real** — the reviewer independently confirmed both vacuous
  sites (`e.g. 98107` lives only in `OnboardingPage.tsx:945`, and OnboardingPage is
  reachable only from `/onboarding` and `/new`). **The three cuts are ruled sound and the
  `places-map-view` fix is a strengthening, not a weakening. No test was weakened.** Keep
  all of that as it is.

## Verify

```
node scripts/guards/stale-locator-guard.check.mjs        # must still prove it fires
node scripts/guards/vacuous-absence-guard.check.mjs
bash scripts/guards/run-all.sh                            # paste the GUARDS line verbatim
npm run verify                                            # guards run last
```

**And the proof that matters:** the fixed Guard 2 against
`1631939^:e2e/places-map-view.e2e.ts`, showing it now reports `places-see-map`.

## Commit and report

```
V28 slice 7a fix 1: the stale-locator guard now catches the defect it was credited with
```

```
Status: DONE | BLOCKED
Files changed: <path> <what and why>
The two-part gate: <the new rule and why it is not merely narrower but correct>
THE PROOF: <the fixed guard against 1631939^:e2e/places-map-view.e2e.ts — the exact output>
The new check seed: <the realistic shape you added>
Attribution corrected: <quote the new plan.md text and the new spec comment>
/browse: <fixed in the table, or now noted instead of silently skipped>
Guard 1 header: <the actual coverage you stated>
Cross-route absence: <how it is documented or tolerated>
places-map-view e2e: <the run result>
Commands run: <real tails; both checks; the GUARDS line; verify>
Gate green: yes | no
Commit: <sha>
```
