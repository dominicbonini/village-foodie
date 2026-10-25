# seo-geo-1 — competitor and search claims, market choice, and AI-readable files

**24 October 2026.** Written for Dominic. This was research only: no code, data or page changed, and nothing was
deployed. The only files written are this report, `docs/seo-geo-1/competitors-verified.csv` (149 competitor-plan rows)
and `docs/seo-geo-1/keywords.csv` (628 search-result rows). The read-only SQL is in §9.

**How the research ran:** seven parallel research agents, one each for PL, CZ+SK, SE, NL+BE and DK+NO, plus two scans
that answer your question "are these the right countries?":
- every other European market HatchGrab has a language for;
- the English-speaking markets.

All seven scored their markets with the same rubric. STEP 3 (what HatchGrab can claim) and STEP 4 (the live AI files) I
checked myself.

**Your two mid-task changes, applied:**
1. **Pick the markets with the lowest competition**, so pages can rank. All 35 markets were scored for competition, demand
   and blockers, not only the brief's five (§1.2).
2. **Compare on features, not small/medium/busy prices.** Each market has a feature matrix and one plain price line per
   competitor. The verified prices stay in the CSV as facts.

**Limits — read before trusting a ranking:**
- **Every ranking is INDICATIVE.** The search tools are not Google:
  - the built-in web search is US-based and returns about 9 results;
  - Sweden's results came from Brave Search set to Sweden/Swedish.
  - No position is stated as fact.
- **The shared 200-search budget ran out partway** for every agent. Later checks were direct page fetches. The thinnest
  areas are demand counts and some marketplace rates.
- **No search-volume data** was available. "Demand" means signals of a real food-truck scene (counts, associations,
  festivals), not keyword volume.
- Prices are as advertised on 24 Oct 2026. "Second-hand" marks any figure that is not from the vendor's own page.

---

## 1 · One-page summary

### 1.1 The brief's claims

| Market | Claim | Verdict | The fact |
|---|---|---|---|
| PL | GoPOS ranks #1 for food-truck POS | **CAN'T VERIFY** | gopos.pl/foodtruck exists but appeared in no top 8 we ran; its page says "najlepszy", not "#1". |
| PL | GoPOS 79–129 zł/month on an annual contract | **PARTLY** | 79 / 129 zł net is the **annual-licence prepay** price. A monthly licence exists (price not shown), and the FAQ says cancel any time. |
| PL | GoKDS, GoOrder and hardware cost extra | **TRUE** | KDS 79 zł/station; GoOrder 49 / 129 / 349 zł (50 / 200 / unlimited orders), then from 0.40 zł per order; hardware 1,199–8,499 zł. GoOrder takes BLIK. |
| PL | Dotykačka and POSbistro are heavy fiscal POS with no food-truck offer | **PARTLY** | Dotykačka 99 / 149 / 249 zł net, no ordering of its own, no food-truck page. POSbistro price hidden, **has** a food-truck page. |
| PL | SumUp card fee; pickup ordering | **PARTLY** | 1.49% (0.79% on 89 zł Plus); Online Store 0 zł + 1.95% offers pickup, but with no time choice and nothing restaurant-specific. |
| PL | Pyszne.pl and Wolt take about 30% | **PARTLY** (second-hand) | Neither publishes a rate. Pyszne is 13% with own delivery, up to 30% with its couriers; Wolt pickup is "a reduced rate". 30% is the delivery ceiling. |
| PL | UpMenu 169 / 289 / 499 zł; Restaumatic quote only | **TRUE** | 75 / 210 / unlimited orders, then 6.70 zł per order; Restaumatic quote only, 0% commission. |
| CZ | Choice "from €40/mo or 1.5–8% fee" | **PARTLY** | €40 is right (Standard 990 Kč / €40 + 3%). **The 1.5–8% is speedlo's fee, not Choice's.** The two sit side by side in Menuthere's Czech table, the likely source of the mix-up. |
| CZ | Speedlo about 2,000 Kč/month | **PARTLY** | Lite 2,000 Kč; Standard 0 Kč + 1.5–8%; Profesional 3,000 Kč + 1.5–5%; +1.5% online payments, ex-VAT (speedlopro.cz/cenik.pdf). |
| CZ | Dotykačka / Storyous / Qerko / Smable-Teya | **TRUE** (they are POS or table payment) | Dotykačka 590–1,990 Kč; Smable 190–590 Kč (food-truck page); Qerko 2.90 Kč + 1.35% per payment; Storyous and Teya hidden. None does pickup pre-ordering itself. |
| CZ | Wolt / Bolt Food commission | **CAN'T VERIFY** | Not published; 25–35% second-hand. |
| CZ | Menuthere's programmatic table ranks | **PARTLY** | The page exists ("10 best online ordering systems for restaurants in Czechia", English, 2026, Menuthere puts itself #4). Its ranking was not verifiable. |
| CZ | Menu55 350 / 480 Kč, 0% | **TRUE** | |
| SE | Zettle 1.85%, SumUp 1.49%; pickup ordering? | **TRUE** / pickup **Zettle no, SumUp partly** | SumUp's web shop has pickup but no time slots. |
| SE | Caspeco and Onslip | **PARTLY** | Caspeco hidden, has a takeaway module. Onslip 329 / 529 / 829 kr on **12 months' binding**; takeaway only through WEIQ's app. |
| SE | Foodora / Wolt commission | **CAN'T VERIFY** | Not published for Sweden. |
| SE | Norvico and Kassasystem.se conflate payment with ordering | **PARTLY** | Norvico compares only card terminals (stale Zettle 1.75%); Kassasystem.se was unreachable. Every ranking Swedish page answers "food truck system" with payments, never pre-ordering. |
| SE | WEIQ 750 kr / 8,000 kr per year; Qopla hidden | **TRUE** | Qopla's pages confirm pickup-time choice and Swish. |
| NL | Sitedish €59–€99+ | **CAN'T VERIFY** (contradicted) | Officially "€1 per dag"; Capterra "from €30/mo" (second-hand). |
| NL | Sitedish assumes one fixed postcode | **PARTLY** | A delivery-area, one-restaurant model; "postcode" is not stated. |
| NL | DISH, Lightspeed, SumUp, Zettle | **PARTLY / TRUE** | DISH price hidden (pickup yes). Lightspeed €89 / €159 / €249, Click & Collect included only on Pro. SumUp Order & Pay €49 + 2.5% (customer says when they collect). Zettle no ordering. |
| NL/BE | Thuisbezorgd and Uber Eats commission | **PARTLY** | Uber Eats NL: 30% delivery, **14% pickup**, €400 activation. Uber Eats BE: 13% pickup + €3.99/week. Thuisbezorgd, Takeaway.com BE and Deliveroo BE: can't verify. |
| NL | MobileTransaction only compares pin terminals | **FALSE** | Its Dutch site has a "Beste kassasystemen voor horeca" page (Sep 2026) that ranks for the main keyword. |
| NL | NL is a "data void" | **FALSE** | 7+ food-truck ordering tools, and 6+ Dutch 2026 food-truck POS comparisons rank. |
| BE | BE is a data void | **FALSE** | Payli, URBANPOS, WPOS and Presto all have food-truck pages with public prices. |
| NL | Qrder / FoodTruck POS / Digitale Menukaart / Vev / Jamezz / Bestelly / Digitaste | **TRUE** | All confirmed. |
| NL | Foodticket €45.63 | **PARTLY** | The page says €1.50 per day; the monthly figure was our conversion. |
| DK | FoxiFood is a Slovak tool whose thin page has the H1 "…sammenligning" and a Wolt 30% calculation, and ranks top | **PARTLY / FALSE** | No Danish page has that H1 (all 106 checked). The food-truck page is "Online bestilling til food trucks" (~250 words, QR in the queue). The Wolt 30% maths is on its comparison guide. **The maker is Elite Digital Services, LLC (Delaware, USA)**, not Slovak. Its rank is not verifiable; it was #2 only for the exact phrase. |
| DK | Quickorder | **PARTLY** | Now **Shopbox**, POS-led; ordering needs Advanced at 897–997 kr/month. |
| NO | Favrit from 899 kr ex VAT | **TRUE** | The page title says 699; supports Vipps. |
| DK/NO | Wolt commission | **PARTLY (DK, second-hand 30%) / CAN'T VERIFY (NO)** | |
| DK/NO | SumUp and Zettle rates | **TRUE** | DK SumUp 0.89% / 1.49% online, Zettle 1.95%. NO SumUp 1.49%, Zettle 1.75%. MobilePay and Vipps carry 0 kr Zettle fee. |
| DK | NemTakeAway 395 / 695 kr, setup 399 / 699 | **TRUE** | **New: 12-month minimum term.** Takes MobilePay. |

