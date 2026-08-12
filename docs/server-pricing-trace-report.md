# Server-side pricing — the trace, and the network cost

**Date:** 12 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. Nothing proposed — this is the map, as asked.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE ANSWER TO THE HARD CONSTRAINT, UP FRONT

✅ **THE PAGE WOULD NOT BECOME CHATTIER. NOT BY ONE REQUEST.**

- **The client's running total needs three prices and `/api/menu` already returns all three** — `items[].price`, `bundles[].bundle_price`, and `modifierGroups[].options[].price_adjustment`. **Nothing needed for a local total is missing from that payload.**
- **The customer makes 3 requests before submit and 1 to submit.** Server pricing changes **neither number** — it changes what is *in* the submit body, not how many bodies there are.
- 🔴 **BUT SERVER PRICING AT SUBMIT COSTS 2 EXTRA DATABASE QUERIES** (not network round trips to the customer). Submit already reads `menu_items_db` and `bundles_db`; `loadPriceBook` additionally needs `modifier_options` and `item_modifier_groups`. **Those are server-to-database, invisible to a phone on poor coverage.**

⚠️ **AND THE REAL BLAST RADIUS IS NOT THE SUBMIT ROUTE — IT IS THE 30+ CONSUMERS OF `unit_price`.** None of them would break (the field keeps existing on the *row*), but three of them are the reason this is not a one-file change.

---

## 1. The customer submit payload, field by field

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx:1234-1259`:

```tsx
      const res = await fetch('/api/orders/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          truckId: slug, customerName: name, customerEmail: email, customerPhone: phone,
          slot: asapChosen ? null : (selectedSlot || null), eventDate: eventDateIso, eventId: event?.id ?? null,
          items: basket.map(b => ({
            name: b.menuItem.name,
            quantity: b.quantity,
            unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
            modifiers: b.modifiers.length > 0 ? b.modifiers : undefined,
            specialInstructions: b.specialInstructions || undefined,
            source: (b as any).source || 'direct',
          })),
          deals: appliedDeals.map(d => ({ name: d.bundle.name, slots: d.slots, slotModifiers: d.slotModifiers, slotNotes: d.slotNotes, price: d.bundle.bundle_price })),
          discountCode: appliedCode?.code || null,
          subtotal: subtotal, discountAmt: discountAmt, total, notes: notes || null,
          upsellEvents: extra.upsellEvents || [],
          asapEstimate: asapChosen ? (backwardAsap || asapSlot || customerAsapTime || null) : null,
        }),
      })
```

| Field | Type | 💰 Money? |
|---|---|---|
| `truckId` | `string` (slug) | |
| `customerName` / `customerEmail` / `customerPhone` | `string` / `string` / `string \| null` | |
| `slot` | `string \| null` (`'HH:MM'`, null = ASAP) | |
| `eventDate` | `string` (`YYYY-MM-DD`) | |
| `eventId` | `string \| null` (uuid) | |
| `items[].name` | `string` | |
| `items[].quantity` | `number` | |
| 💰 **`items[].unit_price`** | **`number`** | 🔴 **MONEY** — `menuItem.price + Σ modifier.price` |
| 💰 **`items[].modifiers[].price`** | **`number`** | 🔴 **MONEY** — rides inside each modifier object |
| `items[].modifiers[].name` | `string` | |
| `items[].specialInstructions` | `string \| undefined` | |
| `items[].source` | `'direct' \| 'upsell'` | |
| `deals[].name` | `string` | |
| `deals[].slots` | `Record<string,string>` | |
| `deals[].slotModifiers` | `Record<string, {name,price}[]>` | 🔴 **MONEY inside** |
| `deals[].slotNotes` | `Record<string,string>` | |
| 💰 **`deals[].price`** | **`number`** | 🔴 **MONEY** — `bundle.bundle_price` |
| `discountCode` | `string \| null` | ⚠️ **a CODE, not an amount** — already server-resolved |
| 💰 **`subtotal`** | **`number`** | 🔴 **MONEY** |
| 💰 **`discountAmt`** | **`number`** | 🔴 **MONEY** |
| 💰 **`total`** | **`number`** | 🔴 **MONEY** |
| `notes` | `string \| null` | |
| `upsellEvents` | `any[]` | |
| `asapEstimate` | `string \| null` (`'HH:MM'`) | |

🔴 **SIX MONEY-BEARING FIELDS**, at three nesting depths: `unit_price`, `modifiers[].price`, `deals[].price`, `deals[].slotModifiers[][].price`, plus the three aggregates `subtotal` / `discountAmt` / `total`.

✅ **EVERY SELECTION FIELD THE SERVER WOULD NEED IS ALREADY THERE** — names, quantities, modifier names, slot selections. **Removing the money fields would leave a payload that still identifies WHAT was ordered.**

---

## 2. The walk-up Add Order payload

**Source: QUOTED.** `components/dashboard/AddOrderPanel.tsx:926-975`:

```tsx
      const manualOrder = {
        order_key: orderKey,
        placedAt,
        buzzerNumber: manualBuzzer,
        provisional_id: provisional || null,
        customerName: manualName,
        customerPhone: manualPhone || null,
        customerEmail: manualEmail || null,
        slot: effectiveSlot,
        items: manualItems,
        deals: appliedDeals.map(d => ({
          name: d.bundle.name,
          slots: d.slots,
          slotModifiers: d.slotModifiers,
          slotNotes: d.slotNotes,
          price: d.bundle.bundle_price,
        })),
        discountAmt: 0,
        dealSavings,
        total: manualTotal,
        subtotal: manualItemsSubtotal,
        notes: manualNotes || null,
        event_id: manualEvent?.id || null,
        event_date: manualEvent?.event_date || null,
        override,
        capacityAcknowledged: capacityAck,
        …
      }
