# currency-registry — one list of supported currencies, used everywhere

**Date:** 21 October 2026 · **Branch:** main (uncommitted; nothing pushed or deployed) · **Database:** no change made. The
CHECK below is NOT RUN SQL ("run now").

## ⚠️ First: six things to know

1. **Item 4 (remove "incl. GST" for AU/NZ) was already done in landing-mobile-tidy** at your request. I verified it here:
   there is no "GST" anywhere in `messages/en-AU.json` or `messages/en-NZ.json`, and the AU/NZ fixture pages, PDFs and
   footnotes carry no GST claim. §6 repeats the before → after.
2. **"The same safe way it treats an unknown allergen set" wasn't safe.** An unknown allergen set made `mapCountryRow`
   throw, and every country LIST maps every row. So one bad row made the country menu, the marketing router, the signup
   list and the admin Countries page throw for everyone. That's the outcome you asked to avoid, so I fixed both cases
   together. Exactly what happens to such a row now is in §3.2.
3. **EUR's sign "c" and Ireland's byte-identity both hold.** The brief gives EUR the sign "c" for "admin inputs and short
   fee text". But Ireland's footnote says "1.5% + €0.25" (decided in ireland-1), and IE output must stay byte-identical.
   So the registry holds the sign ("c", shown beside the admin boxes) and, separately, how a sentence writes a small fee
   (`shortFee: 'amount'` for EUR, so the footnote keeps "€0.25").
4. **A real bug the registry fixes: the Hungarian forint.** The app read a currency's decimals from `Intl`, and `Intl`
   gives HUF **0** decimals. Stripe takes HUF in **two-decimal** minor units: its only HUF special case is payouts, which
   must be whole forints. A Hungarian price of 2900 minor units would have been shown as 2,900 Ft and charged as HUF 29,
   100× too little. Decimals now come from the registry, which holds Stripe's.
5. **A second "minor units" site was live, not just Admin → Countries.** Admin → Plans printed `2900 (minor units)` for
   any country with plan prices and no trucks. Ireland has live plan prices and no trucks, so it showed that today. Fixed
   (§2).
6. **Some registry values are proposals, for currencies no country uses.** The brief named the signs for GBP, USD, CAD,
   EUR, AUD and NZD; the other eight are my proposals: CHF "Rp", SEK "öre", NOK "øre", DKK "øre", PLN "gr", CZK "h", HUF
   "f", RON "bani". I also qualify the three "kr" currencies on our plan prices, as "SEK 29", "NOK 29" and "DKK 29", the
   same way "A$" names a dollar. Nothing renders them until a country uses them; say if you want other values.

Nothing in the brief arrived garbled. No two instructions contradicted each other: points 2 and 3 are facts about the
code, resolved in the way the rest of the brief requires.

## Summary

- **`lib/currencies.ts`** is the one list, with 14 currencies (§1). Each has its code, name, the symbol our plan prices
  show, Stripe's decimals, the minor-unit sign, the short-fee style, a home locale and, for AUD, the eftpos-notice flag.
- **Every per-currency rule now reads it:**
  - `money-format`'s `MINOR_SUFFIX` table (removed);
  - `minorDigits` (it was Intl);
  - `planMoneyFormatOf`'s "a bare $ that isn't USD" rule;
  - the order page's `=== 'AUD'` eftpos check;
  - admin form validation (it was "any code Intl knows");
  - Admin → Countries' sign and its currency field.
- **Admin → Countries:** Ireland shows "c" (it showed "25 EUR minor units"). The currency is a dropdown of the registry's
  codes, the same width as the old text box, and still locked while trucks use it.
- **Prevention:**
  - NOT RUN SQL replaces `country_settings_currency_chk` (any three capitals) with the registry's 14 codes; all 3 live
    rows pass.
  - The loader refuses an unlisted currency. Lists leave that one row out instead of throwing for everyone.
  - The new `scripts/currency-registry.cjs` fails if the registry and the CHECK differ, if any currency lacks a sign or
    decimals, or if the rendered admin page or any app source says "minor units".
- **GB, US and IE are byte-identical:** all 20 rendered page and PDF views (GB, US, IE, AU, NZ), and every money-helper
  output for GBP, USD and EUR.
- **Checks:** tsc and the build pass; there are no new lint errors; `currency-registry` passes 31/31; **the full sweep
  passes 148/148**. 3 harnesses were re-pinned for the approved changes, and the new one was registered.

---

