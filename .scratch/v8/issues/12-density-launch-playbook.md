# 12: Density — the first-cohort playbook (ops, not code)

**What to build:** Nothing. This ticket is the honest constraint behind every
other one: the app's live database holds a handful of accounts, so the
best-designed feed in the world still shows an empty screen to a new parent.
Features are multipliers on a base of **zero**. This is the deliberate seeding
work that makes tickets 01–11 measurable, and it is human work — no agent can
recruit a parent.

**Blocked by:** Ticket 06 (standing playdates — the thing being seeded) and
ideally ticket 07 (the anchor parks need to exist as places). Cannot start
before both.

**Status:** ready-for-human

- [ ] **Pick 3 anchor parks** with real playgrounds and real parking, in 2–3
      different Seattle neighborhoods, so "nearby" has something to show
- [ ] **Recruit 8–15 parents from group chats you are already in** — the group
      chat is the incumbent, so the pitch is not "use this app", it is "the
      plan and the roster live here now, and you get a reminder"
- [ ] **Create 5–8 weekly series** from the founder account through the app's
      own UI (never SQL — the seeding pass is also the first real usability
      test of ticket 06, and it keeps RLS honest)
- [ ] **One share link per series** posted into the relevant group chat, using
      the existing public signed-out detail view (the one growth surface that
      already works)
- [ ] **Weekly ritual:** each series host posts one nudge in the group chat on
      the day; nobody has to open the app to remember (this is what ticket 08's
      push replaces later)
- [ ] **Measure weekly, in a single file** (`.scratch/v8/density-log.md`):
      series created · pings per series · unique families pinging · share links
      opened signed-out · new accounts created from a share link · how many
      pingers came back the following week
- [ ] **Stop rule:** if after 3 weeks a series has had zero pings twice in a
      row, change the place or the time rather than adding features — the
      lesson is about the meetup, not the app

**Target (the V8 success condition):** ≥3 series each with **≥1 ping in three
consecutive weeks**, without the host re-posting by hand.

**What this ticket is not:** no paid acquisition, no growth hacking, no
invite-token feature, no referral credits. Ten parents who actually show up beat
a thousand installs, and the app cannot yet tell the difference.

**Migration check:** **NONE — ops only.** If this pass surfaces a schema need
(e.g. a place is missing, a timezone is wrong, a series generates a duplicate),
that becomes a new ticket with its own migration number. Do not patch the live
database by hand — SQL-only fixes bypass RLS and the audit trail that every
earlier migration respected.

**Verify:** the numbers in `.scratch/v8/density-log.md` after three weeks, read
against the stop rule above.

## Comments
