# Android platform-capability audit — READ AND REPORT ONLY

**Nothing was changed, edited, built or run.** No file outside this report was written. No Gradle task,
no `next dev`, no device, no emulator. No fix was applied to anything found below.

**Prompt integrity:** no span arrived garbled, and no instruction contradicted another. ("Change nothing"
and "write your report to `docs/…`" are consistent — the report is the sanctioned output.)

## Which of the three I did — plainly

**None of them.** I did **not** parse, **not** typecheck, and **not** execute. This is file reads and
greps only. Nothing was rendered, no APK was built, no route invoked, no database queried.

**Nothing in this report has been observed running on Android by me.** Where I say a capability "has been
run on Android", that is a claim I am *reading out of source comments that record a device session* —
attributed as such — not something I watched.

## Method

Worked **from the capabilities outward**, as instructed. The starting point was not the plugin list but a
sweep for every platform-conditional expression in application source:

```
grep -rnE "getPlatform\(\)|isNativePlatform\(\)|platform === '|platform !== '|'android'|'ios'|isNativeApp\(\)|purchaseCtaAllowed"
  --include=*.ts --include=*.tsx app components lib hooks
```

🔴 **THE SINGLE MOST IMPORTANT RESULT OF THAT SWEEP: across the whole codebase there are exactly TWO
places that branch on `getPlatform()`** —

- `lib/commerce-policy.ts:45` — `return Capacitor.getPlatform() !== 'ios'`
- `lib/native/push.ts:178` — `if (Capacitor.getPlatform() === 'android')`

**Every other one of the ~110 hits is a native-vs-web gate, not an iOS-vs-Android one.** And
`android/app/src/main/java/com/hatchgrab/app/MainActivity.java` is, in full:

