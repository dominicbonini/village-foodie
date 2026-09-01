# READ-ONLY INVENTORY — working tree vs. the iOS build submitted as 1.0 (1)

**Date of this inventory:** 27 August 2026
**Working directory:** `/Users/dominicbonini/dev/village-foodie`
**Branch:** `main` · **HEAD:** `1d85241` ("ipad", 2026-08-25 11:26:08 +0100) · `origin/main` is also `1d85241`

---

## 0. WHAT I DID AND DID NOT DO

**Constraints honoured, stated explicitly:**

- **No mutating git command was run.** No `add`, `commit`, `stash`, `checkout`, `restore`, `clean`, `merge`, `rebase`, `reset`. Every git invocation was `status`, `diff`, `log`, `reflog`, `show`, `ls-files`, `ls-tree`, `cat-file -e`, `check-ignore`, `numstat`, `stat` — all read-only.
- **No migration was applied.** The six `.sql` files under `supabase/migrations/` were listed by name only. None was opened, parsed, or executed.
- **No deploy.** Nothing was built, no `next build`, no `next dev`.
- **`cap sync` was NOT run**, in any form, for either platform. The synced native artefacts were read exactly as they stood on disk.
- **Nothing belonging to `pizzeria-gusto` or `tikka-tonic` was touched.**
- **Signing:** no keystore was generated, no `keytool` was run, no keystore file was opened, and **no credential value appears anywhere in this report**. `android/keystore.properties` was tested for *existence only* (`test -f`) and never read. `android/keystore.properties.example` was not opened either. `android/app/build.gradle` was read — it contains property *names*, never values.
- **No fix is proposed and no fix was applied.** This is an inventory.

**Method of verification — stated in the required words.** Every statement in this report is a **parse** of a file's bytes (`cat`, `grep`, `sed`, `plutil`, `PlistBuddy`, `python3 json.load`, `git show`) or a read of filesystem metadata (`stat`). **No typecheck was performed. No execution was performed.** Nothing here rests on `tsc` and nothing here was run.

**The tree is the authority.** `docs/reference-manual.md` was consulted **only** where §4 required a manual-vs-tree comparison, and both readings are reported side by side in §4.5.

---

## 1. THE WORKING TREE, AS IT STANDS

### 1.1 `git status --porcelain=v1 -uall`

**56 modified tracked files (` M`) and 62 untracked (`??`). Nothing is staged.**

🔴 **`ios/**` APPEARS NOWHERE IN THE OUTPUT.** Not one modified path, not one untracked path. `git status --porcelain -- ios/` returns empty. This is the single most consequential fact in §1 and it recurs in §2 and §4.

**Modified (` M`) — 56 paths**

Android (30):

```
android/app/build.gradle
android/app/src/main/AndroidManifest.xml
android/app/src/main/java/com/hatchgrab/app/MainActivity.java
android/app/src/main/res/drawable-land-{hdpi,mdpi,xhdpi,xxhdpi,xxxhdpi}/splash.png   (5)
android/app/src/main/res/drawable-port-{hdpi,mdpi,xhdpi,xxhdpi,xxxhdpi}/splash.png   (5)
android/app/src/main/res/drawable/splash.png
android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher.png                   (5)
android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher_foreground.png        (5)
android/app/src/main/res/mipmap-{m,h,x,xx,xxx}hdpi/ic_launcher_round.png             (5)
```

Everything else (26):

```
.gitignore
app/admin/page.tsx
app/api/admin/route.ts
app/api/manage/route.ts
app/api/native/bind-device/route.ts
app/api/webhooks/meta/whatsapp/route.ts
app/dashboard/[token]/kds/page.tsx
app/dashboard/[token]/page.tsx
app/kds/[kds_token]/page.tsx
app/layout.tsx
app/manage/[token]/page.tsx
app/providers.tsx
capacitor.config.ts
components/TruckListCard.tsx
components/dashboard/types.ts
components/native/OperatorDeviceConfig.tsx
components/native/VanMenuChooser.tsx
docs/reference-manual.md
lib/features.ts
lib/native/device.ts
lib/native/notifications.ts
lib/native/signOut.ts
lib/ratelimit.ts
package-lock.json
package.json
proxy.ts
vercel.json
```

**Untracked (`??`) — 62 paths**

```
android/SIGNING.md
android/keystore.properties.example
android/app/src/main/res/drawable-{m,h,x,xx,xxx}hdpi/ic_stat_hatchgrab.png           (5)
app/api/cron/custom-domain-check/route.ts
app/api/embed/events/route.ts
app/domain/page.tsx
app/embed/[slug]/EmbedSchedule.tsx
app/embed/[slug]/page.tsx
components/auth/SessionAlertBanner.tsx
components/dashboard/CustomDomainSetup.tsx
components/dashboard/EmbedWizard.tsx
components/embed/EmbedParts.tsx
content/store-listing.md
lib/auth/session-observer.ts
lib/custom-domain/{apex,copy,dns,vercel}.ts                                          (4)
lib/custom-host.ts
lib/embed-instructions.ts
lib/native/notificationIcon.ts
lib/whatsapp/reply-cap.ts
supabase/migrations/20260826_trucks_embed_enabled.sql
supabase/migrations/20260826_trucks_embed_plan_answer.sql
supabase/migrations/20260826_trucks_embed_seen.sql
supabase/migrations/20260827_trucks_custom_domain.sql
supabase/migrations/20260827_trucks_custom_domain_monitor.sql
supabase/migrations/20260827_trucks_custom_domain_setup.sql
docs/  — 30 report files (listed in §2.4)
```

### 1.2 Diff sizes

| Measure | Result |
|---|---|
| `git diff --stat` (unstaged, tracked) | **56 files changed, 4,373 insertions(+), 184 deletions(-)** |
| `git diff --stat --cached` (staged) | **EMPTY — nothing is staged** |

Per-file insertion/deletion counts for every modified non-Android file (excluding `package-lock.json`):

```
.gitignore                                   +9    -0
app/admin/page.tsx                           +86   -3
app/api/admin/route.ts                       +1    -1
app/api/manage/route.ts                      +502  -59
app/api/native/bind-device/route.ts          +49   -6
app/api/webhooks/meta/whatsapp/route.ts      +178  -16
app/dashboard/[token]/kds/page.tsx           +30   -4
app/dashboard/[token]/page.tsx               +20   -4
app/kds/[kds_token]/page.tsx                 +43   -2
app/layout.tsx                               +13   -2
app/manage/[token]/page.tsx                  +40   -3
app/providers.tsx                            +66   -3
capacitor.config.ts                          +21   -3
components/TruckListCard.tsx                 +83   -20
components/dashboard/types.ts                +16   -0
components/native/OperatorDeviceConfig.tsx   +44   -9
components/native/VanMenuChooser.tsx         +14   -2
docs/reference-manual.md                     +2454 -29
lib/features.ts                              +12   -0
lib/native/device.ts                         +59   -5
lib/native/notifications.ts                  +19   -3
lib/native/signOut.ts                        +9    -0
lib/ratelimit.ts                             +66   -0
package.json                                 +2    -0
proxy.ts                                     +114  -7
vercel.json                                  +13   -0
android/app/src/main/java/.../MainActivity.java  +291  -1
```

