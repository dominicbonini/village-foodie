# compare-research-1 — competitor research on vendors' own websites, written as an importer data file

**24 November 2026 · research only · nothing imported, nothing written to the database**

**Commits on `france-vat-1`** (not pushed):
- `528debcb` group A
- `8aa5f0c0` group B
- `59f51759` group C

## 0 · The short version

- **What was researched:** 41 countries, 114 eligible competitors (after the food-truck-first rule), 218 plans with a price and 143
  comparison entries.
  - Every vendor was read on its OWN website by Claude Code research agents. Each competitor carries an eligibility quote and its URL,
    today's price with its quote and the 14 key-differentiator answers.
  - The file is `data/compare-research-1/competitors.json`. It is registered in `lib/data-import/importer.ts` `DATA_FILES`, so the
    nightly run imports it once, after main moves forward and is pushed.
  - **It passes the importer's own validation** (`researchProblems`, run without a database by `docs/compare-research-1/build.cjs`)
    and a new **100× guard**.
- **Under the simpler rule** ("2 eligible competitors with a price on their own site, in the country's currency"), **29 of the 41
  countries reach 2 or more**:
  - **22 on solid tools**: AU MY TH DK PL US FR GB DE NL IT BR JP IE ES NZ CZ CA AT CH BE HU.
  - **7 only if SumUp's generic web shop or Anolla counts**: GR NO FI HR SI CY LT.
  - **Before this work it was 13 (compare-status-1 §6.2).**
  - **Not reaching 2:** HK SG LI LU RO SE PT BG EE LV MT GI.
- 🔴 **The importer cannot do three things the brief asks for**, so they are listed for a decision (§6):
  - mark a stored competitor not relevant (it only accepts `lifecycle` active or candidate);
  - correct a stored plan's price (it skips a plan whose name the competitor already has);
  - overwrite a stored answer (it only fills empty ones).
- **The 100× prices are settled** (§4). For example, The Foody Gram Starter is $159, not $15,900. Those corrections need a separate
  step, because of the second point above.

## 1 · Method, and how this differs from the brief

**Research:**
- One research agent per country (or small group), sharing `docs/compare-research-1/agent-brief.md`: one web request at a time,
  own-site sources only, verbatim quotes of at most 200 characters, Dominic's eligibility order, and only the 14 key features.
- Each agent wrote a raw file, `docs/compare-research-1/raw/<CC>.json`, kept in the repo as the evidence.
- **Pace:**
  - group A ran one agent at a time;
  - **from group B, two agents ran at once, and from mid group C three**, because you said in chat "run a 2nd agent if it helps" and
    then "run a 3rd agent if it helps";
  - each agent still made one request at a time, and agents worked on different vendors' domains;
  - for a few minutes four were running by mistake, so I stopped one (Bulgaria) and restarted it later;
  - one agent (Norway) once fetched two Favrit pages in the same turn, and said so.

**Prices:**
- The importer writes `monthly_minor` **exactly as given**; there is no conversion. So "record the monthly price in MAJOR units" can't
  mean writing 59 into that field: €0.59 would be stored.
- So the agents recorded **major units as the page shows them**, and `build.cjs` converts them with the repo's own
  `toMinorUnits` (`lib/money-format.ts`, which knows zero-decimal currencies such as JPY). Every plan is then read back and must equal
  the page's amount. Examples: 995 kr → 99500; 3,980円 → 3980; R$79 → 7900.
- **Periods:**
  - a yearly-only price is divided by 12 (`yearly_only`);
  - a per-day or per-week price becomes an estimate per month (× 365 ÷ 12 or × 52 ÷ 12) **marked `unclear`**, so it can never be
    published as a stated price (Qashier MY, Foodticket NL, Perkss GB, Refektorius LT, eSystem HU);
  - a one-off price is written as €0 a month plus a set-up fee (Place à emporter);
  - a multi-year prepay is not written.

**Eligibility and quotes:**
- **Food-truck first:** `build.cjs` leaves restaurant and till tools out of a country where 2 or more food-truck tools have a price.
  This covers 32 country entries, listed under `not_needed` in the file. Nothing stored about them changes.
- **Restaurant focus** is written as `nearest_local`, the table's own value for "restaurant".
- **Quotes:** agents asked the page reader for exact sentences, and several checked their quotes against downloaded page text. A few
  quotes are labels or run-together text ("£99per month", "$29USD / month"). `request_check: true` on every competitor makes the
  nightly checker re-read each page with its own quote check.
