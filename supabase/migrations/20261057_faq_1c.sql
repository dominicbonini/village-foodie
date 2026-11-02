-- 20261057_faq_1c.sql — faq-1c (2 November 2026, docs/faq-1c-report.md): Pay at Hatch becomes the free trial's only, Pizzeria
-- Gusto keeps it by a truck override, the comparison row says so, and the FAQ rows Dominic asked for.
-- Run by Claude with scripts/db-migrate.cjs --approved-by-dominic (the protected-table writes below are his explicit decision and
-- approval in the faq-1c brief, 2 November 2026). ONE transaction: every step checks it touched exactly the rows it expected, and
-- any surprise raises, so nothing is half-applied.
--
-- 1. plans.pay_at_hatch_allowed = false on payg, pro and unlimited (trial stays true; demo and tester untouched). A data change
--    only: Dominic may turn it back on for Unlimited later. Walk-up orders are not affected (they never pass this switch).
-- 2. Pizzeria Gusto: feature_overrides.online_ordering_pay_at_hatch = true — "Dominic, 2 Nov 2026: keeps Pay at Hatch on until he
--    decides otherwise". (trucks has no note column for overrides — plan_price_override_note is the promo price's — so the note
--    lives here and in the report.) The override beats the plan's switch (lib/features.ts featureBlock: override first). No other
--    column of the row is touched.
-- 3. comparison_features 'payattruck': HatchGrab's answer from 'plan:online_ordering_pay_at_hatch' (now "no" on every public
--    plan) to 'fixed:partial:note' — the note is comparison.features.payattruck.ours, "During the free trial".
-- 4. The FAQ (faq_items, English only): …0002, …0003, …0006, …0007, …0010 and …0015 reworded as Dominic wrote them, each only if
--    its text is still exactly what was read live before this file was written (2 Nov 2026); status kept. note_done = true on
--    every "CHECK (Cursor): " note and on …0002, …0007, …0010, …0015; no note's text changes.

begin;

