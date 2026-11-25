# compare-research-7 · agent 3 (25 Nov 2026)

## Block 1: stored multi-country vendors (raw/V-*.json)

| Vendor | Checked | Result |
|---|---|---|
| Pedix | price list | UYU only for UY (counts already); BO, DO, GT USD only; JM, CO not listed; SV USD (counts already) |
| Fudo | fu.do/es-uy/precios | UY "Precios en dólares." (no UYU); selector has no BO/DO/GT/SV/JM site; CO already counts |
| OlaClick | search | no page naming El Salvador |
| Menufy | menufy.com/SV | 302 to home page: no SV page |
| Actib | actib.app/en | "Actib operates in Panama today." |
| Kioskito | kioskito.app | areaServed Panamá only |
| Ojapo | /gastronomia | ARS only, "Hecho en Argentina" |
| Mezzita / Gestióndo / Sabbor / Ezy Cart | home pages | single-country (BO / DO / GT / JM) |

FLAG: Sabbor (GT) lives only on a pages.dev default host and shows no real customers (sample orders, demo / waitlist) — under V16.38 it may not count, and GT would drop to 0.

## Block 2: deeper searches

- BO: nothing new (5 searches, no new vendor site). count now: 1
- DO: nothing new (4 searches). count now: 1
- SV: nothing new (4 searches). count now: 1
- GT: nothing new (4 searches). count now: 1 (see the Sabbor flag)
- JM: nothing new (4 searches). count now: 1
- UY: nothing new (3 searches). count now: 1
- CO: iwebnu and Propio by Rappi unreadable (dead domains); nothing new. count now: 1

## Block 3: script-loaded prices (raw/B3-*.json)

- Ocuioso (AO): /precos's own script calls https://www.ocuioso.com/api/plans (axios baseURL "/api" + get("/plans")); read once -> HTTP 500 {"message":"Server Error"} -> unpriced.
- YUMBI: no pricing page and no plan endpoint in its static Astro site (/pricing 404) -> unpriced.

## Block 4: US territories (raw/B4-*.json)

- Menufy counts in GU (menufy.com/GU "Guam, Order Food Online!", Tamuning) and VI (menufy.com/VI "Virgin Islands, Order Food Online!", St Croix / St John), USD 179/month month-to-month ($149 on a 12-month agreement). MP and AS: 302 to home.
- Square: hardware terms exclude all five territories. Toast, Clover, ChowNow: no own-site presence -> not counted.

## Block 6: a third tool

- CA: OrderEatRepeat (stored, CAD 89/location/month, re-read) -> 3
- BR: SisFood (stored food_truck, now readable; "A partir de R$ 149,90/mês", BORDERLINE price) -> 3
- PA: Pedix (USD list names Panamá) -> 3
- AR: Pedix (ARS 19.000 / 25.500 / 35.000) -> 3
- CL, EC, PR, NG, ZA: nothing new -> 2
