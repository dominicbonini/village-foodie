# One notification tap, six toasts — read-only diagnosis

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no database write. 🔴 **No `git stash`,
`checkout` or `restore` — the only git commands run were `status` and `log`.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 TWO INDEPENDENT DEFECTS, AND YOU NEED BOTH TO GET SIX RED BARS

| | |
|---|---|
| **WHY SIX** | 🔴 **SIX LISTENERS.** The registration effect has **no cleanup**, unstable dependencies, and a module latch that is set **after an await** — so concurrent calls each attach a full listener set. **One tap invokes the handler N times.** |
| **WHY IT FAILED AT ALL** | 🔴 **THE CARD WAS NOT YET IN THE DOM.** The push is what tells the app the order exists; the board's `orders` state predates it, and the lookup runs **~32ms** after the tap. It arrives on the next poll — **after** the toast, which is why you then saw it on screen. |

⚠️ **AND ONE OF YOUR HYPOTHESES IS REFUTED: the DOM id uses `order_key`, the same identifier the payload
carries. There is no `id`-versus-`order_key` mismatch.** Details in Q3.

---

# 1 — 🔴 LISTENER ACCUMULATION. CONFIRMED. THE EFFECT HAS NO CLEANUP.

**READ — `components/native/OperatorDeviceConfig.tsx`, the effect and its callback:**

```tsx
  }, [token, onOpenOrder])

  useEffect(() => { void runSetup() }, [runSetup])
```

# 🔴 NO CLEANUP FUNCTION. THE EFFECT RETURNS NOTHING.

**READ — and `runSetup` calls `registerForPush` on three of its paths:**

```tsx
    if (device && device.van_id) { void registerForPush(token, onOpenOrder); setLoading(false); return }
```
```tsx
      if (saved) void registerForPush(token, onOpenOrder)
```
```tsx
    if (saved) { void registerForPush(token, onOpenOrder); setNeedsSetup(false) }
```

## Why the effect re-runs — the dependency chain is unstable at its root

| Link | Stable? |
|---|---|
| `useEffect(..., [runSetup])` | follows `runSetup` |
| `runSetup = useCallback(..., [token, onOpenOrder])` | follows `onOpenOrder` |
| `onOpenOrder` = `openOrderFromPush = useCallback(..., [showToast])` | follows `showToast` |
| **`showToast`** — READ, `lib/useToasts.ts` | 🔴 **NOT MEMOISED** |

```tsx
  const showToast: ShowToast = (msg, type = 'success', opts) => {
```

🔴 **A PLAIN ARROW, RE-CREATED ON EVERY RENDER OF THE DASHBOARD. So `openOrderFromPush` is new every
render, `runSetup` is new every render, and the effect fires on EVERY DASHBOARD RENDER.**

## Does the plugin's `addListener` handle get removed? — 🔴 NO. IT IS NOT EVEN CAPTURED.

**READ — `lib/native/push.ts`:**

```ts
    if (!listenersAttached) {
      await Promise.all([
        // FCM/APNs token → persist to this device's row so the server push path can target it.
        PushNotifications.addListener('registration', (t: { value: string }) => {
          void saveDeviceConfig(token, { push_token: t.value })
        }),
```
```ts
        PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, unknown> } }) => {
          const data = action?.notification?.data
          const orderKey = data && typeof data.orderKey === 'string' ? data.orderKey : null
          if (orderKey && onOpenOrder) onOpenOrder(orderKey)
        }),
      ])
      listenersAttached = true
    }
```

⚠️ **`addListener` returns a handle with `.remove()`. The results go into `Promise.all` and are
discarded. Nothing anywhere calls `remove()` on a push listener** — EXECUTED: zero occurrences.

## 🔴 THE LATCH IS SET AFTER AN AWAIT, SO IT DOES NOT SERIALISE

```ts
let listenersAttached = false
```

