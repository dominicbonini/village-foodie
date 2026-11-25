# compare-research-2 — more competitor research, imported and published on the live data

**25 November 2026 · branch `france-vat-1` · not pushed, not deployed**

**Commits:**
- `b188596f`: wave-1 research, data file and registration
- `0a563735`: Oddle migration
- `305953c2`: wave-2 research, data file and registration

## 0 · The short version

- **Live comparison countries: 28 → 44.**
  - **Wave 1 added 13:** AR, BG, CL, EE, HK, HR, ID, LU, LV, PT, SE, SG, TR.
  - **Wave 2 added 3:** SI, SK, UA.
  - **AE is not live** (`auto_publish` false). Every live country shows exactly its marked competitors.
- **Two waves of research on vendors' own sites:**
  - **Wave 1** (the brief): 43 countries, 4 agents. You allowed a 4th agent in chat.
  - **Wave 2** (the remaining 48 switched-on countries of a reasonable size, which you asked for in chat): 3 agents.
  - Each vendor was read by exactly one agent. That was checked by domain across all the raw files.
- **Two importer data files, each rebuilt by its own script and imported in one transaction after a rolled-back dry run:**
  - `data/compare-research-2/competitors.json` (`build.cjs`): 50 competitors, 244 plans, 130 entries.
  - `data/compare-research-2b/competitors.json` (`build-wave-2.cjs`): 29 competitors, 154 plans, 68 entries.
  - Both pass the importer's validation, including the database's unique rules (compare-fix-2), and the 100× check.
  - **Now in the database:** 42 new competitors, 360 plans, 169 entries, 671 quoted answers.
- **One guarded migration** corrected Oddle's website from its reseller's (uob.com.sg) to oddle.me. It changed one competitors row, and
  it is what brought HK and SG live.
- **Checks after the run:** 0 of 730 current priced plans are over their plausible ceiling. No answer is left pending and none is
  duplicated.
- **Decisions for Dominic:** §6. The main one is that KW, BH, OM, JO and PA are stored in USD or PAB while their vendors price
  otherwise.

## 1 · Plan and method

**Before:**
- 28 live (AT AU BE BR CA CH CY CZ DE DK ES FI FR GB GR HU IE IT JP LT MY NL NO NZ PL RO TH US).
- Every country except MX is switched on. VN and KE aren't in `country_settings`, so they were skipped.
- No country that wasn't live had 2+ eligible priced competitors.

**Brief and agents:**
- The shared brief, `docs/compare-research-2/agent-brief.md`, is the compare-research-1 rules plus vendor ownership.
- Each agent wrote only to `docs/compare-research-2/agent-N/`.
- Wave 1: agent 1 Europe, agent 2 Asia-Pacific and Middle East, agent 3 Americas and Africa, and agent 4 (added mid-way) the second
  half of the European list.
- Wave 2: agent 5 rest of Europe, Caucasus and Central Asia; agent 6 South and South-East Asia, North and East Africa; agent 7 rest of
  the Americas and southern Africa.
- Agent 1 was cut off once by the Mac sleeping, and resumed. `caffeinate` ran from then on.
- Agent 6 was paused for about 40 minutes to stay inside your 5-hour usage limit, then resumed.

**Multi-country vendors:**
- Each had one owner agent, by home market. The owner also recorded the vendor in other regions' research countries (`OWNED.json`),
  so those countries didn't lose it.
- That is a reading of the brief ("records every country of its region"): it adds countries and never double-reads a vendor.

**Coordinator review before each build** (in the build scripts, each with its reason):
- **Plans marked `unclear`:** they are imported as evidence but are never published as a stated price.
  - **No currency shown:** Blink ("$" only), Foodics SA, NemTakeAway NO, SumUp CO.
  - **Plan without online ordering:** Klikit "Core" (ID, TW), iCHEF POS, ESB Basic, Fudo's POS plan (AR), inyad POS, Zunapro
    Başlangıç.
  - **Not the whole monthly price:** Fudo CO, which is an add-on.
  - **Weak price or weak presence:** L'Addition LU, Sparissimo Food LI, and Vitrina LT/LV (its Slovak price borrowed).
