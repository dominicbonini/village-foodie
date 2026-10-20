# pricing-pages — Stage B of the new pricing

**Date:** 20 October 2026 · **Branch:** main (uncommitted; nothing pushed or deployed)

**Summary.** Every public pricing surface is now built from the plan data: the landing pricing section, /features, /compare, the plans PDF and Manage › Billing. Plan names, prices, allowances, fees, trial length, switches, the highlighted plan and the card subtitles all come from `plans` / `plan_prices` / `plan_features` through `lib/plans.ts`. The frozen Starter / Pro / Max copy, `lib/legacy-pricing-display.ts`, is deleted, and nothing reads the six retired `country_settings` columns any more.

One migration is needed: `20261026_pricing_pages.sql` (**NOT RUN — run now, before this code is served**). It is checked live: the new columns are absent, and the trial is still 4 months.

---

## 1 · SQL, in run order

### 1a · `supabase/migrations/20261026_pricing_pages.sql` — NOT RUN — **run now**

```sql
update public.plan_prices set fee_bps = 99 where plan_key = 'payg' and country_code in ('GB', 'US');
update public.plan_prices set included_online_minor = 400000 where plan_key = 'pro' and country_code in ('GB', 'US');
insert into public.plan_features (plan_key, feature, enabled) values ('payg', 'event_types', false)
on conflict (plan_key, feature) do update set enabled = excluded.enabled, updated_at = now();
update public.plans set trial_months = 3 where key = 'trial';
alter table public.plans add column if not exists is_highlighted boolean not null default false;
create unique index if not exists plans_one_highlighted on public.plans ((true)) where is_highlighted;
alter table public.plans drop constraint if exists plans_highlighted_chk;
alter table public.plans add constraint plans_highlighted_chk check (not is_highlighted or (is_public and active));
update public.plans set is_highlighted = (key = 'pro') where is_highlighted is distinct from (key = 'pro');
comment on column public.plans.is_highlighted is
  'The plan the public pricing pages mark "MOST TRUCKS" and colour (the card, its button, the /features column). At most one; public and active only.';
alter table public.plans add column if not exists subtitle text;
update public.plans set subtitle = 'Seasonal & part-time traders' where key = 'payg';
update public.plans set subtitle = 'Trucks taking regular pre-orders' where key = 'pro';
update public.plans set subtitle = 'Busy trucks & festivals' where key = 'unlimited';
comment on column public.plans.subtitle is
  'The short line under the plan''s name on the public pricing cards ("Seasonal & part-time traders"). NULL = none. Data, so a new plan carries its own.';
```

**Why "run now", before the code:**
- The new code selects `plans.is_highlighted` and `plans.subtitle`.
- Without the columns, the catalogue read fails. Then every surface that reads it fails: the landing, /features, /compare, the PDF and Manage. That includes localhost.
- The Stage A2 code running today does not read the new columns. It does read the changed values, which are the intended new prices and trial length.
- Existing trucks' trial end dates are not changed.
- No live truck is on payg (checked: 0), so switching `event_types` off for payg affects nobody today.

**Verify after running (read-only):**

```sql
select key, is_highlighted, subtitle, trial_months from public.plans order by sort_order;
select plan_key, country_code, monthly_minor, included_online_minor, fee_bps from public.plan_prices order by country_code, plan_key;
select plan_key, feature, enabled from public.plan_features order by plan_key, feature;   -- 4 rows, all payg
```

### 1b · Still pending from Stage A2 — NOT RUN

Checked live today: real-thai-food is still `trial | 2026-09-30 | is_customer true`.

```sql
update public.trucks set is_customer = false, plan = 'payg', trial_expires_at = null where id = 'real-thai-food';
```

### Undo (only if Dominic asks)

```sql
update public.plan_prices set fee_bps = 150 where plan_key = 'payg' and country_code in ('GB', 'US');
update public.plan_prices set included_online_minor = 250000 where plan_key = 'pro' and country_code in ('GB', 'US');
delete from public.plan_features where plan_key = 'payg' and feature = 'event_types';
update public.plans set trial_months = 4 where key = 'trial';
-- the two columns may stay (the Stage A2 code does not read them); to remove them entirely:
alter table public.plans drop constraint if exists plans_highlighted_chk;
drop index if exists public.plans_one_highlighted;
alter table public.plans drop column if exists is_highlighted;
alter table public.plans drop column if exists subtitle;
```

