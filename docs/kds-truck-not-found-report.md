# KDS "Truck not found" when opened from the dashboard — read-only diagnosis

**Cause: named, and confirmed by your own relaunch.** Nothing was changed.

The KDS's **client-side event-scope mismatch guard** returns early — *before* `setTruck` — so `truck` stays
`null`, `error` stays `null`, and the render prints its bare fallback string. It fires because the handover
URL carries `event_id` **without `date`**, and the event you have been working on (**2026-08-21**) is not
today's date, so `/api/dashboard` serves a different event id than the one requested.

🔴 **This is not an API rejection.** The API answered 200 with a valid truck. The board threw it away.

⚠️ **Your relaunch is the proof.** Closing and reopening the app routed to
`/dashboard/{token}/kds` with **no `?event_id=`** (`app/app/page.tsx:53`). With nothing requested there is
nothing to mismatch, the guard short-circuits, `setTruck` runs, and the Kitchen screen loads. That is the
discriminating prediction this diagnosis makes, and you ran it by accident before I could suggest it.

---

## Q1 · Every "truck not found" and close variant

| Where | Kind | Condition |
|---|---|---|
| 🔴 **`app/dashboard/[token]/kds/page.tsx:1700-1703`** | **CLIENT RENDER** | `if (error \|\| !truck)` → prints `{error ?? 'Truck not found'}` |
| `app/api/dashboard/route.ts:82` | API 401 | `if (error \|\| !truck)` on the token lookup → **`'Invalid token'`**, *not* "Truck not found" |
| `app/api/menu/[truckId]/route.ts:52` | API 404 | `'Truck not found'` |
| `app/api/orders/submit/route.ts:220, 258` | API 404 | `'Truck not found'` |
| `app/api/events/manage/route.ts:22` | API 404 | `'Truck not found'` |
| `app/api/events/action/route.ts:31` | API 404 | `'Truck not found'` |
| `app/api/slots/[truckId]/route.ts:63` | API 404 | `'Truck not found'` |
| `app/api/admin/delete-truck/route.ts:70, 101` | API 404 | `'Truck not found'` |
| `app/trucks/[slug]/TruckClient.tsx:271` | client render | customer truck page, `<h2>Truck not found</h2>` |

🔴 **Only the first is on the KDS chain, and it is a client render.** The KDS calls exactly one endpoint on
load — `/api/dashboard` — and that route **never emits the string "Truck not found"**; its truck-lookup
failure says `'Invalid token'`. So the observed text cannot have come from the server.

The render, verbatim:

```tsx
  if (error || !truck) return (
    <div className="flex items-center justify-center h-dvh text-red-500 text-sm">
      {error ?? 'Truck not found'}
    </div>
  )
```

⚠️ **The `??` is the tell.** Every failure that sets `error` prints *that message instead* — `'Invalid token'`,
`'Unauthorized'`, `'Failed to fetch'`, `'Could not load orders'`. Seeing the literal words **"Truck not
found"** means `error` was `null` and `truck` was `null` **at the same time** — i.e. a path that finished
without an error and without ever setting the truck. There is exactly one such path (Q3).

---

## Q2 · `openKDS` — what it builds

`app/dashboard/[token]/page.tsx:1349-1363`:

```tsx
  const openKDS=(van?:{id?:string;name?:string;kds_token?:string|null})=>{
    const ev=activeEvent?.id?`event_id=${encodeURIComponent(activeEvent.id)}`:''
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

| Param | Carried? | Source |
|---|---|---|
| `van_id` | yes, when a van is resolved | `handleOpenKDS` → `vans[0]`, or the event's van via `vans.find(v => v.id === activeEvent.van_id)`, or the picker |
| `van_name` | yes, alongside `van_id` | the same van object |
| 🔴 **`event_id`** | **yes, whenever `activeEvent` exists** | **`activeEvent.id` — the event selected on the dashboard** |
| token | in the **path**, not a param | the dashboard route's own `token` = `trucks.dashboard_token` |
| pin | **no** | never passed by `openKDS` |
| `date` | 🔴 **NO — and this is the defect's first half** | nothing sends it |

**Native and web differ, and the difference matters:**

- **Native** (your case): `router.push('/dashboard/{dashboard_token}/kds?van_id=…&van_name=…&event_id=…')` —
  a **soft navigation to the in-app KDS**, authenticated by the **dashboard token**. The van's `kds_token`
  is never used.
- **Web**: `window.open` to the standalone `/kds/{kds_token}` when a van has one — **a different page
  entirely**, which does not run the code in Q3.

⚠️ So "both vans active with non-null `kds_token`" is true and irrelevant here: **the native path never
reads `kds_token`.**

---

## Q3 · The KDS's resolution on load, and every way it can end at "not found"

### What it reads from the URL

```tsx
  const vanId = searchParams.get('van_id') ?? ''
  const vanName = searchParams.get('van_name') ?? ''
  const seedEventId = searchParams.get('event_id') ?? ''
  const [pin, setPin] = useState(() => searchParams.get('pin') ?? '')
