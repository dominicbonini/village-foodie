# Background order refresh — design and plan

**READ-ONLY. No files changed, no code written, nothing deployed, no SQL, no migrations.**

---

## VERIFICATION

**SOURCE READ + `grep`/`node` EXECUTION** to enumerate installed plugins and native project keys.
🔴 **I have not run the app, not backgrounded it, not sent a push, and not measured battery or data.**
Every platform statement below is marked **DOCUMENTED** (vendor behaviour) or **READ** (this repo).

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · What happens today

| | |
|---|---|
| **Poll interval** | **60,000 ms** — `app/dashboard/[token]/page.tsx:1332`, `setInterval(()=>fetchAllRef.current(),60000)`. Gated on `truck?.id`, so it starts only after a first successful load |
| **What it fetches** | `GET /api/dashboard?token=…&event_id=…&date=…` — the whole payload (orders, truck, config, capacity). It is the same `fetchAll` every other trigger uses |
| **Realtime** | An `orders` channel and a `trucks` channel are subscribed in the same effect (`:1334-1335`) |
| **Read timeout** | 10s client-side abort (`:830`, `READ_TIMEOUT_MS`) |

### Backgrounded — what is and is not current

- 🔴 **Nothing is current.** A backgrounded WebView suspends `setInterval` and the realtime WebSocket
  drops. The repo says so itself in `lib/native/useHeartbeat.ts:13`: *"a backgrounded WebView suspends
  setInterval, so the van goes stale"*.
- **No background work of any kind runs.** There is **no background-fetch plugin installed** (§2) and
  **no `pushNotificationReceived` listener** (§3), so an arriving push does no JS work at all.

### 🔴 On resume — THE DASHBOARD DOES NOT REFETCH

**`onAppResume` exists** (`lib/native/app.ts:6`) and is used by **three** consumers — `useHeartbeat.ts:75`,
`usePrinting.ts:145`, `AppLockGate.tsx:49`. **`app/dashboard/[token]/page.tsx` is not one of them.**

> **So on opening the app the operator waits for the suspended 60s interval to tick.** ⚠️ **Exactly when
> that first tick lands after resume is platform behaviour I have NOT measured** — a suspended interval
> may fire immediately or on its original schedule. **Either way, nothing is triggered by the resume
> itself.**

### What background fetch adds beyond a resume refetch

> 🔴 **This is the question that decides the whole design, and the honest answer is: LESS THAN IT LOOKS,
> UNLESS THE BACKEND IS DOWN AT THE MOMENT OF OPENING.**

A resume refetch fixes "the board is 60 seconds stale". **It does nothing when the backend is degraded at
that moment — the stated goal.** Only data *already on the device* survives that. **So:**

- **A resume refetch is the prerequisite and it is nearly free** (§8, web change).
- **Background delivery is the only thing that makes the board populated when the backend is down at
  open.** That is its entire justification.

---

## 2 · Platform mechanisms — what is guaranteed, permitted, and impossible

**Installed Capacitor plugins (READ from `package.json`):** `app`, `core`, `ios`, `android`,
`local-notifications`, `network`, `preferences`, `push-notifications`, `status-bar`, `keep-awake`,
`bluetooth-le`, `biometric-auth`.

> 🔴 **THERE IS NO BACKGROUND-FETCH PLUGIN.** No `@capacitor/background-runner`, no
> `capacitor-background-fetch`. **Any timer-based background work needs a NEW dependency and a native
> release.**

| Mechanism | Guarantees | Merely permits | Minimum interval | Disabled by |
|---|---|---|---|---|
| **iOS silent push** (`content-available:1`, `apns-push-type: background`) | 🔴 **NOTHING.** DOCUMENTED: iOS may throttle, delay, coalesce or drop them entirely | A wake *"when the system decides"* | No floor, but budgeted per app per day | **Low Power Mode** · **Background App Refresh off** (a per-app user switch) · force-quit from the app switcher (🔴 **kills silent push until the app is opened again**) · Screen Time / Focus |
| **iOS BGAppRefreshTask** | 🔴 **NOTHING** | An opportunistic window the scheduler picks | **No guaranteed minimum**; commonly hours, tightened by usage patterns | Same list, plus a low battery |
| **Android data-only FCM, `priority: high`** | Delivery attempted promptly when reachable | Waking a doze-idle device | None | **Doze** (batched to maintenance windows) · **App Standby buckets** · 🔴 **per-OEM battery managers — Samsung, Xiaomi, Huawei, Oppo kill background work aggressively and are not configurable from the app** · force-stop |
| **Android WorkManager periodic** | Eventual execution | — | **15 minutes**, and DOCUMENTED as a floor, not a promise | Doze, OEM restrictions |

### 🔴 What this app can do TODAY, and cannot