```

| Field | Type | 💰 Money? |
|---|---|---|
| `order_key` | `string \| undefined` (client-minted, offline outbox) | |
| `placedAt` | `string \| null` | |
| `buzzerNumber` | `number \| null` | |
| `provisional_id` | `string \| null` | |
| `customerName` / `Phone` / `Email` | `string` / `string\|null` / `string\|null` | |
| `slot` | `string \| null` | |
| 💰 **`items`** | **`manualItems` verbatim** — each `{ name, quantity, unit_price, modifiers, specialInstructions, cartKey }` | 🔴 **MONEY** — `unit_price` and `modifiers[].price` |
| 💰 **`deals[].price`** | **`number`** | 🔴 **MONEY** |
| `deals[].slotModifiers` | `Record<string,{name,price}[]>` | 🔴 **MONEY inside** |
| 💰 **`discountAmt`** | **`0`, hardcoded** | ⚠️ a true zero — a walk-up carries no code |
| 💰 **`dealSavings`** | **`number`** | 🔴 **MONEY (notional)** |
| 💰 **`total`** | **`number`** (`manualTotal`) | 🔴 **MONEY** |
| 💰 **`subtotal`** | **`number`** (`manualItemsSubtotal`) | 🔴 **MONEY** |
| `notes`, `event_id`, `event_date`, `override`, `capacityAcknowledged`, `paymentTaken`, `paymentMethod` | | |

### 🔴 THE WALK-UP PATH IS HARDER, AND FOR A REASON THAT IS NOT AN OVERSIGHT

**`components/dashboard/AddOrderPanel.tsx:1523-1524`:**

```tsx
                        <InlinePriceEditor price={item.unit_price} quantity={item.quantity}
                          onChange={p => setManualItems(prev => prev.map(i => (i.cartKey || i.name) === rowKey ? { ...i, unit_price: p } : i))} />
```

🔴 **THE OPERATOR CAN EDIT A LINE PRICE BY HAND ON THIS PANEL.** ⚠️ **That is a deliberate product capability** — a walk-up discount, a damaged item, a goodwill adjustment — and **it cannot be reconstructed from a menu lookup by definition.** Any "the client never sends a money field" rule either **exempts this path** or **removes that capability**. **Not established** which is intended; the brief speaks about the customer page.

---

## 3. The shape written to `orders.items`

**Source: QUOTED.** `app/api/orders/submit/route.ts:920-935` — the RPC payload:

```ts
      const p_order = {
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_type:     'collection',
        items,
        deals:          deals ?? null,
        discount_code:  discountCode ?? null,
        subtotal:       subtotal ?? total,
        discount_amt:   discountAmt ?? 0,
        total,
        …
      }
