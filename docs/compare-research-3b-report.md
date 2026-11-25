# compare-research-3b: your answers to compare-research-3 §6

**25 November 2026 · branch `france-vat-1` · commit `0d7e228a` (plus agent 4's one-per-task commits) · not pushed, not deployed**

## 0 · The short version

- **Live: 55 → 56.** UA is back, showing Poster (1 360 ₴ a month) and Vitrina. No country left.
- **The 6 answers, as applied:**

| # | Your answer | What the own sites show (agent 4, one request at a time) | What changed |
|---|---|---|---|
| 1 | Poster: monthly-billing price, with a "billed yearly" note | **UA** (joinposter.com/ua/pricing): Business «1 530 ₴1 700 ₴/міс.»; Starter «540 ₴600 ₴/міс.»; the Poster Site add-on «Вартість — 760 ₴/міс.» (one figure). **KZ** (joinposter.kz/pricing): Starter «8 640 ₸9 600 ₸/мес.»; Mini «15 660 ₸17 400 ₸/мес.»; add-on «Стоимость — 11 400 ₸/мес.» | **UA:** Business **1 700 ₴**, note "1 530 ₴ a month if billed yearly". "Starter + Poster Site add-on" **1 360 ₴** (600 + 760), note "Starter 540 ₴ if billed yearly"; it is the shown plan, no longer unclear. **KZ:** Starter + add-on **21 000 ₸** (9 600 + 11 400); Mini 17 400 ₸. The old rows are kept as history |
| 2 | Restorant NG: keep only if it sells ordering software | «Restorant gives you a branded storefront, online ordering with Paystack and a full workspace» (restorant.com.ng); it also runs a marketplace | **kept**; NG still live (Mylo · Restorant) |
| 3 | read the terms of Yoveletta, Rent-a-Shop, Ordea | none limits service to Switzerland or the UK, and none names Liechtenstein or Gibraltar; only governing-law clauses (Swiss law; "the laws of England and Wales"). Rent-a-Shop's terms are a PDF, so the agent read the extracted text | **neighbour fits kept**; GI and LI still live |
| 4 | Toss Place KR: the pickup-order fee from its own site | the newest own page (tossplace.com/story/pickup_order, 8 Apr 2025) offers pickup orders with «주문 수수료 0원으로 써보기» ("try it with a 0 won order fee"), with no end date. The 2024 launch story planned 3.5 % excl. VAT after end-2024. No page states the fee in force today | **no change**; KR not live (one tool), the evidence is recorded |
| 5 | OlaClick SV: "América Latina" isn't presence | — | **no change**; SV not live |
| 6 | Resto-SaaS MU: a live product with a price? | prices («1 800 MUR + VAT», 4 400) appear only on resto-saas-production-a095.up.railway.app; its own domain resto-saas.mu does not resolve (ENOTFOUND); mock-ups, unverified testimonials | **not relevant** (`set_lifecycle`); MU has none |

## 1 · Two readings you should know about

- ⚠️ **"Starter + Poster Site add-on":**
  - compare-research-2 had stored this plan at 540 ₴, which was Starter alone, billed yearly, under a name that includes the add-on.
  - Its monthly-billing price is therefore Starter 600 ₴ + Poster Site 760 ₴ = **1 360 ₴**, with both figures quoted from the same page.
  - Storing 600 ₴ under that name would understate it.
  - KZ is done the same way.
- ⚠️ **The Poster Site add-on on its own stays unclear** (760 ₴ UA, and the KZ add-on in the file).
  - You wrote "take them out of unclear". This plan has no yearly-toggle doubt, but it is an add-on that needs a POS plan, so it isn't a
    whole monthly price.
  - Counted, it would become Poster's shown price (760 ₴).
  - Say if you want it counted anyway.
  - The KZ add-on row already in the database (11 400 ₸) isn't marked unclear. It can't count in KZ anyway (next point).
- **KZ stays at 0:** Poster's KZ prices are on joinposter.kz, outside its stored domain (joinposter.com), so the own-site rule refuses
  them. Even counted, KZ would have only this one tool. It's the same kind of fix as Oddle's, if you want it later.
- **The Poster KZ food quote** («Автоматизация фудтрака в Казахстане», joinposter.kz/business/foodtruck) is copied from compare-research-2,
  not re-read today.

## 2 · Live list

- **Before (55):** AR AT AU BE BG BR CA CH CL CY CZ DE DK EC EE EG ES FI FR GB GI GR HK HR HU ID IE IT JP KW LI LT LU LV MA MV MY NG NL NO NZ
  OM PA PL PR PT RO SE SG SI SK TH TR TW US.
- **After (56):** the same plus **UA**.

## 3 · Load and publish

| Step | Result |
|---|---|
| build (`docs/compare-research-3/build.cjs`) | 20 competitors, 34 plans (31 priced), 23 entries; 1 not relevant, 4 plans corrected; passes `researchProblems` (each competitor once, the database's unique rules) and the 100× check |
| import dry run (rolled back) | active competitors −1, plans +4 (4 corrected); after the rollback: no change |
| real import | the same; `data_imports` 13 → 14 |
| publish dry run (rolled back) | 55 → 56 (UA); after the rollback: no change |
| real publish | 56 live, events +3; site refresh answered 200 |

**Verified read-only (MCP):**
- 56 live, and in each of them the shown competitors are the marked ones;
- AE false/false;
- 0 of 751 current priced plans over the plausible ceiling;
- no pending answers;
- Resto-SaaS `not_relevant`;
- Poster UA: Business 1 700 ₴ and Starter + add-on 1 360 ₴ (marked, shown), both not unclear; the add-on 760 ₴ unclear.

**SQL:**
- shown in chat;
- every distinct statement is in `docs/compare-research-3/sql-3b.txt`;
- new this round: the `competitors` lifecycle/notes update (Resto-SaaS), and the `competitor_plans` supersede of the 4 corrected Poster
  plans.

**Build changes** (`docs/compare-research-3/build.cjs`):
- agent 4's folder is read;
- `PLAN_TOTAL` (Poster's Starter + add-on);
- `REVIEW_NOT_RELEVANT` (Resto-SaaS);
- Poster's add-on and KZ Mini are marked unclear;
- the review rules also match a plan's own page host;
- the KZ "incomplete" exclusion now applies only to agent 1's row.

## 4 · Still open

1. **The Poster Site add-on:** keep it unclear, or count it (§1).
2. **KZ:** add joinposter.kz to Poster's check pages? It wouldn't make KZ live alone.
3. **Toss Place KR:** the fee in force is unclear (0 won "try" against the planned 3.5 % + VAT).

**Not done:** no push, no deploy, no workflow change, no `.env` file opened, nothing outside the competitor and comparison tables, nothing
touching Pizzeria Gusto.

**Flags:** nothing arrived garbled. No instruction contradicted another; the two readings in §1 are flagged above.

## Undo (only if you ask)

⛔ DO NOT RUN without your say-so.
- **Poster:** the superseded plans are kept. Make them current again and supersede the 4 new ones (a migration).
- **Resto-SaaS:** a `set_lifecycle` back to active.
- **UA:** Admin's per-country switch.
