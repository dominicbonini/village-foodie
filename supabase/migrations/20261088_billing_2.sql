-- supabase/migrations/20261088_billing_2.sql — billing-2 (11 November 2026; docs/billing-2-report.md).
-- The Billing screens, notices and emails need three facts billing-1 did not store:
--   • billing_invoices.first_failed_at        — when the first collection attempt failed. The 5-full-day rule counts from its
--                                               LOCAL DATE: the failure day, then 5 full days (the last day to pay), and online
--                                               ordering pauses at 00:00 truck time on the day after (Dominic, 11 November).
--   • platform_switches.billing_suspend_warning_days (6) — the "pay by {date} or your account may be suspended" date is the
--                                               pause date + this many days. WORDING ONLY: nothing locks an account.
--   • billing_email_log                       — every billing email sent: once per (truck, kind, ref) — ref is the invoice for a
--                                               payment email, the trial's end for a trial email. The unique key is the guard.
-- 🔴 Additive only: two columns (null / default) and one new table. No existing row is updated or deleted; the billing switch
-- stays false.
begin;

alter table public.billing_invoices add column if not exists first_failed_at timestamptz;

alter table public.platform_switches add column if not exists billing_suspend_warning_days integer not null default 6;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_switches_billing_suspend_days_chk') then
    alter table public.platform_switches add constraint platform_switches_billing_suspend_days_chk
      check (billing_suspend_warning_days between 1 and 60);
  end if;
end $$;

create table if not exists public.billing_email_log (
  id           bigserial primary key,
  truck_id     text not null references public.trucks(id) on delete cascade,
  kind         text not null check (kind in ('payment_failed', 'two_days_left', 'one_day_left', 'last_day', 'paused',
                                              'trial_7_days', 'trial_1_day')),
  ref          text not null,
  locale       text not null,
  sent_at      timestamptz not null default now(),
  provider_id  text,
  unique (truck_id, kind, ref)
);

alter table public.billing_email_log enable row level security;
revoke all on public.billing_email_log from anon, authenticated, public;
revoke all on sequence public.billing_email_log_id_seq from anon, authenticated, public;

commit;

-- read-only checks:
-- select billing_suspend_warning_days from platform_switches;                                   -- 6
-- select count(*) from billing_email_log;                                                       -- 0
-- select column_name from information_schema.columns where table_name = 'billing_invoices' and column_name = 'first_failed_at';
