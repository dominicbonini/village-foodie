# Task report — Android push crash guarded · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only).
`docs/last-report.md` belongs to a separate workstream — not read, not written, not opened.

---

## 0. Prompt integrity — two garbled spots, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| item 1: *"stating push is not yet configured on **Andr**\n**iOS** and web paths must be BYTE-IDENTICAL to now"* | *"…not yet configured on **Android**."* + a new sentence *"**iOS** and web paths must be BYTE-IDENTICAL to now"* | A word truncated at a line break, with the next sentence starting mid-line. Two separate requirements ran together: the warning's content, and the iOS/web constraint. Both were honoured — the warning names Android, and iOS/web are untouched. |
| item 5: *"**APPENocs/android.md**"* | *"**APPEND to docs/android.md**"* | Characters dropped mid-token; matches the same instruction in the previous four prompts. |

Neither repair changed what I did. Nothing else was garbled.

---

## 1. THE CORRECTION — my 26 July assessment was wrong

Yesterday I assessed this exact scenario as **"silent no-op, logged — not a build failure,
not a runtime throw that reaches React"**. The logcat says the process dies. I was wrong,
and the reason matters more than the fact.

My reasoning was: `registerForPush()` wraps its entire body — including `register()` — in
one try/catch (`lib/native/push.ts:17-40`), therefore nothing escapes. **The wrapper is
real; it just protects the wrong layer.** The throw is raised **natively**, inside
`PushNotificationsPlugin.register()` (Java, line 103), *before control returns to JS*.
There is no JS frame to unwind into and no promise to reject, so there is nothing for a JS
`catch` to catch. I reasoned about the JS layer and silently assumed the native layer
obeyed JS semantics.

I did label the runtime behaviour as **inferred, not verified**, and said it needed a
device. That label was correct and is why this was catchable — but a correctly-labelled
wrong inference still shipped a wrong conclusion into the log, so I have recorded the
correction in `docs/android.md` next to the original rather than leaving the two to be
reconciled later.

---

## 2. Change 1 — the Android guard · `lib/native/push.ts:17-27`

Inserted immediately after the existing `isNativePlatform()` check (:16) and **before**
the `try` (now :28):

```ts
  // ANDROID GUARD — must be PREVENTED here, not handled below. @capacitor/push-notifications is FCM-backed
  // on Android: with no google-services.json, PushNotificationsPlugin.register() (line 103) calls
  // FirebaseMessaging.getInstance() and throws IllegalStateException "Default FirebaseApp is not initialized"
  // NATIVELY, inside the bridge, before control ever returns to JS — so the try/catch below CANNOT catch it
  // and the app PROCESS DIES (confirmed in logcat, reproduced twice). THE PLATFORMS ARE NOT SYMMETRIC: iOS is
  // safe only because an unconfigured APNs sender no-ops (registration just never yields a token), whereas FCM
  // hard-fails. Remove this guard only once a Firebase project + google-services.json exist.
  if ((Capacitor?.getPlatform?.() ?? 'web') === 'android') {
    console.warn('[push] skipped: push notifications are not yet configured on Android (no Firebase project / google-services.json)')
    return
  }
```

**Platform idiom:** `Capacitor?.getPlatform?.() ?? 'web'` — copied from
`lib/native/device.ts:69`, the existing usage you pointed at, rather than a bare
`Capacitor.getPlatform()`. The optional chaining matches the surrounding code and is
harmless.

**Change 2 (the inline "why") is the comment above** — it states that a JS try/catch
cannot catch a native throw from a Capacitor plugin so this must be prevented at the call
rather than handled, and that iOS is safe only because an unconfigured APNs sender no-ops
while FCM hard-fails, i.e. the platforms are **not** symmetric.

### iOS and web are byte-identical — how that is guaranteed

- **Web** returns at :16 as before; it never reaches the new `if`.
- **iOS** evaluates `getPlatform() === 'android'` → false, falls through, and enters the
  **unmodified** `try` block. Every line from :28 onward is untouched: the dynamic import,
  `requestPermissions()`, the three `addListener` registrations, `register()`, and the
  catch.