```

🔴 **`items,` — THE REQUEST BODY'S ARRAY, PASSED THROUGH VERBATIM.** No mapping, no filtering, no repricing.

**And the RPC's insert, `20260804_place_order_atomic_placed_at.sql`:**

```sql
    coalesce(p_order->'items', '[]'::jsonb),
    p_order->'deals',
```

### The stored shape, field by field

| Field in `orders.items[]` | Source today |
|---|---|
| `name` | 🔴 **CLIENT** |
| `quantity` | 🔴 **CLIENT** |
| 💰 `unit_price` | 🔴 **CLIENT** |
| 💰 `modifiers[].price` | 🔴 **CLIENT** |
| `modifiers[].name` | 🔴 **CLIENT** |
| `modifiers[].allergens` / `dietary` | 🔴 **CLIENT** ⚠️ *"Frozen onto the order at selection time (Stage C) — order-time allergens persist even if the menu later changes"* |
| `specialInstructions` | 🔴 **CLIENT** |
| `source` | 🔴 **CLIENT** |
| `cartKey` | 🔴 **CLIENT** — ⚠️ **absent on the customer path** (only walk-up and edited orders carry it) |

🔴 **NOT ONE FIELD IN `orders.items` IS SERVER-DERIVED ON THE CUSTOMER PATH TODAY.**

⚠️ **The DEALS array is different, and only for the EMAIL** — `submit/route.ts:1084-1087`:

```ts
      const dealsWithPrice = (deals ?? []).map((d: AppliedDeal) => {
        const bundle = bundles?.find(b => b.name === d.name)
        return { ...d, price: bundle?.bundle_price }
      })
