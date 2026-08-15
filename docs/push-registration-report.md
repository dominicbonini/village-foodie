# iOS push registration — the missing APNs delegate methods, IMPLEMENTED

**This file replaces the read-only diagnosis of the same name.** That diagnosis found the root cause;
this records the fix.

Scope honoured: **`ios/App/App/AppDelegate.swift` ONLY.** No web change, no plugin change, no
`Info.plist`, no entitlements, no privacy manifest, no `project.pbxproj`. No `next dev`, no
`next build`, no deploy, no archive, no commit, no database write, no Stripe call, no environment
variable touched. **`npx cap sync` was run in Part C and nowhere else, as permitted.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** (quoted from disk or from a command I ran) or **INFERRED**.

---

# PART A — BEFORE

## A1. `ios/App/App/AppDelegate.swift` in full, before the edit

**READ** — 49 lines, complete:

```swift
import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. ...
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, ...
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; ...
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. ...
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. ...
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
```

(The six lifecycle stubs' comments are Apple's boilerplate and are elided above only for width; they are
untouched and present in the diff at B3.)

**READ — confirmation that neither method existed:**

```
$ grep -n "didRegisterForRemoteNotifications\|didFailToRegisterForRemoteNotifications" ios/App/App/AppDelegate.swift
NOT FOUND — neither method appears in AppDelegate.swift
```

🔴 **Confirmed. It is stock Capacitor boilerplate: the two remote-notification methods were never
added.** Everything present is the template's own — `didFinishLaunching`, five lifecycle stubs, and the
two `ApplicationDelegateProxy` forwarders for URLs and universal links.

## A2. The plugin's own README install instructions, quoted verbatim

**READ** — `node_modules/@capacitor/push-notifications/README.md:12-26`, exactly as it is on disk:

````
## iOS

On iOS you must enable the Push Notifications capability. See [Setting Capabilities](https://capacitorjs.com/docs/ios/configuration#setting-capabilities) for instructions on how to enable the capability.

After enabling the Push Notifications capability, add the following to your app's `AppDelegate.swift`:

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}

func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
  NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```
````

✅ **The signatures and notification names used in Part B are copied from this block, not written from
memory.** The only differences in the committed code are indentation (4 spaces, matching the rest of the
file, versus the README's 2) and the added comments.

## A3. The notification names, exactly as the plugin declares them

**READ** — `node_modules/@capacitor/ios/Capacitor/Capacitor/CAPNotifications.swift:12-15`:

```swift
    public static let capacitorDidRegisterForRemoteNotifications =
        Notification.Name(rawValue: "CapacitorDidRegisterForRemoteNotificationsNotification")
    public static let capacitorDidFailToRegisterForRemoteNotifications =
        Notification.Name(rawValue: "CapacitorDidFailToRegisterForRemoteNotificationsNotification")
```

**READ** — and the observers that consume them,
`node_modules/@capacitor/push-notifications/ios/Sources/PushNotificationsPlugin/PushNotificationsPlugin.swift:39-47`:

```swift
        NotificationCenter.default.addObserver(self,
                                               selector: #selector(self.didRegisterForRemoteNotificationsWithDeviceToken(notification:)),
                                               name: .capacitorDidRegisterForRemoteNotifications,
                                               object: nil)

        NotificationCenter.default.addObserver(self,
                                               selector: #selector(self.didFailToRegisterForRemoteNotificationsWithError(notification:)),
                                               name: .capacitorDidFailToRegisterForRemoteNotifications,
                                               object: nil)
```

**READ** — and what those selectors do with `notification.object`, which is why the object type matters,
`PushNotificationsPlugin.swift:184-210`:

```swift
    @objc public func didRegisterForRemoteNotificationsWithDeviceToken(notification: NSNotification) {
        appDelegateRegistrationCalled = true
        if let deviceToken = notification.object as? Data {
            let deviceTokenString = deviceToken.reduce("", {$0 + String(format: "%02X", $1)})
            notifyListeners("registration", data: [
                "value": deviceTokenString
            ])
        } else if let stringToken = notification.object as? String {
            notifyListeners("registration", data: [
                "value": stringToken
            ])
        } else {
            notifyListeners("registrationError", data: [
                "error": PushNotificationError.tokenParsingFailed.localizedDescription
            ])
        }
    }

    @objc public func didFailToRegisterForRemoteNotificationsWithError(notification: NSNotification) {
        appDelegateRegistrationCalled = true
        guard let error = notification.object as? Error else {
            return
        }
        notifyListeners("registrationError", data: [
            "error": error.localizedDescription
        ])
    }
