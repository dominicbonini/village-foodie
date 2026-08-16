# Android — full audit against a Play Store submission

READ-ONLY AUDIT. **No file was edited, nothing was committed, no build was run, no deploy, no package
installed, no database write, no Stripe call.** `git status` is in H4.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

iOS and Android are separate platforms and are reported **separately** throughout — nothing here is
generalised from the iOS work. Every claim is marked **READ** or **INFERRED**.

---

# 🔴 THE HEADLINE, AND IT CORRECTS TWO OF THE FOUR STATED PREMISES

| Stated | Found |
|---|---|
| the push send path excludes Android | ✅ **CONFIRMED** — and worse: **there is no FCM sender AT ALL**, so the filter is not the blocker, the absence of a sender is |
| `ic_stat_icon_config_sample` does not exist | ✅ **CONFIRMED** — ⚠️ **but it is configured under `LocalNotifications`, not `PushNotifications`** |
| hardware BACK has no handler | ✅ **CONFIRMED — no handler exists** |
| 🔴 **"back CLOSES THE APP"** | 🔴 **REFUTED. It does not.** Capacitor's own `AppPlugin` registers an enabled `OnBackPressedCallback` that **consumes** the press: with no JS listener it goes back in WebView history if it can, **and otherwise does NOTHING**. The app does not close. **The real defect is different and is described in A2/A3.** |
| `@capacitor/android` pinned at 8.4.1 vs 8.4.0 | ✅ **CONFIRMED** |

⚠️ **And one thing the brief did not ask that is arguably the largest single finding:** `targetSdk` is
**36**, which **meets** Play's requirement. **The Play-technical bar is closer than the state of the app
suggests** — see G2.

---

# PART A — 🔴 HARDWARE BACK AND HOME

## A1. Any back handler? — **NOT FOUND**

**Stated plainly.** Sweeping every `.ts`, `.tsx`, `.java` and `.kt` outside `node_modules` for
`backButton`, `App.addListener('back…`, `hardwareBackPress`, `popstate` and `onBackPressed`:

```
NOT FOUND — no backButton listener, no popstate handler, no onBackPressed override anywhere in app code
```

🔴 **AND THE PLUGIN THAT WOULD PROVIDE IT IS ALREADY INSTALLED AND ALREADY USED — for something else.**
**READ**, `lib/native/app.ts` in full, the only consumer of `@capacitor/app`:

```ts
export function onAppResume(cb: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  let remove: (() => void) | undefined
  import('@capacitor/app')
    .then(({ App }) => {
      const handlePromise = App.addListener('appStateChange', (state: { isActive: boolean }) => {
        if (state.isActive) cb()
      })
      …
```

**`appStateChange` only. Never `backButton`.** ⚠️ **So this is not a missing dependency or a missing
plugin — it is a missing listener on a plugin the app already imports.**

**READ** — `android/app/src/main/java/com/hatchgrab/app/MainActivity.java` in full, confirming no native
override either:

```java
package com.hatchgrab.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

## A2 / A3. 🔴 WHAT ACTUALLY HAPPENS — READ FROM CAPACITOR'S SOURCE, NOT INFERRED

**This is the part worth reading closely, because the answer is not the Android default.**

**READ** — `node_modules/@capacitor/app/android/src/main/java/com/capacitorjs/plugins/app/AppPlugin.java:50-66`:

```java
        this.onBackPressedCallback = new OnBackPressedCallback(!disableBackButtonHandler) {
            @Override
            public void handleOnBackPressed() {
                if (!hasListeners(EVENT_BACK_BUTTON)) {
                    if (bridge.getWebView().canGoBack()) {
                        bridge.getWebView().goBack();
                    }
                } else {
                    JSObject data = new JSObject();
                    data.put("canGoBack", bridge.getWebView().canGoBack());
                    notifyListeners(EVENT_BACK_BUTTON, data, true);
                    bridge.triggerJSEvent("backbutton", "document");
                }
            }
        };

        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), this.onBackPressedCallback);
```

**READ** — and the plugin IS registered on Android, so that `load()` runs.
`android/app/src/main/assets/capacitor.plugins.json`:

```json
	{
		"pkg": "@capacitor/app",
		"classpath": "com.capacitorjs.plugins.app.AppPlugin"
	},
