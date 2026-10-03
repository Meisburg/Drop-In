# Store-readiness audit — Drop In

> Run **2026-10-03** against `/home/jmeisburg/Projects/playdate-app` at `master` =
> `758ec8f` (== `origin/master`), production `https://drop-in-mu.vercel.app`.
> Evidence is the live database (via `scripts/db-sql.sh`), the live Supabase auth
> config (via the Management API), the repo at HEAD, and the two handoff docs that
> already existed. **Nothing below is from memory or assumption.**

## The headline, before anything else

**Drop In cannot be uploaded to the Play Store today — and not for the reason you
are expecting.**

It is not a missing feature, a missing icon, or a missing legal page. The repo is
in unusually good shape for this stage. The blocker is **architectural**: Drop In
is a *web app* (a PWA), and Google Play does not accept web apps. It accepts
Android app packages (`.aab`). Getting Drop In onto the Play Store means **wrapping
it in a native shell** — a real, multi-slice engineering project that has been
planned and deliberately parked, not started.

**Your instinct that "it's getting close" is correct — for the beta. It is not
correct for the Play Store.** Those are two different finish lines with different
work, and this audit separates them.

---

## Part 1 — The two finish lines

| | **Beta** (invite real parents via a link) | **Play Store** (download from Google) |
|---|---|---|
| What ships | The web app at a URL | A wrapped native app (`.aab`) |
| Code work left | **None known** | **A whole project** (shell + native push + deep links) |
| Your work left | Days | Weeks, plus enrollment lead time |
| Blockers today | Test data in prod; empty feed | No `.aab`, no shell, no Play account |

**Recommendation: ship the beta first, and let the beta be what tells you whether
the Play Store is worth it.** You are close to the beta. You are not close to the
store. Doing them in that order is strictly cheaper, because the beta generates
the evidence that makes the store submission's hard decisions (see Part 4).

---

## Part 2 — What is already done (do not redo these)

This surprised me, and it is the reason the store path is shorter than it looks.

| Requirement | Status | Evidence |
|---|---|---|
| **Account deletion in-app** | ✅ **Done** | `0058_delete_my_account.sql` — a `security definer` function callable by the parent; cascades from `auth.users`. Play requires this. |
| **Report / block / moderation** | ✅ **Done** | `reports` table (0008), `blocks` (0006), `ModPage.tsx` at `/mod` with hide + ban. |
| **Real transactional email** | ✅ **Done** | Live config: `smtp_host = smtp.gmail.com`, `rate_limit_email_sent = 30` (was 2). |
| **Canonical site URL + redirects** | ✅ **Done** | `site_url = https://drop-in-mu.vercel.app`; allow-list carries the deployed origin. |
| **Google sign-in** | ✅ **Done** | `external_google_enabled = true`. |
| **PWA manifest + icons + maskable** | ✅ **Done** | `dist/manifest.webmanifest`: 192, 512, maskable-512, `display: standalone`. |
| **Service worker + offline shell** | ✅ **Done** | `injectManifest` + hand-written `src/sw.ts`; `scripts/verify-pwa.mjs` proves a cold offline reload. |
| **iOS splash screens** | ✅ **Done** | `public/splash/` — 8 device images. |
| **Test-marker sweep tooling** | ✅ **Done, and it works** | `scripts/sweep-e2e-markers.mjs`; just ran `select`, found 709 rows (see Part 3). |
| **A test-data safety gate** | ✅ **Done** | Sweep refuses to delete if a founder account is inside the marker set (`founder_overlap: 0`). |

**A native-app project plan already exists and is parked on purpose:**
`docs/handoff-native-apps.md` + `.scratch/native-apps/plan.md`. It records the
decision (**Capacitor, not a React Native rewrite**), four specific code hazards
with line numbers, and a "what will have rotted" table to re-verify first. **Read
those two before starting anything native.** This audit does not replace them; it
tells you where they sit in the sequence.

---

## Part 3 — What is actually left, split by finish line

### A. Beta blockers — do these now

**A1. Sweep the test data out of production. (1 hour, and it is 1 command + 1 verify)**

Measured live just now:

```
e2e_users 352 / all_users 405     founder_overlap: 0
profiles 352 · auth.users 352 · kids 4 · playdates 1     TOTAL 709
```

Two things this means:

1. **A real parent browsing today can find test accounts and a drop-in at
   "1234 E2E Ave NE."** The only *future-dated* drop-in in the entire database is
   that marker. That is the worst possible first impression, and it is the state
   right now.
2. `founder_overlap: 0` — **the safety gate is clear, so the delete is safe to
   run.** The tool refuses if a founder account is inside the marker set, and none
   is.

```bash
node scripts/sweep-e2e-markers.mjs select    # done — numbers above
node scripts/sweep-e2e-markers.mjs delete    # prints rows removed, then re-reads
node scripts/sweep-e2e-markers.mjs verify    # exits non-zero if ANY marker remains
```