```java
package com.hatchgrab.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

**There is no custom Android native code in this project.** (`find android/app/src -name "*.java" -o -name
"*.kt"` returns three files: this one and two untouched Capacitor scaffold tests.)

**So the honest summary of the whole audit is: almost nothing is Android-specific, and almost nothing has
been observed on Android.** The detail below is mostly about which of those two facts bites.

---

## 1. Biometric / device authentication

**Exists: YES. Platform-gated: NO (native-vs-web only). Ever run on Android: NO EVIDENCE.**

`lib/native/appLock.ts` is a per-device app-lock — **device security, explicitly not authentication**.
`:1-3`:

```ts
// Per-device biometric / passcode APP-LOCK. DEVICE-level security (someone picks up the unlocked iPad) —
// SEPARATE from authentication (the login/session stays). Toggle is per-device (localStorage), OFF by
// default. No-op on web. Backed by @aparajita/capacitor-biometric-auth (native project).
```

The prompt asks about "the login or session path" specifically. **It is not in it.** `app/login/page.tsx`
branches only on `isNativeApp()` (`:31`, `:50`) to choose the Supabase client; nothing there calls
`verifyIdentity`. The gate is `components/native/AppLockGate.tsx`, an overlay over the console.

The prompt call, `appLock.ts:75-87`:

```ts
export async function verifyIdentity(reason = 'Unlock HatchGrab'): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    await BiometricAuth.authenticate({
      reason,
      allowDeviceCredential: true,   // passcode fallback when biometry isn't enrolled/available
      iosFallbackTitle: 'Use passcode',
      cancelTitle: 'Cancel',
    })
    return true   // authenticate() resolves on success, throws on cancel/failure
  } catch { return false }
}
```

⚠️ **Every option passed is generic or iOS-specific.** `iosFallbackTitle` is iOS-only; **no
`androidTitle`, `androidSubtitle`, `androidConfirmationRequired` or `androidBiometryStrength` is set** —
`grep -rn "androidTitle\|androidSubtitle\|androidBiometryStrength" lib components` returns **zero hits**.
On Android the prompt therefore renders the plugin's defaults, whatever those are.

⚠️ **The file's own hardware note names only iOS**, `:5-6`:

```ts
// ⚠️ HARDWARE-GATED: real Face ID / Touch ID behaviour only confirms on a physical device; the simulator
// can fake a match. Needs `npx cap sync ios` + the Face ID usage description (NSFaceIDUsageDescription).
```

🔴 **The one place Android WAS considered is a copy fix, and it records that the copy had been wrong on
every Android device** — `components/native/OperatorDeviceConfig.tsx:274-278`:

```
// NOTE: THE COPY NAMES THE CONCEPT, NOT A VENDOR. lib/native/appLock.ts uses
// @aparajita/capacitor-biometric-auth, which is registered in android/capacitor.settings.gradle as
// well as on iOS — so "Face ID / Touch ID" was false on every Android device, in all three strings
// below. "fingerprint or face unlock" is the one phrase true on both…
```

**Android wiring that IS in place** (read, not assumed): the plugin is included at
`android/capacitor.settings.gradle:5-6`; its own manifest declares an `<activity android:name=".AuthActivity">`;
and `USE_BIOMETRIC` appears in the merged manifest (contributed by androidx.biometric, not by us).

### 🔴 What would happen on Android today — and the one thing I cannot settle

`AppLockGate.tsx:6-10` describes a loop guard whose entire justification is the **iOS** lifecycle:

```
//  1. LOOP: presenting the biometric prompt makes iOS resign-active, and dismissing it (even on SUCCESS) makes
//     it become-active → the resume handler re-locked + re-prompted → infinite loop (hard lockout). We guard
//     with authInProgress and CONSUME it on the resume event itself (see below), so our prompt's own dismissal
//     can't re-lock, while a genuine background→foreground still does.
```

`authInProgress` is set before `authenticate()` and **cleared only by the next `appStateChange`**
(`:32`, `:35`, `:50`). `lib/native/app.ts:11-12` shows that event is `@capacitor/app`'s `appStateChange`.

**Two Android outcomes are possible and the repo settles neither:**
- If Android's `BiometricPrompt` is an in-activity dialog that fires no `appStateChange`, the guard
  **latches true**, and the next genuine background→foreground is swallowed — the lock silently stops
  re-locking, which is the feature's entire purpose.
- If the plugin's `AuthActivity` launches as a separate Activity (its manifest declares one), a
  pause/resume *does* fire and the guard behaves as on iOS.

**CANNOT DETERMINE from this repository.** It needs a device. It is the single highest-value biometric
test on Android.

---

## 2. Bluetooth printer connectivity

**Exists: YES, fully built. Android-specific code path: essentially NONE. Ever run against a physical
printer on Android: NO — and there is no evidence it has been run against one on ANY platform.**

`lib/printing/bleTransport.ts` (338 lines) implements the whole transport. Its header, `:2-19`:

```ts
// ── BLUETOOTH LE TRANSPORT — the real backend behind PrinterTransport ─────────────────────────────────
// Implements the seam in ./transport.ts against @capacitor-community/bluetooth-le (pinned 8.3.0).
…
// ── DISCOVERY, NOT A HARD-CODED MODEL ────────────────────────────────────────────────────────────────
// There is no standard "ESC/POS over BLE" UUID. Vendors use their own: 18f0/2af1 (many Chinese modules),
// ff00/ff02, e7810a71-… (Star), and others. Hard-coding one would support one family of printers and
// silently fail on the rest, and the failure would look like "the printer is broken".
```

What it does, mechanically: `availability()` (`:154-167`) four-states unsupported/unauthorised/off/available;
`scan()` (`:174-193`) a bounded 6-second `requestLEScan` reading `deviceId`, `name`/`localName` and `uuids`;
`connect()` (`:211-258`) three checks — GATT link, a writable characteristic outside the generic services,
and an `ESC @` probe; `sendBytes()` (`:276-301`) 180-byte chunks with a 12 ms gap.

### Android-specific code: one line, and it is a runtime option, not a code path

`grep -rniE "android|getPlatform" lib/printing/*.ts components/printing/*.tsx` returns **five hits, four of
which are comment prose**. The only executable one is `:122`:

```ts
    await BleClient.initialize({ androidNeverForLocation: true })
```

with its note at `:106-118` (excerpted):

```ts
  // ANDROID ONLY; iOS ignores it entirely. Without it the flag defaults FALSE, and the plugin's own
  // initialize() (BluetoothLe.kt, the SDK_INT >= S branch) then requests ACCESS_FINE_LOCATION ALONGSIDE
  // BLUETOOTH_SCAN and BLUETOOTH_CONNECT.
  // ⚠️ IT NARROWS WHAT ANDROID RETURNS, AND THAT IS THE TRADE. Android honours the assertion by filtering
  // out results whose only purpose could be location inference — chiefly BEACONS.
```

**There is no `if (getPlatform() === 'android')` anywhere in the printing stack.** One code path serves both.

### Has it ever been run against a physical printer on Android? No.

**Stated plainly: no, and I found no evidence it has been run against a physical printer on any platform.**

The only device observation in the file is `:43-45`, and it is about **accessories, not a printer**:

```ts
// DEVICE-OBSERVED 15 August: the list offered "Dominic's Apple Watch" and "Dominic's AirPods Pro" with a
// Connect button beside each, and connecting to one SUCCEEDED. A reviewer who sees a printer list offering
// AirPods concludes the feature is broken.
```

Everything else in the stack is written in the future tense about hardware —
`lib/printing/usePrinting.ts:159` (*"the first real ESC/POS byte would be produced on the day hardware
arrives"*), `lib/printing/transport.ts:17` (*"the day hardware lands"*),
`components/printing/PrintingSettings.tsx:177` (*"can be set up before the hardware arrives"*).
`docs/printing-report.md:143` frames the only live rendering case as *"a Max/trial **iPad**"*.

⚠️ **The 15 August observation does not state its platform.** Given the surrounding iOS framing it reads as
an iPad, but the source does not say so — **CANNOT DETERMINE**.

⚠️ **A prior report's Android note is now out of date and should not be relied on.**
`docs/printing-architecture-report.md:560` says *"`BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` … Neither is in
`AndroidManifest.xml` today — INFERRED from the plugin being absent; I did not read the manifest"*. Both
**are** in the merged manifest, contributed by the plugin. Its `:559` note that Android could reach classic
Bluetooth SPP is also moot: this transport is **BLE only**, on both platforms.

### What would happen on Android today

`connect()` returns a `PrintResult`, so a failure is surfaced. The realistic Android-first unknowns, none
resolvable from source: whether `neverForLocation` filtering hides a given printer's advertisement; whether
the plugin's MTU request lands (`:79` notes it "requests a larger MTU on Android"); and whether
`writeWithoutResponse` pacing at 180/12 ms holds on Android's stack. **All unverified.**

---

## 3. Push notifications

**Delivered to an Android device: NO EVIDENCE. Token acquisition on Android: YES, recorded.**

The prompt asks only whether an actual push has ever been **delivered**, as opposed to validated. The answer
splits, and the split matters:

**✅ Registration IS observed on Android**, and the source records the session in forensic detail —
`lib/native/push.ts:123-133`:

```ts
    // THE BUG THIS FIXES (Android emulator, deployed build dpl_2MJdE35s…, logcat):
    //     Capacitor/PushNotificationsPlugin  V  Notifying listeners for event registration
    //     Capacitor/PushNotificationsPlugin  D  No listeners found for event registration
    // Registration SUCCEEDED — Firebase initialised, FCM returned a token — and the token was discarded,
```

and `:100-104` records a real Android crash observed twice with PIDs. `docs/printing-architecture-report.md:563`
puts it as *"Android is the better-validated platform on push (FCM has a live token; iOS has never
registered one)"*.

**🔴 But a token is not a delivery, and I found no record of a message arriving.** A repo-wide grep of
`push.ts`, `fcm.ts`, `apns.ts` for `delivered|DELIVERED|logcat|emulator` returns only: the registration
logcat above, `apns.ts:244`/`:252` reasoning about *ambiguous* delivery reporting, and `push.ts:74`/`:122`
about the token event. **Nothing anywhere states that a notification was received on a device.**

**And locally it could not be sent.** `lib/fcm.ts:12-16` states the precondition:

```ts
// ⚠️ CANNOT BE FULLY VALIDATED WITHOUT: FCM_SERVICE_ACCOUNT_JSON set in the deployed environment, the
// android/app/google-services.json whose project_id MATCHES that service account, and a physical
// Android device (or emulator) whose van_devices row carries platform='android' and a push_token.
```

Checked (presence only, no values printed): `android/app/google-services.json` exists, `project_id`
`hatchgrab`, package `com.hatchgrab.app` — **matching `applicationId`**, so the client half is correct.
But **`FCM_SERVICE_ACCOUNT_JSON` in `.env.local` is one character long** — it cannot be a service-account
JSON, so `fcmConfig()` (`fcm.ts:25-40`) returns null and logs
*"NOT CONFIGURED … Android push is DISABLED. No notification was sent."*

⚠️ **CANNOT DETERMINE** whether the deployed (Vercel) environment has a real value. `.env.local` is the
local file; production env is not visible from this repository.

⚠️ **One further gap that would make a delivered push do nothing visible:** the tap handler is
`onOpenOrder`, and `OperatorDeviceConfig.tsx:21-24` records it was *"dead on iOS AND Android since the day
it was written"*. It is now passed (`app/dashboard/[token]/page.tsx:2975`), but **the tap path has never
been exercised on Android** either.

---

## 4. Camera / QR scanning, file picking, sharing, printing

| Sub-capability | Exists | Established by |
|---|---|---|
| **Camera** | 🔴 **NO** | zero hits |
| **QR *scanning*** | 🔴 **NO** | zero hits |
| **QR *generation*** | ✅ yes (web canvas) | `lib/generateQRCode.ts` |
| **File picking** | ⚠️ web `<input type="file">` only | 8+ hits, no plugin |
| **Sharing** | ⚠️ web `navigator.share` only | 3 hits, no plugin |
| **Document printing** | 🔴 **NO** | zero hits for `window.print` |
| **Clipboard** | ⚠️ web `navigator.clipboard` only | 8 hits |
| **In-app browser** | 🔴 **NO** | zero hits |

**The searches that established each absence**, all over `app/`, `components/`, `lib/`, `hooks/`
(`--include=*.ts --include=*.tsx`, case-insensitive, `node_modules` excluded):

- **Camera / QR scan** — `@capacitor/camera|getUserMedia|BarcodeScanner|qr-scanner|jsQR|ZXing|zxing|<input[^>]*capture`
  → **ZERO HITS**. Corroborated by `ls node_modules/@capacitor/`: the ten installed packages are
  `android, app, cli, core, ios, local-notifications, network, preferences, push-notifications, status-bar`
  — **no camera, no barcode scanner**. 🔴 **The product generates QR codes for customers to scan; it never
  scans one.**
- **Document printing** — `window.print|@capacitor/printer|react-to-print` → **ZERO HITS**. All printing is
  the BLE thermal path in §2.
- **In-app browser** — `@capacitor/browser|InAppBrowser|Browser.open` → **ZERO HITS**. External links are
  plain `<a target="_blank">`, handed to the OS browser by `server.allowNavigation` in `capacitor.config.ts:46`.
- **Haptics** — see §6.

**File picking** is `<input type="file">` in Manage (`app/manage/[token]/page.tsx:981`, `:1055`, `:4024`,
`:4430`, `:4761`, `:5674`) and `components/DemoGetStarted.tsx:868`, `:877`. There is **no Capacitor
Filesystem or FilePicker plugin**, so this depends entirely on the Android WebView's `onShowFileChooser`
bridge. The merged manifest carries **no `CAMERA` and no `READ_MEDIA_IMAGES`**.
⚠️ **CANNOT DETERMINE** whether the chooser's "take a photo" option works without `CAMERA`; SAF file
selection normally needs no permission. **Never exercised on Android.**

**Sharing** — `app/trucks/[slug]/TruckClient.tsx:90-93` is representative:

```ts
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
```

🔴 **This is a customer-facing surface, not an operator one, so it is not in the shell's normal path** —
but if reached, the two platforms diverge: **INFERRED** — the Web Share API is implemented in WKWebView
(iOS) and is **not** implemented in the Android System WebView. On Android the `canShare` guard would be
false and it falls back to the clipboard, silently. **The fallback exists, so nothing breaks** — the share
sheet simply never appears. Marked INFERRED: this is platform behaviour, not read from this repo.

---

## 5. Keep-awake / screen-on, and backgrounding

**Exists: YES. Platform-gated: native-vs-web. Android-verified: NO — but Android WAS reasoned about.**

`lib/native/keepAwake.ts` (250+ lines) publishes true state rather than intent —
`export type WakeState = 'held' | 'denied' | 'unsupported' | 'insecure' | 'native' | 'off' | 'unknown'` (`:23`).

🔴 **The `'unknown'` state exists because of an iOS-specific failure, and the comment says so explicitly**,
`:14-22`:

```ts
// ── 🔴 'unknown' — ADDED 5 August 2026. READ THIS BEFORE COLLAPSING IT INTO 'off'. ─────────────────
// 'off' used to be published when a RELEASE FAILED, on the reasoning that "our intent is off" and that a
// stuck-on screen is self-correcting because the flag is window-scoped. That reasoning is Android's
// (FLAG_KEEP_SCREEN_ON dies with its Window) and is FALSE on iOS, where the plugin sets
// UIApplication.shared.isIdleTimerDisabled — a PROCESS-WIDE property that survives backgrounding…
```

**So on Android the original reasoning was correct and `'unknown'` is over-cautious — harmless, but it
means the state machine is tuned for a failure mode Android does not have.**

**What happens on backgrounding**, `:163-179`:

```ts
/** Background ⇒ release (the process-wide flag must not outlive a visible screen).
 *  Foreground ⇒ reconcile, then restore whatever the SETTING says. */
