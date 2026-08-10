# Payment damage snapshot — SQL only

**Date:** 7 August 2026
**Incident:** commit `3a1d082` (14:24 BST) replaced `.eq('order_key', orderKey)` with `.eq('livemode', true)` in `readLedger`, so every balance was computed from the whole `order_payments` table. Rolled back to `6be1064` at ~19:00 BST.
**Window used throughout:** `2026-08-07 14:24:00+01` → `2026-08-07 19:00:00+01`. Every query defines it in a `w` CTE on the first line — widen it there if the rollback landed later.
**Mode:** read-only. Every statement below is a `SELECT`. No `UPDATE`, `DELETE`, `INSERT`, `ALTER` or `DO` block appears anywhere in this document. Nothing in the repo was changed.

---

## 🔴 Read this before the weekend

**Two things can destroy the evidence, and one of them is a single operator tap.**

**1. `undo_collected` clears BOTH `paid_at` and `collected_at`.** [app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts) — *"paid_at AND collected_at are BOTH cleared (V9.4)"* — and it also nulls `status_before_collected` and bumps `updated_at` to *now*. So if an operator taps **↩ Undo** on any affected order, that order **drops out of every query below that is keyed on those timestamps**, and its `updated_at` moves outside the incident window. The record of which orders were affected is destroyed by ordinary tidying-up.

**2. `deleteTruckCascade` runs HOURLY.** `vercel.json` schedules `/api/cron/demo-cleanup` at `0 * * * *`, and it calls `deleteTruckCascade` directly. `order_payments` cascades on **both** `orders(order_key)` and `trucks(id)`, so any affected order belonging to a `demo-*` truck loses its rows within the hour. Real trucks are structurally safe — the cron is prefix-scoped twice — but demo trucks were contributing to the poisoned whole-table sum, so their rows are part of the forensic picture.

**The backstop that survives both:** `action_audit_log` has **no foreign keys** and is append-only, so it survives an undo *and* a cascade delete. Query 7 uses it and is the one to run first if anything has already been undone.

**Lesser decay:** `orders.updated_at` is bumped by any later write (an edit, a stock change, a buzzer assignment), so the `updated_at` arm of Query 1 loses precision every hour. Snapshot Queries 1 and 7 to a file today.

---

## 1. The affected set

**Answers:** every order on every truck that was collected, paid, or otherwise written between 14:24 and 19:00, with its cached payment state alongside what its *own* ledger rows actually say.

**Healthy result:** for each row, `own_ledger_paid_minor = total_minor`, `payment_status = 'paid'`, and `cached_paid_minor = own_ledger_paid_minor`. Any row where those disagree is damage.

```sql
with w as (
  select timestamptz '2026-08-07 14:24:00+01' as t0,
         timestamptz '2026-08-07 19:00:00+01' as t1
)
select t.name                                   as truck,
       o.truck_id,
       o.id                                     as order_no,
       o.order_key,
       o.status,
       o.total_minor,
       o.total,
       o.paid_at,
       o.collected_at,
       o.updated_at,
       o.payment_status,
       o.amount_paid,
       round(coalesce(o.amount_paid, 0) * 100)::bigint as cached_paid_minor,
       coalesce(l.own_paid_minor, 0)            as own_ledger_paid_minor,
       coalesce(l.own_rows, 0)                  as own_ledger_rows,
       case
         when o.collected_at between w.t0 and w.t1 then 'collected_at'
         when o.paid_at      between w.t0 and w.t1 then 'paid_at'
         else 'updated_at only'
       end                                      as matched_on
  from orders o
  join trucks t on t.id = o.truck_id
 cross join w
  left join lateral (
    select sum(case when p.kind = 'charge' then p.amount_minor else -p.amount_minor end) as own_paid_minor,
           count(*)                                                                      as own_rows
      from order_payments p
     where p.order_key = o.order_key
       and p.state = 'succeeded'
  ) l on true
 where o.collected_at between w.t0 and w.t1
    or o.paid_at      between w.t0 and w.t1
    or o.updated_at   between w.t0 and w.t1
 order by t.name, coalesce(o.collected_at, o.paid_at, o.updated_at);
```