**Treat a non-zero exit from `delete` or `verify` as release-blocking.** This
regressed once already (V28 swept 1287 rows to zero; runs kept writing to prod).

**A2. Stop e2e writing to production, or this comes straight back.** (decision + ~2 hours)

Every `npx playwright test` run writes to the **live** database. That is why 352
markers exist. Two options:

- **Accept it and sweep before each invite** — free, but relies on discipline, and
  it already failed once.
- **Point e2e at a scratch Supabase project** — real fix, needs a second project
  and a config branch. **Recommended before you invite anyone you don't know.**

**A3. Seed 10–15 real drop-ins in Seattle.** (1–2 hours, in the app, by hand)

Production has **22 drop-ins, all in the past**, 18 of them yours. A first parent
lands on an empty feed. V28's recorded decision was that seeding is done **by
hand, in the app, by you** — that is what makes the cold start work.

**A4. Nobody has walked "quit mid-onboarding and come back" on a phone.** (10 min)

V28's own summary calls this *"the batch's main open verification."* Two tests
cover it and both are non-vacuous, but the one human who walked the flow went
straight through. Tests are not a substitute for a stateful cross-session
behavior.

**A5. Confirm the Google SMTP sender can actually deliver.** (30 min, needs a real inbox)

`smtp_host = smtp.gmail.com`, `smtp_user = jonmeisburg@gmail.com`. This works, and
it is fine for a friends beta — but mail sent from a Gmail address through a
third-party app is **unauthenticated for your domain** and lands in spam more
often than not. Before you invite people who will judge the app by whether the
email arrives, either:
- test it into a **non-Gmail** inbox (Outlook/iCloud — the ones most likely to
  spam-fold), or
- move to a real sender on a domain you own.

**A6. Legal pages do not exist.** (2 hours, or ~30 min with a generator)

`grep` for "privacy policy" / "terms of service" across `src/` and `index.html`
returns **zero hits.** `PrivacySection.tsx` states the privacy model *in prose
inside Settings*, which is genuinely good and unusually thoughtful — but it is not
a **Privacy Policy document**, and it is not reachable by URL.

You need, at minimum, a hosted Privacy Policy and Terms page. **Play requires a
privacy policy URL**; so does the App Store; and for an app holding **children's
first names and ages**, this is not a formality.

**A7. Decide the age-rating and child-data posture.** (a decision, then paperwork)

This is the one item on this list that is **not** a checklist item — it is a real
product/legal question, and it is the biggest risk in the whole audit.

Drop In stores **children's first names and ages** (23 `kids` rows today; the
first-name-and-age model is a deliberate privacy choice). Both stores have
specific regimes for apps directed at children or handling their data:

- **Google Play: Families policy.** If the app targets children, the rules on ads,
  data collection, and content are much stricter — and a "Designed for Families"
  designation changes what you may collect.
- **Apple: Kids Category** rules, if you ever enter it. You likely should *not*.

The honest framing: **Drop In is a parents' app that stores data about kids.** That
is probably *not* a children's app under either store's definition — the user is
the parent. But "probably" is exactly the word that turns into a rejected
submission, and the answer changes what you collect and how you describe it.
**Get this decided before you write the store listing**, because the listing text
is where you commit to a position.

### B. Play Store blockers — after the beta

**B1. There is no Android app. This is the whole blocker.**

No `bubblewrap`/TWA config, no Capacitor project, no `android/` directory. What
exists is a plan to build one.

The route, per `docs/handoff-native-apps.md`: **Capacitor wraps the existing app**
— *not* a React Native rewrite, because that would discard 1,953 unit tests and a
161-spec e2e suite for no user-visible gain. The plan's own reasoning is sound and
I would not relitigate it.

**Scope, honestly: this is a multi-slice project, not an afternoon.** It needs a
native shell, native push as a *third transport inside the existing `send-push`
drain* (never a second Edge Function — two functions draining one queue race each
other), deep links, and a new `device_tokens` table.

**B2. Four code sites assume a browser origin and will break in a shell.**

Already found and written down with line numbers — do not rediscover these during
submission:

| Where | What breaks |
|---|---|
| `src/lib/db.ts:317` | OAuth `redirectTo` — a shell's origin isn't a real URL |
| `src/lib/db.ts:1352` | Password-reset `redirectTo` — a parent cannot reset a password |
| `src/lib/db.ts:1339` | `buildShareUrl` — generates links pointing at the shell |
| `src/lib/email.ts:40` | Base-URL fallback — same class |

**Fix these as the first slice of the native work.** Each needs a *decision* about
"what is the canonical public URL inside the app," which is why it isn't a
mechanical fix.

**B3. Google Play Console account — $25, one time. Plus the tester requirement.**

⚠️ **Verify this yourself before planning around it** — my web search was
unavailable during this audit (the search endpoint returned `HTTP 402 Insufficient
Balance`), so I could not confirm Google's *current* policy from primary sources.
As of my knowledge, a **new personal** Play developer account must run a closed
test with a minimum number of testers for a minimum period **before** it can
publish to production. **This is the single most likely thing to add weeks to your
timeline**, and it is pure waiting, not work.