async function onNativeVisibilityChange(): Promise<void> {
  if (!Capacitor.isNativePlatform() || typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') {
    await nativeRelease()          // intent preserved, so foreground can restore it
    return
  }
  await reconcileWakeState()
  await (nativeIntent ? nativeAcquire() : nativeRelease())
}
```

Driven by a `visibilitychange` listener (`:178`) — a **web** event, not `appStateChange`. It fires in both
WebViews. ⚠️ On Android this release is belt-and-braces: `FLAG_KEEP_SCREEN_ON` already dies with the Window.

⚠️ **Android's native-throw hazard IS documented here**, `:191-194`: *"Android's Bridge rethrows a plugin
exception as RuntimeException on a background HandlerThread (Bridge.java:848-851) … so a native throw kills
the process before control returns."* Read from the installed plugin source; **never observed**.

**Backgrounding elsewhere** — `lib/native/app.ts:6-19` wraps `appStateChange`, consumed by `AppLockGate`
(§1) and by the heartbeat. `docs/android-inventory-report.md` §B6 covered the home-button case.

---

## 6. Haptics, sound playback, notification channels

### Haptics — 🔴 DOES NOT EXIST

Search `Haptics|@capacitor/haptics|vibrate` over `app/`, `components/`, `lib/`, `hooks/` → **ZERO HITS**.
`@capacitor/haptics` is not installed (see the ten-package list in §4). **Nothing vibrates, on either
platform.**

### Sound — 🔴 EXISTS, AND THE CUSTOM SOUND FILE DOES NOT

Three helpers in `lib/native/notifications.ts` schedule local notifications, and **they disagree with each
other about both sound and icon**:

```ts
// :35  notifyLocal
      notifications: [{ id: …, title, body, sound: 'default', smallIcon: 'ic_launcher', actionTypeId: '', extra: null }],
