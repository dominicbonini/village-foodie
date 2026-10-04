# Event types — investigation

**Branch:** `event-types`, cut from an up-to-date `main` (`deec9f5`). Investigation only: no app code
changed, no migration written, no SQL run. Village Spice is the only test truck named anywhere below;
Pizzeria Gusto was not touched. No keys printed.

**Nothing in the brief arrived garbled, and I found no instruction contradicting another**, so I have
not stopped. One **premise** in the brief is factually wrong about this codebase, and because the whole
proposed architecture rests on it, it is flagged first.

---

## 🔴 FLAG — `event_price_overrides` DOES NOT EXIST

The brief says a type "FILLS the existing per-event tables (`event_price_overrides`, `event_item_stock`,
`event_category_stock`, `event_option_stock`, `event_deals.overridden`, `truck_events` override
columns)". Five of those six exist. The first does not:

```
$ grep -rn "event_price_overrides" app lib components supabase scripts
(no matches)
```

Nor does per-event pricing exist under any other name. **There is no event dimension in pricing at all
on main.** The authoritative price book is scoped by truck and nothing else
(`lib/order-repricing.ts:204`):

```ts
export async function loadPriceBook(supabase: SupabaseClient, truckId: string): Promise<PriceBook> {
  const [{ data: itemRows }, …] = await Promise.all([
    supabase.from('menu_items_db').select('name, price').eq('truck_id', truckId),
```

The menu API serves `menu_items_db.price` directly (`app/api/menu/[truckId]/route.ts:591`:
`price: i.price,`) even though it already resolves an `effectiveEventId` for stock and deals.

**Consequence for the plan.** Prices are not a per-event table a type can fill — they are the one
dimension of the five that has to be **built from nothing**, including a new read path in two places
(the menu API and `loadPriceBook`). That makes pricing the largest and riskiest stage, not a
fill-the-existing-table stage, and it is why the staging below puts it last rather than first.

A second, smaller correction: there is no `event_name` column on `truck_events` (the union of every
column the app selects is listed in §1.3), so the matching question in Q1 cannot arise in the form it
is asked. Event identity is the `id` uuid, with `venue_name` as the label.

---

## 1 · PRICES AT CHECKOUT

### 1.1 The chain, end to end

| Stage | File:line | Price source |
|---|---|---|
| Menu page (customer) | `app/api/menu/[truckId]/route.ts:591` | `menu_items_db.price`, straight through. **No event dimension.** |
| Basket → submit | `app/api/orders/submit/route.ts:461-470` | body prices **discarded**; `loadPriceBook` + `repriceOrder` |
| Stripe amount | `app/api/orders/submit/route.ts:833` | `amountMinor: serverTotalMinor` |
| Order row | `app/api/orders/submit/route.ts:1203` | `items: pricedItems` — the repriced array |
| KDS / Orders tab / tickets | `lib/printing/ticket.ts:70-75`, `lib/printing/mapOrderToTicket.ts:102` | `orders.items[].unit_price` |
| Receipts / emails | `lib/email.ts:174`, `lib/email.ts:428` | `orders.items[].unit_price` |

### 1.2 The server is the only price authority — stated and enforced

`lib/order-repricing.ts:14-16`:

```
// The request body's prices are ADVISORY throughout. They identify WHAT was selected; they never
// decide money.
```

And at the write (`app/api/orders/submit/route.ts:1029-1032`):

```
// 🔴 EVERY MONEY FIELD HERE IS SERVER-DERIVED. `items` and `deals` are the REPRICED arrays, so
// orders.items[].unit_price and orders.items[].modifiers[].price are the price book's figures,
// not the browser's; the three totals come from calculateOrderTotal via repriceOrder. Nothing on
// this object is read from the request body except names, quantities, notes and contact details.
```

An **unpriceable** line refuses the whole order rather than guessing
(`app/api/orders/submit/route.ts:495`): `if (repriced.unresolved.length > 0) {` … 400.

The operator path is the only one that may hand-set a price, and it is **auditable**
(`app/api/dashboard/action/route.ts:1466-1470`):

```ts
const pricedItems = priced.items.map((line, i) => {
  const ov = overrideByIndex[i]
  if (ov === null) return line
  return { ...line, price_override: ov, book_price: booked.items[i]?.unit_price ?? null }
})
```

The customer path **strips** it (`app/api/orders/submit/route.ts:440-443`):
`delete copy.price_override; delete copy.book_price`.

### 1.3 Price-lock: a placed order never moves

`lib/order-repricing.ts:4-12`:

```
// ── THE RULE ───────────────────────────────────────────────────────────────────
// Once an order is placed its prices are LOCKED. A later menu price change applies to FUTURE orders
// only. Editing an existing order must NEVER move the price of something already on it.
//
// So the authoritative price for an EXISTING line is the one already STORED on the order row —
// orders.items[].unit_price, orders.items[].modifiers[].price, orders.deals[].price, …
```

**Answer to "do orders store the unit price at order time?" — yes**, in `orders.items[].unit_price`
(jsonb), and the live menu is consulted only to price a genuinely **new** line added by a later edit.
So *"orders already placed keep their prices"* is already true and needs no new work.

### 1.4 How the event is matched — and where two events on one day DO collide

**Not by name, and not by a validity window.** There is no `valid_from`/`valid_until` anywhere near
pricing, and no `event_name` column. Two resolvers exist, both by id with a **date fallback**:

**(a) The order submit route** (`app/api/orders/submit/route.ts:526-529`, and the fallback at 568-577):

```
// Prefer the event_id the customer ordered against (unambiguous). Only fall back
// to (truck_id, event_date) when no id was sent — and then take the earliest by
// start_time via limit(1) so 2+ same-date events no longer collapse to null
// (Section 5).
```

**(b) The menu API** (`app/api/menu/[truckId]/route.ts:146-193`): an explicit `event_id` param resolves
strictly from that id ("cross-event fix"); with no param it auto-detects:

```ts
const { data: openEvent } = await supabase
  .from('truck_events').select('id').eq('truck_id', truck.id)
  .in('status', ['open', 'confirmed']).gte('event_date', today)
  .order('event_date', { ascending: true }).limit(1).maybeSingle()
```

