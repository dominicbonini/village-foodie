# compare-calc-fix-1: the plan read paged, What The Truck stored as card-fee-included, Favrit / WEIQ, live pages (26 Nov 2026)

## 1 · Summary

- **Code** (`e9626ca8`, on france-vat-1, for the batch deploy; not pushed):
  - every read in `lib/admin/pricing-check-store.ts` that can pass Supabase's 1,000-row cap is now paged;
  - new harness **compare-calc-fix-1: 20 / 0**;
  - all 15 comparison harnesses pass, and `tsc` reports 0 errors.
- **Data** (migration `20261147`, `2e9e2040`, pre-flighted then applied, with an md5 proof that only the named columns of three plans changed):
  - **What The Truck GB:** card fee included at 3.95% (`card_mode` bundled, `card_bps` 395, truck fee 0), renamed **"What The Truck (online fee + VAT)"**;
  - **Favrit NO** and **WEIQ SE:** `card_mode` 'unknown'. Neither own price page states a rate.
- **Publish:** the dry run showed 96 live and no change, so I published (no change). Verified: 96 live; 212 shown = 212 marked; AE false / false.
- **Max rows: still effectively 1,000.**
  - The live GB page, which runs the deployed unpaged read, still shows **Ordea only**. What The Truck's plan is row 1,049.
  - So the live pages stay short until the setting is raised or the batch deploy ships `e9626ca8`.
  - I didn't read FR, US or RE (the prompt's branch).

## 2 · Code

### The diff (`lib/admin/pricing-check-store.ts`, +37 / −13)

```diff
+type DbError = { message: string; code?: string }
+/** compare-calc-fix-1 … Every read here that can pass 1,000 rows is PAGED: pages of PAGE rows in a stable order (ending in the id)
+ *  until a short page. scripts/compare-calc-fix-1.cjs fails if a multi-row read is not. */
+const PAGE = 1000
+async function pageAll(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: DbError | null }>): Promise<{ data: Row[]; error: DbError | null }> {
+  const out: Row[] = []
+  for (let from = 0; ; from += PAGE) {
+    const { data, error } = await page(from, from + PAGE - 1)
+    if (error) return { data: out, error }
+    const rows = (data ?? []) as Row[]
+    out.push(...rows)
+    if (rows.length < PAGE) return { data: out, error: null }
+  }
+}

   async listAll() {
-      readCompetitors(cols => s.from(TABLE.competitors).select(cols).order('name')),
-      s.from(TABLE.plans).select(COLUMNS.plans).order('created_at'),
-      s.from(TABLE.benchmarks).select(COLUMNS.benchmarks).order('created_at'),
+      readCompetitors(cols => pageAll((a, z) => s.from(TABLE.competitors).select(cols).order('name').order('id').range(a, z))),
+      pageAll((a, z) => s.from(TABLE.plans).select(COLUMNS.plans).order('created_at').order('id').range(a, z)),
+      pageAll((a, z) => s.from(TABLE.benchmarks).select(COLUMNS.benchmarks).order('created_at').order('id').range(a, z)),

   async listEntries() {
-    … entryCols(cols => s.from('comparison_entries').select(cols).order('sort_order'))
+    … entryCols(cols => pageAll((a, z) => s.from('comparison_entries').select(cols).order('sort_order').order('id').range(a, z)))

   async features() {
-    … s.from('comparison_features').select(FEATURE_COLUMNS_SUITS)            (and the pre-20261075 fallback)
+    … pageAll((a, z) => s.from('comparison_features').select(FEATURE_COLUMNS_SUITS).order('key').range(a, z))

   async pendingFeatureFindings(code) {
-    … .or(`country_code.eq.${code},country_code.is.null`).limit(5000)          ← a limit above the cap is still capped at 1,000
+    … pageAll((a, z) => … .or(`country_code.eq.${code},country_code.is.null`).order('id').range(a, z))

   async markFeatureDue(key, today) {
-      s.from('competitors').select('id, next_check_at').eq('lifecycle', 'active'),
-      s.from('competitor_feature_values').select('competitor_id').eq('feature_key', key)…,
+      pageAll((a, z) => s.from('competitors').select('id, next_check_at').eq('lifecycle', 'active').order('id').range(a, z)),
+      pageAll((a, z) => s.from('competitor_feature_values').select('competitor_id').eq('feature_key', key)….order('id').range(a, z)),

   async existingIds(table, ids) {
-    … .select('id').in('id', ids)
+    // in chunks of 500 ids, so no response can reach the 1,000-row cap
+    for (let i = 0; i < ids.length; i += 500) { … .select('id').in('id', ids.slice(i, i + 500)) … }
```

