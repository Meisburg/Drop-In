# Slice 8b — INDEPENDENT review (different model family from the builder)

    Verdict: NEEDS_CHANGES
    Blocking findings:
      - scripts/guards/factory-guard.mjs:1753-1757 — [MECHANISM + FALSE CLAIM + UNDER-DECLARED BOUNDARY] the
        transcript-summary-agrees fence parser mis-CLOSES fenced blocks and the rule's own header claims otherwise.
        A same-kind fence line WITH an info string (```js), or a shorter same-char run, is accepted as a closer;
        CommonMark closes on neither (closer must be >= opener length and carry nothing but whitespace). A
        `✓ A–B … (all N)` line inside a REAL fenced block then falls in NO parsed block: the run prints
        "N fenced block(s) read, 0 range summaries checked — NOTHING was compared" and PASS, exit 0 — the identical
        output signature D-031/D-032 exist for (`0 … compared`, PASS, exit 0), reachable BY CONTENT, and absent
        from the ceiling list that claims to name "the exact shapes". Whether this invokes D-032's own clause
        ("if this shape opens a hole of the same family, the rule is deleted") is the orchestrator's ruling, not
        mine; the measurements stand either way.
      - scripts/guards/factory-guard.check.mjs:307-313 — [MECHANISM, NOT the builder's range — also found by
        sibling review 4, independently] the harness is RED at HEAD: check 13's seed deletes
        `task_kinds.reviewer._independence_gap` from the LIVE `REAL_CONFIG` and expects `independence-satisfiable`
        to fire. c4a981d (D-034, the orchestrator's) registered glm-5.3, so TWO models clear the reviewer floor, the
        seed's world stops existing, the guard rightly does not fire, and the check exits red
        (`1 check(s) failed — "an unacknowledged independence gap is CAUGHT — exit 0"`,
        `bash scripts/guards/run-all.sh` → `GUARDS: FAIL — 2 guard(s)`). Verified green at the slice's own commit
        (137/137 at 7c16e7a via a detached worktree), so the round-4 report's RUNALL/137 claims were true at its
        state and are stale at HEAD. Repair: build the one-qualified-model world inside the fixture config so the
        seed does not depend on who is registered (the recorded-premise rung).
    Non-blocking findings:
      - factory/decisions.md:947-948 — [FALSE CLAIM, out of the builder's lane;
        confirms sibling rounds' NB-e/NB4-d] the ruling still asserts "a fabricator cannot produce a baselined
        citation from a report — they would have to edit the guard", and commit c9530ab's message says "delete the
        over-claim rather than annotate it" while its diff does not delete it (typo fix + a cross-reference +
        the BLK3 paragraph). I did not touch it: factory/ is not this lane's file.
      - scripts/guards/lib-sibling-guard.sh:117-119 — [FALSE CLAIM, one sentence, new in this slice] the checked=0
        D-030 finding prints "src/lib had entries, but all were exempt or test files" even when src/lib is EMPTY
        (measured on /tmp/glsib: empty dir → this branch, exit 1 — the verdict is correct; the sentence is not true
        of the empty-directory case).
      - scripts/guards/factory-guard.mjs:1879-1883 + :1895-1896 — [UNDER-DECLARED BOUNDARY; sibling NB4-b,
        reproduced by me] `provenanceChecked = Boolean(repo)` and `transcriptsChecked` (constant `true`, :1604)
        publish their universal claims in the ok-list over ZERO measurements — measured: a scan with 0 provenance
        tokens and 0 pasted transcripts still prints both claims and PASS. Same class as NB-d, one gate short.
      - scripts/guards/factory-guard.mjs:1666-1671 — [boundary wording, minor] the ceiling frames `> ``` `-opened
        content as "a block with NO fence at all"; per CommonMark it IS a fence (a blockquote-fenced code block) —
        the MECHANISM behavior (not read, because the marker regex demands line start) is correctly declared by the
        same bullet ("a marker is read only at the start of a line"), so this is a wording nit only.
    Requirements traceability:
      - Q1 (is the rule sound; any fifth reachable shape) -> NOT SOUND as claimed: one undeclared, content-reachable
        escape family exists (fence mis-closure; three content variants). The sibling-concluded boundary
        (fabrication at a recorded path absorbed) is real, re-measured, and is no longer the only reachable shape.
      - Q2 (claims true of the mechanism) -> header :91-95 ("EVERY fenced block … however it is introduced, is
        read"), docblock :1629-1632 ("Every fenced block in the scan set, wherever it sits in the file … is read",
        "paired with a fence of its own kind") and :1745-1749 ("a fence line of the OTHER kind … as markdown says"
        — implying markdown fidelity of the pairing) are the sentences I could NOT make true by running code; every
        other sentence I attempted (all three records' docblocks, the ceiling's indented/mid-line/no-
        fence/scan-set members, the absorber's four directions, recordIsAbsorbable, trailing-newline's header,
        lib-sibling's header, the check files' headers) I made true by running code, except the two listed above
        and the two non-blocking sentences. Not audited at run time: rules' header sentences this slice did not
        touch (read only).
      - Q3 (are the checks real) -> trailing-newline 10/10 and lib-sibling 8/8 ran green in my hands, every
        mutation asserts a DETECTION flip (exit and/or mutant output, anchored uniquely with a throwing guard);
        lib-sibling genuinely FAILS at checked=0 (measured live on an empty and an exempt-only src/lib); the
        factory-family empty-record seeds assert each record's OWN message with exit-moving mutations (re-measured
        by me for all three maps); the claim-gate mutation is honestly declared as a claim-flop. The ONE checker
        that does not run green at e2c18b2 is factory-guard.check — check 13 — for the D-034 reason above.
      - Q4 (the sweep) -> verified: 78 files, every one exactly +1/-1, `git diff d75c5e9^ d75c5e9 -w` empty, byte
        spot-checks across src/ e2e/ scripts/ (6 files: prefix byte-identical, delta exactly 1, one trailing 0x0a);
        the guard run against aa331d0 via worktree reports exactly 78 findings; on the swept tree 327 files and
        0 findings.
    Recommended next action: adjudicate the mis-closure shape under D-032's own clause (fix the parser to CommonMark
    closure — closer >= opener length, no info string — with seeds and mutations, or rule deletion recorded
    known-open), re-cut check 13's seed to a fixture world, and have the orchestrator actually perform the
    decisions.md deletion its commit message recorded.

