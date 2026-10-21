# europe-readiness — read-only diagnosis

**Date:** 20 October 2026 · **Branch:** main (on top of `4633801c`) · **Mode:** read-only.

**What was changed:** nothing in code, config or data. The only writes are:
- `docs/i18n/seo-glossary-eu.md`, copied byte-for-byte from `~/Downloads/seo-glossary-eu.md` (227 lines; `cmp` identical);
- this report.

**How it was done:** read-only SQL on the live Supabase project (every query is in §H), plus four read-only code surveys.
Every `file:line` below was read in the repo. No `.env*` file was opened, read, listed or parsed.

## Summary

**Ireland is mostly data, but not entirely.**
- One `country_settings` row and three `plan_prices` rows (drafted, NOT RUN, switched off, in §A.13) cover currency,
  tax, phone, time zone, card fees, allergens, Stripe Connect's country and every price surface.
- **A short list of code is also needed:**
  - **a one-line address table:** `IE:'ie'` in `COUNTRY_PATH_SEGMENTS`. Without it /ie is a 404 and Ireland is missing
    from the router, hreflang, sitemap and menu;
  - **English sentence frames:** "in the {country}" would read "in the Ireland", and "{country} food trucks" would
    read "Ireland food trucks". A tiny en-IE override fixes both;
  - **outreach WhatsApp numbers** are parsed as GB;
  - **two AI prompts** assume UK postcodes;
  - **hero screenshots** are in £.

**A second language is a real build.**
- **The structural limits:**
  - the locale list is hardcoded in four places;
  - locale resolution is exact-match with a one-level merge, so there is no de-AT → de → en-GB chain;
  - each country has exactly one locale, and no truck or customer has a language;
  - every language ships in every client bundle;
  - posters have their own GB/US-only tables;
  - English ordinals and hand-built dates;
  - hreflang is keyed by locale, and the routing has one segment per country.
- **Size:** 4,844 strings (29,534 words) in 107 namespaces, plus about **270** live hardcoded English strings outside
  admin (about 95 of them on the UK-only Village Foodie consumer site).
- 🔴 **One safety gap must close before any non-English truck goes live:** the WhatsApp allergen guards match English
  words only.

⚠️ **Observed today, outside this brief, for you.**
- The live **US row is now `enabled = true` with `platform_fee_enabled = true`** (updated 20 Oct 16:28 UTC by
  dominic@hatchgrab.com).
- The V16.2 manual written earlier today records both as off; §49 and §81.3 of it are now out of date.
- The platform-fee flag has **no money effect today:** its only reader, `wouldBeApplicationFeeMinor`
  (`lib/order-charges.ts:223`), is called only by a harness, and no route sends an application fee. But the manual's
  invariant 35.aj-7 ("never switch on without the meter and the refund") assumes the flag stays off.

---

## A · Adding Ireland (IE)

Legend: **DATA** = a row or column, changed in Admin › Countries or by SQL. **CODE** = a hardcoded table, branch or
message that must change.

### A.1 country_settings (DATA)
- **The loader** reads an explicit column list (`lib/country-settings.ts:37-51`) and maps it (`:97-142`). A missing row
  or a bad value throws; there is no GB fallback (`:157`). The types are at `lib/country-settings-types.ts:18-83`.
- **Live constraints** (§H, query 4) restrict:
  - `allergen_set` to `uk14 | us9`;
  - `address_format` to `postcode | zip_state`;
  - `date_order` to `dmy | mdy`, `week_start` to `monday | sunday`, `time_format` to `24h | 12h`;
  - `default_timezone ∈ timezones`.

  All of these suit Ireland.
- **Admin › Countries › Add** (`lib/admin/country-actions.ts:50-58`) copies an existing row, switched off. Copying GB
  carries GBP, "UK cards" and Europe/London, so each must be edited.
  - The form validates the currency against Intl (`lib/admin/country-form.ts:199-200`), the locale by regex (`:204`)
    and `phone_example` by `isPlausiblePhone` (`:317`).
  - It **does not check the locale against the message files**, so `en-IE` is accepted and silently reads en-GB words
    (§B.1).
- **Tax:** `prices_include_tax = true`, `tax_label = 'VAT'` (as GB).
- **Phone:** `lib/phone.ts:19` uses libphonenumber `min` metadata, which includes IE (+353). With `phone_check
  'length'`, wa.me links and national display all work with no code. `phone_example` must pass the check, e.g.
  "085 123 4567".
- **Time zone:** `Europe/Dublin` is valid in Intl. Outreach's fixed `Europe/London` (`lib/outreach-mail-config.ts:62`,
  `lib/outreach-attention.ts:67`) has the same offset all year, so it is harmless.
- **Allergens:**
  - EU Regulation 1169/2011 lists the same 14 as the UK, so use **`uk14`** (`lib/allergens.ts:15-24`).
  - Cosmetic: the AI prompts say "14 UK statutory allergens" (`lib/allergens.ts:55,74`) and the admin label reads
    "UK 14" (`components/admin/CountriesTab.tsx:403`).
- **Card fees:** your eurozone standard is 1.5% + €0.25 online, 1.4% + €0.10 in person, Tap to Pay +€0.10, stored in
  euro cents. `card_fee_region_label` is new wording: GB has "UK cards" and US "US cards"; I drafted **"EEA cards"**,
  so the copy reads "standard EEA cards" (`planFeatures.cardRegionOnline`).
- **Surcharge:** off. The EU bans surcharges on consumer cards (PSD2); GB is off too.
- **Service fee and tipping:** I drafted them the same as GB (both off, no presets). Your call.
- **`short_name` is required.** A null makes geocoding append "UK" (`app/api/manage/geocode/route.ts:10`) and drops the
  country word from sentences. Drafted as "Ireland"; see A.11 for the "in the" problem.
- **`distance_unit`** is retired; drafted as `km`.
- **The six retired plan columns:** NULL, as US. NULL passes `country_settings_minor_nonneg_chk`.
- **`platform_fee_enabled` false, `fees_taxed` false.**

**Country-specific code branches** (beyond those, everything reads the row):

| file:line | what | IE |
|---|---|---|
| `lib/marketing-country.ts:15` | `MARKETING_COUNTRY='GB'`, the fallback | fine |
| `lib/marketing-country.ts:26` | `COUNTRY_PATH_SEGMENTS={GB:'uk',US:'us'}` | **CODE: add `IE:'ie'`** |
| `app/landing/page.tsx:216`, `:515` | testimonial and award block, GB only | IE shows none (fine) |
| `lib/landing-screens.ts:16-22` | hero screenshots by country (US only) | **IE shows GB's £ screenshots: CODE + assets** |
| `lib/plans-pdf.ts:55` | `LETTER_COUNTRIES={'US','CA'}` | IE gets A4 (correct) |
| `lib/app-badges.ts:34` | GB → the `/gb/` App Store URL, others → the storefront-free URL | fine |
| `lib/weekly-post/locale.ts:28,60-90,119,172`; `lib/weekly-post/words.ts:36`; `components/manage/SocialPosts.tsx:905` | posters: `CountryCode='GB'\|'US'`, anything else → GB | IE posters render as GB (acceptable for English) |
| `lib/admin/truck-details.ts:334-340` | GB numbers stored E.164, others in national form | see A.10 |
| `lib/stripe/connect.ts:236` (`(opts.country \|\| 'GB')`) | Connect account country | IE passes through |
| `lib/discovery-country.ts:13,15,37` | Village Foodie is UK-only; non-GB discovery rows hidden | intended |
| `country \|\| 'GB'` null fallbacks: `lib/schedule-context.ts:25`, `lib/venue-matcher.ts:207,210`, admin discovery and outreach routes | only when null | fine |

### A.2 plan_prices (DATA)
- **Read by:** `lib/plans-server.ts:38` and `lib/plans.ts:202-204` (`planPriceFor`). `lib/plan-offer.ts:45,63` leaves out
  any plan unpriced in a country; `truckPlanFeeBps` is at `lib/plans-server.ts:68-74`.
- **There is no currency column.** Amounts are minor units of `country_settings.currency`, and nothing assumes GBP or USD.
  `cheapestBands` rounds to 100 currency units (`plan-offer.ts:138-141`), which is fine for EUR.
- **The IE rows:**
  - payg 0 / 0 / 99 / 0;
  - pro 2900 / 400000 / 99 / 2900;
  - unlimited 6900 / NULL / 0 / 6900.

  That is €0 + 0.99%, €29 with €4,000 included, and €69; each extra van at the plan's monthly price, as GB.
