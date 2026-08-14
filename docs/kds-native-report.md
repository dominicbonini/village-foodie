# Is the KDS reachable inside the native iPad shell?

Date: 14 August 2026
**READ-ONLY DIAGNOSIS. No edits, no commits, no builds, no `cap sync`, no deploys. Nothing proposed.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# 🔴 THE ANSWER — YOUR HYPOTHESIS IS REFUTED, AND THE TRAP WAS ALREADY FIXED

**The "Kitchen screen" control is NOT a `<Link>`, NOT an `<a>`, and carries NO `target="_blank"`.** It is
a `<button onClick={handleOpenKDS}>`, and `openKDS` **already branches on `isNativeApp()`**:

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
**READ**, `app/dashboard/[token]/page.tsx:1152-1159`.

🔴 **THE EXTERNAL-LINK GLYPH YOU SAW IS DECORATIVE SVG AND NOTHING ELSE.** It is an inline
`<svg>` path drawn beside the label — **it does not set `target`, and the button has no `href` to set it
on.** Your inference from the icon was reasonable and the icon is misleading, **but the code underneath
does the right thing.**

⚠️ **AND `window.open` REALLY WOULD EJECT TO SAFARI — that half of your reasoning is PROVEN, not
inferred.** Capacitor's own handler, `WebViewDelegationHandler.swift:328-333`:
```swift
    open func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        return nil
    }
```
**`UIApplication.shared.open` is the system open — it launches Safari.** So the native branch is not
belt-and-braces; **it is the only thing standing between an operator and being thrown out of the app.**

**Verdict: (a) — the KDS is native-ready AND reachable. It is not missing from the shell, and it is not
mis-linked.** See Part D for what that leaves.

---

# PART A — HOW IS THE KDS REACHED?

## A1. The control, quoted in full — `app/dashboard/[token]/page.tsx:2742-2745`

```tsx
              <button onClick={handleOpenKDS} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-500 hover:text-white transition-colors whitespace-nowrap">
                Kitchen screen
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </button>
```

| Question | Answer |
|---|---|
| `<Link>`? | 🔴 **NO** |
| `<a>`? | 🔴 **NO** |
| `window.open()`? | ⚠️ **YES — but only on the WEB branch** (`:1158`) |
| `target="_blank"`? | 🔴 **NOT FOUND on the element.** It has no `href` and no `target` attribute at all |
| `rel`? | 🔴 **NOT FOUND** |
| Programmatic navigation? | ✅ **YES — `router.push()` when `isNativeApp()`** |

**And the handler it calls, `:1161-1165`:**
```tsx
  const handleOpenKDS=()=>{
    if(vans.length===1){openKDS(vans[0]);return}
    if(vans.length===0){openKDS();return}
    setShowKDSPicker(true)
  }
```
**Multi-van trucks get a picker modal** (`:4261-4276`), whose buttons call the same `openKDS(van)` — **so
every path through the picker inherits the native branch too.**

⚠️ **The comment above `openKDS` already names the exact failure you suspected, `:1148-1151`:**
> *"NATIVE: soft-route to the in-app KDS … so it stays in the webview — `window.open('_blank')` escapes to
> Safari / no-ops in WKWebView."*

## A2. What that does inside a WKWebView

| Branch | Behaviour | Provenance |
|---|---|---|
| **Native** — `router.push('/dashboard/[token]/kds')` | ✅ **Client-side soft navigation. Stays in the WebView.** No document load, no new window | **READ** |
| **Web** — `window.open(…, '_blank')` | ✅ new tab, unchanged | **READ** |
| **If the native branch did not exist** | 🔴 **`UIApplication.shared.open(url)` → Safari, with no way back** | **READ from Capacitor's Swift, not inferred** |

**`allowNavigation`: 🔴 NOT FOUND.** Neither `capacitor.config.ts` nor the baked
`ios/App/App/capacitor.config.json` sets it, and there is no
`limitsNavigationsToAppBoundDomains` either.

