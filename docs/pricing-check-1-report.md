# pricing-check-1: Admin › Pricing check

**Date:** 23 October 2026 · **Branch:** `main` (uncommitted, on top of `3b49cc7e`) · nothing pushed or deployed ·
**no database change**: the migration is NOT RUN SQL (§4) · only read-only SQL was run (§10) · no `.env*` file opened ·
`outreach_templates` not touched · no live truck used · no dev server started. The production build's temporary check
was `next build` only; the screenshots use a tiny local static server with fixture data.

## 0 · ⚠️ Read first

1. **The prompt arrived intact, but two of its instructions contradict each other, so one step is waiting for you.**
   - "Register the harness in `scripts/harnesses.json`" collides with "don't touch files with uncommitted changes you
     didn't make". That file already carries another agent's uncommitted edit (`_real-fonts.cjs`,
     `europe-languages-2-fonts.cjs`).
   - I didn't choose between them: **the file is untouched**.
   - The full sweep ran from a copy of the registry with `pricing-check-1.cjs` added (§8). Registering it for real is
     three lines, listed in §8, for when you decide.
2. **Every country row is now switched ON** (35 rows, read-only, 23 Oct; §10). France still has no row.
   - So the research report's §10.1 price SQL, which only touches switched-off rows, would now change nothing.
   - The tab has a **Switched off** group, and it is empty today.
3. **One column added that the brief didn't list:** `country_benchmarks.notes`. Two of the brief's own fixes need a
   note to live somewhere ("not Numbeo — check", "Stripe takes no cards in Indonesia"), and the benchmark table had no
   notes column. Everything else matches the brief column for column.
4. **Three reading choices, flagged:**
   - **"Not possible"** is shown when the limit is **zero or below**, not only below zero. GB small without customer
     fees comes out at exactly £0.00: Beat The Queue's card rate equals ours, so no price above £0 can win, and the
     brief expects "Not possible" there.
   - **The country pill** reads the medium size: **Cheapest**, **Small only** (not cheapest at medium, cheapest at
     small) or **Not cheapest**. I added two grey pills, **No rivals** (no counted rival under the filters) and
     **No data** (no benchmark). Otherwise a country with nothing to compare would read "Cheapest".
   - **The route's admin check:** it calls `adminUser`, which is what `verifyAdmin` itself is
     (`verifyAdmin = adminUser(req) !== null`). It needs the admin's id to record who pressed Mark verified.
     A non-admin gets a 404, as on Admin › Countries.
5. **The admin tab bar is wider:** `max-w-5xl` → `max-w-6xl`, the body wrapper's width. With a ninth tab, "Pricing
   check" was cut off at 1512px and had to be scrolled to.

## 1 · Summary

- **New tab, Admin › Pricing check** (`components/admin/PricingCheckTab.tsx`):
  - a country list (Live / Switched off / Planned, search, a pill per country);
  - the country header with four tiles;
  - the size switch with three filters, the verdict and "What {plan} price would win" (three cards);
  - the monthly-cost table with data badges, Mark verified, Edit and History;
  - the key-features table;
  - Admin view / Customer preview, Export CSV, Add competitor, Edit country data.
- **The engine** is `lib/pricing-check.ts`: pure, client-safe, and it **names no plan**. It reproduces the research
  report's totals:

  | Check | Expected | Result |
  |---|---|---|
  | GB medium: our Unlimited / Aphelios / Order Tiger | 376 / 337 / 366 | 376 / 337 / 366 |
  | IE busy: our Unlimited / Order Tiger | 1,349 / 1,339 | 1,349 / 1,339 |
  | NZ medium: HungryTrucks | 743 | 743 |
  | GB medium suggestions (food-truck only, customer fees counted) | £29 / £39 / £59 | £29 / £39 / £59 |

- **The data:** a one-time **Import research data** button loads `data/pricing-research-1/*.json`, built by
  `scripts/pricing-check-build-data.cjs` from the CSV and the report:
  - 128 competitors, 242 plans (200 counted) and 46 country benchmarks;
  - every fix in the brief applied;
  - what the schema can't hold is listed in §6.
