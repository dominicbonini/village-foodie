-- Stage 2: immutable scraped-signature for the approval bridge dedup.
-- The /api/inbound-schedule bridge sets this ONCE at insert to the as-scraped venue text, and
-- never changes it (events/action `update` does not include it in its allowed-list). Future scrapes
-- are fuzzy-matched (Levenshtein ≤1 on the normalized venue) against this + the row's truck_id +
-- event_date, so an operator editing the displayed venue ("Fardons"→"Farndons") doesn't make the
-- original re-surface as a new pending event. NULL for operator-created / non-scraped events
-- (the bridge falls back to venue_name for null-signature rows — backward-compatible).
alter table truck_events
  add column if not exists scraped_signature text;

comment on column truck_events.scraped_signature is
  'Immutable as-scraped venue text, set once at inbound-schedule bridge insert; never changed by edits. Bridge dedup fuzzy-matches future scrapes against it so edited events do not re-surface. NULL for non-scraped events.';