**Missed by the brief and research-1 (new rows in the CSV):**
- **PL:** **Frivo** (pickup-time pre-ordering, BLIK, 99–349 zł, 0% commission; it courts food trucks).
- **CZ/SK:** **FoxiFood** (free to the truck, €0.45 paid per order by the customer, **slot capacity**, KDS), Objednáme,
  Waiterio, pikMenu (SK).
- **SE:** Jamezz, Vendion (Swish, 290 kr), Karma (free plan, 36-month POS deal), Ancon, Ordine.
- **BE:** **Payli** (time slots, Bancontact and iDEAL, €49–79), URBANPOS (announces the daily location), WPOS, Presto.
- **NL:** Twelve, Tebi.

### 1.2 Are these the right countries? Markets ranked by real opportunity

Your suspicion was right. **The Netherlands is the most crowded of the brief's markets.** It has the most food-truck
tools, 2026 comparison articles own the main keyword, and every cheap rival takes iDEAL, which HatchGrab does not.

The best low-competition markets are mostly **not** in the brief: they are the English-speaking countries (switched on,
no payment blocker) and Germany/Austria/Italy.

Opportunity = low competition × real food-truck demand × a clear feature differentiator, with no payment blocker. Scores
are 1–5 and indicative.

| Rank | Market | Competition | Demand | Feature edge | Blocker today | Score |
|---|---|---|---|---|---|---|
| 1 | **Australia** | low | medium (~5,000 trucks) | strong: rivals are marketplaces | none (cards, Apple/Google Pay) | **5** |
| 2 | **Canada** | low–medium | medium (2,326 mobile-food businesses) | strong | none | **4** |
| 3 | **Germany** (+ **Austria**, one German page) | medium (DE), low (AT) | high (DE) | clear: local tools are contract webshops | none known | **4** |
| 4 | **Italy** | low (no Italian page ranks) | high (festival circuit) | clear | Satispay is common; cards fine | **4** |
| 5 | **Poland** | low (medium on "POS") | medium–high (~700 new trucks in H1 2026) | clear, but Frivo matches the core flow | **BLIK** | **4** (3 until BLIK) |
| 6 | Ireland | low | low–medium | strong | none | 3 |
| 6 | New Zealand | low | low–medium | strong | none | 3 |
| 6 | United Kingdom | medium (head term weak) | high | narrower: Beat The Queue and Ordea already sell slots + capacity | none | 3 (long tail) |
| 6 | Sweden | low on pre-order terms, medium on "kassasystem" | small, seasonal | clear | **Swish** | 3 |
| 6 | Denmark | low | small, event-led | clear | **MobilePay** | 3 |
| 6 | Czech Republic | medium | till-led (EET 2.0 from 1 Jan 2027) | pre-order uncontested; FoxiFood has slot capacity | fiscal receipts (check) | 3 |
| 6 | Belgium | medium | medium | clear (only Payli has slots) | **Bancontact**; GKS 2.0 certified till | 3 |
| 6 | Romania, Hungary, Spain, Estonia, Luxembourg, Switzerland | low–medium | medium | clear | Bizum (ES), SZÉP (HU, partly), Payconiq (LU, partly), TWINT (CH) | 3 |
| 14 | **Netherlands** | **high** | medium–high (1,510 trucks on a NL+BE booking network) | narrow: Jamezz, Vev, Bestelly and SumUp already offer slots | **iDEAL** | **2** |
| 14 | Norway | low | thin, festival-touring | clear | **Vipps**; Stripe card 2.4% + 2 kr looks high | 2 |
| 14 | Slovakia | low | small, served by Czech pages | clear | — | 2 |
| 14 | France | high (two FR comparatifs; Eatch has slots + capacity) | high | thin | titres-restaurant | 2 |
| 14 | United States | high (affiliate publishers) | high | weak (BFT, Hotplate etc. cover most features) | — | 2 (long tail only) |
| — | GR, HR, SI, LT, PT, FI, LV, BG, CY, MT, GI | low | low | — | MB WAY (PT), MobilePay (FI) | 1–2 |

