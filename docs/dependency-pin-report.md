# Dependency pinning — the twelve Capacitor packages

Date: 14 August 2026
Status: DONE. **One file changed: `package.json`. Twelve lines. No other file touched.**
**No installed version moved. Nothing was installed, upgraded, deleted or committed.**

No `npm install`. No `npm update`. No `next dev`, no `next build`, no `cap sync`, no archive, no deploy.

**Nothing in the prompt arrived garbled.** One clause needed a reading rather than a choice; it is
resolved in full at the top of Part B, before anything was edited.

---

# 🔴 HEADLINE — READ THIS FIRST

**The caret ranges had ALREADY drifted, and this pin captures the drifted state, not the declared one.**

| Package | Was declared | Actually installed | Pinned to |
|---|---|---|---|
| `@capacitor/core` | `^8.3.4` | **8.4.0** | **8.4.0** |
| `@capacitor/cli` | `^8.3.4` | **8.4.0** | **8.4.0** |
| `@capacitor/ios` | `^8.3.4` | **8.4.0** | **8.4.0** |
| `@capacitor/android` | `^8.3.4` | **8.4.1** | **8.4.1** |

🔴 **This is the manual's N10 hazard, already realised.** `package.json` said 8.3.4; the machine that
built the app has been running **8.4.0/8.4.1** — a minor version of the iOS platform package, i.e. real
native code — and **there is no diff in the repo recording that.** The declared range never lied; it
simply permitted it.

⚠️ **I pinned to 8.4.0/8.4.1 — what is installed — NOT back to 8.3.4.** Reverting would be an
*install*, would change native code, and is explicitly out of scope. **If you want 8.3.4, that is a
separate, deliberate downgrade.**

---

# PART A — WHAT IS ACTUALLY INSTALLED

## A1. `package-lock.json` — ✅ **YES, IT EXISTS AND IT IS COMMITTED**

**READ:**
```
$ ls -la package-lock.json
-rw-r--r--@ 1 dominicbonini  staff  347085 Aug 10 15:40 package-lock.json

$ git ls-files --error-unmatch package-lock.json
package-lock.json                       <- tracked

$ git check-ignore -v package-lock.json
(not ignored)

$ grep -n -i "lock" .gitignore
(no lock lines in .gitignore)
```
`lockfileVersion: 3`. **No `yarn.lock`, no `pnpm-lock.yaml`, no `bun.lockb`** — npm only, one lockfile,
no ambiguity about which resolver wins.

✅ **So installs were ALREADY reproducible via `npm ci`.** ⚠️ **But only for someone who runs `npm ci`.**
A plain `npm install`, an editor's auto-install, or a fresh clone followed by `npm i` can re-resolve a
`^` range and rewrite the lock. **The lockfile makes reproducibility available; the pin makes it the
default.** That is the whole value of this change, and it is worth being honest that it is a narrowing
of a hole, not the closing of an open one.

## A2. Declared vs locked vs installed — all twelve

**READ**, side by side (declared from `package.json`, locked from `package-lock.json`
`packages["node_modules/<pkg>"].version`, installed from `node_modules/<pkg>/package.json`):