```

⚠️ **Two contracts are visible here and both are honoured in Part B:** the success post must carry the
token as **`Data`** (the plugin hex-encodes it itself), and the failure post must carry an **`Error`** —
the failure observer `return`s silently on anything else, which would produce a second silent failure of
exactly the kind being fixed.

---

# PART B — THE EDIT

## B1 / B2. Both methods, added

**READ** — the final code, as it now stands on disk:

```swift
    // MARK: - APNs registration
    //
    // THE BRIDGE BETWEEN iOS AND @capacitor/push-notifications. Without these two methods the plugin
    // never learns the device token, and NOTHING reports that.
    //
    // WHAT WAS BROKEN, AND FOR HOW LONG. `van_devices.push_token` was NULL on every iOS row since the
    // app was first installed. The JS side was correct throughout: listeners attached AND awaited
    // before requestPermissions() and register() (lib/native/push.ts), the endpoint allow-lists
    // push_token (app/api/native/bind-device), and both entitlements carry aps-environment. The break
    // was here. PushNotifications.register() calls UIApplication.shared.registerForRemoteNotifications(),
    // iOS negotiates with APNs, and APNs hands the token to
    // application(_:didRegisterForRemoteNotificationsWithDeviceToken:) on THIS delegate. That method did
    // not exist, so the default no-op ran and the token was discarded inside the app process.
    //
    // WHY IT WAS INVISIBLE. The plugin observes NotificationCenter, and the ONLY thing in the whole tree
    // that posts these two notifications is the plugin's own README - i.e. this install step. Capacitor
    // core merely DECLARES the names (CAPNotifications.swift). With nothing posting them, the plugin's
    // `registration` event never fired AND NEITHER DID `registrationError`, so the one console.warn that
    // would have reported a fault could never print. The absence of an error was the symptom.
    // Diagnosis and evidence: docs/push-registration-report.md.
    //
    // Signatures and notification names are copied VERBATIM from the plugin's documented install step
    // (node_modules/@capacitor/push-notifications/README.md) - not written from memory. Do not rename
    // the parameters: these are UIApplicationDelegate methods matched by selector, and a changed
    // external label makes them silently stop being called, which reproduces this exact bug.
    //
    // Android does not use this path at all (FCM), which is why Android worked and iOS never has.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    // BOTH METHODS, DELIBERATELY. The failure path matters as much as the success path: the plugin's
    // observer turns this post into a `registrationError` event, which is what surfaces "no
    // aps-environment", a denied permission at the system level, or an APNs network failure. Omitting it
    // leaves a registration failure completely silent - the condition that hid the defect above.
    // The plugin's observer reads `notification.object as? Error` and returns early if it is not one, so
    // the error MUST be passed as the object.
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
```

🔴 **B2 — both methods, and the failure path is not an afterthought.** Without
`didFailToRegisterForRemoteNotificationsWithError`, a registration failure produces **nothing at all**:
no event, no log, no state change. That is precisely the condition that hid this defect — the
`registrationError` listener in `lib/native/push.ts:75-77` has a `console.warn` body that could never
execute, so "no error was reported" read as "no error occurred". **With this method present, a failure
now becomes a `registrationError` event with `error.localizedDescription` attached**, which Part D3 can
actually read.

## B3. The full diff

```diff
diff --git a/ios/App/App/AppDelegate.swift b/ios/App/App/AppDelegate.swift
index c3cd83b..e366345 100644
--- a/ios/App/App/AppDelegate.swift
+++ b/ios/App/App/AppDelegate.swift
@@ -46,4 +46,45 @@ class AppDelegate: UIResponder, UIApplicationDelegate {
         return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
     }
 
