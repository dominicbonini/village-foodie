# Android outstanding-work inventory — READ AND REPORT ONLY

**Date:** 25 August 2026
**Nothing was changed.** No edit, no commit, no build, no gradle task, no install.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **THREE OF YOUR PREMISES ARE FALSE AND ONE IS FALSE IN A WORSE DIRECTION THAN YOU THOUGHT.** §A1,
§C10, §D14. Each is reported rather than adapted around.

**Method, per section:** every item is a **source read** except where stated. I ran **no gradle task, no
build, no typecheck and no Android execution.** The only things I *executed* were small read-only
inspections of files already on disk (a JSON parse of `google-services.json`, predicate evaluation of
`proxy.ts`'s allowlist, and image decodes of two PNG assets). **No claim below rests on a build.**

---

# §A — THE PUSH SEND PATH

## A1 🔴 **PREMISE FALSE. Android is NOT excluded from order push, and line 1077 is not the filter.**

`app/api/orders/submit/route.ts:1068-1090` — the region you named — is about `placed_at` and the
confirmation's two stored fields. **There is no recipient filter there.**

**Found by pattern, not by line number.** The real filter is at **`route.ts:1272-1277`**:

```ts
            const { data: devices } = await supabase
              .from('van_devices').select('device_id, push_token, platform').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
            const allDevices = devices || []
            const iosTokens = allDevices.filter(d => d.platform === 'ios' || d.platform == null).map(d => d.push_token as string).filter(Boolean)
            const androidTokens = allDevices.filter(d => d.platform === 'android').map(d => d.push_token as string).filter(Boolean)
            const unroutable = allDevices.filter(d => d.platform != null && d.platform !== 'ios' && d.platform !== 'android')
```

✅ **Android is routed, to FCM, in its own try/catch** (`:1294-1299`), with the file's reasoning at
`:1281-1286`: *"ONE PLATFORM FAILING MUST NOT STOP THE OTHER … A van running one iPad and one Android
tablet gets both alerts, or the one that worked, never neither."*

✅ **It is an allowlist, not a negation** — `:1265-1270` records why: *"Each platform is matched by NAME,
never by negation, so an unrecognised value routes NOWHERE … a 'web' row must not be posted to APNs just
because it is not 'android'."* `platform NULL` routes to APNs (legacy rows, all iOS).

**Every other send site with this shape: there is only one.** `grep -rn "sendOrderPendingPush\b"` across
`app/` and `lib/` returns the two imports at `:26`/`:29`, the two calls at `:1290`/`:1296`, and the two
definitions. **No second push send site exists.**

## A2 `lib/fcm.ts` — wired, and called

**Exported surface — exactly two symbols:**
```ts
export interface OrderPendingPush { orderKey: string; orderNumber: string | number; truckName: string }   // :114
export async function sendOrderPendingPush(…)                                                              // :120
```
✅ **It IS called in the order path today** — imported at `route.ts:29` as `sendOrderPendingPushFcm` and
invoked at `:1296`. **This is not scaffolding.**

🔴 **BUT IT IS A NO-OP UNLESS `FCM_SERVICE_ACCOUNT_JSON` IS SET, AND LOCALLY THAT VARIABLE IS BROKEN.**
See §E15.3 — this is the most consequential thing in the report after the signing config.

## A3 `van_devices.platform` values

**Written in exactly one place** — `lib/native/device.ts:69`:
```ts
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
```
So the value is **whatever Capacitor reports**: `'ios'`, `'android'` or `'web'`. **Read** at
`submit/route.ts:1275-1277`, which recognises `ios`, `android` and `null`, and **logs anything else as
unroutable without clearing its token** (`:1278-1280`).

---

# §B — BACK AND HOME

## B4 `lib/native/backHandler.ts` — the registry, ordering and fallback

- **Registry:** `const resolvers: BackResolver[] = []`, module-scope, with **one** global
  `App.addListener('backButton')` attached lazily on first registration (`ensureListener`, `:48-79`).
- **Ordering: LIFO.** `for (let i = resolvers.length - 1; i >= 0; i--)` — last mounted asked first. Within
  a surface, `useAndroidBack(entries)` takes an **ordered, innermost-first** array of `[isOpen, close]`.
- **Fallback: DO NOTHING.** `// 🔴 NOTHING HANDLED IT. DO NOTHING. No navigation, no exit.`

✅ **THE FALLBACK CHOICE INVERTS THE COVERAGE RISK, AND THE FILE SAYS SO:** *"Registering ANY listener
replaces Capacitor's goBack() branch entirely … an UNHANDLED press stops destroying the page and becomes
inert … A modal this registry does not know about is not made worse by a partial rollout."* ⚠️ **That
materially softens B5 below** — an unregistered overlay is inert, not destructive.

⚠️ Also recorded: `canGoBack` is **deliberately ignored**, a throwing resolver is skipped rather than
taking the handler down, and the listener is **never detached** (detaching would race a remount).

## B5 🔴 OVERLAY CENSUS — WORKED FROM THE SURFACES OUTWARD

**Enumerated by searching for the overlay signature `fixed inset-0` across `app/` and `components/`, then
checking each file against the registry** — not by reading the registry and counting it.

**Registered (4 files):** `app/dashboard/[token]/page.tsx` · `app/dashboard/[token]/kds/page.tsx` ·
`components/shared/RejectOrderModal.tsx` · `components/dashboard/AddOrderPanel.tsx`

**Files containing overlays, with overlay count and registry status:**

| File | overlays | registered? |
|---|---:|---|
| `app/manage/[token]/page.tsx` | **32** | 🔴 **NO** |
| `app/dashboard/[token]/page.tsx` | 12 | ✅ yes |
| `app/dashboard/[token]/kds/page.tsx` | 5 | ✅ yes |
| `app/admin/page.tsx` | 5 | 🔴 **NO** |
| `components/dashboard/AddOrderPanel.tsx` | 4 | ✅ yes |
| `components/manage/ExtrasEditor.tsx` | 3 | 🔴 **NO** |
| `app/trucks/[slug]/order/page.tsx` | 3 | ⚠️ customer web surface |
| `components/shared/EventFinishTimeModal.tsx` | 2 | 🔴 **NO** |
| `components/dashboard/UserMenu.tsx` | 2 | 🔴 **NO** |
| `components/dashboard/PaymentActionsModal.tsx` | 2 | 🔴 **NO** |
| `components/dashboard/BuzzerGrid.tsx` | 2 | 🔴 **NO** |
| `components/shared/RejectOrderModal.tsx` | 1 | ✅ yes |
| `components/shared/ExtraWaitModal.tsx` | 1 | 🔴 **NO** |
| `components/shared/EventCancelModal.tsx` | 1 | 🔴 **NO** |
| `components/shared/EventActionsModal.tsx` | 1 | 🔴 **NO** |
| `components/native/OperatorDeviceConfig.tsx` | 1 | 🔴 **NO** |
| `components/native/AppLockGate.tsx` | 1 | 🔴 **NO** |
| `components/manage/Walkthrough.tsx` | 1 | 🔴 **NO** |
| `components/manage/DeleteAccountSection.tsx` | 1 | 🔴 **NO** |
| `components/dashboard/OrderCard.tsx` | 1 | 🔴 **NO** |
| `components/dashboard/DemoWelcome.tsx` | 1 | 🔴 **NO** |
| `components/dashboard/DealsModal.tsx` | 1 | 🔴 **NO** |
| `components/DemoGetStarted.tsx` | 1 | 🔴 **NO** |
| `components/landing/DemoUpload.tsx` | 1 | ⚠️ landing, web only |

🔴 **THE HEADLINE: `app/manage/[token]/page.tsx` HAS 32 OVERLAYS AND REGISTERS NOTHING.** It is a
primary operator surface in the Android shell. **Manage is the single largest gap by an order of
magnitude.**

⚠️ **Absence established by search**, not by failing to notice: `grep -rln "useAndroidBack"` over `app/`,
`components/` and `lib/` returns exactly five files, four of them call sites and one the module itself.

⚠️ **Severity is bounded by B4's fallback** — back over an unregistered overlay does nothing rather than
destroying the page. **Poor, not destructive.**

## B6 🔴 HOME BUTTON AND BACKGROUNDING

**There is no Home-button handler. Android has no JS-visible Home event** — established by searching for
`backButton|hardwareBackPress|popState|App.addListener` across `app/`, `lib/` and `components/`: the only
`App.addListener` calls are `backButton` (backHandler.ts:58) and `appStateChange` (app.ts:11).

✅ **Backgrounding IS handled, via `appStateChange`.** `lib/native/app.ts` exposes
`onAppResume(cb)` — **resume only**, `if (state.isActive) cb()`. **There is no pause branch.**

**Three consumers:** `components/native/AppLockGate.tsx:49` (re-lock), `lib/native/useHeartbeat.ts:75`
(re-ping — *"a backgrounded WebView suspends setInterval, so the van goes stale"*),
`lib/printing/usePrinting.ts:145`.

🔴 **NO KEEP-AWAKE RELEASE ON BACKGROUND AND NO STATE PERSISTENCE ON PAUSE.** `lib/native/keepAwake.ts`
tracks `keepAwakeEnabled` as *intent* that "survives auto-releases" and retries on
`document.visibilityState === 'visible'` — **the OS releases the lock, nothing in our code does.** No
`appStateChange` handler writes state on the way out.

## B7 GESTURE vs THREE-BUTTON

✅ **Both arrive through the SAME path, and nothing distinguishes them.** Capacitor's
`OnBackPressedCallback` fires one `backButton` event for either; the handler reads no source field. The
file's header confirms both are in scope: *"On the KDS one stray **edge-swipe** lost the board
mid-service."* ⚠️ **The event carries `canGoBack`, which is deliberately ignored — that is the only
payload field and it is not a navigation-mode signal.**

---

# §C — STORE-SUBMISSION READINESS

## C8 🔴 **NO SIGNING CONFIG EXISTS. THIS ALONE BLOCKS A PLAY SUBMISSION.**

`android/app/build.gradle:19-24`, quoted in full:
```gradle
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
```
**No `signingConfigs` block. No `signingConfig` line in `release`.** A `find` for `*.jks`, `*.keystore`,
`keystore.properties` and `signing*` under `android/` returns **only build intermediates**
(`signing_config_versions/debug/…`), i.e. the debug config Gradle generates. **There is no release
keystore in the repo and no reference to one.**

## C9 SDK LEVELS — set in `android/variables.gradle`

```gradle
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
```
Consumed at `android/app/build.gradle:5,8,9` via `rootProject.ext.*`. ✅ **targetSdk 36 is current** and
above Play's floor. `minSdk 24` = Android 7.0.

## C10 🔴 **PREMISE HALF RIGHT, AND THE OTHER HALF IS WORSE THAN YOU THOUGHT**

**Full `res/` inventory:** 10 `splash.png` (land/port × 5 densities) + `drawable/splash.png` ·
`drawable-v24/ic_launcher_foreground.xml` · `drawable/ic_launcher_background.xml` ·
`mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml` · `ic_launcher.png`,
`ic_launcher_foreground.png`, `ic_launcher_round.png` at 5 densities · `layout/activity_main.xml` ·
`values/{colors,ic_launcher_background,strings,styles}.xml` · `xml/{config,file_paths}.xml`.

✅ **YOUR FIRST CLAIM HOLDS: THE NOTIFICATION ICON IS MISSING.** A `find` for `*ic_stat*` and
`*notification*` under `res/` returns **nothing**, and `grep` for `ic_stat|default_notification_icon` in
`AndroidManifest.xml` returns **nothing** — so there is no `com.google.firebase.messaging.default_notification_icon`
meta-data either. **Android will fall back to the launcher icon silhouette, which is the white-square
symptom you described.**

🔴 **YOUR SECOND CLAIM IS REFUTED, AND THE TRUTH IS WORSE. `ic_launcher` IS NOT A WHITE SQUARE — IT IS
CAPACITOR'S OWN LOGO.** I decoded `mipmap-xxxhdpi/ic_launcher_foreground.png`: it is the **blue Capacitor
"X" mark** on the default checkerboard-transparent field, over
`ic_launcher_background = #FFFFFF`. `drawable/splash.png` is **the same Capacitor mark**.

> 🔴 **THE ANDROID APP CURRENTLY CARRIES A THIRD PARTY'S BRAND AS ITS LAUNCHER ICON AND SPLASH.** These
> are the untouched `npx cap add android` defaults. **That is a store-listing problem before it is a
> polish problem**, and it is not what "renders as a white square" would have led you to schedule.

## C11 THE MERGED PERMISSION SET

⚠️ **I FIRST READ THE BUILT MERGED MANIFEST AND THEN WITHDREW IT AS EVIDENCE.**
`android/app/build/intermediates/merged_manifest/debug/…/AndroidManifest.xml` is dated **27 July**, while
`android/capacitor.settings.gradle` is dated **16 August** — **the artefact is stale and does not contain
the Bluetooth plugin at all.** Reporting it would have understated the permission set. **The plugin list
in `capacitor.settings.gradle` is the authority.**

**In `android/app/src/main/AndroidManifest.xml` — exactly one:**
`android.permission.INTERNET` (line 48).

**Arriving by manifest merge from plugins that ARE in `capacitor.settings.gradle`:**

| Plugin | Permissions |
|---|---|
| `@capacitor/local-notifications` | `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `POST_NOTIFICATIONS` |
| `@capacitor/network` | `ACCESS_NETWORK_STATE` |
| `@capacitor-community/bluetooth-le` | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `BLUETOOTH` (maxSdk 30), `BLUETOOTH_ADMIN` (maxSdk 30), `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` |
| `@capacitor/push-notifications` (via the stale artefact, so treat as indicative) | `USE_BIOMETRIC`, `USE_FINGERPRINT`, `com.google.android.c2dm.permission.RECEIVE` |

### 🔴 **`neverForLocation` IS ABSENT. THIS IS THE ANSWER TO YOUR SPECIFIC QUESTION.**

`node_modules/@capacitor-community/bluetooth-le/android/src/main/AndroidManifest.xml`, verbatim:
```xml
    <uses-permission
      android:name="android.permission.BLUETOOTH_SCAN"
      tools:targetApi="s" />
```
**`tools:targetApi="s"` only. No `android:usesPermissionFlags="neverForLocation"`.** And
`ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` are declared **unconditionally**, with no
`maxSdkVersion` and no `tools:node="remove"` anywhere in the app manifest (which declares one permission
in total).

🔴 **CONSEQUENCE FOR PLAY'S DATA-SAFETY SECTION: the listing would declare LOCATION.** A BLE scan without
`neverForLocation` is treated as location-capable, and `ACCESS_FINE_LOCATION` is present outright. **You
would have to complete the Location section, or add the flag and a `tools:node="remove"` override.**

⚠️ **AND THE RUNTIME FLAG DOES NOT HELP.** `lib/printing/bleTransport.ts:122` calls
`BleClient.initialize({ androidNeverForLocation: true })` — **that is a runtime option, not the manifest
attribute Play reads.** They are different things with confusingly similar names.

## C12 VERSIONS — ✅ NO SKEW

| Package | declared | installed |
|---|---|---|
| `@capacitor/core` | 8.4.0 | 8.4.0 |
| `@capacitor/cli` | 8.4.0 | 8.4.0 |
| `@capacitor/ios` | 8.4.0 | 8.4.0 |
| `@capacitor/android` | **8.4.1** | **8.4.1** |
| `@capacitor/app` | 8.1.0 | 8.1.0 |
| `@capacitor/local-notifications` | 8.2.0 | 8.2.0 |
| `@capacitor/network` | 8.0.1 | 8.0.1 |
| `@capacitor/preferences` | 8.0.1 | 8.0.1 |
| `@capacitor/push-notifications` | 8.1.1 | 8.1.1 |
| `@capacitor/status-bar` | 8.0.2 | 8.0.2 |
| `@capacitor-community/bluetooth-le` | 8.3.0 | 8.3.0 |
| `@capacitor-community/keep-awake` | 8.0.1 | 8.0.1 |
| `@aparajita/capacitor-biometric-auth` | 10.0.0 | 10.0.0 |

✅ **Every range is an exact pin and every installed version matches.** ⚠️ **The only skew is
`@capacitor/android` at 8.4.1 against `core`/`cli`/`ios` at 8.4.0** — a patch ahead, normal for the
platform packages, **not a mismatch to act on.**

⚠️ **I could not compare the iOS plugin list: there is no `Podfile` under `ios/`** (`find ios -name
Podfile -not -path "*/Pods/*"` returns nothing). **All ten Android-side plugins are present in
`capacitor.settings.gradle`; the iOS side could not be enumerated the same way.**

---

# §D — PARITY

## D13 EVERY PLATFORM BRANCH — and the shape of them

**~90 call sites across `app/`, `lib/` and `components/`.** 🔴 **ALL BUT TWO ARE NATIVE-vs-WEB, WHICH
TREATS iOS AND ANDROID IDENTICALLY.** The two that distinguish them:

| Site | iOS | Android | Deliberate? |
|---|---|---|---|
| `lib/commerce-policy.ts:45` — `return Capacitor.getPlatform() !== 'ios'` | CTAs **suppressed** | CTAs **allowed** | ✅ **Yes** — the file states *"Only iOS is restricted"* because Google permits steering |
| `lib/native/push.ts:178` — `if (Capacitor.getPlatform() === 'android')` | n/a | channel creation | ✅ Yes — Android notification channels have no iOS counterpart |

**Everything else** — `isNativeApp()` / `isNativePlatform()` — gives Android exactly what iOS gets:
offline overlays, keep-awake, app lock, biometrics, printing, status bar, session, outbox, reachability.

## D14 🔴 **PREMISE VERIFIED AND IT HOLDS — BUT A DIFFERENT GATE HAS THE BUG YOU DESCRIBED**

✅ **The billing gate is correct.** `purchaseCtaAllowed()` keys on **`getPlatform() !== 'ios'`**, so it
returns **true on Android** and no upgrade UI is stripped there. The file's own words: *"it returns true
whenever it cannot affirmatively establish both native AND iOS."* **Eleven call sites consume it and none
re-implements the test.**

🔴 **BUT THE AUTO-REPLIES SECTION IS GATED ON `isNativeApp()`, NOT ON iOS — `app/manage/[token]/page.tsx:9251`:**
```tsx
      {!isNativeApp() && (
      <Card className="p-4 space-y-3">
```
**That hides the whole Auto-replies card on ANDROID TOO.** It was added on 25 August to answer an **Apple**
Guideline 2.1 finding. ⚠️ **Google has no equivalent requirement, so an Apple remedy is silently removing
a feature from Android.** The comment at the site argues `isNativeApp()` is right *because the question is
2.1 completeness rather than 3.1.1 commerce* — **which is sound reasoning about which predicate, and
silent about which platform.** **This is the exact shape you suspected, one gate over.**

---

# §E — FOUND, NOT ASKED FOR

**E15.1 🔴 The launcher icon and splash are Capacitor's brand** — §C10. Listed here too because it is a
submission blocker in its own right, not a polish item.

**E15.2 🔴 `versionCode 1` / `versionName "1.0"`** (`android/app/build.gradle:10-11`) — untouched
defaults. **Fine for a first upload; every subsequent upload needs `versionCode` incremented or Play
rejects the bundle.**

**E15.3 🔴 `FCM_SERVICE_ACCOUNT_JSON` IS SPLIT ACROSS LINES IN `.env.local`.** Line 32's value is a single
`{` character. `lib/fcm.ts`'s own header warns about exactly this: *"Paste the service-account file as ONE
line; a value split across lines is truncated at the first newline."* **Android push is therefore a
no-op locally, and `lib/fcm.ts` will log `NOT CONFIGURED … is not valid JSON`.** ⚠️ **I cannot see
Vercel's copy — production may be fine. Worth checking before scheduling Android push work, because the
symptom is silence.**

**E15.4 ⚠️ `google-services.json` matches the package.** `project_id: hatchgrab`,
`package_name: com.hatchgrab.app` — consistent with `applicationId` at `build.gradle:7`. ⚠️ **I could not
confirm it matches the FCM service account's project, because of E15.3.**

**E15.5 ⚠️ `android:allowBackup="true"`** (`AndroidManifest.xml:5`) — the default. **Auto Backup will copy
app data, including anything in Preferences, to the user's Google account.** The Supabase session lives in
Preferences. **Not a build failure; a data-handling decision that Play's data-safety section will ask
about.**

**E15.6 ⚠️ `minifyEnabled false` on release** — permitted, but it ships an unshrunk, unobfuscated bundle.

---

# §F — WHAT WOULD ACTUALLY STOP A SUBMISSION TODAY

🔴 **In order, and none of these is speculative:**

1. **No release signing config** (§C8) — `assembleRelease` produces an unsigned artefact. **Hard blocker.**
2. **Capacitor's logo as the launcher icon and splash** (§C10, §E15.1).
3. **No notification icon** (§C10) — push arrives as a white square.
4. **Location in the data-safety declaration** (§C11), because `neverForLocation` is absent and
   `ACCESS_FINE_LOCATION` is declared outright.

**Not blockers, but scheduled work:** the 32 unregistered overlays in Manage (§B5), no pause-side
lifecycle handling (§B6), and the Auto-replies gate stripping a feature from Android (§D14).

✅ **Nothing was fixed, edited, built, run or installed.**
