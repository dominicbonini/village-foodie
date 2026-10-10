# Phase 2D-1 — Country and trading area at signup, and the landing page by visitor country

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed · no SQL run · no truck, operator or `country_settings` value changed · Pizzeria Gusto and `outreach_templates` untouched · no emails sent**

> **Superseded in part, 10 October 2026:** the travel-distance question, `lib/travel-distance.ts`, the Countries page's Distance unit row and the `travel_radius_km` / `distance_unit` columns were removed afterwards. Migration 13 was rewritten and 14 added. See docs/remove-travel-distance-report.md.

New trucks now answer "Where's your truck based?" before anything else, on both signup paths. The answer sets the truck's country, currency, time zone and phone rule, and records its base town and how far it travels. Manage › Settings can edit everything except the country. Admin create-truck takes a Country. The landing page, /features, /compare and the plans PDF now show the visitor's country, chosen on the server, with a flag menu in the header (laptop and up) and the footer (all sizes).

**UK visitors see the same text as before**, apart from the two new country buttons. This is proven byte for byte on all four outputs.

Nothing in the brief arrived garbled. Four points are flagged below (§1). None of them blocked the work, so I built through them as the brief asked.

---

## 1. Flags (read these first)

1. **"UK output identical except flags and the setup step" vs the requested additions.** The brief also asks for a Manage › Settings group, a Countries page row and an admin Country select. These are new UK-visible surfaces. I treated them as requested additions, not as breaches of the identical-output rule. Everything else UK-facing is pinned identical (§5).
2. **"Start free" is not the current CTA.** The header CTA reads "Upload my menu →". The flag button sits between the nav links and that CTA, which is where the brief places it. The CTA wording is unchanged.
3. **The plans PDF route is admin-only.** It now prints the country the marketing pages would show that admin (`?country` → cookie → location → GB). Outreach's "attach Plans PDF" is a separate caller and stays GB: prospects still have no country.
4. **The query now survives the landing's redirect and rewrite (`proxy.ts`).** Before, `/landing?country=US` 308'd to a bare `/`, and the root rewrite dropped the query too, so `?country=` could never reach the landing. Both now copy the query across. With no query, nothing changes.

Also worth knowing:
- `provision-demo` (anonymous demos) stays GB.
- On a phone, the /setup stepper's four steps wrap onto two lines each. It does not overlap anything (screenshot `signup-country-390-setup-step.png`).
- A real bug was found and fixed while photographing. The "We guessed this from where you are" hint stayed visible after the visitor picked a different country. It now shows only while the guessed country is still the one selected, and a check pins this.

## 2. SQL — `supabase/migrations/20261010_13_truck_base_area.sql`

The migration is additive and safe to run twice (`add column if not exists`, and the CHECK is added only if missing). **Run it after 20261010_11 and 20261010_12, and before this code is tested or deployed.** The settings loader selects `distance_unit` by name, so older SQL means a 42703 error on every settings read.
- Every new truck column is nullable, and existing trucks stay NULL until they fill in Settings › Where you trade.
- `distance_unit` defaults to `'miles'`, which is right for both GB and US.

```sql
set lock_timeout = '3s';

begin;

alter table public.trucks add column if not exists base_place_id    text;
alter table public.trucks add column if not exists base_place_name  text;
alter table public.trucks add column if not exists base_region      text;
alter table public.trucks add column if not exists base_lat         numeric(9,6);
alter table public.trucks add column if not exists base_lng         numeric(9,6);
alter table public.trucks add column if not exists travel_radius_km integer;

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
comment on column public.trucks.travel_radius_km is
  'How far the truck usually travels to trade, in km — one of the choices in lib/travel-distance.ts (16/40/80/160 for miles countries, 15/40/80/160 for km countries). Used to place schedule events; NULL until chosen. Phase 2D-1.';

alter table public.country_settings add column if not exists distance_unit text not null default 'miles';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.country_settings'::regclass
       and conname = 'country_settings_distance_unit_chk'
  ) then
    alter table public.country_settings
      add constraint country_settings_distance_unit_chk check (distance_unit in ('miles', 'km'));
  end if;
end $$;

comment on column public.country_settings.distance_unit is
  'The unit travel distances are shown in for this country: miles or km. GB and US are miles. Phase 2D-1.';

commit;
```

To verify (read-only):
```sql
select column_name, data_type, numeric_precision, numeric_scale, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'trucks'
   and column_name in ('base_place_id','base_place_name','base_region','base_lat','base_lng','travel_radius_km');
-- expect six rows, all is_nullable = YES, base_lat/base_lng numeric(9,6)
select country_code, distance_unit from public.country_settings order by country_code;
-- expect 'miles' on GB and US
```

