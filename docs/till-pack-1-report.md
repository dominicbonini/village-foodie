# till-pack-1 — the tamper-evident chain, observe mode

**Status (25 November 2026, 00:30 UTC): built, committed and pre-flighted (29/29, rolled back). NOT APPLIED.**

`scripts/db-migrate.cjs` refused the file before connecting to the database:

> `20261129_till_pack_1.sql updates/deletes a protected table — STOP and ask Dominic first (then pass --approved-by-dominic)`

The match is `update public.orders set sealed_at …` inside the trigger function `till_seal_order` (§9). I did not bypass the
refusal. It is the one decision open with you (§1). `--till-1-check` (the two-connection proof, the timings and the per-insert
overhead) needs the migration applied, so it has **not run yet**. §8 says what it will measure.

Branch `france-vat-1`, commits on top of 107e5d83 (france-privacy-2):

| Commit | What |
|---|---|
| 5f1a5a1d | migration 20261129 (the chain in observe mode) and its rolled-back proofs |
| 512363c4 | the offline proofs: harness, sealed-form mirror, offline chain verifier; `_other_keys` sorted in byte order (`collate "C"`) |
| 5d41413e | one `revoke` per function (the repo guard `migration-function-grants.cjs` reads one signature per statement); pre-flight re-run, exports refreshed |

Nothing is deployed and nothing is pushed. No route, screen, email, ticket, landing page or `outreach_templates` row changed.

---

## 0 · Prompt check

- Nothing arrived garbled.
- **One difference from the prompt's wording, not a contradiction.** §7 row 3 of till-pack-0 says "collect … each chain exactly
  one entry plus the order version". The collect route books the **payment first, then the status**. So a collect chains one
  payment entry, then the order twice:
  - v1 `first_payment`, at the payment;
  - v2 `state_change`, at the move to collected.

  That is Q1 as decided (seal at first payment, a final state or the close, whichever comes first). The status change after the
  seal is a real new state, so it gets its own version. Proof 2c proves exactly this. Mark paid, online charge and refund each
  match the row's wording.
- **A small inconsistency inside till-pack-0, resolved by its §8.** §7 row 2 lists `order_payments.reverses_payment_id` and
  `reason` among the new columns. §8's till-pack-1 row lists only "two columns on orders", and the reversal rows are
  till-pack-2's work. I followed §8: **pack-1 adds no column to `order_payments`.** Pack-2 adds both.
- I read `docs/till-pack-0-report.md` and `docs/france-privacy-2-report.md` and wrote to neither.

---

## 1 · The decision open with you