**So the collision risk is real but it is not a name collision — it is the no-id fallback.** With two
events on the same date, a request that sends no `event_id` gets *the earliest by start time* at submit
and *the earliest by date* on the menu. Today that mis-attributes stock and deals. **Once a type
decides price, the same fallback would mis-price an order** — a customer could be charged the festival
uplift for a pub lunch. This is the single most important finding for the pricing stage: **typed
pricing must be refused when the event is ambiguous**, not silently resolved to the earliest.

⚠️ The two resolvers also disagree in ordering (`start_time` vs `event_date`), so they can pick
different events for the same truck on the same day.

**Columns the app actually selects from `truck_events`** (union across `app/` and `lib/`): `id`,
`truck_id`, `event_date`, `start_time`, `end_time`, `status`, `venue_name`, `town`, `postcode`,
`venue_id`, `van_id`, `notes`, `opened_at`, `paused_until`, `online_paused_until`, `extra_wait_mins`,
`extra_wait_started_at`, `scraped_signature`, `slot_duration_mins`, `order_ready_override`,
`collection_interval_mins_override`, `operator_collection_interval_mins_override`,
`offline_protection_override`, `offline_protection_mode_override`, `offline_auto_reject_mins_override`.
(Also written but not in that list: `takes_cash_override`, `show_paid_step_override`,
`completion_presses_override`, `buzzer_prompt`, `auto_open`, `auto_close`, `confirmed_at`, `source`,
`latitude`, `longitude`, `address`, `venue_id_source`, `venue_match_confidence`, `updated_at`.)

---

## 2 · ITEMS SOLD — how an item is "not sold" at one event

Two distinct mechanisms, and they are **not** interchangeable:

| Scope | Table.column | Effect |
|---|---|---|
| **This event only** | `event_item_stock.available = false` | per-event; auto-reverts next event |
| **Menu-wide** | `menu_items_db.is_available = false` | every event |
| **This event, whole category** | `event_category_stock.available = false` | items **omitted** from the customer response, so the tab vanishes |
| **This event, one extra** | `event_option_stock.available = false` | per-event option |

`lib/stock-guard.ts:210-212` reads both and keeps them apart:

```ts
;(overrides || []).forEach((o: any) => { if (o.available === false) perEventUnavailable.add(o.item_name) })
;(menuItems || []).forEach((i: any) => { if (i.is_available === false) menuWideHidden.add(i.name) })
```

The **category** case is deliberately a gate rather than exhaustion
(`app/api/menu/[truckId]/route.ts:321-326`):

```
// Per-event category ENABLE/DISABLE (GATE, not bulk-write): available === false ⇒ the whole category
// is closed for THIS event. DISTINCT from exhaustion — a disabled category's items are OMITTED from
// the CUSTOMER response entirely (below), so its tab vanishes (groupByCategory emits only categories
// with ≥1 item); a naturally sold-out category keeps its tab with crossed-out items.
```

**What the two surfaces do with it.** The menu page hides/crosses out; the submit route **independently
enforces** the same thing, so "hidden on the menu" == "would be blocked at submit"
(`app/api/menu/[truckId]/route.ts:317-319`, `lib/stock-guard.ts` `checkStockShortfall` /
`checkClosedCategories`, called from `app/api/dashboard/action/route.ts:47`). Display and enforcement
share their sources by design — that is the property a type must not break.

**For event types this is the easy dimension**: "which items are sold" is already a per-event sparse
override with a server gate. A type only has to write `available` rows.

---

## 3 · STOCK — the three tables

### 3.1 They are SPARSE. A missing row inherits the template

`app/api/menu/[truckId]/route.ts:300-302`:

```
// Per-event stock override (sparse) — fetched for the SAME effectiveEventId as liveItemCounts above,
// so the ceiling and the sold count belong to one event. A missing row falls through to the live
// menu_items_db default below (never unlimited-by-accident). Empty until a dashboard edit (Phase 5).
```

Resolution order (`lib/stock-guard.ts:152-154`, and the code at 177-199):

```
item ceiling     = event_item_stock.stock_count(eventId)     ?? menu_items_db.default_stock
category ceiling = event_category_stock.stock_count(eventId) ?? menu_categories.default_stock
```

with `no_item_cap = true` meaning "follow category" → the item ceiling resolves to `null`
(`lib/stock-guard.ts:185-192`).

`event_option_stock` is sparse **per column**, because the dashboard sets stock and availability with
two independent toggles (`app/api/menu/[truckId]/route.ts:343-345`): "Both columns are NULLABLE (NULL =
inherit the template) because the dashboard sets stock + available via two independent toggles, so each
must inherit independently."

### 3.2 When rows are created — only on a dashboard edit, never at event creation

Every write is an upsert from `app/api/dashboard/action/route.ts`:

| Action | Line | Table | Conflict key |
|---|---|---|---|
| `set_item_availability` | 1169 | `event_item_stock` | — |
| `set_stock` | 2006 | `event_item_stock` | `event_id,item_name` |
| `set_category_stock` | 2022 | `event_category_stock` | `event_id,category` |
| `set_category_available` | 2041 | `event_category_stock` | `event_id,category` |
| `set_modifier_option_available` | 1967 | `event_option_stock` | — |
| `set_modifier_option_stock` | 1990 | `event_option_stock` | — |

The inbound path says so explicitly (`app/api/inbound-schedule/route.ts:213-214`):

```
// Per-event stock is sparse-override (rows created only on a dashboard edit) — no snapshot at
// creation. insertedEvent.id is captured for future per-event use (Phase 4/5).
```

### 3.3 Orders do NOT decrement stock — consumption is derived

`app/api/dashboard/action/route.ts:2058-2060`:

```
// ── DECREMENT STOCK ON ORDER ──────────────────────────────────────────────
// NOTE: no live client caller (kept for completeness). …
// Live counts are read from the orders table — no counters to maintain.
```

**This is a significant simplification for event types**: a type sets ceilings, and there are no
counters to seed, migrate or keep in step. Changing an event's type mid-event changes the ceiling; the
sold count is recomputed from orders either way.

`event_category_stock.category` is keyed **lowercased** on read
(`app/api/menu/[truckId]/route.ts:334-336`) but the upsert at 2022 writes whatever case the client
sent — a pre-existing inconsistency a type-fill must not inherit.

