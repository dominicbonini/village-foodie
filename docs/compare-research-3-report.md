# compare-research-3 — Dominic's §6 decisions, then a third research wave in launch order

**25 November 2026 · branch `france-vat-1` · not pushed, not deployed**

## 0 · The short version

- **Live comparison countries: 44 → 55.**
  - Wave 1 (+2): GI, LI.
  - Decisions (+3): EC, PA, KW.
  - Wave 2 (+5): TW, EG, MA, NG, OM.
  - Wave 3 (+2): MV, PR.
  - Left the list (−1): **UA**, because of decision (c).
  - **AE is not live.** In every live country the shown competitors are the marked ones.
- **All decisions a–g are applied. Nothing waits for a deploy.**
  - The deployed page shows a competitor's price in the plan's own currency.
  - The accepted-currency rule is used only by the publish step, which runs locally.
- **Research:** 3 agents, strictly in launch order:
  - wave 1: the October 36;
  - wave 2: languages-world-1;
  - wave 3: the world-countries-5 countries of a reasonable size; micro-territories skipped.
  - One-short countries came first within each wave. Each agent committed its folder after every country.
- **Load:** `data/compare-research-3/competitors.json` (`docs/compare-research-3/build.cjs`) was loaded in three rounds. Each round ran
  the import dry run, the import, the publish dry run and the publish.
  - 2 guarded migrations were pre-flighted rolled back, then applied.
  - **No current plan is over its plausible ceiling** (0 of 751).

## 1 · The decisions as applied

| | Decision | Applied | Effect |
|---|---|---|---|
| a | second accepted currency: PA USD, KW KWD, BH BHD, OM OMR, JO JOD | `lib/comparison-publish.ts` `ALSO_ACCEPTED_CURRENCY` (`5a0519df`); `country_settings.currency` untouched | **KW** (Ordable · Zyda) and **PA** (Take App · Actib) live; BH, JO one short (Ordable only); OM live after wave 2 |
| | page check without a deploy | origin/main `lib/comparison.ts` formats each competitor amount with `{ currency: p.currency }`; minor digits come from the registry or Intl (KWD, BHD, OMR and JOD have 3); the cost calculator converts through EUR rates and hides itself when a rate is missing; nothing re-checks currency at render time | applied in this run's publish |
| b | Yabie SE counts only if its priced plan includes online ordering | agent 1: Express's own feature list has no online ordering, and Yabie Online is never tied to the 899 kr plan → **unclear** (migration 20261131) | SE stays live: WEIQ · Vitrina (SEK) |
| c | Poster UA: the true monthly price, or unclear | "1 530 ₴1 700 ₴/міс." sits under an unlabelled "Оплата за рік" toggle, so it can't be stated exactly → **all 3 Poster UA prices unclear** (they come from that page) | **UA drops to one short** (Vitrina) |
| d | Klikit "Core" SG/MY/TH unclear | migration 20261131 (pre-flight passed) | no page change: the shown entries already use Core + Omni |
| e | OlaClick's pricing page in its check pages | ⚠️ its stored website **was already** pricing.olaclick.app. What blocked EC was its order-ahead quotes on **help.olaclick.com**, so its check pages are now the pricing page **and** the two help pages (migration 20261131). My compare-research-2 §6.5 had this backwards | **EC live** (OlaClick · Pedix) |
| f | keep the other weak fits and SumUp's single fallback | unchanged | — |
| g | neighbouring markets | LI: Yoveletta (from CHF 29) and Rent-a-Shop (from CHF 44.90), "serves LI from CH"; neither site limits service to Switzerland on the pages read. GI: Ordea (£0 + 3 %), "serves GI from GB"; its home page and terms set no territory limit. MT strict | **GI and LI live**; MT one short |

