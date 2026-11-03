# tidy-2: apps on everywhere, Real Thai Food, yen rounding

*3 November 2026. Committed on `main`; not pushed and not deployed. Two migrations, both guarded, run with `scripts/db-migrate.cjs --approved-by-dominic` (your approval in the brief covered country_settings and trucks; Pizzeria Gusto was not touched) and verified read-only. No landing-page code or copy changed.*

| # | Item | Outcome |
|---|---|---|
| 1 | Apps on in every country | **Done and live.** All 44 country rows now have both app flags on. Every surface that reads the flags shows the apps in all 44 countries (proved over the live values). |
| 2 | UAE comparison | **Confirmed off** (read-only). AE's `comparison_status` is `off`, and there is no comparison address in the sitemap or `/llms.txt`. Only DE is not off (`admin`). |
| 3 | Real Thai Food | **Done.** The guard matched exactly; the truck now reads plan `payg`, `is_customer` false, `trial_expires_at` null. Nothing else changed. |
| 4 | Yen: never round up (F6) | **Done.** A percentage (or fractional amount) on a yen price is rounded **down** to the whole yen, on every path. ¥1,980 + 5% → ¥2,079; ¥999 + 10% → ¥1,098. GBP is byte-identical to before. |
| — | Proof | `scripts/tidy-2.cjs` (registered): **44 passed, 0 failed.** For the full sweep, see §6. |

Commits: `f9b6f3ea` (the two migrations, committed before they ran) and `a5ac83c3` (code, harness, re-pins, this report).

> **Flag — the apps went live as soon as the migration ran.** The deployed site reads the two flags (cached for 60 seconds). So since about 3 November, **every country's live pages already show** the App Store and Google Play badges, the apps sentence, "Web, iOS, Android" in the JSON-LD, and Manage's get-the-app card. No deploy was needed. The badge links open each store's listing; anywhere an app isn't yet in that country's store, the store will say so. You decided they will be there before customers arrive.

## 1 · Apps on in every country

**The write.** Migration `20261063_tidy_2_apps_everywhere.sql`:
- Sets `ios_app_available` and `android_app_available` to true wherever either wasn't.
- Changed 43 of the 44 rows; GB already had both on.
- Writes no other column, and checks that the row count is unchanged.

**Every surface reads one function:** the cached reader in `lib/comparison-flags.ts` (`comparisonFlags`, `comparisonFlagsOf`, `appsOf`). It is proved over the **live values**: `scripts/fixtures/tidy-2-live-rows.json` is a read-only snapshot taken after the migration, holding each country's flags, locale, currency, enabled flag and comparison status. The fixture's other columns agree with live on every locale and currency.

| Surface | Reads | Proved |
|---|---|---|
| Landing page offline sentence (`landing.does.offlineApps`) | `comparisonFlagsOf` — both apps | Rendered for **all 44**: each page carries the sentence in its own language |
| Footer badges (`StoreBadges`) | `appsOf` | All 44: **both badges, Apple first**, each the page language's own artwork (`badgeFor`) |
| JSON-LD `operatingSystem` | `operatingSystemsOf` | All 44: "Web, iOS, Android" |
| FAQ `{apps.sentence}` / `{apps.offline}` | the FAQ world's `apps` (= both flags) | The real FAQ page rendered for the 9 English-language countries, where the fixture's questions are readable; the phrases resolved in every one of the 44 languages (never "the web dashboard needs a connection") |
| Comparison rows (iPad, Android) and the "not yet in the stores" clause | the comparison page's flags | The DE page rendered (admin, as live): both rows **Yes**, clause gone. All 44: `ourAnswer` gives Yes for both |
| Manage › Settings get-the-app card | `/api/manage` → `appsOf` | All 44 answer both apps; the real `SettingsTab` rendered for a **test truck** shows the card with both badges |

