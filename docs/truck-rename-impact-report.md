# Renaming a truck — the impact of changing `slug`, and of changing `id`

**Date:** 1 September 2026
**READ-ONLY.** No file changed, no migration, nothing committed or deployed. **No change made.**
Marked **READ**, **INFERRED**, **UNKNOWN** throughout.

---

## 🔴 The finding that reframes both questions

**`trucks.id` IS NOT A UUID. It is TEXT, and it is slug-shaped.** READ, from a migration's own comment
(`20260628_allergen_audit_log.sql:5`):

> *"truck_id = trucks.id (TEXT — e.g. 'pizzeria-gusto', not a uuid)"*

**READ from production — `id` and `slug` side by side:**

```
name                     id                                slug
App Tester               test-truck-3-2                    test-truck-3-2
Demo Kitchen (15yy2e)    demo-15yy2ecnkemmchrr8np69p29n8   demo-jt7xn1b47121by1n0d1yjrrv3k
Demo Kitchen (krh2c8)    demo-krh2c8ksabdv28ccprswbfhkdk   demo-wks3nf2q7dp2tef0hp01n74e8c
Demo Kitchen (m1y02c)    demo-m1y02c2mgqag1y4b79401af4hm   demo-qbkqsaayxa87nb9cahhj2ngzpk
Pizzeria Gusto           pizzeria-gusto                    pizzeria-gusto
Real Thai Food           real-thai-food                    real-thai-food
test truck               test-truck-3                      test-truck-3
Test Truck               test-truck-2                      test-truck-2
Thai Kitchen             test-truck                        test-kitchen      ← they diverge
Tikka Tonic              tikka-tonic                       tikka-tonic
TT3                      tt3                               tt3
Village Spice            village-spice                     village-spice

id === slug on 8 of 12 rows.
```

🔴 **AND THE TWO ARE INTERCHANGEABLE AT RESOLUTION TIME.** Every customer-facing resolver tries the slug
and **falls back to the id**. That single fact decides most of Part A.

---

# PART A — changing `trucks.slug`

## A1. Every route, component and API path that reads or writes the slug

### Reads — resolving a truck BY slug (the ones that matter)

| file:line | What it does |
|---|---|
| `app/api/menu/[truckId]/route.ts:35` | `.eq('slug', truckId)` — **then falls back to `.eq('id', …)` at `:42`** |
| `app/api/orders/submit/route.ts:208` | `.eq('slug', truckId)` — **falls back to `.eq('id', …)` at `:216`** |
| `app/api/events/route.ts:43` | `.eq('slug', truckSlug)` — the ordering page's event list |
| `app/api/slots/[truckId]/route.ts:41` | `.eq('slug', truckIdOrSlug)` — capacity/slots |
| `app/api/embed/events/route.ts:58` | `.eq('slug', slug)` — the custom-domain schedule feed |
| `lib/custom-domain/redirect-target.ts:48` | `.eq('slug', slug)` — the five live-domain conditions |
| `app/api/demo/save-email/route.ts:54` | `.eq('slug', slug)` |

### Reads — selecting the slug as a field

`app/api/admin/route.ts:54` · `app/api/dashboard/route.ts:766` · `app/domain/page.tsx:64` ·
`app/api/cron/custom-domain-check/route.ts:69` · `app/api/manage/whatsapp-preview/route.ts:111` ·
`app/api/admin/delete-truck/route.ts:40` · `lib/provision-truck.ts:471` · `lib/provision-demo.ts:102` ·
`lib/menu-commit.ts:106` · `app/api/webhooks/meta/whatsapp/route.ts:32`

### Writes

| file:line | What it writes |
|---|---|
| `app/api/setup/route.ts:90` | `slug: safeSlug(name)` — self-serve signup |
| `app/api/admin/create-truck/route.ts:103` | `slug: body.slug` — admin provisioning |
| `app/api/admin/provision-demo/route.ts:90` | `slug: result.slug` — demo |
| `app/admin/page.tsx:489`, `:1959` | The admin **create-truck** form's slug field |