**May I apply the migration with `--approved-by-dominic`?**

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261129_till_pack_1.sql --approved-by-dominic
```

- **What the flagged statement does.** It is in the body of `till_seal_order(uuid, text)`:

  ```sql
  update public.orders set sealed_at = now(), sealed_version = … where order_key = p_key;
  ```

  - It runs only inside the till triggers, when an order is sealed: its first payment, its final state, or `till_baseline`
    (built, not run).
  - It writes only the two new nullable columns of that one order.
  - It keeps `updated_at` as it was. The guard recognises it by the transaction-local setting `till.internal` = the order key.
- **Applying the migration changes no existing row.** It creates tables, functions, triggers and two nullable columns with no
  default, and inserts the one `till_settings` row.
- **The side effect:** each seal is an `orders` UPDATE, so Supabase Realtime sends one extra UPDATE event for that order. The
  dashboards already refetch on every order change. Pack-0 §7 said the version entries go only to the unpublished `till_chain`.
  That is still true of the entries, but the `sealed_at` stamp is on `orders`.

If you say no, the alternative is to keep the seal state in a till table and not on `orders`. That drops the
`orders.sealed_at` / `sealed_version` columns pack-0 §8 asks for. It is a design change, and the pre-flight would run again.

---

## 2 · Files changed (all mine; other sessions' files untouched)

| File | Change |
|---|---|
| `supabase/migrations/20261129_till_pack_1.sql` | **new**, ~830 lines (§3) |
| `scripts/db-rollback-proofs.cjs` | new modes `--preflight-till-1 <file>` and `--till-1-check`; till helpers, proof block, static checks S1–S7, exports, counts, concurrency (c1–c4) and timings |
| `scripts/_till-sealed-mirror.cjs` | **new** shared module: a Node mirror of `till_sealed_order` / `till_sealed_payment` and Postgres's jsonb text rules (keys by length then bytes, `", "` / `": "`, numeric scale kept). It matches the database byte for byte on the exported rows. |
| `scripts/till-verify.cjs` | **new** offline verifier: `node scripts/till-verify.cjs <chain.jsonl> [--json]`. Node and `crypto` only; no database, nothing sent anywhere. |
| `scripts/till-pack-1.cjs` | **new** harness, registered: 40 passed, 0 failed (§7) |
| `scripts/harnesses.json` | `till-pack-1.cjs` added after `france-privacy-2.cjs`; `_till-sealed-mirror.cjs` and `till-verify.cjs` added to `excluded.shared_modules` |
| `docs/till-pack-1/chain-preflight.jsonl` | 27 chain entries exported from the last pre-flight (rolled back; demo truck) |
| `docs/till-pack-1/rows-preflight.json` | the 9 orders and 7 payments behind them, raw and sealed |
| `docs/till-pack-1-report.md` | this report |

Other sessions' files I left alone:
- `docs/plans-everywhere-5-report.md` (modified);
- untracked `docs/compare-*`, `docs/deploy-prep-1-report.md`, `docs/manual-v16-35-report.md`, `docs/till-law-1-report.md`,
  `docs/till-pack-0-report.md`;
- `scripts/compare-fix-2.cjs`.

---

## 3 · The migration

`supabase/migrations/20261129_till_pack_1.sql`. Additive only; country-neutral. It has numbered sections.

**1. Tables** (RLS on; `revoke all` from anon and authenticated, and on their sequences; **no foreign key**, so a truck delete is
never blocked by the till):

| Table | What it holds |
|---|---|
| `till_settings` | one row: `guard_mode 'observe'`, `software_version '0.1.0'` |
| `till_chain` | pk `(truck_id, seq)`. Columns: kind (`order` / `payment` / `deletion` / `close` / `archive`), ref, version, payload, payload_hash, prev_hash, hash, software_version, created_at. Index `till_chain_ref_idx (truck_id, kind, ref, seq desc)`. INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER revoked from service_role. |
| `till_chain_heads` | one row per truck: the last seq and hash. Locked per truck, as `receipt_counters` is. |
| `till_failures` | truck_id, op, ref, sqlstate, message: why a till step was skipped |
| `till_guard_events` | truck_id, table_name, op, ref, event, mode, detail (jsonb of **field names only**, never values) |

**2. Columns:**
- `orders.sealed_at timestamptz`
- `orders.sealed_version integer`

Both nullable, no default.

**3–7. Functions** (EXECUTE revoked from public, anon, authenticated and service_role, one statement each; `till_verify` granted
back to service_role):

| Function | Role |
|---|---|
| `till_ts(timestamptz)` | UTC text, microseconds, `Z` |
| `till_fiscal_state(text)` | confirmed / modified / cooking / ready → `accepted`; pending / collected / cancelled / rejected as they are; else `other` |
| `till_pick`, `till_pick_all` | whitelist objects. An unknown key is **named** in `_other_keys` (byte order), never copied. The note keys `specialInstructions`, `slotNotes`, `note`, `notes` are dropped without trace. |
| `till_sealed_lines(jsonb, text)` | items and deals reduced to the whitelists of §4 |
| `till_sealed_order(orders)`, `till_sealed_payment(order_payments)` | the sealed forms (§4) |
| `till_applies(text)` | false for a `demo-%` id, plan `demo`, or a missing truck row. True for demo trucks only when `till.include_demo = 'on'`, which the proof script sets inside its rolled-back transaction. |
| `till_truck_tz(text)` | the truck's `timezone`, else its country's `default_timezone`, else UTC |
| `till_day_closed(text, date)` | true after 06:00 on D+1, truck time (Q2) |
| `till_append(…)` | locks the head row, writes the next entry |
| `till_log_failure`, `till_guard_event` | the two logs |
| `till_seal_order(uuid, text)` | writes an order version and stamps `sealed_at` / `sealed_version` |
| `till_verify(text)` | returns jsonb with: truck_id, ok, entries, gaps, bad_links, bad_payload_hashes, bad_hashes, head_ok, mismatches, mismatch_count, unsealed_orders, unchained_payments |
| `till_baseline(text default null)` | returns `{trucks, orders_sealed, payments_chained}`. **Built and proved rolled back; not run** (Q8). |

Trigger functions:

| Trigger function | Fires on | What it does |
|---|---|---|
| `till_payment_inserted` | AFTER INSERT on order_payments | chains the payment; seals the order at its first payment |
| `till_order_insert_clear` | BEFORE INSERT on orders | nulls the two seal columns |
| `till_order_inserted` | AFTER INSERT on orders | seals an order inserted in a final state |
| `till_order_guard` | BEFORE UPDATE on orders | versions or logs (below) |
| `till_order_delete_guard` | BEFORE DELETE on orders | logs and chains a deletion |
| `till_payment_guard` | BEFORE UPDATE on order_payments | logs a change to a chained payment |
| `till_payment_delete_guard` | BEFORE DELETE on order_payments | logs and chains a deletion |
| `till_refuse_change` | — | the append-only refusal, errcode **HGT01** |

**Every order-table trigger never fails a sale:**
- its work runs in its own exception block, under `set local lock_timeout = '2s'`;
- on any error it writes `till_failures`, raises a WARNING, and returns the row unchanged.

Proof 3 and c4 prove this (§6).

**The chain:**
- payload = the canonical jsonb text of the envelope `{v, kind, truck_id, ref, version, reason, trading_day, software_version,
  recorded_at, data}`;
- `payload_hash = sha256(payload)`;
- `hash = sha256(prev_hash | seq | kind | ref | payload_hash)`;
- the first `prev_hash` is 64 zeros.

**Lock order:** the order row first (`for no key update`), then the head row, so a payment and a status change on one order
cannot deadlock.

**Guard reasons** (recorded as the version's `reason`):

| Reason | When |
|---|---|
| `first_payment` | the order's first payment |
| `final_state` | the order reaches a final state |
| `state_change` | after the seal, only `fiscal_state`, `collected_at` or `placed_at` changed |
| `edit` | after the seal, other sealed fields changed, before the day's close |
| `*_after_close` | the same changes after the day's close |
| `baseline` | written by `till_baseline` |
| `recorded`, `changed`, `observed_delete` | entries for payments and deletes |

Observe-mode guard events (logged; nothing is refused):

| Event | When |
|---|---|
| `would_refuse_after_close` | a sealed field changed after the day's close (not a `placed_at`-only fill) |
| `would_refuse_delete` | a delete of a chained order or payment |
| `would_refuse_delete_unchained` | a delete of a row not yet chained |
| `would_refuse_payment_change` | a sealed field of a chained payment changed |
| `would_refuse_seal_columns` | an outside write to `sealed_at` / `sealed_version` |

A change to a non-sealed field (kitchen moves, the payment-status cache, the retention patch, notes) makes **no version**.

**Triggers** (each created only if missing):
- on `orders`: `orders_till_clear`, `orders_till_seal`, `orders_till_guard`, `orders_till_guard_delete`;
- on `order_payments`: `order_payments_till_chain`, `order_payments_till_guard`, `order_payments_till_guard_delete`;
- on `till_chain`: `till_chain_append_only`, `till_chain_no_truncate`;
- on `action_audit_log`: `action_audit_log_append_only`, `action_audit_log_no_truncate`.

**8. Grants.** One `revoke all on function … from public, anon, authenticated, service_role;` per function (24 statements), then
`grant execute on function public.till_verify(text) to service_role;`. Also
`revoke update, delete, truncate on public.action_audit_log from anon, authenticated, service_role;` (INSERT and SELECT stay).

**Untouched:** `place_order_atomic_v2`. Its md5 is still `e4b273abcf8e7609c6ca54033ed59332` with the migration in place (static
S6). A read-only VERIFY block for after the apply is in the file's closing comment.

---

## 4 · The sealed fields, exactly

**Order** (`kind = 'order'`, one entry per version), 34 fields:

`truck_id, order_key, receipt_no, id, event_date, event_id, van_id, placed_at (coalesce(placed_at, created_at)), collected_at,
source, order_type, items, deals, discount_code, discount_amt, subtotal, total, total_minor, currency, country, food_minor,
tax_minor, tax_rate_milli, tax_inclusive, tax_label, tax_breakdown, tip_minor, tip_pct_bps, service_fee_minor,
service_fee_recipient, card_surcharge_minor, card_fee_payer, vat_regime, fiscal_state`

| Part | Keys kept |
|---|---|
| item | name, quantity, unit_price, price, item_id, tax_rate_milli, cartKey, source, modifiers, upsells |
| modifier / upsell | name, price, quantity |
| deal | name, price, quantity, bundle_price, original_price, modifierExtra, deal_id, cartKey, source, slots, slotModifiers, tax_parts |
| tax part | tax_rate_milli, minor |

Any other key is listed by name in `_other_keys`.

**Payment** (`kind = 'payment'`, one entry per row, at insert), 12 fields:

`id, order_key, truck_id, kind, channel, method, amount_minor, currency, state, external_ref, livemode, created_at`

**Never sealed:**
- customer name, email and phone;
- order notes, dish notes and line notes;
- staff notes and staff ids;
- payment status cache columns;
- kitchen fields.

Proof 12a checks values and keys; harness sections A and C check the whitelist and fuzz it. So retention and account deletion
never break the chain (proof 6, harness F).

---

## 5 · Every FK and cascade, and the decision on each

Checked live (query 6 in §11), plus every database function and cron (queries 9 and 10) and the code.

| From → to | On delete | Effect with the till | Decision |
|---|---|---|---|
| `order_payments.order_key` → `orders` | CASCADE | an order delete cascades its payments. Both guards log and chain the deletes (proof 8b). | allowed in observe mode; pack-3 decides enforce |
| `order_payments.truck_id` → `trucks` | CASCADE | a truck delete cascades payments | demo trucks are outside the till (Q7). `deleteTruckCascade` deletes orders first while the truck exists, so this path is logged like proof 8b. |
| `review_requests` → `orders` | CASCADE | no till trigger on that table | no effect |
| `loyalty_stamps` → `orders` | CASCADE | no till trigger | no effect |
| `loyalty_rewards` → `orders` | SET NULL | no till trigger | no effect |
| `orders.truck_id` → `trucks` | NO ACTION | unchanged | — |
| `orders.event_id` → `truck_events` | SET NULL | `event_id` is a sealed field, and the SET NULL action fires the BEFORE UPDATE guard. So deleting an event versions each **sealed** order on it: `edit` before the close; `edit_after_close` + `would_refuse_after_close` after it. Never refused. Unsealed orders are unaffected. (From the code; not separately proved.) | accepted; noted for pack-3 |
| `orders.van_id` → `truck_vans` | SET NULL | the same as `event_id` | accepted; noted for pack-3 |
| `action_audit_log` | **no FK in either direction** | append-only can't collide with a cascade | — |
| till tables | **no FK** | a truck delete is never blocked by the till | — |

**action_audit_log append-only: no current path is blocked.**
- The code only inserts into it ([lib/audit/actionAudit.ts:81](lib/audit/actionAudit.ts#L81),
  [:97](lib/audit/actionAudit.ts#L97)) and selects from it in four places.
- No database function updates, deletes or truncates it (query 10).
- No cron touches it (query 9). The only prune is of `cron.job_run_details`.

So I did not need to stop.

**Live grants, seen and not changed:**
- anon and authenticated hold ALL privileges on `action_audit_log` and `order_payments`;
- authenticated holds ALL on `orders`.

RLS is what protects those tables today. This migration revokes only UPDATE / DELETE / TRUNCATE on `action_audit_log`.
Tightening the others is a separate decision.

---

## 6 · Proof results (pre-flight, rolled back)

Run as `npx -y -p pg@8.13.1 node scripts/db-rollback-proofs.cjs --preflight-till-1 supabase/migrations/20261129_till_pack_1.sql`.

**Method:**
- one transaction with `statement_timeout 5s` and `lock_timeout 3s`;
- the guard query confirms both trucks are demo / test;
- three statements: the migration body, the temp helpers, and one server-side DO block holding every proof;
- read-back, export, then **ROLLBACK**.

Proof trucks: `demo-mk65q66spjck0g9mxt50btfxtr` (FR, Europe/Paris) and `test-truck-2` (GB). Both had 0 orders before and after.
**Never a live trading truck.**

Runs. The time is the migration and the proofs together, which is also how long the DDL locks on `orders`, `order_payments` and
`action_audit_log` are held:

| When (UTC) | Time | Result |
|---|---|---|
| 24 Nov 23:02 | 641 ms | 5b failed: a `placed_at` fill using `now()` equalled `created_at` in the same transaction. The proof now uses `clock_timestamp()`. Rolled back. |
| 24 Nov 23:02 | 359 ms | all passed |
| 24 Nov 23:11 | 438 ms | all passed (after the `collate "C"` fix) |
| 25 Nov 00:24 | 907 ms | all passed (after the revoke split). Read-only activity check first: no order since 20 Nov 18:50 UTC, no payment since 20 Nov 20:15. |

**Last run, 29 of 29:**

| # | Proved | §7 row |
|---|---|---|
| 1 | the deployed `place_order_atomic_v2` call, the walk-up insert, the offline replay upsert (inserted, then skipped) and the card promotion insert all succeed. The seal columns stay NULL and nothing is chained. | 2 |
| 2a | mark paid: one payment entry, order sealed v1 (`first_payment`, accepted) | 3 |
| 2b | the payment cache write-back (`payment_status`, `amount_paid`) makes no version | 3, 4 |
| 2c | collect: one payment entry; order v1 at the payment, v2 at collected (`state_change`) | 3 |
| 2d | online charge: one payment entry, order sealed v1 | 3 |
| 2e | online refund: one payment entry, no new order version | 3 |
| 2f | the platform fee fill on a chained payment (not a sealed field) makes no entry and no guard event | 3, 4 |
| 3 | forced failure (`till_chain` renamed in a savepoint): the payment is **still inserted**, and `till_failures` says why (42P01) | 3 |
| 4 | the deployed undo (DELETE of the charge) still deletes; logged as a would-be refusal; chained as a deletion; the status back makes v3 | 4 |
| 5a | an edit before the close makes v2 (`edit`), with no guard event | 4 |
| 5b | three days back: a late payment is dated today. An edit makes v2 `edit_after_close` and logs `would_refuse_after_close` (allowed). The `placed_at` fill makes v3 with no guard event. | 4 |
| 6 | the retention patch (old-style: name, email, phone, note, dish note inside items; new-style: `line_notes`), the line-notes move, and account deletion's anonymisation and notes patch make **no version**. `till_verify` stays true. | 4 |
| 7 | kitchen moves (cooking, ready, back), a slot change and a buzzer make no version | 4 |
| 8 | demo trucks skipped by default: a payment, a collect and an order delete (its payment cascading) chain nothing, log nothing, and succeed | 4 |
| 8b | till on: deleting a sealed order (its payment cascading) is **allowed** in observe mode, logged for both rows, chained as two deletions; `till_verify` stays true | 4 |
| 9 | UPDATE / DELETE / TRUNCATE on `till_chain` and `action_audit_log` are refused (HGT01); an INSERT into `action_audit_log` works | 1, 5 |
| 10 | `till_baseline(truck)` seals every unsealed accepted or final order and chains every unchained payment once (`baseline`); a second run does nothing; verify true with nothing left unsealed | — (Q8) |
| 11 | a sealed field changed with the guard disabled is caught: `till_verify` false, "row differs from its sealed form" | — |
| 12a | no payload holds a name, email, phone, order / dish / line / staff note or staff id, as a value or a key | — |
| 12b | the canonical text does not depend on key order; an unknown key is named, not copied; the note key leaves no trace; 2.50 stays 2.50 | — |
| 13 | `till_verify(truck A)` at the end: ok, gap-free, every link and hash right, head matches | 3 |
| S1 | the five tables exist with RLS on | 1 |
| S2 | anon / authenticated cannot read `till_chain`; the service role cannot insert, update or delete it | 1 |
| S3 | the service role can no longer update or delete `action_audit_log`, and can still insert | 5 |
| S4 | nobody on the API can call `till_append` or `till_baseline`; `till_verify` is the service role's only | 1 |
| S5 | `guard_mode` observe, `software_version` 0.x | 4 |
| S6 | `place_order_atomic_v2` md5 `e4b273abcf8e7609c6ca54033ed59332` | 2 |
| S7 | `orders.sealed_at` / `sealed_version` nullable, no default | 2 |
| counts | both trucks' orders, payments, audit rows, slot usage, order counters, drafts, receipt counters and till tables identical before and after; `receipt_no_failures` unchanged | — |

**Still to prove after the apply (`--till-1-check`):**
- §7 row 3's **two-connection** check:
  - c1: truck B is not blocked by truck A;
  - c2–c3: A's waiter goes in after the holder's rollback;
  - c4: a holder past 2 s → the waiter's payment still goes in, with a 55P03 row in `till_failures`.
- The timings in §8.

---

## 7 · Harness and sweep

**`scripts/till-pack-1.cjs`: 40 passed, 0 failed** (~8 s; no database). Its sections:

| Section | Checks |
|---|---|
| A | the whitelist parsed from the migration equals till-pack-0's C1 / C2 |
| B | the Node mirror equals the database's sealed text on every exported row |
| C | a 600-row fuzz over 65 order and 18 payment columns: no personal key or value survives |
| D | canonical-text rules |
| E | the exported chain verifies, and **all 37,377 single-byte changes** are detected (402 also re-run through the plain verifier) |
| F | the real `retentionPatch` / `notesPatch` / `splitLineNotes` / `ANON_LABEL`, bundled with esbuild, touch no sealed field |
| G | safety statics (no FK, no FK clause, `place_order_atomic_v2` not in the file, `lib/delete-truck.ts` untouched and orders-first) |

**Sweep:** the whole registry, minus `compare-fix-2.cjs` (another session's file; the dry-run screen refuses it because it can
reach the live database). It ran once at START (107e5d83, 236 harnesses) and once at 512363c4 (237), each in its own worktree.

- START: 19 failed. 512363c4: 21. The two new ones:
  - **`migration-function-grants.cjs`: a real catch in my file.** I had one `revoke` naming 24 functions. Postgres accepts that,
    but the guard reads one signature per statement, so it reported 7 functions as never revoked. **Fixed in 5d41413e** (one
    revoke per function; the same privileges, proved behaviourally by S4); the guard now passes, 14/0.
  - **`event-types-render.cjs`: timing-flaky, not mine.** It measures dropdown font size in a browser. Re-run alone, it failed at
    HEAD (8 measurements) **and at START (2 measurements, the same check)**, after a screenshot timed out under load. My diff
    touches no CSS, component or screen.
- After 5d41413e, I re-ran every harness that reads `supabase/migrations` (60). 8 fail, all 8 failed at START, **and each fails
  on exactly the same lines.** Nothing re-pinned; no harness pins the migration list, the registry or the rollback script in a
  way this work broke.
- The worktrees are removed. The main tree's `node_modules` and `.next` are intact, and no fixture was rewritten.

---

## 8 · Per-insert overhead

**Not measured yet.** It needs the migration applied. `--till-1-check` measures it: N = 40 per mode, till off vs on, on the demo
truck, rolled back. Five operations: insert, first payment, payment on a sealed order, status change that seals, edit of a
sealed order. Output goes to `docs/till-pack-1/timings.json`. The check fails if the extra time is ≥ 20 ms.

For scale, the receipt counter's per-truck lock measured 19–20 ms in france-records-1's two-connection proof. Until then, the
only timings are the whole-migration-plus-proofs runs in §6 (359–907 ms, in one transaction).

---

## 9 · Anything undone or not done

- **Not applied.** `db-migrate.cjs` refused (§1); I did not pass `--approved-by-dominic`. The refusal happens before the script
  connects, so nothing reached the database.
- **`till_baseline` not run** (Q8: built and proved rolled back only).
- **A PGlite smoke test was refused** (`npx` of an unpinned package; the auto-mode classifier denied it). I did not work around
  it. The Node mirror, cross-checked byte for byte against the database's exports, covers the same ground.
- **Every pre-flight was rolled back.** The first failed run is described in §6.

---

## 10 · Decisions

| Q | Decision |
|---|---|
| Q1 | **Yes** (Dominic, 24 Nov): seal at first payment, a final state, or the day's close, whichever comes first |
| Q2 | **Yes** (Dominic, 24 Nov): the trading day is `event_date`; the close of D comes after 06:00 on D+1, truck time. Used here only for the sealed `trading_day`. |
| Q7 | **Yes** (Dominic, 24 Nov): plan `demo` and `demo-` ids are outside the till; the proof switches it on only inside its rollback |
| Q8 | **Yes, but not in this prompt** (Dominic, 24 Nov): baseline built and proved rolled back; not run on live data |
| Q3, Q4, Q5, Q6, Q10, Q11, Q12, Q14 | recorded as decided per till-pack-0's recommendations (§8 there), for the later packs |
| **Q9, Q13, Q15** | **still open with Dominic** (archive lifetime and the privacy line; the version name; who signs the attestation) |

---

## 11 · Every SQL statement run

**Read-only, through the Supabase MCP (24–25 Nov):** listed in full in the appendix, A1–A22. They cover:
- FKs and cascades;
- triggers;
- columns;
- cron jobs;
- functions touching `action_audit_log`;
- grants and default ACLs;
- owners;
- status and payment counts;
- item and modifier keys;
- `country_settings` columns;
- the proof trucks;
- `action_audit_log` checks;
- `place_order_atomic_v2`'s result type;
- three activity checks.

**Through `scripts/db-rollback-proofs.cjs --preflight-till-1`:** 40 statements per run, listed in the appendix, B. Three of them
are long and reproduced by reference to committed code, which is their exact text:
- the migration file;
- `tillHelpers()`;
- `tillProofBlock()`.

**`scripts/db-migrate.cjs`:** refused before connecting; no SQL ran.

---

## 12 · What till-pack-2 must know

- **Reversal rows must net to zero.**
  - `getOrderBalance` counts any refund row today, and paid 0 with a refund row reads as "refunded"
    ([lib/payments/ledger.ts:213-221](lib/payments/ledger.ts#L213-L221)).
  - Reversals must come only from the new code, and the balance must treat a `(charge, reversal)` pair as nothing.
  - Pack-2 adds `order_payments.reverses_payment_id` and `reason` (not added here).
  - A reversal row is a new INSERT, so the chain trigger records it with no change.
- **Deletion entries.** Observe mode chains every delete of a till truck's order or payment as `kind = 'deletion'`, with the
  deleted row's sealed form. Undo-by-delete (proof 4) shows up there and in `till_guard_events` as `would_refuse_delete`. Pack-2
  replaces those deletes with reversals, and that event should stop appearing.
- **Guard sqlstates.** Only HGT01 (append-only on `till_chain` and `action_audit_log`) raises today. Pack-3's enforce mode will
  raise on the `would_refuse_*` paths. The route should map HGT01 and pack-3's codes to 409.
- **`event_id` / `van_id` SET NULL.** Deleting an event or a van versions every order on it (sealed fields). After the close it
  logs `would_refuse_after_close`. Pack-3 must allow or reroute that cascade before enforcing.
- **The baseline**, after the france-notes-1 deploy:
  - one UPDATE per eligible order (≈ 2,900 accepted or final today: confirmed 1,581, collected 1,068, ready 234, …), so **a
    realtime burst of the same size**;
  - run it truck by truck at a quiet hour (`till_baseline('<truck>')`);
  - `updated_at` is kept.
- **Pre-existing payments are unchained until the baseline.** About 880 live payment rows. `till_verify` reports them as
  `unchained_payments` and the older orders as `unsealed_orders`. It is `ok` only on the chain itself.
- **The realtime event from a seal** (§1) is new traffic on `orders`. Pack-2's screens should not treat a `sealed_at`-only UPDATE
  as a content change, if any of them diff rows.

---

## Undo (only if Dominic asks)

This only applies once the migration has been applied. It drops the chain, which by design is the record of what was sealed;
once real trucks are in it, deleting it may itself be a legal problem. It takes brief exclusive locks on `orders`,
`order_payments` and `action_audit_log`.

```sql
begin;
set local lock_timeout = '3s';
drop trigger if exists orders_till_clear on public.orders;
drop trigger if exists orders_till_seal on public.orders;
drop trigger if exists orders_till_guard on public.orders;
drop trigger if exists orders_till_guard_delete on public.orders;
drop trigger if exists order_payments_till_chain on public.order_payments;
drop trigger if exists order_payments_till_guard on public.order_payments;
drop trigger if exists order_payments_till_guard_delete on public.order_payments;
drop trigger if exists action_audit_log_append_only on public.action_audit_log;
drop trigger if exists action_audit_log_no_truncate on public.action_audit_log;
grant update, delete, truncate on public.action_audit_log to anon, authenticated, service_role;
drop table if exists public.till_chain, public.till_chain_heads, public.till_failures, public.till_guard_events, public.till_settings;
drop function if exists public.till_baseline(text), public.till_verify(text), public.till_refuse_change(),
  public.till_payment_delete_guard(), public.till_payment_guard(), public.till_order_delete_guard(), public.till_order_guard(),
  public.till_order_inserted(), public.till_order_insert_clear(), public.till_payment_inserted(), public.till_seal_order(uuid, text),
  public.till_guard_event(text, text, text, text, text, jsonb), public.till_log_failure(text, text, text, text, text),
  public.till_append(text, text, text, integer, text, date, jsonb), public.till_day_closed(text, date), public.till_truck_tz(text),
  public.till_applies(text), public.till_sealed_payment(public.order_payments), public.till_sealed_order(public.orders),
  public.till_sealed_lines(jsonb, text), public.till_pick_all(jsonb, text[]), public.till_pick(jsonb, text[]),
  public.till_fiscal_state(text), public.till_ts(timestamptz);
