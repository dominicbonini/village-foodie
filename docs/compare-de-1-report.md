# compare-de-1 — report

**25 October 2026.** Written for Dominic. Nothing was committed, pushed or deployed, and no database change was run.
Every database change is below as **NOT RUN** SQL (§9). The read-only queries that were run are listed in §8.

## 1 · Summary

- **The German comparison page is built:** `/de/vergleich/foodtruck-bestellsystem`, "Bestellsystem für Foodtrucks:
  Vergleich 2026". Everything is server-rendered:
  - a 14-row table;
  - a costs section;
  - a fit section;
  - 7 FAQ answers in `<details>`;
  - a method section.

  Twins of the same content are served at `….md` and `….json`. The JSON gives every cell's source URL and checked date.
- **Visibility is enforced on the server**, through one rule used by the page and both twins:
  - Status comes from `country_settings.comparison_status`: **off** → 404, **admin** → admins only (noindex, no-store, a
    banner and a checklist), **live** → public and indexed.
  - A competitor appears publicly only when its **entry, its plan and its features are all verified**. Admins see
    everything, with each unverified item badged "nicht geprüft · öffentlich verborgen".
- **Today nothing is visible**, because migration 20261042 has not run. On the dev server against the live database, the
  page, the `.md` and the `.json` all return **404 with `X-Robots-Tag: noindex, nofollow`** and no-store. After you run
  the three "run now" blocks, the page is visible to admins only.
- **German competitors were checked on their own websites** (§3): 10 tools, 4 tills and 3 marketplaces.
  - GastroSystem turned out not to be an ordering system (gastrosystem.de sells kitchen and hygiene equipment), so it is
    left out.
  - The my-foodtrucks.com list could not be checked, because the domain does not resolve.
  - The research sits in `data/compare-de-1/competitors.json`, which is imported once from Admin › Pricing check. All of
    it is unverified.
- **Proof:**
  - `scripts/compare-de-1.cjs`: **64 passed, 0 failed**.
  - Screenshots in WebKit and Chromium at 1512 and 390: **17 passed, 0 failed**.
  - tsc: clean.
  - Lint: no new problems (§7 explains why the raw count reads +16).
  - Full sweep: see §7.

## 2 · STEP 0 — what was there

**a · pricing-check-1.** The report, `lib/pricing-check.ts`, the Pricing check tab and migration 20261039 all exist.
- **Its tables are live:** 128 competitors, 242 plans (7 for DE) and 46 benchmarks.
- **No pricing-check migration is missing.**
- The 7 live DE plans:
  - Bestelltheke: Start.
  - FoodsHero: Start, Business.
  - GASTRODIGITAL: Flat, pay per order.
  - Liefersoft: STARTUP, GOLD.

  All are unverified, checked 2026-10-23.

**b · ai-files-1 does not exist.** There is no report, and none of its code is in the repo. This raised one wording
problem, flagged below.
- `country_settings` has no app flags. Only `country_benchmarks` has nullable `ios_app_available` /
  `android_app_available` columns.
- `/llms.txt` has **no Features section**.
- 20261042 adds the two flags exactly as your prompt specified: boolean, not null, default false, GB true.

  ⚠️ The prompt said "exactly as ai-files-1 specified", but ai-files-1 does not exist. I used the specification written in
  your own prompt, so nothing had to be chosen.

**c · Routing and the rest.**
- **Routing:** `proxy.ts` only routes landing, features and compare, so the new address passes through untouched.
  `app/[country]/features` and `/compare` are static siblings, so they always win over the new `[section]/[slug]` route.
- **Messages:** next-intl, with split-messages generating `messages/ns` and `lib/i18n/catalog`.
- **Footer:** `LandingFooter`, a server component.
- **Sitemap and hreflang:** `app/sitemap.ts` and `countryPageAlternates`.
- **llms:** `lib/llms-text.ts`.
- **JSON-LD:** `lib/structured-data.ts`, with `ORG_ID` / `SITE_ID`.
- **Admin check:** `lib/auth/admin.ts adminUser()` (cookie, or Bearer for the app).

