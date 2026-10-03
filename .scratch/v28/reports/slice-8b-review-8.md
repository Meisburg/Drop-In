# Slice 8b — FINAL REVIEW, ROUND 8 (the independent lane, fifth round on this rule) — the close question

    Verdict: PASS — the slice is closable. Round 7's one blocking item is fixed with exactly the
    sentence I measured for; the two additions are verified sound; ONE item goes to known-open
    (real, measured, but hides nothing on any reachable tree state and is priced below).
    No repository file was touched by this review; all probes ran in /tmp (/tmp/x8a–x8e, /tmp/old-lib-sibling.sh,
    against the surviving /tmp/mdref reference install) plus the committed gate runs; no push.

## Q1 — My one blocking item: does the ceiling sentence declare what I measured, or overstate/understate?

**It declares exactly what I measured. No WRONG NUMBER, no OVER-DECLARED, no MECHANISM.**

`scripts/guards/factory-guard.mjs:1702-1706` (5 added comment lines; the diff hunk shows only the addition between
the unfenced-marker bullet above and the scan-set bullet below — no neighbouring bullet was reworded, and the
factory checker is unchanged at 185, which I re-ran green):

    - a fence marker INSIDE an HTML block is ALSO read: the scanner carries no
      HTML state, so a marker a raw HTML block swallows is opened as a fence
      where both references derive none. It is an OVER-read by construction — it
      can only ADD a read, so it cannot produce the `NOTHING was compared`
      signature this rule exists to close (D-037 §3);

Checked clause by clause against my round-7 measurements and two fresh probes:

