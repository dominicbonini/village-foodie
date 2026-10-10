# Phase 2D-1 follow-up — remove the travel distance question

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed · no SQL run · no truck, operator or `country_settings` value changed · Pizzeria Gusto and `outreach_templates` untouched**

"How far do you usually travel?" is gone from both signup paths, Manage › Settings › Where you trade, and the copy. The setup step now asks three things:
- the country;
- the town or city;
- the time zone, only when the country has more than one.

The server no longer asks for, accepts, validates or writes a travel distance. A value sent anyway is ignored, never refused. Everything else from Phase 2D-1 is unchanged: the country must be switched on, the zone must be in its list, the town is required, typed free text is kept, and a malformed point or place id is dropped.

Also gone:
- `lib/travel-distance.ts` is deleted.
- The Countries page no longer has its "Distance unit" row.
- The loader, types, form and save code no longer read or write `distance_unit`.

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 1. SQL

### `20261010_13_truck_base_area.sql` — rewritten

It now adds only the five base columns, with their comments. There is no `travel_radius_km` and no `distance_unit`.
- **When to run it:** after 20261010_12, before this code is tested or deployed. Signup and Settings write these columns.
- **Safety:** it is additive and safe to run twice. Every column is nullable, and existing trucks stay NULL.

```sql
set lock_timeout = '3s';

begin;

alter table public.trucks add column if not exists base_place_id    text;
alter table public.trucks add column if not exists base_place_name  text;
alter table public.trucks add column if not exists base_region      text;
alter table public.trucks add column if not exists base_lat         numeric(9,6);
alter table public.trucks add column if not exists base_lng         numeric(9,6);

comment on column public.trucks.base_place_id is
  'Google Places place id of the town or city the truck is based in (Places API New). NULL when typed freely or not given. Phase 2D-1.';
comment on column public.trucks.base_place_name is
  'The town or city the truck is based in, as shown to the operator ("Sudbury"). Free text when no suggestion was picked. Phase 2D-1.';
comment on column public.trucks.base_region is
  'The county (GB) or state (US) of the base town, from Places; NULL when typed freely. Phase 2D-1.';
comment on column public.trucks.base_lat is
  'Latitude of the base town, from Places; NULL when typed freely. Phase 2D-1.';
comment on column public.trucks.base_lng is
  'Longitude of the base town, from Places; NULL when typed freely. Phase 2D-1.';

commit;
```

### `20261010_14_retire_travel_columns.sql` — new

This file is for the case where the **first** version of 13 was already run.
- **What it does:** a guarded DO block comments `trucks.travel_radius_km` and `country_settings.distance_unit` as retired, but only for the columns that exist.
- **What it doesn't do:** it drops nothing and changes no data.
- **Run it twice, or in either order with the new 13:** you get the same result. If the old 13 never ran, the file does nothing.
- **If `distance_unit` exists,** it keeps its `NOT NULL DEFAULT 'miles'` and its CHECK. The Countries page's inserts no longer name the column, so the default fills it and the inserts still succeed.

```sql
set lock_timeout = '3s';

begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trucks' and column_name = 'travel_radius_km'
  ) then
    execute $c$comment on column public.trucks.travel_radius_km is 'RETIRED 10 October 2026 — never asked; unread and unwritten. Kept rather than dropped.'$c$;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'country_settings' and column_name = 'distance_unit'
  ) then
    execute $c$comment on column public.country_settings.distance_unit is 'RETIRED 10 October 2026 — never asked; unread and unwritten. Kept rather than dropped.'$c$;
  end if;
end $$;

commit;
```

### Verify (read-only)

```sql
select column_name, data_type, numeric_precision, numeric_scale, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'trucks'
   and column_name in ('base_place_id','base_place_name','base_region','base_lat','base_lng');
-- expect five rows, all is_nullable = YES, base_lat/base_lng numeric(9,6)

select table_name, column_name, col_description(format('public.%I', table_name)::regclass, ordinal_position) as comment
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'trucks' and column_name = 'travel_radius_km')
     or (table_name = 'country_settings' and column_name = 'distance_unit'));
-- zero rows (the first 13 was never run), or each comment starts "RETIRED 10 October 2026"
```

**Order to run:** 20261010_11 → _12 → _13 (new) → _14.

## 2. What changed

