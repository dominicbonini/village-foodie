# compare-research-7 · agent 2 (25 Nov 2026)

## Block 1 — stored Asian / Middle-Eastern vendors (raw/V-<vendor>.json)

| Vendor | Result |
|---|---|
| **Zyda** | **NEW: counts in QA and BH (borderline)** — its country pages carry local "from" prices: https://www.zyda.com/qatar/ «Plans from 2,850 QAR a year.»; https://www.zyda.com/bahrain/ «Plans from 190 BHD a year.»; pickup «Order ahead, collect fast». Yearly-only "from" price for an unnamed plan. Jordan not in its Countries list |
| Ordable | QA BH JO already; no other one-short country in its selectors |
| Foodics | no Bahrain / Jordan price page; Qatar page USD only |
| Blink | still "$" only, no currency code on any page; /qatar/ has no price or pickup wording |
| Take App | USD only; SV, BH, JO, QA not listed (LK DO GT JM CO listed but need local currency) |
| Klikit | 7 APAC markets only |
| Eats365 | has /kr/ and /lk/en/ regions, but pricing pages show no amounts (Online Ordering = unpriced Expansion Module) |
| Dinehere, uEngage | India only (₹) |
| Oddle | 403 twice (unreadable) |
| Qashier, StoreHub | SG/MY/TH/PH only |
| MENU TIGER | names no country; USD |
| tossdown | names no one-short country |
| Restora POS | USD toggle names no country (UAE office only) |
| POS Masters, Qvian, Ewity | home market only |

## Block 2 — countries

| Country | New sites / searches | Verdict | Count now |
|---|---|---|---|
| KR | Toss Order product page re-read (still no fee); 6 Korean searches → platforms, builders, table-order, gigs | nothing new | 0 |
| QA | (Zyda from Block 1) | Zyda added (borderline) | **2** if Zyda accepted, else 1 |
| BH | (Zyda from Block 1); OrderJet (App Store / news only) | Zyda added (borderline) | **2** if Zyda accepted, else 1 |
| JO | Orange Jordan POS (till); 5 Arabic/English searches | nothing new | 1 |
| LK | Merpacc (till); 3 searches | nothing new | 1 |
| BD | YouthFireIT (delivery / chat only); 3 searches | nothing new | 1 |

## Block 3 — Restolabs AW (raw/B3-Restolabs.json)

No endpoint. The pricing page's own HTML holds the amounts in `data-month` / `data-year` attributes (`<span data-year="55" data-month="69" class="price_number">00`), filled by an inline jQuery/GSAP script; the only fetch() goes to ipapi.co (form geolocation). Same amounts in its JSON-LD offers (USD). Monthly billing: Basic $69, Growth $99, Pro $199 (yearly $55 / $79 / $159). USD only, no AWG → still not counted in AW.

## Block 6 — a third tool for live countries

| Country | Added | Price | Count now |
|---|---|---|---|
| AU | Bopple (stored) | AUD 49/month + 1.64% + $0.10 (server HTML renders AUD selected) | **3** |
| NZ | Bopple (stored) | NZD 49/month + 2.4% + $0.10 (pricing script: only US differs, $29) | **3** |
| JP | funfo (stored) | JPY 0/month + 3.35%～ (funfo.jp takeout page); KitchenCarMenu still 503 | **3** |
| KW | Foodics (stored) | KWD 48.3/mo Advanced Bundle (quarterly billing; yearly 45.7), includes "Foodics Online Web Creation" | **3** |
| OM | Zyda (stored) | «Plans from 190 OMR a year.» | **3** |
| SA | Zyda (stored) | «Plans from 3,350 SAR a year.» | **3** |
| TR | Komisyonsuz (new) | «999 ₺/ ay» Online Sipariş Sistemi (gel-al), + KDV | **3** |
| EG | Zyda (stored) | «Plans from 27,000 EGP a year.» | **3** |
| ID | — (majoo already "also counted" per compare-research-2 report; coordinator to confirm) | — | 2 (3?) |
| SG HK MY TH TW MA | nothing new (Qashier per-day; Eats365 unpriced; iCHEF add-on unpriced; Wongnai POS borderline) | — | 2 |
| IN, MV | handed to agent 3 (not started) | — | — |

## Pass 2 (food-truck only): SG HK MY TH TW — nothing found; ID already 3 (majoo). DineOpen IN: priced (₹899 / ₹1,799 a month) but no pickup wording → not relevant (raw/IN.json). TW leads for a restaurant pass: 快一點 QuickClick, 點點食.

## Round 3 (restaurant tools) and leads

- **SG 3:** + Dinlr (Waiter + Online Order, S$198/month billed monthly; S$178 billed annually; scheduled pick-up date & time).
- **MY 3:** + Dinlr (RM400/month billed monthly; RM300 billed annually).
- **TW:** 快一點 QuickClick eligible ('外帶 – 顧客提前預約免等待'), '$1,688/月' in bare '$' — 3rd only if accepted as TWD. 點點食: no own site.
- **Feasty ZA:** names no country, no currency → not counted (raw/ZA-feasty.json).
- HK, TH: nothing new (Atlas, Tablevibe 401, Ser.vi, Eats365 TH unpriced, catalogue-only HK vendors).
