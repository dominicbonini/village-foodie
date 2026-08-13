# Refunds in Reports — how small is it really

READ-ONLY DIAGNOSIS. 13 August 2026.

**No file was changed. No file was created except this one. No `next dev`, no `next build`, no commit, no deploy. No fix is proposed or applied.** Two read-only probes were run: the **real `get_report` handler** through its own route, and a SELECT-only comparison against `order_payments`. Both print `WRITES PERFORMED: 0`. Every answer is **QUOTED** or **INFERRED**; where the evidence does not reach it says **not established**.

---

## THE EARLIER AUDIT — CONFIRMED, AND NOW QUANTIFIED

✅ **Confirmed exactly.** `get_report` reads `orders` (plus `truck_events`, `whatsapp_logs`, `menu_categories`, `menu_items_db`) and **never touches `order_payments`**. `grep` across the whole of ReportsTab (`page.tsx:10473-11250`) for `payment_status`, `order_payments`, `amount_paid` or `refund` returns **0 matches**.

**Live, for `test-truck`, 1-31 August 2026 — the real handler's own output:**

```
get_report(2026-08-01..2026-08-31) HTTP 200
  totalOrders   = 51
  totalRevenue  = £544.50   <- sum of orders.total
  avgOrder      = £10.68

  the counted orders BY payment_status: {"paid":37,"unpaid":11,"part_paid":1,"refund_due":2}
  🔴 value of orders counted as revenue whose payment_status is NOT paid/part_paid: £101.00

  MONEY ACTUALLY RECEIVED for the same orders (order_payments, succeeded rows):
    charges £471.50  refunds £0.00  net £471.50
    reported revenue £544.50  ->  gap £73.00
```

🔴 **Reports overstates by £73.00 on £544.50 — 13.4% — for a month with no refunds in it at all.** Eleven unpaid orders are counted at full value; one part-paid order is counted at £13.00 having received £6.50; and two `refund_due` orders (18 and 19, the double-charged pair) are counted at £6.00 and £6.50 having received £12.00 and £13.00, which pulls the gap *down*. **Two opposite errors partly cancelling inside one headline number is the strongest argument in this report for separating "sold" from "received".**

⚠️ **Method, stated:** my "money received" figure sums every `succeeded` row without applying `isLiveRow`, which the operator surfaces do apply. The direction and the order of magnitude are solid; **exact attribution per order is not established** and would need the same filter.

---

## 1. `get_report` IN FULL

**QUOTED.** `app/api/manage/route.ts`, `if (action === 'get_report')`.

**Every table it reads:**

| Table | Columns | Purpose |
|---|---|---|
| `orders` | `order_key, id, customer_name, customer_email, status, slot, total, discount_amt, created_at, items, deals, event_date, event_id` | **every money figure** |
| `truck_events` | `id, event_date, venue_name, town, van_id` | display labels + the van filter |
| `whatsapp_logs` | `classification, possible_miss` | the WhatsApp stat block |
| `menu_categories` | `id, name, sort_order` | category names and order |
| `menu_items_db` | `name, category_id` | item → category, for the revenue split |

🔴 **`order_payments` is not among them.**

**The scope filter:**

```ts
      .eq('truck_id', truck.id)
      .not('status', 'in', '(cancelled,rejected)')
```

**Every figure it computes:**

```ts
    const totalRevenue = orders.reduce((s: number, o: any) => s + (o.total || 0), 0)
    const dealsRedeemed = orders.filter((o: any) => (o.discount_amt || 0) > 0).length
    const dealSavings = orders.reduce((s: number, o: any) => s + (o.discount_amt || 0), 0)

    const itemMap: Record<string, { qty: number; revenue: number }> = {}
    orders.forEach((order: any) => {
      const items = Array.isArray(order.items) ? order.items : []
      items.forEach((item: any) => {
        const key = item.name
        if (!itemMap[key]) itemMap[key] = { qty: 0, revenue: 0 }
        itemMap[key].qty += item.quantity || 1
        itemMap[key].revenue += (item.unit_price || 0) * (item.quantity || 1)
      })
    })
```

**And the response, with the label each figure carries to the operator:**