**A shell-level new-window handler: 🔴 NOT FOUND.** `HGBridgeViewController.swift` proxies
`didFailProvisionalNavigation`, `didFail`, `didFinish` and `webViewWebContentProcessDidTerminate` —
**it does not implement `createWebViewWith`**, so Capacitor's default (open in Safari) stands.

## A3. Every other route into the KDS — **five, all READ**

| # | Route | Code |
|---|---|---|
| 1 | **The header button** (A1) | `page.tsx:2742` |
| 2 | **UserMenu → "Kitchen screen"** | `components/dashboard/UserMenu.tsx:169-177` — `onClick={() => { onOpenKDS?.(); … }}`, **the same `openKDS` passed down**, so it inherits the native branch |
| 3 | 🔴 **COLD LAUNCH** | `app/app/page.tsx:52-53` — see C2. **This is the route that needs no dashboard at all** |
| 4 | **Direct URL** `/dashboard/[token]/kds` | the page itself; a query string carries `van_id`/`van_name`/`pin` |
| 5 | **`/kds/[kds_token]`** — the van's standalone token URL | `app/kds/[kds_token]/page.tsx:33`, a **server redirect** into route 4 |

**Deep link (custom scheme / universal link): 🔴 NOT FOUND.** `AppDelegate.swift` forwards
`application(_:open:)` and `continue userActivity` to `ApplicationDelegateProxy`, but **nothing in the
app registers a URL scheme or an associated domain**, so there is no deep link to the KDS.

⚠️ **Route 5 is web-shaped and worth flagging separately.** `app/kds/[kds_token]/page.tsx` is a **server
component** that resolves the van and then `redirect()`s:
```tsx
  if (!van || !van.active) redirect('/login')
  …
  redirect(
    `/dashboard/${truck.dashboard_token}/kds?van_id=${van.id}&van_name=${encodeURIComponent(van.name)}`
  )
```
**Nothing inside the app links to it** — `openKDS`'s web branch does, and `manage:8681` copies it to the
clipboard for pasting into a browser. **INFERRED: it is the "bookmark this on the kitchen tablet" URL,
not an in-app route.**

## A4. The KDS route — ✅ **IT EXISTS**

`app/dashboard/[token]/kds/page.tsx` (91,699 bytes) + `app/dashboard/[token]/kds/layout.tsx`.
Path: **`/dashboard/[token]/kds`**.

**Gating — three independent layers, all READ:**

| Layer | Evidence |
|---|---|
| **Token** | the `[token]` segment is the truck's `dashboard_token`; every fetch sends it |
| **PIN** | `:121-125` — *"Operators can bake the PIN into the bookmark URL: `/kds?pin=1234`"*; `:222` `if (data.requiresPin)` drives a PIN gate |
| ⚠️ **Plan feature** | `:296` — *"through the `activeView` gate (`can('cook_screen')`, **Max-plan only**…)"*. 🔴 **This gates the COOK VIEW, not the KDS itself** — do not read it as "the KDS is Max-only" |

**Not session-gated in the native sense** — it is token+PIN, the same shape as the dashboard.

---

# PART B — IS THE KDS ALREADY NATIVE-READY?

## B1. 🔴 **APP-SHELL PATTERN — and the KDS is where the pattern CAME FROM.** No sticky anywhere.

**Counted in `kds/page.tsx`, READ:**

| Token | Count |
|---|---|
| `position: sticky` | **0** |
| `sticky top-` | **0** |
| `min-h-screen` | **0** |
| `<main` | **0** |
| `flex-1` | **8** |
| `min-h-0` | **1** |
| `overflow-y-auto` | **2** |

✅ **ZERO sticky.** §27's *"stacked-sticky … unreliable in this WebView"* and the `sticky top-[51px]`
class of defect **do not exist on this surface**. The manual calls the app-shell *"the KDS flex
pattern"* precisely because the dashboard and manage were converted **to match the KDS**.