```

**READ** — and `disableBackButtonHandler` is **NOT FOUND** in `capacitor.config.ts`, so the callback is
constructed with `enabled = true`.

### 🔴 A3 — DOES BACK CLOSE THE APP AT THE ROOT? **NO. REFUTED.**

**The callback is ENABLED and it CONSUMES the press.** With no JS listener and `canGoBack() == false`,
`handleOnBackPressed()` runs to completion **doing nothing** — it never calls `finish()` and never
delegates to the activity's default. 🔴 **So the press is swallowed. The app does not close, and the
screen is not lost.**

⚠️ **This means Capacitor is already protecting the app from the Android default the brief describes.
That default would apply to a bare WebView; it does not apply here.**

### A2 — surface by surface

⚠️ **Everything below turns on one question: does the WebView have history to go back through?** The
app is a remote-URL Next.js SPA, and `router.push` **pushes history entries**, so `canGoBack()` is
**true** for essentially any screen reached by navigating. **INFERRED, from the mechanism above:**

| Surface | What back does today |
|---|---|
| **Dashboard** (reached from `/app`) | 🔴 **Navigates BACK in SPA history** — typically to `/app`, the launch router, which then re-routes. **The operator loses the dashboard for a moment.** |
| **KDS** (reached from the dashboard) | 🔴 **Navigates back to the dashboard.** ⚠️ **On an unattended kitchen screen this is the worst case: one stray press and the board is gone, with nothing to indicate why.** |
| **KDS** (cold-launched via `default_screen`) | ⚠️ **Depends on whether `/app`'s redirect left a history entry** — INFERRED, and it is exactly the ambiguity a handler would remove. |
| **Manage** | Navigates back a level. |
| 🔴 **A MODAL** (buzzer grid, event picker, confirm sheet, order sheet) | 🔴 **THE MODAL DOES NOT CLOSE.** Modals are React state, not history entries, so back **navigates the page underneath away while the modal state is discarded with it.** **This is Dominic's concern and it is real — the mechanism is different from "the app closes" but the operator's experience is the same: the screen goes.** |
| **Add Order panel** | Same — a tab/state within the dashboard, not a history entry. Back leaves the dashboard entirely. |
| **Customer order page** (web, any browser) | ✅ **Unchanged and correct** — ordinary browser back. **Capacitor is not involved.** |
| **The very first screen, no history** | ✅ **Nothing happens.** The press is swallowed. |

> 🔴 **THE ACCURATE STATEMENT OF THE DEFECT: back never closes the app, but it never dismisses anything
> either. It is wired to browser history, and this app's dismissible things are not in history.** So a
> press either does nothing (confusing) or throws away the whole screen (destructive) — and **which of
> the two you get depends on history depth, which the operator cannot see.**

## A4. What back SHOULD do — the shape only

⚠️ **Reported as a shape, not implemented, and this is a product decision as much as a technical one.**

| Surface | Shape |
|---|---|
| **A modal / sheet / picker is open** | **Dismiss it and consume the press.** The commonest case and the one users expect. |
| **KDS** | 🔴 **Almost certainly NOTHING, or a confirm.** It is an unattended full-screen board; **the same argument that made the KDS hold its event applies to letting a stray press leave it.** |
| **Dashboard, a non-default tab** | **Return to the default tab**, then do nothing. |
| **Dashboard, root** | **Nothing** — or a double-press-to-exit, which is the Android idiom. |
| **Manage, a sub-section** | **Up one level.** |
| ⚠️ **Anywhere with unsaved input** | **Confirm before discarding.** Today the Add Order panel's basket would vanish with no prompt. |

⚠️ **One structural note:** a single global listener cannot know what is open — the handler needs a
notion of "what would dismiss first", which the app does not currently have anywhere.

## A5. HOME — what survives

**READ** — the resume handler exists and is the same `appStateChange` listener quoted at A1:

```ts
      const handlePromise = App.addListener('appStateChange', (state: { isActive: boolean }) => {
        if (state.isActive) cb()
      })
```

| Thing | Survives home-then-return? |
|---|---|
| **The session** | ✅ **YES.** It lives in Capacitor **Preferences** under `hg-native-auth` — native storage, not WebView memory, and it survives a full process kill. |
| **The KDS event seed** | ⚠️ **Survives a BACKGROUND, not a process KILL.** `seededRef` is a React ref in WebView memory. On return from home the WebView is intact and the held event is intact. **INFERRED: if Android kills the process — which it does more readily than iOS on low memory — the app cold-starts and re-seeds** from `?event_id=` or `pickDefaultEventByTime`. ✅ **That is the designed fallback**, but it is a *re-seed*, not the same held value. |
| **Keep-awake** | ⚠️ **INFERRED: NOT automatically.** `FLAG_KEEP_SCREEN_ON` is a window flag and is released when the activity is not in the foreground. **NOT FOUND: any re-apply of keep-awake in the resume path** — `onAppResume`'s callback pings the heartbeat, nothing else. **Worth device-testing; a kitchen screen that stops staying awake after one home press is a real failure.** |
| **The order poll** | ✅ Resumes — `onAppResume` fires an immediate heartbeat rather than waiting for the tick. |

## A6. Gesture navigation vs three-button — **NO DIFFERENCE, INFERRED**

**NOT FOUND: any gesture-navigation handling, any `WindowInsets` work, any edge-to-edge configuration
in the manifest or the activity.**

**INFERRED:** both forms dispatch through the same `OnBackPressedDispatcher`, so the behaviour at A2/A3
is identical. ⚠️ **What differs is likelihood, not mechanism: an edge-swipe is far easier to trigger by
accident on a busy screen than a deliberate button press** — which makes the KDS case worse on a modern
device, not better. ⚠️ **Also INFERRED and untested: `android:configChanges` in the manifest does not
list anything about insets, and no edge-to-edge opt-in exists, so on Android 15+ the app may draw under
the system bars — the Android counterpart of the iOS safe-area defect fixed yesterday. Unverified.**

---

# PART B — PUSH ON ANDROID

## B1. The platform filter — Android excluded, confirmed

**READ** — `app/api/orders/submit/route.ts:1271-1279`:

```ts
            // APNs-ONLY ALLOWLIST: sendOrderPendingPush POSTs to api.push.apple.com, which understands
            // Apple device tokens only. A non-Apple token (e.g. an FCM token from an Android build) comes
            // back as BadDeviceToken → the invalidTokens cleanup just below would NULL that row's push_token,
            // silently and permanently disabling push for that device. So allowlist the Apple-compatible
            // platforms; any future platform value is EXCLUDED by default until a sender exists for it.
            // NULL is included: legacy rows predate the column being populated and are all iOS.
            const { data: devices } = await supabase
              .from('van_devices').select('device_id, push_token').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
              .or('platform.eq.ios,platform.is.null')