+    // MARK: - APNs registration
+    //
+    // THE BRIDGE BETWEEN iOS AND @capacitor/push-notifications. Without these two methods the plugin
+    // never learns the device token, and NOTHING reports that.
+    //
+    // WHAT WAS BROKEN, AND FOR HOW LONG. `van_devices.push_token` was NULL on every iOS row since the
+    // app was first installed. The JS side was correct throughout: listeners attached AND awaited
+    // before requestPermissions() and register() (lib/native/push.ts), the endpoint allow-lists
+    // push_token (app/api/native/bind-device), and both entitlements carry aps-environment. The break
+    // was here. PushNotifications.register() calls UIApplication.shared.registerForRemoteNotifications(),
+    // iOS negotiates with APNs, and APNs hands the token to
+    // application(_:didRegisterForRemoteNotificationsWithDeviceToken:) on THIS delegate. That method did
+    // not exist, so the default no-op ran and the token was discarded inside the app process.
+    //
+    // WHY IT WAS INVISIBLE. The plugin observes NotificationCenter, and the ONLY thing in the whole tree
+    // that posts these two notifications is the plugin's own README - i.e. this install step. Capacitor
+    // core merely DECLARES the names (CAPNotifications.swift). With nothing posting them, the plugin's
+    // `registration` event never fired AND NEITHER DID `registrationError`, so the one console.warn that
+    // would have reported a fault could never print. The absence of an error was the symptom.
+    // Diagnosis and evidence: docs/push-registration-report.md.
+    //
+    // Signatures and notification names are copied VERBATIM from the plugin's documented install step
+    // (node_modules/@capacitor/push-notifications/README.md) - not written from memory. Do not rename
+    // the parameters: these are UIApplicationDelegate methods matched by selector, and a changed
+    // external label makes them silently stop being called, which reproduces this exact bug.
+    //
+    // Android does not use this path at all (FCM), which is why Android worked and iOS never has.
+    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
+        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
+    }
+
+    // BOTH METHODS, DELIBERATELY. The failure path matters as much as the success path: the plugin's
+    // observer turns this post into a `registrationError` event, which is what surfaces "no
+    // aps-environment", a denied permission at the system level, or an APNs network failure. Omitting it
+    // leaves a registration failure completely silent - the condition that hid the defect above.
+    // The plugin's observer reads `notification.object as? Error` and returns early if it is not one, so
+    // the error MUST be passed as the object.
+    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
+        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
+    }
+
 }
```

✅ **Every line is an addition. There is not a single `-` line in the diff** — nothing existing was
modified, reordered or deleted. `41 insertions(+), 0 deletions(-)`, all inside one hunk at the end of
the class.

## B4. Does it still compile as valid Swift?

**Checked in two stages, and the second one has a limitation I am stating plainly rather than glossing.**

**1. Syntax — VERIFIED. READ**, command and exit code:

```
$ xcrun swiftc -parse ios/App/App/AppDelegate.swift
  EXIT CODE: 0
```

**No output, exit 0. The file parses as valid Swift.**

**2. Type resolution — PARTIALLY verified, and I could not complete it. READ:**

```
$ xcrun -sdk iphoneos swiftc -typecheck -target arm64-apple-ios14.0 -sdk "$(xcrun --sdk iphoneos --show-sdk-path)" ios/App/App/AppDelegate.swift
ios/App/App/AppDelegate.swift:2:8: error: no such module 'Capacitor'
 1 | import UIKit
 2 | import Capacitor
   |        `- error: no such module 'Capacitor'
```

⚠️ **What that does and does not tell us.** Against the iOS SDK, `import UIKit` resolves — the error
moved from line 1 to line 2 — so `UIApplication`, `Data`, `Error` and `NotificationCenter` are all
resolvable. **The only unresolved symbol is the `Capacitor` module itself**, which is a Swift Package
product built during an Xcode build. **Building is forbidden by this task, so I did not resolve it.**

🔴 **Stated plainly: the compiler has NOT verified `.capacitorDidRegisterForRemoteNotifications` or
`.capacitorDidFailToRegisterForRemoteNotifications` exist.** They are verified instead by **reading
their declarations** in `CAPNotifications.swift:12-15` (A3), where both are `public static let` on
`extension Notification.Name` — which is exactly what `name:` expects. **INFERRED, with high confidence,
that this compiles. It is not proven, and the first Xcode build is where that is settled.**

---

# PART C — SYNC AND VERIFY

## C1. Baseline recorded BEFORE syncing

**READ:**

