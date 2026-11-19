# plans-readiness-1 — which countries are live, in which language, and what's needed for all three plans everywhere

19 November 2026. **Review only.** Nothing was changed, written or committed. Every query was a read-only SELECT, and each is shown below.

## Summary

- **Countries:** 210 of the 211 country rows are switched on; only Mexico is off. They use **103 locales in 50 languages**.
  - Every enabled locale has its messages file.
  - **8 installed locales are used by no live country:** en-BB, en-PH, fil-PH, fr-CI, hi-IN, ta-LK, ur-PK, vi-VN.
- **Unlimited is on sale in all 210.** Pay as you go and Pro are on sale in **46**: the countries where HatchGrab can take its fee from the card payment.
  - In the other **164**, both rows exist but aren't on sale.
  - All 164 have `platform_fee_allowed = false`. 160 also have no online payments for trucks (`billed_at_truck`); 4 have online payments but no application fees (BR, MY, SG, TH, `billed_online`).
- **Billing is switched off.** None of the four tax prerequisites (VAT capture, threshold logging, sanctions check, OSS) is built or done.
  - **The live terms don't describe post-pay.** They describe the opposite: no fee on pay-at-truck orders, the fee deducted at the transaction, no pause.
- **The guard is not the obstacle.** Once `billing_enabled` is true, it already allows Pay as you go and Pro in **all 164**, because none is a take-the-fee-from-the-payment country. The SQL is in §4, not run.
  - **Your own rule still holds back 37 of them** until VAT-number capture exists: 36 at-truck countries and Brazil.
  - **AE, GP, MQ and RE already have the two plans on sale** under the same rule.
- **No real truck is in any of the 164 countries.** All 12 real trucks are in card countries.

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** none.
- **One term mapped:** "no Stripe Connect for trucks, i.e. no online payments" is `country_billing.payment_model = 'billed_at_truck'`. That is the code's one answer to "can trucks here take online card payments?" (`lib/country-settings-types.ts` `offersOnlineCardPayments`).

## 1 · Live countries and languages

```sql
select enabled, count(*) from country_settings group by enabled order by enabled desc;
-- true 210 · false 1

select country_code, name, locale, enabled from country_settings where not enabled;
-- MX Mexico es-MX false

select count(distinct locale) as locales, count(distinct split_part(locale, '-', 1)) as languages from country_settings where enabled;
-- 103 locales · 50 languages

select locale, count(*) as countries, string_agg(country_code, ' ' order by country_code) as codes
  from country_settings where enabled group by locale order by count(*) desc, locale;
```

**Enabled countries by locale** (103 locales; the 63 used by a single country are listed together at the end):

| Locale | Countries | Codes |
|---|---|---|
| en-JM | 16 | AG AI BM BZ DM GD GY JM KN KY LC MS SX TC VC VG |
| en-GB | 14 | BT FK GB GG IM IN JE KH LA MV PK SH TJ TM |
| en-AU | 13 | AU CC CX FJ KI NF NR PG SB TO TV VU WS |
| fr-SN | 13 | BF BI BJ CF DJ GA GN KM MG NE SN TD TG |
| fr-FR | 12 | BL FR GF GP MF MQ NC PF PM RE WF YT |
| en-US | 8 | AS FM GU MH MP PW US VI |
| en-KE | 7 | ER ET MU MW SC UG ZM |
| en-ZA | 6 | BW LS NA SZ ZA ZW |
| en-NZ | 5 | CK NU NZ PN TK |
| nl-NL | 5 | AW BQ CW NL SR |
| da-DK, en-GH, it-IT, pt-AO | 3 each | DK FO GL · GM LR SL · IT SM VA · AO GW ST |
| ar-AE, es-ES, fr-MA, ms-MY, nb-NO, pt-PT, ro-RO, sr-RS, sv-SE, zh-HK | 2 each | AE MR · ES GQ · DZ MA · BN MY · NO SJ · PT TL · MD RO · ME RS · AX SE · HK MO |
| 63 locales | 1 each | ar-BH BH, ar-EG EG, ar-JO JO, ar-KW KW, ar-OM OM, ar-QA QA, ar-SA SA, az-AZ AZ, bg-BG BG, bn-BD BD, bs-BA BA, ca-AD AD, cs-CZ CZ, de-AT AT, de-CH CH, de-DE DE, de-LI LI, el-CY CY, el-GR GR, en-BS BS, en-CA CA, en-GI GI, en-IE IE, en-MT MT, en-NG NG, en-SG SG, en-TT TT, es-AR … es-UY (16 Latin American countries, **PR on es-MX**), et-EE EE, fi-FI FI, fr-LU LU, fr-MC MC, fr-TN TN, he-IL IL, hr-HR HR, hu-HU HU, hy-AM AM, id-ID ID, is-IS IS, ja-JP JP, ka-GE GE, kk-KZ KZ, ko-KR KR, lt-LT LT, lv-LV LV, mk-MK MK, mn-MN MN, ne-NP NP, nl-BE BE, pl-PL PL, pt-BR BR, pt-CV CV, pt-MZ MZ, ru-KZ KG, si-LK LK, sk-SK SK, sl-SI SI, sq-AL AL, sw-TZ TZ, th-TH TH, tr-TR TR, uk-UA UA, uz-UZ UZ, zh-TW TW |

