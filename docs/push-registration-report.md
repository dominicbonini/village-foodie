# Push notifications — why nothing arrived on 15 August 2026

**READ-ONLY. Nothing was edited, committed, built or deployed. No `next dev`, no `next build`. No write to the database — no query was run against it at all.**
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**
⚠️ **The env file was read for KEY NAMES ONLY. No value was printed, logged or copied into this report.**

> ## 🔴 THE HEADLINE: THERE ARE **THREE INDEPENDENT** REASONS NOTHING ARRIVED, AND EACH ONE ALONE IS SUFFICIENT.
>
> **1. NO SEND WAS EVEN ATTEMPTED.** The device query filters `.not('push_token', 'is', null)`. With all four iOS rows NULL, `tokens` is empty, `if (tokens.length)` is false — **`sendOrderPendingPush` was never called.** 🔴 **So the sandbox-vs-production question never arose on this order: nothing was sent to either endpoint.**
> **2. THE SENDER IS NOT CONFIGURED — in the environment I can see.** `apnsConfig()` requires four `APNS_*` vars. **`.env.local` contains ZERO `APNS_*` keys** (it does have `FCM_SERVICE_ACCOUNT_JSON`). ⚠️ **The device hits PRODUCTION, whose env I cannot inspect from this repo — see C2 for what that does and does not prove.**
> **3. REGISTRATION FAILED SILENTLY, IF IT RAN AT ALL.** The `registrationError` listener exists and does exactly one thing: `console.warn`. **No UI, no server report, no state.** 🔴 **And the console it writes to is inside a WKWebView on an iPad, where nobody was looking.**
>
> ## ⚠️ AND SEPARATELY, THE ANSWER TO "why no warning?": **NOTHING IN THE APP EVER CHECKS WHETHER A USABLE TOKEN EXISTS.** The toggle that said ON is a **local preference**. See Part B.

---

# PART A — DOES REGISTRATION EVEN RUN?

## A1. The full registration path, quoted

**READ, `lib/native/push.ts:48-95` — the entire body, in order:**

```ts
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
```
```ts
    if (!listenersAttached) {
      await Promise.all([
        // FCM/APNs token → persist to this device's row so the server push path can target it.
        PushNotifications.addListener('registration', (t: { value: string }) => {
          void saveDeviceConfig(token, { push_token: t.value })
        }),
        PushNotifications.addListener('registrationError', (err: unknown) => {
          console.warn('[push] registration error:', err)
        }),
        PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, unknown> } }) => {
          const data = action?.notification?.data
          const orderKey = data && typeof data.orderKey === 'string' ? data.orderKey : null
          if (orderKey && onOpenOrder) onOpenOrder(orderKey)
        }),
      ])
      listenersAttached = true
    }

    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    await PushNotifications.register()
  } catch (e) {
    console.warn('[push] register failed:', (e as Error).message)
  }
```

| Step | Line | Note |
|---|---|---|
| **Token listener** | `:72-74` | ✅ attached **and awaited** BEFORE `register()` — the V11.x fix for the Android dropped-token race, and it is correct |
| **Error listener** | `:75-77` | ⚠️ attached, and see A2 |
| **Tap handler** | `:80-84` | attached early so a launch-by-tap is not missed |
| **Permission request** | `:89` | `requestPermissions()` |
| **Early return** | `:90` | 🔴 **`if (perm.receive !== 'granted') return` — SILENT. No log, no state, no UI.** |
| **Register** | `:92` | `await PushNotifications.register()` |

✅ **THE ORDERING IS RIGHT AND IS NOT THE BUG.** The header at `:51-68` records the exact failure this ordering fixed (`No listeners found for event registration`). **A token delivered today would be caught and written.**

## A2. 🔴 THE FAILURE HANDLER — implemented, and it swallows

**JS side, `lib/native/push.ts:75-77`, in full:**

```ts
        PushNotifications.addListener('registrationError', (err: unknown) => {
          console.warn('[push] registration error:', err)
        }),
```

**The native side that feeds it. READ, `@capacitor/push-notifications/ios/…/PushNotificationsPlugin.swift:202-210`:**

```swift
    @objc public func didFailToRegisterForRemoteNotificationsWithError(notification: NSNotification) {
        appDelegateRegistrationCalled = true
        guard let error = notification.object as? Error else {
            return
        }
        notifyListeners("registrationError", data: [
            "error": error.localizedDescription
        ])
    }
```

