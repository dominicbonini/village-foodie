# jp-price-1 — Japan Unlimited ¥2,980 → ¥3,980

18 November 2026. **The live database changed:** Japan's Unlimited plan is **¥3,980 a month**, and its extra van **¥3,980**.

- **The commit:** the migration is committed locally on main as **`335fc699`**, on its own. It has not been pushed or deployed. docs/ is left uncommitted.
- **Unchanged:** Pro (¥1,980, ¥250,000 included) and Pay as you go (¥0, 0.99%). No other country or plan was touched.
- **The live site:** www.hatchgrab.com/jp, /jp/features and /jp/faq showed ¥3,980 by **14:19 UTC**, about 6 minutes after the migration. No deploy was needed, because the pages read the price from the database.

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** none.
- **Column name:** the brief says trucks with "country_code 'JP'", but the trucks column is called **`country`**. I used `trucks.country`.
- **Commit order:** the repo's migration runner only runs a file that is committed and identical to HEAD.
  - So I checked the harnesses first, then committed, then ran the migration.
  - No re-pins were needed (§3), so the migration file alone is the "own local commit".

## 1 · Read-only first

```sql
select country_code, name, enabled, currency from country_settings where country_code = 'JP';
-- JP | Japan | enabled true | JPY

select * from plan_prices where country_code = 'JP' order by plan_key;
-- payg      | 0    | included 0      | fee 99 | extra van 0    | offered | not trial-end
-- pro       | 1980 | included 250000 | fee 99 | extra van 1980 | offered | not trial-end
-- unlimited | 2980 | included null   | fee 0  | extra van 2980 | offered | not trial-end   (updated 2026-11-01)

select plan, count(*) as trucks, count(plan_price_override_minor) as with_override from trucks where country = 'JP' group by plan;
-- (no rows)
```

**No trucks have country JP.** So no real JP truck is on Unlimited and none has an override, and the STOP condition didn't apply.

## 2 · The migration — `supabase/migrations/20261118_jp_price_1.sql`

**What it runs:**

```sql
set lock_timeout = '3s';
begin;
do $$
declare n integer;
begin
  update public.plan_prices
     set monthly_minor = 3980, extra_van_monthly_minor = 3980, updated_at = now()
   where plan_key = 'unlimited' and country_code = 'JP'
     and monthly_minor = 2980 and extra_van_monthly_minor = 2980;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'jp-price-1: expected to change exactly 1 row (JP unlimited at 2980), changed %', n; end if;
end $$;
commit;
```

