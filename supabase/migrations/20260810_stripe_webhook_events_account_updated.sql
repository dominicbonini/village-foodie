-- 20260810_stripe_webhook_events_account_updated.sql
-- Marks which recorded webhook events were ACTED ON, not merely received.
--
-- 🔴 RUN THIS SECOND — AFTER 20260810_operators_stripe_connect.sql, AND BEFORE THE DEPLOY.
-- Order matters between the two only in one direction: the `account.updated` branch this column supports
-- writes `operators.stripe_charges_enabled`, so that column must exist first. Running this one alone
-- would leave a marker for a handler that cannot do its job.
--
-- ✅ CLASSIFICATION: **ADDITIVE**, and inert on arrival. `handled` already exists on this table
-- (live-verified: id, stripe_event_id, type, livemode, connected_account, api_version, stripe_created_at,
-- received_at, handled — 9 columns, 4 rows). What it does NOT have is anywhere to record WHEN it was
-- handled or WHAT the handler decided, so a row reading `handled = false` is indistinguishable between
-- "no handler exists for this type" and "a handler ran and failed".
--
-- ── 🔴 WHY THIS IS NOT JUST A BOOLEAN FLIP ─────────────────────────────────────────────────────────
-- The `account.updated` branch is the mechanism that keeps a MONEY GATE fresh. When it stops working,
-- the failure is silent by construction: `stripe_charges_enabled` simply stops changing, and a stale
-- `true` is a truck that Stripe has stopped letting take card payments while the product still offers
-- it. So the table has to record enough to answer "did this event reach the handler, and what did it
-- do" from the row alone — not from a log line that has since rotated.
--
-- VERIFY AFTER APPLYING:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'stripe_webhook_events'
--      and column_name in ('handled', 'handled_at', 'handler_result')
--    order by column_name;
--   -- expect 3 rows: handled | boolean (pre-existing) · handled_at | timestamptz | YES | null
--   --                handler_result | text | YES | null
--
--   -- the four existing rows must be untouched — no backfill:
--   select handled, handled_at, handler_result, count(*) from stripe_webhook_events group by 1,2,3;
--   -- expect a single row: false | null | null | 4   (or whatever `handled` already held)

alter table stripe_webhook_events
  add column if not exists handled_at timestamptz,
  add column if not exists handler_result text;

comment on column stripe_webhook_events.handled_at is
  'When a handler ACTED on this event. NULL = no handler ran, which for most types is normal rather than a failure. Distinguishes "no handler exists for this type" from "a handler ran", which `handled` alone cannot.';

comment on column stripe_webhook_events.handler_result is
  'What the handler decided, as a short slug — e.g. ''charges_enabled:true'', ''ignored:livemode'', ''no_operator''. 🔴 Diagnostic for a gate that fails SILENTLY: if account.updated stops updating operators.stripe_charges_enabled, a stale `true` is a truck offering card payment Stripe has stopped allowing. Free-text on purpose; nothing parses it and nothing may start to.';

notify pgrst, 'reload schema';
