# disk-cleanup-1: free disk space safely and stop builds from filling the disk again

15 November 2026. Tooling only; no website or app code changed. No deploys. Nothing uploaded anywhere.

**Status: steps 1–3 done and committed. Step 4 (resume android-1-1) is STOPPED pending one decision (§7).**

## 1. Brief check

- **Garbled spans: none.**
- **One reading I made, not a contradiction.** The rule "do not touch … the repo's source, docs or .git" sits with the deletion rules. Step 3 explicitly asks me to commit guard scripts and add a section to `docs/reference-manual.md`, so I read the rule as "delete nothing there". I removed nothing from source, docs or .git. I added the guard and edited the manual.
- **A contradiction that appeared once the numbers were in (§7).** Step 3's guard refuses to start below 40 GB free. The deletions step 2 allows leave the disk just under 40 GB once `.next` is rebuilt, and the sweep needs that rebuild. So step 4 (emulators, the AAB build, the sweep) cannot start under the guard I was asked to commit. Per the brief I stopped and am asking.

## 2. What was running, and how it was stopped

- **The hang.** The six-emulator android-1-1 loop had stopped at 17:53. The Android 14 tablet emulator failed with *"Not enough space to create userdata partition. Available: 10679.76 MB … need 12288.00 MB"*. The script then sat in `adb wait-for-device` for three hours.
- **The restart.** I restarted the loop with a 4 GB partition. It had finished the Android 14 phone, Android 14 tablet and Android 15 phone when your brief arrived.
- **Stopped as asked:**
  - The task was stopped and the runner killed.
  - `adb devices` was empty: no emulator left running.
  - Every temporary AVD (`hg14phone`, `hg14tab`, `hg15phone`) had already been deleted after its run, and none remained.
- **The dev server.** `next dev` had been running on port 3000 since 12 November. I stopped it to delete `.next` and started it again; it runs from this session in the background.

## 3. Measurements (step 1), before deleting anything

Free space before: **9.7–10 GB** (`df -h /`: 460 GB volume, 98% used on the Data volume).

**Xcode and simulators**

| Item | Size | Notes |
|---|---|---|
| `~/Library/Developer/Xcode/DerivedData` | 714 MB | |
| `iOS DeviceSupport` | 11 GB | iPad13,19 **26.6.1** (5.5 GB); iPhone13,4 **27.0** (5.9 GB) |
| `Xcode/Archives` | 34 MB | three archives, listed in §5 |
| `~/Library/Developer/CoreSimulator` | 10 GB | all of it is `Devices` (23 simulators). Largest: iPad Pro 11 M5 iOS 27 (2.3 GB), iPhone 18 Pro iOS 27 (2.3 GB), iPad Pro 11 M5 iOS 26.5 (1.9 GB), iPhone 17 Pro iOS 26.5 (1.9 GB), iPhone 17 iOS 27 (1.3 GB); the rest ~0. No unavailable devices. |
| Simulator runtimes (`xcrun simctl runtime list`) | 15.4 GB | **iOS 26.5 (23F77)** and **iOS 27.0 (24A434)** only. Total under `/Library/Developer/CoreSimulator`: 19 GB. |

**Android**

| Item | Size |
|---|---|
| AVD `Android_Phone` (API 36, Android 16) | 5.1 GB |
| AVD `Android_Tablet` (API 35 tablet) | 6.8 GB |
| system image android-34 google_apis | 4.2 GB |
| system image android-35 google_apis_tablet | 4.1 GB |
| system image android-36 google_apis | 4.3 GB |
| system images android-37.2-beta3 (two) | 4 KB each (empty) |
| whole SDK | 15 GB |

**Caches**