- **Zyda's "Prices for Kuwait"** are written only for KW. Before this fix the build would have "corrected" Zyda's stored AE plans into
  KWD.
- **OlaClick in wave 2 is kept only in EC**, the one country its own site names. Elsewhere it rests on "Restaurantes en América
  Latina".
- **Display names are shortened** (Fudo, Blink, Zunapro, Toss Place, İletmen, Foodics, ESB Order, Sistema Que Vende, Gestióndo,
  Sabbor, Ezy Cart, PedíFácil, RestroGreen, POS Masters).
- **Wave 2 matches stored competitors by website host as well**, because the agents' stored list predated the wave-1 import (Pedix,
  Fudo and YUMBI merged into their stored rows).

## 2 · Per region and country

**How to read the tables:**
- **Counted** = eligible, with a price in the country's stored currency.
- Prices are major units, today, from the vendor's own site.
- The full eligibility quotes, URLs, every feature answer and every vendor looked at are in
  `docs/compare-research-2/agent-N/raw/<CC>.json`.
- A generated table for wave 1 is in `docs/compare-research-2/summary.md`.

### Europe (agents 1, 4, 5)

| Country | Live? | Shown (focus · price · eligibility page) | Why not / notes |
|---|---|---|---|
| SE | **✅ new** | WEIQ (food truck · från 750 SEK/mån · weiq.tech/take-away) · Yabie (food truck · Yabie Express fr. 899 kr/månad · yabie.com/kassasystem/yabie-express) | Yabie borderline: the plan isn't said to include ordering. Qopla, Caspeco, Purspot: eligible, no price. Karma unreadable |
| PT | **✅ new** | Sistema Que Vende (restaurant · 100,80 €/mês + IVA · "para agora ou agendado") · Takego (restaurant · 99,99 €/mês · "agendamento de pedidos até 7 dias antes") | SumUp also eligible; Choice 403 |
| HR | **✅ new** | DISH Professional Order (food truck · 39 €/mj + PDV · dish.co/HR food-truck page) · Vitrina (restaurant · €0 + 3 % online payments) | SumUp no longer needed |
| SI | **✅ new** (wave 2) | Vitrina (restaurant · 0 € plan; Slovenian site) · SumUp (single fallback) | Restaumatic not relevant |
| SK | **✅ new** (wave 2) | FoxiFood (food truck · 0 € + 0,45 € per order) · DISH (food truck · 59 €) | Vitrina and SumUp also eligible |
| UA | **✅ new** (wave 2) | Poster (food truck · 1 530 ₴; looks like the billed-yearly monthly figure) · Vitrina (restaurant · 0 ₴ plan) | Delivety USD only; Choice 403 |
| BG | **✅ new** | FoxiFood (food truck · 0 € + 0,45 €) · Menuto (restaurant · 29 €/месец · "Онлайн поръчки за вземане от място") | QR-MENU.BG 15 € also counted |
| EE | **✅ new** | FoxiFood (food truck) · Jitmeal (food truck · 29 € + km/kuu, Tallinn) | Poster USD only |
| LV | **✅ new** | FoxiFood (food truck) · SumUp (single fallback) | Vitrina LV unclear; r_keeper, IQ Rest, ShopWidget not relevant |
| LU | **✅ new** | FoxiFood (food truck) · SumUp (single fallback) | L'Addition unclear; Payli, Restomax: no Luxembourg presence |
| NO, FI, CY, LT | ✅ (were) | unchanged: Favrit · Superb; Food4you · SumUp; Wiiz Eat · SumUp; ared · SumUp | NemTakeAway NO unclear (no currency); Refektorius weekly; Vitrina NO (NOK) found, not needed |
| MT | one short | FoxiFood | SumUp MT ships only; Storekit GBP only |
| GI | one short | Order Tiger (£59) | local apps are marketplaces |
| IS | one short | Vitrina (ISK price list) | Dineout, Stefna: eligible, no price; FoxiFood EUR only |
| RS, AL, BA, MK, MD | one short | Vitrina (local price list) | FoxiFood EUR only |
| LI | ❌ | — | Sparissimo Food unclear; nothing else names Liechtenstein |
| KZ, UZ | ❌ / one short | Poster KZT (KZ) · Delever (UZ, сум) | Delever's evidence is its own llms-full.txt |
| GE, ME, AM, AZ, KG | ❌ | — | nothing eligible exists (Kovzy and XPOS GE are delivery only) |

