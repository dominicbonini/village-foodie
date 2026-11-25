# compare-status-1 — the comparison pages and the competitor checker: what we have, what is live, and why the rest isn't

**24 November 2026, read 10:15–11:00 UTC · READ-ONLY · nothing changed** (SELECT-only database queries through the Supabase MCP, `gh run list` /
`gh run view`, public GETs of hatchgrab.com, and public pages of 14 competitor websites)

## 0 · The short version

- **5 comparison pages are public: FR, IE, IT, JP and US.** Each went live through auto-publish; `country_settings.comparison_status` is
  still `off` for all five. **Three of them show fewer competitors than the evaluation chose:**
  - **IE shows HatchGrab alone**;
  - IT and US show 1 competitor;
  - FR shows 2 of its 3;
  - JP shows its 2.
- **🔴 Cause, found in this review: the publish step has crashed after every checker run since 10 Nov.** It stops at the United Arab Emirates
  (AE):
  - The step writes each country's result with an upsert. For AE, that insert is refused by the table's own rule `comparison_publish_never_ae`.
    Postgres checks a row's CHECK constraints before it resolves the conflict, so the column default (`auto_publish = true`) breaks the rule.
  - Every run's log says so: `publish step failed … violates check constraint "comparison_publish_never_ae"`.
  - The loop dies at AE. So:
    - **166 switched-on countries have never been evaluated**;
    - the "automatically verified" marks that a page reads have not been updated since 7 Nov;
    - no publish events have been written since 7 Nov, so the Monday summary has nothing to send;
    - the pages are never told to refresh.
- **The checker itself has been stopped since 20 Nov:**
  - 20–21 Nov: "Your credit balance is too low";
  - 22–23 Nov: "You have reached your specified workspace API usage limits. You will regain access on **2026-12-01** at 00:00 UTC".
  - **So yes, it is limited until 1 December, like the FAQ translator.**
  - Its own cost record for November is **$35.42** (47 runs). That is under its $90 cap, so the limit that bit was not the checker's own.
