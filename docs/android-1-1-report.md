# android-1-1: Android app 1.1 (Capacitor 8.6.2, Play's deobfuscation notice, edge-to-edge, parity with iOS 1.1)

15–16 November 2026. App `com.hatchgrab.app`, live since 5 September 2026 as "HatchGrab V1", version code 1.

**Built, signed, tested on the minified release build, committed. Not uploaded to Play and the website not deployed.** You upload; see §9.

## 1. Brief check

- **Garbled spans: none.** No instruction contradicted another in this brief.
- **Paused once, for disk space, not for this brief.** The six-emulator run hung at 10 GB free. You stopped it and ran disk-cleanup-1 (`docs/disk-cleanup-1-report.md`). Its new guard needs 40 GB to start, and you chose option 1 (plus the simulators). After that this workstream resumed, one emulator at a time.
- **Rules kept:**
  - No `.env`, keystore, signing properties or `~/.googleplay` file was opened. The signed build went through Gradle's existing signing setup.
  - Package name, signing key and permissions are unchanged (§7).
  - Nothing was tested against Pizzeria Gusto or Le Roi du Churrasco. The logged-in screens used the TEST truck's dashboard link (`test-abc123def456`) on localhost.
  - Following §35.af, no agent has a login. Logged-in Manage is yours to check (§10).

## 2. Capacitor 8.6.2 on Android (item 1)

| Package | Was | Now |
|---|---|---|
| `@capacitor/android` | 8.4.1 | **8.6.2** (core / ios / cli were already 8.6.2 from ios-uiscene-1) |
| `@capacitor/app` | 8.1.0 | 8.1.2 |
| `@capacitor/push-notifications` | 8.1.1 | 8.1.3 |
| `@capacitor/local-notifications` | 8.2.0 | **8.2.1, held** |
| `@capacitor/status-bar` | 8.0.2 | 8.0.4 (now **iOS only**, §4) |
| bluetooth-le, keep-awake, biometric-auth, network, preferences, `@hatchgrab/net-printer` | unchanged | already the latest for Capacitor 8 |

- **Why local-notifications stops at 8.2.1.** 8.3.x adds `SCHEDULE_EXACT_ALARM` to the merged manifest. Your rule is no new permissions without asking. If you want 8.3, say so; it's a one-line bump plus the permission. The app doesn't schedule exact alarms.
- **Android changes from 8.4 to 8.6.2:**
  - 8.5's documented changes are iOS only (the UIScene adoption).
  - 8.6 moved the SystemBars inset listener onto the decor view. Under the default `css` handling it passes the insets through when the WebView is version 140 or newer and the page uses `viewport-fit=cover`; otherwise it pads all four sides.
  - Capacitor's "Updating to 8.6" page is a 404. I read the change itself in `@capacitor/android`'s source.
  - Nothing else in the Android project needed changing. The template versions (AGP 8.13.0, Gradle 8.14.3, compile / target 36, min 24) already match Capacitor 8.
  - `npx cap sync android` regenerated `capacitor.settings.gradle` and `capacitor.build.gradle` (9 plugins).
- **targetSdk 36 (Android 16). Why:**
  - Since 31 August 2026, Play requires API 36 for **new apps and app updates**. The extension some developers had ran to 1 November 2026, so it has expired. An update with an older target is rejected at upload.
  - Separately, an existing app must target API 35 or higher to stay visible to new users on newer Android versions. 36 meets both.
  - compileSdk 36, minSdk 24 (Android 7.0), unchanged.

## 3. Play's deobfuscation / optimisation notice (item 2)

- **What Play is warning about.** The V1 bundle was built **without R8**, so two related items appear on it:
  - **"App optimisation below threshold"**: its code obfuscation was 2% (fix by February 2027).
  - **"There is no deobfuscation file associated with this App Bundle"**: with nothing obfuscated there was no mapping to upload. (The manual had recorded both as deliberate deferrals, V11.54.)
  - Play's own help page for the threshold notice returned 404, so the exact threshold isn't confirmed by Google. Developer reports cite 25% obfuscation.
  - The fix for both is the same: turn R8 on and have the mapping reach Play.
