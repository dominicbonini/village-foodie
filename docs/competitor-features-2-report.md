# competitor-features-2: a leaner, fairer competitor checker

*3 November 2026. Committed on `main`; not pushed and not deployed. One migration (20261062), committed first, run with `scripts/db-migrate.cjs` and verified read-only. No row of any existing table was changed or deleted. No public page's layout changed. Public comparisons are still off everywhere except DE (admin only).*

| # | Item | Outcome |
|---|---|---|
| 1 | Tiers in `features.json` | **Done.** 46 features: core 25, commercial 6, secondary 11, off 4. `notify` is added. The importer applies the tiers on the next deploy. |
| 2 | Frequency by tier | **Done.** Intervals live in `competitor_check_settings.tier_intervals` (30 / 90 / 180 days). A check asks only the due features. A new feature is due at once. The caps are unchanged. |
| 3 | `not_mentioned` | **Done.** It is in the CHECK, the prompt, the validation and Admin's accept, in both languages, and never shown as No. The 49 existing "no" answers are untouched and marked to be judged again. |
| 4 | Focus | **Done.** Street-food markets get discovery and the commercial features only. Comparison pages never mark them down. |
| 5 | Cost | **Before ≈ $4.05 a month, after ≈ $8.70 a month** (≈ $12.16 in the first month while it catches up). The arithmetic is in §5. |
| 6 | Proof | `scripts/competitor-features-2.cjs`, registered: **79 passed, 0 failed.** Full sweep green after one re-pin, with no failures shared with HEAD (§6). |

Commits: `1ecc042d` (the migration) and `d8414b10` (the code, words, harness and this report).

## 1 · Tiers in `features.json`

The `features.json` id is `competitor-features-2`, with `checked_on` 2026-11-03. Every feature now carries `tier`. `checked` must equal `tier !== 'off'`, and the importer refuses the file otherwise.

| Tier | Interval | Features |
|---|---|---|
| **core** (25) | 90 days | preorder, capacity, ahead, schedule, walkup, stock, **notify**, menuphoto, cards, localpay ("some"), paypal ("some"), kds, tickets, offline, vans, domain, whatsapp, social, discovery ("some": GB), ipad, android, hardware, terminal, and **asap** and **custfee** (checked but hidden) |
| **commercial** (6) | 30 days | monthly, perorder, cardfee, term, setup, trial |
| **secondary** (11) | 180 days | options, tips, staff, reports, loyalty, private, igmsg, paymethods, payattruck (all hidden), plus fiscal (keeps its "some") and delivery (keeps showing, "collection only") |
| **off** (4) | never | allergens, deals, qr, buzzers. `checked` is false; their answers are kept and nothing is deleted. |

**The new `notify` feature:**
- Label "Customers told when their order is ready" / "Gäste erfahren, wann ihre Bestellung fertig ist".
- Explanation as the brief gave it, and the German equivalent.
- Group ordering, shown everywhere, source `fixed:partial:note`.
- HatchGrab's answer is **Partly**, with the note "email when the order-ready step is on, and an order-status page; no SMS, WhatsApp or push" (German: "E-Mail, wenn der Schritt „Bestellung fertig“ an ist, und eine Statusseite zur Bestellung; keine SMS, kein WhatsApp, kein Push").

**What the code does, proven in §5 of the harness:**
- `deliverReadyEmail` sends the customer the "ready" email at the Ready step. The KDS sends it at once; the dashboard sends it after its 4-second undo window. Ready exists only where the event type's `order_ready` step is on.
- The order page `/order/<id>/manage` shows the status, with "ready" in green.
- Nothing sends an SMS or a push notification.
- `sendWhatsApp` is used only by the inbound webhook, for the truck's auto-replies.

> ⚠️ **Flag: "live" dropped from our answer.** The order page reads its status **once, when it is opened**. It has no polling and no push. So HatchGrab's note says "an order-status page", not "a live order-status page". The explanation keeps the brief's words, because it describes what competitors might offer.

