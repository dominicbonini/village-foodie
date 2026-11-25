# compare-research-2 — agent 5 summary (rest of Europe, Caucasus, Central Asia), 25 Nov 2026

Raw files: `raw/<CC>.json`; my owned vendor in other agents' countries: `raw/OWNED.json`. "Price" shows up to two plans; only a price in the country's own currency counts. SumUp's web shop is the generic fallback, never a real food tool.

Cross-cutting: NEW multi-country tool **Vitrina** (vitrina.cafe; white-label ordering site/app + POS by Complete Solution s.r.o., Trnava, Slovakia; hryvnia default) has its own local-currency price pages for RS, BA, MK, AL, MD (and IS, SE, NO in other regions) plus € pages — it supplies the only local-currency price in RS, AL, BA, MK, MD. Its prices are restaurant/café plans (pickup and orders for a set time), not food-truck tools. **FoxiFood** lists SK, RS, UA, AL, BA, MK on its country-terms page with local-language sites, but prices only in EUR (counts only in SK). **Poster** has UAH (UA) and KZT (KZ) pricing; Georgia and Uzbekistan only in USD. **Delever** (Tashkent) is a new Central-Asian multi-country ordering platform priced in сум. Choice (choiceqr.com) answered 403.

## SK — Slovakia (EUR)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| FoxiFood | food_truck | eligible | FoxiFood (no monthly fee, per order): 0 EUR/month + 0.45 per order | https://www.foxifood.com/sk/ |
| DISH Professional Order (METRO) | food_truck | eligible | DISH Professional Order: 59 EUR/month | https://www.dish.co/SK/sk/ |
| SumUp | pos | eligible | Online obchod / Online platby: 0 EUR/month + 2.5% | https://www.sumup.com/sk-sk/ |
| Storekit | nearest_local | eligible | Starter: 0 GBP/month; Connect: 49 GBP/month | https://storekit.com |
| Vitrina | nearest_local | eligible | Express: 0 EUR/month + 3%; Štart: 39 EUR/month | https://vitrina.cafe/sk |

count: 4 eligible priced in the country's currency (food-truck: 2) — of which 1 is the SumUp generic fallback

Notes: Two food-truck tools with EUR prices: FoxiFood (stored d03a6e1f; Slovak /sk/ site, food-truck page, pre-orders for a date and time; Mesačný poplatok 0 € + 0,45 € per order; Slovakia on its country-terms list) and DISH Professional Order (METRO, stored b94c7a14; Slovak site, 59,00 € / mesiac bez DPH + 299 € set-up, 1,89 % on online payments; its Slovak food-truck page offers 'objednávky na odber' — pickup only, no chosen-time wording, as agent 1 found for HR). Plus a restaurant tool: Vitrina (white-label ordering site + POS developed by Complete Solution s.r.o., Trnava; Slovak site: Express 0 €/mes. + 3 %, Štart 39 €/mes., excl. DPH; 'Rozvoz, vyzdvihnutie a objednávky na konkrétny čas'). SumUp sk-sk online obchod (vyzdvihnutie vo vašom obchode, 0 € + 2,50 %) recorded as the generic fallback. Storekit's supported-regions doc lists Slovakia (Slovak, EUR payments) but prices are GBP only. Not opened: UpMenu (pricing in USD/CAD/EUR/CHF/GBP, English only, no Slovakia shown), Restaumatic (no prices, English only), Restimo (Polish; EUR in a help article, Slovakia not shown), Subger (a consumer directory page), Shopify. Search: 2 queries. Since 2 food-truck tools are priced, no further restaurant search was done.

## RS — Serbia (RSD)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| FoxiFood | food_truck | eligible | FoxiFood (no monthly fee, per order): 0 EUR/month + 0.45 per order | https://www.foxifood.com/sr/ |
| doXmenu | nearest_local | not_relevant | — | https://www.doxmenu.com/qr-menu/serbia/ |
| Vitrina | nearest_local | eligible | Express: 0 RSD/month + 3%; Start: 4590 RSD/month | https://vitrina.cafe |

count: 1 eligible priced in the country's currency (food-truck: 0)