### 1.3 Commit history and branches

```
1d85241  2026-08-25 11:26:08 +0100  ipad                  ← HEAD, main, origin/main
08eca98  2026-08-25 11:16:40 +0100  ipad changes
e0fe83f  2026-08-25 09:55:26 +0100  cost compare updates
2cb137e  2026-08-24 21:00:46 +0100  cost compare
aa86845  2026-08-24 14:04:34 +0100  admin page
fff713f  2026-08-24 13:46:58 +0100  loading issue
5835e6f  2026-08-24 13:09:02 +0100  cost comparison
3c1989b  2026-08-24 07:09:44 +0100  price compare
e605bbf  2026-08-20 18:27:33 +0100  hg contact
b971bc9  2026-08-20 18:00:08 +0100  website fix
6891515  2026-08-20 18:00:07 +0100  website fix
b4c7517  2026-08-20 17:31:58 +0100  updates
dea3aba  2026-08-20 14:01:37 +0100  kds fix
2c7ecc2  2026-08-20 12:21:46 +0100  apple testing
```

Branches:

```
Fixed-Map-Icons                    69e5789
Fixed-Map-icons2                   aafc67c
app-lock-fix                       1d6093c
ipad-native-app                    1eca9f8
landing-page                       06b01d3
landing-v32                        b1ca1fb
main                               1d85241   ← current
v7.8-batch-and-session-2026-06-24  dbad192
```

---

## 2. CLASSIFICATION OF EVERY UNCOMMITTED PATH

### 2.0 The rule I applied, and where the brief's three buckets do not partition the tree

The brief defines three buckets: **(a) NATIVE-ONLY** — `capacitor.config.ts`, `ios/**`, `android/**`; **(b) WEB** — anything that compiles into the Next bundle; **(c) WEBSITE-EMBED / CUSTOM-DOMAIN workstream**.

⚠️ **These three tests are not mutually exclusive and are not exhaustive, so "exactly one bucket" cannot be satisfied by the tests as written.** I did not silently force paths into a bucket. Precisely:

1. **(b) and (c) overlap.** `app/embed/[slug]/page.tsx` both compiles into the Next bundle *and* is a website-embed file. I resolved this by making **(c) win over (b)** — (c) is a workstream-membership test, (b) is a compile-target test, and the brief asks (c) to be enumerated by name. This ordering is my choice and I am flagging it as such.
2. **Some paths satisfy none of the three tests** — `.gitignore`, `package.json`, `package-lock.json`, `vercel.json`, `docs/**`, `content/store-listing.md`. They are listed in **§2.5 as an explicitly-labelled residue**, not forced.
3. 🔴 **Six modified files carry TWO workstreams in the same file** and therefore cannot be assigned to one bucket at all. They are in **§2.6**.

Ordering applied: `(a) → (c) → (b) → residue`.

### 2.1 Bucket (a) — NATIVE-ONLY

**`capacitor.config.ts`** — 1 modified.

**`ios/**`** — 🔴 **ZERO paths. Nothing under `ios/` is modified and nothing under `ios/` is untracked.** `git ls-files ios` shows 24 tracked files, all clean.

**`android/**`** — 37 paths (30 modified, 7 untracked):

```
MODIFIED (30)
  android/app/build.gradle                                          — release signing config
  android/app/src/main/AndroidManifest.xml                          — BLE flags + FCM icon meta-data
  android/app/src/main/java/com/hatchgrab/app/MainActivity.java     — edge-to-edge (+291 −1)
  android/app/src/main/res/drawable*/splash.png                     — 11 binaries
  android/app/src/main/res/mipmap-*/ic_launcher*.png                — 15 binaries

UNTRACKED (7)
  android/SIGNING.md
  android/keystore.properties.example
  android/app/src/main/res/drawable-mdpi/ic_stat_hatchgrab.png      (253 B)
  android/app/src/main/res/drawable-hdpi/ic_stat_hatchgrab.png      (357 B)
  android/app/src/main/res/drawable-xhdpi/ic_stat_hatchgrab.png     (452 B)
  android/app/src/main/res/drawable-xxhdpi/ic_stat_hatchgrab.png    (683 B)
  android/app/src/main/res/drawable-xxxhdpi/ic_stat_hatchgrab.png   (899 B)
```

⚠️ **`android/app/src/main/assets/capacitor.config.json` is NOT in this list and is not in `git status`** — it is gitignored at `android/.gitignore:99`. It exists on disk with **mtime 2026-08-26 20:23:08**. Its contents are quoted in §4.5.

### 2.2 Bucket (c) — WEBSITE-EMBED / CUSTOM-DOMAIN workstream — **CODE PATHS**

**14 untracked source files:**

```
app/api/cron/custom-domain-check/route.ts
app/api/embed/events/route.ts
app/domain/page.tsx
app/embed/[slug]/EmbedSchedule.tsx
app/embed/[slug]/page.tsx
components/dashboard/CustomDomainSetup.tsx
components/dashboard/EmbedWizard.tsx
components/embed/EmbedParts.tsx
lib/custom-domain/apex.ts
lib/custom-domain/copy.ts
lib/custom-domain/dns.ts
lib/custom-domain/vercel.ts
lib/custom-host.ts
lib/embed-instructions.ts
```

**5 modified files that carry ONLY this workstream:**

```
app/admin/page.tsx                (+86 −3)    Domains tab
app/api/admin/route.ts            (+1 −1)     eight custom_domain_* columns added to the trucks select
components/dashboard/types.ts     (+16 −0)    custom_domain_* and embed_* fields
lib/features.ts                   (+12 −0)    'embed_schedule'
lib/ratelimit.ts                  (+66 −0)    embedRatelimit, customHostRatelimit
```

⚠️ `app/manage/[token]/page.tsx` (+40 −3) and `app/dashboard/[token]/page.tsx` (+20 −4) also read as this workstream only (domain/embed notices); they are listed here rather than in §2.6 because grep of their added lines found no second concern.

**Two dependencies added to `package.json` for this workstream** (`+2 −0`, the entire diff):

```
dependencies:     "psl": "^1.15.0"
devDependencies:  "@types/psl": "^1.1.3"
```

### 2.3 Bucket (c) — THE UNAPPLIED MIGRATION FILES, BY NAME

🔴 **Six migration files exist on disk and are untracked. NONE has been applied. NONE was opened by this inventory — these are filenames only.**

```
supabase/migrations/20260826_trucks_embed_enabled.sql
supabase/migrations/20260826_trucks_embed_plan_answer.sql
supabase/migrations/20260826_trucks_embed_seen.sql
supabase/migrations/20260827_trucks_custom_domain.sql
supabase/migrations/20260827_trucks_custom_domain_monitor.sql
supabase/migrations/20260827_trucks_custom_domain_setup.sql
```

⚠️ **`app/api/admin/route.ts` already selects eight `custom_domain_*` columns** that these migrations create. That is a statement about the code in the tree, not a diagnosis.

