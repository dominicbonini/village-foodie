# Extracting the finish-time control and replacing the dashboard's divergent version

**No `next dev`, no `next build`, no `cap sync`, no deploy, no database write, no SQL.** `lib/payments/`
was not opened for edit and is absent from the diff. **`npx tsc --noEmit` passes with no output** —
that is not a build.

**Files changed by THIS task: three.** `components/shared/EventFinishTimeModal.tsx` (new),
`app/dashboard/[token]/kds/page.tsx`, `app/dashboard/[token]/page.tsx`. ⚠️ **Three other entries in
`git status` are from the two previous tasks and are NOT this task's** — see E6.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** or **INFERRED**. **Dashboard and KDS are reported separately.**

# 🔴 ONE FINDING TO READ FIRST: THERE WERE THREE `extendEvent` CALL SITES, NOT ONE

**READ** — `grep -rn "extendEvent(" app`, complete, before this change:

| # | Site | What it is | Fate |
|---|---|---|---|
| 1 | `app/dashboard/[token]/page.tsx:5022` | 🔴 **`Extend event +30 min`, the Event actions menu** | ✅ **REPLACED — the target of this task** |
| 2 | `app/dashboard/[token]/page.tsx:3156` | ⚠️ **the dashboard's RECENTLY-CLOSED BANNER** | ✅ **UNCHANGED** |
| 3 | `app/dashboard/[token]/kds/page.tsx:1589` | ⚠️ **the KDS's RECENTLY-CLOSED BANNER** | ✅ **UNCHANGED (C3)** |

⚠️ **The brief named one; the dashboard had two.** The second is the **exact mirror** of the KDS banner
you agreed stays, so I treated them as one decision and left both. **`extendEvent` therefore survives
on both surfaces and is still called — B3 has the detail.**

---

# PART A — READ BOTH

## A1. The KDS control, in full, as it stood before extraction

**Five pieces. All READ from `app/dashboard/[token]/kds/page.tsx` before the change.**

**(1) THE STATE — two, and the split was the safety:**

```ts
  // 🔴 TWO STATES, AND THE SPLIT IS THE SAFETY. `finishTimePicker` is the PICKER — open it, choose a
  // time, change your mind, close it, and NOTHING has been written. `finishTimeConfirm` is the second,
  // explicit step that actually commits. …
  const [finishTimePicker, setFinishTimePicker] = useState<{ eventId: string; current: string; selected: string } | null>(null)
  const [finishTimeConfirm, setFinishTimeConfirm] = useState<{ eventId: string; current: string; next: string; affected: number } | null>(null)
  const [finishTimeBusy, setFinishTimeBusy] = useState(false)
```

**(2) THE VALIDATION — the whole control turns on `.getTime() > now`:**

```ts
  const finishTimeOptions = (() => {
    if (!activeEvent?.event_date) return [] as string[]
    const now = Date.now()
    const out: string[] = []
    for (let mins = 0; mins < 24 * 60; mins += 15) {
      const hh = String(Math.floor(mins / 60)).padStart(2, '0')
      const mm = String(mins % 60).padStart(2, '0')
      if (new Date(`${activeEvent.event_date}T${hh}:${mm}`).getTime() > now) out.push(`${hh}:${mm}`)
    }
    return out
  })()
```

**(3) THE AFFECTED-ORDER COUNT:**

```ts
  // Orders this event still owes that are due AFTER a proposed finish time. Shown in the confirm so a
  // shortening is never silent — see the confirm modal and docs/kds-preferences-report.md (C5).
  // ⚠️ NULL-SLOT (ASAP) ORDERS ARE DELIBERATELY EXCLUDED: they have no promised time to fall after.
  const ordersDueAfter = (endTime: string) =>
    activeOrders.filter(o => !!o.slot && o.slot.slice(0, 5) > endTime).length
```

**(4) THE PICKER — writes nothing:**

```tsx
      {finishTimePicker && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setFinishTimePicker(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-900 text-base mb-1">Change finish time</h3>
…
            {finishTimeOptions.length === 0 ? (
              <p className="text-sm text-slate-500 mt-4">There are no times left today. Use Finish event instead.</p>
            ) : (
…
                  {!finishTimeOptions.includes(finishTimePicker.selected) && (
                    <option value={finishTimePicker.selected}>{finishTimePicker.selected || '--:--'} (current)</option>
                  )}
                  {finishTimeOptions.map(t => (
                    <option key={t} value={t}>{t}{t === finishTimePicker.current ? ' (current)' : ''}</option>
                  ))}
                </select>
                {finishTimePicker.current && finishTimePicker.selected < finishTimePicker.current && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                    That is earlier than the current finish time. Customers will not be able to order for times after it.
                  </p>
                )}
…
              <button
                disabled={finishTimeOptions.length === 0 || finishTimePicker.selected === finishTimePicker.current}
                onClick={() => { setFinishTimeConfirm({ …, affected: ordersDueAfter(finishTimePicker.selected) }); setFinishTimePicker(null) }}
…
                Review change
```

**(5) THE CONFIRM — the only thing that writes:**

```tsx
            {finishTimeConfirm.affected > 0 && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-3">
                <span className="font-bold">{finishTimeConfirm.affected} order{finishTimeConfirm.affected === 1 ? ' is' : 's are'} due after {finishTimeConfirm.next}.</span>{' '}
                {finishTimeConfirm.affected === 1 ? 'It stays' : 'They stay'} on the board and still {finishTimeConfirm.affected === 1 ? 'needs' : 'need'} making. Changing the finish time only stops NEW orders being placed for later times.
              </p>
            )}
```