> ## ✅ IMPLEMENTED — BOTH HALVES. ❌ AND IT SWALLOWS THE ERROR COMPLETELY.
> **`didFailToRegisterForRemoteNotificationsWithError` IS wired** (observer registered at `:44-47`), and it DOES deliver `error.localizedDescription` to JS. 🔴 **The JS handler then writes it to `console.warn` and stops.**
> **It does not:** set state · render anything · write to the device row · call the server · retry · surface a badge · disable the toggle that claims push is on. **The one thing it does is the one thing nobody on a trading iPad can see.**

⚠️ **AND THERE IS A SECOND, QUIETER SWALLOW: `:90`.** If the operator denied notifications at the OS level, `registerForPush` **returns with no log at all** — not even a `console.warn`. 🔴 **"Permission denied" and "registration failed" are indistinguishable from outside, and one of them leaves no trace whatsoever.**

## A3. What is logged, and could it be seen from the device?

| Event | What is emitted | Where it goes |
|---|---|---|
| Registration error | `[push] registration error: <localizedDescription>` | **WKWebView JS console** |
| Any thrown exception | `[push] register failed: <message>` | **WKWebView JS console** |
| Permission denied | 🔴 **NOTHING** | — |
| Token received | 🔴 **NOTHING** — it writes silently via `saveDeviceConfig` | — |

> ## 🔴 VISIBLE FROM THE DEVICE? **NO. NOT WITHOUT A MAC ATTACHED.**
> These are `console.warn` calls **inside the WebView**. Reaching them requires **Safari → Develop → \<iPad\> → Web Inspector**, or Xcode's console for the native half. **There is no in-app log viewer, no toast, no diagnostics screen.**
> ⚠️ **AND THE NATIVE FAILURE — the one that says WHY APNs refused — is emitted by iOS itself and appears in the DEVICE log, not the JS console.** Part E is the procedure for capturing it.

## A4. What gates registration — quoted

**Gate 1 — NATIVE ONLY. `lib/native/push.ts:28`:**
```ts
  if (!Capacitor.isNativePlatform()) return
```

**Gate 2 — OS PERMISSION. `:89-90`:**
```ts
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return
```

**Gate 3 — 🔴 THE DEVICE MUST BE BOUND TO A VAN. `registerForPush` has exactly THREE call sites, all in `components/native/OperatorDeviceConfig.tsx`:**

```tsx
    if (device && device.van_id) { void registerForPush(token); setLoading(false); return }
```
```tsx
    if (vanList.length === 1) {
      const saved = await saveDeviceConfig(token, { van_id: vanList[0].id, default_screen: device?.default_screen ?? 'dashboard' })
      if (!mounted.current) return
      if (saved) void registerForPush(token)
```
```tsx
    if (saved) { void registerForPush(token); setNeedsSetup(false) }
```

🔴 **All three are inside `DeviceSetupGate`, and every one is `void`-ed — the promise is never awaited and never inspected.** ⚠️ **`runSetup` bails BEFORE any of them on a fetch failure:**

```tsx
    if (!result.ok) { setFetchError(true); setLoading(false); return }
```

**Gate 4 — NOT FOUND.** ✅ **"Not found" is the result: registration is NOT gated by plan, role, truck flag, or by the "New order alerts" toggle in Settings.** 🔴 **Binding to a van is the only product-level precondition** — the notifications card and the registration call are **completely independent code paths that never consult one another.**

---

# PART B — THE TOGGLE THAT SHOWED "ON"

## B1. What it reads and writes

**READ, `components/native/NotificationSettings.tsx`. The load, `:27-31`:**

```tsx
      const m = (await Preferences.get({ key: NOTIFY_KEYS.master })).value
      const o = (await Preferences.get({ key: NOTIFY_KEYS.offline })).value
      const n = (await Preferences.get({ key: NOTIFY_KEYS.neworder })).value
      if (off) return
      setMaster(m === 'true'); setOfflineAlerts(o !== 'false'); setNewOrder(n === 'true'); setReady(true)
```

**The master toggle, `:38-53`:**

```tsx
  const toggleMaster = async (v: boolean) => {
    setNotice(null)
    if (v) {
      let granted = false
      try { granted = await requestNotificationPermission() } catch { granted = false }
      if (!granted) {
        setNotice('Notifications need to be enabled in your device Settings to turn this on.')
        return
      }
    }
    setMaster(v); await Preferences.set({ key: NOTIFY_KEYS.master, value: String(v) })
  }
```

**"New order alerts" — the one that matters here, `:55-60`:**