⚠️ Undoing the columns while this code is deployed breaks every pricing surface. Revert the code first.

---

## 2 · Deploy order

1. **Run 20261026 now.** It is safe under the code running today.
2. Then deploy this code. Localhost needs the migration too: until it runs, Manage shows "Could not load this page: …" with the real reason.
3. Optional, independent: the real-thai-food statement (1b).
4. Terms §4 needs your sign-off before deploy. See §6; the document date is deliberately unchanged.

---

## 3 · What was built

### Data

- **The migration** above. Pro's included amount is **£4,000**, per your amendment (the mockup image says £5,000; the text wins).
- **`lib/plans.ts`:**
  - `PlanRow` gains `isHighlighted` and `subtitle`.
  - An unknown `plan_features` row no longer breaks the catalogue. `splitUnknownFeatures` moves it to `catalog.ignoredFeatures`. `readPlanCatalog` logs it (`[plans] plan_features row ignored — …`). Admin's plans table shows an amber "Ignored plan_features rows" warning listing them.
  - `catalogProblems` now refuses more than one highlighted plan.
  - New `extendTrialEnd()`.
- **`lib/plan-offer.ts`** (new, pure). This is what every pricing surface says, computed from the catalogue:
  - the public plans in sort_order, with each plan's price row;
  - the fee **shape**, which chooses the sentence: included 0 → fee-only; included > 0 → included; NULL or fee 0 → no fee;
  - the trial length and the fallback plan;
  - each card's bullets: the base bullets, the features a plan adds over the previous one (read from `plan_features`), and the money bullets;
  - the cheapest-plan bands, solved exactly and rounded to the nearest 100 in the currency. GB gives **2,900 / 8,000**; the old £5,000 allowance would give 2,900 / 9,000;
  - the table cells, and the lede's "{plans} add {features}".
- **`lib/feature-table.ts`** (new). Lists capabilities, not plans:
  - the existing table rows (32: the old 33 less "Online ordering — Pay at Hatch"), regrouped into Run your service / Online orders / Marketing & automation;
  - each row's gating feature;
  - the existing coming-soon states;
  - the card-bullet lists.

### Surfaces

- **Landing pricing section** (`components/pricing/PricingSection.tsx`), built to the mockup:
  - banner (trial length, Pay at Hatch body, fallback plan, "No card to start…");
  - one card per public plan: name, subtitle, price "per truck / month", and a fee sentence chosen by shape;
  - the first card has "Everything to run a service", 7 bullets (no multi-staff logins) and "See every feature →";
  - later cards have "Everything in {previous}, plus" and the features each one adds. Unlimited also gets its two money bullets: "Unlimited online orders, 0% HatchGrab fee" and "Same price in your busiest month";
  - "Try free" on every card, orange on the highlighted card;
  - the computed cheapest bar and the footnote.
  - On mobile the cards stack in plan order, then the bar, banner, switching block and footnote.
  - The banner keeps its pre-Stage-B size and padding (reverted on your request, 20 October 2026). Its only styling addition is the underlined fallback-plan name.
- **/features** (`app/features/page.tsx` + `components/pricing/PlanTable.tsx` + `plan-table.css`):
  - h1, then the lede, computed: "Pro and Unlimited add WhatsApp, social media and custom event pricing, and lower fees.";
  - the callout;
  - **one table**: a column per public plan with "{price} / month", the highlighted column from the data flag, WHAT YOU PAY (included / fee* / Walk-up Free), then every feature row in the three groups (✓ / — / Coming soon by `plan_features`);
  - the same footnote.
  - Private events and Custom event types & pricing are separate rows.
- **/compare** (`app/compare/CostComparison.tsx`, layout unchanged):
  - the plans come from data;
  - **the suggestion is the cheapest plan at the volume entered**: it moves with the slider, using the same rule as the bar;
  - there is one "Use {plan} instead" link per other plan;
  - the summary, fee line and breakdown are worded by shape;
  - free months default to the trial length (3);
  - no 'pro' / 'max' anywhere.