**EVERYTHING ITS HANDLER CALLS — READ, and it is one request:**

```ts
  const applyFinishTime = async (eventId: string, newEnd: string) => {
    setFinishTimeBusy(true)
    try {
      const res = await fetch('/api/events/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'update', eventId, payload: { end_time: newEnd } }) })
      const data = await res.json()
      if (data?.queued) { setPendingSyncCount(c => c + 1); setFinishTimeConfirm(null); return }
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.map(e => e.id === eventId ? { ...e, end_time: newEnd } : e))
      showKdsToast(`Finish time now ${newEnd}`)
      setFinishTimeConfirm(null)
    } catch (err: any) { showKdsToast(err.message || 'Failed') }
    finally { setFinishTimeBusy(false) }
  }
```

✅ **`fetch` → `setPendingSyncCount` (offline outbox) or `setEvents` + `showKdsToast`. No other call.**

## A2. The dashboard's `Extend event +30 min`, in full

**READ — `app/dashboard/[token]/page.tsx:5020-5023`, the ENTIRE control:**

```tsx
              {/* Extends the event's END TIME by 30 min (extendEvent → end_time) — NOT an order-wait buffer.
                  Labelled explicitly so it isn't confused with "Add extra wait" now sitting beside it. */}
              <button onClick={()=>{extendEvent(activeEvent.id,30);setShowEventMenu(false)}}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Extend event +30 min</button>
```

# 🔴 THAT IS ALL OF IT. TWO LINES. THERE IS NO CONFIRM ANYWHERE.

**Stated explicitly, as asked:**

- **No confirm modal.** `onClick` calls `extendEvent` **directly** — the write starts on the press.
- **No picker.** The `30` is hardcoded in the call.
- **No undo.** Nothing captures the previous `end_time`, and there is no toast action.
- **No affected-order count.** Nothing is computed or shown.
- **No disabled state.** Pressing it twice adds an hour; nothing prevents that.
- ⚠️ **It closes the menu in the same tap** (`setShowEventMenu(false)`), so **the operator is returned to
  the board with no dialog and no visible acknowledgement other than a toast.**

⚠️ **AND THE OLD COMMENT SHOWS THE DESIGN CONCERN WAS ABOUT NAMING, NOT SAFETY** — it worries the label
might be confused with "Add extra wait", not that a stray press changes a live service.

## A3. `extendEvent`, and whether the two write the same thing

**DASHBOARD — READ, `app/dashboard/[token]/page.tsx:2208-2219`:**

```ts
  const extendEvent=async(eventId:string,addMins:number)=>{
    const ev=todayEvents.find(e=>e.id===eventId); if(!ev) return
    const[h,m]=ev.end_time.split(':').map(Number)
    const total=h*60+m+addMins
    const newEnd=`${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update',eventId,payload:{end_time:newEnd}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,end_time:newEnd}:e))
      showToast(`Extended to ${newEnd}`)
    }catch(err:any){showToast(err.message||'Failed','error')}
  }
