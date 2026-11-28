# compare-calc-check-1: does the comparison cost calculator count card fees correctly? (26 Nov 2026, read-only)

**Scope.** I read code and the live data, and read the live GB page once. Nothing was written to any table, no code was changed, and nothing was pushed or deployed. No .env file was opened. No trucks, orders or customers were touched.

## 1 · Summary

1. **🔴 A bigger problem than card fees: the live pages miss competitors.**
   - **The cause.** The page reads every competitor plan in one request with no paging (lib/admin/pricing-check-store.ts:81, the same on `main`). Supabase returns at most 1,000 rows, and there are now **1,057 plans**, ordered oldest first.
   - **What it hides.** The newest 57 plans never reach the page, which hides **47 of the 212 shown tools**:
     - **Square in all 8 of its countries** (AU CA ES FR GB IE JP US);
     - **What The Truck and Hatches Up in GB**;
     - many territory tools.
   - **Five pages show no competitor at all:** GF AX RE VA YT.
   - **The live GB page proves it.** It shows only **Ordea** beside HatchGrab, while the publish chose Ordea · What The Truck · Hatches Up · Square.
   - **The publish itself is right.** It reads through `pg` with no cap.
2. **The calculator never adds a card fee on top of a bundled rate.**
   - **The page's cost answers drop card processing on both sides.** These are the "lowest monthly software cost at 150 / 2,000 orders" answers. They **switch themselves off whenever any shown tool is bundled**, which happens in 13 countries.
   - **The Admin cost model counts all-in.** Admin › Pricing check uses the same functions, and treats a bundled rate as the whole card fee. Square (£39.00) and HatchGrab Pay as you go (£44.90) come out exactly as your hand figures.
3. **What The Truck is stored wrongly for this model.**
   - **How it's stored.** Its 3.95% is a per-order fee and its card rate is empty. That makes the Admin model add our Stripe rate on top: **£74.50 instead of £39.50**.
   - **What the page shows.** "3.95% per order" and a "doesn't say" card-fee cell.
   - **VAT on its fee is counted nowhere.** The £47.40 a truck that isn't VAT-registered really pays doesn't appear.
4. **Counting all-in, Square comes out cheapest in GB at both of the page's volumes.** Today's answer says HatchGrab. Details in §6.

## 2 · How the cost figures add up (the code, in plain words)

There are four places money is worked out. All of them live in lib/comparison.ts and lib/pricing-check.ts.

| Where | What it shows |
|---|---|
| **Table price rows** (Monthly price, Fee per online order, Card fee, Set-up fee) | Each tool's stored terms as text. No totals. |
| **"What does a food truck ordering system cost?"** | One line per plan as text, plus one Stripe sentence and one VAT sentence for HatchGrab. No totals. |
| **"Which suits" price answers** (`priceAt`, lib/comparison.ts:476) | The only worked totals: 150 and 2,000 online orders at the country benchmark (GB: £16 meal × 1.3 = £20.80 an order). |
| **Admin › Pricing check** (`checkCountry` / `rivalTotal`, lib/pricing-check.ts) | All-in totals at 150 / 600 / 2,000 orders. Admin only. |

**HatchGrab's own cost per plan:**

- the monthly price;
- the plan's fee on online sales above its included amount (Pay as you go 0.99% from £0; Pro £29 with 0.99% above £4,000; Unlimited £69 with no fee);
- **plus Stripe's online rate**, from **`country_settings.card_fee_online_pct` / `card_fee_online_fixed_minor`**. That's per country: GB is 1.5% + 20p, "UK cards". It goes through `cardFeeOnlineLabel` (lib/card-fees.ts) and `ourCardRate` (lib/pricing-check.ts:261).

The page's sentence is the message `comparison.costs.cardFee`: «Online card payments with HatchGrab also carry Stripe's fees: 1.5% + 20p per card payment in the United Kingdom.» It is shown in every country, **not** gated on `offersOnlineCardPayments`. That's still the open wording question in Open item 16.

**A competitor, by card mode** (`rivalTotal`, lib/pricing-check.ts:323–352):

