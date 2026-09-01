# NSCameraUsageDescription — one key added to ios/App/App/Info.plist

**Date:** 27 August 2026 · **Branch:** `main` · **HEAD:** `1d85241`
**Files changed by this task: ONE** — `ios/App/App/Info.plist`

---

## 0. SCOPE, AND TWO THINGS I AM FLAGGING BEFORE ANYTHING ELSE

### 0.1 ⚠️ A TENSION BETWEEN TWO INSTRUCTIONS IN THIS BRIEF — resolved, and stated

The brief opens *"SCOPE — EXACTLY ONE FILE CHANGES: ios/App/App/Info.plist. Nothing else."* and closes *"FINALLY: write your full report to `docs/camera-usage-description-report.md`, overwriting whatever is there."* Writing this file is, literally, a second file changing.

**I did not stop on it.** I read the scope clause as governing the *product* change and the FINALLY clause as the deliverable — the same shape every prior brief in this series has had. **I am recording the resolution rather than making it silently.** If you intended the scope clause to bind this report too, say so and the instruction genuinely is contradictory.

**No other file was touched.** The prohibited list — `app/`, `components/`, `lib/`, `android/`, `capacitor.config.ts`, `ios/App/App.xcodeproj/project.pbxproj` — is untouched, and §3.5 proves it.

### 0.2 🔴 A CORRECTION TO `docs/build-inventory-report.md`, WHICH I HAVE **NOT** EDITED

Verifying step 3e against the earlier inventory surfaced **an arithmetic error in that report which I am correcting here rather than in the file, because editing it would breach this brief's scope.**

`docs/build-inventory-report.md` §1.1 states *"56 modified tracked files (` M`) and 62 untracked (`??`)"*. **The untracked figure is wrong. It was 69, not 62.** The undercount is entirely in the docs line: §1.1's summary says *"docs/ — 30 report files"* when the true figure is **37**.

⚠️ **The enumerated lists in that report are correct and complete** — §2.4 lists 11 workstream docs and §2.7 lists 26 further docs, which is 37, and 37 + 32 non-doc untracked paths = 69. **Only the summary count in §1.1 is wrong; no path was missing from the inventory.** The `ios/**` finding, the classification, the archives and §6 are unaffected.

For the record, today's untracked total is **70** = 69 + `docs/build-inventory-report.md`.

### 0.3 Prohibitions honoured

No `cap sync` (neither platform, in any form). No deploy. No `next build`, no `next dev`. No migration applied and none opened. **No `git add`, `commit`, `stash`, `checkout`, `restore`, `clean`, `merge`, `rebase` or `reset`** — every git call was `status`, `diff` or `grep` over a `git`-read file. Nothing belonging to `pizzeria-gusto` or `tikka-tonic` was touched.

### 0.4 Verification performed — in the required words

**PARSE only.** Every claim below is a parse of file bytes (`plutil -lint`, `plutil -p`, `grep`, `sed`, `xxd`, `python3`) or of filesystem/VCS metadata (`shasum`, `git status`, `git diff`).

🔴 **NO TYPECHECK WAS PERFORMED. NO EXECUTION WAS PERFORMED.** `tsc` was not run. Nothing was compiled, launched, installed or rendered. **The app has not been built and has not been run.** `plutil -lint` proves the file is well-formed XML that parses as a property list — it proves nothing about runtime behaviour. See §6.

The background in the brief (TCC termination, dSYM UUID match, the `WKFileUploadPanel` "Take Photo" branch, the device-tested Photo Library and Choose File branches) is taken as **given by artefact and was not re-derived**, as instructed.

---

## 1. PRE-EDIT CHECKS — all four passed

### 1a. `git status --porcelain -uall -- ios/`

```
$ git status --porcelain -uall -- ios/
<no output>
```

✅ **EMPTY.** Nothing under `ios/` was modified or untracked before the edit.

### 1b. `plutil -lint`

```
$ plutil -lint ios/App/App/Info.plist
ios/App/App/Info.plist: OK
```

### 1c. `shasum -a 256` — the pre-edit value