## 1 · The registry (`lib/currencies.ts`)

| Code | Name | Plan-price symbol | Decimals | Admin sign | Short fee in a sentence | Plan prices formatted in |
|---|---|---|---|---|---|---|
| GBP | British pound | £ | 2 | p | 20p | country's locale |
| USD | US dollar | $ | 2 | ¢ | 30¢ | country's locale |
| EUR | Euro | € | 2 | c | €0.25 (amount) | country's locale |
| CAD | Canadian dollar | CA$ | 2 | ¢ | 30¢ | `en` |
| AUD | Australian dollar | A$ | 2 | c | 30c | `en` (+ eftpos notice) |
| NZD | New Zealand dollar | NZ$ | 2 | c | 30c | `en` |
| CHF | Swiss franc | CHF | 2 | Rp | amount | country's locale |
| SEK | Swedish krona | SEK | 2 | öre | amount | `en` |
| NOK | Norwegian krone | NOK | 2 | øre | amount | `en` |
| DKK | Danish krone | DKK | 2 | øre | amount | `en` |
| PLN | Polish złoty | zł | 2 | gr | amount | country's locale |
| CZK | Czech koruna | Kč | 2 | h | amount | country's locale |
| HUF | Hungarian forint | Ft | **2** | f | amount | country's locale |
| RON | Romanian leu | RON | 2 | bani | amount | country's locale |

- **The plan-price symbol** is what the pricing pages, /features, /compare, the plans PDF and Billing show. It is
  checked by the harness: `formatWholeAmount(2900, planMoneyFormatOf(…))` in each currency's home locale carries this
  symbol.
- **A truck's own menu prices** keep its country's everyday symbol (Intl): "$12.00" in Australia.
- **Decimals, checked against https://docs.stripe.com/currencies:**
  - "Currencies are two-decimal currencies unless otherwise specified. All API requests expect `amount` values in the
    currency's minor unit."
  - **HUF**, under "Special cases": "Stripe treats HUF as a zero-decimal currency for payouts, even though you can charge
    two-decimal amounts. When you create a manual payout in HUF, you must provide integer amounts that are evenly
    divisible by 100."
  - The page's other special cases are ISK, TWD and UGX, none of them ours.
  - The page's zero-decimal and three-decimal lists are rendered as links and didn't come through the fetch tool. Stripe's
    published zero-decimal list (BIF, CLP, DJF, GNF, JPY, KMF, KRW, MGA, PYG, RWF, UGX, VND, VUV, XAF, XOF, XPF) and
    three-decimal list (BHD, JOD, KWD, OMR, TND) contain none of our 14; the harness encodes both lists.
  - **So every registry currency is two-decimal.**
- **Stripe's minimum charges** (same page), useful when one of these opens: CHF 0.50, CZK 15.00, DKK 2.50, HUF 175.00,
  NOK 3.00, PLN 2.00, RON 2.00, SEK 3.00 (GBP 0.30, USD/EUR/AUD/NZD/CAD 0.50).

**What was folded in (each now reads the registry):**

| Was | Now |
|---|---|
| `lib/money-format.ts` `MINOR_SUFFIX = { GBP: 'p', USD: '¢', CAD: '¢', AUD: 'c', NZD: 'c' }` | `minorUnitSuffix` = the registry's sign where `shortFee` is 'minor' (the same five; EUR none). New `minorUnitSign` = the sign for admin boxes (EUR "c" too). |
| `minorDigits` = Intl's fraction digits | the registry's `decimals`; Intl only for a code outside it |
| `planMoneyFormatOf`: "the country's symbol is a bare '$' and the currency isn't USD → locale `en`" | the registry's `planLocale` (CAD, AUD, NZD and, newly, SEK, NOK, DKK) |
| order page: `truck?.money?.currency === 'AUD'` (eftpos notice) | `currencyInfo(…)?.eftposNotice` |
| `lib/admin/country-form.ts`: any code `Intl.supportedValuesOf('currency')` knows | registry codes only; the message names them |
| Admin → Countries: `minorUnitSuffix(cur) ?? \`${cur} minor units\`` | `minorUnitSign(cur)` |

**Left as they are, deliberately:**
- `lib/printing/ticket.ts`: the printer prints "EUR 12.00" because thermal printers can't print €. It's a character
  table for the printer's code page, not a currency lookup.
- `lib/payments/currency.ts`: the money path's 3-letter normaliser. Every order's currency comes from its truck, and the
  admin form and the CHECK now confine those.

