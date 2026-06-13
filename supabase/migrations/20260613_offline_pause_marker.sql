-- Durable marker that an offline-protection auto-pause OCCURRED on an event.
--
-- WHY: online_paused_until is nulled by /api/heartbeat the moment a device reconnects (the clear
-- that fixes "online dashboard still shows Paused"). So a popup keyed on online_paused_until mostly
-- won't fire in the real case (all screens closed → reconnect erases the pause before the dashboard
-- can read it). This timestamp is set by heartbeat-monitor alongside online_paused_until but is NEVER
-- cleared by the heartbeat, so the dashboard can detect "offline protection fired while I was away"
-- after the device is back online and surface a one-time acknowledge popup.
--
-- WRITTEN ONLY by heartbeat-monitor (offline auto-pause). Manual pause (set_paused) does NOT touch it,
-- so a popup keyed on this column inherently excludes manual pauses.
alter table truck_events
  add column if not exists last_offline_pause_at timestamptz;

-- Reload PostgREST schema cache so the new column is queryable immediately.
notify pgrst, 'reload schema';
