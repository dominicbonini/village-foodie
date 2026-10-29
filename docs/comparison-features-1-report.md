# comparison-features-1 — report

**29 October 2026.** Written for Dominic.

- Nothing was committed, pushed or deployed.
- No database change was run. Only the read-only queries in §9 were used.
- **No real Claude API call was made:** every proof uses fixtures.
- No `.env*` file was opened, no `outreach_templates` row was touched, and no live truck was used.

**Before starting, I stopped once.** The brief said a feature's words live in messages, but also that Admin's "Add feature"
form takes them at runtime, and the admin page can't write message files. You decided:
1. **(1A, per-locale):**
   - seeded features keep their words in messages;
   - an Admin-added feature stores its words per locale in `comparison_features.labels` / `explanations` (jsonb,
     `{"en-GB": …, "de-DE": …}`);
   - pages fall back from the visitor's locale to en-GB.
2. **(2A):** `payment_methods` moves to a new checked, hidden feature `paymethods`, with the text as its note.
3. **(3):** every feature starts checked.

**Nothing else arrived garbled or contradicted the brief.** As in earlier reports, **no "approved mockup" is in the repo**,
so the Feature list and the cost block follow the brief's words.

## 1 · HatchGrab's answers, confirmed from the code

The brief asked for ten answers to be confirmed in the code before use. A read-only code search did this, and I
re-checked the uncertain ones myself: ASAP, tips and the service fee, and that card is the only online payment method.

| Feature | The brief | What the code shows | Shown as |
|---|---|---|---|
| asap | ? | **Yes.** ASAP is the default choice on the order page, sent as no slot (`app/trucks/[slug]/order/page.tsx` ~1990) | Yes (hidden) |
| offline | ? | **Partly.** The iPad and Android app keeps a queue and snapshots; the web dashboard tells staff to switch to paper (`lib/native/outbox.ts`, `components/WebOfflineBanner.tsx`) | Partly, "in the iPad and Android app; not in the web dashboard" — **changed** |
| setup | none? | **None.** `plan_prices` has no set-up column, and no one-off charge exists | No |
| delivery | No, collection only | **No.** There is no delivery path, only "collection time" | No, "collection only" |
| qr | ? | **No, for seats.** A QR code opens the order page; there are no table numbers. The `qr_menu` switch is never checked | No, "a QR code opens the order page; no table numbers" (hidden) — **changed** |
| custfee | ? | **By country.** A service fee only where the country allows it and its Charges card shows (GB off; `lib/order-charge-rules.ts`) | from the country (`country:service_fee`) — **changed** |
| tips | ? | **By country.** Only where the Charges card shows: not in tax-inclusive countries such as GB and DE | from the country (`country:tips`) — **changed** |
| buzzers | "Yes, buzzers not supplied" | **Partly.** Staff record a buzzer number on each order by hand; HatchGrab never triggers a buzzer (`lib/buzzer.ts`) | Partly, "buzzer numbers recorded with each order; buzzers not supplied" — **changed** |
| private | ? | **Partly.** Private events have their own secret order link; customers can't send booking requests | Partly (hidden) — **changed** |
| deals | ? | **Yes, for meal deals and bundles** (`meal_deals` switch). Discount codes have no box on the order page | Labelled "Meal deals and bundles": Yes (hidden) |

**The others:**
- **From the plans:** pre-orders, capacity, ahead, walk-up, stock, WhatsApp and social posts come from the plan switches.
  WhatsApp and social posts say "from Pro".
- **Built in:** schedule, allergens, menu from a photo, options, staff and own web address.
- **Fixed answers:**
  - printed tickets: Yes, "in the iPad and Android app; printer not supplied";
  - several vans: Yes, "extra vans for an added monthly fee";
  - card only: local payments No ("cards only"), PayPal/Klarna No;
  - hardware No ("use your own"), card reader No, a certified till No.
- **The apps** come from the country's `country_settings` flags (and the `ipad_kds` switch).
- **Coming soon:** Instagram/Messenger and loyalty answer "Coming soon", never Yes.
- **Price and contract:** these come from the plan data.

**Copy and code disagree in one place (flag only, not changed).** The public /features table marks "Advanced reporting"
as coming soon (`lib/feature-table.ts:74`). In the code, `advanced_reporting` is on for every plan. The comparison list's
"Sales reports" (hidden) follows the code.

## 2 · What was built

