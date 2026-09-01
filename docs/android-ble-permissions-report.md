# BLE permission flags — stopping Play from declaring Location

**Build only.** Nothing was committed or pushed, nothing was deployed, `bundleRelease` was not run.
`versionCode` (1) and `applicationId` (`com.hatchgrab.app`) are unchanged — verified in the built
APK. `lib/printing/bleTransport.ts` and every runtime option are untouched. `node_modules` is
untouched. `ios/` is untouched (0 changed files). The web bundle is untouched.

**Exactly one file was changed by this task: `android/app/src/main/AndroidManifest.xml`.**
Confirmed by `find … -newermt` over `android/`, `lib/`, `app/` and `capacitor.config.ts`, excluding
build output. (`android/app/build.gradle` and `capacitor.config.ts` show as modified in `git status`
— both from **earlier** workstreams in this session, not this one. So does the FCM
notification-icon `meta-data` block visible in this file's diff against HEAD.)

## Prompt integrity — one flag, and it is not a contradiction

No span arrived garbled and no instruction contradicted another. **But the premise was incomplete
in one way that matters, and I extended the instruction by one line rather than deliver something
that could not work.**

🔴 **The plugin declares `ACCESS_COARSE_LOCATION` as well as `ACCESS_FINE_LOCATION`, and the
instruction named only FINE.** Play's data-safety Location bucket covers coarse location too, so
removing FINE alone would have left the Location declaration exactly where it is and achieved
nothing — the stated goal of the workstream. **I removed both.** If you want COARSE left in place,
it is a one-line revert of `android/app/src/main/AndroidManifest.xml` and no other change.

## Which of the three I did — plainly

| | |
|---|---|
| **Parse** | ✅ **Yes.** Both freshly generated merged manifests were parsed with `xml.etree.ElementTree` — element-level, not grep — to enumerate `uses-permission` nodes and their attributes. |
| **Typecheck** | ❌ **No**, and nothing here would benefit: no TypeScript was changed. |
| **Execution** | ✅ **Yes, twice.** `./gradlew :app:processDebugManifest` ran the real manifest merge, then `./gradlew assembleDebug` built the APK, then `aapt2 dump permissions` read the permissions **out of the built binary**. |

⚠️ **A correction, recorded because it changes nothing but was wrong when first printed.** My first
assertion pass was grep-based and reported three FAILs. It was wrong: the greps matched
`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` and `tools:` **inside the new XML comments I had
just added to the merged output**, and the `neverForLocation` check failed only because the
`<uses-permission>` element spans several lines. Re-run with an XML parser, all seven assertions
pass. The grep results are withdrawn; the parsed results in §8 are the evidence.

---

# PHASE 1 — READ AND REPORT

## 1. `android/app/src/main/AndroidManifest.xml` before the change

Every `uses-permission` and every `uses-feature`, complete:

```xml
    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
```

**That is the entire list. One permission, no `uses-feature`, and no `tools:` attribute anywhere in
the file.** The rest of the file is `<application>` — the launcher activity, two Firebase
`meta-data` entries (default notification channel, notification icon) and a `FileProvider`.

## 2. What `@capacitor-community/bluetooth-le` ships

Version **8.3.0**. `node_modules/@capacitor-community/bluetooth-le/android/src/main/AndroidManifest.xml`,
read from the plugin's **source** manifest, quoted complete:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
  xmlns:tools="http://schemas.android.com/tools">
  <!-- Bluetooth -->
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission
    android:name="android.permission.BLUETOOTH"
    android:maxSdkVersion="30" />
  <uses-permission
    android:name="android.permission.BLUETOOTH_ADMIN"
    android:maxSdkVersion="30" />
  <uses-permission
    android:name="android.permission.BLUETOOTH_SCAN"
    tools:targetApi="s" />
  <uses-permission
    android:name="android.permission.BLUETOOTH_CONNECT"
    tools:targetApi="s" />

  <uses-feature
    android:name="android.hardware.bluetooth_le"
    android:required="false" />
</manifest>
```

| Permission | Flags on it |
|---|---|
| `ACCESS_COARSE_LOCATION` | 🔴 **none — unconditional, no `maxSdkVersion`** |
| `ACCESS_FINE_LOCATION` | 🔴 **none — unconditional, no `maxSdkVersion`** |
| `BLUETOOTH` | `android:maxSdkVersion="30"` |
| `BLUETOOTH_ADMIN` | `android:maxSdkVersion="30"` |
| `BLUETOOTH_SCAN` | `tools:targetApi="s"` — 🔴 **no `usesPermissionFlags`** |
| `BLUETOOTH_CONNECT` | `tools:targetApi="s"` |
| *(feature)* `android.hardware.bluetooth_le` | `android:required="false"` |

**Confirming the report's premise, and correcting it in one place:** `BLUETOOTH_SCAN` carries
`tools:targetApi="s"` and nothing else, there is no `usesPermissionFlags="neverForLocation"`
anywhere in the plugin — **and the unconditional location permission is a pair, not one.**

⚠️ Five `AndroidManifest.xml` files exist under that package; four are under
`.../android/build/intermediates/` and are **build output**. Only
`.../android/src/main/AndroidManifest.xml` was read.

## 3. The tools namespace, before the change

**Not declared.** The opening tag was, verbatim:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
```

Only `xmlns:android`. Adding `xmlns:tools` was therefore required before either override could be
written.

## 4. minSdkVersion and targetSdkVersion

**minSdk 24, targetSdk 36** (compileSdk 36).

Set in `android/variables.gradle:1-4`:

```gradle
ext {
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
```

Referenced in `android/app/build.gradle:28-33`:

```gradle
    defaultConfig {
        applicationId "com.hatchgrab.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
```

Both confirmed in the built APK by `aapt2 dump badging`: `minSdkVersion:'24'`,
`targetSdkVersion:'36'`.

⚠️ **targetSdk 36 is why this matters at all.** `usesPermissionFlags="neverForLocation"` requires
API 31+; at targetSdk 36 the platform honours the assertion, and Play reads it.

## 5. Every other plugin that contributes a permission

Established by reading **each plugin's own `src/main/AndroidManifest.xml`**, enumerated from
`android/capacitor.settings.gradle` (the generated list of what is actually in the build). **No
`build/` output was read.** Ten Gradle projects are included:

| Plugin | Permissions it contributes |
|---|---|
| `@capacitor/android` (capacitor-android) | **none** — empty `<manifest>` |
| `@aparajita/capacitor-biometric-auth` | **none** — declares an `<activity>` only |
| **`@capacitor-community/bluetooth-le`** | **the six in §2** + the `bluetooth_le` feature |
| `@capacitor-community/keep-awake` | **none** — empty `<manifest>` |
| `@capacitor/app` | **none** — empty `<manifest>` |
| **`@capacitor/local-notifications`** | `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `POST_NOTIFICATIONS` (+3 `<receiver>`s) |
| **`@capacitor/network`** | `ACCESS_NETWORK_STATE` |
| `@capacitor/preferences` | **none** — empty `<manifest>` |
| `@capacitor/push-notifications` | **none** — declares a `<service>` only |
| `@capacitor/status-bar` | **none** — empty `<manifest>` |

**Only three Capacitor plugins contribute permissions, and only one contributes a location
permission.**

⚠️ **AAR dependencies also contribute, and are not Capacitor plugins**, so they cannot be found this
way. The merge (§8) reveals them: `USE_BIOMETRIC` and `USE_FINGERPRINT` (androidx.biometric),
`com.google.android.c2dm.permission.RECEIVE` (firebase-messaging), and the AGP-generated
`com.hatchgrab.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. **None of them is a location
permission** — which is why the merged result in §8 contains none at all once the plugin's two are
removed.

## 6. What BLE is actually for — and the location gate

### What it is for

`lib/printing/bleTransport.ts:2-5`:

```ts
// ── BLUETOOTH LE TRANSPORT — the real backend behind PrinterTransport ────────────────────────────
// Implements the seam in ./transport.ts against @capacitor-community/bluetooth-le (pinned 8.3.0).
// Everything above the seam is unchanged: renderTicket still emits the ESC/POS Uint8Array, usePrinting
// still hands it to sendBytes, and the watcher still decides WHEN. This file only moves bytes.
```

**One ESC/POS thermal receipt printer.** Its scan callback, `:179-189`, reads exactly what it needs:

```ts
      await BleClient.requestLEScan({ allowDuplicates: false }, result => {
        const id = result?.device?.deviceId
        if (!id) return
        // NAMELESS PERIPHERALS ARE DROPPED. A receipt printer advertises a name; a nameless row is an
        // unidentifiable MAC address an operator cannot choose between, and the list would fill with
        // every phone and earbud in the venue.
        const name = result?.device?.name || result?.localName
        if (!name) return
        // 🔴 EVERY NAMED DEVICE IS STILL LISTED. `likely` only decides WHICH SECTION it lands in.
        found.set(id, { id, name, class: 'ble', likely: looksLikePrinter(name, result?.uuids) })
      })
```

**Three fields: `deviceId`, `name`/`localName`, and `uuids` — and `uuids` only ranks the list
(`looksLikePrinter`, `:67-72`). No `rssi`, no `txPower`, no position.**

And the runtime option, `:106-124`, which the file itself already distinguishes from the manifest:

```ts
  // ── 🔴 androidNeverForLocation: true — WHY AN OPTION APPEARS ON A CALL THAT HAD NONE ───────────────
  // ANDROID ONLY; iOS ignores it entirely. Without it the flag defaults FALSE, and the plugin's own
  // initialize() (BluetoothLe.kt, the SDK_INT >= S branch) then requests ACCESS_FINE_LOCATION ALONGSIDE
  // BLUETOOTH_SCAN and BLUETOOTH_CONNECT.
  // 🔴 THE ASSERTION IS TRUE OF THIS APP, WHICH IS THE ONLY GROUND FOR MAKING IT. It declares that BLE
  // scan results are never used to derive physical location. lib/printing reads exactly two fields off a
  // scan result — deviceId and name (see scan() below) — and nothing anywhere derives position from RSSI,
  // beacons or anything else. If that ever stops being true this flag must come off in the same change.
  const ensureInit = async (): Promise<void> => {
    if (initialised) return
    const BleClient = await ble()
    await BleClient.initialize({ androidNeverForLocation: true })
    initialised = true
  }
```

**Untouched by this task, as instructed.** It is a runtime argument to the plugin; Play never sees
it. The two mechanisms are independent and both are needed.

### 🔴 THE GATE: does anything in this codebase use device location?

**No. Nothing does. The gate passes and `neverForLocation` is a true declaration.**

| Search | Paths | Result |
|---|---|---|
| `navigator.geolocation`, `getCurrentPosition`, `watchPosition`, `Geolocation`, `@capacitor/geolocation` | `app/`, `components/`, `lib/`, `hooks/`, `public/` (`*.ts`,`*.tsx`,`*.js`) | **ZERO HITS** |
| `@capacitor/geolocation` installed? | `node_modules/@capacitor/` | **NOT PRESENT** — the ten installed packages are `android, app, cli, core, ios, local-notifications, network, preferences, push-notifications, status-bar` |
| `rssi`, `txPower`, `ibeacon`, `eddystone`, `beacon` | same paths | only `navigator.sendBeacon` (an analytics flush, `lib/useReadyEmailUndo.ts:52`) and the two bleTransport **comments** quoted above. **No RSSI read anywhere.** |
| `geolocation`, `ACCESS_*_LOCATION`, `LocationManager` | `android/` `*.java`,`*.kt`,`*.xml`,`*.gradle`, excluding `build/` | **ZERO HITS** |
| `permissions` in the PWA manifest | `public/manifest.json` | none — name, icons, theme only |

**The one thing that looks like location, and is not.** `app/page.tsx:39` holds a
`userLocation` state that feeds a distance filter and a map marker. Its only writer is
`app/page.tsx:141-151`:

```ts
    if (!code) return;
    setIsPostcodeLoading(true);
    const coords = await getCoordsFromPostcode(code);
    setIsPostcodeLoading(false);
    
    if (coords) {
      setUserLocation(coords);
```

and `lib/utils.ts:24-36`:

```ts
export async function getCoordsFromPostcode(postcode: string): Promise<{lat: number, long: number} | null> {
  try {
    const cleanPostcode = postcode.toUpperCase().replace(/\s/g, '');
    const res = await fetch(`https://api.postcodes.io/postcodes/${cleanPostcode}`);
    const data = await res.json();
    if (data.status === 200) {
      return { lat: data.result.latitude, long: data.result.longitude };
    }
```

🔴 **A postcode the visitor types into a text box, geocoded over HTTP by a third-party API. Not a
device sensor, not a permission, and not on the operator app's routes** — `app/page.tsx` is the
Village Foodie consumer map, which `proxy.ts` rewrites to `/landing` on hatchgrab hosts. **No
Android location permission is involved in it in any way.**

---

# PHASE 2 — THE FIX

## 7. The change, and which mechanism was used for each

```diff
 <?xml version="1.0" encoding="utf-8"?>
-<manifest xmlns:android="http://schemas.android.com/apk/res/android">
+<!-- `tools:` is REQUIRED by the permission block at the bottom of this file: tools:node="remove"
+     and usesPermissionFlags both need it. It is a build-time namespace only — the merger strips
+     every tools: attribute out of the merged result, so nothing here ships in the APK. -->
+<manifest xmlns:android="http://schemas.android.com/apk/res/android"
+    xmlns:tools="http://schemas.android.com/tools">
```

```diff
     <uses-permission android:name="android.permission.INTERNET" />
+
+    <!-- ══ BLUETOOTH: A RECEIPT PRINTER, AND NOTHING ELSE ═══════════════════════════════════════════
+         WHAT BLE IS FOR HERE. lib/printing/bleTransport.ts connects to one ESC/POS thermal printer at
+         the hatch and streams a receipt to it. That is the entire use. Its scan callback reads exactly
+         three fields off a result — deviceId, name/localName, and the advertised service uuids, which
+         only ORDER the list — and nothing in this codebase derives a position from RSSI, from a beacon,
+         or from anything else.
+
+         🔴 NOTHING IN THIS APP USES DEVICE LOCATION AT ALL. There is no navigator.geolocation call, no
+         getCurrentPosition, no watchPosition, and @capacitor/geolocation is not a dependency. The only
+         latitude/longitude anywhere comes from a POSTCODE THE VISITOR TYPES, geocoded over the network
+         by lib/utils.ts getCoordsFromPostcode() against api.postcodes.io — a text field, not a sensor.
+
+         WHY THESE TWO LINES EXIST. @capacitor-community/bluetooth-le 8.3.0 ships a manifest declaring
+         BLUETOOTH_SCAN with no usesPermissionFlags, plus an UNCONDITIONAL ACCESS_FINE_LOCATION and
+         ACCESS_COARSE_LOCATION. Manifest merge pulls all three into this app. Play reads the MERGED
+         manifest, so without the overrides below the data-safety section declares Location collection
+         that does not happen — for a printer connection.
+
+         ⚠️ THE RUNTIME OPTION IS NOT THIS. bleTransport.ts passes `androidNeverForLocation: true` to
+         BleClient.initialize(), which governs what the PLUGIN requests at runtime. It is not the
+         manifest attribute and Play never sees it. The two are separate mechanisms and both are needed.
+         If BLE scan results are ever used to infer position, BOTH must come off in the same change. -->
+
+    <!-- neverForLocation is the app's assertion that scan results are never used to derive location.
+         NO tools:replace / tools:node IS NEEDED: the library declares BLUETOOTH_SCAN WITHOUT
+         usesPermissionFlags, so there is no attribute conflict to resolve — the merger simply takes the
+         attribute from the side that has it. tools:targetApi="s" mirrors the library's own declaration
+         (the permission is Android 12+). Verified against the freshly generated merged manifest. -->
+    <uses-permission
+        android:name="android.permission.BLUETOOTH_SCAN"
+        android:usesPermissionFlags="neverForLocation"
+        tools:targetApi="s" />
+
+    <!-- tools:node="remove" — the ONLY mechanism that deletes a node contributed by a library. There is
+         nothing to override here: this app never declares these, so tools:replace has no attribute to
+         act on and simply omitting them leaves the library's copies in the merged result untouched.
+         ⚠️ BOTH, not just FINE. Play's Location bucket covers coarse as well, so removing FINE alone
+         would leave the data-safety declaration exactly as it is and achieve nothing. -->
+    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" tools:node="remove" />
+    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" tools:node="remove" />
 </manifest>
```

### Which mechanism, and why — answered from the merge, not from expectation

**`BLUETOOTH_SCAN` → NO `tools:replace`, NO `tools:node`. Plain declaration.**
The manifest merger keys `uses-permission` nodes on `android:name` and unions their attributes. The
library declares `BLUETOOTH_SCAN` **without** `usesPermissionFlags` (§2), so there is **no attribute
conflict to resolve** — the merger simply takes `usesPermissionFlags` from the only side that has
it. `tools:replace` exists to arbitrate a conflict; there is none. **This was settled by running the
merge and reading the output (§8), not assumed.** `tools:targetApi="s"` mirrors the library's own
declaration; the merger strips every `tools:` attribute from the output, and it does (§8).

**`ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` → `tools:node="remove"`.**
`tools:replace` is not an option here: it overrides an *attribute* on a node this manifest also
declares, and there is no attribute to override — the requirement is to delete a node contributed by
a library. `tools:node="remove"` is the only merger directive that does that. Omitting the
permissions entirely does nothing: merge is a union, so the library's copies would simply arrive.

## 8. 🔴 PROOF BY EXECUTION — the freshly generated merged manifest

**Every previously built merged manifest under `android/app/build/intermediates/merged_manifest*`
was DELETED before the run**, so nothing cached could be mistaken for evidence.

```
$ ./gradlew :app:processDebugManifest --console=plain
> Task :app:processDebugMainManifest
> Task :app:processDebugManifest
BUILD SUCCESSFUL in 7s
39 actionable tasks: 2 executed, 37 up-to-date
```

Both app manifest tasks **executed** (not up-to-date). Two merged manifests were written:

| Path | Modified | Size |
|---|---|---|
| `android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml` | **2026-08-26 09:54:55** | 14,469 bytes |
| `android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml` | **2026-08-26 09:54:55** | 14,469 bytes |

Wall-clock at the time of inspection: **2026-08-26 09:55:14** — nineteen seconds old.

### The merged permission block, verbatim from the fresh file

`merged_manifests/debug/processDebugManifest/AndroidManifest.xml`, lines 18 and 53–66:

```xml
    <uses-permission android:name="android.permission.INTERNET" />
    …
    <uses-permission
        android:name="android.permission.BLUETOOTH_SCAN"
        android:usesPermissionFlags="neverForLocation" />
    <uses-permission
        android:name="android.permission.BLUETOOTH"
        android:maxSdkVersion="30" />
    <uses-permission
        android:name="android.permission.BLUETOOTH_ADMIN"
        android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

    <uses-feature
        android:name="android.hardware.bluetooth_le"
        android:required="false" />

    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.USE_BIOMETRIC" />
    <uses-permission android:name="android.permission.USE_FINGERPRINT" />
    <uses-permission android:name="com.google.android.c2dm.permission.RECEIVE" />
    <uses-permission android:name="com.hatchgrab.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION" />
```

**Thirteen permissions. Not one is a location permission.**

### Assertions, by XML parse (element-level, not grep)

Identical results on **both** freshly generated files:

```
    BLUETOOTH_SCAN present.......................... PASS
    BLUETOOTH_SCAN usesPermissionFlags=neverForLocation PASS  got='neverForLocation'
    ACCESS_FINE_LOCATION ABSENT..................... PASS
    ACCESS_COARSE_LOCATION ABSENT................... PASS
    no tools: attribute survived on any uses-permission PASS
    BLUETOOTH_CONNECT still present................. PASS
    INTERNET still present.......................... PASS
```

## 9. 🔴 PROOF BY EXECUTION — the build

```
$ ./gradlew assembleDebug --console=plain
> Task :app:processDebugResources
> Task :app:packageDebug
> Task :app:assembleDebug
BUILD SUCCESSFUL in 3s
367 actionable tasks: 3 executed, 364 up-to-date
```

**BUILD SUCCESSFUL.** A manifest-merge failure is a build failure, so this also confirms neither
`tools:node="remove"` produced a merge error. Toolchain: OpenJDK 21.0.10, Gradle 8.14.3, AGP
build-tools 36.0.0, SDK at `/Users/dominicbonini/Library/Android/sdk`.

### And the permissions as they exist in the built binary

`aapt2 dump permissions app/build/outputs/apk/debug/app-debug.apk` — APK written
**2026-08-26 09:55:59**, 8,738,973 bytes:

```
package: com.hatchgrab.app
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.BLUETOOTH_SCAN' usesPermissionFlags='neverForLocation'
uses-permission: name='android.permission.BLUETOOTH' maxSdkVersion='30'
uses-permission: name='android.permission.BLUETOOTH_ADMIN' maxSdkVersion='30'
uses-permission: name='android.permission.BLUETOOTH_CONNECT'
uses-permission: name='android.permission.RECEIVE_BOOT_COMPLETED'
uses-permission: name='android.permission.WAKE_LOCK'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.ACCESS_NETWORK_STATE'
uses-permission: name='android.permission.USE_BIOMETRIC'
uses-permission: name='android.permission.USE_FINGERPRINT'
uses-permission: name='com.google.android.c2dm.permission.RECEIVE'
permission: com.hatchgrab.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
uses-permission: name='com.hatchgrab.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
```

And in the APK's **binary** manifest, the flag survives compilation as a real resource value:

```
A: …:name(0x01010003)="android.permission.BLUETOOTH_SCAN" (Raw: "android.permission.BLUETOOTH_SCAN")
A: …:usesPermissionFlags(0x01010644)=0x00010000
```

`0x00010000` is `PERMISSION_FLAG_NEVER_FOR_LOCATION`.

Identity unchanged, from `aapt2 dump badging`:

```
package: name='com.hatchgrab.app' versionCode='1' versionName='1.0' …
minSdkVersion:'24'
targetSdkVersion:'36'
```

---

## What remains unobserved

1. **No device or emulator was run.** The APK was built and inspected; it was not installed, and BLE
   printing was not exercised. **Whether Android's `neverForLocation` filtering changes what
   `requestLEScan` returns for a given printer is unverified here** — the trade is recorded in
   `bleTransport.ts:116-118` and remains a device question.
2. **Debug variant only.** `processDebugManifest` and `assembleDebug` ran; `bundleRelease` was not
   run, as instructed. The release manifest merge uses the same source manifests and the same
   directives, but **it was not executed**, so it is unproven.
3. **Play's data-safety form is a human declaration, not a build output.** Removing the permissions
   removes the *basis* on which Location would have to be declared; **nobody has re-submitted or
   re-checked the console form**, and this change does nothing to it by itself.
4. **Nothing was deployed, committed or pushed.** Deploys remain frozen.
5. **One pre-existing inaccuracy noticed and deliberately left alone**, since it is outside this
   task: the `meta-data` comment at `AndroidManifest.xml:49-51` still says `capacitor.config.ts`
   sets `LocalNotifications.smallIcon: 'ic_stat_icon_config_sample'`. That was changed to
   `'ic_stat_hatchgrab'` in an earlier workstream, so **the comment is now stale**. Not corrected
   here — it is not this task's scope.