```

✅ **CONFIRMED — and the filter is CORRECT, not a bug.** Its own comment explains why: without it, an
Android FCM token would be POSTed to Apple, rejected as `BadDeviceToken`, and **the cleanup would NULL
that device's token permanently.** ⚠️ **Removing this filter without building a sender would destroy the
one working piece of Android push.**

## B2 / B3. 🔴 IS THERE AN FCM SEND PATH AT ALL? — **NOT FOUND**

**Stated plainly: there is no FCM sender anywhere in this codebase.**

**READ** — searching all of `app/` and `lib/` for `FCM`, `firebase` and `googleapis.com/v1/projects`
returns **only comments**:

```
lib/plan-features.ts:214    … FCM push works and a token has landed, while iOS push has never
lib/native/push.ts:30       … On Android, @capacitor/push-notifications is FCM-backed …
app/api/orders/submit/route.ts:1272  … (e.g. an FCM token from an Android build) …
```

🔴 **NOT FOUND: `FCM_SERVICE_ACCOUNT_JSON`, or any other FCM environment variable, read anywhere in the
codebase.** ⚠️ **The brief says it exists in the environment. I cannot read Vercel's environment and did
not try — but nothing in this repository consumes it.** ✅ **So it is set and unused, which is the
inverse of the APNs situation and is worth knowing before anyone concludes push is "partly wired".**

**By comparison — READ, the iOS sender that DOES exist:** `lib/apns.ts`, with `apnsConfig()`, a
provider JWT, and an HTTP/2 POST to `api.push.apple.com`. **There is no `lib/fcm.ts` and no counterpart
to it.**

> 🔴 **So the Android push gap is not a one-line filter. It is an entire missing send path: credentials,
> an OAuth2 token exchange for the service account, the v1 `messages:send` endpoint, and its own
> invalid-token cleanup.**

## B4. Android registration — ✅ IT WORKS, AND A TOKEN HAS LANDED

**READ** — `lib/plan-features.ts:211-216`, recorded as the reason a preference for iPad was removed:

```
    // ⚠️ "An Apple iPad is recommended for the best experience." WAS REMOVED AND MUST NOT BE RESTORED.
    // It was a PREFERENCE STATED AS A FINDING. The full order flow has never been run on real hardware on
    // either platform, so there is no basis for preferring one — and on current evidence ANDROID is the
    // better-validated of the two: FCM push works and a token has landed, while iOS push has never
    // registered a token at all (§36).
```

**How it got there — READ**, `lib/native/push.ts:72-74`, the same listener both platforms use:

```ts
        PushNotifications.addListener('registration', (t: { value: string }) => {
          void saveDeviceConfig(token, { push_token: t.value })
        }),
```

⚠️ **And the reason it works on Android and did not on iOS is structural, READ**,
`lib/native/push.ts:30-36`:

```
  // Capacitor plugin. On Android, @capacitor/push-notifications is FCM-backed: with no valid Firebase
  // config, PushNotificationsPlugin.register() (PushNotificationsPlugin.java:103) calls
  // FirebaseMessaging.getInstance(), which throws IllegalStateException "Default FirebaseApp is not
  // initialized" INSIDE THE BRIDGE …
```

🔴 **The FCM path does not go through `AppDelegate`, which is the exact file whose two missing methods
broke iOS for three weeks.** **READ** — the client config is present:
`android/app/google-services.json`, project **`hatchgrab`**, package **`com.hatchgrab.app`** — matching
`applicationId` and `namespace` in `build.gradle`.

> ✅ **ANDROID IS THE EXACT MIRROR OF iOS: iOS had a sender and no token; Android has a token and no
> sender.**

## B5. `ic_stat_icon_config_sample` — confirmed absent, and it is not where you think

**READ** — the only reference in the entire repository, `capacitor.config.ts:84`:

```ts
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#F5A623',
      sound: 'beep.wav',
    },