**The check `if (!listenersAttached)` runs after `await import('@capacitor/push-notifications')`, and
`listenersAttached = true` runs after `await Promise.all([...])`. 🔴 EVERY CALL THAT PASSES THE CHECK
BEFORE ANY ONE OF THEM SETS THE FLAG ATTACHES ITS OWN FULL SET.**

⚠️ **THE FILE ANTICIPATED THE RACE AND MIS-SCOPED THE CONSEQUENCE — READ its own comment:**

```
 * ⚠️ SET AFTER A SUCCESSFUL ATTACH, DELIBERATELY, NOT BEFORE … The cost of set-after is a theoretical
 * concurrent double-attach, which is harmless: two listeners both call saveDeviceConfig with the same
 * token, and that write is an idempotent upsert.
```

🔴 **"HARMLESS" WAS REASONED ABOUT THE `registration` LISTENER, WHICH IS IDEMPOTENT. IT WAS WRITTEN
BEFORE `pushNotificationActionPerformed` HAD A CALLBACK AT ALL** — the prior report records
`onOpenOrder` as *"dead on iOS AND Android since the day it was written"*. **A tap handler is not
idempotent: N listeners produce N toasts.**

# ✅ SO: ONE TAP CAN INVOKE THE HANDLER N TIMES.

**What N grows with:**

| Driver | Grows N? |
|---|---|
| **Dashboard RE-RENDERS** | 🔴 **YES — the primary driver.** Each re-render re-runs the effect, which awaits `fetchDeviceConfig` and then calls `registerForPush`; any that clear the latch check together each attach |
| **Mounts / navigations back to the dashboard** | 🔴 **YES** — a fresh mount is a fresh effect with no cleanup to undo the previous attach |
| **Resumes** | ⚠️ **INDIRECTLY** — a resume produces a burst of re-renders |
| **Cold launch** | ⚠️ the module state is fresh, so N starts at 0 and climbs from there |

⚠️ **INFERRED, NOT EXECUTED: that N reached exactly six on your device. The mechanism is read from the
code; the count is yours. Six is consistent with a handful of renders racing one async latch.**

---

# 2 — 🔴 THE HANDLER DOES NOT RETRY. SIX TOASTS MEANS SIX INVOCATIONS.

**READ, in full — this is the entire path:**

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

| Question | Answer |
|---|---|
| Does it retry? | 🔴 **NO.** One lookup, one outcome |
| On what schedule? | **Two nested `requestAnimationFrame`s — ~32ms at 60Hz — then never again** |
| How many attempts? | **ONE** |
| Does each attempt raise its own toast? | **There is only one attempt per invocation, and it raises exactly one toast** |

# ✅ SIX TOASTS = SIX INVOCATIONS OF THE HANDLER. NOT ONE INVOCATION RETRYING.

🔴 **THAT IS THE PROOF FOR Q1: the only way to get six is six listeners. There is no loop, no interval
and no retry anywhere on this path.**

---

# 3 — WHY THE LOOKUP FAILED. 🔴 YOUR IDENTIFIER HYPOTHESIS IS REFUTED.

## The id is built from `order_key` — the SAME key the payload carries

**READ — the dashboard's call sites. EXECUTED: both `anchorId` occurrences in the file are identical:**

```tsx
anchorId={isDemo?`demo-order-${o.order_key}`:`order-${o.order_key}`}
```

**READ — where OrderCard puts it:**

```tsx
    <div id={anchorId} className={`w-full bg-white rounded-2xl overflow-hidden shadow-sm border …
```

**READ — what the tap searches for:**

```tsx
      const el=document.getElementById(`order-${orderKey}`)
```

# ✅ BOTH SIDES USE `order_key`. THE DISPLAY NUMBER `id` IS NOT USED AS A LOOKUP KEY ANYWHERE ON THIS PATH.

⚠️ **`o.id` — the per-event display number that restarts at 1 — appears in the CARD'S TEXT (`#{order.id}`)
and in toast copy, never in the anchor.** ✅ **So "order #10" is what the operator reads; the anchor for
that same card is `order-<uuid>`, and the tap looks for exactly that.**