Notes: One eligible tool with an RSD price: Vitrina (white-label ordering site + POS developed by Complete Solution s.r.o., Slovakia; its own Serbia price page 'Currency of this price list: Serbian Dinar (RSD).': Express RSD 0/mo + 3% of online payments, Start RSD 4,590/mo monthly-billed, Restaurant RSD 9,290/mo, excl. VAT; pickup and orders for a set time) — a restaurant tool. FoxiFood (Serbian /sr/ site, food-truck page, pre-orders for a date and time; Serbia on its country-terms list) is eligible but priced only in EUR (0 € a month + 0,45 € per order), so it does not count. Four searches (Serbian Latin, Cyrillic, English) returned Glovo/Wolt/Mr D/Alideda (marketplaces, never), Jotform forms, doXmenu (QR menu only, EUR — recorded not_relevant), Gostio (booking only, a TechCrunch article, not opened), a StarTech beta project 'Order' (no own site/price, not opened) and foreign tools without Serbian presence. Global pages checked today (mine): UpMenu pricing (USD/CAD/EUR/CHF/GBP, English only, no Serbia), Restaumatic price list (no prices, English only, no Serbia). SumUp's country selector and Storekit's regions doc have no Serbia. Not fetched: MENU TIGER (agent 6), Restimo (Polish; Serbia not shown). Stop rule applied.

## UA — Ukraine (UAH)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Poster | food_truck | eligible | Business (includes Сайт для замовлень): 1530 UAH/month; Starter + Poster Site add-on: 540 UAH/month | https://joinposter.com/ua |
| Choice | nearest_local | unreadable | — | https://choiceqr.com/ua |
| FoxiFood | food_truck | eligible | FoxiFood (no monthly fee, per order): 0 EUR/month + 0.45 per order | https://www.foxifood.com/uk/ |
| Delivety | nearest_local | eligible | Up to 1,000 orders: 9 USD/month; Up to 5,000 orders: 49 USD/month | https://delivety.com/uk |
| Vitrina | nearest_local | eligible | Express: 0 UAH/month + 3%; Start: 1600 UAH/month | https://vitrina.cafe |

count: 2 eligible priced in the country's currency (food-truck: 1)