```

**READ** — `find android -name "ic_stat*"` returns **nothing**. The `drawable-*` directories contain
`splash.png` and the launcher assets and no notification icon.

⚠️ **AND IT IS UNDER `LocalNotifications`, NOT `PushNotifications`** — a distinction the brief did not
make and which changes who is affected:

| Channel | Affected? |
|---|---|
| **Local notifications** (the plugin is installed) | 🔴 **Yes** — a missing `smallIcon` resource. |
| **Push notifications** | ⚠️ **Not by this line.** **NOT FOUND: any `PushNotifications` block in `capacitor.config.ts`**, so push would use the plugin's own default. |

**What an operator would see — INFERRED, and hedged deliberately:** Android renders notification small
icons as a **silhouette**, so a missing or unsuitable resource typically shows as a **white/grey square
or blank space** in the status bar and the shade. ⚠️ **`beep.wav` was not verified to exist either and
would fail the same way.** ✅ **Neither is reachable today, because no notification is ever sent to an
Android device (B3).**

---

# PART C — THE NATIVE PROJECT

## C1. `AndroidManifest.xml` in full

**READ** — 41 lines, complete:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
```

| | Value |
|---|---|
| **Permissions declared here** | **ONE: `INTERNET`** |
| **Intent filters** | **ONE: MAIN / LAUNCHER.** ⚠️ **NOT FOUND: any deep-link / App Links filter** — the iOS `continue userActivity` universal-link forwarder has no Android counterpart wired. |
| **Launch mode** | `singleTask` — Capacitor's default |
| **`allowBackup`** | `true` — ⚠️ **Capacitor's default, and it means Android may back up the app's data (including Preferences, where the auth session lives) to the user's Google account.** Not reviewed. |

⚠️ **THE BARE PERMISSION LIST IS NOT A DEFECT BY ITSELF.** Plugin library manifests are **merged** at
build time, and they declare what they need — **READ**, `@capacitor/local-notifications` declares
`POST_NOTIFICATIONS`, `WAKE_LOCK` and `RECEIVE_BOOT_COMPLETED`; `@capacitor/network` declares
`ACCESS_NETWORK_STATE`; the BLE plugin declares its own (C5). ✅ **So the effective merged manifest is
much larger than this file. It is stock, not wrong.**

## C2. The config — ✅ `allowNavigation` AND `server.url` MATCH iOS

**READ** — `capacitor.config.ts:68-75`:

```ts
  android: {
    backgroundColor: '#1C1C1E',
    // MUST be byte-identical to ios.appendUserAgent above: proxy.ts's isNativeApp check substring-matches
    // this exact string to defer the cookie-blind auth guard for native navigations. Without it every
    // /dashboard and /manage navigation 307s to /login and the V8.7 login loop returns.
    // No contentInset / scrollEnabled here — both are WKWebView-specific with no Android counterpart.
    appendUserAgent: 'HatchGrabNativeApp',
  },
```

**READ** — the baked `android/app/src/main/assets/capacitor.config.json`:

```json
	"server": {
		"url": "https://www.hatchgrab.com/app",
		"cleartext": false,
		"allowNavigation": [
			"www.hatchgrab.com"
		]
	},
```

🔴 **CONFIRMED: `server.url` and `allowNavigation` are shared top-level keys and are byte-identical for
both platforms.** ✅ **So the Android build already carries the `allowNavigation` fix** — and, unlike the
iPad, **this baked file is on disk now**, so a fresh Android build would include it.

⚠️ **One asymmetry, READ from the comment above: `contentInset` and `scrollEnabled` are iOS-only, which
is correct — but it also means none of yesterday's safe-area work has an Android counterpart, and
nothing has been done about Android's system bars (A6).**

## C3. `build.gradle` and the SDK levels

**READ** — `android/app/build.gradle:6-12`:

```gradle
    defaultConfig {
        applicationId "com.hatchgrab.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
```

**READ** — `android/variables.gradle:1-4`:

```gradle
ext {
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
```

| | Value |
|---|---|
| `minSdkVersion` | **24** (Android 7.0) |
| `compileSdkVersion` | **36** |
| `targetSdkVersion` | **36** (Android 16) |
| `versionCode` | 🔴 **1** — untouched default |
| `versionName` | 🔴 **"1.0"** — untouched default |

⚠️ **Play's target-SDK requirement — INFERRED, and Play changes this annually:** new apps and updates
have been required to target within one year of the latest major release, which as of the 2025 window
was **API 35**. ✅ **At `targetSdk = 36` we are at or above it either way.**

> ✅ **THIS IS THE GOOD NEWS OF THE AUDIT: the single Play requirement most likely to block a stale
> project is already met, because `cap sync` keeps these values current.**

⚠️ **`versionCode 1` must be incremented for every upload — Play rejects a duplicate.** Not a blocker,
but it is a thing nobody has touched.

## C4. Icons and splash — 🔴 STOCK CAPACITOR, AND NOT SHARED WITH iOS

**READ — what exists:** `ic_launcher.png`, `ic_launcher_round.png` and `ic_launcher_foreground.png`
across all five mipmap densities, `mipmap-anydpi-v26` adaptive-icon XML, `drawable-v24/ic_launcher_foreground.xml`
(a **vector**), `drawable/ic_launcher_background.xml`, and `splash.png` across all `drawable-land-*` and
`drawable-port-*` densities.

🔴 **They are the Capacitor/Android Studio stock assets, not HatchGrab's.** **READ** — the foreground is
a generic vector, and `android/app/src/main/res/values/ic_launcher_background.xml`:

```xml
    <color name="ic_launcher_background">#FFFFFF</color>
```

**READ** — git history confirms they were laid down once and never revisited:

```
$ git log --oneline -- android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
8b56c15 landing and android
```

**Versus iOS, which was regenerated yesterday:**

```
$ git log --oneline -3 -- ios/App/App/Assets.xcassets/AppIcon.appiconset/
b175963 ipad fixes
0b0ed82 app icon
```

> 🔴 **ANDROID DOES NOT SHARE THE iOS ICON. It has its own, and its own is the default.** ⚠️ **The white
> ground is a coincidence, not the same decision** — the iOS white ground was chosen deliberately
> yesterday with a recorded 2.50:1 contrast concern; this is Android Studio's template default.
> ⚠️ **The splash is stock too, and unrelated to the `#0F172A` iOS launch screen.**

## C5. BLE on Android — permissions declared, runtime handling present, untested

**READ** — the plugin declares its own, merged at build:

```xml
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
  <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
  <uses-permission android:name="android.permission.BLUETOOTH_SCAN" tools:targetApi="s" />
  <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" tools:targetApi="s" />
  <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
```

✅ **So the answer to "does Android BLE need location permissions" is yes on API ≤ 30, and the plugin
already declares them** — including the `maxSdkVersion="30"` split that stops the legacy permissions
being requested on modern devices.

**Runtime handling — READ**, `lib/printing/bleTransport.ts:105-111`:

```ts
  /** initialize() prompts for permission on first call. Idempotent; safe to call before every operation. */
  const ensureInit = async (): Promise<void> => {
    if (initialised) return
    const BleClient = await ble()
    await BleClient.initialize()
    initialised = true
  }
```

✅ **Runtime permission handling exists** and is the plugin's own prompt.
⚠️ **BUT — `androidNeverForLocation` is NOT passed**, and no Android-specific option is set anywhere.
**INFERRED: on API 31+ that means the scan is not declared as "never for location", so Android may
require location permission for scanning where it would otherwise not.** ⚠️ **A prompt asking a food
truck for LOCATION in order to find a printer is a support call waiting to happen. Untested.**

---

# PART D — THE SKEW AND THE DEPENDENCIES

## D1. The version skew — confirmed

**READ** — `package.json`:

| Package | Pin |
|---|---|
| `@capacitor/core` | **8.4.0** |
| `@capacitor/cli` | **8.4.0** |
| `@capacitor/ios` | **8.4.0** |
| 🔴 **`@capacitor/android`** | 🔴 **8.4.1** |

✅ **CONFIRMED.**

**Does it matter? — INFERRED, and the honest answer is "probably not, but it is unexplained":** a patch
bump within the same minor is not a documented incompatibility, and Capacitor's platform packages carry
their own native code that is largely independent of core's JS. ⚠️ **The concern is not breakage; it is
that nobody knows WHY it differs** — every other package was pinned in a deliberate pass, and this one
sits one patch ahead of its three siblings with no note anywhere. **INFERRED: it was pinned at whatever
was installed at that moment rather than chosen.**

## D2. All twelve still pinned — confirmed

**READ** — every Capacitor-scoped dependency, and **not one carries a `^` or `~`**:

```
  @aparajita/capacitor-biometric-auth        10.0.0
  @capacitor-community/bluetooth-le          8.3.0
  @capacitor-community/keep-awake            8.0.1
  @capacitor/android                         8.4.1
  @capacitor/app                             8.1.0
  @capacitor/cli                             8.4.0
  @capacitor/core                            8.4.0
  @capacitor/ios                             8.4.0
  @capacitor/local-notifications             8.2.0
  @capacitor/network                         8.0.1
  @capacitor/preferences                     8.0.1
  @capacitor/push-notifications              8.1.1
  @capacitor/status-bar                      8.0.2
```

✅ **Twelve `capacitor`-scoped packages, all exact, plus the biometric plugin also exact.**

## D3. Any plugin that does NOT support Android?

**NOT FOUND — every installed plugin ships an Android implementation.** **READ**,
`android/app/src/main/assets/capacitor.plugins.json` lists **nine** registered plugin classes:

```
@aparajita/capacitor-biometric-auth   com.aparajita.capacitor.biometricauth.BiometricAuthNative
@capacitor-community/bluetooth-le     com.capacitorjs.community.plugins.bluetoothle.BluetoothLe
@capacitor-community/keep-awake       com.getcapacitor.community.keepawake.KeepAwakePlugin
@capacitor/app                        com.capacitorjs.plugins.app.AppPlugin
@capacitor/local-notifications        com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin
@capacitor/network                    com.capacitorjs.plugins.network.NetworkPlugin
@capacitor/preferences                com.capacitorjs.plugins.preferences.PreferencesPlugin
@capacitor/push-notifications         com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin
@capacitor/status-bar                 com.capacitorjs.plugins.statusbar.StatusBarPlugin
```

✅ **Nine plugins, nine Android classes — the same nine the iOS build registers.** ⚠️ **`@capacitor/app`
is in that list, which is what makes A2/A3's default back behaviour active.**

---

# PART E — WHAT IS SHARED AND WHAT IS NOT

