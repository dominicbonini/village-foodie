-- events-overlap-2 (17 November 2026): "Keep {other}" on the dashboard's overlap dialog is remembered ONCE PER EVENT, ON
-- ANY DEVICE. When staff tap an unapproved event that overlaps an approved or started one and choose to keep the approved
-- one, the unapproved event's overlap_dismissed_at is set; the overlap dialog is never shown for it again (tapping it later
-- shows only the plain "approve it?" dialog). Written by app/api/events/action/route.ts action 'dismiss_overlap'.
-- ADDITIVE ONLY: one new nullable column, no default, no backfill, no index. Nothing reads it but the staff screens.
alter table public.truck_events add column if not exists overlap_dismissed_at timestamptz;

comment on column public.truck_events.overlap_dismissed_at is
  'events-overlap-2: when staff chose to keep the overlapping approved event instead of approving this one. Null = never asked or never dismissed.';
