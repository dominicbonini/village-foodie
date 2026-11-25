# manual-v16-40 + plan-names-1

**25 November 2026 · branch `france-vat-1` · commits `591f9a98` (manual), `ee2d855b` (migration `20261142`) · not pushed, not deployed**

Every SQL statement is in `docs/plan-names-1/sql.txt`. No `.env` file was opened. Only competitor and comparison tables changed. There
was no code change, no workflow change and no deploy.

## Summary

- **Part A:** the manual is now **V16.40**, the delta applied exactly. Section E matched the delta on every point.
- **Part B:** **90 plan names** shown on live comparison pages were renamed.
  - Each now uses the vendor's own plan name, or the vendor's name where the vendor names no plan.
  - Only `plan_name` changed, proven by md5.
  - **4 were left out**, because the new name already belongs to another current plan of that vendor in that country.
  - The publish changed nothing: 75 live, shown = marked, AE false/false.
- **Zyda now reads "Zyda: ‏٢٣٧٫٥٠ ر.ق.‏ شهريًا، تُدفع سنويًا"** (QA) and "Zyda: ‏١٥٫٨٣٣ د.ب.‏ شهريًا، تُدفع سنويًا" (BH).

---

## Part A · the manual (V16.39 → V16.40)

- **Version:** V16.40 was free. Both places now read 16.40 (header line 1 and `**Version 16.40**`); a grep shows they agree.
- **Changelog:** section A is at the top of `# Changelog`, word for word, followed by an **OBSERVED when applying** line.
- **Open items:** the heading is now `(V16.40, 25 November 2026)`.
  - **55:** the V16.39 plan's steps (1) and (2) are struck and marked "⛔ done V16.40". The V16.40 paragraph follows the plan.
  - **57 and 58:** the V16.39 text is struck line by line. Parts that were already struck aren't wrapped twice. The V16.40 text follows.
  - No second list was started.
- **§91:**
  - The Eligibility bullet's neighbour-fits sentence is replaced with section C's text.
  - The Competitor-check-settings bullet is added at the end of the list.
- **Committed:** `docs/reference-manual.md` only. `docs/checker-prep-1-report.md` was already committed (`421b4f53`), so it wasn't
  untracked. Other sessions' uncommitted files were left alone.

**Section E (read-only, 25 Nov):**

| Check | Observed | Delta expected |
|---|---|---|
| live | **75**, exactly section A's list | 75 ✅ |
| AE | false / false | ✅ |
| newest `data_imports` | `data/compare-territories-1/competitors.json`, ok, 16:22:59 UTC | ✅ |
| settings | commercial 90 · core 365 · secondary 365; deep_per_day 0; daily cap 3; monthly cap 90 | ✅ |
| `DATA_FILES` | 13 | 13 ✅ |

**Differences:** none. One note: the delta's "Not extended: FO, GL, MC, NC, PF, WF" is the delta's own wording. The checker-prep-1
report didn't list those territories, and the line was applied as written.

---

## Part B · plan names

### B.1 The sweep (read-only)

- **What was swept:** every current plan that is shown (`comparison_publish.shown`) or marked (an entry with `auto_verified_at`) on the 75
  live pages.
- **What was flagged:**
  - names with brackets, quotes, or the words from, lowest, plans, monthly, yearly, weekly, annual, per order or tier;
  - other helper wording, such as "own ordering app" or "single plan shown";
  - English on a page whose language isn't English, unless the vendor's own page uses that English name.
- **How each was checked:** against its stored evidence in `docs/compare-*/raw`. Where the quote held only a price, the vendor's own page
  was read **once** (49 pages, by plain HTTP; saved in the session scratchpad).

### B.2 Before → after (applied, 90 plans)

