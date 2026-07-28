-- 20260728_demo_sessions_extraction_source.sql
-- Brings the migration set into line with production: demo_sessions.extraction_source.
--
-- ⚠️ CLASSIFICATION: **RECONCILIATION — a NO-OP against production.** The column ALREADY EXISTS in the
-- live database (confirmed 2026-07-28: present, populated, both 'template' and 'upload' in use, and
-- `extraction` non-null on every row). It was applied by hand and never committed as a migration. This
-- file exists so a FRESH environment built from supabase/migrations matches prod, not to change prod.
-- Running it against prod is deliberately harmless — `if not exists` makes it a no-op there.
--
-- ── HOW IT WENT MISSING, AND WHY THAT MATTERS ──────────────────────────────────────────────────────
-- 20260723_demo_sessions_phase4.sql added `extraction`, `claimed_by_operator_id` and `retired_at`. The
-- writer at lib/provision-demo.ts:314 sets `extraction` and `extraction_source` in ONE update, so the
-- column arrived in code alongside three that did get a migration, and the discrepancy was invisible
-- from the app: that write is best-effort and swallows its error with a console.warn (":315 — could not
-- persist extraction … (migration applied?)"). A missing column would therefore have looked exactly
-- like a working system, right up until signup fell back to a blank upload.
--
-- This is the same family the phase4 header already records as its own reason for existing: a belief
-- about the database is not a fact about the database. There it was "not applied" when it HAD been;
-- here it is "in the migration set" when it never was. Both directions cost the same.
--
-- ── WHY A SEPARATE FILE, NOT AN EDIT TO 20260723_demo_sessions_phase4.sql ──────────────────────────
-- That file has already run. Its statements are `add column if not exists`, so appending to it would
-- run clean and add NOTHING on any environment that already applied it — the exact trap its own header
-- warns about, one level down. A new file is the only shape that actually lands.

-- ── extraction_source ──────────────────────────────────────────────────────────────────────────────
-- text, NULLABLE — matching the live schema exactly. Nullable is correct rather than incidental:
-- createDemoSession opens the row at provision time, and persistExtraction fills this in only AFTER the
-- menu resolves, so there is a real window in which the row exists with no source. A failed extraction
-- (menu.kind === 'failed') never reaches persistExtraction at all, so that row keeps a NULL for its
-- whole life. NOT NULL would reject both.
--
-- No CHECK constraint, deliberately — unlike device_notification_prefs.type, which got one. The two
-- values in use ('upload' | 'template') are already enforced at the only call site by the TypeScript
-- parameter type (lib/provision-demo.ts:303, `source: 'upload' | 'template'`), and a constraint added
-- now would have to be validated against live rows written before it existed. If a third source is ever
-- added, revisit — but add the value first and the constraint second, not the other way round.
alter table demo_sessions add column if not exists extraction_source text;

comment on column demo_sessions.extraction_source is
  'How the stored `extraction` was produced: ''upload'' = the visitor''s OWN menu, ''template'' = a sample they picked. Signup (/api/setup GET) re-commits an ''upload'' payload onto the real truck and IGNORES a ''template'' one, so a sample menu can never land on an operator truck. The dashboard also reads it to decide whether the welcome popup names the demo a sample. NULL until the menu resolves, and permanently NULL for a demo whose extraction failed.';

notify pgrst, 'reload schema';

-- ── VERIFY (run after) ────────────────────────────────────────────────────────────────
-- Expect the column present, type text, is_nullable YES — and, on prod, row counts UNCHANGED by this file.
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_name = 'demo_sessions' and column_name = 'extraction_source';
--
--   select extraction_source, count(*) from demo_sessions group by extraction_source;
