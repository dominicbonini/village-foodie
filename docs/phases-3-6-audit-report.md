# Phases 3–6 — read-only audit: tax, tips, card-fee surcharge, online service fee, legal wording, printed accents, and a deploy runbook

**10 October 2026 · branch `main` (HEAD `f4bd277` + the uncommitted Phases 1–2D-2 tree) · read-only: no code, migration or file changed except this report · no SQL run · no commit, push or deploy · no `.env*` file opened · no email sent · `outreach_templates` untouched**

Nothing in the brief arrived garbled and no instruction contradicted another. Line numbers are the current working tree's.

**Baseline.** No code has changed since the end of Phase 2D-2 Part A, an hour before this audit. On this same tree, recorded then:
- `tsc --noEmit` clean;
- `next build` exit 0;
- `scripts/run-harnesses.cjs` **106 / 106 passed**;
- eslint baseline holding (no rule grew in any touched file).

They were not re-run for this read-only audit.

---

## Summary

**The good news first.**
- **There is one engine for order money.** `calculateOrderTotal` (`lib/order-calculations.ts:78-135`) adds items and deals and subtracts a discount code. The server prices every order through `repriceOrder` (`lib/order-repricing.ts:350-507`), and nothing trusts a client total.
- **One number drives everything after that:** `orders.total_minor`. That covers capture, the balance, hatch collection, refund limits, tickets, KDS, emails and reports.
- **So the plan can be built as "food money" plus separate add-on lines.** Each add-on line renders only when it is non-zero, and `total_minor` becomes the grand total.
- **The UK stays byte-identical** if every new line is conditional, because GB has tax included and every add-on switched off.

**The hard parts.**
1. **The card's credit or debit type is never known before the amount is fixed.** The PaymentIntent is created at "Place order", before the card is typed (`lib/payments/authorize.ts:118-168`). A credit-only surcharge needs a change to how checkout confirms (Part 4).
2. **No platform fee is charged today.** `application_fee_amount` is deliberately never sent (`authorize.ts:23-26,145`; `capture.ts:47-49,261`). Worse for the plan, the fee's intended base is the payments ledger, which holds the **gross** amount charged. "Platform fee on food only" needs a food-only figure stored on each order (Part 1.6).
3. **Several places rebuild an order's total and would silently drop new lines:**
   - the operator edit (`app/api/dashboard/action/route.ts:735-922`);
   - the walk-up "Add order";
   - the database function `place_order_atomic` (a hard-coded column list);
   - the draft → order promotion;
   - the dashboard's client-side edit preview.
4. **Paying at the hatch after a card hold is released** collects the whole balance. A card surcharge or online service fee still inside `total_minor` would be over-collected, so the total must be re-priced when the payment channel changes.
5. **Reports call everything "revenue".** Tax, tips and fees would be counted as food sales and pushed into the "Other" category.

**Found along the way, unrelated to the plan but worth fixing** (decisions D30–D34):
- emails never show the discount-code line (`lib/email.ts:322`, `const discountRow = ''`);
- the customer page has no discount-code box, yet `/api/menu` sends **every active code** to the public;
- `update_event_deal` does not check that the event belongs to the truck;
- the report's "deal savings" figure is really code discounts;
- a fixed-amount code discount isn't capped at the subtotal.

**Printed accents:** "Jalapeños" prints as "Jalape?os" because one shared encoder (`lib/printing/ticket.ts:435-450`) turns every character outside plain ASCII except "£" into "?" **before** any printer sees it. The printer is already told to use the Windows Latin-1 code page, which contains "ñ".

**Two deploy notes, detailed in Part 8:**
- **Order:** Vercel deploy → push to `main` (the scraper) → edge functions → `_16`, with its read-only check first.
- **Re-running `_16`:** it was reversed by hand, so it is needed again after deploy.

---

## Part 1 — The money path map

**Notation:**
- **(a)** added tax (US, on top);
- **(b)** tip;
- **(c)** card surcharge (credit only);
- **(d)** online service fee.

**"GB" says how the UK output stays byte-identical.** One rule covers almost every row: each new value defaults to 0 or null, each new line renders only when its value is non-zero, and new email and ticket inputs are optional. For the UK, tax is included and (b)–(d) are switched off, so every number and string stays as it is today. That is already proven possible: `money-sweep-parity`, `country-settings-parity`, `time-dates-parity` and `schedules-country-parity` hold UK output to the byte.

### 1.1 Arithmetic and pricing

| Where | What it does today | Assumes | (a)–(d) |
|---|---|---|---|
| `lib/order-calculations.ts:78-135` `calculateOrderTotal` | `subtotal = items + deals`; `discountAmt` (`pct` of subtotal, or `fixed` value); `total = max(0, subtotal − discount)`, in major-unit floats | tax included; nothing else | **Keep `total` meaning "food after discount".** Add a second step, e.g. `finishOrderTotal(food, rules)`, that returns `tax`, `serviceFee`, `tip`, `surcharge` and `grandTotal`. GB rules give all zeros, so `grandTotal = food` |
| `lib/order-repricing.ts:350-507` `repriceOrder` | server authority: resolves every price from the price book or locked lines, then calls the above | same | passes the new rules through; tip and fee **choices** are inputs, their **amounts** are always recomputed on the server |
| `lib/event-pricing/price.ts:52-224` (`add_amount`, `sub_amount`, `add_pct`, `sub_pct`), applied in `/api/menu` (`route.ts:362-378`) and `loadEventPriceBook` (`read.ts:342-380`) | adjusts **item unit prices only**, in pence, never below 0 | — | unaffected: event prices are food prices, and tax and fees come after (decision D7) |
| Deals (`bundles_db`, `order-calculations.ts:90-107`); modifiers built into `unit_price` (`order-repricing.ts:416-418`); upsells become normal lines at menu price | food | — | unaffected; all of it is food |
| Slot / batch capacity (`lib/slot-availability.ts`, `lib/orders/*`, `backfill-usage`) | counts items only | — | **no money involved** |

### 1.2 Customer side