**How the importer applies it** (`lib/data-import/features.ts`):
- A new key is inserted with its tier.
- An existing key whose **stored tier differs from the file's** gets the file's tier, `checked`, `show_scope` and `show_countries`. Today every stored tier is null, so all 45 existing rows take the file's values once.
- After that, the tiers match, so a rerun writes nothing, and Admin's later choices stay (proven: Admin ticks allergens back on, a later file adds a feature, and allergens stays ticked).
- A newly added checked feature makes every active competitor due at once.

> ⚠️ **Flag: allergens is off but still shown.** It keeps `show_scope: all`, so its current answers stay on the comparison pages. The checker will simply never ask about it again. If you'd rather hide it, that is a one-word change in `features.json` (`"show_scope": "hidden"`).

**Pages: rows change, layout doesn't.**
- The comparison pages gain the **notify** row and lose **payattruck** (now hidden).
- That is content, not layout: same table, same groups, same columns.
- Admin's Feature list shows 46 features.

## 2 · Frequency by tier

**Settings:**
- `competitor_check_settings.tier_intervals` defaults to `{"commercial": 30, "core": 90, "secondary": 180}`. Off is never asked.
- The values are read tolerantly: a missing or bad value falls back to its default (`tierIntervalsOut`). Nothing is hard-coded except those fallbacks.

**When was each feature last asked about?**
- A new scheduling table, `competitor_feature_checks`, records it per competitor and per country (`''` = every country).
- Only the checker writes it, and it holds scheduling data only (35.an-3). The answers stay in `competitor_feature_values`, which the checker never writes.
- A feature is **due** when it has no row (a new feature, or never asked) or when `checked_on + its tier's interval ≤ today`.
- A country check reads that country's row first, then the every-country row.

**What each kind of check asks:**

| Check | What it asks |
|---|---|
| **Routine check** | Only the due features that apply to the competitor's focus |
| **Quick pass** | The features shown on the country's page that apply **and** are due |
| **Deep check** (the full check Admin starts) | Every feature that applies (not off, right focus), due or not |

**After a check:**
- The features it asked about are recorded as checked today.
- A timed-out (incomplete) check records nothing, so its features stay due.

**The competitor's next check** comes after the most frequent tier that applies to it. That is 30 days, because every focus is asked the commercial features. The routine quota and the spread of first dates use the same 30 days. Before the migration ran (no `tier_intervals`), the checker kept the old single interval.

> ⚠️ **Flag: the per-competitor interval is no longer used once tiers exist.** `competitors.check_interval_days` is ignored when `tier_intervals` is present: the tier intervals decide. Before, it was each competitor's own interval (90 for all today).

**Unchanged:** the caps (35.an-15 and 35.an-16): `budgetStop`, the daily cap $8, the monthly cap $90, and `deep_per_day` 15.

> **Note on the quick pass's cache:** its first block lists the features it asks about. It used to be the same for every competitor in a country; now it varies with each competitor's due set, so that block is cached less often. The quick pass is cheap ($0.0056 a check), so this is small.

## 3 · `not_mentioned`

- **The value.** The migration adds `not_mentioned` to `competitor_feature_values_value_check`. `FEATURE_VALUES` and the tool's `feature` enum include it.
- **The prompt** (`EXTRACTOR_SYSTEM`):
  - "no" ONLY with a verbatim quote in which the competitor itself says it does not offer the feature, and never because a page doesn't mention it;
  - `not_mentioned` (outcome `not_stated`, no quote) when the site doesn't mention it;
  - `unknown` when the pages that would say could not be read;
  - a stored answer marked `"rejudge": true` must be answered again under these rules.
- **The validation** (`validateRecordFindings`, per finding):
  - A feature "no" needs a quote (or its English translation) containing a negation, in the list's languages (`saysNotOffered`). Otherwise the finding is unusable: it is left out and logged, and the model is told why.
  - `not_mentioned` with any outcome, and `not_stated` on a feature, are both normalised to outcome `not_stated` with answer `not_mentioned`.
  - The negation test is deliberately broad: it rejects a "no" whose quote has no negation at all. It can't prove that the negation is about this feature; the second check still verifies every changed answer.
