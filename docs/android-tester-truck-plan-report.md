# Android Tester truck — READ AND PLAN ONLY

**Nothing was created, inserted, updated or deleted.** No SQL was written. No route was invoked, no
database was queried, no build was run. The only file written is this report.

🔴 **`test-truck-3-2` ("Apple Tester") WAS NOT TOUCHED, READ OR QUERIED.** It is under live Apple review.
The final section states which proposed steps go near it. **The answer is none.**

**Prompt integrity:** no span arrived garbled and no instruction contradicted another. ("Create nothing"
and "write your report to `docs/…`" are consistent — the report is the sanctioned output.)

## Which of the three I did — plainly

**None of them.** No parse, no typecheck, no execution. File reads and greps only.

⚠️ **AND IT BOUNDS ITEM 6.** The core tables — `trucks`, `truck_vans`, `menu_categories`,
`menu_items_db`, `truck_events`, `operators` — **have no `CREATE TABLE` in `supabase/migrations/`**; they
predate the migrations directory. A `grep` for each returns *"no CREATE TABLE in migrations"*. **So the
authoritative constraint list cannot be read from source**, and §6 reports only what code demonstrably
depends on. Everything there is marked accordingly.

---

## 1. Exactly what `provisionTruck` writes to `trucks`

`lib/provision-truck.ts:395-470`. Every column it sets, in order:

| Column | Value | Source |
|---|---|---|
| `id` | `identity.id` | `operatorIdentity` → `createSlug(slug ?? name)` (+ `-N` on collision) |
| `slug` | `identity.slug` | same string as `id` |
| `name` | `name` or `` `Demo Kitchen (${…})` `` | `:390` |
| `dashboard_token` | `` `${suffixed.slice(0,24)}-${randomBytes(6).toString('hex')}` `` | `:309` |
| `dashboard_pin` | **`null`** | `:404` — *"verifyToken … REJECTS when a pin is set and unmatched"* |
| **`sheet_id`** | **`''`** | 🔴 see below |
| `active` | `true` | `:410` |
| `plan` | `opts.plan ?? profile.plan` | `:346` — **overridable** |
| **`trial_expires_at`** | 🔴 **`null`, unconditionally** | `:415` |
| `operator_id` | `null` | `:416` — *"set afterwards by /api/admin/create-operator"* |
| `contact_email` | `opts.contactEmail ?? null` | `:417` |
| `contact_phone` | `contactPhone` | `:429` |
| `whatsapp` | `contactPhone ?? ''` | `:430` — ⚠️ *"FALLS BACK TO `''` AND NEVER TO null"* |
| `phone_is_whatsapp` | from opts | `:431` |
| `preferred_contact_method` | `'whatsapp'` / `'phone'` / `null` | `:436` |
| `cuisine_type` | `opts.cuisineType ?? null` | `:437` |
| `truck_emoji` | **key omitted entirely when no cuisine** | `:449` |
| `truck_order_email_enabled` | profile (`operator`: `true`) | `:450` |
| `auto_accept` | profile (`operator`: `true`) | `:451` |
| `allergen_display_mode` | profile (`operator`: `null`) | `:452` |
| `preorders_enabled` | profile (`operator`: `false`) | `:455` |
| `notes_require_review` | profile (`operator`: `true`) | `:459` |
| `show_paid_step` | profile (`operator`: `true`) | `:460` |
| `takes_cash` | profile (`operator`: `false`) | `:461` |
| `completion_presses` | profile (`operator`: `'two'`) | `:465` |
| `default_auto_open` | `true` | `:467` |
| `default_auto_close` | `true` | `:468` |
| `show_on_vf`, `show_on_hg`, `order_link_vf`, `order_link_hg`, `is_customer`, `excluded` | `...visibilityCols` | `:469` |

### The NOT NULL columns with no default that a hand-created row would have to supply

**Only one is named in source, and it is a landmine** — `:405-409`, verbatim:

```ts
        // 🔴 LEGACY LANDMINE: trucks.sheet_id is NOT NULL with NO DEFAULT (a dead Google Sheets column —
        // it is referenced only as a type field in lib/supabase.ts and read nowhere at runtime). ANY insert
        // omitting it FAILS. Empty string is the established convention: the live test-truck row carries
        // sheet_id = '' (verified July 2026), which also confirms there is no unique index on the column.
        sheet_id: '',
```