```tsx
  const toggleNewOrder = async (v: boolean) => {
    setNewOrder(v); await Preferences.set({ key: NOTIFY_KEYS.neworder, value: String(v) })
    try { await fetch('/api/native/bind-device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, device_id: getDeviceId(), notify_enabled: v }) }) } catch { /* offline / transient — retries on next toggle */ }
  }
```

## B2. 🔴 (a), (b) or (c)? — **(b), WITH A ONE-SHOT TOUCH OF (a). NEVER (c).**

| | Does the toggle reflect it? | Evidence |
|---|---|---|
| **(a) OS permission** | ⚠️ **ONLY AT THE MOMENT OF TURNING ON.** `requestNotificationPermission()` is called in `toggleMaster`, but 🔴 **the load path at `:27-31` reads ONLY Preferences — it never re-checks `checkPermissions()`.** So permission revoked in iOS Settings later leaves the toggle showing ON forever. |
| **(b) A local preference** | ✅ **YES — THIS IS WHAT IT IS.** `NOTIFY_KEYS.master` / `.neworder` in Capacitor Preferences, plus `van_devices.notify_enabled` for the sub-toggle. |
| **(c) Whether a usable `push_token` exists** | 🔴 **NO. ABSOLUTELY NOT.** **The string `push_token` does not appear in this file at all.** It imports `Preferences`, `isNativeApp`, `getDeviceId`, `Toggle` and `requestNotificationPermission` — **and nothing that could answer the question.** |

> ## 🔴 CONFIRMED, IN THE BRIEF'S OWN WORDS: **IT IS A LABEL ASSERTING A STATE NOBODY CHECKED.**
> **"New order alerts — Get notified when a customer order needs confirming"** renders ON because a **boolean in device storage** says `'true'`. **`van_devices.push_token` is NULL, and no code on this screen has ever asked.**
> ⚠️ **THE COMPONENT'S OWN HEADER ADMITS IT, and has since it was written** — `:5-7`:
> > *"**"New order alerts"** — the SERVER PUSH (needs a connection + APNs config). The toggle writes `van_devices.notify_enabled` (via /api/native/bind-device); **actual delivery is DEFERRED** (needs APNs env + a physical device). Labelled "needs a connection"."*
> 🔴 **The label promised in that comment — *"needs a connection"* — IS NOT IN THE RENDERED COPY.** The visible helper text is *"Get notified when a customer order needs confirming."* with no caveat at all. **The disclaimer exists only in the source comment.**

## B3. Any surface that would tell an operator registration failed? — 🔴 **NOT FOUND**

**"Not found" is the result, and it was searched for four ways:**

| Candidate | Result |
|---|---|
| A UI branch on registration failure | 🔴 **NONE.** The only `notice` in `NotificationSettings.tsx` is `:48`, and it fires **only** when the operator taps the master toggle and permission is refused — never for a registration error, which happens asynchronously on a different screen |
| A read of `push_token` anywhere in the client | 🔴 **NOT FOUND.** `push_token` is written by `saveDeviceConfig` and **never read back by any component** |
| A server-side warning surfaced to the operator | 🔴 **NONE.** `sendOrderPendingPush` returns `{ skipped: 'not-configured' }` and the submit route's `catch` does `console.error(… 'non-fatal, order saved')` — **into the SERVER log, seen by nobody on the iPad** |
| A badge, banner or diagnostics screen | 🔴 **NONE** |

> ## ⚠️ SO THE OBSERVED BEHAVIOUR IS EXACTLY WHAT THE CODE SPECIFIES: the toggle says ON, no push arrives, and no warning is shown — **because there is no code path capable of showing one.**

---

# PART C — THE SEND PATH

## C1. Target resolution — the full chain, quoted

**READ, `app/api/orders/submit/route.ts`, the complete push block:**

```ts
    if (!autoAccepted) {
      try {
        const eid = eventRow?.id ?? null
        let vanId: string | null = null
        if (eid) {
          const { data: evVan } = await supabase.from('truck_events').select('van_id').eq('id', eid).single()
          vanId = (evVan?.van_id as string | null) ?? null
        }
        if (vanId) {
          // Van-level master toggle (default ON when no row).
          const { data: pref } = await supabase
            .from('van_notification_prefs').select('enabled').eq('van_id', vanId).eq('type', 'order_pending').maybeSingle()
          if (!pref || pref.enabled) {
            const { data: devices } = await supabase
              .from('van_devices').select('device_id, push_token').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
              .or('platform.eq.ios,platform.is.null')
            const tokens = (devices || []).map(d => d.push_token as string).filter(Boolean)
            if (tokens.length) {
              const res = await sendOrderPendingPush(tokens, { orderKey: order?.order_key ?? '', orderNumber: orderId, truckName: truck.name })
              if (res.invalidTokens.length) {
                await supabase.from('van_devices').update({ push_token: null }).in('push_token', res.invalidTokens)
              }
            }
          }
        }
      } catch (pushErr) {
        console.error('Order-pending push failed (non-fatal, order saved):', pushErr)
      }
    }
```