alter table public.orders drop column if exists sealed_at, drop column if exists sealed_version;
commit;
```

---

## Appendix — SQL statements

### A · Read-only, through the Supabase MCP

**A1** (2026-11-24 22:23 UTC)

```sql
select con.conrelid::regclass as from_table, con.conname, con.confrelid::regclass as to_table, pg_get_constraintdef(con.oid) as def
from pg_constraint con
where con.contype = 'f' and (con.conrelid in ('public.action_audit_log'::regclass,'public.orders'::regclass,'public.order_payments'::regclass)
   or con.confrelid in ('public.action_audit_log'::regclass,'public.orders'::regclass,'public.order_payments'::regclass))
order by 1, 2;
```

**A2** (2026-11-24 22:23 UTC)

```sql
select c.relname as tbl, t.tgname, pg_get_triggerdef(t.oid) as def from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where c.relnamespace = 'public'::regnamespace and c.relname in ('orders','order_payments','action_audit_log','order_drafts','receipt_counters') and not t.tgisinternal order by 1, 2;
```

**A3** (2026-11-24 22:23 UTC)

```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name in ('order_payments','action_audit_log','receipt_counters','receipt_no_failures') order by table_name, ordinal_position;
```

**A4** (2026-11-24 22:23 UTC)

```sql
select jobid, jobname, schedule, command from cron.job order by jobid;
```

**A5** (2026-11-24 22:23 UTC)

```sql
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args,
  (p.prosrc ~* 'action_audit_log') as audit, (p.prosrc ~* '(update|delete\s+from|truncate)\s+(public\.)?action_audit_log') as audit_write,
  (p.prosrc ~* '(delete\s+from|truncate)\s+(public\.)?(orders|order_payments)\b') as deletes_orders
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public','pgsodium','vault','realtime','storage','auth','net','supabase_functions','pgbouncer','cron','supabase_migrations')
  and (p.prosrc ~* 'action_audit_log' or p.prosrc ~* '(delete\s+from|truncate)\s+(public\.)?(orders|order_payments)\b')
