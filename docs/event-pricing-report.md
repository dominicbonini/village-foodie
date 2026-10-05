# EVENT PRICING — per type and per event; the grid tidied; offline protection as a switch
### …and the 5 October addition: cash per van, "Same settings for all vans", types holding their own values


> ## 🔴 CORRECTIONS, 5 October 2026 — `docs/event-pricing-fixes-report.md`
> 1. **THE DATES IN THIS REPORT ARE WRONG WHERE THEY SAY "12 OCTOBER".** All of this work happened on
>    **5 October 2026**; `20261012` is a migration *filename*, not a date of work. Every occurrence in
>    `docs/reference-manual.md` and in code comments has been corrected; this report is left as written
>    with this note, because it is the record of what was reported.
> 2. **§4's CLAIM THAT PARTIAL UNIQUE INDEXES WERE NECESSARY IS WRONG, AND IT BROKE THE FEATURE.**
>    PostgREST's `on_conflict=` cannot target a partial index, so saving a typed price failed with
>    42P10. Plain unique constraints are fully sufficient here — the one-owner CHECK guarantees every
>    row falls under one of them. Fixed by `20261013_event_item_prices_unique.sql`.
> 3. The render harness has since been finished; see the fixes report for the completed totals.

**Branch:** `schedule-graphics` only. Nothing pushed, merged or deployed. **No SQL run.** Two migrations
written and handed over. Tested against `test-truck` and Village Spice fixtures only — Pizzeria Gusto was
never read, written or opened.

