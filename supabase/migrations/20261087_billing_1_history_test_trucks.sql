-- supabase/migrations/20261087_billing_1_history_test_trucks.sql — billing-1 correction (10 November 2026; docs/billing-1-report.md).
-- The plan-history trigger (20261086) records only while billing is switched on. This lets it ALSO record for a billing TEST truck
-- (truck_billing.billing_test = true), so Admin's test tools (/admin/billing "Change plan (test)") price a mid-month change correctly
-- while the switch is off. No other truck is affected; nothing is updated, deleted or inserted by this file.
begin;

create or replace function public.trucks_record_plan_history() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- Nothing is recorded while billing is switched off (nothing is billed, so nothing needs a history) — except for a billing
  -- TEST truck, which Admin's test tools bill on Stripe test mode.
  if not coalesce((select ps.billing_enabled from public.platform_switches ps where ps.id), false)
     and not exists (select 1 from public.truck_billing tb where tb.truck_id = new.id and tb.billing_test) then
    return new;
  end if;
  begin
    if tg_op = 'INSERT' then
      insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
        values (new.id, new.plan, new.trial_expires_at, now(), 'insert');
    elsif new.plan is distinct from old.plan or new.trial_expires_at is distinct from old.trial_expires_at then
      if not exists (select 1 from public.truck_plan_history h where h.truck_id = new.id) then
        insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
          values (old.id, old.plan, old.trial_expires_at, '-infinity', 'before_first_change');
      end if;
      insert into public.truck_plan_history (truck_id, plan_key, trial_expires_at, changed_at, source)
        values (new.id, new.plan, new.trial_expires_at, now(), 'update');
    end if;
  exception when others then
    -- 🔴 a failure to record never blocks a plan change
    raise warning 'truck_plan_history: could not record % for %: %', tg_op, new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.trucks_record_plan_history() from public, anon, authenticated;

commit;

-- read-only check: select position('billing_test' in prosrc) > 0 from pg_proc where proname = 'trucks_record_plan_history';   -- true
