# competition-check-1 — search competition for a food-truck ordering comparison page, every switched-on country

**24 October 2026.** Written for Dominic. Research only: no code or data changed, nothing was deployed. The files written
are this report and three CSVs in `docs/competition-check-1/`:
- `serps.csv`: 2,076 rows, of which 1,528 are results and 548 are failed attempts, kept and labelled;
- `suggestions.csv`: 7,750 rows;
- `scores.csv`: 43 country × language pairs.

The read-only SQL is in §7.

> ⚠️ **Read this first. The run did not get what it was designed to get.**
> - **Google answered nothing, for any country** (a JavaScript-only page; Startpage's fallback showed a bot challenge).
> - **Brave answered almost nothing** (HTTP 429 + captcha). Its only results are 20 rows: one German and one Austrian
>   keyword.
> - **Bing's index answered for 30 of 43 pairs.** It answered directly (182 rows) or through its Bing-powered fallbacks:
>   DuckDuckGo (620 rows) and Yahoo (706 rows; Yahoo is not in your brief, and every row is labelled `yahoo(bing)`).
> - **13 pairs got no results at all:** NL, BE-nl, BE-fr, ES, PT, CH-de/fr/it, LI, LU-fr/de, GR, CY-el. They are not
>   scored.
>
> So this is **a Bing-index picture** (what ChatGPT search and Copilot draw on). It is **not** a Google picture (Gemini,
> AI Overviews) or a Brave one (reportedly Claude). **Engine agreement could not be measured anywhere.** Nothing was
> filled from another engine, and no block was worked around. Two agents tried a different user-agent once; the tool's
> safety check refused it, and that was correct.
>
> **The fetches came from this Mac's own internet connection, not a cloud IP.** Six agents searched in parallel, which is
> what tripped the blocks. **Google or Brave may show you captchas on this connection for a while.**

---

## 1 · One-page summary

### 1.1 Top 10 by opportunity (Bing index; every score low or very-low confidence)

Opportunity = demand × (6 − competition), halved where the site has no page in that language (§2.3).

| # | Country · language | Competition (1–5, low = good) | Demand (1–5) | Opportunity | Confidence | One line |
|---|---|---|---|---|---|---|
| 1 | **Poland · pl** | 1.8 | 4.5 | **18.9** | low | One local food-truck comparison (a GoPOS guide); the comparison pages are English; ~700 new trucks in H1 2026. |
| 2 | **Germany · de** | 2.0 | 4.5 | **18.0** | very low (2 keywords) | Small German food-truck vendors (OrderFront, gastro25, GastroSystem, Jamezz) sell order-ahead with a pickup time; one POS comparison; 1,400+ trucks listed. |
| 3 | **Denmark · da** | 1.3 | 3.5 | **16.4** | low | Almost no Danish food-truck content. **Truckly.dk** (time slots) is #1 for ordering terms. |
| 4 | **France · fr** | 2.1 | 4.0 | **15.6** | very low (1 keyword) | Page 1 is six food-truck **pre-order vendors** (Autoflowly, My Food Truck, Hopchef, Nomad, Beau Camion…), but nothing compares them. Low comparison competition, high tool competition. |
| 5 | **Sweden · sv** | 1.6 | 3.5 | **15.4** | low | Jamezz ranks on most ordering terms; "kassasystem" terms are local POS; no Swedish pre-order comparison. |
| 6 | **Romania · ro** | 1.7 | 3.5 | **15.0** | low | No Romanian food-truck comparison; ~500 trucks, festival-led. |
| 7 | **Italy · it** | 3.1 | 4.5 | **13.0** | very low (2 keywords) | Three machine-translated "migliori POS per food truck" pages from Chinese hardware makers, plus small vendors; 4,286 street-food businesses. |
| 8 | United States · en | 3.6 | 5 | 12.0 | low | Many English food-truck comparisons (13 URLs); the largest demand by far. |
| 9 | United Kingdom · en | 3.8 | 5 | 11.0 | low | The most crowded measured market: 17 food-truck comparison URLs; **Order Tiger** (a UK food-truck pre-order tool) is #2 for ordering terms. |
| 10 | Australia · en | 3.6 | 4.5 | 10.8 | very low | **These are US-hosted Bing results, not Australian** (Yahoo AU has closed): no .au page appeared. |

Next: CZ 10.0 · EE 9.8 · NO 9.8 · HU 8.8 · CA-en 8.0 · LT 7.8 · AT 6.8 · FI-fi 6.6 · LV 6.6 · NZ 6.0 (US-hosted). All 43
rows are in `scores.csv`.

### 1.2 Your hypothesis: do non-English languages have less competition? **Yes, clearly, on the Bing index.**

| | English pairs (9) | Non-English pairs (21 scored) |
|---|---|---|
| Average competition (1–5) | **3.74** (median 3.8) | **1.87** (median 1.6) |
| Average distinct food-truck comparison pages in the page's own language | **14.3** | **1.8** |
| Share of results that are **English-language pages** | — | **24%** (another 6.5% are in a third language, e.g. Czech pages in Slovakia, France pages in Québec) |

- Every English market shares one pool of global English pages: buildmymap, UpMenu, Restolabs, worldmetrics, Guideflow,
  Forbes and Software Advice.
- Non-English markets mostly have local POS pages and a few vendors, with English pages filling the comparison slots.
- **No local-language page in any country compares food-truck pre-ordering tools.** The 13 pages anywhere that do are
  English or French: buildmymap, menutro, foodtruckr, thefoodygram, Restolabs, worldmetrics, Guideflow, foodtracks.io,
  Truckons, chatfood.fr, ishopo.ca.

### 1.3 Where Google, Bing and Brave disagree

**Not measurable this run.** Google never answered, and Brave answered only two keywords (DE intent 3, AT intent 1),
which Bing didn't answer, so nothing overlaps. What Gemini and AI Overviews see is still unknown. The STEP 6 spot-check
(§5) is the cheapest way to find out.

### 1.4 Biggest differences from seo-geo-1 §1.2 (read only at this step)

| Country | seo-geo-1 | This run | Why |
|---|---|---|---|
| **Australia** | #1 (score 5) | #10 | This run's AU results were **US-hosted** (no .au pages), so they show the global English pool, where competition is high. seo-geo-1 called AU low on the strength of Square AU and directories, also from a non-Australian tool. **Neither run saw Australian results.** |
| **Canada (en)** | #2 (4) | #15 | The same English pool (18 comparison URLs, none Canadian). seo-geo-1 saw Moneris plus directories. |
| **Ireland, New Zealand** | 3 | low (5.5 / 6.0) | Smaller demand bands here, plus the shared English competition. |
| **United States** | 2 | #8 | My formula weights demand, and the US has band 5 demand. The competition is just as heavy in both runs (3.6). |
| **France** | 2 ("high") | #4 | seo-geo-1 counted two French POS *comparatifs*; this run's one Bing keyword showed pre-order vendors and no comparison of them. **Both are true.** France has many direct pre-order tools (Eatch, Truckons, Autoflowly…), so a page would rank more easily than it would win customers. Very low confidence. |
| **Denmark, Sweden, Romania** | 3 | #3, #5, #6 | Bing via DuckDuckGo shows almost no local food-truck content. seo-geo-1 rated them lower on payment blockers (MobilePay, Swish), which this run doesn't score. |
| **Netherlands, Belgium, Spain, Switzerland, Luxembourg** | 2–3 | not scored | No engine returned results here. **This run can neither confirm nor overturn "NL is crowded".** |
| **Poland, Germany, Italy** | 4–5 | #1, #2, #7 | Broadly agree. Italy is lower here because of machine-translated "best POS" pages (two keywords only). |

---

## 2 · Method and limits

### 2.1 Countries and languages (STEP 1)

36 countries are switched on (read-only SQL, §7). Each country's site page is in one language. The 43 pairs searched:

| Country | Search languages | Site has it? |
|---|---|---|
| GB, IE, US, AU, NZ, MT, GI | English | yes |
| CA | English, French (Québec) | en yes · **fr no** |
| DE, AT, LI | German | yes |
| CH | German, French, Italian | de yes · **fr, it no** (the CH page is de-CH) |
| LU | French, German | fr yes · **de no** (the LU page is fr-LU) |
| BE | Dutch, French | nl yes · **fr no** (nl-BE only) |
| FI | Finnish, Swedish | fi yes · **sv no** |
| CY | Greek, English | el yes · **en no** (the CY page is el-CY) |
| FR, NL, ES, PT, IT, GR, SE, DK, NO, EE, LV, LT, PL, CZ, SK, HU, RO, SI, HR, BG | the national language | yes |

### 2.2 Which engines feed which AI (STEP 2)

| AI | Engine | Status |
|---|---|---|
| **Gemini; Google AI Overviews and AI Mode** | Google Search | **Confirmed.** Google's own docs: AI features "surface relevant links" from Search, and "the best practices for SEO remain relevant… no additional requirements" (developers.google.com/search/docs/appearance/ai-features). Gemini's API grounds on Google Search ("Grounding with Google Search", Google Cloud / Firebase docs). |
| **ChatGPT search** | Bing plus others, and OpenAI's own crawler | **Partly confirmed.** OpenAI's docs confirm its own crawler: OAI-SearchBot "is used to surface websites in search results in ChatGPT's search features" (platform.openai.com/docs/bots). Its help page says it "leverages third-party search providers". **Bing as the provider is reported** (Microsoft/OpenAI 2023 announcements; Yoast and others), not stated by OpenAI in what I could fetch; the help page returned 403. |
| **Microsoft Copilot** | Bing | **Confirmed.** Microsoft: Copilot sends "generated search queries … to the Bing search service to ground responses in web data" (learn.microsoft.com, Microsoft 365 Copilot public web access). |
| **Claude** | Brave | **Reported, not officially confirmed.** Anthropic's subprocessor list added Brave Search in March 2025 (TechCrunch, 21 Mar 2025; Simon Willison found Claude's search tool takes BraveSearchParams). A 2026 consultancy note says a second web-search subprocessor is listed too; not verified. |
| **Perplexity** | Its own index (PerplexityBot) plus others | **Reported.** PerplexityBot is its own crawler (Perplexity's docs and FAQ). Some SEO sources say it also uses Bing; unconfirmed. |

### 2.3 Scoring (STEP 5): the formula, applied the same way to every pair

From the valid result rows of the pair, all engines and keywords pooled:
- **A** = distinct URLs that are in the pair's language, food-truck-specific, and compare tools (or are a comparison
  article).