| Field | Computed from | Labelled on screen as |
|---|---|---|
| `totalOrders` | `orders.length` | *"51 orders"* |
| `totalRevenue` | Σ `orders.total` | the money half of *"51 orders · £544.50"*, and **"Total"** in the revenue breakdown |
| `avgOrder` | `totalRevenue / orders.length` | **not rendered** — computed and unused (see §7) |
| `topItems` | Σ `unit_price × quantity` from `items` jsonb | **"Top items"**, column **"Total"** |
| `dealsRedeemed` / `dealSavings` | `discount_amt` | not rendered in the current tab |
| `upsellRevenue: 0` | 🔴 **hardcoded zero** | not rendered |
| `orders` | the rows themselves | the order history list and both CSVs |

---

## 2. WHAT AN OPERATOR SEES TODAY

**QUOTED**, from `ReportsTab` (`app/manage/[token]/page.tsx:10473-11250`).

1. **The summary line** — the only figure every plan sees:
   ```tsx
              {orders.length} order{orders.length !== 1 ? 's' : ''} · {fmtGBP(revenueBreakdown.total)}
   ```
   with a van-scope chip beside it when the truck has more than one van.

2. **Revenue breakdown** (Pro/Max only, `hasAdvanced`): one row per **menu category**, then **Deals**, then **Paid modifiers**, then a **Total** row. Computed client-side:
   ```ts
     const revenueOrders = orders.filter((o: any) => !['cancelled', 'rejected'].includes(o.status))
     ...
     const total = revenueOrders.reduce((s: number, o: any) => s + (o.total || 0), 0)
     const base = total - dealRev - mods   // authoritative menu-items residual
   ```
   ⚠️ **The categories are a residual, not a sum** — any drift is pushed into a category so the parts always add to `total`.

3. **Deals** and **Paid modifiers** tables — count and revenue per name, from the `items`/`deals` jsonb.

4. **Customer notes** — a list, no money.

5. **The order history list** — `#` · Date · Time · Channel · Item · Qty · **Total**, where Total is:
   ```tsx
                        <span className="text-right font-medium text-slate-900 tabular-nums">{fmtGBP(o.total || 0)}</span>
   ```
   with a mobile card carrying the same figure, and a tap-to-expand for the item detail.

6. **Two CSV exports** — Orders (`…, 'Total'`) and Items (`…, 'Item total', 'Order total'`).

7. **A WhatsApp stat block** when logs exist.

🔴 **There is no payment column, no paid/unpaid marker, and no refund anywhere on this tab.** An operator cannot tell, from Reports, whether a single one of those 51 orders was actually paid.

---

## 3. WHAT A REFUNDED ORDER SHOWS TODAY

⚠️ **NOT ESTABLISHED FROM A LIVE ROW — and the reason is worth stating.** There are **zero** refund rows in the ledger right now:

```
REFUND ROWS IN THE LEDGER: 0
```

Today's refund build created real ones and **its harness deleted them**, as that report declared. The two earlier real refunds are gone for different reasons: one **failed** (`removeFailedOnlineRefund` deletes the row by design) and three were **pending** (which write no row at all). The only surviving trace is the audit log:

```
refund_failed   ca159d3d  650p  2026-08-13T09:03:13Z
refund_pending  ba3301c5  100p  2026-08-12T22:44:35Z
refund_pending  bf6aa29d  100p  2026-08-12T22:44:03Z
refund_pending  f1fc49ff  100p  2026-08-12T22:43:21Z
```

**So this is described from code, and it is not in doubt** — every figure in §1 and §2 reads `orders`, and a refund writes only to `order_payments`:

| Figure | A £12.50 order fully refunded shows |
|---|---|
| Summary line | **£12.50**, counted in full |
| Revenue breakdown categories / Deals / Modifiers | **£12.50**, split as if nothing happened |
| Top items | the item, at full price |
| Order history row **Total** | **£12.50** |
| Orders CSV **Total** | **£12.50** |
| Anything indicating a refund | **nothing, anywhere** |

🔴 **A partially refunded order is identical.** So is one refunded to zero. **The refund is invisible in every single figure.**

⚠️ **One case behaves differently, and worse:** an order **cancelled** after being paid is excluded by `.not('status','in','(cancelled,rejected)')` — so it vanishes from revenue entirely, taking the money that was genuinely received with it. **Neither "£12.50 sold" nor "£12.50 taken, £12.50 returned" is shown; the order simply is not there.**

---

## 4. THE SMALLEST HONEST CHANGE

### (a) A separate refunds list — leaving every existing figure alone

**Touches:** `get_report` (one extra query and one extra response field), `ReportsTab` (one new block, and optionally a CSV).

