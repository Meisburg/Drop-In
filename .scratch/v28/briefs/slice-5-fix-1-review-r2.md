# Slice 5, fix round 1 — REVIEW (re-dispatch: the first attempt TIMED OUT at 30 minutes)

## Why this brief is shaped differently

The first reviewer ran **30 minutes**, made **41 bash calls**, and was killed mid-request. Its last
thoughts were *"Let me quickly verify kids editing exists on ProfilePage"* — it had left the diff and begun
auditing the whole product for true claims. **The brief it was given invited exactly that:** it asked *"is
every promise on the card true"* and *"VERIFY THAT MEASUREMENT if you can"*. That is **my defect, not the
reviewer's**, and it is the **second time this session** an unbounded confirmation instruction burned a
30-minute lane.

**So this brief is a CLOSED LIST. Answer these five, and stop.**

## Hard bounds — violating these is the failure mode

- **Read only** the diff `6131991..3215557` and files that **appear in it**.
- **Do not open any file the diff does not touch.** Do not audit other cards' or other tabs' copy.
- **Do not run tests, do not run e2e, do not query the database, do not re-measure anything.**
- **If you are not finished after ~10 minutes of work, STOP and report what you have**, with the findings
  you have so far and the numbers you did not reach.

## Already adjudicated — treat as FACTS, do not verify

The builder reported the migration's `26/239` hours figure was **stale**. **I ran it myself:**

```
total 239 · with_hours 184 · without 55 · city_default 164 · osm 20
playground 155 · splash_pad 30 · other 26 · pool 10 · beach 9 · library 6 · indoor_play 2 · museum 1
park 0 · trail 0
```

**Judge only whether the shipped copy is consistent with those numbers.**

## The closed checklist

**1. The Places line — `src/lib/firstRunTour.ts:114`**
Now reads `'look up a playground, a pool, a beach, and pick where to host'`.
Against the facts above: is **every noun** a kind that has rows **and** a kind the app offers a chip for? Is
*"host"* demonstrably a **capability the post form wires** (one grep maximum — the module header claims
`listPlaces` feeds the post form's picker)? **FAIL if any noun is a zero-row kind, a non-chip kind, or if
"host" is not actually wired.**

**2. The replacement test — `src/lib/firstRunTour.test.ts`**
Is it a **property** rather than a vocabulary? Does it **import** `PLACE_KINDS` / `PLACE_KIND_CHIP_KINDS` /
`placeKindLabel` from `places.ts` rather than restating them beside the copy? Does it assert **both**
directions? **Name any input that would still false-pass.** Its stated limit (taxonomy-scoped, not
row-scoped) — is that an honest limit or a hole?

**3. The shrunk ban list — `src/lib/firstRunTour.ts:164-166`**
The phrase `what's happening near you` was **removed** from the ban list, on the argument that banning a
never-shipped phrase forbids the plan's blessed intent while the **shipped** near-synonym (*"see what
parents near you are putting on"*, `:98`) walks past. **Is that reasoning sound? Yes or no, one paragraph.**
It was flagged rather than chosen — say whether flagging was right.

**4. The Profile line — `:118`, and its subordination test**
Copy: `'keep you and your kids up to date, and link your partner's account — search their name to find
them'`. Is the name search genuinely **subordinate** to the link flow in the wording, and does the assertion
enforce that ordering rather than just the presence of the words? Is the claim true of the product? (**One
grep inside the diff's own files is allowed here.**)

**5. The corrected `loadError` reasoning — `src/pages/OnboardingPage.tsx`**
The builder withdrew its original argument and now states a different reason. **Is the stated reason
accurate?** (The code behaviour was already adjudicated as correct; only the reasoning is in question.)

## Output

Verdict **PASS | NEEDS_CHANGES | BLOCKED**, findings with `file:line`, **a one-line answer per checklist
number**, and one sentence stating that you stayed inside the bounds. **"PASS with no findings" is a complete
answer.**
