# `isNativeApp()` — diagnosis of the native-detection predicate

**READ-ONLY. Nothing was edited, committed, built, synced or deployed.** No `next dev`, no `next build`, no `cap sync`. `git status` at E3.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

**Answering the question that decides everything else first:**

> ## 🔴 B2 ANSWER: **NO.** WIDENING `isNativeApp()` WOULD NOT TOUCH A SINGLE ONE OF §40'S ELEVEN COMMERCE GATES.
> **`purchaseCtaAllowed()` never calls `isNativeApp()`.** It calls `Capacitor.isNativePlatform()` and `Capacitor.getPlatform()` **directly**, in its own file. **The fix is contained on the commerce axis. Part B3 does not apply.**

**And one finding the brief did not ask for, which bears directly on the premise:**

> ## ⚠️ THE COLD-START RACE IS WEAKER THAN N42 ASSUMES — READ FROM CAPACITOR'S OWN SOURCE.
> `window.webkit.messageHandlers.bridge` is registered on the `WKUserContentController` **in the delegation handler's `init()`**, and that controller is attached to the `WKWebViewConfiguration` **before the WebView is created and before `loadWebView()` issues the request**. **There is no window in which the page has loaded but the message handler is absent.** 🔴 **That does not clear `isNativeApp()` — it means the leading hypothesis in N42 is probably the wrong one, and three other explanations fit better.** See C3.

---

# PART A — EVERY CONSUMER OF `isNativeApp()`

## A1. `lib/native/device.ts`, in full

**READ, verbatim, all 97 lines:**

```ts
// Per-device operator config client (Package 3). Stable device_id (localStorage UUID, generated first
// launch — persists across cold-launch in the shell's WKWebView). All calls guard on isNativePlatform via
// the callers; the helpers themselves are browser-safe (localStorage/fetch) and simply unused on web.
import { Capacitor } from '@capacitor/core'

const DEVICE_ID_KEY = 'hg_device_id'

export interface VanRef { id: string; name: string }
export interface DeviceConfig {
  id: string
  truck_id: string
  van_id: string | null
  device_id: string
  push_token: string | null
  platform: string | null
  default_screen: 'dashboard' | 'kds'
  notify_enabled: boolean
}

/** True inside the native iOS shell. */
export function isNativeApp(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
}

/** Stable per-device id. Generated once and persisted (localStorage → survives cold-launch in the shell). */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = (crypto?.randomUUID?.() ?? `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`)
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export type DeviceConfigData = {
  device: DeviceConfig | null
  vans: VanRef[]
  vanHint: string | null
  truck: { id: string; name: string | null } | null
}
/**
 * Result of reading this device's config. DISCRIMINATED so callers can tell a FETCH FAILURE
 * (`{ ok: false }` → offer Retry) apart from a successful read that genuinely has no active vans
 * (`{ ok: true, vans: [] }` → "no active van"). Previously BOTH collapsed to `null`, so a transient
 * 429/500/network error masqueraded as "no active van" and trapped the operator behind a dead-end modal.
 */
export type DeviceConfigResult = ({ ok: true } & DeviceConfigData) | { ok: false }

/** Read this device's config + the truck's vans + single-van staff hint + the current truck (name). */
export async function fetchDeviceConfig(token: string): Promise<DeviceConfigResult> {
  try {
    const res = await fetch(`/api/native/bind-device?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(getDeviceId())}`)
    if (!res.ok) return { ok: false }
    const data = await res.json()
    return { ok: true, device: data.device ?? null, vans: data.vans ?? [], vanHint: data.vanHint ?? null, truck: data.truck ?? null }
  } catch { return { ok: false } }
}

/** Upsert this device's row (van / default screen / notify / push token). Truck-scoped server-side. */
export async function saveDeviceConfig(
  token: string,
  patch: { van_id?: string | null; default_screen?: 'dashboard' | 'kds'; notify_enabled?: boolean; push_token?: string | null },
): Promise<DeviceConfig | null> {
  try {
    const res = await fetch('/api/native/bind-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.device ?? null
  } catch { return null }
}

// ── Last-viewed screen (restart-to-last-screen) ──────────────────────────────────────────────────────
// Per-device memory of the screen the operator was last on (Dashboard vs KDS), so a cold-launch reopens
// THERE rather than the configured default. Stored in the same localStorage the device_id uses (survives
// cold-launch in the shell's WKWebView). The DB `van_devices.default_screen` remains the FALLBACK (used the
// first launch after setup, before any screen has been recorded).
const LAST_SCREEN_KEY = 'hg_last_screen'

/** Record the screen this device is currently on. Called by the dashboard/KDS pages (native). */
export function setLastScreen(screen: 'dashboard' | 'kds'): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(LAST_SCREEN_KEY, screen) } catch { /* storage disabled — fall back to default */ }
}

/** The screen this device was last on, or null if none recorded yet (→ caller falls back to default_screen). */
export function getLastScreen(): 'dashboard' | 'kds' | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(LAST_SCREEN_KEY)
    return v === 'kds' || v === 'dashboard' ? v : null
  } catch { return null }
}
```

**The predicate itself is one line:**

```ts
export function isNativeApp(): boolean {
  return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
}
```

🔴 **A CONJUNCTION WHOSE FIRST CLAUSE IS A `typeof` GUARD. Every uncertain path yields FALSE.** ⚠️ **The doc comment says *"True inside the native iOS shell"* — it is also true on native ANDROID**, because `isNativePlatform()` returns `getPlatform() !== 'web'`. **The comment is narrower than the code. Not a defect; a stale docstring.**

