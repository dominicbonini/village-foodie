# iPad build — INSTALLED ON THE DEVICE, and push is signed

Date: 14 August 2026
## ✅ **THE APP IS ON THE iPAD. `BUILD SUCCEEDED`, install exit 0.**
## 🔴 **`aps-environment = development` IS SIGNED INTO THE BINARY. This has never once been true before.**
## ✅ **`PrivacyInfo.xcprivacy` SHIPPED INSIDE `App.app`.**

**No archive. No upload. No capability, entitlement or bundle id changed. No file edited.**

---

# ⚠️ FLAG — THE PROMPT ENDED MID-SENTENCE

The final instruction arrived truncated:

> *"FINALLY: write your full report to docs/ipad-build-report.md, overwriting whatever is there.
> **Then in chat, give me**"*

**It stops there.** I have not guessed at anything new: the report is written to the named file, and in
chat I have followed **the convention every previous task in this sequence set** — a two-line summary,
confirmation the file is written, and the report filename as the last sentence. **If you wanted
something else in chat, say so and I will redo just that part.** Nothing about the work itself depended
on the missing words.

**No instruction contradicted another.**

---

# PART A — UNINSTALL

## A1. The uninstall — full output

**Your diagnosis was right, and the pre-state confirms it. Before removing anything, the old app was
there:**
```
$ xcrun devicectl device info apps --device 00008101-0012045A1E93001E
HatchGrab   com.hatchgrab.app   1.0       1
```

```
$ xcrun devicectl device uninstall app --device 00008101-0012045A1E93001E com.hatchgrab.app
21:47:16  Acquired tunnel connection to device.
21:47:16  Enabling developer disk image services.
21:47:16  Acquired usage assertion.
App uninstalled.
--- EXIT: 0 ---
```

✅ **`devicectl` reached the device on the first attempt.** No fallback was needed and none was tried.

## A2. ✅ Confirmed gone BEFORE rebuilding

```
$ xcrun devicectl device info apps --device 00008101-0012045A1E93001E | grep -i hatchgrab
(no match — grep exit 1)

$ xcrun devicectl device info apps --device 00008101-0012045A1E93001E
21:47:24  Acquired tunnel connection to device.
21:47:24  Enabling developer disk image services.
21:47:24  Acquired usage assertion.
Apps installed:
```
🔴 **The list is empty and `com.hatchgrab.app` is absent.** Checked as a separate command **after** the
uninstall and **before** the build — not inferred from the uninstall's own exit code.

⚠️ **This wiped the app's local data with it** — the Capacitor Preferences store (offline outbox, device
config, `hg_notify_*` keys) and the WebView's `localStorage`. **That is unavoidable on a team-prefix
change, and it matters for the checklist: the session-persistence test starts from a clean slate, so a
login will be required before it can be run at all.**

---

# PART B — REBUILD AND INSTALL

## B1. ✅ `** BUILD SUCCEEDED **` — exit 0, no errors

```
$ xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
    -destination "id=0CAE0CE1-AA6E-597A-9F05-415298DAA638" -allowProvisioningUpdates build
EXIT CODE: 0
…
CodeSign …/Build/Products/Debug-iphoneos/App.app (in target 'App' from project 'App')
    /usr/bin/codesign --force --sign 81D601B40010D5A255A2E651A7515BB2D4AD7685 \
      --entitlements …/App.build/App.app.xcent --timestamp=none --generate-entitlement-der \
      …/Build/Products/Debug-iphoneos/App.app

Validate …/Build/Products/Debug-iphoneos/App.app (in target 'App' from project 'App')
    builtin-validationUtility …/App.app -shallow-bundle -infoplist-subpath Info.plist

** BUILD SUCCEEDED **
```

🔴 **`CodeSign` RAN WITH `--entitlements`, AND THAT IS THE STEP EVERY PREVIOUS ATTEMPT DIED BEFORE
REACHING.** The three earlier failures all stopped at `GatherProvisioningInputs`. **There are no errors
and no warnings in the log.**