## 2 · Every display reads it: the sweep

I searched `app/`, `components/`, `lib/` and `messages/` for "minor units", for a currency code printed in place of a
symbol, and for per-currency switches.

| Site | Found | Done |
|---|---|---|
| Admin → Countries, the online / in-person / Tap to Pay fixed-fee boxes | `25 EUR minor units`, and the same for any currency outside the old table | **Fixed:** the registry sign. GB p · IE c · US ¢ · AU c · NZ c |
| Admin → Countries, the currency field | free text (any 3 letters Intl knew) | **Fixed:** a dropdown of the registry's codes, `max-w-[6rem]` as before; locked while trucks use it, as before |
| Admin → Plans (the catalogue table) | `2900 (minor units)` for a country with prices and no trucks (**Ireland, live**) | **Fixed:** `/api/admin` now loads settings for every priced country, one by one, best effort. A country that can't be read shows "—" |
| Order page, eftpos notice | `=== 'AUD'` | **Fixed:** the registry flag |
| /compare, the "per order" fee box suffix | uses the short-fee suffix (empty for EUR) | **Unchanged** so IE stays byte-identical. It could show "c" for Ireland if you want; say so |
| Billing, plans PDF, emails, receipts, Manage boxes | `formatAmount` / `currencySymbol` (Intl symbols); no "minor units", no raw code | Unchanged (§5 proves GB/US/IE identical) |
| Printed tickets | "EUR 12.00" (the printer can't print €) | Intentional, unchanged |
| CLDR's own symbols for CHF ("CHF") and RON ("RON") | the symbol Intl gives in de-CH / ro-RO | Not live; noted for when those countries open |

The harness now fails if any app, component, lib or message file says "minor units" outside a comment, and none does.

## 3 · Prevention

### 3.1 The database CHECK (NOT RUN SQL, "run now")

- The file is `supabase/migrations/20261027_currency_registry.sql`. It replaces the CHECK of the same name.
- Every existing row passes, confirmed read-only: 3 of 3 (GB GBP, IE EUR, US USD).
- Trucks and orders use only GBP and USD.

```sql
begin;
alter table public.country_settings drop constraint country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON'));
commit;
```

### 3.2 The loader: exactly what happens to one row with an unknown currency (or allergen set)

- **`mapCountryRow` refuses it:** `XX.currency has an unusable value ("XYZ") — refusing to guess`. This is the same refusal
  an unknown allergen set gets.
- **Every list leaves that one row out, and the rest load.** `readAllCountryRows` maps each row on its own, keeps the
  good ones, and logs `[country-settings] XX is left out of every country list: …`. This applies to the marketing
  pages' country menu, router, hreflang and sitemap (`listCountrySettingsCached`), the signup country list and the admin
  Countries page. So:
  - the country isn't offered, and isn't routed to;
  - its `/xx` pages redirect to /uk, as for a switched-off country;
  - nobody else's page is affected.
- **Admin → Countries names it** in a red notice above the grid: "One country row can't be read… **XX** — <reason>. Fix
  the row in the database." The row can't be shown as an editable column, because there is no valid value to put in its
  form.
- **A direct read of that country still throws**, loudly, as before (`getCountrySettings('XX')`). Its own trucks'
  dashboards, order pages and payments fail rather than run on a guessed currency.
- Admin → Plans shows "—" for its prices.
- **This can't happen through the app:** the admin form refuses an unlisted currency, and once the CHECK runs, the
  database does too.

### 3.3 The harness (`scripts/currency-registry.cjs`, 31 checks, in `scripts/harnesses.json`)

It fails if:
- the registry and the migration's CHECK list differ (it reads the SQL; same codes, same order);
- any currency lacks a name, symbol, decimals, sign, short-fee style or locale;
- any decimals disagree with Stripe's lists;
- GB/US/IE money output moves (pinned values);
- a plan price doesn't carry the registry's symbol;
- the loader accepts an unlisted currency or lets one bad row take a list down (it also checks the unknown allergen set);
- the rendered admin Countries tab (GB, IE, US, AU, NZ) contains "minor units", or any fee box shows a sign other than
  p / c / ¢ / c / c, or the currency field is free text;
- any source file says "minor units";
- `/api/admin` stops loading every priced country;
- the order page stops reading the registry for the eftpos notice.

## 4 · Screenshots (`docs/currency-registry/`)

- The real admin page is rendered with fixture rows (GB 14 trucks, US 1, IE, AU and NZ with 0), at 2400×1080.
- Both engines: **WebKit** (Playwright 2359, Safari's engine) and **Chromium** (Playwright 1243).
- "Before" is this tree's tab with the two changes reversed (the old sign rule and the text box), rendered the same way.

| File | Shows |
|---|---|
| `before-{webkit,chromium}-card-fees.png` | header and fee rows: UK p, Australia c, **Ireland "25 EUR minor units" / "10 EUR minor units"**, New Zealand c, US ¢ |
| `after-{webkit,chromium}-card-fees.png` | the same rows: **UK p · Australia c · Ireland c · New Zealand c · US ¢** |
| `before-…-currency.png` / `after-…-currency.png` | the Currency row: text boxes → **dropdowns** (AU, IE, NZ); GB and US locked ("🔒 14 trucks use it", "🔒 1 truck uses it") |

Measured in both engines, after: the signs beside all 15 fee boxes are exactly p p p / c c c / c c c / c c c / ¢ ¢ ¢, and
"minor units" doesn't appear on the page. Before, Ireland's three boxes read "EUR minor units".

## 5 · GB, US and IE byte-identical: proof

A snapshot script (`scratchpad/cr/snap.cjs`) rendered everything a currency decides, **before any code change** and again
after:
- the landing page, /features and /compare for **uk, us, ie, au and nz** (all switched on, fixture rows and prices): 15
  views;
- the **plans PDF** for GB, US, IE, AU and NZ: 5 documents;
- every money helper (minorDigits, minorUnitSuffix, currencySymbol, planMoneyFormatOf, formatAmount, formatWholeAmount,
  perMonthLabel, smallFeeLabel, feeLabel, formatMinor and the plan-price format) on 17 amounts, for all 14 currencies in
  their home locale and in en-GB: 27 rows.

| Compared | Result |
|---|---|
| 15 page views + 5 PDFs (GB, US, IE, AU, NZ) | **all 20 byte-identical** (HTML and metadata) |
| GBP (en-GB), USD (en-US, en-GB), EUR (en-IE, en-GB) helper output | **identical, every value** |
| CAD/AUD/NZD in their own locales; CHF, PLN, CZK, RON | identical |
| CAD/AUD/NZD in en-GB | only `planMoneyFormatOf`'s locale object changed (en-GB → en); every printed amount identical |
| SEK / NOK / DKK | plan prices "29 kr" → "SEK 29" (the proposal in First-6; no country uses them) |
| HUF | decimals 0 → 2 (the fix in First-4) |

- **Billing:** GB and US Billing are compared byte for byte against stored baselines by language-phase-1d2 / -1e /
  -1e-tidy and plans-data-model in the full sweep. The stock renderer covers GB and US trucks only.
- Ireland's Billing formats through the same `moneyFormatOf` / `planMoneyFormatOf` / `formatAmount`, whose EUR output is
  identical above.
- The admin pages are the only changed output: the approved label fix, the dropdown and the Plans fallback.

## 6 · "incl. GST" for AU/NZ (item 4): already done

This was done in landing-mobile-tidy and is verified here. `prices_include_tax` and the trucks' own GST behaviour are
unchanged.

| Key (en-AU and en-NZ) | Before | After |
|---|---|---|
| `pricing.card.perTruckMonth` | per truck / month incl. GST | per truck / month *(en-GB wording)* |
| `compare.plan.summary` | {price} per truck per month incl. GST, with {allowance} of online orders included… | {price} per truck per month, with {allowance} of online orders included… *(en-GB)* |
| `compare.plan.summaryNoFee` | {price} per truck per month incl. GST, with unlimited online orders and no HatchGrab fee. | {price} per truck per month, with unlimited online orders and no HatchGrab fee. *(en-GB)* |
| `pricing.footnote` | **All prices include GST.** * Plus Stripe’s card processing … EFTPOS machine — HatchGrab charges 0%. | * Plus Stripe’s card processing … EFTPOS machine — HatchGrab charges 0%. |

- There is no "GST" left in `messages/en-AU.json` or `messages/en-NZ.json`.
- The AU and NZ fixture landing, /features, /compare and PDF render no "GST" (snapshot, and anz-1 §2, which asserts it).

## 7 · Checks

- **tsc:** clean. **Build:** `next build` passes.
- **Lint**, compared with HEAD file by file:
  - 0 errors in `lib/currencies.ts` (new), `money-format.ts`, `country-settings-types.ts`, `country-settings.ts`,
    `country-form.ts`, `country-actions.ts`, `country-store.ts` and `CountriesTab.tsx`;
  - `app/admin/page.tsx` 10 = HEAD's 10, `app/api/admin/route.ts` 1 = 1, the order page 19 = 19.
- **`currency-registry`:** 31/31.
- **Full sweep (`node scripts/run-harnesses.cjs`, 148 harnesses): 148 run, 148 passed, 0 failed.** Among them:
  - `money-sweep-parity`: GB, 3,057 rendered strings and byte streams identical to its fixture;
  - `money-sweep-parity-usd` and `country-settings-parity`: identical except their allowed changes;
  - the language-phase and plans-data-model byte-identity harnesses, anz-1 and ireland-1.

  The first run had 3 failures, all from the approved changes, and all re-pinned below.
- **Re-pinned for the approved changes only** (each marked `⚠️ RE-PINNED (currency-registry, 21 October 2026)`):
  - **`countries-api`:**
    - a JPY country is now refused, since JPY isn't in the registry;
    - the "smuggled plan price is ignored" rule is proven on a CHF country instead;
    - the currency error names the supported list ("Currency must be one we support: GBP, USD, EUR, …");
    - a new case: a real but unsupported currency (JPY) is refused.
  - **`event-pricing`:** `lib/currencies.ts` is compiled with the money formatter. The no-cycle check allows the
    formatter's one import, the registry, which itself imports nothing.
  - **`event-types`:** `lib/currencies.ts` is added to its compiled file list (two of its modules import it).
  - **`scripts/harnesses.json`:** + `currency-registry.cjs`.

## 8 · SQL

### Read-only queries run (Supabase)

```sql
select country_code, currency, enabled from public.country_settings order by country_code;
```
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'c' and pg_get_constraintdef(oid) ilike '%currency%'
order by 1, 2;
```
```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public' and column_name ilike '%currency%' order by 1, 2;
```
```sql
select count(*) as rows_total,
       count(*) filter (where currency in ('GBP','USD','EUR','CAD','AUD','NZD','CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON')) as rows_passing
from public.country_settings;
```
```sql
select 'trucks' as tbl, currency, count(*) from public.trucks group by currency
union all select 'orders', currency, count(*) from public.orders group by currency
order by 1, 2;
```

**Results:**
- `country_settings`: GB GBP (on), IE EUR (off), US USD (on), so **3 of 3 rows pass**.
- The existing CHECK is `currency ~ '^[A-Z]{3}$'`.
- `trucks`, `orders` and `order_drafts` have upper-case-only CHECKs.
- `trucks`: GBP 11, USD 1. `orders`: GBP 2,931, USD 5.

### NOT RUN, "run now"

```sql
begin;
alter table public.country_settings drop constraint country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk
  check (currency in ('GBP', 'USD', 'EUR', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON'));
commit;
```

### Undo (only if Dominic asks)

```sql
begin;
alter table public.country_settings drop constraint country_settings_currency_chk;
alter table public.country_settings add constraint country_settings_currency_chk check (currency ~ '^[A-Z]{3}$');
commit;
```

## 9 · Files

- **New:**
  - `lib/currencies.ts`;
  - `supabase/migrations/20261027_currency_registry.sql` (NOT RUN);
  - `scripts/currency-registry.cjs`;
  - `docs/currency-registry/*.png`.
- **Changed:**
  - `lib/money-format.ts`: decimals and signs from the registry; `MINOR_SUFFIX` removed; new `minorUnitSign`.
  - `lib/country-settings-types.ts`: `planMoneyFormatOf` reads `planLocale`.
  - `lib/country-settings.ts`: the currency must be in the registry; new `readAllCountryRows`; lists skip unreadable
    rows.
  - `lib/admin/country-form.ts`: registry-only validation and message.
  - `lib/admin/country-actions.ts`, `lib/admin/country-store.ts`: report unreadable rows.
  - `components/admin/CountriesTab.tsx`: the sign, the dropdown, the unreadable-rows notice.
  - `app/admin/page.tsx`: the Plans fallback is "—".
  - `app/api/admin/route.ts`: settings for every priced country.
  - `app/trucks/[slug]/order/page.tsx`: the eftpos notice reads the registry.
  - `scripts/countries-api.cjs`, `scripts/event-pricing.cjs`, `scripts/event-types.cjs`, `scripts/harnesses.json`.
