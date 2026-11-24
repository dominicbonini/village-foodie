# france-readiness-1 — what HatchGrab has for France, and what's missing

*23 November 2026. Read-only diagnosis. Nothing was changed: no file other than this report, no git write, no build, no
harness, no migration. Database: read-only SELECTs only (§11), schema and aggregate counts, no per-truck query.*

**How I read the brief:** "two-line summary in chat" and "show any SQL inline in chat" don't conflict. The chat reply has
the two lines plus the SQL blocks. Nothing in the prompt was garbled.

**Sizes used below:** **S** = under a day of agent work · **M** = 1–3 days · **L** = 1–3 weeks, harnesses and re-pins included.

---

## 0 · Short list

| | Item | Size |
|---|---|---|
| ✅ Already there | One TVA rate per order, stored on the order (`tax_rate_milli`, `tax_inclusive`, `tax_label`, `food_minor`); France's default is 10 %, and the truck can set its own rate | — |
| ✅ | "Dont TVA 10 % : x,xx €" on the customer email and the printed ticket | — |
| ✅ | Accountant reports: gross, refunds, tax, net per period and per event, plus two CSVs (orders, events) | — |
| ✅ | Refunds kept as their own dated rows (`order_payments` kind `refund`) | — |
| ✅ | Orders are never deleted by retention. After 12 months only the customer details and notes are removed | — |
| ✅ | An append-only audit log for payment and collection actions (`action_audit_log`) | — |
| 🟡 Small change | **Daily totals per VAT rate, as a CSV**, built from the existing accountant rows: add the rate, group by day | **S** |
| 🟡 | Choose which date counts for that file (placed date, or refund date for refunds) instead of the event date | **S** |
| 🟡 | "Dont TVA" on the customer's status page (today only the email and the ticket show it) | **S** |
| 🟡 | Server-side refusal to edit or cancel an order once it is collected (today only the screen hides the button) | **S** |
| 🟡 | Write `edit`, `cancel`, `reject` and order placement to `action_audit_log` (the helper was built for this and never wired in) | **S–M** |
| 🟡 | Business fields on the truck: legal name, registered address, SIREN/SIRET, VAT number, VAT regime (columns, Manage › Settings, signup optional) | **M** |
| 🟡 | Show those fields on receipts (email, status page, ticket) | **S** once the fields exist |
| 🔴 Bigger build | **A VAT rate per dish and per order line**: menu, deals, extras, every order path, receipts, reports (§2) | **L** (~2–3 weeks) |
| 🔴 | A sequential receipt number per truck with no gaps, separate from the per-event display number | **M** |
| 🔴 | Records that can't be changed: keep each order's earlier versions instead of overwriting, a database guard against UPDATE/DELETE of completed orders, and retention that doesn't rewrite `items` | **M–L** |
| 🔴 | A daily close ("Z" total) frozen per truck per day, plus a tamper-evident log (hash chain or signature) | **L** |
| 🔴 | A customer receipt for counter orders when no email is taken (printed receipt, or QR to a receipt page) | **M** |
| 🔴 | Ticket printing of accents and € (today "é" prints as "e" and "€" as "EUR"; manual open item 10) | **M**, Dominic's printer decision first |

---

## 1 · Tax today

**What each order stores** (`public.orders`, columns observed live):

| Column | Meaning | Written by |
|---|---|---|
| `food_minor` | food after the discount, before tax, tip and fees | every order path since Phase 3 |
| `tax_minor` | tax **added on top**: 0 where prices include tax (GB, IE, FR) | the same |
| `tax_rate_milli` | the rate, in thousandths of a percent (10 % = 10000). In France it is stored even though nothing is added, so receipts can word "Dont TVA" | the same |
| `tax_inclusive` | the country's rule at the time | the same |
| `tax_label` | "VAT", "Sales tax", "TVA" | the same |
| `tax_rate_bps` | **retired** 13 Oct, never written (`supabase/migrations/20261010_18_tax_rate_milli.sql`, comments) | — |

