# Android capability parity — what is wired on both platforms, and what only looks like it is

READ-ONLY DIAGNOSIS. **No file was edited, nothing was committed, no build was run, no deploy, no
`cap sync`, no package installed.** `git status` is in I4. **Nothing is proposed outside Part H.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

iOS and Android are reported **separately** throughout. **No claim about one is used as evidence about
the other.** Every claim is marked **READ**, **INFERRED** or **ARTEFACT** (read out of a real build
output).

Read first: manual **§11** and **§36**, `docs/android-audit-report.md`,
`docs/android-back-handler-report.md`.

---

# 🔴 THE THREE THINGS THAT MATTER, BEFORE THE TABLE

**1. There IS a real merged manifest to read, and it is stale in exactly the wrong place.**
`android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml`
is a genuine build artefact — **dated 27 July 21:54**. The BLE printing plugin entered
`capacitor.settings.gradle` on **15 August** (`b175963`). 🔴 **So the only build evidence available
predates the single capability with the largest permission surface.** Everything about Bluetooth below
is INFERRED from the plugin's own manifest, never from a build.

**2. Tapping a push notification deep-links nowhere — on BOTH platforms.**
`registerForPush(token, onOpenOrder?)` accepts a handler. **All three call sites pass only the token.**
The listener is attached and correct; its payload is dropped because the callback is `undefined`. This
is **parity**, and parity at zero.

**3. An Android operator is asked for LOCATION in order to print a receipt.**
`BleClient.initialize()` is called with no options, so `androidNeverForLocation` defaults false, and on
API 31+ the plugin requests `ACCESS_FINE_LOCATION` alongside the two Bluetooth permissions.

---

# PART A — THE PARITY TABLE

## A1. Every native capability the app uses

Fifteen from the brief, plus **four it did not list** and one correction:

1. Biometric app lock · 2. Keep-awake · 3. Push registration · 4. Push send · 5. BLE printing ·
6. Network/reachability · 7. Local notifications · 8. Status bar · 9. Splash · 10. App icon ·
11. Hardware back · 12. Deep links · 13. Session persistence · 14. Device config ·
15. **Offline outbox** (Preferences-backed — the most consequential native store in the app) ·
16. **The UA marker** (`appendUserAgent`, per-platform, §36 calls it the easiest thing to get wrong) ·
17. **App state / resume** (`@capacitor/app` `appStateChange`) · 18. **File provider** ·
19. **Notification channels** (Android-only concept, no iOS counterpart).

## A2. The table — Android evidence quoted per row

| # | Capability | iOS state | Android state (evidence) | Verdict |
|---|---|---|---|---|
| 1 | **Biometric app lock** | Face ID / Touch ID via `@aparajita/capacitor-biometric-auth`; `NSFaceIDUsageDescription` present (§36) | **ARTEFACT** — merged manifest carries `USE_BIOMETRIC` **and** `USE_FINGERPRINT`; plugin contributes an `AuthActivity`. Code path is shared, no platform branch | ✅ **PARITY** |
| 2 | **Keep-awake** | `@capacitor-community/keep-awake` + a `wakeLock` web fallback | **READ** — `lib/native/keepAwake.ts:46` gates on `isNativePlatform()` only; plugin's own manifest is **empty**; merged manifest has `WAKE_LOCK` (from LocalNotifications) | ✅ **PARITY** — see E1 for the caveat |
| 3 | **Push registration** | 🔴 **has NEVER obtained a token** (§36: `push_token` NULL on all four iOS rows) | ✅ **WORKS** — §36 VERIFIED: 142-char token, `platform='android'` | 🔴 **ANDROID AHEAD OF iOS** |
| 4 | **Push send** | `lib/apns.ts`, HTTP/2 + ES256 | **READ** — `lib/fcm.ts` + the platform routing at `submit/route.ts:1293-1316` | ✅ **PARITY** (D1) |
| 5 | **BLE printing** | plugin + `NSBluetoothAlwaysUsageDescription` assumed present | ⚠️ **INFERRED ONLY** — plugin manifest declares 6 permissions; **absent from the 27-July merged artefact because the plugin postdates it** | ⚠️ **ANDROID PARTIAL** (C) |
| 6 | **Network / reachability** | `@capacitor/network` + `/api/ping` poll | **ARTEFACT** — `ACCESS_NETWORK_STATE` in the merged manifest. **READ** — `lib/native/network.ts` has no platform branch | ✅ **PARITY** |
| 7 | **Local notifications** | plugin, `smallIcon: 'ic_stat_icon_config_sample'` in config | **ARTEFACT** — `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` merged, three receivers registered. 🔴 **but the named icon asset does not exist** | ⚠️ **ANDROID PARTIAL** |
| 8 | **Status bar** | `setOverlaysWebView` + `setStyle` — both load-bearing | **READ**, `statusBar.ts:15-36`: `setOverlaysWebView` **INERT on Android 15+**, `setBackgroundColor` **REMOVED as a verified no-op**, only `setStyle` works. Strip painted by `styles.xml` `windowBackground` instead | ✅ **ANDROID DIFFERENT BY DESIGN** — documented, deliberate |
| 9 | **Splash** | `#0F172A` launch screen | **READ** — `android/app/src/main/res/drawable/splash.png`, md5 `acc976d4…`, Capacitor stock; 11 `drawable-{port,land}-*` density folders, all scaffold | 🔴 **ANDROID MISSING** (G) |
| 10 | **App icon** | deliberate white-ground icon (`0b0ed82`, then `b175963`) | **READ** — `mipmap-*/ic_launcher.png` md5 `9e029293…`; iOS `AppIcon-512@2x.png` md5 `57b71d88…`. **Different bytes. Not shared** | 🔴 **ANDROID MISSING** (G) |
| 11 | **Hardware back** | **NOT APPLICABLE** — no hardware back on iOS | ✅ **READ** — `lib/native/backHandler.ts`, 22 overlays wired across 3 surfaces | ✅ **ANDROID-ONLY, BUILT** |
| 12 | **Deep links / app links** | — | 🔴 **NOT FOUND** — `grep -c "VIEW\|BROWSABLE\|android:host"` on the manifest returns **0**; one intent-filter, `MAIN`/`LAUNCHER` | 🔴 **ANDROID MISSING** (E5) |
| 13 | **Session persistence** | Preferences via `storageKey: 'hg-native-auth'` | **READ** — `lib/native/session.ts:24` has no platform branch; **READ** `Preferences.java:17` → `getSharedPreferences(group, MODE_PRIVATE)` | ✅ **PARITY** |
| 14 | **Device config** | `device_id` + `van_id` + `default_screen` + `push_token` | **READ** — `lib/native/device.ts:69` sends `platform: Capacitor.getPlatform() ?? 'web'`; same endpoint | ✅ **PARITY** |
| 15 | **Offline outbox** | Capacitor Preferences | **READ** — same module, same plugin, SharedPreferences backing | ✅ **PARITY** |
| 16 | **UA marker** | `appendUserAgent: 'HatchGrabNativeApp'` | **READ** — `capacitor.config.ts` `android` block carries the **byte-identical** string | ✅ **PARITY** |
| 17 | **App state / resume** | `@capacitor/app` `appStateChange` | **READ** — `lib/native/app.ts`, no branch; plugin present in `capacitor.settings.gradle` | ✅ **PARITY** |
| 18 | **File provider** | — | **READ** — declared in our manifest with `@xml/file_paths` | ✅ **ANDROID-ONLY, PRESENT** |
| 19 | **Notification channels** | **NOT APPLICABLE** | 🔴 **NOT FOUND** — no `createChannel` call anywhere in `app/`, `lib/`, `components/`; no `default_notification_channel_id` meta-data | 🔴 **ANDROID MISSING** (D4) |