---

## 4 · DEALS — and the one place the pattern already exists

### 4.1 `event_deals` is the exact precedent for this whole feature

Seeded at event creation from the bundle defaults, with `overridden: false`
(`app/api/manage/route.ts:878-897`):

```ts
// Auto-create event_deals from current bundle defaults
const { data: bundles } = await supabase.from('bundles_db')
  .select('id, apply_to_new_events').eq('truck_id', targetTruckId).eq('is_available', true)
if (bundles && bundles.length > 0 && newEventId) {
  const eventDeals = bundles.map((bundle) => ({
    event_id: newEventId, bundle_id: bundle.id,
    active: bundle.apply_to_new_events,
    overridden: false,
  }))
  await supabase.from('event_deals')
    .upsert(eventDeals, { onConflict: 'event_id,bundle_id', ignoreDuplicates: true })
}
```

and a truck's hand change sets the marker (`app/api/manage/route.ts:936-940`):

```ts
await supabase.from('event_deals')
  .upsert({ event_id: eventId, bundle_id: bundleId, active, overridden: true }, { onConflict: 'event_id,bundle_id' })
```

**`overridden` is already the "source marker" the brief asks for.** The event-types design should copy
this column's shape rather than invent a new one.

### 4.2 No rows at all ⇒ fall back to the bundle default

`app/api/menu/[truckId]/route.ts:205-211`:

```ts
if (eventDeals && eventDeals.length > 0) {
  const activeBundleIds = new Set(eventDeals.filter(d => d.active).map(d => d.bundle_id))
  filteredBundles = filteredBundles.filter(b => activeBundleIds.has(b.id))
} else {
  filteredBundles = filteredBundles.filter(b => b.apply_to_new_events)
```

⚠️ **`event_deals.active` is the customer visibility toggle only** — it must not gate the operator's
add-order list (`app/api/menu/[truckId]/route.ts:197-200`), and the filter runs for `!isDashboard`.

### 4.3 Day/time limits exist as data, and are enforced ONLY in the browser

`bundles_db.start_time` / `end_time` are served to the client
(`app/api/menu/[truckId]/route.ts:639`: `start_time: b.start_time,`), displayed in Manage
(`app/manage/[token]/page.tsx:6470-6471`), and gated **client-side** on the order page
(`app/trucks/[slug]/order/page.tsx:88-93`):

```ts
if (!b.start_time && !b.end_time) return null
if (b.start_time) {
  const [h, m] = b.start_time.split(':').map(Number)
  if (cur < h * 60 + m) return `Available from ${formatTime(b.start_time)}`
```

I found **no server-side window check** — not in the menu route's bundle filter and not in the submit
route. There is **no day-of-week limit** at all. So a deal outside its window is refused by the page
but not by the server.

### 4.4 Where checkout evaluates deals

`lib/order-calculations.ts:88-108` combines `dealsTotal` / `dealSavings` / `subtotal`; the deal
**prices** are resolved by `repriceOrder` from `bundles_db` (`lib/order-repricing.ts:215`) and stored on
`orders.deals[].price`. Pricing resolves, `order-calculations` combines — one place each.

---

## 5 · SERVICE SETTINGS

| Setting | Truck | Van | Per-event override | Dashboard action | Resolver |
|---|---|---|---|---|---|
| Buzzers (pool) | — | `truck_vans.buzzer_count` (`20260803_buzzer_settings.sql:39`) | — | `set_buzzer` (2279) | `lib/buzzer.ts` |
| Buzzer **prompt** | — | — | `truck_events.buzzer_prompt` (`20260803:63`) | `set_buzzer_prompt_override` (2250) | `resolveBuzzerPrompt`, `lib/buzzer.ts:83-90` |
| Take cash | `trucks.takes_cash` (`20260730_takes_cash_and_payment_method.sql:54`) | — | `truck_events.takes_cash_override` (`20260730_truck_events_takes_cash_override.sql:51`) | `set_takes_cash_override` (2339) | — |
| "Mark ready" | — | `truck_vans.order_ready_enabled` | `truck_events.order_ready_override` | `set_order_ready_override` (2655) | `app/api/dashboard/route.ts:635` |
| Collection interval | `trucks.collection_interval_mins`, `operator_collection_interval_mins` (`20260916`) | `truck_vans.collection_interval_mins` (`20260917:43`) | `truck_events.collection_interval_mins_override`, `operator_..._override` (`20260918:46,56`) | `set_collection_intervals_override` (2619) | `lib/slot-interval.ts:220-248` |
| (Paid step) | `trucks.show_paid_step` | — | `truck_events.show_paid_step_override` | `set_show_paid_step_override` (2190) | `lib/payments/paid-step.ts` |

**All four settings the brief names already have a per-event override column and a dashboard control.**
A type has only to write those columns — this is the cheapest dimension of the five.

### 5.1 🔴 The precedent that matters most, and the trap it names

`supabase/migrations/20260730_truck_events_show_paid_step_override.sql:17-29`:

```
-- ── 🔴 NO SEEDING, NO BULK WRITE — AND THAT IS THE POINT ───────────────────────
-- This deliberately DIVERGES from `truck_events.order_ready_override`, which it otherwise mirrors.
-- order_ready_override is seeded at event creation and BULK-WRITTEN onto every event when the truck
-- default flips (app/api/manage/route.ts:~981 — "including events previously toggled on the dashboard
-- (they reset to the new value, by design)"). That is right for the order-ready step and WRONG here:
-- an operator who set Saturday's festival to take payment at order must not lose that because they
-- changed their general default a week later.
-- Null-means-inherit gives the correct behaviour for free:
--   • changing the truck default REACHES every event that was never explicitly overridden;
--   • it LEAVES ALONE every event the operator did override;
--   • an override never carries forward, because a new event simply has no value.
-- All three properties come from NOT writing code. **Do not add a seed to the three event-creation
-- paths, and do not add a bulk write to the Manage settings save.**
```

Read that against the brief's design. **A type that FILLS override columns is exactly the seeding this
migration forbids** — it turns every typed event's settings into concrete overrides, after which
changing the truck default reaches nothing. That is tolerable *if* the truck has deliberately chosen a
type for that event (the type *is* the deliberate choice), but it must be a decision taken knowingly,
and it is why §12 proposes storing *what the type wrote* separately from *what the truck wrote*.