---

**DISCLOSURE (required): I am a different model family from the builder (GLM 5.3 reviewing DeepSeek's work), and
this is the first non-sibling review of this slice.** The builder's report and the three sibling reviews were
handed to me as INPUTS; every load-bearing claim below was re-measured by me in this turn. Where I could not
verify something I say so: I did not run `npm run verify`, the unit suite, or any e2e spec (the verify block's
Test Files 71 / Tests 2063 / oxlint 81 / AGENTS.md 1789 numbers are unverified by me); CommonMark semantics were
verified against `marked` (installed to /tmp/cmtest) plus the spec's closure rules, NOT against the reference
cmark renderer (none available offline). No repository file was edited; all probes ran in /tmp roots, throwaway
guard copies and detached worktrees; this report is the only file I wrote.

## Inputs read, and one input discrepancy

Read in the given order: `.scratch/v28/reports/slice-8b.md` (all 1091 lines; rounds 3 and 4 are the operative
handover), then the sibling reviews. **`slice-8b-review-4.md` did not exist when I started** (`find .scratch
-name "*review-4*"` found only slice-6d's and 8a's); it appeared mid-review as an UNTRACKED file written by a
parallel lane (the factory guard itself now flags its bare-HEAD quotations at :23/:44/:45/:122 — baseline work
the orchestrator owns). I read it and adjudicated it as prior sibling opinion, per the brief. I also read
`slice-8b-review.md`, `slice-8b-review-2.md`, `slice-8b-review-3.md` and skimmed the verify reports.

## Q1 — Falsification attempts, with the commands (all probes: throwaway root, real guard)

Probe-root contract (all runs): `mkdir -p /tmp/glmX/factory /tmp/glmX/.scratch/v28/reports && cp factory/config.json /tmp/glmX/factory/`,
then `node scripts/guards/factory-guard.mjs --root /tmp/glmX --repo .`

| # | shape (mine, not the siblings') | result |
|---|---|---|
| A | NESTED FENCES: ```` ``` ```` `` ``md outer, `` ```js `` inner, `✓ 7–13 zz-spec.e2e.ts (all six legs)` inside the inner fence, `` ``` ``, ```` ```` ```` closer — the standard markdown idiom for quoting a fenced block | **ESCAPES**: `2 fenced block(s) read, 0 range summaries checked — NOTHING was compared` … PASS, exit 0 |
| B | same-kind line with an INFO STRING inside an open plain block (```js / harmless / ```js / ✓ 7–13 … (all six legs) / ``` / ```) | **ESCAPES**: same signature, exit 0 |
| D | opener ```` ``` ```` `` ``md with the ✓ line after a bare shorter ``` line | escapes under my parser trace (same closer branch) |
| E | tilde nesting: `~~~~md` outer, `~~~js` inner | escapes under my parser trace (same branch, tilde kind) |
| C1 | blockquote-fenced (`> ``` / > ✓ 7–13 … / > ```) | not read, and an empty-block D-030 finding fires — mechanism declared (marker not at line start) |
| C2 | other-kind fence inside an open block (``` inside ~~~) | **CAUGHT** — exit 1, `covers 7 entries (7–13)` — the docblock's markdown claim holds for THIS member |
| C3 | four-space indented fence (leading whitespace accepted) | **CAUGHT** — declared over-read, as the docblock says |
| E1 | mid-line marker (`proof — raw: ```) | not read — declared member (round 4 named and seeded it); re-verified exit 0 |
| E2 | other glyph (`✔ 7–13 … (all six legs)`) inside a fence | not read — covered by the ceiling's "ONE shape is read" bullet |
| F | longer closer (opening ```, closing ````) | read — CommonMark-legal, no gap |