## A3. 🔴 Ranked by what an operator would actually notice

| Rank | Gap | What the operator sees |
|---|---|---|
| **1** | **BLE permissions unproven + location prompt** (5) | Taps *Connect printer* and is asked **"Allow HatchGrab to access this device's location?"** — on a receipt printer. Alarming, and a plausible refusal → printing silently unavailable |
| **2** | **No notification channel, no push icon** (7, 19) | A push arrives as a **white square** in an unnamed system channel. It arrives — but cannot be recognised, muted or prioritised, and looks broken |
| **3** | **No deep links** (12) | Nothing an operator does opens the app from a link. **Also invisible** — nobody misses a route they never had |
| **4** | **Stock icon and splash** (9, 10) | Every launch shows Capacitor's default. The most visible gap on this list and the least functional |
| **5** | **Status-bar mechanism differs** (8) | ✅ Nothing — documented, deliberate, and §36 records it rendering correctly |

⚠️ **AND ONE ITEM THAT IS NOT AN ANDROID GAP BUT SITS ABOVE ALL OF THEM: the push tap handler is dead
on both platforms** (D3).

---

# PART B — BIOMETRIC APP LOCK

## B1. The implementation, end to end

**READ** — `lib/native/appLock.ts`, the plugin call:

```ts
export async function isBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
    const info = await BiometricAuth.checkBiometry()
    return !!(info.isAvailable || info.strongBiometryIsAvailable)
  } catch { return false }
}
```

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

**READ** — the PIN fallback, hashed, never stored in clear:

```ts
export async function setAppLockPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(pin, salt)
  await Preferences.set({ key: PIN_KEY, value: JSON.stringify({ salt: toB64(salt), hash }) })
}
```

```ts
const PIN_KEY = 'hg_app_lock_pin'   // native Preferences (NOT localStorage) — {salt,hash}, never the PIN itself
```

⚠️ **`iosFallbackTitle` is iOS-only and there is no `androidFallbackTitle`.** **INFERRED:** on Android
the system BiometricPrompt supplies its own credential-fallback label, so the omission costs a custom
string, not a route.

## B2. 🔴 Where the PIN lives on Android — and it is equally private

**READ** — `node_modules/@capacitor/preferences/android/.../Preferences.java:17`:

```java
        this.preferences = context.getSharedPreferences(configuration.group, Activity.MODE_PRIVATE);
```

**READ** — the iOS side, `Preferences.swift:19`:

```swift
        return UserDefaults.standard
```

✅ **`MODE_PRIVATE` SharedPreferences is app-private storage, the direct analogue of `UserDefaults`
— equally private, and equally NOT encrypted at rest on either platform.** ⚠️ **Neither is a keychain
or a keystore.** What protects the PIN is not the store: it is that **only PBKDF2-SHA256 at 100,000
iterations over a random 16-byte salt is written**, never the PIN — and that is platform-independent
Web Crypto running in the WebView. ✅ **Parity is exact, including the limitation.**

⚠️ **One Android-specific consequence worth recording:** `android:allowBackup="true"` is set in our
manifest (line 5). **INFERRED:** SharedPreferences is eligible for Android's backup/transfer, so the
salted hash — and the **offline outbox** — may leave the device in a cloud backup. On iOS the
equivalent question is `UserDefaults` and iCloud backup. **Not a defect; an asymmetry in default
posture that nobody has decided about.**

