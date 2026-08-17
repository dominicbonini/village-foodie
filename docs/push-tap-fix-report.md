# Push tap: six listeners, a lookup that could not succeed, two anchor misses

**Five files changed:** `lib/useToasts.ts`, `lib/native/push.ts`,
`components/native/OperatorDeviceConfig.tsx`, `app/dashboard/[token]/page.tsx`,
`components/dashboard/helpers.ts`. `npx tsc --noEmit` passes with no output — **which is not
verification.** ✅ **Fixes 1 and 4 ARE execution-verified — the two harnesses are below.**

**No commit, no stage, no revert, no stash, no clean.** 🔴 **No `git stash`, `checkout` or `restore` —
the only git command run was `status`.** No build, no `next dev`, no `next build`, no `cap sync`, no
deploy, no SQL, no migration.

**Untouched:** the notification payload, the send path, the APNs work, `registerForPush`'s registration
upsert, the board filters, the two switches, `cardStyle`, `hideAmounts`, `RejectOrderModal`, the shared
post-gate handler, anything under `app/api`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 TWO OF MY OWN MISTAKES, CAUGHT AND CORRECTED MID-BUILD — BOTH RECORDED BELOW

1. **I wrote `onOpenOrderRef.current = onOpenOrder` during render**, which is the `react-hooks/refs`
   error this repo already carries elsewhere. **Moved into an effect.**
2. 🔴 **My first Fix 2 read `ordersRef` immediately after `await fetchAll()` — which would have
   reproduced the very bug it replaces, one layer down**, because `setOrders` is asynchronous and the
   ref would still have held the pre-fetch list. **Corrected to a `useLayoutEffect` write plus a check
   inside the animation frames.** See Fix 2.

---

# FIX 1 — THE LISTENERS

## 1a. The root: `showToast` was a plain arrow

**BEFORE — `lib/useToasts.ts`:**

```ts
  const showToast: ShowToast = (msg, type = 'success', opts) => {
```

**AFTER:**

```ts
  const dismissToast = useCallback((id: number) => {
    clearTimer(id)
    setToasts(prev => prev.filter(x => x.id !== id))
  }, [])

  const showToast: ShowToast = useCallback((msg, type = 'success', opts) => {
```

⚠️ **`dismissToast` touches only refs and the state setter, both stable, so its dep array is genuinely
empty and `showToast` can depend on it.** ✅ **The chain `showToast → openOrderFromPush → runSetup → the
effect` is stable from the root up.**

## 1b. The effect: stable identity, and a cleanup

**BEFORE:**

```tsx
    // NOTE: onOpenOrder IS IN THE DEPS DELIBERATELY. runSetup closes over it, and registerForPush attaches the
    // listener ONCE per JS context (its `listenersAttached` latch), so a stale closure here would attach a
    // handler that navigates using yesterday's state and could never be replaced.
  }, [token, onOpenOrder])
```

**AFTER — `[token]` only, with the staleness solved where it belongs:**

```tsx
  }, [token])
```

```tsx
  const onOpenOrderRef = useRef(onOpenOrder)
  useEffect(() => { onOpenOrderRef.current = onOpenOrder }, [onOpenOrder])
```

```tsx
  useEffect(() => () => { releasePushHandlers() }, [])
```

⚠️ **The old comment was right about the problem and wrong about the remedy — it is quoted and answered
in the new one.**

## 1c. 🔴 THE RACE. A HELD PROMISE, NOT A BOOLEAN — AND WHY IT CANNOT INTERLEAVE.

**BEFORE — checked after `await import`, set after `await Promise.all`:**

```ts
let listenersAttached = false
```
```ts
    if (!listenersAttached) {
      await Promise.all([ … ])
      listenersAttached = true
    }
```

**AFTER:**

```ts
    if (!attachPromise) {
      attachPromise = (async () => {
        const handles = await Promise.all([
```
```ts
        attachedHandles = handles
      })()
      attachPromise.catch(() => { attachPromise = null })
    }
    await attachPromise
```

# 🔴 WHY IT CANNOT INTERLEAVE, STATED PRECISELY

