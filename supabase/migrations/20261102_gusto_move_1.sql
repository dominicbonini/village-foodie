-- gusto-move-1 (13 Nov 2026) — APPROVED BY DOMINIC IN CHAT (option A). Live truck pizzeria-gusto, tonight only.
-- Moves every order on the duplicate event FROM (3dadcd9b…, staff orders) onto the live event TO (b2a73e87…, online orders).
-- Staff orders whose number already exists on TO are renumbered ABOVE the highest number on either event (re-read under lock);
-- TO's order counter is raised to the new highest number; FROM's kitchen-capacity rows are added into TO's per slot, then removed
-- from FROM. Statuses, payments, slots, items, paid/collected/created timestamps and Stripe data are untouched (the orders
-- updated_at trigger stamps updated_at = now()). Event FROM itself is not changed. Backup: docs/gusto-move-1/backup.json.
-- ONE statement = one transaction; any failed check raises and rolls everything back.
do $$
declare
  v_from  constant uuid := '3dadcd9b-1f36-48e7-9672-12d2f2bfc4f6';
  v_to    constant uuid := 'b2a73e87-3bf5-42fe-a75b-633107dc374d';
  v_truck constant text := 'pizzeria-gusto';
  v_next  int;
  v_moved int;
  v_from_before int;
  v_to_before int;
  r record;
begin
  -- 0. Both events must be Gusto's, tonight.
  if (select count(*) from truck_events where id in (v_from, v_to) and truck_id = v_truck and event_date = date '2026-11-13') <> 2 then
    raise exception 'gusto-move-1: events are not both pizzeria-gusto on 2026-11-13';
  end if;

  -- 1. LOCK both event rows. increment_event_order_counter() UPDATEs truck_events, so every new order on TO (online) or FROM
  --    (staff) now waits until this transaction commits, and any order already mid-flight finishes before we get the lock.
  perform 1 from truck_events where id in (v_from, v_to) for update;

  select count(*) into v_from_before from orders where event_id = v_from;
  select count(*) into v_to_before   from orders where event_id = v_to;
  raise notice 'gusto-move-1: under lock — FROM % orders, TO % orders', v_from_before, v_to_before;

  -- 2. Re-read the highest number on BOTH events and TO's counter, under the lock.
  select greatest(
           coalesce((select max(id::int) from orders where event_id = v_to), 0),
           coalesce((select max(id::int) from orders where event_id = v_from), 0),
           (select order_counter from truck_events where id = v_to)
         ) into v_next;

  -- 3. Renumber ONLY the FROM orders whose number already exists on TO, lowest first, above the highest number.
  for r in
    select f.order_key, f.id, f.customer_name, f.status
    from orders f
    where f.event_id = v_from and f.truck_id = v_truck
      and exists (select 1 from orders t where t.event_id = v_to and t.id = f.id)
    order by f.id::int
  loop
    v_next := v_next + 1;
    update orders set id = v_next::text where order_key = r.order_key;
    raise notice 'gusto-move-1: RENUMBERED #% -> #% | % | %', r.id, v_next, r.customer_name, r.status;
  end loop;

  -- 4. Move every FROM order onto TO (event_id only; everything else as it is).
  update orders set event_id = v_to where event_id = v_from and truck_id = v_truck;
  get diagnostics v_moved = row_count;

  -- 5. TO's counter = the highest number now on TO, so the next online order cannot collide.
  update truck_events
     set order_counter = greatest(order_counter, (select max(id::int) from orders where event_id = v_to))
   where id = v_to;

  -- 6. Kitchen capacity: add FROM's per-slot units into TO's (summed per category), then remove FROM's rows.
  insert into production_slot_usage as p (truck_id, event_id, event_date, production_slot, units_by_cat, updated_at)
  select truck_id, v_to, event_date, production_slot, units_by_cat, now()
    from production_slot_usage where event_id = v_from and truck_id = v_truck
  on conflict (truck_id, event_id, production_slot) do update
    set units_by_cat = (
          select coalesce(jsonb_object_agg(k, s), '{}'::jsonb)
          from (select k, sum(v) as s
                  from (select key as k, value::int as v from jsonb_each_text(p.units_by_cat)
                        union all
                        select key, value::int from jsonb_each_text(excluded.units_by_cat)) x
                 group by k) y),
        updated_at = now();
  delete from production_slot_usage where event_id = v_from and truck_id = v_truck;

  -- 7. Checks — any failure rolls the whole move back.
  if exists (select 1 from orders where event_id = v_from) then
    raise exception 'gusto-move-1: FROM still has orders';
  end if;
  if (select count(*) from orders where event_id = v_to) <> v_from_before + v_to_before then
    raise exception 'gusto-move-1: TO order count % <> % + %', (select count(*) from orders where event_id = v_to), v_from_before, v_to_before;
  end if;
  if v_moved <> v_from_before then
    raise exception 'gusto-move-1: moved % but FROM had %', v_moved, v_from_before;
  end if;
  if (select order_counter from truck_events where id = v_to) < (select max(id::int) from orders where event_id = v_to) then
    raise exception 'gusto-move-1: TO counter below highest order number';
  end if;

  raise notice 'gusto-move-1: DONE — moved % orders; TO now % orders; TO counter %', v_moved,
    (select count(*) from orders where event_id = v_to), (select order_counter from truck_events where id = v_to);
end
$$;