## B3. Does the manifest declare the biometric permission?

✅ **YES — and this is ARTEFACT, not inference.** Our own `AndroidManifest.xml` declares **only
`INTERNET`**; the permission arrives by **manifest merge**. From the real build output:

```
android:name="android.permission.USE_BIOMETRIC"
android:name="android.permission.USE_FINGERPRINT"
```

**READ** — the plugin's own manifest contributes an activity but **no permission**:

```xml
    <application>
      <activity
        android:name=".AuthActivity"
        android:label="@string/title_activity_auth_activity"
        android:theme="@style/AppTheme.Transparent"/>
    </application>
```

**INFERRED:** the two permissions come from the `androidx.biometric` AAR the plugin depends on,
merged transitively. ✅ **The artefact is what proves it; the plugin manifest alone would not have.**

## B4. What happens on Android with nothing enrolled

**READ, the path, in order:**

1. `isBiometricAvailable()` → `checkBiometry()` → with nothing enrolled, `isAvailable` and
   `strongBiometryIsAvailable` are both false → returns **false**.
2. `bioAvailable` false → `OperatorDeviceConfig.tsx:288` renders the amber warning.
3. If the operator unlocks anyway, `verifyIdentity()` runs `authenticate({ allowDeviceCredential: true })`
   → **INFERRED:** BiometricPrompt presents the **device PIN / pattern / password** instead.
4. If that also fails, `AppLockGate` offers the **backup PIN**, verified entirely offline.

⚠️ **DOES THE BEHAVIOUR MATCH THE NEW WORDING? ALMOST — AND THE GAP IS ONE WORD.** The copy now reads
*"No fingerprint or face unlock set up on this device — add one in your device settings. Your backup
PIN still works."* ✅ Both clauses are true on both platforms. ⚠️ **But `allowDeviceCredential: true`
means the lock still opens with the DEVICE passcode**, which the sentence does not mention — it offers
only the backup PIN as the way in. **The copy under-states the available routes rather than
over-stating them, which is the safe direction, and it is now the only mismatch left.**

## B5. 🔴 `AppLockGate.tsx` still carries the old wording

**READ, unchanged, exactly as left out of scope last turn:**

```tsx
AppLockGate.tsx:76      Can&apos;t use Face / Touch ID?
AppLockGate.tsx:95      className="text-white/50 text-xs underline">Try Face / Touch ID instead</button>
AppLockGate.tsx:2       // Biometric APP-LOCK overlay. When enabled (per-device), covers the screen and prompts Face ID / Touch ID
```

🔴 **So the settings card and the lock screen it configures now disagree**, and the lock screen is the
one an Android operator meets **while locked out**. **READ** — two more in
`lib/native/appLock.ts:5` and `:71`, both comments. **Reported, not changed.**

---

# PART C — PRINTING

## C1. 🔴 What is declared, what is required, and which API level needs what

**READ, our manifest — the complete permission block:**

```xml
    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
```

**READ, the plugin's manifest — six permissions plus a feature declaration:**

```xml
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
  <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
  <uses-permission android:name="android.permission.BLUETOOTH_SCAN" tools:targetApi="s" />
  <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" tools:targetApi="s" />
  <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
```

**READ — the plugin decides which set to REQUEST at runtime, by API level**
(`BluetoothLe.kt:105-127`):

```kotlin
    fun initialize(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val neverForLocation = call.getBoolean("androidNeverForLocation", false) as Boolean
            aliases = if (neverForLocation) {
                arrayOf("BLUETOOTH_SCAN", "BLUETOOTH_CONNECT",)
            } else {
                arrayOf("BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "ACCESS_FINE_LOCATION",)
            }
        } else {
            aliases = arrayOf("ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "BLUETOOTH", "BLUETOOTH_ADMIN",)
        }
        requestPermissionForAliases(aliases, call, "checkPermission")
    }
```

**So, stated plainly:**

| Device API | Requested at runtime | Source |
|---|---|---|
| **31+ (Android 12+)** | `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, **`ACCESS_FINE_LOCATION`** | READ, the `>= S` branch |
| **24–30** | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`, `BLUETOOTH`, `BLUETOOTH_ADMIN` | READ, the `else` branch |

🔴 **AND `androidNeverForLocation` IS NOT PASSED. READ**, `lib/printing/bleTransport.ts:107-112`:

```ts
  const ensureInit = async (): Promise<void> => {
    if (initialised) return
    const BleClient = await ble()
    await BleClient.initialize()
    initialised = true
  }
```

**No options object.** So the flag defaults false and **every Android 12+ operator is asked for
LOCATION to connect a receipt printer.** ⚠️ **INFERRED, and it is the part that matters commercially:**
that prompt is refusable, and a refusal is indistinguishable from "printing does not work".

⚠️ **`minSdkVersion = 24`, `targetSdkVersion = 36` (READ, `android/variables.gradle`)** — so **both**
branches above are reachable in the shipped range.

🔴 **AND NONE OF THIS IS PROVEN BY A BUILD.** The merged manifest is dated **27 July**; BLE entered
`capacitor.settings.gradle` on **15 August**. The artefact contains **zero** Bluetooth or location
permissions — **not because they were stripped, but because the plugin was not there yet.** ⚠️ **That
distinction is the whole finding: I can prove the merge works for biometrics, notifications and
network; I cannot prove it for Bluetooth, and no one has built it since.**

## C2. Is there runtime permission handling?