## A2. Every call site — **50 executable, in 27 files**

**READ.** Method: `isNativeApp\s*\(` across `app/`, `components/`, `lib/`, excluding `lib/native/device.ts` itself, then comment-only lines removed by hand. ⚠️ **Two matches were rejected as prose inside JSX/block comments — `app/manage/[token]/page.tsx:8972` and `components/shared/AppHeader.tsx:75`. Counting them would give 52.**

### Class 1 — NATIVE-ONLY UI (19 sites): render nothing, or return early, unless native

| Site | What it decides |
|---|---|
| `components/native/NotificationSettings.tsx:24` | skip the effect that loads notification prefs |
| `components/native/NotificationSettings.tsx:36` | `return null` — the whole card |
| `components/native/VanMenuChooser.tsx:23` | skip loading the van list |
| `components/native/VanMenuChooser.tsx:37` | `return null` — the van picker |
| `components/native/OperatorDeviceConfig.tsx:33` | skip the device-config fetch |
| `components/native/OperatorDeviceConfig.tsx:62` | `return null` — the setup gate |
| `components/native/OperatorDeviceConfig.tsx:162` | skip the settings load |
| `components/native/OperatorDeviceConfig.tsx:173` | `return null` — "This device" settings |
| `components/printing/PrintingSettings.tsx:57` | skip printer discovery |
| `components/printing/PrintingSettings.tsx:71` | `return null` — printing settings |
| `components/native/DevOfflineToggle.tsx:22`, `:27` | dev-only offline toggle (also `IS_PROD`-gated) |
| `components/native/DevOutboxInspector.tsx:22`, `:28` | dev-only outbox inspector (also `IS_PROD`-gated) |
| `components/dashboard/UserMenu.tsx:191` | the "📱 This device" menu item |
| `app/dashboard/[token]/kds/page.tsx:1121` | the KDS "This device" button |
| `components/native/OfflineBanner.tsx:82` | 🔴 skip the reachability subscription **and the outbox drain** |
| `components/native/OfflineBanner.tsx:108` | `return null` — the native offline banner |
| `app/manage/[token]/page.tsx:8983` | **INVERTED** — `{!isNativeApp() && …}` shows WhatsApp Auto-replies on web only |

### Class 2 — NAVIGATION (7 sites) — 🔴 **the class this report is about**

| Site | What it decides |
|---|---|
| `app/dashboard/[token]/page.tsx:1181` | 🔴 **`openKDS`: `router.push` (native) vs `window.open('_blank')` (web)** |
| `components/native/AppLink.tsx:33` | 🔴 intercept the click → `router.push`, or fall through to a plain `<a>` |
| `app/app/page.tsx:21` | cold-launch: `/app` continues natively, or redirects to `/dashboard` |
| `components/native/DashboardIndexNativeFallback.tsx:20` | `/app` vs `/login` from the dashboard index |
| `components/shared/BrandHomeLink.tsx:86` | wordmark renders `<span>` (native) or `<Link>` (web) — `mounted &&` two-pass |
| `app/(legal)/layout.tsx:55` | same, on the legal pages — `mounted &&` two-pass |
| `app/dashboard/[token]/page.tsx:2447` | access-denied screen: non-navigating `<span>` vs `<Link href="/">` |

### Class 3 — AUTH AND SESSION (5 sites)

| Site | What it decides |
|---|---|
| `app/login/page.tsx:31` | `getNativeSupabase()` (localStorage-backed) vs `createSupabaseBrowserClient()` (cookie/SSR) |
| `app/login/page.tsx:50` | after login, `router.push('/app')` vs the web onboarding-resume path |
| `lib/native/session.ts:31` | `hasNativeSession()` — returns **false** immediately on web |
| `lib/native/session.ts:37` | `getNativeAccessToken()` — returns **null** immediately on web |
| `lib/native/signOut.ts:20` | native sign-out + `router.replace` vs cookie sign-out + `window.location` |

### Class 4 — OFFLINE AND ORDER INTEGRITY (16 sites)

| Site | What it decides |
|---|---|
| `lib/native/orderGate.ts:214` | 🔴 **known-offline → queue to the outbox instead of posting** |
| `lib/native/orderGate.ts:224` | 🔴 **fetch threw → queue (native) vs return a failed result (web)** |
| `components/dashboard/AddOrderPanel.tsx:282` | seed the provisional-id sequence |
| `components/dashboard/AddOrderPanel.tsx:1228` | show the web-only "the order was NOT sent" toast |
| `lib/native/useOfflinePaymentOverlay.ts:47`, `:57`, `:64` | the offline payment overlay |
| `lib/native/useOfflineStatusOverlay.ts:36`, `:46`, `:54` | the offline status overlay |
| `lib/native/useOutboxConflicts.ts:92`, `:115` | conflict detection on replay |
| `lib/native/useOfflineAlert.ts:18` | the offline audio/alert |
| `app/dashboard/[token]/page.tsx:878` | start reachability polling and subscribe `isOffline` |
| `components/WebOfflineBanner.tsx:26`, `:66` | **INVERTED** — the WEB banner suppresses itself when native |

### Class 5 — DEVICE HOUSEKEEPING (3 sites)

| Site | What it decides |
|---|---|
| `app/dashboard/[token]/page.tsx:192` | `setLastScreen('dashboard')` + `configureStatusBar()` |
| `app/dashboard/[token]/kds/page.tsx:77` | `setLastScreen('kds')` |
| `components/native/AppLockGate.tsx:20` | whether the app-lock gate arms at all |