### 1.3 Blockers in one place

- **Payment method:** BLIK (PL), Swish (SE), iDEAL / Wero (NL), Bancontact (BE), MobilePay (DK, and FI), Vipps (NO). None
  is built: HatchGrab offers cards only, plus Apple Pay and Google Pay as card wallets (§3).
- **Fiscal till rules:** CZ EET 2.0 (1 Jan 2027), the PL kasa fiskalna question, BE GKS 2.0, the SE kassaregister.
  HatchGrab is not a fiscal till. In these markets it sits beside the truck's certified till; a comparison page must say
  so, not claim to replace it.
- **The iOS operator app is in the UK App Store only** (Apple's lookup returns 0 results for 12 other storefronts,
  including IE, AU, CA, NZ, DE, PL and SE). Any page outside the UK that says "iOS app" is untrue until the app is
  published there.
- **Nothing blocks on switch-on, prices or language:** all eight brief countries are switched on, priced and translated
  (§3.2).

---

## 2 · Per market (the brief's five)

The full feature matrices, price lines and sources are in the CSV (`url`, `evidence_url`, `notes`) and summarised here.
**HatchGrab's own row is from §3, not assumed:**
- yes to every pre-ordering feature;
- WhatsApp auto-replies **on Pro and Unlimited only**;
- operator apps **partly** (iOS in the UK store only);
- no local wallet.

### 2.1 Poland — opportunity 4/5 (3 until BLIK), competition low

- **Search (indicative):**
  - No Polish page about food-truck ordering or pre-ordering ranks; the top 8 are English vendor blogs (Vev, Best Food
    Trucks, Restolabs).
  - "System POS dla food trucka": UpMenu holds 2 of the top 3; gopos.pl/foodtruck is absent.
  - "kasa fiskalna food truck": tax blogs that disagree on whether a truck needs a fiscal till.
  - An AI answer today draws on UpMenu's English pages and US "best food truck POS" lists.
- **Groups:**
  - Food-truck ordering: Frivo (partly).
  - Restaurant ordering: UpMenu, Restaumatic, GoPOS GoOrder.
  - POS / card: GoPOS, POSbistro, Dotykačka, SumUp.
  - Marketplace: Pyszne.pl, Wolt, Glovo.
- **Feature edge:** no Polish rival combines time slots with capacity per slot and a weekly schedule. Frivo has time
  choice and BLIK; UpMenu has slots but order caps and its KDS is "coming soon" in Poland.
- **When to choose X instead:**
  - **GoPOS:** you need one fiscal till + terminal + KDS + shop with BLIK and cash.
  - **Frivo:** customers must pay by BLIK today.
  - **UpMenu:** you also run a delivery restaurant and want a branded customer app.
  - **POSbistro:** you need a certified offline fiscal till.
  - **SumUp:** you only need a card reader.
  - **Pyszne / Wolt:** you want delivery reach.
- **Price, one line:**
  - HatchGrab: 0 zł + 0.99% / 129 zł / 299 zł.
  - Others: Frivo 99–349 zł, 0%; UpMenu 169–499 zł (capped orders); GoPOS 79 zł + GoOrder from 49 zł.

### 2.2 Czech Republic — 3/5, competition medium · Slovakia — 2/5, competition low

- **Search:** local POS vendors (Dotykačka, Smable, ProfiREST, Waiterio, Objednáme) own the "food truck" terms. **No
  Czech page explains or compares food-truck pre-ordering.** Slovak queries return Czech or English pages.
- **Demand** is for an **EET 2.0** till (from 1 Jan 2027), not pre-ordering.
  - **Check before building:** whether HatchGrab's prepaid online orders fall under EET 2.0.
- **Strongest rival: FoxiFood.** It has Czech and Slovak food-truck pages, is free to the truck (customer pays €0.45),
  and has scheduled pickup with slot capacity, KDS and allergens. HatchGrab's edge over it: the weekly schedule, pay at
  the truck as a standard option, menu import from a photo, WhatsApp (Pro+), and **no per-order charge to the customer**.
- **When to choose X:**
  - **FoxiFood:** you want no monthly fee and accept a customer fee.
  - **speedlo:** you deliver and want kiosks or festival cashless.
  - **Choice:** you also run a sit-down venue.
  - **Dotykačka / Smable:** you need the EET till; these sit beside HatchGrab.
- **Price, one line:**
  - HatchGrab CZ 0 Kč + 0.99% / 699 Kč / 1,690 Kč; SK €0 / €29 / €69.
  - Others: Choice 0–2,990 Kč (3% or 0%); Menu55 350–480 Kč; FoxiFood €0 (+€0.45 per order paid by the customer).

### 2.3 Sweden — 3/5, competition low on pre-order terms, medium on "kassasystem"

- **Search (Brave SE/sv, indicative):**
  - "kassasystem food truck" is held by ~10 local POS vendors and Kassaguiden's city pages.
  - The ordering terms ("förbeställning", "beställningssystem", "beställningsapp") are nearly empty; **Jamezz** (Dutch) is
    the only real tool.
  - Zettle and SumUp have no food-truck page in any top 8.
- **Swish is the gap:** every local POS leads with it. **Stripe offers Swish as a preview** (on request, works with
  Connect, 1% + 3 kr, capped at 7 kr), so it is fixable within the stack (§5.3).
