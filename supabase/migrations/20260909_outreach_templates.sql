-- 20260909_outreach_templates.sql
-- Outreach message templates, moved out of `lib/outreach-templates.ts` and into the database so wording
-- can change without a code change.
--
-- ⛔ NOT APPLIED. Run by hand in the Supabase SQL editor. Idempotent (`if not exists` / `on conflict`).
-- 🔴 AFTER APPLYING, RUN THE LAST LINE: `notify pgrst, 'reload schema';`
--    PostgREST caches the schema. Until it reloads, every request against this table returns PGRST205
--    ("Could not find the table ... in the schema cache") even though the table exists — which reads as
--    "the migration failed" and cost a red scrape once already. The statement is the last line of this
--    file; if you run the file whole it is included.
--
-- ── 🔴 WHY A TABLE AND NOT A FILE ───────────────────────────────────────────────────────────────────
-- The bodies are marketing copy that changes; editing a TypeScript array to change a sentence means a
-- deploy for a wording tweak, and it means the copy is only editable by someone who can open the repo.
-- Five templates ship here as seed data, INCLUDING the four whose wording was never agreed — they are
-- seeded so they can be edited rather than retyped, and they are marked in `label` where they stand.
--
-- ── 🔴 WHAT DELIBERATELY DID NOT MOVE ───────────────────────────────────────────────────────────────
-- The GUARDS stay in code (lib/outreach-template-render.ts), because a row in this table must not be
-- able to switch one off:
--   • the opt-out footer is appended by `composeEmail`, never written in a body;
--   • the WhatsApp gate is `templatesFor`, which reads `whatsapp_confirmed` on the PROSPECT;
--   • unresolved `[[placeholders]]` are produced by `substitute` itself;
--   • the mailto length ceiling lives in the compose window.
-- A template controls its own words and its own `channel`. It controls none of the above.

begin;

