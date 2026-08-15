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
// The ONE host the shell is already loading, derived from the line above so it can never drift from
// server.url. Production bakes 'www.hatchgrab.com'; a local sync bakes 'localhost'. See allowNavigation.
const CAP_SERVER_HOST = new URL(CAP_SERVER_BASE).hostname

const config: CapacitorConfig = {
  appId: 'com.hatchgrab.app',
  appName: 'HatchGrab',
  webDir: 'out',
  server: {
    url: `${CAP_SERVER_BASE}/app`,
    cleartext: IS_LOCAL_HTTP,   // http (localhost) needs cleartext; https production stays false
    // ── HARD NAVIGATIONS MUST STAY IN THE WEBVIEW ────────────────────────────────────────────────
    // WITHOUT THIS, EVERY TOP-LEVEL NAVIGATION TO A SIBLING PATH IS HANDED TO SAFARI. Capacitor's iOS
    // policy (WebViewDelegationHandler.decidePolicyFor) decides "is this our app?" with a STRING PREFIX
    // match on the full serverURL INCLUDING ITS PATH:
    //     navURL.absoluteString.starts(with: bridge.config.serverURL.absoluteString)
    // Because `url` above ends in /app, https://www.hatchgrab.com/dashboard/<token> does NOT start with
    // https://www.hatchgrab.com/app, so the bridge cancels the load and calls UIApplication.shared.open
    // — the operator lands in Safari, signed out, on the same origin. THE PATH IS WHAT DAMNS IT.
    // allowNavigation is checked BEFORE that prefix test and matches on HOSTNAME ONLY, so one entry
    // covers every path on this host. (Android never had the bug: Bridge.launchIntent compares host +
    // scheme, not the path. This entry is a no-op there, and is shared config rather than ios-only so the
    // two shells cannot diverge.)
    // ONE EXACT HOST, NO WILDCARD: CAPInstanceConfiguration.doesHost splits both sides on '.' and requires
    // an EQUAL SEGMENT COUNT, so 'www.hatchgrab.com' matches that host and nothing else — not the apex
    // hatchgrab.com, not any other subdomain, and no third-party host. Stripe, Tally and every external
    // link still leave for Safari exactly as before, which is what they should do.
    // NOTE: router.push was NEVER affected — a soft navigation creates no navigationAction and never
    // reaches this policy. That is why some controls worked and others did not.
    // DO NOT "FIX" THE PREFIX MATCH BY DROPPING /app FROM `url` ABOVE: /app is the cold-launch route, and
    // / is the Village Foodie consumer map — a different product with no way back.
    allowNavigation: [CAP_SERVER_HOST],
  },
  ios: {
    // 'never' = don't let the OS auto-inset the scroll view for safe areas; the WEB layer owns the inset
    // instead (viewport-fit=cover + env(safe-area-inset-top) padding on AppHeader), so the dark header
    // extends into the status-bar strip and no page content shows above it. ('always' double-insets against
    // the CSS env padding and let content bleed into the top inset once scroll was enabled.)
    contentInset: 'never',
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
  android: {
    backgroundColor: '#1C1C1E',
    // MUST be byte-identical to ios.appendUserAgent above: proxy.ts's isNativeApp check substring-matches
    // this exact string to defer the cookie-blind auth guard for native navigations. Without it every
    // /dashboard and /manage navigation 307s to /login and the V8.7 login loop returns.
    // No contentInset / scrollEnabled here — both are WKWebView-specific with no Android counterpart.
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