**And the install:**
```
$ xcrun devicectl device install app --device 00008101-0012045A1E93001E \
    …/Build/Products/Debug-iphoneos/App.app
21:47:47  Acquired tunnel connection to device.
21:47:47  Enabling developer disk image services.
21:47:47  Acquired usage assertion.
App installed:
• bundleID: com.hatchgrab.app
• installationURL: file:///private/var/containers/Bundle/Application/FFE6EE8F-48E0-4287-B576-7FF68C775398/App.app/
• launchServicesIdentifier: unknown
• databaseUUID: FA5A847D-C164-4040-97AA-D4EADE0C4A8F
• databaseSequenceNumber: 1396
--- EXIT: 0 ---
```

✅ **No `MIInstallerErrorDomain 64`. No `MismatchedApplicationIdentifierEntitlement`.** Removing the old
`UD5438FTG9`-signed copy was the whole fix, exactly as you diagnosed.

**Confirmed present afterwards:**
```
$ xcrun devicectl device info apps --device 00008101-0012045A1E93001E | grep -i hatchgrab
HatchGrab   com.hatchgrab.app   1.0       1
```

## B2. ✅ No archive. No upload. **No capability, entitlement or bundle id changed.**

`com.hatchgrab.app` is unchanged, both `.entitlements` files are untouched, and **no file was edited at
all** — see D1.

---

# PART C — THE PAYOFF

## C1. 🔴 **`aps-environment` = `development`. PRESENT. PROVEN TWICE.**

### The profile actually embedded in the built app

Not a profile from the portal, not one from a directory — **the `embedded.mobileprovision` inside the
`App.app` that is now on the iPad.** Decoded:

```
  Name            : iOS Team Provisioning Profile: com.hatchgrab.app
  TeamName        : HATCHGRAB LTD
  TeamIdentifier  : ['C24X5FG48V']
  UUID            : 3c878edf-34c0-4e46-af6b-c310321c1cb7
  CreationDate    : 2026-08-14 20:45:18
  ExpirationDate  : 2027-08-14 20:45:18
  Platform        : ['iOS', 'xrOS', 'visionOS']
  ProvisionedDevs : 1  ['00008101-0012045A1E93001E']

  === ENTITLEMENTS IN THE PROFILE ===
    application-identifier                         = 'C24X5FG48V.com.hatchgrab.app'
    aps-environment                                = 'development'
    com.apple.developer.team-identifier            = 'C24X5FG48V'
    get-task-allow                                 = True
    keychain-access-groups                         = ['C24X5FG48V.*', 'com.apple.token']
```

> ### 🔴 `aps-environment : development`
> **Expected value, actual value. Present, not absent.**

### The second proof — what `codesign` actually stamped into the binary

**A profile only says what is *permitted*.** This is what was *signed*:

```
$ codesign -d --entitlements :- App.app
<dict>
	<key>application-identifier</key>
	<string>C24X5FG48V.com.hatchgrab.app</string>
	<key>aps-environment</key>
	<string>development</string>
	<key>com.apple.developer.team-identifier</key>
	<string>C24X5FG48V</string>
	<key>get-task-allow</key>
	<true/>
</dict>
```

🔴 **THE PUSH ENTITLEMENT IS IN THE SIGNED BINARY ON THE DEVICE. This is the thing that has never once
been established** — every prior artefact, including the two profiles I decoded from the failed builds,
had `aps-environment` **absent**.

### The before/after that settles §36

| | Personal team (16 Jul and 3 Aug builds) | **Now** |
|---|---|---|
| TeamName | `Dominic Bonini` | ✅ **`HATCHGRAB LTD`** |
| TeamIdentifier | `UD5438FTG9` | ✅ **`C24X5FG48V`** |
| Validity | **7 days** | ✅ **1 year** (14 Aug 2026 → 14 Aug 2027) |
| **`aps-environment`** | 🔴 **ABSENT** | 🔴 **`development`** |