⚠️ That migration's prose is now **out of date**: it says "`takes_cash` stays TRUCK-LEVEL and has no
event column", but `20260730_truck_events_takes_cash_override.sql:51` adds exactly that column and
`app/api/dashboard/route.ts:182` selects it. Same date — one landed after the other.

---

## 6 · EVENT CREATION — every `truck_events` insert on main

**Four paths.** (The migration above says "three"; it predates one of them.)

| # | Path | Payload | Seeds `order_ready_override`? | Seeds `event_deals`? | Could a type apply? |
|---|---|---|---|---|---|
| 1 | `app/api/manage/route.ts:875` — `upsert_event` | full (19 keys) | ✅ `seededOrderReady` | ✅ **the only one** | **Yes — the primary place.** This is the Add event modal and the schedule-import review (`app/manage/[token]/page.tsx:3399`). The place is known here, so "remembered per place" belongs here. |
| 2 | `app/api/dashboard/action/route.ts:1211` — set event times, no `event_id` | 6 keys, `status` defaults `unconfirmed` | ✅ | ❌ | **Partly.** It creates a timeless draft from the dashboard with no venue and no place, so there is nothing to look a remembered type up by. Sensible default: no type; let the truck pick one when the draft gains a venue. |
| 3 | `app/api/inbound-schedule/route.ts:186` — scraper/inbound bridge | 17 keys, `source:'scraper'`, `status:'unconfirmed'` | ✅ | ❌ | **Yes, by place.** It resolves a `venue_id` and a matched venue, so a remembered per-place type could apply — but these arrive `unconfirmed` and unreviewed, so applying *prices* here would be wrong. Apply the type **label** only; materialise on confirm. |
| 4 | `lib/provision-demo-event.ts:138` — demo provisioning | demo-only | — | ❌ | **No.** Demo trucks should show the feature's default behaviour. |

Plus `scripts/diag-demo-event.mjs:47` — a diagnostic, not app code.

### 6.1 How this differs from the schedule-graphics audit

`git show schedule-graphics:docs/schedule-places-report.md` §3 audits **19 write paths** (inserts and
updates) to prove `truck_place_id` is written on insert only. Differences on main:

- Its insert #1 is at `app/api/manage/route.ts:964`; on main the same insert is at **:875** (the branch
  added ~89 lines above it) and its payload has **12 keys, not 13** — the branch adds
  `truck_place_id: resolvedPlaceId`.
- Its #11 "dashboard/action manual event insert" is main's path 2, unchanged.
- Its #16 `inbound-schedule:186` and #17 `provision-demo-event` are unchanged.
- Everything else in that table is an **update**, and all of them exist on main unchanged: the three
  non-literal payloads it flags by hand (`set_paused`, the van backfill, and the 8-column allowlist in
  `app/api/events/action/route.ts`) are the same on main.
- **The branch adds no new insert path**, so the four above are the complete set for both branches.

🔴 **The inconsistency a type must not inherit**: only path 1 seeds `event_deals`. Events created by
paths 2–4 have no rows, so they silently fall through to `apply_to_new_events`
(`app/api/menu/[truckId]/route.ts:210`). If event types "fill" rows at creation, they will fill them on
*one* path and leave three behaving differently — the same split that exists today for deals. §12
proposes resolve-on-read with materialise-on-demand instead, which has no such seam.

---

## 7 · PUBLIC SURFACES

| # | Surface | File | Reads | Exposes |
|---|---|---|---|---|
| 1 | Truck schedule feed | `app/api/events/route.ts:74` | `truck_events` | `venue_name, town, postcode, notes, status`, times |
| 2 | Website embed | `app/api/embed/events/route.ts:78` | `truck_events` | same, gated on `trucks.embed_enabled` + `embed_schedule` |
| 3 | Discovery feed → **also the public truck page and the map** | `app/api/discovery/events/route.ts:210-245` | `truck_events` | `venue_name, town, postcode, **latitude, longitude**`, notes |
| 4 | `/trucks/[slug]` page + map | `app/trucks/[slug]/TruckClient.tsx:60-62,354` | the feed at #3 | `<MapView events={truckEventsFlat} />` |
| 5 | Order page / menu API | `app/api/menu/[truckId]/route.ts:146-193` | `truck_events` | the ordering gate itself |
| 6 | Custom-domain schedule | `app/domain/page.tsx` | the truck's own `truck_events` (noted at :166) | the operator's schedule |
| 7 | Village Foodie discovery listing | `app/api/discovery/events/route.ts` | `discovery_events` **and** the operator events at #3 | both merged, operator wins (`:333-340`) |
| 8 | `/venues/[slug]` | `app/venues/[slug]/` | does **not** read `truck_events` | — |

**The leverage point is #3.** One query and one mapper feed the discovery listing, the public truck page
*and* the map, filtered only by:

```ts
.in('status', ['confirmed', 'open'])
.gte('event_date', today)
```

### 7.1 What each surface needs for "Private event"

A private event must: show as the words **"Private event"**, carry **no address and no map pin**, and be
**unorderable except through a private link**.

1. **#3 (discovery / truck page / map)** — the mapper at `:295-322` must emit `venueName: 'Private
   event'`, `village: ''`, `postcode: ''`, and **omit `venueLat`/`venueLong`** (they are already
   `undefined` when null, so the map pin disappears for free — `MapView` is handed the same flat list).
   `orderUrl` must be suppressed. Doing it in the **mapper** rather than by filtering the query keeps
   the event on the schedule (which is what the truck wants) while removing the location.
2. **#1 schedule feed** — same substitution at `app/api/events/route.ts:119-121`. ⚠️ its dedup key is
   `` `${e.event_date}|${e.venue_name || ''}|${e.start_time || ''}` `` (`:108`), so **substitute after
   the key is built**, or two private events on one day at one start time would collapse into one.
3. **#2 embed** — same substitution at `:98-101`.
4. **#6 custom domain** — inherits whichever feed it calls; one substitution if it reads the table
   directly.
5. **#5 order page / menu API** — the real gate. A private event must not be reachable by the
   auto-detect branch (`:169-193`), which picks the earliest confirmed/open event with no id at all.
   **A private event must be excluded from auto-detect** and resolvable only by explicit id plus a
   secret, or the public QR code would land customers on it.