**Not changed:**

- `featureValues` and `featureChecks` were already paged with the same loop;
- `readDataImports` is `.limit(200)`;
- every other read is single-row by id or name.

The column lists, the writes and every other file in `lib/`, `app/` and `components/` are untouched, and the harness checks it.

### Harness `scripts/compare-calc-fix-1.cjs` (registered in scripts/harnesses.json): 20 passed, 0 failed

- **1 · The real store against a fake database that never returns more than 1,000 rows in one response**, as PostgREST does:
  - `listAll` returns all 2,345 plans, 1,234 competitors and 1,100 benchmarks, once each;
  - plans come in pages of 1,000, ordered by `created_at, id`. Ties straddle the page boundaries and are neither repeated nor skipped;
  - competitors stay in name order;
  - `listEntries` returns 1,500, `pendingFeatureFindings` 1,200, `features` 1,050 and `featureValues` 3,100;
  - `existingIds` with 1,700 ids returns 1,700;
  - `markFeatureDue` gives all 1,234 competitors their row.
- **2 · The store as it was (`bbc8c4b3`) against the same fake:** `listAll` stops at 1,000 plans, 1,000 competitors and 1,000 benchmarks. So section 1 catches the bug.
- **3 · Static:**
  - the same scan run on the old file finds its 10 unpaged reads;
  - on the new file, every one of the 18 read statements is paged, single-row, chunked or limited to ≤ 200;
  - there's no `.limit(5000)`.
- **4 · Scope:** since `bbc8c4b3` only the store changed in `lib/`, `app/` and `components/`, and no column list changed.

### Every comparison harness

| Harness | Pass / fail |
|---|---|
| compare-calc-fix-1 | 20 / 0 |
| compare-no-system | 54 / 0 |
| compare-de-1 | 93 / 0 |
| competitor-check-1 | 227 / 0 |
| competitor-check-8 | 51 / 0 |
| competitor-features-2 | 79 / 0 |
| competitor-wtt-1 | 42 / 0 |
| compare-suits-1 | 72 / 0 |
| compare-autopublish-1 | 75 / 0 |
| compare-languages-1 | 24 / 0 |
| compare-ux-1 | 39 / 0 |
| compare-fix-1 | 65 / 0 |
| compare-fix-2 | 79 / 0 |
| checker-prep-1 | 18 / 0 |
| compare-square-1 | 27 / 0 |

**`tsc --noEmit`: 0 errors.**

## 3 · Data (migration 20261147)

### What The Truck GB, plan `8c777139`

| Column | Before | After |
|---|---|---|
| plan_name | What The Truck | **What The Truck (online fee + VAT)** |
| card_mode | bundled | bundled |
| card_bps | null | **395** |
| card_fixed_minor | null | **0** |
| truck_fee_bps | 395 | **0** |
| everything else | £0 a month, `vat` excl, source whatthetruck.ai/pricing, notes with the VAT quote | unchanged (md5-proved) |

**Where «+ VAT» shows:** in the **plan name**. The page prints the name beside the price, in the cost line `{plan}: {price}` and in the price answers' evidence. It never prints the plan's note. Its own page says «The platform fee for online ordering is subject to VAT at 20%.»

Once the page shows What The Truck (§5), it will read:

- **Cost section:** «What The Truck (online fee + VAT): £0 a month excl. VAT, 3.95% per online payment, card fee included»
- **Fee per online order** and **Card fee:** «3.95% per online payment, card fee included». Today the card fee cell says "doesn't say".
- **The cost model** (Admin › Pricing check): £1,000 a month at 100 orders now gives **£39.50**, not £74.50. Stripe's rate is no longer added on top.

### Favrit NO and WEIQ SE (each own price page read once)

