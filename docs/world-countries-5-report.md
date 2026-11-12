# world-countries-5 — the 167 go-live countries, region blocks, the new country selector, Mexico off

12 November 2026. Built and prepared; nothing is switched on. Nothing deployed, Pizzeria Gusto untouched, no `outreach_templates`
row, no `.env*` file opened. Commits: `71c9cf89` (the 210-row go-live.csv, its own commit, as asked), `5d90fbfb` + `f262d9b3`
(the 167 countries as data: registry, generic address format, three migrations), `2d2a5e2e` (region blocks, the selector, the
words in every language, harness re-pins), `0db83f8b` (the 12 harnesses pricing-copy-4's sweep listed as broken by this
work, re-pinned, §7), and this report.

## Summary

- **Countries:** the 167 new countries are in the database as rows with **`enabled = false`**. That is 167 `country_settings`
  rows, 501 `plan_prices` rows and 167 `country_billing` rows. Migrations 20261093 and 20261094 were run with
  `scripts/db-migrate.cjs`, with your approval.
  - Nothing new is visible anywhere until the **switch-on migration (20261095)** runs. It is written and committed, and it is
    **not run**.
  - It enables the 167, turns MX off, and sets the VAT-number flag on AE and BR.
- **Mexico:** no truck has ever been in MX, so nothing stops it being switched off. It switches off with the 167, in 20261095.
- **Region blocks:** one data list (`lib/region-blocks.ts`).
  - It is checked by the trade-area check that signup, the signup step, provisioning and Manage › Where you trade all run.
  - The refusal is your sentence, *"Sorry, HatchGrab isn’t available in your region yet."*, in all 48 languages.
- **Selector:**
  - The five region buttons sit at the top on every screen size.
  - Laptop and iPad get a 5- or 4-column grid that needs no scrolling.
  - Phones get a full-screen panel: the region buttons scroll sideways, there is one country per row, and every target is
    44px or more.
  - No codes are shown and there is no search. The region names are translated into every language.
- **Tests:** world-countries-5 22/22, and every harness this work touched passes. That includes the 12 that pricing-copy-4's
  sweep found broken by this work: they are re-pinned and listed in §7. The full sweep's result is in §7.
- **Before switch-on — questions for you (§9):**
  1. Store badges in the new countries.
  2. 18 countries billed in USD or EUR whose menus would also show USD or EUR.
  3. Serbian and Montenegrin names in the selector show in Cyrillic.

---

## 1 · The 167 countries

**Source:** `docs/world-countries-4/go-live.csv`, 210 rows: the 43 live countries plus the 167 new ones. Mexico is not in it.
The generator is `scripts/_world-countries-5-rows.cjs`. It is committed, and it writes migration 20261094 from the CSV and the
exchange rates in `docs/world-countries-5/fx-gbp.json` (open.er-api.com, GBP, 12 Nov 2026 00:02 UTC).

### 1.1 What each new country got

| Part | What |
|---|---|
| `country_settings` | One row per country, `enabled = false`, `updated_by = 'world-countries-5'`. The name is the English short name (Intl). The row also holds the currency, locale, clock, date order, week start, phone code and example, time zones, address format, allergen set, tax label, card-fee label and store flags. `vat_number_required` is set from the CSV. |
| `plan_prices` | Pro monthly, Pro's included amount and Unlimited monthly, from the CSV, in its `billing_currency`, in Stripe minor units. Zero-decimal currencies are in whole units. |
| `country_billing` | The CSV's payment model. **160** countries are `billed_at_truck` (customers pay at the truck and the truck is billed monthly). **7** are `fee_from_payment`: GF, GP, MQ, MF, RE and YT as France, and PR as the US. `min_charge_minor` is about £5, never above the country's Unlimited price. |
| Plans offered | The same pattern as BR, MX and TH, wherever no fee can be taken from a payment. Pay as you go and Pro exist as rows but are **not offered**. Unlimited is offered and is the trial-end plan. The 7 online territories offer every plan, as their parent does. |
| Landing segment | `/xx` at the ISO code, for all 167 (`lib/marketing-country.ts`). As before, a switched-off country's `/xx` redirects to `/uk`. It is in no sitemap, hreflang set, router pick, menu or signup list until it is enabled. |
| Currency | 94 new currencies in `lib/currencies.ts` (116 in all). Each has a comment line, Stripe's decimals and its home locale. The currency CHECK is widened to match (20261093). |
| Address format | One shared **`intl`** format: town or city, an optional postal code, and the Places top-level region name kept. The French territories use `fr`, Puerto Rico `us`, Jersey, Guernsey and the Isle of Man `gb`, and Åland `fi`. |
| Allergen set | `codex` for 156 countries. `uk14` for the French territories, Åland and the Crown Dependencies (10). `us9` for Puerto Rico. |