order by 2;
```

**A6** (2026-11-24 22:27 UTC)

```sql
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='orders' order by ordinal_position;
```

**A7** (2026-11-24 22:27 UTC)

```sql
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='trucks' and column_name in ('id','plan','is_customer','timezone','country','active','operator_id') order by 1;
```

**A8** (2026-11-24 22:27 UTC)

```sql
select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants where table_schema='public' and table_name in ('orders','order_payments','action_audit_log','receipt_counters','receipt_no_failures') group by 1,2 order by 2,1;
```

**A9** (2026-11-24 22:27 UTC)

```sql
select defaclrole::regrole as owner, defaclnamespace::regnamespace as schema, defaclobjtype, defaclacl::text from pg_default_acl where defaclnamespace = 'public'::regnamespace;
```

**A10** (2026-11-24 22:27 UTC)

```sql
select c.relname, a.grantee::regrole as grantee, string_agg(a.privilege_type, ',' order by a.privilege_type) as privs
from pg_class c cross join lateral aclexplode(c.relacl) a
where c.relnamespace='public'::regnamespace and c.relname in ('orders','order_payments','action_audit_log','receipt_counters','receipt_no_failures')
group by 1,2 order by 1,2;
```

**A11** (2026-11-24 22:27 UTC)

```sql
select current_user, (select rolsuper from pg_roles where rolname=current_user) as super, (select relowner::regrole from pg_class where oid='public.orders'::regclass) as orders_owner, (select relowner::regrole from pg_class where oid='public.action_audit_log'::regclass) as audit_owner, version();
```

**A12** (2026-11-24 22:30 UTC)

```sql
select 'status' as k, coalesce(status,'(null)') as v, count(*) from public.orders group by 2
union all select 'pay_kind', kind||'/'||channel||'/'||coalesce(method,'-')||'/'||state, count(*) from public.order_payments group by 2
union all select 'cs_tz_col', column_name, 1 from information_schema.columns where table_schema='public' and table_name='country_settings' and column_name ilike '%time%zone%'
union all select 'demo_trucks', case when id like 'demo-%' then 'demo- id' when plan='demo' then 'plan demo' else 'other' end, count(*) from public.trucks group by 2
union all select 'null_truck_orders', 'orders.truck_id null', count(*) from public.orders where truck_id is null
order by 1, 2;
```

**A13** (2026-11-24 22:31 UTC)

```sql
select p.proname, p.prosrc from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('set_orders_updated_at','orders_stamp_vat_regime','orders_fill_currency_country');
```

**A14** (2026-11-24 22:31 UTC)

```sql
select 'items' as arr, k, count(*) as n, min(jsonb_typeof(e->k)) as t1, max(jsonb_typeof(e->k)) as t2 from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]' end) e, jsonb_object_keys(case when jsonb_typeof(e)='object' then e else '{}' end) k group by k
union all
select 'deals', k, count(*), min(jsonb_typeof(e->k)), max(jsonb_typeof(e->k)) from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.deals)='array' then o.deals else '[]' end) e, jsonb_object_keys(case when jsonb_typeof(e)='object' then e else '{}' end) k group by k
order by 1, 2;
```

**A15** (2026-11-24 22:31 UTC)

```sql
select k, count(*) from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]' end) e, jsonb_array_elements(case when jsonb_typeof(e->'modifiers')='array' then e->'modifiers' else '[]' end) m, jsonb_object_keys(case when jsonb_typeof(m)='object' then m else '{}' end) k group by k order by k;
```

**A16** (2026-11-24 22:34 UTC)

```sql
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='country_settings' and (column_name in ('country','country_code','code','default_timezone') or column_name like '%code%') order by 1;
```

**A17** (2026-11-24 22:34 UTC)

```sql
select t.id, t.plan, t.is_customer, t.country, t.timezone, (select count(*) from public.orders o where o.truck_id=t.id) as orders, (select count(*) from public.order_payments p where p.truck_id=t.id) as payments, (select count(*) from public.action_audit_log a where a.truck_id=t.id) as audit from public.trucks t where t.id in ('demo-mk65q66spjck0g9mxt50btfxtr','test-truck-2');
```

**A18** (2026-11-24 22:57 UTC)

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.action_audit_log'::regclass and contype='c';
```

