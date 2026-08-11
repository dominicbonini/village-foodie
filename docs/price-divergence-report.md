# What a server-side price authority would have concluded about every order in the database

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. Every query was a `select`.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

**Method as specified:** every row in `orders`, re-priced through the **real, working-tree, uncommitted** `loadPriceBook` / `repriceOrder` (TypeScript transpiled at run time — **not reimplemented**), with `stored = { items: [], deals: [] }` so **price-lock cannot engage** and the run simulates the **customer submit path**, not the edit path. The order's stored `items` / `deals` were passed as the request-body arguments. Discount codes were resolved exactly as `submit/route.ts:504-514` does (`discount_codes_db`, truck-scoped, `is_active = true`).

---

# 🔴 READ THIS BEFORE THE NUMBERS

**This measurement prices HISTORICAL orders against TODAY'S menu. Enforcement at submit time would price an order against the menu as it stood AT THAT INSTANT.** The two are not the same, and the difference falls almost entirely on the unresolved count:

| Finding | Is it evidence about enforcement? |
|---|---|
| 🔴 **2 divergent orders** — the client sent an option at **£0.00** that the menu prices at **£1.50** | ⚠️ **PROBABLY YES**, but see the caveat in (b) |
| **21 unresolved orders** — 3 dish names that no longer exist | 🔴 **NO — this is an artefact of the method.** Those dishes were on the menu when ordered; two were later *renamed* and one deleted. A submit-time authority would have resolved all 21 without complaint. |

**Do not read the 21 as 21 orders enforcement would have blocked.** It is a measurement of menu churn between order date and today.

---

## (a) Overall

```
  orders                  : 426
  EXACT (within £0.01)    : 424   (99.5%)
  DIVERGENT               : 2     (0.5%)
  threw                   : 0
  >=1 UnresolvedRef       : 21    (4.9%)

  exact AND no unresolved : 403
  divergent AND unresolved: 0
  divergent, NO unresolved: 2
```

**Date span: 2026-06-18 to 2026-08-11.** Six distinct `truck_id`s, all present in `trucks`.

✅ **99.5% of history prices exactly.** The two failure modes are **completely disjoint** — no order is both divergent and unresolved — which makes each easy to read on its own.

---

## (b) 🔴 The two divergent orders — dissected line by line

```
  count = 2   TOTAL SIGNED SUM OF DELTAS = +3.00   sum |delta| = 3.00
  server HIGHER than stored (undercharged): 2, sum = +3.00
  server LOWER  than stored (overcharged) : 0, sum =  0.00
  by arm: {"items": 2}
```

⚠️ **There are only two, so the "largest twenty" is the complete list:**

| order_key | truck_id | created_at | stored | server | delta | arm |
|---|---|---|---|---|---|---|
| `5d949dcc-0a93-4e3f-81ad-83991a92c966` | `test-truck` | 2026-07-14T21:51:58Z | £28.50 | £30.00 | **+£1.50** | **items** |
| `b4d3327b-24a4-410f-a9f2-91f6ea9b1e96` | `test-truck` | 2026-07-15T10:42:16Z | £33.00 | £34.50 | **+£1.50** | **items** |

🔴 **BOTH ARE THE SAME DEFECT, AND IT IS EXACTLY THE ONE A PRICE AUTHORITY EXISTS TO CATCH:**

```
  --- 5d949dcc…  stored total 28.5  status collected
    "Beef with Oyster Sauce" x1
       STORED unit_price=9.5   modifiers=[Extra cheese@0]
       SERVER unit_price=11    modifiers=[Extra cheese@1.5]   menu base=9.5
       lookup optionPrice["Beef with Oyster Sauce"]["Extra cheese"] = 1.5   (client sent 0)
    "Beef with Oyster Sauce" x1   STORED 9.5  SERVER 9.5   (no modifiers)
    "Chicken Cashew nuts"    x1   STORED 9.5  SERVER 9.5   (no modifiers)
    => server total 30 vs stored 28.5   delta +1.50  unresolved=0

  --- b4d3327b…  stored total 33  status confirmed
    "Chicken Satay"       x1   STORED 6.5  SERVER 6.5
    "Chicken Satay"       x1   STORED 6.5  SERVER 6.5
    "Chicken Katsu Curry" x1
       STORED unit_price=10    modifiers=[Extra cheese@0]
       SERVER unit_price=11.5  modifiers=[Extra cheese@1.5]   menu base=10
       lookup optionPrice["Chicken Katsu Curry"]["Extra cheese"] = 1.5   (client sent 0)
    "Chicken Katsu Curry" x1   STORED 10  SERVER 10
    => server total 34.5 vs stored 33   delta +1.50  unresolved=0
```

