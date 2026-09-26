import { expect, test } from '@playwright/test'
import { readMarkerMeta, readMarkerSession, readSupabaseEnv } from './fixtures'

/**
 * V19 t03/t04 — the PRIVACY POSTURE of `account_links` and `parent_cards`,
 * asserted in the repo rather than only in a ledger.
 *
 * WHY THIS SPEC EXISTS SEPARATELY FROM THE UI TESTS. The `ocr` review lane
 * (low) pointed out that the migration's own header makes strong claims — "a
 * third account reads ZERO rows", "only the owner may write their own cards" —
 * and that the only probe backing them lived in a batch ledger. A claim about
 * security that no test defends will eventually stop being true, because the
 * next policy edit has nothing to fail against. So the claims are asserted
 * here, against the REAL database, with REAL JWTs.
 *
 * WHY IT CREATES ITS OWN ACCOUNTS. There is no ambient data to assert against:
 * the live project holds only the founder's two accounts and no links. Signing
 * up three throwaway accounts is the only way to test "a third party sees
 * nothing", and a third party is exactly what the claim is about.
 *
 * The spec cleans up after itself in a `finally`, so a failure midway does not
 * leave accounts behind. (A hard crash could; the orchestrator's `e2e-` sweep
 * is the net, the same as every other spec here.)
 */