### Asia-Pacific and Middle East (agents 2, 6)

| Country | Live? | Shown | Why not / notes |
|---|---|---|---|
| HK | **✅ new** | Oddle (restaurant · from HK$1,250/mo · pickup slots with capacity) · Eats365 (from HK$1,200/month) | needed the Oddle fix (§3) |
| SG | **✅ new** | Klikit · Oddle (from S$300/mo) | Qashier $5 a day → unclear; see §6.4 on Klikit's stored Core plan |
| ID | **✅ new** | Klikit (Core + Omni Rp958.000) · ESB Order (from Rp499.000) | majoo also counted |
| TR | **✅ new** | İletmen (5.99 TL per order, no monthly fee) · Zunapro (yearly, KDV dahil) | Storekit GBP only |
| KR | one short | Toss Place (pickup ordering, free) | fee after the free period unconfirmed |
| TW | one short | Klikit | iCHEF's base plan excludes online takeaway; Oddle TW 403 |
| IN | one short | uEngage (₹21,999 a year) | Thrive, Petpooja unreadable; DotPe, DineOpen, LimeTray not relevant |
| SA, QA | one short | Ordable | Foodics no currency; Zyda KWD only; Sapaad no price |
| BD, LK, MV | one short | Restora POS (৳2,499) · POS Masters (Rs 7,500; borderline) · Qvian (MVR 3,500; orders via its own app) | RestroGreen no price |
| IL, PK | ❌ | — | Tabit not relevant, Wix unreadable; tossdown USD only |
| KW, BH, OM, JO | ❌ | — | stored currency USD; Ordable and Zyda price in KWD / BHD / OMR / JOD (§6.1) |
| MO | ❌ | — | Eats365 Macau: no amounts |
| BN, SN, MU | ❌ | — | Take App USD only |
| KH, NP, MN, LA, DZ, TZ, UG, ET | ❌ | — | nothing eligible exists |
| TN (stored EUR) | ❌ | — | Sinqro eligible, pricing "temporarily unavailable" |
| AE | never | Ordable | — |

### Americas and Africa (agents 3, 7)

| Country | Live? | Shown | Why not / notes |
|---|---|---|---|
| AR | **✅ new** | Fudo (food truck · Tu Delivery: no monthly fee, service fee per sale · "food trucks y ferias") · Ojapo (restaurant · $0 / $19.000 por mes) | Pedix also counted |
| CL | **✅ new** | Fudo (1,9 % + IVA per sale) · Pedix (Mensual $8.500) | Toteat, Justo (UF prices) not relevant |
| EC | one short | Pedix ($9) | OlaClick's price page is on olaclick.app, not its stored domain (§6.5) |
| SV, HN, NI | one short / ❌ | Pedix (USD; counts in SV) | OlaClick left out: presence only "América Latina" |
| UY, BO, DO, GT, JM, MA, EG, PR | one short | Pedix · Mezzita (400 Bs) · Gestióndo (one-off RD$ on a till plan) · Sabbor (Q375; site on pages.dev) · Ezy Cart (J$15,000) · inyad (149 dh) · Ordable (EGP) · Take App (USD) | — |
| PA | ❌ | — | stored as PAB; Actib, Kioskito, Pedix, OlaClick price in "$" (USD at par) → 4 if USD counted (§6.1) |
| CO, PE, CR | ❌ | — | Fudo CO add-on and SumUp CO unclear; SumUp PE alone |
| PY | ❌ | — | ClickParaPedir (food truck) and PedíFácil have no price; Fudo PY USD |
| ZA, NG, NA, BW, ZM, AO | ❌ | — | YUMBI and Ocuioso eligible, no price |
| TT, BS, ZW, MZ | ❌ | — | marketplaces only |

**Big players:**
- **Square, Toast and Clover:** sell in none of these countries.
- **Lightspeed NO:** has prices but no online-ordering wording, so not relevant.
- **SumUp:** counts only as the single fallback.