- **Data:** 208 competitors.
  - 122 are active: 42 food-truck tools, 72 restaurant tools ("nearest local"), 4 market tools, 1 pop-up, and 3 with no website.
  - 75 are candidates (69 from Gemini's research and the 6 big POS players), and 11 are not relevant.
  - They sit on comparison entries in only **36 of the 210 switched-on countries**; 174 countries have nothing.
- **Eligibility:**
  - **Aphelios is not a food-truck ordering system.** It is a general UK business suite (POS, stock, CRM) with a QR menu-ordering module, and
    has no pre-ordering or time slots (§3.2). It is stored as a food-truck tool.
  - Of the GB list, 4 tools are food-truck ordering systems: Ordea, What The Truck, Order Tiger and Perkss (Perkss is EPOS-led). Beat The
    Queue couldn't be read. Grafterr, Aphelios and NOQ are not.
- **Another defect found:** some price findings carry the amount in minor units, which the code then multiplies by 100 again. **14 stored
  plans are 100× too high**, for example The Foody Gram "Starter" $15,900 a month and Eatch "Fondateur" €4,450 a month. None of them is on
  a public page today (§1.4).
- **What it would take:**
  - Under today's rule (2 competitors whose price both checks confirmed), no further country is publishable now.
  - Under "2 eligible competitors with a price on their own site; features may be 'not stated'", **13 countries** qualify before the
    eligibility screen (§6).
  - A discovery pass to find 2–4 eligible tools for the other ~196 countries would cost roughly **$25–75 of API**, and **1–6 weeks** at
    today's caps (§6.3). That doesn't include the big POS players' per-country reads, about $80 more.

## 1 · Countries

### 1.1 How a page goes live (from the code, `lib/comparison-publish.ts` `evaluateCountry`, `lib/comparison-flags.ts`)

- A competitor in a country is **publishable** when all of these hold:
  - it is counted (active; a candidate also needs its features verified) and has a website;
  - its check failures are under 2;
  - its shown plan is `counted` with a monthly price, not unclear, in the country's currency, with a source on its own site;
  - the price was checked within its interval + 30 days (120 days);
  - **both checks confirmed that exact price** (a `monthly_price` finding with `second_check = 'confirmed'` and its quote found on the
    page), or Admin verified the plan.
- **Features are not required.** A row only hides when it is unchecked for a shown competitor.
- A country is **live** when:
  - it has a comparison page;
  - auto-publish is on and Admin hasn't set it off;
  - **at least 2 competitors are shown** (at most 4);
  - it is not AE, which never publishes.
- Public = `country_settings.comparison_status = 'live'`, OR (auto-publish on AND `comparison_publish.auto_live` AND not off). **A country
  with no `comparison_publish` row can't go live automatically.**
- Stored state (24 Nov):
  - `comparison_status`: DE `admin`, every other switched-on country `off`;
  - 44 `comparison_publish` rows: 41 last evaluated on 23 Nov, BR on 12 Nov, SG and AE on 7 Nov;
  - no row for the other 166 countries.

### 1.2 The table (36 countries with entries, sorted by how close each is)

- **Competitors:** the comparison entries for that country (counted competitors in brackets where fewer).
- **Priced:** counted entries whose shown plan has a monthly price.
- **Features:** current answers for the checked features: known (yes / no / partial) / not stated (not mentioned / unknown).
- **Deep:** entries deep- (or semi-deep-) checked since the 3 Nov deep request / total, with the last date.
- **Pass:** entries whose quick pass covered this country, with the last date.

| # | Country | Page status, and why | Competitors | Priced | Features known / not stated | Deep | Pass |
|---|---|---|---|---|---|---|---|
| 1 | **FR** | **Published** (auto, since 10 Nov). Evaluation shows Eatch, Heustach, Restaurant-internet.com; **the public page shows only Eatch and Heustach** (marks stale, §1.3) | 8 | 8 | 156 / 156 | 8/8 · 19 Nov | 8 · 4 Nov |
| 2 | **JP** | **Published** (auto, since 10 Nov). Mobaregi, Chuzmonster; public shows both | 8 | 5 | 38 / 274 | 0/8 | 8 · 6 Nov |
| 3 | **IT** | **Published** (auto, since 10 Nov). Evaluation shows DineEasy, xMenu; **public shows only xMenu** | 5 (4) | 4 | 48 / 108 | 4/5 · 13 Nov | 5 · 4 Nov |
| 4 | **US** | **Published** (auto, since 10 Nov). Evaluation shows Food Truck ONE, Owner.com; **public shows only Food Truck ONE** | 22 | 15 | 189 / 669 | 0/22 | 20 · 6 Nov |
| 5 | **IE** | **Published** (auto, since 19 Nov). Evaluation shows Order Tiger, Click & Collection; **public shows HatchGrab alone** | 4 | 3 | 79 / 77 | 4/4 · 19 Nov | 4 · 5 Nov |
| 6 | GB | Off — 1 of 2 needed (Ordea). Aphelios and Grafterr have *another* plan confirmed, not the one shown; Flipdish, Order Tiger, Perkss, Slerp and Storekit have no confirmed price; Beat The Queue, Weevi and What The Truck are "unclear"; Hatches Up and Eventifood have no website; Yoello has no price; NOQ is not relevant | 15 (14) | 9 | 158 / 388 | 13/15 · 19 Nov | 13 · 6 Nov |
| 7 | DE | Admin-only (status `admin`) — 1 of 2 (GASTRODIGITAL). gastro25 and FoodsHero have another plan confirmed; FoxiFood, GastroDok and Bestelltheke are unconfirmed; Jamezz and OrderFront have no price | 8 | 6 | 133 / 179 | 8/8 · 17 Nov | 8 · 3 Nov |
| 8 | NL | Off — 1 of 2 (Qrder). Digitale Menukaart and Bestelly have another plan confirmed; FoodTruck POS and Foodticket are unconfirmed; Vev is unclear; Jamezz has no price | 7 | 5 | 107 / 166 | 7/7 · 17 Nov | 7 · 5 Nov |
| 9 | ES | Off — 1 of 2 (TopEstrellas). pidopago and Cheerfy are unconfirmed; Check and PAYMEZONE are not relevant; FesteaPay and Ordeno have no price | 7 (5) | 3 | 43 / 152 | 5/7 · 9 Nov | 7 · 3 Nov |
| 10 | CZ | Off — 1 of 2 (Menu55). Choice is unconfirmed | 2 | 2 | 18 / 60 | 2/2 · 16 Nov | 2 · 3 Nov |
| 11 | HK | Off — 1 of 2 (VGather). MENU TIGER and Take App are priced in USD, not HKD | 3 | 3 | 24 / 93 | 1/3 · 14 Nov | 3 · 6 Nov |
| 12 | MY | Off — 1 of 2 (Klikit). Take App is in the wrong currency | 2 | 2 | 19 / 59 | 0/2 | 2 · 7 Nov |
| 13 | DK | Off — 1 of 2 (NemTakeAway); only 1 competitor | 1 | 1 | 19 / 20 | 1/1 · 11 Nov | 1 · 3 Nov |
| 14 | PL | Off — 1 of 2 (UpMenu); only 1 competitor | 1 | 1 | 22 / 17 | 1/1 · 11 Nov | 1 · 3 Nov |
| 15 | BR | Off — **not evaluated since 12 Nov** (the AE crash). By my SQL, Simpliza and Food Pronto pass every rule but the exact amount; their confirmed findings carry the amount in minor units (§1.4), so the code would very likely reject both. Goomer and Pedizap have another plan confirmed; 3 are unconfirmed; 3 have no price; OlaClick is in the wrong currency | 11 | 8 | 115 / 314 | 0/11 | 11 · 6 Nov |
| 16 | SG | Off — **not evaluated since 7 Nov**. Oddle and Klikit are unconfirmed; Take App is in the wrong currency | 3 | 3 | 18 / 99 | 0/3 | 3 · 7 Nov |
| 17 | NZ | Off — 0 shown. HungryTrucks' confirmed finding is a promotional $0.99 with no currency; Bopple is unconfirmed; MOBI and Street Food Spot have no price | 4 | 2 | 33 / 123 | 0/4 | 4 · 5 Nov |
| 18 | TH | Off — 0. Klikit has another plan confirmed; MENU TIGER and Take App are in the wrong currency; GloriaFood has no price | 4 | 3 | 44 / 112 | 2/4 · 19 Nov | 4 · 7 Nov |
| 19 | AU | Off — 0. Bopple's shown plan is probably the NZD one; Ordering.co is in the wrong currency; 4 have no price; Where The Truck is not relevant | 7 (6) | 2 | 44 / 190 | 0/7 | 7 · 5 Nov |
| 20 | RO | Off — 0. Choice and MENU TIGER: one unconfirmed, one in the wrong currency | 2 | 2 | 15 / 63 | 2/2 · 16 Nov | 2 · 3 Nov |
| 21 | PT | Off — 0. DineEasy is unconfirmed; MENU TIGER is in the wrong currency | 2 | 2 | 17 / 61 | 2/2 · 14 Nov | 2 · 4 Nov |
| 22 | CA | Off — 0. Food Truck Pub is priced in USD; Moduurn and FoodTrucker have no price; Ritual is not relevant | 4 (3) | 1 | 37 / 80 | 0/4 | 4 · 5 Nov |
| 23 | AT | Off — 0. GASTRODIGITAL is unconfirmed for AT; GastroOnline has no price | 2 | 1 | 14 / 64 | 2/2 · 7 Nov | 2 · 3 Nov |
| 24 | NO | Off — 0. Favrit is unconfirmed; Superb is not relevant | 2 (1) | 1 | 8 / 31 | 1/2 · 12 Nov | 2 · 5 Nov |
| 25 | GR | Off — 0. Spevdo has another plan confirmed | 1 | 1 | 21 / 18 | 1/1 · 15 Nov | 1 · 4 Nov |
| 26 | LI | Off — 0. Pikit is unconfirmed | 1 | 1 | 23 / 16 | 1/1 · 16 Nov | 1 · 4 Nov |
| 27 | FI | Off — 0. Food4you is unconfirmed | 1 | 1 | 19 / 20 | 1/1 · 14 Nov | 1 · 4 Nov |
| 28 | CY | Off — 0. Wiiz Eat is unconfirmed | 1 | 1 | 12 / 27 | 1/1 · 15 Nov | 1 · 4 Nov |
| 29 | HU | Off — 0. Choice is unconfirmed | 1 | 1 | 12 / 27 | 1/1 · 16 Nov | 1 · 3 Nov |
| 30 | SK | Off — 0. Choice is unconfirmed | 1 | 1 | 11 / 28 | 1/1 · 16 Nov | 1 · 4 Nov |
| 31 | EE | Off — 0. Choice is unconfirmed | 1 | 1 | 11 / 28 | 1/1 · 16 Nov | 1 · 4 Nov |
| 32 | LT | Off — 0. Choice is unconfirmed | 1 | 1 | 4 / 35 | 1/1 · 16 Nov | 1 · 4 Nov |
| 33 | LV | Off — 0. Choice is unconfirmed | 1 | 1 | 2 / 37 | 1/1 · 16 Nov | 1 · 4 Nov |
| 34 | SE | Off — 0. Qopla has no price; WEIQ is not relevant | 2 (1) | 0 | 0 / 39 | 1/2 · 12 Nov | 2 · 4 Nov |
| 35 | CH | Off — 0. Its only entry, Yoveletta, is not relevant | 1 (0) | 0 | — | 1/1 · 7 Nov | 1 · 3 Nov |
| 36 | BE | Off — 0. Its only entry, Digitaste, is not relevant | 1 (0) | 0 | — | 0/1 · 3 Nov | 1 · 3 Nov |

**Nothing yet (174 switched-on countries; no comparison entry, and never evaluated):**
AD AE AG AI AL AM AO AR AS AW AX AZ BA BD BF BG BH BI BJ BL BM BN BO BQ BS BT BW BZ CC CF CK CL CO CR CV CW CX DJ DM DO DZ EC EG ER ET
FJ FK FM FO GA GD GE GF GG GI GL GM GN GP GQ GT GU GW GY HN HR ID IL IM IN IS JE JM JO KG KH KI KM KN KR KW KY KZ LA LC LK LR LS LU MA
MC MD ME MF MG MH MK MN MO MP MQ MR MS MT MU MV MW MZ NA NC NE NF NG NI NP NR NU OM PA PE PF PG PK PM PN PR PW PY QA RE RS SA SB SC
SH SI SJ SL SM SN SR ST SV SX SZ TC TD TG TJ TK TL TM TN TO TR TT TV TW TZ UA UG UY UZ VA VC VG VI VU WF WS YT ZA ZM ZW.

- **AE never** gets a page (`NO_COMPARISON_PAGE`, `NEVER_AUTO`, and the table rule). It has 4 competitors with plans: Spot, Ordable, Zyda,
  GloriaFood.
- Six countries in the deep queue have no entries at all: BG, HR, GI, LU, MT and SI. Their deep check has nothing to read.
- ID and IN each have one competitor with a plan (Take App, GloriaFood) but no entry.
- Mexico (MX) has 6 entries but is switched off, so it isn't counted here.

**Totals:**
- **Published:** 5 (FR, IE, IT, JP, US), three of them showing fewer than 2 competitors today.
- **Publishable now but not live:** 0.
- **Nearly there** (1 publishable): 9 (GB, DE, NL, ES, CZ, HK, MY, DK, PL). BR and SG are unknown (not evaluated since 12 and 7 Nov).
- **Competitors, none publishable:** 20.
- **Nothing yet:** 174.

### 1.3 Why the public pages show fewer competitors than chosen

`runPublish` (`lib/comparison-publish-run.ts`) works in this order:
1. decides pending findings (works);
2. evaluates and upserts `comparison_publish` for each switched-on country;
3. writes the "automatically verified" marks on entries, plans and answers (lines 192–205);
4. writes the events;
5. asks the pages to refresh.

Step 2 throws at AE, so steps 3–5 never run. The page shows only entries, plans and answers carrying an `auto_verified_at` mark. Those marks
are as the one-off run of 7 Nov left them.

The run logs:

| Run (UTC) | Publish log |
|---|---|
| 10 Nov to 19 Nov, every run | `publish: findings — N accepted, … publish step failed (the check results are saved): [comparison-publish-store] save comparison_publish: new row for relation "comparison_publish" violates check constraint "comparison_publish_never_ae"` |
| 20–23 Nov | the run fails before publishing (all competitors failed; see §4) |

Which countries got evaluated depends on the order the rows come back in. Today that is the original 44, minus AE, BR and SG.

### 1.4 Prices stored 100× too high (found while checking confirmations)

- **The defect:** `planColsOf` converts `found.amount` from major to minor units (×100). The extractor sometimes returns the amount already in
  minor units:
  - Simpliza "a partir de R$79,00" came back as `amount: 7900`;
  - Nomad Start "59€ /mois" as `5900`;
  - whereas Nomad Pro "99€ /mois" came back as `99`.
- **Counts:** 74 of the 618 `monthly_price` findings have an amount ≥ 1,000 in a currency where that is implausible.
- **Two effects:**
  - those findings never "confirm" a price;
  - where one was accepted, the stored price is 100× too high.

The 14 current plans affected (stored minor units):

| Competitor | Plan | Stored |
|---|---|---|
| The Foody Gram | Starter / Growth | 1,590,000 / 1,990,000 USD |
| Order Tiger | EPOS / Online Ordering + EPOS | 490,000 / 1,090,000 USD |
| Klikit | Core | 190,000 SGD |
| Ordinalo | Modulo: WhatsApp Automation | 190,000 EUR |
| Wiiz Eat | Own app | 850,000 EUR |
| Eatch | Fondateur | 445,000 EUR |
| Beau Camion | Vitrine | 290,000 EUR |
| Digitale Menukaart | Menu | 120,000 EUR |
| FoodTruck POS | Starter | 129,900 EUR |
| VGather | three plans | 120,000 – 290,000 HKD |

None of these is the plan shown on a public page today (FR shows Eatch at €89 HT and Heustach at €0, both correct).

## 2 · Competitors

**Where they came from:**
- **Every active competitor came from the pricing research of 20–23 Oct:**
  - the country research files: compare-de-1, seo-geo-1 and the per-country research;
  - What The Truck, added 4 Nov by its own research file.
- **Candidates:**
  - 69 from Gemini's research (migration 20261044);
  - 6 big POS players from `data/global-players/competitors.json`.
- **None was found by the quick pass or a deep check.** The checker doesn't discover tools; it only re-reads stored ones.

**Verification:**
- **No competitor is verified by hand**: 0 manual entry, plan or feature verifications.
- "auto" below means an entry carries an automatic-verification mark (stale since 7 Nov, §1.3).

**Dates:**
- **price** = the newest current plan's `checked_on`;
- **features** = the last `competitor_feature_checks.checked_on`;
- **presence** = the last availability ("sold here") finding, else the last check.

### 2.1 Active (122)

| Competitor | Website | Focus | Countries | Verified | Price | Features | Presence |
|---|---|---|---|---|---|---|---|
| Aphelios | apheliossoftware.com | food-truck | GB | auto | 9 Nov | 9 Nov | 9 Nov |
| Beat The Queue | beatthequeue.co.uk | food-truck | GB | no | 23 Oct | 9 Nov | 9 Nov |
| Beau Camion | beaucamion.fr | food-truck | FR | no | 17 Nov | 17 Nov | 17 Nov |
| Best Food Trucks (BFT) | customers.bestfoodtrucks.com | food-truck | US | no | 9 Nov | 7 Nov | 9 Nov |
| Digitale Menukaart | digitalemenukaart.nl | food-truck | NL | no | 16 Nov | 16 Nov | 16 Nov |
| Eatch | eatch.app | food-truck | FR | auto | 18 Nov | 18 Nov | 18 Nov |
| Food Pronto | foodpronto.com.br | food-truck | BR | no | 9 Nov | 9 Nov | 9 Nov |
| Food Truck ONE (Food Truck OS) | foodtruckone.com | food-truck | US | auto | 9 Nov | 9 Nov | 9 Nov |
| Food Truck Pub | foodtruck.pub | food-truck | CA US | no | 7 Nov | 9 Nov | 9 Nov |
| Foodticket | foodticket.nl | food-truck | NL | no | 23 Oct | 16 Nov | 16 Nov |
| FoodTruck POS | foodtruckpos.nl | food-truck | NL | auto | 17 Nov | 17 Nov | 17 Nov |
| FoodTrucker – Find & Order | apps.apple.com | food-truck | CA | no | 23 Oct | 9 Nov | 9 Nov |
| GastroOnline & Winorder | gastro-online.at | food-truck | AT | no | 23 Oct | 7 Nov | 3 Nov |
| Goodfynd | goodfynd.com | food-truck | US | no | 9 Nov | 9 Nov | 9 Nov |
| Hatches Up | — (no website) | food-truck | GB | no | 20 Oct | — | — |
| HungryTrucks | hungrytrucks.com | food-truck | NZ | no | 7 Nov | 9 Nov | 9 Nov |
| KitchenCarMenu | kitchencarmenu.com | food-truck | JP | no | 23 Oct | 9 Nov | 9 Nov |
| Liefersoft | liefersoft.de | food-truck | DE | no | 23 Oct | 6 Nov | 6 Nov |
| Moonrise | ordermoonrise.com | food-truck | US | no | 23 Oct | 9 Nov | 9 Nov |
| Nomad (nomadcaisse.fr) | nomadcaisse.fr | food-truck | FR | no | 18 Nov | 18 Nov | 18 Nov |
| Ordea | ordea.uk | food-truck | GB | auto | 7 Nov | 9 Nov | 9 Nov |
| Ordeno App | foodtruckya.com | food-truck | ES | no | 23 Oct | 8 Nov | 9 Nov |
| Ordering.co | ordering.co | food-truck | AU US | no | 23 Oct | 9 Nov | 9 Nov |
| Place à emporter | placeaemporter.fr | food-truck | FR | no | 18 Nov | 18 Nov | 18 Nov |
| Qrder | qrder.app | food-truck | NL | no | 17 Nov | 17 Nov | 17 Nov |
| Restolabs | restolabs.com | food-truck | US | no | 15 Nov | 15 Nov | 15 Nov |
| Simpliza | simpliza.com.br | food-truck | BR | no | 9 Nov | 9 Nov | 9 Nov |
| SisFood | sisfood.com.br | food-truck | BR | no | 23 Oct | 9 Nov | 9 Nov |
| Soften Food | softensistemas.com.br | food-truck | BR | no | 23 Oct | 9 Nov | 9 Nov |
| Spot (Drive Thru Pickup app) | hospitalitynewsmag.com ⚠️ (a news site, not theirs) | food-truck | AE | no | 23 Oct | 12 Nov | 12 Nov |
| Street Food Spot | streetfoodspot.nz | food-truck | NZ | no | 23 Oct | 9 Nov | 9 Nov |
| StreetFoodFinder | streetfoodfinder.com | food-truck | US | no | 23 Oct | 12 Nov | 12 Nov |
| Truckfindr | truckfindr.com | food-truck | US | no | 23 Oct | 12 Nov | 12 Nov |
| Truckons | truckons.com | food-truck | FR | no | 19 Nov | 19 Nov | 19 Nov |
| Truckster | apps.apple.com | food-truck | US | no | 23 Oct | 13 Nov | 13 Nov |
| TuMenúDigital | tumenudigital.mx | food-truck | MX | no | 9 Nov | 9 Nov | 9 Nov |
| Vev | vev.co | food-truck | NL | no | 13 Nov | 17 Nov | 17 Nov |
| VexMenu | vexmenu.com | food-truck | BR | no | 7 Nov | 13 Nov | 13 Nov |
| VirtualLine | virtualline.com.br | food-truck | BR | no | 23 Oct | 14 Nov | 14 Nov |
| What The Truck | whatthetruck.ai | food-truck | GB | no | 7 Nov | 9 Nov | 9 Nov |
| Where's The Foodtruck | wheresthefoodtruck.com | food-truck | US | no | 23 Oct | 14 Nov | 14 Nov |
| モバレジ (Mobaregi) | mobaregi.jp | food-truck | JP | auto | 7 Nov | 9 Nov | 9 Nov |
| Achil | achil.com | restaurant | FR | no | 17 Nov | 17 Nov | 17 Nov |
| AdvaNceD IoT (Device Agency) | and-iot.jp | restaurant | JP | no | 9 Nov | 9 Nov | 9 Nov |
| Anota AI | anota.ai | restaurant | BR | no | 23 Oct | 16 Nov | 16 Nov |
| Aparece | aparece.mx | restaurant | MX | no | 9 Nov | 9 Nov | 9 Nov |
| Bestelltheke | bestelltheke.de | restaurant | DE | no | 7 Nov | 9 Nov | 9 Nov |
| Bestelly | bestelly.nl | restaurant | NL | no | 16 Nov | 16 Nov | 16 Nov |
| Bopple | bopple.com | restaurant | AU NZ | auto | 7 Nov | 9 Nov | 9 Nov |
| Cardápio Web | cardapioweb.com | restaurant | BR | no | 23 Oct | 16 Nov | 6 Nov |
| Cheerfy Shop | en.cheerfy.com | restaurant | ES | no | 9 Nov | 8 Nov | 9 Nov |
| Choice | choiceqr.com | restaurant | CZ EE HU LT LV RO SK | no | 23 Oct | 16 Nov | 16 Nov |
| ChowNow | get.chownow.com | restaurant | US | no | 16 Nov | 16 Nov | 16 Nov |
| Click & Collection | clickandcollection.com | restaurant | IE | no | 19 Nov | 19 Nov | 19 Nov |
| DineEasy | dineeasy.app | restaurant | IT PT | no | 12 Nov | 13 Nov | 13 Nov |
| Favrit | web.favrit.com | restaurant | NO | no | 12 Nov | 12 Nov | 12 Nov |
| Flipdish | flipdish.com | restaurant | GB IE | auto | 19 Nov | 19 Nov | 19 Nov |
| Food4you | food4you.fi | restaurant | FI | no | 14 Nov | 14 Nov | 14 Nov |
| FoodsHero | foodshero.de | restaurant | DE | no | 7 Nov | 5 Nov | 5 Nov |
| FoxiFood | foxifood.com/de | restaurant | DE | no | 9 Nov | 9 Nov | 9 Nov |
| funfo | lycbiz.com | restaurant | JP | no | 7 Nov | 9 Nov | 9 Nov |
| gastro25 | gastro25.de | restaurant | DE | no | 9 Nov | 9 Nov | 9 Nov |
| GASTRODIGITAL | gastro.digital | restaurant | AT DE | auto | 7 Nov | 9 Nov | 5 Nov |
| GastroDok | gastrodok.de | restaurant | DE | auto | 9 Nov | 9 Nov | 9 Nov |
| GloriaFood | gloriafood.com | restaurant | IE TH (plans also GB, AE, IN) | no | 19 Nov | 19 Nov | 4 Nov |
| Goomer | goomer.com.br | restaurant | BR | no | 7 Nov | 6 Nov | 6 Nov |
| Grafterr | grafterr.com | restaurant | GB | no | 7 Nov | 7 Nov | 7 Nov |
| Heustach | heustach.fr | restaurant | FR | auto | 18 Nov | 18 Nov | 18 Nov |
| HungryHungry | hungryhungry.com | restaurant | AU | no | 7 Nov | 9 Nov | 9 Nov |
| Jamezz | jamezz.com | restaurant | DE NL | no | 7 Nov | 17 Nov | 17 Nov |
| JMENU | jmenu.it | restaurant | IT | no | 12 Nov | 12 Nov | 12 Nov |
| Klikit | klikit.io | restaurant | MY SG TH | auto | 9 Nov | 8 Nov | 9 Nov |
| Liven | liven.love | restaurant | AU | no | 9 Nov | 8 Nov | 9 Nov |
| MENU TIGER | menutiger.com | restaurant | HK PT RO TH | no | 14 Nov | 14 Nov | 14 Nov |
| Menu55 | menu55.cz | restaurant | CZ | auto | 7 Nov | 9 Nov | 9 Nov |
| Menufy | restaurant.menufy.com | restaurant | US | no | 9 Nov | 9 Nov | 9 Nov |
| MOBI (formerly Mobi2Go) | mobihq.com | restaurant | NZ | no | 23 Oct | 9 Nov | 9 Nov |
| Moduurn | capterra.ca ⚠️ (a review site, not theirs) | restaurant | CA | no | 23 Oct | 9 Nov | 9 Nov |
| NemTakeAway | nemtakeaway.dk | restaurant | DK | no | 11 Nov | 11 Nov | 11 Nov |
| O:der ToGo (Showcase Gig) | saas.imitsu.jp ⚠️ (a listing site) | restaurant | JP | no | 23 Oct | 9 Nov | 9 Nov |
| Oddle | uob.com.sg ⚠️ (a bank's page) | restaurant | SG | no | 23 Oct | 9 Nov | 9 Nov |
| OlaClick | pricing.olaclick.app | restaurant | BR MX | no | 9 Nov | 9 Nov | 9 Nov |
| Ordable | itsordable.com | restaurant | AE | no | 23 Oct | 9 Nov | 9 Nov |
| Order Tiger | ordertiger.com | restaurant | GB IE | no | 19 Nov | 19 Nov | 19 Nov |
| Order Up! (moving to Nomni) | orderup.com.au | restaurant | AU | no | 23 Oct | 10 Nov | 10 Nov |
| OrderFront | orderfront.de | restaurant | DE | no | 7 Nov | 6 Nov | 6 Nov |
| Ordinalo | ordinalo.com | restaurant | IT | no | 12 Nov | 12 Nov | 12 Nov |
| Outbites | outbites.com | restaurant | US | no | 10 Nov | 10 Nov | 10 Nov |
| Owner.com | owner.com | restaurant | US | no | 10 Nov | 10 Nov | 10 Nov |
| Pedizap | pedizap.com.br | restaurant | BR | no | 10 Nov | 10 Nov | 10 Nov |
| Perkss | perkss.co.uk | restaurant | GB | no | 7 Nov | 4 Nov | 3 Nov |
| pidopago | pidopago.com | restaurant | ES | no | 9 Nov | 9 Nov | 9 Nov |
| Pikit | pikit.ch | restaurant | LI | no | 23 Oct | 16 Nov | 16 Nov |
| Plick | plick.com.mx | restaurant | MX | no | 23 Oct | 9 Nov | 9 Nov |
| Qopla | qopla.com | restaurant | SE | no | 23 Oct | 12 Nov | 12 Nov |
| QRico | qrico.mx | restaurant | MX | no | 11 Nov | 11 Nov | 11 Nov |
| Restaurant-internet.com | restaurant-internet.com | restaurant | FR | auto | 18 Nov | 18 Nov | 4 Nov |
| Slerp | slerp.com | restaurant | GB | no | 7 Nov | 4 Nov | 4 Nov |
| Snackpass | snackpass.co | restaurant | US | no | 11 Nov | 11 Nov | 11 Nov |
| Spevdo | spevdo.gr | restaurant | GR | no | 15 Nov | 15 Nov | 15 Nov |
| Storekit | storekit.com | restaurant | GB | auto | 7 Nov | 4 Nov | 4 Nov |
| Take App | take.app | restaurant | HK MY SG TH (pass also ID) | no | 7 Nov | 9 Nov | 9 Nov |
| The Foody Gram | thefoodygram.com | restaurant | US | no | 12 Nov | 12 Nov | 12 Nov |
| TopEstrellas (Pedidos) | topestrellas.com | restaurant | ES | auto | 9 Nov | 9 Nov | 9 Nov |
| UpMenu | upmenu.com | restaurant | PL | no | 11 Nov | 11 Nov | 11 Nov |
| VGather self-ordering | dtspp.cyberport.hk ⚠️ (a government catalogue page) | restaurant | HK | no | 9 Nov | 9 Nov | 9 Nov |
| Weevi | weevi.com | restaurant | GB | no | 7 Nov | 5 Nov | 5 Nov |
| Wiiz Eat | wiizeat.com | restaurant | CY | no | 15 Nov | 15 Nov | 15 Nov |
| xMenu | xmenu.it | restaurant | IT | auto | 13 Nov | 13 Nov | 13 Nov |
| Yoello | yoello.com | restaurant | GB | no | 23 Oct | 5 Nov | 5 Nov |
| Zay-OS (Zayos) | zay-os.com | restaurant | US | no | 14 Nov | 14 Nov | 6 Nov |
| Zyda | zyda.com | restaurant | AE | no | 23 Oct | 14 Nov | 14 Nov |
| テイクイーツ (Take Eats) | take-eats.jp | restaurant | JP | no | 7 Nov | 15 Nov | 15 Nov |
| どこでも注文くん (Chuzmonster) | lme.jp | restaurant | JP | auto | 15 Nov | 15 Nov | 15 Nov |
| Hotplate | hotplate.com | pop-up | US | no | 7 Nov | 7 Nov | 7 Nov |
| FesteaPay | foodtruckya.com ⚠️ (a directory) | market | ES | no | 23 Oct | 8 Nov | 8 Nov |
| Homegrown | findhomegrown.com | market | US | no | 23 Oct | 6 Nov | 6 Nov |
| ISSUE PANDA (3bitter) | saas.imitsu.jp ⚠️ (a listing site) | market | JP | no | 23 Oct | 7 Nov | 7 Nov |
| Qhop | qhop.com.au | market | AU | no | 23 Oct | 11 Nov | 11 Nov |
| EasyEats | — (no website) | none | US | no | 20 Oct | — | — |
| Eventifood | — (no website) | none | GB | no | 20 Oct | — | — |
| RapidOrderz | — (no website) | none | US | no | 20 Oct | — | — |

"restaurant" = focus `nearest_local`, category `restaurant`. The ⚠️ websites are not the vendor's own site. That matters, because the
publish rule requires a source on the competitor's own domain.

### 2.2 Candidates (75): never counted, never shown

Every one of them has a **pending** classification finding. None was ever decided, because the automatic decision only covers competitors
with an entry in an auto-publish country, and candidates have none. Fields: name · website · its latest classification (date) · countries.

- **The 6 big POS players** (from the global-players file; no plans stored; each "pos_or_card_reader", 18–19 Nov): Clover · clover.com;
  Lightspeed · lightspeedhq.com; Square · squareup.com; SumUp · sumup.com; Toast · pos.toasttab.com; Zettle (PayPal) · zettle.com. Their
  per-country reads are what the deep runs of 15–19 Nov were spending on (Clover and Lightspeed in every run's notes).
- **Classified food-truck ordering (pending):**
  - apetitio · apetitio.pl (10 Nov, PL);
  - Asky · asky.ai (5 Nov, AU);
  - Menuella · menuella.com (18 Nov);
  - Menuthere · menuthere.com (6 Nov, DE US);
  - Vroomeat · vroomeat.fr (19 Nov);
  - XPRIO · xprio.com (15 Nov).
- **Classified restaurant ordering (pending):** 4SaleFood (SK), Appy POS (RO), Bistriqx, bonappli, CloudOrders (CA), Creavo Order (FI),
  DigiCommerce, Dine360, DISH, EatSelf, ExtendaGO Ordin, Feadys, FoodChow, Foodeliver, Foodlz, Fritzy, Gustoco, iButler (NL), iShopo (CA),
  LivePepper (FR), MenuForma (IT RO SK), ord.to, Ordeliya, Orderly, QRM.hu, Restaumatic, restauracja.online (PL), Restomax, Software Food
  Good, TapTasty.
- **Classified POS / card reader (pending):** ABS POS, Epos Now, eSystem, GoPOS / GoOrder, Happy Gastro, leafsystems, MetaPOS, NewPOS,
  Ordero, Orsys, POSbistro, Rent-a-Shop, Sapaad, StandMágus, SwissPOS, TapaPOS, Taptouch POS, Tilby, Waiterio.
- **Classified not relevant (pending):** Food Truck Concept, Ounti, Zegashop.
- **Never classified** (only the 1–2 Nov pass read): CliqMenu, Flash Order, INFI, L'Addition, Order Local, Preorder (order-pre.com), Regulars,
  RestApp, SmakSpace, Wollopit, Y wait.

### 2.3 Not relevant (11)

Check (ES), Digitaste (BE), NOQ (GB), PAYMEZONE (ES), Point (MX), Qromo (IT), Superb (NO), WEIQ (SE), Yoveletta (CH) are all POS or card
readers. Ritual (CA) and Where The Truck (AU) are marketplaces. Each was decided 2–9 Nov. Ten of them still have a comparison entry, where
they count for nothing.

## 3 · Eligibility: does its own website show online ordering or pre-ordering for food trucks?

**What the stored data can show:**
- the `ahead` feature (order ahead / pick a time);
- the `preorder` feature (pre-order for a later date);
- any stored quote naming food trucks.

⚠️ **Many `preorder = yes` answers carry no quote** (most of the active list). They are the 23 Oct research migrated into the feature table (migration 20261048),
not something the checker read on the site. So they are weak evidence.

### 3.1 From the stored findings

**Quoted evidence of ordering ahead on their own site, and they mention food trucks:**

| Competitor | Quote | URL |
|---|---|---|
| Best Food Trucks | "All of our food trucks have Order Ahead enabled" | customers.bestfoodtrucks.com |
| Beat The Queue | "supports time slots and capacity controls designed for street food" | beatthequeue.co.uk/article/food-truck-time-slots-guide/ |
| Digitale Menukaart | "De gast bestelt vooraf…" | digitalemenukaart.nl/oplossingen/qr-menu-bestellen |
| Eatch | "Commande à l'avance, heure de retrait au choix" | eatch.app |
| Food Truck Pub | "Customers can order today, for future dates." | foodtruck.pub |
| Foodticket | "De bestelling wordt ingepland, per tijdslot" | foodticket.nl (and "Voor één of meerdere Foodtrucks", foodticket.nl/foodtruck/) |
| FoodTrucker | "Order ahead, pay in the app, pick up at the window" | apps.apple.com/ca/app/foodtrucker-find-order/… |
| Goodfynd | "place orders ahead" | goodfynd.com |
| HungryTrucks | "place order-ahead requests so your meal is ready exactly when you arrive" | hungrytrucks.com |
| Qrder | "Klant kiest zelf een datum." | qrder.app ("Foodtruck bestelsysteem…", qrder.app/foodtruck) |
| Restolabs | "Customers can order ahead and pick up." | restolabs.com |
| Truckfindr | "Customers can order food anytime of the day or future pickup." | truckfindr.com |
| Truckons | "avant même d'arriver au camion" | truckons.com |
| Vev | "Customers can pick their own day and time" | vev.co |
| What The Truck | "…pick a time to collect." | whatthetruck.ai/features/festivals |
| Achil | "le client peut choisir un créneau à l'avance" | achil.com/web/food-truck/… |
| GloriaFood | "schedule a specific fulfillment time for pickup…" | gloriafood.com ("food trucks to accept orders online…") |
| Grafterr | "customers can place orders for the future" | grafterr.com |
| Jamezz | "Plan menus, pricing, and inventory for multiple upcoming events in advance." | jamezz.com/de/branchen/foodtrucks |
| Order Tiger | "Let customers order days or weeks ahead for events…" | ordertiger.com/online-ordering-system-for-food-trucks |
| gastro25 | "Geplante Bestellungen (Vorbestellung)" | gastro25.de/funktionen |
| FoxiFood | "Vorbestellen in der Warteschlange" | foxifood.com/de/anwendungsfalle/food-truck/ |
| UpMenu | "Zamawianie z wyprzedzeniem" | upmenu.com ("Food Truck Ordering System", /features/) |
| Outbites | "pickup windows" | outbites.com/solutions/food-truck-online-ordering/ |
| Restaurant-internet.com | "Recevez les commandes pendant les heures de fermetures…" | restaurant-internet.com (a /foodtrucks page) |

**Quoted ordering-ahead evidence, no food-truck mention stored:**

| Competitor | Quote |
|---|---|
| Ordering.co | "for a specific date and time" |
| Moonrise | "Customers order from their phone… They pick it up." |
| Hotplate | preorder "drops" |
| Bopple | "Scheduled pre-ordering" |
| Cardápio Web | agendamentos |
| Cheerfy | "schedule a future order" |
| Choice | "pre-ordering meals", offices only |
| Food4you | "Ennakkoon tilaaminen" |
| funfo | 予約テイクアウト |
| GASTRODIGITAL | "auch Wochen im Voraus" |
| Goomer, Pedizap | agendamento |
| Heustach | "Au créneau que vous choisissez" |
| JMENU | "anticipo di 4 giorni" |
| MENU TIGER | "Order Scheduling" |
| NemTakeAway | "hvor langt ud i fremtiden" |
| Ordinalo | "limiti per fascia oraria" |
| pidopago | "con varios días de antelación" |
| Plick | "Pedidos programados" |
| Slerp | "order 2 days ahead" |
| Snackpass | "order and pay before they arrive" |
| Spevdo | "Scheduled orders" |
| Storekit | "Scheduled pre-orders" |
| The Foody Gram | "Pre-orders" |
| TopEstrellas | "pedido anticipado" |
| Weevi | "days in advance" |
| Bestelltheke | "auch für den nächsten Tag" |
| Mobaregi | 事前に注文 |
| Take Eats | 受け渡し日を管理 |
| Chuzmonster | 予約販売 |
| Cheerfy, Plick | (as above) |

**Ordering for food trucks quoted, but no order-ahead quote:**

| Competitor | Quote | URL |
|---|---|---|
| Simpliza | "Site de pedidos próprio para seu Food Truck" | simpliza.com.br/food-truck.php |
| Ordeno App | "permite que tus clientes hagan sus pedidos y pagos" | foodtruckya.com |
| Place à emporter | "Solution de commande en ligne pour food trucks" | placeaemporter.fr |
| GastroDok | "GastroDok für Imbisse und Foodtrucks" | gastrodok.de/loesungen/imbiss-foodtruck |
| FoodsHero | "Foodtrucks und Cloud Kitchens" | foodshero.de/online-bestellsystem |
| DineEasy | "Per i food truck" | dineeasy.app/it/solutions/food-trucks |
| Perkss | "food truck software" | perkss.co.uk/food-truck-management-system/ |
| GastroOnline | "…Imbisse, Foodtrucks und Lieferdienste" | gastro-online.at |
| Nomad | "logiciel Nomad pour food truck" (a till) | nomadcaisse.fr/logiciel-food-truck |

**No stored evidence of online ordering or pre-ordering.** Both `ahead` and `preorder` are unknown or "not mentioned", or only a quoteless
legacy "yes":

| Group | Competitors |
|---|---|
| Order-ahead not stated | **Aphelios**; **Food Truck ONE** (stored quote: "Food truck directory"; ⚠️ it is on the public US page); FoodTruck POS; TuMenúDigital; AdvaNceD IoT; Favrit; Liven; Order Up!; Take App; VGather (on HK's evaluation); Wiiz Eat; **xMenu** (⚠️ on the public IT page); Klikit (on MY's evaluation); Qopla; Qhop; Menu55 ("Take Away nebo rozvoz" only; on CZ's evaluation) |
| No website | Hatches Up, EasyEats, Eventifood, RapidOrderz |
| A quoteless legacy "yes" only | Liefersoft, KitchenCarMenu, Ordea, SisFood, Soften Food, Spot, Street Food Spot, StreetFoodFinder, Truckster, VirtualLine, Anota AI, Aparece, Bestelly, ChowNow, Click & Collection (⚠️ on IE's evaluation), Flipdish, HungryHungry, Menufy, MOBI, Moduurn, O:der ToGo, Oddle, OlaClick, Ordable, OrderFront, Owner.com (⚠️ on US's evaluation), Pikit, QRico, Yoello, Zay-OS, Zyda, FesteaPay, Homegrown, ISSUE PANDA |

- Where's The Foodtruck has `preorder = no` but a home-page quote: "Find a food truck near you and order ahead".
- **There is no eligibility test in the code.** A competitor's category comes from the focus the research or checker gave it.
  "Food-truck tool" is not checked against an ordering feature.

### 3.2 Aphelios (apheliossoftware.com)

- **What the stored data says:**
  - focus and category `food_truck`; active since 23 Oct;
  - plans £29.99 / £69.99 / £199.99 a month;
  - the plan note reads: "UK food-truck/mobile-catering POS with QR order-and-pay; pre-order/collection slots not confirmed";
  - its only food-truck quote is a list of venue types: "Perfect for restaurants, cafes, pubs, takeaways, food trucks, market stalls, and
    events" (/digital-menu-ordering-uk);
  - `ahead` and `preorder` are unknown;
  - `qr` = yes ("Free digital menu and QR ordering for UK restaurants"); `stock`, `staff` and `reports` = yes or partial.
- **Its public website (read 24 Nov):** the home page is "All-in-One Business Software UK | POS, Inventory & CRM". Its products are
  inventory, POS, barcode scanning, CRM, invoicing, team chat, tasks, an office suite and an SEO toolkit. The ordering part is a "Digital Menu
  & QR Ordering" module: "Customers browse your menu, add items to their cart, and pay from their phone"
  (apheliossoftware.com/digital-menu-ordering-uk). There is no time slot, scheduled order or pre-order feature, and no food-truck-specific
  flow.
- **Plainly: Aphelios is not a food-truck ordering system.** It is a general small-business POS / stock suite with a QR menu. It should not be
  in the GB food-truck table. It is currently GB's best-priced "food-truck" entry. Its Pro and Enterprise prices are double-confirmed, so
  making Pro its shown plan would publish it.

### 3.3 Every GB competitor, a quick look at its own site (24 Nov)

| Competitor | What its site shows | Order ahead? |
|---|---|---|
| **Ordea** | **Food-truck ordering / pre-ordering**: "a branded ordering system with linked stock control, capacity-managed timeslots" (ordea.uk) | Yes: "collection and delivery slots with per-slot capacity limits" |
| **What The Truck** | **Food-truck ordering / pre-ordering**: "Take online pre-orders and walk-up orders at the hatch" (whatthetruck.ai) | Yes: "Each gig has collection slots with limits you set" |
| **Order Tiger** | Restaurant online ordering **with a food-truck page**: "Take pre-orders before you park up, cut the queue at the hatch…" (ordertiger.com/online-ordering-system-for-food-trucks) | Yes: "Pickup time slots and capacity limits" |
| **Perkss** | **Food-truck system, EPOS-led**: "Can customers order before reaching the van? Yes. Pre-ordering helps…" (perkss.co.uk/food-truck-management-system/) | Yes (pre-order); no slots seen |
| **Weevi** | Restaurant online ordering; it has a /food-trucks section (not read) | "Scheduled ordering" listed |
| **Flipdish** | Restaurant online ordering, no food-truck mention: "Online ordering for restaurants & takeaways" (flipdish.com/gb/online-ordering) | Not found |
| **Slerp** | Restaurant online ordering, no food-truck mention (slerp.com) | Yes: "click and collect, pre-order and catering" |
| **Storekit** | Restaurant online ordering, no food-truck mention, home page only: "Pickup, delivery, catering, kiosks, QR order & pay…" | Yes: "Order ahead, collect at the counter" |
| **Yoello** | Restaurant ordering (QR table ordering first), a street-food testimonial only | Yes: "Customers can select a pick-up time" |
| **GloriaFood** (GB plan, no GB entry) | Restaurant online ordering that names food trucks: "…coffee shops, or food trucks to accept orders online" | Yes: "Order for later". ⚠️ The site states **end of life on 30 April 2027** |
| **Grafterr** | **EPOS / till first**: "ePOS for Food Trucks"; QR order & pay is one module (grafterr.com/uk/industries/food-trucks-epos) | Not found on that page (the stored quote says yes) |
| **Beat The Queue** | Couldn't read: the home page returns an empty, script-rendered page. Stored evidence says food-truck time slots (its own article) | Stored: yes |
| **Aphelios** | **Not** a food-truck ordering system (§3.2) | No |
| **NOQ** (not relevant) | Event POS and payments for festival operators: "A centralised point of sale system…" (noqgroup.com) | No |
| Hatches Up, Eventifood | No website stored, so never shown | — |

**GB in one line:**
- **food-truck ordering systems:** Ordea, What The Truck, Order Tiger, Perkss (and probably Beat The Queue);
- **general restaurant ordering:** Flipdish, Slerp, Storekit, Weevi, Yoello, GloriaFood;
- **not ordering systems:** Aphelios, Grafterr, NOQ.

## 4 · The checker

**Settings** (`competitor_check_settings`, last changed 3 Nov 13:20 UTC):

| Setting | Value |
|---|---|
| paused | false |
| daily / monthly cap | $8.00 / $90.00 |
| models (deep, routine, pass: extractor and verifier) | all `claude-haiku-5-5` |
| deep_per_day | 15 |
| deep_time_limit_seconds | 1800 |
| deep_requested_at | 3 Nov 13:20 UTC |
| **deep_country** | **PT** (16th of 36 in the queue) |
| deep_queue | GB DE CZ AT CH BE ES HU RO PL DK SE NO IT SK **PT** FI HR SI BG EE LV LT GR CY LU MT LI GI NL FR IE CA NZ AU US |
| deep progress | the countries before PT are done. Some later ones (FR, IE, CY, EE, FI, GR, LI, LT, LV) were also deep-read through the 73-competitor **semi-deep** request (`semi_deep`: status "started" 9 Nov, "core+commercial without pages"). Nothing in US, JP, BR, AU, NZ, CA, SG, MY was deep-checked |
| **quick pass** | **finished**: pass_requested_at 29 Oct, pass_country null, pass_batch null; 208 competitors have a pass record, dated 3–7 Nov |
| pass settings | pass_per_day 40; 3 fetches, 1 search and 6,000 page tokens each |
| re-check intervals | `check_interval_days` 90; `tier_intervals`: commercial 90, core 90, secondary 180 |
| prices table | Haiku $0.10 / $0.50 per Mtok, Sonnet $2 / $10, web search $0.01 (checked 25 Oct) |

**The last 10 runs** (GitHub "Competitor check" workflow and `competitor_check_runs`):

| Started (UTC) | GitHub | Mode | Checked | Cost | Result |
|---|---|---|---|---|---|
| 23 Nov 10:40 | ❌ failure | deep | 0 | $0.00 | every competitor failed: "You have reached your specified workspace API usage limits. You will regain access on 2026-12-01 at 00:00 UTC" |
| 22 Nov 09:42 | ❌ failure | deep | 0 | $0.00 | the same workspace-limit error |
| 21 Nov 09:40 | ❌ failure | deep | 0 | $0.00 | "Your credit balance is too low to access the Anthropic API" |
| 20 Nov 09:58 | ❌ failure | deep | 0 | $0.00 | the same credit-balance error |
| 19 Nov 10:13 | ✅ success | deep | 15 | $1.19 | done; publish step failed (AE) |
| 18 Nov 10:03 | ✅ success | deep | 15 | $1.26 | done; publish step failed (AE) |
| 17 Nov 10:37 | ✅ success | deep | 15 | $1.48 | done; publish step failed (AE) |
| 16 Nov 09:31 | ✅ success | deep + routine | 14 + 3 | $1.50 + $0.12 | done (Clover's findings malformed twice); publish failed (AE) |
| 15 Nov 09:15 | ✅ success | deep + routine | 15 + 4 | $1.20 + $0.22 | done; publish failed (AE) |
| 14 Nov 08:56 | ✅ success | deep + routine | 15 + 4 | $1.41 + $0.17 | done; publish failed (AE) |

No 24 Nov run had started by 10:40 UTC, when I checked.

**Spend:**
- the checker's own record: **November $35.42** (47 runs, 673 competitor checks) and October $3.19;
- against its $90 monthly cap and the **$100 allowance**: within both.

**The Claude workspace:**
- **Yes, it is limited until 1 December**, by the API's own message on 22–23 Nov.
- On 20–21 Nov the organisation's credit balance had run out before that.
- 🔶 **UNVERIFIED (Console only):**
  - which limit that is;
  - why it was reached when the checker's own record is $35;
  - whether the workspace or the organisation limit is shared with other use, such as the FAQ translator. The FAQ translator also waits for
    1 Dec (Open items 36).

## 5 · What is checked how often (as built, against Dominic's rules)

| What | As built | Dominic's rule | Matches? |
|---|---|---|---|
| **Price** (monthly, per-order fee, card fee, term, set-up, trial — the "commercial" tier) | every **90 days** (`tier_intervals.commercial` 90; the competitor's next check follows its most frequent tier). A price is **taken down** if it hasn't been checked for 90 + 30 = 120 days. The routine check second-checks every monthly price | prices every 90 days | ✅ yes |
| **Features** | **core every 90 days, secondary every 180** (off never). The checker asks **39 checked features**: 31 shown (all or some countries) **plus 8 that are never shown** (custfee, igmsg, loyalty, payattruck, paymethods, private, reports, tips). A routine check asks the due ones (≈36 of 42 per check, brand-kit-1); a deep check asks every one | features only key differentiators | ❌ **no** — it asks every checked feature, including 8 hidden ones and the 25-feature core |
| **Presence** ("sold in this country") | asked **only in a deep check of a country** (once per deep request), for multi-country competitors. **No schedule.** Routine checks read a multi-country competitor as a whole | — (no rule stated) | — |
| **Classification** (is it relevant, what kind of tool) | once, when a candidate is first read in a pass. ⚠️ **Never decided for candidates** (§2.2) | — | — |

## 6 · What it would take (recommendations only; nothing changed)

### 6.1 Under the current rule

**No other country is publishable today.** The stored evaluation of 41 countries shows ≥2 only for the five already live.

After the AE crash is fixed:
- BR and SG would be evaluated again, and so would the 166 countries with no row. Those 166 have no competitors, so they gain nothing.
- **BR**: Simpliza and Food Pronto would pass only if their prices are re-confirmed with correct amounts, so probably 0 until then.
- The five live pages would show their chosen 2–3 competitors. IE would show Order Tiger and Click & Collection instead of none.

### 6.2 If the rule were "2 eligible competitors with a price; features may be 'not stated'"

- **Features are already allowed to be "not stated"** today: they never block publishing. The real difference is dropping "price confirmed by
  both checks" and adding "eligible".
- Counting entries that are counted, have their own website, have a stated monthly price in the country's currency and are not marked unclear
  (no double confirmation), **13 countries reach 2 or more**:

| Country | Competitors |
|---|---|
| US | 13 |
| FR | 8 |
| GB | 8 |
| BR | 7 |
| DE | 6 |
| NL | 5 |
| JP | 5 |
| IT | 4 |
| IE | 3 |
| ES | 3 |
| NZ | 2 |
| SG | 2 |
| CZ | 2 |

- After the eligibility screen (§3), some drop: GB loses Aphelios and Grafterr but keeps 6; SG's Klikit and CZ's Menu55 have no ordering
  evidence. **Likely 11–12 countries**, each needing its "eligible" judgement written down.
- **Seven more need just one more priced, eligible tool:** AU, HK, MY, TH, DK, PL, GR.

### 6.3 A quick discovery pass for every switched-on country without 2 eligible tools

**Scope:** 210 switched-on countries − the 13 above − AE = **196 countries**.

**The approach:**
- First local food-truck ordering tools, then the big POS players that sell there.
- 🔴 **Discovery isn't built.** The checker reads only stored competitors. It would need a new "discover" mode, or a sequential research run
  in Claude Code (§86's rule: one request at a time, with pauses) whose output goes in through the research importer, as What The Truck did.

**Cost estimates (API, Haiku, at the stored prices):**

| Step | Estimate | Subtotal |
|---|---|---|
| Discovery | 3–5 searches ($0.03–0.05) + ~6 pages read (~40k input tokens ≈ $0.004) + a small answer ≈ **$0.05–0.10 a country** | **$10–20** |
| Checking what it finds (2–4 tools a country, say ~590) | a pass-style read through the Batch API ≈ $0.02 each, or a deep read ≈ $0.09 each (measured: $1.19–1.50 per 15 in the 14–19 Nov deep runs) | **$12–53** |
| **Total** | | **≈ $25–75**, inside one month's $90 cap |
| Big POS players per country (6 players × ~150 countries where they might sell) | ~900 country reads × ~$0.09 | **≈ $80 more** |

Many of the 196 are small territories (AS, AX, BL, CC, CX, NF, NU, PN, SJ, TK…) where nothing will be found.

**Time:** the API can't run before **1 Dec** (§4). After that:
- at the $8 daily cap, about **4–10 nights**;
- at pass_per_day 40, about **15 nights**;
- at deep_per_day 15, about **40 nights**.

A Claude Code research run, sequential with pauses, would take about **1–2 days of runs** and costs no API credit.

**Recommendation:**
- Do it for the countries that matter first: the 8 built-ahead countries (GB US IE AU NZ CA FR DE), then the European queue and the top traffic
  countries, about 40.
- Leave the micro-territories for later.

### 6.4 Recommendations, in order (each is a separate prompt; none was done)

1. **Fix the publish step's AE crash.** Skip AE, or write AE's row with `auto_publish: false`. Then re-run the publish step once, without a
   checker run. That restores the auto marks, events, the Monday email and refreshes, and evaluates all 210 countries. IE, IT, US and FR then
   show the competitors they were chosen with.
2. **Decide whether IE, IT and US should stay live meanwhile.** Today IE shows HatchGrab alone. Admin › Countries "Off" is recorded and
   wins. **Decision for Dominic.**
3. **Fix the amount units** (the extractor schema and `toMinor`, or a units field). Correct the 14 plans that are 100× too high, then
   re-confirm prices: BR, Nomad and others would then confirm.
4. **Eligibility:** reclassify Aphelios and Grafterr (and look at Food Truck ONE on the public US page, and xMenu on the IT page, whose
   stored data shows no ordering). Add an "offers online / pre-ordering" test, from `ahead` / `preorder` with a quote, to "publishable".
   **Decision for Dominic: the eligibility rule.**
5. **GB is one Admin choice from live.** Set Pro as the shown plan for **Grafterr**: its Free forever and Pro prices are double-confirmed.
   Grafterr is an EPOS, though, and Aphelios (Pro is double-confirmed for it too) is not eligible. **Better:** let the next price check confirm
   **Order Tiger** (£59), Perkss or What The Truck (unclear today), which are real food-truck ordering tools.
6. **Candidates:** decide the 75 pending classifications. The automatic decision never reaches them, including the 6 POS players and the 6
   "food-truck ordering" candidates.
7. **Features:** untick the 8 hidden-but-asked features. Consider trimming the core to the key differentiators:
   ahead / preorder, capacity, schedule, whatsapp, social, kds, offline, walkup, vans, domain, monthly / perorder / cardfee.
8. **Websites that aren't the vendor's own** (Spot, Moduurn, Oddle, VGather, O:der ToGo, ISSUE PANDA, FesteaPay; Truckster and FoodTrucker
   are App Store pages): their prices can never meet "a source on its own site".
9. **Console:** check which limit stopped the checker on 22 Nov, and whether the checker's computed cost ($35.42) matches the Console's
   figure.

## 7 · SQL run (all read-only), and other reads

```sql
-- schema of the comparison / checker tables
select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols from information_schema.columns
 where table_schema='public' and table_name in ('competitors','competitor_plans','comparison_entries','comparison_publish',
   'comparison_publish_events','competitor_feature_values','competitor_feature_checks','competitor_check_runs','competitor_check_settings')
 group by 1 order by 1;
-- checker settings
select id, paused, daily_cap_usd, monthly_cap_usd, deep_per_day, check_interval_days, deep_requested_at, extractor_model, verifier_model,
  deep_country, deep_queue, pass_extractor_model, pass_verifier_model, pass_per_day, pass_requested_at, pass_country, pass_max_fetches,
  pass_max_searches, pass_max_page_tokens, pass_batch, max_output_tokens, deep_time_limit_seconds, tier_intervals, pass_fetch_help,
  updated_at, updated_by from public.competitor_check_settings;
select (select string_agg(k || '=' || left(v::text, 200), ' | ') from jsonb_each(semi_deep) as e(k,v)) as semi_deep, prices::text
  from public.competitor_check_settings;
-- runs and spend
select id, mode, trigger, started_at, finished_at, competitors_checked, cost_usd, stopped_reason, left(coalesce(notes,''),160)
  from public.competitor_check_runs order by started_at desc limit 14;
select date_trunc('month', started_at)::date, count(*), round(sum(cost_usd)::numeric,2), sum(competitors_checked)
  from public.competitor_check_runs group by 1 order by 1;
select started_at, substr(notes, strpos(notes, 'message'), 330) from public.competitor_check_runs where started_at > '2026-11-19' order by 1;
-- countries and publishing
select count(*) total, count(*) filter (where enabled) enabled /* … comparison_status counts, publish row counts, samples */ from public.country_settings;
select p.country_code, cs.comparison_status, p.auto_publish, p.auto_live, p.admin_off, p.live_since::date, p.evaluated_at::date,
  (select string_agg(x->>'name', ', ') from jsonb_array_elements(p.shown) x) from public.comparison_publish p
  left join public.country_settings cs using (country_code) order by p.auto_live desc, 1;
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.comparison_publish'::regclass;
select at::date, kind, count(*) from public.comparison_publish_events group by 1,2 order by 1 desc;  -- all 5,685 at 7 Nov 21:40
-- per-country entries, prices, deep and pass (two queries), the per-entry reason classifier, features known/not stated,
-- countries without entries, plans without entries (as run in the session; each joins comparison_entries → competitors →
-- the entry's current plan, and monthly_price findings with second_check = 'confirmed' and quote_in_page)
-- competitors: the active list, candidates and not-relevant with their latest classification, and the evidence query
-- (ahead / preorder answers with quotes; quotes matching food truck | mobile cater | foodtruck | キッチンカー | camion | imbiss)
-- the amount-units check
select (select count(*) from public.competitor_check_findings where field='monthly_price' and (found->>'amount')::numeric >= 1000
          and coalesce(found->>'currency','') not in ('JPY','HUF','KRW','IDR','CLP','COP','ISK','VND')),
       (select string_agg(c.name||' '||p.plan_name||' '||p.monthly_minor||' '||p.currency, '; ') from public.competitor_plans p
          join public.competitors c on c.id=p.competitor_id where p.superseded_at is null and p.monthly_minor >= 100000
          and p.currency not in ('JPY','HUF','KRW','IDR','CLP','COP','ISK','VND','INR','THB','CZK','MXN','PHP'));
```

**Other reads:**
- **`gh`:** `gh run list --workflow competitor-check.yml --limit 30` and `gh run view <id> --log`, grepped for the publish line on every run
  since 27 Oct.
- **Public pages:** `https://www.hatchgrab.com/sitemap.xml`, `/llms.txt` and the five `.json` twins.
- **Competitor websites:** the 14 sites in §3.3, home page plus up to 2 pages each, one request at a time.
- **Code read:** `lib/comparison-publish.ts`, `-publish-run.ts`, `-publish-store.ts`, `-flags.ts`, `lib/pricing-check.ts`,
  `lib/admin/competitor-check-actions.ts`.

## 8 · Flags

- Nothing in the prompt arrived garbled.
- **No contradiction, with one note:** the brief asks for the SQL "shown inline in chat", and also for "only a two-line summary" in chat. As
  in earlier reports, the chat gives the two lines plus the key SQL blocks; the full set is in §7.
- **Nothing was changed:**
  - no file other than this report;
  - no git write, no migration, no checker run, no `gh workflow run`, no deploy, no push;
  - no .env file opened.
- **Estimates:**
  - "Publishable" counts outside the 41 evaluated countries (BR, SG) and the relaxed-rule counts are my SQL approximations of
    `evaluateCountry`. They are not the code's own output, and they skip the exact-amount and own-domain tests.
  - Cost and time figures are estimates from the checker's own measured costs.
