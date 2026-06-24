-- Pre-orders MASTER toggle (V7.8 §47) — truck-level on/off for the whole pre-orders feature.
-- Gates BOTH read effects at request time: the menu sold-out term (app/api/menu/[truckId]/route.ts)
-- and the order-submit force-pending rollup (app/api/orders/submit/route.ts) AND in
-- `truck.preorders_enabled !== false`. Read-time gate ONLY — turning it off NEVER clears the per-item
-- preorder_* columns (config persists, "saved but disabled"; toggling back on restores both effects).
--
-- Truck-level (mirrors allow_customer_cancellation, not the van-level kitchen_capacity). DEFAULT true
-- so existing trucks are unaffected; `!== false` in the gates also means a null/pre-migration read is
-- treated as ENABLED. Written via the update_truck action (allowlist).
-- Idempotent (IF NOT EXISTS): the column was already hand-applied in the Supabase SQL editor; this is
-- the TRACKED record. Apply by hand if absent, then: notify pgrst, 'reload schema';

alter table trucks
  add column if not exists preorders_enabled boolean not null default true;

comment on column trucks.preorders_enabled is 'Master pre-orders on/off for the truck. false = all per-item pre-order deadlines inert (config preserved). Gated at read time in the menu sold-out + submit force-pending effects.';