Notes: Two eligible tools with UAH prices: Poster (stored 0802a7c8; Ukrainian pricing page joinposter.com/ua/pricing: Starter 540 ₴/міс., Business 1 530 ₴/міс. incl. 'Сайт для замовлень', Poster Site add-on 760 ₴/міс.; prices shown beside crossed-out 600/1 700 under an 'Оплата за рік' toggle, so likely billed yearly; Ukrainian food-truck page — counted food_truck, weak on ordering ahead: only 'Доставлення і самовивіз') and Vitrina (white-label ordering site + POS developed by Complete Solution s.r.o., Slovakia, with hryvnia as its main page's default and Ukrainian fiscal PRRO support: Express ₴0/mo + 3%, Start ₴1,600/mo monthly-billed, excl. VAT; pickup and orders for a set time). Eligible but not counted: FoxiFood (Ukrainian /uk/ site, EUR only) and Delivety (Ukrainian-language takeaway page with time slots, USD only: //). Choice (stored 70b34967): choiceqr.com/ua and /ua/pricing both 403 — unreadable. Search leads not opened: Expirenza (QR pay/menu app; App Store pages only), Paloma365 (Kazakhstan POS, see KZ; a /promoukraine page), Eatery Club (individual pricing), GetOrder (PWA, no price seen), 4mobile.me / Smartomato (Russian), webscraft (web studio, one-off build prices). Glovo, Bolt Food (marketplaces) never. SumUp and Storekit have no Ukraine presence.

## GE — Georgia (GEL)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Kovzy | nearest_local | not_relevant | — | https://kovzy.com |
| Poster | food_truck | eligible | Mini (Georgia page): 29 USD/month | https://joinposter.com |
| XPOS | nearest_local | not_relevant | — | https://xpos.ge |

count: 0 eligible priced in the country's currency (food-truck: 0)
nothing eligible exists: Georgian, Russian and English searches (5); Kovzy and XPOS (₾ prices, delivery/QR only, no pickup ordering); Poster USD only

Notes: Nothing eligible with a GEL price. Georgian tools found: Kovzy (kovzy.com, Tbilisi + Yerevan offices; Website ₾99 monthly with 'online orders without commission', courier integration) and XPOS (xpos.ge; same ₾59 POS / +₾99 e-commerce module price pattern, probably the same company) — both show delivery/aggregator/QR/takeout-at-the-counter only, no customer pickup ordering, pre-order or order-for-a-time wording, so recorded not_relevant (borderline: Kovzy's ₾99 website would count if click-and-collect were confirmed). Poster (mine) has a Georgia page naming an official representative, a Poster Site add-on for 'Delivery, takeout' and a food-truck type, but USD prices only — eligible, not counted. Five searches (Georgian, Russian, English) otherwise returned Wolt/Glovo/Bolt (marketplaces, never), OFOODO (a marketplace/directory, not opened), Jotform, Wix and MENU TIGER /ka (owned by agent 6; not fetched). FoxiFood, SumUp, Storekit and Vitrina do not list Georgia. Stop rule applied.

## KZ — Kazakhstan (KZT)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Poster | food_truck | eligible | Starter + Poster Site add-on: 8640 KZT/month; Mini (food-truck page price): 15660 KZT/month | https://joinposter.kz |
| Paloma365 | nearest_local | not_relevant | — | https://paloma365.com |
| Delever | nearest_local | eligible | Start (up to 1 000 orders): 1300000 UZS/month; Medium (up to 3 000 orders): 3600000 UZS/month | https://delever.uz |

count: 1 eligible priced in the country's currency (food-truck: 1)

Notes: One eligible tool with a KZT price: Poster (stored 0802a7c8, own Kazakhstan site joinposter.kz with a 'Автоматизация фудтрака в Казахстане' page; Starter 8 640 ₸ / Mini 15 660 ₸ a month, likely billed yearly, + the Poster Site ordering-website add-on 11 400 ₸/мес). Weak on ordering ahead: only 'Доставка и самовывоз' via Poster Site, no chosen-time wording. Delever (Tashkent ordering platform; legal entity registered in Kazakhstan per its home page; pickup pre-orders per its own content file) is eligible but its plans are priced only in сум (a 25 000 ₸ aggregator add-on is the only tenge price; delever.kz does not resolve) — not counted. Paloma365 (Kazakhstan-based POS, USD prices; website orders only for delivery) recorded not_relevant. Kaspi Рестораны is table QR payment only (Kaspi's own guide, not opened). Search leads not opened: Delivery PRO (an OLX ad only), iiko integrators (OLX ads), Glovo/Wolt/Yandex Eda (marketplaces). Clopos (Baku POS with a Kazakhstan office per search) is QR-menu only, USD — see AZ. MENU TIGER /ru (agent 6) appeared with USD — not fetched. FoxiFood, SumUp, Storekit, Vitrina do not list Kazakhstan. Stop rule applied (4 searches).

## AL — Albania (ALL)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Storekit | nearest_local | eligible | Starter: 0 GBP/month; Connect: 49 GBP/month | https://storekit.com |
| Vitrina | nearest_local | eligible | Express: 0 ALL/month + 3%; Start: 3590 ALL/month | https://vitrina.cafe |
| FoxiFood | food_truck | eligible | FoxiFood (no monthly fee, per order): 0 EUR/month + 0.45 per order | https://www.foxifood.com/sq/ |
| easyBar | nearest_local | not_relevant | — | https://easybar.al/en |

count: 1 eligible priced in the country's currency (food-truck: 0)

Notes: One eligible tool with an ALL price: Vitrina (white-label, developed by Complete Solution s.r.o. in Slovakia; Ukrainian-style hryvnia default; ordering site + POS; its own Albania price page in lek: Express ALL 0/mo + 3% of online payments, Start ALL 3,590/mo monthly-billed, Restaurant ALL 7,190/mo, excl. VAT; pickup and orders for a set time). It is a restaurant tool, not a food-truck tool. FoxiFood (Albanian /sq/ site, food-truck page, pre-orders; Albania on its country-terms list) is eligible but priced only in EUR. Storekit's supported-regions doc lists Albania (English, ALL payments) but its prices are GBP only. No Albanian-made ordering tool found: easyBar (easybar.al) is table QR ordering only, no prices; doXmenu has an Albania QR-menu page (menu only, EUR; not re-opened, see RS); ToGo is a consumer delivery app (App Store only); Wolt (marketplace, never). MENU TIGER (agent 6) appeared with USD — not fetched. SumUp has no Albania site. Stop rule applied (2 searches + vendor pages).

## BA — Bosnia and Herzegovina (BAM)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 BAM/month + 3%; Start: 75.9 BAM/month | https://vitrina.cafe |
| FoxiFood | food_truck | eligible | FoxiFood (no monthly fee, per order): 0 EUR/month + 0.45 per order | https://www.foxifood.com/bs/ |

count: 1 eligible priced in the country's currency (food-truck: 0)

Notes: One eligible tool with a BAM price: Vitrina (white-label, developed by Complete Solution s.r.o. in Slovakia; Ukrainian-style hryvnia default; ordering site + POS with its own Bosnia & Herzegovina price page in KM: Express KM 0/mo + 3% of online payments, Start KM 75.90/mo monthly-billed, Restaurant KM 154.90/mo, excl. VAT; pickup and orders for a set time) — a restaurant tool, not a food-truck tool. FoxiFood (Bosnian /bs/ site, food-truck page, pre-orders for a date and time; Bosnia and Herzegovina on its country-terms list) is eligible but priced only in EUR. No Bosnian-made ordering tool found: the Bosnian search returned Glovo restaurant pages (marketplace, never) and a USD software directory (never a source). SumUp, Storekit and DISH have no Bosnia presence (selector / regions doc; DISH not checked for BA). Stop rule applied (1 search; the Serbian/Croatian-language searches for RS also covered the region).

## MK — North Macedonia (MKD)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 MKD/month + 3%; Start: 2390 MKD/month | https://vitrina.cafe |
| FoxiFood | food_truck | eligible | FoxiFood (no monthly fee, per order): 0 EUR/month + 0.45 per order | https://www.foxifood.com/mk/ |

count: 1 eligible priced in the country's currency (food-truck: 0)

Notes: One eligible tool with an MKD price: Vitrina (white-label, developed by Complete Solution s.r.o. in Slovakia; Ukrainian-style hryvnia default; ordering site + POS with its own North Macedonia price page in MKD: Express MKD 0/mo + 3% of online payments, Start MKD 2,390/mo monthly-billed, Restaurant MKD 4,890/mo, excl. VAT; pickup and orders for a set time) — a restaurant tool, not a food-truck tool. FoxiFood (Macedonian /mk/ site, food-truck page 'Онлајн нарачување за фуд-камиони', pre-orders for a date and time; North Macedonia on its country-terms list) is eligible but priced only in EUR. No Macedonian-made ordering tool with an own-site price found: Naracaj.com (consumer food-ordering marketplace app, App Store only), SelfOrder (App Store only, self-ordering in venues, no site/price seen), Cube Systems (a 2007 PDF, no prices) — none opened beyond the search. MENU TIGER (agent 6) appeared with USD — not fetched. SumUp, Storekit have no North Macedonia presence. Stop rule applied.

## ME — Montenegro (EUR)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | not_relevant | — | https://vitrina.cafe |

count: 0 eligible priced in the country's currency (food-truck: 0)
nothing eligible exists: Montenegrin and English searches (2); only Glovo, booking sites and a QR-menu tool; no multi-country tool lists Montenegro (Vitrina /en/prices/me 404)

Notes: Nothing eligible exists that I could find. Two searches (Montenegrin/Serbian Latin and English) returned only Glovo restaurant pages (marketplace, never), TableAgent and OpenTable (booking only), a doXmenu Montenegro QR-menu page (menu only; its Serbia page read today shows no ordering — recorded not_relevant in RS) and Capterra/SaaS-directory listings (never a source). Multi-country tools checked today that do NOT list Montenegro: FoxiFood country terms, Storekit supported regions, SumUp country selector, Vitrina (no /en/prices/me — 404), Poster (selector has no Montenegro). UpMenu and Restaumatic show no Montenegro presence. METRO/DISH has no Montenegro market (not fetched). Stop rule applied.

## MD — Moldova (MDL)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 MDL/month + 3%; Start: 789 MDL/month | https://vitrina.cafe |

count: 1 eligible priced in the country's currency (food-truck: 0)

Notes: One eligible tool with an MDL price: Vitrina (white-label ordering site + POS, developed by Complete Solution s.r.o. in Slovakia; its own Moldova price page in MDL: Express MDL 0/mo + 3% of online payments, Start MDL 789/mo monthly-billed, Restaurant MDL 1,589/mo, excl. VAT; pickup and orders for a set time) — a restaurant tool, not a food-truck tool. No Moldovan-made ordering tool found: the Romanian search returned Glovo stores (marketplace, never), MENU TIGER /ro (agent 6, USD — not fetched) and an investment-agency PDF catalogue with no restaurant ordering prices. Poster: no Moldova page (https://joinposter.com/en/pages/md-main 404; no Moldova in its selector). Paloma365's country selector names Moldova but it shows no pickup ordering (see KZ). FoxiFood, Storekit, SumUp do not list Moldova. Stop rule applied.

## AM — Armenia (AMD)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Kovzy | nearest_local | not_relevant | — | https://kovzy.com |

count: 0 eligible priced in the country's currency (food-truck: 0)
nothing eligible exists: Armenian, Russian and English searches (3); only marketplaces and foreign tools; Kovzy (Yerevan office) delivery-only in ₾; Poster am page 404

Notes: Nothing eligible exists that I could find. Three searches (Armenian, Russian, English) returned Glovo, Yandex Eats and Menu.am (marketplaces, never), Zegashop blog posts (an Indian generic website builder, USD; not opened), MENU TIGER /ru (agent 6, USD — not fetched), Choice /us pricing in USD (mine; choiceqr.com answers 403 to me, see UA) and UpMenu/Restimo pages without Armenian presence. Kovzy (Tbilisi + Yerevan offices) recorded not_relevant: ₾ prices only and delivery-only online orders. Poster: no Armenia page (https://joinposter.com/en/pages/am-main 404; selector has no Armenia; only a third-party directory names Armenia — never a source). Paloma365 names Armenia in its country selector but shows no pickup ordering (see KZ). FoxiFood, Storekit, SumUp, Vitrina do not list Armenia. Stop rule applied.

## AZ — Azerbaijan (AZN)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Clopos | nearest_local | not_relevant | — | https://www.clopos.com |
| Delever | nearest_local | eligible | Start (up to 1 000 orders): 1300000 UZS/month; Medium (up to 3 000 orders): 3600000 UZS/month | https://delever.uz |

count: 0 eligible priced in the country's currency (food-truck: 0)
nothing eligible exists: Azerbaijani, Russian and English searches (2); Clopos (Baku) QR-menu only in USD; Delever eligible but priced in UZS only

Notes: Nothing eligible with an AZN price. Delever (Tashkent-based ordering platform; its home page says a legal entity is registered in Azerbaijan) is eligible but priced only in UZS — see UZ for the evidence; not counted. The one Azerbaijani restaurant-software vendor found, Clopos (Baku; offices also in Turkey, Uzbekistan, Kazakhstan per search), prices in USD (Start 59 $ / Aylıq, Standard 99 $) and shows only QR-menu contactless ordering — no takeaway, delivery, pre-order or pickup wording on its English or Azerbaijani pricing pages; recorded not_relevant. Searches otherwise returned Wolt restaurant pages (marketplace, never), 189 Delivery (consumer app), Bir association's QR table ordering (news), Elektraweb (Turkish POS, no Azerbaijan presence shown; not opened) and Odoo partners. Poster: no Azerbaijan page found (search of joinposter.com; selector has no Azerbaijan). Paloma365's selector names Azerbaijan but shows no pickup ordering (see KZ). FoxiFood, Storekit, SumUp, Vitrina do not list Azerbaijan. Stop rule applied.

## UZ — Uzbekistan (UZS)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Delever | nearest_local | eligible | Start (up to 1 000 orders): 1300000 UZS/month; Medium (up to 3 000 orders): 3600000 UZS/month | https://delever.uz |
| Poster | food_truck | eligible | Mini (English pricing page): 29 USD/month | https://joinposter.com |

count: 1 eligible priced in the country's currency (food-truck: 0)

Notes: One eligible tool with a UZS price: Delever (Tashkent; branded site/app/Telegram-bot ordering for restaurants; Start from 1 300 000 сум/month for up to 1 000 orders). Its home and pricing pages are delivery-focused and don't mention pickup; the pickup pre-order evidence ('предзаказ с самовывозом', 'Предзаказ ко времени.') is from Delever's own site-content file delever.io/llms-full.txt (cafe/coffee-shop solutions) — a reviewer may prefer a regular page; a client storefront on yaponamama.delever.uz is script-rendered (unreadable). Not a food-truck tool. Poster (mine) shows Uzbekistan only via its Multikassa fiscal page, USD prices — recorded, not counted. Clopos (Baku; office in Uzbekistan per search) is QR-menu only, USD — see AZ. Paloma365 (selector names Uzbekistan) shows no pickup — see KZ. Searches otherwise returned Uzum Tezkor/Express24 (marketplaces, never), OLX freelancer ads for Telegram bots (never a source), Oshme (table booking). FoxiFood, SumUp, Storekit, Vitrina do not list Uzbekistan. Stop rule applied.

## KG — Kyrgyzstan (KGS)

count: 0 eligible priced in the country's currency (food-truck: 0)
nothing eligible exists: Russian and English searches (2); only consumer delivery apps and Glovo; Delever/Paloma365 name Kyrgyzstan but show no KGS price or pickup

Notes: Nothing eligible exists that I could find. Two searches (Russian, English) returned Kenguroo and Ем.kg (consumer delivery marketplaces, App Store only), Glovo stores (marketplace, never), Pai (Bishkek pay-at-table and rewards startup — a Times of Central Asia article, not an ordering tool; not opened), a Zegashop blog post (Indian generic website builder) and Eats365 (owned by agent 6, USD, no Kyrgyzstan shown — not fetched). Multi-country tools: Delever's home page (read for UZ) names Kyrgyzstan among its countries but shows prices only in сум and no Kyrgyz page — not recorded here (no verbatim Kyrgyzstan sentence captured); Paloma365's selector names Kyrgyzstan but it shows no pickup ordering (see KZ); Poster's selector and pages show no Kyrgyzstan. FoxiFood, SumUp, Storekit, Vitrina do not list Kyrgyzstan. Stop rule applied.

## OWNED — Vitrina in other agents' countries

### IS — Iceland (ISK)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 ISK/month + 3%; Start: 5390 ISK/month | https://vitrina.cafe |

count (owned vendors only): 1 eligible priced in the country's currency (food-truck: 0)

### SE — Sweden (SEK)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 SEK/month + 3%; Start: 439 SEK/month | https://vitrina.cafe |

count (owned vendors only): 1 eligible priced in the country's currency (food-truck: 0)

### NO — Norway (NOK)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 NOK/month + 3%; Start: 419 NOK/month | https://vitrina.cafe |

count (owned vendors only): 1 eligible priced in the country's currency (food-truck: 0)

### HR — Croatia (EUR)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 EUR/month + 3%; Start: 39 EUR/month | https://vitrina.cafe/hr |

count (owned vendors only): 1 eligible priced in the country's currency (food-truck: 0)

### SI — Slovenia (EUR)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 EUR/month + 3%; Start: 39 EUR/month | https://vitrina.cafe/sl |

count (owned vendors only): 1 eligible priced in the country's currency (food-truck: 0)

### LT — Lithuania (EUR)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 EUR/month + 3%; Start: 39 EUR/month | https://vitrina.cafe/sk |

count (owned vendors only): 1 eligible priced in the country's currency (food-truck: 0)

### LV — Latvia (EUR)

| Vendor | Focus | Verdict | Price + currency | URL |
|---|---|---|---|---|
| Vitrina | nearest_local | eligible | Express: 0 EUR/month + 3%; Start: 39 EUR/month | https://vitrina.cafe/sk |

count (owned vendors only): 1 eligible priced in the country's currency (food-truck: 0)

Notes: Vitrina (vitrina.cafe; white-label ordering site/app + POS developed by Complete Solution s.r.o., Trnava, Slovakia; found by me in UA) is a European multi-country tool, so mine. It has its own local-currency price pages for Iceland (ISK: Start kr 5,390/mo), Sweden (SEK: kr 439/mo) and Norway (NOK: kr 419/mo) — Express kr 0/mo + 3 % of online payments everywhere; all excl. VAT; first figure of each block is the monthly-billed price, then 6-month (−10 %) and yearly (−20 %). Croatia and Slovenia: Croatian (/hr) and Slovenian (/sl) language sites with € prices (Start 39 €/mj.|mes.) but no sentence naming the country — presence by language only. Lithuania and Latvia: only named on its English main page ('in Romania, Lithuania and Latvia we don’t offer the POS.'), € prices taken from its Slovak page — weakest; a reviewer may drop them. Price pages also exist for DK, CH, GB (and languages cs, pl, de, hu, ro) — not research countries in this wave, not opened. Not recorded but worth knowing: Delever (Tashkent; mine) says it has legal entities in Uzbekistan, Kazakhstan, UAE and Azerbaijan and names Cyprus and Georgia among its countries, but shows prices only in сум — not opened for AE/CY; Clopos (Baku; QR-menu POS, USD) has a Turkey office per search — not relevant (no takeaway ordering). Iceland is notable: agent 4 found nothing ISK-priced there, and Vitrina's ISK page would be the first.
