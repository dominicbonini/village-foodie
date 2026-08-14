# App Store submission — read-only inventory

Date: 14 August 2026
Status: READ-ONLY INVENTORY. **No edits, no commits, no builds, no `cap sync`.**
No `next dev`, no `next build`. Nothing was written except this report.

**Read first, as instructed:** §11 (native app), §36 (platform notes), §40 (commerce posture) and §27's
backlog. Findings below are marked **NEW** where they are not already recorded there.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

**Provenance convention:** every claim is **READ** (I opened the file and quoted it) or **INFERRED**
(derived, and labelled). ⚠️ **Operator-side and customer-side findings are reported separately and never
generalised across.**

---

# PART 1 — APP STORE SUBMISSION MECHANICS

## 1. `PrivacyInfo.xcprivacy` — 🔴 THE APP'S OWN IS MISSING

**READ** — `find . -name "PrivacyInfo.xcprivacy"` across the **whole** repo, `node_modules` included:

| # | Path |
|---|---|
| 1 | `./node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy` |
| 2 | `./node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/PrivacyInfo.xcprivacy` |

**Total: 2. `find . -name "*.xcprivacy"` returns the same 2 — there are no others of any name.**

🔴 **`ios/App/App/PrivacyInfo.xcprivacy` DOES NOT EXIST.** **READ** — the full directory listing of
`ios/App/App/` is: `App.entitlements`, `AppDelegate.swift`, `AppRelease.entitlements`, `Assets.xcassets`,
`Base.lproj`, `HGBridgeViewController.swift`, `Info.plist`, `capacitor.config.json`, `config.xml`,
`public`. **No privacy manifest.**

⚠️ **`ios/App/Pods` DOES NOT EXIST** — this project uses **SPM** (`ios/App/CapApp-SPM`), not CocoaPods,
so the two `node_modules` copies are the SDK's own manifests as shipped in the package, **not** vendored
into the build tree. **INFERRED** that SPM surfaces them from the package; I did not open the SPM
resolution to confirm they reach the archive.

🔴 **NEW — not recorded in §27, §36 or §40.** The recorded submission blockers are account deletion,
privacy policy/terms, and the 2.1(a) demo account. **The privacy manifest is a fourth, and it is a
different requirement from the privacy *policy*.** Apple requires an app-level `PrivacyInfo.xcprivacy`
declaring collected data types and any required-reason APIs. **INFERRED** as to whether App Store Connect
would hard-reject this build; I did not attempt an upload.

## 2. Capacitor plugins and version ranges — **READ** from `package.json`

**All twelve are in `dependencies`; there are no Capacitor entries in `devDependencies`.**

| Package | Declared range | Caret/tilde? |
|---|---|---|
| `@aparajita/capacitor-biometric-auth` | `^10.0.0` | 🔴 **^** |
| `@capacitor-community/keep-awake` | `^8.0.1` | 🔴 **^** |
| `@capacitor/android` | `^8.3.4` | 🔴 **^** |
| `@capacitor/app` | `^8.1.0` | 🔴 **^** |
| `@capacitor/cli` | `^8.3.4` | 🔴 **^** |
| `@capacitor/core` | `^8.3.4` | 🔴 **^** |
| `@capacitor/ios` | `^8.3.4` | 🔴 **^** |
| `@capacitor/local-notifications` | `^8.2.0` | 🔴 **^** |
| `@capacitor/network` | `^8.0.1` | 🔴 **^** |
| `@capacitor/preferences` | `^8.0.1` | 🔴 **^** |
| `@capacitor/push-notifications` | `^8.1.1` | 🔴 **^** |
| `@capacitor/status-bar` | `^8.0.2` | 🔴 **^** |

🔴 **TWELVE OF TWELVE USE `^`. NOT ONE IS PINNED. Zero use `~`.**

⚠️ **Why this is a submission concern and not just hygiene:** a native shell's plugin set is compiled
into the archive. `^` means an `npm install` on a different day can change native code between the build
you tested and the build you upload, **with no diff in the repo**. §36 already records
`@capacitor/status-bar` `8.0.2` behaving differently than its comments claim — that exact package is on
`^8.0.2` and free to move.

⚠️ **I did not check `package-lock.json`.** If one is committed the installed versions are reproducible
in practice; the *declared* ranges are still unpinned. **Not verified either way.**

## 3. Entitlements — **READ**, both files in full

**`ios/App/App/App.entitlements`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<!-- DEBUG ONLY. Builds run from Xcode onto a device register with the APNs SANDBOX and receive a
	     SANDBOX device token. The server must then send via api.sandbox.push.apple.com, i.e. APNS_ENV
	     must NOT be 'production' (lib/apns.ts picks the host from that one variable).
	     The Release configuration uses AppRelease.entitlements with 'production' — see that file. -->
	<key>aps-environment</key>
	<string>development</string>
</dict>
</plist>
```

**`ios/App/App/AppRelease.entitlements`:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<!-- RELEASE ONLY — TestFlight AND the App Store. Both are Release builds signed with a DISTRIBUTION
	     profile, and both register with PRODUCTION APNs. The server must send via api.push.apple.com,
	     i.e. APNS_ENV=production.
	     🔴 THIS IS THE FILE THAT PREVENTS THE CLASSIC SILENT FAILURE: a TestFlight build carrying
	     'development' obtains a SANDBOX token, which api.push.apple.com rejects with BadDeviceToken.
	     Nothing crashes and nothing is logged on the device — the notification simply never arrives,
	     and it looks like "push works in Xcode but not in TestFlight". -->
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
```

**`CODE_SIGN_ENTITLEMENTS` from `ios/App/App.xcodeproj/project.pbxproj` — READ, both configurations:**

```
306:				CODE_SIGN_ENTITLEMENTS = App/App.entitlements;          <- inside the block ending `name = Debug;`   (:324)
330:				CODE_SIGN_ENTITLEMENTS = App/AppRelease.entitlements;   <- inside the block ending `name = Release;` (:347)
```

✅ **The Debug/Release split §36 prescribes is present and correctly wired.** Both configurations also
read `PRODUCT_BUNDLE_IDENTIFIER = com.hatchgrab.app`, `MARKETING_VERSION = 1.0`,
`CURRENT_PROJECT_VERSION = 1`.