**Installed in `messages/` (111 files) but used by no enabled country (8):**

| Locale | Why unused (observed) |
|---|---|
| hi-IN | India is on **en-GB** (world-countries-5's stated choice) |
| ur-PK | Pakistan is on **en-GB** (same) |
| ta-LK | Sri Lanka is on **si-LK**; ta-LK was planned as the alternative |
| fil-PH, en-PH | the Philippines has no country row (on the "cannot sell" list) |
| vi-VN | Vietnam has no row (cannot sell) |
| fr-CI | Côte d'Ivoire has no row (cannot sell) |
| en-BB | Barbados has no row (cannot sell) |

```sql
select country_code, name, locale, enabled from country_settings where country_code in ('BB','PH','CI','IN','PK','VN','LK') order by country_code;
-- IN India en-GB true · LK Sri Lanka si-LK true · PK Pakistan en-GB true   (BB, PH, CI, VN: no row)
```

- **Every enabled locale has its messages file.** si-LK, sw-TZ and ta-LK were installed by languages-world-3 since 18 Nov.
- There is no "second language per country" mechanism; each country has one locale.

## 2 · Plans on sale in the enabled countries

```sql
select pp.plan_key, count(*) filter (where pp.offered) as on_sale, count(*) filter (where not pp.offered) as row_not_on_sale,
       (select count(*) from country_settings where enabled) - count(*) as no_row
  from plan_prices pp join country_settings cs on cs.country_code = pp.country_code and cs.enabled
 group by pp.plan_key order by pp.plan_key;
-- payg      46 on sale · 164 not · 0 without a row
-- pro       46 on sale · 164 not · 0 without a row
-- unlimited 210 on sale · 0 not   · 0 without a row

select cb.payment_model, cs.platform_fee_allowed, cs.enabled, count(*) as countries,
       count(*) filter (where exists (select 1 from plan_prices p where p.country_code=cs.country_code and p.plan_key='payg' and p.offered)) as payg_on,
       count(*) filter (where exists (select 1 from plan_prices p where p.country_code=cs.country_code and p.plan_key='pro' and p.offered)) as pro_on
  from country_settings cs left join country_billing cb on cb.country_code = cs.country_code
 group by 1,2,3 order by 3 desc,1,2;
-- billed_at_truck  · fee not allowed · enabled  · 160 · payg 0  · pro 0
-- billed_online    · fee not allowed · enabled  ·   4 · payg 0  · pro 0
-- fee_from_payment · fee allowed     · enabled  ·  46 · payg 46 · pro 46
-- billed_online    · fee not allowed · disabled ·   1 (MX)
```

**All three plans on sale: 46 countries.** These are the card countries (`fee_from_payment`, fee allowed): AE AT AU BE BG CA CH CY CZ DE DK EE ES FI FR GB GF GI GP GR HK HR HU IE IT JP LI LT LU LV MF MQ MT NL NO NZ PL PR PT RE RO SE SI SK US YT.

**Pay as you go and Pro NOT on sale: 164 countries.** Both are off in every one of them; no country has only one of the two off.
- In each, the rows exist with fee_bps 99, Unlimited is on sale, and Unlimited is the trial-end plan.
- The per-country query is the long one shown in chat; its result is summarised here.

| Why | Count | Countries |
|---|---|---|
| **No online payments** (`billed_at_truck`) **and** fee not allowed | 160 | AD AG AI AL AM AO AR AS AW AX AZ BA BD BF BH BI BJ BL BM BN BO BQ BS BT BW BZ CC CF CK CL CO CR CV CW CX DJ DM DO DZ EC EG ER ET FJ FK FM FO GA GD GE GG GL GM GN GQ GT GU GW GY HN ID IL IM IN IS JE JM JO KG KH KI KM KN KR KW KY KZ LA LC LK LR LS MA MC MD ME MG MH MK MN MO MP MR MS MU MV MW MZ NA NC NE NF NG NI NP NR NU OM PA PE PF PG PK PM PN PW PY QA RS SA SB SC SH SJ SL SM SN SR ST SV SX SZ TC TD TG TJ TK TL TM TN TO TR TT TV TW TZ UA UG UY UZ VA VC VG VI VU WF WS ZA ZM ZW |
| **Fee not allowed only** (online payments exist; `billed_online`) | 4 | BR MY SG TH |
| Other | 0 | — |

## 3 · Billing readiness

```sql
select * from platform_switches;
-- billing_enabled false · billing_pause_after_days 5 · billing_suspend_warning_days 6 (also: reviews, weather, loyalty all false)

select platform_fee_enabled, platform_fee_allowed, count(*) from country_settings where enabled group by 1,2 order by 1,2;
-- fee off · not allowed · 164   |   fee off · allowed · 46      → no platform fee is taken anywhere

select cb.payment_model, cs.vat_number_required, count(*) as countries, string_agg(cs.country_code, ' ' order by cs.country_code) as codes
  from country_settings cs join country_billing cb on cb.country_code = cs.country_code where cs.enabled group by 1,2 order by 1,2;
```

**`country_billing.payment_model`** (all 211 rows):

| Model | Enabled | Of which VAT number required |
|---|---|---|
| `fee_from_payment` (a) | 46 | 4: AE GP MQ RE |
| `billed_online` (b) | 4 (+ MX, off) | 1: BR |
| `billed_at_truck` (c) | 160 | 36: AL AM AX BD BF BH BJ CF CL CO CV GA GD GE IN KG KR KZ LS MA MD ME MK MR MW OM PE RS SA SL SN TG TJ TR TZ UZ |

**Prerequisites from the manual's Open items:**

| Item | Prerequisite | State (how checked) |
|---|---|---|
| 15 | Billing switch-on, with the Stripe Dashboard hand steps: Pix (test, then live); Stripe customer emails OFF; the billing webhook and its secret in Vercel; Checkout branding; Wise EUR/USD payout accounts | **Not done.** Manual §89.1 lists the switch-on steps with "none of it is done". `lib/billing/processor.ts` still refuses any key that isn't `sk_test_`, so the live key is not wired. The Dashboard steps can't be seen read-only, and no report records any of them. |
| 15 | 🔴 Lock the account 7 days after the pause | **Not built.** No lock code or column in `lib/billing`, the API or the migrations. The pause date + 6 is wording only (§89.1 rule 5). |
| 19 | VAT / tax-number capture at signup and in Manage › Settings (VIES for the EU) | **Not built.** Only the per-country flag exists (`country_settings.vat_number_required`, 41 enabled countries). No `vat_number` / `tax_number` field, form or VIES call anywhere in `app`, `lib`, `components` or the migrations. |
| 20 | Threshold logging (each country's threshold, billed revenue per country / state / province, Admin %, alerts at 75%, signups stop at 90%) | **Not built.** No threshold or turnover table or code. |
| 21 | Sanctions name check at signup (UK and US lists) | **Not built** (no code). It holds back 9 countries that have **no row** (Haiti, Iraq, Lebanon, Libya, Mali, Myanmar, Palestine, South Sudan, Venezuela). It doesn't affect any live country. |
| 22 | EU non-Union OSS registration | **Not done** as far as the repo shows. It is a registration, not code, and nothing records it. The backlog warns that VAT is due from the first charge to an EU truck without a VAT number, so OSS should be in place **before billing charges any EU truck**. |
| (backlog 6) | Japan: the invoice / checkout says the customer accounts for consumption tax under the reverse charge | **Not built.** "Reverse charge" appears only in the comparison page's VAT sentence. |

**The live terms** (`content/legal/terms-and-conditions.md`, "Last updated 1 November 2026", last changed in `2b625a66`) **don't describe post-pay.** They contradict it:

| The live terms say | The billing build does (§89.1) |
|---|---|
| "HatchGrab fees on **online card orders**… **We charge no fee on Pay at Hatch orders** or on walk-up orders." | The fee is charged on **every pre-order**, including pay-at-truck ones (Decision 2). Models (b) and (c) invoice it monthly. |
| "We take only the platform fee agreed for your plan, **deducted at the point of the transaction**." | In 164 countries the fee is **invoiced on the 1st** with the plan, usage in arrears. |
| "Monthly plan fees are billed one month in advance." | ✓ the same (plans in advance) |
| "If a payment… is not made within **7 days**… your account moves to [the free] plan… **We do not lock you out.** You… can carry on taking orders." | **5 full days, then online ordering pauses**; a suspension warning follows (a lock is planned). |
| "At the end of the trial your account moves to the plan shown for your country… **In most countries that plan has no monthly fee.**" | In **164 of 210** countries the trial-end plan is **Unlimited**, which has a monthly fee, so "most countries" is now untrue. Nothing is charged while billing is off. |

The replacement terms are drafted, not published or translated: billing-1 §11 and billing-2 §10, with "30 days" notice as a placeholder.

## 4 · Putting Pay as you go and Pro on sale in every enabled country — steps and SQL (NOT RUN)

**How the guard decides** (live definition checked):
- `plan_prices_world_guard()` fires on `plan_prices` (insert / update / delete) and `country_settings` (insert / update), as statement-level AFTER triggers, **not deferrable**, so every statement must leave the data valid.
- **Rule (a)** refuses an offered row with `fee_bps > 0` in a country where the fee isn't allowed, **unless** `platform_switches.billing_enabled` is true **and** the country's `payment_model` isn't `fee_from_payment`.
- **Rule (b)** refuses an enabled country whose trial-end plan (its `is_trial_end` row, else the plans table's expiry fallback, Pay as you go) isn't offered.

```sql
select tgname, tgtype, tgdeferrable, tginitdeferred from pg_trigger where tgname in ('plan_prices_world_guard','country_settings_world_guard');
-- country_settings_world_guard 20 (AFTER INSERT/UPDATE, statement) · plan_prices_world_guard 28 (AFTER INSERT/DELETE/UPDATE, statement); neither deferrable
select length(pg_get_functiondef('public.plan_prices_world_guard'::regproc)) as len,
       position('payment_model <> ''fee_from_payment''' in pg_get_functiondef('public.plan_prices_world_guard'::regproc)) > 0 as has_billing_clause,
       position('is_trial_end' in pg_get_functiondef('public.plan_prices_world_guard'::regproc)) > 0 as has_trial_end_rule;
-- 1905 · true · true   (matches 20261086)
```

**Under the guard, all 164 become allowed** the moment billing is on: every one is model (b) or (c) and has a `country_billing` row. **The guard would refuse none of them.**

**The steps, in order:**
1. **Your decisions** (§5): VAT countries, trial-end plan, terms, threshold logging.
2. **Prerequisites:**
   - VAT-number capture (item 19), if the 37 VAT-required countries are included;
   - the new terms published in every language;
   - OSS registered (item 22), before any EU truck is charged.
3. **Billing switch-on day, manual §89.1** (each step is its own change):
   1. operator screens approved;
   2. pricing / FAQ / PDF wording;
   3. terms published;
   4. the live key in `processor.ts`;
   5. `platform_fee_enabled` per model-(a) country;
   6. the emails;
   7. **a migration setting `platform_switches.billing_enabled = true`**.
   - Mind Pizzeria Gusto's trial end (31 Dec): with billing on and no card, its online ordering would pause.
4. **Then this migration, through `scripts/db-migrate.cjs … --approved-by-dominic`** (it updates `plan_prices`). **Not run; not written to the repo.**

```sql
-- plans-everywhere — Pay as you go and Pro on sale in every enabled country that bills monthly (model b or c).
-- Needs platform_switches.billing_enabled = true (the world guard refuses it otherwise).
set lock_timeout = '3s';
begin;

do $$
begin
  if not coalesce((select billing_enabled from public.platform_switches where id), false) then
    raise exception 'plans-everywhere: billing is switched off — switch it on first';
  end if;
end $$;

update public.plan_prices pp
   set offered = true, updated_at = now()
  from public.country_settings cs
  join public.country_billing cb on cb.country_code = cs.country_code
 where pp.country_code = cs.country_code
   and cs.enabled
   and pp.plan_key in ('payg', 'pro')
   and not pp.offered
   and cb.payment_model in ('billed_online', 'billed_at_truck')
   and not cs.vat_number_required;   -- ← until VAT-number capture is built (Open item 19). Delete this line to include all 164.

commit;

-- VERIFY (read-only):
-- select pp.plan_key, count(*) filter (where pp.offered) as on_sale, count(*) filter (where not pp.offered) as off
--   from plan_prices pp join country_settings cs on cs.country_code = pp.country_code and cs.enabled group by 1 order by 1;
--   → with the VAT line: payg 173 on / 37 off · pro 173 / 37 · unlimited 210 / 0
--   → without it:        payg 210 / 0      · pro 210 / 0      · unlimited 210 / 0
```

- **Scope:** with the VAT line, **127 countries, 254 rows**; without it, **164 countries, 328 rows**.
- **Rule (b) is untouched:** the trial-end rows stay on Unlimited, which stays on sale.

**Optional second statement**, only if you decide that a finished trial should drop to Pay as you go (no monthly fee) in these countries, as it does in the 46 card countries and as the live terms say. It must run **after** the update above, in the same file, or rule (b) refuses it, because Pay as you go must already be offered:

```sql
update public.plan_prices pp
   set is_trial_end = false, updated_at = now()
  from public.country_settings cs
 where pp.country_code = cs.country_code and cs.enabled
   and pp.plan_key = 'unlimited' and pp.is_trial_end
   and exists (select 1 from public.plan_prices p2 where p2.country_code = pp.country_code and p2.plan_key = 'payg' and p2.offered);
-- each country then falls back to plans.is_expiry_fallback (Pay as you go)
```

**Undo (only if Dominic asks):** set `offered = false` for the same rows, after first restoring `is_trial_end` on Unlimited if the second statement ran. The guard allows that order.

**Where it still wouldn't be allowed, and why:**

| Countries | Blocked by | Why |
|---|---|---|
| **None** | the guard | All 164 are model (b) or (c) with a `country_billing` row. With `billing_enabled = true`, rule (a) passes, and rule (b) is untouched. |
| **37: AL AM AX BD BF BH BJ BR CF CL CO CV GA GD GE IN KG KR KZ LS MA MD ME MK MR MW OM PE RS SA SL SN TG TJ TR TZ UZ** | **your rule (11 Nov)** | "VAT number required": a truck there can't be billed without a valid number, so capture (item 19) must exist first. The SQL above leaves them out until then. |
| (already on sale) **AE GP MQ RE** | the same rule | VAT-required, yet model (a) with all three plans on sale today. Nothing is charged while the platform fee and billing are off. They can't be billed either until VAT capture exists, so leave their `platform_fee_enabled` off at switch-on, or take Pay as you go / Pro off sale there. |
| **Mexico** | not enabled | Off since 20261095 (cannot sell). Its rows are untouched by `cs.enabled`. |

**Two gaps to know before running it:**
- **Turning billing off afterwards is not refused.** The guard doesn't fire on `platform_switches` or `country_billing` (§89.1 known limits). A later `billing_enabled = false` would leave fee plans on sale where no fee can be collected.
- **Nothing proves Stripe can collect from trucks in all 164 countries.** The truck's card is billed by HatchGrab's own Stripe account; Pix through Invoicing is unproven. Test-mode billing passed 26/26 (GB-style), but no country-by-country card acceptance check exists.

**Who it affects today:** no real truck is in any of the 164.

```sql
select coalesce(cb.payment_model, '(no country)') as model, t.plan, count(*) as trucks
  from trucks t left join country_billing cb on cb.country_code = t.country where t.id not like 'demo-%' group by 1,2 order by 1,2;
-- fee_from_payment: demo 3 · payg 1 · trial 8   (nothing in billed_online or billed_at_truck)
```

## 5 · Your decisions still needed

1. **The 37 VAT-required countries:** wait for VAT-number capture (item 19), or offer the two plans there without billing them? And **AE, GP, MQ, RE**: take Pay as you go / Pro off sale until capture exists, or just keep their platform fee off?
2. **Trial-end plan in the 164:** keep Unlimited (paid), or drop to Pay as you go once it's on sale? The live terms say "in most countries that plan has no monthly fee", which is untrue today for 164 of 210.
3. **The terms:** approve and publish the post-pay section (billing-1 §11 / billing-2 §10) and its notice period ("30 days" placeholder), and have it translated.
4. **Threshold logging** (item 20): a prerequisite for billing switch-on, or after?
5. **The account lock** 7 days after the pause (item 15): build before switch-on, or keep pause-only?
6. **Guard turning billing off:** add a refusal on `platform_switches` while (b)/(c) fee plans are offered?
7. **Languages:** India and Pakistan stay on en-GB with hi-IN / ur-PK installed but unused? Is Sri Lanka's ta-LK to become a choice?

## 6 · Hard rules

- No writes: only the SELECTs above.
- No commit, deploy or landing-page change.
- Pizzeria Gusto and Le Roi du Churrasco were not read individually or touched. They appear only inside the anonymous truck counts.
- No .env file was opened.
