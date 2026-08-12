# One confirmation, two ways in — the map

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied — this is the map, as asked.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE FIVE THINGS THAT DECIDE THIS

1. ✅ **`useSearchParams` IS ALREADY IMPORTED AND ALREADY USED** — line 11, called at line 165 for `?event_id`. 🔴 **So no Suspense boundary is needed and nothing about the existing render changes.** The question's "if not" branch does not apply.
2. 🔴 **THERE ARE FIVE EARLY RETURNS, NOT FOUR.** A feature gate at `:1260` sits between the error branch and the confirmation, and it would swallow a confirmation URL on any truck without `advance_preordering`.
3. 🔴 **THREE PERSISTENCE GAPS, ALL THE SAME SHAPE:** `requested_slot`, `slot_changed` and the ASAP estimate. A repo-wide grep for all three returns **zero hits** in `app/`, `lib/` and `supabase/`. The customer path records the OUTCOME and discards the REQUEST.
4. 🔴 **ON FIRST MOUNT THE PAGE FIRES THREE NETWORK REQUESTS AND STARTS TWO 30-SECOND INTERVALS**, and none of them is gated on `submitted`. A confirmation URL would build an entire menu it never renders.
5. 🔴 **`/api/orders/[id]` ALREADY EXISTS, KEYED ON `order_key`, AND ALREADY RETURNS TEN OF THE FOURTEEN VALUES.** It omits four, three of which are the persistence gaps.

---

