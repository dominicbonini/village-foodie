# Android release signing configuration

**Date:** 25 August 2026
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **NO CREDENTIAL VALUE APPEARS ANYWHERE IN THIS REPORT OR IN THE DIFF.** Verified by scanning the diff
and both new files for assigned secret values: **every occurrence is either the literal `REPLACE_ME`
placeholder or a `keystoreProperties['…']` lookup.**

✅ **I DID NOT: open or read `android/keystore.properties`, open or read the keystore, run `keytool`,
generate a keystore, run gradle, ask for a password, or write any credential to any file.** The only
thing I established about `keystore.properties` is **that it exists and its size in bytes** — from
`stat`, not from its contents.

🔴 **NO SIGNED ARTEFACT WAS PRODUCED AND NONE IS CLAIMED.**

---

# §0 — WHICH OF THE THREE

| | |
|---|---|
| **Parse** | 🔴 **NO — and this is the honest limit of this task.** `build.gradle` is **Groovy**, and nothing here parsed it. I checked **brace balance only** (17 open, 17 close, comments stripped), which is a structural sanity check, **not a parse.** |
| **Typecheck** | **No.** Nothing TypeScript changed. |
| **Execution** | **Partially.** I executed `git check-ignore`, `git ls-files`, `stat` and file writes. 🔴 **I did NOT run gradle, so the Groovy is UNVALIDATED** — the one tool that would prove it is the one you told me not to run. |

🔴 **THE FIRST `./gradlew` INVOCATION IS WHAT VALIDATES THIS, AND IT HAS NOT HAPPENED.** A configuration
error in the block I added would surface at configuration time and **would affect debug builds too** —
which is precisely the failure mode the `.exists()` guard is written to avoid, but the guard itself is
also unvalidated.

---

# §1 — PHASE 1: THE READS

## 1.1 `android/app/build.gradle` BEFORE — the signing state

**The whole file was 54 lines. The only `buildTypes` block was:**
```gradle
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
```
🔴 **THERE WAS NO `signingConfigs` BLOCK AT ALL, AND NO `signingConfig` LINE IN `release`.**

⚠️ **SO THE ANSWER TO "IS RELEASE SIGNED WITH THE DEBUG KEY" IS NO — IT WAS SIGNED WITH NOTHING.** AGP
applies the debug signing config to the **debug** build type only. A build type with no `signingConfig`
produces an **unsigned** artefact. **The distinction matters: an unsigned AAB is rejected at upload,
whereas a debug-signed one can look plausible until Play refuses the certificate.**

## 1.2 `.gitignore` — 🔴 **THERE WAS NO ANDROID SECTION**

The root `.gitignore` was 51 lines covering node_modules, `.next`, `.env*`, Vercel, logs and scraper
artefacts. **A search for `android`, `keystore`, `jks` and `capacitor` returned NOTHING.**

## 1.3 EXISTENCE — 🔴 **BOTH FILES WERE PRESENT, UNTRACKED, AND UNIGNORED**

```
  android/keystore.properties       : EXISTS (123 bytes)  — NOT read
  android/hatchgrab-upload.keystore : EXISTS (2750 bytes) — NOT read
```

| Check | Before |
|---|---|
| Tracked by git? | ✅ **No** — `git ls-files --error-unmatch` failed for both |
| Ignored by git? | 🔴 **NO — `git check-ignore` matched neither** |

🔴 **THAT WAS THE ACTUAL RISK IN THIS TASK.** Both files sat in the working tree, visible to
`git add .`, with nothing stopping them. **They were not yet in history, which is the only reason this is
a configuration change and not an incident** — a committed key has to be *revoked*, not un-committed.

⚠️ **AND `android/.gitignore` ALREADY HAD THE RULES, COMMENTED OUT** (lines 55–58):
```
# Keystore files
# Uncomment the following lines if you do not want to check your keystore files in.
#*.jks
#*.keystore
```
**Capacitor ships them disabled.** I left them as they are — the root entries now cover it and
uncommenting was outside what you asked for. **Worth knowing they are there.**

## 1.4 IDENTITY AND VERSION — unchanged by this task

| | Value | Where |
|---|---|---|
| `applicationId` | `com.hatchgrab.app` | `android/app/build.gradle:7` |
| `namespace` | `com.hatchgrab.app` | `android/app/build.gradle:4` |
| `versionCode` | `1` | `android/app/build.gradle:10` |
| `versionName` | `"1.0"` | `android/app/build.gradle:11` |

✅ **None of these was altered.**

---

# §2 — PHASE 2: `git check-ignore -v`, THE REQUIRED PROOF

```
.gitignore:58:android/keystore.properties	android/keystore.properties
.gitignore:59:android/*.keystore	android/hatchgrab-upload.keystore
```

✅ **BOTH MATCHED. Neither is a failure.** The output names the rule and the line that caught each file,
so the match is attributable rather than assumed.

✅ **Re-confirmed after the change: neither file is tracked.** An ignore rule does not untrack an
already-tracked file — **there was nothing to untrack, which is the good case.**

✅ **`android/keystore.properties.example` is NOT matched by any rule** — checked explicitly, because a
template that got swept up by `*.keystore`-style globbing would be silently missing for the next person.

---

# §3 — THE FULL DIFF

## 3.1 `.gitignore`

