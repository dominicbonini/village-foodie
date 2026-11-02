-- 20261058_faq_1c_undo.sql — faq-1c-undo (2 November 2026, docs/faq-1c-undo-report.md): PUT BACK EVERYTHING faq-1c CHANGED
-- OUTSIDE THE FAQ, and keep the FAQ rows Dominic asked for.
--
-- WHY: faq-1c's brief was wrong (Dominic). Pay at Hatch stays exactly as it worked before, on every plan. faq-1c's migration,
-- 20261057_faq_1c.sql, RAN live on 2 November 2026 (Claude, scripts/db-migrate.cjs). It is removed from the repo at Dominic's
-- request; its text stays in git history (commit 142ea9ab). This file reverses its non-FAQ effects and carries its FAQ edits, so the
-- repo describes the database without 20261057.
-- Run by Claude with scripts/db-migrate.cjs --approved-by-dominic (the protected-table writes below are his explicit approval in the
-- faq-1c-undo brief). Safe to run twice, and on a database where 20261057 never ran: each step changes only what 20261057 wrote,
-- then asserts the end state, and raises on anything it doesn't recognise.
--
-- 1. plans.pay_at_hatch_allowed back to true on payg, pro and unlimited (the three 20261057 switched off).
-- 2. Pizzeria Gusto: the Pay at Hatch override 20261057 added is removed. Overrides are a key in trucks.feature_overrides (jsonb),
--    with no row, created_at or note of their own, so it is matched by the exact value 20261057 wrote: Gusto's overrides were {}
--    before it (read live on 2 Nov 2026) and {"online_ordering_pay_at_hatch": true} after. Only that key goes; any other override
--    stays; no other column is touched.
-- 3. comparison_features 'payattruck' back to its plan source ('plan:online_ordering_pay_at_hatch').
-- 4. The FAQ (kept, Dominic): …0002, …0003, …0006, …0007, …0010 and …0015 at faq-1c's wording, from the seed's text where a row still
--    holds it (a no-op live, where 20261057 applied them); note_done on every "CHECK (Cursor): " note and on …0002, …0007, …0010,
--    …0015. Status is never written; no note's text is written.

begin;

