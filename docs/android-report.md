# Task report — housekeeping: android/ commit (NOT NEEDED) + migration results logged · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only).
`docs/last-report.md` belongs to a separate workstream — not read, not written, not opened.

**No commit was made.** Task 1's premise does not hold — see §1. **No SQL was run. No gradle,
build, `cap`, dev server, `adb` or install command was run.** One file was appended to
(`docs/android.md`), one overwritten (this report).

---

## 0. Prompt integrity — one garbled spot, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| *"order_pending **1 disabled**"* | *"order_pending **8 enabled / 1 disabled**"* | The enabled count is missing — the other two types are both given as `N enabled / N disabled` pairs. Your own baseline paragraph settles it: *"The conditional in the expected counts is therefore settled: **8/1 was correct**."* 8 + 1 = 9 devices, which reconciles with 27 total rows. |

No other garbles. The line wrap inside *"schedule_received 0 enabled / 9 \n disabled"* is just
wrapping, not truncation — that pair is complete.

---

# 1. COMMIT THE ANDROID PROJECT — ⚠️ NOT DONE, because it is already done

## The premise does not hold: `android/` has been committed for some time

```
$ git status --porcelain android/
(no output)

$ git ls-files android/ | wc -l
62
```

**62 files under `android/` are already tracked, and the working tree is clean.** There is
nothing to add, nothing to stage, and nothing to commit. **I did not create an empty commit** —
that would put a misleading "Capacitor 8 Android scaffold" entry in the history describing work
that landed across five earlier commits.

**The five commits that already carry it:**

```
0bfc880 android
56b7798 push notifications
a87b384 android fix
a4f3881 android white bar
8b56c15 landing and android
```

**Today's two changes named in your prompt are both already in.** I read the files to confirm the
content is the current version, not an earlier one:

| File | Content confirmed | Committed in |
| --- | --- | --- |
| `android/app/src/main/res/values/colors.xml` | `<color name="hgHeaderNavy">#0F172A</color>`, with the comment tying it to `HEADER_BG` in `lib/brand.ts` | **`a4f3881` "android white bar"** |
| `android/app/src/main/res/values/styles.xml` | `<item name="android:windowBackground">@color/hgHeaderNavy</item>` on `AppTheme.NoActionBar`, plus the no-double-hyphen warning and the BridgeActivity rationale | **`a87b384` "android fix"** |

So the navy status-bar strip work is on `main` and has been for two commits. **The V8.8 branch
rule is already satisfied** — `android/` sits alongside `ios/`, inert for the web build.

## The four pre-commit checks — all run anyway, all clean

I ran every check you asked for before concluding, because if any had failed the answer would
have been "stop" rather than "already done".

### 1.1 `git status --porcelain android/`

**Empty.** Nothing added, modified, deleted or untracked under `android/`.

### 1.2 Build output and `local.properties` — correctly excluded ✅

`android/.gitignore` is the standard GitHub Android template, and it covers every path you named:

| Pattern | Line in `android/.gitignore` | Excludes |
| --- | --- | --- |
| `build/` | present | `android/build`, `android/app/build`, any nested `build/` |
| `.gradle/` | present | `android/.gradle` |
| `local.properties` | present | the SDK-path file |
| `*.apk` / `*.aab` / `*.aar` / `*.dex` | present | packaged output |
| `capacitor-cordova-android-plugins` | present | the generated Cordova bridge |
| `app/src/main/assets/public` | present | the copied web build |
| `app/src/main/assets/capacitor.config.json`, `capacitor.plugins.json`, `res/xml/config.xml` | present | generated config |

Plus `android/app/.gitignore` = `/build/*` with a `!/build/.npmkeep` exception.

**Proof they are actually being ignored, not merely listed** — `git status --porcelain --ignored android/`:

```
!! android/.gradle/
!! android/.idea/caches/
!! android/.idea/gradle.xml
!! android/.idea/vcs.xml
!! android/.idea/workspace.xml
!! android/app/build/
!! android/app/src/main/assets/
!! android/app/src/main/res/xml/config.xml
!! android/build/
!! android/capacitor-cordova-android-plugins/
!! android/local.properties
```