🔴 **THERE IS NO UPDATE PATH FOR `slug` ANYWHERE.** It is written at creation only. **A rename would be
a direct database edit.** ⚠️ Consistent with §4's finding that `plan` has no update path either.

### Route segments that ARE a slug

`app/trucks/[slug]` · `app/trucks/[slug]/order` · `app/o/[slug]` · `app/embed/[slug]` ·
`app/api/menu/[truckId]` · `app/api/slots/[truckId]`

## A2. What URLs contain the slug

| URL | Which slug space |
|---|---|
| `https://www.hatchgrab.com/trucks/<slug>/order` | **`trucks.slug`** — the ordering page |
| `https://www.hatchgrab.com/o/<slug>` | **`trucks.slug`** — the short scan URL |
| `https://www.hatchgrab.com/trucks/<slug>` | 🔴 **`createSlug(name)`, a DIFFERENT space** — the Village Foodie discovery profile, keyed on the *name*, not the column |
| `https://<their-domain>/` | **none** — the custom domain resolves by host, not slug |
| `/api/menu/<slug>`, `/api/slots/<slug>`, `/api/events?truck=<slug>` | `trucks.slug`, with id fallback |

⚠️ **The discovery profile at `/trucks/<slug>` does not use this column at all** — it keys on
`createSlug(name)` via the discovery feed. **Changing `trucks.slug` does not change that URL; changing
the truck's NAME does.** The two diverge on 7 of 12 trucks today.

## A3. 🔴 What breaks for a QR code already in a customer's hands

**A printed code encodes `https://www.hatchgrab.com/o/<slug>`.** Tracing a scan of the OLD slug:

**Step 1 — `app/o/[slug]/page.tsx`.** `customDomainFor(slug)` misses (no truck has that slug), so:

```ts
// ⚠️ THE FALLBACK IS ALSO TEMPORARY, AND FOR THE SAME REASON…
redirect(`/trucks/${encodeURIComponent(slug)}/order`)
```

**Step 2 — the ordering page loads `/api/menu/<old-slug>`:**

```ts
let truckQuery = await supabase.from('trucks').select('*').eq('slug', truckId).single()
if (truckQuery.error || !truckQuery.data) {
  truckQuery = await supabase.from('trucks').select('*').eq('id', truckId).single()   // ← the fallback
}
```

🔴 **SO THE ANSWER DEPENDS ENTIRELY ON WHETHER THE OLD SLUG EQUALS THE TRUCK'S `id`:**

| Case | Old QR does |
|---|---|
| **`id === old slug`** (8 of 12 trucks, incl. Pizzeria Gusto, Real Thai Food, Tikka Tonic, Village Spice) | ✅ **STILL WORKS.** The slug lookup misses, the **id fallback catches it**, the right truck loads. |
| **`id ≠ old slug`** (Thai Kitchen and the three demos) | 🔴 **404 `{"error":"Truck not found"}`** |
| **A slug reassigned to a DIFFERENT truck** | 🔴 **WRONG TRUCK, silently** — see below |

**Proven empirically against the running app** (Thai Kitchen, `id='test-truck'`, `slug='test-kitchen'`):

```
/api/menu/test-kitchen   → 200  {"truck":{"id":"test-truck","name":"Thai Kitchen",…}}   (by slug)
/api/menu/test-truck     → 200  {"truck":{"id":"test-truck","name":"Thai Kitchen",…}}   (by ID)
/api/menu/no-such-slug   → 404  {"error":"Truck not found"}
```

🔴 **THE DANGEROUS CASE IS REASSIGNMENT, NOT LOSS.** If truck A's old slug is later given to truck B, the
slug lookup **succeeds** and every old printed code for A silently serves **B's menu, B's events and B's
payment destination**. **No error, nothing logged.** This is the one outcome that is worse than a 404.