```
81e95f5f4e40ca361534ba4baeb8de230587e4a1aacac0fb06c1cc4074a481b0  ios/App/App/Info.plist
```

### 1d. Backup, proved byte-identical

```
$ cp ios/App/App/Info.plist /tmp/Info.plist.backup
$ shasum -a 256 ios/App/App/Info.plist /tmp/Info.plist.backup
81e95f5f4e40ca361534ba4baeb8de230587e4a1aacac0fb06c1cc4074a481b0  ios/App/App/Info.plist
81e95f5f4e40ca361534ba4baeb8de230587e4a1aacac0fb06c1cc4074a481b0  /tmp/Info.plist.backup
```

✅ **IDENTICAL.** The restore point is `/tmp/Info.plist.backup`, and §3.6 confirms it still carries this hash.

### 1e. `NSCameraUsageDescription` absent — the grep, quoted

```
$ grep -n "NSCameraUsageDescription" ios/App/App/Info.plist
<no output — 0 matches>
```

✅ **ABSENT**, corroborating the artefact evidence in the brief.

### 1f. Indentation, read rather than assumed

The brief required the file's existing indentation be **read**, not assumed. It was:

```
$ sed -n '43,44p' ios/App/App/Info.plist | head -c 60 | xxd
00000000: 093c 6b65 793e 4e53 426c 7565 746f 6f74  .<key>NSBluetoot
00000010: 6841 6c77 6179 7355 7361 6765 4465 7363  hAlwaysUsageDesc
00000020: 7269 7074 696f 6e3c 2f6b 6579 3e0a 093c  ription</key>..<
00000030: 7374 7269 6e67 3e48 6174 6368            string>Hatch
```

🔴 **Byte `0x09` — a single TAB, not spaces.** Line terminator `0x0a` (LF); `grep -c $'\r'` returns 0, so no CRLF. `file` reports *"XML 1.0 document text, ASCII text"*. The existing `<string>` values are **single unwrapped lines** however long they are.

The insertion matches all three: one TAB, LF, one unwrapped `<string>` line.

⚠️ The file is **not uniformly indented** — line 4 (`<key>CAPACITOR_DEBUG</key>`) uses four spaces and lines 5 onward use tabs. **I matched the local convention at the insertion point (TAB) and left the pre-existing space-indented line untouched.**

---

## 2. THE EDIT

Inserted immediately after the `NSBluetoothAlwaysUsageDescription` key/string pair, so the usage descriptions sit together:

```xml
	<key>NSCameraUsageDescription</key>
	<string>HatchGrab uses the camera so you can photograph your menu board, your dishes and other documents and upload them straight into your account. Images are used only for the uploads you choose to make.</string>
```

**How it was done, and why that way.** A Python insertion that located the anchor by **exact byte match** on `'\t<key>NSBluetoothAlwaysUsageDescription</key>\n'`, asserted the following line is a `\t<string>…</string>\n`, asserted no `NSCameraUsageDescription` already existed, spliced two lines into the list, and rewrote with `newline=''` so no line ending was translated. **Nothing outside the splice point was read back out and rewritten differently** — the diff in §3.3 is the proof, not the intent.

**The value.** The brief presents it wrapped across three lines for readability. It was written as a single line of prose, joined on single spaces, matching every other `<string>` in the file. The text contains no `&`, `<` or `>`, so no XML escaping was needed and none was applied.

**Nothing else changed.** No key reordered, reformatted, re-wrapped or touched. No `NSPhotoLibraryUsageDescription` was added — the brief is explicit that the Photo Library and Choose File branches are device-tested on the crashing build and that key is deliberately not in scope.

---

## 3. POST-EDIT VERIFICATION — all five passed

### 3a. `plutil -lint` — passes

```
$ plutil -lint ios/App/App/Info.plist
ios/App/App/Info.plist: OK
```

### 3b. `plutil -p` — the line, verbatim

```
  "NSCameraUsageDescription" => "HatchGrab uses the camera so you can photograph your menu board, your dishes and other documents and upload them straight into your account. Images are used only for the uploads you choose to make."
```

✅ The parsed value is byte-for-byte the string the brief specified.