### 2.4 Bucket (c) — workstream DOCUMENTATION (untracked)

```
docs/custom-domain-investigation.md
docs/custom-domain-monitoring-report.md
docs/custom-domain-provisioning-report.md
docs/custom-domain-serving-report.md
docs/website-embed-build-report.md
docs/website-embed-corrections-report.md
docs/website-embed-detection-report.md
docs/website-embed-links-report.md
docs/website-embed-read-report.md
docs/website-embed-report.md
docs/website-embed-wizard-report.md
```

### 2.5 Bucket (b) — WEB (compiles into the Next bundle), and the residue

**(b) — modified files that compile into the Next bundle and carry no (c) content:**

```
app/api/native/bind-device/route.ts        (+49 −6)
app/api/webhooks/meta/whatsapp/route.ts    (+178 −16)
app/dashboard/[token]/kds/page.tsx         (+30 −4)
app/kds/[kds_token]/page.tsx               (+43 −2)
components/TruckListCard.tsx               (+83 −20)
components/native/OperatorDeviceConfig.tsx (+44 −9)
components/native/VanMenuChooser.tsx       (+14 −2)
lib/native/device.ts                       (+59 −5)
lib/native/notifications.ts                (+19 −3)
lib/native/signOut.ts                      (+9 −0)
```

**(b) — untracked files that compile into the Next bundle:**

```
components/auth/SessionAlertBanner.tsx
lib/auth/session-observer.ts
lib/whatsapp/reply-cap.ts
lib/native/notificationIcon.ts
```

🔴 **`lib/native/*` and `components/native/*` ARE WEB BY THIS TEST, EXPLICITLY.** Their directory names say "native" and they are not. Every one of them is TypeScript/TSX imported by the Next application and compiled into the Next bundle that is served from `https://www.hatchgrab.com`. They ship by **deploy**, not by an App Store build. Nothing in either directory is a native source file, and neither directory is under `ios/` or `android/`.

⚠️ **`lib/native/notificationIcon.ts` is a special case worth stating: it is WEB by the compile test, but `capacitor.config.ts` also imports it directly** (`import { NOTIFICATION_SMALL_ICON } from './lib/native/notificationIcon'` — a relative path, because `@capacitor/cli` cannot resolve the `@/` alias). So one WEB file is read by the native CLI at sync time. It is still bucket (b) by the stated test.

**RESIDUE — none of the three tests matches. Not forced into a bucket:**

```
.gitignore            (+9 −0)     three signing-credential ignore rules
package.json          (+2 −0)     psl, @types/psl        — determines the bundle, is not IN it
package-lock.json                 lockfile
vercel.json           (+13 −0)    X-Robots-Tag on /embed/(.*) + a cron entry — platform config
docs/reference-manual.md (+2454 −29)
content/store-listing.md          untracked
docs/  — 19 further untracked reports (§2.7)
```

### 2.6 🔴 SIX MODIFIED FILES CARRY MORE THAN ONE WORKSTREAM AND CANNOT BE PUT IN ONE BUCKET

Determined by grepping each file's **added** lines for concern keywords.

| File | Concerns found in the added lines |
|---|---|
| `proxy.ts` (+114 −7) | **embed / custom-host (33 hits)** *and* **session resilience** — it adds `const hasStaleButRealSession = hasOperatorSession` and `if (isProtected && !user && !isNativeApp && !hasStaleButRealSession)`, which is the session workstream, alongside `isEmbedPublic`, `embedSlug` and the custom-host default-deny block |
| `app/providers.tsx` (+66 −3) | **PostHog host/path guard (13 hits)** *and* **custom-host (8 hits)** — one change serving two workstreams |
| `app/layout.tsx` (+13 −2) | **session resilience** (`import { SessionAlertBanner }`, `<SessionAlertBanner />`) *and* **custom-host** (made `async`, reads the host, passes it to `CSPostHogProvider`) |
| `components/dashboard/types.ts` (+16 −0) | **custom_domain (8)** + **embed (4)** + **bind-device `reason` (1)** — three |
| `lib/ratelimit.ts` (+66 −0) | embed (19) + custom-host (3) — both halves of (c), so bucket (c) is still correct for it |
| `docs/reference-manual.md` (+2454 −29) | every workstream at once |

These are reported as mixed. **I did not split, move, or edit any of them.**

### 2.7 Remaining untracked documentation (residue)

```
docs/android-ble-permissions-report.md          docs/cross-truck-van-binding-report.md
docs/android-bottom-inset-report.md             docs/deny-by-default-report.md
docs/android-capability-audit-report.md         docs/kds-token-exchange-report.md
docs/android-edge-to-edge-report.md             docs/menu-copy-plan-report.md
docs/android-icons-report.md                    docs/menu-copy-sql-report.md
docs/android-inventory-report.md                docs/operator-auth-investigation-report.md
docs/android-notification-fixes-report.md       docs/pre-reply-tree-check-report.md
docs/android-signing-report.md                  docs/rls-access-audit-report.md
docs/android-tester-truck-plan-report.md        docs/session-resilience-report.md
docs/bind-device-error-surfacing-report.md      docs/template-create-proof-report.md
docs/bind-device-truck-guard-report.md          docs/tester-truck-provisioning-report.md
docs/cap-filter-parse-check-report.md           docs/token-exposure-investigation-report.md
docs/whatsapp-reply-cap-report.md               docs/whatsapp-reply-cap-v2-report.md
```

---

## 3. THE TEN NAMED ITEMS — PRESENT-UNCOMMITTED / PRESENT-COMMITTED / NOT FOUND

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | WhatsApp reply cap | **PRESENT-UNCOMMITTED** | §3.1 |
| 2 | Android notification icons | **PRESENT-UNCOMMITTED** | §3.2 |
| 3 | Signing config | **PRESENT-UNCOMMITTED** | §3.3 |
| 4 | BLE manifest | **PRESENT-UNCOMMITTED** | §3.4 |
| 5 | Bind-device fixes | **THREE exist, not two — 2 UNCOMMITTED, 1 COMMITTED** | §3.5 |
| 6 | Session resilience | **PRESENT-UNCOMMITTED** | §3.6 |
| 7 | Deny-by-default on `/api/manage` | **PRESENT-UNCOMMITTED** | §3.7 |
| 8 | KDS route change | **PRESENT-UNCOMMITTED** | §3.8 |
| 9 | Edge-to-edge | **PRESENT-UNCOMMITTED** | §3.9 |

*(The brief lists nine named items across ten slots — "bind-device fixes (two are believed to exist)" is one slot covering a plural. Counted as nine rows. If a tenth was intended and was lost in transmission, it is not in the text I received.)*

### 3.1 WhatsApp reply cap — PRESENT-UNCOMMITTED

