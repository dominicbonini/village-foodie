-- Website-embed Stage 2: the two columns the setup wizard's live verification reads.
--
-- 🔴 NOT RUN. Deploys are frozen and this file is written, not applied. Pizzeria Gusto is a live
-- trading truck on this database; nothing here is executed by anyone but Dominic, by hand.
--
-- CLASSIFICATION: ADDITIVE, both nullable, no default. Applying this alone changes nothing: every
-- existing row gets NULL, which the wizard reads as "no load has been seen yet" — the correct
-- starting state for a truck that has never had an embed.
--
-- ── EXACTLY TWO COLUMNS, AND THE ONES THAT WERE NOT ADDED MATTER ────────────────────────────────
-- No counter, no history table, no "embed_views". Monitoring is a later stage and its schema is not
-- designed yet; a counter added now would be a schema decision taken by the wrong workstream, and
-- the throttle below means it could not have counted accurately anyway.
--
-- ── WHY `embed_last_seen_at` IS ALSO THE THROTTLE, NOT JUST A RECORD ────────────────────────────
-- 🔴 THE STAMP IS A WRITE ON A PUBLIC, UNAUTHENTICATED ROUTE. Every visitor to every operator's
-- website reaches it. The write is therefore guarded by a CONDITIONAL UPDATE against this same
-- column — `where embed_last_seen_at is null or embed_last_seen_at < now() - 5 minutes` — so the
-- column is both the thing being recorded and the lock that stops it being recorded too often.
-- That is deliberate: it needs no second mechanism, no Redis key, and no cache that could disagree
-- with the database. Postgres row-locking makes it correct under concurrency — see
-- app/embed/[slug]/page.tsx and docs/website-embed-wizard-report.md.
ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS embed_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS embed_last_referer text;

COMMENT ON COLUMN trucks.embed_last_seen_at IS
  'When the public /embed/<slug> page was last loaded. Written at most once per 5 minutes per truck by a conditional UPDATE that uses this column as its own throttle. Not a counter.';
COMMENT ON COLUMN trucks.embed_last_referer IS
  'Origin of the page that framed the last recorded load, from the Referer header (origin only under the default referrer policy). NULL when the framing site sends no referrer.';