## E1. `isNativeApp()` returns true on Android — what that inherits

**READ** — **65 call sites** across `app/`, `components/` and `lib/`. Android inherits **all** of them,
because the helper is `typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()` with no
platform test.

| Behaviour | Android inherits | Correct on Android? |
|---|---|---|
| **`AppLink`** (`AppLink.tsx:33`) — intercept internal anchors, `router.push` instead | ✅ yes | ✅ **Yes** — it prevents a hard reload of the shell on either platform. |
| **`BrandHomeLink`** — render a non-link on native | ✅ yes | ✅ Yes. |
| **The WhatsApp Auto-replies hide** (`manage:8983`) | ✅ yes | ⚠️ **INHERITED WITHOUT A REASON.** It was hidden for **Apple Guideline 2.1**. **Google does not have that rule**, so Android hides a working control for an Apple reason. **Harmless, but unintended.** |
| **`openKDS`** — `router.push` instead of `window.open` | ✅ yes | ✅ **Yes** — and it is more clearly right on Android, which has no equivalent of the WKWebView `_blank` ejection. |
| **Reachability / offline banners** (`page.tsx:879`) | ✅ yes | ✅ Yes — `@capacitor/network` has an Android implementation. |
| **`configureStatusBar`** (`page.tsx:193`) | ✅ yes | ⚠️ **READ**, `lib/native/statusBar.ts:38`: *"🚫 DO NOT ADD env(safe-area-inset-top) OR --safe-area-inset-top HANDLING FOR ANDROID"* — **so the module already branches internally and Android is deliberately handled differently.** ✅ Correct. |
| **Printing** (`usePrinting.ts:99`, `PrintingSettings.tsx:83/97`) | ✅ yes | ⚠️ **See E2.** |
| **The `default_screen` / device-binding gate** | ✅ yes | ✅ Yes. |

## E2. 🔴 Does the BLE transport work on Android?

**READ** — the transport gates on `isNativePlatform()`, **never on the platform name**:

```
lib/printing/transport.ts:130    if (Capacitor.isNativePlatform()) {
lib/printing/bleTransport.ts:142      if (!Capacitor.isNativePlatform()) return 'unsupported'
lib/printing/bleTransport.ts:162      if (!Capacitor.isNativePlatform()) return []
lib/printing/bleTransport.ts:199      if (!Capacitor.isNativePlatform()) return { ok: false, … }
```

✅ **So on Android the BLE transport is SELECTED and the printing UI RENDERS.** The plugin has an
Android implementation and declares its permissions.

**What differs — INFERRED throughout, since neither platform has ever printed:**

| Difference | Consequence |
|---|---|
| **Permissions** | iOS asks once for Bluetooth; Android may ask for **Bluetooth AND location** (C5) — a different, more alarming prompt. |
| 🔴 **Classic Bluetooth (SPP)** | ⚠️ **The BLE-only decision was made because iOS requires MFi enrolment for SPP. ANDROID HAS NO SUCH RESTRICTION** — most cheap thermal printers are SPP, not BLE, and **Android could talk to them where iOS cannot.** **The constraint that shaped this design does not apply here.** |
| **The 180-byte chunk and 12 ms pacing** | Tuned blind for iOS; **INFERRED: Android's BLE stack has different MTU negotiation and throughput characteristics**, so the pacing may be wrong in either direction. |
| **Background** | Neither platform prints in the background by design. Same. |

> ⚠️ **So printing is not blocked on Android — it is untested on Android AND built to a constraint that
> is iOS-specific.**

## E3. Commerce gates — ✅ ANDROID SHOWS THE CTAs, AND IT IS DELIBERATE

**READ** — `lib/commerce-policy.ts:39-46` in full:

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

🔴 **CONFIRMED: on Android this returns `true`, so all eleven §40 gates open and the upgrade CTAs
SHOW.** ✅ **And it is explicit, not accidental — the comment names Android and says "Only iOS is
restricted."**

**Is it still intended? — INFERRED, and I would flag it for a re-read rather than assume:** Google
permits steering to external payment for non-digital goods, and a food order is a physical good, so the
posture is defensible. ⚠️ **But the CTA in question is a SUBSCRIPTION upgrade for the operator — a
digital service sold in-app — which is a different question from the food order, and Play's billing
policy treats those differently.** **NOT FOUND: any note in the repo that this distinction was
considered.** **Worth a deliberate read before submission; out of scope here.**

---

# PART F — PLAY STORE REQUIREMENTS

## F1. What Play requires that the App Store does not — ⚠️ INFERRED THROUGHOUT

**Play's requirements change; verify against the console rather than this list (§35, P15).**