| Item | Size |
|---|---|
| `~/.gradle/caches` (whole `~/.gradle`: 2.6 GB) | 1.6 GB: `9.5.0` 703 MB (transforms 700 MB), `8.14.3` 546 MB (transforms 535 MB), `modules-2` 371 MB |
| `~/.npm` | 367 MB |
| `~/Library/Caches/ms-playwright` | 853 MB: chromium-1243 359 MB, chromium_headless_shell-1243 195 MB, webkit-2359 296 MB, ffmpeg-1011 2.5 MB |
| `~/.cache` | 1.5 GB, almost all `puppeteer`: Chrome and headless shell 144, 146 and 148, ~185–341 MB each |

**The repo**

| Item | Size |
|---|---|
| `.next` | 4.0 GB (`dev` 2.9 GB, `server` 1.1 GB) |
| `node_modules` | 13 GB, of which **`node_modules/.cache` is 11.4 GB** (1,454 folders of harness caches; see §5) |
| top 15 packages | @anthropic-ai 238 MB (claude-code 215), googleapis 194, next 155, @next 101 (swc-darwin-arm64 100), @capacitor 67, @sparticuz/chromium 66, lucide-react 45, posthog-js 39, @capacitor/android 24, typescript 23, @anthropic-ai/sdk 23, @aparajita/capacitor-biometric-auth 20 MB |
| `android/app/build` | 169 MB |
| `android/.gradle` | 25 MB |
| `plugins/hatchgrab-net-printer/android/build` | 7.4 MB (untracked build output) |
| test-results / playwright-report | none exist |
| docs screenshot folders over 50 MB | only `docs/france-1` (53 MB). All of `docs` is 549 MB; `.git` is 680 MB. |

**Trash and snapshots**

- `~/.Trash`: **could not be measured**. macOS refuses (`Operation not permitted`) because this terminal has no Full Disk Access. Finder shows its size.
- Time Machine local snapshots (`tmutil listlocalsnapshots /`): **none**.

## 4. Deleted (step 2), all regenerable

