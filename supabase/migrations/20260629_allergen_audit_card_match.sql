-- ════════════════════════════════════════════════════════════════════════════════════
-- Allergen audit: add 'card_match' to the change_type CHECK enum (apply by hand).
-- The import allergen-card→dish matcher logs each card-sourced allergen ADDITION as change_type
-- 'card_match' (verified=false, staged for the operator's row-by-row confirm). The existing CHECK only
-- allowed ('confirm','edit','card_save','import'), so an INSERT with 'card_match' would 23514-reject.
-- Purely ADDITIVE — widens the allowed set; no data change; existing rows unaffected. Idempotent.
-- Mirrors lib/allergen-audit.ts AuditChangeType.
-- ════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE allergen_audit_log DROP CONSTRAINT IF EXISTS allergen_audit_log_change_type_check;
ALTER TABLE allergen_audit_log
  ADD CONSTRAINT allergen_audit_log_change_type_check
  CHECK (change_type IN ('confirm','edit','card_save','import','card_match'));

-- ── VERIFY (run after) — expect the new value accepted ────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'allergen_audit_log_change_type_check';
