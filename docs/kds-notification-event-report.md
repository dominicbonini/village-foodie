# A notification tap lands on a "wrong event" warning — read-only diagnosis

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no database write. 🔴 **No `git stash`,
`checkout` or `restore` — the only git command run was `status`.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 TWO OF YOUR PREMISES DO NOT HOLD, AND THEY CHANGE THE ANSWER

**Stated first because everything below depends on them:**

1. 🔴 **THE NOTIFICATION CARRIES NO `event_id`. It carries an `orderKey` and nothing else** — on APNs
   *and* on FCM. **So Q3's seed collision cannot arise: there is no event id in a tap to collide with
   `seededRef`.**
2. 🔴 **THE TAP HANDLER IS MOUNTED ONLY ON THE DASHBOARD.** The KDS never registers it. **The banner
   you saw is a DASHBOARD surface, not a KDS one.**

---

# 1 — THE BANNER. ONE CANDIDATE MATCHES; THE OTHERS ARE EXCLUDED BY COLOUR OR COPY.

## 🔴 THE MATCH — READ, `app/dashboard/[token]/page.tsx`

```tsx
  const openOrderFromPush=useCallback((orderKey:string)=>{
    setActiveTab('orders')
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const el=document.getElementById(`order-${orderKey}`)
      if(el){el.scrollIntoView({behavior:'smooth',block:'center'});return}
      showToast('That order is not on this board - check the event','error')
    }))
  },[showToast])
```

**Verbatim string:** `That order is not on this board - check the event`
**Condition:** the tap handler ran, and after two animation frames
`document.getElementById(\`order-${orderKey}\`)` returned **null**.

**READ — it renders RED, and at the BOTTOM:**

```tsx
    <div className="fixed bottom-6 left-4 right-4 max-w-sm mx-auto z-50 flex flex-col gap-2">
```
```tsx
        <div key={t.id} className={`rounded-xl px-4 py-3 text-sm font-bold shadow-xl flex items-center gap-3 ${t.action?'justify-between':'justify-center text-center'} ${t.type==='success'?'bg-green-600 text-white':'bg-red-600 text-white'}`}>
```

✅ **`fixed bottom-6`, `bg-red-600 text-white`, and the copy names the event. That is a red banner at
the bottom saying something about the wrong event.**

⚠️ **AND THE CODE ANTICIPATED IT — the comment above the handler says so in advance:**

```
  // ⚠️ THE ORDER MAY NOT BE ON THIS BOARD. It can belong to a different event, or have been confirmed and
  // cleared from another device, or the board may not have polled yet. `document.getElementById` then
  // returns null and this MUST NOT leave the operator on a blank screen — so the tab switch stands on its
  // own and a toast names the order rather than an error appearing.
```

## Every other red/bottom surface, and why each is excluded

| Surface | Copy | Excluded because |
|---|---|---|
| **KDS `kdsToast`** | "Event started" · "Event finished" · "Event cancelled" · `err.message \|\| 'Failed'` | 🔴 **IT IS NEVER RED — READ: `bg-green-600 text-white`, hardcoded.** Even its failure path renders green |
| KDS `showToast(…,'error')` — reject | `Failed to reject` | red and bottom, **but names no event**, and requires tapping Reject |
| KDS `showToast(…,'error')` — buzzer | `Could not give buzzer N to …` | red and bottom, **buzzer copy** |
| KDS `showToast(err.message \|\| 'Failed','error')` | a server message | ⚠️ **red and bottom, and the copy is NOT fixed** — see the caveat below |
| `OfflineBanner` conflict bars | `⚠ PAYMENT NOT RECORDED` · `⚠ … update didn't sync, needs review` | red, **but they render at the TOP of the page, not the bottom**, and concern sync, not events |
| KDS fatal | `{error ?? 'Truck not found'}` | a full-screen state, not a banner |

⚠️ **THE ONE I CANNOT FULLY EXCLUDE READ-ONLY: `showToast(err.message || 'Failed', 'error')` in the
KDS's `handleAction`.** It is red, at the bottom, and its text is whatever the server returned — so a
server error mentioning an event would match your description. 🔴 **BUT it requires the operator to
have TAPPED A CARD BUTTON, and you describe the banner appearing on the tap of a NOTIFICATION.**
**EXECUTED — no server error string on that route mentions an event: the reachable messages are
`Order not found`, `conflict`, and the payment guards.**

# ✅ SO: ONE STRING NAMES AN EVENT, IS RED, IS AT THE BOTTOM, AND FIRES WITHOUT ANY OPERATOR TAP.

---

# 2 — THE DEEP LINK, END TO END

## What the payload carries — 🔴 `orderKey`, AND NOTHING ELSE

**READ — APNs, `lib/apns.ts`:**

