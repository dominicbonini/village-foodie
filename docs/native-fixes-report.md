# Three native fixes — the tap handler, the location prompt, and the notification channel

Scope honoured: **seven files edited**, plus `npx cap sync` in Part D only. No `next dev`, no
`next build`, no deploy, **no build, no archive**, no commit, no package installed, no migration, no
payment path, no gate, no capacity change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

iOS and Android are reported **separately**. Every claim is marked **READ**, **INFERRED** or
**MEASURED** (run and its output pasted).

> ✅ `npx tsc --noEmit` exits 0.
> ✅ **`cap sync` changed NOTHING it was not supposed to** — `project.pbxproj` is byte-identical by
> sha256, all seven `Assets.xcassets` files are sha-identical, Resources still 7, the privacy manifest
> still lints with both entries. Part D.
> 🔴 **The after-census caught glyph classes in THREE files and they were removed before this report
> was written.** F2.

---

# PART A — 🔴 THE TAP HANDLER

## A1. `registerForPush`, its signature and the dead branch — READ, before

**READ** — `lib/native/push.ts:27`:

```ts
export async function registerForPush(token: string, onOpenOrder?: (orderKey: string) => void): Promise<void> {
```

**READ** — `:80-84`, the listener and the branch that never fired:

```ts
        // Tapped a notification (app was background/closed) → deep-link into the pending order. Attached
        // here too: a tap that LAUNCHES the app can fire this before any later attach point is reached.
        PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, unknown> } }) => {
          const data = action?.notification?.data
          const orderKey = data && typeof data.orderKey === 'string' ? data.orderKey : null
          if (orderKey && onOpenOrder) onOpenOrder(orderKey)
        }),
```

🔴 **Every layer was correct except the last one. The listener was attached, attached EARLY and
AWAITED, and it parsed the right key — and `onOpenOrder` was `undefined`, so the second operand of
`&&` was always falsy.**

## A2. All three call sites — READ, before, none passing a handler

```
components/native/OperatorDeviceConfig.tsx:43    if (device && device.van_id) { void registerForPush(token); setLoading(false); return }
components/native/OperatorDeviceConfig.tsx:49      if (saved) void registerForPush(token)
components/native/OperatorDeviceConfig.tsx:69    if (saved) { void registerForPush(token); setNeedsSetup(false) }
```

✅ **CONFIRMED: one argument each. There is no fourth site** — `grep -rn "registerForPush"` over
`app/`, `components/` and `lib/` returns exactly these three plus the declaration.

## A3. Wired — what was passed at each site, and how it navigates

**All three sites are in ONE component, `DeviceSetupGate`, so they take the handler by the same
route: a new optional prop.** **READ, after:**

```tsx
export function DeviceSetupGate({ token, onOpenOrder }: { token: string; onOpenOrder?: (orderKey: string) => void }) {
```

```tsx
:49   if (device && device.van_id) { void registerForPush(token, onOpenOrder); setLoading(false); return }
:56     if (saved) void registerForPush(token, onOpenOrder)
:80   if (saved) { void registerForPush(token, onOpenOrder); setNeedsSetup(false) }
```

⚠️ **`runSetup`'s dependency array gained `onOpenOrder`, and that is load-bearing rather than lint
appeasement. READ:**

```tsx
    // NOTE: onOpenOrder IS IN THE DEPS DELIBERATELY. runSetup closes over it, and registerForPush attaches the
    // listener ONCE per JS context (its `listenersAttached` latch), so a stale closure here would attach a
    // handler that navigates using yesterday's state and could never be replaced.
  }, [token, onOpenOrder])
```

**READ** — the handler itself, on the dashboard:

```tsx
  const openOrderFromPush=useCallback((orderKey:string)=>{
    setActiveTab('orders')
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const el=document.getElementById(`order-${orderKey}`)
      if(el){el.scrollIntoView({behavior:'smooth',block:'center'});return}
      showToast('That order is not on this board - check the event','error')
    }))
  },[showToast])
```

**READ** — passed at the one mount point, `app/dashboard/[token]/page.tsx`:

```tsx
      <DeviceSetupGate token={token} onOpenOrder={openOrderFromPush} />
```

**READ** — and the card gained a stable id. **The demo id is preserved character-for-character**, so
`DemoLoopComplete.tsx:142`'s `getElementById('demo-order-…')` is untouched:

```diff
-anchorId={isDemo?`demo-order-${o.order_key}`:undefined}
+anchorId={isDemo?`demo-order-${o.order_key}`:`order-${o.order_key}`}
```

⚠️ **`anchorId` was already a prop on `OrderCard` rendering `<div id={anchorId}>` (`OrderCard.tsx:965`)
— nothing was added to that component.** The change is that non-demo cards now get an id instead of
`undefined`. **Two occurrences, the pending and confirmed grids, replaced together.**

## A4. What "open the order" means per site

🔴 **ALL THREE SITES ARE THE SAME SURFACE, AND THAT IS THE ANSWER.** **READ** — `DeviceSetupGate` has
exactly one mount in the whole tree:

```
app/dashboard/[token]/page.tsx:47    import { DeviceSetupGate } from '@/components/native/OperatorDeviceConfig'
app/dashboard/[token]/page.tsx:2816  <DeviceSetupGate token={token} onOpenOrder={openOrderFromPush} />
```

| Site | Context | "Open the order" means |
|---|---|---|
| `:49` device already configured | dashboard, steady state | switch to the orders tab, scroll the card into view |
| `:56` single-van auto-bind | dashboard, first launch | identical — same component, same handler |
| `:80` setup card saved | dashboard, after the setup modal | identical |

✅ **So no site needed a different handler and none got a no-op.** ⚠️ **The KDS mounts
`ThisDeviceSettings`, NOT `DeviceSetupGate`** (`kds/page.tsx:44`), so it never called
`registerForPush` and is unaffected by this change.

🔴 **THE HANDLER NAVIGATES AND DOES NOTHING ELSE — no modal opens, no action fires.** A notification
tap is a request to look at something, never a decision, and this is a screen where the buttons
confirm orders and move money.

## A5. Order missing, on another event, or inaccessible

**READ — the miss path is the `if(el)` else-branch, and it is deliberate:**

```tsx
      const el=document.getElementById(`order-${orderKey}`)
      if(el){el.scrollIntoView({behavior:'smooth',block:'center'});return}
      showToast('That order is not on this board - check the event','error')
```

**What happens in each case:**

| Case | Result |
|---|---|
| Order on the active event | ✅ tab switches, card scrolls to centre |
| Order on a **different event** | ⚠️ tab switches, **no element**, toast names the problem and points at the event |
| Order **already confirmed** and cleared by another device | ⚠️ same — the board is correct, the toast explains |
| Board **not yet polled** | ⚠️ same — the toast is momentary and the operator is on the right tab |
| **Access lost** (token/PIN) | **INFERRED** — the dashboard's own auth gate renders its access-denied state (`page.tsx:2606`); this handler never runs because the page never mounts `DeviceSetupGate` |

✅ **In no case is there a blank screen or an error page.** The tab switch is unconditional and
stands on its own; the scroll is the enhancement. ⚠️ **The handler deliberately does NOT switch the
selected event** — that would re-scope the whole board, and re-scoping an operator's live board from a
notification tap is a bigger action than the tap asked for.

## A6. The payload carries `orderKey` on both platforms — side by side

**iOS — READ, `lib/apns.ts:51-54`:**

```ts
  const body = JSON.stringify({
    aps: { alert: { title: 'New order to confirm', body: `Order ${payload.orderNumber} — ${payload.truckName}` }, sound: 'default', 'content-available': 1 },
    type: 'order_pending', orderKey: payload.orderKey,   // custom keys → tap deep-link
  })
```

**Android — READ, `lib/fcm.ts`:**

```ts
          message: {
            token,
            notification,
            android: { priority: 'high', notification: { sound: 'default', channel_id: 'hg_orders' } },
            data: { type: 'order_pending', orderKey: payload.orderKey },
          },
```

| | iOS | Android |
|---|---|---|
| Where `orderKey` sits | **top level**, sibling of `aps` | inside **`data`** |
| What the listener reads | `action.notification.data.orderKey` | `action.notification.data.orderKey` |

✅ **Both resolve to the same JS path, because each plugin normalises its platform's custom keys into
`notification.data`.** ⚠️ **INFERRED for iOS** — the APNs plugin lifts the non-`aps` keys into `data`;
this is the plugin's documented behaviour and has never been exercised on a device, because iOS has
never obtained a token (§36).

## A7. 🔴 Cold launch — it IS replayed, and this is READ from both plugins

**The common case the brief names — an iPad that has slept, woken by a tap — works, and the mechanism
is the same on both platforms: Capacitor retains the event until a listener consumes it.**

**READ — iOS, `PushNotificationsHandler.swift:79`:**

```swift
        self.plugin?.notifyListeners("pushNotificationActionPerformed", data: data, retainUntilConsumed: true)
```

**READ — Android, `PushNotificationsPlugin.java:58` and `:75`:**

```java
    protected void handleOnNewIntent(Intent data) {
        super.handleOnNewIntent(data);
…
            notifyListeners("pushNotificationActionPerformed", actionJson, true);
```

✅ **The trailing `true` is `retainUntilConsumed` on both.** So a tap that launches the app fires
before any JS exists, the event is **held**, and it is delivered the moment
`PushNotifications.addListener('pushNotificationActionPerformed', …)` attaches.

⚠️ **AND THAT IS EXACTLY WHY `push.ts` ATTACHES ITS LISTENERS FIRST AND AWAITS THEM.** The file's own
comment already reasoned about the ordinary case — *"a token delivered to nobody is gone"* — and the
same ordering is what makes the cold-launch tap land. **The retention is the plugin's; the timely
attach is ours.**

⚠️ **ONE RESIDUAL, STATED PLAINLY AND NOT FIXED: the listener attaches only when `DeviceSetupGate`
mounts, i.e. when the dashboard renders.** **INFERRED:** if a cold launch routes to the **KDS**
(`getLastScreen()` can return `'kds'`, `app/app/page.tsx:52`), `DeviceSetupGate` never mounts, no
listener attaches, and the retained event sits unconsumed. **The tap then does nothing on the KDS.**
That is pre-existing — the KDS has never called `registerForPush` — and closing it means mounting the
handler above both screens, which is a larger change than this task's scope. **Reported.**

