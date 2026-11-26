# compare-square-1

**26 November 2026 · branch `france-vat-1` · commit `5135f4e3` · migration `20261145` applied · not pushed, not deployed**

Every SQL statement is in `docs/compare-square-1/sql.txt`. The Competitor check stays disabled. No `.env` file was opened. Vendors' own
sites only, one request at a time. There was no page, Admin screen, workflow or manual change.

## Summary

- **The new rule:**
  - a country is live with **1** eligible priced tool;
  - food-truck tools are ranked **class A → class B → the rest**;
  - **Square always takes the 4th slot** wherever it is eligible and priced;
  - at most 4 shown; AE never; Admin wins.
- **Square** is now stored and shown in all **8 countries it sells in**.
- **What The Truck** shows in GB, with its own price.
- **Live: 74 → 96** (+22, none dropped). All 7 comparison harnesses pass.
- **Hatches Up's own website wasn't found** (one search). It still can't be shown.

---

## 1 · The rule (`lib/comparison-publish.ts`) and the harnesses

### Diff

- `MIN_SHOWN = 1`. Live needs `shown.length >= MIN_SHOWN`, which was 2. The reason reads "1 competitor shown", or "no eligible
  competitor with a price (1 needed)".
- **Ranking.** The food-truck pool is split into **class A**, then **class B**, then unclassed tools with a food-truck focus. Each group
  keeps the usual selection order (pinned, verified, category, features, sort, name).
  - A class A or B tool counts as a food-truck tool even when its focus is restaurant.
  - Restaurant and till tools still only **make up 2**.
  - SumUp is still only the single fallback beside one other tool.
  - Anolla is never shown, AE is never live, and Admin's off switch and hide still win.
- **Square.** `ALWAYS_SHOWN_DOMAINS = ['squareup.com']`. When Square is publishable and not hidden, its slot is reserved first and it is
  shown **last**.
  - The food-truck groups fill up to 4 − 1 places, so Square pushes out the lowest-ranked tool.
  - Square **counts towards the 2** restaurant tools make up, and towards SumUp's single-fallback test.
- **Option 1 (your decision, 26 Nov)** added one line in each of two files outside the original limits:
  - `lib/pricing-check.ts`: the optional field `foodTruckClass?: 'A' | 'B' | null` on `Competitor`;
  - `lib/admin/pricing-check-actions.ts`: the column-map entry `foodTruckClass → food_truck_class`.

  So the publish now loads the class. Nothing else in those files changed, and no page, Admin screen or UI file reads the field. The
  harness checks all of this.
  - ⚠️ The Admin store selects `COLUMNS.competitors`, which now includes `food_truck_class`, so the deployed code needs migration 20261145.
    It is applied already.
- **Other files changed:**
  - `lib/data-import/importer.ts`: the data file registered fourteenth;
  - `scripts/compare-db-proofs.cjs`: a new `--preflight-square` mode;
  - the harnesses below.

### Harnesses (all run after the publish)

| Harness | Result | What changed |
|---|---|---|
| **compare-square-1** (new, registered) | **27 / 0** | see the test list below |
| compare-fix-1 | **65 / 0** | 7 checks that used "1 left → not live" as a proxy now check that the left-out tool isn't shown; "LIVE needs 2" → "LIVE needs 1" |
| compare-autopublish-1 | **75 / 0** | the take-down test: GB now stays live on the 1 left |
| compare-fix-2 | 79 / 0 | — |
| compare-suits-1 | 72 / 0 | — |
| checker-prep-1 | 18 / 0 | — |
| competitor-check-1 | 227 / 0 | — |

`npx tsc --noEmit` reports 0 errors.

compare-square-1's tests:

- live with 1, and not live with none;
- AE never live, adminOff and auto-publish off win, a SumUp-only country stays off;
- the A → B → unclassed order, and the restaurant make-up-2 rule;
- Square pushes out the lowest-ranked tool and says so in the reason;
- Square plus 1 tool, Square plus 1 restaurant tool, and Square alone;
- Square plus SumUp: SumUp drops;
- Admin's hide beats Square, and a Square plan in the wrong currency keeps it out;
- the class reaches the publish (competitorOut A / B / null, the competitors select, the Postgres store);
- the two outside files gained only the field and the map entry;
- no `app/` or `components/` file reads or changed it.

