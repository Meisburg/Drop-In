# Slice 8c — fresh-context independent review (GLM; builder DeepSeek)

**Reviewed commit: `07c683e`** (`07c683e747e5f1b88a82327772b219dcbd0fe835`, branch `Meisburg/onboarding`, parent = dispatch base `33605d9`, not pushed). Diff inspected directly (`git show 07c683e`): one file, `e2e/onboarding-kid-photo.e2e.ts`, **+18/−3, three hunks**, no other file. Worktree file is byte-identical to `07c683e` (`git diff 07c683e -- e2e/onboarding-kid-photo.e2e.ts` → empty), so every line number below is the committed line, cited as `(07c683e)`.

## Verdict

**NEEDS_CHANGES** — 1 blocking finding (a comment sentence's scope; zero behavior change asked). Everything else in the diff verified clean; every checkable report claim traced.

### Blocking findings

- **`ladder:` FALSE CLAIM (D-025 class) — `e2e/onboarding-kid-photo.e2e.ts:292` (07c683e)**: *"This assertion therefore cannot see a re-mint the count catches."* The sentence drops the same-second qualifier its own premise carries (:291, "two mints of the same path inside one second"). Read absolutely it states a limit the mechanism does not have: a cross-second re-mint yields a different `iat`/`exp`, a different token, and this very assertion's `.toBe(srcAfterAdd)` (:294-296) **fails** — it detects exactly those re-mints. That capability is not theoretical: it is the pre-fix symptom the untouched observation comment records (:248-256, "the settled photo's src swapped to the fresh URL each time"), i.e. S1 would have failed against the real F3 regression. The misreading is live in this slice's own records — the builder's committed report §8 (`f53ab7e`) uses the absolute reading to propose deleting S1 ("it can only false-pass"). The expect's own message three lines down (:295) already scopes the limit correctly ("a same-second re-mint is byte-identical"); the comment's summary must agree, or the label keeps teaching the deletion argument. Ladder prefix because this is the class previous rounds already returned (factory/decisions.md:661) — it has now landed inside the artifact written to hold labels honest.

### Non-blocking findings

1. **FALSE CLAIM (report-only, not code)** — `slice-8c.md` §8: "Should S1 be deleted (it can only false-pass)" — false as a universal; S1 correct-fails on cross-second re-mints (see blocking finding). Not hand-fixed: the report is persisted verbatim by lane convention (D-011/D-021); the correction is recorded here for the orchestrator's decision on (b).
2. **UNDER-DECLARED BOUNDARY — the product consequence is (slightly) UNDER-sold, not over-sold.** Report §7 #3 says the fresh photo "stays invisible for the rest of the mount" — true, and the blast is bounded by MORE than the mount: the same-second re-mint returns the same token, and the token is the CDN cache key (this file's own round-3 measurement: same-path read served stale `cf-cache-status: HIT` with `max-age=3600`, fresh token = fresh bytes, test comment at :715-726 (07c683e)). Any fetch of that URL — including a forced reload — serves the old bytes up to the edge TTL. The user-frame description remains right; severity unchanged (the trigger is still the same-second window).
3. **M1's message shorthand** — :281 (07c683e) says the memo is "keyed on the id set"; the R1 key is `${id}:${photo marker}:${photoGen}` (`src/pages/OnboardingPage.tsx:470-474` at 07c683e). The keystroke claim it carries is still true (a keystroke changes none of the three). Declared by the builder (report §7 #2); left per the do-not-expand rule. Fine.
4. **Residual assumptions on the mechanism (not claims)**: the wait (:667, 07c683e) depends on (i) whole-second `iat` — measured, 825/825 same-second pairs byte-identical (report §2), independently checkable via the comment's own decode instruction at :289 — and (ii) a monotone storage-server clock over ~2 s (assumed; unmeasurable from here). If the storage API's token shape ever changes, the comment's granularity fact needs re-measuring; the hedge keeps it honest.

No WRONG NUMBER found; no MECHANISM defect found; nothing stopped being watched (below).

## Answers to the four questions

### 1. Is the rule actually satisfied, or merely described?

Satisfied, for both relabelled assertions, with the one comment defect above.

- **S1 (:294-296, 07c683e)** — can it fail for the reason its message names? Yes. The claim is "the settled signed URL stays put across keystrokes — corroboration of the mint-count". A src change without a re-mint is unreachable in current code (the hook's URLs change only via a mint: `src/components/useKidPhotoUrls.ts:78-80`, fed from `OnboardingPage.tsx:482`; `mintKey` is keystroke-stable, :470-474), and a same-second re-mint leaves the src byte-identical — **the mask is declared in the message**. A cross-second re-mint ⇒ token differs ⇒ the assertion fails exactly as a no-swap violation. It names the visible claim, attributes the evidence to the count, states its mask: no silent implication. Only :292's scope word is off.
- **S2 (:702-704, with the wait at :667, 07c683e)** — after the wait, the assertion fails iff the src did not swap; a fresh mint implies a ≥1.0 s-later token ⇒ different bytes ⇒ the swap IS observable; so the only remaining failure reason is "no fresh mint" — the named one. The label is honest: the count (:693-698) is the proof; the src is corroborating evidence that the user-visible swap happened.

### 2. Does the 1100 ms wait reproduce the observation, or just move the flake?

**It reproduces — the geometry is phase-independent.** The token's only time fields are whole-second values (payload `{url, scope, iat, exp}`; measured, report §2). Any two sign calls ≥1000 ms apart in server-processing time necessarily mint in different seconds (`t_B ≥ t_A + 1 ⇒ floor(t_B) > floor(t_A)`), so crossing the boundary does not depend on WHERE the first mint fell inside its second — precisely the phase dependence the measured 1057 ms gap (57 ms of margin) exposed. The wait (1100 ms) plus the reads/click after it make the A→B gap exceed the threshold in every run; it adds ~1.1 s runtime and **no new flake mode**. Residuals: non-blocking #4. The comment's own inference — "the assertion fails only for the reason it names (no fresh mint), never for a clock boundary" (:665-666, 07c683e) — is supported by this geometry.

### 3. Is reporting-not-building the right call, and is the consequence description accurate?

**Right call, twice over:**
- The brief forbids a second subject ("Do not expand it… this batch has twice paid for a hygiene slice that grew"). A `cacheNonce` change is a product change with global cost: a nonce per mint makes every signed URL unique, defeating CDN/browser caching of every photo render for all users (including /profile remounts) to close a window humans cannot reach. It deserves its own slice, its own measurements, and a same-second e2e proof.
- Severity supports latency: the window needs the re-pick's MINT in the same server second as the previous mint; the human path (pick → crop dialog → confirm → upload → mint) measures well over a second — reachable by scripts, not plausibly by hand. "Latent window, not a live regression" (report §7 #3) is fair.

**The description is accurate — verified in code, not from the report**: (1) re-pick bumps `photoGen` (`src/pages/OnboardingPage.tsx:756-758`, 07c683e); (2) `persistedKidKey` carries it → the memo re-identities (:470-481); (3) `useKidPhotoUrls`'s effect re-runs on the passed array's identity (deps `[ownerProfileId, mintKey, photoKidIds]`, `src/components/useKidPhotoUrls.ts:94`) → a re-mint fires; (4) the mint passes no options — `src/lib/db.ts:2857` (and :2794) `.createSignedUrls(paths, FAMILY_PHOTO_URL_TTL_SECONDS)` — while the installed client supports it (`@supabase/storage-js` 2.115.0, `node_modules/@supabase/storage-js/dist/index.cjs:1006/1064`, "cacheNonce … invalidate the cache"): the proposed fix exists and is unused, exactly as reported; (5) same-second ⇒ identical payload ⇒ identical token ⇒ identical URL string ⇒ `setResolved` stores equal strings (`useKidPhotoUrls.ts:80`) ⇒ React leaves the `src` attribute (plain `src={photoUrl}`, `OnboardingPage.tsx:161-169`, no key, no suffix) ⇒ no re-fetch ⇒ the old decoded image stays — and per the round-3 measurement the token IS the CDN cache key, so even a forced reload serves old bytes (non-blocking #2).

If the fix is ever briefed: the surgical shape is a **generation-keyed nonce** (the URL changes only when `photoGen` bumps; caching within a generation is preserved) — not a global random nonce per mint.

### 4. The builder's two open questions — my recommendations

**(a) `cacheNonce`, or leave latent? — LEAVE LATENT.** (i) The trigger is not human-reachable (measured crop/confirm flows exceed one second; nor can two consecutive re-picks complete a mint within the previous mint's second); (ii) the naive fix is a regression for all users (every mint = a new URL = cold fetch; the batch's own round-3 work exists because per-path caching was the enemy — a nonce weaponizes that shape against every repeat view); (iii) the surgical shape (generation-keyed nonce) is a mint-contract change needing its own slice and a same-second e2e proof. Insurance now = pin the knowledge: the report is committed verbatim (`f53ab7e`); one ledger/plan line pointing at `src/lib/db.ts:2857` + the window is enough that a later "simplify the re-pick keying" change cannot walk into it unknowingly.

**(b) Delete S1 or keep it labelled? — KEEP. The orchestrator's read is correct, and I confirm it on two independent legs:**
1. **Non-vacuity: S1 correct-fails on cross-second re-mints.** A re-mint crossing a second boundary produces a different token, `.toBe(srcAfterAdd)` fails, and the failure names exactly the user-visible symptom F3 exists for (the settled src swapped — the pre-fix measured behavior at :248-256, 07c683e). The builder's measured mask case (all six re-mints in one second, §4) is the OTHER half of the same mechanism: masking applies to same-second bursts only. S1 is weak, not dead — masked half the time, armed the other half.
2. **Detection power is NOT redundant: M1 watches the network, S1 watches the DOM.** If the render ever re-derives the URL without a sign call (a caching change, a shared-URL path), M1 can pass while the visible src swaps — S1 is the only assertion pinning the user-visible no-swap invariant. Deleting it removes the DOM leg of F3 — coverage loss, which the relabelling was specifically NOT allowed to cause.

The brief asked for the label ("say so in the message"); the label is delivered. The only repair is :292's scope word — which turns the comment into the correct argument FOR keeping S1 (its cross-second arm) instead of an argument for deleting it.

## Standing hunt (D-025, D-030) + coverage preservation

- **D-025 (a stated capability/limit the mechanism does not have): one instance** — the blocking finding (:292, 07c683e, ladder-prefixed; class previously returned, factory/decisions.md:661) and its downstream repetition in the builder's report §8 (non-blocking #1). None in the load-bearing text: both expect messages state their limits scoped and true.
- **D-030 (a set that stopped being watched): none.** Hunk-level check at `07c683e`: the diff replaces two expect messages one-for-one, adds one comment block and one wait — `toBe(srcAfterAdd)` (:296), `not.toBe(srcBefore)` (:704), both count assertions (:278-282 and :693-698), both request listeners (:257-260 and :668-671), and the shape assertion sets (:234-238, :630, :694) survive byte-identical. **No coverage was lost in the relabelling.** The one thing not watched — the same-second PRODUCT window — was NEVER watched (no assertion ever covered the visible-swap property at that boundary) and is now DECLARED unwatched in S2's label: deliberate, and adjudicated acceptable under (a).
- **Sweep boundary confirmed:** the file's only two src COMPARISONS are the two the builder enumerated (S1 :294-296, S2 :702-704); the remaining src assertions are shape assertions; `e2e/name-card-photo.e2e.ts` carries none (grep confirms, 07c683e). (`e2e/family-photo-gallery.e2e.ts:275` at 07c683e carries a src-equality SHAPE, but it asserts the lightbox shows the grid's SAME URL — a same-page consistency claim, not an anti-mint claim; outside 8c's file; no relabel needed.)
- **Honesty of the report vs the diff:** every checkable claim traced — +18/−3 and three hunks; the pre-fix observation comment untouched (:248-264, outside all hunks); 1057 ms / 57 ms internally consistent; verify's 71 files / 2063 tests and the run lists internally consistent (6 tests = this file's 5 + the 1 setup test; the two runs show distinct cleanup ids, i.e. two independent runs; the 800 ms F3 settle window remains untouched, as declared). The one thing I could not re-measure from the worktree is the probe itself (deliberately not committed); its mechanism is independently checkable from the code comment's decode instruction, and my independent walk (question 3's chain, the storage-js `cacheNonce` support, the whole-second payload shape) corroborates every claim the diff pins to it.

## Verification-gate note (mine)

I am the reviewer; I did not re-run the suite (role forbids). The builder's run evidence is pasted raw output, not paraphrase, and is internally consistent as above; nothing in it contradicts the diff. Gate evidence for the runs is accepted AS ATTESTED; the independent checks this report adds are the git/diff/grep/node_modules walks.

## Counts (at the sha they were counted at)

- Files changed: **1** — `e2e/onboarding-kid-photo.e2e.ts` (+18/−3) at `07c683e`.
- Assertions relabelled: **2** (S1 :294-296, message only; S2 :702-704, wait + message); assertions deleted: **0**; coverage lost: **0**.
- Blocking findings: **1** (`ladder:` D-025, :292 at `07c683e`). Non-blocking: **4**.
- Flake modes introduced: **0** (the wait is phase-independent; residuals are the whole-second `iat` and monotone-server-clock assumptions, non-blocking #4).

**Recommended next action:** the builder applies the one-word scope fix at `e2e/onboarding-kid-photo.e2e.ts:292` (07c683e) — qualify the re-mint as same-second so the comment matches the mechanism and the message at :295; the orchestrator takes (a) leave-latent + a ledger pin, and (b) KEEP S1. After that one line, this slice is a plain PASS; no further review round needed beyond confirming it.
