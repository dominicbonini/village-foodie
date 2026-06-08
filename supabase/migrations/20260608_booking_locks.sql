-- Per-EVENT mutex for race-safe customer slot capacity + booking.
-- One customer's entire decide-and-book serialises against every other customer on
-- the same event, so each fresh under-lock read sees ALL prior bookings for the whole
-- event — required by the cumulative cross-slot per-category throughput model (b).
-- Acquire = INSERT (PK conflict = held). Winner runs read-decide-write, then DELETEs.
-- Stale rows (older than the request TTL) are reclaimable so a leaked lock self-heals.
-- trucks.id is text (Section 16) — keep truck_id text.

drop table if exists booking_locks cascade;

create table booking_locks (
  truck_id   text        not null references trucks(id) on delete cascade,
  event_date date        not null,
  locked_at  timestamptz not null default now(),
  primary key (truck_id, event_date)
);

-- Sweep stale locks by age (the acquire path filters on locked_at < now() - TTL).
create index booking_locks_locked_at on booking_locks(locked_at);

alter table booking_locks enable row level security;
-- service-role only, no anon policy (customers never touch this table directly)
