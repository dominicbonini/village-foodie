# Privacy manifest — audit, file, and target registration

Date: 14 August 2026
Status: AUDITED, then ONE FILE CREATED, then ONE XCODE CHANGE.
**Created:** `ios/App/App/PrivacyInfo.xcprivacy` · **Edited:** `ios/App/App.xcodeproj/project.pbxproj`
`plutil -lint` **OK** on both. **0 NUL bytes, 0 control bytes < 0x09.**

No `next dev`, no `next build`, no `cap sync`, no build, no archive, no deploy, no commit.

🔴 **iOS-ONLY BY CONSTRUCTION.** Both files are under `ios/`, which §11 records as one of only two
genuinely native-only paths — *"Next/Vercel ignore them, so they are inert even sitting on `main`."*
**Nothing here can reach the web app or Android. Pizzeria Gusto and Tikka Tonic are untouched**, and no
web or Android behaviour changed — verified by `git diff --stat`: the only non-doc file added or changed
outside the earlier tasks' four is `ios/App/App.xcodeproj/project.pbxproj`.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

---

# PART A — WHICH REQUIRED-REASON APIS DOES THIS APP ACTUALLY TOUCH?

## A1. The app's own native source — 🔴 **ZERO HITS IN ALL FIVE CATEGORIES**

**READ.** The complete native source under `ios/App`, excluding Pods (which does not exist — this is SPM):

```
ios/App/App/AppDelegate.swift
ios/App/App/HGBridgeViewController.swift
ios/App/CapApp-SPM/Package.swift
ios/App/CapApp-SPM/Sources/CapApp-SPM/CapApp-SPM.swift
```

Searched across all four for every symbol in the five categories:

| Symbol | Hits |
|---|---|
| `UserDefaults` / `NSUserDefaults` | **0** |
| `FileManager`, `attributesOfItem`, `modificationDate`, `creationDate`, `contentModificationDate` | **0** |
| `volumeAvailableCapacity`, `systemFreeSize` | **0** |
| `systemUptime`, `mach_absolute_time`, `bootTime`, `kern.boottime` | **0** |
| `activeInputModes` | **0** |

**`AppDelegate.swift` is the stock Capacitor scaffold** — its only non-empty methods delegate to
`ApplicationDelegateProxy.shared`. Its complete import list is `UIKit`, `Capacitor`;
`HGBridgeViewController.swift` adds `WebKit` and `Network`. **No Foundation storage or filesystem API is
reached from the app's own code.**

## A2. All twelve Capacitor packages — 🔴 **EXACTLY ONE HIT, IN ONE PACKAGE**

**READ.** Every package from `package.json`, with its native file count:

| Package | Swift/ObjC files | Required-reason hits |
|---|---|---|
| `@aparajita/capacitor-biometric-auth` | 2 | **none** |
| `@capacitor-community/keep-awake` | 3 | **none** |
| `@capacitor/android` | 0 | n/a — Android |
| `@capacitor/app` | 3 | **none** |
| `@capacitor/cli` | 0 | n/a — tooling |
| `@capacitor/core` | 0 | n/a — JS only |
| `@capacitor/ios` | 67 | **none** (see the two near-misses below) |
| `@capacitor/local-notifications` | 4 | **none** |
| `@capacitor/network` | 5 | **none** |
| 🔴 **`@capacitor/preferences`** | 4 | 🔴 **UserDefaults ×6** |
| `@capacitor/push-notifications` | 4 | **none** |
| `@capacitor/status-bar` | 7 | **none** |

### 🔴 The one that hits — `@capacitor/preferences`

