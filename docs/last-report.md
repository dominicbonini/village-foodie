# Last report — Demo "Start a new service": reload after a confirmed restart

**Date:** 2026-07-28 · **Files touched:** `app/dashboard/[token]/page.tsx` (only)
**Verification:** `npx tsc --noEmit` → **clean, zero errors.** `npx eslint` → clean on every changed line. No `next dev`, no `next build`, no SQL.
**Diff: 1 file — the `restartingRef` declaration, the `startNewService` body.**

This report **overwrites** the previous one (landing copy follow-ups), per the rolling convention.

**Prompt integrity:** one garble. *"this is a **oe**-per-session action"* → read as *"a **once**-per-session action"*. Nothing else was ambiguous; no other span needed interpretation.

---

## 1 · The current success handler, and the actual finding

### Quoted verbatim — `app/dashboard/[token]/page.tsx:895-919`, as it stood before this change

```ts
  // DEMO ONLY — wipe the finished service and provision a fresh one for now. The server does all the
  // work (app/api/demo/restart → lib/demo-restart); this only clears the CLIENT-side demo state the
  // server can't see, then re-fetches.
  const startNewService=async()=>{
    if(restarting)return
    setRestarting(true); setRestartError(null)
    try{
      const res=await fetch('/api/demo/restart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})
      const data=await res.json().catch(()=>({}))
      if(!res.ok){setRestartError(data?.error||'Could not start a new service — try again.');return}
      // RESET THE LOOP-COMPLETE STATE. Its baseline is a persisted list of order keys
      // (components/dashboard/DemoLoopComplete.tsx) — every key in it has just been deleted, so without
      // this the NEW seeded board reads as 37 orders the visitor caused and the prompt fires instantly
      // on load. Clearing both keys means the fresh board is re-baselined on next load and the visitor
      // gets the moment properly when they order on the new service. Same key names as the component.
      try{
        localStorage.removeItem(`hg_demo_seen_orders_${token}`)
        localStorage.removeItem(`hg_demo_loop_${token}`)
      }catch{/* private mode — the baseline just re-records itself */}
      setHighlightOrderKey(null)
      // Full re-fetch: the event id, the window, the slot grid and every order have changed.
      await fetchAllRef.current()
    }catch{
      setRestartError('Could not start a new service — try again.')
    }finally{
      setRestarting(false)
    }
  }
```

### What it refetches

`fetchAllRef.current()` is `() => fetchAll()` (`:695`) — `forceSeed` false, so the config branch is skipped. It refetches thoroughly:

- `GET /api/dashboard` → `setSlots`, `setProductionSlotUnits`, `setCapacityBreaches`, `setOrders(prev => mergeOrders(prev, data.orders || []))`, pause / extra-wait fields.
- `GET /api/events/manage?upcoming=true` → `setTodayEvents`, `setUpcomingEvents`.
- `fetchMenu`, `fetchStock`.

The comment's claim — *"the event id, the window, the slot grid and every order have changed"* — is correct about the **data**. **The new orders genuinely arrive in state.** `mergeOrders` takes membership from the read (`lib/orders/mergeOrders.ts:12-13`, `:84`), so the deleted orders drop out and the freshly seeded ones land in `orders`.

### What it leaves stale — one variable

**`selectedEventId`.** It is never cleared, and it names an event that no longer exists.

Everything follows from that:

**(a) The auto-select effect refuses to re-select** — `:660-661`:
```ts
  useEffect(()=>{
    if(selectedEventId||!upcomingEvents.length) return
```
`selectedEventId` is truthy (stale), so the effect bails on its first line. It is designed to pick an event when there is *no* selection; it has no notion of a selection that has become **invalid**.

**(b) The event resolves to null** — `:435-437`:
```ts
  const selectedOrDefaultEvent:TruckEvent|null=selectedEventId
    ?(upcomingEvents.find(e=>e.id===selectedEventId)??null)
    :pickDefaultEventByTime(upcomingEvents)
```
The refetched `upcomingEvents` contains only the NEW event, so `.find()` misses → `null`. Note the `:` branch — `pickDefaultEventByTime` would have picked the new event correctly. It is unreachable **precisely because** a stale selection exists.