⚠️ **`trucks.whatsapp` USED to be NOT NULL and no longer is** — `:424-428` records a live 400 caused by
sending `null`, and notes *"The DROP NOT NULL has since been applied … so null would work today"*. The
code still writes `''` to match the app's own convention.

🔴 **CANNOT DETERMINE the complete NOT NULL set** — no `CREATE TABLE` exists in the repository. **What is
certain is that `provisionTruck` succeeds today**, so the 27 columns above are a sufficient set. **That
is the strongest available argument for using the route rather than hand SQL.**

### Visibility — and the one that decides the whole plan

```ts
const HIDDEN_VISIBILITY = {
  show_on_vf: false,
  show_on_hg: false,      // DB default is TRUE — must override
  order_link_vf: false,
  order_link_hg: false,   // DB default is TRUE — must override
  is_customer: false,
  excluded: true,         // master hide
} as const
```

`:359` — `const visibility = opts.visibility ?? 'hidden'`. **A truck created without an explicit
`visibility` is fully hidden.**

✅ **AND A HIDDEN TRUCK'S DIRECT ORDER LINK STILL WORKS.** `app/api/menu/[truckId]/route.ts:33-44`
resolves the truck by `slug` then `id` with **no visibility filter at all**, and
`app/api/orders/submit/route.ts:206-217` filters on **`.eq('active', true)` only**. **So `hidden` gives a
reviewer a working order page that is absent from the public map and directory** — which is what a tester
truck wants. *(Read from source; not exercised.)*

---

## 2. What it creates beyond `trucks`, and what it does NOT

**Creates exactly one more row: a van.** `:501-521`:

```ts
      .from('truck_vans')
      .insert({
        truck_id: truckId,
        name: vanOpts.name?.trim() || 'Van 1',       // NOT NULL, no default
        active: true,
        kitchen_capacity: 'kitchen_capacity' in vanOpts ? vanOpts.kitchen_capacity : 5,
        …
        buzzer_count: profile.buzzerCount,
      })
```

⚠️ **`capacity_window_mins` is omitted deliberately** — `:510` records it as *"NOT NULL DEFAULT 5"*.
⚠️ **`kds_token` is omitted deliberately** — `:514` records the DB default
`encode(gen_random_bytes(24),'hex')`.

**A van failure rolls the truck back** (`:523-531`, `deleteTruckCascade`) — *"fails LOUDLY AND COMPLETELY
instead of half-succeeding quietly."*

### What it does NOT create — the scope line, verbatim (`:9-12`)

```ts
// SCOPE: truck + van. Event creation is deliberately NOT here — events are recurring where trucks are
// one-shot, and `upsert_event` (app/api/manage/route.ts) already handles slot_capacity generation, the
// production_slot_usage rebuild and event_deals seeding correctly. Duplicating that would fork the slot
// engine.
```

🔴 **No menu. No events. No slot capacity. No orders. No operator. No login.**

🔴 **AND THE ADMIN ROUTE HARDENS ONE MORE THING** — `app/api/admin/create-truck/route.ts:83-97`:

```ts
  // ⚠️ THE VAN IS BUILT HERE NOW, NOT FORWARDED FROM THE BODY, AND CAPACITY IS ALWAYS AN EXPLICIT NULL.
  …
  const van: ProvisionTruckOptions['van'] = {
    ...(vanName ? { name: vanName } : {}),
    kitchen_capacity: null,
  }
```

**So a truck created through the admin console gets a van with `kitchen_capacity = null`.** Its own
comment at `:88-89` states the consequence: *"a vanless truck has an inert capacity engine because
upsert_event only writes slot_capacity when the event's van carries one."* **The same is true of a van
with a null capacity.** This is the single most likely thing to be missed.

---

## 3. Every table needing rows, with required columns and foreign keys

Required columns are taken from **what the app's own inserts supply** — the only source available.

