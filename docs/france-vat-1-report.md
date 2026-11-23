# france-vat-1 — a VAT rate per item, the tax per rate on receipts and in the accountant's file, and finished orders locked

*24 November 2026 · branch `france-vat-1` (from `59ae6161`) · not pushed, not deployed.*

## Summary

- **Every truck in every country** can now keep one rate for everything, or give each item its own rate, in Manage › Payments › "Item rates".
- **A mixed order is taxed per rate.** France's crêpe at 10 %, can at 5,5 % and cider at 20 % make three « Dont TVA » lines on the customer email and the ticket. The accountant's Orders CSV gets a Net and a Tax column per rate.
- **Every single-rate order is byte-identical to before:** 43 orders × 9 outputs, against the tree before this work. That includes every GB truck with no rate set.
- **The server now refuses** to edit or cancel a collected, cancelled or rejected order.
- **The migration ran** (additive; same function signature). Proof: `scripts/france-vat-1.cjs` **61 passed, 0 failed**. The sweep shows nothing broken that wasn't already failing on the base commit (§8).

| # | Item | Outcome |
|---|---|---|
| 1 | Data | **Done.** `menu_items_db.tax_rate_milli` (NULL = the default); every new order line stamped with its dish id and rate; `tax_breakdown` on orders and drafts. |
| 2 | Pricing rules | **Done.** One shared engine for the server and the previews (`lib/order-tax.ts`): deal split, discount spread, largest remainder, tax rounded once per rate. |
| 3 | Order paths | **Done.** Customer submit, card drafts and promotion, walk-up / Add order, operator edit (rate-locked), the pay-at-the-truck switch. Previews: the order page, Add order, the dashboard edit. |
| 4 | Migration | **Run and verified** (§3). |
| 5 | Manage › Payments | **Done.** The card in every country; "No VAT" where prices include tax with no default; the "Item rates" popup; the limit is now 0–30 %. |
| 6 | Customer output | **Done.** The customer email and the ticket only. The truck's new-order email is unchanged (decision 3). |
| 7 | Reports | **Done.** The ledger and both accountant CSVs use the breakdown; per-rate columns in the Orders CSV. Reports › Orders/Items CSVs unchanged. |
| 8 | Lock | **Done.** `edit` and `cancel` refuse finished orders for every actor and path. |

## Things you should know first

1. **One small change outside the brief, on screens.** The status page, the dashboard card and the truck's new-order email draw one tax line from a shared function.
   - On a **mixed-rate order where tax is added on top** (US-style), that line now shows **no rate** ("Sales tax: $0.93"). Before, it would have shown a rate that isn't true of the order ("Sales tax 8.25%").
   - Single-rate orders are untouched (proved, §6). Mixed orders don't exist yet.
   - To make the status page see this, `tax_breakdown` was added to `/api/orders/[id]`'s named select. Nothing else on that page changed.
   - Say if you'd rather it kept the default rate.
2. **Another session (inbox-1) worked in this folder while I did, and committed onto `france-vat-1`.** Its commits are `09f191df` (a migration), `fbc98a34` and `8e6104f4`. I never staged or changed its files; my three commits contain only mine. Its work causes 4 sweep failures (§8), and its `inbox-1.cjs` fails the runner's screen. You may want to move its commits to their own branch.
3. **The full sweep can't run as listed.** enquiries-backend-1's harness (`scripts/enquiries-backend-1.cjs`) fails the runner's safety screen on HEAD, so `node scripts/run-harnesses.cjs` refuses everything. I ran the sweep from a copy of the list without it (§8) and didn't touch that file.
4. **The "old-style call" proof is structural, not executed.** I tried an in-memory Postgres (PGlite via npx) and the permission system refused it. I didn't work around that, and I didn't write test rows to the live database. Proof: the live definition read with `pg_get_functiondef` = 20261010_18's body. The new body is that plus one column, and the harness checks the text. The signature and grants were re-read live after the run. The click-through (§10) has one order placed on the live site, which is the real old-style call.
5. **Deal fallback: none found.** No order has ever carried a deal (0 deal lines, all time). Of the 6 deals defined, 3 have slot categories. None has every slot without a priced dish. One deal has one slot whose category has no priced dish: that share is 0, not a fallback. The 3 deals without slot categories would fall back to the default rate if ordered with no dish chosen.
6. **The 0–30 % limit:** no enabled country's standard rate is above 27 %, so nothing is blocked now. The old 20 % blocked (for example) Ireland 23 %, Denmark, Norway and Sweden 25 %, and Hungary 27 %.

---

## 1 · What changed, by area

**Data and pricing**
- `lib/order-tax.ts` (new): the split.
  - `lineTax()` takes the priced lines and deals, the food after the discount, the book, the default rate and, for an edit, the stored order. It returns each line's stamp, each deal's split, the food parts per rate and any deal fallbacks.
  - Also: `allocate()` (largest remainder), `stampItems` / `stampDeals`, `taxBookFrom`, `bookHasOwnRates`.
- `lib/order-charges.ts`:
  - `computeOrderCharges` takes optional `foodParts` and stores `tax_breakdown`;
  - `chargesForEdit(…, foodParts)`;
  - `chargesForHatchSwitch` keeps the stored split;
  - `storedBreakdown`, `storedFoodParts`, `includedTaxOfMinor`;
  - `tax_breakdown` is one of `ORDER_CHARGE_COLUMNS`, so drafts carry it and promotion copies it.
