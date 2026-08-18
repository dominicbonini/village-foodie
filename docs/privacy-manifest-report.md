# Privacy manifest — verified, and there was no gap to close

# ✅ `NSPrivacyCollectedDataTypes` IS ALREADY IN THE FILE, CORRECT IN ALL THREE ANSWERS. STAGE 2 HAD NOTHING TO DO.

**No file was edited. `npx cap sync ios` was run and moved nothing.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore`. **No build, no archive, no upload, Xcode not opened.** Bundle id, version, build number,
entitlements, `Info.plist` and every signing setting untouched. **Nothing under `app/` was touched.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

⚠️ **THE MANUAL'S ENTRY IS THE THING THAT WAS STALE, NOT THE FILE.** It records the 15 August decision
as *"needs a `cap sync` and rebuild before it ships"*, which reads as *not yet written*. **It was
written.** The outstanding half is the rebuild — and that is real, see §5.

---

# STAGE 1

## Q1 — the file, in full

**6,194 bytes. Printed complete rather than summarised:** the plist declares one
`NSPrivacyAccessedAPITypes` entry (`NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`),
`NSPrivacyTracking` `<false/>`, an empty `NSPrivacyTrackingDomains`, and one
`NSPrivacyCollectedDataTypes` entry. **The operative XML, verbatim:**

```xml
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>CA92.1</string>
			</array>
		</dict>
	</array>

	<key>NSPrivacyTracking</key>
	<false/>

	<key>NSPrivacyTrackingDomains</key>
	<array/>

	<key>NSPrivacyCollectedDataTypes</key>
	<array>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeDeviceID</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<true/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array>
				<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
			</array>
		</dict>
	</array>