| # | Table | Required columns (as the app writes them) | Foreign keys |
|---|---|---|---|
| 1 | **`trucks`** | the 27 in §1; `sheet_id` mandatory | — |
| 2 | **`truck_vans`** | `truck_id`, `name` (NOT NULL no default), `active`; `kitchen_capacity` **must be non-null for slots** | `truck_id → trucks(id)` |
| 3 | **`menu_categories`** | `truck_id`, `name`, `slug`, `prep_secs`, `batch_size`, `counts_toward_capacity`, `allow_notes`, `sort_order`, `is_active` | `truck_id → trucks(id)` |
| 4 | **`menu_items_db`** | `truck_id`, `name`, `description`, `price`, `category_id`, `is_available`, `sort_order`, `allergens`, `allergens_verified`, `dietary_info`, `spiciness`, `auto_accept` | `truck_id → trucks(id)`, **`category_id → menu_categories(id)`** |
| 5 | `modifier_groups` / `modifier_options` / `item_modifier_groups` | optional — only if the reviewer should see modifiers | `truck_id`, and the link table joins item ↔ group |
| 6 | **`truck_events`** | `truck_id`, `venue_name`, `town`, `postcode`, `address`, `event_date`, `start_time`, `end_time`, `notes`, `latitude`, `longitude`, `van_id`, `order_ready_override`, `source: 'manual'`, `status`, `confirmed_at`, `auto_open`, `auto_close` | `truck_id → trucks(id)`, **`van_id → truck_vans(id)`** |
| 7 | **`slot_capacity`** | generated by `upsert_event` — **only when the van has `kitchen_capacity`** | `truck_id`, `event_date` |
| 8 | `production_slot_usage` | rebuilt after orders exist | `truck_id`, `event_date`, event key |
| 9 | **Supabase Auth user** | email + password | — |
| 10 | **`operators`** | `auth_user_id`, `email`, `name` | `auth_user_id → auth.users` |
| 11 | **`trucks.operator_id`** | the link that makes the login see the truck | `→ operators(id)` |
| 12 | `orders` | only if the dashboard/KDS should look populated | `truck_id`, `event_id` |
| 13 | `truck_users` | only for a second/staff login | `truck_id`, `auth_user_id` |

The `truck_events` insert, verbatim — `app/api/manage/route.ts:687`:

```ts
      const { data, error } = await supabase.from('truck_events').insert({ truck_id: targetTruckId, venue_name, town: town ?? null, postcode: postcode ?? null, address, event_date, start_time, end_time, notes, latitude: latitude ?? null, longitude: longitude ?? null, van_id: resolvedVanId ?? null, order_ready_override: seededOrderReady, source: 'manual', status: eventStatus, confirmed_at: eventStatus === 'confirmed' ? now : null, auto_open: truck.default_auto_open ?? true, auto_close: truck.default_auto_close ?? true }).select().single()
```

🔴 **ORDERING IS FORCED BY THE FOREIGN KEYS: van before events; categories before items.**

---

## 4. `/api/admin/create-operator`, step by step — and the password IS readable

`app/api/admin/create-operator/route.ts`:

1. **`:19-32` — admin gate.** Reads the caller's session, then
   `from('operators').select('is_admin').eq('auth_user_id', user.id).single()`.
2. **`:38-43` — reads the truck's name** for the welcome email. ⚠️ **This is a READ of `trucks` by the id
   you pass. It touches only that truck.**
3. **`:45` — generates the password.** `:11-16`, verbatim:

```ts
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 12 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
}
```

   **12 characters, unambiguous alphabet (no I/l/O/0/1).** ⚠️ **`Math.random()`, not `crypto`** — fine
   for a temporary credential that must be changed, worth knowing it is not cryptographically random.
4. **`:48-53` — creates the Auth user.** `email_confirm: true` (no verification step) and
   `user_metadata: { must_change_password: true }`.
5. **`:60-68` — inserts the `operators` row**, `name` derived as `email.split('@')[0]`.
6. **`:75-78` — links it: `trucks.update({ operator_id }).eq('id', truckId)`.**
7. **`:94-101` — 🔴 A SIDE EFFECT ON A DIFFERENT TABLE.** Sets `discovery_trucks.excluded = true` for
   **any** row whose name matches the truck's, case-insensitively (`.ilike('name', shadowName)`).
   Best-effort, never blocks. **Harmless for a uniquely-named tester truck; not harmless if the name
   collides with a real scraped business.**