**d · The wording the page relies on, quoted:**
- **VAT**, from `country-specific-terms.md` line 263 (the EEA section): "HatchGrab Ltd is a UK company and is not
  registered for VAT in your country. If you are registered for VAT, give us your VAT number. You then account for any
  VAT on our fees yourself, under the reverse charge."
- **VAT**, from Terms line 66: "We are not registered for VAT, so no VAT is added to our fees."
- **No contract**, from Terms line 64: "**No contract, cancel anytime.** There is no minimum term and no notice period. You
  are never tied in." Lines 68–69 add that fees are billed monthly in advance, non-refundable, and you can cancel any
  time.
- **No card**, already in de-DE:
  - `landing.trust.noCard` „Keine Kreditkarte nötig“;
  - `auth.signup.consent` „… Keine Kreditkarte nötig.“;
  - `landing.trust.cancel` „Jederzeit kündbar, ohne Vertragsbindung“;
  - `pricing.banner.body` „Keine Kreditkarte zum Start, keine Vertragsbindung, jederzeit kündbar.“

  So the CTA shows both „Keine Kreditkarte nötig“ and „Monatlich kündbar“.

## 3 · STEP 1 — the German competitors, checked on their own websites

**How the check was run:**
- One research agent, slow and sequential, one page at a time, with no workarounds for blocks.
- `checked_on` is 2026-10-24.
- The vendor's own words for every cell are in `data/compare-de-1/competitors.json` → `evidence`, and the raw log is in
  the scratchpad.

| Tool | Price as advertised | Pre-order + pickup time | Kitchen capacity per slot | Weekly schedule, changing locations | Notes |
|---|---|---|---|---|---|
| gastro25 | 69 € / month zzgl. MwSt., no setup, no minimum term | Ja | not stated | not stated | Has a food-truck page. Card, Apple Pay, Google Pay, Klarna (Stripe); cash |
| GastroDok | 29 € / month or 290 € / year incl. USt | Ja | **Ja** (max 6 orders per 10-minute slot) | not stated | Has a food-truck page. **No online payment**: guests pay at the truck |
| FoxiFood | 0 € / month; **the guest pays 0,45 €** per order; Stripe card fee separate | Ja | not stated | not stated | Its own pages give two different card fees (1,5/2 % + 0,25 € vs "2 % + 0,45 EUR") |
| Bestelltheke | 5 % or 7 % per order (capped at 399 € / 499 €), or 249 € / 349 € flat, zzgl. USt | Ja | **Ja** | not stated | Already in the live tables (Start) |
| GASTRODIGITAL | 0,49 € per order, or 99 € / month flat; VAT not stated | Ja | not stated | not stated | Already in the live tables |
| OrderFront | **Hidden** ("Warum stehen hier keine Zahlen?"); payment fee "online ab 2,5 %"; monthly, no minimum term | Ja | **Ja** | not stated | Restaurants and Imbiss; no food-truck page |
| FoodsHero | 99 / 249 / 399 / from 799 € net per month, plus setup 299–1.499 € | Ja | not stated | not stated | The **only** tool with WhatsApp replies and social posts (paid agency extras) |
| Jamezz | Hidden; one-off setup plus a monthly fee, amounts not stated | Ja | not stated | not stated | Terminals, QR and webshop |
| Vev | Shown only in USD (from $9.99 / $19.99 / $39.99 per month excl. tax); no German site | Ja | Ja | not stated | **Not an entry**: no German price. Competitor row only |
| GastroSystem | — | — | — | — | **Dropped**: gastrosystem.de sells kitchen and hygiene equipment. Send the right domain if you meant another product |

**What stands out:**
- **None** of the ten states a weekly schedule with changing locations shown to customers.
- Only FoodsHero has WhatsApp replies and social posts, both as paid extras.

