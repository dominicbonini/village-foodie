-- 20260930_outreach_sequence_slots.sql
-- The sequence grid: one template per (channel, step, truck type), and the default column.
--
-- ⏳ NOT YET APPLIED. It is in the report and in the chat reply for Dominic to run. Nothing in this
--    repository runs SQL.
--
-- ── 🔴 WHAT THIS REPLACES ──────────────────────────────────────────────────────────────────────────
-- Three mechanisms chose a template and could disagree: `STEP_TEMPLATE` (a slug map in code),
-- `serves_kind` / `serves_lead_type` (tags on the template rows), and `suggestTemplateId` (a
-- heuristic over stage and hu_ordering). This table is the single answer. The tag columns STAY —
-- they are history on rows tagged by hand, and the Templates tab shows them read-only — but nothing
-- reads them to choose a template any more.
--
-- ── 🔴 WHAT THIS MIGRATION MUST NEVER DO ───────────────────────────────────────────────────────────
-- It never creates, edits, seeds, retires or deletes an `outreach_templates` ROW. It adds one UNIQUE
-- CONSTRAINT to that table (see below), which touches no row and changes no wording. Every seed
-- below inserts into `outreach_sequence_slots` only, and looks its template up by slug — a slug that
-- is absent simply seeds no row, visibly, in the verification select at the bottom.
begin;

-- ── 🔴 THE CHANNEL RULE, ENFORCED IN THE DATABASE AND NOT ONLY IN THE ROUTE ────────────────────────
-- A slot's template must be of the slot's channel. A plain FK to `outreach_templates(id)` cannot say
-- that, so the slot carries its own `channel` and points at the template through a COMPOSITE key.
-- That needs a unique constraint on `(id, channel)` — `id` is already the primary key, so this adds
-- no new uniqueness and cannot fail on existing data; it exists only to be referenced.
-- ⚠️ THIS IS A SCHEMA ADDITION TO `outreach_templates`, AND IT IS THE ONLY ONE. No row is read,
-- written, or changed by it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'outreach_templates_id_channel_key'
      and conrelid = 'public.outreach_templates'::regclass
  ) then
    alter table public.outreach_templates
      add constraint outreach_templates_id_channel_key unique (id, channel);
  end if;
end $$;

create table if not exists public.outreach_sequence_slots (
  id          uuid primary key default gen_random_uuid(),
  -- 'email' | 'whatsapp'. The grid has one tab per channel.
  channel     text not null check (channel in ('email', 'whatsapp')),
  -- The four rungs, exactly as lib/outreach.ts CONTACT_KINDS spells them.
  step        text not null check (step in ('1_first_contact', '2_chase_1', '3_chase_2', '4_final_chase')),
  -- The four lead types (lib/outreach-step.ts LEAD_TYPES) plus 'any' — the "All trucks (default)"
  -- column. 🔴 NOT NULL: "no template here" is the ABSENCE of a row, never a null in one, so the
  -- unique constraint below can do its job.
  lead_type   text not null check (lead_type in ('any', 'hu_ordering', 'hu_map', 'on_vf', 'not_listed')),
  template_id uuid not null,
  updated_at  timestamptz not null default now(),

  -- 🔴 ONE TEMPLATE PER BOX. This is the constraint the whole design rests on: two templates for one
  -- box is not a precedence puzzle to solve in code, it is impossible.
  constraint outreach_sequence_slots_box_key unique (channel, step, lead_type),

  -- 🔴 THE COMPOSITE FK. It is the FK to outreach_templates(id) the brief asks for AND the channel
  -- rule: a slot in the email grid cannot point at a WhatsApp template, in the database, whatever a
  -- route or a client believes. `on delete cascade` because a deleted template leaves no box.
  constraint outreach_sequence_slots_template_fk
    foreign key (template_id, channel) references public.outreach_templates (id, channel) on delete cascade
);

create index if not exists outreach_sequence_slots_channel_step_idx
  on public.outreach_sequence_slots (channel, step);

-- ── 🔴 RLS ON, ONE service_role POLICY, anon/authenticated REVOKED ────────────────────────────────
-- The §52.2 pattern, identical to `outreach_settings` and `outreach_messages`. Enabling RLS alone
-- leaves the default grants in place, so the table would still be reachable with the anon key; the
-- revoke is the half that closes it. Every reader and writer is a server route using
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS and is the only role granted.
alter table public.outreach_sequence_slots enable row level security;

drop policy if exists "service_role only" on public.outreach_sequence_slots;
create policy "service_role only" on public.outreach_sequence_slots
  for all to service_role using (true) with check (true);

revoke all on public.outreach_sequence_slots from anon, authenticated, public;

comment on table public.outreach_sequence_slots is
  'One template per (channel, step, lead type). lead_type = ''any'' is the default column. Server routes only.';

-- ── THE SEED: EXACTLY FIVE ROWS, FROM DOMINIC''S CURRENT TAGS ──────────────────────────────────────
-- ⚠️ `on conflict do nothing` — a SEED, not a reset. Once a box has been set on the Templates tab,
-- re-running this file leaves it exactly as he left it.
-- ⚠️ EVERY ROW IS LOOKED UP BY SLUG. A slug that does not exist inserts nothing at all — no error,
-- no guess, and the verification select at the bottom shows which boxes ended up filled.
insert into public.outreach_sequence_slots (channel, step, lead_type, template_id)
select 'email', v.step, v.lead_type, t.id
from (values
  ('1_first_contact', 'hu_ordering', 'hu_rate_email'),
  ('1_first_contact', 'hu_map',      'hatches-up-map-only'),
  ('1_first_contact', 'on_vf',       'general_email'),
  ('2_chase_1',       'any',         'chaser_email'),
  ('2_chase_1',       'hu_ordering', 'chase-1')
) as v(step, lead_type, slug)
join public.outreach_templates t on t.slug = v.slug and t.channel = 'email'
on conflict (channel, step, lead_type) do nothing;

commit;

-- 🔴 PostgREST caches the schema. Until it reloads, every request against this table returns PGRST205
--    ("Could not find the table … in the schema cache") even though the table exists — which reads as
--    a failed migration. Run it with the file.
notify pgrst, 'reload schema';

-- ── VERIFICATION ──────────────────────────────────────────────────────────────────────────────────
-- Every box that now has a template, and — as `missing` — every seed slug that was NOT found, which
-- is the one thing that can silently go wrong here.
select s.channel, s.step, s.lead_type, t.slug, t.label, t.active
from public.outreach_sequence_slots s
join public.outreach_templates t on t.id = s.template_id
order by s.channel, s.step, (s.lead_type = 'any') desc, s.lead_type;

select v.slug as missing
from (values ('hu_rate_email'), ('hatches-up-map-only'), ('general_email'), ('chaser_email'), ('chase-1')) as v(slug)
where not exists (select 1 from public.outreach_templates t where t.slug = v.slug and t.channel = 'email');