8. **`:103-126` — emails the password via Brevo.**
9. **`:158` — returns `{ ok: true, tempPassword, operatorId }`.**

### 🔴 Is the password surfaced anywhere readable? **YES — no reset is needed.**

Three places:

- **The JSON response** — `:158`, `tempPassword` in the body.
- **The admin UI, on screen, with a copy button** — `app/admin/page.tsx:631` stores it
  (`setCreatedPassword(data.tempPassword)`) and `:1443-1455` renders it:

```jsx
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Temporary password — copy this now
                  </label>
                  <div className="mt-1 flex gap-2">
                    <code className="flex-1 bg-slate-100 rounded-xl px-3 py-2.5 text-sm font-mono">
                      {createdPassword}
                    </code>
                    <button onClick={() => navigator.clipboard.writeText(createdPassword!)} …>
                      Copy
                    </button>
```

- **The welcome email** to the address supplied.

⚠️ **BUT `must_change_password: true` IS SET**, so the first login is expected to force a reset. **CANNOT
DETERMINE from this route whether the reviewer-facing flow blocks until that happens** — that is
`/login`'s behaviour, not read here. **If the credential must remain stable for a store reviewer, that is
the one thing to verify before handing it over.**

⚠️ **THE TRUCK LINK FAILS SOFT** — `:80-88` returns **`ok: true`** with a `warning` field if the
`operator_id` update fails. **A "success" response can leave an account that reaches no truck.**

---

## 5. Does an admin UI exist, and what does it cover?

✅ **Yes — and between the admin console and Manage, the entire structure can be built with NO SQL.**

**Admin console (`/admin`)** — four POSTs, `app/admin/page.tsx`:

| Line | Endpoint | Covers |
|---|---|---|
| `:472` | `/api/admin/create-truck` | **truck + van** |
| `:623` | `/api/admin/create-operator` | **login + link** |
| `:594` | `/api/admin/provision-demo` | ⚠️ **not usable here — produces a `demo-` truck (see §7)** |
| `:551` | `/api/admin/delete-truck` | 🔴 **destructive — not part of this plan** |

Plus the **edit modal**, which sets `plan` and `trial_expires_at` (`:640-652`) and posts to
`/api/admin/route.ts:93`, an **unallowlisted** `.update(updates)` on `trucks`.

🔴 **THE ADMIN CONSOLE CREATES NO MENU AND NO EVENTS.** A grep of `app/admin/page.tsx` for
`menu_items_db|menu_categories|truck_events|upsert_event` returns **only a comment**.

**Manage (`/manage/<dashboard_token>`)** covers the rest. `app/api/manage/route.ts` exposes, among 48
actions: **`upsert_category`, `upsert_item`, `upsert_modifier_group`, `upsert_modifier_option`,
`set_item_modifier_group`, `add_van`, `update_van_settings`, `upsert_event`, `save_slot_capacity`.**

**So the only thing with no UI is bulk orders** — and a hand-SQL precedent for exactly that already exists
in `docs/seed-apple-tester-orders.sql`.

---

## 6. Constraints a hand-created truck could violate

🔴 **THE HONEST ANSWER FIRST: THE AUTHORITATIVE LIST IS NOT IN THIS REPOSITORY.** None of `trucks`,
`truck_vans`, `menu_categories`, `menu_items_db`, `truck_events` or `operators` has a `CREATE TABLE`
under `supabase/migrations/`. **What follows is what the code demonstrably depends on.**

