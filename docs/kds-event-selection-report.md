# KDS event selection — seed once, then hold. FIXED

**This file replaces the read-only diagnosis of the same name.** That diagnosis found the divergence;
this records the fix.

Scope honoured: **two files, `app/dashboard/[token]/page.tsx` (one function) and
`app/dashboard/[token]/kds/page.tsx`.** No `next dev`, no `next build`, no `cap sync`, no deploy, no
commit, no database write, no Stripe call, no migration, nothing under `lib/payments/`, `lib/slot*`,
`lib/capacity*` or `lib/features`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Dashboard and KDS are near-duplicate surfaces and are reported **separately**. Every claim is marked
**READ** or **INFERRED**.

> ✅ **VERIFIED: `npx tsc --noEmit` exits 0 with no output — the whole project type-checks clean after
> the change.** That is a real check, not a build: no emit, no `.next`, no bundler.

---

# PART A — THE HANDOFF

## A1. `openKDS` — before and after

**BEFORE — READ**, `app/dashboard/[token]/page.tsx:1181-1188`:

```tsx
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    if(isNativeApp()){
      const q=van?.id?`?van_id=${encodeURIComponent(van.id)}${van.name?`&van_name=${encodeURIComponent(van.name)}`:''}`:''
      router.push(`/dashboard/${token}/kds${q}`)
      return
    }
    window.open(van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds`,'_blank')
  }
```

**AFTER — READ, as committed:**

```tsx
  // 🔴 THE EVENT TRAVELS WITH THE HANDOFF, EXACTLY AS THE VAN ALREADY DOES. Without it the KDS
  // re-derived its own answer and the two screens could sit on different events — observed 15 August:
  // this dashboard on tomorrow's event while the KDS held today's finished one with unserved orders.
  // The KDS treats this as a SEED it applies once and then holds; it does not follow later changes here,
  // which is deliberate (see the seed note in kds/page.tsx). Nothing about how THIS page picks its event
  // is touched — `selectedEventId` is read, never written, by this function.
  // ⚠️ Both routes carry it. The web branch opens a NEW TAB, which has no other way to know.
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    const ev=selectedEventId?`event_id=${encodeURIComponent(selectedEventId)}`:''
    if(isNativeApp()){
      const parts=[
        van?.id?`van_id=${encodeURIComponent(van.id)}`:'',
        van?.id&&van.name?`van_name=${encodeURIComponent(van.name)}`:'',
        ev,
      ].filter(Boolean)
      router.push(`/dashboard/${token}/kds${parts.length?`?${parts.join('&')}`:''}`)
      return
    }
    // ⚠️ The van's STANDALONE /kds/[kds_token] surface is a different page and is left exactly as it
    // was — it has no dashboard behind it to hand anything over. Only the in-app KDS gains the seed.
    window.open(van?.kds_token?`/kds/${van.kds_token}`:`/dashboard/${token}/kds${ev?`?${ev}`:''}`,'_blank')
  }
```

⚠️ **One deliberate difference from a naive edit:** the native branch's query string was built by string
concatenation that only produced a `?` when a van existed. **An event with no van would have produced
`event_id=…` with no leading `?`.** The parts array fixes that and is why the shape changed rather than
one term being appended.

## A2. The multi-van picker

✅ **It carries the event too, and it does so by construction rather than by a second edit. READ**,
`app/dashboard/[token]/page.tsx:4346` (**unchanged**):

```tsx
              <button key={van.id} onClick={()=>{openKDS(van);setShowKDSPicker(false)}} className="w-full py-3 px-4 border border-slate-200 rounded-xl …">
```

**READ**, `handleOpenKDS` (**unchanged**):

```tsx
  const handleOpenKDS=()=>{
    if(vans.length===1){openKDS(vans[0]);return}
    if(vans.length===0){openKDS();return}
    setShowKDSPicker(true)
  }
