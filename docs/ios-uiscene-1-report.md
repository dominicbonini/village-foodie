# ios-uiscene-1: the iOS app launches when built with the current Xcode SDK

*15 November 2026. Native changes only. No website code was changed, nothing was deployed, and nothing was uploaded to App Store Connect. Signing, bundle ID, version and build number, and capabilities are unchanged.*

## Summary

- **The problem.** Built with Xcode 27.2, the app compiled but would not launch on the iOS 26.5 / 27 simulators: *"UIScene life cycle is required for app"*.
- **The fix: the UIScene life cycle**, adopted Capacitor's documented way (Capacitor 8.5+):
  - a new `SceneDelegate.swift`;
  - the scene manifest in `Info.plist`;
  - AppDelegate's `configurationForConnecting`;
  - Capacitor upgraded from 8.4.0 to **8.6.2**. This is a minor upgrade, so per the brief it didn't need your OK first.
- **Proved on four simulators (iPhone and iPad, iOS 26.5 and 27):**
  - cold launch → login;
  - background → foreground;
  - iPad rotation;
  - the test truck's dashboard → Settings, with the printing card rendered;
  - the notification prompt;
  - a link handing off to Safari (against production).

  A Release build for real devices also compiles, with the production URL baked in.
- **Not proved:** logging in and opening Manage. It needs a real login, and I have none (see §3.3). It is the first step of the TestFlight check in §6.
- **The committed config points at production:** `https://www.hatchgrab.com/app`, with `allowNavigation` `www.hatchgrab.com`.
- **One thing to know:** `@capacitor/core` moved to 8.6.2 too. `@capacitor/ios` 8.6 requires it, and it is part of the website bundle, so it goes live with the **next website deploy**. No website source changed (§1.2).
- **Full sweep:** 223 run, **217 passed, 6 failed**. All 6 predate this work (§7).

**Commits:**

| Commit | What |
|---|---|
| `28f183ec` | the native changes, the Capacitor upgrade, screenshots |
| `2bdb9c4f` | manual V16.25 |
| (this report) | committed last |

## The brief

**Garbled spans:** none.

**Contradictions:** none needed a stop. One point needed care:

- **"Upgrade only if it's the documented route" vs "Don't touch the website code".** The documented route upgrades `@capacitor/core`, and npm refuses `@capacitor/ios` 8.6 without it (a peer dependency).
  - **Why I went ahead:** core is a package version, not website code, and it reaches the website only at the next deploy. I compared core 8.4.0 with 8.6.2 first (§1.2).
  - **Undo:** if you'd rather hold the website on 8.4.0, it's one line in `package.json`. The iOS app can't adopt UIScene without 8.5+.

**Not done, as the brief says:**

- no upload to App Store Connect;
- no change to signing, the bundle ID (`com.hatchgrab.app`), version 1.1 / build 3, or capabilities and entitlements;
- no website code.

## 1. Capacitor version and the documented route

### 1.1 What was installed, and what Capacitor says

- **Installed:** `@capacitor/core`, `@capacitor/ios` and `@capacitor/cli` 8.4.0; `@capacitor/android` 8.4.1. Native Capacitor comes through SPM (`capacitor-swift-pm`, pinned exact 8.4.0).
- **Capacitor's guide**, "Updating from Capacitor 8.4 to Capacitor 8.5" (capacitorjs.com/docs/updating/8-5):
  - Capacitor 8.5 adopts the iOS UIScene life cycle, because Xcode 27 requires it.
  - **Route:** update core and ios to ^8.5 and the CLI to ^8.5, then either run `npx cap migrate` or follow the manual steps.
  - **The manual steps:** a SceneDelegate that forwards to `SceneDelegateProxy`, `configurationForConnecting` in AppDelegate, the `UIApplicationSceneManifest`, and registering the file in the Xcode project.
  - **Who must use the manual steps:** projects with a custom bridge view controller or custom AppDelegate URL handling. This app has a custom bridge (`HGBridgeViewController`).
- **Latest stable:** 8.6.2 (`latest` tag, 13 Nov 2026). It ships `CAPSceneDelegateProxy` and the CLI's `migrate-uiscene` task. A 9.0 release candidate exists; it is not the documented route.