**READ**, `node_modules/@capacitor/preferences/ios/Sources/PreferencesPlugin/Preferences.swift:18-20`:
```swift
    private var defaults: UserDefaults {
        return UserDefaults.standard
    }
```
and its use, `:31-45`:
```swift
    private var rawKeys: [String] {
        return defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix(prefix) }
    }
    …
    public func get(by key: String) -> String? {
        return defaults.string(forKey: applyPrefix(to: key))
    }

    public func set(_ value: String, for key: String) {
        defaults.set(value, forKey: applyPrefix(to: key))
    }
```
plus a legacy-migration path, `PreferencesPlugin.swift:89, 93, 112, 114`:
```swift
        let oldKeys = UserDefaults.standard.dictionaryRepresentation().keys.filter { $0.hasPrefix(oldPrefix) }
            let value = UserDefaults.standard.string(forKey: oldKey) ?? ""
            UserDefaults.standard.removeObject(forKey: oldKey)
```

✅ **The expectation in the brief is CONFIRMED, not assumed** — and §11 explains why it matters:
`@capacitor/preferences` is the backing store for the offline outbox (*"Capacitor Preferences is the
INTERIM store… survives a hard app-kill via the NSUserDefaults plist"*).

### ⚠️ Two near-misses in `@capacitor/ios` that are NOT required-reason APIs

Both found by a deliberately broader second sweep, and **both correctly excluded**:

1. **`FileManager.default.fileExists` / `removeItem` / `createDirectory`** — `JSExport.swift:194`,
   `CAPBridgeViewController.swift:172`, `CapacitorBridge.swift:178`, `KeyValueStore.swift:203/220/247`,
   `CAPInstanceDescriptor.swift:36/43`. 🔴 **FileTimestamp covers date-reading APIs** —
   `creationDate`, `modificationDate`, `contentModificationDateKey`, `attributesOfItem`, `getattrlist`,
   `stat`. **Existence, deletion and directory creation are not in the category.**
2. **`fileUrl.resourceValues(forKeys: [.fileSizeKey]).fileSize`** — `WebViewAssetHandler.swift:61`.
   🔴 **That is ONE FILE'S SIZE, not free disk space.** DiskSpace covers
   `volumeAvailableCapacityKey`, `volumeAvailableCapacityForImportantUsageKey`, `systemFreeSize`,
   `statfs`. **`fileSizeKey` is in neither category.**

⚠️ **`KeyValueStore.swift` has a `persistent(suiteName:)` backend that LOOKS like UserDefaults and is
not** — `:111-112` resolves it to `FileStore.with(name: name)`, and `:202-247` reads and writes files
under `.libraryDirectory`. **A case-insensitive grep for `userdefaults` across all 67 files of
`@capacitor/ios` returns ZERO.** The name is misleading; the implementation is files.

## A3. Which plugins ship their own manifest — **the earlier finding is CONFIRMED**

**READ.** `find node_modules -name "PrivacyInfo.xcprivacy"` returns **exactly 2**, both under
`@capacitor/ios`:

| Package | Ships a manifest? |
|---|---|
| `@capacitor/ios` | ✅ **2** — `Capacitor/Capacitor/` and `CapacitorCordova/CapacitorCordova/` |
| `@aparajita/capacitor-biometric-auth` | 🔴 **NONE** |
| `@capacitor-community/keep-awake` | 🔴 **NONE** |
| `@capacitor/app` | 🔴 **NONE** |
| `@capacitor/local-notifications` | 🔴 **NONE** |
| `@capacitor/network` | 🔴 **NONE** |
| 🔴 **`@capacitor/preferences`** | 🔴 **NONE** |
| `@capacitor/push-notifications` | 🔴 **NONE** |
| `@capacitor/status-bar` | 🔴 **NONE** |

**And the two that do exist declare nothing** — `@capacitor/ios`'s manifest, in full:
```xml
<dict>
	<key>NSPrivacyAccessedAPITypes</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyTracking</key>
	<false/>
</dict>
```

🔴 **THIS IS THE OPERATIVE CONCLUSION: the ONE package that touches a required-reason API is the ONE
that ships no manifest of its own. The declaration therefore MUST live in the app-level file.**

## A4. The final list

| Category | Triggering call | Package | Declared? |
|---|---|---|---|
| 🔴 **UserDefaults** | `UserDefaults.standard` — `.string(forKey:)`, `.set(_:forKey:)`, `.dictionaryRepresentation()`, `.removeObject(forKey:)` | `@capacitor/preferences` (`Preferences.swift:19,32,40,44`; `PreferencesPlugin.swift:89,93,112,114`) | ✅ **YES — CA92.1** |
| **FileTimestamp** | 🔴 **NO HITS ANYWHERE** | — | ❌ **NOT DECLARED** |
| **DiskSpace** | 🔴 **NO HITS ANYWHERE** | — | ❌ **NOT DECLARED** |
| **SystemBootTime** | 🔴 **NO HITS ANYWHERE** | — | ❌ **NOT DECLARED** |
| **ActiveKeyboards** | 🔴 **NO HITS ANYWHERE** | — | ❌ **NOT DECLARED** |

🔴 **Four of the five are stated as NOT FOUND and are deliberately absent from the manifest.** Declaring
a category the app does not use is its own defect, and the reasons are recorded in the file itself so the
next reader does not "complete" it.

---

# PART B — WHAT DOES THE APP BINARY COLLECT? **REPORT ONLY — NOT WRITTEN INTO THE FILE**

## B1. The push token — obtained natively, **transmitted by the WebView**

**Obtained:** by `@capacitor/push-notifications` calling APNs. 🔴 **`AppDelegate.swift` contains NO push
code at all** — no `didRegisterForRemoteNotificationsWithDeviceToken`, no `registerForRemoteNotifications`.
**READ**, the whole file is the stock scaffold. The registration is entirely inside the plugin.

**Handed to JS and transmitted — `lib/native/push.ts:72-74`. READ:**
```ts
        PushNotifications.addListener('registration', (t: { value: string }) => {
          void saveDeviceConfig(token, { push_token: t.value })
        }),
```
**and `lib/native/device.ts:61-75`:**
```ts
export async function saveDeviceConfig(
  token: string,
  patch: { van_id?: string | null; default_screen?: 'dashboard' | 'kds'; notify_enabled?: boolean; push_token?: string | null },
): Promise<DeviceConfig | null> {
  try {
    const res = await fetch('/api/native/bind-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
    })
```

## B2. 🔴 THE BINARY / WEBVIEW LINE — THE CRUX OF THIS SECTION

**§11 settles where the line falls, and it is not where the folder names suggest. READ, §11:**

> *"`lib/native/*`, `components/native/*`, `proxy.ts`, `public/sw.js` … all compile into the web bundle
> the browser (and the app's WKWebView) load… Note `lib/native/*` is imported directly by
> `app/dashboard`, `app/manage`, `app/admin`, `app/api/*` → it **IS** the web bundle (gated to no-op on
> web, but built and shipped there) — **the name is misleading**."*

| Item | Which side | Evidence |
|---|---|---|
| **APNs device token — obtaining it** | 🔴 **NATIVE BINARY** | `@capacitor/push-notifications` is compiled in; it calls APNs and receives the token |
| **APNs device token — transmitting it** | 🔴 **WEBVIEW** | `saveDeviceConfig` is a `fetch()` in `lib/native/device.ts`, which §11 says ships in the remotely-loaded web bundle |
| `device_id` (a `localStorage` UUID) | **WEBVIEW** | `getDeviceId()`, `device.ts:26-34` — `localStorage.getItem/setItem`, browser storage |
| `platform` string | **WEBVIEW** | `Capacitor.getPlatform()` read in JS and put in the same `fetch` body |
| Offline outbox contents (orders) | ⚠️ **BOTH** — stored **natively** via Preferences/NSUserDefaults, but written and read **by JS** | §11's storage decision; `lib/native/outbox.ts` is web-bundle code |
| Everything else — orders, customers, menus, payments | 🔴 **WEBVIEW** | ordinary `fetch` from the remotely-loaded site |

🔴 **THE HONEST SUMMARY: the binary itself originates ONE piece of data — the APNs token — and does not
transmit it. Everything that leaves the device leaves via JavaScript served from
`https://www.hatchgrab.com`, exactly as it would in Safari.**

⚠️ **THIS DISTINCTION IS ARGUABLE AND IS NOT MINE TO SETTLE.** Apple's privacy manifest describes the
*binary*; the App Store Connect questionnaire describes the *app as a product*, and a reviewer is
unlikely to accept "our website collected it" as meaning the app did not. **Both readings are recorded
so the decision is made on the facts.**

## B3. Tracking, as Apple defines it — 🔴 **NONE FOUND**

**READ.** The native binary's complete import surface:
```
AppDelegate.swift            : import UIKit, import Capacitor
HGBridgeViewController.swift : import UIKit, import WebKit, import Network, import Capacitor
```
**A search of `ios/` for `firebase|analytics|adjust|appsflyer|amplitude|posthog|segment|mixpanel|facebook|admob`
across `*.swift`, `*.pbxproj`, `Package.swift` and `*.resolved`: NOT FOUND.**

⚠️ **PostHog exists, and it is a WEB dependency** — `package.json:40` `"posthog-js": "^1.359.1"`, loaded
inside the WebView. **It is not linked into the binary and does not appear in any iOS project file.**
**No IDFA, no `AppTrackingTransparency`, no ad network, no data broker.**

✅ **`NSPrivacyTracking` is therefore `false` on evidence**, and `NSPrivacyTrackingDomains` is an empty
array.

## B4. `NSPrivacyCollectedDataTypes` — 🔴 **LEFT EMPTY, DELIBERATELY, AS INSTRUCTED**

**I did not write a collected-data declaration.** The file carries an empty array and a comment naming
the single candidate (the APNs token), both readings from B2, and the fact that **an empty array is a
positive claim that the binary collects nothing** — not a neutral placeholder.

**The options, stated without a recommendation:**
1. **Leave empty** — defensible if the manifest is read strictly as describing the binary, since the
   binary transmits nothing.
2. **Declare "Device ID" / "Other Diagnostic Data"** — defensible if read as describing the app as a
   product, since the token is a device identifier that reaches the server.
3. **Declare nothing here and answer fully in the App Store Connect questionnaire** — the two must agree,
   and the questionnaire is the binding artefact.

⚠️ **THIS MUST BE REVISITED BEFORE SUBMISSION.** It is the one part of the file that is knowingly
incomplete, and it is incomplete because it is Dominic's decision.

---

# PART C — THE MANIFEST

## C1. Created: `ios/App/App/PrivacyInfo.xcprivacy`

Contains exactly the four keys asked for: `NSPrivacyAccessedAPITypes` (one entry, UserDefaults/CA92.1),
`NSPrivacyTracking` (`false`, from B3), `NSPrivacyTrackingDomains` (empty), and
`NSPrivacyCollectedDataTypes` (empty, with the pending-decision comment).

**The four categories with no hits are named in a comment as NOT DECLARED, with the reason** — so the
next reader cannot mistake their absence for an oversight.

## C2. CA92.1 vs 1C8F.1 — 🔴 **CA92.1, chosen on project evidence**

**CA92.1** covers reading/writing information *accessible only to the app itself*. **1C8F.1** is for
UserDefaults shared with other apps via an **App Group**. Three independent checks, all **READ**:

| Check | Result |
|---|---|
| `com.apple.security.application-groups` in either entitlements file | 🔴 **NOT FOUND** — neither `App.entitlements` nor `AppRelease.entitlements` has the key; both contain only `aps-environment` |
| App extension / second target | 🔴 **NONE** — `grep -c "isa = PBXNativeTarget"` returns **1**, `productType = "com.apple.product-type.application"`, and there is no `.appex` or *Embed App Extensions* phase |
| Does the plugin use a suite? | 🔴 **NO** — `UserDefaults.standard` at `Preferences.swift:19`; a grep for `UserDefaults(suiteName:` across the package returns nothing |

✅ **Nothing shares these defaults with anything. CA92.1 is the correct code and 1C8F.1 would be wrong** —
and a wrong code is ITMS-91055, which fails the upload exactly like a missing one.

## C3. Validation — ✅ `plutil -lint`

```
$ plutil -lint ios/App/App/PrivacyInfo.xcprivacy
ios/App/App/PrivacyInfo.xcprivacy: OK
```
**And parsed back to prove the keys and values are what they should be:**
```json
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
`file` reports: `XML 1.0 document text, Unicode text, UTF-8 text`.

---

# PART D — MAKING IT SHIP

## D3. Is hand-editing `project.pbxproj` safe here? — 🔴 **YES, AND THE ANSWER IS EVIDENCE-BASED**

**I did it, having first established four things. Had any failed, I would have stopped at D1 with the
file created but unregistered.**

1. 🔴 **`plutil` can LINT this file** — `plutil -lint …/project.pbxproj` → `OK` **before** I touched it.
   A pbxproj is an OpenStep plist, so validation is a real syntax check, not an eyeball. **This is the
   single fact that makes hand-editing verifiable rather than hopeful.**
2. 🔴 **THE PROJECT ALREADY CONTAINS HAND-AUTHORED IDs** — `HG01BB0000000000000001`, `…0003`, `…0004`
   for `HGBridgeViewController.swift` and the two entitlements files. **A previous manual edit of this
   exact file already succeeded** (the §36 entitlements work). The convention exists; I continued it.
3. **The change is purely additive and mirrors an existing resource** (`Assets.xcassets`) line for line.
   **No existing line was modified or removed.**
4. **A byte-identical backup was taken first**, so a bad result was one `cp` from being undone.

⚠️ **THIS IS NOT A GENERAL LICENCE.** Hand-editing a pbxproj is safe *here* because it is small
(15.6 KB, one target, 36 IDs), additive, conventionally precedented, and lint-verifiable. **A merge
conflict, a second target, or an Xcode-managed group would change that answer.**

⚠️ **§36 records the OPPOSITE rule for `.entitlements` — "PBXBuildFile MUST NOT be added"** — because an
entitlements file is read by `codesign` and a Resources entry would wrongly embed it in the bundle.
🔴 **A privacy manifest is the inverse: it MUST be in Copy Bundle Resources or it does nothing.** The two
rules look contradictory and are not; they are about two different kinds of file.

## D1 / D2. The four added lines, quoted from the file

```
17:		HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */; };
32:		HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };
80:				HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */,
155:				HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,
```

| Line | Section | Purpose |
|---|---|---|
| 17 | **PBXBuildFile** | binds the file reference to a build phase |
| 32 | **PBXFileReference** | declares the file, `lastKnownFileType = text.plist.xml` |
| 80 | **PBXGroup** (`App`) | navigator visibility |
| 155 | 🔴 **PBXResourcesBuildPhase** | **the functional one — this is what puts it in the bundle** |

**Both IDs were collision-checked before use: `grep -c` returned 0 for each.**

**Post-edit validation — `plutil -lint`: OK**, and parsed structurally:
```
  PBXBuildFile     : PBXBuildFile -> fileRef HG01BB0000000000000005
  PBXFileReference : PBXFileReference | path = PrivacyInfo.xcprivacy | type = text.plist.xml
  in Resources     : True
  Resources now has 7 entries   (was 6)
  in App group     : True
