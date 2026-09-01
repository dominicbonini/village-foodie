# Android submission — a read-only diagnosis

**Date:** 29 August 2026
**Nothing was built, released, synced, committed or deployed. No tracked file was changed.**

⚠️ **ONE INSTRUCTION NEEDED A JUDGEMENT AND I AM STATING IT UP FRONT.** Item 4 requires generating a
fresh merged manifest; the preamble says *"change no file"* and *"run no Gradle release task"*. I ran
**`./gradlew :app:processDebugMainManifest`** — a **debug** task, which by construction cannot write
release outputs — and `android/app/build/` is gitignored (`android/.gitignore:24`). **`git status`
returned an identical 186 paths before and after, and the release `.aab`'s mtime is unchanged at
2026-08-26 20:10:27.** If you consider that a build I should not have run, the manifest section is the
only part of this report that depended on it.

**Read vs inferred:** every value below is READ from a file, a bundle or a command unless the line says
INFERRED or UNKNOWN.

---

## 1. Inventory of the uncommitted batch

**186 paths.** Full output of both commands is reproduced verbatim in the appendix (§A). Classification:

| Class | Count | |
|---|---|---|
| web (compiled into the Vercel bundle) | **97** | |
| docs | **69** | all under `docs/`, plus `content/store-listing.md` and `android/SIGNING.md` |
| android native | **41** | |
| migrations | **6** | |
| shared native | **3** | `capacitor.config.ts`, `package.json`, `package-lock.json` |
| ios native | **3** | |
| other | **2** | `.gitignore`, `vercel.json` |

⚠️ **`android/SIGNING.md` and `android/keystore.properties.example` sit under `android/` but are
documentation and a template — I have counted them as docs, not android native.** Total 186 is
preserved; the split is a judgement, stated so you can move them.

**android native (41):** `android/app/build.gradle` · `android/app/src/main/AndroidManifest.xml` ·
`android/app/src/main/java/com/hatchgrab/app/MainActivity.java` · 11 × `splash.png`
(`drawable/`, `drawable-land-*`, `drawable-port-*`) · 15 × launcher icons (`mipmap-*` ×
`ic_launcher`, `ic_launcher_foreground`, `ic_launcher_round`) · 5 × **untracked**
`drawable-*/ic_stat_hatchgrab.png` · plus `android/SIGNING.md` and
`android/keystore.properties.example` if you count them here instead.

**ios native (3):** `ios/App/App.xcodeproj/project.pbxproj` · `ios/App/App/Info.plist` ·
**untracked** `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`.

**migrations (6):** all untracked — `20260826_trucks_embed_enabled.sql`,
`20260826_trucks_embed_plan_answer.sql`, `20260826_trucks_embed_seen.sql`,
`20260827_trucks_custom_domain.sql`, `20260827_trucks_custom_domain_monitor.sql`,
`20260827_trucks_custom_domain_setup.sql`.

**other (2):** `.gitignore`, `vercel.json`. ⚠️ **`vercel.json` is arguably web** — it is deploy config
that ships with the Vercel bundle, not a source file compiled into it. Flagged, not forced.

**web (97):** 27 modified (`app/**` ×13, `components/**` ×5, `lib/**` ×8, `proxy.ts`, `public/**` ×5,
`app/landing/landing.css`) and 70 untracked (`app/domain/page.tsx`, `app/o/[slug]/page.tsx`,
`app/trucks/[slug]/order/layout.tsx`, `app/api/embed/events/`, `app/api/cron/custom-domain-check/`,
`components/embed/`, `components/dashboard/CustomDomainSetup.tsx`, `components/auth/`,
`lib/custom-domain/*` ×7, `lib/custom-host.ts`, `lib/auth/`, `lib/audit/`, `lib/whatsapp/`,
`lib/native/notificationIcon.ts`, `scripts/check-plain-english.mjs`, …).

`git diff --stat` totals **68 files changed, 7,413 insertions(+), 352 deletions(-)** — that counts
tracked modifications only, not the 118 untracked paths.

---

## 2. Dating the bundle against the tree

**The signed release bundle — READ:**

