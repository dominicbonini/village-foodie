-- 20260903_whatsapp_confirmed_nullable.sql
-- ⛔ PROPOSED — NOT APPLIED. Needs your approval. DO NOT RUN until then.
--
-- ── WHY THIS IS NEEDED (a contradiction surfaced in Part B step 4) ──────────────────────────────────
-- Step 4 requires the WhatsApp tickbox to be tri-state like hu_map/hu_ordering: tick → true, UNTICK → NULL,
-- and "show NULL and false apart at a glance". But outreach_prospects.whatsapp_confirmed was created
-- `boolean NOT NULL default false` (20260903_outreach_tracking.sql), so:
--   1. writing NULL on untick is rejected by the NOT NULL constraint; and
--   2. every one of the 176 rows is currently `false` — but that false is the column DEFAULT, meaning
--      "nobody has confirmed", which the tri-state model represents as NULL, not false.
-- So honouring step 4 with the SAME column (the manual's one-fact-one-column rule — no third WhatsApp
-- field) requires making the column nullable AND normalising the untouched defaults to NULL.
--
-- ── WHY THE false → NULL NORMALISE IS SAFE (verified, not assumed) ─────────────────────────────────
-- Read live 2026-09-03: whatsapp_confirmed is `true` on 0 rows, `false` on 176, and whatsapp_number is set
-- on 0 rows. So every `false` is a pure default with no confirmation behind it — setting them to NULL loses
-- no real "I confirmed" signal. The guard `where whatsapp_confirmed = false` would still spare any genuine
-- `true` if one existed.
--
-- ── HOW TO APPLY (when approved) — by hand in the Supabase SQL editor, like every migration here. ────

set lock_timeout = '3s';

begin;

alter table public.outreach_prospects alter column whatsapp_confirmed drop not null;
alter table public.outreach_prospects alter column whatsapp_confirmed drop default;

comment on column public.outreach_prospects.whatsapp_confirmed is
  'MY confirmation the number works on WhatsApp. Tri-state: true = I confirmed; NULL = not confirmed / nobody checked; false only if ever explicitly set. Distinct from the scraped accepted_methods hint, which is not mine to edit.';

-- Normalise the untouched defaults: false-meaning-"nobody-checked" → NULL. Safe per the count above.
update public.outreach_prospects set whatsapp_confirmed = null where whatsapp_confirmed = false;

commit;

notify pgrst, 'reload schema';
