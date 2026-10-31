-- supabase/migrations/20261052_demo_2.sql — demo-2 (30 October 2026, docs/demo-2-report.md).
-- ⛔ NOT RUN — Dominic runs it before the deploy. Everything that reads or writes these is tolerant until then: the
-- demo still builds, its email is still sent, and the counts and stored menus simply wait for this file.
--
-- 1 · demo_sessions: the landing demo's email (asked BEFORE the build), when it was given, and the visitor's choice
--     about occasional tips and news (with the time). `visitor_email` is deliberately NOT the existing `email` column:
--     `email` is "keep my demo for 14 days" (Save my menu), and giving an address to receive the link must not
--     extend a demo by itself — the privacy text promises 24 hours unless they ask to keep it.
-- 2 · demo_cleanup_log.files_deleted — how many stored menu files each sweep deleted with its demos.
-- 3 · public.demo_events — the funnel's counts. One row per step: the demo (its truck id — no email, no token), the
--     source (landing / outreach) and the time. NOT tied to demo_sessions by a foreign key, so the cleanup sweep never
--     deletes a count. Service role only.
-- 4 · storage bucket `demo-menus` — the uploaded menu file (or pasted text) of each demo, under `<truck_id>/`.
--     PRIVATE: no public URL, and no storage policy, so only the service role reaches it; Admin › Demos hands out a
--     signed link that lasts 60 seconds. Deleted with the demo by the cleanup sweep.

begin;

-- ── 1 · the email asked before the build ──────────────────────────────────────────────────────────────────────────
alter table public.demo_sessions
  add column if not exists visitor_email      text,
  add column if not exists email_given_at     timestamptz,
  add column if not exists marketing_opt_in   boolean not null default false,
  add column if not exists marketing_opt_in_at timestamptz;
alter table public.demo_sessions drop constraint if exists demo_sessions_visitor_email_chk;
alter table public.demo_sessions add constraint demo_sessions_visitor_email_chk
  check (visitor_email is null or (length(visitor_email) <= 320 and visitor_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));

-- ── 2 · files deleted by each sweep ────────────────────────────────────────────────────────────────────────────────
alter table public.demo_cleanup_log add column if not exists files_deleted integer not null default 0;

-- ── 3 · the funnel's counts ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.demo_events (
  id       bigserial primary key,
  demo_id  text,                 -- the demo's truck id ('demo-…'); null only for a build that failed before a truck existed
  source   text check (source is null or source in ('landing', 'outreach')),
  event    text not null check (event in ('build_started', 'build_ok', 'build_failed', 'sample_used', 'menu_viewed',
                                          'order_placed', 'cooking_started', 'ready_pressed', 'signup_started', 'signup_done')),
  at       timestamptz not null default now()
);
create index if not exists demo_events_at_idx on public.demo_events (at desc);
create index if not exists demo_events_event_at_idx on public.demo_events (event, at desc);
create index if not exists demo_events_demo_idx on public.demo_events (demo_id);
alter table public.demo_events enable row level security;
revoke all on public.demo_events from anon, authenticated;
revoke all on sequence public.demo_events_id_seq from anon, authenticated;

-- ── 4 · the private bucket for uploaded menus ──────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('demo-menus', 'demo-menus', false, 10485760,
        array['image/*', 'application/pdf', 'text/plain'])   -- what /api/demo accepts (any image, a PDF), plus pasted text
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No policy on storage.objects for this bucket: anon and authenticated users can neither read nor list nor write it.

commit;

-- Check:
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'demo_sessions' and column_name in ('visitor_email', 'email_given_at', 'marketing_opt_in', 'marketing_opt_in_at');
--   select id, public, file_size_limit from storage.buckets where id = 'demo-menus';
--   select count(*) from public.demo_events;
