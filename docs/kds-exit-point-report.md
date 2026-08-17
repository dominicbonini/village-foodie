# KDS exit point — read-only fact-finding

READ-ONLY. **No file was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, **no SQL and no database write.** `git status
--porcelain` is at the end.

**Nothing is proposed, recommended, designed or scoped. Facts only.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

🔴 **THE WORKING TREE IS DIRTY.** Six files differ from HEAD. Every fact below is tagged **HEAD**,
**TREE-ONLY**, or **BOTH**. Comparisons were made with `git show HEAD:<path>` and `git diff`, both
read-only.

```
$ git diff --stat
 app/dashboard/[token]/kds/page.tsx | 335 +++++++++++++------------------
 app/dashboard/[token]/page.tsx     | 150 +++++++-------
 app/manage/[token]/page.tsx        |  35 +++-
 components/DemoGetStarted.tsx      |  80 ++------
 components/dashboard/OrderCard.tsx |  24 +++
 docs/reference-manual.md           | 400 ++++++++++++++++++++++++++++++++++++-
 6 files changed, 702 insertions(+), 322 deletions(-)
```

# 🔴 TWO FINDINGS CONTRADICT CLAIMS ALREADY WRITTEN INTO THIS REPO

1. **Q5 — `cook_screen` is NOT sold as an available Max feature.** Its marketing row is
   `max: 'coming_soon'`, while the gate already grants it. **A previous report and manual entry
   N122 (V11.22) call it "a sold Max feature". That is wrong.**
2. **Q4 — the dashboard is NOT an unconditional superset.** A case exists where an order is on
   neither surface, and it does not require anyone to change an event: **the KDS never sends `date`,
   and the API only honours `event_id` if that event falls on `date`, which defaults to today.**

---

# Q1. THE BOARD FILTERS

**BOTH (HEAD and tree).** ✅ **VERIFIED IDENTICAL:** a `diff` of the span from
`const overlayedOrders = kdsOverlay.size` to `const allDayPills = Object.entries` between
`git show HEAD:app/dashboard/[token]/kds/page.tsx` and the working tree returned **no differences.**

## The complete chain — READ, `app/dashboard/[token]/kds/page.tsx`

```ts
  const overlayedOrders = kdsOverlay.size
    ? orders.map(o => { const ov = kdsOverlay.get(o.order_key); return ov ? ({ ...o, ...ov } as Order) : o })
    : orders

  // Base: exclude terminal statuses for all views
  const activeOrders = overlayedOrders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )

  // Cook view: cook's job ends at ready — hide ready orders from the kitchen screen
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')
```

```ts
  const windowOrders = hidePayments
    ? activeOrders.filter(o => o.status !== 'ready')
    : activeOrders

  const displayOrders = (activeView === 'cook' ? cookOrders : windowOrders)
    .slice()
    .sort((a, b) => {
      const ta = a.slot ? new Date(`1970-01-01T${a.slot}`).getTime() : 0
      const tb = b.slot ? new Date(`1970-01-01T${b.slot}`).getTime() : 0
      return ta - tb
    })

  // Grid (BOTH views, now equally dense) shows up to 8; list views are uncapped (slice n/a below).
  const MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6
  const visibleOrders = activeLayout === 'grid'
    ? displayOrders.slice(0, MAX_GRID_VISIBLE)
    : displayOrders
  const overflowCount = activeLayout === 'grid'
    ? Math.max(0, displayOrders.length - MAX_GRID_VISIBLE)
    : 0

  // Done orders: last 5 collected (window view only)
  const doneOrders = overlayedOrders
    .filter(o => o.status === 'collected')
    .slice(0, 5)

  const allDayCounts = getAllDayCounts(activeOrders)
```

## 🔴 THE SET IS NOT EXACTLY THREE. SEVEN PREDICATES DECIDE WHAT RENDERS.

| # | Name | Reads | Effect on rendering |
|---|---|---|---|
| 1 | `overlayedOrders` | **`kdsOverlay`**, not `o.status` | 🔴 **REWRITES `o.status`** before every filter below |
| 2 | `activeOrders` | `o.status` | drops `collected`, `cancelled`, `rejected` |
| 3 | `cookOrders` | `o.status` | additionally drops `ready` |
| 4 | `windowOrders` | 🔴 **`hidePayments`**, then `o.status` | drops `ready` **only when `hidePayments`** |
| 5 | `displayOrders` | **`activeView`** | selects 3 or 4; then sorts on `o.slot` |
| 6 | **`visibleOrders`** | 🔴 **`activeLayout`** | **`.slice(0, 8)` in grid — a NINTH order does not render at all** |
| 7 | `doneOrders` | `o.status` | a separate `collected` bucket, `.slice(0, 5)` |