**A19** (2026-11-24 22:57 UTC)

```sql
select pg_get_function_result('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure) as result_type;
```

**A20** (2026-11-24 23:02 UTC)

```sql
select now() as db_now,
  (select count(*) from public.orders where created_at > now() - interval '30 minutes') as orders_30m,
  (select count(*) from public.orders where updated_at > now() - interval '30 minutes') as updated_30m,
  (select count(*) from public.order_payments where created_at > now() - interval '30 minutes') as payments_30m,
  (select max(created_at) from public.orders) as last_order;
```

**A21** (2026-11-24 23:11 UTC)

```sql
select now() as db_now, (select count(*) from public.orders where created_at > now() - interval '30 minutes' or updated_at > now() - interval '30 minutes') as order_activity_30m, (select count(*) from public.order_payments where created_at > now() - interval '30 minutes') as payments_30m;
```

**A22** (2026-11-25 00:23 UTC)

```sql
select now() as db_now, max(created_at) as last_order, count(*) filter (where created_at > now() - interval '30 minutes') as orders_last_30m, (select max(created_at) from public.order_payments) as last_payment from public.orders;
```

### B · One `--preflight-till-1` run (the same 40 statements every run; this is the 25 Nov 00:24 run)

Statements 18, 19 and 20 are reproduced by reference: 18 is the whole of `supabase/migrations/20261129_till_pack_1.sql` (as committed in 5d41413e), sent as one statement; 19 is `tillHelpers()` and 20 is `tillProofBlock()` in `scripts/db-rollback-proofs.cjs` (5f1a5a1d). Parameters are shown after `-- params`.