---

# PART B — 🔴 THE LOCATION PROMPT

## B1 / B2. Before and after

**READ, before** — `lib/printing/bleTransport.ts:107-112`:

```ts
  /** initialize() prompts for permission on first call. Idempotent; safe to call before every operation. */
  const ensureInit = async (): Promise<void> => {
    if (initialised) return
    const BleClient = await ble()
    await BleClient.initialize()
    initialised = true
  }
```

**READ, after:**

```ts
    await BleClient.initialize({ androidNeverForLocation: true })
```

**READ** — the plugin branch this changes, `BluetoothLe.kt:105-120`:

```kotlin
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val neverForLocation = call.getBoolean("androidNeverForLocation", false) as Boolean
            aliases = if (neverForLocation) {
                arrayOf("BLUETOOTH_SCAN", "BLUETOOTH_CONNECT",)
            } else {
                arrayOf("BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "ACCESS_FINE_LOCATION",)
            }
```

✅ **On Android 12+ the requested set drops from three permissions to two, and the one it drops is
the one that made an operator connecting a receipt printer decline on principle.**

## B3. 🔴 The trade-off, stated plainly

**THE ASSERTION IS TRUE OF THIS APP, WHICH IS THE ONLY GROUND FOR MAKING IT. READ** — the entire scan
callback, and the two fields it uses:

```ts
      await BleClient.requestLEScan({ allowDuplicates: false }, result => {
        const id = result?.device?.deviceId
        if (!id) return
        const name = result?.device?.name || result?.localName
        if (!name) return
        found.set(id, { id, name, class: 'ble', likely: looksLikePrinter(name, result?.uuids) })
      })
```

✅ **`deviceId`, `name`, `localName` and `uuids` — nothing else.** No RSSI, no beacon parsing, no
position derivation anywhere in `lib/printing/`. **The declaration is factually accurate.**

⚠️ **INFERRED, and this is the reasoning-about-Android half rather than the reading-our-code half:**
Android honours the assertion by filtering scan results whose principal use is location inference —
in practice **beacons** (iBeacon/Eddystone-class advertisements). A thermal receipt printer advertises
a **name** and a **GATT service** and is not in that class, so **printer discovery is not expected to
be affected.** ⚠️ **Not verified — no Android build has been run since the change.**

🔴 **AND THERE IS A MANIFEST HALF THAT THIS TASK DOES NOT DO, REPORTED SO IT IS NOT ASSUMED DONE.**
The plugin's docs state the flag *"Requires adding 'neverForLocation' to AndroidManifest.xml"* — i.e.
`android:usesPermissionFlags="neverForLocation"` on `BLUETOOTH_SCAN`, plus removing the merged
location permissions. **READ** — the plugin's manifest declares neither:

```xml
  <uses-permission android:name="android.permission.BLUETOOTH_SCAN" tools:targetApi="s" />
```

⚠️ **CONSEQUENCE, STATED HONESTLY: the runtime PROMPT is gone, and the DECLARATION is not.** The
merged manifest still lists `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION`, so the app would still
show Location in a Play listing's permission list even though it no longer asks. **The operator-facing
half is fixed; the store-listing half is a manifest change outside this brief's B2.**

## B4. What the manifest declares, and why it cannot be confirmed

**READ — our manifest's entire permission block, unchanged by this task:**

```xml
    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
```

**READ — what the plugin merges in:**

```xml
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
  <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
  <uses-permission android:name="android.permission.BLUETOOTH_SCAN" tools:targetApi="s" />
  <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" tools:targetApi="s" />
  <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
```

🔴 **AND THE MERGE IS UNVERIFIED, EXACTLY AS THE BRIEF SAYS.** The only merged-manifest artefact on
record is **dated 27 July 21:54**, and the BLE plugin entered `capacitor.settings.gradle` on
**15 August** (`b175963`). **READ** — that artefact's permissions:

```
ACCESS_NETWORK_STATE · INTERNET · POST_NOTIFICATIONS · RECEIVE_BOOT_COMPLETED · USE_BIOMETRIC · USE_FINGERPRINT · WAKE_LOCK
```

**No Bluetooth, no location — not because they were stripped, but because the plugin was not there
yet.** ⚠️ **STATED PLAINLY: nothing here is confirmed without an Android build, and this task did not
build.** ⚠️ **`cap sync` regenerates the gradle plugin lists, not the merged manifest** — D2's output
lists all nine plugins for android, which is the closest available evidence and is still not a merge.

## B5. Runtime permission handling — FOUND, and not built here

✅ **It exists, in the plugin, and our `ensureInit()` triggers it. READ** — `BluetoothLe.kt:127`:

```kotlin
        requestPermissionForAliases(aliases, call, "checkPermission")
```

🔴 **NOT FOUND in our code: any `checkPermissions` / `requestPermissions` call, any permission-state
inspection, or any copy explaining why a prompt appears.** **READ** — the only handling is a
`try`/`catch` that maps a throw to one word:

```ts
      try {
        await ensureInit()
      } catch {
        return 'unauthorised'
      }
```