**What the operator gets:** a *"Refunds"* section — date · order # · amount · reason · who — plus one total: *"£38.50 refunded across 4 orders"*. Every existing number is **untouched**, so today's reports and tomorrow's still mean the same thing.

**Cost:** the operator must do the subtraction themselves. The headline still says £544.50 when £471.50 arrived. ⚠️ **It adds a true thing without correcting a false one.**

🔴 **It is genuinely small** — see §5 for the query — and it is the only option that cannot break a number anyone has already read.

### (b) Refunds shown against the orders they belong to

**Touches:** the same extra query, plus the order-history row (a badge or a second figure), plus both CSVs if they are to match the screen.

**What the operator gets:** the row for order #62 reads `£6.00` with a **`−£6.00 refunded`** beside it. The connection is where they are already looking.

**Cost:** the row now carries **two different numbers**, and the column header says "Total". Either the header changes (so every past screenshot means something else) or the second figure is visibly secondary. ⚠️ **The summary line and the breakdown still say £544.50**, so the tab now contradicts itself unless (c) follows.

### (c) The revenue figure becomes money received, net of refunds

**Touches:** `totalRevenue`, `avgOrder`, `revenueBreakdown` (total **and** every category, since they are a residual of it), Top items, both CSVs, and the summary line.

🔴 **THIS RESTATES EVERY NUMBER IN THE TAB. Past and future reports would not match, and neither would a report run twice over the same period side by side.** An operator who exported August yesterday and re-exports it after the change gets **£471.50 where they had £544.50** with no explanation on the page.

**And it needs a decision Reports cannot make for itself:** revenue on the day the food was sold, or on the day the money arrived? A refund issued in September against an August order belongs to one or the other, and the two answers differ for every VAT-quarter boundary.

### ⚠️ ARE THE EXISTING NUMBERS RIGHT OR WRONG?

**They are RIGHT for the question they answer and WRONG for the one operators think they answer.** `totalRevenue` is *the value of orders sold, excluding cancelled and rejected*. That is a real, useful figure — it is what a kitchen plans against. It is **not** takings, it has never been takings, and nothing on the tab says which it is: the word rendered is **"Total"**, under a heading that says **"Revenue breakdown"**.

🔴 **So the honest minimum is not a number change at all — it is a LABEL change plus (a).** *"Orders sold £544.50"* beside *"Refunded £38.50"* tells the truth with no restatement of anything. **Whether "money received" also belongs there is a separate decision, and it is (c).**

---

## 5. WHAT A REFUNDS LIST NEEDS, AND WHAT IT COSTS

**Reports does not have the data. `get_report` would have to read `order_payments`** — there is no other source; `orders.amount_paid` is a net cache and cannot itemise a refund, name its reason or date it.

**What the list needs, per refund:** `order_key` (to name the order), `amount_minor`, `created_at`, and — for the reason and the operator — a join to `action_audit_log` where `action = 'refund_issued'`. ⚠️ **The reason is NOT on the ledger row.** The refund row carries `external_ref` (the `re_…`) and a note; the seven-value reason and the free-text note live in the audit row. **A refunds list with reasons is two reads, not one.**

**Two shapes, and they cost very differently at Reports' scale:**

| Shape | Query | Index | Cost |
|---|---|---|---|
| **By order key** | `.in('order_key', keys)` after the orders query | ✅ `order_payments_order_key_idx on (order_key)` | Exactly what `/api/dashboard/route.ts` already does for one day. **51 keys here; a year could be thousands** — Postgres handles a large `IN` but the URL-encoded PostgREST filter is the practical limit |
| **By truck and date range** | `.eq('truck_id', …).gte('created_at', from).lte('created_at', to).eq('kind','refund')` | 🔴 **NO USABLE INDEX.** The only `(truck_id, created_at)` index is **partial**: `where not livemode` — it covers test rows only | One extra round trip, independent of order count, but a **sequential scan on live rows** |

🔴 **So the "obvious" scalable shape is the one with no index.** ⚠️ Adding `create index … on order_payments (truck_id, created_at) where kind = 'refund'` would make it trivial, is tiny (refunds are rare), and **is a migration — outside this diagnosis.**

⚠️ **A refund's `created_at` is not its order's `event_date`.** A September refund of an August order matches neither range cleanly. **Which date a refund belongs to is the same decision (c) needs**, and a refunds list cannot dodge it either — though (a) can answer it visibly ("refunds issued in this period") rather than silently.