- **What changed** (`android/app/build.gradle`, release only):
  - `minifyEnabled true`, `shrinkResources true`, `proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'`.
  - `ndk { debugSymbolLevel 'SYMBOL_TABLE' }`.
  - Debug builds are untouched.
- **Keep rules** (`android/app/proguard-rules.pro`). Plugins are found by reflection, so these come first:
  - Capacitor: `com.getcapacitor.**` (classes and interfaces) and `org.apache.cordova.**`.
  - **Each plugin's package:**
    - `com.capacitorjs.plugins.**`: app, local-notifications, network, preferences, push-notifications;
    - `com.capacitorjs.community.plugins.**`: **bluetooth-le, the Bluetooth kitchen printer**;
    - `com.getcapacitor.community.keepawake.**`: keep-awake;
    - `com.aparajita.capacitor.biometricauth.**`: biometric unlock;
    - `com.hatchgrab.netprinter.**`: **the network kitchen printer**.
  - The app itself: `com.hatchgrab.app.**`.
  - **WebView JS bridges:** every `@JavascriptInterface` method.
  - Attributes: `SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod`, with the source file renamed, so crash stacks still map to lines.
  - Capacitor's own consumer rules also keep every `Plugin` subclass and `@PluginMethod`.
- **Proved:**
  - **From the mapping:** the only classes renamed inside those packages are R8's own synthetic lambdas (`…$$ExternalSyntheticLambdaN`), which nothing looks up by name. Every plugin, bridge and activity class keeps its name.
  - **Size:** 84% of all classes are renamed. The DEX is 2.3 MB, and the AAB went from 6.1 MB to **3.5 MB**.
  - **Behaviour:** the minified, signed build passed every emulator check (§5), with no crash.
- **Native debug symbols: none to produce.**
  - The app's only native library is `libdatastore_shared_counter.so`, from androidx DataStore. It arrives prebuilt and already stripped, so there are no symbols to extract.
  - `debugSymbolLevel` is set so any future native code ships its symbols automatically.
  - If Play shows "This App Bundle contains native code, and you've not uploaded debug symbols", it's about Google's library and can be ignored.
- **Files for Play:**
  - **The bundle:** `android/app/build/outputs/bundle/release/app-release.aab` (3,543,505 bytes, SHA-256 `17bc7ff79b25450da84fd0e405e24d527a2bdc1c7f0a7bb87c6a241ed269bf17`).
  - **The mapping is inside it** (`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`). Play reads it on upload, so there's nothing extra to upload.
  - **Fallback**, only if App bundle explorer shows no ReTrace mapping for version 2: `android/app/build/outputs/mapping/release/mapping.txt` (17.4 MB).
  - ⚠️ **Keep these two files until the upload is done.** `android/app/build` is build output that a disk clean-up may delete. `cd android && ../scripts/guarded.sh ./gradlew bundleRelease` rebuilds it, after `env -u CAP_SERVER_URL npx cap sync android`.

## 4. Edge-to-edge (item 3)

- **The two Play notices:**
  - "Edge-to-edge may not display for all users" is about apps that don't opt in themselves.
  - "Your app uses deprecated APIs or parameters for edge-to-edge" is about `Window.setStatusBarColor` / `setNavigationBarColor` and similar calls, which Android 15 ignores.
- **What does it now (`MainActivity.java`):**
  - `EdgeToEdge.enable(this)` right after `super.onCreate`: androidx's supported call.
  - **MainActivity owns all four insets.** It pads the WebView's parent by the system bars: left, top, right, and at the bottom the navigation bar, or the keyboard while it's up.
  - The window background is a small Drawable. Its top band is the header's colour (navy; white on the kitchen display, as before) and its bottom band is `#F8FAFC`, the page's light colour. Nothing navy shows under the gesture bar.
- **What was switched off, so there's one owner per inset:**
  - **Capacitor's SystemBars:** `plugins.SystemBars.insetsHandling: 'disable'` in `capacitor.config.ts`. Without that, 8.6.2 would pad a second time, or pass the insets to CSS on newer WebViews.
  - 🔴 **`@capacitor/status-bar` is excluded from Android** with `android.includePlugins` in `capacitor.config.ts`. It was the **only** code in the app calling the deprecated bar-colour APIs, and on Android 15+ those calls do nothing anyway.
    - ⚠️ **From now on, a new Capacitor plugin must be added to that list too, or it's silently missing on Android.** The comment there says so, and the manual records it.
    - iOS still uses status-bar; iOS SystemBars reads only `style` / `hidden`.
