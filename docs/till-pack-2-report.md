# till-pack-2 — reversals instead of deletes, counter refunds, device fingerprints, the actor's role, the 409

**Status (25 November 2026): BUILT AND APPLIED.** Migration `20261133_till_pack_2.sql` went in at 13:36 UTC through `db-migrate.cjs`
(one transaction, no error; committed at 94c9628a, sha256 `83b887d6e93587dc`).

Both of your conditions were met before I applied it:
- **every rehearsal proof passed:** 24/24, rolled back, on the committed file;
- **the migration writes nothing to existing rows** of `orders`, `order_payments`, `action_audit_log` or `trucks`. Proof U0 checks this.

After the apply, `--till-2-check` passed 22/22 and `--till-1-check` passed 44/44 (including the two-connection test and the
timings), every transaction rolled back.

**Nothing new is in use yet.** The live database holds 0 reversals, 0 device rows and 0 actor rows. The application code that writes
them only takes effect when you deploy. Nothing is deployed and nothing is pushed.

Branch `france-vat-1`, starting commit 2ae128bc. My commits:

| Commit | What |
|---|---|
| 94c9628a | the build |
| de1a17c5 | applied; exports |
| e37611f2 | the webhook's actor role |
| edecaf93 | the sweep's re-pins (§8) |

Other sessions' commits landed in between and are untouched. §8 separates their effect from mine in the sweep.

---

## 0 · Prompt check

Nothing arrived garbled. Two points I read one way and want you to see.

**Q5 changes what a cancelled, counter-paid order shows, by design.**
- "Every customer-facing output and every operator screen must look and behave exactly as today", and "the same figures as today for
  every case", hold exactly for the undo and failed-refund cases (§4, §5).
- Q5 is a new recorded refund, so for **that one case** the data changes:
  - the order's payment status becomes `refunded` instead of `paid`;
  - the accountant CSV shows the money as refunded instead of kept.
- The daily-totals file already treated that money as refunded on the cancellation day, so it is unchanged.
- No screen code, email or response changes. Each Q5 refund is written **after** its cancellation's email and before its response,
  so both are byte-identical.

I read "same figures for every case" as the reversal cases, because it follows them in the prompt. **If you meant Q5 too, say so:
it is one call to remove in each of the three cancel routes.**

**Law change 7 is not built.** It requires a payment method to collect in till mode, plus a "to settle" list. It is in the READ FIRST
section, but not in "WHAT TO BUILD". It would change what an operator can do at the hatch, which this prompt rules out.