**Coordinator review** (in `build.cjs`, each with its reason):
- **marked unclear:**
  - Rent-a-Shop's Onlineshop add-on;
  - Fudo CO's base plan (migration 20261132, because already imported);
  - Resto ZA (its price came from the page reader's summary, not a verbatim quote; migration 20261132).
- **left out as incomplete:** Poster KZ and Delivety UA (marked eligible without the required quotes).
- **Foodics' no-currency mark** is limited to SA. Its OM page is in USD and its EG page in EGP.

## 2 · Every enabled country by launch wave

`country_settings` has no creation or enable date (only `updated_at`). The waves follow the manual:
- wave 1: the 36 rows of 22 Oct, `20261036_europe_rows.sql` plus GB/US/IE/AU/NZ/CA/FR;
- wave 1b: world-countries-1's 8 (1 Nov);
- wave 2: languages-world-1's 47 (11 Nov);
- wave 3: world-countries-5's 167.

```sql
select string_agg(s.country_code, ' ' order by s.country_code) not_live, count(*) n
from public.country_settings s left join public.comparison_publish p on p.country_code = s.country_code
where s.enabled and not coalesce(p.auto_live, false);   -- 166 at the start
```

| Wave | Live now | Not live, and why |
|---|---|---|
| **1 · October 36** | all except MT: AT AU BE BG CA CH CY CZ DE DK EE ES FI FR GB **GI** GR HR HU IE IT **LI** LT LU LV NL NO NZ PL PT RO SE SI SK US | **MT** one short (FoxiFood): nothing else shows it sells in Malta. Storekit is GBP only and SumUp MT only ships |
| **1b · world-countries-1** | BR HK JP MY SG TH | AE never published; MX switched off |
| **2 · languages-world-1** | AR CL **EC** **EG** ID **KW** **MA** **NG** **OM** **PA** TR **TW** | **one short:** IS RS KR QA SA BH JO BO DO SV GT JM UY ZA CO · **none:** AO BS CR CV HN IL MC MZ NI PE PY SN TN TT |
| **3 · world-countries-5** | **MV** **PR** | **one short:** UA AL BA MK MD UZ IN LK BD MU · **none found:** KZ GE AZ AM ME KG PK KH NP MN MO BN LA TZ UG ET NA BW ZM ZW DZ BZ GY SR · micro-territories not researched |

## 3 · Per country: what was found (this run)

The evidence is in `docs/compare-research-3/agent-N/raw/<CC>.json`, and each agent's `summary.md` has a line per country.

| Country | Found | Count now |
|---|---|---|
| GI | Ordea (food truck · £0 + 3 % · ordea.uk), serves GI from GB | 2 ✅ |
| LI | Yoveletta (food truck · Food truck from CHF 29 · "Gäste bestellen vorab über deine Website und holen ihr Essen direkt am Truck ab") · Rent-a-Shop (food truck · Kassensystem für Foodtruck from CHF 44.90 · "Online vorbestellen, lokal abholen"), serve LI from CH | 2 ✅ |
| MT | nothing (5 vendors; Maltix 404, Zaype marketplace) | 1 |
| IS, RS | nothing new in ISK / RSD | 1 |
| MA | Asila (asila.ma · 300 MAD/mois · online takeaway; borderline: no chosen-time wording) | 2 ✅ |
| MC, TN, SN, CV | none (marketplaces; Poslik till only; Vendus EUR, no ordering ahead) | 0 |
| TW | Oddle (from NT$3,000/month; "線上外帶", ahead partial) | 2 ✅ |
| OM | Foodics Advanced (USD 1,068 a year; the only plan with "Website") | 2 ✅ |
| EG | Foodics Advanced (EGP 3,733.67 a month, billed annually; "Foodics Online Web Creation") | 2 ✅ |
| SA, BH | Foodics KSA (no currency shown) and Blink ("$" only): unclear by the review rules | 1 |
| KR, QA, JO | nothing new (Foodics QA is USD; there is no Foodics JO page) | 1 |
| IL | none | 0 |
| BO DO SV GT JM UY | nothing new after 4–5 sites each. SV would reach 2 with OlaClick if a general "Latin America" presence counted | 1 |
| CO | Menuestro (no price); Vendty (no pickup wording) | 0 (Fudo unclear) |
| ZA | Bizzfo (R450 a month, incl. VAT) · Resto (unclear: not a verbatim price quote) | 1 |
| NG | Mylo (₦7,500 a month) · Restorant (₦0 + 5 % per online-paid order; borderline: it also runs a marketplace) | 2 ✅ |
| AO, CR, HN, NI, PE, PY, TT, BS, MZ | none priced in the local currency | 0 |
| UA, AL, BA, MK, MD, UZ | nothing new (Choice 403; marketplaces, QR menus, EUR-only tools) | 1 |
| KZ, GE, AZ, AM, KG, ME | none (Poster KZ under the same yearly toggle as UA) | 0 |
| MV | Ewity POS (MVR 450 a month, billed yearly; "timed delivery and pickup windows") | 2 ✅ |
| IN, LK, BD | nothing new (Petpooja, Thrive: no prices) | 1 |
| PK, KH, NP, MN, MO, BN, LA | none in the local currency | 0 |
| PR | Menufy (USD 0 a month to the restaurant; the customer pays a processing fee, amount not stated; Puerto Rico page) | 2 ✅ |
| MU | Resto-SaaS (1 800 / 4 400 MUR + VAT; its site is on a railway.app subdomain) | 1 |
| TZ UG ET NA BW ZM ZW DZ BZ GY SR | none | 0 |

## 4 · Load and publish

| Round | Import (dry run → real) | Publish (dry run → real) |
|---|---|---|
| wave 1 | +5 plans, +3 entries | 44 → 48 (GI, LI, EC, PA, KW in; UA out) |
| wave 2 | +7 competitors, +18 plans, +10 entries, +98 answers; then a no-change re-import of the rebuilt file, after migration 20261132 | 48 → 53 (TW, EG, MA, NG, OM) |
| wave 3 | +2 competitors, +6 plans, +3 entries, +29 answers (1 bare one replaced) | 53 → 55 (MV, PR) |

- Every dry run's tables were unchanged after its rollback.
- Every real publish's site refresh answered 200.
- **Verification (MCP, read-only):** 55 live; shown ≠ marked in 0 countries; AE false/false; 0 of 751 plans over the ceiling (the 100× check
  with the repo's minor digits); no pending or duplicate answers.
- **SQL:** shown in chat while the work ran. Every distinct statement is in `docs/compare-research-3/sql.txt`, and the two migrations
  are in `supabase/migrations/`.

## 5 · Totals

| | Start of this run | End |
|---|---|---|
| Live countries | 44 | **55** |
| One short | 29 | 26 (incl. AE) |
| Competitors | 263 | 272 |

## 6 · Still needs Dominic

1. **UA dropped off** because of decision (c). It comes back if Poster's price is accepted as 1 530 ₴ (billed yearly) or 1 700 ₴
   (monthly), or if another UAH tool appears. **KZ** has the same Poster toggle.
2. **Borderline fits counted this run:**
   - Asila MA (no chosen-time wording);
   - Restorant NG (also a marketplace);
   - Menufy PR (customer fee amount not stated);
   - Oddle TW (ahead partial);
   - the GI and LI neighbour fits (no exclusion found on the pages read, but the terms of Yoveletta and Rent-a-Shop weren't read).
   - Say if any should go.
3. **Toss Place KR:** a third-party help page says pickup orders cost 3.5 % + VAT, against the "free" that is stored. tossplace.com/pricing
   returns 404. KR isn't live; it needs a check before it ever is.
4. **SV:** OlaClick would make 2 if "Restaurantes en América Latina" counted as presence.
5. **MU:** Resto-SaaS runs on a railway.app subdomain. Confirm it is the live product.

## 7 · Files, checks

**Files:**
- `docs/compare-research-3/`: `agent-brief.md`, `build.cjs`, `stored-ids.json`, `stored-plans.json`, `stored-list.txt`, `sql.txt`, and
  `agent-1…3/` (raw evidence, summaries; one commit per country);
- `data/compare-research-3/competitors.json`;
- `lib/data-import/importer.ts`: registered eighth;
- `lib/comparison-publish.ts`: decision (a);
- `scripts/compare-db-proofs.cjs`: the new `--preflight` mode for any competitor-data migration, rolled back;
- `supabase/migrations/20261131_compare_research_3_decisions.sql` and `20261132_compare_research_3_unclear.sql`.

**Checks:**
- `build.cjs --check` ✓;
- compare-fix-1 65/0, compare-fix-2 79/0 after decision (a);
- both pre-flights ✓ (counts and checksums equal after the rollback).

**Not done:** no push, no deploy, no workflow change (Competitor check stays disabled), no `.env` file opened, nothing outside the
competitor and comparison tables, nothing touching Pizzeria Gusto.

## 8 · Flags

- **Nothing arrived garbled.** No instruction contradicted another.
- **Decision (e)'s mechanism was off** (see §1). I applied its stated aim, "so EC can count it", with the same kind of fix, and say so
  here.
- **Wave 1 used 2 agents, not 3.** Its 3 countries and the two decision checks didn't need a third, and the strict wave order meant
  wave 2 couldn't start early.
- **Launch-order data:** `country_settings` has no creation date, so the manual's record was used. world-countries-1's 8 countries
  came between the October 36 and languages-world-1. All 8 were live already, except AE and MX.

## Undo (only if Dominic asks)

⛔ DO NOT RUN without his say-so.
- **Taking countries down:** Admin's per-country switch (`admin_off`).
- **Reversing decision (a):** remove the five entries from `ALSO_ACCEPTED_CURRENCY` and run the publish again.
- **Reversing migration 20261131 or 20261132:** set `unclear = false` on the named plan ids, and OlaClick's `check_urls` back to
  `array['https://pricing.olaclick.app']`, each as its own migration.
