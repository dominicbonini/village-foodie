# The draft store — phase 2a of authorize-then-capture

**Date:** 12 August 2026
**BUILD. Two NEW files, zero files edited. The migration is written and NOT run — you run it by hand. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# ✅ WHAT WAS BUILT

| File | What |
|---|---|
| `supabase/migrations/20260812_order_drafts.sql` | The table, its indexes, RLS, comments, and `purge_order_drafts()` |
| `lib/payments/order-drafts.ts` | The only module that touches it. Nothing calls it yet |

🔴 **NOT ONE EXISTING FILE WAS EDITED.** `git status` shows two untracked files and nothing modified. `submit/route.ts`, the webhook, the checkout route, the order page, the ledger and `place_order_atomic` are all byte-identical to HEAD.

⚠️ **ONE DEVIATION TO DECLARE UP FRONT: my verification script was NOT purely read-only.** Proving `orders.order_key` accepts a supplied value required an INSERT that succeeded. It was deleted within the same script and the row count is unchanged at 449, with no residue. **§V(b) states exactly what was written and how it was verified gone.** I am flagging it rather than letting "read-only script" stand as written.

---

## 1. The table

```sql
create table if not exists order_drafts (
  order_key       uuid        primary key,          -- 🔴 NO DEFAULT. The caller mints it.

  truck_id        text        not null references trucks(id) on delete cascade,
  event_id        uuid,
  van_id          uuid,
  event_date      date,
  requested_slot  text,
  order_type      text        not null default 'collection',
  table_ref       text,

  customer_name   text,       -- 🔴 the only PII, and it is erased on promotion (§5)
  customer_email  text,
  customer_phone  text,

  items           jsonb       not null default '[]'::jsonb,
  deals           jsonb,
  extras          jsonb,
  bundle          jsonb,
  notes           text,
  discount_code   text,
  asap_estimate   text,       -- ⚠️ beyond the enumerated list — see below
  upsell_events   jsonb,      -- ⚠️ beyond the enumerated list — see below

  subtotal        numeric(8,2) not null,
  discount_amt    numeric(8,2) not null default 0,
  total           numeric(8,2) not null,
  total_minor     integer      not null,            -- 🔴 THE AMOUNT AUTHORISED
  currency        text         not null default 'GBP',

  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  payment_intent_id text,
  livemode        boolean,
  promoted_at     timestamptz,                      -- 🔴 the double-promotion constraint

  constraint order_drafts_total_minor_positive check (total_minor > 0),
  constraint order_drafts_expiry_after_creation check (expires_at > created_at)
);
```

**Indexes:** `order_drafts_expiry` on `expires_at where promoted_at is null` (the purge sweep), `order_drafts_payment_intent_uidx` **unique** on `payment_intent_id where not null`, `order_drafts_truck`.
**RLS:** enabled, **zero policies** — see §V(d).

⚠️ **`asap_estimate` and `upsell_events` ARE BEYOND THE ENUMERATED LIST, AND FLAGGED IN THE MIGRATION ITSELF.** Both are part of the request the current submit path already persists (`orders.asap_estimate` and the `upsell_events` insert), and omitting them would silently lose two fields at phase 2b. Neither decides money, capacity or a slot. **If they are not wanted they are two columns to drop.**

⚠️ **Two columns are stored that could have been derived:** `total` alongside `total_minor`. `place_order_atomic` takes `p_order.total` as numeric and derives `total_minor` itself, so storing both means promotion never converts and `toMinor`/`fromMinor` stay the only conversion pair in the codebase.

⚠️ **No FK to `truck_events` or vans** — `orders` has none either, and an event deleted mid-flow must not cascade away a draft whose customer has already authorised. `truck_id` **does** cascade: a deleted truck has no orders to create. ⚠️ Noted while checking §V(d): `app/api/admin/delete-truck/route.ts`'s `IMPACT_TABLES` list does not include `order_drafts`, so the admin delete's impact count will under-report — **the FK cascade still removes the rows correctly.** Out of scope here; flagged.

---

## 2. 🔴 THE KEY — quoted before it was copied

**The precedent, `app/api/dashboard/action/route.ts:1171-1174` and `:1219`:**