### 1.2 Locales

- **In their own language:** the committed languages only.
  - Ukraine uk-UA, Kyrgyzstan ru-KZ, Kazakhstan kk-KZ, Uzbekistan uz-UZ, Azerbaijan az-AZ, Georgia ka-GE, Armenia hy-AM,
    Mongolia mn-MN, Bangladesh bn-BD, Nepal ne-NP.
  - **India and Pakistan: en-GB.**
- **Everyone else:** the CSV's `launch_locale`. All 70 locales used are registered app locales.
- **These countries switch language later** (each moves when its language is committed; today they run on their launch_locale):

| Country | Later language |
|---|---|
| Bosnia and Herzegovina (BA) | bs-BA |
| Andorra (AD) | ca-AD |
| Albania (AL) | sq-AL |
| North Macedonia (MK) | mk-MK |
| Sri Lanka (LK) | si-LK (or ta-LK) |
| Cambodia (KH) | km-KH |
| Laos (LA) | lo-LA |
| Tanzania (TZ) | sw-TZ |
| Ethiopia (ET) | am-ET |
| Uganda (UG) | sw-TZ as a second language only |
| Kenya (KE, already live) | sw-TZ as a second language only |
| Philippines (PH, already live) | fil-PH (research: en-PH may stay the default) |

### 1.3 Decisions I made (say if any should change)

1. **The menu currency is the billing currency.** `plan_prices` has no currency column, so a country's prices and its menu
   currency are the same column. Most of the 39 countries billed in USD or EUR use that currency anyway (EC, SV, PR, ME, AD and
   others). **For 11 of them, the truck's menus would show USD or EUR instead of their own money: BH, JO, KW, OM, TN (all
   three-decimal currencies, which we can't bill in), BT, TM, ER, MR, ST and ZW.** This is question 2 in §9.
2. **One generic address format** (`intl`) for 156 countries, instead of 156 researched ones.
   - It takes a town or city, an optional postal code of 2 to 10 letters, digits, spaces or hyphens, and the Places region
     name.
   - A per-country format can replace it later without a data change apart from that row's `address_format`.
3. **Card fees are 0 with the label "<Country> cards"** for the 160 countries billed at the truck: no online card payments there,
   so no fee table is shown. The French territories use France's 1.5% + 25c. Puerto Rico uses the US's 2.9% + 30¢ (10¢ tap to
   pay), with "Sales tax", tax not included and tips of 10/15/20.
4. **The tax label is "Tax"** for 160 countries. It is "TVA" for the six French territories and "Sales tax" for Puerto Rico.
   Prices include tax everywhere except Puerto Rico.
5. **The minimum charge is about £5,** rounded to two significant figures, and **never above the Unlimited price.** That cap
   applies in Indonesia, Egypt and Nigeria, whose Unlimited price is under £5.
6. **Clock, date order and week start come from Intl's data (CLDR) for each country.** One oddity: **Iceland's week starts on
   Sunday** in Node's data. I kept Intl's answer; say if it should be Monday.
