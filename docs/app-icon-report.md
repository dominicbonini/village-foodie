# App icon — scale 830 APPLIED, synced, verified

**Applied and synced. One binary file changed: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`.** `cap sync` run once, in Part B only. No `next dev`, no `next build`, no build, no archive, no deploy, no commit.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

> ## ✅ EVERY GATE PASSED, AND THE STRONGEST RESULT IS A5.
> **The applied file is BYTE-IDENTICAL to the preview you approved — same sha256 `eee55618…`.** Not "matches the measurements": **the same file, bit for bit.** The generator is deterministic, so what you signed off is exactly what shipped.
>
> ✅ `project.pbxproj` byte-identical at **`37ab0184…`** · four PrivacyInfo lines at the same line numbers · Resources still **7** · manifest lints · `allowNavigation` and `server.url` unchanged in both baked configs.
>
> 🔴 **`Splash.imageset` PROVED UNCHANGED BY SHA, NOT BY `git status`** — all three PNGs still `50e8f0ae…`, exactly as instructed, because the tree has been dirty all session and absence from a listing proves nothing.

---

# PART A — APPLY

## A1. The pre-apply hash — 🔴 **MATCHED, so there was nothing to stop for**

```
4c1e2ba9b8d119506779d7a2b341425c0f02e1dec445bde2276b9a3653e3a506   AppIcon-512@2x.png  (14,488 bytes)
```

✅ **Identical to `4c1e2ba9…` recorded in the previous report. Nothing changed underneath between the preview and the apply.**

## A2. The command, and its output

```
$ node <scratchpad>/gen-appicon.js 830 --apply
scale=830  translate(353.138,97.000)  ->  /Users/dominicbonini/dev/village-foodie/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
```

✅ **`translate(353.138, 97.000)` is exactly what the A1 centring rule predicted for scale 830** — `tx = 512 − 0.1914 × 830 = 353.138`, `ty = 512 − 0.5 × 830 = 97.000`. **One command, one file.**

## A3. Byte-level verification of the written file

| Check | Result |
|---|---|
| Dimensions | **1024 × 1024** |
| Bit depth | **8** |
| **PNG colour type** (byte 25 of the header) | **`2` = RGB** |
| **Decoded channel count** | **`3`** |
| **Alpha** | 🔴 **NONE** — types 4 and 6 are the alpha-bearing ones and this is neither |
| **`tRNS` chunk** | 🔴 **false** — the only other route to transparency in an RGB PNG, and it is absent |
| **Square corners** | ✅ **all four EXACT corner pixels are the ground colour** (A4) — nothing pre-rounded, masked or bordered |

## A4. Pixel probes

| Probe | Expected | Actual |
|---|---|---|
| `(0,0)` corner | white | ✅ **`#FFFFFF`** |
| `(1023,1023)` opposite corner | white | ✅ **`#FFFFFF`** |
| `(1023,0)` corner | white | ✅ `#FFFFFF` |
| `(0,1023)` corner | white | ✅ `#FFFFFF` |
| **`(512,512)` inside the mark** | `#EF8B2C` | ✅ **`#EF8B2C`** |

✅ **The mark is byte-exactly `239,139,44` — composited as authored, not re-tinted.** A blend or a recolour could not land on the source hex.

## A5. 🔴 Bounding box vs the preview — **IDENTICAL, AND SO IS THE WHOLE FILE**

| | PREVIEW (scale 830) | APPLIED |
|---|---|---|
| Bounding box | x 355–669, y 104–919 | **x 355–669, y 104–919** |
| Size | 315 × 816 | **315 × 816** |
| Exact-orange pixels | 64,894 | **64,894** |
| Margins | L 355 · R 354 · T 104 · B 104 | **L 355 · R 354 · T 104 · B 104** |
| Bytes | 16,103 | **16,103** |
| **sha256** | `eee556188b881990085dea0178069b0ee809bc8cabcdab98d36c7b46f5ac1857` | **`eee556188b881990085dea0178069b0ee809bc8cabcdab98d36c7b46f5ac1857`** |

> ## ✅ **NOT MERELY MATCHING — THE SAME BYTES.** `bbox identical: true` · `pixel count identical: true` · `sha256 identical: true`.
> 🔴 **This is a stronger check than the brief asked for.** A5 asks whether the apply did what the preview did; **the hash proves it produced the identical artefact, so there is no possibility of a divergence too small to measure.**