create table if not exists public.outreach_templates (
  id            uuid primary key default gen_random_uuid(),

  -- 🔴 THE STABLE KEY IS `slug`, NOT `id`. `suggestTemplateId` returns 'chaser_email' / 'hu_rate_email'
  -- and the compose picker keys on it; a uuid that changed on a re-seed would break the suggestion
  -- silently. Unique so a re-run of the seed conflicts rather than duplicating.
  slug          text not null unique,

  label         text not null,               -- what the picker and the manage list show
  channel       text not null check (channel in ('email', 'whatsapp')),
  subject       text,                        -- email only; WhatsApp templates carry no subject
  body          text not null,

  sort_order    integer not null default 0,  -- order in the picker and the manage list

  -- 🔴 RETIRE, DO NOT DELETE. A contact-log row from months ago references the template that produced
  -- it; hard-deleting the template makes that history unexplainable. `active = false` removes it from
  -- the compose picker (enforced in `templatesFor`) while leaving it readable here.
  active        boolean not null default true,

  -- Per-placeholder defaults: { "your rate": { "value": "1.5% + 10p", "updated_at": "2026-09-09T..." } }
  -- 🔴 `updated_at` PER PLACEHOLDER, not per row. A stale default is worse than an empty field — it goes
  -- out in an email that looks correctly filled — so the age of each value has to be visible on its own.
  placeholder_defaults jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The picker's access path: active templates in display order.
create index if not exists outreach_templates_active_order
  on public.outreach_templates (active, sort_order);

-- ── RLS + GRANTS — SERVICE ROLE ONLY ────────────────────────────────────────────────────────────────
-- 🔴 THE SAME THREE DEFENCES AS `discovery_run_log`, AND FOR THE SAME REASON: RLS on, ONE service-role
-- policy, and the default anon/authenticated grants REVOKED — enabling RLS alone leaves the capability
-- in place. This matches how the admin route connects: every route under app/api/admin/ builds its
-- client with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS and is the only role granted here.
-- ⚠️ These bodies name rates and are outbound marketing copy; the manual is explicit that outreach data
-- must not sit on a table with an anon read policy.
alter table public.outreach_templates enable row level security;

drop policy if exists "service_role only" on public.outreach_templates;
create policy "service_role only" on public.outreach_templates
  for all to service_role using (true) with check (true);

revoke all on public.outreach_templates from anon, authenticated, public;

-- ── SEED — the five templates as they stood in lib/outreach-templates.ts ────────────────────────────
-- 🔴 `on conflict (slug) do nothing` — re-running this file NEVER overwrites an edited template.
-- ⚠️ Bodies are dollar-quoted ($tpl$) because they contain apostrophes; verified that no body, subject
-- or label contains the delimiter.
insert into public.outreach_templates (slug, label, channel, subject, body, sort_order) values
  ($tpl$hu_rate_email$tpl$, $tpl$Hatches Up — ordering costs$tpl$, $tpl$email$tpl$, $tpl$Ordering costs for {{truck_name}}$tpl$, $tpl$Hi,

?next_event: I run villagefoodie.co.uk, the food truck directory — your schedule's listed on it, including your {{next_event_day}} pitch at {{next_event_venue}}.
?no_next_event: I run villagefoodie.co.uk, the food truck directory — your schedule's listed on it.

I've also built HatchGrab, an ordering system for trucks. Here's one running live so you can see it: [[link]]

I noticed you're on Hatches Up at 4.5% + 20p. HatchGrab is [[your rate]] — on £10k a month through the site, that's about £[[X]] a year difference.

I'm doing a free introductory period while I onboard this season's trucks.

Want me to set yours up with your menu on it so you can have a look?

Dominic$tpl$, 10),
  ($tpl$general_email$tpl$, $tpl$General approach — listed on Village Foodie$tpl$, $tpl$email$tpl$, $tpl${{truck_name}} on Village Foodie$tpl$, $tpl$Hi{{contact_name_prefixed}},

I run Village Foodie, a site that lists street food traders and where they are trading this week. {{truck_name}} is on there already.
?next_event: Your next listed pitch is {{next_event_venue}} on {{next_event_day}} {{next_event_date}}.

I am adding online ordering for traders who want it — customers order and pay ahead, you get the order on your phone. My rate is [[my rate]], which is [[comparison to their current setup]].

?website: I have linked your site at {{website}} so customers can find you directly.

Worth a quick chat?

Best,$tpl$, 20),
  ($tpl$chaser_email$tpl$, $tpl$Chaser — already contacted$tpl$, $tpl$email$tpl$, $tpl$Following up — {{truck_name}}$tpl$, $tpl$Hi{{contact_name_prefixed}},

I got in touch a little while ago about online ordering for {{truck_name}} and I do not think I heard back — entirely possible it landed at a busy moment.
?next_event: I see you're at {{next_event_venue}} on {{next_event_day}}, so I imagine this week is full.

If it is not for you, just say so and I will leave it there. If it is, the offer stands at [[my rate]].

Best,$tpl$, 30),
  ($tpl$wa_intro$tpl$, $tpl$WhatsApp — short intro$tpl$, $tpl$whatsapp$tpl$, null, $tpl$Hi{{contact_name_prefixed}} — {{truck_name}}? I run Village Foodie, where you are listed.
?next_event: Saw you're at {{next_event_venue}} on {{next_event_day}}.
I am adding online ordering at [[my rate]]. Worth a look?$tpl$, 40),
  ($tpl$wa_chaser$tpl$, $tpl$WhatsApp — short chaser$tpl$, $tpl$whatsapp$tpl$, null, $tpl$Hi{{contact_name_prefixed}}, following up on my note about online ordering for {{truck_name}} — [[my rate]].
Happy to leave it if it is not for you, just let me know.$tpl$, 50)
on conflict (slug) do nothing;

commit;

-- 🔴 RUN THIS. See the header.
notify pgrst, 'reload schema';