> `matched_on = 'updated_at only'` rows are the weakest evidence and the first to decay — they include orders touched by `mark_paid` (which never writes `paid_at`/`collected_at`) as well as orders written for unrelated reasons. Treat that column as a confidence grade, not a verdict.

---

## 2. The missing money — the reconstruction list

**Answers:** of the orders finalised in the window, which have **no** payment row at all, or rows that do not add up to the order total. This is the list of money taken at a hatch that the ledger does not know about.

**Healthy result:** **zero rows.**

```sql
with w as (
  select timestamptz '2026-08-07 14:24:00+01' as t0,
         timestamptz '2026-08-07 19:00:00+01' as t1
)
select t.name                                        as truck,
       o.truck_id,
       o.id                                          as order_no,
       o.order_key,
       o.status,
       o.collected_at,
       o.paid_at,
       o.total_minor,
       coalesce(l.own_paid_minor, 0)                 as recorded_minor,
       o.total_minor - coalesce(l.own_paid_minor, 0) as shortfall_minor,
       round((o.total_minor - coalesce(l.own_paid_minor, 0)) / 100.0, 2) as shortfall_pounds,
       coalesce(l.own_rows, 0)                       as ledger_rows,
       case when coalesce(l.own_rows, 0) = 0
            then 'NO ROW AT ALL — full total unrecorded'
            else 'PARTIAL — rows exist but do not sum to the total'
       end                                           as kind
  from orders o
  join trucks t on t.id = o.truck_id
 cross join w
  left join lateral (
    select sum(case when p.kind = 'charge' then p.amount_minor else -p.amount_minor end) as own_paid_minor,
           count(*)                                                                      as own_rows
      from order_payments p
     where p.order_key = o.order_key
       and p.state = 'succeeded'
  ) l on true
 where (o.collected_at between w.t0 and w.t1 or o.paid_at between w.t0 and w.t1)
   and coalesce(l.own_paid_minor, 0) <> o.total_minor
 order by shortfall_minor desc, t.name;
```

> Scoped to `collected_at`/`paid_at` deliberately — an order that merely had `updated_at` bumped was not necessarily finalised, and including it would inflate the reconstruction list with orders nobody took money for.

---

## 3. The corrupted rows — and which are genuinely corrupt

**Answers:** which `orders` rows now carry a `payment_status` / `amount_paid` that disagrees with their own ledger. The verdict column separates bug damage from a legitimately unusual state.

**Healthy result:** **zero rows with a `BUG …` verdict.** A `LEGITIMATE …` row is fine and needs no repair.

```sql
select t.name                                        as truck,
       o.truck_id,
       o.id                                          as order_no,
       o.order_key,
       o.status,
       o.collected_at,
       o.total_minor,
       o.payment_status,
       o.amount_paid,
       round(coalesce(o.amount_paid, 0) * 100)::bigint as cached_paid_minor,
       coalesce(l.own_paid_minor, 0)                 as own_ledger_paid_minor,
       coalesce(l.own_rows, 0)                       as own_ledger_rows,
       case
         when coalesce(l.own_rows, 0) = 0 and coalesce(o.amount_paid, 0) > 0
           then 'BUG — cache claims money but the order has NO payment rows'
         when round(coalesce(o.amount_paid, 0) * 100)::bigint <> coalesce(l.own_paid_minor, 0)
           then 'BUG — cache disagrees with this order''s own ledger'
         when o.payment_status = 'refund_due' and coalesce(l.own_paid_minor, 0) > o.total_minor
           then 'LEGITIMATE — genuinely overpaid against its own rows'
         when o.payment_status = 'refund_due'
           then 'BUG — refund_due with no overpayment in its own ledger'
         else 'consistent'
       end                                           as verdict
  from orders o
  join trucks t on t.id = o.truck_id
  left join lateral (
    select sum(case when p.kind = 'charge' then p.amount_minor else -p.amount_minor end) as own_paid_minor,
           count(*)                                                                      as own_rows
      from order_payments p
     where p.order_key = o.order_key
       and p.state = 'succeeded'
  ) l on true
 where o.payment_status = 'refund_due'
    or round(coalesce(o.amount_paid, 0) * 100)::bigint <> coalesce(l.own_paid_minor, 0)
 order by verdict, t.name, o.collected_at;
```