- **When to choose X:**
  - **Qopla / Caspeco:** a restaurant with a certified POS and Swish.
  - **WEIQ:** one Swedish supplier with Swish and a pausable season plan.
  - **Onslip:** a certified kassaregister first.
  - **Karma:** a free takeaway page, if you accept a 36-month POS deal.
  - **Vendion:** Swish and QR order-ahead from 290 kr.
- **Price, one line:**
  - HatchGrab: 0 kr + 0.99% / 329 kr / 769 kr.
  - Others: WEIQ from 750 kr; Vendion 290 kr; Karma free (36 months); Onslip 329 kr (12 months).

### 2.4 Netherlands — 2/5, competition high · Belgium — 3/5, competition medium

- **"Data void": false in both countries.**
- **NL:**
  - The main keyword's top 8 are all food-truck **till** comparisons (Twelve, Companeo, Horeca 2.0, MobileTransaction NL,
    bedrijfssoftwaregids…). They recommend Zettle, SumUp and Lightspeed and never mention pre-ordering.
  - "bestelsysteem foodtruck" is led by Foodticket, Digitaste and Qrder.
  - Several Dutch tools already offer collection time slots: Jamezz, Vev, Bestelly, SumUp Order & Pay.
  - All the cheap ones take **iDEAL**.
- **BE:**
  - Rivals are till-first.
  - Only **Payli** advertises pickup time slots (with Bancontact and iDEAL/Wero, €49–79).
  - The GKS 2.0 certified-till rule pushes trucks to a local till.
- **What only HatchGrab has here:** capacity per slot together with a published weekly multi-location schedule; menu
  import from a photo; WhatsApp alongside time slots.
- **When to choose X:**
  - **Qrder:** WhatsApp orders and iDEAL, without slots.
  - **Bestelly / Jamezz:** slots with iDEAL, at a fixed site or for events.
  - **Payli:** Bancontact plus slots in Belgium.
  - **Digitaste / URBANPOS:** a GKS-certified till.
  - **Uber Eats:** reach, at 13–14% for pickup.
- **Price, one line:**
  - HatchGrab: €0 + 0.99% / €29 / €69.
  - Others: Qrder €0–29; FoodTruck POS €12.99–29.99; Bestelly €39 + €249 setup; Payli €49–79; Lightspeed from €89.

### 2.5 Denmark — 3/5 · Norway — 2/5, competition low in both

- **Search:**
  - The DK top 8 are all English (Restolabs, Vev, Capterra).
  - The only native food-truck ordering pages are FoxiFood's thin DA/NB pages.
  - In Norway nothing native ranks.
- **Demand:** small and event-led. Nuento lists 101+ Danish trucks; Street Food Norway runs 70+ festivals a year.
- **Gap:** **MobilePay (DK) and Vipps (NO)** are offered by every local rival that takes online payments. In Norway,
  HatchGrab's assumed Stripe rate (2.4% + 2 kr) is well above Zettle (1.75%) and SumUp (1.49%).
- **When to choose X:**
  - **NemTakeAway:** a fixed-site takeaway with MobilePay, if you accept a 12-month term.
  - **Shopbox:** a Danish POS with ordering as an add-on.
  - **FoxiFood:** zero cost to the truck.
  - **Favrit:** a Norwegian POS with Vipps.
  - **Zettle / SumUp:** payments only.
- **Price, one line:**
  - HatchGrab DK: 0 / 219 / 519 kr. NO: 0 / 299 / 729 kr.
  - Others: NemTakeAway 395–695 kr (12 months); Favrit from 899 kr; FoxiFood €0 + €0.45 paid by the customer.

### 2.6 The other markets (from the two scans)

- **English-speaking:**
  - **Australia, Canada, Ireland and New Zealand** have weak results pages: Square or Moneris, Epos Now and software
    directories. Their truck-specific rivals (Where The Truck, Qhop, HungryTrucks, Street Food Spot) are marketplaces
    with no own web address, slot capacity or weekly schedule.
  - **UK:** Beat The Queue already publishes "vs" pages and a time-slots guide (31 Mar 2026); Ordea sells per-slot
    capacity. HatchGrab's UK edge is the weekly schedule, pay at the truck, WhatsApp (Pro+) and the operator apps.
  - **US:** affiliate publishers own the head term.
  - **An undated Ordering.co page** shows up in the long-tail results of all six English markets. AI answers will
    probably quote it; a dated page with a feature table can replace it.
- **Germany, Austria, Italy and Romania:** native results are missing (mostly English US pages) and demand is real.
- **France:** two French comparatifs rank, and Eatch already has slots, capacity and weekly planning.

---

## 3 · STEP 3 — what HatchGrab can truthfully claim (manual, code and read-only SQL)

