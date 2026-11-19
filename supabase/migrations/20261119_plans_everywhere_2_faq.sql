-- 20261119_plans_everywhere_2_faq.sql — plans-everywhere-2 (Dominic, 19 November 2026, docs/plans-everywhere-2-report.md):
-- FAQ ANSWERS BY HOW CUSTOMERS PAY. Two new show_in values, the four card-payment answers limited to card countries, and their
-- pay-at-the-truck versions.
--
-- ⛔ RUN ONLY AFTER THE CODE THAT KNOWS THE TWO VALUES IS DEPLOYED (lib/faq/live-values.ts shownIn / isShowIn, plans-everywhere-2).
--    The deployed code before it shows a question only for 'all' / 'apps' / 'plan:…', so running this first would hide the four
--    answers on EVERY country's FAQ page (GB included) until the deploy. Run with:
--      npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261119_plans_everywhere_2_faq.sql
--    The hourly FAQ translator (.github/workflows/faq-translate.yml) then translates the four new questions into every language base;
--    a non-English page shows a question only once its translation is in, so until then those pages simply don't list them.
--
-- WHAT IT DOES (one transaction):
--   1. faq_items_show_in_chk also accepts 'card_payments' (trucks there take online card payments: country_billing.payment_model
--      fee_from_payment or billed_online) and 'pay_at_truck' (its opposite: billed_at_truck). Which countries match is decided in code
--      from the data (lib/country-settings-types.ts offersOnlineCardPayments), never stored.
--   2. The four answers that describe online card payments — …0002, …0006, …0007, …0011 — move from 'all' to 'card_payments'. Their
--      wording, translations and source hashes are untouched (show_in is not part of a translation's hash).
--   3. Four new published questions, 'pay_at_truck', in the same section and position as their card twin (only one of a pair ever
--      shows in a country): …1002, …1006, …1007, …1011.
--   No other FAQ row is changed.
--
-- VERIFY (read-only, after running):
--   select id, show_in, status, position, question_en from faq_items
--    where id in ('fa000002-0000-4000-8000-000000000002','fa000002-0000-4000-8000-000000000006','fa000002-0000-4000-8000-000000000007',
--                 'fa000002-0000-4000-8000-000000000011','fa000002-0000-4000-8000-000000001002','fa000002-0000-4000-8000-000000001006',
--                 'fa000002-0000-4000-8000-000000001007','fa000002-0000-4000-8000-000000001011') order by position, id;
--   → the four …000x 'card_payments', the four …100x 'pay_at_truck', all published.
--
-- UNDO (only if Dominic asks) — in this order:
--   begin;
--   delete from public.faq_translations where item_id in ('fa000002-0000-4000-8000-000000001002','fa000002-0000-4000-8000-000000001006',
--     'fa000002-0000-4000-8000-000000001007','fa000002-0000-4000-8000-000000001011');
--   delete from public.faq_items where id in ('fa000002-0000-4000-8000-000000001002','fa000002-0000-4000-8000-000000001006',
--     'fa000002-0000-4000-8000-000000001007','fa000002-0000-4000-8000-000000001011');
--   update public.faq_items set show_in = 'all', updated_at = now(), updated_by = 'plans-everywhere-2 undo'
--    where id in ('fa000002-0000-4000-8000-000000000002','fa000002-0000-4000-8000-000000000006','fa000002-0000-4000-8000-000000000007',
--                 'fa000002-0000-4000-8000-000000000011') and show_in = 'card_payments';
--   alter table public.faq_items drop constraint faq_items_show_in_chk;
--   alter table public.faq_items add constraint faq_items_show_in_chk check (show_in = 'all' or show_in = 'apps' or show_in ~ '^plan:[a-z][a-z0-9_]*$');
--   commit;

set lock_timeout = '3s';
begin;

-- ── 1 · the two new show_in values ──────────────────────────────────────────────────────────────────────────────────────
alter table public.faq_items drop constraint if exists faq_items_show_in_chk;
alter table public.faq_items add constraint faq_items_show_in_chk
  check (show_in = 'all' or show_in = 'apps' or show_in = 'card_payments' or show_in = 'pay_at_truck' or show_in ~ '^plan:[a-z][a-z0-9_]*$');

-- ── 2 · the four card-payment answers: card countries only ────────────────────────────────────────────────────────────
do $$
declare n integer;
begin
  update public.faq_items set show_in = 'card_payments', updated_at = now(), updated_by = 'plans-everywhere-2'
   where id in ('fa000002-0000-4000-8000-000000000002', 'fa000002-0000-4000-8000-000000000006',
                'fa000002-0000-4000-8000-000000000007', 'fa000002-0000-4000-8000-000000000011')
     and show_in = 'all' and status = 'published';
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'plans-everywhere-2: expected 4 published card answers on show_in all, changed %', n; end if;
end $$;

-- ── 3 · their pay-at-the-truck versions ─────────────────────────────────────────────────────────────────────────────────
insert into public.faq_items (id, section_id, position, question_en, answer_en, answer_single_plan_en, show_in, status, published_at, note, updated_by)
select v.id::uuid, t.section_id, t.position, v.question_en, v.answer_en, null, 'pay_at_truck', 'published', now(), v.note, 'plans-everywhere-2'
  from (values
    ('fa000002-0000-4000-8000-000000001002', 'fa000002-0000-4000-8000-000000000002', 'What do I pay on each order?',
     'Walk-up orders are free. On pre-orders you pay only your plan’s fee, charged to your card once a month. Customers pay you at the truck, so there’s no card processing fee.',
     'Pay-at-the-truck version of …0002 (plans-everywhere-2).'),
    ('fa000002-0000-4000-8000-000000001006', 'fa000002-0000-4000-8000-000000000006', 'How long does it take to set up?',
     'Upload a photo of your menu and see it working in under 60 seconds. When you’re ready, sign up to start your {trial.months}-month free trial, check your menu, and add where and when you’re trading. We then switch your ordering page on.',
     'Pay-at-the-truck version of …0006 (plans-everywhere-2): the Stripe step removed.'),
    ('fa000002-0000-4000-8000-000000001007', 'fa000002-0000-4000-8000-000000000007', 'Do I need an iPad, card reader or special equipment?',
     'No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: for walk-up orders you take payment the way you do today. {apps.sentence}',
     'Pay-at-the-truck version of …0007 (plans-everywhere-2): the online-card clause removed.'),
    ('fa000002-0000-4000-8000-000000001011', 'fa000002-0000-4000-8000-000000000011', 'How do I get paid?',
     'Customers pay you at the truck when they collect, so the money is yours straight away.',
     'Pay-at-the-truck version of …0011 (plans-everywhere-2).')
  ) as v(id, twin, question_en, answer_en, note)
  join public.faq_items t on t.id = v.twin::uuid;

do $$
begin
  if (select count(*) from public.faq_items where show_in = 'pay_at_truck') <> 4 then
    raise exception 'plans-everywhere-2: expected exactly 4 pay_at_truck questions';
  end if;
end $$;

commit;
