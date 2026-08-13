# The out-of-stock toggle is not a guard

READ-ONLY DIAGNOSIS. 13 August 2026.

**No file was changed. No file was created except this one. No `next dev`, no `next build`, no commit, no deploy. No fix is proposed or applied.** Three read-only Node probes were run against the live database (SELECT only; each prints `WRITES PERFORMED: 0`). No Stripe call of any kind was made.

Each answer is labelled **QUOTED** (read out of a file, a git object, or a database row) or **INFERRED**.

---

## THE HEADLINE

🔴 **Nothing on any order path reads item availability.** "Out of stock" for a menu item is `event_item_stock.available = false`. That column is read in exactly three places — the menu API (display), `enforceStockLimits` (which *writes* it), and the dashboard's `get_item_overrides` (display). **No submit-path guard, on either path, reads it.**

The guards that do run are a **count** model: requested quantity against `min(item ceiling, category ceiling)` minus live sold. Fish Cake has `default_stock: null` and no `stock_count` override, so its ceiling is `null` — **unlimited** — and `checkStockShortfall` correctly returns "everything fits".

**INFERRED, and this is the whole diagnosis: the guard did not fail and was not bypassed. It ran, and it was asked a question that the out-of-stock toggle does not answer.**

Two live instances, one on each path, seconds apart:

```
event_item_stock  "Fish Cake"     available=false  created 2026-08-13T10:35:25.204Z
  order 62 (CARD)      draft created 10:35:30.171   order created 10:36:08.165   +43s
event_item_stock  "Chicken Satay" available=false  created 2026-08-13T10:37:51.314Z
  order 63 (PAY AT HATCH)                          order created 10:38:03.338   +12s
```

**QUOTED — the operator's belief that this used to work is not supported by the history.** `git log -S"event_item_stock" -- app/api/orders/submit/route.ts` returns **no commits at all**. The submit route has never read that table. Nothing was removed this week; the predicate was never there.

---

## 1. EVERY STOCK-RELATED CHECK ON THE ORDER PATH

**QUOTED.** In execution order on `app/api/orders/submit/route.ts`, then what `promoteDraft` re-runs.

| # | Check | File / lines | What it tests | On failure |
|---|-------|--------------|---------------|-----------|
| 1 | Pre-order open gate | `submit/route.ts:513` | the event's pre-order window has opened | `403 { preorder_not_open: true }` |
| 2 | Unpriceable line | `submit/route.ts:465-483` | every dish/modifier/bundle name resolves in `loadPriceBook` | `409 { error, stock: true, menuChanged: true, items: [] }` |
| 3 | Required-modifier guard | `submit/route.ts:~555-675` | required groups satisfied, max not exceeded, and `unmet.soldOut` when a required group has no selectable option (`modifier_options.available`, `stock_count` at `:584`) | `400 { requiredModifier: true }` |
| 4 | Option sold-out backstop | `submit/route.ts:682-687` -> `lib/option-stock.ts:137-170` | per **option**: `event_option_stock.available ?? modifier_options.available` is false, **or** effective `stock_count === 0` | `409 { optionStock: true }` |
| 5 | Category CLOSED gate | `submit/route.ts:869-875` -> `lib/stock-guard.ts:193-215` | `event_category_stock.available === false` for a category present in the order | `409 { categoryClosed: true, categories }` |
| 6 | **Item/category count shortfall** | `submit/route.ts:876-882` -> `lib/stock-guard.ts:133-181` | requested qty vs `min(item ceiling, category ceiling) − live sold`. Ceilings: `event_item_stock.stock_count ?? menu_items_db.default_stock`, `event_category_stock.stock_count ?? menu_categories.default_stock`. `null` = unlimited | `409 { stock: true, items: [{name, remaining}] }` |
| 7 | Option ceiling shortfall | `submit/route.ts:885-891` -> `lib/option-stock.ts:~115-135` | option qty vs `event_option_stock.stock_count ?? modifier_options.stock_count` minus live option tally | `409 { optionStock: true, optionName }` |
| 8 | `place_order_atomic` option draw | `supabase/migrations/20260624_place_order_atomic.sql:48-50` | `decrement_modifier_option_stock(...)` per drawn option | `raise exception 'option stock insufficient (option %)'` -> the whole insert rolls back |
| 9 | `enforceStockLimits` | `submit/route.ts:1157`, `lib/stock-availability.ts:61-` | **not a guard.** Runs *after* the insert and *writes* `event_item_stock.available=false` for items whose ceiling has been reached | best-effort; "Never block the order" (`:1160`) |