- **Plans PDF** (`lib/plans-pdf.ts`), in its existing styling (wordmark header, A4 / US Letter, drawn tick):
  - banner, cards, cheapest bar, the /features table and the footnote;
  - it is built for the given country, which is the prospect's for outreach;
  - **masking:** prices are real (the existing `always-real` mode) unless the country is switched off. Then every amount reads "TBC" / "TBD", with the "not yet published" note. This is the same rule Manage uses for a switched-off country's truck.
- **Manage › Billing:** the frozen matrix and footnotes are replaced by the same `PlanTable`. The highlighted column is the truck's **effective** plan; a trial highlights nothing, since a trial has no column. Amounts go through the plan card's mask, and the footnote sits under the table.
- **Van modal:** "Your {plan} plan includes {N truck(s)}. Adding an additional truck costs {price}…", using the effective plan's name, `included_vans` and `extra_van_monthly_minor`.
- **Trial popup:**
  - the offer reads "Every feature free for {N} months";
  - its body's fallback was the retired "free Starter tier", and now names the expiry-fallback plan from the data.
- **Welcome email, Billing "not started", Terms §4:** see §4–§6.
- **Admin truck modal:** "Extend trial by 1 month" sits next to "Start trial: N months", in the same styling. It sets the end to one calendar month after the **current** end date (the modal's), at 23:59:59 in the truck's zone. 31 January becomes 28/29 February.
- **Manage first-load failure:** "Invalid or expired token" now shows only for an auth refusal (401/403). Any other failure shows "Could not load this page: {reason}".

### Frozen copy removed

- Deleted:
  - `lib/legacy-pricing-display.ts`
  - `components/landing/FeatureComparison.tsx`
  - the message namespaces `featuresPage` and `planMeta`
  - the unused `planFeatures` keys
  - the dead `.cmp2*` / `.feat-cta` / `.price-foot` CSS
- The retired fields are gone from `CountrySettings`, the loader's select, `PlanPriceField` and the admin country form. The **columns stay** in the database.
- `scripts/legacy-pricing-imports.cjs` now asserts three things: the retired files are absent, nothing imports them, and no code outside comments reads any of the six retired columns.

---

## 4 · Welcome email — before / after

Example: GB, first name Sam, truck Pizza Kitchen, 3-month trial running. The email body is otherwise identical.

**Before**
> Hi Sam,
> I’m really pleased to welcome Pizza Kitchen to HatchGrab.
> If you haven’t already, setting up is straightforward and takes about fifteen minutes.
> [Open your dashboard] …

**After**
> Hi Sam,
> I’m really pleased to welcome Pizza Kitchen to HatchGrab.
> **Your 3-month free trial has started — every feature unlocked.**
> If you haven’t already, setting up is straightforward and takes about fifteen minutes.
> [Open your dashboard] …

**When the line shows.** It appears only while the truck's effective plan is a running trial. `/api/auth/verify-signup` reads the truck's `plan` and `trial_expires_at`; N is that plan's `trial_months`. With no truck, or no running trial, the line is left out. For a 1-month trial it reads "Your one-month free trial has started…".

## 5 · Billing "not started" — before / after

- **Before:** "You have every feature while you set up. You choose which event starts your free trial — until then, nothing is counting down."
- **After:** "Your free trial hasn’t started yet."

⚠️ The heading above it is unchanged: "Your free trial has not started yet". The two now say the same thing. Tell me if you want the heading changed or the body dropped.

## 6 · Terms §4 — the new text (for sign-off)

The rewrite is best-effort. It names no plan, price or trial length, because those are data and could otherwise drift from the document. The "If payment is not made" subsection now says "our plan with no monthly fee" instead of "the free plan".

**⚠️ On sign-off, move three things together:**
- the document's `**Last updated:**` line (still 19 October 2026);
- `TERMS_UPDATED` in `lib/legal.ts`;
- `TERMS_VERSION` in `lib/legal.ts`.

I left all three unchanged, so nothing claims a date you haven't approved.

> ## 4. Plans, fees and trials
>
> **No contract, cancel anytime.** There is no minimum term and no notice period. You are never tied in.
>
> - **Plans.** Our plans, their monthly prices, the online order value each includes and the fee each charges are shown on our website and in the app. One plan has no monthly fee. Prices are in your local currency and exclude VAT, sales tax or similar taxes unless stated.
> - **Free trial.** New accounts start with a free trial with every feature unlocked. Its length is shown on our website and in the app when you sign up. You do not need a card to start. At the end of the trial your account moves to our plan with no monthly fee unless you have chosen another plan. We will tell you before your trial ends.
> - **Paid in advance, and non-refundable.** Monthly plan fees are billed one month in advance. **Fees already paid are non-refundable**, including if you cancel part-way through a month or stop using the service. This is the trade for there being no contract and no minimum term. Nothing here affects rights you have that cannot lawfully be excluded.
> - **Cancellation.** You can cancel at any time from within the service. Cancellation stops the next payment; it does not refund the month you are in. You keep full access until the end of the period you have paid for, then move to our plan with no monthly fee.
> - **HatchGrab fees on online card orders.** Depending on your plan, we charge a stated percentage of the value of online orders your customers pay for by card — on all of it, on the value above the amount your plan includes each month, or not at all. **We charge no fee on Pay at Hatch orders or on walk-up orders.**
> - **Card processing.** Card processing fees on online card orders are charged by our payment provider (Stripe), are paid to them and not to us, and are separate from our fees. Walk-up orders are taken on your own card reader, under your own agreement with its provider.
> - **Price changes.** We may change our prices, fees or what a plan includes. We will give you at least 30 days' notice before a change affects you, and you may change plan or cancel before it takes effect.
>
> ### If payment is not made
>
> **If a payment fails or is not made, your account moves to our plan with no monthly fee.** We do not lock you out.
>
> - We will email you when a payment fails and tell you how to fix it.
> - If it is not resolved within **7 days**, your account moves to the plan with no monthly fee. You keep your account, your menu, your orders and your data, and you can carry on taking orders and using the kitchen screen and dashboard. You lose the features that plan does not include, and that plan's fee on online card orders applies.
> - Paying the outstanding amount restores your plan.
> - Moving plan does not entitle you to a refund of fees already paid, and you remain liable for amounts due up to that date.
>
> ⚠️ **Plan for this.** Some features your service depends on are only on paid plans. Keep the billing contact on your account an address you check, and keep your card details current.

---

## 7 · SEO-relevant changes

Proven against the Stage A BEFORE capture by `scripts/pricing-pages.cjs` §12. Every landing and /compare metadata view is unchanged: title, description, canonical, hreflang, robots, Open Graph, Twitter and JSON-LD. The changes are:

- **/features description** (and its `og:description` and `twitter:description`). This is the **only** tag change.
  - Before: "Every HatchGrab feature on every plan, side by side — Starter, Pro and Max, with fees and allowances. Your first month includes everything."
  - After: "Every HatchGrab feature on every plan, side by side — Pay as you go, Pro and Unlimited, with fees and allowances. Your first 3 months include everything."
  - The plan names and the month count come from the data (message `planTable.meta.description`). It was required because the old text named retired plans and the old free month.
- **On-page content, not tags.**
  - The landing #pricing section and /features body are rebuilt to the mockups.
  - /features now has an **h1** ("Everything to run your service, on every plan."). It used to have an eyebrow and an h2.
  - The landing pricing section lost its lede paragraph and the "Compare all features" button. Its eyebrow and h2 are unchanged, and it links to /features from the first card.
- Unchanged: titles, canonicals, hreflang, robots and the sitemap.

---

## 8 · Proof — what was executed

### `node scripts/pricing-pages.cjs` (new, registered): 122 passed, 0 failed

It runs on localhost only, against an in-memory database seeded from the three migrations themselves.

| § | What it proves |
|---|---|
| 1 Data | 0.99%, £4,000, £29 / £69, 3 months, payg `event_types` off, Pro highlighted, subtitles; an unknown feature row is ignored, logged and listed. |
| 2 Landing (GB) | Banner, three cards in order, one badge on Pro and the one orange button, the three fee sentences, all bullets, three "Try free" buttons, "Under £2,900 → Pay as you go · £2,900 – £8,000 → Pro · Over £8,000 → Unlimited", the footnote "(currently 1.5% + 20p in the UK)"; no Starter / Max / "first month". |
| 3 /features (GB) | h1, lede, callout, one table with Pro highlighted, WHAT YOU PAY (no Pay at Hatch row), 32 feature rows, custom event types last in Online orders; Private events ✓✓✓; custom event types —✓✓; coming-soon states kept; the footnote. |
| 4 /compare | The cheapest plan at £2,000 / £2,800 / £3,000 / £7,900 / £8,100. The rendered calculator at £2,000 / £5,000 / £10,000 suggests Pay as you go / Pro / Unlimited. Override honoured; a link per other plan; free months default 3; no plan key or name in its code. |
| 5 PDF (GB) | The same banner, cards, bar, table (Pro highlighted) and footnote, in the existing styling. |
| 6 Manage | Billing (GB and US) for payg / pro / unlimited shows the table with that plan highlighted; a trial highlights none; masked under hide-pricing; trial popup "Every feature free for 3 months" with fallback "Pay as you go"; the "not started" body. Van sentence: rendered from the message ("Your Pro plan includes 1 truck…") and its data wiring checked in source. First-load error: checked in source. |
| 7 Fixture changes | Pro £29→£35, payg fee 0.99%→1.2%, Pro included £4,000→£3,000, trial 3→2, and payg private events switched off: each change reaches the landing, /features, the PDF and Billing's table. The bar re-solves to £6,400. A **fourth public plan** ("Growth") shows up as a card, as a column on /features, in the PDF and in Billing's table, in the bar, and as the /compare suggestion at £9,000. |
| 8 US | Switched **on**: $0 / $29 / $69, "First $4,000", "$2,900 – $8,000", "Pre-orders & pickup times", "pay online or at the window", "pay when they pick up", the US card fee "in the US", PDF on Letter. Switched **off**: the PDF masks every amount (TBD) and says so; /us is not served (the existing redirect backstop); Billing masks (the Stage A2 rule, unchanged). |
| 9 payg `event_types` | `truckCan` says no and `featureRefusal` returns `feature_not_on_plan` naming Pro. The rendered FeatureGate shows "… is included on Pro." with "Pro · £29/mo". Private events are allowed and render the feature. The event-types route gates through `featureRefusal`. |
| 10 Grep proof | No plan key, plan name, price, fee, allowance, threshold or trial length in the pricing code (comments excluded) or in the `pricing` / `planTable` messages. `legacy-pricing-imports.cjs` passes. |
| 11 375px | Strict postcss parse of both stylesheets. In headless Chrome at a 375px viewport, with compiled Tailwind plus landing.css and plan-table.css, the landing, /features, /features with four plans, the answered /compare and Billing all have scrollWidth 375. |
| 12 SEO | As in §7. |

### Other checks

- **tsc:** clean.
- **Lint:** no new errors against the Stage A2 baseline. Errors are compared by rule and message, without the code-frame line numbers. The one new error, a `useMemo` dependency in /compare, was fixed.
- **`next build`:** passes. The first attempt failed on a stray `}` in landing.css that the browser had silently recovered from; it was fixed, and the harness now parses both stylesheets strictly.
- **Full sweep (`node scripts/run-harnesses.cjs`):** **140 of 145 passed on the final full run; the other 5 were then fixed or explained.**
  - The final full run was on the final product code, after all of today's card and table edits.
  - Four of the five then failed only on today's changes: the row order, the hidden Messenger bullet, the unmasked $0, and the restored load fallback. They were re-pinned and each passes on its own re-run: `plan-feature-order` 34/34, `whatsapp-golive-parity-harness` 25/25, `us-unpriced-country` 36/36, `schedule-graphics-places` 270/270.
  - `demo-rebuild-replace` fails 1 check only because its fixture date is today. With the clock pinned to 2026-10-19 it passes 36/36.
  - **Re-pins this stage (marked `⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026)`), three groups:**
    - **Language phases:**
      - `language-phase-0`, `-1c`, `-1d`, `-1d2`, `-1e`, `-1e-tidy`, `-2` and `messages-parity`.
      - A new shared module, `scripts/_lp-stage-b.cjs`, cuts out exactly the regions Stage B rebuilt: landing #pricing, the /features body, the calculator's suggestion and free months, the PDF content and Billing's table. It requires everything else to be byte-identical, and checks each new region against the seed.
      - `scripts/fixtures/plans-stage-b-messages.json` records the message keys Stage B removed, reworded or added.
    - **Plan harnesses:** `plans-data-model` (§8 re-scoped: untouched views byte-identical, rebuilt views proven by name), `plan-features-config`, `plan-feature-order`, `private-events`, `event-types`, `batch-reservation-switch`, `places-posts-gating`, `schedule-graphics-places`, `whatsapp-golive-parity-harness` and `printing-copy`.
    - **Country / US:** `country-settings-parity`, `marketing-country-parity`, `us-readiness`, `us-unpriced-country`, `us-legal-draft`, `compare-no-system` (figures restated from the seed: the cheapest plan at the volume, 3 trial months) and `outreach-reply-attach`.
  - **Product fixes the re-pins surfaced:**
    - a "HTTP 500" load toast: restored to "Failed to load";
    - a blank line in the welcome email: removed;
    - Billing masking £0 as "TBC": zeros are now shown.
- **Not executed:** a live localhost check against the real database. It needs 20261026 to run first; the harnesses stand in for it.

---

## 9 · Decisions (mine — tell me to change any)

1. **Subtitles are data** (`plans.subtitle`), so a new plan brings its own. The highlighted plan is a unique, public-and-active **flag** (`plans.is_highlighted`), not a key in code.
2. **Landing:** the eyebrow and h2 stay above the banner, and the switching block ("Switching from another platform?") stays. The old lede, the navy "Compare all features" button and the price-foot are removed. On a phone the cards come before the banner (the existing convention).
3. **Marketing prices are not masked** (as before). The PDF masks only a switched-off country.
4. **Footnote country** uses `country_settings.short_name`, giving "in the UK" / "in the US". ⚠️ A future country whose short name doesn't take "the" will need a message tweak.
5. **/features shows row names only, with no detail line** (per the mockup). The detail messages were deleted.
6. **Card bullets for added features** use the card wording where it exists. A newly switched feature without card wording still shows, under its generic name, so a fourth plan never shows an empty card.
7. **/compare:**
   - The staff question stays (layout unchanged). "Two or more" now adds "Everyone gets their own login." on every plan.
   - It no longer chooses the plan. The "shared login" warning is removed, because multi-staff logins are on every plan.
8. **Trial popup body:** I replaced the retired "free Starter tier" fallback with the data's fallback plan. Its "*Standard card processing fees apply on online orders" line is unchanged, and keeps its asterisk although the offer line no longer has one.
9. **Welcome email:** the trial line shows only when a trial is actually running for the truck (see §4).
10. **"Extend trial by 1 month"** extends from the end date currently in the modal, so pressing it twice adds two months. For an ended trial it extends from the past end date, which may still be in the past. It saves through the existing Save, like the preset.
11. **Billing on a trial** highlights no column, because the trial is not a public plan.
12. **Messages:** en-GB is the base and en-US holds the overrides (`pricing.banner.body`, `pricing.base.online`, `pricing.base.preorders`).

13. **Pro card bullets, revised on your request (20 October 2026).**
    - The Pro card now lists, after "Everything in Pay as you go, plus", exactly:
      - WhatsApp auto-replies
      - Social media posts — your Facebook and Instagram schedule — ready to post
      - Custom event types & pricing (shortened later the same day, on your request; it read "… — festival menus and prices")
    - Removed:
      - the "Messenger & Instagram — coming soon" sub-line. Its /features table row stays, with its coming-soon state;
      - the "£4,000 of online orders a month with no HatchGrab fee" bullet, which repeated the fee line under the price.
    - The plans PDF repeats the cards, so it changed the same way.
    - Your wording used plain hyphens; I used the page's em dashes. Say if you want it literally "schedule-ready to post".
    - **Later the same day, also on your request:**
      - the fee sentences on the Pay as you go and Pro cards (and in the PDF) now end "Walk-up orders are always free." They read "Pay at Hatch and walk-up orders are always free." and "Walk-up and Pay at Hatch always free.";
      - the landing's trust line (hero and final call to action) reads "First 3 months completely free, everything unlocked". It read "First month 100% free, everything unlocked". The number is the trial plan's `trial_months`, and the line is left out if no trial plan exists.
14. **Pay as you go card, and the table, revised on your request (20 October 2026).**
    - The first card's online bullet now reads just "Online ordering", in GB and US.
    - The table (on /features, in Billing and in the PDF) loses two rows: "Pay at Hatch orders" from WHAT YOU PAY, and "Online ordering — Pay at Hatch". That leaves 32 feature rows and 3 money rows.
    - "Custom event types & pricing" is now the last row of Online orders.
    - Pay at Hatch is still described in the landing banner.
15. **Zero is never masked in the plan table.** Under hidden or unpublished pricing, Billing's table shows "£0 / month" and "0%", and masks every other amount. Before, it read "TBC / month" while the plan card above it said "Free". The card-fee footnote is still masked under hidden pricing, as footnote 2 was before.
16. **Row order on /features follows the mockup's groups.** Your 6 October "directly after" placements are gone: Private events now follows Auto-accept, and Custom event types sits just before the website schedule row.
17. **Manage load errors.** An auth refusal shows "Invalid or expired token". Any other first-load failure shows "Could not load this page: {reason}", which is "Failed to load" when the server gives no reason. The refresh toast is unchanged.

### Not done / flagged

- **Disclosures no longer on any pricing page.** The old table's footnotes and detail lines are gone, per the mockup. These included "Meta bills for WhatsApp replies; replies are AI-generated" and the "Bluetooth or wired printer" detail. Tell me if either should return somewhere, for example as a /features footnote.
- **Not re-pinned:** the `HG_PAGES=1` dev-server pass of `country-settings-parity` needs a running dev server against a migrated database, so it was not re-run.
- **demo-rebuild-replace** fails 1 check only because its fixture date is today (2026-10-20), the same as in Stage A2. With the clock pinned to 2026-10-19 it passes 36/36. It is unchanged.

- **US switch-on.** Switching the US on still depends on a database CHECK ("enabled needs prices"). It references the **retired** `country_settings` columns, so they must stay populated for US until that constraint is revisited. No code reads them.
- **Pre-existing unregistered harness modules.** Eight files in `scripts/` were already in neither the harness list nor an excluded group before this stage:
  - `_midnight-*.cjs` (seven files)
  - `_lp2-named-usl.cjs`

  I registered only `_plans-catalog-fixture.cjs`, under shared modules.

---

## 10 · Files changed

**New**
- `supabase/migrations/20261026_pricing_pages.sql`
- `lib/plan-offer.ts`
- `lib/feature-table.ts`
- `components/pricing/PricingSection.tsx`
- `components/pricing/PlanTable.tsx`
- `components/pricing/plan-table.css`
- `scripts/pricing-pages.cjs`
- generated: `lib/i18n/catalog/pricing.ts`, `lib/i18n/catalog/planTable.ts`, `messages/ns/*/pricing.json`, `messages/ns/*/planTable.json`

**Deleted**
- `lib/legacy-pricing-display.ts`
- `components/landing/FeatureComparison.tsx`
- generated: the `featuresPage` / `planMeta` catalogs and namespace files

**Modified — code**
- `lib/plans.ts`, `lib/plans-server.ts`
- `lib/plans-pdf.ts`
- `lib/country-settings.ts`, `lib/country-settings-types.ts`, `lib/admin/country-form.ts`
- `lib/email-signup.ts`
- comments only: `lib/features.ts`, `lib/whatsapp-live.ts`, `lib/marketing-country.ts`
- `lib/i18n/namespaces.ts`
- `app/landing/page.tsx`, `app/landing/landing.css`
- `app/features/page.tsx`
- `app/compare/CostComparison.tsx`, `app/compare/page.tsx`
- `app/manage/[token]/page.tsx`
- `app/admin/page.tsx`
- `app/api/auth/verify-signup/route.ts`

**Modified — content**
- `messages/en-GB.json`, `messages/en-US.json` (and the generated ns/catalog files)
- `content/legal/terms-and-conditions.md`

**Modified — harnesses and fixtures**
- `scripts/legacy-pricing-imports.cjs`
- `scripts/_plans-catalog-fixture.cjs`
- `scripts/_lp1c-fixtures.cjs`, `scripts/_lp1e-fixtures.cjs`, `scripts/_midnight-fixtures.cjs`
- `scripts/harnesses.json`
- plus the re-pins listed in §8