## 3. What was built

### 3a. The setup step — "Where's your truck based?"

The step lives in `components/setup/WhereBasedStep.tsx` and is shared by both signup paths. Its words are in `WHERE_YOU_TRADE_COPY` in `lib/settings-copy.ts`, which Manage also reads.

| Path | Where the step sits | The phone that follows |
|---|---|---|
| Demo modal (`components/DemoGetStarted.tsx`) | landing → **based** → truck → details. Same chrome, stepper and full-width Continue as the wizard's other steps; Back walks one step at a time | check, error and placeholder from the chosen country (`signupPhone`) |
| `/setup` (`app/setup/page.tsx`) | a new first stepper entry, "Where you're based"; the truck step gains a Back button | the same; the copy no longer comes from `?check=truck` |

**Country**
- A select of switched-on countries only, each with its flag. The list comes from `GET /api/setup/countries` (`lib/signup-countries.ts`), which sends names, zones, distance unit, phone copy and flag — never the settings row.
- Pre-filled from `x-vercel-ip-country` when that country is switched on, else GB.
- The "we guessed" hint shows only when the pre-fill came from location, and only while that country is still selected.

**Town or city**
- A text box with suggestions from the server-side Places routes, sharing one session token per search.
- When suggestions are unavailable, whatever is typed is kept.

**How far do you usually travel?**
- Four 44px buttons in the country's unit.

**Time zone**
- Shown only when the country has more than one.
- Pre-filled from the device's zone when it is in the country's list, otherwise the country's default.

**Checking**
- The page checks the answer with `lib/trade-area.ts` `checkTradeArea`, the same function the server runs. Every problem shows at once, in the server's words.

**Server (`app/api/setup/route.ts`)**
- `SIGNUP_COUNTRY` is gone.
- `create_truck` checks things in this order:
  1. The country must exist and be switched on.
  2. The trade area: the zone must be in the country's list, a town must be given, and the travel must be one of the unit's choices.
  3. Only then the phone, by the chosen country's rule and in its words.
- `provisionTruck` takes `country`, `timezone` and `tradeArea` and checks them again as the writer. A switched-off country is refused in plain words: "Trucks can't sign up in United States yet. Choose another country."
- A malformed point or place id is **dropped** (the town name is kept) and never refused.

### 3b. Travel choices — `lib/travel-distance.ts`, defined once

| Unit | Choices shown | Stored km |
|---|---|---|
| miles | Up to 10 miles · Up to 25 miles · Up to 50 miles · Further | 16 · 40 · 80 · 160 |
| km | Up to 15 km · Up to 40 km · Up to 80 km · Further | 15 · 40 · 80 · 160 |

### 3c. Places — `lib/places.ts`, `app/api/places/{suggest,details}`

- **API:** Places API (New). `places:autocomplete` is restricted to `includedRegionCodes: [country]` and `includedPrimaryTypes: [locality, postal_town]`. Details use the field mask `id,displayName,location,addressComponents`. Both carry the session token.
- **What comes back:** name, region (county for GB, state for US), lat/lng rounded to 6 places, and the place id.
- **Key:** sent from the server only, in `X-Goog-Api-Key`.
- **Never blocks signup:** a missing key, a Google error, a timeout (4s) or a switched-off country all return `200 { state: 'none' }` with `no-store`. The box then takes free text.
- **Rate limit:** `placesRatelimit` (Upstash, 60 a minute per IP). It fails open if Redis is down and is skipped on loopback and in development, as `/api/demo` does.

### 3d. Manage › Settings › Where you trade

- `components/manage/WhereYouTrade.tsx`, a card in the Truck details section, with labels from `WHERE_YOU_TRADE_COPY`:
  - **Country:** read-only, with "Your country can't be changed".
  - **Town or city:** the same suggestion box.
  - **How far you usually travel:** the four choices.
  - **Time zone:** only when the country has more than one.
- It saves through a new `update_trade_area` action:
  - The action checks all four values with `checkTradeArea` against the truck's own country settings.
  - It never writes the country or the currency.
  - It is staff-blocked.
  - It returns the truck's clock settings, so a zone change takes effect immediately.
- An older truck with no town yet sends nothing until both the town and the travel are given.

### 3e. Admin create-truck

- The form has a Country select of switched-on countries, pre-set to the location guess.
- The route requires `country` and no longer hard-codes `'GB'`.
- `provisionTruck` writes the country, currency and default zone from that country's settings.

### 3f. Countries page

