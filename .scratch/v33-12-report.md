# v33-12 report — the counterpart's face, immediately left of their name (`muyc3jnt`)

**Sentinel:** `V33-12-INBOX-AVATAR-LEFT-OF-NAME-Q7M2`
**Status:** DONE
**Branch:** `inbox-avatar-q4n8` @ `/tmp/pd-wt/inbox-avatar-q4n8`
**Base:** the V33 batch HEAD · **Not pushed.**

---

## 1. Provenance — this slice was built before, and finished here

The committing work is `7b7fc76` ("the counterpart's face, immediately left of
their name"), written 09:34 on 2026-10-08 and **never merged and never
verified**. This session ran its gate, found it red in one place, and fixed
that place (§3). The design is the founder's own ruling (§10c).

## 2. What shipped

| Surface | Change |
|---|---|
| **Thread header** | `HostAvatar` immediately LEFT of the name, in BOTH branches (the playdate `<Link>` and the DM block). `data-testid="thread-header-avatar"`. |
| **Composer recipient** | the same `HostAvatar` (`size="sm"`) beside the recipient's name, above the textarea. `data-testid="composer-recipient-avatar"`. |
| **Primitive** | `HostAvatar` gained a `...rest` spread onto its own `<span>` so a caller can attach a testid WITHOUT editing behaviour. **Additive only** — no visual, no logic change. |

A `null` photo renders the primitive's **initial circle** (the placeholder),
never a broken image. A nameless counterpart renders nothing (the app's own
rule — a mystery `?` face is worse than none). **No per-bubble avatar. No
last-active/presence line.**

## 3. ⚠️ The defect the gate caught — an assertion that could never pass

The spec's AC5 ("no per-bubble avatars") asserted:

```ts
await expect(region.locator('span.rounded-full')).toHaveCount(0)
```

It failed live with **Received: 2**. Cause: **every message bubble's reaction
pill is itself a `span.rounded-full`** — `reactionButtonClasses` in
`src/lib/db.ts:5903` returns `'flex h-7 … rounded-full border px-2 …'`. Two
messages → two reaction pills → two `rounded-full` spans inside the region.

So the assertion counted **reaction controls, not faces**. It could never have
passed a page with real bubbles in it, and it would have gone red on the
*correct* implementation. This is the repo's named "acceptance test that cannot
fail / cannot pass" class, in the other direction: an assertion whose selector
does not name the thing it claims to test.

**The fix:** assert against the avatar testids the slice adds —
`region.getByTestId('thread-header-avatar')` and `-composer-recipient-avatar`
must each have count 0 inside the bubble region. That is the precise claim.

## 4. Acceptance — proven by GEOMETRY

`e2e/inbox-avatar.e2e.ts` (new, 2 passed on private port 4210):

- **AC1** avatar box is LEFT OF the name box (`avatar.right <= name.x + 1`) and
  vertically aligned (centres within half an avatar-height).
- **AC2** the composer shows the recipient's face beside their name, same rule.
- **AC3** a photo-less counterpart renders a `SPAN` (the initial circle), its
  text is the name's first letter uppercased, and there is no `img[alt=""]`.
- **AC4** no presence line: `inbox-activity-*` count 0 in the thread; no
  "active now"/"online" text anywhere.
- **AC5** no per-bubble avatar (asserted against the avatar testids, see §3).
- The bubble shape is intact: exactly one `own-message` and one `other-message`.

## 5. Gate

```
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only
  server.host change (another session), not this slice" npm run verify
```

- **exit 0** — build ✓ · typecheck:e2e ✓ · **92 files / 2709 tests** ✓ ·
  lint ✓ · a11y:focus PASS ✓ · **steering-lint PASS** ✓ · guards ✓
- `npm run guards` standalone: **GUARDS: PASS — all deterministic rules hold**
  (185 checks)
- e2e: `inbox-avatar.e2e.ts` **2 passed** on port 4210 (marker minted there);
  the setup reported `radius_miles=5`, confirming V35-C's migration is live.

## 6. Scope

```
src/components/DropInCard.tsx   +8/-…   the ...rest spread (additive)
src/pages/InboxPage.tsx         +68/-…  the two avatars + two testids
e2e/inbox-avatar.e2e.ts         +254     new — geometry proof
```

Nothing pushed. `origin/master` untouched.