## 🔴 TWO WAYS THE ID CAN STILL MISS, AND ONE OF THEM IS REAL

| Path | Does the card carry an anchor? |
|---|---|
| **`pendingOrders`** — "NEW - ACTION NEEDED", **your case** | ✅ **YES** |
| `confirmedOrders` | ✅ YES |
| 🔴 **`otherOrders`** — the Done bucket | 🔴 **NO. EXECUTED: only TWO `anchorId` occurrences exist in the file, and they are the two above. A collected/cancelled/rejected card has `id={undefined}`** |

⚠️ **`isDemo` FLIPS THE PREFIX TO `demo-order-…` WHILE THE TAP ALWAYS SEARCHES `order-…`** — a
guaranteed miss on a demo truck. **Not your case (production truck), recorded because it is a second
structural miss on the same line.**

# 🔴 SO ON YOUR ORDER THE ID WAS CORRECT. THE FAILURE IS NOT THE IDENTIFIER — IT IS TIMING.

---

# 4 — TIMING. 🔴 THE CARD CANNOT HAVE BEEN IN THE DOM WHEN THE LOOKUP RAN.

**What must complete inside two animation frames (~32ms):**

| Step | Fits in 32ms? |
|---|---|
| `setActiveTab('orders')` state commit | ✅ yes — that is exactly what the two frames were written for |
| the orders list re-render | ✅ yes |
| 🔴 **the order arriving in `orders` state** | 🔴 **NO. It is a network fetch, and it had not been made** |

## 🔴 THE STRUCTURAL POINT: THE PUSH IS WHAT TELLS THE APP THE ORDER EXISTS

**The order was created while the app was BACKGROUNDED. The board's `orders` state is whatever it was
when the WebView was suspended — it cannot contain an order that did not exist then.**

**READ — how a new order normally reaches the board. First, Realtime:**

```tsx
    const ordersChannel=supabaseBrowser
      .channel(`orders:${truck.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:`truck_id=eq.${truck.id}`},
        ()=>fetchAllRef.current())
      .subscribe()
```

**and second, the fallback poll:**

```tsx
    const fallbackInterval=setInterval(()=>fetchAllRef.current(),60000)
```

⚠️ **INFERRED, NOT EXECUTED: a suspended WebView drops the Realtime socket, and `postgres_changes` has
no backfill — so an INSERT that happened during suspension is not replayed on reconnect.** 🔴 **That
leaves the 60-SECOND POLL as the route by which the order reaches the board.**

# 🔴 THE TOAST FIRES AT ~32ms. THE ORDER ARRIVES UP TO 60 SECONDS LATER. THE OPERATOR THEN SEES BOTH — THE CARD, AND SIX STALE BARS ON TOP OF IT.

✅ **THAT RECONCILES YOUR TWO OBSERVATIONS EXACTLY: the toast was right when it fired and wrong by the
time it was read.**

## Cold launch versus resume — reported separately

| | Cold launch | Resume (**your case**) |
|---|---|---|
| Is a listener attached when the tap fires? | 🔴 **ALMOST CERTAINLY NOT** — it is attached from a React effect that cannot run before the remote page loads, and the plugin has no queue or replay. **The tap is dropped: no navigation, and NO toast** | ✅ **YES**, from the pre-existing JS context |
| Is the order in `orders`? | ✅ **YES — a cold launch fetches from scratch, so the first `fetchAll` includes it** | 🔴 **NO — stale state from before suspension** |
| Net | ⚠️ **no toast, because no handler runs** | 🔴 **N toasts, because N handlers run and all miss** |

⚠️ **The two defects therefore mask each other on a cold launch and compound on a resume.**

## Collapsed sections, virtualisation, buckets

| Question | Answer |
|---|---|
| Virtualised list? | ✅ **NO** — `pendingOrders.map(...)` renders every card. **EXECUTED** |
| Collapsed section? | ⚠️ **Irrelevant** — `getElementById` finds hidden-but-mounted elements |
| **A bucket that is not rendered at all?** | 🔴 **YES, ONE: the Done bucket has no `anchorId`** — Q3 |
| Does `NEW` vs `CONFIRMED` vs `Done` change it? | 🔴 **YES.** `NEW` and `CONFIRMED` carry anchors; **`Done` does not, so a tap on an order someone else has already completed misses for a SECOND, independent reason** |
| Is the orders TAB required? | ✅ The handler switches it first, so a tap from Stock/Settings still lands correctly — **that part works** |

---

# 5 — TOAST DEDUPLICATION. 🔴 THERE IS NONE. THEY STACK, UNBOUNDED.

**READ, `lib/useToasts.ts`, in full:**

```tsx
  const showToast: ShowToast = (msg, type = 'success', opts) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, msg, type, action: opts?.action }])
    toastTimers.current.set(id, setTimeout(() => dismissToast(id), opts?.duration ?? 3500))
    return id
  }