**Reported, not built, as instructed.**

## B6. ✅ iOS is unaffected

**READ** — the option's own declaration, `@capacitor-community/bluetooth-le` `definitions.d.ts:3-12`:

```ts
export interface InitializeOptions {
    /**
     * If your app doesn't use Bluetooth scan results to derive physical
     * location information, you can strongly assert that your app
     * doesn't derive physical location. (Android only)
     …
     */
    androidNeverForLocation?: boolean;
}
```

✅ **"(Android only)" is the plugin's own annotation**, and the iOS implementation reads no such key.
✅ **`ios/App/App.xcodeproj/project.pbxproj` and `Info.plist` are not in this task's diff.**

---

# PART C — THE NOTIFICATION CHANNEL

## C1. Where a channel would be created, and confirmation none was

**READ** — the API exists and is JS-callable only. `PushNotificationsPlugin.java:192`:

```java
    public void createChannel(PluginCall call) {
        notificationChannelManager.createChannel(call);
    }
```

🔴 **NOT FOUND, before this task:** `grep -rn "createChannel" app components lib` returned **nothing**.
**READ** — `NotificationChannelManager`'s constructor stores three fields and creates nothing, so a
channel existed only if the app asked for one, and it never did.

## C2. The channel — created at registration, Android only

**READ, after** — `lib/native/push.ts`, the exported constant:

```ts
export const ORDER_CHANNEL_ID = 'hg_orders'
```

**READ** — the creation, guarded and non-fatal:

```ts
    if (Capacitor.getPlatform() === 'android') {
      try {
        await PushNotifications.createChannel({
          id: ORDER_CHANNEL_ID,
          name: 'New orders',
          description: 'Alerts when an order needs confirming.',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
          lights: true,
        })
      } catch (chErr) {
        console.warn('[push] createChannel failed — notifications will use the SDK fallback channel:', (chErr as Error).message)
      }
    }
```

| Property | Value | Why |
|---|---|---|
| `id` | **`hg_orders`** | stable; Android keys the operator's own settings on it |
| `name` | **"New orders"** | what the operator sees in Android's notification settings |
| `importance` | **5** = `IMPORTANCE_HIGH` | heads-up with sound — **this is what stops the demotion** |
| `visibility` | **1** = `VISIBILITY_PUBLIC` | content on a lock screen, the point of an alert on a counter tablet |

⚠️ **CREATED BEFORE `register()`, so the channel exists before the first notification can arrive**, and
⚠️ **a failure here is caught rather than allowed to skip `register()`** — without a channel the
notification still arrives on the SDK fallback, which is worse-looking, not lost; a throw would have
cost the token.

## C3. The manifest default — before and after

**READ, before** — no meta-data of any kind beyond the FileProvider's:

```xml
        <provider
            android:name="androidx.core.content.FileProvider"
```

**READ, after** — `android/app/src/main/AndroidManifest.xml`:

```xml
        <!-- The channel FCM uses when a message carries no channel_id of its own. Points at
             @string/default_notification_channel_id = "hg_orders", created by lib/native/push.ts at
             registration. Without this the Firebase SDK creates an unnamed fallback channel, and a
             channel's importance OVERRIDES the message priority we send. -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="@string/default_notification_channel_id" />
```

**READ, after** — `android/app/src/main/res/values/strings.xml`:

```xml
    <!-- MUST equal ORDER_CHANNEL_ID in lib/native/push.ts and the channel_id in lib/fcm.ts's payload.
         This is the channel FCM falls back to for any message arriving WITHOUT its own channel_id;
         without it the SDK invents an unnamed one whose importance overrides our message priority. -->
    <string name="default_notification_channel_id">hg_orders</string>
```

✅ **Both files pass `xmllint --noout`.** ⚠️ **The documented form uses a string resource rather than a
literal `android:value`, and that is what was used** — it is the form the plugin's own README shows.

## C4. The payload targets it — and all three declarations agree

**READ** — `lib/fcm.ts`:

```ts
            android: { priority: 'high', notification: { sound: 'default', channel_id: 'hg_orders' } },
```

**MEASURED — `grep -n "hg_orders"` across the four files that must agree:**

```
lib/native/push.ts:39                                    export const ORDER_CHANNEL_ID = 'hg_orders'
lib/fcm.ts:163                                           channel_id: 'hg_orders'
android/app/src/main/res/values/strings.xml:10           <string name="default_notification_channel_id">hg_orders</string>
android/app/src/main/AndroidManifest.xml:28              (comment naming the same value)
```

✅ **Sent EXPLICITLY rather than relying on the manifest default**, because the manifest value is only
the fallback for messages naming no channel. **Naming it in the payload is what makes the routing
deterministic; the manifest entry catches anything else.**

## C5. 🔴 The icon is a MISSING ASSET, and it is not created here

**READ** — `find android -name "ic_stat*"` returns **nothing**, and there is no
`com.google.firebase.messaging.default_notification_icon` meta-data. **Neither was added.**

**What the asset must be — reported, not made:**