```

### What it requests

One endpoint, `/api/dashboard`, with params assembled by `applyEventScope`
(`app/dashboard/[token]/kds/page.tsx:467-478`):

```tsx
  const applyEventScope = useCallback((params: URLSearchParams, fallbackId: string | null): string | null => {
    const scope = eventScopeRef.current
    if (scope) {
      params.set('event_id', scope.id)
      // ⚠️ `event_date` is nullable on TruckEvent. No date ⇒ send the id alone rather than a bare
      // `date=` the route would read as an empty string and fail to match any row.
      if (scope.date) params.set('date', scope.date)
      return scope.id
    }
    if (fallbackId) { params.set('event_id', fallbackId); return fallbackId }
    return null
  }, [])
```

🔴 **On the FIRST fetch the fallback branch is taken, and it sends `event_id` with NO `date`.**
`eventScopeRef` is only written once the events list lands:

```tsx
  useEffect(() => {
    eventScopeRef.current = activeEvent ? { id: activeEvent.id, date: activeEvent.event_date ?? null } : null
  }, [activeEvent])
```

Before that first response `activeEvent` is `null`, so the ref is `null` and `selectedEventId` — seeded from
`?event_id=` — goes out **bare**. The file's own comment concedes it: *"sending that bare id is EXACTLY what
this file did before this change. No date accompanies it, so there is nothing for it to disagree with."*
**There is something for it to disagree with. That is this bug.**

### What the server does with each param

`app/api/dashboard/route.ts`:

```ts
  const token = req.nextUrl.searchParams.get('token')
  const pin   = req.nextUrl.searchParams.get('pin')
  const vanId = req.nextUrl.searchParams.get('van_id')
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
  const eventIdParam = req.nextUrl.searchParams.get('event_id')
```

🔴 **`date` defaults to TODAY when absent** — and `todayEvents` is built from it:

```ts
      .eq('truck_id', truck.id)
      .eq('event_date', date)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true }),
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

**An `event_id` outside today's set is not rejected — it is silently ignored**, and `selectedEventId` becomes
today's event, or `null` if the truck has no event today. That value is echoed back:

```ts
    offlinePauseEventId: selectedEventId,         // the event the marker belongs to (ack key)
```

### 🔴 Every way this screen can end at "not found"

| # | Condition | What the screen shows |
|---|---|---|
| 1 | **Bad/unknown token** — `.eq('dashboard_token', token)` misses | API 401 `'Invalid token'` → `throw` → `setError` → screen shows **"Invalid token"**, not "Truck not found" |
| 2 | **PIN required** — `truck.dashboard_pin && truck.dashboard_pin !== pin` | API 401 `requiresPin: true` → `setRequiresPin(true)` → **the PIN unlock screen**, not an error |
| 3 | **Any other non-OK** | `throw new Error('Failed to fetch')` → screen shows **"Failed to fetch"** |
| 4 | **Network / thrown** | `setError('Could not load orders')` → shows **that** |
| 5 | 🔴 **EVENT-SCOPE MISMATCH** | 🔴 **returns before `setTruck`** → `truck` null, `error` null → **"Truck not found"** |
| 6 | Missing van | **not a failure path at all** — `van_id` only scopes buzzer/cooking-step fields |
| 7 | No event | not a failure *per se* — but it drives #5 (see Q4) |

