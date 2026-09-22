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