✅ **`lib/native/reachability.ts` DOES NOT CALL `isNativeApp()` — "not found" is the result.** It is *called* behind the gate at `app/dashboard/[token]/page.tsx:878`, but contains no check of its own.
✅ **`components/shared/AppHeader.tsx` no longer calls it either** — it delegates to `BrandHomeLink`, and its line 75 is a comment recording that it *used to*.

## A3. Failure direction at every site, both ways

| Class | Wrongly **FALSE** in the shell — TODAY | Wrongly **TRUE** on the web — TODAY |
|---|---|---|
| **1. Native-only UI** (19) | Device settings, printer settings, van picker, notification prefs and the native offline banner **all vanish from the iPad**. ⚠️ **`OfflineBanner:82` is the sharp one — the OUTBOX NEVER DRAINS**, so queued orders sit unsent with no banner to say so. WhatsApp Auto-replies (inverted) reappear in the app — a 2.1 regression, cosmetic. | Web operators see controls that call Capacitor plugins. Preferences/Network have web shims; **printing and notifications do not meaningfully work.** Confusing, not destructive. |
| **2. Navigation** (7) | 🔴 **`openKDS` takes `window.open('_blank')` → SAFARI EJECTION.** `AppLink` falls through to a plain `<a>` → hard navigation *(now caught by `allowNavigation` for same-tab links; **NOT** for `target="_blank"` ones)*. The wordmark becomes a live `<Link>` to the Village Foodie map. `/app` redirects to `/dashboard`, breaking cold-launch routing. | `AppLink` intercepts clicks a browser user expects to open a tab; the wordmark stops navigating; `/app` stops redirecting. **Annoying; nothing is lost.** |
| **3. Auth** (5) | 🔴 **Login writes a session to the wrong store.** `hasNativeSession()` → false, so `/app` sends the operator to `/login` **in a loop**, and `getNativeAccessToken()` → null means `/api/dashboard` gets no Bearer. **This is the worst FALSE direction in the app.** | The browser uses the localStorage Supabase client instead of the cookie/SSR one; ⚠️ **the server-side cookie guard in `proxy.ts` then has no cookie to read.** |
| **4. Offline/orders** (16) | 🔴 **The gate stops queueing. An order taken during an outage is LOST**, exactly as web behaves — and §11 records that web offline attempts are lost, not queued. Overlays and conflict detection all go dark. | 🔴 **A browser starts writing orders to an outbox.** ⚠️ **Not necessarily lost — `OfflineBanner` would flip true at the same instant and drain it, and `@capacitor/preferences` falls back to localStorage on web — but this is an entirely untested path in a browser, and localStorage is evictable in a way the iOS plist is not.** |
| **5. Housekeeping** (3) | Last-screen memory stops recording; the status bar is not configured; **the app lock never arms** — a security-relevant miss on a shared iPad. | Harmless: two localStorage writes and a no-op status-bar call. The app lock reads a pref a browser never set. |

🔴 **THE ASYMMETRY IS THE POINT. Wrongly-FALSE degrades or breaks: Safari ejection, a login loop, a lost order, an unarmed lock. Wrongly-TRUE is mostly cosmetic — with ONE exception, the outbox.** ✅ **And today wrongly-TRUE is UNREACHABLE**, because `Capacitor.isNativePlatform()` cannot be true without a native bridge. **C4 is about whether the proposal changes that.**

---

# PART B — 🔴 BLAST RADIUS: DOES COMMERCE SHARE THIS HELPER?

## B1. `purchaseCtaAllowed()`, quoted in full

**READ, `lib/commerce-policy.ts:39-46`:**

```ts
export function purchaseCtaAllowed(): boolean {
  // No Capacitor at all (server render, plain web build) → allowed.
  if (typeof Capacitor === 'undefined') return true
  // Browser, including the Capacitor web shim → allowed.
  if (!Capacitor.isNativePlatform()) return true
  // Native, but Android (or any future native platform) → allowed. Only iOS is restricted.
  return Capacitor.getPlatform() !== 'ios'
}
```

**Its only import (`lib/commerce-policy.ts:24`):**

```ts
import { Capacitor } from '@capacitor/core'
```

> ## 🔴 IT DOES NOT CALL `isNativeApp()`. THE EXACT LINES ARE `Capacitor.isNativePlatform()` AT `:43` AND `Capacitor.getPlatform()` AT `:45`.
> **`lib/commerce-policy.ts` contains no reference to `lib/native/device.ts` at all — "not found" is the result.** It reaches `@capacitor/core` directly, which is the same module `isNativeApp()` reaches, **but through its own call, not through the helper.**

⚠️ **AND THAT SEPARATION IS DELIBERATE, NOT INCIDENTAL.** Three call sites carry the identical comment, verbatim:

> *"⚠️ isNativeApp, NOT purchaseCtaAllowed. That is the 3.1.1 COMMERCE predicate; this is a 2.1 completeness question."*

— `components/shared/BrandHomeLink.tsx:14`, `components/shared/AppHeader.tsx:84`, `app/manage/[token]/page.tsx:8977`. **Someone has already had this exact thought and written it down three times.**

## B2. Would widening `isNativeApp()` change any of §40's eleven gates? — **NO**

**READ. All eleven consumers of `purchaseCtaAllowed()`, none of which touches `isNativeApp()`:**