**Only #5 produces the observed string.** Here it is:

```tsx
      const servedEventId = data.offlinePauseEventId
      if (requestedEventId && servedEventId !== undefined && servedEventId !== requestedEventId) {
        console.error(`[kds] event scope mismatch — requested ${requestedEventId}, served ${servedEventId ?? 'null'}; rendering no orders`)
        setEventScopeMismatch({ requested: requestedEventId, served: servedEventId ?? null })
        // Clearing is part of the guarantee: leaving the previous array on screen under the new header
        // IS the reported defect.
        setOrders([])
        setLoading(false)
        return
      }
      setEventScopeMismatch(null)

      setTruck(data.truck)
```

🔴 **`setTruck(data.truck)` is the very next statement after the guard, and the guard `return`s past it.**
The response was a **200 carrying a perfectly good truck**; the board discards it.

⚠️ **And the notice it sets is unreachable on a first load.** `setEventScopeMismatch` populates a banner that
renders *below* `if (error || !truck)` in the same component — so on a cold KDS open, where `truck` has never
been set, the guard the mismatch notice lives behind fires first and the operator gets "Truck not found"
instead of the message naming both events. The mismatch handling was written for a *switch* on an already-
loaded board, and it is being reached on a *first* load.

### The chain, end to end

1. `openKDS` → `/dashboard/{token}/kds?van_id=…&van_name=…&event_id={2026-08-21 event}`
2. first `fetchAll`: `eventScopeRef` null → **`event_id` sent, `date` omitted** → `requestedEventId` = that id
3. route: `date` defaults to **today (18 Aug)**; `todayEvents` = events on 18 Aug
4. the 21 Aug event is not in that set → `selectedEventId` = today's event, or `null`
5. `offlinePauseEventId` ≠ `requestedEventId`
6. guard fires → `setOrders([])`, `setLoading(false)`, **`return`**
7. `truck` null, `error` null → render prints **"Truck not found"**

---

## Q4 · 🔴 Can an empty event produce this?

**Empty ORDERS: no. A date with NO EVENT: yes — via the same guard.**

**No path treats an empty order result as a missing truck.** `truck` comes from `data.truck`, which is
resolved from the token long before orders are read; `setOrders([])` and `setTruck(...)` are independent. An
event that resolves with zero orders renders the normal board with an empty grid — `displayOrders` is `[]`,
`visibleOrders` is `[]`, `overflowCount` is 0. **Deleting tonight's orders cannot cause this.**

🔴 **But "no event on today's date" absolutely can.** If the truck has no event today, `todayEvents` is
empty, every branch of the `selectedEventId` ladder is skipped, and it stays `null`. `offlinePauseEventId`
is then `null` — which is `!== undefined`, so the guard's own escape hatch does not apply:

```ts
      // ⚠️ `undefined` IS NOT A MISMATCH — an older server that does not send the field must not blank a
      // working board. Only a PRESENT-and-different value counts.
```

`null !== undefined` and `null !== requestedEventId`, so the guard fires. **With a future event handed over
and no event today, every KDS open from the dashboard fails this way** — which matches your situation
exactly: you have been working on the 21 August event.

---

## Q5 · `kds_pin` is NULL — does the KDS require one?

**No. `kds_pin` is never read by any code in this repository, so its value cannot matter.**

Its only occurrences are in a **redaction list** in the very route the KDS calls, and the comment there says
so outright:

```ts
// examples — `messenger_page_token` and `kds_pin` — exist on the table and appear NOWHERE in the code.
```
```ts
  'kds_pin',              // auth secret (exists on the table; unreferenced anywhere in this repo)
```

The gate the KDS actually passes through is on a **different column**, `dashboard_pin`:

```ts
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) {
    return NextResponse.json({ error: 'Invalid PIN', requiresPin: true }, { status: 401 })
  }
```

🔴 **A null pin is SKIPPED, not treated as a failed match.** The `truck.dashboard_pin &&` short-circuits on
`null`, so the comparison never runs. And had it failed, the screen would show the **PIN unlock form**
(`setRequiresPin(true)`), not an error — a visibly different outcome from the one you saw.