- **The deprecated calls still in the DEX:**
  - 10 references (5 `setStatusBarColor`, 5 `setNavigationBarColor`), all in androidx's compatibility code:
    - `EdgeToEdgeApi23/26/29`, which `EdgeToEdge.enable` uses on Android 6–10;
    - the SplashScreen `Impl31` lambda.
  - They don't run on Android 15+. If Play still lists them, they're Google's library, which Play's own guidance accepts.
- **No web CSS changed.** No `env(safe-area-inset-*)` was needed, because the native padding does the job, so the website outside the app is untouched.

## 5. Tests (item 4)

**Setup:**
- Every run used the **minified, signed release build**, against the local server through `adb reverse`, **one temporary emulator at a time**.
- The runner is `scripts/android/emulator-checks.sh` (committed with disk-cleanup-1): a 4 GB data partition, no snapshots, the AVD deleted after each run, and any downloaded system image removed.
- The temporary localhost config was reverted afterwards (§6).

| Device | Android / WebView | Result |
|---|---|---|
| Phone (Pixel 7) | 14 (API 34) / 113 | **14 passed, 0 failed** (re-run with the crash check; see below) |
| Phone | 15 (API 35) / 124 | **13 passed, 0 failed** |
| Phone | 16 (API 36) / 133 | **13 passed, 0 failed** |
| Pixel Tablet | 14 / 113 | **16 passed, 0 failed** |
| Pixel Tablet | 15 / 124 | **16 passed, 0 failed** |
| Pixel Tablet | 16 / 133 | **16 passed, 0 failed** |

**What each run checks:**
- **Cold launch:** → `/app` → the login page.
- **Background / foreground:** Home puts the app in the background, and when reopened the page is still there.
- **The test truck's dashboard:**
  - loads ("Pizza Kitchen");
  - **the window holds `FLAG_KEEP_SCREEN_ON`** (the "Screen on" switch);
  - **Paramètres: the Kitchen ticket printing card with its proper words**, and no raw `printing.*` key anywhere;
  - **Carte & stock** opens with its items.
- **Back ×3** on the dashboard: the app stays in front, stays on the dashboard, and the landing page never appears.
- **Three-button navigation:** + Add order, with "Review order →" sitting above the buttons, not under them.
- **Dark mode:** the app keeps its own light theme and the status-bar icons stay readable on navy.
- **Tablets:** portrait → landscape → portrait, with the dashboard there each time.
- **A customer link opens the browser.** The signup page's **Terms** link opens **Chrome**, not the app. This is the bare-host hand-off.
  - This was tested on a **www host on this Mac** (`www.hatchgrab.127.0.0.1.nip.io`, a public DNS name that points back to the machine). There, the app-fixes-1 link guard sends `/terms` to the bare host, Android hands that to the browser, and Chrome opened (its first-run screen, on a fresh emulator).
  - ⚠️ **On production it needs the website deploy.** The live site doesn't have the guard yet, so today a www.hatchgrab.com Terms link stays inside the Android app. Android ignores `target=_blank` for a host the app is allowed to navigate to.