**The data (§8, NOT RUN):**
- `public.comparison_features` — the master list, with each feature's key, group, order, Check tick, where it shows,
  HatchGrab's source, and the per-locale words for Admin-added features.
- `public.competitor_feature_values` — each competitor's answers:
  - value `yes` / `no` / `partial` / `unknown`, plus the note, quote, source URL, checked date and verification;
  - a `country_code` of null means every country; a country's own row wins there;
  - edits insert a new row and supersede the old one; there is at most one current row per competitor, feature and
    country.
- **20261048** moves the 12 old columns into answers, keeping verification. It then retires those columns and
  `country_benchmarks`' app columns (comments only).

**The shared rules** (`lib/comparison-features.ts`):
- the groups, scopes and values;
- `ourAnswer`, which reads HatchGrab's source;
- the country's answer first, else the every-country answer;
- verification per country;
- the mapping from the old columns to feature keys.

**The seed:** `data/comparison-features/features.json` lists the 45 features. The automatic importer loads it (new kind
`features`, `lib/data-import/features.ts`):
- **Only missing keys are added,** so Admin's choices survive a new version of the file.
- **Every feature it adds marks each active competitor due:** an `unknown` answer, and the next check date set to today.
- **Until the table is seeded,** pages and Admin read the shipped file (`lib/comparison-features-file.ts`).

**Admin › Pricing check:**
- **The "Feature list" tab:**
  - the features in groups, each with HatchGrab's badge (yes / no / partial / coming soon / to confirm, plus "by
    country" where it applies), the Check tick and Show on website (All / Some, with a country picker / Hidden);
  - "Add feature" asks for the key, group, and the label and explanation in English and German; a new feature starts
    checked and "to confirm", and marks competitors due;
  - the layout is the same on laptop and monitor, and stacks on a phone.
- **The country view's matrix:**
  - it shows every checked feature for the country, hidden ones too, in the same groups;
  - each competitor shows its value, note and source; a click saves a new answer;
  - "Mark verified" per competitor stamps its current answers for that country.
- **The comparison panel** uses the same matrix for the page's competitors. Its "Mark features verified" now passes the
  country.
- **App rows** read `country_settings`; the benchmark's app fields are gone from "Edit country data".
- **"Customer preview"** is now the cost block (§5).

**The checker:**
- the extractor gets every checked feature (key, label, explanation) and the competitor's current answer for each;
- the strict tool records one `feature` finding per feature: `feature_key`, value, note, quote and URL;
- a key not in the list is dropped;
- deep checks ask for every feature; routine checks ask only for changes, and for unknowns the site now states;
- in a country check, the answers are that country's;
- quote checks and the verifier are unchanged.

**Accepting a feature finding** writes a new answer row: unverified, with the quote and the page. The row is for the
country when it was read in a country check, otherwise for every country. Old pending findings (fields `pre_orders`,
`min_term` and so on) still accept onto their keys.

**The comparison page and its twins:**
- **The rows** are the shown features, with one `<tbody>` per group under a `<th scope="rowgroup" colspan>`.
- **Cell words** come only from the fixed set (Ja / Nein / Teilweise / Nicht angegeben; Yes / No / Partly / Not
  stated), plus the note. A "not stated" cell that has a note shows the note alone.
- **The .json** carries `value`, `label` (the word), `note`, `text`, `source` and `checked` for every cell, plus
  `explained`.
- **The .md** mirrors the table, with group heading rows and the notes.
- **New section:** "Begriffe erklärt" ("What the features mean").
- **Units:** every amount says its unit and period (pro Monat / pro Bestellung / pro Kartenzahlung / einmalig).
- **Public visibility:**
  - a competitor is public only when its entry, its plan and its stated answers for the shown features are verified;
  - an `unknown` placeholder needs no verification, because "not stated" is true;
  - there is still no Product, Review or Rating markup.

**"iPhone and iPad app" is now "iPad app" everywhere.** No "iPhone and iPad" is left in the code or the comparison
messages.

## 3 · Files changed