| # | Site |
|---|---|
| 1 | `app/manage/[token]/page.tsx:426` — auto-select the Billing tab on trial |
| 2 | `app/manage/[token]/page.tsx:439` — the trial-reminder trigger effect |
| 3 | `app/manage/[token]/page.tsx:738` — the trial reminder itself |
| 4 | `app/manage/[token]/page.tsx:10185` |
| 5 | `app/manage/[token]/page.tsx:10551` |
| 6 | `app/manage/[token]/page.tsx:10560` |
| 7 | `app/manage/[token]/page.tsx:10593` |
| 8 | `app/manage/[token]/page.tsx:10623` |
| 9 | `app/manage/[token]/page.tsx:10653` |
| 10 | `app/manage/[token]/page.tsx:10717` — the upgrade modal |
| 11 | `components/FeatureGate.tsx:58` — the gated upgrade CTA |

✅ **Eleven, matching §40's own count exactly.** ✅ **Every one calls `purchaseCtaAllowed()`. Not one calls `isNativeApp()`.**

**The mechanical proof: `isNativeApp()` is exported from `lib/native/device.ts` and imported by 27 files (A2). `lib/commerce-policy.ts` is not one of them, and neither `app/manage/[token]/page.tsx`'s commerce gates nor `components/FeatureGate.tsx` route their commerce decision through it.**

⚠️ **ONE HONEST QUALIFIER.** `app/manage/[token]/page.tsx` imports **both** predicates (`:16` and `:58`) and uses each for its own question — commerce via `purchaseCtaAllowed()`, the WhatsApp hide via `isNativeApp()` at `:8983`. **A change to `isNativeApp()` would alter that ONE non-commerce gate on that page and nothing else.** ✅ **Its failure direction is "the WhatsApp section is hidden from a web operator" — a UI hide, not a revenue path.**

## B3. Does not apply

🔴 **B3 is conditional on B2 being YES. It is NO.** **No web operator could lose an upgrade CTA through this change, because no upgrade CTA asks this question.** **The fix, whatever form it takes, is contained on the commerce axis.**

⚠️ **What it is NOT contained on: the other four classes in A3.** **The blast radius is 50 sites across offline, auth, navigation and device config — it is simply not the commerce blast radius.**

---

# PART C — THE UA MARKER

## C1. Where `HatchGrabNativeApp` is appended

**READ, `capacitor.config.ts:66` (iOS) and `:74` (Android), with the comments that guard them:**

```ts
    // Marker appended to the WKWebView User-Agent so the server (proxy.ts) can tell native-app requests
    // from a normal browser on NAVIGATION requests (which carry no cookie and no Bearer). The proxy auth
    // guard defers to client-side native-session auth when it sees this; a real browser never has it, so
    // web is unaffected. Do NOT remove without updating proxy.ts's isNativeApp check.
    appendUserAgent: 'HatchGrabNativeApp',
```

```ts
    // MUST be byte-identical to ios.appendUserAgent above: proxy.ts's isNativeApp check substring-matches
    // this exact string to defer the cookie-blind auth guard for native navigations. Without it every
    // /dashboard and /manage navigation 307s to /login and the V8.7 login loop returns.
    // No contentInset / scrollEnabled here — both are WKWebView-specific with no Android counterpart.
    appendUserAgent: 'HatchGrabNativeApp',
```

✅ **BYTE-IDENTICAL — verified by comparison, not by eye:**

```
values found: ['HatchGrabNativeApp', 'HatchGrabNativeApp']
byte-identical: True
bytes: [b'HatchGrabNativeApp', b'HatchGrabNativeApp']
```

✅ **And in both BAKED artefacts**, line 16 (ios block) and line 20 (android block) of each:

```
ios/App/App/capacitor.config.json:16:      "appendUserAgent": "HatchGrabNativeApp"
ios/App/App/capacitor.config.json:20:      "appendUserAgent": "HatchGrabNativeApp"
android/app/src/main/assets/capacitor.config.json:16:      "appendUserAgent": "HatchGrabNativeApp"
android/app/src/main/assets/capacitor.config.json:20:      "appendUserAgent": "HatchGrabNativeApp"
```

## C2. How the server reads it — **two places, not one**

**READ, `proxy.ts:213`, with the comment above it:**

```ts
  // NATIVE APP (Capacitor iPad shell): its session lives in Preferences and is sent as a Bearer only on
  // explicit fetch()s — document/RSC NAVIGATION requests carry no cookie AND no Authorization header, so
  // `user` is always null here and this guard would 307-loop the app to /login (it logs in, gets a native
  // session, navigates, hits this cookie-blind guard again → loop). The webview stamps a UA marker
  // (capacitor.config ios.appendUserAgent) that a normal browser never has; when we see it, DEFER auth to
  // the page/client, which DOES check the native session (hasNativeSession) and sends the Bearer to
  // /api/dashboard. Web has no marker → this branch is skipped → web behaviour is byte-identical to before.
  const isNativeApp = (request.headers.get('user-agent') || '').includes('HatchGrabNativeApp')

  if (isProtected && !user && !isNativeApp) {
```

🔴 **A SECOND READER EXISTS AND THE BRIEF DID NOT MENTION IT. READ, `lib/audit/actor.ts:179`:**

```ts
export function resolveActorSource(req: NextRequest | Request, body: { expected_from?: unknown }): ActorSource {
  if (Array.isArray(body?.expected_from)) return 'offline_replay'
  if ((req.headers.get('user-agent') || '').includes('HatchGrabNativeApp')) return 'native'
  return 'web'
}
```