**(c) The "never blank the event bar" guard then resurrects the deleted event** — `:1555-1557`:
```ts
  const activeEvent:TruckEvent|null=resolvedEvent
    ??(selectedEventId&&lastActiveEventRef.current?.id===selectedEventId?lastActiveEventRef.current:null)
  if(resolvedEvent)lastActiveEventRef.current=resolvedEvent
```
`resolvedEvent` is null, `selectedEventId` still equals `lastActiveEventRef.current.id`, so `activeEvent` becomes **the cached OLD event object**. That guard exists for a transiently-failed events refetch; it cannot distinguish that from an event deliberately destroyed, so it holds the corpse.

### That one variable explains all three stale symptoms

| Symptom | Reads | Why it was stale |
|---|---|---|
| Header shows 12:00–15:00 | `activeEvent.start_time` / `.end_time` | `activeEvent` is the cached deleted event (c) |
| New / Confirmed / Done all 0 | `eventOrders=activeEvent?overlayed.filter(o=>o.event_id===activeEvent.id):overlayed` (`:1745`) | Filters on the OLD event id. The new orders **were in state** — they carry the NEW `event_id`, so nothing matched. Not missing data: a wrong filter key. |
| "This service has ended" card persists | `demoServiceEnded` (`:1709-1712`) → `activeEvent.event_date` + `end_time` | Reads the old, already-elapsed window, so it stays true — the card survives its own button |

### Why the capacity strip DID update — the asymmetry

`slots` and `productionSlotUnits` are not derived from `activeEvent` at all. They are assigned **wholesale from the server response** (`:591`, `:599`):

```ts
      setSlots(data.slots)
      ...
      if(data.productionSlotUnits !== undefined) setProductionSlotUnits(data.productionSlotUnits || {})
```

And the server **re-resolves the event** when the id it is handed no longer exists — `app/api/dashboard/route.ts:141-148`:

```ts
  let selectedEventId: string | null = null
  if (eventIdParam && todayEvents?.some(e => e.id === eventIdParam)) {
    selectedEventId = eventIdParam
  } else if (todayEvents && todayEvents.length === 1) {
    selectedEventId = todayEvents[0].id
```

`fetchAll` passes the stale id (`:539-540`, from `selectedEventRef.current`). The `some()` check fails, the truck now has exactly one event for the date, and the route falls through to it. So slots, capacity **and the returned orders** all describe the NEW event.

**The asymmetry is server-resolved data vs client-resolved identity.** Anything the server resolved for itself came back correct; anything the client keys off `selectedEventId` / `activeEvent` stayed pinned to a deleted row — with `lastActiveEventRef` actively preserving it. It was never "not enough was refetched".

**One worse variant, unobserved but implied by the same code.** `fetchAll` also sends `date` from `selectedEventRef.current` (`:540`). If an operator returns the *next day* and restarts, the client asks for **yesterday's** date, `todayEvents` comes back empty, `selectedEventId` resolves to `null` server-side, and `activeOrders` / `doneToday` stay `[]` (`route.ts:164-166`). In that variant even the capacity strip would be wrong. The reload fixes it too, because a fresh mount has no `selectedEventRef` to send.

---

## 2 · The change: full reload, fired only after success

`fetchAllRef.current()` and `setHighlightOrderKey(null)` are gone, replaced by `window.location.reload()`. (`setHighlightOrderKey` was redundant — `highlightOrderKey` is plain `useState` (`:395`), which the reload clears.)

The `localStorage` clearing is **kept and now load-bearing**: it must happen before the reload, because localStorage outlives it while React state does not. Without it the fresh board re-reads the old baseline of order keys and fires the loop-complete prompt on load.

**`app/dashboard/[token]/page.tsx:918-953`, after the change:**