| Constraint | Evidence | Risk to a hand insert |
|---|---|---|
| **`trucks.sheet_id` NOT NULL, no default** | `provision-truck.ts:405-409` | 🔴 **any insert omitting it FAILS** |
| **`trucks.id` / `slug` / `dashboard_token` unique** | the 23505 retry loop, `:477-479`; `unique_exhausted` after `MAX_INSERT_ATTEMPTS = 5` | 🔴 a chosen id colliding with an existing truck |
| **`trucks.id` must not start with `demo-`** | `assertReservedPrefix()`, `:313-320` — throws before the insert | 🔴 **hand SQL BYPASSES this guard**, and `proxy.ts` would then drop the session gate on that truck's dashboard |
| **`truck_vans.name` NOT NULL, no default** | `:505` inline comment | insert fails |
| `truck_vans.capacity_window_mins` NOT NULL DEFAULT 5 | `:510` | safe to omit |
| `truck_vans.kds_token` DB default `encode(gen_random_bytes(24),'hex')` | `:514` | safe to omit; **a hand insert supplying one could collide** |
| `truck_vans.offline_protection_mode` CHECK | `app/api/manage/route.ts:988-990` — validated *"to the same vocabulary as the DB CHECK so a bad value is a dropped field rather than a 23514"* | a bad literal → 23514 |
| `truck_vans.offline_auto_reject_mins` CHECK 5–30 | `manage:993-998` | as above |
| `menu_categories` unique on `(truck_id, slug)` | **INFERRED** — `commitMenu:132-163` looks up by slug and **reactivates rather than inserting**, calling a second insert *"the collision"* | duplicate slug → 23505 |
| `menu_items_db.category_id` FK | `commitMenu:254-255` skips an item with no resolved category | orphan item rejected |
| `truck_events.van_id` FK → `truck_vans(id)` | `manage:687` | van must exist first |
| `orders` PK `order_key`; unique `(event_id, display_id)`; unique truck-level display id with no event | `20260607_order_key_per_event.sql:42-51` | 🔴 **the sharpest hazard for hand-seeded orders** |
| `production_slot_usage` unique `(truck, event, slot)` | `20260608_production_slot_usage_event_key.sql:19` | upsert arbiter |
| `slot_bookings` PK `(truck_id, event_date, collection_time)` | `20260518_slot_bookings.sql:10` | — |
| `operators.stripe_account_id` unique (partial) | `20260810_operators_stripe_connect.sql:66` | irrelevant here (null) |

⚠️ **NO TRIGGER on any of these tables is defined in `supabase/migrations/`** — a grep for
`create trigger` mentioning them returns nothing. **CANNOT DETERMINE whether the live database carries
any**, and a trigger is exactly the kind of thing a hand insert would trip.

---

## 7. The proposed SEQUENCE — surfaces only, nothing written

🔴 **`provisionDemo` / the admin "provision demo" button is NOT usable for this.** It hardcodes
`kind: 'demo'`, so the truck gets a `demo-` id, plan `'demo'`, the name *"Demo Kitchen (abc123)"*, and a
`demo_sessions` row — **which enrols it for automatic deletion by the hourly `demo-cleanup` cron.** A
tester truck a cron deletes mid-review is the failure this avoids.

| Step | Surface | Creates | 🔴 Check before moving on |
|---|---|---|---|
| **1** | **Admin console → Create truck.** Name *"Android Tester"*; **leave slug blank** unless a specific id is wanted; `plan: 'trial'`; `visibility: 'hidden'`; van name. | `trucks` + `truck_vans` | **The returned `id`/`slug` is what you expected and does NOT start with `demo-`.** Record the `dashboard_token` — every later step needs it. ⚠️ **If the desired slug already exists, the id silently becomes `<slug>-2`.** |
| **2** | **Admin console → edit modal → trial date picker.** | sets `plan`+`trial_expires_at` on the new truck | **The expiry is the date you chose, end-of-day.** ⚠️ **Nothing else does this** — `provisionTruck` writes `null`. |
| **3** | **Manage → Settings → van.** Set `kitchen_capacity` (and `capacity_window_mins` if wanted). | updates `truck_vans` | 🔴 **DO NOT SKIP.** `create-truck` forces `kitchen_capacity: null`, and **`upsert_event` writes no `slot_capacity` for a null-capacity van** — the capacity engine stays inert and the KDS strip stays empty. |
| **4** | **Manage → Menu → categories.** | `menu_categories` | Categories exist **before** items — `menu_items_db.category_id` is an FK. |
| **5** | **Manage → Menu → items** (+ modifiers if wanted). | `menu_items_db`, optionally modifier tables | Items resolve to a category; ⚠️ `allergens_verified` will be **false** on import — decide whether `allergen_display_mode` should be `'card'` so the customer menu is not filtered. |
| **6** | **Manage → Schedule → add event(s).** | `truck_events` + `slot_capacity` + occupancy | 🔴 **Confirm `slot_capacity` rows actually appeared.** Zero rows means step 3 was skipped. Check `status` and `van_id` are what you want. |
| **7** | **Admin console → Create operator**, with the truck selected. | Auth user + `operators` + `trucks.operator_id` | 🔴 **COPY THE PASSWORD FROM THE MODAL** — it is shown once with a Copy button. 🔴 **Check the response carries NO `warning`** — the truck link fails soft and still reports success. ⚠️ Confirm the email does not collide with an existing Auth user. |
| **8** | **Log in as the operator** at `/login`. | — | 🔴 **Whether `must_change_password` forces a reset, and whether the credential you hand a reviewer survives it.** |
| **9** | **Orders (optional).** Either place a few through `/trucks/<slug>/order`, or hand SQL modelled on the existing seed file. | `orders` | ⚠️ **`order_key` PK and the `(event_id, display_id)` unique index** are the hazards. Placing them through the app avoids both. |
| **10** | **Visibility decision.** | — | Hidden keeps it off the map and directory while **the direct order link still works** (`/api/menu` applies no visibility filter; `/api/orders/submit` filters `active` only). Only change this if a reviewer must find it by browsing. |