- A "Distance unit" row (Miles / Kilometres), directly under Addresses.
- Fully wired: form, validation ("Choose miles or kilometres."), actions and loader (`oneOf`, so a bad value fails loudly).

### 3g. Marketing pages by visitor country

**Resolver (`lib/visitor-country.ts`)**
- Runs on the server for each request, in this order: `?country=XX` → `hg_country` cookie → `x-vercel-ip-country` → `MARKETING_COUNTRY` (GB).
- **A source counts only if its country is switched on.** Otherwise the resolver moves to the next source.
- Landing, /features, /compare and the PDF route all read it, so the first paint already carries the right prices.

**No caching across countries, gates kept**
- The three pages stay `force-dynamic`, and the resolver reads the request.
- /features and /compare check the host first, before any country read.
- /compare on Village Foodie is still a 404, with or without `?country`.
- The PDF route keeps `verifyAdmin` and `no-store`.

**Flag button (`components/landing/CountryMenu.tsx`, styles in `landing.css`)**
- **Header:** flag + short name + chevron, ≥1024px only, between Log in and the CTA. Not in the phone header.
- **Footer:** flag + full name + chevron, at every width, under the store badges.
- **Menu:** switched-on countries with flags, the current one ticked.
  - Opens down from the header and up from the footer.
  - Escape and a click outside close it, and arrow keys move between items.
- **Accessibility:** `aria-label="Country: United Kingdom. Change country"`. The button and every item are at least 44px tall.
- **Flags:** `country-flag-icons` 1.6.20, pinned exactly. The SVGs are read on the server and sent as data URIs for the countries shown only. No emoji.
- **Choosing a country** writes `hg_country` (1 year, SameSite=Lax) and re-renders on the server. A `?country` on the URL is removed so it can't outrank the new choice.
- **A `?country=XX` link** keeps its choice: the menu writes the cookie, so it sticks on later pages and visits.

**Caching:** a cached country list (`listCountrySettingsCached`, 60s, cleared with the existing cache) keeps the per-request cost to one read a minute. The admin page keeps its uncached read.

## 4. GOOGLE_MAPS_API_KEY

**Missing in this shell — Dominic to confirm in Vercel.** No `.env*` file was opened. Nothing else in the code base uses this key, so it is probably not set yet.
- **Until it is set,** the town box takes free text and signup works normally (proven in §5).
- **Once set:** the key needs **Places API (New)** enabled. It is used only from the server, so restrict it by API (Places), not by HTTP referrer.

## 5. Proof