| Claim | Status | Evidence |
|---|---|---|
| **Collection time slots** | **Built** | Customers pick a collection time every N minutes, **N = 5, 10, 15, 20 or 30**, per van, with an operator/customer split and per-event override (manual "Slot & Capacity engine", ~l.18150; `truck_vans.collection_interval_mins`). |
| **Kitchen capacity limits** | **Built, but the wording is wrong** | Slots are "a SELECTION CONVENIENCE ONLY … NOT cooking units". Capacity is a rolling engine over each category's prep time and batch size (manual ~l.18150; `lib/kitchen-capacity.ts`, `lib/slot-display.ts`). **"15-minute grill capacity slot throttling" misdescribes it.** Truthful wording: *"Customers only see collection times your kitchen can actually make, based on each item's prep time and how many you cook at once."* |
| **Rotating weekly schedule across locations** | **Built** | Events per date and place, schedule extraction from a screenshot, weekly schedule posts, private events (§51, §67, §69, §73). |
| **WhatsApp auto-replies** | **Built — Pro and Unlimited only** | `plan_features`: `whatsapp_replies`, `instagram_messenger_replies`, `event_types` and `schedule_graphics` are **off on Pay as you go**; every other feature is on every public plan (§9). §20. |
| **KDS** | **Built** | §9 (Kitchen Display System rules). |
| **Printed tickets** | **Built** | §42 (kitchen ticket printing, Phase A). |
| **iOS app** | **Partly — UK App Store only** | Apple's lookup for id 6803543106: gb = 1 result; us, ie, au, ca, nz, de, pl, se, nl, dk, no and cz = 0. The `LandingFooter.tsx` note says the same. |
| **Android app** | **Built; countries not verifiable here** | The Play listing loads (HTTP 200), but that doesn't prove which countries it is offered in. |
| **Own web address** | **Built, every plan** | §46 custom domains; not in the `plan_features` exclusions. |
| **Payment methods** | **Cards only; Apple Pay and Google Pay are card wallets** | `lib/payments/authorize.ts`: `payment_method_types: ['card']` (Link deliberately off). Apple/Google Pay render as card wallets when the connected account's payment-method domain is registered and Google Pay is on. The manual records both done on the live accounts (V11.13) and warns a missing registration "fails completely silently". **Not checkable from here** (no Stripe access). |
| **BLIK, iDEAL/Wero, Bancontact, Swish, MobilePay, Vipps, Klarna, TWINT, Bizum, MB WAY** | **Not built** | Manual l.17866 ("Local wallets … not built"), l.33978 ("payment-method notes only"). |
| **Pay at the truck** | **Built** | "Pay at Hatch" / "Pay at the truck" (§35.ak-5). |
| **No contract, cancel any time** | **True** | Terms l.64: "No contract, cancel anytime. There is no minimum term and no notice period." Fees already paid are not refunded (l.68–69). |
| **Allergens** | **Built** | Per-country allergen sets (§83.4). |
| **Menu import from a photo** | **Built** | Landing "Upload a photo of your menu" (§82.8). |

### 3.2 The eight brief countries (read-only SQL, 24 Oct)

| Country | Switched on | Locale (translated) | Currency | Pay as you go / Pro / Unlimited | Local wallet built |
|---|---|---|---|---|---|
| PL | yes | pl-PL ✓ | PLN | 0 + 0.99% / 129 zł (incl. 17,500 zł) / 299 zł | BLIK no |
| CZ | yes | cs-CZ ✓ | CZK | 0 + 0.99% / 699 Kč (incl. 100,000 Kč) / 1,690 Kč | — |
| SK | yes | sk-SK ✓ | EUR | €0 + 0.99% / €29 (incl. €4,000) / €69 | — |
| SE | yes | sv-SE ✓ | SEK | 0 + 0.99% / 329 kr (incl. 45,000 kr) / 769 kr | Swish no |
| NL | yes | nl-NL ✓ | EUR | €0 + 0.99% / €29 / €69 | iDEAL no |
| BE | yes | nl-BE ✓ (Flemish; no fr-BE) | EUR | €0 + 0.99% / €29 / €69 | Bancontact no |
| DK | yes | da-DK ✓ | DKK | 0 + 0.99% / 219 kr (incl. 30,000 kr) / 519 kr | MobilePay no |
| NO | yes | nb-NO ✓ | NOK | 0 + 0.99% / 299 kr (incl. 42,000 kr) / 729 kr | Vipps no |

- Every one is switched on and priced, and its language is built (europe-languages-1/2).
- **Belgium has only Dutch (nl-BE).** French-speaking Wallonia and Brussels get no French page; fr-FR exists, but there
  is no fr-BE.
- The English countries (GB, IE, US, CA, AU, NZ) and DE and FR are also switched on (same query).

---

## 4 · STEP 4 — AI-readable files on the live site (fetched 24 Oct 2026, ~13:13 UTC)

| File | Live | Against the manual (§35.ak, §48, §82.9) |
|---|---|---|
| `/robots.txt` | 200 | ✅ Matches §82.9. One named group allows OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Googlebot, Bingbot, Applebot, **GPTBot, ClaudeBot, Google-Extended**, Applebot-Extended and CCBot. Bytespider, FacebookBot and anthropic-ai are blocked. Every group repeats all 14 private disallows (35.ak-8). The sitemap line is present. |
| `/llms.txt` | 200, 426 lines | ✅ Built from data: 36 countries (France now included), plans and prices per country, the fee rule, the trial, the About line, links. ⚠️ Gaps below. |
| `/sitemap.xml` | 200, **77 URLs** | ✅ 36 countries × (landing + /features), plus /privacy, /terms, /country-terms, /contact and /about; 34 `xhtml:link` alternates per URL. `/compare` is left out (noindex, by design). lastmod = the latest of copy date, plan data and country-row change (`app/sitemap.ts`). §48's line saying lastmod comes only from `MARKETING_COPY_UPDATED` is out of date (doc fix, not a bug). |
| hreflang on `/uk` and `/us` | 37 each | ✅ One per switched-on country (36) + `x-default` → https://www.hatchgrab.com. Canonical self (`/uk`, `/us`); `<html lang>` en-GB / en-US. |
| JSON-LD on `/uk` | 1 `@graph` | ✅ Organization (legalName "HatchGrab Ltd", addressCountry GB, logo, founder, `sameAs` = the App Store GB and Google Play URLs), WebSite, SoftwareApplication (description, `inLanguage`, `countriesSupported` = 36 codes, audience, `operatingSystem` "Web, iOS, Android", 3 GBP Offers with `unitCode` MON). **No FAQPage, no `dateModified`, no ratings. No invented fact found** (35.ak-7 holds). |
| apex `hatchgrab.com` | **307** | ⚠️ Still a 307 (manual: should be 308; a Vercel domain setting, open since 20 Oct). |

### Gaps between live and the manual / what AI answers need

1. **`/llms.txt` mixes languages and number styles.**
   - The file is English, but each country's card-processing sentence is in that country's language (German for
     Austria, Dutch for Belgium and the Netherlands, Polish for Poland, Bulgarian for Bulgaria, …).
   - The amounts are in the home form ("€ 29", "0,99 %", "17 500 zł", "4000 €").
   - **§35.al-2 says side-by-side surfaces such as `/llms.txt` use the international form.** It is a small fix, but it
     is what an AI quotes.