| Vendor | Countries (where it shows) | Before | After | Evidence |
|---|---|---|---|---|
| ared | LT | ared (one plan) | **ared** | names no plan ('Viena kaina') |
| Asila | MA | Asila (monthly) | **Asila** | names no plan ('Une seule formule') |
| Beau Camion | FR + AD BL GF GP MF MQ PM RE YT | Click & Collect (module) | **Click & Collect** | its pricing card "Click & Collect · 49€ par mois" |
| Bizzfo | ZA | Start (1 product, e.g. Online) | **Start** | "1 product (Start) · R450" |
| Dinehere | IN | Dinehere + own ordering app | **Dinehere** | names no plan for this price |
| DISH | HR | DISH Professional Order (12-month term) | **DISH Professional Order** | its page dish-professional-order (as CZ / SK) |
| Eatch | AD BL GF GP MF MQ PM RE YT | Standard (all-in-one: site, app, NF525 till, click & collect) | **Standard** | "tarif Standard à 89 € HT" |
| Eats365 | HK | QR code ordering (from) | **Eats365** | its blog's table row names no plan |
| Favrit | NO | Alt-i-ett kassesystem (from) | **Alt-i-ett kassesystem** | /pris card "Alt-i-ett kassesystem · Fra 899 kr/mnd" |
| Foodticket | NL | All-in (bestelsite + kassa + betaalsysteem) | **Foodticket** | names no plan ("voor €1,50 per dag") |
| FoxiFood | BE BG CY EE ES FI GR HR IE LT LU LV PT SI SK | FoxiFood (no monthly fee, per order) | **FoxiFood** | pricing page names no plan |
| FoxiFood | DE | Pay-per-Order (einziger Tarif) | **FoxiFood** | /de/preise names no plan |
| FoxiFood | AT | Pay-per-Order | **FoxiFood** | /de/ and /de/preise: no "Pay-per-Order" |
| GastroDok | DE | Bestellsystem (monatlich) | **Bestellsystem** | "Bestellsystem · 29 € / Monat" |
| GastroDok | AT | Bestellsystem Jährlich | **Bestellsystem** | "Jährlich" is the toggle label |
| HungryTrucks | NZ | Vendor (single plan shown) | **HungryTrucks** | names no plan |
| İletmen | TR | TekMenü (per order) | **İletmen** | its blog post names no plan |
| Klikit | ID TW MY SG TH | Core + Omni (webshop) / (webshop / QR ordering) | **Core + Omni** | quotes "Core + Omni: S$68", "Core + Omni is Rp958.000" |
| Linkin1 | SA | Linkin1 PRO (E-Menu) | **Linkin1 PRO** | quote "with Linkin1 PRO" |
| Menufy | PR | Menufy online ordering | **Menufy** | names no plan ("Menufy is $179 a month") |
| Moonrise | US | Pioneer (launch pricing) | **Pioneer Launch Pricing** | the page heading, exactly |
| Ordable | EG | Launch (Online Ordering) | **Launch** | "Launch · 28 000 EGP / year" |
| Ordable | KW | LaunchScale (Online Ordering) | **Launch** | "Launch · 250 KD / year" |
| Ordable | BH OM QA SA | Online Ordering Basic | **Basic** | each country page: "Basic · 199 BD / 200 OMR / 3 000 QAR / 3 500 SAR a year" |
| Ordea | GI | Free (3% per order) | **Free** | as Ordea's GB / JE / GG / IM plan |
| Orderly | HU | Alapcsomag (base subscription) | **Alapcsomag** | "Alapcsomag, választható funkciók nélkül" |
| Place à emporter | FR + AD BL GF GP MF MQ PM RE YT | One-off installation (owned site) | **Place à emporter** | names no plan ("Un prix, payé une fois · 890 €") |
| Poster | UA | Starter + Poster Site add-on | **Starter + Poster Site** | "Starter … 600 ₴/міс." and the product "Poster Site" |
| QRM.hu | HU | Alapszolgáltatás (QR menu base) | **Alapcsomag** | "Ár · Alapcsomag · 3 900 Ft / hó" (the stored word wasn't the vendor's) |
| StandMágus / OnlineMágus | HU | SM Max (includes OnlineMágus alap) | **SM Max** | quote "SM Max 16 800 Ft-tól" |
| StoreHub | TH | แพ็คเกจเริ่มต้น (Starter) | **แพ็คเกจเริ่มต้น** | the Thai card |
| SumUp | LU | E-shop (Boutique en ligne) | **Boutique en ligne** | the fr-LU page's heading (as LV "Interneta veikals") |
| Tilby | IT SM VA | Food truck till (from) | **Tilby** | names no plan ("Tuo a partire da 35 €") |
| UpMenu | PL | Online ordering tier 1 | **Zamówienia online** | the card "Zamówienia online · 169 zł · 75 zamówień" |
| WEIQ | SE | Seasonal package | **säsongspaket** | "Med WEIQ:s säsongspaket…", lower case exactly as on the page |
| Wiiz Eat | CY | Online storefront | **Wiiz Eat** | Greek page names no plan |
| Yoveletta | LI | Food truck (from) | **Yoveletta** | the food-truck page names no plan ("einem Tarif ab CHF 29.–") |
| Zyda | BH QA | Zyda plans (lowest, 'from') | **Zyda** | names no plan ("Plans from … a year") |
| モバレジ (Mobaregi) | JP | Single plan | **モバレジ** | names no plan; see B.5 |
| どこでも注文くん (Chuzmonster) | JP | Flat | **Takeout** | own page: «Takeoutは固定料金なので…»; "Flat" translated 固定料金; see B.5 |

