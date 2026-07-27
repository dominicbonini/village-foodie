# Task report — listener-ordering race fixed; FCM token was being discarded · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only).
`docs/last-report.md` belongs to a separate workstream — not read, not written, not opened.

---

## 0. Prompt integrity — two garbled spots, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| item ¶2: *"On a first-ever install the listener probably **winrace**"* | *"probably **wins the race**"* | Collapsed words; the sentence contrasts first-install (no cached token) with relaunch (cached token), which is exactly the mechanism. |
| item 4: *"this fix **helpth platforms**"* | *"this fix **helps both platforms**"* | Collapsed words; the rest of the item is about iOS having the same latent race. |

Neither changed the work.

---

## 1. CAUSE CONFIRMED — your diagnosis is right, with one addition

`lib/native/push.ts`, the sequence **before** this change:

| Line | Call | Awaited? |
| --- | --- | --- |
| :37 | `const { PushNotifications } = await import('@capacitor/push-notifications')` | ✅ |
| **:39** | **`const perm = await PushNotifications.requestPermissions()`** | ✅ ← **an await sat between the plugin becoming available and the listeners existing** |
| :40 | `if (perm.receive !== 'granted') return` | — |
| :43 | `PushNotifications.addListener('registration', …)` | ❌ **not awaited** |
| :46 | `PushNotifications.addListener('registrationError', …)` | ❌ **not awaited** |
| :50 | `PushNotifications.addListener('pushNotificationActionPerformed', …)` | ❌ **not awaited** |
| :56 | `await PushNotifications.register()` | ✅ |

**Your stated cause is confirmed.** I would add one detail that makes it worse than described:
**the three `addListener` calls were never awaited.** `addListener` returns a
`Promise<PluginListenerHandle>`; the native listener map is populated by a **bridge
round-trip**, not by the JS call returning. So even with the calls textually before
`register()`, there was no guarantee the native side had registered them by the time
`register()` executed. Moving them earlier without awaiting them would have narrowed the
window, not closed it — which is why the fix awaits the attach.

Combined with a **cached FCM token** — `register()` resolving immediately rather than after a
network round-trip — the event fires effectively synchronously and the listener loses
**deterministically**, not occasionally. Your logcat is the proof:

```
Capacitor/PushNotificationsPlugin  V  Notifying listeners for event registration
Capacitor/PushNotificationsPlugin  D  No listeners found for event registration
```

Two lines apart: the token arrived, and it was dropped. There is no queue and no replay in
Capacitor's `notifyListeners()` — an event delivered to an empty listener map is gone.

---

## 2. THE FIX — `lib/native/push.ts`

### 2.1 New ordering

| Line | Call |
| --- | --- |
| :49 | `await import('@capacitor/push-notifications')` (unavoidable — kept dynamic so web never bundles it) |
| **:69-87** | **`if (!listenersAttached) { await Promise.all([ …three addListener calls… ]); listenersAttached = true }`** |
| :89 | `const perm = await PushNotifications.requestPermissions()` |
| :90 | `if (perm.receive !== 'granted') return` |
| :92 | `await PushNotifications.register()` |

All three listeners now attach **and complete** before the permission check and before
`register()`. `Promise.all` on the three handles is what turns "textually first" into
"actually registered first".

**`pushNotificationActionPerformed` moved with the other two, deliberately.** It has the same
hazard in a sharper form: a notification **tap that launches the app** can fire it during
startup, before any later attach point is reached. It was in the same block before; it stays
in the same block now, just earlier.

**The permission check is kept**, exactly as instructed — only moved after the attach. Note
this is now strictly better ordered as well as safer: attaching a listener requires no
permission, so there was never a reason for the permission gate to precede it.

### 2.2 Inline rationale recorded (item 5)

`push.ts:51-68` now carries the *why*, not just the *what* — the log evidence, the mechanism,
and the family it belongs to:

> ⚠️ **LISTENERS FIRST — AND AWAITED — BEFORE requestPermissions() AND BEFORE register().**
> A Capacitor plugin event **FIRES WHETHER OR NOT ANYONE IS LISTENING.** The native side keeps
> a listener map; `notifyListeners()` with an empty map logs "No listeners found for event
> <name>" and **DROPS the payload**. There is no queue and no replay — a token delivered to
> nobody is gone. … **FCM CACHES THE TOKEN**, so on any relaunch `register()` resolves almost
> immediately and the event fires effectively synchronously — the listener loses the race
> deterministically, not occasionally. A first-ever install (no cached token, a real network
> round-trip) probably wins it, which is exactly what makes this the kind of bug that looks
> intermittent and "works on my machine".
> **SAME FAMILY AS the manual's "wiring is not data flow"**: every layer existed and every
> layer was correct — permission, registration, listener, save, endpoint, column — and the
> event had no receiver at the instant it fired. Do not reorder these back above the awaits.

