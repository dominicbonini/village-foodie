-- supabase/migrations/20261091_pricing_copy_2_wording.sql — pricing-copy-2 (11 November 2026; docs/pricing-copy-2-report.md).
-- Dominic approved exactly these two wording changes:
--   B2 · the 3 published FAQ answers (…0001, …0002, …0005): "online card orders" → "online orders" in the English source. The text
--        each row gets is what the FAQ's own save path (lib/admin/faq-actions.ts faqAction 'item.update') writes — its check
--        (checkItem, every country) passes on all three; scripts/pricing-copy-2.cjs proves both. The stored translations are NOT
--        touched: their source hash no longer matches the English, so the hourly translator (.github/workflows/faq-translate.yml)
--        regenerates them, as it does after any save in Admin › FAQ.
--   B3 · Pay as you go's plans.description: "No monthly fee. You only pay when a customer pays online by card." →
--        "No monthly fee. You only pay 0.99% on online orders." (Pay as you go's fee is 99 bps in every country's plan_prices row.)
--        Its translations are in each language's messages file (planNames.payg.description), changed in the same commit.
-- 🔴 A core-table row change (public.plans): run with --approved-by-dominic (approved in the pricing-copy-2 brief).
-- Each UPDATE is guarded by the old text, so a row edited since is left alone (and the run's verification shows it).
begin;

update public.faq_items
   set answer_en  = 'Each plan is per truck per month: {payg.name} {payg.price}, {pro.name} {pro.price} and {unlimited.name} {unlimited.price}. {payg.name} charges {payg.fee} on online orders. {pro.name} includes your first {pro.included} of online orders each month, then charges {pro.fee}. {unlimited.name} has no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.',
       updated_at = now(),
       updated_by = 'pricing-copy-2'
 where id = 'fa000002-0000-4000-8000-000000000001'
   and answer_en = 'Each plan is per truck per month: {payg.name} {payg.price}, {pro.name} {pro.price} and {unlimited.name} {unlimited.price}. {payg.name} charges {payg.fee} on online card orders. {pro.name} includes your first {pro.included} of online orders each month, then charges {pro.fee}. {unlimited.name} has no HatchGrab fee on your orders. Walk-up orders never carry a HatchGrab fee.';

update public.faq_items
   set answer_en  = 'Nothing on walk-up orders, and nothing at all on {unlimited.name}. On online orders, {payg.name} charges {payg.fee}, and {pro.name} charges {pro.fee} once you pass {pro.included} in a month. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.',
       updated_at = now(),
       updated_by = 'pricing-copy-2'
 where id = 'fa000002-0000-4000-8000-000000000002'
   and answer_en = 'Nothing on walk-up orders, and nothing at all on {unlimited.name}. On online card orders, {payg.name} charges {payg.fee}, and {pro.name} charges {pro.fee} once you pass {pro.included} in a month. Online card payments also carry the card processing fee, currently {card.fee}, which goes to Stripe, not to us.';

update public.faq_items
   set answer_en  = '{payg.name} is {payg.price} a month, so in the months you’re not trading you pay nothing. You only pay {payg.fee} on online orders when you take them.',
       updated_at = now(),
       updated_by = 'pricing-copy-2'
 where id = 'fa000002-0000-4000-8000-000000000005'
   and answer_en = '{payg.name} is {payg.price} a month, so in the months you’re not trading you pay nothing. You only pay {payg.fee} on online card orders when you take them.';

update public.plans
   set description = 'No monthly fee. You only pay 0.99% on online orders.'
 where key = 'payg'
   and description = 'No monthly fee. You only pay when a customer pays online by card.';

commit;

-- read-only checks (run after):
-- select id, answer_en, updated_by from faq_items where id in ('fa000002-0000-4000-8000-000000000001','fa000002-0000-4000-8000-000000000002','fa000002-0000-4000-8000-000000000005');
-- select key, description from plans where key = 'payg';