// :63  playNewOrderAlert
      notifications: [{ id: …, title: 'New order', body: `Order ${orderNumber} received`, sound: 'default', smallIcon: 'ic_launcher', … }],
// :73-81  notifyNewOrder — no smallIcon, and a DIFFERENT sound
        sound: 'beep.wav',
```

and `capacitor.config.ts:83-87` sets the defaults:

```ts
    LocalNotifications: {
      smallIcon: 'ic_stat_hatchgrab',
      iconColor: '#EF8B2C',
      sound: 'beep.wav',
    },
```

🔴 **`beep.wav` DOES NOT EXIST ANYWHERE IN THE REPOSITORY.** `find . -name "beep.wav"` excluding
`node_modules` → **ZERO HITS**, and **`android/app/src/main/res/raw/` does not exist at all** (`ls` returns
nothing). An Android custom notification sound must live in `res/raw/`. **So the configured sound and the
`notifyNewOrder` sound both name a file that is not in the build — on either platform.** What plays instead
is the channel's default. **Never observed.**

🔴 **`smallIcon: 'ic_launcher'` is the white-square defect, hardcoded in two of the three helpers.** The
app's own manifest warns about exactly this for the FCM path,
`android/app/src/main/AndroidManifest.xml:45-48`:

```xml
        <!-- ── 🔴 THE NOTIFICATION ICON. WITHOUT THIS ANDROID FLATTENS THE LAUNCHER ICON TO ITS ALPHA. ──
             A full-colour launcher icon has alpha=255 everywhere inside its square, so the status bar
             renders it as a SOLID WHITE SQUARE. `ic_stat_hatchgrab` is a flat white-on-transparent
             silhouette; Android reads only its alpha channel and tints it with `iconColor`. -->