| Where | Shows / does | (a) tax | (b) tip | (c) surcharge | (d) service fee |
|---|---|---|---|---|---|
| Order page menu prices `app/trucks/[slug]/order/page.tsx:3126, 3189, 3294, 3307, 3906, 3936, 3955` | item price, `+£` modifiers, "Add to basket · £X" | US shows pre-tax prices; optional "+ {taxLabel}" hint | — | — | optional "A {fee} applies to online orders" note near the basket |
| Basket breakdown `:1535-1609` `orderBreakdownEl`, total `:1499-1510` | lines, "Code: X −£d", **Total** (no subtotal row) | add **Subtotal** + **{taxLabel}** rows | **Tip** row | **Card fee** row (after the card is entered) | **Service fee** row |
| Collapsed summaries `:3502-3523`, footer peek `:3805-3824` | "N items · £total" | show the grand total | same | same | same |
| "Place order" + card/hatch radio `:3741-3770` | — | — | **tip selector goes here** (card orders) | disclosure line goes here | fee disclosed here, before pressing |
| Payment sheet header `:3449`, button `:3484-3488` "Pay £X" | server total | grand total | grand total | changes once the card is known (Part 4) | grand total |
| Basket fingerprint `:2009-2022` | rounds `total` | — | must include the tip choice, so a changed tip reopens a fresh hold | — | — |
| Submit body `:2064-2085` | items, deals, code, advisory totals | — | add the tip **choice** only | — | — |
| Express checkout | Apple Pay / Google Pay are wallets **inside** the Payment Element (`:1855-1868`), no separate button | same flow as card | same | wallet cards report their funding too | same |
| Confirmation (in page) `:2383-2420`, `OrderConfirmation` `:4098-4253` | lines, deal savings, **Total**, payment line; **no discount row** | rows when non-zero | row | row | row |
| Status page `app/order/[id]/manage/page.tsx:233-245`, API `app/api/orders/[id]/route.ts:33-55,112-139` | item rows, Total (deals not listed; `subtotal`/`discount_amt` not selected) | select and return the new columns; add rows | same | same | same |

### 1.3 Emails and receipts (`lib/email.ts`)

**There is no separate receipt template.** The confirmation email is the receipt, and **no email mentions VAT, tax, tips or fees today.**

| Template | Money it shows today (quoted) | Change |
|---|---|---|
| `formatConfirmationEmail` `:223-509`, used for received, confirmed, ready, edited and time-changed orders (call sites: submit `:1413`, promote-draft `:480`, dashboard action `:200, :341, :1058, :1855, :2233`) | HTML "Total \| £12.50" (`:420-423`); text **"Total: £12.50"** (`:473`); item text "2x Burger — £12.00" (`:450`); modifier "+£x"; deal "🎁 name: …"; payment box from `paymentNote` `:28-146` ("Pay at the truck on collection", "Your card is held, not charged", "Paid by card", "Part paid — £x still to pay"). ⚠️ `const discountRow = ''` (`:322`): **the discount line is never shown**, so a discounted order's lines don't add up to its total | optional `subtotal, taxAmt, taxLabel, tipAmt, serviceFeeAmt, surchargeAmt`. Rows are inserted where `discountRow` sits, **only when > 0**, in both HTML and text |
| `formatNewOrderEmail` (to the truck) `:519-566` | "Total \| £x"; text "… Total £12.50." | add a Tip row (the truck wants to see it) |
| `sendRefundEmail` `:765-802` | "{truck} has refunded your order. £x has gone back to the card…"; partial "…The rest of the order, £y, is unchanged." | `chargedMinor` must be the full charged amount, including (a)–(d) |
| `cancellationPaymentSentence` `:680-708`, `sendCancellationEmail` `:804-865` | "£x has been refunded to your card…" | amount includes everything refunded |
| Rejection `:727-751`, event cancellation `:867-909` | no amounts | none |
| Edit subject (`action/route.ts` ~`:1093-1100`) | "Order #12 updated - now £13.00 (was £10.00)" | grand totals |

### 1.4 Kitchen surfaces and the apps

| Where | Shows | Change |
|---|---|---|
| Printed ticket, **one renderer for Bluetooth and wired**: `lib/printing/ticket.ts:333, 344, 356, 367` (lines), **`:381-383` `TOTAL`**, `:387-399` "TO PAY / PAID / CARD HELD"; `mapOrderToTicket.ts:76-120` | line prices; TOTAL = `order.total` | add Subtotal / tax / Service fee / Tip / Card fee lines between `:381` and `:383`, only when present (an optional `adjustments` list on `TicketOrder`). `ExhaustiveTicketOrder` (`:34`) makes a forgotten field a build error. **GB:** with no list, `encodeEscPos` returns the same bytes, and a golden-bytes test can prove it |
| KDS `app/dashboard/[token]/kds/page.tsx:1875` (cook mode hides amounts), `:2901-2919` done strip, `:400` paid status | balance and paid status | new lines must respect `hideAmounts` |
| `components/dashboard/OrderCard.tsx:1242, 1281` (header total), `:1396, 1419, 1480, 1488` (lines), `:354-364` charge breakdown, `:505, 541, 628, 731, 783` (part-paid, refunded, "Mark £y paid") | `order.total` and the ledger balance | add rows after the items; "Mark £y paid" is wrong for a cash payment if a card-only surcharge is still in the total (see 1.5) |
| `app/dashboard/[token]/page.tsx:6432` reject modal " · £total"; edit preview **`:3823-3843`** (client-side delta on `baseline.total`), `:6528-6537` "Extra to collect / Reduction" | | with tax and percentage fees, the delta must come from the server, not linear arithmetic |
| `components/dashboard/AddOrderPanel.tsx:551-558` (`calculateOrderTotal`), `:1489-1490` (advisory body), **`:1559` offline optimistic order total** shown on the card, KDS and **ticket** until sync | | walk-up orders: tax yes, no online service fee, no platform fee. Offline totals need tax rules in the cached truck snapshot (`lib/native/truckSnapshot.ts:28`, `menuSnapshot.ts:26-34`), or must be flagged "provisional" |
| Native iPad / Android | `capacitor.config.ts` loads the hosted web app; Swift/Java hold **no amount logic**; net-printer plugins only write bytes | nothing native; everything is the web code above |

### 1.5 Stripe, ledger and refunds

