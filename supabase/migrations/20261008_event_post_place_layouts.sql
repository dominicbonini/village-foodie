-- 20261008_event_post_place_layouts.sql
-- Single-event post, stage 2b: a place may have its OWN text positions, not just its own picture.
--
-- ⛔ NOT APPLIED. Nothing in this repository runs SQL. Dominic runs this by hand in the Supabase SQL
--    editor. Idempotent, so re-running is safe. The last line reloads PostgREST — do not skip it, or
--    `event_layout` reads as absent and every place silently falls back to Standard's positions.
--
-- ── 🔴 ONE NULLABLE COLUMN, AND NULL IS THE EXISTING BEHAVIOUR ────────────────────────────────────
-- Stage 2 gave a place its own picture but always drew Standard's boxes on it. That works when a
-- place picture is the same poster with a different photo; it fails when the picture is laid out
-- differently — a truck whose per-venue artwork already has the venue name printed on it, with the
-- clear space in a different corner. Those trucks need the positions to travel WITH the picture.
--
-- NULL means "same text positions as Standard", which is exactly what every existing row does today,
-- so this migration changes no post that currently renders. Only a place the truck explicitly
-- switches to "Own for this place" gets a value.
--
-- ── 🔴 WHY jsonb ON truck_places AND NOT A ROW IN truck_post_designs ──────────────────────────────
-- `truck_post_designs` is keyed `(truck_id, kind)` with kind in ('week','event') — one row per truck
-- per poster. A per-place layout is not a third kind of poster; it is a variation of the event poster
-- for one venue, and there can be dozens. Keying that table by place as well would make `kind` mean
-- two different things and force every existing read to filter on a column that is null for both
-- current kinds. The place already owns `event_bg_path/width/height` (20261007), so the layout sits
-- beside the picture it belongs to, and `on delete cascade` from `truck_places` already disposes of
-- both when a place is deleted — no new cascade, no new RLS policy, no new join.
--
-- ── ⚠️ NOT VALIDATED BY A CHECK CONSTRAINT, DELIBERATELY ──────────────────────────────────────────
-- The shape is validated in `validateEventLayout()` (lib/weekly-post/layout.ts), which is the same
-- function the weekly and event designs already go through, and the width/height it validates against
-- are read from THIS ROW'S stored picture size on the server — never from the request body, or a
-- caller could claim any canvas size and place boxes outside the real picture. A CHECK constraint
-- cannot see the picture columns' meaning, could not be kept in step with LAYOUT_VERSION, and would
-- turn a recoverable 400 into a failed write. `jsonb` (not `json`) so a key is stored once and the
-- column can be indexed later if a query ever needs to find places that have their own positions.

set lock_timeout = '3s';

begin;

alter table public.truck_places
  add column if not exists event_layout jsonb;

comment on column public.truck_places.event_layout is
  'Optional OWN text positions for single-event posts at this place. NULL means ''same text positions as Standard'' — the behaviour of every row before 20261008 — so a place with only event_bg_path set keeps using the truck''s default event layout. When set, a full event layout in the shape validateEventLayout() accepts (lib/weekly-post/layout.ts): version, width, height, the date/location/time boxes each with an explicit `enabled` flag, an optional note box, timeStyle, timeDisplay and keepReadable. width/height MUST equal this row''s event_bg_width/event_bg_height — the server reads them from those columns and never from the request body, because they are what proves a box sits inside the real picture. A place with its own positions may use a picture of ANY shape (the 1% aspect rule in checkAspect() applies only to places still on Standard''s positions); replacing the picture with a different shape resets this column to NULL, because boxes placed on one shape land somewhere else on another.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: `event_layout` reads as absent, every place
--    falls back to Standard's positions, and saving a place's own positions fails on correct code.
notify pgrst, 'reload schema';