- **Coordinator corrections to the raw files** (each recorded in that file):
  - Order Tiger was left out of PT: no Portuguese presence.
  - Jotform was left out of BG: a form builder, not a food-ordering platform.
  - Karma, Caspeco and Purspot (SE) were moved from "not relevant" to "not fully researched". They do take online orders; the agent
    had marked them only because Sweden already had food-truck tools.

## 2 · Per country

**Columns, in each country table below:**
- **Eligible:** yes / no (not relevant) / unread.
- **Price:** today's, from the vendor's own site, in major units. "on request" means no price on the site.
- **Quote / URL:** the order-ahead (or food-truck) quote and its page. The full quotes and every feature answer are in `raw/<CC>.json`.

**The count line:**
- It counts eligible competitors with a price **in the country's currency**.
- With 2 or more food-truck tools priced, only those count (Dominic's preference order).
- **2+ = publishable under "2 eligible competitors with a price on their own site"**, once imported, and once the publish step's AE
  crash (compare-status-1 §1.3) is fixed.

| Country | Counted | 2+? | Who |
|---|---|---|---|
| AU | 3 | ✅ | Y wait (food truck, $15/$49/$89 incl. GST), Bopple ($49 + 1.64%), Square ($0 / $129; weak: no pickup wording) |
| HK | 1 | — | Eats365 (HK$1,200 from); Take App is USD only; VGather has no price on its own site |
| MY | 3 | ✅ | StoreHub (2% pickup fee; POS from RM122), Klikit (RM59 / RM218), Qashier (RM8 a day → unclear) |
| TH | 3 | ✅ | Klikit (฿499 / ฿1,789), StoreHub TH (฿990 / ฿1,999), Wongnai POS (฿1,090 / ฿1,790; ordering via LINE MINI Eats, borderline) |
| DK | 2 | ✅ | Truckly (food truck, 995 / 1,695 kr), NemTakeAway (395 / 695 kr) |
| PL | 3 | ✅ | Frivo (food truck, 99 / 199 / 349 zł), UpMenu (169 / 289 / 499 zł), GoPOS / GoOrder (49 / 129 / 349 zł) |
| GR | 2 | ⚠️ | Worldline All-in-One (€24.99), SumUp (generic web shop, 0 € + 2.75%) — Spevdo's price unread (API refused) |
| US | 10 | ✅ | Food Truck ONE, Food Truck Pub, Goodfynd, Moonrise, Where's The Foodtruck, Hotplate, Order Tiger, Outbites, Zay-OS, EasyEats |
| FR | 12 | ✅ | Eatch, Heustach, Nomad, Restaurant-internet.com, Beau Camion, Place à emporter, Truckons, Achil, Vroomeat, LivePepper, bonappli, Feadys |
| GB | 7 | ✅ | Grafterr, Ordea, What The Truck, Perkss (weekly → unclear), Eventifood, Order Tiger, Weevi |
| BR | 2 | ✅ | Food Pronto (R$200; weak order-ahead), VexMenu (R$0 + 2.99% / R$299 / R$499) |
| DE | 4 | ✅ | Liefersoft, GastroDok, FoxiFood, gastro25 (all food-truck pages) |
| NL | 3 | ✅ | Qrder, Digitale Menukaart (€39 Bestellen), Foodticket (€1.50 a day → unclear) |
| JP | 2 | ✅ | モバレジ (0円 + 4%), funfo (Free / Lite AI 7,700円 / Business AI 13,200円) — KitchenCarMenu unread (503 twice) |
| IT | 4 | ✅ | Qromo (stored not relevant, §6), MenuForma (weak), Software Food Good, Tilby (weak) |
| IE | 2 | ✅ | Order Tiger (€59; Ireland never named), Click & Collection (€29 + 2.9%) |
| ES | 2 | ✅ | TopEstrellas (€129), pidopago (€365 / €485 a year) |
| NZ | 2 | ✅ | HungryTrucks ($46; promo $0.99), SmakSpace (NZ$0 / 49 / 99) |
| SG | 1 | — | Klikit (S$19 / S$68); Take App is USD only; Oddle unread |
| CZ | 2 | ✅ | Menu55 (350 / 480 Kč; weak: no chosen time), DISH Professional Order (1,349 Kč + set-up) |
| CA | 3 | ✅ | iShopo (food truck, $99), Owner.com (CA$299 / 599), OrderEatRepeat (CA$89); Food Truck Pub is USD only |
| AT | 4 | ✅ | Liefersoft, GastroDok, FoxiFood, gastro25 (each names Austria) |
| CH | 2 | ✅ | Yoveletta (stored not relevant, §6), Rent-a-Shop (44.90 CHF) — plus Pikit, Ordero, SwissPOS as restaurant tools |
| LI | 0 | — | no site names Liechtenstein |
| BE | 2 | ✅ | Payli (food truck, €49 / €79), Restomax (€149+) — Fritzy is a restaurant fallback |
| LU | 1 | — | SumUp only (generic web shop) |
| HU | 3 | ✅ | Orderly (6 990 Ft + 0.5%), QRM.hu (3 900 + 8 900 Ft), StandMágus (16 800 Ft) |
| RO | 0 | — | 4SaleFood (€5 / €10 / €20) and MenuForma are eligible but priced in EUR, not RON: 2 if EUR counts |
| SE | 1 | — | WEIQ (stored not relevant, §6; 750 SEK) |
| NO | 2 | ⚠️ | Favrit (899 kr), SumUp (generic web shop) |
| PT | 1 | — | SumUp only (generic); MENU TIGER is USD only |
| FI | 2 | ⚠️ | Food4you (0 / 39 / 89 €), SumUp (generic) |
| HR | 2 | ⚠️ | Anolla (booking tool with food pre-ordering, €0), SumUp (generic) |
| SI | 2 | ⚠️ | Anolla, SumUp (both weak) |
| BG | 0 | — | SumUp prices in EUR (generic); nothing else eligible |
| EE | 1 | — | SumUp (generic); Poster is USD only |
| LV | 1 | — | SumUp (generic) |
| LT | 3 | ⚠️ | ared (€20 a till), Refektorius (€7 a week → unclear), SumUp (generic): 1 solid |
| CY | 2 | ⚠️ | Wiiz Eat (€0.15 per order; own app €85), SumUp (generic); Storekit is GBP only |
| MT | 0 | — | only Storekit (GBP only); Malta's ordering runs through Wolt and Bolt |
| GI | 1 | — | Order Tiger (named only on a franchise page; £59) |

**Totals:**
- 41 countries researched; 29 reach 2+ (22 solid, 7 weak).
- **Group A** (target: one more each): AU, MY, TH, DK, PL now reach 2+; GR only with SumUp; HK is still at 1.
- **Group B:** all 13 reach 2+ except SG.
- **Group C:** CA, AT, CH, BE, HU solid; NO, FI, HR, SI, CY, LT weak; LI, LU, RO, SE, PT, BG, EE, LV, MT, GI not.

The full per-country tables, one row per vendor looked at, with focus, verdict, price, quote and URL, are in
**`docs/compare-research-1/summary.md`**, generated from the raw files by `summary.py`.

## 3 · The ones you asked to settle

| Competitor | Verdict | Why (own site) |
|---|---|---|
| **Aphelios** (GB) | **not relevant** | A general POS / stock suite; its "Digital Menu & QR Ordering" is scan-at-the-table / counter, and its QR page never mentions ordering ahead |
| **Grafterr** (GB) | **keep** (EPOS-first) | Its help pages show pre-orders for future dates and collection time slots with a per-slot limit; Standard £55, Pro £75 |
| **NOQ** (GB) | **not relevant** (already stored so) | POS for event and festival operators, demo only, no prices |
| **Food Truck ONE** (US) | **keep** | Customers order online from their phone and pick up; Free $0, Pro $39; Fleet is now "Custom", not $99 |
| **xMenu** (IT) | **keep, restaurant tool** | "La tua App per asporto e delivery", "Ecommerce per ordini online", from €39 — no chosen pickup time (`ahead` partial). Italy has 4 priced food-truck tools, so the rule leaves xMenu out of IT's count |
| **Klikit** (SG) | **keep** | Webshop with pickup and delivery time slots; Core S$19 (stored 1,900), Core + Omni S$68 (the webshop needs Omni) |
| **Menu55** (CZ) | **keep, weak** | Own system takes take-away and delivery orders without commission; 350 / 480 Kč; nothing about a chosen time |

## 4 · The prices stored 100× too high, corrected from the vendors' own sites

| Competitor | Plan | Stored (minor ÷ 100) | **Today** |
|---|---|---|---|
| The Foody Gram (US) | Starter / Growth | 15,900 / 19,900 USD | **$159 / $199 a month** (also Full Service $349; the 34.95 / 119 / 139 plans are gone) |
| Order Tiger (US) | EPOS / Online Ordering + EPOS | 4,900 / 10,900 USD | **$49 / $109** (also Online Ordering $69, Growth $299) |
| Klikit (SG) | Core | 1,900 SGD | **S$19** (Core + Omni S$68) |
| Ordinalo (IT) | Modulo: WhatsApp Automation | 1,900 EUR | **€19 a month (add-on)**; DELIVERY €82.50 is the billed-yearly figure (€990 a year) |
| Wiiz Eat (CY) | Own app | 8,500 EUR | **€85 a month + €950 set-up** (storefront €0.15 per order + €250 set-up) |
| Eatch (FR) | Membre Fondateur | 4,450 EUR | **€44.50 HT a month**, for the first 6 months and the first 10 trucks, then €89 |
| Beau Camion (FR) | Vitrine | 2,900 EUR | **€29 a month + €1,290 one-off**; website only, no click & collect |
| Digitale Menukaart (NL) | Menu | 1,200 EUR | **€12 a month**; no ordering in that plan (Bestellen €39 has it) |
| FoodTruck POS (NL) | Starter | 1,299 EUR | **€12.99 a month**; the vendor is now not relevant (queue QR only) |
| VGather (HK) | 3 plans | 1,200 / 2,200 / 2,900 HKD | **Not 100×.** Monthly fees on 24-month contracts, per the Cyberport catalogue; its own site (vgather.hk) shows no prices |

Other stored prices found out of date:
- **US:** Snackpass's "Pro" $499 is now a marketing plan; Zay-OS plans changed.
- **GB:**
  - Storekit Grow is £99, not 0, and Enterprise is from £995;
  - Ordea shows two prices (free + 3%, or £50 a month);
  - Perkss is weekly (£12.50 / £15 / £20).
- **France:**
  - Place à emporter is now a one-off "à partir de 2 000 €";
  - Truckons no longer has "Commandable".
- **Elsewhere:**
  - OrderFront (DE) now shows €49 / €69 / from €149;
  - funfo (JP) raised its prices on 1 Oct;
  - TopEstrellas (ES) is €129, not €24;
  - pidopago (ES) is yearly only.

The raw files have each with its quote.

## 5 · Everything marked not relevant, and why

**Stored competitors** (the importer can't mark them; §6):

| Competitor | Country | Why |
|---|---|---|
| Aphelios | GB | QR table / counter ordering only |
| NOQ | GB | event POS |
| Liven | AU | now a consumer dining wallet; its food-truck page redirects to nomni.ai |
| Ordering.co | AU, US | no AU presence and no price; no food-truck wording, and the US has enough |
| Soften Food | BR | ERP / till, no customer ordering ahead |
| VirtualLine | BR | QR virtual queue at the truck (borderline) |
| OlaClick | BR | no pickup or order-ahead wording; USD only (borderline) |
| Moduurn | CA | own site is "coming soon" |
| Ritual | CA | no country named |
| CloudOrders (candidate) | CA | no country named |
| Dine360 (candidate) | CA | no order-ahead wording |
| Gustoco (candidate) | DE | now part of order smart / OrderYOYO |
| Ordeno App | ES | no order-ahead wording |
| Check | ES | no own site |
| PAYMEZONE | ES | payment kiosk |
| EatSelf (candidate) | ES | French-only; move to FR |
| Creavo Order (candidate) | FI | tablet table ordering |
| Zettle | FI, SE | no online ordering ahead; becoming PayPal POS |
| Food Truck Concept (candidate) | FR | builds trucks |
| MENU TIGER | HK, RO, TH | USD only, no pickup-ahead wording |
| GloriaFood | IE, PT, TH | end of life 30 April 2027, USD only, no presence |
| DineEasy | IT, PT | QR scan-and-order only |
| AdvaNceD IoT | JP | no food-truck product now; QR table ordering |
| FoodTruck POS | NL | QR in the queue only |
| apetitio (candidate) | PL | takeaway "coming soon, autumn 2021" |
| POSbistro, ABS POS (candidates) | PL | no pickup / order-ahead wording |
| Orsys (candidate) | HU | table QR plus Foodora / Wolt aggregation |
| Take App | TH | no Thai presence |
| SumUp | MT, SE | MT: shipping only, no pickup; SE: no food online ordering |
| Flipdish, UpMenu | PT | no Portuguese site |
| Order Tiger | PT | no Portuguese presence |
| Pikit | LI | Liechtenstein never named; stays eligible for CH |

**New vendors looked at and not relevant:** Where The Truck, Flash Order, RapidOrderz (AU); DimOrder, Oddle HK (HK); Qashier TH, Hato Hub,
Loyverse, Restolabs TH (TH); MEALS, CompuCash, NRdata, PapaPos (LV); EestiPOS (EE); Snack Track (LU); Jotform, order.bg, myPOS (BG);
DISH PT (PT); Onslip (SE); Munu (NO). The reason for each is in the file's `not_relevant` list.

**Unreadable** (stored rows left as they are; the nightly checker will try again):

| Competitor | Country | Why |
|---|---|---|
| Choice | every country | 403 |
| Best Food Trucks | US | 429 |
| StreetFoodFinder | US | 403 |
| Homegrown | US | redirect loop |
| Truckster | US | its own site is gotruckster.com, which answered 405 |
| ChowNow | US | TLS failure |
| RapidOrderz | US | JavaScript only |
| Simpliza, SisFood, Anota AI | BR | 403 |
| GastroOnline | AT | maintenance |
| KitchenCarMenu | JP | 503 three times |
| O:der ToGo | JP | script-rendered |
| Oddle | SG | 403 |
| Appy POS | RO | bot check |
| Happy Gastro | HU | JavaScript only |
| Hatches Up | GB | no site found |
| FoodTrucker | CA | no site found |
| a few new local finds | various | see the file |

**Countries where nothing eligible exists** (on own sites, today):
- **LI, MT:** nothing (Storekit lists Malta but prices only in GBP).
- **BG, LU, PT, EE, LV:** only SumUp's generic web shop.
- **RO:** only EUR-priced tools.
- **No food-truck tool with a price was found in:** HK, SG, ES, GR, PT, FI, HR, SI, BG, the Baltics, CY, MT, NO or SE (except WEIQ).

## 6 · Decisions for Dominic

1. **How should the "not relevant" marks reach the database?** `lib/data-import/research.ts` refuses any `lifecycle` other than
   active or candidate, and it never lowers an existing competitor. The marks in §5 are therefore in the file's `not_relevant` list
   for the reviewer, and are not imported.
   - **Options:**
     - (a) Admin marks them by hand in Pricing check;
     - (b) a small importer change: a `not_relevant` instruction key that sets `lifecycle`, with a harness, as its own prompt;
     - (c) a migration.
   - **Recommendation: (b)**, so the evidence stays with the change.
2. **Five stored "not relevant" competitors look eligible now:** Qromo (IT), Yoveletta (CH), WEIQ (SE), Digitaste (BE) and Superb (NO).
   The importer won't bring them back (same limit). Their answers and plans are in the file, but stay hidden while they are not
   relevant. Same options as 1.
3. **The corrected prices (§4) won't be applied by the import**: it skips a plan whose name the competitor already has.
   - **Options:**
     - (a) a migration that supersedes the stored plans named in §4 and inserts today's (run by me, shown first);
     - (b) Admin edits them;
     - (c) let the checker find them. Its `planColsOf` has the unit defect from compare-status-1 §1.4, so it could repeat the 100×
       error, and it can't run before 1 Dec.
   - **Recommendation: (a)**, after the unit defect is fixed.
4. **Weak fits — count them or not:**
   - SumUp's generic online shop with in-store pickup: GR, NO, FI, HR, SI, CY, LT, EE, LV, LU, PT, BG — it decides 7 countries;
   - Anolla, a booking tool with food pre-ordering (HR, SI);
   - Square AU (no pickup wording);
   - Order Tiger's presence in IE and GI (Ireland never named; Gibraltar only on a franchise page);
   - Wongnai POS (TH, via LINE MINI Eats).
   - **Recommendation:** count SumUp only where it is the single fallback and a food tool also exists; leave Anolla out.
5. **Spevdo (GR)**: its prices load from api.spevdo.gr, which the permission guard refused, and I didn't work around that. If
   you allow that one read-only request on the vendor's own API, Greece gets a second solid tool.
6. **RO:** count EUR prices for a country whose vendors price in EUR (4SaleFood, MenuForma)? The publish rule needs RON today.

## 7 · Files, checks and SQL

**Files:**
- **`data/compare-research-1/competitors.json`:** the importer's format, as `data/competitor-wtt-1`.
  - It has 114 competitors, each with `request_check: true`, its `check_urls`, 14 quoted answers, `focus` and `lifecycle` active.
  - Stored ones carry their own id, so the import matches by id. New ones get stable ids; a candidate is matched by name or domain
    and upgraded.
  - It also has 254 plans (218 priced) and 143 entries.
  - The keys `evidence`, `not_relevant`, `unreadable` and `not_needed` are for the reviewer; the import ignores them.
- **`lib/data-import/importer.ts`:** registered fifth, "Comparison research (24 Nov)".
- **`scripts/competitor-wtt-1.cjs`, re-pinned by name:** "registered last; the first three files unchanged" became "registered
  fourth; the first three files unchanged" (`DATA_FILES.length >= 4`), because a fifth file is now registered.
- **`docs/compare-research-1/`:** `agent-brief.md`, `build.cjs` (build + validate, no database), `stored-ids.json` (full ids read
  once), `summary.py` / `summary.md`, and `raw/*.json` (the evidence).

**Checks:**
- `node docs/compare-research-1/build.cjs --check`: the importer's `researchProblems` plus the 100× guard pass.
- Harnesses: competitor-wtt-1 42/0, competitor-check-1 227/0, competitor-features-2 79/0.
- ESLint clean on the changed files; `tsc --noEmit` clean.

**SQL (read-only SELECTs, Supabase MCP):**
```sql
-- stored competitors and their current plans for each researched country
with cc as (select unnest(array['AU','HK','MY','TH','DK','PL','GR','US','FR','GB','BR','DE','NL','JP','IT','IE','ES','NZ','SG','CZ','CA','AT','CH','BE','HU','RO','SE','NO','PT','FI','HR','SI','BG','EE','LV','LT','CY','LU','MT','LI','GI','AE']) code),
rows as (select cc.code, c.id, c.name, c.website, coalesce(c.focus,'-') focus, c.lifecycle,
  (select string_agg(p.plan_name||'='||coalesce((p.monthly_minor/100.0)::numeric(12,2)::text,'hidden')||' '||p.currency, '; ' order by p.plan_name)
     from public.competitor_plans p where p.competitor_id=c.id and p.country_code=cc.code and p.superseded_at is null) plans
 from cc join public.competitors c on exists (select 1 from public.comparison_entries e where e.competitor_id=c.id and e.country_code=cc.code)
   or exists (select 1 from public.competitor_plans p where p.competitor_id=c.id and p.country_code=cc.code and p.superseded_at is null))
select code, string_agg(name||' | '||coalesce(website,'-')||' | '||focus||' | '||lifecycle||' | '||left(id::text,8)||' | '||coalesce(plans,'no plan'), E'\n' order by name)
from rows group by code order by code;
-- the 75 candidates (id prefix, name, website)
select string_agg(left(id::text,8)||' '||name||' '||coalesce(website,'-'), E'\n' order by name) from public.competitors where lifecycle='candidate';
-- every competitor's full id, for the build's matching (stored-ids.json)
select json_object_agg(left(id::text,8), json_build_object('id', id, 'name', name, 'website', website, 'lifecycle', lifecycle, 'focus', focus))::text from public.competitors;
```

**Not done:** no import, no database write, no checker run, no `gh workflow run`, no deploy, no push, no `.env` file opened.

## 8 · Flags

- Nothing in the brief arrived garbled.
- **No contradiction stopped the work.** Three places needed a reading, each recorded above:
  - "monthly price in MAJOR units" against the importer's minor-unit field: major in the research, converted for storage (§1);
  - "the importer's own value" for not relevant, which doesn't exist (§6.1);
  - your two chat messages that relaxed "one request at a time" to two, then three, agents in parallel (§1).
- The data file imports only after main moves forward to this branch and is pushed (Dominic deploys).
- **Publishing also needs:**
  - the publish step's AE crash fixed (compare-status-1 §1.3);
  - either the simpler rule, or the checker's double-confirmed prices. The checker's workspace is limited until 1 Dec, and its unit
    defect needs fixing first.
