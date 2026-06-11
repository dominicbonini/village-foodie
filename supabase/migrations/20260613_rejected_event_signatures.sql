-- Stage 3: event-signature-level reject memory.
-- When an operator rejects a scraped pending event, its exact-event signature (truck_id +
-- event_date + immutable scraped venue) is stored here so the /api/inbound-schedule bridge skips
-- it on future scrapes — no re-create, no re-notify. This is INDEPENDENT of the truck_events row:
-- a rejected-then-deleted event stays suppressed because the signature persists here. Distinct from
-- the coarse, venue-name-level excluded_terms (which suppresses ALL events at a venue).
create table if not exists rejected_event_signatures (
  id                uuid primary key default gen_random_uuid(),
  truck_id          text not null references trucks(id) on delete cascade,
  event_date        date not null,
  scraped_signature text not null,            -- the immutable as-scraped venue (Stage 2)
  created_at        timestamptz not null default now()
);

create index if not exists idx_rejected_sig_truck_date
  on rejected_event_signatures(truck_id, event_date);

-- Reload PostgREST schema cache so the new table is queryable immediately.
notify pgrst, 'reload schema';