## 3 · Load and publish (competitor and comparison data only)

| Step | Wave 1 | Wave 2 |
|---|---|---|
| a · import dry run (rolled back) | +25 competitors, +206 plans, +101 entries, +417 answers (15 bare ones replaced), 3 focus set, 1 candidate upgraded; after the rollback: no change | +17, +154, +68, +254 (5 replaced); no change after the rollback |
| b · real import | the same counts; `data_imports` ok 09:55:58 | the same counts; ok 10:42:58 |
| fix | migration `20261130_compare_research_2_oddle.sql`, one transaction, no error | — |
| c · publish dry run | 39 live (before the fix), then 41 (after it); no change after the rollbacks | 44; no change after the rollback |
| d · real publish (every enabled country) | 41 live, marked entries 74 → 107 | 44 live, 107 → 129; site refresh answered 200 |
| e · verify (read-only) | see below | see below |

**Verification:**
- **Live:** 44 (AR AT AU BE BG BR CA CH CL CY CZ DE DK EE ES FI FR GB GR HK HR HU ID IE IT JP LT LU LV MY NL NO NZ PL PT RO SE SG SI SK TH
  TR UA US).
- Shown ≠ marked in **0** countries.
- AE `auto_publish` / `auto_live` = false / false.
- **100× check:** 0 of 730 plans are over the ceiling, using the repo's minor digits (IDR and ISK have 2). The 17 currencies without a
  ceiling (ALL, BAM, BDT, BHD, BOB, DOP, GTQ, JMD, JOD, KWD, LKR, MDL, MKD, MVR, OMR, UYU, UZS) were read plan by plan, and all are
  normal monthly prices.
- **Answers:** 0 pending, 0 duplicate current answers.

**Why Oddle needed the fix:**
- Its stored website was its reseller's (UOB). The publish step's own-site rule (`ownSource`: the website's or a check page's domain)
  refused today's oddle.me prices and quote.
- The importer only fills an empty website, so it couldn't correct this itself.
- No other stored competitor in this research has the problem.

**Changes to pages that were already live:**
- **CZ:** shows DISH before Menu55. DISH's focus became food truck, from its food-truck pages.
- **HR:** shows Vitrina instead of SumUp.
- **Klikit's focus:** went from food truck to restaurant; MY and TH unchanged.

## 4 · Not relevant, and where nothing exists

- **Not relevant:** 100 rows across both waves, each with its reason in the raw files and in the data files' `not_relevant` lists.
- **Stored competitors found not relevant in one country** (none has an entry there, so nothing was marked):
  - GloriaFood CY; Superb FI; SumUp MT; Payli LU; Restomax LU; Restaumatic SI;
  - MENU TIGER KR and BD; OlaClick (wave 1 only); Square PR; Lightspeed NO.
- **Nothing eligible exists** (own sites, today): GE ME AM AZ KG · KH NP MN LA DZ TZ UG ET · IL · TT BS ZW MZ.
- **Eligible but no price anywhere:** IS (Dineout, Stefna), ZA NG NA BW ZM (YUMBI), PY (ClickParaPedir, PedíFácil), AO (Ocuioso), MO
  (Eats365), TN (Sinqro).

## 5 · Totals

| | Before | After |
|---|---|---|
| Live countries | 28 | **44** |
| Competitors (active) | 221 (165) | 263 (208) |
| Current plans | 506 | 866 |
| Entries | 226 | 395 |

**One short today (29):**
- GI MT IS RS AL BA MK MD;
- KR TW IN SA QA BD LK MV UZ;
- EC SV UY BO DO GT JM MA EG PR;
- plus AE (never published).

## 6 · Decisions for Dominic

1. **Stored currency against the vendors' currency.**
   - **The countries:** KW, BH, OM and JO are stored as USD, but Ordable and Zyda price in KWD / BHD / OMR / JOD. PA is stored as PAB,
     but its four vendors price in "$" (USD at par). TN is stored as EUR.
   - **Options:** (a) change `country_settings.currency` (a protected table: your yes needed); (b) accept a second currency per
     country in `ALSO_ACCEPTED_CURRENCY`, as RO accepts EUR (a code change and a deploy); (c) leave as is.
   - **Recommendation: (b)**, with PA → USD and KW/BH/OM/JO → their own currency. **PA would go live** with 4.