**The chain, and every way it exits early:**

| # | Step | Silent exit if… |
|---|---|---|
| 0 | `if (!autoAccepted)` | 🔴 **the truck has AUTO-ACCEPT ON — no push is ever sent, by design** |
| 1 | `eventRow?.id` → `eid` | the order has no event |
| 2 | `truck_events.van_id` → `vanId` | 🔴 **the event has no van bound** |
| 3 | `van_notification_prefs.enabled` | a row exists with `enabled = false` (absent row ⇒ ON) |
| 4 | `van_devices` where `van_id` + `notify_enabled = true` + **`push_token IS NOT NULL`** + platform ios/null | 🔴 **every device row is filtered out** |
| 5 | `if (tokens.length)` | 🔴 **THE LIST IS EMPTY — WHICH IS TODAY'S CASE** |

⚠️ **STEP 0 IS WORTH CHECKING ON THE TEST ORDER.** If the truck used auto-accept, the block never ran — **a fourth independent explanation, and it would look identical from the iPad.** **I did not query the database, so I cannot say which truck setting was live.**

## C2. 🔴 Which endpoint? **SANDBOX BY DEFAULT — and nothing was sent to either.**

**READ, `lib/apns.ts:13-24`, complete:**

```ts
function apnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  // .p8 contents (PEM). Support literal newlines or \n-escaped env storage.
  const key = process.env.APNS_KEY?.replace(/\\n/g, '\n')
  if (!keyId || !teamId || !bundleId || !key) return null
  const host = process.env.APNS_ENV === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'
  return { keyId, teamId, bundleId, key, host }
}
```

| Condition | Endpoint |
|---|---|
| `APNS_ENV === 'production'` | `https://api.push.apple.com` |
| **Anything else, INCLUDING UNSET** | 🔴 **`https://api.sandbox.push.apple.com`** |

> ## ✅ THE DEFAULT IS SANDBOX, WHICH IS THE **SAFE** DEFAULT AND MATCHES A DEBUG BUILD.
> **A Debug build's sandbox token sent to the sandbox host is the CORRECT pairing.** 🔴 **The `BadDeviceToken`-destroys-the-evidence scenario in N21 requires `APNS_ENV=production` to be explicitly set. Unset, it cannot occur.**

### 🔴 AND THE SENDER IS NOT CONFIGURED AT ALL — in the environment I can see

**READ. `.env.local` holds 32 variables. Their NAMES, values withheld:**

```
BREVO_API_KEY · CRON_SECRET · FCM_SERVICE_ACCOUNT_JSON · GEMINI_API_KEY · GOOGLE_SHEETS_CREDENTIALS ·
HATCHGRAB_API_URL · INBOUND_SCHEDULE_SECRET · META_WEBHOOK_VERIFY_TOKEN · META_WHATSAPP_ACCESS_TOKEN ·
NEXT_PUBLIC_BASE_URL · NEXT_PUBLIC_HATCHGRAB_URL · NEXT_PUBLIC_POSTHOG_HOST · NEXT_PUBLIC_POSTHOG_KEY ·
NEXT_PUBLIC_SIGNUP_PUBLIC · NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY · NEXT_PUBLIC_SUPABASE_ANON_KEY ·
NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPPORT_EMAIL · OPERATOR_PHONE · SIGNUP_PUBLIC · SPREADSHEET_ID ·
STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY · SUPABASE_URL ·
TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_PHONE_NUMBER · TWILIO_WHATSAPP_NUMBER ·
UPSTASH_REDIS_REST_TOKEN · UPSTASH_REDIS_REST_URL
```

🔴 **ZERO `APNS_*` KEYS. Not `APNS_KEY_ID`, not `APNS_TEAM_ID`, not `APNS_BUNDLE_ID`, not `APNS_KEY`, not `APNS_ENV`.** ✅ **`FCM_SERVICE_ACCOUNT_JSON` IS present — the Android half is configured and the iOS half is not, which matches the one populated token being Android's.**

**So `apnsConfig()` returns `null` and `sendOrderPendingPush` takes its first line out (`lib/apns.ts:47`):**

```ts
  if (!cfg) { console.warn('[apns] not configured — skipping push (safe no-op)'); return { sent: 0, invalidTokens: [], skipped: 'not-configured' } }
```