```

| Question | Answer |
|---|---|
| Do identical messages collapse? | 🔴 **NO.** `[...prev, {…}]` is an unconditional append |
| Is there a key or dedup? | 🔴 **NO.** The only key is `++toastIdRef.current`, a monotonic counter — **it guarantees every toast is DISTINCT, which is the opposite of dedup** |
| Is there a cap? | 🔴 **NO.** No slice, no max length |
| How many can be on screen? | 🔴 **UNBOUNDED — one per call** |
| How long? | 3500ms each, on independent timers |

**READ — and they render as a full-width vertical stack, bottom-anchored:**

```tsx
    <div className="fixed bottom-6 left-4 right-4 max-w-sm mx-auto z-50 flex flex-col gap-2">
```

⚠️ **`fixed bottom-6` with `flex-col` and `gap-2`: six bars grow UPWARD from the bottom of the viewport
— which is where a card's action buttons are. 🔴 The stack is `z-50`; `OrderCard` has no z-index, so
the toasts are unconditionally on top.** ✅ **That is the screenshot, and it follows from the markup.**

---

# 6 — THE SUCCESS PATH

```tsx
      if(el){el.scrollIntoView({behavior:'smooth',block:'center'});return}
```

**Scroll only. No highlight, no open, no action** — ⚠️ **which the code states is deliberate:** *"a
notification tap is navigation, never a decision."*

## 🔴 HAS IT EVER BEEN REACHABLE?

# ✅ YES — BUT NOT FOR THE CASE THE NOTIFICATION IS SENT FOR.

**Q3 removes the identifier objection: on a non-demo truck, a `pending` or `confirmed` card's anchor
matches what the tap searches for exactly.** ✅ **So the success path is reachable whenever the order is
ALREADY on the board when the tap fires.**

🔴 **BUT THE ONE PUSH THIS APP SENDS IS `order_pending` — fired at the moment a NEW order is created.**
⚠️ **INFERRED: on a resume, that order is by definition not yet in the board's state, so the success
path is unreachable for the notification's own use case and reachable only for a stale tap — a
notification left in Notification Centre and opened a minute or more later, after a poll has landed.**

⚠️ **AND IT IS UNREACHABLE ALWAYS on a demo truck (prefix mismatch) and always for a Done order (no
anchor).**

---

# 7 — THE ONE CHEAPEST CHECK

**The candidates: (A) N listeners, (B) the card genuinely absent at 32ms, (C) an id mismatch —
already refuted.**

# 🔴 THE CHECK: TAP ONE NOTIFICATION, THEN IMMEDIATELY TAP A SECOND ONE, AND COUNT THE BARS EACH TIME.

✅ **It costs two taps, needs no tooling, and separates A from B in one observation:**

| Result | Reading |
|---|---|
| **First tap N bars, second tap the SAME N** | 🔴 **A CONFIRMED** — a fixed listener count, attached once and never removed |
| **Second tap MORE bars than the first** | 🔴 **A CONFIRMED AND WORSE** — the count is still climbing with renders |
| **Exactly ONE bar each time** | **A refuted; the failure is purely B** |
| **No bar at all on a tap ≥60s after the notification** | ✅ **B CONFIRMED** — the poll had landed and the card was found |

⚠️ **The last row is the cleanest single observation for B, and it is free: leave a notification
unopened for a minute, then tap it. If the toast disappears once the board has polled, timing is the
whole of the miss.**

**NOT PERFORMED. RECOMMENDING NOTHING.**

---

# 🔴 VERIFICATION

| Claim | Method |
|---|---|
| The registration effect has no cleanup | ✅ **EXECUTED** — the effect read in full |
| `showToast` is not memoised, so the deps are unstable | ✅ **EXECUTED** — `useToasts` read in full |
| The latch is set after an await | ✅ **EXECUTED** |
| No push listener handle is ever removed | ✅ **EXECUTED** — zero `.remove()` on a push listener |
| The handler does not retry | ✅ **EXECUTED** — the whole function is five lines |
| The anchor uses `order_key`, matching the payload | ✅ **EXECUTED** — both call sites and the payload read |
| **Only `pendingOrders` and `confirmedOrders` carry an anchor** | ✅ **EXECUTED** — exactly two `anchorId` occurrences in the file |
| `isDemo` flips the prefix | ✅ **EXECUTED** |
| Toasts append with no dedup and no cap | ✅ **EXECUTED** |
| The stack is `fixed bottom-6`, `z-50` | ✅ **EXECUTED** |
| **That N was six on your device** | 🔴 **INFERRED** — the mechanism is read; the count is your observation |
| **That Realtime does not replay a missed INSERT** | 🔴 **INFERRED** — a property of `postgres_changes`, not of this repo. **Not instrumented** |
| **That the order was absent from `orders` at 32ms** | 🔴 **INFERRED** — from the order having been created during suspension. **No state was inspected** |
| **The cold-launch behaviour** | 🔴 **INFERRED** — from effect ordering plus the plugin's "no queue and no replay" |

🔴 **NOTHING WAS OBSERVED RUNNING. No notification was sent, no device was touched, no log was opened,
no query was run.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. A SEPARATE pass over this report AFTER writing. It is the only file
this task wrote.**

```
  docs/push-tap-toast-report.md   (SEPARATE PASS)    19,122  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 53 | 0 | 53 |