2. **SumUp's single fallback** keeps LU, LV and SI live (and FI, LT, CY). That follows your rule; it's said here so you know.
3. **Weak-but-counted fits:**
   - Yabie SE (the plan isn't said to include ordering);
   - DISH HR and SK (pickup, no chosen time);
   - Poster UA (the price looks billed yearly);
   - Vitrina SI (presence by language site);
   - Fudo AR/CL (a restaurant POS whose page names food trucks, kept as food truck);
   - Pedix (its pickup proof is a help-article title).
   - Say if any should be taken down; Admin's switch does it per country.
4. **Klikit's stored "Core" plans** (SG S$19; MY and TH from compare-research-1) have no webshop, and the page uses the cheapest plan.
   - **Recommendation:** a small migration marking those stored plans unclear.
5. **OlaClick's prices sit on `pricing.olaclick.app`**, outside its stored domain, so EC can't count it.
   - **Options:** add that page to its check pages, the same kind of fix as Oddle's, which would make **EC live**. Or leave it.
6. **The brief's premise was off:** "NO, FI, HR, SI, CY live only through SumUp". NO showed Favrit · Superb, and HR and SI weren't
   live. LT was the one live through SumUp, and I added it. All were researched.

## 7 · Files, checks, SQL

**Files:**
- `docs/compare-research-2/`:
  - `agent-brief.md`;
  - `build.cjs` and `build-wave-2.cjs`;
  - `summary.py` / `summary.md`;
  - the stored exports (`stored-ids*.json`, `stored-plans*.json`, `stored-list.txt`);
  - `agent-1…7/` (raw evidence and summaries);
  - `sql-wave-1.txt` / `sql-wave-2.txt` (every distinct statement the import and publish sent; parameter sizes only).
- `data/compare-research-2/` and `data/compare-research-2b/competitors.json`.
- `lib/data-import/importer.ts`: files 6 and 7 registered.
- `supabase/migrations/20261130_compare_research_2_oddle.sql`.

**Checks:**
- both `--check` runs ✓;
- competitor-wtt-1 42/0, competitor-check-1 227/0, competitor-features-2 79/0, compare-fix-1 65/0, compare-fix-2 79/0;
- `tsc --noEmit` exit 0.

**SQL:**
- **Written in chat while the work ran:** every write statement (the migration, the import's and the publish's). Wave 2 sent a subset
  of wave 1's statements.
- **Read-only (MCP):**
  - enabled and live countries;
  - stored competitors and plans for the target countries;
  - the id and plan exports (twice);
  - Oddle's row and the stored websites;
  - live = marked;
  - the ceiling checks and the no-ceiling plan list.

**Not done:** no push, no deploy, no workflow change (Competitor check stays disabled), no `.env` file opened, nothing outside the
competitor and comparison tables, nothing touching Pizzeria Gusto.

## 8 · Flags

- Nothing in the brief arrived garbled.
- **No contradiction stopped the work.** Three places needed a reading:
  - "show every SQL statement inline in chat" against "chat: only a two-line summary": the SQL went in chat during the work, and the
    final reply is the summary;
  - owners recording their vendor in other regions' countries (§1);
  - the scope grew by your chat messages: a 4th agent, then wave 2 on the remaining countries.
- **The Oddle migration** is a write beyond import and publish. It is competitor data only, guarded and committed.
- **Another session's uncommitted till-pack files** were left alone. Only this work's files were committed.

## Undo (only if Dominic asks)

⛔ DO NOT RUN without his say-so.
- **Taking countries down:** Admin's per-country switch (`admin_off`).
- **Undoing an import:** delete the rows it created (09:55:58 UTC for wave 1, 10:42:58 for wave 2), and make current again the answers
  it superseded (15 and 5). That needs its own migration, with a rolled-back proof.
- **Undoing the Oddle fix**, as a migration:
  `update public.competitors set website = 'https://www.uob.com.sg', check_urls = array['https://www.uob.com.sg'] where id = '110abdac-c213-5f20-bada-10b1b9b8c9f0';`