> ## ⚠️ THE LIMIT OF THIS FINDING, STATED PLAINLY BECAUSE IT MATTERS.
> **`.env.local` is the LOCAL DEV environment. The iPad loads `https://www.hatchgrab.com`, so the code that would have sent runs on the DEPLOYED server, whose environment I cannot inspect from this repository — and the brief forbids touching env vars.**
> 🔴 **What this DOES prove: the local environment cannot send. What it does NOT prove: that production is unconfigured.** ⚠️ **It is INFERRED, not READ, that production is likely in the same state — because §36 records the APNs `.p8` as never obtained and no token has ever been received on iOS.**
> ✅ **AND IT DOES NOT MATTER FOR THIS INCIDENT EITHER WAY: reason 1 stops the code before `sendOrderPendingPush` is reached at all.**

## C3. The `BadDeviceToken` handler — 🔴 **YES, IT NULLS THE COLUMN**

**Detection, `lib/apns.ts:68-72`:**
```ts
      req.on('end', () => {
        if (status === 200) sent++
        else { try { const r = JSON.parse(data || '{}'); if (r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') invalidTokens.push(token) } catch {} }
        resolve()
      })
```

**The write, in the submit route:**
```ts
              if (res.invalidTokens.length) {
                await supabase.from('van_devices').update({ push_token: null }).in('push_token', res.invalidTokens)
              }
```

🔴 **CONFIRMED — `push_token` is set to NULL, permanently, with no audit row and no second chance.** ⚠️ **N21's warning is exactly right, AND it is currently inert**, because C2 shows the default host is sandbox and C1 shows no send was attempted. **The destruction mechanism is real but was not what emptied these four rows** — INFERRED, since I did not query the database and cannot see whether a token was ever written and later cleared.

## C4. `.or('platform.eq.ios,platform.is.null')` — 🔴 **STILL PRESENT. ANDROID IS EXCLUDED.**

```ts
              .or('platform.eq.ios,platform.is.null')
```

**Carried verbatim, with the reason above it:**

> *"APNs-ONLY ALLOWLIST: sendOrderPendingPush POSTs to api.push.apple.com, which understands Apple device tokens only. A non-Apple token (e.g. an FCM token from an Android build) comes back as BadDeviceToken → the invalidTokens cleanup just below would NULL that row's push_token, silently and permanently disabling push for that device."*

> ## 🔴 STATED PLAINLY: **ANDROID IS EXCLUDED FROM ORDER PUSH ENTIRELY, AND THE ONLY WORKING TOKEN IN THE TABLE IS ANDROID'S.**
> ✅ **The exclusion is CORRECT — it protects the FCM token from being destroyed by an APNs rejection.** 🔴 **But the consequence is stark: the one device in the fleet that HAS a valid push token is the one device the send path filters out.** ⚠️ **This is already §27's open "FCM sender" item; it is not new, and it is not a defect in this filter.**

## C5. Would a send be attempted with a NULL token? — 🔴 **NO. SKIPPED SILENTLY, TWICE OVER.**

1. **`.not('push_token', 'is', null)`** — the row never leaves the database.
2. **`.filter(Boolean)`** — belt and braces on the mapped array.
3. **`if (tokens.length)`** — 🔴 **an empty list means `sendOrderPendingPush` is NEVER CALLED. No log line, no metric, no `skipped` reason. Nothing.**

> ## ⚠️ THAT SILENCE IS THE REAL DIAGNOSTIC PROBLEM.
> **`sendOrderPendingPush` at least logs `[apns] not configured — skipping push (safe no-op)`. The `if (tokens.length)` guard logs NOTHING.** 🔴 **"No device had a token" and "the push block never ran" produce byte-identical server output: silence.**

---

# PART D — FOREGROUND BEHAVIOUR

## D1. If a push DID arrive with the app foregrounded

**🔴 THE JS LAYER WOULD DO NOTHING. `pushNotificationReceived` — "NOT FOUND" is the result:** a repo-wide grep across `app/`, `components/` and `lib/` returns **zero** occurrences. The only three listeners attached are `registration`, `registrationError` and `pushNotificationActionPerformed` (a **tap**, i.e. background/closed only).

**AND THE NATIVE LAYER WOULD SHOW NOTHING EITHER. READ, `PushNotificationsHandler.swift:20-56`:**

```swift
    public func willPresent(notification: UNNotification) -> UNNotificationPresentationOptions {
        let notificationData = makeNotificationRequestJSObject(notification.request)
        self.plugin?.notifyListeners("pushNotificationReceived", data: notificationData)
        …
        if let optionsArray = self.plugin?.getConfig().getArray("presentationOptions") as? [String] {
            …
            return presentationOptions
        }

        return []
    }
```

