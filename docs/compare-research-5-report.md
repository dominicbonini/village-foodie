# manual-v16-38 + compare-research-5: the manual delta, then wave 3's one-short countries, a second CLP tool, and Fudo AR / CL

**25 November 2026 · branch `france-vat-1` · not pushed, not deployed**

**Commits:**
- `8c0f7336`: manual V16.38
- `8591e99b`: brief and stored list
- agents' one-per-country commits
- `4511be06` and the next commit: build, data file and registration

## 0 · The short version

- **Part A:** the manual is now **V16.38** (the next free number) in both places.
  - The changelog entry is in, word for word, with the OBSERVED line.
  - Open items 55, 57, 58 and 59 are edited in place, and §91 gains its three rules.
  - Only `docs/reference-manual.md` was committed. `compare-research-4-report.md` was already committed.
  - **Section E matched the delta exactly.**
- **Part B: 58 → 59 live.** India joins (Dinehere · uEngage). No other country changed.
  - CL stays live on Pedix · SumUp (no second CLP tool).
  - Fudo AR and CL don't say the module needs a paid plan, so AR stays as it is and CL stays unclear.
  - MK and MD each found a second tool, but under the existing rules neither counts.
- **One load round, with no migration** (no stored row needed correcting).
  - Verified read-only: 59 live; shown = marked everywhere; AE false/false; 0 of 754 priced plans over the ceiling; no pending or
    duplicate answers.

## 1 · Part A: the manual (V16.38)

**Applied as HOW TO APPLY says:**
- the header and `**Version 16.38**`, which a grep shows agree;
- section A at the top of `# Changelog`, plus an **OBSERVED when applying** line (25 Nov 14:04 UTC);
- Open items:
  - the heading is now `(V16.38, 25 November 2026)`;
  - **55:** the "Deadline (V16.38)" paragraph added after its OBSERVED line;
  - **57, 58, 59:** the old text struck and the new text after it;
- section C's three bullets at the end of §91's list: how long a price counts, module on a paid plan, not a confirmed live product.

**Section E (read-only), shown in chat:**

```sql
select count(*) filter (where auto_publish and auto_live and not coalesce(admin_off,false)) as live,
       string_agg(country_code, ' ' order by country_code) filter (where auto_publish and auto_live and not coalesce(admin_off,false)) as live_list
  from public.comparison_publish;
select country_code, auto_publish, auto_live from public.comparison_publish where country_code = 'AE';
select file_path, result, imported_at from public.data_imports order by imported_at desc limit 1;
```

| Check | Observed | Delta expected |
|---|---|---|
| live | **58**, exactly section A's list | 58 ✅ |
| AE | false / false | ✅ |
| newest `data_imports` | `data/compare-research-4/competitors.json`, ok, 13:53:28 UTC | ✅ |
| `DATA_FILES` | 9 | 9 ✅ |

**Difference from the delta:** none. `compare-research-4-report.md` was already committed (`611f0365`), so the "if untracked" commit didn't
apply.

## 2 · Part B, Step 0 (read-only)

- **Git:** `france-vat-1` at `8c0f7336`. No uncommitted changes under data/compare-*, docs/compare-*, lib/comparison-publish.ts or
  lib/data-import/.
- **Counts** (a rolled-back publish dry run; no change inside or after):

  | Country | Count | Counted |
  |---|---|---|
  | AL, BA, MK, MD | 1 each | Vitrina |
  | UZ | 1 | Delever |
  | IN | 1 | uEngage |
  | LK | 1 | POS Masters |
  | BD | 1 | Restora POS |
  | CL | **live** | Pedix · SumUp |

- **Currencies:** AL ALL · BA BAM · MK MKD · MD MDL · UZ UZS · IN INR · LK LKR · BD BDT · CL CLP.

## 3 · Per country

The evidence is in `docs/compare-research-5/agent-N/raw/<CC>.json`, with one commit per country.