**Tills:**
- **SumUp:** TSE-compliant. Pre-order with a pickup slot only on Kassensystem Plus (49 € / month, 2,5 % on those orders).
- **Zettle (PayPal):** KassenSichV-compliant with a TSE connection, no monthly fee. Pre-ordering is not mentioned.
- **orderbird:** „Kassensystem mit zertifizierter TSE“. It offers only QR ordering at the table.
- **ready2order:** „100% finanzamtkonforme TSE-Kasse“. Pre-ordering is not mentioned.

**Marketplaces in Germany:**
- **Uber Eats:** 14 % pickup, 30 % delivery by Uber couriers, 14 % if the truck delivers itself (Uber One members: 33 % /
  12 %).
- **Wolt:** says it charges commission but gives no rates.
- **Lieferando:** **blocked** (HTTP 403 on the partner page). Its rates are not published anywhere we could read.

**Blocked or uncheckable:**
- `lieferando.de/partner-werden` returned 403.
- `my-foodtrucks.com` does not resolve in DNS, and three searches did not find the article.

**In the data file:**
- **9 competitors:** GastroSystem is left out.
- **19 plans:** Vev's USD prices are left out.
- **8 entries,** in this order: gastro25, GastroDok, FoxiFood, Bestelltheke, GASTRODIGITAL, OrderFront, FoodsHero, Jamezz.
- Every row has source `research`, and every row is unverified.
- **The "passt, wenn …" lines are rewritten to "Sie"** (the research wrote "du"). They carry no amounts, so a price change
  cannot leave one stale.
- **How two fees are modelled:**
  - **FoxiFood:** its 1,5 % + 0,25 € is Stripe's card fee, so it is stored as a separate card fee, not as its own order
    fee.
  - **OrderFront:** its "ab 2,5 %" includes card processing, so it is stored as a bundled payment fee. The page shows
    „2,5 % pro Online-Zahlung, inkl. Kartengebühr“.

## 4 · What was built