```
🔴 **The fileRef resolves and the build file is genuinely in the Resources phase** — not just present in
the file.

## D4. ✅ **No `cap sync`. No build. No archive.** None was run.

---

# PART E — INTEGRITY

## E1 / E2. `project.pbxproj` census, before and after

| | Bytes | Distinct non-ASCII | Codepoints |
|---|---|---|---|
| **BEFORE** | 15,623 | **0** | (pure ASCII) |
| **AFTER** | 16,075 | **0** | (pure ASCII) |

**Difference: +452 bytes; distinct non-ASCII 0 → 0. GAINED none, LOST none.**
**Explained:** the four added lines are pure ASCII by construction — file paths, hex IDs and plist
punctuation. **The file was ASCII-only before and remains so, so there is no codepoint to gain or lose
and no mojibake surface at all.**

⚠️ **The new `PrivacyInfo.xcprivacy` has no "before" census** — it did not exist. Its own non-ASCII
content is limited to the comment prose; `file` confirms valid UTF-8 XML.

## E3. Byte scan — files created or edited

**Byte-level Python, never grep** — grep goes silent on a NUL-bearing file and the silence is
indistinguishable from "no matches".

| File | NUL | Ctrl < 0x09 | Other C0 | Bytes |
|---|---|---|---|---|
| `ios/App/App/PrivacyInfo.xcprivacy` | **0** | **0** | **0** | 4,763 |
| `ios/App/App.xcodeproj/project.pbxproj` | **0** | **0** | **0** | 16,075 |

## E4. This report — separate post-write pass

*(Result stated in the closing line of this section after the write; see the session output.)*

## E5. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/(legal)/layout.tsx
 M app/manage/[token]/page.tsx
 M components/shared/AppHeader.tsx
 M ios/App/App.xcodeproj/project.pbxproj
 M lib/plan-features.ts
?? docs/appstore-completeness-report.md
?? docs/appstore-report.md
?? docs/completeness-sweep-report.md
?? ios/App/App/PrivacyInfo.xcprivacy

$ git diff --stat
 app/(legal)/layout.tsx                | 49 +++++++++++++++++++++++++++++++---
 app/manage/[token]/page.tsx           | 50 +++++++++++------------------------
 components/shared/AppHeader.tsx       | 34 ++++++++++++++++++++++++
 ios/App/App.xcodeproj/project.pbxproj |  4 +++
 lib/plan-features.ts                  | 14 +++++++++-
 5 files changed, 112 insertions(+), 39 deletions(-)
```

