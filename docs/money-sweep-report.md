# Phase 2A — the money sweep

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed · no SQL run · no truck, order or `country_settings` row changed · no email sent**

Every amount a customer, an operator, a kitchen or a printer sees now comes from one formatter, `lib/money-format.ts`, in the **order's** currency (`orders.currency`, with the locale of that order's country) or, before there is an order, the **truck's**. Nothing in the app types a £ any more. **UK output is byte-identical.** Before the first edit, a snapshot of every surface was taken on the unchanged code: 3,057 rendered strings and printer byte streams. After the sweep, all 3,057 match. On top of that, 1.73 million values match the `toFixed` code they replaced. The same fixtures rendered as a US truck show `$` everywhere, with no £ and no "?" in any amount. The one intended change is the `/compare` gate: on "Yes, with another system", nothing is shown until a rate is typed, and in its place the page says "Enter what you pay now to see your saving."

Nothing in the brief arrived garbled, and no instruction contradicted another. **No STOP was needed. No UK string changed.** At two places the formatter needed an option to keep the UK string identical, and §3 lists both.

---

## 1. The proof

| Check | Result |
|---|---|
| **GB byte-identical** — `node scripts/money-sweep-parity.cjs` against `scripts/fixtures/money-sweep-before.json` (captured on the unchanged code, before the first edit) | ✅ **3,057 / 3,057 identical.** That covers every email (HTML, text and the three senders' bodies), ticket bytes at 58 mm and 80 mm, the KDS board, dashboard cards and modals, the order page (basket, sheet, payment, item options, both confirmations), the receipt page, Reports, **both CSV files**, event pricing, Menu & Stock prices, the menu editor and its import review, deals, Extras, Event types, the dev ticket preview, and the two AI prompts as sent |
| The formatter against the code it replaced, value by value | ✅ **1,728,586 values identical**: every penny from −£500 to £5,000 (major and minor), a million sums and multiples of prices, the trimmed event-pricing form to £1,000, and the values where `toFixed` and `Intl` round differently (1.005, 1.115, 2.675 …) |
| **USD** — `node scripts/money-sweep-parity.cjs --usd` (same fixtures, a US truck's orders) | ✅ No £ in any of the 3,057 strings. **2,407 `$` amounts: 2,385 with two decimals.** The other 22 are whole-unit forms the UK screen also shows whole ("nearest $1", "for $12", "$0 — on us"). Every surface equals the UK one with `$` read as `£`. The 20 tickets carry `$` (0x24), never the £ byte 0xA3, and no amount holds a "?" |
| A currency the printer cannot encode | ✅ A euro ticket prints `EUR 43.90`, `TO PAY EUR 23.90`, `+EUR 1.25`. No "?" anywhere |
| **The `/compare` gate** — `scripts/compare-no-system.cjs` | ✅ 54/54, including four new checks. Yes with nothing typed: the sentence, and no result. A percentage typed: the result. Only the per-order fee typed: the result. The No path: never the sentence. `scripts/country-settings-parity.cjs`: ✅ all sections identical apart from Part B/C's three allowed changes; `/compare`'s typed results are unchanged |
| No £ / `toFixed(2)` left in money-display code | ✅ A comment-stripping scan of `app/`, `components/` and `lib/` finds 17 sites. None is a displayed amount: the formatter itself, the printer's 0xA3 encoder (kept, as asked), the admin outreach entity map, and non-money or comparison arithmetic (§5) |
| Client bundles | ✅ After `next build`, the 128 files in `.next/static` hold none of: `country_settings`, `card_fee_online_pct`, `starter_monthly_minor`, `getCountrySettings`, `countrySettingsForTruck`, `clearCountrySettingsCache`, `moneyFormatForOrder` / `ForTruck`, `truckMoneyWithOrders`, the loader's or the server helper's refusal sentences, `serviceCountryStore`, `valuesToColumns`. They do hold the client-safe formatter (`localeByCountry` is the payload field it reads, and the "no currency for this amount" warning is its own) |
| `tsc --noEmit` | ✅ clean |
| eslint: the 41 touched files against HEAD | ✅ **no rule count grew in any file.** Errors 545 → 545, warnings 161 → 160. One `no-explicit-any` I introduced in Reports was typed, not waived. The three new files are clean |
| `next build` | ✅ exit 0 |
| Harness sweep (`scripts/run-harnesses.cjs`, 101 files) | ✅ **101 / 101 passed** (four guards pinned to the old £ code were re-aimed, not waived — §8) |

---

## 2. The currency rule, as built

**An existing order is shown in `orders.currency`**, laid out in the locale of `orders.country`'s settings row. **Anything not yet an order is shown in the truck's currency and locale**: the menu, the basket, the Add Order panel, a WhatsApp reply quoting prices, the Menu & Stock column, Event types.

| Where | How it gets `{ currency, locale }` |
|---|---|
| Server: emails, the refund refusal, the edit subject line | `lib/money-server.ts` (server-only): `moneyFormatForOrder(order)` and `moneyFormatForTruck(truck)`. **A missing currency or country throws**, with "Refusing to guess a currency". Every email function now takes a **required** `money` parameter, so the compiler named every call site: 13 in the app and 4 in an old verify script (§4) |
| `/api/dashboard` (dashboard, KDS, printing, offline) | `truck.money = { currency, locale, localeByCountry }`. `localeByCountry` holds the locale of every country the board's orders came from. 🔴 **This route feeds the kitchen, so it does not fail on money**: a lookup that throws is logged loudly and `money` goes out `null`. The native app keeps the whole truck object in its offline snapshot, so `money` travels offline with it |
| `/api/menu/[truckId]` (customer order page) | `truck.money`, the truck's format. Throws loudly if the truck has none (both columns are NOT NULL) |
| `/api/orders/[id]` (receipt page, the `?confirm=` screen) | `money`, the order's own (`currency, country` added to the select) |
| Manage page (Reports, menu, deals, schedule, Extras, Event types) | Part B's `CountrySettingsProvider` → `moneyFormatOf(useCountrySettings())`. Reports formats each order row in that order's currency and totals in the truck's |
| Client leaves (`OrderLineItem`, `DealsModal`, `PaymentActionsModal`, the price editor) | `components/MoneyContext.tsx`. Each page provides it from the payload above. **An order card wraps itself in its own order's format**, as do the completed-row refund modal and the edit modal's deal picker |
| Printed tickets | `mapOrderToTicket` sets `ticket.money = orderMoney(order, truck.money)` |

**Only `{ currency, locale }` reaches a browser**, never the settings row, and no browser reads `country_settings`.

**Never a guessed £.** On the client (the KDS, the printer, the dashboard and the offline paths, and the customer pages too, which must not crash), a missing format prints the figure with **no symbol** (`43.90`) and logs one console warning per place. It never throws in front of a cook.

**Optimistic offline orders** (Add Order with no signal) now carry the truck's `currency` and `country`, exactly what the 20261010 trigger stamps on the real row. The card and any ticket printed before the round trip therefore show the currency the server will.

**Orders created in the same request** (walk-up, pay-at-hatch submit) use the truck's format, because the trigger copied it onto the row at insert. Promoted card orders use the draft's currency and the truck's country, exactly what the insert writes.

---

## 3. The formatter (`lib/money-format.ts`)

New: `formatMajor`, `formatMinor`, `formatMajorNumber`, `orderMoney`, `formatMajorOrBare`, `formatMinorOrBare`, `currencySymbolOrBare`, `editableAmount`, `editableMinor`, and the `TruckMoney` type.

How the UK output stays byte-identical:

- **The currency's own decimals, always shown** ("£12.00"), and **no thousands separator** by default. Orders, tickets and emails have printed "£1234.56" since launch, and a ticket's columns are counted in characters. A US screen likewise prints "$1234.56".
- **`toFixed` decides the digits and Intl only lays them out.** The two round differently: `toFixed` rounds the double's exact binary value (1.005 → "1.00"), while Intl rounds its shortest decimal form (→ "1.01"). Rounding first is what makes the 1.73 million values match.
- −0, and anything that rounds to zero, prints unsigned.

**Options added because a UK string needed them (the brief allows exactly this):**

1. **A negative keeps its minus directly before the digits: "£-20.00".** That is what `` `£${n.toFixed(2)}` `` printed. The held-short email sentence prints one for an impossible fixture, a hold larger than the balance. Intl would have printed "-£20.00", so this is the default for order amounts.
2. **`/compare`: grouping, whole-unit headline figures and the sign before the symbol** (`{ grouping: true, decimals, minusBeforeSymbol: true }`). The page's own helper always printed "£1,234" and "-£5".

Two formats that already existed are kept: **`trimWhole`** ("£1" / "£1.50") for the event-pricing rule labels, and `smallFeeLabel` for `/compare`'s under-£1 figures ("80p").

**The one value that prints differently:** a tiny negative that rounds to zero (−0.001) now prints "£0.00", where `toFixed` printed "£-0.00". Nothing renders one.

---

## 4. Every surface (audit appendix 7.1, file by file)

| File (audit £ count) | What changed |
|---|---|
| `app/manage/[token]/page.tsx` (42) | `fmtGBP` is gone; `fmtMoney`/`orderFormat` replace it. Reports: summary, revenue breakdown, items, deals, modifiers, the orders table with expanded rows, the items table, and **both CSVs**. The CSVs keep the symbol and two decimals ("£43.90"), each row in its order's currency. Menu tab: price, required-choice surcharges, item-editor option pills, the import review's banner ("go live at £0"), its price-box prefix and the grouping page. Deals: prices and the empty-state example. Schedule: the per-event deal list |
| `lib/event-pricing/price.ts` (36) | `describeRule(setup, fmt)`, `summarisePricing(…, fmt)`, and `roundingPhrase(rounding, fmt)` replacing `ROUNDING_PHRASE` ("nearest £1" → "nearest $1" for a US truck). The rest are comments. **None of these three has a caller in the app today**; they are proved by the harness |
| `app/compare/CostComparison.tsx` (30) | `gbp`/`money` go through the formatter in the marketing country's format, plus **the gate** |
| `app/trucks/[slug]/order/page.tsx` (27) | Every price, the deals list, item options, both sheets, the payment stage ("Pay £41.40"), the item modal button, and `OrderConfirmation`. Provides the format to its leaves |
| `components/dashboard/AddOrderPanel.tsx` (25) | Every price and pay button, the "Save at £X?" confirm. Provides the format to its leaves. The optimistic order gets currency and country |
| `app/dashboard/[token]/page.tsx` (24) | Refund messages (the order's currency), the completed row's chip and total, cancel / reject / edit modals, the edit item sheet, Menu & Stock prices, and the event-price note (no longer hard-codes `locale: 'en'`) |
| `components/dashboard/OrderCard.tsx` (20) | The order's own format throughout, and it provides that format to its modal. The inline price editor reads the panel's |
| `lib/email.ts` (19) | All four private `money` closures are gone. `paymentNote`, `renderOrderLinesHtml`, `formatConfirmationEmail`, `formatNewOrderEmail`, `cancellationPaymentSentence`, `sendRefundEmail` and `sendCancellationEmail` take the order's format (required). `rejectionPaymentSentence` and `sendEventCancellationEmail` print no amount and are unchanged |
| `lib/printing/ticket.ts` (13) | Every amount, plus the ISO-code fallback. **0xA3 kept for £; `$` is ASCII** |
| `app/api/dashboard/action/route.ts` (11) | 8 email calls get the order's format. The edit subject "now £X (was £Y)" too |
| `lib/copy/serviceSettings.ts` (10) | `eventPriceOwnNote(…, money)`. The mode and rounding labels already took the truck's symbol (Part B) |
| `components/shared/PriceControls.tsx` (10) | `PriceCell` takes `money`: price, box prefix, the (+£1.50) difference, and the editable figure |
| `app/api/event-types/route.ts` (10), `lib/plan-features.ts` (8), `lib/features.ts` (7), `lib/payments/ledger.ts` (7), `app/landing/page.tsx` (5), `lib/plans-pdf.ts` (2), `lib/event-pricing/read.ts` (2) | **No live £**: every remaining one is in a comment (plan and allowance figures moved to the formatter in Part B) |
| `components/dashboard/DealsModal.tsx` (8), `OrderLineItem.tsx` (4), `PaymentActionsModal.tsx` (2) | Read `MoneyContext`. The refund box's prefix, max and placeholder too |
| `lib/whatsapp-classifier.ts` (6) | `money` required. "Pizzas from £9.50", the menu payload's prices, and the price check, which now looks for **the truck's symbol** |
| `lib/menu-extract.ts` (6) | `truck.money` required. The prompt's worked examples interpolate the symbol. The GB prompt text is byte-identical |
| `components/manage/ExtrasEditor.tsx` (5), `components/manage/EventTypes.tsx` (4) | The truck's format from the manage provider: option prices, the two worked examples, "Price adjustment (£)", the Item prices column, `PriceCell` |
| `app/dashboard/[token]/kds/page.tsx` (4) | The Done strip's "£X due" (cards are `OrderCard`) |
| `app/api/orders/submit/route.ts` (3) | Both emails. The **unused** `formatWhatsAppOrder` takes a required `money` too |
| `lib/order-calculations.ts` (2) | `formatModifiers(mods, fmt)` |
| `app/order/[id]/manage/page.tsx` (2) | Line prices and total, in the order's own currency |
| `app/dev/ticket-preview/page.tsx` (2) | The sample is a UK truck through the real mapper. The scenario label is formatted |
| `lib/payments/refund.ts` (1) | "Only £X is left to refund". A display-only read of the order's currency **after every decision is made**; if it fails, the sentence carries the bare figure |
| The other 1-count files (`ttf-metrics`, `seed-demo-orders`, `stranded-authorisations`, `held-authorisation`, `order-completion-label`, `event-types/resolve`, `event-pricing/lock-in`, `TicketPreview`, `PricingPolicy`, `landing/layout`, `features/page`, `compare/page`, `api/menu/[truckId]` (now sends `money`), `admin/page`) | Comment-only £. `TicketPreview` renders `ticket.ts`'s lines, so it follows the ticket |
| `lib/outreach-mail-poll-rules.ts` (1) | **Admin outreach, kept as allowed**: the HTML-entity map's `pound: '£'` |

**Also wired:** the AI prompt callers (`process-menu`, the WhatsApp preview, both WhatsApp webhooks, and `provision-demo`) select `currency, country` and pass the truck's format.

---

## 5. What still says £ or `toFixed(2)` in code, and why it may

| Site | Why it is not a displayed amount |
|---|---|
| `lib/money-format.ts` | the formatter |
| `lib/printing/ticket.ts` `printableText`/`strBytes` | the £ → 0xA3 encoder, kept as asked |
| `lib/outreach-mail-poll-rules.ts:321` | admin outreach entity map (allowed exception) |
| `app/manage/[token]/page.tsx` 3160–3397 (5) | `Number(x.toFixed(2))` rounds **imported menu price data** before it is saved. It is data, not display |
| `lib/whatsapp-classifier.ts` 327, 331 | comparison keys for the price check (12, 12.5 and 12.50 are all "12.50") |
| `app/compare/CostComparison.tsx:1310` | a **percentage** ("their own fee (2.5%)") |
| `lib/plans-pdf.ts:83`, `lib/weekly-post/draw.ts` (3) | pixel and layout sizes |

The remaining `×100 / ÷100` in the touched files are **payment and pricing arithmetic** (server totals, the refund amount parse, the payment-intent pence, the event-pricing engine) or percentages. The brief keeps those untouched ("display only"). The two display-side divisions I found moved into the formatter.

---

## 6. The `/compare` gate

On **"Yes, with another system"**, until either fee box (the % or the per-order fee) has something typed, the result block is replaced by one card: **"Enter what you pay now to see your saving."** Before this, an empty rate read as 0% + 0p, so the page computed a "saving" against a provider that charges nothing. The "See your saving ↓" link still scrolls to the card. The "No, not yet" path is unchanged.

---

## 7. Things worth knowing (not changed — say if you want them)

1. **`/compare` still writes "p" for card pence** ("1.5% + 20p", "{x}p"). That is UK wording but not a £, and the page is the marketing country's (GB) by Part B's decision. `smallFeeLabel` already prints "30¢" for USD. I left these alone because switching `{n}p` to it would print "£1.20" where the page prints "120p" today, which is a UK change.
2. **The menu-extract prompt says "The 14 UK statutory allergens".** That is not money; it belongs to an allergens phase.
3. **The event-pricing engine works in two-decimal minor units** (`toPence`). That is right for GBP, USD and EUR. A zero-decimal currency (JPY) would need the engine changed, which is payment logic and out of scope. The formatter itself already handles JPY.
4. **A dish name with a non-ASCII letter prints "?" on a ticket** ("Jalape?os"), as it always has (the encoder's rule). Money never does: £ is 0xA3, $ is ASCII, anything else is its ISO code.
5. **`describeRule` / `summarisePricing` / `roundingPhrase` have no caller** in the app. They are converted and proved, but nothing renders them today.
6. **A new country's prompt or email** needs only its `country_settings` row (locale) and the truck's currency. Nothing else is country-specific.

---

## 8. Harnesses

**New:** `scripts/money-sweep-parity.cjs` (registered in `scripts/harnesses.json`). It renders real modules and components, bundled for node, with no database or network: the database library is replaced by a stand-in, and emails and prompts are captured from a stubbed fetch, so nothing is sent. Pages start from a fixture state through a `useState` wrapper, and every named state must be found or the run fails. **Pages get no harness money provider, so a page that forgot to provide its own format fails.** The clock is frozen at 9 Oct 2026 18:20 London. Three modes: GB check, `--usd`, and `--capture <file>`.

**Updated:**
- `scripts/compare-no-system.cjs`: one mutation re-anchored to the new helper, the zero-test source check updated, and four gate checks added.
- `scripts/country-settings-parity.cjs`: the PDF's "Generated 2026-10-09" stamp is now taken out on both sides. The old pattern looked for "9 October 2026", which the PDF never prints, so the harness only passed on the day its fixture was captured.
- `scripts/verify-email-lines.ts`: passes the UK format.
- `_country-settings-gb.cjs` (Part B's seed reader) is listed as a shared module, so the runner no longer reports it as unregistered.

**The first full sweep ran 101: 97 passed, 4 failed.** All four failures were guards pinned to the old £ code, not behaviour changes. Each was re-aimed so that it still guards, never waived:
- `event-pricing.cjs`: its "price.ts has no imports" rule now allows exactly one import, the money formatter, and asserts that the formatter itself imports nothing (the no-cycle guarantee the rule exists for). Its variant builds compile the formatter too. ✅ 132/132, 15/15 variants caught.
- `event-types.cjs`: the calculator byte-identity check takes `formatModifiers` (the one display function the sweep changed) out of both sides and asserts its new form. Two source checks were re-aimed at `truckAmount(shownPrice)` and `eventPriceOwnNote(…, truck?.money)`. The "every line that left the dashboard is enumerated" guard accounts for the hand-typed `£…toFixed(2)` lines, **with a companion check that no £ line remains on the page.** ✅ 187/187.
- `printing-escpos-identity.cjs`: its fixtures now carry the UK money format the mapper supplies, and its variant compiles the formatter. ✅ **Ticket bytes identical to HEAD on all 18 fixtures.**
- `schedule-graphics-places.cjs` ("no line of the manage page lost"): the sweep's £ / `fmtGBP` lines are accounted for, with a companion check that none survive. The three Reports lines that gained a format are claimed edits, and the guard checks that each replacement is present. ✅ 259/259.

**Final sweep:** ✅ **101 run · 101 passed · 0 failed**, the new money-sweep harness among them.

---

## 9. SQL

None. This phase changes display code only, and nothing needs a migration.
