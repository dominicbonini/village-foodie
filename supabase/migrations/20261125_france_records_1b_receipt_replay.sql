-- 20261125_france_records_1b_receipt_replay.sql
-- france-records-1 (25 November 2026, docs/france-records-1-report.md §3): A REPLAYED INSERT TAKES NO RECEIPT NUMBER.
--
-- Found after 20261125_france_records_1 was applied (before any order used it): the walk-up's OFFLINE REPLAY inserts with
-- `upsert … onConflict: 'order_key', ignoreDuplicates` (INSERT … ON CONFLICT (order_key) DO NOTHING). Postgres fires BEFORE INSERT
-- row triggers for every proposed row, INCLUDING one the conflict then skips — so a replay of an order already synced would take the
-- truck's next number and leave a GAP.
-- THE FIX, gap-free even for two replays at once: the trigger takes the counter row first (the lock), THEN asks whether an order with
-- this order_key already exists (a fresh snapshot per statement, so it sees a replay that committed while it waited). If it does, it
-- raises its own SQLSTATE inside the guarded block: the block rolls back — the increment with it — and receipt_no stays NULL (the row
-- is skipped by ON CONFLICT anyway). That case is not a failure and is not logged as one. Every other behaviour is 20261125's.
--
-- ✅ CLASSIFICATION: ADDITIVE. CREATE OR REPLACE of the trigger function only — same name, same (no) arguments, same owner, same
--    grants (restated). No table, column, trigger or row touched. place_order_atomic_v2 is not touched.

set lock_timeout = '3s';

begin;

create or replace function public.orders_assign_receipt_no()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_no  bigint;
  v_old text;
begin
  begin
    v_old := current_setting('lock_timeout');
    perform set_config('lock_timeout', '2s', true);
    insert into public.receipt_counters as c (truck_id, last_no, updated_at)
      values (new.truck_id, 1, now())
      on conflict (truck_id) do update set last_no = c.last_no + 1, updated_at = now()
      returning c.last_no into v_no;
    -- A replay of an order that already exists (ON CONFLICT DO NOTHING will skip this row): give the number back.
    if exists (select 1 from public.orders o where o.order_key = new.order_key) then
      raise sqlstate 'HGRN1';
    end if;
    perform set_config('lock_timeout', v_old, true);
    new.receipt_no := v_no;
  exception
    when sqlstate 'HGRN1' then
      new.receipt_no := null;
    when others then
      -- 🔴 NEVER FAIL THE INSERT. The block's own work (the counter, the lock_timeout change) is undone with it.
      new.receipt_no := null;
      begin
        insert into public.receipt_no_failures (truck_id, sqlstate, message) values (new.truck_id, sqlstate, left(sqlerrm, 500));
      exception when others then
        null;
      end;
      raise warning 'orders_assign_receipt_no: no receipt number for truck % (%: %)', new.truck_id, sqlstate, left(sqlerrm, 200);
  end;
  return new;
end;
$$;
comment on function public.orders_assign_receipt_no() is 'france-records-1: BEFORE INSERT ON orders — the truck''s next receipt number (gap-free, row-locked counter, 2 s lock_timeout; a replayed order_key takes none). Never fails the insert: on any error, receipt_no stays NULL and the failure is logged.';

revoke all on function public.orders_assign_receipt_no() from public, anon, authenticated;

commit;

-- VERIFY (read-only):
--   select position('HGRN1' in pg_get_functiondef('public.orders_assign_receipt_no()'::regprocedure)) > 0 as replay_guard;
--   select tgname from pg_trigger where tgrelid = 'public.orders'::regclass and tgname like 'orders_receipt_no%';