```

**The FCM path is protected by `default_notification_icon`. The LOCAL path passes `ic_launcher`
explicitly, which overrides the `capacitor.config` default and reintroduces the exact defect the manifest
comment describes.** `notifyNewOrder` passes no icon and is therefore correct — so two of three are wrong
and one is right. `ic_stat_hatchgrab.png` exists at all five densities.

### Notification channels — ✅ CONSISTENT

`lib/native/push.ts:66` `export const ORDER_CHANNEL_ID = 'hg_orders'`, created at `:178-193` inside the
**only `getPlatform() === 'android'` branch in the app**:

```ts
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: ORDER_CHANNEL_ID, name: 'New orders', description: 'Alerts when an order needs confirming.',
          importance: 5, visibility: 1, sound: 'default', vibration: true, lights: true,
        })
```

and `android/app/src/main/res/values/strings.xml:10` gives
`<string name="default_notification_channel_id">hg_orders</string>` — **the same id the manifest points
FCM at. These agree.** ⚠️ Note the channel declares `sound: 'default'` while the config declares
`beep.wav`; on Android 8+ **the channel wins**, so the missing file matters less than it would otherwise.
**Channel creation has never been observed running.**

---

## 7. Deep links and App Links

**What the app claims to handle: NOTHING. App Links verification: NOT CONFIGURED, and there is nothing to
verify.**

The complete set of intent filters in `android/app/src/main/AndroidManifest.xml` is:

```xml
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
```

**One filter. MAIN/LAUNCHER. No `VIEW`, no `BROWSABLE`, no `<data>` host or scheme.**

Four searches, each returning nothing:

| Search | Scope | Result |
|---|---|---|
| `autoVerify` | `android/**/*.xml`, excluding `build/` | **ZERO HITS** |
| `assetlinks.json` / `apple-app-site-association` | whole repo, excluding `node_modules` | **ZERO HITS** |
| `public/.well-known/` | filesystem | **DOES NOT EXIST** |
| `.well-known` route handler | `app/` | **ZERO HITS** |
| `appUrlOpen|getLaunchUrl|deepLink` | `app/`, `components/`, `lib/` | one hit, `lib/utils.ts:146`, an **Outlook calendar compose URL** — unrelated |

⚠️ **Do not mistake `allowNavigation` for App Links.** `capacitor.config.ts:46` sets
`allowNavigation: [CAP_SERVER_HOST]` and `:24` sets `server.url` to `https://www.hatchgrab.com/app`. That
governs **navigation inside the WebView** — whether a link stays in the shell or is handed to the browser.
It has nothing to do with Android intercepting an `https://` intent from outside the app. `:35-37` says so:
*"Android never had the bug: Bridge.launchIntent compares host + scheme, not the path. This entry is a
no-op there."*

