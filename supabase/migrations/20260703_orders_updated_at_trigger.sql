-- FIX 1 (order-lifecycle integrity) — miss-proof updated_at bump on every orders UPDATE.
--
-- WHY: the client merge (lib/orders/mergeOrders.ts) is version-guarded — an OLDER-timestamped
-- read can never overwrite a NEWER local status. That guarantee needs `orders.updated_at` to bump
-- on EVERY status write. The action route's .update({ status }) calls do NOT set updated_at, and no
-- trigger existed — so updated_at was frozen at created_at and could not serve as a row version.
--
-- A BEFORE UPDATE trigger is the MISS-PROOF approach: it covers all ~11 existing status-write sites
-- (app/api/dashboard/action/route.ts:121/172/205/242/271/280/291/311/359/1042 + orders/cancel/route.ts:82)
-- AND any future write, so no transition can be left unprotected by a forgotten .update() call.
--
-- DEPLOY-COUPLED with the client merge: the merge is SAFE without this (it falls back to today's
-- read-wins behaviour when updated_at is missing/equal), but the ONLINE forward-only guarantee only
-- holds once updated_at bumps monotonically. Apply this on ffphgwonshgxamtvefcv WITH the merge ship.
--
-- Fires on ANY orders UPDATE (status, modify, payment) — correct: updated_at becomes a true row
-- version, so a read reflecting ANY change is "newer". INSERTs are unaffected (updated_at keeps its
-- column DEFAULT now(), incl. the place_order_atomic RPC insert). Idempotent-safe to re-run.

create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;

create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_orders_updated_at();

-- ═══ 🔴 NOT CALLABLE WITH THE PUBLIC KEY (added 19 October 2026, docs/us-polish-batch-report.md) ══════════════════════
-- A new function in `public` gets EXECUTE for anon and authenticated by DEFAULT (pg_default_acl), so without this the
-- public (anon) key could call it over /rest/v1/rpc. Every caller is server code on the service role. On 12 October
-- these grants were revoked live, then reopened by a hand-run GRANT; scripts/migration-function-grants.cjs now fails
-- the sweep on any migration that creates a function without revoking it in the same file, or grants one back.
-- Idempotent (revoke/grant of a privilege already in that state is a no-op).
-- A TRIGGER function: the trigger fires without EXECUTE, so no role is granted it.
revoke execute on function public.set_orders_updated_at() from public, anon, authenticated;