| File | What |
|---|---|
| `supabase/migrations/20261047_comparison_features_1.sql` (new) | the two tables — NOT RUN |
| `supabase/migrations/20261048_comparison_features_data.sql` (new) | the data move and the retired columns — NOT RUN |
| `data/comparison-features/features.json` (new) | the 45 features |
| `lib/comparison-features.ts` (new) | the master list's rules, `ourAnswer`, answers, `countryCharges` |
| `lib/comparison-features-file.ts` (new) | the shipped list until seeded |
| `lib/cost-block.ts` (new), `components/comparison/CostBlock.tsx` (new) | the cost block |
| `lib/admin/feature-actions.ts` (new) | `feature_update` / `feature_add` / `feature_value` / verify per country / `writeAnswer` |
| `lib/data-import/features.ts` (new); `importer.ts`, `research.ts`, `store-supabase.ts` | the `features` kind; research answers go to the new table |
| `lib/comparison.ts`, `lib/comparison-server.ts`, `app/[country]/[section]/[slug]/page.tsx`, `comparison.css` | the rows, groups, words, units, "Begriffe erklärt" |
| `lib/pricing-check.ts` | retired fields removed; `CountryRow` app flags and charges |
| `lib/admin/pricing-check-actions.ts`, `pricing-check-store.ts` | feature store methods; old column actions removed |
| `app/api/admin/pricing-check/route.ts` | features (English), answers, country flags and charges |
| `components/admin/PricingCheckTab.tsx` | Feature list, matrix, cost-block preview, CSV and country form without retired fields |
| `lib/competitor-check/model.ts`, `prompts.ts`, `checker.ts`, `store-supabase.ts` | one `feature` field, the list in the message, answers |
| `lib/admin/competitor-check-actions.ts`, `app/api/admin/competitor-check/route.ts`, `components/admin/AutomaticChecks.tsx` | accept into answers; feature labels |
| `messages/en-GB.json`, `messages/de-DE.json` (+ `ns/`), `docs/i18n/back/de-DE.json` | features, groups, cell words, "Begriffe erklärt", the cost block |
| `scripts/pricing-check-1.cjs`, `compare-de-1.cjs`, `competitor-check-1.cjs` (+ both fixture modules) | extended and re-pinned |
| `scripts/comparison-features-1-screens.cjs` (new), `compare-de-1-screens.cjs`, `harnesses.json` | screenshots; registered as needing a browser |

## 4 · Harness results

| Run | Result |
|---|---|
| `npx tsc --noEmit -p .` | clean |
| `npx eslint` on every changed source file | clean |
| `node scripts/pricing-check-1.cjs` | **82 passed, 0 failed** (55 before) |
| `node scripts/compare-de-1.cjs` | **93 passed, 0 failed** (77 before) |
| `node scripts/competitor-check-1.cjs` | **153 passed, 0 failed** (135 before) |
| `node scripts/comparison-features-1-screens.cjs` | **4 passed, 0 failed** |
| `node scripts/compare-de-1-screens.cjs --comparison-features` | **6 passed, 0 failed** |
| `node scripts/translation-check.cjs --locale de-DE` | **Structural: 0** |

**What the new tests prove:**
- **The feature list imports correctly:**
  - all 45 are added once;
  - a rerun of the same file is a no-op;
  - a changed file adds only the new key and keeps Admin's untick;
  - a bad file writes nothing.
- **Features show where they should:** scope `some` shows a feature only in its countries (PayPal and the till in DE;
  local payments in PL; the discovery map in GB), and the 13 hidden features are checked but never shown.
- **HatchGrab's answers come from their sources:** a plan switch ("from Pro"), built in, the country's app flag (on →
  Yes, off → "Nein, nicht in Deutschland"), plan data, fixed text, coming soon, and the country's charges.
- **A new checked feature, or a feature switched to checked, marks every active competitor `unknown` and due.**
- **The old columns' values arrive in answers with their verification:** the SQL maps all 12, and the research import
  writes answers, never the retired columns.
- **Answers follow the history rule:**
  - an answer is a new row and the old one is superseded;
  - a country's own answer wins there;
  - "Mark features verified" stamps that country's and the every-country rows, and not another country's.
- **The page's words:** cell words come only from the fixed set, and every amount on the page, in the .md and in the
  .json has its unit and period.
- **The page's structure:** the six row-group headings, "Begriffe erklärt" (30 entries), and the .json's machine value,
  word, note, source and date on all 60 cells.
- **HatchGrab's "Nein" rows show** like any other row.
- **Verification hides correctly:** one unverified stated answer hides a competitor publicly; an `unknown` placeholder
  does not.
- **The checker:** the extractor gets the checked features and current answers; old and new findings accept into answer
  rows, country-specific in a country check; an off-list key is dropped.
- **The cost block:** fee plus card fees equals the total to the unit; a customer-paid fee never enters a bar; the
  summary is "cheapest" or "not cheapest" from data.
