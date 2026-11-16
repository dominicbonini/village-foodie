# tmp-cleanup-1: stop test runs leaving files behind, clear what's there, untrack the plugin build output

16 November 2026. Tooling only. No app or website code changed, no deploys, no data changes. No `.env`, keystore or `~/.googleplay` file was opened.

## 0. Brief check

- **Garbled spans: none. Contradictions: none.**
- **Step 3's stop condition was checked first.** The "ipad fixes" commit held nothing secret or misplaced (§3), so nothing needed stopping for.
- **One addition beyond the letter of step 2.** Step 2 covers sweep scripts. I also added the clean-up to **77 hand-run screenshot and render scripts** outside the sweep: they leaked the same way, and the change is one line each with the same behaviour (§2.2).
- **Something I didn't do:** the macOS **Aerial wallpaper videos (43.5 GB) were removed during this session, outside this workstream.** That folder is now 15 MB. I didn't touch it; it explains part of the free-space jump in §1.

## 1. Deleted now (step 1)

**What:**
- Every top-level entry in `$TMPDIR` (`/var/folders/zj/…/T`) that this repo's test runs created:
  - the folders made with `mkdtemp` under the **125 prefixes** the repo's scripts use. The list is read from the scripts at run time (e.g. `dot-v3-…`, `cmp-f2hi-…`, `slot-…`, `et-render-…`, `wp-var-…`);
  - the repo's `hg-*` render folders;
  - the temp files two scripts write directly (`fr1-flags-*.md` from `france-1.cjs`, `seq-census-*.ts` from `outreach-sequence.cjs`);
  - **browser profiles** (`puppeteer_dev_chrome_profile-*`, Chrome for Testing's temp);
  - **emulator and Xcode test scratch:** the Android emulator's `android-dominicbonini`, its `hostapd_*.conf` virtual Wi-Fi files, the XCUITest runner's folder, and SwiftPM lock files for DerivedData folders that lived in an agent scratch folder.
- The tool is the new **`scripts/harness-tmp-clean.cjs --legacy`** (dry run by default; `--apply` deletes).

**In use:**
- Before deleting, no harness, browser, emulator or Xcode build was running.
- The script also skips any entry `lsof` shows open (a file or a working directory): none were.

**Kept:**
- 259 entries, all macOS, apps or tools: `com.apple.*`, WhatsApp, Cursor, VS Code sockets, Xcode's `ibtoold-*` and `xcrun_db`, Java's `hsperfdata`, Node's `node-compile-cache`, the Kotlin daemon log, adb's log, SwiftPM's own locks.
- `org.webkit.Playwright` and `com.apple.WebKit.*+org.webkit.Playwright` were left as well. macOS creates and protects those (EPERM), and the first `--apply` run stopped on one of them. The script now counts such failures instead of stopping, and those two patterns were removed.

**Results:**

| | Before | After |
|---|---|---|
| `$TMPDIR` | **90.3 GB**, 14,465 entries | **0.04 GB**, 259 entries |
| Free space (`df -h /`) | **70 GB** | **208 GB** |

- **Freed by this clean-up: 90.3 GB.** The two `--apply` runs together removed over 14,000 entries. The first stopped at the protected WebKit folder, after the `cmp-*` folders; the second removed the remaining 13,395, 45.3 GB.
- The rest of the free-space rise (~48 GB) is the Aerial videos removed outside this workstream (§0), plus macOS releasing space.

## 2. The cause, fixed (step 2)

### 2.1 How it works now

- **`scripts/_harness-tmp.cjs`** (new) is loaded first.
  - **Where temp goes.** It points `os.tmpdir()` at **`$TMPDIR/hatchgrab-harness/<run-id>/<pid>/`**. Every `mkdtemp`, Puppeteer or Playwright profile and library temp file then lands under that **one parent**.
    - Under the sweep, `<run-id>` is the sweep's; run by hand, it's the process's own.
    - It patches `os.tmpdir()` rather than `$TMPDIR`. Chrome and esbuild still use the real temp folder: Chrome's socket paths must stay short, and both clean up after themselves.
  - **Children:** child node processes inherit it (`NODE_OPTIONS --require` plus `HG_HARNESS_TMP_DIR`) and write into the same folder. Only the process that created the folder removes it.
  - **Removal:** on `exit` (normal end, `process.exit`, an uncaught exception, an unhandled rejection) and on **SIGINT / SIGTERM / SIGHUP**. One exit handler covers every way a harness can end, which is what a try/finally in each of 277 scripts would do, without editing their logic.
    - Only SIGKILL escapes. The sweep catches that case (below).
  - **Debugging:** `HG_KEEP_TMP=1` keeps the folder and prints where it is.
  - **Safety:** nothing in it throws, so a temp problem never fails a harness.
- **`scripts/_harness-tmp-paths.cjs`** (new): the parent folder's location, shared by the three users.
- **`scripts/harness-tmp-clean.cjs`** (new):
  - removes harness runs older than 24 hours;
  - with `--legacy`, clears the old scattered folders (§1).
- **The sweep (`run-harnesses.cjs`):**
  - **At the start:** removes runs older than 24 hours, and snapshots `$TMPDIR`.
  - **For each harness:** preloads the module (`node --require`), with the sweep's run id.
  - **After each harness:** if its folder is still there (a SIGKILL), the sweep removes it and records it as **LEFT BEHIND**.
  - **At the end:** a **TEMP** section.
- **The disk guard, extended (`_disk-guard.cjs` `tempSnapshot` / `tempReport`).** The TEMP section prints:
  - how much temp the harnesses used, and the five largest;
  - anything left behind;
  - `$TMPDIR` before → after;
  - anything new in `$TMPDIR` outside `hatchgrab-harness/`, which would mean a tool ignored `os.tmpdir()`. It warns above 5 MB.

### 2.2 Which scripts

- **The sweep's:**
  - I followed every swept harness through the local scripts it `require`s and looked for `mkdtemp`, `tmpdir()`, Puppeteer or Playwright.
  - **200 of the 223** make temp folders or start a browser, directly or through a helper (`_slot-interval-compile.cjs` is the most common).
  - Each now has `require('./_harness-tmp.cjs')` as its first statement after the disk guard: **one line each**, nothing else changed in any of them, and all pass `node --check`.
  - The other 23 are covered anyway, because the sweep preloads the module into all 223.
- **Hand-run scripts outside the sweep:** the same line in **77** screenshot and render scripts.
- **Deliberately left out:**
  - the 5 scrapers (`.js`): not test scripts;
  - the `.mjs` tools (`require` isn't available);
  - the `_` helpers (covered by whatever loads them);
  - `scripts/screenshots/{anz,ie,us}-screens.cjs`, whose output folder defaults to temp. Removing it on exit would delete their screenshots. Pass them an output folder.
  - The manual lists these.

### 2.3 Proof

**A full sweep, measured before and after, inside the runner and from outside it:**

| | Before (11:26) | After (11:56) |
|---|---|---|
| `$TMPDIR` | 36.3 MB, 259 entries | **36.3 MB, 259 entries (+72 KB)** |

The runner's TEMP section:

```
harness temp used this sweep: 5.13 GB across 223 process(es) (each removed its own folder when it ended)
  largest: compare-no-system.cjs 2.55 GB · dot-overlap-labels.cjs 1.33 GB · outreach-reply-any-notes.cjs 241.9 MB · weekly-post.cjs 194.9 MB · event-types-render.cjs 92.3 MB
$TMPDIR: 36.3 MB before → 36.3 MB after (+72 KB)
✓ nothing left behind
```

- **Results: 223 run · 218 passed · 5 failed.** The 5 are the known missing translated legal files (paperwork-1, legal-languages-1, world-countries-3, contact-1, tidy-1), as before this workstream. No harness regressed from the one-line additions or the preload.
- **Free space** went from 208 to 205 GiB during the sweep. That's outside `$TMPDIR` (build and app caches); the harnesses' own 5.13 GB was all removed.

**Edge cases:**
- **A normal run:** `dot-overlap-labels.cjs` by hand left no run behind and no new `dot-*` folder.
- **A crash:** a process made a 1 MB temp folder, started a node child (it reported the same temp folder as the parent) and then threw. Nothing was left.
- **SIGTERM:** a process holding a temp folder exited **143** with nothing left.
- **A heavy harness:** SIGTERM and SIGINT sent to `dot-overlap-labels.cjs` mid-run arrived while it was inside a synchronous child step. Node runs a signal handler only after such a step finishes; the harness then ended with exit 0, again with nothing left.

## 3. Build output untracked (step 3)

- **Checked first:** the "ipad fixes" commit (`5e163940`) added 1,241 files (4.3 MB) under `plugins/hatchgrab-net-printer/android/build/`, plus my manual edits.
  - **No keystores, `.env` files, mapping files or archives.**
  - The `.properties` files are Gradle build metadata. `snapshot.gz` is Android lint's SDK index. The 16 binaries are the plugin's own compiled classes.
  - Searching every text file for signing or secret patterns (store / key passwords and aliases, private keys, client secrets, API keys, Stripe / AWS / service-role keys) found **0** matches. Only file names were listed; no contents were printed.
  - Nothing was over 1 MB.
- **Done:** `git rm -r --cached plugins/hatchgrab-net-printer/android/build`. The files stay on disk. Commit `638de8c9`.
- **`.gitignore`** gains `/plugins/*/android/build/`, `/plugins/*/android/.gradle/`, `/plugins/*/android/.cxx/`, `/plugins/*/ios/build/`, `/plugins/*/.build/`. `git check-ignore` confirms the folder is now ignored.
- **No other build folders are tracked.** One related file I left alone: `plugins/hatchgrab-net-printer/.swiftpm/xcode/xcuserdata/…/xcschememanagement.plist`, Xcode's per-user scheme state, committed in September. It's IDE state, not build output. If you want it out: `git rm --cached` it and ignore `xcuserdata/`.

## 4. Cursor checkpoints (step 4): recommendation only, nothing deleted

- **What it is:** `~/Library/Application Support/Cursor/snapshots` is 18.9 GB.
  - Almost all of it (**17.8 GB**) is one git-style object store (`stores/7d4743eb…/objects/pack`, started 13 July 2026), indexed by `snapshots/state/state.db`.
  - Cursor maintains it itself (it holds `maintenance.lock` and `baseline.lock`).
  - The rest: `roots` 0.9 GB (the village-foodie root is 872 MB) and `codebases` 0.18 GB.
- 🔴 **"Checkpoints older than 14 days" can't be pruned safely by hand.** 16.5 GB of the packs are older than 14 days and 1.2 GB are newer. But git packs are shared: a recent checkpoint can depend on objects in an old pack. Deleting old packs, or running git commands on Cursor's store, risks breaking the restores you'd want to keep.
- **The safe options:**
  1. **Keep it** (the default), if you restore old Cursor checkpoints.
  2. **Reset it completely** (~18.9 GB):
     1. Quit Cursor with ⌘Q.
     2. Check it's fully closed: `pgrep -fl "Cursor.app"` prints nothing.
     3. Move `~/Library/Application Support/Cursor/snapshots` to the Trash.
     4. Start Cursor; it creates a fresh store.
     5. Empty the Trash once Cursor works.

     You lose only the "restore checkpoint" history in existing chats. The chats themselves and your settings are stored elsewhere (`User/`, `globalStorage`).
  3. If you don't use Cursor any more, uninstall it with its data (~26 GB in all, manual-update-1 §2.4).

## 5. Manual and commits (step 5)

- **Manual V16.29.**
  - **The "Disk space" standing rule:** the harness-temp bullet now explains:
    - the module;
    - **that a new script which makes temp or starts a browser must require it**;
    - the sweep's prune and TEMP report;
    - how to clear old leftovers;
    - what isn't covered.
  - **Open item 18** (the leak) is struck as fixed.
  - A V16.29 changelog entry.
  - The header and front matter both read 16.29.
- **Commits** (this workstream's files only):
  - `638de8c9`: untrack the plugin build output and add the `.gitignore` lines;
  - then the module, the clean-up script, the runner, the disk guard, the harness list (the 3 new files registered as shared modules), the one-line additions in 277 scripts, the manual and this report.
- **Free space now: ~205 GB.**

## Undo (only if Dominic asks)

- **The code and manual:** `git revert` this workstream's commits. That restores scattered temp and no removal; the old folders don't come back.
- **Re-tracking the build output:** `git revert 638de8c9`. Not recommended.
- **The deleted temp folders:** nothing to restore. They were throwaway copies, and the next harness run makes what it needs.