```ts
    const body = JSON.stringify({
      aps: { alert: { title: 'New order to confirm', body: `Order ${payload.orderNumber} — ${payload.truckName}` }, sound: 'default', 'content-available': 1 },
      type: 'order_pending', orderKey: payload.orderKey,   // custom keys → tap deep-link
    })
```

**READ — FCM, `lib/fcm.ts`, the same two keys:**

```ts
            data: { type: 'order_pending', orderKey: payload.orderKey },
```

# 🔴 NO `event_id`. NO `van_id`. NO `truck_id`. THE ONLY ROUTING FACT IN A TAP IS THE ORDER KEY.

## What reads it — READ, `lib/native/push.ts`

```ts
        PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, unknown> } }) => {
          const data = action?.notification?.data
          const orderKey = data && typeof data.orderKey === 'string' ? data.orderKey : null
          if (orderKey && onOpenOrder) onOpenOrder(orderKey)
        }),
```

✅ **It reads `data.orderKey` and ignores every other key, including `type`.**

## Who supplies `onOpenOrder` — 🔴 ONE CALL SITE, ON THE DASHBOARD

```tsx
      <DeviceSetupGate token={token} onOpenOrder={openOrderFromPush} />
```

✅ **EXECUTED — `DeviceSetupGate` has exactly ONE mount in the whole repository, at
`app/dashboard/[token]/page.tsx:2783`. The KDS does not mount it and passes no `onOpenOrder`.**

## What it does with the order key

```tsx
    setActiveTab('orders')
```

🔴 **THAT IS THE WHOLE OF THE NAVIGATION. It switches a TAB on a page that is already mounted. It does
not route, it does not change event, and it never reads or writes `selectedEventId`.**

## 🔴 COLD LAUNCH vs RESUME — REPORTED SEPARATELY, AND THEY DIFFER

| | Cold launch (app killed) | Resume (backgrounded — **your case**) |
|---|---|---|
| Is the listener attached when the tap fires? | 🔴 **ALMOST CERTAINLY NOT.** It is attached by `registerForPush`, called from a React effect in `DeviceSetupGate`, which cannot run until the remote page has loaded. **The tap event fires at launch, before that** | ✅ **YES — attached from the earlier session, and `listenersAttached` is module-level so it survives** |
| Is the event replayed? | 🔴 **NO — READ, the file's own header:** *"A Capacitor plugin event FIRES WHETHER OR NOT ANYONE IS LISTENING … notifyListeners() with an empty map logs 'No listeners found' and DROPS the payload. There is no queue and no replay"* | n/a |
| Result | ⚠️ **the deep link is silently lost; the app opens on the last screen and NO banner appears** | ✅ **`onOpenOrder` fires** |

🔴 **INFERRED, NOT EXECUTED: that the cold-launch event is dropped. It follows from the quoted "no queue
and no replay" plus the effect ordering, but I did not instrument a launch.** ✅ **The distinction
matters and matches your observation — you saw the banner on a RESUME.**

---

# 3 — THE SEED COLLISION

# 🔴 IT CANNOT ARISE. THERE IS NO `event_id` IN A NOTIFICATION TAP.

**Your three scenarios all begin *"when a tap supplies an `event_id`"*. ✅ **EXECUTED: no tap ever
does.** The only `event_id` the KDS ever receives is a URL query parameter on the dashboard→KDS
handoff — READ:**

```tsx
  const seedEventId = searchParams.get('event_id') ?? ''
```

**and the latch that holds it — READ:**

```tsx
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
```

**Answering each anyway, for the `openKDS` handoff which IS the path that can supply one:**

| Scenario | What happens | Produces the banner? |
|---|---|---|
| **(a)** an id differing from a latched `selectedEventId` | 🔴 **THE LATCH WINS ABSOLUTELY.** `if (seededRef.current) return` is the first line and `seededRef` is never cleared. A later id changes nothing | ✗ — and no banner exists on the KDS to produce |
| **(b)** an id not in the client's `events` | `events.some(...)` is false ⇒ the guard falls through ⇒ `pickDefaultEventByTime` **overwrites** it. ⚠️ **EXCEPT when `!events.length`, where the function returns before latching and the bad id is held** | ✗ |
| **(c)** an id not in the server's `todayEvents` | 🔴 **THE REQUEST SILENTLY RETURNS A DIFFERENT EVENT.** The KDS never sends `date`, so the server honours `event_id` only within today; outside it, the id is ignored rather than refused | ✗ — **the symptom is an EMPTY BOARD under a header naming an event, not a banner** |

# ✅ NONE OF THE THREE PRODUCES THE OBSERVED BANNER, BECAUSE THE BANNER IS NOT ON THE KDS AND THE TAP CARRIES NO EVENT.