| Property | Requirement |
|---|---|
| **Content** | A **single-colour silhouette on transparency**. Android keeps only the alpha channel and paints the shape in the system tint |
| **Format** | PNG with alpha (or a `VectorDrawable`) |
| **Sizes** | 24×24 dp, supplied at mdpi **24**, hdpi **36**, xhdpi **48**, xxhdpi **72**, xxxhdpi **96** px |
| **Location** | `android/app/src/main/res/drawable-{m,h,xh,xxh,xxx}dpi/ic_stat_hatchgrab.png` |
| **Then** | a `default_notification_icon` meta-data entry pointing at it |

🔴 **DO NOT REUSE THE APP ICON, AND THE REASON IS THAT THE TWO REQUIREMENTS ARE OPPOSITES.** The App
Store icon is **full-colour, fully opaque, no alpha** — Apple rejects transparency. An Android
status-bar icon is **alpha-only**: every non-transparent pixel is drawn white. **Feeding the launcher
icon to this slot produces a white rectangle**, which is the exact symptom already on record.

⚠️ **Until that asset exists the notification still ARRIVES and now lands in the named "New orders"
channel at high importance** — the channel half of the defect is fixed, the icon half is not.

## C6. ✅ iOS is unaffected

**READ** — the creation is inside `if (Capacitor.getPlatform() === 'android')`. ✅ Notification
channels are an Android concept with no iOS counterpart; `lib/apns.ts` is **not in this task's diff**;
the manifest and `strings.xml` are Android-only files.

---

# PART D — SYNC

## D1. Pre-sync baseline — MEASURED

```
sha256  37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30  ios/App/App.xcodeproj/project.pbxproj

17:  HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = HG01BB0000000000000005 …};
32:  HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; …};
80:        HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */,
155:        HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,

Resources build-phase entries: 7
```

✅ **The sha matches the `37ab0184…` in the brief exactly.**

## D2. `npx cap sync` — full output

```
✔ Copying web assets from out to android/app/src/main/assets/public in 1.57ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 783.71μs
✔ copy android in 13.44ms
✔ Updating Android plugins in 2.35ms
[info] Found 9 Capacitor plugins for android:
       @aparajita/capacitor-biometric-auth@10.0.0
       @capacitor-community/bluetooth-le@8.3.0
       @capacitor-community/keep-awake@8.0.1
       @capacitor/app@8.1.0
       @capacitor/local-notifications@8.2.0
       @capacitor/network@8.0.1
       @capacitor/preferences@8.0.1
       @capacitor/push-notifications@8.1.1
       @capacitor/status-bar@8.0.2
✔ update android in 33.25ms
✔ Copying web assets from out to ios/App/App/public in 810.17μs
✔ Creating capacitor.config.json in ios/App/App in 370.21μs
✔ copy ios in 25.44ms
✔ Updating iOS plugins in 2.21ms
[info] All Capacitor plugins have a Package.swift file and will be included in Package.swift
[info] Writing Package.swift
[info] Found 9 Capacitor plugins for ios:
       @aparajita/capacitor-biometric-auth@10.0.0
       @capacitor-community/bluetooth-le@8.3.0
       @capacitor-community/keep-awake@8.0.1
       @capacitor/app@8.1.0
       @capacitor/local-notifications@8.2.0
       @capacitor/network@8.0.1
       @capacitor/preferences@8.0.1
       @capacitor/push-notifications@8.1.1
       @capacitor/status-bar@8.0.2
✔ update ios in 14.20ms
✔ copy web in 5.59ms
✔ update web in 6.96ms
[info] Sync finished in 0.149s
```

✅ **Nine plugins on both platforms, matching `capacitor.settings.gradle`.** ⚠️ **`Writing
Package.swift` is the one thing it says it wrote on the iOS side** — and D3 confirms it did not
disturb the project file.

## D3. ✅ Re-check — NOTHING CHANGED

```
sha256  37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30   <- IDENTICAL
four PrivacyInfo lines: 17, 32, 80, 155                                    <- SAME LINE NUMBERS
Resources build-phase entries: 7                                           <- UNCHANGED
```

✅ **Byte-identical by sha256, not by inspection.** **No STOP condition was reached.**

⚠️ **AND `cap sync` TOUCHED NOTHING ELSE UNDER `ios/` OR `android/`.** **MEASURED** —
`git status --porcelain ios/ android/` returns exactly two files, **both of them mine**:

```
 M android/app/src/main/AndroidManifest.xml
 M android/app/src/main/res/values/strings.xml
```

## D4. ✅ Assets byte-identical BY SHA

**MEASURED, before and after — every one of the seven identical:**

```
eee556188b881990085dea0178069b0ee809bc8cabcdab98d36c7b46f5ac1857  AppIcon.appiconset/AppIcon-512@2x.png
5c09bec6eede599b14fa9e4c44b03e7febebc930615a0cd70f02981c09dfe48a  AppIcon.appiconset/Contents.json
972ec1fd42325872438eb085ac29e94f51c10788ec18ec5549439950866c541d  Contents.json
041481917eb249533ac6dd63d283bc6190b2d0642a93deda11b2ed0f6f7b605a  Splash.imageset/Contents.json
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd  Splash.imageset/splash-2732x2732-1.png
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd  Splash.imageset/splash-2732x2732.png
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd  Splash.imageset/splash-2732x2732-2.png
```

