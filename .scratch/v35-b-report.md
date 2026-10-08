# v35-B report — the profile's interests as emoji + text bubbles (`muzjx0we`)

SENTINEL: V35-B-INTERESTS-EMOJI-H8W2
Status: DONE
Branch: `interests-emoji-h8w2` @ `/tmp/pd-wt/interests-emoji-h8w2`
Base: `03a9f9d`

---

## 1. The founder's annotation — fetched, not paraphrased

The agentation collection server **was up** on `:4747`, so the annotation was
pulled rather than reconstructed from the brief's gist:

```bash
curl -s http://localhost:4747/pending | python3 -c "…filter id startswith muzjx0we…"
```

> **`muzjx0we-wnkwjy`** · `http://localhost:5173/profile`
> element `.mx-auto > .flex > .flex > .mt-3` · `nearbyText: ×Display name@Jon
> MeisburgInterests` · `sourceFile: src/pages/ProfilePage.tsx:1226:9`
>
> *"Okay, under interests, I would like a bubble with a lot of different
> different categories that are represented by text plus a corresponding emoji.
> this is what the user likes...for example, if they're a book lover, it should
> say 'Book Lover 📕' in a pill ui. These categories will just let you know what
> the person likes, what their interests are. And I think this would make you
> understand what the other parents that are coming to a drop-in are into and
> then if you see them at a drop-in you have like something to connect on like if
> you're both into the same TV show or whatever. I think it makes them more
> relatable and less scary if you want to meet up with them and talk to them."*

The annotation's `sourceFile` anchor is approximate (it lands on the identity
card); its `nearbyText` names **Interests**, and the interests render is
`ProfileView.tsx`'s account-level block. That block is what this slice changes.

## 2. What the data actually is

`profiles.interests` is **one free-text string** (`types.ts:54`, migration 0022,
`INTERESTS_MAX_LENGTH = 200`) — not an array of categories. So "a bubble per
category" begins with deciding what a category is:

- `src/lib/interestBubbles.ts` — `interestBubbles(text)` splits on the
  separators a parent actually types (`, ; / &` "and", newline), preserves their
  order, keeps duplicates, and maps each part through `emojiForInterest`.
- `emojiForInterest(text)` — two-lane match: whole normalised phrase first
  ("book lover" → 📕), then a **whole-word** keyword scan ("sci-fi books" → 📕).
- Unknown → `null`. The render omits the glyph and keeps the text.

`ProfileView.tsx`'s block becomes a wrapping `<ul>` of `<li>` pills; the gate
(`showsInterests`) and the block's position are unchanged.

## 3. ⚠️ The defect the sibling test names

**An unknown interest silently getting a wrong or random emoji.**

Two ways it happens, both mutation-proved red against the shipped test:

| Mutation | Result |
|---|---|
| `return keyword === undefined ? '✨' : keyword[1]` (a default glyph) | **3 tests fail** — `THE DEFECT: an unknown category gets NO emoji…`, the substring leg, and the text-keeps leg |
| `normalized.includes(phrase)` instead of a whole-word `Set` match | **1 test fails** — the substring leg |

The second mutation is the subtle one: a substring scan dresses `cartwheels` in
🚗 and `heartbeat` in 🎨, and the page looks confident and is wrong. The test's
`an unknown category is not silently matched by a SUBSTRING of a known one` leg
is what catches it.

**Browser-layer mutation, same defect.** Adding the default glyph and rebuilding
made the e2e leg fail on the rendered DOM:
`expect(getByTestId('interest-bubble-emoji')).toHaveCount(0)` → **Expected 0,
Received 2**. Restored; both legs green again.

## 4. Acceptance