| Area | Files | What it does |
|---|---|---|
| Migration (NOT RUN) | `supabase/migrations/20261042_compare_de_1.sql` | Adds `country_settings.comparison_status` (off / admin / live, default off, CHECK) and `ios_app_available` / `android_app_available` (boolean, not null, default false; GB true). Adds four competitor columns (`capacity_slots`, `multi_location_schedule`, `kds`, `pay_at_truck`: yes / no / unknown) and two texts (`payment_methods`, `min_term`). Creates `public.comparison_entries` (unique per country and competitor; RLS on, **no policies**, every grant revoked). |
| The page | `app/[country]/[section]/[slug]/page.tsx`, `comparison.css` | The nine sections, the admin banner, the "So sieht es öffentlich aus" toggle (`?view=public`), and meta, OG and `<link rel="alternate" type="text/markdown">` / JSON. The JSON-LD `@graph` holds WebPage, BreadcrumbList, FAQPage and ItemList (name and url only) plus the Organization and WebSite they point at. **No Product, Review or Rating.** |
| The builder | `lib/comparison.ts` | Pure, so the page, both twins and the harness are built by the same code. Every HatchGrab cell comes from data: plan switches ("Ab Pro"), `plan_prices` (base-fee range, fee per plan), the app flags, and the messages. **No plan, price, allowance or trial is written in code** (§81). The harness checks this. |
| Server loading | `lib/comparison-server.ts`, `lib/comparison-flags.ts`, `lib/comparison-types.ts` | Tolerant reads, cached 60 s: before 20261042 runs, every country reads "off". One visibility rule (`resolveComparison`), the footer link, and the live pages for the sitemap and llms. |
| Twins | `app/api/compare/[country]/[section]/[slug]/[format]/route.ts`, the `next.config.ts` afterFiles rewrite | `….md` and `….json` follow the same visibility. Live: cacheable, with a canonical Link header. Otherwise: no-store and noindex. |
| Headers and lang | `proxy.ts` | A non-live comparison address, whether a 200 for an admin or a 404 for everyone else, gets `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`. `<html lang="de-DE">` on the page. |
| Sitemap, llms, hreflang | `app/sitemap.ts`, `lib/llms-text.ts`, `app/llms.txt/route.ts` | **Live only.** The sitemap entry has lastmod = the newest check date the public page shows, and hreflang = itself only. `/llms.txt` gets a "Comparisons" section in English. Admin or off: absent from all three. |
| Footer | `components/landing/LandingFooter.tsx`, `components/landing/AdminOnly.tsx`, `landing.css` `.foot-col` | A "Vergleich" column. **Live:** in the server HTML. **Admin:** added in the browser only after `/api/auth/me` says admin (never in the server HTML). **Off:** absent. Only on the country's own pages (landing, features, compare, about). |
| Admin › Countries | `components/admin/ComparisonStatusPanel.tsx`, `app/api/admin/countries/comparison/route.ts` | A "Comparison pages" panel above the table: Off / Admins only / Live per German-language country. Live asks first. It writes only `comparison_status`, never the app flags. Before 20261042 runs it says to run it. |
| Admin › Pricing check | `components/admin/PricingCheckTab.tsx`, `lib/admin/pricing-check-actions.ts`, `lib/admin/pricing-check-store.ts`, `app/api/admin/pricing-check/route.ts`, `lib/pricing-check.ts` | The feature table gains the four new rows plus editable "Payment methods" / "Minimum term". A new **section 5 "Comparison page"** lets you add, order (↑ ↓), choose the plan, edit the „passt, wenn …“ line, mark the entry / plan / features verified, and remove. Editing an entry clears its verification. The **"Import German comparison research"** card: matches competitors by name, fills only unknown or empty fields, skips a plan the competitor already has under the same name, and **refuses a second run** (409). Competitor reads fall back to the old columns until 20261042 runs. |
| Words | `messages/de-DE.json`, `messages/en-GB.json` (a new `comparison` namespace), `docs/i18n/back/de-DE.json`, `docs/i18n/scoped-namespaces.json`, `scripts/translation-check.cjs` | German and the English base only. `scoped-namespaces.json` tells translation-check that the other 21 languages are not expected to have it. **Structural 0** for de-DE, de-AT, de-CH, fr-FR and pl-PL. The English address is `/…/comparison/food-truck-ordering-system`; the planned `compare` section would have clashed with the existing `/[country]/compare` route. |
| Data | `data/compare-de-1/competitors.json` | §3. |
| Proof | `scripts/compare-de-1.cjs`, `scripts/compare-de-1-screens.cjs`, `scripts/_compare-de-1-fixtures.cjs`, `scripts/harnesses.json` | §6. |
| Re-pins (§7) | `scripts/admin-countries-1.cjs`, `scripts/_messages-parity-1e.cjs` | Re-pinned only for this change, each with a dated note. |

## 5 · Before it can go live — the checklist and open items

**The page's admin checklist** (shown in the banner) has five items:
1. **iPad and Android flags for Germany on.** Run the 4th SQL block on the day both apps are in the German stores. Until
   then, the public cells say „Nicht in Deutschland“.
2. **At least 2 verified competitors.** Verify the entry, the plan and the features in Pricing check › Germany ›
   Comparison page.
3. **No „[ … ]“ placeholder in the copy.** Currently there is none.
4. **VAT wording present.** It is there now.
5. **Impressum decision recorded.** `lib/comparison-decisions.ts` → `IMPRESSUM_DECISION.DE` is `null` on purpose: a
   German page with a German audience may need an Impressum (DDG §5). That decision is yours. Write one line there, and
   the item turns green. (It started as an empty message; messages-parity rightly refuses an empty message, and a
   decision record is not translatable copy.)

**Open items:**
- **ai-files-1 does not exist** (STEP 0b). If you meant to run it first, its "Features" section in /llms.txt is still
  missing.
