# Offline stock — does it count down, and does it reconcile?

**READ-ONLY. No files changed, no code written, nothing deployed, no SQL, no migrations.**

---

## VERIFICATION

**SOURCE READ ONLY.** 🔴 **I have not run the app, not taken an order offline, and not measured
anything at a client.** Every claim is traced to a file and line and marked **READ** or **INFERRED**.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## THE SHORT ANSWER

> 🔴 **NO. Item stock does not count down offline, and it cannot, because there is no counter to
> decrement — stock is DERIVED by counting rows in `orders`, and a queued order is not in `orders`.**
>
> ✅ **CAPACITY does count down offline.** It is a different mechanism and it explicitly folds queued
> orders.
>
> ✅ **Reconciliation on reconnect is CORRECT and needs no decrement step** — for the same reason.

---

## 1 · What actually happens today

### There is no stock counter anywhere

**`lib/stock-utils.ts:2` — `calcStockRemaining(stockCount, ordersCount)`** = `stock_count − orders_count`.

**`orders_count` comes from `getLiveItemCounts` (`lib/stock-availability.ts:30-43`) — READ:**

```ts
const { data: orders } = await supabase.from('orders')
  .select('items, deals').eq('truck_id', truckId).eq('event_id', eventId)
  .neq('status','cancelled').neq('status','rejected')
return tallyItemCounts(orders || [])
```

**A live SELECT over `orders`, tallied per request.** And the route says so itself —
`app/api/dashboard/action/route.ts:1488`:

> *"The decrement-pool draw was REMOVED (step 3) — **nothing is decremented; the ceiling is computed live
> from active orders**."*

### So does an offline order decrement anything on the device?

| | |
|---|---|
| **Within the basket being composed** | ✅ **YES.** `AddOrderPanel.tsx:1931` — `calcAddableRemaining({ itemRem, catRem, itemBasketQty: totalInBasket, catBasketQty })`. **Adding a 3rd of an item to THIS basket reduces what you can still add** |
| 🔴 **Across orders** | ❌ **NO.** Once the order is submitted the basket clears, `orders_count` is unchanged, and **the next order starts from the same frozen number** |
| **Is anything persisted?** | ❌ **No stock figure is written to the device at all.** Not in Preferences, not in the SW cache |

### Does it survive a cold kill?

🔴 **The queued ORDERS do. The device's knowledge of them does not.**

`deviceQueuedOrders` is `useState<Order[]>([])` (`page.tsx:223`), populated **only** at `:4101` when
`onOrderPlaced` fires with an optimistic order. **Nothing seeds it from `listOps()`** — grep across the
dashboard returns no `listOps` call.

> ⚠️ **So after a force-quit, the outbox still holds the ops (durable Preferences) and they will still
> replay — but the dashboard's in-memory list is empty, so the capacity fold in §3 silently loses them.**

---

## 2 · What the operator SEES for stock while offline

**The badge is computed at `AddOrderPanel.tsx:1915-1933`** from the `itemStocks` prop, which is
`itemStocksByEvent[key]` in the dashboard, fetched by `fetchStock` (`page.tsx:911`) via
`POST /api/dashboard/action { action: 'get_stock' }`.

**That fetch ends `.catch(()=>null)` (`page.tsx:936`) — READ.** So on failure the previous slice stays.

| Situation | What the operator sees |
|---|---|
| **Warm app that goes offline** | 🔴 **A STALE COUNT, frozen at the last successful fetch.** *"7 left"* stays *"7 left"* no matter how many offline orders are taken. **There is no indication it is stale** — the badge is identical to a live one |
| **Cold launch offline** | ❌ **NO COUNT AT ALL.** `itemStocks` is `[]`, so `stock` is undefined, `itemRem` is null, and **no badge renders and the `+` is never disabled.** ⚠️ **This is the gap I named in the menu-snapshot report — I deliberately did not cache stock, and this is what that costs** |
| **Message** | ❌ **None.** Nothing anywhere says the count is stale or absent |

---

## 3 · Item stock vs CAPACITY — they behave differently, and this is the important distinction

| | **Item stock** | **Capacity** |
|---|---|---|
| **Source** | `stock_count − orders_count`, `orders_count` from a live SELECT over `orders` | Per-window batch limits from `orders.items` joined to the menu |
| **Offline?** | 🔴 **NO** | ✅ **YES** |
| **Mechanism** | Frozen server value | **`buildOfflineOccupancy`** (`page.tsx:2850-2860`) folds **`serverOrders` + `queuedOrders: deviceQueuedOrders`** |
| **Reaches the panel** | `itemStocks` prop | `offlineCapacity` prop (`AddOrderPanelProps:110-118`) |

**The dashboard's own comment (`page.tsx:2839-2849`) — READ:**

> *"OFFLINE with optimistic orders → fold THEIR oven occupancy into the frozen server occupancy… **used
> by BOTH the day strip AND the Add-Order picker**… Advisory OFFLINE view — the server stays
> authoritative on reconnect."*

> ✅ **CAPACITY WAS BUILT FOR THIS AND ITEM STOCK WAS NOT.** The offline fold exists, is shared between
> the strip and the picker so they cannot diverge, and drains as orders queue.

⚠️ **But it is in-memory only** — see §1. **A force-quit resets the capacity fold to server truth while
the queued orders still exist**, so capacity would then *over*-state what is available.

---

## 4 · Reconciliation on reconnect