⚠️ **So the UA marker already decides what the AUDIT TRAIL says an action's source was.** **That matters for C4: the spoofing surface is not hypothetical and not new.**

## C3. Is the UA available synchronously on the first client frame, before the bridge?

**✅ READ — THE UA IS SET BEFORE THE WEBVIEW EXISTS. `CAPBridgeViewController.swift:130-136`:**

```swift
        if let appendUserAgent = instanceConfiguration.appendedUserAgentString {
            if let appName = webViewConfiguration.applicationNameForUserAgent {
                webViewConfiguration.applicationNameForUserAgent = "\(appName) \(appendUserAgent)"
            } else {
                webViewConfiguration.applicationNameForUserAgent = appendUserAgent
            }
        }
```

**This mutates the `WKWebViewConfiguration` inside the method that BUILDS it, before `WKWebView(frame:configuration:)` is called.** 🔴 **`navigator.userAgent` therefore carries the marker for the entire lifetime of the WebView, from the first byte of the first script. There is no window in which it is absent.** **This half of the proposal is sound.**

### ⚠️ BUT THE PREMISE IT RESTS ON DOES NOT SURVIVE READING THE OTHER HALF

**READ, `WebViewDelegationHandler.swift:18-24`:**

```swift
    private let handlerName = "bridge"

    override public init() {
        super.init()
        contentController.add(self, name: handlerName)
    }
```

**READ, `CAPBridgeViewController.swift:298`** — that same controller is attached to the config: `webConfig.userContentController = delegationHandler.contentController` — **and only afterwards does `loadWebView()` (`:167-180`) issue `webView?.load(URLRequest(url: url))`.**

**READ, how the JS side answers the question — `@capacitor/core/dist/index.cjs.js:32-52`:**

```js
const getPlatformId = (win) => {
    var _a, _b;
    if (win === null || win === void 0 ? void 0 : win.androidBridge) {
        return 'android';
    }
    else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
        return 'ios';
    }
    else {
        return 'web';
    }
};
…
    const isNativePlatform = () => getPlatform() !== 'web';
```

🔴 **`getPlatformId` IS EVALUATED FRESH ON EVERY CALL — the result is NOT cached at module load.** So even if `window.webkit.messageHandlers.bridge` appeared late, a *later* call would see it. **Combined with the registration order above: the message handler is installed on the content controller before the WebView is constructed, and the WebView is loaded after that. `window.webkit.messageHandlers.bridge` should be present from the first script.**

> ## ⚠️ CONCLUSION ON C3, STATED CAREFULLY.
> **The UA is available earlier than the bridge in principle — but on iOS the bridge does not appear to be late at all.** 🔴 **N42's leading hypothesis ("a cold-start race, `isNativeApp()` evaluating before the bridge is injected") is NOT SUPPORTED by Capacitor's source.** **INFERRED**, because I have not instrumented a device.

### Three explanations that fit the evidence better — all INFERRED

1. **SSR / the first hydration frame.** `Capacitor` is undefined on the server, so `isNativeApp()` is **false during server render and provably false on the first client frame for any component evaluated before mount.** 🔴 **This is not a race — it is a certainty, and it is why `BrandHomeLink` and the legal layout use a `mounted` two-pass at all.** ⚠️ **`openKDS` is inside an event handler, so it should not be exposed to this** — but any *render-time* decision is.
2. **An iframe.** `JSExport.swift:20, 107, 212` all inject with `forMainFrameOnly: true`. 🔴 **Inside any iframe, `window.webkit.messageHandlers.bridge` is absent and `isNativeApp()` is correctly false — while the operator is unmistakably "in the app".**
3. **A different WebView entirely.** An `SFSafariViewController`, or hatchgrab.com opened from Mail/Messages in another app's in-app browser, has no Capacitor bridge **and no UA marker either** — so it looks like a browser to both mechanisms, which is correct, but looks like "the app" to the operator holding the iPad.

**WHAT WOULD PROVE IT** — the instrumentation, not a theory:
- Record **at module scope in the client entry bundle**, on every cold launch: `navigator.userAgent`, `typeof window.Capacitor`, `!!window.webkit?.messageHandlers?.bridge`, `window.self !== window.top`, and `performance.now()`.
- Repeat the read at `DOMContentLoaded`, at React mount, and **at the moment "Kitchen screen" is tapped** — the value at TAP time is the one that decides the ejection, and nobody has ever captured it.
- 🔴 **Send it to the server, or persist it.** The ejection moves the operator to Safari, where any console log is gone.

## C4. 🔴 Could a WEB browser ever present that UA?

**Today the "wrongly true" direction is PROVABLY unreachable:** `Capacitor.isNativePlatform()` requires `window.webkit.messageHandlers.bridge` or `window.androidBridge` — **objects a page cannot fabricate for itself and a browser never creates.** A user *could* define `window.Capacitor` in a console, but they would be attacking their own session, not being wrongly detected.

**With the UA in the disjunction, every one of these paths becomes live:**

| Path | Reachable? | Assessment |
|---|---|---|
| **Desktop-browser UA override** (Safari *Develop → User Agent → Other*, Chrome DevTools device mode) | 🔴 **TRIVIAL** — one menu, no tooling | The realistic case. Anyone curious, any developer, any support session |
| **A browser extension** rewriting the UA | 🔴 EASY | Common; user may not remember installing it |
| **`curl` / scripts / headless browsers** with a set UA | 🔴 EASY | Already hits `proxy.ts:213` today |
| **Another app's WKWebView** with a matching `applicationNameForUserAgent` | Possible, deliberate | Requires someone to copy our exact string |
| **A corporate proxy / CDN** rewriting UA | Rare but real | Some security appliances normalise or annotate UA |
| **Our own future shells** (an Android TV build, a kiosk wrapper) | By design | Would inherit the marker and be *correctly* true |