Smaller choices:
- **Counter refunds and Q5 cover `in_person_other` only** (cash, or the truck's own card machine). Tap to Pay (`in_person_stripe`) money
  would be refunded through the card processor. There are 0 live rows of it.
- **HGT02–HGT04 are reserved here** for till-pack-3's enforce mode (§7), so the routes already answer them.
- **Roles.** The customer cancellation, the event cancellation and the webhook record their refunds and reversals as `system`. A
  shared truck token, with no signed-in person, is `unknown`.

---

## 1 · How reversals are marked, and why

**A new kind: `kind = 'reversal'`.** The row also carries `reverses_payment_id`, pointing at the payment it cancels, and a `reason`. The
check constraint is widened to `charge | refund | reversal`.

**Why a new kind and not a refund row.** I checked every reader of `order_payments` on `origin/main` (5df925d8). Every one filters
`kind === 'charge'` or `kind === 'refund'` **by name**:
- `getOrderBalance`;
- the dashboard's inline sums;
- the order card;
- the accountant ledger;
- loyalty, billing and reviews;
- the manage routes.

So **the deployed code ignores a reversal row rather than reading it as a refund.** A refund-kind row would have made every undone
collection read `refunded`, which is what till-pack-0 §7 warned about.

**The rules the database enforces:**
- a reversal must point;
- only a reversal points;
- one reversal per payment (unique partial index);
- the reason is a short word, never free text;
- the pointer is `ON DELETE CASCADE`.

**Every reader nets the pair to nothing.** One helper does it: `lib/payments/reversals.ts` `netted()` / `withoutReversals()`.

| Reader | Where it nets |
|---|---|
| server ledger reads, the order balance and the collect logic | `readLedger` |
| defensive second layer | `getOrderBalance` |
| dashboard / KDS / printed ticket feed | `/api/dashboard`, before the rows leave the server, with today's columns |
| daily totals and accountant CSV | the two `/api/manage` reads |
| refunds in a period | its own query (drops refunds a reversal cancels) |
| loyalty facts, billing usage, review eligibility | their stores |

**The lemma behind "same figures".** The harness checks it on 2,000 random ledgers: what netting returns is **exactly the rows that
remained when the reversed row was deleted**, in the same order, with the same columns. With no reversal in the set, the output is the
input. So every reader sees today's rows.

### What the deployed code would show if a reversal row existed

None can exist until the new code is deployed. Harness section J runs `origin/main`'s own code on a reversal row:

| Deployed reader | What it would show |
|---|---|
| `getOrderBalance` | an undone collection reads **`paid`** (paid 500): the charge counts, the reversal is ignored. Not `refunded`. |
| accountant rows | the reversed charge counts as kept money (refunded 0, gross 500) |
| the dashboard, and its `reverseCollectionPayment` | a reversal is invisible: they select `kind = 'charge'` |
| a deployed undo (DELETE) of a charge that has a reversal | allowed: the reversal goes with it by cascade (proof T10). A rollback is never blocked. |

**That only happens if the code is rolled back after the new code has written reversals.** If you roll back, these orders would show
paid again. Reversals are kept rows, so redeploying corrects them.

---

## 2 · What changed (files, mine only)

| File | Change |
|---|---|
| `supabase/migrations/20261133_till_pack_2.sql` | **new**, applied (§3) |
| `lib/payments/reversals.ts` | **new**: the netting rule, pure and client-safe |
| `lib/payments/ledger.ts` | `PaymentKind` gains `'reversal'`. `readLedger` nets. `getOrderBalance` nets. `recordPaymentEvent` takes `reversesPaymentId` / `reason` (absent → the insert is as before) and keeps the sqlstate on its error. The collect key gets `:rN` after N reversals (none → today's key). `reverseCollectionPayment` **inserts a reversal instead of deleting**; the external-reference branch (a refund row) is unchanged. |
| `lib/payments/online.ts` | `removeFailedOnlineRefund` **reverses** the refund row instead of deleting it; a redelivered `refund.failed` writes nothing more |
| `lib/payments/refund.ts` | `refundOrder({ inPerson: { method } })`: a counter refund, ledger row only, never the card processor. `refundCounterOnCancel` (Q5) and `counterHeld`. |
| `lib/till/guard-errors.ts` | **new**: HGT01–HGT04 → `isTillGuardError` |
| `lib/till/actor-role.ts` | **new**: `tillRoleOf`, `tillHeadSeq`, `noteTillActor` |
| `lib/till/device-fingerprint.ts` | **new**: the canonical text, the device-side sha256, `parseTillDevice` |
| `lib/native/orderGate.ts` | the queued create gains `till_device` (on the queued body only; it can never stop the queue) |
| `lib/audit/actor.ts` | an additive `adminAccess` flag, set only for an admin acting on another truck. `actorKind`, the gates and the audit log are unchanged. |
| `app/api/dashboard/action/route.ts` | the two undos write reversals (audit first, as before). Q5 on cancel, after its email. The counter refund option on `refund`, which sends no customer email. The device row before a walk-up's upsert. The 409 on the correction writes and in the catch-all. The actor's role after every correction. |
| `app/api/dashboard/route.ts` | nets before sending rows to the browser, with today's columns |
| `app/api/manage/route.ts` | the daily-totals and accountant reads net; refunds in a period drop reversed refunds |
| `app/api/orders/cancel/route.ts` | Q5 after the email, role `system` |
| `app/api/events/action/route.ts` | Q5 per order after the emails, role `system` |
| the Stripe webhook route | audit and log text says "reversed"; role `system` behind the refunds it records and the failed refunds it reverses |
| `lib/loyalty/store.ts`, `lib/billing/store.ts`, `lib/reviews/store.ts` | net their payment reads |
| `messages/*.json` (60 full locales) and `messages/ns/*/errorsKitchen.json` (generated) | **one key**: `errorsKitchen.sale_closed` |
| `scripts/db-rollback-proofs.cjs` | `--preflight-till-2 <file>` and `--till-2-check` |
| `scripts/_till-sealed-mirror.cjs` | the `device` key, the till id preferring the device, the payment's pointer / reason keys |
| `scripts/till-pack-2.cjs` | **new**, registered in `scripts/harnesses.json`: 68 passed, 0 failed |
| `scripts/till-pack-1.cjs` | **re-pinned, one check** (see below) |
| `docs/till-pack-2/` | the database exports (demo truck, rolled back) |
| `docs/till-pack-1/` | re-exported by the post-apply `--till-1-check` |

**The re-pins** (all by name):
- `scripts/order-charges.cjs`: its "rpcs byte-identical to BEFORE" comparison sets aside `till_head_seq` / `till_record_actor`, the two
  best-effort role RPCs that write only till tables. Every other call must still match. 288/0.
- `scripts/_lp-till-pack-2.cjs` (new module, registered under `shared_modules`): this pack's committed edits taken back exactly, the
  pattern of `_lp-billing-1.cjs`. It is the newest layer, applied FIRST in `scripts/_moved-paths.cjs`, so every older "unchanged since …"
  harness compares every other byte. All 151 files it covers reverse exactly to START.
- `till-pack-1.cjs`'s check "no route, screen, email or ticket code names the till" now excludes `lib/till/*`. This pack
adds the till's server helpers there on purpose. The check still forbids any other app code naming the till's tables or writers.

---

## 3 · The migration

`supabase/migrations/20261133_till_pack_2.sql`:

1. **`order_payments`:**
   - `reverses_payment_id uuid references order_payments(id) on delete cascade` and `reason text`, both nullable, no default;
   - `order_payments_kind_chk` dropped and re-added as `charge | refund | reversal`, the only constraint dropped;
   - `order_payments_reversal_points_chk`: `(kind = 'reversal') = (reverses_payment_id is not null)`;
   - `order_payments_reason_word_chk`: `^[a-z_]{1,40}$`;
   - the unique partial index `order_payments_one_reversal_uidx`.
2. **New tables** (RLS on; nothing for anon / authenticated; no writes for the service role; append-only by trigger, HGT01):
   - `till_device_fingerprints`: `order_key` pk, `truck_id`, `device_id`, `fingerprint` (64 hex), `device_created_at`, `recorded_at`;
   - `till_entry_actors`: (`truck_id`, `seq`) pk, `role` in owner / staff / admin / system / unknown, `action` (a short word),
     `recorded_at`.
3. **Functions the routes call**, executable by the service role only:
   - `till_record_device`: stores nothing for a truck outside the till, or for an order that already exists;
   - `till_head_seq`;
   - `till_record_actor(truck, from_seq, order_key, action, role)`: names every entry of that order after `from_seq`, meaning its
     versions and its payment rows; it never overwrites.
4. **Replaced, with new keys only where the new data exists:**
   - `till_till_id`: van → `web` → **device id** → source → `unrecorded`;
   - `till_sealed_order`: plus `device {device_id, fingerprint, created_at}`;
   - `till_sealed_payment`: plus `reverses_payment_id` / `reason`.

   So no entry sealed before this migration stops matching (proof T12). The live chain was empty anyway.
5. **Grants:** one revoke per function; three grants to the service role.

`place_order_atomic_v2` is not touched (md5 `e4b273abcf8e7609c6ca54033ed59332`, checked before and after).

---

## 4 · What each case does now

| Case | Before | Now |
|---|---|---|
| **Undo "Mark paid" / undo collected** (no external reference) | DELETE the charge row | the charge is **kept**; one `reversal` row (reason `undo_mark_paid` / `undo_collected`) points at it. Audit first, as before. Status `unpaid`, as today. |
| Undo with an external reference (Tap to Pay) | a refund row | unchanged |
| **Re-collect after an undo** | inserted under `collect:k:0:500` (the delete had freed it) | inserted under `collect:k:0:500:r1`. Today's key is byte-identical when there is no reversal. |
| **A refund that failed** (`refund.failed`) | DELETE the refund row | the refund is **kept**; one reversal (reason `refund_failed`). The order reads `paid` again, as today. A redelivery writes nothing. |
| **Counter refund** (new, API only) | refused `not_card` | `action: 'refund'` with `refund_channel: 'in_person'` and `method: 'cash' \| 'card'`. One refund row: channel `in_person_other`, the method, the reason. Refused beyond the counter money held. No customer email; no call to the card processor. |
| **Q5: cancel a counter-paid order** | money left "paid" on a cancelled order | one counter refund row per original method, reason `order_cancelled`. Online card money is untouched (refunded through the card processor as today). An undone collection is not counter money. Written after the cancel's email. Covers the operator cancel, the customer cancel and the event cancellation. |
| **Offline walk-up** (law change 8) | — | the device computes `sha256(canonical {order_key, order, created_at})` and sends it with its stable id and that time as `till_device`, **on the queued body only**. The route stores it before the order row (`till_record_device`). The order's v1 seals `device {…}`, and `till_id` is the device id instead of `manual`. An older app sends none: nothing runs and the order seals as before. |
| **The guard's refusal** | — | HGT01–HGT04 → HTTP **409**, `errorsKitchen.sale_closed`: "This sale is closed. Record a refund instead." in all 60 enabled languages. Applied at cancel, undo collected, undo Mark paid, edit and collected, and in the route's catch-all. In observe mode nothing raises it, so nobody sees it yet. |
| **The actor's role** | — | after edit, both undos, refund / counter refund and cancel (with its Q5 refund), the role is linked to exactly the entries the correction made. Customer and event cancellations and the webhook record `system`. Only the role is stored, never a name or an id. |

---

## 5 · The proofs, with timings

**Rehearsals** (`--preflight-till-2`, one transaction, rolled back; demo trucks `demo-mk65q66spjck0g9mxt50btfxtr` (FR) and
`test-truck-2` (GB), 0 orders before and after; never a live trading truck):

| When (UTC) | Result |
|---|---|
| 13:25 | **21/24, rolled back.** My proof helper wrote test-mode payment rows, which the status check correctly ignores, so three checks failed; it also made two passes vacuous. Replaced with a live-mode helper. |
| 13:30 | **24/24**, 424 ms |
| 13:36 | **24/24** on the committed file, 428 ms, then applied |

The time is how long the DDL locks on `order_payments`, `orders`, `trucks` and `action_audit_log` were held. Every run was preceded by
a read-only check: no order since 20 Nov, chain empty.

**The 24:**

| # | Proved |
|---|---|
| T1 | a reversal without a pointer, a charge with one, a free-text reason and an unknown kind are refused (23514); a second reversal of one payment is refused (23505) |
| T2 | undo Mark paid: charge kept, one reversal, nothing deleted or logged as a delete, status `unpaid`; both chained, the reversal with its pointer and reason |
| T3 | undo collected: the same; the order back as v3 `state_change`; no deletion entry |
| T9 | the role names exactly the two entries the undo made (`staff`); a second call changes nothing |
| T9b | a name as a role, or a sentence as an action, is refused |
| T4 | a failed refund: `refunded` → reversal → `paid:500`; the refund row kept |
| T5 | collect → undo → collect: today's key collides (23505), the suffixed key goes in, paid once |
| T6 | a counter refund (cash 4.00 of 10.00): refund row with method and reason, chained; `paid:600` |
| T7 | Q5: one refund row (card, `order_cancelled`); the order `refunded`; v2 the cancellation |
| T8 | device row before the order → v1 carries it, `till_id` = device id; again, or for an existing order → nothing; an order without it seals as before (`manual`, no device key) |
| T8b | no device row for a truck outside the till |
| T10 | a rollback's old undo (DELETE of a reversed charge) is not blocked: the reversal cascades, both deletions chained, verify true |
| T11 | the two new till tables refuse UPDATE / DELETE / TRUNCATE (HGT01) |
| T12 | an order without device evidence seals exactly 37 keys; a payment without pointer / reason exactly 12 |
| T13 | `till_verify` ok in every respect at the end |
| T14 | after every step, every order and payment row carries the proof transaction's own xid: no till trigger wrote one |
| T14b | (pre-flight) a probe trigger saw no nested INSERT / UPDATE of orders or payments, only FK cascade deletes |
| U0 | the migration wrote no row of orders, order_payments, action_audit_log or trucks |
| U1–U5 | the columns (nullable, no default); the widened check and the cascading pointer; RLS / grants on the new tables; only the service role calls the three functions; the `place_order_atomic_v2` md5 |
| counts | the demo trucks' counts identical before and after |

**After the apply:**
- `--till-2-check`: 22/22, 391 ms. T11's TRUNCATE part and T14b / U0 are DDL-only.
- `--till-1-check`: 44/44, 552 ms, plus the two-connection test. Rerun because this migration replaced pack-1's sealed-form functions.

| Extra time per write (mean of 40) | |
|---|---|
| accepted insert | +6.6 ms |
| acceptance | +4.2 ms |
| payment | +2.1 ms |
| kitchen move | +0.7 ms |
| edit | +8.5 ms |
| pending insert | ≈ 0 |

All within the 20 ms limit and in line with till-pack-1b's.

**`scripts/till-pack-2.cjs`: 68 passed, 0 failed** (about 7 s). It never connects to a database or any outside service. Every bare
package except `next-intl` and `react` is an inert recording stub, so no SDK can run.

| Section | Checks |
|---|---|
| A | the migration is additive and writes nothing |
| B | the mirror = the database on both exports (device keys, pointers, reasons); the chains verify offline |
| C | the netting lemma on 2,000 random ledgers |
| D | the **real** ledger and online code, HEAD vs START, each on its own in-memory table. Undo Mark paid, undo collected, collect → undo → collect, two undos, a failed refund (once and twice): one reversal inserted, **zero deletes** (START deleted), the same payment status, amount paid and balance as START |
| E | for every case, the server's ledger read, the dashboard / KDS rows, the email payment state, the printed ticket, the accountant rows and the daily totals are **identical to START** |
| F | counter refunds cash and card; the over-limit refusal; the audit rows; no outside SDK called; the online path identical to START; Q5 per method; nothing for unpaid / online-only / undone orders; Q5 placed after every email |
| G | the fingerprint: canonical (key order irrelevant), sha256, nothing without Web Crypto or an id; strict server parsing; queued body only; the RPC before the upsert; the till id preference |
| H | the sqlstates; the 409 at every correction write and the catch-all; the message in all 60 full locales, translated and short; the catalogue in step; the role mapping; the route and webhook wiring |
| I | no `.tsx`, screen, component, ticket or email file changed; the 60 message files differ by exactly one key; the accountant, daily-totals, ticket, email-state, order card and dashboard / KDS files byte-identical to START; every reader that sums by kind nets |
| J | what `origin/main` would show (§1) |

---

## 6 · Customer outputs and screens, byte-identical (except the 409)

**Screens.** No screen, component, page, ticket or email file changed. The browser receives exactly START's rows (§1's lemma, applied
in `/api/dashboard`), so the dashboard, the KDS, the order card and the printed ticket render byte-identically. The harness checks the
ticket directly (E).

**Emails and the status page.** The cancellation, refund and ready emails, and the customer status page, read a payment state that is
identical for every reversal case (E). Each Q5 refund is written after its cancellation's email and response. A counter refund sends no
email. The status page reads `orders.payment_status`, which `recalcOrderPayment` writes from the same balance.

**The only new operator-visible thing** is the 409 message, and nothing raises it in observe mode.

---

## 7 · What till-pack-3 must know

- **Raise the reserved sqlstates in enforce mode.** Routes already map them to 409 `sale_closed`:
  - `HGT02`: a sealed sale changed after its day's close;
  - `HGT03`: a delete of a sealed order or a till truck's payment;
  - `HGT04`: a chained payment's sealed fields changed.
- **Order the undo, or make it one transaction.** `undo_collected` writes the reversal **before** reverting the status.
  - In enforce mode, after the close, the status update would be refused (409) **after** the reversal was written: the payment
    reversed, the order still collected.
  - Pack-3 must check the guard first, revert the status first, or do both in one database function.
  - The same applies to `undo_mark_paid`, which has no status write, so the reversal alone is allowed.
- **The operator edit route after a close.**
  - Editing a sealed order after 06:00 D+1 (truck time) is a version `edit_after_close` with a `would_refuse_after_close` event today.
  - In enforce mode it must be refused: the route returns 409 "This sale is closed. Record a refund instead."
  - The way out is a refund. The counter refund API exists; its screen comes with your mockups.
  - The dashboard must also stop offering edit / undo on a closed sale, or the operator meets the 409 with nothing else to do.
- **The `event_id` / `van_id` SET NULL cascade.**
  - Deleting an event or a van SET-NULLs `orders.event_id` / `van_id`, both sealed fields, so the AFTER UPDATE guard versions every
    sealed order on it. After the close it logs `would_refuse_after_close`.
  - In enforce mode, a refusal inside that cascade would make the **event or van delete itself fail**.
  - Pack-3 must exempt it: treat a SET NULL of `event_id` / `van_id` arriving through the FK cascade as allowed (the guard can see it
    via `pg_trigger_depth() > 1`, or by comparing only those two columns), or make event and van deletion a soft delete.
- **Deletions.**
  - After this pack, no code path deletes a payment: undos and failed refunds reverse.
  - `deleteTruckCascade` and demo restarts still delete (orders first; demo trucks are outside the till).
  - In enforce mode a till truck with sealed records cannot be deleted; the admin route should explain why.
- **Reversals and the close.** Pack-4's Z must count reversal pairs as nothing, and refunds (counter or online) as refunds on their own
  day. A reversal after the close of its payment's day is a late correction on the day it is recorded.
- **The actor's role** is in `till_entry_actors` (truck_id, seq). Pack-5's archive should export it beside the chain.
- **Device id.** Only offline walk-ups queued by an updated app carry one; online walk-ups stay `manual`. If you want every walk-up's
  till number to be the device, the online path needs the same `till_device`. That changes the live request body, so I didn't do it
  here.
- **Still open:** the baseline (built, not run); Q9, Q13, Q15; law change 7 (needs a screen decision).

---

## 8 · Sweep

The whole registry, minus `compare-fix-2.cjs` (another session's file; the dry-run screen refuses it because it can reach the live
database). It ran in three worktrees:

| Point | Commit | Harnesses | Failed |
|---|---|---|---|
| START | 2ae128bc (this prompt's starting commit) | 237 | 20 |
| MID | 22e885df (other sessions' tip, my first commit's parent) | 237 | 20 |
| HEAD | de1a17c5 | 238 (`till-pack-2.cjs` added) | 21 |

- **START → MID:** no difference.
- **MID → HEAD:** one new failure, `order-charges.cjs`, which is mine. Its `edit` case saw the new `till_head_seq` RPC. Re-pinned (§2).
- **Three harnesses fail at all three points but crashed at HEAD:** `costs-accounts-1`, `cwv-2`, `loyalty-1`. Their shared helper's
  reverse patch of billing-1's ledger edits no longer applied, because this pack edited `lib/payments/ledger.ts`. That is what
  `_lp-till-pack-2.cjs` fixes (§2).
- **After the re-pins, at the current tree** (e37611f2 plus the re-pins, which also covers the webhook change made after the HEAD
  sweep), I re-ran the 50 harnesses that read the payment code, the dashboard action route, the webhook or `_moved-paths.cjs`:
  - 8 fail, every one also failing at START: `billing-1`, `contact-1`, `costs-accounts-1` (77/1, as at START), `cwv-2` (42/2, as at
    START), `legal-languages-1`, `loyalty-1` (80/1, as at START), `site-chrome-1`, `tidy-1`;
  - **each fails on exactly the same lines as at START** (timings and ids masked);
  - `order-charges` 288/0, `till-pack-1` 64/0, `till-pack-2` 68/0.
- **The other 12 of START's 20 failures** are identical at all three points, line for line: `country-settings-parity`,
  `event-types-render`, `faq-1`, `france-1`, `inbox-2`, `language-phase-1b` / `1c` / `1d` / `1d2` / `1e` / `2`,
  `screenshot-truck-details`. None is caused by this work.
- The worktrees are removed. The main tree's `node_modules` and `.next` are intact, and no fixture was rewritten.

---

## 9 · Anything undone or not done

- **Law change 7** (a method required to collect in till mode; a "to settle" list): not built (§0).
- **No screen** for counter refunds or for the 409: as the prompt says, these come later with mockups.
- **Tap to Pay** money is not covered by counter refunds or Q5 (§0).
- **Online walk-ups** carry no device fingerprint (§7).
- **First rehearsal:** 21/24 with a faulty helper, rolled back; fixed and rerun.
- **Nothing reverted, nothing deployed.**

---

## 10 · SQL statements run

**A · Read-only, through the Supabase MCP:** listed in full in the appendix.
- A1: the order_payments constraints, columns and indexes, plus the till counts.
- A2: the activity check, run twice with the same text (13:25 and 13:36).
- A3: a malformed variant of A2 at 13:36 that returned no rows.
- A4: the post-apply VERIFY.

**B · The rehearsals and checks** (`scripts/db-rollback-proofs.cjs`): every statement of the last pre-flight and of `--till-2-check`
is listed in the appendix. The migration body and the proof block are referenced by their committed source.

**C · The apply:** `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261133_till_pack_2.sql`.

---

## Undo (only if Dominic asks)

Only with the till-pack-2 application code NOT deployed (or reverted first), since that code writes reversal rows and calls these functions. This drops the device rows and the actor roles. It is refused while any reversal row exists, because removing the kind would orphan
them; deleting reversals is itself a change of the money record. It takes brief exclusive locks on `order_payments` and `orders`.

```sql
begin;
set local lock_timeout = '3s';
do $$ begin if exists (select 1 from public.order_payments where kind = 'reversal') then raise exception 'reversal rows exist — stop'; end if; end $$;
drop table if exists public.till_device_fingerprints, public.till_entry_actors;
drop function if exists public.till_record_device(uuid, text, text, text, timestamptz), public.till_head_seq(text), public.till_record_actor(text, bigint, uuid, text, text);
-- restore till-pack-1b's sealed forms and till number: re-run sections 4 of supabase/migrations/20261129_till_pack_1.sql for
-- till_till_id, till_sealed_order and till_sealed_payment (create or replace), then:
drop index if exists public.order_payments_one_reversal_uidx;
alter table public.order_payments drop constraint if exists order_payments_reason_word_chk;
alter table public.order_payments drop constraint if exists order_payments_reversal_points_chk;
alter table public.order_payments drop constraint if exists order_payments_kind_chk;
alter table public.order_payments add constraint order_payments_kind_chk check (kind = any (array['charge'::text, 'refund'::text]));
alter table public.order_payments drop column if exists reverses_payment_id, drop column if exists reason;
commit;
```

---

## Appendix — SQL statements

### A · Read-only, through the Supabase MCP (this prompt)

**A1** (2026-11-25 12:57 UTC)

```sql
select 'con' as k, conname as name, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.order_payments'::regclass
union all select 'col', column_name, data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '-') from information_schema.columns where table_schema = 'public' and table_name = 'order_payments'
union all select 'idx', indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'order_payments'
union all select 'rows', kind, count(*)::text from public.order_payments group by kind
union all select 'till', 'chain/seals', (select count(*) from public.till_chain)::text || '/' || (select count(*) from public.till_order_seals)::text
order by 1, 2;
```

**A2** (2026-11-25 13:25 UTC)

```sql
select now() as db_now, (select max(created_at) from public.orders) as last_order, (select max(updated_at) from public.orders) as last_order_update, (select max(created_at) from public.order_payments) as last_payment, (select count(*) from public.till_chain) as chain;
```

**A3** (2026-11-25 13:36 UTC)

```sql
select now() as db_now, (select max(created_at) from public.orders) as last_order, (select max(updated_at) from public.orders) as last_order_update, (select max(created_at) from public.order_payments) as last_payment, (select count(*) from public.till_chain) as chain, (select count(*) from public.order_payments where updated_at_dummy is null) as x from (select 1 as updated_at_dummy) z limit 0;
```

**A4** (2026-11-25 13:36 UTC)

```sql
select 'columns' as k, string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, 'none'), ', ' order by column_name) as v from information_schema.columns where table_schema = 'public' and table_name = 'order_payments' and column_name in ('reverses_payment_id', 'reason')
union all select 'checks', string_agg(conname || ' = ' || pg_get_constraintdef(oid), ' | ' order by conname) from pg_constraint where conrelid = 'public.order_payments'::regclass and conname in ('order_payments_kind_chk', 'order_payments_reversal_points_chk', 'order_payments_reason_word_chk')
union all select 'reversals / device rows / actor rows / v2 md5', (select count(*) from public.order_payments where kind = 'reversal')::text || ' / ' || (select count(*) from public.till_device_fingerprints)::text || ' / ' || (select count(*) from public.till_entry_actors)::text || ' / ' || md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure))
union all select 'payments by kind', string_agg(kind || ':' || n, ', ') from (select kind, count(*) n from public.order_payments group by kind) z;
```

### B · The last --preflight-till-2 (13:36 UTC, the committed file; the 13:25 and 13:30 runs sent the same statements)

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
select (select count(*) from public.till_chain where truck_id = any($1))::int as till_chain, (select count(*) from public.till_chain_heads where truck_id = any($1))::int as till_heads, (select count(*) from public.till_order_seals where truck_id = any($1))::int as till_seals, (select count(*) from public.till_failures where truck_id = any($1))::int as till_failures, (select count(*) from public.till_guard_events where truck_id = any($1))::int as till_guard_events   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 14 [till-counts-before]
rollback;

-- 15 [till2-counts-before]
set statement_timeout = '5s';

-- 16 [till2-counts-before]
set lock_timeout = '3s';

-- 17 [till2-counts-before]
begin;

-- 18 [till2-counts-before]
set transaction read only;

-- 19 [till2-counts-before]
select to_regclass('public.till_entry_actors') is not null as has;

-- 20 [till2-counts-before]
rollback;

-- 21 [preflight2]
set statement_timeout = '5s';

-- 22 [preflight2]
set lock_timeout = '3s';

-- 23 [preflight2]
begin;

-- 24 [guard]
select id, plan, is_customer from public.trucks where id = any($1) order by id   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 25 [preflight2]
-- (the migration file, verbatim — 10579 chars; supabase/migrations/20261133_till_pack_2.sql at 94c9628a)

-- 26 [preflight2]
select (select count(*) from public.orders where xmin::text = (pg_current_xact_id()::xid)::text)::int as orders, (select count(*) from public.order_payments where xmin::text = (pg_current_xact_id()::xid)::text)::int as order_payments, (select count(*) from public.action_audit_log where xmin::text = (pg_current_xact_id()::xid)::text)::int as action_audit_log, (select count(*) from public.trucks where xmin::text = (pg_current_xact_id()::xid)::text)::int as trucks;

-- 27 [preflight2]
-- (tillHelpers() + till2Helpers() + tillProbe() in scripts/db-rollback-proofs.cjs — 11399 chars)

-- 28 [preflight2]
-- (till2ProofBlock() in scripts/db-rollback-proofs.cjs: one do $proof$ … $proof$ block — 19332 chars)

-- 29 [preflight2]
select label, ok, detail from _till_proof order by n;

-- 30 [preflight2]
select (select string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, 'none') || ':' || data_type, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'order_payments' and column_name in ('reverses_payment_id', 'reason')) as new_columns, (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.order_payments'::regclass and conname = 'order_payments_kind_chk') as kind_chk, (select confdeltype from pg_constraint where conrelid = 'public.order_payments'::regclass and contype = 'f' and confrelid = 'public.order_payments'::regclass) as self_fk_delete, (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_device_fingerprints', 'till_entry_actors')) as rls_on, has_table_privilege('anon', 'public.till_entry_actors', 'SELECT') or has_table_privilege('authenticated', 'public.till_device_fingerprints', 'SELECT') as api_reads, (select bool_or(has_table_privilege('service_role', t, p)) from unnest(array['public.till_device_fingerprints', 'public.till_entry_actors']) t, unnest(array['INSERT', 'UPDATE', 'DELETE']) p) as service_writes, has_function_privilege('service_role', 'public.till_record_device(uuid,text,text,text,timestamptz)', 'EXECUTE') and has_function_privilege('service_role', 'public.till_record_actor(text,bigint,uuid,text,text)', 'EXECUTE') and has_function_privilege('service_role', 'public.till_head_seq(text)', 'EXECUTE') as service_calls, has_function_privilege('anon', 'public.till_record_device(uuid,text,text,text,timestamptz)', 'EXECUTE') or has_function_privilege('authenticated', 'public.till_record_actor(text,bigint,uuid,text,text)', 'EXECUTE') or has_function_privilege('anon', 'public.till_head_seq(text)', 'EXECUTE') as api_calls, md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5;

