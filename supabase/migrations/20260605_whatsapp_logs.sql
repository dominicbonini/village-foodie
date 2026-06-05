-- whatsapp_logs: records every inbound WhatsApp message and the auto-reply result.
-- Table was created directly in Supabase; this migration documents the schema.
-- Safe to run against a DB where the table already exists.

create table if not exists public.whatsapp_logs (
  id               uuid        default gen_random_uuid() primary key,
  truck_id         text        references public.trucks(id) on delete cascade,
  customer_number  text,
  message_in       text,
  classification   text,
  events_found     integer,
  response_sent    text,
  possible_miss    boolean     default false,
  created_at       timestamptz default now()
);

alter table public.whatsapp_logs enable row level security;

-- service-role only, no anon policy