```
$ shasum -a 256 ios/App/App.xcodeproj/project.pbxproj
37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30

$ grep -n "PrivacyInfo" ios/App/App.xcodeproj/project.pbxproj
 17:  HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */; };
 32:  HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };
 80:        HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */,
155:        HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,

Resources build phase entries: 7
PrivacyInfo.xcprivacy sha256: 90084605a2882bccc1c9b805c12b89e5d5588a71fa5d20680f6a8ef412334807
```

Asset-catalogue baseline (6 files, for C4) captured by sha to a scratch file before the sync.

## C2. `npx cap sync` — full output

```
✔ Copying web assets from out to android/app/src/main/assets/public in 1.60ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 366.50μs
✔ copy android in 13.67ms
✔ Updating Android plugins in 2.39ms
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
✔ update android in 34.86ms
✔ Copying web assets from out to ios/App/App/public in 984.58μs
✔ Creating capacitor.config.json in ios/App/App in 380.54μs
✔ copy ios in 25.18ms
✔ Updating iOS plugins in 2.41ms
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
✔ update ios in 17.13ms
✔ copy web in 5.95ms
✔ update web in 7.57ms
[info] Sync finished in 0.157s
```

✅ `@capacitor/push-notifications@8.1.1` is present in the iOS plugin list — the plugin whose install
step this task completed.

## C3. Re-check after the sync

| Artefact | Before | After | Verdict |
|---|---|---|---|
| `project.pbxproj` sha256 | `37ab0184…8a2d30` | **`37ab0184…8a2d30`** | ✅ **byte-identical** |
| PrivacyInfo line 17 (`PBXBuildFile`) | present | **present, same line number** | ✅ |
| PrivacyInfo line 32 (`PBXFileReference`) | present | **present, same line number** | ✅ |
| PrivacyInfo line 80 (group child) | present | **present, same line number** | ✅ |
| PrivacyInfo line 155 (Resources phase) | present | **present, same line number** | ✅ |
| Resources build phase entries | 7 | **7** | ✅ |

🔴 **NOTHING CHANGED. No STOP condition was triggered.** This is the third confirmation of the V11.19
finding that on Capacitor 8 with SwiftPM a sync does not rewrite the Xcode project — the plugin list
lives in `Package.swift`, which `cap sync` rewrote (`[info] Writing Package.swift`) and which came out
byte-identical, as it carries no new dependency.

## C4. Asset catalogues — byte-identical BY SHA

**READ** — all six files re-hashed after the sync and diffed against the pre-sync capture:

```
IDENTICAL — all 6 files byte-identical BY SHA

eee55618…  ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
5c09bec6…  ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json
04148191…  ios/App/App/Assets.xcassets/Splash.imageset/Contents.json
50e8f0ae…  ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
50e8f0ae…  ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
50e8f0ae…  ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
```

✅ **Verified by sha comparison of every file, not by `git status`** — as required. The white-ground
icon at scale 830 and the `#0F172A` splash are exactly as they were.

## C5. The privacy manifest still lints and still carries both entries

**READ:**

```
$ plutil -lint ios/App/App/PrivacyInfo.xcprivacy
ios/App/App/PrivacyInfo.xcprivacy: OK

$ shasum -a 256 ios/App/App/PrivacyInfo.xcprivacy
90084605a2882bccc1c9b805c12b89e5d5588a71fa5d20680f6a8ef412334807   (unchanged)
```

**READ** — `plutil -p`, both required entries present and correctly typed:

```
      "NSPrivacyAccessedAPIType" => "NSPrivacyAccessedAPICategoryUserDefaults"
        0 => "CA92.1"
      "NSPrivacyCollectedDataType" => "NSPrivacyCollectedDataTypeDeviceID"
      "NSPrivacyCollectedDataTypeLinked" => true
        0 => "NSPrivacyCollectedDataTypePurposeAppFunctionality"
      "NSPrivacyCollectedDataTypeTracking" => false
  "NSPrivacyTracking" => false
  "NSPrivacyTrackingDomains" => [
```

✅ **Both survive:** the UserDefaults / CA92.1 required-reason entry, and the Device ID collection entry
added earlier. Booleans still parse as booleans.

## C6. No build, no archive

✅ **Neither was run.** `swiftc -parse` and `swiftc -typecheck` are compiler front-end invocations that
produce no binary and touch no build directory; **no `xcodebuild`, no scheme, no archive, no
`DerivedData` write.**

---

# PART D — WHAT YOU MUST TEST