7. **Pitcairn (PN):** the phone library has no metadata for it. It has phone code 64 (as New Zealand), no example, and the
   phone check is off.
8. **Ukraine's time zones leave out Europe/Simferopol (Crimea).**
9. **Names.** English short names come from Intl. The local short names for Kyrgyzstan and Macau are set by hand
   (Кыргызстан, 澳門).
10. **The VAT-number flag** is a new column, `country_settings.vat_number_required` (data only, nothing reads it). It is true
    for the CSV's 41 `vat_number_required` countries: the 39 new ones in the rows migration, and **AE and BR in the switch-on
    migration**. That is an UPDATE to live rows, so it waits for your approval with the rest.
11. **Until the code is deployed, Admin › Countries names the 167 rows as unreadable.** The deployed code doesn't know the new
    currencies or the `intl` format. It leaves those rows out of every list and names them; it does not break. This clears on
    deploy. **Deploy before running the switch-on.**

---

## 2 · Mexico

- **No MX truck has ever existed** (read-only check below; `trucks.country` holds GB 12, FR 3, US 1 and no MX). Nothing is
  trading, so there was no reason to stop.
- MX's row is still `enabled = true` today. It **switches off in 20261095**, in the same transaction as the 167 switch on.
- `lib/country-regions.ts` keeps MX in Americas for as long as its row is on.

---

## 3 · Region blocks

**One list, as data:** `lib/region-blocks.ts` (`REGION_BLOCKS`).

**How it is enforced:**
- `lib/trade-area.ts` `checkTradeArea` refuses a match with the new code **`region_blocked`**.
- That one check is run by signup (`/api/setup`), the signup step in the browser (it refuses before anything is sent),
  provisioning, and **Manage › Settings › Where you trade** (`/api/manage update_trade_area`). That covers both "at signup" and
  "when a truck saves an address".
- The sentence is `tradeArea.region_blocked`: *"Sorry, HatchGrab isn’t available in your region yet."* It is in en-GB and all 48
  language bases, with back-translations. It does not name the region.

| Block | ISO | How it is matched |
|---|---|---|
| Crimea | UA-43 | Region name, plus its main towns (Simferopol, Yalta, Kerch, Feodosia, Yevpatoria…) |
| Sevastopol | UA-40 | Region name, plus the town |
| Luhansk oblast (all) | UA-09 | Region name, plus its main towns |
| Donetsk oblast (whole oblast, as you said) | UA-14 | Region name, plus its main towns |
| Zaporizhzhia oblast (whole) | UA-23 | Region name, plus its main towns |
| Kherson oblast (whole) | UA-65 | Region name, plus its main towns |
| Abkhazia | GE-AB | Region name, plus its towns (Sukhumi, Gagra, Gudauta, Pitsunda, Ochamchire, Tkvarcheli, Gali…) |
| **South Ossetia** | (part of GE-SK and others) | **By town** (see below) |
| Transnistria | MD-SN | Region name ("Stînga Nistrului" / Transnistria / Приднестровье), plus its towns |
| Saskatchewan | CA-SK | The picked town's province code `SK` (and the name) |

**How a town is matched:**
- Names are compared with accents and case dropped, every non-letter run becoming one space (the allergen guard's rule).
- **Region name:** a stem found inside the *picked* place's top-level region name (Places `administrative_area_level_1`, now
  kept for the `intl` format). Places can answer in different languages, so the stems cover English, Ukrainian, Russian,
  Georgian, Romanian and the major other spellings.
- **Town:** the town's own name (its first comma-separated part, the whole of it) against the block's list of towns. This also
  catches a town **typed** without picking a suggestion.

**South Ossetia, as you asked how:**
- Google Places files its towns under Georgia's own regions: Tskhinvali and Java under Shida Kartli, Akhalgori under
  Mtskheta-Mtianeti, Kvaisi under Racha-Lechkhumi. So no region name identifies it.
- It is therefore **blocked by town:** Tskhinvali, Akhalgori (Leningori), Java (Dzau), Znauri and Kvaisi, in Latin, Georgian and
  Cyrillic spellings.