```

🔴 **All three routes — one van, no van, and the picker — funnel through the single `openKDS` above**,
so the event is attached in exactly one place and the two routes cannot drift.

## A3. The dashboard's own event selection is untouched

✅ **CONFIRMED, and proven from the diff rather than asserted.** The dashboard's diff is **20 lines,
entirely inside `openKDS`**. Filtering it for every identifier that participates in selection:

```
$ git diff -- "app/dashboard/[token]/page.tsx" | grep -E "^[-+]" | grep -E "setSelectedEventId|pickDefaultEventByTime|auto-select|priority|upcomingEvents|selectedOrDefaultEvent"
NONE
```

**No added or removed line writes `setSelectedEventId`, calls `pickDefaultEventByTime`, touches the
four-priority auto-select chain, `upcomingEvents`, or `selectedOrDefaultEvent`.** ✅ `openKDS` **reads**
`selectedEventId` and never writes it. **Gusto's order-taking surface behaves identically.**

---

# PART B — THE KDS SEED

## B1. The resolution before the change

**READ**, `app/dashboard/[token]/kds/page.tsx:420-431` as it stood:

```tsx
  // SINGLE active-event resolution (also drives ● Live, the pause/extra-wait target, and the render
  // below): the selected event, else the live → confirmed → first today event. Declared here, above
  // the heartbeat effect, so the heartbeat can gate on its live status. "live" = status==='open'
  // (live-redefinition) — the same rule as the customer page, TruckListCard, the dashboard, and the
  // heartbeat-monitor.
  const activeEvent: TruckEvent | null = selectedEventId
    ? todayEvents.find(e => e.id === selectedEventId) ?? null
    : (todayEvents.find(e => e.status === 'open')
      ?? todayEvents.find(e => e.status === 'confirmed')
      ?? todayEvents[0]
      ?? null)
  const activeEventLive = activeEvent?.status === 'open'