---

## 2 · Square (squareup.com, its own country pages, read 26 Nov)

Its own country selector lists 8 countries: **US, CA, GB, IE, AU, JP, FR, ES**. In each, I read `/online-store/plans` (plans, the online
rate, pickup) and `/pricing` (the in-person rate) once. The US plans page carries both of its rates.

| CC | Pickup quote (eligibility, `ahead` partial) | Free plan | Paid plan (stored) | Online | In person |
|---|---|---|---|---|---|
| US | "Pickup, local delivery, and shipping" | Square Free $0 | **Square Plus $49/mo per location** (billing period not stated) | 3.3% + 30¢ (Plus 2.9% + 30¢) | 2.6% + 15¢ (Plus 2.5% + 15¢) |
| CA | "Offer in-person and curbside pickup, global shipping and delivery by your own staff." | Free $0 | Plus $36/mo, **billed annually** | 2.8% + $0.30 | 2.5% (credit) |
| GB | "Offer click and collect, global shipping and delivery by your own staff." | Free £0 | Plus £20/mo, **billed annually** | 1.4% + 25p (UK card) | 1.75% (UK cards) |
| IE | same as GB | Free €0 | Plus €25/mo, **billed annually** | 1.4% + 25c + VAT | 1.75% + VAT |
| AU | "Offer in-person and kerbside pickup, global shipping and delivery by your own staff." | Free $0 (new) | the stored Square Online Plus $40 kept (today's page shows $36, billed annually) | 2.2% | 1.6% |
| JP | «店舗での受け取り、デリバリー» | フリー ¥0 | **プラス ¥3,780/月, monthly billing** (¥3,375 billed yearly) | 3.6% | 2.5% |
| FR | «Retrait, livraison locale et expédition» | Gratuit 0 € | Plus 25 € HT/mois, **billed annually** | 1,4 % + 0,25 € | from 1,65 % |
| ES | «Opciones de recogida, entrega a domicilio o envío de pedidos» | Gratuito 0 € | Plus 25 € + IVA al mes, **billed annually** | 1,4 % + 0,25 € | 1,25 % + 0,05 € |

**How it is stored:**

- **Prices** (16 plans, from the data file):
  - Square's rate is its own **bundled card fee**: `card_mode` 'bundled', with `card_bps` / `card_fixed_minor` set to the online rate.
  - **Never a per-order fee** (the build refuses one).
  - Where only a billed-annually price is shown, the Plus plan carries `yearly_only` (the §91 yearly-only rule).
- **Per-country answers** (migration):
  - **ahead** (the quote above);
  - **monthly** (the Free quote, with Plus in the note);
  - **cardfee** (the online rate and the in-person rate).
- **Features read once, from the GB page** (US wording in a note), written for every country:

  | Feature | Answer | Quote / note |
  |---|---|---|
  | preorder | partial | "…letting them order items in advance for a specific date and time in the future." (Plus) |
  | domain | partial | Plus / Premium |
  | notify | partial | order-status texts, Plus / Premium |
  | delivery | yes | — |
  | paymethods | yes | — |

  Nothing about card readers or tills at the hatch was written.
- **The US page clearly differs.** It sells Square's own plans per location (Square Free / Square Plus, with POS), not the Square Online
  Free / Plus / Premium tiers of the other countries.

---

## 3 · What The Truck and Hatches Up (stored rows)

**What The Truck** (`3f0b6c2e`: active · food_truck · whatthetruck.ai · class **A** · GB entry):

| | |
|---|---|
| New plan | **"What The Truck"**, £0 a month, `truck_fee_bps` 395 (online, new accounts, + VAT), `card_mode` bundled, VAT excl, counted, from whatthetruck.ai/pricing |
| In the plan's note | the online tiers 3.25–3.95%; in person 1.25% for new accounts (0.80–1.25%); the VAT line; the offer and the terms quotes below |
| Shown plan | the GB entry now points at the new plan. The old "No monthly fee (fee per payment)" plan stays stored, unclear. |
| cardfee | answer replaced: **yes**, "included on its own payment provider"; quote «100% of every sale paid with a UK personal card is yours, with nothing deducted. … The offer for free in-person card rates for the first month is subject to the use of our card terminal and payment provider.»; note: terms §6, provider fees «are set by them» |
| Eligibility | its stored pre-order answer: «Customers order and pay from your page on their phone, and pick a time to collect.» (whatthetruck.ai/features/festivals). Also on /pricing: «Your own ordering page, pre-orders with collection slots…» |

**Hatches Up** (`fbbf6c37`: active · food_truck · class **A**):

- **One search** ("Hatches Up" food truck ordering app UK) found **no site of its own**. The results were other apps.
- So `website` and `check_urls` stay empty, and its price stays as stored: "Online ordering" £0, counted, with no source.
- **It can't be shown** (no website), and the Competitor check can't check it.

**Chuzmonster:** website `lme.jp` → **`https://order.yapp.li`**; check_urls → `https://order.yapp.li/takeout`; a note added.

**Classes:** stored as A 16 / B 34. That is the audit's 2b table, plus Eventifood, Hatches Up and What The Truck as A.

---

## 4 · Load and publish

- **Build** (`docs/compare-square-1/build.cjs` → `data/compare-square-1/competitors.json`, registered fourteenth):
  - stored plan names and entries refreshed from the database first (`stored.json`);
  - 2 competitors, 16 plans, 7 new entries;
  - researchProblems, the unique rules (each competitor once, one plan name per country, no clash with a stored name) and the 100× check
    all pass.
- **Import dry run (rolled back):** plans +16, entries +7, answers +5 (2 bare answers replaced). No competitor row changed, so nothing
  unasked.
- **Import:** the same; `data_imports` 25 → 26.
- **Migration `20261145`:**
  - `--preflight-square` (rolled back) passed: counts unchanged, every plan row unchanged (md5), answers +24 exactly, classes A 16 / B 34,
    and after the ROLLBACK everything as before with no column;
  - then applied with db-migrate.
- **Publish dry run (rolled back):** live 74 → 96. **No live country would stop being live**, so I published.
- **Publish:** live 74 → 96; events +39; marked 210 → 212; revalidate 200.
- **Verify (read-only):**
  - **96 live**;
  - shown ≠ marked **0**;
  - AE **false/false**;
  - **0 of 920** priced plans over the ceiling;
  - Square shown in AU CA ES FR GB IE JP US.

### Live list (74 → 96)

**New (22):** AL AX BA BD BO CO DO GU IS JM JO **JP** KZ LK MD MK MT RS SV UY UZ VI.

| New country | Shown |
|---|---|
| JP | モバレジ · Square |
| AL BA IS MD MK RS | Vitrina |
| AX | Food4you |
| BD | Restora POS |
| BO | Mezzita |
| CO | Fudo |
| DO | Gestióndo |
| GU, VI | Menufy |
| JM | Ezy Cart |
| JO | Ordable |
| KZ | Poster |
| LK | POS Masters |
| MT | FoxiFood |
| SV, UY | Pedix |
| UZ | Delever |

**Now (96):** AD AL AR AT AU AX BA BD BE BG BH BL BO BR CA CH CL CO CY CZ DE DK DO EC EE EG ES FI FR GB GF GG GI GP GR GU HK HR HU ID IE IM IN
IS IT JE JM JO JP KW KZ LI LK LT LU LV MA MD MF MK MQ MT MV MY NG NL NO NZ OM PA PL PM PR PT QA RE RO RS SA SE SG SI SK SM SV TH TR TW UA US
UY UZ VA VI YT ZA.

### Line-up changes in countries already live

| CC | Before | After |
|---|---|---|
| **GB** | Ordea · Order Tiger · Perkss · Grafterr | **Ordea · What The Truck · Eventifood · Square** |
| FR | Nomad · Place à emporter · Beau Camion · Eatch | Nomad · Place à emporter · Beau Camion · **Square** (Eatch, class A, pushed out) |
| US | Goodfynd · Where's The Foodtruck · Food Truck Pub · Moonrise | Goodfynd · Where's The Foodtruck · Food Truck Pub · **Square** (Moonrise, class A, pushed out) |
| IE | Order Tiger · Click & Collection · FoxiFood | + **Square** |
| CA | iShopo · Owner.com | iShopo · **Square** |
| ES | FoxiFood · pidopago | FoxiFood · **Square** |
| BR | VexMenu · Food Pronto | Food Pronto · VexMenu (order only: class A first) |

AU is unchanged (Y wait · Square), now on Square's new Free plan.

**GB as shown: Ordea · What The Truck · Eventifood · Square.** Order Tiger, Perkss and Grafterr (class B) are out. Hatches Up isn't shown
because it has no website.

---

## 5 · What needs you

1. **Hatches Up's website.** One search found nothing. Send its URL and I'll set website and check_urls, and its price from its own site.
   It is class A and would rank first in GB.
2. **Square pushes out class A tools:**
   - **Eatch in FR**, **Moonrise in US**, and in GB three class B tools.
   - France's territories (AD BL GF GP MF MQ PM RE YT) keep all four, because Square doesn't sell there.

   That is the rule as written. Say if Square should only take the 4th slot from a class B or restaurant tool.
3. **22 single-tool pages went live.** Many show one restaurant tool: Vitrina in AL BA IS MD MK RS, Ordable JO, Delever UZ, POS Masters LK,
   Pedix SV / UY. That follows decision 1a. Foodtruck-audit-1's S2 would not keep them.
4. **Square prices:**
   - in 6 countries only a billed-annually Plus price is shown (stored `yearly_only`);
   - the US Plus billing period isn't stated;
   - AU keeps its stored Square Online Plus $40 and the two Square for Restaurants plans, which carry the 2.2% as a per-order fee. They
     aren't shown now (AU shows the new Free plan), but they are stored.
5. **Square's older every-country answers** came from the AU pages. offline, walkup, kds and vans describe tills. I left them alone, and
   your instruction says nothing about tills goes in the features. Say if they should be cleared.
6. **Before the deploy:** the new rule runs only through the local publish (`scripts/comparison-publish/main.ts`). If the Competitor check
   ran from GitHub `main` on the old code, it would apply the old "2 needed" rule and take the 22 new pages down. It stays disabled until
   the batch deploy, so it can't happen now.

## Flags

- Nothing in the prompt arrived garbled.
- The one contradiction (the class column vs the file limits) was asked about and resolved as Option 1.
- The preflight's word guard refused the column comment's "food trucks"; it now reads "food-truck vendors".
- No push, no deploy, no workflow change.
- This report and `sql.txt` are committed after the publish.

## Undo (only if Dominic asks)

```sql
-- as committed migrations via scripts/db-migrate.cjs, then a publish run of the reverted code:
-- git revert 5135f4e3 (rule, data file registration, harnesses);
update public.comparison_entries set primary_plan_id = '838091e0-5442-55e8-931b-2c7fd03ceb24' where id = '5b395f46-11d1-5ee1-b1e5-b1e8b55bb176';
update public.comparison_entries set primary_plan_id = 'b7e41d58-2c9f-4e06-8a3d-91c5f0e2b647' where id = 'ac889d5d-eda0-4fa6-a1e1-f1f190b5ca77';
update public.competitor_feature_values set superseded_at = now() where competitor_id = '9acae7b6-2af6-4800-93ee-0be972e22314' and checked_on = '2026-11-26' and country_code is not null and superseded_at is null;
update public.competitors set website = 'https://lme.jp', check_urls = array['https://lme.jp'] where left(id::text, 8) = 'da91c9a7';
alter table public.competitors drop column food_truck_class;
```
