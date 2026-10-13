# Phase 3 screens — tax, tips and the service fee on every screen; Manage › Payments; the Countries fee rows

**13 October 2026 · branch `main` (checkpoint `3033a53` + the uncommitted Phase 3 tree) · not committed · not pushed · not deployed · no SQL run · no `.env*` opened · no email sent · Pizzeria Gusto and `outreach_templates` untouched**

Every customer, kitchen and operator screen now shows tax, the online service fee and the tip, from one list of lines. Customers can add a tip by card. Owners set their sales tax rate, tips and their own service fee in Manage › Payments. The Countries page has the fee rows.

**The UK is unchanged.** Every UK order page, menu response, confirmation, status page, email, ticket, dashboard card, KDS board, report and CSV is byte-identical to BEFORE. The one named difference is **"Taking payment" moving from Settings to Payments**.

- **SQL:** one migration, `20261010_18_tax_rate_milli.sql`, **run now** (§1). It is your Option B: rates in thousandths of a percent.
- **Your decision change is in:** each truck has ONE sales tax rate. The per-event override is gone from the resolver and its harness cases, and `truck_events.tax_rate_bps` is retired (commented, never read or written).
- **Brief:** nothing arrived garbled. The one contradiction (3 decimals vs basis points) was asked and answered before building. Smaller choices are in §9.

---

## 1. SQL — run now

`supabase/migrations/20261010_18_tax_rate_milli.sql`. Run it **after 20261010_17** and before this code is tested or deployed. It only adds things, and it is safe to run twice. The full file is in the chat reply.

| Change | Detail |
|---|---|
| `trucks.tax_rate_milli`, `orders.tax_rate_milli`, `order_drafts.tax_rate_milli` | nullable integer, CHECK 0–20000 (0 % to 20 %). 8.875 % = 8875, 8.25 % = 8250 |
| the four `tax_rate_bps` columns (trucks, orders, order_drafts, truck_events) | kept, commented "RETIRED … nothing reads or writes it". The `truck_events` comment also records that there is no per-event rate any more. Nothing is dropped |
| `place_order_atomic_v2` | replaced in place (same name and signature): writes `tax_rate_milli` instead of `tax_rate_bps`. Still service-role only. **`place_order_atomic` is untouched** |
| Verify | four read-only queries at the foot of the file (also in chat) |

## 2. The engine, in thousandths

- **`lib/order-charges.ts`:**
  - Rules carry `taxRateMilli`.
  - Tax is `applyMilli(base, milli)` = base × milli ÷ 100000, rounded **once**, half away from zero, in integer arithmetic.
  - Tips and fees stay in basis points.
  - The snapshot column is `tax_rate_milli`.
- **Rate checks:**
  - $24.00 at 8.25 % → $1.98.
  - **$24.00 at 8.875 % → $2.13**, end to end through the real submit route; the rate is stored as 8875.
- **`lib/order-charge-rules.ts`:**
  - `resolveChargeRules(country, truck)`: two arguments, so there is **no event argument**.
  - `loadChargeRules(truck)`: no event read.
  - A truck carrying only the retired `tax_rate_bps` has no rate.
- **Paths updated:** drafts, promotion, the edit and the pay-at-the-truck switch all use `tax_rate_milli`. `scripts/order-charges.cjs` passes 260/260.

## 3. What each screen now shows

**One list of lines everywhere:** `lib/order-charge-lines.ts`.
- **Customer words:** "Subtotal", "Sales tax 8.25%" (the rate small and grey on screen), "Online service fee", "Tip 15%".
- **Kitchen words** (ticket, dashboard, KDS): "Service fee" and "Tip".
- **Each line appears only when non-zero**, and "Subtotal" only when another line does.
- **A UK order gives an empty list,** so every surface draws nothing new.

### Customer order page (390 first)