**What would happen on Android today:** tapping a `hatchgrab.com` link anywhere on the device opens the
**browser**, never the app. There is no disambiguation dialog, because the app registers no filter to
appear in one. The only "deep link" concept that exists is the push tap handler, which navigates **within**
the already-running WebView (`push.ts:154-158` → `currentOnOpenOrder(orderKey)`) — not an Android intent.

---

## 8. Session persistence and storage

**Two stores are in use, and the split is the risk.**

| Key | Store | Owner |
|---|---|---|
| **`hg_device_id`** | 🔴 **localStorage** | `lib/native/device.ts:6` |
| `hg_last_screen` | 🔴 **localStorage** | `lib/native/device.ts:136` |
| `hg_app_lock` | 🔴 **localStorage** | `lib/native/appLock.ts:10` |
| `hg_keepawake_${token}`, `hg_kds_*`, `hg_sound_*`, `hg_breach_ack_*`, `hg_offline_pause_ack_*`, `hg_demo_*` | 🔴 localStorage | dashboard / KDS pages |
| `user_postcode` | localStorage | `app/page.tsx:149` (consumer site) |
| **Supabase auth session** | ✅ **Preferences** | `lib/native/preferencesStorage.ts` |
| `hg_app_lock_pin` (PBKDF2 salt+hash) | ✅ Preferences | `appLock.ts:11` |
| `hg_outbox_op_*`, `hg_outbox_seq`, `hg_device_letter`, `hg_outbox_conflict_ack` | ✅ Preferences | `lib/native/outbox.ts:26-32` |
| `hg_notify_master` / `_offline` / `_neworder` | ✅ Preferences | `lib/native/notifications.ts:8` |
| `hg_printer_id` / `_name` / `_svc` / `_chr`, `hg_paper_width`, `hg_print_lead_mins`, `hg_print_enabled` | ✅ Preferences | `bleTransport.ts:37`, `PrintingSettings.tsx` |
| `hg_printed_keys_*` | ✅ Preferences | `lib/printing/printWatcher.ts:155` |
| `hg_prov_seq_*` | Preferences | `lib/native/orderGate.ts:25-26` |

🔴 **Which are at risk in this shell — and the repo already documents why**,
`lib/native/preferencesStorage.ts:3-7`:

```ts
// WHY: in a WKWebView remote-URL shell, localStorage is NOT reliably durable across a hard navigation
// (/login → /app → dashboard) or a cold app-kill — the web view can hand back a fresh/empty localStorage,
// so getNativeSupabase()'s session silently vanishes → hasNativeSession() goes false → bounce to /login →
// login writes a new localStorage session that again doesn't survive → infinite login loop. @capacitor/
// preferences persists to native storage (UserDefaults on iOS), which survives navigations and cold-kills.
```

**The Supabase session was moved off localStorage for exactly this reason. `hg_device_id` was not.** It is
the identity every `van_devices` row, every push target and the outbox's device letter hang off
(`outbox.ts:104` seeds `deviceLetter()` from it, then persists the *letter* to Preferences — trusting
Preferences, not localStorage, to hold it).

⚠️ **The comment is written about WKWebView.** Whether the Android WebView behaves the same way is
**CANNOT DETERMINE** from source — but the app loads a **remote https origin** on both platforms
(`capacitor.config.ts:13`, `:24`), so the storage is the origin's WebView store on both, and nothing in the
repo backs `hg_device_id` up anywhere.

---

## 9. Anything else platform-conditional, not covered by `docs/android-inventory-report.md`

That report's headings (§A push send path, §B back/home/overlays, §C signing/SDK/permissions/versions,
§D parity, §E found-not-asked-for, §F blockers) define what to exclude. **Five things it did not cover:**

