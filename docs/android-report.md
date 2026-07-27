# Task report — Android push guard removed; token path traced · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only).
`docs/last-report.md` belongs to a separate workstream — not read, not written, not opened.

---

## 0. Prompt integrity — two garbled spots, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| item 2: *"if google-services.json is ever **missisconfigured**"* | *"ever **missing or misconfigured**"* | Two words collapsed into one; both failure modes are addressed in §2. |
| item 5: *"showing device_id, platform, push_token presence, **notify_elast_seen**"* | *"**notify_enabled, last_seen**"* | Two column names collapsed; both exist on `van_devices` (migration `20260701_van_devices.sql`) and both are in the SQL at §5. |

Neither changed the work.

---

## 1. Change — the Android early-return is gone · `lib/native/push.ts`

**Removed** (was `:24-27`):

```ts
if ((Capacitor?.getPlatform?.() ?? 'web') === 'android') {
  console.warn('[push] skipped: push notifications are not yet configured on Android (no Firebase project / google-services.json)')
  return
}
```

**Everything else is untouched.** The function still opens with
`if (!Capacitor.isNativePlatform()) return` (`:16`), the `try` block (`:36-56`) is unchanged
line for line — dynamic import, `requestPermissions()`, the three `addListener` calls,
`register()` — and the `catch` (`:57-59`) is unchanged.

**iOS and web byte-identical:**

- **Web** returns at `:16`, exactly as before; it never reached the removed branch.
- **iOS** evaluated the removed `if` to `false` and fell through. Deleting a branch iOS never
  entered cannot change iOS behaviour.

`Capacitor` is still imported and used at `:16`, so no unused-import fallout.

**`npx tsc --noEmit` → exit 0, zero output.**

---

## 2. Keeping the crash impossible — stated honestly

**There is no way to catch a native throw from JS. I am not claiming protection I cannot
demonstrate.**

The crash was `IllegalStateException "Default FirebaseApp is not initialized"` raised inside
`PushNotificationsPlugin.register()` (`PushNotificationsPlugin.java:103`) on the Java side,
**before control returns to the bridge**. There is no JS frame to unwind into and no promise
to reject, so `registerForPush`'s try/catch never runs and the process dies. That was true
when I added the guard and it is true now. **Nothing I could add to `push.ts` would change
it** — a `catch` there is not a safety net for this class of failure, and adding one would
create a false impression that it is.

**So the crash is not defended against — it is made not to arise**, by a build-time property
I verified rather than assumed:

| Precondition | Verified value |
| --- | --- |
| `android/app/google-services.json` exists | **Yes** — 721 bytes, 2026-07-27 14:27 |
| `project_id` | `hatchgrab` |
| `package_name` in the file | **`com.hatchgrab.app`** |
| `capacitor.config.ts` `appId` | `com.hatchgrab.app` ✅ match |
| `android/app/build.gradle` `applicationId` + `namespace` | `com.hatchgrab.app` ✅ match |
| `mobilesdk_app_id` | `1:176175981602:android:9627a32859cd501269567b` (present) |
| `api_key` entries | 1 (present) |

**Why the package match is the load-bearing fact:** `android/app/build.gradle:47-54` applies
the google-services Gradle plugin **only when the file exists**; the plugin generates the
`google_app_id` string resource that `FirebaseApp` auto-initialises from at process start.
No file, or a file whose `package_name` does not match `applicationId`, and that resource is
absent or wrong → `FirebaseApp` never initialises → `getInstance()` throws → the original
crash.

**What genuinely protects it, in order:**

1. **Keep `google-services.json` committed** — a build machine without it produces an APK
   that crashes at first launch, and the Gradle guard makes that *silent* (it logs
   "google-services.json not found … Push Notifications won't work" and builds anyway).
2. **Keep `applicationId` == `package_name`.** If either moves, both must.
3. **Treat first-launch-after-any-Firebase-or-applicationId-change as a smoke test**, since
   this failure is immediate and total rather than subtle.

**What does NOT protect it:** the `try/catch` in `push.ts`; a JS-side "is Firebase
configured?" probe (there is no JS API that reports native FirebaseApp state before
`register()` is called — and any probe that called into the plugin would itself risk the
throw). **Accepting the residual risk with the reason recorded is the honest answer**, and
that is what the inline comment now does.

---

## 3. The invariant comment — retained and strengthened · `push.ts:17-35`

Kept, as instructed, and updated so it is accurate post-removal rather than describing a
guard that no longer exists:

> ⚠️ **INVARIANT (still true, do not delete): A JS try/catch CANNOT protect against a NATIVE
> throw from a Capacitor plugin.** … the throw happens INSIDE THE BRIDGE, before control
> returns to JS — so the catch below never runs and the app PROCESS DIES (confirmed in
> logcat 2026-07-27, reproduced twice, PIDs 8344/8584). THE PLATFORMS ARE NOT SYMMETRIC: iOS
> is safe because an unconfigured APNs sender merely no-ops; FCM hard-fails.
>
> The temporary Android early-return that stood here was REMOVED on 2026-07-27 once Firebase
> was configured … That match is the actual precondition …
>
> ⚠️ **THERE IS NO JS-SIDE PROTECTION FOR THIS. It is not defended; it is made not-arise.**
> If google-services.json is deleted, replaced with another project's file, or the
> applicationId changes, the crash returns at first launch and NOTHING in this file can stop
> it. Guard it at BUILD time … never by adding a catch here.