test('a third account cannot read or alter another family’s link (V19 t03)', async () => {
  test.setTimeout(120_000)
  const { url: restUrl, anonKey } = readSupabaseEnv()

  /** Sign up one throwaway parent and return its id + access token. */
  async function signUp(tag: string): Promise<{ id: string; token: string }> {
    /**
     * A UNIQUE STAMP ON **BOTH** THE EMAIL AND THE HANDLE.
     *
     * The first version stamped only the email and used a fixed
     * `e2e-rls-${tag}` display_name — which is UNIQUE in `profiles`
     * (`profiles_display_name_key`, migration 0004). It passed in isolation and
     * failed in the full suite, because an earlier run had left a row behind:
     * the second insert died 23505 on the handle. That is a bug in this spec,
     * not in the product, and the fix is to make the handle unique too. The
     * finally-block cleanup below is the net, not a guarantee — a hard crash can
     * still leave a row, and this spec must survive that.
     */
    const stamp = Date.now()
    const email = `e2e-rls-${tag}-${stamp}@gmail.com`
    const handle = `e2e-rls-${tag}-${stamp}`
    const res = await fetch(`${restUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      // A throwaway password for a disposable account this spec deletes in its
      // own finally block. Not a secret: it authenticates nothing outside this
      // run, and the accounts it belongs to are removed immediately after.
      body: JSON.stringify({ email, password: 'e2e-disposable-account-pw' }),
    })
    if (!res.ok) throw new Error(`signup HTTP ${res.status} ${await res.text()}`)
    const body = (await res.json()) as {
      id?: string
      access_token?: string
      user?: { id?: string }
      session?: { access_token?: string }
    }
    const id = body.id ?? body.user?.id
    const token = body.access_token ?? body.session?.access_token
    if (id === undefined || token === undefined) {
      throw new Error(`signup returned no id/token: ${JSON.stringify(body).slice(0, 200)}`)
    }
    // A profiles row is required for the FK on both new tables.
    const marker = readMarkerSession()
    void marker
    const prof = await fetch(`${restUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ id, display_name: handle, home_zip: '98107', radius_miles: 5 }),
    })
    if (!prof.ok) throw new Error(`profile insert HTTP ${prof.status} ${await prof.text()}`)
    return { id, token }
  }

  function authed(token: string): Record<string, string> {
    return { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  const a = await signUp('a')
  const b = await signUp('b')
  const c = await signUp('c')

  try {
    // A invites B (as A), then A accepts on B's behalf — no: only the ADDRESSEE
    // may accept, so B accepts. That the accept must come from B is itself the
    // rule under test; if A could accept, this sequence would succeed trivially.
    const inv = await fetch(`${restUrl}/rest/v1/account_links`, {
      method: 'POST',
      headers: { ...authed(a.token), Prefer: 'return=representation' },
      body: JSON.stringify({ requester_id: a.id, addressee_id: b.id, status: 'pending' }),
    })
    expect(inv.ok, 'A must be able to invite B').toBe(true)
    const linkId = ((await inv.json()) as Array<{ id: string }>)[0].id

    const acc = await fetch(`${restUrl}/rest/v1/account_links?id=eq.${linkId}`, {
      method: 'PATCH',
      headers: { ...authed(b.token), Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'accepted' }),
    })
    expect(acc.ok, 'B (the addressee) must be able to accept').toBe(true)

    // ---- THE CLAIM THAT MATTERS: the third account reads NOTHING -------------
    const thirdRead = await fetch(`${restUrl}/rest/v1/account_links?select=id`, {
      headers: authed(c.token),
    })
    expect(thirdRead.ok).toBe(true)
    const thirdRows = (await thirdRead.json()) as unknown[]
    expect(
      thirdRows.length,
      'a third account must read ZERO link rows — not a redacted row, zero',
    ).toBe(0)

    // The parties themselves DO see it — otherwise the assertion above would
    // pass for the trivial reason that nobody can read anything.
    for (const [who, party] of [
      ['A (requester)', a],
      ['B (addressee)', b],
    ] as const) {
      const own = await fetch(`${restUrl}/rest/v1/account_links?select=id`, {
        headers: authed(party.token),
      })
      const rows = (await own.json()) as unknown[]
      expect(rows.length, `${who} must see the link they are part of`).toBe(1)
    }

    // ---- A third account cannot ALTER it ------------------------------------
    const thirdWrite = await fetch(`${restUrl}/rest/v1/account_links?id=eq.${linkId}`, {
      method: 'PATCH',
      headers: { ...authed(c.token), Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'declined' }),
    })
    const changed = thirdWrite.ok ? ((await thirdWrite.json()) as unknown[]) : []
    expect(changed.length, 'a third account must not be able to change the link').toBe(0)

    // …and the link is genuinely untouched (0 rows updated is not proof the
    // value survived — read it back as a party).
    const reread = await fetch(`${restUrl}/rest/v1/account_links?select=status&id=eq.${linkId}`, {
      headers: authed(a.token),
    })
    const statusRows = (await reread.json()) as Array<{ status: string }>
    expect(statusRows[0]?.status, 'the link must still be accepted').toBe('accepted')

    // ---- signed out sees nothing --------------------------------------------
    const anonRead = await fetch(`${restUrl}/rest/v1/account_links?select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    })
    expect(anonRead.ok).toBe(true)
    expect(((await anonRead.json()) as unknown[]).length, 'anon must read zero rows').toBe(0)

    // ---- parent_cards: owner-only writes ------------------------------------
    const forged = await fetch(`${restUrl}/rest/v1/parent_cards`, {
      method: 'POST',
      headers: { ...authed(c.token), Prefer: 'return=representation' },
      body: JSON.stringify({ profile_id: a.id, name: 'Forged Parent', position: 1 }),
    })
    const forgedRows = forged.ok ? ((await forged.json()) as unknown[]) : []
    expect(forgedRows.length, 'C must not be able to write a card for A').toBe(0)

    const own = await fetch(`${restUrl}/rest/v1/parent_cards`, {
      method: 'POST',
      headers: { ...authed(a.token), Prefer: 'return=representation' },
      body: JSON.stringify({ profile_id: a.id, name: 'Real Parent', position: 1 }),
    })
    expect(own.ok, 'A must be able to write their own card').toBe(true)

    // ---- "up to two" is enforced by the DATABASE, not just the UI -----------
    const second = await fetch(`${restUrl}/rest/v1/parent_cards`, {
      method: 'POST',
      headers: { ...authed(a.token), Prefer: 'return=representation' },
      body: JSON.stringify({ profile_id: a.id, name: 'Second Parent', position: 2 }),
    })
    expect(second.ok, 'a second card in slot 2 must be allowed').toBe(true)

    const third = await fetch(`${restUrl}/rest/v1/parent_cards`, {
      method: 'POST',
      headers: { ...authed(a.token), Prefer: 'return=representation' },
      body: JSON.stringify({ profile_id: a.id, name: 'Third Parent', position: 3 }),
    })
    expect(third.ok, 'a THIRD card must be refused by the database').toBe(false)
  } finally {
    // Clean up all three accounts entirely, in FK-safe order. Best-effort: a
    // failure here is logged, never thrown, so it cannot mask a real assertion.
    for (const acct of [a, b, c]) {
      for (const path of [
        `parent_cards?profile_id=eq.${acct.id}`,
        `account_links?or=(requester_id.eq.${acct.id},addressee_id.eq.${acct.id})`,
        `profiles?id=eq.${acct.id}`,
      ]) {
        await fetch(`${restUrl}/rest/v1/${path}`, {
          method: 'DELETE',
          headers: authed(acct.token),
        }).catch(() => {})
      }
    }
  }
})

/**
 * V21 t07 — the UI flow: typing a name in the Linked-parent section surfaces
 * matching parents (name + handle per row), and selecting one starts the
 * EXISTING invite flow (the @handle field fills and the invitation sends).
 *
 * Runs through the app's own /profile editor against the live project, using
 * the marker account from the setup spec (signed-in state reused by the
 * chromium project). Two throwaway parents are created via REST so the
 * search has something to find, then deleted in a finally block.
 */
test('typing a name suggests parents; selecting one sends the invite (V21 t07)', async ({ page }) => {
  test.setTimeout(300_000) // 2 signups + UI flow; live-DB timing is slow
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken: markerToken, userId: markerId } = readMarkerSession()

  /**
   * Withdraw the MARKER's own still-pending outgoing invite(s); returns the
   * number of rows actually deleted.
   *
   * WHY THIS EXISTS — a real residue bug this spec shipped with. The first
   * version cleaned up only the throwaway profiles it created, never the
   * `account_links` row the UI flow SENT. So a run left the marker with an
   * outgoing invite, and the NEXT run found the Linked-parent section in its
   * "waiting for them to accept" state, not the "none" state this spec assumes:
   * `link-name-input` was gone and the test hung to its 300s timeout. It passed
   * once and failed every time after. The requester may delete their own pending
   * row (`account_links_delete_requester_pending`, migration 0047), so this is a
   * self-scoped delete — no other account's data is touched.
   *
   * A withdrawal that leaves residue is never silent: non-ok responses and
   * network failures throw, and the caller checks the returned row count.
   */
  async function withdrawMarkerPendingInvites(): Promise<number> {
    const res = await fetchWithTimeout(
      `${restUrl}/rest/v1/account_links?requester_id=eq.${markerId}&status=eq.pending`,
      {
        method: 'DELETE',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${markerToken}`,
          Prefer: 'return=representation',
        },
      },
    )
    if (!res.ok) throw new Error(`withdraw pending invites HTTP ${res.status}: ${await res.text()}`)
    const deleted = (await res.json()) as unknown[]
    return deleted.length
  }

  /** fetch with a hard 15s cap — a hung live-DB call must fail fast. */
  async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  /** Create one throwaway parent with a unique display_name; returns its handle. */
  async function createParent(tag: string, displayName: string): Promise<{ handle: string; id: string; token: string }> {
    const stamp = Date.now()
    const email = `e2e-nsearch-ui-${tag}-${stamp}@gmail.com`
    let res = await fetchWithTimeout(`${restUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'e2e-disposable-account-pw' }),
    })
    // The live project rate-limits signups (429 over_request_rate_limit). Back
    // off and retry rather than fail the whole spec on a transient limit.
    for (let attempt = 0; res.status === 429 && attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1)))
      res = await fetchWithTimeout(`${restUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'e2e-disposable-account-pw' }),
      })
    }
    if (!res.ok) throw new Error(`signup HTTP ${res.status} ${await res.text()}`)
    const body = (await res.json()) as {
      id?: string
      access_token?: string
      user?: { id?: string }
      session?: { access_token?: string }
    }
    const id = body.id ?? body.user?.id
    const token = body.access_token ?? body.session?.access_token
    if (id === undefined || token === undefined) {
      throw new Error(`signup returned no id/token`)
    }
    const prof = await fetchWithTimeout(`${restUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, display_name: displayName, home_zip: '98107', radius_miles: 5 }),
    })
    if (!prof.ok) throw new Error(`profile insert HTTP ${prof.status} ${await prof.text()}`)
    return { handle: displayName, id, token }
  }

  const madeReal = [
    await createParent('m1', `Quinn E2E ${Date.now()}`),
    await createParent('m2', `Quinn Other ${Date.now()}`),
  ]

  let inviteSent = false
  try {
    // Start from the state this spec assumes: the marker has no outgoing
    // invite. A leftover count is residue from a previous run — say so; a
    // failed withdrawal throws, since this spec cannot run on a state it
    // could not establish.
    const preExisting = await withdrawMarkerPendingInvites()
    if (preExisting > 0) console.log(`withdrew ${preExisting} leftover pending invite(s) from a previous run`)
    await page.goto('/profile')
    await page.getByRole('button', { name: 'Edit profile' }).click()

    // The Linked-parent section is in its "none" state (the marker has no link).
    const nameInput = page.getByTestId('link-name-input')
    await nameInput.fill('Quinn E2E')

    // Debounce (~250ms) + the request: the suggestions list appears.
    const matches = page.getByTestId('link-name-matches')
    await matches.waitFor({ timeout: 15_000 })
    const rows = page.getByTestId('link-name-match')
    await expect(rows.first()).toContainText('Quinn E2E')
    // Each row shows name + handle only.
    await expect(rows.first()).toHaveText(/Quinn E2E \d+/)

    // Selecting the row fills the @handle field and sends the invite.
    await rows.first().click()
    await expect(page.getByTestId('link-handle-input')).toHaveValue(
      new RegExp(`^Quinn E2E \\d+$`),
    )
    await expect(page.getByTestId('link-outgoing')).toBeVisible()
    inviteSent = true
  } finally {
    // Clean up both throwaway parents (best-effort, as every other spec here).
    for (const p of madeReal) {
      await fetch(`${restUrl}/rest/v1/profiles?id=eq.${p.id}`, {
        method: 'DELETE',
        headers: { apikey: anonKey, Authorization: `Bearer ${p.token}` },
      }).catch(() => {})
    }
    // Withdraw the invite the flow just sent, so a re-run starts clean. A
    // failed cleanup must not mask the original failure, but residue must
    // never survive silently: a sent-but-not-withdrawn invite hangs the next
    // run, so it fails this one too.
    let withdrawn = 0
    try {
      withdrawn = await withdrawMarkerPendingInvites()
    } catch (err) {
      if (inviteSent) throw new Error(`cleanup could not withdraw the sent invite: ${String(err)}`)
      console.warn(`pending-invite cleanup failed (no invite was sent this run): ${String(err)}`)
    }
    if (inviteSent && withdrawn < 1) {
      throw new Error(
        `cleanup deleted ${withdrawn} pending invite(s), expected the one the flow sent — residue would hang the next run`,
      )
    }
  }
})

/**
 * V24 slice 11A — THE READ SURFACE SHOWS THE FAMILY'S PARENTS.
 *
 * The read surface (`ProfileView`, one component behind `/profile` AND
 * `/u/:handle`) rendered NO parent names before this slice. The ticket's ask
 * (the founder's annotation 10) is: the two parents appear under the existing
 * "About the parents" card, and a parent who has an ACCEPTED account link has
 * their NAME as a real link to that parent's profile.
 *
 * WHAT THIS SPEC PROVES, in a real browser against the real database:
 *   (a) both parent cards render by name on the read view, INSIDE the card that
 *       carries the "About the parents" heading (asserted on the DOM, not by
 *       eyeball: the names' ancestor is required to own that h2);
 *   (b) the linked parent's name is a real anchor with a real href, and
 *       following it REACHES that parent's profile (`/u/<handle>` renders their
 *       identity heading) — not a button-styled span;
 *   (c) a THIRD account viewing the same profile sees both names as PLAIN text
 *       and ZERO links — the privacy half. `account_links_select_parties`
 *       (migration 0047) returns a stranger zero rows, so the relationship is
 *       not theirs to see. This assertion would FAIL if the name link were
 *       derived from anything a stranger can read (for example a bare
 *       name-matches-a-profile lookup).
 *
 * WHY IT BUILDS ITS OWN FAMILY. There is no seeded linked pair (the live
 * project holds only the founder's accounts), and the ticket's link is a real
 * handshake: the marker invites, the partner ACCEPTS (only the addressee may),
 * and the accept is what makes the link real. The marker is a throwaway account
 * created by `auth.setup.ts` on every run, and every row this spec creates is
 * removed in the `finally` below.
 *
 * FAILS FOR THE RIGHT REASON: remove the render and (a) fails; make the name a
 * plain span and (b) fails; read the link from something a stranger can see and
 * (c) fails; drop the link-only-when-accepted rule and (c) fails on the count.
 */
test('the read surface shows both parents, and a linked name reaches that profile (V24 11A)', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000) // 2 REST signups + a second browser login; live-DB timing
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken: markerToken, userId: markerId } = readMarkerSession()
  const { displayName: markerHandle } = readMarkerMeta()

  /** fetch with a hard 15s cap — a hung live-DB call must fail fast. */
  async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  function authed(token: string): Record<string, string> {
    return { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  /**
   * One throwaway parent, over the same REST signup path the specs above use.
   * The `e2e-` account marker is on the EMAIL (the sweep's handle) and on the
   * display name, so even a hard crash leaves rows the sweep can name.
   */
  async function signUpThrowaway(
    tag: string,
    displayName: string,
  ): Promise<{ id: string; token: string; email: string }> {
    const stamp = Date.now()
    const email = `e2e-plink-${tag}-${stamp}@gmail.com`
    let res = await fetchWithTimeout(`${restUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'e2e-disposable-account-pw' }),
    })
    // The live project rate-limits signups (429). Back off and retry rather than
    // fail the spec on a transient limit.
    for (let attempt = 0; res.status === 429 && attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1)))
      res = await fetchWithTimeout(`${restUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'e2e-disposable-account-pw' }),
      })
    }
    if (!res.ok) throw new Error(`signup HTTP ${res.status} ${await res.text()}`)
    const body = (await res.json()) as {
      id?: string
      access_token?: string
      user?: { id?: string }
      session?: { access_token?: string }
    }
    const id = body.id ?? body.user?.id
    const token = body.access_token ?? body.session?.access_token
    if (id === undefined || token === undefined) {
      throw new Error(`signup returned no id/token: ${JSON.stringify(body).slice(0, 200)}`)
    }
    const prof = await fetchWithTimeout(`${restUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...authed(token), Prefer: 'return=representation' },
      // home_zip is set at creation so the account clears the onboarding gate
      // and lands on the feed when it signs in through the UI below.
      body: JSON.stringify({ id, display_name: displayName, home_zip: '98107', radius_miles: 5 }),
    })
    if (!prof.ok) throw new Error(`profile insert HTTP ${prof.status} ${await prof.text()}`)
    return { id, token, email }
  }

  const stamp = Date.now()
  const partnerHandle = `e2e-plink Partner ${stamp}`
  const strangerHandle = `e2e-plink Stranger ${stamp}`
  const partner = await signUpThrowaway('partner', partnerHandle)
  const stranger = await signUpThrowaway('stranger', strangerHandle)
  let linkId: string | null = null

  try {
    // The marker's TWO parent cards: the marker itself (plain text), and the
    // partner (the card the accepted link should turn into a link). POST, not
    // upsert: a pre-existing card in a slot would be a 23505 and fail loudly
    // rather than silently overwriting the marker's own data.
    for (const [position, name] of [
      [1, markerHandle],
      [2, partnerHandle],
    ] as const) {
      const res = await fetchWithTimeout(`${restUrl}/rest/v1/parent_cards`, {
        method: 'POST',
        headers: { ...authed(markerToken), Prefer: 'return=representation' },
        body: JSON.stringify({ profile_id: markerId, name, position }),
      })
      if (!res.ok) {
        throw new Error(`parent_cards insert (slot ${position}) HTTP ${res.status} ${await res.text()}`)
      }
    }

    // The handshake: the marker invites, the PARTNER accepts. Only the addressee
    // may move a row out of 'pending' (migration 0047), so this cannot be
    // short-circuited by the requester accepting on their own behalf.
    const inv = await fetchWithTimeout(`${restUrl}/rest/v1/account_links`, {
      method: 'POST',
      headers: { ...authed(markerToken), Prefer: 'return=representation' },
      body: JSON.stringify({ requester_id: markerId, addressee_id: partner.id, status: 'pending' }),
    })
    if (!inv.ok) throw new Error(`account_links insert HTTP ${inv.status} ${await inv.text()}`)
    linkId = ((await inv.json()) as Array<{ id: string }>)[0].id
    const acc = await fetchWithTimeout(`${restUrl}/rest/v1/account_links?id=eq.${linkId}`, {
      method: 'PATCH',
      headers: { ...authed(partner.token), Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'accepted' }),
    })
    if (!acc.ok) throw new Error(`account_links accept HTTP ${acc.status} ${await acc.text()}`)

    // ---- (a) + (b): the OWNER'S read view /profile -------------------------
    await page.goto('/profile')
    // The app's own origin, read from the settled page — the second browser
    // context below has no project baseURL of its own.
    const origin = new URL(page.url()).origin
    const names = page.getByTestId('parent-names')
    await expect(names).toBeVisible({ timeout: 20_000 })

    // Both parents, by name: the marker's own card as plain text, the partner's
    // as the ONE link.
    await expect(page.getByTestId('parent-name')).toHaveCount(1)
    await expect(page.getByTestId('parent-name')).toHaveText(markerHandle)
    const nameLink = page.getByTestId('parent-name-link')
    await expect(nameLink).toHaveCount(1)
    await expect(nameLink).toHaveText(partnerHandle)

    // The names sit INSIDE the card that owns the "About the parents" heading —
    // walked on the DOM, so a name rendered anywhere else on the page fails.
    const insideAboutCard = await names.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement
      while (node !== null) {
        const heading = node.querySelector('h2')
        if (heading?.textContent?.trim() === 'About the parents') return true
        node = node.parentElement
      }
      return false
    })
    expect(
      insideAboutCard,
      'the parent names must render inside the "About the parents" card',
    ).toBe(true)

    // A REAL link: a real href, the parent's name as its accessible name, and a
    // >=44px target (`min-h-11`). Not a button, not a click handler on a span.
    await expect(nameLink).toHaveAttribute('href', `/u/${encodeURIComponent(partnerHandle)}`)
    const linkBox = await nameLink.boundingBox()
    expect(linkBox?.height ?? 0, 'the name link must be a >=44px target').toBeGreaterThanOrEqual(44)

    // ...and it REACHES the partner's profile. The pathname is percent-encoded
    // in `location`, so compare it DECODED — otherwise a handle with a space
    // (every V20 composed display name) would never equal the route.
    await nameLink.click()
    await page.waitForFunction(
      (path) => decodeURIComponent(new URL(window.location.href).pathname) === path,
      `/u/${partnerHandle}`,
      { timeout: 20_000 },
    )
    await expect(
      page.getByRole('heading', { name: `@${partnerHandle}`, exact: true }),
    ).toBeVisible({ timeout: 20_000 })

    // ---- (d) V24 11B fix round 1: the account-level control is on ONE card --
    // The edit surface used to answer "which card carries the link?" ONE CARD AT
    // A TIME, so with the marker's own card FIRST (a non-match) and the partner's
    // card second (the match) it rendered the relationship TWICE: two "Linked to
    // @Nicole" lines and two Unlink buttons, one of them misattributed to the
    // wrong parent. The list-level rule (`parentCardLinkOwnerIndex`) owns it
    // once. This is the live half of the unit test in src/lib/links.test.ts — on
    // the pre-fix rule the two `toHaveCount(1)` assertions below count 2.
    await page.goto('/profile')
    await page.getByTestId('edit-profile').click()
    const partnerCardLinked = page.getByTestId('parent-card-2').getByTestId('linked-parent')
    await expect(partnerCardLinked).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('linked-parent')).toHaveCount(1)
    await expect(page.getByTestId('unlink-parent')).toHaveCount(1)
    // ...and it does NOT sit on the marker's own card (slot 1, the non-match).
    await expect(page.getByTestId('parent-card-1').getByTestId('linked-parent')).toHaveCount(0)

    // ---- (c): a THIRD account sees names and NO link -----------------------
    // The privacy claim, in the same browser: the stranger may see the family's
    // parent cards (RLS permits any signed-in parent to read them) but must not
    // see WHO is account-linked to whom (RLS returns them zero link rows).
    //
    // `storageState: { cookies: [], origins: [] }` is REQUIRED, not decoration:
    // a context created from the `browser` fixture inside a test INHERITS the
    // project's `use.storageState` (measured, not assumed), so without it this
    // page is the MARKER — signed in, with the marker's session in
    // localStorage — and `/login` redirects to the feed. An empty state makes it
    // the signed-out stranger this lane is about.
    const strangerContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
    })
    strangerContext.setDefaultTimeout(20_000)
    const strangerPage = await strangerContext.newPage()
    try {
      await strangerPage.goto(`${origin}/login`)
      await strangerPage.locator('input[type="email"]').fill(stranger.email)
      await strangerPage.locator('input[type="password"]').fill('e2e-disposable-account-pw')
      await strangerPage.getByRole('button', { name: 'Sign in', exact: true }).click()
      await strangerPage
        .getByRole('heading', { name: 'Near you' })
        .waitFor({ timeout: 30_000 })

      await strangerPage.goto(`${origin}/u/${encodeURIComponent(markerHandle)}`)
      await expect(strangerPage.getByTestId('parent-names')).toBeVisible({ timeout: 20_000 })
      await expect(strangerPage.getByTestId('parent-name')).toHaveCount(2)
      await expect(
        strangerPage.getByTestId('parent-name-link'),
        'a third account must not learn which parent is account-linked',
      ).toHaveCount(0)
    } finally {
      await strangerContext.close()
    }
  } finally {
    // Cleanup, each query scoped to a column this spec owns: the marker's own
    // cards, the link row it created (by id), and the two throwaway profiles
    // (whose deletion cascades to anything else they own). Best-effort, so a
    // failure here cannot mask a real assertion — the `e2e-` account marker and
    // the sweep are the net for a hard crash.
    await fetchWithTimeout(`${restUrl}/rest/v1/parent_cards?profile_id=eq.${markerId}`, {
      method: 'DELETE',
      headers: authed(markerToken),
    }).catch(() => {})
    if (linkId !== null) {
      await fetchWithTimeout(`${restUrl}/rest/v1/account_links?id=eq.${linkId}`, {
        method: 'DELETE',
        headers: authed(markerToken),
      }).catch(() => {})
    }
    for (const acct of [partner, stranger]) {
      await fetchWithTimeout(`${restUrl}/rest/v1/profiles?id=eq.${acct.id}`, {
        method: 'DELETE',
        headers: authed(acct.token),
      }).catch(() => {})
    }
  }
})