**What still hides the apps somewhere (listed, not changed):**
1. **Inside the native apps, Manage's get-the-app card is hidden** (`!isNativeApp()`, `app/manage/[token]/page.tsx:12382`). You're already in the app, so this is by design.
2. **The comparison rows are seen in DE (admin) only**, because comparison pages are off everywhere else (`comparison_status`). That isn't the flags hiding anything: they now say Yes wherever a comparison page is switched on.
3. **The 60-second cache** of the flags reader: a flag changed in Admin shows within a minute.
4. **Admin › Countries** can still switch either flag off per country, and every surface above follows it.
5. **App Store links:** GB uses the UK listing, every other country the locale-free one (`appStoreUrlFor`, unchanged). Store availability per country is set in App Store Connect and the Play Console, outside this code.

The `features` page's offline sentence uses the same condition (`app/features/page.tsx:159–160`), so it is on everywhere too. The copy found in tidy-1 §2 (the plan rows and Manage's card text) already names the apps unconditionally, and is now true everywhere.

## 2 · The UAE comparison (read-only)

- **Live:** `country_settings.comparison_status` for AE is **`off`**. The only country not off is DE (`admin`). So there was nothing to stop for.
- **Rendered over the live values:**
  - the sitemap lists `/ae`'s marketing pages and **no comparison address**, for the UAE or any country (none is live);
  - `/llms.txt` has no comparison link for the UAE.
- The competitor checker is untouched and may keep checking UAE competitors.

## 3 · Real Thai Food

Migration `20261064_tidy_2_real_thai_food.sql`:
- **Read before:** plan `trial`, `is_customer` true, `trial_expires_at` 2026-09-30 00:00:00+00. This matched the guard, so it ran.
- **The guard:** the update runs only if exactly that one row reads exactly those three values; otherwise it raises and writes nothing.
- **What it writes:** `plan = 'payg'`, `is_customer = false`, `trial_expires_at = null`. No other column, no other truck; `trucks` has no trigger.
- **Rerunning it:** it raises, because the row no longer reads the guard's values, and writes nothing.

> **Flag — what payg means for them:** pay as you go turns off four features (`plan_features`): WhatsApp auto-replies, social-media posts, Instagram replies and event types.
> - Real Thai Food has no event types and no feature overrides.
> - It has had one order ever (19 August 2026).
> - So nothing it uses visibly breaks, but WhatsApp replies and social posts are now off for it.

## 4 · Yen: never round up (F6)

**The defect** (world-countries-1 F6):
- Event pricing works in hundredths of the major unit for every currency, so "¥999 + 10%" was stored as ¥1,098.90.
- It was then shown as ¥1,099 and authorised as ¥1,099: the half yen rounded **up**.
- The harness reproduces this on the tree before this change, and it is gone now.

**The fix:**
- **`lib/event-pricing/price.ts`:**
  - `PriceSetup.wholeUnits`, set from the truck's currency by `wholeUnitsFor(currency)` (the registry's `decimals: 0`; JPY is the only one; HUF is two-decimal for the card processor).
  - In `applyPriceRule`, after the rule and the zero clamp, the result is floored to the whole unit. It is never floored to ¥0: the smallest whole yen, ¥1, stands (the rule that rounding never creates a free item).
  - The operator's "nearest / always up" rounding then acts on a whole figure.
  - Fractional amounts (`+ ¥1.5`) are floored too.
