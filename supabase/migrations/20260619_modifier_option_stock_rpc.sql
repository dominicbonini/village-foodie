-- Stage D2: atomic shared-pool decrement/increment for per-modifier-option stock.
-- modifier_options.stock_count is a STANDING shared supply (NULL = untracked/unlimited).
-- The decrement MUST be oversell-safe on its own (the per-event booking lock is keyed by
-- (truck_id, event_date) and cannot serialise a pool that spans events) — so it is a single
-- conditional atomic UPDATE, NOT a read-then-write.
--
-- Apply by hand in the Supabase SQL editor, then: notify pgrst, 'reload schema';

-- Returns TRUE if the option had enough stock and was decremented; FALSE if insufficient
-- (0 rows matched the WHERE) → the caller treats it as sold-out for this order. Untracked
-- (stock_count IS NULL) returns FALSE here, so callers must skip untracked options BEFORE calling.
create or replace function decrement_modifier_option_stock(p_id uuid, p_qty int)
returns boolean
language sql
as $$
  with upd as (
    update modifier_options
       set stock_count = stock_count - p_qty
     where id = p_id
       and stock_count is not null
       and stock_count >= p_qty
    returning id
  )
  select exists (select 1 from upd);
$$;

-- Re-credit on un-placement (cancel / reject / failed order). Only credits a TRACKED option
-- (stock_count not null) — crediting an untracked option is a no-op. No upper clamp (a plain add;
-- if the operator manually lowered the count meanwhile, a reversal may exceed it — accepted edge).
create or replace function increment_modifier_option_stock(p_id uuid, p_qty int)
returns void
language sql
as $$
  update modifier_options
     set stock_count = stock_count + p_qty
   where id = p_id
     and stock_count is not null;
$$;

-- ═══ 🔴 NOT CALLABLE WITH THE PUBLIC KEY (added 19 October 2026, docs/us-polish-batch-report.md) ══════════════════════
-- A new function in `public` gets EXECUTE for anon and authenticated by DEFAULT (pg_default_acl), so without this the
-- public (anon) key could call it over /rest/v1/rpc. Every caller is server code on the service role. On 12 October
-- these grants were revoked live, then reopened by a hand-run GRANT; scripts/migration-function-grants.cjs now fails
-- the sweep on any migration that creates a function without revoking it in the same file, or grants one back.
-- Idempotent (revoke/grant of a privilege already in that state is a no-op).
-- (increment_modifier_option_stock is dropped again by 20260715; the revoke here covers the window between.)
revoke execute on function public.decrement_modifier_option_stock(uuid, integer) from public, anon, authenticated;
grant  execute on function public.decrement_modifier_option_stock(uuid, integer) to service_role;
revoke execute on function public.increment_modifier_option_stock(uuid, integer) from public, anon, authenticated;
grant  execute on function public.increment_modifier_option_stock(uuid, integer) to service_role;