```

🔴 **THAT SERVER-SOURCED PRICE IS USED FOR THE CONFIRMATION EMAIL ONLY. The row keeps the client's `deals[].price`.** ⚠️ **So a mechanism to look a bundle price up server-side already exists in this route** — it is simply not applied to what is stored.

---

## 4. 🔴 EVERY CONSUMER OF `orders.items[].unit_price`

**Source: QUOTED.** An exhaustive grep across `app/`, `lib/`, `components/`, `supabase/`.

### Group A — reads the STORED ROW (the blast radius that matters)

| # | File : line | What it does |
|---|---|---|
| 1 | `app/order/[id]/manage/page.tsx:186` | **Displays** a line total: `£{((item.unit_price ?? item.price ?? 0) * (item.quantity \|\| 1)).toFixed(2)}` ⚠️ note the `?? item.price` legacy fallback |
| 2 | `app/trucks/[slug]/order/page.tsx:1409-1410` | 🔴 **The NEW URL confirmation.** `unitPrice: Number(it?.unit_price ?? 0)` and **derives `basePrice` by SUBTRACTING the modifiers** |
| 3 | `components/dashboard/OrderCard.tsx:1017` | **Displays** `£{(line.unit_price * line.quantity).toFixed(2)}` on the operator card |
| 4 | `app/dashboard/[token]/page.tsx:1844` | 🔴 **SUMS it** — `const itemsSubtotal=order.items.reduce((s,i)=>s+Number(i.unit_price)*i.quantity,0)`, the edit path's opening subtotal |
| 5 | `app/dashboard/[token]/page.tsx:4157` | **Displays** an edit-modal line total |
| 6 | `app/dashboard/[token]/page.tsx:4309` | **Passes it into `DealsModal`** as `basketItems` |
| 7 | `app/api/manage/route.ts:1374` | 🔴 **REPORTS — `itemMap[key].revenue += (item.unit_price \|\| 0) * (item.quantity \|\| 1)`.** The per-item revenue figure |
| 8 | `app/manage/[token]/page.tsx:10463` | **Reports** — `basePrice: (item.unit_price \|\| 0) - modSum` |
| 9 | `app/manage/[token]/page.tsx:10466` | **Reports** — `itemTotal: (item.unit_price \|\| 0) * qty` |
| 10 | `app/manage/[token]/page.tsx:10579` | 🔴 **Reports** — `catBase[cat] += ((item.unit_price \|\| 0) - modSum) * qty`, the per-category base/upcharge split |
| 11 | `app/manage/[token]/page.tsx:11085` | **Displays** `{fmtGBP(i.unit_price \|\| 0)}` in order history |
| 12 | `app/manage/[token]/page.tsx:11130` | 🔴 **Order-history EXPORT row** — `total: (item.unit_price \|\| 0) * (item.quantity \|\| 1)` |
| 13 | `lib/email.ts:38` | 🔴 **THE CONFIRMATION EMAIL** — `£${(Number(item.unit_price) * Number(item.quantity)).toFixed(2)}` |
| 14 | `lib/email.ts:253` | **The plain-text email** — `${i.quantity}x ${i.name} — £${(i.unit_price * i.quantity).toFixed(2)}` |
| 15 | `lib/printing/mapOrderToTicket.ts:97` | **Maps to the ticket** — `unit_price: it.unit_price` |
| 16 | `lib/printing/ticket.ts:305` | 🔴 **THE PRINTED KITCHEN TICKET** — `const lineTotal = it.unit_price != null ? …` |
| 17 | 🔴 `lib/order-repricing.ts:276` | **`indexStoredItems`** — `const unitPrice = num(it?.unit_price, NaN)`. **THE PRICE-LOCK SOURCE.** The stored value IS the authoritative price for an existing line on the edit path |
| 18 | `lib/order-repricing.ts:404` | **WRITES it back** — `unit_price: serverUnit` |
| 19 | `lib/order-repricing.ts:478` | **Feeds `calculateOrderTotal`** — `price: num(i.unit_price)` |
| 20 | `app/api/dashboard/action/route.ts:734` | **The edit path's stored-item map** — `unit_price: i.unit_price` |

### Group B — reads a REQUEST BODY

| # | File : line | What it does |
|---|---|---|
| 21 | 🔴 `app/api/orders/submit/route.ts:79` | **The WhatsApp formatter** — `const lineTotal = (item.unit_price * item.quantity).toFixed(2)`. ⚠️ **Reads the BODY, before the row exists** (§6) |
| 22 | 🔴 `app/api/dashboard/action/route.ts:965` | **The walk-up total fallback** — `const total = (items \|\| []).reduce((s,i) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)` |
| 23 | `app/api/dashboard/action/route.ts:1180` | **The offline-replay item map** — `unit_price: parseFloat(i.unit_price) \|\| 0` |
| 24 | `app/api/dashboard/action/route.ts:562, 674` | comments describing the advisory-vs-authoritative rule |

### Group C — WRITERS (client-side construction)

| # | File : line | What it does |
|---|---|---|
| 25 | `app/trucks/[slug]/order/page.tsx:1242` | 🔴 **THE CUSTOMER PAYLOAD** — `unit_price: b.menuItem.price + b.modifiers.reduce(…)` |
| 26 | `app/trucks/[slug]/order/page.tsx:2646` | The in-memory confirmation's own mapping — same expression |
| 27 | `components/dashboard/AddOrderPanel.tsx:649` | Walk-up add — `unit_price: unitPrice` |
| 28 | `components/dashboard/AddOrderPanel.tsx:710` | Walk-up edit — `unit_price: newUnitPrice` |
| 29 | 🔴 `components/dashboard/AddOrderPanel.tsx:1524` | **`InlinePriceEditor`** — the operator overwrites it by hand |
| 30 | `app/dashboard/[token]/page.tsx:1856` | Edit-modal add — `unit_price: unitPrice` |
| 31 | `lib/basket-utils.ts:120` | `unit_price: item.price` |
| 32 | `lib/seed-demo-orders.ts:295` | The demo seeder — *"🔴 `unit_price` INCLUDES the modifiers. That's the convention every real path stores"* |

### Group D — types and fixtures

`lib/supabase.ts:22` · `lib/email.ts:7` · `lib/basket-utils.ts:8` · `lib/printing/ticket.ts:75` · `components/dashboard/types.ts:9, 223` · `components/dashboard/DealsModal.tsx:43` · `lib/order-repricing.ts:72, 100` · `app/api/orders/submit/route.ts:36` · `app/dev/ticket-preview/page.tsx` (7 fixture lines)

### 🔴 THE HEADLINE

**Twenty read sites, eight writers, and one convention that binds them all:**

```ts
// Repo-wide convention: unit_price INCLUDES the modifiers
```

✅ **NOT ONE OF THE TWENTY READERS WOULD BREAK** if `unit_price` were server-written — the field still exists on the row, with the same meaning. **They read the ROW, and the row would simply become correct.**

🔴 **THREE, HOWEVER, DECIDE HOW HARD THIS IS:**

1. **`lib/order-repricing.ts:276` — price-lock.** The stored `unit_price` IS the authoritative price for an existing line on the edit path. **Server-writing it makes price-lock lock onto a server number instead of a client one — an improvement, and a behaviour change on every subsequent edit.**
2. **`submit/route.ts:79` — the WhatsApp formatter reads the BODY, before the insert.** §6.
3. **`AddOrderPanel:1524` — the operator's manual price override.** §2.

---

## 5. Every other money field in `items` / `deals`

**Source: QUOTED.**

### `items[].modifiers[].price`

| Consumer | What |
|---|---|
| `order-repricing.ts:281` | `modPrice[name] = num(m?.price)` — 🔴 **price-lock per modifier** |
| `order-repricing.ts:377, 394` | rewritten to the authoritative figure; `serverUnit = base + Σ mods` |
| `app/trucks/[slug]/order/page.tsx:1410` | the confirmation subtracts them to derive `basePrice` |
| `app/manage/[token]/page.tsx:10463, 10579` | reports subtract them for the base/upcharge split |
| `lib/printing/ticket.ts` | printed under each line |
| `lib/email.ts` | `formatModifiers` in the confirmation |

### `deals[].price` (the bundle price)

| Consumer | What |
|---|---|
| 🔴 `order-repricing.ts:292` | `indexStoredDeals` — **price-lock**, `num(d?.price, NaN)` |
| `order-repricing.ts:446` | the advisory fallback for a new deal |
| `app/api/dashboard/action/route.ts:663` | `price: Number(d.price) \|\| 0` — the canonical edit write-back |
| `app/dashboard/[token]/page.tsx:1847` | `lockedValue: (Number(d.price)\|\|0) + Σ slotModifiers` |
| 🔴 `app/manage/[token]/page.tsx:10569, 10602, 11120` | **REPORTS — `dealRev += d.price`, per-deal revenue, and the history export row** |
| `lib/email.ts:53, 266` | the deal price line in both email bodies |
| `lib/printing/ticket.ts:328` | the printed ticket |
| `app/trucks/[slug]/order/page.tsx:1423` | the URL confirmation |
| `lib/printing/mapOrderToTicket.ts:105` | `price: d.price` |

### `dealSavings` / `orders.deal_savings`

| Consumer | What |
|---|---|
| `AddOrderPanel:954` | 🔴 **SENT by the walk-up client** |
| `action/route.ts:834, 1059` | read from the body; written as `deal_savings` |
| `app/api/orders/[id]/route.ts:42, 118` | selected and returned |
| `app/trucks/[slug]/order/page.tsx:914, 1506` | computed client-side for display |
| ⚠️ `app/api/manage/route.ts:1365` | 🔴 **`const dealSavings = orders.reduce((s,o) => s + (o.discount_amt \|\| 0), 0)`** — **the reports tab's "dealSavings" reads `discount_amt`, NOT `deal_savings`.** A separate naming collision, flagged not chased |

### `modifierExtra`

| Consumer | What |
|---|---|
| `order-repricing.ts:428, 437, 463` | computed server-side from slot modifiers |
| `order-calculations.ts:89, 94` | `deal.bundle.bundle_price + (deal.modifierExtra \|\| 0)` |
| `DealsModal.tsx:173-205` | computed in the browser and passed to `onApply` |
| 🔴 **Never sent, never stored** | the submit route's `dealsForCalc` supplies only `{ bundle, slots }`, so it is **always 0 server-side** |

### `bundle_price` (from `bundles_db`)

Read server-side at `submit/route.ts:510` (`dealsForCalc`) and `:1086` (the email), and by `loadPriceBook:193`. ✅ **Already a server-sourced value on both.**

---

## 6. 🔴 Money read BEFORE the row is written

**Source: QUOTED. YES — ONE SITE, AND IT IS AN EMAIL FORMATTER.**

**`app/api/orders/submit/route.ts:78-99`, `formatWhatsAppOrder`:**

```ts
  params.items.forEach(item => {
    const lineTotal = (item.unit_price * item.quantity).toFixed(2)
    lines.push(`  ${item.quantity}× ${item.name.padEnd(20)} £${lineTotal}`)
  })
  …
  if (params.discountCode && params.discountAmt > 0) {
    lines.push(`  Code ${params.discountCode}`.padEnd(28) + `-£${params.discountAmt.toFixed(2)}`)
  }
  lines.push(`  *TOTAL${' '.repeat(22)}£${params.total.toFixed(2)}*`)