✅ **THIS TASK'S CHANGES ARE EXACTLY TWO: `ios/App/App.xcodeproj/project.pbxproj` (+4 lines) and the
new untracked `ios/App/App/PrivacyInfo.xcprivacy`.** The other four modified files and three untracked
docs are the earlier tasks', unchanged here.

## E6. 🔴 NOTHING WAS VERIFIED BY BUILDING

**Stated explicitly because it is the difference that matters:**

🔴 **A MANIFEST THAT LINTS IS NOT A MANIFEST THAT PASSES APP STORE VALIDATION.** `plutil -lint` proves
the XML is well-formed and the keys parse. It proves **nothing** about whether Apple accepts the
category, the reason code, or the completeness of the declaration.

**Not run:** `xcodebuild`, any archive, any upload, any validation, `cap sync`, `next build`.
**Not verified:** that Xcode opens the project cleanly; that the file lands in the built `.app` bundle;
that ITMS-91053 is cleared; that no ITMS-91055 is raised for CA92.1.

**The first real test is an archive upload, and it has not happened.**

---

# WHAT ELSE I HAVE NOT DONE

1. **I did not open Xcode.** The project edit is validated by `plutil` and by parsing the object graph —
   **not by the tool that owns the file.** ⚠️ **Worth opening it once before archiving.**
2. **I did not verify the file reaches the bundle.** That requires a build. **INFERRED** from its
   presence in the Resources phase, which is the mechanism.
3. **The audit is grep-shaped.** It finds symbol names in source. **A required-reason API reached through
   a computed selector, a re-exported wrapper, or a binary-only dependency would not appear.** All twelve
   packages here ship source, so the exposure is low — but it is not zero.
4. **I did not audit transitive native dependencies** beyond the twelve declared packages. `@capacitor/ios`
   pulls `CapacitorCordova`; both were searched, but I did not resolve the SPM graph.
5. **I did not check whether App Store Connect requires more than these four keys** for this app type.
6. **B4's decision is unresolved on purpose** and blocks submission readiness, not this file.