| Brief | Built |
|---|---|
| Tax notice | Under the "2 items" basket heading: *"Menu prices don't include sales tax. It's added below."* Uses the country's label in lower case, and only where tax is added at checkout |
| Payment choice | The existing card and pay-at-the-truck options and their text, unchanged. Under "Pay at the truck" a third line: *"No service fee. Tip the truck in person if you like."*, either half or both, as applies |
| Tip block | Card orders only, when tipping is on: heading "Add a tip for the truck?"; equal buttons "No tip", "10% $2.40", "15% $3.60", "20% $4.80", "Other"; selected = 2px slate-900 border on blue-50; 52px tall (≥ 44). "Other" opens a box with the currency symbol; above 100 % of the food it shows *"Tips can be up to $24.00."* Under the row: *"100% of your tip goes to the truck. Worked out on the food, before tax."* Defaults to "No tip" |
| Totals box | Subtotal, Sales tax 8.25%, Online service fee, Tip 15%, then **Total** bold above a top border; non-zero lines only |
| Grand totals | The footer peek, both collapsed summaries, the expanded breakdown, the payment sheet header and the Pay button all show the grand total. The card amount comes from the server's own total |
| Engine and authority | The browser runs the pure engine for display. The server re-prices on submit. The browser sends **only** `tip`, on a card order with tipping on. A changed tip counts as a changed basket, so it is never paid against the old authorisation |
| `/api/menu` | ONE new key, `truck.checkout`, sent only when tax is added at checkout, tips are on, or a card order carries a service fee. Holds: tax rule, label, rate, fees-taxed, the card-order service fee, tipping presets. Leaves out the surcharge, card-fee payer and platform fee. **A GB menu response is byte-identical** |

**Layout:** for a truck with checkout rules, the sheet runs: payment choice → tip → totals → Place order. A UK truck keeps today's order (Place order, then the choice), byte for byte (§9).

### Confirmation, status page and emails

- **In-page confirmation**, both by URL and in memory, and the **status page** `/order/[id]/manage`: the lines sit above Total.
  - The status API returns a `charges` key, and the submit response does the same, only when there is a line, so **a UK response is unchanged**.
  - The status API selects the snapshot columns by name, which needs 17 and 18.
- **Confirmation email** (HTML and text; received, confirmed, ready, edited and time-changed all use it): the rows sit where the discount row was. Text: `Sales tax 8.25%: $1.98`.
- **New-order email to the truck:** the rows in HTML; in text, `… Sales tax 8.25%: $1.98. … Total $30.60.`
- **Every send site passes the order's snapshot:** submit ×2, promotion ×2, dashboard ×6. The time-change read gained the snapshot columns.
- **Edit email subject:** it already compares the old and new **grand** totals, so no change was needed.
- **Refund and cancellation emails:** they state ledger amounts (money actually moved), which include tax, tip and fee because `total_minor` is the grand total. Verified; no change needed.

### Ticket, dashboard, KDS

- **Ticket (one renderer for Bluetooth and wired):**
  - `TicketOrder.adjustments`, optional, prints between the divider and TOTAL: "Subtotal", "Sales tax 8.25%", "Service fee", "Tip".
  - At 58 and 80 mm every price is right-aligned at the column edge.
  - With none (every UK order) the bytes are identical; this is checked directly.
- **Dashboard order card and KDS:** the same rows after the items, inside `!hideAmounts`, so cook mode hides them like every other amount.
- **Edit preview:**
  - An order with tax, a tip or a fee (and a truck that sent `charge_rules`) works out its new food, then calls `chargesForEdit`, the function the server's edit runs.
  - It equals the server for food 36.00 / 20.00 / 24.00 / 0.
  - Every other order (all UK orders) keeps the old sum, unchanged.
- **Offline walk-up (foundations gap 1, closed):**
  - `/api/dashboard` sends `truck.charge_rules` only when a rule applies; it rides in the native offline snapshot.
  - The Add Order panel's offline order uses `computeOrderCharges(…, 'walk_up')`: tax, no fee, no tip ($25.98).
  - A UK truck gets no key, and its optimistic order is unchanged.

### Reports

- **`get_report`** returns `report.charges` (`foodMinor`, `discount`, `taxMinor`, `tipsMinor`, `serviceFeesMinor`, `cardSurchargesMinor`, `taxAtCheckout`, `taxLabel`) only when the truck's country adds tax at checkout or the range has a tip or fee. Otherwise the snapshot columns are stripped from the rows, and **a UK response is byte-identical** (the snapshot-column read needs 17 and 18).
- **Reports tab:**
  - The main figure is **food sales**: each order's `food_minor`, or its total where it has none, which for those orders is the same thing.
  - Tax, tips, service fees and card fees show as their own lines, only when non-zero, and are never folded into "Other".
  - With them, the breakdown line reads "Food sales"; without them, "Total", as before.
- **Orders CSV:** columns *Subtotal, {tax label}, Tip, Service fee* (before Total) only under the same condition as `charges`. A UK truck's file is byte-identical.

## 4. Manage › Payments (1440 and iPad 820; one layout)

**Order on the tab:** Online payments → **Tax, tips and fees** → **Taking payment** → Walk-up payments.

**"Tax, tips and fees"** (`components/manage/ChargesCard.tsx`):
- Shown only where the truck's country adds tax at checkout. A UK truck never sees it.
- Rows: label and grey hint on the left, control on the right.