✅ **`ProvisionedDevices` contains exactly one entry — `00008101-0012045A1E93001E`, this iPad.** The
device registration that blocked the last run went through during this build.

⚠️ **THIS IS A DEBUG BUILD, SO THE TOKEN WILL BE A SANDBOX TOKEN.** The entitlement says `development`,
which is correct for Xcode-to-device. **`APNS_ENV` must NOT be `production`** or `api.push.apple.com`
returns `BadDeviceToken` — and §36 records that `/api/orders/submit` **NULLs `push_token`** on that
error, so the evidence erases itself. **I have not read or changed any environment variable.**
🔴 **Release builds use `AppRelease.entitlements` with `production`, and that path is still unexercised.**

## C2. `application-identifier` and `keychain-access-groups`, from the same profile

```
    application-identifier      = 'C24X5FG48V.com.hatchgrab.app'
    keychain-access-groups      = ['C24X5FG48V.*', 'com.apple.token']
```

✅ **The `application-identifier` prefix is `C24X5FG48V`** — this is precisely the value that clashed
with the installed `UD5438FTG9.com.hatchgrab.app` and produced
`MismatchedApplicationIdentifierEntitlement`. **The bundle id itself, `com.hatchgrab.app`, is unchanged
on both sides; only the team prefix moved**, which is why uninstalling was the correct fix and changing
the bundle id would have been the wrong one.

⚠️ **`keychain-access-groups` appears in the PROFILE but NOT in the signed entitlements** above. **That
is normal and not a defect** — the profile lists what the team *may* use; the `.xcent` carries only what
the app *requests*, and nothing in this app requests a keychain group. `com.apple.token` is Apple's
standard entry.

## C3. ✅ `PrivacyInfo.xcprivacy` SHIPPED — it is inside the built bundle

**The full listing of `App.app`, which is the proof:**
```
$ ls -la …/Build/Products/Debug-iphoneos/App.app/
total 2608
-rwxr-xr-x@  1 dominicbonini  staff    92480 Aug 14 21:47 App
-rwxr-xr-x@  1 dominicbonini  staff  1108720 Aug 14 21:47 App.debug.dylib
-rw-r--r--   1 dominicbonini  staff     2296 Aug  3 12:45 AppIcon60x60@2x.png
-rw-r--r--   1 dominicbonini  staff     2826 Aug  3 12:45 AppIcon76x76@2x~ipad.png
-rw-r--r--   1 dominicbonini  staff    46168 Aug  3 12:45 Assets.car
drwxr-xr-x   4 dominicbonini  staff      128 Aug  5 20:56 Base.lproj
drwxr-xr-x   4 dominicbonini  staff      128 Aug  3 12:38 Frameworks
-rw-r--r--   1 dominicbonini  staff     1511 Aug 14 21:45 Info.plist
-rw-r--r--   1 dominicbonini  staff        8 Aug  3 12:38 PkgInfo
-rw-r--r--   1 dominicbonini  staff      292 Aug 14 21:45 PrivacyInfo.xcprivacy   <-- SHIPPED
drwxr-xr-x   3 dominicbonini  staff       96 Aug  3 12:38 _CodeSignature
-rwxr-xr-x@  1 dominicbonini  staff    35024 Aug 14 21:47 __preview.dylib
-rw-r--r--   1 dominicbonini  staff      931 Aug 14 21:45 capacitor.config.json
-rw-r--r--   1 dominicbonini  staff      185 Aug 14 21:45 config.xml
-rw-r--r--   1 dominicbonini  staff    12406 Aug 14 21:45 embedded.mobileprovision
drwxr-xr-x   4 dominicbonini  staff      128 Aug 14 21:45 public
```

🔴 **THE FOUR HAND-AUTHORED `PBXResourcesBuildPhase` LINES DID THEIR JOB.** The registration was never
verified by a build until now — `docs/privacy-manifest-report.md` said in terms that *"a manifest that
lints is not a manifest that passes"*, and that its presence in the bundle was **INFERRED** from the
Resources phase. **It is no longer inferred.**