| Requirement | Notes |
|---|---|
| 🔴 **Data safety form** | **The closest Play analogue to the privacy manifest, but it is a CONSOLE FORM, not a file in the repo.** There is no `PrivacyInfo.xcprivacy` equivalent to commit. See F3. |
| **Privacy policy URL** | ✅ **We have one** — `content/legal/privacy-policy.md` is published (§43). Both stores require it; Play requires it **in the console listing** for every app, not only those collecting data. |
| **Content rating questionnaire** | ⚠️ **No iOS equivalent of this exact form.** IARC-based; a food-ordering app is trivial to rate but the form is mandatory. |
| **Target API level** | ✅ **MET at 36** — see C3. |
| **App signing** | 🔴 **Play App Signing — an upload key, and Google holds the app signing key.** ⚠️ **A different model from Apple's, and NOTHING exists for it here (F2).** |
| **AAB, not APK** | ⚠️ **Play requires an Android App Bundle for new apps. `assembleRelease` produces an APK; `bundleRelease` is the target.** No release config exists either way. |
| **Declared permissions justification** | ⚠️ **The merged manifest will include `ACCESS_FINE_LOCATION` from the BLE plugin, and Play asks about location permissions specifically.** **INFERRED: this could require a prominent-disclosure justification for a permission the app only uses to find a printer** — the exact scenario `androidNeverForLocation` exists to avoid (C5). |
| **Foreground service declarations** | ✅ Not applicable — none used. |

## F2. Does anything anticipate a Play submission? — **NOT FOUND**

**Stated plainly:**

- **NOT FOUND: `signingConfig`, `storeFile` or `keyAlias`** anywhere in `android/app/build.gradle`.
  **READ** — the release build type is stock:
  ```gradle
      buildTypes {
          release {
              minifyEnabled false
              proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
          }
      }
  ```
- **NOT FOUND: any `.keystore` or `.jks` file.**
- **NOT FOUND: any `play/` directory, fastlane config, or store-listing metadata.**
- **NOT FOUND: `keystore.properties`.** Only `gradle.properties` and `local.properties` (the SDK path)
  exist.

🔴 **So a release build today would be unsigned or debug-signed, and `versionCode` is still 1.**

## F3. What the data safety form would have to declare

**Building on the iOS privacy-manifest work, which established the facts — INFERRED as to Play's form,
READ as to what the app does:**

| Data type | Collected? | Purpose | Linked to identity? | Shared? |
|---|---|---|---|---|
| **Device ID** | ✅ yes — FCM token + `device_id` UUID → `van_devices` | App functionality | **Yes** (truck + operator) | No |
| **Email address** | ✅ yes — operator accounts and the customer order form | App functionality, account management | Yes | No |
| **Name** | ✅ yes — customer order form | App functionality | Yes | No |
| **Phone number** | ✅ yes — optional on the order form | App functionality | Yes | No |
| **Payment info** | ✅ yes — via **Stripe** | Purchases | Yes | ⚠️ **"Shared" needs care: Stripe is a processor, and Play distinguishes sharing from processing** |
| **Purchase history** | ✅ yes | App functionality | Yes | No |
| **Approximate/precise location** | ⚠️ **CHECK** — the app does not request location for its own purposes, **but the BLE plugin declares `ACCESS_FINE_LOCATION`**, and Play's form asks about what the app *collects*, not what it declares. **INFERRED: declaring nothing while holding the permission invites a review question.** |

🔴 **THE SAME PRINCIPLE AS THE iOS MANIFEST APPLIES: the form must AGREE with what the app does, and it
covers the whole product — including the website in the WebView — not just the binary.** ⚠️ **Unlike
iOS, there is no file in the repo to keep in step; the form lives only in the Play console, so nothing
in version control will ever contradict it or remind anyone it exists.**

---

# PART G — THE PICTURE

## G1. One table

| # | Item | Current state | Blocker or backlog | Kind |
|---|---|---|---|---|
| 1 | 🔴 **Hardware back** | No handler. Press either navigates SPA history away or does nothing. **Does not close the app.** | 🔴 **BLOCKER** — an operator loses the screen | **Code** |
| 2 | 🔴 **FCM send path** | **Does not exist.** Token lands; nothing sends. | 🔴 **BLOCKER for parity** — not for install | **Code** |
| 3 | Push platform filter | Correctly excludes Android **until a sender exists** | Backlog — **do not remove before #2** | Code |
| 4 | `ic_stat_icon_config_sample` | Missing asset, under **LocalNotifications** | Backlog — unreachable until #2 | Config + asset |
| 5 | 🔴 **App icon / splash** | **Capacitor stock. Not shared with iOS.** | 🔴 **BLOCKER for submission** | Config + asset |
| 6 | **Signing / keystore** | **NOT FOUND** — no signingConfig, no keystore | 🔴 **BLOCKER for submission** | Config |
| 7 | `versionCode` | **1**, never incremented | 🔴 **BLOCKER for every upload after the first** | Config |
| 8 | **AAB output** | No release config; stock APK path | 🔴 **BLOCKER for submission** | Config |
| 9 | Data safety form | Not started | 🔴 **BLOCKER for submission** | **Play requirement** |
| 10 | Content rating | Not started | 🔴 **BLOCKER for submission** | **Play requirement** |
| 11 | Privacy policy URL | ✅ **Published** — needs entering in the console | Backlog | Play requirement |
| 12 | **Target SDK 36** | ✅ **MEETS the requirement** | ✅ **Done** | Config |
| 13 | `allowNavigation` + `server.url` | ✅ **Present and identical to iOS** | ✅ **Done** | Config |
| 14 | BLE permissions | ✅ Declared by the plugin; runtime prompt exists | Backlog — ⚠️ `androidNeverForLocation` unset | Code |
| 15 | ⚠️ **BLE vs Classic Bluetooth** | BLE-only, chosen for an **iOS** constraint | Backlog — **Android could do SPP** | Code |
| 16 | `@capacitor/android` 8.4.1 skew | Confirmed; unexplained | Backlog | Config |
| 17 | Commerce CTAs shown | ✅ Deliberate | ⚠️ Backlog — **re-read for subscription billing** | Code + Play requirement |
| 18 | WhatsApp hide inherited | Hidden on Android for an **Apple** reason | Backlog — cosmetic | Code |
| 19 | Keep-awake after home | ⚠️ No re-apply found | Backlog — **device-test** | Code |
| 20 | System bars / edge-to-edge | Nothing done; iOS-only safe-area work | Backlog — ⚠️ untested on Android 15+ | Code |
| 21 | Deep links / App Links | **NOT FOUND** — no intent filter | Backlog | Config |
| 22 | `allowBackup="true"` | Stock default; session lives in Preferences | Backlog — **review** | Config |