**Between every step: verify the previous step's row exists before proceeding.** Steps 3→6 and 4→5 are
FK-ordered and will fail or silently under-produce otherwise.

⚠️ **NOT PROPOSED, and deliberately:** no SQL is written here, and steps 1–8 need none. The only place
SQL is even a candidate is step 9.

---

## 🔴 WHICH STEPS TOUCH `test-truck-3-2`?

**NONE. Not one step reads it, writes it, or names it.**

Verified per step against the routes each one calls:

| Step | Scope of its writes | Touches `test-truck-3-2`? |
|---|---|---|
| 1 | `provisionTruck` inserts a **new** `trucks` row + its van | **No** |
| 2 | `/api/admin/route.ts:93` — `.update(updates).eq('id', truckId)` | **No** — scoped to the id you pass |
| 3–6 | `/api/manage` — every action is `.eq('truck_id', truck.id)`, resolved from the **new** truck's `dashboard_token` | **No** |
| 7 | `create-operator` — reads and updates `.eq('id', truckId)` | **No** |
| 8 | login | **No** |
| 9 | orders scoped to the new truck's `event_id` | **No** |
| 10 | visibility on the new truck | **No** |

⚠️ **THREE THINGS TO STAY AWARE OF, all avoidable:**

1. 🔴 **The admin edit modal is scoped by whichever truck row you opened.** `/api/admin/route.ts:93` is an
   **unallowlisted** `.update(updates)` — it writes any column you send. **Opening the wrong row in the
   console is the one realistic way this plan could touch Apple Tester.** Confirm the truck name in the
   modal header before saving at step 2.
2. ⚠️ **Step 7's shadow-exclusion is a name match, not an id match** —
   `discovery_trucks.update({ excluded: true }).ilike('name', shadowName)`. It writes
   **`discovery_trucks`, never `trucks`**, so it cannot reach Apple Tester's truck row — but a discovery
   row named *"Android Tester"* would be excluded. **Not a risk to `test-truck-3-2` unless the two trucks
   share a name, which they do not.**
3. 🔴 **`/api/admin/delete-truck` is one button away in the same console** and is not part of this plan.

---

## What remains unobserved

1. **I ran nothing** — no parse, no typecheck, no execution. Nothing was created, inserted, updated or
   deleted; no database was queried.
2. 🔴 **THE LIVE SCHEMA WAS NOT INSPECTED.** No `CREATE TABLE` exists in the repository for six of the
   tables in §3, so §6 is *"what the code depends on"*, not *"the constraint list"*. **A trigger or a NOT
   NULL added outside `supabase/migrations/` would be invisible to this report** — which is the strongest
   reason to prefer the routes over hand SQL at every step.
3. **`test-truck-3-2` was not read**, so this report contains no statement about its current state.
4. **CANNOT DETERMINE** whether `must_change_password: true` blocks a store reviewer's login — that is
   `/login`'s behaviour and was not read.
5. **The hidden-truck order-page reachability in §1 and step 10 is read from source, not exercised.** No
   page was loaded.
6. **No SQL was written and no approach beyond the sequence was proposed**, as instructed.