- There are also region-name stems ("South Ossetia", "Samachablo", "Tskhinvali Region", ოსეთ, осет) in case Places ever names it.
- Gori, Shida Kartli's other main town, is accepted (tested).

**Things to know:**
- **Bender (Tighina)** is on Transnistria's town list. In law it is its own municipality (MD-BD), but it is held by Transnistria.
  Say if it should come off.
- **The whole Kherson and Zaporizhzhia oblasts are blocked,** including their Ukrainian-held cities, because you said to block
  those oblasts.
- **A town typed by hand that is not on a block's town list is not caught,** because the region is only known from a picked
  place. The lists hold each region's main towns.
- **Saskatchewan** moves from canada-2's `signupClosed: taxLines` to this list, and its sentence becomes the plain one.
  **Quebec (language) and Manitoba (tax lines) keep their own closures and sentences, unchanged.** canada-2 is re-pinned to
  match.

**Tested** (`scripts/world-countries-5.cjs` §2):
- **33 towns refused.** Picked by region name in English, Ukrainian, Russian, Georgian and Romanian, typed by town, and Canada by
  code.
- **16 accepted:**
  - Kyiv, Lviv, Odesa, Dnipro and Kharkiv;
  - Tbilisi, Batumi, Gori and Kutaisi;
  - Chișinău, Bălți and Cahul;
  - Calgary;
  - the same names in another country: Java in Indonesia, Donetsk in Russia, Kherson in the US.

---

## 4 · The country selector

**Where it shows:** the footer menu only (`components/landing/CountryMenu.tsx`), as before. The CSS is in
`app/(public)/(site)/landing/landing.css`.

**Layout:**
- **Title** "Choose your country", with the line "Prices, language and settings change to match." (both unchanged).
- **Region buttons:** Europe, Americas, Asia Pacific, Middle East, Africa, at the top on every screen size.
  - They form a tablist, and each region has its own list (its panel).
  - **It opens on the visitor's region:** the region of the country the page is for.
  - Only regions with an enabled country appear. With a single region there are no buttons, so today's UK/US-only page looks
    as before, minus the codes.
- **Each country:** its flag, its name in its own language (Intl, in the row's locale), and a tick on the current one. Sorted by
  English name. **No codes and no search.** The closed button in the footer keeps its small code chip, as before; tell me if
  that should go too.
- **Only enabled countries appear.** Region membership comes from the CSV's `region` column (`lib/country-regions.ts`, plus MX
  in Americas while it is on).

**Sizes:**
- **Laptop:** a 72rem-wide box with a **5-column** grid. Europe's 55 countries make 11 rows, which fit.
- **iPad:** **4 columns** at ≤1100px (portrait), 5 in landscape. No scrolling at either.
- **Phone (≤720px):** a **full-screen panel**.
  - The region buttons scroll sideways and are 44px tall.
  - **One country per row, 44px rows.** The list scrolls inside the panel, and the page never scrolls sideways.

**Region names in every language:** `landingNav.country.regions.*`, in en-GB and all 48 bases, with back-translations.
- For example: French Europe / Amériques / Asie-Pacifique / Moyen-Orient / Afrique.
- German Europa / Amerika / Asien-Pazifik / Naher Osten / Afrika.
- Arabic أوروبا / الأمريكتان / آسيا والمحيط الهادئ / الشرق الأوسط / أفريقيا.
- The RTL check passes (125/125).

**Screenshots** are in `docs/world-countries-5/shots/`:
- **How they were made:** the real /uk landing page was rendered by the render kit with **all 210 go-live countries switched on
  in memory only**. No database was read or written for this. The page was served from localhost with the real landing.css and
  photographed in Chromium with the box open.
