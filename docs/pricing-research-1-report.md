# pricing-research-1: is HatchGrab the cheapest food-truck ordering system in every country?

**Date:** 23 October 2026 · research only · no code, file or database change except this report and
`docs/pricing-research-1/competitors.csv` · read-only SQL only (§11) · nothing pushed or deployed · no `.env*` file opened ·
`outreach_templates` not touched.

**The prompt** arrived intact, and no two instructions contradicted each other. One fact the prompt assumes is not true:
**France has no `country_settings` row** (france-1's block B, which inserts it, has not been run), so France is
compared at the euro prices that block would insert (€29 / €69).

## 1 · One-page summary

"Cheapest rival" is the cheapest priced plan at the **medium** volume, counting what the **truck** pays. "Cheapest?"
reads small / medium / busy: Y = HatchGrab's cheapest plan is cheapest. An arrow (→) shows the result with the proposed
prices.

| Country | Tier | Switch | Cheapest rival at medium (focus) | Cheapest? S/M/B | HatchGrab % of medium revenue | Proposed change |
|---|---|---|---|---|---|---|
| US United States | Deep | ON | Best Food Trucks (BFT) — Online ordering (free to trucks) (food-truck) | NNN | 0.44% | None (structural) |
| GB United Kingdom | Deep | ON | Beat The Queue — Customer Covers Fee (Option 1) (food-truck) | NNN | 0.55% | None (structural) |
| CA Canada | Deep | ON | Food Truck Pub — Premium (food-truck) | YYY | 0.51% | None |
| AU Australia | Deep | ON | Ordering.co — Restaurant (food-truck) | YYY | 0.51% | None |
| DE Germany | Deep | off | GASTRODIGITAL — Online-Bestellsystem Flat (nearest-local) | YYY | 0.59% | None |
| FR France | Deep | no row | Truckons — Commandable (food-truck) | NNN | 0.59% | None (structural; no row yet) |
| ES Spain | Deep | off | TopEstrellas (Pedidos module) — Pedidos (nearest-local) | NNN | 0.59% | None (structural) |
| IT Italy | Deep | off | JMENU — Free (takeaway/delivery) (nearest-local) | NNN | 0.49% | None (structural) |
| NL Netherlands | Deep | off | Vev — Pro (food-truck) | NNN | 0.44% | None (structural) |
| BR Brazil | Deep | no row | VexMenu — Vex Black (food-truck) | NNN → NNN | 0.77% → 0.55% | New: R$ 59 / R$ 149 (Pro includes R$ 8.000) |
| MX Mexico | Deep | no row | OlaClick — Gratis (base) (nearest-local) | NNN → NNN | 0.85% → 0.54% | New: $349 / $849 (Pro includes $50,000) |
| JP Japan | Deep | no row | funfo — BASIC (nearest-local) | NNN → NNN | 0.75% → 0.38% | New: ¥1,980 / ¥2,980 (Pro includes ¥250,000) |
| IE Ireland | Standard | ON | Order Tiger — Online Ordering (food-truck) | YNN → YYY | 0.44% → 0.31% | Unlimited €69 → €49 (switched ON — Dominic decides) |
| NZ New Zealand | Standard | ON | HungryTrucks — Vendor (single plan shown) (food-truck) | NNN | 0.61% | None (structural; switched ON) |
| AT Austria | Standard | off | GASTRODIGITAL — Online-Bestellsystem pay per order (nearest-local) | YYY | 0.55% | None |
| CH Switzerland | Standard | off | Yoveletta — Gastro (food-truck) | YNN → YYY | 0.33% → 0.23% | Unlimited CHF 65 → CHF 45 |
| BE Belgium | Standard | off | none with a public price | YYY | 0.44% | None |
| PT Portugal | Standard | off | DineEasy — Pay as you go (nearest-local) | NYY → NYY | 0.74% → 0.63% | €29 / €69 → €25 / €59 (Pro includes €3,500) |
| SE Sweden | Standard | off | WEIQ — Seasonal package (nearest-local) | YNN → YYY | 0.67% → 0.57% | Unlimited 769 kr → 649 kr |
| DK Denmark | Standard | off | NemTakeAway — Standard (nearest-local) | YNN → YYY | 0.44% → 0.30% | Unlimited 519 kr. → 349 kr. |
| NO Norway | Standard | off | Favrit — Alt-i-ett kassesystem (from) (nearest-local) | YYY | 0.43% | None |
| FI Finland | Standard | off | Food4you — Kasvu (nearest-local) | YYY | 0.59% | None |
| PL Poland | Standard | off | UpMenu — Online ordering tier 3 (food-truck) | YYY → YYY | 0.85% → 0.61% | 129 zł / 299 zł → 79 zł / 189 zł (Pro includes 10 000 zł) |
| CZ Czech Republic | Standard | off | Menu55 — Objednávkový systém (nearest-local) | NNN → NNN | 0.80% → 0.63% | 699 Kč / 1 690 Kč → 399 Kč / 990 Kč (Pro includes 55 000 Kč) |
| RO Romania | Standard | off | Choice — Smart (nearest-local) | NNN → NNN | 0.83% → 0.51% | 149 lei / 369 lei → 89 lei / 199 lei (Pro includes 12.500 lei) |
| GR Greece | Standard | off | Spevdo — Starter (nearest-local) | YNN → YYY | 0.59% → 0.42% | Unlimited €69 → €49 |
| SG Singapore | Standard | no row | Take App — Business (nearest-local) | YNN → YYY | 0.84% → 0.50% | New: $29 / $59 (Pro includes $4,000) |
| HK Hong Kong | Standard | no row | MenuTiger — Advanced (nearest-local) | YNN → YYY | 0.80% → 0.55% | New: HK$119 / HK$269 (Pro includes HK$15,000) |
| MY Malaysia | Standard | no row | Take App — Business (nearest-local) | YYN → YYY | 0.99% → 0.59% | New: RM29 / RM69 (Pro includes RM4,000) |
| AE United Arab Emirates | Standard | no row | Zyda — Starter (nearest-local) | YNN → YNN | 0.83% → 0.55% | New: AED 59 / AED 149 (Pro includes AED 8,000) |
| TH Thailand | Standard | no row | MenuTiger — Advanced (nearest-local) | YYN → YYY | 0.99% → 0.58% | New: ฿199 / ฿449 (Pro includes ฿25,000) |
| BG Bulgaria | Light | off | none with a public price | YYY → YYY | 0.86% → 0.61% | €29 / €69 → €19 / €49 (Pro includes €2,500) |
| CY Cyprus | Light | off | Wiiz Eat — Online storefront (nearest-local) | YYY | 0.59% | None |
| EE Estonia | Light | off | Choice — Basic (free) - see notes for paid tiers (nearest-local) | YYY | 0.59% | None |
| HR Croatia | Light | off | none with a public price | YYY → YYY | 0.74% → 0.63% | €29 / €69 → €25 / €59 (Pro includes €3,500) |
| HU Hungary | Light | off | Choice — Basic (free) - see notes for paid tiers (nearest-local) | YYY → YYY | 0.80% → 0.54% | 10 990 Ft / 24 990 Ft → 6 990 Ft / 16 990 Ft (Pro includes 1 000 000 Ft) |
| LT Lithuania | Light | off | Choice — Basic (free) - see notes for paid tiers (nearest-local) | YYY → YYY | 0.74% → 0.63% | €29 / €69 → €25 / €59 (Pro includes €3,500) |
| LU Luxembourg | Light | off | none with a public price | YYY | 0.40% | None |
| LV Latvia | Light | off | Choice — Basic (free) - see notes for paid tiers (nearest-local) | YYY → YYY | 0.74% → 0.63% | €29 / €69 → €25 / €59 (Pro includes €3,500) |
| MT Malta | Light | off | none with a public price | YYY | 0.59% | None |
| SI Slovenia | Light | off | none with a public price | YYY → YYY | 0.74% → 0.63% | €29 / €69 → €25 / €59 (Pro includes €3,500) |
| SK Slovakia | Light | off | Choice — Basic (free) - see notes for paid tiers (nearest-local) | YYY → YYY | 0.82% → 0.63% | €29 / €69 → €15 / €39 (Pro includes €2,000) |
| GI Gibraltar | Light | off | none with a public price | YYY | 0.59% | None |
| LI Liechtenstein | Light | off | Pikit — Essentiel (nearest-local) | YYY | 0.28% | None |
| IN India | Light | no row | none with a public price | YYY → YYY | 0.99% → 0.54% | New: ₹349 / ₹849 (Pro includes ₹50,000) — planning only |
| ID Indonesia | Light | no row | Take App — Business (nearest-local) | YYY → YYY | 0.99% → 0.55% | New: Rp 49.000 / Rp 129.000 (Pro includes Rp 7.000.000) — planning only |

### ⚠️ Read first: what the table means

1. **HatchGrab is cheapest at all three volumes in 23 of 46 countries today, and in 32 with the prices proposed here.**
   - 8 of the 23 have no competitor with a public price at all: BE, BG, HR, LU, MT, SI, GI and IN.
   - Already far cheaper than every priced rival (own charge ≤ half the cheapest rival's at every volume, so no rise
     is recommended; that is your call): **CA, AT, FI, EE, HU, LT, LV, SK**.
2. **In 9 countries no price inside the Pay as you go / Pro / Unlimited structure can make HatchGrab cheapest:**
   US, GB, FR, ES, IT, NL, NZ, CZ and JP (plus BR and MX, which have no prices yet).
   - In each one a rival is free to the truck, is paid for by the customer, or charges a flat fee below our Pro:
     - US: Best Food Trucks (free; only Stripe's fee).
     - GB: Beat The Queue (customer pays 50p) and Storekit (£0).
     - FR: Truckons (€0; customer service fee).
     - IT: JMENU (customer pays €0.50).
     - NL: Qrder (€29 unlimited).
     - ES: TopEstrellas (€24).
     - NZ: HungryTrucks (NZ$46).
     - CZ: Menu55 (350 Kč).
     - JP: funfo (¥0).
   - The only ways to win on price there are outside the plan structure: a 0% Pay as you go, or an Unlimited at or
     below Pro. **That is for you to decide**, so I have not proposed it. The per-country sections give the exact price to beat.
3. **Unlimited is the weak spot, not Pro.** Flat-fee tools at €29–59 beat Unlimited €69 for medium and busy trucks.
   - Where a cut keeps Unlimited at least 1.5× Pro, it is proposed: IE €49, GR €49, CH CHF 45, SE 649 kr, DK 349 kr.
   - **Ireland is switched ON**, so its change is listed separately for you (§10.2).
4. **The prompt's affordability measure barely varies.** "HatchGrab's cheapest plan as a share of medium online
   revenue" is capped at 0.99% everywhere, because Pay as you go is a flat 0.99%. It ranges from 0.28% (LI) to 0.99%
   (MY, TH, IN, ID at euro-converted prices), against the UK's 0.55%.
   - The sharper test is **Pro's price in local meals**: UK £29 = 1.81 Numbeo meals. A country more than 25% above that
     (> 2.27 meals) is out of line.
   - Out of line today: **PL 3.2, CZ 3.5, RO 3.0, HU 2.75, BG 2.8, SK 3.6, HR/LT/LV/SI/PT 2.4**.
   - Also out of line, converted from the euro: every planned non-euro country, from SG 2.8 up to ID 19.6.
   - Proposed prices bring all of these to 1.6–2.1 meals.
5. **Where we lose only on card processing, plan prices can't fix it.** Our own charge is the lowest in these, but
   the rival's card rate beats Stripe's standard one:
   - Romania: Choice, 1.5% + ~0.5 lei against Stripe's 1.5% + 1 lei.
   - UAE: Zyda's 2.5% gateway against Stripe's 2.9% + AED 1.
   - Brazil: VexMenu's 2.99% Pix rate against Stripe's 3.99% + R$0.39 card rate. Stripe's Pix is invite-only.
6. **Two blockers for planned countries:**
   - **Indonesia:** Stripe takes no cards there, only bank-transfer virtual accounts, so HatchGrab's card flow cannot
     run.
   - **The registry:** none of BRL, MXN, JPY, SGD, HKD, MYR, AED, THB, INR or IDR is in `lib/currencies.ts` or the
     currency CHECK. Adding one takes two edits, and JPY is zero-decimal at Stripe.
7. **Coverage is uneven.** A shared web-search cap (200 per turn) cut the first pass short in every group, and a second
   gap-filling pass covered most holes. Still thin:
   - **AU:** both truck tools (Where The Truck, Qhop) hide their prices.
   - **IE, PT, IT:** no local food-truck SaaS exists.
   - **Light tier:** one or two searches each.
   - **Unverified:** most VAT treatment and every marketplace commission line.

## 2 · Method

- **Volumes:** small = 150 online orders a month, medium = 600, busy = 2,000. Each order is 1.3× the local meal price.
- **Meal price:** Numbeo "Meal, Inexpensive Restaurant" for every country, cited and checked 23 Oct 2026. I used one
  source everywhere, so the countries are comparable.
  - It is a cheap sit-down meal. Food-truck mains are often a little lower, and the research agents' own street-food
    estimates are in each country's notes.
  - **Sensitivity:** at 0.75× the meal price, only three small-volume verdicts change (ES, NZ and RO become cheapest at
    small). Nothing else moves.
- **Total = subscription + platform fees + card processing.** All three are paid by the truck, for the same orders,
  all paid online by card.
- **HatchGrab** is the cheapest of its three plans for that volume:
  - Pay as you go: 0.99% of online food.
  - Pro: its price, plus 0.99% above the included amount.
  - Unlimited: its price.
  - Card processing is the rate the country's row assumes (§3). For planned countries it is Stripe's local standard rate.
- **Competitors:**
  - **Price used:** the advertised monthly price. The yearly per-month price is used only when no monthly price exists.
  - **Setup fees** are spread over 12 months.
  - **Order caps:** a plan that caps orders below the volume is not counted for that volume (e.g. Qrder Lite ≤ 150,
    MENU TIGER Regular ≤ 500). Plans with included orders add their per-order overage (UpMenu, Goomer, Plick).
  - **Card rate:** a bundled or stated card rate is used. Otherwise I assumed the same Stripe rate HatchGrab pays,
    marked ¹. Several "free" tools publish no card rate, so their real cost is probably higher than shown.
- **Fees the customer pays** (Beat The Queue's 50p, Food Truck Pub's $1.25, JMENU's €0.50, Zay-OS's 99¢) are not in
  the truck's total. They are shown beside it in brackets, and the "all-in" verdict counts them.
- **Not counted** (still in the CSV):
  - prices hidden ("contact sales");
  - GloriaFood: closed to new sign-ups, shutting 30 Apr 2027;
  - Spot (UAE): its 2022 app has vanished;
  - FoodTruck POS's founder price: first 50 customers only.
- **VAT:** compared as advertised. Most competitor prices are ex-VAT or don't say (CSV column `vat`). HatchGrab's EU
  plan prices carry reverse-charge VAT (france-1 terms), so for a VAT-registered truck both sides are net.
- **Exchange rates:** ECB reference rates of **22 Oct 2026**, the latest published when checked on 23 Oct:
  - 1 EUR = 0.8377 GBP, 1.1205 USD, 1.5725 CAD, 1.598 AUD, 1.9724 NZD, 0.9211 CHF, 11.112 SEK, 7.4747 DKK, 10.488 NOK;
  - 4.3695 PLN, 24.26 CZK, 366.43 HUF, 5.345 RON;
  - 5.6574 BRL, 21.0215 MXN, 175.97 JPY;
  - 1.4315 SGD, 8.7845 HKD, 4.5756 MYR, 37.811 THB, 106.249 INR, 20,253.88 IDR;
  - AED 4.1150, via the 3.6725 USD peg.
- **Exclusions** (your decision): general POS and payment giants, and delivery marketplaces. Small local POS-led
  tools with a food-truck page were kept and are marked in the notes, so you can drop them: Liefersoft, Yoveletta,
  WEIQ, Favrit, Klikit, Perkss, Grafterr, Aphelios.
- **Proposed-price rules:**
  - **Affordability:** where Pro is more than 1.25× the UK's 1.81 meals, Pro and Unlimited are scaled to about 1.8 and
    4.3 meals, rounded to native price points. Pro's included amount keeps the UK's ratio (≈138× Pro), so Pro still
    pays off before overage. Fees stay at 0.99%.
  - **Competition:** where a paid flat plan beats Unlimited at medium or busy, Unlimited moves to the next native "…9"
    price below it, but only if it stays ≥ 1.5× Pro. Otherwise the gap is marked **structural**.
  - **Extra vans:** the plan's own price, as today.

## 3 · HatchGrab's own prices today (live `plan_prices` + `country_settings`, 23 Oct 2026)

- **How prices were set** (docs/native-prices-report.md and docs/europe-settings-report.md §8):
  - The euro ladder (€29 Pro including €4,000, €69 Unlimited, Pay as you go 0.99%) was fixed by the europe brief.
  - The other European currencies were converted from it at the ECB rates of 22 Oct 2026 and rounded to local price
    points.
  - native-prices changed only how prices are *written* (home symbol), not the amounts.
  - GB/US share the £29/$29 numbers.
  - CA/AU are $39 / $99; NZ is $49 / $119.
- **The platform fee:** `fee_bps` is 99 on Pay as you go and Pro and 0 on Unlimited in every row. But
  `platform_fee_enabled` is false in every row, so **no fee is actually collected yet**. This report compares the
  advertised model.
- **Trucks today:** only GB (5 demo, 6 trial) and US (1 trial). No truck is on a paid plan, so a change in a
  switched-off country reaches nobody.

| Code | Switch | Currency | Pay as you go | Pro | Pro includes | Unlimited | fee_bps (payg / pro / unl) | Card, online (pct + minor) |
|---|---|---|---|---|---|---|---|---|
| US | ON | USD | $0 + 0.99% | $29 | $4,000 | $69 | 99 / 99 / 0 | 2.9% + 30 |
| GB | ON | GBP | £0 + 0.99% | £29 | £4,000 | £69 | 99 / 99 / 0 | 1.5% + 20 |
| CA | ON | CAD | $0 + 0.99% | $39 | $5,500 | $99 | 99 / 99 / 0 | 2.9% + 30 |
| AU | ON | AUD | $0 + 0.99% | $39 | $5,500 | $99 | 99 / 99 / 0 | 1.65% + 30 |
| DE | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| FR | no row | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| ES | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| IT | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| NL | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| IE | ON | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| NZ | ON | NZD | $0 + 0.99% | $49 | $7,000 | $119 | 99 / 99 / 0 | 2.65% + 30 |
| AT | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| CH | off | CHF | CHF 0 + 0.99% | CHF 27 | CHF 3’700 | CHF 65 | 99 / 99 / 0 | 2.9% + 30 |
| BE | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| PT | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| SE | off | SEK | 0 kr + 0.99% | 329 kr | 45 000 kr | 769 kr | 99 / 99 / 0 | 1.5% + 180 |
| DK | off | DKK | 0 kr. + 0.99% | 219 kr. | 30.000 kr. | 519 kr. | 99 / 99 / 0 | 1.5% + 180 |
| NO | off | NOK | 0 kr + 0.99% | 299 kr | 42 000 kr | 729 kr | 99 / 99 / 0 | 2.4% + 200 |
| FI | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| PL | off | PLN | 0 zł + 0.99% | 129 zł | 17 500 zł | 299 zł | 99 / 99 / 0 | 1.5% + 100 |
| CZ | off | CZK | 0 Kč + 0.99% | 699 Kč | 100 000 Kč | 1 690 Kč | 99 / 99 / 0 | 1.5% + 650 |
| RO | off | RON | 0 lei + 0.99% | 149 lei | 21.500 lei | 369 lei | 99 / 99 / 0 | 1.5% + 100 |
| GR | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| BG | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| CY | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| EE | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| HR | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| HU | off | HUF | 0 Ft + 0.99% | 10 990 Ft | 1 500 000 Ft | 24 990 Ft | 99 / 99 / 0 | 1.5% + 8500 |
| LT | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| LU | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| LV | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| MT | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| SI | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| SK | off | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 |
| GI | off | GBP | £0 + 0.99% | £29 | £4,000 | £69 | 99 / 99 / 0 | 1.5% + 20 |
| LI | off | CHF | CHF 0 + 0.99% | CHF 27 | CHF 3’700 | CHF 65 | 99 / 99 / 0 | 1.5% + 30 |
| FR | no row | EUR | €0 + 0.99% | €29 | €4,000 | €69 | 99 / 99 / 0 | 1.5% + 25 (france-1 block B, not run) |

## 4–9 · Per country (Deep, then Standard, then Light)

¹ = card rate not published by the rival; Stripe's local standard rate assumed. "(+N customer)" = fees added to the
customer's bill, not paid by the truck. Every competitor plan, with all STEP 4 fields and features, is in
`docs/pricing-research-1/competitors.csv` (232 rows).

### US · United States (Deep)

- **Meal price:** $20 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=United+States)), checked 23 Oct 2026. Order value 1.3× = USD 26.00. Online revenue: small USD 3,900 · medium USD 15,600 · busy USD 52,000.
- **Exchange rate:** 1 EUR = 1.1205 USD (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go $0 + 0.99% · Pro $29 incl. $4,000 of online orders, then 0.99% · Unlimited $69, no fee. Card processing assumed by the row: 2.9% + USD 0.30 online (30 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.44%** of online revenue (UK 0.55%). Pro = 1.45 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Hotplate — Single plan (no subscription)](https://www.hotplate.com/pricing) | pop-up | USD 0/mo; + 5% + USD 0.55 per order (vendor); VAT excl | bundled: 2.9% + 0.3 | yes |
| [Best Food Trucks (BFT) — Online ordering (free to trucks)](https://customers.bestfoodtrucks.com/blog/bft-online-ordering) | food-truck | USD 0/mo; VAT excl | separate: 2.9% + 0.3 | yes |
| [StreetFoodFinder — Vendor plan](https://streetfoodfinder.com/pricing) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Truckster — Truckster Vendor](https://apps.apple.com/us/app/id1375287755) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Goodfynd — Free](https://goodfynd.com/pricing) | food-truck | USD 0/mo; USD 0/mo yearly; VAT excl | unknown | yes |
| [Goodfynd — Pro](https://goodfynd.com/pricing) | food-truck | USD 40/mo; USD 33.33/mo yearly; VAT excl | unknown | yes |
| [Goodfynd — Growth](https://goodfynd.com/pricing) | food-truck | USD 80/mo; USD 66.67/mo yearly; VAT excl | unknown | yes |
| [Food Truck ONE (Food Truck OS) — Free](https://foodtruckone.com/#pricing) | food-truck | USD 0/mo; VAT excl | unknown | yes |
| [Food Truck ONE (Food Truck OS) — Pro](https://foodtruckone.com/#pricing) | food-truck | USD 39/mo; USD 32.5/mo yearly; VAT excl | separate: 2.9% + 0.3 | yes |
| [Food Truck ONE (Food Truck OS) — Fleet](https://foodtruckone.com/#pricing) | food-truck | USD 99/mo; USD 82.5/mo yearly; VAT excl | separate: 2.9% + 0.3 | yes |
| [Moonrise — Pioneer (launch pricing)](https://ordermoonrise.com/pricing.html) | food-truck | USD 0/mo; VAT excl | separate: 2.9% + 0.3 | yes |
| [Zay-OS (Zayos) — Operator](https://zay-os.com/pricing) | food-truck | USD 399/mo; + USD 0.99 per order (customer); VAT excl | separate: 2.9% + 0.3 | yes |
| [Zay-OS (Zayos) — Operator + Tablet](https://zay-os.com/pricing) | food-truck | USD 499/mo; + USD 0.99 per order (customer); VAT excl | separate: 2.9% + 0.3 | yes |
| [Zay-OS (Zayos) — Concierge](https://zay-os.com/pricing) | food-truck | USD 599/mo; + USD 0.99 per order (customer); VAT excl | separate: 2.9% + 0.3 | yes |
| [Food Truck Pub — Free](https://foodtruck.pub/plans.aspx) | food-truck | USD 0/mo; + USD 1.25 per order (customer); VAT excl | separate: 2.9% + 0.3 | yes |
| [Food Truck Pub — Premium](https://foodtruck.pub/plans.aspx) | food-truck | USD 29/mo yearly; + USD 0.6 per order (customer); VAT excl | separate: 2.9% + 0.3 | yes |
| [Outbites — Per-order (no monthly)](https://outbites.com/pricing) | food-truck | USD 0/mo; + USD 1 per order (split); VAT excl | separate: 2.9% + 0.3 | yes |
| [Where's The Foodtruck — Free listing](https://wheresthefoodtruck.com/vendors.html) | food-truck | USD 0/mo; VAT excl | unknown | yes |
| [Truckfindr — Quote](https://truckfindr.com/) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Ordering.co — Subscription](https://www.ordering.co/best-online-ordering-for-food-trucks-commission-free-pre-order) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Restolabs — Basic / Growth / Pro](https://restolabs.com/pricing) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Homegrown — Single plan](https://findhomegrown.com/signup) | street-food/markets | USD 12.5/mo; USD 10/mo yearly; VAT excl | separate: 2.9% + 0.3 | yes |
| [Owner.com — Flexible](https://www.owner.com/pricing) | nearest-local | USD 249/mo; + 5% per order (split); VAT excl | unknown | yes |
| [Owner.com — Flat Rate](https://www.owner.com/pricing) | nearest-local | USD 499/mo; VAT excl | unknown | yes |
| [ChowNow — Pro (from third-party sources)](https://get.chownow.com/pricing/) | nearest-local | USD 229/mo; USD 199/mo yearly; setup USD 119; VAT excl | bundled: 2.95% + 0.29 | yes |
| [Menufy — Month-to-month](https://restaurant.menufy.com/pricing) | nearest-local | USD 179/mo; VAT excl | unknown | yes |
| [Menufy — Annual](https://restaurant.menufy.com/pricing) | nearest-local | USD 149/mo yearly; VAT excl | unknown | yes |
| [The Foody Gram — Web Based Menu](https://www.thefoodygram.com/pages/pricing) | nearest-local | USD 34.95/mo; setup USD 109.9; VAT excl | separate: 2.9% + 0.3 | yes |
| [The Foody Gram — Online Ordering](https://www.thefoodygram.com/pages/pricing) | nearest-local | USD 119/mo; setup USD 699.99; VAT excl | separate: 2.9% + 0.3 | yes |
| [The Foody Gram — Custom Website + Ordering](https://www.thefoodygram.com/pages/pricing) | nearest-local | USD 139/mo; setup USD 899.99; VAT excl | separate: 2.9% + 0.3 | yes |
| [Snackpass — Custom](https://www.snackpass.co/) | nearest-local | hidden (contact sales) | unknown | price hidden |

| Monthly total, USD (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 197 | 787 | 2,623 |
| HatchGrab Pro | 187 ✓ | 776 | 2,612 |
| HatchGrab Unlimited | 227 | 701 ✓ | 2,177 ✓ |
| Best Food Trucks (BFT) — Online ordering (free to trucks) | 158 | 632 | 2,108 |
| Goodfynd — Free | 158¹ | 632¹ | 2,108¹ |
| Food Truck ONE (Food Truck OS) — Free | 158¹ | 632¹ | 2,108¹ |
| Moonrise — Pioneer (launch pricing) | 158 | 632 | 2,108 |
| Food Truck Pub — Free | 158 (+188 customer) | 632 (+750 customer) | 2,108 (+2,500 customer) |
| Where's The Foodtruck — Free listing | 158¹ | 632¹ | 2,108¹ |
| Homegrown — Single plan | 171 | 645 | 2,120 |
| Food Truck Pub — Premium | 187 (+90 customer) | 661 (+360 customer) | 2,137 (+1,200 customer) |
| … 17 more priced plans in the CSV | | | |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **Proposed change:** None (structural). Best Food Trucks gives trucks online ordering free (only Stripe's 2.9% + 30¢), so no HatchGrab plan price can beat it; Food Truck ONE (free / $39) and Goodfynd ($0 / $40) also undercut Unlimited at busy. Matching needs a 0% Pay as you go, which is outside the plan structure: Dominic's call.
- **Marketplaces (context only, excluded):** DoorDash Basic/Plus/Premier 15/25/30% delivery, 6% pickup; Uber Eats Lite/Plus 15/25% delivery, 6% pickup (as listed on Moonrise's comparison page); Grubhub similar 15-30%.
- **Research notes:** Crowded field of small food-truck tools, most with free or low entry tiers: Food Truck ONE (free / $39 / $99), Goodfynd (free / $40 / $80, KDS $10 add-on), Food Truck Pub (free, customer pays $1.25), Moonrise ($0 launch, Denver only), Outbites ($1/order), BFT (free ordering). Hotplate (0/mo, 5%+55c + 2.9%+30c) is pop-up/baker-focused. Excluded: Square/Toast/Clover/GoTab (POS), BentoBox (restaurant websites), Fooda (corporate catering), Roaming Hunger (catering bookings only now), TruckHub (offline back-office, $99 once), TruckBux (no current pricing, appears dormant), discovery-only apps without ordering (FoodTrukt $4.99/$14.99, Find Food Trucks $58.99, Kraven $6.99-69.99 ordering 'coming soon', GrubTrucks, BuildMyMap, Glympse). Several vendor sites (BFT, StreetFoodFinder, ChowNow, Homegrown) blocked automated reading.

### GB · United Kingdom (Deep)

- **Meal price:** £16 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=United+Kingdom)), checked 23 Oct 2026. Order value 1.3× = GBP 20.80. Online revenue: small GBP 3,120 · medium GBP 12,480 · busy GBP 41,600.
- **Exchange rate:** 1 EUR = 0.8377 GBP (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go £0 + 0.99% · Pro £29 incl. £4,000 of online orders, then 0.99% · Unlimited £69, no fee. Card processing assumed by the row: 1.5% + GBP 0.20 online (20 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.55%** of online revenue (UK 0.55%). Pro = 1.81 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Beat The Queue — Customer Covers Fee (Option 1)](https://beatthequeue.co.uk/) | food-truck | GBP 0/mo; + GBP 0.5 per order (customer) | separate: 1.5% + 0.2 | yes |
| [Beat The Queue — Platform Pricing / Absorb All Fees (Option 2)](https://beatthequeue.co.uk/) | food-truck | GBP 0/mo; + 1.4% + GBP 0.1 per order (vendor) | separate: 1.5% + 0.2 | yes |
| [Ordea — Free](https://www.ordea.uk/) | food-truck | GBP 0/mo; + 3% per order (vendor) | separate: 1.5% + 0.2 | yes |
| [Ordea — Enterprise](https://www.ordea.uk/) | food-truck | hidden (contact sales) | separate: 1.5% + 0.2 | price hidden |
| [Weevi — Core (first location)](https://www.weevi.com/food-trucks/pricing) | food-truck | GBP 71/mo | separate | yes |
| [Perkss — Essential (weekly billing)](https://perkss.co.uk/pricing/) | food-truck | GBP 54.17/mo | unknown | yes |
| [Aphelios — Starter](https://apheliossoftware.com/Price) | food-truck | GBP 29.99/mo | separate: 1.5% + 0.2 | yes |
| [Grafterr — Standard](https://www.grafterr.com/uk/epos-pricing) | food-truck | GBP 55/mo | unknown | yes |
| [NOQ — Events / markets](https://noqgroup.com/) | street-food/markets | hidden (contact sales) | bundled | price hidden |
| [Slerp — Web ordering / with branded app](https://www.slerp.com/ai-info-page/) | nearest-local | GBP 125/mo; setup GBP 500 | bundled | yes |
| [Flipdish — Essential Package (POS + online ordering)](https://www.flipdish.com/gb/pricing) | nearest-local | GBP 139/mo; GBP 119/mo yearly; VAT excl | bundled | yes |
| [Storekit — Starter](https://storekit.com/pricing) | nearest-local | GBP 0/mo; VAT excl | bundled | yes |
| [Yoello — n/a](https://www.yoello.com/) | nearest-local | hidden (contact sales) | unknown | price hidden |
| [GloriaFood — Free + Online Payments add-on](https://www.gloriafood.com/pricing) | nearest-local | USD 29/mo | separate | closed to new sign-ups; shuts 30 Apr 2027 |
| [Order Tiger — Online Ordering](https://www.ordertiger.com/online-ordering-system-pricing) | food-truck | GBP 59/mo | separate: 1.5% + 0.2 | yes |

| Monthly total, GBP (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 108 | 431 | 1,436 |
| HatchGrab Pro | 106 ✓ | 420 | 1,425 |
| HatchGrab Unlimited | 146 | 376 ✓ | 1,093 ✓ |
| Beat The Queue — Customer Covers Fee (Option 1) | 77 (+75 customer) | 307 (+300 customer) | 1,024 (+1,000 customer) |
| Storekit — Starter | 77¹ | 307¹ | 1,024¹ |
| Aphelios — Starter | 107 | 337 | 1,054 |
| Perkss — Essential (weekly billing) | 131¹ | 361¹ | 1,078¹ |
| Grafterr — Standard | 132¹ | 362¹ | 1,079¹ |
| Order Tiger — Online Ordering | 136 | 366 | 1,083 |
| Weevi — Core (first location) | 148¹ | 378¹ | 1,095¹ |
| Flipdish — Essential Package (POS + online ordering) | 216¹ | 446¹ | 1,163¹ |
| … 3 more priced plans in the CSV | | | |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **Proposed change:** None (structural). Beat The Queue costs the truck £0 when the customer pays its 50p, and Storekit is £0 with an unpublished card rate, so no plan price wins on truck-paid cost. HatchGrab is cheaper than Beat The Queue's truck-paid option (1.4% + 10p), cheaper all-in once its 50p is counted, and cheaper than Ordea (3%), Order Tiger (£59) and Weevi (£71). Aphelios (£29.99 flat) beats Unlimited at busy; matching it needs Unlimited ≈ Pro.
- **Marketplaces (context only, excluded):** Context only, not re-verified today: Uber Eats ~30% delivery / lower for pickup; Deliveroo ~25-35%; Just Eat ~14% (own delivery) to ~30%+ (Just Eat delivery).
- **Research notes:** Real food-truck competitors with public prices: Beat The Queue (50p/order customer-paid, or 1.4%+10p vendor-paid, £0/month, menu-from-image, custom domain) and Ordea (3%, £0/month). Both are pay-per-order with no subscription - cheaper than HatchGrab Pro for small trucks. Perkss/Aphelios/Grafterr are small UK EPOS vendors with food-truck pages. Hotplate is US-only (help centre: 'Not yet' international). Ordering.co prices only in USD. Feast It now redirects to Togather (event catering booking, no ordering). KERB/StreetFeast are market operators, not software; markets use NOQ. Truckly/Kaboodle: nothing UK found. OrderPay/Butlr/QikServe/Tabology are pub/enterprise table ordering - not listed. Foodhub treated as marketplace (excluded).

### CA · Canada (Deep)

- **Meal price:** $25 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Canada)), checked 23 Oct 2026. Order value 1.3× = CAD 32.50. Online revenue: small CAD 4,875 · medium CAD 19,500 · busy CAD 65,000.
- **Exchange rate:** 1 EUR = 1.5725 CAD (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go $0 + 0.99% · Pro $39 incl. $5,500 of online orders, then 0.99% · Unlimited $99, no fee. Card processing assumed by the row: 2.9% + CAD 0.30 online (30 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.51%** of online revenue (UK 0.55%). Pro = 1.56 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Food Truck Pub — Free](https://foodtruck.pub/plans.aspx) | food-truck | USD 0/mo; + USD 1.25 per order (customer); VAT excl | separate | yes |
| [Food Truck Pub — Premium](https://foodtruck.pub/plans.aspx) | food-truck | USD 29/mo yearly; + USD 0.6 per order (customer); VAT excl | separate | yes |
| [FoodTrucker - Find & Order — Truck owner](https://apps.apple.com/ca/app/foodtrucker-find-order/id6760668126) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Ritual — Partner](https://ritual.co) | nearest-local | hidden (contact sales) | unknown | price hidden |
| [Moduurn — Quote](https://www.capterra.ca/software/200188/moduurn) | nearest-local | hidden (contact sales) | unknown | price hidden |

| Monthly total, CAD (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 235 | 939 | 3,128 |
| HatchGrab Pro | 225 ✓ | 923 | 3,113 |
| HatchGrab Unlimited | 285 | 844 ✓ | 2,584 ✓ |
| Food Truck Pub — Premium | 353¹ | 1,291¹ | 4,210¹ |
| Food Truck Pub — Free | 450¹ | 1,798¹ | 5,993¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Already far cheaper than Food Truck Pub, the only priced food-truck tool usable in Canada (its per-order fee is billed to Canadian trucks). Not recommending a rise.
- **Marketplaces (context only, excluded):** Uber Eats, DoorDash and SkipTheDishes take roughly 15-30% on delivery (Canadian rate cards not verified this run).
- **Research notes:** No Canadian-built food-truck ordering tool with public prices found. Food Truck Pub (US company, USD, supports Canada via Square) is the only food-truck tool with a public price usable in Canada. Hotplate is US-only; BFT, Goodfynd, Food Truck ONE, Moonrise, Zay-OS are US-focused. Nearest local: Ritual (Toronto) and Moduurn (Victoria) - both quote-only. Vancouver 'Street Food App' and old Montreal 'PEDRO' are finder apps without ordering. Stripe Canada 2.9%+C$0.30 is the reference processor rate. Search budget ran out before Square CA rates and French-language Quebec tools could be checked further.

### AU · Australia (Deep)

- **Meal price:** $25 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Australia)), checked 23 Oct 2026. Order value 1.3× = AUD 32.50. Online revenue: small AUD 4,875 · medium AUD 19,500 · busy AUD 65,000.
- **Exchange rate:** 1 EUR = 1.598 AUD (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go $0 + 0.99% · Pro $39 incl. $5,500 of online orders, then 0.99% · Unlimited $99, no fee. Card processing assumed by the row: 1.65% + AUD 0.30 online (30 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.51%** of online revenue (UK 0.55%). Pro = 1.56 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Where The Truck (AMFVG) — Vendor listing + in-app ordering](https://wherethetruck.at) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Qhop — Stall holder](https://www.qhop.com.au/) | street-food/markets | hidden (contact sales) | unknown | price hidden |
| [Bopple — Online ordering](https://bopple.com/pricing) | nearest-local | AUD 49/mo; + 1.64% + AUD 0.1 per order (vendor); VAT excl | separate: 1.6% | yes |
| [Order Up! (moving to Nomni) — Online / table ordering](https://www.orderup.com.au/) | nearest-local | hidden (contact sales) | unknown | price hidden |
| [Liven — Starter / Essential / Pro / Enterprise](https://liven.love/pricing) | nearest-local | hidden (contact sales) | unknown | price hidden |
| [HungryHungry — Basic Bite / Main Course / Ultimate Feast](https://www.hungryhungry.com/plans) | nearest-local | hidden (contact sales) | unknown | price hidden |
| [Ordering.co — Restaurant](https://www.ordering.co/pricing) | food-truck | USD 99/mo | separate | yes |

| Monthly total, AUD (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 174 | 695 | 2,316 |
| HatchGrab Pro | 164 ✓ | 679 | 2,301 |
| HatchGrab Unlimited | 224 | 601 ✓ | 1,772 ✓ |
| Ordering.co — Restaurant | 267¹ | 643¹ | 1,814¹ |
| Bopple — Online ordering | 222 | 741 | 2,355 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Cheapest at all three: Bopple (A$49 + 1.64% + 10c) and Ordering.co (US$99) are dearer; Where The Truck and Qhop hide their prices.
- **Marketplaces (context only, excluded):** Context only, from memory and not re-checked today: Uber Eats about 30% on delivery and lower on pickup; DoorDash plans about 6-30%. MOBI's site has an article on Menulog's exit from Australia.
- **Research notes:** Very few tools are built for trucks, and none of those publish prices. Where The Truck (owned by AMFVG; 500+ trucks on a map, order ahead in the app) and Qhop (festival stalls, pop-ups, food trucks; kitchen bump screen, daily payouts) are the real truck-focused rivals, and both hide their vendor fees. The cheapest tool with a public price is Bopple (Brisbane, restaurants and cafes): A$49/mo plus a 1.64% + A$0.10 platform fee. Bopple also has a free Storefront plan, but it cannot take online orders. Stripe AU is now 1.65% + A$0.30 domestic, 3.5% + A$0.30 international, GST included (stripe.com/au/pricing, checked 2026-10-23), not the 1.7% in the brief. Bopple's help centre and a news piece on me&u both mention an RBA card surcharge ban: me&u replaced its 1.7% card surcharge with a guest 'platform fee'. If that ban is in force, AU trucks cannot pass card fees to customers, which matters for HatchGrab's 'processing separate' message. Please verify. Left out on purpose: me&u / Mr Yum (venue table ordering for pubs; guest fee A$0.20-2.90 per order, venue price not published), Hey You (cafe order-ahead, no public price), Ordermate and Abacus (POS), Gimme (personal shopping, not food), Snack Tracker (truck tracking app, no ordering seen), RationalGo (custom app builder). Food Truck Pub (US; free plan with a US$1.25 customer fee per order, Premium US$29/mo billed annually) says it supports Square and PayPal internationally, but it shows no AU price or presence, so it is not counted. No pages were found for Truckmate, Food Trucks Near Me or Hungry Hub (Hungry Hub is Thai). Gap pass, 23 Oct 2026: still no Australian truck-focused tool with a public price. Where The Truck: the homepage shows no vendor pricing and /work-with-us returns 404; the only contact is hello@wherethetruck.at, so price_hidden stays. Leads checked with nothing found: Tuckerbox (in-seat stadium ordering, no pricing), OrderLord (UK delivery management, no AU price), Yumbi (enterprise multi-brand, quote only), Snapzi / Fooders / TruckyTrack / Hungry Truck (no trace), ExpressQ (event pre-order startup; domain no longer resolves), Skip (Melbourne cafe order-ahead, no merchant price), RationalGo (custom app builder). Next Order's /pricing served UK GBP prices (£109/mo monthly, £79/mo annual) and Flipdish /au/pricing served EUR (€129/mo monthly, €99/mo annual, POS bundle), so neither shows an AUD price; both are left out. Ordermentum (B2B wholesale) and Swiftpos (POS) were excluded without checking. New rows: Liven (hidden), HungryHungry (hidden), Ordering.co (US$99, global).

### DE · Germany (Deep)

- **Meal price:** €15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Germany)), checked 23 Oct 2026. Order value 1.3× = EUR 19.50. Online revenue: small EUR 2,925 · medium EUR 11,700 · busy EUR 39,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Liefersoft — STARTUP](https://liefersoft.de/) | food-truck | EUR 39/mo; setup EUR 199; VAT excl | bundled: 6% + 0.09 | yes |
| [Liefersoft — GOLD](https://liefersoft.de/) | food-truck | EUR 129/mo; setup EUR 299; VAT excl | bundled: 6% + 0.09 | yes |
| [FoodsHero — Start](https://foodshero.de/preise) | nearest-local | EUR 99/mo; setup EUR 299; VAT excl | separate | yes |
| [FoodsHero — Business](https://foodshero.de/preise) | nearest-local | EUR 249/mo; setup EUR 799; VAT excl | separate | yes |
| [GASTRODIGITAL — Online-Bestellsystem pay per order](https://gastro.digital/preise/) | nearest-local | EUR 0/mo; + EUR 0.49 per order (vendor) | unknown | yes |
| [GASTRODIGITAL — Online-Bestellsystem Flat](https://gastro.digital/preise/) | nearest-local | EUR 99/mo | unknown | yes |
| [Bestelltheke — Start](https://bestelltheke.de/#preise) | nearest-local | EUR 0/mo; + 5% per order (vendor); VAT excl | separate: 1.4% + 0.25 | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 110 ✓ | 441 | 1,471 |
| HatchGrab Pro | 110 | 431 | 1,460 |
| HatchGrab Unlimited | 150 | 394 ✓ | 1,154 ✓ |
| GASTRODIGITAL — Online-Bestellsystem Flat | 180¹ | 424¹ | 1,184¹ |
| FoodsHero — Start | 205¹ | 449¹ | 1,209¹ |
| GASTRODIGITAL — Online-Bestellsystem pay per order | 155¹ | 620¹ | 2,065¹ |
| FoodsHero — Business | 397¹ | 641¹ | 1,401¹ |
| Bestelltheke — Start | 225 | 713 | 1,445 |
| Liefersoft — STARTUP | 245 | 812 | 2,576 |
| Liefersoft — GOLD | 343 | 910 | 2,674 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Cheapest at all three; GASTRODIGITAL (€0.49 per order) is closest at busy. Liefersoft (€39 + 6% bundled card) loses on card cost.
- **Marketplaces (context only, excluded):** Lieferando ~13% (restaurant delivers/collection) to ~30% (Lieferando couriers); Uber Eats/Wolt ~30% delivery — from general knowledge, not re-verified today
- **Research notes:** No German SaaS built only for food-truck pre-order with a public price was found. Liefersoft (POS suite with Foodtruck segment, 24-month contracts, 6% bundled webshop rate) is the only food-truck-marketed one with prices; FoodsHero lists food trucks but is an agency-style €99+/mo + €299 setup. Craftplaces Business / Foodtrucks-Deutschland (1,400+ trucks) does tour schedules and booking requests, free registration, no ordering feature found. Truckbase is freight-trucking software (irrelevant). Hey Pickup not found. Jamezz (NL) markets food-truck ordering in German, quote only. ORDERU (das-shopsystem.de) snippet: €25/mo annual + €0.98/order, page blocked (403), not verified.

### FR · France (Deep)

- **Meal price:** €15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=France)), checked 23 Oct 2026. Order value 1.3× = EUR 19.50. Online revenue: small EUR 2,925 · medium EUR 11,700 · busy EUR 39,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Eatch — Standard (all-in-one: site, app, NF525 till, click & collect)](https://eatch.app/#pricing) | food-truck | EUR 89/mo; VAT excl | separate: 1.5% + 0.25 | yes |
| [Beau Camion — Click & Collect (module)](https://beaucamion.fr/pricing) | food-truck | EUR 49/mo | unknown | yes |
| [Beau Camion — Synergie (website + Click & Collect)](https://beaucamion.fr/pricing) | food-truck | EUR 69/mo; setup EUR 1290 | unknown | yes |
| [Truckons — Commandable](https://truckons.com/rejoindre) | food-truck | EUR 0/mo | bundled | yes |
| [Truckons — Au camion](https://truckons.com/rejoindre) | food-truck | EUR 29/mo | bundled | yes |
| [Truckons — Clé en main](https://truckons.com/click-and-collect-food-truck) | food-truck | EUR 69/mo | bundled | yes |
| [Nomad (nomadcaisse.fr) — Start](https://www.nomadcaisse.fr/#tarifs) | food-truck | EUR 59/mo; setup EUR 250 | n/a | yes |
| [Nomad (nomadcaisse.fr) — Pro](https://www.nomadcaisse.fr/#tarifs) | food-truck | EUR 99/mo; setup EUR 250 | separate: 1.5% + 0.25 | yes |
| [Place à emporter — One-off installation (owned site)](https://placeaemporter.fr/) | food-truck | EUR 0/mo; setup EUR 2000 | n/a | yes |
| [Achil — Gratuit](https://achil.com/web/food-truck/tarifs/) | nearest-local | EUR 0/mo; setup EUR 249 | bundled: 1.9% + 0.19 | yes |
| [Achil — Standard](https://achil.com/web/food-truck/tarifs/) | nearest-local | EUR 19.99/mo; EUR 14.99/mo yearly; setup EUR 199 | bundled: 1.7% + 0.17 | yes |
| [Restaurant-internet.com — E-commerce](https://restaurant-internet.com/pricing) | nearest-local | EUR 39/mo; EUR 39/mo yearly | separate: 1.5% + 0.25 | yes |
| [Heustach — Single offer (no subscription)](https://heustach.fr/je-suis-commercant/tarifs/) | nearest-local | EUR 0/mo; + EUR 0.25 per order (vendor); VAT excl | separate: 1.5% + 0.25 | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 110 ✓ | 441 | 1,471 |
| HatchGrab Pro | 110 | 431 | 1,460 |
| HatchGrab Unlimited | 150 | 394 ✓ | 1,154 ✓ |
| Truckons — Commandable | 0 | 0 | 0 |
| Achil — Standard | 112 | 337 | 1,040 |
| Truckons — Au camion | 110¹ | 354¹ | 1,114¹ |
| Achil — Gratuit | 105 | 357 | 1,142 |
| Restaurant-internet.com — E-commerce | 120 | 364 | 1,124 |
| Beau Camion — Click & Collect (module) | 130¹ | 374¹ | 1,134¹ |
| Truckons — Clé en main | 150¹ | 394¹ | 1,154¹ |
| Nomad (nomadcaisse.fr) — Start | 161¹ | 405¹ | 1,165¹ |
| … 5 more priced plans in the CSV | | | |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **Proposed change:** None (structural; no row yet). Truckons' Commandable plan is €0 to the truck (the customer pays a service fee that also covers card costs), and Restaurant-internet (€19), Achil (€0) and Heustach (€0.25/order) undercut too. Beau Camion (€49), Nomad (€59+) and Eatch (€89) are beaten. No plan price fixes this; France still has no country_settings row (france-1 block B not run).
- **Marketplaces (context only, excluded):** Uber Eats FR 15-30% depending on plan; Deliveroo negotiated case by case (Fooderise 2026 summary); marketplace click & collect ~10-15%.
- **Research notes:** France is the most crowded market in the group. Several small food-truck-specific tools publish prices: Eatch, Beau Camion, Truckons, Nomad, Place a emporter. Truckons (Rennes, launched Dec 2025) is the closest model match: discovery map plus click & collect, with a EUR 0 plan where the CUSTOMER pays a service fee. Loktruck is a discovery app with pre-order still 'planned' (pilot: 0 EUR / 0%), so it is not listed. Circlee, Foodr, Obypay, Zelty and Sunday have no public price or are POS/QR-pay (Sunday is restaurant table pay); not listed. Unverified search snippets also mention commandeici (EUR 29.99/mo after 3 months at EUR 1), OrdraFood (free up to 20 orders, Pro EUR 19.99 HT) and ClickService (EUR 29.99 HT); these are restaurant tools without food-truck pages. Meal vouchers (titres-restaurant) are a feature French trucks care about (Truckons and Beau Camion mention them).

### ES · Spain (Deep)

- **Meal price:** €15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Spain)), checked 23 Oct 2026. Order value 1.3× = EUR 19.50. Online revenue: small EUR 2,925 · medium EUR 11,700 · busy EUR 39,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Ordeno App — n/a](https://foodtruckya.com/es/proveedores/software-y-tecnologia/ordeno-app) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Check — n/a](https://foodtruckya.com/es/proveedores/software-y-tecnologia/check) | food-truck | hidden (contact sales) | unknown | price hidden |
| [FesteaPay — n/a](https://foodtruckya.com/es/proveedores/software-y-tecnologia/festeapay) | street-food/markets | hidden (contact sales) | bundled | price hidden |
| [PAYMEZONE — Kiosk + MOSTACHA order system](https://paymezone.com) | food-truck | hidden (contact sales) | unknown | price hidden |
| [TopEstrellas (Pedidos module) — Pedidos](https://topestrellas.com/modulos/sistema-pedidos-restaurantes/) | nearest-local | EUR 24/mo | unknown | yes |
| [pidopago — pidopago (annual)](https://pidopago.com/) | nearest-local | EUR 30.42/mo yearly | separate: 1.5% + 0.25 | yes |
| [Cheerfy Shop — Shop](https://en.cheerfy.com/pricing/shop) | nearest-local | EUR 29/mo; + 2.5% per order (vendor); setup EUR 99 | separate | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 110 ✓ | 441 | 1,471 |
| HatchGrab Pro | 110 | 431 | 1,460 |
| HatchGrab Unlimited | 150 | 394 ✓ | 1,154 ✓ |
| TopEstrellas (Pedidos module) — Pedidos | 105¹ | 350¹ | 1,109¹ |
| pidopago — pidopago (annual) | 112 | 356 | 1,115 |
| Cheerfy Shop — Shop | 163¹ | 626¹ | 1,392¹ |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **Proposed change:** None (structural). TopEstrellas (€24 flat, unlimited, nearest-local) beats HatchGrab by €5–45; matching needs Unlimited under €24, below Pro. The four Spanish food-truck apps (Ordeno, Check, FesteaPay, PAYMEZONE) hide their prices.
- **Marketplaces (context only, excluded):** Glovo / Uber Eats / Just Eat: roughly 15-35% per order (vendor-cited range; no official ES rate card checked).
- **Research notes:** Some food-truck/event ordering apps exist (found via the FoodTruckYa supplier directory: Ordeno App, Check, FesteaPay, PAYMEZONE), but NONE publishes a price. The public-price options are generic restaurant tools: TopEstrellas (lists food trucks as a sector), pidopago, Cheerfy. GloriaFood (Oracle) is NOT a live option: closed to new restaurants, end of life 30 Apr 2027 (secondary sources). Last.app and Revo are POS, so excluded.

### IT · Italy (Deep)

- **Meal price:** €18 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Italy)), checked 23 Oct 2026. Order value 1.3× = EUR 23.40. Online revenue: small EUR 3,510 · medium EUR 14,040 · busy EUR 46,800.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.49%** of online revenue (UK 0.55%). Pro = 1.61 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [DineEasy — Pay as you go](https://www.dineeasy.app/it/pricing) | nearest-local | EUR 0/mo; + 2.5% per order (vendor) | separate: 1.5% + 0.25 | yes |
| [JMENU — Free (takeaway/delivery)](https://www.jmenu.it/takeaway-delivery-per-ristoranti-pizzerie/) | nearest-local | EUR 0/mo; + EUR 0.5 per order (customer) | separate | yes |
| [Qromo — Pro](https://qromo.it/prezzi/) | nearest-local | EUR 59/mo; EUR 49/mo yearly | bundled: 1.99% + 0.2 | yes |
| [xMenu — From](https://www.xmenu.it/it) | nearest-local | EUR 39/mo | unknown | yes |
| [Ordinalo — DELIVERY (site + app ordering)](https://www.ordinalo.com/prezzi/) | nearest-local | EUR 82.5/mo yearly | separate | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 125 | 500 | 1,665 |
| HatchGrab Pro | 119 ✓ | 489 | 1,655 |
| HatchGrab Unlimited | 159 | 430 ✓ | 1,271 ✓ |
| JMENU — Free (takeaway/delivery) | 90 (+75 customer)¹ | 361 (+300 customer)¹ | 1,202 (+1,000 customer)¹ |
| xMenu — From | 129¹ | 400¹ | 1,241¹ |
| Ordinalo — DELIVERY (site + app ordering) | 173¹ | 443¹ | 1,284¹ |
| Qromo — Pro | 159 | 458 | 1,390 |
| DineEasy — Pay as you go | 178 | 712 | 2,372 |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **Proposed change:** None (structural). JMENU is €0 to the truck (the customer pays €0.50 an order), and xMenu (€39 flat) beats Unlimited at busy. HatchGrab is cheaper all-in than JMENU at small. No Italian food-truck SaaS with a public price exists.
- **Marketplaces (context only, excluded):** Just Eat / Deliveroo / Glovo: roughly 15-35% per order (Booxit-cited range; no official rate card checked).
- **Research notes:** No Italian food-truck-specific ordering platform with public prices was found. Berti Food Truck has its own single-brand app with pickup slots, which is not a SaaS. Famenu markets a QR menu 'per food truck' (Free / Pro EUR 11.90 / Premium EUR 24.90) but has NO ordering, so it is not listed. DineEasy (Swiss, EU-hosted, 2.5% per online order) has an Italian food-truck/pop-up page, and Qromo lists food trucks in its FAQ. Deliverart (TeamSystem; Capterra says 'from EUR 40') is delivery-aggregation, not checked further. Booxit has no public price. Coverage is incomplete: the search budget ran out before the Comandi/Sbam/MenuDigitale/Plateform/Mangiaebasta leads could be checked (MenuDigitale.io is a menu-only product at EUR 9.90/mo per Stello).

### NL · Netherlands (Deep)

- **Meal price:** €20 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Netherlands)), checked 23 Oct 2026. Order value 1.3× = EUR 26.00. Online revenue: small EUR 3,900 · medium EUR 15,600 · busy EUR 52,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.44%** of online revenue (UK 0.55%). Pro = 1.45 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Qrder — Gratis](https://qrder.app/pricing) | food-truck | EUR 0/mo | separate | plan caps at 50 orders |
| [Qrder — Lite](https://qrder.app/pricing) | food-truck | EUR 9/mo | separate | plan caps at 150 orders |
| [Qrder — Pro](https://qrder.app/pricing) | food-truck | EUR 29/mo | separate: 1.5% + 0.25 | yes |
| [Digitale Menukaart — Bestellen](https://digitalemenukaart.nl/prijzen) | food-truck | EUR 39/mo; EUR 32.5/mo yearly; VAT excl | n/a | yes |
| [FoodTruck POS — Pro](https://foodtruckpos.nl/) | food-truck | EUR 29.99/mo | separate | yes |
| [FoodTruck POS — Founder (first 50 customers)](https://foodtruckpos.nl/) | food-truck | EUR 12.99/mo | separate | founder price for the first 50 customers only |
| [Foodticket — All-in (bestelsite + kassa + betaalsysteem)](https://foodticket.nl/foodtruck/) | food-truck | EUR 45.63/mo | unknown | yes |
| [Jamezz — Webshop / QR ordering](https://jamezz.com/industries/food-trucks) | food-truck | hidden (contact sales) | separate | price hidden |
| [Vev — Pro](https://vev.co/specialty/foodtruck) | food-truck | USD 19.99/mo; VAT excl | unknown | yes |
| [Bestelly — Start](https://bestelly.nl/) | nearest-local | EUR 39/mo; EUR 32.5/mo yearly; setup EUR 249 | separate | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 135 | 538 | 1,795 |
| HatchGrab Pro | 125 ✓ | 528 | 1,784 |
| HatchGrab Unlimited | 165 | 453 ✓ | 1,349 ✓ |
| Qrder — Lite | 105¹ | — (plan caps at 150 orders) | — (plan caps at 150 orders) |
| Vev — Pro | 114¹ | 402¹ | 1,298¹ |
| Qrder — Pro | 125 | 413 | 1,309 |
| FoodTruck POS — Pro | 126¹ | 414¹ | 1,310¹ |
| Digitale Menukaart — Bestellen | 135¹ | 423¹ | 1,319¹ |
| Foodticket — All-in (bestelsite + kassa + betaalsysteem) | 142¹ | 430¹ | 1,326¹ |
| Bestelly — Start | 156¹ | 444¹ | 1,340¹ |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **Proposed change:** None (structural). Qrder (food-truck page; €9 up to 150 orders, €29 unlimited, own Stripe) beats HatchGrab at every scenario; matching needs Unlimited ≤ €29 = Pro. Vev ($19.99, currency unconfirmed) and FoodTruck POS's founder price (€12.99, first 50 customers) also undercut.
- **Marketplaces (context only, excluded):** Thuisbezorgd ~13% own delivery to ~30% with their couriers; Uber Eats ~30% — general knowledge, not re-verified
- **Research notes:** Most crowded market: several cheap food-truck-marketed tools. Qrder (€0/€9/€29, own Stripe, WhatsApp, location sharing) is the most direct HatchGrab-like rival; Digitale Menukaart €39 excl; FoodTruck POS €12.99–29.99; Foodticket €1.50/day. None found with true collection time-slot picker + public price except Bestelly (restaurant, €39 + €249 setup) and Jamezz (quote). Foodtruckbooking-style sites are event booking only.

### BR · Brazil (Deep)

- **Meal price:** R$ 35 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Brazil&displayCurrency=BRL)), checked 23 Oct 2026. Order value 1.3× = BRL 45.50. Online revenue: small BRL 6,825 · medium BRL 27,300 · busy BRL 91,000.
- **Exchange rate:** 1 EUR = 5.6574 BRL (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro BRL 164 incl. BRL 22,630, Unlimited BRL 390. Card processing assumed at Stripe's local standard rate 3.99% + 0.39.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.77%** of online revenue (UK 0.55%). Pro = 4.69 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [VexMenu — Grátis](https://vexmenu.com/para/food-truck) | food-truck | BRL 0/mo | bundled: 2.99% + 0.99 | yes |
| [VexMenu — Profissional](https://vexmenu.com/para/food-truck) | food-truck | BRL 299/mo | bundled: 1.99% + 0.99 | yes |
| [VexMenu — Vex Black](https://vexmenu.com/para/food-truck) | food-truck | BRL 499/mo; setup BRL 200 | bundled | yes |
| [Food Pronto — Plano único](https://www.foodpronto.com.br/) | food-truck | BRL 200/mo | separate | yes |
| [SisFood — Food truck setup](https://www.sisfood.com.br/segmentos/sistema-para-food-truck) | food-truck | hidden (contact sales) | separate | price hidden |
| [Soften Food — Food truck](https://www.softensistemas.com.br/segmentos/sistema-para-food-truck) | food-truck | hidden (contact sales) | separate | price hidden |
| [VirtualLine — (not published)](https://virtualline.com.br/) | food-truck | hidden (contact sales) | separate | price hidden |
| [Simpliza — A partir de](https://simpliza.com.br/food-truck.php) | food-truck | BRL 79/mo | unknown | yes |
| [Goomer — Grátis](https://goomer.com.br/planos) | nearest-local | BRL 0/mo; BRL 0/mo yearly; + BRL 1.39 per order (vendor) | unknown | yes |
| [Goomer — Básico (Delivery)](https://goomer.com.br/planos) | nearest-local | BRL 99.9/mo; BRL 59.94/mo yearly | unknown | yes |
| [Goomer — Automatizar](https://goomer.com.br/planos) | nearest-local | BRL 184.9/mo; BRL 138.68/mo yearly | unknown | yes |
| [Goomer — Integrar](https://goomer.com.br/planos) | nearest-local | BRL 299.9/mo; BRL 224.92/mo yearly | unknown | yes |
| [Anota AI — Mensal ≤150 pedidos](https://anota.ai/planos) | nearest-local | BRL 99.99/mo | unknown | plan caps at 150 orders |
| [Anota AI — Mensal 151–250 pedidos](https://anota.ai/planos) | nearest-local | BRL 199.99/mo | unknown | plan caps at 250 orders |
| [Anota AI — Mensal >250 pedidos](https://anota.ai/planos) | nearest-local | BRL 299.99/mo | unknown | yes |
| [Anota AI — Gestão Avançada](https://anota.ai/planos) | nearest-local | BRL 399.99/mo; BRL 339.99/mo yearly | unknown | yes |
| [OlaClick — Gratis (base)](https://pricing.olaclick.app/pt) | nearest-local | USD 0/mo; USD 0/mo yearly | unknown | yes |
| [OlaClick — Advanced](https://pricing.olaclick.app/pt) | nearest-local | USD 9.9/mo yearly | unknown | plan caps at 75 orders |
| [OlaClick — Premium](https://pricing.olaclick.app/pt) | nearest-local | USD 25/mo yearly | unknown | plan caps at 400 orders |
| [OlaClick — Elite](https://pricing.olaclick.app/pt) | nearest-local | USD 59/mo yearly | unknown | yes |
| [OlaClick — Impulso](https://pricing.olaclick.app/pt) | nearest-local | USD 160/mo yearly | unknown | yes |
| [Cardápio Web — Delivery / Premium / Mesas](https://www.cardapioweb.com/) | nearest-local | BRL 169.99/mo | unknown | yes |
| [Pedizap — Pedi rápido](https://pedizap.com.br/) | nearest-local | BRL 99/mo | unknown | yes |
| [Pedizap — Pedi mais](https://pedizap.com.br/) | nearest-local | BRL 149/mo | unknown | yes |
| [Pedizap — Pedi tudo](https://pedizap.com.br/) | nearest-local | BRL 199/mo | unknown | yes |

| Monthly total, BRL (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 398 ✓ | 1,594 | 5,312 |
| HatchGrab Pro (placeholder) | 495 | 1,534 ✓ | 5,252 |
| HatchGrab Unlimited (placeholder) | 721 | 1,714 | 4,801 ✓ |
| **HatchGrab proposed, cheapest plan** | **390** (Pro) | **1,472** (Unlimited) | **4,560** (Unlimited) |
| Anota AI — Mensal ≤150 pedidos | 431¹ | — (plan caps at 150 orders) | — (plan caps at 150 orders) |
| OlaClick — Premium | 457¹ | — (plan caps at 400 orders) | — (plan caps at 400 orders) |
| Anota AI — Mensal 151–250 pedidos | 531¹ | — (plan caps at 250 orders) | — (plan caps at 250 orders) |
| VexMenu — Vex Black | 664 | 1,110 | 2,496 |
| OlaClick — Gratis (base) | 331¹ | 1,323¹ | 4,411¹ |
| Simpliza — A partir de | 410¹ | 1,402¹ | 4,490¹ |
| VexMenu — Grátis | 353 | 1,410 | 4,701 |
| Pedizap — Pedi rápido | 430¹ | 1,422¹ | 4,510¹ |
| … 13 more priced plans in the CSV | | | |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **With the proposed prices:** small no · medium no · busy no; share of medium revenue 0.55%.
- **Proposed change:** New: R$ 59 / R$ 149 (Pro includes R$ 8.000). A euro conversion (R$ 164 / R$ 390) is 4.7 meals for Pro against the UK's 1.8; this brings it to 1.7. Still not cheapest: VexMenu's free plan charges a Pix rate (2.99%) below Stripe Brazil's card rate (3.99% + R$0.39), and OlaClick has a free tier — a payment-method gap, not a plan-price one.
- **Marketplaces (context only, excluded):** iFood Básico 12% + 3.2% online-payment fee + R$110/mo (if >R$1,800/mo sales); iFood Entrega 23% + 3.2% + R$150/mo (checked parceiros.ifood.com.br). 99Food/Keeta also present.
- **Research notes:** Several small BR tools market explicitly to food trucks: VexMenu (free plan, Pix 2.99%), Food Pronto (R$200/mo, closest like-for-like with 'order ready' push), plus POS-first SisFood/Soften/VirtualLine/Simpliza with hidden prices. VISU (visu.network) has a food-truck page but only does QR/link pages (Free, R$19/39/99) linking to an existing order channel - no ordering, so not listed. Pix dominates; Stripe BR Pix is invite-only (1.19%), cards 3.99%+R$0.39 - a HatchGrab BR launch needs Pix to compete. Most BR 'cardápio digital' tools are flat monthly R$99–300 with 0% commission. Food Truck OS (foodtruckone.com) sells USD-only, US-oriented - not counted.

### MX · Mexico (Deep)

- **Meal price:** $200 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Mexico&displayCurrency=MXN)), checked 23 Oct 2026. Order value 1.3× = MXN 260.00. Online revenue: small MXN 39,000 · medium MXN 156,000 · busy MXN 520,000.
- **Exchange rate:** 1 EUR = 21.0215 MXN (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro MXN 610 incl. MXN 84,086, Unlimited MXN 1,450. Card processing assumed at Stripe's local standard rate 3.6% + 3.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.85%** of online revenue (UK 0.55%). Pro = 3.05 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [OlaClick — Gratis (base)](https://olaclick.com/es/software-para-restaurantes/) | nearest-local | USD 0/mo; USD 0/mo yearly | unknown | yes |
| [OlaClick — Advanced](https://pricing.olaclick.app/es) | nearest-local | USD 9.9/mo yearly | unknown | plan caps at 75 orders |
| [OlaClick — Premium](https://pricing.olaclick.app/es) | nearest-local | USD 25/mo yearly | unknown | plan caps at 400 orders |
| [OlaClick — Elite](https://pricing.olaclick.app/es) | nearest-local | USD 59/mo yearly | unknown | yes |
| [OlaClick — Impulso](https://pricing.olaclick.app/es) | nearest-local | USD 160/mo yearly | unknown | yes |
| [TuMenúDigital — Básico](https://tumenudigital.mx/software-para-food-truck) | food-truck | MXN 149/mo | bundled: 6% | yes |
| [TuMenúDigital — Plus](https://tumenudigital.mx/software-para-food-truck) | food-truck | MXN 349/mo | bundled: 6% | yes |
| [TuMenúDigital — Pro](https://tumenudigital.mx/software-para-food-truck) | food-truck | MXN 899/mo | bundled: 5% | yes |
| [Plick — Starter](https://plick.com.mx/precios) | nearest-local | MXN 449/mo; MXN 413.25/mo yearly; + MXN 1.99 per order (vendor) | unknown | yes |
| [Plick — Plus](https://plick.com.mx/precios) | nearest-local | MXN 689/mo; MXN 537.42/mo yearly; + MXN 1.99 per order (vendor) | unknown | yes |
| [Plick — Profesional](https://plick.com.mx/precios) | nearest-local | MXN 909/mo; MXN 763.25/mo yearly; + MXN 1.99 per order (vendor) | unknown | yes |
| [QRico — Gratis](https://qrico.mx/) | nearest-local | MXN 0/mo; MXN 0/mo yearly | n/a | yes |
| [QRico — Esencial](https://qrico.mx/) | nearest-local | MXN 149/mo; MXN 124.17/mo yearly | unknown | yes |
| [QRico — Pro](https://qrico.mx/) | nearest-local | MXN 249/mo; MXN 207.5/mo yearly | unknown | yes |
| [QRico — Premium](https://qrico.mx/) | nearest-local | MXN 349/mo; MXN 290.83/mo yearly | unknown | yes |
| [Aparece — Gratis](https://aparece.mx/) | nearest-local | MXN 0/mo; MXN 0/mo yearly | n/a | yes |
| [Aparece — Pro](https://aparece.mx/) | nearest-local | MXN 299/mo | separate | yes |
| [Point (pointmeup) — (not published)](https://www.pointmeup.com/es/food-trucks) | food-truck | hidden (contact sales) | unknown | price hidden |

| Monthly total, MXN (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 2,240 ✓ | 8,960 | 29,868 |
| HatchGrab Pro (placeholder) | 2,464 | 8,738 ✓ | 29,645 |
| HatchGrab Unlimited (placeholder) | 3,304 | 8,866 | 26,170 ✓ |
| **HatchGrab proposed, cheapest plan** | **2,203** (Pro) | **8,265** (Unlimited) | **25,569** (Unlimited) |
| OlaClick — Premium | 2,323¹ | — (plan caps at 400 orders) | — (plan caps at 400 orders) |
| OlaClick — Gratis (base) | 1,854¹ | 7,416¹ | 24,720¹ |
| QRico — Gratis | 1,854¹ | 7,416¹ | 24,720¹ |
| Aparece — Gratis | 1,854¹ | 7,416¹ | 24,720¹ |
| QRico — Esencial | 2,003¹ | 7,565¹ | 24,869¹ |
| QRico — Pro | 2,103¹ | 7,665¹ | 24,969¹ |
| Aparece — Pro | 2,153¹ | 7,715¹ | 25,019¹ |
| QRico — Premium | 2,203¹ | 7,765¹ | 25,069¹ |
| … 8 more priced plans in the CSV | | | |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **With the proposed prices:** small no · medium no · busy no; share of medium revenue 0.54%.
- **Proposed change:** New: $349 / $849 (Pro includes $50,000). Brings Pro from 3.0 meals (euro conversion $610) to 1.75. Free tiers of OlaClick, QRico and Aparece (order limits unpublished) stay cheaper; TuMenúDigital, the food-truck tool (MX$149 + 6% bundled), is beaten.
- **Marketplaces (context only, excluded):** Delivery apps in MX (Uber Eats, Rappi, DiDi Food) charge ~15–30% per order (Mercado Pago MX blog; not checked per platform).
- **Research notes:** Only TuMenúDigital (dedicated food-truck page, MX$149–899, 5–6% on online card payments) and Point (POS, hidden price) target food trucks; the rest are generic QR-menu/WhatsApp-order tools (QRico, Aparece, Plick, OlaClick) at MX$0–909/mo. Stripe MX: 3.6% + MX$3 + IVA. Lavu MX has a food-truck POS page (online orders via MenuDrive) but is a general POS, price hidden - not listed. Waiterio shows MX section without numbers - not listed.

### JP · Japan (Deep)

- **Meal price:** ¥1,000 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Japan)), checked 23 Oct 2026. Order value 1.3× = JPY 1300.00. Online revenue: small JPY 195,000 · medium JPY 780,000 · busy JPY 2,600,000.
- **Exchange rate:** 1 EUR = 175.97 JPY (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro JPY 5,103 incl. JPY 703,880, Unlimited JPY 12,142. Card processing assumed at Stripe's local standard rate 3.6% + 0.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.75%** of online revenue (UK 0.55%). Pro = 5.10 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [KitchenCarMenu (キッチンカーメニュー) — Monthly](https://kitchencarmenu.com/pricing) | food-truck | JPY 3980/mo; VAT excl | separate: 3.6% | yes |
| [KitchenCarMenu (キッチンカーメニュー) — Annual](https://kitchencarmenu.com/pricing) | food-truck | JPY 3317/mo yearly; VAT excl | separate: 3.6% | yes |
| [モバレジ (Mobaregi, EDDYS FACTORY) — Single plan](https://mobaregi.jp/) | food-truck | JPY 0/mo | bundled: 4% | yes |
| [AdvaNceD IoT キッチンカー＆屋台スマートオーダーシステム (Device Agency) — Standard](https://and-iot.jp/smart-order-system) | food-truck | JPY 8980/mo; setup JPY 49800; VAT excl | separate: 3.6% | yes |
| [AdvaNceD IoT キッチンカー＆屋台スマートオーダーシステム (Device Agency) — Premium](https://and-iot.jp/smart-order-system) | food-truck | JPY 3980/mo; setup JPY 498000; VAT excl | separate: 3.6% | yes |
| [ISSUE PANDA (3bitter) — Quote](https://saas.imitsu.jp/cate-mobile-order/) | street-food/markets | hidden (contact sales) | unknown | price hidden |
| [O:der ToGo (Showcase Gig) — Quote](https://saas.imitsu.jp/cate-mobile-order/service/3799/price) | nearest-local | hidden (contact sales) | unknown | price hidden |
| [funfo — BASIC](https://www.lycbiz.com/jp/service/line-mini-app/package/funfo) | nearest-local | JPY 0/mo | separate | yes |
| [funfo — Pro / Lite](https://saas.imitsu.jp/cate-pos-register/service/4041/price) | nearest-local | JPY 5500/mo; JPY 4950/mo yearly | separate | yes |
| [どこでも注文くん (Chuzmonster) — Flat](https://lme.jp/media/system/anywhere-chumonkun/) | nearest-local | JPY 10000/mo | unknown | yes |
| [テイクイーツ (Take Eats) — Quote](https://take-eats.jp/) | nearest-local | hidden (contact sales) | unknown | price hidden |

| Monthly total, JPY (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 8,950 ✓ | 35,802 | 119,340 |
| HatchGrab Pro (placeholder) | 12,123 | 33,937 ✓ | 117,475 |
| HatchGrab Unlimited (placeholder) | 19,162 | 40,222 | 105,742 ✓ |
| **HatchGrab proposed, cheapest plan** | **8,950** (Pay as you go) | **31,060** (Unlimited) | **96,580** (Unlimited) |
| funfo — BASIC | 7,020¹ | 28,080¹ | 93,600¹ |
| モバレジ (Mobaregi, EDDYS FACTORY) — Single plan | 7,800 | 31,200 | 104,000 |
| KitchenCarMenu (キッチンカーメニュー) — Annual | 10,337 | 31,397 | 96,917 |
| KitchenCarMenu (キッチンカーメニュー) — Monthly | 11,000 | 32,060 | 97,580 |
| funfo — Pro / Lite | 12,520¹ | 33,580¹ | 99,100¹ |
| どこでも注文くん (Chuzmonster) — Flat | 17,020¹ | 38,080¹ | 103,600¹ |
| AdvaNceD IoT キッチンカー＆屋台スマートオーダーシステム (Device Agency) — Standard | 20,150 | 41,210 | 106,730 |
| AdvaNceD IoT キッチンカー＆屋台スマートオーダーシステム (Device Agency) — Premium | 52,500 | 73,560 | 139,080 |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **With the proposed prices:** small no · medium no · busy no; share of medium revenue 0.38%.
- **Proposed change:** New: ¥1,980 / ¥2,980 (Pro includes ¥250,000). A euro conversion (¥5,103 / ¥12,142) is 5.1 meals; ¥1,980 is 2.0. Unlimited ¥2,980 beats KitchenCarMenu, the closest food-truck rival (¥3,980, or ¥3,317 a month yearly). funfo BASIC (¥0, nearest-local, card rate unpublished) stays cheaper: structural.
- **Marketplaces (context only, excluded):** Uber Eats JP charges 35% of sales with Uber couriers or 15% for self-delivery, plus a ¥50,000 sign-up fee that is often waived (Itscom guide, Feb 2024). Demae-can's rate was not confirmed this run.
- **Research notes:** Real キッチンカー-specific tools exist: KitchenCarMenu ¥3,980/mo excl (cheapest flat, 0% fee), Mobaregi ¥0 + 4% all-in, Device Agency IoT system ¥8,980/mo + ¥49,800 setup + tablet. Market otherwise dominated by excluded POS (Square, Airレジ, STORES, スマレジ). Mellow SHOP STOP is a space-matching/discovery app (2,333 trucks Feb 2023) — no ordering feature found. TLUNCH: nothing found. Stripe JP 3.6% (no fixed). HatchGrab Pro at ~29 EUR ≈ ¥5,100 would sit above KitchenCarMenu.

### IE · Ireland (Standard)

- **Meal price:** €20 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.destination.com/chat-with/dublin/street-food-actually-good)), checked 23 Oct 2026. Order value 1.3× = EUR 26.00. Online revenue: small EUR 3,900 · medium EUR 15,600 · busy EUR 52,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.44%** of online revenue (UK 0.55%). Pro = 1.45 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Flipdish — Essential Package (POS + online ordering)](https://www.flipdish.com/ie/pricing) | nearest-local | EUR 139/mo; EUR 119/mo yearly; VAT excl | bundled | yes |
| [GloriaFood — Free + Online Payments add-on](https://www.gloriafood.com/pricing) | nearest-local | USD 29/mo | separate | closed to new sign-ups; shuts 30 Apr 2027 |
| [Order Tiger — Online Ordering](https://www.ordertiger.com/online-ordering-system-pricing) | food-truck | EUR 59/mo | separate: 1.5% + 0.25 | yes |
| [Click & Collection — Service](https://clickandcollection.com/new_pricing) | nearest-local | EUR 29/mo; + 2.9% per order (vendor) | separate: 1.5% + 0.25 | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 135 | 538 | 1,795 |
| HatchGrab Pro | 125 ✓ | 528 | 1,784 |
| HatchGrab Unlimited | 165 | 453 ✓ | 1,349 ✓ |
| **HatchGrab proposed, cheapest plan** | **125** (Pro) | **433** (Unlimited) | **1,329** (Unlimited) |
| Order Tiger — Online Ordering | 155 | 443 | 1,339 |
| Flipdish — Essential Package (POS + online ordering) | 235¹ | 523¹ | 1,419¹ |
| Click & Collection — Service | 238 | 865 | 2,817 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.31%.
- **Proposed change:** Unlimited €69 → €49 (switched ON — Dominic decides). Order Tiger (€59 flat, food-truck page, own Stripe) beats Unlimited €69 at medium and busy; €49 beats it with Pro and Pay as you go unchanged.
- **Marketplaces (context only, excluded):** Context only (unchanged from first pass): Deliveroo ~25-35%, Just Eat ~14%+, Uber Eats ~30%.
- **Research notes:** Verdict changed only narrowly: no Irish-BUILT food-truck tool exists, but Order Tiger (global restaurant ordering platform with a dedicated food-truck page, English site, EUR 59/mo flat for the EU) sells in EUR. Irish nearest-local found: Click & Collection (EUR 29/mo + 2.9%, Irish, pitches food trucks in a blog post). Mosey (Irish food discovery app incl. food trucks/markets, 'low commissions', no published rate) behaves like a marketplace - not listed. Beat The Queue: GBP-only, Taste Maps Ltd (London), England & Wales law, UK direct debit - no sign it accepts Irish traders. Ordea: UK-based, 'across the UK', England & Wales law, no Ireland/EUR mention. OrderYOYO (Danish) entered IE in 2021 at 5-10% commission (old article, not listed).

### NZ · New Zealand (Standard)

- **Meal price:** $25 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=New+Zealand)), checked 23 Oct 2026. Order value 1.3× = NZD 32.50. Online revenue: small NZD 4,875 · medium NZD 19,500 · busy NZD 65,000.
- **Exchange rate:** 1 EUR = 1.9724 NZD (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go $0 + 0.99% · Pro $49 incl. $7,000 of online orders, then 0.99% · Unlimited $119, no fee. Card processing assumed by the row: 2.65% + NZD 0.30 online (30 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.61%** of online revenue (UK 0.55%). Pro = 1.96 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [HungryTrucks — Vendor (single plan shown)](https://www.hungrytrucks.com/partners.html) | food-truck | NZD 46/mo | separate: 2.65% + 0.3 | yes |
| [Street Food Spot — Vendor](https://streetfoodspot.nz/) | food-truck | hidden (contact sales) | unknown | price hidden |
| [Bopple — Online ordering](https://bopple.com/pricing/fees) | nearest-local | NZD 49/mo; + 2.4% + NZD 0.1 per order (vendor); VAT excl | separate | yes |
| [MOBI (formerly Mobi2Go) — SMB](https://mobihq.com/pricing/smbs) | nearest-local | hidden (contact sales) | unknown | price hidden |

| Monthly total, NZD (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 222 ✓ | 890 | 2,966 |
| HatchGrab Pro | 223 | 870 | 2,946 |
| HatchGrab Unlimited | 293 | 816 ✓ | 2,442 ✓ |
| HungryTrucks — Vendor (single plan shown) | 220 | 743 | 2,368 |
| Bopple — Online ordering | 355¹ | 1,274¹ | 4,132¹ |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **Proposed change:** None (structural; switched ON). HungryTrucks (NZ$46 a month, commission unpublished, NZ$0.99 promo for six months) beats Unlimited NZ$119 at medium and busy; matching needs Unlimited under NZ$46, below Pro NZ$49.
- **Marketplaces (context only, excluded):** Context only, from memory and not re-checked: Uber Eats about 30% on delivery; DoorDash and Delivereasy also operate.
- **Research notes:** Two small NZ discovery-plus-ordering apps are built for food trucks: HungryTrucks (Auckland) and Street Food Spot (nationwide). HungryTrucks is the only one with a public price: NZ$46/mo normally, on promotion at $0.99/mo for 6 months. Its FAQ also mentions 'commission-on-order models', with no rate given. Stripe NZ is 2.65% + NZ$0.30 domestic and 3.5% + NZ$0.30 international (stripe.com/nz/pricing, checked 2026-10-23; GST treatment not stated). Mobi2Go has rebranded as MOBI (mobihq.com) and moved to quote-only pricing; it lists 'Food Trucks' as a restaurant type. The Ordermeal NZ pages found were for its delivery app only, with no vendor pricing. Nothing was found for Ritual NZ, Bite NZ or Foodtruck NZ.

### AT · Austria (Standard)

- **Meal price:** €16 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Austria)), checked 23 Oct 2026. Order value 1.3× = EUR 20.80. Online revenue: small EUR 3,120 · medium EUR 12,480 · busy EUR 41,600.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.55%** of online revenue (UK 0.55%). Pro = 1.81 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [GastroOnline & Winorder — unknown](https://gastro-online.at/) | food-truck | hidden (contact sales) | unknown | price hidden |
| [GASTRODIGITAL — Online-Bestellsystem pay per order](https://gastro.digital/preise/) | nearest-local | EUR 0/mo; + EUR 0.49 per order (vendor) | unknown | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 115 | 461 | 1,536 |
| HatchGrab Pro | 113 ✓ | 450 | 1,525 |
| HatchGrab Unlimited | 153 | 406 ✓ | 1,193 ✓ |
| GASTRODIGITAL — Online-Bestellsystem pay per order | 158¹ | 631¹ | 2,104¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Already far cheaper than GASTRODIGITAL (the only priced tool selling in Austria). Not recommending a rise.
- **Marketplaces (context only, excluded):** Lieferando and Foodora/Wolt ~13–30% — general knowledge, not re-verified
- **Research notes:** Only lead is GastroOnline & Winorder (names food trucks; site down, price unverified). Otherwise DACH-wide German tools (GASTRODIGITAL, Liefersoft, FoodsHero) apply.

### CH · Switzerland (Standard)

- **Meal price:** CHF 25 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Switzerland)), checked 23 Oct 2026. Order value 1.3× = CHF 32.50. Online revenue: small CHF 4,875 · medium CHF 19,500 · busy CHF 65,000.
- **Exchange rate:** 1 EUR = 0.9211 CHF (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go CHF 0 + 0.99% · Pro CHF 27 incl. CHF 3’700 of online orders, then 0.99% · Unlimited CHF 65, no fee. Card processing assumed by the row: 2.9% + CHF 0.30 online (30 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.33%** of online revenue (UK 0.55%). Pro = 1.08 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Yoveletta — Gastro](https://yoveletta.ch/preise) | food-truck | CHF 49/mo; CHF 40.83/mo yearly | unknown | yes |

| Monthly total, CHF (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 235 | 939 | 3,128 |
| HatchGrab Pro | 225 ✓ | 929 | 3,119 |
| HatchGrab Unlimited | 251 | 810 ✓ | 2,550 ✓ |
| **HatchGrab proposed, cheapest plan** | **225** (Pro) | **790** (Unlimited) | **2,530** (Unlimited) |
| Yoveletta — Gastro | 235¹ | 794¹ | 2,534¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.23%.
- **Proposed change:** Unlimited CHF 65 → CHF 45. Yoveletta's Gastro plan (CHF 49, food-truck page, POS-first) beats Unlimited at medium and busy; CHF 45 beats it. Switzerland is already cheap against its meal price (Pro = 1.1 meals vs the UK's 1.8) — flagged, no rise.
- **Marketplaces (context only, excluded):** Just Eat (eat.ch) and Uber Eats ~15–30% — general knowledge, not re-verified
- **Research notes:** Stripe CH 2.9% + CHF 0.30 for Swiss cards (verified stripe.com/ch/pricing). TWINT matters; Payrexx (Swiss payment provider, so excluded) publishes a food-truck webshop + on-site payment guide, TWINT QR sticker 1.3%, no monthly fee. Yoveletta is the only food-truck-marketed tool found (POS-first).

### BE · Belgium (Standard)

- **Meal price:** €20 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Belgium)), checked 23 Oct 2026. Order value 1.3× = EUR 26.00. Online revenue: small EUR 3,900 · medium EUR 15,600 · busy EUR 52,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.44%** of online revenue (UK 0.55%). Pro = 1.45 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Digitaste — Foodtruck kassasysteem + online ordering](https://www.digitaste.be/foodtruck) | food-truck | hidden (contact sales) | unknown | price hidden |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 135 | 538 | 1,795 |
| HatchGrab Pro | 125 ✓ | 528 | 1,784 |
| HatchGrab Unlimited | 165 | 453 ✓ | 1,349 ✓ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. No priced competitor (Digitaste is quote-only; the Belgian food-truck sites only book events). Pro = 1.45 meals, below the UK.
- **Marketplaces (context only, excluded):** Takeaway.com, Uber Eats, Deliveroo ~15–30% — general knowledge, not re-verified
- **Research notes:** No food-truck pre-order tool with a public BE price found. Digitaste (BE food-truck POS with 0%-commission online ordering) is quote-only (listed). Foodtruckbooking.be (€9.08/€16.88 per month) and Foodtruckbestellen.be Premium (~€37–40/mo, from search snippet) are event-booking directories only, no ordering. Dutch tools (Qrder, Jamezz, Digitale Menukaart) are Dutch-language and likely usable in Flanders, but BE selling not confirmed.

### PT · Portugal (Standard)

- **Meal price:** €12 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://doeatbetterexperience.com/es/blog/guia-time-out-market-lisboa/)), checked 23 Oct 2026. Order value 1.3× = EUR 15.60. Online revenue: small EUR 2,340 · medium EUR 9,360 · busy EUR 31,200.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.74%** of online revenue (UK 0.55%). Pro = 2.42 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [DineEasy — Pay as you go](https://www.dineeasy.app/pt) | nearest-local | EUR 0/mo; + 2.5% per order (vendor) | separate: 1.5% + 0.25 | yes |
| [MENU TIGER — Free](https://www.menutiger.com/pt/pricing) | nearest-local | USD 0/mo | unknown | plan caps at 75 orders |
| [MENU TIGER — Regular](https://www.menutiger.com/pt/pricing) | nearest-local | USD 17/mo | unknown | plan caps at 500 orders |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 96 ✓ | 383 | 1,277 |
| HatchGrab Pro | 102 | 372 | 1,266 |
| HatchGrab Unlimited | 142 | 359 ✓ | 1,037 ✓ |
| **HatchGrab proposed, cheapest plan** | **96** (Pay as you go) | **349** (Unlimited) | **1,027** (Unlimited) |
| MENU TIGER — Regular | 88¹ | — (plan caps at 500 orders) | — (plan caps at 500 orders) |
| DineEasy — Pay as you go | 131 | 524 | 1,748 |

- **HatchGrab cheapest (truck-paid)?** small no · medium yes · busy yes. Counting fees the customer pays too: small no · medium yes · busy yes.
- **With the proposed prices:** small no · medium yes · busy yes; share of medium revenue 0.63%.
- **Proposed change:** €29 / €69 → €25 / €59 (Pro includes €3,500). Affordability: Pro is 2.4 meals against the UK's 1.8. Cheapest at medium and busy; MENU TIGER Regular (US$17, up to 500 orders) still wins small by about €8.
- **Marketplaces (context only, excluded):** Uber Eats / Glovo / Bolt Food: roughly 15-30% (unchanged; Uber Eats 'Pedidos Online' own-site option was 10% in 2021).
- **Research notes:** Confirmed after 6 PT-language searches: no Portuguese food-truck ordering tool with public prices. Portuguese own-site leads are dead or price-less: Vincitables (site returns HTTP 500), eStart (2021, annual fee, amount not published), Zwypit/aCarta/Emenuk (QR menus, no ordering prices). Nearest public-price options are global: MENU TIGER (USD, PT-language page, free plan) and Order Tiger (EUR 59, food-truck page, but no Portuguese site so not counted for PT).

### SE · Sweden (Standard)

- **Meal price:** 147 kr — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Sweden)), checked 23 Oct 2026. Order value 1.3× = SEK 191.10. Online revenue: small SEK 28,665 · medium SEK 114,660 · busy SEK 382,200.
- **Exchange rate:** 1 EUR = 11.112 SEK (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go 0 kr + 0.99% · Pro 329 kr incl. 45 000 kr of online orders, then 0.99% · Unlimited 769 kr, no fee. Card processing assumed by the row: 1.5% + SEK 1.80 online (180 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.67%** of online revenue (UK 0.55%). Pro = 2.24 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [WEIQ — WEIQ Pro](https://weiq.tech/pris/) | nearest-local | SEK 750/mo | bundled | yes |
| [WEIQ — Seasonal package](https://weiq.tech/pris/) | nearest-local | SEK 666.67/mo yearly | bundled | yes |
| [Qopla — All](https://www.qopla.com/) | nearest-local | hidden (contact sales) | unknown | price hidden |

| Monthly total, SEK (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 984 ✓ | 3,935 | 13,117 |
| HatchGrab Pro | 1,029 | 3,819 | 13,000 |
| HatchGrab Unlimited | 1,469 | 3,569 ✓ | 10,102 ✓ |
| **HatchGrab proposed, cheapest plan** | **984** (Pay as you go) | **3,449** (Unlimited) | **9,982** (Unlimited) |
| WEIQ — Seasonal package | 1,367¹ | 3,467¹ | 10,000¹ |
| WEIQ — WEIQ Pro | 1,450¹ | 3,550¹ | 10,083¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.57%.
- **Proposed change:** Unlimited 769 kr → 649 kr. WEIQ (750 kr Pro; seasonal 8 000 kr a year ≈ 667 kr a month) beats Unlimited at medium and busy; 649 kr beats both. Pro (2.2 meals) is inside the band.
- **Marketplaces (context only, excluded):** Not verified today (search budget ran out). Wolt / Foodora / Bolt Food (excluded) are the main marketplaces; commission typically ~25-30% for delivery, lower for pickup (approx, unverified).
- **Research notes:** No Swedish food-truck pre-order tool found. Swedish food-truck sites are discovery (Foodtruckkartan.se) or event booking (Boka Foodtrucks, foodtruck.se, thefoodtruck.se). Nearest-local: WEIQ (Malmö small POS with online/QR ordering on Pro, plus a seasonal package). Qopla (Stockholm POS + online ordering) has no public prices. Note: Swedish takeaway food VAT cut 12%->6% from 1 Apr 2026 to 31 Dec 2027.

### DK · Denmark (Standard)

- **Meal price:** 150 kr. — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Denmark)), checked 23 Oct 2026. Order value 1.3× = DKK 195.00. Online revenue: small DKK 29,250 · medium DKK 117,000 · busy DKK 390,000.
- **Exchange rate:** 1 EUR = 7.4747 DKK (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go 0 kr. + 0.99% · Pro 219 kr. incl. 30.000 kr. of online orders, then 0.99% · Unlimited 519 kr., no fee. Card processing assumed by the row: 1.5% + DKK 1.80 online (180 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.44%** of online revenue (UK 0.55%). Pro = 1.46 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [NemTakeAway — Standard](https://www.nemtakeaway.dk/en/price/) | nearest-local | DKK 395/mo; DKK 355/mo yearly; setup DKK 399 | separate | yes |
| [NemTakeAway — Medium](https://www.nemtakeaway.dk/en/price/) | nearest-local | DKK 695/mo; DKK 625/mo yearly; setup DKK 699 | separate | yes |

| Monthly total, DKK (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 998 | 3,993 | 13,311 |
| HatchGrab Pro | 928 ✓ | 3,915 | 13,233 |
| HatchGrab Unlimited | 1,228 | 3,354 ✓ | 9,969 ✓ |
| **HatchGrab proposed, cheapest plan** | **928** (Pro) | **3,184** (Unlimited) | **9,799** (Unlimited) |
| NemTakeAway — Standard | 1,137¹ | 3,263¹ | 9,878¹ |
| NemTakeAway — Medium | 1,462¹ | 3,588¹ | 10,203¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.30%.
- **Proposed change:** Unlimited 519 kr. → 349 kr.. NemTakeAway (395 kr., 355 kr. yearly, + 399 kr. setup) beats Unlimited at medium and busy; 349 kr. beats it even on its yearly price.
- **Marketplaces (context only, excluded):** Not verified today (search budget ran out). Wolt / Foodora / Bolt Food (excluded) are the main marketplaces; commission typically ~25-30% for delivery, lower for pickup (approx, unverified).
- **Research notes:** No Danish food-truck ordering tool found. MobilMad.com is a food-truck event-booking/discovery marketplace (quote-based, no published truck fees), not pre-order. GuldKyllingen chain runs its own pre-order for its trucks. Nearest-local: NemTakeAway (Aarhus, 0% commission takeaway system). 'Ordrestyring' is a trades job-management tool, not food.

### NO · Norway (Standard)

- **Meal price:** 216 kr — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Norway)), checked 23 Oct 2026. Order value 1.3× = NOK 280.80. Online revenue: small NOK 42,120 · medium NOK 168,480 · busy NOK 561,600.
- **Exchange rate:** 1 EUR = 10.488 NOK (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go 0 kr + 0.99% · Pro 299 kr incl. 42 000 kr of online orders, then 0.99% · Unlimited 729 kr, no fee. Card processing assumed by the row: 2.4% + NOK 2.00 online (200 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.43%** of online revenue (UK 0.55%). Pro = 1.38 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Favrit — Alt-i-ett kassesystem (from)](https://web.favrit.com/pris) | nearest-local | NOK 899/mo; VAT excl | bundled | yes |
| [Superb — Plus](https://www.superbexperience.com/pricing) | nearest-local | hidden (contact sales) | bundled: 0.75% | price hidden |

| Monthly total, NOK (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 1,728 | 6,911 | 23,038 |
| HatchGrab Pro | 1,611 ✓ | 6,795 | 22,921 |
| HatchGrab Unlimited | 2,040 | 5,973 ✓ | 18,207 ✓ |
| Favrit — Alt-i-ett kassesystem (from) | 2,210¹ | 6,143¹ | 18,377¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Cheapest at all three: Favrit starts at 899 kr (POS, price set per setup). No Norwegian food-truck tool.
- **Marketplaces (context only, excluded):** Not verified today (search budget ran out). Wolt / Foodora / Bolt Food (excluded) are the main marketplaces; commission typically ~25-30% for delivery, lower for pickup (approx, unverified).
- **Research notes:** No Norwegian food-truck ordering tool found (searched 'foodtruck forhåndsbestilling app pris', 'nettbestilling restaurant pris', Vipps partner lists). Nearest-local: Favrit (POS + commission-free mobile ordering, from 899 NOK/mnd excl VAT, price set per setup; ordr.no redirects to Favrit) and Superb (Oslo POS; online takeaway only on Plus, price hidden). Both are POS products - borderline vs the POS exclusion. Vipps partners Payrest/JISP/Already Ordered/Weorder: no public prices found. Munchies.no does not resolve. Stripe NO 2.4% + NOK 2.00 for vendors' own Stripe.

### FI · Finland (Standard)

- **Meal price:** €15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 19.50. Online revenue: small EUR 2,925 · medium EUR 11,700 · busy EUR 39,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Food4you — Startti](https://food4you.fi/#hinnasto) | nearest-local | EUR 0/mo; + 3% per order (vendor); setup EUR 490; VAT excl | separate: 3.25% + 0.5 | yes |
| [Food4you — Aktiivinen](https://food4you.fi/#hinnasto) | nearest-local | EUR 39/mo; + 1.8% per order (vendor); setup EUR 490; VAT excl | separate: 3.25% + 0.5 | yes |
| [Food4you — Kasvu](https://food4you.fi/#hinnasto) | nearest-local | EUR 89/mo; + 1.2% per order (vendor); setup EUR 490; VAT excl | separate: 3.25% + 0.5 | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 110 ✓ | 441 | 1,471 |
| HatchGrab Pro | 110 | 431 | 1,460 |
| HatchGrab Unlimited | 150 | 394 ✓ | 1,154 ✓ |
| Food4you — Kasvu | 335 | 950 | 2,865 |
| Food4you — Aktiivinen | 303 | 971 | 3,049 |
| Food4you — Startti | 299 | 1,072 | 3,478 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Already far cheaper than Food4you (€0–89 + 1.2–3% + €490 setup), the only priced local tool. Not recommending a rise.
- **Marketplaces (context only, excluded):** Not verified today (search budget ran out). Wolt / Foodora / Bolt Food (excluded) are the main marketplaces; commission typically ~25-30% for delivery, lower for pickup (approx, unverified).
- **Research notes:** No Finnish ruokarekka pre-order tool found. Nearest-local with public prices: Food4you (Kajaani) - 0/39/89 €/kk + 3%/1.8%/1.2% per order, mandatory done-for-you setup €490+, all + ALV 25.5%, card via own Paytrail contract (3.25% + €0.50 on the €14.90/mo S plan). Menu Tiger (USD) and Flipdish (from €99/mo, theretailexec list) are the global alternatives.

### PL · Poland (Standard)

- **Meal price:** 40 zł — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Poland)), checked 23 Oct 2026. Order value 1.3× = PLN 52.00. Online revenue: small PLN 7,800 · medium PLN 31,200 · busy PLN 104,000.
- **Exchange rate:** 1 EUR = 4.3695 PLN (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go 0 zł + 0.99% · Pro 129 zł incl. 17 500 zł of online orders, then 0.99% · Unlimited 299 zł, no fee. Card processing assumed by the row: 1.5% + PLN 1.00 online (100 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.85%** of online revenue (UK 0.55%). Pro = 3.23 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [UpMenu — Online ordering tier 1](https://www.upmenu.com/pl/cennik/) | food-truck | PLN 169/mo; VAT excl | separate | yes |
| [UpMenu — Online ordering tier 2](https://www.upmenu.com/pl/cennik/) | food-truck | PLN 289/mo; VAT excl | separate | yes |
| [UpMenu — Online ordering tier 3](https://www.upmenu.com/pl/cennik/) | food-truck | PLN 499/mo; VAT excl | separate | yes |

| Monthly total, PLN (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 344 ✓ | 1,377 | 4,590 |
| HatchGrab Pro | 396 | 1,333 ✓ | 4,545 |
| HatchGrab Unlimited | 566 | 1,367 | 3,859 ✓ |
| **HatchGrab proposed, cheapest plan** | **344** (Pay as you go) | **1,257** (Unlimited) | **3,749** (Unlimited) |
| UpMenu — Online ordering tier 3 | 766¹ | 1,567¹ | 4,059¹ |
| UpMenu — Online ordering tier 2 | 556¹ | 3,970¹ | 15,842¹ |
| UpMenu — Online ordering tier 1 | 938¹ | 4,754¹ | 16,626¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.61%.
- **Proposed change:** 129 zł / 299 zł → 79 zł / 189 zł (Pro includes 10 000 zł). Affordability: Pro is 3.2 meals. HatchGrab is already cheapest against UpMenu (169–499 zł) and stays cheapest.
- **Marketplaces (context only, excluded):** Pyszne.pl / Uber Eats / Wolt / Glovo (excluded); typical commissions up to ~30% (antyweb.pl 2022 cites up to 30%).
- **Research notes:** UpMenu (Polish, sells globally) has dedicated English food-truck pages (food-truck ordering system / food-truck POS) so counted as food-truck-marketed, but it is a general restaurant ordering tool. Restaumatic (PL) is quote-based (no public prices).

### CZ · Czech Republic (Standard)

- **Meal price:** 200 Kč — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Czech+Republic)), checked 23 Oct 2026. Order value 1.3× = CZK 260.00. Online revenue: small CZK 39,000 · medium CZK 156,000 · busy CZK 520,000.
- **Exchange rate:** 1 EUR = 24.26 CZK (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go 0 Kč + 0.99% · Pro 699 Kč incl. 100 000 Kč of online orders, then 0.99% · Unlimited 1 690 Kč, no fee. Card processing assumed by the row: 1.5% + CZK 6.50 online (650 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.80%** of online revenue (UK 0.55%). Pro = 3.50 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Menu55 — Objednávkový systém](https://menu55.cz/objednavky-rozvoz) | nearest-local | CZK 350/mo | separate | yes |
| [Menu55 — Plná verze](https://menu55.cz/objednavky-rozvoz) | nearest-local | CZK 480/mo | separate | yes |
| [Choice — Basic (free) - see notes for paid tiers](https://choiceqr.com/cs/cenik-choice/) | nearest-local | CZK 0/mo; CZK 0/mo yearly; + 3% per order (vendor) | bundled: 1.5% + 2.5 | yes |

| Monthly total, CZK (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 1,946 ✓ | 7,784 | 25,948 |
| HatchGrab Pro | 2,259 | 7,493 ✓ | 25,657 |
| HatchGrab Unlimited | 3,250 | 7,930 | 22,490 ✓ |
| **HatchGrab proposed, cheapest plan** | **1,946** (Pay as you go) | **7,230** (Unlimited) | **21,790** (Unlimited) |
| Menu55 — Objednávkový systém | 1,910¹ | 6,590¹ | 21,150¹ |
| Menu55 — Plná verze | 2,040¹ | 6,720¹ | 21,280¹ |
| Choice — Basic (free) - see notes for paid tiers | 2,130 | 8,520 | 28,400 |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **With the proposed prices:** small no · medium no · busy no; share of medium revenue 0.63%.
- **Proposed change:** 699 Kč / 1 690 Kč → 399 Kč / 990 Kč (Pro includes 55 000 Kč). Affordability: Pro is 3.5 meals. Menu55 (350 Kč flat, unlimited, nearest-local) still wins every scenario; matching needs Unlimited under 350 Kč, below Pro: structural.
- **Marketplaces (context only, excluded):** Wolt / Foodora (excluded); Czech press cites ~30% delivery commission (Forbes.cz, Lunchdrive article).
- **Research notes:** No Czech food-truck tool found. Nearest-local with public price: Menu55 (350 / 480 Kč/month, 0% commission). Other no-commission Czech tools without public prices in what I read: Milaneee, Foodzi, Gastry, Jídlo365, Choice (choiceqr). Speedlo has no public price list. Qerko is QR pay-at-table; it charges guests 3 CZK per payment (prepaid orders exempt) - not a food-truck pre-order tool. UPDATE (gap pass): Choice does publish CZK prices at choiceqr.com/cs/cenik-choice - Basic free + 3% on online-paid orders, Standard 990 Kč/měs. + 3%, Smart 2 090 Kč 0%, Pro 2 990 Kč 0%; card IC++ standard 1.5% + 2.5 Kč.

### RO · Romania (Standard)

- **Meal price:** 50 lei — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Romania)), checked 23 Oct 2026. Order value 1.3× = RON 65.00. Online revenue: small RON 9,750 · medium RON 39,000 · busy RON 130,000.
- **Exchange rate:** 1 EUR = 5.345 RON (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go 0 lei + 0.99% · Pro 149 lei incl. 21.500 lei of online orders, then 0.99% · Unlimited 369 lei, no fee. Card processing assumed by the row: 1.5% + RON 1.00 online (100 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.83%** of online revenue (UK 0.55%). Pro = 2.98 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [MENU TIGER (global) — Free](https://www.menutiger.com/pricing) | nearest-local | USD 0/mo | separate | plan caps at 75 orders |
| [MENU TIGER (global) — Regular](https://www.menutiger.com/pricing) | nearest-local | USD 17/mo; USD 14.45/mo yearly | separate | plan caps at 500 orders |
| [MENU TIGER (global) — Advanced](https://www.menutiger.com/pricing) | nearest-local | USD 46/mo; USD 39.1/mo yearly | separate | yes |
| [MENU TIGER (global) — Premium](https://www.menutiger.com/pricing) | nearest-local | USD 119/mo; USD 101.15/mo yearly | separate | yes |
| [Choice — Basic](https://choiceqr.com/ro/preturi/) | nearest-local | RON 0/mo; RON 0/mo yearly; + 3% per order (vendor) | bundled: 1.5% | yes |
| [Choice — Standard](https://choiceqr.com/ro/preturi/) | nearest-local | RON 200/mo; RON 180/mo yearly; + 3% per order (vendor) | bundled: 1.5% | yes |
| [Choice — Smart](https://choiceqr.com/ro/preturi/) | nearest-local | RON 425/mo; RON 385/mo yearly | bundled: 1.5% | yes |
| [Choice — Pro](https://choiceqr.com/ro/preturi/) | nearest-local | RON 625/mo; RON 565/mo yearly | bundled: 1.5% | yes |

| Monthly total, RON (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 393 ✓ | 1,571 | 5,237 |
| HatchGrab Pro | 445 | 1,507 ✓ | 5,173 |
| HatchGrab Unlimited | 665 | 1,554 | 4,319 ✓ |
| **HatchGrab proposed, cheapest plan** | **385** (Pro) | **1,384** (Unlimited) | **4,149** (Unlimited) |
| MENU TIGER (global) — Regular | 377¹ | — (plan caps at 500 orders) | — (plan caps at 500 orders) |
| Choice — Smart | 651 | 1,331 | 3,444 |
| MENU TIGER (global) — Advanced | 516¹ | 1,404¹ | 4,169¹ |
| Choice — Pro | 851 | 1,531 | 3,644 |
| MENU TIGER (global) — Premium | 864¹ | 1,753¹ | 4,518¹ |
| Choice — Basic | 519 | 2,076 | 6,919 |
| Choice — Standard | 719 | 2,276 | 7,119 |

- **HatchGrab cheapest (truck-paid)?** small no · medium no · busy no. Counting fees the customer pays too: small no · medium no · busy no.
- **With the proposed prices:** small no · medium no · busy no; share of medium revenue 0.51%.
- **Proposed change:** 149 lei / 369 lei → 89 lei / 199 lei (Pro includes 12.500 lei). Affordability: Pro is 3.0 meals. After the change HatchGrab's own charge is the lowest at medium and busy, but the total still loses to Choice Smart (425 lei) because Choice's card rate (1.5% + ~0.5 lei) beats Stripe's 1.5% + 1 lei; MENU TIGER (US$17) wins small.
- **Marketplaces (context only, excluded):** Not verified today (search budget ran out). Glovo / Wolt / Bolt Food / Tazz (excluded) are the main marketplaces; commission typically ~25-30% for delivery, lower for pickup (approx, unverified).
- **Research notes:** No Romanian food-truck ordering tool found. Nearest-local with public RON prices: Choice (choiceqr.com/ro/preturi) - Basic free + 3% on online-paid orders, Standard 200 lei/lună + 3%, Smart 425 lei 0%, Pro 625 lei 0%; 14-day trial. NETOPIA mobilPay Delivery is a 6%-commission wallet marketplace (context). Menu Tiger (USD) remains the global fallback.

### GR · Greece (Standard)

- **Meal price:** €15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 19.50. Online revenue: small EUR 2,925 · medium EUR 11,700 · busy EUR 39,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Spevdo — Starter](https://spevdo.gr/en/#pricing) | nearest-local | EUR 59/mo; EUR 49.17/mo yearly; VAT excl | separate | yes |
| [Spevdo — Growth](https://spevdo.gr/en/#pricing) | nearest-local | EUR 119/mo; EUR 99.17/mo yearly; VAT excl | separate | yes |
| [Spevdo — Pro](https://spevdo.gr/en/#pricing) | nearest-local | EUR 229/mo; EUR 190.83/mo yearly; VAT excl | separate | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 110 ✓ | 441 | 1,471 |
| HatchGrab Pro | 110 | 431 | 1,460 |
| HatchGrab Unlimited | 150 | 394 ✓ | 1,154 ✓ |
| **HatchGrab proposed, cheapest plan** | **110** (Pay as you go) | **374** (Unlimited) | **1,134** (Unlimited) |
| Spevdo — Starter | 140¹ | 384¹ | 1,144¹ |
| Spevdo — Growth | 200¹ | 444¹ | 1,204¹ |
| Spevdo — Pro | 310¹ | 554¹ | 1,314¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.42%.
- **Proposed change:** Unlimited €69 → €49. Spevdo (€59 + VAT, unlimited, Athens) beats Unlimited at medium and busy; €49 beats it.
- **Marketplaces (context only, excluded):** efood / Wolt / Box (excluded); commission not verified today.
- **Research notes:** No Greek food-truck ordering tool found. Nearest-local: Spevdo (Athens, 0% commission, from €19/month menu-only; ordering from €59 + 24% VAT, card via Viva).

### SG · Singapore (Standard)

- **Meal price:** $15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Singapore)), checked 23 Oct 2026. Order value 1.3× = SGD 19.50. Online revenue: small SGD 2,925 · medium SGD 11,700 · busy SGD 39,000.
- **Exchange rate:** 1 EUR = 1.4315 SGD (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro SGD 42 incl. SGD 5,726, Unlimited SGD 99. Card processing assumed at Stripe's local standard rate 3.4% + 0.5.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.84%** of online revenue (UK 0.55%). Pro = 2.77 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Oddle — Online Ordering (Package 1, via UOB BizSmart)](https://www.uob.com.sg/business/digital/digital-transaction-marketing/oddle.page) | nearest-local | SGD 0/mo; + 10% per order (vendor); VAT excl | bundled | yes |
| [Take App — Basic](https://www.take.app/pricing) | nearest-local | USD 0/mo | separate | plan caps at 50 orders |
| [Take App — Business](https://www.take.app/pricing) | nearest-local | USD 50/mo | separate | yes |
| [Klikit — Core + Omni (webshop / QR ordering)](https://klikit.io/en/pricing) | nearest-local | SGD 68/mo; VAT excl | unknown | yes |

| Monthly total, SGD (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 203 ✓ | 814 | 2,712 |
| HatchGrab Pro (placeholder) | 216 | 798 | 2,697 |
| HatchGrab Unlimited (placeholder) | 273 | 797 ✓ | 2,425 ✓ |
| **HatchGrab proposed, cheapest plan** | **203** (Pay as you go) | **757** (Unlimited) | **2,385** (Unlimited) |
| Take App — Business | 238¹ | 762¹ | 2,390¹ |
| Klikit — Core + Omni (webshop / QR ordering) | 242¹ | 766¹ | 2,394¹ |
| Oddle — Online Ordering (Package 1, via UOB BizSmart) | 467¹ | 1,868¹ | 6,226¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.50%.
- **Proposed change:** New: $29 / $59 (Pro includes $4,000). A euro conversion (S$42 / S$99) is 2.8 meals; S$29 is 1.9. Unlimited S$59 beats Take App (US$50 ≈ S$64) and Klikit (S$68).
- **Marketplaces (context only, excluded):** GrabFood / foodpanda typically 25–30% commission (Eats365/Vulcan Post); hawker pilots with reduced/zero commission.
- **Research notes:** No food-truck-focused ordering tool found; food trucks are rare (hawker-centre model). Nearest: Oddle (10% per order), Take App. Eatsy/YQueue: no public merchant price. Stripe SG 3.4% + S$0.50; PayNow 1.3%. Gap pass: added Klikit SG S$68/mo (Core S$19 + Omni S$49, excluding GST) as another nearest-local option.

### HK · Hong Kong (Standard)

- **Meal price:** HK$62 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Hong+Kong+(China))), checked 23 Oct 2026. Order value 1.3× = HKD 81.25. Online revenue: small HKD 12,188 · medium HKD 48,750 · busy HKD 162,500.
- **Exchange rate:** 1 EUR = 8.7845 HKD (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro HKD 255 incl. HKD 35,138, Unlimited HKD 606. Card processing assumed at Stripe's local standard rate 3.4% + 2.35.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.80%** of online revenue (UK 0.55%). Pro = 4.08 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Take App — Basic](https://www.take.app/pricing) | nearest-local | USD 0/mo | separate | plan caps at 50 orders |
| [Take App — Business](https://www.take.app/pricing) | nearest-local | USD 50/mo | separate | yes |
| [MenuTiger — Free](https://www.menutiger.com/pricing) | nearest-local | USD 0/mo | separate | plan caps at 75 orders |
| [MenuTiger — Regular](https://www.menutiger.com/pricing) | nearest-local | USD 17/mo | separate | plan caps at 500 orders |
| [MenuTiger — Advanced](https://www.menutiger.com/pricing) | nearest-local | USD 46/mo | separate | yes |
| [VGather self-ordering service — Basic (self-ordering + payment)](https://dtspp.cyberport.hk/product/vgather-self-ordering-service-package-2-years-contract/) | nearest-local | HKD 1200/mo | unknown | yes |

| Monthly total, HKD (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 888 ✓ | 3,550 | 11,834 |
| HatchGrab Pro (placeholder) | 1,022 | 3,457 ✓ | 11,741 |
| HatchGrab Unlimited (placeholder) | 1,373 | 3,674 | 10,831 ✓ |
| **HatchGrab proposed, cheapest plan** | **886** (Pro) | **3,336** (Unlimited) | **10,494** (Unlimited) |
| MenuTiger — Regular | 900¹ | — (plan caps at 500 orders) | — (plan caps at 500 orders) |
| MenuTiger — Advanced | 1,128¹ | 3,428¹ | 10,586¹ |
| Take App — Business | 1,159¹ | 3,459¹ | 10,617¹ |
| VGather self-ordering service — Basic (self-ordering + payment) | 1,967¹ | 4,268¹ | 11,425¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.55%.
- **Proposed change:** New: HK$119 / HK$269 (Pro includes HK$15,000). A euro conversion (HK$255 / HK$606) is 4.1 meals; HK$119 is 1.9. Cheapest at all three against MenuTiger, Take App and VGather. Hong Kong has almost no food-truck market (the pilot scheme ended in 2022).
- **Marketplaces (context only, excluded):** foodpanda and Keeta (Meituan) are the only big apps since Deliveroo left in 2025. Rates are negotiated and not published; third-party guides put foodpanda at about 15–30%. Keeta has added pickup.
- **Research notes:** No food-truck tool found (HK food-truck scene very small). Nearest: Take App (USD). Boutir pricing page 403. Eats365 excluded (POS). Stripe HK 3.4% + HK$2.35. Gap pass: the government Food Truck Pilot Scheme ended on 1 Jun 2022 (Tourism Commission, Dec 2021), after which about 6 trucks moved to West Kowloon. HK has almost no food-truck market. Chinese searches ('網上落單系統 餐廳 收費', '美食車 網上落單') found no truck tool. Nearest: VGather (HK$1,200/mo on a 24-month contract, low confidence, from a Cyberport DTSPP listing) and MenuTiger (USD). Boutir and TapTapEat pages returned 403.

### MY · Malaysia (Standard)

- **Meal price:** RM15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Malaysia)), checked 23 Oct 2026. Order value 1.3× = MYR 19.50. Online revenue: small MYR 2,925 · medium MYR 11,700 · busy MYR 39,000.
- **Exchange rate:** 1 EUR = 4.5756 MYR (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro MYR 133 incl. MYR 18,302, Unlimited MYR 316. Card processing assumed at Stripe's local standard rate 3% + 1.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.99%** of online revenue (UK 0.55%). Pro = 8.85 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Take App — Basic](https://www.take.app/pricing) | nearest-local | USD 0/mo | separate | plan caps at 50 orders |
| [Take App — Business](https://www.take.app/pricing) | nearest-local | USD 50/mo | separate | yes |
| [Klikit — Core + Omni (webshop / QR ordering)](https://klikit.io/ms/pricing) | nearest-local | MYR 218/mo; VAT excl | unknown | yes |

| Monthly total, MYR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 267 ✓ | 1,067 ✓ | 3,556 |
| HatchGrab Pro (placeholder) | 370 | 1,084 | 3,508 |
| HatchGrab Unlimited (placeholder) | 553 | 1,267 | 3,486 ✓ |
| **HatchGrab proposed, cheapest plan** | **267** (Pay as you go) | **1,020** (Unlimited) | **3,239** (Unlimited) |
| Take App — Business | 442¹ | 1,155¹ | 3,374¹ |
| Klikit — Core + Omni (webshop / QR ordering) | 456¹ | 1,169¹ | 3,388¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy no. Counting fees the customer pays too: small yes · medium yes · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.59%.
- **Proposed change:** New: RM29 / RM69 (Pro includes RM4,000). A euro conversion (RM133 / RM316) is 8.8 meals; RM29 is 1.9. Cheapest at all three against Take App and Klikit (RM218).
- **Marketplaces (context only, excluded):** GrabFood is commonly 15–30% (Klikit/industry guides, 2026; Grab's own MY range is 15–30% by tier) and foodpanda roughly 12–28%, with pickup and tier deals lower. These are third-party figures, not official rate cards.
- **Research notes:** Search budget ran out before Malaysia-specific searches; no food-truck tool confirmed. Nearest: Take App (Malaysian-founded, USD). StoreHub/Beep excluded (POS). Foodmarkethub is procurement, not ordering. Stripe MY 3% + RM1 (FPX same). Gap pass: no Malaysian food-truck ordering tool with a public price was found. A 2022 UTHM academic paper notes that Kuantan trucks take orders manually over WhatsApp. Nearest local: Klikit (RM218/mo for Core + Omni webshop/QR). Aliments (free Lite, RM990–1,490/yr in a 2021 StoreHub table) now redirects to HubboPOS (POS), so it is left out. Low-cost QR options in the same table (SifuApps.Biz RM25–50/mo, Menumiz free–RM499, Dinlr RM150) are dine-in QR or POS, with prices last updated in 2021; they were not verified.

### AE · United Arab Emirates (Standard)

- **Meal price:** AED 35 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=United+Arab+Emirates)), checked 23 Oct 2026. Order value 1.3× = AED 45.50. Online revenue: small AED 6,825 · medium AED 27,300 · busy AED 91,000.
- **Exchange rate:** 1 EUR = 4.11504 AED (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct). AED from the USD peg (3.6725).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro AED 119 incl. AED 16,460, Unlimited AED 284. Card processing assumed at Stripe's local standard rate 2.9% + 1.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.83%** of online revenue (UK 0.55%). Pro = 3.41 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Ordable — Basic](https://www.itsordable.com/en/uae/pricing) | nearest-local | AED 250/mo yearly | separate | yes |
| [Ordable — Advanced](https://www.itsordable.com/en/uae/pricing) | nearest-local | AED 416.67/mo yearly | separate | yes |
| [GloriaFood (Oracle) — Free + Online Payment add-on](https://www.gloriafood.com/pricing) | nearest-local | USD 29/mo; VAT excl | separate | closed to new sign-ups; shuts 30 Apr 2027 |
| [Spot (Spot – Drive Thru Pickup app) — Vendor (free)](https://www.hospitalitynewsmag.com/spot/) | food-truck | AED 0/mo | unknown | free 2022 launch app; current site no longer mentions it (unverified) |
| [Zyda — Starter](https://www.zyda.com/pricing) | nearest-local | USD 85/mo; VAT excl | separate: 2.5% | yes |
| [Zyda — Growth](https://www.zyda.com/pricing) | nearest-local | USD 135/mo; VAT excl | separate: 2.5% | yes |

| Monthly total, AED (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 415 ✓ | 1,662 | 5,540 |
| HatchGrab Pro (placeholder) | 467 | 1,618 ✓ | 5,496 |
| HatchGrab Unlimited (placeholder) | 632 | 1,676 | 4,923 ✓ |
| **HatchGrab proposed, cheapest plan** | **407** (Pro) | **1,541** (Unlimited) | **4,788** (Unlimited) |
| Zyda — Starter | 483 | 995 | 2,587 |
| Zyda — Growth | 666 | 1,178 | 2,771 |
| Ordable — Basic | 598¹ | 1,642¹ | 4,889¹ |
| Ordable — Advanced | 765¹ | 1,808¹ | 5,056¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium no · busy no. Counting fees the customer pays too: small yes · medium no · busy no.
- **With the proposed prices:** small yes · medium no · busy no; share of medium revenue 0.55%.
- **Proposed change:** New: AED 59 / AED 149 (Pro includes AED 8,000). A euro conversion (AED 119 / AED 284) is 3.4 meals; AED 59 is 1.7. HatchGrab's own charge is the lowest everywhere, but the total loses at medium and busy to Zyda, whose 2.5% gateway undercuts Stripe UAE's 2.9% + AED 1.
- **Marketplaces (context only, excluded):** Talabat is typically 20–30% (most 2026 guides say 25–30%; a Dubai Restaurant Group deal gives 5.3% + AED 8.40 delivery for 500 members). Noon Food is about 20–28%. Careem Food also operates, and Keeta has launched. Deliveroo exited the UAE in late 2024. All third-party figures.
- **Research notes:** No food-truck tool found (limited search). Nearest: Ordable AED 3,000–5,000/yr, 0% commission; GloriaFood. Stripe AE 2.9% + AED 1. Gap pass: one food-truck-specific tool found. Spot (Abu Dhabi / Al Ain truck parks) had a 2022 drive-thru pre-order app, free to trucks with 0% commission; its current site no longer mentions the app. Nearest local with a public price: Zyda (US$85/135, 0% commission, Tap gateway 2.5%), plus the existing Ordable and GloriaFood rows. Deonde (0% commission, flat subscription) has a UAE page but no price on it. ChatFood shows no AED price.

### TH · Thailand (Standard)

- **Meal price:** ฿100 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Thailand)), checked 23 Oct 2026. Order value 1.3× = THB 130.00. Online revenue: small THB 19,500 · medium THB 78,000 · busy THB 260,000.
- **Exchange rate:** 1 EUR = 37.811 THB (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro THB 1,097 incl. THB 151,244, Unlimited THB 2,609. Card processing assumed at Stripe's local standard rate 3.65% + 10.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.99%** of online revenue (UK 0.55%). Pro = 10.97 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Take App — Basic](https://www.take.app/pricing) | nearest-local | USD 0/mo | separate | plan caps at 50 orders |
| [Take App — Business](https://www.take.app/pricing) | nearest-local | USD 50/mo | separate | yes |
| [GloriaFood (Oracle) — Free + Online Payment add-on](https://www.gloriafood.com/pricing) | nearest-local | USD 29/mo; VAT excl | separate | closed to new sign-ups; shuts 30 Apr 2027 |
| [Klikit — Core + Omni (webshop / QR ordering)](https://klikit.io/th/pricing) | nearest-local | THB 1789/mo; VAT excl | unknown | yes |
| [MenuTiger — Free](https://www.menutiger.com/pricing) | nearest-local | USD 0/mo | separate | plan caps at 75 orders |
| [MenuTiger — Regular](https://www.menutiger.com/pricing) | nearest-local | USD 17/mo | separate | plan caps at 500 orders |
| [MenuTiger — Advanced](https://www.menutiger.com/pricing) | nearest-local | USD 46/mo | separate | yes |

| Monthly total, THB (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 2,405 ✓ | 9,619 ✓ | 32,064 |
| HatchGrab Pro (placeholder) | 3,308 | 9,944 | 31,663 ✓ |
| HatchGrab Unlimited (placeholder) | 4,821 | 11,456 | 32,099 |
| **HatchGrab proposed, cheapest plan** | **2,405** (Pay as you go) | **9,296** (Unlimited) | **29,939** (Unlimited) |
| MenuTiger — Regular | 2,785¹ | — (plan caps at 500 orders) | — (plan caps at 500 orders) |
| MenuTiger — Advanced | 3,764¹ | 10,399¹ | 31,042¹ |
| Take App — Business | 3,899¹ | 10,534¹ | 31,177¹ |
| Klikit — Core + Omni (webshop / QR ordering) | 4,001¹ | 10,636¹ | 31,279¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy no. Counting fees the customer pays too: small yes · medium yes · busy no.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.58%.
- **Proposed change:** New: ฿199 / ฿449 (Pro includes ฿25,000). A euro conversion (฿1,097 / ฿2,609) is 11 meals; ฿199 is 2.0. Cheapest at all three against MenuTiger, Take App and Klikit. Card cost (3.65% + ฿10) is 14% of a ฿130 order.
- **Marketplaces (context only, excluded):** LINE MAN GP is 30% + 7% VAT (≈32.1%) and Grab up to 30%. The general range is 30–35% (Thai press); there are temporary programmes such as 'ไทยช่วยไทยพลัส' at 9% GP for sign-ups by 10 Jun 2026.
- **Research notes:** No food-truck tool found (limited search). Nearest: Take App, GloriaFood. Wongnai POS / LINE MAN excluded. Stripe TH 3.65% + ฿10 domestic cards; PromptPay 1.65%. HatchGrab's 0.99% is small vs card cost on a ฿100 order (฿13.65 card fee = 13.7%). Gap pass: Thai searches ('ระบบสั่งอาหาร ฟู้ดทรัค QR สั่งล่วงหน้า ราคา') found no food-truck tool. Results are dominated by Wongnai POS (excluded) and MenuTiger. Nearest local with THB prices: Klikit ฿1,789/mo (Core + Omni, excluding VAT). MenuTiger rows (USD, free to US$119) are added.

### BG · Bulgaria (Light)

- **Meal price:** €10 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 13.30. Online revenue: small EUR 1,995 · medium EUR 7,979 · busy EUR 26,598.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.86%** of online revenue (UK 0.55%). Pro = 2.83 meals (UK 1.81).
- **Competitors:** none found with or without a public price.

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 87 ✓ | 349 | 1,162 |
| HatchGrab Pro | 96 | 338 ✓ | 1,152 |
| HatchGrab Unlimited | 136 | 339 | 968 ✓ |
| **HatchGrab proposed, cheapest plan** | **86** (Pro) | **319** (Unlimited) | **948** (Unlimited) |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.61%.
- **Proposed change:** €29 / €69 → €19 / €49 (Pro includes €2,500). Affordability: Pro is 2.8 meals (Numbeo €10.23). No priced competitor found.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No food-truck or local own-ordering tool with public price found (searched Bulgarian 'онлайн поръчки ресторант система без комисиона цена', 'система за онлайн поръчки за ресторанти България цени'). Order.bg is a multi-restaurant ordering/pickup marketplace with no published restaurant fees; doXmenu is a QR menu (€14.99/mo) without online ordering.

### CY · Cyprus (Light)

- **Meal price:** €15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 19.50. Online revenue: small EUR 2,925 · medium EUR 11,700 · busy EUR 39,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Wiiz Eat — Online storefront](https://wiizeat.com/business/) | nearest-local | EUR 0/mo; + EUR 0.15 per order (vendor); setup EUR 250; VAT excl | separate | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 110 ✓ | 441 | 1,471 |
| HatchGrab Pro | 110 | 431 | 1,460 |
| HatchGrab Unlimited | 150 | 394 ✓ | 1,154 ✓ |
| Wiiz Eat — Online storefront | 125¹ | 436¹ | 1,406¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Cheapest at all three against Wiiz Eat (€0.15/order + €250 setup, no online card payment).
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No food-truck tool found. Nearest-local: Wiiz Eat (Cyprus/Greece) - €0.15 per accepted order, €250 setup, no monthly fee, customer pays restaurant directly (cash/own POS card). Foody (Delivery Hero) is the main marketplace (excluded).

### EE · Estonia (Light)

- **Meal price:** €15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 19.50. Online revenue: small EUR 2,925 · medium EUR 11,700 · busy EUR 39,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Choice — Basic (free) - see notes for paid tiers](https://choiceqr.com/et/hinnakiri-choice-qr/) | nearest-local | EUR 0/mo; EUR 0/mo yearly; + 3% per order (vendor) | bundled: 1.5% + 0.1 | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 110 ✓ | 441 | 1,471 |
| HatchGrab Pro | 110 | 431 | 1,460 |
| HatchGrab Unlimited | 150 | 394 ✓ | 1,154 ✓ |
| Choice — Basic (free) - see notes for paid tiers | 147 | 586 | 1,955 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Already far cheaper than Choice Basic (free + 3% + card), the only priced tool. Not recommending a rise.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No Estonian food-truck (toiduauto) pre-order tool found (searched 'toiduauto tänavatoit eeltellimus rakendus hind'). Nearest-local: Choice (Estonian site) - Basic free + 3%, Standard €40/mo + 3%, Smart €85 0%, Pro €125 0%.

### HR · Croatia (Light)

- **Meal price:** €12 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 15.60. Online revenue: small EUR 2,340 · medium EUR 9,360 · busy EUR 31,200.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.74%** of online revenue (UK 0.55%). Pro = 2.42 meals (UK 1.81).
- **Competitors:** none found with or without a public price.

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 96 ✓ | 383 | 1,277 |
| HatchGrab Pro | 102 | 372 | 1,266 |
| HatchGrab Unlimited | 142 | 359 ✓ | 1,037 ✓ |
| **HatchGrab proposed, cheapest plan** | **96** (Pay as you go) | **349** (Unlimited) | **1,027** (Unlimited) |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.63%.
- **Proposed change:** €29 / €69 → €25 / €59 (Pro includes €3,500). Affordability: Pro is 2.4 meals (Numbeo €12). No priced competitor (only QR menus).
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No food-truck or local own-ordering tool with public price found (searched Croatian 'online narudžbe restoran sustav bez provizije cijena', 'sustav za online narudžbe za restorane Hrvatska cijena', '"bez provizije" online naručivanje restoran'). Only QR-menu tools (doXmenu €12.99-14.99/mo, view/table only) surfaced.

### HU · Hungary (Light)

- **Meal price:** 4 000 Ft — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Hungary)), checked 23 Oct 2026. Order value 1.3× = HUF 5200.00. Online revenue: small HUF 780,000 · medium HUF 3,120,000 · busy HUF 10,400,000.
- **Exchange rate:** 1 EUR = 366.43 HUF (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go 0 Ft + 0.99% · Pro 10 990 Ft incl. 1 500 000 Ft of online orders, then 0.99% · Unlimited 24 990 Ft, no fee. Card processing assumed by the row: 1.5% + HUF 85.00 online (8500 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.80%** of online revenue (UK 0.55%). Pro = 2.75 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Choice — Basic (free) - see notes for paid tiers](https://choiceqr.com/hu/arazas/) | nearest-local | HUF 0/mo; HUF 0/mo yearly; + 3% per order (vendor) | bundled: 1.5% | yes |

| Monthly total, HUF (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 32,172 ✓ | 128,688 | 428,960 |
| HatchGrab Pro | 35,440 | 124,828 | 425,100 |
| HatchGrab Unlimited | 49,440 | 122,790 ✓ | 350,990 ✓ |
| **HatchGrab proposed, cheapest plan** | **31,440** (Pro) | **114,790** (Unlimited) | **342,990** (Unlimited) |
| Choice — Basic (free) - see notes for paid tiers | 40,596 | 162,386 | 541,286 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.54%.
- **Proposed change:** 10 990 Ft / 24 990 Ft → 6 990 Ft / 16 990 Ft (Pro includes 1 000 000 Ft). Affordability: Pro is 2.75 meals. Already far cheaper than Choice (free + 3%; 15 900–39 900 Ft) and stays so.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No Hungarian food-truck tool found (searched 'food truck előrendelés app', 'online rendelési rendszer étterem jutalék nélkül havidíj'). Nearest-local with public HUF prices: Choice (choiceqr.com/hu/arazas) - Basic free + 3% on online-paid orders, Standard 15 900 Ft/hó + 3%, Smart 29 900 Ft 0%, Pro 39 900 Ft 0%. Agencies quote Wolt/Foodora commission at 25-30% (zunapro.com, context).

### LT · Lithuania (Light)

- **Meal price:** €12 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 15.60. Online revenue: small EUR 2,340 · medium EUR 9,360 · busy EUR 31,200.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.74%** of online revenue (UK 0.55%). Pro = 2.42 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Choice — Basic (free) - see notes for paid tiers](https://choiceqr.com/lt/kainorastis-choice-qr/) | nearest-local | EUR 0/mo; EUR 0/mo yearly; + 3% per order (vendor) | bundled: 1.5% + 0.1 | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 96 ✓ | 383 | 1,277 |
| HatchGrab Pro | 102 | 372 | 1,266 |
| HatchGrab Unlimited | 142 | 359 ✓ | 1,037 ✓ |
| **HatchGrab proposed, cheapest plan** | **96** (Pay as you go) | **349** (Unlimited) | **1,027** (Unlimited) |
| Choice — Basic (free) - see notes for paid tiers | 120 | 481 | 1,604 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.63%.
- **Proposed change:** €29 / €69 → €25 / €59 (Pro includes €3,500). Affordability: Pro is 2.4 meals. Already far cheaper than Choice Basic and stays so.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No Lithuanian food-truck tool found (searched 'užsakymų internetu sistema restoranui be komisinių kaina'). Nearest-local: Choice (Lithuanian site) - Basic free + 3%, Standard €40/mo + 3%, Smart €85 0%, Pro €125 0%.

### LU · Luxembourg (Light)

- **Meal price:** €22 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 28.60. Online revenue: small EUR 4,290 · medium EUR 17,160 · busy EUR 57,200.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.40%** of online revenue (UK 0.55%). Pro = 1.32 meals (UK 1.81).
- **Competitors:** none found with or without a public price.

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 144 | 577 | 1,924 |
| HatchGrab Pro | 134 ✓ | 567 | 1,914 |
| HatchGrab Unlimited | 171 | 476 ✓ | 1,427 ✓ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. No priced competitor (the Luxembourg food-truck apps only help people find trucks). Pro = 1.3 meals, below the UK — flagged, no rise.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No food-truck ordering tool found. Luxembourg food-truck apps are discovery only: appEtite (2016, ordering 'planned for later') and Snack Track (finder). Searched French 'commande en ligne restaurant Luxembourg sans commission abonnement' - only French/Swiss tools (Clickeat, Pikit) surfaced, none confirmed selling in LU.

### LV · Latvia (Light)

- **Meal price:** €12 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 15.60. Online revenue: small EUR 2,340 · medium EUR 9,360 · busy EUR 31,200.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.74%** of online revenue (UK 0.55%). Pro = 2.42 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Choice — Basic (free) - see notes for paid tiers](https://choiceqr.com/lv/cenradis-choice-qr/) | nearest-local | EUR 0/mo; EUR 0/mo yearly; + 3% per order (vendor) | bundled: 1.5% + 0.1 | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 96 ✓ | 383 | 1,277 |
| HatchGrab Pro | 102 | 372 | 1,266 |
| HatchGrab Unlimited | 142 | 359 ✓ | 1,037 ✓ |
| **HatchGrab proposed, cheapest plan** | **96** (Pay as you go) | **349** (Unlimited) | **1,027** (Unlimited) |
| Choice — Basic (free) - see notes for paid tiers | 120 | 481 | 1,604 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.63%.
- **Proposed change:** €29 / €69 → €25 / €59 (Pro includes €3,500). Affordability: Pro is 2.4 meals. Already far cheaper than Choice Basic and stays so.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No Latvian food-truck tool found (no dedicated search; covered via Choice's Latvian site). Nearest-local: Choice - Basic free + 3%, Standard €40/mo + 3%, Smart €85 0%, Pro €125 0%.

### MT · Malta (Light)

- **Meal price:** €15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 19.50. Online revenue: small EUR 2,925 · medium EUR 11,700 · busy EUR 39,000.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).
- **Competitors:** none found with or without a public price.

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 110 ✓ | 441 | 1,471 |
| HatchGrab Pro | 110 | 431 | 1,460 |
| HatchGrab Unlimited | 150 | 394 ✓ | 1,154 ✓ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. No priced competitor (Zaype's €20 a month is unverified; its site is blank).
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No food-truck or own-ordering tool with a verified public price found (searched 'Malta online ordering system restaurant commission-free monthly', 'Malta restaurant own ordering website pickup no commission'). Zaype (Malta takeaway app) reportedly charged restaurants a flat €20/month (MaltaToday, undated) but its site is blank - unverified. Storekit is sold in Malta via Sixteen (no local price). Time to Eat is a local marketplace.

### SI · Slovenia (Light)

- **Meal price:** €12 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 15.60. Online revenue: small EUR 2,340 · medium EUR 9,360 · busy EUR 31,200.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.74%** of online revenue (UK 0.55%). Pro = 2.42 meals (UK 1.81).
- **Competitors:** none found with or without a public price.

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 96 ✓ | 383 | 1,277 |
| HatchGrab Pro | 102 | 372 | 1,266 |
| HatchGrab Unlimited | 142 | 359 ✓ | 1,037 ✓ |
| **HatchGrab proposed, cheapest plan** | **96** (Pay as you go) | **349** (Unlimited) | **1,027** (Unlimited) |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.63%.
- **Proposed change:** €29 / €69 → €25 / €59 (Pro includes €3,500). Affordability: Pro is 2.4 meals. No priced competitor (only QR menus).
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No food-truck or local own-ordering tool with public price found (searched Slovenian 'spletno naročanje restavracija sistem brez provizije cena', 'sistem za spletna naročila gostinci cenik', '"brez provizije" spletno naročanje hrane'). Only doXmenu QR menus and SumUp (excluded) surfaced.

### SK · Slovakia (Light)

- **Meal price:** €8 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR)), checked 23 Oct 2026. Order value 1.3× = EUR 10.40. Online revenue: small EUR 1,560 · medium EUR 6,240 · busy EUR 20,800.
- **HatchGrab today:** Pay as you go €0 + 0.99% · Pro €29 incl. €4,000 of online orders, then 0.99% · Unlimited €69, no fee. Card processing assumed by the row: 1.5% + EUR 0.25 online (25 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.82%** of online revenue (UK 0.55%). Pro = 3.62 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Choice — Basic (free) - see notes for paid tiers](https://choiceqr.com/sk/cennik-choice/) | nearest-local | EUR 0/mo; EUR 0/mo yearly; + 3% per order (vendor) | bundled: 1.5% + 0.1 | yes |

| Monthly total, EUR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 76 ✓ | 305 | 1,018 |
| HatchGrab Pro | 90 | 295 ✓ | 1,007 |
| HatchGrab Unlimited | 130 | 313 | 881 ✓ |
| **HatchGrab proposed, cheapest plan** | **76** (Pro) | **283** (Unlimited) | **851** (Unlimited) |
| Choice — Basic (free) - see notes for paid tiers | 85 | 341 | 1,136 |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.63%.
- **Proposed change:** €29 / €69 → €15 / €39 (Pro includes €2,000). Affordability: Pro is 3.6 meals on Numbeo's €8 (thin data). Already far cheaper than Choice Basic and stays so.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No Slovak food-truck tool found (searched 'online objednávky reštaurácia vlastný web bez provízie cena mesačne'). Nearest-local: Choice (choiceqr.com/sk/cennik-choice) - Basic free + 3%, Standard €40/mo + 3%, Smart €85 0%, Pro €125 0%. DISH Order (Metro, global) also markets 0% commission, no SK price seen.

### GI · Gibraltar (Light)

- **Meal price:** £15 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Gibraltar)), checked 23 Oct 2026. Order value 1.3× = GBP 19.50. Online revenue: small GBP 2,925 · medium GBP 11,700 · busy GBP 39,000.
- **Exchange rate:** 1 EUR = 0.8377 GBP (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go £0 + 0.99% · Pro £29 incl. £4,000 of online orders, then 0.99% · Unlimited £69, no fee. Card processing assumed by the row: 1.5% + GBP 0.20 online (20 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.59%** of online revenue (UK 0.55%). Pro = 1.93 meals (UK 1.81).
- **Competitors:** none found with or without a public price.

| Monthly total, GBP (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 103 ✓ | 411 | 1,371 |
| HatchGrab Pro | 103 | 401 | 1,360 |
| HatchGrab Unlimited | 143 | 364 ✓ | 1,054 ✓ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. No ordering tool found (only marketplaces). Priced as the UK; europe-settings §8's £25 / £59 alternative still stands.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No food-truck or own-ordering tool found (searched 'Gibraltar takeaway online ordering app local restaurants'). Local apps are marketplaces: NomNoms and Hungry Monkey Gibraltar (no published restaurant fees).

### LI · Liechtenstein (Light)

- **Meal price:** CHF 30 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Liechtenstein)), checked 23 Oct 2026. Order value 1.3× = CHF 39.00. Online revenue: small CHF 5,850 · medium CHF 23,400 · busy CHF 78,000.
- **Exchange rate:** 1 EUR = 0.9211 CHF (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** Pay as you go CHF 0 + 0.99% · Pro CHF 27 incl. CHF 3’700 of online orders, then 0.99% · Unlimited CHF 65, no fee. Card processing assumed by the row: 1.5% + CHF 0.30 online (30 minor units).
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.28%** of online revenue (UK 0.55%). Pro = 0.90 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Pikit — Essentiel](https://pikit.ch/tarifs) | nearest-local | CHF 89/mo; VAT incl | separate | yes |

| Monthly total, CHF (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go | 191 | 763 | 2,542 |
| HatchGrab Pro | 181 ✓ | 753 | 2,533 |
| HatchGrab Unlimited | 198 | 596 ✓ | 1,835 ✓ |
| Pikit — Essentiel | 222¹ | 620¹ | 1,859¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **Proposed change:** None. Cheaper than Pikit (CHF 89, Swiss; Liechtenstein sales unconfirmed). Pro = 0.9 meals — the furthest below the UK — flagged, no rise.
- **Marketplaces (context only, excluded):** Not checked (light tier).
- **Research notes:** No Liechtenstein tool found. Nearest: Swiss click & collect tool Pikit (CHF 89/139/199 incl VAT, 0% commission) - its site lists Switzerland only, LI availability unconfirmed.

### IN · India (Light)

- **Meal price:** ₹200 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=India)), checked 23 Oct 2026. Order value 1.3× = INR 260.00. Online revenue: small INR 39,000 · medium INR 156,000 · busy INR 520,000.
- **Exchange rate:** 1 EUR = 106.249 INR (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro INR 3,081 incl. INR 424,996, Unlimited INR 7,331. Card processing assumed at Stripe's local standard rate 2% + 0.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.99%** of online revenue (UK 0.55%). Pro = 15.41 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [GloriaFood (Oracle) — Free + Online Payment add-on](https://www.gloriafood.com/pricing) | nearest-local | USD 29/mo; VAT excl | separate | closed to new sign-ups; shuts 30 Apr 2027 |

| Monthly total, INR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 1,166 ✓ | 4,664 ✓ | 15,548 |
| HatchGrab Pro (placeholder) | 3,861 | 6,201 | 14,422 ✓ |
| HatchGrab Unlimited (placeholder) | 8,111 | 10,451 | 17,731 |
| **HatchGrab proposed, cheapest plan** | **1,129** (Pro) | **3,969** (Unlimited) | **11,249** (Unlimited) |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.54%.
- **Proposed change:** New: ₹349 / ₹849 (Pro includes ₹50,000) — planning only. A euro conversion (₹3,081 / ₹7,331) is 15 meals; ₹349 is 1.75. Stripe India is invite-only. No food-truck tool found.
- **Marketplaces (context only, excluded):** Swiggy / Zomato (excluded) — rates not checked.
- **Research notes:** LIGHT. Stripe India is invite-only ('Request an invite'); 2% Visa/MC domestic. Thrive / DotPe pricing pages did not load. Nearest: GloriaFood. Petpooja excluded (POS).

### ID · Indonesia (Light)

- **Meal price:** Rp 30.000 — Numbeo "Meal, Inexpensive Restaurant" ([source](https://www.numbeo.com/cost-of-living/country_result.jsp?country=Indonesia)), checked 23 Oct 2026. Order value 1.3× = IDR 39000.00. Online revenue: small IDR 5,850,000 · medium IDR 23,400,000 · busy IDR 78,000,000.
- **Exchange rate:** 1 EUR = 20253.9 IDR (ECB reference rate of 22 Oct 2026, the latest published on 23 Oct).
- **HatchGrab today:** no price (no country_settings row). For the scenarios the euro prices are converted at the ECB rate as a placeholder: Pro IDR 587,363 incl. IDR 81,015,520, Unlimited IDR 1,397,518. Card processing assumed at Stripe's local standard rate 0% + 0.
- **Affordability:** HatchGrab's cheapest plan at medium (excl. card processing) = **0.99%** of online revenue (UK 0.55%). Pro = 19.58 meals (UK 1.81).

| Competitor (plan) | Focus | Price as advertised | Card processing | Counted? |
|---|---|---|---|---|
| [Take App — Basic](https://www.take.app/pricing) | nearest-local | USD 0/mo | separate | plan caps at 50 orders |
| [Take App — Business](https://www.take.app/pricing) | nearest-local | USD 50/mo | separate | yes |

| Monthly total, IDR (subscription + fees + card processing) | Small (150) | Medium (600) | Busy (2,000) |
|---|---:|---:|---:|
| HatchGrab Pay as you go (placeholder) | 57,915 ✓ | 231,660 ✓ | 772,200 |
| HatchGrab Pro (placeholder) | 587,363 | 587,363 | 587,363 ✓ |
| HatchGrab Unlimited (placeholder) | 1,397,518 | 1,397,518 | 1,397,518 |
| **HatchGrab proposed, cheapest plan** | **49,000** (Pro) | **129,000** (Unlimited) | **129,000** (Unlimited) |
| Take App — Business | 903,788¹ | 903,788¹ | 903,788¹ |

- **HatchGrab cheapest (truck-paid)?** small yes · medium yes · busy yes. Counting fees the customer pays too: small yes · medium yes · busy yes.
- **With the proposed prices:** small yes · medium yes · busy yes; share of medium revenue 0.55%.
- **Proposed change:** New: Rp 49.000 / Rp 129.000 (Pro includes Rp 7.000.000) — planning only. A euro conversion is 20 meals; Rp 49.000 is 1.6. ⚠️ Stripe Indonesia takes only bank-transfer virtual accounts — no cards — so HatchGrab's card flow cannot run there today.
- **Marketplaces (context only, excluded):** GoFood / GrabFood / ShopeeFood (excluded) — rates not checked.
- **Research notes:** LIGHT. Stripe Indonesia accounts support ONLY bank-transfer virtual accounts in IDR — no cards, no cross-border (support.stripe.com). That blocks HatchGrab's card flow. Nearest: Take App (USD). Moka/Majoo excluded (POS).


## 10 · Proposed prices as SQL — ⛔ NOT RUN

- **What a block does:** sets `monthly_minor` and `extra_van_monthly_minor` (an extra van costs the plan's price, as
  today), and Pro's `included_online_minor` where it changes.
- **What it does not touch:** `fee_bps` (Pay as you go and Pro stay 0.99%, Unlimited 0%).
- **Minor units:** every currency here is two-decimal at Stripe, HUF and CZK included (currency-registry), so 6 990 Ft
  is 699000.
- **Guards:** each statement changes a row only while the country is **switched off** and only if the price is still
  today's.

### 10.1 · Countries switched OFF (15 blocks)

```sql
-- CH · Switzerland — Unlimited CHF 65 → CHF 45. NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 4500,
       extra_van_monthly_minor = 4500,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'CH'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6500;    -- only if still at today's price
commit;

-- PT · Portugal — €29 / €69 → €25 / €59 (Pro includes €3,500). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 2500,
       extra_van_monthly_minor = 2500,
       included_online_minor = 350000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'PT'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 2900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 5900,
       extra_van_monthly_minor = 5900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'PT'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;

-- SE · Sweden — Unlimited 769 kr → 649 kr. NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 64900,
       extra_van_monthly_minor = 64900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'SE'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 76900;    -- only if still at today's price
commit;

-- DK · Denmark — Unlimited 519 kr. → 349 kr.. NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 34900,
       extra_van_monthly_minor = 34900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'DK'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 51900;    -- only if still at today's price
commit;

-- PL · Poland — 129 zł / 299 zł → 79 zł / 189 zł (Pro includes 10 000 zł). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 7900,
       extra_van_monthly_minor = 7900,
       included_online_minor = 1000000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'PL'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 12900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 18900,
       extra_van_monthly_minor = 18900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'PL'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 29900;    -- only if still at today's price
commit;

-- CZ · Czech Republic — 699 Kč / 1 690 Kč → 399 Kč / 990 Kč (Pro includes 55 000 Kč). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 39900,
       extra_van_monthly_minor = 39900,
       included_online_minor = 5500000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'CZ'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 69900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 99000,
       extra_van_monthly_minor = 99000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'CZ'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 169000;    -- only if still at today's price
commit;

-- RO · Romania — 149 lei / 369 lei → 89 lei / 199 lei (Pro includes 12.500 lei). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 8900,
       extra_van_monthly_minor = 8900,
       included_online_minor = 1250000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'RO'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 14900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 19900,
       extra_van_monthly_minor = 19900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'RO'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 36900;    -- only if still at today's price
commit;

-- GR · Greece — Unlimited €69 → €49. NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 4900,
       extra_van_monthly_minor = 4900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'GR'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;

-- BG · Bulgaria — €29 / €69 → €19 / €49 (Pro includes €2,500). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 1900,
       extra_van_monthly_minor = 1900,
       included_online_minor = 250000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'BG'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 2900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 4900,
       extra_van_monthly_minor = 4900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'BG'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;

-- HR · Croatia — €29 / €69 → €25 / €59 (Pro includes €3,500). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 2500,
       extra_van_monthly_minor = 2500,
       included_online_minor = 350000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'HR'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 2900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 5900,
       extra_van_monthly_minor = 5900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'HR'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;

-- HU · Hungary — 10 990 Ft / 24 990 Ft → 6 990 Ft / 16 990 Ft (Pro includes 1 000 000 Ft). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 699000,
       extra_van_monthly_minor = 699000,
       included_online_minor = 100000000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'HU'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 1099000;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 1699000,
       extra_van_monthly_minor = 1699000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'HU'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 2499000;    -- only if still at today's price
commit;

-- LT · Lithuania — €29 / €69 → €25 / €59 (Pro includes €3,500). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 2500,
       extra_van_monthly_minor = 2500,
       included_online_minor = 350000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'LT'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 2900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 5900,
       extra_van_monthly_minor = 5900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'LT'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;

-- LV · Latvia — €29 / €69 → €25 / €59 (Pro includes €3,500). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 2500,
       extra_van_monthly_minor = 2500,
       included_online_minor = 350000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'LV'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 2900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 5900,
       extra_van_monthly_minor = 5900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'LV'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;

-- SI · Slovenia — €29 / €69 → €25 / €59 (Pro includes €3,500). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 2500,
       extra_van_monthly_minor = 2500,
       included_online_minor = 350000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'SI'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 2900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 5900,
       extra_van_monthly_minor = 5900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'SI'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;

-- SK · Slovakia — €29 / €69 → €15 / €39 (Pro includes €2,000). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 1500,
       extra_van_monthly_minor = 1500,
       included_online_minor = 200000,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'SK'
   and pp.plan_key = 'pro'
   and pp.monthly_minor = 2900;    -- only if still at today's price
update public.plan_prices pp
   set monthly_minor = 3900,
       extra_van_monthly_minor = 3900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = false          -- only while the country is switched OFF
   and pp.country_code = 'SK'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;
```

### 10.2 · Country switched ON — for Dominic to decide

Ireland is live (enabled since 21 Oct 2026). Lowering Unlimited €69 → €49 beats Order Tiger (€59) at medium and busy.
It would also make Ireland's euro ladder differ from the other euro countries'. GB, US, CA, AU and NZ: no change
proposed (§1).

```sql
-- IE · Ireland — Unlimited €69 → €49 (switched ON — Dominic decides). NOT RUN.
begin;
update public.plan_prices pp
   set monthly_minor = 4900,
       extra_van_monthly_minor = 4900,
       updated_at = now()
  from public.country_settings cs
 where cs.country_code = pp.country_code
   and cs.enabled = true          -- IE is switched ON: run only on Dominic’s decision
   and pp.country_code = 'IE'
   and pp.plan_key = 'unlimited'
   and pp.monthly_minor = 6900;    -- only if still at today's price
commit;
```

### 10.3 · Planned countries (no `country_settings` row): proposals only, no SQL

There's nothing to update: an `insert` needs the country row first, and its currency needs adding to
`lib/currencies.ts` and the CHECK.

| Country | Pro / Unlimited (Pro includes) | Currency | Why |
|---|---|---|---|
| BR Brazil | R$ 59 / R$ 149 (Pro includes R$ 8.000) | BRL | A euro conversion (R$ 164 / R$ 390) is 4.7 meals for Pro against the UK's 1.8; this brings it to 1.7. Still not cheapest: VexMenu's free plan charges a Pix rate (2.99%) below Stripe Brazil's card rate (3.99% + R$0.39), and OlaClick has a free tier — a payment-method gap, not a plan-price one. |
| MX Mexico | $349 / $849 (Pro includes $50,000) | MXN | Brings Pro from 3.0 meals (euro conversion $610) to 1.75. Free tiers of OlaClick, QRico and Aparece (order limits unpublished) stay cheaper; TuMenúDigital, the food-truck tool (MX$149 + 6% bundled), is beaten. |
| JP Japan | ¥1,980 / ¥2,980 (Pro includes ¥250,000) | JPY | A euro conversion (¥5,103 / ¥12,142) is 5.1 meals; ¥1,980 is 2.0. Unlimited ¥2,980 beats KitchenCarMenu, the closest food-truck rival (¥3,980, or ¥3,317 a month yearly). funfo BASIC (¥0, nearest-local, card rate unpublished) stays cheaper: structural. |
| SG Singapore | $29 / $59 (Pro includes $4,000) | SGD | A euro conversion (S$42 / S$99) is 2.8 meals; S$29 is 1.9. Unlimited S$59 beats Take App (US$50 ≈ S$64) and Klikit (S$68). |
| HK Hong Kong | HK$119 / HK$269 (Pro includes HK$15,000) | HKD | A euro conversion (HK$255 / HK$606) is 4.1 meals; HK$119 is 1.9. Cheapest at all three against MenuTiger, Take App and VGather. Hong Kong has almost no food-truck market (the pilot scheme ended in 2022). |
| MY Malaysia | RM29 / RM69 (Pro includes RM4,000) | MYR | A euro conversion (RM133 / RM316) is 8.8 meals; RM29 is 1.9. Cheapest at all three against Take App and Klikit (RM218). |
| AE United Arab Emirates | AED 59 / AED 149 (Pro includes AED 8,000) | AED | A euro conversion (AED 119 / AED 284) is 3.4 meals; AED 59 is 1.7. HatchGrab's own charge is the lowest everywhere, but the total loses at medium and busy to Zyda, whose 2.5% gateway undercuts Stripe UAE's 2.9% + AED 1. |
| TH Thailand | ฿199 / ฿449 (Pro includes ฿25,000) | THB | A euro conversion (฿1,097 / ฿2,609) is 11 meals; ฿199 is 2.0. Cheapest at all three against MenuTiger, Take App and Klikit. Card cost (3.65% + ฿10) is 14% of a ฿130 order. |
| IN India | ₹349 / ₹849 (Pro includes ₹50,000) — planning only | INR | A euro conversion (₹3,081 / ₹7,331) is 15 meals; ₹349 is 1.75. Stripe India is invite-only. No food-truck tool found. |
| ID Indonesia | Rp 49.000 / Rp 129.000 (Pro includes Rp 7.000.000) — planning only | IDR | A euro conversion is 20 meals; Rp 49.000 is 1.6. ⚠️ Stripe Indonesia takes only bank-transfer virtual accounts — no cards — so HatchGrab's card flow cannot run there today. |

### 10.4 · If you prefer one euro price

The euro-country proposals split three ways:
- €19 / €49 (BG);
- €25 / €59 (HR, LT, LV, SI, PT);
- €15 / €39 (SK).

Separately, Unlimited €49 would apply to GR and IE. A single alternative is **€29 / €49 for every euro country**. Checked: it fixes the
same two Unlimited losses (GR and IE become cheapest at all three volumes), leaves ES, FR, IT, NL and PT's small volume
unchanged (structural), and does not close the affordability gap in BG, HR, LT, LV, SI, SK and PT.

## 11 · Read-only SQL run in this workstream

1. columns of the two price tables

```sql
select table_name, column_name, data_type from information_schema.columns where table_schema='public' and table_name in ('plan_prices','country_settings') order by table_name, ordinal_position;
```

2. every country row with its card fees and plan prices

```sql
select c.country_code, c.name, c.enabled, c.currency, c.locale, c.prices_include_tax,
  c.card_fee_online_pct, c.card_fee_online_fixed_minor, c.card_fee_in_person_pct, c.card_fee_in_person_fixed_minor, c.tap_to_pay_fixed_minor, c.card_fee_region_label,
  c.platform_fee_pct, c.platform_fee_enabled, c.competitor_name, c.competitor_pct, c.competitor_fixed_minor,
  json_agg(json_build_object('plan',p.plan_key,'monthly',p.monthly_minor,'incl',p.included_online_minor,'fee_bps',p.fee_bps,'van',p.extra_van_monthly_minor) order by p.monthly_minor) as plans
from public.country_settings c left join public.plan_prices p on p.country_code=c.country_code
group by c.country_code order by c.enabled desc, c.country_code;
```

3. planned countries have no row

```sql
select country_code, name, enabled from public.country_settings where country_code in ('FR','BR','MX','JP','SG','HK','MY','AE','TH','IN','ID','IS');
```

4. the plans and their feature switches

```sql
select p.key, p.name, p.is_public, p.included_vans, p.pay_at_hatch_allowed, p.trial_months, p.is_signup_default,
 (select json_agg(json_build_object(f.feature, f.enabled)) from public.plan_features f where f.plan_key=p.key) as switches
from public.plans p order by p.sort_order;
```

5. triggers on plan_prices

```sql
select tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t where tgrelid='public.plan_prices'::regclass and not tgisinternal;
```

6. trucks per country and plan (who a price change would reach)

```sql
select country, plan, count(*) as trucks from public.trucks group by country, plan order by country, plan;
```

## 12 · Limits and follow-ups

- **Search budget:** a 200-per-turn web-search cap shared by all agents ended every first-pass group early. The second
  pass (about 100 searches) filled IE, PT, IT, NO, FI, RO, AU, MY, AE, TH, HK and the light tier, but those are still
  thinner than the brief's Deep tier asks for.
  - **AU** (Deep) has no food-truck tool with a public price: Where The Truck and Qhop are both quote-only.
  - **Unchecked leads:** BR (Instadelivery, Neemo, MenuDino, Brendi, Cardapius, Bigou, MenuVem); NL (Orderli, Tapp,
    Yourorder, Mr. Bites, Bestelapp, Foodbooking, Tabesto); CH (foodtrucks.ch, e-guma); BE (Orderbilly); CA (Quebec
    French-language tools); FR (Qwick Order, €29/user).
- **Second-hand prices** (from search snippets or third-party pages, marked in the CSV notes): Simpliza R$79, Anota AI,
  funfo Pro, どこでも注文くん, Truckster ~$15, Cheerfy, VGather, Capterra's MOBI figure.
- **Unclear labels:**
  - Weevi: which of £71/£78 is monthly.
  - Zyda: whether the price is monthly or quarterly.
  - Vev: its currency.
  - Yoveletta: its "from CHF 29".
  - Beat The Queue: the page contradicts itself (1.4% + 10p against its 50p calculator).
  - TuMenúDigital: MX$99 or MX$149.
- **Australia:** the AU agent saw references to an RBA card-surcharge ban (me&u swapped its 1.7% surcharge for a
  guest platform fee). If it is in force, AU trucks may not be able to pass card fees on, which matters for
  `card_surcharge_allowed`. Worth a separate check.
- **Not in scope and not done:** feature-for-feature scoring. The CSV records each rival's features, but most pages
  don't say whether they have a KDS, printed tickets or allergens ("unknown").

## Undo (only if Dominic asks)

⛔ DO NOT RUN — only if Dominic asks to reverse a block from §10 after it has been run. Each line puts today's price back,
and only if the proposed price is still there.

```sql
-- IE · Ireland: back to today's prices
begin;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'IE' and plan_key = 'unlimited' and monthly_minor = 4900;
commit;

-- CH · Switzerland: back to today's prices
begin;
update public.plan_prices set monthly_minor = 6500, extra_van_monthly_minor = 6500, updated_at = now() where country_code = 'CH' and plan_key = 'unlimited' and monthly_minor = 4500;
commit;

-- PT · Portugal: back to today's prices
begin;
update public.plan_prices set monthly_minor = 2900, extra_van_monthly_minor = 2900, included_online_minor = 400000, updated_at = now() where country_code = 'PT' and plan_key = 'pro' and monthly_minor = 2500;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'PT' and plan_key = 'unlimited' and monthly_minor = 5900;
commit;

-- SE · Sweden: back to today's prices
begin;
update public.plan_prices set monthly_minor = 76900, extra_van_monthly_minor = 76900, updated_at = now() where country_code = 'SE' and plan_key = 'unlimited' and monthly_minor = 64900;
commit;

-- DK · Denmark: back to today's prices
begin;
update public.plan_prices set monthly_minor = 51900, extra_van_monthly_minor = 51900, updated_at = now() where country_code = 'DK' and plan_key = 'unlimited' and monthly_minor = 34900;
commit;

-- PL · Poland: back to today's prices
begin;
update public.plan_prices set monthly_minor = 12900, extra_van_monthly_minor = 12900, included_online_minor = 1750000, updated_at = now() where country_code = 'PL' and plan_key = 'pro' and monthly_minor = 7900;
update public.plan_prices set monthly_minor = 29900, extra_van_monthly_minor = 29900, updated_at = now() where country_code = 'PL' and plan_key = 'unlimited' and monthly_minor = 18900;
commit;

-- CZ · Czech Republic: back to today's prices
begin;
update public.plan_prices set monthly_minor = 69900, extra_van_monthly_minor = 69900, included_online_minor = 10000000, updated_at = now() where country_code = 'CZ' and plan_key = 'pro' and monthly_minor = 39900;
update public.plan_prices set monthly_minor = 169000, extra_van_monthly_minor = 169000, updated_at = now() where country_code = 'CZ' and plan_key = 'unlimited' and monthly_minor = 99000;
commit;

-- RO · Romania: back to today's prices
begin;
update public.plan_prices set monthly_minor = 14900, extra_van_monthly_minor = 14900, included_online_minor = 2150000, updated_at = now() where country_code = 'RO' and plan_key = 'pro' and monthly_minor = 8900;
update public.plan_prices set monthly_minor = 36900, extra_van_monthly_minor = 36900, updated_at = now() where country_code = 'RO' and plan_key = 'unlimited' and monthly_minor = 19900;
commit;

-- GR · Greece: back to today's prices
begin;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'GR' and plan_key = 'unlimited' and monthly_minor = 4900;
commit;

-- BG · Bulgaria: back to today's prices
begin;
update public.plan_prices set monthly_minor = 2900, extra_van_monthly_minor = 2900, included_online_minor = 400000, updated_at = now() where country_code = 'BG' and plan_key = 'pro' and monthly_minor = 1900;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'BG' and plan_key = 'unlimited' and monthly_minor = 4900;
commit;

-- HR · Croatia: back to today's prices
begin;
update public.plan_prices set monthly_minor = 2900, extra_van_monthly_minor = 2900, included_online_minor = 400000, updated_at = now() where country_code = 'HR' and plan_key = 'pro' and monthly_minor = 2500;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'HR' and plan_key = 'unlimited' and monthly_minor = 5900;
commit;

-- HU · Hungary: back to today's prices
begin;
update public.plan_prices set monthly_minor = 1099000, extra_van_monthly_minor = 1099000, included_online_minor = 150000000, updated_at = now() where country_code = 'HU' and plan_key = 'pro' and monthly_minor = 699000;
update public.plan_prices set monthly_minor = 2499000, extra_van_monthly_minor = 2499000, updated_at = now() where country_code = 'HU' and plan_key = 'unlimited' and monthly_minor = 1699000;
commit;

-- LT · Lithuania: back to today's prices
begin;
update public.plan_prices set monthly_minor = 2900, extra_van_monthly_minor = 2900, included_online_minor = 400000, updated_at = now() where country_code = 'LT' and plan_key = 'pro' and monthly_minor = 2500;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'LT' and plan_key = 'unlimited' and monthly_minor = 5900;
commit;

-- LV · Latvia: back to today's prices
begin;
update public.plan_prices set monthly_minor = 2900, extra_van_monthly_minor = 2900, included_online_minor = 400000, updated_at = now() where country_code = 'LV' and plan_key = 'pro' and monthly_minor = 2500;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'LV' and plan_key = 'unlimited' and monthly_minor = 5900;
commit;

-- SI · Slovenia: back to today's prices
begin;
update public.plan_prices set monthly_minor = 2900, extra_van_monthly_minor = 2900, included_online_minor = 400000, updated_at = now() where country_code = 'SI' and plan_key = 'pro' and monthly_minor = 2500;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'SI' and plan_key = 'unlimited' and monthly_minor = 5900;
commit;

-- SK · Slovakia: back to today's prices
begin;
update public.plan_prices set monthly_minor = 2900, extra_van_monthly_minor = 2900, included_online_minor = 400000, updated_at = now() where country_code = 'SK' and plan_key = 'pro' and monthly_minor = 1500;
update public.plan_prices set monthly_minor = 6900, extra_van_monthly_minor = 6900, updated_at = now() where country_code = 'SK' and plan_key = 'unlimited' and monthly_minor = 3900;
commit;
```

## 13 · Sources (all checked 23 Oct 2026)

- ECB reference rates: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml (rates of 22 Oct 2026)
- HatchGrab's own prices: live `public.plan_prices` / `public.country_settings` (§11); docs/native-prices-report.md;
  docs/europe-settings-report.md §8; docs/france-1-report.md (FR block B)
- Stripe local pricing pages, for the planned countries' card rates and the agents' checks of AU, NZ and CH:
  https://stripe.com/au/pricing, /nz/pricing, /ch/pricing, /br/pricing, /mx/pricing, /jp/pricing, /sg/pricing,
  /hk/pricing, /my/pricing, /ae/pricing, /th/pricing, /in/pricing; Indonesia: support.stripe.com (cards not supported)
- https://achil.com/web/food-truck/tarifs/ — FR Achil (checked 23 Oct 2026)
- https://and-iot.jp/smart-order-system — JP AdvaNceD IoT キッチンカー＆屋台スマートオーダーシステム (Device Agency) (checked 23 Oct 2026)
- https://anota.ai/planos — BR Anota AI (checked 23 Oct 2026)
- https://aparece.mx/ — MX Aparece (checked 23 Oct 2026)
- https://apheliossoftware.com/Price — GB Aphelios (checked 23 Oct 2026)
- https://apps.apple.com/ca/app/foodtrucker-find-order/id6760668126 — CA FoodTrucker - Find & Order (checked 23 Oct 2026)
- https://apps.apple.com/us/app/id1375287755 — US Truckster (checked 23 Oct 2026)
- https://beatthequeue.co.uk/ — GB Beat The Queue (checked 23 Oct 2026)
- https://beaucamion.fr/pricing — FR Beau Camion (checked 23 Oct 2026)
- https://bestelltheke.de/#preise — DE Bestelltheke (checked 23 Oct 2026)
- https://bestelly.nl/ — NL Bestelly (checked 23 Oct 2026)
- https://bopple.com/pricing — AU Bopple (checked 23 Oct 2026)
- https://bopple.com/pricing/fees — NZ Bopple (checked 23 Oct 2026)
- https://choiceqr.com/cs/cenik-choice/ — CZ Choice (checked 23 Oct 2026)
- https://choiceqr.com/et/hinnakiri-choice-qr/ — EE Choice (checked 23 Oct 2026)
- https://choiceqr.com/hu/arazas/ — HU Choice (checked 23 Oct 2026)
- https://choiceqr.com/lt/kainorastis-choice-qr/ — LT Choice (checked 23 Oct 2026)
- https://choiceqr.com/lv/cenradis-choice-qr/ — LV Choice (checked 23 Oct 2026)
- https://choiceqr.com/ro/preturi/ — RO Choice (checked 23 Oct 2026)
- https://choiceqr.com/sk/cennik-choice/ — SK Choice (checked 23 Oct 2026)
- https://clickandcollection.com/new_pricing — IE Click & Collection (checked 23 Oct 2026)
- https://customers.bestfoodtrucks.com/blog/bft-online-ordering — US Best Food Trucks (BFT) (checked 23 Oct 2026)
- https://digitalemenukaart.nl/prijzen — NL Digitale Menukaart (checked 23 Oct 2026)
- https://doeatbetterexperience.com/es/blog/guia-time-out-market-lisboa/ — PT meal price (checked 23 Oct 2026)
- https://dtspp.cyberport.hk/product/vgather-self-ordering-service-package-2-years-contract/ — HK VGather self-ordering service (checked 23 Oct 2026)
- https://eatch.app/#pricing — FR Eatch (checked 23 Oct 2026)
- https://en.cheerfy.com/pricing/shop — ES Cheerfy Shop (checked 23 Oct 2026)
- https://findhomegrown.com/signup — US Homegrown (checked 23 Oct 2026)
- https://food4you.fi/#hinnasto — FI Food4you (checked 23 Oct 2026)
- https://foodshero.de/preise — DE FoodsHero (checked 23 Oct 2026)
- https://foodticket.nl/foodtruck/ — NL Foodticket (checked 23 Oct 2026)
- https://foodtruck.pub/plans.aspx — CA Food Truck Pub, US Food Truck Pub (checked 23 Oct 2026)
- https://foodtruckone.com/#pricing — US Food Truck ONE (Food Truck OS) (checked 23 Oct 2026)
- https://foodtruckpos.nl/ — NL FoodTruck POS (checked 23 Oct 2026)
- https://foodtruckya.com/es/proveedores/software-y-tecnologia/check — ES Check (checked 23 Oct 2026)
- https://foodtruckya.com/es/proveedores/software-y-tecnologia/festeapay — ES FesteaPay (checked 23 Oct 2026)
- https://foodtruckya.com/es/proveedores/software-y-tecnologia/ordeno-app — ES Ordeno App (checked 23 Oct 2026)
- https://gastro-online.at/ — AT GastroOnline & Winorder (checked 23 Oct 2026)
- https://gastro.digital/preise/ — AT GASTRODIGITAL, DE GASTRODIGITAL (checked 23 Oct 2026)
- https://get.chownow.com/pricing/ — US ChowNow (checked 23 Oct 2026)
- https://goodfynd.com/pricing — US Goodfynd (checked 23 Oct 2026)
- https://goomer.com.br/planos — BR Goomer (checked 23 Oct 2026)
- https://heustach.fr/je-suis-commercant/tarifs/ — FR Heustach (checked 23 Oct 2026)
- https://jamezz.com/industries/food-trucks — NL Jamezz (checked 23 Oct 2026)
- https://kitchencarmenu.com/pricing — JP KitchenCarMenu (キッチンカーメニュー) (checked 23 Oct 2026)
- https://klikit.io/en/learn/food-delivery-commission-fees-malaysia-guide — MY marketplace line (checked 23 Oct 2026)
- https://klikit.io/en/pricing — SG Klikit (checked 23 Oct 2026)
- https://klikit.io/ms/pricing — MY Klikit (checked 23 Oct 2026)
- https://klikit.io/th/pricing — TH Klikit (checked 23 Oct 2026)
- https://liefersoft.de/ — DE Liefersoft (checked 23 Oct 2026)
- https://liven.love/pricing — AU Liven (checked 23 Oct 2026)
- https://lme.jp/media/system/anywhere-chumonkun/ — JP どこでも注文くん (Chuzmonster) (checked 23 Oct 2026)
- https://menu55.cz/objednavky-rozvoz — CZ Menu55 (checked 23 Oct 2026)
- https://mobaregi.jp/ — JP モバレジ (Mobaregi, EDDYS FACTORY) (checked 23 Oct 2026)
- https://mobihq.com/pricing/smbs — NZ MOBI (formerly Mobi2Go) (checked 23 Oct 2026)
- https://noqgroup.com/ — GB NOQ (checked 23 Oct 2026)
- https://olaclick.com/es/software-para-restaurantes/ — MX OlaClick (checked 23 Oct 2026)
- https://ordermoonrise.com/pricing.html — US Moonrise (checked 23 Oct 2026)
- https://outbites.com/pricing — US Outbites (checked 23 Oct 2026)
- https://paymezone.com — ES PAYMEZONE (checked 23 Oct 2026)
- https://pedizap.com.br/ — BR Pedizap (checked 23 Oct 2026)
- https://perkss.co.uk/pricing/ — GB Perkss (checked 23 Oct 2026)
- https://pidopago.com/ — ES pidopago (checked 23 Oct 2026)
- https://pikit.ch/tarifs — LI Pikit (checked 23 Oct 2026)
- https://placeaemporter.fr/ — FR Place à emporter (checked 23 Oct 2026)
- https://plick.com.mx/precios — MX Plick (checked 23 Oct 2026)
- https://pricing.olaclick.app/es — MX OlaClick (checked 23 Oct 2026)
- https://pricing.olaclick.app/pt — BR OlaClick (checked 23 Oct 2026)
- https://qrder.app/pricing — NL Qrder (checked 23 Oct 2026)
- https://qrico.mx/ — MX QRico (checked 23 Oct 2026)
- https://qromo.it/prezzi/ — IT Qromo (checked 23 Oct 2026)
- https://restaurant-internet.com/pricing — FR Restaurant-internet.com (checked 23 Oct 2026)
- https://restaurant.menufy.com/pricing — US Menufy (checked 23 Oct 2026)
- https://restolabs.com/pricing — US Restolabs (checked 23 Oct 2026)
- https://ritual.co — CA Ritual (checked 23 Oct 2026)
- https://saas.imitsu.jp/cate-mobile-order/ — JP ISSUE PANDA (3bitter) (checked 23 Oct 2026)
- https://saas.imitsu.jp/cate-mobile-order/service/3799/price — JP O:der ToGo (Showcase Gig) (checked 23 Oct 2026)
- https://saas.imitsu.jp/cate-pos-register/service/4041/price — JP funfo (checked 23 Oct 2026)
- https://simpliza.com.br/food-truck.php — BR Simpliza (checked 23 Oct 2026)
- https://spevdo.gr/en/#pricing — GR Spevdo (checked 23 Oct 2026)
- https://storekit.com/pricing — GB Storekit (checked 23 Oct 2026)
- https://streetfoodfinder.com/pricing — US StreetFoodFinder (checked 23 Oct 2026)
- https://streetfoodspot.nz/ — NZ Street Food Spot (checked 23 Oct 2026)
- https://take-eats.jp/ — JP テイクイーツ (Take Eats) (checked 23 Oct 2026)
- https://topestrellas.com/modulos/sistema-pedidos-restaurantes/ — ES TopEstrellas (Pedidos module) (checked 23 Oct 2026)
- https://truckfindr.com/ — US Truckfindr (checked 23 Oct 2026)
- https://truckons.com/click-and-collect-food-truck — FR Truckons (checked 23 Oct 2026)
- https://truckons.com/rejoindre — FR Truckons (checked 23 Oct 2026)
- https://tumenudigital.mx/software-para-food-truck — MX TuMenúDigital (checked 23 Oct 2026)
- https://vev.co/specialty/foodtruck — NL Vev (checked 23 Oct 2026)
- https://vexmenu.com/para/food-truck — BR VexMenu (checked 23 Oct 2026)
- https://virtualline.com.br/ — BR VirtualLine (checked 23 Oct 2026)
- https://web.favrit.com/pris — NO Favrit (checked 23 Oct 2026)
- https://weiq.tech/pris/ — SE WEIQ (checked 23 Oct 2026)
- https://wheresthefoodtruck.com/vendors.html — US Where's The Foodtruck (checked 23 Oct 2026)
- https://wherethetruck.at — AU Where The Truck (AMFVG) (checked 23 Oct 2026)
- https://wiizeat.com/business/ — CY Wiiz Eat (checked 23 Oct 2026)
- https://www.capterra.ca/software/200188/moduurn — CA Moduurn (checked 23 Oct 2026)
- https://www.cardapioweb.com/ — BR Cardápio Web (checked 23 Oct 2026)
- https://www.destination.com/chat-with/dublin/street-food-actually-good — IE meal price (checked 23 Oct 2026)
- https://www.digitaste.be/foodtruck — BE Digitaste (checked 23 Oct 2026)
- https://www.dineeasy.app/it/pricing — IT DineEasy (checked 23 Oct 2026)
- https://www.dineeasy.app/pt — PT DineEasy (checked 23 Oct 2026)
- https://www.flipdish.com/gb/pricing — GB Flipdish (checked 23 Oct 2026)
- https://www.flipdish.com/ie/pricing — IE Flipdish (checked 23 Oct 2026)
- https://www.foodpronto.com.br/ — BR Food Pronto (checked 23 Oct 2026)
- https://www.gloriafood.com/pricing — AE GloriaFood (Oracle), GB GloriaFood, IE GloriaFood, IN GloriaFood (Oracle), TH GloriaFood (Oracle) (checked 23 Oct 2026)
- https://www.grab.com/th/blog/askgrab-merchant-commission/ — TH marketplace line (checked 23 Oct 2026)
- https://www.grafterr.com/uk/epos-pricing — GB Grafterr (checked 23 Oct 2026)
- https://www.hospitalitynewsmag.com/spot/ — AE Spot (Spot – Drive Thru Pickup app) (checked 23 Oct 2026)
- https://www.hotplate.com/pricing — US Hotplate (checked 23 Oct 2026)
- https://www.hungryhungry.com/plans — AU HungryHungry (checked 23 Oct 2026)
- https://www.hungrytrucks.com/partners.html — NZ HungryTrucks (checked 23 Oct 2026)
- https://www.itscom.co.jp/forbiz/column/office-environment/12389/ — JP marketplace line (checked 23 Oct 2026)
- https://www.itsordable.com/en/uae/pricing — AE Ordable (checked 23 Oct 2026)
- https://www.jmenu.it/takeaway-delivery-per-ristoranti-pizzerie/ — IT JMENU (checked 23 Oct 2026)
- https://www.lycbiz.com/jp/service/line-mini-app/package/funfo — JP funfo (checked 23 Oct 2026)
- https://www.menutiger.com/pricing — HK MenuTiger, RO MENU TIGER (global), TH MenuTiger (checked 23 Oct 2026)
- https://www.menutiger.com/pt/pricing — PT MENU TIGER (checked 23 Oct 2026)
- https://www.nemtakeaway.dk/en/price/ — DK NemTakeAway (checked 23 Oct 2026)
- https://www.nomadcaisse.fr/#tarifs — FR Nomad (nomadcaisse.fr) (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_price_rankings?itemId=1&displayCurrency=EUR — BG meal price, CY meal price, EE meal price, FI meal price, GR meal price, HR meal price, LT meal price, LU meal price, LV meal price, MT meal price, SI meal price, SK meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Australia — AU meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Austria — AT meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Belgium — BE meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Brazil&displayCurrency=BRL — BR meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Canada — CA meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Czech+Republic — CZ meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Denmark — DK meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=France — FR meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Germany — DE meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Gibraltar — GI meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Hong+Kong+(China) — HK meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Hungary — HU meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=India — IN meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Indonesia — ID meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Italy — IT meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Japan — JP meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Liechtenstein — LI meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Malaysia — MY meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Mexico&displayCurrency=MXN — MX meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Netherlands — NL meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=New+Zealand — NZ meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Norway — NO meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Poland — PL meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Romania — RO meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Singapore — SG meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Spain — ES meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Sweden — SE meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Switzerland — CH meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=Thailand — TH meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=United+Arab+Emirates — AE meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=United+Kingdom — GB meal price (checked 23 Oct 2026)
- https://www.numbeo.com/cost-of-living/country_result.jsp?country=United+States — US meal price (checked 23 Oct 2026)
- https://www.ordea.uk/ — GB Ordea (checked 23 Oct 2026)
- https://www.ordering.co/best-online-ordering-for-food-trucks-commission-free-pre-order — US Ordering.co (checked 23 Oct 2026)
- https://www.ordering.co/pricing — AU Ordering.co (checked 23 Oct 2026)
- https://www.ordertiger.com/online-ordering-system-pricing — GB Order Tiger, IE Order Tiger (checked 23 Oct 2026)
- https://www.orderup.com.au/ — AU Order Up! (moving to Nomni) (checked 23 Oct 2026)
- https://www.ordinalo.com/prezzi/ — IT Ordinalo (checked 23 Oct 2026)
- https://www.owner.com/pricing — US Owner.com (checked 23 Oct 2026)
- https://www.pointmeup.com/es/food-trucks — MX Point (pointmeup) (checked 23 Oct 2026)
- https://www.qhop.com.au/ — AU Qhop (checked 23 Oct 2026)
- https://www.qopla.com/ — SE Qopla (checked 23 Oct 2026)
- https://www.sisfood.com.br/segmentos/sistema-para-food-truck — BR SisFood (checked 23 Oct 2026)
- https://www.slerp.com/ai-info-page/ — GB Slerp (checked 23 Oct 2026)
- https://www.snackpass.co/ — US Snackpass (checked 23 Oct 2026)
- https://www.softensistemas.com.br/segmentos/sistema-para-food-truck — BR Soften Food (checked 23 Oct 2026)
- https://www.superbexperience.com/pricing — NO Superb (checked 23 Oct 2026)
- https://www.take.app/pricing — HK Take App, ID Take App, MY Take App, SG Take App, TH Take App (checked 23 Oct 2026)
- https://www.thefoodygram.com/pages/pricing — US The Foody Gram (checked 23 Oct 2026)
- https://www.thestandard.com.hk/news/article/229656/Food-delivery-competition-heats-up-as-Deliveroo-exits-HK-market — HK marketplace line (checked 23 Oct 2026)
- https://www.tryoto.com/otopedia/blog/food-delivery — AE marketplace line (checked 23 Oct 2026)
- https://www.uob.com.sg/business/digital/digital-transaction-marketing/oddle.page — SG Oddle (checked 23 Oct 2026)
- https://www.upmenu.com/pl/cennik/ — PL UpMenu (checked 23 Oct 2026)
- https://www.weevi.com/food-trucks/pricing — GB Weevi (checked 23 Oct 2026)
- https://www.xmenu.it/it — IT xMenu (checked 23 Oct 2026)
- https://www.yoello.com/ — GB Yoello (checked 23 Oct 2026)
- https://www.zyda.com/pricing — AE Zyda (checked 23 Oct 2026)
- https://yoveletta.ch/preise — CH Yoveletta (checked 23 Oct 2026)
- https://zay-os.com/pricing — US Zay-OS (Zayos) (checked 23 Oct 2026)