```
path  : android/app/build/outputs/bundle/release/app-release.aab
size  : 6,148,125 bytes (5.9 MB)
mtime : 2026-08-26 20:10:27
signed: YES — META-INF/HATCHGRA.SF (129,975 B) + META-INF/HATCHGRA.RSA (1,371 B)
```

### 🔴 Zero commits touch those paths since that timestamp — because there are zero commits at all

```
git log --since='2026-08-26 20:10:27' -- android/ capacitor.config.ts …/assets/capacitor.config.json
  → 0 commits

last commit on the branch: 1d85241  2026-08-25 11:26:08  "ipad"
```

**The whole 186-path batch is uncommitted and postdates the last commit by four days.**

### Every uncommitted change to those paths, dated against the build

🔴 **EVERY ANDROID NATIVE SOURCE PREDATES THE BUILD.** The bundle was built *from* this uncommitted
state — these are not pending changes to it:

| Path | mtime | vs build |
|---|---|---|
| `android/app/build.gradle` | 2026-08-25 22:26:50 | ✅ in the bundle |
| `android/app/src/main/AndroidManifest.xml` | 2026-08-26 09:54:28 | ✅ in the bundle |
| `MainActivity.java` | 2026-08-26 16:37:55 | ✅ in the bundle |
| 11 × splash, 15 × launcher icons, 5 × `ic_stat_hatchgrab` | 2026-08-25 21:53:35–36 | ✅ in the bundle |
| `capacitor.config.ts` | 2026-08-26 10:31:28 | ✅ in the bundle |
| `android/SIGNING.md`, `keystore.properties.example` | 2026-08-25 22:26 | ✅ (docs — no artefact effect) |
| `package.json`, `package-lock.json` | **2026-08-27 18:39:13** | 🔴 **after** |
| `android/app/src/main/assets/capacitor.config.json` (gitignored) | **2026-08-26 20:23:08** | 🔴 **after** |

**What each of the two post-build changes does to the shipped artefact:**

- **`package.json` / `package-lock.json`** — adds `psl@^1.15.0` and `@types/psl@^1.1.3`. **READ: no
  Capacitor plugin was added or removed.** `psl` is a public-suffix-list library used by
  `lib/custom-domain/apex.ts`, a web module. **Effect on the artefact: NONE** — it changes no native
  dependency, no manifest entry and no plugin set.
- **`assets/capacitor.config.json`** — written 13 minutes after the build by a `cap sync`. 🔴 **I
  extracted the copy baked into the `.aab` (`base/assets/capacitor.config.json`) and diffed it against
  the file on disk: IDENTICAL, byte for byte.** The sync reproduced the same bytes, so the 13-minute gap
  changed nothing.

---

## 3. Build configuration as it stands — quoted from the files

**`android/variables.gradle`** (READ, lines 2-4):

```gradle
    minSdkVersion = 24
    compileSdkVersion = 36
    targetSdkVersion = 36
```

**`android/app/build.gradle`** (READ, lines 27-33):

```gradle
    compileSdk = rootProject.ext.compileSdkVersion          // → 36
        minSdkVersion rootProject.ext.minSdkVersion         // → 24
        targetSdkVersion rootProject.ext.targetSdkVersion   // → 36
        versionCode 1
        versionName "1.0"
```

🔴 **`versionCode 1` / `versionName "1.0"`, and the shipped bundle agrees** — I extracted
`versionName` from the `.aab`'s own manifest and it reads `1.0`. ⚠️ **An earlier reading of mine said
1.18.1; that was bundletool's version stamp in `BundleConfig.pb`, not the app's.** Corrected.

**`signingConfigs`** (READ, lines 41-58):

```gradle
    signingConfigs {
        // Created ONLY when the credentials file is present — see the guard above.
        if (hasKeystore) {
            release {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            if (hasKeystore) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false
```

Guarded on `rootProject.file("keystore.properties").exists()` (line 18-20). **`minifyEnabled false`**
and no `shrinkResources`, deliberately per the comment. ⚠️ **UNKNOWN: whether
`android/keystore.properties` is present right now** — I did not look for it, because reading a
credentials file was not asked for and is not needed: the existing `.aab` is signed, which proves it was
present at 20:10 on 26 August.

---

## 4. Fresh merged manifest

