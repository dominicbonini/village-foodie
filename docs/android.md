# Android workstream — working log

**APPEND-ONLY.** Never overwrite this file. New entries go at the bottom.
Transient per-task reports live in `docs/android-report.md` (overwritten each task).
`docs/last-report.md` belongs to a **different workstream** — never read or write it.

> **File created 2026-07-26.** It did not exist before this entry, so there was no
> prior work list to mark items against — the work list below was started here.
> Nothing pre-existing was overwritten or discarded.

---

## Facts (verified, do not re-derive)

- `van_devices` has **7 rows, all `platform='ios'`, ZERO with a `push_token`.** Push has
  never delivered. No NULL `platform` values exist today. (Verified against the live DB
  by the user, 2026-07-26.)
- `proxy.ts:164` is the native-app escape hatch: it substring-matches the UA marker
  `HatchGrabNativeApp` and, when present, defers the cookie-blind auth guard. Any
  platform whose webview does not append that exact string will 307-loop `/dashboard`
  and `/manage` to `/login` (the V8.7 login loop).
- `lib/apns.ts` `sendOrderPendingPush` POSTs to `api.push.apple.com` — **Apple tokens
  only**. There is no FCM sender in the codebase.
- **No Android toolchain on this machine** (checked 2026-07-26): `ANDROID_HOME` and
  `ANDROID_SDK_ROOT` unset, no JDK (`java -version` → "Unable to locate a Java Runtime",
  `/usr/libexec/java_home -V` likewise), no `/Applications/Android Studio.app`, no
  `~/Library/Android/sdk`. Any `cap add android` / `cap sync android` / Gradle step is
  blocked until a JDK + SDK are installed.
- `@capacitor/android` is already on disk at **8.4.1** as a transitive dependency of
  `@aparajita/capacitor-biometric-auth` — declaring it in `package.json` is a
  declaration, not an install.

---

## Work list

- [x] `capacitor.config.ts` — add an `android` block with the byte-identical
      `appendUserAgent: 'HatchGrabNativeApp'` marker + matching `backgroundColor`.
- [x] `app/api/orders/submit/route.ts` — platform-aware `van_devices` push-token query
      (Apple-compatible allowlist, so a future FCM token is never posted to APNs).
- [x] `package.json` — declare `@capacitor/android` at a version matching the other
      `@capacitor/*` packages.
- [ ] Install a JDK + Android SDK (or move the Android build to a machine/CI that has
      them) — blocks every `cap`/Gradle step.
- [ ] `npx cap add android` + first `cap sync android` — **blocked** on the above.
- [ ] FCM sender path (`lib/fcm.ts` or equivalent) + a `platform='android'` branch in the
      push fan-out — until this exists, the allowlist in `submit/route.ts` correctly
      excludes Android devices rather than silently killing their tokens.
- [ ] Android hardware-back handling for the customer checkout sheet and item modal
      (reference-manual §2083 notes it is not wired).

---

## Task log

### 2026-07-26 — Three web-safe Android groundwork changes

Scope was explicitly limited to declaration/safety only: no builds, no dev server, no
`cap` commands, no Gradle, no installs beyond the single declared dependency.

**1. `capacitor.config.ts:44-51` — added the `android` block** as a sibling of `ios`.
Contains `backgroundColor: '#1C1C1E'` (matching `ios.backgroundColor`) and
`appendUserAgent: 'HatchGrabNativeApp'`, byte-identical to `ios.appendUserAgent`
(line 42) because `proxy.ts:164` substring-matches it. Deliberately **omits** any
Android equivalent of `contentInset` / `scrollEnabled` — both are WKWebView-specific
with no Android counterpart. `ios`, `plugins`, and `server.*` untouched; `proxy.ts`
untouched.

**2. `app/api/orders/submit/route.ts:1074` — platform-aware push-token query.** Added
`.or('platform.eq.ios,platform.is.null')` to the existing `van_devices` chain
(`van_id` + `notify_enabled` + `push_token not null`).

- Written as an **allowlist**, not a denylist of `'android'`: only `ios` and NULL pass,
  so any future platform value is excluded by default until a sender exists for it.