| Where | Today | Change |
|---|---|---|
| **PaymentIntent** `lib/payments/authorize.ts:61-208` `authorizeDraft` | `amount: serverTotalMinor`, `capture_method: 'manual'`, `payment_method_types: ['card']`, **direct charge** on the truck's account; **no** `application_fee_amount`, `on_behalf_of` or `transfer_data`; idempotency key `pi_create:${orderKey}` | amount = grand total; a changed amount needs `paymentIntents.update` or a new key (the same key with a different amount is an error) |
| Submit card fork `app/api/orders/submit/route.ts:886-1030` | `createOrderDraft` (`:959-976`) → `authorizeDraft` (`:995-1000`); pay-at-hatch insert `:1209-1224` → RPC `place_order_atomic` (`20260804_place_order_atomic_placed_at.sql:76-95`, which computes `total_minor = round(total*100)`) | new columns in the draft, `DRAFT_ROW_COLUMNS` (`lib/payments/order-drafts.ts:44-55,200-216`), the promotion (`lib/payments/promote-draft.ts:360-385`) and **a new version of `place_order_atomic`** |
| **Capture** `lib/payments/capture.ts:118-385` | `captureMinor = min(balance, authorised)` (`:245`), partial capture by `amount_to_capture`; **never more than the hold** | `application_fee_amount` belongs **here**, computed from the final food base (it's accepted at capture, and the final amount is known only then) |
| **Balance** `lib/payments/ledger.ts:197-243` | `balance = total_minor − (charges − refunds)`; negative → `refund_due` | keep `total_minor` = grand total, or every surface shows `refund_due` |
| Hatch collection `ledger.ts:629-660` `recordCollectionPayment`, actions `collected*` (`action/route.ts:524-594`), `mark_paid*` (`:2479-2520`) | books the whole balance as `in_person_other` | **re-price when the channel changes** (card hold released → pay at hatch): drop the surcharge and online service fee |
| **Refunds** `lib/payments/refund.ts:76-294` | limited to captured − refunded (`:161`); `stripe.refunds.create` (`:195-210`); `:182-198` warns that `refund_application_fee` must ship **in the same commit** as any fee | full refund = everything charged; partial refunds need a split rule (D16); fee clawback by `refund_application_fee` (proportional to the whole charge) or by an explicit `applicationFees.createRefund` (food-only) |
| Webhooks `app/api/webhooks/stripe/route.ts` | `payment_intent.succeeded` writes `pi.amount_received` (`:535-543`); refund events, one row per `re_` | consider handling `application_fee.created/refunded` for reconciliation once fees exist |
| Connect `lib/stripe/connect.ts:216-265` | Accounts v2, `fees_collector: 'stripe'` (the truck pays Stripe's fee) | a platform fee is only possible via `application_fee_amount` on these direct charges |
| **Tap to Pay / in-person** | **no Terminal or Tap to Pay code at all** (only fee copy and "Coming soon" in `PaymentsTab.tsx:740-766`; `in_person_stripe` exists as a channel name, unused) | nothing to change yet; see Part 4.2 |

### 1.6 Manage, reports and admin

| Where | Sums | Change |
|---|---|---|
| `get_report` `app/api/manage/route.ts:2969-3119` | `totalRevenue = Σ orders.total` (`:3081`); `dealSavings = Σ discount_amt` (`:3082-3083`, **misnamed**); item revenue `Σ unit_price×qty`; ignores refunds; doesn't select `currency` | return food, discount, tax, tips, surcharges and service fees separately; show "Food sales" and "Collected" as two figures |
| Reports tab `app/manage/[token]/page.tsx:15134-15169` `revenueBreakdown` | `base = total − deals − mods`, **with any drift pushed into "Other"** | tax, tips and fees would land in "Other"; base must be "food after discount" |
| Orders CSV `:15230-15255`, Items CSV `:15257-15270` | one `Total` column | add Subtotal, Discount, {tax}, Tip, Card fee, Service fee, Total (and Refunded) |
| Payouts | none (Stripe's own dashboard) | none |
| Dashboard day totals | none | none |
| Admin | no revenue report; platform fee exists only as `country_settings.platform_fee_pct` and display text (`lib/plan-features.ts:85-128`) | the allowance/fee meter must read a **food-only** base, not `order_payments.amount_minor` (gross) |

### 1.7 Proposed schema — NOT TO RUN

The `orders` table predates the migrations folder, so the existing column types should be confirmed live before any of this is written. `total` and `subtotal` are `numeric(8,2)`; `total_minor` is an integer.

```sql
-- NOT TO RUN — a sketch for the Phase 3–6 build, for discussion only.
alter table public.orders
  add column if not exists food_minor             integer,               -- items + deals − discount: THE platform-fee base
  add column if not exists tax_minor              integer not null default 0,
  add column if not exists tax_rate_bps           integer,               -- snapshot of the rate used (null = inclusive / none)
  add column if not exists tax_inclusive          boolean,               -- snapshot of country_settings.prices_include_tax
  add column if not exists tax_label              text,                  -- snapshot: 'VAT' / 'Sales tax'
  add column if not exists tip_minor              integer not null default 0,
  add column if not exists service_fee_minor      integer not null default 0,
  add column if not exists card_surcharge_minor   integer not null default 0,
  add column if not exists card_funding           text,                  -- credit | debit | prepaid | unknown
  add column if not exists card_fee_payer         text,                  -- truck | customer (snapshot of the truck's choice)
  add column if not exists application_fee_minor  integer;               -- the platform fee actually charged
-- the same columns on public.order_drafts; total_minor keeps meaning the GRAND total everywhere.

alter table public.order_payments
  add column if not exists application_fee_minor          integer,       -- from the capture response
  add column if not exists application_fee_refunded_minor integer,       -- on refund rows
  add column if not exists card_funding                   text;

alter table public.trucks
  add column if not exists tax_rate_bps          integer,                -- the truck's own rate (US); null = none
  add column if not exists tipping_enabled       boolean,                -- null = the country default
  add column if not exists card_fee_payer        text not null default 'truck' check (card_fee_payer in ('truck', 'customer')),
  add column if not exists service_fee_enabled   boolean not null default false,
  add column if not exists service_fee_bps       integer,
  add column if not exists service_fee_fixed_minor integer;

alter table public.truck_events
  add column if not exists tax_rate_bps integer;                         -- per-event override; null = the truck's rate
```

`place_order_atomic` would need a new version that carries these columns. Every UK row reads 0 or null, and `total_minor` is unchanged.

---

## Part 2 — Tax

**What exists:**
- **`country_settings` has `prices_include_tax`** (GB `true`, US `false`) **and `tax_label`** (GB "VAT", US "Sales tax").
- **There is no tax rate anywhere.**
- **Nothing outside the loader and the admin Countries page reads either column.**
- **`country_settings` is service-role only.** The order page never sees it; `/api/menu` passes only `truck.money = {currency, locale}` (`route.ts:817-826`). The checkout rules (rate, label, inclusive flag) must be added to that payload as new keys.

**Do UK receipts show VAT today? No.** The confirmation email shows lines and "Total: £12.50" only. The ticket shows "TOTAL £12.50". The status page shows "Total". The word VAT appears only in the operator terms (`content/legal/terms-and-conditions.md:48,64`). For the UK this stays as it is: tax is included, and nothing new is shown.

**How it would be calculated:**
- **Level:** order-level, on "food after discount", with **one rounding at the end** (half away from zero, to the currency's minor unit). This matches how a discount works today. A line-level calculation would be needed only for per-item tax categories (D5).
- **Extras and modifiers** are inside `unit_price`, so they are taxed with the item.
- **Deals** are taxed at their deal price.
- **Discount codes** come off before tax, which is normal for a merchant's own coupons (D6).
- **Whether a service fee or surcharge is taxed** varies by state (D8).

**Where the rate would live:**
- On the truck (`trucks.tax_rate_bps`), with an optional per-event override (`truck_events.tax_rate_bps`).
- **Manage › Settings › "Taking payment"** (`app/manage/[token]/page.tsx:12274-12430`) gains a "Sales tax" row, shown only when the truck's country adds tax on top. Proposed words: *"Sales tax rate — the rate you charge. Customers see it added at checkout."*
- The **Add / Edit event** form gains *"Tax rate for this event (leave blank to use your usual rate)"*, again only in those countries.
- Saves go through the `update_truck` allow-list (`app/api/manage/route.ts:1952`) or a dedicated action.

**What each surface would say (US):**
- Checkout and confirmation: `Subtotal $24.00` / `Sales tax $1.98` / `Total $25.98`.
- Ticket: `Subtotal 24.00` / `Sales tax 1.98` / `TOTAL 25.98`.
- Email: the same three rows.

**Read today:** no tax, tip, surcharge or service-fee column of `country_settings` is read outside its loader, the Countries page and the seeds. One stale hint should be removed or wired: the Countries page says the surcharge switch *"Shows 'Who pays the card fee' in Manage › Payments"* (`components/admin/CountriesTab.tsx:291`), but no such screen exists yet.

## Part 3 — Tips

**Where the choice sits:**
- On the order sheet, directly above "Place order" (`order/page.tsx:3741-3770`), **for card orders only**. A pay-at-the-truck customer tips in person.
- **When it shows:** only when the truck has tipping on. That defaults to `country_settings.tipping_enabled_default` (US on, GB off), and the truck can switch it in Manage.
- **Choices:** the preset buttons from `tip_presets_pct` (US 10 / 15 / 20 %), plus "No tip" and "Other amount".
- **Base:** percentages of food after discount, before tax (D11).

**Server:**
- Only the **choice** is sent: a preset or a custom minor amount. The server recomputes it, and caps a custom tip (e.g. at 100 % of food, D12).
- The tip joins the basket fingerprint, so a changed tip makes a fresh hold.

**How a tip shows:**
- **KDS / order card:** a "Tip" row after the items (hidden in cook mode).
- **Ticket:** `Tip 3.60`.
- **Receipt, email and status page:** a "Tip" row.
- **Reports:** a "Tips" figure and CSV column.
- **Payouts:** inside the charge. The truck owns the connected account, so tips reach it with the payment.

**Refunds:**
- A **full** refund returns the tip.
- A **partial** refund for a missing item would normally keep the tip (D16).
- The refund row should record the split.

**Excluded from the platform fee:** the fee base is `food_minor` (Part 1.7), which never includes the tip.

## Part 4 — Card-fee surcharge

### 4.1 When is credit or debit known?

**Today: never.** The PaymentIntent, with its amount, is created at "Place order", and only then does the Payment Element mount for the card (`submit/route.ts:995-1000`, `order/page.tsx:1855-1913`). No code reads `funding`. So a credit-only surcharge needs the funding type **before** the amount is final.

**Options:**
1. **Deferred-intent checkout (recommended).**
   - The Element is created with `mode: 'payment'` and the amount.
   - On Pay, run `elements.submit()` then `stripe.createConfirmationToken()`.
   - The server reads `payment_method_preview.card.funding` (wallets included), adds the surcharge if it's credit, then creates and confirms the PaymentIntent with the confirmation token in one call.
   - **No second customer step.** The Pay button can show "Pay $25.98 + card fee if credit", and the final amount is shown in the confirmation.
2. **Keep the current flow and change the amount.**
   - Create a ConfirmationToken or PaymentMethod, read its funding, `paymentIntents.update({ amount })`, `elements.fetchUpdates()`, then confirm.
   - Also no extra step, but the hold's idempotency key and the draft's `total_minor` must change with it.
3. **Charge the surcharge on every card.** Not allowed where the country is credit-only (the US setting is credit-only).
4. **Ask the customer** ("Is this a credit card?"). Unreliable, and a second step.

**Recommendation: option 1.** It is the shape Stripe documents for surcharging, and it removes the "amount fixed before the card" problem for good.

### 4.2 In person and Tap to Pay

- **No Terminal or Tap to Pay exists in the code.**
- **A walk-up on the truck's own terminal** is outside HatchGrab, so a surcharge there is the truck's own business.
- **If Tap to Pay is built later:** Stripe Terminal reads the card before the amount is captured (`card_present` details carry the funding type). That flow could apply a credit-only surcharge before capture, but it must show the amount on screen before the tap is confirmed.
- **Recommendation:** no surcharge on in-person orders at first (D20).

### 4.3 Manage › Payments today, and where the choice goes

**Today, `components/manage/PaymentsTab.tsx` has no saved payment settings.** It contains:
- Stripe onboarding (`:169-184, 543-679`);
- the "Online payments" card, whose fee sentence (`:513-516`) reads *"Stripe charges {fee} … HatchGrab's own fee on online orders depends on your plan — see Billing"*;
- a read-only "Walk-up payments" box (`:689-768`).

**The new choice** goes in the Online payments card, right after that sentence, shown **only when** the truck's country allows a surcharge and online payments are on. In the UK it never appears. Proposed words:
- **Card fees on online orders:**
  - ◉ *I pay the card fee* (default)
  - ○ *Customers paying by credit card pay a card fee of up to {cap}%. Debit cards are never charged.*
- If the truck's state is excluded: *"Card fees can't be passed on in {state}, so you pay them."*

**State matching doesn't work as stored today (D22).**
- `trucks.base_region` holds the **full state name** from Places ("Massachusetts"), and is null for a town typed by hand (`lib/places.ts:81-84`).
- `country_settings.card_surcharge_excluded_regions` holds **two-letter codes** (`{CT,MA,PR}`).
- So either store the short code too, or map names to codes.
- With an unknown state, treat the truck as **excluded** (the safe default).

### 4.4 What the customer sees before paying

1. In the basket (once a card order is chosen): *"Credit cards: a card fee of {n}% is added. Debit cards: no fee."*
2. On the Pay button or just above it: the same sentence, plus the amount without the fee.
3. After the card is entered (option 1): the confirmation shows *"Card fee (credit) $0.78"* before the hold is placed.
4. Receipt, email and status page: a "Card fee" row.

**Rules to keep:**
- The fee never exceeds the cap (and never the truck's actual cost, D21).
- It is not charged on debit or prepaid cards.
- It is dropped if the order is later paid at the hatch.

## Part 5 — Online service fee

**Every point where it must be visible before payment:**
1. **Menu:** a one-line note under the truck header or the basket button: *"A £0.50 / 3% service fee applies to online orders."*
2. **Basket:** a "Service fee" row above Total.
3. **Order sheet:** the same row in the collapsed summary (`:3502-3523`) and the footer peek (`:3805-3824`), so the total the customer sees always includes it.
4. **Payment sheet header and Pay button:** the grand total, which includes it.
5. **Express checkout:** the wallets live inside the Payment Element, whose amount already includes the fee. No separate surface.

**Keeping it off in-person orders:**
- Compute it **only** on the online path (`submit/route.ts`).
- Never in the walk-up `add_order` (`action/route.ts:1271-1698`).
- Drop it when an online order switches to pay-at-the-truck, unless D25 decides otherwise.

**Taxability:** see D8. **It never enters the platform-fee base.**

## Part 6 — Legal and money wording

**Outside code comments, nearly all UK-specific wording sits in four places:** the legal Markdown, the landing and features SEO metadata, one Manage sentence, and the store listing. Prices, card-fee region labels, the tax name and phone hints already come from `country_settings`. Emails, the ordering UI, the dashboard, KDS, the plans PDF, push notifications and the native strings carry no literal "UK", "£", "GBP" or "VAT".

| File:line | Text | Seen by | Mark |
|---|---|---|---|
| `content/legal/terms-and-conditions.md:7` | "HatchGrab Ltd, company number 17381557, registered in England and Wales at … United Kingdom" | operators | fine for all countries (a company fact) |
| `terms:17` | "acting for purposes relating to your trade or business, and not as a consumer" | operators | **legal — Dominic decides** (UK consumer-law framing) |
| `terms:48` | "You are responsible for charging the right amounts, for VAT, and for your own tax affairs." | operators | must vary by country (use the tax name, or "for any sales tax or VAT") |
| `terms:64` | "Prices are in pounds sterling and exclude VAT unless stated." | operators | **legal — Dominic decides** (billing currency and tax for non-UK trucks) |
| `terms:144` | "…the total fees you paid us in the 12 months before the claim arose, or £100." | operators | **legal — Dominic decides** (a £ cap) |
| `terms:176` | "a data processing agreement under Article 28 of the UK GDPR" | operators | **legal — Dominic decides** |
| `terms:198` | "Where a sub-processor processes data outside the UK, … International Data Transfer Agreement or Addendum" | operators | **legal — Dominic decides** |
| `terms:219` | "governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction" | operators | **legal — Dominic decides** |
| `terms:226` | contact address "… United Kingdom" | operators | fine |
| `content/legal/privacy-policy.md:18, 21, 174` | "registered in England and Wales", address | everyone | fine |
| `privacy:102-103` | "Supabase … United Kingdom (London)", "Vercel … United Kingdom (London)" | everyone | fine (facts) |
| `privacy:114` | "Your account data and order data are stored and processed in the United Kingdom…" | everyone | **legal — Dominic decides** (transfer framing for EU / US people) |
| `privacy:125` | "Accounting records: six years … as UK tax law requires." | everyone | **legal / must vary** |
| `privacy:135` | "Under UK data protection law you have the right to:" | everyone | **legal — Dominic decides** |
| `privacy:149` | "complain to the Information Commissioner's Office at ico.org.uk, or on 0303 123 1113" | everyone | **legal — Dominic decides** (other countries' authorities) |
| `privacy` header vs `lib/legal.ts` | page says "Last updated: 5 September 2026", `PRIVACY_UPDATED = '6 August 2026'` | everyone | fix (the dates disagree) |
| `components/manage/DeleteAccountSection.tsx:284` | "Anonymous accounting records are **kept for six years**, as UK law requires." | operators | must vary by country (and match the privacy policy) |
| `app/manage/[token]/page.tsx:9971, 9974, 10265` | placeholders "e.g. 123 High St, Wickhambrook…", "e.g. Wickhambrook", "The Crown, Wickhambrook, 5pm-9pm" | operators | must vary (low priority) |
| `app/landing/page.tsx:84, 127, 136` | "Food truck & mobile catering ordering system — HatchGrab UK" (title, OG, Twitter) | public / search | must vary by country (or drop "UK") |
| `landing:98, 130, 139, 254` | "…software for UK food trucks and mobile catering — not a POS." | public / search | must vary |
| `landing:256` | JSON-LD `areaServed: { '@type': 'Country', name: 'United Kingdom' }` | search engines | must vary |
| `landing:117, 255`, `app/features/page.tsx:79` | `locale: 'en_GB'`, `inLanguage: 'en-GB'` | search | must vary |
| `app/features/page.tsx:52, 73, 82` | "Plans & features compared — HatchGrab UK" | public / search | must vary |
| `public/screenshots/customer-order.png`, `dashboard-v4.png` (probably `kitchen.png`) | **£ baked into the images** (£12.00, "Take payment £50.00") | landing visitors | must vary by country (US images) |
| `content/store-listing.md:81` | "Free to try. UK based." | store listing | Dominic decides (keep as a company fact, or drop) |
| `app/api/manage/process-allergens/route.ts:49`, `lib/menu-extract.ts:132` | AI prompts say "the 14 UK statutory allergens", ignoring `allergen_set` (uk14 / us9) | output seen by everyone | must vary by country |
| `app/api/admin/outreach/attachments/route.ts:95` | `generatePlansPdf('GB')` | prospects | fine today; must follow the prospect's country later |
| Admin-only (`app/admin/page.tsx:1837` "£9", `CountriesTab.tsx:282, 324, 337`, `lib/admin/country-form.ts:206, 209, 217`) | example text | Dominic | fine |

**Files that reference `outreach_templates`** (contents not read or listed):
- `app/api/admin/outreach-templates/route.ts`
- `app/api/admin/outreach-snippets/route.ts`
- `components/admin/TemplatesPanel.tsx`
- `lib/outreach-snippets.ts`
- `lib/outreach-template-render.ts`

## Part 7 — Printed accents ("Jalape?os")

### Root cause: one shared encoder, before every printer

`lib/printing/ticket.ts:435-450`:
```ts
export function printableText(s: string): string { …
    if (c >= 0x20 && c <= 0x7E) out += ch
    else if (ch === '£') out += '£'
    else out += '?'
```
```ts
function strBytes(s: string): number[] {
  for (const ch of printableText(s)) out.push(ch === '£' ? 0xA3 : (ch.codePointAt(0) ?? 0x3F))
```
- **"ñ" (U+00F1) becomes "?" (0x3F) in JavaScript**, before any transport.
- **Every path sends those exact bytes:**
  - **Bluetooth:** `lib/printing/bleTransport.ts:276-301`, 180-byte slices.
  - **Wired / network** (TCP 9100): `lib/printing/netTransport.ts:46-50, 129` base64, then the native plugins decode and write unchanged (`NetPrinterPlugin.swift:35`, `NetPrinterPlugin.java:33-67`).
  - **USB / MFi:** not implemented.
- **The printer is already told the right code page:** `ticket.ts:477-478` sends `ESC t 16`, Windows Latin-1 on Epson-compatible printers, where ñ = 0xF1. The character is thrown away before the printer could print it.
- **The on-screen preview copies the bug on purpose:** `components/printing/TicketPreview.tsx:53` uses `printableText` ("José prints 'Jos?'").
- **A related layout fault:** `wrap` / `padBetween` (`ticket.ts:158-191`) measure the **unsanitised** string, so an emoji or a decomposed accent shifts right-aligned prices by a column. Any fix should clean the text **before** layout.

### Fix options

| Option | How | For | Against |
|---|---|---|---|
| 1. Transliterate to ASCII | NFC; a small table (ß→ss, æ→ae, ø→o, œ→oe, curly quotes, dashes, …, € → "EUR"); then NFD and strip accents; "?" only for what's left. Inside `printableText`, applied before layout | works on every printer; nothing to test on hardware; UK bytes unchanged; preview stays true | prints "Jalapenos" (no accent) |
| 2. Map to Windows Latin-1 (matches the `ESC t 16` already sent) | a 0x80–0xFF table (£ stays 0xA3, € = 0x80), with option 1 as the fallback | real accents for Western European text; no new printer command; UK bytes unchanged | `ESC t` numbering differs on some clones, so a mismatched printer prints the **wrong** accent rather than "?"; unverified on hardware |
| 2b. PC858 (`ESC t 19`) | | common on clones | changes the £ byte (0xA3 → 0x9C), so **UK bytes change** |
| 3. UTF-8 | send UTF-8 (`FS ( C` on newer Epsons) | all characters | most Bluetooth clones print garbage |
| 4. Print as an image | draw the ticket and send `GS v 0` | any script | 50–80 KB per ticket over Bluetooth (seconds), a large rewrite |

**Recommendation:**
- **Ship option 1 now.** It is never worse than today on any printer.
- **Then add option 2** behind a per-device setting (`ascii` by default, `cp1252` once a test ticket proves it), with a line like `é ñ ü ß £ €` added to the test ticket.
- Keep `ESC t 16` and £ = 0xA3, so UK tickets stay byte-identical either way.

## Part 8 — Deploy runbook (plain words)

### 8.1 What is uncommitted, by phase

There are **276 changed paths**: 168 modified and 108 new, 25 of them screenshots. All are on `main`, on top of `f4bd277` ("social media fixes", 9 October).

| Phase | What changed (main files) | Migrations |
|---|---|---|
| **0 — international audit** | `docs/international-audit-report.md` | — |
| **1 — country settings** | `lib/country-settings.ts`, `country-settings-types.ts`, `lib/admin/country-actions.ts`, `country-form.ts`, `country-store.ts`, `app/api/admin/countries/`, `components/admin/CountriesTab.tsx`, `components/CountrySettingsProvider.tsx`, `lib/marketing-country.ts`, landing / features / compare / plans PDF read prices from settings; harnesses `country-settings-parity`, `countries-api`, `countries-screenshots` | `_01`–`_05`, `_10` |
| **2A — money** | `lib/money-format.ts`, `money-server.ts`, `lib/payments/currency.ts`, `components/MoneyContext.tsx`, every £ in the dashboard, Manage, printing, emails and payments; `money-sweep-parity` | `_06`–`_09` |
| **2B — time zones** | `lib/truck-time.ts`, `components/TruckTimeContext.tsx`, time handling across order, dashboard, KDS, Manage, emails and printing; **both edge functions** (`supabase/functions/auto-event-scheduler`, `heartbeat-monitor`: each truck's own zone); `time-dates-parity` | — |
| **2C — phone numbers** (+ the phone check setting) | `lib/phone.ts`, `lib/phone-copy.ts`, phone checks everywhere; **`libphonenumber-js` 1.13.13** added to `package.json` | `_11`, `_12` |
| **Schedule country audit** | `docs/schedule-country-audit-report.md` | — |
| **2D-1 — signup and landing country** | `components/setup/WhereBasedStep.tsx`, `DemoGetStarted.tsx`, `app/setup/page.tsx`, `app/api/setup/*`, `lib/provision-truck.ts`, `lib/places.ts`, `app/api/places/*`, `components/manage/WhereYouTrade.tsx`, `lib/visitor-country*.ts`, `components/landing/CountryMenu.tsx`, `lib/flags.ts`, `proxy.ts`, admin create-truck; **`country-flag-icons` 1.6.20** added; `marketing-country-parity`, `signup-country` | `_13` |
| **Remove travel distance** | step / Settings / copy / Countries page | `_14` |
| **2D-2 Part A — schedules by country** | `lib/discovery-country.ts`, gate, bridge, ingest, feed, `lib/venue-matcher.ts`, screenshot route / panel / picker, `lib/schedule-context.ts`, importer, `scripts/run-scraper.js` + `scraper-prompts.js`, Hatches Up importer, `process-next-truck.js`, outreach / graduation / admin events; `schedules-country-parity`, `_fake-pg` | `_15`, **`_16` (after deploy)** |

`package-lock.json` changed with the two packages. Vercel installs from the lockfile.

### 8.2 Migration ledger

| File | Status (from Dominic) | Deploy-coupled? |
|---|---|---|
| `20261010_01` – `_12` | run | no — additive, already live |
| `_13` truck base area | run | no |
| `_14` retire travel columns | run | no (comments only) |
| `_15` discovery country | run | **needed before the new code**, which upserts on the country-scoped keys: done |
| `_16` drop global name keys | **run early, then reversed** by re-adding `discovery_trucks_name_key`, `venues_name_village_key` and `discovery_trucks_norm_name_uniq` by hand | **yes — run again only after every step below** |

**Before deploying, run this read-only check.** It confirms both sets of keys are present, as the new code expects until `_16`. Expect the three new indexes valid, and the three old ones present (as constraints or indexes).
```sql
select c.relname, i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid
 where c.relname in ('discovery_trucks_country_name_uniq', 'discovery_trucks_country_norm_name_uniq',
                     'venues_country_name_village_uniq',
                     'discovery_trucks_name_key', 'discovery_trucks_norm_name_uniq', 'venues_name_village_key');
```

### 8.3 The order

**0. Before anything:**
- Run the localhost checklist (8.4).
- Commit everything on a branch and look at the diff once more. **This audit commits nothing.**
- Optionally set `GOOGLE_MAPS_API_KEY` in Vercel (Places API (New) enabled; restrict it by API, not by referrer). Without it, the town box takes free text.

**1. Vercel deploy.**
- If Vercel builds from git, the push in step 2 **is** the deploy. Otherwise deploy with the Vercel CLI first and wait until it is live.
- **Check:** the landing page and `/features` load; Manage loads for Pizza Kitchen; `/admin` Screenshots shows the country picker.
- **Rollback:** Vercel › Deployments › the previous deployment › "Instant rollback".

**2. Push to `main`.**
- The GitHub Actions scrapers (`daily_scrape.yml` 06:00, `hatchgrab_scrape.yml` hourly at :00, `process-next-truck.yml`) check out `main` on their next run.
- Push just after a :00 run, so the deployed site is live before the next scrape. Pass B now sends the truck's country and id to the new bridge.
- **Check:** the next "hatchgrab_scrape" run is green, and its log shows "✅ Sent to inbound-schedule".
- **Rollback:** `git revert` the commit and push. The next run uses the old code, which still works while the old keys exist (i.e. before `_16`).

**3. Edge functions:**
```
npx supabase functions deploy auto-event-scheduler --project-ref ffphgwonshgxamtvefcv
npx supabase functions deploy heartbeat-monitor --project-ref ffphgwonshgxamtvefcv
```
- They now open and close each truck's events in **its own time zone**, read from `trucks.timezone`, falling back to `country_settings.default_timezone`. For UK trucks that is Europe/London, as before.
- **Check:** in the Supabase logs, the next scheduled run of each has no "🔴 No time zone for truck" line, and today's events still auto-open on time.
- **Rollback:** check out the old versions (`git show f4bd277:supabase/functions/<name>/index.ts`) into place and deploy them the same way.

**4. Re-run `_16`.** Only when 1–3 are done and a scrape has run green.
- First the read-only check from its header: the three new indexes valid.
- Then `supabase/migrations/20261010_16_drop_global_name_keys.sql`.
- Then its verify queries (zero rows).
- **Rollback:** re-create the three keys (below). This **fails** if two same-named trucks or venues in different countries exist by then, which is expected once US data arrives. Check first with the queries after it.

```sql
-- ROLLBACK FOR _16 ONLY — NOT TO RUN unless rolling back.
alter table public.discovery_trucks add constraint discovery_trucks_name_key unique (name);
create unique index discovery_trucks_norm_name_uniq
  on public.discovery_trucks ((regexp_replace(lower(name), '[^a-z0-9]', '', 'g')));
alter table public.venues add constraint venues_name_village_key unique (name, village);
-- read-only pre-checks (each must return no rows):
select name from public.discovery_trucks group by name having count(*) > 1;
select regexp_replace(lower(name), '[^a-z0-9]', '', 'g') from public.discovery_trucks group by 1 having count(*) > 1;
select name, village from public.venues group by name, village having count(*) > 1;
```

**5. The Apps Script newsletter (outside the repo).** In `runEmailJob`'s query, add this line after the `?select=…` line:
```
      "&country=eq.GB" +
```
If it's not added, US events are still read, but they sit too far from every UK subscriber to be sent, so this is tidiness, not urgency.

### 8.4 Localhost test checklist — Pizza Kitchen only

**Before you start:**
- **Keys:** start with `npm run dev`; it reads `.env.local`. In this shell, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `INBOUND_SCHEDULE_SECRET` and `GOOGLE_MAPS_API_KEY` are all **missing** (names only). A `.env.local` file **exists**, but it was not opened, so **whether it holds test-mode Stripe keys is for Dominic to confirm**.
  - ⚠️ If it holds **live** keys, do not place the card order below.
- **The database is live:** localhost uses the live database, so everything below touches real rows. Only Pizza Kitchen (id `test-truck`, slug `test-kitchen`) is used.

**The steps:**

1. **Landing flags.**
   - Open `http://localhost:3000/landing` at laptop width.
   - The header shows a 🇬🇧 flag image with "UK" between "Log in" and "Upload my menu"; the footer shows "United Kingdom".
   - Click either: the menu lists only the United Kingdom (the US is switched off), ticked.
   - Open `http://localhost:3000/landing?country=GB`: still UK, and the address keeps working.
   - Narrow the window to phone width: the header flag goes, the footer one stays.
   - Testing the US switch needs the US switched on (D27). Otherwise its behaviour is proven by `marketing-country-parity` on fixtures.
2. **Signup step.**
   - Open the demo, press "Save my menu" and enter a throwaway email; or go to `http://localhost:3000/setup` signed in as an operator **with no truck**.
   - On "Where's your truck based?", the country is the United Kingdom with "We guessed this from where you are…".
   - Type "Sud" in the town box: suggestions if the Maps key is set, otherwise it just takes the text.
   - There is no time-zone box for the UK.
   - **Stop before "Create account" / "Continue" on the last step**, so no real truck is made (D28).
3. **Manage › Settings › Where you trade** (Pizza Kitchen).
   - Country "United Kingdom — Your country can't be changed".
   - Pick a town; check the toast says saved.
   - Put it back to what it was (or leave it, since it's the test truck).
4. **Phone check** (Pizza Kitchen, Manage › Settings › Contact).
   - Type `12345` in Phone and leave the box: the error reads "Please enter a valid UK phone (e.g. 07700 900123)".
   - Put the real number back.
5. **Countries page** (`http://localhost:3000/admin?tab=countries`).
   - **Touch only the US column.** Change "Support hours", Save, then put it back and Save.
   - "+ Add country": code `ZZ`, name "Zedland", copy from United States. Then remove Zedland.
   - **Never press Save on the GB column.**
6. **Money formatting.**
   - `http://localhost:3000/trucks/test-kitchen/order`: prices show as "£9.50" etc.
   - Manage › Reports: totals in £.
   - The dashboard order cards: £.
7. **Admin › Screenshots.**
   - The drop zone says "Choose a country first" and dropping does nothing.
   - Choose "United Kingdom": "Resets at HH:MM unless you upload again".
   - Drop a screenshot of a **US** food truck's schedule (any public page): the row turns amber with "Check country" and "This looks like the United States…".
   - Press **Dismiss**. Nothing is written.
   - Don't use a UK truck's real schedule here, because it would add live discovery events.
8. **Test-mode card order and refund** (only with test keys).
   - On `http://localhost:3000/trucks/test-kitchen/order`, add an item, choose "Pay now by card" and pay with `4242 4242 4242 4242`, any future date and any CVC.
   - In Pizza Kitchen's dashboard, accept the order (this captures), then use Payment actions → Refund → full.
   - The refund email goes to the customer address you typed, so use your own.

### 8.5 After deploy — on the live site

- `https://www.hatchgrab.com/`: flag in the header, prices £29 / £49 unchanged.
- `/features` and `/compare` load.
- Village Foodie home: events and trucks listed as before.
- Manage for Pizza Kitchen: Settings shows "Where you trade".
- `/admin` Screenshots shows the picker.
- The next Pass B scrape is green; the next auto-open runs on time.
- After `_16`: the verify queries return no rows.

## Part 9 — Decisions (each with a recommendation)

**Tax**
- **D1 — Where the rate lives.**
  - (a) on the truck, with a per-event override;
  - (b) per van;
  - (c) from a tax service.
  - **Recommend (a)**, as planned. A US truck moving between cities sets the event override.
- **D2 — Rate format.**
  - (a) basis points (825 = 8.25 %);
  - (b) a decimal percentage.
  - **Recommend (a)**: whole numbers, no float drift.
- **D3 — Rounding.**
  - (a) one rounding on the order total, half away from zero;
  - (b) per line.
  - **Recommend (a)**.
- **D4 — Snapshot or live.**
  - (a) store the rate, label and amount on each order;
  - (b) recompute from the truck when shown.
  - **Recommend (a)**: receipts must not change when a rate changes.
- **D5 — Per-item tax categories** (e.g. untaxed groceries).
  - (a) not now;
  - (b) a category on each item.
  - **Recommend (a)** until a truck needs it.
- **D6 — Tax on discounted food.**
  - (a) the discount comes off before tax;
  - (b) tax on the full price.
  - **Recommend (a)**.
- **D7 — Event price changes** (add / subtract amounts).
  - (a) treated as food price, taxed;
  - (b) a separate line.
  - **Recommend (a)**.
- **D8 — Are the service fee and surcharge taxed?**
  - (a) not taxed;
  - (b) taxed;
  - (c) a country setting.
  - **Recommend (c)**, defaulting to "not taxed", because US states differ.
- **D9 — Tax on walk-up orders** taken in the dashboard.
  - (a) yes, same rate;
  - (b) no.
  - **Recommend (a)**: the truck owes it either way.
- **D10 — US menu prices.**
  - (a) show pre-tax prices with a "+ Sales tax" note;
  - (b) pre-tax, no note.
  - **Recommend (a)**.

**Tips**
- **D11 — Percentage base.**
  - (a) food after discount, before tax;
  - (b) the total with tax.
  - **Recommend (a)**.
- **D12 — Custom tip cap.**
  - (a) up to 100 % of food;
  - (b) a fixed cap;
  - (c) none.
  - **Recommend (a)**.
- **D13 — Pay-at-the-truck orders.**
  - (a) no tip online;
  - (b) offer a tip that is added to the amount due.
  - **Recommend (a)**.
- **D14 — Tip when the operator edits an order.**
  - (a) keep the same amount;
  - (b) keep the same percentage;
  - (c) ask.
  - **Recommend (b)**, capped at the original.
- **D15 — Tip on the kitchen ticket.**
  - (a) show it;
  - (b) hide it.
  - **Recommend (a)**: the truck is paid it.

**Refunds**
- **D16 — Partial refunds.**
  - (a) refund the line plus its tax, keep the tip, and refund the surcharge in proportion;
  - (b) a straight amount, with no split.
  - **Recommend (a)**, recording the split on the refund row.
- **D17 — Platform-fee clawback.**
  - (a) `refund_application_fee` (proportional to the whole charge);
  - (b) an explicit fee refund for the food part only.
  - **Recommend (b)**, because tips and tax would otherwise move the fee.

**Platform fee**
- **D18 — Fee base.**
  - (a) a stored `food_minor` on each order;
  - (b) computed from the ledger.
  - **Recommend (a)**: the ledger is gross.
- **D19 — When the fee is taken.**
  - (a) at capture, on the final food amount;
  - (b) at authorisation.
  - **Recommend (a)**.

**Surcharge**
- **D20 — In-person surcharge.**
  - (a) never at first;
  - (b) later, with Terminal.
  - **Recommend (a)**.
- **D21 — Surcharge amount.**
  - (a) the truck picks a percentage up to the country cap;
  - (b) always the cap;
  - (c) the actual Stripe cost.
  - **Recommend (a)**, with words saying it must not exceed what the truck actually pays (the US rule).
- **D22 — The state for excluded regions.**
  - (a) also store the two-letter code from Places (`shortText`);
  - (b) map names to codes.
  - Either way, **an unknown state counts as excluded**. **Recommend (a)**.
- **D23 — Funding check.**
  - (a) deferred-intent checkout;
  - (b) update the amount after a token.
  - **Recommend (a)**.
- **D24 — Prepaid cards.**
  - (a) no surcharge, like debit;
  - (b) surcharge.
  - **Recommend (a)**.

**Service fee**
- **D25 — An online order switched to pay at the truck.**
  - (a) drop the service fee and surcharge;
  - (b) keep the service fee.
  - **Recommend (a)**.
- **D26 — Service fee shape.**
  - (a) a percentage;
  - (b) a fixed amount;
  - (c) either, the truck's choice.
  - **Recommend (c)**, shown as one line.

**Testing and deploy**
- **D27 — Testing the landing page's US switch.**
  - (a) don't switch the US on yet (fixture-proven);
  - (b) switch it on briefly with US prices filled, then off.
  - **Recommend (a)**: the database is live, and switching on is public.
- **D28 — Testing signup end to end.**
  - (a) stop before the final press;
  - (b) create a throwaway operator and truck, then delete them.
  - **Recommend (a)**: the rules say test only on Pizza Kitchen.
- **D29 — Re-running `_16`.**
  - (a) right after a green scrape following deploy;
  - (b) wait a day.
  - **Recommend (a)**: the old global keys are what stop a same-named US truck.

**Found along the way (not part of the plan, worth fixing)**
- **D30 — The discount line never shows in emails** (`lib/email.ts:322`).
  - (a) show "Code X −£d" when there is a discount;
  - (b) leave it.
  - **Recommend (a)**. The UK email would change for discounted orders only, as a named change.
- **D31 — All active discount codes are sent to every customer** (`/api/menu`), while no code box exists on the order page.
  - (a) stop sending them;
  - (b) build the code box and validate codes on the server only.
  - **Recommend (a) now.**
- **D32 — `update_event_deal` accepts any event id** without checking that it belongs to the truck (`app/api/manage/route.ts:1237-1243`).
  - **Recommend:** check ownership, as `upsert_event` does.
- **D33 — The report's "deal savings" is really code discounts** (`manage/route.ts:3082-3083`).
  - (a) rename it;
  - (b) sum `deal_savings`.
  - **Recommend (b)**, plus a separate "Discounts" figure.
- **D34 — A fixed code discount isn't capped at the subtotal.**
  - **Recommend:** cap `discount_amt` at the subtotal, so tax is never computed on a negative base.
- **D35 — Allergen prompts always use the UK 14.**
  - **Recommend:** use `allergen_set` (US 9) before any US truck imports a menu.
- **D36 — Legal text** (Part 6): UK GDPR, the ICO, English law, the £100 cap, the sterling and VAT pricing clause, six-year retention.
  - (a) one global text with country sections;
  - (b) a version per country.
  - **Recommend (a)**, written with a lawyer before the first non-UK signup.
- **D37 — Landing SEO and screenshots** ("HatchGrab UK", `areaServed`, £ in the images).
  - **Recommend:** vary the title and description by the visitor's country, and add US screenshots when the US is switched on.
- **D38 — Printed accents.**
  - **Recommend** option 1 now and option 2 behind a per-device switch later (Part 7).