```ts
  const startNewService=async()=>{
    // Synchronous re-entry guard — see restartingRef. A second restart mid-flight would delete the
    // orders the first one just seeded.
    if(restartingRef.current)return
    restartingRef.current=true
    setRestarting(true); setRestartError(null)
    try{
      const res=await fetch('/api/demo/restart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})
      const data=await res.json().catch(()=>({}))
      // 🔴 FAILURE PATH — NO RELOAD. ...
      if(!res.ok){
        setRestartError(data?.error||'Could not start a new service — try again.')
        restartingRef.current=false; setRestarting(false)
        return
      }
      // RESET THE LOOP-COMPLETE STATE. ...
      // MUST happen before the reload — localStorage outlives it, React state does not.
      try{
        localStorage.removeItem(`hg_demo_seen_orders_${token}`)
        localStorage.removeItem(`hg_demo_loop_${token}`)
      }catch{/* private mode — the baseline just re-records itself */}
      // SUCCESS, and only now. `restarting` is deliberately NOT cleared: the button stays disabled and
      // reading "Setting up…" until the document is replaced, so it is never pressable again in the gap.
      window.location.reload()
    }catch{
      // Network/parse failure — same as above: the restart may not have happened, so stay put.
      setRestartError('Could not start a new service — try again.')
      restartingRef.current=false; setRestarting(false)
    }
  }
```

A reload is the right shape for exactly the reason the observation exposed: the restart replaces the event, every order and the slot map, so the client's *identity* for all of it is invalid. Repairing that piecemeal means re-deriving a page load by hand — clear the selection, let auto-select re-run, invalidate `lastActiveEventRef`, drop `selectedEventRef`, re-baseline the per-event stock keys, and get the ordering between them right. The reload rebuilds every derived value from one consistent server read.

---

## 3 · The failure path, quoted after the change

Two exits, neither of which reloads — quoted from the block above:

```ts
      if(!res.ok){
        setRestartError(data?.error||'Could not start a new service — try again.')
        restartingRef.current=false; setRestarting(false)
        return
      }
```

```ts
    }catch{
      // Network/parse failure — same as above: the restart may not have happened, so stay put.
      setRestartError('Could not start a new service — try again.')
      restartingRef.current=false; setRestarting(false)
    }
```

`window.location.reload()` sits **after** the `!res.ok` early return, inside `try`, reachable only on a 2xx.

Both failure exits reset the guard and the busy state, so: the "This service has ended" card stays mounted (`demoServiceEnded` is unchanged — nothing was refetched, nothing was reloaded), the error renders beneath the button (`:2144` — `{restartError&&<p className="text-sm text-red-600 mt-2">{restartError}</p>}`), and the button becomes pressable again for a retry. The server's own error text is preferred (`data?.error`), with the generic string as fallback — unchanged from before.

---

## 4 · Busy state and double-press

**Busy state — confirmed, pre-existing, unchanged** (`:2138-2141`):

```tsx
                  <button type="button" onClick={startNewService} disabled={restarting}
                    className="mt-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-sm font-black px-5 py-2.5 rounded-xl shadow-sm">
                    {restarting?'Setting up…':'Start a new service'}
                  </button>
```

Disabled, 40 % opacity, label "Setting up…" while in flight.

**Double-press — strengthened.** The old guard was `if(restarting)return`, reading React state. `setRestarting(true)` does not apply until the next render, so two clicks dispatched inside a single frame can both observe `restarting === false` and both fire — and per your note, the second restart would delete the orders the first just seeded. `disabled={restarting}` closes the window a frame later, not immediately.

Added a synchronous ref guard (`:401-405`):

```ts
  // The SAME in-flight flag as `restarting`, held in a ref so the re-entry guard is SYNCHRONOUS.
  // `disabled={restarting}` only takes effect on the next render, so two clicks inside one frame can
  // both read restarting===false and fire two restarts — and the second would delete the orders the
  // first just seeded. The ref closes that window; the state drives the button's busy label.
  const restartingRef=useRef(false)
```

`restartingRef.current=true` is set on the same synchronous tick as the guard check, so a second call returns before it can `fetch`. The ref is cleared on both failure exits and deliberately **not** cleared on success — the button stays disabled through the reload, so there is no gap in which it is pressable again.

---