1. **"the scanner carries no HTML state"** — the true mechanism (the type-6 HTML block runs to the blank line and
   swallows the ` ``` ` lines; the scanner, stateless about HTML, opens a fence). States the mechanism, not a
   fixture-shaped paraphrase.
2. **"both references derive none"** — true at the fence level and true for both HTML types my probes cover:
   commonmark 0.31.2 derives 0 fenced `code_block`s and marked 18.0.14 one `html` token (round 7, re-measured
   through the report's own end-to-end run); "raw HTML block" is the right generic altitude — no HTML type is
   excluded, and no HTML type can *contain* a fence in either reference, so the claim is true for every shape it names.
3. **"OVER-read by construction … cannot produce the `NOTHING was compared` signature"** — this is the part I
   attacked hardest, with a construction the round did not use. The plausible counterexample: an HTML-swallowed
   marker whose block never closes could SHADOW a later real fence (an HTML `~~~` marker runs the scanner's tilde
   block to EOF, and a ` ``` ` opener inside an open tilde block is content per CommonMark's own closer clause).
   If the scanner refused unterminated fences while the reference (which leaves the HTML at the blank line) kept
   the real block, a real reference-fenced summary line would go unread — an UNDER-read in D-037's trigger class.
   Measured (`/tmp/x8b`, the shape with ` <div class=x>` / `~~~` / text / a bare-` ``` ` line / blank / a real
   ` ``` ` block carrying a false `✓ 7–13 … (all six` label, and the real binary): **1 fenced block(s) read,
   1 range summary checked, FINDING at b.md:7, exit 1.** The scanner reads the unterminated HTML-swallowed fence
   to EOF (CommonMark's own behaviour, fixture-pinned), so the shadowed line lands INSIDE a read block and is
   compared. Every reachable construction is a supersets-of-reads; no line is dropped; the comparison machinery
   consumes every read line regardless of span; the escape does not exist. The sentence's direction claim is true
   under the sharpest construction I could build, not just under the round's.
4. It names no exhaustiveness it cannot hold and attaches nothing to measurement it does not have — the ceiling's
   declaration-pinned status is unchanged relative to its neighbouring bullets (all prose, all in the same
   epistemic class). Per D-028 it is the smallest true sentence. If a future edit ever gives the scanner HTML state,
   the boundary REMOVES itself safely: over-reads stop; no fixture, no fuzz and no divergence is touched in
   between — the sentence grows stale in the harmless direction, and the neighbouring boundary bullets have the
   same property. No fix demanded beyond what the ceiling already is.

ITEM 1 is what my round-7 blocking required, one-for-one. The report's own probe output reproduces byte-for-byte in
my probe (`/tmp/x8a`: `1 fenced block(s) read, 1 range summary checked`, `FINDING [transcript-summary-agrees] … :3`,
exit 1 — the extra `[config-exists]` line is a throwaway-root artifact, not a tree finding).

## Q2 — The widened `lib-sibling-guard.sh`: safe, honest churn, and the exemption is a reasoned act

**The churn is not a rewrite.** The `git show` diff (`144` lines = 73+/71−, and the moved block dominates it): the
old inline loop's body appears line-for-line inside `scan_set()` with two parameters added (`$dir`, `$sibling`);
the exemption block moved up ~40 lines and gained one entry; three new call lines and a widened skip list; the
missing-`src/lib` branch and the D-030 branch survive with only message rewords. The `mutatedGuard` anchors in
`lib-sibling-guard.check.mjs` were updated in lockstep (`if [ ! -f "$dir/$base$sibling" ]`), and those anchors
run with the must-occur-exactly-once rule (`:66-69`, `:80-85`) — they did not throw, so checker and guard moved
together. Disclosed as "144 churn lines from a moved block" — accurate.

**Coverage it started watching** (the D-025/D-030 standing hunt, answered): `src/lib/*.mjs` → sibling `.test.ts`
(1 real module, `escapeForRegExp.mjs`, which `ce3479c` shipped while the old glob could not see it — the widening
now counts it) and `scripts/lib/*.mjs` → sibling `.check.mjs` (2 modules: `sweep-e2e.mjs`, whose `.check.mjs`
sibling exists, and `fence-scanner.mjs`, exempt). **Measured both ways:** the committed guard reads
`all 57 non-exempt module(s)`, PASS exit 0; the OLD guard (from `7811a18`) on the same tree reads `all 55` —
exactly the report's `55 + escapeForRegExp.mjs + sweep-e2e.mjs`. **What it stopped watching: see Q4** — one item.

**Does it weaken the `src/lib/*.ts` reach? Not at the module level.** Same glob, same sibling suffix, same
treatment of test files; the exemption keys went from basename to path-from-root, which is strictly STRONGER (old
keys could match any same-named file in the one scan set; new keys match only the named paths); the skip-list
widening (`*.check.mjs|*.d.mts|*.d.ts`) is REQUIRED by the new reach — without `*.check.mjs` the `scripts/lib`
scan would count `sweep-e2e.check.mjs` as a module demanding a `sweep-e2e.check.check.mjs` — and for the
`src/lib/*.ts` set it changes nothing on this tree (no `.d.ts` exists; `.d.mts` is unreachable by ANY of the three
globs — a dead-but-cheap pattern, trivia, no finding). Checker: PASS **13/13** measured, with the five new
checks (two seeds, two exit-moving mutations, one control) exactly as the report describes; factory checker
**185/185** measured; `run-all.sh` → `GUARDS: PASS` measured.

**The exemption for `scripts/lib/fence-scanner.mjs` is a reasoned, reviewable act, not a hole.** It is ONE named
path, its reason cites two real things — the covering machine test (the fixture block: the 30-case
reference-derived conformance table; round 7 measured that block's machinery throws on anchor-count ≠ 1 and flips
end-to-end) and the one-copy rule (`docs/agents/code-structure.md:93-95` — verified real). A second copy beside the
module WOULD be paid twice. And the hole my round-7 non-blocking named closes: the NEXT `scripts/lib` module with
no sibling of its own is now CAUGHT — measured (checker seeds + mutations green; my `/tmp/x8c` probe printed the
`MISSING: scripts/lib/orphan.mjs has no scripts/lib/orphan.check.mjs` line).

**The provenance entry (`docs/agents/borrowed-guards.md`, +76):** all five required parts present and verified:
what was taken (six clause lines each citing `lib/blocks.js`); from which reference and version (`commonmark`
0.31.2, `lib/blocks.js`, BSD-2-Clause) and why not marked (its closer suffix admits spaces only; per D-037 §2 a
reference disagreement, settled by the authority's clause); **what was refused and why** (a dependency — a guard
whose meaning moves when a package bumps is the failure D-039 exists to prevent — plus container machinery and
`_fenceOffset`/info-string/NUL details the rule does not ask about); the four tests **which are the doc's own four**
(`## Adding a fourth guard`, checked side-by-side), each with its evidence (rule named in the factory header;
deterministic; fixture-corrupted-edit visible; imports nothing — I grepped the module: no imports — with the
fixture block as its behaviour test). **The two unestablished facts are stated, not filled in, and both are TRUE as
stated:** "the provenance header is not machine-checked — the instrument-header rule reads `scripts/guards/*.mjs`
one level deep" (verified: `factory-guard.mjs:485-489`, `readdirSync` of the one directory, no recursion — the
prose about provenance really does escape every machine) and "ships no sibling test of its own … the lib-sibling
guard now scans `scripts/lib/` and carries a written exemption for this module that names that test" (verified in
the guard). The entry does NOT claim the widening machine-checks the provenance prose — it records exactly that it
does not. `factory/decisions.md` untouched by the round, so D-039's hard limit (a further divergence ⇒ delete,
recorded known-open) stands as recorded; the round introduced no scanner mechanism and my probes found no D-037-class
divergence (no reference-fenced line dropped), so nothing fires the limit.

## Q3 — Verified claims of the FINAL ROUND report, against the diff (D-025 hunt on the round's own prose)

- "checker rose 8 -> 13" — verified: 13 `check()` calls, 13 ✓ lines, PASS.
- "57 non-exempt modules (55 before + escapeForRegExp.mjs + sweep-e2e.mjs)" — verified: committed guard 57, old guard 55, same tree.
- "no neighbouring bullet reworded … factory checker unchanged at 185" — verified: diff adds 5 comment lines only; 185/185 re-ran.
- Gate claims (npm run verify 71/2063, lint 81 warnings/0 errors, AGENTS.md 1789/1800, GUARDS: PASS) — NOT re-run by
  this lane, per the standing convention; every claim this lane CAN re-measure reproduced exactly (real-tree guard,
  both checkers, run-all), the product tree is untouched by the round (5 guard/doc/report files), and round 7's
  independent measurements of the same suite stats matched. No contradiction found; attested without finding.
