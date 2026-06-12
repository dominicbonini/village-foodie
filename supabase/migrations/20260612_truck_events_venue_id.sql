-- 20260612_truck_events_venue_id.sql
-- Adds venue_id anchor + provenance/confidence markers to truck_events.
-- Applied BY HAND in the Supabase SQL editor; this file is the record copy.

alter table truck_events
  add column if not exists venue_id uuid references venues(id) on delete set null;

alter table truck_events
  add column if not exists venue_id_source text;

alter table truck_events
  add column if not exists venue_match_confidence text;

comment on column truck_events.venue_id is
  'FK to venues(id). Resolved venue anchor for this event. NULL until the deployed/rebuilt findVenue write path or a deliberate backfill sets it. ON DELETE SET NULL so merging/deleting a venue never deletes events.';

comment on column truck_events.venue_id_source is
  'Provenance of venue_id, for history-prior anti-reinforcement. Allowed: scraper (matcher best-effort guess, NOT venue-validated) | operator (operator explicitly set/edited the venue) | manual (manual event create, operator chose venue) | backfill (re-resolved by backfill, treat as guess-level). History-prior counts ONLY operator|manual as validated anchors (>=2-visit floor); scraper|backfill are guesses. NULL = unset.';

comment on column truck_events.venue_match_confidence is
  'Matcher confidence at write time, for surfacing low-confidence guesses at approval. Allowed: high (village disambiguated cleanly) | low (best-pick, no village agreement / embedded-town fallback) | NULL (not a matcher write / unset).';

create index if not exists idx_truck_events_venue_id on truck_events(venue_id);

notify pgrst, 'reload schema';