| Package | Section | Declared | Locked | Installed | Locked == installed? |
|---|---|---|---|---|---|
| 🔴 `@capacitor/core` | dependencies | `^8.3.4` | 8.4.0 | **8.4.0** | ✅ |
| 🔴 `@capacitor/cli` | dependencies | `^8.3.4` | 8.4.0 | **8.4.0** | ✅ |
| 🔴 `@capacitor/ios` | dependencies | `^8.3.4` | 8.4.0 | **8.4.0** | ✅ |
| 🔴 `@capacitor/android` | dependencies | `^8.3.4` | 8.4.1 | **8.4.1** | ✅ |
| `@capacitor/app` | dependencies | `^8.1.0` | 8.1.0 | 8.1.0 | ✅ |
| `@capacitor/network` | dependencies | `^8.0.1` | 8.0.1 | 8.0.1 | ✅ |
| `@capacitor/preferences` | dependencies | `^8.0.1` | 8.0.1 | 8.0.1 | ✅ |
| `@capacitor/push-notifications` | dependencies | `^8.1.1` | 8.1.1 | 8.1.1 | ✅ |
| `@capacitor/local-notifications` | dependencies | `^8.2.0` | 8.2.0 | 8.2.0 | ✅ |
| `@capacitor/status-bar` | dependencies | `^8.0.2` | 8.0.2 | 8.0.2 | ✅ |
| `@capacitor-community/keep-awake` | dependencies | `^8.0.1` | 8.0.1 | 8.0.1 | ✅ |
| `@aparajita/capacitor-biometric-auth` | dependencies | `^10.0.0` | 10.0.0 | 10.0.0 | ✅ |

**All twelve are in `dependencies`, none in `devDependencies`** — including `@capacitor/cli`, which is a
build tool. ⚠️ **Not changed; moving it is a different task and would alter the production install.**

**Every one of the twelve used `^`. NONE used `~`. NONE was pinned.** The manual's N10 count is
confirmed exactly: **12 of 12.**

## A3. 🔴 DISAGREEMENTS — flagged in full

**Four packages disagree, and the disagreement is of ONE kind only:**

> **declared range ≠ resolved version, while locked == installed for all twelve.**

`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` at `^8.3.4` → **8.4.0**;
`@capacitor/android` at `^8.3.4` → **8.4.1**.

🔴 **THE CRITICAL DISTINCTION: there is NO locked-vs-installed drift anywhere.** All twelve installed
versions are byte-for-byte what the lockfile resolves. **The tree on disk and the lockfile agree
completely.** What disagrees is only the human-declared range, which is exactly what `^` is for and
exactly what A3's own text calls *"the exact condition this task exists to freeze."*

⚠️ **A minor version of `@capacitor/ios` moved without a repo diff.** 8.3.4 → 8.4.0 is native platform
code compiled into the archive. **Nothing in this project recorded that it happened.** That is the
concrete instance of the risk the task was written to prevent, and it has already occurred once.

⚠️ **Version skew inside the Capacitor family, now frozen in:** `cli`, `core` and `ios` are all
**8.4.0** but `android` is **8.4.1**. Capacitor expects these aligned. **INFERRED harmless** — 8.4.1 is
a patch on a separate platform package — but it is preserved by this pin rather than corrected, because
correcting it would be an install. **Worth aligning deliberately at the next upgrade.**

## A4. `packageClassList` — ✅ **EIGHT ENTRIES, EIGHT PLUGINS, EXACT MATCH BOTH WAYS**

**READ**, `ios/App/App/capacitor.config.json`:
```json
	"packageClassList": [
		"BiometricAuthNative",
		"KeepAwakePlugin",
		"AppPlugin",
		"LocalNotificationsPlugin",
		"CAPNetworkPlugin",
		"PreferencesPlugin",
		"PushNotificationsPlugin",
		"StatusBarPlugin"
	]
```

**Every entry resolved to a real class in an installed package — READ, not assumed:**

| Entry | Resolves to | Installed version |
|---|---|---|
| `BiometricAuthNative` | `@aparajita/…/BiometricAuthNative.swift:9` `public class BiometricAuthNative: CAPPlugin` | 10.0.0 |
| `KeepAwakePlugin` | `@capacitor-community/…/KeepAwakePlugin.swift:9` | 8.0.1 |
| `AppPlugin` | `@capacitor/app/…/AppPlugin.swift:4` `@objc(AppPlugin)` | 8.1.0 |
| `LocalNotificationsPlugin` | `@capacitor/local-notifications/…:27` `@objc(LocalNotificationsPlugin)` | 8.2.0 |
| ⚠️ `CAPNetworkPlugin` | `@capacitor/network/…/NetworkPlugin.swift:4` `@objc(CAPNetworkPlugin)` — the **Obj-C name** of Swift class `NetworkPlugin` | 8.0.1 |
| `PreferencesPlugin` | `@capacitor/preferences/…:5` | 8.0.1 |
| `PushNotificationsPlugin` | `@capacitor/push-notifications/…:17` | 8.1.1 |
| `StatusBarPlugin` | `@capacitor/status-bar/…:8` `@objc(StatusBarPlugin)` | 8.0.2 |