### 1.2 The upgrade

- **`package.json`:** `@capacitor/core`, `@capacitor/ios` and `@capacitor/cli` 8.4.0 → **8.6.2** (exact).
  - **Lockfile:** the CLI adds four small dependencies for editing Xcode projects (`xcode`, `simple-plist`, `bplist-creator`, `stream-buffers`).
- **SPM:** `npx cap sync ios` pinned `capacitor-swift-pm` to exact 8.6.2. `Package.resolved` was updated to match.
- **`@capacitor/android` stays 8.4.1.** Android wasn't in scope. The next `npx cap sync android` prints a version-mismatch warning, which is only a warning in Capacitor's CLI.
- **Core 8.4.0 → 8.6.2, what changed:** I diffed the two packages' `dist`.
  - **The changes:** listener bookkeeping only. `addListener` keeps just the callback id, `removeListener` is awaited, and removing a listener that isn't there is a no-op.
  - **Nothing UIScene-related**, and nothing the website calls differently.
  - **Typecheck** (`tsc`) is clean with 8.6.2.
- **Plugins:** not upgraded. All are 8.x, and each was checked for scene-unsafe code (§2.3).

## 2. What changed in `ios/App`

| File | Change |
|---|---|
| `App/SceneDelegate.swift` (new) | The scene delegate. Keeps the storyboard's window (`HGBridgeViewController`) and forwards the scene's URL and activity callbacks to Capacitor's `SceneDelegateProxy` |
| `App/AppDelegate.swift` | Adds `configurationForConnecting`, which returns `SceneDelegate`. Everything else is unchanged, including APNs registration |
| `App/Info.plist` | Adds `UIApplicationSceneManifest` (below). PlistBuddy also moved one existing key, `NSLocalNetworkUsageDescription`, into alphabetical order; its text is unchanged |
| `App.xcodeproj/project.pbxproj` | Four entries for `SceneDelegate.swift`: file reference, build file, App group, Sources phase. Nothing else |
| `CapApp-SPM/Package.swift`, `…/Package.resolved` | `capacitor-swift-pm` 8.4.0 → 8.6.2 (written by `cap sync`) |
| `App/capacitor.config.json` | **Unchanged**: production |

The scene manifest is Capacitor's, exactly:

```
UIApplicationSceneManifest
  UIApplicationSupportsMultipleScenes = false
  UISceneConfigurations
    UIWindowSceneSessionRoleApplication
      [0] UISceneConfigurationName = Default Configuration
          UISceneDelegateClassName = $(PRODUCT_MODULE_NAME).SceneDelegate
          UISceneStoryboardFile    = Main
```

### 2.1 The one deliberate difference from Capacitor's template

- **The template:** its `SceneDelegate` builds a plain `CAPBridgeViewController()` in code.
- **This app:** its bridge is **`HGBridgeViewController`**, named in `Main.storyboard`. It adds the native "couldn't load, retrying" screen that fixed the blank-screen-for-a-day problem.
- **What copying the template would do:** silently drop that screen.
- **What ours does instead:**
  - The manifest keeps `UISceneStoryboardFile = Main`, so UIKit builds the window and the storyboard's `HGBridgeViewController`.
  - Our `SceneDelegate` keeps that window, so there is one bridge, from the same place as before.
  - Only if no storyboard window exists does it build an `HGBridgeViewController` in code, never the plain class.

### 2.2 Why I didn't run `npx cap migrate`

- **It does more than iOS:** it also runs the Android and Gradle migration steps.
- **It would install the template's plain bridge** (§2.1).
- **So I did the documented manual steps**, mirroring what the CLI's own `migrate-uiscene` task writes.
- **The CLI's Xcode-project helper**, `addSwiftFileToAppTarget`, was tried first and reverted:
  - it rewrote unrelated parts of `project.pbxproj` (variant groups, `LastUpgradeCheck 0920 → 920`);
  - it wrote an invalid `explicitFileType = undefined`.
  - The four entries were added by hand instead, and `plutil -lint` passes.

### 2.3 Current behaviour kept, item by item