2. **`/llms.txt` has no features section.**
   - It says only "online ordering, pre-orders and a kitchen screen … choose a collection time".
   - Nothing on capacity, the weekly schedule, pay at the truck, WhatsApp (Pro+), allergens, photo import, printed
     tickets, own domain, apps, or "not a fiscal till".
   - An AI asked "food truck pre-ordering with time slots and capacity in Poland" has no HatchGrab sentence to cite.
3. **No dated "last updated" line** in `/llms.txt` or the JSON-LD (`dateModified`).
4. **`operatingSystem: "Web, iOS, Android"`** sits on every country page. iOS is UK-only (§3), so on non-UK pages the iOS
   part is not yet true for an operator there. Consider stating it per country, or publishing the iOS app in more
   storefronts.
5. **No FAQPage** — parked by design (§82.9, the Admin › FAQ design).
6. **Belgium in French** has no page (nl-BE only), so a Wallonia/Brussels comparison page has no home yet.

### Plan only — what a comparison page would need

- **The page:** one per language market, at a country address (e.g. `/au/compare-food-truck-ordering`, `/de/…`).
  - A **feature table** (the §2 matrices), one plain price line per tool with its **checked date and source link**, and
    the honest "when to choose X instead" lines.
  - A visible "Last checked: 24 Oct 2026".
  - No ratings or statistics that are not from data (35.ak-7).
- **JSON-LD:**
  - `WebPage` / `Article` with `dateModified` and `datePublished`;
  - the existing SoftwareApplication with its country `offers`, plus a `featureList` built from the feature data;
  - **FAQPage** from the parked Admin › FAQ (data tokens such as `{pro.price}`).
  - **Do not** mark up competitors as Products or with reviews.
- **hreflang:** a cluster only between the comparison pages that exist (e.g. AU/CA/IE/NZ/GB en variants, DE/AT de), plus
  x-default; never point at a market with no such page (35.ak-3).
- **Sitemap:** add the comparison URLs with a lastmod = the competitor data's checked date.
- **`/llms.txt`:** a features section, a "compare" link per country, a "last updated" line, all in English with
  international number forms.
- **Data source:** competitor facts in a table like `competitors` / `competitor_plans` (pricing-check-1), shown only once
  you have verified them. That is your stated rule for pricing data.

---

## 5 · STEP 5 — recommendation (plan only)

### 5.1 Where to start

1. **Start with the switched-on English markets: Australia first, then Canada, Ireland and New Zealand.**
   - Lowest competition with real demand.
   - **No payment blocker** (cards plus Apple/Google Pay are normal there).
   - Trucks can sign up today.
   - One English master page localises to all four.
   - The pitch: **"your own ordering page with time slots and kitchen capacity, versus marketplace apps (Where The Truck,
     Qhop, HungryTrucks, Street Food Spot) and card-reader shops (Square, Moneris)"**.
2. **UK: long-tail and feature pages, not the head term.**
   - Targets: "food truck click and collect", "food truck WhatsApp ordering", "food truck weekly route ordering", plus a
     "Beat The Queue / Ordea alternative" page.
   - Lead with the weekly schedule, pay at the truck, WhatsApp (Pro+) and the apps. Time slots alone are not unique in
     the UK.
3. **Germany + Austria: one German page.** It is the biggest European scene, the results have no German pre-order
   comparison, local tools are contract webshops, and there is no known wallet blocker. (PayPal's role in DE checkout was
   not researched; check it.)
4. **Italy** next: high demand, nothing Italian ranks.
5. **Poland:** once BLIK is decided. Low competition and fast-growing demand, but Frivo already pairs pickup times with
   BLIK.
6. **Hold the Netherlands.** It is crowded, iDEAL is missing, and the Dutch time-slot tools already exist.
7. **Lower priority:** Sweden (Swish), Denmark (MobilePay), Belgium (Bancontact plus GKS, and no French), Czech Republic
   (EET 2.0 first), Norway, Slovakia.

### 5.2 Who each page compares against

Keep the three groups apart on the page:

- **Food-truck ordering tools:** the real rivals.
  - AU/NZ: Where The Truck, Qhop, HungryTrucks, Street Food Spot (marketplaces with a truck focus).
  - UK: Beat The Queue, Ordea.
  - PL: Frivo. CZ/SK: FoxiFood. SE: Jamezz, Vendion. BE: Payli, Digitaste, URBANPOS.
  - NL: Qrder, Jamezz, Bestelly, Vev, Digitale Menukaart, FoodTruck POS.
- **Card readers / POS:** "use these beside HatchGrab". Square, SumUp, Zettle, Moneris, Lightspeed, GoPOS, Dotykačka,
  Onslip, Shopbox, Favrit.
- **Marketplaces:** "for reach, at 13–30% commission". Wolt, Uber Eats, Thuisbezorgd, Pyszne, Foodora, Bolt Food.

### 5.3 What must happen first, per blocked market

| Market | First | Note |
|---|---|---|
| PL | BLIK | Stripe supports BLIK. ⚠️ **Check it works with HatchGrab's manual-capture flow** (authorise now, capture later). Several redirect methods are capture-immediately; I didn't verify which, and it needs a design decision. |
| SE | Swish | Stripe Swish preview (on request, Connect, 1% + 3 kr, capped at 7 kr). Same manual-capture check. |
| NL / BE | iDEAL (Wero) / Bancontact | Same manual-capture check; BE also needs fr-BE for Wallonia and Brussels. |
| DK / NO | MobilePay / Vipps | Same check; NO card cost vs Zettle and SumUp. |
| CZ | EET 2.0 answer | Do prepaid online orders need an EET receipt from 1 Jan 2027? Legal question first. |
| All non-UK | iOS app | Publish to more App Store storefronts, or don't say "iOS" there. |
| All | `/llms.txt` features section + English-only footnotes; FAQPage; dated comparison data | §4. |

### 5.4 On price (your change)