⚠️ **THE SIZE CHANGED AND THAT IS CORRECT, NOT A WRONG FILE: 4,763 bytes in source → 292 in the
bundle.** Xcode compiles plists on copy, stripping the long XML comments that record the audit. **The
content is intact — verified by parsing the SHIPPED copy, not the source:**
```
$ plutil -lint  App.app/PrivacyInfo.xcprivacy      ->  OK
$ plutil -convert json -o - App.app/PrivacyInfo.xcprivacy
{
    "NSPrivacyCollectedDataTypes": [],
    "NSPrivacyTrackingDomains": [],
    "NSPrivacyTracking": false,
    "NSPrivacyAccessedAPITypes": [
        { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults",
          "NSPrivacyAccessedAPITypeReasons": ["CA92.1"] }
    ]
}
```
✅ **Exactly the four keys, the one declared category, and the `CA92.1` reason code.**

---

# PART D — INTEGRITY

## D1. 🔴 **NO FILE WAS EDITED.** Stated plainly, as D1 allows.

**This task ran four device/build commands and a set of read-only inspections. Nothing was written to
the repository.** `project.pbxproj` is still `sha256 37ab01848404c6ee…` — byte-identical to its state
before this task, which was the previous task's `DEVELOPMENT_TEAM` edit.

**Because no file was edited, there is nothing to byte-scan.** For completeness, the two files this
sequence has touched were re-verified anyway and both remain clean: `project.pbxproj` and
`PrivacyInfo.xcprivacy` — **NUL = 0, control bytes < 0x09 = 0**, and both still `plutil -lint: OK`.

**What DID change is outside the repository:** the iPad's installed app, the macOS keychain (the
`C24X5FG48V` certificate), a new provisioning profile, and DerivedData.

## D2. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/(legal)/layout.tsx
 M app/contact/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/shared/AppHeader.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M ios/App/App/Info.plist
 M lib/plan-features.ts
 M package.json
?? components/shared/BrandHomeLink.tsx
?? docs/appstore-completeness-report.md
?? docs/appstore-report.md
?? docs/brand-home-link-report.md
?? docs/completeness-sweep-report.md
?? docs/dependency-pin-report.md
?? docs/ipad-build-report.md
?? docs/presubmission-housekeeping-report.md
?? docs/privacy-manifest-report.md
?? ios/App/App/PrivacyInfo.xcprivacy

$ git diff --stat
 app/(legal)/layout.tsx                |  54 +++-
 app/contact/page.tsx                  |  14 +-
 app/dashboard/[token]/page.tsx        |  25 +-
 app/manage/[token]/page.tsx           |  50 ++--
 components/shared/AppHeader.tsx       |  28 +-
 docs/reference-manual.md              | 512 +++++++++++++++++++++++++++++++++-
 ios/App/App.xcodeproj/project.pbxproj |   8 +-
 ios/App/App/Info.plist                |  16 ++
 lib/plan-features.ts                  |  14 +-
 package.json                          |  24 +-
 10 files changed, 677 insertions(+), 68 deletions(-)
```

✅ **Identical to before this task began.** Every entry is earlier work. **Nothing was committed.**

---

# 🔴 NOW RUN THIS BY HAND — I cannot see the device

> **THE SHELL LOADS PRODUCTION — `https://www.hatchgrab.com/app`.** Everything in that `git status` is
> **uncommitted and undeployed**, so **none of it is on the iPad**: not the `BrandHomeLink` refactor,
> not the non-navigating logos, not the Auto-replies removal, not the `coming_soon` matrix row.
> **If you look for those and they are absent, that is CORRECT, not a build failure.** What this build
> can prove is native-layer only.
>
> ⚠️ **THE UNINSTALL WIPED LOCAL DATA.** You will have to log in again, and item 4 cannot be tested
> until you have.