**(a) 🔴 `lib/native/statusBar.ts` — the most Android-specific file in the project, and it ships debug
logging.** `:37-58` records behaviour verified *against the installed plugin source* (not docs):
`setOverlaysWebView` is **inert on Android 15+**; `setStyle` is the only one of three that still works;
`setBackgroundColor` was removed as a verified no-op for API ≥ 36. `:60-70` forbids adding
`env(safe-area-inset-top)` handling for Android, and ends *"Passthrough is UNVERIFIED on our devices."*
⚠️ **Three `// TEMP` console lines remain** at `:29`, `:74`, `:76` — a submission-hygiene item, not a defect.

**(b) `android/app/src/main/res/values/styles.xml:39-44` — an Android-only cosmetic fix.**
`AppTheme.NoActionBar` sets `android:windowBackground` to `@color/hgHeaderNavy` so the status-bar strip is
continuous with the header. Its comment (`:25-37`) explains that Capacitor's `SystemBars.java` pads the
WebView's parent on Android 15+, so the WebView **cannot paint the strip**. Explicitly *"a COSMETIC
continuity fix, not true immersion"*. **Never observed on a device.**

**(c) `lib/commerce-policy.ts` — the only deliberate iOS/Android product divergence.** `:10-13`:

```ts
// 🔴 ANDROID IS DELIBERATELY EXCLUDED FROM THIS RESTRICTION. Google permits steering users to an external
// purchase mechanism, so the Android shell keeps the full web behaviour.
```

🔴 **Consequence for a Play submission: on Android the entire upgrade path renders** — the Billing tab's
plan CTAs, the trial reminder, `FeatureGate`'s upgrade prompt, the upgrade modal (11 `purchaseCtaAllowed()`
call sites). **The iOS shell has been reviewed with all of that hidden; the Android shell will show a
surface nobody has looked at in the shell.**

**(d) `lib/native/network.ts` and `components/native/AppLink.tsx`** — both native-vs-web only.
`AppLink` intercepts clicks and routes via `router.push` when native (`:33-36`), avoiding the hard
navigation that `capacitor.config.ts:26-45` describes as the iOS Safari-escape bug — *"Android never had
the bug"*, so on Android this is a no-op that costs nothing.

**(e) The bare `MainActivity`** — noted at the top: zero custom Android native code, so every capability
above is exactly what the plugins do by default.