⚠️ **#1 IS THE PATH MOST EASILY MISSED.** `overlayedOrders` is not a filter — it is a *substitution*.
An offline-advanced order carries an overlay status, so **every downstream `o.status` test reads the
OVERLAY, not the server's value.** **READ**, its own note: *"apply the durable offline status overlay
(sticky; held until the server reflects it) over the merged orders BEFORE the view split."*

⚠️ **#6 IS A HARD CAP, NOT A SCROLL.** In grid layout only the first 8 render; `overflowCount` carries
the remainder as a number. **INFERRED: an order can be absent from the KDS board purely because eight
others sort ahead of it.**

⚠️ **#7 IS A FOURTH PATH IN THE SENSE THE QUESTION ASKS ABOUT.** `doneOrders` re-derives from
`overlayedOrders`, **not** from `activeOrders`, so it deliberately sees exactly the terminal status #2
removed.

⚠️ **`getAllDayCounts` is NOT a filter** — **READ**, `components/dashboard/helpers.ts`: it iterates
`orders`, `order.items` and `order.deals` and returns a `Record<string, number>`. It filters nothing.

## Does any filter read a ledger value, `payment_status`, `amount_paid` or a computed balance?

# 🔴 NO. NONE OF THEM.

**READ** — a scan of the entire span for `payment_status`, `amount_paid`, `ledger`, `balance`,
`getOrderBalance` and `payments[` returned **no matches**.

⚠️ **ONE NEAR-MISS, STATED PRECISELY:** `windowOrders` reads **`hidePayments`**, which is a
CONFIGURATION value, not a money value. **READ:**

```ts
  const { showPaidStep } = resolvePaidStep(truck, activeEvent)
  const hidePayments = showPaidStep && showPaymentsPref !== true
```

**Truck/event setting AND a device preference. No order's balance is consulted anywhere in the board
filters.**

---

# Q2. THE PER-DEVICE SWITCH INVENTORY

**READ** — every `localStorage.getItem/setItem` and `Preferences.get/set` in
`app/dashboard/[token]/kds/page.tsx`, in both HEAD and the tree.

| # | Key | Mechanism | Restored by | Value when nothing stored | Controls | Influences Q1? |
|---|---|---|---|---|---|---|
| 1 | `hg_kds_view_<token>` | localStorage | **lazy initialiser** | `null` → `activeView` falls to `kdsView` → **`'window'`** | Window/Cook | ✅ **YES — #5** |
| 2 | `hg_kds_layout_<token>` | localStorage | **lazy initialiser** | `null` → `activeLayout` falls to `truck.display_mode` | List/Grid | ✅ **YES — #6, the 8-cap** |
| 3 | `hg_kds_payments_<token>` | 🔴 **Capacitor `Preferences`** | 🔴 **mount effect (async)** | `null` → `hidePayments` resolves **not-on** | money UI + button set | ✅ **YES — #4** |
| 4 | `hg_kds_readystep_<token>` | localStorage | **lazy initialiser** | `!== 'off'` → **ON** | the `readyStepOff` prop | 🔴 **NO** |
| 5 | `hg_kds_sound_<token>` | localStorage | **lazy initialiser** | `!== 'off'` → **ON** | new-order ding master | 🔴 **NO** |
| 6 | `hg_keepawake_<token>` | localStorage | **lazy initialiser** | `pref !== 'off'` → **ON**; demo `=== 'on'` → OFF | screen wake lock | 🔴 **NO** |
| 7 | `hg_soundcfg_<token>` | localStorage | **lazy initialiser** | `null` → seeded from `trucks.sound_config` | **which** sounds fire | 🔴 **NO** |
| 8 | `hg_demo_kds_intro_<token>` | localStorage | **lazy initialiser** | `!== 'seen'` → show | demo intro overlay | 🔴 **NO** |

## 🔴 HEAD vs TREE — one row differs

**Key #4, `hg_kds_readystep_<token>`, is TREE-ONLY.** **READ** — `git show HEAD:` grepped for
`hg_kds_readystep` returns **0 occurrences**. The other seven keys are **BOTH**.