- **Misleading copy elsewhere:** de-DE `manageSettings.getApp.body` says „für iPhone, iPad und Android“, but the app is in
  the UK App Store only. I did not change it (outside this scope).
- **Caching:**
  - The page is `force-dynamic` like every marketing page, so Next adds its own page Cache-Control. In dev that is
    `no-store, must-revalidate`, which covers the non-live case.
  - "Cacheable when live" therefore means the same as the other marketing pages: not CDN-cached HTML.
  - The twins do send `public, s-maxage=3600` when live.
- **Lieferando's rates** could not be checked (blocked). The marketplaces card says so honestly.
- **Feature cells are marked verified when edited.** Clicking a feature cell in Pricing check stamps
  `features_verified_at`, as pricing-check-1 already did. A public competitor therefore needs you to either set a cell or
  press "Mark features verified". The explicit button is new.
- **The 7 earlier DE plans** (Liefersoft and the others) stay as they are. Liefersoft is not on the comparison page; add
  it in the panel if you want it.

## 6 · Proof

**`node scripts/compare-de-1.cjs`: 64 passed, 0 failed.** It uses fixtures only (fictional "Testanbieter A / B / C"):
- **Status:**
  - off → 404 even for an admin;
  - admin → 404 anonymous, 200 for an admin (noindex, no hreflang, banner, 5 checklist items, no live switch);
  - live → 200, indexable, self-canonical, hreflang itself only;
  - a wrong slug or section → 404.
- **Sitemap and llms:** the page is in the sitemap (lastmod 2026-10-22) and in `/llms.txt` "Comparisons" only when live.
  The other pages' hreflang never names it.
- **Proxy:** recognises the address and its twins (and not `/de/features` or `/de/compare/x`). The noindex / no-store rule
  is present.
- **Twins:** admin → 404 anonymous, 200 for an admin with no-store and noindex; off → 404.
- **Gating:**
  - Public shows only A, in the HTML, `.md` and `.json`.
  - The admin view shows all three, with badges.
  - "So sieht es öffentlich aus" equals the public view.
  - The JSON gives each cell a source and a date.
  - The "Weitere Anbieter…" note shows below two verified competitors.
  - An edited, unverified plan hides the competitor.
- **The server HTML:**
  - a `<caption>` with „Deutschland“ and the date, `th scope`, 14 rows, the table's own scrolling box;
  - „0 € bis 69 €“, „0,99 %“ and „keine (Unlimited)“;
  - „Ab Pro“ for WhatsApp;
  - the costs with source and date, the card-fee and VAT sentences;
  - 7 FAQ answers in `<details>`;
  - `#methodik` with the twin links;
  - the CTA „3 Monate kostenlos testen“ (trial from the plans);
  - the breadcrumb and byline.
- **App rows:** „Nicht in Deutschland“ publicly, the admin wording for admins, „Ja“ with the flags on. The „passt nicht“
  app clause follows the flags, and so does the checklist.
- **Price change:** Pro 29 → 34 € in `plan_prices` reaches the page, the `.md`, the `.json` and the JSON-LD FAQ.
- **JSON-LD:** WebPage (datePublished, dateModified, isPartOf, publisher, about), BreadcrumbList, FAQPage, ItemList
  (name / url only). No Product, Review or Rating.
- **Footer:** in the server HTML only when live. Never for admin or off. Not on /uk.
- **Import:** inserts once; reuses an existing competitor and its same-named plan; a second run → 409.
- **The data file's shape:** every plan and entry is research and unverified; GastroSystem is out.
- **No amounts or plan keys in `lib/comparison.ts`.** The migration has RLS and no policies.

**`node scripts/compare-de-1-screens.cjs`: 17 passed, 0 failed** (WebKit and Chromium, 1512 and 390, fixture data only):
- the page never scrolls sideways;
- at 390 the table scrolls inside its own box;
- the footer column is present.