6. **#7 listing** — covered by #3; `discovery_events` rows are scraped and are a separate table, so a
   private operator event cannot leak through that side.

### 7.2 Yes — an existing mechanism can carry the private link

Three parts already exist and fit together:

- **An unguessable per-row key.** `orders.order_key` is "the `order_key` UUID — globally unique, no
  `?truck=` needed" (`app/order/[id]/manage/page.tsx:32`). The same shape — a uuid or random text on
  `truck_events` — is the natural private token.
- **A short public route with the right headers.** `/order/<slug>` is the "decider" that re-decides on
  every scan, and `/o/<slug>` is a permanent 307 shim kept forever for printed codes
  (`app/o/[slug]/page.tsx:3-18`). That header also records the two registrations a new private route
  would need: *"the `/o/(.*)` noindex header (vercel.json) and the `/o` GENERAL rate-limit entry
  (proxy.ts isGeneralPublic)"*. A private link **must** get both, or it would be indexed.
- **QR generation.** `lib/generateQRCode.ts` (`generateQRWithLogo`, `generateQRCodePNG`, `QR_POSTER`,
  `posterLogoRect`) and `scanUrl(slug, origin)` (`lib/custom-domain/copy.ts:399`). ⚠️ `scanUrl` takes a
  **slug**, so a private link needs its own URL builder beside it rather than a change to that one —
  `origin` exists for the demo dashboard and "MUST NOT BE DROPPED" (`:394-397`).

**Recommended shape:** `/order/private/<event_token>`, noindex + rate-limited like `/o`, resolving to
the existing order page with an explicit `event_id`, with the token minted per event.

---

## 8 · MERGING WITH `schedule-graphics`

`git diff --stat main..schedule-graphics` — 106 files, +23,939/−2,020. The overlap:

| File | Δ on branch | Collision risk for event types |
|---|---|---|
`app/manage/[token]/page.tsx` | **4,961** | 🔴 **Severe.** |
`app/api/manage/route.ts` | 542 | 🔴 High — `upsert_event` is rewritten, and it is the one insert a type must hook. |
`lib/features.ts` | 12 | 🟡 Certain but trivial — both branches add a `Feature` key. |
`app/api/menu/[truckId]/route.ts` | 17 | 🟡 Low. |
`app/api/orders/submit/route.ts` | 17 | 🟡 Low. |
`app/api/dashboard/route.ts` | 12 | 🟢 |
`scripts/harnesses.json` | 4 | 🟡 Both add harness entries — a one-line conflict. |

### 8.1 The three regions that differ most

1. **The Schedule tab has no sub-tab bar on main.** On main, `ScheduleTab`
   (`app/manage/[token]/page.tsx:6780`) takes no section prop and renders one screen. On the branch it
   is `ScheduleTab({ isActive, section, onSectionChange, … })` (`:6979`) driving
   `SCHEDULE_SECTIONS = [{events}, {weekly}]` (`:196-199`) through a `data-subtab-bar` tablist (`:8434`)
   whose flush-top behaviour depends on a `:has()` rule in `app/globals.css`.
2. **The Add event modal is rebuilt.** Main's is one scrolling box whose width depends on the import
   state (`:8181`):
   ```
   max-h-[90vh] overflow-y-auto … ${extractedEvents.length > 0 ? 'md:max-w-[980px]' : 'max-w-sm sm:max-w-lg lg:max-w-2xl …'}
   ```
   The branch replaces it with a two-pane flex column, a sticky footer, a places picker, a "Tidy up
   places" view and three shell constants — and its harness asserts main's `extractedEvents` ternary is
   **gone**. Anything event-types adds inside this modal will conflict line-for-line.
3. **Deals moved.** Main: a **top-level tab** (`activeTab === 'deals'` → `DealsTab`,
   `app/manage/[token]/page.tsx:840`). Branch: **Menu › Deals**, a pill inside Menu
   (`MENU_SECTIONS` at `:177-181`) with `LEGACY_TAB_TO_MENU_SECTION` (`:187`) keeping `?tab=deals`
   working. **Event-types code must not assume either location.**

### 8.2 How to keep the merge small

**Rule: event types own their own files, and touch shared files only in one-line mounts.**

- `lib/event-types/` — `types.ts` (the shape), `resolve.ts` (the pure resolver: type + hand changes →
  effective values), `apply.ts` (materialise), `pricing.ts` (the adjust-and-round rules). Pure, no new
  imports into existing libs. These are new files: **zero conflict**.
- `components/manage/EventTypes.tsx` — the whole editor, exported as one component. New file: **zero
  conflict**.
- `app/api/event-types/route.ts` — its own route, as `app/api/weekly-post/route.ts` is on the branch
  (and for the same stated reason: a separate route does not disturb the one every caller depends on).
  **Zero conflict.**
- **Shared-file edits, held to the minimum:** one `Feature` key in `lib/features.ts`; one mount line in
  `ScheduleTab`; one call in `upsert_event`; one line in `scripts/harnesses.json`.
- Put the `upsert_event` hook in **one named function called once** (`applyEventTypeOnCreate(...)`), so
  the merge resolves by keeping the branch's rewritten body and re-adding one call.
- For pricing, add the event dimension as a **separate exported function** beside `loadPriceBook`
  rather than changing its signature — a changed signature touches every caller.

### 8.3 How Event types should appear in Schedule on main now

Main's Schedule tab has no pill bar, and **adding one now would collide head-on** with the branch's.
So:

**Put Event types behind a button in the existing Schedule header, opening a full-screen panel from
`components/manage/EventTypes.tsx`.** One line inside `ScheduleTab`:

```tsx
{showEventTypes && <EventTypesPanel truck={truck} token={token} api={api} showToast={showToast} onClose={…} />}
```

- It needs **no sub-tab bar**, so it is unaffected by whether one exists.
- When `schedule-graphics` lands, promoting it to a third pill is adding one entry to
  `SCHEDULE_SECTIONS` and changing that one line — the panel itself does not move.
- Do **not** put it in the Add event modal on main. That modal is the most-rewritten region on the
  branch; the *type picker* for a single event has to go there eventually, but on main it should be a
  single `<select>` rendered from the event-types module, added as one line, so the merge is one line.