- **The proof:**

  | Check | Result |
  |---|---|
  | Harness `pricing-check-1` | **55/55** |
  | Screenshot run | **52/52** checks; 14 PNGs (WebKit and Chromium, 1512 and 390, fixture data only) |
  | Full sweep | SWEEP_RESULT |
  | tsc | clean |
  | New files | lint clean |
  | `app/admin/page.tsx` | same 13 lint problems as at HEAD |
  | `next build` | passes |

## 2 · STEP 0: what each check found

| | Check | Finding |
|---|---|---|
| a | `country_settings.competitor_name / _pct / _fixed_minor` | **No code reads them.** `lib/country-settings.ts:34` says "NOT read: retired 10 October 2026", and `COUNTRY_SETTINGS_COLUMNS` doesn't select them. The only mentions are harness fixtures (`scripts/anz-1.cjs`, `_country-settings-gb.cjs`, `_native-prices-fixtures.cjs`, two JSON fixtures). Left alone. |
| b | The CSV | **232 rows × 37 columns** (see the list below). |
| c | How a tab is added; how `/api/admin` authorises | `app/admin/page.tsx` has one `ADMIN_TABS` object; the `?tab=` validator reads it, and each tab is mounted at its render site. Countries is mounted on its first visit and then hidden. Wide tabs (Outreach, Events) render outside the `max-w-6xl` wrapper in a `max-w-[1800px]` box. Admin routes call `adminUser` / `verifyAdmin` (`lib/auth/admin.ts`). `POST /api/admin` has a truck-field allowlist; Countries keeps column names server-side in `lib/admin/country-actions.ts`, with a store interface the harness fakes. **Copied all of it**: the tab is mounted on its first visit, then hidden, in the 1800px box. `lib/admin/pricing-check-actions.ts` + `-store.ts` + one route. |
| d | A native price-point rounding helper | **None.** native-prices changed how prices are *written*; `lib/currencies.ts` `homeDisplay` is display only. So the brief's fallback is used: round **down** to a number ending in 9 at the price's scale — 9…99; 149, 199… above 100; 1 490, 1 990… above 1,000 — and the same pattern a power of ten up each time (14 900…, 149 000…). |
| e | Plan switches for the key features | **Own web address has no `plan_features` switch and no `Feature` key**: custom domains aren't plan-gated, so it's on every plan ("Yes"). WhatsApp is `whatsapp_replies`, and social media posts are `schedule_graphics`. Both are off on Pay as you go live, so they read "Pro & Unlimited", from the data. Pre-orders = `advance_preordering` + `time_slot_selection`. The apps = `ipad_kds`. |
| f | Where the apps are sold | The manual records the **Android app on Google Play in the United Kingdom only**: "Availability is the United Kingdom only, deliberately" (V11.54, 1 Sep 2026; §36). It shipped 5 Sep. **Where the iPhone app is sold is not recorded.** The benchmarks say Android = GB yes, everywhere else no; iPhone = unknown everywhere. No store setting touched. |
| g | Highest migration | `20261038_europe_language_short_names_2.sql` (later than the manual's `20261036`), so this one is **`20261039_pricing_check.sql`**. |

**The CSV's columns:**
- `country`, `tier`, `name`, `url`, `checked`, `focus`, `plan`, `price_hidden`, `monthly_price_local`,
  `annual_price_local_per_month`, `currency`, `vat`, `pct_fee_per_order`, `fixed_fee_per_order_local`,
  `fee_paid_by`, `included_orders_or_volume`, `card_processing`, `card_pct`, `card_fixed_local`, `card_note`,
  `setup_fee_local`, `hardware`, `contract`, `free_trial`;
- ten `feature_*` columns (online pre-order and collection times, pay at truck, KDS, printed tickets,
  schedule/map, menu photo import, allergens, WhatsApp, custom domain, multi-truck);
- `counted_in_comparison`, `notes`, `research_file`.

**STEP 4 fields per row:** every one of them, except that features are per plan row and sometimes worded in prose
("yes (scheduled orders)").

## 3 · Files

**New:**
- `supabase/migrations/20261039_pricing_check.sql`: the three tables. NOT RUN (§4).
- `scripts/pricing-check-build-data.cjs`, which writes `data/pricing-research-1/competitors.json`, `plans.json` and
  `benchmarks.json` (committed with this work).
- `lib/pricing-check.ts`: the engine, the price-point rule, our plans (live, or proposed placed by shape), the
  key-feature cells.
- `lib/admin/pricing-check-actions.ts`: import, verify / unverify, edit plan (insert + supersede), edit country data
  (supersede + insert), set feature, add competitor. Allowlists and plain-sentence refusals.
- `lib/admin/pricing-check-store.ts`: service role. Every supersede is conditional on `superseded_at is null`. A
  missing table is reported as "run the migration".
- `app/api/admin/pricing-check/route.ts`: GET and POST, admin-only, a 404 for anyone else.
- `components/admin/PricingCheckTab.tsx`: the tab.
- `scripts/pricing-check-1.cjs`: the harness.
- `scripts/pricing-check-screenshots.cjs`: by hand. It needs a build and both browsers.
- `docs/pricing-check-1/*.png` (14) and `shots.json`.

**Changed:**
- `app/admin/page.tsx`:
  - the tab entry, its import, and "mounted on the first visit, then hidden";
  - the wide render block;
  - the body wrapper is hidden on this tab;
  - the tab bar is `max-w-6xl`.
- `scripts/countries-screenshots.cjs`: one check re-pinned, "Countries comes just before Pricing check, the last tab".
  Marked `⚠️ RE-PINNED (pricing-check-1)`.
  - **Not run:** it overwrites committed PNGs in `docs/screenshots/`.
  - Its row-order check was already stale before this work: it still expects the six retired plan-price rows.

**Not changed:** `scripts/harnesses.json` (§0.1), and every file another agent has uncommitted changes in.

## 4 · The migration — ⛔ NOT RUN ("run now": nothing reads these tables until the tab is deployed)

- **Security** mirrors `country_settings`: RLS on, no policies, everything revoked from `anon`, `authenticated` and
  `public`.
- **`competitor_plans.country_code`** has no foreign key, because planned countries have no row.
- **Partial unique index:** at most one current benchmark per country.
- **Name uniqueness:** a case-insensitive unique index on `lower(btrim(name))`.
- **Counted plans need a price:** a CHECK refuses a counted plan without one.

```sql
-- supabase/migrations/20261039_pricing_check.sql — the full file is in the repo; this is it.
begin;

create table public.competitors (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (length(btrim(name)) > 0),
  website              text,
  focus                text check (focus in ('food_truck', 'street_food_markets', 'nearest_local', 'pop_up')),
  payment_providers    text,
  pre_orders           text not null default 'unknown' check (pre_orders   in ('yes', 'no', 'unknown')),
  whatsapp             text not null default 'unknown' check (whatsapp     in ('yes', 'no', 'unknown')),
  social_posts         text not null default 'unknown' check (social_posts in ('yes', 'no', 'unknown')),
  own_domain           text not null default 'unknown' check (own_domain   in ('yes', 'no', 'unknown')),
  ios_app              text not null default 'unknown' check (ios_app      in ('yes', 'no', 'unknown')),
  android_app          text not null default 'unknown' check (android_app  in ('yes', 'no', 'unknown')),
  features_checked_on  date,
  features_verified_at timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index competitors_name_ci_key on public.competitors (lower(btrim(name)));

create table public.competitor_plans (
  id                       uuid primary key default gen_random_uuid(),
  competitor_id            uuid not null references public.competitors (id) on delete restrict,
  country_code             text not null check (country_code ~ '^[A-Z]{2}$'),
  plan_name                text not null,
  currency                 char(3) not null check (currency ~ '^[A-Z]{3}$'),
  price_hidden             boolean not null default false,
  monthly_minor            integer check (monthly_minor >= 0),
  yearly_only              boolean not null default false,
  setup_minor              integer not null default 0 check (setup_minor >= 0),
  truck_fee_bps            integer not null default 0 check (truck_fee_bps >= 0),
  truck_fee_fixed_minor    integer not null default 0 check (truck_fee_fixed_minor >= 0),
  customer_fee_bps         integer not null default 0 check (customer_fee_bps >= 0),
  customer_fee_fixed_minor integer not null default 0 check (customer_fee_fixed_minor >= 0),
  card_mode                text not null default 'unknown' check (card_mode in ('bundled', 'separate', 'unknown')),
  card_bps                 integer check (card_bps >= 0),
  card_fixed_minor         integer check (card_fixed_minor >= 0),
  card_rate_assumed        boolean not null default false,
  order_cap                integer check (order_cap > 0),
  included_orders          integer check (included_orders >= 0),
  overage_fixed_minor      integer check (overage_fixed_minor >= 0),
  vat                      text not null default 'unknown' check (vat in ('incl', 'excl', 'unknown')),
  status                   text not null default 'counted' check (status in ('counted', 'hidden', 'closed', 'excluded')),
  unclear                  boolean not null default false,
  second_hand              boolean not null default false,
  source                   text not null check (source in ('research', 'manual', 'admin')),
  source_url               text,
  checked_on               date not null,
  verified_at              timestamptz,
  verified_by              uuid,
  notes                    text,
  superseded_at            timestamptz,
  created_at               timestamptz not null default now(),
  constraint competitor_plans_counted_has_price check (status <> 'counted' or monthly_minor is not null)
);
create index competitor_plans_current_idx on public.competitor_plans (country_code) where superseded_at is null;
create index competitor_plans_competitor_idx on public.competitor_plans (competitor_id);

create table public.country_benchmarks (
  id                         uuid primary key default gen_random_uuid(),
  country_code               text not null check (country_code ~ '^[A-Z]{2}$'),
  currency                   char(3) not null check (currency ~ '^[A-Z]{3}$'),
  meal_minor                 integer not null check (meal_minor > 0),
  meal_source_label          text,
  meal_source_url            text,
  meal_source_ok             boolean not null default true,
  order_multiplier           numeric not null default 1.3 check (order_multiplier > 0),
  eur_rate                   numeric not null check (eur_rate > 0),
  eur_rate_date              date not null,
  card_bps                   integer check (card_bps >= 0),
  card_fixed_minor           integer check (card_fixed_minor >= 0),
  planned_pro_minor          integer check (planned_pro_minor >= 0),
  planned_pro_included_minor integer check (planned_pro_included_minor >= 0),
  planned_unlimited_minor    integer check (planned_unlimited_minor >= 0),
  ios_app_available          boolean,
  android_app_available      boolean,
  notes                      text,
  checked_on                 date not null,
  superseded_at              timestamptz,
  created_at                 timestamptz not null default now()
);
create unique index country_benchmarks_one_current on public.country_benchmarks (country_code) where superseded_at is null;

alter table public.competitors        enable row level security;
alter table public.competitor_plans   enable row level security;
alter table public.country_benchmarks enable row level security;

revoke all on table public.competitors        from anon, authenticated, public;
revoke all on table public.competitor_plans   from anon, authenticated, public;
revoke all on table public.country_benchmarks from anon, authenticated, public;

comment on table public.competitors        is 'pricing-check-1: competitor tools and their six key features. Admin only (service role).';
comment on table public.competitor_plans   is 'pricing-check-1: one competitor plan in one country. Never updated in place: an edit inserts a new row and stamps superseded_at on the old.';
comment on table public.country_benchmarks is 'pricing-check-1: a country''s meal price, exchange rate and (planned countries) proposed prices. At most one current row per country.';

commit;
```

**After running it:** open Admin › Pricing check and press **Import research data**. It can run only once: it refuses
once any `source = 'research'` row exists, and the button shows only while all three tables are empty. **No SQL to
paste for the data.**

## 5 · How it works

- **Our side:**
  - the country's live `plan_prices` for every public plan, read through `lib/plans.ts`;
  - our online card rate from `country_settings`;
  - the cheapest plan's total = monthly + `fee_bps` above the included amount + card processing.
- **A planned country** (no rows: the ten planned ones, and France):
  - its benchmark's **proposed** Pro / included / Unlimited are placed **by the shape of the live rows**:
    - the public plan whose included amount is always positive takes the Pro figures;
    - the one that is always unlimited takes the Unlimited figure;
    - a plan that is free with nothing included in every row stays free;
  - each keeps the fee the live rows agree on;
  - **no plan key or price is written in code**: the harness greps the engine for plan keys and the GB/US figures.
  - **France:** its benchmark carries france-1 block B's €29 / €4,000 / €69 and 1.5% + 25, as the research did. The
    brief listed ten planned countries; France had no row either.
  - **Shown everywhere as "proposed, not live".**
- **A rival:**
  - monthly (or the yearly-only per-month price) + setup ÷ 12 + the fees the truck pays;
  - + card processing: their bundled or stated rate, else ours, marked **Card rate assumed**;
  - + overage above their included orders;
  - a plan with an order cap below the size isn't counted;
  - customer-paid fees are shown under the total, and added to the comparison only while **Count fees customers pay**
    is ticked;
  - another currency is converted through the euro, using the benchmarks' ECB rates (22 Oct 2026).
- **What price would win:**
  - for our plan that is cheapest at the size: limit = the cheapest counted rival × 1.00 / 1.05 / 1.10 − our card
    cost − that plan's fee above its included amount;
  - then the nearest price point at or below it (§2 d);
  - "Already met" if today's price fits; "Not possible" if the limit is ≤ 0;
  - a warning when the suggestion is at or below a cheaper paid plan, e.g. "⚠ At or below Pro (£29)".
- **SQL for a suggestion:** for a live country the cards come with an optional "SQL for these prices (not run)"
  block: `update public.plan_prices … where … monthly_minor = <today's>`. Nothing is run from the page, and it says
  "Nothing changes until you run the SQL".
- **History:** Edit inserts a new row (source `admin`, unverified, checked today) and supersedes the old; History
  lists the versions.
  - The schema keeps no link between versions, so History shows every version of that competitor's plans in that
    country.
  - Edit country data supersedes, then inserts. If the insert fails, the old row is restored.
- **Stale:** `checked_on` older than six months.

## 6 · The research data: built, fixed, and what could not be mapped

**Built:**
- 124 competitors from the CSV + 4 from the manual = **128**;
- 232 plans from the CSV + 10 from the manual = **242**: 200 counted, 35 hidden, 5 closed (GloriaFood, in five
  countries), 2 excluded (Spot, FoodTruck POS's founder price);
- **46 benchmarks**.

**The brief's fixes, all applied:**
- **IE and PT meal sources:**
  - `meal_source_ok = false`, label "Cited as Numbeo — not Numbeo, check", note "not Numbeo — check".
  - The cause is in the research report: a gap-filling pass replaced their source links, and the report kept printing
    the "Numbeo" label. The **figures** (€20 and €12) are Numbeo's.
- **France:** one benchmark row.
- **Indonesia:** card rate NULL, note "Stripe takes no cards in Indonesia".
- **`card_rate_assumed`:** set on every plan with no published card rate. This was cross-checked against every ¹ in
  the report, and none disagreed.
- **`second_hand`** (Simpliza, Anota AI, funfo Pro, どこでも注文くん, Truckster, Cheerfy, VGather, MOBI) and
  **`unclear`** (Weevi, Zyda, Vev, Yoveletta, Beat The Queue, TuMenúDigital).
- **Not-counted rows** keep their status, with the reason in `notes`.
- **From the manual §21** (source `manual`, checked 2026-10-20, "From the manual (§21), not re-checked"):
  - **Hatches Up:** 4.5% + 20p, card included.
  - **Eventifood:** six plans (1% / 2% / 3% per order, £30 / £60 / £75 a month), all marked unclear, because the
    manual doesn't say which goes with which. Card rate assumed.
  - **EasyEats:** 0.95% of card sales, or $90 a month billed yearly. Card rate assumed.
  - **RapidOrderz:** $59, second-hand.
- **Planned countries:** the §10.3 proposals; the card rate from each section.
- **Competitor names merged:** "MENU TIGER (global)" / "MenuTiger" / "MENU TIGER" → MENU TIGER; "GloriaFood (Oracle)"
  → GloriaFood.
- **Features:**
  - a tool has a feature when any of its plans states yes (a paid add-on or a higher plan counts, noted);
  - "no" only when every stated plan says no;
  - everything else is unknown;
  - the CSV's wording is kept in the competitor's notes.
- **Payment providers** come only from the CSV's card notes (Stripe, Square, SumUp, Mercado Pago, Viva, Paytrail…).

**⚠️ Could not be mapped** (the build script prints this list):

| Row | What the schema can't hold | What the tab does instead |
|---|---|---|
| DE Bestelltheke Start | 5% capped at €399 a month | counts the full 5%: dearer than the research at medium and busy |
| ES Cheerfy Shop | 2.5%, minimum €29 and maximum €299 a month | stored as 2.5% with no monthly fee; busy reads higher than the research |
| BR VexMenu (all three plans) | a R$0.99 per-order minimum on its Pix rate | not applied; Vex Black states no rate, so ours is assumed |
| BR Anota AI >250 | "251+ orders/month" is a floor, not a cap | counted at every size, as the research did |
| Eventifood, EasyEats, RapidOrderz | the manual doesn't say who they're built for | `focus` left empty, so "Food-truck tools only" leaves them out (dimmed, not hidden) |
| Aparece | WhatsApp is "link sharing; Pro adds WhatsApp order alerts" | left unknown |
| The CSV's other seven feature columns (pay at truck, KDS, printed tickets, schedule/map, menu photo import, allergens, multi-truck) | not among the six key features | not imported; they stay in the CSV |

- Indonesia's ECB rate is stored as 20,253.9: the report printed it to six figures (the ECB value is 20,253.88).
- "WhatsApp" in the research means any WhatsApp feature (ordering, alerts), not only auto-replies. Rivals' cells mean
  that; ours means auto-replies.

## 7 · Screenshots (fixture data only)

`node scripts/pricing-check-screenshots.cjs` (after `next build`). It bundles the **real** `app/admin/page.tsx` with
esbuild and answers every `/api/*` call with fixtures:
- the JSON payload as if imported;
- Aphelios and Order Tiger marked verified in GB;
- the catalogue as the plans migrations seed it;
- the plan prices and card rates **observed** read-only on 23 Oct.

**52/52 checks:**
- no page errors;
- the page never scrolls sideways;
- every table box fits the screen;
- the list sits beside the country at 1512 and stacks at 390;
- the "Pricing check" tab is in view;
- GB medium reads £29 / £39 / £59;
- the GB preview shows our bar and the two verified rivals.

`docs/pricing-check-1/`:

| File | What it shows |
|---|---|
| `chromium-1512-admin.png`, `webkit-1512-admin.png` | Admin view, first country (Australia) |
| `chromium-1512-gb.png`, `webkit-1512-gb.png` | United Kingdom, medium: the verdict, £29 / £39 / £59, the full table, key features |
| `chromium-390-admin.png`, `webkit-390-admin.png`, `chromium-390-gb.png`, `webkit-390-gb.png` | the same on a phone, stacked |
| `chromium-1512-preview.png`, `webkit-1512-preview.png`, `chromium-390-preview.png`, `webkit-390-preview.png` | Customer preview, GB |
| `chromium-1512-import.png`, `webkit-1512-import.png` | empty tables: the Import research data button |

**Fixed along the way:**
- At 390 the "Not counted" list's implicit grid column grew to its longest name and pushed the page sideways. It is
  now `grid-cols-1`.
- "Pricing check" was cut off in the tab bar at 1512 (§0.5).

## 8 · Harness and sweep

- **`scripts/pricing-check-1.cjs`: 55/55.** It covers:
  - the report totals;
  - the GB suggestions;
  - "Not possible" for GB small without customer fees;
  - order caps skipped (Qrder Gratis at 150; Lite at 600);
  - planned countries placed by shape;
  - France's single row, Indonesia's missing card rate, IE/PT flagged;
  - the price-point rule on 15 values;
  - stale;
  - our feature cells ("Pro & Unlimited", "Yes", "Not in this country");
  - no plan named in the engine;
  - the actions on an in-memory store:
    - import once and refused twice;
    - verify;
    - edit inserts and supersedes, keeping history;
    - a superseded row refused;
    - unknown fields and bad values refused;
    - one current benchmark;
    - feature cells;
    - add competitor, the name matched case-insensitively;
    - an unknown action refused.

  The file contains no word the runner's screen refuses.
- **Full sweep:** SWEEP_DETAIL
- **To register it** (when you decide on §0.1), add to `scripts/harnesses.json`:
  - `"pricing-check-1.cjs"` to `harnesses`;
  - `"pricing-check-build-data.cjs"` to `excluded.fixture_generators`, since it rewrites the committed JSON;
  - `"pricing-check-screenshots.cjs"` to `excluded.needs_a_browser`.

  Until then the runner lists these three as "in neither group".

**Other checks:**
- `tsc --noEmit`: clean (whole project).
- `eslint`: the new files have 0 problems. `app/admin/page.tsx` has 13 before and 13 after, all pre-existing.
- `next build`: passes. `/api/admin/pricing-check` is built as a dynamic route.

## 9 · Things to know

- **The research data still reflects one day's search**, cut short by the search budget (research report §12). Hence
  "Verified by you" and the Customer preview, which shows only verified rivals.
- **GB with the defaults** (food-truck tools only, customer fees counted):
  - **not cheapest at medium or busy**: Aphelios at £29.99 flat (pre-ordering not confirmed), Perkss, Grafterr and
    Order Tiger;
  - **cheapest at small**: the pill reads "Small only";
  - **Hatches Up**, now in the data: our medium total of £376 is well under its £682.
- **France** is in the Planned group until its row is inserted.

## 10 · Read-only SQL run in this workstream

1. The live switch, card rate and plan prices of every country:

```sql
select c.country_code, c.enabled, c.currency, c.card_fee_online_pct, c.card_fee_online_fixed_minor,
  (select json_agg(json_build_object('plan',p.plan_key,'m',p.monthly_minor,'i',p.included_online_minor,'bps',p.fee_bps) order by p.plan_key) from public.plan_prices p where p.country_code=c.country_code) as prices
from public.country_settings c order by c.enabled desc, c.country_code;
```

   Result: 35 rows, **all `enabled = true`**. Prices unchanged from the research. No FR row.

2. Whether the three tables already exist:

```sql
select table_name from information_schema.tables where table_schema='public' and table_name in ('competitors','competitor_plans','country_benchmarks');
```

   Result: none.

## Undo (only if Dominic asks)

⛔ DO NOT RUN — only if Dominic asks to remove the Pricing check tables after the migration has been run. It deletes
all competitor data entered since.

```sql
begin;
drop table if exists public.competitor_plans;
drop table if exists public.competitors;
drop table if exists public.country_benchmarks;
commit;
```

**Code:** delete the new files in §3 and revert `app/admin/page.tsx` and `scripts/countries-screenshots.cjs`.