> ## 🔴 THE HONEST STATEMENT
> **Today, "wrongly true on web" is UNREACHABLE. Under the disjunction it becomes REACHABLE BY A MENU ITEM.**
> **That is not a security hole** — the marker grants no authority: `proxy.ts` only *defers* auth to the client, which still needs a real session, and `getNativeAccessToken()` still returns null without one. **It is a CORRECTNESS surface.** A spoofed browser would take the native branch at all 50 sites: `AppLink` intercepting clicks, the app-lock arming against a pref that does not exist, **and the order gate queueing into an outbox in a browser.**
> ⚠️ **Mitigating, and it must be said: `proxy.ts:213` and `actor.ts:179` ALREADY trust this string.** A spoofed UA today already changes server-side auth handling and **already mislabels the audit trail as `'native'`. The proposal does not create the trust; it extends its reach from two server reads to fifty client decisions.**

---

# PART D — APPRAISAL. NOTHING IS IMPLEMENTED AND NOTHING IS RECOMMENDED.

## D1. Option 1 — widen `isNativeApp()` to the disjunction

**Shape:** `isNativeApp()` returns true if Capacitor says native **OR** `navigator.userAgent` contains `HatchGrabNativeApp`.

**Files touched: ONE — `lib/native/device.ts`.** **Blast radius: all 50 call sites, in one edit, with no per-site review.**

| For | Against |
|---|---|
| ✅ One file, one line; trivially revertible | 🔴 **50 sites change behaviour at once, across auth, offline and navigation** — the widest possible change for the narrowest possible symptom |
| ✅ Fixes the wrongly-FALSE direction **everywhere at once**, including the login loop and the lost-order case — which are worse than the ejection | 🔴 **Makes wrongly-TRUE reachable from a browser menu** (C4), converting an impossible failure into a merely unlikely one |
| ✅ The UA is available strictly earlier than the bridge (C3, READ) | ⚠️ **Fixes a race that the source says probably is not happening** (C3). If the real cause is an iframe or SSR, **the UA is equally absent in an iframe** — `navigator.userAgent` IS inherited by iframes, so it would in fact help there — but it does **NOT** help on SSR, where there is no `navigator` at all |
| ✅ Commerce is untouched (B2) | ⚠️ **Two predicates would then answer "am I native?" differently** — `purchaseCtaAllowed()` would still be Capacitor-only. §35's N8 pattern: **a third answer to a question that already has two** |
| | 🔴 **It cannot fix "Kitchen screen" if the cause is SSR/first-frame**, and `window.open` still ejects the moment the branch is taken **for any reason** |

**What could go wrong, concretely:** an operator debugging on a laptop with a spoofed UA takes an order during a wifi blip; the gate queues it to browser localStorage; they close the tab. ⚠️ **Whether that order survives is untested.**

## D2. Option 2 — leave `isNativeApp()` alone, harden `openKDS`

**READ, the code in question, `app/dashboard/[token]/page.tsx:1181-1187`:**

```tsx
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    if(isNativeApp()){
      const q=van?.id?`?van_id=${encodeURIComponent(van.id)}${van.name?`&van_name=${encodeURIComponent(van.name)}`:''}`:''
      router.push(`/dashboard/${token}/kds${q}`)
      return
    }
    window.open(van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds`,'_blank')
  }
```

**Shape:** narrow or remove the `window.open` branch — e.g. always `router.push`, or `router.push` unless something affirmatively establishes a browser.

| For | Against |
|---|---|
| ✅ **Touches exactly one function.** The other 49 sites keep their current behaviour and their current failure directions | 🔴 **THE WEB COST IS REAL AND IS THE FEATURE.** The comment at `:1176-1179` states the intent: *"WEB: unchanged — new tab (van's standalone `/kds/[kds_token]`, or the in-app KDS when the van has no `kds_token`)"* |
| ✅ Removes the App-Review-visible symptom without widening any trust surface | 🔴 **A second tab is how an operator watches the dashboard AND the kitchen screen at once — on a laptop, or on a second monitor at an event. `router.push` REPLACES the dashboard.** That is a functional loss for every web operator |
| ✅ No new spoofing path; C4 stays unreachable | 🔴 **The two branches are not equivalent: web opens the VAN's standalone `/kds/[kds_token]`, native opens the in-app `/dashboard/[token]/kds`. Collapsing them changes WHICH KDS opens, not just how** |
| | ⚠️ **It fixes ONE control.** Four other `target="_blank"` sites (`kds/page.tsx:1176`, three in `app/admin/page.tsx`) have the same shape and are untouched |

## D3. Option 3 — fix it at the native layer, where the actual bug is

**🔴 THIS OPTION EXISTS AND IS NOT OBVIOUS, SO IT IS STATED PLAINLY RATHER THAN OMITTED.**

**The Safari ejection for `window.open` comes from Capacitor's own `WKUIDelegate`. READ, `WebViewDelegationHandler.swift:328-333`:**

```swift
    open func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        return nil
    }