✅ **Against the decision as stated: 816 px tall = 79.7% of the canvas, 104 px vertical margin. Exactly what was approved.**

## A6. Before / after

| | BEFORE (716.8) | AFTER (830) |
|---|---|---|
| **Bytes** | 14,488 | **16,103** (+1,615) |
| **Dimensions** | 1024 × 1024 | **1024 × 1024** |
| **Colour type / channels** | 2 / 3 (no alpha) | **2 / 3 (no alpha)** |
| **Mark height** | 705 px (68.8%) | **816 px (79.7%)** |
| **Mark width** | 272 px (26.6%) | **315 px (30.8%)** |
| **Vertical margin** | 159 / 160 px | **104 / 104 px** |
| **Exact-orange pixels** | 48,338 | **64,894** — ×1.34 more ink |
| **sha256** | `4c1e2ba9b8d119506779d7a2b341425c0f02e1dec445bde2276b9a3653e3a506` | **`eee556188b881990085dea0178069b0ee809bc8cabcdab98d36c7b46f5ac1857`** |

**One file written. No file in the set was created, renamed or removed.**

## A7. `Contents.json` — 🔴 **UNCHANGED, PROVED BY HASH**

```
5c09bec6eede599b14fa9e4c44b03e7febebc930615a0cd70f02981c09dfe48a    before AND after
```

**And its content, unchanged — the filename did not move:**

```json
{
  "images" : [
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

---

# PART B — SYNC, AND THE MANIFEST

## B1. Recorded BEFORE syncing

```
sha256  37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30   project.pbxproj
```

**The four hand-authored `PrivacyInfo.xcprivacy` lines, verbatim, with their line numbers:**

```
17:		HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */; };
32:		HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };
80:				HG01BB0000000000000005 /* PrivacyInfo.xcprivacy */,
155:				HG01BB0000000000000006 /* PrivacyInfo.xcprivacy in Resources */,
```

**`PBXResourcesBuildPhase` entry count: `7`.** ✅ **Matches N20. A byte-identical backup was taken to the scratchpad before syncing.**

## B2. `npx cap sync` — full output

```
✔ Copying web assets from out to android/app/src/main/assets/public in 2.48ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 349.29μs
✔ copy android in 13.02ms
✔ Updating Android plugins in 3.04ms
[info] Found 8 Capacitor plugins for android:
       @aparajita/capacitor-biometric-auth@10.0.0
       @capacitor-community/keep-awake@8.0.1
       @capacitor/app@8.1.0
       @capacitor/local-notifications@8.2.0
       @capacitor/network@8.0.1
       @capacitor/preferences@8.0.1
       @capacitor/push-notifications@8.1.1
       @capacitor/status-bar@8.0.2
✔ update android in 40.22ms
✔ Copying web assets from out to ios/App/App/public in 1.01ms
✔ Creating capacitor.config.json in ios/App/App in 588.58μs
✔ copy ios in 28.91ms
✔ Updating iOS plugins in 3.70ms
[info] All Capacitor plugins have a Package.swift file and will be included in Package.swift
[info] Writing Package.swift
[info] Found 8 Capacitor plugins for ios:
       @aparajita/capacitor-biometric-auth@10.0.0
       @capacitor-community/keep-awake@8.0.1
       @capacitor/app@8.1.0
       @capacitor/local-notifications@8.2.0
       @capacitor/network@8.0.1
       @capacitor/preferences@8.0.1
       @capacitor/push-notifications@8.1.1
       @capacitor/status-bar@8.0.2
