# manual-update-1: reference manual catch-up + read-only System Data check

16 November 2026. Documentation only. No code changes, no deploys, nothing deleted, and no `.env`, keystore or `~/.googleplay` file opened.

## 0. Brief check

- **Garbled spans: none.**
- **One reading, not a contradiction.** The rules say "no deletions", and step 1 says "remove anything in the manual now superseded". I read "no deletions" as files and data (the System Data check is measure-only) and removed superseded text from the manual as step 1 asks. The manual's own convention is to leave a short ⛔ pointer where text was removed, and I followed it, so nothing disappears without a trace.
- **Your mid-run addition** (measure Claude, Cursor, `~/.cursor`, `~/.claude`, `~/.local/share/claude`, `/opt/homebrew` and caches over 500 MB) is covered in §2.
- ⚠️ **Your commit `5e163940` "ipad fixes" (10:20) included my in-progress V16.28 manual edits.** It also added **1,208 files of build output** under `plugins/hatchgrab-net-printer/android/build/` (37,881 lines of generated Gradle intermediates).
  - That folder is regenerated on every Android build, so it will show as changed after each one.
  - I left it alone (no deletions). If you want it out, `git rm -r --cached plugins/hatchgrab-net-printer/android/build` plus a `.gitignore` line does it; that's your call.
  - The rest of the manual changes below are in my commit.

## 1. The manual (V16.28)

### 1.1 Coverage since V16.24, checked