**Action: check this first, before anything else in Part B.** It determines your
real launch date more than any code does. If it applies, you want the clock
started as early as possible.

**B4. Store listing assets.** (a few hours, mostly design)

- Feature graphic (1024×500), screenshots (min 2, phone), short + full description
- App name, category, contact email, **privacy policy URL** (from A6)
- **Data safety form** — must declare kid names/ages, email, location, photos.
  This is a form you fill in the Console, and it must match your policy.
- Content rating questionnaire

**B5. Play review will ask what your app has that the website doesn't.**

This is Apple guideline 4.2's cousin (see Part 4). A thin web wrapper gets
rejected. The plan's mitigation — **bundle `dist/` into the shell** rather than
loading a remote URL — is correct and already decided.

---

## Part 4 — The risks that decide whether this succeeds

Ranked by how much they can hurt you.

1. **⚠️ The cold-start problem is unsolved, and the store makes it worse.**
   You have **zero upcoming real drop-ins.** A parent who downloads your app from
   the Play Store, opens it, and sees an empty feed will uninstall — and a store
   listing amplifies this, because store traffic arrives with no context and no
   patience. **The beta is your only chance to learn this cheaply.** This is why
   A3 (seed by hand) and A7 (the 5-parent test) matter more than any store item.

2. **⚠️ The tester requirement (B3) is a scheduling risk, not a work risk.**
   If it applies, no amount of engineering compresses it. **Check it early.**

3. **⚠️ The child-data posture (A7) can invalidate the listing after you write
   it.** If you describe the app one way and the Data Safety form another, that is
   a rejection or a takedown. Decide before writing.

4. **⚠️ Gmail SMTP (A5) undermines the beta's credibility quietly.** You will not
   see the failures — the parents will, in their spam folder.

5. **Moderate: e2e keeps writing to prod (A2).** Known, has caused one real
   incident already (V28: 21 fixture emails to a real follower).

---

## Part 5 — Recommended sequence

**Do now — beta (roughly 1 day of your time):**
1. A1 sweep the markers — 1 hour, exact command in A1
2. A3 seed 10–15 real drop-ins — 1–2 hours
3. A4 walk resume-on-phone — 10 minutes
4. A5 test email into a non-Gmail inbox — 30 minutes
5. A6 write + host Privacy Policy and Terms — 2 hours
6. A7 decide the child-data posture and the age rating
7. Invite 5–10 parents you know

**In parallel (do not wait on the beta):**
8. **B3 — check Google's tester requirement today.** It is free to look up and it
   may be the longest pole in the whole project.
9. Run the 5-parent first-open test — the kit is written and pre-registered at
   `research/first-open-validation/2026-09-29-parent-test-scoring.md`. Two backlog
   items are **blocked** on its results.

**After the beta, if it justifies it:**
10. A2 point e2e at a scratch project
11. B2 fix the four browser-origin sites
12. B1 build the Capacitor shell, Android-first (testable on this box; iOS needs a
    Mac or macOS CI — see the handoff's §3)
13. B4 store listing + Data Safety
14. Submit

**Do not start early:** Apple Developer enrolment ($99/yr) — the handoff says
start ~2 weeks before submission, because starting earlier burns months of an
annual subscription for nothing.

---

## Part 6 — The one-paragraph answer to your question

**You are close to a beta and not close to the Play Store.** The Play Store needs
an Android app, and you have a web app — so the store path is a real project
(planned, parked, and well-documented in `docs/handoff-native-apps.md`), not a
checklist. Everything the stores ask for *in the app itself* — account deletion,
reporting, blocking, moderation, real email — is **already built**, which is why
this is less work than it sounds. What is genuinely missing is: **test data is in
production right now** (1 command to fix, verified safe), **the feed is empty**
(the real product risk), **there are no legal pages** (2 hours), and **nobody has
decided the child-data posture** (which is the biggest single submission risk).
Ship the beta, run the 5-parent test, check Google's tester requirement today, and
let the beta tell you whether the store is worth the shell.

---

## Method and limits

- Live DB via `scripts/db-sql.sh` (Management API, no browser).
- Live auth config via the Supabase Management API.
- Repo at `master` = `758ec8f`; `git log origin/master..HEAD` empty (all pushed).
- **Limit, stated plainly: `web_search` failed during this audit** (`HTTP 402
  Insufficient Balance` on the search endpoint). Every *current-policy* claim
  about Google Play or the App Store is therefore from prior knowledge and is
  **marked for you to re-verify** (B3, A7 especially). Every *repo and database*
  claim was measured directly and is reliable.
- The 5-parent test's desk research in
  `research/first-open-validation/2026-09-29-parent-test-scoring.md` was run with
  a working Exa integration and carries its own confidence labels — use it for
  product questions rather than this document.
