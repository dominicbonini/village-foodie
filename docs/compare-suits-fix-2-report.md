# compare-suits-fix-2: the new "Which system suits whom?" guide (26 Nov 2026)

## 1 · Summary

- **The new guide** (your UK wording and mockup) is built and committed on france-vat-1 (`9ca5b402` migration, `97d47768` code). It goes live with your next batch deploy. Nothing was pushed or deployed.
- **Where it shows:**
  - **the 19 English-locale live countries** get the country-specific guide: two lists side by side (✓ suits you / ⓘ may not suit you) and a "Delivery apps" card below;
  - **the 77 other live countries show no guide** (and none in their .md twin) until a native-speaker check;
  - **the tills and card machines card is gone everywhere**, along with the app clause and Germany's TSE, delivery and Wolt / Lieferando facts.
- **Data:** the new table `comparison_country_copy` (migration `20261148`, pre-flighted then applied) holds 96 rows. It does nothing until the code ships.
- **Checks:**
  - new harness **compare-suits-fix-2: 23 / 0**;
  - every comparison harness passes, except compare-de-1-screens' 2 failures, which also fail on the commit before this work (§5);
  - `tsc` 0 errors;
  - local renders of GB, US, AU, IE, GU and FR as expected (§6).

## 2 · The migration (`supabase/migrations/20261148_compare_suits_fix_2.sql`)

**The table:** `public.comparison_country_copy`.

| Column | Type |
|---|---|
| `country_code` | text, primary key, two capitals |
| `fit_off` | boolean not null default false |
| `delivery_apps` | text[] |
| `pay_methods_missing` | text |
| `collect_word` | text, check in ('collection', 'pickup') |
| `created_at`, `updated_at` | timestamps |

It has RLS on with no policies (service role only), like the other comparison tables.

**The country lists** are written into the migration, because the general pre-flight refuses any SQL naming `country_settings`. They come from the read-only locale query in sql.txt §1. The migration guards that:

- the two lists together are **exactly** today's 96 live countries;
- 19 + 77, one row per live country;
- apps are named only for GB and IE.

The pre-flight ran inside a rolled-back transaction: the guards passed, and every count and checksum was the same after. Then it was committed (`9ca5b402`) and applied.

**The rows, as read back:**

| fit_off | Countries |
|---|---|
| **false (19)** | **GB** Deliveroo / Uber Eats / Just Eat · PayPal or Klarna · collection; **IE** Deliveroo · PayPal or Klarna · collection; **US** PayPal or Venmo · pickup; **AU** PayPal or Afterpay · pickup; **GU**, **VI** PayPal · pickup; **CA GG GI IM IN JE JM MT MV NG NZ SG ZA** PayPal · collection |
| **true (77)** | AD AL AR AT AX BA BD BE BG BH BL BO BR CH CL CO CY CZ DE DK DO EC EE EG ES FI FR GF GP GR HK HR HU ID IS IT JO JP KW KZ LI LK LT LU LV MA MD MF MK MQ MY NL NO OM PA PL PM PR PT QA RE RO RS SA SE SI SK SM SV TH TR TW UA UY UZ VA YT |

No delivery rates are stored anywhere.

## 3 · Code and messages (a summary of the diff)

**`lib/comparison.ts`** (+79 / −35, with the other three code files below):