```

⚠️ **The file also carries an extensive audit comment** — the 14 August sweep across the app's Swift
and all Capacitor packages, naming what was **not** found and why, plus the 15 August decision and its
reasoning. **Left byte-for-byte alone.**

## Q2 / Q3 — every key

| Key | Present? | Declares |
|---|---|---|
| `NSPrivacyAccessedAPITypes` | ✅ | one entry |
| `NSPrivacyAccessedAPICategoryUserDefaults` / **CA92.1** | ✅ | *"read and write information only accessible to the app itself"* — chosen over `1C8F.1` on evidence (no App Group entitlement, one native target, `UserDefaults.standard` not `suiteName:`) |
| 🔴 **`NSPrivacyCollectedDataTypes`** | 🔴 **✅ PRESENT** | **Device ID · `…PurposeAppFunctionality` · `Linked` `<true/>` · `Tracking` `<false/>`** |
| `NSPrivacyTracking` | ✅ | `<false/>` |
| `NSPrivacyTrackingDomains` | ✅ | empty array |

# ✅ Q3 ANSWERED: PRESENT, AND ALL THREE ANSWERS MATCH THE 15 AUGUST DECISION EXACTLY. THERE IS NO GAP.

## Q4 — ✅ REGISTERED IN THE TARGET, ALL FOUR PLACES

```
17:	HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */; };
32:	HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };
80:		HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */,
155:		HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,
```

**A file reference, a build file, membership of the group, AND a line in the Resources build phase.**
🔴 **That last one is the one that matters — a reference without it ships nothing.**

## Q5 — plugin manifests

**EXECUTED — every `.xcprivacy` under `node_modules/@capacitor` and `ios/`:**

| File | Note |
|---|---|
| `node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy` | ships with core |
| `node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/PrivacyInfo.xcprivacy` | ships with core |
| `ios/App/App/PrivacyInfo.xcprivacy` | **the app-level one** |

🔴 **THE OTHER EIGHT PLUGINS SHIP NONE** — biometric-auth, bluetooth-le, keep-awake, app,
local-notifications, network, preferences, push-notifications, status-bar (nine plugins, minus the
core package). ⚠️ **`@capacitor/preferences` is the one that touches a required-reason API and has no
manifest of its own — which is exactly why `CA92.1` is declared at app level.** ✅ **No plugin was
found accessing a required-reason API with neither its own manifest nor an app-level declaration.**

## Q6 — the four categories. ✅ NONE IS USED.

**EXECUTED — eleven greps across `ios/` and every `node_modules/@capacitor/*/ios`:**
`creationDate` · `modificationDate` · `contentModificationDateKey` · `attributesOfItem` ·
`volumeAvailableCapacity` · `systemFreeSize` · `statfs` · `systemUptime` · `mach_absolute_time` ·
`kern.boottime` · `activeInputModes`.

# 🔴 EVERY ONE MATCHED EXACTLY ONE FILE: `PrivacyInfo.xcprivacy` ITSELF — its own audit comment naming the strings. **ZERO real call sites.**

✅ **File Timestamp, Disk Space, System Boot Time and Active Keyboard are all correctly undeclared**,
and the 14 August audit is independently reproduced. **Nothing to report and stop on.**

---

# STAGE 2 — NOTHING TO DO

**No edit was made, so there is no diff to show.** ⚠️ **Adding the key would have DUPLICATED it**, and
a plist with two `NSPrivacyCollectedDataTypes` keys is malformed.

---

# STAGE 3 — `npx cap sync ios`. ✅ IT MOVED NOTHING.

```
✔ Copying web assets from out to ios/App/App/public
✔ Creating capacitor.config.json in ios/App/App
✔ copy ios · ✔ Updating iOS plugins
[info] All Capacitor plugins have a Package.swift file and will be included in Package.swift
[info] Writing Package.swift
[info] Found 9 Capacitor plugins for ios
✔ update ios · Sync finished in 0.082s
```

| Check | Before | After | Verdict |
|---|---|---|---|
| `git diff --stat ios/` | — | **EMPTY** | ✅ **not one tracked file changed** |
| `git status --porcelain ios/` | — | **EMPTY** | ✅ **nothing untracked appeared either** |
| 🔴 **`project.pbxproj` bytes** | **16,075** | **16,075** | ✅ **identical** |
| **`project.pbxproj` MD5** | `1e6d407d1bb221cedbcda4dc07024614` | **same** | ✅ **byte-identical — NO STOP TRIGGERED** |
| 🔴 **`PrivacyInfo.xcprivacy` bytes** | **6,194** | **6,194** | ✅ **the sync did not overwrite it** |
| **manifest MD5** | `b8d8d147794eda9f2d09a4bfb4904a30` | **same** | ✅ **content identical** |
| `ios/App/CapApp-SPM/Package.swift` | — | 2,530 | ⚠️ **REWRITTEN by the sync** (`[info] Writing Package.swift`) **and byte-identical to the committed copy** — no diff, not untracked |

# ✅ THE MANUAL'S PROPERTY HELD, AND IT WAS VERIFIED RATHER THAN ASSUMED — `cap sync` ON CAPACITOR 8 WITH SPM LEFT `project.pbxproj` BYTE-IDENTICAL. **Checked by size AND hash, not by `git diff` alone.**

⚠️ **`Package.swift` IS REWRITTEN ON EVERY SYNC.** It happened to reproduce the same bytes because the
plugin list has not changed. **Add or remove a plugin and this file will differ — that is where a
plugin change lands, not in the pbxproj.**

---

# 5. 🔴 WHAT THIS DOES **NOT** PROVE

# 🔴 THE MANIFEST REACHING THE BINARY CANNOT BE VERIFIED HERE. NO ARCHIVE WAS MADE, AND NONE IS POSSIBLE WITHOUT A BUILD.

**What would prove it:** archive the app, then in the `.xcarchive` open
`Products/Applications/App.app/` and confirm `PrivacyInfo.xcprivacy` is present at the app bundle root
with these 6,194 bytes. ⚠️ **Equivalently, the App Store Connect upload itself is the proof: ITMS-91053
is raised at upload, so a clean upload is the assertion that the manifest is present and complete.**

**Everything above is either EXECUTION-verified or a source read, marked:**

| Claim | Method |
|---|---|
| The file's contents and every key | ✅ **EXECUTION** — read in full, quoted |
| `NSPrivacyCollectedDataTypes` present and correct | ✅ **EXECUTION** |
| Registered in the target, incl. the Resources phase | ✅ **EXECUTION** — four `project.pbxproj` lines |
| Which packages ship their own manifest | ✅ **EXECUTION** — `find` across `node_modules/@capacitor` and `ios/` |
| No other required-reason API is used | ✅ **EXECUTION** — eleven greps, all matching only the manifest's own comment. ⚠️ **A grep cannot see a call made through a Swift string selector or a transitive C dependency** |
| `cap sync` changed nothing | ✅ **EXECUTION** — sizes, MD5s, `git diff --stat` and `git status` all quoted |
| 🔴 **The manifest is in the shipped binary** | 🔴 **NOT VERIFIABLE HERE — needs an archive** |

---

# 6. INTEGRITY

## `ios/App/App/PrivacyInfo.xcprivacy` — 🔴 NOT EDITED. Scanned anyway, before and after the sync.

```
BEFORE   bytes 6,194   AFTER   bytes 6,194   (MD5 identical)
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0
TAB present — 237 — and CORRECT: it is the plist's own indentation, unchanged
```

**Non-ASCII class census: 3 distinct class(es), 8 occurrences — identical before and
after, because the file was not written.** The classes are U+2014 (6), U+2026 (1), U+2192 (1).

## This report — SEPARATE pass, run AFTER writing

```
docs/privacy-manifest-report.md   bytes 11,072
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 15 | 0 | 15 |
| U+2705 ✅ | 30 | 0 | 30 |
| **U+26A0 ⚠️** | **10** | **10** | ✅ **0** |

`U+1F534` and `U+2705` have **emoji presentation by default** — bare is correct. **`U+26A0` is the
only TEXT-presentation base here**, and ✅ **every one of its 10 occurrences is PAIRED — 10
OF 10, ZERO BARE.** ⚠️ **No other emoji-presentation base occurs.** Total `U+FE0F` = 10.

## Working tree

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-screen-on-header-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M docs/privacy-manifest-report.md` | 🔴 **THIS TASK — the only file written.** ⚠️ **It shows as MODIFIED, not untracked: a committed report of that name already existed (the 14 August audit) and this pass overwrote it, as instructed** |
| **everything else** | ✅ **ALL pre-existing** — the source files and reports from earlier tasks this session. ✅ **`ios/` contributes NOTHING to this list, before or after the sync** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