- **H** = share of rows from high-strength domains (big publishers, directories, POS giants, marketplaces, Wikipedia).
- **F** = share of the food-truck-specific rows dated 2025–2026.

**Competition = 1 + 4 × (0.5·min(1, A/5) + 0.3·H + 0.2·F)**, rounded to one decimal. Pairs with fewer than 10 valid rows
are not scored.

- **Gap:** whether any result in the pair's language compares food-truck pre-ordering tools (food-truck-specific + compares
  tools + covers pre-ordering). The CSV also notes any English or foreign page that does.
- **Demand (1–5)** = the scene band (1: <50 trucks · 2: 50–200 · 3: 200–1,000 · 4: 1,000–5,000 · 5: >5,000), +0.5 if
  autocomplete returned ≥10 operator-intent suggestions, −0.5 if none. **Demand = signals, not search volume.**
  - Autocomplete gave mostly generic English completions ("food truck pos software"), and barely changed by country from
    this connection.
  - Native operator suggestions were rare: "kassasystem foodtruck" (SE), "foodtruck kasse/kassensystem" (DE/AT/CH/LU),
    "logiciel caisse food truck" (FR), "cassa food truck" (IT), "aplikacja / kasa fiskalna" (PL), "food truck rendelés"
    (HU). None anywhere paired food truck with pre-ordering in the local language.