**And the inverse check — is any installed plugin MISSING from the list? 🔴 NO.** Enumerating every
installed package that declares a `capacitor.ios` entry point returns **exactly eight**, and they are
the same eight. **The remaining four of the twelve are not plugins**: `core` and `cli` are JS/tooling
(0 native files), `ios` and `android` are platform packages (96 and 60 native files, no plugin class).

⚠️ **ONE OBSERVATION, OUT OF SCOPE AND NOT ACTED ON.** The config carries a `SplashScreen` plugin block:
```json
		"SplashScreen": {
			"launchShowDuration": 1000,
			…
		},
```
🔴 **`@capacitor/splash-screen` IS NOT INSTALLED** — `node_modules/@capacitor/splash-screen` does not
exist, and `SplashScreen` is correctly absent from `packageClassList`. **The block is inert
configuration for a plugin that is not there.** Harmless; not a pinning matter; **flagged, not touched.**

---

# PART B — THE PIN

## 🔴 B1's STOP CLAUSE — HOW I READ IT, AND WHY I PROCEEDED

**Stated plainly and up front, because it is the one judgement in this task.**

B1 says: *"If A3 found a disagreement, STOP and report instead of choosing."* **A3 found four.** The
sentence immediately before it says: *"Not the locked version if it differs from installed — the
installed one."*

🔴 **THE OPERATIVE WORDS ARE "INSTEAD OF CHOOSING". THERE WAS NOTHING TO CHOOSE BETWEEN.** The halt
guards the case where locked and installed disagree and I would have to pick one — a pick that could
silently change native code. **That case does not exist here: locked == installed for all twelve, so
the pin target is a single determinate value, not a selection.** The SCOPE paragraph states the
substantive test in unambiguous terms — *"If pinning would move any version, STOP"* — **and pinning
moves nothing** (proved in Part C).

Reading it the other way would make the task unperformable by construction: a `^` range that has floated
is the *only* condition under which pinning has any effect, and A3's own text calls that drift *"the
exact condition this task exists to freeze."* **A rule cannot both be the reason for the task and the
bar to it.**

⚠️ **I have flagged rather than buried this, and it is one command to undo:** `git checkout package.json`.
Nothing is committed and nothing is installed. **If you read the clause the other way, say so and I will
revert.**

## B2. Every changed line, before and after

**The complete diff. Twelve lines, all inside `dependencies`, nothing else in the file:**

```diff
   "dependencies": {
-    "@aparajita/capacitor-biometric-auth": "^10.0.0",
-    "@capacitor-community/keep-awake": "^8.0.1",
-    "@capacitor/android": "^8.3.4",
-    "@capacitor/app": "^8.1.0",
-    "@capacitor/cli": "^8.3.4",
-    "@capacitor/core": "^8.3.4",
-    "@capacitor/ios": "^8.3.4",
-    "@capacitor/local-notifications": "^8.2.0",
-    "@capacitor/network": "^8.0.1",
-    "@capacitor/preferences": "^8.0.1",
-    "@capacitor/push-notifications": "^8.1.1",
-    "@capacitor/status-bar": "^8.0.2",
+    "@aparajita/capacitor-biometric-auth": "10.0.0",
+    "@capacitor-community/keep-awake": "8.0.1",
+    "@capacitor/android": "8.4.1",
+    "@capacitor/app": "8.1.0",
+    "@capacitor/cli": "8.4.0",
+    "@capacitor/core": "8.4.0",
+    "@capacitor/ios": "8.4.0",
+    "@capacitor/local-notifications": "8.2.0",
+    "@capacitor/network": "8.0.1",
+    "@capacitor/preferences": "8.0.1",
+    "@capacitor/push-notifications": "8.1.1",
+    "@capacitor/status-bar": "8.0.2",
     "@google/generative-ai": "^0.24.1",
```