```diff
+# ── ANDROID SIGNING CREDENTIALS — NEVER COMMIT THESE ────────────────────────────────────────────────
+# These files hold the UPLOAD KEY and its passwords. Committing them publishes the credential that
+# authorises a Play Store upload for com.hatchgrab.app, to anyone who can read the repository.
+# There is no way to un-publish a secret from git history — it has to be revoked instead.
+# See android/SIGNING.md. The committed template is android/keystore.properties.example.
+android/keystore.properties
+android/*.keystore
+android/*.jks
```

## 3.2 `android/app/build.gradle`

**Two hunks. Full comments omitted here for length — they are in the file and in the diff quoted in
chat; the code they surround is:**

```diff
+def keystorePropertiesFile = rootProject.file("keystore.properties")
+def keystoreProperties = new Properties()
+def hasKeystore = keystorePropertiesFile.exists()
+if (hasKeystore) {
+    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
+}
```
```diff
+    signingConfigs {
+        if (hasKeystore) {
+            release {
+                storeFile rootProject.file(keystoreProperties['storeFile'])
+                storePassword keystoreProperties['storePassword']
+                keyAlias keystoreProperties['keyAlias']
+                keyPassword keystoreProperties['keyPassword']
+            }
+        }
+    }
     buildTypes {
         release {
+            if (hasKeystore) {
+                signingConfig signingConfigs.release
+            }
             minifyEnabled false
             proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
         }
```

✅ **Every credential reference is a `keystoreProperties['…']` lookup. No literal appears.**

## 3.3 NEW FILES (committed)

- **`android/keystore.properties.example`** — four keys, `storePassword` and `keyPassword` both
  `REPLACE_ME`, `keyAlias=hatchgrab`, `storeFile=hatchgrab-upload.keystore` documented as **relative to
  `android/`**.
- **`android/SIGNING.md`** — 58 lines, **zero credentials**, covering the upload key vs Google's app
  signing key, where the files live, the alias, the key type, and the loss-recovery path.

---

# §4 — HOW ABSENCE IS HANDLED — ✅ QUOTED, BECAUSE YOU ASKED

```gradle
def hasKeystore = keystorePropertiesFile.exists()
if (hasKeystore) {
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
}
```
**and the two consumers are each guarded by the same flag:**
```gradle
    signingConfigs {
        if (hasKeystore) { release { … } }
    }
    …
            if (hasKeystore) { signingConfig signingConfigs.release }
```

🔴 **BOTH GUARDS ARE NECESSARY AND THE SECOND IS THE ONE THAT IS EASY TO MISS.** Creating the config
conditionally is not enough — **referencing `signingConfigs.release` when it was never created is a
configuration-time failure**, and configuration runs for *every* task. That would break
`assembleDebug` for anyone without the credentials, which is the exact outcome you said must not happen.

⚠️ **`withInputStream {}` rather than `new FileInputStream(...)`**, so the handle is closed
deterministically. The common snippet on the internet leaks it.

✅ **Consequence when the file is absent:** the release build type has no `signingConfig`, so a release
artefact is **unsigned — exactly the pre-existing behaviour** — and **debug is untouched.**

---

# §5 — SCOPE

| Contract | Result |
|---|---|
| Keystore generated? | ✅ **No** |
| `keytool` run? | ✅ **No** |
| Keystore or `keystore.properties` read? | ✅ **No — existence and byte size only** |
| Password requested or written? | ✅ **No** |
| `minifyEnabled` / `shrinkResources` | ✅ **Untouched.** `minifyEnabled false` unchanged; `shrinkResources` was never present and was not added |
| ProGuard enabled? | ✅ **No** — `proguardFiles` line unchanged |
| `versionCode` / `applicationId` | ✅ **Unchanged** |
| `ios/` | ✅ **Untouched** |
| Web bundle | ✅ **Untouched** |
| Gradle run? | ✅ **No** |
| Committed or pushed? | ✅ **No** |

⚠️ **The untracked `android/app/src/main/res/drawable-*dpi/` directories in `git status` are the
notification icons from the previous task, not this one.**

---

# §6 — WHAT IS STILL UNPROVEN

1. 🔴 **THE GROOVY IS UNVALIDATED** (§0). Brace balance is not a parse. **`./gradlew assembleDebug` is
   the check — run it before relying on any of this**, and run it *first*, because a mistake here breaks
   debug too.
2. 🔴 **NO SIGNED BUILD HAS BEEN PRODUCED.** Whether the credentials in your file actually open that
   keystore is **completely untested** — a wrong password surfaces only at `assembleRelease`.
3. ⚠️ **`storeFile` resolution is reasoned, not observed.** `rootProject` is `android/` for an app module,
   so a bare filename lands beside `keystore.properties`. **If your file gives an absolute path or a
   `../` path instead, it will still work** — `rootProject.file()` handles both — **but the template
   documents the bare-filename form.**
4. ⚠️ **Play App Signing enrolment is not verified from here.** `SIGNING.md` states the recovery path
   *assuming* it is enrolled. 🔴 **If it is not, the loss consequence is the unrecoverable one described
   in that file — worth confirming in Play Console before the first upload.**
5. ⚠️ **`versionCode` is still `1`.** Fine for a first upload; **every subsequent upload needs it
   incremented or Play rejects the bundle.** Out of scope here and unchanged.