✅ **YES — and it is the plugin's, triggered by our code without our code knowing it.**

**READ** — the plugin declares Capacitor permission aliases (`BluetoothLe.kt:45-81`) and
`initialize()` ends with `requestPermissionForAliases(aliases, call, "checkPermission")`. **Our
`ensureInit()` calls `initialize()` before every operation**, so the prompt is raised by
`availability()`, `scan()` and `connect()` alike.

⚠️ **NOT FOUND in our code: any `checkPermissions` / `requestPermissions` call, any permission-state
inspection, any copy explaining why a prompt is appearing.** **READ** — the only handling is a
`try`/`catch` mapping a throw to one word:

```ts
      try {
        await ensureInit()
      } catch {
        return 'unauthorised'
      }
```

## C3. Does `availability()` answer honestly on Android?

**READ, in full:**

```ts
    async availability(): Promise<PrinterAvailability> {
      if (!Capacitor.isNativePlatform()) return 'unsupported'
      try {
        await ensureInit()
      } catch {
        return 'unauthorised'
      }
      try {
        const BleClient = await ble()
        return (await BleClient.isEnabled()) ? 'available' : 'off'
      } catch {
        return 'off'
      }
    },
```

✅ **Honest on Android, and for a reason the comment states: a refused permission is reported as a
THROW by this plugin, so `'unauthorised'` is a real answer rather than a guess.** ⚠️ **One imprecision
that is Android-specific:** the second `catch` collapses *"radio off"* and *"the `isEnabled` call
failed"* into `'off'`. On Android those differ — a user can enable Bluetooth from the shade — but the
operator is told the same thing either way. **Wrong in the recoverable direction.**

## C4. Does the scan work, and is anything platform-specific?

🔴 **NOT FOUND — there is no platform-specific code anywhere in `lib/printing/`.** Every gate is
`isNativePlatform()`:

```
lib/printing/transport.ts:130       if (Capacitor.isNativePlatform()) {
lib/printing/bleTransport.ts:142    if (!Capacitor.isNativePlatform()) return 'unsupported'
lib/printing/bleTransport.ts:162    if (!Capacitor.isNativePlatform()) return []
lib/printing/bleTransport.ts:199    if (!Capacitor.isNativePlatform()) return { ok: false, error: 'Printing is only available in the app' }
lib/printing/bleTransport.ts:254    if (!id || !Capacitor.isNativePlatform()) return
lib/printing/bleTransport.ts:295    if (!Capacitor.isNativePlatform()) return { connected: false, detail: 'Printing is only available in the app' }
lib/printing/bleTransport.ts:317    if (!Capacitor.isNativePlatform()) return
```

**READ — the discovery path itself:**

```ts
      await BleClient.requestLEScan({ allowDuplicates: false }, result => {
        const id = result?.device?.deviceId
        if (!id) return
        const name = result?.device?.name || result?.localName
        if (!name) return
        found.set(id, { id, name, class: 'ble', likely: looksLikePrinter(name, result?.uuids) })
      })
      await sleep(6000)
```

⚠️ **`result.device.name` is the Android-relevant field and it is read.** ⚠️ **INFERRED, and it is a
real Android-only risk: nameless peripherals are DROPPED, and with `BLUETOOTH_SCAN` granted but
`ACCESS_FINE_LOCATION` refused, Android returns scan results with names stripped on some versions** —
which would present as **an empty printer list with permission apparently granted.** Not verified.

## C5. Could an Android operator print today?

🔴 **NO — and the blocker is not the permissions.** Three things, in order:

1. ⚠️ **The permission merge is unproven** (C1) — plausible, never built.
2. 🔴 **The location prompt is refusable** and a refusal is silent (C1).
3. 🔴 **Printing is Max-gated and the transport has never printed on ANY platform.** §36's own
   never-run list is explicit, and `docs/android-audit-report.md` records printing as untested on the
   platform. **INFERRED: an Android operator is no worse off than an iOS one here — both are at zero.**

✅ **What would NOT stop them:** the manifest (the plugin supplies it), the runtime flow (the plugin
supplies it) and the code paths (identical, no branch).

---

# PART D — PUSH

## D1. ✅ The send path routes Android to `lib/fcm.ts`

**READ** — `app/api/orders/submit/route.ts:1290-1316`:

```ts
            const iosTokens = allDevices.filter(d => d.platform === 'ios' || d.platform == null).map(d => d.push_token as string).filter(Boolean)
            const androidTokens = allDevices.filter(d => d.platform === 'android').map(d => d.push_token as string).filter(Boolean)
            const unroutable = allDevices.filter(d => d.platform != null && d.platform !== 'ios' && d.platform !== 'android')
…
            if (androidTokens.length) {
              try {
                const res = await sendOrderPendingPushFcm(androidTokens, { orderKey: order?.order_key ?? '', orderNumber: orderId, truckName: truck.name })
                invalidTokens.push(...res.invalidTokens)
              } catch (fcmErr) { console.error('FCM push failed (non-fatal, iOS unaffected):', fcmErr) }
            }
```

✅ **The `.or('platform.eq.ios,platform.is.null')` allowlist is gone; routing is by name with a
default-deny for anything else.** ⚠️ **Server-side only** — never exercised against a device.

## D2. 🔴 What Android renders with no icon configured

**READ — the merged manifest, searched for the meta-data FCM looks for:**

```
--- notification icon meta-data ---
(blank = NOT FOUND)
```