- **Admin's accept** writes `not_mentioned`. An older `not_stated` finding without that answer still saves `unknown`.
- **The words:**
  - "Not mentioned on their website" / "Auf der Website nicht erwähnt" on comparison pages;
  - "Not mentioned on their website" in Admin's Pricing check (en-GB only; Admin isn't translated);
  - shown in the neutral grey of "Not stated", **never as No** and never the red of No.
  - One CSS selector was added to the existing grey rule; there is no layout change.
- **Existing "no" answers: 49.** They are left exactly as they are, and are seeded as `rejudge = true` in `competitor_feature_checks`, with their own `checked_on`.
  - They are judged again at their tier's next check: core 90 days after their date, secondary 180.
  - Their stored answer shows `"rejudge": true` to the model until then.
  - Once asked, the mark is cleared.
  - If Admin changes such an answer away from "no", the mark is ignored.

## 4 · Focus

**Today's focus usage:**

| Lifecycle | Focus | Competitors |
|---|---|---|
| active | food_truck | 59 |
| active | nearest_local | 64 |
| active | street_food_markets | **5** |
| active | pop_up | 1 |
| active | (none) | 3 |
| candidate | (none) | 69 |
| candidate | pos | 6 |

**The rule** (`FOCUS_ONLY` in `lib/comparison-features.ts`):
- **street_food_markets** competitors are asked only **discovery** and the **commercial** features.
- Every other focus (and none) is asked core and secondary.

**Comparison pages:**
- A market's cell for a feature that doesn't apply says "does not apply to a market" / "gilt nicht für einen Markt". It is neither yes nor no, and is styled neutral.
- Its price rows show its plan as before.
- Its verification (public or not) counts only the features that apply.

## 5 · Cost

**Measured** (`competitor_check_runs`, read-only): routine checks cost **$0.0921 each** (18 checks, $1.66). Quick pass $0.0056; deep $0.1265 (Admin-started, so not part of the monthly running cost). The models are Haiku 5.5 for both extractor and verifier.

**Before:** 132 active competitors, each with a routine check every 90 days:
- 132 × 30 / 90 = **44 checks a month**
- 44 × $0.0921 = **$4.05 a month**

**After (steady state):** every active competitor is checked every 30 days, because the commercial tier is due:
- 132 × 30 / 30 = **132 checks a month**
- Each check asks fewer features. Per 90 days a competitor gets 3 checks: commercial every time (6), core once (25) and secondary every other cycle (11). That is 6 + 25/3 + 11/6 = **16.2 features a check on average, of 42** (39 %).
- How a routine check's cost splits today: 202 findings and 168 verifications in 18 checks, so 9.3 verifications per check, of which 7.1 are feature ones (128 / 168 = 76 %). A verification reads one page (about 14k input tokens), so verifications are about 130k of a check's 234k input tokens (56 %), and the feature ones about 42 % of the check. Adding the feature list and feature findings in the extractor (about 4 %) puts the **feature part at ≈ 46 %**:
  - feature part = 0.46 × $0.0921 = **$0.042**
  - base (pages and prices) = **$0.050**
- After: $0.050 + 0.39 × $0.042 = **$0.066 a check**
- 132 × $0.066 = **≈ $8.70 a month**

**First month (catch-up):**
- Only 219 of the 5,940 current answers carry a checked date, so almost every feature is due at once.
- Deploying adds `notify`, which makes every active competitor due today.
- The routine quota (⌈132 / 30⌉ + catch-up a day) works through them in about a month, each check asking about all ~42 features at today's cost: 132 × $0.0921 = **≈ $12.16**.
- After that, ≈ $8.70.