🔴 **The client sent `Extra cheese` at £0.00. The menu prices it at £1.50. The base dish price matched perfectly in every case — the divergence is ENTIRELY in the modifier.** That is precisely the money a client-priced items arm cannot defend.

⚠️ **THE CAVEAT, AND IT IS A REAL ONE.** I cannot prove `Extra cheese` was £1.50 **on 14 July**. It is £1.50 **today**. If the option was £0.00 then and was raised since, these two orders were correct at the time and this measurement is comparing across a price change. **Not established** — I found no price-history or audit table for `modifier_options`. **What IS established** is that the stored line is internally inconsistent in a way a genuine £0.00 option would not be: `unit_price` equals the bare menu base with the modifier contributing nothing, which is the signature of a modifier that carried no price rather than one priced at zero.

⚠️ **`test-truck` is `slug: test-kitchen`, `name: "Test Kitchen"`.** 🔴 **The entire £3.00 is on a test truck. Pizzeria Gusto — the live truck — has a signed delta of exactly £0.00 across all 213 of its orders.**

---

## (c) The 21 orders producing an UnresolvedRef

```
  count = 21
  UnresolvedRef count by kind: {"item": 23}
  distinct (kind:name) values : 3
  most frequent: item:Sweet Heat Salami x19, item:Nutella Dream x2, item:Dolce Biscoff x2
```

🔴 **ALL 21 are on `pizzeria-gusto`. ALL 23 refs are `kind: 'item'` — not one `modifier`, `deal` or `discount`.** The re-keyed option book resolved **every single modifier in 426 orders**.