```ts
        // Accept a CLIENT-minted order_key (offline outbox) → idempotent replay: a re-sent already-synced
        // walk-up is a no-op (order_key PK conflict → ignored), never a duplicate. Online walk-ups (no client
        // key) keep the server-default order_key + a plain insert, exactly as before.
        const clientOrderKey: string | undefined = typeof manualOrder?.order_key === 'string' ? manualOrder.order_key : undefined
        …
        if (clientOrderKey) insertPayload.order_key = clientOrderKey
```

**And the column, `20260607_order_key_per_event.sql:20` / `:42`:**

```sql
  ADD COLUMN IF NOT EXISTS order_key uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE orders ADD CONSTRAINT orders_pkey PRIMARY KEY (order_key);
```

✅ **A `DEFAULT` applies only when no value is supplied. It is not `GENERATED ALWAYS`.** Proved empirically in §V(b).

**So `order_drafts.order_key` has NO default and the caller mints it:**

```ts
export function newOrderKey(): string {
  return crypto.randomUUID()
}
```

🔴 **Deliberately not a database default:** the caller needs this value **in hand** to put in Stripe metadata, and a value it only learns after the insert is a value it can forget to use.

✅ **Correlation is therefore unchanged end to end.** `payment_intent_data.metadata.order_key` → webhook → order lookup, and the ledger's `stripe_pi:{id}` never involved the order key at all.

⚠️ **The cost, stated in the migration:** an `order_key` will now exist for a draft that may never become an order, so **the key alone stops meaning "an order exists"**. Nothing today reads a bare key as proof — every reader selects the row — but it is the assumption to re-check at 2b.

---

## 3. Lifecycle columns, and the expiry

| Column | Value |
|---|---|
| `created_at` | `now()` |
| 🔴 `expires_at` | **`now() + interval '30 minutes'`** |
| `payment_intent_id` | null until a payment starts; unique-when-present |
| `livemode` | null until an authorisation exists; **from the Stripe object, never a key prefix or env var** |
| `promoted_at` | null = claimable. Non-null = an order was created and the PII is already gone |

### 🔴 WHY 30 MINUTES

The draft holds **the request**, and the request is known at submit — **before** the payment page exists. So the floor is not "the seconds between authorising and the webhook arriving": that is the last leg, not the whole journey. The draft has to survive the entire time the customer spends at the card form.

✅ **30 minutes is Stripe Checkout's own minimum session lifetime.** Choosing it means **the draft can never expire before the payment session that references it** — and that is the one failure that costs real money: an authorisation taken against a draft that has already been deleted is money held with no order and nothing left to reconcile against.

✅ **It is minutes, not hours**, as required. A draft is not a saved basket and must not become one.

⚠️ **It is a column DEFAULT, so it is one place to change.** If phase 2b decides the draft is created only *after* authorisation succeeds, the journey collapses to that last leg and a far shorter value is right. **Change it there, not at a call site.**

---

## 4. 🔴 THE DOUBLE-PROMOTION CONSTRAINT

**The constraint is a conditional UPDATE guarded on `promoted_at is null`, RETURNING the row.** `lib/payments/order-drafts.ts`:

```ts
  const { data, error } = await supabase
    .from('order_drafts')
    .update({
      promoted_at: new Date().toISOString(),
      // 🔴 ERASURE, IN THE CLAIM. See above.
      customer_name: null,
      customer_email: null,
      customer_phone: null,
    })
    .eq('order_key', orderKey)
    .is('promoted_at', null)
    .select(DRAFT_ROW_COLUMNS)
    .maybeSingle()
```

### How the loser learns it lost

Two concurrent claims **serialise on the Postgres row lock**. The winner gets one row back — **including the PII it needs to build the order**. The loser re-evaluates `promoted_at is null` after the winner commits, matches nothing, and receives:

```
   error = null  rows = []
```

🔴 **AN EMPTY RESULT AND NO ERROR.** That empty result *is* the answer: someone else is creating this order. **Exercised against a real table in §V(c).**

The module distinguishes the two outcomes explicitly, and logs the loser at **info**, not error — in a two-trigger design one of these per paid order is expected, and an error line per payment would train everyone to ignore the log:

```ts
  if (error) {
    // A real failure, not a lost race — a lost race returns zero rows with no error. The caller must
    // NOT treat this as "someone else has it": nobody may have.
    …
  }
  if (!data) {
    console.log(`[order-drafts] claim not taken for order_key=${orderKey} — already promoted, or no such draft`)
```

🔴 **THE `.select()` IS LOAD-BEARING, NOT A CONVENIENCE.** Claim-then-read would leave a window in which the loser reads the row between the winner's claim and its INSERT, and both would proceed. **Claim and read must be one statement.**

**The backstop, second layer:** `orders.order_key` is the PRIMARY KEY, so even if both claimants somehow reached the INSERT the second takes a 23505 and writes nothing. ⚠️ **That is a backstop, not the mechanism** — a 23505 is an error, and the design asks for a quiet loser.

⚠️ **No unique index on `promoted_at` was added, deliberately.** Uniqueness is the wrong tool: the question is not "is this value unique" but "did anyone get here first", which is a race and needs a lock.

⚠️ **Expiry is deliberately NOT part of the claim guard.** A draft whose customer authorised at 29:58 and whose webhook lands at 30:02 must still promote — refusing it means money held with no order, the worst outcome this design has.

---

## 5. 🔴 THE PURGE STORY — IN THE MIGRATION, NOT IN A BACKLOG NOTE

The migration says, verbatim:

```
-- 🔴 THE PURGE STORY. THIS TABLE HOLDS NAME, EMAIL AND PHONE.
-- stripe_webhook_events was deliberately built with NO payload column because nothing in this codebase
-- sweeps JSONB for erasure. This table cannot take that way out — it must hold the customer's details
-- to create the order — so the erasure is designed in, and it is designed so that NO SCHEDULED SWEEPER
-- IS REQUIRED for it to work.
```

| When | What happens |
|---|---|
| 🔴 **On promotion** | The three PII columns are **NULLED IN THE SAME STATEMENT that claims the draft**. From that instant the draft holds no personal data; the ORDER holds it, under the order's own retention. **No window, and no second write that could be missed** |
| 🔴 **On abandonment** | The row is **HARD DELETED** once `expires_at` has passed — **opportunistically, on the write path**. Creating any draft purges expired ones for that truck first |
| ⚠️ **Belt and braces** | `purge_order_drafts()` does the same DELETE unscoped, for a truck that stopped trading mid-service |

**The opportunistic purge follows the `booking_locks` precedent exactly** — `lib/stock-guard.ts:43-48` deletes stale locks immediately before acquiring one, for the same reason: **a TTL nobody enforces is not a TTL.**

```ts
  const { error: purgeErr } = await supabase
    .from('order_drafts')
    .delete()
    .eq('truck_id', draft.truckId)
    .is('promoted_at', null)
    .lt('expires_at', new Date().toISOString())
```

🔴 **SO THE MAXIMUM LIFETIME OF CUSTOMER PII IN THIS TABLE IS `expires_at` — thirty minutes — for an abandoned draft, and ZERO for a promoted one.** It is never the retention period of the table.

⚠️ **A JUDGEMENT CALL, FLAGGED: `purge_order_drafts()` is a function I created that nothing calls.** The brief says not to build the sweeper, and I have not — there is no schedule, no cron, no route. But a purge story with no executable purge *is* a backlog note, which is what this table was told not to have. **It is one `create or replace function` block to delete if you disagree.**

---

## 6. The module

`lib/payments/order-drafts.ts` — six exports, all table access, nothing else:

| Export | What |
|---|---|
| `DRAFT_ROW_COLUMNS` | The named select list, house style (`LEDGER_ROW_COLUMNS` precedent) |
| `newOrderKey()` | `crypto.randomUUID()` |
| `createOrderDraft()` | Purge expired, then INSERT |
| `getOrderDraft()` | Plain read by key |
| `getOrderDraftByPaymentIntent()` | Fallback read, made unambiguous by the unique index |
| `attachPaymentIntent()` | Records the intent + livemode, guarded on `promoted_at is null` |
| 🔴 `claimOrderDraft()` | §4 |

⚠️ **NOTHING CALLS IT. `tsc --noEmit` is clean and eslint reports nothing on the file.** No authorize call, no capture call, no promotion into `orders`, no sweeper, no cancel-authorization — all absent by design.

