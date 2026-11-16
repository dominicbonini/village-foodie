-- 20261104_partners_2.sql — partners-2 (16 November 2026, docs/partners-2-report.md)
--
-- Admin › Partners grows into a partner programme: imported, verified organisations; codes that apply a deal at signup;
-- commission terms and a ledger; and partner emails scheduled in the recipient's working hours through the SAME outreach
-- machinery as truck prospects (outreach_messages, the suppression list, the mailbox, the reply poller).
--
-- ── WHAT THIS DOES ───────────────────────────────────────────────────────────────────────────────────
--   1. partner_orgs: three more types (collective, media, software_platform); alternate emails; language and time zone;
--      the verification result (verified / unverified / dropped, with its evidence); the sequence state the send queue reads.
--   2. NEW partner_codes            — a code, its deal, its validity and its commission terms. Case-insensitive unique.
--   3. NEW partner_code_redemptions — one row per signup that used a code: what was applied, to which truck.
--   4. trucks.referred_partner_code_id — set once at signup, NEVER changed afterwards (a trigger refuses any change).
--   5. NEW partner_commission_payments — "Mark paid": a month, an amount, a date and a reference.
--   6. NEW outreach_country_rules  — cold B2B email per country: 'allowed' or 'manual_only' (data, editable).
--   7. NEW outreach_send_queue     — the day's planned partner sends, approved by Dominic before they can go.
--   8. outreach_settings: the send schedule (approval mode ON, cap 25, Tue–Thu 09:30–11:30, 3–8 min spacing) and the
--      registered office for US footers. Rows only; no existing row changes.
--
-- ── 🔴 ADDITIVE ONLY ─────────────────────────────────────────────────────────────────────────────────
--   • No existing row is updated or deleted. partner_orgs' type CHECK only gains values. Every new column is nullable or
--     has a default that leaves existing rows meaning what they meant.
--   • No outreach_templates row is created, edited, seeded or deactivated (Dominic signs templates off first).
--   • Nothing here sends anything: the queue is planned and approved in Admin; the sender refuses without a template.
--
-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────────────
-- The outreach pattern: RLS on, one service_role policy, anon / authenticated / public REVOKED. The signup and setup routes
-- read partner_codes with the service role, server side only.
--
-- Run with: npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261104_partners_2.sql --approved-by-dominic
set lock_timeout = '3s';
begin;

-- ── 1 · partner_orgs ─────────────────────────────────────────────────────────────────────────────────
alter table public.partner_orgs drop constraint if exists partner_orgs_type_check;
alter table public.partner_orgs add constraint partner_orgs_type_check
  check (type in ('association', 'collective', 'organiser', 'consultant', 'supplier', 'directory', 'media', 'press',
                  'software_platform', 'other'));

alter table public.partner_orgs
  add column if not exists alternate_emails text[] not null default '{}',
  add column if not exists language         text check (language is null or language ~ '^[a-z]{2}$'),
  add column if not exists timezone         text,
  add column if not exists verify_status    text check (verify_status is null or verify_status in ('verified', 'unverified', 'dropped')),
  add column if not exists verify_note      text,
  add column if not exists verify_evidence  text,
  add column if not exists verified_at      timestamptz,
  -- The sequence (first contact → +3 → +7 → +14, the truck ladder): the last automatic step sent and why it stopped.
  add column if not exists sequence_step    text,
  add column if not exists sequence_stopped text check (sequence_stopped is null or sequence_stopped in ('reply', 'bounce', 'opt_out', 'done', 'manual')),
  -- Never sent automatically when false (software platforms, network members, anything Dominic switches off).
  add column if not exists auto_send        boolean not null default true,
  -- The suppression list's partner half: an opt-out ("no thanks") or a bounce sets it; nothing is ever sent to it again,
  -- by the scheduler or by hand (the same refusal the prospects' do_not_contact gives — lib/partners.ts partnerSendRefusal).
  add column if not exists do_not_contact   boolean not null default false;

comment on column public.partner_orgs.verify_status is
  'verified = the email appears on their site and the domain has MX; unverified = MX but not on the site; dropped = no site / no MX / invented. Only verified rows are ever sent automatically.';
comment on column public.partner_orgs.alternate_emails is 'Other addresses found for the organisation; `email` is the primary.';

-- ── 2 · partner_codes ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.partner_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null check (code ~ '^[A-Z0-9-]{3,40}$'),
  partner_id    uuid not null references public.partner_orgs(id) on delete restrict,
  deal_type     text not null check (deal_type in ('extra_trial_months', 'percent_off')),
  deal_value    integer not null check (deal_value > 0),
  deal_months   integer check (deal_months is null or deal_months > 0),
  valid_until   date,
  max_uses      integer check (max_uses is null or max_uses > 0),
  active        boolean not null default true,
  pct_year1     numeric(5,2) not null default 0 check (pct_year1 >= 0 and pct_year1 <= 100),
  pct_year2     numeric(5,2) not null default 0 check (pct_year2 >= 0 and pct_year2 <= 100),
  basis         text not null default 'plan_fees' check (basis = 'plan_fees'),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint partner_codes_deal_shape check (
    (deal_type = 'extra_trial_months' and deal_value <= 24 and deal_months is null)
    or (deal_type = 'percent_off' and deal_value <= 100 and deal_months is not null)
  )
);
create unique index if not exists partner_codes_code_ci_key on public.partner_codes (upper(code));
create index if not exists partner_codes_partner_idx on public.partner_codes (partner_id);
comment on table public.partner_codes is
  'Partner / promo codes: the deal a signup gets (extra trial months, or percent off for N months) and the partner''s commission (pct of plan fees, year 1 / year 2). Server routes only.';