| Case | What's counted |
|---|---|
| **Bundled with a rate** (Square, Hatches Up) | `card_bps` / `card_fixed_minor` **is** the card fee, with nothing added. The table shows «1.4% + 25p per online payment, card fee included». ✓ |
| **Separate with a rate** (Ordea 1.5% + 20p) | The stated card rate plus its per-order fee. ✓ |
| **No card-rate data** (182 shown plans are 'unknown') | **Our** country's Stripe rate is assumed and flagged `cardAssumed`. The table's card-fee cell says "doesn't say". |
| **Bundled with no rate** (What The Truck GB, Favrit NO, WEIQ SE) | The code sees no rate, so **it assumes our Stripe rate and adds it**, on top of What The Truck's 3.95% "per order" fee. ✗ for What The Truck. The card-fee cell is "doesn't say", and the bundled text never appears. |

**The page's price answers (`priceAt`)** take card processing **out of both sides**: "card-processing fees are not included". So they compare software cost only.

- A bundled tool's whole fee *is* card processing. Taking it out would leave £0.
- So `priceAt` **returns null when any shown tool is bundled** (lib/comparison.ts:481), and the two answers are left off that page.

**VAT** is never counted, in any calculation.

- `plans.vat = 'excl'` only adds "excl. VAT" after the **monthly** price (`priceText`). What The Truck's reads «£0 a month excl. VAT».
- Nothing marks VAT on a **fee**. What The Truck's own page says the online platform fee «is subject to VAT at 20%».
- HatchGrab's page says it adds no VAT to its own fees.
- So for a GB truck that isn't VAT-registered, What The Truck's real online cost is 3.95% × 1.2 = 4.74%. Neither the page nor the Admin model shows that.

## 3 · Three GB examples: £1,000 of online orders, 100 orders at £10

Worked with the **real** `rivalTotal` function (run locally on the stored plans; nothing written) and the stored HatchGrab GB prices.

| Tool | Your hand figure | The code (Admin all-in) | What the page shows |
|---|---|---|---|
| HatchGrab, Pay as you go | 0.99% + 1.5% + 20p = **£44.90** | **£44.90** (£9.90 + Stripe £35.00) ✓ | No total. «Pay as you go: £0 a month, 0.99% per online order» plus the Stripe sentence. |
| What The Truck | 3.95% = **£39.50** (£47.40 with VAT) | **£74.50** = £39.50 fee + **£35.00 Stripe assumed** ✗ | Not on the page today (§4). From the stored data it would show «£0 a month excl. VAT, 3.95% per order», and Card fee "doesn't say". |
| Square, Free | 1.4% + 25p = **£39.00** | **£39.00** (bundled rate, nothing added) ✓ | Not on the page today (§4). It would show «Free: £0 a month, 1.4% + 25p per online payment, card fee included». |

For reference, the code gives these all-in totals at the same volume:

- HatchGrab Pro £64.00 and Unlimited £104.00, so Pay as you go is HatchGrab's cheapest here;
- Hatches Up £65.00 (4.5% + 20p);
- Ordea £65.00 (3% + Stripe-rate card 1.5% + 20p).

**Neither page figure is a total at this volume.** The page only works totals at 150 and 2,000 orders, and in GB it won't once a bundled tool is visible.

## 4 · The live GB page today (read once)

The page is https://www.hatchgrab.com/uk/comparison/food-truck-ordering-system, «Last checked: 24 November 2026». Its columns are **HatchGrab and Ordea only**.

| Row | HatchGrab | Ordea |
|---|---|---|
| Monthly price | «£0 to £69 a month» | «£0 a month» |
| Fee per online order | «0.99% per online order (Pay as you go) · 0.99% above £4,000 a month (Pro) · none (Unlimited)» | «3% per order» |
| Card fee | «1.5% + 20p per card payment» | «1.5% + 20p per card payment» |
| Set-up fee | «None» | «None» |

**The cost section:**

- «Pay as you go: £0 a month, 0.99% per online order»;
- «Pro: £29 a month, online orders up to £4,000 a month included, then 0.99%»;
- «Unlimited: £69 a month, no HatchGrab fee on online orders»;
- «Free: £0 a month, 3% per order» (Ordea);
- the Stripe sentence and the VAT sentence quoted in §2.