| # | Criterion | Evidence |
|---|---|---|
| a | 3 interests → 3 bubbles, each with its text | e2e `toHaveCount(3)` + `toContainText` per bubble |
| b | a known interest gets its mapped emoji | asserted against `emojiForInterest(...)` imported from the seam — a second copy of "☕" would keep passing if the map changed meaning |
| c | an unknown interest → text, NO emoji | its own testid assertion + a whole profile whose interests are ALL unknown (2 bubbles, 0 emoji nodes) |
| d | 390px, no overflow | `scrollWidth <= clientWidth + 1` (**measured delta 0**), plus each bubble's right edge ≤ 391 |
| e | stable order, no reshuffle | sequence compared to `interestBubbles(SEEDED)`, and re-asserted across a **reload** |
| — | labels, not controls | 0 `button`/`a`/`input`/`[aria-pressed]` in the row; `tagName === 'LI'` |

**Rendered at 390px** (`/tmp/pd-wt/ie-390.png`): `📕 Book Lover · ☕ Coffee ·
🥾 Hiking · 📺 TV shows · Competitive Napping` — the last one carries **no
emoji** and keeps its words. Five bubbles, wrap, overflow 0.

## 5. Scope — no new read, no other surface

- **No new read or fetch.** The component reads `profile.interests`, the same
  string the sentence printed. No query, no RPC, no Overpass.
- **`git diff`** = `ProfileView.tsx` + the new `lib/` pair + the new spec:
  ```
  src/components/ProfileView.tsx    |  the interests block becomes a pill row
  src/lib/interestBubbles.ts        |  new — the split, the map, the unknown rule
  src/lib/interestBubbles.test.ts   |  new — 12 tests, the defect named
  e2e/profile-interests.e2e.ts      |  new — 3 tests
  ```
- ⚠️ **The PER-PARENT `Interests:` line is deliberately untouched** —
  `ProfileView.tsx:687-694` (`parent-interests`, the V32-8 surface on
  `parent_cards.interests`). It is a different column on a different surface, and
  `e2e/account-links.e2e.ts` pins its exact `Interests: <text>` string. Changing
  it would be scope creep and would break that spec. **Verified still passing**
  (`account-links.e2e.ts --grep interests` → 2 passed).

## 6. Gate

```
ALLOW_CONFIG_CHANGE="vite.config.ts: the PHONE LANE's unstaged dev-only
  server.host change (another session), not this slice" npm run verify
→ exit 1, and ONLY on steering-lint
```
- `build` ✓ · `typecheck:e2e` ✓
- `test` ✓ **93 files / 2721 tests** (was 92 / 2709; **+12**, all new)
- `lint` ✓ 88 warnings, **0 errors**
- `a11y:focus` ✓ PASS
- `steering-lint` ✗ — **only** the five external `docs/agents/*` pointers
  (`builder-routing`, `compute-split`, `fleet-capacity`, `lane-health`,
  `parallel-development`), which are another lane's and which the brief
  explicitly allows to be red. Nothing of this slice's is named.
- `guards` ✓ **GUARDS: PASS — all deterministic rules hold** (exit 0)

`verify` chains with `&&`, so it stops at steering-lint; `npm run guards` was
run separately, as the brief requires, and passes.

## 7. e2e — private port **4215** (marker minted there)

| Spec | Result |
|---|---|
| `profile-interests.e2e.ts` (new) | **4 passed** (setup + 3) |
| `profile.e2e.ts` | **passed** |
| `account-links.e2e.ts --grep interests` (the surface I did NOT touch) | **2 passed** |

Nothing pushed. Branch `interests-emoji-h8w2`.

## 8. A trap worth recording (spec-writing, not product)

The first spec run failed `profile-interests` visible **on a page that was
behaving correctly**: the interests field autosaves on a **debounce**, so
clicking Done immediately after `fill` closed the editor before the write fired.
The seed helper now waits the debounce out and then **asserts the write landed**
on the read view instead of assuming it. A second self-inflicted failure was
asserting the joined string `"📕 Book Lover"` against `innerText`, which puts a
newline between the emoji span and the text span — the assertion now compares the
whitespace-collapsed SEQUENCE, which is what acceptance (e) means.