⚠️ **A PREVIOUS CLAIM CORRECTED HERE:** the lazy-initialiser conversion for view, layout and sound is
**already in HEAD** — **READ**, `git show HEAD:` shows `const [viewOverride, setViewOverride] =
useState<…>(() => {` with a synchronous `localStorage.getItem`. It was committed in `8e94837 kds
cleanup`. **Only the ready-step key is uncommitted.**

## The two mechanisms, quoted

**LAZY — READ (BOTH):**

```ts
  const [readyStepOn, setReadyStepOn] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(`hg_kds_readystep_${token}`) !== 'off'
  })
```
*(TREE-ONLY; the same shape as #1, #2, #5, #6, #7, which are BOTH.)*

**ASYNC MOUNT EFFECT — READ (BOTH):**

```ts
    void Preferences.get({ key: `hg_kds_payments_${token}` })
      .then(({ value }) => { if (!cancelled) setShowPaymentsPref(value === 'on') })
      .catch(() => { if (!cancelled) setShowPaymentsPref(false) })
```

🔴 **EXACTLY ONE OF THE EIGHT IS RESTORED IN A MOUNT EFFECT, AND IT IS THE ONE THAT INFLUENCES A BOARD
FILTER (#4, `windowOrders`).**

## Which influence Q1's filters — stated explicitly

✅ **THREE DO: `hg_kds_view_`, `hg_kds_layout_`, `hg_kds_payments_`.**
🔴 **FIVE DO NOT, including `hg_kds_readystep_`** — it produces only the `readyStepOff` prop
(`readyStepOff={cardViewMode === 'window' && !readyStepOn}`), which changes **buttons**, never
membership of the board.

---

# Q3. TWO SOURCES FOR "IS THERE A READY STEP"

## THE KDS — 🔴 IT DOES NOT READ `effectiveOrderReady`. AT ALL.

**TREE:** two occurrences of the identifier, **both inside comments**. **READ:**

```
  // passes `effectiveOrderReady`, and OrderCard reads that prop only in its `solo` branch, which the KDS
```
```
                   fight. `effectiveOrderReady` is still NOT passed: the dashboard's setting and this one
```

**HEAD:** 🔴 **zero occurrences** — `git show HEAD:` grepped for `effectiveOrderReady` returns 0.

**READ — the KDS's complete `<OrderCard>` prop list (TREE), every prop it passes:**

```
key · order · truck · event · slots · actionLoading · onAction · onEdit · viewMode · kdsMode ·
showCookingStep · categoryOrder · itemCategoryMap · catConfigs · ledgerRows · heldAuthorisation ·
hidePayments · readyStepOff · pendingSync · conflict · onBuzzer
```

🔴 **`effectiveOrderReady` IS ABSENT**, so the prop takes its default.

## WHICH ONE WINS ON THE KDS? THE QUESTION DOES NOT ARISE — ONLY ONE IS READ.

**Not because of a precedence rule, but because the other is structurally unreachable.** **READ**,
`components/dashboard/OrderCard.tsx` (BOTH):

```ts
    const readyStepEnabled = isPub || effectiveOrderReady
```

**That line sits AFTER the `cook` and `window` branches have already returned**, and the KDS only ever
produces those two:

```ts
  const cardViewMode = activeView === 'cook' ? 'cook' : 'window'
```

✅ **So on the KDS, `effectiveOrderReady` is SILENTLY IGNORED — and it would be ignored even if the KDS
passed it.** ⚠️ **There is no code that decides between them, because they never meet.** The
per-device key is the only one with effect on that surface, **and in HEAD not even that exists.**

## THE DASHBOARD — the opposite, and equally exclusive

**14 occurrences of `effectiveOrderReady` in BOTH HEAD and the tree** (count identical). **READ** —
the server resolution:

```ts
      vanOrderReadyDefault = van?.order_ready_enabled ?? false
      effectiveOrderReady = (capacityEvent as any)?.order_ready_override ?? vanOrderReadyDefault
```

**READ** — the dashboard's `<OrderCard>` calls, both of them:

```
effectiveOrderReady={effectiveOrderReady}   ×2
```

🔴 **AND THE DASHBOARD PASSES NEITHER `viewMode` NOR `readyStepOff`** — a repo-wide scan for
`viewMode=` and `readyStepOff=` finds **no producer in `app/dashboard/[token]/page.tsx`**. It renders
the default `viewMode = 'solo'`.

**So each surface reads exactly one of the two, and neither reads the other's.**

---

# Q4. IS THE DASHBOARD A COMPLETE SUPERSET OF THE KDS?

# 🔴 NO. A CASE EXISTS WHERE AN ORDER IS ON NEITHER, AND IT NEEDS NOBODY TO CHANGE ANYTHING.

## (a) Which orders each surface fetches

**BOTH surfaces call the SAME endpoint. READ — the KDS (BOTH):**

```ts
      const params = new URLSearchParams({ token })
      if (currentPin) params.set('pin', currentPin)
      if (vanId) params.set('van_id', vanId)
…
      if (selectedEventId) params.set('event_id', selectedEventId)
      const res = await fetch(`/api/dashboard?${params}`, { headers: await nativeAuthHeader() })
```

**READ — the dashboard (BOTH):**

```ts
      const p=new URLSearchParams({token}); if(currentPin) p.set('pin',currentPin)
      // Scope the read to the selected event (V6.4). Pass its date too so the
      // route resolves the right event even when it isn't today's first event.
      const sel=selectedEventRef.current
      if(sel){p.set('event_id',sel.id);p.set('date',sel.date)}
      const res=await fetch(`/api/dashboard?${p}`,{headers:await nativeAuthHeader()})
```

🔴 **THE PARAMETER SETS DIFFER IN BOTH DIRECTIONS:**

| Param | KDS | Dashboard |
|---|---|---|
| `event_id` | ✅ | ✅ |
| 🔴 **`date`** | 🔴 **NEVER SENT** | ✅ **always sent with `event_id`** |
| 🔴 **`van_id`** | ✅ **sent when the URL carries one** | 🔴 **NEVER SENT** |

**READ — the server's status sets, `app/api/dashboard/route.ts`:**

```ts
  const ACTIVE_STATUSES = ['pending', 'confirmed', 'modified', 'cooking', 'ready']
  // Terminal orders shown alongside the active list for the same event.
  const DONE_STATUSES = ['collected', 'rejected', 'cancelled']
```

✅ **Both surfaces receive both sets.** The server returns `ready` and `collected` orders to each.

## (b) How each resolves the event it is showing

**SERVER — READ, and this is the crux:**

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

🔴 **`eventIdParam` IS HONOURED ONLY IF IT IS IN `todayEvents` — AND `todayEvents` IS DATE-SCOPED:**

```ts
      .eq('truck_id', truck.id)
      .eq('event_date', date)
      .neq('status', 'cancelled')
```

**with — READ:**

```ts
  const date  = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
```

🔴 **THE KDS NEVER SENDS `date`, SO `date` IS ALWAYS TODAY FOR THE KDS.** If the KDS's
`selectedEventId` names an event that is not today's, the guard fails and the server **silently
substitutes** a today event (or none) — while the KDS client continues to believe it is showing the
event it seeded.

**CLIENT, KDS — READ (BOTH), the seed:**

```ts
    if (seededRef.current) return
    if (!events.length) return          // nothing to seed FROM yet — wait for the first successful fetch
    seededRef.current = true
    if (selectedEventId && events.some(e => e.id === selectedEventId)) return   // the URL seed resolved
    setSelectedEventId(pickDefaultEventByTime(events)?.id ?? null)
```

**And `pickDefaultEventByTime` CAN return a non-today event — READ, `lib/time-utils.ts`:**

```ts
  const current = events.find(e => startMs(e) <= now && now <= endMs(e))
  if (current) return current
  const upcoming = events.filter(e => startMs(e) >= now).sort((a, b) => startMs(a) - startMs(b))
  if (upcoming.length) return upcoming[0]
  return [...events].sort((a, b) => startMs(b) - startMs(a))[0] ?? null
```

⚠️ **Its second and third branches — "earliest upcoming" and "most recent past" — are explicitly not
date-bounded.** **INFERRED: with no event today, the KDS seeds a future or past event id, sends it
without `date`, and the server cannot honour it.**

**CLIENT, DASHBOARD:** `selectedEventRef.current` supplies **both** `id` and `date`, so its
`todayEvents` is built for the right day and its `event_id` always resolves. ⚠️ **The comment above
that line says so in as many words:** *"Pass its date too so the route resolves the right event even
when it isn't today's first event."*

## (c) Is either van-scoped?

# 🔴 THE KDS IS. THE DASHBOARD IS NOT.

**READ — the server:**

```ts
    // Van KDS: show orders for this van OR unassigned orders (van_id null appears on all vans)
    if (vanId) {
      activeOrdersQuery = activeOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
      doneOrdersQuery   = doneOrdersQuery.or(`van_id.eq.${vanId},van_id.is.null`)
    }
```

**READ — the dashboard reads a `van_id` from its own URL** (`const vanId=searchParams.get('van_id')??''`)
**but uses it ONLY for the heartbeat**, never on the `/api/dashboard` fetch — its `p` carries only
`token`, `pin`, `event_id`, `date`.

✅ **ON THE VAN AXIS THE DASHBOARD IS A STRICT SUPERSET:** it sees every van's orders for the event;
a van-scoped KDS sees its own van's plus unassigned.

## (d) Can an order visible on one be absent from the other?

# ✅ YES, IN BOTH DIRECTIONS.

| # | Case | On KDS? | On dashboard? |
|---|---|---|---|
| 1 | Order for van B, KDS opened with `van_id=A` | 🔴 **NO** | ✅ **YES** |
| 2 | Ninth order in grid layout | 🔴 **NO** (`.slice(0,8)`) | ✅ **YES** |
| 3 | `ready` order, cook view or payments-off window | 🔴 **NO** | ✅ **YES** *(if same event)* |
| 4 | 🔴 **KDS seeded a NON-TODAY event** | ⚠️ **client thinks yes; server served a different event** | 🔴 **only if the dashboard selected that same event** |
| 5 | 🔴 **Dashboard operator selected a DIFFERENT event** | ✅ **YES** | 🔴 **NO** |

## 🔴 STATED PLAINLY, AS ASKED

**An order that has left the KDS board is NOT always still visible on the dashboard.** It is visible
**only while the dashboard happens to have the same event selected.** The dashboard's event selection
is independent of the KDS's, and the KDS's is **seed-once-then-hold** (`seededRef.current` is set
before anything else and never cleared).

**THE EXACT CONDITIONS FOR "ON NEITHER":**

- **Case A — different events selected.** The KDS holds event A (seeded once, never re-resolved); the
  dashboard operator has selected event B. An order in event A at status `ready`, viewed on a KDS in
  cook view (or payments-off window), is **off the KDS board by filter #3 and outside the dashboard's
  `.eq('event_id', …)` fetch entirely.**
- **Case B — the KDS's event is not today's.** The KDS sends `event_id` without `date`; the server's
  `todayEvents` cannot contain it; `selectedEventId` falls back to a today event or `null`. **The KDS
  renders whatever that fallback returned**, and orders for the event the KDS believes it is showing
  are on neither surface.
- **Case C — grid overflow plus a different dashboard event.** Filter #6 caps at 8; if the dashboard
  is on another event, the ninth order is on neither.

⚠️ **"ALWAYS STILL ACTIONABLE" IS A SEPARATE QUESTION AND THE ANSWER IS ALSO NO** — but for a different
reason: an order absent from the dashboard's *fetch* cannot be acted on there at all. **INFERRED, from
(a): actionability follows visibility, because both surfaces act on the order set they fetched.**

⚠️ **NOT DETERMINABLE READ-ONLY: whether any live truck is currently in Case A or B.** That needs a
query against `truck_events` and the devices' stored state, which is forbidden here.

---

# Q5. `cook_screen`

## `lib/features.ts` — READ (BOTH; the file is not in the diff)

```ts
  // Max
  | 'ticket_printing'
  | 'multi_device_kds'
  | 'cook_screen'
  | 'whatsapp_replies'
```

```ts
const MAX_FEATURES: Feature[] = [
  ...PRO_FEATURES,   // includes whatsapp_replies now
  'ticket_printing',
  'multi_device_kds',
  'cook_screen',
]

const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]
```

## The marketing row — READ, `lib/plan-features.ts` (BOTH)

**The mapping:**

```ts
  'Customer-facing display': 'cook_screen',
```

**The row it names, with its per-plan values:**

```ts
      // Coming soon (kept at the bottom of the section)
      { name: 'Customer-facing display',   detail: 'A screen customers can see showing order numbers and when they’re ready.', starter: false, pro: false, max: 'coming_soon'  },
```

# 🔴 DO THE TWO FILES AGREE? NOT IN THE SENSE THAT MATTERS.

| | `lib/features.ts` | `lib/plan-features.ts` |
|---|---|---|
| Starter | ❌ not granted | `starter: false` — ✅ agree |
| Pro | ❌ not granted | `pro: false` — ✅ agree |
| **Max** | ✅ **GRANTED** (in `MAX_FEATURES`) | 🔴 **`'coming_soon'` — advertised as NOT YET AVAILABLE** |
| Trial | ✅ granted (`TRIAL_FEATURES`) | *no trial column* |

🔴 **THE PARITY CHECKER CANNOT SEE THIS, BY CONSTRUCTION. READ:**

```ts
      for (const tier of tiers) {
        if (row[tier] === true && !canAccess(tier, feature)) {
```

**It tests one direction only — advertised-true but gate-blocked.** `'coming_soon'` is not `=== true`,
so the row is skipped, **and the reverse case (gate grants, marketing says coming soon) is never
checked.** ⚠️ The file's own comment even names `'coming_soon'` as *"explicitly a legitimate
divergence"*.

🔴 **THEREFORE THE CLAIM "`can('cook_screen')` IS A SOLD MAX FEATURE" IS WRONG.** It appears in a
previous report and is now written into `docs/reference-manual.md` as **N122 (V11.22)**. **The gate
grants it; the pricing table does not sell it as available.**

⚠️ **AND THE TWO DESCRIBE DIFFERENT THINGS.** The row's `detail` reads *"A screen customers can see
showing order numbers and when they're ready"* — **customer-facing**. The gated `cook_screen` is the
KDS's Cook tab, an **operator grill screen with no prices**. **INFERRED: the mapping in
`ROW_FEATURE_MAP` couples a marketing row to a feature flag that is not the same product.**

## Every call site of `can('cook_screen')` — READ, repo-wide

| Site | What it gates |
|---|---|
| `kds/page.tsx`, in `const activeView: KdsView = can('cook_screen')` | 🔴 **whether Cook is reachable at all** — false forces `'window'` |
| `kds/page.tsx`, `{can('cook_screen') && (` | the **Cook tab button** in the header switcher |

**Two live call sites, both in the KDS. BOTH (identical in HEAD and tree).**

**Non-call references:** `app/admin/page.tsx:183` (a feature-name list for the admin override UI),
`lib/features.ts` ×2 (the union and `MAX_FEATURES`), `lib/plan-features.ts` ×1 (the mapping).
**No call site exists outside the KDS.**

---

# Q6. THE COOK-ONLY RENDERING

## `showPrices`, in full — READ (BOTH; identical in HEAD)

```ts
  const showPrices = viewMode !== 'cook'
```

🔴 **IT READS EXACTLY ONE FLAG: `viewMode`.** It does not read `hidePayments`, `showPaidStep`,
`readyStepOff`, `kdsMode`, `effectiveOrderReady` or any ledger value. **`git show HEAD:` confirms the
line is byte-identical.**

⚠️ **The adjacent `partPaidRow` reads BOTH**, which is what makes the asymmetry visible rather than
inferred:

```ts
  const partPaidRow = (hidePayments || viewMode === 'cook' || !effectivePartPaid) ? null : (
```

## Every cook branch, classified

### In `OrderCard` — READ (BOTH)

| Branch | Lifecycle or display? |
|---|---|
| `const partPaidRow = (hidePayments \|\| viewMode === 'cook' \|\| …)` | **DISPLAY** (money row hidden) |
| `const showPrices = viewMode !== 'cook'` | **DISPLAY** (prices) |
| `if (viewMode === 'cook' \|\| (viewMode === 'window' && hidePayments)) {` | 🔴 **LIFECYCLE** — the entire cook button set |
| `{viewMode === 'cook' ? (` *(header)* — *"Cook: non-interactive two-line header, no collapse"* | **DISPLAY** (shape, no collapse) |
| `` `${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'}` `` | **DISPLAY** (padding) |
| `{viewMode === 'cook' ? (` *(items)* — category-grouped block | **DISPLAY** (grouping) |
| `` `${viewMode === 'solo' \|\| viewMode === 'window' ? 'text-sm' : 'text-base'}` `` | **DISPLAY** (type size) |

⚠️ One further occurrence at `OrderCard.tsx` is **inside a comment** describing the removed Adjust-time
row (`viewMode !== 'cook'`) and gates nothing.

### In the KDS — READ (BOTH)

| Branch | Lifecycle or display? |
|---|---|
| `const displayOrders = (activeView === 'cook' ? cookOrders : windowOrders)` | 🔴 **LIFECYCLE** — which orders exist on the board |
| `const cardViewMode = activeView === 'cook' ? 'cook' : 'window'` | **BOTH** — it is the input to every row above |
| `activeView === 'window'` / `activeView === 'cook'` in the tab classNames ×2 | **DISPLAY** (tab highlight) |
| `{showPaidStep && activeView === 'window' && (` | 🔴 **LIFECYCLE-ADJACENT** — hides the payments chip on Cook |
| `{activeView === 'window' && !hidePayments && (` | 🔴 **LIFECYCLE-ADJACENT** — hides the Ready-step chip on Cook **(TREE-ONLY)** |
| `{activeView === 'window' && truck.crew_mode === 'full' && (` | **DISPLAY** — the "Open cook screen" link |
| `{allDayPills.length > 0 && activeView === 'window' && (` | **DISPLAY** — the "To make" bar |
| `{activeView === 'window' && activeLayout === 'list' && doneOrders.length > 0 && (` | **DISPLAY** — the "Done today" strip |

🔴 **HEAD vs TREE:** the Ready-step chip branch exists **only in the working tree**. Every other branch
in both tables is **BOTH**.

---

# Q7. THE SHARED CARD

## Producers of `viewMode` — READ, repo-wide scan for `viewMode=`

# 🔴 EXACTLY ONE PRODUCER EXISTS, AND IT IS THE KDS.

```tsx
                viewMode={cardViewMode}
```

**`app/dashboard/[token]/kds/page.tsx` — BOTH.** No other file in `app/` or `components/` passes the
prop.

## Producers of a ready-step prop

| Prop | Producer | HEAD / TREE |
|---|---|---|
| `readyStepOff` | `kds/page.tsx`: `readyStepOff={cardViewMode === 'window' && !readyStepOn}` | 🔴 **TREE-ONLY** |
| `effectiveOrderReady` | `page.tsx` (dashboard) ×2: `effectiveOrderReady={effectiveOrderReady}` | **BOTH** |

## Does the dashboard pass either?

✅ **IT PASSES `effectiveOrderReady` — twice, on both `<OrderCard>` calls.**
🔴 **IT PASSES NEITHER `viewMode` NOR `readyStepOff`.** A scan of
`app/dashboard/[token]/page.tsx` for `viewMode=` and `readyStepOff=` returns **no matches**, so its
cards render the default:

```ts
  viewMode = 'solo',
```
```ts
  readyStepOff = false,
```
*(the second is TREE-ONLY.)*

## Is the `ViewMode` union imported anywhere outside those two surfaces?

# 🔴 NO. IT IS NEVER IMPORTED ANYWHERE.

**READ** — `export type ViewMode = 'solo' | 'window' | 'cook'` is declared in
`components/dashboard/OrderCard.tsx`. A repo-wide scan of `app`, `components` and `lib` for `ViewMode`
outside that file returns **four hits, all in `kds/page.tsx`, and NONE of them an import**: one
comment, `const cardViewMode = …`, `viewMode={cardViewMode}` and `readyStepOff={cardViewMode === …}`.

⚠️ **INFERRED: the union is exported but consumed only structurally** — the KDS passes string literals
that happen to satisfy it, without naming the type.

---

# Q8. `van_devices`

## Is the migration applied?

# 🔴 CANNOT BE DETERMINED READ-ONLY.

**What IS readable: the migration FILE exists** — `supabase/migrations/20260701_van_devices.sql`,
2,629 bytes. **Whether it has been applied to any database is a property of the database, not of the
repository.**

**What would be needed:** a `select` against `information_schema.tables` / `information_schema.columns`
for `van_devices`, or the Supabase migration history. **Both are database reads, which this pass
forbids.**

⚠️ **INDIRECT EVIDENCE ONLY, offered as INFERRED and not as an answer:** production code paths query
the table unguarded — `app/api/native/bind-device`, `app/api/native/my-trucks`,
`app/api/native/switch-truck` and `app/api/orders/submit` all issue
`.from('van_devices')`. **A missing table would surface as PostgREST errors on those paths.** That is
consistent with the migration being applied; it does not establish it.

## Is any per-device KDS preference stored there today?

# 🔴 NO. NONE.

**READ — the table's full column list:**

```sql
CREATE TABLE IF NOT EXISTS van_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id       text NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  van_id         uuid REFERENCES truck_vans(id) ON DELETE SET NULL,
  device_id      text NOT NULL UNIQUE,
  push_token     text,
  platform       text,
  default_screen text NOT NULL DEFAULT 'dashboard' CHECK (default_screen IN ('dashboard','kds')),
  notify_enabled boolean NOT NULL DEFAULT true,
  last_seen      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

**There is no column for view, layout, sound, keep-awake, ready-step or payments.** ✅ **And no
server-side code references any `hg_kds_*` key** — a scan of `app/api` and `lib` returns one hit, a
comment in `lib/sound-prefs.ts`. **All eight Q2 preferences are client-side only.**

## Does a web (non-native) KDS have a row at all?

**The precise answer is: the API does not require native, but every UI path that writes one is
native-gated.**

**READ — the endpoint has no native check:** `bind-device`'s `GET` authenticates on
`truckFromToken(token)` and reads `device_id` from the query string. **READ — the client helper works
on web too:**

```ts
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(DEVICE_ID_KEY)
```

```ts
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
```

⚠️ **`platform` explicitly falls back to `'web'`**, so the schema anticipates a web row.

🔴 **BUT NO WEB SURFACE CALLS `saveDeviceConfig`.** Its callers are `OperatorDeviceConfig`,
`NotificationSettings` and `VanMenuChooser`, and the KDS mounts its device sheet behind
`isNativeApp() && !isDemo`. **INFERRED: a browser-only KDS therefore has no `van_devices` row in
practice, and a row could only appear if some other native path on the same device had already
created one.**

⚠️ **NOT DETERMINABLE READ-ONLY: whether any web-platform rows actually exist.** That needs
`select platform, count(*) from van_devices group by 1`.

---

# INTEGRITY

## Byte-level scan — NUL and control bytes below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. Every file opened in this pass, plus this report.**

```
  app/dashboard/[token]/kds/page.tsx                    122,095  offending=0  CR=0
  components/dashboard/OrderCard.tsx                     89,194  offending=0  CR=0
  app/dashboard/[token]/page.tsx                        391,343  offending=0  CR=0
  app/api/dashboard/route.ts                             49,584  offending=0  CR=0
  lib/features.ts                                           6,402  offending=0  CR=0
  lib/plan-features.ts                                     24,100  offending=0  CR=0
  lib/time-utils.ts                                         7,138  offending=0  CR=0
  components/dashboard/helpers.ts                           8,338  offending=0  CR=0
  lib/native/device.ts                                      4,548  offending=0  CR=0
  lib/sound-prefs.ts                                       6,676  offending=0  CR=0
  app/api/native/bind-device/route.ts                       4,893  offending=0  CR=0
  supabase/migrations/20260701_van_devices.sql             2,629  offending=0  CR=0
  docs/kds-exit-point-report.md  (SEPARATE PASS)         34,678  offending=0  CR=0
TOTAL OFFENDING ACROSS ALL FILES: 0
```

⚠️ **The report was scanned in a SEPARATE pass after being written**, not in the same command as the
source files.

## 🔴 Carrier-aware variation-selector check on this report

**Per emoji-presentation base: how many occurrences are FOLLOWED by U+FE0F. A raw total is not
reported, because a raw total cannot distinguish a bare warning sign from a paired one on a different
base.**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 39 | 0 | 39 |
| U+1F534 LARGE RED CIRCLE | 60 | 0 | 60 |
| U+26A0 WARNING SIGN | 22 | **22** | **0** |

**Every warning sign in this report is paired; ZERO are bare — 22 of 22.** The file's total U+FE0F
count is **22**, which accounts for all of them and leaves none attached to any other base. ⚠️ **The
two unpaired bases are internally consistent (0 of 39, 0 of 60), so neither is split across two
renderings.** ✅ **U+2500 does not appear in this report at all.**

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
```

🔴 **NOTHING WAS CHANGED BY THIS PASS EXCEPT `docs/kds-exit-point-report.md`.**

**Which entries were already there before this pass began — ALL OF THEM EXCEPT THIS REPORT:**

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — the ready-step toggle, finish-time extraction, shared Event actions menu, extend removal |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — finish-time extraction, shared menu, extend removal |
| `M app/manage/[token]/page.tsx` | ✅ pre-existing — the cuisine dropdown |
| `M components/DemoGetStarted.tsx` | ✅ pre-existing — the cuisine dropdown |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing — the ready-step toggle |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.22 update |
| `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing |
| `?? components/shared/EventActionsModal.tsx` | ✅ pre-existing |
| `?? components/shared/EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/cuisine-field-report.md` | ✅ pre-existing |
| `?? docs/extend-removal-report.md` | ✅ pre-existing |
| `?? docs/finish-time-dry-report.md` | ✅ pre-existing |
| `?? docs/kds-ready-toggle-report.md` | ✅ pre-existing |
| `?? docs/kds-steps-model-report.md` | ✅ pre-existing |
| `?? docs/kds-toggles-review-report.md` | ✅ pre-existing |
| 🔴 `?? docs/kds-exit-point-report.md` | 🔴 **THIS PASS — the only new entry** |