### 3c. `git diff -- ios/App/App/Info.plist` — in full

```diff
diff --git a/ios/App/App/Info.plist b/ios/App/App/Info.plist
index c0067f6..0886f45 100644
--- a/ios/App/App/Info.plist
+++ b/ios/App/App/Info.plist
@@ -42,6 +42,8 @@
 	<string>Unlock HatchGrab with Face ID.</string>
 	<key>NSBluetoothAlwaysUsageDescription</key>
 	<string>HatchGrab uses Bluetooth to connect to your kitchen receipt printer so order tickets can be printed automatically. It is not used for anything else.</string>
+	<key>NSCameraUsageDescription</key>
+	<string>HatchGrab uses the camera so you can photograph your menu board, your dishes and other documents and upload them straight into your account. Images are used only for the uploads you choose to make.</string>
 	<key>LSRequiresIPhoneOS</key>
 	<true/>
 	<key>UILaunchStoryboardName</key>
```

**Deletion check, run mechanically rather than eyeballed:**

```
$ git diff -- ios/App/App/Info.plist | grep '^-' | grep -v '^---' | wc -l
0
```

✅ **ZERO deletions. Two insertions. One hunk.** The restore path in the brief was therefore not taken, and `/tmp/Info.plist.backup` was not used.

### 3d. `git status --porcelain -uall -- ios/` — exactly one path

```
 M ios/App/App/Info.plist
```

✅ **Exactly one modified path under `ios/`.** Nothing untracked appeared there.

### 3e. `git status --porcelain -uall` — nothing outside `ios/` changed

| Measure | Before this task | After this task | Delta |
|---|---|---|---|
| Modified tracked (` M`) | 56 | **57** | **+1 — `ios/App/App/Info.plist`** |
| Untracked (`??`) | 69 *(see §0.2)* | **70** | **+1 — this report** |
| Staged | 0 | **0** | 0 |
| Total paths | 125 | 127 | +2 |

✅ **The only two deltas are the one permitted edit and this report.** Nothing under `app/`, `components/`, `lib/`, `android/`, no `capacitor.config.ts`, and no `project.pbxproj` change.

### 3f. Hashes after the edit

```
a902277c11e717950a226f445387880a9efbd060b412d0f8804aa44a04082ca6  ios/App/App/Info.plist   ← new
81e95f5f4e40ca361534ba4baeb8de230587e4a1aacac0fb06c1cc4074a481b0  /tmp/Info.plist.backup   ← unchanged
```

The backup still carries the exact pre-edit hash recorded in §1c, so the restore point remains valid.

### 3g. The file's keys after the edit — 21, was 20

`CAPACITOR_DEBUG`, `CFBundleDevelopmentRegion`, `CFBundleDisplayName`, `CFBundleExecutable`, `CFBundleIdentifier`, `CFBundleInfoDictionaryVersion`, `CFBundleName`, `CFBundlePackageType`, `CFBundleShortVersionString`, `CFBundleVersion`, `ITSAppUsesNonExemptEncryption`, `NSFaceIDUsageDescription`, `NSBluetoothAlwaysUsageDescription`, **`NSCameraUsageDescription` ← NEW**, `LSRequiresIPhoneOS`, `UILaunchStoryboardName`, `UIMainStoryboardFile`, `UIRequiredDeviceCapabilities`, `UISupportedInterfaceOrientations`, `UISupportedInterfaceOrientations~ipad`, `UIViewControllerBasedStatusBarAppearance`.

⚠️ Still **absent**, and deliberately so: `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSMicrophoneUsageDescription`, and every `NSLocation*` key.

---

## 4. `CURRENT_PROJECT_VERSION` — REPORTED, NOT CHANGED

🔴 **I did not edit `ios/App/App.xcodeproj/project.pbxproj`. The build-number bump is yours to make by hand in Xcode.**

The file contains **four** `Debug`/`Release` blocks — two project-level (which carry no `CURRENT_PROJECT_VERSION`) and two target-level (which do). The two lines you asked for are the target-level ones:

| Configuration | Block | Line | Content |
|---|---|---|---|
| **Debug** | `504EC3171FED79650016851F /* Debug */` opens at **305**, `name = Debug;` at **329** | **312** | `CURRENT_PROJECT_VERSION = 1;` |
| **Release** | `504EC3181FED79650016851F /* Release */` opens at **331**, `name = Release;` at **353** | **337** | `CURRENT_PROJECT_VERSION = 1;` |

```
  305:		504EC3171FED79650016851F /* Debug */ = {
  312:				CURRENT_PROJECT_VERSION = 1;
  329:			name = Debug;
  331:		504EC3181FED79650016851F /* Release */ = {
  337:				CURRENT_PROJECT_VERSION = 1;
  353:			name = Release;
```

*(For completeness: lines 252 and 303 are `name = Debug;` / `name = Release;` closing the **project-level** blocks at 196 and 254. Neither contains a `CURRENT_PROJECT_VERSION`, so the two above are the only ones in the file.)*

**Both currently read `1`. Both are still `1`.** Confirmed unmodified:

```
$ git status --porcelain -uall -- ios/App/App.xcodeproj/project.pbxproj
<no output>
```

---

## 5. `ios/App/App/PrivacyInfo.xcprivacy` — REPORTED, NOT CHANGED

🔴 **THE FILE CONTAINS NO CAMERA- OR PHOTO-RELATED ENTRY OF ANY KIND.**

```
$ grep -in "camera\|photo\|NSPrivacyCollectedDataTypePhotos\|MediaLibrary" ios/App/App/PrivacyInfo.xcprivacy
<no output — 0 matches>
```

The complete file, comments stripped, is four declarations:

```xml
<plist version="1.0">
<dict>
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
</dict>
</plist>
```

So: one accessed-API category (`UserDefaults`, reason `CA92.1`), `NSPrivacyTracking = false`, an empty `NSPrivacyTrackingDomains`, and one collected data type (`DeviceID`, linked, not tracking, purpose App Functionality).

**I offer no view on whether that should change**, as instructed. Confirmed unmodified:

```
$ git status --porcelain -uall -- ios/App/App/PrivacyInfo.xcprivacy
<no output>
```

---

## 6. WHAT REMAINS UNOBSERVED

**Nothing has been rendered. No simulator, no device, no build, no run.**

1. 🔴 **The fix is UNVERIFIED IN BEHAVIOUR.** `plutil -lint` proves the file parses; it proves **nothing** about whether TCC now permits the camera. **No archive was made, no build was run, no `WKFileUploadPanel` was raised, and the "Take Photo" branch has not been exercised on any device or simulator by me.** The claim this report supports is *"the key is present, correctly spelled, with the specified value, and the file still parses"* — and no more.
2. 🔴 **The key is in the SOURCE `Info.plist` only.** It is **not** in any built product, any archive, or any binary. The two `1.0 (1)` archives on this machine still lack it. **A rebuild is required for this key to exist anywhere Apple can read it**, and I did not build.
3. **The build number was not bumped**, by design (§4). A new upload at `1.0 (1)` would be rejected by App Store Connect as a duplicate build number; that bump is yours.
4. **The Photo Library and Choose File branches were not tested by me.** I have taken the brief's statement that they are device-tested and working as given.
5. **No `cap sync` was run**, so `ios/App/App/capacitor.config.json` is untouched and remains stale at mtime `2026-08-17 23:06:40` — as recorded in `docs/build-inventory-report.md` §4.3. **This edit does not change that and does not depend on it**; `Info.plist` is a tracked source file that Capacitor's sync does not regenerate.
6. **Whether any code path in the web bundle actually reaches the camera was not re-derived.** `docs/build-inventory-report.md` §6 records **zero** `getUserMedia` call sites, **zero** `<input capture>` attributes, no `@capacitor/camera` dependency, and no "Take Photo" control in the codebase — the camera reaches the user through **WebKit's own** `WKFileUploadPanel` for `accept="image/*"`, which is native UI the application never calls. That remains an artefact-level statement, not something I executed.
7. **`/tmp/Info.plist.backup` still exists** and still hashes to the pre-edit value. Nothing cleans it up; delete it when you no longer want the restore point.
