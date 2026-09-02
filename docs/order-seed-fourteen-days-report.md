# Order seed — fourteen days on App Tester (4–17 September 2026)

**Truck:** `test-truck-3-2` · name "App Tester" · slug `app-tester` · plan `trial` · active
**Output SQL:** `docs/seed-app-tester-sept.sql` — **473 lines. RAN SUCCESSFULLY on the second
attempt: 896 rows written, all marked `table_ref = 'SEED'`. The CONTENT was wrong — see below.**
**Date of report:** 1 September 2026
**Corrective SQL:** `docs/seed-app-tester-sept-align.sql` — **268 lines, NOT RUN.**

---

## 🔴 THE SEED RAN, AND THE CONTENT WAS WRONG. WHAT I GOT WRONG AND HOW IT IS FIXED

**896 rows were written and all 896 are correctly marked `table_ref = 'SEED'`.** The mechanics
worked. **The content did not**, and the fault is mine on two counts.

### What is in the database now vs what should be there

| | Written by the seed | The previous events |
|---|---|---|
| `collected` | **854** | **0** |
| `confirmed` | 14 | **728** (52/day) |
| `ready` | 14 | **84** (6/day) |
| `pending` | 14 | **84** (6/day) |
| `collected_at` set | **854** | **0** |
| `status_before_collected` set | **854** | **0** |
| items / slots / totals | **generated, varied per event** | **identical on every event** |

### 🔴 The finding that settles it

I compared two previous events row by row, keyed on display id:

```
2026-09-02 vs 2026-09-03:
  customer_name 0 differences · slot 0 · items 0 · total 0 · notes 0 · status 0
```

**Zero differences on every field.** The same holds for 29, 30 and 31 August and 2 September —
**five consecutive events, byte-identical to one another.** The non-confirmed rows are the *same
display ids* every single day:

```
ready:   7, 17, 27, 37, 47, 57
pending: 10, 20, 30, 40, 50, 60
everything else: confirmed
```

**"An exact duplicate of orders from previous events" is meant literally.** I built a generator when
I should have built a copy.

### Where the two errors came from

1. **The status mix.** The original brief said *"mixed statuses weighted to completed, two or three
   live on the board and the rest collected"*, and I implemented exactly that: 61 collected per
   event. **The previous events use no `collected` at all.** I followed a stated preference over the
   observable specification, and I had the specification in front of me — my own READ table below
   records the reference generation as `confirmed 52, pending 6, ready 6` with **zero collected**.
   🔴 **I recorded the right answer and then wrote something else.**
2. **Varied items and slots.** Same origin — the brief said *"varied items/names/slots per event"*,
   and I did not check whether the existing events were actually varied. **They are not.**

⚠️ **In both cases the check that would have caught it is the one I ran and then ignored:** compare
two previous events to each other. Had I done that before writing the generator, there would have
been no generator.

### 🔴 On "cancelled" — this one is not in the data

The problem report mentioned orders showing as cancelled, so I checked rather than assuming:

- **`cancellation_reason` is set on ZERO of the 896 rows.**
- **No row has `status = 'cancelled'`.**
- The only cancelled order on this truck is a single row on **2026-08-21**, which predates all of
  this.

**So nothing was written as cancelled.** What is showing as cancelled is a rendering of some other
state — most likely how the board presents `collected` or unpaid rows. ⚠️ **I have NOT established
which, and I am not going to guess.** Fixing the statuses should make it moot; **if anything still
shows as cancelled afterwards, that is a separate UI question worth its own look.**

### The fix: `docs/seed-app-tester-sept-align.sql`

**An UPDATE from the reference day, not a delete-and-re-seed.** Each seeded row is matched to the
reference row with the same display id and overwritten from it — content only. Identity fields
(`id`, `event_date`, `event_id`, `van_id`, **`order_key`**, `table_ref`, `created_at`) are untouched.

🔴 **Why UPDATE and not DELETE + re-insert:** `order_key` is the uuid `order_payments` joins on.
Re-inserting mints new ones. Nothing *should* be joined to these rows — **but "should be" is the
assumption that already cost two runs**, and an UPDATE does not depend on it holding.

