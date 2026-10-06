# Store listing + Play forms — Drop In (drafted 2026-10-06)

> ⚠️ **ONE ASSUMPTION IS UNCONFIRMED AND THE COPY DEPENDS ON IT.** This is drafted
> under the **recommended posture: NOT child-directed, target audience adults**,
> because the account holder is a parent, **kids have no accounts or logins**, and
> there is no child-facing content. If the founder decides otherwise, items 4 and
> 5 below change and the copy's "who it's for" paragraph changes with it.
>
> **EVERY CLAIM HERE IS TRACEABLE TO THE SHIPPED PRIVACY POLICY** (`src/lib/legal.ts`,
> live at `https://drop-in-mu.vercel.app/privacy`, effective 2026-10-05). A listing
> that promises something the policy does not is a review risk, so nothing here is
> invented — each block names the policy line it rests on.

---

## 1. Short description (Play limit: 80 characters)

    Playdates with families near you — post a time and place and show up.

**69 characters** (measured, limit 80). Concrete, says the interaction, no category words ("social
network") that invite the wrong review questions.

## 2. Full description (Play limit: 4,000 characters)

    Drop In makes it easy to arrange playdates with other families near you.

    Post a time and a place — a park, a playground, a community center — and
    nearby parents see it. If they're free, they tap "I'm going". That's the
    whole idea: no group chats to scroll, no scheduling back and forth.

    HOW IT WORKS
    1. Post a drop-in: pick a place and a time, say which of your kids you're
       bringing.
    2. Nearby families see it. You choose your own radius, in miles or
       kilometers, around your ZIP code.
    3. Anyone who's in taps "I'm going", and everyone can see who's coming.

    Find places to go: browse a directory of parks, playgrounds and community
    centers near you, with photos, on a map or a list.

    Keep in touch: comment on a drop-in, or message another parent directly.
    Turn on notifications and you'll hear when someone joins your drop-in or
    when a new one appears near you.

    BUILT TO BE QUIET ABOUT YOUR FAMILY
    • Kids are identified by first name and age only. There are no public kid
      profiles.
    • Nothing is visible to anyone who is not signed in — not the feed, not a
      profile, not a place.
    • We do not sell your data, we do not run ads, and we do not use
      third-party analytics.
    • We do not track your GPS. The app uses the ZIP code and the radius you
      choose, never your device's location.
    • Your email address and your kids' photos are visible only to you.
    • You can ask us to delete your account and its data at any time.

    WHO IT'S FOR
    Parents and caregivers arranging playdates for their kids. You need an
    account to see anything, and you must be an adult to create one — Drop In is
    not directed at children, and children do not have accounts.

    Read the full privacy policy at
    https://drop-in-mu.vercel.app/privacy

**1,722 characters** (measured, limit 4,000), which leaves room to name a city or a
launch region later without a rewrite.

## 3. Ads declaration (5.2)

**No ads.** Supported by the policy: "we do not run ads". There is no ad SDK in
the app and no dependency that serves ads.

## 4. Target audience and content (5.3) — *depends on the posture*

| Play's question | Answer | Why |
|---|---|---|
| Target age groups | **Adults only** (do NOT select any under-13 bracket) | The account holder is a parent; children have no accounts (§"WHO IT'S FOR") |
| Designed for Families | **No** | Not child-directed; no child-facing surface |
| Appeals to children? | **No** | The subject matter involves kids, but there is no child-facing content, game, or character |
| User interaction | **Yes** — parents can comment and message each other | Declared honestly; the app has reports and blocking |
| Shares precise location | **No location sharing of the user's device** — a drop-in names a *public place* the host chose | Policy: "We do not track your GPS… That is an area, not a position" |

⚠️ The one judgement call to make with the form open: Play asks whether the app
"appeals to children". A listing whose screenshots feature children's faces could
invite a reviewer to answer yes. **Screenshots should show the interface, places,
and drop-in cards — not children's photos.**

## 5. Data safety (5.1)

Every row below is what the policy already states. Play's form asks, per data
type: collected? shared? optional? purpose?

| Play data type | Collected | Shared | Optional | Purpose | Policy line it rests on |
|---|---|---|---|---|---|
| Name (display name) | Yes | No | No | App functionality | "Profile: the display name you choose" |
| Email address | Yes | No | No | Account management | "Account: your email address" |
| Photos | Yes | No | Yes | App functionality | "an optional profile photo, and an optional family photo"; "Your kids: … an optional photo" |
| Approximate location | Yes | No | No | App functionality | "your home ZIP code and the search radius you pick" |
| Messages / other in-app messages | Yes | No | Yes | App functionality | "Messages: the messages you send to other parents" |
| App activity (drop-ins hosted/joined) | Yes | No | — | App functionality | "Your drop-ins: the title, the place…" |
| Device or other IDs (push endpoint) | Yes | No | Yes | App functionality | "your browser gives us a push subscription address for that device" |

**Answers to the form's global questions:**

- **Is any data shared with third parties? → No.** The four processors named in
  the policy (Supabase, Vercel, Resend, Google) act **on our behalf**; Play's own
  definition excludes service providers from "sharing". ⚠️ **Read that definition
  on the form before answering** — it is the single most misread question here.
- **Is data encrypted in transit? → Yes.** The app is served over HTTPS and talks
  to Supabase over TLS.
- **Can users request deletion? → Yes**, by emailing the contact address; the
  policy states it ("You can ask us to delete your account and its data at any
  time") and the app's Settings shows the same route.
  ⚠️ **Play requires the deletion path to be discoverable** — the policy and the
  listing must both name it, which is why the description above does not promise
  an in-app delete button the app does not have.
- **Data sold? → No.** Policy: "We do not sell or rent personal data."
- **Analytics? → None.** Policy: "we do not use third-party analytics."

## 6. Content rating questionnaire (4.6) — expected answers

- Violence, sexuality, language, controlled substances, gambling: **No.**
- **User-generated content / user interaction: YES** — comments and direct
  messages exist. Expect the rating to reflect that; it is not a defect.
- **Shares location: NO** for the user's device; the app shows a place the host
  chose. Answer carefully if the form asks about "location sharing" generally.
- Digital purchases: **No.**

## 7. What still needs the founder, and nothing else

1. **The posture sentence** — confirm NOT child-directed + adults, and items 4–6
   are final.
2. **The store contact email** (4.6) — the app's legal contact is
   `jonmeisburg@gmail.com`; Play wants a public listing contact, which may be the
   same.
3. **Screenshots (4.3)** — need seeded content and a phone; the framing rule is in
   item 4 above.
4. ~~Feature graphic (4.2)~~ — **BUILT 2026-10-06.** See the checklist's 4.2: it
   is composed from the app's own mark, its own font (embedded as a data URL after
   a `file://` load was found to be silently falling back), and its own tagline, at
   exactly 1024×500 with no alpha, and it is verified structurally. ⚠️ Still worth a
   human's single glance — the checks prove it is complete and correctly placed,
   not that it is good.