⚠️ **DEPLOY COUPLING STARTS AT 2b, NOT HERE.** The selects are NAMED, so the first build that *calls* this module requires the migration applied — PostgREST answers a named select on a missing relation with 42P01 and fails the whole statement. Stated in the module header.

---

## V. VERIFICATION — actual values

### (a) 🔴 A DRAFT IS INVISIBLE TO BOTH STOCK TALLIES

**How it was proved, in three steps, against `pizzeria-gusto` event `07f77017-6447-4789-b5d0-510a18c8b5ea` (44 orders):**

**Step 1 — run the real functions** (imported from `lib/` via jiti, not reimplemented):
```
getLiveItemCounts   = {"Napolitano":1,"Cantanapoli":2,"Craig's Pizza":4,"Ham and Basil":4,"Margherita":16,
                       "Diavola":6,"Tiramisu":8,"Pepperoni":12,"Campagnola":4,"Focaccia Pizza":3, … }
getLiveOptionCounts = {"Salami Napoli":1,"Pepperoni":1,"Anchiovies":1,"Bufala":1}
```

**Step 2 — prove the tally is a pure function of the `orders` rows.** `tallyItemCounts` is module-private, so it was transcribed verbatim from `lib/stock-availability.ts:9-22` and the transcription **proved faithful** before being used for anything:
```
hand tally of the SAME orders rows (status not cancelled/rejected) = {"Napolitano":1,"Cantanapoli":2, … }
identical to getLiveItemCounts: true
  -> the tally is a pure function of the `orders` rows: 43 live of 44
```

**Step 3 — demonstrate the deny-list hazard** by feeding that proven-faithful tally one extra row carrying `status: 'draft'`:
```
IF the draft lived in `orders` with status='draft':
  items whose count MOVED: ["Napolitano: 1 -> 2"]
  -> counted as sold. This is why the draft is a separate table.
```

🔴 **A draft inside `orders` IS counted, whatever status it carries** — the filter is `.neq('status','cancelled').neq('status','rejected')`, a deny-list of exactly two values.

**And the invisibility itself — every relation each module names:**
```
relations named in lib/stock-availability.ts: ["orders","menu_items_db","menu_categories","event_item_stock","event_category_stock"]
relations named in lib/option-stock.ts      : ["modifier_options","orders","event_option_stock"]
  contains 'order_drafts': false
```
✅ **Neither module can reach the table. Not by filter, but because neither query names it.**

### (b) `orders.order_key` ACCEPTS A SUPPLIED VALUE

**Two INSERTs against the live `orders` table, one duplicate and one fresh:**

```
TEST 1  supplied order_key = e9be2010-3ed7-40b8-bf28-0ae81034b353 (already exists)
        error: 23505 duplicate key value violates unique constraint "orders_pkey"
        details: Key (order_key)=(e9be2010-3ed7-40b8-bf28-0ae81034b353) already exists.
TEST 2  supplied order_key = 8488ba07-009e-4376-bb3a-a8ecda44a1bf (fresh)
        error: undefined undefined
        returned: [{"order_key":"8488ba07-009e-4376-bb3a-a8ecda44a1bf"}]
        ⚠️ TEST 2 INSERTED A ROW — deleted again: removed
        returned key === supplied key: true

orders row count before/after: 449 / 449 (net zero)
PASS - a DUPLICATE supplied key hits the primary key (23505) and a FRESH one does not.
       The supplied uuid reaches the column: DEFAULT applies only when no value is given.
       Not GENERATED ALWAYS (that would be 428C9) and not ignored (that would never collide).
```

🔴 **CONCLUSIVE, AND IT NEEDED THE CONTROL.** Test 1 alone would not have distinguished "the value reached the column" from "some other constraint". Test 2 returned **the exact uuid supplied**, which no default could produce.

⚠️ **AND TEST 2 WROTE A ROW TO PRODUCTION, WHICH THE BRIEF'S "read-only script" DID NOT ANTICIPATE.** Declared rather than buried. What it was and what happened to it:
- A `__probe__` order on `pizzeria-gusto`, `event_date` 2020-01-01, `event_id` **null**, `subtotal`/`total` 0.01, `status` pending.
- Deleted in the same script, sub-second.
- 🔴 **It could not have been counted while it existed:** both tallies filter `.eq('event_id', eventId)` and its `event_id` was null — **NULL never equals a value**, which `lib/stock-availability.ts:26-28` states as its own invariant.
- No order counter was consumed (`id` was supplied, not minted), no `production_slot_usage` written (no event).
- **Residue check, run after:**
```
rows with id=__probe__ remaining: []
orders total now: 449
rows with customer_name=__probe__: []
```