- `lib/whatsapp/reply-cap.ts` — **11,155 bytes, mtime 2026-08-25 13:23, untracked.** `git cat-file -e HEAD:lib/whatsapp/reply-cap.ts` → *"exists on disk, but not in 'HEAD'"*. `git ls-tree HEAD lib/whatsapp/` returns only `connection-state.ts` and `upcoming-events.ts`.
- Consumer: `app/api/webhooks/meta/whatsapp/route.ts:13` — `} from '@/lib/whatsapp/reply-cap'`. That file is modified, **+178 −16**.
- 🔴 **The module the webhook imports does not exist at HEAD.** A checkout of HEAD would not compile that import.

### 3.2 Android notification icons — PRESENT-UNCOMMITTED

- Five untracked PNGs at `drawable-{m,h,x,xx,xxx}hdpi/ic_stat_hatchgrab.png`, all **mtime 2026-08-25 21:53**.
- `lib/native/notificationIcon.ts` — untracked; `git ls-tree HEAD` returns nothing for it. It exports `NOTIFICATION_SMALL_ICON = 'ic_stat_hatchgrab'` and is deliberately import-free.
- `AndroidManifest.xml` adds `com.google.firebase.messaging.default_notification_icon` → `@drawable/ic_stat_hatchgrab` (added line, §3.4).
- `capacitor.config.ts` references the constant, not a literal. `lib/native/notifications.ts` is modified (+19 −3) with 4 references to `NOTIFICATION_SMALL_ICON`.

### 3.3 Signing config — PRESENT-UNCOMMITTED

- `android/app/build.gradle` **modified**: adds a `keystorePropertiesFile = rootProject.file("keystore.properties")` load guarded by `def hasKeystore = keystorePropertiesFile.exists()`, a `signingConfigs { if (hasKeystore) { release { … } } }` block, and `if (hasKeystore) { signingConfig signingConfigs.release }` inside `buildTypes.release`. `minifyEnabled false` and the proguard line are unchanged.
- `android/SIGNING.md` — untracked, 3,205 bytes, mtime 2026-08-25 22:26. **Not opened.**
- `android/keystore.properties.example` — untracked, 630 bytes. **Not opened.**
- `.gitignore` **modified**, adding `android/keystore.properties`, `android/*.keystore`, `android/*.jks`.
- `android/keystore.properties` — **exists on disk** (`test -f` only; the file was **not read**) and is confirmed ignored by `.gitignore:58`.
- 🔴 **No credential value is recorded anywhere in this report.** The gradle diff contains property *keys* (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) read out of a file that was never opened.

### 3.4 BLE manifest — PRESENT-UNCOMMITTED

`android/app/src/main/AndroidManifest.xml` is modified and adds:

- `xmlns:tools="http://schemas.android.com/tools"` on `<manifest>`
- `<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" tools:targetApi="s" />`
- `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" tools:node="remove" />`
- `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" tools:node="remove" />`
- the FCM `default_notification_icon` meta-data (§3.2)

### 3.5 Bind-device fixes — **THREE EXIST, NOT TWO**

The brief says two are believed to exist. **I found three distinct changes, and one of them is already committed.**

| Fix | Status | Evidence |
|---|---|---|
| **(i) Cross-truck van SECURITY GATE** — rejects a `van_id` that does not belong to this truck | 🔴 **PRESENT-COMMITTED** | `git show HEAD:app/api/native/bind-device/route.ts` line 68: `// SECURITY GATE: van must belong to THIS truck.` and line 72 `if (!van) return … 404`. It is a **context line** in the working diff — the guard itself is unchanged. |
| **(ii) Machine-readable `reason` vocabulary** — a `BindDeviceReason` union of five values added beside the existing `error` on every failure branch | **PRESENT-UNCOMMITTED** | Added type + `satisfies BindDeviceReason` on all five returns. `lib/native/device.ts` (+59 −5) carries 15 `reason` hits on the client side. |
| **(iii) Stale `van_id` cleared when `truck_id` moves** — on a patch that omits `van_id`, read the existing row unscoped and `patch.van_id = null` if `existing.truck_id !== truck.id` | **PRESENT-UNCOMMITTED** | The new `else` branch in `POST`. |

Supporting uncommitted files: `components/native/OperatorDeviceConfig.tsx` (+44 −9), `components/native/VanMenuChooser.tsx` (+14 −2), `components/dashboard/types.ts` (+16 −0). Route total: **+49 −6**.

Three untracked docs correspond: `bind-device-error-surfacing-report.md`, `bind-device-truck-guard-report.md`, `cross-truck-van-binding-report.md`.

### 3.6 Session resilience — PRESENT-UNCOMMITTED

- `lib/auth/session-observer.ts` — on disk, **not at HEAD**.
- `components/auth/SessionAlertBanner.tsx` — on disk, **not at HEAD**.
- Wiring, all uncommitted: `app/layout.tsx:9` imports the banner and `:96` renders it; `lib/native/signOut.ts:4` imports `beginUserSignOut` and `:28` calls it; `proxy.ts` adds `hasStaleButRealSession` so a stale-but-real credential is not bounced to `/login`.
- Diffstat of the wiring: `app/layout.tsx +13 −2`, `app/providers.tsx +66 −3`, `lib/native/signOut.ts +9 −0`.

### 3.7 Deny-by-default on `/api/manage` — PRESENT-UNCOMMITTED

`app/api/manage/route.ts` — **+502 −59**, the largest single-file change in the tree.

The gate as it stands in the working tree:

```
line  80  | { ok: false; status: 401 | 403; error: string }
line 105  return { ok: false, status: 401, error: 'Sign in required' }
line 128  return { ok: false, status: 403, error: 'You do not have access to this truck' }
line 149  // 🔴 DENY BY DEFAULT. Was: `let userRole = 'owner'` narrowed only on a resolved session, so no
line 153  const userRole = access.role
```

⚠️ **This file is one of the mixed ones.** The same +502 also contains the website-embed actions (`save_embed_setup`, `get_embed_status`, `send_embed_instructions`, `detect_platform`) and the custom-domain actions (`domain_preflight`, `domain_status`, `domain_provision`, `domain_send_instructions`, `domain_confirm`). **The security change and the (c) workstream are interleaved in one uncommitted file.**

### 3.8 KDS route change — PRESENT-UNCOMMITTED

- `app/kds/[kds_token]/page.tsx` — **+43 −2**.
- 🔴 **HEAD still performs the token exchange.** `git show HEAD:app/kds/[kds_token]/page.tsx` contains `redirect(` at line 32 after the two lookups. The working tree replaces that redirect with a rendered `<Suspense><KdsPage token={truck.dashboard_token} vanId={van.id} vanName={van.name} /></Suspense>`. Both failure paths (`redirect('/login')` at lines 53 and 61) are unchanged.
- `app/dashboard/[token]/kds/page.tsx` — **+30 −4** (accepts the props).

### 3.9 Edge-to-edge — PRESENT-UNCOMMITTED

- `android/app/src/main/java/com/hatchgrab/app/MainActivity.java` — **+291 −1**.
- HEAD's version, in full, is four lines:

```java
package com.hatchgrab.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

- 🔴 **iOS has no counterpart.** `grep -rn "safeArea\|WindowInsets\|edge-to-edge\|edgeToEdge" ios/App/App/*.swift` returns **nothing**, and nothing under `ios/` is modified. The edge-to-edge work is Android-only in the tree.

---

## 4. NATIVE BUILD IDENTITY

### 4.1 `ios/App/App.xcodeproj/project.pbxproj` — tracked, CLEAN (not modified in the working tree)

| Setting | Debug (line) | Release (line) |
|---|---|---|
| `MARKETING_VERSION` | `1.0` (321) | `1.0` (346) |
| `CURRENT_PROJECT_VERSION` | `1` (312) | `1` (337) |
| `PRODUCT_BUNDLE_IDENTIFIER` | `com.hatchgrab.app` (323) | `com.hatchgrab.app` (347) |
| `TARGETED_DEVICE_FAMILY` | `"1,2"` (327) | `"1,2"` (351) |

Both configurations are identical on all four settings. `"1,2"` = iPhone **and** iPad.

### 4.2 `capacitor.config.ts` — MODIFIED (+21 −3)

**`server.url`, quoted verbatim:**

```ts
const CAP_SERVER_BASE = process.env.CAP_SERVER_URL || 'https://www.hatchgrab.com'
const IS_LOCAL_HTTP = CAP_SERVER_BASE.startsWith('http://')
const CAP_SERVER_HOST = new URL(CAP_SERVER_BASE).hostname
…
  server: {
    url: `${CAP_SERVER_BASE}/app`,
    cleartext: IS_LOCAL_HTTP,
    allowNavigation: [CAP_SERVER_HOST],
  },
```

⚠️ It is **computed, not a literal**. With `CAP_SERVER_URL` unset it evaluates to `https://www.hatchgrab.com/app`, `cleartext: false`, `allowNavigation: ['www.hatchgrab.com']`. **I did not execute this file** — that is a parse of the expression, and the value that was actually baked is read from the artefacts in §4.3 and §4.5.

**The entire `ios` block, quoted verbatim (comments included, as they are part of the block):**

```ts
  ios: {
    // 'never' = don't let the OS auto-inset the scroll view for safe areas; the WEB layer owns the inset
    // instead (viewport-fit=cover + env(safe-area-inset-top) padding on AppHeader), so the dark header
    // extends into the status-bar strip and no page content shows above it. ('always' double-insets against
    // the CSS env padding and let content bleed into the top inset once scroll was enabled.)
    contentInset: 'never',
    backgroundColor: '#1C1C1E',
    // MUST stay true. `false` (the original scaffold default) disables the WKWebView's scrollView, which
    // kills body/window scroll — so the natural-flow `min-h-screen` pages (Dashboard, Manage, Admin) can't
    // scroll and content below the fold is unreachable in the app (KDS is fine — it's a fixed flex-col with
    // its own inner min-h-0 + overflow-y-auto region). Web is unaffected either way (this is an iOS shell
    // setting). If this reintroduces rubber-band/overscroll on the fixed layouts, the alternative is a
    // per-page structural fix (cap those 3 pages to h-dvh flex-col + inner overflow-y-auto, mirroring KDS).
    scrollEnabled: true,
    // Marker appended to the WKWebView User-Agent so the server (proxy.ts) can tell native-app requests
    // from a normal browser on NAVIGATION requests (which carry no cookie and no Bearer). The proxy auth
    // guard defers to client-side native-session auth when it sees this; a real browser never has it, so
    // web is unaffected. Do NOT remove without updating proxy.ts's isNativeApp check.
    appendUserAgent: 'HatchGrabNativeApp',
  },
```

### 4.3 `ios/App/App/capacitor.config.json` — the SYNCED artefact. **PRESENT.**

**Gitignored** at `ios/.gitignore:12` (`App/App/capacitor.config.json`), which is why it does not appear in `git status`. Read directly, **not regenerated**.

🔴 **mtime: `2026-08-17 23:06:40`.**

**`server.url`, quoted verbatim from the file:**

```json
	"server": {
		"url": "https://www.hatchgrab.com/app",
		"cleartext": false,
		"allowNavigation": [
			"www.hatchgrab.com"
		]
	},
```

The complete file:

```json
{
	"appId": "com.hatchgrab.app",
	"appName": "HatchGrab",
	"webDir": "out",
	"server": {
		"url": "https://www.hatchgrab.com/app",
		"cleartext": false,
		"allowNavigation": ["www.hatchgrab.com"]
	},
	"ios": {
		"contentInset": "never",
		"backgroundColor": "#1C1C1E",
		"scrollEnabled": true,
		"appendUserAgent": "HatchGrabNativeApp"
	},
	"android": {
		"backgroundColor": "#1C1C1E",
		"appendUserAgent": "HatchGrabNativeApp"
	},
	"plugins": {
		"SplashScreen": { "launchShowDuration": 1000, "backgroundColor": "#1C1C1E", "showSpinner": false, "launchAutoHide": true },
		"LocalNotifications": { "smallIcon": "ic_stat_icon_config_sample", "iconColor": "#F5A623", "sound": "beep.wav" },
		"CapacitorHttp": { "enabled": false }
	},
	"packageClassList": [
		"BiometricAuthNative", "BluetoothLe", "KeepAwakePlugin", "AppPlugin",
		"LocalNotificationsPlugin", "CAPNetworkPlugin", "PreferencesPlugin",
		"PushNotificationsPlugin", "StatusBarPlugin"
	]
}
```

🔴 **This artefact is 10 days older than the source and disagrees with it.** `LocalNotifications` here says `"smallIcon": "ic_stat_icon_config_sample"`, `"iconColor": "#F5A623"`, `"sound": "beep.wav"`. The source `capacitor.config.ts` says `NOTIFICATION_SMALL_ICON` (= `ic_stat_hatchgrab`), `#EF8B2C`, and has **no** `sound` key. **Stated as an observation, not a diagnosis.**

### 4.4 `ios/App/App/Info.plist` — EVERY key

Tracked and **clean**. Twenty keys, in file order:

| # | Key | Value |
|---|---|---|
| 1 | `CAPACITOR_DEBUG` | `$(CAPACITOR_DEBUG)` |
| 2 | `CFBundleDevelopmentRegion` | `en` |
| 3 | `CFBundleDisplayName` | `HatchGrab` |
| 4 | `CFBundleExecutable` | `$(EXECUTABLE_NAME)` |
| 5 | `CFBundleIdentifier` | `$(PRODUCT_BUNDLE_IDENTIFIER)` |
| 6 | `CFBundleInfoDictionaryVersion` | `6.0` |
| 7 | `CFBundleName` | `HatchGrab` |
| 8 | `CFBundlePackageType` | `APPL` |
| 9 | `CFBundleShortVersionString` | `$(MARKETING_VERSION)` |
| 10 | `CFBundleVersion` | `$(CURRENT_PROJECT_VERSION)` |
| 11 | `ITSAppUsesNonExemptEncryption` | `<false/>` |
| 12 | `NSFaceIDUsageDescription` | `Unlock HatchGrab with Face ID.` |
| 13 | `NSBluetoothAlwaysUsageDescription` | `HatchGrab uses Bluetooth to connect to your kitchen receipt printer so order tickets can be printed automatically. It is not used for anything else.` |
| 14 | `LSRequiresIPhoneOS` | `<true/>` |
| 15 | `UILaunchStoryboardName` | `LaunchScreen` |
| 16 | `UIMainStoryboardFile` | `Main` |
| 17 | `UIRequiredDeviceCapabilities` | `[armv7]` |
| 18 | `UISupportedInterfaceOrientations` | Portrait, LandscapeLeft, LandscapeRight |
| 19 | `UISupportedInterfaceOrientations~ipad` | Portrait, PortraitUpsideDown, LandscapeLeft, LandscapeRight |
| 20 | `UIViewControllerBasedStatusBarAppearance` | `<true/>` |

**Keys that are NOT present** (stated because absence is evidence for §6): `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSMicrophoneUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`. `grep -i "NSCamera|NSPhotoLibrary|NSMicrophone|NSLocation"` returns nothing.

### 4.5 🔴 MANUAL vs TREE — where they were compared, and what each says

The brief requires that where `docs/reference-manual.md` and the tree disagree, **both** are reported with the source of each reading.

**Comparison point 1 — the synced Capacitor artefacts (V11.43 entry, manual lines 14212–14228).**

| Source | Reading |
|---|---|
| **Manual**, `docs/reference-manual.md:14220-14221` | *"✅ Synced and verified by reading the artefact: `ic_stat_hatchgrab`, `#EF8B2C`, no `beep.wav`."* |
| **Manual**, `docs/reference-manual.md:14222-14223` | *"⚠️ **`cap sync android` does NOT regenerate the iOS artefact** — `ios/App/App/capacitor.config.json` is still stale."* |
| **Tree** — `android/app/src/main/assets/capacitor.config.json`, mtime 2026-08-26 20:23:08 | `"LocalNotifications": {"smallIcon": "ic_stat_hatchgrab", "iconColor": "#EF8B2C"}` — **no `sound` key** |
| **Tree** — `ios/App/App/capacitor.config.json`, mtime 2026-08-17 23:06:40 | `"LocalNotifications": {"smallIcon": "ic_stat_icon_config_sample", "iconColor": "#F5A623", "sound": "beep.wav"}` |

✅ **On this point the manual and the tree AGREE.** The manual's Android claim is corroborated by the Android artefact, and its explicit warning that the iOS artefact is stale is corroborated by the iOS artefact. I read the manual at those line numbers and the artefacts on disk; the tree is the authority and it confirms the manual here.

**Comparison point 2 — iOS version settings (manual line 14819).**

| Source | Reading |
|---|---|
| **Manual**, `docs/reference-manual.md:14819` | *"Also READ: `MARKETING_VERSION = 1.0` and `CURRENT_PROJECT_VERSION = 1` in both configurations."* |
| **Tree** — `ios/App/App.xcodeproj/project.pbxproj` lines 312/321/337/346 | `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1`, both configurations |

✅ **AGREE.**

**Comparison point 3 — camera.** `grep -i "@capacitor/camera|NSCameraUsageDescription|Take Photo"` over `docs/reference-manual.md` returns **no matches**. The manual makes no claim here, so there is nothing to disagree with; §6 rests on the tree alone.

---

## 5. THE ARCHIVES

`~/Library/Developer/Xcode/Archives` exists. 🔴 **TWO archives match `CFBundleShortVersionString = 1.0`, `CFBundleVersion = 1`, `com.hatchgrab.app`. As instructed, both are listed and NEITHER is picked.**

### 5.1 Archive A

| Field | Value |
|---|---|
| **Path** | `/Users/dominicbonini/Library/Developer/Xcode/Archives/2026-08-20/App 20-08-2026, 15.09.xcarchive` |
| Name | `App` |
| `CFBundleIdentifier` | `com.hatchgrab.app` |
| `CFBundleShortVersionString` | `1.0` |
| `CFBundleVersion` | `1` |
| **`CreationDate`** | `Thu Aug 20 15:09:30 GMT 2026` |
| Filesystem mtime | `2026-08-20 15:09:30` |
| **dSYMs** | **PRESENT** — `App.app.dSYM`, `Capacitor.framework.dSYM`, `Cordova.framework.dSYM` |
| App binary | 609,504 bytes, mtime `2026-08-20 15:09:30` |

`dwarfdump --uuid`:

```
App.app.dSYM                   UUID: D6113615-7496-3279-963E-6E9E8820F05C (arm64)
Capacitor.framework.dSYM       UUID: 13CCF5B7-219A-3563-8309-544DA1541DEB (arm64)
Cordova.framework.dSYM         UUID: AA2E2AAA-BEC0-357F-8DE0-2F87FA094534 (arm64)
```

### 5.2 Archive B

| Field | Value |
|---|---|
| **Path** | `/Users/dominicbonini/Library/Developer/Xcode/Archives/2026-08-20/App 20-08-2026, 16.31.xcarchive` |
| Name | `App` |
| `CFBundleIdentifier` | `com.hatchgrab.app` |
| `CFBundleShortVersionString` | `1.0` |
| `CFBundleVersion` | `1` |
| **`CreationDate`** | `Thu Aug 20 16:31:50 GMT 2026` |
| Filesystem mtime | `2026-08-20 16:35:36` |
| **dSYMs** | **PRESENT** — `App.app.dSYM`, `Capacitor.framework.dSYM`, `Cordova.framework.dSYM` |
| App binary | 609,504 bytes, mtime `2026-08-20 16:31:50` |

`dwarfdump --uuid`:

```
App.app.dSYM                   UUID: D6113615-7496-3279-963E-6E9E8820F05C (arm64)
Capacitor.framework.dSYM       UUID: 13CCF5B7-219A-3563-8309-544DA1541DEB (arm64)
Cordova.framework.dSYM         UUID: AA2E2AAA-BEC0-357F-8DE0-2F87FA094534 (arm64)
```

### 5.3 🔴 THE TWO ARCHIVES CARRY IDENTICAL BINARY UUIDs

**All three UUIDs are byte-identical between Archive A and Archive B**, and both `App` binaries are 609,504 bytes. Recorded as an observation.

### 5.4 What was baked inside each archived `.app`

Both archives contain, at `Products/Applications/App.app/capacitor.config.json`:

```json
"server": {"url": "https://www.hatchgrab.com/app", "cleartext": false, "allowNavigation": ["www.hatchgrab.com"]}
"ios":    {"contentInset": "never", "backgroundColor": "#1C1C1E", "scrollEnabled": true, "appendUserAgent": "HatchGrabNativeApp"}
```

Archive A config mtime `2026-08-20 15:09:27`; Archive B config mtime `2026-08-20 16:31:45`. **Neither baked a localhost URL.**

Archived `App.app` contents (identical in both): `App`, `AppIcon60x60@2x.png`, `AppIcon76x76@2x~ipad.png`, `Assets.car`, `Base.lproj`, `Frameworks`, `Info.plist`, `PkgInfo`, `PrivacyInfo.xcprivacy`, `_CodeSignature`, `capacitor.config.json`, `config.xml`, `embedded.mobileprovision`, `public`.

The archived (submitted) `Info.plist` resolves to:

```
CFBundleShortVersionString      1.0
CFBundleVersion                 1
CFBundleIdentifier              com.hatchgrab.app
CFBundleDisplayName             HatchGrab
UIDeviceFamily                  [1, 2]
MinimumOSVersion                15.0
ITSAppUsesNonExemptEncryption   false
NSBluetoothAlwaysUsageDescription  (present)
NSFaceIDUsageDescription           (present)
DTPlatformVersion               26.5      DTSDKName  iphoneos26.5
DTXcode                         2660      DTXcodeBuild 17F113
BuildMachineOSBuild             25G83
```

⚠️ **No `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription` or any `NSLocation*` key is in the submitted build's `Info.plist`.**

### 5.5 HEAD sha at archive time

Reflog entries bracketing 20 August 2026:

```
2c7ecc2  2026-08-20 12:21:46 +0100  apple testing
dea3aba  2026-08-20 14:01:37 +0100  kds fix
b4c7517  2026-08-20 17:31:58 +0100  updates
6891515  2026-08-20 18:00:07 +0100  website fix
```

⚠️ **There is a timezone ambiguity in the source data and I am stating it rather than resolving it silently.** `PlistBuddy` prints the archive `CreationDate` labelled `GMT` (15:09:30 / 16:31:50) while the filesystem mtimes are local BST and read the *same* wall-clock values (15:09:30 / 16:31:50). The two cannot both be right. **It does not change the answer**, because both readings fall in the same interval:

| Archive | If timestamps are LOCAL (BST) | If timestamps are UTC (→ BST) | HEAD |
|---|---|---|---|
| A | 15:09:30 | 16:09:30 | **`dea3aba`** either way |
| B | 16:31:50 | 17:31:50 — 8 s *before* `b4c7517` at 17:31:58 | **`dea3aba`** either way |

**Determination: HEAD was `dea3aba` ("kds fix", 2026-08-20 14:01:37 +0100) when both archives were created.**

🔴 **WHAT THIS DOES NOT ESTABLISH, STATED PLAINLY.** The reflog records what **HEAD** pointed at. It records **nothing** about whether the working tree was clean at that moment. **Whether uncommitted changes were present in the tree when either archive was built is NOT DETERMINABLE from any evidence available to me** — there is no reflog, stash, index snapshot, or build log that captures worktree state. If uncommitted work was in the tree on 20 August, it went into the archive and left no trace I can read.

### 5.6 What changed under `ios/` between `dea3aba` and now

```
$ git diff --stat dea3aba HEAD -- ios/
 ios/App/App.xcodeproj/project.pbxproj | 14 ++++++++------
 1 file changed, 8 insertions(+), 6 deletions(-)

$ git status --porcelain -uall -- ios/
 (empty)
```

**Exactly one file, and the substantive part of that change is two lines**, made by commit `b4c7517` ("updates", 20 Aug 17:31:58 — *after* both archives):

```diff
+				INFOPLIST_KEY_CFBundleDisplayName = HatchGrab;     (Debug)
+				INFOPLIST_KEY_CFBundleDisplayName = HatchGrab;     (Release)
```

The remaining 6 insertions / 6 deletions are **pure reordering** of `PBXBuildFile` and `PBXFileReference` entries (the `HG01BB…` ids moved below the `504EC3…` ids). No setting value changed.

`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`, `PRODUCT_BUNDLE_IDENTIFIER` and `TARGETED_DEVICE_FAMILY = "1,2"` are **identical at `dea3aba` and at HEAD**. `Info.plist`, `AppDelegate.swift`, `HGBridgeViewController.swift` and `PrivacyInfo.xcprivacy` are **byte-identical** between `dea3aba` and the working tree.

### 5.7 What this means for "what source state produced the submitted build"

**Established:** the tracked native iOS source at HEAD is one two-line `INFOPLIST_KEY_CFBundleDisplayName` addition away from the state at archive time, and nothing under `ios/` is uncommitted now.

**Unobserved:** the submitted build loads its UI from `https://www.hatchgrab.com/app` at runtime. The **web** half of what a reviewer saw on 27 August 2026 is whatever was deployed to that URL at the time they opened it, which is **not recorded in this repository** and which I have not observed. The `public/` folder inside the archive is the `webDir: "out"` fallback, not the served application.

---

## 6. CAMERA AND LOCATION SURFACES

**As instructed: this section lists what is there. It offers no view on whether any of it is the cause of anything.**

### 6.1 The "Import your menu" step

`app/manage/[token]/page.tsx:4956` — `<h3 className="font-black text-slate-900 mb-1">Import your menu</h3>`, inside the modal gated on `importStep === 'upload' && !showSetupIntro` (line 4946).

Its body text, line 4957: *"Upload a photo of your menu board, a screenshot, a PDF, or paste your menu as text."*

Its control is `<MenuUploadFields file={importFile} onFile={setImportFile} text={importText} onText={setImportText} />` at line 4960, from `components/menu/MenuUploadFields.tsx` — shared with the public demo modal.

### 6.2 The "Take Photo" control

🔴 **THERE IS NO "Take Photo" CONTROL. No button, link, or label with that string exists in the codebase.**

`grep -rn -i "take photo\|take a photo"` over `app`, `components`, `lib` returns exactly **one** match, and it is prose in a marketing paragraph, not a control:

```
app/manage/[token]/page.tsx:3856
  Take a photo of your menu board, screenshot your existing menu, or drag in a PDF —
  our AI will extract everything and build your digital menu automatically.
```

The actual control in `MenuUploadFields.tsx` (lines 57–72) is a `<label>` wrapping a plain file input, with a 📷 emoji as its icon and the caption **"Drag and drop or tap to choose"** / "Image or PDF":

```tsx
<label {...dragProps} className={…}>
  <span className="text-3xl">{isDragging ? '📂' : file ? '✅' : '📷'}</span>
  <span className="text-sm text-slate-700 text-center break-all">
    {isDragging ? 'Drop your menu here' : file ? file.name : 'Drag and drop or tap to choose'}
  </span>
  {!isDragging && !file && <span className="text-xs text-slate-500">Image or PDF</span>}
  <input type="file" accept="image/*,.pdf" className="sr-only" disabled={disabled}
         onChange={e => onFile(e.target.files?.[0] || null)} />
</label>
```

### 6.3 `getUserMedia` / `navigator.mediaDevices` / `MediaDevices` / `getDisplayMedia`

🔴 **ZERO call sites.** `grep -rn "getUserMedia\|mediaDevices\|MediaDevices\|getDisplayMedia"` over `app`, `components`, `lib` returns **no matches at all**.

### 6.4 `navigator.geolocation` / `getCurrentPosition` / `watchPosition` / `Geolocation`

🔴 **ZERO call sites.** `grep -rn "navigator.geolocation\|getCurrentPosition\|watchPosition\|Geolocation"` over `app`, `components`, `lib` returns **no matches at all**.

### 6.5 `<input capture>`

🔴 **ZERO occurrences.** A repository-wide `grep -rn "capture=" .` (excluding `node_modules`, `.next`, `.git`) returns 12 matches, **all of which are the unrelated payment-log string `capture=` in `lib/payments/promote-draft.ts:529` and in report files quoting its output.** No HTML `capture` attribute exists anywhere in the repository.

### 6.6 Every file input in the application

**Fourteen** `<input type="file">` elements. **None has a `capture` attribute.**

| File | Line | `accept` |
|---|---|---|
| `app/admin/page.tsx` | 1574–1575 | `image/*,application/pdf` |
| `app/manage/[token]/page.tsx` | 1018 | `image/*,application/pdf` |
| `app/manage/[token]/page.tsx` | 1092 | `image/*,application/pdf` |
| `app/manage/[token]/page.tsx` | 4061 | `image/*` |
| `app/manage/[token]/page.tsx` | 4467 | `image/*,.pdf` |
| `app/manage/[token]/page.tsx` | 4798 | `image/*` |
| `app/manage/[token]/page.tsx` | 5711 | `image/*,application/pdf` |
| `app/manage/[token]/page.tsx` | 8202 | `image/*,.pdf` |
| `app/manage/[token]/page.tsx` | 8275 | `image/*,.pdf` |
| `app/manage/[token]/page.tsx` | 9098 | `image/*` |
| `components/DemoGetStarted.tsx` | 868 | `image/*` |
| `components/DemoGetStarted.tsx` | 877 | `image/*` |
| `components/menu/MenuUploadFields.tsx` | 69 | `image/*,.pdf` |

*(Row count 13; `app/admin/page.tsx` is one element spanning lines 1574–1575.)*

### 6.7 `@capacitor/camera` and `@capacitor/geolocation` in `package.json`

🔴 **`@capacitor/camera`: NOT PRESENT.**
🔴 **`@capacitor/geolocation`: NOT PRESENT.**

Neither appears in `dependencies` or `devDependencies`. The complete Capacitor dependency set is:

```
@aparajita/capacitor-biometric-auth   10.0.0
@capacitor-community/bluetooth-le      8.3.0
@capacitor-community/keep-awake        8.0.1
@capacitor/android                     8.4.1
@capacitor/app                         8.1.0
@capacitor/cli                         8.4.0
@capacitor/core                        8.4.0
@capacitor/ios                         8.4.0
@capacitor/local-notifications         8.2.0
@capacitor/network                     8.0.1
@capacitor/preferences                 8.0.1
@capacitor/push-notifications          8.1.1
@capacitor/status-bar                  8.0.2
```

### 6.8 `ios/App/Podfile` and `ios/App/Podfile.lock`

🔴 **BOTH ARE ABSENT.** `ios/App/` contains exactly three entries: `App`, `App.xcodeproj`, `CapApp-SPM`. **This project does not use CocoaPods** — iOS dependencies are declared through Swift Package Manager in `ios/App/CapApp-SPM/Package.swift`.

That file declares ten packages, and **neither camera nor geolocation is among them**:

```swift
.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.0"),
.package(name: "AparajitaCapacitorBiometricAuth", path: "…/@aparajita/capacitor-biometric-auth"),
.package(name: "CapacitorCommunityBluetoothLe",   path: "…/@capacitor-community/bluetooth-le"),
.package(name: "CapacitorCommunityKeepAwake",     path: "…/@capacitor-community/keep-awake"),
.package(name: "CapacitorApp",                    path: "…/@capacitor/app"),
.package(name: "CapacitorLocalNotifications",     path: "…/@capacitor/local-notifications"),
.package(name: "CapacitorNetwork",                path: "…/@capacitor/network"),
.package(name: "CapacitorPreferences",            path: "…/@capacitor/preferences"),
.package(name: "CapacitorPushNotifications",      path: "…/@capacitor/push-notifications"),
.package(name: "CapacitorStatusBar",              path: "…/@capacitor/status-bar")
```

`grep -i "camera\|geolocation"` over `ios/App/CapApp-SPM/Package.swift` returns nothing.

### 6.9 Supporting reads

- `ios/App/App/PrivacyInfo.xcprivacy` declares one accessed-API category (`NSPrivacyAccessedAPICategoryUserDefaults`, reason `CA92.1`), `NSPrivacyTracking = false`, an empty `NSPrivacyTrackingDomains`, and one collected data type (`NSPrivacyCollectedDataTypeDeviceID`, linked, not tracking, purpose App Functionality). **No camera, photo, or location declaration.**
- The synced `ios/App/App/capacitor.config.json` `packageClassList` names nine plugin classes: `BiometricAuthNative`, `BluetoothLe`, `KeepAwakePlugin`, `AppPlugin`, `LocalNotificationsPlugin`, `CAPNetworkPlugin`, `PreferencesPlugin`, `PushNotificationsPlugin`, `StatusBarPlugin`. **No camera or geolocation class.**
- `AndroidManifest.xml`'s uncommitted change actively **removes** `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` from the merged manifest via `tools:node="remove"`.

---

## 7. WHAT REMAINS UNOBSERVED

**Nothing has been rendered. No page, no screen, no simulator, no device.**

1. **Nothing was typechecked and nothing was executed.** Every claim above is a parse of file bytes or filesystem metadata. `tsc` was not run. No module was loaded. No test harness was executed.
2. 🔴 **Whether either archive was built from a clean tree is NOT DETERMINABLE.** The reflog gives HEAD (`dea3aba`); no artefact records worktree state at 15:09 or 16:31 on 20 August 2026.
3. 🔴 **Which of the two matching archives was uploaded to App Store Connect is NOT DETERMINABLE from this machine.** Both carry `1.0 (1)` and identical binary UUIDs. Neither was picked. `~/Library/Developer/Xcode/Archives` records creation, not submission; the distribution/upload record lives in App Store Connect, which I did not access.
4. **The web application the 27 August reviewer actually saw is unobserved.** The shell loads `https://www.hatchgrab.com/app` at runtime; what was deployed there on that date is not recorded in this repository and I did not fetch it.
5. **The six migration files were not opened.** I know their names. I do not know their contents, and I do not know the live database schema — including whether the eight `custom_domain_*` columns that `app/api/admin/route.ts` now selects exist in production.
6. **`android/keystore.properties` was not opened**, only tested for existence. `android/SIGNING.md` and `android/keystore.properties.example` were not opened either.
7. **Binary assets were not inspected.** The 26 modified Android PNGs and the 5 untracked `ic_stat_hatchgrab.png` files are reported by path and size only; no pixels were sampled.
8. **`package-lock.json`'s diff was not examined** beyond its presence in `git status`.
9. **`docs/reference-manual.md` was read only at the three comparison points in §4.5.** Its other 2,454 added lines were not audited against the tree, so further manual/tree divergences may exist that this inventory did not look for.
10. **The seven other branches were not inspected** beyond their tip shas. Work present on `ipad-native-app` or elsewhere and absent from `main` is outside this inventory.
11. **No `cap sync` was run**, so the staleness of `ios/App/App/capacitor.config.json` (§4.3) is reported as observed, and the artefact a sync *would* produce is unobserved.