-- 31 [preflight2]
set local timezone = 'UTC';

-- 32 [preflight2]
select truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version from public.till_chain where truck_id = $1 order by seq   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 33 [preflight2]
select row_to_json(o)::text as row, public.till_sealed_order(o)::text as sealed, (select row_to_json(d)::text from public.till_device_fingerprints d where d.order_key = o.order_key) as device from public.orders o where o.truck_id = $1 order by o.created_at, o.order_key   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 34 [preflight2]
select row_to_json(p)::text as row, public.till_sealed_payment(p)::text as sealed from public.order_payments p where p.truck_id = $1 order by p.created_at, p.id   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 35 [preflight2]
rollback;

-- 36 [counts-after]
set statement_timeout = '5s';

-- 37 [counts-after]
set lock_timeout = '3s';

-- 38 [counts-after]
begin;

-- 39 [counts-after]
set transaction read only;

-- 40 [counts-after]
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 41 [counts-after]
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 42 [counts-after]
rollback;

-- 43 [till-counts-after]
set statement_timeout = '5s';

-- 44 [till-counts-after]
set lock_timeout = '3s';

-- 45 [till-counts-after]
begin;

-- 46 [till-counts-after]
set transaction read only;

-- 47 [till-counts-after]
select to_regclass('public.till_chain') is not null as has;