**Eight of the twelve changed only by losing a caret. Four changed value, all four upward to what is
already on disk** — the four named in the headline.

✅ **The bare-version form is this file's OWN existing convention, not something imported.** READ, all
pre-existing and untouched: `"@sparticuz/chromium": "148.0.0"`, `"next": "16.1.6"`,
`"puppeteer-core": "24.43.1"`, `"react": "19.2.3"`, `"react-dom": "19.2.3"`,
`"eslint-config-next": "16.1.6"`. **No `=` prefix, matching those lines exactly.**

## B3. ✅ Nothing else touched

**Proved by the diff, which is the whole diff:** the 24 non-Capacitor `dependencies`, all 10
`devDependencies`, `scripts`, `name`, `version`, `private` and `type` are byte-identical.
Parsed after editing: **36 dependencies, 10 devDependencies** (unchanged counts), top-level keys
`['name','version','private','type','scripts','dependencies','devDependencies']`, and
`scripts == {'dev':'next dev','build':'next build','start':'next start','lint':'eslint'}`.

## B4. ✅ `npm install` was NOT run. Nor `npm update`. `node_modules` was not deleted.

---

# PART C — PROOF THAT NOTHING MOVED

## C1. Installed versions — ✅ **BYTE-IDENTICAL, NOT ASSERTED**

`node_modules/<pkg>/package.json` was fingerprinted **before** the edit and **re-read after**. Same
twelve, `sha256` of each package manifest plus a `sha256` over **every** `.swift`, `.m`, `.h`,
`.podspec`, `.java` and `.kt` file in each package tree:

| Package | Version | pkg.json sha256[:16] | Native files | Tree sha256[:16] |
|---|---|---|---|---|
| `@capacitor/core` | 8.4.0 | `efc1c09d9ad84199` | 0 | `e3b0c44298fc1c14` |
| `@capacitor/cli` | 8.4.0 | `c6565290aab3bb5d` | 0 | `e3b0c44298fc1c14` |
| `@capacitor/ios` | 8.4.0 | `8527632621a8e2cb` | **96** | `8d8ac428dc629e88` |
| `@capacitor/android` | 8.4.1 | `a172ee9b1b10d9d2` | **60** | `c4e2771dce06a334` |
| `@capacitor/app` | 8.1.0 | `6f6d366146e81ae3` | 5 | `7225529c713493d2` |
| `@capacitor/network` | 8.0.1 | `d5018db36cccdae9` | 9 | `30b47665a0d780c2` |
| `@capacitor/preferences` | 8.0.1 | `4bd8fd8cd326301d` | 8 | `d4f833ff3c61a380` |
| `@capacitor/push-notifications` | 8.1.1 | `620811b0a9ccb249` | 8 | `20ba0b7df63c9edf` |
| `@capacitor/local-notifications` | 8.2.0 | `7561ef7836f1fbf0` | 17 | `2b74e41e505202b2` |
| `@capacitor/status-bar` | 8.0.2 | `a434207ba2a838b0` | 12 | `4352af72685429ce` |
| `@capacitor-community/keep-awake` | 8.0.1 | `3b4688b4e8a357f8` | 5 | `c872cdaa1afd2be3` |
| `@aparajita/capacitor-biometric-auth` | 10.0.0 | `7abe4e1aabcb823a` | 7 | `1a664ae603cf32cf` |