| What | Freed | Notes |
|---|---|---|
| DerivedData contents | 714 MB | now 0 B |
| iOS DeviceSupport older than 26 | 0 | none: both folders are 26.6.1 and 27.0, so both kept |
| `xcrun simctl delete unavailable` | 0 | ran; there were none |
| Simulator runtimes other than iOS 26.5 / 27 | 0 | none: those two are the only runtimes |
| AVDs except one Android 16 phone | 6.8 GB | **`Android_Tablet` deleted**; **`Android_Phone` (API 36) kept** |
| System images not used by `Android_Phone` | 8.3 GB | android-34, android-35 tablet, both 37.2-beta3 (`sdkmanager --uninstall`, then empty folders removed). **Kept: android-36 google_apis.** |
| Gradle | ~1.2 GB | caches were 1.6 GB, under 10 GB, so only `caches/*/transforms` entries older than 7 days went (3,150 + 2,045 entries). There is no `build-cache-*` folder. Now 390 MB. |
| `npm cache clean --force` | ~240 MB | 129 MB left (npm's index) |
| Playwright other versions | 0 | the repo pins chromium 1243 / webkit 2359, the only versions present |
| Repo `.next` | 4.0 GB | `next dev` stopped first and restarted after |
| Repo `android/app/build` | 169 MB | |

**Free space:**
- **Before:** 10 GB.
- **After the deletions:** 43 GB. macOS took a few minutes to report the space released from the deleted images.
- **Now:** 39.4–40 GB. A guarded production build rebuilt `.next` (now 1.1 GB plus build caches), because several swept harnesses read `.next/static`.

**Not emptied, not deleted, as briefed:** the Trash and the Xcode Archives.

## 5. For you to decide (nothing done)

- **Xcode Archives** (34 MB in all):
  - `2026-08-20/App 20-08-2026, 15.09.xcarchive` (11 MB)
  - `2026-08-20/App 20-08-2026, 16.31.xcarchive` (11 MB)
  - `2026-08-27/App 27-08-2026, 21.22.xcarchive` (11 MB)
- **The Trash:** size unknown (see §3). Emptying it in Finder is your call.
- **`node_modules/.cache` — 11.4 GB, the biggest regenerable item, but not on the brief's delete list.**
  - It holds 1,454 folders of harness caches.
  - `lp2-messages` alone is 988 MB (593 content-hash folders written by `_lp2-frozen.cjs`).
  - The rest are mostly one folder per past workstream or agent (e.g. `country-settings-parity` 130 MB, `pricing-pages` 126 MB, `us-readiness` 92 MB), plus timestamped one-offs (`ab-snap-*`, `np-snap-*`, `cr-snap-*`) written by agents, not by committed scripts.
  - 1,415 of the folders are over 7 days old. Everything there is rebuilt on demand.
  - From now on `lp2-messages` prunes itself (§6), at that harness's next run.
- **Old Puppeteer Chrome builds — about 1 GB.** Puppeteer 24.43.1 uses Chrome 148; the 144 and 146 Chrome and headless-shell folders in `~/.cache/puppeteer` are unused.
- **Simulator devices — 10 GB.** The iOS 26.5 / 27 simulators hold app data from testing (2.3 GB each for the largest). `xcrun simctl erase <device>` returns a device to new without removing it. Not on the list, so left alone.
- **iOS DeviceSupport — 11 GB.** Two iOS versions, both 26 or newer, so kept per the brief. They come back the next time those devices connect to Xcode.

## 6. The guardrails (step 3), committed

- **`scripts/_disk-guard.cjs`: the one place the thresholds live.**
  - It refuses to start below **40 GB** free (exit 3).
  - Every 15 seconds during a run, it checks free space. Below **20 GB** it prints why, runs the registered clean-ups and exits 4. Puppeteer and Playwright kill their browser on process exit.
  - It does nothing on Vercel or CI, so a deploy build is never blocked.
  - A shell CLI (`free` / `check` / `watch <pid>`) serves the shell scripts.
  - `HG_DISK_MIN_START_GB` / `HG_DISK_MIN_RUN_GB` exist; the manual says only you change them.
- **Every screenshot script, and the sweep runner.**
  - The 79 `.cjs` scripts that launch a browser, plus `run-harnesses.cjs`, start with `require('./_disk-guard.cjs').guard(__filename)`. That's one line each; each changed file differs only by that line.
  - The five `.js` scrapers were left alone: they aren't build, emulator or screenshot scripts.
  - ⚠️ The sweep runner checks only at its start, because `spawnSync` blocks its timer while a harness runs. The guarded harnesses watch themselves.
- **Builds: `scripts/guarded.sh <command…>`.** It wraps any build (`npx next build`; `./gradlew bundleRelease`) with the start check and the watcher. No repo script runs a build itself. `npm run build` was deliberately not hooked, because Vercel runs it.
- **Xcode builds by scripts: `scripts/ios/xcodebuild-scratch.sh <args>`.** DerivedData goes to a throwaway folder (`HG_SCRATCH`, an agent's session scratch folder), which is deleted on exit. `HG_KEEP_APP=<folder>` copies the built `.app` out first. No committed script ran `xcodebuild` before this; my earlier iOS test builds did, and now this is the way.
- **Emulators: `scripts/android/emulator-checks.sh <tag> <system-image> <device> <phone|tablet>`.** This is the android-1-1 runner, committed.
  - **One device at a time.** A lock, plus a refusal if any emulator is attached.
  - A **temporary AVD** `hg-<tag>` with a **4 GB data partition**, booted with **`-no-snapshot`**.
  - **Deleted on exit**, however the run ends, including a low-space stop.
  - A system image the run had to download is uninstalled afterwards.
  - The start check runs before anything is written.
  - Since the android-1-1 runs, it also answers the notification prompt for good as "Don't allow" (it came back after the dark-mode switch and covered the page). It also rotates tablets by their natural orientation: the Pixel Tablet is natural landscape, so the old "landscape" shot was really portrait. That was the one failure on the Android 14 tablet.
- **Screenshot output.**
  - Every committed screenshot harness already writes fixed file names into its own folder, so a re-run overwrites. None adds a timestamped folder. I checked every `Date.now()` / `toISOString()` near a path or `mkdir` in `scripts/`.
  - The one script that grew without limit was `_lp2-frozen.cjs`: a new content-hash folder for every catalogue, never removed. It now touches the folder in use and removes any other folder unused for 2 days. Two days, not zero, so a concurrent run on another catalogue keeps its folder.
- **The manual.** V16.26 adds a standing rule, "DISK SPACE", near the top (next to the other standing rules), plus a changelog entry. The header and front matter were both bumped.

**Proved:**
- `check` passes at 42.9 GB and refuses (exit 3) with a 9999 GB threshold.
- `guarded.sh` passes the child's exit code through (7), refuses (3), and stops a running `sleep 30` (4).
- The Node watcher runs the registered clean-up, then exits 4.
- `VERCEL=1` does nothing.
- All 80 edited scripts pass `node --check`.
- With the guard line in place:
  - `language-phase-2` passed: 2024 passed, 0 failed. It uses `_lp2-frozen.cjs`.
  - `country-settings-parity`, a guarded swept harness, passed.
- After the build, at 39.4 GB, the seven other guarded swept harnesses were **refused** by the guard. That's the guard working, and why §7 exists.

## 7. ⛔ The decision needed before step 4

**Free space is ~40 GB. Every build, emulator and screenshot run now needs 40 GB to start.**

**What step 4 needs:**
- Each emulator run downloads its system image (~4 GB) after its start check.
- The AAB build is guarded.
- The sweep refuses at the start below 40 GB.

**The deletions the brief allows are used up.** The only space left that I could clear without a new decision is the `.next` build output, and the sweep needs it.

**Options:**
1. **Delete `node_modules/.cache`** (11.4 GB, regenerable, about 51 GB free afterwards). Optionally also the old Puppeteer Chromes (about 1 GB). **This is my recommendation.**
2. Empty the Trash yourself (size unknown), then I continue.
3. Lower the start threshold for this workstream only (e.g. 30 GB).

## 8. android-1-1: where it stands

- **Results so far.** All runs used the minified, signed release build, one emulator at a time, and each temporary AVD was deleted after use.
  - **Android 14 phone:** 13 passed, 0 failed. The Terms link now opens the phone's browser through the bare-host hand-off, tested against a local www host.
  - **Android 15 phone:** 13 passed, 0 failed.
  - **Android 14 tablet:** 13 passed, 1 failed. The failure was the runner's rotation bug, now fixed.
- **Still to do once space allows:**
  - re-run all six devices with the committed runner (Android 14/15/16 phone, then the tablets);
  - restore the production config;
  - build the signed AAB;
  - run the sweep;
  - write the android-1-1 report and manual entry.
- ⚠️ **The local test config is currently baked into `android/app/src/main/assets`.** It's the `nip.io` host and isn't committed: the file is generated by `cap sync`. It must be re-synced to production before the AAB is built. The committed `capacitor.config.ts` still defaults to `https://www.hatchgrab.com`.

## 9. Commits

- disk-cleanup-1: the guard, `guarded.sh`, `xcodebuild-scratch.sh`, `emulator-checks.sh`, the guard line in 80 scripts, `_lp2-frozen.cjs`'s prune, manual V16.26, and this report.
- android-1-1's own uncommitted changes (Android project, packages, Capacitor config, the Access denied line, its re-pinned harnesses) were **left out** of this commit.

## Undo (only if Dominic asks)

`git revert <the disk-cleanup-1 commit>` removes the guard, the wrappers and the manual section. Nothing deleted in §4 needs restoring by hand; it all regenerates:
- `sdkmanager "system-images;android-34;google_apis;arm64-v8a"` and the like;
- an AVD from Android Studio's Device Manager;
- the next build or `npm` run.