do $$
declare n integer;
begin
  -- 1 · Pay at Hatch: the free trial only
  update public.plans set pay_at_hatch_allowed = false
   where key in ('payg', 'pro', 'unlimited') and pay_at_hatch_allowed = true;
  get diagnostics n = row_count;
  if n <> 3 then raise exception 'faq-1c: expected to switch Pay at Hatch off on 3 plans, did %', n; end if;
  if (select pay_at_hatch_allowed from public.plans where key = 'trial') is distinct from true then
    raise exception 'faq-1c: the trial plan must keep Pay at Hatch';
  end if;

  -- 2 · Pizzeria Gusto keeps Pay at Hatch (Dominic, 2 Nov 2026: keeps Pay at Hatch on until he decides otherwise)
  update public.trucks
     set feature_overrides = coalesce(feature_overrides, '{}'::jsonb) || jsonb_build_object('online_ordering_pay_at_hatch', true)
   where slug = 'pizzeria-gusto';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'faq-1c: expected one pizzeria-gusto row, found %', n; end if;

  -- 3 · the comparison row: partial, during the free trial
  update public.comparison_features set hatchgrab_source = 'fixed:partial:note'
   where key = 'payattruck' and hatchgrab_source = 'plan:online_ordering_pay_at_hatch';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'faq-1c: expected the payattruck comparison row on its plan source, found %', n; end if;

  -- 4 · the FAQ rows (each guarded by its text as read live)
  update public.faq_items set
    question_en = $q$What do I pay on each order?$q$,
    answer_en = $a$Nothing on walk-up orders, and nothing at all on {unlimited.name}. On online card orders, {payg.name} charges {payg.fee}, and {pro.name} charges {pro.fee} once you pass {pro.included} in a month. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.$a$,
    answer_single_plan_en = $s$Nothing. {unlimited.name} has no HatchGrab fee on any order. Online card payments carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.$s$,
    updated_at = now(), updated_by = 'faq-1c'
   where id = 'fa000002-0000-4000-8000-000000000002'
     and question_en = $q$Do you take a cut of every order?$q$
     and answer_en = $a$Never on walk-up orders. On online card orders it depends on your plan: {payg.name} charges {payg.fee}, {pro.name} charges {pro.fee} once you pass {pro.included} in a month, and {unlimited.name} charges nothing. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.$a$;
  get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c: …0002 is not as read live'; end if;

  update public.faq_items set
    answer_en = answer_en || $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$,
    answer_single_plan_en = answer_single_plan_en || $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$,
    updated_at = now(), updated_by = 'faq-1c'
   where id = 'fa000002-0000-4000-8000-000000000003'
     and answer_en = $a$Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When the trial ends you move to {trialEnd.name} ({trialEnd.price} a month). If you’d like a different plan, email us and we’ll switch you.$a$
     and answer_single_plan_en = $s$Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When your trial ends, {trialEnd.name} is {trialEnd.price} a month. We’ll be in touch before then to set up payment.$s$;
  get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c: …0003 is not as read live'; end if;

  update public.faq_items set
    answer_en = replace(answer_en, 'and connect Stripe if you want online card payments', 'and connect Stripe so customers can pay online'),
    updated_at = now(), updated_by = 'faq-1c'
   where id = 'fa000002-0000-4000-8000-000000000006'
     and answer_en = $a$Upload a photo of your menu and see it working in under 60 seconds. When you’re ready, sign up to start your {trial.months}-month free trial, check your menu, add where and when you’re trading, and connect Stripe if you want online card payments. We then switch your ordering page on.$a$;
  get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c: …0006 is not as read live'; end if;

  update public.faq_items set
    answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: pre-orders are paid online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$,
    updated_at = now(), updated_by = 'faq-1c'
   where id = 'fa000002-0000-4000-8000-000000000007'
     and answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop, so you can use the devices you already have. You don’t need a card reader either: customers can pay at the truck or by card online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$;
  get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c: …0007 is not as read live'; end if;

  update public.faq_items set
    answer_en = $a$During your free trial, yes: with {payAtTruck}, customers order ahead and pay when they collect, so you can try ordering before connecting card payments. After your trial, pre-orders are paid online by card into your own Stripe account. Walk-up orders are paid at the window as usual.$a$,
    updated_at = now(), updated_by = 'faq-1c'
   where id = 'fa000002-0000-4000-8000-000000000010'
     and question_en = $q$Can customers pay at the truck instead of online?$q$
     and answer_en = $a$Yes. With {payAtTruck}, customers order ahead and pay when they collect, so you can take orders without connecting a card processor. You can add online card payments at any time, on {plansWith.online_payments}.$a$;
  get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c: …0010 is not as read live'; end if;

  update public.faq_items set
    answer_en = $a$Customers choose their collection time when they order, so they know when to come. They also get an email confirming their order. If you switch on the order-ready step, they’re emailed again when you mark the order ready. You can also use your own buzzers, and HatchGrab records each order’s buzzer number, or call out the name on the ticket.$a$,
    updated_at = now(), updated_by = 'faq-1c'
   where id = 'fa000002-0000-4000-8000-000000000015'
     and answer_en = $a$Customers get an email confirming their order. If you switch on the order-ready step, they’re emailed again when you mark the order ready. You can also use your own buzzers, and HatchGrab records each order’s buzzer number, or call out the name on the ticket.$a$;
  get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c: …0015 is not as read live'; end if;

  -- notes: accepted (Dominic) — note_done only, never the note's text, and never updated_at (a note is not an edit of the answer)
  update public.faq_items set note_done = true
   where note like 'CHECK (Cursor): %'
      or id in ('fa000002-0000-4000-8000-000000000002', 'fa000002-0000-4000-8000-000000000007',
                'fa000002-0000-4000-8000-000000000010', 'fa000002-0000-4000-8000-000000000015');
end $$;

commit;