**Screenshots in `docs/compare-de-1/`:**
- `webkit-admin-1512.png`, `webkit-admin-390.png`, `chromium-admin-1512.png`, `chromium-admin-390.png`;
- `webkit-public-1512.png`, `webkit-public-390.png`, `chromium-public-1512.png`, `chromium-public-390.png`;
- `webkit-footer-1512.png`, `webkit-footer-390.png`, `chromium-footer-1512.png`, `chromium-footer-390.png`.

(The logos show as broken images in these screenshots: the screenshot harness does not serve `/logos`. This was the same
in earlier rounds.)

**Real dev server** (`http://hatchgrab.localhost:3000`, live database, 20261042 not run, so DE reads "off"):
- `/de/vergleich/foodtruck-bestellsystem`, `.md` and `.json` → **404**, `x-robots-tag: noindex, nofollow`, no-store.
- `/de`, `/de/features`, `/de/compare`, `/about`, `/sitemap.xml`, `/llms.txt` and `/admin` → 200.
- `/de` has no comparison link.
- The two new admin APIs → 404 when anonymous.
- The dev log has no errors.

## 7 · tsc, lint, sweep

- **tsc:** 0 errors.
- **Lint:** 2,461 errors / 378 warnings, against the 2,445 / 378 baseline.
  - **The new and changed files add none.** The one warning in `proxy.ts` (`isPublic`) predates this work.
  - **The +16 are not new problems.** Next's `@next/next/no-html-link-for-pages` rule now reports **each of 16 existing
    `<a href="/login">`-style errors twice**, on the same line with the same message. The new three-segment dynamic page
    route also matches those paths.
  - I measured this with a clean checkout of HEAD in a temporary worktree:
    - the 9 files are LandingNav, login, signup, verify-email, reset-password, forgot-password, HatchGrab contact,
      DemoGetStarted and SessionAlertBanner;
    - each has exactly 2× its old count.
  - The worktree was removed afterwards.
  - The route's shape is what the brief asks for, so I left it.
- **Sweep** (`node scripts/run-harnesses.cjs`, 168 listed harnesses):
  - **First run:** refused before running anything. The screen found the word "stripe" in a test label in
    `compare-de-1.cjs`; the label and regex were reworded.
  - **Second run:** 161 passed, 7 failed. Each failure and what was done (every one is green now, rerun one by one):

| Harness | Why it failed | What was done | Now |
|---|---|---|---|
| `ui-literals.cjs` | Two inline `aria-label`s on the new page ("Breadcrumb", "Admin") | Moved to messages: `comparison.breadcrumb.label` („Brotkrümelnavigation“) and `comparison.admin.label` | ✓ |
| `messages-split.cjs` | `translatorFor(…, 'comparison' as never)`: the cast made its namespace reader run on to `pageSeedProps(…, 'marketing')` | Typed call without the cast | 187 / 0 |
| `canada-1.cjs` | The English base's "card readers" reached en-CA, which must say "card terminal" | English comparison copy says "card machines" | 85 / 0 |
| `europe-languages-1.cjs` (22) | The English base said "at the hatch", and the other languages fall back to it (the namespace is English and German only). de-CH inherited „heißt“ (no ß in Swiss German) | "at the truck"; „bedeutet“ | 427 / 0 |
| `admin-countries-1.cjs` | Its pin "no change to lib/admin/*" also covered the Pricing check files changed here | **Re-pinned** to the save path's own files by name (country actions, country store, countries route, loader). They are unchanged | 47 / 0 |
| `us-polish-batch.cjs` | A Playwright `TimeoutError` after 605 s, under the load of the full sweep | Nothing. Run alone it passes | 46 / 0 |
| `messages-parity.cjs` (66) | Every new `comparison.*` English key is new wording, which this harness must have named | **Re-pinned:** `scripts/_messages-parity-1e.cjs` names the whole `comparison` namespace as new wording (compare-de-1). The next run found one more problem, in 38 locales: the empty `comparison.admin.impressumDecision` cannot render. It is now `lib/comparison-decisions.ts` (§5) | 426,790 / 0 |