| order_key | truck_id | created_at | age | unresolved |
|---|---|---|---|---|
| `8d86ec06-313d-4984-83c5-d0e375a9e5fd` | pizzeria-gusto | 2026-06-18T16:49:17Z | **C >30** | item:Sweet Heat Salami |
| `fea037d5-c7df-48a5-b750-bb9275d050e8` | pizzeria-gusto | 2026-06-23T06:00:12Z | **C >30** | item:Sweet Heat Salami |
| `573e5323-6c00-45d3-a5f8-641f87b07238` | pizzeria-gusto | 2026-07-12T12:46:43Z | B 8-30 | item:Sweet Heat Salami |
| `edeaa1bc-40c8-47e5-a239-8b0f29176dfb` | pizzeria-gusto | 2026-07-13T18:31:46Z | B 8-30 | item:Sweet Heat Salami, item:Nutella Dream |
| `c1feca3e-548b-4e90-82b3-0329df6c4877` | pizzeria-gusto | 2026-07-14T11:47:01Z | B 8-30 | item:Sweet Heat Salami |
| `3918ac0a-6e9c-4584-b551-4d83e1c8ee16` | pizzeria-gusto | 2026-07-15T17:57:08Z | B 8-30 | item:Dolce Biscoff, item:Nutella Dream |
| `a34835c1-133a-4360-b73a-3882f92f9584` | pizzeria-gusto | 2026-07-17T16:25:52Z | B 8-30 | item:Sweet Heat Salami |
| `a43f2805-36db-48b6-aa75-90526c2ffc35` | pizzeria-gusto | 2026-07-17T17:12:15Z | B 8-30 | item:Dolce Biscoff |
| `2e93b42b-7b8e-4160-b52f-67e62c452f25` | pizzeria-gusto | 2026-07-21T17:40:16Z | B 8-30 | item:Sweet Heat Salami |
| `f08e8ceb-e996-4d7b-8b75-2b23f7399d46` | pizzeria-gusto | 2026-07-24T12:29:12Z | B 8-30 | item:Sweet Heat Salami |
| `46e34291-ed53-4a28-8f7f-565f0d67bf5e` | pizzeria-gusto | 2026-07-27T13:17:02Z | B 8-30 | item:Sweet Heat Salami |
| `f73bff76-edee-4c2a-a0c7-03f547a5036f` | pizzeria-gusto | 2026-07-27T20:28:19Z | B 8-30 | item:Sweet Heat Salami |
| `40406919-ea45-4d4a-988e-e93201224cc6` | pizzeria-gusto | 2026-07-28T09:57:44Z | B 8-30 | item:Sweet Heat Salami |
| `668c5a92-b214-405d-b8f8-b778041bb1d4` | pizzeria-gusto | 2026-07-31T14:29:43Z | B 8-30 | item:Sweet Heat Salami |
| `1545d1ea-2101-4994-a392-55018a44324f` | pizzeria-gusto | 2026-07-31T15:18:28Z | B 8-30 | item:Sweet Heat Salami |
| `f5fb40c2-1b5d-4a2a-b76e-a93549bf6777` | pizzeria-gusto | 2026-07-31T15:36:49Z | B 8-30 | item:Sweet Heat Salami |
| `8cd3a3ab-dba8-4657-995e-ceb7e9f92829` | pizzeria-gusto | 2026-07-31T16:06:36Z | B 8-30 | item:Sweet Heat Salami |
| `c6fb1230-adb1-42cf-bc8a-60b689de74e1` | pizzeria-gusto | 2026-07-31T16:29:10Z | B 8-30 | item:Sweet Heat Salami |
| `f426440f-f0d3-4ee0-b53a-6ffb3e479577` | pizzeria-gusto | 2026-07-31T17:33:35Z | B 8-30 | item:Sweet Heat Salami |
| 🔴 `086c1ad4-ca3b-4d94-b13b-ef50bb830646` | pizzeria-gusto | 2026-08-07T11:03:26Z | **A last7** | item:Sweet Heat Salami |
| 🔴 `60be5d69-46f5-4e9b-8aed-5ff427be9547` | pizzeria-gusto | 2026-08-07T16:11:18Z | **A last7** | item:Sweet Heat Salami |

### 🔴 WHAT ACTUALLY HAPPENED TO THE THREE NAMES

Gusto has **45 menu items today**. Checked each against the current menu:

| Ordered as | On the menu today? | What it became |
|---|---|---|
| **`Nutella Dream`** | **NO** | 🔴 **RENAMED** → `Nutella Dream Pizza` (£6.50). **Orders charged £6.50.** |
| **`Dolce Biscoff`** | **NO** | 🔴 **RENAMED** → `Dolce Biscoff Pizza` (£6.50). **Orders charged £6.50.** |
| **`Sweet Heat Salami`** | **NO** | **DELETED — no near-name match anywhere on the menu.** Orders charged £12.00, consistently. |

✅ **Every one of the three was charged at a single consistent price across every order that contains it** (£12.00 / £6.50 / £6.50). ⚠️ **Nothing here looks like a pricing error — it looks like a menu that was edited after the fact.** The unresolved flag is doing its job: it says *"I cannot verify this name against today's menu"*, which is true and is not the same as *"this price is wrong."*

🔴 **AND THE TOTALS ALL STILL MATCHED.** All 21 unresolved orders priced **EXACTLY**, because the unresolved branch falls back to the advisory `unit_price` — which, for these, was right.

---

## (d) By age of order — stated plainly, and NOT pooled

```
  band     | orders | exact | divergent | >=1 unresolved | unresolved %
  A last7  |   101  |  101  |     0     |       2        |    2.0%
  B 8-30   |   293  |  291  |     2     |      17        |    5.8%
  C >30    |    32  |   32  |     0     |       2        |    6.3%
```

**The segmentation exists because the two bands mean different things, so here is each read separately:**