| | Finding |
|---|---|
| **APNs payload already sets `'content-available': 1`** | `lib/apns.ts:171` — **READ** |
| 🔴 **But `apns-push-type` is `'alert'`** | `lib/apns.ts:186` — **not `background`** |
| 🔴 **AND `UIBackgroundModes` IS ABSENT FROM `Info.plist` ENTIRELY** | **READ** — the plist has 19 keys and `UIBackgroundModes` is not among them |
| **Consequence** | 🔴 **iOS CANNOT wake this app for a background push today. The `content-available` flag is inert without the `remote-notification` background mode.** Adding it edits `Info.plist` → **native release** |
| **Android FCM** | `lib/fcm.ts:163-164` sends `android.priority:'high'` with **both** a `notification` block **and** `data:{type:'order_pending', orderKey}`. ⚠️ **A message carrying a `notification` block is handled by the system tray when backgrounded and does NOT reliably invoke the app's JS** — DOCUMENTED FCM behaviour. **A data-ONLY message is the one that wakes the app** |
| **Android manifest** | ⚠️ **The app manifest shows only `INTERNET`, but that is NOT evidence of absence** — `@capacitor/push-notifications` merges its own `AndroidManifest.xml` (confirmed present in `node_modules`), which supplies the FCM service |

### 🔴 WHAT MUST NOT BE PROMISED

> **On neither platform can this feature be described as "your orders will be there". iOS may drop every
> silent push; Android OEM battery managers may kill the app outright. This is BEST-EFFORT, and §7's
> wording has to say so.**

---

## 3 · The design

**Recommended: drive it from the push that already exists, not from a new timer.**

### Layer A — resume refetch (no release, no plugin)

`onAppResume(() => fetchAllRef.current())` in the dashboard. **Closes the 60s-stale case.** Prerequisite,
not the feature.

### Layer B — a device-side order inbox, fed by push

| | |
|---|---|
| **What it requests** | 🔴 **Nothing, ideally.** Put the order's display fields **in the push `data` payload** — `orderKey`, number, items summary, slot, placed_at. **A payload that carries the order needs no network at all on receipt**, which is the only version that works when the backend is degraded. ⚠️ **APNs/FCM payloads cap at ~4KB — a large order may not fit, so the design must tolerate a truncated entry** |
| **Fallback** | If the payload is partial, a **single** `GET /api/dashboard` with a **short (5s) timeout, no retry** |
| **How much it stores** | A bounded inbox — **the last N (say 50) orders, oldest evicted.** It is a seed for the board, not a database |
| **Where** | 🔴 **`@capacitor/preferences`** — the same store as the outbox and the menu snapshot, chosen because WKWebView evicts localStorage/IndexedDB under pressure. **Survives a cold kill** |
| **Reconciliation with a foreground fetch** | 🔴 **THE SERVER ALWAYS WINS.** The inbox seeds the board **only** when `fetchAll` has not yet succeeded this session. The moment a live `/api/dashboard` returns, its `orders` array replaces the seed entirely. ⚠️ **This must NOT go through `mergeOrders`** — that guard resolves by `updated_at` alone and would let a push-seeded row beat a fresher server row (the 1 September fault) |
| 🔴 **If the outbox holds unsent writes** | **The inbox must never overwrite an order the outbox has a pending op for.** The outbox's optimistic local state is the operator's own action and outranks a push. Filter the seed by `order_key` against `listOps()` before applying |

### Why not a background timer

**A new plugin, a native release, weaker guarantees than push, and a battery cost for polling that mostly
returns nothing.** **Push already fires exactly when there is something to know.**

---

## 4 · 🔴 Interaction with the degraded state — no amplification

| Rule | How it is enforced |
|---|---|
| **A background failure must NOT mark the backend degraded** | `degradedSince` is **foreground UI state** (`page.tsx:289`), set only in `fetchAll`'s branches. **The background path must not import or touch it.** A banner the operator never saw being set is not a signal — it is a stale claim on next open |
| **No retry storm** | 🔴 **ONE attempt, no retry, no backoff loop.** If the fallback fetch fails, **the inbox simply keeps what it has** and the next push is the next chance |
| **Short deadline** | **5s** abort — shorter than the foreground 10s, because a background task has no operator waiting and a long hang burns the OS budget |
| **No concurrency with the foreground** | The app is backgrounded; the foreground poll is suspended. On resume, Layer A's refetch is subject to the **existing in-flight guard** (`page.tsx:948-951`), so a background fetch completing as the app opens cannot produce two concurrent reads |
| **The 1 September amplification cannot recur** | That was **110 concurrent foreground clients at 60s with no in-flight guard**. This is **one device, event-driven, one attempt.** ⚠️ **But `/api/dashboard` is capped at 30s while the four other routes are not** — this design touches none of them |