- `lib/order-charge-rules.ts`: where prices include tax and the format has no default (GB, IE…), the truck's own rate is honoured. NULL = No VAT, as every existing truck has.
- `lib/order-repricing.ts`: the price book also reads each dish's `id` and `tax_rate_milli`; `taxBookOf()`.
- `lib/charge-settings.ts`: `MAX_RATE_MILLI = 30000`; every country takes a rate (the `charges_rate_not_here` refusal is gone).

**Order paths**
- `app/api/orders/submit/route.ts`: stamp, split, parts into the engine (the draft and the RPC both carry it).
- `app/api/dashboard/action/route.ts`:
  - walk-up: stamp and split;
  - edit: rate-locked (`stored`), `chargesForEdit(…, editTax.parts)`;
  - **the lock** (`FINISHED_STATUSES`);
  - the ready email's named select gains `tax_breakdown`.
- Card drafts and promotion: unchanged code. The snapshot column list carries the breakdown, and `promote-draft` already copies `chargeColumnsOf(draft)` and the draft's (stamped) items.
- Previews:
  - `app/(app)/trucks/[slug]/order/page.tsx`, `components/dashboard/AddOrderPanel.tsx`, `app/(app)/dashboard/[token]/page.tsx`: the same `lineTax`, only where tax is added on top and a dish has its own rate. Prices that include tax never change a total.
  - `app/api/menu/[truckId]/route.ts`: an item's `tax_rate_milli` is sent **only when it has one**.

**Receipts**
- `lib/order-charge-lines.ts`:
  - `includedTaxLines()` (one line per rate, ascending, 0 % left out);
  - `chargeLinesFor(…, { perRate })`;
  - `chargeSourceOf` carries the breakdown.
- `lib/email.ts`: the customer confirmation uses per-rate lines. `formatNewOrderEmail` is untouched.
- `lib/printing/mapOrderToTicket.ts`, `lib/printing/ticket.ts`: `includedTax` is the single object it always was for one rate, and a list for several.

**Reports**
- `lib/accounts/ledger.ts`:
  - `orderTax` prefers the breakdown;
  - each row has `rates` (Net and Tax by rate, adding up exactly);
  - `ratesIn()`.
- `lib/accounts/csv.ts`: per-rate columns after Profit, **only when the file holds two or more rates**.
- `app/api/manage/route.ts`: `get_report` reads the breakdown for the accounts and strips it from the orders list (same response shape).
- Manage page: the CSV words.

**Manage › Payments**
- `components/manage/ChargesCard.tsx`: three forms:
  - tax added (US);
  - included with a default (France);
  - included with no default (GB etc.: a dropdown, "No VAT" first and selected for every existing truck).
  - Each gets an "Item rates" row.
- `components/manage/ItemRatesModal.tsx` (new).
- `lib/item-rates.ts` (new): the quick rates (FR 5,5 / 10 / 20; GB 0 / 5 / 20), the default as shown, and the count.
- `app/api/manage/route.ts`: `get_item_rates` and `set_item_rates` (owner or admin, like `update_charges`).

**Words**
- 24 new en-GB strings, and the range message now says 0 to 30 %.
- Translated into the **54 language bases an enabled country uses**, with back-translations: 4 translation agents.
- es-MX overrides (13), de-CH (ß → ss, 2), en-US "canceled", en-CA "cancelled".
- vi, hi, ur, fil and ta are untouched (no enabled country uses them).
- **translation-check: structural 0 in all 54.** The split files are regenerated.

**Proof:** `scripts/france-vat-1.cjs` (new, registered).

## 2 · The rules as implemented, with the worked example

