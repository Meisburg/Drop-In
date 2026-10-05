import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native shell's configuration (`.scratch/native-apps/plan.md` slice 1).
 *
 * ⚠️ `webDir: 'dist'` AND NO `server.url` IS THE WHOLE POINT — it is the
 * anti-4.2 decision recorded in `docs/handoff-native-apps.md` §6.1. A shell that
 * loads a live URL is the classic "repackaged website" tell; bundled assets make
 * it a real app that paints with the device in airplane mode, and the Capacitor
 * config reference scopes `server.url` to live reload and calls it "not intended
 * for use in production". Do not add one to make local iteration easier.
 *
 * ⚠️ `appId` IS EFFECTIVELY PERMANENT once the first build is uploaded: it is
 * the Android `applicationId` and the iOS bundle id, and neither can change
 * after a release. `app.dropin.playdate` is this session's choice, NOT a founder
 * decision — it is free to change until the first Play upload and impossible
 * afterwards. Recorded in `.scratch/native-apps/plan.md` as open.
 */
const config: CapacitorConfig = {
  appId: 'app.dropin.playdate',
  appName: 'Drop In',
  webDir: 'dist',
  android: {
    // The web layer is served from https://localhost inside the shell, so the
    // browser-origin hazards in the handoff's §4 (OAuth redirectTo, password
    // reset, share URLs, email base URL) all point at an origin that does not
    // exist on the public web. That is slice 1's follow-up, not a config key.
    allowMixedContent: false,
  },
}

export default config
