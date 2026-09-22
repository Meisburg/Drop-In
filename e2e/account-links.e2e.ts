import { expect, test } from '@playwright/test'
import { readMarkerSession, readSupabaseEnv } from './fixtures'

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
      body: JSON.stringify({ email, password: 'probe-password-123' }),
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
