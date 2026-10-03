# Slice 8a — fresh-context review, ROUND 3 (round-2 fix, `ece6fd4..1c30d6a`)

## DISCLOSURE (required, D-007 / D-015)

**I am a sibling model, not an independent reviewer.** Fresh *conversation*, not an independent instrument.
Weigh this verdict accordingly (D-015).

**What I ran (read-only except this report):** `git log`/`git show`/`git diff`; `grep`/`sed`; `npx playwright
test --list` (twice); `node scripts/guards/factory-guard.mjs` (once, plus a THROWAWAY copy with
`BARE_HEAD_BASELINE` emptied, run with `--root`); a Node re-implementation of the round-2 `codeOnly` scanner run
over `src/pages/ProfilePage.tsx`, diffed character-by-character against a real parser
(`@babel/parser` 7.29.8, already in `node_modules`); and a read of the round-1 verifier's own run artifact
(`/tmp/pi-subagents-uid-1000/async-subagent-runs/034807cd-df57-4e8d-b023-137d6ebff3c0/events.jsonl`,
`toolCallId call_8iqzpn6s`). **What I did NOT do:** I did not run `npm run verify`, `npm run test`, or any spec —
my lane does not run the suite, and the builder's success claim is not evidence.

**Range note: `ece6fd4..1c30d6a` is 6 commits, and only 4 are the builder's.** `4d3af39` ("fix round 1
recorded") and `55cf3e6` ("register the lib-sibling-guard checked=0 hole … as 8b-owned") are *orchestrator*
records inside the range; the fix round proper is `91ecb7f`/`c3f65b2`/`3b170d1`/`1c30d6a`. Nothing turns on
it; recorded because a range claim should reproduce. One in-range change is outside the builder's brief by
construction: `factory/work/v28-r2-8b.json` (`55cf3e6`) also rewrites the item's `title` to escape its em-dash
(`"8b —"` → `"8b \u2014"`), a pure serialization churn (see NON-BLOCKING).

---

## VERDICT: **NEEDS_CHANGES** — 1 blocking finding.

Both round-2 blockers are **CLOSED and independently verified** (below). The block is one surviving wrong
number the previous review's own recommended action named (`:179`) and the round left in place while adding a
paragraph that says the run shows SEVEN. Everything else is non-blocking.

---

## ADJUDICATIONS (one line each, as asked)

**BLK-1 — HOLDS.**
(i) The lane record **is** byte-identical to what that lane wrote: I recovered the round-1 verifier's single
heredoc write from its own run artifact and `diff`ed it against the tree — **empty** (`diff <(extracted heredoc)
1c30d6a:.scratch/v28/reports/slice-8a-verify.md` → no output). Against the committed `4d3af39` version it differs
by exactly the two tokens round 1 had edited (`..HEAD` ↔ `..322902f`, and the `:52` label).
(ii) The red is absorbed by **RE-DERIVATION, not a hand-edit**: I emptied `BARE_HEAD_BASELINE` in a throwaway
copy and ran it (`node /tmp/scan/guard/factory-guard-empty.mjs --root <repo>` → **658** `FINDING
[no-bare-head-count]` lines). The committed map is **exactly** that run's derived set: 426 distinct keys / 658
occurrences on both sides, `dict(derived) == committed` → **True**, zero keys only-derived, zero only-committed,
zero count mismatches. Against `ece6fd4` the map is +9 keys / +11 occurrences, **0 removed, 0 counts changed**.
`node scripts/guards/factory-guard.mjs` → `exit 0`, `baseline holds 658 recorded occurrence(s)`.
(iii) The rule **is** written down (`slice-8a.md:611`, the `c3f65b2` commit body, the ledger), but **not
promoted to a durable conventions doc** — see NON-BLOCKING.

**BLK-2 — HOLDS.** The paste reproduces **exactly**. My run of the command as pasted (`slice-8a.md:369-376`):

```
$ grep -rn "nominatim" e2e/*.ts | cut -d: -f1 | sort | uniq -c
      1 e2e/fixtures.ts
      2 e2e/places-map-view.e2e.ts
     21 e2e/signup-zip-fallback.e2e.ts
$ grep -rn "NOMINATIM_ROUTE = " e2e/ src/ scripts/
e2e/fixtures.ts:33:export const NOMINATIM_ROUTE = /https:\/\/nominatim\.openstreetmap\.org\/search\?/
$ grep -c "openstreetmap" e2e/places.e2e.ts
6
```