### B.3 Checked and kept (the vendor's own name)

- **SQV PT:** «Loja Online + App (Android & iOS)» is the vendor's exact card title.
- **Restomax BE:** "Table Menu".
- **Names the vendor's own page uses, even though the page's language isn't English:** Frivo PL "Starter"; Menuto BG "Pro"; Qromo IT / SM /
  VA "Pro"; OlaClick EC "Advanced"; Truckly DK "1 food truck"; MenuForma RO "Regular"; Payli BE "Webshop"; Superb NO "Go".
- **English names taken from the English version of the vendor's own country page (its stored source):** Spevdo, NemTakeAway, ESB Order,
  Vitrina, inyad, Actib, DISH CZ / SK, Take App, Foodics, Zyda KW, Dinlr, Oddle HK.
  - Oddle's HK page returned 403 today, so its stored name was kept.
- **Liefersoft "STARTUP":** its page loads by script; the stored evidence was kept.
- **Fudo AR / CL** «Plan Inicial + Tu Delivery»: both parts are the vendor's own names (Dominic's earlier decision).

### B.4 Left out (4 plans): flagged for Dominic

In each case, the vendor's own name **is already the name of another current plan of the same vendor in the same country**. Two current
plans of one name would make the importer's name match ambiguous. Changing the other plan is outside "the name column of the listed ids".

| Country | Still shown | Would be | The other current plan already named so |
|---|---|---|---|
| FR | Eatch · Standard (all-in-one: site, app, NF525 till, click & collect) | Standard | `55830fe1` "Standard", counted, 89 € |
| GB | Perkss · Essential (weekly billing) | Essential | `15fc6aed` "Essential", counted, unclear |
| ES | pidopago · pidopago (annual) | pidopago | `e935f5d5` "pidopago", counted, 30.42 € |
| CH | Yoveletta · Gastro (yearly) | Gastro | `e73d75dd` "Gastro", counted, unclear |

Each needs a decision: supersede the duplicate first, then rename. Grafterr GB already has three current plans named "Free forever"; this
work didn't cause or touch that.

### B.5 Decisions taken conservatively

- **Where the vendor names no plan, the vendor's own name is used** (Zyda, FoxiFood, Tilby…), never a made-up label.
- **Mobaregi:** the stored display name «モバレジ (Mobaregi, EDDYS FACTORY)» itself carries English in brackets. I used **«モバレジ»**, the
  name as its own page writes it, so that the helper text wouldn't come back.
  - Vendor display names were outside this part's scope. Chuzmonster's «どこでも注文くん (Chuzmonster)» and Nomad's "Nomad
    (nomadcaisse.fr)" are the same kind of thing and weren't changed.
- **Chuzmonster:** renamed to its own page's plan name "Takeout".
  - ⚠️ Its stored price comes from a third-party article (lme.jp), not its own site. That is an eligibility question for Dominic, not
    changed here.