**Pre-build tree, pinned by SHA: `0ce4c83`** ("Record the combine: the report, and three open items
closed"). Every identity claim below is against that commit, named in `scripts/event-pricing.cjs` as
`BEFORE_REF` so the two cannot drift.

---

## 0 · THE HEADLINE, AND THE ONE THING THAT IS NOT DONE

Event pricing is built end to end in code: the arithmetic, the data, the server, both order paths, the
customer menu, the Event types grid and the dashboard sheet. Two logic harnesses prove it — **154 checks
with 42/42 variants caught** (`event-types.cjs`) and **92 checks with 14/14 variants caught**
(`event-pricing.cjs`).

🔴 **THE END-TO-END TEST ON `test-truck` IS BLOCKED, AND IT IS BLOCKED ON THE MIGRATION.** You asked for a
future test event on `test-truck` showing a type's prices on the customer menu and a pay-at-hatch order
storing `menu_price` / `price_basis`. That needs `20261011_event_pricing.sql` **applied**, and nothing in
this repository runs SQL. Until you run it, every read in `lib/event-pricing/read.ts` fails open to **menu
prices** — which §3 proves is exactly today's behaviour. **The numbered list in §12 is that test**, and the
first step is applying the migration.

I did not create a test event or place a test order, because on today's database both would have exercised
the pre-migration path and proved only that the fail-open works (which the harness proves without touching
production).

---

## 1 · STEP 0 — THE DIAGNOSIS, BEFORE ANYTHING WAS BUILT

### 1.1 `event_price_overrides` — it exists, and nothing reads it

Searched `app`, `lib`, `components`, `supabase`, `scripts` for the string. Every hit is **prose**:

| Where | What |
|---|---|
| `docs/reference-manual.md` ×5, `docs/event-types-*.md` ×3 | the (false) claim that it does not exist, and the RLS table list |
| `components/dashboard/ThisEventCard.tsx:27` | a comment saying per-event prices were a later stage **because** the table "does not exist" |
| `supabase/migrations/*` | the RLS/grants list only |

🔴 **NO CODE PATH READS OR WRITES IT. NO FUNCTION, NO VIEW.** So nothing was stopped, and per your rule it
is **not used and not dropped**. `scripts/event-pricing.cjs` §7 re-runs that `git grep` on every run, so the
claim is checked rather than remembered. Recorded in the manual at §70.2 as *"exists in production, empty,
unused legacy — not dropped; Dominic decides later"*, with the reason this feature could not have used it
anyway: it keys on an `event_name` **text** column, carries `valid_from`/`valid_until` windows nothing
enforces, and has **no per-TYPE form at all**.

⚠️ **I also corrected the two places that asserted it does not exist** — the manual §70.2 and the card's
comment — because §37's rule is that a corrected claim is replaced, never left adjacent. A planning brief
has already been built on the stale half of a §70 claim once.

### 1.2 Every place an item price reaches a customer or an order — before the build

| # | Surface | file:line (at `0ce4c83`) | What it served |
|---|---|---|---|
| 1 | **customer menu** | `app/api/menu/[truckId]/route.ts:620` | `price: i.price` — `menu_items_db.price`, raw |
| 2 | **customer order page** | `app/trucks/[slug]/order/page.tsx` | renders the menu API's number; sends it back as advisory only |
| 3 | **submit (customer)** | `app/api/orders/submit/route.ts:465` | `loadPriceBook(supabase, resolvedTruckId)` → `repriceOrder` |
| 4 | **walk-up (operator)** | `app/api/dashboard/action/route.ts:1413` | `loadPriceBook` → two passes (book, then the operator override) |
| 5 | **edit (operator)** | `app/api/dashboard/action/route.ts:745` | `loadPriceBook` → `repriceOrder` **under price-lock** |
| 6 | **the engine** | `lib/order-repricing.ts:205` | `loadPriceBook` — truck-scoped, no availability filter |
| 7 | **the calculator** | `lib/order-calculations.ts` | combines; `menuItems` is read **only** for a deal's original price |
| 8 | receipts / confirmation | `lib/email.ts`, `lib/printing/*` | render the **stored** `items[].unit_price`; consult no menu |
| 9 | Add Order panel (client) | `components/dashboard/AddOrderPanel.tsx` | shows the menu API's number; its prices are advisory |

**Conclusions that shaped the build.** (a) There are exactly **two** places a price is *decided*:
`loadPriceBook` for new lines and the stored row for existing ones. (b) Receipts and tickets read the stored
row, so they needed **no change at all**. (c) `menuItems` must **not** move, or a deal's "you saved £x" would
follow event pricing while the deal's price did not.

### 1.3 The runner's "Stripe screen", and why two harnesses failed it

`scripts/run-harnesses.cjs` screens every listed file's **source text** before running any of it, and
refuses five markers: `createClient`, `SUPABASE_SERVICE_ROLE_KEY`, `googleapis`, `\bstripe\b`
(case-insensitive, whole word), and any `fetch(` it cannot prove is loopback.

🔴 **BOTH FAILURES WERE THE WORD "Stripe" IN A COMMENT.** Nothing else.

| File | Line | The prose |
|---|---|---|
| `scripts/event-types.cjs` | 336 | "The route cannot be run here (it needs a database and **Stripe**)" |
| `scripts/schedule-graphics-places.cjs` | 1310 | the seven notices "(walkthrough strip, approvals, allergens, custom domain, **Stripe**, missing fields…)" |

**Fixed by rewording the prose** — "the card processor's SDK" and "card payouts". ⛔ **The screen is not
weakened in any way**: it still refuses the word as a whole word, anywhere in a listed file, comments
included. All **88** listed files now pass, so `event-types.cjs`, `schedule-graphics-places.cjs` and
`event-pricing.cjs` all run through the runner legitimately.

⚠️ **AND THE SAME TRAP CAUGHT ME.** My own zebra-**stripe** comment in `event-types.cjs` tripped the screen
the moment I added it. The screen's own note claims a harness "named after, say, a striped layout" is fine —
and it is, because `\bstripe\b` does not match *striped* — but the **singular does** trip it. The comment now
says "banding", and a note at that site records the rule so the next person does not spend the same ten
minutes. ⚠️ Pre-existing and unrelated: `add-order-stale-browser.cjs` is in neither the list nor an excluded
group, which the runner reports as drift. I have not touched it.

---

## 2 · THE ARITHMETIC — ONE IMPLEMENTATION, INTEGER PENCE

`lib/event-pricing/price.ts`. Pure: no database, no network, no clock, no React, **no imports at all**.
Called by the menu API, the submit route, the walk-up and edit paths, the grid and the sheet.

```
effective = the EVENT's own prices (truck_events.price_own)
         ?? the TYPE's prices       (event_types.price_change_on)
         ?? menu_items_db.price
and within whichever applies:  that setup's TYPED price ?? its RULE on the menu price
```

### Your table, measured
| Case | Expected | Got |
|---|---|---|
| £10 +10% nearest | £11 | ✓ 1100p |
| £11.50 +15% nearest | £13 | ✓ 1300p (13.225 → £13.23 → £13) |
| £10 +15% nearest | £12 | ✓ 1200p (£11.50 halves **up**) |
| £2 +10% up | £3 | ✓ 300p |
| £2 +10% nearest | £2 | ✓ 200p |
| £0.40 −10% nearest | £0.36 | ✓ 36p — rounding never makes it free |
| £1.50 −£2 | £0 | ✓ 0p, never negative |
| £0 menu + £1 | £0 | ✓ and no rounding lifts it off £0 either |
| typed beats rule, unrounded | £7.45 under "always up" | ✓ 745p |
| switch off | menu exactly | ✓ `resolvePricing` returns `setup: null` |
| event own beats type | +20%, not +10% | ✓ |
| own copied from type, then the type edited | event unchanged | ✓ the copy is a UI act; read-time never merges |

**Float traps.** `toPence(11.50) === 1150` (`11.50 * 100` is 1149.9999999999998); `toPence(1.15) === 115`
(114.99999999999999); `toPence(0.1 + 0.2) === 30`; £1.15 +100% is exactly £2.30; 12.5% of £10 is exactly
£11.25 (basis points); `toPounds` is the exact inverse of `toPence` over **every penny from £0 to £100**;
"nearest £1" rounds halves up at **every boundary from £0 to £50** (exhaustive, not sampled).

🔴 **ONE FINDING THE HARNESS FOUND IN MY OWN CODE.** `cleanPriceAmount` rounded to 2dp with
`Math.round(n * 100) / 100`. `1.005` is not representable: the nearest double is *below* it, so that gives
**£1.00** while Postgres' `numeric(8,2)` — which rounds the decimal — stores **£1.01**. The two would have
disagreed about a value the operator typed. It now rounds through the exponent
(`Number('1.005e2')` → 100.5 → 101).

🔴 **A SECOND FINDING, ALSO MINE.** `app/api/event-types/route.ts` had `price: it.pricePence / 100` — an
open-coded conversion, which is exactly what `lib/order-repricing.ts`'s header forbids in capitals. The
harness's "nobody open-codes ×100 or ÷100" check caught it; it uses `toPounds` now.

---

## 3 · PROOF THAT NOTHING CHANGES FOR A TRUCK NOT USING THIS

Against `0ce4c83`, on `test-truck`/Village-Spice-shaped fixtures and a stub Supabase client (the real
`loadPriceBook`, the real `readEventPricing`, the real `loadEventPriceBook` all execute; only the database
is stubbed).

| Claim | How it is proved |
|---|---|
| `loadEventPriceBook`'s book is **deep-equal** to `loadPriceBook`'s | `JSON.stringify` equality on the same stub — and it is **the same object by reference**, because the no-pricing path returns what `loadPriceBook` built. Identity, not a property to maintain |
| nothing is stamped | `menuPrice` empty, `basis` null |
| options, bundles **and** `menuItems` untouched | asserted with pricing **off** *and* **on** |
| a submitted order row is byte-identical | `JSON.stringify(pricedItems) === '[{"name":"Margherita","quantity":1,"unit_price":10}]'`, and `stampEditedLines` returns **the same array** (`===`) when there is nothing to stamp |
| the menu API response is byte-identical | **line-level multiset diff against `0ce4c83`**: exactly **one** line removed (`price: i.price,`), replaced by the guarded `eventItemPrice[i.id] ?? i.price`, and the map is populated only where a price moved |
| a setup that is ON but changes nothing stamps nothing | `basis` null, map empty, original book returned |

🔴 **`loadPriceBook`'S SIGNATURE AND BYTES ARE UNCHANGED**, asserted two ways: byte-identity to a named
merge parent, and a regex on the exact signature. Neither order route imports it any more — one door,
named, asserted.

### The re-aimed `event-types.cjs` guard
It asserted "the price path is byte-identical to one named parent" over four files, with its own comment
saying *"Stage 6 is where prices change; if this assertion ever fails, something in THIS stage has reached
the money path."* Stage 6 arrived, so it went red for the right reason. **Re-aimed, not deleted, and split:**

- **(A) the engine has not moved** — `order-repricing.ts` and `order-calculations.ts` are still byte-identical
  to a named parent. `app/api/orders/submit/route.ts` left the list (it changed on purpose).
- **(B) the behavioural identity** above, plus: the wrapper really calls `loadPriceBook`; the signature is
  untouched; neither order route imports the raw book; the submit route imports `lib/event-pricing` and
  **never** `lib/event-types/*` directly.
- ⚠️ `lib/payments/paid-step.ts` also left the byte-identity list on 5 October (the van link). What replaced
  it is **stronger than a source comparison**: 27 inputs proving the four-link cash chain with no van and no
  type is character-for-character the three-link expression, plus 54 proving the van's place in the order.

---

## 4 · THE DATA

Two migrations, **written, not run**. Both are in chat as fenced blocks, with the verification SELECT.

- `supabase/migrations/20261011_event_pricing.sql` — the pricing columns and `event_item_prices`.
- `supabase/migrations/20261012_van_cash_and_type_values.sql` — `truck_vans.takes_cash`, and the backfill
  that gives existing event types their own values. **Its §0 is a read-only preview** showing truck slug,
  type name and every column before → after; read it before running §2.

### Checks made against the real schema before writing them
| Assumption | Evidence |
|---|---|
| `truck_events.id` is uuid | manual line 11282 (`uuid NOT NULL DEFAULT gen_random_uuid()`), §16's rule, and three uuid FKs to it in `supabase/migrations` |
| `menu_items_db.id` is uuid | `item_modifier_groups.excluded_option_ids` is `uuid[]` of menu option ids; your own live fact that `event_price_overrides.item_id` is an FK to it |
| `trucks.id` is TEXT | §16's rule, stated in `20261009_event_types.sql`'s own comment |

⚠️ **I DID NOT STOP, AND I DID NOT JUST TRUST THE GREP.** `20261011`'s **§0 is a shape guard** that aborts
*before any `ALTER`* with a named message if `truck_events.id` or `menu_items_db.id` is not uuid, or
`trucks.id` is not text. A wrong assumption therefore costs nothing and says what it was, instead of failing
mid-transaction with `foreign key constraint cannot be implemented` after four columns have been added.

### The one schema detail worth repeating
🔴 **TWO PARTIAL UNIQUE INDEXES, NOT ONE CONSTRAINT.** In Postgres NULLs are **distinct**, so a plain unique
over `(event_type_id, item_id)` with a nullable owner does **not** prevent duplicates — the row inserts
twice and both come back. `where event_type_id is not null` has no NULLs in it and really is unique, and the
route's `onConflict: 'event_type_id,item_id'` depends on exactly that.

🔴 **KEYED ON `item_id`, NOT `item_name`** — deliberately unlike `event_item_stock`. A rename keeps the
price; a delete cascades it away. The price *book* stays keyed by name (an order line carries a name and no
id) and the id→name mapping happens **once**, in `loadEventPriceBook`, where the names are already in hand.

---

## 5 · THE SERVER

| Surface | file:line | What changed |
|---|---|---|
| customer menu | `app/api/menu/[truckId]/route.ts:350, 664` | one probed read, one guarded emit |
| submit | `app/api/orders/submit/route.ts:540` | `loadEventPriceBook`, after a **pricing-event resolution** |
| walk-up | `app/api/dashboard/action/route.ts:1456` | `loadEventPriceBook` on the already-resolved `orderEventId` |
| edit | `app/api/dashboard/action/route.ts:761` | same wrapper, **new lines only** — price-lock untouched |
| actions | `app/api/event-types/route.ts` | `set_type_pricing`, `set_type_item_price`, `load_event_pricing`, `save_event_pricing`, `clear_event_pricing`, `event_pricing_summary`, `match_standard` |

### Three things worth naming
**The submit route resolves the event twice, on purpose.** `eventRow` is resolved ~60 lines *after* the money
is decided, so pricing could not use it. A separate, minimal resolution runs first with the **same** filters
(`truck_id`, `event_date`, `status <> 'cancelled'`), and `eventRow`'s own logic is untouched.
🔴 **The explicit `event_id` is verified against the truck.** Without that filter a customer could post
**another truck's** event id and have that event's rule applied to this truck's menu — picking one with
"−50%" to pay half. One round trip closes it.

**Decision 7 — ambiguity is refused, never guessed.** With no `event_id` and two events on the date,
`eventRow` takes "earliest by `start_time`" while `/api/menu` takes "earliest by `event_date`": two answers
to one question. Where **any** candidate would charge something other than the menu, the order gets the
**existing** `menuChanged` 409 (whose handler already re-fetches the menu and asks the customer to look).
Where none would, it proceeds at menu prices — every truck today, and in the last 90 days no order had a
null `event_id` at all. ⚠️ The walk-up path needed **nothing**: it already leaves `event_id` null when the
date is ambiguous, and a null event resolves to menu prices, which *is* "do not guess".

**The atomic save.** `save_event_pricing` writes the event's columns, deletes its typed rows, then inserts
the new set. ⚠️ **It is not a database transaction, because PostgREST cannot give me one, and that is stated
rather than implied.** What makes it safe is that **no intermediate state misprices**: between the delete and
the insert the event has its rule and no typed prices, which is a legitimate setup — not a mixture of two
operators' intentions — and a half-applied set cannot happen because the insert is one statement. The
alternative, a plpgsql function, would move the write path into the database where
`lib/event-pricing/price.ts` cannot be read and a second copy of the rounding rule would eventually appear.

### The order-line fields
`menu_price` and `price_basis`, **only on lines whose price event pricing moved**. Both are **stripped off
the wire** on both order paths, like `price_override` — the engine passes unknown keys straight through, so a
forged pair would land in the jsonb and read as the server's own.

🔴 **ANYTHING THAT READS `book_price` ASSUMING IT IS THE MENU PRICE — the answer is: nothing does.**
`book_price` has **one writer** (`action/route.ts:1481`) and **zero readers** anywhere in the repo — no
display, no report, no email. Its *meaning* does change (it is now the EVENT price where event pricing
applies, i.e. "what the system would have charged"), which is the right quantity for an override audit and
the reason the menu price needed its own field. Its doc comment said "what the menu said at that moment";
that is corrected in place, with the correction and the zero-readers finding recorded beside it.

**On an edit**, a price-locked line keeps the `menu_price` / `price_basis` it was *stored* with; only a line
the edit ADDS gets today's. `stampEditedLines` replicates `repriceOrder`'s identity-**queue** pairing, and
the harness proves the two agree line-for-line on a duplicate-name order — keying on the identity *without*
the queue gives both duplicates the first line's fields.

### Reset and "Clear my changes"
Both clear the event's own prices — **the columns and the rows**. `price_own: false` alone would stop the
prices being charged but leave every typed price to reappear the moment "Own prices" was chosen again, which
an operator would read as the clear not having worked. The card's footer count includes `pricesOwn`, so the
count and the button cover the same set.

---

## 6 · THE SCREENS

### UI 1 — the Event types grid, tidied whole
🔴 **EVERY CELL IS PLACED EXPLICITLY** (`gridColumn` / `gridRow`), and the rows are **planned** first. That
is not tidiness: the "Your menu prices" cell spans the van columns **and** four rows, the STANDARD heading
spans the van columns, and each type header spans two rows — and with auto-placement one span shifts every
later cell by a column, *differently* for a one-van truck than for a three-van one.

- **Column lines run header to bottom.** `SERVICE` and `USED BY` used to be one `col-span-full` div each, so
  the vertical rules stopped at them and started again below — the grid read as three stacked tables. Every
  row, section and category heading now emits a divided cell **per column**.
- **Header:** one shared `STANDARD` heading spanning the van columns, van names centred below with **no
  colour dot** (every van column carried the same grey, so it distinguished nothing); type headers centred
  with the ⋯ `absolute` at the right edge, so the name is centred on the whole column rather than sharing
  the width with a button.
- **Slimmer, as numbers:** control 44 / item 36 / category 26 / section 34, controls 32. They live in
  `components/shared/PriceControls.tsx` (`ROW_H`, `CONTROL_H`) so the grid, the sheet and the render harness
  read the same figures. ⛔ No `min-h-11` survives — a minimum height is not a height.
- **Stripes:** `#F6F8FA` alternating from white, **restarting after every section and category** heading;
  sections a `#E9EEF4` band with the shared small-caps heading token; a spanning cell stays white.
- **PRICES above SERVICE**, with the rule rows and the item rows folding away entirely when no type's switch
  is on, and the Standard side one cell reading "Your menu prices" spanning the van columns **and** down
  through the rule rows. ⚠️ The Hide/Show button sits at the right of the **label cell**, not the row: the
  grid scrolls sideways, so a button at the row's right edge would be off-screen on exactly the truck that
  has enough types to need it.
- **Offline protection is a switch**, with an indented "When offline" sub-row carrying the mode, absent when
  protection is off in **every** column. ⚠️ The switch writes **only** the switch — turning protection off
  and on again must not silently change what it then does.

### UI 2 — the dashboard card and sheet
- A **Prices** row first under MENU (above stock: an operator sets prices once before service and checks
  stock repeatedly during it, but a wrong price is charged to a customer). Its one-line summary is computed
  **on the server**, by `summarisePricing` over the same `readEventPricing` call `loadEventPriceBook` uses —
  so the card's line and the next customer's charge come from one read.
- Offline protection on the card is the same switch with the mode underneath.
- The sheet is a right-side panel from `sm` up and full-screen on a phone — `inset-0` plus
  `sm:left-auto sm:w-[560px]`, one element and two shapes. It holds a **draft** until Save (the grid saves as
  you go; this is one event, often live, where a half-typed rule must not reach a customer).
- 🔴 **Choosing "Own prices" seeds a COPY** of the type's current setup, once, at the moment of choosing —
  because own prices replace the type's *whole*, and a blank start would silently lose the type's rule for
  every other dish. Merging at read time instead would mean an operator who *removed* a price got the type's
  back.

### One interpretation you should check
The brief says the Hide/Show button sits "at its right". I read that as the right of the **row label**, for
the scrolling reason above. If you meant the far right of the row, say so and it moves.

---

## 7 · THE 12 OCTOBER ADDITION

### 7.1 The diagnosis, confirmed
Your reading was right, and it is **two defects with one symptom**.

| Half of the report | Cause |
|---|---|
| "also turned it on for Van 2" | **There was no per-van cash setting at all.** `trucks.takes_cash` is ONE column for the whole truck; the grid drew one switch per van column over that single value, with "Applies to all your vans" as the only thing explaining it |
| "and showed Market changing" | A type's untouched settings were NULL and drawn **faded at the first van's value**. Market never had a cash value of its own — it was displaying Van 1's, and Van 1's had moved |

### 7.2 Cash per van — every reader, and the one resolver
🔴 **`resolvePaidStep` WAS ALREADY THE SINGLE RESOLVER**, so this is a fourth link in an existing chain, not
a new mechanism:

```
takesCash = event.takes_cash_override ?? event type ?? truck_vans.takes_cash ?? trucks.takes_cash ?? false
```

| Reader | file:line | Note |
|---|---|---|
| order card's Mark-paid split | `components/dashboard/OrderCard.tsx:306` | takes the **raw nullable** van value as a prop |
| Add Order's Take-payment split | `components/dashboard/AddOrderPanel.tsx:1272` | same |
| the dashboard's resolved values | `app/dashboard/[token]/page.tsx:3334` | the one call on that page |
| the server's own resolve | `app/api/dashboard/action/route.ts:91, 128` | no van object in hand → the truck default, i.e. unchanged |
| the ticket mapper | `lib/printing/mapOrderToTicket.ts:73` | resolves `showPaidStep` only; a ticket has no cash/card concept |
| Settings' per-van switch | `app/manage/[token]/page.tsx` | `resolveVanTakesCash` — the chain's **tail**, not a second expression |
| the grid's Standard cells | `components/manage/EventTypes.tsx` | `vanValue` → `v.takes_cash`, resolved server-side |

⚠️ **The two components take the RAW nullable value, never a resolved boolean.** A resolved `takesCash` prop
would be a second copy of the chain on the busiest screen in the product.
⚠️ **The van sits BELOW the type.** A type is a statement about *this event*; the van is the standing setup
of the trailer running it. The more specific statement wins, as in every other resolver in that file.

🔴 **IT IS READ THROUGH A SEPARATE PROBED READER** (`lib/payments/van-cash.ts`), never as a column on an
existing `truck_vans` select. `/api/dashboard`'s van select feeds capacity, the cooking step and
order-ready, and its **own comment** records that a 42703 there degrades all three — a cash migration must
not be able to turn the mark-ready button off. `get_vans` is the same argument for Settings.

**Proof for a NULL van:** 27 inputs show the chain with no van and no type is character-for-character the
pre-van expression, pinned to a named parent; 54 more place the van correctly; and a van that has chosen
`false` is honoured rather than re-inherited (the `||` bug, in the one place it would cost money).

**Settings:** the switch moved onto each van's card; a NULL van shows the truck value and says "Following
your truck setting". The truck-level control **stays, gated on `!vanCashAvailable`**, so there is never *no*
cash control before the migration — and `trucks.takes_cash` is still the chain's last link, not dead data.
`takes_cash` joined `VAN_COPY_FIELDS`; the two sets stay disjoint (`capacitySplitIsClean()` still passes).
⛔ "Applies to all your vans" is **deleted**, not reworded.

### 7.3 "Same settings for all vans"
A **VANS** section, first, one row, **2+ active vans only**, reading and writing the **existing**
`truck_vans.same_as_first_van` through Settings' own `set_van_same_as_first`. No new flag, no new column, no
second save path. ON when every non-first active van has it on, any mix OFF, computed on read; **nothing is
written on load**. ON ⇒ one Standard column headed `STANDARD` over "All vans", edits going to Van 1; OFF ⇒
one column per active van. OFF → ON asks first, with your wording verbatim; ON → OFF keeps every van's
values.

⚠️ **THIS SUPERSEDES A RULE THIS FILE ARGUED FOR ON 4 OCTOBER** — "the shape of the screen is a fact about
the truck, never about the values in it". That rule existed because the columns used to appear and disappear
as *values* changed (`perVan`), so equalising two vans made every row jump. The shape now follows an
**explicit switch the operator pressed**, and the row that changes it is the first row on screen. The part
that stands, and is still asserted: nothing keys the layout off `standardIsPerVan`.

### 7.4 Types hold their own values
A new type is created as a **copy of Van 1's resolved service values** (`vanOneServiceValues`, server-side),
`Match Standard` **copies** rather than clears, and no service cell fades or claims to follow.
`rowIsOwn`, `inheritTitle` and `TYPE_FOLLOWS_VAN_TITLE` are deleted. The **only** fade left in the product
is an untouched price **Rounding** — `price_rounding` is `NOT NULL DEFAULT 'none'`, so the screen has no
other way to say "not chosen". ⚠️ `offline_auto_reject_mins` is **not** seeded: it is not offered on a type
at all, so storing it would be a value no screen shows.

🔴 **THE RESOLVER CHAIN IS UNCHANGED** — a NULL still falls back to the van — so every type that exists today
goes on resolving exactly as it does now, and the code works with or without the backfill. The two can be
applied in either order.

---

## 8 · HARNESSES RUN — only the areas this changes

| Harness | Result |
|---|---|
| `scripts/event-pricing.cjs` **(new, registered)** | ✅ **92 passed · 14 variants, 14 caught** |
| `scripts/event-types.cjs` | ✅ **154 passed · 42 variants, 42 caught** |
| `scripts/run-harnesses.cjs --dry-run` | ✅ **all 88 listed files pass the screen** |
| `npx tsc --noEmit` | clean |
| `npm run build` | compiled successfully |
| ESLint, added lines | **zero new errors.** `app/dashboard/[token]/page.tsx` has the **same 83 errors with the same signatures** as `0ce4c83` (diffed, set-wise). `lib/event-pricing/*`, `components/shared/PriceControls.tsx`, `components/dashboard/EventPricesSheet.tsx`, `lib/payments/van-cash.ts` are clean |
| `scripts/event-types-render.cjs` | **846 measured and passed · 192 stale assertions, all six families re-aimed; the verifying re-run did not complete.** §9, in full |

🔴 **FIVE FINDINGS THE HARNESSES MADE IN MY OWN WORK**, each fixed at source: the `1.005` rounding
(§2); the open-coded `/100` (§2); a **stale-response race** in the dashboard's prices read (switch event A→B
while A's request is in flight and A's answer lands last — the card would show A's prices under B's name, on
the one row where being wrong means quoting a price); a **React Compiler bailout** my `useCallback`
introduced (`Existing memoization could not be preserved`, which skips compiling a 6,000-line component —
measured, and taken back to `0ce4c83`'s count); and three **variants that could not produce the symptom they
named**, reported by the variant tally and re-aimed.

---

## 9 · THE RENDER HARNESS — RAN TO COMPLETION ONCE; THE VERIFYING RE-RUN DID NOT

🔴 **STATED PLAINLY, BECAUSE A MEASUREMENT NOBODY TOOK IS WORSE THAN NONE.**

### What the fixture is, and what I rebuilt
The fixture is a hand-written mirror of the grid with **every class and number lifted from the
component**, and `lift` **throws** when a pattern is gone — so it stopped *building* the moment the grid
was rewritten, which is exactly what that design is for. Rebuilt for the new structure: the row **plan**,
explicit `gridColumn`/`gridRow` on every cell, the banding and its restart, the four row heights, the VANS
row, the PRICES section with its spanning cell, the "When offline" sub-row, the shared STANDARD heading,
and the `pricesOn` / `showItems` / `sameSettings` states.

### Two real faults in the harness, found and fixed
Both were hiding the problem rather than being it:
1. **A throw discarded every measurement already taken.** `lines` was printed only at the end, so a hang
   produced a bare `Runtime.callFunctionOn timed out` stack naming no fixture, width or engine. It now
   dumps the progress it had made — which is the only reason anything below is visible.
2. **A screenshot failure could abort the run.** A shot is an **artefact**; the assertions are the
   measurement. `el.screenshot()` hangs on the Chromium build available here
   (`chromium_headless_shell` 153 — the machine had **only** WebKit; I installed Chromium during this
   build). Both engines' `shot` are now guarded into `SHOT_FAILURES`, reported in the summary so
   "the pictures are missing" is visible rather than silently true, and puppeteer's 180-second default
   `protocolTimeout` is 30s so a hang fails promptly and locatably.

### The completed run
With those two fixed it ran **end to end, both engines, 1440 / 820 / 390**:

```
846 measurements passed · 192 failed
```

🔴 **ALL 192 WERE SIX STALE ASSERTION FAMILIES — 16 distinct lines × 12 fixture states — AND EVERY ONE
NAMED A DESIGN THIS BUILD DELETED OR A FIXTURE BUG, NOT A LAYOUT FAULT:**

| Failures | The assertion | Why it failed |
|---|---|---|
| 36 | "…with the hover title that says whose value it is" | `TYPE_FOLLOWS_VAN_TITLE` is **deleted** |
| 36 | "…and it is faded, because the type has not set it" | the fade is **deleted** — a type holds its own values |
| 24 | "…and its switch says so on hover" | `TAKES_CASH_ALL_VANS_TITLE` is **deleted** |
| 24 | "the truck-level row is ONE CELL PER VAN, not a span" | there **is** no truck-level row any more |
| 36 | "a dropdown's text is the same size as a row label (14px vs 16px)" | **my fixture bug**: `firstLabel` was on the label CELL, and in the component the size class is on the SPAN — so it measured `<body>`'s 16px |
| 36 | "…and the same line height (20px vs 24px)" | the same bug, same probe |

**All six are re-aimed**, and the four design ones are **inverted** rather than dropped — they now measure
the absences, which is the only way to measure a design that was removed: *no* service cell spans more than
one column (measured on the rendered boxes via `data-svc`, a stronger claim than the old one because it
covers all five rows rather than the one exception), *no* "Applies to all your vans" title survives, a type
cell holds a real control, claims **nothing** about whose value it is, and is **not** faded. The two
fixture-bug ones now read the text's own element (`firstLabelText`), which is what the question was about.

### ✅ THE RE-AIMED ASSERTIONS DO PASS — 228 MEASURED, **0 FAILED**
A run after the seven edits reached **228 passed / 0 failed** before I killed it myself (I was clearing
browser processes and the `pkill` aborted its next `page.goto` — the stack is a `goto`, not an assertion).
So the six re-aimed families are **right**, not merely rewritten: the new "no service cell spans more than
one column", "no all-vans title survives", "a type cell claims nothing and is not faded" and the two
`firstLabelText` font/line-height checks all measure green in both engines at the widths reached.

### ⛔ WHAT I AM STILL NOT CLAIMING
**No run completed the whole sweep after those edits.** Five attempts; the best reached the 228/0 above
before I aborted it myself.

⚠️ **AND I CANNOT TELL YOU WHY, WHICH IS THE HONEST ANSWER.** I twice wrote down that "orphaned browser
processes were starving it" — that was **wrong**, and worth recording as a lesson rather than quietly
deleted. My process count was `ps aux | grep -icE 'headless_shell|webkit'`, and on macOS that matches the
**operating system's own** `/System/Library/Frameworks/WebKit.framework` XPC services — the WebViews of
whatever apps happen to be open. So "14 browsers alive" was mostly *your* machine, not leftovers of mine,
and the diagnosis built on it does not stand. A grep for a browser name is not a count of browsers.

What IS evidenced: the final attempt wrote **one** fixture in twelve minutes, where the first complete run
had written twenty in the same window; and the first run's progress dump stopped at an **element
screenshot**, not at a measurement. So the Chromium `el.screenshot()` stall is real and confirmed. The
general slowdown is not explained, and I am not going to invent a cause for it.

**What I changed in response, which should make the next run finishable:** the first shot failure on an
engine now disables that engine's remaining shots (per engine — WebKit's work here and must not be
disabled by Chromium's), and the summary prints every shot that did not happen, by name, so a stale PNG
cannot be mistaken for this build's output. Previously `SHOT_FAILURES` was collected and **never printed**,
which made my own comment claiming it was "reported in the summary" false until I fixed it.

So:

- The **846 passes from the first complete run are real**, and the **228/0 above** shows the re-aimed
  assertions pass too. What is missing is **one uninterrupted run of the whole sweep** — 228 is not 1038,
  so the later fixtures (the sheet, the phone card, the 820 and 390 passes of the modal in both engines)
  are measured in the first run but not yet re-measured against the re-aimed assertions.
- The first run's passes included the pill capped at 1000px and left-aligned at every width, the columns
  scrolling inside the card and not the page, the label column at `GRID_LABEL_W`, the longest label on one
  line, the phone picker, the popup, the Add-event picker, the dashboard card's selects at ≥40px in both
  engines, and the control proving the scroller assertions are real.
- ⚠️ **IT IS A HARNESS-PERFORMANCE QUESTION, NOT A LAYOUT ONE.** No assertion failed in any attempt
  after the re-aim; the runs did not reach their summary. That distinction is the whole of what is
  missing here.
- The geometry they cover is in the component as **numbers** (`ROW_H`, `STRIPE_BG`, `SECTION_BG`,
  `GRID_LABEL_W`, `GRID_COL_W`) and `scripts/event-types.cjs` asserts those **source-side** — ten checks:
  the heights are the shared constants with no `min-h-11` left, the banding restarts at every heading, the
  dividers are per-cell with nothing spanning the full width, the PRICES cell spans exactly
  `1 + ruleRowCount` rows and stays white, the selects are the shared non-native `Select`. **That is a
  weaker claim than a pixel measurement and I am not presenting it as the same thing.**

**To finish it:** `node scripts/event-types-render.cjs` on a machine with no stray browser processes. It
takes several minutes and now says how far it got if it stops.

### ⚠️ THE TRACKED SCREENSHOTS ARE HALF-UPDATED, AND THAT IS VISIBLE IN `git status`
`docs/screenshots/event-types/` holds eight tracked PNGs. The runs **regenerated the eight WebKit ones**,
so those show the **new** grid — the VANS row, PRICES, the shared STANDARD heading, the banding. The
**Chromium ones were not regenerated**, because the Chromium element screenshot is the thing that hangs
here (§9 above), so they still show the **pre-build** grid.
🔴 SO DO NOT READ THE CHROMIUM PNGs AS THIS BUILD'S OUTPUT. They are stale by exactly one design.
Re-running the harness on a machine where `el.screenshot()` works will replace them; until then the WebKit
pair at 1440 and 390 is the honest picture of what the grid now looks like.

## 10 · FILES

| File | |
|---|---|
| `lib/event-pricing/price.ts` | **new.** The arithmetic, the precedence, the summaries, the validators. Pure, no imports |
| `lib/event-pricing/read.ts` | **new.** Probed reads, `loadEventPriceBook`, `candidatesChangePrices`, `stampEditedLines` |
| `lib/payments/van-cash.ts` | **new.** The probed per-van cash reader |
| `components/shared/PriceControls.tsx` | **new.** The three rule controls, `<PriceCell>`, `ROW_H`/`CONTROL_H`, and `Select` **moved here** |
| `components/dashboard/EventPricesSheet.tsx` | **new.** "Prices for this event" |
| `supabase/migrations/20261011_event_pricing.sql` | **new, NOT RUN** |
| `supabase/migrations/20261012_van_cash_and_type_values.sql` | **new, NOT RUN.** Preview SELECT, then the changes |
| `scripts/event-pricing.cjs` | **new**, registered in `scripts/harnesses.json` |
| `components/manage/primitives.tsx` | `Select` **re-exported** from `components/shared`; every manage caller unchanged |
| `components/manage/EventTypes.tsx` | the grid rewritten to a row plan; PRICES; VANS; offline as a switch; types hold their own values; `SettingRow` and `rowIsOwn` deleted |
| `components/dashboard/ThisEventCard.tsx` | Prices row; offline as a switch + mode; `pricesOwn` in the count |
| `app/api/menu/[truckId]/route.ts` | one probed read, one guarded emit |
| `app/api/orders/submit/route.ts` | pricing-event resolution, the event-aware book, the two audit fields, the ambiguity refusal |
| `app/api/dashboard/action/route.ts` | the event-aware book on the walk-up and edit paths; `book_price`'s comment corrected |
| `app/api/event-types/route.ts` | seven new actions, `vanOneServiceValues`, the two probed reads |
| `app/api/dashboard/route.ts` | serves `vanTakesCash` from a probed read |
| `app/api/manage/route.ts` | `get_vans` serves `takes_cash` + `vanCashAvailable`; `update_van_settings` accepts it |
| `app/manage/[token]/page.tsx` | cash per van; the truck-level control gated |
| `app/dashboard/[token]/page.tsx` | the prices summary (effect + tick), the sheet mount, `vanTakesCash` threaded |
| `lib/event-types/resolve.ts` | the van link; `resolveVanTakesCash` |
| `lib/payments/paid-step.ts` | the fourth argument |
| `lib/van-category-settings.ts` | `takes_cash` in `VAN_COPY_FIELDS` |
| `lib/copy/serviceSettings.ts` | the price labels; the same-settings copy; `TAKES_CASH_ALL_VANS_TITLE` deleted |
| `scripts/event-types.cjs` | the price guard re-aimed and split; ~20 assertions re-aimed; 8 variants re-targeted; the "Stripe" comment reworded |
| `scripts/event-types-render.cjs` | the fixture rebuilt; progress-on-throw; guarded screenshots; `protocolTimeout` |
| `scripts/schedule-graphics-places.cjs` | the "Stripe" comment reworded |
| `docs/reference-manual.md` | §70.1, §70.2 corrected, **§70.9** and **§70.10** new, §66.4 extended, the buzzer date |
| `docs/combine-branches-report.md` | the same buzzer date |

---

## 11 · NOTHING WAS RUN

No SQL. No push, no merge, no deploy. No real card charge and no test order of any kind. Pizzeria Gusto was
never read, written or opened.

---

## 12 · ONE LOCALHOST TEST LIST

> Pizza Kitchen (`test-truck`) or Village Spice. **Not Pizzeria Gusto.** `npm run dev`.
> 🔴 **STEP 1 IS THE MIGRATIONS.** Until they are applied, every screen below shows "Menu prices" and the
> Prices row will not open — which is correct, and is the fail-open working.

**The migrations**
1. Run `20261011_event_pricing.sql`. Then run `20261012`'s **§0 preview** and read it: it should name test
   trucks only. If it names a live trading truck, stop. Then run `20261012` §1 and §2, and the verification
   SELECT.

**The tidied grid**
2. **Schedule › Event types.** Column lines run unbroken from the header to the bottom — through `VANS`,
   `PRICES`, `SERVICE`, `USED BY` and every category heading. Rows alternate white / very light grey,
   restarting under each heading; section rows are a slightly darker band.
3. Van columns sit under one shared **STANDARD** heading, names centred, **no coloured dot**. Type names are
   centred with ⋯ pinned to the right edge. Nothing is off-centre.
4. Rows are visibly slimmer than before; selects and inputs are the same height as each other.

**Prices per type**
5. Turn **Change prices** on for one type. **Price change**, **Amount** and **Rounding** appear — controls
   only in that type's column, blank in the others. Turn it off again: all three rows **disappear entirely**.
6. Set `+ %` and `10`, Rounding **Nearest £1**. Press **Show** on **Item prices**: a £10 dish reads **£11**,
   an off-type column reads the menu price in grey, and the Standard column reads the menu price.
7. Press a computed price and type `7.45`. It becomes a **blue outlined box with ×**, and it does **not**
   round to £8 under "always round up". Press the × — it goes back to the computed price.
8. **The customer menu.** Open an event of that type as a customer. The dish shows **£11** — just the
   number, no crossed-out "was" price. A sold-out dish still shows its event price, crossed out as usual.
9. Place a **pay-at-hatch** order for it on `test-truck`. The order stores £11, and the row carries
   `menu_price: 10` and `price_basis: "event_type"`.

**Prices per event**
10. **Dashboard › This event.** Under MENU, **Prices** is the first row, reading
    `Festival's prices · +10%, nearest £1`, with a **Change** button.
11. Open the sheet on a **future** event. Choose **Own prices for this event** — the rule and any typed
    prices arrive as a **copy** of the type's. Change it to `+ 15` and Save. The card now reads
    `Own prices · +15%, nearest £1`, with a **THIS EVENT** tag, and the footer count has gone up by one.
12. **Go back to the type and change it to +20%.** The event you gave own prices is **unchanged**.
13. **The live-event warning.** Open the sheet on a **live** (open) event. The amber notice reads exactly:
    *"This event is live. New orders use the new prices. Orders already placed keep theirs."*
14. **An order keeps its price.** With an order already placed at £11, change the event's prices to +50% and
    save. The placed order still reads £11; a **new** order is at the new price.
15. **Reset.** Press **Reset to Festival** on the card. The Prices row goes back to the type's summary, the
    THIS EVENT tag goes, and re-opening the sheet shows **no** typed prices left over.

**Offline protection as a switch**
16. In the grid, **Offline order protection** is a **switch**, per van and per type. Turn one on: an
    indented **When offline** row appears with the mode select in that column only. Turn every column off:
    the row disappears.
17. Turn a switch off and on again: the **mode is unchanged**.
18. On the dashboard card, offline protection is the same switch with the mode underneath when on.

**Cash per van (the 5 October addition)**
19. **Grid, two-van truck.** Turn **Do you take cash?** on for **Van 1**. Van 2 is **unchanged**, and
    **Market is unchanged**. (This is the report.)
20. **Settings › Your trucks.** Each van has its own **Do you take cash?**. An untouched van shows the truck
    value and says *"Following your truck setting"*. Change one — the other does not move. The old
    truck-level switch in **Order settings** is gone.
21. **Add Order on a Van 2 event** offers Cash/Card according to **Van 2's** setting, not Van 1's. Same for
    the order card's **Mark paid**.
22. **Settings › "Same as Van 1"** on Van 2 copies Van 1's cash across with everything else. Kitchen
    capacity does **not** come with it.

**Same settings for all vans**
23. With 2+ vans, the grid's first section is **VANS**, one row: **Same settings for all vans**. A one-van
    truck has **no VANS row at all**.
24. Turn it **on**. The confirm reads *"Copy Van 1's settings to every van? …Kitchen capacity has its own
    switch."* **Cancel** — nothing changed. Press it again and **Copy**: the Standard side becomes **one**
    column headed `STANDARD` over **All vans**.
25. Turn it **off**: one column per van again, each at the values it now has (Van 1's copy — nothing is
    reverted).
26. Settings' own "Same as Van 1" switch on Van 2 and the grid's row agree in both directions.

**Types hold their own values**
27. Make a new type. Every service cell has a **real, crisp value** — none is faded — and it matches Van 1.
    The popup says it *"starts as a copy of Standard, and changing Standard later won't change it"*.
28. **Change Standard** (any row, any van). The new type is **unchanged**.
29. **⋯ › Match Standard** on a type you have edited. The confirm shows *"It will use: …"* with Van 1's
    current values, and pressing it copies them in. The type's **prices are not changed**.

**Nothing else moved**
30. A truck with **no** event types and **no** own prices: the customer menu, a submitted order and the
    dashboard are exactly as before. The dashboard's Prices row reads **Menu prices**.