- **The currency is a required parameter**, so no caller can forget it:
  - `resolveEventPricing`, `readEventPricing`, `loadEventPriceBook`, `candidatesChangePrices` and `oldSetupOf` (the lock-in) all take it;
  - every call site passes `truck.currency`: the submit route (both calls), the menu API, both dashboard edit paths, and the Event types routes (the event's prices and the lock-in);
  - the client price cell (`PriceCell`, used by Event types and the dashboard sheet) sets it from the truck's `MoneyFormat`.
- **Similar paths — the charges** (`lib/order-charges.ts`, `lib/order-charge-rules.ts`):
  - A zero-decimal country's charge rules carry `roundDown`, and a **percentage service fee, card surcharge or tip** is then rounded down (`applyBpsDown`).
  - The flag travels to the order page (`CheckoutRules`) and to its tip buttons.
  - Japan has the service fee, tipping and surcharge **all off today** (read-only), so this is a guard for the day one is switched on.
  - **Tax keeps its rounding (D3):** it is not a percentage the business chooses, and Japan's prices include it.
  - The platform fee isn't a customer charge and is unchanged.

**Two-decimal currencies are unchanged:**
- The setup gets no `wholeUnits` key and the rules no `roundDown` key, so GBP/EUR/USD objects are byte-identical.
- Pizzeria Gusto's GBP is unaffected.

**Not changed (listed):**
- A **typed** event price (a number the operator types, not a percentage) is still taken as typed. If someone types ¥999.5 in a yen truck, the existing rounding applies downstream.
- The brief limits this item to percentages, so typed prices are out of its scope. Say if you want typed yen prices limited to whole numbers.

## 5 · Proof: `scripts/tidy-2.cjs` (registered), 44 / 44

1. **Apps:** as in §1's table, each check across all 44 countries over the live snapshot.
2. **UAE:** live `off`; the sitemap and `/llms.txt` carry no comparison address.
3. **Migrations:** the guard, and the exact columns each migration writes (and nothing else).
4. **Yen:**
   - **The rule:**
     - ¥1,980 + 5% → **¥2,079**; ¥999 + 10% → **¥1,098** (it was ¥1,098.90 before);
     - ¥990 + 15% → ¥1,138 (F6's own case); ¥1,000 − 12.5% → ¥875; ¥999 − 15% → ¥849;
     - ¥999 + ¥1.5 → ¥1,000; ¥1 − 50% → ¥1 (never free);
     - the lock-in freezes ¥1,098.
   - **The whole chain**, as the routes run it, at a JP truck: menu API price = the submit route's price book = the order page's total = the **amount the card is authorised for** (`serverTotalMinor` → `amountMinor` → the processor's `amount`, pinned in `app/api/orders/submit/route.ts` and `lib/payments/authorize.ts`) = the stored `orders.total` = the **receipt** (the confirmation email, rendered) = the **KDS / order card** (`OrderCard`'s formatter on `orders.total`).
     - All are ¥2,079 and ¥1,098, and ¥2,080 / ¥1,099 appears nowhere.
     - Before this change the same chain authorised ¥1,099.
   - **Charges in yen:** a 2.5% fee on ¥999 is ¥24 (was ¥25); a 10% tip is ¥99 (was ¥100); the page computes the same.
   - **GBP, byte-identical to the tree before this change** (HEAD's own `price.ts`, `read.ts`, `order-charges.ts` and `order-charge-rules.ts` bundled side by side):
     - a 378-case grid of the rule (menu × mode × amount × rounding);
     - the whole chain for four GBP orders (£9.99 + 10% is still £10.99);
     - 16 charge cases (service fee and tip);
     - GB's charge rules object.

**The payment provider is never named in the harness.** The sweep's screen refuses any swept file that names it, so the payment amount is proved through the function that sends it (`lib/payments/authorize.ts`), by file and by value.

## 6 · The full sweep

`node scripts/run-harnesses.cjs` (187 registered harnesses, including tidy-2):
- **186 passed and 1 failed** on the first run.
- The failure was **faq-1.cjs**, which pins the list of migrations after its own. It failed because of this work's 20261063 and 20261064, so it is not shared with HEAD. It is re-pinned and now passes **205 / 205**.
- **Swept failures shared with HEAD: none.**

**Two harnesses outside the sweep fail, the same way at the pre-change commit (`f9b6f3ea`, run in a worktree):**

| Harness | Group | Fails |
|---|---|---|
| `subtab-row.cjs` | `needs_a_browser` (not swept) | "the fixture cannot be built: no the item-prices heading found in the source" |
| `phase3-screens-shots.cjs` | `needs_a_browser` (not swept) | the US order page's totals box (5 checks), then a TypeError |

Neither comes from this work.

**Re-pinned** (marked ⚠️ RE-PINNED with this report's name):
- `faq-1.cjs`: 20261063 and 20261064 join the migrations that follow faq-1's.
- `event-pricing.cjs`: `resolveEventPricing` now has 4 parameters (the currency; still none for the event's rule columns); the menu route's call passes the currency; mutation V9's anchor includes it.
- 139 / 139.

**Also run and passing:** event-types 192, order-charges 261, money-sweep-parity (GB, 3,057 strings identical), canada-1 85, europe-settings 67, france-1 74, world-countries-1 178, store-badges-1 60, language-phase-0 163, private-events 204, plan-features-config 80, places-tab 98, legal-follow-ups 34.

## 7 · The migrations as run

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261063_tidy_2_apps_everywhere.sql --approved-by-dominic
db-migrate: supabase/migrations/20261063_tidy_2_apps_everywhere.sql · sha256 238dc4be8382839d · committed at f9b6f3ea
  notice: tidy-2: 43 of 44 country rows switched to both apps available
db-migrate: supabase/migrations/20261063_tidy_2_apps_everywhere.sql applied — one transaction, no error

npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261064_tidy_2_real_thai_food.sql --approved-by-dominic
db-migrate: supabase/migrations/20261064_tidy_2_real_thai_food.sql · sha256 61d5507f8fbb913d · committed at f9b6f3ea
db-migrate: supabase/migrations/20261064_tidy_2_real_thai_food.sql applied — one transaction, no error
```

**Read before (read-only):**
- 44 rows: GB had both flags on, the other 43 both off; all enabled; AE `off`, DE `admin`.
- Real Thai Food: `trial` / `true` / `2026-09-30 00:00:00+00`, one row.
- `trucks` has no trigger. `country_settings` has two guard triggers (priced countries), and both passed.

**Verify (read-only MCP):**

```sql
select
  (select count(*) from country_settings) as rows_total,
  (select count(*) from country_settings where ios_app_available and android_app_available) as both_apps_on,
  (select count(*) from country_settings where not ios_app_available or not android_app_available) as any_app_off,
  (select count(*) from country_settings where enabled) as enabled_unchanged,
  (select comparison_status from country_settings where country_code = 'AE') as ae_comparison,
  (select string_agg(country_code || ':' || comparison_status, ', ') from country_settings where comparison_status <> 'off') as comparison_not_off,
  (select row_to_json(t) from (select slug, plan, is_customer, trial_expires_at from trucks where slug = 'real-thai-food') t) as real_thai_food,
  (select row_to_json(g) from (select slug, plan, is_customer, trial_expires_at from trucks where slug = 'pizzeria-gusto') g) as pizzeria_gusto;
```

| Column | Result |
|---|---|
| rows_total | 44 |
| both_apps_on | **44** |
| any_app_off | 0 |
| enabled_unchanged | 44 |
| ae_comparison | **off** |
| comparison_not_off | DE:admin |
| real_thai_food | {"slug":"real-thai-food","plan":"**payg**","is_customer":**false**,"trial_expires_at":**null**} |
| pizzeria_gusto | {"slug":"pizzeria-gusto","plan":"trial","is_customer":true,"trial_expires_at":"2026-12-31T23:59:59+00:00"} (untouched) |

## 8 · Undo (only if Dominic asks)

```sql
begin;
-- 1 · the apps: back to GB only, as read on 3 November before 20261063
update public.country_settings set ios_app_available = false, android_app_available = false where country_code <> 'GB';
-- 3 · Real Thai Food: back to its expired trial
update public.trucks set plan = 'trial', is_customer = true, trial_expires_at = '2026-09-30 00:00:00+00'
 where slug = 'real-thai-food' and plan = 'payg' and is_customer = false and trial_expires_at is null;
commit;
```

Item 4 is code only: revert the code commit.

## Files

- **New:**
  - `supabase/migrations/20261063_tidy_2_apps_everywhere.sql`, `supabase/migrations/20261064_tidy_2_real_thai_food.sql`
  - `scripts/tidy-2.cjs`, `scripts/fixtures/tidy-2-live-rows.json`
  - this report
- **Changed:**
  - `lib/event-pricing/price.ts`, `lib/event-pricing/read.ts`, `lib/event-pricing/lock-in.ts`
  - `lib/order-charges.ts`, `lib/order-charge-rules.ts`
  - `components/shared/PriceControls.tsx`
  - `app/trucks/[slug]/order/page.tsx` (the tip buttons' rounding)
  - `app/api/orders/submit/route.ts`, `app/api/menu/[truckId]/route.ts`, `app/api/dashboard/action/route.ts`, `app/api/event-types/route.ts`
  - `scripts/event-pricing.cjs` (re-pin), `scripts/harnesses.json`
