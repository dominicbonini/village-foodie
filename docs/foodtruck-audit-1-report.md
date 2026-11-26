# checker-cadence-1 + foodtruck-audit-1

**26 November 2026 · branch `france-vat-1` · migrations `20261143` (`a97be783`) and `20261144` (`eb14dfaf`) · not pushed, not deployed**

Every SQL statement is in `docs/foodtruck-audit-1/sql.txt`. The Competitor check workflow stays disabled. No `.env` file was opened.
There was no code change and no manual edit. Part 2 wrote nothing.

## Summary

- **Part 1a.** The settings are now core features every 180 days and a $50 monthly cap. Everything else is unchanged. The migration was
  pre-flighted (md5 proved no other column changed), applied and verified.
- **Part 1b.** Chuzmonster's own page states no price, so its plan is now unclear.
  - ⚠️ **JP dropped off the live list (75 → 74)**: Mobaregi is now its only priced tool.
  - Verify: shown = marked everywhere; AE false/false.
- **Part 1c.**
  - Every checkable active competitor is due within 90 days of its last check, or gets a date on the first run.
  - 2 can never be checked (Hatches Up, RapidOrderz; neither is shown).
  - Expected spend is **≈ $3.5–7.6 a month**.
  - The busiest day is **7 Feb 2027 with 15 due**. The daily quota is 5, so it clears within days.
- **Part 2.** Of the 47 food_truck-focus tools shown or marked, **13 are class A** (built for food trucks), 34 are class B and 0 are class C.
  Of the 74 live countries:
  - **S2** (A or B only, at least 2) keeps **33**;
  - **S3** (A only) keeps **12**;
  - **S4** (at least 1 A, restaurant tools labelled) keeps **19**.

---

## Part 1 · the checker

### 1a · Settings (`20261143_checker_cadence_1.sql`)

| Setting | Before | After (verified) |
|---|---|---|
| tier_intervals | commercial 90 · core **365** · secondary 365 | commercial 90 · core **180** · secondary 365 |
| check_interval_days | 90 | 90 |
| daily_cap_usd | 3 | 3 |
| monthly_cap_usd | **90** | **50** |
| everything else | — | unchanged: `settings_other_md5` 5a5cdd89… before = inside; deep_per_day 0, pass off, semi-deep done |

The pre-flight (`--preflight-checker`, rolled back) passed every check:

- the other settings columns unchanged;
- every competitors column unchanged;
- plans, entries and answers unchanged;
- after the ROLLBACK, everything exactly as before.

### 1b · Chuzmonster JP (`20261144_chuzmonster_unclear.sql`)