```

⚠️ **It takes `items`, `discountAmt` and `total` as parameters from the request body.**

### And the money-bearing GUARD, before the insert

**`submit/route.ts:528-547`:**

```ts
    // Calculate totals server-side
    const serverCalculation = calculateOrderTotal(items, dealsForCalc, menuItems || [], discountCodeData)

    // Validate submitted totals
    const validation = validateOrderTotals(
      { subtotal, discountAmt: discountAmt ?? 0, total },
      serverCalculation,
      0.01
    )

    if (!validation.valid) {
      console.error('[ORDER VALIDATION]', validation.error)
      return NextResponse.json({ error: 'Order total validation failed. Please refresh and try again.' …
```

🔴 **A GUARD THAT READS THREE CLIENT MONEY FIELDS BEFORE THE INSERT — AND IS INERT** (established by an earlier audit: `calculateOrderTotal` reads `item.price` while the client sends `unit_price`, so every comparison is `NaN` and passes).

### What would break under server pricing

| Site | Breaks? |
|---|---|
| `formatWhatsAppOrder` | ⚠️ **Would print £NaN** if `unit_price` vanished from the body — **unless it is called with the server-priced items instead.** ✅ **Trivially fixable**, and it runs AFTER the insert |
| `validateOrderTotals` | ✅ **Would become obsolete** — there is nothing to validate when the server is the only source |
| `place_order_atomic`'s `total_minor` | 🔴 `round((p_order->>'total')::numeric * 100)` — **would need the server total in `p_order.total`** |

✅ **NOTHING ELSE.** No capacity check, no stock guard, no lock, no slot resolution, no auto-accept branch reads a money field. **A grep of every line before the insert confirms it: the only money reads are the validation and the email formatter.**

---

## 7. 🔴 CAN THE RUNNING TOTAL STAY LOCAL? — YES, WITH NOTHING MISSING

**Source: QUOTED.** What the client's total needs, and where `/api/menu` supplies it:

| Needed for a local total | In the menu payload? | Where |
|---|---|---|
| **Item base price** | ✅ **YES** | `route.ts:573` — `price: i.price`, on every `menu.items[]` |
| **Modifier option price** | ✅ **YES** | `route.ts:370` — `price_adjustment: o.price_adjustment ?? 0`, inside `modifierGroups[].options[]` |
| **Bundle price** | ✅ **YES** | `route.ts:613` — `bundle_price: b.bundle_price` |
| **Bundle original price** (savings display) | ✅ **YES** | `route.ts:614` — `original_price: b.original_price` |
| **Discount code type + value** | ✅ **YES** | `route.ts:632-636` — `codes: (codes \|\| []).map(c => ({ code: c.code, type: c.type, value: c.value }))` |

✅ **EVERY PRICE THE CLIENT TOTAL USES IS ALREADY IN THE ONE MENU FETCH.** The client's `calculateOrderTotal` at `page.tsx:914` reads exactly these and nothing else.

### 🔴 NOTHING IS MISSING. THERE IS NO FIELD THAT WOULD FORCE AN EXTRA ROUND TRIP.

⚠️ **ONE THING WORTH NAMING, THOUGH IT IS NOT A ROUND TRIP.** With server pricing, the client total becomes an **estimate** and the server total becomes the fact. **They can disagree** — if the menu changed between the fetch and the submit, the customer sees £12.50 and is charged £13.00. 🔴 **That divergence is invisible today only because the client's number IS the charge.** **Not established** what the product wants when they differ — show the server figure on the confirmation and say nothing, or refuse and re-price. **That is a product question the architecture will force, and it is not a network question.**

⚠️ **A second, smaller one:** the menu poll at `page.tsx:664` runs every 30 s and **already refreshes `truck` but not `menu`** — so a long-open page holds a menu snapshot from load time. Unchanged by this design, but it widens the divergence window.

---

## 8. Network requests, mount to placed order

**Source: QUOTED.** Every `fetch` in the customer page:

| # | Request | When | Server pricing changes it? |
|---|---|---|---|
| 1 | `GET /api/events?truck={slug}` | mount | 🔴 **NO** |
| 2 | `GET /api/menu/{slug}[?event_id=]` | mount, and on event change | 🔴 **NO** |
| 3 | `GET /api/slots/{truckId}?…` | once an event and times resolve | 🔴 **NO** |
| 4 | `POST /api/orders/submit` | on Place order | 🔴 **NO — same request, different body** |
| — | `GET /api/menu/…` (30 s poll) | background, only while an event is selected | 🔴 **NO** |
| — | `POST /api/stripe/checkout` | card path only | 🔴 **NO** |
| — | `GET /api/orders/{key}?truck=` | 🔴 **confirmation URL only** — a different render path entirely | n/a |

### ✅ THE COUNT: **3 requests before submit, 1 to submit — 4 total on the pay-at-hatch path.**

🔴 **SERVER PRICING CHANGES NEITHER NUMBER.** The prices needed for browsing are in request 2; the pricing happens inside request 4, which the customer is already making.

⚠️ **The card path adds a 5th (`/api/stripe/checkout`) and then leaves the site** — unchanged by this design.

⚠️ **The 30 s menu poll is the only recurring request**, and it is gated on `event?.id && !eventEnded`. On poor coverage that is the existing cost, and server pricing neither adds to it nor excuses it.

---

## 9. Could `loadPriceBook` run at submit without extra database round trips?

**Source: QUOTED. NO — IT NEEDS TWO MORE QUERIES. BUT THEY ARE SERVER-TO-DATABASE, NOT ROUND TRIPS TO THE PHONE.**

**`loadPriceBook`'s four queries — `lib/order-repricing.ts:184-203`:**

```ts
    supabase.from('menu_items_db').select('name, price').eq('truck_id', truckId),
    supabase.from('modifier_options')
      .select('id, name, price_adjustment, group_id, modifier_groups!inner(truck_id)')
      .eq('modifier_groups.truck_id', truckId),
    supabase.from('bundles_db').select('name, bundle_price, original_price').eq('truck_id', truckId),
    supabase.from('item_modifier_groups')
      .select('group_id, excluded_option_ids, menu_items_db!inner(name, truck_id)')
      .eq('menu_items_db.truck_id', truckId),
```

**What submit already reads, before the insert:**

| Table | Already read? | Where |
|---|---|---|
| ✅ **`menu_items_db`** | ✅ **YES** | `:479` — `.select('name, price, auto_accept, preorder_enabled')` — 🔴 **`price` included** |
| ✅ **`bundles_db`** | ✅ **YES** | `:504` — `.select('*')` |
| ⚠️ **`modifier_options`** | ⚠️ **PARTIALLY** | `:638` — but `.in('group_id', Array.from(enforceIds))`, i.e. **required/capped groups only**, and inside a fail-open IIFE whose result is out of scope |
| ⚠️ **`item_modifier_groups`** | ⚠️ **PARTIALLY** | `:637` — but with **NO truck filter at all** (a known full-table read, §27 backlog) and same scope problem |
| ✅ `discount_codes_db` | ✅ **YES** | `:518`, `is_active` filtered |

### 🔴 THE ANSWER: **+2 QUERIES, NOT +4**

**INFERRED** from the quoted selects: `menu_items_db` and `bundles_db` are already in hand and could be threaded through; `modifier_options` and `item_modifier_groups` would each need a **new, truck-scoped, complete** read — the existing ones are scoped to enforcement groups, not to pricing.

⚠️ **THE HONEST FRAMING FOR THE HARD CONSTRAINT:** two extra Postgres queries on the submit path, inside a request that already makes **eleven**. **They are invisible to a customer on poor coverage** — that customer makes exactly one request either way. **The cost is server latency, not chattiness.**

⚠️ **Calling `loadPriceBook` wholesale would be 4 queries (2 redundant); threading the two existing reads through would be 2.** Which is worth doing is a design call, not a constraint.

---

## 10. How `orders.items` is built at submit

**Source: QUOTED.** The complete chain, in three hops:

**Hop 1 — the destructure, `submit/route.ts:306-322`:**
```ts
    const {
      truckId, customerName, customerEmail, customerPhone,
      slot, eventDate, eventId,
      items,
      deals, discountCode, discountAmt, subtotal, total, notes,
      upsellEvents, asapEstimate,
    } = body
```

**Hop 2 — the RPC payload, `:920-935`:**
```ts
      const p_order = {
        …
        items,
        deals:          deals ?? null,
        …
        total,
      }
```

**Hop 3 — the INSERT, `20260804_place_order_atomic_placed_at.sql`:**
```sql
    coalesce(p_order->'items', '[]'::jsonb),
    p_order->'deals',
    …
    (p_order->>'total')::numeric,
    round(coalesce((p_order->>'total')::numeric, 0) * 100)::integer,
```

### 🔴 `items` IS NEVER TOUCHED BETWEEN THE WIRE AND THE DATABASE

**Not mapped, not filtered, not repriced, not validated in a way that fires.** It is the same JavaScript array object from `JSON.parse` of the request body.

### What would have to change for `unit_price` to be server-written — INFERRED, from the quoted chain

| Where | What |
|---|---|
| **Between hop 1 and hop 2** | A repricing step producing a NEW `items` array with server `unit_price` and server `modifiers[].price` |
| **`p_order.items`** | Would carry the repriced array instead of the body's |
| 🔴 **`p_order.total`** | 🔴 **MUST ALSO BECOME THE SERVER TOTAL** — the RPC derives `total_minor` from it (`round(… * 100)`), so leaving it client-supplied would store a server-priced item list against a client-priced total. **The two cannot move separately** |
| `p_order.subtotal` / `discount_amt` | same |
| **`formatWhatsAppOrder`** | must be handed the repriced items (§6) |
| `validateOrderTotals` | becomes obsolete |
| ⚠️ **`orders.deals[].price`** | would need the same treatment — the row keeps the client's bundle price today, while the EMAIL already uses the server's (§3) |

⚠️ **THE RPC ITSELF NEED NOT CHANGE.** It takes `p_order` as jsonb and inserts whatever is in it. **The change is entirely in the route, above the RPC call** — which is the same conclusion the `requested_slot` work reached from the other direction.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — the payload verbatim; types read off the constructing expressions |
| 2 | **QUOTED** — the payload and the `InlinePriceEditor` |
| 3 | **QUOTED** — `p_order`, the RPC insert, and the email-only deals reprice |
| 4 | **QUOTED** — an exhaustive grep, all 32 sites classified. The "none would break" conclusion is **INFERRED** |
| 5 | **QUOTED** — every consumer of each field. The `dealSavings`/`discount_amt` collision is **QUOTED** |
| 6 | **QUOTED** — both pre-insert money reads, plus an **exhaustive negative scan** of every line before the insert |
| 7 | **QUOTED** — all five price fields in the menu payload. The divergence consequence is **INFERRED** |
| 8 | **QUOTED** — every `fetch` in the file |
| 9 | **QUOTED** — `loadPriceBook`'s four queries and submit's existing reads. The "+2 not +4" is **INFERRED** |
| 10 | **QUOTED** — all three hops. The change list is **INFERRED** from them |

## Not established

- **Whether the walk-up `InlinePriceEditor` is meant to survive** a no-money-from-the-client rule. It is a real operator capability that a menu lookup cannot reconstruct.
- **What should happen when the client's estimate and the server's price differ** — show, refuse, or re-price. The architecture forces the question; nothing in the repo answers it.
- **Whether `orders.deals[].price` is in scope.** The brief says "no money field", and the deals array carries three.
- **Whether the reports' `dealSavings` reading `discount_amt` is a defect or a deliberate legacy** — a separate naming collision, flagged not chased.
- **What the design should be.** This is the map, as instructed.