| Row | Built |
|---|---|
| Sales tax rate | hint as approved; number box + "%". Saves on leaving the box. 0–20 with up to 3 decimals, stored in thousandths. More decimals: *"Use up to 3 decimal places, like 8.875."* Above 20 or not a number: *"Use a rate from 0 to 20%."* (wording mine; the brief named only the decimals message) |
| Tips | hint as approved; switch (the truck's setting, else the country default); "Choices customers see:" with the country's presets as chips plus "Other amount". Not editable |
| Online service fee, truck keeps it | hint as approved; switch; "{%} % + ${fixed}" boxes (a part with no country maximum is hidden); "Most you can charge: 4% + 50¢"; *"Customers see it before they pay, as one line: "Online service fee $1.02"."*, worked out on $24.00 |
| Online service fee, HatchGrab keeps it | no controls; *"HatchGrab adds a 3% + 30¢ service fee to your customers' online orders. You don't pay it and can't change it."* |

**Saves:**
- They go through the existing authenticated Manage route, as a new action `update_charges`.
- Every value is checked by `lib/charge-settings.ts`, the same function the card runs before sending:
  - rate range;
  - truck fee parts within the country maximum;
  - **nothing saved** where the country has no service fee, where HatchGrab keeps it, or for a rate where tax is included.
- **Owner only** (and admins), like the Payments tab. Staff and managers get 403, and nothing is written.

**"Taking payment" — named difference 1:**
- It moved from Settings › Order settings to `components/manage/TakingPaymentPanel.tsx`, placed by Payments.
- **Unchanged:** its words, its three controls (`show_paid_step`, `completion_presses`, `takes_cash`), the same `update_truck` save, the same `get_vans` check for the cash row, and the same derivation.
- **Changed:** only its outer `pt-3 border-t` separator wrapper, which belonged to its old place under the Settings row above it. In Payments it sits in its own card.
- **Proven:**
  - the block is in the new file byte for byte;
  - SettingsTab is **identical to HEAD** apart from the removed block, a one-comment tombstone and the moved derivation;
  - the three saves are the same calls.
- **Links and help text:** no link, anchor or help text pointed at its location; the only setup-review anchor nearby is auto-accept's, which stays in Settings. So nothing else needed updating.

## 5. Admin › Countries — the fee rows

| Brief | Built |
|---|---|
| After "Our fee above that": "Take our fee" | switch (`platform_fee_enabled`); hint *"Off: the rate is shown on plans but never charged"*; "Needs a rate first" when the rate is empty (and the form refuses switching on without one); grey note *"Not charged yet — switching on has no effect until fee charging is built."* |
| Group "Online service fee" | hint *"Online orders only — never pay at the truck or walk-up"* |
| …"Allowed in this country" | the existing row, moved here. When off where prices include tax: amber *"If switched on, UK law needs it inside the prices customers first see"* (the country's short name) |
| …"Who keeps it" | select "The truck" / "HatchGrab" |
| …"HatchGrab's fee" | hint as approved; % + fixed boxes, greyed with *"Only when "HatchGrab" is chosen"* otherwise |
| …"Most a truck can charge" | hint as approved; % + fixed boxes |
| …rows after "Allowed" | "—" when the fee isn't allowed |
| Group "Tax on fees" | "Service fee and card fee are taxed", hint *"Only matters where tax is added at checkout"*; switch, or *"— (UK prices include VAT)"* where prices include tax |
| Stale card-fee hint | now *"Card fees on the bill aren't built yet"* |

The fixed parts are typed in the currency's smallest unit ("50 ¢"), like the card-fee boxes on the same page.

## 6. Screenshots, compared item by item

`docs/screenshots/`, made by `scripts/phase3-screens-shots.cjs` (the real components, US fixtures, the app's built CSS, Chromium):
- **Order page:**
  - `phase3-order-390-tip.png`, `-1440-tip.png`
  - `phase3-order-390-no-tip.png`, `-1440-no-tip.png`
  - `phase3-order-390-pay-at-truck.png`
- **Payments:**
  - `phase3-payments-1440-truck.png`, `-820-truck.png`
  - `phase3-payments-1440-hatchgrab.png`, `-820-hatchgrab.png`
- **Countries:** `phase3-countries-1440-fee-rows.png`

For the order shots the sheet's 90vh scroll cap is lifted by an injected rule, **for the shot only**, so the whole sheet is one image.

| Item | Seen |
|---|---|
| Tax notice under the basket heading | ✓ "Menu prices don't include sales tax. It's added below." under "2 ITEMS · $30.60" |
| Card / pay-at-the-truck choice and its text | ✓ both kept; the new line under "Pay at the truck" |
| Tip block heading, buttons, amounts, "Other" | ✓ No tip · 10% $2.40 · 15% $3.60 · 20% $4.80 · Other; equal width; 52px tall (measured) |
| Selected button | ✓ 2px border = slate-900, fill = blue-50 (measured against the same classes) |
| Line under the row | ✓ |
| Totals box order and rate styling | ✓ Subtotal $24.00 · Sales tax 8.25% $1.98 · Online service fee $1.02 · Tip 15% $3.60 · Total $30.60 (rate small, grey) |
| Grand totals before payment | ✓ "2 ITEMS $30.60"; Place order sits under the totals box |
| No tip (default) | ✓ Total $27.00, no tip line |
| Pay at the truck | ✓ no tip block; Subtotal · Sales tax · Total $25.98 |
| 390 | ✓ no sideways overflow (measured) |
| Payments order | ✓ Online payments → Tax, tips and fees → Taking payment → Walk-up payments |
| Payments rows | ✓ 8.25 %; Tips switch, chips 10% 15% 20% Other amount; fee switch, 3 % + $0.30, "Most you can charge: 4% + 50¢", the $1.02 sentence |
| HatchGrab variant | ✓ the one line, no controls |
| 820 (iPad) | ✓ the same layout, no overflow |
| Countries | ✓ every row above, in place; GB amber note; "— (UK prices include VAT)"; fixed hint |

## 7. Proof

### UK (GB fixtures): byte-identical to BEFORE

| Surface | How | Result |
|---|---|---|
| Order page, confirmation, status page, every email (HTML and text), tickets 58/80, dashboard card, KDS, Add Order panel, reports, both CSVs | `scripts/money-sweep-parity.cjs`, which renders them all from GB fixtures against its committed BEFORE | ✅ **all 3,057 strings and byte streams identical** |
| Menu response; status API (a pre-Phase-3 order and one with the snapshot); `get_report` (both) | `scripts/phase3-screens.cjs` §1, against `scripts/fixtures/phase3-screens-before.json`, captured on this tree before the first edit | ✅ all byte-identical |
| Every order path's writes, responses and emails | `scripts/order-charges.cjs` §1 (the foundations BEFORE) | ✅ (its named difference now names `tax_rate_milli`) |
| Named difference 1 | `scripts/phase3-screens.cjs` §9 | ✅ the same block, the same saves, SettingsTab otherwise identical to HEAD |

**About the `get_report` BEFORE:** the harness's fake database now honours a select's column list, because the real one does. BEFORE was captured with the original `get_report` code restored, and its menu and status parts match the very first capture exactly.

### US (fixtures; the US stays off)

`scripts/phase3-screens.cjs` §2–§10, and `scripts/phase3-screens-shots.cjs`.

| Check | Result |
|---|---|
| $24.00 at 8.25 %, 15 % tip, fee 3 % + 30¢ on every surface: order page, totals box, confirmation (URL and in memory), status page, both emails (HTML and text), ticket 58/80, dashboard card, KDS | ✅ Subtotal $24.00 · Sales tax 8.25% $1.98 · Online service fee $1.02 · Tip 15% $3.60 · Total $30.60 |
| The card is authorised for **3060** | ✅ through the real submit route (`order-charges` §4) |
| Pay at the truck | ✅ no fee or tip lines; $25.98 |
| Walk-up and offline walk-up | ✅ tax, no fee, no tip; $25.98 |
| Edit preview = server | ✅ four food amounts; same function, same rules |
| 8.875 % | ✅ $2.13, stored as 8875, shown as "8.875%" |
| HatchGrab-keeps variant | ✅ the right Manage line |
| Tip "Other" above 100 % | ✅ shows "Tips can be up to $24.00." and the server caps it (authorised 2400 + 198 + 2400) |
| `update_charges` | ✅ 8.875 saves 8875 and nothing else; 4 decimals refused with the sentence; fee over max refused; GB rate refused; staff and manager refused, nothing written |
| Countries rows, form round-trip, "Take our fee" without a rate | ✅ |

### The rest

| Check | Result |
|---|---|
| New harnesses | ✅ `phase3-screens.cjs` (**86 checks**, registered); helper `_phase3-screens-us.cjs` (shared module); `phase3-screens-shots.cjs` (**26 checks**, listed with the other browser harnesses) |
| `tsc --noEmit` | ✅ clean |
| eslint, every touched file, per rule vs HEAD | ✅ no rule grew, with one deliberate pair. The moved Taking payment block carries its own 6 `no-explicit-any` and 4 `no-unescaped-entities` into `TakingPaymentPanel.tsx`, and `page.tsx` drops by exactly 6 and 4: the counts moved and the total is unchanged. The block is byte-identical by design |
| `next build` | ✅ exit 0 |
| Client bundles | ✅ no `country_settings`, resolver (`loadChargeRules`, `resolveChargeRules`, `countrySettingsForTruck`), new setting column names, `place_order_atomic`, service-role key or Stripe secret. The pure engine and the tip block are in the page, as intended |
| Harness sweep (109 files) | ✅ **109 / 109 passed** (`node scripts/run-harnesses.cjs`). The first run was 108 / 109: `event-types` pins every line that leaves the dashboard page, and the edit preview's `return Math.max(…)` had become `const linear = Math.max(…)`. That line is now an accounted edit, and its replacement is asserted. The sweep was re-run clean |

**Existing harnesses that pinned something this phase changes on purpose.** Each now names the change and still checks everything else:
- **`order-charges` / `_order-charges-us`:**
  - thousandths of a percent;
  - the per-event cases replaced by "an event's rate is ignored" and "the resolver takes two arguments";
  - "the browser sends no tip" re-aimed to "only on a card order with tipping on";
  - v2 read from migration 18;
  - 18's columns, CHECKs and comments asserted.
- **`event-types`:** the edit preview's old `return` line is named as an accounted edit (the same expression now sits one line up as `linear`).
- **`schedule-graphics-places`:**
  - its "no Settings wording changed" and "no page line lost" guards now accept the Taking payment block **only because it is present in `TakingPaymentPanel.tsx`**, the same rule as earlier moves;
  - six deliberate one-line edits are named, each with its new form re-checked (the Payments mount, the dropped wrapper, four Reports lines). 269/269.

## 8. Gaps and things left as found

1. **The Payments card shows only where tax is added at checkout,** as briefed. A tax-inclusive country that allows a truck service fee has nowhere to set it yet.
2. **Card surcharge:** the engine and the lines support it ("Card fee"), but it is still always 0. The resolver keeps it off.
3. **Platform fee:** "Take our fee" stores the switch, and nothing charges it (as the note says).
4. **`get_report`'s `totalRevenue` and `avgOrder`** are still grand-total figures. Nothing on screen reads them; the Reports tab computes food itself.
5. **The Items CSV** is unchanged. The brief named the Orders CSV only.
6. **Opening Manage › Payments now makes one extra `get_vans` call,** for the moved cash row. That is the same request Settings makes.

## 9. Smaller choices made (UK identical, design singular)

| Choice | Taken | Why |
|---|---|---|
| Where "under the basket heading" is | under the "N items · total" heading in both the footer peek and the sheet, always visible | the basket's heading in both places |
| Sheet order where checkout rules apply | payment choice → tip → totals → Place order | the button's last word is the amount it charges; the tip depends on the choice. UK keeps today's order exactly |
| "Subtotal" | food after any code | what the lines below are added to |
| Kitchen vs customer words | "Service fee"/"Tip" vs "Online service fee"/"Tip 15%" | the brief names both sets |
| Every new API key | present only when it carries something | UK responses byte-identical |
| Payments rate box | saves on leaving the box; toggles save at once | the page's existing pattern |
| Rate above 20 | *"Use a rate from 0 to 20%."* | the brief named only the decimals sentence |
| `update_charges` | owner (and admins) only | the Payments tab is owner-only |
| "50¢" / "30p" phrasing | coin form below one unit for USD/GBP/EUR/CAD/AUD/NZD; money format otherwise | the mockup's "4% + 50¢" |
| Countries fixed boxes | smallest unit ("50 ¢") | like the card-fee boxes beside them |
| "UK law" | the country's short name | "use the country's name, e.g. UK law" |
| Taking payment as its own file | yes | Payments and the harness can render it; a Next page can't export it |
| Screenshot technique | the real components rendered from fixtures, as money-sweep does; the 90vh cap lifted for the shot only | the order page fetches five endpoints, and a fixture render is deterministic |

## 10. Rules kept

| Rule | |
|---|---|
| Cursor never runs SQL; all SQL inline, marked | ✓ one file, **run now** |
| Pizzeria Gusto untouched; Pizza Kitchen fixtures only; US fixtures only | ✓ |
| Never deploy, push or commit; no process killed | ✓ |
| No `outreach_templates`; no email sent | ✓ emails rendered in memory |
| Never drop a table or column; never delete an image | ✓ |
| No `.env*` opened | ✓ |
| No visible UK change except named difference 1 | ✓ proven above |