- **Opportunity = demand × (6 − competition)**, × 0.5 where the site has no page in that language.
- **Engine agreement:** n/a everywhere (§1.3).
- **Confidence:**
  - low: one engine, ≥30 rows;
  - very low: fewer than 30 rows, or results served from another country's host (AU, NZ, MT, GI);
  - none: no rows.

### 2.4 Limits

- **One index (Bing).** Where only 1–2 keywords answered (DE, FR, IT, AT), the score rests on a single results page.
- **Localisation was imperfect:**
  - Yahoo AU has closed, so AU and NZ got US-hosted results; MT and GI got UK-hosted results.
  - DuckDuckGo could not localise sv-FI.
  - Several direct Bing pages were "poisoned": they answered only the query's first word. These were flagged and left
    out.
- **No AI Overview, People-also-ask or featured snippet was ever visible** (Google never answered).
  - Brave's German "Nutzer fragen auch" were all about tills (offline mode, TSE-certified cash registers), with answers
    mostly from kassensystemevergleich.de.
  - On Bing, UpMenu answered "people also ask" for CZ and SK.
- Page classification was mostly from title, URL and snippet. Every likely comparison or food-truck tool was opened where
  it would load.
- Scene counts are often old: ES 2017, PT 2015–17, NL c.2020, BE 2017, IE 2015. Many countries have no national count.