## B2. Root elements — ⚠️ **`h-screen`, NOT `h-dvh`. This is the one real layout finding.**

**`app/dashboard/[token]/kds/layout.tsx`, quoted in full:**
```tsx
export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-screen h-screen overflow-hidden m-0 p-0">
      {children}
    </div>
  )
}
```
**and the page root, `kds/page.tsx:990-991`:**
```tsx
  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden">
```

✅ **A genuine fixed-viewport flex column with an inner scroller** — bars are `flex-shrink-0`, the order
region scrolls. **Structurally sound.**

🔴 **BUT: `h-dvh` = 0, `h-screen` = 3.** The manual states in terms: *"**Prefer `h-dvh` over
`h-screen`/`100vh`**"* — the whole point being that `100vh` does not track dynamic browser chrome or
safe-area insets on iOS. **The dashboard root is `h-dvh` (`page.tsx:2568`); the KDS root is `h-screen`.**
⚠️ **INFERRED, not observed:** in a full-screen WKWebView with `contentInset: 'never'` the two are
usually equal, so this may be latent rather than active — **but it is the one place the KDS diverges
from the pattern it supposedly defines.**

**On the two open iPad display defects:** §27 ties them to tabs whose `<main>` is `overflow-y-auto`.
🔴 **The KDS has NO `<main>` at all**, so the four-for-four tab-split evidence does not extend here.
**INFERRED: the KDS is structurally in the same family as the immune Add Order tab.** **Never observed
on the KDS either way — "not reported" is not "does not occur".**

## B3. Back navigation — ✅ **WORKS IN THE SHELL, and it is the right component**

**`kds/page.tsx:1011-1017`:**
```tsx
        <AppLink
          href={`/dashboard/${token}`}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Dashboard</span>
        </AppLink>
```
**with the comment above it, `:1008-1010`:** *"Back to the orders dashboard — staff are auto-routed to
KDS on login and otherwise have no way back to place orders. Unconditional (all roles)…"*

**`AppLink` intercepts in native — READ, `components/native/AppLink.tsx:29-37`:**
```tsx
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented) return
        if (isNativeApp()) {
          e.preventDefault()
          router.push(href)
        }
      }}
```
✅ **Lands on `/dashboard/[token]` — the operator's own dashboard, in-app.** Not `/`, not `/landing`,
**so it is not the trap fixed twice today.**

## B4. Alerting — ✅ **in-app sound only. The local notification WAS removed, as §11 records.**

**`kds/page.tsx:501`:**
```tsx
          playNewOrder()   // in-app SOUND only (Web Audio, works in the webview foreground); notification is the server APNs push
```
plus `installAudioUnlock()` at `:340` and `primeAudio()` on the sound toggle at `:1076`.

**`playDing` itself — `lib/audio.ts:44`:** `export function playDing(freq = 880, durationSecs = 0.6, gain = 0.3): void`.
🔴 **The KDS does NOT call `playDing` directly.** Its only callers are `lib/audio.ts` internals and
`lib/native/notifications.ts:91`. **The KDS calls `playNewOrder()`.**

✅ **`LocalNotifications` / `scheduleLocal`: NOT FOUND anywhere in `kds/page.tsx`.** §11's record that the
server APNs push is *"the SOLE order-notification source"* is **confirmed on this surface**.

⚠️ **CONSEQUENCE FOR AN UNATTENDED SCREEN: Web Audio only fires while the WebView is in the FOREGROUND.**
Backgrounded or screen-locked, the only alert is the APNs push — **and no APNs token has ever been
obtained on iOS** (`docs/ipad-build-report.md`). **Not a KDS defect; a dependency worth naming.**

## B5. UserMenu — ✅ **CONFIRMED ABSENT. Zero legal links.**