## A4. Uniqueness, history, redirects

- 🔴 **NO `UNIQUE` CONSTRAINT ON `trucks.slug` IS DECLARED IN ANY MIGRATION IN THIS REPOSITORY.** The only
  `UNIQUE`s on `trucks` are `trucks_phone_number_id_key` and `trucks_custom_domain_key`.
  ⚠️ **UNKNOWN whether one exists in the base schema** — `trucks` has no `CREATE TABLE` in the repo.
  **The collision-suffixed values (`test-truck-2`, `test-truck-3`, `test-truck-3-2`) are evidence that
  something avoids collisions**, but I could not establish whether that is a constraint or a convention.
- 🔴 **THERE IS NO SLUG HISTORY TABLE AND NO REDIRECT TABLE.** No migration creates one; nothing in the
  routing consults one. **An old slug has nowhere to be looked up.**

## A5. Does anything external store a slug?

- **The scraper: no.** It stores `truck_id` on `truck_events`, not a slug. `SCRAPE_TRUCK_ID` in both
  GitHub workflows is a **dispatch-time input** (`${{ github.event.inputs.scrape_truck_id }}`), not a
  stored value.
- **The discovery feed: no — it derives its own.** It keys on `createSlug(name)` from
  `discovery_trucks`, independent of this column.
- 🔴 **External links are the real exposure and are unenumerable from here.** Any slug the operator has
  put on Facebook, a flyer, a website, an email footer or a printed menu. **UNKNOWN and unknowable from
  the repository.**

---

# PART B — changing `trucks.id`

## B6. Every table with a `truck_id`, its FK, and its `ON UPDATE` rule

**READ — 17 foreign keys reference `trucks(id)`:**

| Table | Migration | ON DELETE | **ON UPDATE** |
|---|---|---|---|
| `production_slot_usage` | `20260518` | CASCADE | **none → NO ACTION** |
| `slot_bookings` | `20260518` | CASCADE | **none** |
| `discovery_trucks.hatchgrab_truck_id` | `20260522` | SET NULL | **none** |
| `plans` | `20260521` | CASCADE | **none** |
| `plans_and_trial` | `20260521` | CASCADE | **none** |
| messaging (`20260523:40`) | `20260523` | SET NULL | **none** |
| `checkout_upsells` | `20260529` | CASCADE | **none** ⚠️ declared `uuid` |
| `upsell_rules` | `20260529` | CASCADE | **none** |
| `exclusion_terms` | `20260604` | CASCADE | **none** |
| `scraper_adaptive` | `20260604` | CASCADE | **none** |
| `whatsapp_logs` | `20260605` | CASCADE | **none** |
| `booking_locks` | `20260608` | CASCADE | **none** |
| `rejected_event_signatures` | `20260613` | CASCADE | **none** |
| `van_devices` | `20260701` | CASCADE | **none** |
| `demo_sessions` | `20260723` | CASCADE | **none** |
| `order_payments` | `20260729` | CASCADE | **none** |
| `order_drafts` | `20260812` | CASCADE | **none** |

🔴 **NOT ONE OF THE SEVENTEEN DECLARES `ON UPDATE`. PostgreSQL therefore defaults to `ON UPDATE NO
ACTION`, which REFUSES the update** for any parent row that has dependents.

**Two tables carry `truck_id` with NO foreign key at all — they would ORPHAN silently:**

- 🔴 **`action_audit_log.truck_id`** (`20260729:83`) — `text not null`, no FK. ⚠️ **Deliberate**: the
  manual records *"`action_audit_log` has zero foreign keys, which remains correct"* — it is append-only
  evidence that must survive cascades. **The consequence here is that an id change silently detaches
  every money and collection record from its truck.**
- 🔴 **`allergen_audit_log.truck_id`** (`20260628:15`) — `text NOT NULL`, no FK. **Food-safety evidence.**