**Reference day: 2026-09-03**, one of the five clean identical days. **2026-09-01 is deliberately not
used** — it carries 5 collected and 5 paid rows from real hand-testing, and copying it would spread
those across 896 rows. **Guard 3 enforces this rather than trusting my choice:** it refuses to run if
the reference day contains anything paid, collected, cancelled, or with `placed_at` set.

**Seven guards, and two are new in kind:**

- **Guard 5** refuses if any row in the window is *not* marked `SEED` — so a real order placed there
  since cannot be overwritten.
- **Guard 6** refuses if any seeded row has become paid or acquired an `order_payments` row.
- A final check aborts the transaction unless **exactly 896** rows were updated.

**The never-mark-these-paid rule is unchanged**, and the alignment explicitly rewrites
`payment_status`, `paid_at`, `amount_paid`, `placed_at`, `collected_at` and
`status_before_collected` to empty rather than copying them.

---

## 🔴 THE FIRST RUN FAILED. WHAT HAPPENED, AND WHY IT WAS MY ERROR

The first version of this SQL aborted on the **very first row**:

```
ERROR: 23514 new row for relation "orders" violates check constraint "orders_source_check"
```

**Nothing was written.** The insert sits inside `begin; ... commit;`, so the failure rolled the whole
transaction back — no orders, no counter updates, no trace. That part worked as designed.

### The reasoning gap, stated plainly

I chose `source = 'seed'` as the marker and justified it partly on this: *"a repo-wide search for
`.source ===` finds no consumer reading an order's source, so a third value changes no behaviour."*

**That was true, and it was not sufficient.** `orders.source` carries a **CHECK constraint**, and I
never looked at it. The lesson is one line:

> 🔴 **GREPPING THE CODE ESTABLISHES WHAT READS A COLUMN. ONLY THE SCHEMA ESTABLISHES WHAT A COLUMN
> IS ALLOWED TO CONTAIN.** A column can be constrained by the database even when no application code
> touches it.

⚠️ **I also can't widen it:** adding `'seed'` to `orders_source_check` is a **migration**, and
migrations are frozen. So the constraint is a hard boundary here, not an inconvenience.

### The corrected marker: `table_ref = 'SEED'`

| | |
|---|---|
| Not rendered anywhere | **Zero references in `app/`, zero in `components/`** — no `.tsx` file in the repository mentions it |
| Survives the lifecycle | Only writers are `lib/payments/order-drafts.ts` and `lib/payments/promote-draft.ts`, both at INSERT; nothing updates it |
| Free text | `supabase/migrations/20260812_order_drafts.sql` declares it `table_ref text` with **no CHECK** — the property `source` turned out to lack |
| Obviously a marker | `'SEED'` is not a plausible table number |

`source` now carries **`'web'`**, matching the existing 896 seeded rows. It is no longer the marker,
just part of matching production's shape.

### 🔴 The cost, which I am not going to soften

**This is the exact reuse I rejected `table_ref` for the first time.** It is a real table-service
feature column, and filling it with a sentinel is what goes wrong the day table service is built — at
which point something may try to render `SEED` as a table number for 896 orders.

**The constraint failure changed the trade-off, not the objection.** The objection still stands; it is
now the *lesser* risk, because the alternative needs a frozen migration. **If table service is ever
built, delete these rows first or exclude `table_ref = 'SEED'` in it.** That is written into the SQL
header.

### What I added so this class fails early rather than mid-insert

A new **GUARD 0** reads `pg_constraint` directly and refuses to run if any CHECK constraint on
`orders` mentions `table_ref`:

```sql
select string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ')
  into v_bad
  from pg_constraint
 where conrelid = 'public.orders'::regclass
   and contype  = 'c'
   and pg_get_constraintdef(oid) ilike '%table_ref%';
```

**It asks the schema instead of inferring from code** — which is the thing I failed to do.

### 🔴 ONE QUERY I STILL WANT YOU TO RUN