- **The six shots:**
  - `selector-laptop-1512.png` (Europe) and `selector-laptop-asia-1512.png` (Asia Pacific), at 1512×945;
  - `selector-ipad-portrait-820.png` (820×1180, 4 columns) and `selector-ipad-landscape-1180.png` (1180×820, 5 columns);
  - `selector-phone-390.png` (Europe) and `selector-phone-americas-390.png` (Americas; the buttons scrolled), at 390×844.
- **Measured** (`measures.json`):
  - The box does not scroll at laptop or iPad size; the last row ends at 756px of 945 (laptop) and 693px of 820 (iPad landscape).
  - On the phone, items and buttons are 44px or more.
  - No page sideways scroll at any width.
  - No codes shown, and exactly one tick.
- **Fonts:** the shots use the system font (the render has no built font files). The real page uses the site's fonts.

**Seen in the shots, worth a look:**
- **Serbia and Montenegro show in Cyrillic** (Србија, Црна Гора). Their locale is sr-RS, and Intl writes Serbian in Cyrillic by
  default. Serbia already shows this way today; Montenegro is new. The app's Serbian is Latin, so this is question 3 in §9.
- **Two long names are cut short with "…" at 5 columns:** "Bosna i Hercegovina" and "Svalbard og Jan Mayen".

---

## 5 · Not in this build (as the brief says)

VAT-number capture, threshold logging, the sanctions check and EU OSS are not built. The VAT flag is stored as data only.
Countries that are not in the CSV get no rows.

---

## 6 · App stores

**Nothing in App Store Connect or Google Play was changed.** From `countries.csv`'s storefront column:

- **App Store and Google Play (111):**
  - AL AM AZ BA GE IS MD ME MK RS TR UA
  - AI AG AR BS BZ BM BO KY CL CO CR DM DO EC SV GD GT GY HN JM MS NI PA PY PE KN LC VC SR TT TC UY VG
  - BT BN KH FJ IN ID KZ KR KG LA MO MV FM MN NR NP PK PW PG SB LK TW TJ TO TM UZ VU
  - BH IL JO KW OM QA SA
  - DZ AO BJ BW BF CV TD EG SZ GA GM GW LR MG MW MR MU MA MZ NA NE NG ST SN SC SL ZA TZ TN UG ZM ZW
- **Google Play only (39).** Most of these are territories that Play covers through a parent:
  - FO GL GG VA IM JE MC SM SJ AX
  - AW BQ CW FK GF GP MQ PR BL MF PM SX VI
  - AS CX CC CK PF GU NC NU NF MP PN TK WF YT RE SH
- **Neither store (17):** AD BD KI MH WS TL TV BI CF KM DJ GQ ER ET GN LS TG.
- **App Store only:** none.

⚠️ **Question 1 (§9):** the new rows set `ios_app_available` / `android_app_available` from that column. So after switch-on, the
store badges will show in those countries. That is only right if the app is actually *available* in those storefronts. If its
availability is still limited to the live countries, badges would point at an app those visitors can't get.

---

## 7 · Tests

**New:** `scripts/world-countries-5.cjs`, **22/22.** It checks:
- the CSV and the generator: 210 rows and 167 new;
- the locales;
- the rows migration: all off;
- the switch-on: exactly the 167, MX off, AE and BR;
- the VAT flag;
- the segments;
- the region blocks: 33 refused and 16 accepted, through the real `checkTradeArea`;
- the blocks are data in one place, with no block in GB;
- the `intl` region name and SK's move;
- the selector's tablist, panels, home region, region data, no codes, and the CSS at each width;
- the six strings in all 48 bases;
- the back-translations.

It is in `scripts/harnesses.json`.

**Re-pinned, all passing:**

