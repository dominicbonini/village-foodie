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
