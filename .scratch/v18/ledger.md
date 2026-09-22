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