| Brief item | How it is kept | Checked |
|---|---|---|
| `server.url` `/app` cold launch, `allowNavigation` | Config unchanged; the bridge is unchanged | Cold launch → login on all four simulators (§3.1) |
| Push notifications | `didRegisterForRemoteNotifications…` / `didFailToRegister…` stay in AppDelegate: APNs is app-wide, not per scene, and Capacitor's guide says those callbacks keep working | The iOS permission prompt appears from the dashboard (§3.2). A real token needs a device: TestFlight check in §6 |
| Deep links / URL opening | `SceneDelegate` forwards `openURLContexts`, `continue userActivity` and the cold-start options to `SceneDelegateProxy`. It posts the same `.capacitorOpenURL` / `.capacitorOpenUniversalLink` the App plugin observes, and fills `App.getLaunchUrl()` | The app declares no URL scheme or universal links today, so there is nothing to open. The path is Capacitor's own |
| Printing plugins (Bluetooth / network) | No lifecycle hooks: BLE uses `UIApplication.shared.open` for Settings only; `@hatchgrab/net-printer` uses none | Printing card renders in Settings in the app (§3.2). Real printers need hardware |
| Keep-awake | Uses `UIApplication.shared.isIdleTimerDisabled`, app-wide, unaffected by scenes | The "Screen on" switch renders on the iPad dashboard (§3.2) |
| Status bar | The plugin reads `view.window?.windowScene?.keyWindow`, already scene-based | The status bar and safe areas are correct in every screenshot |
| Orientation (iPad) | `UISupportedInterfaceOrientations~ipad` unchanged (all four) | Rotated to landscape and back on both iPads (§3.1) |
| External links → Safari | Capacitor's `WebViewDelegationHandler` calls `UIApplication.shared.open`. In 8.5+ the same-window path requires the web view's window scene to be `foregroundActive`; ours is scene-attached | The signup page's Terms link opened Safari, on two iPhones, against production (§3.1) |
| App plugin `pause` / `resume` / `appStateChange` | Built on UIApplication notifications, which iOS still posts under scenes. Capacitor 8.6 also sends the JS `pause` / `resume` from the scene notifications | Background → foreground on all four; the page is intact afterwards |

**Searched for scene-unsafe code:**

- **Patterns:** `tmpWindow`, `TmpViewController`, `UIApplication.shared.delegate?.window`, `keyWindow`, `.windows`, `applicationState`.
- **Where:** the app and every plugin.
- **Result:** only the App plugin's `getState()` reads `applicationState`. That still works in a single-scene app, per Capacitor's guide.

## 3. Build and launch

- **Builds:** Xcode 27.2 (27B52), Debug, unsigned, for the simulator.
- **Temporary localhost config:**
  - Made with `CAP_SERVER_URL=http://localhost:3000 npx cap sync ios`, against the dev server, which was already running.
  - **Reverted** with a plain `npx cap sync ios` (§4).
- **The checks:** driven by a throwaway XCUITest runner in the scratchpad, never in the repo. It controls the installed app by bundle ID.
- **Screenshots:** `docs/ios-uiscene-1/` (26 files).

### 3.1 Results

| Check | iOS 26.5 iPhone 17 Pro | iOS 26.5 iPad Pro 11" | iOS 27 iPhone 18 Pro | iOS 27 iPad Pro 11" |
|---|---|---|---|---|
| Install + launch (failed before this change) | ✅ | ✅ | ✅ | ✅ |
| Cold launch → `/app` → login ("Log in to your kitchen") | ✅ `cold-launch-26-5-iphone.png` | ✅ `cold-launch-26-5-ipad.png` | ✅ `cold-launch-27-iphone.png` | ✅ `cold-launch-27-ipad.png` |
| Background (home) → foreground, page intact | ✅ | ✅ | ✅ | ✅ |
| Rotation: landscape and back | — | ✅ `26-5-ipad-landscape.png` | — | ✅ `27-ipad-landscape.png` |
| Test truck dashboard → Settings | — | ✅ `dashboard-settings-26-5-ipad.png` | ✅ `dashboard-settings-27-iphone.png` | — |
| Kitchen ticket printing card on screen | — | ✅ `26-5-ipad-settings-printing.png` | ✅ `27-iphone-settings-printing.png` | — |
| External link → Safari (production) | ✅ `26-5-iphone-safari-opened.png` | — | ✅ `27-iphone-safari-opened.png` | — |