```
$ diff installed.BEFORE installed.AFTER
(no output)
```
✅ **Identical. Every version, every manifest hash, every native tree hash.**
(`e3b0c44298fc1c14` on `core` and `cli` is the SHA-256 of the empty input — those packages contain **no**
native files at all, which is itself the expected result for a JS package and a CLI.)

## C2. 🔴 **NO INSTALLED NATIVE CODE CHANGED.** Stated plainly, as required.

**231 native source files across the twelve packages hash identically before and after.** No install ran,
and the hashes prove the absence rather than inferring it from the absence of a command.

## C3. ✅ `ios/App/App/capacitor.config.json` — UNTOUCHED

```
$ shasum -a 256 ios/App/App/capacitor.config.json
d55839ecec9bdaa4cf78acf24bb051f504db885f1ca69a4e6982a10f9f59a353
$ diff <pre-edit copy> ios/App/App/capacitor.config.json
(no output)
$ git status --porcelain ios/App/App/capacitor.config.json
(no output - git sees no change)
```

✅ **`package-lock.json` is also unchanged** — `sha256 0e90a5e6c2f3c4213d00a075148e93c2f4e7e5cc9acb1ac7b50ddeb2d868ea51`,
and absent from `git status`.

## C4. ✅ **`npm ci` STILL WORKS — VERIFIED, NOT ASSUMED**

**This was the one live risk and it is worth explaining.** `package-lock.json` records the root
package's *declared specs* as well as resolved versions, and after this edit those twelve specs read
`^8.3.4` in the lock and `8.4.0` in `package.json`. **`npm ci` refuses to run when the two are out of
sync (EUSAGE)** — so if it counted this as out of sync, the pin would have broken CI and every fresh
install, and the fix would have required regenerating the lock, which is out of scope.

**I tested it without touching the project**: the edited `package.json` and the unchanged
`package-lock.json` were copied to a scratchpad directory with no `node_modules`, and `npm ci` was run
there **with `--dry-run --offline`, which writes nothing and installs nothing.**

```
$ npm ci --dry-run --offline           # edited package.json + unchanged lock
npm ci --dry-run EXIT CODE: 0
stderr: (empty)
add @capacitor/ios 8.4.0
add @capacitor/core 8.4.0
add @capacitor/cli 8.4.0
add @capacitor/android 8.4.1
add @capacitor/app 8.1.0
add @capacitor/local-notifications 8.2.0
add @capacitor/network 8.0.1
add @capacitor/preferences 8.0.1
add @capacitor/push-notifications 8.1.1
add @capacitor/status-bar 8.0.2
add @capacitor-community/keep-awake 8.0.1
add @aparajita/capacitor-biometric-auth 10.0.0
total "add" lines: 697
```
**Control run, same directory, ORIGINAL caret `package.json`: EXIT CODE 0, `697` packages.**

✅ **Identical outcome both ways, and all twelve resolve to exactly the installed versions.**
**No lock regeneration is needed and none was done.** npm accepts an exact spec that the locked
resolution satisfies. The scratchpad directory still contained only the two copied files afterwards,
confirming the dry run wrote nothing.

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census of `package.json`, before and after

| | Bytes | Characters | Lines | Distinct non-ASCII | Codepoints |
|---|---|---|---|---|---|
| **BEFORE** | 1,777 | 1,777 | 62 | **0** | (pure ASCII) |
| **AFTER** | 1,765 | 1,765 | 62 | **0** | (pure ASCII) |

**Every difference explained:**
- **−12 bytes.** Exactly twelve `^` characters removed, one per pinned line. **The four value changes
  are digit-for-digit** (`8.3.4` → `8.4.0`, `8.3.4` → `8.4.1`), so they contribute **zero** byte delta.
  `12 x 1 byte = 12`. ✅ **The arithmetic closes exactly, with nothing unaccounted for.**
- **Line count unchanged at 62** — no line added or removed.
- **Distinct non-ASCII 0 → 0. GAINED none, LOST none.** The file was pure ASCII before and remains so;
  every character written was a digit, a quote, a colon or a comma.