- The function was **not restructured** — the guard is a pure insertion between two
  existing statements. No existing line was edited, reordered, or reindented.

### Verification

`npx tsc --noEmit` → **exit 0, zero lines of output.** Clean.

That is the only verification available here: gradle, builds, `cap`, dev servers, `adb`
and installs are all forbidden, so **the crash fix itself is not device-verified by me**.
The next Android launch is the real test — expect the `[push] skipped: …` warning in
logcat and no `IllegalStateException`.

---

## 3. Change 3 — nothing else touched, as instructed

- `components/native/OperatorDeviceConfig.tsx` — **not modified.** All three call sites
  (:43, :49, :69) are exactly as they were.
- **No `google-services.json`**, no Firebase project, no gradle change, no manifest change.
- No other source file was modified.

---

## 4. Step 4 — what the Android UI shows now (reported, NOT fixed)

### 4.1 `OperatorDeviceConfig.tsx` — unchanged, and correctly so

`registerForPush()` is `void`-ed at all three sites; its result is never awaited, stored,
or rendered, and nothing in the component's JSX depends on it. With the guard it returns
immediately instead of crashing, so the setup card behaves exactly as on iOS: bind the
van, close the card, no visible difference. **It tells no lie** — it never mentioned push —
**but it gives no signal either**, which is fine for a setup card and is not the problem.

### 4.2 `NotificationSettings.tsx` — YES. "New order alerts" is now guaranteed-false on Android

The toggle at **:80-83**, under the copy *"Get notified when a customer order needs
confirming."*, still turns on. Toggling it (`toggleNewOrder`, :55-60):

1. sets local state and persists `hg_notify_neworder` (:56),
2. **POSTs `notify_enabled: true`** to `/api/native/bind-device` (:59),
3. renders **ON**.

And on Android **no notification can ever arrive**, for two independent reasons:

- The guard returns before the `registration` listener is added, so
  `van_devices.push_token` is never written — it stays NULL.
- The server's push query (`app/api/orders/submit/route.ts:1074`) filters
  `.not('push_token','is',null)` **and** `.or('platform.eq.ios,platform.is.null')`; the
  Android row's `platform` is `'android'` (written by `device.ts:69`), so it is excluded
  **twice over** — by the null token and by the platform allowlist I added on 26 July.

**This is worse than the staleness bug I reported yesterday.** That one is *conditionally*
false — true until the operator revokes the OS permission. This one is **unconditionally
false on Android**: the control asserts a guarantee that is structurally impossible to
deliver, and writes `notify_enabled: true` to the server on top of it. Same class as the
wake-lock toggle (V8.9) and "will sync" — **a control must say what is TRUE.**

### 4.3 The distinction that matters: do NOT disable the whole card

The other two controls are **honest on Android** and must stay working:

| Control | Android reality |
| --- | --- |
| Master "Allow notifications" (:69) | **Real** — governs the OS POST_NOTIFICATIONS grant, which Android 13+ genuinely requires. |
| "Offline / paused alerts" (:85-91) | **Real** — a LOCAL notification via `@capacitor/local-notifications`, which needs **no Firebase**. Works on Android, subject only to the separate staleness bug. |
| "New order alerts" (:80-83) | **Impossible** — FCM-backed, deferred. |

The honest state is **per-control, not per-platform**.

### 4.4 Proposed honest-state fix — implemented nothing

1. **One source of truth.** Export from `lib/native/push.ts`:
   `export function isPushSupported() { return Capacitor.isNativePlatform() && (Capacitor?.getPlatform?.() ?? 'web') !== 'android' }`
   and have **both** the guard and the UI read it — so the register path and the toggle
   cannot drift apart. Drift between a gate and its UI is exactly what produced this.
2. **Render "New order alerts" as unavailable on Android** — `disabled`, visually off,
   subtitle replaced with *"Not available on Android yet."* Prefer **disabled + explanation
   over hiding**: hiding reads as "this feature does not exist"; disabled reads as "not
   yet", which is the truth.