⚠️ **None of this has been observed. The fix is verified as source, not as behaviour.** Until step 7
below shows a token in the database, this remains a well-evidenced change that has never run.

**The device is paired and ready — READ, `xcrun devicectl list devices`: `iPad`, iPad (10th generation),
hardware UDID `00008101-0012045A1E93001E`, iPadOS 26.6, developer mode enabled.**

## D1. The checklist, in order

1. 🔴 **DELETE THE APP FROM THE iPAD FIRST.** Press and hold the icon, Remove App, Delete App.
   ⚠️ **This is step one for a reason: iOS remembers the notification permission decision per bundle id.
   Without a delete, the permission prompt does not reappear** and you cannot tell a fresh grant from a
   remembered one. ⚠️ It also wipes the local `device_id`, so a **new `van_devices` row** will appear —
   expected, and it is how you know you are looking at a fresh registration rather than a stale row.
2. **Build and run onto the iPad from Xcode** (⌘R, Debug configuration).
   ⚠️ A Debug build carries `aps-environment = development` and will obtain a **SANDBOX** token.
   🔴 **The server must therefore have `APNS_ENV` set to anything other than `production` for a send to
   this build to work.** If Vercel currently has `APNS_ENV=production`, **do not place a test order
   against this build** — see step 8.
3. **Start the device log stream in a terminal** before launching:
   ```bash
   log stream --device-name iPad --style compact \
     --predicate 'process == "apsd" OR processImagePath CONTAINS[c] "hatchgrab"'
   ```
4. **Optionally attach Safari Web Inspector** (Develop → iPad → the HatchGrab page) to see the JS side.
   ⚠️ A `console.warn` from the WebView appears **only** here — it never reaches `log stream`.
5. **Launch the app and sign in.** **Land on the Orders dashboard.**
   🔴 **This matters: `registerForPush` is called only from `DeviceSetupGate`, which is mounted on
   `app/dashboard/[token]/page.tsx` and NOWHERE ELSE.** If the app opens on the kitchen display,
   tap through to the dashboard or nothing will attempt registration.
6. **Accept the notification permission prompt** when it appears. If no prompt appears, step 1 was not
   completed.
7. 🔴 **Read `van_devices` — see D2 for exactly what and in what order.**
8. **Only after step 7 shows a token:** place a test order that requires confirming (not auto-accepted),
   with the app **backgrounded** — see D4 for why backgrounded.

## D2. What to check in `van_devices`, and in what order

🔴 **ORDER MATTERS. Read the column BEFORE you cause any send.**

```sql
-- 1. FIRST, and before any test order:
select device_id, platform, notify_enabled, push_token, last_seen
from van_devices
where platform = 'ios'
order by last_seen desc;
```

| What you see | What it means |
|---|---|
| `push_token` **non-NULL**, a long hex string | ✅ **THE FIX WORKS.** This is the whole test. |
| `push_token` NULL, but a **new row** with tonight's `last_seen` | ⚠️ the device bound but registration did not complete — go to D3 and read the log |
| **no new row at all** | the dashboard was never reached (step 5), or `fetchDeviceConfig` failed |

**2. THEN, and only then, place the test order.**

⚠️ **Why the order is not negotiable — READ**, `app/api/orders/submit/route.ts:1283-1284`:

```ts
              if (res.invalidTokens.length) {
                await supabase.from('van_devices').update({ push_token: null }).in('push_token', res.invalidTokens)
              }
```

and **READ**, `lib/apns.ts:70`, what counts as invalid:

```ts
        else { try { const r = JSON.parse(data || '{}'); if (r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') invalidTokens.push(token) } catch {} }
```

🔴 **A send with a mismatched `APNS_ENV` returns `BadDeviceToken`, and the handler NULLs `push_token`
— erasing the evidence that a token ever arrived.** "Never registered" and "registered then destroyed"
become indistinguishable, which is exactly how the last three weeks were spent. **Read the column
first. Screenshot it if you like.**

**3. After the send**, re-read the same query. If `push_token` went from non-NULL to NULL, **the fix
worked and the environment is mismatched** — that is a completely different problem from this one, and a
good outcome for this task.

## D3. What the device log will show — success and each failure

**A SUCCESSFUL registration:**