- **No crash in the whole run** (Android's crash buffer). This check was added after the Android 14 phone's first run, where the app didn't come back to the front within 20 s after Home on a first boot. The re-run passed everything, including no crash. The other five devices had already passed the same foreground check.

**Screenshots:** `docs/android-1-1/<device>-*.png`. Key ones:
- `a16-phone-threebutton-add-order.png`: the bottom bar above three-button navigation;
- `a15-tablet-landscape.png`;
- `*-settings-printing.png`;
- `*-browser.png`;
- `ios-iphone18pro-27-launch.png`: the iOS check below.

**The "N" bubble** in the dashboard shots is Next.js's development badge. It only exists against localhost.

**iOS, re-verified after the shared bumps:**
- `npx cap sync ios`: production config, no tracked iOS file changed.
- Built with `scripts/ios/xcodebuild-scratch.sh` (throwaway DerivedData), then installed and launched on the iPhone 18 Pro iOS 27 simulator: it opens to the login page from www.hatchgrab.com.

**Not testable on an emulator,** so check these on your phone (§10): Bluetooth and network printing, biometric unlock, push delivery, and logged-in Manage.

## 6. Version, build and config (item 5)

- **versionName 1.1, versionCode 2** (was 1).
- **Signed AAB:** built with the existing signing setup through `scripts/guarded.sh ./gradlew bundleRelease`.
  - `jarsigner -verify`: "jar verified."
  - The certificate is **O=HatchGrab Ltd, SHA-256 `AA:41:BE:A7:…:88:A9`**, the same upload key as V1.
- **The config points at production:**
  - committed `capacitor.config.ts`: default `https://www.hatchgrab.com`;
  - the baked `android/app/src/main/assets/capacitor.config.json`: `https://www.hatchgrab.com/app`, `allowNavigation` `www.hatchgrab.com`, cleartext false (re-synced after the localhost tests, before the AAB build);
  - the iOS baked config: also production.

## 7. Permissions: unchanged

The final merged manifest requests exactly the live app's 13 permissions:
- INTERNET;
- `BLUETOOTH_SCAN` (neverForLocation) and `BLUETOOTH_CONNECT`;
- `BLUETOOTH` / `BLUETOOTH_ADMIN`, only on Android 11 and older;
- RECEIVE_BOOT_COMPLETED, WAKE_LOCK, POST_NOTIFICATIONS;
- ACCESS_NETWORK_STATE;
- USE_BIOMETRIC, USE_FINGERPRINT;
- c2dm RECEIVE;
- the app's `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.

The location permissions bluetooth-le would add are still removed. ⚠️ An earlier line-based comparison missed the three multi-line Bluetooth entries, on both the old and the new build. I re-checked by parsing the XML: they come from the unchanged app manifest and the unchanged bluetooth-le plugin.

## 8. The other items

- **Google Play countries (item 6): skipped.** `~/.googleplay/hatchgrab-play.json` doesn't exist (I checked only that the file exists, without opening it), so no dry run was possible.
  - Even with the key, `scripts/android/play-availability.cjs` refuses when the production release's status is "completed", which V1's is.
  - So the world-countries-5 availability (187 countries) has to be set by hand: Play Console → Production → Countries / regions. Or do it when you promote 1.1 (§9, step 9).
- **Small leftovers (item 7):**
  - `docs/capacity-one-source-2-report.md` committed (`aacf6b3d`).
  - **Dashboard "Access denied": the inert "← HatchGrab" line under "Back to log in" is removed**, on the web and in the app. "Back to log in" is now the only way forward.
    - It's a website change, so it **reaches users with the next deploy** (not done, as briefed).
    - Re-pins: `app-fixes-2.cjs` (55/55), its structural proof `_named-app-fixes-2.cjs` (language-phase 1b 3504/3504, 1d2 692/692, 2 2024/2024) and `event-types.cjs` (192/192). Each accepts the gate without the brand line.
- **Typecheck and lint:**
  - `tsc --noEmit`: 0 errors.
  - `eslint` on the dashboard page: 108 problems before and after (79 errors, 29 warnings), all already there on the committed page. `capacitor.config.ts` is clean.
- **The full sweep:** **223 run, 217 passed, 6 failed.**
  - The five known failures: paperwork-1, legal-languages-1, world-countries-3, contact-1, tidy-1 (missing translated legal files, e.g. `content/legal/ru-KZ/privacy-policy.md`).
  - **Plus event-types:** my Access denied change; it's re-pinned above and now passes.
  - **So 218 passing, 5 known failures.** event-types was re-run on its own, not the whole sweep again.
- **Commits:**
  - `8d3b1ac9`: android-1-1, the code and screenshots;
  - `6f2064a5`: manual **V16.27**, Android 1.1, with the header and front matter bumped, and the old "R8 deferred" decisions and SystemBars padding note marked superseded;
  - `aacf6b3d`: the capacity report;
  - plus this report.
  - disk-cleanup-1's own commits are separate (`6f2fa100`, `449f3b70`, `7d6e7e5e`).
  - Untracked plugin build output (`plugins/hatchgrab-net-printer/android/build/`) was left uncommitted.

## 9. Play Console: upload steps

1. Play Console → **HatchGrab** → **Test and release → Testing → Internal testing** → **Create new release**.
2. **App bundles → Upload:** `android/app/build/outputs/bundle/release/app-release.aab`.
   - Play should show **version code 2, version name 1.1**.
   - If it asks about Play App Signing, nothing changes: same upload key.
3. **Release name:** `1.1 (2)`.
4. **Release notes.** Paste both languages:

   ```
   <en-GB>
   • Updated for Android 15 and 16: the app now uses the whole screen, and the header, tabs and buttons stay clear of the status bar, the camera and the navigation bar.
   • Smaller download and faster start.
   • Latest app framework and plugin updates.
   • Stability improvements.
   </en-GB>
   <fr-FR>
   • Mise à jour pour Android 15 et 16 : l'application utilise tout l'écran, et l'en-tête, les onglets et les boutons restent dégagés de la barre d'état, de la caméra et de la barre de navigation.
   • Téléchargement plus léger et démarrage plus rapide.
   • Mise à jour du framework de l'application et de ses modules.
   • Améliorations de la stabilité.
   </fr-FR>
   ```
   If the listing's languages are en-US or fr-CA rather than en-GB / fr-FR, use the same text under the codes Play shows.
5. **Next → review the warnings:**
   - "No deobfuscation file" should **no longer** appear.
   - A native-debug-symbols notice, if any, is about androidx's stripped library and can be ignored.
   - There should be no new-permission warning.
6. **Save → Start rollout to Internal testing.**
7. **App bundle explorer → version 2 → Downloads.** Confirm a **ReTrace mapping file** is listed. If it isn't, upload `android/app/build/outputs/mapping/release/mapping.txt` there.
8. Install 1.1 on your phone from the internal-testing opt-in link (Play Store app → HatchGrab → Update) and run §10.
9. When §10 passes: **Internal testing → Promote release → Production.**
   - Rollout percentage: 100%, or 20% for a day if you want a staged start.
   - Same release notes.
   - **Countries:** set the world-countries-5 list (187) in Production → Countries / regions now, by hand (§8).
   - Send for review.
10. **After review:** Play Console → **Android vitals** for the first days, looking for crashes. With the mapping in place, stack traces are readable.

## 10. On your phone, from the internal testing track, before production

Use **your own test truck, never Pizzeria Gusto or Le Roi du Churrasco**. R8 is the risk to watch: a plugin missing a keep rule only fails when it's called, so step 2 matters most.

1. **Launch and log in:** the login page, then the dashboard. The header sits below the status bar and camera; nothing sits under the gesture or navigation bar.
2. **Each plugin once:**
   - **Bluetooth kitchen printer:** Paramètres → Kitchen ticket printing → connect, then a test ticket.
   - **Network printer:** the same, if you have one.
   - **Biometric unlock:** turn it on, close the app, reopen it.
   - **Push:** place a test order on the test truck from another phone; the notification arrives and opens the order.
   - **Keep screen on:** turn "Screen on" on and leave the phone; the screen doesn't sleep.
3. **Manage (logged in), which only you can check:** every tab, including the bottom buttons, nothing hidden under the system bars. Rotate if it's a tablet.
4. **Back:** from the dashboard, never the landing page, and it doesn't drop out of the app unexpectedly.
5. **Background / foreground** during service: lock the phone, unlock it, switch apps, come back. The page is still there.
6. **Three-button navigation** (Settings → System → Gestures, if you normally use gestures): the bottom buttons sit above the bar.
7. **A customer link:** this only opens the browser once the website is deployed (§5). Before the deploy, a www link stays in the app, as in V1.
8. **Dark mode on the phone:** the app stays readable.

If anything in step 2 fails, don't promote. Tell me which plugin; the fix is a keep rule and a rebuild with versionCode 3.

## Undo (only if Dominic asks)

`git revert 6f2064a5 8d3b1ac9`. Then `env -u CAP_SERVER_URL npx cap sync android` and rebuild. That puts back Capacitor 8.4.1 on Android, R8 off, SystemBars and status-bar as before, versionCode 1, and the "← HatchGrab" line. A bundle already uploaded can't be withdrawn from Play; a later one needs versionCode 3 or higher. No database or production changes were made, so there is no SQL to undo.