**Two items from that report are now out of date and should not be re-read as current:** §C8 (*"NO SIGNING
CONFIG EXISTS"*) and §C11/236 (*"`neverForLocation` IS ABSENT"*) were both addressed in later workstreams
this session — see `docs/android-signing-report.md` and `docs/android-ble-permissions-report.md`.

---

# 🔴 THE TABLE

Legend — **iOS-verified / Android-verified**: ✅ = the repository records a device observation;
⚠️ = validated only against source, config or an emulator, never a device; ❌ = no evidence at all.
**None of these was verified by me in this task** — I ran nothing.

| # | Capability | Exists | iOS-verified | Android-verified | What breaks on Android if it is wrong |
|---|---|---|---|---|---|
| 1 | **Biometric app-lock** (Face/fingerprint + PIN) | ✅ yes | ⚠️ hardware-gated note only | ❌ **never** | 🔴 If Android's prompt fires no `appStateChange`, `authInProgress` latches and **the lock stops re-locking** on foreground — the feature silently does nothing. If it fires twice, an **infinite prompt loop / hard lockout**; the backup PIN is the only escape. |
| 2 | **BLE receipt printing** | ✅ yes, complete | ❌ **no printer, ever** | ❌ **no printer, ever** | 🔴 `neverForLocation` may filter the printer out of scan results → **"no printers found"** with no way to fix it in-app. MTU/pacing untested → truncated or duplicated tickets. **This is the largest built-but-unobserved surface in the app.** |
| 3 | **Push — token acquisition** | ✅ yes | ❌ *"iOS has never registered one"* | ✅ **yes** (logcat, emulator, PIDs) | Works. The one capability Android is *ahead* on. |
| 3b | **Push — message DELIVERY** | ✅ built | ❌ no | ❌ **no evidence** | 🔴 `FCM_SERVICE_ACCOUNT_JSON` is 1 char locally → sender disabled, logs *"No notification was sent"*. Production value **CANNOT DETERMINE**. Operators get **no new-order alert**. |
| 3c | **Push — tap-to-open-order** | ✅ built | ❌ no | ❌ **no** | Notification opens the app to wherever it was; the order is not surfaced. |
| 4a | **Camera / QR scanning** | 🔴 **NO** | — | — | Nothing — it does not exist. QR is generated, never scanned. |
| 4b | **File picking** | ⚠️ web `<input file>` | ⚠️ untested | ❌ **never** | Menu/logo/schedule uploads depend on the WebView chooser. **No `CAMERA` permission** → the "take a photo" option may be missing or fail. |
| 4c | **Sharing** | ⚠️ `navigator.share` | ✅ WKWebView supports it | ❌ **never** | **INFERRED:** Android System WebView does not implement Web Share → falls back to clipboard silently. Degrades, does not break. |
| 4d | **Document printing** | 🔴 **NO** | — | — | Nothing. |
| 5 | **Keep-awake / screen-on** | ✅ yes | ✅ the `'unknown'` state came from an iOS device bug | ❌ **never** | `FLAG_KEEP_SCREEN_ON` dies with the Window, so the failure mode is benign — worst case the **screen sleeps mid-service** and the state machine reports `'unknown'`. A native throw would **kill the process** (`Bridge.java:848-851`), unprotectable from JS. |
| 6a | **Haptics** | 🔴 **NO** | — | — | Nothing. |
| 6b | **Notification sound** | ⚠️ configured | ❌ | ❌ | 🔴 **`beep.wav` does not exist and `res/raw/` does not exist.** Falls back to the channel default. Broken identically on iOS. |
| 6c | **Local-notification icon** | ⚠️ built | ❌ | ❌ | 🔴 Two of three helpers hardcode `smallIcon: 'ic_launcher'` → **a solid white square in the status bar**, the exact defect the manifest comment warns about. |
| 6d | **Notification channel** | ✅ yes | n/a (Android-only) | ❌ **never run** | Channel id agrees with `strings.xml`. If creation failed, alerts land on the SDK fallback channel at lower importance — **heads-up alerts stop being heads-up**. |
| 7 | **Deep links / App Links** | 🔴 **NO** | — | — | 🔴 `assetlinks.json` absent, `autoVerify` absent, **only MAIN/LAUNCHER declared**. A `hatchgrab.com` link **always opens the browser**, never the app. Nothing to fix at verification level — nothing is claimed. |
| 8 | **Session persistence** (Preferences) | ✅ yes | ✅ the login loop it fixed was iOS-observed | ❌ **never** | Should hold — it is native storage. |
| 8b | **`hg_device_id` on localStorage** | ✅ yes | 🔴 known-fragile in WKWebView | ❌ **never** | 🔴 A cleared WebView store mints a **new device id** → a new `van_devices` row, the push target is orphaned, the printer pairing and outbox letter detach. Already observed as row churn on iPad. |
| 9a | **Status bar** | ✅ yes | ✅ iOS double-band fix verified | ⚠️ verified against **plugin source**, not a device | `setOverlaysWebView` is inert on Android 15+; `setStyle` carries it. Worst case **light glyphs on a light strip** — the `windowBackground` navy is the mitigation, itself unobserved. |
| 9b | **Upgrade / purchase CTAs** | ✅ yes | ✅ hidden on iOS by policy | ❌ **never seen in the shell** | 🔴 **Android shows the whole billing surface** — 11 gated call sites that no one has viewed inside the Android app. Not a break, a **review-surface risk**. |
| 9c | **Custom Android native code** | 🔴 **NONE** | — | — | `MainActivity` is a bare `BridgeActivity`. Every behaviour above is plugin default. |

### The column you asked me to care about — built but never observed on Android

In descending order of what it would cost at a hatch:

1. **BLE printing (#2)** — the largest built surface with zero device evidence on *either* platform.
2. **Push delivery (#3b)** — the token exists on Android; the message has never been seen to arrive.
3. **Biometric app-lock (#1)** — a lifecycle guard designed entirely around iOS semantics.
4. **Local-notification icon and sound (#6b, #6c)** — two concrete, source-visible defects.
5. **Keep-awake (#5)** — benign failure mode, but a native throw is a process kill.
6. **The billing surface (#9b)** — visible on Android by design, never looked at there.

---

## What remains unobserved

1. **I ran nothing.** No parse, no typecheck, no execution, no build, no device, no emulator. Nothing was
   rendered.
2. **Every "Android-verified ✅" in the table is a claim I read in a source comment**, not something I saw.
   The only one is push-token acquisition (`push.ts:123-133`).
3. **Production environment is invisible from here.** `FCM_SERVICE_ACCOUNT_JSON` was checked in
   `.env.local` only, by length, without printing its value.
4. **Plugin internals were not read this session.** Where I cite plugin behaviour
   (`StatusBar.java`, `Bridge.java`, `BluetoothLe.kt`) I am quoting comments in *this* repository that
   claim to have read them. I did not re-verify those against `node_modules`.
5. **Two platform claims are marked INFERRED and were not read from this repo**: Android WebView's lack of
   Web Share (#4c), and Android's `BiometricPrompt` lifecycle (#1).
6. **No database was queried**, so which `van_devices` rows carry `platform='android'` with a live
   `push_token` is unknown here.