**Re-judging the 49 "no" answers:**
- A re-judged answer comes back as `not_mentioned` (no verification) or as a quoted "no" (one verification): at most 49 × ≈ $0.004 ≈ **$0.20**, once.

**Both figures are far inside the $90 monthly cap.** The upper bound, if fewer features saved nothing, is 132 × $0.0921 = $12.16 a month.

## 6 · Proof

**`scripts/competitor-features-2.cjs`** (registered): **79 passed, 0 failed**. No network, no database, no Claude API.

1. **The importer:**
   - the file's 46 features in their tiers;
   - today's 45 untiered rows re-tiered, with notify added and due at once for active competitors (not candidates);
   - the OFF ticks turned off with their answers kept;
   - a rerun is a no-op, both by sha256 and run by hand;
   - Admin's later choice stays;
   - a bad tier or a mismatched `checked` is refused.
2. **Due features**, per tier and per focus:
   - per tier: core 94 days → due; 33 days → not; commercial 33 days → due; secondary 155 days → not; never asked → due; off → never; exactly on the interval's last day → due;
   - per focus: a market gets discovery and commercial only, other focuses get core and secondary;
   - per country, the country's own row is read first;
   - the intervals come from settings;
   - a real routine run asks exactly whatsapp, term and discovery, shows the rejudge mark, records the three as checked, and sets the next check 30 days out;
   - the deep check asks every applicable feature, and a market's deep check asks term and discovery;
   - before the migration it behaves as before;
   - the quick pass asks the same features.
3. **`not_mentioned`:**
   - a fixture page that doesn't mention loyalty → a `not_mentioned` finding (outcome `not_stated`, no quote, nothing to verify);
   - the model's "no" quoting a price line is rejected and logged, while its "no" quoting "WhatsApp: nicht verfügbar." is kept;
   - negations in seven languages are recognised;
   - Admin's accept writes `not_mentioned`, while an older finding still writes `unknown`;
   - the migration leaves existing "no" answers alone and marks them rejudge.
4. **DE admin comparison:**
   - Testanbieter A's WhatsApp cell reads "Auf der Website nicht erwähnt", with value `not_mentioned`, the neutral class and not "Nein";
   - the .json twin carries `not_mentioned`;
   - a market's WhatsApp cell (stored "no") reads "gilt nicht für einen Markt", with its price row intact;
   - the notify row reads "Teilweise, E-Mail, wenn der Schritt „Bestellung fertig“ an ist, …".
5. **notify's answer comes from the code:** the ready email and its `order_ready` step; the order page's status; no SMS; `sendWhatsApp` only in the inbound webhook; no push anywhere; the words in both languages.
6. **The migration and the store:**
   - one transaction, with RLS and no anon/authenticated grants;
   - no `update` or `delete` statements;
   - the store's tolerant reads, and `markFeaturesChecked` writing only `competitor_feature_checks`.

