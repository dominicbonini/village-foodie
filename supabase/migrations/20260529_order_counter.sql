-- Per-truck atomic order counter used to generate sequential order IDs (0001, 0002, ...)
ALTER TABLE trucks
ADD COLUMN IF NOT EXISTS order_counter integer NOT NULL DEFAULT 0;

-- Atomically increments the counter and returns the new value.
-- Called by nextOrderId() in lib/order-utils.ts.
CREATE OR REPLACE FUNCTION increment_order_counter(p_truck_id text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_counter integer;
BEGIN
  UPDATE trucks
  SET order_counter = order_counter + 1
  WHERE id = p_truck_id
  RETURNING order_counter INTO v_counter;
  RETURN v_counter;
END;
$$;

-- ═══ 🔴 NOT CALLABLE WITH THE PUBLIC KEY (added 19 October 2026, docs/us-polish-batch-report.md) ══════════════════════
-- A new function in `public` gets EXECUTE for anon and authenticated by DEFAULT (pg_default_acl), so without this the
-- public (anon) key could call it over /rest/v1/rpc. Every caller is server code on the service role. On 12 October
-- these grants were revoked live, then reopened by a hand-run GRANT; scripts/migration-function-grants.cjs now fails
-- the sweep on any migration that creates a function without revoking it in the same file, or grants one back.
-- Idempotent (revoke/grant of a privilege already in that state is a no-op).
revoke execute on function public.increment_order_counter(text) from public, anon, authenticated;
grant  execute on function public.increment_order_counter(text) to service_role;