**Produced by `./gradlew :app:processDebugMainManifest` at 14:16 on 29 August 2026.** The file read is
`android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml`,
**mtime 2026-08-29 14:16:22** — it was 2026-08-26 20:21:18 before the run, so this is a fresh
generation, not a cached one.

**Every `uses-permission` (13):**

| Permission | flags / limits |
|---|---|
| `android.permission.ACCESS_NETWORK_STATE` | |
| `android.permission.BLUETOOTH` | `maxSdkVersion="30"` |
| `android.permission.BLUETOOTH_ADMIN` | `maxSdkVersion="30"` |
| `android.permission.BLUETOOTH_CONNECT` | |
| `android.permission.BLUETOOTH_SCAN` | **`usesPermissionFlags="neverForLocation"`** |
| `android.permission.INTERNET` | |
| `android.permission.POST_NOTIFICATIONS` | |
| `android.permission.RECEIVE_BOOT_COMPLETED` | |
| `android.permission.USE_BIOMETRIC` | |
| `android.permission.USE_FINGERPRINT` | |
| `android.permission.WAKE_LOCK` | |
| `com.google.android.c2dm.permission.RECEIVE` | |
| `com.hatchgrab.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | |

🔴 **CAMERA IS NOT DECLARED.** `android.permission.CAMERA` does not appear anywhere in the merged
manifest.
🔴 **NO LOCATION PERMISSION APPEARS.** No `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` or
`ACCESS_BACKGROUND_LOCATION`. `BLUETOOTH_SCAN` carries `neverForLocation`, which is what §36 records as
making the Play location answer honest.

⚠️ `android.permission.DUMP` and `android.permission.BIND_JOB_SERVICE` appear in the file but are
**`android:permission` attributes on components** (lines 248 and 273), not `uses-permission` entries. An
earlier `strings`-based read of the `.aab` counted them as permissions; that was a harness artefact and
is corrected here.

**Every `intent-filter` (9):**

1. `MAIN` + category `LAUNCHER` — the launcher activity
2. `LOCKED_BOOT_COMPLETED`, `BOOT_COMPLETED`, `QUICKBOOT_POWERON`
3. `com.google.firebase.MESSAGING_EVENT`
4. `com.google.android.c2dm.intent.RECEIVE`
5. `com.google.firebase.MESSAGING_EVENT` (`android:priority="-500"`)
6–9. `androidx.profileinstaller.action.{INSTALL_PROFILE, SKIP_FILE, SAVE_PROFILE, BENCHMARK_OPERATION}`

**No `VIEW`/`BROWSABLE` deep-link filter, no custom scheme, no App Links.** INFERRED consequence: the app
has no deep-link entry point; it opens at `server.url` only.

### The shipped bundle's manifest matches

I extracted the permission set from `app-release.aab`'s own manifest: the same 11
`android.permission.*` entries, plus the same two non-`android.permission.*` ones. **There is no
manifest drift between the shipped bundle and the current tree.**

---

## 5. The photo-upload path

**Thirteen file inputs whose `accept` includes `image/*` (READ, file:line):**

| # | File | Line | accept |
|---|---|---|---|
| 1 | `app/admin/page.tsx` | 1587-1588 | `image/*,application/pdf` |
| 2 | `app/manage/[token]/page.tsx` | 1034 | `image/*,application/pdf` |
| 3 | `app/manage/[token]/page.tsx` | 1108 | `image/*,application/pdf` |
| 4 | `app/manage/[token]/page.tsx` | 4077 | `image/*` |
| 5 | `app/manage/[token]/page.tsx` | 4483 | `image/*,.pdf` |
| 6 | `app/manage/[token]/page.tsx` | 4814 | `image/*` |
| 7 | `app/manage/[token]/page.tsx` | 5730 | `image/*,application/pdf` |
| 8 | `app/manage/[token]/page.tsx` | 8221 | `image/*,.pdf` |
| 9 | `app/manage/[token]/page.tsx` | 8294 | `image/*,.pdf` |
| 10 | `app/manage/[token]/page.tsx` | 9323 | `image/*` (logo upload) |
| 11 | `components/DemoGetStarted.tsx` | 868 | `image/*` |
| 12 | `components/DemoGetStarted.tsx` | 877 | `image/*` |
| 13 | `components/menu/MenuUploadFields.tsx` | 69 | `image/*,.pdf` |

**No `capture=` attribute exists anywhere** (the one grep hit, `lib/payments/promote-draft.ts:529`, is a
log string about payment capture). **No `@capacitor/camera` plugin is installed or imported** — READ
from `package.json` and a tree-wide grep.

### Which of the three states this app is in

| state | | this app |
|---|---|---|
| declared **and** requested at runtime | working | no |
| **declared but never requested** | 🔴 the known breakage — Android denies the intent | **no** |
| **not declared, not requested** | working | **✅ YES** |

**This app is in the third state, and that is the correct one for `<input type="file"
accept="image/*">`.** The system file picker offers a camera option that runs in the *camera app's*
process, so the host app needs no CAMERA grant. **It is the middle state — a `CAMERA` line in the
manifest with no runtime request — that breaks camera intents, and this manifest has no such line.**

⚠️ **UNKNOWN — NOT OBSERVED: whether photo upload actually works on a device.** Nothing here was
exercised on hardware; this is a static reading of the manifest and the inputs.

---

## 6. Config drift

**None.** I rendered `capacitor.config.ts` through its own TypeScript (so `NOTIFICATION_SMALL_ICON`
resolves as the app resolves it) and compared it field by field against
`android/app/src/main/assets/capacitor.config.json`:

```
✅ NO DRIFT — every field in both files agrees, 19 fields compared
```

`NOTIFICATION_SMALL_ICON` is `'ic_stat_hatchgrab'` (`lib/native/notificationIcon.ts:28`), which is what
the JSON carries. **And the JSON on disk is byte-identical to the copy baked into the `.aab`** (§2).

🔴 **THE FIELD THAT DECIDES THE VERDICT:** `server.url` is
**`https://www.hatchgrab.com/app`**, `cleartext: false`, `allowNavigation: ["www.hatchgrab.com"]`.

---

## 7. Store listing assets

**READ from the repository:**

| Asset | Status |
|---|---|
| **512×512 icon** | ✅ **EXISTS** — `public/icons/icon-512.png` (512×512, 10,352 B) and `public/icons/icon-512-maskable.png` (512×512, 5,832 B) |
| **1024×500 feature graphic** | 🔴 **DOES NOT EXIST** — nothing in the repo is 1024×500 |
| **Phone screenshots** | 🔴 **DO NOT EXIST** — no image file of any kind is a screenshot |
| **Tablet screenshots** | 🔴 **DO NOT EXIST** |
| **Listing copy** | ✅ `content/store-listing.md` (126 lines, untracked) — app name, short description, full descriptions for both stores, category, content rating, changelog |

⚠️ **A CAVEAT ON THE 512 ICON I CANNOT RESOLVE FROM HERE.** `icon-512.png` is **3-channel, no alpha
(24-bit)**; `icon-512-maskable.png` is 4-channel with alpha (32-bit). **Play's listing icon is specified
as 32-bit PNG.** Whether Play rejects the 24-bit file is **UNKNOWN** — I did not test an upload. The
maskable one is 32-bit but is composed at the maskable safe-zone ratio, so it is **not**
a drop-in listing icon.

⚠️ **§36 records working emulator profiles for screenshots** — phone 1080×1920 at 420dpi, 10-inch
tablet 2560×1440 at 320dpi landscape — **so the geometry problem is solved on paper and no image has
been captured.** Nothing was created here.

---

## 8. Verdict

### The existing `.aab` is submittable as a binary. What blocks submission is the listing, not the bundle.

**Why the binary is not stale — READ, not inferred:**

1. **Every Android native source predates the build** (§2). The bundle was built from exactly this
   working tree.
2. **The manifest matches** — same permission set in the shipped bundle and in a manifest merged today
   (§4).
3. **The baked `capacitor.config.json` is byte-identical to the one on disk** (§2).
4. 🔴 **The app bundles no web build.** `base/assets/` in the `.aab` contains exactly five entries:
   `capacitor.config.json`, `capacitor.plugins.json`, `native-bridge.js`, and under `assets/public/`
   only `cordova.js` and `cordova_plugins.js`. **There is no `out/` directory inside the bundle.** The
   shell loads `https://www.hatchgrab.com/app` at runtime.

🔴 **SO ALL 97 WEB PATHS IN THE UNCOMMITTED BATCH REACH THE APP THROUGH A VERCEL DEPLOY, NOT THROUGH A
REBUILT BUNDLE.** The custom-domain feature, the QR split, the landing changes — none of it is in the
`.aab` and none of it needs to be. **The two artefacts are independent: uploading this bundle ships the
shell; deploying Vercel ships the product inside it.**

### What a rebuilt bundle would contain that this one does not

**Nothing functional.** Enumerated exhaustively, a rebuild today would differ only by:

- **`psl` / `@types/psl` in `package-lock.json`** — a web dependency; it changes no native code, no
  plugin, no manifest entry. **Zero effect on the artefact.**
- **A new build timestamp and rebuilt intermediates.**
- **Nothing else** — no source, resource, manifest or config input has changed since 20:10 on 26 August.

**A rebuild is therefore optional and would produce a functionally identical bundle.**

### What actually blocks submission

| Blocker | State |
|---|---|
| 🔴 **Phone screenshots** | **Do not exist.** Play requires a minimum of 2. |
| 🔴 **Feature graphic 1024×500** | **Does not exist.** Required for the store listing. |
| ⚠️ **512×512 icon** | Exists, but the non-maskable one is 24-bit. **UNKNOWN whether Play accepts it.** |
| ⚠️ **Tablet screenshots** | Do not exist. Not strictly required, but the app targets tablets. |
| ⚠️ **`/privacy` provider table** | §36 records it still needs **Gemini and Stripe** added, and data-safety answers must match it. **UNKNOWN — not verified in this diagnosis.** |
| ⚠️ **The web deploy** | The shell points at production. **Whatever is live at `www.hatchgrab.com/app` is what a reviewer sees**, not this working tree. |

### 🔴 The one thing I would check before uploading

**`versionCode 1`.** For a first upload that is correct. **If any bundle has ever been uploaded to this
Play Console — even to a closed or internal track — `versionCode 1` will be rejected as already used**,
and the fix is a `build.gradle` edit and a rebuild. **UNKNOWN: whether anything has been uploaded.** §36
records the account as verified and the package name as reserved, but I found **no record in the manual
of any upload having occurred**, and I did not query Play.

---

## 9. What I could not establish

1. **UNKNOWN — whether `android/keystore.properties` is present now.** Not looked for; not needed to
   date the bundle, which is provably signed.
2. **UNKNOWN — whether anything has ever been uploaded to Play.** Decides whether `versionCode 1` is
   usable.
3. **UNKNOWN — whether Play accepts the 24-bit `icon-512.png`.**
4. **UNKNOWN — whether photo upload works on a device.** Static reading only.
5. **UNKNOWN — what is currently deployed to `www.hatchgrab.com`.** This matters more than the bundle,
   because the bundle is a shell around it, and I did not check the live deploy.
6. **NOT OBSERVED — the bundle was not installed, opened or exercised.**

---

## Appendix A — verbatim command output

<details><summary><code>git status --porcelain=v1 -uall</code> — 186 lines</summary>

```
 M .gitignore
 M android/app/build.gradle
 M android/app/src/main/AndroidManifest.xml
 M android/app/src/main/java/com/hatchgrab/app/MainActivity.java
 M android/app/src/main/res/drawable-land-hdpi/splash.png
 M android/app/src/main/res/drawable-land-mdpi/splash.png
 M android/app/src/main/res/drawable-land-xhdpi/splash.png
 M android/app/src/main/res/drawable-land-xxhdpi/splash.png
 M android/app/src/main/res/drawable-land-xxxhdpi/splash.png
 M android/app/src/main/res/drawable-port-hdpi/splash.png
 M android/app/src/main/res/drawable-port-mdpi/splash.png
 M android/app/src/main/res/drawable-port-xhdpi/splash.png
 M android/app/src/main/res/drawable-port-xxhdpi/splash.png
 M android/app/src/main/res/drawable-port-xxxhdpi/splash.png
 M android/app/src/main/res/drawable/splash.png
 M android/app/src/main/res/mipmap-hdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
 M android/app/src/main/res/mipmap-mdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
 M android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
 M android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
 M android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
 M android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
 M android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
 M app/admin/page.tsx
 M app/api/admin/route.ts
 M app/api/manage/route.ts
 M app/api/native/bind-device/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/kds/[kds_token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M app/layout.tsx
 M app/manage/[token]/page.tsx
 M app/providers.tsx
 M capacitor.config.ts
 M components/TruckListCard.tsx
 M components/dashboard/types.ts
 M components/manage/primitives.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/native/VanMenuChooser.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M ios/App/App/Info.plist
 M lib/features.ts
 M lib/generateQRCode.ts
 M lib/native/device.ts
 M lib/native/notifications.ts
 M lib/native/signOut.ts
 M lib/plan-features.ts
 M lib/ratelimit.ts
 M package-lock.json
 M package.json
 M proxy.ts
 M public/apple-touch-icon.png
 M public/favicon.ico
 M public/icons/icon-192.png
 M public/icons/icon-512.png
 M public/manifest.json
 M vercel.json
?? android/SIGNING.md
?? android/app/src/main/res/drawable-hdpi/ic_stat_hatchgrab.png
?? android/app/src/main/res/drawable-mdpi/ic_stat_hatchgrab.png
?? android/app/src/main/res/drawable-xhdpi/ic_stat_hatchgrab.png
?? android/app/src/main/res/drawable-xxhdpi/ic_stat_hatchgrab.png
?? android/app/src/main/res/drawable-xxxhdpi/ic_stat_hatchgrab.png
?? android/keystore.properties.example
?? app/api/cron/custom-domain-check/route.ts
?? app/api/embed/events/route.ts
?? app/domain/page.tsx
?? app/embed/[slug]/EmbedSchedule.tsx
?? app/o/[slug]/page.tsx
?? app/trucks/[slug]/order/layout.tsx
?? components/auth/SessionAlertBanner.tsx
?? components/dashboard/CustomDomainSetup.tsx
?? components/embed/EmbedParts.tsx
?? content/store-listing.md
?? docs/android-ble-permissions-report.md
?? docs/android-bottom-inset-report.md
?? docs/android-capability-audit-report.md
?? docs/android-edge-to-edge-report.md
?? docs/android-icons-report.md
?? docs/android-inventory-report.md
?? docs/android-notification-fixes-report.md
?? docs/android-signing-report.md
?? docs/android-submission-diagnosis-report.md
?? docs/android-tester-truck-plan-report.md
?? docs/bind-device-error-surfacing-report.md
?? docs/bind-device-truck-guard-report.md
?? docs/build-inventory-report.md
?? docs/camera-usage-description-report.md
?? docs/cap-filter-parse-check-report.md
?? docs/cross-truck-van-binding-report.md
?? docs/custom-domain-actions-audit.md
?? docs/custom-domain-address-field-report.md
?? docs/custom-domain-audit-fix-report.md
?? docs/custom-domain-card-copy-report.md
?? docs/custom-domain-centre-report.md
?? docs/custom-domain-confirm-card-report.md
?? docs/custom-domain-copy-audit.md
?? docs/custom-domain-copy-cut-report.md
?? docs/custom-domain-corrections-report.md
?? docs/custom-domain-fixed-prefix-report.md
?? docs/custom-domain-identity-report.md
?? docs/custom-domain-input-fixes-report.md
?? docs/custom-domain-investigation.md
?? docs/custom-domain-labels-report.md
?? docs/custom-domain-modal-report.md
?? docs/custom-domain-monitoring-report.md
?? docs/custom-domain-one-press-report.md
?? docs/custom-domain-provider-steps-report.md
?? docs/custom-domain-provisioning-report.md
?? docs/custom-domain-security-report.md
?? docs/custom-domain-serving-report.md
?? docs/custom-domain-turn-off-copy-report.md
?? docs/custom-domain-turn-off-report.md
?? docs/custom-domain-two-buttons-report.md
?? docs/custom-domain-wizard-copy-report.md
?? docs/custom-domain-www-guard-report.md
?? docs/custom-host-static-assets-report.md
?? docs/deny-by-default-report.md
?? docs/domain-fallback-label-report.md
?? docs/domain-fallback-link-report.md
?? docs/embed-removal-final-report.md
?? docs/embed-removal-qr-report.md
?? docs/favicon-report.md
?? docs/kds-token-exchange-report.md
?? docs/landing-alt-comment-report.md
?? docs/landing-logo-alt-report.md
?? docs/landing-testimonial-italic-report.md
?? docs/landing-testimonial-report.md
?? docs/landing-testimonial-style-report.md
?? docs/menu-copy-plan-report.md
?? docs/menu-copy-sql-report.md
?? docs/operator-auth-investigation-report.md
?? docs/plan-features-row-report.md
?? docs/pre-reply-tree-check-report.md
?? docs/qr-redirect-fix-report.md
?? docs/qr-redirect-split-report.md
?? docs/qr-redirect-trace-report.md
?? docs/qr-settings-layout-report.md
?? docs/qr-settings-preview-report.md
?? docs/rls-access-audit-report.md
?? docs/schedule-page-trace-report.md
?? docs/session-resilience-report.md
?? docs/template-create-proof-report.md
?? docs/tester-truck-provisioning-report.md
?? docs/token-exposure-investigation-report.md
?? docs/truck-profile-not-found-report.md
?? docs/website-embed-build-report.md
?? docs/website-embed-corrections-report.md
?? docs/website-embed-detection-report.md
?? docs/website-embed-links-report.md
?? docs/website-embed-read-report.md
?? docs/website-embed-report.md
?? docs/website-embed-wizard-report.md
?? docs/whatsapp-reply-cap-report.md
?? docs/whatsapp-reply-cap-v2-report.md
?? docs/wizard-move-report.md
?? docs/wizard-placement-report.md
?? ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme
?? lib/audit/pseudonymise.ts
?? lib/auth/session-observer.ts
?? lib/custom-domain/apex.ts
?? lib/custom-domain/cadence.ts
?? lib/custom-domain/copy.ts
?? lib/custom-domain/dns.ts
?? lib/custom-domain/redirect-target.ts
?? lib/custom-domain/vercel.ts
?? lib/custom-host.ts
?? lib/native/notificationIcon.ts
?? lib/whatsapp/reply-cap.ts
?? scripts/check-plain-english.mjs
?? supabase/migrations/20260826_trucks_embed_enabled.sql
?? supabase/migrations/20260826_trucks_embed_plan_answer.sql
?? supabase/migrations/20260826_trucks_embed_seen.sql
?? supabase/migrations/20260827_trucks_custom_domain.sql
?? supabase/migrations/20260827_trucks_custom_domain_monitor.sql
?? supabase/migrations/20260827_trucks_custom_domain_setup.sql
```
</details>

<details><summary><code>git diff --stat</code></summary>

```
 .gitignore                                         |    9 +
 android/app/build.gradle                           |   41 +
 android/app/src/main/AndroidManifest.xml           |   58 +-
 .../main/java/com/hatchgrab/app/MainActivity.java  |  292 +-
 .../app/src/main/res/drawable-land-hdpi/splash.png |  Bin 7705 -> 4235 bytes
 .../app/src/main/res/drawable-land-mdpi/splash.png |  Bin 4040 -> 2414 bytes
 .../src/main/res/drawable-land-xhdpi/splash.png    |  Bin 9251 -> 8079 bytes
 .../src/main/res/drawable-land-xxhdpi/splash.png   |  Bin 13984 -> 11981 bytes
 .../src/main/res/drawable-land-xxxhdpi/splash.png  |  Bin 17683 -> 17516 bytes
 .../app/src/main/res/drawable-port-hdpi/splash.png |  Bin 7934 -> 4561 bytes
 .../app/src/main/res/drawable-port-mdpi/splash.png |  Bin 4096 -> 2598 bytes
 .../src/main/res/drawable-port-xhdpi/splash.png    |  Bin 9875 -> 8479 bytes
 .../src/main/res/drawable-port-xxhdpi/splash.png   |  Bin 13346 -> 12269 bytes
 .../src/main/res/drawable-port-xxxhdpi/splash.png  |  Bin 17489 -> 18567 bytes
 android/app/src/main/res/drawable/splash.png       |  Bin 4040 -> 2414 bytes
 .../app/src/main/res/mipmap-hdpi/ic_launcher.png   |  Bin 2786 -> 839 bytes
 .../res/mipmap-hdpi/ic_launcher_foreground.png     |  Bin 3450 -> 1405 bytes
 .../src/main/res/mipmap-hdpi/ic_launcher_round.png |  Bin 4341 -> 839 bytes
 .../app/src/main/res/mipmap-mdpi/ic_launcher.png   |  Bin 1869 -> 543 bytes
 .../res/mipmap-mdpi/ic_launcher_foreground.png     |  Bin 2110 -> 946 bytes
 .../src/main/res/mipmap-mdpi/ic_launcher_round.png |  Bin 2725 -> 543 bytes
 .../app/src/main/res/mipmap-xhdpi/ic_launcher.png  |  Bin 3981 -> 1082 bytes
 .../res/mipmap-xhdpi/ic_launcher_foreground.png    |  Bin 5036 -> 1904 bytes
 .../main/res/mipmap-xhdpi/ic_launcher_round.png    |  Bin 6593 -> 1082 bytes
 .../app/src/main/res/mipmap-xxhdpi/ic_launcher.png |  Bin 6644 -> 1633 bytes
 .../res/mipmap-xxhdpi/ic_launcher_foreground.png   |  Bin 9793 -> 3063 bytes
 .../main/res/mipmap-xxhdpi/ic_launcher_round.png   |  Bin 10455 -> 1633 bytes
 .../src/main/res/mipmap-xxxhdpi/ic_launcher.png    |  Bin 9441 -> 2155 bytes
 .../res/mipmap-xxxhdpi/ic_launcher_foreground.png  |  Bin 15529 -> 4291 bytes
 .../main/res/mipmap-xxxhdpi/ic_launcher_round.png  |  Bin 15916 -> 2155 bytes
 app/admin/page.tsx                                 |  102 +-
 app/api/admin/route.ts                             |    2 +-
 app/api/manage/route.ts                            |  719 +++-
 app/api/native/bind-device/route.ts                |   55 +-
 app/api/webhooks/meta/whatsapp/route.ts            |  194 +-
 app/dashboard/[token]/kds/page.tsx                 |   34 +-
 app/dashboard/[token]/page.tsx                     |   31 +-
 app/kds/[kds_token]/page.tsx                       |   45 +-
 app/landing/landing.css                            |   63 +-
 app/landing/page.tsx                               |   47 +-
 app/layout.tsx                                     |   43 +-
 app/manage/[token]/page.tsx                        |  652 ++-
 app/providers.tsx                                  |   69 +-
 capacitor.config.ts                                |   24 +-
 components/TruckListCard.tsx                       |  103 +-
 components/dashboard/types.ts                      |   16 +
 components/manage/primitives.tsx                   |   11 +-
 components/native/OperatorDeviceConfig.tsx         |   53 +-
 components/native/VanMenuChooser.tsx               |   16 +-
 docs/reference-manual.md                           | 4526 +++++++++++++++++++-
 ios/App/App.xcodeproj/project.pbxproj              |    5 +-
 ios/App/App/Info.plist                             |    2 +
 lib/features.ts                                    |   12 +
 lib/generateQRCode.ts                              |   83 +-
 lib/native/device.ts                               |   64 +-
 lib/native/notifications.ts                        |   22 +-
 lib/native/signOut.ts                              |    9 +
 lib/plan-features.ts                               |   45 +-
 lib/ratelimit.ts                                   |  125 +
 package-lock.json                                  |   22 +-
 package.json                                       |    2 +
 proxy.ts                                           |  130 +-
 public/apple-touch-icon.png                        |  Bin 2066 -> 3161 bytes
 public/favicon.ico                                 |  Bin 1719 -> 1860 bytes
 public/icons/icon-192.png                          |  Bin 2337 -> 3367 bytes
 public/icons/icon-512.png                          |  Bin 7141 -> 10352 bytes
 public/manifest.json                               |   17 +-
 vercel.json                                        |   22 +
 68 files changed, 7413 insertions(+), 352 deletions(-)
```
</details>

---

**No span of this prompt arrived garbled.** One instruction pair needed resolving rather than choosing
blindly — *"generate a fresh merged manifest"* against *"change no file"* — and the resolution is stated
at the top: a debug-only Gradle task writing into a gitignored directory, with `git status` proven
identical before and after. **If that is not acceptable, §4 is the only section affected.**