/**
 * V24 slice 11B — THE LINK ACTION LIVES ON THE PARENT CARD.
 *
 * The edit surface used to render partner linking in its own "Linked parent"
 * section below the parent cards. 11B moved that action INSIDE each card (the
 * founder's annotation 9: "an option to click on something to link an account to
 * that person's name") and deleted the standalone section, heading, blurb and
 * all. This spec is the browser proof of both halves, on the RENDERED DOM:
 *
 *   (a) the invite control resolves to a `[data-testid="parent-card-N"]`
 *       ancestor AND sits under the "The parents" heading — "the action lives
 *       with the person", asserted by walking ancestors rather than by reading
 *       the source;
 *   (b) a second parent's card offers its OWN affordance, and tapping it MOVES
 *       the form to that card (one form at a time, on the card you chose);
 *   (c) the standalone section is GONE — no "Linked parent" heading and none of
 *       its copy survives anywhere on the page (the drift this repo fixed once
 *       already: a second entry point to the same action).
 *
 * WHY IT SEEDS ITS OWN STATE. It establishes the "no link" state first (the
 * marker's own link rows are deleted — the marker is a throwaway account created
 * by `auth.setup.ts`, so every row it owns is fixture) and then writes the two
 * parent cards it asserts on. Nothing here depends on a previous spec's residue.
 * Every row it creates is removed in the `finally`.
 *
 * FAILS FOR THE RIGHT REASON: render the control outside the card and (a) fails;
 * render one shared form for both cards and (b) fails; leave any of the old
 * section behind and (c) fails.
 */