🔴 **`return []` IS THE DEFAULT — no banner, no list entry, no badge, no sound — and it is reached whenever `presentationOptions` is not configured.**

**READ, our config: `capacitor.config.ts` has NO `PushNotifications` plugin block.** Its `plugins` object contains only `SplashScreen`, `LocalNotifications` and `CapacitorHttp`. **`ios/App/App/capacitor.config.json` mentions `PushNotificationsPlugin` only in `packageClassList` — the plugin registry, not configuration.**

### ✅ THE MANUAL'S ACCOUNT IS CONFIRMED — the alert is in-app audio, not a notification

**READ, `docs/reference-manual.md:3926`:** *"New-order alerting is **foreground-only Web Audio** (`playNewOrder`), with the APNs fallback that has…"*

**And the dashboard code agrees. READ, `app/dashboard/[token]/page.tsx:1162-1168`:**

```tsx
    const sameEvent=ordersEventId===soundEventRef.current
    if(soundEnabled&&authenticated&&sameEvent&&mode!=='off'){
      const fire = mode==='all'
        ? orders.some(o=>o.order_key&&!prevOrderKeysRef.current.has(o.order_key))
        : count>prevPendingCount.current
      if(fire) playNewOrder()   // shared primed AudioContext (unlocked on first gesture)
    }
```

🔴 **WHAT THAT MEANS FOR THE DASHBOARD SPECIFICALLY: the new-order alert is a WEB AUDIO DING driven by the ORDER LIST REFRESH — realtime/polling — and it has NOTHING to do with push.** It fires whether or not APNs exists, and it requires `soundEnabled`, `authenticated`, the same event, a `mode` that is not `'off'`, **and a prior user gesture to unlock the AudioContext.**

⚠️ **A RELATED DEAD END, FOUND WHILE LOOKING: `notifyNewOrder()` and `playNewOrderAlert()` in `lib/native/notifications.ts:58-86` — both of which schedule a real LOCAL notification for a new order — have ZERO call sites.** ✅ **The local-notification path for new orders exists and is unused; the local path that IS used is the offline/paused alert.**

⚠️ **ONE MORE, REPORTED NOT DIAGNOSED: the APNs payload sets `'content-available': 1` (`lib/apns.ts:52`), and `ios/App/App/Info.plist` contains NO `UIBackgroundModes` key at all** (`grep -c` returns 0). **A background content-available wake would therefore not be delivered even once push works.** **The visible `alert` half is unaffected.**

## D2. What should an operator watching the dashboard expect?

> ## 🔴 **A SOUND — AND ONLY A SOUND. NOT A BANNER, AND NOT FROM PUSH.**
>
> | | Foregrounded on the dashboard |
> |---|---|
> | **Banner** | 🔴 **NO.** `willPresent` returns `[]` — the OS suppresses it, by configuration |
> | **Notification sound** | 🔴 **NO.** `sound` is a presentation option, and the array is empty |
> | **Badge** | 🔴 **NO** |
> | **In-app ding** | ✅ **YES — `playNewOrder()`, from the order refresh**, if sound is on, the mode isn't `off`, and audio was unlocked by a gesture |
> | **Anything at all from PUSH** | 🔴 **NOTHING VISIBLE.** It would fire `pushNotificationReceived`, which has no listener |
>
> ⚠️ **SO EVEN AFTER PUSH IS FIXED, A FOREGROUNDED OPERATOR WILL SEE NO CHANGE.** Push only becomes visible when the app is **backgrounded or closed** — which is its purpose, but it means **"push works" cannot be tested from the dashboard with the app open.**

---

# PART E — WHAT WOULD PROVE IT

## E1. Capturing the registration error from the connected device

**The error you need is emitted by iOS, not by the WebView, so there are two consoles and you want both.**

**1. The native log — the authoritative one. With the iPad connected by cable, on the Mac:**

```
log stream --device --style compact --predicate 'processImagePath CONTAINS "HatchGrab"'
```

**Narrow to push if it is noisy:**

```
log stream --device --style compact --predicate 'processImagePath CONTAINS "HatchGrab" AND (eventMessage CONTAINS[c] "push" OR eventMessage CONTAINS[c] "apns" OR eventMessage CONTAINS[c] "remote notification")'
```

**2. Xcode:** Window → Devices and Simulators → select the iPad → **Open Console**, filter on `HatchGrab`, then on `aps` / `APNS` / `remote`.