| Harness | Result | Why |
|---|---|---|
| currency-registry | 40/40 | 116 currencies and the 20261093 CHECK. **UGX is two-decimal**: Stripe's currency page says UGX "transitioned to a zero-decimal currency, but backwards compatibility requires you to represent it as a two-decimal value" (5 UGX → 500), as for ISK. The old pin listed it as zero-decimal; it wasn't in the registry before, so nothing was wrong until now. The 94 new home and international money forms are pinned by a fixture. |
| address-formats-1 | 53/53 | 45 formats; `intl` is last, as in the CHECK; its postal label |
| address-formats-2 | 89/89 | unchanged |
| canada-1 | 85/85 | unchanged |
| canada-2 | 33/33 | Saskatchewan is now `region_blocked` with the new sentence; QC and MB are as before |
| country-picker-1 | 45/45 | Items show no code (read from the link). The order is by region, then English name. The CSS is 5 / 4 / 1 columns with the full-screen phone panel. |
| marketing-country-parity | 145/145 | The closed dialog's list carries its panel id and no code |
| store-badges-1 | 61/61 | Its byte-identical /uk comparison first puts the list markup back, through `scripts/_lp-world-countries-5.cjs` (merge the region lists, re-sort, re-add the codes) |
| messages-parity | 1,217,124 passed, 0 failed | The six new strings are registered as new wording (1e area) |
| languages-world-1-rtl | 125/125 | unchanged |
| translation-check, 48 bases | 0 structural each | |
| tsc | clean | |

**The 12 harnesses pricing-copy-4's sweep found broken by this work** (docs/pricing-copy-4-report.md): 3 broken by the country
data, and 9 by the new menu and landing.css in `2d2a5e2e`. My first commit had not re-pinned them. Each is now re-pinned where
its failure started, in `0db83f8b`, and each passes:

| Harness | Cause | Re-pin | Now |
|---|---|---|---|
| ireland-2 | pinned "22 currencies" | 116, with the 22 first and in their order | 16/16 |
| countries-api | pinned the 22-code message, and used KRW as the unsupported example | The message is read from the registry. The refused example is now Iran's rial (IRR); the won is supported for South Korea. | 85/85 |
| world-countries-1 | pinned 22 currencies and 44 formats | the eight are still 15th to 22nd; 20261054's CHECK equals the first 22 currencies and all formats except `intl`; 45 formats | 178/178 |
| compare-languages-1 | the 167 new segments had no fixture locale | their locale comes from the generator; every address is still lowercase ASCII | 24/24 |
| faq-1, faq-2, faq-3, faq-4, seo-geo-2, copy-truth-1 | the landing (and /features) HTML differs in the country menu | `scripts/_lp-world-countries-5.cjs` `pc1After4AsBefore` / `asBefore` puts the list back as it was first: the region buttons out, one list re-sorted by English name, the codes back, the label in the page's language. Every other byte is still compared. | 208, 162, 187, 100, 89, 56 (0 failed) |
| site-chrome-1, cwv-1 | landing.css byte checks | `cssAsBefore` puts `2d2a5e2e`'s landing.css hunks back exactly, read from git. It throws if a hunk is missing, and it restores the before-file byte for byte. | 35/35, 27/27 |

**contact-1** is on the expected legal-pages list and still fails there. Its truck-page byte check also carried my
landingNav/tradeArea keys. Those are now named later key changes, and the Japanese file's jp-nav-1 exception now also sets aside
the region names. What it still reports there is the planTable files, which are pricing work, not mine.

**Pizzeria Gusto: unchanged.**
- No migration here touches `trucks`, and none touches GB's rows: they insert only the 167 new codes, and the switch-on updates
  only those, MX, AE and BR.
- GB's `country_settings` row was last updated 21 Oct 2026 (address-formats-1). Gusto's truck row hash (read-only) is
  `002e02577b210281357a77db0a69818c`.
- No region block applies in GB.
- store-badges-1's byte-identical /uk comparison passes.

**Full sweep** (`node scripts/run-harnesses.cjs`, shared working tree, after `0db83f8b`): **218 run · 209 passed · 9 failed.**
All 9 are the expected ones, the same that pricing-copy-4 lists:
- **5 for the languages-world-2 legal pages** (no legal pages for the new language bases yet): paperwork-1, legal-languages-1,
  world-countries-3, contact-1 and tidy-1.