**The price answers:**

- «At 150 online orders a month, HatchGrab (Pro) has the lowest monthly software cost among the products compared: £29 a month.» (Ordea £93.60)
- «At 2,000 online orders a month, HatchGrab (Unlimited, a flat price with no per-order fee from HatchGrab) has the lowest monthly software cost among the products compared: £69 a month.» (Ordea £1,248)
- Both are worked at £20.80 an order, and "card-processing fees are not included".

These are right for Ordea alone.

**Why only Ordea shows: the 1,000-row cap.**

1. The page is `force-dynamic`, so this isn't a stale cache.
2. The page builds its columns from `servicePricingStore.listAll()`. That reads `competitor_plans` with `.select(...).order('created_at')` and no `.range()` (lib/admin/pricing-check-store.ts:81). Answers are paged (line 231); plans are not.
3. The table holds 1,057 plans. The 1,000th was created 2026-11-25 16:22:59, and 56 plans share that timestamp, so exactly which are cut near the line can vary.
4. Every plan created after it is missing on the page. The page then finds no current plan for those entries, so they aren't public.

What The Truck (row 1,049), Square (1,052) and Hatches Up (1,057) are all past the cut, so GB shows Ordea alone. That is exactly what the live page shows.

**Hidden everywhere** (by a created_at, id order; 47 of 212 shown):

| Group | Countries |
|---|---|
| Square | AU CA ES FR GB IE JP US |
| What The Truck, Hatches Up | GB |
| French territory tools | AD BL GF GP MF MQ PM RE YT |
| Ordea, Grafterr, Order Tiger | GG IM JE |
| Food4you | AX |
| Qromo, MenuForma, Tilby | SM VA |

**Pages with no competitor at all:** GF AX RE VA YT. Each still counts as live.

**The same read feeds Admin › Pricing check**, so that page misses those plans too. The publish step is unaffected: it reads through `pg` (lib/comparison-publish-store-pg.ts) and chose correctly.

## 5 · Every live country with a bundled tool shown, and whether its figures are right

16 shown plans are bundled, in **13 countries**. In every one of them the two price answers are left off by design (`priceAt` returns null).

| Country | Tool · plan | Stored | Table text (once visible) | Right? |
|---|---|---|---|---|
| AU | Square · Free | 2.2% | «2.2% per online payment, card fee included» | ✓ (hidden by the cap) |
| BR | VexMenu · Grátis | 2.99% + R$0.99 | bundled text | ✓ |
| CA | Square · Free | 2.8% + 30¢ | bundled text | ✓ (hidden by the cap) |
| DE | Liefersoft · STARTUP | €39 excl. VAT, €199 set-up, 6% + 9c | bundled text | ✓ as stored |
| ES, FR, IE | Square · Gratuito / Gratuit / Free | 1.4% + 25c, VAT excl | «€0 a month excl. VAT», bundled text | ✓ (hidden by the cap); the IE page's «+ VAT» on the rate isn't shown |
| GB | Hatches Up · Unlock orders & payments | 4.5% + 20p | bundled text | ✓ (hidden by the cap) |
| GB | Square · Free | 1.4% + 25p | bundled text | ✓ (hidden by the cap) |
| GB | **What The Truck** | **truck fee 3.95%, card rate empty** | «3.95% per order»; Card fee "doesn't say" | **✗**: card not shown as included; the Admin model adds Stripe (£74.50 vs £39.50); VAT on the fee not shown (hidden by the cap) |
| IT | Qromo · Pro | €59, 1.99% + 20c | bundled text | ✓ |
| JP | Square · フリー | 3.6% | bundled text | ✓ (hidden by the cap) |
| JP | Mobaregi | 4% | bundled text | ✓ |
| NO | Favrit · Alt-i-ett | NOK 899, no rate | Card fee "doesn't say", per order «No fee» | ⚠️ no rate stored; the Admin model assumes Stripe on top |
| SE | WEIQ · säsongspaket | SEK 6,667 (yearly), no rate | same as Favrit | ⚠️ same |
| US | Square · Square Free | 3.3% + 30¢ | bundled text | ✓ (hidden by the cap) |