| Workstream | Where | Status |
|---|---|---|
| app-fixes-1/2 | V16.24 | already complete; its "Open" UIScene item is now marked done |
| ios-uiscene-1: UIScene, Capacitor 8.6.2 | V16.25 | complete |
| **iOS 1.1 archive → TestFlight → submit** | **new: "Releasing the 1.1 apps"** | **was missing.** The steps lived only in the report. Added, with **Build 4**: build 3 of 1.1 is already in App Store Connect (ios-intl-1), so it can't be reused. |
| android-1-1: 1.1 / code 2, targetSdk 36, R8 + mapping, edge-to-edge | V16.27 | complete |
| **Android Play upload steps, release notes (en / fr), on-phone checks** | **new: "Releasing the 1.1 apps"** | **were only in the report.** Added: printing, biometric unlock and push before promoting; a failure means a keep rule plus versionCode 3. |
| disk-cleanup-1: thresholds, one emulator at a time, what may be cleaned | standing rule "DISK SPACE" + V16.26 | complete. Updated with the 16 Nov follow-up (`node_modules/.cache` and old Puppeteer Chromes cleared with approval; what's kept for checks) and the `$TMPDIR` leak found in §2. |

### 1.2 One "Open items" list

It sits at the top of the manual, before the changelog, and says it's the only current list. 23 items:

- **Releases, in order:**
  1. **Deploy the website first.** 22 local commits are unpushed (origin/main = `43d563c5`, 13 Nov): allergen-kitchen-1, allergen-screens-1, capacity-one-source-1/-2, app-fixes-1/-2, gusto-move-1's record, and Capacitor 8.6.2's web side. order-page-2 is already pushed; check it's live.
  2. iOS 1.1 build 4 → TestFlight → submit.
  3. Android 1.1 internal testing → production.
  4. Play countries (needs `~/.googleplay/hatchgrab-play.json`; by hand if production's release is "completed").
  5. App Privacy and age rating.
- **Checks only people can do:**
  6. Native-speaker checks, **bn / hi / ur "log in" first**, then each language's list (moved from §89.14).
  7. **Le Roi fixes their allergens by hand.**
  8. The country terms (a lawyer).
- **Investigations and defects:**
  9. **gusto-move-1's root cause.**
  10. Non-Latin ticket printing.
  11. The capacity-window defect.
  12. The 5 failing legal harnesses.
  13. The two-key rotation, still recorded as open in the standing rule; you confirm or strike it.
- **Unfinished build work:**
  14. languages-world-2.
  15. The billing switch-on, plus locking the account after the pause.
  16. Two wording decisions.
  17. local-notifications 8.3's permission.
  18. **New: the harness temp-folder leak (§2.3).**
- **Backlog:**
  19. VAT capture.
  20. Threshold logging.
  21. The sanctions check (9 countries held).
  22. OSS.
  23. Non-Latin printing (same as item 10).
- **Flagged as not re-verified:** §36's "Still open on Android (V11.43)" engineering notes. Check them against the code before acting.

### 1.3 Superseded text removed (each replaced by a one-line ⛔ pointer)

- §89.13 "What is pushed and what is run (OBSERVED 12 Nov)": an out-of-date snapshot.
- §89.14 "Backlog (V16.18)": still-open items moved into the list; done items dropped (`android_app_available`, Mexico's badge, the 167-country switch-on).
- V16.24's "Open" UIScene item: done in V16.25.
- §89.7's ios-intl-1 "Open:" line: now in the list and the release steps.
- The V11.54 "three Play advisories deferred" paragraph and §36's three-item detail: R8 has been on since V16.27.
- "`@capacitor/status-bar` is one patch behind": now 8.0.4, iOS only.
- The versionCode note gains "Android 1.1 is versionCode 2".

**Kept on purpose:** the per-version "Open items" lists inside old changelog entries (V13.3–V14.5). They're dated history. The new list's header says they aren't current, so nothing competes with it.

### 1.4 Checks

- **Version strings agree:** the header reads V16.28 and the front matter "Version 16.28".
- **Harnesses and the manual:** I ran the 12 swept scripts that mention `reference-manual`.
  - **None reads the manual's text.** Two (`reviews-weather-1`, `loyalty-1`) check its path in a changed-files list. The rest name it in a comment, or only in the disk-guard line that disk-cleanup-1 added to screenshot scripts.
  - **11 of 12 pass.** The exception, `event-types-render.cjs`, failed 8 layout measurements. It's the known flaky layout harness, it doesn't read the manual, and it passed in the full sweep on 15 November.
- **No uncommitted reports** were found: everything from earlier workstreams was already committed.

## 2. System Data check (read-only; nothing deleted)

Free space now: **65 GB** (`df -h /`, 460 GB disk).

⚠️ **Blocked by macOS** (this terminal has no Full Disk Access): `~/Library/Containers` (678 folders refused), `~/Library/Group Containers` (298), parts of `~/Library` (Mail, Messages, Safari, Photos, Shortcuts, Weather, Suggestions, HomeKit and others), part of `/Library/Developer/CoreSimulator/Volumes`, and `/Library/Application Support/Google/GoogleUpdater`. Those show as 0 below, but they aren't really empty. macOS's Storage settings shows their sizes.

### 2.1 Where it is

**`~/Library` (top entries; the rest under 0.1 GB or blocked)**

| Size | Folder |
|---|---|
| 77.9 GB | Application Support (below) |
| 16.1 GB | Developer: Xcode iOS DeviceSupport 11.4 GB (iPad 26.6.1, iPhone 27.0), CoreSimulator devices 4.7 GB (the 2 kept simulators), Archives 0.03 GB |
| 6.8 GB | Caches (below) |
| 6.7 GB | Android (SDK: android-36 image 4.1 GB, tools) |
| 0.2 GB | Logs |

**`~/Library/Application Support` (top 15; the rest are 0.0)**

| Size | Folder | What it is |
|---|---|---|
| **43.5 GB** | `com.apple.wallpaper/aerials/videos` | **72 downloaded macOS Aerial wallpaper / screen-saver videos** (~0.6–1.4 GB each) |
| **21.6 GB** | `Cursor` | `snapshots/stores` **17.7 GB** (Cursor's agent checkpoints), `snapshots/roots` 0.9, `CachedData` 1.0, `User/globalStorage` 0.8 (cursor-agent-worker 0.7), WebStorage 0.3, CachedExtensionVSIXs 0.3, logs 0.1 |
| **12.4 GB** | `Claude` | **`vm_bundles/claudevm.bundle/rootfs.img` 8.7 GB** (+ `rootfs.img.zst` 1.2 GB, kernel / initrd / sessiondata ~0.1): the Claude desktop app's Linux VM disk image. Also Cache 1.3, Code Cache 0.35, `claude-code-vm/2.1.325` 0.34 (the `claude` binary, 348 MB) and `claude-code/2.1.325` 0.32 (331 MB). |
| 0.4 GB | Google | |
| 0.0 | Code (VS Code) 8 KB; Android Studio settings 12 MB | |

**Other folders you asked about**

| Size | Folder |
|---|---|
| 1.0 GB | `~/.cursor`: `extensions` 0.98 GB |
| 2.3 GB | `~/.claude`: `projects/-Users-dominicbonini-dev-village-foodie` 2.24 GB (Claude Code session transcripts and this project's memory), file-history 0.08 |
| absent | `~/.local/share/claude` |
| absent | `/opt/homebrew` (no Homebrew) |
| absent | Docker (no Docker Desktop data) |

**`~/Library/Caches` over 500 MB**

| Size | Folder |
|---|---|
| 2.44 GB | `Google`: Chrome 1.74 GB, AndroidStudio2026.1.2 0.70 GB |
| 1.41 GB | `com.todesktop.230313mzl4w4u92.ShipIt`: Cursor's auto-updater, one staged update (`update.b9JFRpz`). It read 2.82 GB an hour earlier and changed during the check. |
| 0.85 GB | `ms-playwright`: chromium 1243, headless shell 1243, webkit 2359 (the repo's pinned versions) |

**`/Library` (top)**

| Size | Folder |
|---|---|
| 20.7 GB | Developer: **CoreSimulator 19.1 GB** (runtime volumes 16 GB: iOS 26.5 + 27.0 = 15.4 GB of disk images; `Caches/dyld` 3.0 GB), CommandLineTools 1.3 GB, DeveloperDiskImages 0.13, CoreDevice 0.13 |
| 1.0 GB | Bitdefender |
| 1.0 GB | Application Support |
| 0.1 GB | Logs |

**`/private`**

| Size | Folder |
|---|---|
| **92 GB** | `/private/var/folders/zj/…` (this user): **`T` = `$TMPDIR` 90 GB**, `C` 0.6 GB (§2.3) |
| 2.0 GB | `/private/var/vm`: `sleepimage` 2.0 GB (hibernation; no swap files at the time) |
| 1.5 GB | `/private/var/db/diagnostics`: the only log folder over 1 GB (unified logs). `/private/var/log` 0.09, `~/Library/Logs` 0.2, `/Library/Logs` 0.1. |
| 1.6 GB | `/private/tmp`, of which 1.5 GB is agent scratch (`/private/tmp/claude-501`) |

**VM and disk images over 1 GB:**
- `Claude/vm_bundles/claudevm.bundle/rootfs.img` (8.7 GB) and its `.zst` (1.2 GB);
- the Android 16 system image (4.1 GB);
- `Android_Phone.avd/userdata-qemu.img.qcow2` (2.0 GB);
- no `.vmdk`, `.sparseimage`, `.dmg` or `.iso` over 1 GB in `~` or `~/Library`.

**`/Applications` (20 GB in all; `~/Applications` 4 MB)**

| Size | App |
|---|---|
| 4.0 | Xcode |
| 3.2 | Android Studio |
| 2.5 | Microsoft Word |
| 2.3 | Microsoft Outlook |
| 2.2 | Microsoft Excel |
| 1.4 | Cursor |
| 1.2 | Microsoft OneNote |
| 0.7 | WhatsApp |
| 0.7 | Google Chrome |
| 0.7 | OneDrive |
| 0.6 | Claude |
| 0.3 | Google Drive |
| 0.2 | NordVPN |
| 0.2 | Bitdefender |
| 0.2 | Gemini |

All in GB.

### 2.2 Reconciling with macOS's figures

- **System Data (173 GB).** Measured, it's mostly:
  - `$TMPDIR` 90 GB;
  - Aerial videos 43.5 GB;
  - Cursor 22 GB;
  - Claude 12 GB;
  - Xcode / simulator support 36 GB, part of which macOS files under "Developer";
  - caches, logs, sleepimage and Bitdefender, about 12 GB.

  macOS also counts APFS purgeable space and the blocked Containers there, so the totals won't match exactly.
- **Applications (110 GB): the bundles in `/Applications` total only 20 GB.**
  - macOS's "Applications" category also counts data it attributes to apps. That likely includes the iOS simulator runtimes (15.4 GB), Xcode's support files and app containers.
  - I can't attribute the remaining ~90 GB from the terminal: some of it sits in the blocked Containers, and macOS doesn't show how it assigns the category.
  - Settings → General → Storage → Applications lists the apps by the size macOS assigns them.

### 2.3 🔴 The main finding: the test harnesses fill `$TMPDIR`

`/private/var/folders/zj/…/T` holds **14,465 leftover folders, 90 GB**. They're the "broken variant" copies the harnesses make with `mkdtempSync` and never remove:

| Size | Prefix | Folders | Made by |
|---|---|---|---|
| 17.7 GB | `dot-v*` | 288 | `dot-overlap-labels.cjs` |
| 9.8 + 4.2 + many 1.4 GB groups | `cmp-*` | hundreds | `compare-no-system.cjs` and the compare harnesses |
| 4.0 GB | `ran-v*` | 69 | |
| 2.7 GB | `et-render-*` | 42 | `event-types-render.cjs` |
| 1.9 GB | `slot-v*` | 3,333 | |
| 1.6 GB | `wp-var-*` | 690 | `weekly-post.cjs` |

Of the 109 scripts that `mkdtempSync`, **54 contain no removal at all**.

**By day:** 46.5 GB on 13 Nov, 31 GB on 15 Nov (the android-1-1 sweeps), 7.8 GB today. **A full sweep leaves ~30–45 GB.** That's very likely why the disk reached 98% on 15 November. The disk guard checks free space only, so it notices late.

This is now Open item 18 in the manual. The fix is a shared temp helper that removes its folder on exit. That's a code change, not done here.

### 2.4 What could be removed safely (nothing was deleted)

| Frees | What | How | Risk |
|---|---|---|---|
| **~90 GB** | Harness temp folders in `$TMPDIR` (`dot-*`, `cmp-*`, `slot-*`, `ran-*`, `wp-var-*`, `et-render-*`, …) | While no harness or sweep is running: `find "$(getconf DARWIN_USER_TEMP_DIR)" -maxdepth 1 -mindepth 1 \( -name 'dot-*' -o -name 'cmp-*' -o -name 'slot-*' -o -name 'ran-*' -o -name 'wp-var-*' -o -name 'et-render-*' \) -exec rm -rf {} +` (a restart also clears items unused for 3 days). | None: they're throwaway copies. **They come back with every sweep until Open item 18 is fixed.** |
| **~43 GB** | Downloaded Aerial wallpaper / screen-saver videos | System Settings → Wallpaper and Screen Saver: choose a non-Aerial wallpaper and screen saver, then delete `~/Library/Application Support/com.apple.wallpaper/aerials/videos/*.mov` (with Settings closed). | None: macOS re-downloads an Aerial if you pick one again. |
| **~18 GB** | Cursor's agent checkpoints (`Cursor/snapshots`) | Quit Cursor, delete `~/Library/Application Support/Cursor/snapshots`. | Loses Cursor's restore-checkpoint history only. |
| **~26 GB** | All of Cursor, if you no longer use it | Uninstall Cursor.app (1.4 GB), then `~/Library/Application Support/Cursor` (22 GB), `~/.cursor` (1 GB) and the ShipIt cache (1.4 GB). | Loses Cursor's settings and history. |
| ~10 GB | Claude desktop's Linux VM image (`claudevm.bundle`) | Only if you don't use the Claude app's VM features. Quit Claude and delete `vm_bundles`. | The Claude app downloads it again the next time a feature needs it. Low priority. |
| ~11 GB | Xcode iOS DeviceSupport (iPad 26.6.1, iPhone 27.0) | Xcode → Settings, or delete the folders, **after** the iOS 1.1 TestFlight check. | Rebuilt (slowly) the next time those devices connect. Keep until 1.1 is out. |
| ~8 GB | The iOS 26.5 simulator runtime | `xcrun simctl runtime delete` after 1.1. | You asked to keep both runtimes for now. |
| ~3 GB | Simulator dyld cache | Rebuilt automatically. | Small gain; not worth it alone. |
| ~1.7 GB | Chrome's cache | Chrome → Delete browsing data → Cached images and files. | None. |
| ~0.7 GB | Android Studio caches | File → Invalidate Caches, or delete the folder. | None. |

**Leave alone:**
- `/private/var/vm/sleepimage` and `/private/var/db/diagnostics` (system);
- `~/.claude/projects` (2.2 GB: Claude Code's transcripts and this project's memory folder);
- Playwright (the repo's pinned versions);
- the Android 16 AVD and its image (kept for checks).

**Removing the first three rows would free about 150 GB.**

## Undo (only if Dominic asks)

`git revert <this report's commit>` restores the manual's V16.27 text. No files or data were deleted, so there's nothing else to undo.