---

## 3. DOUBLE-ATTACH — not previously handled. Now guarded.

**It was not handled.** Nothing prevented re-entry. `registerForPush` is called from three
sites in `components/native/OperatorDeviceConfig.tsx` — `:43` (already-configured path), `:49`
(single-van auto-bind), `:69` (card save) — and `runSetup` can run more than once per session:
it is a `useCallback` driven by `useEffect` (`:60`) and is re-invoked by the **Retry** button
(`:85`), plus any remount. Each call attached a fresh set of listeners, so a token would have
been saved N times.

**Chosen: a module-level `listenersAttached` flag** (`push.ts:20`).

**Why not `removeAllListeners()` first:** it costs a bridge round-trip on every call, and it
opens a window — however brief — in which the old listener is gone and the new one is not yet
registered. Using a remove-then-add cycle to fix a listener-timing bug reintroduces a
listener-timing bug. The flag has no window at all.

**Why the flag is set AFTER a successful attach, not before** (`push.ts:86`, documented at
`:14-19`):

- **Set-before** would prevent a concurrent double-attach, but if the attach threw, the flag
  would stay `true` forever and every later call would run `register()` with **no listener** —
  silently recreating the exact bug being fixed, permanently, on that device.
- **Set-after** risks only a theoretical concurrent double-attach, and that is **harmless**:
  two listeners each call `saveDeviceConfig` with the same token, and that write is an
  idempotent upsert (`bind-device:80-88`).

Trading a harmless duplicate for a permanent silent failure is the wrong way round, so I took
set-after. In practice concurrency does not arise anyway: `:43`/`:49` are mutually exclusive
within one `runSetup`, and `:69` only runs from a card that is shown after `runSetup`
completes.

**Scope of the flag:** module-level = one per JS context = one per page load in the WebView.
That is precisely the lifetime of the native listener registration, so it cannot go stale. The
`token` captured in the closure cannot go stale either: a truck switch does
`window.location.href = '/dashboard/<newToken>'` (`OperatorDeviceConfig.tsx:189`) — a full page
load, a new JS context, a reset flag.

---

## 4. PLATFORM IMPACT — and a correction to one of your premises

### 4.1 Web: byte-identical. iOS: **not** byte-identical, and I will not claim it is.

- **Web** — unchanged. `if (!Capacitor.isNativePlatform()) return` still returns before any of
  this code; web never bundles the plugin (the import stays dynamic).
- **iOS** — **the same lines run on iOS and they are now reordered.** Describing that as
  "byte-identical" would be false. What actually changes is only that a token which would have
  been dropped is now captured; the permission gate, the register call, the save, and the
  error handling are semantically unchanged. That is the honest statement, and it is the one I
  am making.

### 4.2 Is this bug why iOS has 7 rows and 0 tokens since 2 July? **No — verified.**

I checked the iOS project rather than reasoning about it:

- **There is no `.entitlements` file anywhere under `ios/`** (`find ios -name "*.entitlements"`
  → nothing; the only project file matched is `ios/App/App/Info.plist`).
- **No `aps-environment`, no `com.apple.developer.aps-environment`, no `remote-notification`**
  anywhere in `ios/` (grep → zero hits).

**The Push Notifications capability has never been added to the iOS app.** Without
`aps-environment`, `registerForRemoteNotifications()` cannot succeed: iOS fires
**`registrationError`**, never `registration`. So iOS never got far enough for this race to
matter — the event that loses the race was never being fired successfully in the first place.

This also matches the file's own header, written when it was built: *"CANNOT BE VALIDATED
WITHOUT: the Push Notifications capability/entitlement on the iOS app, the APNs cert (.p8) …
and a physical device."* That precondition was recorded and never met.

**But the fix is still load-bearing for iOS**: the identical race exists there (APNs also
caches its token, and `didRegisterForRemoteNotificationsWithDeviceToken` can fire very fast on
relaunch), and it would have bitten on the first launch after the capability was added — with
the same silent symptom and no error to find. Fixing it now means that day is not spent
debugging this.

**What iOS actually needs, in order:** (1) the Push Notifications capability + entitlement in
the Xcode project; (2) a provisioning profile that includes it; (3) `APNS_*` env for *sending*
(which does not affect registration at all). **Marked as inference:** that (1) is the sole
blocker — I cannot run an iOS build or read a device log, so there may be more behind it.

---

## 5. Verification

`npx tsc --noEmit` → **exit 0, zero output.**