| U+2705 WHITE HEAVY CHECK MARK | 33 | 0 | 33 |
| **U+26A0 WARNING SIGN** | **21** | **21** | ✅ **0** |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 21 OF 21, ZERO BARE.

⚠️ **This report quotes `lib/native/push.ts`, `lib/useToasts.ts`, `OperatorDeviceConfig.tsx` and the
dashboard's tap handler — and none of those carries a bare `U+26A0`.** The one comment quoted from
`push.ts` opens with a PAIRED warning sign, which is why the quotation adds no bare glyph. **So 0 is
the correct number here rather than a suppressed one.**

✅ **The report's total `U+FE0F` count is 21, which exactly accounts for the 21 paired warning signs and
leaves none attached to any other base.** ✅ **The two unpaired bases are internally consistent — 0 of
53, 0 of 33 — so neither is split across two renderings.** ⚠️ **No other emoji-presentation base appears
in this report at all.

## `git status --porcelain`

```
$ git status --porcelain
?? docs/kds-notification-event-report.md
?? docs/push-tap-toast-report.md
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/push-tap-toast-report.md`** | 🔴 **THIS PASS — the only file written** |
| `?? docs/kds-notification-event-report.md` | ✅ **pre-existing — the prior diagnosis this continues. Not overwritten** |

⚠️ **The rest of the session's work was committed between tasks — not by me (`2b6c090 notification
fix`) — which is why the list is short. This pass ran no git command other than `status` and `log`.**