**I have NOT established what `orders_source_check` actually allows.** I know `'seed'` is rejected and
that `'web'` and `'manual'` are in use; I inferred the rest. This settles it, read-only:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.orders'::regclass and contype = 'c';
```

If the freeze lifts, moving the marker back onto `source` is the better long-term fix, and that query
tells you what the new constraint should say.

---

## VERIFICATION — what I actually did

Stating this in the required words, because tsc-clean is not verification and neither is "it looks right":

- **PARSE:** 🔴 **NOW PARTLY PERFORMED — BY YOU, NOT BY ME, AND IT FOUND A REAL DEFECT.** The first
  run proved the file **parses** and that all four guards **execute and pass**; it then failed on the
  first INSERT against a check constraint (above). **The corrected file has NOT been run**, so the
  changed lines — GUARD 0, the `table_ref` column in the INSERT, and the seven rewritten verification
  predicates — **are again unparsed.** I did not run `psql` and there is no dry-run mode available
  without a connection that writes.
- **EXECUTION — performed, twice, on two different things:**
  1. **Read queries against production.** Every fact in the "READ" table below came from a live
     query against the production Supabase using the service role key. Read-only: `select` only,
     no insert, no update, no RPC, no migration.
  2. **The generation algorithm.** I re-implemented the plpgsql arithmetic in JavaScript —
     the same integer division, the same modulo, the same array indexing — generated all
     **896 rows**, and asserted every invariant. **0 problems.** Results below.
- **TYPECHECK:** not applicable. No TypeScript was changed. No application file was touched at all.

**Nothing was executed against the database that writes. Nothing was deployed. Nothing was
committed. No migration was run.**

The gap you should hold me to: the JS simulation proves the *logic* is right — the slots, the
prices, the totals, the ceilings. It does not prove the *SQL* is right. Column names, casts and
plpgsql syntax are verified only by reading, not by running.

---

## The two-line answer

The seed ran and wrote all 896 rows, correctly marked and with no money touched — but **the content
was wrong**: it generated varied items, slots and a collected-heavy status mix, when the previous
events are **identical copies of one another** with **zero collected orders**.
`docs/seed-app-tester-sept-align.sql` fixes it by copying the reference day onto all fourteen.

Two of the brief's premises were also wrong and I did not follow them: the seed must **not** write
`production_slot_usage`, and this truck's payment contamination is **worse and less predictable**
than "don't press mark-paid" implies.

---

## READ vs INFERRED vs UNKNOWN

Everything below is labelled. Nothing is presented as established that I did not query.

### READ — direct from production

| Fact | Value |
|---|---|
| Truck | `test-truck-3-2`, name "App Tester", slug `app-tester`, plan `trial`, `is_active` true |
| Total orders on truck | **901** |
| Target events | **14**, Test Event 15–28, `2026-09-04` → `2026-09-17`, one per day |
| Event status | all `confirmed`; window `09:00:00`–`17:00:00` on all fourteen |
| `order_counter` on all 14 | **0** |
| `van_id` on all 14 | `0cde7768-ef86-473d-bfab-5d3afcb0ab6d` (one distinct value) |
| Orders already on the 14 | **0** |
| Menu | 30 items, **26 active**, 5 categories |
| Capacity config | **Pizza: `batch_size` 2, `prep_secs` 300, `counts_toward_capacity` TRUE.** Drinks, Desserts, Specials, Dough Balls: batch 0, prep 0, capacity FALSE |
| `orders.source` across whole DB | `web` 931, `manual` 69 — **no third value** |
| `order_counters` rows for this truck | **0** |
| `production_slot_usage` dates | **only 4**: 21 Aug (45), 25 Aug (49), 27 Aug (44), 1 Sep (52) |
| `order_payments` on this truck | **24 rows, all `livemode = true`, all kind `charge`** |
| Payments attached to demo-email orders | **19 of 24** |
| Statuses on truck | collected 94, confirmed 671, ready 90, pending 45, cancelled 1 |
| `amount_paid` on unpaid orders | **NULL on 875 of 877**; `0` on 2 |
| Collected + unpaid | **80** of the 94 collected orders |

**The reference generation** (29 Aug – 3 Sep), read row by row from `2026-09-03`:

- 64 rows, `id` `'1'`–`'64'` as TEXT, 64 distinct names, 64 distinct slots on the 5-minute grid
- `placed_at` **NULL on all 64** · `created_at` = **`2026-09-02T18:00:00+00:00`** on all 64
- `extras` NULL · `deals` `[]` · `discount_amt` 0 · `bundle` NULL · `payment_status` `unpaid`
- `order_type` `collection` · emails `<lowercase name>@demo.hatchgrab.test`
- statuses `confirmed 52, pending 6, ready 6`

**The 64 names match my array exactly** — I diffed the sets: nothing in mine that is not in
production, nothing in production missing from mine, no duplicates.

**All 26 item names and all 26 prices verified** against `menu_items_db` for this truck: every one
exists, every one is `is_active = true`, and every `unit_price` I use equals the live menu price.
Zero mismatches.

### INFERRED

- The seed that produced the live rows is **not** `docs/seed-apple-tester-orders.sql`. That committed
  script sets `placed_at` and uses a different status mix and only 8 dates. The live rows have
  `placed_at` NULL across the recent generation and span 14 dates. *Inference from the divergence,
  not from a changelog.*
- The four dates carrying `production_slot_usage` are exactly the four carrying paid orders.
  I infer the slot-usage rows were written by real interaction afterwards, not by the seed.
  *Strong, but it is a correlation across four dates.*

### UNKNOWN

- **What action wrote the 24 payment rows.** See the section below. I could not establish it and
  I did not guess.
- Whether the 10 paid-but-never-collected orders were paid through Stripe or by a manual action.
- Whether `docs/seed-apple-tester-orders.sql` was ever run at all.

---

## 🔴 CORRECTION 1 — the brief's table list is wrong

> *"Write only the tables a real order writes. The report found these are `orders` and
> `production_slot_usage`. If that is wrong, say so and show what you found instead."*

**It is wrong, and here is what I found.**

`production_slot_usage` is written by the RPC `place_order_atomic` — that part of
`docs/order-seeding-approach-report.md` is correct about the *live order path*. But the **seed** never
wrote it. Of the fourteen already-seeded dates on this truck, only **four** have any
`production_slot_usage` rows at all:

```
2026-08-21 → 45      2026-08-25 → 49      2026-08-27 → 44      2026-09-01 → 52
```

The other **ten seeded dates have zero rows**. And those four are precisely the dates that carry
paid orders — i.e. the dates somebody actually worked through. If the seed wrote slot usage, all
fourteen would have it.

**Decision: the SQL writes `orders` only, plus the `order_counter` update.** Writing slot usage
would make the new fortnight differ from every existing seeded day, and the existing seeded days
are the specification. The dashboard reprojects capacity from `orders.items` when the event opens.

**A third table also does not get written:** `order_counters`. This truck has **zero rows** there.
The real flow increments the per-**event** counter (`truck_events.order_counter`) and only falls
back to the truck-level table when an order has no event. Every order here has an event.

---

## 🔴 CORRECTION 2 — the payment contamination is worse than "don't mark them paid"

The brief's rule was right; its model of the risk was too narrow. The data:

There are **24 `order_payments` rows** against this truck. **All 24 are `livemode = true`.** All are
kind `charge`. **19 of them attach to orders whose email ends `@demo.hatchgrab.test`** — that is,
to previously seeded rows. The contamination has already happened, on the truck we are about to
seed again.

Worse, payment is **not tied to any one status**:

| payment_status / status | count |
|---|---|
| paid / collected | 14 |
| paid / ready | 6 |
| paid / confirmed | 3 |
| **paid / cancelled** | **1** |

Fourteen carry `paid_at` equal to `collected_at` to the millisecond — paid and collected in one
action. **The other ten were never collected at all** and have `paid_at` NULL: the `order_payments`
row was written without the order being marked. And one order is **paid and cancelled**.

**So "don't press mark-paid" is not a sufficient rule.** The rule in the file header is: *no status
is safe; treat any action on a seeded order — accept, ready, collect, cancel — as capable of writing
a live-mode money row.* That is stated in the header, in those terms.

**I did not establish which code path is responsible.** That is a genuine UNKNOWN and it is worth a
separate investigation, because it means live-mode charge rows can appear against orders nobody
collected.

### A correction to something I said mid-task

I first wrote in the header that *every* collected order on this truck is paid, and that collecting
is therefore the dangerous action. **That was wrong** — I had sampled six rows and generalised.
The full count is 94 collected, of which **80 are unpaid**. Collected-and-unpaid is the *norm* here,
not an anomaly the seed invents. The header now says this correctly, and it changes the guidance:
collecting is not uniquely dangerous, because nothing is uniquely dangerous.

---

## The marker: `table_ref = 'SEED'` (was `source = 'seed'` — see the failure section above)

**Proposed and justified**, as required.

⛔ **SUPERSEDED — this was the original reasoning and it is kept because the correction only
makes sense against it.** `orders.source` is the **provenance** column — the one that already answers "where did this order
come from". It holds `web` (931) and `manual` (69) across the entire database. Adding `seed` extends
that column's own meaning rather than borrowing a column meant for something else.

| Requirement from the brief | How `source` meets it |
|---|---|
| Survives the order lifecycle | No code path updates `orders.source` after insert. Accept, ready, collect, cancel and refund all leave it untouched. |
| Not shown to a customer | No customer-facing surface renders it. |
| Identifies the row as seeded | One unambiguous predicate: `table_ref = 'SEED'`. |

And the property that made me choose it over everything else: **nothing branches on it.** A
repo-wide search for `.source ===` finds **no consumer reading an order's source** — every hit is
on an *event's* source (`operator` / `scraper`) or on a Stripe account object. A third value
therefore changes no behaviour, alters no price, no capacity projection, no payout, and shows
nothing new in any UI.

**Rejected: `table_ref`.** It is never rendered in any `.tsx` and would have been equally invisible.
But it is a **real table-service feature column**. Filling it with `'seed'` is exactly the kind of
reuse that detonates the day table service is switched on. Rejected for that reason.

**Rejected: the email domain.** `customer_email like '%@demo.hatchgrab.test'` is a naming
convention, not an enforced constraint, and a real signup could imitate it. It is also how the
existing 896 rows are identified, which is precisely the weakness we are fixing.

⚠️ **It does not retroactively mark the existing 896 rows.** They carry `source = 'web'` and remain
indistinguishable from real web orders by this test. Marking them too is a separate statement and
a separate decision — say the word and I will write it.

---

## Required answer: what happens if it runs twice

**It refuses, and nothing is written.** Two independent mechanisms, in this order:

1. **Guard 2 fires first.** `if exists (select 1 from orders where truck_id = … and source = 'seed'
   and event_date between …)` raises an exception. Guard 3 then also checks for orders on the target
   events *by any route*, seeded or not, so a real order placed in the meantime blocks the run too.
2. **If the guards were removed, the database would still refuse.** The partial unique index
   `orders_event_display_id ON orders (event_id, id) WHERE event_id IS NOT NULL` makes the second
   insert of `id = '1'` on the same `event_id` a **`23505` unique violation** on the very first row.

Either way the exception aborts the transaction. Because everything sits inside `begin; … commit;`,
**no rows are written, no counter is updated, and the run leaves no trace.** The trailing `commit;`
on an aborted transaction is a no-op rollback — you will see a "no transaction in progress" style
notice, which is expected and harmless.

**The failure mode this protects against is real:** without the guards, a partial second run could
have left some events with 128 orders and a counter of 64, which would then hand out colliding
display numbers to real orders.

## Required answer: what if the marker column is later reused

**Stated plainly, because the risk is not theoretical.**

If `source` later acquires another meaning — a future import that writes `source = 'seed'`, or
someone repurposing it as a channel name — then:

1. **The identify query silently widens.** `where source = 'seed'` stops meaning "seeded by this
   file" and starts meaning "seeded OR whatever else now uses that value". You would be looking at
   a set you did not create and would not recognise.
2. **The DELETE in the file header becomes destructive beyond its intent.** It would take rows that
   are not ours. That is the dangerous one, because the delete is the operation you will run
   *without thinking about it* six months from now.

**The mitigation is already in the file:** every identify and delete predicate is narrowed by
`truck_id = 'test-truck-3-2'` **and** the date range, so a stray `source = 'seed'` elsewhere in the
database cannot be caught by them. The residual risk is a *different* thing writing `source='seed'`
onto this same truck inside this same fortnight, which is small but not zero.

**The structural fix, if you want one:** a `CHECK (source in ('web','manual','seed'))` constraint
would make any new meaning a deliberate migration rather than an accident. I have **not** written
that — it is a schema change and deploys are frozen. Flagging it as the option.

---

## What the SQL does

Single transaction. Nothing partial can survive.

```
begin;
  GUARD 0  refuse if any CHECK constraint on `orders` restricts the marker column
  GUARD 1  truck must exist with id='test-truck-3-2' AND name='App Tester'
  GUARD 2  refuse if any table_ref='SEED' order already exists in the window
  GUARD 3  refuse unless exactly 14 events exist; refuse if ANY already has orders
  GUARD 4  refuse if any item name is missing from this truck's active menu
  → 14 events × 64 orders = 896 rows into `orders`
  → truck_events.order_counter = 64 on each of the 14