| Check | Result |
|---|---|
| `marketing-country-parity` (new, 121 checks) | ✅ **UK: landing, /features and /compare text and attributes byte-identical to the BEFORE snapshot**, with the country menu replaced by an empty marker. This holds for 4 visitor cases each (no header; GB; US with US switched off and `?country=US` plus `hg_country=US`; a country with no row) and for a UK visitor with US switched on. **The plans PDF (GB) is identical.** Removing the two real buttons leaves the marked page exactly, and each button shows its name, flag image and aria-label, with no emoji. **US switched on:** a US visitor gets $39/$59 in the server render on all three pages. `?country=GB` beats the US location and tells the menu to keep GB, and the next visit (cookie GB) stays UK. The cookie beats the location. The PDF prints US prices. **US off:** UK prices, and only the UK in the menu. The precedence rule is checked on its own. force-dynamic, the brand gate before the country read, and /compare 404 on Village Foodie with `?country` are all pinned |
| `signup-country` (new, 61 checks) | ✅ **GB** writes GB / GBP / Europe/London plus place id, name, region, point and 40 km. **US** writes USD and America/Chicago, and with no zone sent gets America/New_York. **Refused in words with nothing written:** switched-off US, a New York zone on GB, no country, an unknown country, no town, and five bad travel values. **Key missing:** both Places functions return none without calling Google, both routes answer 200 `{state:'none'}` with no-store, a typed town is saved as free text, and a malformed point is dropped. **Places with a stubbed Google:** the request shape is checked (endpoint, region, types, session token, key header, field mask), region is the county for GB and the state for US, and errors return none. **Phone:** a UK number on a US truck is refused in US words, the same number is accepted on GB, and a bad number on GB gets the unchanged UK words. **Admin:** US gives USD and the default zone, gb gives GB/GBP/London, no country or a switched-off country is refused, and no `'GB'` is hard-coded. `provisionTruck` refuses an off country and an off-list zone itself. The Manage action is pinned |
| `signup-landing-screenshots` (new, 71 checks, not in the sweep — it needs a build) | ✅ No page errors, no sideways scroll at any width. **Header at 1440 and 1024:** items on one line, none overlapping, button between Log in and the CTA, ≥44px. **390:** no header button. **Footer:** button ≥44px with the full name, no overlap with the links and badges. **Menus:** the header menu opens in view with flags and the UK ticked, items ≥44px; the footer menu opens upward inside the screen. **Setup (1440 and 390):** the exact copy, GB pre-filled with the hint, four 44px choices in miles, no zone for the UK, 7 zones for the US, suggestions inside the screen, the hint gone after switching, every error at once, then the truck step with the UK phone placeholder. **Demo modal:** the step fits the screen and continues to "About your truck" |
| `countries-api` (77) | ✅ 5 new checks: seeded rows on miles, the row directly under Addresses, km saved, an unknown unit refused in words before the CHECK |
| `phone-parity` | ✅ Every UK number is accepted, stored and linked as before. The setup screen's only named change is the new stepper entry plus the Back button. Pins moved to `signupPhone` / `phoneCopyOf(countryRow)` |
| `countries-screenshots` (26, not in the sweep) | ✅ Its expected rows now include Short name, Example phone number, Phone number check (Phase 2C) and Distance unit |
| Client bundles after `next build` | ✅ None of `country_settings`, `getCountrySettings`, `listCountrySettings`, `flagDataUri`, `distance_unit`, `default_timezone`, `GOOGLE_MAPS_API_KEY`, `X-Goog-Api-Key`, the Places host, or any flag SVG |
| `tsc --noEmit` | ✅ clean |
| eslint, 38 touched files vs HEAD | ✅ No rule count grew in any file. Errors 314 → 312, warnings 92 → 92. The new files are clean. (The first pass found 5 new errors, all fixed: setState in an effect ×3, `any` ×2) |
| `next build` | ✅ exit 0; landing, /features, /compare, the PDF and the Places and setup routes are all dynamic (ƒ) |
| Harness sweep (`scripts/run-harnesses.cjs`, 105 files) | ✅ **105 / 105 passed.** The first full run failed three (`demo-welcome-open`, `design-fonts`, `outreach-reply-attach` — causes and fixes below); all three were fixed and the whole sweep re-run clean |

**Harness changes**
- **New:** `marketing-country-parity`, `signup-country` (registered), and `signup-landing-screenshots` (on demand, like `countries-screenshots`).
- **`_render-kit`:** a `stubs` bundle option.
- **`countries-api`:** the `distance_unit` column, its CHECK and section 4c.
- **`phone-parity`:** the setup render moved to the new step, and pins moved.
- **`outreach-reply-attach`:** the PDF route pin now names the resolved country (the attach route stays GB and its pin is unchanged).
- **`design-fonts`:** not changed. My comment held a `/*`, which that harness forbids, so the comment was reworded.
- **`demo-welcome-open`:** not changed. It compiles without strict null checks, so `!r.ok` became `r.ok === false` in the step.

**Screenshots (docs/screenshots/)**
- **Setup (1440 and 390):** `signup-country-{1440,390}-setup-step.png`, `-setup-suggestions.png`, `-setup-us-zone.png`, `-demo-modal-step.png`.
- **Landing header:** `landing-country-1440-header.png`, `-header-menu.png`.
- **Landing footer:** `landing-country-{1440,390}-footer.png`, `landing-country-390-footer-menu.png`.
- **Phone header (no button):** `landing-country-390-header.png`.
- **Countries page:** `countries-*` (re-taken with the new row).
- Fonts in these images are the system fallback, because next/font is Next's own.
- One overlap-class fix came from the photos: the footer button's padding left its text inset from the links' right edge. It is now aligned on desktop.

## 6. Before deploying

1. Run 20261010_11, _12 and then _13, in that order.
2. Set `GOOGLE_MAPS_API_KEY` in Vercel, with Places API (New) enabled. Optional: without it, the town box is free text.
3. Existing trucks have no base town or travel distance until they fill in Settings › Where you trade. Nothing reads these fields yet; they are for placing schedule events in a later phase.

## 7. Rules kept

| Rule | |
|---|---|
| main as checked out; never push or deploy; no process killed | ✓ |
| No SQL run; SQL only in this report and in chat; nothing dropped | ✓ one migration file, written, not run |
| No `.env*` opened; key reported as set/missing only | ✓ |
| No truck, operator or `country_settings` value changed; fixtures and in-memory stores only | ✓ |
| Pizzeria Gusto and `outreach_templates` untouched; no emails sent | ✓ |
| UK output identical except the flag buttons and the setup step | ✓ proven (§5), with the requested additions named in §1 |
