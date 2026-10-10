/**
 * DEV-ONLY DISCOVERY MOCK (V38 slice A, `W4J7`).
 *
 * ⚠️ THIS FILE IS A PROTOTYPE, NOT A FEATURE. IT STORES NOTHING, QUERIES NOTHING,
 * AND EXPOSES NOTHING. Every string below is a hardcoded fixture. There is no
 * supabase client, no `lib/db` import, no fetch, no router state, no props, no
 * table, no column, no RPC and no migration behind any of it.
 *
 * WHY IT EXISTS. `docs/adr/0007` §7 precondition 5:
 *
 *   *"Option 1's match surface should be prototyped and shown to real parents
 *   WITHOUT A DATABASE BEHIND IT — the question is whether a match is enough to
 *   start a conversation, and that is a question screenshots can answer for free."*
 *
 * That is the whole job: put the recommended match surface in front of a parent
 * and find out whether it is enough. A mock answers that; a schema cannot.
 *
 * ⚠️ AND WHY IT DOES NOT VIOLATE THE ADR'S PRECONDITION 1 (a child-safety review
 * before a line of code). That precondition governs the FEATURE. This is the
 * artifact the review is supposed to look at, and it is deliberately built so it
 * cannot become the feature by accident:
 *   - no real family, place, user or child data is read — not one read exists;
 *   - nothing the mock renders is derived from the database;
 *   - the "Ask to connect" control is a dead button on purpose;
 *   - a dev build is the only build it appears in (see the App.tsx gate).
 *
 * HOW IT IS GATED. `App.tsx` mounts it through the SAME `import.meta.env.DEV`
 * ternary + null check that gates `AgentationDev`: Vite replaces the expression
 * with `false` in a production build, so this module and its chunk are eliminated
 * and `dist/` cannot contain these fixture strings. That is VERIFIED by grepping
 * the built bundle for a fixture name (see the V38-A report), not assumed.
 *
 * ⚠️ IT RENDERS EXACTLY THE FIVE FIELDS OF ADR 0007 §3, AND NO OTHERS. That list
 * is CLOSED — adding a sixth thing here would be inventing exposure the ADR has
 * not decided. The band labels are the ADR's own, character for character:
 *
 *   Babies & toddlers (0–2)   Preschool (3–5)   School age (6–9)   Older kids (10+)
 *
 * and the multi-child case renders the ADR's wide span
 * (*"Babies & toddlers through school age"*), which is the case the banding
 * scheme exists for.
 */

/**
 * One fixture family. ⚠️ `bandLabel` is written out as a LITERAL, not computed
 * from the ages — because a mock that computes a band would be the first half of
 * the feature, and this file must not contain the feature's logic. The ages appear
 * only in a comment, as the fixture's justification.
 */
interface MockFamily {
  displayName: string
  /** ADR 0007 §3 field 2 — the broad band's label, verbatim from the ADR. */
  bandLabel: string
  /** ADR 0007 §3 field 3 — a neighborhood name or zip. NEVER coordinates. */
  area: string
  /** ADR 0007 §3 field 4 — optional; `null` renders NOTHING (never a placeholder). */
  into: string | null
  /** The fixture's own reason for existing, shown to the reviewer only. */
  fixtureNote: string
}

/**
 * TWO fixtures, so a parent can compare side by side.
 *
 * The SECOND deliberately exercises the two cases the ADR singles out: the
 * multi-child WIDE SPAN (the case the banding scheme exists for) and the EMPTY
 * free-text line (which must render nothing at all).
 */
const MOCK_FAMILIES: readonly MockFamily[] = [
  {
    // Single child → a single band.
    displayName: 'Priya Raman',
    bandLabel: 'Preschool (3–5)',
    area: 'Ballard',
    into: 'Toddler + a stroller, we’re at the wading pool most mornings.',
    fixtureNote: 'single child → single band · free-text line present',
  },
  {
    // Two children → the WIDE SPAN, not two facts.
    displayName: 'Dana Whitfield',
    bandLabel: 'Babies & toddlers through school age',
    area: '98107',
    into: null,
    fixtureNote: 'multi-child → wide span · free-text line EMPTY (renders nothing)',
  },
]

/**
 * ADR 0007 §2 — the consent card. This is the list a parent confirms BEFORE
 * switching discovery on, and the switch is OFF here to show that default.
 *
 * The rows are the ADR's §3 table, in its own words and order.
 */