- **App rows follow `country_settings`.** "iPad app" is used everywhere.

**Re-pinned, each with a dated note (29 Oct 2026):**
- the old key-feature cells and `set_feature` → the new sources and answer actions;
- 14 table rows → 30;
- "Ab Pro" → "Ja, ab Pro";
- "Nicht in Deutschland" → "Nein, nicht in Deutschland";
- the import test → answers;
- the checker fixtures → one `feature` field.

**Not run (outside "affected harnesses only"):**
- the full sweep;
- `messages-parity` and the other harnesses that read messages;
- the Chromium shots and the other screenshot modes.

## 5 · The cost block

The cost block is built as one component (`components/comparison/CostBlock.tsx`, with numbers and sentences from
`lib/cost-block.ts`). It is shown **only** in Admin › Pricing check › Customer preview, in German for DE and AT and in
English elsewhere, and on no public page.

**What it shows:**
- **Size buttons:** online sales a month (orders × the country's order value), with "about N orders" underneath.
- **The lead,** as written in the brief.
- **Each verified tool's bar,** split into Softwaregebühr / Kartengebühren with a legend. Both amounts sit under the bar,
  with "… pro Monat inklusive Kartengebühren" and the share of sales.
  - An assumed card rate says "(Satz nicht veröffentlicht, angenommen)".
  - A customer-paid fee is a separate note on the row.
- **The summary from data.** In the fixture it reads "…ist damit höher als 56 € pro Monat bei Liefersoft…", which is
  correct for those figures.
- **The footnote:** the order value and how it is derived, our Stripe rate, who is assumed, the checked date, and the
  calculator link.

## 6 · Extra checker cost

These figures use fixture token counts × the settings' prices, computed in `competitor-check-1` §16. The real routine cost
has measured about 20% over estimates.

- **The list of 45 features** adds about 1,100 input tokens to every extractor turn.
- **Deep check:** about **+$0.93 a competitor**. That is the list over about 4 turns, about 45 more findings, and about 27
  quoted answers second-checked, each a verifier call at about $0.03.
- **Routine check:** about **+$0.08 a competitor**. That is the list over about 2 turns, about 8 changes, and about 2
  second checks.
- **One-off effect:** the first seed marks every active competitor due (about 130). The routine quota of about 4 a day
  works through them over about a month. The daily and monthly caps apply as before.

**The second check is the biggest cost.** To lower it, give the verifier `claude-haiku-5-5` in Settings: the earlier
estimate showed that cuts a deep check from $0.72 to $0.25.

## 7 · Screenshots (WebKit, fixture data)

- **Feature list:** `docs/comparison-features-1/webkit-features-1512.png`, `docs/comparison-features-1/webkit-features-390.png`
- **German page, admin view:** `docs/comparison-features-1/webkit-page-admin-1512.png`, `docs/comparison-features-1/webkit-page-admin-390.png`
- **Customer preview cost block:** `docs/comparison-features-1/webkit-cost-block-1512.png`, `docs/comparison-features-1/webkit-cost-block-390.png`

## 8 · NOT RUN SQL, in order

**1 · `supabase/migrations/20261047_comparison_features_1.sql`**

```sql
begin;
create table if not exists public.comparison_features (
  key              text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  group_key        text not null check (group_key in ('ordering', 'payments', 'kitchen', 'marketing', 'apps_hardware', 'price_contract')),
  sort_order       integer not null default 0,
  checked          boolean not null default true,
  show_scope       text not null default 'all' check (show_scope in ('all', 'some', 'hidden')),
  show_countries   text[] not null default '{}' check (array_to_string(show_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  hatchgrab_source text not null default 'confirm' check (length(btrim(hatchgrab_source)) between 1 and 200),
  labels           jsonb not null default '{}'::jsonb check (jsonb_typeof(labels) = 'object'),
  explanations     jsonb not null default '{}'::jsonb check (jsonb_typeof(explanations) = 'object'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);
create index if not exists comparison_features_group_idx on public.comparison_features (group_key, sort_order);
create table if not exists public.competitor_feature_values (
  id            uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  feature_key   text not null check (feature_key ~ '^[a-z][a-z0-9_]{1,30}$'),
  country_code  text check (country_code ~ '^[A-Z]{2}$'),
  value         text not null default 'unknown' check (value in ('yes', 'no', 'partial', 'unknown')),
  note          text check (note is null or length(note) <= 300),
  quote         text check (quote is null or length(quote) <= 2000),
  source_url    text check (source_url is null or source_url ~* '^https?://'),
  checked_on    date,
  verified_at   timestamptz,
  verified_by   uuid,
  superseded_at timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists competitor_feature_values_current
  on public.competitor_feature_values (competitor_id, feature_key, coalesce(country_code, '')) where superseded_at is null;
create index if not exists competitor_feature_values_competitor_idx on public.competitor_feature_values (competitor_id) where superseded_at is null;
alter table public.comparison_features       enable row level security;
alter table public.competitor_feature_values enable row level security;
revoke all on table public.comparison_features       from anon, authenticated, public;
revoke all on table public.competitor_feature_values from anon, authenticated, public;
comment on table public.comparison_features is 'comparison-features-1: the master list of compared features (checked by the checker, shown on websites by choice). Service role only.';
comment on table public.competitor_feature_values is 'comparison-features-1: each competitor''s answer per feature, with note, quote, source and verification; history kept by superseded_at. Service role only.';
commit;
```

**2 · `supabase/migrations/20261048_comparison_features_data.sql`** (the data move and the retired columns)

```sql
begin;
create temporary table legacy_feature_values on commit drop as
select c.id as competitor_id, m.feature_key, m.value, nullif(left(btrim(coalesce(m.note, '')), 300), '') as note,
       c.features_checked_on as checked_on, c.features_verified_at as verified_at
from public.competitors c
cross join lateral (values
  ('preorder',   c.pre_orders,              null::text),
  ('whatsapp',   c.whatsapp,                null),
  ('social',     c.social_posts,            null),
  ('domain',     c.own_domain,              null),
  ('ipad',       c.ios_app,                 null),
  ('android',    c.android_app,             null),
  ('capacity',   c.capacity_slots,          null),
  ('schedule',   c.multi_location_schedule, null),
  ('kds',        c.kds,                     null),
  ('payattruck', c.pay_at_truck,            null),
  ('paymethods', 'unknown',                 c.payment_methods),
  ('term',       'unknown',                 c.min_term)
) as m(feature_key, value, note)
where m.value in ('yes', 'no') or nullif(btrim(coalesce(m.note, '')), '') is not null;

update public.competitor_feature_values v set superseded_at = now()
from legacy_feature_values l
where v.competitor_id = l.competitor_id and v.feature_key = l.feature_key and v.country_code is null and v.superseded_at is null
  and v.value = 'unknown' and v.note is null and v.quote is null and v.source_url is null;

insert into public.competitor_feature_values (competitor_id, feature_key, country_code, value, note, checked_on, verified_at)
select l.competitor_id, l.feature_key, null, l.value, l.note, l.checked_on, l.verified_at
from legacy_feature_values l
where not exists (
  select 1 from public.competitor_feature_values v
  where v.competitor_id = l.competitor_id and v.feature_key = l.feature_key and v.country_code is null and v.superseded_at is null
);

comment on column public.competitors.pre_orders              is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (preorder). No code reads it.';
comment on column public.competitors.whatsapp                is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (whatsapp). No code reads it.';
comment on column public.competitors.social_posts            is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (social). No code reads it.';
comment on column public.competitors.own_domain              is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (domain). No code reads it.';
comment on column public.competitors.ios_app                 is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (ipad). No code reads it.';
comment on column public.competitors.android_app             is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (android). No code reads it.';
comment on column public.competitors.capacity_slots          is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (capacity). No code reads it.';
comment on column public.competitors.multi_location_schedule is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (schedule). No code reads it.';
comment on column public.competitors.kds                     is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (kds). No code reads it.';
comment on column public.competitors.pay_at_truck            is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (payattruck). No code reads it.';
comment on column public.competitors.payment_methods         is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (paymethods, as the note). No code reads it.';
comment on column public.competitors.min_term                is 'RETIRED 29 Oct 2026 (comparison-features-1): moved to competitor_feature_values (term, as the note). No code reads it.';
comment on column public.country_benchmarks.ios_app_available     is 'RETIRED 29 Oct 2026 (comparison-features-1): the pricing check reads country_settings.ios_app_available, as the comparison page does.';
comment on column public.country_benchmarks.android_app_available is 'RETIRED 29 Oct 2026 (comparison-features-1): the pricing check reads country_settings.android_app_available, as the comparison page does.';
commit;
```

20261046 (global-players-1) and 20261045 are separate and still stand as before. 20261045 has already been run.

**Update, 29 Oct 2026 (after Dominic ran 20261048):**
- **What happened:** a run returned "relation legacy_feature_values does not exist". Read-only checks show the move had
  already completed in full:
  - 219 answers created at 14:41 UTC, exactly the 219 the old columns hold;
  - none missing, no duplicates, none superseded;
  - every retired-column comment set.
- **The cause:** the Supabase SQL editor does not keep a temporary table between statements.
- **The fix:** the file now uses a CTE in each statement instead, so a re-run works and changes nothing. Nothing needs
  re-running.

## 9 · Read-only SQL that was run

```sql
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='competitors' and column_name in ('features_verified_at','features_verified_by','features_checked_on','website','id') order by 1;
```
```sql
select count(*) as competitors, count(*) filter (where pre_orders <> 'unknown' or whatsapp <> 'unknown' or social_posts <> 'unknown' or own_domain <> 'unknown' or ios_app <> 'unknown' or android_app <> 'unknown' or capacity_slots <> 'unknown' or multi_location_schedule <> 'unknown' or kds <> 'unknown' or pay_at_truck <> 'unknown' or payment_methods is not null or min_term is not null) as with_any_value, count(*) filter (where features_verified_at is not null) as features_verified, (select count(*) from public.data_imports) as imports, (select string_agg(file_path || ':' || result, ', ') from public.data_imports) as import_rows, (select column_name from information_schema.columns where table_schema='public' and table_name='country_benchmarks' and column_name='ios_app_available') as bench_ios_col from public.competitors;
```

**What they showed:**
- 202 competitors; 110 have a value in some old feature column; none is features-verified.
- `data_imports` exists with no rows, so nothing has been imported yet.
- There is no `features_verified_by` column, so moved answers carry `verified_at` only.

## 10 · Limits to know

- **Verifying for one country also verifies the every-country rows.** "Mark features verified" for a country stamps that
  competitor's every-country answers too. Those are the same fact everywhere, so that country's check verifies them for
  all countries.
- **Features are answered per competitor, with optional per-country rows.** The routine check writes every-country
  answers; only a country check writes a country's own.
- **Routine checks now report changes only,** as the brief asks, so fewer "unchanged" confirmations will appear for
  review.
- **Other languages fall back to English.** The comparison namespace exists only in en-GB and de-DE. Another country's
  page would need its messages through the normal translation pipeline; an Admin-added feature falls back to en-GB.
- **The Feature list's badge for a country-dependent feature** (the apps, tips, the service fee) is computed for GB and
  marked "by country". The country matrix shows each country's true answer.
- **The Customer preview's language** is German for DE and AT and English elsewhere, because only those two have the
  words.

## 11 · What you do

1. **Run the SQL in order:** `20261047_comparison_features_1.sql`, then `20261048_comparison_features_data.sql`. The order
   is safe either way round with the importer.
2. **Deploy.**
3. **Wait for the next workflow run, or press Run workflow.** Its first step imports
   `data/comparison-features/features.json`. Admin › Pricing check should show "Comparison feature list imported <date>:
   45 features (45 added) — competitors marked due".
4. **Check the Feature list tab:** untick or hide anything you don't want checked or shown. For an Admin-added feature,
   HatchGrab's answer starts as "to confirm".
5. **Optional:** set the second-check model to `claude-haiku-5-5` before the next deep pass (§6).

## Undo (only if Dominic asks)

```sql
-- Reverses 20261048 and 20261047. The old columns were never dropped, so they still hold their values.
begin;
comment on column public.competitors.pre_orders is null; comment on column public.competitors.whatsapp is null;
comment on column public.competitors.social_posts is null; comment on column public.competitors.own_domain is null;
comment on column public.competitors.ios_app is null; comment on column public.competitors.android_app is null;
comment on column public.competitors.capacity_slots is null; comment on column public.competitors.multi_location_schedule is null;
comment on column public.competitors.kds is null; comment on column public.competitors.pay_at_truck is null;
comment on column public.competitors.payment_methods is null; comment on column public.competitors.min_term is null;
comment on column public.country_benchmarks.ios_app_available is null; comment on column public.country_benchmarks.android_app_available is null;
drop table if exists public.competitor_feature_values;
drop table if exists public.comparison_features;
delete from public.data_imports where file_path = 'data/comparison-features/features.json';
commit;
```

This report is docs/comparison-features-1-report.md.
