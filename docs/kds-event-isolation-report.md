# KDS — switching event shows the previous event's orders. Read-only diagnosis.

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no database write. 🔴 **No `git stash`,
`checkout` or `restore` — the only git commands run were `status` and `show`.**

**No span of the prompt arrived garbled.** ⚠️ **ONE INSTRUCTION CONFLICTS WITH THE SOURCE, NOT WITH
ANOTHER INSTRUCTION — see §0.** It is a stale premise, not a contradiction, so I verified rather than
stopped, and the correction is reported before anything rests on it.

---

# 🔴 THE KDS ASKS FOR AN EVENT THE SERVER SILENTLY REFUSES, AND THE SERVER ANSWERS WITH A DIFFERENT EVENT'S ORDERS

**The KDS sends `event_id` and NO `date`. The server only honours an `event_id` that appears in
`todayEvents`, which is `.eq('event_date', date)` with `date` defaulting to today. An id it cannot
honour does not error and does not return null — it falls through to `todayEvents[0]` and runs the
orders query against THAT event.** ✅ **The response carries the served event id, and the KDS never
reads it.** ✅ **Every order row carries `event_id`, and the KDS never filters on it.**

**So the board shows today's orders while the header — resolved entirely client-side from the local
`events` array — names the event the operator picked.** 🔴 **Nothing in the response and nothing on
the card contradicts the header.**

⚠️ **AND THE PICKER OFFERS EXACTLY THE EVENTS THAT TRIGGER IT.** The KDS's list is
`/api/events/manage?upcoming=true` — `event_date >= today` — rendered unfiltered, with each row
labelled `Today` or a weekday. **Tomorrow's event is one tap away and is unservable by construction.**

---

# §0 — ⚠️ ONE "ALREADY ESTABLISHED" ITEM IS NO LONGER TRUE, AND IT IS THE LOAD-BEARING ONE

The brief states: *"the KDS ... its own candidate list is today-only by V11.20's deliberate design."*

🔴 **READ — IT IS NOT TODAY-ONLY. IT WAS CHANGED, AND THE FILE SAYS SO IN THE PAST TENSE:**

```tsx
  // ── THE CANDIDATE SET ────────────────────────────────────────────────────────────────────────
  // Every upcoming event (today onward) — the SAME set the dashboard resolves over, so the id it hands
  // us can always be found. This was `todayEvents`, filtered to today with a UTC date string: it could
  // not hold tomorrow's event, which is why a handoff alone would not have been enough.
  const [events, setEvents] = useState<TruckEvent[]>([])
```

**READ — and the fetch that fills it:**

```tsx
        const eventsRes = await fetch(`/api/events/manage?token=${token}&upcoming=true`)
```
```ts
  if (upcoming === 'true') {
    const today = new Date().toISOString().split('T')[0]
    query = query.gte('event_date', today)
  }
```

🔴 **THIS MATTERS BECAUSE IT INVERTS Q5's PREMISE.** The brief's Q5 says *"If today-only, then a
today-to-today switch must ALSO be failing."* **It is not today-only**, so the today→other-day switch
is available and is the one that fails. **The today→today switch is reported separately below and I
find no defect in it on the primary path.** The other three established items all verify as stated.

---

# Q1 — THE SWITCH PATH, TAP TO RENDER

## THE KDS — READ, every step

**1. The tap.** The picker maps the FULL `events` array; the row calls `switchEvent`:

```tsx
              {events.map(event => {
                const isToday = event.event_date === localTodayIso()
                const dayLabel = isToday ? 'Today' : new Date(`${event.event_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
                const isCurrent = activeEvent?.id === event.id
                return (
                  <button key={event.id} onClick={() => { setShowEventPicker(false); switchEvent(event) }}
```

**2. `switchEvent` — a confirm, then ONE setState. Nothing else:**

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

⚠️ **THE CONFIRM PROMISES SOMETHING THE PATH DOES NOT DELIVER** — *"N orders on this screen will be
replaced"* — and on the failing path they are replaced by the same event's orders again.

**3. What triggers the refetch.** `selectedEventId` is a dependency of `fetchAll`, whose identity
change drives a bare effect:

```tsx
  }, [token, pin, selectedEventId, applyPending])
