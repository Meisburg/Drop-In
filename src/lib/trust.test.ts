import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  COMMENT_MAX_LENGTH,
  buildShareUrl,
  groupCommentsForRender,
  isHostBlocked,
  isPlaydateReturnTarget,
  issueReportInsert,
  planCommentAction,
  planPing,
  playdateDetailPathFromEditPath,
  togglePingWithClient,
  validateCommentBody,
  validateReportReason,
  type CommentActionContext,
  type ReportInsertPayload,
} from './trust'
import type { CommentWithAuthor } from './types'

/**
 * Trust-logic tests (slice 4): the ping-toggle round-trip against a mocked
 * supabase client (the same pattern as auth.test.ts), the host-cannot-ping-
 * own-post guard, report-reason validation, and the detail-path block
 * filter. All pure or mock-only — no database or browser needed.
 */

const PLAYDATE_ID = 'pd-1'

interface MockPingOptions {
  /** The signed-in user's id (auth.getUser). */
  userId: string
  /** The playdate's host_profile_id (the playdates select). */
  hostId: string
  /** Profile ids that already pinged the playdate. */
  pings?: string[]
}

/**
 * Minimal in-memory mock of the client surface the ping round-trip uses:
 * auth.getUser + from('playdates') select + from('going_pings')
 * select/upsert/delete. Every mutation is recorded in `ops` so tests can
 * assert the upsert→delete round-trip; `pings` is the in-memory
 * going_pings table.
 */
function makeMockClient(opts: MockPingOptions): {
  client: SupabaseClient
  ops: string[]
  pings: Set<string>
} {
  const ops: string[] = []
  const pings = new Set(opts.pings ?? [])

  const fakeFrom = (table: string) => {
    const filters: Record<string, unknown> = {}
    const selectChain = {
      select: (_cols: string, _options?: unknown) => selectChain,
      eq: (col: string, value: unknown) => {
        filters[col] = value
        return selectChain
      },
      maybeSingle: async () => {
        if (table === 'playdates') {
          ops.push(`select playdates id=${String(filters.id)}`)
          if (filters.id !== PLAYDATE_ID) return { data: null, error: null }
          return { data: { host_profile_id: opts.hostId }, error: null }
        }
        ops.push(
          `select going_pings playdate_id=${String(filters.playdate_id)} profile_id=${String(filters.profile_id)}`,
        )
        const hit = filters.playdate_id === PLAYDATE_ID && pings.has(String(filters.profile_id))
        return { data: hit ? { profile_id: filters.profile_id } : null, error: null }
      },
    }
    const deleteChain = {
      eq: (col: string, value: unknown) => {
        filters[col] = value
        return deleteChain
      },
      then: (onfulfilled?: (value: { data: null; error: null }) => unknown) => {
        ops.push(`delete going_pings profile_id=${String(filters.profile_id)}`)
        if (filters.playdate_id === PLAYDATE_ID) pings.delete(String(filters.profile_id))
        return Promise.resolve({ data: null, error: null }).then(onfulfilled)
      },
    }
    return {
      ...selectChain,
      upsert: (row: { playdate_id: string; profile_id: string }) => {
        ops.push(`upsert going_pings profile_id=${row.profile_id}`)
        pings.add(row.profile_id)
        return Promise.resolve({ data: row, error: null })
      },
      delete: () => deleteChain,
    }
  }

  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: opts.userId } }, error: null }),
    },
    from: fakeFrom,
  } as unknown as SupabaseClient

  return { client, ops, pings }
}

describe('planPing (the host-cannot-ping-own-post guard)', () => {
  it('no-ops when the viewer is the host (with or without an existing ping)', () => {
    expect(planPing(false, true)).toBe('noop-host')
    expect(planPing(true, true)).toBe('noop-host')
  })

  it('pings when there is no existing ping', () => {
    expect(planPing(false, false)).toBe('ping')
  })

  it('unpings when a ping already exists', () => {
    expect(planPing(true, false)).toBe('unping')
  })
})