- **WEIQ:** the exact lower-case «säsongspaket» was kept rather than capitalising it.
- **SumUp LU:** «Boutique en ligne» (the page's heading) was chosen over «E-shop» (its menu label), matching the LV precedent.
- **Moonrise:** "Pioneer Launch Pricing" is the page's heading, word for word.
- **Only shown or marked plans were renamed, as the prompt says.** Unshown copies keep their old names. For example: Perkss JE / GG / IM,
  pidopago AD, Zyda EG / OM / SA, and FoxiFood's other countries.
- **Future research builds:** the importer matches plans by name. The `stored-plans.json` copy chain must be refreshed from the database
  before the next build. Otherwise an old name in a data file would be inserted as a new plan.

### B.6 How the renames were applied

- **The importer's corrected-plans route can't rename.** `correct: true` supersedes the current plan *of the same name* and inserts a new
  row (`lib/data-import/research.ts` lines 36 and 395), which gives a new id. So I used a migration.
- **The migration: `supabase/migrations/20261142_plan_names_1.sql`** (committed `ee2d855b`).
  - It holds a map of competitor id prefix, country, old name and new name.
  - It resolves only current plans that are shown or marked on a live page.
  - Its guards:
    - each prefix names exactly one competitor;
    - exactly 90 plans are listed;
    - every map row matches;
    - all 90 are renamed;
    - the **md5 of every plan's other columns** (`to_jsonb(p) - 'plan_name'`) is unchanged;
    - the **md5 of every unlisted plan's name** is unchanged;
    - no renamed plan shares a name with another current plan of its vendor and country.
  - There are no triggers on `competitor_plans`.
- **Pre-flight 1** (`compare-db-proofs.cjs --preflight`, rolled back) was **refused by its own guard**: "5 competitor / country pairs now
  have two current plans of one name". That was the 4 collisions plus Grafterr's older duplicate. The 4 were left out and the guard was
  narrowed to new duplicates only.
- **Pre-flight 2 passed:**
  - "90 renamed; other columns md5 b080b670… = b080b670…; other plans' names md5 8d9859a8… = 8d9859a8…";
  - counts unchanged;
  - after the ROLLBACK, everything exactly as before.
- **Applied** with `scripts/db-migrate.cjs`: the same notice, one transaction, revalidate 200.

### B.7 Publish and verify

- **Publish dry run (rolled back):** "inside the transaction: no change"; 75 would be live; the tables after the rollback were unchanged.
- **Publish:** "no change"; 75 live; revalidate 200.
- **Verify (read-only):**
  - 75 live;
  - shown ≠ marked: **0**;
  - AE **false/false**;
  - of the shown and marked names, the only ones still with brackets or helper words are the 4 in B.4, plus SQV's own name.

### B.8 Zyda's wording as now shown (live pages, read once)

| Page | The pricing row |
|---|---|
| QA | «Zyda · **Zyda: ‏٢٣٧٫٥٠ ر.ق.‏ شهريًا، تُدفع سنويًا**» (Ordable: «Basic: ‏٢٥٠ ر.ق.‏ شهريًا، تُدفع سنويًا») |
| BH | «Zyda · **Zyda: ‏١٥٫٨٣٣ د.ب.‏ شهريًا، تُدفع سنويًا**» |

The old English name is gone from both pages, and "billed yearly" (تُدفع سنويًا) shows. **"From" is still missing** (not part of this work).

### B.9 Other "from" prices with the same gap

Yes, they have the same gap. The competitor price cell has no "from" wording. The only "from {plan}" string (`cell.fromPlan`) is used for
HatchGrab's own feature cells.

The other "from" prices on live pages, going by the stored quotes, all show the price without "from":

| Vendor | Country | Stored quote |
|---|---|---|
| Oddle | HK, SG | "From S$300/mo" |
| Eats365 | HK | "From HK$1200/month" |
| Favrit | NO | «Fra 899» |
| Tilby | IT, SM, VA | «a partire da 35 €» |
| StandMágus | HU | «16 800 Ft-tól» |
| Yoveletta | LI, CH | «ab CHF 29.–», «ab Fr. 49.–» |
| ESB Order | ID | "Start from" |
| inyad | MA | "From 149dh" |
| Actib | PA | "From $49" |
| Linkin1 | SA | "from SAR 59" |

⚠️ **Favrit, Tilby, Eats365 and Yoveletta LI** carried "(from)" in their plan names, and that was the only place "from" reached the page.
The renames removed it, as instructed. A query to list every "from" note was refused by a Supabase MCP 502 and wasn't retried, so the
list may be incomplete.

---

## Flags

- Nothing in the prompt arrived garbled. No instruction contradicted another: the 4 collisions were left out under the "only the name
  column of the listed ids" limit, not by choosing between instructions.
- The first pre-flight was refused, by design.
- No push, no deploy, no workflow change, no code change.
- This report and `docs/plan-names-1/sql.txt` are committed after the migration.

## Undo (only if Dominic asks)

```sql
-- as a committed migration via scripts/db-migrate.cjs: set each of the 90 plans' plan_name back to the "Before" column of B.2,
-- e.g. update public.competitor_plans p set plan_name = 'Zyda plans (lowest, ''from'')'
--        where left(p.competitor_id::text,8) = '797df612' and p.country_code in ('BH','QA') and p.plan_name = 'Zyda' and p.superseded_at is null;
-- (the full map is in supabase/migrations/20261142_plan_names_1.sql, old_name ↔ new_name, with Eatch FR excluded)
```