- **Its own page** (https://order.yapp.li/takeout, read once) says only «Takeoutは固定料金なので、モバイルオーダーの売上が増えても料金は一切変わりません。»
  That's a fixed fee with **no amount**.
- **So plan `5050d0c5` "Takeout" (¥10,000, from the third-party article lme.jp) is marked unclear**, with a note.
- Its pre-flight (`--preflight`, rolled back) passed: unclear plans 93 → 94 inside the transaction, everything restored after.
- **Why it had counted:** its stored website is `https://lme.jp` (the article site), so the third-party source passed the own-source test.
  Its real own site is `order.yapp.li`.
  - The competitor's website / check_urls should be corrected, with Dominic's yes. That isn't done here, because it is a competitor-row
    change nobody asked for.
- **Publish dry run (rolled back):** live 75 → 74 (JP: "only 1 eligible competitor with a price"); events +2; marked 211 → 210.
- **Publish:** the same; revalidate 200.
- **Verify:**
  - **74 live**: AD AR AT AU BE BG BH BL BR CA CH CL CY CZ DE DK EC EE EG ES FI FR GB GF GG GI GP GR HK HR HU ID IE IM IN IT JE KW LI LT LU
    LV MA MF MQ MV MY NG NL NO NZ OM PA PL PM PR PT QA RE RO SA SE SG SI SK SM TH TR TW UA US VA YT ZA;
  - shown ≠ marked **0**;
  - AE **false/false**;
  - JP auto_live false.
- ⚠️ **Flag:** you asked for "mark unclear, then publish", and §91 requires the vendor's own price, so I published. Taking JP's page down
  was a consequence the prompt didn't mention. Admin's switch can't bring it back while the price is unconfirmed.

### 1c · Coverage (read-only)

**How the checker works** (`lib/competitor-check`):

- A **routine check covers one competitor across all its countries**. It asks the prices and only the features that are **due**: core
  every 180 days, secondary every 365. So feature checks ride on routine checks.
- Each competitor's next check is 90 days after its last (the most frequent tier).
- The daily quota is ceil(227 / 90) + 2 catch-up = **5**.
- A competitor with neither a website nor check_urls is filtered out.

**Every active competitor (227):**

| Status | Count | Notes |
|---|---|---|
| Checked before, next check ≤ last check + 90 days | **144** | none over 90 days |
| Never checked yet, with a next date | 52 | all due by 16 Feb 2027 |
| Never checked, `next_check_at` null | 29 | `spreadFirstDates` gives them a date on the first run, spread over 90 days |
| Overdue today | 1 (Digitaste, 4 Nov) | checked on the first run after enabling |
| **Never checkable** (no website, no check_urls) | **2** | **Hatches Up**: not shown (a GB entry and a counted plan, but no source, so the publish leaves it out). **RapidOrderz**: not shown. |
| Checkable, but only app-store links (no own domain to quote) | 2 | FoodTrucker – Find & Order, Truckster: not shown |

**Expected monthly spend,** at the measured costs in `competitor_check_runs`:

- routine **$0.046** per competitor (19 runs, 154 checks);
- deep (every feature) **$0.101** (20 runs, 288 checks);
- quick pass $0.009.

| Case | Checks a month | Cost |
|---|---|---|
| Prices only | 225 checkable ÷ 90 days × 30 ≈ 75 | 75 × $0.046 ≈ **$3.5** |
| Every routine check also asks every feature (upper bound) | 75 | 75 × $0.101 ≈ **$7.6** |
| **Expected** (core features on every 2nd routine check, secondary on every 4th) | 75 | **≈ $5–6** |

- That is well within the **$50** monthly cap.
- The daily **$3** cap never binds: 5 checks × $0.101 ≈ $0.51 a day.
- The 29 first-run competitors and any newly added features add a few cents.

**The busiest day, 4 Jan – 31 Mar 2027: 15 due on 7 Feb 2027.**

- The other days over 4: 3 Feb 6 · 5 Feb 5 · 6 Feb 7 · 8 Feb 5 · 9 Feb 8 · 10 Feb 8 · 11–13 Feb 5 each.
- The cause is the kept dates of competitors without counted plans, on top of the stagger.
- At 5 a day, 1–16 Feb (85 due, 80 slots) builds a backlog of about 17 that clears by about 18 Feb. That's a delay of a few days, against
  the stagger's smallest margin of 40 days.

---

## Part 2 · the food-truck audit (read-only)

### 2a · Shown competitors per live country (focus; how many are food_truck)

`ft` = shown food_truck tools; `n` = shown tools. Focus: **[ft]** food_truck, [nl] nearest_local (restaurant), [pos] till.

| CC | Shown | ft/n |
|---|---|---|
| AD BL GF GP MF MQ PM RE YT | Beau Camion [ft] · Nomad [ft] · Place à emporter [ft] · Eatch [ft] | 4/4 |
| FR | Nomad [ft] · Place à emporter [ft] · Beau Camion [ft] · Eatch [ft] | 4/4 |
| AR | Fudo [ft] · Ojapo [nl] | 1/2 |
| AT, DE | Liefersoft [ft] · gastro25 [ft] · GastroDok [ft] · FoxiFood [ft] | 4/4 |
| AU | Y wait [ft] · Square [pos] | 1/2 |
| BE | FoxiFood [ft] · Payli [ft] · Restomax [ft] | 3/3 |
| BG | FoxiFood [ft] · Menuto [nl] | 1/2 |
| BH, KW, QA | Ordable [nl] · Zyda [nl] | 0/2 |
| BR | VexMenu [ft] · Food Pronto [ft] | 2/2 |
| CA | iShopo [ft] · Owner.com [nl] | 1/2 |
| CH, LI | Yoveletta [ft] · Rent-a-Shop [ft] | 2/2 |
| CL | Fudo [ft] · Pedix [nl] | 1/2 |
| CY | FoxiFood [ft] · Wiiz Eat [nl] | 1/2 |
| CZ | DISH [ft] · Menu55 [nl] | 1/2 |
| DK | Truckly [ft] · NemTakeAway [nl] | 1/2 |
| EC | OlaClick [nl] · Pedix [nl] | 0/2 |
| EE | FoxiFood [ft] · Jitmeal [ft] | 2/2 |
| EG, OM | Ordable [nl] · Foodics [nl] | 0/2 |
| ES | FoxiFood [ft] · pidopago [nl] | 1/2 |
| FI | FoxiFood [ft] · Food4you [nl] | 1/2 |
| GB | Ordea [ft] · Order Tiger [ft] · Perkss [ft] · Grafterr [ft] | 4/4 |
| GG GI IM JE | Ordea [ft] · Order Tiger [ft] · Grafterr [ft] | 3/3 |
| GR | FoxiFood [ft] · Spevdo [nl] | 1/2 |
| HK | Oddle [nl] · Eats365 [nl] | 0/2 |
| HR, SK | FoxiFood [ft] · DISH [ft] | 2/2 |
| HU | Orderly [ft] · QRM.hu [ft] · StandMágus / OnlineMágus [ft] | 3/3 |
| ID | Klikit [nl] · ESB Order [nl] | 0/2 |
| IE | Order Tiger [ft] · Click & Collection [ft] · FoxiFood [ft] | 3/3 |
| IN | Dinehere [nl] · uEngage [nl] | 0/2 |
| IT | Qromo [ft] · MenuForma [ft] · Software Food Good [ft] · Tilby [ft] | 4/4 |
| SM, VA | Qromo [ft] · MenuForma [ft] · Tilby [ft] | 3/3 |
| LT | FoxiFood [ft] · ared [nl] | 1/2 |
| LU, LV | FoxiFood [ft] · SumUp [pos] | 1/2 |
| MA | Asila [nl] · inyad [nl] | 0/2 |
| MV | Ewity POS [nl] · Qvian [nl] | 0/2 |
| MY | Klikit [nl] · Dinlr [nl] | 0/2 |
| NG | Mylo [nl] · Restorant [nl] | 0/2 |
| NL | Digitale Menukaart [ft] · Qrder [ft] · Foodticket [ft] | 3/3 |
| NO | Favrit [nl] · Superb [nl] | 0/2 |
| NZ | HungryTrucks [ft] · SmakSpace [ft] | 2/2 |
| PA | Take App [nl] · Actib [nl] | 0/2 |
| PL | Frivo [ft] · UpMenu [nl] | 1/2 |
| PR | Menufy [nl] · Take App [nl] | 0/2 |
| PT | FoxiFood [ft] · Sistema Que Vende [nl] | 1/2 |
| RO | 4SaleFood [ft] · MenuForma [ft] | 2/2 |
| SA | Ordable [nl] · Linkin1 [nl] | 0/2 |
| SE | WEIQ [ft] · Vitrina [nl] | 1/2 |
| SG, TW | Klikit [nl] · Oddle [nl] | 0/2 |
| SI | FoxiFood [ft] · Vitrina [nl] | 1/2 |
| TH | Klikit [nl] · StoreHub [nl] | 0/2 |
| TR | İletmen [nl] · Komisyonsuz [nl] | 0/2 |
| UA | Poster [ft] · Vitrina [nl] | 1/2 |
| US | Goodfynd [ft] · Where's The Foodtruck [ft] · Food Truck Pub [ft] · Moonrise [ft] | 4/4 |
| ZA | Bizzfo [nl] · Resto [nl] | 0/2 |

**Totals:**

- **33** countries show only food_truck tools;
- **19** show exactly one food_truck tool beside a restaurant or till tool: AR AU BG CA CL CY CZ DK ES FI GR LT LU LV PL PT SE SI UA;
- **22 show no food_truck tool**: BH EC EG HK ID IN KW MA MV MY NG NO OM PA PR QA SA SG TH TR TW ZA.

### 2b · Is each food_truck tool really a food-truck supplier?

There are 47 food_truck-focus tools, shown or marked. Every one had a food-truck sentence in its stored evidence (`docs/compare-*/raw`),
so **no vendor page was read** for Part 2. The classes:

- **A** = built for, or sold mainly to, food trucks and mobile vendors;
- **B** = a general restaurant / retail tool that lists food trucks as one business type;
- **C** = no food-truck evidence.

| Vendor | Shown (marked only) | Class | Quote | URL |
|---|---|---|---|---|
| Beau Camion | AD BL FR GF GP MF MQ PM RE YT | **A** | «recevez un rapport personnalisé avec les meilleurs emplacements et événements pour votre food truck» | beaucamion.fr/pricing |
| Eatch | AD BL FR GF GP MF MQ PM RE YT | **A** | «Construit avec MrCroques. Pour tous les food trucks.» | eatch.app |
| Food Pronto | BR | **A** | «Descubra food trucks próximos, peça pelo celular…» · «Busque no balcão do truck» | foodpronto.com.br |
| Food Truck Pub | US | **A** | "Built specifically for food trucks, trailers, and carts!" | foodtruck.pub |
| Goodfynd | US | **A** | "The only Point-of-Sale system built for food trucks and mobile vendors" | goodfynd.com |
| HungryTrucks | NZ | **A** | "connects street food lovers with the best mobile kitchens, food trucks, and pop-up vendors in New Zealand" | hungrytrucks.com |
| Moonrise | US | **A** | "the mobile ordering platform for indie food trucks and coffee shops" · "Real-time truck map" | ordermoonrise.com |
| Nomad (nomadcaisse.fr) | AD BL FR GF GP MF MQ PM RE YT | **A** | «Le logiciel créé par un food truck, pour les food trucks.» | nomadcaisse.fr |
| Ordea | GB GG GI IM JE | **A** | "For food trucks, festival stalls, pop-ups & event caterers" | ordea.uk |
| Place à emporter | AD BL FR GF GP MF MQ PM RE YT | **A** | «Food trucks, camions et commerces à emporter» · «Un site de commande en ligne pour les food trucks, les camions à pizza et les restaurants» | placeaemporter.fr |
| Truckly | DK | **A** | «Truckly er bygget specifikt til food trucks.» | truckly.dk |
| Where's The Foodtruck | US | **A** | "Thousands of trucks across the country in one place" · "Send your order before you arrive." | wheresthefoodtruck.com |
| モバレジ (Mobaregi) | (JP) | **A** | «キッチンカーオーダーシステム» | mobaregi.jp |
| 4SaleFood | RO | B | «Pentru food truck afișezi locația de azi, programul și meniul disponibil…» (a food-truck mode in a shop builder) | 4salefood.net/ro |
| Click & Collection | IE | B | "We are dedicated to supporting the food trucks of Ireland!" (a blog post, not a product page) | clickandcollection.com/blog/food-truck |
| Digitale Menukaart | NL | B | «Digitale menukaart voor je foodtruck» | digitalemenukaart.nl/digitale-menukaart-foodtruck |
| DISH | CZ HR SK | B | «Sve za Vaš food truck» / «Digitálne riešenia pre váš food truck» (a sector page) | dish.co/HR/hr/foodtruck-and-foodstand/ |
| Foodticket | NL | B | «Voor één of meerdere Foodtrucks» (a sector page) | foodticket.nl/foodtruck/ |
| FoxiFood | AT BE BG CY DE EE ES FI GR HR IE LT LU LV PT SI SK (MT) | B | «Betreiben Sie Ihren Food Truck smarter.» (a use-case page) | foxifood.com/de/anwendungsfalle/food-truck/ |
| Frivo | PL | B | «Food trucki umiejscowione w ich okolicy to idealne miejsce do zastosowania zamówień z odbiorem.» | frivo.pl/zamowienia-z-odbiorem |
| Fudo | AR CL (CO) | B | «Movilidad para food trucks y ferias» | fu.do/es-cl/delivery/ |
| gastro25 | AT DE | B | «Bestellsystem für Food Trucks — QR-Code scannen, nicht anstehen.» (a sector page) | gastro25.de/fuer/food-truck |
| GastroDok | AT DE | B | «Imbiss und Foodtruck leben von Tempo an der Theke…» | gastrodok.de/loesungen/imbiss-foodtruck |
| Grafterr | GB GG GI IM JE | B | "ePOS for Food Trucks" (one of its industries) | grafterr.com/uk/industries/food-trucks-epos |
| iShopo | CA | B | "Customers order and pay before they even reach the truck." | ishopo.ca |
| Jitmeal | EE | B | its pricing page says the entry offer suits food trucks («для фудтраків і кафе з однією точкою»); thin | jitmeal.com |
| Liefersoft | AT DE | B | «… vom Foodtruck bis zur Sterneküche.» | liefersoft.de |
| MenuForma | IT RO SM VA | B | «… ristoranti, caffetterie … food truck, bar e pub …» | menuforma.com/it |
| Order Tiger | GB GG GI IE IM JE | B | "Built for food trucks" (its food-truck page; a general takeaway ordering system) | ordertiger.com/online-ordering-system-for-food-trucks |
| Orderly | HU | B | «Strandbüfé, food truck vagy nyári terasz…» | orderly.hu |
| Payli | BE | B | «Mobiel kassasysteem en betaalterminal voor foodtrucks.» (a sector page) | payli.be/foodtrucks/ |
| Perkss | GB | B | "Ideal for mobile caterers and street food traders." (a sector page) | perkss.co.uk/food-truck-management-system/ |
| Poster | UA (KZ) | B | "Poster makes running a food truck simple" (a sector page) | joinposter.com/en/business/foodtruck |
| Qrder | NL | B | «Speciaal voor foodtrucks.» (a sector page) | qrder.app/foodtruck |
| QRM.hu | HU | B | «Szűk hely, gyors forgalom, változó helyszínek — a food truck élet más…» | qrm.hu/content/food-truck-oknak |
| Qromo | IT SM VA | B | «Qromo è usato da bar, ristoranti, food truck, negozi, eventi…» | qromo.it |
| Rent-a-Shop | CH LI | B | «Kassensystem für Foodtruck» (a sector page) | rent-a-shop.ch/foodtruck-kassensystem |
| Restomax | BE | B | «Gérer un fast-food ou un food-truck, c'est sport.» | restomax.be |
| Restora POS | (BD) | B | "We provide the best and cheapest food truck POS system" (a sector page) | restorapos.com/food-truck-pos-system |
| SmakSpace | NZ | B | "Perfect for small cafes and food trucks getting started with digital menus." | smakspace.co.nz/pricing |
| Software Food Good | IT | B | «Ristoranti, pizzerie, trattorie, bar, rosticcerie, gastronomie, food truck» | boomsrl.it/sistema-ordini-online-per-ristoranti/ |
| StandMágus / OnlineMágus | HU | B | «Food truck-oknak, Streetfood büféknek» | vendeglato-szoftver.hu |
| Tilby | IT SM VA | B | «L'app di cassa su smartphone e tablet per foodtruck» (a sector page) | tilby.com/it/settori/app-cassa-foodtruck/ |
| VexMenu | BR | B | «Do food truck ao restaurante com salão — o sistema se adapta à sua operação.» | vexmenu.com |
| WEIQ | SE | B | «Mindre restauranger, caféer och foodtrucks som arbetar med take-away…» | weiq.tech/take-away/ |
| Y wait | AU | B | "Online ordering for cafes, takeaways and food trucks." | ywait.com.au |
| Yoveletta | CH LI | B | «Für Gastrobetriebe, Bars, Foodtrucks etc.» | yoveletta.ch/preise-fuer-dein-kassensystem |

**Borderline calls:**

- A sector page ("for food trucks") on a general tool was classed **B**, not A: Order Tiger, Grafterr, Tilby, Payli, DISH, Poster and others.
- **Click & Collection** (blog only) and **Jitmeal** (one tagline) are the weakest B. As C, EE would drop under S2 (IE keeps 2).
- **Place à emporter** and **Moonrise** were classed **A**: food trucks lead their own pitch.
- **Eventifood GB** (not shown: GB's four slots are full) is **A**: «Eventifood is a food van software and ordering platform built
  specifically for UK food trucks» (eventifood.com, stored). It counts below.

### 2c · Scenarios (the 74 live countries)

**Assumptions:**

- non-food_truck tools (nearest_local, pos) count as restaurant / till tools, neither A nor B;
- the line-ups are today's, plus any tool the publish rule already finds eligible but leaves out at 4 a page.
  - That's only Eventifood GB; FR's and US's extra food-truck tools don't change their results.
  - Hidden plans that fail the rule today stay out: Menuthere DE and Vev NL are USD; Hatches Up GB has no source; Food Truck Pub CA,
    Ordering.co AU, Simpliza BR, Poster EE and FoxiFood UA aren't eligible there today.

| Scenario | Stay live | Drop |
|---|---|---|
| **S1**: as now (food-truck tools first, restaurant / till to make up 2) | **74** | 0 |
| **S2**: class A or B only, at least 2 | **33**: AD AT BE BL BR CH DE EE FR GB GF GG GI GP HR HU IE IM IT JE LI MF MQ NL NZ PM RE RO SK SM US VA YT | **41**: AR AU BG BH CA CL CY CZ DK EC EG ES FI GR HK ID IN KW LT LU LV MA MV MY NG NO OM PA PL PR PT QA SA SE SG SI TH TR TW UA ZA |
| **S3**: class A only, at least 2 | **12**: AD BL FR GB GF GP MF MQ PM RE US YT (GB through Ordea + Eventifood) | **62**: every other live country |
| **S4**: at least 1 class A; restaurant tools make up 2 and are labelled (a code change, counted only) | **19**: AD BL BR DK FR GB GF GG GI GP IM JE MF MQ NZ PM RE US YT | **55**: AR AT AU BE BG BH CA CH CL CY CZ DE EC EE EG ES FI GR HK HR HU ID IE IN IT KW LI LT LU LV MA MV MY NG NL NO OM PA PL PR PT QA RO SA SE SG SI SK SM TH TR TW UA VA ZA |

- **Under S3, exactly 1 class A tool (7):**

  | Countries | The class A tool |
  |---|---|
  | BR | Food Pronto |
  | DK | Truckly |
  | GG, GI, IM, JE | Ordea |
  | NZ | HungryTrucks |

  JP, not live, has one too (Mobaregi).
- **None of S2–S4 is data-only.** Each needs the class stored per competitor and a publish-rule change. S4 also needs the labelled
  restaurant row on the page.

---

## Recommendation

**S2 (class A or B, at least 2).**

- It keeps **33** pages where every tool shown markets itself to food trucks, including the big markets: DE AT FR GB IT NL US, the French
  territories and the Channel Islands.
- The pages stay honest, because a class B tool really does sell to food trucks.
- **S3** keeps only 12 pages. It would drop DE, AT, IT and NL, which each have 3–4 tools with their own food-truck pages.
- **S4** needs a UI change, and still drops DE, AT, IT and NL, while keeping BR / DK / NZ on one class A tool.
- **The cost of S2:** 41 pages go, mostly Gulf, Asian, Latin American and Nordic, plus ES, PT, PL and the Baltics. Those pages compare
  restaurant tools against HatchGrab and are weak as "food-truck" comparisons anyway.
- **Before switching**, check those 41 pages' search traffic (Open item 50), so nothing that already brings visitors is dropped blind.

Separately, whatever you decide:

- correct Chuzmonster's website (`lme.jp` → `order.yapp.li`);
- give **Hatches Up** a website or check_urls. It's class A and counted in GB, but it can never be checked or shown.

## Flags

- Nothing in the prompt arrived garbled. No instruction contradicted another.
- The prompt says "75 live countries". After Part 1b there are **74** (JP dropped), and Part 2 uses the 74.
- No push, no deploy, no workflow change, no code or manual change.
- Part 2 read no vendor page; Part 1b read one (Chuzmonster's).

## Undo (only if Dominic asks)

```sql
-- as committed migrations via scripts/db-migrate.cjs
update public.competitor_check_settings set tier_intervals = jsonb_build_object('commercial', 90, 'core', 365, 'secondary', 365), monthly_cap_usd = 90 where id;
update public.competitor_plans set unclear = false where id = '5050d0c5-71e0-586a-8486-1c6c7ef69569';  -- then publish (JP would return)
```