---

## 5 · Battery and data — at the frequency proposed

**The proposed frequency is NOT a frequency. It is one wake per incoming order.**

| | Estimate |
|---|---|
| **Payload-only path** | **Zero network initiated by the device.** The push itself is a few hundred bytes, already being sent today |
| **Fallback fetch** | One `/api/dashboard` — ⚠️ **I have NOT measured its size.** It carries orders, truck config, capacity and menu-adjacent config, so **tens to low hundreds of KB is the honest range, unmeasured** |
| **A busy service, 60 orders** | 60 wakes. If every one fell back to a fetch: **60 × payload**. **Materially more than the foreground poll only if the app is backgrounded for most of the service** |
| **Battery** | Each wake is a radio+CPU burst. 🔴 **Unmeasurable from here.** The mitigation is that a wake happens **only when an order actually arrives** |
| ⚠️ **The real cost is not battery** | It is **iOS's silent-push budget**: spend it on 60 wakes in an hour and iOS will start dropping them. **This is an argument for the payload-only path and against the fallback fetch** |

---

## 6 · Plan gating — confirmed by reading, not assumed

**Where the gate lives:** `lib/features.ts` — `Feature` union (`:3`), `PRO_FEATURES` (`:32`),
`MAX_FEATURES` (`:54`), `TRIAL_FEATURES` (`:72`), `PLAN_FEATURES` (`:75`), `canAccess()` (`:110`).

### ✅ Your warning is correct, and the file already says so

**`lib/features.ts:72` — READ:**

```ts
const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]
```

**And `:60-61` carries the warning verbatim:**

> *"🔴 THIS IS THE PLAN HALF OF A TWO-PART GATE AND IT IS THE WEAKER HALF. TRIAL_FEATURES below is
> `[...MAX_FEATURES]`, so adding it here also grants it to plan 'trial', 'demo' and 'tester'"*

**`PLAN_FEATURES` (`:88-96`) confirms the spread:** `trial: new Set(TRIAL_FEATURES)`,
`tester: new Set(MAX_FEATURES)`, `demo: new Set(TRIAL_FEATURES)`.

> ✅ **So adding `background_order_sync` to PRO_FEATURES + MAX_FEATURES grants it immediately to
> `pro`, `max`, `trial`, `tester` and `demo`.** ⚠️ **I cannot verify both live trucks are `plan='trial'`
> — that needs SQL, which is forbidden here. I take it from you; if true, both get it on deploy.**

**What a lower plan (`starter`) sees:** `canAccess` returns false. **The operator setting in §7 should not
render at all** rather than render disabled — a switch that cannot be moved invites a support message.

⚠️ **Two further sites, from the same comment:** a `ROW_FEATURE_MAP` entry for the pricing compare table
(`lib/plan-features.ts`) — and the parity checker **passes vacuously on a row it has no entry for**
(`features.ts:68`), **so a clean run would prove nothing here.**

---

## 7 · The operator setting

| | |
|---|---|
| **Where** | **Manage → Settings**, beside the existing notification controls — the same place the operator already reasons about what the app does when they are not looking at it. **Not** on the dashboard: it is configured once, not during service |
| **Default** | 🔴 **ON** for eligible plans. It costs nothing when no orders arrive, and an operator who has to discover a switch to get the benefit will not find it |
| **Wording** | See below |

> **Keep recent orders on this device**
> **When an order comes in while the app is closed, we'll try to save it to this device so it's already
> here when you open up — useful if the connection is poor.**
> **Your phone or tablet decides whether that's allowed, so it won't always happen. Orders always load
> when you open the app.**

**Why it is worded that way:**

- 🔴 **"we'll try"** and **"won't always happen"** — the platform does not guarantee delivery (§2), and
  the manual already records a shipped defect from promising something not durably true.
- **"Your phone or tablet decides"** — names the real cause (Background App Refresh, Low Power Mode, an
  OEM battery manager) without jargon the operator cannot act on.
- 🔴 **"Orders always load when you open the app"** — the reassurance that matters. **This is a bonus
  layer, and the sentence says so without saying "bonus layer".**
- **No "sync", no "background fetch", no "push".**

---

## 8 · Native release vs web change — file by file

### Ships as a WEB change (a Vercel deploy — instant on both shells)

| File | Change |
|---|---|
| `app/dashboard/[token]/page.tsx` | **Layer A** — `onAppResume(() => fetchAllRef.current())`; seed the board from the inbox on first load |
| `lib/native/push.ts` | Add a **`pushNotificationReceived`** listener (only `pushNotificationActionPerformed` exists today, `:154`) |
| **new** `lib/native/orderInbox.ts` | The bounded Preferences-backed inbox |
| `lib/fcm.ts` | Send a **data-only** message (or a second data-only alongside the alert) |
| `lib/apns.ts` | `apns-push-type: 'background'` for the silent variant |
| `lib/features.ts`, `lib/plan-features.ts` | The feature key + compare row |
| `app/manage/[token]/page.tsx` | The Settings toggle |