---

## 9 · PLANS

`lib/features.ts` is the single source of truth: a `Feature` union (`:3-30`), per-plan sets
(`PRO_FEATURES :32`, `MAX_FEATURES :56`, `TRIAL_FEATURES = [...MAX_FEATURES] :71`),
`PLAN_FEATURES: Record<Plan, Set<Feature>>` (`:74`) and `canAccess(plan, feature, featureOverrides,
trialExpiresAt)`.

Order of decision in `canAccess`:

```ts
// Per-truck override wins over everything
if (feature in featureOverrides) { return featureOverrides[feature] === true }
…
if (plan === 'trial') {
  if (!trialExpiresAt) return PLAN_FEATURES.trial.has(feature)   // not started yet
  if (new Date(trialExpiresAt) <= new Date()) return false        // expired
  return PLAN_FEATURES.trial.has(feature)
}
```

🔴 **A plan key alone will not gate this**, and `embed_schedule` says why in the registry itself
(`lib/features.ts:58-64`):

```
// 🔴 THIS IS THE PLAN HALF OF A TWO-PART GATE AND IT IS THE WEAKER HALF. TRIAL_FEATURES below is
// `[...MAX_FEATURES]`, so adding it here also grants it to plan 'trial', 'demo' and 'tester' — and
// canAccess returns the trial set when trial_expires_at is NULL, which is what self-serve signup
// writes (lib/provision-truck.ts:415). So a brand-new self-serve truck passes this check on day one.
// The gate that actually bites is `trucks.embed_enabled`, NOT NULL DEFAULT false. Both must be true.
```

**Where a new key goes:** `'event_types'` added to the `Feature` union and to `MAX_FEATURES` (or
`PRO_FEATURES`), checked server-side in the new route exactly as `app/api/weekly-post/route.ts` does on
the branch (`const blocked = gated(truck)` before every action). `lib/plan-features.ts` is
**presentation only and gates nothing** (`lib/features.ts:65-68`), so a marketing row there is a
separate decision. ⚠️ `schedule_graphics` is **not** a key on main — the branch adds it at
`lib/features.ts:25,62` — so both branches edit the same union.

---

## 10 · ZERO CHANGE FOR A TRUCK THAT NEVER CREATES A TYPE

Six places where this could go wrong, and the guarantee for each:

| # | Risk | Guarantee |
|---|---|---|
| 1 | A `NOT NULL DEFAULT` type column on `truck_events` makes every event typed | **Nullable, no default.** NULL = no type. The paid-step migration's "NULLABLE IS LOAD-BEARING, NOT LAZINESS" applies verbatim. |
| 2 | Seeding per-event rows at creation changes the `apply_to_new_events` fallback at `app/api/menu/[truckId]/route.ts:210` for everyone | **Write nothing when there is no type.** A truck with no types produces zero rows, so every read takes the path it takes today. |
| 3 | Changing `loadPriceBook`'s signature or query | **Add a second function.** `loadPriceBook(supabase, truckId)` keeps its exact shape and query; the event-aware variant wraps it and returns it unchanged when the event has no type. |
| 4 | Changing the public mappers for "Private event" | **One `if` per mapper, on a column that is NULL for every existing row**, placed after the dedup key is built (§7.1). |
| 5 | The plan gate granting it by default to trial/demo/tester (`TRIAL_FEATURES = [...MAX_FEATURES]`) | **Two-part gate**, as `embed_schedule`: plan key **and** a `NOT NULL DEFAULT false` enable column. |
| 6 | A bulk write when a type definition is edited | **Never bulk-write.** Re-apply only to events of that type, and only to values the type itself last wrote (§12). |

**How to prove it rather than assert it.** The strongest available proof is the one the branch already
uses for per-van settings: compile the tree twice and show the outputs are byte-identical. Concretely —
a harness that renders the menu API payload, the submit route's priced arrays and the three public
mappers for a truck with no types, before and after, and asserts byte equality. A typed fixture then
has to differ, or the harness proves nothing.

---

## 11 · PROPOSED DATA MODEL

`trucks.id` is **text** (a slug like `pizzeria-gusto`); `truck_events.id` is **uuid**. Every new table
carries `truck_id text`, as `truck_place_groups` and `event_post_backgrounds` do on the branch, so every
read is scoped by a column comparison rather than a join.

```sql
-- 1 · THE TYPE ITSELF
create table public.event_types (
  id             uuid primary key default gen_random_uuid(),
  truck_id       text not null references public.trucks(id) on delete cascade,
  name           text not null,                       -- 'Festival', 'Pub', 'Private hire'
  sort_order     smallint not null default 0,
  is_private     boolean not null default false,       -- drives §7
  -- PRICES
  price_mode     text not null default 'none'          -- 'none' | 'amount' | 'percent'
                 check (price_mode in ('none','amount','percent')),
  price_delta    numeric(10,2),                        -- +£ or +%
  price_rounding text not null default 'none'          -- 'none' | 'nearest' | 'up'
                 check (price_rounding in ('none','nearest','up')),
  price_scope    text not null default 'all'           -- 'all' | 'food_only'
                 check (price_scope in ('all','food_only')),
  -- SERVICE SETTINGS: NULL = do not touch this setting
  buzzer_prompt                     boolean,
  takes_cash                        boolean,
  order_ready                       boolean,
  collection_interval_mins          integer,
  operator_collection_interval_mins integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_types_name_not_blank check (length(btrim(name)) > 0)
);
create unique index event_types_truck_name_uidx on public.event_types (truck_id, lower(name));

-- 2 · PER-ITEM / CATEGORY / OPTION / DEAL RULES FOR A TYPE  (one table, discriminated)
create table public.event_type_rules (
  id        uuid primary key default gen_random_uuid(),
  truck_id  text not null references public.trucks(id) on delete cascade,
  type_id   uuid not null references public.event_types(id) on delete cascade,
  kind      text not null check (kind in ('item','category','option','deal')),
  -- ONE of these identifies the target, matching how each existing table is keyed:
  item_name   text,         -- event_item_stock.item_name
  category    text,         -- event_category_stock.category
  option_id   uuid,         -- event_option_stock.option_id
  bundle_id   uuid,         -- event_deals.bundle_id
  -- WHAT THE TYPE SAYS. NULL = do not touch.
  available   boolean,
  stock_count integer,
  no_item_cap boolean,
  price       numeric(10,2),   -- a typed per-item OVERRIDE, beating price_delta
  created_at timestamptz not null default now()
);
create index event_type_rules_type_idx on public.event_type_rules (type_id, kind);

-- 3 · THE EVENT'S TYPE, AND THE PRIVATE LINK
alter table public.truck_events
  add column if not exists event_type_id uuid references public.event_types(id) on delete set null,
  add column if not exists private_token text;
create unique index truck_events_private_token_uidx
  on public.truck_events (private_token) where private_token is not null;

-- 4 · REMEMBERED PER PLACE
--    On main there is no places table, so this is keyed the way events already are.
alter table public.truck_events
  add column if not exists event_type_source text
    check (event_type_source in ('manual','place','type'));
create table public.event_type_defaults (
  truck_id   text not null references public.trucks(id) on delete cascade,
  venue_key  text not null,       -- normalised venue_name; becomes truck_place_id after the merge
  type_id    uuid not null references public.event_types(id) on delete cascade,
  primary key (truck_id, venue_key)
);

-- 5 · THE SOURCE MARKER, on each table a type fills
alter table public.event_item_stock     add column if not exists set_by text;  -- 'truck' | 'type'
alter table public.event_category_stock add column if not exists set_by text;
alter table public.event_option_stock   add column if not exists set_by text;
-- event_deals already has `overridden boolean` and needs nothing.
```

