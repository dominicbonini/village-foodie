-- supabase/migrations/20261080_compare_autopublish_1_contact_topic.sql — compare-autopublish-1 §5 (7 November 2026, docs/compare-autopublish-1-report.md).
-- THE CONTACT FORM'S "COMPARISON CORRECTION" TOPIC: contact_messages.topic may now also be 'comparison' (lib/contact.ts CONTACT_TOPICS). Every
-- comparison page's "Report an error" link opens the form with it chosen. Schema only: no row changes.

begin;

alter table public.contact_messages drop constraint if exists contact_messages_topic_check;
alter table public.contact_messages add constraint contact_messages_topic_check check (topic in ('question', 'account', 'comparison', 'other'));

commit;