**READ** — `capacitor.config.ts` configures `smallIcon` under **`LocalNotifications` only**; there is
no `PushNotifications` plugin block. **READ** — `find android -name "ic_stat*"` returns **nothing**, so
even the icon named for local notifications does not exist.

**READ** — the plugin's own README documents both as the app's responsibility:

```
<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@mipmap/push_icon_name" />
```

🔴 **WOULD IT STILL ARRIVE? YES.** **INFERRED**, and the reasoning is structural: delivery is
`MessagingService extends FirebaseMessagingService` (**READ**, registered in the merged manifest with
`com.google.firebase.MESSAGING_EVENT`), and the icon is a **presentation** attribute read when the
notification is built. A missing icon cannot stop a message being delivered.

**What renders instead — INFERRED, from documented Android behaviour:** FCM falls back to the
**application icon**, and since API 21 the small icon is drawn as a **silhouette** — alpha kept, colour
discarded. ⚠️ **And the launcher icon is the Capacitor stock one (G1), so the fallback is a white blob
that identifies nothing.**

## D3. 🔴 Tapping the notification opens nothing — on BOTH platforms

**READ** — the listener is attached, early and awaited, and reads the right key:

```ts
        PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, unknown> } }) => {
          const data = action?.notification?.data
          const orderKey = data && typeof data.orderKey === 'string' ? data.orderKey : null
          if (orderKey && onOpenOrder) onOpenOrder(orderKey)
        }),
```

**READ** — the signature makes the handler optional:

```ts
export async function registerForPush(token: string, onOpenOrder?: (orderKey: string) => void): Promise<void> {
```

🔴 **AND ALL THREE CALL SITES PASS ONLY THE TOKEN:**

```
components/native/OperatorDeviceConfig.tsx:43    if (device && device.van_id) { void registerForPush(token); setLoading(false); return }
components/native/OperatorDeviceConfig.tsx:49      if (saved) void registerForPush(token)
components/native/OperatorDeviceConfig.tsx:69    if (saved) { void registerForPush(token); setNeedsSetup(false) }
```

**`onOpenOrder` is `undefined` at every site, so `if (orderKey && onOpenOrder)` is never satisfied and
the payload is discarded.** ✅ **The FCM payload does carry it** (`data: { type: 'order_pending',
orderKey }`, **READ** in `lib/fcm.ts`) and so does the APNs one. **The data is right; the receiver is
absent.**

⚠️ **THIS IS PARITY, AND THAT IS THE POINT: it is equally dead on iOS.** It is not an Android gap and
it is not caused by anything Android — but it outranks most of this report, because it is the one
push behaviour an operator would actually try.

## D4. 🔴 Notification channels — NOT FOUND, and it is the silent one

**NOT FOUND, stated plainly:**

- **No `createChannel` call anywhere in `app/`, `lib/` or `components/`.** The only hits are inside
  `node_modules/@capacitor/push-notifications/.../NotificationChannelManager.java`.
- **READ** — that class is only reachable from a JS call: `PushNotificationsPlugin.java:192`
  `public void createChannel(PluginCall call) { notificationChannelManager.createChannel(call); }`.
  Its constructor stores three fields and creates nothing.
- **No `default_notification_channel_id` meta-data** in our manifest, the merged manifest, or
  `capacitor.config.ts`.

**INFERRED, from documented FCM behaviour:** with no channel specified and no default declared, the
Firebase Messaging SDK creates and uses a **fallback channel** (conventionally *"Miscellaneous"*).
✅ **So notifications ARRIVE rather than being dropped** — the brief's *"silently dropped"* concern is
the pre-FCM-SDK behaviour, and the SDK's fallback prevents it.

🔴 **BUT THE CONSEQUENCE IS STILL REAL AND STILL SILENT.** Everything channel-scoped on Android 8+ —
**importance, sound, vibration, whether it can bypass Do Not Disturb** — belongs to that fallback
channel. Our FCM payload sends `android: { priority: 'high', notification: { sound: 'default' } }`
(**READ**, `lib/fcm.ts`), and ⚠️ **channel importance overrides message priority for heads-up
display**. An operator who mutes the unrecognised *"Miscellaneous"* channel silences order alerts with
no way to connect the two.

---

# PART E — EVERYTHING ELSE

## E1. Keep-awake on Android

**READ** — `lib/native/keepAwake.ts:46`, the only gate:

```ts
  if (!Capacitor.isNativePlatform()) return null
  const { KeepAwake } = await import('@capacitor-community/keep-awake')
  return { KeepAwake }
```

✅ **No platform branch; the plugin is in `capacitor.settings.gradle`; its own manifest is empty**
(`FLAG_KEEP_SCREEN_ON` needs no permission). ⚠️ **Does it work through a service? UNKNOWN on both
platforms** — §36 lists *"Keep-awake through a full service"* under **NEVER RUN ON ANY DEVICE**, and
the `allowSleep()` cleanup removal as **REASONED ONLY**. 🔴 **And §36 names the Android-specific risk
this cannot cover: OEM background-killing (Samsung, Xiaomi) on a tablet left on a counter — the near-stock
emulator is explicitly "NOT REPRESENTATIVE".**

## E2. Reachability — which detectors work on Android

**§35 records three. READ, each:**

| Detector | Android | Evidence |
|---|---|---|
| **`/api/ping` poll** (`reachability.ts`) | ✅ works | Plain `fetch`, no plugin, no branch |
| **`@capacitor/network` events** | ✅ works | `ACCESS_NETWORK_STATE` **ARTEFACT** in the merged manifest; `network.ts` branches only on `isNativePlatform()` |
| **`navigator.onLine`** (web arm) | ✅ works | Same WebView API |