const CONSENT_FIELDS: ReadonlyArray<{ field: string; why: string }> = [
  { field: 'Display name', why: 'So another parent can address you.' },
  { field: 'Broad child age band', why: 'Answers “do our kids overlap?” without saying who they are.' },
  { field: 'Approximate area', why: 'A neighborhood or zip — never a street, never coordinates.' },
  { field: 'A one-line “what we’re into”', why: 'Optional. Empty shows nothing at all.' },
  { field: 'An “ask to connect” button', why: 'A request the other parent may ignore. No contact details.' },
]

export default function DiscoveryMock() {
  return (
    <div className="min-h-dvh bg-slate-100 pb-16">
      {/* ⚠️ A permanent banner, so nobody — the founder included — mistakes this
          for a shipped screen. It is the second half of "the bundle cannot
          contain this": the running app cannot be mistaken for the real thing. */}
      <div className="bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-amber-950">
        DEV MOCK · fixture data · not a real family · not in production
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Nearby families
          </h1>
          <p className="text-sm text-slate-600">
            ADR 0007 Option 1 — one match at a time, not a directory.
          </p>
        </header>

        {/* ── THE CONSENT CARD (ADR 0007 §2), switch OFF ──────────────────────
            Shown FIRST, above the matches, because that is the order a real
            parent would meet it: you see exactly what would be shown about you
            before anything of yours is shown. */}
        <section
          data-testid="discovery-mock-consent"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold text-slate-900">
            Let nearby families find us
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Off by default. Nothing about your family is findable unless you turn this on,
            and turning it off removes you on the next load.
          </p>

          {/* The switch itself — a DEAD control. It is wired to nothing: no state,
              no handler, no write. It exists so the state reads as OFF. */}
          <div className="mt-3 flex items-center gap-3">
            <span
              data-testid="discovery-mock-switch"
              aria-hidden="true"
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-300"
            >
              <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow" />
            </span>
            <span className="text-sm font-medium text-slate-700">Off</span>
          </div>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            If you turn it on, another parent sees exactly this
          </p>
          <ul data-testid="discovery-mock-consent-fields" className="mt-2 flex list-none flex-col gap-2 p-0">
            {CONSENT_FIELDS.map((row) => (
              <li key={row.field} className="text-sm">
                <span className="font-medium text-slate-800">{row.field}</span>
                <span className="text-slate-500"> — {row.why}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── THE MATCHES (ADR 0007 §3, the five fields) ───────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-900">A match</h2>
          {MOCK_FAMILIES.map((family) => (
            <article
              key={family.displayName}
              data-testid="discovery-mock-match"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              {/* (a) Display name — §3 field 1. */}
              <p className="text-base font-semibold text-slate-900">{family.displayName}</p>

              {/* (b) Broad child age band — §3 field 2, the ADR's own label. */}
              <p data-testid="discovery-mock-band" className="mt-1 text-sm text-slate-700">
                {family.bandLabel}
              </p>

              {/* (c) Approximate area — §3 field 3. A neighborhood or a zip. */}
              <p data-testid="discovery-mock-area" className="text-sm text-slate-500">
                {family.area}
              </p>

              {/* (d) The optional one-liner — §3 field 4. ⚠️ `null` renders
                  NOTHING: no placeholder, no dash, no empty line. That is half
                  of what this mock is here to show. */}
              {family.into !== null ? (
                <p data-testid="discovery-mock-into" className="mt-2 text-sm text-slate-700">
                  {family.into}
                </p>
              ) : null}

              {/* (e) The contact affordance — §3 field 5. ⚠️ A DEAD BUTTON: no
                  handler, no state, no request. It is here so the question
                  ("is a match enough to start a conversation?") has its control
                  on screen. */}
              <button
                type="button"
                data-testid="discovery-mock-connect"
                className="mt-3 flex min-h-11 items-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
              >
                Ask to connect
              </button>

              {/* Reviewer-only: which fixture case this card demonstrates. Not a
                  §3 field, and marked as such so it cannot be mistaken for one. */}
              <p className="mt-2 text-xs italic text-slate-400">
                fixture: {family.fixtureNote}
              </p>
            </article>
          ))}
        </section>

        {/* What is deliberately absent — the ADR's §4, on screen, so a reviewer
            looking at this mock knows what it is NOT showing them. */}
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Not shown, on purpose</h2>
          <p className="mt-1">
            No exact ages or birthdays. No child’s name. No child’s photo. No count of
            children. No street address or coordinates. No contact details. No directory to
            browse, and no search box.
          </p>
        </section>
      </div>
    </div>
  )
}
