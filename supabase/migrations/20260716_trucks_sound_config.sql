-- 20260716_trucks_sound_config.sql
-- Per-truck SOUND POLICY (which alerts fire). The on/off MASTER stays a per-device localStorage pref on
-- the dashboard/KDS header (physical mute) — this jsonb is only WHICH events make sound, per truck.
--   new_orders: 'needs_confirming' | 'all' | 'off'   (default 'needs_confirming' = today's behaviour)
--   order_due:  boolean                              (default false — amber "start cooking" tone off)
-- NOT NULL + default backfills every existing truck with today's behaviour, so nothing changes until a
-- truck configures it in Manage → Settings → Order settings.

alter table trucks
  add column if not exists sound_config jsonb not null
  default '{"new_orders":"needs_confirming","order_due":false}'::jsonb;