- **Live triggers** (§H, queries 5–6):
  - `country_settings_require_plan_prices` refuses `enabled = true` until all three exist;
  - the reverse guard fires only on plan_prices DELETE/UPDATE and on plans INSERT/UPDATE;
  - so inserting a switched-off IE row and then its prices is allowed in that order.
- **Insert order:** `country_settings` first, because `plan_prices.country_code` is a FK to it.

### A.3 The /ie marketing route, router, hreflang, sitemap and JSON-LD
- **Address table** (`lib/marketing-country.ts:26`): the **only** place a country gets a URL. `routableCountries`
  (`:70-72`) and `generateStaticParams` in `app/[country]/page.tsx:17-19`, `features/page.tsx:11` and
  `compare/page.tsx:11` read it, with `dynamicParams=false`. Without `IE:'ie'`, `/ie` is a 404.
- **Root router:** `proxy.ts:527-537` → `marketingRedirect` (`lib/marketing-country.ts:94-113`). The order is `?country`
  → the `hg_country` cookie → `x-vercel-ip-country` → GB, switched-on countries only. An Irish visitor lands on `/ie`
  once IE is on.
- **A switched-off IE** country page 302s to `/uk` (`lib/visitor-country.ts:87-113`).
- **`<html lang>`** = `en-IE` from the row, via the proxy header (`proxy.ts:306-318`).
- **og:locale and lang:** `lib/marketing-meta.ts:22-24` gives `en_IE`, `en-IE` and the short name.
- **hreflang:** `countryPageAlternates` (`lib/marketing-meta.ts:33-39`) keys by locale, so IE adds `en-IE`; x-default
  stays the router path.
- **Sitemap:** `app/sitemap.ts:64-77` builds the country list from data plus the segment table (locale fallback
  'en-GB' at `:66`).
- **JSON-LD:** `lib/structured-data.ts:50-62` takes `priceCurrency` from the row, so the Offers come out in EUR with
  no code.
- **Country menu and flag:** `components/landing/CountryMenu.tsx:9,36-45` lists switched-on rows; `lib/flags.ts:6-12`
  (country-flag-icons) has IE.

### A.4 Signup and setup country choice (DATA)
- **Signup** asks no country (`app/api/signup/route.ts:24`).
- **"Where's your truck based?"** (`components/setup/WhereBasedStep.tsx:88`) uses `/api/setup/countries` →
  `lib/signup-countries.ts:12-33`. That lists switched-on rows; the IP country is pre-filled if switched on, else GB.
- **Places look-up** is restricted per country (`lib/places.ts:57`).
- **Provisioning** (`lib/provision-truck.ts:424-444,507-508`) reads the row, refuses a switched-off country, and writes
  `trucks.country`, `currency` and the time zone. Manage › Where you trade shows the country read-only
  (`components/manage/WhereYouTrade.tsx`).

### A.5 Stripe Connect (CODE OK; confirm outside the code)
- **Account creation:** `lib/stripe/connect.ts:216-242`, `stripe.v2.core.accounts.create`, with
  `identity.country = (opts.country || 'GB').toLowerCase()`.
  - The only capability requested is `card_payments`.
  - **No `default_currency`**, so Stripe uses the country default: EUR payouts for an IE account.
  - The caller (`app/api/stripe/connect/route.ts:251-254`) passes `trucks.country`.
- **Charges:** use the order's currency (`lib/payments/authorize.ts:122`). `orders.currency` comes from
  `truck.currency` (`app/api/orders/submit/route.ts:1042`). There are no `'gbp'` literals.
- **To confirm in Stripe, not code:**
  - that the UK platform's Connect settings allow IE accounts with direct charges and Tap to Pay/Terminal;
  - Stripe's actual IE card-fee figures (the card fees above are your stated standard).

### A.6 Money formatting (en-IE)
- **`lib/money-format.ts`** is Intl-based. en-IE + EUR gives "€29.00" and "€123,456.50" (decimal point, comma
  thousands), and "1.5%".
- **`MINOR_SUFFIX` already has `EUR:'c'`** (`:75`), so small amounts read "25c".
- **Printed tickets** fold € to "EUR" (`lib/printing/ticket.ts:481,495,521`), so they print "EUR12.50". That works;
  a real € needs a printer code page (optional).
- **Plans PDF font on Vercel:** Open Sans via @sparticuz/chromium (`lib/plans-pdf.ts:114-123,237`). The code notes
  confirm £ only; **€ is not yet verified by a render**.