⚠️ **By sha, not by `git status`, exactly as required** — `git status` reports a path as clean if the
content round-tripped, which is a weaker claim than these hashes.

## D5. ✅ The privacy manifest still lints, with both entries

```
ios/App/App/PrivacyInfo.xcprivacy: OK

  NSPrivacyAccessedAPITypes entries: 1 -> ['NSPrivacyAccessedAPICategoryUserDefaults']   (reason CA92.1)
  NSPrivacyCollectedDataTypes entries: 1 -> ['NSPrivacyCollectedDataTypeDeviceID']
  NSPrivacyTracking: False
```

✅ **Both entries present** — the UserDefaults declaration and the DeviceID declaration §36 recommended
and which has since landed.

## D6. ✅ No build, no archive

**Neither `xcodebuild` nor `gradlew` was run. No `.app`, no `.ipa`, no `.apk` was produced.**

---

# PART E — BOUNDARIES

## E1. `git diff --stat` — and this task's share of it

**THIS TASK'S FILES:**

```
 android/app/src/main/AndroidManifest.xml    |   8 +      <- 8 of 8 THIS TASK
 android/app/src/main/res/values/strings.xml |   4 +      <- 4 of 4 THIS TASK
 lib/native/push.ts                          |  46 ++     <- 46 of 46 THIS TASK
 lib/printing/bleTransport.ts                |  15 +-     <- 14/-1 of 14/-1 THIS TASK
 app/dashboard/[token]/page.tsx              | 145 ++-    <- SHARED, see E2
 components/native/OperatorDeviceConfig.tsx  |  33 +-     <- SHARED, see E2
```

**Plus `lib/fcm.ts`, which is UNTRACKED** (created by the FCM task), so its one-line change does not
appear in a diffstat at all — it is quoted at C4.

✅ **Boundary greps across this task's diff — every one zero:**

```
  lib/payments        0      supabase/migrations  0      lib/slot            0
  gatedAction         0      lib/capacity         0      package.json        0
  ipad_kds            0      lib/features.ts      0
```

**No payment path, no gate, no migration, no capacity change.**

## E2. Line-by-line, where files are shared

**MEASURED** — the two shared files, split by subject matter:

| File | Total | This task | Earlier tasks |
|---|---|---|---|
| `components/native/OperatorDeviceConfig.tsx` | +24 / −9 | **8 added lines mention `onOpenOrder`** — the prop, three call sites, the deps note | **6 mention the biometric copy** (`fingerprint or face unlock`, `biometric gate`) — the device-naming task |
| `app/dashboard/[token]/page.tsx` | +133 / −12 | **10 added lines** — `openOrderFromPush`, its comment block, `onOpenOrder={…}`, the two `anchorId` expressions | **23 added lines** mention `resetCancelModal` / `resetRejectModal` / `eventCancelTarget` / `EventCancelModal` / `doCancelEvent` — the overlay-fixes task |

**The four files that were NOT in any earlier task's diff are wholly this task's**: `lib/native/push.ts`,
`lib/printing/bleTransport.ts`, `android/app/src/main/AndroidManifest.xml`,
`android/app/src/main/res/values/strings.xml`.

## E3. What a Pizzeria Gusto operator notices

**On iPad**, almost nothing today and one thing the moment push starts working: the app looks and
behaves identically, but when an order notification finally arrives and is tapped — including from a
cold launch, because both plugins retain the event until a listener consumes it — the dashboard now
switches to the orders tab and scrolls that order into view instead of opening on whatever screen it
was last on; nothing is confirmed, cancelled or edited by the tap, and if the order belongs to a
different event a toast says so rather than leaving a blank board. **On Android** the same tap
behaviour applies, plus two visible differences: connecting a receipt printer no longer asks for
**location** permission (only Bluetooth), and a delivered order notification now lands in a channel
named **"New orders"** at high importance instead of an unnamed system fallback that could silently
demote it — ⚠️ **though it will still show a white silhouette until the `ic_stat_*` asset exists**,
which this task deliberately did not create.

---

# PART F — INTEGRITY

## F1. Non-ASCII census BEFORE

```
lib/native/push.ts                            5 classes   U+2014:11 U+26A0:4 U+FE0F:4 U+2192:3 U+2026:1
components/native/OperatorDeviceConfig.tsx    6 classes   U+2500:311 U+2014:24 U+2192:15 U+2026:3 U+2013:2 U+2019:1
app/dashboard/[token]/page.tsx               53 classes   U+2500:2114 U+2014:500 U+2192:113 U+1F534:87 U+26A0:69 U+FE0F:67 …
lib/printing/bleTransport.ts                  7 classes   U+2500:903 U+2014:26 U+1F534:10 U+2026:3 U+2022:2 U+26A0:2 U+FE0F:2
lib/fcm.ts                                    3 classes   U+2014:22 U+26A0:6 U+FE0F:6
android/app/src/main/AndroidManifest.xml      0 classes   (pure ASCII)
android/app/src/main/res/values/strings.xml   0 classes   (pure ASCII)
```

## F2. 🔴 Census AFTER — three violations caught and removed