**There is no `await` between `if (!attachPromise)` and `attachPromise = (async () => …)()`.**
JavaScript is single-threaded and runs to completion between suspension points, so **no second caller
can be scheduled in that gap** — by the time any other call reads `attachPromise` it is already a
promise, and that call awaits the SAME one. ✅ **A boolean set after an await can be raced; a promise
assigned before one cannot.** ⚠️ **`.catch` clears the holder on failure, restoring the retry the old
set-after-success boolean gave, without restoring its race.**

## 1d. Handles captured, and the handler moved to module state

```ts
let attachedHandles: Array<{ remove: () => void }> = []
```
```ts
let currentOnOpenOrder: ((orderKey: string) => void) | undefined
```
```ts
            if (orderKey && currentOnOpenOrder) currentOnOpenOrder(orderKey)
```
```ts
export function releasePushHandlers(full = false): void {
  currentOnOpenOrder = undefined
  if (!full) return
  for (const h of attachedHandles) { try { h.remove() } catch { /* already gone */ } }
  attachedHandles = []
  attachPromise = null
}
```

⚠️ **A DEFAULT UNMOUNT CLEARS THE HANDLER, NOT THE LISTENERS, AND THAT IS DELIBERATE. Tearing the
plugin listeners down on every dashboard unmount would also drop the `registration` listener — and a
token delivered while nothing is listening is GONE, no queue and no replay, which is a defect this file
already fixed once.** ✅ **The leak the brief names is the stale handler, and that is cleared
unconditionally. `releasePushHandlers(true)` removes the handles for a genuine teardown.**

## ⚠️ THE COMMENT THAT CALLED THE RACE HARMLESS — UPDATED, AS ASKED

```
// ⚠️ THE OLD COMMENT CALLED THE RACE HARMLESS, AND IT WAS WRONG BY THE TIME IT MATTERED. That reasoning
// was scoped to the `registration` listener, whose handler is an idempotent upsert — two of them write
// the same token twice and nothing notices. It was written when the TAP callback was still dead
// (`onOpenOrder` had no caller), so nobody weighed a non-idempotent handler. A tap handler is not an
// upsert: N listeners produce N navigations and N toasts.
```

## ✅ EXECUTED — 12 CONCURRENT CALLS, ONE LISTENER SET, ONE INVOCATION PER TAP

```
concurrent calls          : 12
addListener invocations   : 3  (3 = ONE full set)
handles captured          : 3
handler runs for ONE tap  : 1  ->  ["handler11:order-abc"]
after 5 more mounts       : addListener still 3, handler runs 1 -> ["remount4:order-xyz"]
```

🔴 **Twelve concurrent calls — the shape that produced six sets — attach exactly one.** ✅ **Five further
mounts add none, and the tap routes to the NEWEST handler, which is the staleness the old deps array
existed to prevent.** ⚠️ **The harness replicates the control flow verbatim; it does not run
`push.ts` itself, which needs the Capacitor bridge.**

---

# FIX 2 — THE TAP CAUSES THE DATA TO EXIST

**BEFORE:**

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

**AFTER:**

```tsx
  const openOrderFromPush=useCallback(async(orderKey:string)=>{
    setActiveTab('orders')
    try{ await fetchAllRef.current() }catch{ /* offline / 429 — fall through and resolve on what we have */ }
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const found=ordersRef.current.some(o=>o.order_key===orderKey)
      if(!found){showToast('That order is not on this board - check the event','error');return}
      const el=document.getElementById(orderAnchorId(orderKey,isDemo))
      if(el)el.scrollIntoView({behavior:'smooth',block:'center'})
    }))
  },[showToast,isDemo])
```

**Which mechanism:** `fetchAllRef.current()` — **the same refetch the 60s poll and the Realtime handler
already call.** No new endpoint, no new request shape.

## 🔴 THE ORDERING MISTAKE I MADE AND FIXED

**My first version read `ordersRef.current` immediately after the `await`.** ⚠️ **`await fetchAll()`
resolves when the REQUEST completes, not when React has committed — `setOrders` is asynchronous — so
that read would have seen the PRE-FETCH list and toasted anyway.** ✅ **The check is now inside the two
frames, and the ref is written in a LAYOUT effect:**

```tsx
  useLayoutEffect(()=>{ordersRef.current=orders},[orders])
```