✔ update ios in 23.09ms
✔ copy web in 6.23ms
✔ update web in 9.83ms
[info] Sync finished in 0.178s
```

✅ **The same eight plugins on both platforms — none added, none removed. §36's "if a plugin is added or upgraded, RE-RUN THE AUDIT" is not triggered.**

## B3. Re-checked after the sync — 🔴 **ALL THREE SURVIVED**

```
sha256  37ab01848404c6eefba8144706e6b0df9ba35d2d84ee5d042e3f9793748a2d30   ← IDENTICAL
diff <pre-sync backup> <post-sync file>  →  no output.  BYTE-IDENTICAL.
```

| Check | Before | After | |
|---|---|---|---|
| `PBXBuildFile` line (`…0006`) | line 17 | **line 17, same text** | ✅ |
| `PBXFileReference` line (`…0005`) | line 32 | **line 32, same text** | ✅ |
| App `PBXGroup` entry | line 80 | **line 80** | ✅ |
| `PBXResourcesBuildPhase` entry | line 155 | **line 155** | ✅ |
| Resources entry count | 7 | **7** | ✅ |
| sha256 | `37ab0184…` | **`37ab0184…`** | ✅ |

✅ **Nothing changed, so nothing was re-added.** ⚠️ **ONE OBSERVATION, NOT A GUARANTEE — §36's own wording. This sync added and removed no plugin; the instruction to re-check after every sync stands.**

✅ **AND THIS IS THE THIRD CONSECUTIVE SYNC THE PROJECT FILE HAS SURVIVED UNTOUCHED.** `Assets.xcassets` already carries both a `PBXBuildFile` and a Resources-phase entry, so **replacing artwork inside an existing `.appiconset` needs no project change at all.**

## B4. Manifest and baked configs

```
$ plutil -lint ios/App/App/PrivacyInfo.xcprivacy
ios/App/App/PrivacyInfo.xcprivacy: OK
```

**Both baked configs, `server` block — identical on iOS and Android:**

```json
	"server": {
		"url": "https://www.hatchgrab.com/app",
		"cleartext": false,
		"allowNavigation": [
			"www.hatchgrab.com"
		]
	},
```

🔴 **PROVED BY HASH, NOT BY EYE — both files byte-identical across the sync:**

| File | Before | After |
|---|---|---|
| `ios/App/App/capacitor.config.json` | `5790a5f0daa891793d1515f8b69c22b931e2fe764e023b19b8c25fcd8039a925` | **same** |
| `android/app/src/main/assets/capacitor.config.json` | `5fd038c887669967637c3723ecf00d6a5f670dbba7918c28a3a3d14095288f2c` | **same** |

✅ **`allowNavigation` still the one exact host. `server.url` still production, still carrying `/app`.**

## B5. 🔴 `Splash.imageset` — **PROVED BY SHA, NOT BY `git status`**

**Baseline recorded at the very start of this task, before the apply and before the sync:**

```
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732.png
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732-1.png
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732-2.png
```

**Re-hashed AFTER the apply and AFTER `cap sync`:**

```
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732.png
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732-1.png
50e8f0aeee9b86b93d1734aab6ef7569cf0c4c59dec6b872402405cc8843bfbd   splash-2732x2732-2.png
```

> ## ✅ **ALL THREE BYTE-IDENTICAL. The launch screen did not move.**
> ✅ **`Splash.imageset/Contents.json` also unchanged: `041481917eb249533ac6dd63d283bc6190b2d0642a93deda11b2ed0f6f7b605a`.**
> 🔴 **AND YOUR REASON FOR DEMANDING HASHES WAS SOUND: the tree has been dirty all session, so `git status` showing no splash entry would have been consistent with the files being rewritten to identical content OR with a status listing I had misread. A hash is not.** ⚠️ **All three splash PNGs share one hash because they are deliberately identical copies — that is the existing design, recorded in §36, not a mistake.**

⚠️ **Also confirmed unchanged and untouched:** `LaunchScreen.storyboard` · `capacitor.config.ts` · `HGBridgeViewController.swift` · `app/app/page.tsx` · `public/icons/hatchgrab-icon.svg` (still `2d06c36a…`, still carrying its one `0F172A`) · every web asset, favicon and apple-touch-icon.

## B6. Not done

🔴 **No `xcodebuild`. No archive. No upload. No `next build`. No deploy. No commit.**

---

# PART C — INTEGRITY

## C1. Binary handling and the backup

| | |
|---|---|
| **Rasteriser** | `sharp` (existing repo dependency), SVG buffer → PNG file |
| **Header reads** | Node `fs.readFileSync` → `Buffer`, then `readUInt32BE` and direct byte indexing for `IHDR` |
| **Pixel reads** | `sharp(...).raw()` — decoded samples, not a re-encode |
| **Backup** | Python `open(...,'rb')` → `open(...,'wb')`, **read back and compared byte-for-byte: `True`** |
| **Hashes** | `sha256` over raw bytes, at every step |

> ## ✅ **NO TEXT PROCESSING TOUCHED THE PNG.** No `sed`, no `grep`, no decode/encode round trip, no editor.
> **The only string manipulation was on the SVG source text in memory, and `public/icons/hatchgrab-icon.svg` on disk is unmodified.**

**Backups held — three rollback points:**

| What | Path | sha256 |
|---|---|---|
| **Pre-830 (white, 716.8)** | `<scratchpad>/AppIcon-512@2x.PRE830.png` | **`4c1e2ba9b8d119506779d7a2b341425c0f02e1dec445bde2276b9a3653e3a506`** |
| Pre-white (white ground, same scale) | `<scratchpad>/AppIcon-512@2x.SHIPPED-white.png` | `4c1e2ba9…` *(same file, taken last turn)* |
| Original (dark ground) | `<scratchpad>/AppIcon-512@2x.BEFORE.png` | `86dd5e990473b05680bc4666276d079f294aca8fe065fb459d1c495dacd3a253` |

⚠️ **Rolling back is `node <scratchpad>/gen-appicon.js 716.8 --apply`, or a byte copy of the backup — the two produce the same result because the generator is deterministic.**

## C2. Non-ASCII census

> ## 🔴 **NO TEXT FILE WAS EDITED. Saying so explicitly rather than reporting an empty census.**
> **This task changed exactly one file and it is a PNG.** `Contents.json` unchanged by hash (A7). `project.pbxproj` byte-identical (B3). **Both baked `capacitor.config.json` files were REGENERATED by `cap sync` and came back byte-identical by hash (B4)** — rewritten by a tool, but not changed.
> **A before/after census has no subject.**

## C3. ⚠️ THE PAIR COUNT FOR **THIS** REPORT — checked before asserting

```
docs/app-icon-report.md
  U+26A0 count  ==  U+FE0F count      : EQUAL
  bare U+26A0 (no variation selector) : 0
  -> PAIRED