```

**WHAT IT WRITES — READ, the server, `app/api/events/action/route.ts:154-171`:**

```ts
  if (action === 'update') {
    const allowed = [
      'venue_name', 'venue_address', 'start_time', 'end_time',
      'customer_note', 'auto_open', 'auto_close', 'notes'
    ]
    const safe = Object.fromEntries(
      Object.entries(payload).filter(([k]) => allowed.includes(k))
    )

    const { error } = await supabase
      .from('truck_events')
      .update({ ...safe, updated_at: now })
      .eq('id', eventId)
      .eq('truck_id', truck.id)
```

✅ **`truck_events.end_time` and `updated_at`. NOTHING ELSE.** No order, no status, no production slot,
no payment call — the route imports nothing from `lib/payments/`.

# ✅ THEY WRITE IDENTICALLY. THE DIVERGENCE WAS NEVER IN BEHAVIOUR AT THE DATABASE.

| | KDS `applyFinishTime` | Dashboard `extendEvent` |
|---|---|---|
| Endpoint | `/api/events/action` | **same** |
| Action | `'update'` | **same** |
| Payload | `{ end_time }` | **same** |
| Columns written | `end_time`, `updated_at` | **same** |
| **How the value is chosen** | 🔴 **absolute, operator-picked** | 🔴 **relative, `current + 30`** |
| **Gate before the write** | 🔴 **picker → confirm** | 🔴 **NONE** |
| Offline handling | ✅ `data?.queued` → outbox | ❌ **no `queued` branch** |

🔴 **SO THE DIVERGENCE IS IN WHAT THE OPERATOR IS ASKED BEFORE THE IDENTICAL WRITE HAPPENS — which is
exactly the kind that does not show up in a schema diff and is the reason this task exists.**

⚠️ **ONE REAL BEHAVIOURAL DIFFERENCE BEYOND THE UI, REPORTED: the dashboard's `extendEvent` has NO
`data?.queued` branch.** The KDS's handler increments `pendingSyncCount` when the outbox swallows the
request; the dashboard's would treat a queued response as success. **INFERRED: the new dashboard
handler I wrote follows the dashboard's own existing shape rather than importing the KDS's offline
model, because adding outbox handling to the dashboard is a change to its offline behaviour and is not
in this task's scope. Flagged, not fixed.**

## A4. Everything else on the dashboard's Event actions menu

**READ — `app/dashboard/[token]/page.tsx:4971-5031`, the complete menu, in order:**

| Item | On the dashboard | On the KDS | 🔴 KDS lacks it? |
|---|---|---|---|
| **Start / Restart Event** (`confirmed`/`closed`) | ✅ | ❌ | 🔴 **YES** |
| **📅 Change event** | ✅ | ✅ `Change event` | no — ⚠️ no emoji on the KDS |
| **Note for customers + Save note** | ✅ | ✅ `Customer note` | no — ⚠️ different label, and the dashboard has a helper line |
| **Pause / Resume orders** | ✅ **in the menu** | ⚠️ **in the HEADER, not the menu** | not missing — **relocated** |
| **Add extra wait** (`renderExtraWait`) | ✅ **in the menu** | ⚠️ **in the HEADER as a `<select>`** | not missing — **relocated** |
| **Extend event +30 min** | ✅ | ❌ | ✅ **now replaced by the shared control on both** |
| **Finish event** | ✅ | ✅ | no |
| **Cancel event** | ✅ | ✅ | no |

**READ — the two the KDS genuinely lacks and the two that merely moved:**

```tsx
            {(activeEvent.status==='confirmed'||activeEvent.status==='closed')&&(
              <button onClick={()=>{openEvent(activeEvent.id);setShowEventMenu(false)}}
                className="w-full bg-orange-600 text-white font-bold py-2.5 rounded-xl hover:bg-orange-700 text-sm mb-3">
                {activeEvent.status==='closed'?'Restart Event':'Start Event'}
              </button>
            )}
```

🔴 **`Start / Restart Event` IS THE ONE REAL GAP.** The KDS has `openEvent` defined and calls it from
elsewhere, but its Event actions menu offers no way to start or restart an event. **INFERRED: on an
unattended KDS that means a truck whose event has not auto-opened cannot start it from the kitchen
screen.**

⚠️ **NONE OF THESE WERE CHANGED. Reported for your decision on whether the menus should match
entirely.**

---

# PART B — EXTRACT

## B1. Where it lives, and why

# ✅ `components/shared/EventFinishTimeModal.tsx`

**WHY THERE:** `components/shared/` is where this codebase already puts a modal that all three operator
surfaces mount — **READ**, `components/shared/EventCancelModal.tsx`:

```
// This component is manage's modal, lifted unchanged, so all three surfaces gate the operation the same
// way. It is not a reimplementation — see docs/overlay-fixes-report.md B3.
```

✅ **Same folder, same convention, same reason.** ⚠️ **It is NOT in `components/dashboard/`, because
that folder is the dashboard's own vocabulary and the KDS importing from it is what makes "shared"
ambiguous.**

## B2. Behaviour identical on both

**It is the same component, so identity is structural rather than asserted. READ — the two exported
functions carry the logic:**

```ts
export function finishTimeOptions(eventDate: string | null | undefined): string[] {
  if (!eventDate) return []
  const now = Date.now()
  const out: string[] = []
  for (let mins = 0; mins < 24 * 60; mins += 15) {
    const hh = String(Math.floor(mins / 60)).padStart(2, '0')
    const mm = String(mins % 60).padStart(2, '0')
    if (new Date(`${eventDate}T${hh}:${mm}`).getTime() > now) out.push(`${hh}:${mm}`)
  }
  return out
}
```

```ts
export function ordersDueAfter(orders: FinishTimeOrder[], endTime: string): number {
  return orders.filter(o =>
    !TERMINAL_STATUSES.includes(o.status) && !!o.slot && o.slot.slice(0, 5) > endTime
  ).length
}
```

| Requirement | Where it is guaranteed |
|---|---|
| 15-minute boundaries | `mins += 15`, **one loop, one file** |
| `.getTime() > now` validation | **the same single line** |
| Earlier times selectable | the loop starts at `0`, not at `end_time` — **both sides of the current finish** |
| Picker → confirm | `step: 'pick' \| 'confirm'` **inside the component** |
| Affected-order count wording | **one JSX block**, quoted at D3 |

🔴 **THE COUNT'S TERMINAL FILTER MOVED INSIDE, DELIBERATELY.** The KDS previously counted over
`activeOrders` (already terminal-filtered); the dashboard has no identically-filtered list. **Had I
taken a pre-filtered list from each caller, the two surfaces could quietly disagree about what "live"
means.** So the component now owns it:

```ts
const TERMINAL_STATUSES = ['collected', 'cancelled', 'rejected']
```

⚠️ **THE SAME THREE THE KDS BOARD ALREADY USED** — `!['collected', 'cancelled', 'rejected'].includes(o.status)`
— so the KDS's count is unchanged (C1) while the dashboard inherits the identical rule.

## B3. Replacing the dashboard's control, and what still calls `extendEvent`

**AFTER — READ, `app/dashboard/[token]/page.tsx`:**

```tsx
              <button onClick={()=>{setShowEventMenu(false);setFinishTimeTarget({id:activeEvent.id,end_time:activeEvent.end_time??null,event_date:activeEvent.event_date??null})}}
                className="w-full bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl hover:bg-slate-200 text-sm">Change event finish time{activeEvent.end_time?` (now ${activeEvent.end_time.slice(0,5)})`:''}</button>
```

✅ **Same label as the KDS's, current finish time in the label, opens a picker and writes nothing.**

# 🔴 DOES ANYTHING ELSE CALL `extendEvent`? YES — TWO THINGS, AND BOTH STAY.

**READ — every surviving call site after the change:**

```
app/dashboard/[token]/kds/page.tsx:1570:  <button onClick={() => extendEvent(activeEvent.id, 30)} … >Extend 30 min</button>
app/dashboard/[token]/page.tsx:3185:      <button onClick={()=>extendEvent(activeEvent.id,30)} … >Extend 30 min</button>
```

**Both are RECENTLY-CLOSED BANNERS. READ — the dashboard's, `page.tsx:3153-3157`, unchanged:**

```tsx
            {/* Recently closed banner */}
            {recentlyClosed&&activeEvent&&(
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
                <button onClick={()=>extendEvent(activeEvent.id,30)} className="text-sm font-medium text-teal-600 hover:text-teal-700">Extend 30 min</button>
              </div>
            )}
```

**WHAT HAPPENS TO THEM: NOTHING.** ✅ **`extendEvent` is NOT dead code on either surface and was not
deleted.** ⚠️ **The reasoning, INFERRED and already recorded in the KDS's own comment: a banner that
appears for ten minutes after an event closes is a RECOVERY control, and putting a two-step confirm in
front of a recovery only slows down a truck that is still serving.** **You agreed the KDS's stays;
the dashboard's is its exact mirror, so leaving one and replacing the other would have re-created the
divergence this task exists to remove.**

## B4. What the component needs, and whether both surfaces supply it

**READ — the complete prop list:**

```tsx
  event: { id: string; end_time: string | null; event_date: string | null }
  orders: FinishTimeOrder[]
  busy?: boolean
  onClose: () => void
  onConfirm: (newEnd: string) => void
```

```ts
export type FinishTimeOrder = { slot: string | null; status: string }
```

| Needs | KDS supplies | Dashboard supplies |
|---|---|---|
| `event.id` / `end_time` / `event_date` | ✅ `activeEvent` | ✅ `activeEvent` |
| `orders` — only `slot` + `status` | ✅ `overlayedOrders` | ✅ `eventOrders` |
| `busy` | ✅ `finishTimeBusy` | ✅ `finishTimeBusy` |
| `onClose` / `onConfirm` | ✅ | ✅ |
| 🔴 **ledger rows, balances, payment state** | 🔴 **NOT NEEDED — NOT A PROP** | 🔴 **NOT NEEDED — NOT PASSED** |

# ✅ THE MONEY ASYMMETRY IS A NON-ISSUE, BECAUSE THE COMPONENT ASKS FOR NO MONEY DATA AT ALL.

⚠️ **`FinishTimeOrder` is the narrowest possible shape — two fields, both non-financial.** The
dashboard holds `ledgerRows`, `heldAuthorisations` and `payments`; **none is passed, and the component
has no prop that could accept them.** **INFERRED: that is what makes the two call sites provably
identical rather than merely similar — the surface with more data has no way to feed it in.**

**HOW THE KDS GETS ITS COUNT TODAY — READ, the list it passes and where it comes from:**

```ts
  const overlayedOrders = kdsOverlay.size
    ? orders.map(o => { const ov = kdsOverlay.get(o.order_key); return ov ? ({ ...o, ...ov } as Order) : o })
    : orders
…
  const activeOrders = overlayedOrders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )
```

🔴 **THE KDS PASSES `overlayedOrders`, NOT `activeOrders`, AND THAT IS DELIBERATE.** The component
applies the terminal filter itself, so `component(overlayedOrders)` reproduces `activeOrders`
**exactly** — including the durable offline status overlay, which is the KDS's own answer to counting
an order that has been advanced offline. **C1 confirms the result is unchanged.**

**READ — the dashboard's equivalent, which already carries its own overlay:**

```ts
  const eventOrders=activeEvent
    ?overlayed.filter(o=>o.event_id===activeEvent.id)
    :overlayed
```

## B5. The component and both call sites

**THE COMPONENT — READ, the parts that decide behaviour** (the full file is
`components/shared/EventFinishTimeModal.tsx`):

```tsx
export function EventFinishTimeModal({ event, orders, busy = false, onClose, onConfirm }: { … }) {
  const current = (event.end_time || '').slice(0, 5)
  const [selected, setSelected] = useState(current)
  const [step, setStep] = useState<'pick' | 'confirm'>('pick')

  const options = finishTimeOptions(event.event_date)
  const affected = ordersDueAfter(orders, selected)

  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
…
          <div className="flex gap-2 mt-5">
            <button disabled={busy} onClick={() => onConfirm(selected)}
              className="flex-1 bg-teal-600 text-white font-black text-sm py-2.5 rounded-xl hover:bg-teal-700 disabled:bg-slate-300">
              {busy ? 'Saving...' : 'Change finish time'}
            </button>
            <button disabled={busy} onClick={onClose}
…
              {current ? `Keep ${current}` : 'Keep as is'}
```

```tsx
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
…
          <button
            disabled={options.length === 0 || selected === current}
            onClick={() => setStep('confirm')}
…
            Review change
```

⚠️ **`onConfirm(selected)` HANDS BACK A VALIDATED `HH:MM` AND NOTHING ELSE. The component never
fetches.** That is what lets the KDS keep its outbox branch and the dashboard keep its toast path
without either leaking into the other.

**KDS CALL SITE — READ:**

```tsx
      {finishTimeTarget && (
        <EventFinishTimeModal
          event={finishTimeTarget}
          orders={overlayedOrders}
          busy={finishTimeBusy}
          onClose={() => setFinishTimeTarget(null)}
          onConfirm={newEnd => { void applyFinishTime(finishTimeTarget.id, newEnd) }}
        />
      )}
```

**DASHBOARD CALL SITE — READ:**

```tsx
      {finishTimeTarget&&(
        <EventFinishTimeModal
          event={finishTimeTarget}
          orders={eventOrders}
          busy={finishTimeBusy}
          onClose={()=>setFinishTimeTarget(null)}
          onConfirm={newEnd=>{void applyFinishTime(finishTimeTarget.id,newEnd)}}
        />
      )}
```

✅ **STRUCTURALLY THE SAME FIVE PROPS.** The only difference is the order list each screen already
maintains, and the code-style difference (spaces) is the two files' existing conventions.

**THE DASHBOARD'S NEW HANDLER — READ:**

```ts
  const applyFinishTime=async(eventId:string,newEnd:string)=>{
    setFinishTimeBusy(true)
    try{
      const res=await fetch('/api/events/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action:'update',eventId,payload:{end_time:newEnd}})})
      const data=await res.json(); if(!res.ok) throw new Error(data.error)
      setTodayEvents(prev=>prev.map(e=>e.id===eventId?{...e,end_time:newEnd}:e))
      showToast(`Finish time now ${newEnd}`)
      setFinishTimeTarget(null)
    }catch(err:any){showToast(err.message||'Failed','error')}
    finally{setFinishTimeBusy(false)}
  }
```

⚠️ **It mirrors the dashboard's own `extendEvent` line for line — same fetch, same `setTodayEvents`,
same `showToast` — so it inherits that screen's existing error and offline behaviour rather than
importing the KDS's. See A3's flagged `queued` gap.**

## B6. Back handler on both surfaces, non-committing

**KDS — READ:**

```ts
  // ⚠️ Gated on `!finishTimeBusy` so a press mid-write cannot unmount the modal while its POST is in
  // flight, matching the eventCancelTarget arm below. ONE arm covers both of the modal's steps now that
  // the step lives inside it — and the OUTCOME is unchanged: back at the picker dismissed it, back at
  // the confirm dismissed it, and back at either still does exactly that.
  useAndroidBack([
    [isDemo && showKdsIntro, () => dismissKdsIntro()],
    [!!finishTimeTarget && !finishTimeBusy, () => setFinishTimeTarget(null)],
    [deviceOpen && !isDemo, () => setDeviceOpen(false)],
…
```

**DASHBOARD — READ:**

```ts
  useAndroidBack([
    [!!editItemModal, () => setEditItemModal(null)],
    // NON-COMMITTING, and FIRST because the finish-time modal stacks highest (z-70 confirm over z-60
    // picker). Back dismisses it without writing — it can never be the thing that changes a finish time.
    // Gated on !busy so a press mid-write cannot unmount the modal while its POST is in flight.
    [!!finishTimeTarget && !finishTimeBusy, () => setFinishTimeTarget(null)],
    [!!finishConfirm, () => setFinishConfirm(null)],
…
```

✅ **BOTH ARMS ONLY CLEAR STATE. Neither calls `applyFinishTime`.** ✅ **Both are ordered
innermost-first**, matching each list's existing rule. ⚠️ **The KDS went from two arms to one because
the step moved inside the component; the OUTCOME is identical — see C1.**

---

# PART C — PROVE THE KDS DID NOT CHANGE

## C1. Behaviour after extraction

# ✅ IDENTICAL. Item by item.

| Aspect | Before (inline) | After (shared) | Same? |
|---|---|---|---|
| **Validation** | `new Date(\`${activeEvent.event_date}T${hh}:${mm}\`).getTime() > now` | `new Date(\`${eventDate}T${hh}:${mm}\`).getTime() > now` | ✅ **same expression, `eventDate` is `activeEvent.event_date`** |
| **Boundaries** | `mins += 15`, `0 → 24*60` | **identical loop** | ✅ |
| **Earlier selectable** | loop starts at 0 | **identical** | ✅ |
| **Picker heading** | `Change finish time` | **identical** | ✅ |
| **Empty-list copy** | `There are no times left today. Use Finish event instead.` | **identical** | ✅ |
| **Earlier-time warning** | `That is earlier than the current finish time. Customers will not be able to order for times after it.` | **identical** | ✅ |
| **`(current)` suffix + past-value option** | present | **identical** | ✅ |
| **Review button + disabled rule** | `options.length === 0 \|\| selected === current` | **identical** | ✅ |
| **Confirm heading** | `Change finish time?` | **identical** | ✅ |
| **Confirm sentence** | `This event will finish at X instead of Y.` | **identical** | ✅ |
| **Count wording** | quoted at D3 | **identical, moved verbatim** | ✅ |
| **Buttons** | `Change finish time` / `Keep HH:MM`, `Saving...` while busy | **identical** | ✅ |
| **z-indexes** | picker `z-[60]`, confirm `z-[70]` | **identical** | ✅ |
| **Backdrop click** | closes the picker only | **identical** | ✅ |
| **The count itself** | `activeOrders.filter(o => !!o.slot && o.slot.slice(0,5) > endTime)` | `orders.filter(o => !TERMINAL.includes(o.status) && !!o.slot && o.slot.slice(0,5) > endTime)` over `overlayedOrders` | ✅ **same set — see B4** |
| **Handler** | `applyFinishTime`, outbox branch intact | **unchanged, still in the KDS** | ✅ |

**THE TWO MECHANICAL DIFFERENCES, DECLARED:**

1. **Two states became one.** `finishTimePicker` + `finishTimeConfirm` → `finishTimeTarget`; the step
   moved inside the component. ⚠️ **Observably identical: the picker still writes nothing, the confirm
   is still the only writer, and closing still discards the selection.**
2. **Two back arms became one.** ⚠️ **Observably identical: back at the picker dismissed it and back at
   the confirm dismissed it — and back at either still does exactly that.** The `!busy` gate now also
   covers the picker step, where `busy` can never be true.

## C2. 🔴 `seededRef` and `setSelectedEventId` — untouched

# ✅ CONFIRMED, MECHANICALLY.

```
$ git diff -- "app/dashboard/[token]/kds/page.tsx" | grep -c "seededRef\|setSelectedEventId"
0
```

🔴 **NEITHER IDENTIFIER APPEARS ANYWHERE IN THIS FILE'S DIFF — not added, not removed, not in a moved
line.** **READ — the seed, still exactly as it was:**

```ts
  useEffect(() => {
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
  }, [events, selectedEventId])
```

⚠️ **INFERRED, and it is structural rather than lucky: the modal is display state keyed on
`finishTimeTarget` and appears in no effect's dependency array. SEED ONCE THEN HOLD survives.**

## C3. The recently-closed banner's "Extend 30 min" — unchanged

**READ — the KDS's, `kds/page.tsx:1567-1571`:**

```tsx
      {recentlyClosed && activeEvent && (
        <div className="mx-3 mt-2 mb-1 bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-between flex-shrink-0">
          <span className="text-sm text-slate-600">Event finished · {activeEvent.venue_name} ended at {formatTime(activeEvent.end_time)}</span>
          <button onClick={() => extendEvent(activeEvent.id, 30)} className="text-sm font-medium text-teal-600 hover:text-teal-700 ml-3 flex-shrink-0">Extend 30 min</button>
        </div>
      )}
```

# ✅ ABSENT FROM THE DIFF, PROVEN:

```
$ git diff | grep -n "^[+-].*Extend 30 min"
409:+                  ⚠️ The recently-closed banner's separate "Extend 30 min" is UNCHANGED and still calls
```

🔴 **THE ONLY ADDED OR REMOVED LINE MENTIONING IT IS MY OWN COMMENT SAYING IT IS UNCHANGED.** Neither
banner's markup is added or removed on either surface. ✅ **The dashboard's mirror at `page.tsx:3185`
is equally untouched.**

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
$ git diff --stat
 app/dashboard/[token]/kds/page.tsx | 220 +++++++++++++++----------------------
 app/dashboard/[token]/page.tsx     |  64 ++++++++++-
 app/manage/[token]/page.tsx        |  35 +++++-
 components/DemoGetStarted.tsx      |  80 ++++----------
 components/dashboard/OrderCard.tsx |  24 ++++
 5 files changed, 231 insertions(+), 192 deletions(-)
```

🔴 **ONLY TWO OF THOSE FIVE ARE THIS TASK'S** — `kds/page.tsx` and `page.tsx` — **plus the untracked
`components/shared/EventFinishTimeModal.tsx`. The other three are the two previous tasks' (E6).**

| Boundary | Proof |
|---|---|
| **No payment path** | `lib/payments/**` absent; the component has no money prop (B4) |
| **No capacity engine** | `lib/slot-bookings.ts`, `lib/capacity-breach.ts`, `lib/slot-generation.ts` absent |
| **No gate** | `lib/features.ts`, `lib/plan-features.ts` absent |
| **No migration** | `supabase/**` absent; **no SQL run** |
| **No API route** | `app/api/**` absent — both handlers POST to the **existing** `update` action |
| **No shared-component regression** | `components/shared/EventCancelModal.tsx` untouched |

## D2. What a Pizzeria Gusto operator sees differently

**On the KDS, nothing at all.** The Event actions menu still offers `Change event finish time
(now 21:00)`, the picker still lists every 15-minute boundary still ahead of the clock in both
directions, the confirm still names the before and after and still counts the orders due after the new
time, and the wording is identical to the character — the control simply lives in a shared file now.
🔴 **On the dashboard, the change is real and it is a workflow change: `Extend event +30 min` IS GONE.**
Where one tap used to add thirty minutes immediately, with no dialog and no undo, there is now
`Change event finish time (now 21:00)`, which opens a picker and then a confirmation — **two deliberate
presses instead of one, both showing the before and after.** Anyone who used the old button as a quick
"give me another half hour" will find that tap no longer does anything on its own, and must now pick
21:30 and confirm it. ✅ **In exchange they can bring a finish time FORWARD**, which the old control
could never do, and an accidental press now changes nothing. ⚠️ **The one-tap `Extend 30 min` in the
recently-closed banner is untouched on both screens, so recovering an event that has already ended is
as fast as it ever was.**

## D3. The affected-order count on BOTH surfaces

# ✅ CONFIRMED — because it is one block of JSX in one file, rendered by both call sites.

**READ — `components/shared/EventFinishTimeModal.tsx`, the only copy that now exists:**

```tsx
          {affected > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-3">
              <span className="font-bold">{affected} order{affected === 1 ? ' is' : 's are'} due after {selected}.</span>{' '}
              {affected === 1 ? 'It stays' : 'They stay'} on the board and still {affected === 1 ? 'needs' : 'need'} making. Changing the finish time only stops NEW orders being placed for later times.
            </p>
          )}
```

| Surface | Order list feeding `affected` | Count shown? |
|---|---|---|
| **KDS** | `overlayedOrders` → terminal filter inside → **equals `activeOrders`** | ✅ **YES** |
| **Dashboard** | `eventOrders` → same terminal filter inside | ✅ **YES** |

⚠️ **THE DASHBOARD NEVER SHOWED THIS BEFORE.** `Extend event +30 min` displayed no count at all — and
because it could only extend, it could not orphan an order in the first place. **The shared control can
shorten, so the count is not a nicety there: it is the thing that stops a shortening being silent.**

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census, before and after

### `app/dashboard/[token]/kds/page.tsx` — 33 classes BEFORE, **33 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 51 | 48 | **−3** | headline markers **moved into the component** (which has 6) |
| U+2014 EM DASH | 158 | 155 | **−3** | prose moved with them |
| U+2500 BOX DRAWINGS | 1499 | 1466 | **−33** | two comment box rules moved out, one shorter one added |
| U+26A0 WARNING SIGN | 39 | 35 | **−4** | caveat markers moved out |
| U+FE0F VAR SELECTOR-16 | 39 | 35 | **−4** | ✅ **exactly matches the U+26A0 delta** |
| *all 28 other classes* | — | — | **0** | unchanged |

✅ **NO CLASS GAINED, NO CLASS LOST. Every delta is negative because this file is where code was
REMOVED from.**

### `app/dashboard/[token]/page.tsx` — 53 classes BEFORE, **53 AFTER**

| Class | BEFORE | AFTER | Δ | Explanation |
|---|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 88 | 91 | **+3** | headline markers in the new comments |
| U+2014 EM DASH | 502 | 509 | **+7** | prose in the new comments |
| U+2192 RIGHTWARDS ARROW | 113 | 112 | **−1** | the deleted comment `(extendEvent → end_time)` |
| U+2500 BOX DRAWINGS | 2173 | 2290 | **+117** | two comment box rules |
| U+26A0 WARNING SIGN | 71 | 75 | **+4** | caveat markers — **all 4 paired** |
| U+FE0F VAR SELECTOR-16 | 69 | 73 | **+4** | ✅ **exactly matches the U+26A0 delta** |
| *all 47 other classes* | — | — | **0** | unchanged |

✅ **NO CLASS GAINED, NO CLASS LOST.**

### `components/shared/EventFinishTimeModal.tsx` — NEW FILE, 7 classes

**No "before" exists, so no class can be gained.** ⚠️ **Every class in it already existed in both files
it serves:**

```
U+00A7  1     the §38 citation
U+1F534 6     headline markers
U+2014  10    em dashes in prose
U+2192  1     one arrow
U+2500  231   comment box rules
U+26A0  6     caveat markers — ALL PAIRED
U+FE0F  6     exactly matches the U+26A0 count
```

🔴 **NO NEW GLYPH WAS INTRODUCED ANYWHERE. The operator-facing copy is pure ASCII** — `Change finish
time`, `Review change`, `Keep 21:00`, `Saving...` — **so nothing in the extraction can render
differently on the two surfaces.**

## E3. 🔴 Carrier-aware variation-selector check

| File | Base | BEFORE n / paired / bare | AFTER n / paired / bare | Verdict |
|---|---|---|---|---|
| **KDS** | U+26A0 | 39 / 38 / **1** | 35 / 34 / **1** | ✅ **bare UNCHANGED at 1** |
| | U+2705 | 2 / 0 / 2 | 2 / 0 / 2 | ✅ unchanged |
| | U+1F534 | 51 / 0 / 51 | 48 / 0 / 48 | ✅ consistent — all bare |
| **Dashboard** | U+26A0 | 71 / 68 / **3** | 75 / 72 / **3** | ✅ **bare UNCHANGED at 3** |
| | U+2705 | 4 / 0 / 4 | 4 / 0 / 4 | ✅ unchanged |
| | U+1F534 | 88 / 0 / 88 | 91 / 0 / 91 | ✅ consistent — all bare |
| **New component** | U+26A0 | *(new)* | 6 / **6** / **0** | ✅ **all paired** |
| | U+1F534 | *(new)* | 6 / 0 / 6 | ✅ matches both parents' bare form |

🔴 **THE BARE U+26A0s ARE PRE-EXISTING — ONE IN THE KDS, THREE IN THE DASHBOARD — AND BOTH COUNTS ARE
UNCHANGED.** All warning signs added are paired; the four the KDS lost were paired ones moving into the
component, which is why its U+26A0 and U+FE0F fell by exactly the same amount.

## E4. Byte scan of every edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/dashboard/[token]/kds/page.tsx        123,132 bytes  offending=0  CR=0   (was 130,627)
  app/dashboard/[token]/page.tsx            394,728 bytes  offending=0  CR=0   (was 390,162)
  components/shared/EventFinishTimeModal.tsx 11,230 bytes  offending=0  CR=0   (new)
```

✅ **Zero offending bytes, zero CR, before and after, in all three.** ⚠️ **The KDS shrank by 7,495 bytes
and the dashboard grew by 4,566 — net −2,929 across the two, with the component at 11,230. INFERRED:
the extraction is not a net duplication; the new file carries more comment than either copy did,
which is deliberate for a file two surfaces depend on.**

## E5. Byte scan of this report

Separate pass, run after writing: **44,731 bytes, offending = 0, CR = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR. **Carrier-aware check on this report:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 77 | 0 | 77 |
| U+1F534 LARGE RED CIRCLE | 38 | 0 | 38 |
| U+26A0 WARNING SIGN | 38 | **38** | **0** |

**Every warning sign in this report is paired; ZERO are bare — 38 of 38**, and the file's total U+FE0F
count is **38**, which accounts for all of them and leaves none attached to any other base. ⚠️ **The
two unpaired bases are internally consistent (0 of 77, 0 of 38), so neither is split across two
renderings.** ✅ **U+2500 does not appear in this report at all.**

## E6. 🔴 `git status`, and which entries are THIS task's

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/OrderCard.tsx
?? components/shared/CuisinePicker.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-ready-toggle-report.md
```

| Entry | This task? |
|---|---|
| `?? components/shared/EventFinishTimeModal.tsx` | ✅ **YES — the extracted component** |
| `M app/dashboard/[token]/page.tsx` | ✅ **YES — the divergent control replaced** |
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **PARTLY — this task extracted the modal; the SAME FILE also carries the earlier ready-step toggle, still uncommitted** |
| `?? docs/finish-time-dry-report.md` | ✅ **YES — this report** |
| `M app/manage/[token]/page.tsx` | ❌ **NO — the cuisine dropdown task** |
| `M components/DemoGetStarted.tsx` | ❌ **NO — the cuisine dropdown task** |
| `?? components/shared/CuisinePicker.tsx` | ❌ **NO — the cuisine dropdown task** |
| `M components/dashboard/OrderCard.tsx` | ❌ **NO — the KDS ready-step toggle task** |
| `?? docs/cuisine-field-report.md` | ❌ **NO — the cuisine task's report** |
| `?? docs/kds-ready-toggle-report.md` | ❌ **NO — the ready-step task's report** |

⚠️ **THREE TASKS' WORK IS NOW STACKED UNCOMMITTED, AND `kds/page.tsx` CARRIES TWO OF THEM.** **INFERRED:
if you want them landed separately, this is the point to commit — the finish-time change and the
ready-step change are independent but share that file.**

---

# PART F — WHAT YOU MUST TEST

**Run every item on BOTH surfaces. "Dashboard" = Event actions ▾ → Change event finish time;
"KDS" = Event actions ▾ → Change event finish time.**

**1. The entry point.**
**PASS (both):** the menu shows `Change event finish time (now HH:MM)` with the event's real finish
time. 🔴 **On the dashboard, `Extend event +30 min` is GONE.**
**FAILURE:** the old `+30 min` button is still there, or the label shows `(now )`.

**2. A LATER time — dashboard.** Pick a time after the current finish → Review change → Change finish
time.
**PASS:** toast `Finish time now HH:MM`; the header's time range updates; the KDS shows the same new
time after a refresh.
**FAILURE:** no toast, or the two surfaces disagree.

**3. A LATER time — KDS.** Same.
**PASS:** toast `Finish time now HH:MM`, and the dashboard agrees.
**FAILURE:** as above. ⚠️ **If only one surface updates, the write went somewhere different — tell
me.**

**4. 🔴 An EARLIER time — dashboard.** With the event running until 21:00, pick ~15 minutes ahead of
now.
**PASS:** it is **selectable**, an amber note appears in the picker, and it applies. 🔴 **This is the
capability the old dashboard control never had.**
**FAILURE:** earlier times missing or greyed out.

**5. 🔴 An EARLIER time — KDS.** Same.
**PASS:** identical to item 4 — same list, same amber note, same wording.
**FAILURE:** any difference from the dashboard. ⚠️ **Any divergence here means the extraction did not
take.**

**6. 🔴 A PAST time — both.** Look for times already gone.
**PASS:** they are **not in the list at all**; only the current finish appears as a non-submittable
`(current)` entry once it is past.
**FAILURE:** any time earlier than the clock is offered. ⚠️ **Also leave the picker open across a
quarter-hour boundary, then reopen it — the just-passed time must be gone.**

**7. 🔴 CANCEL AT THE CONFIRM — both, and verify NOTHING was written.** Open it, pick a new time, press
Review change, then press **`Keep HH:MM`**. Then re-open the menu and read the label.
**PASS:** the label still shows the ORIGINAL finish time, no toast fired, and a page refresh confirms
the stored value is unchanged.
**FAILURE:** the time changed, or a toast appeared. 🔴 **This is the whole point of replacing the
dashboard's control — report it immediately.**

**8. Backdrop and back — both.** Repeat item 7 but dismiss via the backdrop at the picker step, and on
Android via the back gesture at **both** the picker and the confirm.
**PASS:** in every case the finish time is unchanged and no toast fires.
**FAILURE:** any of them writes. 🔴 **Back committing a change is the worst possible result.**

**9. The no-op guard — both.** Open it and press Review change without changing anything.
**PASS:** the button is disabled.
**FAILURE:** it opens a confirm for a change to the same time.

**10. 🔴 AN ORDER DUE AFTER A SHORTENED FINISH — both.** Take an order for a late slot, then set the
finish time earlier than it.
**PASS:** the confirm names the count (`1 order is due after 19:30…`) **with identical wording on both
surfaces**; after applying, that order is **still on the board, still cookable, still completable**,
and the customer ordering page no longer offers times after 19:30.
**FAILURE:** the order vanishes, changes status, or is cancelled — **stop and tell me**. ⚠️ **Expected
and NOT a failure: the customer is not notified.**
⚠️ **Compare the counts across the two screens on the same event — they must match.**

**11. The recently-closed banners are untouched — both.** Finish an event, then look at the banner
within ten minutes.
**PASS:** `Extend 30 min` is still there and still works in **one tap, with no confirm**, on both
screens.
**FAILURE:** it is missing, or it now opens a picker. ⚠️ **You agreed these stay; a confirm in front of
a recovery control is the thing to avoid.**

**12. 🔴 THE KDS SEED STILL HOLDS.** On a day with more than one event, open the KDS, change the finish
time, and keep working for a few minutes.
**PASS:** the selected event does **not** change at any point.
**FAILURE:** the board jumps to a different event. 🔴 **SEED ONCE THEN HOLD is the regression to watch
hardest here — report it at once.**