> This is the reconciliation query already written into [lib/payments/ledger.ts:30-50](lib/payments/ledger.ts#L30-L50), narrowed to the damaged states. **The ledger is the truth and the cache is derived** — so any disagreement is the cache being wrong, never the rows. Deliberately **not** time-filtered: a corrupted cache row persists regardless of when it was written, and this is the full standing-damage list.

### 3b. The fingerprint — corroboration, one glance

**Answers:** the bug wrote the *same* whole-table total into `amount_paid` on every order it touched, so damaged rows cluster on a handful of identical values. Legitimate values are spread.

**Healthy result:** every `orders_sharing_this_value` is 1.

```sql
select o.amount_paid,
       count(*)                       as orders_sharing_this_value,
       min(o.collected_at)            as first_seen,
       max(o.collected_at)            as last_seen,
       count(distinct o.truck_id)     as trucks_affected
  from orders o
 where o.amount_paid is not null
   and o.amount_paid > 0
 group by o.amount_paid
having count(*) > 1
 order by orders_sharing_this_value desc, o.amount_paid desc;
```

---

## 4. The blast radius — were any rows WRITTEN wrongly?

**Answers:** whether the bug ever *created* a payment row with a wrong amount, rather than simply failing to create one. It could: when the poisoned whole-table sum happened to be **less** than an order's total, `balanceMinor` stayed positive and a row was inserted for `total − whole_table_sum`, which is too small.

**Healthy result:** **zero rows returned**, or every returned row showing `key_paid_before_minor = true_paid_before_minor` (`verdict = 'clean'`).

```sql
with w as (
  select timestamptz '2026-08-07 14:24:00+01' as t0,
         timestamptz '2026-08-07 19:00:00+01' as t1
)
select t.name                                   as truck,
       p.order_key,
       o.id                                     as order_no,
       p.id                                     as payment_id,
       p.created_at,
       p.kind, p.channel, p.state, p.method,
       p.amount_minor,
       o.total_minor,
       p.idempotency_key,
       case when p.idempotency_key like 'collect:%'
            then nullif(split_part(p.idempotency_key, ':', 3), '')::bigint end as key_paid_before_minor,
       case when p.idempotency_key like 'collect:%'
            then nullif(split_part(p.idempotency_key, ':', 4), '')::bigint end as key_balance_minor,
       coalesce((
         select sum(case when p2.kind = 'charge' then p2.amount_minor else -p2.amount_minor end)
           from order_payments p2
          where p2.order_key = p.order_key
            and p2.state = 'succeeded'
            and p2.created_at < p.created_at
       ), 0)                                    as true_paid_before_minor,
       case
         when p.idempotency_key not like 'collect:%' then 'not a collect row — inspect by hand'
         when nullif(split_part(p.idempotency_key, ':', 3), '')::bigint
              is distinct from coalesce((
                select sum(case when p2.kind = 'charge' then p2.amount_minor else -p2.amount_minor end)
                  from order_payments p2
                 where p2.order_key = p.order_key
                   and p2.state = 'succeeded'
                   and p2.created_at < p.created_at), 0)
           then 'BUG — key encodes a paid-before this order never had (poisoned balance)'
         else 'clean'
       end                                      as verdict
  from order_payments p
  join orders o on o.order_key = p.order_key
  join trucks t on t.id = p.truck_id
 cross join w
 where p.created_at between w.t0 and w.t1
 order by p.created_at;
```

> **Why the idempotency key is the detector.** `collectIdempotencyKey` is `collect:{order_key}:{paidBeforeMinor}:{balanceMinor}` ([lib/payments/ledger.ts:222](lib/payments/ledger.ts#L222)). A healthy first collection on an unpaid order encodes `paidBefore = 0`. During the incident `paidBefore` was the **whole-table sum**, so the key itself carries a fingerprint of the poisoned read — visible even though the row's own `amount_minor` might look plausible. `order_key` is a UUID and contains no colons, so `split_part` on `:` is safe.

---

## 5. Truck scope

**Answers:** which trucks actually have damage, ranked by unrecorded value. Verifies the Gusto + Test Kitchen expectation rather than assuming it.

**Healthy result:** **zero rows.** Any row is a truck with real damage; a `demo-` prefixed `truck_id` is a truck whose evidence the hourly cleanup cron will delete.

```sql
with w as (
  select timestamptz '2026-08-07 14:24:00+01' as t0,
         timestamptz '2026-08-07 19:00:00+01' as t1
)
select t.name                                                  as truck,
       o.truck_id,
       (o.truck_id like 'demo-%')                              as is_demo_truck_evidence_expires_hourly,
       t.show_paid_step,
       t.takes_cash,
       count(*)                                                as orders_finalised_in_window,
       count(*) filter (where coalesce(l.own_paid_minor, 0) <> o.total_minor) as orders_with_shortfall,
       sum(greatest(o.total_minor - coalesce(l.own_paid_minor, 0), 0))       as shortfall_minor,
       round(sum(greatest(o.total_minor - coalesce(l.own_paid_minor, 0), 0)) / 100.0, 2) as shortfall_pounds,
       min(coalesce(o.collected_at, o.paid_at))                as first_affected,
       max(coalesce(o.collected_at, o.paid_at))                as last_affected
  from orders o
  join trucks t on t.id = o.truck_id
 cross join w
  left join lateral (
    select sum(case when p.kind = 'charge' then p.amount_minor else -p.amount_minor end) as own_paid_minor
      from order_payments p
     where p.order_key = o.order_key and p.state = 'succeeded'
  ) l on true
 where (o.collected_at between w.t0 and w.t1 or o.paid_at between w.t0 and w.t1)
 group by t.name, o.truck_id, t.show_paid_step, t.takes_cash
having sum(greatest(o.total_minor - coalesce(l.own_paid_minor, 0), 0)) > 0
 order by shortfall_minor desc;
```

---

## 6. The total — one number

**Answers:** the total value of collections that recorded £0 (or short) during the window.

**Healthy result:** **`0.00`**, with `orders_affected = 0`.

```sql
with w as (
  select timestamptz '2026-08-07 14:24:00+01' as t0,
         timestamptz '2026-08-07 19:00:00+01' as t1
)
select count(*)                                                              as orders_affected,
       count(distinct o.truck_id)                                            as trucks_affected,
       sum(greatest(o.total_minor - coalesce(l.own_paid_minor, 0), 0))       as total_unrecorded_minor,
       round(sum(greatest(o.total_minor - coalesce(l.own_paid_minor, 0), 0)) / 100.0, 2)
                                                                             as total_unrecorded_pounds
  from orders o
 cross join w
  left join lateral (
    select sum(case when p.kind = 'charge' then p.amount_minor else -p.amount_minor end) as own_paid_minor
      from order_payments p
     where p.order_key = o.order_key and p.state = 'succeeded'
  ) l on true
 where (o.collected_at between w.t0 and w.t1 or o.paid_at between w.t0 and w.t1)
   and coalesce(l.own_paid_minor, 0) < o.total_minor;
```

---

## 7. 🔴 The durable record — run this one first if anything has been undone

**Answers:** what the append-only audit log says actually happened in the window. `action_audit_log` has **no foreign keys** and is never updated or deleted, so it survives both `undo_collected` (which erases the timestamps) and a cascade truck delete (which erases the payment rows).

**Healthy result:** every `collected` / `mark_paid*` row shows a non-zero `charged_minor`. **`charged_minor = 0` with `ledger_failed = false` is the exact signature of this bug** — a collection that charged nothing and reported no failure.

```sql
with w as (
  select timestamptz '2026-08-07 14:24:00+01' as t0,
         timestamptz '2026-08-07 19:00:00+01' as t1
)
select a.created_at,
       t.name                                   as truck,
       a.truck_id,
       a.action,
       a.order_key,
       o.id                                     as order_no,
       o.total_minor                            as order_total_minor,
       a.amount_minor                           as audit_amount_minor,
       a.after_state ->> 'charged_minor'        as charged_minor,
       a.after_state ->> 'ledger_failed'        as ledger_failed,
       a.actor_kind, a.actor_label, a.source,
       o.status                                 as status_now,
       o.collected_at                           as collected_at_now,
       case
         when coalesce((a.after_state ->> 'charged_minor')::bigint, 0) = 0
              and coalesce(a.after_state ->> 'ledger_failed', 'false') = 'false'
           then 'BUG SIGNATURE — charged nothing, reported no failure'
         else 'ok'
       end                                      as verdict
  from action_audit_log a
  left join orders o on o.order_key = a.order_key
  left join trucks t on t.id = a.truck_id
 cross join w
 where a.created_at between w.t0 and w.t1
   and a.action in ('collected', 'mark_paid', 'mark_paid_cash', 'mark_paid_card')
 order by a.created_at;
```

> If `collected_at_now` is **null** while the audit row says `collected`, that order has since been undone — the audit log is now the only place it exists as an affected order, and `o.total_minor` is still the amount to reconstruct.

---

## Is the damage still reconstructible?

**Yes — fully, today.** Everything needed survives, in three independent places:

| What you need | Where it lives | Survives an undo? | Survives a cascade delete? |
|---|---|---|---|
| **Which orders** were finalised in the window | `orders.collected_at` / `paid_at` | ❌ **cleared by `undo_collected`** | ❌ |
| **Which orders**, durably | `action_audit_log` (no FKs, append-only) | ✅ | ✅ |
| **How much** each one was for | `orders.total_minor` | ✅ | ❌ (real trucks safe) |
| **What was recorded** | `order_payments` | ✅ | ❌ (real trucks safe) |
| **Who took it, and when** | `action_audit_log.actor_*`, `created_at` | ✅ | ✅ |

The amount owed on each affected order is simply **that order's own `total_minor`**, less anything genuinely recorded against it — Query 2 computes it directly. No inference or apportionment is required, because the bug removed rows rather than altering them (confirm with Query 4 that nothing was written wrongly; if it returns `BUG` rows, those amounts need individual judgement and reconstruction is no longer purely arithmetic).

### What would destroy it over the weekend

1. 🔴 **An operator tapping ↩ Undo on an affected order.** Clears `paid_at` *and* `collected_at`, nulls `status_before_collected`, and moves `updated_at` out of the window. Queries 1, 2, 5 and 6 lose that order silently. **Query 7 is the only recovery** — snapshot it now.
2. 🔴 **The hourly demo-cleanup cron** (`0 * * * *`, `deleteTruckCascade`). Deletes `demo-*` trucks and cascades away their orders *and* payment rows. Real trucks are structurally protected — the truck-delete route also refuses any truck holding payment records — but demo-truck evidence has an hourly expiry.
3. **The daily account-deletion cron** (`0 9 * * *`). Retains orders and payments by design and only anonymises identity, so it does not touch the money columns — but it does run tomorrow morning, so it is worth knowing it fired.
4. **`updated_at` decay.** Any later write to an affected order pushes it out of the `updated_at` arm of Query 1. Only matters for `mark_paid`-only orders (which never get `paid_at`/`collected_at`), and Query 7 covers those durably.

### The one thing to do now

Run **Query 7** and **Query 2** and save both outputs to a file. Between them they pin every affected order, its amount, and who took it — in a form that survives anything an operator or a cron can do over the weekend. Everything else can be re-derived afterwards.

**No repair is proposed here, and nothing above modifies data.**