## G2. The shortest path to an INSTALLABLE build for testing

**Not a submission — something running on a device. Reported as a state of affairs, not a recommendation.**

✅ **The shortest path is very short, and that is the most surprising finding of this audit: nothing
blocks a debug install today.**

- The Android project exists and is complete (`MainActivity`, manifest, gradle, resources).
- All nine plugins are registered with Android implementations.
- `google-services.json` is present and its package matches `applicationId`.
- `targetSdk`/`compileSdk` are current.
- `server.url` and `allowNavigation` are baked and identical to iOS.
- A **debug** build is signed with the auto-generated debug key — **no keystore work is needed to
  install on a device.**

**So the gap between "the repo as it stands" and "an APK on a tablet" is a `cap sync` and a Gradle debug
build.** ⚠️ **Everything in G1 marked BLOCKER is a blocker for SUBMISSION or for CORRECT BEHAVIOUR — not
for installation.**

⚠️ **What that installed build would do wrong, in order of what an operator would notice:**
**back would throw away the screen (#1)**, **no push would ever arrive (#2)**, **the icon would be the
Capacitor default (#5)**, and **printing is untested on the platform (#15)**.

## G3. No order recommended

**As instructed, no ordering and no implementation is proposed.** ⚠️ **One dependency between items is a
fact rather than a preference and is recorded in the table: item 3 must not be changed before item 2, or
the one working piece of Android push is destroyed.**

---

# PART H — INTEGRITY

## H1. Byte scan of every file opened — byte-level, never grep

All 17 files scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F:

| File | Bytes | Offending |
|---|---|---|
| `android/app/src/main/AndroidManifest.xml` | 1,537 | 0 |
| `android/app/build.gradle` | 2,132 | 0 |
| `android/variables.gradle` | 498 | 0 |
| `android/app/src/main/java/com/hatchgrab/app/MainActivity.java` | 121 | 0 |
| `android/app/src/main/assets/capacitor.config.json` | 770 | 0 |
| `android/app/src/main/assets/capacitor.plugins.json` | 1,060 | 0 |
| `android/app/google-services.json` | 721 | 0 |
| `capacitor.config.ts` | 6,599 | 0 |
| `package.json` | 1,815 | 0 |
| `lib/native/app.ts` | 894 | 0 |
| `lib/native/push.ts` | 6,829 | 0 |
| `lib/commerce-policy.ts` | 3,519 | 0 |
| `lib/plan-features.ts` | 23,044 | 0 |
| `app/api/orders/submit/route.ts` | 80,055 | 0 |
| `lib/printing/transport.ts` | 8,865 | 0 |
| `lib/printing/bleTransport.ts` | 20,815 | 0 |
| `docs/reference-manual.md` | 1,572,328 | 0 |

**TOTAL OFFENDING: 0.**

## H2. Byte scan of this report

Separate pass after writing: **44,660 bytes scanned, offending = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

## H3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE (category `Ll`).

Per emoji-presentation base, **measured after writing, not predicted**:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 58 | 0 | 58 |
| U+26A0 WARNING SIGN | 56 | 56 | **0** |
| U+1F534 LARGE RED CIRCLE | 47 | 0 | 47 |
| U+1F6AB NO ENTRY SIGN | 1 | 0 | 1 |

**Sum of per-base paired = 56 = total U+FE0F count = 56** — every selector has a named carrier, no
orphan, no double-count, **zero bare warning signs**. The other three bases are
emoji-presentation-by-default and correctly take no selector; ⚠️ **the single no-entry sign is quoted
verbatim from `lib/native/statusBar.ts`'s Android warning**, not authored here.

## H4. `git status` — proof nothing changed

```
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M docs/reference-manual.md
?? docs/event-cancel-holds-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/meta/
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

🔴 **NOT ONE ENTRY BELONGS TO THIS AUDIT**, and this report does not yet appear because it is being
written now. **Nothing under `android/` is in the diff — not the manifest, not the gradle files, not one
resource.** Nothing staged, branch still `main`.