🔴 **NOT FOUND: any iOS-only reachability path.** **READ** — `lib/native/network.ts` in full is 31
lines with exactly one branch, `isNativePlatform()`. ✅ **Full parity.**

## E3. Session persistence

**READ** — `lib/native/session.ts:24`:

```ts
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hg-native-auth', storage: preferencesAuthStorage } },
```

✅ **Identical on Android** — `preferencesAuthStorage` wraps `@capacitor/preferences`, which is
`SharedPreferences(MODE_PRIVATE)` there (B2). ⚠️ **§36 lists *"Session survival across force-quit"* as
never run on either platform.**

## E4. `default_screen` and cold-launch routing

**READ** — `app/app/page.tsx:52`:

```tsx
            const screen = getLastScreen() ?? device.default_screen
```

**READ** — `getLastScreen()` is `localStorage`-backed (`device.ts:85-91`) and `default_screen` comes
from `van_devices` via the same endpoint on both platforms. ✅ **Same path, no branch.** ⚠️ **Android
records it identically:** `kds/page.tsx:84` `if (isNativeApp()) setLastScreen('kds')` — `isNativeApp()`
is true on Android.

## E5. 🔴 Deep links / app links — NOT FOUND

**READ** — the entire manifest contains **one** intent-filter:

```xml
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
```

**`grep -c "VIEW\|BROWSABLE\|android:host"` returns 0. `grep "hatchgrab"` returns nothing.** No
`android:autoVerify`, no App Links, no custom scheme. ⚠️ **INFERRED consequence:** a hatchgrab.com link
tapped on an Android device opens the browser, never the app — including the *"Cancel your order"* link
and any future push deep-link. 🔴 **It also means D3 could not work even if `onOpenOrder` were passed
from a cold start via a link**, though the plugin's own tap event does not depend on it.

## E6. Status bar and safe area on notched Android

🔴 **Documented, deliberate, and the answer is "env() resolves to 0 and that is correct".**
**READ** — `lib/native/statusBar.ts:38-48`:

```
    // 🚫 DO NOT ADD env(safe-area-inset-top) OR --safe-area-inset-top HANDLING FOR ANDROID.
    // ONLY ONE MECHANISM MAY OWN THE INSET. On Android 15+ Capacitor's core SystemBars plugin has ALREADY
    // padded the WebView's parent down by the status-bar height … and zeroed the insets it hands the WebView.
    // Adding CSS padding on top of that pads TWICE … exactly the two-band bug V8.7 removed on iOS.
    // AppHeader's paddingTop: env(safe-area-inset-top) is safe precisely BECAUSE env() resolves to 0 there.
    // Note Capacitor 8 injects a CSS CUSTOM PROPERTY (--safe-area-inset-top), NOT env(), so nothing here
    // reads it today. This only becomes relevant on the PASSTHROUGH branch (WebView >= 140 AND
    // viewport-fit=cover), where env() is populated natively … Passthrough is UNVERIFIED on our devices.
```

✅ **So a notch or punch-hole is handled by the OS padding the WebView's parent, not by our CSS.**
⚠️ **UNVERIFIED CASE, flagged by §36 and unchanged: the passthrough branch.** ⚠️ **And §36's testing
trap stands — the physical Lenovo Tab (Android 14) MASKS the inset bug the API-36 emulator exposes, so
here the more realistic device gives the less realistic answer.**

---

# PART F — DELIBERATE ASYMMETRIES

## F1. ✅ Android SHOWS the upgrade CTAs, by construction

**READ** — `lib/commerce-policy.ts:39-46`:

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

✅ **Confirmed: on Android this returns `true`, so every 3.1.1-gated CTA renders.** ✅ **Still
intended** — the file's own docstring says so, and names the failure direction: *"THE UNKNOWN CASE
FAILS OPEN, AND THAT IS THE DELIBERATE DIRECTION."*

## F2. 🔴 The WhatsApp section IS hidden on Android — and that reads as an accident

**READ** — `app/manage/[token]/page.tsx:8938`:

```tsx
        {!isNativeApp() && (<>
```

✅ **Confirmed hidden on Android**, because `isNativeApp()` is `Capacitor.isNativePlatform()`.

🔴 **AND THE COMMENT ABOVE IT REASONS ONLY ABOUT iOS. READ:**

```
            ⚠️ isNativeApp, NOT purchaseCtaAllowed. That is the 3.1.1 COMMERCE predicate; this is
            neither commerce nor 2.1 completeness. Manual section 40 keeps them separate — do not merge.
            ⚠️ FAILURE DIRECTION IS THE SAFE ONE: … A wrong answer therefore SHOWS the section on iPad
            (mild); it cannot hide a working control from Gusto on the web.
```