The pages compare **features**; price is one plain line per tool, with the checked date. The research-1 small/medium/busy
results are not repeated here and remain in `docs/pricing-research-1-report.md`.

---

## 6 · Files

- `docs/seo-geo-1/competitors-verified.csv`: **149 rows** (PL 25, CZ 27, SK 9, SE 26, NL 30, BE 13, DK 13, NO 6).
  - Columns: competitors.csv's 37 + `claim_checked`, `verdict` (TRUE / FALSE / PARTLY / CAN'T VERIFY / NEW / N/A; the
    detail is in `claim_checked`), `evidence_url`, `second_hand`.
  - All rows checked 24 Oct 2026.
- `docs/seo-geo-1/keywords.csv`: **628 rows**.
  - The brief's markets (PL, CZ, SK, SE, NL, NL+BE, BE-FR, DK, NO), the European scan (DE … BG, CH) and the English scan
    (GB, IE, US, CA, AU, NZ, MT/GI).
  - `compares_food_truck_preorder`: **n** 610, **partly** 12 (vendor explainers such as Jamezz's own table, AppMaster),
    **unknown** 6, **y 0**. No ranking page in any market compares food-truck pre-ordering.
  - Ranks are indicative.
- The agents' working notes, page captures and scripts stayed in the session scratchpad. They are not in the repo.

## 7 · Things that surprised

- **The brief's Choice figure merged two vendors.** "€40/mo or 1.5–8%" combines Choice's €40 with speedlo's 1.5–8%;
  both sit in Menuthere's English Czech table.
- **FoxiFood is a US LLC**, not Slovak. It already offers slot capacity in Czech and Slovak at no cost to the truck.
- **Native-language food-truck ordering content is missing almost everywhere in Europe.** The results are English US
  pages: Best Food Trucks, UpMenu, Restolabs, Table Needs, Marn.
- **Dutch vendors appear in other markets:** Jamezz in SE and ES, Vev in DE and DK.
- **Stripe's Swish preview** makes Sweden's main objection fixable.
- **France is now live** (in `/llms.txt`, hreflang and the sitemap), so 20261040 has run and France has been switched on.

## 8 · Sources (all checked 24 Oct 2026; every competitor row's URL is in the CSV)

**Poland**
- GoPOS: https://gopos.pl/foodtruck · https://gopos.pl/cennik · https://gopos.pl/goorder
- UpMenu: https://www.upmenu.com/pl/cennik/
- Dotykačka: https://www.dotykacka.pl/cennik/
- POSbistro: https://posbistro.com/cennik-kasa-wirtualna-aio/ · https://posbistro.com/typ-biznesu/oprogramowanie-dla-food-trucka/
- SumUp: https://www.sumup.com/pl-pl/cennik/ · https://www.sumup.com/pl-pl/online-store/
- Restaumatic: https://www.restaumatic.com/pl/price-list/
- Frivo: https://frivo.pl/cennik · https://frivo.pl/zamowienia-z-odbiorem
- Wolt: https://merchant.wolt.com/en/pol/learning-center/wolt-merchant-fees-and-commissions
- UpMenu commission blog (second-hand): https://www.upmenu.com/pl/blog/pyszne-glovo-uber-eats-prowizja
- Truck numbers: https://www.money.pl/biznes/gastronomia-bije-rekord-boom-na-food-trucki-7317884550785216a.html
- Fiscal-till question: https://www.fakturowo.pl/blog/food-truck-a-kasa-fiskalna

**Czech Republic / Slovakia**
- Choice: https://choiceqr.com/cs/cenik-choice/ · https://choiceqr.com/sk/cennik-choice/
- speedlo: https://speedlopro.cz/cenik.pdf
- Menu55: https://menu55.cz/objednavky-rozvoz
- Dotykačka: https://dotykacka.cz/cenik/ · https://dotykacka.cz/pokladni-system-pro-stankovy-prodej/
- Smable: https://www.smable.cz/cenik/
- Qerko: https://www.qerko.com/cenik
- FoxiFood: https://www.foxifood.com/cs/vyuziti/food-truck/ · https://www.foxifood.com/cs/funkce/planovane-objednavky/
- Menuthere table: https://menuthere.com/en/best-online-ordering-systems/czechia
- Objednáme: https://objedname.cz/cenik
- pikMenu: https://pikmenu.com/
- Bolt Food: https://bolt.eu/cs-cz/food/merchant/

**Sweden**
- Zettle: https://www.zettle.com/se/priser
- SumUp: https://www.sumup.com/sv-se/priser/ · https://www.sumup.com/sv-se/webbutik/
- Onslip: https://www.onslip.com/sv/priser
- Caspeco: https://caspeco.com/en/kassasystem
- WEIQ: https://weiq.tech/pris/
- Qopla: https://qopla.se/onlinebestaellningar
- Karma: https://karma.life/pricing
- Vendion: https://vendion.com/pris
- Jamezz: https://jamezz.com/sv/branscher/foodtrucks
- Norvico: https://www.norvico.se/services/foodtruck-mobil-forsaljning/
- Foodora: https://partner.foodora.se/sv
- Wolt: https://merchant.wolt.com/sv/swe
- Stripe Swish: https://docs.stripe.com/payments/swish · https://stripe.com/en-se/pricing/local-payment-methods
- Foodtruckkartan: https://foodtruckkartan.se/
- Search results: Brave Search SE/sv

**Netherlands / Belgium**
- Qrder: https://qrder.app/pricing
- FoodTruck POS: https://foodtruckpos.nl/
- Digitale Menukaart: https://digitalemenukaart.nl/prijzen
- Foodticket: https://foodticket.nl/foodtruck/
- Vev: https://vev.co/pricing
- Jamezz: https://jamezz.com/industries/food-trucks
- Bestelly: https://bestelly.nl/
- Sitedish: https://www.sitedish.nl/
- DISH: https://www.dish.co/NL/nl/dish-professional-order/
- Lightspeed: https://www.lightspeedhq.nl/kassasysteem/restaurant/prijzen/
- SumUp: https://www.sumup.com/nl-nl/order-and-pay/
- Zettle: https://www.zettle.com/nl/pricing
- Uber Eats: https://merchants.ubereats.com/nl/nl/pricing/ · https://merchants.ubereats.com/be/nl/pricing/
- MobileTransaction NL: https://nl.mobiletransaction.org/kassasystemen-voor-horeca/
- Twelve: https://www.twelve.eu/blog/kassa-foodtruck
- Payli: https://payli.be/foodtrucks/
- URBANPOS: https://www.urbanpos.be/nl/secteur-foodtruck
- Digitaste: https://www.digitaste.be/foodtruck
- WPOS: https://wpos.be/kassasysteem-foodtruck/
- Presto: https://getpresto.be/kassasysteem-voor-foodtruck/
- Truck booking network: https://www.foodtruckbestellen.be/
- Rollende Keukens: https://rollendekeukens.amsterdam/

**Denmark / Norway**
- FoxiFood: https://www.foxifood.com/about/ · https://www.foxifood.com/da/anvendelsesmuligheder/food-truck/ ·
  https://www.foxifood.com/da/guides/sammenligning-af-bestillingssystemer/
- NemTakeAway: https://www.nemtakeaway.dk/priser/
- Quickorder / Shopbox: https://quickorder.io/dk/priser/ · https://shopbox.com/da/priser
- Favrit: https://web.favrit.com/pris
- Superb: https://www.superbexperience.com/pricing
- Wolt: https://merchant.wolt.com/en/dnk/learning-center/wolt-merchant-fees-and-commissions
- The Local (second-hand): https://www.thelocal.dk/20251118/danish-delivery-service-wolt-backs-down-in-dispute-with-restaurants
- SumUp: https://www.sumup.com/da-dk/betalingsterminal-pris/ · https://www.sumup.com/nb-no/priser/
- Zettle: https://www.zettle.com/dk/priser · https://www.zettle.com/no/priser
- Stripe: https://stripe.com/en-dk/pricing · https://stripe.com/en-no/pricing
- Nuento: https://nuento.com/dk/da/foodtruck

**English markets**
- Techbullion UK list: https://techbullion.com/5-best-pos-systems-for-food-trucks-in-the-uk-2026-guide/
- Beat The Queue: https://beatthequeue.co.uk/article/food-truck-time-slots-guide
- Ordea: https://www.ordea.uk/
- Ordering.co: https://www.ordering.co/best-online-ordering-for-food-trucks-commission-free-pre-order
- Square AU: https://square.com/au/en/solutions/food-truck
- Moneris: https://www.moneris.com/en/industries/restaurants/food-truck
- Where The Truck: https://wherethetruck.at
- Qhop: https://www.qhop.com.au/
- HungryTrucks: https://www.hungrytrucks.com/partners.html
- Street Food Spot: https://streetfoodspot.nz/
- Square Community thread: https://community.squareup.com/t5/Food-Beverage-Group-Discussion/food-truck/m-p/158725
- Demand:
  - IBISWorld US: https://www.ibisworld.com/united-states/market-research-reports/food-trucks-industry/
  - ISED Canada: https://ised-isde.canada.ca/app/ixb/cis/performance/rev/72233
  - AU (Good Food): https://www.goodfood.com.au/eat-out/news/sydneys-food-trucks-take-business-back-to-the-streets-20200515-h1o2oe

**European scan**
- DE: https://www.sumup.com/de-de/press/foodtrucks2024/
- FR: https://tool-advisor.fr/logiciel-de-caisse/comparatif/logiciel-de-caisse-food-truck/ · https://eatch.app/
- ES: https://monei.com/es/monei-pay/food-truck-pos-system/
- IT: https://www.teamsystem.com/horeca/cassa-in-cloud/prezzi/
- RO: https://zilesinopti.ro/evenimente/food-truck-festival-brasov-2026/
- HU: https://www.portfolio.hu/uzlet/20250421/strategiat-valtanak-a-magyar-food-truckok-olcsobb-menuk-es-szlovakiai-terjeszkedes-a-tulelesert-755633
- EE: https://balticguide.ee/en/tallinn-food-truck-festival-2026/
- LU: https://luxtoday.lu/fr/knowledge/food-trucks-au-luxembourg-pizzas-burgers-gastronomie-nationale
- CH: https://www.blick.ch/auto/abgefahren/restaurants-auf-raedern-die-schweizer-foodtruck-szene-boomt-id18591217.html
- Every results-page URL is in `keywords.csv`.

**HatchGrab live (fetched 24 Oct 2026)**
- https://www.hatchgrab.com/robots.txt
- https://www.hatchgrab.com/llms.txt
- https://www.hatchgrab.com/sitemap.xml
- https://www.hatchgrab.com/uk
- https://www.hatchgrab.com/us
- https://hatchgrab.com/ (307)
- Apple lookup: https://itunes.apple.com/lookup?id=6803543106&country=XX (gb and 12 others)

## 9 · Read-only SQL run

```sql
select pf.plan_key, pf.feature_key, pf.enabled from public.plan_features pf join public.plans p on p.key = pf.plan_key where p.is_public and p.active order by pf.feature_key, pf.plan_key;
```
(Errored: the column is `feature`, not `feature_key`.)

```sql
select country_code, enabled, locale, currency, short_name from public.country_settings where country_code in ('PL','CZ','SK','SE','NL','BE','DK','NO','GB','IE','US','CA','AU','NZ','FR','DE') order by country_code;
```
```sql
select country_code, plan_key, monthly_minor, included_online_minor, fee_bps from public.plan_prices where country_code in ('PL','CZ','SK','SE','NL','BE','DK','NO') order by country_code, plan_key;
```
```sql
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'plan_features' order by ordinal_position;
```
```sql
select pf.feature, string_agg(pf.plan_key || '=' || pf.enabled::text, ', ' order by pf.plan_key) as plans from public.plan_features pf join public.plans p on p.key = pf.plan_key where p.is_public and p.active group by pf.feature order by pf.feature;
```
