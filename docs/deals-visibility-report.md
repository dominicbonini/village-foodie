# Deal visibility — re-traced

**Date:** 4 August 2026. **Read-only.** Nothing changed, no SQL run, no migration.

---

## THE HEADLINE: MY EARLIER FINDING WAS WRONG

> **WRONG:** *"an operator who sets a deal to Off is not hiding it from customers, because the customer
> menu route never filters `bundles_db.is_available` and hardcodes `available: true`."*

**Withdrawn.** The two facts it rests on are true — the menu route really does not filter on
`is_available`, and it really does emit `available: true` — but the conclusion drawn from them does not
follow, because **the gate is not in the read path at all.**

### What I misread

**I traced only the READ layer and concluded from an absence.** `is_available` is enforced one hop
upstream, at the **WRITE** layer — when `event_deals` rows are seeded at event creation:

```ts
// app/api/manage/route.ts:691-708, inside upsert_event
const { data: bundles } = await supabase
  .from('bundles_db')
  .select('id, apply_to_new_events')
  .eq('truck_id', targetTruckId)
  .eq('is_available', true)          // 🔴 THE FILTER I MISSED
```

A deal with `is_available = false` **never gets an `event_deals` row**, so it can never be `active` on
an event, so the menu route's `activeBundleIds` filter never lets it through. The menu route does not
need to check `is_available` because a deal that fails it cannot reach the set the menu route is
filtering.

I grepped `is_available` inside `app/api/menu/[truckId]/route.ts`, found only item-related hits, and
stopped. I never asked **how `event_deals` rows come to exist** — which is where the answer was. That is
precisely "traced the wrong layer".

**Dominic's model is correct and is what the code implements:** deals are manual until attached to an
event, enabled per event, with an add-to-all-events option.

---

## X1. THE COMPLETE PATH A DEAL TAKES TO A CUSTOMER

### The route the customer actually hits

`app/trucks/[slug]/order/page.tsx:550` fetches
`` `/api/menu/${slug}?event_id=${event.id}` `` — **always with an explicit `event_id`**. So the customer
path always runs the event-scoped branch; the "auto-detect the current open event" branch is for callers
that omit it.

### Every filter, in order