## 1. The `submitted` render, and where every value comes from

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx:1283-1417`.

```tsx
  if (submitted) return (
    <Shell><Hdr slug={slug} truck={truck} scrolled={false} showBack={false} />
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
          <h2 className="text-2xl font-black text-slate-900 mb-1">{submittedAutoAccepted ? 'Order confirmed!' : 'Order received!'}</h2>
          <p className="text-slate-500 mb-3 text-sm">
            {submittedAutoAccepted
              ? <>Thanks! We've received your order and it'll be ready soon.</>
              : <><span className="font-semibold text-slate-700">{truckName}</span> will confirm your order shortly.</>
            }
          </p>

          {submittedOrderId && <p className="text-slate-400 text-sm mb-3">Order #{submittedOrderId}</p>}

          {/* Collection time — promoted above the receipt */}
          {(submittedConfirmedSlot || selectedSlot) && (
            submittedAutoAccepted && submittedConfirmedSlot ? (
              <div className={`rounded-xl p-3 mb-4 text-sm text-center border ${(submittedSlotChanged || asapMoved) ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
                {submittedSlotChanged && submittedRequestedSlot ? (
                  <>
                    <p className="font-black text-amber-900 text-base">Ready at {submittedConfirmedSlot}</p>
                    <p className="text-amber-700 text-xs mt-0.5">Your {submittedRequestedSlot} slot was just taken — this is the next available time.</p>
                  </>
                ) : asapMoved ? (
                  <>
                    <p className="font-black text-amber-900 text-base">Ready at {submittedConfirmedSlot}</p>
                    <p className="text-amber-700 text-xs mt-0.5">Slightly later than the {formatTime(submittedAsapEstimate!)} we estimated.</p>
                  </>
                ) : (
                  <>
                    <p className="font-bold text-green-800 mb-0.5">Collection time: {submittedConfirmedSlot}</p>
                    <p className="text-green-700 text-xs">See you at the hatch!</p>
                  </>
                )}
              </div>
            ) : (selectedSlot || submittedConfirmedSlot) ? (
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-sm text-left">
                <p className="font-black text-orange-800 text-base">Preferred collection: {asapMoved ? submittedConfirmedSlot : (selectedSlot || submittedConfirmedSlot)}</p>
                {asapMoved && (
                  <p className="text-orange-600 text-xs mt-0.5">Slightly later than the {formatTime(submittedAsapEstimate!)} we estimated.</p>
                )}
                <p className="text-orange-600 text-xs mt-0.5">{truckName} will confirm your collection time when they accept your order.</p>
              </div>
            ) : null
          )}

          <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2 mb-4 border border-slate-100">
            {basket.map(b => (
              <OrderLineItem
                key={b.cartKey}
                name={b.menuItem.name}
                quantity={b.quantity}
                unitPrice={b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0)}
                basePrice={b.menuItem.price}
                modifiers={b.modifiers}
                specialInstructions={b.specialInstructions}
                variant="customer"
              />
            ))}
            {appliedDeals.map((deal, i) => {
              const origPrice = calcDealOriginalPrice(deal, menu?.items || [])
              const saving = origPrice > deal.bundle.bundle_price ? origPrice - deal.bundle.bundle_price : 0
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">
                      🎁 {deal.bundle.name}
                      {saving > 0 && <span className="ml-1.5 text-green-600 font-medium">save £{saving.toFixed(2)}</span>}
                    </span>
                    <span className="font-medium text-slate-700">£{deal.bundle.bundle_price.toFixed(2)}</span>
                  </div>
                  {Object.keys(deal.slots).sort().map(slotKey => {
                    const itemName = deal.slots[slotKey]
                    if (!itemName) return null
                    const mods = deal.slotModifiers?.[slotKey] || []
                    const note = deal.slotNotes?.[slotKey]
                    return (
                      <div key={slotKey}>
                        <div className="pl-3 text-xs text-slate-400">{itemName}</div>
                        {mods.map(m => (
                          <div key={m.name} className="flex justify-between pl-6 text-xs text-slate-400">
                            <span>{m.name}</span>
                            {m.price > 0 && <span>+£{m.price.toFixed(2)}</span>}
                          </div>
                        ))}
                        {note && <div className="pl-6 text-xs text-slate-400 italic">📝 {note}</div>}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
              <span className="font-black text-slate-900">Total</span>
              <span className="font-black text-slate-900">£{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Payment</span>
            <span className="font-bold text-slate-700">Pay at the truck</span>
          </div>

          {cardFallbackNotice && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-left">
              <p className="text-xs text-amber-700">
                We couldn’t start the card payment, so your order is set to pay at the truck instead.
                Your order is placed — nothing has been charged.
              </p>
            </div>
          )}

          <p className="text-slate-400 text-xs mb-6">Confirmation sent to {email}</p>
          <a href={`/trucks/${slug}/order`} className="block w-full bg-slate-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors">
            Back to {truckName}
          </a>
```

### Every value, its variable, and where it is assigned

**The submit response — `app/api/orders/submit/route.ts:1122-1136`:**

```ts
    return NextResponse.json({
      success: true, orderId, orderKey: order.order_key, truckName: truck.name,
      slot: confirmedSlot, requestedSlot, autoAccepted, slotChanged, total,
    })
```

**The assignment block — `page.tsx:1231-1239`:**

```tsx
      setSubmittedOrderId(data.orderId)
      setSubmittedAutoAccepted(!!data.autoAccepted)
      setSubmittedConfirmedSlot(data.slot ?? null)
      setSubmittedRequestedSlot(data.requestedSlot ?? (selectedSlot || null))
      setSubmittedSlotChanged(!!data.slotChanged)
      setSubmittedAsapEstimate(asapChosen ? (backwardAsap || asapSlot || customerAsapTime || null) : null)
      setSubmitted(true)
```

| # | Displayed | Variable | Assigned at | Class |
|---|---|---|---|---|
| 1 | Truck logo + name in the header | `truck` | `:535` `setTruck(data.truck)` from `/api/menu` | 🔵 **FETCH** |
| 2 | "Order confirmed!" / "Order received!" | `submittedAutoAccepted` | `:1232` ← `data.autoAccepted` | 🟢 **SUBMIT RESPONSE** |
| 3 | Truck display name | `truckName` = `displayTruckName(truck?.name)` (`:203`) | derived from the fetch | 🔵 **FETCH** |
| 4 | `Order #{n}` | `submittedOrderId` | `:1231` ← `data.orderId` | 🟢 **SUBMIT RESPONSE** |
| 5 | Confirmed slot | `submittedConfirmedSlot` | `:1233` ← `data.slot` | 🟢 **SUBMIT RESPONSE** |
| 6 | 🔴 Requested slot | `submittedRequestedSlot` | `:1234` ← `data.requestedSlot` **?? `selectedSlot`** | 🟢/🟠 **RESPONSE, falling back to COMPONENT STATE** |
| 7 | 🔴 Slot-moved styling and sentence | `submittedSlotChanged` | `:1235` ← `data.slotChanged` | 🟢 **SUBMIT RESPONSE** |
| 8 | 🔴 ASAP estimate | `submittedAsapEstimate` | `:1238` ← `backwardAsap \|\| asapSlot \|\| customerAsapTime` | 🟠 **PURE COMPONENT STATE — never sent, never stored** |
| 8b | `asapMoved` | derived `:1279-1281` from #5 and #8 | — | 🟠 **derived from component state** |
| 9 | Every basket line — name, qty, unit price, base price, modifiers, instructions | `basket` | `:316` `useState([])`, mutated by `addItem`/`removeItem` | 🟠 **COMPONENT STATE** |
| 10 | Every deal — name, price, savings, slots, slot modifiers, slot notes | `appliedDeals` + **`menu?.items`** for `calcDealOriginalPrice` | `:317` state; `menu` from the fetch | 🟠 **COMPONENT STATE + 🔵 FETCH** |
| 11 | Total | `total` | `:823` `useMemo` over `basket`/`appliedDeals`/`appliedCode`/`menu` | 🟠 **COMPONENT STATE (derived)** |
| 12 | `Payment: Pay at the truck` | — | 🔴 **HARDCODED STRING, no variable** | ⚫ **LITERAL** |
| 13 | Card-fallback notice | `cardFallbackNotice` | `:1228` | 🟠 **COMPONENT STATE** |
| 14 | `Confirmation sent to {email}` | `email` | `:329` the form field | 🟠 **COMPONENT STATE** |
| 15 | Fallback slot in the pending branch | `selectedSlot` | derived from `slotHour`/`slotMinute` | 🟠 **COMPONENT STATE** |

🔴 **FOUR values come from the submit response (2, 4, 5, 7 — plus half of 6). EVERYTHING ELSE is component state or a fetch.**

---

## 2. Which values survive an `order_key`, and the persistence gaps

**Source: QUOTED** for every column claim.

| # | Value | Rebuildable? | Table.column |
|---|---|---|---|
| 1 | Truck logo + name | ✅ **YES** | `orders.truck_id` → `trucks.name`, `trucks.logo_storage_path` |
| 2 | Confirmed vs received | ✅ **YES** | `orders.status` — `'confirmed'` ⇒ auto-accepted, `'pending'` ⇒ not |
| 3 | Truck display name | ✅ **YES** | `trucks.name` |
| 4 | Order number | ✅ **YES** | `orders.id` |
| 5 | Confirmed slot | ✅ **YES** | `orders.slot` |
| 6 | 🔴 **Requested slot** | 🔴 **NO** | 🔴 **NO COLUMN** |
| 7 | 🔴 **Slot changed** | 🔴 **NO** | 🔴 **NO COLUMN** |
| 8 | 🔴 **ASAP estimate** | 🔴 **NO** | 🔴 **NEVER LEFT THE BROWSER** — not in the request body either |
| 9 | Basket lines + modifiers + instructions | ✅ **YES** | `orders.items` JSONB — `{name, quantity, unit_price, modifiers[{name,price}], specialInstructions}` |
| 10 | Deals with slots/modifiers/notes | ✅ **YES** | `orders.deals` JSONB — `{name, slots, slotModifiers, slotNotes, price}` |
| 10b | ⚠️ Deal SAVINGS | ⚠️ **PARTLY** | `orders.deal_savings` exists (`20260728_orders_total_minor_deal_savings.sql:41`) but is written by the **walk-up path only**. The customer path computes it live from `menu_items_db` — 🔴 **so a rebuild needs a MENU READ, against a menu that may have changed** |
| 11 | Total | ✅ **YES** | `orders.total` |
| 12 | Payment line | ✅ **YES — and better than today** | `orders.payment_status` |
| 13 | Card-fallback notice | 🔴 **NO** | ⚠️ **Moot** — it means "Stripe could not start", which is a client-only fact |
| 14 | Email | ✅ **YES** | `orders.customer_email` |
| 15 | Fallback slot | ✅ **YES** | subsumed by #5 |

### 🔴 THE PERSISTENCE GAPS, LISTED SEPARATELY

**Proven by exhaustive negative search:**

```
$ grep -rn "requested_slot\|slot_changed\|asap_estimate" app lib supabase
  🔴 ZERO HITS for all three
```

| Gap | What a migration would add | Type | Nullable for existing rows? |
|---|---|---|---|
| 🔴 **1. The requested slot** | `orders.requested_slot` | **`text`** — matching `orders.slot`'s `HH:MM` shape | ✅ **MUST be nullable.** 442 existing rows have no value and none can be derived. ⚠️ **Also correctly null for an ASAP order**, which requests no slot |
| 🔴 **2. Whether the slot moved** | ⚠️ **Probably NOTHING** — derivable as `requested_slot IS NOT NULL AND requested_slot <> slot` | — | — |
| 🔴 **3. The ASAP estimate** | `orders.asap_estimate` | **`text`** (`HH:MM`) | ✅ **MUST be nullable** — never captured, and null for every non-ASAP order. 🔴 **It must ALSO be added to the submit REQUEST BODY**, because the server never sees it |

⚠️ **GAP 2 IS PROBABLY NOT A COLUMN.** `slotChanged` is computed server-side and returned; if `requested_slot` were stored, the comparison reproduces it. **Storing a derived boolean would create two sources for one fact** — the failure this codebase repeatedly records. **INFERRED**, but from the quoted assignment `data.slotChanged` alongside `data.requestedSlot`.

⚠️ **GAP 3 IS THE ONLY ONE THAT NEEDS A CLIENT CHANGE TOO.** `backwardAsap || asapSlot || customerAsapTime` are all browser-computed from the slots fetch; the server has no equivalent. **A column alone would stay permanently null.**

⚠️ **A fourth, softer gap: deal savings.** `orders.deal_savings` exists but the customer path does not populate it, so a rebuild either reads the live menu (and may differ from what the customer saw) or the column starts being written.

---

## 3. Every early return, in order

**Source: QUOTED. 🔴 THERE ARE FIVE, NOT FOUR.**

| # | Line | Condition | What renders |
|---|---|---|---|
| 1 | **1246** | `if (loading)` | `<Shell>` + *"Loading menu..."* |
| 2 | **1248** | `if (error && !submitted)` | 😕 page-replacing error + "Back to truck page" |
| 3 | 🔴 **1260** | 🔴 **`if (truck && !hasFeature(truck.plan, 'advance_preordering'))`** | 🚚 *"Online ordering not available"* |
| 4 | **1283** | `if (submitted)` | 🔴 **THE CONFIRMATION** |
| 5 | **1469** | `return (` | the main form |

**Quoted, the one that is easy to miss:**

```tsx
  if (truck && !hasFeature(truck.plan, 'advance_preordering')) {
    return (
      <Shell>
        <Hdr slug={slug} truck={truck} scrolled={false} />
        …
            <p className="font-bold text-slate-900 mb-1">Online ordering not available</p>
            <p className="text-slate-500 text-sm">This truck takes walk-up orders at the hatch.</p>
```

### 🔴 WHAT THIS MEANS FOR A NEW BRANCH

**Everything before line 1283 runs first**, so a confirmation branch placed at or after it inherits three gates:

- 🔴 **`loading` (`:1246`)** — set false only by the **menu fetch's `.finally()`** (`:559`). **A confirmation URL would sit on "Loading menu..." until the menu resolves**, even though it renders no menu.
- 🔴 **`error && !submitted` (`:1248`)** — `error` is set by the menu fetch's catch (*"This truck is not currently taking orders."*). ⚠️ **The `&& !submitted` guard exists precisely so a submitted order is not replaced by an error** — a URL-driven branch would need the same protection.
- 🔴 **THE FEATURE GATE (`:1260`)** — `advance_preordering` is **NOT held by `starter`**. 🔴 **A confirmation URL on a starter truck would render "Online ordering not available" instead of the confirmation**, for an order that truck genuinely took.

⚠️ **`asapMoved` is computed at `:1279-1281`, between the gate and the confirmation** — inside the component body, so it runs on every render regardless of branch.

---

## 4. Route parameters — and the premise is already satisfied

**Source: QUOTED. 🔴 CORRECTION: `useSearchParams` IS IMPORTED AND ALREADY IN USE.**

```tsx
11:import { useSearchParams } from 'next/navigation';
```
```tsx
159:  const { slug } = use(params)
165:  const searchParams = useSearchParams()
166:  const eventIdParam = searchParams.get('event_id')
```

| Mechanism | How |
|---|---|
| **The dynamic segment** `[slug]` | `const { slug } = use(params)` — React's `use()` on the promise Next passes |
| **The query string** | ✅ **`useSearchParams()`, already called at `:165`** |

### 🔴 SO THE "IF NOT" BRANCH OF THE QUESTION DOES NOT APPLY

✅ **No Suspense boundary is needed.** Next.js requires one for `useSearchParams` in a page that would otherwise be statically prerendered — **this page already calls it, ships no `<Suspense>` anywhere (`grep` returns nothing in the file or the route folder), and builds today.**

⚠️ **INFERRED, and worth stating:** since the hook is already present, whatever accommodation Next needs is **already made** — reading a second parameter from the same `searchParams` object is a one-line addition with **zero effect on the existing render**. **Not established** exactly how the build satisfies the requirement (there is no `loading.tsx` and no `<Suspense>`); only that it does, because the page is live.

⚠️ `eventIdParam` feeds an effect at `:534` with deps `[eventIdParam, events, isDemo]` — **a second parameter would need its own consumer, not a change to that one.**

---

## 5. First mount — every fetch, every effect, and what is gated

**Source: QUOTED.** 13 effects; the three that hit the network on mount:

### The three mount-time fetches

**(a) Events — `:449-516`, deps `[slug, reloadKey]`**
```tsx
          const res = await fetch(`/api/events?truck=${slug}`)
```
🔴 **UNGATED. Fires on every mount, up to three attempts.**

**(b) Menu — `:540-560`, `refetchMenu` deps `[slug, event?.id]`, effect deps `[refetchMenu]`**
```tsx
    const menuUrl = event?.id ? `/api/menu/${slug}?event_id=${event.id}` : `/api/menu/${slug}`
    const r = await fetch(menuUrl, { cache: 'no-store' })
```
🔴 **UNGATED, and it OWNS `loading`** — `.finally(() => setLoading(false))`. **Nothing renders until it resolves.**

**(c) Slots — `fetchSlots` at `:394-418`, called from the effect at `:433-436`**
```tsx
      const res = await fetch(`/api/slots/${truckId}?${p}`, { cache: 'no-store' })
```
⚠️ **Gated on `truck?.id` and the event's times** — so it fires **once the menu lands**, not before. **Still fires.**

### The two 30-second intervals

**(d) Clock tick — `:419-422`, deps `[]`**
```tsx
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
```
🔴 **COMPLETELY UNGATED. Runs forever on any render path, including the confirmation.**

**(e) Menu poll — `:569-586`, deps `[event?.id, eventEnded, slug]`**
```tsx
    if (!event?.id || eventEnded) return
    const id = setInterval(async () => {
      const r = await fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' })
```
🔴 **Gated on `event?.id && !eventEnded` — NOT on `submitted`.** Once an event resolves it polls indefinitely.

**(f) `visibilitychange` slots refetch — `:438-446`**
```tsx
    document.addEventListener('visibilitychange', onVisible)
```
⚠️ Gated on `truck?.id`. **Refetches slots whenever the tab regains focus.**

### 🔴 WHAT A CONFIRMATION URL WOULD FIRE TODAY

| Effect | Gated on `submitted`? | Fires? |
|---|---|---|
| Events fetch | 🔴 **NO** | ✅ **YES** — 1 request |
| Menu fetch | 🔴 **NO** | ✅ **YES** — 1 request, **and it owns `loading`** |
| Slots fetch | 🔴 **NO** (gated on `truck?.id`) | ✅ **YES** — 1 request, after the menu |
| 30 s clock tick | 🔴 **NO** | ✅ **YES — forever** |
| 30 s menu poll | 🔴 **NO** (gated on `event?.id`) | ✅ **YES — forever** |
| `visibilitychange` | 🔴 **NO** | ✅ registered |
| The 7 non-network effects | — | ✅ all run |

🔴 **THREE NETWORK REQUESTS AND TWO PERPETUAL INTERVALS TO RENDER A CONFIRMATION THAT NEEDS ONE ORDER ROW.** ⚠️ **`loading` is the hard one**: the confirmation cannot render before the menu fetch settles, because `:1246` returns first.

---

## 6. The basket, and what a returning customer would see

**Source: QUOTED.**

```tsx
  const [basket, setBasket] = useState<BasketItem[]>([])
```

### `setBasket` — six call sites, and NOT ONE of them clears it on success

| Line | What |
|---|---|
| 608 | `addItem` |
| 624 | `removeItem` |
| 638 | `capBasketToRemaining` — the 409-stock branch |
| 701 | `confirmAddFromModal` (edit path) |
| 805 | `handleApplyDeal` — consumes items into a deal |
| 814 | `removeDeal` — removes the deal's items |

🔴 **THERE IS NO `setBasket([])` ANYWHERE.** A grep for `localStorage` / `sessionStorage` in the file returns **nothing** — the basket is in-memory only.

### 🔴 WHAT CLEARS IT TODAY: A FULL PAGE NAVIGATION, AND ONLY THAT

```tsx
          <a href={`/trucks/${slug}/order`} className="block w-full …">
            Back to {truckName}
          </a>
```

**The comment above it, quoted:**
```tsx
          {/* … A full navigation (<a>) reloads a fresh form — the confirmation shares this
             URL, so a soft <Link> would just re-render the confirmation. */}
```

### What a URL-arriving customer would see

| Scenario | Basket state | What they see |
|---|---|---|
| 🔴 **Arrives at the confirmation URL directly** (from Stripe, a bookmark, a new tab) | 🔴 **EMPTY** — fresh mount, `useState([])` | 🔴 **THE RECEIPT WOULD BE BLANK.** `basket.map(...)` renders nothing and `total` is £0.00 — **the confirmation is unusable without a fetch** |
| **Then navigates back to the order page** | ⚠️ **Depends entirely on HOW** | see below |

| Navigation | Result |
|---|---|
| **A full `<a href>` reload** | ✅ **Fresh mount, empty basket** — correct |
| 🔴 **A soft `<Link>` or `router.push` that only drops the query param** | 🔴 **The component does NOT remount. Whatever basket state exists persists.** For a URL arrival that is empty — harmless. **But for the pay-at-hatch customer, who reached the confirmation with a FULL basket, dropping the param would return them to the form with their already-ordered basket still in it** |
| **The browser Back button after a Stripe redirect** | ⚠️ **Not established** — depends on bfcache and whether Next treats it as a fresh mount |

🔴 **SO THE STALE-BASKET RISK IS REAL BUT ASYMMETRIC:** it does **not** affect the URL-arriving card customer (empty basket) and **does** affect the in-page pay-at-hatch customer if the same branch is ever left by a soft navigation.

---

## 7. What an API route would need — and one already exists

**Source: QUOTED. ✅ `app/api/orders/[id]/route.ts` ALREADY RETURNS AN ORDER BY `order_key` FOR A CUSTOMER.**

```ts
  // [id] is the order_key UUID — globally unique, so no truck scoping needed.
  const { id } = await params
  …
    .eq('order_key', id)
    .single()
```

**Its full response:**

```ts
  return NextResponse.json({
    id: order.id,
    status: order.status,
    customer_name: order.customer_name,
    slot: order.slot,
    event_date: order.event_date,
    items: order.items,
    deals: order.deals,
    total: order.total,
    payment_status: order.payment_status ?? 'unpaid',
    truck_name: truck?.name ?? null,
    venue_name: venueName,
    allow_cancellation: truck?.allow_customer_cancellation ?? false,
    cancellation_cutoff_mins: truck?.cancellation_cutoff_mins ?? 0,
  })
```

### What it ALREADY satisfies — ten of fourteen

✅ `id` (#4) · `status` (#2) · `slot` (#5) · `items` (#9) · `deals` (#10) · `total` (#11) · **`payment_status` (#12 — the paid line you want)** · `truck_name` (#3) · plus `venue_name`, `customer_name`, `event_date`

### 🔴 EXACTLY WHAT IT OMITS — four

| Missing | Why | Fixable without a migration? |
|---|---|---|
| 🔴 **`customer_email`** (#14) | not selected — but **the column exists** | ✅ **YES — add it to the select** |
| 🔴 **Truck logo** (#1) | not selected. The page resolves it via `resolveTruckLogo` from `/api/menu` | ✅ **YES — same resolver, one more field** |
| 🔴 **Deal savings** (#10b) | the route returns `deals` but not the menu prices needed to compute savings | ⚠️ **Either add a menu read, or start writing `orders.deal_savings` on the customer path** |
| 🔴 **`requested_slot` / `slot_changed` / ASAP estimate** (#6, #7, #8) | 🔴 **THE COLUMNS DO NOT EXIST** | 🔴 **NO — see §2** |

### ⚠️ TWO THINGS TO WEIGH, NEITHER OF THEM A RECOMMENDATION

- ⚠️ **The route has NO truck scoping** — its own comment says *"order_key UUID — globally unique, so no truck scoping needed"*. **A confirmation URL under `/trucks/[slug]/order` carries a slug the order may not match.** §9.
- ⚠️ **It is already the manage page's data source**, so widening its select changes that page's payload too. **Additive fields are harmless there** (`OrderState` is a type, not a runtime filter), but it is a shared route.

---

## 8. `canCancel`, and what gating it on payment would need

**Source: QUOTED.** `app/order/[id]/manage/page.tsx:109-119`:

```tsx
  const isPastCutoff = (): boolean => {
    if (!order.slot || !order.event_date || !order.cancellation_cutoff_mins) return false
    const slotTime = new Date(`${order.event_date}T${order.slot}`)
    const cutoff = new Date(slotTime.getTime() - order.cancellation_cutoff_mins * 60 * 1000)
    return new Date() > cutoff
  }

  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPastCutoff()
```

🔴 **Three conditions. `payment_status`, `paid_at`, `amount_paid` and the ledger appear in NONE of them.**

### ✅ THE FIELD IS ALREADY FETCHED

**`OrderState`, `:6-21`:**
```tsx
type OrderState = {
  …
  /** From the order row, never from a query parameter — see the API note. */
  payment_status: string | null
  …
}
```

**And it is already rendered, `:162-163`:**
```tsx
            <span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-slate-900'}`}>
              {order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
            </span>
```

### What gating would require

| Question | Answer |
|---|---|
| **Which field?** | ✅ **`order.payment_status`** |
| **Is it already fetched?** | ✅ **YES** — by `/api/orders/[id]` (`payment_status: order.payment_status ?? 'unpaid'`), already typed and already rendered |
| **Would it need a migration?** | 🔴 **NO** |
| **Would it need an API change?** | 🔴 **NO** |
| **Scope of the change** | ⚠️ **One conjunct in `canCancel`, plus a branch in `statusLabel()`** so the "why not" copy says something true about a paid order |

⚠️ **`part_paid` and `refunded` are also legal values** (the CHECK admits six), so a gate reading only `=== 'paid'` would leave `part_paid` cancellable. **Not established** what the right treatment of `part_paid` is — that is a product decision.

---

## 9. Not-found, wrong-truck, cancelled

**Source: QUOTED** for the patterns; **INFERRED** for what should happen.

### The existing customer-facing patterns — there are exactly two, and they match

**The order page, `:1248-1258`:**
```tsx
  if (error && !submitted) return (
    <Shell><Hdr slug={slug} truck={truck} scrolled={false} />
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto">😕</div>
          <p className="text-slate-600 font-medium">{error}</p>
          <a href={`/trucks/${slug}/order`} className="mt-4 inline-block text-orange-600 font-bold hover:underline">← Back to truck page</a>
```

**The manage page, `:68-77`:**
```tsx
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-sm">
          <div className="text-3xl mb-3">😕</div>
          <h2 className="font-bold text-slate-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-slate-500">{error}</p>
```

✅ **A consistent house pattern: 😕 + a plain sentence + (on the order page) a way back. No 404 page, no `notFound()`, no stack trace.**

**And the API's own not-found, `api/orders/[id]/route.ts:41-43`:**
```ts
  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
```

### The three cases — INFERRED, since none is implemented

| Case | What exists today | ⚠️ What is undecided |
|---|---|---|
| **Order does not exist** | The API returns `404 { error: 'Order not found' }`; both pages render 😕 with that text | ⚠️ *"Order not found"* is fine for a mistyped URL. **Not established** whether it should differ for an expired link |
| 🔴 **Belongs to another truck** | 🔴 **NOTHING CHECKS.** `/api/orders/[id]` is deliberately unscoped — *"order_key UUID — globally unique, so no truck scoping needed"* | 🔴 **A confirmation under `/trucks/[slug]/order` carries a slug. If `orders.truck_id` disagrees, the page would render another truck's order under this truck's header.** ⚠️ **Not a data leak** (the order_key is an unguessable UUID) **but a correctness one.** The comparison is available — the route already reads `order.truck_id` |
| **Cancelled** | The manage page shows `Status: cancelled` and `statusLabel()` returns *"This order has already been cancelled."* | ⚠️ **A confirmation saying "Order confirmed!" for a cancelled order would be actively wrong.** `orders.status` is fetched and would carry it. **Not established** whether it should redirect, or render a cancelled variant |

⚠️ **A fourth case nobody has named: an order in `ready` or `collected`.** *"Order received!"* would be stale for food already handed over. **Not established.**

---

## 10. Everything that links to `/order/[id]/manage`

**Source: QUOTED.** An exhaustive grep. **Three writers, and none is an in-app link.**

| # | Where | The link | Must keep working? |
|---|---|---|---|
| 1 | 🔴 **`lib/email.ts:193`** | `<a href="${params.baseUrl \|\| 'https://www.hatchgrab.com'}/order/${params.orderKey}/manage" …>Cancel your order</a>` | 🔴 **YES, ABSOLUTELY.** Already in customers' inboxes |
| 2 | `app/api/stripe/checkout/route.ts:147` | `success_url: \`${base}/order/${order.order_key}/manage?paid=1\`` | ⚠️ **This is what the work replaces** |
| 3 | `app/api/stripe/checkout/route.ts:148` | `cancel_url: \`${base}/order/${order.order_key}/manage\`` | ⚠️ same |

### 🔴 THERE IS NO IN-APP `<Link>` OR `href` TO IT

```
$ grep -rn 'href={`/order/\|href="/order/\|Link href={`/order' app components
  NONE — no in-app link
```

⚠️ **The other `/manage` hits are a DIFFERENT route** — `app/api/auth/verify-signup/route.ts:116` builds `${base}/manage`, the operator console. **Not related.**

### 🔴 THE CONSTRAINT THIS IMPOSES

**The email is the binding one.** Its surrounding copy, `:190-195`:

```html
      <p style="margin:0;font-size:12px;color:#94a3b8">
        Need to cancel?
        <a href="…/order/${params.orderKey}/manage" …>Cancel your order</a>
        (up to ${params.cancellationCutoffMins ?? 30} minutes before your pickup time)
      </p>
```

🔴 **A customer following that link expects a cancel control and must find one.** ⚠️ **It is conditional** — `params.allowCancellation && !isReady` — so a truck with cancellation off, or a ready-order email, links nowhere at all. **Those customers have no route to their order today.**

✅ **So the manage page must keep existing and keep cancelling.** ⚠️ **Only the two Stripe URLs are free to move.**

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the full render, the submit response, the assignment block |
| 2 | **QUOTED** for every column; the three "NO"s are **exhaustive negative greps**. The migration shapes are **INFERRED** |
| 3 | **QUOTED** — all five, including the one at `:1260` a line-pattern grep misses |
| 4 | **QUOTED** — the import, both calls, and a **negative grep** for `Suspense`. The "no accommodation needed" conclusion is **INFERRED** from the page being live |
| 5 | **QUOTED** — every fetch, every dependency array, every gate |
| 6 | **QUOTED** — the declaration, all six `setBasket` sites, the negative storage grep, the `<a>` comment. The navigation table is **INFERRED**; bfcache is **not established** |
| 7 | **QUOTED** — the route's key, its full response, and its own scoping comment |
| 8 | **QUOTED** — `canCancel`, `OrderState`, and the existing `payment_status` render |
| 9 | **QUOTED** for both patterns and the API's 404; the three cases are **INFERRED** |
| 10 | **QUOTED** — an exhaustive grep, all three writers, and a **negative grep** for in-app links |

## Not established

- **How this page satisfies Next's `useSearchParams` prerender requirement today** — there is no `<Suspense>` and no `loading.tsx`, yet the page builds and is live. Only the outcome is established.
- **Whether the browser Back button after a Stripe redirect produces a fresh mount** or restores from bfcache with the basket intact.
- **What `part_paid` and `refunded` should do to `canCancel`.**
- **Whether a confirmation URL should render for a `cancelled`, `ready` or `collected` order** — all three are reachable and none is handled.
- **Whether `orders.deal_savings` is populated on any customer-path order** — the walk-up insert writes it, the customer `p_order` does not name it, but I read no rows.
- **What the design should be.** This is the map, as instructed.
