-- 20261126_france_receipts_1.sql
-- france-receipts-1 (24 November 2026, docs/france-receipts-1-report.md): EACH ORDER KEEPS THE TRUCK'S VAT REGIME AS IT WAS WHEN IT WAS
-- PLACED, so a receipt printed later still says « TVA non applicable, art. 293 B du CGI » for an order sold under franchise en base —
-- even after the truck changes its regime — and an order placed before the change keeps its own.
--
--   • orders.vat_regime / order_drafts.vat_regime — NEW, NULLABLE text, no default and NO CHECK CONSTRAINT (a snapshot: a value the
--     trucks column may one day gain must never make an insert fail).
--   • orders_stamp_vat_regime() — a BEFORE INSERT trigger on both tables. When the insert does not name a regime (every insert the
--     DEPLOYED code makes, and place_order_atomic_v2, which names its columns), it copies trucks.vat_regime for the row's truck.
--     The app names one only when it already knows it (a card order's promotion carries the draft's). It NEVER fails an insert: the
--     read is inside its own exception block, and on any error the regime stays NULL with a WARNING.
--
-- ✅ CLASSIFICATION: ADDITIVE AND BACKWARD-COMPATIBLE. Two nullable columns, one new function, two new triggers created only if
--    missing. No row is changed; no existing column, constraint, function or trigger is touched; place_order_atomic_v2 is not
--    touched. The deployed code never reads the column; its inserts are stamped and otherwise unchanged.

set lock_timeout = '3s';

begin;

alter table public.orders       add column if not exists vat_regime text;
alter table public.order_drafts add column if not exists vat_regime text;

comment on column public.orders.vat_regime is
  'france-receipts-1: the truck''s VAT regime (trucks.vat_regime) when the order was placed — franchise = sold under franchise en base (TVA non applicable, art. 293 B du CGI). NULL = none. Stamped by orders_stamp_vat_regime.';
comment on column public.order_drafts.vat_regime is
  'france-receipts-1: the truck''s VAT regime when the card order was started; copied to the order at promotion.';

create or replace function public.orders_stamp_vat_regime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.vat_regime is null then
    begin
      select t.vat_regime into new.vat_regime from public.trucks t where t.id = new.truck_id;
    exception when others then
      new.vat_regime := null;
      raise warning 'orders_stamp_vat_regime: no regime for truck % (%: %)', new.truck_id, sqlstate, left(sqlerrm, 200);
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.orders_stamp_vat_regime() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'orders_stamp_vat_regime' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_stamp_vat_regime before insert on public.orders
      for each row execute function public.orders_stamp_vat_regime();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_drafts_stamp_vat_regime' and tgrelid = 'public.order_drafts'::regclass) then
    create trigger order_drafts_stamp_vat_regime before insert on public.order_drafts
      for each row execute function public.orders_stamp_vat_regime();
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- VERIFY (read-only):
--   select table_name, column_name, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and column_name = 'vat_regime' and table_name in ('orders', 'order_drafts');
--   select tgname, pg_get_triggerdef(oid) from pg_trigger where tgname in ('orders_stamp_vat_regime', 'order_drafts_stamp_vat_regime');