commit;
```

**Guard 0 exists because of the failure at the top of this report.** It asks `pg_constraint` what the
column may contain rather than inferring it from code — the step whose absence cost the first run.

**Guard 1 checks the name as well as the id on purpose.** `test-truck-3` and `test-truck-3-2` are
different live trucks whose ids differ by two characters. An id typo alone would put 896 orders on
another operator's board. Checking the name too makes that typo a refusal instead of an incident.

**Guard 4 exists because the failure it prevents is silent.** The capacity engine joins
`items[].name` to `menu_items_db`. An unmatched name still renders on the board but projects **no
capacity** — a wrong answer that looks like a right one. A refused insert is strictly better.

### Row shape

| Column | Value | Why |
|---|---|---|
| `id` | `'1'`–`'64'` per event | display number; unique per event by partial index |
| `table_ref` | **`'SEED'`** | **the marker** |
| `source` | `'web'` | matches the existing seeded rows — **not** the marker |
| `placed_at` | **NULL** | matches the production generation |
| `payment_status` | `'unpaid'` | never paid |
| `paid_at` | NULL | no money |
| `amount_paid` | **NULL** | matches 875 of the 877 existing unpaid rows |
| `created_at` / `updated_at` | day before, `18:00Z` | matches the 29 Aug – 3 Sep generation |
| `extras` / `bundle` / `discount_code` | NULL | as production |
| `deals` | `'[]'` | as production |
| `van_id` | `0cde7768-…` | the events' own van |
| `collected_at`, `status_before_collected` | set on collected rows only | what a real collected row carries |

### Statuses

**Three live on the board per event** — one `pending`, one `confirmed`, one `ready` — and **61
`collected`**. The live trio rotates by event (`((e*7) % 60) + 1`), so a different part of the day
is in progress on each of the fourteen days, and the trio is bounded so it can never run past
order 64.

Collected-and-unpaid is **the existing norm** on this truck (80 of 94), so these rows look like the
ones already there.

### Slots

The 5-minute grid, **09:00–16:55**, inside the events' own 09:00–17:00 window.

```
slot_index = ( ((i-1)*3)/2  +  (e-1)*2 ) % 96      -- integer division
```

`((i-1)*3)/2` yields `0,1,3,4,6,7,…` — **64 distinct values in 0..94**, which spreads 64 orders
across the whole trading day instead of bunching them into the first five hours. The `(e-1)*2` term
shifts the whole pattern per event so no two days line up.

### Items

21 pizzas and 5 sides, rotated by **both** `i` and `e`, so the basket mix differs down the day and
across the fortnight. Three basket sizes: one pizza; one pizza + a side; two pizzas + a side.

**Capacity is respected by construction.** Only Pizza counts toward capacity, its batch size is 2,
and a 5-minute window holds one batch. Each order occupies its **own distinct slot** and carries at
most **2** pizzas — so no window can exceed the ceiling.

---

## Simulation results (executed)

All 896 rows generated and asserted:

```
rows generated:                    896   (expect 896)
slot range:                        09:00 → 16:55   (event window 09:00-17:00)
all slots on the 5-minute grid:    true
distinct slots per event:          64 of 64        (no collisions)
statuses per event:                collected 61, pending 1, confirmed 1, ready 1
max pizzas in any 5-min window:    2               (ceiling 2 — never breached)
price mismatches vs live menu:     0
unknown item names:                0
total_minor rounding errors:       0
duplicate display ids:             0
distinct baskets:                  417
order size mix:                    1 item 299 · 2 items 298 · 3 items 299
total across 14 days:              £16,180.50
per-day totals:                    £1,071.50 – £1,208.50
PROBLEMS:                          0
```

Sample, day 1:

```
#1 Amelia   09:00 £10     collected  Margherita
#2 Ben      09:05 £32     collected  Pepperoni + Holli's Pizza + Nutella Pizza
#3 Chloe    09:15 £13.50  collected  Ham & Shroom + Fanta
#4 Dan      09:20 £12     collected  Genovese
#5 Ella     09:30 £20     collected  Focaccia Pizza + Buscaiola + Sprite
#6 Finn     09:35 £21     collected  Napoli Special + Tiramisu
```

---

## Verification queries shipped in the file

Seven, at the end of the SQL, to run after committing:

1. **What was written** — 14 rows, orders=64, counter=64, distinct_slots=64 on every one
2. 🔴 **No seed order has a payment row** — must return zero, now and every time you check
3. 🔴 **Nothing is marked paid** — must return zero
4. **No 5-minute window exceeds the pizza batch** — rows at `n=2` expected, `BREACH` is a problem
5. **Every item name resolves to this truck's menu** — must return zero
6. **Nothing outside 4–17 Sep was touched** — must return zero
7. **No other truck gained a seed row** — must return zero

---

## Before you run it

1. **The corrected lines are unparsed.** The first run proved the guards execute; the changes made
   since (GUARD 0, `table_ref`, the rewritten verification predicates) have not been run. **Nothing is
   written unless the whole transaction commits**, which the first failure demonstrated in practice.
2. Run **query 1** immediately after, then **queries 2 and 3**, which are the ones that matter.
3. **Do not touch these orders on the KDS.** Not collect, not accept, not cancel. See Correction 2.
4. The header carries the never-mark-paid rule, the identify query and the delete procedure, as
   required.

## Constraints observed

- **Nothing was executed against the database that writes.** Read queries only.
- **No deploy. No migration. No commit.** Deploys are frozen.
- **No credential value was added, invented or committed.** The read scripts loaded the existing key
  from `.env.local` at runtime; no key appears in any file I wrote, and the scratchpad scripts are
  outside the repo.
- **Pizzeria Gusto was not touched.** Every statement is narrowed to `test-truck-3-2`, and
  verification query 7 proves no other truck gained a row.
- No span of the prompt arrived garbled. **No instruction contradicted another** — the one apparent
  conflict (the brief naming `production_slot_usage` as a table to write, against the production
  evidence that the seed never wrote it) is a factual premise, not an instruction, so I followed the
  standing rule to report what I found rather than choosing silently. It is Correction 1 above and
  is called out in the SQL header.

---

**Files written:**
- `docs/seed-app-tester-sept.sql` — 473 lines. **Has been run; 896 rows exist.**
- `docs/seed-app-tester-sept-align.sql` — 268 lines. **NOT RUN.** Run this to make the fourteen
  events exact duplicates of 2026-09-03.