### A.7 Store badges per storefront (no change)
`lib/app-badges.ts:32-35`: IE gets the storefront-free App Store URL (Apple redirects to the visitor's store); Google
Play has one URL. Both badges are on every marketing footer (`components/landing/LandingFooter.tsx:128`).

### A.8 The plans PDF (DATA)
`lib/plans-pdf.ts`:
- A4 (`:55-57`);
- money from the row (`moneyFormatOf`);
- every amount masked to TBC while IE is switched off (`:157-158`);
- en-GB words for en-IE.

Outreach picks the prospect's `discovery_trucks.country` (`app/api/admin/outreach/attachments/route.ts:37-45`).

### A.9 Legal country-specific terms (CONTENT, legal decision)
- **`/country-terms`** (`app/(legal)/country-terms/page.tsx:43-50`) is one static markdown file,
  `content/legal/country-specific-terms.md`, with a United States section only. Its intro (`:9`) says unlisted
  countries get the base terms.
- **An Ireland section would need a legal decision on:**
  - the terms' "Art. 28 **UK GDPR**" (`content/legal/terms-and-conditions.md:178`);
  - "England and Wales" exclusive jurisdiction (`:221`);
  - "not registered for VAT" (`:66`);
  - the privacy policy's UK transfer wording (`content/legal/privacy-policy.md:119`);
  - EU GDPR (an Art. 27 representative);
  - Irish ePrivacy rules for cold outreach to sole traders.
- Legal pages always render en-GB (`proxy.ts:319-320`). After an edit, bump `lib/legal.ts:90`.

### A.10 Outreach country handling (CODE)
- **The country itself is handled:**
  - `discovery_trucks.country` drives matching (`lib/discovery-country.ts`); non-GB rows are hidden from the public
    sites (`:37`);
  - `prospectCountry` falls back to GB (`app/api/admin/outreach/attachments/route.ts:37-45`).
- 🔴 **Bug for IE: WhatsApp numbers are parsed as GB (`MARKETING_COUNTRY`) whatever the prospect's country.** The sites:
  - `components/admin/ProspectWorkspace.tsx:321`;
  - `components/admin/OutreachPanel.tsx:604,616`;
  - `components/admin/TemplatesPanel.tsx:455,905`;
  - `app/api/admin/outreach/route.ts:404`.

  Meanwhile `lib/admin/truck-details.ts:334-340` stores non-GB numbers in national form ("087 123 4567"), which is
  not a plausible GB number, so the IE WhatsApp link would be null. Fix one side: parse in the prospect's country, or
  store E.164.
- **AI prompts with UK postcode assumptions:**
  - `lib/schedule-extract.ts:85,112-126` gives a `postcode` country "UK postcodes … CB25 0BA" and "knowledge of UK
    venues";
  - `lib/admin/screenshot-events.ts:136` does the same.

  Eircodes look like "D02 X285". Make the postcode branch country-aware; `countryName` is already in the context.
- **Opt-out:** a stored line (`lib/outreach-signature.ts:34`). There is no US postal-address logic for IE to inherit.

### A.11 en-IE messages override (what must differ from en-GB)
- **With no code, `en-IE` reads en-GB.** `resolveLocale` matches exactly (`lib/i18n/locales.ts:16-18`), while Intl
  still formats in en-IE.
- **To ship a real en-IE file (CODE), touch:**
  - `lib/i18n/locales.ts:11`;
  - `lib/i18n/messages.ts:17` (`OVERRIDES`);
  - `scripts/split-messages.cjs:20-23` (then regenerate `lib/i18n/catalog/*`);
  - `lib/weekly-post/words.ts:36`.

  Irish English is British English, so the file is **small**.

| Key (en-GB) | Today | en-IE needs |
|---|---|---|
| `pricing.footnote` (messages/en-GB.json:5780) | "(currently {cardFee} **in the {country}**)" | 🔴 **"in Ireland"**, not "in the Ireland" (the country is `short_name ?? name`, `app/features/page.tsx`) |
| `landing.meta.description`, `landing.jsonLd.description` | "… for **{country} food trucks** …" | "food trucks in Ireland" (not "Ireland food trucks") |
| `compare.fee.fixedAria` | "Pence per order" | "Cent per order" |
| `auth.signup.emailPlaceholder`, `demoGetStarted.emailPlaceholder`, `demoUpload.emailPlaceholder` | "…@yourtruck.co.uk" | `.ie` |
| `manageMenuImport.schedule.urlPlaceholder`, `manageSettings.schedule.urlPlaceholder`, `manageScheduleVerify.malformed` | `.co.uk` | `.ie` |
| `manageTeam.phonePlaceholder` | "+44 7700 900000" | "+353 85 123 4567" |
| Postcode labels: `manageScheduleEvent.postcode`, `manageScheduleImport.review.postcode`, `schedulePlaces.postcode`, `schedulePlaces.searchPlaceholder`, `manageSchedule.noLocation.body`, `privateEvents.form.previewNote` | "Postcode" | "Eircode" |
| `deleteAccount.whatAccounting` | "as UK law requires" | "as Irish law requires" (check with legal) |

None of en-US's 472 overrides is wanted for IE: they are US spelling and wording, and TBC→TBD.

### A.12 Data vs code, for Ireland

| | Item |
|---|---|
| **DATA** | the IE `country_settings` row; three IE `plan_prices` rows; then `enabled = true` |
| **CODE (required)** | `IE:'ie'` in `COUNTRY_PATH_SEGMENTS`; an en-IE override (the "in the" and "{country} food trucks" sentences) or neutral en-GB wording; outreach WhatsApp parsing in the prospect's country; country-aware postcode lines in two AI prompts |
| **CODE (optional)** | IE hero screenshots in € (`lib/landing-screens.ts`); posters' locale tables; € on printed tickets; "UK statutory" wording in allergen prompts |
| **Outside code** | Stripe Connect allowing IE; an Irish legal section; VAT (§F) |

### A.13 Draft SQL — **NOT RUN** (Ireland, switched OFF)

The values mirror the live GB row (§H, query 2) except where Ireland differs: EUR, en-IE, +353, Dublin, your eurozone
card fees, km, retired plan columns NULL, and `updated_by`.

```sql
-- NOT RUN — europe-readiness draft, 20 October 2026. Ireland, switched OFF (enabled = false).
-- Order matters: plan_prices.country_code is a FK to country_settings.
begin;

insert into public.country_settings (
  country_code, name, enabled, currency, locale, time_format, date_order, week_start,
  phone_country_code, address_format, timezones, default_timezone,
  prices_include_tax, tax_label,
  card_surcharge_allowed, card_surcharge_cap_pct, card_surcharge_credit_only, card_surcharge_excluded_regions,
  service_fee_allowed, tipping_enabled_default, tip_presets_pct, allergen_set,
  starter_monthly_minor, pro_monthly_minor, max_monthly_minor, pro_allowance_minor, max_allowance_minor, platform_fee_pct,
  card_fee_online_pct, card_fee_online_fixed_minor, card_fee_in_person_pct, card_fee_in_person_fixed_minor,
  tap_to_pay_fixed_minor, card_fee_region_label,
  competitor_name, competitor_pct, competitor_fixed_minor, support_hours, updated_by,
  short_name, phone_example, phone_check, distance_unit,
  service_fee_recipient, service_fee_hatchgrab_bps, service_fee_hatchgrab_fixed_minor,
  service_fee_truck_max_bps, service_fee_truck_max_fixed_minor,
  platform_fee_enabled, fees_taxed
) values (
  'IE', 'Ireland', false, 'EUR', 'en-IE', '24h', 'dmy', 'monday',
  '353', 'postcode', array['Europe/Dublin'], 'Europe/Dublin',
  true, 'VAT',
  false, null, false, '{}'::text[],
  false, false, '{}'::numeric[], 'uk14',
  null, null, null, null, null, null,
  1.5, 25, 1.4, 10,
  10, 'EEA cards',
  null, null, null, null, 'europe-readiness draft',
  'Ireland', '085 123 4567', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false
);

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'IE',    0,      0, 99,    0),
  ('pro',       'IE', 2900, 400000, 99, 2900),
  ('unlimited', 'IE', 6900,   null,  0, 6900);

commit;

-- NOT RUN — read-only check afterwards:
select country_code, enabled, currency, locale, default_timezone, card_fee_online_pct, card_fee_online_fixed_minor
  from public.country_settings where country_code = 'IE';
select plan_key, monthly_minor, included_online_minor, fee_bps from public.plan_prices where country_code = 'IE' order by plan_key;
```

**What this does and doesn't do:**
- Nothing becomes visible: IE is off, and `/ie` doesn't exist until the address table has it.
- **For you to confirm:** "EEA cards", service fee and tips off, and `phone_example`. Switching IE on is a separate
  `update … set enabled = true` (or the admin toggle), after Stripe is confirmed and the code in A.12 has shipped.


---

## B · The language system for non-English

### B.1 How it is set up today
- **The catalogue:**
  - `messages/en-GB.json` is the full base, and `messages/en-US.json` holds only what differs.
  - `node scripts/split-messages.cjs` writes `messages/ns/<locale>/<ns>.json` and `lib/i18n/catalog/<ns>.ts`
    (`scripts/split-messages.cjs:28-41`).
  - `next.config.ts:11-14` precompiles `./messages` with `locales:'infer'`. There is no language routing
    (`next.config.ts:4-6`; `lib/i18n/request.ts:8-11`).
- **Reading words:** `translatorFor` (`lib/i18n/translator.ts:19-22`, server) and `useT` (`lib/i18n/use-t.ts:33-36`,
  client; en-GB with no provider, `:18`). `I18nProvider` switches when a page calls `useTruckLocale`
  (`lib/i18n/client.tsx:19-28`).
- **The locale list is hardcoded in four places:**
  - `lib/i18n/locales.ts:11` (`LOCALES = ['en-GB','en-US']`). Its comment at `:9` says a new language goes "here, in
    messages/, and nowhere else", which isn't true;
  - `scripts/split-messages.cjs:20`;
  - `lib/i18n/messages.ts:9-10,17` (a fixed `OVERRIDES` record);
  - `lib/i18n/app-config.d.ts:9` (the key types come from en-GB).
- **Resolution is an exact match, else en-GB** (`lib/i18n/locales.ts:16-18`). So `de-AT` never reaches `de`, and the
  admin form accepts any BCP-47 tag without checking it has words (`lib/admin/country-form.ts:203-205,301`).
- **The merge is one level: en-GB base plus one override** (`lib/i18n/registry.ts:19,38-39`; `messages.ts:24-26`). A
  missing German key shows English (no raw keys). Regional files (de-AT over de over en-GB) need a chained merge.
- **No completeness check:** `scripts/messages-parity.cjs:7,47-54` checks that a locale has no keys en-GB lacks, but
  nothing checks that a non-English file is complete.
- **Bundle:** every `lib/i18n/catalog/<ns>.ts` statically imports every locale (e.g. `catalog/order.ts`), so every
  client bundle carries every language (`lib/i18n/page-locale.tsx:5`). Per-locale lazy loading was built and reverted
  in Phase 1e (`.cursor/rules/language.mdc:22`).
- **ICU:** about 109 `plural` and 140 `select` uses, with forms `=0 / one / other`, and numbers passed preformatted.
  Fine for de, nl, es and it; French "one" covers 0 and 1, which the `=0` branches already handle.
- **English-only grammar in messages:**
  - "in the {country}" (`messages/en-GB.json:5780`);
  - "{country} food trucks" (`:5313,5385`);
  - the country name, short name, tax label and phone example are a single English string per country
    (`lib/country-settings-types.ts:20-33`).

### B.2 How a locale is chosen (one `country_settings.locale` per country; no truck or customer language)

| Surface | Decided at | Basis |
|---|---|---|
| Marketing /uk /us | `proxy.ts:527-537` → `lib/marketing-country.ts:94-113`; `lib/visitor-country.ts:92-111`; pages `app/landing/page.tsx:93,208,220`, `app/features/page.tsx:77,161`, `app/compare/page.tsx:83` | the URL's country |
| Customer order page | `app/trucks/[slug]/order/page.tsx:747` (`useTruckLocale`), `layout.tsx:59` | the truck's country; **never the browser** (no Accept-Language or `navigator.language` anywhere) |
| Order status | `app/order/[id]/manage/page.tsx:48` | the order's truck |
| Manage / dashboard / KDS / setup | `app/manage/[token]/page.tsx:662`; `app/dashboard/[token]/page.tsx:291`; `…/kds/page.tsx:145`; `app/setup/page.tsx:95` | the truck's country |
| API refusals | `lib/i18n/server-locale.ts:9-13` (`localeForTruck`, about 50 call sites) | the truck's country |
| Customer / operator emails | `lib/email.ts:16,27,63,335,591,749,839,909`; `lib/email-signup.ts:26-29,142` | the order's or truck's locale |
| Plans PDF | `lib/plans-pdf.ts:151-156,327`; `app/landing/features-pdf/route.ts:53-54` | the country's |
| WhatsApp fixed replies | `lib/whatsapp-classifier.ts:169`; `app/api/webhooks/meta/whatsapp/route.ts:763` | the truck's; **the LLM replies name no language** (B.5) |
| Posters / schedule graphics | `lib/weekly-post/locale.ts:28,68-91,110-113,119`; `words.ts:36`; `components/manage/SocialPosts.tsx:905` | **own GB/US tables; anything else → GB** |
| Legal pages | `content/legal/*.md`; `proxy.ts:319` | always en-GB |
| Admin | `app/admin/**`, `components/admin/**` | English (stays) |

### B.3 What breaks with a second language
1. **One field drives three things.** `country_settings.locale` sets the words (`lib/i18n/locales.ts:21`), money
   (`lib/money-server.ts:20,27`; `moneyFormatOf`, `lib/country-settings-types.ts:86`) and dates
   (`lib/truck-time.ts:31,47`).
   - So Belgium can't be both nl and fr.
   - A country set to `de-DE` before German words exist gets German Intl dates inside English sentences. For example,
     `Intl.ListFormat` gives "und" in `app/features/page.tsx:78`.
2. **Locales are exact-match with a one-level merge** (B.1).
3. **Posters** have their own GB/US tables and English raised ordinals (`lib/weekly-post/locale.ts:132-140`;
   `format.ts:82-83`).
4. **Dates:**
   - English ordinals for every locale: `lib/time-utils.ts:360-373`, used by `formatOrdinalDate` `:416-423` and
     `formatShortOrdinalDate` `:429-435`. A German truck would see "Freitag 9th Oktober".
   - Hand-built short dates allow only dmy/mdy (`:429-466`).
   - Numeric dates force "/" (`:335-347`).
5. **`<html lang>`** is "en" everywhere except marketing and legal (`app/layout.tsx:100,111`; `proxy.ts:311-319`). A
   German order page would say `lang="en"`. Email HTML (`lib/email.ts:439`) and the PDF (`lib/plans-pdf.ts:231`) have
   no `lang`.
6. **Hardcoded `en-GB` / `en-US` literals that matter:**
   - sorting: `app/manage/[token]/page.tsx:9119`, `components/manage/SchedulePlaces.tsx:301`,
     `lib/schedule-graphics/places.ts:399`;
   - English words in fixed slots: `lib/weekly-post/font-refs.ts:131,133`, `place-pictures.ts:105,153,183-185`,
     `words.ts:66`, `lib/printing/netAddress.ts:32`, `lib/private-events/copy.ts:20`, `lib/whatsapp/copy.ts:46`;
   - about 30 `localeCompare` calls with no locale (e.g. `app/dashboard/[token]/page.tsx:4564`).
7. **Number entry** with a comma decimal is truncated or misread:
   - `components/manage/ExtrasEditor.tsx:136` reads "1,50" as 1;
   - `lib/whatsapp-classifier.ts:348` reads "12,50" as 1250;
   - also `lib/menu-loader.ts:88,104,119`;
   - pre-filled inputs use "." (`lib/money-format.ts:249-256`), and `bareFigure` is always "1,234.56" (`:219-224`).
8. **English units:** `perMonthLabel` "/mo" and "/month" (`lib/money-format.ts:64-66`); `MINOR_SUFFIX` "c" (`:75`);
   "{x} miles away" (`components/EventListCard.tsx:289`, Village Foodie only).
9. **Text length:** `.cursor/rules/language.mdc:66` asks for room for 130% of the English, but nothing tests it.
   - Manage has 21 `whitespace-nowrap`, 39 `truncate` and 6 fixed widths;
   - the dashboard 9 / 10 / 0, the KDS 1 / 8 / 0, the order page 5 / 3 / 7;
   - printed tickets have fixed 32/48 columns (`lib/printing/ticket.ts:167,223-224`).
10. **Printed tickets fold accents to ASCII** ("José" → "Jose"; ß → "ss") with code page `ESC t 16`
    (`lib/printing/ticket.ts:466-517,551`).

### B.4 Multilingual countries (BE nl/fr, CH de/fr/it): proposal
- **URLs:** `/be/nl`, `/be/fr`, `/ch/de`, `/ch/fr`, `/ch/it` (and `/be/nl/features`, …). A one-language country keeps
  its bare segment (`/ie`, `/de`, `/nl`), so today's `/uk` and `/us` URLs never change. A bare `/be` becomes a router
  that picks the language the way the root picks a country.
- **hreflang codes:**
  - language-REGION always: `nl-BE`, `fr-BE`, `de-CH`, `fr-CH`, `it-CH`, `de-DE`, `de-AT`, `nl-NL`, `fr-FR`, `es-ES`,
    `it-IT`, `en-IE`, plus `en-GB` and `en-US`;
  - x-default stays the root router;
  - because hreflang is keyed by locale (`lib/marketing-meta.ts:33-39`), two countries sharing a bare `de` would
    overwrite each other. Region tags avoid that.
- **The message files** follow the glossary's build note:
  - a language base (`de`, `nl`, `fr`, `es`, `it`) plus regional overrides (`de-AT`, `de-CH`, `nl-BE`, `fr-BE`,
    `fr-CH`);
  - a chain: `de-AT → de → en-GB`.
- **Code that changes:**
  - `COUNTRY_PATH_SEGMENTS` becomes country → { segment, languages[] } (`lib/marketing-country.ts:26`);
  - the path parser `^\/([a-z]+)(?:\/(features|compare))?$` (`:64`) and `switchCountryPath` (`:117`);
  - `ROUTER_PATHS`, `pickMarketingCountry` and `marketingRedirect` (`:42-45,75-113`) gain a language pick
    (Accept-Language, which nothing reads today);
  - a language cookie beside `hg_country` (`lib/visitor-country-types.ts:7`; `proxy.ts:537`);
  - routes `app/[country]/[lang]/…` or a combined segment (`app/[country]/page.tsx:17-20`, `features/page.tsx:9-10`,
    `compare/page.tsx:9-10`);
  - `resolveCountryPage` (`lib/visitor-country.ts:92-111`) returns one alternate per (country, language);
  - the proxy's lang header comes from the URL (`proxy.ts:313-316`).
- **How a Belgian truck and its customers pick a language:**
  - a **`trucks.language`** column (default: the country's first language), set at setup and in Manage. It drives
    Manage, the dashboard and KDS, operator emails, posters and WhatsApp replies;
  - `country_settings` gains **`languages text[]`** (e.g. `{nl-BE, fr-BE}`), with `locale` kept as the default and as
    the format locale;
  - **customers:** the order page defaults to the truck's language, but a customer whose browser language is another
    of the country's languages gets that one, with a small switcher (nl / fr) on the order page. Customer emails and
    WhatsApp use the language the order was placed in (an `orders.language` column);
  - ⚠️ **this needs your decision and a mockup:** whether the customer's browser can override the truck's language,
    and where the switcher sits.

### B.5 Surfaces that must be translated for a country to go live

| Surface | Today | Must translate? |
|---|---|---|
| Marketing (landing, /features, /compare, contact, footer, legal chrome) | catalogue (`landing`, `pricing`, `compare`, `planTable`, `featuresPage`, …) | **Yes** |
| Customer order page, order status, customer emails | catalogue, plus a few literals (§B.7) | **Yes** |
| Operator Manage, setup and signup, auth emails | catalogue (largest), plus lib copy constants (§B.7) | **Yes** |
| KDS and dashboard, printed tickets | catalogue; tickets ASCII-fold accents | **Yes** |
| Plans PDF | catalogue (`plansPdf`, `planTable`, `pricing`) | **Yes** |
| WhatsApp auto-replies | fixed greeting from the catalogue; **LLM prompts English, no output language** | **Yes, plus 🔴 the allergen guards** |
| Schedule graphics / weekly posts | catalogue words, but GB/US-only locale tables | **Yes, plus generalising the locale tables** |
| Legal pages (`content/legal/*.md`) | English markdown, always en-GB | **Yes, with a lawyer** |
| Admin, outreach console | hardcoded English (~2,100) | No |
| Village Foodie consumer site | hardcoded English (~95), UK-only | No (UK only) |

🔴 **AI prompts** (all Gemini 2.5 Flash). `.cursor/rules/language.mdc:67-68` requires each prompt to name its output
language, and none does. In particular:

| Prompt | file:line | Language named? |
|---|---|---|
| WhatsApp classifier | `lib/whatsapp-classifier.ts:178-199` | no (English examples and trigger words) |
| WhatsApp menu answer | `lib/whatsapp-classifier.ts:310-333` | **no**; English caveat quoted at `:324` |
| WhatsApp schedule reply | `lib/whatsapp-classifier.ts:409-433` | **no**; "Today" and "Tomorrow" hardcoded (`:402`) |
| Schedule extraction | `lib/schedule-extract.ts:58-79,150` | no (data output) |
| Menu extraction | `lib/menu-extract.ts:130-235` | no; categories and dietary tags English (`:23-27,92,135,148`); doesn't say "keep the menu's language" |
| Allergen card extract / transcribe | `app/api/manage/process-allergens/route.ts:46,93` | no; lists are uk14 / us9 only (`:37-42`) |
| Admin screenshot prompts | `lib/admin/screenshot-events.ts:106`; `lib/admin/truck-details.ts:46,107` | no (admin) |

🔴 **The allergen safety gap:**
- **The guard that sends allergen questions to the safe path** (`lib/whatsapp-classifier.ts:145-155`):
  - it matches English stems only (`allerg`, `intoleran`, `coeliac`, `free from`, …);
  - the normaliser strips every non-ASCII letter;
  - so "glutenvrij", "senza glutine", "glutenfrei", "lactose-intolerant" in Dutch, and so on, are **not recognised**.
- **The reply caveat** (`:356-364`) fires only when an English allergen tag word ("dairy") appears in the reply, so a
  German reply that says "Milch" skips it.
- **Must be fixed before any non-English truck goes live.** This matches the open §27 item.

### B.6 Strings per namespace
| Surface | Namespaces | Strings | Words (en-GB) | en-US overrides |
|---|---|---|---|---|
| Operator Manage | 32 | 1,890 | 11,634 | 129 |
| Dashboard / KDS / printing | 16 | 869 | 5,415 | 83 |
| Social posts / schedule graphics | 9 | 657 | 3,354 | 63 |
| Signup / setup / demo / native shell | 14 | 491 | 2,913 | 46 |
| Customer ordering | 17 | 382 | 2,038 | 50 |
| Marketing + plans PDF | 13 | 361 | 2,566 | 54 |
| Emails / alerts / push | 6 | 194 | 1,614 | 47 |
| **Total** | **107** | **4,844** | **29,534** | **472** |

<details><summary>All 107 namespaces (strings · words · en-US overrides)</summary>

| Namespace | Strings | Words | en-US | Surface |
|---|---|---|---|---|
| socialPosts | 318 | 1855 | 17 | Social posts / schedule graphics |
| dashboard | 310 | 1825 | 28 | Dashboard / KDS / printing |
| errorsManage | 210 | 1821 | 18 | Operator Manage |
| manageSettings | 180 | 1134 | 19 | Operator Manage |
| order | 170 | 976 | 18 | Customer ordering |
| manageMenu | 156 | 717 | 1 | Operator Manage |
| manageMenuImport | 150 | 1009 | 8 | Operator Manage |
| customDomain | 125 | 1149 | 11 | Operator Manage |
| emailCustomer | 116 | 916 | 40 | Emails / alerts / push |
| kds | 105 | 653 | 5 | Dashboard / KDS / printing |
| nativeShell | 99 | 600 | 12 | Signup / setup / demo / native shell |
| designEditor | 96 | 345 | 17 | Social posts / schedule graphics |
| compare | 93 | 638 | 15 | Marketing + plans PDF |
| manageAllergens | 87 | 508 | 3 | Operator Manage |
| addOrder | 86 | 474 | 5 | Dashboard / KDS / printing |
| demoGetStarted | 85 | 432 | 4 | Signup / setup / demo / native shell |
| manageWhatsApp | 82 | 818 | 8 | Operator Manage |
| manageSchedule | 78 | 403 | 4 | Operator Manage |
| printing | 73 | 558 | 6 | Dashboard / KDS / printing |
| manageExtras | 73 | 268 | 3 | Operator Manage |
| manageReports | 68 | 119 | 2 | Operator Manage |
| eventTypes | 67 | 286 | 9 | Operator Manage |
| manageShell | 64 | 307 | 5 | Operator Manage |
| errorsKitchen | 63 | 465 | 8 | Dashboard / KDS / printing |
| auth | 61 | 342 | 1 | Signup / setup / demo / native shell |
| errorsOnboarding | 61 | 393 | 1 | Signup / setup / demo / native shell |
| planPrompt | 60 | 140 | 0 | Operator Manage |
| manageScheduleEvent | 59 | 168 | 7 | Operator Manage |
| manageTeam | 59 | 239 | 4 | Operator Manage |
| managePayments | 56 | 538 | 6 | Operator Manage |
| weeklyPost | 56 | 308 | 4 | Social posts / schedule graphics |
| landing | 56 | 652 | 20 | Marketing + plans PDF |
| kitchenModals | 55 | 267 | 5 | Dashboard / KDS / printing |
| eventPost | 52 | 265 | 0 | Social posts / schedule graphics |
| manageScheduleImport | 49 | 168 | 4 | Operator Manage |
| serviceSettings | 49 | 265 | 6 | Operator Manage |
| kitchenCapacity | 46 | 358 | 10 | Dashboard / KDS / printing |
| orderCard | 44 | 127 | 9 | Customer ordering |
| planFeatures | 42 | 113 | 2 | Marketing + plans PDF |
| demoUpload | 40 | 271 | 5 | Signup / setup / demo / native shell |
| manageDeals | 40 | 173 | 0 | Operator Manage |
| provisionContent | 39 | 75 | 8 | Signup / setup / demo / native shell |
| weeklyPostApi | 39 | 262 | 1 | Social posts / schedule graphics |
| errorsCustomer | 36 | 350 | 8 | Customer ordering |
| fontPicker | 36 | 139 | 1 | Social posts / schedule graphics |
| schedulePlaces | 34 | 108 | 6 | Social posts / schedule graphics |
| paymentActions | 33 | 205 | 4 | Dashboard / KDS / printing |
| truckPage | 33 | 170 | 3 | Customer ordering |
| featuresPage | 33 | 458 | 6 | Marketing + plans PDF |
| orderStatus | 32 | 114 | 7 | Customer ordering |
| privateEvents | 32 | 282 | 3 | Operator Manage |
| manageBilling | 32 | 208 | 2 | Operator Manage |
| pricing | 30 | 227 | 2 | Marketing + plans PDF |
| emailAccount | 26 | 242 | 1 | Emails / alerts / push |
| deleteAccount | 26 | 240 | 1 | Operator Manage |
| goLive | 25 | 248 | 5 | Signup / setup / demo / native shell |
| demo | 24 | 133 | 2 | Signup / setup / demo / native shell |
| setup | 24 | 144 | 3 | Signup / setup / demo / native shell |
| captions | 24 | 70 | 1 | Marketing + plans PDF |
| ticket | 23 | 44 | 4 | Dashboard / KDS / printing |
| planTable | 23 | 123 | 0 | Marketing + plans PDF |
| alertsOperator | 20 | 267 | 2 | Emails / alerts / push |
| emailSignup | 20 | 130 | 3 | Emails / alerts / push |
| posterWords | 18 | 47 | 17 | Social posts / schedule graphics |
| walkthrough | 17 | 103 | 3 | Signup / setup / demo / native shell |
| userMenu | 16 | 27 | 0 | Dashboard / KDS / printing |
| manageCharges | 16 | 109 | 0 | Operator Manage |
| deals | 15 | 51 | 2 | Customer ordering |
| dashboardBanners | 15 | 84 | 0 | Dashboard / KDS / printing |
| manageUpsells | 15 | 67 | 0 | Operator Manage |
| offlineProtection | 15 | 230 | 1 | Dashboard / KDS / printing |
| buzzer | 14 | 71 | 0 | Dashboard / KDS / printing |
| contactPage | 13 | 67 | 3 | Marketing + plans PDF |
| legalChrome | 13 | 53 | 0 | Marketing + plans PDF |
| whatsappCustomer | 11 | 61 | 0 | Customer ordering |
| whereYouTrade | 11 | 67 | 1 | Operator Manage |
| siteFooter | 11 | 75 | 3 | Marketing + plans PDF |
| charges | 10 | 18 | 0 | Customer ordering |
| privateLink | 10 | 91 | 3 | Customer ordering |
| emailOperator | 10 | 53 | 1 | Emails / alerts / push |
| settingsCopy | 9 | 132 | 1 | Operator Manage |
| copyButton | 8 | 31 | 0 | Operator Manage |
| postShare | 8 | 25 | 0 | Social posts / schedule graphics |
| landingNav | 8 | 17 | 0 | Marketing + plans PDF |
| landingFooter | 8 | 18 | 0 | Marketing + plans PDF |
| plansPdf | 7 | 55 | 2 | Marketing + plans PDF |
| demoSaveEmail | 7 | 93 | 1 | Signup / setup / demo / native shell |
| manageScheduleVerify | 7 | 108 | 1 | Operator Manage |
| completionSettings | 7 | 95 | 4 | Dashboard / KDS / printing |
| priceControls | 6 | 17 | 0 | Operator Manage |
| manageApi | 6 | 22 | 2 | Operator Manage |
| cuisinePicker | 5 | 12 | 0 | Customer ordering |
| tradeArea | 5 | 51 | 0 | Signup / setup / demo / native shell |
| managePrimitives | 5 | 46 | 0 | Operator Manage |
| outreach | 5 | 75 | 0 | Operator Manage |
| preorder | 4 | 12 | 0 | Customer ordering |
| eventCard | 4 | 8 | 0 | Customer ordering |
| vanFilter | 4 | 8 | 3 | Dashboard / KDS / printing |
| takingPayment | 4 | 51 | 0 | Dashboard / KDS / printing |
| phone | 3 | 16 | 1 | Signup / setup / demo / native shell |
| menuBadges | 3 | 6 | 0 | Customer ordering |
| modifierRules | 2 | 12 | 0 | Customer ordering |
| push | 2 | 6 | 0 | Emails / alerts / push |
| soldOut | 1 | 1 | 0 | Customer ordering |
| orderLine | 1 | 1 | 0 | Customer ordering |
| whereBased | 1 | 12 | 0 | Signup / setup / demo / native shell |
| stockCopy | 1 | 28 | 0 | Customer ordering |

</details>

How counted: every leaf in `messages/en-GB.json` per top-level namespace. Words exclude `{params}` and `<tags>`. Admin
has essentially no namespaces; its words are hardcoded (§B.7).

### B.7 User-facing English still hardcoded outside messages
**About 270 live strings outside admin** (332 candidates, less about 60 dead or shadowed literals), plus **about 2,100
in admin** (which can stay English).
- **How counted:** a TypeScript AST scan of 642 files in `app/`, `components/` and `lib/`, classified by hand-rule;
  about ±15%.
- **Also English but not user-facing:** about 230 ops/staff strings, 151 `throw new Error` messages (a few reach the
  UI) and 24 AI prompt texts.

| Area | Live strings | Main files |
|---|---|---|
| Village Foodie consumer site (UK-only, not needed for EU) | ~95 | `app/page.tsx` (24), `components/EventListCard.tsx` (27), `app/venues/[slug]/VenueClient.tsx` (17), `app/hire/page.tsx` (7), `app/trucks/page.tsx` (6), `app/contact/page.tsx` (5) |
| Manage (lib copy constants) | ~43 live (+~30 dead labels) | `lib/kitchen-capacity.ts:54-63`, `lib/event-conflicts.ts:39-43`, `lib/settings-copy.ts:64,75,77`, `lib/private-events/copy.ts:52,58,92`, `lib/private-events/write.ts:161,223,230`, `lib/demo-kitchen.ts:38-40`, `lib/custom-domain/vercel.ts:75-77`, `lib/slot-fit-message.ts:82`, `lib/slot-display.ts:95`, `lib/slot-indicator.ts:50`, `lib/slot-interval.ts:73` |
| WhatsApp customer and operator text | ~33 | `lib/whatsapp/reply-cap.ts:102-109`; `app/api/orders/submit/route.ts:143,182-186` (the new-order alert); `app/api/cron/auto-reject-offline-orders/route.ts:57` |
| Emails | ~15 | `app/api/inbound-schedule/route.ts:371-385` (the "New events found" operator email); `app/api/demo/save-email/route.ts:106`. `lib/email.ts` itself is fully translated |
| API errors shown in the UI | ~27 | `app/api/manage/route.ts:210,233,595,666`; `app/api/stripe/connect/route.ts:164,303`; `lib/stripe/connect.ts:189`; `app/api/dashboard/action/route.ts:263,727,2621` |
| Dashboard / KDS | ~11 live (+8 dead) | `lib/dashboard-read.ts:112,114`; `lib/useReadyEmailUndo.ts:43`; `components/WebOfflineBanner.tsx:69` |
| Marketing / SEO | ~23 | `app/features/page.tsx:86,105` (metadata titles), `lib/site-metadata.ts:29-30`, `components/StoreBadges.tsx:50-56` (badge alt and aria), `lib/contact-topics.ts:12-16` |
| Schedule graphics / weekly post | ~11 | `lib/weekly-post/draw.ts:62` ("Powered by HatchGrab", drawn into the image), `lib/weekly-post/locale.ts:72-85`, `lib/schedule-graphics/places.ts:185-197,471`, `lib/schedule-graphics/event-preview.ts:17,125` |
| Embeds / uploads / auth | ~14 | `components/menu/MenuUploadFields.tsx:56,63,80,85`; `app/embed/[slug]/EmbedSchedule.tsx:57,61,70`; `components/embed/EmbedParts.tsx:152`; `components/auth/SessionAlertBanner.tsx:42,44,51` |
| Order page allergen line | 2 | `app/manage/[token]/page.tsx:4362-4363` ("Contains:", "May contain:") |

**Dead or shadowed literals that can be deleted rather than translated:**
- `SETTINGS_SECTIONS`, `MENU_SECTIONS` and `FOOD_EMOJI_CATEGORIES` in `app/manage/[token]/page.tsx`;
- `STATUS[].label` in `components/dashboard/types.ts`;
- `describePreorderOpenRule` and `describePreorderDeadline` in `lib/preorder.ts:199,208` (no callers).

---

## C · Plan names per language (design, not built)

**Today:**
- `plans.name`, `description` and `subtitle` are one English value each (`lib/plans.ts:24-25,48,390-397,415`).
- They are shown by the pricing cards, PlanTable, the plans PDF, Billing, PlanPrompt, the refusal text, /compare,
  JSON-LD Offer names and the upgrade mailto (`components/pricing/PricingSection.tsx:66-119`;
  `components/pricing/PlanTable.tsx:103`; `lib/plans-pdf.ts:174-209`; `app/manage/[token]/page.tsx:14332-14770`;
  `components/PlanPrompt.tsx:28-34`; `lib/plan-refusal.ts:29`; `app/compare/CostComparison.tsx:85-1298`;
  `lib/structured-data.ts:52`).
- **They are also interpolated into sentences:**
  - "{plan} plan" (`manageBilling.json:10`, `compare.json:71`);
  - "Switch to {plan}";
  - "Everything in {plan}, plus" (`pricing.json:12`);
  - "{feature} is included on {plan}" (`planPrompt.json:2`, `errorsManage.json:211`);
  - "{plans} add {features}" (`planTable.json:3`);
  - "Then {fallback} automatically" (`planTable.json:4`).

**Options:**

| | **1 · `plan_translations` table** (plan_key, locale, name, description, subtitle) | **2 · Message keys by plan key** (`planNames.<key>.name`…) | **3 · `jsonb` columns on plans** (`name_i18n`…) |
|---|---|---|---|
| Keeps "plans are data" (35.aj-1) | ✅ a new plan or language is a data change | ❌ a new plan needs a release for its words | ✅ |
| Fallback | locale → language → the plans row (en-GB) | message chain → en-GB → DB value | the same as 1, in code |
| Glossary check (D) and translation tooling | needs the check to read the table | ✅ free (it's a messages file) | needs a custom check |
| Security | RLS, service role, the same as plans | n/a | n/a |
| Admin editing | a natural table to edit | code-only | awkward |
| Cost | 1 migration, `lib/plans.ts` mapping, the catalogue cache keyed by locale | catalogue keys | 1 migration |

**Recommendation: option 1, a `plan_translations` table.**
- The `plans` row stays the en-GB base.
- `lib/plans.ts` resolves `planText(plan, locale)` with the same chain as messages (de-AT → de → base).
- The glossary check (D) also runs over the table, as a read-only SQL step in the harness or a seed file it reads.
- **Separately, the sentences must stop declining the name:**
  - put the name in apposition or after a colon ("Tarif „{plan}“", "le forfait {plan}");
  - never "{plan} plan" as an attributive noun;
  - each language's message owns its frame;
  - for "{plans} add", use an ICU `plural` on the count.

---

## D · Glossary enforcement (proposal)

1. **A machine-readable glossary** generated from `docs/i18n/seo-glossary-eu.md`'s tables:
   `messages/glossary/<lang>.json`, with `{ concept, use, alts, scope, banned[], conf }`. The markdown stays the human
   source; a `--check` mode fails if the JSON is stale (the same pattern as `split-messages.cjs --check`).
2. **`scripts/glossary-check.cjs`, registered in `scripts/harnesses.json`.** It runs over each locale file (and over
   `plan_translations` once C exists) and checks:
   - **Banned terms (fail):** each with a word-boundary, case-aware regex and an optional key scope. For example:
     - DE `\bMenü\b` anywhere the concept is the dish list (allowed only in keys tagged `deal`/`combo`);
     - IT `\bprenotazion\w*` anywhere;
     - IT `\bPOS\b` where the concept is the till;
     - NL `maaltijddeal`;
     - FR `menu` for the dish list;
     - any language "Kommission";
     - an untranslated "Pay at Hatch", or the word "hatch", in a non-English file;
     - DE-CH `ß`.
   - **Required terms (fail):** a concept→key map (e.g. `concept:menuList → manageMenu.title, order.menuHeading…`); the
     key's value must contain the `use` term (or an allowed inflection list).
   - **Invariants (fail):**
     - "HatchGrab" appears verbatim wherever en-GB has it;
     - "Pro" never translated;
     - `{params}` and `<tags>` identical to en-GB;
     - ICU syntax valid.
   - **Low-confidence (warn, not fail):** keys using a term marked `Conf. Low` are listed for native review until a
     `reviewed` flag is set.
   - **Completeness (fail, per language once it is "live"):** every en-GB key present. Today's
     `scripts/messages-parity.cjs` checks only the reverse.
3. **The translation step itself** (human or AI) is given the glossary JSON as a hard constraint. The check is the
   backstop, not the method.

---

## E · Fonts and formats

**Fonts.**
- **Every `next/font/google` call loads `subsets: ['latin']` only:**
  - Geist and Geist Mono: `app/layout.tsx:2,15,22`. This is the app's body font (Manage, dashboard, KDS, order page),
    via `app/globals.css:15-16,24`;
  - Archivo, Public Sans and Courier Prime: `app/landing/page.tsx:77-80`, `app/features/page.tsx:130-133`,
    `app/compare/page.tsx:108-111`, `app/contact/HatchGrabContact.tsx:34-37`.
- Google's `latin` subset covers Latin-1 plus œ/Œ, € and general punctuation (including U+202F). **So ä ö ü ß é è ê ç à
  ñ ì ò ù œ € are covered for de, nl, fr, es and it.** `latin-ext` is only needed for Central/Eastern European letters
  (ő ł š č ğ); without it those fall back to system-ui per character.
- **Recommendation:** add `'latin-ext'` before any non-Western European country. It is cheap.
- **Plans PDF:** Open Sans on Vercel (`lib/plans-pdf.ts:114-123,237`), which covers Latin-1 and Greek/Cyrillic per the
  code notes. **€ and œ are not yet verified by a render.**
- **Posters:**
  - 36 bundled TTFs in `assets/fonts/weekly-post/` (`lib/weekly-post/font-store.ts:116-158`);
  - all cover ä ß é €, but **Lato and Permanent Marker lack ő č ğ ř**;
  - **U+202F is missing from every family except Inter and Merriweather.** That matters for French numbers if money
    or Intl output is ever drawn on a poster (it isn't today). A missing glyph draws a blank box
    (`lib/weekly-post/ttf-metrics.ts:131-133`);
  - user-chosen Google families are filtered on `latin` only (`scripts/build-font-catalogue.mjs:223`).
- **Native apps** are Capacitor shells on the web UI (`ios/App/App/capacitor.config.json:5-6`), so they use the same
  fonts.

**Formats** (Intl-based money is fine; the hand-built time and date code is not):

| | de | nl | fr | es | it | Where it breaks |
|---|---|---|---|---|---|---|
| Money (Intl) | 12,50 € | € 12,50 | 12,50 € (NBSP; U+202F thousands) | 12,50 € | 12,50 € | ✅ `lib/money-format.ts:54-71` |
| Per month | "/mo" | "/mo" | "/mo" | "/mo" | "/mo" | ❌ English, `money-format.ts:64-66` |
| Small amount | "25c" | "25c" | "25c" | "25c" | "25c" | ❌ `MINOR_SUFFIX` English, `:75` |
| Percent | 1,5 % | 1,5% | 1,5 % | 1,5 % | 1,5% | ✅ `pctLabel` |
| Time (24h) | 18:30 | 18:30 | **18 h 30** expected | 18:30 | 18:30 | ❌ forced "HH:MM" (`lib/time-utils.ts:99,110`; posters `lib/weekly-post/format.ts:82`) |
| Numeric date | 09.10.2026 | 09-10-2026 | 09/10/2026 | 09/10/2026 | 09/10/2026 | ❌ forced "/" (`time-utils.ts:335-347`) |
| Long date | Freitag, 9. Oktober | vrijdag 9 oktober | vendredi 9 octobre | viernes, 9 de octubre | venerdì 9 ottobre | ❌ ordinals: "Freitag 9th Oktober" (`time-utils.ts:360-373,416-435`) |
| Short date | Fr., 9. Okt. | vr 9 okt | ven. 9 oct. | vie, 9 oct | ven 9 ott | ⚠️ hand-built dmy/mdy (`:429-466`) |
| Week start | Monday | Monday | Monday | Monday | Monday | ✅ data |
| Decimal entry | 1,50 | 1,50 | 1,50 | 1,50 | 1,50 | ❌ `parseFloat` sites (B.3 item 7) |
| Tickets | no accents; € as EUR | | | | | ⚠️ `lib/printing/ticket.ts:466-551` |

**What the fix needs:**
- a per-locale time pattern (Intl `hourCycle`, plus a French "h" style);
- Intl-built ordinal-free long and short dates for non-English locales;
- `time_format` / `date_order` / `week_start` read from the row as today;
- locale-aware parsing for every price input.

---

## F · EU VAT touchpoints (report only, no advice)

- **HatchGrab's plan prices:**
  - data in `plan_prices` (`lib/plans-server.ts:35-39`; `lib/plans.ts:64-67`; `lib/plan-offer.ts:34-50,113-115`);
  - shown with no VAT notion on:
    - `components/pricing/PricingSection.tsx:49,78`
    - `components/pricing/PlanTable.tsx:57,104`
    - `lib/plans-pdf.ts:165,191,209` (the disclaimer at `messages/ns/en-GB/plansPdf.json:8`)
    - `app/manage/[token]/page.tsx:11821,14332,14516-14519,14603-14608,14668,14694`
    - `components/usePlanPriceLabel.ts:30`
    - `components/PlanPrompt.tsx:23`
    - `app/compare/CostComparison.tsx:85-88,934,1298`
  - **JSON-LD Offers** carry a price with no tax fields (`lib/structured-data.ts:24-28,45-58`);
  - the admin promo price is at `app/admin/page.tsx:1552-1555`.
- **The platform fee** (HatchGrab's commission on online orders, a B2B supply):
  - `lib/order-charge-rules.ts:53,84,96-99`;
  - `lib/plans-server.ts:64-74`;
  - `lib/order-charges.ts:48,71,99,214,220-226`;
  - `lib/payments/order-drafts.ts:110` (`application_fee_minor`);
  - `lib/payments/capture.ts:47-49,261`: **not sent today**;
  - switch: `country_settings.platform_fee_enabled` (now **true for US**, see Summary).
- **A service fee kept by HatchGrab** (`service_fee_recipient = 'hatchgrab'`, charged to the **consumer**):
  - `lib/order-charge-rules.ts:59-63`; `lib/country-settings.ts:131-133`;
  - `lib/order-charges.ts:40,67`; `lib/order-charge-lines.ts:78`;
  - `components/manage/ChargesCard.tsx:77-78`; `lib/charge-settings.ts:97`;
  - `components/admin/CountriesTab.tsx:337-348`.
- **`fees_taxed`** (`lib/country-settings.ts:137`; `lib/order-charges.ts:193`; migration
  `supabase/migrations/20261010_17_order_charges.sql:106,218-219`): adds the service fee and surcharge to the
  **truck's** tax base. There is no tax treatment of HatchGrab's own fees anywhere.
- **Invoices and receipts for HatchGrab's fees: none exist.**
  - There are no Stripe subscription, checkout or invoice calls (only comments: `app/api/webhooks/stripe/route.ts:674`,
    `components/DemoGetStarted.tsx:432`).
  - Upgrades are a mailto (`app/manage/[token]/page.tsx:14770`).
  - The only receipts are customer order receipts (`app/order/[id]/manage/page.tsx:49,141`).
- **Data:** there is **no VAT-number column for operators** (no `vat`, `tax_id` or similar anywhere; §H, query 8), and
  no country-of-establishment field beyond `trucks.country`.
- **Terms:** `content/legal/terms-and-conditions.md:66` says "We are not registered for VAT"; `:50` says the truck
  handles its own VAT; `:67-73` cover billing in advance and failed payments.

---

## G · Proposed build plan (small stages)

| Stage | What | Files (main) | Risk | Mockup first? |
|---|---|---|---|---|
| **IE-0 · Data** | Run §A.13 (IE switched off). Nothing becomes visible | SQL only | none (off; no address) | No |
| **IE-1 · Ireland code** | `IE:'ie'`; the en-IE override (A.11), or neutral en-GB wording for "in the {country}" and "{country} food trucks"; outreach WhatsApp parsing in the prospect's country (A.10); country-aware postcode lines in the two prompts; IE hero screenshots in €; check the PDF's € by a render | `lib/marketing-country.ts`, `lib/i18n/locales.ts`, `lib/i18n/messages.ts`, `scripts/split-messages.cjs`, `messages/en-IE.json`, `components/admin/{ProspectWorkspace,OutreachPanel,TemplatesPanel}.tsx`, `app/api/admin/outreach/route.ts`, `lib/admin/truck-details.ts`, `lib/schedule-extract.ts`, `lib/admin/screenshot-events.ts`, `lib/landing-screens.ts` | low; harness re-pins for a third country page | Only the screenshots (assets) |
| **IE-2 · Go live** | Stripe confirms IE Connect; an Irish legal section (lawyer); `enabled = true`; a hidden IE test truck end to end (as the US rehearsal) | data, `content/legal/country-specific-terms.md`, `lib/legal.ts` | money paths in a new currency | No |
| **L-1 · Locale engine** | A single LOCALES source; a chained merge (`de-AT → de → en-GB`); split-messages per locale; per-locale lazy catalogue loading; a completeness check per live locale; `<html lang>` on every surface | `lib/i18n/*`, `scripts/split-messages.cjs`, `scripts/messages-parity.cjs`, `app/layout.tsx`, `proxy.ts` | bundle and hydration changes on every page | No |
| **L-2 · Language model** | `country_settings.languages[]`; `trucks.language`; `orders.language`; words follow the language while formats follow the country locale; Manage language setting; customer browser override (if you decide so) | migrations, `lib/country-settings*.ts`, `lib/i18n/server-locale.ts`, `useTruckLocale` callers, `lib/email*.ts` | wide (every locale decision point, B.2) | **Yes** (Manage setting, order-page switcher) |
| **L-3 · Formats** | Intl dates without English ordinals; per-locale time pattern (French "h"); locale-aware price parsing; "/mo" and "c" into messages; posters' GB/US tables generalised; `latin-ext` | `lib/time-utils.ts`, `lib/money-format.ts`, `lib/weekly-post/{locale,format,words}.ts`, price inputs (B.3 item 7), font calls | medium: UK output must stay byte-identical (proof as in the language phases) | No |
| **L-4 · Safety** | 🔴 Multilingual allergen guards; every prompt names its output language; menu extraction keeps the menu's language; the EU allergen list in each language | `lib/whatsapp-classifier.ts`, `lib/menu-extract.ts`, `lib/allergens.ts`, `app/api/manage/process-allergens/route.ts` | **high (food safety)** | No |
| **L-5 · Routing** | `/be/nl`-style language segments and hreflang `xx-YY` (B.4); a language cookie | `lib/marketing-country.ts`, `lib/visitor-country*.ts`, `lib/marketing-meta.ts`, `proxy.ts`, `app/[country]/…`, `app/sitemap.ts` | SEO (redirects, hreflang) | **Yes** (country/language menu) |
| **L-6 · Plans and glossary** | `plan_translations` (C); sentence frames that don't decline plan names; `glossary-check.cjs` (D) | migration, `lib/plans.ts`, messages, `scripts/` | low | No |
| **L-7 · Hardcoded English** | Move about 175 live non-VF strings into messages; delete the dead labels (B.7) | the files in B.7 | low to medium | No |
| **T-1 · First language** (NL or DE) | Translate about 4,800 strings (~29.5k words) under the glossary; native review of low-confidence terms; legal translation; length QA at 375px on Manage, dashboard, KDS and order page; text-length test | `messages/nl.json` (+ `nl-BE` later) | quality and text length | **Yes** (screens with the longest strings) |

**Order:** IE-0 → IE-1 → IE-2 can ship alone, with no dependency on L-*. L-1 → L-4 must all land before T-1. L-5 is
needed only for BE and CH (not for NL or DE alone). L-6 and L-7 can run alongside L-2 and L-3.

---

## H · Read-only SQL that was run (20 October 2026)

1. The `country_settings` columns:
```sql
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='country_settings' order by ordinal_position
```
2. The live country rows (GB and US):
```sql
select row_to_json(c) as row from country_settings c order by country_code
```
3. The live `plan_prices`:
```sql
select plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor from plan_prices order by country_code, plan_key
```
4. The `country_settings` constraints:
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.country_settings'::regclass order by conname
```
5. The triggers on `country_settings`, `plan_prices` and `plans`:
```sql
select tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t where tgrelid in ('public.country_settings'::regclass, 'public.plan_prices'::regclass, 'public.plans'::regclass) and not tgisinternal order by tgname
```
6. The trigger functions:
```sql
select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('country_settings_require_plan_prices', 'plans_keep_enabled_countries_priced')
```
7. Trucks and discovery trucks per country; operators by terms version:
```sql
select 'trucks' as t, country, count(*) as n from trucks group by country
union all select 'discovery_trucks', country, count(*) from discovery_trucks group by country
union all select 'operators_terms_version', terms_version, count(*) from operators group by terms_version
order by 1, 2
```
8. Any language, locale, currency, country, Stripe account or VAT columns:
```sql
select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and (column_name ilike '%locale%' or column_name ilike '%language%' or column_name ilike '%lang%' or column_name ilike '%currency%' or column_name ilike '%country%' or column_name ilike '%stripe_account%' or column_name ilike '%vat%' or column_name ilike '%tax_id%') order by table_name, column_name
```
9. The `plans` columns:
```sql
select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'plans' order by ordinal_position
```
10. The country foreign keys and the `plan_prices` checks:
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid in ('public.plan_prices'::regclass, 'public.trucks'::regclass, 'public.discovery_trucks'::regclass) and contype in ('f', 'c') and (pg_get_constraintdef(oid) ilike '%country%' or conrelid = 'public.plan_prices'::regclass) order by 1, 2
```

**What they showed:**
- **GB:** enabled, GBP/en-GB, card fees 1.5% + 20p / 1.4% + 10p / +10p, `uk14`, platform fee off.
- **US:** **enabled, `platform_fee_enabled = true`** (updated 20 Oct 16:28 UTC by dominic@hatchgrab.com), USD/en-US,
  service fee max 4% + 50¢.
- **`plan_prices`:** GB and US 0 / 2900 / 6900, included 0 / 400000 / NULL, fee 99 / 99 / 0.
- **Trucks:** 11 GB, 1 US. Discovery trucks: 267 GB.
- **No language column** on trucks, operators or orders; **no VAT or tax-ID column**.
- **Foreign keys:** `plan_prices.country_code`, `trucks.country` and `discovery_trucks.country` all point to
  `country_settings`.
- **Plus one NOT RUN draft:** the IE SQL in §A.13.

## I · What I did not do
- **No code, config or data change.** The only writes are the glossary copy and this report.
- **The NOT RUN SQL** was not run.
- **The US `enabled` and platform-fee state** was observed only, not touched.
- **No legal or tax advice** (§A.9 and §F list touchpoints only).