| # | Filter | Where |
|---|---|---|
| 1 | **Seeding gate — `is_available = true`.** At event creation, `event_deals` rows are created only for bundles that pass this. | [app/api/manage/route.ts:696](app/api/manage/route.ts#L696) |
| 2 | **Seeding value — `active: bundle.apply_to_new_events`.** The seeded row's `active` IS the deal's add-to-all-events default. | [app/api/manage/route.ts:701](app/api/manage/route.ts#L701) |
| 3 | **Per-event override — `update_event_deal`** upserts `{ active, overridden: true }` for one event+bundle. | [app/api/manage/route.ts:748-754](app/api/manage/route.ts#L748-L754) |
| 4 | **Fetch** — all bundles for the truck, unfiltered. | [app/api/menu/[truckId]/route.ts:88](app/api/menu/[truckId]/route.ts#L88) |
| 5 | **Event resolution** — `event_id` param used directly; a non-`confirmed`/`open` event 404s the whole response for a customer. | [:136-160](app/api/menu/[truckId]/route.ts#L136-L160) |
| 6 | 🔴 **THE CUSTOMER GATE.** For `!isDashboard`: if `event_deals` rows exist for the event → keep only `active` ones. If **no** rows exist → fall back to `filter(b => b.apply_to_new_events)`. | [:182-207](app/api/menu/[truckId]/route.ts#L182-L207) |
| 7 | **Stock check** — drop bundles where any slot category has no available, in-stock item. | [:200-211](app/api/menu/[truckId]/route.ts#L200-L211) |
| 8 | **Emit** — `available: true` hardcoded; `start_time`/`end_time` passed through. | [:597-611](app/api/menu/[truckId]/route.ts#L597-L611) |

### 🔴 For a deal to reach a customer, ALL of these must be true

1. The event is `confirmed` or `open`; **AND**
2. **either** an `event_deals` row exists for (this event, this deal) with `active = true`,
   **or** no `event_deals` rows exist for the event at all **and** the deal has
   `apply_to_new_events = true`; **AND**
3. every slot category on the deal has at least one item that is `is_available` and in stock; **AND**
4. — for the row in (2) to have been created at all — the deal had `is_available = true` **at the moment
   that event was created**.

Condition 4 is the one I missed. It is a historical condition, not a current one, which is exactly why
grepping the read path could not find it.

⚠️ **`start_time` / `end_time` are NOT a filter.** `getBundleAvailabilityMessage`
([app/trucks/[slug]/order/page.tsx:80](app/trucks/[slug]/order/page.tsx#L80)) computes an "Available
from…" label — and **`grep` finds no caller anywhere in the codebase**. It is dead code; the only other
mention is a comment in `lib/preorder.ts:9` noting the pattern it belongs to. The window renders as a
label in DealsTab and is otherwise unenforced. Reported, not claimed as a defect — it may be intentional
for now.

---

## X2. DOES `is_available` ACTUALLY MATTER?

**Yes. It is a real customer-visibility gate**, enforced at seeding time.

### (a) Is there a sequence where a deal reaches a customer with `is_available = false`?

**Yes — one, and it is a consequence of the design rather than a bug.** `is_available` is checked when
an event is created and **never re-checked afterwards**. `upsert_bundle` is a blind
`update(fields)` ([app/api/manage/route.ts:637](app/api/manage/route.ts#L637)) that does not touch
`event_deals`, and nothing else deletes or deactivates those rows — verified: the only three
`from('event_deals')` sites in the codebase are the menu route's read, the seeding upsert, and
`update_event_deal`.

**The concrete sequence:**

1. Deal created with `is_available: true, apply_to_new_events: true` (the `emptyBundle` defaults).
2. Operator creates an event → `event_deals` row written with `active: true`.
3. Operator later opens Deals and sets the deal to **Off** (`is_available = false`).
4. The `event_deals` row from step 2 is untouched → **the deal still shows on that already-created
   event.**

There is a second, narrower path: an event with **no** `event_deals` rows at all (created before this
seeding code existed, or where the upsert failed) falls through to
`filter(b => b.apply_to_new_events)` at [:205](app/api/menu/[truckId]/route.ts#L205), which does **not**
consult `is_available`.

### (c) How likely is that in normal use?

**Plausible, and worth knowing about.** An operator ending a promotion would reasonably toggle it Off in
the Deals tab and expect it to stop appearing — including on the event running tomorrow, which was
created last week. Under the per-event model the correct action is the per-event toggle on the Schedule
tab, and Off means "stop adding this to new events".

**That is a coherent design, not a fault**, and it is the model Dominic described. The only thing I would
flag is the *word*: a badge reading "Off" alongside a deal that is still live on three scheduled events
is doing a lot of work with two letters. X6's queries below will show whether any truck is currently in
that state — if none is, this is theoretical.

### (b) Was the earlier finding wrong?

**Yes — WRONG, and withdrawn.** See the headline. The claim "Off does not hide it from customers" is
false in the ordinary case: for every event created *after* the flag is set, an Off deal is never seeded
and is invisible. It is true only for events that already carried the deal, which is a different and much
narrower statement than the one I made.

---

## X3. WHAT THE Active/Off BADGE DESCRIBES

**Every read and write of `bundles_db.is_available`:**

| Site | Kind | What it does |
|---|---|---|
| [app/api/manage/route.ts:696](app/api/manage/route.ts#L696) | **read — the gate** | `.eq('is_available', true)` when seeding `event_deals` at event creation |
| [app/api/manage/route.ts:637/641](app/api/manage/route.ts#L637) | write | `upsert_bundle` passes it through with the rest of the form |
| [app/manage/[token]/page.tsx:6046](app/manage/[token]/page.tsx#L6046) | write | `emptyBundle` default `true` |
| [app/manage/[token]/page.tsx:6090](app/manage/[token]/page.tsx#L6090) | read | the `Active`/`Off` badge |
| [app/manage/[token]/page.tsx:59](app/manage/[token]/page.tsx#L59) | type | the `Bundle` interface |

It is **not** a per-event flag (that is `event_deals.active`), **not** a time window (that is
`start_time`/`end_time`), and **not** a soft delete (`delete_bundle` hard-deletes the row at
[:648](app/api/manage/route.ts#L648)).

**It is a template-level customer-visibility flag: "should this deal be put on events at all?"**

### 🔴 The claim that the badge lies is WITHDRAWN

It accurately describes the thing it governs. "Active" means this deal is in the pool that events draw
from; "Off" means it is not, and no future event will carry it. The badge is doing its job.

The one nuance worth recording — and it is a nuance, not a lie — is that Off is **forward-looking**: it
stops the deal reaching *new* events and does not retract it from events already created. Anyone editing
this copy should know that; it does not make the current label wrong.

---

## X4. THE add-to-all-events OPTION

**`apply_to_new_events` IS that option.** It is not something separate.

* **Where:** DealsTab renders it as an **`Auto-apply` / `Manual`** pill beside the Active/Off badge
  ([app/manage/[token]/page.tsx:6091-6097](app/manage/[token]/page.tsx#L6091-L6097)).
* **What writes it:** `update_bundle_default { bundleId, applyToNewEvents }`
  ([app/api/manage/route.ts:756-762](app/api/manage/route.ts#L756-L762)), and `upsert_bundle` carries it
  in the form.
* **What it does:** it is copied into the seeded row's `active` value —
  `active: bundle.apply_to_new_events` ([:701](app/api/manage/route.ts#L701)). So `Auto-apply` ⇒ every
  new event starts with the deal ON; `Manual` ⇒ every new event starts with it OFF, and the operator
  turns it on per event.

⚠️ **It applies to NEW events only.** Seeding happens once, inside `upsert_event`'s insert branch.
Flipping a deal to `Auto-apply` does **not** retro-add it to events that already exist — for those, the
per-event toggle is the mechanism. The naming ("apply to **new** events") is accurate.

**The per-event control** is the Schedule tab's deals accordion
([app/manage/[token]/page.tsx:6861-6900](app/manage/[token]/page.tsx#L6861-L6900)) — a toggle per deal
per event calling `handleEventDealToggle` → `update_event_deal`, which sets `overridden: true`. Its
displayed state resolves exactly as the customer route does:
`eventDeal ? eventDeal.active : bundle.apply_to_new_events` — the same fallback, so the operator's view
and the customer's cannot disagree.

**So the three controls map cleanly onto the three layers:**

| Control | Column | Scope |
|---|---|---|
| Active / Off | `bundles_db.is_available` | the template — does this deal go on events at all |
| Auto-apply / Manual | `bundles_db.apply_to_new_events` | the default for **new** events |
| Schedule tab toggle | `event_deals.active` | one event |

---

## X5. UPSELLS

**Nothing is wrong, and the suggestion is withdrawn.**

Re-read end to end: `upsert_upsell_rule` writes `trigger_category`, `suggest_category`,
`max_suggestions`, `show_at_checkout` ([app/api/manage/route.ts:446-462](app/api/manage/route.ts#L446-L462));
the menu route selects them unfiltered ([:93](app/api/menu/[truckId]/route.ts#L93)); the order page
matches `r.trigger_category === item.category` and then filters candidates by
`i.category === rule.suggest_category && i.available`
([app/trucks/[slug]/order/page.tsx:730-740](app/trucks/[slug]/order/page.tsx#L730-L740)).

My earlier report described this correctly as a mechanism and then **proposed adding an `is_active`
column, which was a solution to a problem Dominic had not stated.** Live-on-save is the intended design.
Judged against that intent:

* A rule is a **suggestion**, not a published object. It shows nothing on its own — it only surfaces
  items that are already on the menu and already available.
* A rule pointing at an empty or deleted category **degrades to nothing**: the candidate filter returns
  an empty array and no suggestion renders. No error, no broken UI, no orphan.
* `max_suggestions` bounds the output; `show_at_checkout` places it. Neither can produce a bad state.
* Deleting a rule is immediate and total.

**There is no defect here, and no migration is warranted.** I withdraw the proposed
`upsell_rules.is_active` column.

---

## X6. THE QUERIES THAT WOULD SETTLE IT

The one live check that matters — is any truck actually in the X2(a) state, i.e. a deal switched Off but
still active on a real event?

```sql
select t.name                as truck,
       b.name                as deal,
       b.is_available,
       b.apply_to_new_events,
       e.event_date,
       e.status,
       ed.active             as active_on_this_event,
       ed.overridden
from event_deals ed
join bundles_db   b on b.id = ed.bundle_id
join truck_events e on e.id = ed.event_id
join trucks       t on t.id = b.truck_id
where b.is_available = false
  and ed.active = true
  and e.event_date >= current_date
  and e.status in ('open', 'confirmed')
order by t.name, e.event_date;
```

**Empty result ⇒ nobody is affected and X2(a) is theoretical.** Any row is a deal an operator has
switched Off that a customer can still see on an upcoming event.

The narrower fallback case — an upcoming event with **no** `event_deals` rows at all, where the menu
route falls through to `apply_to_new_events` and skips `is_available` entirely:

```sql
select t.name as truck, e.id as event_id, e.event_date, e.status,
       count(ed.id) as event_deal_rows,
       (select count(*) from bundles_db b
         where b.truck_id = t.id and b.apply_to_new_events) as would_show_via_fallback
from truck_events e
join trucks t on t.id = e.truck_id
left join event_deals ed on ed.event_id = e.id
where e.event_date >= current_date
  and e.status in ('open', 'confirmed')
  and t.id not like 'demo-%'
group by t.name, e.id, e.event_date, e.status, t.id
having count(ed.id) = 0
order by t.name, e.event_date;
```

And the plain state-of-play for the two live trucks, to confirm the model is behaving as described:

```sql
select t.name as truck, b.name as deal, b.is_available, b.apply_to_new_events,
       b.start_time, b.end_time,
       count(ed.id)                              as events_carrying_it,
       count(ed.id) filter (where ed.active)     as events_showing_it
from bundles_db b
join trucks t on t.id = b.truck_id
left join event_deals ed on ed.bundle_id = b.id
where t.id not like 'demo-%'
group by t.name, b.id, b.name, b.is_available, b.apply_to_new_events, b.start_time, b.end_time
order by t.name, b.name;
```

---

## SUMMARY OF WHAT CHANGED IN MY UNDERSTANDING

| Earlier claim | Status |
|---|---|
| The menu route does not filter `bundles_db.is_available` | **True** — but it does not need to |
| The menu route hardcodes `available: true` for bundles | **True** — and irrelevant to visibility |
| "Off does not hide a deal from customers" | **WRONG.** Off means it is never seeded onto any new event, so it is invisible on every event created after the flag was set |
| "The Active/Off badge is cosmetic / lies" | **WRONG, withdrawn.** It accurately describes a template-level visibility gate |
| "Deals publish on save with no draft state" | **Misleading.** `Manual` (`apply_to_new_events = false`) is exactly that draft state, and it is already surfaced in the UI |
| "Change `emptyBundle` to `apply_to_new_events: false`" | Now a **product preference**, not a fix — the mechanism it would use already works as designed |
| "Add `upsell_rules.is_active`" | **Withdrawn.** Live-on-save is intended and nothing about upsells is broken |

The one thing I would still put in front of Dominic is X2(a) — Off being forward-looking only — and the
first query above says whether that is affecting anyone today or is purely theoretical.
