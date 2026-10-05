# 03: The place filters say what they filter

**What to build:** On the places directory, each of the three filter triggers
carries a visible caption — **Setting**, **Distance**, **When** — and a value
short enough that it never truncates on a phone. The bottom sheets, their
options, and their testids are otherwise unchanged.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Source:** annotation 4 in `source-annotations.json` — "Any SETT…", "within three…".

- [ ] One pure labels function returns a caption and a shortened value for every
      filter state; unit tests pin the exact strings for every radius option and
      every date option, so the copy is readable in one place.
- [ ] At 390px wide, none of the three triggers truncates, and all three captions
      are visible without opening a sheet.
- [ ] Each trigger's accessible name includes its caption, not only its value.
- [ ] The sheet titles, option labels and testids are unchanged.
- [ ] The filter spec asserts the captions and the absence of truncation; the
      mobile audit is re-run for the places route and exits 0.
- [ ] `npm run verify` exits 0.