⚠️ **`checkout_upsells.truck_id` is declared `uuid` while `trucks.id` is `text`.** **UNKNOWN** whether
that table exists in production or the migration was superseded — a `uuid` FK to a `text` column cannot
have been created as written.

🔴 **THE BIGGEST GAP: the core tables are not in this repository.** `orders`, `truck_events`,
`menu_items_db`, `menu_categories`, `truck_vans`, `bundles`, `modifier_groups` have **no `CREATE TABLE`
in any migration** — they are base schema created outside the tracked files, and there is no
`ALTER … ADD CONSTRAINT … REFERENCES trucks` anywhere. **Whether they have FKs to `trucks(id)`, and with
what rules, is UNKNOWN from the repository and must be read from the database before anything is
attempted.**

## B7. Truck ids hardcoded as string literals

### 🔴 `test-truck-3-2` — asked for specifically

**READ: it is a LIVE truck id — "App Tester", where `id === slug === 'test-truck-3-2'`.**

✅ **ZERO hits in executable code.** No hit in `app/`, `lib/`, `scripts/`, `supabase/`, `components/` or
`.github/`. **Every occurrence is in `docs/` — 18 report files**, including
`docs/seed-apple-tester-orders.sql`, which is a *document*, not a run script.

### Other live ids that ARE hardcoded in executable files

| id | Where |
|---|---|
| 🔴 **`pizzeria-gusto`** | `20260628_allergen_vocab_14_reconfirm_and_casing.sql:8,29,38,53` (**excluded from a data migration by name**) · `20260723_gusto_allergen_mode_explicit.sql:57` (`where id = 'pizzeria-gusto'`) · `20260702_discovery_visibility_booleans.sql:39` · `20260628_allergen_audit_log.sql:5` (comment) |
| 🔴 **`test-truck`** | `scripts/seed-thai-kitchen-screenshots.sql` — **14 occurrences**, incl. `v_truck text := 'test-truck'` · `20260702_discovery_visibility_booleans.sql:40` · `app/api/native/bind-device/route.ts:108` (comment) |
| **`real-thai-food`** | `20260702_discovery_visibility_booleans.sql:39` · `bind-device/route.ts:108` (comment) |
| **`test-kitchen`** (slug) | `scripts/seed-thai-kitchen-screenshots.sql:2` (comment) |

⚠️ **All executable hits are in migrations already applied and a seed script.** **INFERRED: none runs
again in normal operation** — but a re-run of the seed script after an id change would write to nothing,
and the allergen migration's *exclusion* of `pizzeria-gusto` would silently stop excluding it.

## B8. Truck ids outside the database

- ✅ **`.env.local`: none.** No value in any variable contains a truck id (checked by value, names only
  reported).
- ✅ **GitHub Actions: none stored.** `SCRAPE_TRUCK_ID` is a workflow **input** supplied at dispatch.
- ⚠️ **UNKNOWN — Vercel production environment variables.** I read `.env.local` only.
- ⚠️ **UNKNOWN — Supabase Edge Function secrets / Vault.** The scheduler reads a service-role key from
  Vault; whether any function config names a truck is not visible here.
- ⚠️ **UNKNOWN — Brevo templates and WhatsApp/Meta configuration.** External systems.
- ✅ **Native app configs: none.** `capacitor.config.ts` and both baked JSONs contain no truck id — the
  shells load `https://www.hatchgrab.com/app` and resolve everything at runtime.

## B9. 🔴 What would break if `trucks.id` changed and nothing else did

**Plainly: the database would refuse the change.**

With 17 FKs at `ON UPDATE NO ACTION`, an `UPDATE trucks SET id = …` on a row that has **any** dependent
row in **any** of those tables **errors and rolls back**. **It does not silently corrupt — it fails.**

**If the constraints were dropped or deferred to force it through, then:**

1. 🔴 **Every FK'd child row orphans** — orders' payment ledger, drafts, van devices, slot bookings,
   demo sessions, WhatsApp logs, upsell rules.
