-- 20260915_outreach_template_tags.sql
-- ⛔ PROPOSED — NOT APPLIED. Apply by hand in the Supabase SQL editor, as every migration here is.
--
-- 🔴 THIS HEADER IS LOAD-BEARING AND MUST BE CORRECTED THE DAY IT IS APPLIED, IN BOTH DIRECTIONS.
-- A stale "NOT APPLIED" on a live file is a recorded trap here (20260909_outreach_templates.sql still
-- says NOT APPLIED and the reference manual records it as applied on 9 September). The reverse is
-- worse: 20260914_outreach_lead_type_freeze.sql was reported as unapplied in a review when the column
-- in fact EXISTS — see docs/outreach-config-build-report.md §Phase 0. As at writing, this file has
-- never been executed against any database.
--
-- ⚠️ AND RUN THE LAST LINE. The freeze column exists in Postgres yet the app still reports it absent,
-- and the leading explanation is a PostgREST schema cache that was never told to reload. `alter table`
-- alone is not enough for this app to see a column.
--
-- ── WHAT AND WHY ────────────────────────────────────────────────────────────────────────────────────
-- Two nullable columns on outreach_templates:
--   serves_kind       text — which rung of the ladder this template is for, or NULL = any
--   serves_lead_type  text — which lead type it is written for,          or NULL = any
--
-- 🔴 THE DEFECT THIS ADDRESSES. A chaser was sent to Pizza Mondo and logged as FIRST CONTACT, because
-- the logged `kind` comes from the log form's dropdown and the CHOSEN TEMPLATE has never had any say.
-- Pick a chaser, leave the dropdown where it was, and the history records an approach that never
-- happened — which then drives the derived next step, the follow-up date, and the whole queue.
-- With `serves_kind` set, choosing that template sets the rung too.
--
-- 🔴 NULLABLE MEANS "ANY", AND EVERY ROW SHIPS NULL. Nothing here sets a value on any template — that
-- is the operator's sign-off, not a migration's. Until he tags a row, behaviour is EXACTLY as it is
-- today: the dropdown governs, and `STEP_TEMPLATE` picks the pre-selection. No row changes meaning
-- because this file ran.
--
-- ── THE VALUES, AND WHAT CONSTRAINS THEM ────────────────────────────────────────────────────────────
--   serves_kind      ∈ '1_first_contact' | '2_chase_1' | '3_chase_2' | '4_final_chase'   (CONTACT_KINDS)
--   serves_lead_type ∈ 'hu_ordering' | 'hu_map' | 'on_vf' | 'not_listed'                 (LEAD_TYPES)
--
-- 🔴 NO CHECK CONSTRAINT — the house rule, stated in 20260903_outreach_tracking.sql: PostgREST exposes
-- no CHECK metadata, so the app cannot read a constraint back to build a dropdown from it, and a
-- constraint there is a rule with no reader that drifts the moment someone edits one side. Validation
-- lives in application code: the TS unions `LadderKind` and `LeadType`, the `isKind` / `isLeadType`
-- validators the API route calls before every write, and two <select>s built by mapping the constant
-- arrays — so no other value can be chosen in the UI.
-- ⚠️ The cost of that rule is named rather than hidden: `outreach_contacts.kind` is also unconstrained
-- text and that is how it split into `first_contact` / `1_first_contact`. The difference here is that
-- these columns start empty and have exactly one validated writer.

set lock_timeout = '3s';

begin;

alter table public.outreach_templates
  add column if not exists serves_kind      text,
  add column if not exists serves_lead_type text;

comment on column public.outreach_templates.serves_kind is
  'Which rung of the contact ladder this template is written for: 1_first_contact | 2_chase_1 | '
  '3_chase_2 | 4_final_chase. NULL = any rung. When set, choosing this template in the compose window '
  'also sets the logged contact kind. Unconstrained text by the no-CHECK rule — validated by isKind.';

comment on column public.outreach_templates.serves_lead_type is
  'Which lead type this template is written for: hu_ordering | hu_map | on_vf | not_listed. '
  'NULL = any. Used to prefer a template when pre-selecting for a due prospect. Unconstrained text by '
  'the no-CHECK rule — validated by isLeadType.';

commit;

-- 🔴 RUN THIS LINE. Without it PostgREST keeps serving its cached schema and the app cannot see the
-- new columns, exactly as appears to have happened with lead_type_at_first_contact.
notify pgrst, 'reload schema';