`grep -c UserMenu` = **1**, and that one occurrence is **a comment**, `:1533`:
> *"'This device' sheet — same pattern as the dashboard UserMenu."*

**No `<UserMenu`, no `PRIVACY_PATH`, no `TERMS_PATH`, no `/legal` anywhere.** The sweep's finding holds.

**Does it matter?** ⚠️ **For App Review, NO** — 5.1.1(i) requires the policy reachable *in the app*, and
it is, from the dashboard's UserMenu; **the KDS is a sub-screen with a working back link (B3).**
✅ **And there is a UX reason to keep it out:** the KDS is a fixed kitchen display; a menu offering
account deletion beside the order tickets is a hazard, not a feature. **What the KDS does carry is
`ThisDeviceSettings` (`:1545`) — the device-config sheet — which is the part that matters here (C3).**

---

# PART C — DEVICE CONFIG

## C1. `van_devices.default_screen` — accepted values, readers, and cold-launch routing

**Accepted values — server-validated, `app/api/native/bind-device/route.ts:74-76`:**
```ts
  if (default_screen && default_screen !== 'dashboard' && default_screen !== 'kds') {
    return NextResponse.json({ error: 'invalid default_screen' }, { status: 400 })
  }
```
🔴 **Exactly two: `'dashboard' | 'kds'`.** Mirrored in the client type, `lib/native/device.ts:16`.

**Readers:** `app/api/native/my-trucks/route.ts:93` selects it; `lib/native/trucks.ts:8` types it;
`OperatorDeviceConfig.tsx` reads and writes it; **`app/app/page.tsx` routes on it.**
**It carries over on truck switch** — `switch-truck/route.ts:44`.

## C2. ✅ **YES — a device can be configured to open STRAIGHT into the KDS. Quoted.**

**`app/app/page.tsx:46-55`:**
```tsx
        // This device is pinned to a truck → reopen the screen it was LAST on (restart-to-last-screen).
        // Falls back to the device's configured default_screen the first launch after setup (nothing
        // recorded yet).
        if (device) {
          const t = trucks.find(x => x.truck_id === device.truck_id)
          if (t) {
            const screen = getLastScreen() ?? device.default_screen
            return go(screen === 'kds' ? `/dashboard/${t.dashboard_token}/kds` : `/dashboard/${t.dashboard_token}`)
          }
        }
```

🔴 **THE COLD-LAUNCH PATH REACHES THE KDS WITHOUT TOUCHING THE DASHBOARD.** And there are **two** ways in:

1. **`getLastScreen()`** — `localStorage`, written by the KDS itself on mount:
   `kds/page.tsx:77` `useEffect(() => { if (isNativeApp()) setLastScreen('kds') }, [])`.
   **So once an operator has opened the KDS, the app reopens there on every relaunch, automatically.**
2. **`device.default_screen`** — the DB fallback, used *"the first launch after setup"*.

⚠️ **`getLastScreen()` WINS OVER `default_screen` (`??`).** A device configured to `'dashboard'` that was
last on the KDS **still relaunches into the KDS**. That is deliberate ("restart-to-last-screen") and
recorded at `device.ts:80`, **but it means `default_screen` is a first-run seed, not a standing
preference.**

## C3. ✅ **YES, there is UI** — `components/native/OperatorDeviceConfig.tsx:227-234`

```tsx
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-700">Default screen</span>
        <select value={cfg?.default_screen ?? 'dashboard'} onChange={e => patch({ default_screen: e.target.value as 'dashboard' | 'kds' })}
          className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
          <option value="dashboard">Dashboard</option>
          <option value="kds">KDS</option>
        </select>
      </label>
```

**Reachable from three places, all READ:**

| Surface | Mount |
|---|---|
| Dashboard → UserMenu → "This device" | `components/dashboard/UserMenu.tsx:305` |
| 🔴 **The KDS itself** → "This device" sheet | `kds/page.tsx:1545` |
| Dashboard first-run gate | `page.tsx:2627` `<DeviceSetupGate token={token} />` |

