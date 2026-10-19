# US dress rehearsal, stage 1 — can a hidden US test truck run end to end while the US stays switched off?

18 October 2026.

**Short answer: yes, once one blocker is fixed, and it is fixed here.** No check of `country_settings.enabled` touches
an existing truck's operation. The only thing that stopped a US truck was the US row's **NULL plan prices**: Manage's
Billing tab, FeatureGate's upgrade line, the Settings van add-on (Pro/Max) and the admin truck-edit modal all **threw
on render**. A trial truck opens Manage on Billing, so the twin would have crashed the moment Manage opened. Those
four now show the existing masked word ("TBD" in en-US) instead. GB is unchanged.

**Work done:**
- Diagnosed from code and live read-only queries; the queries and their results are below.
- Fixed the one blocker, in 4 product files, with a new sweep harness and two named re-pins.
- Wrote and read-only-tested the SQL for the twin.
- Planned stage 2.

**Rules held:**
- Nothing committed, pushed or deployed. No database writes; every SQL block below is **NOT RUN**.
- No `.env*` file opened, read, loaded or tested in any form.
- **`next build` was NOT run**, because it loads `.env.local`, which your secrets rule overrides (flagged at the
  start). tsc and the full harness sweep stand in for it. **Dominic to run `next build`.**
- Pizzeria Gusto untouched; Pizza Kitchen read, never written.

**The prompt.** It arrived intact; nothing was garbled. The one conflict was "next build exit 0" versus the secrets
rule, and the prompt itself said the secrets rule wins.

## 1. Diagnosis

### Where `enabled` (the switched-on list) is checked, and what an existing US truck sees

Nothing in Manage, the dashboard, the KDS, the order page, `/trucks/[slug]`, slots, submit, payments, emails,
WhatsApp, posters, Billing access, crons or the edge functions reads `enabled`. A truck's settings load by
`trucks.country` alone (`lib/country-settings.ts` `countrySettingsForTruck`): a US truck gets its own US row, with no
GB fallback and no "country off" refusal.

| Where | What it does | Effect on the twin | Kind |
|---|---|---|---|
| `proxy.ts` `liveMarketingCountries()` | routes `/`, `/landing`, `/features`, `/compare` and the country pages | `/us…` → 302 to `/uk…` (stays off) | public |
| `lib/visitor-country.ts` `resolveVisitorCountry`, `resolveCountryPage`, `visitorCountryCodeOf`, `routedAddress` | marketing country, the flag menu, the legal logo, demo bounces | US is never chosen | public |
| `app/sitemap.ts`, `lib/marketing-meta.ts` (hreflang), `components/landing/CountryMenu.tsx` | switched-on list only | US absent | public |
| `lib/signup-countries.ts`, `lib/trade-area.ts` `checkSignupCountry` | countries offered at signup | US not offered (the twin is made by SQL) | signup |
| `lib/provision-truck.ts` (`countryOff`), `lib/provision-demo.ts` `demoCountry()` | creating a truck or demo | not reached for an existing truck | creation |
| `app/api/places/_guard.ts` | Google place suggestions (signup, Manage › Where you trade) | the town box takes typed text, no suggestions. **Not a blocker**: the Maps key isn't set up yet, so GB gets none either | mild |
| Admin Countries tab / screenshot picker | admin only | — | admin |
| SQL: functions, RLS, triggers, `place_order_atomic_v2`, `orders_fill_currency_country` | none read `enabled` | works | — |

**The CHECK** (`supabase/migrations/20261010_02_country_settings.sql:142-152`, live as
`country_settings_enabled_needs_prices_chk`):

```sql
check (not enabled or (starter_monthly_minor is not null and pro_monthly_minor is not null and max_monthly_minor is not null
  and pro_allowance_minor is not null and max_allowance_minor is not null and platform_fee_pct is not null))
```

### Billing, the trial, FeatureGate and the plans PDF (US prices NULL)

**Before this fix:**
- `requirePlanPrice` (`lib/country-settings-types.ts`) throws on a NULL price, by design: never borrow GB's number.
- Every price helper goes through it (`planPrices`, `planMonthlyMinor`, `transactionRows`, `footnotes`, `planPrice`,
  `vanAddonMonthlyMinor` …).
- There is no `error.tsx` / ErrorBoundary, so a throw takes the whole page down. Where it hit:
  - **Billing:** crashed on every plan. A trial truck opens Manage on Billing (web and Android), so **opening the
    twin's Manage crashed**.
  - **FeatureGate:** crashed when it refuses (an expired trial or starter truck, on a Pro feature).
  - **Settings:** the van add-on crashed for Pro and Max.
  - **Admin:** the truck-edit modal (`platformFeeLabel`) crashed.
- **Trial and access:** `canAccess` / `hasFeature` read plan, overrides and `trial_expires_at` only, with no price
  or country. Fine.
- **Plans PDF:** Billing has no PDF link. The outreach PDF for a US prospect is refused with a generic message
  (acceptable; unchanged).
- **Upgrade:** a `mailto:` only. No Stripe billing exists for plans, so there is no live-Stripe risk here.
- **Go-live checks:** unwired (zero call sites). They check allergen display, vans with capacity, a prep-bearing
  category and a verified email; nothing country-, price- or Stripe-related.

**After this fix, what the US twin's Billing shows:** every plan amount, the upgrade modal, the matrix's fee amounts
and footnote 2 read **"TBD"**. These are the existing masked states (`MASKED_PRICE` "TBC" → en-US "TBD", and
`footnote2Masked`). There is no "$null", "NaN", "undefined" or "£", and no dollar amount at all on Billing.
FeatureGate reads "Pro · TBD · …".

### Pizza Kitchen's shape (live, read-only)

**Tables keyed to `trucks`:** 43 foreign keys point at `trucks`. Pizza Kitchen's rows:

| Table | Rows | Twin? |
|---|---:|---|
| trucks | 1 | **copied** (row-for-row; US fields and every unique/credential column overridden) |
| truck_vans | 2 (Van1, Van2) | **Van1 copied as "Truck 1"** (new KDS token, no printer/device ties) |
| menu_categories | 5 (Pizza, Specials (off), Desserts, Drinks, Dough Balls (off)) | **copied** |
| menu_subcategories | 1 | **copied** (category re-mapped) |
| menu_items_db | 30 | **copied** (category / sub-category re-mapped; allergens mapped to US; photos not copied) |
| modifier_groups / options / item links | 0 | none to copy |
| bundles_db (deals), discount_codes_db, upsell_rules | 0 | none to copy |
| van_category_settings | 2 (Van1, Van2) | **Van1's copied** for Truck 1 |
| event_types | 2 (Festival, Private) | **copied** |
| truck_events | 64 (1 future: today, "Street Food Festival", open) | **not copied**; two new NJ events instead |
| order_counters | 1 | **new row at 0** |
| discovery_trucks (hatchgrab_truck_id) | 1 ("Test Kitchen", GB, show_on_vf false, show_on_hg true) | **none** (the twin has no discovery row) |
| truck_places / place_pictures / truck_post_designs | 23 / 5 / 2 | not copied (storage paths are Pizza Kitchen's) |
| whatsapp_connections / whatsapp_logs | 1 / 13 | not copied (the Meta test number is unique) |
| van_devices | 12 | not copied (device ids are global) |
| orders / order_payments / order_drafts | 358 / 116 / 13 | not copied |
| slot_capacity / production_slot_usage / scraper_run_log | 577 / 111 / 228 | runtime only |
| private_event_links / event_item_prices | 1 / 1 | tied to old events; not copied |
| truck_users | 0 | owner is `trucks.operator_id`, not a team row |
| everything else (booking_locks, category_stock, collection_times, demo_sessions, excluded_terms, item_overrides, kds_sessions, messages, referrals, rejected_event_signatures, slot_bookings, truck_fonts, whatsapp_alerts, event_post_backgrounds) | 0 | — |

**Ownership and access:**
- Pizza Kitchen's owner is `trucks.operator_id`. That account is an admin and owns **only** Pizza Kitchen today.
- Two trucks on one account is handled. The `/dashboard` landing and post-login pick the **oldest** active truck
  (Pizza Kitchen), so Dominic still lands there, and the twin opens by its own `/manage/<token>` and
  `/dashboard/<token>`.
- `resolveTruckAccess` grants the owner and admins.

**Stripe:**
- Connect lives on `operators`, not trucks. The account has **no Stripe account and charges are not enabled** (live
  read).
- So the twin cannot take card payments: pay at truck is the only path.
- ⚠️ **Pressing "Connect" on the twin's Payments tab would create a real, undeletable live US connected account**
  (`stripe.v2.core.accounts.create`, country us). Stage 2 must not press it.
- Manage only reads Stripe on load when an account exists (none here).

**Unique constraints that a copy must avoid** (live):
- `trucks`: slug, dashboard_token, custom_domain, phone_number_id (partial).
- `truck_vans`: kds_token.
- `truck_events`: private_token.
- `event_types`: `(truck_id, lower(name))`, one private per truck.
- `menu_categories`: `(truck_id, slug)`.
- `van_category_settings`: `(van_id, category_id)`.

The SQL overrides or regenerates every one. There are no triggers or generated columns on the copied tables.

### How a US truck is set apart (live columns)

- **Country and money:** `trucks.country` 'US' (FK to `country_settings`), `trucks.currency` 'USD'.
- **Time:** `trucks.timezone` 'America/New_York' (NULL would mean the country default, also New York). Locale comes
  from the country row (en-US: 12-hour, month-day-year, Sunday weeks); there is no truck locale column.
- **Tax:**
  - `trucks.tax_rate_milli` 6625 (thousandths of a percent).
  - The US row has `prices_include_tax` false and `tax_label` "Sales tax".
  - `tax_rate_bps` (truck and event) is retired.
- **Tips:**
  - `trucks.tipping_enabled` true (NULL → the US default, also true). Presets come from the country: 10 / 15 / 20 %.
  - **Card orders only.**
- **Service fee:**
  - `trucks.service_fee_enabled` / `service_fee_bps` / `service_fee_fixed_minor`.
  - The country allows it (`service_fee_allowed` true, recipient truck), **but the US maximum is NULL**
    (`service_fee_truck_max_bps` / `_fixed_minor`). The engine reads NULL as "none allowed" (`lib/order-charge-rules.ts`,
    `lib/charge-settings.ts`), so the twin's 3 % + 30¢ resolves to **0** until a maximum is set ("or the truck maximum
    if lower" → the maximum is 0 today).
  - **Card orders only**, so it doesn't affect pay-at-truck orders.
  - Optional SQL below.
- **Allergens:** `country_settings.allergen_set` 'us9', not a truck column. Item allergens are stored as **labels**
  (`menu_items_db.allergens text[]`), and there is no code converter.
- **Phone:** `country_settings.phone_check` 'length', `phone_country_code` '1', example "(201) 555-0123".
- **ZIP:** goes in the `postcode` columns; the address style is `zip_state`.
- **Base town:** `base_place_name`, `base_region`, `base_region_code` (CHECK `^[A-Z]{2}$`), `base_lat`, `base_lng`.

### Emails (from code — sends nothing here)

- **Provider:** Brevo HTTP API (`lib/email.ts`). Env names read: `BREVO_API_KEY` (missing → the send is skipped) and
  `EMAIL_FROM_ADDRESS`.
  **Dominic to confirm whether `BREVO_API_KEY` is set in `.env.local`**; I was not allowed to check.
- **What an order on the twin sends:**
  - **Customer:** confirmation on placing, then confirm / ready / edit / slot moved / reject / cancel / refund, all to
    the email typed at checkout.
  - **Operator new-order alert:** to `trucks.contact_email`, only if `truck_order_email_enabled` is true. Pizza
    Kitchen's is **false**, and the twin copies that, so **no operator emails**.
- **There is no dev/dry-run/suppress switch.** The only suppression is a `demo-` truck id (which also enrols a truck
  in the hourly demo clean-up, so it's not usable) or a missing Brevo key.
  - Two paths don't even check `demo-`: customer self-cancel (`app/api/orders/cancel`) and event-cancelled
    (`app/api/events/action`). Pre-existing; noted, not changed.
- **No WhatsApp, SMS or push** is sent on an order without registered devices (the twin has none).
- **How stage 2 avoids real emails:**
  - (a) if `BREVO_API_KEY` is set locally, type a customer email **Dominic owns** on every test order (the email then
    really goes to him); or
  - (b) leave the key unset for the session, and the sends are skipped and logged.
  - Either way, emails are checked by **rendering** the templates (as the US layout audit did), not by sending.
  - **Decision for Dominic.**

### How Pizza Kitchen is kept off Village Foodie and public listings

**On the truck:**
- `show_on_vf` false and `show_on_hg` **false**.
- `excluded` **false** (excluded refuses every order: `app/api/orders/submit` returns 404 unless the id starts with
  `demo-`).
- `order_link_hg` true.

**Where those flags act:**
- The public feed (`/api/discovery/events`) requires `active`, `!excluded` and the site's `show_on_*`.
- Village Foodie also requires a UK truck, so **a US truck can never appear there**.

**Discovery and other listings:**
- Pizza Kitchen also has a discovery row ("Test Kitchen", show_on_hg true), but the truck's own `show_on_hg` false
  keeps its events out of HatchGrab's listing.
- The sitemap lists no truck URLs. The order page and `/trucks/[slug]` resolve any slug, but they're reachable only
  by link.

**The twin is hidden the same way:** the same truck flags, **no discovery row at all**, and no custom domain.

## 2. The fix (the one genuine blocker)

**`lib/country-settings-types.ts`** (two new helpers):
- **`planPricesDecided(s)`:** true when all six plan price fields are set.
- **`withPlaceholderPlanPrices(s)`:** display-only. It returns a decided row unchanged (the same object), or a copy
  with each undecided price set to 1 so the helpers can build strings, every one of which the caller masks.
- `requirePlanPrice` still throws for any raw read. The new harness asserts it.

**`app/manage/[token]/page.tsx`:**
- **BillingTab:** reads the row as `countryRow`. When prices are undecided it uses the placeholder row, masks every
  amount with `maskPriceFor(v, true)` (the existing per-truck "hide every price" mask), and sets
  `pricesVisible = pricesPublished && pricesDecided`, so footnote 2 takes its masked sentence.
- **Settings van add-on:** built from the placeholder row, and always masked while prices are undecided.

**`components/FeatureGate.tsx`:** the upgrade line shows `MASKED_PRICE` when undecided.

**`app/admin/page.tsx`:** the truck-edit fee line shows `MASKED_PRICE` when undecided.

**GB:** its prices are decided, so it takes the identical path (the same row object, the same mask, the same
footnote). It is proven byte-identical by the sweep (`language-phase-1d2` Billing views, `phase3-screens`,
`money-sweep-parity`, and the rest).

**Public surfaces unchanged:**
- `/us` still redirects to `/uk`.
- The US is not offered at signup or in the flag menu, and is absent from hreflang and the sitemap.
- Village Foodie is unchanged.
- None of those files were touched.

**New harness `scripts/us-unpriced-country.cjs`** (in the sweep, 33 checks):
- It renders Billing (trial, starter, pro, max, the upgrade modal, the matrix), FeatureGate refusing, and Settings
  (pro, max) for a US truck with the US row **exactly as seeded** (off, NULL prices).
- It requires: no throw; "TBD"; no "$null" / "NaN" / "undefined" / "£"; no dollar amount on Billing.
- It also proves the helpers: the US is undecided and GB decided, the placeholder returns GB's own row, and a raw
  read still throws. A GB render is the control.
- Every other harness gives the US invented prices, which is why this crash was never caught.

**Named re-pins:**
- **`scripts/schedule-graphics-places.cjs`:**
  - `USR_NOW` re-points two claimed lines to their new form (the van add-on price read and its price word).
  - `USR_REMOVED` excuses one line, `const pricesVisible = usePricesVisible()`. It is proven necessary: without it
    the guard reports exactly that line.
  - A companion check requires `pricesPublished && pricesDecided`.
- **`scripts/_phase3-screens-us.cjs`:** one NAMED line move (the van add-on read), and the `vanPx` assertion updated
  to its masked-when-undecided form.

**Checks:**
- **tsc:** `npx tsc --noEmit` exit 0.
- **Sweep:** `node scripts/run-harnesses.cjs` → **132 run · 132 passed · 0 failed**. The first run, before the two re-pins, had
  130 / 132 with those two line guards failing.
- **eslint:** no message on any changed line. The four touched product files have no new messages. The new harness
  has 4 `no-require-imports` hits, the same CommonJS rule every harness file trips (`_lp1d-fixtures.cjs` has 6).
- **next build:** not run (it loads `.env.local`). **Dominic to run.**
- **Env loading:** I checked that no harness in the sweep loads an env file. `ops-write-guard.cjs` only holds the
  text `dotenv … .env.local` as a string literal, to prove a broken file would be caught.

## 3. SQL for Dominic

All four blocks are **NOT RUN**. Run order: preview (read-only) → the twin ("run now") → verify output → stage 2. The
clean-up runs only if needed.

**Read-only testing:**
- Every SELECT part of the twin block was **tested read-only against the live tables** (the truck row, van,
  categories, sub-categories, items, van settings, event types, event dates).
- That test caught one real bug: the trucks overrides exceeded `jsonb_build_object`'s 100-argument limit, so they are
  now three objects joined with `||`.
- Results from the read-only tests:
  - the truck builds as US / USD / New York / 6625 / tips on / 300 bps + 30¢ / hidden (not excluded), with a new
    48-character token, no PINs, WhatsApp or domain, the same owner, and trial to 31 December 2026;
  - 1 van "Truck 1";
  - 5 categories;
  - 1 sub-category;
  - 30 items, all re-mapped, photos null;
  - allergens Fish / Milk / Tree nuts / Wheat;
  - 1 van setting;
  - 2 event types;
  - events on Sunday 25 October (11:30–20:00) and Monday 26 October (20:00–00:30, overnight).

**Allergens, mapped to the US 9.** Pizza Kitchen uses five labels:

| UK label (Pizza Kitchen) | US label (twin) | Note |
|---|---|---|
| Dairy | Milk | exact mapping |
| Lactose | Milk | not a UK-14 label; lactose is a milk sugar |
| Fish | Fish | same |
| Tree nuts | Tree nuts | same |
| Gluten | **Wheat** | ⚠️ judgement: every item carrying Gluten is wheat pizza dough. US law names wheat, not gluten. **Dominic to confirm** |

- **Unmapped and dropped:** none today. The SQL also maps Eggs, Peanuts, Sesame, Soy and Crustaceans should they
  appear.
- **No US equivalent:** Celery, Mustard, Sulphites, Lupin and Molluscs would be dropped, but Pizza Kitchen uses none
  of them.

**Hidden how:** the same truck flags as Pizza Kitchen (`show_on_vf` false, `show_on_hg` false, `excluded` false),
**no discovery_trucks row**, and no custom domain. A US truck can never reach Village Foodie (UK-only feed).

**Choices made in the SQL** (all in the comments):
- **Not copied:** item photos and logo/cover (Pizza Kitchen's storage files); places, pictures, post designs;
  WhatsApp; devices; orders.
- **Cleared:** dashboard and KDS PINs.
- **Events:** `auto_open` / `auto_close` **false**. The deployed edge function isn't overnight-aware yet, and stage 2
  drives them by hand.
- **Phone:** "(201) 555-0142", a 555-01xx fictional number.

### 3a. Preview — READ-ONLY (run first)

Its result right now: `0 / 0` · `5 / 1 / 30 / 1 / 1 / 2` · `Dairy, Fish, Gluten, Lactose, Tree nuts` · `false / false / null, null`.

```sql
-- PREVIEW — READ-ONLY. Run first. Expect: twin absent (0 / 0); Pizza Kitchen 5 / 1 / 30 / 1 / 1 / 2; US row off, prices NULL.
select 'twin already there? (trucks by id / by slug)' as what,
  (select count(*) from public.trucks where id = 'test-truck-us') || ' / ' || (select count(*) from public.trucks where slug = 'test-kitchen-us') as n
union all select 'pizza kitchen: categories / subcategories / items / van "Van1" / its van settings / event types',
  (select count(*) from public.menu_categories where truck_id = 'test-truck') || ' / ' ||
  (select count(*) from public.menu_subcategories where truck_id = 'test-truck') || ' / ' ||
  (select count(*) from public.menu_items_db where truck_id = 'test-truck') || ' / ' ||
  (select count(*) from public.truck_vans where truck_id = 'test-truck' and name = 'Van1') || ' / ' ||
  (select count(*) from public.van_category_settings s join public.truck_vans v on v.id = s.van_id where s.truck_id = 'test-truck' and v.name = 'Van1') || ' / ' ||
  (select count(*) from public.event_types where truck_id = 'test-truck')
union all select 'pizza kitchen allergen labels', (select string_agg(distinct a, ', ' order by a) from public.menu_items_db, unnest(allergens) a where truck_id = 'test-truck')
union all select 'US row: enabled / prices set / service-fee max (bps, ¢)', (select enabled::text || ' / ' || (starter_monthly_minor is not null)::text || ' / ' ||
  coalesce(service_fee_truck_max_bps::text, 'null') || ', ' || coalesce(service_fee_truck_max_fixed_minor::text, 'null') from public.country_settings where country_code = 'US');
```

### 3b. The twin — NOT RUN, "run now"

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- US DRESS REHEARSAL — the hidden US twin of Pizza Kitchen. NOT RUN — "run now" (after the read-only preview). docs/us-dress-rehearsal-stage1-report.md
-- Touches ONLY rows whose truck is 'test-truck-us'. Reads 'test-truck' (Pizza Kitchen) and never writes it.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;

-- ── 1. GUARDS: stop (and roll back) unless the world is exactly as expected ──────────────────────────────────
do $$
begin
  if exists (select 1 from public.trucks where id = 'test-truck-us' or slug = 'test-kitchen-us') then
    raise exception 'test-truck-us already exists — nothing done (use the clean-up block first if you mean to recreate it)';
  end if;
  if not exists (select 1 from public.trucks where id = 'test-truck' and slug = 'test-kitchen' and country = 'GB') then
    raise exception 'the template test-truck / test-kitchen is not as expected — nothing done';
  end if;
  if not exists (select 1 from public.country_settings where country_code = 'US' and enabled = false) then
    raise exception 'the US country row is missing or switched on — nothing done';
  end if;
  if not exists (select 1 from public.truck_vans where truck_id = 'test-truck' and name = 'Van1') then
    raise exception 'test-truck has no van named Van1 — nothing done';
  end if;
end $$;

-- ── 2. THE TRUCK: Pizza Kitchen's row column-for-column, with the US fields and everything unique overridden ──
insert into public.trucks
select (jsonb_populate_record(null::public.trucks, to_jsonb(t) || jsonb_build_object(
  'id', 'test-truck-us', 'slug', 'test-kitchen-us', 'name', 'Pizza Kitchen US',
  'country', 'US', 'currency', 'USD', 'timezone', 'America/New_York',
  -- a new credential and no copied PINs, phone ids or domains (all unique, or Pizza Kitchen's own)
  'dashboard_token', encode(extensions.gen_random_bytes(24), 'hex'), 'dashboard_pin', null, 'kds_pin', null,
  'contact_phone', '(201) 555-0142', 'whatsapp', null, 'whatsapp_sender', null, 'phone_number_id', null, 'phone_is_whatsapp', false,
  'messenger_page_id', null, 'messenger_page_token', null,
  'custom_domain', null, 'custom_domain_verified_at', null, 'custom_domain_setup_state', null, 'custom_domain_setup_started_at', null,
  'custom_domain_confirmed_at', null, 'custom_domain_last_checked_at', null, 'custom_domain_last_ok_at', null, 'custom_domain_last_seen_value', null,
  'logo_storage_path', null, 'cover_image_path', null
) || jsonb_build_object(
  -- where it trades: Hoboken, NJ (typed, no Google place id)
  'base_place_id', null, 'base_place_name', 'Hoboken', 'base_region', 'New Jersey', 'base_region_code', 'NJ',
  'base_lat', 40.743990, 'base_lng', -74.032363, 'travel_radius_km', null,
  -- charges: NJ sales tax 6.625 %, tips on, a 3 % + 30¢ service fee (capped by the US maximum — see the report)
  'tax_rate_milli', 6625, 'tax_rate_bps', null, 'tipping_enabled', true,
  'service_fee_enabled', true, 'service_fee_bps', 300, 'service_fee_fixed_minor', 30
) || jsonb_build_object(
  -- hidden exactly as Pizza Kitchen is: off Village Foodie and off HatchGrab's listings, NOT excluded (excluded
  -- refuses every order), its own order link on (the public truck page and embed can order for stage 2)
  'show_on_vf', false, 'show_on_hg', false, 'order_link_vf', false, 'order_link_hg', true, 'excluded', false, 'is_customer', false,
  -- nothing automatic: no scraping, a fresh counter, nothing paused, no deletion, no embed history
  'scraper_preference', 'manual', 'schedule_url', null, 'scraper_rule', null, 'scraper_last_changed_at', null,
  'scraper_first_run_at', null, 'scraper_last_run_at', null, 'scraper_last_hash', null, 'scraper_last_text_hash', null,
  'scraper_last_empty_notify_at', null, 'scraper_learning_complete', false,
  'order_counter', 0, 'paused_until', null, 'extra_wait_mins', 0, 'extra_wait_started_at', null,
  'online_payments_paused_at', null, 'deletion_requested_at', null, 'setup_step', null,
  'embed_last_seen_at', null, 'embed_last_referer', null,
  'created_at', now()
))).*
from public.trucks t where t.id = 'test-truck';

-- ── 3. ID MAPS (old Pizza Kitchen id → new twin id), dropped at commit ────────────────────────────────────────
create temp table _twin_van on commit drop as
  select id as old_id, gen_random_uuid() as new_id from public.truck_vans where truck_id = 'test-truck' and name = 'Van1';
create temp table _twin_cat on commit drop as
  select id as old_id, gen_random_uuid() as new_id from public.menu_categories where truck_id = 'test-truck';
create temp table _twin_sub on commit drop as
  select id as old_id, gen_random_uuid() as new_id from public.menu_subcategories where truck_id = 'test-truck';
create temp table _twin_item on commit drop as
  select id as old_id, gen_random_uuid() as new_id from public.menu_items_db where truck_id = 'test-truck';
create temp table _twin_type on commit drop as
  select id as old_id, gen_random_uuid() as new_id from public.event_types where truck_id = 'test-truck';

-- ── 4. ONE VAN, "Truck 1" (Pizza Kitchen's Van1, with a new KDS token and no printer or device ties) ───────────
insert into public.truck_vans
select (jsonb_populate_record(null::public.truck_vans, to_jsonb(v) || jsonb_build_object(
  'id', m.new_id, 'truck_id', 'test-truck-us', 'name', 'Truck 1',
  'kds_token', encode(extensions.gen_random_bytes(24), 'hex'),
  'last_heartbeat_at', null, 'online_paused_until', null, 'paused_until', null,
  'network_printer_address', null, 'network_print_device_id', null,
  'created_at', now(), 'updated_at', now()
))).*
from public.truck_vans v join _twin_van m on m.old_id = v.id;

-- ── 5. THE MENU: categories, sub-categories, items (Pizza Kitchen has no modifier groups, deals or upsells) ────
insert into public.menu_categories
select (jsonb_populate_record(null::public.menu_categories, to_jsonb(c) || jsonb_build_object(
  'id', m.new_id, 'truck_id', 'test-truck-us', 'created_at', now()
))).*
from public.menu_categories c join _twin_cat m on m.old_id = c.id;

insert into public.menu_subcategories
select (jsonb_populate_record(null::public.menu_subcategories, to_jsonb(s) || jsonb_build_object(
  'id', m.new_id, 'truck_id', 'test-truck-us', 'category_id', mc.new_id, 'created_at', now()
))).*
from public.menu_subcategories s join _twin_sub m on m.old_id = s.id join _twin_cat mc on mc.old_id = s.category_id;

-- Allergens mapped to the US 9 (labels): Dairy → Milk, Lactose → Milk, Fish → Fish, Tree nuts → Tree nuts,
-- Gluten → Wheat (every Pizza Kitchen item with Gluten is wheat dough — see the report), Eggs, Peanuts, Sesame as
-- they are, Soy → Soybeans, Crustaceans → Crustacean shellfish. Anything else is dropped (none today).
-- Item photos are NOT copied (image_path null): they live in Pizza Kitchen's storage folder.
insert into public.menu_items_db
select (jsonb_populate_record(null::public.menu_items_db, to_jsonb(i) || jsonb_build_object(
  'id', m.new_id, 'truck_id', 'test-truck-us',
  'category_id', mc.new_id, 'subcategory_id', ms.new_id,
  'image_path', null,
  'allergens', to_jsonb(coalesce(array(
    select distinct us from unnest(i.allergens) a
    cross join lateral (select case a
      when 'Dairy' then 'Milk' when 'Lactose' then 'Milk' when 'Milk' then 'Milk'
      when 'Gluten' then 'Wheat' when 'Wheat' then 'Wheat'
      when 'Fish' then 'Fish' when 'Tree nuts' then 'Tree nuts' when 'Eggs' then 'Eggs' when 'Peanuts' then 'Peanuts'
      when 'Sesame' then 'Sesame' when 'Soy' then 'Soybeans' when 'Soybeans' then 'Soybeans'
      when 'Crustaceans' then 'Crustacean shellfish' when 'Crustacean shellfish' then 'Crustacean shellfish'
      else null end as us) x
    where us is not null order by us), '{}'::text[])),
  'created_at', now(), 'updated_at', now()
))).*
from public.menu_items_db i
join _twin_item m on m.old_id = i.id
left join _twin_cat mc on mc.old_id = i.category_id
left join _twin_sub ms on ms.old_id = i.subcategory_id;

-- Per-van kitchen settings for Truck 1 (from Pizza Kitchen's Van1)
insert into public.van_category_settings
select (jsonb_populate_record(null::public.van_category_settings, to_jsonb(s) || jsonb_build_object(
  'id', gen_random_uuid(), 'truck_id', 'test-truck-us', 'van_id', mv.new_id, 'category_id', mc.new_id,
  'created_at', now(), 'updated_at', now()
))).*
from public.van_category_settings s join _twin_van mv on mv.old_id = s.van_id join _twin_cat mc on mc.old_id = s.category_id;

-- ── 6. EVENT TYPES (Festival, Private) ────────────────────────────────────────────────────────────────────────
insert into public.event_types
select (jsonb_populate_record(null::public.event_types, to_jsonb(e) || jsonb_build_object(
  'id', m.new_id, 'truck_id', 'test-truck-us', 'created_at', now(), 'updated_at', now()
))).*
from public.event_types e join _twin_type m on m.old_id = e.id;

-- ── 7. TWO EVENTS in New Jersey, a week out (New York dates), confirmed, nothing automatic ────────────────────
-- auto_open / auto_close false: the deployed auto-event-scheduler is not yet overnight-aware, and stage 2 opens
-- and closes them by hand. Stage 2 moves the day event to the day it runs (Manage › Schedule › Edit).
insert into public.truck_events
  (truck_id, venue_name, address, latitude, longitude, event_date, start_time, end_time, notes, source, status,
   auto_open, auto_close, confirmed_at, town, postcode, van_id, event_type_id)
select 'test-truck-us', 'Pier A Park', 'Pier A Park, Frank Sinatra Dr, Hoboken, NJ 07030', 40.736500, -74.027000,
       (now() at time zone 'America/New_York')::date + 7, '11:30', '20:00', 'US dress rehearsal — day event', 'manual', 'confirmed',
       false, false, now(), 'Hoboken', '07030',
       (select new_id from _twin_van), (select m.new_id from _twin_type m join public.event_types e on e.id = m.old_id where e.kind = 'custom' order by e.sort_order limit 1)
union all
select 'test-truck-us', 'Hoboken Night Market', 'Washington St, Hoboken, NJ 07030', 40.744000, -74.032400,
       (now() at time zone 'America/New_York')::date + 8, '20:00', '00:30', 'US dress rehearsal — overnight event (ends 12:30 AM next day)', 'manual', 'confirmed',
       false, false, now(), 'Hoboken', '07030',
       (select new_id from _twin_van), (select m.new_id from _twin_type m join public.event_types e on e.id = m.old_id where e.kind = 'custom' order by e.sort_order limit 1);

-- ── 8. ORDER COUNTER (Pizza Kitchen has one row; the twin starts at 0) ─────────────────────────────────────────
insert into public.order_counters (truck_id, counter) values ('test-truck-us', 0) on conflict (truck_id) do nothing;

commit;

-- ── 9. VERIFY — after the commit, so the SQL editor shows it (a failed guard above rolled everything back) ──────
select 'trucks' as what, count(*)::text as n from public.trucks where id = 'test-truck-us'
union all select 'truck_vans', count(*)::text from public.truck_vans where truck_id = 'test-truck-us'
union all select 'menu_categories', count(*)::text from public.menu_categories where truck_id = 'test-truck-us'
union all select 'menu_subcategories', count(*)::text from public.menu_subcategories where truck_id = 'test-truck-us'
union all select 'menu_items_db', count(*)::text from public.menu_items_db where truck_id = 'test-truck-us'
union all select 'van_category_settings', count(*)::text from public.van_category_settings where truck_id = 'test-truck-us'
union all select 'event_types', count(*)::text from public.event_types where truck_id = 'test-truck-us'
union all select 'truck_events', count(*)::text from public.truck_events where truck_id = 'test-truck-us'
union all select 'order_counters', count(*)::text from public.order_counters where truck_id = 'test-truck-us'
union all select 'allergens in use', coalesce((select string_agg(distinct a, ', ' order by a) from public.menu_items_db, unnest(allergens) a where truck_id = 'test-truck-us'), '(none)')
union all select 'items whose category did not map', count(*)::text from public.menu_items_db where truck_id = 'test-truck-us' and category_id is not null and category_id not in (select id from public.menu_categories where truck_id = 'test-truck-us')
union all select 'twin settings', (select json_build_object('country', country, 'currency', currency, 'tz', timezone, 'tax_milli', tax_rate_milli, 'tips', tipping_enabled,
        'fee', service_fee_bps || ' bps + ' || service_fee_fixed_minor || '¢', 'show_on_vf', show_on_vf, 'show_on_hg', show_on_hg, 'excluded', excluded,
        'plan', plan, 'trial_to', trial_expires_at, 'same_owner_as_pizza_kitchen', operator_id = (select operator_id from public.trucks where id = 'test-truck'))::text
        from public.trucks where id = 'test-truck-us')
union all select 'pizza kitchen untouched (items / vans / events)', (select count(*) from public.menu_items_db where truck_id = 'test-truck') || ' / ' ||
        (select count(*) from public.truck_vans where truck_id = 'test-truck') || ' / ' || (select count(*) from public.truck_events where truck_id = 'test-truck')
union all select 'Manage (open while signed in)', 'http://hatchgrab.localhost:3000/manage/' || dashboard_token from public.trucks where id = 'test-truck-us'
union all select 'Dashboard', 'http://hatchgrab.localhost:3000/dashboard/' || dashboard_token from public.trucks where id = 'test-truck-us'
union all select 'KDS (Truck 1)', 'http://hatchgrab.localhost:3000/kds/' || v.kds_token from public.truck_vans v where v.truck_id = 'test-truck-us'
union all select 'Public truck page', 'http://hatchgrab.localhost:3000/trucks/test-kitchen-us';
```

### 3c. Clean-up — NOT RUN, ONLY IF NEEDED

```sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CLEAN-UP — ONLY IF NEEDED. NOT RUN. Deletes the twin 'test-truck-us' and everything stage 2 created under it,
-- children first. Touches nothing else: every statement is scoped to 'test-truck-us'. Removes ROWS only — no stored
-- image or storage object is deleted (the twin was created with no logo, cover or item photos).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$ begin
  if not exists (select 1 from public.trucks where id = 'test-truck-us' and country = 'US') then
    raise exception 'no US twin test-truck-us to clean up — nothing done';
  end if;
end $$;
-- the tables whose truck foreign key does NOT cascade (orders, payments, slot ledgers, counters, stock, referrals)
delete from public.order_payments    where truck_id = 'test-truck-us';
delete from public.orders            where truck_id = 'test-truck-us';
delete from public.slot_capacity     where truck_id = 'test-truck-us';
delete from public.collection_times  where truck_id = 'test-truck-us';
delete from public.order_counters    where truck_id = 'test-truck-us';
delete from public.item_overrides    where truck_id = 'test-truck-us';
delete from public.category_stock    where truck_id = 'test-truck-us';
delete from public.referrals         where referring_truck = 'test-truck-us' or referred_truck = 'test-truck-us';
-- the truck itself: vans, menu, van settings, event types, events (and their stock, posts, private links),
-- devices, KDS sessions, drafts, places, WhatsApp rows and logs all cascade from it
delete from public.trucks where id = 'test-truck-us';
commit;

-- verify — after the commit, so the SQL editor shows it: every count 0, and Pizza Kitchen still there
select 'twin rows left (trucks / vans / items / events / orders)' as what,
  (select count(*) from public.trucks where id = 'test-truck-us') || ' / ' ||
  (select count(*) from public.truck_vans where truck_id = 'test-truck-us') || ' / ' ||
  (select count(*) from public.menu_items_db where truck_id = 'test-truck-us') || ' / ' ||
  (select count(*) from public.truck_events where truck_id = 'test-truck-us') || ' / ' ||
  (select count(*) from public.orders where truck_id = 'test-truck-us') as n
union all select 'pizza kitchen still there', (select count(*)::text from public.trucks where id = 'test-truck');
```

### 3d. Optional — the US service-fee maximum (a decision; not part of the twin) — NOT RUN

```sql
-- OPTIONAL — A DECISION FOR DOMINIC, NOT PART OF THE TWIN. NOT RUN — "run now" only if you choose it.
-- Touches the US country row (still switched off; no other US truck exists). Today the US service-fee maximum is NULL,
-- which the code reads as "no service fee allowed": the twin's 3 % + 30¢ resolves to nothing, and Manage › Payments
-- refuses a fee. 4 % + 50¢ is the figure the harness fixtures have always used — choose your own.
update public.country_settings
   set service_fee_truck_max_bps = 400, service_fee_truck_max_fixed_minor = 50, updated_by = 'Dominic — US dress rehearsal'
 where country_code = 'US' and enabled = false;
select country_code, enabled, service_fee_allowed, service_fee_truck_max_bps, service_fee_truck_max_fixed_minor from public.country_settings where country_code = 'US';
```

## 4. Stage 2 plan (localhost, `http://hatchgrab.localhost:3000`)

### Before starting
1. Run 3a, then 3b. Copy the Manage, Dashboard and KDS links from 3b's verify output.
2. **Dominic starts the dev server himself** (it loads `.env.local`).
3. Decide email handling (section 1, Emails), and optionally 3d.
4. Sign in as the account that owns Pizza Kitchen.
5. Open Manage › Schedule and move "Pier A Park" to the day you're testing (or keep it and use Start event); keep the
   overnight event for its own test.

### ⛔ Never during stage 2
- Press "Connect" on Payments (creates a live US Stripe account).
- Take a card payment.
- Open or change Pizza Kitchen or Pizzeria Gusto.

### Checklist (what to expect in US output)

| # | Where | Expect |
|---|---|---|
| 1 | Manage loads (trial) | Opens on **Billing** without crashing; plans read **"TBD"**; trial ends **"December 31, 2026"** |
| 2 | Manage › Menu | 30 items in $; allergens **Milk / Wheat / Fish / Tree nuts** (Allergen wizard: US 9 list); no photos |
| 3 | Manage › Schedule | Two NJ events in 12-hour times ("11:30 AM – 8:00 PM", "8:00 PM – 12:30 AM" with "Ends the next day"); dates "Sun, Oct 25"; ZIP 07030; phone time picker = one select per time ("10:45 PM"); Add event offers the US address style |
| 4 | Manage › Settings | Where you trade: Hoboken, New Jersey (typed; no suggestions); pre-order deadline in 12-hour; Van "Truck 1"; Pro/Max van add-on would read "TBD" |
| 5 | Manage › Payments | "Tax, tips and fees": Sales tax 6.625 %; tips 10/15/20 %; service fee: refused or none until 3d is decided; card fees "2.9% + 30¢" hedged; **do not press Connect** |
| 6 | Manage › Reports / Team / Social posts | $ amounts, mdy dates, "Pickup time" CSV header; Team shows the owner; weekly post "Week of …", Sunday-first, 12-hour |
| 7 | Setup / go-live checks | No live call site (they're unwired); by data the twin passes: allergen display mode card + info, van, capacity category. Email-verified depends on the account |
| 8 | Public truck page `/trucks/test-kitchen-us` | US formats ("Sun, Oct 25 · 11:30 AM – 8:00 PM"); no Village Foodie prompts (non-GB page); Order button |
| 9 | Customer order (pay at truck) | "Pickup time", 12-hour slots, "$"; totals: Subtotal + **Sales tax 6.625 %**; **no tip or service fee lines** (card only); basket fold only if ≥2 charge lines; confirmation "Order #1", "Pickup time: 12:00 PM" |
| 10 | Status / manage-my-order page | Pickup row right-aligned, time and venue on their own lines; cancel within the cut-off |
| 11 | Dashboard | Order card in $; "Tax & fees ▾ $x.xx" summary only if ≥2 charge lines; 12-hour times; capacity sidebar time column wide ("11:50 AM" on one line); Add order ASAP "11:50 AM" style |
| 12 | KDS (`/kds/<token>`) | Cook: full order number, time beside the name; Full: smaller Ready badge above the total; **no money lines** |
| 13 | Printed ticket preview | "PICKUP 12:45 PM"; tax row; amounts in $ (bytes: no-break spaces fold to spaces) |
| 14 | Emails (rendered, not sent) | "Pickup time: 12:45 PM", $ totals with the tax line, mdy dates |
| 15 | Cancel / refund paths without Stripe | Operator cancel and customer self-cancel on a pay-at-truck order; reject; no refund (card only) |
| 16 | Overnight event | Start "Hoboken Night Market" (8:00 PM–12:30 AM): slots after midnight, "(next day)" in finish-time, late/countdown correct after 12:00 AM, Upcoming until 12:30 AM. Needs the clock past 8 PM New York time (or the dates moved) |
| 17 | Schedule embed | `embed_enabled` copied (true): the embed/custom-domain schedule shows US formats |
| 18 | Posters | Weekly and single-event posts: 12-hour "11:30am – 8pm" poster style, "Week of", "CANCELED" |
| 19 | WhatsApp preview | The twin has no WhatsApp number (not copied), so the settings preview only; no messages |

### Needs Dominic present
- Signing in.
- Starting the dev server.
- The email decision.
- The 3d decision.
- Any action on Payments.
- The overnight test after 8 PM New York time.
- Watching for a real email if the Brevo key is set.

## 5. Read-only queries run (Supabase MCP), with results

1. **FKs to `trucks` via information_schema:** `[]`. That view only shows constraints this role owns, so I switched
   to pg_catalog.
2. **FKs to `trucks` via `pg_constraint`:** 43 rows. NO ACTION: orders, slot_capacity, collection_times,
   order_counters, referrals ×2, item_overrides, category_stock. SET NULL: messages, discovery_trucks. All others
   cascade.
3. **Pizza Kitchen row counts per table:** the table in §1.
4. **Live column lists** (trucks, truck_vans, menu_*, van_category_settings, event_types, truck_events,
   order_counters, country_settings): read and used.
5. **FKs to the menu, vans, events, places and modifier tables:** the menu and kitchen ones cascade.
   `menu_items_db.category_id` and `subcategory_id` are SET NULL.
6. **Pizza Kitchen settings** (non-secret columns only): GB, plan trial to 2026-12-31, `show_on_vf` / `show_on_hg`
   false, `excluded` false, `order_link_hg` true, `truck_order_email_enabled` false, `allergen_display_mode` card,
   `embed_enabled` true.
7. **`country_settings`:**
   - GB: on, VAT included, uk14.
   - US: off; USD, en-US, 12h, mdy, sunday; tax excluded, "Sales tax"; service fee allowed, **max NULL**; tips
     10/15/20; us9; prices NULL.
8. **CHECK and unique constraints:** as quoted in §1.
9. **Discovery query:** first attempt errored (`column "is_customer" does not exist` on `discovery_trucks`); the
   corrected query returned the discovery row, one truck per operator, the operator index, the `truck_users`
   columns, the vans, the event types, the categories, allergen labels and the future event.
10. **Operator Stripe flags** (no ids): no account, charges false, admin true.
11. **Items with allergens:** 22 items. Labels Gluten / Dairy / Lactose / Tree nuts / Fish; 4 items have photos.
12. **`extensions.gen_random_bytes`, triggers, generated columns:** the function exists; no triggers and no
    generated columns.
13. **FKs to `orders`:** `order_payments` (cascade) only.
14. **Twin SELECT tests:** the first errored (`cannot pass more than 100 arguments to a function`, fixed). The rest
    gave the results listed in §3.
15. **The preview (3a):** as shown above it.

## 6. For Dominic to confirm or decide
1. **`next build`:** run it (I couldn't: it loads `.env.local`).
2. **Emails:** is `BREVO_API_KEY` set in `.env.local`? Choose (a) your own address on test orders, or (b) the key
   unset for the session.
3. **Gluten → Wheat** on the twin's menu.
4. **The US service-fee maximum (3d):** set it (e.g. 4 % + 50¢) or leave none. It only matters for card orders and
   the Payments tab.
5. **Never press Connect** on the twin (it creates a live US Stripe account under your account).

## Files changed (uncommitted, on top of main `978f6f6` + the US layout fixes)
- `lib/country-settings-types.ts`: `planPricesDecided`, `withPlaceholderPlanPrices`.
- `app/manage/[token]/page.tsx`: BillingTab and the Settings van add-on.
- `components/FeatureGate.tsx`.
- `app/admin/page.tsx`.
- `scripts/us-unpriced-country.cjs` (new; added to `scripts/harnesses.json`).
- `scripts/schedule-graphics-places.cjs`, `scripts/_phase3-screens-us.cjs`: named re-pins.