describe('togglePingWithClient (mocked supabase client)', () => {
  it('upserts, then deletes, on a ping→unping round-trip', async () => {
    const { client, ops, pings } = makeMockClient({ userId: 'u1', hostId: 'host-1' })

    expect(await togglePingWithClient(client, PLAYDATE_ID)).toBe(true)
    expect(pings.has('u1')).toBe(true)

    expect(await togglePingWithClient(client, PLAYDATE_ID)).toBe(false)
    expect(pings.has('u1')).toBe(false)

    expect(ops).toContain('upsert going_pings profile_id=u1')
    expect(ops).toContain('delete going_pings profile_id=u1')
  })

  it('no-ops when the viewer is the host of the post (no ping writes)', async () => {
    const { client, ops, pings } = makeMockClient({ userId: 'host-1', hostId: 'host-1' })

    expect(await togglePingWithClient(client, PLAYDATE_ID)).toBe(false)
    expect(pings.size).toBe(0)
    expect(
      ops.some((op) => op.startsWith('upsert') || op.startsWith('delete')),
    ).toBe(false)
  })

  it("an existing ping by another user doesn't affect this user's toggle", async () => {
    const { client, pings } = makeMockClient({
      userId: 'u1',
      hostId: 'host-1',
      pings: ['u2'],
    })

    expect(await togglePingWithClient(client, PLAYDATE_ID)).toBe(true)
    expect(pings.has('u1')).toBe(true)
    expect(pings.has('u2')).toBe(true)
  })
})

describe('validateReportReason (required, non-empty after trim)', () => {
  it('rejects an empty reason', () => {
    expect(validateReportReason('')).not.toBeNull()
  })

  it('rejects a whitespace-only reason', () => {
    expect(validateReportReason('   ')).not.toBeNull()
  })

  it('accepts a non-empty reason', () => {
    expect(validateReportReason('Shared a home address instead of a public meet-up')).toBeNull()
  })
})

describe('isHostBlocked (the detail-path block filter)', () => {
  const post = { host_profile_id: 'host-1' }

  it('hides a post whose host is in the viewer’s block set', () => {
    expect(isHostBlocked(post, new Set(['host-1', 'other']))).toBe(true)
  })

  it('shows a post whose host is not blocked', () => {
    expect(isHostBlocked(post, new Set(['other']))).toBe(false)
    expect(isHostBlocked(post, new Set())).toBe(false)
  })
})

/**
 * Minimal mock of the client surface issueReportInsert uses: the insert
 * chain records every .select() call (the 42501 tripwire). With
 * modelRls42501, .select().single() resolves with the live behavior
 * (REST probe 2026-09-09): a 42501 RLS violation, since INSERT ...
 * RETURNING SELECTs the new row under the moderators-only reports
 * SELECT policy.
 */