**Favrit** (https://web.favrit.com/pris):

- **no rate stated.** No card or transaction fee appears for "Alt-i-ett kassesystem" or any plan.
- The page only points to a price guide: «Lurer du på hva et kassesystem koster totalt, med terminaler, utstyr og transaksjoner? Se prisguiden.»
- **Change: `card_mode` bundled → 'unknown'.**
- (The page gives "fra 699 kr/mnd" in its title and «Fra 899 kr/mnd … Per sted, eks. mva» in its body. The stored NOK 899 is unchanged.)

**WEIQ** (https://weiq.tech/pris/):

- **no rate stated for säsongspaket.** The only rate is an FAQ example for another plan: «Transaktionsavgiften är den procent som dras vid varje betalning (t.ex. 0,8% för WEIQ Easy).» "Inlösen ingår" is listed for Easy and Free, not for the seasonal package.
- **Change: `card_mode` bundled → 'unknown'.**
- (The page gives «8000 SEK per år» and no VAT wording; stored unchanged.)

**What 'unknown' changes:**

- On the page, nothing visible: the card fee cell was already "doesn't say", and the per-order cell is "No fee" as before.
- In the cost model, our Stripe rate is still assumed, as it is for 182 other shown plans.

### The proof

The migration's own do-block compares two md5s before and after, inside the transaction:

- every `competitor_plans` row with the five named columns removed (plan_name, card_mode, card_bps, card_fixed_minor, truck_fee_bps);
- every other row, whole.

Both were equal (`c3eaa624…` / `bab00c1f…`) in the pre-flight and in the applied run. The pre-flight's after-rollback counts and checksums were identical.

## 4 · Publish

| Step | Result |
|---|---|
| Dry run (rolled back) | **96 live; no change at all** (the same line-ups, none dropped; GB Ordea · What The Truck · Hatches Up · Square; NO Favrit · Superb; SE WEIQ · Vitrina) |
| Publish | no change; revalidate 200 |
| Verify | **96 live**; shown 212 = marked 212 (0 shown-but-unmarked, 0 marked-but-unshown); **AE false / false**; What The Truck's plan, Favrit's and WEIQ's marked |

## 5 · Max rows, and what the live pages show

**The deployed read couldn't be run exactly, without breaking the hard limits.**

- `listAll` goes through Supabase's REST API with the service-role key, which is only in `.env.local`, and this prompt forbids opening any .env file.
- `scripts/db-migrate.cjs` reads only the database URL, and the publish's `pg` connection doesn't pass through Max rows.
- The publishable key can't measure it either: these tables have RLS with no policies, so it returns 0 rows.

**What I read instead (read-only):**

- **PostgREST's role settings** (`pg_roles.rolconfig` for authenticator, anon, service_role, authenticated): none sets `db_max_rows`. The cap is the dashboard's setting, which the database doesn't expose.
- **The live GB page, read once.** It runs the deployed unpaged `listAll`. Its columns are **HatchGrab and Ordea only**, «Last checked: 24 November 2026», with:
  - «Free: £0 a month, 3% per order»;
  - Ordea's card fee «1.5% + 20p per card payment».

  What The Truck (plan row 1,049), Square (1,052) and Hatches Up (1,057) are still missing, so **the read still returns at most 1,000 rows**.

**Result: 1,000.** The live pages stay short until you raise Max rows (≥ 1,100 is enough for now; 10,000 leaves room) or the batch deploy ships `e9626ca8`. FR, US and RE weren't read, as the prompt says for this branch.

## 6 · What needs you

1. **The live pages are still short (47 of 212 shown tools missing, five pages with no competitor).** Either fix works:
   - **raise Max rows** in the Supabase dashboard (API settings). It takes effect at once, with no deploy.
   - **ship `e9626ca8`** in the batch deploy. That works whatever the setting is.

   Doing both is safest. One caveat: if Max rows were ever set *below* 1,000, `pageAll` would stop after the first short page, so keep it at 1,000 or above.
2. **When the missing tools appear, GB, AU, CA, ES, FR, IE, JP and US lose their two price answers.** Square (and in GB What The Truck and Hatches Up) is bundled, and `priceAt` stays off where a bundled tool is shown, as you decided. GB shows them today only because it compares against Ordea alone.
3. **The renamed plan.** "What The Truck (online fee + VAT)" is the shown name. `data/compare-square-1` still names the plan "What The Truck". Files import once by checksum, so nothing happens. But if that build is ever re-run and its file changes, the importer would add a second plan under the old name. Rebuild from the stored names first (the plan-names-1 rule).
4. **Favrit and WEIQ** keep "doesn't say" for the card fee. Their price guides or terms might state a rate, but per the one-request rule I didn't read them.

## Flags

- Nothing arrived garbled, and no instruction contradicted another.
- **Step 4's exact read (the deployed `listAll`) wasn't run.** It needs the service-role key from .env.local, which this prompt forbids opening. The live GB page, which runs that same read, stood in (§5).
- **Own-site reads, one request each:** web.favrit.com/pris, weiq.tech/pris/, and the live GB comparison page.
- Every SQL statement is in docs/compare-calc-fix-1/sql.txt.
- **Commits** (france-vat-1, not pushed):
  - `e9626ca8`: code, harness, harnesses.json;
  - `2e9e2040`: migration 20261147;
  - this report and sql.txt.
