# event_option_stock — the code half, and the migration for you to run

**Code built. 🔴 NO SQL RUN, NO MIGRATION FILE ADDED, NOT DEPLOYED, NOT COMMITTED.**
**`supabase/migrations` still holds 113 files — unchanged.**

---

## VERIFICATION

**SOURCE READ + `grep`/`git` EXECUTION.** 🔴 **I have not run the app, not exercised a toggle, and not
touched the database.** **`npx tsc --noEmit` is clean — SANITY ONLY, not verification**, though it did
not catch the bug I introduced and then fixed (an `&apos;` entity inside a JS **string literal**, which
would have displayed literally; JSX text and a string argument are not the same place).

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · The migration — run this by hand

**Guarded both ways: it aborts if the table is not empty, and aborts if the column is not still `uuid`.**

```sql
BEGIN;

-- GUARD 1 — the table must be empty. It holds zero rows today because every insert has failed with
-- 22P02 since it was created; if that is no longer true, something has changed and this must be
-- inspected before any recast.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.event_option_stock;
  IF n <> 0 THEN
    RAISE EXCEPTION 'ABORT: event_option_stock holds % row(s). Inspect before altering.', n;
  END IF;
END $$;

-- GUARD 2 — the column must still be uuid. Stops a double-apply and stops this running against a
-- shape it was not written for.
DO $$
DECLARE t text;
BEGIN
  SELECT data_type INTO t FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'event_option_stock' AND column_name = 'truck_id';
  IF t IS NULL    THEN RAISE EXCEPTION 'ABORT: event_option_stock.truck_id does not exist.'; END IF;
  IF t <> 'uuid'  THEN RAISE EXCEPTION 'ABORT: truck_id is already %, not uuid. Nothing to do.', t; END IF;
END $$;

ALTER TABLE public.event_option_stock
  ALTER COLUMN truck_id TYPE text USING truck_id::text;

COMMIT;
```

**Verification, to run afterwards — the second query is the one that matters:**

```sql
-- 1. this table
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public' AND table_name = 'event_option_stock'
ORDER  BY ordinal_position;

-- 2. 🔴 THE CLASS CHECK. Every truck_id in the schema, grouped by type.
--    Expect ONE group: text. Any uuid row is another instance of this bug.
SELECT data_type, count(*) AS tables, string_agg(table_name, ', ' ORDER BY table_name) AS which
FROM   information_schema.columns
WHERE  table_schema = 'public' AND column_name = 'truck_id'
GROUP  BY data_type;
```

⚠️ **Query 2 is also the query that would have caught this at any point in the last months, and it is
worth keeping.**

---

## 2 · 🔴 THE SILENT SUCCESS — fixed at all three layers

**It was not two bugs. It was three layers each independently reporting success.**

### Layer 1 — the route discarded the write result

| | `app/api/dashboard/action/route.ts` |
|---|---|
| **Before** | `await supabase.from('event_option_stock').upsert({…})` — **result not destructured** — then `return NextResponse.json({ success: true })` |
| **After** | `const { error: eosErr } = await …upsert(…)`; `if (eosErr) return optionStockWriteFailure(…)` |
| Sites | `set_modifier_option_available` and `set_modifier_option_stock` |

### Layer 2 — 🔴 the `if (opt)` fall-through, which I had not previously reported

```ts
if (opt) { …the entire write… }
return NextResponse.json({ success: true })   // ← OUTSIDE the if
```

**A missing option, or a failed option lookup, skipped the write entirely and still answered
`{ success: true }`.** **Now:** `if (optErr || !opt) return optionStockWriteFailure(…)`.

### Layer 3 — the caller ignored the answer

| | `app/dashboard/[token]/page.tsx` — `updateModifierOptionAvailable` / `updateModifierOptionStock` |
|---|---|
| **Before** | `const r = await gatedAction(…); if (r.queued) showToast('Stock saved')` — 🔴 **`r.ok` was never read.** A route error left the optimistic patch on screen and said nothing |
| **After** | `if (r.queued) { showToast('Stock saved'); return }` then `if (!r.ok) { showToast('Couldn't save that extra. Check it before service.','error'); fetchMenu(truck.id, pin) }` |

**Re-pulling the menu rather than un-patching by hand:** `/api/menu` resolves the event override, so the
screen returns to what the server actually holds instead of a second guess at it.

### What the caller and the operator now see on a failure

**The new helper classifies the failure, mirroring `isRetryableFailure` in `lib/native/orderGate.ts`:**