> ✅ **IT IS CORRECT, AND IT NEEDS NO DECREMENT STEP — because there is nothing to decrement.**

| Question | Answer |
|---|---|
| **Decremented at compose time?** | ❌ No — nothing is written on the device |
| **Decremented at replay?** | ❌ No — **`:1488` "nothing is decremented"** |
| **So what makes the count right?** | ✅ **The INSERT itself.** The order lands in `orders`, and the very next `getLiveItemCounts` counts it. **The count is a query, so it self-corrects the instant the row exists** |

### Two devices both offline against the same item

**Both queue. Both replay. Both INSERT.** The count then reflects both — **but the second one may be
refused first:**

**`action/route.ts:1464-1475` — READ.** On the create path, when `!override`:

```ts
const shortfall = await checkStockShortfall(truck.id, orderEventId, eventDate, manualLines, itemCatMap)
if (shortfall) return NextResponse.json({ error: 'Not enough stock', stock: true, items: shortfall }, { status: 409 })
```

> 🔴 **A REPLAYED ORDER THAT NOW EXCEEDS STOCK GETS A 409.** The drain treats 409 as a genuine conflict
> (`orderGate.ts:422-424`) → the op is flagged `conflict` → **the red operator banner**.

⚠️ **So the oversell is DETECTED at replay, not prevented at compose.** **The customer has already been
served.** The operator learns about it afterwards, with the order named on the banner.

⚠️ **INFERRED, not observed:** that a replayed body carries `override: false`. If the operator overrode
at compose time (`:1463` — *"informed oversell"*), `override: true` rides along in the queued body and
**the check is skipped entirely** — the order inserts and the oversell stands silently.

---

## 5 · 🔴 CAN AN OPERATOR OVERSELL OFFLINE? YES — WITHOUT LIMIT.

**Plainly: there is no bound.**

- Ten left when the device goes offline. The operator takes an order for 10. **The badge still says
  "10 left".** They take another for 10, and another. **Nothing stops them.**
- The only per-order restraint is `totalInBasket` **within a single basket** (`:1931`).
- 🔴 **On a COLD launch offline it is worse: no badge renders at all and the `+` is never disabled**, so
  even the single-basket restraint has nothing to work from.

**What happens afterwards:** the excess orders replay, hit the 409, and land as **conflicts on the red
banner** — after the food has been promised.

---

## 6 · What a countdown would take, and what cannot be made accurate

**The mechanism is the obstacle: there is no counter, so a countdown means keeping a local tally.**

**Roughly:**

1. **Cache the stock baseline** (`stocks` + `categoryStocks`) alongside the menu snapshot, with its
   `fetched_at`.
2. **Seed `deviceQueuedOrders` from `listOps()` on launch** — 🔴 **required, and missing today (§1).**
   Without it a force-quit resets both the stock tally and the capacity fold.
3. **Tally queued orders against the baseline** — reuse `tallyItemCounts`, the same function the server
   uses, so the two cannot drift.
4. **Show it as advisory**, the way capacity already is, with the baseline's age.

### 🔴 What CANNOT be made accurate, and must not be presented as if it were

| Blind spot | Why |
|---|---|
| **A second operator device** | It queues its own orders. **Neither device can see the other's until both sync.** Two devices each showing "3 left" can sell 6 |
| **A customer ordering online** | If the backend is up but *this device's* connection is down, customers keep ordering and consuming the same stock. **The device is blind to all of it** |
| **An operator editing stock elsewhere** | A change on another device or in Manage does not reach this one |
| **Cancellations and rejections** | `getLiveItemCounts` excludes them (`:40-41`). Offline, a cancellation elsewhere **releases** stock this device will never learn about — so the local number can be too *pessimistic* too |

> 🔴 **A local countdown is a BETTER GUESS, not a correct number.** It would have to be labelled the way
> capacity already labels itself — *advisory* — and the server must stay authoritative. **Presenting a
> local tally as a real count would be a new false promise, and the manual already records one of those
> as a shipped defect.**

---

## 7 · The customer ordering page during a backend outage

**Customer stock comes from `/api/menu` — `stock_remaining` / `item_remaining` / `category_remaining` on
the `MenuItem` shape (`order/page.tsx:35`). It reads live and has no fallback.**

**When `/api/menu` fails (`order/page.tsx:1000-1003`) — READ:**

```ts
.catch((err) => { console.error(...); setError('This truck is not currently taking orders.') })
```

> ✅ **The stock question does not arise, because the customer cannot order at all.** The page replaces
> itself with *"This truck is not currently taking orders."*

⚠️ **Honest but blunt:** an outage of the read path presents to a customer as *the truck being closed*,
not as a fault. ⚠️ **And nothing on the customer side is cached** — no menu, no stock, no snapshot. **That
is by design: a customer's order must reach the database to exist.**

---

## What I could not establish

1. 🔴 **Any of this at runtime.** **No app run, no offline order taken.** Every row above is a source
   read.
2. **Whether a replayed order carries `override`.** §4 — it decides whether an oversell is *caught* at
   replay or *inserted silently*. **I traced the route's use of it; I did not trace the queued body's
   contents through the panel's override flow.**
3. **How stale a frozen count typically gets in service** — nothing logs the age, and §2 shows nothing
   displays it.
4. **Whether `event_option_stock` (extras) behaves the same offline.** It is a separate table on the same
   derived model, and the fix for its `truck_id` column is still unapplied — **so extras stock is
   currently non-functional online, never mind offline.**