---

## 3 · Per country (short)

**Scored**
- **PL:**
  - The only Polish food-truck software content is from vendors: GoPOS's guide, plus FoxiFood's and MenuForma's
    translated pages.
  - The comparison intent is filled by English "best food truck POS 2026" pages.
  - Closest topic: AppMaster's Polish how-to on pre-order apps with pickup windows.
  - Strongest demand signal in Europe.
- **DE:**
  - Bing showed only small German vendors with food-truck pages; four already sell order-ahead with a pickup time.
  - The comparison slot is POS-focused (kassensystemevergleich.de, "Kassensystem Foodtruck … Vergleich (2026)").
- **AT:** Brave, one keyword: Capterra AT, GetApp AT, kassensystemevergleich, and my-foodtrucks.com's 2025 list "Die
  besten mobilen Bestellsysteme…" (it would not load).
- **DK:** Truckly.dk is a Danish food-truck tool with time slots, #1 for ordering and pre-order. Catermonkey's guide names
  no tools.
- **SE:** Jamezz's Swedish food-truck page ranks #1–2 on 4 of 6 keywords; "kassasystem foodtruck" is 10/10 Swedish POS.
- **NO:** no Norwegian food-truck page at all; 58% of results are English.
- **FI:** "ruokarekka" returns generic restaurant SaaS; machine-translated hardware guides.
- **EE, LV, LT:** local POS pages, truck sellers and hire directories. FoxiFood has a Latvian food-truck page. The native
  words drift to government sites.
- **CZ / SK:** CZ is POS-led (pokladni-system.cz, July 2026); half the results are English. SK results are Czech and
  English pages.
- **HU, RO, SI, HR, BG:** no local food-truck comparison. HU's "best" query returns only English pages. SI is the most
  English-heavy (52%).
- **FR:** one keyword. Page 1 is food-truck pre-order vendors; Autoflowly ("Précommandes avec créneau de retrait" plus a
  day-location feature) is closest to HatchGrab. tool-advisor.fr compares tills.
- **IT:** two keywords. Small vendors (QwikEat, Foodeo, FoxiFood, LeoGrill, DISH) and three machine-translated "migliori
  POS" pages. No Italian publisher, directory or POS giant appeared.
- **GB / IE / MT / GI:**
  - **Order Tiger** (UK food-truck pre-order) is #2 for "food truck ordering system" and "food truck pre order app".
  - "best food truck ordering software" is led by AI-style ranking sites (worldmetrics, zipdo, gitnux, axiobench).
  - "click and collect food truck" returns supermarkets: no SaaS competes on that phrase.
- **US:** foodtruckr.com's "15 online ordering options" (undated, low strength) is the only US page comparing ordering
  options.
- **CA-en:** the same English pool; none of it Canadian.
- **CA-fr:** 37 of 94 results are France sites; nothing from Québec. "camion de rue" pulls fleet software.
- **AU / NZ:** US-hosted results (identical to each other); not a real local reading.
- **CY-en:** UK and US pages only; adding "cyprus" adds nothing Cypriot.

**Not scored (no engine answered):** NL, BE-nl, BE-fr, ES, PT, CH-de/fr/it, LI, LU-fr/de, GR, CY-el. Demand signals exist
for all of them (`scores.csv`).
- NL: 800+ trucks.
- BE: 400+ trucks; 1,510 BE+NL on foodtruckbestellen.be.
- ES: ~500 (2017).
- PT: ~270.
- CH: Foodtruck Verband Schweiz exists, no count found; ~150–400 is an estimate.
- LU: ~15.

---

## 4 · Recommendation (plan only)

- **The direction matches your hypothesis.**
  - Native-language pages face far less competition than English ones.
  - No local page anywhere compares food-truck pre-ordering tools, so an AI has nothing local to cite.
  - **Poland, Germany, Denmark, Sweden and Romania** look best on the Bing index.
  - France ranks easily but has the most direct pre-order rivals.