⚠️ **Native-only** — `ThisDeviceSettings` self-guards on `isNativeApp()`. **Invisible on the web, which
is correct: there is no device row to configure.**

## C4. Keep-awake — ✅ **ACTIVE ON THE KDS, and more carefully than on the dashboard**

**`kds/page.tsx:392`** `prepareKeepAwake(keepScreenOn)` · **`:531`** `if (value) { st = await keepAwake() } else { await allowSleep() }`
· **`:1197`** `<KeepAwakePrompt keepScreenOn={keepScreenOn} wakeState={wakeState} onAcquire={…} />`

**Two deliberate guards, quoted, because they are what makes it survive a long service:**
```
:365  // 🔴 NO `prepareKeepAwake()` HERE — it used to run UNCONDITIONALLY on mount, before anything had read
:369  // 🚫 NO `return () => { allowSleep() }` HERE. An unmount release was added on 5 August 2026 and
:378  // (Safari needs a user activation, so prepareKeepAwake only sets intent), so every dashboard↔KDS hop
```

✅ **It is present on BOTH surfaces** — the dashboard has the same four calls (`page.tsx:1115, 1663,
2623`). **The setting is per-device, read synchronously at first paint (`:128-131`) so the prompt cannot
flash.**

⚠️ **NOT VERIFIED, and it is exactly the silent-failure case you name:** §36 records the four keep-awake
catches as *"shape verified by `tsc`; behaviour on failure REASONED ONLY, never forced"*, and
*"Keep-awake through a full service"* sits under **"NEVER RUN ON ANY DEVICE, EITHER PLATFORM"**.
🔴 **The code is there and correct-looking; a screen going dark mid-service has never been tested for.**

---

# PART D — WHAT WOULD ACTUALLY BE NEEDED

## D1. 🔴 **(a) — ALREADY NATIVE-READY AND ALREADY REACHABLE.** INFERRED, with the reasoning:

| Requirement | Status |
|---|---|
| A route exists in the shell | ✅ `/dashboard/[token]/kds` — **READ** |
| Reaching it does not eject to Safari | ✅ `router.push` under `isNativeApp()` — **READ** |
| Reachable from the dashboard | ✅ header button + UserMenu, both via `openKDS` — **READ** |
| Reachable WITHOUT the dashboard | ✅ cold launch, two independent ways — **READ** |
| A way back that stays in-app | ✅ `AppLink` → `/dashboard/[token]` — **READ** |
| Layout suited to the WebView | ✅ app-shell flex fit, **zero sticky** — **READ** |
| Native plumbing | ✅ Preferences, keep-awake, status bar, offline banner + outbox, app lock, `setLastScreen`, device config — **READ** |

🔴 **SO IF THE KDS APPEARED UNREACHABLE ON THE DEVICE, THE CAUSE IS NOT IN THE LINKING.** ⚠️ **INFERRED
alternatives, none verified and all testable in a minute on the iPad:** the build on the device predates
the native branch; the header button is off-screen at that width (it sits in a `whitespace-nowrap` row
that can overflow); a PIN gate intercepted; or the tap landed on the picker modal for a multi-van truck.
**I cannot see the device and will not guess further.**

## D2. Not (c) — but **three things are true and worth stating**

1. ⚠️ **`h-screen` instead of `h-dvh`** at `kds/layout.tsx` (B2) — the one divergence from the pattern.
2. ⚠️ **Foreground-only alerting** (B4) — Web Audio while foregrounded; the APNs fallback has never
   produced a token.
3. ⚠️ **Keep-awake unexercised** across a real service (C4).

**No implementation is proposed, per the brief.**

## D3. Blast radius on Pizzeria Gusto's live service

