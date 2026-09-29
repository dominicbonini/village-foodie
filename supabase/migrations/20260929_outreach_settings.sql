-- 20260929_outreach_settings.sql
-- Operator-editable settings for outreach email: the signature lines and the opt-out sentence.
--
-- ✅ APPLIED BY HAND on 29 September 2026, in the Supabase SQL editor, by Dominic — together with its
--    two seed rows. This file is the record of what was run, not a pending change. Do not re-run it
--    expecting an effect: every statement is guarded (`if not exists`, `on conflict do nothing`), so a
--    second run is a no-op and in particular WILL NOT overwrite an edited signature.
--
-- ── 🔴 WHY A KEY/VALUE TABLE AND NOT COLUMNS ───────────────────────────────────────────────────────
-- The signature is an ORDERED LIST OF LINES, each with a bold flag, and its length changes whenever
-- Dominic adds a line. As columns that is either a fixed nine — wrong the first time he wants ten — or
-- a second table with a sort order, which is a lot of machinery for one document nobody joins against.
-- `jsonb` holds the shape the editor and the sender both already use, and the two readers parse it
-- defensively (`parseSignature`, `parseOptOut` in lib/outreach-signature.ts) rather than trusting it.
--
-- ⚠️ THE ROWS ARE READ ON EVERY SEND. A malformed or missing row REFUSES the send with a sentence
-- naming the code; it never expands to nothing. `{{opt_out}}` in a template is an assertion that the
-- email carries an opt-out line, and silently dropping it would send a cold approach without one.
begin;

create table if not exists public.outreach_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── 🔴 RLS ON, ONE service_role POLICY, anon/authenticated REVOKED ────────────────────────────────
-- The §52.2 pattern. Enabling RLS alone leaves the default grants in place, so the capability would
-- still be reachable with the anon key; the revoke is the half that closes it. Every reader and writer
-- is a server route using SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS and is the only role granted.
alter table public.outreach_settings enable row level security;

drop policy if exists "service_role only" on public.outreach_settings;
create policy "service_role only" on public.outreach_settings
  for all to service_role using (true) with check (true);

revoke all on public.outreach_settings from anon, authenticated, public;

comment on table public.outreach_settings is
  'Operator-editable outreach settings (signature lines, opt-out sentence). Server routes only.';

-- ── THE TWO SEED ROWS ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ `on conflict do nothing` — this is a SEED, not a reset. Once Dominic has edited his signature on
-- the Templates tab, re-running this file must leave it exactly as he left it.
-- The seed values are the captured Outlook block, line for line, so the first email sent after the
-- migration is byte-identical to the ones sent before it.
insert into public.outreach_settings (key, value) values
  ('signature', '{"lines":[
     {"text":"Kind regards,","bold":false},
     {"text":"Dominic","bold":false},
     {"text":"","bold":false},
     {"text":"","bold":false},
     {"text":"Dominic Bonini","bold":true},
     {"text":"Founder, HatchGrab","bold":false},
     {"text":"hatchgrab.com | villagefoodie.co.uk","bold":false},
     {"text":"07941 042 253","bold":false}
   ]}'::jsonb),
  ('opt_out', '{"text":"If you would rather not hear from me again, reply with \"no thanks\" and I will not contact you."}'::jsonb)
on conflict (key) do nothing;

commit;

-- 🔴 PostgREST caches the schema. Until it reloads, every request against this table returns PGRST205
--    ("Could not find the table … in the schema cache") even though the table exists — which reads as
--    a failed migration. Run with the file.
notify pgrst, 'reload schema';