```

**There is NO host check. Any `window.open` — ours or a third party's — leaves for Safari.** **A native override could load same-host URLs into the main WebView instead and forward everything else to Capacitor unchanged.**

**And the mechanism to do it already exists in this repo.** `ios/App/App/HGBridgeViewController.swift` (391 lines) **already installs a forwarding proxy in the `navigationDelegate` slot**, with the two-method contract spelled out in its own header:

> *"⚠️ `responds(to:)` MUST be overridden alongside `forwardingTarget(for:)`. WKWebView asks `responds(to:)` before sending an optional protocol method; without the override it gets `false` and never sends the message, so `forwardingTarget(for:)` is never consulted and Capacitor's handler goes deaf."*

| For | Against |
|---|---|
| 🔴 **IT IS INDEPENDENT OF `isNativeApp()` ENTIRELY.** It holds even if the predicate is wrong, for the same reason `allowNavigation` does — **the failure mode that has actually been observed twice is "the web branch was taken", and this makes the web branch harmless** | 🔴 **NATIVE SWIFT ON THE SUBMISSION PATH.** It needs a rebuild and it is the hardest of the three to test |
| ✅ Covers **all five** `target="_blank"` sites at once, and anything added later | ⚠️ **The `uiDelegate` slot is Capacitor's; taking it wrongly breaks alerts, file pickers and JS dialogs.** The header's warning about the delegate going deaf applies verbatim |
| ✅ The proxy pattern, the retain rule and the `responds(to:)` trap are **already solved and documented in this file** | ⚠️ **It CHANGES what `window.open` means in the app** — an external `window.open` must still reach Safari, so the override needs its own host test, which is a **second** place encoding "is this our host" alongside `allowNavigation` |
| ✅ Nothing about web behaviour changes. Not one byte | ⚠️ Does nothing for the other four A3 classes — the login loop and the lost order stay exactly as they are |

### Option 3b — settle the predicate instead of widening it

**Compute nativeness ONCE after the bridge is known-ready and publish it as state**, rather than re-deriving it at 50 call sites at unpredictable moments. ⚠️ **It addresses the timing hypothesis directly and adds no spoofable input — but C3 says the timing hypothesis is probably wrong**, so this may be machinery against a cause that does not exist. **Stated for completeness.**

### Is there a better option than all of these? — **Not until C3's instrumentation exists.**

🔴 **All four options are being chosen between WITHOUT KNOWING WHY `isNativeApp()` RETURNED FALSE.** **N42 says "unreproduced"; C3 says the stated hypothesis does not survive reading the source.** ⚠️ **The instrumentation in C3 is not an option in this list — it is what would let you choose between them on evidence instead of plausibility.**

## D4. What would VERIFY each on a device

> ## ⚠️ THE STANDING PROBLEM: THE EJECTION HAS REPRODUCED ONCE, NEVER SINCE.
> 🔴 **"It did not happen" is NOT evidence for any of these.** A test that passes proves the fix did not break the working path; **it proves nothing about the broken one.** **Every plan below therefore needs a way to FORCE the failure, not wait for it.**

**Common prerequisite:** rebuild and reinstall — all four are compiled or bundled, and the shell loads production, so **no uncommitted web change is visible on the device.**

**Forcing the failure (needed by 1, 2 and 3):** temporarily make `openKDS` take its web branch unconditionally in a **local-simulator build** (`CAP_SERVER_URL=http://localhost:3000`), so the ejection happens on demand. 🔴 **That is a deliberate local-only change, reverted before any real build — it is not proposed as a shipped edit.**

| Option | What verifies it on a device |
|---|---|
| **1 — disjunction** | **(a)** With the failure forced, tap Kitchen screen: **PASS** = the KDS opens in-app. **(b)** Instrument per C3 and confirm the UA branch is what carried it — otherwise you have proved nothing about which clause fired. **(c)** 🔴 **Regression sweep across the other four classes**, because 50 sites moved: log in and out (auth), pull the wifi and take an order then reconnect (outbox), confirm the app lock still arms, confirm printing/notifications settings still appear. **(d)** On a laptop, spoof the UA and confirm the browser's behaviour is acceptable — **that is the new failure direction and it must be looked at, not assumed** |
| **2 — harden `openKDS`** | **(a)** With the failure forced, tap Kitchen screen: **PASS** = in-app, **FAILURE** = Safari. **(b)** 🔴 **On the WEB, in a browser: confirm what an operator loses.** Does the dashboard survive? Which KDS opened — the van's `/kds/[kds_token]` or the in-app one? **This is the test that decides whether the cost is acceptable, and it is not a device test at all** |
| **3 — native `createWebViewWith`** | **(a)** Failure forced → Kitchen screen stays in-app. **(b)** 🔴 **Confirm an EXTERNAL `window.open` still leaves for Safari** — a Tally form or a calendar link. If it opens inside the WebView, the host test is wrong and that is worse than the bug. **(c)** 🔴 **Exercise everything the `uiDelegate` owns: a JS `alert`/`confirm`, a file picker, a `<select>`. If any goes dead, the proxy is deaf** — the exact failure the file's header warns about. **(d)** Cold launch, background/foreground, and a forced WebView content-process crash, since this file's whole purpose is failure handling |
| **3b — settle the predicate** | **(a)** Instrument first: prove there IS a window where the answer changes. 🔴 **If instrumentation shows the bridge is present from frame one, this option has nothing to fix and should be dropped** |

## D5. No winner is recommended.

**Four options, their costs measured where measurable and marked INFERRED where not. The choice is yours.**

---

# PART E — INTEGRITY