do $$
declare n integer;
begin
  -- 1 · Pay at Hatch on every plan, as before faq-1c
  update public.plans set pay_at_hatch_allowed = true
   where key in ('payg', 'pro', 'unlimited') and pay_at_hatch_allowed = false;
  if exists (select 1 from public.plans where pay_at_hatch_allowed is distinct from true) then
    raise exception 'faq-1c-undo: a plan still has Pay at Hatch off';
  end if;

  -- 2 · Pizzeria Gusto: only the override faq-1c added
  update public.trucks set feature_overrides = feature_overrides - 'online_ordering_pay_at_hatch'
   where slug = 'pizzeria-gusto' and feature_overrides = '{"online_ordering_pay_at_hatch": true}'::jsonb;
  if exists (select 1 from public.trucks where slug = 'pizzeria-gusto' and feature_overrides ? 'online_ordering_pay_at_hatch') then
    raise exception 'faq-1c-undo: pizzeria-gusto holds a Pay at Hatch override that is not the one faq-1c wrote — stop and ask';
  end if;

  -- 3 · the comparison row's source, as before faq-1c
  update public.comparison_features set hatchgrab_source = 'plan:online_ordering_pay_at_hatch'
   where key = 'payattruck' and hatchgrab_source = 'fixed:partial:note';
  if (select hatchgrab_source from public.comparison_features where key = 'payattruck') is distinct from 'plan:online_ordering_pay_at_hatch' then
    raise exception 'faq-1c-undo: the payattruck comparison row is not on its plan source';
  end if;

  -- 4 · the FAQ rows Dominic keeps: seed text → faq-1c's text; already faq-1c's text → nothing; anything else → stop
  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000002' and question_en = $q$What do I pay on each order?$q$) then
    update public.faq_items set
      question_en = $q$What do I pay on each order?$q$,
      answer_en = $a$Nothing on walk-up orders, and nothing at all on {unlimited.name}. On online card orders, {payg.name} charges {payg.fee}, and {pro.name} charges {pro.fee} once you pass {pro.included} in a month. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.$a$,
      answer_single_plan_en = $s$Nothing. {unlimited.name} has no HatchGrab fee on any order. Online card payments carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.$s$,
      updated_at = now(), updated_by = 'faq-1c-undo'
     where id = 'fa000002-0000-4000-8000-000000000002' and question_en = $q$Do you take a cut of every order?$q$;
    get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c-undo: …0002 is neither the seed nor faq-1c''s text'; end if;
  end if;

  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000003' and answer_en like '%Connect online card payments before your trial ends, because after it pre-orders are paid online.') then
    update public.faq_items set
      answer_en = answer_en || $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$,
      answer_single_plan_en = answer_single_plan_en || $x$ Connect online card payments before your trial ends, because after it pre-orders are paid online.$x$,
      updated_at = now(), updated_by = 'faq-1c-undo'
     where id = 'fa000002-0000-4000-8000-000000000003'
       and answer_en = $a$Yes. Your first {trial.months} months are free with every feature unlocked, and you don’t need a card to start. When the trial ends you move to {trialEnd.name} ({trialEnd.price} a month). If you’d like a different plan, email us and we’ll switch you.$a$;
    get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c-undo: …0003 is neither the seed nor faq-1c''s text'; end if;
  end if;

  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000006' and answer_en like '%and connect Stripe so customers can pay online%') then
    update public.faq_items set
      answer_en = replace(answer_en, 'and connect Stripe if you want online card payments', 'and connect Stripe so customers can pay online'),
      updated_at = now(), updated_by = 'faq-1c-undo'
     where id = 'fa000002-0000-4000-8000-000000000006' and answer_en like '%and connect Stripe if you want online card payments%';
    get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c-undo: …0006 is neither the seed nor faq-1c''s text'; end if;
  end if;

  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000007' and answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: pre-orders are paid online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$) then
    update public.faq_items set
      answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop. We recommend a tablet for the best experience, but it works on a phone too. You don’t need a card reader: pre-orders are paid online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$,
      updated_at = now(), updated_by = 'faq-1c-undo'
     where id = 'fa000002-0000-4000-8000-000000000007'
       and answer_en = $a$No. HatchGrab runs in the web browser on any phone, tablet or laptop, so you can use the devices you already have. You don’t need a card reader either: customers can pay at the truck or by card online, and for walk-up orders you keep using the card machine you already have. {apps.sentence}$a$;
    get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c-undo: …0007 is neither the seed nor faq-1c''s text'; end if;
  end if;

  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000010' and answer_en = $a$During your free trial, yes: with {payAtTruck}, customers order ahead and pay when they collect, so you can try ordering before connecting card payments. After your trial, pre-orders are paid online by card into your own Stripe account. Walk-up orders are paid at the window as usual.$a$) then
    update public.faq_items set
      answer_en = $a$During your free trial, yes: with {payAtTruck}, customers order ahead and pay when they collect, so you can try ordering before connecting card payments. After your trial, pre-orders are paid online by card into your own Stripe account. Walk-up orders are paid at the window as usual.$a$,
      updated_at = now(), updated_by = 'faq-1c-undo'
     where id = 'fa000002-0000-4000-8000-000000000010'
       and answer_en = $a$Yes. With {payAtTruck}, customers order ahead and pay when they collect, so you can take orders without connecting a card processor. You can add online card payments at any time, on {plansWith.online_payments}.$a$;
    get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c-undo: …0010 is neither the seed nor faq-1c''s text'; end if;
  end if;

  if not exists (select 1 from public.faq_items where id = 'fa000002-0000-4000-8000-000000000015' and answer_en like 'Customers choose their collection time when they order, so they know when to come.%') then
    update public.faq_items set
      answer_en = $a$Customers choose their collection time when they order, so they know when to come. They also get an email confirming their order. If you switch on the order-ready step, they’re emailed again when you mark the order ready. You can also use your own buzzers, and HatchGrab records each order’s buzzer number, or call out the name on the ticket.$a$,
      updated_at = now(), updated_by = 'faq-1c-undo'
     where id = 'fa000002-0000-4000-8000-000000000015'
       and answer_en = $a$Customers get an email confirming their order. If you switch on the order-ready step, they’re emailed again when you mark the order ready. You can also use your own buzzers, and HatchGrab records each order’s buzzer number, or call out the name on the ticket.$a$;
    get diagnostics n = row_count; if n <> 1 then raise exception 'faq-1c-undo: …0015 is neither the seed nor faq-1c''s text'; end if;
  end if;

  update public.faq_items set note_done = true
   where not note_done
     and (note like 'CHECK (Cursor): %'
          or id in ('fa000002-0000-4000-8000-000000000002', 'fa000002-0000-4000-8000-000000000007',
                    'fa000002-0000-4000-8000-000000000010', 'fa000002-0000-4000-8000-000000000015'));
end $$;

commit;