- **After the fixes:** all seven pass, and `compare-de-1.cjs` (64 / 0) and `compare-de-1-screens.cjs` (17 / 0) pass again. I did
  not rerun the whole sweep a third time: it takes over an hour, and these seven were the only failures. translation-check structural
  is 0 for de-DE and de-CH. tsc and lint are unchanged from above.

## 8 · Read-only SQL that was run

```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and (table_name in ('competitors','competitor_plans','country_benchmarks') or (table_name = 'country_settings' and column_name in ('ios_app_available','android_app_available','comparison_status'))) order by table_name, ordinal_position;
```
```sql
-- errored: competitors has no country_code
select (select count(*) from public.competitors) as competitors, (select count(*) from public.competitor_plans) as competitor_plans, (select count(*) from public.country_benchmarks) as country_benchmarks, (select count(*) from public.competitors where country_code = 'DE') as de_competitors;
```
```sql
select (select count(*) from public.competitors) as competitors, (select count(*) from public.competitor_plans) as competitor_plans, (select count(*) from public.competitor_plans where country_code = 'DE') as de_plans, (select count(*) from public.country_benchmarks) as country_benchmarks;
```
```sql
select country_code, enabled, locale, currency from public.country_settings where country_code in ('DE','AT','CH','GB') order by 1;
```
```sql
select pp.plan_key, p.sort_order, p.is_public, pp.monthly_minor, pp.included_online_minor, pp.fee_bps from public.plan_prices pp join public.plans p on p.key = pp.plan_key where pp.country_code = 'DE' order by p.sort_order;
```
```sql
select c.name, p.plan_name, p.monthly_minor, p.truck_fee_bps, p.vat, p.checked_on, p.verified_at is not null as verified, p.superseded_at is null as current from public.competitor_plans p join public.competitors c on c.id = p.competitor_id where p.country_code = 'DE' order by c.name, p.plan_name;
```

## 9 · NOT RUN SQL, in order

**1 · pricing-check-1:** nothing to run. Its tables are live (128 / 242 / 46).

**2 · run now:** the full contents of `supabase/migrations/20261042_compare_de_1.sql`. They are in the chat reply.
Nothing public changes when it runs, because every country starts "off".

**3 · run now:**
```sql
update public.country_settings set comparison_status = 'admin' where country_code = 'DE';
```

After that, import the research in Admin › Pricing check (the "Import German comparison research" card), then verify
the entries.

**4 · run on the day the iPad and Android apps go live in the German stores:**
```sql
update public.country_settings set ios_app_available = true, android_app_available = true where country_code = 'DE';
```

Going live is not SQL: it is the "Live" button in Admin › Countries › Comparison pages.

## 10 · Undo (only if Dominic asks)

```sql
update public.country_settings set comparison_status = 'off' where country_code = 'DE';
```
```sql
begin;
drop table if exists public.comparison_entries;
alter table public.competitors drop constraint if exists competitors_compare_features_chk;
alter table public.competitors drop column if exists capacity_slots, drop column if exists multi_location_schedule,
  drop column if exists kds, drop column if exists pay_at_truck, drop column if exists payment_methods, drop column if exists min_term;
alter table public.country_settings drop constraint if exists country_settings_comparison_status_chk;
alter table public.country_settings drop column if exists comparison_status, drop column if exists ios_app_available,
  drop column if exists android_app_available;
commit;
```
```sql
-- the imported research only (the file's fixed ids), if it was imported:
delete from public.comparison_entries where country_code = 'DE';
delete from public.competitor_plans where source = 'research' and checked_on = '2026-10-24' and country_code = 'DE';
```

The code reads every new column tolerantly, so the site keeps working after an undo.

This report is docs/compare-de-1-report.md.