- **A dish line:** its own rate, else the order's default. Its extras are inside its unit price and take the same rate.
- **A deal:** its price (bundle + slot extras) is split across its chosen dishes in proportion to their à-la-carte prices (the price book's, i.e. the price at that event). Each share takes that dish's rate.
  - Fallback: the whole deal takes the default rate when a dish isn't on the menu, every chosen dish is priced 0, or no dish is chosen. It is logged as `[order-tax] deal fallback` and returned.
- **A discount** (codes, and any reduction already in the food total): the food after it is allocated by each rate's pre-discount total.
- **Largest remainder:** each share is `floor(total × w ÷ W)`. The leftover units go one each to the largest remainders (ties to the earlier line), so the parts always add up exactly.
- **Tax per rate**, rounded once on each rate's total:
  - included: `round(gross × r ÷ (100 % + r))`, the formula receipts already used;
  - added: `net × r`, D3's rounding.
  - Total tax = the sum.
  - Where the country taxes fees, they go on the default rate's row (no country does today).
- **One rate (every line the same):** one part, which is exactly the old calculation.
- **Rate-lock on edits:**
  - a line already on the order keeps its stamped rate;
  - an older, unstamped line takes the order's stored rate;
  - an added line takes its dish's rate, else the order's stored default.
- **`tax_rate_milli`** on the order: the single rate, or the default when mixed.
- **`tax_breakdown`:** NULL when the order has no rate at all (every GB truck with No VAT), so its accountant row still says "no tax rate set".

**Worked example** (France, prices include TVA; default 10 %):

| | Crêpe 8,50 € @ 10 % | Canette 2,50 € @ 5,5 % | Cidre 4,00 € @ 20 % | Total |
|---|---|---|---|---|
| Food by rate | 8,50 | 2,50 | 4,00 | 15,00 € |
| TVA (rounded once per rate) | 8,50 × 10/110 = 0,7727 → **0,77** | 2,50 × 5,5/105,5 = 0,1303 → **0,13** | 4,00 × 20/120 = 0,6667 → **0,67** | **1,57 €** |
| Receipt lines, ascending | « Dont TVA 10 % : 0,77 € » (2nd) | « Dont TVA 5,5 % : 0,13 € » (1st) | « Dont TVA 20 % : 0,67 € » (3rd) | |

**With a 10 % code** (15,00 € − 1,50 € = 13,50 €):
- the 13,50 € is allocated 850 : 250 : 400 → 7,65 / 2,25 / 3,60 (exact, no remainder);
- TVA: 7,65 × 10/110 = 0,695 → **0,70**; 2,25 × 5,5/105,5 = 0,117 → **0,12**; 3,60 × 20/120 → **0,60**; total **1,42 €**.

**Accountant row** (no code):
- Tax 1,57 € "stored", Net 13,43 €;
- by rate: Net 2,37 / 7,73 / 3,33 and Tax 0,13 / 0,77 / 0,67;
- the CSV columns after Profit: `Net 5.5%, Tax 5.5%, Net 10%, Tax 10%, Net 20%, Tax 20%`.

**A mixed deal:** a Formule at 10,00 € (crêpe 8,50 € + can 2,50 € à la carte) splits 850 : 250 → 7,73 € at 10 % and 2,27 € at 5,5 %.

## 3 · The migration and every SQL statement run

**File:** `supabase/migrations/20261124_france_vat_1.sql` (commit `c91b7a59`).
- **New columns** (all nullable, nothing backfilled): `menu_items_db.tax_rate_milli` (0–30000) and `orders.tax_breakdown` / `order_drafts.tax_breakdown` (jsonb, an array or NULL).
- **Wider rate checks:** trucks, orders and order_drafts go from 0–20000 to 0–30000.
- **`place_order_atomic_v2`** is replaced with the same name, signature and grants. Its one change: it also writes `nullif(p_order->'tax_breakdown', 'null'::jsonb)`. The deployed code never sends the key, so its orders store NULL, as today.

Run:
```
npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261124_france_vat_1.sql
db-migrate: supabase/migrations/20261124_france_vat_1.sql · sha256 8b8b0b4b6a2ffdc9 · committed at c91b7a59
db-migrate: supabase/migrations/20261124_france_vat_1.sql applied — one transaction, no error
```
(Its "pages not told" warning: REVALIDATE_SECRET isn't set locally. No marketing page reads these columns.)

The full migration as run:
```sql
-- 20261124_france_vat_1.sql
-- france-vat-1 (24 November 2026, docs/france-vat-1-report.md): A VAT RATE PER ITEM, A PER-RATE BREAKDOWN ON EACH ORDER, AND
-- RATES UP TO 30 %.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE WITH THE DEPLOYED CODE (the live site uses this database):
--    • menu_items_db.tax_rate_milli — NEW, NULLABLE. NULL = "use the truck's default rate" (trucks.tax_rate_milli, else the
--      address format's default). Nothing is backfilled: every existing dish is NULL, so every existing truck is unchanged.
--    • orders.tax_breakdown / order_drafts.tax_breakdown — NEW, NULLABLE jsonb: one object per rate,
--      {rate_milli, food_minor, gross_minor, net_minor, tax_minor}. Old orders stay NULL and every reader handles NULL as today.
--    • The three existing tax_rate_milli CHECKs (trucks, orders, order_drafts) widen from 0–20000 to 0–30000 (0 % to 30 %), so
--      Ireland's 23 % and the 25–27 % countries fit. Widening accepts every row the old check accepted; the deployed code still
--      refuses anything above 20 % itself, so nothing it writes changes.
--    • place_order_atomic_v2 is replaced IN PLACE with the SAME NAME, SAME SIGNATURE and SAME GRANTS (the 20261010_18 pattern).
--      Its only change: it also writes tax_breakdown from p_order->'tax_breakdown'. NO NEW PARAMETER, so there is no overload
--      and no ambiguity. The deployed code never sends the key, so its orders store NULL there: exactly what it stores today.
--      ⚠️ nullif(…, 'null'::jsonb): a JSON null in p_order must store SQL NULL, never the jsonb literal null.
--    • Nothing is dropped except the three CHECK constraints, which are re-added wider in the same transaction. No rename.
--      No row is updated or deleted.
--
-- VERIFY AFTER APPLYING: the read-only block at the end of this file.

set lock_timeout = '3s';

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The new columns
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.menu_items_db add column if not exists tax_rate_milli integer;
alter table public.orders        add column if not exists tax_breakdown  jsonb;
alter table public.order_drafts  add column if not exists tax_breakdown  jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'menu_items_db_tax_rate_milli_chk' and conrelid = 'public.menu_items_db'::regclass) then
    alter table public.menu_items_db add constraint menu_items_db_tax_rate_milli_chk check (tax_rate_milli between 0 and 30000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_tax_breakdown_array_chk' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_tax_breakdown_array_chk check (tax_breakdown is null or jsonb_typeof(tax_breakdown) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_drafts_tax_breakdown_array_chk' and conrelid = 'public.order_drafts'::regclass) then
    alter table public.order_drafts add constraint order_drafts_tax_breakdown_array_chk check (tax_breakdown is null or jsonb_typeof(tax_breakdown) = 'array');
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The rate limit: 0–20000 → 0–30000 on the three existing columns (drop and re-add, same names)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.trucks       drop constraint if exists trucks_tax_rate_milli_chk;
alter table public.trucks       add  constraint trucks_tax_rate_milli_chk       check (tax_rate_milli between 0 and 30000);
alter table public.orders       drop constraint if exists orders_tax_rate_milli_chk;
alter table public.orders       add  constraint orders_tax_rate_milli_chk       check (tax_rate_milli between 0 and 30000);
alter table public.order_drafts drop constraint if exists order_drafts_tax_rate_milli_chk;
alter table public.order_drafts add  constraint order_drafts_tax_rate_milli_chk check (tax_rate_milli between 0 and 30000);

comment on column public.menu_items_db.tax_rate_milli is
  'france-vat-1: this dish''s own tax rate, thousandths of a percent (10 % = 10000; 0–30 %). NULL = the truck''s default (trucks.tax_rate_milli, else the address format''s). Its extras take the same rate.';
comment on column public.orders.tax_breakdown is
  'france-vat-1: the tax per rate, [{rate_milli, food_minor, gross_minor, net_minor, tax_minor}] ascending by rate, covering dishes, extras and deals after the discount. NULL on orders placed before france-vat-1 and on orders with no rate at all (every UK truck with no VAT set). Readers prefer it to tax_rate_milli when present.';
comment on column public.order_drafts.tax_breakdown is
  'france-vat-1: the same per-rate breakdown as orders.tax_breakdown; copied to the order on promotion.';
comment on column public.trucks.tax_rate_milli is
  'The truck''s default tax rate, in thousandths of a percent (8.875% = 8875; 0–30 %). NULL = none set (the address format''s default where it has one, else no tax). france-vat-1: also honoured where prices include tax and the format has no default (GB, IE …), where NULL means "No VAT".';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. place_order_atomic_v2, replaced: identical to the live definition (20261010_18, read with pg_get_functiondef on
--    24 November 2026) except that it also writes `tax_breakdown`.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function place_order_atomic_v2(
  p_order      jsonb,
  p_final_slot text,
  p_status     text,
  p_event_id   uuid,
  p_truck_id   text,
  p_event_date date,
  p_unit_rows  jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_order_number integer;
  v_order_key    uuid;
  v_row          jsonb;
begin
  -- DISPLAY NUMBER: event counter first, truck-level fallback when there is no event.
  if p_event_id is not null then
    v_order_number := increment_event_order_counter(p_event_id);
  end if;
  if v_order_number is null then
    v_order_number := increment_order_counter(p_truck_id);
  end if;
  if v_order_number is null then
    raise exception 'could not generate order number (truck %, event %)', p_truck_id, p_event_id;
  end if;

  -- INSERT the order (order_key + created_at/updated_at via column defaults; currency and country via
  -- orders_fill_currency_country).
  insert into orders (
    id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
    event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
    total, total_minor, notes, status, payment_status, placed_at,
    food_minor, tax_minor, tax_rate_milli, tax_inclusive, tax_label, tip_minor, tip_pct_bps,
    service_fee_minor, service_fee_recipient, card_surcharge_minor, card_funding, card_fee_payer,
    application_fee_minor, tax_breakdown
  ) values (
    v_order_number::text,
    p_truck_id,
    p_order->>'customer_name',
    p_order->>'customer_email',
    p_order->>'customer_phone',
    p_final_slot,
    coalesce(p_order->>'order_type', 'collection'),
    p_event_date,
    p_event_id,
    nullif(p_order->>'van_id', '')::uuid,
    coalesce(p_order->'items', '[]'::jsonb),
    p_order->'deals',
    p_order->>'discount_code',
    (p_order->>'subtotal')::numeric,
    coalesce((p_order->>'discount_amt')::numeric, 0),
    (p_order->>'total')::numeric,
    -- 🔴 THE GRAND TOTAL, AS THE CALLER COMPUTED IT IN MINOR UNITS (fallback: round(total × 100)).
    coalesce((p_order->>'total_minor')::integer, round(coalesce((p_order->>'total')::numeric, 0) * 100)::integer),
    p_order->>'notes',
    p_status,
    coalesce(p_order->>'payment_status', 'unpaid'),
    -- SERVER-MINTED. Never read from p_order.
    now(),
    (p_order->>'food_minor')::integer,
    coalesce((p_order->>'tax_minor')::integer, 0),
    (p_order->>'tax_rate_milli')::integer,
    (p_order->>'tax_inclusive')::boolean,
    p_order->>'tax_label',
    coalesce((p_order->>'tip_minor')::integer, 0),
    (p_order->>'tip_pct_bps')::integer,
    coalesce((p_order->>'service_fee_minor')::integer, 0),
    p_order->>'service_fee_recipient',
    coalesce((p_order->>'card_surcharge_minor')::integer, 0),
    p_order->>'card_funding',
    p_order->>'card_fee_payer',
    (p_order->>'application_fee_minor')::integer,
    -- france-vat-1: absent (every deployed caller) → SQL NULL; a JSON null → SQL NULL too.
    nullif(p_order->'tax_breakdown', 'null'::jsonb)
  )
  returning order_key into v_order_key;

  -- BOOK capacity, EVENT-SCOPED: only when there's an event AND TS-computed rows (booked).
  if p_event_id is not null and p_unit_rows is not null then
    delete from production_slot_usage where truck_id = p_truck_id and event_id = p_event_id;
    for v_row in select * from jsonb_array_elements(p_unit_rows) loop
      insert into production_slot_usage (truck_id, event_id, event_date, production_slot, units_by_cat, updated_at)
      values (p_truck_id, p_event_id, p_event_date, v_row->>'production_slot', v_row->'units_by_cat', now());
    end loop;
  end if;

  return jsonb_build_object(
    'order_key',    v_order_key,
    'order_number', v_order_number,
    'slot',         p_final_slot
  );
end;
$$;

-- Service role only, exactly as 20261010_17 / _18 set it (create or replace keeps grants; restated so a second run is exact).
revoke all on function public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb) to service_role;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only). Run after the block above.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The three new columns (expect 3 rows, all nullable, no default):
--   select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
--    where table_schema = 'public' and ((table_name = 'menu_items_db' and column_name = 'tax_rate_milli')
--       or (table_name in ('orders', 'order_drafts') and column_name = 'tax_breakdown')) order by 1, 2;
-- 2. The six CHECKs (expect 6 rows; the three rate checks say 30000):
--   select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('menu_items_db_tax_rate_milli_chk', 'orders_tax_breakdown_array_chk', 'order_drafts_tax_breakdown_array_chk',
--                      'trucks_tax_rate_milli_chk', 'orders_tax_rate_milli_chk', 'order_drafts_tax_rate_milli_chk') order by 2;
-- 3. ONE place_order_atomic_v2, the same signature, service role only (expect 1 row: false, false, true):
--   select pg_get_function_identity_arguments(oid), has_function_privilege('anon', oid, 'execute'),
--          has_function_privilege('authenticated', oid, 'execute'), has_function_privilege('service_role', oid, 'execute')
--     from pg_proc where proname = 'place_order_atomic_v2' and pronamespace = 'public'::regnamespace;
-- 4. Nothing switched on (expect 0, 0):
--   select (select count(*) from public.menu_items_db where tax_rate_milli is not null),
--          (select count(*) from public.orders where tax_breakdown is not null);
```

**Read-only SQL run (Supabase MCP), before:**
```sql
select locale, count(*) as countries, string_agg(country_code, ',' order by country_code) codes from public.country_settings where enabled group by locale order by locale;
```
```sql
select t.country, cs.prices_include_tax, cs.address_format, count(*) filter (where t.tax_rate_milli is not null) as trucks_with_rate, count(*) filter (where t.tax_rate_bps is not null) as with_old_bps, count(*) as trucks
from public.trucks t left join public.country_settings cs on cs.country_code = t.country
group by 1,2,3 having count(*) filter (where t.tax_rate_milli is not null) > 0 or count(*) filter (where t.tax_rate_bps is not null) > 0 order by 1;
```
→ only one US truck holds a rate. **No truck in a tax-included country holds a stale rate**, so honouring one in GB/IE changes nothing.
```sql
select country_code, prices_include_tax, fees_taxed, service_fee_allowed from public.country_settings where fees_taxed order by 1;
```
→ none.
```sql
select pg_get_functiondef('public.place_order_atomic_v2(jsonb, text, text, uuid, text, date, jsonb)'::regprocedure) as def;
```
→ identical to 20261010_18's.

**After the migration (verify):**
```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
 where table_schema = 'public' and ((table_name = 'menu_items_db' and column_name = 'tax_rate_milli')
    or (table_name in ('orders', 'order_drafts') and column_name = 'tax_breakdown')) order by 1, 2;
```
→ 3 rows, nullable, no default.
```sql
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def from pg_constraint
 where conname in ('menu_items_db_tax_rate_milli_chk', 'orders_tax_breakdown_array_chk', 'order_drafts_tax_breakdown_array_chk',
                   'trucks_tax_rate_milli_chk', 'orders_tax_rate_milli_chk', 'order_drafts_tax_rate_milli_chk') order by 2;
```
→ 6 rows; the rate checks say 30000.
```sql
select pg_get_function_identity_arguments(oid) as args, has_function_privilege('anon', oid, 'execute') as anon,
       has_function_privilege('authenticated', oid, 'execute') as authenticated, has_function_privilege('service_role', oid, 'execute') as service_role,
       position('tax_breakdown' in prosrc) > 0 as writes_breakdown
  from pg_proc where proname = 'place_order_atomic_v2' and pronamespace = 'public'::regnamespace;
```
→ one function, the same 7 arguments; anon false, authenticated false, service_role true; writes_breakdown true.
```sql
select (select count(*) from public.menu_items_db where tax_rate_milli is not null) as items_with_rate,
       (select count(*) from public.orders where tax_breakdown is not null) as orders_with_breakdown;
```
→ 0, 0.

**Deal-fallback check (read-only):**
```sql
with deal_lines as (
  select o.truck_id, d->>'name' as deal, s.value as dish
  from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.deals)='array' then o.deals else '[]'::jsonb end) d,
       jsonb_each_text(case when jsonb_typeof(d->'slots')='object' then d->'slots' else '{}'::jsonb end) s
  where o.created_at > now() - interval '90 days' and s.value <> ''
)
select count(*) as deal_slot_lines,
       count(*) filter (where m.id is null) as dish_not_on_menu,
       count(*) filter (where m.id is not null and coalesce(m.price,0) = 0) as dish_price_zero,
       count(distinct dl.truck_id) as trucks
from deal_lines dl left join public.menu_items_db m on m.truck_id = dl.truck_id and m.name = dl.dish;
```
```sql
with deal_lines as (
  select o.truck_id, s.value as dish
  from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.deals)='array' then o.deals else '[]'::jsonb end) d,
       jsonb_each_text(case when jsonb_typeof(d->'slots')='object' then d->'slots' else '{}'::jsonb end) s
  where s.value <> ''
), slots as (
  select b.truck_id, b.name as deal, unnest(array[b.slot_1_category,b.slot_2_category,b.slot_3_category,b.slot_4_category,b.slot_5_category,b.slot_6_category]) as cat from public.bundles_db b
)
select (select count(*) from deal_lines) as deal_slot_lines_all_time,
       (select count(*) from deal_lines dl left join public.menu_items_db m on m.truck_id = dl.truck_id and m.name = dl.dish where m.id is null) as dish_not_on_menu_now,
       (select count(*) from public.bundles_db) as deals_defined,
       (select count(*) from slots s where s.cat is not null and not exists (
          select 1 from public.menu_items_db m join public.menu_categories c on c.id = m.category_id
          where m.truck_id = s.truck_id and lower(c.name) = lower(s.cat) and coalesce(m.price,0) > 0)) as deal_slots_with_no_priced_dish;
```
```sql
select jsonb_typeof(d->'slots') as slots_type, count(*) as deals_on_orders
from public.orders o, jsonb_array_elements(case when jsonb_typeof(o.deals)='array' then o.deals else '[]'::jsonb end) d group by 1;
```
```sql
with slots as (
  select b.id, b.truck_id, unnest(array[b.slot_1_category,b.slot_2_category,b.slot_3_category,b.slot_4_category,b.slot_5_category,b.slot_6_category]) as cat from public.bundles_db b
), s2 as (
  select s.id, s.cat, exists (select 1 from public.menu_items_db m join public.menu_categories c on c.id = m.category_id
          where m.truck_id = s.truck_id and lower(c.name) = lower(s.cat) and coalesce(m.price,0) > 0) as priced
  from slots s where s.cat is not null
)
select count(distinct id) as deals, count(distinct id) filter (where not priced) as deals_with_an_unpriced_slot,
       (select count(*) from (select id from s2 group by id having bool_and(not priced)) x) as deals_with_every_slot_unpriced
from s2;
```
**Results:**
- 0 deal lines on any order, ever (no order has carried a deal).
- 6 deals defined; 3 have slot categories.
- 1 of those 3 has a slot with no priced dish.
- 0 have every slot unpriced.

## 4 · Manage › Payments

- **GB, IE and every other country whose prices include tax with no default:**
  - the card now shows « VAT in your prices »;
  - a dropdown: **No VAT** (selected for every existing truck), the quick rates (GB: 0 % · 5 % · 20 %; others none), and « Other… » (the same box and check as before, now 0–30 %);
  - the hint « Choose No VAT if you don't charge VAT. »;
  - the Item rates row.
- **France (and other formats with a default):** the existing box exactly as it was, plus the Item rates row.
- **Tax added on top (US, CA):** the existing rows, plus Item rates after the rate.
- **The Item rates row:**
  - its hint reads « N items use a different rate » (items whose own rate differs from the default) or « All items use your default rate »;
  - « Change item rates » opens the popup.
- **The popup:**
  - title, the line « You choose the rate for each item. », and a close (X);
  - categories in menu order, then « Other items » for dishes with no category;
  - each item has a dropdown: « Default (x) » (NULL), the quick rates, and « Other… » with a number box;
  - each category has « Set all »;
  - nothing is saved until Save, and Save sends only the changed items;
  - one centred panel that scrolls inside itself: the same layout on phone, iPad and desktop.
- **Server rules:**
  - owner or admin only;
  - every id must be the truck's own, or nothing is written;
  - rates 0–30 % or NULL;
  - one write per distinct rate, scoped to the truck.
- **New dishes** from menu import, demo templates, demo carry and seeding get NULL (none of them names the column).

## 5 · The lock

In `app/api/dashboard/action/route.ts`, straight after the order is read, `edit` and `cancel` refuse `collected`, `cancelled` and `rejected` with 409 and `errorsKitchen.order_finished_edit` / `order_finished_cancel`:
- « This order is finished, so it can't be changed. »
- « … cancelled. »

Web, the native apps and offline replay all post to this route, so it covers every path. Undo-collected and undo-paid are unchanged.

## 6 · Proof

**`scripts/france-vat-1.cjs`: 61 passed, 0 failed.** No network and no database.
- **A · Byte-identical** against BASE `59ae6161`, extracted from git:
  - 43 single-rate orders × 9 outputs. The outputs: figures, snapshot (less the new column), an edit, the pay-at-the-truck switch, charge lines, customer email HTML and text, new-order email, **ticket bytes at 58 and 80 mm**, and both accountant CSVs.
  - The cases cover GB with no rate, France at 10 % and 5,5 %, the US with tax (tip %, tip amount, service fee, taxed fees), the US with no rate, and Japan in yen. Each runs as walk-up, pay at the truck and card, with and without a 10 % code, and with dishes set explicitly to the default.
  - GB, IE, FR and US rules resolve identically.
  - A self-check proves the comparison can fail.
- **B · Mixed rates:** the worked example (parts, breakdown, receipt lines, the code); email text and HTML; ticket 58 and 80 mm; the ledger; the CSV columns; a half refund; the mixed deal; the fallback; largest remainder (400 cases); server stamps overwrite a browser rate; the edit's rate-lock (new and older lines); US tax per rate with per-rate receipt lines; the pay-at-the-truck switch; draft to order; every path and preview calls the same function.
- **C · The lock**, through the real route: 6 refusals (3 statuses × edit/cancel, the row untouched); a ready order passes through to the edit's own checks.
- **D · The migration:** additive; the body equals 20261010_18's plus the column; nullif; grants.
- **E · Payments:** the 30 % limit; GB/IE take a rate (and an empty box is No VAT); a GB truck at 20 % gets « Includes VAT 20%: £2.00 »; quick rates; the card rendered for GB, FR and US; the popup rendered; set_item_rates' rules; imports and demos untouched.
- **F · Words:** 24 en-GB strings; all 54 used bases with back-translations; the 5 unused bases untouched; en-US / en-CA spelling.

**Other checks:**
- `tsc` clean.
- ESLint clean on every new and changed `lib`/`components` file and the harness.
- translation-check structural 0 in all 54 bases.

## 7 · Re-pins

Each one is marked `⚠️ RE-PINNED (france-vat-1, …)` in the file and allows only this work's change, by name.

**Two shared modules (registered under shared_modules):**
- `scripts/_lp-france-vat-1.cjs`: the named set-aside. The 24 new keys are missing, and only those, in the 5 bases no enabled country uses (vi, hi, ur, fil, ta). This follows TRANSLATE ONLY WHAT'S USED. `onlySetAside(l)` is true only when a base lacks exactly those 24 and nothing else.
- `scripts/_named-france-vat-1.cjs` (+ `scripts/fixtures/france-vat-1-edits.json`): the order page's preview edit, as exact [now, was] pairs that give back 59ae6161's file. It also holds the Payments-view proofs for language-phase-1d2.

| Harness | What moved, and why |
|---|---|
| `order-charges.cjs` (+ `_order-charges-us.cjs`) | Named difference 2: every new line's `item_id` / `tax_rate_milli` (null for GB), deals' `tax_parts`, and `tax_breakdown` (NULL for GB), each checked, then set aside. "GB ignores a truck's rate" became "GB has none unless set". Promotion compares the breakdown by value. v2's current body is read from 20261124 (20261010_18 is still read for its own columns). |
| `tidy-2.cjs` | The GBP engine comparison: `tax_breakdown` must be NULL, then set aside. |
| `phase3-screens.cjs` (+ `_phase3-screens-us.cjs`) | The two previews' engine calls now pass `foodParts`. The limit is 30 %. GB takes a rate (route writes `tax_rate_milli` 8000 only). The card shows everywhere (`noDefault`). |
| `anz-terms.cjs` | AU/NZ: no rate unless the truck sets one (NULL = No GST, every existing truck). |
| `france-1.cjs` | GB/IE with no rate set are as before. GB's Payments shows the No VAT form. The route takes a GB rate. (Its 4th failure, fr-FR back-translations for 59 older keys, fails on BASE too.) |
| `event-pricing.cjs` | `lib/order-tax.ts` is compiled with its variants (the price book names its `TaxBook` type). |
| `event-types.cjs` | The price book's `itemTax` / `taxBookOf` / select are put back exactly (each must apply) before the byte comparison with its parent. |
| `messages-keys-used`, `country-picker-1`, `paperwork-1`, `costs-accounts-1`, `contact-1`, `faq-2`, `faq-3`, `faq-4` | The named set-aside above. `costs-accounts-1` also leaves france-vat-1's 3 CSV keys out of its own 55. |
| `_messages-parity-1e.cjs`, `fixtures/language-phase-1e-gb-named.json`, `_lp1e-words.cjs` | The 24 new strings named as new wording. `charges_rate_range` "0 to 20%" → "0 to 30%" named on its exact before/after. |
| `_lp1d2-named.cjs` (language-phase-1d2) | `france-vat-1-payments`, covering 34 views. US and fixture tax-added cards: exactly the Item rates row added before tips (PRECISE). GB's empty card: the No VAT form (STRUCTURAL). The 20.5 % / 25 % / GB-rate refusals are now saves of exactly that value (one column written). |
| `cwv-2.cjs` | The order page's preview edit is put back first (`_named-france-vat-1.cjs`). |

**Not re-pinned (not this work's):**
- `legal-languages-1`: `lib/enquiries/answer-pack-server.ts`, enquiries-backend-1's.
- cwv-2's `app/(app)/admin/page.tsx`: the inbox-1 session's edit.
- Every BASE failure (§8).

## 8 · The sweep

**The runner refuses to start on this branch as listed.** Two listed harnesses fail its production screen, neither mine and neither edited:
- `enquiries-backend-1.cjs` (a non-local `fetch(`; it fails on BASE too);
- `inbox-1.cjs` ("stripe"), which the inbox-1 session committed onto this branch (§0).

So every sweep here ran from a scratchpad copy of `scripts/harnesses.json` without those two.

**The baseline.** To tell my failures from older ones, I ran the same sweep on BASE `59ae6161`, in a worktree in the scratchpad (since removed).
- **BASE: 16 fail:** billing-1, contact-1, costs-accounts-1, cwv-2, event-types-render, faq-1, france-1, language-phase-1b, -1c, -1d, -1d2, -1e, -2, legal-languages-1, loyalty-1, tidy-1.
- **First branch sweep: 29 fail.** All 15 new ones were this work's, and each was re-pinned or fixed (§7). Two were real fixes: the API answer, and the import position.

**Final sweep on this branch (with the inbox-1 commits): 20 fail.** All are accounted for:
- **The same 15 as BASE (event-types-render passes here), at BASE's exact counts:**
  - billing-1 130/1 · contact-1 252/1 · costs-accounts-1 77/1 · france-1 73/1 · legal-languages-1 407/1 · loyalty-1 80/1 · tidy-1 89/1;
  - language-phase-1b 3112/392 · -1c 4391/10 · -1d 486/4 · -1d2 213 failed (BASE 213; 30 more pass) · -1e 1020/3 · -2 1770/404;
  - faq-1: fails on BASE.
- **cwv-2: 2 failed against BASE's 1.** The extra one is `app/(app)/admin/page.tsx`, the inbox-1 session's file. My order-page edit is excused by name.
- **Three from the inbox-1 session's work, not mine:**
  - `country-settings-parity`: the Admin tab bar gains Inbox;
  - `site-chrome-1`: the unclassified `app/(app)/admin/inbox/page.tsx`;
  - `screenshot-truck-details`: `lib/inbox/read-model.ts` queries discovery_trucks.
- **One load flake:** `add-order-refresh` passes alone (rc 0). The manual records it as a known full-sweep flake.

**This work's own harness:** `france-vat-1.cjs` **61 passed, 0 failed**, inside the sweep and alone.

## 9 · Left undone, and translation notes

- **Not built (as the brief says):** the daily-totals e-reporting file (the next prompt).
- **Not run:** an executed old-style call to the replaced function (§0 point 4). The rest of §6 is proved; this one is structural.
- **The translators' notes, for a native read:**
  - **Placeholder grammar:** `{label}` can't take case endings, so "No {label}" is worded around it in some languages ("{label} yok", "{label} nélkül", "Án {label}"…). `rateAria` is "Rate: {item}" in several Slavic and Baltic languages.
  - **"Default" was new wording** in uk, ru, kk, uz, az, ka, hy, mn, he, ar and am. In ja it is 初期設定, not 標準: 標準税率 means the 10 % standard rate.
  - **he-IL** says "tax rates for items".
  - **it-IT's hint** assumes a vowel-initial label (l'IVA), as the existing hint does.
  - **ar-AE's plural** uses "Items with a different rate: {count}" in every branch.
- **The status page and the new-order email** on a mixed added-on-top order: Things you should know, point 1.

## 10 · What to click through on localhost

Use a test or demo truck, never a trading one.

1. **Manage › Payments (a French test truck):**
   - the TVA box as before, with "Item rates — All items use your default rate";
   - open "Change item rates": Set all on a category to 5,5 %, one item to 20 %, one to "Other…" 7;
   - Save, and the hint now says 3 items.
   - Then a GB test truck: "No VAT" is selected; pick 20 %, then back to No VAT.
2. **Place a mixed order** on the French truck's order page: a crêpe (10 %), a can (5,5 %) and a cider (20 %). The total is unchanged (prices include TVA).
3. **The customer email:** three « Dont TVA » lines after the total, ascending. The truck's new-order email has none, as before.
4. **The ticket** (print, or /dev/ticket-preview): three « Dont TVA » lines under TOTAL. ("€" prints as "EUR" and accents fold, as before: open item 10.)
5. **Reports › For your accountant › Orders CSV:** Net/Tax columns per rate after Profit, adding up to Net and Tax.
6. **The lock:** try to edit a collected order (only reachable by API); it answers 409 « This order is finished… ».
7. **Old-style call:** place one order on the live site (deployed code) for a demo truck. It should succeed with `tax_breakdown` NULL. That is the real proof for item (d).