3. **Do not POST `notify_enabled: true` from an Android device** (:59) when unsupported, so
   the server never holds rows claiming to want a push they cannot receive.
4. **Leave "Offline / paused alerts" fully enabled** — weakening it would trade one lie for
   another.
5. Optionally reuse the existing amber-notice pattern (:72-74) for a one-line explanation.

**Sequencing:** this and the 26 July permission-staleness fix touch the same component and
the same mount effect. They should be done **together** as one "make the notification card
tell the truth" change; done separately, the second will rewrite the first.

---

## 5. Step 5 — appended to `docs/android.md` (404 → 541 lines, nothing overwritten)

New entry `### 2026-07-27 — Android push CRASH fixed (platform guard); the FCM prediction
was wrong`, containing: the logcat trace and both PIDs; the explicit correction of my
26 July assessment and *why* the inference failed; the guard as built with its file and
line numbers; the iOS/web byte-identical statement; and the tsc result.

Then two flagged sections:

**⚠️ NEW CROSS-CUTTING INVARIANT — candidate for manual §35**

> On Android, a JS try/catch around a Capacitor plugin call does not protect against a
> native throw inside that plugin. Guard at the call site by platform; do not rely on
> catching it.

Recorded verbatim as dictated. **§35 is the right home and it exists** — manual
**§35 "Cross-cutting engineering invariants"** at `docs/reference-manual.md:4327`, created
in V9.1 precisely for lessons belonging to no single subsystem. I noted in the log that it
sits naturally beside the existing §35 entries *"wiring is not data flow"* and *"a flag
named for a behaviour is not proof of that behaviour"* — all three are cases where a
structure that **looks** protective was verified at the wrong layer.

I also recorded **why it generalises**: every `lib/native/*` helper in this repo uses the
same shape — dynamic-import inside a `try`, `console.warn` in the `catch` — which is
genuinely sufficient for JS-side failures and gives **no protection at all** against a
native throw. The audit question for each is not "is it wrapped?" but "can this plugin
throw natively on this platform, and is it configured?"

**⚠️ Android notification UI after the guard** — §4 above, recorded in full.

`docs/reference-manual.md` was **not** edited; Dominic folds by hand.

---

## 6. Flagged

- **The fix is tsc-verified, not device-verified.** I cannot launch Android here. Per the
  manual's own rule ("tsc-clean / simulated-pass" ≠ "works"), treat this as BUILT,
  LIVE-TEST PENDING until an Android launch shows the warning and no crash.
- **The guard is a deferral, not a solution.** It makes Android launch safely with push
  silently absent. Whoever adds a Firebase project must remove this guard — the comment
  says so explicitly, in the one place someone configuring FCM will be looking.
- **`isPushSupported()` does not exist yet**, so the platform condition is currently
  written in exactly one place (the guard) and the UI does not consult it. That is fine
  today and becomes drift the moment the UI fix lands — hence proposal 1.
- **Two open lying-toggle items now exist** on the same component: yesterday's
  permission-staleness bug and today's guaranteed-false "New order alerts". Both are
  unimplemented, and they should be fixed in one pass.
- **`docs/android.md` and `android/` are both still untracked in git.** The log is now 541
  lines of findings with no version history behind it.

---

## 7. What I could not do / did not do

- **Did not device-verify the crash fix** — no gradle, builds, `cap`, dev servers, `adb`,
  or installs, all forbidden. `npx tsc --noEmit` (exit 0) is the only check available.
- **Did not implement the honest-state fix** — proposed and stopped, as instructed.
- **Did not touch** the three `OperatorDeviceConfig.tsx` call sites, and added no
  `google-services.json` or Firebase config.
- **Did not edit `docs/reference-manual.md`** — the §35 invariant is flagged as a candidate
  in `docs/android.md` only.
- **Did not investigate the cook-screen session claim** — still parked, still needing
  verification before any Max truck runs two screens.
- **Did not touch `docs/last-report.md`** — not read, not written, not opened. Unchanged at
  10,981 bytes, mtime 2026-07-26 09:20.