## 5 · Does the same partial-refresh shape exist elsewhere? — surveyed, not changed

**No. The one other handler that destroys the selected event's identity already handles it correctly** — and it is operator-facing, not demo-gated.

`cancelEventFromMenu` (`:1510-1519`) removes the event the operator is looking at, and clears the selection explicitly:

```ts
      setTodayEvents(prev=>prev.filter(e=>e.id!==eventId))
      setSelectedEventId(null); setShowEventMenu(false); showToast('Event cancelled')
      fetchAllRef.current() // re-sync so the cancelled event drops out immediately
```

`setSelectedEventId(null)` is the exact line `startNewService` was missing. With it, `selectedOrDefaultEvent` takes the `pickDefaultEventByTime` branch (`:437`) and the auto-select effect is free to run — so a partial refresh is sufficient there. Same pattern, comparable situation, correct.

The remaining event-mutating handlers all change an event **in place**, so the id survives, `selectedEventId` stays valid, and a partial refresh is the right tool:

| Handler | Line | Mutation | Refresh |
|---|---|---|---|
| `openEvent` | `:1423-1433` | status → `open` | optimistic patch + `fetchAllRef.current()` |
| `extendEvent` | `:1439` | `end_time` | optimistic patch + refetch |
| `doFinishEvent` | `:1460-1469` | status → `closed` | optimistic patch + `fetchAllRef.current()` |
| `saveEventNote` | `:1521` | `customer_note` | refetch |

None invalidate the event id, so none carry the bug. **Nothing changed here**, as instructed.

One adjacent observation, reported only: `cancelEventFromMenu` filters `todayEvents` but not `upcomingEvents`, relying on the following `fetchAllRef.current()` to reconcile. Since `selectedOrDefaultEvent` reads `upcomingEvents` (`:436`), there is a brief window where the cancelled event is still in that list. `setSelectedEventId(null)` means it cannot be *selected*, so I could not construct a visible symptom by reading. Flagging as something to look at, not a finding.

---

## 6 · Not touched, as instructed

`restartDemoService`'s server logic, the delete ordering and the seeding (`lib/demo-restart.ts`), `app/api/demo/restart/route.ts`, `provisionDemo`, `commitMenu`, the scraper — none were opened for editing. The whole change is two edits in `app/dashboard/[token]/page.tsx`: the `restartingRef` declaration (`:401-405`) and the `startNewService` body (`:895-953`). The button markup is unchanged.

---

## 7 · Verified by reading vs. by running

### Ran
- `npx tsc --noEmit` → **clean**.
- `npx eslint app/dashboard/[token]/page.tsx` → **no diagnostic on any changed line.** (The file carries pre-existing violations elsewhere — `no-explicit-any`, `Cannot access refs during render`, `set-state-in-effect` — all outside this diff; I checked each reported line number against the change.)

### Read only — NOT verified by running
1. **The reload has never been executed.** No `next dev`, per instruction. The causal chain in §1 is read straight off the source; the *fix* is verified only in the sense that a fresh mount cannot carry a stale `selectedEventId` / `lastActiveEventRef` / `selectedEventRef`, because all three are `useState`/`useRef` initialised at mount.
2. **The failure path has not been exercised.** I did not force a non-2xx from `/api/demo/restart` to watch the card survive with the error rendered.
3. **The double-press race was reasoned, not reproduced.** Two clicks inside one frame is hard to produce by hand; the ref guard is correct by construction (synchronous read and write on one tick), but I did not demonstrate the original race.
4. **The server-side fallback (`app/api/dashboard/route.ts:141-148`) was read, not observed.** My claim that it is what fed the correct capacity strip is inference from the code plus your observation that the strip *was* right — consistent, but I issued no request. Note that if the truck had two events on the date, the `length === 1` branch would not apply and the `> 1` branch would project the first event instead; I did not check how many events a restart leaves behind.
5. **The next-day variant in §1 is predicted, not observed.** It follows from `date` being sent from `selectedEventRef.current` (`:540`), but I did not reproduce it.
6. **No DB queries run.** I did not inspect the demo truck's live event rows.
