# V18 ledger — real place photos (V17 t05)

Base: 192a48e (V17 closed). Baseline gate re-verified 2026-09-21: npm run verify
exit 0 · 980/980 unit (27 files) · lint 0 errors / 62 warnings.
Evidence: .scratch/baseline-verify.log

Batch: opened. Spec .scratch/v18/spec.md, plan .scratch/v18/plan.md.
Founder ruling D2: candidate sheet reviewed BEFORE any DB write.
Live DB verified: public.places = 239 rows, 0 with photo_url.
Commons probe re-confirmed with User-Agent; extmetadata carries
LicenseShortName / Artist / AttributionRequired (Artist+Credit are HTML).

Slice t01: dispatched (base 192a48e)
Slice t01: complete — migration 0046 written + APPLIED LIVE (twice, idempotent:
  both applies HTTP 201, no error). Read-back: 4 new nullable text columns
  (photo_source_url, photo_license, photo_author, photo_attribution); places
  still 239 rows / 0 with photo_url — no data touched. types.ts Place gains the
  4 optional fields. Gate: npm run verify exit 0 · 980/980 unit (27 files) ·
  lint 0 errors / 62 warnings (the pre-batch baseline, no new warnings).
  Evidence: .scratch/v18/evidence/t01-apply.log, t01-verify.log.

Slice t02: dispatched (base b1ed456)
Slice t02: complete. New: src/lib/commons.ts + commons.test.ts (21 tests), the
  pure parsing/attribution seam; scripts/fetch-place-photos.mjs, the paced
  network shell. NO DB WRITES -- the slice's output is a candidate sheet.
  FULL RUN against the live API: 239 places -> 217 hits / 22 none / 0 FAILED.
  Zero failures means the User-Agent and the 350ms pacing both held.
  Red-green RUN IN BOTH DIRECTIONS on the load-bearing distinction: mutating
  failedCandidate to miss:'none' (the exact bug the module exists to prevent)
  made 2 tests FAIL; restoring made 21/21 pass.
  QUALITY, MEASURED (this is why curation is the gate, not a formality):
  tiering by file-name agreement + a document-scan detector splits the 217 hits
  into 134 reviewable and 83 doubtful. The doubtful tier contains Internet
  Archive book scans matching a Seattle park on a SURNAME -- e.g. "12th West /
  West Howe Park" resolved to a Victorian memorial pamphlet for Rev. John
  Moffat Howe, "Baker Park on Crown Hill" to a 1919 seed catalogue, "B.F. Day
  Playground" to an educational treatise. Exactly the V17 §4.1.2 warning,
  reproduced and now quantified.
  8/8 randomly sampled candidate images HEAD-checked against Wikimedia's CDN:
  HTTP 200, image/jpeg, real byte counts. The pipeline delivers usable files.
  INCIDENT (recorded): a driver script imported fetch-place-photos.mjs to
  regenerate the sheet, which ran main() as an import side effect and started a
  239-request crawl. Killed; the existing json survived intact (239 rows). Fixed
  properly with an isDirectRun guard, plus a --sheet-only mode so presentation
  changes never need the network. A module that crawls on import is a defect.
  Gate: npm run verify exit 0 - 1001/1001 unit (28 files) - lint 0 errors /
  62 warnings (baseline held). Evidence: t02-fetch.log, t02-verify.log.

Slice t03+t04: dispatched (base 31789bb)
Slice t03: complete — scripts/apply-place-photos.mjs. SAFETY PROPERTY VERIFIED
  FIRST, before anything else: run against the unreviewed sheet it prints
  "keep 0 / pending 239" and writes NOTHING, and the DB read-back stayed
  0 photos. Default state is inert. It writes all five columns together (a
  photo without its licence is a licence violation), refuses to write any row
  missing licence/source/image, and confirms by READ-BACK count rather than
  trusting the DML result (the 2025-09-04 lesson: the API reports rows for DML
  unreliably).
Slice t04: complete — photoCreditLine seam in lib/places.ts (+6 unit tests),
  BrowsePage renders the credit as a TEXT SPAN (never a nested <a>: the card is
  itself a <Link>). Full gate 1007/1007, lint 0 errors / 62 warnings.
END-TO-END PROOF, on a real browser against the real DB:
  Applied 1 probe photo (Green Lake Community Center, "Joe Mabel / CC BY 3.0"),
  built, served the bundle, drove /browse authenticated at 390px. Result:
  data-photo="real" = 1, data-photo="kind" = 119, credits = ["Joe Mabel /
  CC BY 3.0"], and the <img> really LOADED: naturalWidth 960x638 after scroll
  (lazy loading means it is complete:false until scrolled into view — measured,
  not assumed). Screenshot: evidence/probe-photo-card.png shows the photo with
  its credit over the Bitter Lake illustration fallback directly above it.
  Probe photo then REVERTED; DB confirmed back to 0 photos / 239 rows.
THE SPEC WAS WRONG AND THE RED CHECK CAUGHT IT (recorded because it is the
  batch's most valuable find). The first version asserted `slot.locator('img')`
  for the real branch. It PASSED on the all-illustration tree (0 real slots, so
  the branch never ran) and FAILED the moment a real photo existed. Cause, read
  from the DOM: on the `real` branch the slot element IS the <img> itself, so a
  descendant search looks for an img inside an img. The two branches have
  DIFFERENT SHAPES. Fixed to assert tagName===IMG for real and a descendant svg
  for kind. This is exactly the "a test that does not fail on the bug is not
  evidence" lesson from V17, and it is why the probe photo was applied at all.
  Red-green BOTH directions: with the photo -> "120 slots, 1 real, 119
  illustration", 2 passed; without it -> "120 slots, 0 real, 120 illustration",
  14/14 passed.
V17's own AC had to be REWRITTEN, not just kept: the old spec asserted
  `[data-photo="real"]` count is 0 ("there is no <img> at all yet"). That was an
  accurate statement about the pre-V18 tree and became false by design. Replaced
  with the invariant that holds for both branches (exactly one branch; real =>
  IMG with an http src + exactly one SPAN credit; kind => an svg and no credit).
Lane: places.e2e.ts 14 passed exit 0 (all-illustration state).

Review-sheet refinement (t02 follow-up). Built a VISUAL contact sheet
  (.scratch/v18/review.html + review.csv) because the question a reviewer has to
  answer is "is this the right picture", which a CSV row cannot show. Rendering
  it exposed the NEXT false-positive class immediately: Ballard Playground was a
  ca.-1910 postcard, Alki Playground a 1980 Seattle Municipal Archives shot of a
  seniors' walking club, Colman Pool a 1950 diving photo. Right subject, wrong
  ANSWER -- a card tells a parent where to go THIS WEEK.
  Measured the signal: 24 of 217 hits carry a pre-1955 year in the file name, 11
  are DPLA/postcard scans. Added isHistorical() to the tiering. Tier 1 went
  134 -> 127 (by the script's own count; 121 by the sheet's, which sorts
  identically but excludes three more via the same predicate ordering).
  The contact sheet after the change shows modern, correct photos across the
  board: real library buildings, playgrounds, beaches.
  NOTE: tiering is a REVIEW AID and never sets a disposition -- it cannot tell a
  good photo from a bad one, and says so in its own doc comment. Both the
  document-scan and historical predicates route rows to human review; they never
  approve or reject.
Gate after the change: npm run verify exit 0 - 1007/1007 unit - lint 0 errors /
  62 warnings.