```sql
-- 1
-- [counts-before]
set statement_timeout = '5s';

-- 2
-- [counts-before]
set lock_timeout = '3s';

-- 3
-- [counts-before]
begin;

-- 4
-- [counts-before]
set transaction read only;

-- 5
-- [counts-before]
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 6
-- [counts-before]
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 7
-- [counts-before]
rollback;

-- 8
-- [till-counts-before]
set statement_timeout = '5s';

-- 9
-- [till-counts-before]
set lock_timeout = '3s';

-- 10
-- [till-counts-before]
begin;

-- 11
-- [till-counts-before]
set transaction read only;

-- 12
-- [till-counts-before]
select to_regclass('public.till_chain') is not null as has;

-- 13
-- [till-counts-before]
rollback;

-- 14
-- [preflight]
set statement_timeout = '5s';

-- 15
-- [preflight]
set lock_timeout = '3s';

-- 16
-- [preflight]
begin;

-- 17
-- [guard]
select id, plan, is_customer from public.trucks where id = any($1) order by id   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 18
-- [preflight]
-- (the migration file, verbatim — 33970 chars)

-- 19
-- [preflight]
-- (tillHelpers(): create temp table _till_proof … and the pg_temp.rbp_* helper functions)

-- 20
-- [preflight]
-- (tillProofBlock(): one do $proof$ … $proof$ block holding proofs 1–13)

-- 21
-- [preflight]
select label, ok, detail from _till_proof order by n;

-- 22
-- [preflight]
select (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_settings','till_chain','till_chain_heads','till_failures','till_guard_events')) as rls_on, (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_settings','till_chain','till_chain_heads','till_failures','till_guard_events'))::int as tables, has_table_privilege('anon', 'public.till_chain', 'SELECT') or has_table_privilege('authenticated', 'public.till_chain', 'SELECT') as api_reads_chain, has_table_privilege('service_role', 'public.till_chain', 'UPDATE') or has_table_privilege('service_role', 'public.till_chain', 'DELETE') or has_table_privilege('service_role', 'public.till_chain', 'INSERT') as service_writes_chain, has_table_privilege('service_role', 'public.action_audit_log', 'UPDATE') or has_table_privilege('service_role', 'public.action_audit_log', 'DELETE') as service_changes_audit, has_table_privilege('service_role', 'public.action_audit_log', 'INSERT') as service_inserts_audit, has_function_privilege('anon', 'public.till_append(text,text,text,integer,text,date,jsonb)', 'EXECUTE') or has_function_privilege('service_role', 'public.till_append(text,text,text,integer,text,date,jsonb)', 'EXECUTE') as api_appends, has_function_privilege('service_role', 'public.till_baseline(text)', 'EXECUTE') as service_baseline, has_function_privilege('service_role', 'public.till_verify(text)', 'EXECUTE') and not has_function_privilege('anon', 'public.till_verify(text)', 'EXECUTE') as verify_service_only, (select guard_mode from public.till_settings) as guard_mode, (select software_version from public.till_settings) as software_version, md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5, (select string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, 'none'), ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('sealed_at', 'sealed_version')) as seal_columns;

-- 23
-- [preflight]
set local timezone = 'UTC';

-- 24
-- [preflight]
select truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version from public.till_chain where truck_id = $1 order by seq   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 25
-- [preflight]
select row_to_json(o)::text as row, public.till_sealed_order(o)::text as sealed from public.orders o where o.truck_id = $1 order by o.created_at, o.order_key   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 26
-- [preflight]
select row_to_json(p)::text as row, public.till_sealed_payment(p)::text as sealed from public.order_payments p where p.truck_id = $1 order by p.created_at, p.id   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 27
-- [preflight]
rollback;

-- 28
-- [counts-after]
set statement_timeout = '5s';

-- 29
-- [counts-after]
set lock_timeout = '3s';

-- 30
-- [counts-after]
begin;

-- 31
-- [counts-after]
set transaction read only;

-- 32
-- [counts-after]
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 33
-- [counts-after]
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 34
-- [counts-after]
rollback;

-- 35
-- [till-counts-after]
set statement_timeout = '5s';

-- 36
-- [till-counts-after]
set lock_timeout = '3s';

-- 37
-- [till-counts-after]
begin;

-- 38
-- [till-counts-after]
set transaction read only;

-- 39
-- [till-counts-after]
select to_regclass('public.till_chain') is not null as has;

-- 40
-- [till-counts-after]
rollback;

```