| File | Classes | Gained | Lost |
|---|---|---|---|
| `lib/native/push.ts` | **5 → 5** | **none** | **none** |
| `components/native/OperatorDeviceConfig.tsx` | **6 → 6** | **none** | **none** |
| `app/dashboard/[token]/page.tsx` | **53 → 53** | **none** | **none** |
| `lib/printing/bleTransport.ts` | **7 → 7** | **none** | **none** |
| `lib/fcm.ts` | **3 → 3** | **none** | **none** |
| `android/…/AndroidManifest.xml` | **0 → 0** | **none** | **none** |
| `android/…/values/strings.xml` | **0 → 0** | **none** | **none** |

🔴 **THE FIRST DRAFT FAILED IN THREE FILES AND THE AFTER-CENSUS IS THE ONLY THING THAT CAUGHT IT:**

```
  lib/native/push.ts                          5 -> 7   GAINED U+2500 (x6), U+1F534 (x3)
  components/native/OperatorDeviceConfig.tsx  6 -> 9   GAINED U+1F534, U+26A0, U+FE0F
  lib/fcm.ts                                  3 -> 4   GAINED U+1F534
```

**All three were my own comment decoration** — box-drawing section rules and red-circle headers written
by habit into files whose baselines did not contain them. **Fixed by rewriting the rules as `-----`
and the markers as plain uppercase**, then re-measured. ⚠️ **This is the tenth consecutive task where
the after-census caught what reading the diff did not.**

✅ **The two XML files are pure ASCII and stayed pure ASCII** — no smart quote, no en dash, no
non-breaking space crept into a manifest, which is the one place it would break a build rather than
look odd.

**Every count that moved, on glyphs already present:**

```
push.ts        U+2014 11 -> 21   em dashes in the channel and tap comments
               U+26A0  4 ->  7   three new warning notes; U+FE0F tracks it exactly (4 -> 7)
OperatorDevice U+2500 311 -> 331 the prop's section rule, already the file's own vocabulary
               U+2014  24 -> 26
bleTransport   U+2500 903 -> 920 · U+2014 26 -> 30 · U+1F534 10 -> 12 · U+26A0 2 -> 3 (U+FE0F 2 -> 3)
fcm.ts         U+26A0  6 ->  7   one new note; U+FE0F tracks it (6 -> 7)
dashboard      U+2500 2114 -> 2173 · U+2014 500 -> 502 · U+1F534 87 -> 88 · U+26A0 69 -> 71 (U+FE0F 67 -> 69)
```

## F3. 🔴 Carrier-aware variation-selector check

| File | Bases present | U+26A0 n / paired / **bare** | bare vs HEAD |
|---|---|---|---|
| `lib/native/push.ts` | U+26A0 only | 7 / 7 / **0** | 0 → 0 ✅ |
| `components/native/OperatorDeviceConfig.tsx` | U+2500 only (331, takes no selector) | **0 / 0 / 0** | 0 → 0 ✅ |
| `app/dashboard/[token]/page.tsx` | U+2705, U+1F534, U+2500, U+26A0 | 71 / 68 / **3** | **3 → 3** ✅ |
| `lib/printing/bleTransport.ts` | U+1F534, U+2500, U+26A0 | 3 / 3 / **0** | 0 → 0 ✅ |
| `lib/fcm.ts` | U+26A0 only | 7 / 7 / **0** | 0 → 0 ✅ |
| both XML files | none | **0 / 0 / 0** | 0 → 0 ✅ |

✅ **Every warning sign this task added is paired, and no file's bare count moved.** ⚠️ **The dashboard's
`sum(paired)=68` against `FE0F=69` is pre-existing** — one selector there sits on a base outside the
four checked (a gear, a stopwatch and similar appear in that file) — which is why the **delta against
the file's own history**, not the ratio, is the measure that matters.

## F4. Byte scan of every edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  lib/native/push.ts                                      9817 bytes offending=0 CR=0
  components/native/OperatorDeviceConfig.tsx             19904 bytes offending=0 CR=0
  app/dashboard/[token]/page.tsx                        390162 bytes offending=0 CR=0
  lib/printing/bleTransport.ts                           22166 bytes offending=0 CR=0
  lib/fcm.ts                                             16258 bytes offending=0 CR=0
  android/app/src/main/AndroidManifest.xml                2089 bytes offending=0 CR=0
  android/app/src/main/res/values/strings.xml              669 bytes offending=0 CR=0
  ios/App/App.xcodeproj/project.pbxproj                  16075 bytes offending=0 CR=0   (post-sync control)
```

✅ **Zero offending bytes, zero CR.** ✅ **Both XML files also pass `xmllint --noout`.**

## F5. Byte scan of this report

Separate pass, run after writing: **42,740 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR. Its own carrier-aware check:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 37 | 0 | 37 |
| U+1F534 LARGE RED CIRCLE | 21 | 0 | 21 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 0 | 0 |
| U+26A0 WARNING SIGN | 29 | 29 | **0** |

**Every warning sign is paired; ZERO are bare.** **Sum of per-base paired = the total U+FE0F count** - no orphan, no double-count.

## F6. `git status` and `git diff --stat`

```
M android/app/src/main/AndroidManifest.xml
 M android/app/src/main/res/values/strings.xml
 M app/api/orders/submit/route.ts
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OperatorDeviceConfig.tsx
 M docs/device-naming-report.md
 M docs/reference-manual.md
 M lib/native/push.ts
 M lib/plan-features.ts
 M lib/printing/bleTransport.ts
