# Brief — the permission dialog is eating the location timeout (2d-ii)

## The finding (measured, not theorised)

Slice 2d made "Use my location" work, and while measuring it the builder found
this:

**`GEOLOCATION_TIMEOUT_MS` (10 000 ms) covers the whole `getCurrentPosition`
call — INCLUDING the OS permission dialog.** Measured on the emulator: the
request died at exactly `ms=10000` with the dialog **still open and unanswered**,
while a cold precise fix afterwards takes **~4.4 s**.

So a **first-time parent** — the only one who sees the dialog at all — who takes
more than about five seconds to read *"Allow Drop In to access this device's
location?"* and choose Precise/Approximate is told:

> *"We couldn't get your location just now. Try again, or type your address."*

**after they allowed**, and must tap again. The first-run path is the broken one,
and it is the one the feature was built for.

## What to fix

Make the first attempt survive a parent who reads the dialog at human speed,
**without** making a genuine no-signal failure wait longer than it does today.

The shape the orchestrator recommends, but you decide:

- **Retry once on `TIMEOUT`.** The first call is special — it may open a dialog —
  and by the time a retry starts the parent has usually answered, so the retry is
  a clean attempt with today's budget. This buys the dialog case a second window
  without lengthening the common failure.
- ⚠️ **Do NOT simply raise the constant** unless you can say why a genuine
  no-signal case deserves to hang longer. A blanket increase trades one bad
  experience for another.
- **Consider the taxonomy.** The grounding (`research/native-apps/2026-10-06-capacitor-android-geolocation.md`)
  records that the code currently reads `error.code` only for `PERMISSION_DENIED`
  and **throws away `TIMEOUT` (code 3)**, so a timeout is indistinguishable from
  no-signal and GPS-off. If distinguishing it is cheap, do it and give it honest
  copy; if it opens a wider refactor, leave it and say so.

## Acceptance criteria

1. With the permission dialog left open for longer than the current budget, the
   parent still receives a position after answering — **observed on a device**,
   not reasoned about. Recreate the measured failure first so the fix has a
   before/after.
2. A genuine failure still returns within a comparable time to today; state the
   worst case in your report.
3. `npm run verify` exit 0.
4. No behaviour change to the web path.

## 🚨 ALSO DUE: the real-Pixel verification that 2d could not do

**Slice 2d's five acceptance criteria were measured on a `Pixel_9_Pro` AVD, NOT
the founder's hardware — no physical phone was attached.** That half is UNPROVEN,
including whether that device's WebView carries Chromium's approximate/precise
guard (WebView updates independently of the OS).

**Check `~/Android/Sdk/platform-tools/adb devices` FIRST.** If a physical phone is
attached, re-run 2d's device criteria on it and report the results — in
particular, tap **Use my location** and choose **PRECISE**, and report whether you
get a position or `unavailable`. If no phone is attached, say so plainly and do
not substitute the emulator for it; the emulator result is already recorded and
re-running it proves nothing new.

- Install with **`assembleRelease`** (upload-key signed). A **debug** build would
  break the App Links verification already proven on that device.
- ⚠️ A human may be holding the phone. Verify the foreground is OUR app before
  every tap, and abandon automated interaction the moment the foreground is
  something we do not own.

## ⚠️ COLLISION WARNING — another session is ACTIVE in this workspace

It has uncommitted work in `.gitignore`, `index.html` (an impeccable design-tool
injection), `src/index.css`, `src/pages/FeedPage.tsx`, and the V31 locate-button
animation in `src/components/LocationModal.tsx` (~lines 349+). **Do NOT revert,
reformat, or "tidy" any of it; never `git stash`, never `git checkout -- <file>`,
never `git add -A`, and do NOT commit** — the orchestrator stages by hunk. Your
edits to `LocationModal.tsx`, if any, belong around **lines 6 and 196–219**. Back
up byte-for-byte before mutating and restore from YOUR backup, never from git.

## Verification command

`npm run verify` (exit code + counts), plus your focused sibling tests, plus the
device sequence above. **Never a bare `npx playwright test`** — it writes to
production.
