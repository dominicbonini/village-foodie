# admin-countries-1 — report

**23 October 2026.** Written for Dominic. Nothing was committed, pushed or deployed. There was no database write: every
query was read-only (§8). The SQL below is **NOT RUN**.

## 0 · What you do (in this order)

1. **Deploy** this branch (commit and push are yours).
2. **Run after deploy:** `supabase/migrations/20261040_france_row_recheck.sql` (France's row, switched OFF, and its three
   plan prices). The full text is in §4.1.
3. **Optional, run after deploy, only if you want it:** `supabase/migrations/20261041_europe_short_names_2_recheck.sql`. It
   puts the own-language short names (Polska … България) on 14 **live** country pages (§4.2).
   - ⚠️ Do **not** run 20261038. All 14 of its countries are switched on now, and every update in it is guarded by
     `enabled = false`, so it would change nothing.
4. **Admin › Countries:** switch **France** on (its row → *Switched on* → the row's **Save**).
   - **Luxembourg is already switched on** (live since 23 Oct, OBSERVED). After the deploy its pages are in French
     (fr-LU), so there is nothing to switch for it.

## 1 · Summary

- **Part 1: Admin › Countries is one row per country and one column per setting.**
  - The Country column (flag, name, code, and the row's Save) and both header rows are frozen.
  - Help text sits behind ⓘ buttons: a tooltip on hover, a popover on tap.
  - Status badges, a search box and filter chips are added.
  - Rows are grouped English-speaking / Europe from the data.
  - "Extra van" is gone (display only).
  - The PUT body is **byte-identical** to the old page's for the same edit (WebKit). No server file changed.
- **Part 2: every admin page is full width** with 32px side padding: the header, the tab bar, every tab body, and
  /admin/whatsapp-connections and /admin/whatsapp-templates. AppHeader gained an opt-in `fullWidth` prop, so no other page
  changes.
- **Part 3:**
  - France SQL re-checked and fixture-proved (20261040);
  - fr-LU built (20 keys over fr-FR);
  - fr-FR phone example → « +33 6 12 34 56 78 »;
  - ro-RO button → „Comandă ce implică o obligație de plată” (and the busy notice that quotes it);
  - schedule-graphics-places was already fixed by the other session, so I left it.
- **Proof:**
  - tsc 0 errors; build OK; lint identical to the baseline (2,445 errors / 378 warnings).
  - New harnesses: `admin-countries-1.cjs` **47/47** and `admin-countries-1-screens.cjs` **34/34** (WebKit, by hand).
  - Sweep: 164 of 166 passed. The 2 failures are timing under load, and both pass when rerun (§7).
  - Public pages are byte-identical except the approved wording (§6).

## 2 · Part 1 — Admin › Countries

### 2.1 Every old setting → its new column (checked control by control by `admin-countries-1.cjs`)

| Old row (one column per country) | New column(s) (one row per country) | Group |
|---|---|---|
| Header pill "Switched on / Off" + Switched on toggle | **Switched on** | Status |
| Header "N trucks" | **Trucks** | Status |
| Country name | **Country name** | Status |
| — (new, derived) | **Status** (badge) | Status |
| Take our fee (+ grey "Not charged yet" note) | **Take our fee** (note in its ⓘ) | HatchGrab platform fee |
| ~~Extra van — Same as the plan's monthly price~~ | **removed** (display only; `plan_prices.extra_van_monthly_minor` untouched) | — |
| Online card payments (% + fixed) | **Online %**, **Online fixed (p/c)** | Card fees |
| In-person card payments (% + fixed) | **In person %**, **In person fixed (p/c)** | Card fees |
| Extra for Tap to Pay | **Tap to Pay extra (p/c)** | Card fees |
| Which cards these rates are for | **Which cards these rates are for** | Card fees |
| Menu prices include tax (toggle + Tax name box) | **Menu prices include tax**, **Tax name** | What trucks can offer customers |
| Card fee can go on the customer's bill | same | ″ |
| Card fee limits (Cap % + Credit cards only) | **Card fee cap %**, **Credit cards only** | ″ |
| Card fee not allowed in | same | ″ |
| Tipping on for new trucks (toggle + tip chips) | **Tipping on for new trucks**, **Tip choices %** | ″ |
| Allowed in this country (+ amber law note) | same (the amber note behind an amber ⓘ beside the toggle) | Online service fee |
| Who keeps it | same | ″ |
| HatchGrab's fee (% + fixed) | **HatchGrab's fee %**, **HatchGrab's fee fixed (p/c)** | ″ |
| Most a truck can charge (% + fixed) | **Most a truck can charge %**, **… fixed (p/c)** | ″ |
| Service fee and card fee are taxed | same | Tax on fees |
| Currency · Language style · Times · Dates · Week starts · Phone country code · Short name · Example phone number · Phone number check · Addresses · Time zones offered at signup · Default time zone | same, one column each | Formats |
| Allergen list · Allergen card on its own · Support hours | same, one column each | Allergens and support |
| Header "Last saved … by …" | ⓘ beside the country's name | Country column |
| Header Save · errors · Remove country | the Country column: **Save only on a changed row**; errors and Remove under the name | Country column |

All 39 form fields are mapped. The harness fails if one is missing or its control sits in the wrong column.

**Groups:** the page's existing groups are kept: Status · HatchGrab platform fee · Stripe card fees · What trucks can
offer customers · Online service fee · Tax on fees · Formats · Allergens and support.

### 2.2 Decisions worth knowing

- **Units in the header.** The headers read "Online %", "Online fixed (p/c)" and so on.
  - The currency's own small sign (p, c, ¢, Rp, öre, gr, bani …) **stays beside each fixed box**. One header cannot name
    35 currencies' units, and the old boxes showed it too.
  - Every number box is right-aligned.
- **Column widths fit their content.** The table is `w-max`, text boxes size to their value, and header labels wrap at
  10rem.
  - The one exception is **Time zones offered at signup**: its chips wrap at 26rem, so the US, AU and CA rows are 3–4
    lines tall.
- **Sections, from data, not lists:**
  - **English-speaking** = the row's locale is English;
  - **Europe** = a non-English locale with a `Europe/…` time zone **or the euro**. Cyprus's zone is `Asia/Nicosia`, so
    the zone alone put it in "Other";
  - otherwise "Other countries" (none today).
  - Within a section, rows keep the loader's order (GB first, then by name). A section uses the **saved** values, so a row
    never jumps while it is being edited.
- **Status badges:**
  - "Language not built": the locale is not in `LOCALES`.
  - "Name in English": a non-English locale whose short name equals the English name (the row's `name`, or Intl's English
    name, ignoring a leading "the").
    - **Refinement:** it is flagged only when Intl's name for the country in the row's own language differs. Otherwise
      Luxembourg (fr), Portugal (pt) and Liechtenstein (de) would be false positives.
  - "Ready" otherwise.
  - A red "N boxes to fix" badge is added when the row fails the form's own checks. That is cheap and certain: it is the
    same `formToValues` the server runs.
  - "Needs attention" = not Ready, or boxes to fix.
- **Save:** only a changed row is highlighted (orange tint and left bar) and gets a Save button.
  - Saving sends `{ code, expectedUpdatedAt: row.updatedAt, form: forms[code] }`, the same line as before.
  - Validation, the stale-save refusal, the trigger message, Add and Remove are all unchanged.
  - **No file under `lib/admin/`, `app/api/admin/countries/` or `lib/country-settings.ts` changed** (checked with git).
- **ⓘ** is a tooltip on hover and a popover on click or tap. It is portalled to `<body>` so the scroll box never clips it.
  Escape, a tap elsewhere or a scroll closes it.
- **Today's live data:**
  - the filter chips read All 36 · Switched on 35 · Switched off 1 (France, once 20261040 runs) · Needs attention 14;
  - the 14 are exactly the 20261038 countries (English short names);
  - they become Ready after 20261041 (§4.2).

## 3 · Part 2 — full width

- `components/shared/AppHeader.tsx`: a new `fullWidth?: boolean` prop (default false). The old classes are kept
  byte-for-byte for every other page. With `fullWidth` it uses `px-8` and no max width. Only `/admin` passes it.
- `app/admin/page.tsx`:
  - the tab bar's inner row: `min-[1400px]:max-w-6xl … px-4` → `w-full px-8`;
  - the main body: `max-w-6xl` → `w-full px-8 py-6`;
  - Templates, Outreach, Events and Pricing check: `max-w-[1800px] mx-auto px-4` → `w-full px-8`;
  - comments updated.
- `app/admin/whatsapp-connections/page.tsx`: `p-6 max-w-6xl mx-auto` → `px-8 py-6`.
- `app/admin/whatsapp-templates/page.tsx`: `maxWidth: 900, margin: 0 auto, padding: 24` → `padding: 24px 32px`.
- **Kept on purpose (readable widths or not page width):**
  - modals (`max-w-sm/md/lg/xl/4xl`);
  - the Screenshots log list (`max-w-6xl`, left-aligned, not centred; `screenshot-truck-details-render.cjs` pins it);
  - OutreachPanel's `max-w-4xl` text block.
- `scripts/outreach-templates-render.cjs` (by hand): its stand-in shell now uses the new wrapper classes.

## 4 · Part 3 — small fixes

### 4.1 France — `20261040_france_row_recheck.sql` (NOT RUN · **run after deploy**)

Block B (`20261034`) was re-checked read-only against the live schema on 23 Oct (§8):
- every column it writes exists, and no NOT NULL column without a default is missing;
- every value passes the live CHECKs;
- one `plan_prices` row per active public plan (payg, pro, unlimited), at Ireland's live euro prices.

**No value changed.** The only change: both inserts are now `on conflict … do nothing`, so it is safe to run twice.
`20261034` is left untouched; run **20261040, not both**. France inserts **switched OFF**, `short_name 'France'`.

```sql
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
  platform_fee_enabled, fees_taxed, allergen_card_only_allowed
) values (
  'FR', 'France', false, 'EUR', 'fr-FR', '24h', 'dmy', 'monday',
  '33', 'fr', array['Europe/Paris'], 'Europe/Paris',
  true, 'TVA',
  false, null, false, '{}'::text[],
  false, false, '{}'::numeric[], 'uk14',
  null, null, null, null, null, null,
  1.50, 25, 1.40, 10,
  10, 'EEA cards',
  null, null, null, null, 'admin-countries-1 (france-1 block B, re-checked)',
  'France', '06 12 34 56 78', 'length', 'km',
  'truck', null, null,
  null, null,
  false, false, true
)
on conflict (country_code) do nothing;

insert into public.plan_prices (plan_key, country_code, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor) values
  ('payg',      'FR',    0,      0, 99,    0),
  ('pro',       'FR', 2900, 400000, 99, 2900),
  ('unlimited', 'FR', 6900,   null,  0, 6900)
on conflict do nothing;

commit;
```

(The file itself carries the legal comments: no surcharge, CMF L. 112-12; no service fee, Code de la consommation
L. 112-1.)

**Fixture proof** (`admin-countries-1.cjs` §1, 13 checks; `france-1.cjs` 74/74, now reading 20261040):
- the columns exist against `scripts/fixtures/country-settings-columns-2026-10-23.json` (the live information_schema
  result);
- the CHECKs pass, evaluated the Postgres way;
- the plan set and prices are Ireland's;
- the loader's `mapCountryRow` accepts the row;
- the admin form round-trips every column it owns;
- with the row on, /fr renders in French with its prices (france-1).

### 4.2 Found while checking: 20261038 can no longer do anything — `20261041` (NOT RUN · optional · run after deploy)

- `20261038` guards each update with `and enabled = false`. All 14 rows are switched on (OBSERVED 23 Oct), so it would
  update **no** row.
- `20261041` holds the same 14 names, each guarded by the row's **live English short name** (e.g.
  `where country_code = 'PL' and short_name = 'Poland'`). It is safe twice. The harness checks the names equal 20261038's
  and the guards equal the live values.
- **It changes live wording** on 14 switched-on country pages ("HatchGrab Poland" → "HatchGrab Polska" inside Polish
  sentences). That is what 20261038 meant to do, but it is your call.

```sql
begin;
update public.country_settings set short_name = 'Polska'       where country_code = 'PL' and short_name = 'Poland';
update public.country_settings set short_name = 'Česko'        where country_code = 'CZ' and short_name = 'the Czech Republic';
update public.country_settings set short_name = 'Slovensko'    where country_code = 'SK' and short_name = 'Slovakia';
update public.country_settings set short_name = 'Magyarország' where country_code = 'HU' and short_name = 'Hungary';
update public.country_settings set short_name = 'România'      where country_code = 'RO' and short_name = 'Romania';
update public.country_settings set short_name = 'Hrvatska'     where country_code = 'HR' and short_name = 'Croatia';
update public.country_settings set short_name = 'Slovenija'    where country_code = 'SI' and short_name = 'Slovenia';
update public.country_settings set short_name = 'Suomi'        where country_code = 'FI' and short_name = 'Finland';
update public.country_settings set short_name = 'Eesti'        where country_code = 'EE' and short_name = 'Estonia';
update public.country_settings set short_name = 'Latvija'      where country_code = 'LV' and short_name = 'Latvia';
update public.country_settings set short_name = 'Lietuva'      where country_code = 'LT' and short_name = 'Lithuania';
update public.country_settings set short_name = 'Ελλάδα'       where country_code = 'GR' and short_name = 'Greece';
update public.country_settings set short_name = 'Κύπρος'       where country_code = 'CY' and short_name = 'Cyprus';
update public.country_settings set short_name = 'България'     where country_code = 'BG' and short_name = 'Bulgaria';
commit;
```

### 4.3 Luxembourg — fr-LU

`'fr-LU'` is added to `LOCALES`, and `LOCALE_PARENT['fr-LU'] = 'fr-FR'`. `messages/fr-LU.json` is a sparse override of
20 keys:

| Key | fr-LU |
|---|---|
| `auth.fields.emailPlaceholder` | vous@exemple.lu |
| `auth.signup.emailPlaceholder`, `demoGetStarted.emailPlaceholder`, `demoUpload.emailPlaceholder` | vous@votrefoodtruck.lu |
| `manageMenuImport.schedule.urlPlaceholder`, `manageSettings.schedule.urlPlaceholder` | https://votrefoodtruck.lu/evenements |
| `manageScheduleVerify.malformed` | … Essayez par exemple votrefoodtruck.lu/evenements |
| `customDomain.card.exampleDomain` | votrefoodtruck.lu |
| `manageTeam.phonePlaceholder` | **+352 621 123 456** |
| `designEditor.sample.area` | Esch-sur-Alzette |
| `posterWords.placeSample.nameTownBelow` / `nameTown` | Le Café de la Place / Esch-sur-Alzette |
| `posterWords.busyWeek.venue1…town6` | Salle des fêtes de Differdange · Differdange · Complexe sportif et terrain de loisirs de Bettembourg · Bettembourg · Ettelbruck · Diekirch · Remich · Mersch |

- Generated by `split-messages`: `messages/ns/fr-LU/`, the catalog modules and `locale-files.ts`.
- Back-translations: `docs/i18n/back/fr-LU.json`.
- **short_name stays "Luxembourg"** (it is the French name too).
- **VAT (TVA):** no fr-FR message names a rate, so no message changes. The rate is data:
  - `lib/address-formats.ts` already has `TAX_LU = { label: 'TVA', milli: 3000 }` on the `lu` format: 3 %, the
    super-reduced rate for food and restaurant services;
  - Luxembourg's rates today: 17 % standard, 14 %, 8 %, and 3 % super-reduced (food, restaurant meals; alcohol at 17 %);
  - one secondary site lists restaurants at 8 %, against every other source. The sources are all secondary guides, so
    confirm with the AED before relying on it for compliance:
    [Kintsugi](https://trykintsugi.com/en-gb/sales-tax-guides/europe/luxembourg) ·
    [Taxology](https://taxology.co/blog/vat-luxembourg/) ·
    [Numeral](https://www.numeral.com/blog/luxembourg-vat-rates-and-compliance) ·
    [HOTREC table (WKO)](https://www.wko.at/tourismus-freizeitwirtschaft/gastronomie/hotrec-table-rates.pdf) ·
    [luxtoday](https://luxtoday.lu/en/knowledge/vat-in-luxembourg) ·
    [taxatlas (the 8 % outlier)](https://taxatlas.io/country/luxembourg/vat-sales-tax).
- **Nothing else differs:**
  - Luxembourg uses the same order-button rule as France;
  - EUR, a decimal comma, 24h and Monday come from its row;
  - the allergen list is the EU 14.
- **Lean checks (§7b), in `europe-languages-1.cjs`, now including fr (LU: fr-LU):**
  - translation-check 0 structural (fr-FR and fr-LU);
  - the order button « Commander avec obligation de paiement » / « Payer {amount} »;
  - plan names;
  - the EU 14 in French;
  - /lu renders in French with no en-GB sentence, 29 € / 69 €, og:locale fr_LU, canonical /lu, inLanguage fr-LU;
  - the decimal comma;
  - the allergen guard (10 safety questions caught, 5 plain ones through).
- **Result: 427/427.**

### 4.4 fr-FR phone · ro-RO button

- `messages/fr-FR.json` `manageTeam.phonePlaceholder`: "+44 7700 900000" → **"+33 6 12 34 56 78"**. The back file is
  updated.
- `messages/ro-RO.json` `order.placeOrder` → **„Comandă ce implică o obligație de plată”**. `order.busyNotice` quotes it
  and is updated. The back file is updated.

### 4.5 schedule-graphics-places.cjs

It is already fixed by the other session (an uncommitted edit adding `lib/pricing-check.ts` to EXPECTED). **Left alone.**

## 5 · Saving Ireland: same values before and after

- **Fixture proof (`admin-countries-1.cjs` §3).** The live IE row (read-only query, saved as
  `scripts/fixtures/ie-row-2026-10-23.json`) was put through the real code: `mapCountryRow` → `rowToForm` → the page's
  body → the real `saveCountry` (`lib/admin/country-actions.ts`) → an in-memory table.
  - **Every column except `updated_at` / `updated_by` is identical before and after.**
  - Numerics compare as numbers: the live `"1.50"` is written as 1.5, and numeric(…,2) stores 1.50 again.
  - 41 columns are written; no retired column, `distance_unit` or `competitor_*` is among them.
  - Before / written / after: `docs/admin-countries-1/ie-save-before-after.json`.
- **The page's body, old vs new (WebKit, `admin-countries-1-screens.cjs`).** The git-HEAD CountriesTab and the new one
  were each mounted, given the same edit on Ireland (Take our fee), and saved. **The two PUT bodies are byte-identical**
  (`docs/admin-countries-1/put-body-old-vs-new.json`).
- **Not done live.** There is no admin session here, and a live save is a database write.
  - An identical no-op save cannot be made from the UI anyway: Save appears only on a changed row, as before.
  - To check it yourself after deploy: change Ireland's Support hours, Save, change it back, Save. Then
    `select * from public.country_settings where country_code = 'IE'` should equal the 23 Oct row above except
    `updated_at` / `updated_by`.

## 6 · Byte-identity of public pages (before = HEAD + other sessions' edits; after = this work)

| Capture | Result |
|---|---|
| Phase captures (1a–1e, every manage/dashboard/order surface) | **19,894 / 19,894** leaf values identical |
| Marketing (GB/US/IE/AU/NZ/CA pages, PDFs, sitemap, llms) | **39 / 39** identical |
| Europe (49 artefacts, europe-settings fixtures) | **49 / 49** identical |
| Every European country on (29 countries: landing, features, compare, PDF; sitemap; llms) | **113 / 118** identical. The 5 that differ are exactly **/lu landing, features, compare, the LU PDF** (now French, was en-GB) and **llms.txt's one LU line** (now French; it read "in the Luxembourg" before) |
| Messages | changed: fr-FR, ro-RO (and their ns files, 10 catalog modules that gained fr-LU); added: fr-LU (11 files) |

The sitemap and hreflang are unchanged: /lu was already listed as fr-LU.

## 7 · Checks

- **tsc** `--noEmit`: 0 errors. **Build** (`next build`): OK (run twice, the second after the last CSS class change).
- **Lint:** 2,445 errors / 378 warnings, identical to the baseline. The changed and new files add none (the errors left in
  touched files are on untouched lines).
- **New harnesses:**
  - `admin-countries-1.cjs` **47/47** (registered);
  - `admin-countries-1-screens.cjs` **34/34** (WebKit; by hand; registered under needs_a_browser);
  - `_admin-countries-1-fixtures.cjs` (a module).
- **Re-pins (approved changes only):**
  - `france-1.cjs`: the fixtures now read 20261040. fr-FR may carry exactly one numbers flag,
    `manageTeam.phonePlaceholder` (the French phone; de-DE carries the same kind of flag).
  - `europe-languages-1.cjs`: the ro button → the new wording. fr added for LU. LU exempted from "a short-name SQL for each
    built country" ("Luxembourg" is already French).
  - `_france-1-fixtures.cjs`: it parses `on conflict … do nothing`.
  - The harnesses that read CountriesTab's source needed **no** re-pin, because the column definitions kept their exact
    `label` / `hint` / `cell` text: currency-registry 40, allergen-card-country 30, canada-1 85, countries-api 85,
    address-formats-1 53, phase3-screens 95.
- **SWEEP STATUS** (`node scripts/run-harnesses.cjs`): **166 run · 164 passed · 2 failed**. Both failures are load and
  timing, not this work. Each passes when rerun:
  - `batch-reservation-edit-lock.cjs` took 920 s in the sweep ("409 … after 913642 ms") and passed alone in 10 s.
  - `add-order-refresh.cjs` failed its "a failed read" timing check twice under load, with different counts each time
    ("attempted (1)", then "(0)"). On a quiet machine it passed twice in this working tree, and twice at plain HEAD in a
    throwaway worktree (removed afterwards). Nothing it renders is touched by this work.
  - All new and re-pinned harnesses passed in the sweep: admin-countries-1 47, europe-languages-1 427, france-1 74,
    schedule-graphics-places 270.
  - The first sweep attempt was refused before running anything: the runner refuses any harness containing the card
    processor's name, and the group check named the "… card fees" group. That check now reads the group names from the
    component source.

## 8 · Read-only SQL run (all of this workstream)

```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name in ('country_settings','plan_prices') order by table_name, ordinal_position;
```
```sql
select * from public.country_settings where country_code = 'IE';
```
```sql
select * from public.plan_prices where country_code in ('IE','LU') order by country_code, plan_key;
```
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.country_settings'::regclass order by conname;
```
```sql
select key, is_public, active from public.plans order by key;
```

The first two were run twice: again on 23 Oct to save them as fixtures, with the same results.

## 9 · Flags

1. **20261038 is a no-op now** (§4.2). 20261041 replaces it; optional, and it changes live wording.
2. **Luxembourg is already on.** After the deploy its pages switch from English to French. That is the fix, but it is a
   visible change on a live country.
3. **The old by-hand `countries-screenshots.cjs`** (Chromium, the column layout) is stale. It already was: it pinned the
   retired plan-price rows. It is superseded by `admin-countries-1-screens.cjs`; not deleted.
4. **Other sessions' uncommitted files, not touched:**
   - `docs/reference-manual.md` and `docs/manual-v16-6-report.md` (a V16.6 manual session);
   - `docs/pricing-check-1-report.md` and `scripts/schedule-graphics-places.cjs`.
   - The sweep lists other sessions' unregistered files (`_midnight-*`, `allergen-card-country-screens.cjs`,
     `pricing-check-*`). They are not mine, so they were not registered.
5. **Time-zone chips** make the US, AU and CA rows taller (§2.2).
6. **Screenshots** (docs/admin-countries-1/, WebKit, 1512×945 and 1920×1080):
   - `countries-<w>-top`, `-rows-1…4` (all 36 rows by scrolling), `-frozen` (scrolled right and down);
   - `-info-popover` (the ⓘ of *Take our fee* open), `-ireland-changed` (Ireland highlighted with its Save);
   - `trucks-<w>`, `domains-<w>`.
   - The fixture rows are the live 35 (Ireland the live row; the rest from the SQL, with 20261037's names, since it ran)
     plus France off.

## Undo (only if Dominic asks)

```sql
-- France (20261040)
begin;
delete from public.plan_prices where country_code = 'FR';
delete from public.country_settings where country_code = 'FR' and enabled = false;
commit;
-- Short names (20261041): back to English
begin;
update public.country_settings set short_name = 'Poland' where country_code = 'PL' and short_name = 'Polska';
update public.country_settings set short_name = 'the Czech Republic' where country_code = 'CZ' and short_name = 'Česko';
update public.country_settings set short_name = 'Slovakia' where country_code = 'SK' and short_name = 'Slovensko';
update public.country_settings set short_name = 'Hungary' where country_code = 'HU' and short_name = 'Magyarország';
update public.country_settings set short_name = 'Romania' where country_code = 'RO' and short_name = 'România';
update public.country_settings set short_name = 'Croatia' where country_code = 'HR' and short_name = 'Hrvatska';
update public.country_settings set short_name = 'Slovenia' where country_code = 'SI' and short_name = 'Slovenija';
update public.country_settings set short_name = 'Finland' where country_code = 'FI' and short_name = 'Suomi';
update public.country_settings set short_name = 'Estonia' where country_code = 'EE' and short_name = 'Eesti';
update public.country_settings set short_name = 'Latvia' where country_code = 'LV' and short_name = 'Latvija';
update public.country_settings set short_name = 'Lithuania' where country_code = 'LT' and short_name = 'Lietuva';
update public.country_settings set short_name = 'Greece' where country_code = 'GR' and short_name = 'Ελλάδα';
update public.country_settings set short_name = 'Cyprus' where country_code = 'CY' and short_name = 'Κύπρος';
update public.country_settings set short_name = 'Bulgaria' where country_code = 'BG' and short_name = 'България';
commit;
```