## E1. Byte scan — every file opened, byte-level, never `grep`

**32 files read this session, all scanned for NUL and for control bytes below 0x09 plus 0x0B, 0x0C and 0x0E–0x1F:**

| File | Bytes | NUL | Control |
|---|---|---|---|
| `lib/native/device.ts` | 4,548 | 0 | none |
| `lib/commerce-policy.ts` | 3,519 | 0 | none |
| `proxy.ts` | 14,749 | 0 | none |
| `lib/audit/actor.ts` | 9,849 | 0 | none |
| `capacitor.config.ts` | 6,599 | 0 | none |
| `ios/App/App/capacitor.config.json` | 982 | 0 | none |
| `android/app/src/main/assets/capacitor.config.json` | 770 | 0 | none |
| `ios/App/App/HGBridgeViewController.swift` | 18,541 | 0 | none |
| `node_modules/@capacitor/ios/…/WebViewDelegationHandler.swift` | 15,335 | 0 | none |
| `node_modules/@capacitor/ios/…/CAPBridgeViewController.swift` | 16,487 | 0 | none |
| `node_modules/@capacitor/core/dist/index.cjs.js` | 24,451 | 0 | none |
| `app/app/page.tsx` | 4,145 | 0 | none |
| `app/login/page.tsx` | 7,502 | 0 | none |
| `app/manage/[token]/page.tsx` | 785,054 | 0 | none |
| `app/dashboard/[token]/page.tsx` | 373,446 | 0 | none |
| `app/dashboard/[token]/kds/page.tsx` | 91,554 | 0 | none |
| `app/(legal)/layout.tsx` | 8,431 | 0 | none |
| `lib/native/session.ts` | 2,891 | 0 | none |
| `lib/native/orderGate.ts` | 19,805 | 0 | none |
| `lib/native/signOut.ts` | 1,253 | 0 | none |
| `lib/native/outbox.ts` | 15,555 | 0 | none |
| `components/native/AppLockGate.tsx` | 5,745 | 0 | none |
| `components/native/DashboardIndexNativeFallback.tsx` | 1,336 | 0 | none |
| `components/native/AppLink.tsx` | 1,353 | 0 | none |
| `components/native/OfflineBanner.tsx` | 11,619 | 0 | none |
| `components/WebOfflineBanner.tsx` | 3,682 | 0 | none |
| `components/dashboard/UserMenu.tsx` | 16,239 | 0 | none |
| `components/dashboard/AddOrderPanel.tsx` | 168,993 | 0 | none |
| `components/shared/BrandHomeLink.tsx` | 6,688 | 0 | none |
| `components/shared/AppHeader.tsx` | 10,238 | 0 | none |
| `components/FeatureGate.tsx` | 2,700 | 0 | none |
| `docs/reference-manual.md` | 1,496,028 | 0 | none |

✅ **FILES WITH NUL OR CONTROL BYTES: NONE. All 32 clean.**

## E2. Byte scan of this report — separate pass, AFTER writing

```
docs/native-detection-report.md   43,720 bytes
  NUL (0x00)                                     : 0
  control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F : none
  distinct non-ASCII classes                     : 12
  U+26A0 = 26, U+FE0F = 26                         : PAIRED
```

✅ **Clean.** Byte-level, never `grep`, run as its own pass after the file was written.

## E3. `git status`, pasted

```
 M capacitor.config.ts
 M docs/reference-manual.md
 M lib/payments/refund.ts
?? docs/allownavigation-report.md
?? docs/manual-audit-report.md
?? docs/manual-update-v11-18-report.md
?? docs/native-detection-report.md
```

🔴 **EVERY ENTRY EXCEPT THIS REPORT PREDATES THIS TASK.** `capacitor.config.ts` and `lib/payments/refund.ts` are the previous turn's two edits; `docs/reference-manual.md` is the V11.18 update from the turn before that; the three other untracked files are earlier reports. ✅ **This diagnosis changed nothing.**

---

# PROVENANCE

**READ** — `lib/native/device.ts` and `lib/commerce-policy.ts` in full · `proxy.ts:200-220` · `lib/audit/actor.ts:170-181` · `capacitor.config.ts:60-76` and both baked JSONs · `WebViewDelegationHandler.swift:14-24, 96-119, 328-333` · `CAPBridgeViewController.swift:120-140, 167-180, 298` · `JSExport.swift:20, 107, 212` · `@capacitor/core/dist/index.cjs.js:32-52, 200-202` · `HGBridgeViewController.swift` header and `:52-72, 156-169` · all 50 call sites enumerated mechanically, with 14 of them read in context · all 11 `purchaseCtaAllowed()` call sites · the byte-identity comparison · the 32-file byte scan · `git status`.

**INFERRED** — that the bridge's presence from the first frame rules out the cold-start race (the registration ORDER is read; the runtime timing is not observed); that SSR, iframes and foreign WebViews are better-fitting explanations; that a `.allow` policy decision leads to `createWebViewWith`; that the option costs in D1–D3 are as described.

**NOT FOUND, stated plainly** — `lib/native/reachability.ts` contains **no** `isNativeApp()` call · `lib/commerce-policy.ts` contains **no** reference to `lib/native/device.ts` · **no** call site was found where a commerce gate consults `isNativeApp()`.

**NOT VERIFIED** — 🔴 **nothing in this report has been observed on a device.** The ejection has reproduced **once**, and the value `isNativeApp()` returned at that moment was never captured. **Every option in Part D is being weighed against a cause that is still inferred.**
