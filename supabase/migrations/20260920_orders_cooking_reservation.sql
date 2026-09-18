-- Batch reservations, phase P0 (18 September 2026): the per-order cooking reservation.
-- One nullable jsonb column on orders. NO default: null means "no reservation" and every reader falls
-- back to today's backward split of the slot total, which is the pre-P0 behaviour to the byte.
-- Shape (v1): { v:1, source:'fit'|'override', slot:'HH:MM',
--               computed:{ eventStartMins, capacityWindowMins, kitchenCapacity, gridIntervalMins },
--               cats:{ <cat>:{ items, batch, prepMins, windows:[{ startMins, endMins, items }] } } }
-- Additive and safe to apply at any time: every existing read of orders uses select('*') or a named
-- select that does not name this column (audited in docs/batch-reservation-p0-p2-report.md), and the
-- one read that DOES name it is a separate capability-probed query that degrades to [] on PGRST204/42703.
alter table public.orders add column if not exists cooking_reservation jsonb;
notify pgrst, 'reload schema';
