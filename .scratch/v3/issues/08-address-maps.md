# 08: Address + tap-to-Maps link

**What to build:** Feedback #9 ("under place maybe there should be a place to put the address… click on it and it takes them to the Google map"). New optional `playdates.address` column (migration 0020); /new gains an optional "Address (optional)" field under place (≤120 chars — orchestrator pin, trim only); the detail page's place line becomes a tappable link when an address is present → `https://www.google.com/maps?q=<URL-encoded "place, address">` (new tab, rel="noopener"). Public surface: `get_public_playdate` extends 11 → 12 fields (adds `address`); 0020 amends the function (DROP FUNCTION + CREATE, same EXECUTE scoping to anon+authenticated + search_path pin + revoke-public; header documents the 11→12 pin change); the live check re-verifies the 12-field payload.

**Blocked by:** Ticket 07 (one-writer).

**Status:** ready-for-agent

- [ ] Migration 0020: `playdates.address text` (nullable) + `get_public_playdate` re-create (12 fields incl. address; same grants/search_path/revoke pattern; header documents the 11→12 change); DO-block idempotency; applied live after code green
- [ ] /new: optional address field (trim, ≤120 chars, inline error when over)
- [ ] Detail page: place line tappable → Google Maps link (new tab) when address present; the public (signed-out) view shows the link too
- [ ] When ticket 03 (ICS) lands: its LOCATION line folds in "place, address" when present (one-line change at that time)
- [ ] One new e2e spec: post with address → detail link renders the correct maps href
- [ ] npm run build && npm run test && npm run test:e2e exit 0

## Comments