**Notes.** `on delete set null` for `event_type_id`, never cascade — deleting a type must not delete a
truck's events. `event_type_rules` is one discriminated table rather than four, because all four are
"this target, these values" and four tables would need four readers and four RLS policies. Every new
table needs the branch's three defences: `enable row level security`, a `service_role only` policy, and
**`revoke all … from anon, authenticated, public`** — enabling RLS alone leaves Supabase's default
grants in place.

---

## 12 · HOW A TYPE IS APPLIED, AND RE-APPLIED WITHOUT LOSING HAND CHANGES

### The rule: RESOLVE ON READ, MATERIALISE ONLY WHAT MUST BE STORED

Not "fill the tables at creation". Three reasons, each from §1–§6:

1. Only one of four insert paths seeds anything today (§6), so filling at creation would add a fourth
   inconsistency rather than remove one.
2. Filling override columns is exactly what `20260730_truck_events_show_paid_step_override.sql`
   forbids (§5.1): it converts "inherit" into a concrete value and silently breaks the truck-default
   chain.
3. Stock has no counters (§3.3), so there is nothing that *needs* materialising for correctness.

So:

- **`event_type_id` on the event is the whole state.** Every effective value is computed by one pure
  function per dimension, in the order **hand change > type > template**:

  ```
  effective = eventRow(set_by='truck') ?? typeRule ?? template
  ```

  A hand change is a row (or override column) the truck wrote; `set_by = 'truck'` marks it. A type never
  overwrites one.
- **A type switch is a single column write.** Nothing to re-apply, nothing to unwind: the next read
  resolves against the new type, and every `set_by='truck'` row still wins. This is what makes
  "switch an event's type from the dashboard once it is live" safe.
- **Materialise only where a reader cannot be changed.** If a surface genuinely cannot take the
  resolver (a third-party feed, say), write rows with `set_by='type'` and **delete only
  `set_by='type'` rows** when the type changes. Never touch `set_by='truck'`, and never touch
  `event_deals` rows with `overridden = true`.
- **Orders already placed keep their prices for free** (§1.3) — price-lock is the stored
  `orders.items[].unit_price`, and a type switch does not touch the orders table.
- **Audit the adjustment** the way the operator override already does (§1.2): store the type-adjusted
  figure as `unit_price` and keep the book price beside it (`price_override` / `book_price` is the
  existing precedent), so a receipt can be explained.

**Rounding** belongs in one pure function with the money discipline the codebase already uses — pence
first, then pounds derived from the pence (`app/api/orders/submit/route.ts:515-517`), or `total` and
`total_minor` can land 1p apart.

---

## 13 · A BUILD SPLIT INTO DEPLOYABLE STAGES

Each stage is deployable from `main` on its own and is inert for a truck with no types.

| Stage | What | Why this order |
|---|---|---|
| **1** | Migration (§11 tables 1, 3, 5) + the `event_types` CRUD route + `components/manage/EventTypes.tsx` + the plan gate. **Creating a type changes nothing yet.** | Gets the schema and the gate in with zero behavioural surface. Ends with a harness proving byte-identical output for an untyped truck. |
| **2** | **Service settings** (§5). Five columns that already have per-event overrides and dashboard controls. | The cheapest dimension and the one with no customer-money risk. Proves the resolver end to end. |
| **3** | **Which items are sold + stock** (§2, §3). `event_type_rules` for item/category/option. | Already sparse overrides with a server gate; no counters. |
| **4** | **Deals** (§4). Types select bundles; `overridden` already protects hand changes. | Smallest change, but it sits in the file the branch moves (Menu › Deals), so late. |
| **5** | **Private hire** (§7). `is_private`, `private_token`, the mapper substitutions, the private route with its noindex + rate-limit registrations, the QR. | Independent of pricing; can ship before or after stage 6. |
| **6** | **Prices** (§1, the flagged gap). The event-aware price book beside `loadPriceBook`, the menu API's price leg, rounding, typed per-item overrides, and **refusing typed pricing when the event is ambiguous** (§1.4). | Largest, riskiest, and the only one that can charge a customer the wrong amount. Last, with the other five already proven. |

Stages 2–4 each also need the picker — one `<select>` in the Add event modal and one on the dashboard
event bar, both rendered from the event-types module (§8.2) so the merge stays one line.

---

## 14 · RISKS

1. 🔴 **Ambiguous events mis-price.** The no-id fallbacks (§1.4) pick "the earliest" event, and the two
   resolvers order differently. With types deciding price this becomes a wrong charge. Mitigation:
   typed pricing refuses when more than one candidate event exists, and the two resolvers are made to
   agree first.