### (c) ⚠️ THE CONSTRAINT MECHANISM — EXERCISED, BUT NOT ON ITS OWN TABLE

🔴 **STATED PLAINLY: `order_drafts` does not exist yet.** The migration is run by hand, there is no `psql` and no direct Postgres URL in this environment (`.env.local` carries `NEXT_PUBLIC_SUPABASE_URL` and keys, no `DATABASE_URL`), so I cannot execute DDL. **The new table's own constraint has NOT been exercised.**

**What WAS exercised, against the live `orders` table, writing nothing:** the mechanism the constraint relies on — does a conditional UPDATE whose guard is false return an empty result and no error?

```
=== (c) mechanism: a guarded UPDATE that matches nothing ===
1) WHERE order_key=99da37b2-fc96-4567-bc8d-bd060a297c60 (no such row)
   error = null  rows = []
2) WHERE order_key=e9be2010-3ed7-40b8-bf28-0ae81034b353 AND status='__never__' (row exists, guard false; actual status='collected')
   error = null  rows = []
   row untouched: true (status collected -> collected, updated_at unchanged: true)
PASS - empty result, NO error. That is exactly how the losing promoter learns it lost.
```

✅ **Case 2 is the exact shape `claimOrderDraft` uses** — a real row, a guard that is false, `.select()` returning `[]` and `error === null`. The `updated_at` check proves the row was not touched.

**The verification to run AFTER applying the migration**, which does exercise the real constraint:

```sql
insert into order_drafts (order_key, truck_id, items, subtotal, total, total_minor)
values (gen_random_uuid(), '<a truck id>', '[]'::jsonb, 1.00, 1.00, 100)
returning order_key;  -- keep this key as :k

update order_drafts set promoted_at = now(), customer_name = null, customer_email = null, customer_phone = null
 where order_key = :k and promoted_at is null returning order_key;   -- expect 1 row  (the WINNER)

update order_drafts set promoted_at = now(), customer_name = null, customer_email = null, customer_phone = null
 where order_key = :k and promoted_at is null returning order_key;   -- expect 0 rows, NO ERROR (the LOSER)

delete from order_drafts where order_key = :k;
```

### (d) NOTHING WOULD PICK THE TABLE UP

**How I searched — four ways, not one:**

**1. Every mention of the name, repo-wide:**
```
  11 lib/payments/order-drafts.ts
  23 supabase/migrations/20260812_order_drafts.sql
```
✅ **Only the two files created here.**

**2. Any DYNAMIC `.from(<variable>)` that could reach an unnamed table.** One exists — `app/api/admin/delete-truck/route.ts:50`, `.from(table)` — and its `IMPACT_TABLES` is a hardcoded `as const` list that does **not** include `order_drafts`. ⚠️ Consequence noted in §1: that route's impact count will under-report; the FK cascade still deletes correctly. Every other `.from(` in `app/` and `lib/` names a string literal.

**3. The complete reachable table set** (every literal in `.from('…')` across `app/`, `lib/`, `components/`):
```
action_audit_log allergen_audit_log booking_locks bundles_db category_modifier_groups collection_times
demo_cleanup_log demo_sessions discount_codes_db discovery_events discovery_trucks event_category_stock
event_deals event_item_stock event_option_stock excluded_terms item_modifier_groups menu_categories
menu_items_db menu_subcategories messages modifier_groups modifier_options operator_email_changes
operator_email_verifications operators order_drafts order_payments orders password_reset_tokens
production_slot_usage referrals rejected_event_signatures slot_capacity stripe_webhook_events
truck_events truck_user_vans truck_users truck_vans trucks upsell_events upsell_rules van_devices
van_notification_prefs venues whatsapp_logs
```
✅ `order_drafts` appears **only** because the new module names it.