- NULL is matched explicitly via `platform.is.null` — SQL/PostgREST comparison operators
  never match NULL, so a bare `.eq('platform','ios')` would have silently dropped legacy
  rows.
- **Why it matters:** an FCM token POSTed to APNs returns `BadDeviceToken`, and the
  `invalidTokens` cleanup immediately below (`update({ push_token: null })`) would then
  NULL that row's token — silently and permanently disabling push for that device.
- Behaviour today is identical: all 7 rows are `platform='ios'` and none has a token, so
  the block still short-circuits at `tokens.length`. The fire-and-forget try/catch, the
  van resolution, and the cleanup were not touched.

**3. `package.json:15` — declared `"@capacitor/android": "^8.3.4"`.** Matches the
declared ranges of `@capacitor/cli` / `core` / `ios` (all `^8.3.4`; the task brief cited
the resolved 8.4.0). `^8.3.4` satisfies the 8.4.1 already present in `node_modules`, so
no install was needed or run.

**Verification:** `npx tsc --noEmit` → exit 0, no output.

**Decisions taken:**
- Used the declared `^8.3.4` range rather than pinning `8.4.0`/`8.4.1`, to stay
  consistent with its sibling `@capacitor/*` entries.
- Dropped the line-number reference in the new code comment (`":1075"`) in favour of
  "just below", since the comment itself shifts the line numbers it cites.