**Every one of the four you named is on that list. No build artefact and no `local.properties`
is tracked or would have been committed.** No reason to stop.

### 1.3 `android/app/google-services.json` — ALREADY COMMITTED. Not gitignored.

**State of play, factually:**

- The file exists: `-rw-r--r--@ 1 dominicbonini staff 721 Jul 27 14:27`.
- **It is tracked** — `git ls-files --error-unmatch android/app/google-services.json` succeeds.
- **It is NOT gitignored.** `git check-ignore -v` returns nothing. The template's Firebase line is
  commented out: `android/.gitignore` reads `# Google Services (e.g. APIs or Firebase)` followed by
  `# google-services.json` — i.e. the rule is *disabled*, which is the Capacitor/Android default.

**So the decision was already taken, by default rather than deliberately, and it is in the
history.** Your instruction was to state its status and recommend, not decide — and in this case
there is nothing to decide *forward*, only whether to reverse it.

**My recommendation: leave it committed. Do not reverse this.** Reasoning:

1. **It is genuinely not a secret.** It ships inside every APK; anyone with the app has it. It
   carries the Firebase project id, app id, API key and sender id — identifiers, not authorisation.
   Firebase's own security model assumes public client config; access is gated by Security Rules
   and by the server key, which lives elsewhere and is not in this file.
2. **The build needs it.** The `google-services` Gradle plugin fails the build without it. An
   ignored `google-services.json` means every clone, every CI runner and every future machine needs
   an out-of-band copy — a real, recurring cost against a theoretical benefit.
3. **Reversing it now is worse than never committing it.** `git rm --cached` leaves the file in
   history at `56b7798` onward; you would get the inconvenience of an ignored file *and* the
   contents still in the repo. A genuine removal means a history rewrite, which is not worth it
   for a file that ships in the APK regardless.
4. **It matches `ios/`'s posture** — same class of client config, same treatment.

**The one thing worth doing instead:** if the repo ever goes public, confirm the Firebase Security
Rules are not permissive, since the project id becomes trivially discoverable. That is a Firebase
console question, not a git one. **I have changed nothing here.**

### 1.4 `find android -name "* *"` — ZERO hits ✅

```
$ find android -name "* *"
(no output)          count: 0
```

**Zero, including inside `build/`.** The 139 iCloud-style conflict copies found on 2026-07-27
(`docs/android.md:932–1013`) are gone — the Clean you ran cleared them, and nothing has
re-duplicated since. The source tree was never affected then and is clean now.

## Conclusion for task 1

**Nothing to commit, so nothing was committed. No commit hash to report; file count is 62 already
tracked.** If you believed `android/` was uncommitted, the likely cause is that
`git status` shows nothing for it *because* it is committed — the same empty output you would get
if it were entirely ignored, which is the ambiguity `git ls-files` resolves.

**If you actually want something else here — say, a commit of the two currently-modified `docs/`
files — tell me and I will do that as a separate, explicitly-scoped commit.** You said commit
`android/` only and not to sweep in other paths, so I have left `docs/android.md` and
`docs/android-report.md` modified and unstaged.

### ⚠️ One thing I noticed and did not act on

`0bfc880` committed **`.idea/caches/deviceStreaming.xml` — 2,181 lines** of Android-Studio device
cache at the repo root, along with seven other root-level `.idea/` files. The *nested*
`android/.idea/caches/` is correctly ignored by `android/.gitignore`; the **root** `.idea/` has no
such protection. That is IDE-local state that will churn on every machine and produce noisy diffs.
Outside the scope of this task and **not touched** — flagging it because it will otherwise keep
showing up in unrelated commits.

---

# 2. RECORD THE MIGRATION RESULTS — DONE

**Appended to `docs/android.md`: 1013 → 1172 lines (+159). Nothing was overwritten.** The new
entry begins at **`docs/android.md:1015`**:

> `### 2026-07-27 — Notification preference migrations APPLIED to prod (2 of 3). Baseline captured.`