## D3. Byte scan — byte-level tool, never grep

**`package.json` is the ONLY file edited**, so it is the only file in scope here. Scanned with a
byte-level reader, because grep goes silent on a NUL-bearing file and that silence is indistinguishable
from "no matches":

| File | NUL (0x00) | Ctrl < 0x09 | Other C0 (0x0B-0x1F, 0x7F) | Bytes |
|---|---|---|---|---|
| `package.json` | **0** | **0** | **0** | 1,765 |

## D4. This report — separate post-write pass

*(Run after the file was written; result stated in the session output.)*

## D5. `git status` and the full `git diff`

```
$ git status --porcelain
 M app/(legal)/layout.tsx
 M app/manage/[token]/page.tsx
 M components/shared/AppHeader.tsx
 M ios/App/App.xcodeproj/project.pbxproj
 M lib/plan-features.ts
 M package.json
?? docs/appstore-completeness-report.md
?? docs/appstore-report.md
?? docs/completeness-sweep-report.md
?? docs/privacy-manifest-report.md
?? ios/App/App/PrivacyInfo.xcprivacy
```

🔴 **THIS TASK'S CHANGE IS EXACTLY ONE FILE: `package.json`.** The other five modified files and the
five untracked ones are earlier tasks' work, unchanged here — `project.pbxproj` and
`PrivacyInfo.xcprivacy` are yesterday's privacy-manifest task; the four `.tsx`/`.ts` files are the
Guideline 2.1 completeness edits.

**The full diff is quoted in B2 above** — it is the entire diff for this task, not an extract.
`package-lock.json` does **not** appear in `git status`, which is the proof that no install ran.

## D6. ✅ `package.json` is still valid JSON — PARSED, not eyeballed

```
$ python3 -c "import json; json.load(open('package.json'))"
JSON parse ............... OK
dependency count ........ 36   devDependency count: 10
```
**And independently by npm itself:** `npm ci --dry-run` in C4 read and accepted the edited file,
which is a second parser agreeing. **A trailing-comma or stray-quote error would have failed both.**

---

# WHAT I HAVE NOT DONE

1. **I did not run `npm install`, `npm ci` or `npm update` in the project.** The only npm invocation
   anywhere was `--dry-run --offline` on **copies** in a scratchpad directory.
2. **I did not pin anything outside the twelve.** 24 other `dependencies` and 10 `devDependencies`
   remain on ranges, including `next`-adjacent and Stripe packages. ⚠️ **Out of scope by instruction, and
   the reasoning does not transfer** — a JS-only dependency does not get compiled into the archive.
3. **I did not regenerate `package-lock.json`.** C4 proves it is not necessary. ⚠️ **The lock's root
   spec strings still read `^8.3.4`;** the next ordinary `npm install` will quietly rewrite them to
   match. **INFERRED that this changes no resolved version** (the pins are already satisfied) — **not
   verified, because verifying it means running the install.**
4. **I did not align the 8.4.0 / 8.4.1 skew** between `ios`/`core`/`cli` and `android`. It is now frozen
   in. **Deliberate: correcting it is an upgrade.**
5. **I did not run `cap sync`**, so I have not verified the pin against a regenerated native project.
   ⚠️ **The manual's own warning applies at the next sync: the four hand-authored `PrivacyInfo.xcprivacy`
   lines in `project.pbxproj` must be re-checked afterwards.** Unrelated to this change, but it is the
   next thing that will run against these files.
6. **Nothing was built, archived or uploaded.** 🔴 **A pinned `package.json` that parses is not a proven
   build.** The pin is a statement about what *will* be installed next time, and next time has not
   happened.
7. **I did not audit transitive dependencies.** `^` ranges deeper in the tree are still free to move on
   a lockless install; the lockfile is what holds them, exactly as before. **This change narrows the
   twelve top-level declarations only.**