### 1. The launch screen — what appears, and for how long

Force-quit, then launch cold. **Time it roughly.**
- 🔴 **EXPECTED, AND IT IS A KNOWN DEFECT: a WHITE screen with the CAPACITOR framework's blue "X"
  logo** — the unmodified scaffold (`docs/presubmission-housekeeping-report.md`).
- **PASS =** that splash **briefly**, then near-black `#1C1C1E`, then dark `slate-900` "Loading…", then
  the dashboard.
- **FAILURE =** the white splash **persists for seconds**, or white **reappears** after a dark screen,
  or it sticks on "Loading…".
- ⚠️ **Count the distinct background colours.** The prediction is four and has never been observed.

### 2. 🔴 APNs token → `van_devices.push_token` — THE ONE THAT MATTERS

Launch, log in, **accept the notification prompt**. Then:
`select device_id, platform, push_token, last_seen from van_devices order by last_seen desc limit 5;`
- **PASS =** a row with `platform = 'ios'` and a **non-null `push_token` of ~64 hex characters**.
- **FAILURE (a) =** no permission prompt → registration never started.
- **FAILURE (b) =** prompt accepted, `push_token` still **NULL** → it never reached
  `/api/native/bind-device`.
- **FAILURE (c) =** it was populated and is **NULL again** → 🔴 wiped by `BadDeviceToken`.
  **CHECK THE ROW BEFORE PLACING ANY TEST ORDER.**
- ✅ **The entitlement is now proven signed (C1), so if no token arrives the cause is JS-side or
  server-side — it is no longer the signing.** That is a genuinely new diagnostic position.

### 3. Face ID / Touch ID unlock

Enable the app lock, background, return.
- **PASS =** the biometric prompt appears reading **"Unlock HatchGrab with Face ID."** and unlocks.
- **FAILURE (a) =** 🔴 **the app CRASHES** → `NSFaceIDUsageDescription` did not ship (it is in source).
- **FAILURE (b) =** no prompt, straight to the backup PIN.
- ⚠️ **iPad (10th generation) has TOUCH ID in the power button, not Face ID** — expect a Touch ID
  prompt. **That is correct.** Only the string says Face ID; worth noting for App Store copy.

### 4. 🔴 Session survives force-quit (WKWebView `localStorage`)

**Log in first** (the uninstall cleared everything). Then **force-quit from the app switcher** — not
background — wait ten seconds, relaunch cold.
- **PASS =** straight back to the dashboard or KDS, **no login prompt**.
- **FAILURE =** it lands on **`/login`** → 🔴 the session did not persist.
- ⚠️ **Also check it reopens the screen you left it on** (§11 restart-to-last-screen). **Landing on the
  dashboard when you left it on KDS is a different defect from being logged out.**

### 5. The two open iPad display defects

Scroll down and back up on **Orders, Menu, Settings**, then **+ Add order**.
- **(a)** right-hand strip goes blank when scrolled, **recovers** at the top.
- **(b)** header disappears on scroll and **does not recover** until relaunch.
- **PASS = neither reproduces. FAILURE = either does** — and **note which tabs**, because §27 records
  Add Order as immune (`<main>` is `overflow-hidden`), and **that four-for-four match is the strongest
  structural clue there is.** If Add Order shows it too, that finding is dead.

---

# WHAT IS STILL NOT PROVEN

1. 🔴 **No APNs token has been obtained.** The entitlement is signed; **a token is a different fact** and
   only item 2 above can establish it.
2. 🔴 **Nothing on the checklist has been observed.** I cannot see the screen.
3. **The Release/`production` APNs path is unexercised** — this is a Debug build with the `development`
   entitlement.
4. **No archive, no upload, no App Store validation.** ⚠️ **The privacy manifest is proven to SHIP; it
   is not proven to SATISFY Apple.** ITMS-91053 is only ever cleared by an upload.
5. **The app has not been launched even once** — install is not run.