That is the only check available — no gradle, builds, `cap`, dev servers, `adb`, or installs.
**The fix is BUILT, LIVE-TEST PENDING.**

**The live test, and what a pass looks like:**

1. Relaunch the Android app (the cached-token case — the one that failed deterministically).
2. In logcat, expect `Notifying listeners for event registration` **without** a following
   `No listeners found`.
3. Then run the token-verification SQL (previous report, step 1):
   ```sql
   select device_id, platform, (push_token is not null) as has_push_token,
          length(push_token) as token_len, notify_enabled, last_seen
   from van_devices where platform = 'android' order by last_seen desc nulls last;
   ```
   **PASS = `has_push_token` true, `token_len` in the low hundreds.**

**Still true, and worth repeating: a token arriving is not push working.**
`app/api/orders/submit/route.ts:1077` still carries the temporary
`.or('platform.eq.ios,platform.is.null')` predicate, and there is no FCM transport. The device
becomes *targetable*; nothing yet targets it.

---

## 6. Files changed

| File | Change |
| --- | --- |
| `lib/native/push.ts` | Listeners moved ahead of `requestPermissions()`/`register()` and **awaited**; module-level `listenersAttached` guard added (`:20`); rationale comments at `:14-19` and `:51-68`. |
| `docs/android.md` | **Appended** 847 → 928 lines, nothing overwritten. |
| `docs/android-report.md` | This file, overwritten. |

**Not touched:** `components/native/OperatorDeviceConfig.tsx` (the three call sites are
unchanged — the fix is entirely inside the callee), `app/api/orders/submit/route.ts`, the three
`20260728_*` migrations, `ios/`, `android/`, `docs/reference-manual.md`.

---

## 7. `docs/android.md` — appended

Entry `### 2026-07-27 — Listener-ordering race: FCM token arrived and was DISCARDED. FIXED.`:
the two logcat lines, the confirmed before-ordering with line numbers, the cached-token
mechanism and why it makes the race deterministic, the fix, the double-attach reasoning
(flag vs `removeAllListeners`, and set-after vs set-before), the platform impact including the
explicit refusal to call iOS byte-identical, and the verified finding that the missing iOS
entitlement — not this race — explains iOS's 0 tokens.

Plus the **invariant candidate for manual §35**:

> A Capacitor plugin event fires whether or not anyone is listening. Attach listeners before
> any `await` that could let the triggering call run, and **await the attach itself** — the
> native listener map is populated by a bridge round-trip, not by the JS call returning. A
> cached native value (an FCM token, a stored location, a paired device) makes the trigger
> effectively synchronous, so the race is lost **deterministically** rather than occasionally.

recorded with why it belongs beside *"wiring is not data flow"*: every layer existed and was
correct, and neither `tsc` nor code review catches it because **nothing is missing — only the
ordering is wrong**. Sibling call sites named for a later audit:
`lib/native/notifications.ts` action handlers, `@capacitor/app` resume/URL listeners,
`@capacitor-community/keep-awake`. **Not audited — flagged only.**

---

## 8. Flagged

- **The same pattern is elsewhere and unaudited.** Three other native helpers attach listeners;
  none has been checked for this ordering. That audit is a real piece of work, not a glance.
- **iOS push is blocked on a capability, not on code** (§4.2). Worth knowing before anyone
  spends time on iOS push behaviour.
- **`tsc` cannot see this class of bug at all.** It is an ordering property across a bridge; it
  type-checks perfectly in both the broken and fixed forms. Only the device log distinguishes
  them — which is why step 2 of §5's live test (looking for the *absence* of "No listeners
  found") matters as much as the SQL.
- **Set-after on the guard flag is a deliberate trade** (§3). If you would rather have
  strict-once semantics, set-before plus a `catch` that resets the flag is the version that
  gets both — more code, and I did not think the concurrency risk justified it.

---

## 9. What I could not do / did not do

- **Could not run or observe the app** — no gradle, builds, `cap`, dev servers, `adb`,
  installs. `tsc` (exit 0) is the only executed check; the fix is unverified on device.
- **Could not confirm the iOS side beyond the project files** — no Xcode, no device log. The
  entitlement's absence is verified; that it is the *only* iOS blocker is inference.
- **Did not audit the sibling listener call sites** — named in §7, not examined.
- **Did not touch the three call sites** in `OperatorDeviceConfig.tsx`, the order-submit path,
  or the migrations.
- **Did not touch `docs/reference-manual.md`** — the §35 candidate sits in `docs/android.md`
  for you to fold by hand.
- **Did not touch `docs/last-report.md`** — not read, not written, not opened.