- **Before committing, close the Google gap.** Gemini and AI Overviews are the biggest audience, and this run has no
  Google data.
  - The cheapest way is §5's ten questions, run by hand.
  - A second option is a short manual Google check from your own browser, for the top 5 countries' intent-1 and intent-2
    keywords (in `serps.csv`).
- **English markets:** compete on the long tail ("click and collect food truck" in the UK; city pages), not on "best food
  truck ordering software".

---

## 5 · STEP 6 — spot-check questions to paste into Gemini, ChatGPT, Perplexity and Claude

Use a fresh or logged-out chat if you can, ask in the local language, and note the date.

| # | Why chosen | Question (local language) | English |
|---|---|---|---|
| 1 | Top 5 | **PL:** „Jaki system do zamówień online polecasz dla food trucka, w którym klienci zamawiają z wyprzedzeniem i wybierają godzinę odbioru? Porównaj opcje.” | Which online ordering system do you recommend for a food truck where customers order ahead and choose a pickup time? Compare the options. |
| 2 | Top 5 | **DE:** „Welches Bestellsystem empfiehlst du für meinen Foodtruck, bei dem Kunden vorbestellen und eine Abholzeit wählen können? Bitte vergleiche die Optionen.” | Which ordering system do you recommend for my food truck where customers can pre-order and choose a pickup time? Please compare the options. |
| 3 | Top 5 | **DK:** „Hvilket bestillingssystem kan du anbefale til min food truck, hvor kunderne kan forudbestille og vælge et afhentningstidspunkt? Sammenlign mulighederne.” | Which ordering system can you recommend for my food truck where customers can pre-order and choose a collection time? Compare the options. |
| 4 | Top 5 | **FR:** « Quel logiciel de commande en ligne me conseilles-tu pour mon food truck, avec précommande et choix du créneau de retrait ? Compare les options. » | Which online ordering software do you recommend for my food truck, with pre-ordering and a choice of pickup slot? Compare the options. |
| 5 | Top 5 | **SE:** ”Vilket beställningssystem rekommenderar du för min food truck där kunderna kan förbeställa och välja en hämtningstid? Jämför alternativen.” | Which ordering system do you recommend for my food truck where customers can pre-order and choose a pickup time? Compare the alternatives. |
| 6 | Close call | **RO:** „Ce sistem de comenzi online îmi recomanzi pentru food truck-ul meu, în care clienții pot comanda în avans și alege ora de ridicare? Compară opțiunile.” | Which online ordering system do you recommend for my food truck, where customers can order in advance and choose the pickup time? Compare the options. |
| 7 | Close call | **IT:** «Quale sistema di ordinazione online mi consigli per il mio food truck, con preordini e scelta dell'orario di ritiro? Confronta le opzioni.» | Which online ordering system do you recommend for my food truck, with pre-orders and a choice of pickup time? Compare the options. |
| 8 | Close call (no Australian results in either run) | **AU:** "What's the best online ordering system for a food truck in Australia where customers pre-order and pick a collection time? Compare the options." | — |
| 9 | Close call (most crowded English market) | **UK:** "What's the best click and collect system for a UK food truck where customers choose a collection time? Compare the options." | — |
| 10 | Close call (not scored this run; your suspicion) | **NL:** "Welk bestelsysteem raad je aan voor mijn foodtruck, waarbij klanten vooraf kunnen bestellen en een afhaaltijd kunnen kiezen? Vergelijk de opties." | Which ordering system do you recommend for my food truck, where customers can order in advance and choose a pickup time? Compare the options. |

**What to look for in each answer:**
1. **Which sites it cites.** Note each domain and sort it into:
   - **local-language** (e.g. kassensystemevergleich.de, gopos.pl);
   - **global English lists** (buildmymap, UpMenu, Restolabs, worldmetrics, Guideflow, Forbes, Capterra);
   - **POS or card brands** (Square, SumUp, Zettle, Lightspeed).

   Mostly English lists means an open slot: an AI has nothing local to cite.
2. **Does it name any food-truck pre-order tool?** Examples per country:
   - DE: OrderFront, gastro25, GastroSystem, Jamezz;
   - DK: Truckly;
   - SE: Jamezz;
   - FR: Autoflowly, Truckons, Eatch, Hopchef, Nomad;
   - PL: GoPOS GoOrder, FoxiFood;
   - UK: Order Tiger, Beat The Queue, Ordea;
   - NL: Qrder, Jamezz, Bestelly.

   If it names none, the gap is real for that AI.