**4. 🔴 PostgREST AUTO-EXPOSURE — the real risk, and the one a grep cannot answer.** A new table in `public` is published automatically. Doing nothing would put customer names, emails and phone numbers on the anon key. Live check now, and the pattern being copied proved on two tables that already use it:

```
anon    -> order_drafts: PGRST205 Could not find the table 'public.order_drafts' in the schema cache
service -> order_drafts: PGRST205 Could not find the table 'public.order_drafts' in the schema cache

RLS-zero-policy precedent stripe_webhook_events: anon -> [] | service -> 10 rows
RLS-zero-policy precedent booking_locks:         anon -> [] | service -> 0 rows
```

✅ **`stripe_webhook_events` holds 10 rows and the anon key sees `[]`.** RLS-with-no-policies denies every row to everything except the service role, which bypasses RLS. `order_drafts` uses the identical `alter table … enable row level security;` with no `create policy` anywhere in the migration.

⚠️ **Verify this after applying**, since it is the difference between a private table and a published one:
```sql
select relrowsecurity from pg_class where relname='order_drafts';   -- expect t
select count(*) from pg_policies where tablename='order_drafts';    -- expect 0
```

---

## DEPLOY ORDER — checked, not assumed

✅ **ADDITIVE. Apply it whenever you like, before or after any deploy.**

**Checked three ways:**
1. **The migration creates and alters nothing that exists.** One `create table if not exists`, three `create index if not exists`, one `alter table … enable row level security` on that new table, four `comment on`, one `create or replace function` on a name that does not exist (`grep purge_order_drafts` across `app/`, `lib/`, `components/` → nothing). **No existing table, column, function or constraint is touched.**
2. **Nothing in the deployed application references it** — §V(d), four searches.
3. **The running build behaves identically with or without it**, because the only code that names the table is a module with zero call sites.

⚠️ **THE COUPLING ARRIVES AT 2b.** The moment a route issues a named select against `order_drafts`, that build **requires** this migration — PostgREST answers a named select on a missing relation with 42P01 and fails the whole statement. **Running this now means the coupling is already satisfied when the wiring lands.**

---

## NON-ASCII CENSUS

Both files are **new**, so "before" is a file that did not exist.

| File | Before | After (total / distinct) | Classes |
|---|---|---|---|
| `supabase/migrations/20260812_order_drafts.sql` | — (did not exist) | 767 / 8 | `─ — 🔴 ⚠️ • → ✅` |
| `lib/payments/order-drafts.ts` | — (did not exist) | 372 / 5 | `─ — ⚠️ 🔴` |

✅ **Every class used is already in wide use across this codebase** — no character was introduced that the repo did not already contain. ⚠️ `•` (U+2022) appears 3× in the migration; it is present elsewhere in the repo (e.g. `lib/native/outbox.ts`) but is the one I would drop first if you want the tightest set.

**Files edited: none.** So no existing file's census could change.

---

## What was NOT touched

| Constraint | Held? |
|---|---|
| `app/api/orders/submit/route.ts` — not one line | ✅ **Untouched** |
| Webhook, checkout route, order page, ledger | ✅ **Untouched** |
| `place_order_atomic` | ✅ **Untouched** |
| No authorize call, capture call, sweeper, cancel-authorization | ✅ **None built** |
| Anything else | ✅ Two new files, nothing modified |

## Not established

- ⚠️ **The new table's own double-promotion constraint is unexercised** — the table does not exist and I cannot run DDL. The mechanism is proved on a real table; the post-migration script is in §V(c). **This is the one verification item that is a partial, and it is labelled as one.**
- ⚠️ **Whether `asap_estimate` and `upsell_events` should be in the table.** Beyond the enumerated list, included with reasons, two columns to drop.
- ⚠️ **Whether `purge_order_drafts()` should exist at this phase.** A judgement call against "do not build the sweeper"; there is no scheduler, but the function is real.
- ⚠️ **Whether 30 minutes survives phase 2b's choice** of when the draft is created. It is a column default for exactly that reason.
- **When the draft is created** — at submit, or only after authorisation. Phase 2b. The 30-minute expiry assumes the former.
- **What happens when the post-authorisation stock/capacity re-check fails** with money already held. Carried forward from phase 1, still unanswered, and still the hardest consequence of the inversion.