- **`log stream`**: `apsd` activity naming the bundle id around the moment of the prompt — a token
  request and grant. ⚠️ Apple does not print the token itself.
- **Safari Web Inspector**: 🔴 **silence from `[push]`.** The success path has no log line at all — the
  `registration` listener's only statement is
  `void saveDeviceConfig(token, { push_token: t.value })` (`lib/native/push.ts:73`).
- **The Network tab**: a `POST /api/native/bind-device` whose body **contains `push_token`**. That is the
  clearest single confirmation, and it is visible in the inspector.
- **The database**: `push_token` non-NULL.

**FAILURES — and every one of these is newly visible, because `registrationError` can now fire.** They
appear in the WebView console as `[push] registration error: <message>`:

| Error string | Meaning | Likely here? |
|---|---|---|
| `no valid "aps-environment" entitlement string found` | the built binary is not entitled for push | ⛔ **unlikely** — both entitlements files are correct and §36 records the entitlement proven twice |
| `remote notifications are not supported in the simulator` | running on a Simulator, not the iPad | ⛔ only if you run the wrong destination |
| `The operation couldn't be completed. (NSURLErrorDomain error -1009.)` or similar network text | the device could not reach APNs | ⚠️ possible — retry on a different network |
| `Application does not have the 'aps-environment' entitlement` (variant wording) | provisioning profile lacks the push capability | ⚠️ possible if the profile was regenerated |
| **`tokenParsingFailed`** | 🔴 **the post arrived but its object was not `Data`** — would mean the code in B1 is wrong. **It is not, but this is the string that would prove me wrong.** | should not occur |
| **no `[push]` line at all, and still no token** | the delegate methods are still not being called | 🔴 would mean the build did not pick up the edited `AppDelegate.swift` — rebuild clean |

⚠️ **And a denied permission is still silent by design** — `lib/native/push.ts:90` returns early on
`perm.receive !== 'granted'` with no log. If there is no prompt and no error, check
**Settings → HatchGrab → Notifications** on the iPad.

## D4. ⚠️ EVEN WITH A TOKEN, A FOREGROUND PUSH SHOWS NOTHING

🔴 **State it before you test, so a silent foreground is not read as a failure of this fix.**

**READ** — `node_modules/@capacitor/push-notifications/ios/Sources/PushNotificationsPlugin/PushNotificationsHandler.swift:20-56`:

```swift
    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let notificationData = makeNotificationRequestJSObject(notification.request)
        self.plugin?.notifyListeners("pushNotificationReceived", data: notificationData)
        ...
        if let optionsArray = self.plugin?.getConfig().getArray("presentationOptions") as? [String] {
            ...
        }

        return []
    }
```

**READ** — and there is **no `PushNotifications` block in `capacitor.config.ts`** (only `SplashScreen`,
`LocalNotifications` and `CapacitorHttp`), so `getConfig().getArray("presentationOptions")` is nil, the
`if let` does not bind, and control reaches **`return []`**. **NOT FOUND: any listener for
`pushNotificationReceived` anywhere in the codebase** — the app attaches only `registration`,
`registrationError` and `pushNotificationActionPerformed`.

**So with the app OPEN and a perfectly valid token: no banner, no sound, no badge, no in-app anything.**

✅ **To see a notification arrive, BACKGROUND THE APP first** (swipe up to the home screen, or lock the
iPad). iOS then presents it without consulting `willPresent`, and tapping it fires
`pushNotificationActionPerformed`, which **is** wired and deep-links to the order.

🔴 **THIS IS A SEPARATE DEFECT AND IT IS NOT FIXED HERE.** It lives in `capacitor.config.ts` and in the
JS listeners — both outside this task's scope. It has been invisible until now only because it was
masked by the token defect, and it will look like a new bug the moment the token starts arriving.
**Do not fix it in this change.**

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census of `AppDelegate.swift`, side by side

| | Before | After | Delta |
|---|---|---|---|
| bytes | 3,031 | 6,141 | +3,110 |
| chars | 3,031 | 6,141 | +3,110 |
| lines | 50 | 91 | +41 |
| **non-ASCII total** | **0** | **0** | **0** |
| **distinct classes** | **0** | **0** | **0** |

🔴 **The file was PURE ASCII and it still is.** `bytes == chars` in both columns, which is itself the
proof: every character is a single byte.