**`kds_pin = NULL` is ruled out on two independent grounds.**

---

## Q6 · Does anything resolve by name or slug?

**No. The whole KDS chain is token-and-id only. The rename cannot reach it.**

```ts
  const { data: truck, error } = await supabase
    .from('trucks')
    .select('*')
    .eq('dashboard_token', token)
    .single()
```

- truck → `.eq('dashboard_token', …)`
- events → `.eq('truck_id', truck.id)`
- van → `van_id` (a uuid from the URL)
- event scope → `event_id` (a uuid)

The only name/slug lookup anywhere nearby is `app/api/events/route.ts:57`
(`truck not found for slug/id`) — the **customer** events endpoint, which the KDS never calls.

⚠️ Ruled out with it: `logo_storage_path`, `truck_emoji` and `kitchen_capacity`. None is read to decide
whether a truck exists; `select('*')` returns whatever the row holds and the truck is resolved before any of
them is touched.

---

## Q7 · Did today's banner move touch `openKDS` or anything on the path?

**No. Not one symbol.**

⚠️ The work was committed outside this session while I was investigating — `cf26f1d "ipad banner fix"`
(18 Aug, 20:41) — so the working tree is now clean and the diff below is against that commit's parent.

```
$ git diff cf26f1d^ cf26f1d -- app/dashboard/[token]/page.tsx \
    | grep -E "^[+-].*(openKDS|handleOpenKDS|kds_token|router\.push|window\.open|dashboard_token)"
NONE
```

**Every change in that file, exhaustively:**

| Change | Is it the banner stack? |
|---|---|
| Wrapper `<div style={{ paddingTop: 'env(safe-area-inset-top)' }}>` → `<div>`, moved below the event bar | ✅ yes |
| `OfflineBanner`, `WebOfflineBanner`, `CapacityBreachBanner`, `BuzzerLostBanner` re-sited unchanged | ✅ yes |
| `DemoModeBanner` moved below the chrome | ✅ yes (same fix) |
| `KeepAwakePrompt` moved below the chrome | ✅ yes (same fix) |
| Comment blocks rewritten at the old and new sites | ✅ yes |

`openKDS` (`:1349`) and `handleOpenKDS` (`:1385`) are **outside every hunk** — they sit ~1500 lines above the
edited region and are byte-identical across the commit. **The banner move is not implicated.**

🔴 **It is also chronologically excluded.** `applyEventScope`'s fallback branch, the missing `date`, and the
mismatch guard's early return all predate today's work — they are the state the file was already in. The
banner move touched the dashboard's *layout*, not its *navigation*.

---

## Q8 · The ONE cheapest check that distinguishes an API rejection from a client render

**Open the same KDS URL with the `?event_id=` query string removed.**

If it loads, the API and the token are fine and the failure is the client-side guard. If it still fails, the
API is rejecting and the message would name which rejection.

🔴 **You have already run it.** Closing and reopening the app cold-launches through
`app/app/page.tsx:53`:

```tsx
            return go(screen === 'kds' ? `/dashboard/${t.dashboard_token}/kds` : `/dashboard/${t.dashboard_token}`)
```

**No `?event_id=`.** So `seedEventId` is `''`, `selectedEventId` is `null`, `applyEventScope` returns `null`,
`requestedEventId` is `null`, and `if (requestedEventId && …)` short-circuits **false** — the guard cannot
fire, `setTruck` runs, the board renders. **Same token, same truck, same van, same device, same build: the
only variable removed is the `event_id` handover, and the failure went with it.**

A second, confirmatory read costing one cable: Safari Web Inspector on the iPad shows the guard's own log
line, which nothing else in the codebase emits —

```
[kds] event scope mismatch — requested <21-Aug-id>, served <today-id|null>; rendering no orders
```

---

## The cause

🔴 **The KDS's event-scope mismatch guard returns before `setTruck`, so a successful 200 response is
discarded and the render falls through to its bare "Truck not found" string.** The guard fires because
`applyEventScope`'s pre-resolution fallback sends `event_id` **without `date`**, and `/api/dashboard` then
resolves `date` to today — so a handed-over event on any other date can never be matched, and the server
honestly reports the different event it selected instead.