🔴 **`seededRef` and `setSelectedEventId` ARE UNTOUCHED BY THE TAP PATH ENTIRELY** — `openOrderFromPush`
contains neither identifier. **Reporting the interaction as instructed: there is none.**

---

# 4 — THE VAN AXIS

# 🔴 THERE IS NO CHECK. THE KDS NEITHER REFUSES NOR WARNS ON A VAN MISMATCH.

**EXECUTED — every `van_id` use on the KDS is a PARAMETER, never a comparison:**

```tsx
  const vanId = searchParams.get('van_id') ?? ''
```
```tsx
      if (vanId) params.set('van_id', vanId)
```

**and server-side it is a FILTER, not a gate — READ, `app/api/dashboard/route.ts`:**

```ts
    // Van KDS: show orders for this van OR unassigned orders (van_id null appears on all vans)
      activeOrdersQuery = activeOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
```

⚠️ **So a disagreement between `van_devices.van_id` and `truck_events.van_id` produces neither a refusal
nor a warning — it produces FEWER ORDERS, silently.** ✅ **There is no string anywhere that reports a
van mismatch to an operator.**

⚠️ **AND ON THIS DEVICE IT IS NOT REACHABLE ANYWAY:** you established by query that the two `van_devices`
rows and the event both carry `8e38901e-…`. ✅ **A matched van cannot produce a mismatch symptom.**
🔴 **NOTE THE ASYMMETRY THAT DOES BITE: the KDS's `van_id` comes from the URL query, not from
`van_devices` — so the device's bound van and the van the KDS is scoped to are separate facts that
nothing reconciles.** **READ. Not the cause here.**

---

# 5 — WHICH SCREEN

# 🔴 THE TAP DOES NOT ROUTE AT ALL. IT ACTS ON WHATEVER SCREEN IS ALREADY MOUNTED.

**There is no `router.push` in the tap path** — EXECUTED: `openOrderFromPush` contains only
`setActiveTab`, two `requestAnimationFrame`s, `getElementById`, `scrollIntoView` and `showToast`.

| | What decides it |
|---|---|
| **Resume** | 🔴 **WHATEVER SCREEN THE APP WAS BACKGROUNDED ON.** The WebView is not reloaded |
| **Cold launch** | `/app`'s landing routes by `getLastScreen() ?? device.default_screen` — READ: `return go(screen === 'kds' ? \`/dashboard/${t.dashboard_token}/kds\` : \`/dashboard/${t.dashboard_token}\`)`. ⚠️ **The notification's intent is not consulted; the tap payload never reaches this file** |

## ✅ AND THE BANNER IS A DASHBOARD-ONLY SURFACE

🔴 **For the banner to have appeared, the DASHBOARD must have been the mounted screen** — it owns
`openOrderFromPush`, it owns the `ToastStack` that renders it, and the KDS mounts neither the handler
nor `DeviceSetupGate`.

⚠️ **ONE INFERRED EDGE I CANNOT EXCLUDE READ-ONLY.** `listenersAttached` and the Capacitor listener are
MODULE-LEVEL, and `AppLink` soft-navigates, so a session that visited the dashboard and then moved to
the KDS keeps a listener closed over the **unmounted** dashboard's `setActiveTab`/`showToast`.
**INFERRED: a tap in that state would call into an unmounted component — no dashboard `ToastStack` is
rendered, so no banner would be visible. It would be silent, not wrong.** **Not executed; stated
because it is the only way a tap could touch a session that is "on the KDS".**

---

# 6 — RECOVERY

**Nothing is broken to recover FROM: the tap already did its only navigation.**

```tsx
    setActiveTab('orders')
```

⚠️ **The operator is left on the dashboard's Orders tab with a red toast that auto-dismisses.** ✅ **The
board itself is unchanged and functional.**

**Is there a control to reach the named event? 🔴 THE TOAST NAMES NO EVENT — it says "check the event",
without saying which.** ✅ **But the dashboard's event selection is NOT latched, unlike the KDS's:**

```tsx
  const[selectedEventId,setSelectedEventId]=useState<string|null>(null)
```
```tsx
      if(owned){console.log('[auto-select] priority 0 url param:',owned.id);setSelectedEventId(owned.id);return}
```

✅ **A four-priority auto-select with no `seededRef`, so the operator can switch event freely and the
order will appear if it belongs to another one.** ⚠️ **On the KDS the latch WOULD make a reload the only
route — but the KDS is not the surface this happens on, so that constraint is not engaged.**

🔴 **WHAT NO CONTROL DOES: jump to the event the order actually belongs to. Nothing in the tap path or
the toast resolves the order's `event_id`, so finding it is a manual hunt through the event picker.**

---

# 7 — THE ONE CHEAPEST CHECK