function makeReportsMockClient(modelRls42501: boolean): {
  client: SupabaseClient
  calls: { select: number; inserted: unknown[] }
} {
  const calls = { select: 0, inserted: [] as unknown[] }
  const insertChain = {
    select: () => {
      calls.select += 1
      if (modelRls42501) {
        // Live behavior: the SELECT half of RETURNING is RLS-forbidden
        // for non-moderators → 42501.
        return {
          single: async () => ({
            data: null,
            error: {
              code: '42501',
              message: 'new row violates row-level security policy for table "reports"',
            },
          }),
        }
      }
      return { single: async () => ({ data: null, error: null }) }
    },
    then: (onfulfilled?: (value: { data: null; error: null }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onfulfilled),
  }
  const client = {
    from: (table: string) => {
      if (table !== 'reports') throw new Error(`unexpected table: ${table}`)
      return {
        insert: (payload: unknown) => {
          calls.inserted.push(payload)
          return insertChain
        },
      }
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const REPORT_PAYLOAD: ReportInsertPayload = {
  reporter_profile_id: 'u1',
  playdate_id: PLAYDATE_ID,
  reported_profile_id: 'host-1',
  reason: 'Shared a home address instead of a public meet-up',
}

describe('issueReportInsert (42501 regression: plain insert, no RETURNING)', () => {
  it('issues the reports INSERT without a .select() in the chain', async () => {
    const { client, calls } = makeReportsMockClient(false)
    await issueReportInsert(client, REPORT_PAYLOAD)
    expect(calls.inserted).toEqual([REPORT_PAYLOAD])
    expect(calls.select).toBe(0)
  })

  it('succeeds under a mock that models live 42501 for RETURNING (tripwire: re-adding .select() fails this test)', async () => {
    const { client, calls } = makeReportsMockClient(true)
    // A bare INSERT (no RETURNING) succeeds live (HTTP 201, verified).
    // If anyone re-adds .select() to the insert, the helper would await a
    // chain that resolves the 42501 error and reject — this test fails.
    await expect(issueReportInsert(client, REPORT_PAYLOAD)).resolves.toBeUndefined()
    expect(calls.select).toBe(0)
  })
})

describe('planCommentAction (comment permissions, ticket 04)', () => {
  const comment = { author_profile_id: 'author-1', hidden_at: null, parent_id: null }
  const stranger: CommentActionContext = { viewerId: 'stranger-1', hostId: 'host-1', isModerator: false }

  it('the author can delete their own comment (and see it)', () => {
    const plan = planCommentAction(comment, { ...stranger, viewerId: 'author-1' })
    expect(plan.canDelete).toBe(true)
    expect(plan.canHide).toBe(false)
    expect(plan.canSee).toBe(true)
  })

  it('the event host can delete any comment on their event (incl. the author’s)', () => {
    const plan = planCommentAction(comment, { ...stranger, viewerId: 'host-1' })
    expect(plan.canDelete).toBe(true)
    expect(plan.canHide).toBe(false)
    expect(plan.canSee).toBe(true)
  })

  it('a stranger (neither author nor host) can neither delete nor hide', () => {
    const plan = planCommentAction(comment, stranger)
    expect(plan.canDelete).toBe(false)
    expect(plan.canHide).toBe(false)
    expect(plan.canSee).toBe(true)
  })

  it('a moderator can hide (and, as non-author non-host, not delete)', () => {
    const plan = planCommentAction(comment, { ...stranger, isModerator: true })
    expect(plan.canHide).toBe(true)
    expect(plan.canDelete).toBe(false)
  })

  it('a moderator who is also the author can both delete and hide', () => {
    const plan = planCommentAction(comment, { viewerId: 'author-1', hostId: 'host-1', isModerator: true })
    expect(plan.canDelete).toBe(true)
    expect(plan.canHide).toBe(true)
  })

  it('a hidden comment is not visible (canSee false — the soft-hide)', () => {
    const plan = planCommentAction(
      { author_profile_id: 'author-1', hidden_at: '2026-09-09T00:00:00Z', parent_id: null },
      stranger,
    )
    expect(plan.canSee).toBe(false)
  })
})

describe('validateCommentBody (empty + 500-char cap, ticket 04)', () => {
  it('rejects an empty body', () => {
    expect(validateCommentBody('')).not.toBeNull()
  })

  it('rejects a whitespace-only body', () => {
    expect(validateCommentBody('   ')).not.toBeNull()
  })

  it('accepts a body up to and including the cap', () => {
    expect(validateCommentBody('Is Max okay to bring?')).toBeNull()
    expect(validateCommentBody('x'.repeat(COMMENT_MAX_LENGTH))).toBeNull()
  })

  it('rejects a body over the cap', () => {
    expect(validateCommentBody('x'.repeat(COMMENT_MAX_LENGTH + 1))).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// V2 slice 5 (ticket 05, share + public event view): the pure seam.

describe('buildShareUrl (VITE_PUBLIC_BASE_URL + the origin fallback, ticket 05)', () => {
  it('uses the base URL when set (deployment, DECISION 3)', () => {
    expect(buildShareUrl('pd-1', 'https://playdate.example', 'http://localhost:5173')).toBe(
      'https://playdate.example/playdate/pd-1',
    )
  })

  it('falls back to the window origin when the base URL is empty (placeholder-safe)', () => {
    expect(buildShareUrl('pd-1', '', 'http://localhost:4173')).toBe(
      'http://localhost:4173/playdate/pd-1',
    )
  })

  it('ignores a whitespace-only base URL (the env var can be set-but-empty)', () => {
    expect(buildShareUrl('pd-1', '  ', 'https://playdate.example')).toBe(
      'https://playdate.example/playdate/pd-1',
    )
  })
})

describe('isPlaydateReturnTarget (the stored "I\'m coming" return target)', () => {
  it('accepts exactly /playdate/<id>', () => {
    expect(isPlaydateReturnTarget('/playdate/pd-1')).toBe(true)
    expect(isPlaydateReturnTarget('/playdate/abc-123')).toBe(true)
  })

  it('rejects everything else (a tampered value is ignored, never navigated to)', () => {
    expect(isPlaydateReturnTarget(null)).toBe(false)
    expect(isPlaydateReturnTarget('')).toBe(false)
    expect(isPlaydateReturnTarget('/playdate/')).toBe(false)
    expect(isPlaydateReturnTarget('/playdate/abc-123/')).toBe(false)
    expect(isPlaydateReturnTarget('/playdate/a/b')).toBe(false)
    expect(isPlaydateReturnTarget('/profile')).toBe(false)
    expect(isPlaydateReturnTarget('javascript:alert(1)')).toBe(false)
  })
})

describe('playdateDetailPathFromEditPath (V8 ticket 05, the host-only edit route)', () => {
  it('maps /playdate/<id>/edit to the post it edits', () => {
    expect(playdateDetailPathFromEditPath('/playdate/pd-1/edit')).toBe('/playdate/pd-1')
    expect(playdateDetailPathFromEditPath('/playdate/abc-123/edit/')).toBe('/playdate/abc-123')
  })

  it('resolves nothing for any other path (a tampered path is never navigated to)', () => {
    expect(playdateDetailPathFromEditPath('/playdate/pd-1')).toBeNull()
    expect(playdateDetailPathFromEditPath('/playdate//edit')).toBeNull()
    expect(playdateDetailPathFromEditPath('/playdate/a/b/edit')).toBeNull()
    expect(playdateDetailPathFromEditPath('/playdate/pd-1/edit/extra')).toBeNull()
    expect(playdateDetailPathFromEditPath('/profile')).toBeNull()
    expect(playdateDetailPathFromEditPath('/')).toBeNull()
    expect(playdateDetailPathFromEditPath('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// V3 slice 7 (ticket 10, one-level comment replies): the thread-group seam
// + the reply affordance. All pure inputs — no mocks, no database (house
// style, matching the other blocks in this file).

/** One CommentWithAuthor fixture (the seam's input; the author join minimal). */
function makeComment(
  id: string,
  authorId: string,
  createdAt: string,
  opts: { parentId?: string | null; hiddenAt?: string | null } = {},
): CommentWithAuthor {
  return {
    id,
    playdate_id: 'pd-1',
    author_profile_id: authorId,
    body: `body of ${id}`,
    created_at: createdAt,
    hidden_at: opts.hiddenAt ?? null,
    parent_id: opts.parentId ?? null,
    author: { id: authorId, display_name: authorId },
  }
}

describe('groupCommentsForRender (V3 slice 7, ticket 10 — thread groups)', () => {
  it('nests a parent\'s replies under it, children in created_at order (a)', () => {
    const p1 = makeComment('p1', 'u1', '2026-09-10T10:00:00Z')
    const r1 = makeComment('r1', 'u2', '2026-09-10T10:05:00Z', { parentId: 'p1' })
    const r2 = makeComment('r2', 'u3', '2026-09-10T10:10:00Z', { parentId: 'p1' })
    const groups = groupCommentsForRender([p1, r1, r2])
    expect(groups).toHaveLength(1)
    expect(groups[0].parent.id).toBe('p1')
    expect(groups[0].children.map((c) => c.id)).toEqual(['r1', 'r2'])
  })

  it('orders groups by the parent\'s created_at, children ascending (b)', () => {
    // Deliberately non-canonical input order: the output contract must
    // hold regardless (the seam sorts internally).
    const p2 = makeComment('p2', 'u1', '2026-09-10T11:00:00Z')
    const p1 = makeComment('p1', 'u2', '2026-09-10T10:00:00Z')
    const r2 = makeComment('r2', 'u3', '2026-09-10T10:30:00Z', { parentId: 'p1' })
    const r1 = makeComment('r1', 'u4', '2026-09-10T10:15:00Z', { parentId: 'p1' })
    const groups = groupCommentsForRender([p2, p1, r2, r1])
    expect(groups.map((g) => g.parent.id)).toEqual(['p1', 'p2'])
    expect(groups[0].children.map((c) => c.id)).toEqual(['r1', 'r2'])
    expect(groups[1].children).toEqual([])
  })

  it('excludes the replies of a hidden parent — the mod\'s hide covers the thread (c)', () => {
    const p1 = makeComment('p1', 'u1', '2026-09-10T10:00:00Z', {
      hiddenAt: '2026-09-10T12:00:00Z',
    })
    const r1 = makeComment('r1', 'u2', '2026-09-10T10:05:00Z', { parentId: 'p1' })
    const r2 = makeComment('r2', 'u3', '2026-09-10T10:10:00Z', { parentId: 'p1' })
    const groups = groupCommentsForRender([p1, r1, r2])
    expect(groups).toHaveLength(1)
    // The muted parent row stays (the mod view); its replies don't render.
    expect(groups[0].parent.id).toBe('p1')
    expect(groups[0].parent.hidden_at).toBe('2026-09-10T12:00:00Z')
    expect(groups[0].children).toEqual([])
  })

  it('keeps a hidden reply under a visible parent (the UI renders the muted chip) (c)', () => {
    const p1 = makeComment('p1', 'u1', '2026-09-10T10:00:00Z')
    const r1 = makeComment('r1', 'u2', '2026-09-10T10:05:00Z', {
      parentId: 'p1',
      hiddenAt: '2026-09-10T12:00:00Z',
    })
    const groups = groupCommentsForRender([p1, r1])
    expect(groups[0].children.map((c) => [c.id, c.hidden_at])).toEqual([
      ['r1', '2026-09-10T12:00:00Z'],
    ])
  })

  it('drops an orphan reply (its parent is not in the row set) (d)', () => {
    const p1 = makeComment('p1', 'u1', '2026-09-10T10:00:00Z')
    const orphan = makeComment('orphan', 'u2', '2026-09-10T10:05:00Z', {
      parentId: 'gone',
    })
    const groups = groupCommentsForRender([p1, orphan])
    expect(groups).toHaveLength(1)
    expect(groups[0].children).toEqual([])
  })

  it('drops a reply-to-reply (its parent is a reply in the input — 0023 allows such rows at the DB level; the one-level pin is client-side) (d)', () => {
    const p1 = makeComment('p1', 'u1', '2026-09-10T10:00:00Z')
    const r1 = makeComment('r1', 'u2', '2026-09-10T10:05:00Z', { parentId: 'p1' })
    const r2 = makeComment('r2', 'u3', '2026-09-10T10:10:00Z', { parentId: 'r1' })
    const groups = groupCommentsForRender([p1, r1, r2])
    expect(groups).toHaveLength(1)
    expect(groups[0].parent.id).toBe('p1')
    // A reply answers a child, never a group — there is no second
    // indent level: r1 is the only child, r2 is dropped.
    expect(groups[0].children.map((c) => c.id)).toEqual(['r1'])
  })

  it('renders no groups for an empty list (e)', () => {
    expect(groupCommentsForRender([])).toEqual([])
  })

  it('treats a pre-apply row missing parent_id as top-level (f)', () => {
    // Pre-0023-apply runtime shape: the DB doesn't return the column at
    // all (undefined, not null — the cast models that; the types.ts note).
    const preApplyRow = {
      id: 'p1',
      playdate_id: 'pd-1',
      author_profile_id: 'u1',
      body: 'Is Max okay to bring?',
      created_at: '2026-09-10T10:00:00Z',
      hidden_at: null,
      author: { id: 'u1', display_name: 'u1' },
    } as unknown as CommentWithAuthor
    const groups = groupCommentsForRender([preApplyRow])
    expect(groups).toHaveLength(1)
    expect(groups[0].parent.id).toBe('p1')
    expect(groups[0].children).toEqual([])
  })
})

describe('planCommentAction (V3 slice 7 — the reply affordance, ticket 10)', () => {
  const topLevel = { author_profile_id: 'author-1', hidden_at: null, parent_id: null }
  const reply = { author_profile_id: 'reply-author', hidden_at: null, parent_id: 'top-1' }
  const viewer = (viewerId: string, isModerator = false) => ({
    viewerId,
    hostId: 'host-1',
    isModerator,
  })

  it('a third-party viewer can reply to a top-level comment (replies open to all) but not delete (g)', () => {
    const plan = planCommentAction(topLevel, viewer('stranger-1'))
    expect(plan.canReply).toBe(true)
    expect(plan.canDelete).toBe(false)
    expect(plan.canHide).toBe(false)
  })

  it('the host and a moderator can reply too (no host/mod gate — open to ALL authenticated users) (g)', () => {
    expect(planCommentAction(topLevel, viewer('host-1')).canReply).toBe(true)
    expect(planCommentAction(topLevel, viewer('mod-1', true)).canReply).toBe(true)
  })

  it('a reply offers no reply affordance (the one-level pin — no reply-to-replies) (h)', () => {
    expect(planCommentAction(reply, viewer('stranger-1')).canReply).toBe(false)
    expect(planCommentAction(reply, viewer('reply-author')).canReply).toBe(false)
    expect(planCommentAction(reply, viewer('host-1')).canReply).toBe(false)
  })

  it("reply delete = the reply's author or the event host — the parent's author is out (i)", () => {
    expect(planCommentAction(reply, viewer('reply-author')).canDelete).toBe(true)
    expect(planCommentAction(reply, viewer('host-1')).canDelete).toBe(true)
    expect(planCommentAction(reply, viewer('parent-author')).canDelete).toBe(false)
    expect(planCommentAction(reply, viewer('stranger-1')).canDelete).toBe(false)
  })

  it('hide on a reply: moderators only, unchanged (the mod hide covers replies) (j)', () => {
    expect(planCommentAction(reply, viewer('mod-1', true)).canHide).toBe(true)
    expect(planCommentAction(reply, viewer('stranger-1')).canHide).toBe(false)
  })

  it('a top-level comment\'s delete is unchanged (the row\'s author or the host)', () => {
    expect(planCommentAction(topLevel, viewer('author-1')).canDelete).toBe(true)
    expect(planCommentAction(topLevel, viewer('host-1')).canDelete).toBe(true)
    expect(planCommentAction(topLevel, viewer('stranger-1')).canDelete).toBe(false)
  })
})