**3. The WebView console — where `[push] registration error:` lands:** Safari on the Mac → **Develop → \<your iPad\> → the HatchGrab WebView** → Console. **Filter: `[push]`.**

**🔴 THE STRINGS TO LOOK FOR, in priority order:**

| String | Console |
|---|---|
| **`no valid "aps-environment" entitlement string found for application`** | native |
| **`Failed to register for remote notifications`** / `didFailToRegisterForRemoteNotifications` | native |
| **`[push] registration error:`** | WebView |
| **`[push] register failed:`** | WebView |
| **`No listeners found for event registration`** | native/bridge — the token-dropped race |
| **`Notifying listeners for event registration`** *without* a follow-up write | native/bridge |

⚠️ **SEQUENCE MATTERS. Kill the app first, START the log stream, THEN cold-launch** — registration fires within the first seconds and a stream attached afterwards has already missed it.

✅ **AND THE DECISIVE, ZERO-TOOL CHECK: after that launch, read `van_devices.push_token` for this device.** 🔴 **Non-NULL ⇒ registration succeeded and the problem is entirely server-side. NULL ⇒ it never arrived.** ⚠️ **Do this BEFORE placing any test order — N21's warning — although C2 shows the destructive path needs `APNS_ENV=production` to be set.**

## E2. What each likely error means

| Error | Meaning | Where the fix lives |
|---|---|---|
| **`no valid "aps-environment" entitlement string found`** | The **running binary** is not entitled for push. ⚠️ **N18 proves the entitlement IS in the signed binary as of the last build — so seeing this means the device is running an OLDER install.** | Rebuild and reinstall |
| **`didFailToRegisterForRemoteNotifications` + a network/timeout description** | APNs was unreachable — captive-portal wifi, or the push socket (TCP 5223) blocked | The network, not the app |
| **`Unregistered` / device not known to APNs** | The token was issued for a **different environment or bundle id** than the one sending | The `APNS_ENV` ↔ entitlement pairing |
| **Permission not granted** | 🔴 **NO ERROR AT ALL — `push.ts:90` returns silently.** The only tell is iOS Settings → HatchGrab → Notifications | The device's Settings; iOS will not re-prompt once denied |
| **`No listeners found for event registration`** | A token arrived and was **dropped**. ✅ **The fix for this is already in `push.ts` (listeners attached and awaited first)** — seeing it again would mean a regression | `lib/native/push.ts` |
| **No push-related line whatsoever** | 🔴 **`registerForPush` never ran** — the device is not bound to a van, or `runSetup` bailed on a fetch failure (A4) | `OperatorDeviceConfig` / the device's van binding |

## E3. ⚠️ Would a Release / TestFlight build behave differently? — **YES, AND IN A WAY THAT CAN DESTROY EVIDENCE**

**READ, the two entitlement files:**

| Configuration | File | `aps-environment` |
|---|---|---|
| **Debug** (Xcode to device) | `ios/App/App/App.entitlements` | **`development`** → a **SANDBOX** token |
| **Release** (TestFlight / App Store) | `ios/App/App/AppRelease.entitlements` | **`production`** → a **PRODUCTION** token |

**Pair those against C2's server default:**

| Build | Token | Server host (`APNS_ENV` unset) | Outcome |
|---|---|---|---|
| **Debug** | sandbox | **sandbox** | ✅ **MATCHED — the correct pairing, and the one you are testing on** |
| **Release / TestFlight** | **production** | **sandbox** | 🔴 **MISMATCH → `BadDeviceToken` → C3's handler NULLS `push_token`** |

> ## 🔴 THE TRAP, SPELLED OUT: **SWITCHING TO TESTFLIGHT WITHOUT SETTING `APNS_ENV=production` IS WORSE THAN THE CURRENT SILENCE.**
> **Today nothing is sent, so nothing is destroyed. On TestFlight against a sandbox host, the FIRST test order rejects the token and NULLS it** — and afterwards *"never registered"* and *"registered, then destroyed"* are indistinguishable, which is precisely what N21 warns about. ⚠️ **The two settings must move together.**
> ✅ **The two-file split itself is correct and is what N18 verified** — one file with `development` referenced by both configurations is the classic *"push works in Xcode, never arrives on TestFlight"* bug, and this project does not have it.

---

# PART F — INTEGRITY

## F1. Byte scan — every file opened, byte-level, never `grep`

**18 files, scanned for NUL and for control bytes below 0x09 plus 0x0B, 0x0C, 0x0E–0x1F:**