**The leading candidate is the dashboard's `openOrderFromPush` toast. The alternatives are (i) the
KDS's generic `err.message` error toast and (ii) something not in this repository.**

# 🔴 THE CHECK: TAP THE NEXT NOTIFICATION AND READ THE BANNER'S EXACT WORDS.

✅ **It is free, needs no tooling, and is decisive** — the candidate strings share no phrasing:

| If it reads | It is |
|---|---|
| `That order is not on this board - check the event` | 🔴 **CONFIRMED** — the dashboard's push handler, and the order belongs to another event or had not polled yet |
| `Failed to reject` / a buzzer sentence / a server message | ⚠️ **NOT the tap** — something the operator tapped on a card |
| anything else | 🔴 **not in this repository** — and worth capturing verbatim |

⚠️ **A second observation costs nothing and settles Q5 at the same time: note WHICH SCREEN the app was
on when the notification arrived. The dashboard is the only screen that can produce this banner.**

**NOT PERFORMED. RECOMMENDING NOTHING.**

---

# 🔴 VERIFICATION

| Claim | Method |
|---|---|
| The payload carries only `type` and `orderKey`, on both transports | ✅ **EXECUTED** — both senders read |
| The listener reads only `data.orderKey` | ✅ **EXECUTED** |
| `DeviceSetupGate` has exactly one mount, on the dashboard | ✅ **EXECUTED** — repo-wide scan |
| The KDS passes no `onOpenOrder` | ✅ **EXECUTED** |
| `ToastStack` is `fixed bottom-6` and errors are `bg-red-600` | ✅ **EXECUTED** |
| `kdsToast` is always green | ✅ **EXECUTED** — one hardcoded className |
| No van-mismatch check exists | ✅ **EXECUTED** — every `van_id` use inspected on both sides |
| `openOrderFromPush` touches neither `seededRef` nor `selectedEventId` | ✅ **EXECUTED** |
| The dashboard's event selection is unlatched | ✅ **EXECUTED** |
| **That THIS banner is what you saw** | 🔴 **INFERRED.** The wording was not captured; the match is by colour, position, copy and trigger. **Q7 is the check that would settle it** |
| **That a cold-launch tap is dropped** | 🔴 **INFERRED** — from the "no queue and no replay" note plus effect ordering. **Not instrumented** |
| **The stale-closure edge on the KDS** | 🔴 **INFERRED** — not executed |
| **What the operator's screen actually was** | ⚠️ **CANNOT BE DETERMINED READ-ONLY** |

🔴 **NOTHING WAS OBSERVED RUNNING. No notification was sent, no device was touched, no log was opened,
no query was run.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. A SEPARATE pass over this report AFTER writing. It is the only file
this task wrote.**

```
  docs/kds-notification-event-report.md   (SEPARATE PASS)    18,676  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 39 | 0 | 39 |
| U+2705 WHITE HEAVY CHECK MARK | 33 | 0 | 33 |
| **U+26A0 WARNING SIGN** | **20** | **16** | 🔴 **4** |
| U+2717 BALLOT X | 3 | 0 | 3 |

# 🔴 FOUR BARE U+26A0 — TWO STRINGS, EACH QUOTED TWICE, BOTH `OfflineBanner`'s OWN.

**Every warning sign I wrote as prose is paired — 16 of 16. The bare ones are two strings, each
appearing twice — once in the exclusion table's `OfflineBanner` row and once quoted again here —
both being that component's own conflict-bar copy:
`⚠ PAYMENT NOT RECORDED` and `⚠ … update didn't sync, needs review`.** ✅ **EXECUTED —
`components/native/OfflineBanner.tsx` measures `U+26A0 n=4 paired=2 bare=2`, and its two bare glyphs
are exactly those strings.** ⚠️ **Pairing them here would have misquoted a banner this report is
comparing against the observed one — the copy is the whole basis of the exclusion.**

✅ **The report's total `U+FE0F` count is 16, which exactly accounts for the 16 paired warning signs and
leaves none attached to any other base.** ✅ **The three unpaired bases are internally consistent — 0 of
39, 0 of 33, 0 of 3 — so no base is split across two renderings.**

## `git status --porcelain`

```
$ git status --porcelain
?? docs/kds-notification-event-report.md
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/kds-notification-event-report.md`** | 🔴 **THIS PASS — the only entry, and the only file written** |

🔴 **THE TREE WAS COMMITTED BETWEEN TASKS — NOT BY ME.** When this pass began the working tree carried
five modified and seven untracked entries from the APNs, reject-parity and axes-split tasks; a new
commit (`2b6c090 notification fix`) has since absorbed all twelve, which is why the list is one line
rather than thirteen. ✅ **This pass ran no git command other than `status`, `log` and `show`, and wrote
no source file.**