🔴 **A KDS change is a LIVE-SERVICE change with no gate and no staging.** There is one KDS route; Gusto
reaches it through the same button, the same cold-launch routing and the same layout as every other
truck. **There is no plan gate on the screen** (only `cook_screen` gates a view *within* it) and **no
per-truck flag**, so anything altered here reaches Gusto's kitchen the moment it deploys — **during
service, on the screen that tells the cook what to make.**

⚠️ **Two amplifiers specific to this surface:** it runs **unattended for hours**, so a defect that needs
a relaunch may not be noticed until orders are missed; and **staff are auto-routed to it on login**
(`kds:1008`), so for some users it is the *only* screen they see.

✅ **Nothing in this report changed anything.**

---

# PART E — INTEGRITY

## E1. Byte-scan of every file opened — byte-level tool, never grep

| File | NUL | Ctrl < 0x09 | Other C0 |
|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 0 | 0 | 0 |
| `app/dashboard/[token]/kds/page.tsx` | 0 | 0 | 0 |
| `app/dashboard/[token]/kds/layout.tsx` | 0 | 0 | 0 |
| `components/dashboard/UserMenu.tsx` | 0 | 0 | 0 |
| `components/native/AppLink.tsx` | 0 | 0 | 0 |
| `components/native/OperatorDeviceConfig.tsx` | 0 | 0 | 0 |
| `lib/native/device.ts` | 0 | 0 | 0 |
| `app/app/page.tsx` | 0 | 0 | 0 |
| `app/kds/[kds_token]/page.tsx` | 0 | 0 | 0 |
| `capacitor.config.ts` | 0 | 0 | 0 |
| `ios/App/App/capacitor.config.json` | 0 | 0 | 0 |
| `ios/App/App/HGBridgeViewController.swift` | 0 | 0 | 0 |
| `lib/audio.ts` | 0 | 0 | 0 |
| `node_modules/@capacitor/ios/…/WebViewDelegationHandler.swift` | 0 | 0 | 0 |
| `docs/reference-manual.md` | 0 | 0 | 0 |

## E2. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## E3. `git status` — nothing changed

```
 M app/(legal)/layout.tsx
 M app/contact/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/DayLoadStrip.tsx
 M components/shared/AppHeader.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M ios/App/App/Info.plist
 M lib/plan-features.ts
 M package.json
?? components/shared/BrandHomeLink.tsx
?? docs/appstore-completeness-report.md
?? docs/appstore-report.md
?? docs/brand-home-link-report.md
?? docs/capacity-panel-report.md
?? docs/completeness-sweep-report.md
?? docs/dependency-pin-report.md
?? docs/ipad-build-report.md
?? docs/presubmission-housekeeping-report.md
?? docs/privacy-manifest-report.md
?? ios/App/App/PrivacyInfo.xcprivacy
```
🔴 **Identical to the state before this task.** Every entry is earlier work; **this task added nothing
and modified nothing.** The only new file is this report.

---

# WHAT I HAVE NOT ESTABLISHED

1. 🔴 **I cannot see the device, and nothing here was run on it.** That the KDS *is* reachable is read
   from the code; **that it was not reachable for you is your observation, and the two do not meet.**
2. 🔴 **I do not know which build is on the iPad.** The shell loads **production**, so what you tapped
   was whatever is deployed — **if `openKDS`'s native branch is newer than the deployed bundle, the code
   is right and the device is running the old behaviour.** **This is the first thing I would check, and
   I have not checked it.**
3. **INFERRED, unverified:** that `router.push` completes cleanly on this route in the shell. The route
   is heavy (91,699 bytes, many native imports) and **has never been observed loading in-app**.
4. **I did not exercise the PIN gate, the van picker or the `pin=` query path.**
5. **I did not verify `h-screen` vs `h-dvh` makes any visible difference** in the shell — INFERRED
   latent, not measured.
6. **Neither iPad display defect has ever been tested on the KDS**, in either orientation.