| Country | New vendors tried | Verdict | Count now |
|---|---|---|---|
| AL | DISH, Restaumatic (don't sell in Albania), Subger (consumer guide); marketplaces and consumer apps | nothing new | 1 |
| BA | DISH, Restaumatic, FoodBooking.ba (no ordering ahead, no price), Shopwidget (25 € a month, a generic widget); regional tools priced in EUR | nothing new | 1 |
| MK | **Thinker POS** (Skopje; its food-truck page: customers "pre-order and pick up"; Standard 6 295 / Advanced 8 693 MKD a month incl. VAT) | eligible, but **its price is unclear**: no plan is shown to include online ordering (your Yabie rule). Its pages also carry text copied from another product ("Ecash") | 1 |
| MD | **HorecaSystems** (Moldovan; its own ordering site with a chosen time window, **delivery only**; 30 lei **a day**) | a per-day price → unclear (as always); no pickup wording | 1 |
| UZ | Zoomda (UZS, from 1 300 000 сум a month + a per-order fee) | not relevant: no pickup or ordering ahead | 1 |
| IN | **Dinehere** (dinehere.in; its own ordering app with delivery and pickup; «Students order ahead and skip the line.»; ₹500 a month + ₹5 000 one-off set-up) | eligible | **2 ✅ live** |
| LK | Option4 (till only), Deonde (403 again) | nothing new | 1 |
| BD | RestroGreen (pickup pre-orders, but still no amounts), Deonde (403), Bhojon (a one-off licence in USD) | nothing new | 1 |
| CL | Toteat («Desde $179.900 /mes», but "Toteat Pickup" is a bare bullet; no own page shows ordering ahead); Justo («UF 2/mes + IVA», UF only, no pickup sentence); ~5 more angles (marketplaces, Tiendanube, a generic shop builder, directories) | nothing new | live (Pedix · SumUp) |

## 4 · CL and Fudo

**CL:**
- **Line-up before → after:** Pedix · SumUp → **Pedix · SumUp** (unchanged).
- No real CLP tool was found to replace SumUp's fallback:
  - Toteat has CLP prices but no ordering-ahead quote;
  - Justo prices only in UF, which is unclear.

**Fudo** (`docs/compare-research-5/agent-3/raw/fudo.json`): **neither fu.do/es-ar nor fu.do/es-cl has the CO wording** («Necesitas una
cuenta activa en Fudo y sumar el módulo Tu Delivery a tu plan.»).
- Both FAQs say only «Solo necesitás/necesitas una cuenta activa en Fudo.»
- Neither country has a free plan, only a free trial, so whether that "active account" must be paid is borderline.

| | What the page says | What happens |
|---|---|---|
| **AR** | «No tiene abono mensual: solo pagás cuando vendés.»; 1,9 % + IVA per sale, capped at $99.000 + IVA a month (with Fudo Pagos). Plan Inicial $23.900 /mes would be the base if one were required | **stays as it is** (your rule). Line-up before → after: Fudo · Ojapo → **Fudo · Ojapo** |
| **CL** | no "no monthly fee" sentence; 1,9 % + IVA per sale, first 25 sales free. Plan Inicial $25.500 /mes sin IVA would be the base | **stays unclear**. Line-up: Pedix · SumUp (unchanged) |

The "Delivery Apps" module (AR $19.500, CL $9.500) connects third-party delivery apps. It isn't Tu Delivery.

## 5 · Build and load

**`docs/compare-research-5/build.cjs`** is a copy of compare-research-4's, with every review rule kept. Additions:
- Thinker POS MK is unclear (the Yabie rule);
- **`KEEP_STORED_FOCUS` gains RestroGreen** besides Fudo. The first dry run showed the research would have flipped its stored focus
  from food truck to restaurant. It isn't counted anywhere.

**The data file** `data/compare-research-5/competitors.json`:
- 4 competitors (HorecaSystems, Thinker POS, Dinehere new; RestroGreen stored), 5 plans, 4 entries;
- passes `researchProblems` (each competitor once; the database's unique rules) and the 100× check;
- **registered tenth**.

**No migration:** nothing already imported needed correcting.

| Step | Result |
|---|---|
| import dry run (rolled back) | +3 competitors, +5 plans, +3 entries, +42 answers; after the rollback: no change |
| real import | the same; `data_imports` 15 → 16 |
| publish dry run (rolled back) | 58 → 59 (IN); after the rollback: no change |
| real publish | 59 live; events +2; site refresh answered 200 |
| verify (read-only) | 59 live; shown = marked in all; AE false/false; 0 of 754 over the ceiling; 0 pending, 0 duplicate answers |

**SQL:**
- Every distinct statement is in `docs/compare-research-5/sql.txt`, and each was shown in chat.
- That covers the Part A and Step 0 reads, and the import's and publish's statements as their entry points printed them.

## 6 · Live list

- **Before (58):** AR AT AU BE BG BR CA CH CL CY CZ DE DK EC EE EG ES FI FR GB GI GR HK HR HU ID IE IT JP KW LI LT LU LV MA MV MY NG NL NO NZ
  OM PA PL PR PT RO SA SE SG SI SK TH TR TW UA US ZA.
- **After (59):** the same plus **IN** (Dinehere · uEngage).

## 7 · What needs you

1. **Thinker POS MK** is eligible, but no plan is shown to include online ordering, so it's unclear by your Yabie rule. With it, **MK
   would go live**. It needs a quote naming the plan, or your call.
2. **HorecaSystems MD:** delivery for a chosen time window (no pickup), priced per day.
   - It stays uncounted.
   - Should delivery-only ordering ahead ever count? Today's practice is pickup.
3. **Fudo AR / CL:** «Solo necesitás una cuenta activa en Fudo» with no free plan.
   - Should an "active account" count as needing a paid plan?
   - If yes: AR would be Plan Inicial $23.900 + the per-sale fee. CL would become countable as Plan Inicial $25.500 + the fee, which
     would replace SumUp in CL's line-up.
4. **CL** stays on SumUp's fallback until a real CLP tool shows ordering ahead. Toteat would count with one quote.
5. **Still one short:**
   - AL BA MK MD UZ LK BD (wave 3);
   - MT IS RS QA BH JO BO DO SV GT JM UY CO (waves 1–2);
   - KR at 0.

**Not done:** no push, no deploy, no workflow change, no `.env` file opened, no change to `country_settings.currency`, the manual
(Part B), customer-facing or landing-page code, nothing outside the competitor and comparison tables, nothing touching Pizzeria Gusto.

**Flags:** nothing arrived garbled, and no instruction contradicted another.

## Undo (only if you ask)

⛔ DO NOT RUN without your say-so.
- **Taking IN down:** Admin's per-country switch.
- **Reversing the import:** a migration deleting the rows created at the compare-research-5 import (`data_imports` row 16), after a
  rolled-back proof.
