drop table if exists excluded_terms cascade;

create table excluded_terms (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null references trucks(id) on delete cascade,
  term text not null,
  created_at timestamptz not null default now(),
  unique(truck_id, term)
);

create index excluded_terms_truck
  on excluded_terms(truck_id);

alter table excluded_terms enable row level security;
-- service-role only, no anon policy