**Every difference explained:** the +3,110 bytes and +41 lines are the two methods and their comments,
written **deliberately ASCII-only**. ⚠️ **The house style of this repository's comments uses a red
circle, a warning sign and em dashes, and all three were avoided here on purpose** — this file had a
zero-class baseline, and using them would have added three character classes to a file that had never
held one. The comments use capitalised words for emphasis and ASCII hyphens instead.

## E3. Carrier-aware variation-selector check on this report

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE, whose category is
`Ll`.

Per emoji-presentation base, **measured after writing, not predicted**:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 17 | 17 | **0** |
| U+1F534 LARGE RED CIRCLE | 18 | 0 | 18 |
| U+2705 WHITE HEAVY CHECK MARK | 15 | 0 | 15 |
| U+2714 HEAVY CHECK MARK | 12 | 0 | 12 |
| U+26D4 NO ENTRY | 2 | 0 | 2 |
| U+2318 PLACE OF INTEREST SIGN | 1 | 0 | 1 |

**Sum of per-base paired = 17 = total U+FE0F count = 17** — every selector has a named carrier, no
orphan and no double-count, and **zero bare warning signs**. Bare is correct for the other five: three
are emoji-presentation-by-default, U+2714 is the tick character in the pasted `cap sync` output (a
text-presentation glyph the tool prints itself), and U+2318 is a **keyboard command symbol** inside an
instruction. ⚠️ **Neither of the last two is an emoji**, and flagging them as unpaired would be exactly
the false positive the carrier-aware method exists to prevent.

## E4. Byte scan of the edited file — byte-level, never grep

`ios/App/App/AppDelegate.swift` scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair,
0x0E-0x1F and 0x7F:

```
scanned 6141 bytes; offending=0 -> NONE
CRLF=0 lone CR=0 tabs=0
```

✅ **It is the only edited file.** No other file was written by this task; `cap sync` produced no diff of
its own (see E6).

## E5. Byte scan of this report

Separate pass after writing; result appended below.

## E6. `git status` and `git diff`

```
$ git status --porcelain
 M docs/push-registration-report.md
 M docs/reference-manual.md
 M ios/App/App/AppDelegate.swift
?? docs/capture-sites-report.md
```

```
$ git diff --stat
 docs/push-registration-report.md | 943 ++++++++++++++++++++++-----------------
 docs/reference-manual.md         | 595 +++++++++++++++++++++++-
 ios/App/App/AppDelegate.swift    |  41 ++
 3 files changed, 1169 insertions(+), 410 deletions(-)
```

**THIS TASK'S ENTRY IS `ios/App/App/AppDelegate.swift` (41 insertions, 0 deletions) AND THIS REPORT.**
`docs/reference-manual.md` is the earlier V11.19 update and `docs/capture-sites-report.md` is the
previous task's deliverable; neither was touched here.

🔴 **`npx cap sync` left NO diff of its own.** It rewrote `Package.swift` and the two
`capacitor.config.json` copies and every one came out byte-identical — they do not appear in
`git status`. The full diff of the one changed source file is quoted at **B3**; nothing is staged and
the branch is still `main`.

---

# SUMMARY

**The plugin's documented iOS install step is now complete.** `AppDelegate.swift` implements
`didRegisterForRemoteNotificationsWithDeviceToken` and
`didFailToRegisterForRemoteNotificationsWithError`, each posting the exact notification the
`@capacitor/push-notifications` plugin observes — signatures and names copied verbatim from the
plugin's own README, not from memory. **41 insertions, zero deletions, one file.** Syntax verified with
`swiftc -parse` (exit 0); full type-check not possible without a build, so the two `Notification.Name`
constants are verified by reading their declarations instead. `cap sync` ran and changed nothing:
`project.pbxproj` is byte-identical at `37ab0184…`, the four hand-authored PrivacyInfo lines are intact
at the same line numbers, the Resources phase still has 7 entries, both asset catalogues are identical
by sha, and the privacy manifest still lints with both required entries. The file was pure ASCII and
still is — zero non-ASCII characters before and after.

⚠️ **This has never run.** Part D is the test that turns it from a well-evidenced change into a fact,
and it starts with deleting the app. **Read `push_token` before placing any test order**, and
**background the app** to see a notification — a foreground push shows nothing, which is a separate
defect and is deliberately not fixed here.