Byte-for-byte the same as the report's block. The 21 in `signup-zip-fallback.e2e.ts` (the round's own edit) is
the point; the old hand-written list that omitted it is gone.

**The avatarUrl legs — read is REAL; both empty-cases are RED; the ceiling is half-honest.**
- *Comment-free read real?* **Yes, and verified against a real parser, not argued.** Running the round-2
  `codeOnly` over the actual `src/pages/ProfilePage.tsx` and diffing blanked positions against
  `@babel/parser`'s comment ranges: **LEAK regions (comment text surviving) = 0 chars; OVERBLANK regions (code
  text blanked) = 0 chars**. On the one file it reads, the scanner is *exactly* a parser's comment stripper.
- *Both legs fail on an empty read?* **Yes.** Each `it(` asserts `profilePageSource.length > 0` **and**
  `codeLength > 0` **before** the match (`avatarUrl.test.ts:133-139`, `:148-154`). My re-implementation on `""`
  → `rawLen=0 viewLen=0` → both legs **false** (red). Empty is a finding, not health. The round-2 review's
  vacuous-`not.toMatch` hole is closed.
- *"None exists" measurement for the regex ceiling?* **Verified, by a stronger instrument than the grep the
  report cites.** `@babel/parser` over `ProfilePage.tsx` → **`RegExpLiteral count: 0`**. (A grep for
  "regex-literal shapes" is a weak instrument that can miss `/foo/g`-after-`=`, so I used the AST.) The ceiling
  half about regex literals is honest.
- *Alias clause?* **Not honest as written** — see NON-BLOCKING #1.

**The four non-blocking items — all four HOLD.**
1. `1031` **retracted to measured values.** `slice-8a.md:478-482` now says 1024 at `ae578c2`, 1034 at
   `bc00d04`/`3f2da79`, and drops the invented number. Measured: `ae578c2`→**1024**, `bc00d04`→**1034**,
   `3f2da79`→**1034**, `8d1170d`→**1012** (`git show <c>:src/pages/OnboardingPage.tsx | grep -n 'setZipFallbackShown(result.zip'`).
2. **The totals row corrected.** `slice-8a.md:194` now names the LONG form, whose `--list` is **`Total: 13
   tests in 5 files`** (the short form is **`14 in 6 files`**, the extra being `avatar-square.e2e.ts:71`).
3. **F3's rebuttal conceded.** `slice-8a.md:391` — *"my rebuttal of the review was WRONG"*, and `:396-400`
   states the review measured the command *this report's own totals table records*.
4. **The ledger item flagged, not edited.** FR2-3 row 4 (`slice-8a.md:632`) flags it for its owner with the
   symbol and current line; the builder did not touch `.scratch/v28/ledger.md`. The orchestrator then fixed it
   (`7647401`): ledger `:7233` no longer carries `avatar.e2e.ts:199`.

---

## THE NEW SURFACE — the hand-written `codeOnly` scanner, tested adversarially

Method: re-ran the exact `codeOnly` from `src/lib/avatarUrl.test.ts:97-126` over the six constructs asked
about (plus three relevant extras), then applied **the legs' own regexes** to the result. `leg1pass` means
"the call leg would be satisfied"; `leg2pass` means "the negative leg would be satisfied". Both are gated by the
non-emptiness asserts, as in the file.