2. 🔴 **`action_audit_log` and `allergen_audit_log` detach silently** — no FK to complain. **The money
   trail and the food-safety trail both point at an id that no longer exists.**
3. 🔴 **`discovery_trucks.hatchgrab_truck_id` breaks the shadow link** (§32), so the truck's discovery
   identity separates from its operator row.
4. ⚠️ **Old QR codes may still work** — for a truck where the printed slug equals the *old* id, the id
   fallback would now miss, giving a **404**.
5. ⚠️ **The two applied migrations naming `pizzeria-gusto` become inert** if that id were the one changed.

---

# Recommendation

## 🔴 Do not change `trucks.id`. It is not worth doing.

**It is a primary key propagated into at least 19 tables, two of which keep audit evidence with no
foreign key to protect them, and an unknown number of core tables whose constraints are not visible in
this repository.** The change buys nothing a customer or operator can see: **the id appears in no URL,
no printed artefact, no email and no external config.** It is internal plumbing whose only virtue is
that it is stable.

⚠️ **If a truck's *name* is changing, the id is exactly the thing that should NOT follow it.** An id that
tracks the name is the reason this question is being asked at all.

## ✅ Changing `trucks.slug` is reasonable, and here is the safe sequence

**It is a genuine trade, not a free change** — the exposure is old printed codes and any link the
operator has published.

1. **Read the constraint first.** Establish from the database whether `trucks.slug` has a `UNIQUE` index
   (§A4 — not visible in the repo). **Do not assume either way.**
2. 🔴 **Check whether `id === slug` for this truck.** If it does, **old QR codes keep working** through
   the id fallback, and the change is close to free. If it does not, **every old printed code 404s** on
   the day of the change.
3. 🔴 **Never reassign an old slug to a different truck.** That is the one outcome worse than a 404 —
   old codes would silently serve the wrong truck's menu and payment destination. **If the old slug is
   retired, retire it permanently.**
4. **Do it in one statement.** `UPDATE trucks SET slug = … WHERE id = …`. Nothing cascades; no child
   table stores the slug.
5. **Then regenerate and reprint the QR code**, and update any link the operator has published. **The
   printed code is the only artefact that cannot be fixed remotely.**
6. ⚠️ **Note what does NOT change: the discovery profile URL** at `/trucks/<slug>`, which keys on
   `createSlug(name)`. **Changing the NAME changes that one**; changing the slug does not.

⚠️ **And the durable fix, if renames are going to happen more than once: a slug-history table consulted
on a 404 before giving up.** It does not exist today, and it is what turns this from a decision into a
routine operation. **Not proposed as part of this report — flagged as the shape of the answer.**

---

## What I could not establish

1. **UNKNOWN — whether `trucks.slug` has a `UNIQUE` constraint.** Not in the repo; `trucks` has no
   `CREATE TABLE` here.
2. **UNKNOWN — FK state of `orders`, `truck_events`, `menu_items_db`, `menu_categories`, `truck_vans`,
   `bundles`, `modifier_groups`.** Base schema, outside the tracked migrations. **This is the largest
   gap in Part B and must be read from the database before any id work.**
3. **UNKNOWN — Vercel production env, Supabase function secrets, Brevo, WhatsApp config.**
4. **UNKNOWN — external links published by operators.**
5. **UNKNOWN — whether `checkout_upsells` exists** (its `uuid` FK contradicts a `text` parent).
6. **NOT OBSERVED — no rename was attempted.** The id-fallback behaviour in §A3 **was** exercised against
   the running app; everything else is READ from code, migrations and production data.

---

**No span of this prompt arrived garbled, and no instruction contradicted another.** One premise worth
naming: the brief treats `slug` and `id` as separate questions, and they are — **but they are the same
shape of value, and interchangeable at resolution time**, which is why A3's answer depends on B's data.