🔴 **The critical fact about #6**, in `checkStockShortfall`'s own select (`lib/stock-guard.ts:148`):

```ts
    supabase.from('event_item_stock').select('item_name, stock_count, no_item_cap').eq('truck_id', truckId).eq('event_id', eventId),
```

**`available` is not selected, and it is not selected anywhere else on any order path.** #5 reads `available` on the *category* table and #4 reads it on the *option* tables — the same column name, honoured at two levels out of three.

---

## 2. WHICH PATH REACHES WHICH CHECK

**QUOTED.** The card fork returns at `submit/route.ts:820`:

```ts
      return NextResponse.json({
        requiresAuthorization: true,
        orderKey:      draftKey,
        clientSecret:  auth.clientSecret,
        ...
```

so checks #5, #6 and #7 at `:869`, `:876` and `:885` are **not reached** on the card path in this route — they sit below the return, inside `if (eventRow?.id)` at `:864`.

🔴 **But nothing was left behind, and that hypothesis is disproved.** `lib/payments/promote-draft.ts` re-runs all four binding phases inside the same per-event lock:

```ts
    const soldOutOption = await findSoldOutOption(supabase, draft.truck_id, items, deals, draft.event_id)   // :172
    const lock = await acquireEventLock(draft.truck_id, eventDate)                                          // :181
      if (eventRow?.id) {
        const closed = await checkClosedCategories(draft.truck_id, eventRow.id, orderLines, itemCatMap)     // :198
        const shortfall = await checkStockShortfall(draft.truck_id, eventRow.id, eventDate, orderLines, itemCatMap)  // :205
        const optShort = await checkOptionCeilingShortfall(supabase, draft.truck_id, eventRow.id, items, deals)      // :213
```