| # | input (exact) | blanks correctly? | leg1 | leg2 | false pass reachable on the leg's purpose? |
|---|---|---|---|---|---|
| 1 | `""` (empty `?raw`) | — (empty) | **false** | false | no — correctly red (D-030 closed) |
| 2 | `// hasAvatarUrl( not a call\nconst x=1\n` | **yes** (comment blanked) | **false** | true | no — the round-2 fix's whole point; the raw-text leg round 1 would have said `true` |
| 3 | `` const t = `a // hasAvatarUrl( b` `` (comment inside a template) | yes — the `//` is **string** content, not a comment, so it is preserved | **true** | true | **YES, MECHANISM** — a template literal whose text contains `hasAvatarUrl(` satisfies leg 1 with no call |
| 4 | `const s = 'http://x // hasAvatarUrl('\n` (`//` inside a string) | **yes** — preserved as string | **true** | true | **YES, MECHANISM** — same vector: string content can satisfy the call leg |
| 5 | `const r = /[//]/g\n// hasAvatarUrl(\n` (regex literal with `//`) | **no — over-blanks**; view is `const r = /[ ...` and the rest of the line is gone | **false** | true | false **FAIL** reachable: a real call on the same line after a regex literal is blanked away |
| 6 | `a\n/* x\nhasAvatarUrl(\ny */\nb\n` (block comment spanning lines) | **yes** (newlines kept, line structure kept) | false | true | no — correctly red |
| 7 | `const s = 'it\\'s // hasAvatarUrl('\n` (escaped quote) | **yes** — one `\` consumed with the next char, so the string closes in the right place | true | true | no (the text is inside a string; vector = #4) |
| 8 | `` const t = `o ${`i`} tail`\n// hasAvatarUrl(\n `` (nested template) | yes — content preserved, no false blank | false | true | no — correctly red |
| 9 | `<p>Don't stop</p>\n// hasAvatarUrl( a mention\nconst x=1\n` (JSX apostrophe) | **NO — desyncs.** The lone `'` in JSX text puts the scanner in `sq` state, which PRESERVES everything after it, so the comment is never blanked | **true** | true | **YES, MECHANISM** — a comment mentioning the call after a JSX-text apostrophe satisfies leg 1 |
| 10 | `const r = /[//]/g; hasAvatarUrl(a)\n` (regex then real call, same line) | **no — over-blanks the real call** | false | true | false FAIL (same direction as #5, sharper) |

**Which are reachable on the file the leg actually reads?** None, today, and I measured that, not assumed it:
`leaks=0, overblank=0` against Babel means the current file contains no lone-apostrophe desync and no
mis-tracked comment; `RegExpLiteral count: 0` means #5/#10 cannot fire; the view holds exactly **one**
`hasAvatarUrl(`, and `@babel/parser` confirms it is the real `CallExpression` at
`src/pages/ProfilePage.tsx:1227` (`real calls to hasAvatarUrl: 1 ["hasAvatarUrl(profile.avatar_url)"]`), not
string data. So the leg is **sound on the current tree**. The vectors above are latent — and the ceiling names
only one of them (the regex literal), which is why #9/#3/#4 are an under-declared boundary, not a live false
pass.

---

## THE CLASS HUNT (D-025 / D-030) in what this round added

- **The scanner** — an empty read is caught twice (`:133-139`, `:148-154`); the two *sets* it watches are both
  asserted. Its output cannot come back empty-and-green. **Clean on the actual file** (0/0 vs a parser).
- **The non-emptiness assertions** — two sets watched, and the D-030 lesson ("an invariant at one granularity
  is a claim at every other") is written into the docblock (`:61-65`). No third set was left unwatched that I
  can name; the pair is strictly stronger than the pair it replaced.
- **The restored report** — prose; contains counts but no measurement that can come back empty. Its own
  numbers (2061 / 71 / 1789 / 0 / 81) are unchanged from the lane's write (verified by the empty diff above).
- **The re-derived baseline** — I checked whether it can be **empty and consumed as health**: emptying the map
  makes the guard emit 658 findings and fail (`FAIL — 658 factory finding(s)`), and the size is *printed*
  from the map (`BARE_HEAD_BASELINE_SIZE`), never typed. So the baseline cannot shrink green. **Clean.**
  One neighbouring hole is *pre-existing*, not added this round: `scripts/guards/factory-guard.mjs:1386-1391`
  — if `.scratch/v28/reports` and `briefs` hold no `.md` at all, `checkReportHeadCounts` prints
  *"report and brief counts unchecked here"* and returns **without failing** — the D-030 shape ("zero is a
  finding, never a pass") inside the very guard this round re-derived. It is the sibling of the
  `lib-sibling-guard.sh` `checked=0` hole just registered for 8b.
- **The three doc corrections** — measured above (1031, the totals row, F2's paste); each reproduces.

---

## BLOCKING

### [WRONG NUMBER — `ladder:`] `.scratch/v28/reports/slice-8a.md:179` — "all six legs" for a **seven**-leg spec, left in place

The block at `:172` is introduced as **`— raw:`** and its `:179` line reads
`✓ 7–13 signup-zip-fallback.e2e.ts (all six legs)`. Rows `7..13` are **seven** legs; the spec has **seven**
(`npx playwright test --list signup-zip-fallback.e2e.ts` → `Total: 8 tests in 2 files` = setup + **7** legs),
and the report itself now says so at `:394` (*"it said signup-zip-fallback had 'all six legs' where the run below
shows SEVEN"*). F3 declares the block "a COMPRESSED rendering, not verbatim … my defect" — **but neither the
wrong number nor the `raw:` label was deleted**, so §3 and F3 contradict each other in the same document, and a
reader who stops at §3 is still misled.

This is the same class review-1's B3 returned, and it is named in review-2's own *recommended next action*
("correct F2's pasted grep and the `:194`/`:179` numbers"). Round 2 corrected `:194` and left `:179`. Per
**D-028** the move is to **delete** the number (and the `raw:` label it sits under), not to restate it — a
seventh round of prose about a block that keeps being wrong is what D-028 exists to stop. Because this is the
**third** time this block is the finding, it is prefixed `ladder:` and the durable fix is structural: either
delete the block, or make the transcript check (`checkTranscripts`, `factory-guard.mjs:1479`) fail a fenced
block labelled `raw:` that carries a fabricated parenthetical.

---

## NON-BLOCKING

1. **[FALSE CLAIM / MECHANISM — `src/lib/avatarUrl.test.ts:71-75`]** The rewritten ceiling says *"a call
   written through an alias still passes leg 1, which is intended: an alias call IS a call."* Measured with the
   leg's own regex: an **aliased function call does NOT pass leg 1 — it FAILS it.**
   `import { hasAvatarUrl as pred } …; pred(profile.avatar_url)` → `/hasAvatarUrl\(/` **false**;
   `const p = hasAvatarUrl; p(profile.avatar_url)` → **false**. The sentence is true only under the strained
   reading "an aliased *argument*" (`hasAvatarUrl(a)`), and the gloss "an alias call IS a call" points the other
   way. The header therefore states a limitation the mechanism does not have — D-025's class with the sign
   flipped. The leg's *behaviour* is fine; the sentence must say which "alias" it means.
2. **[UNDER-DECLARED BOUNDARY / MECHANISM]** The ceiling names the regex-literal hole but not the two
   false-**pass** vectors that are actually reachable in a `.tsx` file this size: a **JSX-text apostrophe**
   (scanner desyncs into `sq` and stops blanking comments for the rest of the file — input #9) and **string/
   template text containing `hasAvatarUrl(`** (inputs #3/#4). Neither exists in `ProfilePage.tsx` today
   (measured: 0 leaks; 0 regex literals; the one `hasAvatarUrl(` is the real call at `:1227`), so this is a
   ceiling gap, not a live hole. The sentence the ceiling *does* carry — "a quote character inside a comment
   cannot desynchronise the scan" (`:91-93`) — is true, but it points attention away from the quote that *can*
   (a quote in code).
3. **[MECHANISM — rule location]** The new standing rule is written at `slice-8a.md:611`, in the `c3f65b2`
   commit body, and in the ledger (`:7240`, `:7244`) — but `grep -rniE "hand-edit|another lane" AGENTS.md
   factory/decisions.md docs/agents/*.md` → **no hit** outside the already-existing D-011/D-021/D-023 text.
   The ledger's *"The standing rule is now written where a future builder sees it"* is true of the *report* and
   the ledger; it is **not** true of the conventions doc a later-slice builder reads (this brief itself orders
   builders to read `factory/decisions.md`). The underlying convention survives in D-021 item 2, so the loss is
   the *new* half ("a red guard caused by a lane report is reported, not resolved").
4. **[MECHANISM — pre-existing, adjacent]** `scripts/guards/factory-guard.mjs:1386-1391`: a zero-file
   report/brief scan prints *"unchecked here"* and **passes** — the same `checked=0` shape as the
   `lib-sibling-guard.sh` hole just registered for 8b. Not introduced this round (the round touched only the
   map), recorded because the round's re-derivation depends on that scan set.
5. **[Cosmetic churn]** `factory/work/v28-r2-8b.json` (`55cf3e6`, an orchestrator commit): the item `title`
   changes only by escaping its em-dash (`"8b —"` → `"8b \u2014"`). Semantically identical; a diff line that
   traces to no decision in this slice.
6. **[Formatting]** The round-1 table cell at `slice-8a.md:461` embeds an unescaped `|` inside a code span
   (`grep -rln 'finishSignup(' e2e/*.ts | grep -v …`), which breaks the markdown row for a reader. Pre-existing
   (not touched this round); the count it cites is correct (`grep -rln "finishSignup(" e2e/*.ts | grep -v
   "/fixtures.ts" | wc -l` → **18**).

---

## REQUIREMENTS TRACEABILITY (round-2 remit)

| requirement | ruling | evidence |
|---|---|---|
| BLK-1: lane record restored byte-for-byte; red absorbed by re-derivation, not a hand-edit | **MET** | `diff`(verifier's own heredoc, HEAD) → empty; emptied-map run → 658 findings; committed map `==` derived set (426/658); `factory-guard.mjs` exit 0 |
| BLK-1: the new standing rule recorded for a future builder | **PARTIALLY MET** | `slice-8a.md:611`, ledger `:7240/:7244`, commit `c3f65b2` — **not** in `factory/decisions.md` / `AGENTS.md` |
| BLK-2: the pasted measurement reproduces exactly | **MET** | my run reproduces 1 / 2 / **21**, the `NOMINATIM_ROUTE = ` line, and `6` |
| avatarUrl: comment-free read real, both legs fail on an empty read | **MET** | 0 leaks / 0 overblanks vs `@babel/parser`; four `toBeGreaterThan(0)` guards at `:133-139`, `:148-154` |
| avatarUrl: ceiling honest and measured (regex-untracked; alias-call intended) | **PARTIALLY MET** | regex half measured true (AST `RegExpLiteral: 0`); alias half false as written (NON-BLOCKING #1); two reachable false-pass vectors unnamed (#2) |
| the four named non-blocking items | **MET** | 1031→1024/1034 measured; totals row = long form 13/5; F3 conceded; ledger flagged then fixed by its owner |
| test delta zero; legs rewritten not added | **MET in form** | `avatarUrl.test.ts` holds 5 legs (3 + 2); suite counts are builder-pasted (residual) |
| scope: every changed line traces to the slice | **MET** except | the `v28-r2-8b.json` em-dash escape (#5) |
| B3: the `raw:` block's number/label corrected | **NOT MET** | `slice-8a.md:179` still "all six legs"; `:172` still `raw:` (BLOCKING) |

---

## RESIDUAL RISKS

- `npm run verify` (71 / 2063), both round-2 mutation outputs, and the Playwright timings are **builder-pasted**;
  I re-ran the factory guard and the `--list` enumerations only. No verifier lane covers `1c30d6a` — the newest
  `slice-8a-verify-2.md` covers the round-2 *fix round*, not this tree.
- The scanner is verified exact on the ONE file it reads, at ONE revision. It has no test of its own; a future
  edit to `ProfilePage.tsx` that adds a JSX-text apostrophe or a regex literal would silently change what the
  leg measures, and nothing would fail (NON-BLOCKING #2).
- `lib-sibling-guard.sh` `checked=0` and `factory-guard.mjs:1386-1391`'s zero-file path are both live
  empty-as-health holes; the first is now 8b-owned, the second is owned by nobody.

**Recommended next action (one line):** delete the wrong number and `raw:` label at `slice-8a.md:172-179`
(routing that block's recurring defect into the transcript guard rather than a fourth prose round), state which
"alias" the ceiling's clause means, name the JSX-apostrophe/string false-pass vectors in the same ceiling, and
promote the standing rule into `factory/decisions.md` — the round-2 fix itself (both blockers, the four items,
the legs) I would sign off as it stands.