⚠️ **NEW, and a submission fact rather than a defect:** **`MARKETING_VERSION = 1.0` / `CURRENT_PROJECT_VERSION = 1`
in BOTH configurations.** A first upload is fine; **a second upload at the same build number is rejected
by App Store Connect.** Not recorded in §27.

## 4. `ios/App/App/Info.plist` — **READ**, in full

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CAPACITOR_DEBUG</key>
	<string>$(CAPACITOR_DEBUG)</string>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
        <string>HatchGrab</string>
	<key>CFBundleExecutable</key>
	<string>$(EXECUTABLE_NAME)</string>
	<key>CFBundleIdentifier</key>
	<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>HatchGrab</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>$(MARKETING_VERSION)</string>
	<key>CFBundleVersion</key>
	<string>$(CURRENT_PROJECT_VERSION)</string>
	<key>NSFaceIDUsageDescription</key>
	<string>Unlock HatchGrab with Face ID.</string>
	<key>LSRequiresIPhoneOS</key>
	<true/>
	<key>UILaunchStoryboardName</key>
	<string>LaunchScreen</string>
	<key>UIMainStoryboardFile</key>
	<string>Main</string>
	<key>UIRequiredDeviceCapabilities</key>
	<array>
		<string>armv7</string>
	</array>
	<key>UISupportedInterfaceOrientations</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UISupportedInterfaceOrientations~ipad</key>
	<array>
		<string>UIInterfaceOrientationPortrait</string>
		<string>UIInterfaceOrientationPortraitUpsideDown</string>
		<string>UIInterfaceOrientationLandscapeLeft</string>
		<string>UIInterfaceOrientationLandscapeRight</string>
	</array>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<true/>