| Check | CARD path | PAY AT HATCH path |
|-------|-----------|-------------------|
| Pre-order gate (#1) | **yes** — `submit:513`, above the `:820` return | yes — same line |
| Unpriceable line (#2) | **yes** — `submit:465`, above `:820` | yes — same line |
| Required-modifier (#3) | **yes** — `submit:~640`, above `:820` | yes — same line |
| Option sold-out (#4) | **yes** — `submit:683` (above `:820`) **and again** `promote-draft:172` | yes — `submit:683` |
| Category closed (#5) | **yes** — `promote-draft:198` | yes — `submit:869` |
| Count shortfall (#6) | **yes** — `promote-draft:205` | yes — `submit:876` |
| Option ceiling (#7) | **yes** — `promote-draft:213` | yes — `submit:885` |
| Atomic option draw (#8) | **no** — promoteDraft inserts directly rather than via `place_order_atomic` (`promote-draft:34-41`, "WHY NOT place_order_atomic") | yes |
| Item availability | 🔴 **does not exist** | 🔴 **does not exist** |

**The relevant `return` line numbers**: `submit/route.ts:820` (card fork) precedes `:869/:876/:885` on the card path; nothing precedes them on the pay-at-hatch path other than the earlier refusals #1-#4, which are shared.

**INFERRED — the answer to the central question.** Both paths reach every check that exists. The card fork moved three of them into `promoteDraft`, faithfully. No check was orphaned. The symptom reproduces on both paths **because the missing predicate is missing on both**, which is exactly what the operator observed and what the two live orders (62 card, 63 hatch) demonstrate.

⚠️ One genuine difference, recorded but not the cause here: #8, the atomic `decrement_modifier_option_stock` draw inside `place_order_atomic`, does **not** run on the card path — `promoteDraft` writes its own INSERT. That affects the option decrement pool, not item availability.

---

## 3. ORDER 62 (AND 63), AS THE ROWS RECORD THEM

**QUOTED.**

```
ORDER #62  key=3d1d0c24-c4ba-4c5e-98e4-f1edf3ea734c  status=confirmed  payment_status=paid  total=6
           event_id=a79a8313-005b-496f-82eb-764b69489d39  event_date=2026-08-13
           created_at=2026-08-13T10:36:08.165141+00:00  placed_at=2026-08-13T10:36:08.148+00:00
  items=[{ "name": "Fish Cake", "source": "direct", "quantity": 1, "unit_price": 6 }]
  deals=[]

DRAFT      order_key=3d1d0c24-...  total_minor=600  payment_intent_id=pi_3U3vyw2fB4PPCw2D13OQOwha
           created_at=2026-08-13T10:35:30.171381+00:00  promoted_at=2026-08-13T10:36:07.586+00:00
```

So order 62 is a **card** order: a draft was created, authorised, and promoted.

**The stock row, for the same event:**

```
event_item_stock
  truck_id=test-truck  event_id=a79a8313-005b-496f-82eb-764b69489d39
  item_name="Fish Cake"  stock_count=null  available=false  no_item_cap=false
  created_at=2026-08-13T10:35:25.204641+00:00
```

**The menu row:**

```
menu_items_db "Fish Cake"  is_available=true  stock_count=null  default_stock=null  is_active=true
```

**The event:** `a79a8313-005b-496f-82eb-764b69489d39`, date `2026-08-13`, status `open` — i.e. `eventRow?.id` resolved, so the guarded block **did** execute.

**Was the item genuinely out of stock when the order was placed? YES, and the timing is recorded.** `event_item_stock` has no `updated_at` column (columns: `truck_id, event_id, item_name, stock_count, available, created_at, no_item_cap`) — but this row was **created** by the toggle, carrying `available=false`, at `10:35:25.204`. The draft followed **5.0 seconds later** and the order **43.0 seconds later**.

⚠️ `created_at` records when the row first appeared, not a later toggle. It is decisive here only because no row for Fish Cake existed before; for an item toggled twice the moment of the second toggle would be **not established** from this table.

**The pay-at-hatch instance, two minutes later:**

```
event_item_stock "Chicken Satay" available=false stock_count=null created 2026-08-13T10:37:51.314Z
#63  created 2026-08-13T10:38:03.338  payment_status=unpaid  total=6.5  draft=NO  items=1x Chicken Satay
```

No draft row, so `payByCard` was not set: this went down the pay-at-hatch path, 12 seconds after the toggle, and was accepted.

**INFERRED — why it passed check #6.** `stock_count` is `null` on the override row and `default_stock` is `null` on the menu row, so `itemCeiling('Fish Cake')` returns `null`; `calcStockRemaining(null, …)` is unlimited; `checkCeilingShortfall` finds no shortfall and returns `null`. The category (`Starters`/whatever the item maps to) has no `event_category_stock` row for this event at all, so its ceiling is `null` too, and no category is closed. **Every guard answered truthfully.**

---

## 4. WHAT "OUT OF STOCK" IS, IN THE DATA

**QUOTED.** There are **three** distinct things an operator can mean, stored in three places:

**(a) Per-event sold-out — the toggle used here.** `event_item_stock.available` (boolean, NOT NULL DEFAULT true), keyed `(event_id, item_name)`. Written by the dashboard action at `app/api/dashboard/action/route.ts:896-909`:

```ts
    if (action === 'set_item_availability') {
      ...
      await supabase.from('event_item_stock').upsert({
        truck_id:  truck.id,
        event_id,
        item_name: itemName,
        available: available !== false,
      }, { onConflict: 'event_id,item_name' })
```

and also written automatically by `enforceStockLimits` when a ceiling is reached (`lib/stock-availability.ts:115-127`).

**(b) Menu-wide hidden.** `menu_items_db.is_available` (the Settings toggle, `app/api/manage/route.ts:427-428`). For Fish Cake this is `true`.

**(c) A count.** `event_item_stock.stock_count ?? menu_items_db.default_stock`, against the live tally from `getLiveItemCounts`. For Fish Cake both are `null` = unlimited.

**QUOTED — how the customer menu composes them** (`app/api/menu/[truckId]/route.ts:560-567`):

```ts
      const isAvailable = (i.is_available !== false)
        && (override ? override.available !== false : true)
        && (stockRemaining === null || stockRemaining > 0)
        && !hasUnsatisfiableRequiredGroup(itemGroupMap[i.id] || [])
        && !preorderSoldOut
        && !preorderNotOpenYet
```

**INFERRED — precisely what a guard would have to read** to see what the operator did: for every line in the order (deal constituents flattened, as `orderLines` already are), resolve the item name against `event_item_stock` **for the order's event** and reject when `available === false`; and against `menu_items_db.is_available` for the menu-wide case. That is one extra column on a query `checkStockShortfall` **already makes** — it selects `item_name, stock_count, no_item_cap` from exactly that table, for exactly that event. **No new read is required to see the flag; only the flag itself is missing from the select and from the predicate.** (Stated as a fact about the data, not as a proposed fix.)

⚠️ The AND-composition above shows the display layer already treats all three as one question, which is why the item vanished from the menu and the operator reasonably expected the order to be refused.

---

## 5. DOES `promoteDraft` RE-RUN THE STOCK CHECKS?

**QUOTED — yes, all four, inside the lock.** `lib/payments/promote-draft.ts:21` says so in its header ("THE FOUR BINDING PHASES RUN AGAIN, INSIDE THE LOCK, AND THAT IS THE POINT"), and the calls are at `:172` (`findSoldOutOption`), `:181` (`acquireEventLock`), `:198` (`checkClosedCategories`), `:205` (`checkStockShortfall`), `:213` (`checkOptionCeilingShortfall`), each with a refusal that releases the hold:

```ts
        const shortfall = await checkStockShortfall(draft.truck_id, eventRow.id, eventDate, orderLines, itemCatMap)
        if (shortfall) {
          const names = shortfall.map(s => s.name).join(', ')
          await markPromotionFailed(supabase, orderKey, `stock: ${names}`)
          const cancelled = await releaseHold(supabase, draft)
          return { status: 'refused', orderKey, reason: `stock: ${names}`, cancelled,
                   customerMessage: `Sorry — ${shortfall[0].name} sold out while you were paying, so we could not place your order. No money has been taken.` }
        }
```

**The stock guard IS among them.** It ran for order 62, against the correct event, and returned `null` — because the item has no ceiling. **Confirmed: this is not a missing re-check.**

---

## 6. GIT LOG FOR THE STOCK GUARD, LAST SEVEN DAYS

**QUOTED.**

```
$ git log --since="7 days ago" --oneline -- lib/stock-guard.ts lib/stock-availability.ts lib/option-stock.ts lib/stock-utils.ts
(no output)

$ git log -1 --format="%h %ad %s" --date=short -- lib/stock-guard.ts
740ad4b 2026-07-16 sound and screen on fix
$ git log -1 --format="%h %ad %s" --date=short -- lib/stock-availability.ts
740ad4b 2026-07-16 sound and screen on fix
$ git log -1 --format="%h %ad %s" --date=short -- lib/option-stock.ts
2e94c04 2026-06-28 Major upgrade
```

For contrast, `app/api/orders/submit/route.ts` took **ten** commits in the same seven days (`ef1358f, d9cf8b5, 961ecd8, b36a375, f7aed6c, 0cb2d2a, d3bb524, 7c62f1a, 6fd4b97, 32921c6`).

**QUOTED — was the predicate ever there and then removed?**

```
$ git log --oneline -S"event_item_stock" -- app/api/orders/submit/route.ts
(no output)

$ git log --oneline -S"available" -- lib/stock-guard.ts
740ad4b sound and screen on fix
```

The submit route has **never** contained a reference to `event_item_stock`, in any commit. The only `-S"is_available"` hit on submit this week is `d3bb524` ("general", 12 August), and it is a **comment**, not a check:

```
+    // It does price, because loadPriceBook filters on truck_id and NOTHING else: not is_active, not
+    // is_available, not available, not stock_count. Sold out is a STATE on a row that still exists, and
```

**INFERRED — the conclusion this forces.** The stock guard was **not changed, not moved, and not left behind** by any of this week's work (server-side pricing, the card fork, the extraction into `promoteDraft`, or the capture work). It is where it has been since 16 July, it is called from both paths, and it tests what it has always tested. **The operator's recollection that item availability used to be enforced at order time is not supported by the repository.** What is true is that the item availability toggle has always been enforced *on the menu*, which is where they will have seen it work.

---

## 7. WHAT THE CUSTOMER WOULD SEE IF THE GUARD FIRED

**QUOTED — pay-at-hatch.** `409 { error: 'Some items just sold out', stock: true, items }`, handled at `app/trucks/[slug]/order/page.tsx:1653`:

```ts
      if (res.status === 409 && data?.stock) {
        const shortItems = Array.isArray(data.items) ? data.items : []
        capBasketToRemaining(shortItems)
        ...
          setStockNotice(
            shortItems.length
              ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
              : 'some items just sold out'
          )
        ...
        if (event?.id) { fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' }) ... }
```

Rendered as "Sorry — {notice} now. We've updated your order — please review and confirm." The basket is **kept**, capped to what is left, the menu is re-fetched, and the customer stays on the order screen. **That surface exists and is live.**

**QUOTED — card.** `promoteDraft` returns `refused` with a `customerMessage`, releases the hold, and `app/api/payments/return/route.ts:136` redirects:

```ts
      const url = new URL(menuUrl)
      url.searchParams.set('payment_failed', res.customerMessage)
      return NextResponse.redirect(url.toString(), { status: 303 })
```

which the order page reads at `:235` (`searchParams.get('payment_failed')`) and renders. The customer lands back on the order screen reading "Sorry — Fish Cake sold out while you were paying, so we could not place your order. No money has been taken." **That surface exists and is live.**

⚠️ **A gap in the card surface, stated because it bears on "returned to the order screen":** the `payment_failed` redirect only happens when the **return** route performs the promotion. If the **webhook** promotes first and refuses, the refusal is recorded on the draft (`markPromotionFailed`) and the hold released, but the customer's browser is redirected to `?confirm=<draftKey>` for an order that will never exist. Not established what that screen renders in that case — it was not exercised, and it is outside this diagnosis.

---

## 8. DOES THE SAME GAP AFFECT THE OTHER CHECKS?

**No. It is item availability alone.**

| Level | "Unavailable" flag | Read by a guard? | Where |
|-------|--------------------|------------------|-------|
| **Category** | `event_category_stock.available === false` | **YES** | `checkClosedCategories`, `lib/stock-guard.ts:199-207` — selects `category, available` |
| **Modifier option** | `event_option_stock.available ?? modifier_options.available === false`, or effective `stock_count === 0` | **YES** | `findSoldOutOption`, `lib/option-stock.ts:159-164` — `effAvailable === false \|\| effStock === 0` |
| **Menu item** | `event_item_stock.available === false` (and `menu_items_db.is_available === false`) | 🔴 **NO** | `checkStockShortfall` selects `item_name, stock_count, no_item_cap` — `lib/stock-guard.ts:148` |

**INFERRED.** Close a whole category and the order is refused on both paths. Mark a modifier option sold out and the order is refused on both paths. Mark the dish itself out of stock and it is **hidden from the menu and enforced nowhere**. The ceiling checks (#6, #7) are unaffected — a *count* that runs out is caught at both item and option level, and `enforceStockLimits` then flips `available=false` as a display consequence of the count the guard already blocks at. So the failure is confined to the one case where availability is set **by hand, without a count** — which is precisely the operator's "mark it out of stock" button.

⚠️ **One more consequence of the same gap, stated not proposed:** because `enforceStockLimits` writes `available=false` when a ceiling is reached, an item that legitimately sold out by count is thereafter protected only by the count — and if an operator later *raises* the ceiling without clearing the flag, the item is orderable again while still hidden. Same missing predicate, opposite direction.

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicts another.
- **No fix is proposed or applied**, per the brief. §4's closing paragraph states what the data would have to be read to see the flag; it is a description of the schema, not a recommendation.

## NOT ESTABLISHED

- The exact moment an `event_item_stock` row was **toggled** rather than created — the table has no `updated_at`. For orders 62 and 63 the rows were created by the toggle, so their timing is exact; for a re-toggled item it would not be.
- What the customer sees when the **webhook** (rather than the return route) promotes and refuses — see §7.
- Whether any order **before** today was accepted against a hand-marked out-of-stock item; only today's two were examined.