| File | Bytes | NUL | Control |
|---|---|---|---|
| `lib/native/push.ts` | 6,829 | 0 | none |
| `lib/apns.ts` | 3,854 | 0 | none |
| `lib/native/notifications.ts` | 4,861 | 0 | none |
| `lib/audio.ts` | 4,472 | 0 | none |
| `components/native/NotificationSettings.tsx` | 5,485 | 0 | none |
| `components/native/OperatorDeviceConfig.tsx` | 18,313 | 0 | none |
| `app/api/orders/submit/route.ts` | 80,055 | 0 | none |
| `app/dashboard/[token]/page.tsx` | 373,446 | 0 | none |
| `app/dashboard/[token]/kds/page.tsx` | 91,554 | 0 | none |
| `capacitor.config.ts` | 6,599 | 0 | none |
| `ios/App/App/capacitor.config.json` | 982 | 0 | none |
| `ios/App/App/Info.plist` | 3,063 | 0 | none |
| `ios/App/App/App.entitlements` | 631 | 0 | none |
| `ios/App/App/AppRelease.entitlements` | 852 | 0 | none |
| `…/PushNotificationsPlugin.swift` | 7,992 | 0 | none |
| `…/PushNotificationsHandler.swift` | 3,496 | 0 | none |
| `.env.local` | 7,571 | 0 | none |
| `docs/reference-manual.md` | 1,496,028 | 0 | none |

✅ **FILES WITH NUL OR CONTROL BYTES: NONE. All 18 clean.** ⚠️ **`.env.local` was scanned as bytes and read for key NAMES only — no value appears anywhere in this report.**

## F2. Byte scan of this report — separate pass, AFTER writing

```
docs/push-registration-report.md   35,014 bytes
  NUL (0x00)                                     : 0
  control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F : none
  distinct non-ASCII classes                     : 13
  U+26A0 = 26, U+FE0F = 26                         : PAIRED
```

✅ **Clean.** Byte-level, never `grep`, run as its own pass after the file was written.

## F3. `git status`, pasted

```
 M app/landing/page.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
 M components/printing/PrintingSettings.tsx
?? docs/device-naming-report.md
?? docs/printing-ui-report.md
?? docs/push-registration-report.md
```

🔴 **EVERY ENTRY EXCEPT THIS REPORT PREDATES THIS TASK** — the first three are the device-naming copy sweep, the fourth is the printing layout move, and the two untracked docs are their reports. ✅ **This diagnosis changed nothing.** ⚠️ **Note that `NotificationSettings.tsx` and `OperatorDeviceConfig.tsx` appear as modified because of the earlier "this device" copy change — that edit touched three strings and no logic, and nothing in this report depends on it.**

---

# PROVENANCE

**READ** — `lib/native/push.ts` and `lib/apns.ts` in full · `components/native/NotificationSettings.tsx` in full · `components/native/OperatorDeviceConfig.tsx:25-70` · the complete push block in `app/api/orders/submit/route.ts` · `lib/native/notifications.ts:29-92` · `app/dashboard/[token]/page.tsx:1162-1168` · `PushNotificationsPlugin.swift:40-62, 184-210` · `PushNotificationsHandler.swift:20-56` · `capacitor.config.ts` plugins block · `ios/App/App/capacitor.config.json` · `Info.plist` key list · both `.entitlements` files · `.env.local` **key names only** · `docs/reference-manual.md` lines 49-54, 3926, 6093, 7135, 8210-8268, 8433-8485 · the call-site greps for `registerForPush`, `pushNotificationReceived`, `notifyNewOrder`, `playNewOrder` · the 18-file byte scan · `git status`.

**INFERRED** — that production's environment is likely also missing `APNS_*` (from §36's record that the `.p8` was never obtained; **the deployed env is not inspectable from here**) · that the four NULL rows mean "never registered" rather than "registered then destroyed" (the destructive path needs `APNS_ENV=production`, which is unset locally) · that a foreground push would show nothing (read from the plugin's `return []`, **not observed on a device**).

**NOT VERIFIED / NOT FOUND** — 🔴 **no database query was run**, so the four NULL rows, the truck's auto-accept setting and the event's `van_id` are taken from the brief and from §36, not re-checked here · 🔴 **`pushNotificationReceived` has NO listener anywhere — "not found" is the result** · 🔴 **no surface exists that reports a registration failure to an operator — "not found" is the result** · 🔴 **`notifyNewOrder` and `playNewOrderAlert` have zero call sites** · 🔴 **`UIBackgroundModes` is absent from `Info.plist`** · **nothing in this report was observed on hardware.**
