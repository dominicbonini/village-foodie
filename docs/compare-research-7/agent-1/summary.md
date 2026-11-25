# compare-research-7 agent-1 — summary (25 Nov 2026)

## Block 1 — stored vendors (raw/V-*.json)
| Vendor | Result for the one-short countries |
|---|---|
| Vitrina | No MT/UZ/KZ (or other) price list; /en/prices/mt 404. Counts in no new country. |
| Poster | Global pricing $ only, no country selector; md-main / uz-main 404. No new country (GE/AZ/AM/KG: USD only). |
| FoxiFood | EUR only; MT already counts. Nothing new. |
| DISH | Selector names none of them. Nothing new. |
| Restaumatic | No prices anywhere. Nothing new. |
| SumUp | CO row recorded (generic web-shop fallback, COP $0 + 4.3 %, page mixed Spanish/English). MT: shipping only. |
| Storekit | Re-read pricing: £ only. MT still not counted. |
| Choice | 403 (md). Unreadable. |
| Delever | delever.io/pricing сум only; no KZ/AZ price. |
| Order Tiger, NemTakeAway, Flipdish, UpMenu | No presence / currency in any one-short country. |

## Block 2 — countries (raw/<CC>.json)
| Country | Vendors looked at | Verdict | Count now |
|---|---|---|---|
| MT | Born Digital Studio (dead host), Sixteen (Storekit reseller) | none eligible | 1 |
| IS | Teya, dk Pos | none eligible | 1 |
| RS | Svilenković, Zegashop, Minimax ESIR | none eligible | 1 |
| AL | Vlore POS+ | none eligible | 1 |
| BA | Korpa, Dostavica, Gustico | none eligible | 1 |
| MK | Thinker POS (stored e01cb953, re-read): Standard 6.295 MKD/month incl. VAT with a free-choice 'Takeaway & delivery license' | eligible, weak (plan doubt) | 1, or 2 if Thinker is accepted |
| MD | ECOM.md, Straus | none eligible | 1 |
| UZ | Oshme, OLX freelancers | none eligible | 1 |
| KZ | FoodSoul (unreadable, script-rendered), Starter | none eligible | 1 |

## Block 3: ICRTouch TouchTakeaway (IM), raw/B3-ICRTouch.json
Unpriced. icrtouch.com has no pricing page (its 80-page sitemap lists none), and the TouchTakeaway page source has no £ amount. The only same-domain endpoints are WordPress plumbing (wp-json pages/48943, complianz, elementskit, admin-ajax); none of them is a price source.

## Block 5: territories, raw/B5-territories.json (86 rows, evidence only)
Every vendor says "nothing" about every territory: no territory is named and none is excluded. Most give only the governing law (England and Wales, Finnish, Italian, French) or "UK". The one exception is Boom srl (Software Food Good), which says only "in tutta Italia" (mainland_only). MenuForma's and TopEstrellas' terms load by script and could not be read. Storekit, FoxiFood and NemTakeAway rows come from compare-research-6 (read 25 Nov).

## Block 6: third tool per country
| CC | Third (and extras) | Price | Source |
|---|---|---|---|
| IE | FoxiFood (food truck); Flipdish | 0 € + 0,45 €/order; Flipdish €69/month billed monthly | country terms today; Flipdish page today |
| BE | FoxiFood; Fritzy (close to a marketplace) | 0 € + 0,90 € HTVA/order | today |
| BG | QR-MENU.BG | ORDERS 15 €/month | compare-research-2 (today) |
| HR, CY, FI, GR, PT, SI, ES | FoxiFood | 0 € + 0,45 €/order | country-terms page today names each country |
| CZ | Vitrina | Start od 950 Kč/month | vitrina.cafe/cs today |
| DK | Vitrina | Start kr 289/month | /en/prices/dk today |
| EE | none | | stays 2 (Restimo: no pickup) |
| GI | Grafterr (serves GI from GB) | £55 / m | today |
| LV | Vitrina (weak presence) | Start 39 €/month | compare-research-2 (today) |
| LI | Sparissimo Food | CHF 49 + 8 % | compare-research-2 (today) |
| LT | FoxiFood; Refektorius | 0 € + 0,45 €/order; 7 € | today / compare-research-2 |
| LU | L'Addition (food truck) | from 49 € | compare-research-2 (today) |
| NO | NemTakeAway | 555 NOK | compare-research-2 (today) |
| PL | GoPOS / GoOrder (needs a GoPOS licence?) | 49 zł/msc net | today |
| RO | Vitrina | de la 209 lei/month; Start 39 € | vitrina.cafe/ro today |
| SK | Vitrina | Štart 39 € | compare-research-2 (today) |
| SE | Yabie (food truck) | Fr. 899 kr/månad | compare-research-2 (today) |
| CH | Pikit | 89.00 CHF/mois incl. VAT | today |
| UA | none | | stays 2 |