```

🔴 **Stated as an equality rather than as two literals, deliberately: this section sits inside the file it measures, so any later edit moves the numbers and would turn a true statement into a stale one.** ⚠️ **The property that matters — equal counts, zero bare glyphs — survives editing; the literals do not.** ✅ **Verified by scanning the written file, not by trusting the intent — the check that caught two bare glyphs two reports ago.**

## C4. Byte scan — text files, byte-level, never `grep`

| File | Bytes | NUL | Control |
|---|---|---|---|
| `ios/App/App/capacitor.config.json` *(regenerated by `cap sync`)* | 982 | **0** | **none** |
| `android/app/src/main/assets/capacitor.config.json` *(regenerated)* | 770 | **0** | **none** |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json` | 218 | **0** | **none** |
| `ios/App/App.xcodeproj/project.pbxproj` | 16,075 | **0** | **none** |
| `ios/App/App/PrivacyInfo.xcprivacy` | 4,763 | **0** | **none** |

✅ **Clean.** 🔴 **Both files `cap sync` wrote are included — a tool wrote them, which is the case this rule exists for.**

⚠️ **THE PNG IS DELIBERATELY EXCLUDED FROM THE NUL SCAN. `AppIcon-512@2x.png` contains 2,594 NUL bytes and that is CORRECT** — a PNG is compressed binary and NUL is an ordinary byte in a `zlib` stream. 🔴 **Applying a text check to it would report a defect that is not one.** **Its integrity is established by A3–A6: header fields, chunk absence, channel count, corner and mark probes, bounding box and sha256.**

## C5. Byte scan of this report — separate pass, AFTER writing

Result appended at the foot of this file.

## C6. `git status` and `git diff --stat` — with THIS task's entry named

```
$ git status --porcelain
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
 M ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
 M lib/plan-features.ts
?? docs/app-icon-report.md
?? docs/device-naming-report.md
?? docs/printing-ui-report.md
?? docs/push-registration-report.md
?? docs/settings-grouping-report.md
```

```
$ git diff --stat
 app/dashboard/[token]/page.tsx                     |  96 ++++++++++++---------
 app/landing/page.tsx                               |   4 +-
 components/native/NotificationSettings.tsx         |   2 +-
 components/native/OperatorDeviceConfig.tsx         |   4 +-
 components/printing/PrintingSettings.tsx           |  21 +++--
 .../AppIcon.appiconset/AppIcon-512@2x.png          | Bin 14883 -> 16103 bytes
 lib/plan-features.ts                               |   2 +-
 7 files changed, 75 insertions(+), 54 deletions(-)
```

**Which is which, stated plainly:**