2. 🔴 **Pricing has to be built, not filled** (the flag). Budget stage 6 as its own project.
3. 🔴 **`app/manage/[token]/page.tsx` conflicts.** 4,961 lines differ. Mitigation: §8.2 — own files, one-line
   mounts, and the type picker as a single `<select>`.
4. 🟡 **Deals' time windows are client-only** (§4.3). A type that controls deals inherits that gap; if a
   festival type is meant to *restrict* deals, the restriction is advisory until the server enforces it.
5. 🟡 **Seeding breaks the inherit chain** (§5.1). Mitigation: resolve on read.
6. 🟡 **The plan gate leaks to trial/demo/tester** (§9). Mitigation: two-part gate.
7. 🟡 **`event_category_stock.category` case** — read lowercased, written as sent (§3.3). A type-fill must
   normalise or it will write rows the reader cannot see.
8. 🟡 **Private events could be indexed** if the new route misses the `vercel.json` noindex and the
   `proxy.ts` rate-limit entry that `/o` documents (§7.2).
9. 🟢 **Demo trucks.** Path 4 must stay typeless, or every demo shows a half-built feature.

---

## 15 · DECISIONS I NEED FROM YOU

1. **Does a type change prices on an event that is already live?** Price-lock protects placed orders,
   but switching a live event's type would re-price the *next* order mid-service. Allow, or freeze
   pricing once an event opens?
2. **What does "food-only" mean, in data?** There is no food/drink flag on `menu_items_db` that I
   found. Is it a category list per type, a new column on items, or a per-type rule set?
3. **Rounding: nearest £1 or always up — per type, or one truck-wide setting?** And does it apply to
   the line price or the order total? (Line, I'd assume, so the menu can show it.)
4. **Do typed prices show on the public menu, or only at checkout?** Showing them means the menu API
   must resolve the type (and ambiguous events become a visible problem, not just a billing one).
5. **"Remembered per place" — before or after `schedule-graphics`?** Main has no places table, so stage
   1 would remember by normalised venue name and migrate to `truck_place_id` later. Acceptable?
6. **Private hire: does it keep a map pin for the operator's own dashboard?** I have assumed public
   surfaces only.
7. **Private link: one per event, or one per truck reused?** One per event is safer (revocable) and is
   what §11 proposes.
8. **Plan tier** — Pro or Max? And does an expired trial keep types (the registry notes this is an open
   question for every feature, `lib/features.ts` `canAccess`)?
9. **Which setting wins if a type says one thing and the truck already set that event by hand?** I have
   proposed the hand change wins always. Confirm.
10. **Should a type be able to set a *lower* price (a discount), or only `+`?** The brief says "+£ or
    +%" throughout; `numeric` allows negatives, and a check constraint is cheap if you want it refused.

---

## 16 · READ-ONLY SQL I NEED YOU TO RUN

These answer questions the code cannot. All are `select` only. They are repeated in the chat reply.

**(1) Same-day event collisions — how big the §1.4 risk actually is.** If this returns nothing, typed
pricing can resolve by date safely today; every row is a pair that would mis-price.

```sql
select truck_id, event_date, count(*) as events_that_day,
       array_agg(venue_name order by start_time) as venues,
       array_agg(start_time  order by start_time) as starts
from public.truck_events
where status in ('confirmed','open')
group by truck_id, event_date
having count(*) > 1
order by events_that_day desc, event_date desc
limit 50;
```

**(2) How much per-event stock is really used.** Tells me whether trucks lean on these tables (so a
type must respect many hand changes) or barely touch them.

```sql
select 'event_item_stock' as tbl, count(*) as rows, count(distinct event_id) as events,
       count(distinct truck_id) as trucks,
       count(*) filter (where available = false) as marked_unavailable,
       count(*) filter (where stock_count is not null) as with_a_ceiling
from public.event_item_stock
union all
select 'event_category_stock', count(*), count(distinct event_id), count(distinct truck_id),
       count(*) filter (where available = false),
       count(*) filter (where stock_count is not null)
from public.event_category_stock
union all
select 'event_option_stock', count(*), count(distinct event_id), count(distinct truck_id),
       count(*) filter (where available = false),
       count(*) filter (where stock_count is not null)
from public.event_option_stock;
```

**(3) Which per-event override columns are already set.** Every non-zero count is a hand change a type
must never overwrite (§12).

```sql
select count(*) as upcoming_events,
       count(order_ready_override)                      as order_ready_set,
       count(takes_cash_override)                       as takes_cash_set,
       count(show_paid_step_override)                   as paid_step_set,
       count(buzzer_prompt)                             as buzzer_prompt_set,
       count(collection_interval_mins_override)         as customer_interval_set,
       count(operator_collection_interval_mins_override) as operator_interval_set,
       count(completion_presses_override)               as presses_set
from public.truck_events
where event_date >= current_date;
```

**(4) `truck_events`' real column list.** §1.3 is the union of what the app *selects*; this is what the
table actually has, which I need before proposing columns on it.

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'truck_events'
order by ordinal_position;
```

**(5) Deals with a time window set.** Sizes the §4.3 gap — how many deals rely on a window that only
the browser enforces.

```sql
select count(*) as bundles,
       count(*) filter (where start_time is not null or end_time is not null) as with_a_window,
       count(*) filter (where apply_to_new_events) as auto_apply,
       count(distinct truck_id) as trucks
from public.bundles_db
where is_available = true;
```

**(6) Village Spice's current shape** — the test truck, so I know what I can exercise locally.

```sql
select e.id, e.event_date, e.start_time, e.end_time, e.status, e.venue_name, e.town,
       e.van_id,
       e.order_ready_override, e.takes_cash_override, e.buzzer_prompt,
       e.collection_interval_mins_override,
       (select count(*) from public.event_deals d where d.event_id = e.id) as deal_rows,
       (select count(*) from public.event_item_stock s where s.event_id = e.id) as item_stock_rows
from public.truck_events e
where e.truck_id = 'village-spice'
order by e.event_date desc
limit 30;
```

**(7) Orders attached by the date fallback rather than by id.** A high count means the no-id path is
well travelled, which raises the §1.4 risk from theoretical to likely.

```sql
select count(*) as orders_total,
       count(event_id) as with_an_event_id,
       count(*) - count(event_id) as without_an_event_id
from public.orders
where created_at >= now() - interval '90 days';
```
