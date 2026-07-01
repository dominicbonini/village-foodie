import { CapacitorConfig } from '@capacitor/cli'

// ── Server base — PRODUCTION IS THE DEFAULT (never ships a localhost URL) ─────────────────────────────
// The shell opens at the native LANDING (/app), which checks the persistent session and routes to this
// device's remembered truck/van/screen (or /login). Cold-launch routing lives in /app/page.tsx.
//
// LOCAL SIMULATOR TESTING (temporary — to test UNDEPLOYED code against your dev server):
//     CAP_SERVER_URL=http://localhost:3000 npx cap sync ios      # bakes localhost + cleartext, then rebuild
// REVERT to production (do this before any real build/deploy — a plain sync restores it):
//     npx cap sync ios                                           # CAP_SERVER_URL unset → https://www.hatchgrab.com
// Because the DEFAULT is production, the source can never bake a localhost URL by accident; the only baked
// artifact is ios/App/App/capacitor.config.json, regenerated on every `cap sync`.
const CAP_SERVER_BASE = process.env.CAP_SERVER_URL || 'https://www.hatchgrab.com'
const IS_LOCAL_HTTP = CAP_SERVER_BASE.startsWith('http://')

const config: CapacitorConfig = {
  appId: 'com.hatchgrab.app',
  appName: 'HatchGrab',
  webDir: 'out',
  server: {
    url: `${CAP_SERVER_BASE}/app`,
    cleartext: IS_LOCAL_HTTP,   // http (localhost) needs cleartext; https production stays false
  },
  ios: {
    contentInset: 'always',
    backgroundColor: '#1C1C1E',
    // MUST stay true. `false` (the original scaffold default) disables the WKWebView's scrollView, which
    // kills body/window scroll — so the natural-flow `min-h-screen` pages (Dashboard, Manage, Admin) can't
    // scroll and content below the fold is unreachable in the app (KDS is fine — it's a fixed flex-col with
    // its own inner min-h-0 + overflow-y-auto region). Web is unaffected either way (this is an iOS shell
    // setting). If this reintroduces rubber-band/overscroll on the fixed layouts, the alternative is a
    // per-page structural fix (cap those 3 pages to h-dvh flex-col + inner overflow-y-auto, mirroring KDS).
    scrollEnabled: true,
    // Marker appended to the WKWebView User-Agent so the server (proxy.ts) can tell native-app requests
    // from a normal browser on NAVIGATION requests (which carry no cookie and no Bearer). The proxy auth
    // guard defers to client-side native-session auth when it sees this; a real browser never has it, so
    // web is unaffected. Do NOT remove without updating proxy.ts's isNativeApp check.
    appendUserAgent: 'HatchGrabNativeApp',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#1C1C1E',
      showSpinner: false,
      launchAutoHide: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#F5A623',
      sound: 'beep.wav',
    },
    // CapacitorHttp MUST stay OFF for this remote-URL Next.js shell: enabling it patches the webview's
    // fetch/XHR to route through native networking, which breaks RSC payloads, API fetches, and Realtime
    // (CapacitorUrlRequestError 0 / "Failed to fetch RSC payload"). The webview handles its own requests
    // like a browser. No app code calls CapacitorHttp — it was only the global patch.
    CapacitorHttp: {
      enabled: false,
    },
  },
}

export default config