```

**And the state it read from:**

```tsx
  const [todayEvents, setTodayEvents] = useState<TruckEvent[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
```

## B2. The replacement — the dashboard's id, else `pickDefaultEventByTime`

**The candidate set first — READ, as committed:**

```tsx
  // ── THE CANDIDATE SET ────────────────────────────────────────────────────────────────────────
  // Every upcoming event (today onward) — the SAME set the dashboard resolves over, so the id it hands
  // us can always be found. This was `todayEvents`, filtered to today with a UTC date string: it could
  // not hold tomorrow's event, which is why a handoff alone would not have been enough.
  const [events, setEvents] = useState<TruckEvent[]>([])
  // 🔴 SEEDED FROM THE URL AT MOUNT, so a KDS opened from the dashboard is scoped on its FIRST fetch.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(seedEventId || null)
  // 🔴 THE LATCH THAT MAKES THIS "SEED ONCE, THEN HOLD". Set the first time an event is resolved and
  // never cleared. Every path that resolves an event checks it, so a refetch, a poll, a re-render or a
  // resume after hours in the background CANNOT pick a different event. See the seed effect below.
  const seededRef = useRef(false)
```

**And the seed param, mirroring the van params it sits beside — READ:**

```tsx
  const vanId = searchParams.get('van_id') ?? ''
  const vanName = searchParams.get('van_name') ?? ''
  // 🔴 THE SEED FROM THE DASHBOARD. Same handoff mechanism as van_id above. Read ONCE, into the initial
  // state below; nothing re-reads it, so a later navigation cannot move an event out from under a cook.
  const seedEventId = searchParams.get('event_id') ?? ''
```

**The seed effect — READ, as committed:**

```tsx
  // ── 🔴 THE SEED. RUNS ONCE, EVER. ───────────────────────────────────────────────────────────────
  // Priority 1: the id handed over by the dashboard (?event_id=), IF it is one of this truck's upcoming
  //             events. Membership is the validation — an id for another truck, or a deleted, cancelled
  //             or past event, simply is not in the list and falls through, which is the no-param path.
  // Priority 2: pickDefaultEventByTime over the SAME candidate set the dashboard uses. Its documented
  //             order is "in progress by time, else earliest upcoming, else most recent past", which is
  //             precisely "the current or next event". THE SECOND RESOLVER THAT WAS HERE IS DELETED —
  //             there is now one implementation of this question and both surfaces call it.
  // 🔴 `seededRef` is set BEFORE anything else and never cleared, so this body cannot run twice however
  // many times `events` changes. That is the guarantee behind "seed once, then hold".
  useEffect(() => {
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
  }, [events, selectedEventId])
```

✅ **Target 5 satisfied: `pickDefaultEventByTime` is imported and called. No second resolver was
written — the one that existed was deleted.** **READ**, the import line as committed:

```tsx
import { formatTime, formatTimeRange, localTodayIso, pickDefaultEventByTime } from '@/lib/time-utils'
```

## B3. 🔴 SEED ONCE — the code that guarantees it, and the two-hour question

**READ, as committed — the resolution is now a lookup with no fallback:**

```tsx
  // ── 🔴 SINGLE ACTIVE-EVENT RESOLUTION: A HELD VALUE, NOT A DERIVATION ────────────────────────────
  // This is a LOOKUP of the seeded id and nothing else. The status-keyed fallback chain that used to sit
  // here — `open ?? confirmed ?? todayEvents[0]` — is GONE, and its absence is the whole fix.
  //
  // 🔴 WHY A FALLBACK HERE WOULD BE A KITCHEN DEFECT. This expression re-evaluates on every render, and
  // the render is driven by a poll. Anything time- or status-dependent in it is an AUTO-ADVANCE: the
  // moment an event's end time passed, or its status flipped to 'closed', the board would silently move
  // to the next event and take a cook's unserved orders off the screen. Nobody is watching this display.
  // A held value cannot do that. If the seeded event has finished, it STAYS — with its late orders on it
  // — until a human taps the picker.
  const activeEvent: TruckEvent | null = selectedEventId
    ? events.find(e => e.id === selectedEventId) ?? null
    : null
```

**Three independent guarantees, all READ:**

| # | Guarantee | Mechanism |
|---|---|---|
| 1 | **A poll or refetch cannot re-resolve** | `activeEvent` contains **no** time test, **no** status test and **no** array index. It is `events.find(id)`. A refetch changes the array's contents, never which id is held. |
| 2 | **The seed effect cannot run twice** | `if (seededRef.current) return`, and `seededRef.current = true` is set **before** any branch. A ref survives re-renders and is never reset. |
| 3 | **A re-render cannot re-resolve** | there is no `useMemo`, no derived default and no `??` chain left to re-evaluate. |

### 🔴 Backgrounded for two hours, then resumed — stated plainly

**The KDS shows exactly the event it was showing two hours earlier, with that event's orders,
including any that are now hours late.**

**INFERRED, from the mechanisms above:** a resume runs the poll (`fetchAll`) and re-renders. The poll
refreshes `events` and `orders`; `seededRef.current` is already `true`, so the seed effect returns at its
first line; `activeEvent` re-runs its `find` against the **same held id** and returns the same event.
**Nothing in that path consults the clock.** ⚠️ The one visible change is that the event's own `status`
may have flipped to `'closed'` server-side, so the header reads "Finished" — **the board does not move.**

⚠️ **The one case where the held event disappears:** it was **cancelled or deleted** while the app was
away, so `find` returns `undefined` and `activeEvent` is `null`. **INFERRED: the screen renders its
existing no-event state**, and the picker is there to choose another. **It does not silently jump to a
different event, which is the behaviour being protected.**

## B4. The UTC date — fixed, with the local helper the dashboard uses

**BEFORE — READ**, `kds/page.tsx:264`:

```tsx
        const todayStr = new Date().toISOString().split('T')[0]
        const fetched = (eventsData.events ?? []).filter((e: TruckEvent) => e.event_date === todayStr)
```

**THE DASHBOARD'S VERSION, for comparison — READ**, `page.tsx:846` (**unchanged by this task**):

```tsx
          const todayStr=localTodayIso() // LOCAL date (s.7) — UTC toISOString rolls at UTC midnight
```

**AFTER — READ, as committed:**

```tsx
        // ⚠️ THE AUTO-OPEN LOOP IS THE ONE PLACE "TODAY" STILL MATTERS, AND IT MATTERS A LOT: the test is
        // `start_time <= currentTime`, a bare wall-clock string. Run against the unfiltered list it would
        // fire `action: 'open'` on TOMORROW's event the moment today's clock passed its start time. So the
        // date filter stays here, and it is now LOCAL — §7: never use toISOString() (UTC) to decide
        // whether an event date is "today". In BST the UTC string is still yesterday until 01:00.
        const todayStr = localTodayIso()
        const currentTime = new Date().toTimeString().slice(0, 5)
        const stale = fetched.filter((e: TruckEvent) =>
          e.event_date === todayStr && e.status === 'confirmed' && e.auto_open === true && e.start_time <= currentTime
        )
```

🔴 **A hazard found while making this change, and worth recording: widening the candidate set without
keeping a date filter on the AUTO-OPEN loop would have made the KDS fire `action: 'open'` on TOMORROW's
event** — the test is a bare `HH:MM` string comparison with no date in it. **That would have opened an
event a day early, on a live truck.** The filter is retained *for that loop only*, and is now local.

## B5. A finished seeded event still shows, with its unserved orders

✅ **Confirmed by absence, which is the strongest form here: there is no code left that could advance.**

- `activeEvent` — no `end_time` test, no `status` test. **Quoted in full at B3.**
- the seed effect — latched. **Quoted at B2.**
- `fetchAll` — writes `events` and `orders`; **never writes `selectedEventId`.**
- **NOT FOUND: any `setSelectedEventId` call on a timer, an interval, a poll, a visibility change or a
  network event.** The only three call sites are the seed effect, `switchEvent` (an operator tap) and
  the cancel handler (an operator action).

**READ** — and the orders themselves were never event-gated by status on this surface; the KDS renders
active-status orders for the scoped event, so the "340m late" cards stay exactly where they are.

---

# PART C — THE KDS EVENT PICKER

## C1. Is the dashboard's picker reusable?

**NOT FOUND: any shared event-picker component.** `components/dashboard/` contains no file with "event"
in its name.

**READ** — the dashboard's picker is inline inside **AddOrderPanel** (`showEventPicker`,
`AddOrderPanel.tsx:2400`), reached through `openEventPicker` and driven by the dashboard's
`onEventChange` prop:

```tsx
            onEventChange={(id)=>{
              // EVENT-SWITCH GATE backstop: never switch to a never-loaded event offline (the picker also
              // greys/blocks these). Online → always allowed. Current event is always in loadedEventIds.
              if(isOffline&&!loadedEventIds.has(id)){showToast('Reconnect to load this event','error');return}
              setSelectedEventId(id)
            }}
```

🔴 **NOT REUSABLE, and extracting it was rejected.** It is entangled with the order-taking panel: it
depends on `loadedEventIds`, the offline event-switch gate, the demo lock and the panel's own state.
**Pulling it out would mean touching AddOrderPanel — the operator's live order-taking surface on a truck
trading with real money — to change a kitchen screen.** That is a far larger blast radius than the
problem justifies.

**What I did instead — the minimum:** the KDS **already had** a chip row and a `switchEvent` handler
(near-copies of the dashboard's, down to the confirm wording). **I widened the list it iterates and
strengthened its confirm. No new component was built.**

**READ, as committed:**

```tsx
      {events.length > 1 && (
        <div className="flex gap-2 px-4 py-2 border-b border-slate-100 overflow-x-auto flex-shrink-0">
          {events.map(event => {
            const isToday = event.event_date === localTodayIso()
            const dayLabel = isToday ? '' : ` ${new Date(`${event.event_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}`
            return (
              <button key={event.id} onClick={() => switchEvent(event)}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  activeEvent?.id === event.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}>
                {event.venue_name.split(',')[0]} {formatTime(event.start_time)}{dayLabel}{event.status === 'open' ? ' ●' : ''}
              </button>
            )
          })}
        </div>
      )}
```

⚠️ **The date label is not decoration.** "Nethergate 12:00" and "Old Goat 12:00" are indistinguishable
without it, **and the entire defect being fixed was two screens on two different days.**

## C2. Reachable without leaving the KDS, and hard to hit by accident

✅ **Reachable:** the chip row is in the KDS's own header area — no navigation, no modal, no dashboard.

🔴 **Not accidental:** every switch now goes through a confirm. **READ, as committed:**

```tsx
  const switchEvent = (event: TruckEvent) => {
    const active = selectedEventId ? events.find(e => e.id === selectedEventId) ?? null : null
    if (active && event.id !== active.id) {
      const onScreen = orders.filter(o => ['pending', 'confirmed', 'modified', 'cooking', 'ready'].includes(o.status)).length
      const orderPart = onScreen > 0 ? ` ${onScreen} order${onScreen === 1 ? '' : 's'} on this screen will be replaced.` : ''
      if (!window.confirm(`Switch from ${active.venue_name} to ${event.venue_name}?${orderPart} Tap the current event to switch back.`)) return
    }
    setSelectedEventId(event.id)
  }
```

⚠️ **The confirm now fires on EVERY switch. Previously it fired only when the current event was
`'open'`** — which meant a finished event, the exact case where unserved food is still on the screen,
switched away **silently on one tap**. The dialog also names **how many orders are about to leave the
screen**, because that is the thing an operator actually loses sight of.

## C3. Changing event does not re-enable auto-resolution

✅ **`switchEvent` calls `setSelectedEventId(event.id)` and nothing else. It never touches
`seededRef`**, which is already `true`, so the seed effect stays latched. **The operator's choice becomes
the new held value and is held on exactly the same terms as the seed.**

---

# PART D — THE THREE INCIDENTAL DEFECTS

## D1. The failed-fetch guard

**BEFORE — READ:**

```tsx
      try {
        const eventsRes = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
        const eventsData = await eventsRes.json()
        const todayStr = new Date().toISOString().split('T')[0]
        const fetched = (eventsData.events ?? []).filter((e: TruckEvent) => e.event_date === todayStr)
        setTodayEvents(fetched)
```

**AFTER — READ, as committed:**

```tsx
      try {
        const eventsRes = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
        // 🔴 NEVER REPLACE GOOD EVENT STATE WITH DATA FROM A FAILED RESPONSE. A 429 or 500 returns valid
        // JSON without `.events`, and `?? []` turned that into an EMPTY candidate set — which blanked the
        // active event on a kitchen screen mid-service until the next successful poll. The dashboard has
        // carried this guard for some time; this surface did not. Keep what we have and try again.
        if (!eventsRes.ok) {
          console.warn('[kds] events fetch failed:', eventsRes.status, '— keeping the events we already have')
        } else {
        const eventsData = await eventsRes.json()
        // The FULL upcoming list, unfiltered — see the candidate-set note on `events`.
        const fetched: TruckEvent[] = eventsData.events ?? []
        setEvents(fetched)
```

✅ **A transient 429 now leaves the held event and its orders exactly as they are.**

## D2. The unscoped first fetch

**READ, as committed** — the code line is unchanged; what changed is that `selectedEventId` is no longer
null at mount when the KDS was opened from the dashboard:

```tsx
      // event_id scopes the slot projection to the active event (re-key fix).
      // 🔴 OPENED FROM THE DASHBOARD THIS IS SET ON THE VERY FIRST FETCH, because `selectedEventId` is
      // initialised from ?event_id= at mount rather than left null until an operator taps something. That
      // closes the old hole: the control that used to be the only way to set it is a chip row that does
      // not render at all when a truck has one event, so a single-event day fetched unscoped forever and
      // relied on a server-side date fallback to guess.
      // ⚠️ HONEST LIMIT — A COLD LAUNCH STILL MAKES ONE UNSCOPED FETCH. The seed for that path comes from
      // `pickDefaultEventByTime` over the events list, and that list arrives INSIDE this same request, so
      // there is nothing to scope by yet. When it lands, the seed effect sets the id, `fetchAll`'s
      // identity changes, and the next fetch is scoped. Closing that too would mean fetching events
      // before orders — a second round trip on the slowest path there is, for one poll of imprecision.
      if (selectedEventId) params.set('event_id', selectedEventId)
```

⚠️ **Fixed for the handoff path, improved but not eliminated for cold launch — stated rather than
claimed.** Eliminating it entirely needs a fetch reordering, which is beyond this scope.

## D3. Anything that could not be fixed in scope

✅ **Nothing was blocked.** All three were fixable inside the two files.

⚠️ **One adjacent change was required and is called out rather than buried:** the **cancel** handler used
to set `selectedEventId` to `null` and rely on the deleted fallback chain to pick the next event. With
the chain gone that would have stranded the board blank. **READ, as committed:**

```tsx
      // 🔴 THE ONE PLACE THE DEFAULT PICK RUNS AGAIN, AND IT IS OPERATOR-INITIATED. The held event has
      // just been cancelled by a human on this screen, so there is nothing left to hold; leaving
      // `selectedEventId` null would strand the board on a blank event with no way back (the seed latch
      // has long since fired). This is a deliberate re-pick at the moment of a deliberate action — it is
      // NOT the automatic re-resolution the latch exists to prevent, and it cannot fire on a poll.
      const remaining = events.filter(e => e.id !== eventId)
      setEvents(remaining)
      setSelectedEventId(pickDefaultEventByTime(remaining)?.id ?? null); setShowEventMenu(false); showKdsToast('Event cancelled')
```

---

# PART E — BOUNDARIES

## E1. `git diff --stat`, and what did not change

```
 app/dashboard/[token]/kds/page.tsx | 176 +++++--
 app/dashboard/[token]/page.tsx     |  20 +-
 docs/push-registration-report.md   | 978 +++++++++++++++++++++----------------
 docs/reference-manual.md           | 595 +++++++++++++++++++++-
 ios/App/App/AppDelegate.swift      |  41 ++
```

**THIS TASK'S ENTRIES ARE THE TWO `page.tsx` FILES AND THIS REPORT.** The other three predate it (the
APNs work and the V11.19 manual update).

**Proof by path, counted from the diff:**

| Concern | Files in the diff |
|---|---|
| `lib/payments` | **0** |
| `lib/slot*` (capacity engine) | **0** |
| `lib/capacity*` | **0** |
| `supabase/migrations` | **0** |
| `lib/features` / `lib/plan-features` (gates) | **0** |
| `middleware` | **0** |
| `api/orders` | **0** |
| `api/dashboard/action` | **0** |

✅ **No payment path, no capacity engine, no gate, no migration, no API route at all.** Two client
components.

## E2. 🔴 What changes for Pizzeria Gusto mid-service

**When an event ends while orders are unserved, nothing happens to the board — and that is the point.**
Today's KDS holds a finished event only because it cannot see tomorrow; after this change it can see
tomorrow and still holds, because holding is now the explicit mechanism rather than an accident. The
seeded event stays on screen with its late orders until a cook or the operator taps a chip and confirms
a dialog that names the venue they are leaving and how many orders will disappear with it. On resume
after any length of time in the background — two minutes or two hours — the KDS re-polls, re-renders,
and shows **the same event it was showing before**, because the resolution is a lookup of a held id with
no clock and no status in it; the only visible difference is that the event's header may now read
"Finished". The changes Gusto will actually notice are three: the KDS opened from the dashboard now
lands on the event the dashboard was showing rather than guessing; the chip row now lists tomorrow's
events too, with a day label, so the kitchen can move on without walking to the dashboard; and every
switch now asks first, where a mis-tap used to move the whole board silently. ⚠️ **The one behaviour
that is strictly new and worth watching is that confirm dialog** — it is an extra tap on a control that
previously had none for a finished event, and it is deliberate.

## E3. No customer-facing surface is affected

✅ **Confirmed.** Both edited files are operator surfaces behind a dashboard token
(`app/dashboard/[token]/…`). **NOT FOUND in the diff: any file under `app/trucks/`, `app/order/`,
`lib/email*`, or any API route.** No customer route, email, receipt, SMS or push payload reads anything
that changed. No database write, no schema change.

---

# PART F — INTEGRITY

## F1 / F2. Non-ASCII census, side by side

### `app/dashboard/[token]/page.tsx`

| | Before | After | Delta |
|---|---|---|---|
| bytes | 377,156 | 378,261 | +1,105 |
| lines | 4,889 | 4,903 | +14 |
| non-ASCII total | 2,951 | 2,959 | +8 |
| **distinct classes** | **53** | **53** | **0** |

**CLASSES GAINED: NONE. CLASSES LOST: NONE.** Per class: U+2014 EM DASH +3, U+26A0 WARNING SIGN +2,
U+FE0F +2 (**paired with those two warning signs**), U+1F534 +1 — **all from the new comment block, all
classes the file already held.**

### `app/dashboard/[token]/kds/page.tsx`

| | Before | After | Delta |
|---|---|---|---|
| bytes | 91,554 | 99,851 | +8,297 |
| lines | 1,553 | 1,641 | +88 |
| non-ASCII total | 854 | 1,145 | +291 |
| **distinct classes** | **32** | **32** | **0** |

**CLASSES GAINED: NONE. CLASSES LOST: NONE.** Per class: U+2500 BOX DRAWINGS +253 (the section rules in
the new comment blocks), U+2014 EM DASH +17, U+1F534 +12, U+26A0 +6, U+FE0F +6 (**paired**), and
**U+2192 RIGHTWARDS ARROW −3** — the only decrease, and it is explained: the deleted fallback comment
read *"the live → confirmed → first today event"* and contained three arrows.

## F3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE, whose category is
`Ll`.

### `app/dashboard/[token]/page.tsx`

| Base | before (n/paired/bare) | after (n/paired/bare) |
|---|---|---|
| U+26A0 WARNING SIGN | 60 / 57 / **3** | 62 / 59 / **3** |
| U+1F534 LARGE RED CIRCLE | 76 / 0 / 76 | 77 / 0 / 77 |
| U+2705 WHITE HEAVY CHECK MARK | 4 / 0 / 4 | 4 / 0 / 4 |

Carriers after: U+26A0 ×59, **U+2699 GEAR ×1**. Sum **60** = total U+FE0F **60**.

### `app/dashboard/[token]/kds/page.tsx`

| Base | before (n/paired/bare) | after (n/paired/bare) |
|---|---|---|
| U+26A0 WARNING SIGN | 11 / 10 / **1** | 17 / 16 / **1** |
| U+1F534 LARGE RED CIRCLE | 20 / 0 / 20 | 32 / 0 / 32 |
| U+2705 WHITE HEAVY CHECK MARK | 2 / 0 / 2 | 2 / 0 / 2 |

Carriers after: U+26A0 ×16, **U+2600 BLACK SUN WITH RAYS ×1**. Sum **17** = total U+FE0F **17**.

✅ **Every warning sign I added is paired.** The bare counts — 3 and 1 — are **unchanged**, i.e.
pre-existing and untouched. ⚠️ **Both files carry a non-warning-sign carrier** (a gear, a sun), which is
exactly the case a raw U+26A0-versus-U+FE0F total misreports.

## F4. Byte scan of every edited file — byte-level, never grep

| File | Bytes | Offending | CRLF | tabs |
|---|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 378,261 | **0** | 0 | 0 |
| `app/dashboard/[token]/kds/page.tsx` | 99,851 | **0** | 0 | 0 |

Scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F.

## F5. Byte scan of this report

Separate pass after writing: **34,263 bytes scanned, offending = 0** (no NUL, no control byte below
0x09, no CRLF, no lone CR).

**And the carrier-aware check on this report, measured in that same pass — not predicted:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 16 | 16 | **0** |
| U+1F534 LARGE RED CIRCLE | 21 | 0 | 21 |
| U+2705 WHITE HEAVY CHECK MARK | 13 | 0 | 13 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 169 | 0 | 169 |
| U+25CF BLACK CIRCLE | 2 | 0 | 2 |

**Sum of per-base paired = 16 = total U+FE0F count = 16** — every selector has a named carrier, no
orphan and no double-count, and **zero bare warning signs**. Bare is correct for the other four: two are
emoji-presentation-by-default, U+2500 is a **box-drawing rule** inside quoted source comments, and
U+25CF is the **live dot quoted from the KDS's own chip label**. ⚠️ **Neither of the last two is an
emoji**, and reporting them as unpaired would be exactly the false positive this method exists to
prevent.

## F6. `git status` and `git diff --stat`

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M docs/kds-event-selection-report.md
 M docs/push-registration-report.md
 M docs/reference-manual.md
 M ios/App/App/AppDelegate.swift
?? docs/capture-sites-report.md
?? docs/modified-status-report.md
```

**THIS TASK: the two `page.tsx` files and `docs/kds-event-selection-report.md`.** Everything else is
earlier work. Nothing staged, branch still `main`.

---

# PART G — WHAT YOU MUST TEST

⚠️ **None of this has been observed. `tsc` is clean and the logic is quoted, but no device has run it.**

### 1. Open the KDS FROM the dashboard with a specific event selected

Select an event on the dashboard that is **not** the one the KDS would pick on its own — ideally
**tomorrow's**, with today's event finished. Then tap Kitchen screen.

- **PASS:** the KDS header shows **the same event as the dashboard**, and the URL carries
  `?event_id=…`. With a van, `van_id` is there too.
- **FAIL:** the KDS shows a different event → the seed did not arrive. Check the URL for `event_id`.
- **FAIL:** the KDS shows **no event** → the seeded id is not in the candidate set. Check the events
  fetch succeeded.

### 2. Cold-launch straight to the KDS

Force-quit, relaunch on a device whose `default_screen` is `kds`.

- **PASS:** it lands on the **event in progress**, or the **next upcoming** one if none is in progress —
  including one on a **later date** if today's has finished.
- **FAIL:** it lands on a finished event when a live one exists → `pickDefaultEventByTime` is not being
  reached; check `events` is populated.
- **FAIL:** blank between 00:00 and 01:00 (BST) → the local-date fix is not in the build.

### 3. 🔴 Let an event END while the KDS is open with unserved orders

The most important test. Leave the KDS on an event with orders still on the board and let its end time
pass — or tap **Finish event**.

- **PASS:** the board **does not move**. The same event, the same orders, still listed and still going
  later. The header may read "Finished".
- **FAIL:** the board switches to another event, or the orders vanish → **stop and report; a fallback
  has crept back into `activeEvent`.**

### 4. Background and resume for a long period

Leave the app backgrounded for **two hours or more** (overnight is better), then resume.

- **PASS:** the same event, the same orders. The poll refreshes contents, not the selection.
- **FAIL:** a different event after resume → the seed latch is not holding. Check `seededRef`.
- ⚠️ **EXPECTED, not a failure:** if the held event was **cancelled or deleted** while away, the KDS
  shows its no-event state. Pick another from the chip row.

### 5. Change event from the KDS

With more than one upcoming event, tap a different chip.

- **PASS:** a confirm appears naming **both venues** and **how many orders will be replaced**; accepting
  switches the board; cancelling changes nothing.
- **PASS:** events on other days show a **day label** ("Wed 20") so they are distinguishable.
- **FAIL:** the board switches with **no confirm** → the guard is not in the build.
- **FAIL:** after switching, a later poll moves the board again → **stop and report.**

### 6. Two supporting checks

- **Transient failure:** with the KDS open, cause an events fetch to fail (throttle the network hard).
  **PASS:** the event and its orders stay on screen and a `[kds] events fetch failed` warning appears in
  the console. **FAIL:** the board blanks.
- **Auto-open:** with tomorrow's event set to auto-open and today past its start time, watch that
  **tomorrow's event is NOT opened**. 🔴 **FAIL here is serious — it would open an event a day early.**
