# The signed bundle — is it still the file that was verified?

**Date:** 1 September 2026
**READ-ONLY.** No file changed, no build, **no Gradle task run**, nothing committed or deployed.
**The bundle was not rebuilt and will not be.** Marked **READ**, **INFERRED**, **UNKNOWN** throughout.

---

## Answer

## ✅ YES — the file on disk today is the SAME file that was verified. Same path, same size, same modification time, and the same bytes.

---

## 1. Every `.aab` in the repository

**READ — two, both under the gitignored build directory:**

| # | Path | Size (bytes) | Modification time |
|---|---|---|---|
| 1 | `android/app/build/outputs/bundle/release/app-release.aab` | **6,148,125** | **2026-08-26 20:10:27** |
| 2 | `android/app/build/intermediates/intermediary_bundle/release/packageReleaseBundle/intermediary-bundle.aab` | 16,692,016 | 2026-08-26 20:10:27 |

**SHA-256, for a stronger identity than size and time:**

```
app-release.aab        b04f8619a6dd3c4cab96ea5944bad066223967804d2ccf6f351af22914d67f43
intermediary-bundle    a14fb4f7f71ddcebed30a975dd7cb0ae6f2c7c4bb3f10561b041d1a0a95c57d8
```

⚠️ **#2 is an intermediate produced by the same build**, not a second candidate for upload. It shares
the build's timestamp to the second.

## 2 & 3. Compared against the diagnosis report

**READ — what `docs/android-submission-diagnosis-report.md:71-75` records:**

```
path  : android/app/build/outputs/bundle/release/app-release.aab
size  : 6,148,125 bytes (5.9 MB)
mtime : 2026-08-26 20:10:27
signed: YES — META-INF/HATCHGRA.SF (129,975 B) + META-INF/HATCHGRA.RSA (1,371 B)
```

| | Recorded | On disk today | |
|---|---|---|---|
| path | `…/outputs/bundle/release/app-release.aab` | identical | ✅ |
| size | 6,148,125 bytes | 6,148,125 bytes | ✅ |
| mtime | 2026-08-26 20:10:27 | 2026-08-26 20:10:27 | ✅ |
| signature block | `HATCHGRA.SF` + `HATCHGRA.RSA` | both present, 129,975 B + 1,371 B | ✅ |

## ✅ **IT IS UNCHANGED. THE MODIFICATION TIME IS `2026-08-26 20:10:27`, TO THE SECOND, AS RECORDED — SIX DAYS OLD AND NOT TOUCHED SINCE.**

**It has NOT been rebuilt and has NOT been replaced.**

## 4. Changes since the bundle's modification time

**Item 4 is conditional on the bundle having changed. It has not — but two things HAVE moved since the
diagnosis report was written, and both are worth stating because neither is visible from the bundle.**

### ⚠️ There is now a commit touching `android/**`, where on 29 August there were none

```
7ee844f  2026-09-01 09:45:40  "ipad app post updates"
  37 files under android/ + capacitor.config.ts
  484 insertions(+), 5 deletions(-)
```

It covers `android/SIGNING.md`, `android/app/build.gradle`, `AndroidManifest.xml`,
`MainActivity.java` (+292), the 5 new `ic_stat_hatchgrab` notification icons, 11 splash and 15 launcher
images, `keystore.properties.example`, and `capacitor.config.ts`.

🔴 **BUT NONE OF IT ALTERS THE SHIPPED ARTEFACT, AND THE REASON IS THE DISTINCTION A `git log --since`
HIDES: a commit DATE is not a content-change date.** I checked every one of the 37 files' modification
times against the build:

```
files in the commit: 37    of which modified after the build: 0
```

**Every file's content predates 2026-08-26 20:10:27.** ⚠️ **The commit RECORDS changes that were already
compiled into the bundle** — it moved them from "uncommitted" to "committed" and changed not one byte of
what ships. **So each of the 37 alters nothing about the shipped artefact; they were already in it.**

### ✅ No uncommitted changes remain to those paths

```
git status --porcelain=v1 -uall -- android/ capacitor.config.ts   →  (empty)
```

**And the config baked into the bundle still matches the file on disk**, diffed directly out of the
archive:

```
✅ IDENTICAL — base/assets/capacitor.config.json vs android/app/src/main/assets/capacitor.config.json
```

### 🔴 A Gradle invocation ran today, and it was not mine

**READ:** `android/build/reports/problems/problems-report.html` and
`android/.gradle/8.14.3/fileChanges/last-build.bin` were both written at **2026-09-01 10:37:29**.

⚠️ **I ran no Gradle task in this session.** **INFERRED: an IDE sync or a Gradle daemon** — the same
source that also wrote `android/.idea/workspace.xml` earlier today. ✅ **Whatever it was, it did NOT
rebuild the bundle: the `.aab` mtime and SHA-256 are unchanged.**

🔴 **RECORD IT ANYWAY, BECAUSE IT IS THE MECHANISM BY WHICH THIS FILE COULD BE LOST SILENTLY.** A
`bundleRelease` from the IDE would overwrite `app-release.aab` in place with no prompt and no git
signal, since the path is gitignored. **The verified artefact's only protection is that nobody runs that
task.**