It explicitly supersedes the earlier `### 2026-07-27 — Notification preference migrations DRAFTED
(not run)` entry at `docs/android.md:788`, which is left in place as the record of what was
decided and why.

## What went into the log

### 2.1 The baseline — recorded as the only durable copy

Captured as a table, exactly as you gave it: **9 `van_devices` rows; 8 `notify_enabled` true, 1
false; 2 android, 7 ios; ONE device with a push token** (the live Android emulator, 142 chars).
**`van_notification_prefs` EMPTY — zero rows.**

I wrote out *why* the empty table matters rather than just recording it: every `van_gate_raw` was
null, so the `coalesce(p.enabled, true)` leg defaulted to enabled for every device and the
`order_pending` outcome was driven entirely by `notify_enabled`. **That settles the conditional —
8/1 was correct**, and the log says so.

**Gusto's device (`d687417b`, ios) has no push token; Gusto has never had a working push device.**
Recorded with the reason it is worth recording: a future "Gusto didn't get the notification"
report must not be misread as a regression in the new pref model. There has never been a token to
send to.

### 2.2 ⚠️ A correction to my previous report, stated in the log

**My earlier report assumed 8 devices with tokens and 1 without. The truth is the inverse — 1
with, 8 without.** I inferred that from "one orphaned Android row with no token" and did not mark
it as an inference. It is corrected in `docs/android.md` rather than quietly dropped.

**It changed nothing.** Nothing in the backfill filters on `push_token` — all three inserts are
unqualified `select ... from van_devices` — so no count, no seeded value and no verification query
depended on it. The 27/9/9/9 figures were right for a different reason than I gave.

### 2.3 The two applied migrations

**`20260728_device_notification_prefs.sql`** — table created; **FK confirmed against
`van_devices(device_id)`**, the text natural key (the deliberate divergence flagged in the file
header landed as intended); **RLS on, zero policies**; **composite PK `(device_id, type)`**; table
empty on creation.

**`20260728_device_notification_prefs_backfill.sql`** — **27 rows across 9 devices**, recorded as
a table: `offline_protection` 0/9, **`order_pending` 8 enabled / 1 disabled**, `schedule_received`
0/9.

**5.c, 5.d and 5.e all returned zero rows**, with each one's meaning spelled out — and 5.e given
the weight it deserves: it recomputes the pre-migration gate arithmetic from the old stores and
diffs it against what landed, so **zero rows means every device's new pref reproduces its old
behaviour exactly.** The log states plainly that a matching count proves far less than that diff
returning empty.

I also carried across the note that the **27 includes the orphaned tokenless Android device**, is
correct and inert (the send path filters `.not('push_token','is',null)`; `on delete cascade`
cleans it up), so a future reader expecting 24 knows where the difference is.

### 2.4 🚨 The outstanding coupling — recorded as a BLOCKER, not a note

Given its own section with a 🚨 heading:
**`### 🚨 BLOCKER on the Settings-card work — the offline_protection coupling`**

The log states: the backfill seeded `offline_protection = false` for **all nine** devices; that was
faithful for the majority because `hg_notify_master` is unset out of the box; **but any operator
who had enabled offline alerts locally will go silent** the moment the Settings card reads
`device_notification_prefs` instead of the local keys. Those prefs are device-local Capacitor
Preferences — **invisible to SQL, so no migration could have read them and none ever will.**

The remedy is set out as a blockquote requirement: a **one-time migration** of
`hg_notify_master` / `hg_notify_offline` / `hg_notify_neworder` into `device_notification_prefs`
on first run of the new card, then stop reading the local keys — and it **must ship in the SAME
RELEASE as the card.**

Two things I added to make it stick as a blocker rather than a caveat:

- **Why it is dangerous specifically because it is silent** — the alert simply never fires, there
  is no error, and the operator's toggle will display the new server value as though they had
  chosen it themselves. Nothing surfaces the regression.
- **It is also precondition 4 of the sweep**, so the sweep cannot proceed until it has shipped and
  run. That cross-link means the blocker cannot be lost by anyone reading only the sweep section.

### 2.5 ⛔ The sweep — not run, seven preconditions restated