---

## 4. REPORTED, not fixed — the token write chain

### 4.1 Where the token is written — the full chain, quoted

**Step 1 — the registration listener** (`lib/native/push.ts:43-45`):

```ts
// APNs token → persist to this device's row so the server push path can target it.
PushNotifications.addListener('registration', (t: { value: string }) => {
  void saveDeviceConfig(token, { push_token: t.value })
})
```

*(The comment says "APNs token"; on Android the same listener delivers the **FCM** token.
Cosmetic staleness only — the mechanism is platform-agnostic. Not fixed: out of scope.)*

**Step 2 — the client helper** (`lib/native/device.ts:66-71`):

```ts
const res = await fetch('/api/native/bind-device', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
})
```

**Step 3 — the server upsert** (`app/api/native/bind-device/route.ts:80-88`):

```ts
// Upsert by device_id (unique). Only patch provided fields; always refresh truck_id + last_seen.
const patch: Record<string, unknown> = { truck_id: truck.id, device_id, last_seen: new Date().toISOString() }
if (van_id !== undefined) patch.van_id = van_id
if (default_screen !== undefined) patch.default_screen = default_screen
if (notify_enabled !== undefined) patch.notify_enabled = !!notify_enabled
if (push_token !== undefined) patch.push_token = push_token
if (platform !== undefined) patch.platform = platform

const { data, error } = await supabaseAdmin
  .from('van_devices').upsert(patch, { onConflict: 'device_id' }).select('*').single()
```

→ **`van_devices.push_token`**, keyed on the `UNIQUE` `device_id`.

### 4.2 Is `platform` written on the same path? **Yes — always, and it will be `'android'`.**

`platform` is not part of the caller's `patch`; it is set unconditionally in
`saveDeviceConfig`'s body (`device.ts:69`) on **every** call, so any save — token, van bind,
screen change, notify toggle — refreshes it. It is spread *before* `...patch`, and no caller
passes `platform`, so it is never overridden.

`Capacitor.getPlatform()` returns **`'android'`** in the Android WebView, so the row will
carry `platform = 'android'` from the very first save. (Verified from the code path; the
returned string itself is Capacitor's documented contract, and is the same call already used
to gate the guard I just removed.)

**Note the ordering consequence:** `registerForPush` fires only after the device is bound
(`OperatorDeviceConfig.tsx:43,49,69`), so the row usually already exists with
`platform='android'` before the token arrives; the token save then patches it.

### 4.3 Would anything overwrite or null a valid token on a later launch? **Only one place.**

I grepped every `push_token` write in the repo. Results:

| Site | Effect on a valid token |
| --- | --- |
| `bind-device:83` — `if (push_token !== undefined) patch.push_token = push_token` | **Safe.** Partial patch: a later `saveDeviceConfig(token, { van_id })` omits the key → `undefined` → the column is not in the upsert payload → existing value preserved. |
| `switch-truck` | **Safe by omission** — it writes no `push_token` at all; its header comment states the token "CARRIES OVER to the new truck/van". |
| `push.ts:44` | Writes a **fresh** token; overwriting an old token with a new one is correct (FCM/APNs rotate tokens). |
| **`app/api/orders/submit/route.ts:1082`** | **The only nulling path**: `update({ push_token: null }).in('push_token', res.invalidTokens)` after a provider `BadDeviceToken`/`Unregistered`. Correct behaviour for a genuinely dead token — and the exact hazard the platform allowlist was added to prevent for cross-provider sends. |

**Conclusion: nothing nulls a valid token on a later launch.** A re-launch re-registers and
re-writes the same or a rotated token; no code path clears it as a side effect.

### 4.4 ⚠️ The flag that matters most — a token arriving is NOT push working

`app/api/orders/submit/route.ts:1077` still carries my temporary predicate:

```ts
.or('platform.eq.ios,platform.is.null')
```

So an Android row with a perfectly valid FCM token **is still excluded from every send**,
and there is no FCM transport in the codebase to send to it even if it were included
(`lib/apns.ts` is Apple-only; `lib/push/*` does not exist yet). **Registration and delivery
are two separate milestones.** Do not read a populated `push_token` as "Android push works" —
it means "the device can now be targeted once dispatch exists". Retiring that predicate is
part of the dispatch work (previous report, §8 items 3–5), not this one.

---

## 5. VERIFICATION SQL — not run

Dominic runs SQL by hand. **These are read-only `SELECT`s; no DDL, no writes.**

**Deliberately does not print the token itself** — it is a device credential, and presence
plus length is sufficient to confirm registration:

```sql
-- 1. THE ANSWER: does an Android row exist with a token?
select device_id,
       platform,
       (push_token is not null) as has_push_token,
       length(push_token)       as token_len,
       notify_enabled,
       last_seen
from van_devices
where platform = 'android'
order by last_seen desc nulls last;
```

```sql
-- 2. FULL PICTURE across every device, to see the Android row alongside the 7 iOS ones.
select device_id,
       platform,
       (push_token is not null) as has_push_token,
       length(push_token)       as token_len,
       notify_enabled,
       last_seen,
       truck_id,
       van_id
from van_devices
order by last_seen desc nulls last;
```

```sql
-- 3. ONE-LINE SUMMARY, useful before/after the launch.
select coalesce(platform, '(null)') as platform,
       count(*)                                        as devices,
       count(*) filter (where push_token is not null)  as with_token
from van_devices
group by 1
order by 1;
```

**What a PASS looks like:** query 1 returns at least one row, `platform = 'android'`,
`has_push_token = true`, `token_len` in the low hundreds (FCM tokens are long — typically
~150–200 chars, longer than the 64-hex-char APNs tokens; treat the exact length as
informational, not a check). Baseline from the earlier verified state: 7 rows, all
`platform='ios'`, **zero** with a token — so query 3 changing from `ios | 7 | 0` to include
`android | 1 | 1` is the unambiguous confirmation.

**What a FAIL looks like, and what each means:**

- **No `android` row at all** → the device never bound; `registerForPush` runs only after
  binding (`OperatorDeviceConfig.tsx:43,49,69`). Check device setup, not push.
- **Row present, `has_push_token = false`** → registration ran but yielded no token: either
  the permission prompt was denied (`push.ts:39-40` returns early on
  `perm.receive !== 'granted'`), or `registrationError` fired — look for
  `[push] registration error:` in `chrome://inspect`.
- **App dies on launch** → the Firebase precondition is not actually satisfied despite the
  file being present; check logcat for `Default FirebaseApp is not initialized` (§2).

---

## 6. `docs/android.md` — appended (725 → 784 lines, nothing overwritten)

New entry `### 2026-07-27 — Android push guard REMOVED (Firebase now configured)`: what the
guard was, why it was correct, why it is now removed (with the verified `package_name` /
`applicationId` match), the honest "not defended, made not-to-arise" statement, the tsc
result, the full token write chain, the single nulling path, and the
token-arriving-≠-push-working flag.

**The verification result is recorded as `PENDING`**, explicitly, with the expected outcome
stated and a note that **this entry is to be completed with the actual result** — because I
cannot run the SQL or launch the device, and writing a result I have not seen would be
exactly the "recorded-as-applied ≠ applied" failure this project has already been bitten by.
Until it is filled in, the entry says Android registration is **BUILT, UNVERIFIED**.

---

## 7. Verified vs inferred

**Verified this task:** `google-services.json` present at `android/app/` with
`package_name = com.hatchgrab.app`, `project_id = hatchgrab`, one api_key, a
`mobilesdk_app_id`; that package name matching `capacitor.config.ts` `appId` and
`android/app/build.gradle`; the removed branch and the unchanged surrounding structure;
`tsc` exit 0; the full write chain (`push.ts:43-45` → `device.ts:66-71` →
`bind-device:80-88`); that `platform` is sent on every `saveDeviceConfig` call
(`device.ts:69`); that `bind-device` is a partial patch (`:80-88`); that the **only**
`push_token` nulling site is `submit/route.ts:1082` (exhaustive grep); that
`submit/route.ts:1077` still carries the iOS/null predicate.

**Inferred:** that `Capacitor.getPlatform()` returns exactly `'android'` in the Android
WebView (Capacitor's documented contract, and the same call the removed guard relied on, but
I have not observed the string on a device); that the google-services plugin generating
`google_app_id` is what makes `FirebaseApp` auto-initialise (standard Firebase Android
behaviour, consistent with the crash disappearing being conditional on the file, but not
traced through the plugin source); typical FCM token length.

**Cannot be established here at all:** whether registration actually succeeds. That needs a
device launch plus §5's query. **This change is BUILT, LIVE-TEST PENDING.**

---

## 8. What I could not do / did not do

- **Could not run the verification** — no gradle, builds, `cap`, dev servers, `adb`,
  installs; and no SQL, which you run by hand. §5 is written to be pasted.
- **Could not add real protection against the native throw** — none exists from JS (§2). I
  have said so plainly rather than adding a reassuring-looking `catch`.
- **Did not fix** the stale "APNs token" comment at `push.ts:42`, the temporary predicate at
  `submit/route.ts:1077`, or anything else in the send path — report-only, per item 4.
- **Did not touch** `android/`, `app/api/**`, `components/**`, or
  `docs/reference-manual.md`. Files changed: `lib/native/push.ts`, `docs/android.md`,
  `docs/android-report.md`.
- **Did not touch `docs/last-report.md`** — not read, not written, not opened. (It and
  `scripts/run-scraper.js` appear modified in `git status`; those changes are not mine.)