**Notes:**

- **Background → foreground.** The test presses Home, confirms the app is suspended, then brings it back and finds the login page still there (`*-background-home.png`, `*-foreground-again.png`).
- **Rotation.** The window frame becomes wider than tall in landscape, and taller than wide again in portrait. The landscape screenshots are turned upright with `sips`, because XCUITest saves in the device's portrait frame.
- **The dashboard** shows the test truck (Pizza Kitchen) with the "Screen on" (keep-awake) switch, Order link, QR code and Kitchen screen.
  - iOS showed its notification permission prompt: the push plugin's request reached native code.
  - The test tapped **"Don't Allow"**, so no device token was registered against the test truck.
- **The printing card** reads "Kitchen ticket printing — Automatically print a kitchen ticket for each order when it's due", with no raw keys and no error page.
- **Safari.** The signup page (`*-signup.png`) shows its Terms link. Tapping it brought Safari to the front, on `hatchgrab.com` with iOS's "◀ HatchGrab" back link. The test then switched back to the app (`*-back-in-app.png`).
  - **Why production:** on localhost the app-fixes-1 guard keeps same-host links inside the app by design. Only the real domain hands off.
  - **What it exercised:** the deployed site doesn't have the app-fixes-1 guard yet, so this used Capacitor's `target=_blank` path. The guard's bare-domain path ends in the same `UIApplication.shared.open` call.

### 3.2 Also checked

- **Release build for devices** (`generic/platform=iOS`, unsigned, production config): **BUILD SUCCEEDED**. The built app's `Info.plist` has the scene manifest, and its `capacitor.config.json` says `https://www.hatchgrab.com/app`.
- **Warnings:** 13, all in existing plugin code (deprecated `contentEdgeInsets`, casts), none in the scene changes.
- **Harnesses that read the iOS project:** `ios-intl-1` 16/16 (every `Info.plist` purpose string still localised, display name "HatchGrab") and `printing-copy` pass.

### 3.3 Not done: logged-in Manage

- **Why not:** Manage needs a real operator login. I have no test password, can't read `.env`, and creating an account would add rows to core tables.
- **What I did instead:** opened the dashboard and Settings through the test truck's dashboard link (token-authenticated, read-only), and set the app's start page temporarily in a copy of the built app.
- **Still to do:** logging in → Manage on a device is the first item in §6's TestFlight check.

## 4. The committed config points at production

- **Restored** after testing with a plain `npx cap sync ios` (no `CAP_SERVER_URL`). `ios/App/App/capacitor.config.json` reads:
  - `server.url` = `https://www.hatchgrab.com/app`;
  - `cleartext` = `false`;
  - `allowNavigation` = `["www.hatchgrab.com"]`.
- **Committed state:** git shows **no change** to that file.
- **Source config unchanged:** `capacitor.config.ts` defaults to production.
- **Simulators cleaned up:** the test builds were uninstalled and the simulators shut down.

## 5. Reference manual (V16.25)

- **Version:** header and front matter both bumped to 16.25.
- **The changelog entry covers:**
  - the problem and the documented route;
  - the 8.6.2 upgrade, including the core bump going live with the next website deploy;
  - the SceneDelegate keeping `HGBridgeViewController`, and why;
  - which AppDelegate methods iOS stops calling;
  - the manifest;
  - not using the CLI's project helper on this project;
  - what was proved and what wasn't.
- **Older section annotated:** the existing "Xcode project uses explicit file references" section, with how the storyboard is now loaded.

## 6. What you need to do in Xcode to archive and submit iOS 1.1

1. **Get the code.** Use this commit (`git pull`), then `npm ci`, so `node_modules` has Capacitor 8.6.2.
2. **Sync with the production config.** Run `npx cap sync ios` with **no** `CAP_SERVER_URL` set.
   - Check that `ios/App/App/capacitor.config.json` says `"url": "https://www.hatchgrab.com/app"`.
   - `git status` should show no change to it.
3. **Open the project.** Open `ios/App/App.xcodeproj` in **Xcode 27.2**.
   - Let it resolve packages. If needed: File → Packages → Resolve Package Versions.
   - In the navigator, under Package Dependencies, `capacitor-swift-pm` should read **8.6.2**.