**The absorber's four directions re-measured (my runs):** recorded path + recorded text → exit 0 absorbed (D1);
NEW path + same text → exit 1 `covers 7 entries`, recorded file absent from findings (D2); second occurrence in
the recorded file → exit 1 (D3); recorded path + DIFFERENT text → exit 1 (D4). The declared path-occupancy
boundary is exactly as declared after rounds 3/4.

**Empty records, re-measured live (my surgery copies under /tmp):** emptying `BARE_HEAD_BASELINE` /
`UNRESOLVABLE_SHA_BASELINE` / `TRANSCRIPT_QUOTATION_BASELINE` over a clean root each exits 1 with that record's
own `… is EMPTY (D-030)` finding — BLK3's shared mechanism is real, and each call site suppresses its note.

**The CommonMark ground truth, verified:** `marked` renders shape A as ONE `<pre><code class="language-md">`
containing the ✓ line, and shape B as a `language-js` block containing it (`marked.parse`), i.e. in both shapes
the fabricated transcript IS inside a fenced code block per CommonMark, while the guard sees no block around it.
The two spec rules the parser violates: a closing fence must be at least as long as the opening one, and the
closing line may carry nothing but whitespace (an info string makes it content). My parser-trace (a node
re-implementation of factory-guard.mjs:1750-1762) reproduces the parse: shape A's blocks are `[content 3, end 4)`
and `[content 7, end 7)` — the ✓ line (index 5) in neither.

**Live-corpus presence:** a guard-parse-vs-CommonMark-coverage diff over all 159 scanned report/brief files found
exactly ONE disagreeing file, `.scratch/v28/reports/slice-8b-review.md` (the file holding recorded baseline entry
2): CommonMark keeps `~~~text`-lines 91/95/104… inside one block where the guard splits at :95 and :104. No ✓ line
sits in the missed region today, so the hole is LATENT on this corpus — reachable by content, not yet live.

**Verdict on Q1, plain:** the sibling conclusion ("I could not construct an undeclared fifth shape"; the only
reachable shape is fabrication at a recorded path) is FALSE. My shape A/B is a fifth reachable shape. It produces
the exact failure signature D-031/D-032 were written for. The one thing it does NOT do is reopen the attribution
family — there is no label left to break — so whether D-032's terminal clause ("this is the last attempt … the
rule is deleted and the defect recorded as known-open") applies is a ruling call: by output signature it matches
(`NOTHING was compared`, PASS, exit 0 over a fenced fabricated transcript); by the ruling's diagnosis (attribution
breaking) it does not. I report it and leave the ruling to the orchestrator.