- **4 for the missing `.next` build:** event-types-render, pending-card-render, pending-card-buttons and midnight-events.

None is this work's. An earlier sweep, before `0db83f8b`, had 22 failures; the 12 in the table above are the difference. One
more, native-prices, passed once pricing-copy-4's fix landed.

---

## 8 · SQL

### Run (Dominic approved, 12 Nov 2026, via `scripts/db-migrate.cjs`)

1. `supabase/migrations/20261093_world_countries_5_schema.sql`:
   - the currency CHECK widened to 116 codes;
   - the address_format CHECK widened by `intl`;
   - the new column `vat_number_required boolean not null default false`.
   No existing row was changed.
2. `supabase/migrations/20261094_world_countries_5_rows.sql`, generated: 167 `country_settings` inserts (all
   `enabled = false`), 501 `plan_prices` and 167 `country_billing`, in one transaction.

Checked afterwards (read-only):
- 167 new rows, 0 enabled;
- all rows 211, of which 44 enabled;
- VAT flag 39;
- prices 501, billing 167;
- models `billed_at_truck` 160, `fee_from_payment` 7.

### Prepared, NOT run

- **`supabase/migrations/20261095_world_countries_5_switch_on.sql`:** enables the 167, disables MX, and sets the VAT flag on AE
  and BR, in one transaction.
- It needs `--approved-by-dominic`. **Run it only after the code is deployed.**

### Read-only checks run

**Schema and reference reads,** before the rows were written: the columns and constraints of the three tables, and the existing
rows that served as patterns.

```sql
select table_name, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) cols from information_schema.columns where table_schema='public' and table_name in ('country_settings','plan_prices','country_billing') group by table_name;
select conrelid::regclass t, conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid in ('public.country_settings'::regclass,'public.plan_prices'::regclass,'public.country_billing'::regclass) and contype in ('c','f','u');
select c.country_code, c.enabled, c.currency, c.locale, c.address_format, c.allergen_set, c.platform_fee_allowed, c.platform_fee_enabled, c.comparison_status, c.ios_app_available, c.android_app_available, b.payment_model, b.post_pay_surcharge_bps, b.post_pay_surcharge_fixed_minor, b.min_charge_minor, b.late_fee_minor, (select string_agg(p.plan_key||':'||p.monthly_minor||'/'||coalesce(p.included_online_minor::text,'-')||'/'||p.fee_bps||'/'||p.offered||'/'||p.is_trial_end, ' ') from plan_prices p where p.country_code=c.country_code) prices from country_settings c left join country_billing b using (country_code) where c.country_code in ('GB','BR','TH','AE','MX','JP','US','FR') order by 1;
select country_code, card_fee_region_label, tax_label, prices_include_tax, phone_check, distance_unit, service_fee_recipient, fees_taxed, allergen_card_only_allowed, support_hours, card_fee_online_pct, card_fee_online_fixed_minor, tap_to_pay_fixed_minor, tip_presets_pct, comparison_status, tax_year_start_month, tax_year_start_day, ios_app_available, android_app_available from country_settings where country_code in ('FR','US','AE','TH','GB','LU','GI') order by 1;
select country_code, phone_country_code, phone_example, timezones[1:3] tz, default_timezone, time_format, date_order, week_start, short_name from country_settings where country_code in ('FR','AU','BR','AE','JP','GB','US') order by 1;
```

**Mexico:** no MX rows at all, so no truck has ever traded there. All trucks are GB 12, FR 3 and US 1.

```sql
select column_name from information_schema.columns where table_schema='public' and table_name='trucks' and (column_name ilike '%country%' or column_name ilike '%plan%' or column_name ilike '%status%' or column_name in ('is_test','hidden','live','trading','archived','deleted_at','created_at'));
select t.country, count(*) trucks, count(*) filter (where exists (select 1 from orders o where o.truck_id = t.id)) with_orders, count(*) filter (where exists (select 1 from orders o where o.truck_id = t.id and o.created_at > now() - interval '60 days')) orders_last_60d, string_agg(distinct t.plan, ',') plans from trucks t where upper(coalesce(t.country,'')) in ('MX','MEX','MEXICO') group by t.country;
select country, count(*) from trucks group by country order by 2 desc;
```