4. **Build number** (target App → General → Identity). Version is **1.1** and Build is **3**; I didn't change either.
   - **If build 3 of 1.1 was already uploaded** to App Store Connect, set Build to **4**. A build number can't be reused.
5. **Signing** (Signing & Capabilities). Automatic, team `C24X5FG48V`, bundle ID `com.hatchgrab.app`, all unchanged.
6. **Archive.** Choose the scheme **App** and the destination **Any iOS Device (arm64)**, then Product → **Archive**.
7. **Upload.** In the Organizer, choose the new archive → **Distribute App** → **App Store Connect** → **Upload**. Accept the defaults (automatic signing, upload symbols).
8. **TestFlight check on a real iPad and iPhone**, before you submit:
   - log in with your test account → dashboard, Manage, Paramètres (printing card);
   - send the app to the background and back;
   - rotate the iPad;
   - tap a customer link (e.g. the order link): it should open Safari;
   - allow notifications, then confirm a test order alert arrives. The simulator can't prove push.
9. **Submit.** In App Store Connect → HatchGrab → iOS → **1.1**: select the new build, then **Add for Review** / **Submit**.

**Ordering note:** the app works with the website as deployed now (core 8.4) and after the next deploy (core 8.6). Capacitor's bridge is compatible within a major version, and the Safari check above ran this 8.6 build against the live site. So the website deploy and the App Store submission can happen in either order.

## 7. Tests

### Full sweep: 223 run · 217 passed · 6 failed

Run after the upgrade. None of the 6 failures is caused by this work:

- **`paperwork-1`, `legal-languages-1`, `world-countries-3`, `tidy-1`:** `content/legal/ru-KZ/privacy-policy.md` is missing.
- **`contact-1`:** its old `planTable` pin. It still lists only the `planTable` files, so nothing from this work.
- **`event-types-render`:** its known flaky dropdown check ("a dropdown's text is the same size as a row label, 16px vs 14px"). Each run it fails on one random case, this time 820/3. It also fails at random on earlier commits (app-fixes-1 §8), and it passed in app-fixes-2's final sweep.

**Also run:**

- `tsc` is clean with core 8.6.2.
- `ios-intl-1` 16/16 and `printing-copy` pass. These are the harnesses that read `Info.plist` and the Swift shell.

## 8. SQL (read-only, Supabase MCP)

```sql
select id, name, country, length(dashboard_token) as token_len from trucks where id in ('test-truck','app-tester') order by id;
select dashboard_token from trucks where id = 'test-truck';
```

The second query gave the test truck's dashboard link for the temporary start page. The token isn't repeated here. No writes.

## 9. Open, for your decision

1. **Logged-in Manage** on a device (§3.3, §6 step 8).
2. **`@capacitor/core` 8.6.2 goes live with the next website deploy** (§1.2). Say if you want it held at 8.4.0 for the website; the iOS app needs 8.5+ either way.
3. **Android** is still on `@capacitor/android` 8.4.1. Align it with 8.6.x at the next Android build; it's not urgent.
4. **Build number 4** if build 3 of 1.1 is already in App Store Connect (§6 step 4).

## 10. Files

**Committed (`28f183ec`):**

- `ios/App/App/SceneDelegate.swift` (new)
- `ios/App/App/AppDelegate.swift`
- `ios/App/App/Info.plist`
- `ios/App/App.xcodeproj/project.pbxproj`
- `ios/App/CapApp-SPM/Package.swift`
- `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`
- `package.json`, `package-lock.json`
- `docs/ios-uiscene-1/*.png` (26)

**Also committed:** `2bdb9c4f` (`docs/reference-manual.md`) and this report.

**Left alone:** `docs/capacity-one-source-2-report.md` (uncommitted, not this work).

**Outside the repo:**

- the XCUITest runner and build products, in the scratchpad;
- the two Capacitor 8.6.2 zips in `~/Library/Caches/org.swift.swiftpm/artifacts/`, checksum-verified. Xcode's own download hung in this environment. These are SwiftPM's normal cache files, and on your Mac Xcode downloads them itself.