- **The engine:** [lib/order-charges.ts:202-210](lib/order-charges.ts#L202-L210). Tax is computed once per order on `food_minor`. For France `taxInclusive` is true, so `taxMinor = 0` and the rate is only stored. The total is `food + tax + tip + service fee + surcharge` ([:212](lib/order-charges.ts#L212)).
- **Where the rate comes from:** [lib/order-charge-rules.ts:62-68](lib/order-charge-rules.ts#L62-L68). Country rule (`prices_include_tax`), then **the truck's one rate** (`trucks.tax_rate_milli`), else the address format's default. For France that default is `includedTax: { label: 'TVA', milli: 10000 }` ([lib/address-formats.ts:1424](lib/address-formats.ts#L1424)).
  - **No per-event rate:** `truck_events.tax_rate_bps` is retired ([lib/order-charge-rules.ts:13](lib/order-charge-rules.ts#L13)).
  - **Nothing holds a rate per dish, per category or per order line.** `menu_items_db`, `menu_categories`, deals and modifiers have no tax column. Order lines (`orders.items` jsonb) carry only `name`, `unit_price`, `quantity`, `cartKey`, `source`, `specialInstructions` and `modifiers` (observed over the last 60 days, §11). There is **no dish id** on a line either: Reports matches lines to dishes by name ([lib/accounts/ledger.ts:28](lib/accounts/ledger.ts#L28)).
- **The label:** the country's `tax_label` ("TVA" for FR), else the region's or the address format's ([lib/order-charge-rules.ts:89](lib/order-charge-rules.ts#L89)).
- **The rate box:** Manage › Payments, `components/manage/ChargesCard.tsx:122-129`. The server accepts 0–20 % ([lib/charge-settings.ts:42](lib/charge-settings.ts#L42)), and refuses a rate where prices include tax and the format carries no included tax ([:85](lib/charge-settings.ts#L85)).
  - **Fact (no position taken):** a French truck that saves **0** gets no "Dont TVA" line ([lib/order-charge-lines.ts:103](lib/order-charge-lines.ts#L103)).
  - A truck that leaves the box empty gets 10 %.
- **On edits:** an edit re-prices under the order's own stored rate and label ([lib/order-charges.ts:263-275](lib/order-charges.ts#L263-L275), `chargesForEdit` [:285](lib/order-charges.ts#L285)). The pay-at-the-truck switch does the same ([:315](lib/order-charges.ts#L315)).
- **Live:** 3,056 GB orders (263 with the snapshot, none with a rate), 5 US orders with a rate. **France: 4 trucks, 0 orders, 0 trucks with their own rate** (§11).

**How each part of the price is taxed and stored:**

| Part | How it is priced | Taxed? | Stored |
|---|---|---|---|
| Dishes | `unit_price × quantity` ([lib/order-calculations.ts](lib/order-calculations.ts) `calculateOrderTotal`) | inside `food_minor` at the one rate | per line in `items` (price, no rate) |
| Extras (modifiers) | priced into the line's `unit_price` and listed in `modifiers[]` | the same one rate | per line |
| Deals (formules) | `bundle_price + modifierExtra`, **one price for the whole deal** | the same one rate | `orders.deals` jsonb (name, price, slots by dish name) |
| Discount codes | order level, percent or fixed, off the subtotal **before** tax (D6) | reduces `food_minor` | `discount_code`, `discount_amt` |
| Tips | online card only, a percentage of food; **off by default in France** | never taxed ([lib/order-charges.ts:15](lib/order-charges.ts#L15)) | `tip_minor`, `tip_pct_bps` |
| Service fee | online card only; **off in France** | only where `country_settings.fees_taxed` | `service_fee_minor`, `service_fee_recipient` |
| Card surcharge | always off this phase (and not allowed in France) | as the service fee | `card_surcharge_minor` (always 0) |

- **The "Dont TVA" amount** is worked out on `food_minor` alone: `food × rate ÷ (100 % + rate)` ([lib/order-charge-lines.ts:110](lib/order-charge-lines.ts#L110), and the same formula in [lib/accounts/ledger.ts:109](lib/accounts/ledger.ts#L109)). It is not stored as an amount. Only the rate and the food are stored, and every surface re-derives the amount.

---

## 2 · What a VAT rate per dish would touch

**What changes:** each dish, each extra and each deal gets a rate. Each order line keeps the rate it was sold at. Each order keeps a total per rate. Every place that prints or adds up tax reads the per-rate totals.

| Area | Where | What changes |
|---|---|---|
| **Database** | `menu_items_db` (and probably `menu_categories` as a default), `bundles_db` (deals), modifier options, `orders` + `order_drafts` | a rate per dish / category / deal / extra; a per-rate breakdown column on orders and drafts; the rate stamped on each line in `items` jsonb |
| **place_order_atomic_v2** | `supabase/migrations/20261010_18_tax_rate_milli.sql` (the function) | `items` is jsonb, so a per-line rate passes through unchanged. A new breakdown column needs the function replaced (same pattern as 20261010_18) |
| **Menu editor** | `upsert_item` [app/api/manage/route.ts:754](app/api/manage/route.ts#L754); MenuTab in `app/(app)/manage/[token]/page.tsx` (16,492 lines); `components/manage/ExtrasEditor.tsx`; the deals editor | a rate picker per dish and per extra; a deal rate or a split rule |
| **Menu import / demos** | `lib/data-import/`, `lib/demo-menu-carry.ts`, `lib/demo-templates.ts`, `lib/seed-demo-orders.ts` | carry or default the rate |
| **Pricing** | [lib/order-calculations.ts](lib/order-calculations.ts) (154 lines), [lib/order-charges.ts](lib/order-charges.ts) (369), [lib/order-charge-rules.ts](lib/order-charge-rules.ts) | food per rate. **The hard part:** an order-level discount has to be spread across rates, and so does a deal that mixes a 10 % dish with a 20 % drink. Each needs an allocation rule and one rounding rule |
| **Order paths** (each calls the engine) | customer submit [app/api/orders/submit/route.ts:811](app/api/orders/submit/route.ts#L811); card drafts `lib/payments/order-drafts.ts` + `lib/payments/promote-draft.ts`; walk-up [app/api/dashboard/action/route.ts:1783](app/api/dashboard/action/route.ts#L1783); operator edit [:874](app/api/dashboard/action/route.ts#L874); pay-at-the-truck switch [lib/payments/ledger.ts:495](lib/payments/ledger.ts#L495) | stamp each line's rate from the server's menu, never from the browser |
| **Browser previews** | order page [app/(app)/trucks/[slug]/order/page.tsx:1563](app/(app)/trucks/[slug]/order/page.tsx#L1563); Add order [components/dashboard/AddOrderPanel.tsx:1648](components/dashboard/AddOrderPanel.tsx#L1648); dashboard edit [app/(app)/dashboard/[token]/page.tsx:4053](app/(app)/dashboard/[token]/page.tsx#L4053); `/api/menu`'s `checkout` rules | show the same per-rate figures the server will charge |
| **Receipts** | [lib/order-charge-lines.ts:99](lib/order-charge-lines.ts#L99) `includedTaxLine` (one line becomes one per rate); [lib/email.ts:253-261](lib/email.ts#L253-L261), [:481](lib/email.ts#L481), [:533](lib/email.ts#L533); [lib/printing/mapOrderToTicket.ts:135-139](lib/printing/mapOrderToTicket.ts#L135-L139) and `lib/printing/ticket.ts` (`includedTax` is one field; it becomes a list); the new-order email to the truck; the status page | |
| **Reports** | [lib/accounts/ledger.ts:105](lib/accounts/ledger.ts#L105) `orderTax`; `summarise`; [lib/accounts/csv.ts](lib/accounts/csv.ts); `get_report` [app/api/manage/route.ts:3026](app/api/manage/route.ts#L3026); the Reports card and both Reports CSVs | tax per rate; per-rate columns |
| **Apps** | [capacitor.config.ts:28](capacitor.config.ts#L28) loads `www.hatchgrab.com/app` | **no app release needed**: the apps run the website's code, and native printing sends the bytes the website's ticket code builds |
| **Words** | the rate picker, per-rate receipt lines, CSV headers | only locales used by an enabled country (the standing rule) |
| **Proof** | `scripts/france-1.cjs`, `scripts/costs-accounts-1.cjs`, the Phase 3 charge harnesses, `language-phase-1d2`, `_messages-parity-1e` | new checks and named re-pins |

**Estimate: L, about 2–3 weeks.**
- Roughly 25–30 files.
- Half of the work is in the four big screens (Manage, the dashboard, the order page, Add order).
- The risk sits in the allocation rule for discounts and mixed deals, and in keeping GB orders byte-identical (the existing pattern: nothing changes where every line has the same rate).

---

## 3 · French business details

**Nothing is captured.** A search for SIREN, SIRET, VAT number, tax id, legal name, company number and regime found no column, field or form anywhere in `app/`, `lib/`, `components/` or the migrations. The only hit is HatchGrab's own `legalName` in structured data.

| Where | What it takes today |
|---|---|
| Signup [app/api/signup/route.ts:54-69](app/api/signup/route.ts#L54-L69) | email, password, first and last name, marketing tick, promo code |
| Setup (`app/api/setup/route.ts`) | truck name, contact, country, base place and time zone, phone |
| Manage › Settings, `update_settings` [app/api/manage/route.ts:1923-1935](app/api/manage/route.ts#L1923-L1935) | name, description, cuisine, contact email and phone, socials, website, allergen info, WhatsApp, sound. No legal name, address, registration number or VAT number |
| `trucks` (columns observed) | `name` (trading name), `base_place_name` / `base_region` (where they trade from, not a registered address) |
| `operators` | `first_name`, `last_name`, `email`, `phone`, Stripe account id |
| Billing (`truck_billing`, `operator_billing`, `billing_invoices`) | Stripe ids and invoice state. No tax id is sent to Stripe (`tax_id_data` / `tax_ids` appear nowhere) |
| `country_settings.vat_number_required` | **data only, nothing reads it** ([supabase/migrations/20261093_world_countries_5_schema.sql:18](supabase/migrations/20261093_world_countries_5_schema.sql#L18)). 41 of 211 countries true. **France: false** |

**Missing:**
- legal name;
- registered address;
- SIREN/SIRET;
- intra-community VAT number (with a VIES check);
- VAT regime (franchise en base / réel simplifié / réel normal).

**Mismatch to know about:** the France terms already say *"If you are registered for TVA in France, give us your intra-community VAT number"* ([content/legal/country-specific-terms.md:221](content/legal/country-specific-terms.md#L221)), but there is nowhere to give it. That is manual open item 19 (VAT / tax-number capture).

---

## 4 · Daily totals (per truck, per day, net of refunds, per VAT rate)

**Closest existing thing:** the accountant ledger, costs-accounts-1 ([lib/accounts/ledger.ts:130-176](lib/accounts/ledger.ts#L130-L176) `accountRows`, [:208](lib/accounts/ledger.ts#L208) `summarise`). Per order it already gives gross, refunded, tax, net, channel and payment. Set a one-day range and you get one day's totals for one truck.

**What it gets right for this:**
- Tax comes from each order's own stored rate (France: "stored", the same sum as the receipt).
- A refund takes back its share of the tax ([:153](lib/accounts/ledger.ts#L153)).
- A cancelled order that took money is listed, so its refund nets it out.
- Online and counter orders are both included.

**Where it falls short of a daily total per VAT rate:**

| Gap | Detail | Size |
|---|---|---|
| **No rate column** | `AccountRow` has no rate. With one rate per order, grouping by `tax_rate_milli` gives the per-rate split straight away (every French order today has a single rate) | S |
| **Which date** | Reports filters by **`orders.event_date`** ([app/api/manage/route.ts:3083-3084](app/api/manage/route.ts#L3083-L3084)), not the time placed or paid | S |
| **Refunds by order date** | a refund counts on its **order's** event date, not on the day it was made. `order_payments.created_at` holds the refund date, but the ledger doesn't use it | S |
| **Counter refunds** | refunds exist only for online card charges ([lib/payments/refund.ts:160](lib/payments/refund.ts#L160) refuses `not_card`). A cash or in-person card refund has no record | M |
| **Undo deletes** | `undo_collected` **deletes** the payment row ([app/api/dashboard/action/route.ts:687](app/api/dashboard/action/route.ts#L687)). It is logged in `action_audit_log`, but the ledger then simply never had it | M |
| **Cancelled after payment** | a collected counter order that is later cancelled keeps its in-person charge and gets no refund row, so the ledger counts it at full gross ([lib/accounts/ledger.ts:146-154](lib/accounts/ledger.ts#L146-L154)) | S |
| **Pending orders count** | every status except cancelled and rejected is counted, **including `pending`** (not yet accepted; 126 live) ([app/api/manage/route.ts:3040](app/api/manage/route.ts#L3040)) | S |
| **Channel rule** | online vs walk-up is "has a customer email" ([lib/accounts/ledger.ts:166](lib/accounts/ledger.ts#L166)), so a walk-up where staff typed an email counts as online. `orders.source` exists but isn't used | S |
| **Edits overwrite** | an edit rewrites the totals in place, so a day's figure can change afterwards with no trace (§5) | part of §5 |

**How refunds and cancellations are recorded:**
- **Cancel / reject:** `orders.status = 'cancelled' | 'rejected'` plus `cancellation_reason` / `rejection_reason`. No timestamp of the cancellation other than `updated_at`.
- **Refund:** `order_payments` rows `kind = 'refund'`, `state`, `amount_minor`, `created_at` (live: 1). Partial refunds are possible without cancelling.
- **Which date they count on today:** the order's `event_date`, for both.

---

## 5 · Records (the till-software rules)

### Can an order be changed or deleted after it is completed, and by whom?

| Who / what | What it does | Where |
|---|---|---|
| **Operator (owner, manager, staff with dashboard access): edit** | rewrites `items`, `deals`, totals and the tax snapshot in place and sets `status = 'modified'`. **The server has no status check**: the screen shows Edit only on pending, confirmed, modified, cooking and ready orders ([app/(app)/dashboard/[token]/page.tsx:4013-4018](app/(app)/dashboard/[token]/page.tsx#L4013-L4018), [:4925](app/(app)/dashboard/[token]/page.tsx#L4925), [:4931](app/(app)/dashboard/[token]/page.tsx#L4931)), but a direct call can edit a collected or cancelled order | [app/api/dashboard/action/route.ts:789](app/api/dashboard/action/route.ts#L789), write at [:963](app/api/dashboard/action/route.ts#L963) |
| Operator: cancel | `status = 'cancelled'`. No status check either | [:442-451](app/api/dashboard/action/route.ts#L442-L451) |
| Operator: undo collected / undo paid | reverts the status; **deletes** the payment row (logged first) | [:687](app/api/dashboard/action/route.ts#L687), [:2817](app/api/dashboard/action/route.ts#L2817) |
| Operator: refund | adds a refund row (online card only) | [:1202](app/api/dashboard/action/route.ts#L1202) |
| Operator: cancel an event | cancels its confirmed and pending orders | [app/api/events/action/route.ts:371-388](app/api/events/action/route.ts#L371-L388) |
| Customer | can cancel their own order within the truck's cutoff | `app/api/orders/cancel/route.ts` |
| Crons | auto-reject (offline orders, through `lib/orders/reject-order.ts`), the stale-authorisation and stranded-capture crons (payment state) | `app/api/cron/*` |
| **order-retention cron** (daily) | after 12 months: name blanked, email, phone and order note nulled, **each line's `specialInstructions` emptied and deal `slotNotes` cleared, so `items` and `deals` are rewritten**. Never deletes an order | [lib/order-retention.ts:31](lib/order-retention.ts#L31), [:85-94](lib/order-retention.ts#L85-L94), [:153-178](lib/order-retention.ts#L153-L178) |
| Account deletion (admin, on request) | anonymises name, email and phone on every order; keeps orders and payments | [lib/account-deletion.ts:111-121](lib/account-deletion.ts#L111-L121) |
| **Hard deletes of orders** | demo restart [lib/demo-restart.ts:79](lib/demo-restart.ts#L79), demo re-provision [lib/provision-demo-event.ts:135](lib/provision-demo-event.ts#L135), demo seeding [lib/seed-demo-orders.ts:1015](lib/seed-demo-orders.ts#L1015), demo-cleanup cron (prefix `demo-` only); `deleteTruckCascade` deletes **orders first** ([lib/delete-truck.ts:37-44](lib/delete-truck.ts#L37-L44)), and `order_payments` cascades with them | |
| Admin › delete truck | uses that cascade. **Refused when the truck has any payment row** ([app/api/admin/delete-truck/route.ts:177](app/api/admin/delete-truck/route.ts#L177)) and, for an operator's truck, without an override tick. A truck whose orders were all unpaid could still be deleted with them | |
| The database | RLS on; anon and authenticated have no grants on `orders`, `order_payments` or `action_audit_log` (a "Public read orders" SELECT policy exists but grants nothing without a grant). **The service role can UPDATE and DELETE anything.** The only triggers on `orders` are `orders_fill_currency_country` (insert) and `orders_set_updated_at`; nothing refuses a change | §11 |

Observed: 9 of 961 collected orders have `updated_at` more than a minute after `collected_at`. **The cause isn't visible**, because nothing records what changed.

### Audit trail
- **`action_audit_log` exists** ([lib/audit/actionAudit.ts:1-13](lib/audit/actionAudit.ts#L1-L13)):
  - append-only **by convention** (only `logAction` / `logActionOrThrow` insert); no foreign keys, so it outlives the order or truck;
  - records the actor (owner, token, native, offline replay);
  - live: collected, mark_paid, manual_paid_at_order, undo_*, refunds, capture events, since 29 Jul 2026.
- **Not enforced:** no trigger or grant stops an UPDATE or DELETE by the service role, and rows are not chained or signed.
- **Not logged:** order placement, **edit**, cancel, reject, event cancellation and the retention scrub. The file itself says `cancel`, `reject` and `edit` are "intended callers… deliberately NOT wired this pass" ([lib/audit/actionAudit.ts:40-44](lib/audit/actionAudit.ts#L40-L44)).
- **Edits keep no earlier version.** Only `status = 'modified'` and `updated_at` show that something changed.

### How long orders are kept

| | Today | Against keeping records 6 years |
|---|---|---|
| Order rows | kept indefinitely; no job deletes them | ✅ long enough, but not protected from the deletes above |
| Amounts, lines, timestamps | kept | ✅ |
| Line notes (`specialInstructions`), deal slot notes, order note | removed at 12 months, by rewriting `items` / `deals` | ⚠️ the stored record changes at 12 months |
| Customer name, email, phone | removed at 12 months | (privacy policy promise) |
| `order_payments` | kept; deleted by `undo_*` and by any order delete (cascade) | ⚠️ |
| `action_audit_log` | kept; nothing sweeps it | ✅ |
| WhatsApp logs / contact messages | deleted at 12 / 24 months | n/a |

### Receipt number, daily close, tamper evidence
- **Order number:** `orders.id` is a **per-event counter**. It starts again at 1 for every event, with a per-truck counter only when there is no event ([supabase/migrations/20261010_18_tax_rate_milli.sql:85-88](supabase/migrations/20261010_18_tax_rate_milli.sql#L85-L88)). `order_key` is a random UUID. There is **no unbroken per-truck sequence** and no separate receipt number.
- **Daily close ("Z" total):** none. Events open and close, but no totals are frozen. Nothing in the code is called close, clôture, Z or journal.
- **Tamper-evident log:** none (no hash chain, `prev_hash` or signature anywhere).

### Plain list

| Exists | Partial | Missing |
|---|---|---|
| Orders never deleted by retention | Audit log: append-only by convention only; payments and collection only | A database guard against changing or deleting completed orders |
| Per-order tax snapshot | Edit and cancel refused after completion: the screen hides the button, the server allows them | Earlier versions of an edited order |
| Refund rows with dates | Hard deletes limited to demo trucks and payment-free trucks | Sequential receipt number per truck |
| Actor recorded on audited actions | Retention keeps the money but rewrites `items` notes | Daily close / Z total |
| | Counter refunds: possible only as cancel or undo, with no refund row | Tamper-evident log (hash chain or signature) |

---

## 6 · Receipts

| | Online order | Counter (walk-up) order |
|---|---|---|
| **On screen** | the order page's confirmation and the status page `/order/<key>/manage` ([app/(app)/order/[id]/manage/page.tsx:200-286](app/(app)/order/[id]/manage/page.tsx#L200-L286)) | nothing for the customer |
| **Email** | `formatConfirmationEmail` ([lib/email.ts:267](lib/email.ts#L267)), always (the customer gives an email) | only when staff type the customer's email ([app/api/dashboard/action/route.ts:676](app/api/dashboard/action/route.ts#L676)) |
| **Print** | the kitchen ticket (when a printer and print trigger are set) | the same kitchen ticket |

| Field | Email | Status page | Printed ticket |
|---|---|---|---|
| Business (trading) name | ✅ truck name | ✅ | ✅ `truck_name` |
| Legal name, address, SIRET, VAT no. | ❌ (not captured, §3) | ❌ | ❌ |
| Where | event venue line | event venue | — |
| Date of sale | ❌ no date in the template (collection time only; the email's own sent date) | collection time | print time only |
| Items, extras, deals with prices | ✅ | ✅ | ✅ |
| Discount | ✅ | ✅ | ✅ |
| VAT rate and amount | ✅ one line "Dont TVA 10 % : x,xx €" ([lib/email.ts:481](lib/email.ts#L481), [:533](lib/email.ts#L533)) | ❌ **not shown** (only `ChargeRows`, which is empty for France, [:283](app/(app)/order/[id]/manage/page.tsx#L283)) | ✅ one line ([lib/printing/mapOrderToTicket.ts:135-139](lib/printing/mapOrderToTicket.ts#L135-L139)) |
| VAT per rate / total before VAT | ❌ (one rate per order; no "HT" figure) | ❌ | ❌ |
| Total | ✅ | ✅ | ✅ |
| Receipt number | per-event order number | per-event order number | per-event order number |
| Customer name and phone | name | — | ✅ (kitchen use) |

- **The ticket is a kitchen ticket, not a customer receipt.** It prints customer details and kitchen notes.
- **Ticket encoding:** "€" prints as "EUR" and accents are folded to plain letters ([lib/printing/ticket.ts:485](lib/printing/ticket.ts#L485), [:525](lib/printing/ticket.ts#L525); open item 10).

---

## 7 · Exports

| Download | Where | Fields | Filters |
|---|---|---|---|
| **Reports › Orders CSV** | [app/(app)/manage/[token]/page.tsx:15318-15360](app/(app)/manage/[token]/page.tsx#L15318-L15360) | order no., date, event, time placed, collection time, **customer name**, order type, items, deals, modifiers, notes, [subtotal, tax, tip, service fee], total | date range (event date) or one event; van filter |
| **Reports › Items CSV** | [:15362-15372](app/(app)/manage/[token]/page.tsx#L15362-L15372) | order no., date, event, times, customer, type, item, qty, unit price, modifiers, notes, item total, order total | the same |
| **Accountant › Orders CSV** | [lib/accounts/csv.ts:54](lib/accounts/csv.ts#L54), button at [page.tsx:15198-15207](app/(app)/manage/[token]/page.tsx#L15198-L15207) | Date, Time, Order number, Event, Channel, Payment method, Currency, Gross, Tax, Tax basis, Net, Refunded, Cost, Profit. UTF-8 with BOM, ISO dates, dot decimals, **no customer data** | the same, plus presets (this month, last month, last quarter, last tax year) |
| **Accountant › Events CSV** | [lib/accounts/csv.ts:64](lib/accounts/csv.ts#L64) | Event date, Event, Orders, Currency, Gross, Tax, Tax basis, Net, Refunded, Dishes sold, Dishes with a cost, Cost, Profit | the same |
| Others, not truck sales | admin pricing-check CSV (`components/admin/PricingCheckTab.tsx:195`), the features PDF, HatchGrab's own invoices to trucks (Stripe-hosted PDF), Paperwork document files | — | — |

- **For France, the Reports Orders CSV has no tax column.** Its tax, tip and fee columns appear only where tax is *added* at checkout, or where the range has tips or fees ([app/api/manage/route.ts:3163-3168](app/api/manage/route.ts#L3163-L3168)). The accountant CSVs do carry the French TVA.
- **Could one become a daily-totals-per-VAT-rate file with little change? Yes: the Accountant Orders CSV's rows.**
  - Add the order's rate to `AccountRow`.
  - Group by (day, rate): gross, refunds, VAT, net.
  - Choose the day: placed date for sales and refund date for refunds, instead of the event date.
  - One new CSV builder next to `eventsCsv`.
  - **S**, with the §4 fixes (pending orders, counter cancellations) as separate **S** items.
- After a per-dish VAT build, the same file would group by line rate instead of order rate.

---

## 8 · Other French tax and receipt code

- **`country_settings` FR (live):** enabled; `prices_include_tax` true; `tax_label` "TVA"; locale fr-FR; EUR; address format `fr`; `vat_number_required` false; tax year = calendar year (NULL start).
- **Address format `fr`:** `includedTax: { label: 'TVA', milli: 10000 }` ([lib/address-formats.ts:1424](lib/address-formats.ts#L1424)).
- **Manage › Payments:** the « TVA incluse dans vos prix » row. Its hint names 5,5 % for sealed food and 20 % for alcohol (`components/manage/ChargesCard.tsx:122-129`).
- **The France terms:**
  - "Your prices and TVA": TVA shown at 10 % unless the truck sets a rate, "We do not check the rate" ([content/legal/country-specific-terms.md:217](content/legal/country-specific-terms.md#L217));
  - the reverse-charge VAT-number sentence (with no field to take the number, §3) ([:221](content/legal/country-specific-terms.md#L221));
  - the seller's duties (business name, mediator, withdrawal) ([:209](content/legal/country-specific-terms.md#L209)).
- **The French order button** wording (L. 221-14), from france-1.
- **Tips, service fee and surcharge** are off in France.
- **france-1's backlog:** "TVA per item: not now" (`docs/france-1-report.md` §16).
- **Not found:** any NF525, certification or attestation text, any "TVA non applicable, art. 293 B" wording, and any e-reporting or e-invoicing integration (no PDP / Chorus Pro / flux code).

---

## 9 · What this means in one paragraph

HatchGrab stores one TVA rate per order and shows it on emails and tickets. Its accountant ledger is close to a per-day,
per-rate total. What it doesn't have is the till-software side:
- no business identifiers;
- no rate per dish;
- no sequential receipt numbering;
- no protection against edits or deletes at the database;
- no edit history;
- no daily close;
- no tamper evidence.

Retention is long enough, but it rewrites line notes at 12 months.

---

## 10 · Not checked

- The law. The research chat covers it; no legal position is taken here.
- Whether the native apps' printer plugins add any receipt fields of their own (they receive the website's ticket bytes, so none was expected).
- Loyalty rewards and partner codes as discounts, which would also need a per-rate allocation (not traced line by line).

---

## 11 · SQL run (all read-only)

```sql
select country_code, enabled, prices_include_tax, tax_label, vat_number_required, locale, currency, address_format, tax_year_start_month, tax_year_start_day
from public.country_settings where country_code in ('FR','GB','IE','US');
```
```sql
select table_name, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) cols
from information_schema.columns where table_schema='public' and table_name in ('orders','order_payments','menu_items','menu_categories','deals','trucks','order_events','order_audit','order_history')
group by table_name;
```
```sql
select table_name from information_schema.tables where table_schema='public' and (table_name ~ 'menu|item|deal|audit|log|history|event|receipt|invoice|billing|operator|account|legal|business|z_|close|shadow' ) order by 1;
```
```sql
select table_name, string_agg(column_name || ':' || data_type, ', ' order by ordinal_position) cols
from information_schema.columns where table_schema='public' and table_name in ('menu_items_db','action_audit_log','operators','operator_billing','truck_billing','country_billing','billing_invoices','demo_cleanup_log','event_deals')
group by table_name;
```
```sql
select c.relname as tbl, t.tgname, pg_get_triggerdef(t.oid) as def
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('orders','order_payments','action_audit_log') and not t.tgisinternal;
```
```sql
select conrelid::regclass as child, confrelid::regclass as parent, conname, confdeltype as on_delete
from pg_constraint where contype='f' and (confrelid in ('public.orders'::regclass,'public.trucks'::regclass) or conrelid in ('public.orders'::regclass,'public.order_payments'::regclass,'public.action_audit_log'::regclass))
and conrelid::regclass::text in ('orders','order_payments','action_audit_log','order_drafts','billing_usage_orders','menu_items_db')
order by 1;
```
```sql
select tablename, policyname, cmd, roles from pg_policies where schemaname='public' and tablename in ('orders','order_payments','action_audit_log');
```
```sql
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) privs
from information_schema.role_table_grants where table_schema='public' and table_name in ('orders','order_payments','action_audit_log') and grantee in ('anon','authenticated')
group by 1,2 order by 1,2;
```
```sql
select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('orders','order_payments','action_audit_log','menu_items_db');
```
```sql
select country, count(*) as orders, count(*) filter (where tax_inclusive is not null) as with_snapshot, count(*) filter (where tax_rate_milli is not null) as with_rate, min(created_at)::date as first, max(created_at)::date as last
from public.orders group by country order by 2 desc;
```
```sql
select status, count(*) from public.orders group by status order by 2 desc;
```
```sql
select kind, channel, method, state, count(*) from public.order_payments group by 1,2,3,4 order by 5 desc;
```
```sql
select action, actor_kind, source, count(*), min(created_at)::date first, max(created_at)::date last from public.action_audit_log group by 1,2,3 order by 4 desc limit 40;
```
```sql
select count(*) as trucks_fr, count(*) filter (where tax_rate_milli is not null) as fr_with_own_rate from public.trucks where country='FR';
```
```sql
select count(*) filter (where vat_number_required) as vat_required, count(*) as total, col_description('public.country_settings'::regclass, (select attnum from pg_attribute where attrelid='public.country_settings'::regclass and attname='vat_number_required')) as comment from public.country_settings;
```
```sql
select k as line_key, count(*) as lines
from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end) li, jsonb_object_keys(li) k
where o.created_at > now() - interval '60 days'
group by k order by 2 desc;
```
```sql
select count(*) as orders_last_year_window, count(*) filter (where updated_at > collected_at + interval '1 minute') as updated_after_collected
from public.orders where status = 'collected' and collected_at is not null;
```

**Results used above:**
- **Orders:** GB 3,056 (263 with the snapshot, 0 with a rate); US 5 (all with a rate); **FR 0**.
- **Statuses:** confirmed 1,581, collected 1,068, ready 234, pending 126, cancelled 43, rejected 6, modified 3.
- **Payments:** in-person card 641, in-person with no method 222, online card 17, cash 2, refund 1.
- **France:** 4 trucks, 0 with their own rate; `vat_number_required` true in 41 of 211 countries.
- **Line keys:** name, unit_price, quantity (933 each), cartKey 687, source 281, specialInstructions 69, modifiers 25. No dish id and no rate.
- **Edited after collection:** 9 of 961 collected orders have `updated_at` more than a minute after `collected_at`.