- **Additive and guarded:** it changes exactly the one row, and only while it still holds the old values. Anything else raises an error and rolls back.
- **Undo** (in the file's header comment; run only if you ask):

  ```sql
  update public.plan_prices set monthly_minor = 2980, extra_van_monthly_minor = 2980, updated_at = now()
   where plan_key = 'unlimited' and country_code = 'JP';
  ```

**How it was run:**
- Command: `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261118_jp_price_1.sql --approved-by-dominic`.
- `--approved-by-dominic` is needed because the runner refuses plan_prices updates without it; your brief says to run it.
- Runner output: "committed at 335fc699 … applied — one transaction, no error".
- It also warned that it could not ask hatchgrab.com to refresh its caches (the refresh setting isn't set on this machine), so the pages update within their cache window instead.

**Read back afterwards:**

```sql
select plan_key, monthly_minor, included_online_minor, fee_bps, extra_van_monthly_minor, offered, is_trial_end, updated_at
  from public.plan_prices where country_code = 'JP' order by plan_key;
-- payg      0    / 0      / 99 / 0    (unchanged, 2026-11-01)
-- pro       1980 / 250000 / 99 / 1980 (unchanged, 2026-11-01)
-- unlimited 3980 / null   / 0  / 3980 (2026-11-18 14:13:28 UTC)
```

## 3 · Everything that shows or tests the price

**What shows the price.** I checked the code path for each surface and, where reachable, the page itself, on localhost against the live data and on www.hatchgrab.com:

| Surface | Reads the price from | Observed |
|---|---|---|
| `/jp` pricing section (`components/pricing/PricingSection.tsx`) | the plan catalogue (`lib/plans-server.ts` / marketing cache) | **¥0 / ¥1,980 / ¥3,980**. The "Which plan is cheapest?" bands moved to **¥200,000〜¥452,000 → Pro, over ¥452,000 → Unlimited** (was ¥351,000). That is the break-even worked out from the data: ¥250,000 + ¥2,000 ÷ 0.99% ≈ ¥452,000. Live site: ¥3,980, no ¥2,980. |
| `/jp/features` | the catalogue | ¥3,980 locally (first fetch) and live |
| `/jp/faq`, and the FAQ data embedded in `/jp` | `lib/faq/live-values.ts` fills `{price}` tokens from the catalogue (monthly and extra van) | **Live: ¥3,980, no ¥2,980.** The ja-JP translations hold tokens, not prices (read-only check below). Localhost: see "Local FAQ" below. |
| Comparison page `/jp/compare` | `lib/comparison-server.ts` → the catalogue | Its embedded data holds `3980` once and `2980` nowhere |
| Plans PDF (`lib/plans-pdf.ts`, admin-only route) | `getPlanCatalog()` → `p.monthlyMinor` | Not rendered (admin login needed). Same loader and same rows as the pages above. |
| Signup | shows no prices; reads only the trial length | No yen amounts on `/signup?country=JP` |
| Admin › Countries | `/api/admin` → `getPlanCatalog()`; each country's price line is built from the rows | Not opened (admin login needed); same loader |
| Admin › Pricing check | live prices for a live country (`lib/pricing-check.ts`) | Japan is live, so it uses ¥3,980 |

```sql
select locale, count(*) filter (where answer like '%2,980%' or answer like '%2980%') as with_2980,
       count(*) filter (where answer like '%{%') as with_tokens, count(*) as rows
  from faq_translations where locale in ('ja-JP') group by locale;
-- ja-JP | 0 | 10 | 29
```

**No code, message or content file holds Japan's price.** A search for 2980 / 2,980 across `app`, `lib`, `components`, `messages`, `content` and `public` found nothing.

**Harnesses.** None pins Japan's **live** Unlimited price, so **nothing was re-pinned**. Each one that mentions ¥2,980 pins something else:

- **`world-countries-1`:** its "prices as briefed … JP 1980/2980" reads the **20261055 migration file**, the original seed. That is dated history and still true of that file.
- **`pricing-check-1`:** its "JP: ¥0 / ¥1,980 incl. ¥250,000 / ¥2,980" uses a fixture with Japan as a not-yet-live country. It takes `planned_unlimited_minor` from `data/pricing-research-1/benchmarks.json`, the original research plan, which isn't changed here.
- **`billing-1`, `billing-2`:** in-memory fixture prices for the billing logic.
- **`_plans-catalog-fixture`** (GB/US seeds only) and **`pricing-copy-4`:** no Japan price at all.

**Price-related harnesses run after the change: 22 of 23 pass.**

- **Passing:**
  - `pricing-copy-4` 1145/0, `world-countries-1` 178/0, `pricing-check-1` 82/0, `plans-data-model` 154/0;
  - `admin-countries-1` 47/0, `billing-2` 72/0, `native-prices` 53/0, `currency-registry` 40/0;
  - `compare-de-1` 93/0, `compare-no-system` 54/0, `countries-api` 85/0, `country-settings-parity`, `marketing-country-parity` 145/145;
  - `faq-1` 208/0, `faq-2` 167/0, `faq-3` 192/0, `faq-4` 105/0, `faq-4-screens` 10/0;
  - `plan-feature-order`, `event-pricing`, `allergen-card-country`, `legacy-pricing-imports`.
- **Failing, not caused by this change:**
  - `billing-1` 130/1: listed as failing on HEAD in earlier rounds (Open item 12). It is not about Japan.
  - `faq-3-screens`: crashes because `app/(public)/(site)/landing/faq.css` no longer exists (the FAQ moved to its own page in faq-4). It is a stale screenshot script, not about prices.
- `compare-suits-1-render` was picked up by my file search, but it is a tool that needs arguments, not a harness.

**Local FAQ.** The dev server already running on port 3000 kept serving its cached `/jp/faq` (¥2,980) after the live site had changed.
- That page caches a resolved copy that itself holds a cached catalogue (5 minutes each).
- I didn't restart someone else's dev server. The result of my background poll is at the end of this report.

## 4 · Screenshots — `docs/jp-price-1/`

These are from localhost (`hatchgrab.localhost:3000/jp`), against the live data, after the migration:

- `01-jp-pricing-viewport-laptop.png`, `01-jp-pricing-viewport-phone.png`: the pricing section scrolled into view. The phone shows the first card.
- `02-jp-pricing-section-laptop.png`, `02-jp-pricing-section-phone.png`: the whole pricing section.

**Checked on each:**
- the three amounts read ¥0 / ¥1,980 / ¥3,980;
- the bands read ¥200,000 / ¥452,000;
- no "2,980" anywhere in the section;
- no sideways scroll.

The round "N" in the corner is Next's development indicator, not part of the page.

## 5 · Hard rules

- No other country or plan was changed. Pizzeria Gusto and Le Roi du Churrasco were not touched.
- No deploy and no push. No landing-page code or wording change: the landing page shows the new price because it reads the data.
- No .env file was opened. The runner reads its own connection string internally.
- The commit holds only `supabase/migrations/20261118_jp_price_1.sql`.
- `docs/reference-manual.md` is still modified from the manual-v16-33 round and is not in this commit.

## 6 · Local FAQ poll

The poll fetched each page once a minute until every one showed ¥3,980 and none showed ¥2,980:

| UTC | www…/jp | www…/jp/features | www…/jp/faq | localhost /jp/faq |
|---|---|---|---|---|
| 14:19:11 | ¥3,980 ×2, ¥2,980 ×0 | ¥3,980 ×2, ¥2,980 ×0 | ¥3,980 ×8, ¥2,980 ×0 | ¥3,980 ×0, ¥2,980 ×10 |
| 14:20:13 | ¥3,980 ×2, ¥2,980 ×0 | ¥3,980 ×2, ¥2,980 ×0 | ¥3,980 ×8, ¥2,980 ×0 | **¥3,980 ×10, ¥2,980 ×0** |

**Every page checked showed ¥3,980 by 14:20 UTC:**
- the live site within about 6 minutes of the migration (14:13:28);
- the local dev server's FAQ within 7, once its nested caches expired.

No code change was needed anywhere.