⚠️ **Every consequence it weighs is an iPad one — "shows the section on iPad", "in the build going to
App Review".** The predicate chosen is platform-blind, so **Android inherited the hiding without
anyone weighing it.** 🔴 **The comment even records that the control is LIVE for Gusto** (*"Pizzeria
Gusto has a sender set, and their `preferred_contact_method` is 'whatsapp'"*) — so an Android operator
would be unable to reach a working control, for an App Review rule that does not apply to their store.
**INFERRED: accident, not decision. Reported, not changed.**

## F3. Every other `isNativeApp()` call site, and whether Android inheriting it was intended

**READ — 40 call sites (excluding comments). Grouped by whether Android inheriting is right:**

| Group | Sites | Android inheriting is |
|---|---|---|
| **Native-only UI that Android genuinely has** — device config, printing settings, notification settings, offline banner, van chooser, app-lock gate, dev tools | `OperatorDeviceConfig` ×4, `PrintingSettings` ×2, `NotificationSettings` ×2, `OfflineBanner` ×2, `VanMenuChooser` ×2, `AppLockGate:20`, `DevOfflineToggle` ×2, `DevOutboxInspector` ×2, `UserMenu:191`, `kds/page:1265` | ✅ **DECISION** — each guards a capability Android has |
| **Navigation / shell behaviour** — soft-nav, brand link, legal layout, cold launch, sign-out | `AppLink:33`, `BrandHomeLink:86`, `(legal)/layout:55`, `app/page:21`, `signOut:20`, `DashboardIndexNativeFallback:20` | ✅ **DECISION** — the shell behaves the same on both |
| **Offline machinery** — the outbox gate and its overlays | `orderGate:214,224`, `useOutboxConflicts` ×2, `useOfflinePaymentOverlay` ×3, `useOfflineStatusOverlay` ×3, `useOfflineAlert:18`, `AddOrderPanel:283,1250` | ✅ **DECISION** — platform-independent by design |
| **Session / auth** | `session.ts:31,37`, `login/page:31,50` | ✅ **DECISION** — Preferences-backed on both (E3) |
| **Web-only inverse** | `WebOfflineBanner:26,66` | ✅ **DECISION** — correctly hides the web banner in both shells |
| **Status bar + last screen** | `dashboard/page:197,914,1232`, `kds/page:84` | ✅ **DECISION** — but see E6: `configureStatusBar()` does something *different* on Android by design |
| 🔴 **The WhatsApp section** | `manage/page:8938` | 🔴 **ACCIDENT** — F2 |

🔴 **One accident in forty. Everything else reads as considered**, and several sites carry comments
that name both platforms explicitly.

---

# PART G — ASSETS

## G1. Android icons and splash are stock, and are NOT shared with iOS

**READ** — what exists:

```
android/app/src/main/res/mipmap-{hdpi,mdpi,xhdpi,xxhdpi,xxxhdpi}/  ic_launcher.png · ic_launcher_foreground.png · ic_launcher_round.png
android/app/src/main/res/mipmap-anydpi-v26/                        (adaptive-icon XML)
android/app/src/main/res/drawable/                                 ic_launcher_background.xml · splash.png
android/app/src/main/res/drawable-{port,land}-{m,h,xh,xxh,xxx}dpi/ (11 density folders, all scaffold)
```

**READ — the hashes prove they are not shared:**

```
android  mipmap-xxxhdpi/ic_launcher.png   md5 9e029293ab1ae8e3a6a7b7d0b7177e46
android  drawable/splash.png              md5 acc976d4a36479233371a53021525c0c
ios      AppIcon-512@2x.png               md5 57b71d880d8607257e3bd69828705a74
```

✅ **Different bytes. There is no shared asset pipeline** — `capacitor.config.ts` has no icon or splash
generation, and no `@capacitor/assets` dependency exists.

**READ** — `docs/android-audit-report.md` already recorded it:

> 🔴 **ANDROID DOES NOT SHARE THE iOS ICON. It has its own, and its own is the default.** ⚠️ **The white
> ground is a coincidence, not the same decision** … ⚠️ **The splash is stock too, and unrelated to the
> `#0F172A` iOS launch screen.**

## G2. What bringing them in line would need — and the mistake not to repeat

**Stated as requirements only.**

- **Five `mipmap-*` densities** for `ic_launcher` and `ic_launcher_round`, **plus the adaptive pair**
  (`ic_launcher_foreground` + `ic_launcher_background`) that `mipmap-anydpi-v26` references. ⚠️ Android
  masks the adaptive foreground to a system shape, so **anything near the edge is cropped** — a
  constraint iOS does not have.
- 🔴 **A dedicated MONOCHROME notification icon** (`ic_stat_*`), which is a **different asset from the
  launcher icon** — silhouette, transparent ground. **This is the D2 gap, and it cannot be solved by
  copying the launcher icon.**
- **A splash** consistent with the iOS `#0F172A` launch screen across 11 density/orientation folders,
  or a colour-plus-logo approach.

⚠️ **THE MISTAKE NOT TO REPEAT, RECORDED SO IT IS NOT: the iOS icon shipped with a measured 2.50:1
contrast concern on a white ground** (`docs/android-audit-report.md:474`). ✅ **Android's stock icon
having a white ground is a coincidence, so the Android set is a free choice — and the notification
silhouette is contrast-free by construction, which makes it the one place the iOS problem cannot
recur.**

---

# PART H — THE PICTURE

## H1. Prioritised

| # | Capability | The gap | What an operator notices | Kind |
|---|---|---|---|---|
| **1** | **Push tap** | `onOpenOrder` never passed at any of three call sites | Taps the alert, app opens on whatever screen it was on. **BOTH platforms** | **Code** |
| **2** | **BLE printing** | Location requested to print; merge unproven since 27 July | *"Allow HatchGrab to access this device's location?"* on a printer; refusal is silent | **Code** (one flag) + **verification** |
| **3** | **Notification channel** | None created; no default declared | Alerts land in an unnamed system channel whose importance the operator can mute by accident | **Code** or **config** |
| **4** | **Push icon** | No `default_notification_icon`; no `ic_stat_*` asset | A white blob in the status bar | **Asset** + **config** |
| **5** | **Deep links** | No `VIEW`/`BROWSABLE` filter, no `autoVerify` | hatchgrab.com links always open the browser | **Config** |
| **6** | **Icon and splash** | Capacitor stock, not shared with iOS | Default robot icon at every launch | **Asset** |
| **7** | **WhatsApp section** | Hidden by a platform-blind predicate reasoned about for iOS only | A live control is unreachable in the Android app | **Decision** |
| **8** | **`allowBackup="true"`** | Salted PIN hash and the offline outbox eligible for cloud backup | Nothing visible | **Decision** |
| **9** | **AppLockGate wording** | Still *"Face / Touch ID"* | The lock screen names biometrics Android does not have | **Code** (copy) |
| **10** | **Keep-awake through service** | Never run; OEM killers unrepresented | Screen sleeps mid-service on a Samsung. **BOTH platforms untested** | **Verification** |

## H2. 🔴 What would BREAK versus what merely differs

**WOULD BREAK — an operator tries it and it does not work:**

- 🔴 **Tapping a push notification** (D3). **Both platforms.**
- 🔴 **Printing, if the location prompt is refused** (C1) — and refusal is a reasonable reaction to
  being asked for location by a printer.
- 🔴 **Any hatchgrab.com link opening the app** (E5). Nothing routes it.

**MERELY DIFFERS — works, but not as intended:**

- ⚠️ The push icon and channel (D2, D4) — **notifications arrive**; they look wrong and are mis-filed.
- ⚠️ The status-bar mechanism (E6) — **documented, deliberate, renders correctly** per §36.
- ⚠️ Icon and splash (G) — cosmetic, and the most visible thing on this list.

**UNKNOWN, AND EQUALLY UNKNOWN ON iOS — not an Android gap:**

- Keep-awake through a service · outbox drain on reconnect · session survival across force-quit · the
  full order-flow click-through. **§36 lists all four as never run on ANY device.**

✅ **AND ONE ROW WHERE ANDROID IS AHEAD: push registration.** Android has a token; iOS, per §36's
live-verified status, **has never obtained one**.

## H3

No implementation is proposed and no order is recommended.

---

# PART I — INTEGRITY

## I1. Byte scan — every file opened

**28 files, byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F,
0x7F). Never grep.**

