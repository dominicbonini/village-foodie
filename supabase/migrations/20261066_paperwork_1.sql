-- supabase/migrations/20261066_paperwork_1.sql — paperwork-1 (4 November 2026, docs/paperwork-1-report.md).
-- Manage › Paperwork: a truck's compliance documents, what the AI read from them, the reminders, and the links that share
-- them with event organisers. Every table is the operator-table posture: RLS on, NO policy, NO grant to anon or
-- authenticated — only the service role (the server routes) reads or writes them.
--
-- 1 · paperwork_document_types — the default list per country, as data. country_code NULL = the general list, used by every
--     country without its own. The names are messages (paperwork.types.<key>), not columns. `date_label` says how the date
--     reads: 'expires' (an expiry) or 'review_by' (the HACCP plan's "review by" date).
-- 2 · truck_documents — one row per uploaded file. status: pending (uploaded, not yet saved: never listed, swept after a day),
--     current, superseded (a renewal replaced it; kept as history), deleted (its file removed and its details cleared).
--     Reminder bookkeeping: the last stage sent and the expiry date it was sent for (a new date starts again).
-- 3 · document_shares + document_share_items — a link sent to organisers. The token is the access (base64url, 22–64
--     characters, generated with 192 random bits by lib/paperwork/share.ts). An item names a document TYPE (so a renewal
--     shows automatically) or, for a custom document, the document itself.
-- 4 · paperwork_share_viewed(token) — counts one view of a live link, atomically (first_opened_at, view_count). Service role only.
-- 5 · the PRIVATE storage bucket truck-documents (<truck_id>/<document_id>/<file>), 20 MB, the five accepted file types.
--     No storage policy: only the service role reaches it, and files are opened through short-lived signed URLs.
-- No plan_features row: a missing row means ON for every plan (lib/features.ts `paperwork`).

begin;

-- ── 1 · the default document types ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.paperwork_document_types (
  id           bigserial primary key,
  key          text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  position     integer not null default 0,
  has_expiry   boolean not null default true,
  date_label   text not null default 'expires' check (date_label in ('expires', 'review_by')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create unique index if not exists paperwork_document_types_key_country_uq
  on public.paperwork_document_types (key, coalesce(country_code, '*'));
alter table public.paperwork_document_types enable row level security;
revoke all on public.paperwork_document_types from anon, authenticated;
revoke all on sequence public.paperwork_document_types_id_seq from anon, authenticated;

insert into public.paperwork_document_types (key, country_code, position, has_expiry, date_label) values
  ('food_registration',      'GB', 1,  true,  'expires'),
  ('hygiene_rating',         'GB', 2,  false, 'expires'),
  ('food_safety_plan',       'GB', 3,  true,  'review_by'),
  ('public_liability',       'GB', 4,  true,  'expires'),
  ('employers_liability',    'GB', 5,  true,  'expires'),
  ('gas_safety',             'GB', 6,  true,  'expires'),
  ('pat_test',               'GB', 7,  true,  'expires'),
  ('fire_safety',            'GB', 8,  true,  'expires'),
  ('risk_assessment',        'GB', 9,  true,  'expires'),
  ('allergen_info',          'GB', 10, true,  'expires'),
  ('street_trading_licence', 'GB', 11, true,  'expires'),
  ('food_registration',      null, 1,  true,  'expires'),
  ('hygiene_rating',         null, 2,  false, 'expires'),
  ('food_safety_plan',       null, 3,  true,  'review_by'),
  ('public_liability',       null, 4,  true,  'expires'),
  ('gas_safety',             null, 5,  true,  'expires'),
  ('electrical_safety',      null, 6,  true,  'expires'),
  ('fire_safety',            null, 7,  true,  'expires'),
  ('risk_assessment',        null, 8,  true,  'expires'),
  ('allergen_info',          null, 9,  true,  'expires'),
  ('trading_licence',        null, 10, true,  'expires')
on conflict (key, coalesce(country_code, '*')) do nothing;

-- ── 2 · a truck's documents ───────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.truck_documents (
  id                       uuid primary key default gen_random_uuid(),
  truck_id                 text not null references public.trucks(id) on delete cascade,
  type_key                 text check (type_key is null or type_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  custom_name              text check (custom_name is null or length(custom_name) <= 120),
  issuer                   text check (issuer is null or length(issuer) <= 160),
  issued_on                date,
  expires_on               date,
  name_on_document         text check (name_on_document is null or length(name_on_document) <= 160),
  cover_amount_minor       bigint check (cover_amount_minor is null or cover_amount_minor >= 0),
  currency                 text check (currency is null or currency ~ '^[A-Z]{3}$'),
  storage_path             text,
  mime                     text check (mime is null or mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes               integer check (size_bytes is null or (size_bytes > 0 and size_bytes <= 20971520)),
  original_filename        text check (original_filename is null or length(original_filename) <= 200),
  ai_extracted             jsonb,
  status                   text not null default 'pending' check (status in ('pending', 'current', 'superseded', 'deleted')),
  superseded_by            uuid references public.truck_documents(id) on delete set null,
  reminder_stage           text check (reminder_stage is null or reminder_stage ~ '^(d28|d7|d0|w[0-9]{1,3})$'),
  reminder_expires_on      date,
  reminder_sent_at         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- a saved document has a type or a name of its own; a pending one may have neither yet
  constraint truck_documents_named_chk check (status in ('pending', 'deleted') or type_key is not null or custom_name is not null),
  constraint truck_documents_cover_currency_chk check (cover_amount_minor is null or currency is not null)
);
create index if not exists truck_documents_truck_status_idx on public.truck_documents (truck_id, status);
create index if not exists truck_documents_reminders_idx on public.truck_documents (expires_on) where status = 'current' and expires_on is not null;
-- at most one CURRENT document per truck and type (a renewal supersedes the old one first)
create unique index if not exists truck_documents_one_current_per_type_uq
  on public.truck_documents (truck_id, type_key) where status = 'current' and type_key is not null;
alter table public.truck_documents enable row level security;
revoke all on public.truck_documents from anon, authenticated;

-- ── 3 · links sent to organisers ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.document_shares (
  id               uuid primary key default gen_random_uuid(),
  truck_id         text not null references public.trucks(id) on delete cascade,
  token            text not null unique check (length(token) between 22 and 64 and token ~ '^[A-Za-z0-9_-]+$'),
  organiser_emails text[] not null check (cardinality(organiser_emails) between 1 and 5),
  message          text check (message is null or length(message) <= 1000),
  event_id         uuid references public.truck_events(id) on delete set null,
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  first_opened_at  timestamptz,
  view_count       integer not null default 0 check (view_count >= 0),
  constraint document_shares_expiry_chk check (expires_at > created_at and expires_at <= created_at + interval '91 days')
);
create index if not exists document_shares_truck_idx on public.document_shares (truck_id, created_at desc);
alter table public.document_shares enable row level security;
revoke all on public.document_shares from anon, authenticated;

create table if not exists public.document_share_items (
  id          bigserial primary key,
  share_id    uuid not null references public.document_shares(id) on delete cascade,
  type_key    text check (type_key is null or type_key ~ '^[a-z][a-z0-9_]{1,40}$'),
  document_id uuid references public.truck_documents(id) on delete cascade,
  position    integer not null default 0,
  constraint document_share_items_one_chk check ((type_key is null) <> (document_id is null))
);
create index if not exists document_share_items_share_idx on public.document_share_items (share_id);
create index if not exists document_share_items_document_idx on public.document_share_items (document_id) where document_id is not null;
alter table public.document_share_items enable row level security;
revoke all on public.document_share_items from anon, authenticated;
revoke all on sequence public.document_share_items_id_seq from anon, authenticated;

-- ── 4 · one view of a live link, counted atomically ───────────────────────────────────────────────────────────────
create or replace function public.paperwork_share_viewed(p_token text)
returns table (share_id uuid, truck_id text, expires_at timestamptz)
language sql
security invoker
set search_path = public
as $$
  update public.document_shares s
     set view_count = s.view_count + 1,
         first_opened_at = coalesce(s.first_opened_at, now())
   where s.token = p_token and s.revoked_at is null and s.expires_at > now()
  returning s.id, s.truck_id, s.expires_at;
$$;
revoke all on function public.paperwork_share_viewed(text) from public, anon, authenticated;
grant execute on function public.paperwork_share_viewed(text) to service_role;

-- ── 5 · the private bucket ────────────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('truck-documents', 'truck-documents', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- No policy on storage.objects for this bucket: anon and authenticated users can neither read nor list nor write it.

commit;

-- Check (read-only):
--   select relname, relrowsecurity from pg_class where relname in ('paperwork_document_types','truck_documents','document_shares','document_share_items');
--   select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name in (…) and grantee in ('anon','authenticated');
--   select coalesce(country_code,'*') c, count(*) from paperwork_document_types group by 1;
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'truck-documents';