- The Risks section's three bullets are all true as stated (exemption deliberate-act; provenance header outside the
  machine scan; missing-`scripts/lib` has no finding, with the global D-030 zero-check named).

## Q4 — The standing hunt (D-025, D-030) on what this round ADDED — one real finding, recorded

**The widened rule STARTED watching:** `src/lib/*.mjs` and `scripts/lib/*.mjs` (both seeded, both mutation-covered,
both measured green). It **STOPPED watching one thing:** the D-030 empty-scan tripwire's per-set granularity.

  - scripts/guards/lib-sibling-guard.sh:23-25, :123-126, :176-177 + .scratch/v28/reports/slice-8b.md Item 2 sentence
    and the commit message of 0f86aa9 — **`ladder:` MECHANISM** (the D-030 instance-4 hazard, in the instance-4 shape:
    *an invariant declared at one granularity is a claim at every other granularity*). The `checked` counter is now
    the UNION of three scan sets, so the src/lib empty-set finding fires only when ALL THREE sets are empty. Measured:
    a hollow src/lib (exempt-only, or empty) beside a clean populated scripts/lib now **PASSes silently** (`ok — all 1
    non-exempt module(s)`, exit 0) where the old guard **FINDINGs** ("src/lib holds no non-exempt module", exit 1).
    Three artifacts now describe the old granularity: the header's ZERO-IS-A-FINDING paragraph (still enumerates
    "an empty or missing src/lib, or a src/lib whose every entry is exempt or a test — the run FAILS", which
    code-structure.md:118-127 itself declares the defect when header and implementation disagree); the D-030 branch's
    message (names "src/lib" when it fires on the union); and the round's own claim "the D-030 zero-scan finding is
    untouched" (false at that edge, though the SAME Risks section states the union truth: "only the global D-030
    zero-check would notice a fully empty scan"). **Why non-blocking, and why this is known-open rather than a tenth
    round:** on this tree and in every state the tree can REACH without catastrophic parallel failure (all 57 modules
    deleted = thousands of broken imports, 2063 red tests, red bare-head registry), nothing is hid; every checker
    seed still fires; the class the tripwire exists for is unreachable without louder failures dominating the same
    commit; the round's Risks section already discloses the mechanism. The finding is the class D-030 was written
    from (paid before, at 6d's B3 and 8a's round-2 — hence `ladder:`), and its rung is not a code fix but a
    granularity decision someone must make deliberately: per-set counters + per-set FINDING + reworded header and
    message, OR an explicitly widened D-030 reading with the granularity stated. Two sentences or four lines. Goes
    one rung down into `factory/decisions.md`'s D-030-instance-4 lesson, not into a ninth patch round.
  - Trivia, recorded for completeness, no action: the `*.d.mts` case pattern (lib-sibling-guard.sh:98) is unreachable
    by every glob the guard runs; and a hypothetical `foo.test.mjs` under `src/lib` would be counted as a module
    (the stated convention is `.test.ts`). Both latent, neither reachable on this tree, neither hiding anything.

## THE CLOSING QUESTION — answered plainly

**Yes — I would sign off.** The product work and the other guards were clean many rounds ago; the sentence my fourth
round demanded landed exactly as measured; the widened guard is load-bearing with every new reach seeded and
mutation-anchored; the provenance entry is the one D-039 asked for, with the unestablished facts stated instead of
filled. Nine rounds is the tail the rung consumed; the round cost stopped there too — the close-out added five
comment lines and a rule's reach, no mechanism, no clause, no checker change (factory 185 unchanged).

**Known-open, to be recorded rather than left implicit:**

1. **The D-030 empty-scan tripwire is union-granularity now** (the `ladder:` finding above) — the one real gap this
   round's widening left; record in the next decisions/ledger entry, fix at the next deliberate touch (per-set
   counters or an explicit granularity statement), not as a tenth round.
2. **The scanner's provenance header is prose the machine never reads** — now recorded in `borrowed-guards.md`
   rather than implicit; the honest boundary, priced.
3. **The fence boundary remains declaration-pinned, not measurement-pinned, in the container and HTML directions** —
   declared by the ceiling (this round's sentence added the HTML direction), 26 508-line corpus parity clean, and
   this lane's probes confirm both directions can only add reads. Any future edit that changes the direction has a
   fixture and a fuzz to answer to.
4. The D-030 branch's message can fire on the union while naming "src/lib" — folded into item 1.

## Recommended next action

Close slice 8b: mark the rule closed (kept, rung held, no eighth divergence, no delete), record the four known-open
items above in the next ledger/decisions entry — D-030's per-set granularity first among them — and move the batch on.