```
  reference-manual.md                           1572328 bytes offending=0 CR=0
  android-audit-report.md                         44660 bytes offending=0 CR=0
  android-back-handler-report.md                  28265 bytes offending=0 CR=0
  AndroidManifest.xml                              1537 bytes offending=0 CR=0
  capacitor.settings.gradle                        1572 bytes offending=0 CR=0
  capacitor.build.gradle                            881 bytes offending=0 CR=0
  variables.gradle                                  498 bytes offending=0 CR=0
  capacitor.config.ts                              6599 bytes offending=0 CR=0
  appLock.ts                                       5195 bytes offending=0 CR=0
  push.ts                                          6829 bytes offending=0 CR=0
  keepAwake.ts                                    14513 bytes offending=0 CR=0
  network.ts                                       1031 bytes offending=0 CR=0
  reachability.ts                                  4537 bytes offending=0 CR=0
  session.ts                                       2891 bytes offending=0 CR=0
  device.ts                                        4548 bytes offending=0 CR=0
  statusBar.ts                                     4825 bytes offending=0 CR=0
  backHandler.ts                                   6560 bytes offending=0 CR=0
  bleTransport.ts                                 20815 bytes offending=0 CR=0
  transport.ts                                     8865 bytes offending=0 CR=0
  commerce-policy.ts                               3519 bytes offending=0 CR=0
  OperatorDeviceConfig.tsx                        18781 bytes offending=0 CR=0
  AppLockGate.tsx                                  5745 bytes offending=0 CR=0
  manage/[token]/page.tsx                        782627 bytes offending=0 CR=0
  dashboard/[token]/kds/page.tsx                 106038 bytes offending=0 CR=0
  app/app/page.tsx                                 4145 bytes offending=0 CR=0
  api/orders/submit/route.ts                      83547 bytes offending=0 CR=0
  fcm.ts                                          15636 bytes offending=0 CR=0
  apns.ts                                          3854 bytes offending=0 CR=0
TOTAL OFFENDING ACROSS 28 FILES: 0
```

✅ **Zero offending bytes, zero CR.** ⚠️ **All 28 were opened READ-ONLY.** Plugin sources under
`node_modules/` were also read and are excluded from this list as third-party, unmodifiable input.

## I2. Byte scan of this report

Separate pass, run after writing: **46,484 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR.

## I3. 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 50 | 0 | 50 |
| U+1F534 LARGE RED CIRCLE | 46 | 0 | 46 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 0 | 0 |
| U+26A0 WARNING SIGN | 39 | 39 | **0** |

**Every warning sign is paired; ZERO are bare.** **Sum of per-base paired = the total U+FE0F count** - no orphan, no double-count.

## I4. `git status` — proof nothing changed

```
M app/api/orders/submit/route.ts
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OperatorDeviceConfig.tsx
 M docs/device-naming-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/EventCancelModal.tsx
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/android-parity-report.md
?? docs/event-cancel-holds-report.md
?? docs/event-cancel-refunds-report.md
?? docs/fcm-sender-report.md
?? docs/overlay-audit-report.md
?? docs/overlay-fixes-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/fcm.ts
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

✅ **No file was created, modified or deleted by this task except this report**, which is a new
untracked path. ⚠️ **`git diff --stat` is unchanged from the end of the previous task** — the nine
modified files and every other untracked path are prior turns' work, and **not one of them was touched
by this audit.**
