# till-pack-1b — till-pack-1 reworked before it was applied

**Status (25 November 2026): APPLIED.** At 12:46 UTC the till still holds 0 chain entries, 0 seals and 0 failures: no live order since 20 Nov. The tamper-evident chain is live in **observe mode**. Nothing is chained yet:
- every till table is empty;
- the baseline has not run;
- no live order has been touched since the apply.

How it went in:
- **Applied** at 10:00 UTC with `scripts/db-migrate.cjs`, in one transaction, with no error. The file was committed at 488ab5df,
  sha256 `fcc85a4d77df5f12`.
- **No `--approved-by-dominic` flag was needed.** The file no longer updates `orders`, so the runner's protected-table rule did not
  match.
- **Both of your conditions were met first.** Every rehearsal proof passed (44/44, rolled back, twice on the committed file). And the
  migration writes nothing to existing rows of `orders`, `order_payments` or `action_audit_log` (proof S9: no row of those tables, or
  of `trucks`, carries the migration's transaction id).
- **After the apply,** `--till-1-check` passed: 44/44, the two-connection test, and the timings, every transaction rolled back.

Branch `france-vat-1`. My commits on top of this prompt's starting commit 2b0dbac1:

| Commit | What |
|---|---|
| 488ab5df | the migration reworked; the proof modes; the mirror; the offline verifier; the harness |
| 3811b545 | applied; the check run's exports and timings; a log-line fix |

Another session committed b188596f and 0a563735 (compare-research-2) on the branch in between. I did not touch, stage or commit their
files. §10 separates their effect from mine in the sweep.

Nothing customer- or operator-facing changed. There is no route, screen, email, ticket, landing-page or `outreach_templates` change,
and nothing was deployed or pushed.

---

## 0 · Prompt check

Nothing arrived garbled, and I found no instruction contradicting another. Where the prompt left room, this is the reading I took:

- **"status leaves pending/awaiting".** There is no `awaiting` order status. The live check constraint allows `pending`, `confirmed`,
  `rejected`, `modified`, `cancelled`, `cooking`, `ready` and `collected`. So acceptance means leaving `pending` into an accepted state
  (`confirmed`, `modified`, `cooking` or `ready`). `modified` is the "accepted, then edited" sibling of `confirmed`
  (`app/api/orders/cancel/route.ts:73`), so it counts as accepted.
- **"Pending orders stay unsealed" alongside "first payment … whichever comes first".**
  - A pending order is never sealed by acceptance or by any change while it is pending.
  - A payment recorded on a still-pending order seals it at that payment (Q1), with `fiscal_state` `pending`. Proof 2g covers this.
  - No code path does that today. Every capture site writes `confirmed` before it captures: the confirm route, the time-adjust that
    confirms, auto-accept, promotion auto-accept and the stranded sweep. Live, no payment belongs to a pending order.
  - If you would rather such an order stayed unsealed until accepted, it is a one-line change in `till_payment_inserted`.
- **"Day close".** The fourth seal moment has nothing to run on until till-pack-4 builds the close. This pack still dates
  after-close edits (`*_after_close`) and logs them.
- **"Deals split into their parts … as the VAT engine allocates them".** The engine's `tax_parts` are one part per **rate**, merged,
  not one per dish (`lib/order-tax.ts` lineTax). So each deal is sealed as one VAT line per rate. An older deal with no split is
  sealed as one line at the order's rate.
- **till_id "else the device/source as recorded today".** Orders record no device id. The column list has none, and offline
  replays insert as `source = 'manual'`. So a walk-up or replay gets `manual`. A device id would come with the device-side hash (law
  change 8, pack-2).
- **The law report's delta also mentions "the actor's role".** This prompt's change 6 does not, and the database cannot see the actor:
  the routes use the service role. It is not built here. Pack-2's routes can add it.

---

## 1 · What changed from till-pack-1, and why

| # | Change | Why |
|---|---|---|
| 1 | **Seal state moved off `orders`.** The new table `till_order_seals` holds, per order: `sealed_at`, `version`, `last_seq`, `last_payload_hash`, `last_reason` and `deleted_at`. RLS is on, there are no anon or authenticated grants, and the service role cannot write it. `orders.sealed_at` and `sealed_version` are gone from the design. Every till trigger on `orders` and `order_payments` is now an **AFTER** trigger that only reads the row and writes till tables. The order-row locks (`for no key update`) and the internal `till.internal` update are gone. The baseline writes till tables only. | Your decision, 25 Nov. Results: no realtime event, no `updated_at` change and no row lock from the till; the migration adds no column to a live table; `db-migrate`'s protected-table rule no longer matches. |
| 2 | **Seal at acceptance** (law change 1), plus first payment and final state. Pending orders stay unsealed. | § 80: an accepted order (1,551 live `confirmed`/unpaid) was editable without trace until paid or closed. |
| 3 | **Every sealed line carries `vat_rate_milli` and `line_total_excl_vat_minor`** (and `line_price_minor`); every deal carries `vat_parts`; the order carries `vat_basis` and `vat_summary`. Everything reconciles to the order's totals to the minor unit (§6). | § 50: "total hors taxe de la ligne, taux de TVA associé". |
| 4 | **A non-null `till_id`** on every sealed order version (§5). | § 50: « le numéro de la caisse ». |
| 5 | **`identity` chain entries:** legal name, registered address, registration number, VAT number, VAT regime. Written once before a truck's first entry, and at once when they change (a new AFTER trigger on `trucks`). Each order version names the identity entry in force `{seq, hash}`. | § 130: the data that produced each receipt. |
| 6 | **A plus/minus delta** on every order version after the first (§4). | § 90: « opérations de plus et de moins ». |
| 7 | **The `event` kind:** types mode, version, close, archive, verify, export, `till_start`, `till_end`, enforced by a check constraint. Only `till_start` is written, as seq 1 of every truck's chain. | Law change 6; the other writers are packs 4 and 6. |
| — | `till_verify` checks all of the above too. The offline verifier and the mirror do the same. | So tampering with any of it is caught in the database and offline. |

Everything else from till-pack-1 stays as it was:
- observe mode;
- never failing a sale (2 s lock_timeout, `till_failures`, a WARNING);
- the whitelist with no customer data;
- demo trucks outside the till;
- `action_audit_log` append-only;
- `till_verify`, `scripts/till-verify.cjs`, the baseline (built, not run) and the two rollback-script modes.

---

## 2 · Files changed (mine only)

| File | Change |
|---|---|
| `supabase/migrations/20261129_till_pack_1.sql` | reworked in place, never applied before: 1,452 lines, 6 tables, 38 functions, 11 triggers |
| `scripts/db-rollback-proofs.cjs` | the till section rewritten. Engine-consistent proof orders; 44 proofs (35 in the DO block, S1–S9, counts); an xmin check after every step; a nested-write probe (pre-flight only); two-connection test; six timed operations |
| `scripts/_till-sealed-mirror.cjs` | the mirror of `till_vat` / `till_till_id` / `till_order_delta` / `till_vat_reconciles`, in exact BigInt decimals |
| `scripts/till-verify.cjs` | checks till_start, identity versions and references, per-order versions, deltas, till_id and VAT reconciliation. It reports a malformed entry instead of crashing (the harness's tamper test found that case) |
| `scripts/till-pack-1.cjs` | everything it proved before, plus section H (law changes 1–6): 64 passed, 0 failed, about 30 s |
| `docs/till-pack-1/` | `chain-preflight.jsonl`, `rows-preflight.json`, `chain-check.jsonl`, `rows-check.json`, `timings.json` (demo truck, rolled back) |
| `docs/till-pack-1b-report.md` | this report |

**No existing harness was changed or re-pinned.** `scripts/harnesses.json` is untouched: `till-pack-1.cjs` was already registered.

---

## 3 · The migration, as built

**Tables** (RLS on; `revoke all` from anon and authenticated; no foreign key):

| Table | Notes |
|---|---|
| `till_settings` | `guard_mode 'observe'`, `software_version '0.1.0'` |
| `till_chain` | kinds: order, payment, deletion, identity, event, close, archive. Constraint `till_chain_event_types`. Index `(truck_id, kind, ref, seq desc)` |
| `till_chain_heads` | adds `identity_seq`, `identity_hash`, `identity_digest` |
| `till_order_seals` | new; index on `truck_id` |
| `till_failures` | unchanged |
| `till_guard_events` | unchanged |

The service role has INSERT / UPDATE / DELETE / TRUNCATE revoked on `till_chain`, `till_chain_heads` and `till_order_seals`.

**Functions:** 38, each with its own `revoke all … from public, anon, authenticated, service_role`; `till_verify` is granted back to
the service role.

| Group | Functions |
|---|---|
| pure helpers | `till_ts`, `till_fiscal_state`, `till_pick`, `till_pick_all`, `till_num`, `till_rate`, `till_minor_digits`, `till_allocate` |
| sealed forms | `till_vat`, `till_sealed_lines`, `till_till_id`, `till_sealed_order`, `till_order_source` (the update guard's cheap "did a sealed column change?" filter), `till_sealed_payment`, `till_identity_data` |
| delta and check | `till_multiset_minus`, `till_order_delta`, `till_vat_reconciles` |
| scope | `till_applies`, `till_truck_tz`, `till_day_closed`, `till_today` |
| writers | `till_write` (the only writer of `till_chain`), `till_identity_sync`, `till_append` (till_start + identity before every entry), `till_log_failure`, `till_guard_event`, `till_seal` (takes the truck's head first, then reads the seal state and the order, and writes v1 or vN with its delta) |
| trigger functions | `till_payment_inserted`, `till_order_inserted`, `till_order_guard`, `till_order_delete_guard`, `till_payment_guard`, `till_payment_delete_guard`, `till_truck_identity_changed`, `till_refuse_change` |
| verify and baseline | `till_verify`, `till_baseline` |

**Triggers** (each created only if missing):

| Table | Triggers |
|---|---|
| `orders` | `orders_till_seal` AFTER INSERT, `orders_till_guard` AFTER UPDATE, `orders_till_guard_delete` AFTER DELETE |
| `order_payments` | `order_payments_till_chain` AFTER INSERT, `order_payments_till_guard` AFTER UPDATE, `order_payments_till_guard_delete` AFTER DELETE |
| `trucks` | `trucks_till_identity` AFTER UPDATE OF the five identity columns, WHEN one really changed |
| `till_chain` and `action_audit_log` | `*_append_only` BEFORE UPDATE OR DELETE, `*_no_truncate` BEFORE TRUNCATE (HGT01) |

**Lock order.** There are no locks on order or payment rows. A truck's chain head is its one till lock, taken first by every till
write. A transaction that waits for it then sees the other's committed seal.

---

## 4 · The sealed fields, exactly

**Envelope** (12 keys): `v, kind, truck_id, ref, version, reason, trading_day, software_version, recorded_at, identity, delta, data`.
- `identity` is `{seq, hash}` on order entries and null on the others.
- `delta` is null on version 1 and on every non-order entry.

**Order** (`kind 'order'`, one entry per version), 37 fields:
- till-pack-0 §4 C1's 34: `truck_id, order_key, receipt_no, id, event_date, event_id, van_id, placed_at, collected_at, source,
  order_type, items, deals, discount_code, discount_amt, subtotal, total, total_minor, currency, country, food_minor, tax_minor,
  tax_rate_milli, tax_inclusive, tax_label, tax_breakdown, tip_minor, tip_pct_bps, service_fee_minor, service_fee_recipient,
  card_surcharge_minor, card_fee_payer, vat_regime, fiscal_state`;
- plus **`till_id`, `vat_basis`** (`breakdown` / `order_rate` / `legacy` / `recomputed`) and **`vat_summary`** (per rate:
  `vat_rate_milli, food_minor, excl_vat_minor, vat_minor`).

**Lines:**

| Line | Whitelisted keys | VAT keys added |
|---|---|---|
| item | `name, quantity, unit_price, price, item_id, tax_rate_milli, cartKey, source, modifiers, upsells` | `vat_rate_milli, line_price_minor, line_total_excl_vat_minor` |
| modifier / upsell | `name, price, quantity` | — |
| deal | `name, price, quantity, bundle_price, original_price, modifierExtra, deal_id, cartKey, source, slots, slotModifiers, tax_parts` | `vat_parts`: one per rate, each with the same three keys |
| tax part | `tax_rate_milli, minor` | — |

Any other key is named under `_other_keys`, never its value. The note keys leave no trace.

**Delta** (versions 2+):

| Key | Holds |
|---|---|
| `from_version` | the version it is measured against |
| `minus.items` / `minus.deals` | the previous version's lines this one lacks (whole sealed lines, with their VAT figures) |
| `plus.items` / `plus.deals` | this version's new lines |
| `amounts` | each changed money field (`subtotal, discount_amt, total, total_minor, food_minor, tax_minor, tip_minor, service_fee_minor, card_surcharge_minor`) with `from`, `to` and `change` |
| `vat` | per rate, the change in excl. VAT and in VAT |
| `fields` | the names of every changed sealed field |

**Payment** (12, unchanged): `id, order_key, truck_id, kind, channel, method, amount_minor, currency, state, external_ref, livemode,
created_at`.

**Identity** (5): `legal_name`, `registered_address` (`address, town, suburb, region, postcode`; any other key named only),
`registration_number`, `vat_number`, `vat_regime`.

**Event** (`till_start`): `{type: 'till_start', guard_mode}`.

**Never sealed:**
- customer name, email and phone;
- the order's notes and line notes, and the notes inside lines;
- table reference, cancellation and rejection reasons;
- slot, kitchen and buzzer fields;
- payment-status caches, the platform fee and card funding;
- the payment's note, `created_by` and idempotency key.

⚠️ **A sole trader's legal name is now in the chain** (identity entries). It is business identity kept under a legal duty
(till-law-1, adviser question 9). It is not customer data, but account deletion cannot remove it. Your privacy policy may want a line
for it.

---

## 5 · The till_id rule, per path

Rule: the van's id when the order has one; else `web` when `source = 'web'`; else the recorded `source`, trimmed; `unrecorded` if
empty.

| Path (as recorded today) | `source` | van | `till_id` |
|---|---|---|---|
| Online order through `place_order_atomic_v2` / submit, with a van (2,158 live) | `web` | yes | the van's id |
| Online order without a van (347 live), and the card promotion insert (no source given, so the column default) | `web` | no | `web` |
| Walk-up, and its offline replay (556 live) | `manual` | no (none live) | `manual` |
| Any order with a van, whatever its source | — | yes | the van's id |
| A row with an empty or null source | — | no | `unrecorded` (none live; proof 15) |

---

## 6 · The line VAT: how it is computed, and how it reconciles

**The lines:**
- each item: `unit_price × quantity` in minor units (the currency's decimals: lib/currencies.ts's 13 no-decimal and 5 three-decimal
  currencies, checked against the registry by the harness), at its stamped `tax_rate_milli`, or the order's rate on an older,
  unstamped line;
- each deal: its `tax_parts` (one per rate), or for an older deal `(price + slot extras)` at the order's rate.

**The targets, per rate:**

| Basis | When | Per-rate figures |
|---|---|---|
| `breakdown` | there is a `tax_breakdown` whose rates are the lines' rates and whose food adds up to the order's food | the stored food and tax for each rate. Excl = food − tax (VAT included) or food (VAT added) |
| `order_rate` | no breakdown, but `food_minor` is set | the food at the order's one rate. VAT included: food × r ÷ (100 % + r), rounded once. VAT added: the order's own `tax_minor` |
| `legacy` | no `food_minor` | the same, with food = (subtotal − discount) in minor units |
| `recomputed` | a breakdown exists but doesn't match the lines | the engine's own rules again. `till_verify` counts these as `vat_recomputed`, as information |

Then each rate's total excluding VAT is split across that rate's lines by their prices, largest remainder, which is the engine's
`allocate()`.

**What `till_vat_reconciles` checks (and `till_verify`, the offline verifier and the harness):**
1. every line carries its three figures, and every deal at least one part;
2. per rate, the lines add up to `excl_vat_minor`;
3. the rates' food adds up to the order's food;
4. VAT included: excl + VAT = food. VAT added: excl = food, and Σ VAT = `tax_minor`;
5. with basis `breakdown`, the summary is the stored breakdown;
6. `total_minor = food + tax + tip + service fee + surcharge`; before the charge columns, `total = subtotal − discount`.

That last identity holds on **every** live order: all 268 with charge columns (5 VAT-added, 263 VAT-included) and all 2,793 legacy
ones. So `till_verify` can treat it as a hard check.

**Live data today:**

| Basis | Orders | Why |
|---|---|---|
| `legacy` | 2,793 | no `food_minor` |
| `order_rate` | 268 | 263 are GB, VAT included, no rate set; 5 are US at 6.625 % |
| `breakdown` | 0 | no live order has a `tax_breakdown` yet (france-vat-1 is not deployed) |

**Worked example** (proof 14a). A French order with lines at 5.5 %, 10 % and 20 %, a deal split 10 % / 20 %, and a 10 % discount
(food 3,177):

| Line | Excl. VAT |
|---|---|
| Galette | 1,227 |
| Cidre | 300 |
| Pain | 282 |
| deal part at 10 % | 696 |
| deal part at 20 % | 337 |

| Rate | Excl. VAT | VAT |
|---|---|---|
| 5.5 % | 282 | 15 |
| 10 % | 1,923 | 192 |
| 20 % | 637 | 128 |

2,842 excl + 335 VAT = 3,177.

---

## 7 · The proofs, with timings

**Pre-flight runs** (each one transaction, rolled back; demo/test trucks `demo-mk65q66spjck0g9mxt50btfxtr` FR and `test-truck-2` GB;
both had 0 orders before and after every run; never a live trading truck):

| When (UTC) | Result |
|---|---|
| 09:50 | **failed, rolled back.** `till_vat`'s final query used aliases `i` / `j` that clashed with its loop variables (42702). Note that every trigger still let its write through and logged the failure, as designed. Fixed. |
| 09:50 | **failed, rolled back.** My legacy test order passed `tax_minor` null; the column is NOT NULL (default 0, like every live legacy row). Proof data fixed. |
| 09:51 | **44/44 passed,** 737 ms with the locks held |
| 10:00 | **44/44 passed** on the committed file, 811 ms |

The lock windows are on `orders`, `order_payments`, `action_audit_log` and `trucks`. Before each run, a read-only check showed no
order or payment since 20 Nov.

**The 44 proofs:**

| # | Proved |
|---|---|
| 1 | the deployed `place_order_atomic_v2` call, a walk-up, an offline replay (inserted, then skipped) and a card promotion all succeed. The three accepted inserts are sealed at once (v1 `accepted`); the pending promotion is not |
| 18a | seq 1 is the `till_start` event, seq 2 the identity, before the first order |
| 2a | mark paid on a sealed order: one payment entry, no new version |
| 2b | the payment cache write-back makes no version |
| 2c | collect: exactly one payment entry plus one order version (v2 `state_change`, collected) |
| 2d | a pending order stays unsealed through changes; accepting it seals v1; the online charge chains one payment entry |
| 2e | refund: one entry, no version |
| 2f | the fee fill: no entry, no event |
| 2g | a payment on a still-pending order seals it at that payment (Q1) |
| 3 | forced failure (`till_chain` renamed): the payment **and** an accepted walk-up still insert; `till_failures` says 42P01 |
| 4 | the deployed undo-by-delete still deletes, is logged, and is chained as a deletion; the status back makes v3 |
| 5a | an edit before the close makes v2 `edit` |
| 17a | v2's delta: minus the old line, plus the new one; `total_minor` +500; at 10 %, excl +454 and VAT +46; the six changed field names |
| 5b | a late payment is dated today; an edit after the close makes v2 `edit_after_close` and logs `would_refuse_after_close`; the placed_at fill makes v3 with no event |
| 6 | retention, the line-notes move and account deletion make no version; `till_verify` stays true |
| 7 | kitchen moves, slot and buzzer: no version |
| 8 | demo trucks outside the till: nothing chained or logged, deletes and cascades work |
| 8b | the till on: deleting a sealed order (its payment cascading) is allowed, logged for both rows, chained as two deletions, and the seal marked deleted; verify true |
| 9 | UPDATE / DELETE / TRUNCATE refused (HGT01) on `till_chain` and `action_audit_log`; an audit INSERT works |
| 10 | the baseline seals the unsealed non-pending orders and the unchained payments once, leaves pending unsealed, and does nothing on a second run; verify true |
| 19a | the baseline wrote no order or payment row: every row's ctid, xmin and updated_at are identical before and after it |
| 11 | a tamper with the guard disabled is caught: "row differs from its sealed form" |
| 14a | the mixed-rate example of §6 |
| 14b | VAT added (US, with a tip and a service fee), legacy with an old deal, one older rate, JPY, and a recomputed breakdown: exact expected figures, all reconciling |
| 14c | +1 on a line, or on the total, or a part's rate changed, fails reconciliation |
| 15 | till_id: the van id, `web`, `manual`, `unrecorded`; no version without one |
| 16 | identity v2 is written **at once** by the trucks trigger, whitelisted, with no order or payment row touched; a non-change writes nothing; the next order version names identity v2 |
| 17b | every version 2+ has a delta, every v1 none |
| 18b | an unknown event type is refused (23514); `till_start` appears once, at seq 1 |
| 12a | no customer value or key in any payload |
| 12b | the canonical text is key-order independent; 2.50 stays 2.50 |
| 19b | after **every** step (12 checkpoints), every order and payment row of both trucks carries the proof transaction's own xid. A till trigger works in a subtransaction, so a row it wrote would carry another xid |
| 19c | (pre-flight) a probe trigger saw no INSERT or UPDATE of orders / order_payments issued from inside another trigger. The only nested writes were the FK cascade's payment DELETEs |
| 13 | the final `till_verify`: ok in every respect; one recomputed basis, the proof's own |
| S1–S8 | six tables with RLS; no API read of the chain or seals; no service-role write; the audit privileges; function grants; observe mode and 0.x; the `place_order_atomic_v2` md5 unchanged; no seal column on orders/payments; all seven order/trucks triggers AFTER |
| S9 | (pre-flight) the migration itself wrote no row of orders, order_payments, action_audit_log or trucks |
| counts | the demo trucks' counts are identical before and after, receipt counters included |

**`--till-1-check`** (10:00 UTC, after the apply): **44/44**, the proofs in 524 ms. The two-connection test:

| Check | Result |
|---|---|
| truck B's accepted insert and payment while truck A's head is held | **137 ms, not blocked** |
| truck A's waiter after the holder rolls back | in after **588 ms**, with its chain entry |
| a holder past the trigger's 2 s timeout | the payment goes **in** after **2,020 ms**, unchained, with 55P03 in `till_failures` — never an error |

The test holds several transactions open on truck A. That made the existing receipt-number trigger (france-records-1) time out for
two of the inserts (`orders_assign_receipt_no … 55P03`). That is its own never-fail behaviour (no receipt number, logged), all rolled
back, and not the till.

---

## 8 · Applied

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261129_till_pack_1.sql
db-migrate: supabase/migrations/20261129_till_pack_1.sql · sha256 fcc85a4d77df5f12 · committed at 488ab5df
db-migrate: … applied — one transaction, no error
```

`db-migrate` then refreshed hatchgrab.com's marketing caches (countries, plans, FAQ), as it does after every migration. No content
changed.

**The read-only VERIFY afterwards:**
- the six `till_*` tables, all with RLS on;
- no `seal%` column on `orders` or `order_payments`;
- the 11 triggers exactly as in §3: the seven on orders, payments and trucks AFTER; the four append-only BEFORE;
- `place_order_atomic_v2` md5 `e4b273abcf8e7609c6ca54033ed59332`;
- guard mode `observe`;
- 0 chain entries, 0 seals, 0 failures, 0 guard events.

---

## 9 · The extra time per write

Mean of 40, measured inside the database (`clock_timestamp`), on the demo truck, rolled back:

| Write | Till off | Till on | Extra |
|---|---|---|---|
| accepted insert (sealed at once: till_start / identity on the first, then v1) | 0.754 ms | 6.077 ms | **+5.3 ms** |
| pending insert (nothing sealed) | 0.412 ms | 0.511 ms | +0.1 ms |
| acceptance (pending → confirmed, seals v1) | 0.275 ms | 4.230 ms | +4.0 ms |
| a payment on a sealed order | 0.449 ms | 2.713 ms | **+2.3 ms** |
| a kitchen move on a sealed order (the cheap filter; no version) | 0.310 ms | 1.032 ms | +0.7 ms |
| an edit of a sealed order (version + delta + VAT lines) | 0.734 ms | 9.244 ms | +8.5 ms |

All are well under the 20 ms limit. The figures are in `docs/till-pack-1/timings.json`.

---

## 10 · Harness and sweep

**`scripts/till-pack-1.cjs`: 64 passed, 0 failed** (about 30 s, offline, no database).

| Section | Checks |
|---|---|
| A | the whitelist: 37 order fields, the columns read, the update guard's filter columns, the 12-key envelope, the 5 identity keys |
| B | the mirror equals the database byte for byte on both exports (21 orders, 8 payments each); every stored delta recomputed byte for byte; every order version reconciles |
| C | a 600-row fuzz: no customer value leaks; a till_id always; VAT keys on every line |
| D | canonical text |
| E | both exports verify offline, and **every one of the 78,118 single-byte changes** to each is detected |
| F | the real retention, notes and account-deletion patches change no sealed byte |
| G | AFTER-only triggers; no INSERT / UPDATE / DELETE of orders, order_payments or trucks anywhere in the migration; nothing else touched |
| H | law changes 1–6. Among them: **500 orders priced by the real VAT engine** (`lib/order-tax.ts` + `lib/order-charges.ts`; FR, GB, US, JP, no rate; 259 with several rates, 255 with deals; discounts, tips, fees). Every line's rate is the engine's stamp, every deal's parts are the engine's `tax_parts`, and every order reconciles |

**Sweep:**

The whole registry, minus `compare-fix-2.cjs` (another session's file; the dry-run screen refuses it because it can reach the live
database). It ran in three worktrees, each with 237 harnesses:
- **START** 2b0dbac1 (this prompt's starting commit);
- **MID** 0a563735 (the other session's compare-research-2 tip, the parent of my first commit);
- **HEAD** 3811b545.

| | START | MID | HEAD |
|---|---|---|---|
| failed | 20 | 19 | 20 |

- **19 harnesses fail at all three points, each on exactly the same lines** (timings and ids masked): billing-1, contact-1,
  costs-accounts-1, country-settings-parity, cwv-2, faq-1, france-1, inbox-2, language-phase-1b / 1c / 1d / 1d2 / 1e / 2,
  legal-languages-1, loyalty-1, screenshot-truck-details, site-chrome-1, tidy-1. None is caused by this work.
- **The only difference is `event-types-render.cjs`:** failed at START, passed at MID, failed at HEAD. It is the browser-timing
  harness that till-pack-1's sweep already found flaky (a dropdown font measurement and a screenshot time-out under load). Its output
  is identical at START and HEAD, and my commits touch no CSS, component or screen.
- `till-pack-1.cjs` (64/0) and `migration-function-grants.cjs` (14/0) pass at HEAD.
- No harness pins the migration list, the registry or the rollback script in a way this work broke. **Nothing re-pinned.**
- The worktrees are removed. The main tree's `node_modules` and `.next` are intact, and no fixture was rewritten.
- About 90 more commits from other sessions (compare-research-2 and -3) landed on the branch after 3811b545. None touches a till file,
  the rollback script, the registry or migration 20261129.

---

## 11 · FK and cascade decisions (unchanged from till-pack-1 §5, plus one)

The till-pack-1 table stands. In short:
- `order_payments` cascades from `orders` and `trucks`;
- `review_requests` and `loyalty_*` cascade or set null from `orders`;
- `orders.event_id` and `van_id` are SET NULL;
- `action_audit_log` has no FK; the till tables have none.

Append-only `action_audit_log` blocks no current path.

**New:** the `trucks` trigger has no FK either. It fires only on an UPDATE OF the five identity columns that really changes one of
them. `place_order_atomic_v2`'s `order_counter` update and every other truck update never fire it.

**Note:** an event or van delete (SET NULL on a sealed order) now versions that order (`edit`, or `edit_after_close` with a would-be
refusal). That comes from the code, not from a separate proof.

---

## 12 · What till-pack-2 must know (updated)

- **Seal state is `till_order_seals`, never `orders`.** Pack-2's code must not look for seal columns. `till_seal(order_key, reason)`
  is the one sealing function.
- **Reversal rows must net to zero.**
  - `getOrderBalance` counts any refund row today ([lib/payments/ledger.ts:213-221](lib/payments/ledger.ts#L213-L221)).
  - Pack-2 adds `order_payments.reverses_payment_id` and `reason`.
  - A reversal is a new INSERT, so it is chained as it stands.
- **Undo-by-delete** shows up as a `deletion` entry plus `would_refuse_delete` (proof 4). Pack-2 replaces it with reversals.
- **Guard sqlstates.** Only HGT01 raises today. Pack-3's enforce mode will raise on the `would_refuse_*` paths. Map them to 409.
- **Acceptance seals now.** Every accepted order is sealed at once, and every later change to a sealed field is a version with a
  delta.
  - The operator's edit route (`status: 'modified'`) therefore produces versions.
  - After the day's close (06:00 D+1, truck time), each such change logs `would_refuse_after_close`.
  - Pack-3 must route those to corrections before enforcing.
- **The actor's role in the delta** (law report) is not in the database. The route knows it and could record it with the
  correction.
- **The device id for till_id.** Walk-ups and offline replays are `manual` today. Law change 8 (the device-side hash) is the place to
  record a device id, which `till_till_id` could then prefer.
- **`event_id` / `van_id` SET NULL** versions sealed orders (§11); pack-3 must allow or reroute it.
- **The baseline**, after the france-notes-1 deploy:
  - run it truck by truck at a quiet hour: `select public.till_baseline('<truck>');`
  - it writes till tables only: **no realtime burst**, no `updated_at` change;
  - about 2,900 non-pending orders and about 880 payments today;
  - until then, `till_verify` counts them as `unsealed_orders` / `unchained_payments`.
- **`vat_basis` today** will be `legacy` or `order_rate` for every live order. `breakdown` starts with france-vat-1's deploy.
- **The identity holds a sole trader's legal name** (§4). The privacy policy and account deletion need a decision on that (adviser
  question 9).

---

## 13 · Decisions

| Q | Decision |
|---|---|
| Q1 | yes: plus acceptance (law change 1) |
| Q2 | yes |
| Q7 | yes |
| Q8 | yes; built, proved rolled back, **not run** |
| Q3, Q4, Q5, Q6, Q10, Q11, Q12, Q14 | as recommended in till-pack-0 §8 |
| **Q9, Q13, Q15** | **still open with you** |
| 25 Nov | **NO** to the original migration → this rework; approval to apply given the conditions above (met) |

---

## 14 · Every SQL statement run

The appendix lists them all:
- **A:** the read-only Supabase MCP queries, A1–A12;
- **B:** the 41 statements of a pre-flight run. The passing 09:51 run sent the same 41. The two failed runs sent the first 22 (up
  to the proof block, which failed) and then rolled back. The three long statements are referenced by their committed source;
- **C:** `--till-1-check`'s statements;
- **D:** the `db-migrate` apply.

---

## Undo (only if Dominic asks)

This drops the till: the chain, the seals and the guard. Once real trucks are in the chain, deleting it is itself a legal problem.
It takes brief exclusive locks on `orders`, `order_payments`, `trucks` and `action_audit_log`.

```sql
begin;
set local lock_timeout = '3s';
drop trigger if exists orders_till_seal on public.orders;
drop trigger if exists orders_till_guard on public.orders;
drop trigger if exists orders_till_guard_delete on public.orders;
drop trigger if exists order_payments_till_chain on public.order_payments;
drop trigger if exists order_payments_till_guard on public.order_payments;
drop trigger if exists order_payments_till_guard_delete on public.order_payments;
drop trigger if exists trucks_till_identity on public.trucks;
drop trigger if exists action_audit_log_append_only on public.action_audit_log;
drop trigger if exists action_audit_log_no_truncate on public.action_audit_log;
grant update, delete, truncate on public.action_audit_log to anon, authenticated, service_role;
drop table if exists public.till_chain, public.till_chain_heads, public.till_order_seals, public.till_failures, public.till_guard_events, public.till_settings;
drop function if exists public.till_baseline(text), public.till_verify(text), public.till_refuse_change(), public.till_truck_identity_changed(),
  public.till_payment_delete_guard(), public.till_payment_guard(), public.till_order_delete_guard(), public.till_order_guard(), public.till_order_inserted(),
  public.till_payment_inserted(), public.till_seal(uuid, text), public.till_guard_event(text, text, text, text, text, jsonb),
  public.till_log_failure(text, text, text, text, text), public.till_append(text, text, text, integer, text, date, jsonb, jsonb),
  public.till_identity_sync(text, text), public.till_write(text, text, text, integer, text, date, jsonb, jsonb, jsonb), public.till_today(text),
  public.till_day_closed(text, date), public.till_truck_tz(text), public.till_applies(text), public.till_vat_reconciles(jsonb),
  public.till_order_delta(jsonb, jsonb, integer), public.till_multiset_minus(jsonb, jsonb), public.till_identity_data(text),
  public.till_sealed_payment(public.order_payments), public.till_order_source(public.orders), public.till_sealed_order(public.orders),
  public.till_till_id(public.orders), public.till_sealed_lines(jsonb, text), public.till_vat(public.orders), public.till_allocate(numeric, numeric[]),
  public.till_minor_digits(text), public.till_rate(jsonb), public.till_num(jsonb), public.till_pick_all(jsonb, text[]), public.till_pick(jsonb, text[]),
  public.till_fiscal_state(text), public.till_ts(timestamptz);
commit;
```

---

## Appendix — SQL statements

### A · Read-only, through the Supabase MCP (this prompt)

**A1** (2026-11-25 07:56 UTC)

```sql
select 'status_check' as k, pg_get_constraintdef(oid) as v, null::bigint as n from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_status_check'
union all select 'source|order_type|van?', coalesce(source,'(null)') || '|' || coalesce(order_type,'(null)') || '|' || (van_id is not null)::text, count(*) from public.orders group by 2
union all select 'breakdown', (tax_breakdown is not null)::text || '|food_minor:' || (food_minor is not null)::text || '|incl:' || coalesce(tax_inclusive::text,'-') || '|rate:' || coalesce(tax_rate_milli::text,'-'), count(*) from public.orders group by 2
union all select 'payment_on_pending', o.status || '|' || p.kind || '/' || p.channel, count(*) from public.order_payments p join public.orders o on o.order_key = p.order_key where o.status in ('pending') group by 2
union all select 'deals_nonempty', (jsonb_typeof(deals) = 'array' and jsonb_array_length(deals) > 0)::text, count(*) from public.orders group by 2
union all select 'currency', coalesce(currency,'(null)'), count(*) from public.orders group by 2
order by 1, 2;
```

**A2** (2026-11-25 07:56 UTC)

```sql
select string_agg(column_name, ', ' order by ordinal_position) as cols from information_schema.columns where table_schema = 'public' and table_name = 'orders';
```

**A3** (2026-11-25 08:00 UTC)

```sql
select 'item_key' as k, e.key as v, count(*) as n from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]' end) it, jsonb_each(case when jsonb_typeof(it) = 'object' then it else '{}' end) e group by 2
union all select 'item_value_types', coalesce(jsonb_typeof(it -> 'unit_price'), 'absent') || '/' || coalesce(jsonb_typeof(it -> 'quantity'), 'absent') || '/' || coalesce(jsonb_typeof(it -> 'price'), 'absent'), count(*) from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.items) = 'array' then o.items else '[]' end) it group by 2
union all select 'legacy_totals', (subtotal is not null)::text || '|' || (total_minor is not null)::text || '|' || (discount_amt is not null and discount_amt <> 0)::text, count(*) from public.orders where food_minor is null group by 2
union all select 'food_vs_subtotal', (food_minor = round((subtotal - coalesce(discount_amt, 0)) * 100))::text, count(*) from public.orders where food_minor is not null group by 2
union all select 'van_id_type', data_type, null from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'van_id'
order by 1, 2;
```

**A4** (2026-11-25 08:01 UTC)

```sql
select (total_minor = food_minor + coalesce(tax_minor, 0) + coalesce(tip_minor, 0) + coalesce(service_fee_minor, 0) + coalesce(card_surcharge_minor, 0))::text as total_identity, tax_inclusive, count(*) as n
from public.orders where food_minor is not null group by 1, 2
union all
select 'legacy: total_minor = round(total*100) / total = subtotal - discount', null, count(*) filter (where (total_minor is null or total_minor = round(total * 100)) and total = subtotal - coalesce(discount_amt, 0)) from public.orders where food_minor is null
union all
select 'legacy count', null, count(*) from public.orders where food_minor is null;
```

**A5** (2026-11-25 08:07 UTC)

```sql
select 'trigger' as k, c.relname || ' · ' || t.tgname as v, pg_get_triggerdef(t.oid) as d from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname in ('trucks', 'truck_vans', 'orders', 'order_payments') and c.relnamespace = 'public'::regnamespace and not t.tgisinternal
union all select 'fn', p.proname, left(p.prosrc, 600) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('orders_fill_currency_country', 'orders_stamp_vat_regime')
union all select 'truck_vans_cols', string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, '-'), ', ' order by ordinal_position), null from information_schema.columns where table_schema = 'public' and table_name = 'truck_vans'
union all select 'order_money_types', string_agg(column_name || ':' || data_type, ', '), null from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('subtotal', 'total', 'discount_amt', 'total_minor', 'food_minor', 'tax_minor', 'tax_rate_milli', 'tip_minor', 'service_fee_minor', 'card_surcharge_minor')
union all select 'truck_A', t.id || ' · ' || coalesce(t.country, '-') || ' · ' || coalesce(t.currency, '-') || ' · vans=' || (select count(*) from public.truck_vans v where v.truck_id = t.id), null from public.trucks t where t.id in ('demo-mk65q66spjck0g9mxt50btfxtr', 'test-truck-2')
order by 1, 2;
```

**A6** (2026-11-25 08:13 UTC)

```sql
select (p.prosrc ~* '\mexception\M') as has_exception_block, (p.prosrc ~* 'insert\s+into\s+(public\.)?orders') as inserts_orders, (p.prosrc ~* 'update\s+(public\.)?orders') as updates_orders, length(p.prosrc) as len, (select string_agg(m[1], ' | ') from regexp_matches(p.prosrc, '(exception\s+when[^;]{0,80})', 'gi') m) as handlers from pg_proc p where p.oid = 'public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure;
```

**A7** (2026-11-25 08:14 UTC)

```sql
select column_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('source', 'order_type', 'status', 'payment_status', 'id', 'customer_name', 'currency', 'items') order by 1;
```

**A8** (2026-11-25 09:49 UTC)

```sql
select now() as db_now, max(created_at) as last_order, max(updated_at) as last_order_update, (select max(created_at) from public.order_payments) as last_payment from public.orders;
```

**A9** (2026-11-25 09:50 UTC)

```sql
select column_name, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('food_minor','tax_minor','tax_rate_milli','tax_inclusive','tax_label','tip_minor','service_fee_minor','card_surcharge_minor','card_fee_payer','total_minor','subtotal','total','discount_amt') order by 1;
```

**A10** (2026-11-25 10:00 UTC)

```sql
select now() as db_now, max(created_at) as last_order, max(updated_at) as last_order_update, (select max(created_at) from public.order_payments) as last_payment, (select count(*) from public.orders where updated_at > now() - interval '30 minutes') as touched_30m from public.orders;
```

**A11** (2026-11-25 10:00 UTC)

```sql
select 'tables' as k, string_agg(relname || ':' || relrowsecurity, ', ' order by relname) as v from pg_class where relnamespace = 'public'::regnamespace and relname like 'till\_%' and relkind = 'r'
union all select 'seal_columns_on_orders_or_payments', coalesce(string_agg(table_name || '.' || column_name, ', '), 'none') from information_schema.columns where table_schema = 'public' and table_name in ('orders', 'order_payments') and column_name like 'seal%'
union all select 'triggers', string_agg(c.relname || '.' || t.tgname || ':' || case when (t.tgtype & 2) = 2 then 'before' else 'after' end, ', ' order by c.relname, t.tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and (t.tgname like '%till%' or t.tgname like 'action_audit_log_%')
union all select 'v2_md5 / guard / chain / seals', md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) || ' / ' || (select guard_mode from public.till_settings) || ' / ' || (select count(*) from public.till_chain) || ' / ' || (select count(*) from public.till_order_seals)
union all select 'failures / guard_events', (select count(*) from public.till_failures)::text || ' / ' || (select count(*) from public.till_guard_events);
```

**A12** (2026-11-25 12:46 UTC)

```sql
select now() as db_now, (select count(*) from public.till_chain) as chain, (select count(*) from public.till_order_seals) as seals, (select count(*) from public.till_failures) as failures, (select count(*) from public.till_guard_events) as guard_events, (select max(created_at) from public.orders) as last_order, (select max(created_at) from public.order_payments) as last_payment;
```

### B · One --preflight-till-1 run (10:00 UTC, the committed file; the 09:51 run sent the same 41; the two failed runs the first 22)

Parameters follow `-- params`. Long statements are referenced by their committed source.

```sql
-- 1 [counts-before]
set statement_timeout = '5s';

-- 2 [counts-before]
set lock_timeout = '3s';

-- 3 [counts-before]
begin;

-- 4 [counts-before]
set transaction read only;

-- 5 [counts-before]
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 6 [counts-before]
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 7 [counts-before]
rollback;

-- 8 [till-counts-before]
set statement_timeout = '5s';

-- 9 [till-counts-before]
set lock_timeout = '3s';

-- 10 [till-counts-before]
begin;

-- 11 [till-counts-before]
set transaction read only;

-- 12 [till-counts-before]
select to_regclass('public.till_chain') is not null as has;

-- 13 [till-counts-before]
rollback;

-- 14 [preflight]
set statement_timeout = '5s';

-- 15 [preflight]
set lock_timeout = '3s';

-- 16 [preflight]
begin;

-- 17 [guard]
select id, plan, is_customer from public.trucks where id = any($1) order by id   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 18 [preflight]
-- (the migration file, verbatim — 63072 chars; supabase/migrations/20261129_till_pack_1.sql at 488ab5df)

-- 19 [preflight]
select (select count(*) from public.orders where xmin::text = (pg_current_xact_id()::xid)::text)::int as orders, (select count(*) from public.order_payments where xmin::text = (pg_current_xact_id()::xid)::text)::int as order_payments, (select count(*) from public.action_audit_log where xmin::text = (pg_current_xact_id()::xid)::text)::int as action_audit_log, (select count(*) from public.trucks where xmin::text = (pg_current_xact_id()::xid)::text)::int as trucks;

-- 20 [preflight]
-- (tillHelpers() + tillHelpersVat() + tillProbe() in scripts/db-rollback-proofs.cjs — 9131 chars)

-- 21 [preflight]
-- (tillProofBlock() in scripts/db-rollback-proofs.cjs: one do $proof$ … $proof$ block — 40085 chars)

-- 22 [preflight]
select label, ok, detail from _till_proof order by n;

-- 23 [preflight]
select (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_settings','till_chain','till_chain_heads','till_order_seals','till_failures','till_guard_events')) as rls_on, (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_settings','till_chain','till_chain_heads','till_order_seals','till_failures','till_guard_events'))::int as tables, has_table_privilege('anon', 'public.till_chain', 'SELECT') or has_table_privilege('authenticated', 'public.till_chain', 'SELECT') or has_table_privilege('anon', 'public.till_order_seals', 'SELECT') or has_table_privilege('authenticated', 'public.till_order_seals', 'SELECT') as api_reads, (select bool_or(has_table_privilege('service_role', t, p)) from unnest(array['public.till_chain', 'public.till_chain_heads', 'public.till_order_seals']) t, unnest(array['INSERT', 'UPDATE', 'DELETE']) p) as service_writes, has_table_privilege('service_role', 'public.action_audit_log', 'UPDATE') or has_table_privilege('service_role', 'public.action_audit_log', 'DELETE') as service_changes_audit, has_table_privilege('service_role', 'public.action_audit_log', 'INSERT') as service_inserts_audit, has_function_privilege('anon', 'public.till_append(text,text,text,integer,text,date,jsonb,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_append(text,text,text,integer,text,date,jsonb,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_write(text,text,text,integer,text,date,jsonb,jsonb,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_seal(uuid,text)', 'EXECUTE') as api_appends, has_function_privilege('service_role', 'public.till_baseline(text)', 'EXECUTE') as service_baseline, has_function_privilege('service_role', 'public.till_verify(text)', 'EXECUTE') and not has_function_privilege('anon', 'public.till_verify(text)', 'EXECUTE') as verify_service_only, (select guard_mode from public.till_settings) as guard_mode, (select software_version from public.till_settings) as software_version, md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5, (select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('orders', 'order_payments') and column_name like 'seal%')::int as seal_columns, (select string_agg(c.relname || '.' || t.tgname || ':' || case when (t.tgtype & 2) = 2 then 'before' else 'after' end, ',' order by c.relname, t.tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgname like '%till%' and c.relname in ('orders', 'order_payments', 'trucks')) as till_triggers;

-- 24 [preflight]
set local timezone = 'UTC';

-- 25 [preflight]
select truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version from public.till_chain where truck_id = $1 order by seq   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 26 [preflight]
select row_to_json(o)::text as row, public.till_sealed_order(o)::text as sealed from public.orders o where o.truck_id = $1 order by o.created_at, o.order_key   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 27 [preflight]
select row_to_json(p)::text as row, public.till_sealed_payment(p)::text as sealed from public.order_payments p where p.truck_id = $1 order by p.created_at, p.id   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 28 [preflight]
rollback;

-- 29 [counts-after]
set statement_timeout = '5s';

-- 30 [counts-after]
set lock_timeout = '3s';

-- 31 [counts-after]
begin;

-- 32 [counts-after]
set transaction read only;

-- 33 [counts-after]
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 34 [counts-after]
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 35 [counts-after]
rollback;

-- 36 [till-counts-after]
set statement_timeout = '5s';

-- 37 [till-counts-after]
set lock_timeout = '3s';

-- 38 [till-counts-after]
begin;

-- 39 [till-counts-after]
set transaction read only;

-- 40 [till-counts-after]
select to_regclass('public.till_chain') is not null as has;

-- 41 [till-counts-after]
rollback;

```

### C · --till-1-check (10:00 UTC, after the apply)

Every transaction rolled back. The timing blocks repeat for each of the six operations, till off and on.

```sql
-- 1 [counts-before]
set statement_timeout = '5s';

-- 2 [counts-before]
set lock_timeout = '3s';

-- 3 [counts-before]
begin;

-- 4 [counts-before]
set transaction read only;

-- 5 [counts-before]
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 6 [counts-before]
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 7 [counts-before]
rollback;

-- 8 [till-counts-before]
set statement_timeout = '5s';

-- 9 [till-counts-before]
set lock_timeout = '3s';

-- 10 [till-counts-before]
begin;

-- 11 [till-counts-before]
set transaction read only;

-- 12 [till-counts-before]
select to_regclass('public.till_chain') is not null as has;

-- 13 [till-counts-before]
select (select count(*) from public.till_chain where truck_id = any($1))::int as till_chain, (select count(*) from public.till_chain_heads where truck_id = any($1))::int as till_heads, (select count(*) from public.till_order_seals where truck_id = any($1))::int as till_seals, (select count(*) from public.till_failures where truck_id = any($1))::int as till_failures, (select count(*) from public.till_guard_events where truck_id = any($1))::int as till_guard_events   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 14 [till-counts-before]
rollback;

-- 15 [till]
set statement_timeout = '5s';

-- 16 [till]
set lock_timeout = '3s';

-- 17 [till]
begin;

-- 18 [guard]
select id, plan, is_customer from public.trucks where id = any($1) order by id   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 19 [till]
-- (tillHelpers() + tillHelpersVat() in scripts/db-rollback-proofs.cjs — 8439 chars)

-- 20 [till]
-- (tillProofBlock() in scripts/db-rollback-proofs.cjs: one do $proof$ … $proof$ block — 37292 chars)

-- 21 [till]
select label, ok, detail from _till_proof order by n;

-- 22 [till]
select (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_settings','till_chain','till_chain_heads','till_order_seals','till_failures','till_guard_events')) as rls_on, (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_settings','till_chain','till_chain_heads','till_order_seals','till_failures','till_guard_events'))::int as tables, has_table_privilege('anon', 'public.till_chain', 'SELECT') or has_table_privilege('authenticated', 'public.till_chain', 'SELECT') or has_table_privilege('anon', 'public.till_order_seals', 'SELECT') or has_table_privilege('authenticated', 'public.till_order_seals', 'SELECT') as api_reads, (select bool_or(has_table_privilege('service_role', t, p)) from unnest(array['public.till_chain', 'public.till_chain_heads', 'public.till_order_seals']) t, unnest(array['INSERT', 'UPDATE', 'DELETE']) p) as service_writes, has_table_privilege('service_role', 'public.action_audit_log', 'UPDATE') or has_table_privilege('service_role', 'public.action_audit_log', 'DELETE') as service_changes_audit, has_table_privilege('service_role', 'public.action_audit_log', 'INSERT') as service_inserts_audit, has_function_privilege('anon', 'public.till_append(text,text,text,integer,text,date,jsonb,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_append(text,text,text,integer,text,date,jsonb,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_write(text,text,text,integer,text,date,jsonb,jsonb,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_seal(uuid,text)', 'EXECUTE') as api_appends, has_function_privilege('service_role', 'public.till_baseline(text)', 'EXECUTE') as service_baseline, has_function_privilege('service_role', 'public.till_verify(text)', 'EXECUTE') and not has_function_privilege('anon', 'public.till_verify(text)', 'EXECUTE') as verify_service_only, (select guard_mode from public.till_settings) as guard_mode, (select software_version from public.till_settings) as software_version, md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5, (select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('orders', 'order_payments') and column_name like 'seal%')::int as seal_columns, (select string_agg(c.relname || '.' || t.tgname || ':' || case when (t.tgtype & 2) = 2 then 'before' else 'after' end, ',' order by c.relname, t.tgname) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and t.tgname like '%till%' and c.relname in ('orders', 'order_payments', 'trucks')) as till_triggers;

-- 23 [till]
set local timezone = 'UTC';

-- 24 [till]
select truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version from public.till_chain where truck_id = $1 order by seq   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 25 [till]
select row_to_json(o)::text as row, public.till_sealed_order(o)::text as sealed from public.orders o where o.truck_id = $1 order by o.created_at, o.order_key   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 26 [till]
select row_to_json(p)::text as row, public.till_sealed_payment(p)::text as sealed from public.order_payments p where p.truck_id = $1 order by p.created_at, p.id   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 27 [till]
rollback;

-- 28 [c1]
set statement_timeout = '5s';

-- 29 [c1]
set lock_timeout = '3s';

-- 30 [c1]
begin;

-- 31 [c1]
set local till.include_demo = 'on';

-- 32 [c1]
-- (tillHelpers() + tillHelpersVat() in scripts/db-rollback-proofs.cjs — 7330 chars)

-- 33 [c2]
set statement_timeout = '5s';

-- 34 [c2]
set lock_timeout = '3s';

-- 35 [c2]
begin;

-- 36 [c2]
set local till.include_demo = 'on';

-- 37 [c2]
-- (tillHelpers() + tillHelpersVat() in scripts/db-rollback-proofs.cjs — 7330 chars)

-- 38 [c3]
set statement_timeout = '5s';

-- 39 [c3]
set lock_timeout = '3s';

-- 40 [c3]
begin;

-- 41 [c3]
set local till.include_demo = 'on';

-- 42 [c3]
-- (tillHelpers() + tillHelpersVat() in scripts/db-rollback-proofs.cjs — 7330 chars)

-- 43 [c4]
set statement_timeout = '5s';

-- 44 [c4]
set lock_timeout = '3s';

-- 45 [c4]
begin;

-- 46 [c4]
set local till.include_demo = 'on';

-- 47 [c4]
-- (tillHelpers() + tillHelpersVat() in scripts/db-rollback-proofs.cjs — 7330 chars)

-- 48 [c2]
select pg_temp.rbp_promote('demo-mk65q66spjck0g9mxt50btfxtr') as k;

-- 49 [c4]
select pg_temp.rbp_promote('demo-mk65q66spjck0g9mxt50btfxtr') as k;

-- 50 [c1]
select pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null) as k;

-- 51 [c2]
select pg_temp.rbp_pay('70a840b4-fcce-4c30-b504-08cc88ccfe1e', 'charge', 'in_person_other', 'cash', 500, null) as id;

-- 52 [c3]
select pg_temp.rbp_walkup('test-truck-2', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null) as k;

-- 53 [c3]
select pg_temp.rbp_pay('f0d2720b-29a6-402e-83e0-65debaa0e701', 'charge', 'in_person_other', 'cash', 500, null) as id;

-- 54 [c3]
select count(*) as n from public.till_chain where truck_id = $1   -- params ["test-truck-2"];

-- 55 [c1]
rollback;

-- 56 [c2]
select count(*)::int as n from public.till_chain where truck_id = $1 and kind = 'payment' and ref = $2   -- params ["demo-mk65q66spjck0g9mxt50btfxtr","a6fd3a12-c5da-4101-af00-5c75aaf578a6"];

-- 57 [c4]
select pg_temp.rbp_pay('95d31df1-32f9-440a-ac26-1bb4c077ffe8', 'charge', 'in_person_other', 'cash', 500, null) as id;

-- 58 [c4]
select sqlstate from public.till_failures where ref = $1   -- params ["a61afee8-3ca1-42bc-bb61-0aa28fad3dd2"];

-- 59 [c4]
select count(*)::int as n from public.order_payments where id = $1   -- params ["a61afee8-3ca1-42bc-bb61-0aa28fad3dd2"];

-- 60 [c1]
rollback;

-- 61 [c2]
rollback;

-- 62 [c3]
rollback;

-- 63 [c4]
rollback;

-- 64 [timing]
set statement_timeout = '5s';

-- 65 [timing]
set lock_timeout = '3s';

-- 66 [timing]
begin;

-- 67 [guard]
select id, plan, is_customer from public.trucks where id = any($1) order by id   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 68 [timing]
-- (tillHelpers() + tillHelpersVat() in scripts/db-rollback-proofs.cjs — 7330 chars)

-- 69 [timing]
savepoint t;

-- 70 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', '', true); t0 := clock_timestamp(); for i in 1..40 loop k := pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop; insert into _till_proof (label, ok, detail) values ('timing insert_accepted off', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 71 [timing]
select detail from _till_proof where label = $1   -- params ["timing insert_accepted off"];

-- 72 [timing]
rollback to savepoint t;

-- 73 [timing]
savepoint t;

-- 74 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', 'on', true); t0 := clock_timestamp(); for i in 1..40 loop k := pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop; insert into _till_proof (label, ok, detail) values ('timing insert_accepted on', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 75 [timing]
select detail from _till_proof where label = $1   -- params ["timing insert_accepted on"];

-- 76 [timing]
rollback to savepoint t;

-- 77 [timing]
savepoint t;

-- 78 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', '', true); t0 := clock_timestamp(); for i in 1..40 loop k := pg_temp.rbp_promote('demo-mk65q66spjck0g9mxt50btfxtr'); end loop; insert into _till_proof (label, ok, detail) values ('timing insert_pending off', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 79 [timing]
select detail from _till_proof where label = $1   -- params ["timing insert_pending off"];

-- 80 [timing]
rollback to savepoint t;

-- 81 [timing]
savepoint t;

-- 82 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', 'on', true); t0 := clock_timestamp(); for i in 1..40 loop k := pg_temp.rbp_promote('demo-mk65q66spjck0g9mxt50btfxtr'); end loop; insert into _till_proof (label, ok, detail) values ('timing insert_pending on', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 83 [timing]
select detail from _till_proof where label = $1   -- params ["timing insert_pending on"];

-- 84 [timing]
rollback to savepoint t;

-- 85 [timing]
savepoint t;

-- 86 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', '', true); for i in 1..40 loop ks := ks || pg_temp.rbp_promote('demo-mk65q66spjck0g9mxt50btfxtr'); end loop; t0 := clock_timestamp(); for i in 1..40 loop update public.orders set status = 'confirmed' where order_key = ks[i]; end loop; insert into _till_proof (label, ok, detail) values ('timing accept off', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 87 [timing]
select detail from _till_proof where label = $1   -- params ["timing accept off"];

-- 88 [timing]
rollback to savepoint t;

-- 89 [timing]
savepoint t;

-- 90 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', 'on', true); for i in 1..40 loop ks := ks || pg_temp.rbp_promote('demo-mk65q66spjck0g9mxt50btfxtr'); end loop; t0 := clock_timestamp(); for i in 1..40 loop update public.orders set status = 'confirmed' where order_key = ks[i]; end loop; insert into _till_proof (label, ok, detail) values ('timing accept on', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 91 [timing]
select detail from _till_proof where label = $1   -- params ["timing accept on"];

-- 92 [timing]
rollback to savepoint t;

-- 93 [timing]
savepoint t;

-- 94 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', '', true); for i in 1..40 loop ks := ks || pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop; t0 := clock_timestamp(); for i in 1..40 loop perform pg_temp.rbp_pay(ks[i], 'charge', 'in_person_other', 'cash', 500, null); end loop; insert into _till_proof (label, ok, detail) values ('timing payment off', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 95 [timing]
select detail from _till_proof where label = $1   -- params ["timing payment off"];

-- 96 [timing]
rollback to savepoint t;

-- 97 [timing]
savepoint t;

-- 98 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', 'on', true); for i in 1..40 loop ks := ks || pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop; t0 := clock_timestamp(); for i in 1..40 loop perform pg_temp.rbp_pay(ks[i], 'charge', 'in_person_other', 'cash', 500, null); end loop; insert into _till_proof (label, ok, detail) values ('timing payment on', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 99 [timing]
select detail from _till_proof where label = $1   -- params ["timing payment on"];

-- 100 [timing]
rollback to savepoint t;

-- 101 [timing]
savepoint t;

-- 102 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', '', true); for i in 1..40 loop ks := ks || pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop; t0 := clock_timestamp(); for i in 1..40 loop update public.orders set status = 'cooking' where order_key = ks[i]; end loop; insert into _till_proof (label, ok, detail) values ('timing kitchen_move off', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 103 [timing]
select detail from _till_proof where label = $1   -- params ["timing kitchen_move off"];

-- 104 [timing]
rollback to savepoint t;

-- 105 [timing]
savepoint t;

-- 106 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', 'on', true); for i in 1..40 loop ks := ks || pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop; t0 := clock_timestamp(); for i in 1..40 loop update public.orders set status = 'cooking' where order_key = ks[i]; end loop; insert into _till_proof (label, ok, detail) values ('timing kitchen_move on', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 107 [timing]
select detail from _till_proof where label = $1   -- params ["timing kitchen_move on"];

-- 108 [timing]
rollback to savepoint t;

-- 109 [timing]
savepoint t;

-- 110 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', '', true); for i in 1..40 loop ks := ks || pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop; t0 := clock_timestamp(); for i in 1..40 loop perform pg_temp.rbp_set_items(ks[i], '[{"name":"Crêpe","quantity":2,"unit_price":5}]'); end loop; insert into _till_proof (label, ok, detail) values ('timing edit_sealed off', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 111 [timing]
select detail from _till_proof where label = $1   -- params ["timing edit_sealed off"];

-- 112 [timing]
rollback to savepoint t;

-- 113 [timing]
savepoint t;

-- 114 [timing]
do $t$ declare t0 timestamptz; k uuid; ks uuid[] := '{}'; i int; begin perform set_config('till.include_demo', 'on', true); for i in 1..40 loop ks := ks || pg_temp.rbp_walkup('demo-mk65q66spjck0g9mxt50btfxtr', current_date, '[{"name":"Crêpe","quantity":1,"unit_price":5}]', 'confirmed', 'rollback proof', null, null, null, null); end loop; t0 := clock_timestamp(); for i in 1..40 loop perform pg_temp.rbp_set_items(ks[i], '[{"name":"Crêpe","quantity":2,"unit_price":5}]'); end loop; insert into _till_proof (label, ok, detail) values ('timing edit_sealed on', true, (extract(epoch from clock_timestamp() - t0) * 1000 / 40)::numeric(10,3)::text); end $t$;

-- 115 [timing]
select detail from _till_proof where label = $1   -- params ["timing edit_sealed on"];

-- 116 [timing]
rollback to savepoint t;

-- 117 [timing]
rollback;

-- 118 [counts-after]
set statement_timeout = '5s';

-- 119 [counts-after]
set lock_timeout = '3s';

-- 120 [counts-after]
begin;

-- 121 [counts-after]
set transaction read only;

-- 122 [counts-after]
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 123 [counts-after]
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 124 [counts-after]
rollback;

-- 125 [till-counts-after]
set statement_timeout = '5s';

-- 126 [till-counts-after]
set lock_timeout = '3s';

-- 127 [till-counts-after]
begin;

-- 128 [till-counts-after]
set transaction read only;

-- 129 [till-counts-after]
select to_regclass('public.till_chain') is not null as has;

-- 130 [till-counts-after]
select (select count(*) from public.till_chain where truck_id = any($1))::int as till_chain, (select count(*) from public.till_chain_heads where truck_id = any($1))::int as till_heads, (select count(*) from public.till_order_seals where truck_id = any($1))::int as till_seals, (select count(*) from public.till_failures where truck_id = any($1))::int as till_failures, (select count(*) from public.till_guard_events where truck_id = any($1))::int as till_guard_events   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 131 [till-counts-after]
rollback;

```

### D · The apply

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261129_till_pack_1.sql
-- one transaction: the file at 488ab5df, verbatim (sha256 fcc85a4d77df5f12)
```