## Q2 — sentences I could not make true, by running the code (the batch's defect class)

I ran every sentence this slice wrote or rewrote that I could operationalize. Three sentences (plus two minor
ones under non-blocking) do NOT survive:

1. `factory-guard.mjs:91-95` (header, the build law's authoritative scope statement): "EVERY fenced block, of
   either markdown fence kind **and however it is introduced**, is read" — FALSE by shapes A/B (exit 0 over a ✓
   line inside a real fenced block). Run quoted above.
2. `factory-guard.mjs:1629-1632` (docblock, WHAT IT READS): "Every fenced block in the scan set, **wherever it
   sits in the file**, of EITHER markdown fence kind … paired with a fence of its own kind" — FALSE by shapes A/B/E/D
   (a fenced block's content lands outside the parsed block set).
3. `factory-guard.mjs:1745-1749` (the parser comment): "BOTH markdown fence kinds, each paired with a fence of its
   own kind — a fence line of the OTHER kind inside an open block is content, **as markdown says**." — the
   other-kind half is TRUE (C2 fired); the sentence invokes markdown correctness only to stop invoking it at the
   SAME-kind boundary, where markdown has two more closure rules (information string; length) the parser ignores.
   The parser: `:1753 const marker = /^\s*(```|~~~)/` (captures exactly three chars, so length is never compared)
   and `:1755-1757 else if (open.kind === marker[1])` (closes on any same-kind line, info string unexamined).

Everything else I attempted, I made true by running it: the three record docblocks' claims (content direction
fires, second occurrence fires, path-occupancy absorbed, empty is a finding — D1–D4 + the three empty-record
runs); the ceiling's declared members (C1/C3/E1/E2, count spellings by regex reading `:1683`/`:1684`
`[–—-]`, count-after, vocabulary; `(all thirteen)`→unresolvable finding branch read at :1784-1790);
`recordIsAbsorbable`'s docblock (its finding text is the one the runs produce; the note is suppressed iff it
returns false); the ok-list claim-gate sentence for the RANGE claim (verified by round 4's three checks and re-run
by me: zero ranges → "NOTHING was compared", no range claim); `discloseScanProvenance`'s sentences (the
non-worktree note and the filtered-by-depth claim read at :1847-1873 and honored in runs); the trailing-newline
guard's header (last-byte only / empty / binary / unreadable counts / untracked via `--others` / non-git
filesystem-walk fallback which prints "via filesystem walk" and still D-030-fails on zero files — all measured above
and via its checker); lib-sibling's header (missing dir, exempt-only, empty → FAIL — measured). Sentences I did NOT
audit at run time: header sentences for rules outside this slice's touched prose (read only, no falsifier tried) —
stated as a limit, not a clean bill.

## Q3 — are the checks real?

Real, with one red exception at HEAD. Evidence:

- `node scripts/guards/trailing-newline-guard.check.mjs` → `PASS — all 10 checks` exit 0; every failure verdict
  carries a seed asserting the finding's own text AND a mutation whose exit moves (`mutatedGuard` with a
  uniqueness `throw` — an anchor that vanishes is loud, not silent). I read all four mutation anchors; each
  neuters the DETECTION (`if (false) {` at the last-byte test, the `text === 0` tripwire, the unreadable branch),
  not a message.
- `node scripts/guards/lib-sibling-guard.check.mjs` → `PASS — all 8 checks` exit 0; and the question's direct
  probe, live: `bash scripts/guards/lib-sibling-guard.sh /tmp/glsib` (an EMPTY src/lib) and `/tmp/glsib3`
  (exempt-only) both FAIL with the D-030 finding — so yes, **the guard genuinely FAILS when it checks zero
  files**, and its checker seeds both zero paths (`elif [ "$checked" -eq 0 ]` and the missing-dir branch) with
  exit-moving mutations, including the two-anchors-together mutant that would otherwise stay red on the seed.
- `node scripts/guards/factory-guard.check.mjs` — **exit 1 at e2c18b2: 1 of 137 checks failed** (check 13), for the
  D-034 interaction documented at the top. At the slice's own handover commit the same run is
  `factory-guard check: all 137 checks passed.` (worktree at 7c16e7a). I audited the harness's mutation set: no
  surviving mutation changes printing only (the anchors are comparisons, gates, and record lookups; the two
  claim-side mutations are declared as such and asserted on MUTANT OUTPUT, not exit); no seed asserts on empty
  input (the empty states are themselves findings with their own seeds); the sweep/separators loops assert
  `caught.exit === 1 && /covers 7 entries/ && missed.exit === 0` per row.

## Q4 — the trailing-newline sweep (78 files)

```
git show d75c5e9 --numstat --format= | every file exactly 1/1 (78 files; src 45 / e2e 20 / scripts 13)
git diff d75c5e9^ d75c5e9 -w --stat      -> empty (whitespace-only proof)
git show d75c5e9 --name-only | sed 's#/.*##' | sort | uniq -c  -> 20 e2e, 13 scripts, 45 src
spot-checks: src/App.tsx, src/components/BackControl.tsx, e2e/address-maps.e2e.ts,
  e2e/avatar-square.e2e.ts, scripts/qa-jev.sh, scripts/playtest_check.py — each parent=child-1 byte,
  `cmp -n` prefix-identical, last two bytes `7d0a`/`290a`/`630a` (one appended newline, not two)
node scripts/guards/trailing-newline-guard.mjs /tmp/glm-prefix   (worktree at aa331d0)
  -> FAIL — 78 trailing-newline finding(s).
node scripts/guards/trailing-newline-guard.mjs                   (the swept tree)
  -> 327 text file(s) read … 0 unreadable; PASS exit 0
```
The +1/−1 numstat shape also rules out double-newlines (a file that already ended in a newline would have changed
+1/−0). The four 2-line diffs to stale-locator-guard and vacuous-absence-guard are sweep files under scripts/ —
in scope for item 1.

## Scope discipline and honesty

Non-sweep files in `aa331d0..7c16e7a`: the two factory-guard files, the two new guards + their checkers,
`lib-sibling-guard.sh`, `run-all.sh` (both registrations present, :91 and :130/:140), `scripts/slice-diff.sh`,
`docs/agents/code-structure.md` (the "How a diff is inspected" note — traced), plus lane artifacts
(plan.md, ledger.md, slice-8b reports, decisions.md in the DECISIONS commits only). `slice-diff.sh` behaves as its
usage promises in my runs: slice 3 resolves printing the ledger-read base, 6c refuses on a fix-round-only base
citing ledger line 7156, 8b refuses with the found non-base dispatch line, and the usage block is complete. Every
builder number I re-measured matched: 78 files/38485 bytes... (per-file deltas above), 137 checks at handover,
both baselines printed as pasted, both new checkers' check counts. The one stale-at-HEAD set of numbers
(`GUARDS: PASS`, `RUNALL EXIT=0`, `137/137` at slice-8b.md:1045-1049) was true when written and is now stale for a
reason outside the range — measured, and flagged at the top.

## Ladder note

The batch's recurring defect class — a claim about an instrument the mechanism does not support — has now been
paid on this rule's header/docblock four times (round-1 B1 escape, round-2 BLK1, round-4 NB-a, and my finding).
If the orchestrator elects to keep the rule (rather than D-032's deletion clause), the header sentence must stop
promising CommonMark-complete fence recognition, and the closure defects must be fixed in the PARSER with seeds —
fifth prose repair of the same sentence would be a ladder finding; the rung below is the parser.

## Honesty-of-input note

`slice-8b-review-4.md` (sibling round 4) reached the same D-034/check-13 blocking finding as my independent run,
and its NB4-a/NB4-b/NB4-d are findings I reproduced or verified by reading before I saw them listed there. What
every sibling share missed is Q1's fifth shape; what the siblings shared and I confirm independently: the family
work of rounds 3/4 (BLK3's shared form, NB-a's re-worded harness, NB-b's seed, NB-c, NB-d) is real and measured.