</dict>
</plist>
```

**Observations, all NEW (none appears in §27/§36/§40):**

- ✅ **`NSFaceIDUsageDescription` is present** — required, since `@aparajita/capacitor-biometric-auth` is
  a dependency.
- 🔴 **NO usage-description key for notifications is needed** (there is none for APNs) — correct, but
  note **there is no `UIBackgroundModes`**, so remote notifications cannot wake the app. **INFERRED**
  consequence only; not verified against behaviour.
- ⚠️ **`UIRequiredDeviceCapabilities` = `armv7`.** armv7 is 32-bit and **no supported iOS device is
  armv7**. This is the stock Capacitor scaffold value. **INFERRED**: harmless in practice (it is a
  minimum-capability filter that every arm64 device satisfies via the historical alias) — **but it is
  scaffold residue in a submitted plist and I did not verify Apple's current handling of it.**
- ⚠️ **`CAPACITOR_DEBUG` is shipped as a build-variable string.** Present in both configurations'
  plist because there is only one plist.
- ⚠️ **No `ITSAppUsesNonExemptEncryption`.** Its absence means App Store Connect **asks the export-
  compliance question on every upload** rather than answering it. Not a rejection; a per-upload prompt.
- ⚠️ **No `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSLocationWhenInUseUsageDescription`.**
  **INFERRED** as correct — I found no plugin requiring them in the dependency list — but I did not audit
  the web bundle for `getUserMedia` or geolocation calls, which in a WKWebView would prompt and, without
  the key, **crash**. **Not verified.**

## 5. `capacitor.config.ts` — **READ**, in full

```ts
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
```

### `ios/App/App/capacitor.config.json` — **EXISTS. READ.**

`server.url`:
```json
"url": "https://www.hatchgrab.com/app",
"cleartext": false
```

✅ **NO MISMATCH.** The baked artifact matches the TS default (`CAP_SERVER_URL` unset → production), and
`cleartext` is `false` as `IS_LOCAL_HTTP` requires. **`contentInset`, `backgroundColor`, `scrollEnabled`,
both `appendUserAgent` markers and all three plugin blocks are identical between the two files.**

⚠️ **One key exists ONLY in the baked JSON** — `packageClassList`, eight entries:
`BiometricAuthNative`, `KeepAwakePlugin`, `AppPlugin`, `LocalNotificationsPlugin`, `CAPNetworkPlugin`,
`PreferencesPlugin`, `PushNotificationsPlugin`, `StatusBarPlugin`. **Generated by `cap sync`, not
authored** — expected, not a mismatch.

🔴 **SUBMISSION HAZARD, NEW:** the config comment documents a `CAP_SERVER_URL=http://localhost:3000 npx
cap sync ios` workflow that **rewrites this baked file**. The file is currently correct, **but nothing
enforces that at archive time** — a build taken after a local sync would ship pointing at localhost and
show a blank app to a reviewer. **INFERRED** that this would pass build validation and fail review.

## 6. `ios.scrollEnabled` and `contentInset` — **READ**

| Key | Value | Source |
|---|---|---|
| `ios.scrollEnabled` | 🔴 **`true`** | both `capacitor.config.ts:37` and the baked JSON |
| `ios.contentInset` | **`'never'`** | both |

⚠️ **§27 records that `scrollEnabled: true` is the leading (UNCONFIRMED) hypothesis for the
non-recovering header defect (b), and that `scrollEnabled: false` is blocked by `/admin` having no inner
scroller.** Item 11 below re-checks that blocker. **It is still true.**

---

# PART 2 — THE 14 AUGUST UI ON A REAL IPAD

## 7. The dashboard `<main>` — 🔴 IT DOES NOT BRANCH ON LAYOUT MODE

**READ** — `app/dashboard/[token]/page.tsx:2819`, the **only** `<main>` element on the page:

```tsx
<main className={`w-full min-[1400px]:max-w-5xl min-[1400px]:mx-auto flex-1 min-h-0 ${activeTab==='add'?'overflow-hidden px-4':'overflow-y-auto px-4 py-4 pb-20'}`}>
```

🔴 **`addOrderLayout` does not appear anywhere in `app/dashboard/[token]/page.tsx`** — grep returns
zero. **So the `<main>` className is BYTE-IDENTICAL in both `'tabs'` and `'scroll'` mode.** It branches
only on `activeTab`, and on the Add Order tab it is `overflow-hidden`, in both modes.

**Does scroll mode introduce an inner scroller tabs mode does not have? — READ, `AddOrderPanel.tsx`:**

| Mode | Left pane |
|---|---|
| `'tabs'` (`:2043`) | `<div className="@container w-[58%] min-h-0 overflow-y-auto border-r border-slate-200 p-4">` — **the pane IS the scroller** |
| `'scroll'` (`:2033-2038`) | `<div className="w-[58%] flex flex-col min-h-0 border-r border-slate-200">` wrapping `<div className="shrink-0 px-4 pt-4">` **+** `<div className="@container flex-1 min-h-0 overflow-y-auto px-4 pb-4">` |

🔴 **ANSWER: NO — scroll mode does not add a scroller, it MOVES it one level down.** Tabs has **one**
`overflow-y-auto` (the pane); scroll has **one** `overflow-y-auto` (an inner child of a non-scrolling
flex pane). **The count of nested scrollers is the same: `<main>`(`overflow-hidden`) → one scroller.**

⚠️ **This matters for §27's iPad defects and is NEW as an explicit statement:** §27 records that the Add
Order tab is the ONE tab that does **not** exhibit both display defects, and attributes that to its
`<main>` being `overflow-hidden`. **That property is unchanged by the 14 August work in either mode**, so
the layout setting does not put Add Order into the defect-exhibiting group. **INFERRED** — no device.

## 8. `ScrollMenuSections` — OPERATOR SIDE ONLY. **READ, in full.**

`components/dashboard/AddOrderPanel.tsx:181-249`. Comments elided only where marked; **all classes quoted verbatim.**

```tsx
function ScrollMenuSections({ cats, categoryStocks, renderCategory }: {
  cats: string[]
  categoryStocks: CategoryStock[]
  renderCategory: (cat: string) => React.ReactNode
}) {
  return (
    <div>
      {cats.map(cat => {
        const closed = categoryStocks.find(s => s.category === cat)?.available === false
        return (
          <section key={cat} className="mb-4">
            {/* … 🔴 STICKY AT `top-0` … ⚠️ `bg-slate-50/95`, NOT `bg-white/95` … */}
            <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-slate-50/95 backdrop-blur-sm flex items-center gap-2">
              {/* … 🔴 orange-600 … KNOWN AA SHORTFALL, ACCEPTED ON PURPOSE … */}
              <p className="text-xs font-black uppercase tracking-wide text-orange-600">{cat.charAt(0).toUpperCase() + cat.slice(1)}</p>
              {closed && <span aria-hidden>🔒</span>}
            </div>
            {closed && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                <span aria-hidden>🔒</span>
                <span>{cat.charAt(0).toUpperCase() + cat.slice(1)} is closed for online orders this event — hidden from customers. You can still add for the hatch; you&apos;ll be asked to confirm.</span>
              </div>
            )}
            {renderCategory(cat)}
          </section>
        )
      })}
    </div>
  )
}
```

**Sticky heading classes, isolated:** `sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-slate-50/95 backdrop-blur-sm flex items-center gap-2`
Heading text: `text-xs font-black uppercase tracking-wide text-orange-600`

🔴 **The component has NO chip bar, NO state, NO refs, NO effects and NO listeners.** **READ** from the
header comment: the tap-lock, safety timer, arrival/`touchstart`/`wheel`/`scrollend` releases, the
rAF spy, `nearestScrollParent`, the reduced-motion check, the measured bar height, the section ref map
and the active-category state were **all removed** on 14 August.

⚠️ **Recorded in the code as a known accessibility shortfall:** `text-orange-600` on `bg-slate-50` is
**3.59:1**, below the 4.5:1 AA floor for 12px text, and below the **4.77:1** of the grey it replaced.
**A sighted, deliberate decision by the operator** — quoted from the code, not my judgement.

## 9. CUSTOMER order page — pins and headings. **SEPARATE FROM ITEM 8. Do not merge.**

**READ** — `app/trucks/[slug]/order/page.tsx`. **Three measured pin lines, none of which exists on the
operator side:**

```
271:  const stickyTop  = HEADER_H + (isDemo ? demoBannerH : 0)
299:  const chipBarTop = stickyTop + statusBannerH
1243: const pinnedTop  = chipBarTop + (hasChipBar ? tabBarH : 0)
```

**Chip bar pin (`:2651`) — the customer page KEEPS its chip bar:**
```tsx
<div ref={tabBarRef} style={{ top: chipBarTop }} className="sticky z-30 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 mb-2 bg-white border-b border-slate-100">
```

**Category heading (`:2706`) — 🔴 NON-STICKY on this surface:**
```tsx
<p className="text-sm font-black text-orange-600 uppercase tracking-wider pt-1 pb-2">{cap(category)}</p>
```

**Sub-category heading (`:2747`) — STICKY, and it is the only sticky heading here:**
```tsx
<p style={{ top: pinnedTop }} className="sticky z-20 -mx-2 px-2 sm:-mx-4 sm:px-4 py-2 bg-white text-sm font-black text-orange-500 uppercase tracking-wider">
```

**Section scroll target (`:2693`):**
```tsx
style={{ scrollMarginTop: pinnedTop, ...(isLastCategory ? { minHeight: lastSectionMinHeight } : {}) }}
```

🔴 **THE TWO SURFACES ARE NOW OPPOSITES, AND THIS IS THE CROSS-SURFACE TRAP §35 NAMES:**

| | Operator (item 8) | Customer (item 9) |
|---|---|---|
| Chip bar | **removed** | **kept**, with auto-scroll |
| Category heading | **STICKY**, `top-0`, `text-xs`, `bg-slate-50/95` | **NON-STICKY**, `text-sm`, no background |
| Sub-category heading | **not rendered at all** | **STICKY** at `pinnedTop` |
| Heading colour | `text-orange-600` | `text-orange-600` (category) / `text-orange-500` (sub) |
| Pin offsets | one constant, `top-0` | **three measured values** |

⚠️ **A fact verified on one is not a fact about the other.**

## 10. `EventTimeSelect` — 🔴 THE 44pt TOUCH TARGET IS NOT MET AT ANY CALL SITE

**READ** — `app/manage/[token]/page.tsx:6514-6577`, in full:

```tsx
function EventTimeSelect({
  value, onChange, className, placeholder = '—:—', minExclusive = null, disabled = false, label,
}: { … }) {
  const { h: curH, m: curM } = splitHhMm(value)
  const minMins = hhMmToMins(minExclusive)
  const minutesFor = (h: string) =>
    minMins === null || !h ? MINUTE_OPTIONS : MINUTE_OPTIONS.filter(m => Number(h) * 60 + Number(m) > minMins)
  const hours = HOUR_OPTIONS.filter(h => minMins === null || Number(h) * 60 + 55 > minMins)
  if (curH && !hours.includes(curH)) hours.push(curH)          // preserve a stored/earlier hour
  hours.sort()
  const minutes = minutesFor(curH)
  const minuteOptions = curM && !minutes.includes(curM) ? [...minutes, curM].sort() : minutes
  const onHour = (h: string) => {
    if (!h) { onChange(''); return }
    const keeps = curM !== '' && (minMins === null || Number(h) * 60 + Number(curM) > minMins)
    onChange(`${h}:${keeps ? curM : (minutesFor(h)[0] ?? '00')}`)
  }
  return (
    <div className="flex items-center gap-1 w-full">
      <select aria-label={label ? `${label} hour` : 'Hour'} value={curH} disabled={disabled}
        onChange={e => onHour(e.target.value)} className={className}>
        <option value="">{placeholder}</option>
        {hours.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span className="text-slate-400 text-xs flex-shrink-0" aria-hidden="true">:</span>
      <select aria-label={label ? `${label} minute` : 'Minute'} value={curM}
        disabled={disabled || !curH}
        onChange={e => { if (curH) onChange(`${curH}:${e.target.value}`) }} className={className}>
        {!curH && <option value="">--</option>}
        {minuteOptions.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  )
}
```

🔴 **THE COMPONENT ITSELF DECLARES NO HEIGHT.** Its wrapper is `flex items-center gap-1 w-full` — no
`min-h-*`, no `minHeight`. **Every dimension comes from the caller's `className`.**

**All 8 call sites — READ:**

| Line | Site | `className` passed | `style` |
|---|---|---|---|
| 7469, 7479 | Importer review, **mobile card** | `fieldCls(...)` | **none** |
| 7693, 7702 | Importer review, **desktop future rows** | `ci(...)` | 🔴 **none** |
| 7778, 7787 | Importer review, **desktop past rows** | `ci(...)` | 🔴 **none** |
| 8080, 8100 | **Edit event modal** | inline (below) | **none** |

**The class helpers — READ:**
```
7461: const fieldCls = (amber) => `bg-white border rounded-lg px-3 py-2.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-400 …`
7667: const ci = (missing) => `bg-transparent border-b text-sm text-slate-900 px-1.5 py-2 w-full rounded-none focus:outline-none …`
8089: className={`w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white …`}
```

**Computed minimum touch height from the classes alone — INFERRED (arithmetic; nothing rendered):**

| Site | Padding | Line box | Border | **Height** | ≥44pt? |
|---|---|---|---|---|---|
| Mobile card (`fieldCls`) | `py-2.5` = 10+10 | `text-sm` ≈ 20px | 1+1 | **≈ 42px** | 🔴 **NO** |
| Desktop grid (`ci`) | `py-2` = 8+8 | ≈ 20px | 0+1 (`border-b`) | **≈ 37px** | 🔴 **NO** |
| Edit modal | `py-2` = 8+8 | ≈ 20px | 1+1 | **≈ 38px** | 🔴 **NO** |

🔴 **AND THE DESKTOP GRID LOST HEIGHT IT USED TO HAVE.** **READ** — in the *same table rows*, every
sibling control still carries `style={{ minHeight: '48px' }}`:

```
7684: <input … placeholder="Venue name" className={ci(missingVenue)} style={{ minHeight: '48px' }} />
7687: <input … placeholder="Area"       className={ci(false)}        style={{ minHeight: '48px' }} />
7690: <input … placeholder="CB22 5EJ"   className={`${ci(false)} uppercase`} style={{ minHeight: '48px' }} />
7713: <select … van_id …               className={`${ci(false)} bg-transparent`} style={{ minHeight: '48px' }} />
```
**but `EventTimeSelect` at 7693/7702 (and 7778/7787) passes no `style` at all.** The component accepts
no `style` prop, so the 48px could not be forwarded.

⚠️ **This is recorded in `docs/event-times-build-report.md` §9 item 3 as an unverified consequence.**
**NEW here is the measurement and the comparison to its own row siblings.** It is a **usability finding
on a tablet-first operator screen**, not a formal App Store rejection criterion — Apple's 44pt guidance
is a HIG recommendation, not a review guideline. **Stated as a gap, not as a blocker.**

## 11. `app/admin` — 🔴 STILL NO INNER SCROLLER. §27'S BLOCKER IS UNCHANGED.

**READ** — `app/admin/` is **one file, `page.tsx`, 2,139 lines**.

| Pattern | Hits |
|---|---|
| `h-dvh` | 🔴 **0** |
| `<main` | 🔴 **0** |
| `min-h-screen` | **3** (`:655`, `:661`, `:716`) |
| `sticky top-` | **16** |
| `overflow-y-auto` | 6 — **and none is a page scroller** |

**The six `overflow-y-auto` — READ, all six are modal/list containers:**
```
1095: <div className="bg-white rounded-2xl w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
1462: <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-y-auto">
1582: <ul className="mt-2 text-[11px] list-disc list-inside space-y-0.5 max-h-24 overflow-y-auto">
1661: <ul className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] … max-h-32 overflow-y-auto">
1680: <div className="fixed inset-0 bg-black/60 z-[70] flex items-start justify-center p-4 overflow-y-auto">
1790: <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-y-auto">
```
**Four are `fixed inset-0` overlays; two are `max-h-*` lists inside them. The page body is `:716`
`<div className="min-h-screen bg-slate-50">` — natural document flow.**

**And the hardcoded stacked-sticky §27 names is still there — READ, `:727`:**
```tsx
<div className="sticky top-[51px] z-40 bg-slate-900 border-b border-slate-700 overflow-x-auto">
```

🔴 **CONCLUSION: §27's statement is confirmed verbatim, one year of work later. `/admin` blocks
`scrollEnabled: false`, which blocks the durable native fix for iPad display defect (b).**

---

# PART 3 — THE COMPLETENESS CENSUS

## 12. "Coming soon" — the 2.1 exposure list. **39 hits. READ.**

Case-insensitive `coming[ _-]?soon` across `app/`, `components/`, `lib/`, `content/`.

### 🔴 OPERATOR-VISIBLE UI STRINGS (what a reviewer can see)

| file:line | Line |
|---|---|
| `app/manage/[token]/page.tsx:9032` | `placeholder="Coming soon"` — **Messenger field** |
| `app/manage/[token]/page.tsx:9050` | `placeholder="Coming soon"` — **Instagram field** |
| `app/manage/[token]/page.tsx:10453` | `<span className="text-xs text-slate-400 italic leading-tight">Coming soon</span>` — plan matrix cell |
| `app/manage/[token]/page.tsx:10483` | `<p className="text-sm font-medium text-amber-800">Payment setup coming soon</p>` |
| `components/printing/PrintingSettings.tsx:99` | `<span className="…">Coming soon</span>` — printer card |
| `components/manage/PaymentsTab.tsx:741` | `Coming soon` — the "Through HatchGrab" walk-up row |
| `app/admin/page.tsx:822` | `{val === 'coming_soon' && <span …>Coming soon</span>}` — admin plan matrix |

### CUSTOMER / MARKETING-VISIBLE (landing page — web only, not in the app shell)

`app/landing/page.tsx:81` (`<span className="soon">Coming soon</span>`), `:203`, `:333`, `:350`.
🔴 **CORRECTED 14 August 2026 — THIS WAS INFERRED AND IT IS WRONG. BOTH `/` AND `/landing` ARE REACHABLE
FROM INSIDE THE SHELL.** Traced, READ:

- **`components/shared/AppHeader.tsx:64` — `<Link href="/" className="shrink-0 z-10">`** on the brand
  logo. `<AppHeader` renders on **all three** operator surfaces: `app/dashboard/[token]/page.tsx:2612`,
  `app/manage/[token]/page.tsx:556`, `app/admin/page.tsx:717`. **So `/` is ONE TAP from every operator
  screen in the app.**
- **`app/dashboard/[token]/page.tsx:2396`** — the Access-denied view renders
  `<Link href="/" …>← {_brand}</Link>`.
- 🔴 **`app/(legal)/layout.tsx:40` — `<Link href="/landing" … aria-label="HatchGrab home">`.** The legal
  pages are the App-Store-required in-app link, so the path is **avatar → Privacy policy → logo →
  `/landing`**: the compliance surface itself leads to the marketing page.
- `app/api/demo/return/route.ts:27` — `new URL('/landing', req.url)`.

⚠️ **So the four landing-page "Coming soon" strings ARE reachable by a reviewer inside the app**, in
three taps, and the route out of the legal page is the shortest one.

### THE DATA SOURCE

`lib/plan-features.ts` — `export type FeatureValue = boolean | 'coming_soon'` (`:4`), with **seven**
features carrying `'coming_soon'`: Messenger & Instagram auto-replies (`:139`), Advanced reporting
(`:140`), SMS order alerts (`:141`), Customer-facing display (`:151`), Event & festival pricing (`:152`),
Digital loyalty stamp cards (`:161`), plus the payments footnote string (`:187`).

**Remaining hits are code comments** (`app/landing/page.tsx:48,77,78,199,284`, `landing.css:296`,
`PaymentsTab.tsx:471,704,705`, `plan-features.ts:118,134,138,150,153,171,172,206,209,231`).

🔴 **THE 2.1 READING, STATED AS A RISK NOT A VERDICT:** Guideline 2.1 covers apps that are incomplete or
demo-like. **Seven advertised-but-unbuilt features, two disabled input fields labelled "Coming soon", and
a "Payment setup coming soon" notice are all visible to a reviewer with an operator account.** **INFERRED**
— I am not a reviewer, and this is a judgement about how it reads, not a quoted rule.

## 13. WhatsApp / social-integration UI shown to an operator — **READ**

| file:line | What renders |
|---|---|
| `app/manage/[token]/page.tsx:8971` | `<label …>WhatsApp</label>` — auto-replies row, **live** |
| `app/manage/[token]/page.tsx:8972` | `{can('whatsapp_replies') ? (` — the gate on that row |
| `app/manage/[token]/page.tsx:8979` | `placeholder="+447700900000"` — WhatsApp sender input |
| `app/manage/[token]/page.tsx:9006-9007` | a second `disabled` input, `placeholder="+447700900000"` |
| 🔴 `app/manage/[token]/page.tsx:9028` | `<label …>Messenger</label>` |
| 🔴 `app/manage/[token]/page.tsx:9031-9032` | `disabled` + `placeholder="Coming soon"` |
| 🔴 `app/manage/[token]/page.tsx:9036` | a second `disabled` control on the Messenger row |
| 🔴 `app/manage/[token]/page.tsx:9045` | `<label …>Instagram</label>` |
| 🔴 `app/manage/[token]/page.tsx:9048-9050` | `disabled` + `placeholder="Coming soon"` |
| 🔴 `app/manage/[token]/page.tsx:9054` | a second `disabled` control on the Instagram row |
| `app/manage/[token]/page.tsx:8896` | `⚠️ Tick "This number is on WhatsApp" on the Phone field to use WhatsApp.` |
| `app/manage/[token]/page.tsx:5650` | `Your own website — not a Facebook or Instagram page.` (scraper copy) |
| `app/manage/[token]/page.tsx:9070` | same distinction inside the scraper-preference option text |
| `app/manage/[token]/page.tsx:9154` | same, on the schedule-URL field |
| `interface Truck` `:60` | declares `social_instagram`, `social_facebook`, `whatsapp`, `whatsapp_sender` |

**56 total matches across `app/manage`, `app/dashboard`, `components/manage`, `components/dashboard`;
the table lists the rendering sites.**

🔴 **Two entire rows — Messenger and Instagram — are rendered as `disabled` inputs whose placeholder is
the words "Coming soon".** That is the clearest single 2.1 exposure in the operator console: it is not a
roadmap page, it is a settings form containing dead fields.

## 14. `purchaseCtaAllowed()` — **15 occurrences total. READ.**

| file:line | Kind |
|---|---|
| `lib/commerce-policy.ts:39` | **the definition** |
| `app/manage/[token]/page.tsx:16` | import |
| `components/FeatureGate.tsx:4` | import |
| `app/manage/[token]/page.tsx:425` | call — trial auto-land on Billing |
| `app/manage/[token]/page.tsx:438` | call — trial-reminder **trigger** |
| `app/manage/[token]/page.tsx:732` | **comment** referencing it |
| `app/manage/[token]/page.tsx:737` | call — trial-reminder **render** |
| `app/manage/[token]/page.tsx:10180` | call |
| `app/manage/[token]/page.tsx:10546` | call |
| `app/manage/[token]/page.tsx:10555` | call |
| `app/manage/[token]/page.tsx:10588` | call — gated with `truck.trial_expires_at` |
| `app/manage/[token]/page.tsx:10618` | call |
| `app/manage/[token]/page.tsx:10648` | call |
| `app/manage/[token]/page.tsx:10712` | call — upgrade modal |
| `components/FeatureGate.tsx:58` | call — the "Upgrade →" link |

🔴 **ACTUAL CALL SITES (excluding the definition, 2 imports and 1 comment): 11.**
✅ **This matches §40's "Eleven gates" exactly.** **No gate has been lost, and none added, since V11.3.**

⚠️ **Every call is in `app/manage/[token]/page.tsx` (10) or `components/FeatureGate.tsx` (1)** — also
exactly as §40 records. **NEW observation: the 14 August Menu-layout control was added to
`app/dashboard/[token]/page.tsx`, which contains ZERO `purchaseCtaAllowed` calls.** That is correct — a
layout preference is not a purchase CTA — but it means **the dashboard Settings tab is now a surface with
operator-facing settings and no commerce gate at all.** Nothing there needs one today; **it is a place a
future CTA could be added without meeting an existing guard.**

## 15. The manage page's hydration property — ✅ **INTACT. READ.**

```
200:  const [loading, setLoading] = useState(true)
```
```tsx
508:  if (loading) return (
509:    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
510:      <div className="flex flex-col items-center gap-3"><Spinner /><p className="text-slate-400 text-sm">Loading management console...</p></div>
511:    </div>
```

✅ **Both halves hold: `loading` still starts `true`, and the component still early-returns at `:508`,
before any gated markup.** §40's load-bearing property — *"the first client render is therefore already
post-mount, so direct inline evaluation of the predicate cannot flash a CTA for a frame"* — **is
preserved.** The earliest `purchaseCtaAllowed()` render-path call is `:737`, comfortably after `:508`.

⚠️ **There is a second, unrelated `const [loading, setLoading] = useState(false)` at `:10846`** — a
different component in the same file. **It is not this guard**; do not confuse them. And `:7274`
`if (loadingEvents && isActive) return` is `ScheduleTab`'s own, also unrelated.

## 16. `lib/features.ts` — 23 declared Features, and **13 have no gate anywhere**

**READ** — the `Feature` union declares **23** members.

| Feature | Gate found? | Where |
|---|---|---|
| `discovery_map` | 🔴 **NONE** | — |
| `web_dashboard` | 🔴 **NONE** | — |
| `ipad_kds` | 🔴 **NONE** | — |
| `qr_menu` | 🔴 **NONE** | — |
| `meal_deals` | 🔴 **NONE** | — |
| `upsells` | 🔴 **NONE** | — |
| `walkup_orders` | 🔴 **NONE** | — |
| `online_ordering_pay_at_hatch` | 🔴 **NONE** | — |
| `sold_out_toggle` | 🔴 **NONE** | — |
| `stock_countdown` | 🔴 **NONE** | — |
| `offline_protection` | 🔴 **NONE** | — |
| `online_payments` | 🔴 **NONE** — the single hit is `app/admin/page.tsx` (an override label) | — |
| `advance_preordering` | ✅ **canAccess ×4** | `api/menu/[truckId]:420`, `api/manage:609`, `api/orders/submit:507,943`, `manage:1907` |
| `time_slot_selection` | 🔴 **NONE** | — |
| `smart_batch_pacing` | 🔴 **NONE** | — |
| `auto_accept` | 🔴 **NONE** — hits are an allow-list string, a log `trigger`, and a wizard row `id` | — |
| `instagram_messenger_replies` | 🔴 **NONE** | — |
| `branded_qr_code` | ✅ **canAccess + hasFeature + can()** | `dashboard:1247` (**hasFeature**), `manage:8390, 8518, 9226` |
| `advanced_reporting` | ✅ **canAccess ×1** | `manage:10821` |
| `ticket_printing` | ✅ **canAccess ×1** | `components/printing/PrintingSettings.tsx:75` |
| `multi_device_kds` | 🔴 **NONE** — single hit is the admin override list | — |
| `cook_screen` | ✅ **can() ×2** | `kds:869, 1039` |
| `whatsapp_replies` | ✅ **canAccess ×3 + can() ×1** | `webhooks/meta/whatsapp:86`, `webhooks/whatsapp:53,55`, `manage:8972` |

🔴 **RECOUNTED MECHANICALLY FROM THE 23 ROWS OF THE TABLE ABOVE, 14 August 2026 — the first
statement of these figures was internally inconsistent and is corrected here:**

| | Count |
|---|---|
| **Total Features declared** in the `Feature` union | **23** |
| **Gated** (a `canAccess` / `hasFeature` / `can()` call exists) | **7** |
| 🔴 **Ungated** (no gate anywhere) | **16** |

**The 7 GATED:** `advance_preordering`, `branded_qr_code`, `advanced_reporting`, `ticket_printing`,
`cook_screen`, `whatsapp_replies` — and that is **6**. ⚠️ **The seventh does not exist: recounting the
table's ✅ rows gives SIX.**

**FINAL FIGURES: 23 declared · 6 gated · 17 ungated.**

**The 17 UNGATED, listed in full:** `discovery_map`, `web_dashboard`, `ipad_kds`, `qr_menu`,
`meal_deals`, `upsells`, `walkup_orders`, `online_ordering_pay_at_hatch`, `sold_out_toggle`,
`stock_countdown`, `offline_protection`, `online_payments`, `time_slot_selection`,
`smart_batch_pacing`, `auto_accept`, `instagram_messenger_replies`, `multi_device_kds`.

⚠️ **The earlier "13 of 23 … 10 are gated" was wrong twice over** — the two numbers did not sum to 23,
and the prose beneath then listed thirteen names under the words "the other nine". **Counting the table's
own rows is what settles it, and that is what the figures above are.**

⚠️ **METHOD, stated because it changes the numbers:** my first pass counted only literal `canAccess('x')`
/ `hasFeature('x')` and reported 15 ungated. **That was wrong** — `lib/useFeatures.ts:39` exposes
`can: (feature) => canAccess(plan, feature, overrides, trialExpiresAt)`, so `can('cook_screen')` is a
real gate. **The table above counts `can()` too**, and I then hand-separated genuine gates from
admin-override strings and unrelated identifiers. **`auto_accept` is the clearest example of why: three
matches, none of them a gate.**

✅ **§27 records "THE FOUR UNENFORCED FEATURE GATES — `auto_accept`, `meal_deals`, `upsells`,
`offline_protection`". All four are confirmed still ungated.**
🔴 **NEW: the real number is 13, not 4.** The other nine — `discovery_map`, `web_dashboard`, `ipad_kds`,
`qr_menu`, `walkup_orders`, `online_ordering_pay_at_hatch`, `sold_out_toggle`, `stock_countdown`,
`time_slot_selection`, `smart_batch_pacing`, `instagram_messenger_replies`, `online_payments`,
`multi_device_kds` — are not listed there. **INFERRED**: most are core-on-every-plan and need no gate;
**`online_payments`, `multi_device_kds`, `time_slot_selection` and `instagram_messenger_replies` are
plan-differentiated in the matrix and are the ones worth a decision.**

---

# PART 4 — BYTE INTEGRITY

## 17. NUL-byte scan of every file opened — **byte-level, never grep**

**Tool: Python, `open(path,'rb').read().count(<the NUL byte>)`.** Reads bytes, never decodes, has no
binary guard to trip — grep is defeated by the exact byte being searched for.

| File | NUL | Bytes |
|---|---|---|
| `docs/reference-manual.md` | 0 | 1,401,347 |
| `ios/App/App/App.entitlements` | 0 | 631 |
| `ios/App/App/AppRelease.entitlements` | 0 | 852 |
| `ios/App/App/Info.plist` | 0 | 1,761 |
| `ios/App/App/capacitor.config.json` | 0 | 931 |
| `ios/App/App.xcodeproj/project.pbxproj` | 0 | 15,623 |
| `capacitor.config.ts` | 0 | 4,307 |
| `package.json` | 0 | 1,777 |
| `app/dashboard/[token]/page.tsx` | 0 | 364,164 |
| `app/dashboard/[token]/kds/page.tsx` | 0 | 91,699 |
| `components/dashboard/AddOrderPanel.tsx` | 0 | 165,264 |
| `app/trucks/[slug]/order/page.tsx` | 0 | 275,465 |
| `app/manage/[token]/page.tsx` | 0 | 782,853 |
| `app/admin/page.tsx` | 0 | 116,750 |
| `lib/features.ts` | 0 | 6,402 |
| `lib/useFeatures.ts` | 0 | 1,833 |
| `lib/plan-features.ts` | 0 | 21,839 |
| `lib/commerce-policy.ts` | 0 | 3,519 |
| `components/FeatureGate.tsx` | 0 | 2,700 |
| `components/printing/PrintingSettings.tsx` | 0 | 13,754 |
| `components/manage/PaymentsTab.tsx` | 0 | 56,322 |
| `app/landing/page.tsx` | 0 | 34,842 |
| `app/landing/landing.css` | 0 | 31,072 |
| `node_modules/@capacitor/ios/Capacitor/…/PrivacyInfo.xcprivacy` | 0 | 373 |
| `node_modules/@capacitor/ios/CapacitorCordova/…/PrivacyInfo.xcprivacy` | 0 | 373 |

✅ **TOTAL: 0 NUL bytes across all 25 files opened.**

⚠️ **`lib/menu-commit.ts` was NOT opened in this task** — it was fixed on 14 August and is recorded clean
in `docs/menu-commit-nul-fix-report.md`. Not re-verified here.

---

# SUMMARY — GAPS AGAINST WHAT IS ALREADY RECORDED

### 🔴 CORRECTED 14 August 2026 — TWO "STILL OPEN" CLAIMS WERE WRONG. BOTH ARE BUILT.

**They were read out of §27 and §40 rather than verified against code. §41 and §43 record both as BUILT
in V11.4, and the files confirm it.** Cited below by FILE, not by manual section — which is the whole
lesson: **a manual section is a description of code, and a description of code is not the code.**

**ACCOUNT DELETION — 🔴 BUILT. Guideline 5.1.1(v) is satisfied.** READ:
- **`lib/account-deletion.ts` EXISTS** (11,461 bytes) and exports `DELETION_WINDOW_DAYS = 30`,
  `RENOTIFY_INTERVAL_HOURS = 24`, `ANON_LABEL = '[deleted]'`, `class AccountDeletionError`,
  `interface AccountDeletionResult`, and
  `export async function executeAccountDeletion(supabase: SupabaseClient, operatorId: string): Promise<AccountDeletionResult>`.
- **Routes:** `app/api/account/request-deletion/route.ts` (the operator-facing request — GET reports
  pending state, POST stamps `deletion_requested_at`/`deletion_due_at`);
  `app/api/admin/execute-account-deletion/route.ts:85` `await executeAccountDeletion(supabase, operatorId)`;
  `app/api/cron/account-deletion-due/route.ts` (re-notifies, deletes nothing).
- **UI:** `components/manage/DeleteAccountSection.tsx` — a `Danger zone` section
  (`className="mt-10 rounded-2xl border border-slate-200 bg-white p-5"`), heading
  `text-sm font-black uppercase tracking-wide text-red-800`, body `Delete your account`, and the button
  `className="shrink-0 self-start rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 sm:self-auto"`
  labelled **`Delete account…`**, opening a `role="alertdialog"`.
- **Where and who:** **Manage → Settings**, mounted at `app/manage/[token]/page.tsx:10243`
  — `{userRole === 'owner' && <DeleteAccountSection … />}`. 🔴 **OWNER ONLY.** Managers get no rendered
  control; staff are redirected out of Manage entirely (`:455`).
- **CAN AN OPERATOR DELETE FROM INSIDE THE APP TODAY? — 🔴 YES for an owner, NO for a manager or staff**,
  and `app/manage/[token]/page.tsx:10243` is the line that decides it.
  ⚠️ **What the button does is REQUEST a deletion** (30-day pending state); execution is a manual admin
  step by design — `app/api/cron/account-deletion-due/route.ts` deletes nothing. **5.1.1(v) requires an
  in-app way to initiate deletion, which exists.**
- **Does it call `deleteTruckCascade`? — 🔴 NO.** `grep` over `lib/account-deletion.ts` returns **three**
  matches, **all in comments**: `:6`, `:14` (*"…MUST NOT delete trucks, orders or order_payments"*) and
  `:72`. **There is no import of `lib/delete-truck` and no call.** §41's invariant holds.

**PRIVACY POLICY AND TERMS — 🔴 BUILT AND PUBLISHED. Guideline 5.1.1(i) is satisfied.** READ:
- **`content/legal/privacy-policy.md` (9,438 B)** and **`content/legal/terms-and-conditions.md` (19,189 B)**
  — the only two files in that directory.
- **Routes exist:** `app/(legal)/privacy/page.tsx` and `app/(legal)/terms/page.tsx`, each reading its `.md`
  at build time via `fs.readFileSync` and rendering through `renderLegalMarkdown`.
- **`lib/legal.ts`** exports `PRIVACY_PATH = '/privacy'`, `TERMS_PATH = '/terms'`,
  `PRIVACY_UPDATED = '6 August 2026'`, `TERMS_UPDATED = '6 August 2026'`, `LEGAL_LINKS`.
- **In-app links:** `components/dashboard/UserMenu.tsx:261-273`, below an `<hr className="border-slate-100" />`,
  each `className="flex items-center gap-2 px-4 py-2.5 text-xs text-slate-500 hover:bg-slate-50"`,
  labelled **Privacy policy** and **Terms**. ✅ **The `text-xs text-slate-500` §43 calls load-bearing is
  present as specified.**
- **REACHABLE PER ROLE — §43's claim VERIFIED, not repeated:** `grep -rn "<UserMenu"` returns exactly
  **three** render sites — `app/dashboard/[token]/page.tsx:2654`, `app/manage/[token]/page.tsx:566`,
  `app/admin/page.tsx:718`. **The KDS renders none (count: 0).** The dashboard's wrapper is
  `<span className={isDemo ? 'sm:hidden' : undefined}>` — **a demo/breakpoint condition, never a role
  gate**, exactly as §43 states.
  - **owner — YES** (dashboard, 1 tap) · **manager — YES** (dashboard, 1 tap) ·
    **staff — YES** (dashboard, 1 tap; or 2 from the KDS).
  - 🔴 **The staff path is real:** `app/dashboard/[token]/kds/page.tsx:1011-1017` renders an
    `<AppLink href={`/dashboard/${token}`}>` whose own comment says *"Unconditional (all roles)"* — and it
    sits outside every conditional in the header.

**Still open, and unchanged:** the **2.1(a) demo account**, **`/admin` blocking `scrollEnabled: false`**,
and the unenforced feature gates (**recounted in item 16: 6 gated, 17 ungated, not "four"**).

**NEW, not in the manual:**

| # | Finding | Provenance |
|---|---|---|
| 1 | 🔴 **No app-level `PrivacyInfo.xcprivacy`** — only the two SDK copies in `node_modules` | READ |
| 2 | 🔴 **12/12 Capacitor deps on `^`, none pinned** | READ |
| 3 | 🔴 **13 of 23 Features ungated**, not the 4 recorded | READ + hand-classified |
| 4 | 🔴 **Messenger + Instagram render as `disabled` inputs placeholdered "Coming soon"** | READ |
| 5 | ⚠️ **`MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` both `1.0`/`1`** in both configs | READ |
| 6 | ⚠️ **No `ITSAppUsesNonExemptEncryption`** → export-compliance prompt every upload | READ |
| 7 | ⚠️ **`UIRequiredDeviceCapabilities = armv7`** — scaffold residue | READ |
| 8 | ⚠️ **`EventTimeSelect` meets no 44pt target at any of 8 sites**, and lost the 48px its row siblings keep | READ + INFERRED arithmetic |
| 9 | ⚠️ **A local `cap sync` can bake a localhost `server.url`** with nothing enforcing a revert at archive time | READ |
| 10 | ✅ **The Add Order `<main>` is identical in both layout modes** — the 14 Aug work did not move it into §27's defect group | READ |
| 11 | ✅ **`TARGETED_DEVICE_FAMILY = "1,2"` in BOTH configurations** (`project.pbxproj:322` Debug, `:345` Release) — the app declares **iPhone (1) AND iPad (2)**, i.e. **universal**. ⚠️ Consequence: **App Review will test on iPhone**, and every screenshot set must cover both. The manual documents this as an iPad product throughout | READ |

## 🔴 A MANUAL DEFECT TO LOG — §40's "Related, and NOT resolved" IS ITSELF STALE

**§40 closes with:** *"Account deletion, the privacy policy and terms, and the 2.1(a) demo account are all
**open** and are recorded in §27. **None of them is discharged by this section.**"*

🔴 **Two of those three were closed by V11.4 and §40 was never updated.** §41 records account deletion as
built and §43 records the legal pages as built and published — **both are later sections of the same
manual, and §40 still points a reader at §27's older, open version.** §27's own "APP STORE SUBMISSION
BLOCKERS" block carries the same stale text.

⚠️ **This is a MANUAL defect, not a code defect.** The code is correct and complete on both counts; the
document contradicts itself across sections. **It is what produced the wrong findings in the first
version of this report** — §40 was read, §41 and §43 were not, and nothing in §40 pointed to them.

**To log:** amend §40's closing block and §27's blocker list to name only the **2.1(a) demo account** as
open, and cross-reference §41 and §43. **No code change is implied.**

## WHAT I HAVE NOT DONE

1. **No build, no archive, no `cap sync`, no upload.** Nothing was validated against App Store Connect.
2. **I did not open `package-lock.json`**, so "unpinned" is about declared ranges only.
3. **I did not audit the web bundle for APIs needing usage-description keys** (camera, mic, location).
4. **I did not verify SPM surfaces the two SDK privacy manifests into the archive** — INFERRED.
5. **I did not read `AppDelegate.swift` or `HGBridgeViewController.swift`.**
6. **I did not open `content/legal/`** beyond what §27 records about it.
7. **Nothing was rendered.** All heights in item 10 are arithmetic from classes.
8. **The 2.1 reading in item 12 is a judgement**, not a quoted guideline.