-- ── 3 · partner_code_redemptions ─────────────────────────────────────────────────────────────────────
create table if not exists public.partner_code_redemptions (
  id                 uuid primary key default gen_random_uuid(),
  code_id            uuid not null references public.partner_codes(id) on delete restrict,
  operator_id        uuid not null references public.operators(id) on delete cascade,
  truck_id           text references public.trucks(id) on delete set null,
  -- The deal as it stood when it was used (the code may change later).
  deal_type          text not null,
  deal_value         integer not null,
  deal_months        integer,
  -- What was applied, and when (null until the truck exists).
  applied_at         timestamptz,
  trial_extended_to  timestamptz,
  override_minor     integer,
  override_until     date,
  apply_note         text,
  created_at         timestamptz not null default now(),
  unique (operator_id)
);
create index if not exists partner_code_redemptions_code_idx on public.partner_code_redemptions (code_id);

-- ── 4 · trucks.referred_partner_code_id (set once, never changed) ─────────────────────────────────────
alter table public.trucks add column if not exists referred_partner_code_id uuid references public.partner_codes(id) on delete restrict;
create index if not exists trucks_referred_partner_code_idx on public.trucks (referred_partner_code_id) where referred_partner_code_id is not null;

create or replace function public.trucks_referred_code_immutable() returns trigger language plpgsql as $$
begin
  if old.referred_partner_code_id is not null and new.referred_partner_code_id is distinct from old.referred_partner_code_id then
    raise exception 'trucks.referred_partner_code_id is set once at signup and never changed (truck %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trucks_referred_code_immutable on public.trucks;
create trigger trucks_referred_code_immutable before update of referred_partner_code_id on public.trucks
  for each row execute function public.trucks_referred_code_immutable();
comment on column public.trucks.referred_partner_code_id is
  'The partner code this truck signed up with (partners-2). Set once at signup; a trigger refuses any later change.';

-- ── 5 · partner_commission_payments ──────────────────────────────────────────────────────────────────
create table if not exists public.partner_commission_payments (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.partner_orgs(id) on delete restrict,
  month       date not null check (extract(day from month) = 1),
  currency    text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor integer not null check (amount_minor > 0),
  paid_on     date not null,
  reference   text not null check (length(btrim(reference)) > 0),
  created_at  timestamptz not null default now()
);
create index if not exists partner_commission_payments_partner_idx on public.partner_commission_payments (partner_id, month);

-- ── 6 · outreach_country_rules ───────────────────────────────────────────────────────────────────────
create table if not exists public.outreach_country_rules (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  cold_email   text not null check (cold_email in ('allowed', 'manual_only')),
  note         text,
  updated_at   timestamptz not null default now()
);
insert into public.outreach_country_rules (country_code, cold_email, note) values
  ('GB', 'allowed', null), ('IE', 'allowed', null), ('FR', 'allowed', null), ('BE', 'allowed', null),
  ('NL', 'allowed', null), ('ES', 'allowed', null), ('IT', 'allowed', null), ('SE', 'allowed', null),
  ('CH', 'allowed', null), ('US', 'allowed', 'CAN-SPAM: postal address in the footer'), ('AU', 'allowed', null), ('NZ', 'allowed', null),
  ('DE', 'manual_only', 'UWG: no unsolicited B2B email — Dominic sends by hand'),
  ('CA', 'manual_only', 'CASL: only to addresses published on their site, sent by hand')
on conflict (country_code) do nothing;
comment on table public.outreach_country_rules is
  'Cold B2B email per country (partners-2). manual_only rows are never sent automatically and show "You send". A country with no row is manual_only.';

-- ── 7 · outreach_send_queue ──────────────────────────────────────────────────────────────────────────
create table if not exists public.outreach_send_queue (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partner_orgs(id) on delete cascade,
  step         text not null,
  send_day     date not null,                 -- the sender's day (Europe/London) it was planned for
  scheduled_at timestamptz not null,          -- in the recipient's window
  status       text not null default 'planned' check (status in ('planned', 'approved', 'sent', 'skipped', 'cancelled')),
  approved_at  timestamptz,
  sent_at      timestamptz,
  skip_reason  text,
  created_at   timestamptz not null default now(),
  unique (partner_id, step)
);
create index if not exists outreach_send_queue_day_idx on public.outreach_send_queue (send_day, status);

-- ── 8 · outreach_settings rows ───────────────────────────────────────────────────────────────────────
insert into public.outreach_settings (key, value) values
  ('send_schedule', '{"approval_mode": true, "daily_cap": 25, "window": {"days": [2, 3, 4], "start": "09:30", "end": "11:30"}, "spacing_min": {"min": 3, "max": 8}}'::jsonb),
  ('postal_address', '{"text": "HatchGrab Ltd, Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom"}'::jsonb)
on conflict (key) do nothing;

-- ── RLS: the outreach pattern ────────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['partner_codes', 'partner_code_redemptions', 'partner_commission_payments', 'outreach_country_rules', 'outreach_send_queue'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service_role only" on public.%I', t);
    execute format('create policy "service_role only" on public.%I for all to service_role using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

-- ── VERIFY (read-only) ───────────────────────────────────────────────────────────────────────────────
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conname = 'partner_orgs_type_check';
-- select relname, relrowsecurity from pg_class where relname in ('partner_codes','partner_code_redemptions','partner_commission_payments','outreach_country_rules','outreach_send_queue');
-- select country_code, cold_email from public.outreach_country_rules order by 1;
-- select key from public.outreach_settings order by 1;
-- select tgname from pg_trigger where tgname = 'trucks_referred_code_immutable';