| Error | Status | What the offline gate does | What the operator sees |
|---|---|---|---|
| **22xxx** (data exception — incl. **22P02**, today's failure) | **400** | 🔴 **Terminal — NOT queued, NOT retried.** The same bytes will fail again; it needs a schema fix | Red toast **"Couldn't save that extra. Check it before service."**, and the toggle **snaps back to the truth** |
| Anything else | **503** + `Retry-After: 10`, `retryable: true` | ✅ **Queued** and replayed by the outbox | *"Stock saved"* — because on native it genuinely **is** saved, on the device |
| Success | 200 | — | Unchanged |

> 🔴 **The 400 choice is deliberate: before you run the migration, every one of these writes still fails
> with 22P02. Returning 503 would queue each one, retry it for 12 hours and then raise the red PAYMENT/
> status conflict banner. A terminal 400 tells the operator once and stops.**

---

## 3 · The four reads

**All four bound the error and were discarding it. Each now logs what it fell back to.**

| # | File · line | On a genuine failure |
|---|---|---|
| **R1** | `app/api/dashboard/action/route.ts` — required-group order guard | Falls back to the **template**. ✅ Right for an order guard — never block a valid order on a read blip — but now logged: *"per-event sold-out NOT enforced"* |
| **R2** | `app/api/menu/[truckId]/route.ts` — the customer read | Falls back to the **template**. ✅ Right — never hide a menu on a blip. 🔴 **But the consequence is now stated: an extra the operator marked sold out for this event stays on sale to customers** |
| **R3** | `lib/option-stock.ts` — `buildOptionCeiling` | Ceiling falls back to the **template** |
| **R4** | `lib/option-stock.ts` — `findSoldOutOption` | Gates on the **template** only |

> **Falling back to the template is defensible in all four, and it is what they already did. What changes
> is that a failure is now distinguishable from "this event has no overrides" — which is the thing an
> empty result set could never tell you.**

---

## 4 · The catch blocks

**`lib/option-stock.ts` — both `catch` blocks, and both docblocks.**

**They were not dead code, and I did not delete them.** They are reachable — for a genuine JS throw from
the tally/resolve helpers. **What they could never catch is the class they claimed:** the Supabase client
**returns** `{ data, error }`, so **every 22P02 since the table was created flowed straight past them
while the log line advertised a fail-open that had not happened.**

**Now:** the DB-error class is handled inline at each call site (§3), and the catch says what it actually
catches — *"THREW (not a DB error — those are handled inline) — proceeding fail-open"*. **The two
docblocks claiming "FAIL-OPEN on error" now say which failure goes down which path.**

---

## 5 · What an operator sees — before and after

### Today

An operator opens **Menu & Stock**, marks an extra (say *Halloumi*) **sold out for tonight's event**:

1. The toggle flips — **optimistic patch**, purely local.
2. The write fails with **22P02**. The route answers **`{ success: true }`**.
3. The caller ignores it. **No toast, no error, nothing.**
4. On the next refresh, `/api/menu` reads the override table, **the read also fails**, and the **template**
   is served — so **the toggle silently returns to "available"**.
5. **The customer menu never showed it as sold out**, and the order guard never blocked it.

> 🔴 **THIS FEATURE HAS NEVER WORKED, ON ANY EVENT, FOR ANY TRUCK. The table holds zero rows.**

### 🔴 Has an operator configured something they believe is in effect?

**Any operator who has ever marked a per-event extra sold out believes it took. It did not, on every
occasion, and the extra stayed on sale.** ⚠️ **I cannot tell you how often that has happened** — the
failure was never logged, so there is no record of an attempt. **Worth asking both operators directly
before Friday**, because the answer decides whether anyone has been selling an extra they thought was off.

### After the migration + this code

- The toggle **persists** and survives a refresh.
- The **customer menu** hides / marks it sold out **for that event only**; the template is untouched.
- The **order guard** and `findSoldOutOption` block an operator-placed order for it.
- A failure is **visible**: a red toast and the toggle snapping back, instead of silence.

⚠️ **Still stage 1, and unchanged by this work:** the order-time **decrement** still draws the shared
template pool (`route.ts` comments at both write sites). **Availability is event-scoped; consumption is
not.**

---

## 6 · PLANNED, NOT BUILT — dropping `truck_id`

**The case is strong. Full change list so you can weigh it:**

**SQL** — `ALTER TABLE public.event_option_stock DROP COLUMN truck_id;` (same two guards).

**Code — 6 sites, all deletions:**

| File | Change |
|---|---|
| `app/api/dashboard/action/route.ts` (write ×2) | drop `truck_id: truck.id,` from both upsert payloads |
| `app/api/dashboard/action/route.ts` (read R1) | drop `.eq('truck_id', truck.id)` |
| `app/api/menu/[truckId]/route.ts` (R2) | drop `.eq('truck_id', truck.id)` |
| `lib/option-stock.ts` (R3, R4) | drop `.eq('truck_id', truckId)` from both |

**Why it is safe — established, not assumed:**

- **The PK is `(event_id, option_id)`.** `truck_id` is in **no constraint and no index**, so no uniqueness
  or lookup depends on it.
- **`event_id` implies the truck** via `truck_events(id)`.
- 🔴 **The delete cascade does NOT use it.** `lib/delete-truck.ts:52` documents `event_option_stock` as
  cascading **"via truck_events"**, and it is **absent from `NO_ACTION_TABLES` (`:36-43`)** — so nothing
  deletes it by `truck_id`.

**What you would lose:** the `.eq('truck_id', …)` filters are a **defence-in-depth tenancy check** on every
read. Dropping the column removes a redundant belt while the FK braces stay. ⚠️ **It also makes this the
only event-scoped stock table without `truck_id`** — `event_item_stock` and `event_category_stock` both
have it, so the three stop being uniform.

> **My reading: take the ALTER now (uniform with the other 42 tables, zero code change, feature starts
> working), and treat the DROP as a separate tidy that also wants the two sibling tables to keep it
> company. Not my call.**

---

## 7 · Other tables with no migration behind them

🔴 **I CANNOT ESTABLISH THIS FROM THE REPOSITORY ALONE, and I am not going to imply otherwise.** The repo
shows what migrations *describe*; it cannot distinguish "created in the Supabase UI before
`supabase/migrations` existed" from "applied by hand last month".

**What I did establish, by diffing `.from('…')` call sites against 113 migration files:**

```
tables referenced in code:                      46
of those, CREATE TABLE'd in a migration:        20
of those, mentioned anywhere in a migration:    36
```

🔴 **TEN tables are referenced in code and appear NOWHERE in any migration — not created, not altered,
not indexed:**

`bundles_db` · `category_modifier_groups` · `discount_codes_db` · `event_deals` ·
**`event_option_stock`** · `menu_subcategories` · `password_reset_tokens` · `referrals` ·
`slot_capacity` · `truck_user_vans`

**A further 16** (`trucks`, `orders`, `truck_events`, `modifier_options`, `event_item_stock`,
`event_category_stock`, …) are **altered or indexed** by migrations but **never created** by one.

> ⚠️ **`event_option_stock` sits in the first group — consistent with "applied by hand", though the repo
> cannot prove the mechanism.** **The other nine in that group are worth the same look**, and any of them
> could carry the same class of mistake.

**The query that settles it — run alongside the migration:**

```sql
-- every table, so you can diff against supabase/migrations by hand
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER  BY table_name;

-- 🔴 THE ONE THAT MATTERS: every truck_id column and its type.
--    One row (text) = clean. A uuid row = another instance of this exact bug.
SELECT data_type, count(*) AS tables, string_agg(table_name, ', ' ORDER BY table_name) AS which
FROM   information_schema.columns
WHERE  table_schema = 'public' AND column_name = 'truck_id'
GROUP  BY data_type;

-- and the same sweep for the other id columns that are text elsewhere
SELECT column_name, data_type, count(*) AS tables, string_agg(table_name, ', ' ORDER BY table_name)
FROM   information_schema.columns
WHERE  table_schema = 'public' AND column_name IN ('event_id','option_id','item_name','van_id')
GROUP  BY column_name, data_type
ORDER  BY column_name, data_type;
```

---

## Scope

| | |
|---|---|
| **Files changed by this task** | `app/api/dashboard/action/route.ts`, `app/api/menu/[truckId]/route.ts`, `app/dashboard/[token]/page.tsx`, `lib/option-stock.ts` |
| SQL run | 🔴 **NONE** |
| Migration files added | 🔴 **NONE** — still 113 |
| Deployed / committed | **Neither** |

⚠️ `components/native/OfflineBanner.tsx` and `lib/native/orderGate.ts` also show modified — **prior tasks'
uncommitted work, untouched here.**

---

## What I could not establish

1. 🔴 **That any of this works.** **No app run, no toggle exercised, no database touched.** The 22P02 →
   400 path in particular is **reasoned from the error code, not observed.**
2. 🔴 **Whether an operator has a per-event extra they believe is off.** **§5 — worth asking them.**
3. **Whether the sibling writes have the same defect.** ⚠️ **They do, in form**: `set_stock` (`:1904`) and
   `set_category_stock` (`:1920`) also discard the upsert result and return unconditional success. **Their
   tables' `truck_id` is text so the writes succeed — the silent-success pattern is latent there, not
   active. I did not change them; you scoped this task to `event_option_stock`.**
4. **The order-time decrement is still template-scoped** (stage 2), so this fix makes availability
   event-scoped while consumption stays shared.