## 5. `versionCode` and `versionName`

**READ — quoted from `android/app/build.gradle`, lines 28-34:**

```gradle
    defaultConfig {
        applicationId "com.hatchgrab.app"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
```

**`versionCode 1` · `versionName "1.0"`** — unchanged from the diagnosis report, and unchanged by
commit `7ee844f`.

⚠️ **The standing caveat still applies:** `versionCode 1` is usable **only if nothing has ever been
uploaded to `com.hatchgrab.app` on any track.** **UNKNOWN from this repository** — the App bundle
explorer in Play Console is the place to settle it.

## 6. Tracked or ignored

🔴 **NOT TRACKED. IGNORED.** Determined three ways, because the first attempt was inconclusive:

```
git ls-files --error-unmatch <aab>   → exit code 1        (0 would mean tracked)
git ls-files <aab>                   → 0 rows             (not in the index)
git ls-files '*.aab'                 → 0 rows             (git tracks NO .aab anywhere)
git check-ignore -v <aab>            → android/.gitignore:24: build/
git status --porcelain -uall         → 0 occurrences
```

**The ignoring rule is `build/` at `android/.gitignore:24`** — a directory rule, so the whole build
output tree is ignored, not the `.aab` specifically.

⚠️ **CONSEQUENCE, and it is the same point as §4's:** the verified artefact **exists only on this
machine**. It is not in git, not in a release, and not backed up by any mechanism visible here. **A
clean checkout does not have it, and `./gradlew clean` would delete it.**

## 7. The signing certificate

**READ — and it required no build and no modification.** The signature block is a file inside the
archive; I streamed it to `keytool` through a pipe, writing nothing to disk:

```
unzip -p android/app/build/outputs/bundle/release/app-release.aab META-INF/HATCHGRA.RSA | keytool -printcert
```

**Result:**

```
Owner:  CN=Dominic Bonini, O=HatchGrab Ltd, L=Wickham Street, ST=Suffolk, C=GB
Issuer: CN=Dominic Bonini, O=HatchGrab Ltd, L=Wickham Street, ST=Suffolk, C=GB
Valid from: Tue Aug 25 22:11:26 BST 2026 until: Sat Jan 10 21:11:26 GMT 2054
SHA1:   97:8D:DD:A2:32:CF:F3:31:31:2B:D9:D9:B6:1C:40:38:2B:A3:91:7A
SHA256: AA:41:BE:A7:93:9E:E6:97:B1:7E:83:12:09:B3:E5:33:D3:86:57:75:D8:E0:2F:F2:CB:46:70:2D:4C:4A:88:A9
Signature algorithm name: SHA384withRSA
```

## ✅ **THE SHA1 MATCHES THE EXPECTED FINGERPRINT EXACTLY.**

Compared as strings rather than by eye:

```
expected: 97:8D:DD:A2:32:CF:F3:31:31:2B:D9:D9:B6:1C:40:38:2B:A3:91:7A
actual  : 97:8D:DD:A2:32:CF:F3:31:31:2B:D9:D9:B6:1C:40:38:2B:A3:91:7A
✅ EXACT MATCH
```

⚠️ **The certificate is self-signed** (Owner and Issuer identical) and valid to **January 2054**, which
is correct for an upload key. **Confirmed nothing was written by the read:** the `.aab` mtime is
unchanged and `git status` gained no paths.

---

## Summary

| Item | Result |
|---|---|
| 1 | Two `.aab` files; the release one is 6,148,125 B at 2026-08-26 20:10:27 |
| 2–3 | ✅ **UNCHANGED** — same path, size, mtime **and SHA-256** |
| 4 | n/a (unchanged). ⚠️ One commit and one Gradle run since, **neither altering the artefact** |
| 5 | `versionCode 1` · `versionName "1.0"` |
| 6 | **Not tracked**; ignored by `android/.gitignore:24` (`build/`) |
| 7 | ✅ SHA1 **matches exactly**; read by pipe, nothing built or written |

---

## What I could not establish

1. **UNKNOWN — what ran Gradle at 10:37:29 today.** INFERRED as an IDE sync from the co-occurring
   `.idea` writes. **It did not rebuild the bundle**, which is the part that matters.
2. **UNKNOWN — whether anything has been uploaded to Play on any track**, which is what decides whether
   `versionCode 1` is usable.
3. **UNKNOWN — whether Play App Signing is enrolled.** If it is, the fingerprint that matters to Play is
   the *upload* certificate; **the SHA1 above is the certificate this bundle carries**, which is the
   question asked.
4. **NOT OBSERVED — the bundle was not installed, opened or run.** Its identity, signature and embedded
   config were read from the archive.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** Item 7's condition —
*"if reading it would require building or modifying anything, do NOT do it"* — did not arise: the
certificate is a file inside the archive and was read through a pipe. **The bundle was not rebuilt, and
the instruction not to rebuild it was never in tension with anything else asked.**