-- 48 [till-counts-after]
select (select count(*) from public.till_chain where truck_id = any($1))::int as till_chain, (select count(*) from public.till_chain_heads where truck_id = any($1))::int as till_heads, (select count(*) from public.till_order_seals where truck_id = any($1))::int as till_seals, (select count(*) from public.till_failures where truck_id = any($1))::int as till_failures, (select count(*) from public.till_guard_events where truck_id = any($1))::int as till_guard_events   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 49 [till-counts-after]
rollback;

-- 50 [till2-counts-after]
set statement_timeout = '5s';

-- 51 [till2-counts-after]
set lock_timeout = '3s';

-- 52 [till2-counts-after]
begin;

-- 53 [till2-counts-after]
set transaction read only;

-- 54 [till2-counts-after]
select to_regclass('public.till_entry_actors') is not null as has;

-- 55 [till2-counts-after]
rollback;

```

### C · --till-2-check (after the apply)

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
select (select count(*) from public.till_chain where truck_id = any($1))::int as till_chain, (select count(*) from public.till_chain_heads where truck_id = any($1))::int as till_heads, (select count(*) from public.till_order_seals where truck_id = any($1))::int as till_seals, (select count(*) from public.till_failures where truck_id = any($1))::int as till_failures, (select count(*) from public.till_guard_events where truck_id = any($1))::int as till_guard_events   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 14 [till-counts-before]
rollback;

-- 15 [till2-counts-before]
set statement_timeout = '5s';

-- 16 [till2-counts-before]
set lock_timeout = '3s';

-- 17 [till2-counts-before]
begin;

-- 18 [till2-counts-before]
set transaction read only;

-- 19 [till2-counts-before]
select to_regclass('public.till_entry_actors') is not null as has;

-- 20 [till2-counts-before]
select (select count(*) from public.till_device_fingerprints where truck_id = any($1))::int as device_rows, (select count(*) from public.till_entry_actors where truck_id = any($1))::int as actor_rows, (select count(*) from public.order_payments where kind = 'reversal')::int as reversals_anywhere   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 21 [till2-counts-before]
rollback;

-- 22 [till2]
set statement_timeout = '5s';

-- 23 [till2]
set lock_timeout = '3s';

-- 24 [till2]
begin;

-- 25 [guard]
select id, plan, is_customer from public.trucks where id = any($1) order by id   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 26 [till2]
-- (tillHelpers() + till2Helpers() in scripts/db-rollback-proofs.cjs — 10707 chars)

-- 27 [till2]
-- (till2ProofBlock() in scripts/db-rollback-proofs.cjs: one do $proof$ … $proof$ block — 18818 chars)

-- 28 [till2]
select label, ok, detail from _till_proof order by n;

-- 29 [till2]
select (select string_agg(column_name || ':' || is_nullable || ':' || coalesce(column_default, 'none') || ':' || data_type, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'order_payments' and column_name in ('reverses_payment_id', 'reason')) as new_columns, (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.order_payments'::regclass and conname = 'order_payments_kind_chk') as kind_chk, (select confdeltype from pg_constraint where conrelid = 'public.order_payments'::regclass and contype = 'f' and confrelid = 'public.order_payments'::regclass) as self_fk_delete, (select bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relname in ('till_device_fingerprints', 'till_entry_actors')) as rls_on, has_table_privilege('anon', 'public.till_entry_actors', 'SELECT') or has_table_privilege('authenticated', 'public.till_device_fingerprints', 'SELECT') as api_reads, (select bool_or(has_table_privilege('service_role', t, p)) from unnest(array['public.till_device_fingerprints', 'public.till_entry_actors']) t, unnest(array['INSERT', 'UPDATE', 'DELETE']) p) as service_writes, has_function_privilege('service_role', 'public.till_record_device(uuid,text,text,text,timestamptz)', 'EXECUTE') and has_function_privilege('service_role', 'public.till_record_actor(text,bigint,uuid,text,text)', 'EXECUTE') and has_function_privilege('service_role', 'public.till_head_seq(text)', 'EXECUTE') as service_calls, has_function_privilege('anon', 'public.till_record_device(uuid,text,text,text,timestamptz)', 'EXECUTE') or has_function_privilege('authenticated', 'public.till_record_actor(text,bigint,uuid,text,text)', 'EXECUTE') or has_function_privilege('anon', 'public.till_head_seq(text)', 'EXECUTE') as api_calls, md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5;

-- 30 [till2]
set local timezone = 'UTC';

-- 31 [till2]
select truck_id, seq, kind, ref, version, payload, payload_hash, prev_hash, hash, software_version from public.till_chain where truck_id = $1 order by seq   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 32 [till2]
select row_to_json(o)::text as row, public.till_sealed_order(o)::text as sealed, (select row_to_json(d)::text from public.till_device_fingerprints d where d.order_key = o.order_key) as device from public.orders o where o.truck_id = $1 order by o.created_at, o.order_key   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 33 [till2]
select row_to_json(p)::text as row, public.till_sealed_payment(p)::text as sealed from public.order_payments p where p.truck_id = $1 order by p.created_at, p.id   -- params ["demo-mk65q66spjck0g9mxt50btfxtr"];

-- 34 [till2]
rollback;

-- 35 [counts-after]
set statement_timeout = '5s';

-- 36 [counts-after]
set lock_timeout = '3s';

-- 37 [counts-after]
begin;

-- 38 [counts-after]
set transaction read only;

-- 39 [counts-after]
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 40 [counts-after]
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 41 [counts-after]
rollback;

-- 42 [till-counts-after]
set statement_timeout = '5s';

-- 43 [till-counts-after]
set lock_timeout = '3s';

-- 44 [till-counts-after]
begin;

-- 45 [till-counts-after]
set transaction read only;

-- 46 [till-counts-after]
select to_regclass('public.till_chain') is not null as has;

-- 47 [till-counts-after]
select (select count(*) from public.till_chain where truck_id = any($1))::int as till_chain, (select count(*) from public.till_chain_heads where truck_id = any($1))::int as till_heads, (select count(*) from public.till_order_seals where truck_id = any($1))::int as till_seals, (select count(*) from public.till_failures where truck_id = any($1))::int as till_failures, (select count(*) from public.till_guard_events where truck_id = any($1))::int as till_guard_events   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 48 [till-counts-after]
rollback;

-- 49 [till2-counts-after]
set statement_timeout = '5s';

-- 50 [till2-counts-after]
set lock_timeout = '3s';

-- 51 [till2-counts-after]
begin;

-- 52 [till2-counts-after]
set transaction read only;

-- 53 [till2-counts-after]
select to_regclass('public.till_entry_actors') is not null as has;

-- 54 [till2-counts-after]
select (select count(*) from public.till_device_fingerprints where truck_id = any($1))::int as device_rows, (select count(*) from public.till_entry_actors where truck_id = any($1))::int as actor_rows, (select count(*) from public.order_payments where kind = 'reversal')::int as reversals_anywhere   -- params [["demo-mk65q66spjck0g9mxt50btfxtr","test-truck-2"]];

-- 55 [till2-counts-after]
rollback;

```

### D · The apply

```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261133_till_pack_2.sql
-- one transaction: the file at 94c9628a, verbatim (sha256 83b887d6e93587dc)
```

### E · --till-1-check after the apply

The statements of till-pack-1b's check (docs/till-pack-1b-report.md appendix C), unchanged.