?? components/shared/EventCancelModal.tsx
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/android-parity-report.md
?? docs/event-cancel-holds-report.md
?? docs/event-cancel-refunds-report.md
?? docs/fcm-sender-report.md
?? docs/loyalty-pricing-report.md
?? docs/native-fixes-report.md
?? docs/overlay-audit-report.md
?? docs/overlay-fixes-report.md
?? docs/tagline-spacing-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/fcm.ts
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

```
android/app/src/main/AndroidManifest.xml    |   8 +
 android/app/src/main/res/values/strings.xml |   4 +
 app/api/orders/submit/route.ts              |  66 ++-
 app/api/webhooks/instagram/route.ts         |  48 +-
 app/api/webhooks/messenger/route.ts         |  48 +-
 app/api/webhooks/meta/whatsapp/route.ts     | 173 ++++++-
 app/dashboard/[token]/kds/page.tsx          |  70 ++-
 app/dashboard/[token]/page.tsx              | 145 +++++-
 app/landing/landing.css                     |  16 +-
 app/landing/page.tsx                        |   6 +-
 app/manage/[token]/page.tsx                 |  75 +--
 components/dashboard/AddOrderPanel.tsx      |  22 +
 components/native/OperatorDeviceConfig.tsx  |  33 +-
 docs/device-naming-report.md                | 765 ++++++++++++++++------------
 docs/reference-manual.md                    | 519 ++++++++++++++++++-
 lib/native/push.ts                          |  46 ++
 lib/plan-features.ts                        |  16 +-
 lib/printing/bleTransport.ts                |  15 +-
 18 files changed, 1599 insertions(+), 476 deletions(-)
```

🔴 **THIS TASK'S ENTRIES ARE EIGHT:** `lib/native/push.ts`, `lib/printing/bleTransport.ts`,
`android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/values/strings.xml` (wholly
this task); `app/dashboard/[token]/page.tsx` and `components/native/OperatorDeviceConfig.tsx`
(shared — split in E2); `lib/fcm.ts` (untracked, one line, quoted at C4); and
`docs/native-fixes-report.md` (new).

**Everything else is prior turns' work, uncommitted as instructed and untouched here.**

---

# PART G — WHAT YOU MUST TEST

⚠️ **Items 1–3 need push to actually deliver.** On iOS that means the AppDelegate work producing a
token first (§36 records `push_token` NULL on all four iOS rows); on Android a token already exists.

**1. Tap a notification with the app BACKGROUNDED.**
Place an order that needs confirming, background the app, tap the alert.
- **PASS:** the dashboard comes forward on the **orders tab** and that order's card scrolls to the
  centre of the screen. Nothing is confirmed and no modal opens.
- **FAILURE:** the app opens on whatever screen it was on with no scroll — that is the old behaviour
  and means the handler is still not reaching `registerForPush`.

**2. Tap a notification with the app FULLY CLOSED (cold launch).** 🔴 **The common case.**
Force-quit the app, place an order, tap the alert.
- **PASS:** identical to item 1. The event is retained by the plugin until the listener attaches.
- **FAILURE:** the app launches but does nothing. ⚠️ **Check which screen it launched to** — if it
  cold-launched to the **KDS**, this is the known residual in A7, not a regression.

**3. Tap a notification for an order on a DIFFERENT event.**
Switch the board to another event, then tap an alert for an order on the first.
- **PASS:** the orders tab shows and a red toast reads *"That order is not on this board - check the
  event"*. The board is intact.
- **FAILURE:** a blank screen, an error, or the board silently re-scoping itself to another event.

**4. Connect a printer on Android and note the permission prompts.** 🔴 **The headline Android test.**
Settings → Printing → connect, on an Android 12+ device.
- **PASS:** you are asked for **"nearby devices"** (Bluetooth) and **NOT** for location.
- **FAILURE:** a location prompt still appears — the flag did not take effect. ⚠️ **Then also check
  the printer list still populates**: if Bluetooth is granted but no printers appear, that is B3's
  unverified filtering risk and the flag should come back off.

**5. Check a delivered Android notification's channel and icon.**
With one delivered, open Android Settings → Apps → HatchGrab → Notifications.
- **PASS:** a channel named **"New orders"** exists, set to high importance, and the alert appeared as
  a heads-up banner with sound.
- **PARTIAL, EXPECTED:** the status-bar icon is a **white square or blob**. ⚠️ **That is the missing
  `ic_stat_*` asset (C5) and is not a failure of this change.**
- **FAILURE:** notifications still land in an unnamed or *"Miscellaneous"* channel — the manifest
  meta-data or `createChannel` did not take.

**6. Regression sweep, both platforms.** Confirm an order, cancel one, take a payment.
- **PASS:** identical to before. **No payment path, gate or capacity code is in this task's diff.**
- **FAILURE:** any difference. 🔴 **Stop — nothing in this change should be able to reach those
  paths.**