⚠️ **OLDER THAN 30 DAYS — 2 of 32 (6.3%) unresolved. EXPECTED.** An order from 18 June naming a dish that has since been deleted is ordinary menu evolution and says nothing about enforcement.

⚠️ **8–30 DAYS — 17 of 293 (5.8%) unresolved.** Same reading. Two renames and one deletion, all after the fact.

🔴 **LAST 7 DAYS — 2 of 101 (2.0%) unresolved. THIS IS THE BAND THAT WOULD BE EVIDENCE, AND IT NEEDS CARE.** Both are `Sweet Heat Salami`, ordered on **7 August**, four days before this measurement. **So a dish was removed from Gusto's live menu within the last four days while orders naming it existed.**

🔴 **BUT THIS STILL DOES NOT FALSIFY "menu names do not change during service."** Both orders are from 7 August; the deletion happened at some point between then and today. **A submit-time authority on 7 August would have found the dish and resolved it.** What this proves is that **menu names change between services**, which was never the premise at issue.

⚠️ **The premise "menu names do not change DURING service" is NOT TESTED by this data at all**, and cannot be, because `orders` records the order time but the menu carries no history. **Not established either way.** Testing it needs a `menu_items_db` change log, which does not exist.

✅ **The lowest unresolved rate is in the most recent band (2.0% vs 5.8% and 6.3%), which is the direction you would expect** if unresolved is driven by menu churn since the order rather than by anything wrong at submit time.

---

## (e) By truck — Gusto on its own line, demo separated

⚠️ **`truck_id` and `slug` are NOT the same value on this data** — the demo trucks' ids and slugs are shuffled relative to one another, and `test-truck`'s slug is `test-kitchen`. Orders carry the **id**, so the table is keyed on id with the slug alongside.

```
  truck_id | slug | name | orders | exact | divergent | >=1 unresolved | signed sum
  -- NON-DEMO --
  pizzeria-gusto | pizzeria-gusto | Pizzeria Gusto | 213 | 213 | 0 | 21 | £0.00
  test-truck     | test-kitchen   | Test Kitchen   |  93 |  91 | 2 |  0 | £3.00
  NON-DEMO TOTAL                                   | 306 | 304 | 2 | 21 | £3.00

  -- DEMO (demo-*) --
  demo-ekwwmqeej70hd5da4d61wzetcw | Demo Kitchen (ekwwmq) | 37 | 37 | 0 | 0 | £0.00
  demo-krh2c8ksabdv28ccprswbfhkdk | Demo Kitchen (krh2c8) | 35 | 35 | 0 | 0 | £0.00
  demo-m1y02c2mgqag1y4b79401af4hm | Demo Kitchen (m1y02c) | 33 | 33 | 0 | 0 | £0.00
  demo-15yy2ecnkemmchrr8np69p29n8 | Demo Kitchen (15yy2e) | 15 | 15 | 0 | 0 | £0.00
  DEMO TOTAL                                              | 120 | 120 | 0 | 0 | £0.00
```

### 🔴 PIZZERIA-GUSTO ON ITS OWN

```
  orders = 213   exact = 213   divergent = 0   unresolved = 21   signed sum of deltas = £0.00
```

✅ **THE LIVE TRUCK PRICES EXACTLY, 213 OF 213. ZERO PENCE OF DIVERGENCE.** Its 21 unresolved orders are the three renamed/deleted dish names in (c), and every one of them still totalled correctly.

✅ **All 120 demo orders price exactly with zero unresolved** — the seeder writes prices that agree with the menu it seeds.

⚠️ **Only two trucks in the whole dataset are non-demo, and one of them is called "Test Kitchen".** 🔴 **The entire real-world evidence base for enforcement is Pizzeria Gusto's 213 orders.** That is worth saying out loud before anyone generalises from 426.

---

## (f) By channel

Discriminator as specified: `van_id IS NOT NULL` → customer web order; `van_id IS NULL` **and** `items[0].cartKey` present → walk-up.

```
  channel | orders | exact | divergent | >=1 unresolved | signed sum
  web     |   94   |  94   |     0     |       9        |  £0.00
  walkup  |  211   | 209   |     2     |      12        |  £3.00
  neither |  121   | 121   |     0     |       0        |  £0.00
```