```
```tsx
  useEffect(() => {
    fetchAll()
  }, [fetchAll])
```

**4. What the request carries** — four params, and `date` is not among them:

```tsx
      const params = new URLSearchParams({ token })
      if (currentPin) params.set('pin', currentPin)
      if (vanId) params.set('van_id', vanId)
      if (selectedEventId) params.set('event_id', selectedEventId)
      const res = await fetch(`/api/dashboard?${params}`, { headers: await nativeAuthHeader() })
```

**5. What the response replaces:**

```tsx
      const incomingOrders = data.orders ?? []
      for (const k of echoedBuzzerKeys(incomingOrders, peekPendingBuzzer)) delete pendingBuzzersRef.current[k]
      setOrders(prev => applyPendingBuzzers(mergeOrders(prev, incomingOrders), peekPendingBuzzer))
```

## 🔴 ARE ORDERS CLEARED BETWEEN THE OLD AND NEW RESPONSE? NO — AND THAT IS A TRANSIENT, NOT THE BUG.

**READ — `mergeOrders` maps over INCOMING**, so the result set is exactly the incoming keys and a
previous order absent from the new response is **dropped**, not retained:

```ts
export function mergeOrders<T extends MergeableOrder>(prev: T[], incoming: T[]): T[] {
  if (!Array.isArray(incoming)) return prev
  if (!Array.isArray(prev) || prev.length === 0) return incoming
  …
  return incoming.map(read => {
```

✅ **So a correct response fully replaces the board.** ⚠️ **But nothing clears `orders` at the moment
of the switch**, so the previous event's cards stay on screen for the duration of the request —
**INFERRED: a sub-second flash on a good network, and indefinite if the request fails**, since a
failed `fetchAll` lands in `catch` and sets an error without touching `orders`. **The dashboard has
the identical transient** (§6), so it is not what separates them.

## THE DASHBOARD — READ, the same five steps

```tsx
  const switchEvent=(event:TruckEvent)=>{
    const active=todayEvents.find(e=>e.id===selectedEventId)||(todayEvents.find(e=>e.status==='open')??todayEvents.find(e=>e.status==='confirmed')??todayEvents[0]??null)
    if(active?.status==='open'&&event.id!==active.id){
      const confirmed=window.confirm(`You're currently serving at ${active.venue_name}. Switch to ${event.venue_name}? Tap the current event to switch back.`)
      if(!confirmed) return
    }
    setSelectedEventId(event.id)
  }
```

**Its refetch is an EXPLICIT effect on the id, not an identity change — and it is a RESEED:**

```tsx
  // Refetch when the SELECTED event changes — RESEED (event-switch = navigation; van-scoped config like
  // kitchen capacity / catConfigs / order-ready can differ per event's van, so config must re-resolve).
  useEffect(()=>{
    if(authenticatedRef.current) reseedRef.current()
  },[selectedEventId])
```
```tsx
  useEffect(()=>{fetchAllRef.current=()=>fetchAll();reseedRef.current=()=>fetchAll(pin,true)},[fetchAll,pin])
```

**And its request carries the event's OWN date:**

```tsx
      const sel=selectedEventRef.current
      if(sel){p.set('event_id',sel.id);p.set('date',sel.date)}
```

---

# Q2 — 🔴 THE PARAMETER

## ✅ CONFIRMED: THE KDS SENDS NO `date`. EXECUTED — every `params.set` in the file:

```
388:      const params = new URLSearchParams({ token })
389:      if (currentPin) params.set('pin', currentPin)
390:      if (vanId) params.set('van_id', vanId)
402:      if (selectedEventId) params.set('event_id', selectedEventId)
1054:    const params = new URLSearchParams({ token, pin: pinInput })
```

⚠️ **AND LINE 1054 IS WORSE THAN THE OTHERS.** The PIN-submit fetch — **the first board an operator
sees** — carries **neither `van_id` nor `event_id`**, so that response is resolved entirely by the
server's fallback.

## 🔴 WHAT THE SERVER DOES WITH AN `event_id` IT CANNOT HONOUR — READ, the whole branch

```ts
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const eventIdParam = req.nextUrl.searchParams.get('event_id')
```
```ts
      .eq('event_date', date)
```
```ts
  let selectedEventId: string | null = null
  if (eventIdParam && todayEvents?.some(e => e.id === eventIdParam)) {
    selectedEventId = eventIdParam
  } else if (todayEvents && todayEvents.length === 1) {
    selectedEventId = todayEvents[0].id
  } else if ((todayEvents?.length ?? 0) > 1) {
    console.warn(`[dashboard] ${todayEvents!.length} events on ${date} for truck ${truck.id} and no valid event_id param — projecting first (${todayEvents![0].id})`)
    selectedEventId = todayEvents![0].id
  }
```

# 🔴 IT FALLS BACK TO A TODAY EVENT. NOT NULL, NOT AN ERROR, NOT A 400.

| Situation | What the server serves |
|---|---|
| `event_id` is in `todayEvents` | ✅ **that event** — the honoured path |
| `event_id` NOT in `todayEvents`, **one** event today | 🔴 **`todayEvents[0]`** — silently, **with no log line at all** |
| `event_id` NOT in `todayEvents`, **two or more** events today | 🔴 **`todayEvents[0]`**, with a `console.warn` whose text says *"and no valid event_id param"* — ⚠️ **the message is misleading: a param WAS sent, it was rejected** |
| No events on `date` at all | `selectedEventId` stays **null** → the orders query is skipped entirely → **empty board**, not a stale one |

**READ — the orders query, which is where the served id becomes the board:**

```ts
  if (selectedEventId) {
    let activeOrdersQuery = supabase
      .from('orders')
      .select('*')
      .eq('truck_id', truck.id)
      .eq('event_id', selectedEventId)
      .in('status', ACTIVE_STATUSES)
```

## Does the response say which event it actually served? ✅ YES — AND THE KDS DOES NOT READ IT.

**READ — the served id ships on every response, under a name that describes a different job:**

```ts
    offlinePauseEventId: selectedEventId,         // the event the marker belongs to (ack key)
```

⚠️ **`todayEvent` also ships** (`{ id, event_date, start_time, end_time, venue_name }`), and it is
`todayEvents[0]` — **not necessarily the served event** on a multi-event day.

**EXECUTED — who reads `offlinePauseEventId`:** the **dashboard only**, at `page.tsx:917`, and only
as an ack key for the offline-pause popup (`hg_offline_pause_ack_${offlinePauseEventId}`). **The KDS
contains zero occurrences of `offlinePauseEventId`, `todayEvent` or `lastOfflinePauseAt`.**

---

# Q3 — 🔴 THE MISMATCH. IS THERE ANY GUARD?

# ✅ NO. THERE IS NONE, ON EITHER SURFACE. STATED PLAINLY.

**EXECUTED, three searches, all negative:**

1. **A returned event id compared against the requested one** — **does not exist anywhere.** The
   value is present in the response (`offlinePauseEventId`) and is never compared to `event_id` on
   either surface.
2. **A per-order `event_id` filter on the client** — **does not exist.** The KDS's only `event_id`
   occurrences are the seed param, the request param, two comments and one unrelated buzzer prop:
   ```
   89:  const seedEventId = searchParams.get('event_id') ?? ''
   402:      if (selectedEventId) params.set('event_id', selectedEventId)
   1977:          eventId={buzzerTarget.event_id ?? activeEvent?.id ?? null}
   ```
   ⚠️ **AND THE DATA FOR ONE IS ALREADY THERE.** The orders query is `select('*')`, and the client
   type declares the column — `components/dashboard/types.ts:37`: `event_id: string | null`. **Every
   card on that board is carrying the field that would have caught this.**
3. **Anything else** — no assertion, no toast, no console warning, no disabled state. The board
   renders whatever `data.orders` contained.

🔴 **AND THE HEADER IS RESOLVED FROM A COMPLETELY SEPARATE SOURCE, WHICH IS WHY THEY CAN DISAGREE.**
The name comes from the local `events` array (filled by `/api/events/manage`), the orders come from
`/api/dashboard`, and the two are never reconciled:

```tsx
  const activeEvent: TruckEvent | null = selectedEventId
    ? events.find(e => e.id === selectedEventId) ?? null
    : null
```

⚠️ **This is why the operator cannot tell by looking, and it compounds the display-number point in
the brief:** the header is right, the cards are plausible, and the two facts have no common source.

---

# Q4 — `seededRef`

## ✅ IT CANNOT BLOCK OR OVERWRITE A DELIBERATE SWITCH. READ, in full.

```tsx
  useEffect(() => {
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
  }, [events, selectedEventId])
```

**The latch is set on the FIRST run and never cleared, so the body cannot execute a second time.**
`switchEvent` writes `selectedEventId` directly and touches nothing else; the file states the
interaction explicitly:

```tsx
  // ── 🔴 CHANGING EVENT SETS A NEW HELD VALUE. IT DOES NOT RE-ENABLE RESOLUTION. ──────────────────
  // `seededRef` stays true, so nothing re-derives afterwards: the operator's choice is now the held one
  // and the board holds it exactly as it held the seed.
```

**What happens on the poll that follows a switch:** ✅ **nothing re-resolves.** `activeEvent` is a
lookup of the held id, `fetchAll` re-reads the same `selectedEventId`, and the 60-second interval and
the Realtime handler both call `fetchAllRef.current()` — **the same unscoped-by-date request, with
the same rejected `event_id`, producing the same wrong orders every 60 seconds.**

🔴 **SO THE FAILURE IS STABLE, NOT TRANSIENT. It does not self-correct on the next poll.** That
distinguishes it from the request-in-flight flash in Q1 and matches "the board showed the orders from
the event already selected" rather than "flickered".

⚠️ **SEED ONCE THEN HOLD IS INTACT AND IS NOT IMPLICATED.** The invariant is doing exactly its job:
it prevents an auto-advance. **It also faithfully preserves a selection the server will not honour.**
Proposing nothing.

---

# Q5 — WHICH EVENTS ARE REACHABLE

## THE KDS — 🔴 THE LIST IS TODAY ONWARD, NOT TODAY-ONLY. QUOTED IN §0 AND HERE.

```tsx
              {events.map(event => {
                const isToday = event.event_date === localTodayIso()
                const dayLabel = isToday ? 'Today' : new Date(`${event.event_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
```

`events` ← `/api/events/manage?upcoming=true` ← `.gte('event_date', today)`. **Unfiltered at the
render site.** ✅ **The operator CAN select an event the server cannot honour**, and the row even
labels it as such — `Thu 21` rather than `Today`.

## 🔴 TODAY→OTHER-DAY — THE FAILING SWITCH

| Step | What happens | Mark |
|---|---|---|
| Operator taps tomorrow's event | Confirm names it; `setSelectedEventId(tomorrowId)` | **READ** |
| Header re-renders | `events.find(...)` finds it locally → **the new event's name** | **READ** |
| Request | `event_id=tomorrowId`, **no `date`** | **READ** |
| Server | `todayEvents` = `.eq('event_date', TODAY)` → tomorrow's id is **not a member** → falls to `todayEvents[0]` | **READ** |
| Response | today's orders, plus `offlinePauseEventId` = today's id | **READ** |
| Client | merges them in; **no guard, no filter** | **READ** |
| **Result** | 🔴 **the previous event's orders under the new event's name — indefinitely** | **INFERRED** from the chain above |

⚠️ **ONE SUB-CASE DIFFERS AND IS WORTH SEPARATING: if the truck has NO event today at all**,
`todayEvents` is empty, every arm of the branch fails, `selectedEventId` stays null, the orders query
is skipped, and the board is **EMPTY, not stale.** **INFERRED.**

## ✅ TODAY→TODAY — I FIND NO DEFECT ON THE PRIMARY PATH, AND HERE IS WHY

Both ids are in `todayEvents`, so the first arm matches and `eventIdParam` is honoured; the orders
query runs against the requested event; `mergeOrders` maps over incoming and drops the old cards.
**READ throughout.** ⚠️ **What remains on that path is only the Q1 transient** — old cards on screen
until the response lands, and permanently if that one request fails.

🔴 **BUT TWO NARROW WINDOWS WOULD BREAK IT, BOTH FROM THE SAME LINE:**

```ts
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
```

**`toISOString()` is UTC.** The manual's §7 rule is *never use `toISOString()` (UTC) to decide whether
an event date is "today"* — **and this default does exactly that.**

1. **00:00–01:00 local in BST:** UTC is still **yesterday**, so `todayEvents` holds YESTERDAY's
   events. A switch between two of *today's* events would have **both** ids rejected → fallback to a
   yesterday event, or an empty board if there were none. **INFERRED.**
2. ⚠️ **The KDS's own picker uses `localTodayIso()` for its `Today` label** while the server uses the
   UTC string — **so during that hour the label and the server disagree by a day.** **READ** (both
   expressions quoted above).

**Neither window explains a mid-service switch**, so if the observed switch was today→today at a
normal hour, **the leading candidate does not cover it** and Q8's check is what separates them.

## THE DASHBOARD — its candidate set and why the same tap is safe

```tsx
  const selectedOrDefaultEvent:TruckEvent|null=selectedEventId
    ?(upcomingEvents.find(e=>e.id===selectedEventId)??null)
    :pickDefaultEventByTime(upcomingEvents)
```
```tsx
    selectedEventRef.current=stockEvent?{id:stockEvent.id,date:stockEvent.event_date}:null
```

**It resolves over `upcomingEvents` — today onward, the same breadth as the KDS — and then sends that
event's OWN `event_date`.** ✅ **So `todayEvents` on the server is the set containing the requested
event by construction, and the first arm always matches, for any date.**

---

# Q6 — 🔴 THE DASHBOARD'S ISOLATION, MECHANISM BY MECHANISM

| # | Mechanism | Dashboard | KDS |
|---|---|---|---|
| 1 | 🔴 **`date` param = the selected event's OWN `event_date`** | ✅ `p.set('date',sel.date)` | 🔴 **absent — the whole defect** |
| 2 | An explicit refetch effect keyed on `selectedEventId` | ✅ `useEffect(…,[selectedEventId])` | ⚠️ implicit, via `fetchAll`'s identity — **fires, but reseeds nothing** |
| 3 | **RESEED** on switch — `fetchAll(pin,true)`, forcing van-scoped config to re-resolve | ✅ `reseedRef.current()` | 🔴 **none — no forceSeed equivalent exists** |
| 4 | Clearing of `orders` between events | 🔴 **NONE** — same `mergeOrders` | 🔴 **NONE** |
| 5 | Per-order `event_id` filter | 🔴 **NONE** | 🔴 **NONE** |
| 6 | Guard on the returned event id | 🔴 **NONE** — it reads `offlinePauseEventId` for an ack key only | 🔴 **NONE — does not read it at all** |
| 7 | Event-switch gate (`loadedEventIds`) | ✅ present — ⚠️ **OFFLINE ONLY**, *"Online → not consulted (no gating)"* | 🔴 none |

# ✅ EXACTLY ONE MECHANISM SEPARATES THEM ON THE ONLINE PATH: THE `date` PARAMETER.

Items 4, 5 and 6 are **absent on BOTH** — the dashboard is not defended against this, it simply never
provokes it. Item 7 does not run online. Item 3 is a config-freshness difference, not an
order-isolation one.

## 🔴 WHICH COULD THE KDS ADOPT WITHOUT TOUCHING THE DASHBOARD

**Facts only; recommending nothing.**

| Mechanism | Reachable from the KDS alone? | What it would require, as READ |
|---|---|---|
| **1 — send `date`** | ✅ **YES.** `activeEvent.event_date` is already in local state and `params` is built in `fetchAll` | **No server change** — the route already reads `date` and the dashboard already sends it. ⚠️ **The PIN path (line 1054) builds its own params and would need it separately** |
| **5 — filter orders on `event_id`** | ✅ **YES.** The field is on every row (`select('*')`) and on the client type | Client-only, KDS-only |
| **6 — compare the served id** | ✅ **YES.** `offlinePauseEventId` is already in the response | Reading an existing field. ⚠️ **Its NAME describes an unrelated job**, so a reader would be relying on an incidental value |
| **3 — reseed on switch** | ✅ **YES**, but `fetchAll` has no `forceSeed` parameter to pass | Would mean adding one to the KDS's own `fetchAll` |
| **2 — explicit effect** | ✅ YES | Cosmetic here; the refetch already fires |
| **7 — `loadedEventIds`** | ⚠️ Possible but **irrelevant** — it does not run online | — |

---

# Q7 — VAN SCOPE

## READ — the KDS sends `van_id`; the dashboard does not.

```tsx
      if (vanId) params.set('van_id', vanId)
```

**READ — what the server does with it, INSIDE the `if (selectedEventId)` block:**

```ts
    // Van KDS: show orders for this van OR unassigned orders (van_id null appears on all vans)
    if (vanId) {
      activeOrdersQuery = activeOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
      doneOrdersQuery   = doneOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
    }
```

## ✅ VAN SCOPING AND EVENT SWITCHING DO NOT INTERACT. THEY COMPOSE.

**The van filter is applied AFTER `selectedEventId` is resolved and never participates in resolving
it** — `van_id` appears nowhere in the `todayEvents` query or the `eventIdParam` branch. **READ.**

| Case | Result | Mark |
|---|---|---|
| Selected event's `van_id` differs from the device's, **and the id is honoured** | **EMPTY board** — the event's orders exist but are filtered out by the `.or()`. Not stale, not an error | **INFERRED** from the two quoted blocks |
| Selected event's `van_id` differs, **and the id is NOT honoured** | 🔴 **STALE board** — the fallback event's orders, filtered to THIS van. **The van filter makes the stale cards look native to the device**, which removes one more way to notice | **INFERRED** |
| Selected event is on this van, id not honoured | 🔴 stale, as Q5 | **INFERRED** |
| Any of the above | ⚠️ **Never an error.** No branch returns non-200 for a van/event mismatch | **READ** |

⚠️ **AND ORDERS WITH `van_id` NULL APPEAR ON EVERY VAN**, so a stale board can also carry unassigned
orders from the fallback event.

---

# Q8 — THE ONE CHEAPEST CHECK

# 🔴 READ `offlinePauseEventId` OUT OF THE `/api/dashboard` RESPONSE AND COMPARE IT TO THE `event_id` IN THE REQUEST URL.

**One request, one response field, no code change, no query, no device instrumentation beyond the
network inspector already attached to the WebView.**

**Why it is decisive:** `offlinePauseEventId` **is** the server's `selectedEventId` — the exact value
the orders query filtered on. Nothing else needs to be true for the comparison to mean something.

| Result | Reading |
|---|---|
| `offlinePauseEventId` **≠** the requested `event_id` | 🔴 **CONFIRMED.** The server refused the id and served another event. The absent `date` param is the cause; check the same URL for `date` to confirm it is missing |
| `offlinePauseEventId` **=** the requested `event_id`, and the orders are still the old event's | 🔴 **A DIFFERENT DEFECT** — the server served the right event and the wrong rows, which moves the suspect to the orders query or to the client's merge. **Q3's absence of a client filter would then be the place to look** |
| `offlinePauseEventId` is **null** | The truck had no event on the server's `date` — the empty-board sub-case, not the stale one |
| The request carries a `date` param | ⚠️ **My reading of `fetchAll` is wrong** and the whole chain above needs re-deriving |

⚠️ **It also settles the today→today question in the same look**, because it reports which event was
served regardless of which day either event falls on.

**NOT PERFORMED. RECOMMENDING NOTHING.**

---

# 🔴 VERIFICATION — WHAT IS READ AND WHAT IS INFERRED

| Claim | Method |
|---|---|
| The KDS sends no `date` | ✅ **EXECUTED** — every `params.set` in the file enumerated; five lines, none is `date` |
| The KDS's PIN-submit fetch sends neither `van_id` nor `event_id` | ✅ **EXECUTED** — line 1054 quoted |
| The server falls back to `todayEvents[0]` on an unhonourable id | ✅ **READ** — the whole branch quoted; no error path exists |
| `todayEvents` is `.eq('event_date', date)`, `date` defaulting to a **UTC** today | ✅ **READ** — both lines quoted |
| The response carries the served id as `offlinePauseEventId` | ✅ **READ** |
| The KDS never reads it | ✅ **EXECUTED** — zero occurrences in the file |
| No client-side `event_id` filter on either surface | ✅ **EXECUTED** — all occurrences enumerated |
| Orders carry `event_id` on the client type | ✅ **READ** — `components/dashboard/types.ts:37` |
| `mergeOrders` cannot retain a dropped order | ✅ **READ** — `return incoming.map(...)` |
| `seededRef` cannot block or overwrite a switch | ✅ **READ** — the latch and `switchEvent` quoted |
| The KDS's candidate list is today ONWARD, not today-only | ✅ **EXECUTED** — the state comment, the fetch, and the route's `.gte` all quoted |
| The dashboard sends the selected event's own date | ✅ **READ** — two call sites |
| **That THIS is what the operator saw** | 🔴 **INFERRED.** It is the only chain I found that produces "correct header, previous event's orders, stable across polls" — but **no request was captured, no response was read, and no device was touched.** Q8 is the check |
| **That the observed switch was today→other-day** | 🔴 **UNKNOWN.** If it was today→today at a normal hour, the primary path reads as correct and **this diagnosis does not explain it** |
| The BST 00:00–01:00 window | 🔴 **INFERRED** from the UTC expression; **not tested, and it cannot explain a mid-service switch** |

🔴 **NOTHING WAS OBSERVED RUNNING. No request was made, no query was run, no device was touched.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool (Python over `open(…, 'rb')`), never grep. A SEPARATE pass over this report AFTER
writing. It is the only file this task wrote.**

```
  docs/kds-event-isolation-report.md   (SEPARATE PASS)   28,906 bytes
  NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 LARGE RED CIRCLE | 44 | 0 | 44 |
| U+2705 WHITE HEAVY CHECK MARK | 39 | 0 | 39 |
| **U+26A0 WARNING SIGN** | **25** | **25** | ✅ **0** |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 25 OF 25, ZERO BARE.

`U+1F534` and `U+2705` have **emoji presentation by default** and need no selector; bare is correct
for them and they render as emoji everywhere. **`U+26A0` is the only base here that defaults to TEXT
presentation.** ✅ **The report's total `U+FE0F` count is 25, which exactly accounts for the
25 paired warning signs and leaves none attached to any other base.** ⚠️ **No other
emoji-presentation base occurs in this report at all**, so the table is complete rather than trimmed.

## `git status --porcelain`

```
 M docs/reference-manual.md
?? docs/kds-event-isolation-report.md
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/kds-event-isolation-report.md`** | 🔴 **THIS PASS — the only new entry, and the only file written** |
| `M docs/reference-manual.md` | ✅ **pre-existing** — the V11.24 manual update from the previous task, still uncommitted |

⚠️ **The rest of the tree is clean because the KDS pause fix, the type equalisation and their reports
were committed as `afb6762` between tasks** — so nothing else from this session appears here.