3. **Does it answer with card readers or tills instead** (Square / SumUp / Zettle / "a POS with online ordering")? That
   means it is not recognising pre-ordering as its own category. It is the clearest sign a pre-order comparison page
   would be new.
4. **Does it mention HatchGrab?** (Expected: no.)
5. **Do Gemini (Google) and ChatGPT (Bing) cite different sites?** That is the engine disagreement this run could not
   measure.

---

## 6 · Sources

**Engines → AI (STEP 2), fetched or searched 24 Oct 2026**
- Google Search Central, AI features: https://developers.google.com/search/docs/appearance/ai-features
- Gemini grounding:
  - https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/ground-with-google-search
  - https://firebase.google.com/docs/ai-logic/grounding-google-search
- OpenAI crawlers: https://platform.openai.com/docs/bots
- ChatGPT search and Bing (reported):
  - https://yoast.com/chatgpt-search/
  - https://seroundtable.com/chatgpt-search-38337.html
- Microsoft Copilot web grounding: https://learn.microsoft.com/copilot/microsoft-365/manage-public-web-access
- Claude and Brave (reported):
  - https://techcrunch.com/2025/03/21/anthropic-appears-to-be-using-brave-to-power-web-searches-for-its-claude-chatbot/
  - https://simonwillison.net/2025/Mar/21/anthropic-used-brave
- Perplexity: https://hub-prod.perplexity.ai/hub/faq/how-does-perplexity-work

**Results pages:** every result URL is in `docs/competition-check-1/serps.csv` (engine_used, rank and date per row).

**Demand sources (one per pair; full list in the scratch demand files, summarised in `scores.csv`)**
- **Europe, larger scenes**
  - money.pl (PL): https://www.money.pl/biznes/gastronomia-bije-rekord-boom-na-food-trucki-7317884550785216a.html
  - foodtrucks-deutschland.de (DE): https://www.foodtrucks-deutschland.de/
  - camping-car.com (FR): https://www.camping-car.com/actualites/toute-l-actualite/30884-food-trucks-ces-cousins-du-…
  - Il Giorno (IT): https://www.ilgiorno.it/milano/economia/street-food-gqj2z02l
  - Euronews Romania (RO): https://www.euronews.ro/articole/food-truck-urile-o-afacere-de-succes-industria-restaurant…
  - Trade Magazin (HU): https://trademagazin.hu/en/iz-rajderek
- **Europe, other**
  - foodtruckbestellen.be (BE+NL): https://www.foodtruckbestellen.be/
  - NH Nieuws (NL): https://www.nhnieuws.nl/nieuws/286346/…
  - El Independiente (ES): https://www.elindependiente.com/tendencias/2017/02/08/food-truck/
  - Forbes Portugal (PT): https://www.forbespt.com/comer-e-beber-na-rua
  - Stockholmsmässan press release (SE): https://www.mynewsdesk.com/se/stockholmsmassan/pressreleases/…
  - CPH Post (DK): https://cphpost.dk/2016-06-15/news/copenhagen-ravenous-for-street-food
  - Visit Tromsø (NO): https://www.visittromso.no/no/street-food-norway
  - Yle (FI): https://yle.fi/a/74-20162698
  - ERR (EE): https://news.err.ee/1609040957/…
  - Foodtruck Verband Schweiz (CH): https://foodtruck-verband.ch/
  - Chronicle.lu (LU): https://chronicle.lu/category/dining-out-1/40592-interview-luxembourg-food-truck-associati…
- **English-speaking**
  - IBISWorld (US): https://www.ibisworld.com/united-states/industry/food-trucks/4322/
  - TaxAssist (GB): https://taxassist.co.uk/resources/articles/how-to-start-a-mobile-food-business/amp
  - State Library of Queensland (AU): https://www.slq.qld.gov.au/blog/why-food-truck-boom-could-be-over
  - Canadian Grocer (CA): https://canadiangrocer.com/canadas-food-truck-expansion-continues
  - Dublin Inquirer (IE): https://www.dublininquirer.com/food-trucks-are-great-incubators-so-why-don-t-we-have-more/

---

## 7 · Read-only SQL

```sql
select country_code, name, locale from public.country_settings where enabled = true order by country_code;
```
