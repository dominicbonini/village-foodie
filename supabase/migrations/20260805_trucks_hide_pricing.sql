-- 20260805_trucks_hide_pricing.sql
-- Per-truck pricing suppression: trucks.hide_pricing.
--
-- ⚠️ CLASSIFICATION: **ADDITIVE, and deploy-order-INDEPENDENT in both directions.**
--   • Code before migration — safe. /api/manage reads the truck with `select('*')`, which DEGRADES: the
--     field is simply absent, the client reads `undefined`, and `?? false` resolves it to "not hidden",
--     i.e. today's behaviour. No 42703, no blank page.
--   • Migration before code — safe. Nothing reads the column until the code ships; the default is false,
--     so every existing truck keeps rendering exactly as it does now.
-- 🔴 The ONE thing that is NOT order-independent is the admin console: app/api/admin/route.ts uses a
--    HAND-MAINTAINED EXPLICIT SELECT, and a named select against a missing column fails the WHOLE query
--    with 42703 — which would blank the entire admin trucks table. `hide_pricing` is added to that list
--    in the same change as this file, so **run this migration BEFORE deploying that code.**
--
-- ── WHY A COLUMN AND NOT A SLUG CHECK ─────────────────────────────────────────────────────────────
-- The requirement is "one live operator keeps seeing TBC after the global flag flips". A hardcoded slug
-- list would work for exactly one truck and would then need a code change (and a deploy) for the second
-- — during onboarding, which is when this is most likely to be needed. Whether a truck may see real
-- pricing is a property OF THAT TRUCK, so it belongs on the row.
--
-- ── WHY NOT NULL DEFAULT false ────────────────────────────────────────────────────────────────────
-- The safe reading of "we have never thought about this truck" is "show them the prices", because that is
-- what every truck does today and what the global flag alone already controls. A nullable column would
-- introduce a third state (null) that every reader would have to coalesce, and the manual already records
-- what happens when a NOT NULL DEFAULT and a nullable column are confused (§16, qr_code_style).
-- ⚠️ Consequence, recorded because it recurs: a stored `false` is INDISTINGUISHABLE from "never set".
-- Nothing here needs to tell those apart, but do not build a "has an admin reviewed this truck" feature
-- on top of this column — it cannot answer that question.
alter table trucks add column if not exists hide_pricing boolean not null default false;

comment on column trucks.hide_pricing is
  'Per-truck pricing suppression. When true, monetary prices render as "TBC" for this truck EVEN IF NEXT_PUBLIC_PRICING_PUBLISHED is ''true'' — the per-truck flag is ANDed with the global one, never overridden by it. Non-sensitive values (Free, Free trial, Lifetime, 0%, Pay at Hatch) always render as-is. Set for operators onboarded before pricing was finalised, so they are not shown numbers that have not been agreed with them. Cleared from the admin console; no SQL needed. Default false = prices follow the global flag, which is the behaviour of every truck before this column existed.';

notify pgrst, 'reload schema';

-- ── VERIFY (run after) ────────────────────────────────────────────────────────────────────────────
-- Expect: boolean, NO (not nullable), default false — and EVERY existing row false.
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'trucks' and column_name = 'hide_pricing';
--
--   select hide_pricing, count(*) from trucks group by hide_pricing;
--
-- 🔴 "add column if not exists" succeeds whether or not it added anything (§35). The count above is the
-- only thing that proves the column is really there and really defaulted.