**Re-pins** (each marked ⚠️ RE-PINNED with this report's name):
- `competitor-check-1.cjs`: 46 features; 42 checked ones make competitors due; the test file's new feature has a tier; the routine wording mentions "rejudge".
- `pricing-check-1.cjs`: 46 features, checked = not off; 14 hidden.
- `comparison-features-1-screens.cjs`: 46 rows in Admin's Feature list.
- `faq-3.cjs` §5: the comparison pages are rendered with the feature list as it was, through the new named module `scripts/_lp-competitor-features-2.cjs`.
- `faq-1.cjs`: 20261062 joins the migrations that follow faq-1's.
- `_competitor-check-1-fixtures.cjs`: the memory import store gains `updateFeature`.

**Full sweep** (`node scripts/run-harnesses.cjs`, 186 registered harnesses including the new one):
- **185 passed and 1 failed** on the first run.
- The failure was **faq-1.cjs**, which pins the list of migrations after its own. It failed because of this change's new 20261062, so it is not shared with HEAD. It is re-pinned and now passes **205 / 205**.
- **Failures shared with HEAD: none.** tidy-1 left the sweep fully green at 63f52dc4.

## 7 · The migration as run

`supabase/migrations/20261062_competitor_features_2.sql` (committed at `1ecc042d`), run with:

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261062_competitor_features_2.sql
db-migrate: supabase/migrations/20261062_competitor_features_2.sql · sha256 b3ae7a243e328fe0 · committed at 1ecc042d
  notice: constraint "comparison_features_tier_check" of relation "comparison_features" does not exist, skipping
  notice: constraint "competitor_check_settings_tier_intervals_chk" of relation "competitor_check_settings" does not exist, skipping
db-migrate: supabase/migrations/20261062_competitor_features_2.sql applied — one transaction, no error
```

**Before** (read-only): 5,940 current answers, 219 with a checked date, 49 current "no" (all dated), 45 features, 132 active competitors, 75 candidates.

**Verify (read-only MCP):**

```sql
select
  (select data_type || ' · nullable=' || is_nullable from information_schema.columns where table_schema='public' and table_name='comparison_features' and column_name='tier') as tier_column,
  (select pg_get_constraintdef(oid) from pg_constraint where conname='comparison_features_tier_check') as tier_check,
  (select tier_intervals::text from competitor_check_settings where id) as tier_intervals,
  (select pg_get_constraintdef(oid) from pg_constraint where conname='competitor_feature_values_value_check') as value_check,
  (select relrowsecurity from pg_class where oid='public.competitor_feature_checks'::regclass) as checks_rls,
  (select count(*) from competitor_feature_checks) as checks_rows,
  (select count(*) from competitor_feature_checks where rejudge) as rejudge_rows,
  (select count(*) from competitor_feature_values where superseded_at is null and value='no') as current_no_unchanged,
  (select count(*) from competitor_feature_values where superseded_at is null) as current_answers_unchanged,
  (select count(*) from comparison_features where tier is null) as features_untiered,
  (select string_agg(privilege_type || ':' || grantee, ', ' order by grantee, privilege_type) from information_schema.role_table_grants where table_name='competitor_feature_checks' and grantee in ('anon','authenticated')) as anon_auth_grants;
```

| Column | Result |
|---|---|
| tier_column | text · nullable=YES |
| tier_check | CHECK (((tier IS NULL) OR (tier = ANY (ARRAY['core', 'commercial', 'secondary', 'off'])))) |
| tier_intervals | {"core": 90, "secondary": 180, "commercial": 30} |
| value_check | CHECK ((value = ANY (ARRAY['yes', 'no', 'partial', 'unknown', 'not_mentioned']))) |
| checks_rls | true |
| checks_rows | 219 |
| rejudge_rows | **49** |
| current_no_unchanged | 49 |
| current_answers_unchanged | 5940 |
| features_untiered | 45 (the importer tiers them on the next deploy) |
| anon_auth_grants | null (none) |

**Until you push and deploy, nothing behaves differently.**
- The scheduled checker runs the deployed code, which ignores the new column and table, and the CHECK only widened.
- On deploy, the automatic importer sees the new `features.json`. It tiers the 45 rows, adds `notify`, and marks every active competitor due.

## 8 · Undo (only if Dominic asks)

```sql
begin;
drop table if exists public.competitor_feature_checks;
-- only once no answer is 'not_mentioned' (select count(*) from competitor_feature_values where value = 'not_mentioned'):
alter table public.competitor_feature_values drop constraint if exists competitor_feature_values_value_check;
alter table public.competitor_feature_values add constraint competitor_feature_values_value_check check (value in ('yes', 'no', 'partial', 'unknown'));
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_tier_intervals_chk;
alter table public.competitor_check_settings drop column if exists tier_intervals;
alter table public.comparison_features drop constraint if exists comparison_features_tier_check;
alter table public.comparison_features drop column if exists tier;
commit;
```

Then revert the code commit. To restore the four OFF features' ticks after an import has run, re-import the previous `features.json`, or tick them in Admin.