| Where | Change |
|---|---|
| `components/setup/WhereBasedStep.tsx` (both signup paths) | The travel buttons, their label, their hint and the `TravelChoices` component are gone. `BaseAnswer` is now country, zone and place; the body sends the zone and the five base columns. Client checking still uses `checkTradeArea` and still shows every problem at once |
| `components/DemoGetStarted.tsx`, `app/setup/page.tsx` | No code change needed; both take the step's answer as a whole |
| `components/manage/WhereYouTrade.tsx` | The travel control is gone. The card now saves once a town is given (it used to wait for town **and** travel) |
| `lib/settings-copy.ts` | `travel`, `travelQuestion` and `travelStepHint` are removed from `WHERE_YOU_TRADE_COPY` |
| `lib/trade-area.ts` | No travel import, check, error or value. `TradeAreaValues` is the zone plus the five base columns. `CountryFacts` no longer needs a distance unit |
| `lib/provision-truck.ts`, `app/api/setup/route.ts`, `app/api/manage/route.ts` (`update_trade_area`) | Travel is not passed, not read and not written. The Manage action writes only what `checkTradeArea` returns, so a stray `travel_radius_km` is ignored |
| `lib/travel-distance.ts` | Deleted |
| Countries page (`components/admin/CountriesTab.tsx`) and `lib/country-settings.ts`, `lib/country-settings-types.ts`, `lib/admin/country-form.ts`, `lib/admin/country-actions.ts` | The "Distance unit" row is removed. `distance_unit` is out of the column list, the mapper, `CountrySettings` (`DistanceUnit` and `DISTANCE_UNITS` deleted), the form, validation, values, dirty list and save columns |
| `lib/signup-countries.ts`, `lib/signup-country-types.ts` | `distanceUnit` is no longer sent to the browser |
| `app/manage/[token]/page.tsx` | `travel_radius_km` is removed from the `Truck` type |

The only places that still mention travel are three comments that explain the removal.

## 3. Proof

| Check | Result |
|---|---|
| `marketing-country-parity` (121) | ✅ **The UK landing page, /features, /compare and the plans PDF are still byte-identical to the BEFORE snapshot apart from the flag buttons.** The US, `?country` and switched-off cases are unchanged |
| `signup-country` (62) | ✅ **GB** writes GB / GBP / Europe/London plus place id, name, region and point, with no travel column. **US** writes USD / America/Chicago plus Austin, Texas and its point, and with no zone sent gets America/New_York. **The refusals are unchanged**: switched-off country, off-list zone, no country, unknown country, no town. **Travel sent anyway** (25, "forty", null) is ignored: the truck is created and the value is not written. **No code names it** in the step, the modal, /setup, the Settings card, the copy, provisioning, the setup API or the signup countries, and `checkTradeArea` returns exactly the zone plus the five base columns. Places, phone, admin and Manage checks are unchanged |
| `countries-api` (75) | ✅ Section 4c now checks that the page, loader, types, form and save code never name `distance_unit`; a row read back and the form have no such field; saves still work. The fake store no longer models the column |
| `phone-parity` | ✅ Unchanged result; its setup render no longer carries travel |
| `signup-landing-screenshots` (69, on demand) | ✅ Step fields are exactly `base-country,base-town` for the UK, plus the zone for the US. No travel text, hint or choice buttons. Continue with no town shows "Tell us the town…", and a town alone continues to the truck step with the UK phone box. The demo modal step has no travel question. Landing header, footer and menus pass as before |
| `countries-screenshots` (26, on demand) | ✅ Its expected rows no longer include Distance unit |
| Client bundles after `next build` | ✅ The same exclusions hold (`country_settings`, `getCountrySettings`, `listCountrySettings`, `countrySettingsForTruck`, the Places host, `X-Goog-Api-Key`, `GOOGLE_MAPS_API_KEY`, any flag SVG, `signupCountries`, `resolveVisitorCountry`, `flagDataUri`, `distance_unit`, `default_timezone`, `card_fee_online_pct`), and now also `travel_radius_km` and "Up to 25 miles" |
| `tsc --noEmit` | ✅ clean |
| eslint, 37 touched files vs HEAD | ✅ No rule count grew in any file. Errors 314 → 312, warnings 92 → 92 (as before this follow-up). The new files are clean |
| `next build` | ✅ exit 0 |
| Harness sweep (105 files) | ✅ **105 / 105 passed** on the first run |

**Harness changes**
- **`_country-settings-gb.cjs`:** `distanceUnitDefault` is removed, because the new 13 has no `distance_unit` to parse.
- **`signup-country`, `countries-api`, `phone-parity`, `signup-landing-screenshots`, `countries-screenshots`:** updated as above.

**Screenshots retaken (docs/screenshots/)**
- **Setup:** `signup-country-{1440,390}-setup-step.png`, `-setup-suggestions.png`, `-setup-us-zone.png`, `-demo-modal-step.png`.
- **Countries page:** `countries-{1440,1920}-*.png`.
- **Landing:** the `landing-country-*` images were re-taken in the same run and are unchanged in content.

## 4. Rules kept

| Rule | |
|---|---|
| main as checked out; never push or deploy; no process killed | ✓ |
| No SQL run; SQL only in this report and in chat; nothing dropped | ✓ 13 rewritten, 14 added, neither run; 14 only comments |
| No `.env*` opened; no live writes; Pizzeria Gusto and `outreach_templates` untouched | ✓ fixtures and in-memory stores only |