## 6 · What changes once the pages show everyone, worked all-in for GB

These are the page's own volumes, with card processing counted on both sides and What The Truck stored as bundled 3.95%:

| GB | 150 orders (£3,120) | 2,000 orders (£41,600) |
|---|---|---|
| HatchGrab (cheapest plan) | Pro **£105.80** (£29 + Stripe £76.80) | Unlimited **£1,093.00** (£69 + Stripe £1,024) |
| **Square Free** | **£81.18** | **£1,082.40** |
| What The Truck | £123.24 (£147.89 with VAT) | £1,643.20 (£1,971.84 with VAT) |
| Ordea | £170.40 | £2,272.00 |
| Hatches Up | £170.40 | £2,272.00 |

**Counting all-in, Square's free plan is cheaper than HatchGrab at both volumes in GB.**

- Today's answer ("HatchGrab has the lowest software cost") is true only because it leaves card processing out, and today it compares against Ordea alone.
- At 2,000 orders HatchGrab Unlimited is only £10.60 a month above Square.

## 7 · Recommended smallest fixes (nothing changed)

1. **🔴 Page the plan read (a code change, then the batch deploy).**
   - **The change.** In `lib/admin/pricing-check-store.ts` `listAll`, read `competitor_plans` in pages of 1,000. That's the same `.range(from, from + 999)` loop the answers already use (line 231), ideally ordered by `created_at, id` so it's stable. Do the same for competitors and benchmarks, so they never hit the cap later.
   - **On the pages:**
     - the 47 hidden tools appear, including Square in its 8 countries, and GB shows Ordea · What The Truck · Hatches Up · Square;
     - GF AX RE VA YT get their tools back;
     - GB, AU, CA, ES, FR, IE, JP and US **lose their two price answers**, because a bundled tool is now visible (see fix 3).
   - **The check.** Add a harness that fails if any plan read can return exactly 1,000 rows.
2. **What The Truck's data (a data-only migration, with your yes).**
   - **The change.** Store its plan like Square and Hatches Up: `card_bps` 395, `card_fixed_minor` 0, `truck_fee_bps` 0, still bundled.
   - **On the page:**
     - Fee per online order and Card fee read «3.95% per online payment, card fee included»;
     - the Admin model gives £39.50, not £74.50.
   - Favrit NO and WEIQ SE need their own rate, or `card_mode` 'unknown', checked on their own sites.
3. **Price answers where a bundled tool is shown (a code change; your decision first).**
   - **The change.** When any shown tool is bundled, have `priceAt` compare **all-in**: keep card processing on both sides, HatchGrab + Stripe against the bundled rate, which is the Admin model's own totals. Then say so with a second "includes" sentence: «card-processing fees are included».
   - **On the pages.** The answers come back in the 13 countries. **In GB they would name Square as the lowest at both 150 and 2,000 orders** (§6).
   - **The alternative.** Keep them off (today's behaviour).
4. **VAT on a fee (your decision).**
   - No column says a *fee* is excl. VAT. `plans.vat` covers the monthly price.
   - The smallest honest step is to keep What The Truck's VAT line in its plan note, and add the plan text «3.95% + VAT» by data: the plan name, or a `choose_when` note.
   - Counting VAT for trucks that aren't VAT-registered would need a new per-plan flag and a code change. Card processing itself is usually VAT-exempt, so a blanket "excl. VAT applies to fees" rule would be wrong for Square FR / ES.
5. **Open item 16's wording.** The Stripe sentence shows in every country whether or not online card payments are offered. That's unchanged and still for you.

## Flags

- Nothing in the prompt arrived garbled, and no instruction contradicted another.
- **Read once:** the GB page. The plan-row ranking near the cut is approximate: 56 plans share one created_at, and PostgREST's order among ties isn't fixed.
- **SQL run, all read-only SELECTs:**
  - country_settings GB card fees;
  - plan_prices GB;
  - country_benchmarks GB;
  - comparison_publish GB;
  - the bundled shown plans;
  - card_mode counts;
  - the 1,000-row ranking.