Given its own section: **`### ⛔ 20260728_notification_prefs_retire_old_stores.sql — NOT RUN, and
must not be`**, with the classification (DEPLOY-COUPLED IN REVERSE) and the concrete hazard —
it drops `van_notification_prefs` and the `van_devices.notify_enabled` column, and
`app/api/orders/submit/route.ts` still reads **both**, at **line 1067** and **line 1076**
respectively. Running it today means every customer order on a live trading truck hits a missing
table and a missing column, and a `DROP` is not reversible.

**All seven preconditions are restated verbatim in the log**, with their status marked:

1. `device_notification_prefs` exists and is populated — ✅ **now met** (27 rows, verified).
2. Order-submit path reads the new table, no longer references the old two.
3. Settings card writes the new table, no longer writes `notify_enabled`.
4. The one-time `hg_notify_*` client migration has shipped and run — **the blocker above**.
5. The code is **DEPLOYED**, not merely committed. *"tsc-clean" is not deployed.*
6. A real order on a real truck has produced the expected behaviour post-deploy.
7. `grep -rn "notify_enabled\|van_notification_prefs" app/ lib/ components/` returns nothing
   outside comments.

**Only precondition 1 is met; 2–7 all depend on code that does not exist yet.** The log also keeps
the two snapshot SELECTs (the only record of the old state once the drop completes) and the
dormant-not-dropped rationale — rollback stays a code revert with no data loss.

### 2.6 Still-not-built list, carried forward

Settings card rewrite, per-device pref reads in both send paths, the push transport seam
(`lib/push/*`), the FCM transport, the `schedule_received` send in `inbound-schedule`, and
retirement of the temporary `.or('platform.eq.ios,platform.is.null')` predicate at
`app/api/orders/submit/route.ts:1077`.

**With the sharpest consequence of today's baseline spelled out:** that predicate excludes Android
from order push, and **the one device in the entire fleet with a working push token is Android** —
so the send path filters out the only reachable device. The client half of Android push is
verified end to end; the server half is not wired.

---

## 3. Files changed

| File | Change |
| --- | --- |
| `docs/android.md` | **Appended** 1013 → 1172 lines (+159), new entry at line 1015. Nothing overwritten. |
| `docs/android-report.md` | This file, overwritten. |

**No commit was made. No file under `android/` was created, modified or deleted. No migration
file was touched. No SQL was run.** Repo status after this task: `M docs/android.md`,
`M docs/android-report.md` — both unstaged, as you asked me not to sweep other paths into a commit.

---

## 4. What I could not do / did not do

- **Could not commit `android/` — there was nothing to commit.** 62 files already tracked, working
  tree clean, the content landed across `8b56c15` → `0bfc880`. I did not create an empty or
  `--allow-empty` commit to satisfy the letter of the instruction, because it would have written a
  false description of when that work landed. **No commit hash to report.**
- **Did not decide the `google-services.json` question** — you asked for a recommendation, not a
  decision. Status: tracked, not gitignored (the template's rule is commented out), already in
  history since `56b7798`. Recommendation: **leave it**, reasoning in §1.3. Nothing changed.
- **Did not stage or commit `docs/android.md` or `docs/android-report.md`** — you scoped the commit
  to `android/` only and said not to sweep other paths in. Both sit modified and unstaged; say the
  word and I will commit them separately.
- **Did not touch the root `.idea/` files** flagged in §1.4's closing note — out of scope.
- **Did not run any SQL, gradle, build, `cap`, dev server, `adb` or install** — as instructed. Every
  migration figure in the log is what you pasted; I verified none of it against the database.
- **Did not fix the two cosmetic defects in the backfill file** (the section heading spliced into
  the `on conflict` clause at `20260728_device_notification_prefs_backfill.sql:59–60`, and the now
  doubly-stale "7 devices / 21 rows" comment at lines 76–85). Both flagged previously; both remain.
  The file is applied to prod now, so the stale comment is purely archival — still worth a one-line
  tidy if you want the file to read correctly later.
- **Did not touch `docs/last-report.md`** — not read, not written, not opened.