**Corrections to the task brief (repaired, not silently fixed):** the brief arrived with
two typos — `"Do T add an Android equivalent…"` (read as **"Do NOT add"**, consistent
with the following clause) and `"would thell that token"` (read as **"would kill/NULL
that token"**, which is what the cleanup code does).

### 2026-07-26 — Protocol amendment (`.cursor/rules`)

Added **§27 Android workstream protocol** to `.cursor/rules` (inserted before §26
Closing note): reports go to `docs/android-report.md` and only a two-line summary goes
to chat, plus the three-file role table above.

**Flagged:** the brief said to "update item 3" of an existing Android protocol section.
**No such section existed.** `.cursor/rules` is a copy of the HatchGrab Engineering
Reference Manual V4 (26 numbered sections, unmodified since 24 June); repo-wide search
for `android-report`, `android.md`, and `Android protocol` returned zero hits, and there
is no `CLAUDE.md` or `.cursorrules`. The section was therefore **created**, containing
only the rules dictated in the brief — no surrounding items 1/2/4 were invented — and it
is labelled in-file as created rather than amended.

### 2026-07-26 — `.cursor/rules` de-duplicated against the manual

`.cursor/rules` held a whole copy of the Engineering Reference Manual **V4.0 (May 2026)**
— 842 lines, five versions behind the live `docs/reference-manual.md` **V9.1**. Audited
section by section: **every section was duplicated manual content**; the only genuinely
Cursor-specific content was the Android protocol added earlier the same day. Even §22
(Development process) and §24 (Testing and dev environment) were present in the manual
verbatim and richer, so keeping them would have *downgraded* the working rules.

Replaced §§1–26 + changelog with a short pointer section: `docs/reference-manual.md` V9.1
is the single source of truth; read it at the start of any non-trivial task; where code
and manual disagree the manual wins **unless demonstrably stale — then flag, never
silently follow the code**; and do not copy manual content back into the rules file.
867 lines → 46. The deleted V4 content is recoverable via `git show HEAD:.cursor/rules`.

Three fragments existed **only** in that V4 copy — recovered below rather than lost.

### 2026-07-26 — Android section renamed (heading only)

`.cursor/rules`: `## 27. Android workstream protocol` → **`## Android build protocol
(2026-07)`**. Body byte-identical. Reason: with §§1–26 gone the bare "27" was orphaned,
and it **collided with the manual's own §27 (Open backlog)** — which the manual
cross-references by number dozens of times.

---

## Recovered from .cursor/rules (pending fold into the manual)

Quoted verbatim from `git show HEAD:.cursor/rules`. These three fragments are covered
**nowhere** in `docs/reference-manual.md` V9.1. Dominic folds items into the manual by
hand — nothing here has been written into the manual.

### 1. KDS price-alignment recipe → belongs in manual §9 (KDS rules)

> ### Price alignment
>
> All prices in a card right-align to the same column edge:
> - `tabular-nums` on price spans — fixed-width digit glyphs prevent layout shift
> - `w-16 flex-shrink-0 text-right` on price column
> - `flex-1 min-w-0` on item name
>
> £1.50 and £12.00 must align at the decimal point. Modifier upcharges must align in the same column as base prices.

*(old `.cursor/rules` lines 408–415)*

**Where it belongs:** manual §9 → `## Card and price layout` (reference-manual.md:2239).

**Status: ADDITIVE — partially covered there already.** The manual has the principle in
one sentence at :2241 — *"Prices right-align with tabular-nums and a fixed-width price
column."* It does **not** carry the three class names, and `"must align at the decimal"`
has zero hits manual-wide. The value being recovered is the **testable acceptance
criterion** (£1.50 vs £12.00 aligning at the decimal point; modifier upcharges in the
same column as base prices) — "a fixed-width price column" cannot be checked, that can.

### 2. `next/image` remedy → belongs in manual §26 (Testing and dev environment)

> - Watch for `next/image` shadowing the global `Image` constructor — use `document.createElement('img')`.

*(old `.cursor/rules` line 801)*

**Where it belongs:** manual §26 → `## Contextual reminders` (reference-manual.md:3492),
specifically the existing bullet at :3532.

**Status: ADDITIVE — the warning is there but not the fix.** Manual :3532 reads *"Watch
for new Date('YYYY-MM-DD') UTC bugs and for next/image shadowing the global Image
constructor"* — it stops at the diagnosis. `createElement('img')` has zero hits
manual-wide. Five words restore the remedy.

### 3. Cook-screen Max-only rationale — ⚠️ SUSPECTED FALSE PROMISE, needs verification

> ### Cook screen — Max only
>
> The cook screen (`?view=cook`) is Max-only because:
> - A cook screen is only useful with two physical devices
> - Starter/Pro enforce one active KDS session — a second device kills the first
> - Max gets unlimited concurrent sessions
>
> Hide the Cook button from Pro even though it could technically work on one device — it would confuse operators.

*(old `.cursor/rules` lines 232–239)*

**NOT a preservation item. NO manual destination.** Unlike items 1 and 2, this is not
pending a fold into the manual — despite this section's heading — and no destination
section is proposed for it. It is recorded here as a claim to be **verified**, not as
content to be preserved.

**Status: ⚠️ SUSPECTED FALSE PROMISE — requires verification.**

The middle bullet — *"Starter/Pro enforce one active KDS session — a second device kills
the first"* — and its corollary *"Max gets unlimited concurrent sessions"* rest on
session-limit enforcement that was **likely never built**. Manual §27 (Open backlog)
:3911 reads:

> - Multi-device session enforcement (kds_sessions exists, logic pending).

So the **table exists** (`kds_sessions`, manual :2810) and the **plan matrix advertises**
multi-device kitchen sync as a Max differentiator (:1770), while the **enforcement logic
is listed as pending**. That is exactly the **V9.0 "guard's limit" lesson** (manual :51):

> **THE GUARD'S LIMIT — record this.** It binds **MARKETING to GATE, not either to
> REALITY.** `canAccess` true means "this plan is **ALLOWED**", **not** "this is
> **BUILT**". A gate-enabled but unimplemented feature **passes the guard and still ships
> a false promise.**

Same class as the Messenger/Instagram auto-reply stubs and Phase-A ticket printing caught
by hand in V9.0: **gate-enabled and advertised is not evidence of built.** Neither the
gate nor the guard would catch this — only reading the implementation would.

**NOT investigated — deliberately, per instruction.** No code was read to confirm or
refute it in this task.

**ACTION REQUIRED BEFORE any Max truck runs two screens:** verify whether single-session
enforcement actually exists — i.e. whether a second device really does kill the first on
Starter/Pro, and whether Max genuinely gets unlimited concurrent sessions.

---

## Task log (continued)

### 2026-07-26 — `npx cap add android` scaffolded; four verifications + notification audit

Scaffolding was run by the operator (not by me — `cap` commands are forbidden in my
tasks). `android/` now exists. All findings below are **read-only**; nothing was edited.

**1. UA marker SURVIVED — first boot will not hit the V8.7 login loop.**
`android/app/src/main/assets/capacitor.config.json:17` carries
`"appendUserAgent": "HatchGrabNativeApp"` inside the `android` block, byte-identical to
the iOS value at `:13`. This is the string `proxy.ts:164` substring-matches to bypass the
cookie auth guard. The generated JSON also correctly omits `contentInset`/`scrollEnabled`
from the android block, and carries `server.url = https://www.hatchgrab.com/app`,
`cleartext: false`.

**2. SDK values are exactly as expected for Capacitor 8.** `android/variables.gradle:2-4`
— `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`. No mismatch.
(Also: AGP 8.13.0, Java 21 source/target, cordova-android 14.0.1.)

**3. Generated manifest is minimal.** `android/app/src/main/AndroidManifest.xml` declares
exactly one permission (`INTERNET`, :40), one `<activity>` (`.MainActivity`, :12–25,
`singleTask`, LAUNCHER), one `<provider>` (`FileProvider`, :27–35), and **zero
`<service>` / `<receiver>` entries**. `POST_NOTIFICATIONS` is **not** in this file — but
see finding 5: it arrives by manifest merging.

**4. Firebase hazard — the build will NOT fail; the guard is already there.**
`android/app/build.gradle:47-54` wraps plugin application in a try/catch:

> ```
> try {
>     def servicesJSON = file('google-services.json')
>     if (servicesJSON.text) {
>         apply plugin: 'com.google.gms.google-services'
>     }
> } catch(Exception e) {
>     logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
> }
> ```

The `com.google.gms:google-services:4.4.4` classpath at `android/build.gradle:11` is only
a buildscript dependency — declaring it downloads the artifact, it does not apply it.
`@capacitor/push-notifications` DOES pull `com.google.firebase:firebase-messaging:25.0.1`
unconditionally (`node_modules/@capacitor/push-notifications/android/build.gradle:77`),
and its library manifest registers a `MessagingService` for
`com.google.firebase.MESSAGING_EVENT`. So Firebase code ships in the APK; only the
config is absent.

`registerForPush()` (`lib/native/push.ts:15-41`) wraps its **entire** body — the dynamic
import, `requestPermissions()`, the three `addListener` calls, and `register()` — in one
try/catch that `console.warn`s and swallows (`:38-40`). Its three call sites
(`components/native/OperatorDeviceConfig.tsx:43, :49, :69`) all invoke it as
`void registerForPush(token)` — fire-and-forget, never awaited, no call-site try/catch.
That is safe **only because** of the internal catch: the returned promise resolves rather
than rejects, so a `void`-ed call cannot produce an unhandled rejection and a throw cannot
reach the React render or effect.

**Assessment (Android first launch, no Firebase config): silent no-op, logged.** Not a
build failure (the gradle guard), not a runtime throw that reaches React (the internal
catch). `PushNotifications.register()` fails → caught → `console.warn('[push] register
failed: …')` → no token → `van_devices.push_token` stays null → the APNs allowlist added
earlier this month (`app/api/orders/submit/route.ts:1074`) would exclude the row anyway.
*Verified from code: the gradle guard, the firebase-messaging dependency, the internal
try/catch, all three call sites. Inferred (Android platform behaviour, unverifiable
without a build): that the build actually completes, and that a missing `google_app_id`
resource makes FirebaseApp init fail non-fatally rather than crashing the process.*

**5. POST_NOTIFICATIONS reaches the merged manifest — by MERGING, not absence.**
`node_modules/@capacitor/local-notifications/android/src/main/AndroidManifest.xml`
declares `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, and `WAKE_LOCK`, plus three
receivers (`TimedNotificationPublisher`, `NotificationDismissReceiver`,
`LocalNotificationRestoreReceiver`). `@capacitor/push-notifications`'s manifest declares
**no** permission — only the `MessagingService`. So the *declaration* is covered by the
local-notifications plugin. **The runtime grant is a separate problem — see below.**

---

## ⚠️ Local notifications on Android 13+ — the lying-toggle exposure

Push is deferred and inert. **Local notifications are live**, and they are the bigger
exposure. Findings, all read-only:

### Where local notifications are actually fired

| Helper | `lib/native/notifications.ts` | Called from | Trigger |
| --- | --- | --- | --- |
| `notifyLocal` | :30-38 | **`lib/native/useOfflineAlert.ts:35`** — the only caller | Device goes offline, confirmed by reachability, **debounced 8s** (`OFFLINE_ALERT_DELAY_MS`), **once per offline episode**. Copy depends on auto-pause: *"Ordering paused"* / *"You're offline"*. Hook mounted at `app/dashboard/[token]/page.tsx:623`. |
| `playNewOrderAlert` | :48-56 | **nowhere** | Dead code. |
| `notifyNewOrder` | :58-76 | **nowhere** | Dead code. (Note it is the *only* helper that calls `requestPermissions()` before scheduling — and it is never called.) |

So: **exactly one live local notification — the offline/paused alert.** New-order alerting
on native is the deferred server push, not a local notification.

### Does anything request or check POST_NOTIFICATIONS?

- **Requests:** yes, twice. `requestNotificationPermission()`
  (`lib/native/notifications.ts:17-27`, wraps `LocalNotifications.requestPermissions()`)
  is called from **`components/native/NotificationSettings.tsx:44`** (master toggle, result
  respected) and from **`app/dashboard/[token]/kds/page.tsx:253-255`** —
  `useEffect(() => { requestNotificationPermission() }, [])`, fire-and-forget, **result
  discarded**.
- **Checks:** **NEVER.** `checkPermissions` appears **nowhere in the repo** (grep across
  all `.ts`/`.tsx` outside `node_modules`: zero hits). Nothing ever re-validates the grant
  after the initial request.

### The lying toggle — CONFIRMED, and it is the wake-lock class

`NotificationSettings.tsx` derives the master toggle's state **purely from
`Preferences`**, never from the OS:

- Mount (`:23-34`) reads `hg_notify_master` and does `setMaster(m === 'true')`. No
  permission check.
- `toggleMaster(true)` (`:38-53`) requests the OS permission and — correctly — refuses to
  flip on if denied, leaving the toggle OFF with an amber notice (`:45-50`).

**The gap is what happens afterwards.** Once granted and persisted, if the operator later
revokes notifications in OS Settings, **the toggle still renders ON** on next open, and
the "Offline / paused alerts" sub-toggle still renders ON **with the green "Works offline"
promise** (`:88`). Nothing detects the revocation. Same failure class as the V8.9 wake-lock
toggle and "will sync": *a control asserting a guarantee it is not delivering.*

The offline path believes the same stale pref — `offlineAlertsEnabled()`
(`notifications.ts:41-46`) reads only `hg_notify_master` and `hg_notify_offline`, never
the OS state — so it returns `true` and calls `notifyLocal()`, which calls
`LocalNotifications.schedule()` inside a try/catch (`:32-37`).

**Assessment (Android 13+, permission denied or revoked): the alert SILENTLY FAILS.**
Not a throw. `schedule()` succeeds at the plugin layer; the OS drops the notification
because POST_NOTIFICATIONS is not granted. The `catch` never fires, nothing is logged, the
toggle keeps reading ON, and the operator's device goes offline with **no alert** — which
on a KDS means orders stop arriving invisibly, which is the exact failure the alert
exists to prevent.
*Verified from code: no `checkPermissions` anywhere; `offlineAlertsEnabled` reads prefs
only; master pref never re-validated; `schedule()` wrapped in try/catch; the green "Works
offline" copy. Inferred (Android platform behaviour): that a denied POST_NOTIFICATIONS
makes the post a silent no-op rather than throwing — standard `NotificationManager.notify()`
behaviour, but not verifiable here without a device.*

### A second, quieter divergence

`kds/page.tsx:254` fires the OS permission prompt on **every KDS mount** and throws the
answer away. On Android 13+ that means the operator may be prompted at the KDS, **grant**
it, and still find the Settings master toggle reading **OFF** (because `hg_notify_master`
was never written) — so `offlineAlertsEnabled()` returns false and the offline alert stays
disabled despite the OS permission being granted. The two states can diverge in **both**
directions.

Also note the default: `hg_notify_master` is unset out of the box → master is **OFF** →
**offline alerts do not fire at all until the operator finds and enables the toggle.**

### PROPOSED FIX — not implemented, do not apply without a decision

1. **Add `checkNotificationPermission()`** to `lib/native/notifications.ts`, wrapping
   `LocalNotifications.checkPermissions()` (returns `display: 'granted' | 'denied' |
   'prompt'`) with the same try/catch + `isNativePlatform` guard as its siblings.
2. **Make the toggle tell the truth.** In `NotificationSettings.tsx`'s mount effect, gate
   the rendered state on **both** sources: `setMaster(pref === 'true' && display ===
   'granted')`. When the pref says on but the OS says denied, render the toggle OFF and
   surface the existing amber notice — reuse the `:48` string, which already says exactly
   the right thing.
3. **Make the firing path agree.** `offlineAlertsEnabled()` should consult
   `checkNotificationPermission()` too, so the offline alert never believes a stale pref.
   (Cheap: it already awaits two Preferences reads.)
4. **Resolve the KDS divergence.** Either persist the result at `kds/page.tsx:254`
   (`if (granted) Preferences.set(hg_notify_master, 'true')`) or drop the call entirely and
   let Settings own the request. Right now it prompts and discards, which is the worst of
   both.
5. **Consider deleting the dead helpers** `playNewOrderAlert` and `notifyNewOrder` — or
   wiring them, if native new-order alerting was meant to be local rather than push.

Item 2 is the one that matters: **a toggle that reads ON while the OS is denying is worse
than no toggle**, because it converts a fixable permission problem into an invisible one.

---

### 2026-07-27 — Android push CRASH fixed (platform guard); the FCM prediction was wrong

**THE CRASH.** Confirmed from logcat, reproduced twice (PIDs 8344, 8584):

```
java.lang.IllegalStateException: Default FirebaseApp is not initialized
  at FirebaseMessaging.getInstance
  at PushNotificationsPlugin.register(PushNotificationsPlugin.java:103)
```

**The app process dies.** Not a caught warning — a hard crash on first launch, on the
"already configured" path (`OperatorDeviceConfig.tsx:43`) and on both bind paths.

**MY PREVIOUS ASSESSMENT WAS WRONG — correcting it here.** On 26 July I assessed this as
*"silent no-op, logged — not a build failure, not a runtime throw that reaches React"*,
reasoning that `registerForPush`'s internal try/catch (`lib/native/push.ts:17-40`) wrapped
`register()`. The try/catch is real and does wrap it. **It does not help.** The throw is
**native**, raised inside `PushNotificationsPlugin.register()` on the Java side, **before
control returns to JS** — so there is no JS frame to unwind into and no promise to reject.
A JS `catch` can only catch what the bridge hands back as a rejection. I marked the
runtime behaviour as *inferred* rather than verified, which was the right label, but the
inference itself was wrong: I reasoned about the JS layer and treated the native layer as
if it obeyed JS semantics.

**THE FIX (BUILT).** `lib/native/push.ts:17-27` — an early return for Android, placed
immediately after the existing `isNativePlatform()` guard and before the `try`:

```ts
if ((Capacitor?.getPlatform?.() ?? 'web') === 'android') {
  console.warn('[push] skipped: push notifications are not yet configured on Android (no Firebase project / google-services.json)')
  return
}
```

Uses the repo's existing platform idiom (`Capacitor?.getPlatform?.() ?? 'web'`, as at
`lib/native/device.ts:69`). A seven-line comment above it records why it must be
*prevented* rather than *handled*, and that **the platforms are not symmetric**: iOS is
safe only because an unconfigured APNs sender no-ops (registration simply never yields a
token), whereas FCM hard-fails.

**iOS and web are byte-identical to before** — web still returns at :16, iOS falls through
the new `if` unchanged into the untouched `try`. The three call sites in
`OperatorDeviceConfig.tsx` were NOT touched. No `google-services.json` was added.
`npx tsc --noEmit` → exit 0, no output.

---

## ⚠️ NEW CROSS-CUTTING INVARIANT — candidate for manual §35

> **On Android, a JS try/catch around a Capacitor plugin call does not protect against a
> native throw inside that plugin. Guard at the call site by platform; do not rely on
> catching it.**

**Home:** manual **§35 "Cross-cutting engineering invariants"** (reference-manual.md:4327)
— created in V9.1 for exactly this kind of lesson, one that belongs to no single
subsystem. It sits naturally beside the existing entries *"wiring is not data flow"* and
*"a flag named for a behaviour is not proof of that behaviour"*: all three are cases where
a structure that **looks** protective is verified at the wrong layer.

**Why it generalises beyond push:** every `lib/native/*` helper in this repo follows the
same shape — dynamic-import the plugin inside a `try`, `console.warn` in the `catch`, and
treat that as safe. That pattern is genuinely sufficient for *JS-side* failures (a missing
plugin, a rejected permission) and gives **no protection whatever** against a native throw.
The audit question for each is not "is it wrapped?" but "can this plugin throw natively on
this platform, and is it configured?"

Not folded into the manual — Dominic folds by hand.

---

## ⚠️ Android notification UI after the guard — the lying toggle, now GUARANTEED false

Reported, not fixed, per instruction.

**`components/native/OperatorDeviceConfig.tsx` — unchanged, and that is correct.**
`registerForPush()` is `void`-ed at :43, :49 and :69; its result is never awaited, stored,
or rendered. With the guard it returns immediately instead of crashing, so the setup card
behaves exactly as on iOS: bind the van, close, no visible difference. It never mentioned
push, so it tells no lie — but it also gives the operator no signal that push is off.

**`components/native/NotificationSettings.tsx:80-83` — "New order alerts" is now a
guaranteed-false control on Android.** Toggling it:

1. sets local state and persists `hg_notify_neworder` (:56),
2. POSTs `notify_enabled: true` to `/api/native/bind-device` (:59),
3. renders **ON**, under the copy *"Get notified when a customer order needs confirming."*

Meanwhile **no notification can ever arrive on Android**, for two independent reasons:

- `registerForPush()` now returns before the `registration` listener is added, so
  `van_devices.push_token` is never written and stays NULL; and
- the server's push query (`app/api/orders/submit/route.ts:1074`) filters
  `.not('push_token','is',null)` **and** `.or('platform.eq.ios,platform.is.null')` — and
  the Android row's `platform` is `'android'` (written by `device.ts:69`), so it is
  excluded twice over.

This is sharper than the staleness bug reported on 26 July. That one was *conditionally*
false (true until the operator revokes the OS permission). **This one is unconditionally
false on Android** — the toggle asserts a guarantee that is structurally impossible to
deliver, and writes `notify_enabled: true` to the server on top. Same class as the
wake-lock toggle (V8.9) and "will sync": **a control must say what is TRUE.**

**Important distinction — do NOT disable the whole card.** The *other* two controls are
honest on Android:

- **Master "Allow notifications"** — governs the OS permission, which Android needs
  (POST_NOTIFICATIONS). Real.
- **"Offline / paused alerts"** — a LOCAL notification via `@capacitor/local-notifications`,
  which needs **no Firebase**. It genuinely works on Android, subject only to the separate
  permission-staleness bug above.

So the honest state is **per-control**, not per-platform.

### PROPOSED HONEST-STATE FIX — not implemented

1. **Export one source of truth** from `lib/native/push.ts` — e.g.
   `export function isPushSupported() { return Capacitor.isNativePlatform() && (Capacitor?.getPlatform?.() ?? 'web') !== 'android' }`
   — and have **both** the guard and the UI read it, so the register path and the toggle
   can never drift apart. (Drift between a gate and its UI is what produced this.)
2. **Render "New order alerts" as unavailable on Android** — toggle `disabled`, visually
   off, with the subtitle replaced by *"Not available on Android yet."* Prefer disabled +
   explanation over hiding: hiding reads as "this feature does not exist", disabled reads
   as "not yet", which is the truth.
3. **Do not write `notify_enabled: true` from an Android device** — skip the
   `/api/native/bind-device` POST at :59 when unsupported, so the server never holds rows
   claiming to want a push they cannot receive.
4. **Leave "Offline / paused alerts" fully enabled** — it works, and weakening it would
   trade one lie for another.
5. Optionally surface a one-line amber notice reusing the existing pattern at :72-74.

**Sequencing note:** this and the 26 July permission-staleness fix touch the same
component and the same mount effect. Doing them together is one coherent "make the
notification card tell the truth" change; doing them separately risks the second rewriting
the first.