| Entry | Whose |
|---|---|
| 🔴 **`AppIcon.appiconset/AppIcon-512@2x.png` — `Bin 14883 -> 16103`** | **THIS TASK** *(and the white-ground change before it — see below)* |
| ✅ `docs/app-icon-report.md` | THIS TASK |
| `app/landing/page.tsx`, `components/native/NotificationSettings.tsx`, `components/native/OperatorDeviceConfig.tsx` | earlier — the device-naming copy sweep |
| `components/printing/PrintingSettings.tsx` | earlier — the printing lead-time layout move |
| `lib/plan-features.ts`, `app/dashboard/[token]/page.tsx` | earlier — the ticket-printing plan cell and the settings grouping |
| the four other `docs/*.md` | earlier — their reports |

⚠️ **THE ICON LINE IS CUMULATIVE, AND THAT IS WORTH BEING PRECISE ABOUT.** `Bin 14883 -> 16103` compares against the **last committed** state, which is the **dark-ground 716.8 icon**. **It therefore represents TWO uncommitted changes: last turn's ground white-out (14,883 → 14,488) and this turn's enlargement (14,488 → 16,103).** 🔴 **This task's contribution alone is `4c1e2ba9…` → `eee55618…`.** 🔴 **Nothing is committed.**

---

# PART D — WHAT TO CHECK ON THE DEVICE

**Rebuild and reinstall first — the icon is compiled into the app bundle, so nothing below changes until Xcode builds and installs a fresh copy. Deleting the old app before installing forces the home screen to re-render the tile rather than reuse a cached one.**

1. **iPhone home screen, LIGHT wallpaper.** 🔴 **This is the test that matters.** Does the tile read as a distinct object, or does its white ground blend into the wallpaper so only a floating orange bolt is visible?
2. **iPhone home screen, DARK wallpaper.** The white ground should be unmissable here — if it looks good on dark and vanishes on light, that confirms the ground rather than the mark is the problem.
3. **iPad home screen.** The tile renders larger, so the mark should be comfortable. **If it reads on iPad but not on iPhone, the issue is size-dependent and a further scale bump is not available — 830 is already near the A3 margin floor.**
4. **The glance test, at arm's length, in a full page of apps.** Do not study it — look away and look back. **Can you find HatchGrab without reading labels?**
5. **The corners.** With 104 px of margin the bolt should sit clear of the rounded mask. **Check that the top and bottom tips do not look pinched against the curve.**
6. **Next to the launch screen.** Open the app: the tile is white, the splash is `#0F172A`. **Confirm that transition reads as deliberate rather than as two different brands.**
7. **iOS 18 dark / tinted icon modes**, if you use them. **The set declares only the light `universal` entry, so iOS derives those itself and the result is not predictable from the file.**

> ## ⚠️ AND THE ONE THING TO HOLD ONTO WHILE LOOKING: **ENLARGING DID NOT CHANGE THE CONTRAST.**
> **`#EF8B2C` on `#FFFFFF` is 2.50:1 — before and after. The colours did not move; only the size did.** 🔴 **So if the mark still does not read on a light wallpaper, MORE SIZE IS NOT THE ANSWER — 830 is already at the margin floor, and 880 was excluded for crowding the corners.**
> 🔴 **THE ANSWER AT THAT POINT IS AN ORANGE GROUND** — flip it, so the tile is `#EF8B2C` with a white or navy mark. **A solid orange tile is unmistakable at any size on any wallpaper, and it needs no contrast between mark and background to be FOUND, only to be READ.** ⚠️ **That is a different decision from this one and is not proposed here.**

---

# PROVENANCE

**READ** — the shipped icon's hash before applying · the generator's output · the applied file's header, chunks, channels, corner and mark probes, bounding box, pixel count and hash · the scale-830 preview's same measurements for comparison · `Contents.json` hash and content before and after · `project.pbxproj` hash, the four PrivacyInfo lines and the Resources count on both sides of the sync · the full `cap sync` output · `plutil -lint` · both baked configs and their hashes on both sides · **all three `Splash.imageset` PNG hashes plus its `Contents.json`, recorded before the task and re-read after the sync** · the five-file byte scan · this report's own pair count · `git status`, `git diff --stat`.

**INFERRED** — that the compiled `.app` will carry this artwork (the catalogue reference is read; **nothing was built**) · that 104 px clears the iOS corner mask comfortably (geometry, **not seen**) · that iOS 18 tinted/dark derivation is unpredictable from a single light entry.

**NOT VERIFIED** — 🔴 **the icon has still never been seen on a device, at any size.** Every claim above describes a 1024 px file and a project tree. **Part D is the only thing that can settle whether the change achieved what it was for.**