test('the link action lives on the parent card, and the standalone section is gone (V24 11B)', async ({
  page,
}) => {
  test.setTimeout(180_000) // live-DB reads + a card write; no signups needed
  const { url: restUrl, anonKey } = readSupabaseEnv()
  const { accessToken: markerToken, userId: markerId } = readMarkerSession()
  const { displayName: markerHandle } = readMarkerMeta()

  /**
   * fetch with a hard 15s cap — a hung live-DB call must fail fast.
   *
   * The 11A test above established this discipline; this test is the OTHER half
   * of the same slice and talks to the same live database, so it routes every
   * REST call (the two reads and the DELETE loop in `clearMarkerLinks`, the
   * `parent_cards` DELETE + inserts, and the `finally` cleanup) through the same
   * cap. Without it a hung call parks here until the 180s `setTimeout` ceiling,
   * and the diagnosis of *which* call hung is lost.
   */
  async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  function authed(token: string): Record<string, string> {
    return { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  const cardTwoName = `e2e-plink Card Two ${Date.now()}`

  /**
   * Remove the marker's own link rows, ONE ROW AT A TIME by id.
   *
   * The reads are owner-scoped (`requester_id` / `addressee_id` are the marker
   * itself) and the DELETE names `id`, a row this spec just proved it owns. A
   * literal `DELETE ... or=(requester_id.eq.X,addressee_id.eq.X)` would be
   * equally safe, but the fixture-marker guard judges a DELETE by its filter KEY
   * and cannot see inside `or` — so it is written this way rather than argued
   * with.
   */
  async function clearMarkerLinks(): Promise<void> {
    const asRequester = await fetchWithTimeout(
      `${restUrl}/rest/v1/account_links?select=id&requester_id=eq.${markerId}`,
      { headers: authed(markerToken) },
    )
    const asAddressee = await fetchWithTimeout(
      `${restUrl}/rest/v1/account_links?select=id&addressee_id=eq.${markerId}`,
      { headers: authed(markerToken) },
    )
    const rows = [
      ...(asRequester.ok ? ((await asRequester.json()) as Array<{ id: string }>) : []),
      ...(asAddressee.ok ? ((await asAddressee.json()) as Array<{ id: string }>) : []),
    ]
    for (const row of rows) {
      await fetchWithTimeout(`${restUrl}/rest/v1/account_links?id=eq.${row.id}`, {
        method: 'DELETE',
        headers: authed(markerToken),
      }).catch(() => {})
    }
  }

  try {
    // A deterministic starting point: no link state, no leftover cards.
    await clearMarkerLinks()
    await fetchWithTimeout(`${restUrl}/rest/v1/parent_cards?profile_id=eq.${markerId}`, {
      method: 'DELETE',
      headers: authed(markerToken),
    }).catch(() => {})

    for (const [position, name] of [
      [1, markerHandle],
      [2, cardTwoName],
    ] as const) {
      const res = await fetchWithTimeout(`${restUrl}/rest/v1/parent_cards`, {
        method: 'POST',
        headers: { ...authed(markerToken), Prefer: 'return=representation' },
        body: JSON.stringify({ profile_id: markerId, name, position }),
      })
      if (!res.ok) {
        throw new Error(`parent_cards insert (slot ${position}) HTTP ${res.status} ${await res.text()}`)
      }
    }

    await page.goto('/profile')
    await page.getByTestId('edit-profile').click()

    // ---- (a) the control is INSIDE the first parent's card -----------------
    const cardOne = page.getByTestId('parent-card-1')
    const form = cardOne.getByTestId('send-link-invite')
    await expect(form).toBeVisible({ timeout: 20_000 })
    await expect(cardOne.getByTestId('link-name-input')).toBeVisible()

    // ...and the card group is the one that owns the "The parents" heading:
    // walked on the DOM, so the action rendering anywhere else on the page
    // (the removed section's old spot included) fails.
    const underParentsHeading = await form.evaluate((el) => {
      const heading = [...document.querySelectorAll('main h2')].find(
        (h) => h.textContent?.trim() === 'The parents',
      )
      const section = heading?.parentElement ?? null
      if (section === null) return false
      let node: HTMLElement | null = el as HTMLElement
      while (node !== null) {
        if (node === section) return true
        node = node.parentElement
      }
      return false
    })
    expect(
      underParentsHeading,
      'the link action must sit inside the "The parents" card group',
    ).toBe(true)

    // ---- (b) the second parent's card offers its own, and it MOVES the form --
    // Scoped to `parent-card-2`: "its OWN affordance" has to mean the control is
    // inside THAT card, not merely that a testid with its slot number exists
    // somewhere on the page.
    const openTwo = page.getByTestId('parent-card-2').getByTestId('link-parent-open-2')
    await expect(openTwo).toBeVisible()
    await openTwo.click()
    const cardTwo = page.getByTestId('parent-card-2')
    await expect(cardTwo.getByTestId('link-name-input')).toBeVisible()
    await expect(cardTwo.getByTestId('send-link-invite')).toBeVisible()
    // One form at a time: the first card now offers the action instead.
    await expect(page.getByTestId('link-parent-open-1')).toBeVisible()
    await expect(page.getByTestId('link-name-input')).toHaveCount(1)

    // ---- (c) the standalone "Linked parent" section is GONE ----------------
    await expect(page.locator('main h2', { hasText: /linked parent/i })).toHaveCount(0)
    await expect(page.getByText(/If your partner has their own account/i)).toHaveCount(0)
  } finally {
    // Best-effort, each query scoped to the marker's own columns. The `e2e-`
    // name on card two and the marker account itself are the sweep's net if a
    // hard crash lands here.
    await fetchWithTimeout(`${restUrl}/rest/v1/parent_cards?profile_id=eq.${markerId}`, {
      method: 'DELETE',
      headers: authed(markerToken),
    }).catch(() => {})
    await clearMarkerLinks().catch(() => {})
  }
})