---

## 6. PARTIAL, PENDING AND FAILED

| | What exists | Somewhere sensible to appear? |
|---|---|---|
| **Partial** | a normal ledger row with a lesser amount, `state: 'succeeded'` | ✅ **Yes, with no special handling.** It is a row like any other; the list shows £5.00 against a £20.00 order, and `part_refunded` is already a real `payment_status` |
| **Pending** | 🔴 **no ledger row at all**, by design — *"NO LEDGER ROW UNTIL THE MONEY HAS ACTUALLY GONE BACK"* — only an `action_audit_log` row with `action: 'refund_pending'` | ⚠️ **Not from the ledger.** A ledger-only list would omit it entirely, which is *correct for money* and *wrong for an operator who pressed the button ten minutes ago*. Showing it needs the audit log, and it must be labelled **"sent, not yet returned"** — never counted in a refunds total |
| **Failed** | the row is **deleted** (`removeFailedOnlineRefund`, audit-first), plus a `refund_failed` audit row carrying `resolves: 'refund_pending'` | ✅ **Correctly absent from money** — the customer was not refunded. 🔴 **But it is the one an operator most needs to see**, and today it exists only in the audit log and the runtime logs. §27 already carries *"No in-product alert for a failed refund"* |

🔴 **So a refunds list built from the ledger alone shows exactly the refunds that completed — and silently omits both the one in flight and the one that failed.** That is defensible for a money total and indefensible as the only refund surface. **The audit log is the second source, and any honest list needs both.**

---

## 7. WHAT ELSE IS COMPUTED FROM ORDERS RATHER THAN FROM MONEY

**All of it. Without exception.**

| Figure | Source | Wrong when |
|---|---|---|
| Summary line total | Σ `orders.total` | anything unpaid, part-paid, refunded or over-paid |
| Revenue breakdown **Total** | the same sum | same |
| Revenue breakdown **per category** | a residual of that total | same, and the error is spread across categories |
| **Deals** revenue | `deals[].price` | same |
| **Paid modifiers** revenue | `items[].modifiers[].price` | same |
| **Top items** revenue | `unit_price × quantity` | same |
| Order history **Total** | `orders.total` | same |
| Orders CSV **Total**, Items CSV **Item total / Order total** | `orders.total` | same |
| `dealSavings` | `discount_amt` | it is a discount, not money — fine |

**And three further findings while looking:**

1. 🔴 **A paid order that is later CANCELLED disappears from Reports entirely**, money and all — the `.not('status','in','(cancelled,rejected)')` filter is applied twice, server and client. Under the refund flow built today, **cancelling a paid order is the most likely way a refund happens**, and it is precisely the case Reports erases. ⚠️ **This is the sharpest edge in the whole picture: the refunds an operator most wants to see belong to orders Reports has already dropped.**
2. **`avgOrder` is computed and never rendered.** Dead, and it would be wrong in the same way if it were.
3. **`upsellRevenue: 0` is hardcoded** in the response.

⚠️ **One thing is NOT wrong and is worth defending:** `orders.total` is now genuinely server-authoritative — server-side pricing landed on both insert paths, and 445 of 447 historical orders re-price exactly. **The order-value figure is trustworthy as order value.** The defect is entirely one of *label and absence*, not of arithmetic.

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another.
- ⚠️ **One premise needs correcting:** the refunded order from today's build **no longer exists** — its harness cleaned up, as declared at the time. §3 is therefore from code, with the audit log as the surviving trace. **A live refunded order could be produced deliberately if you want §3 measured rather than reasoned.**
- 🔴 **The headline gap is £73.00 on £544.50 with zero refunds in the period**, so refunds are not the largest thing wrong with Reports — unpaid orders counted as revenue is.
- 🔴 **A paid-then-cancelled order is invisible to Reports**, which collides directly with the cancel-and-refund flow shipped today.
- ⚠️ **A refunds-by-date-range query has no usable index** (the only `(truck_id, created_at)` index is partial on `not livemode`).

## NOT ESTABLISHED

- What a refunded order renders **in practice** — no such row exists today; §3 is from code.
- The exact per-order attribution of the £73.00 gap (my probe did not apply `isLiveRow`).
- Whether `orders.event_date` or `order_payments.created_at` should date a refund for reporting — a decision, not a fact.
- Whether any operator has ever read `totalRevenue` as takings. **That is the assumption the whole question rests on, and only you can answer it.**