**After the rows migration:** new_rows 167, new_enabled 0, all_enabled 44, all_rows 211, vat_flag 39, prices 501, billing 167,
models `billed_at_truck:160 fee_from_payment:7`.

```sql
select count(*) filter (where updated_by='world-countries-5') new_rows, count(*) filter (where updated_by='world-countries-5' and enabled) new_enabled, count(*) filter (where enabled) all_enabled, count(*) all_rows, count(*) filter (where vat_number_required) vat_flag, (select count(*) from plan_prices p join country_settings c using (country_code) where c.updated_by='world-countries-5') prices, (select count(*) from country_billing where updated_by='world-countries-5') billing, (select string_agg(payment_model||':'||n, ' ') from (select payment_model, count(*) n from country_billing where updated_by='world-countries-5' group by 1) x) models from country_settings;
```

**Gusto, GB, the new rows and MX, at the end.** A first attempt failed: it named `t.updated_at`, which `trucks` doesn't have.
This is the version that ran:

```sql
select 'gusto' as what, t.id::text as a, t.country as b, t.created_at::text as c, md5(row(t.*)::text) as d
from public.trucks t where t.name ilike '%gusto%'
union all
select 'gb_settings', country_code, enabled::text, updated_at::text, updated_by from public.country_settings where country_code = 'GB'
union all
select 'new_rows', count(*)::text, sum(case when enabled then 1 else 0 end)::text, max(updated_at)::text, null from public.country_settings where updated_by = 'world-countries-5'
union all
select 'mx', country_code, enabled::text, updated_at::text, updated_by from public.country_settings where country_code = 'MX'
union all
select 'mx_trucks', count(*)::text, null, null, null from public.trucks where country = 'MX';
```

The result:
- gusto: pizzeria-gusto, GB, row hash 002e0257…;
- gb_settings: GB, true, 2026-10-21, address-formats-1;
- new_rows: 167, 0 enabled;
- mx: MX, true;
- mx_trucks: 0.

The full text of the three migrations is in the files above.

### Undo (only if Dominic asks)

```sql
begin;
delete from public.country_billing   where country_code in (select country_code from public.country_settings where updated_by = 'world-countries-5' and enabled = false);
delete from public.plan_prices       where country_code in (select country_code from public.country_settings where updated_by = 'world-countries-5' and enabled = false);
delete from public.country_settings  where updated_by = 'world-countries-5' and enabled = false;
commit;
```

The schema changes (20261093) are additive and can stay.

---

## 9 · Questions for you before the switch-on

1. **Store badges:** is the app available in the App Store and Play storefronts of the new countries? If not, I'll prepare an
   update setting `ios_app_available` / `android_app_available` to false for them until it is.
2. **Menu currency:** for BH, JO, KW, OM, TN, BT, TM, ER, MR, ST and ZW, truck menus would show USD or EUR, because that is
   what we bill in. Is that acceptable at launch, or should menus use local money? That needs a separate column for the menu
   currency, which is a small schema change.
3. **Serbian names:** should the selector write Serbian and Montenegrin names in Latin (Srbija, Crna Gora), as the app's Serbian
   is written? This changes how Serbia, which is already live, shows.
4. **Bender:** should it stay on Transnistria's block list?
5. **Iceland's week start:** Sunday (Intl) or Monday?

## 10 · After you deploy

1. Deploy (this commit and those before it).
2. Check Admin › Countries: the 167 should now read as rows, all off.
3. Run the switch-on:
   `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261095_world_countries_5_switch_on.sql --approved-by-dominic`
4. Check /al, /ua and /ke-style pages, the selector, and a signup in a blocked region.