**Two defects compounding, both pre-existing:**

1. **The handover is under-specified.** `openKDS` sends `event_id` and no `date`; the first `fetchAll` cannot
   supply one because `eventScopeRef` is not populated until the events list arrives. The route's `date`
   default then guarantees a miss for any non-today event.
2. **The guard's failure mode is wrong for a first load.** It was written for an operator *switching* events
   on a loaded board — where `truck` is already set and the mismatch notice renders. On a cold open it
   returns before the truck is ever set, so the notice it prepares is unreachable behind `if (error || !truck)`
   and the operator gets a message about the truck not existing when the truck resolved perfectly.

**Confidence: high, and corroborated.** Every link is quoted from source, and the diagnosis made a falsifiable
prediction — *remove the `event_id` handover and it will load* — which your relaunch satisfied before I
proposed it.

**Ruled out, each on its own evidence:** the rename and slug (lookup is by `dashboard_token`); `logo_storage_path`
and `truck_emoji` (never consulted); `kds_pin` (unreferenced in the entire repo, and the real gate is
`dashboard_pin`, which short-circuits on null); the deleted orders (empty orders render an empty board);
`order_counter`; `kitchen_capacity`; and the banner move (contains no KDS-path symbol).

⚠️ **What I could not do read-only:** observe the device. I have not seen the response body, the console line,
or the value of `activeEvent` at the moment you tapped. The chain is quoted rather than executed, and the
one execution that matters is the relaunch you performed.

**Recommending nothing, as instructed.**

---

## Integrity

### Byte-level scan of this report

Byte-level Python pass (`open(path,'rb')`, integer comparison), **not** grep. Flagged set: `0x00–0x08`,
`0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

```
--- docs/kds-truck-not-found-report.md   (final state, this file)
    NUL(0x00)=0
    other flagged control bytes (<0x09, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)=0
    TOTAL FLAGGED=0
    allowed control bytes present: TAB(0x09)=0  CR(0x0D)=0   (LF only)
```

⚠️ **Self-reference caveat:** this file cannot print its own byte length inside itself — writing the number
changes the file, which changes the number. The digit-stable figure, and the one that matters, is the flagged
count: **zero**. Length, LF count and the full non-ASCII class census were measured on the final file and are
in the chat reply.

### Carrier-aware variation-selector check

Per emoji-presentation base, bare versus followed by U+FE0F. Counts in the chat reply, same constraint as
above. The rule they satisfy: `Emoji_Presentation=Yes` bases are 100% bare (a VS-16 on them is redundant) and
`Emoji_Presentation=No` bases are 100% paired (without it they render as monochrome text glyphs). **No base
appears both bare and paired.**

### `git status --porcelain`

Printed in the chat reply.

⚠️ **The tree changed under me mid-investigation, and it was not me.** At the start of this session the
working tree carried seven dirty entries; they were **committed outside this session** as `cf26f1d`
("ipad banner fix", 18 Aug 20:41), so `git status` is now clean apart from this report.

| Entry | Pre-existed this task? |
|---|---|
| `?? docs/kds-truck-not-found-report.md` | ❌ No — **this report, the only file this task wrote.** |
| *(nothing else)* | The seven previously-dirty entries — `docs/reference-manual.md`, `lib/truck-logo.ts`, `app/dashboard/[token]/page.tsx`, `scripts/seed-thai-kitchen-screenshots.sql` and the three reports — are now **inside `cf26f1d`**. |

Nothing was committed, staged, reverted, stashed or cleaned **by me**. **No `git stash`, `git checkout` or
`git restore` was run at any point in this session.** The only git commands used here were read-only:
`git log`, `git show`, `git diff` and `git status`.

### Flags

1. ⚠️ **`git status` is clean because someone else committed** (`cf26f1d`, 20:41) while this investigation was
   running. Stated rather than quietly reported as "no changes".
2. **No instruction in this prompt contradicted another, and no span arrived garbled.** Nothing needed asking.
3. ⚠️ **`kds_pin` is dead schema.** It exists on `trucks`, is listed as an auth secret to redact, and is read
   by nothing. Not a defect today; worth knowing it protects nothing.