- **New `buildFit()`** (exported, pure): the guide for one country, or null when it's hidden.
  - **When it shows:** a row with `fit_off` false shows it, a row with `fit_off` true hides it, and a country with no row shows it only in an English locale. So a non-English country added later stays hidden until it gets a row and words.
  - **The lines:**
    - the four "suits you if" lines;
    - the delivery line;
    - the payment line by **`offersOnlineCardPayments(settings)`** (online → «pay with {pay_methods_missing}: …»; billed at the truck → «pay online when they order: in {country} …»);
    - the delivery card, named («Apps like {apps} …», joined with the locale's list format) or not («Delivery apps can …»);
    - `choose_when`'s «{name} fits if …» lines, kept.
- **Removed:** the tills card and the till names it took from the shown POS tools; the app clause; the old body strings.
- **The view and twins:** `ComparisonView.fit` is `Fit | null`. The .md twin prints the guide (lists, then the delivery card) only when it isn't null. The .json twin never carried the guide and still doesn't. The admin checklist's placeholder scan uses the new lines.

**`lib/comparison-server.ts`:** `countryCopy(code)` reads the country's row with the service role. It never throws: no table, no row or a failed read gives null, and the defaults above apply. This is the page's loader, a comparison file outside the prompt's file list (§8).

**`page.tsx` + `comparison.css`:**

- the section renders only when `v.fit` isn't null;
- the two cards side by side, each a bulleted list, then the delivery card (`.cmp-fit-wide`) across the row below. On a phone the grid stacks them (`minmax(min(100%, 18rem), 1fr)`);
- the icons use the page's existing styles: ✓ in `cmp-v-yes` (its existing green), ⓘ in `var(--ink-soft)`. No new colours.

**Messages** (86 authored files, plus the regenerated `messages/ns/*/comparison.json`; `scripts/split-messages.cjs --check` passes):

- **New, English only, in en-GB** (inherited by every English locale; no English variant overrides them):
  - `fit.mayNot` «HatchGrab may not suit you if …»;
  - `fit.suits.places / ahead / limit / contract`;
  - `fit.notSuit.delivery / payOnline / payAtTruck`;
  - `fit.collect.collection|pickup` («collection» / «pickup») and `fit.collectVerb.collection|pickup` («collect» / «pick up»);
  - `fit.deliveryTitle` «Delivery apps», `fit.deliveryNamed`, `fit.deliveryNone`.

  The wording is your approved UK wording, with only {collect} / {collectVerb} / {methods} / {country} / {apps} filled per country.
- **Removed from every locale:** `fit.tills`, `fit.tillsBody`, `fit.tillsBodyNamed`, `fit.oursNotBody`, `fit.marketplacesBody`.
- **No other language got new text.**
- **Left in place, now unused** (the prompt named only the five above): `fit.oursBody`, `fit.oursNot`, `fit.appClause`, `fit.marketplaces`. Say if they should go too.

## 4 · The new harness (`scripts/compare-suits-fix-2.cjs`): 23 passed, 0 failed

It runs the real modules and messages, with no network and no database.

- **1 · Every live country.** It uses docs/compare-suits-fix-2/live-countries.json (the 96 countries' locale, name, payment model and row; sql.txt §4) and `buildFit` with the real translator:
  - all 77 fit_off countries have no guide, and the 19 others have theirs;
  - no shown line has TSE, Lieferando, Wolt, Germany (or its translations), a till / card machine / card reader / POS / point-of-sale / cash-register word, or a percentage;
  - no raw key or unfilled placeholder;
  - **the payment line follows `offersOnlineCardPayments`**: online AU CA GB GI IE MT NZ SG US; at the truck GG GU IM IN JE JM MV NG VI ZA;
  - the collect words follow each row;
  - apps are named only for GB and IE;
  - GB is word for word as approved;
  - GU's line is «you want customers to pay online when they order: in Guam they pay when they pick up.»;
  - with no row, the guide shows in English and is hidden in German.
- **2 · The real page and twins on fixtures:**
  - GB shows the two lists (6 items), both icons, the delivery card and no tills card, and its .md twin has the same guide;
  - **DE with fit_off has no guide section and nothing in its .md twin or .json**, while the rest of the page (costs, method) is there;
  - DE with no row: the same.
- **3 · Messages:** the five old keys are in none of the 114 files; the new keys are English only; split-messages `--check` passes.
- **4 · Scope:** only the four comparison files changed in `lib/` / `app/` / `components/`, and no landing-page file.

## 5 · Every comparison harness, and the re-pins

| Harness | Pass / fail |
|---|---|
| **compare-suits-fix-2** | **23 / 0** |
| compare-calc-fix-1 | 20 / 0 (re-pinned) |
| compare-no-system | 54 / 0 |
| compare-de-1 | 91 / 0 (re-pinned) |
| compare-de-1-screens | 15 / 2 (see below) |
| competitor-check-1 | 227 / 0 |
| competitor-check-8 | 51 / 0 |
| competitor-features-2 | 79 / 0 |
| competitor-wtt-1 | 42 / 0 |
| compare-suits-1 | 72 / 0 |
| compare-autopublish-1 | 75 / 0 |
| compare-languages-1 | 24 / 0 (re-pinned) |
| compare-ux-1 | 39 / 0 |
| compare-fix-1 | 65 / 0 (re-pinned) |
| compare-fix-2 | 79 / 0 |
| checker-prep-1 | 18 / 0 |
| compare-square-1 | 27 / 0 (re-pinned) |

**`tsc --noEmit`: 0 errors.**

**Re-pins** (each carries a dated ⚠️ RE-PINNED note in the file):

- **compare-de-1:** DE's guide is hidden now. Its app clause test and its four tills card tests become «no guide, no POS player named outside the table, never the unverified one», and the English-labels test now checks `fit.tillsBodyNamed` is gone.
- **compare-languages-1:** the new English-only guide keys are exempt from "every language base has every key", because their guide is hidden by your decision.
- **compare-fix-1, compare-square-1, compare-calc-fix-1:** their "nothing else changed" checks compared the working tree with their base commit. They now compare up to their own last commit (`a7f405eb` / `c2387f92` / `e9626ca8`), so this work's intended changes don't trip them.

**compare-de-1-screens 15 / 2** («the table scrolls sideways inside its own box» at 390 px, webkit and chromium):

- **Not caused by this change.** The same 2 fail at `a7f405eb`, the commit before this work, run in a temporary worktree with the same build.
- Each run of that harness rewrites 12 tracked screenshots in docs/compare-de-1/. I restored them each time, so none is changed.

## 6 · Local renders (dev server on localhost, cleared `.next/dev`, read-only against the database, no truck touched)

Each page returned HTTP 200. The text below is the guide section exactly as rendered.

**GB** (/uk/comparison/food-truck-ordering-system; columns Ordea · What The Truck · Hatches Up · Square)

> Which system suits whom?
> ✓ HatchGrab suits you if …
> - you trade in different places during the week
> - you want customers to order ahead and choose a collection time
> - you want to limit how many orders come in at once, so your kitchen keeps up
> - you don't want to sign a contract.
>
> ⓘ HatchGrab may not suit you if …
> - you want to deliver to customers' homes: HatchGrab is for collection only.
> - you want customers to pay with PayPal or Klarna: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they collect.
>
> **Delivery apps** — Apps like Deliveroo, Uber Eats and Just Eat can bring you new customers, but they take a cut of every order, including from regulars who could simply order ahead with you.

**US** (/us/comparison/food-truck-ordering-system)

> ✓ HatchGrab suits you if … you trade in different places during the week · you want customers to order ahead and choose a pickup time · you want to limit how many orders come in at once, so your kitchen keeps up · you don't want to sign a contract.
> ⓘ HatchGrab may not suit you if … you want to deliver to customers' homes: HatchGrab is for pickup only. · you want customers to pay with PayPal or Venmo: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they pick up.
> **Delivery apps** — Delivery apps can bring you new customers, but they take a cut of every order, including from regulars who could simply order ahead with you.

**AU** (/au/comparison/food-truck-ordering-system)

> ✓ … choose a pickup time … (the same four lines)
> ⓘ … HatchGrab is for pickup only. · you want customers to pay with PayPal or Afterpay: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they pick up.
> **Delivery apps** — Delivery apps can bring you new customers, … (no names)

**IE** (/ie/comparison/food-truck-ordering-system)

> ✓ … choose a collection time … (the same four lines)
> ⓘ … HatchGrab is for collection only. · you want customers to pay with PayPal or Klarna: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they collect.
> **Delivery apps** — Apps like Deliveroo can bring you new customers, but they take a cut of every order, including from regulars who could simply order ahead with you.

**GU** (billed at the truck; /gu/comparison/food-truck-ordering-system)

> ✓ … choose a pickup time … (the same four lines)
> ⓘ you want to deliver to customers' homes: HatchGrab is for pickup only. · **you want customers to pay online when they order: in Guam they pay when they pick up.**
> **Delivery apps** — Delivery apps can bring you new customers, … (no names)

**FR** (/fr/comparatif/logiciel-de-commande-food-truck)

- **No guide.** No section, no `id="passt"`, no `cmp-fit`, and no «Quelle solution pour qui ?» heading.
- The rest of the page is all there: «Quelle solution convient à votre food truck ?», «Les logiciels de commande comparés», «Les fonctionnalités expliquées», «Combien coûte un logiciel de commande pour food truck ?», «Questions fréquentes», «Notre méthode de comparaison», the CTA and the country chooser (7 sections against 8 on the English pages).
- The only code that changed renders the guide (page.tsx's fit block), so nothing else on FR's page changed.

**None of the six pages shows a tills or card machines card.**

Locally, GB, US, AU and IE show their full four (Square included), because this branch has the plan paging fix (compare-calc-fix-1). The live pages still miss those until the batch deploy or a higher Max rows.

## 7 · The localhost addresses to open

Start the dev server (`npm run dev`; if you see raw keys, clear `.next/dev` first, since the messages changed), then open:

- http://hatchgrab.localhost:3000/uk/comparison/food-truck-ordering-system
- http://hatchgrab.localhost:3000/us/comparison/food-truck-ordering-system
- http://hatchgrab.localhost:3000/au/comparison/food-truck-ordering-system
- http://hatchgrab.localhost:3000/ie/comparison/food-truck-ordering-system
- http://hatchgrab.localhost:3000/gu/comparison/food-truck-ordering-system (billed at the truck)
- http://hatchgrab.localhost:3000/fr/comparatif/logiciel-de-commande-food-truck (no guide)

Add `.md` to any address to see its Markdown twin. To check the stacked phone layout, narrow the window below about 600 px.

## 8 · What needs you

1. **The prompt's file list didn't include `lib/comparison-server.ts`.** I changed it, because it's the comparison page's loader: one small tolerant read of the new table. Say if you'd rather it lived elsewhere.
2. **Four unused fit keys stay** in every locale (`oursBody`, `oursNot`, `appClause`, `marketplaces`). Removing them is a one-line follow-up.
3. **The app clause is gone** («Or if you need the kitchen app … isn't in the stores there yet»). It isn't in the approved lines, and every live country has both apps today. If a future country lacks an app, nothing on the guide will say so.
4. **compare-de-1-screens' 2 pre-existing failures** (the table's sideways scroll at 390 px) predate this work and are worth their own look.
5. **Before the deploy:** your localhost test (§7). The migration is already applied and does nothing until then.

## Flags

- Nothing in the prompt arrived garbled, and no instruction contradicted another. The loader file is flagged above as a scope note, not a contradiction.
- Every SQL statement is in docs/compare-suits-fix-2/sql.txt.
- **Commits** (france-vat-1, not pushed):
  - `9ca5b402`: migration;
  - `97d47768`: code, messages, harnesses, fixture;
  - this report and sql.txt.
- **Undo (only if you ask):** the code is one commit (`97d47768`) to revert. The table is inert without that code; dropping it would be `drop table public.comparison_country_copy;`.