✅ **Customer web orders: 94, all exact, zero divergence.**

🔴 **BOTH divergent orders are WALK-UPS** (`van_id` null, `cartKey` present) — the operator's Add Order panel, not the customer page.

### The 121 that match neither

```
  van_id NULL and items[0].cartKey absent: 121
  by truck: demo-ekwwmq 37, demo-krh2c8 35, demo-m1y02c 33, demo-15yy2e 15, test-truck 1
  sample items[0] keys: ["name","quantity","unit_price"]
```

⚠️ **120 of the 121 are the four demo trucks — i.e. all 120 demo orders.** `lib/seed-demo-orders.ts` writes items as `{name, quantity, unit_price}` with **no `cartKey`**, so seeded orders are invisible to the discriminator. **The remaining 1 is a single `test-truck` order.**

✅ **So the discriminator classifies 100% of non-seeded orders (305 of 306) into web or walk-up.** The "neither" bucket is a seeder artefact, not a gap in the rule — which is consistent with `order-repricing.ts:28-30` noting `cartKey` is absent on demo-seeded rows.

---

## (g) Coverage of the interesting cases

```
  orders with >=1 modifier (item or deal-slot) : 67   (15.7%)
  orders with >=1 deal                         : 0    (0.0%)
  orders with a discount_code                  : 0
  orders with NO items at all                  : 0

  of the modifier orders: exact=65  divergent=2  unresolved=0
  of the deal orders    : exact=0   divergent=0  unresolved=0
```

✅ **67 orders carry at least one modifier — decent coverage, and it is exactly where both divergences live** (2 of 67 modifier orders diverge; 0 of the 359 without).

🔴 **ZERO ORDERS IN THE ENTIRE DATABASE CARRY A DEAL. ZERO CARRY A DISCOUNT CODE.**

⚠️ **THIS IS THE BIGGEST GAP IN THIS MEASUREMENT AND IT SHOULD NOT BE GLOSSED OVER.** The deals arm and the discount arm of `repriceOrder` — including the `modifierExtra` summation, the bundle-name lookup, the `bundle_price: 0` fallback, and the percentage-code rescaling — have **NO historical coverage at all**. This report says **nothing** about how enforcement would behave on a deal or a coded order, because the data to say it does not exist. **Any confidence about those two arms has to come from a test, not from history.**

---

## Summary of what this establishes

| Claim | Supported? |
|---|---|
| A price authority would have accepted almost all history untouched | ✅ **YES — 424 of 426 (99.5%) exact** |
| It would have caught real client-side mispricing | ✅ **YES — 2 orders, both a £0.00 modifier the menu prices at £1.50, +£3.00 total, both undercharges** |
| The live truck's pricing is sound | ✅ **YES — Pizzeria Gusto 213/213 exact, £0.00 signed delta** |
| Customer web orders are sound | ✅ **YES — 94/94 exact** |
| The re-keyed option book resolves real orders | ✅ **YES — every modifier in 426 orders resolved; 0 modifier UnresolvedRefs** |
| Enforcement would have blocked 21 orders | 🔴 **NO — that is a method artefact.** Those names existed at order time; the menu changed afterwards |
| Menu names change *during* service | ⚠️ **NOT ESTABLISHED** — `menu_items_db` has no history, so this cannot be tested from `orders` |
| Deals and discount codes are safe under enforcement | 🔴 **NOT ESTABLISHED — zero historical coverage** |
| `Extra cheese` was £1.50 on 14 July | ⚠️ **NOT ESTABLISHED** — no price history exists; today's price is £1.50 |

---

## Deletion confirmed

`measure.mjs`, `measure2.mjs`, their two `.log` files, and the two transpiled `.js` artefacts (`order-repricing.js`, `order-calculations.js`) were all removed from the scratchpad; the directory listing afterwards confirms none remain. **Nothing was written to the repository and nothing was written to the database — every statement in every script was a `select`.** No fees, allowances or commercial figures were computed.
