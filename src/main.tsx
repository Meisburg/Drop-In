import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// V8 ticket 08: the beforeinstallprompt event can fire before any component
// mounts, so the listener is registered here — the /profile Notifications
// section's "Add to Home Screen" button fires the captured event later.
//
// REGISTERING IS NOT INTERCEPTING (fix round, finding H): this listener does
// NOT preventDefault on a public page. It only turns the browser's banner into
// a deferred prompt once the shell has reported an authed session
// (`setInstallCaptureEnabled`, called from App.tsx) — because the only install
// button in the app is behind auth, so intercepting the event for a signed-out
// visitor on a share link would suppress the browser's own affordance and put
// nothing in its place.
import { captureInstallPrompt } from './lib/pushClient'

captureInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