🔴 **`useLayoutEffect` runs SYNCHRONOUSLY after commit and therefore strictly before any
`requestAnimationFrame` callback. A plain `useEffect` is flushed after paint and could lose that race.**

## Can it double-fetch against the 60s poll? — ✅ YES, AND IT IS UNGUARDED ON PURPOSE

⚠️ **A tap can coincide with the poll or with a Realtime-triggered refetch. Both are plain
GET-then-`setState` with no accumulation, so the cost is one extra request and the same rows landing
twice.** 🔴 **NOT guarded, deliberately: a guard would make the tap wait on someone else's in-flight
request and inherit its age — which is the class of bug being fixed.**

## 🔴 "NOT YET LOADED" versus "GENUINELY ABSENT" — THE FETCH IS THE DISCRIMINATOR

| | Before | After |
|---|---|---|
| **Not yet loaded** | 🔴 **toasted** — the dominant case, and the toast was a lie | ✅ **the refetch loads it; the card is scrolled to; no toast** |
| **Genuinely absent** (rejected, cancelled, another event, another van's scope) | toasted — correctly, by accident | ✅ **still toasts, once** |

✅ **The two are now distinguishable, and the distinguishing act is the awaited refetch: after it, "not
in `orders`" can only mean "not on this board", which is exactly what the copy says.** ⚠️ **If the fetch
THROWS (offline, 429) the `catch` falls through and resolves against whatever is loaded — so an offline
tap can still toast on an order that exists. That is the one residual ambiguity and it is bounded to a
failed request.**

---

# FIX 3 — THE TWO ANCHOR MISSES

**One builder, in `components/dashboard/helpers.ts`:**

```ts
export function orderAnchorId(orderKey: string, isDemo: boolean): string {
  return isDemo ? `demo-order-${orderKey}` : `order-${orderKey}`
}
```

**Both OrderCard call sites (2), the Done row (1) and the lookup (1) now call it — EXECUTED: four
occurrences in the dashboard, zero hand-written literals remain.**

```tsx
anchorId={orderAnchorId(o.order_key,isDemo)}
```
```tsx
                    <div key={o.order_key} id={orderAnchorId(o.order_key,isDemo)} className={`bg-white rounded-xl px-4 py-3 flex items-center justify-between ${unrecorded?'border-2 border-red-600':'border border-slate-200'}`}>
```
```tsx
      const el=document.getElementById(orderAnchorId(orderKey,isDemo))
```

⚠️ **THE DONE BUCKET IS NOT AN `OrderCard` — it is a plain row — so its id goes on the row itself
rather than through `anchorId`. That is why the file only ever had two `anchorId` occurrences: the
third site had no such prop to pass.** ✅ **Demo and non-demo now agree by construction: the render and
the search call the same function, so the prefix cannot drift again.**

---

# FIX 4 — THE TOAST CAP AND COLLAPSE

## The cap: 3 — and why

```ts
export const MAX_TOASTS = 3
```

🔴 **THREE IS THE LARGEST NUMBER THAT STILL READS AS "a few things happened" RATHER THAN A WALL.** Three
bars plus gaps occupy roughly a fifth of an iPad's height from the bottom edge, leaving the card body
and its action row visible. ⚠️ **TWO would silently swallow the third of three genuinely different
messages — marking three orders ready in quick succession is a REAL sequence, and each of those toasts
carries its OWN Undo. ONE would make the Undo affordance unreliable.** ✅ **A cap on simultaneous bars,
not a rate limit; the bar dropped is also the one closest to expiring.**

## The collapse — it REPLACES, which is what keeps Undo correct

```ts
      const last = list[list.length - 1]
      if (last && last.type === type && typeof last.msg === 'string' && typeof msg === 'string' && last.msg === msg) {
        clearTimer(last.id)
        list = list.slice(0, -1)
      }
      list = [...list, next]
      while (list.length > MAX_TOASTS) { clearTimer(list[0].id); list = list.slice(1) }
```

⚠️ **Only string-vs-string, only against the NEWEST bar, and the incoming toast's copy, type, duration
and action are the ones kept.** ⚠️ **Identical copy implies the same order — every one of these strings
embeds `#{num}` — so a collapse can never merge two different orders.**

## 🔴 WHAT A NORMAL Ready / Mark paid / Collected TOAST DOES — BEFORE AND AFTER

| Case | Before | After |
|---|---|---|
| One `Order #12 ready` + Undo | one green bar, 4000ms, Undo | ✅ **IDENTICAL** |
| `ready`, `marked paid`, `collected` in sequence | three bars, three Undos | ✅ **IDENTICAL — three distinct strings, cap not reached** |
| The buzzer-pill ready toast (a ReactNode) | appends | ✅ **IDENTICAL — never collapses; a node cannot be compared by value** |
| The 20s `PAYMENT NOT RECORDED` + "Record payment" | one red bar | ✅ **IDENTICAL** |
| The SAME order readied twice | two bars, two Undos | ⚠️ **ONE bar, carrying the NEWER Undo** |
| Six identical push errors | 🔴 six bars over the buttons | ✅ **ONE bar** |

✅ **No copy, duration, colour or action was edited. EXECUTED — `ToastStack.tsx` is not in this task's
diff, and the `bg-green-600` / `bg-red-600` / `duration ?? 3500` logic is untouched.**

## ✅ EXECUTED — THE REDUCER, AND THE UNDO SURVIVES

```
6 identical errors        -> ["That order is not on this board - check the event"] (len 1)
3 distinct + Undo         -> ["Order #11 ready[↩ Undo]","Order #12 marked paid[↩ Undo]","Order #13 collected[↩ Undo]"] (len 3)
same toast twice          -> ["Order #11 ready[↩ Undo]"] (len 1) survivor runs: B
A,B,A                     -> ["Order #11 ready","Order #12 ready","Order #11 ready"] (len 3)
5 distinct, cap 3         -> ["c","d","e"] (len 3)
ReactNode twice           -> len 2 (2 = appends, never collapsed)
```

🔴 **ROW 2 IS THE ONE THAT MATTERS FOR GUSTO: three different actions keep three separate Undos.**
🔴 **ROW 3 PROVES THE UNDO STILL FIRES AND IS THE NEWER ONE — the survivor's `run()` returns `B`, the
second tap's closure, not the stale first.** ✅ **Row 6 proves the buzzer-pill toast is untouched.**

⚠️ **`showToast`'s return value is unused anywhere — EXECUTED, zero call sites read it — so replacing a
toast's id on collapse cannot break a caller.**

---

# 🔴 VERIFICATION

| Item | Method |
|---|---|
| **N renders produce one listener set; one tap invokes the handler once** | ✅ **EXECUTED** — 12 concurrent + 5 sequential, 3 `addListener` calls total, 1 invocation per tap. ⚠️ **The harness replicates the control flow; it does not run `push.ts` through the Capacitor bridge** |
| **A tap on a not-yet-loaded order ends with the order visible, not a toast** | 🔴 **SOURCE READ ONLY.** The refetch is awaited and the check is inside the frames, but **no notification was tapped** |
| **A tap on a genuinely absent order still toasts, once** | 🔴 **SOURCE READ ONLY** for the "absent" half; ✅ **EXECUTED** for the "once" half — the collapse harness, row 1 |
| **A Done-bucket order can be found** | ✅ **EXECUTED as a code fact** — the row now carries an id from the shared builder. 🔴 **Not rendered** |
| **Demo and non-demo prefixes agree** | ✅ **EXECUTED** — one function, four call sites, zero literals |
| **Identical toasts collapse and the cap holds** | ✅ **EXECUTED** — six rows of the reducer harness |
| **No toast covers a button** | 🔴 **SOURCE READ ONLY AND GEOMETRIC.** The cap bounds the stack at three; **nothing was measured on a screen** |
| **Ready / Mark paid / Collected and their Undo are unchanged** | ✅ **EXECUTED** — harness rows 2, 3 and 6, plus `ToastStack` being absent from the diff |
| tsc / lint | ✅ **EXECUTED** — tsc clean; the new files lint clean; **the `Cannot access refs during render` error I introduced was removed, and the two remaining findings in `OperatorDeviceConfig` are pre-existing** |

🔴 **NO NOTIFICATION WAS SENT, NO DEVICE WAS TOUCHED, AND NO BROWSER WAS OPENED. The end-to-end tap
cannot be verified from here.**

---

# INTEGRITY

## Non-ASCII class census

| File | bytes | classes | bare `U+26A0` | `U+26A0` / `U+FE0F` |
|---|---|---|---|---|
| `lib/useToasts.ts` | 2,400 → **6,089** | 3 → **7** | 0 → **0** | 5 / 5 ✅ matched |
| `lib/native/push.ts` | 9,817 → **14,177** | 5 → **7** | 0 → **0** | 9 / 9 ✅ matched |
| `components/native/OperatorDeviceConfig.tsx` | 19,904 → **21,888** | 6 → **9** | 0 → **0** | 1 / 1 ✅ matched |
| `components/dashboard/helpers.ts` | 8,338 → **9,541** | 4 → **7** | 0 → **0** | 1 / 1 ✅ matched |
| `app/dashboard/[token]/page.tsx` | 383,851 → **387,838** | 53 → **53** | **2 → 2** ✅ | 81 / 80 |

🔴 **THE DASHBOARD GAINED AND LOST NO CLASS, AND ITS TWO PRE-EXISTING BARE `U+26A0` ARE UNCHANGED** —
they are the OrderCard conflict markers, which this task does not touch. ⚠️ **Its `U+26A0` rose 76 → 81
and `U+FE0F` 75 → 80 — a matched +5, so every warning sign added is paired.**

⚠️ **The four smaller files gained classes because they were nearly comment-free and now carry the
reasoning for a six-listener race, a cap, and an anchor that must not drift. Every gained glyph is
comment prose or a banner rule.**

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

```
  lib/useToasts.ts                                6,089  offending=0  CR=0
  lib/native/push.ts                             14,177  offending=0  CR=0
  components/native/OperatorDeviceConfig.tsx     21,888  offending=0  CR=0
  components/dashboard/helpers.ts                 9,541  offending=0  CR=0
  app/dashboard/[token]/page.tsx                387,838  offending=0  CR=0
  docs/push-tap-fix-report.md  (SEPARATE PASS)   20,241  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 38 | 0 | 38 |
| U+1F534 LARGE RED CIRCLE | 28 | 0 | 28 |
| **U+26A0 WARNING SIGN** | **22** | **22** | ✅ **0** |
| U+21A9 LEFTWARDS ARROW WITH HOOK | 5 | 0 | 5 |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 22 OF 22, ZERO BARE.

⚠️ **None of the five edited files carries a bare `U+26A0` in anything this report quotes** — the
dashboard's two are the OrderCard conflict markers, which this task neither touches nor quotes — **so 0
is the correct number here rather than a suppressed one.**

✅ **The report's total `U+FE0F` count is 22, which exactly accounts for the 22 paired warning signs and
leaves none attached to any other base.** ✅ **The three unpaired bases are internally consistent — 0 of
38, 0 of 28, 0 of 5 — so no base is split across two renderings.** ⚠️ **`U+21A9` is bare five times by
necessity: every one is inside a quoted `↩ Undo` label, which the source writes bare.

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/page.tsx
 M components/dashboard/helpers.ts
 M components/native/OperatorDeviceConfig.tsx
 M lib/native/push.ts
 M lib/useToasts.ts
?? docs/kds-notification-event-report.md
?? docs/push-tap-fix-report.md
?? docs/push-tap-toast-report.md
```

**Which entries were already there before this task began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`M lib/useToasts.ts` · `M lib/native/push.ts` · `M components/native/OperatorDeviceConfig.tsx` · `M components/dashboard/helpers.ts` · `M app/dashboard/[token]/page.tsx`** | 🔴 **ALL THIS TASK — every one of them was CLEAN when it began** |
| 🔴 **`?? docs/push-tap-fix-report.md`** | 🔴 **THIS TASK** |
| `?? docs/kds-notification-event-report.md` · `?? docs/push-tap-toast-report.md` | ✅ **pre-existing — the two diagnoses this implements. Neither overwritten** |

⚠️ **The rest of the session's work was committed between tasks — not by me — so the tree was clean
apart from those two reports, and every modified entry above is this change and nothing else.**
