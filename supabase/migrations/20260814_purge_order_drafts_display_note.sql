-- 20260814_purge_order_drafts_display_note.sql
-- 🔴 A COMMENT-ONLY MIGRATION. THE PREDICATE IS UNCHANGED, CHARACTER FOR CHARACTER.
--
-- ✅ ADDITIVE AND BEHAVIOURALLY INERT. It replaces `purge_order_drafts()` with a body that is identical
-- to the one 20260813_order_drafts_authorization.sql installed, and rewrites its COMMENT. Nothing it
-- deletes changes. Nothing that calls it changes. Applying it early or late is harmless, and skipping it
-- costs no behaviour — it costs the WARNING, which is the entire point of the file.
--
-- ── 🔴 WHY IT EXISTS: A PROMOTED DRAFT IS NOW LOAD-BEARING FOR DISPLAY ─────────────────────────────
-- Between authorisation and capture an order is genuinely `payment_status: 'unpaid'` — no money has
-- moved and no ledger row exists. Four surfaces used to read that as "collect at the hatch": the order
-- card offered `Mark paid`, the KDS said `£X due`, the ticket printed `TO PAY £X`, and the customer's
-- email said "Pay at the truck on collection". All four agreed and all four were wrong, which is a
-- double-payment path.
--
-- Those surfaces now say "CARD HELD" instead, and the fact they read is:
--     order_drafts.payment_intent_id  WHERE order_key = <the ORDER'S own key>
--       AND promoted_at IS NOT NULL AND authorization_cancelled_at IS NULL
--       AND no `stripe_pi:<id>` row in order_payments
-- (lib/payments/held-authorisation.ts — the single source of truth every surface reads.)
--
-- 🔴 SO DELETING A PROMOTED DRAFT WOULD SILENTLY RETURN EVERY HELD ORDER TO SAYING "COLLECT AT THE
-- HATCH", AND AN OPERATOR WOULD TAKE THE MONEY A SECOND TIME. This function has never swept promoted
-- rows — `promoted_at is null` has always been in the predicate — but that was an accident of what the
-- purge was for, not a promise. It is a promise now.
--
-- ⚠️ IF YOU EVER NEED TO SWEEP PROMOTED DRAFTS, MOVE THE FACT FIRST. An `orders` column, or a ledger row
-- of a new kind — something that survives the row's deletion. Do not delete the answer and then go
-- looking for it. Erasure is unaffected either way: a promoted draft already carries NO customer name,
-- email or phone (claimOrderDraft's erasePii nulls all three the moment the order is created), so
-- retaining these rows retains no personal data.
--
-- VERIFY AFTER APPLYING:
--   select pg_get_functiondef(oid) from pg_proc where proname = 'purge_order_drafts';
--   -- expect the same three-condition delete as before
--   select obj_description('purge_order_drafts()'::regprocedure);
--   -- expect the new comment, naming the display dependency

create or replace function purge_order_drafts() returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- 🔴 `promoted_at is null` IS NOW LOAD-BEARING FOR DISPLAY, NOT ONLY FOR ERASURE. A PROMOTED draft is
  -- the only record that its order has money held against it, and four customer- and operator-facing
  -- surfaces read it. Widening this delete to promoted rows would make every held order read
  -- "collect at the hatch" again. See the header, and lib/payments/held-authorisation.ts.
  delete from order_drafts
   where promoted_at is null
     and expires_at < now()
     -- Never delete a row that may still be holding a customer's money (20260813).
     and (payment_intent_id is null or authorization_cancelled_at is not null);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function purge_order_drafts() is
  'GDPR erasure for ABANDONED order drafts: hard-deletes expired, never-promoted rows whose '
  'authorisation is either absent or already cancelled. '
  'DO NOT WIDEN THIS TO PROMOTED ROWS. A promoted draft is the only record that its order has a held, '
  'uncaptured card authorisation, and the order card, KDS, printed ticket and confirmation email all '
  'read it (lib/payments/held-authorisation.ts). Deleting one would make a held order read as owing '
  'money at the hatch and an operator would collect it twice. Promoted rows carry no PII — erasePii '
  'nulls name, email and phone at promotion — so retaining them retains no personal data.';

notify pgrst, 'reload schema';