🔴 **All of `lib/native/*` is TypeScript served from production into the WebView — it ships as a web
deploy, NOT a release.**

### 🔴 Requires a NATIVE RELEASE

| File | Change | Platform |
|---|---|---|
| **`ios/App/App/Info.plist`** | 🔴 **Add `UIBackgroundModes` → `remote-notification`. THE KEY IS ABSENT TODAY** — without it iOS ignores `content-available` entirely | **iOS only** |
| `ios/App/App/AppDelegate.swift` | Possibly a `didReceiveRemoteNotification` completion handler | iOS |
| — | **Android needs NO app-manifest change** — the push plugin merges its own FCM service. ⚠️ **Unverified that background JS runs; §9 T3** | Android |

> ✅ **THE ANDROID HALF MAY BE SHIPPABLE WITHOUT A NEW BINARY.** That matters, because:

### 🔴 The cost of replacing the Android binary mid-review

**A Play review is IN PROGRESS.** Uploading a new build:

- **Replaces the submission** — the in-flight review is superseded and **the queue restarts from zero**.
- Any review progress or partial approval is lost; a fresh binary can draw fresh scrutiny.
- ⚠️ **A new `UIBackgroundModes`-equivalent is not needed on Android, so there is no reason to touch it.**

> **RECOMMENDATION: ship Layer A + the Android half as a WEB DEPLOY now; hold the iOS `Info.plist` change
> for the next natural iOS release. Do not touch the Android binary while it is in review.** ⚠️ **This
> deliberately leaves iOS without background delivery until then — say so rather than shipping a setting
> that does nothing on an iPad.**

---

## 9 · Verification — device by device, with the failing cases

### 🔴 How to prove a background fetch ACTUALLY RAN, not that the code exists

**The whole point of this section. Code existing proves nothing.**

| # | Device | Test | Pass condition |
|---|---|---|---|
| **T1** | **Android tablet** | Background the app. Place a customer order. **Wait 2 minutes. Do not open the app.** Then open it **with the device in airplane mode** | 🔴 **The order is on the board.** If it is not, background delivery did not run — regardless of what the code says |
| **T2** | Android | Repeat T1 but inspect **before** opening: `adb logcat \| grep -i "hg\|fcm\|push"` | A receive log line **timestamped while the app was backgrounded** — 🔴 **the timestamp is the proof, not the presence of the line** |
| **T3** | Android | The same, with the app **force-stopped** from Settings | ⚠️ **Expected to FAIL.** Establishes the boundary so it is documented, not discovered in service |
| **T4** | Android | The same on a **battery-restricted** profile (Settings → App → Battery → Restricted) | Expected to fail. **This is the OEM case §2 warns about** |
| **T5** | **iPad** | Same as T1 **before** the `Info.plist` change | 🔴 **Expected to FAIL — no `UIBackgroundModes`.** Proves the plist is the blocker, so the release is justified by evidence |
| **T6** | iPad | After the plist change, same test | Order present. Then repeat in **Low Power Mode** and with **Background App Refresh OFF** — **both expected to fail**, and that is what §7's wording is for |
| **T7** | Either | Background, place **20 orders**, open | Inbox is bounded (no unbounded growth); board correct; ⚠️ **watch for iOS dropping later pushes — the budget case** |
| **T8** | Either | Queue an outbox write, background, receive a push for **that same order**, open | 🔴 **The operator's own pending action is NOT overwritten** (§3) |
| **T9** | Either | Background with the backend **returning 503**, then open | Board seeded from the inbox; 🔴 **`degradedSince` NOT pre-set from the background attempt** (§4) |

### What a laptop settles

The inbox module's bounds and eviction, the `order_key` filter against `listOps()`, the plan gate,
the copy, and that the seed never runs after a successful `fetchAll` — **all unit-testable in the
harness already built for the outbox and the menu snapshot.**

---

## What I could not establish

1. 🔴 **Any runtime behaviour.** **No app run, no push sent, no device.** Every platform claim is
   documented vendor behaviour, not observation.
2. 🔴 **Whether Android background JS actually runs on receipt** in this shell. **T1-T3 decide it, and the
   whole Android half rests on it.**
3. **Whether both live trucks are `plan='trial'`** — needs SQL, forbidden here. **Taken from you.**
4. **The size of an `/api/dashboard` payload**, so §5's data figures are a range, not a measurement.
5. **When a suspended `setInterval` first fires after resume** — which decides how much Layer A actually
   adds. **Measurable on-device in minutes.**
