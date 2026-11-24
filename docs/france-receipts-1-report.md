# france-receipts-1 — receipt number, date of sale and business details on customer receipts; the franchise en base rule

*24 November 2026 · branch `france-vat-1` (this work started at `eab06a0a`) · not pushed, not deployed.*

## Summary

- **The three approved outputs now carry the receipt's own facts.** These are the customer confirmation email, the status page (`/order/<key>/manage`) and the printed ticket:
  - **email and status page:** the receipt number beside the order number ("Order #23 · Receipt no. 142", « Commande #23 · Reçu n° 142 »), shown only when the order has one; the date and time of sale under it (« 24/11/2026 12:41 »); the truck's business details at the bottom, small and muted, only the fields the truck has filled in;
  - **ticket:** the receipt block at the bottom, after the totals and tax lines: a divider, the receipt number, the date of sale, then the business details, wrapped to 58 or 80 mm.
- **Franchise en base** (a French truck with regime = franchise):
  - new orders are taxed at 0 % on every line and deal, and record a 0 % rate and breakdown;
  - the three outputs show « TVA non applicable, art. 293 B du CGI » under the total, with no « Dont TVA »;
  - the accountant CSV and the daily-totals file show those sales at 0 % with VAT 0;
  - the truck's saved default and dish rates are never touched, and come back when the regime changes;
  - each order records the regime it was sold under, so existing orders are unchanged and later receipts stay right.
- **One database change was needed:** `orders.vat_regime` / `order_drafts.vat_regime`, stamped by a trigger that can never make an insert fail.
  - The pre-flight ran first in one rolled-back transaction, then the migration, then the same proofs again (rolled back).
  - `place_order_atomic_v2` is untouched.
- **Nothing else customer-facing changed.**
  - The truck's new-order email is byte-identical to the start in every case. So are the "ready" email, the order page and the in-page confirmation.
- **Proof:** `scripts/france-receipts-1.cjs` **53 passed, 0 failed**. Sweep: §8.

| # | Item | Outcome |
|---|---|---|
| 1 | Receipt number and date of sale | **Done** on all three outputs, every country. |
| 2 | Business details block | **Done.** France SIRET/SIREN (spaced; digits on the ticket) and « N° TVA »; GB "Company no."; elsewhere "Registration no."; VAT as "{label} no." in the receipt's language. |
| 3 | Franchise en base | **Done.** 0 % at order time (submit, walk-up, card draft → promotion); an edit keeps the order's own regime. The 293 B line on the three outputs. 0 % in both accountant files. The new operator note. |
| 4 | Words | 4 receipt words and the reworded note in en-GB and the 54 bases enabled countries use, with back-translations. translation-check: 0 structural problems in all 54. The 293 B line is fixed French, for French trucks only. |
| DB | `vat_regime` snapshot | **Applied** (`20261126_france_receipts_1.sql`), additive. Proven live, rolled back, on demo trucks only. |

## Things you should know first

1. **One database change, and why.** The 293 B line has to follow the regime the order was **sold** under, not the truck's regime today. So each order now records it.
   - Two nullable columns, plus a BEFORE INSERT trigger that copies `trucks.vat_regime` when the insert names none.
   - This covers the deployed code's inserts and `place_order_atomic_v2` without touching either.
   - It never fails an insert: the read is in its own exception block, and there is no check constraint.
   - No truck has a regime set today (checked: 0). The Settings card that sets one isn't deployed.
2. **Until this code is deployed,** an order on a franchise truck would be stamped franchise but still taxed by the deployed code. The receipt rule is safe for that: the 293 B line shows only when the order is stamped franchise **and** carries no tax at all. A taxed order is never told it was exempt (proved, §C).
3. **The French order number keeps its current wording, « Commande #23 ».**
   - The brief's example says « Commande n° 23 ». But the brief also says an order with no receipt number may differ from the start only by the date line, so I left the existing words alone and added « · Reçu n° 142 » beside them.
   - Say if you'd like « n° » there too; it's a one-word change in fr-FR.
4. **I didn't have the approved mockup**; there's none in the repo.
   - I built the style from the brief: the business block in 11–12 px muted grey, centred at the bottom; the date of sale 12 px under the order number.
   - Text renders are in §5 and `docs/france-receipts-1/samples.txt`.
5. **On the printed ticket, « N° » prints as "No"** ("No TVA FR…", "Recu no 142"). The printer path has no "°". It already folds accents and would otherwise print "?".
6. **The accountant's Orders CSV** now adds its per-rate columns when the file holds a 0 % rate, even if it is the only rate. That way a franchise truck's file says 0 % explicitly. Every file without a 0 % row is unchanged.
7. **Another session's files are on this branch, untouched:** `docs/plans-everywhere-5-report.md` (modified) and `docs/manual-v16-35-report.md` (new). I didn't stage them.

---

## 1 · What changed, by area

**Receipt facts (one source for the three outputs)**
- `lib/receipt.ts` (new, pure, client-safe) — `receiptFactsOf(order, truck, {time, locale, addressFormat, forTicket})` → `{ receiptNo, soldAt, business[], franchiseNote }`:
  - the date of sale: `placed_at`, else `created_at` (a walk-up row has no `placed_at`), on the truck's clock, through the existing numeric-date and clock helpers;
  - SIREN/SIRET spacing; the labels;
  - the registered address through the truck's address format (`eventAddressLine`).
- The franchise helpers, also in `lib/receipt.ts`: `franchiseApplies`, `franchiseRules`, `franchiseTaxBook` and `franchiseNoteFor`.
- `lib/receipt-server.ts` (new, server): `receiptForRow` and `receiptForOrderKey`. The latter is one read of the four receipt columns, used where a send site has only the key. It never throws: on any error the email goes out exactly as before.

**The customer confirmation email** — `lib/email.ts` `formatConfirmationEmail` takes an optional `receipt`:
- **HTML:** the receipt part and date in the order-number line; the 293 B row under the total in place of the « Dont TVA » rows; the business block above "Powered by". Business text is HTML-escaped (operators type it).
- **Text part:** the receipt and date lines under the title; the 293 B line after the total; the business lines above "Powered by".
- **Not** on the 'ready' variant. With no `receipt` passed, the email is byte-identical to before.
- **Send sites:**
  - the customer submit and the card promotion (one read by order key);
  - the operator confirm, the edit "updated" email and the slot change (`app/api/dashboard/action/route.ts`);
  - the walk-up (one read by order key).

**The status page**
- `app/api/orders/[id]/route.ts`: the named select gains `receipt_no, placed_at, created_at, vat_regime` and the truck's four business columns. The response gains one key, `receipt`, holding only the facts that have values, worded in the truck's language.
- `app/(app)/order/[id]/manage/page.tsx`:
  - the receipt part in the header, beside "Order #23";
  - the date under it;
  - the 293 B line under the total;
  - the business block at the bottom of the card.

**The ticket**
- `lib/printing/ticket.ts`: two optional fields, `franchiseNote` (printed under TOTAL) and `receipt`, printed at the bottom before the truck's name. There's one divider: none extra if the notes block's closing rule is already there. Everything is wrapped, never truncated.
- `lib/printing/mapOrderToTicket.ts` fills both from `receiptFactsOf(…, { forTicket: true })`.
- `app/api/dashboard/route.ts`: the truck payload gains `address_format`, only when the truck has a registered address, so every other dashboard response is unchanged. The business columns already reach the dashboard (every non-redacted truck column does).

**Franchise en base — pricing**
- `app/api/orders/submit/route.ts` (pay at the truck and card drafts) and the walk-up in `app/api/dashboard/action/route.ts`: when `franchiseApplies(truck.country, truck.vat_regime)`, the rules' default rate is 0 and the dish book is at 0 %. So every line and deal is stamped 0 %, and the order's rate and breakdown are 0 %.
- **The operator edit** uses the order's own stamp (`order.vat_regime === 'franchise'`), not the truck's regime today. A line it adds to a franchise order is 0 %; an older order keeps its rates.
- `lib/payments/promote-draft.ts`: the order carries the draft's stamped regime, named only when the draft has one; otherwise the trigger copies the truck's.
- **The accountant files:** `lib/accounts/csv.ts` (the 0 % per-rate columns, above). The ledger and daily totals needed no change: a 0 % breakdown row is already rate 0 with VAT 0.

**Settings**
- `components/manage/BusinessDetailsCard.tsx`: the note shows whenever franchise en base is chosen. It reads « Because you've chosen franchise en base, your receipts show "TVA non applicable" and no TVA is charged. » The old "you may want to set your VAT to 0 %" condition and wording are gone.

**Words**
- `messages/*.json`:
  - `charges.receipt.{number, companyNumber, registrationNumber, taxNumber}`;
  - `manageSettings.business.regime.franchiseNote` reworded.
- `messages/ns/*` regenerated; `docs/i18n/back/*`.

**Database and proof**
- `supabase/migrations/20261126_france_receipts_1.sql`.
- `scripts/db-rollback-proofs.cjs`: `--preflight-regime`, `--regime-check`.
- `docs/france-receipts-1/*.log`.
- `scripts/france-receipts-1.cjs` (new, registered), `scripts/_named-france-receipts-1.cjs` (the named difference for other harnesses), `scripts/_lp-france-receipts-1.cjs`.

## 2 · Every SQL statement run

**Read-only, before (Supabase MCP):**
```sql
select c.relname as tbl, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('trucks','order_drafts') and not t.tgisinternal order by 1,2;
```
→ `trucks_record_plan_history` (on plan / trial_expires_at only), `trucks_referred_code_immutable` (on referred_partner_code_id only); none on order_drafts.
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.trucks'::regclass and conname = 'trucks_business_details_chk';
```
```sql
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='order_drafts' and is_nullable='NO' and column_default is null order by ordinal_position;
```
```sql
select table_name, column_name, data_type, column_default from information_schema.columns where table_schema='public' and ((table_name='orders' and column_name in ('placed_at','created_at','vat_regime')) or (table_name='order_drafts' and column_name='vat_regime')) order by 1,2;
```
→ placed_at has no default (so a walk-up falls back to created_at).
```sql
select id, country, vat_regime, plan, is_customer from public.trucks where id in ('demo-mk65q66spjck0g9mxt50btfxtr','test-truck-2') order by id;
```
→ FR and GB, no regime, plan demo, not customers.
```sql
select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.order_drafts'::regclass and contype in ('c','f','u') order by 1;
```

**The migration**, `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261126_france_receipts_1.sql` → sha256 `f40f1e88e24296e4`, committed `6ed618a9`, applied, one transaction, no error.
```sql
alter table public.orders       add column if not exists vat_regime text;
alter table public.order_drafts add column if not exists vat_regime text;
comment on column public.orders.vat_regime is 'france-receipts-1: the truck''s VAT regime (trucks.vat_regime) when the order was placed — franchise = sold under franchise en base (TVA non applicable, art. 293 B du CGI). NULL = none. Stamped by orders_stamp_vat_regime.';
comment on column public.order_drafts.vat_regime is 'france-receipts-1: the truck''s VAT regime when the card order was started; copied to the order at promotion.';
create or replace function public.orders_stamp_vat_regime()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.vat_regime is null then
    begin
      select t.vat_regime into new.vat_regime from public.trucks t where t.id = new.truck_id;
    exception when others then
      new.vat_regime := null;
      raise warning 'orders_stamp_vat_regime: no regime for truck % (%: %)', new.truck_id, sqlstate, left(sqlerrm, 200);
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_stamp_vat_regime() from public, anon, authenticated;
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'orders_stamp_vat_regime' and tgrelid = 'public.orders'::regclass) then
    create trigger orders_stamp_vat_regime before insert on public.orders for each row execute function public.orders_stamp_vat_regime();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'order_drafts_stamp_vat_regime' and tgrelid = 'public.order_drafts'::regclass) then
    create trigger order_drafts_stamp_vat_regime before insert on public.order_drafts for each row execute function public.orders_stamp_vat_regime();
  end if;
end $$;
notify pgrst, 'reload schema';
```
(The file wraps these in `set lock_timeout = '3s'; begin; … commit;`.)

**Read-only, after:**
```sql
select table_name, column_name, is_nullable, column_default from information_schema.columns
  where table_schema = 'public' and column_name = 'vat_regime' and table_name in ('orders', 'order_drafts') order by 1;
```
→ both nullable, no default.
```sql
select tgname, pg_get_triggerdef(oid) as def from pg_trigger where tgname in ('orders_stamp_vat_regime', 'order_drafts_stamp_vat_regime') order by 1;
```
→ both BEFORE INSERT.
```sql
select md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)) as v2_md5,
  (select count(*) from public.orders where vat_regime is not null) as stamped_orders,
  (select count(*) from public.trucks where vat_regime is not null) as trucks_with_regime,
  (select count(*) from public.orders where created_at > now() - interval '3 hours') as orders_last_3h;
```
→ `e4b273abcf8e7609c6ca54033ed59332` (unchanged), 0, 0, 0.

**The live proofs**, `scripts/db-rollback-proofs.cjs`. Each statement is printed with its parameters in `docs/france-receipts-1/preflight-20261126.log` and `regime-check.log`.
- **Safeguards:** demo trucks only (`demo-mk65q66spjck0g9mxt50btfxtr` FR, `test-truck-2` GB); every transaction ROLLED BACK in a `finally`; the script refuses to send a COMMIT; statement_timeout 5 s and lock_timeout 3 s.
- **Counts:** before and after counts of orders, order_payments, action_audit_log, production_slot_usage, order_drafts, the counters and both trucks' `vat_regime`, all identical.

The distinct statements it sent:
```sql
set statement_timeout = '5s'
set lock_timeout = '3s'
begin
set transaction read only
select (select count(*) from public.orders where truck_id = any($1))::int as orders, (select count(*) from public.order_payments where truck_id = any($1))::int as order_payments, (select count(*) from public.action_audit_log where truck_id = any($1))::int as action_audit_log, (select count(*) from public.production_slot_usage where truck_id = any($1))::int as production_slot_usage, (select coalesce(sum(order_counter), 0) from public.trucks where id = any($1))::int as trucks_order_counter, (select coalesce(sum(e.order_counter), 0) from public.truck_events e where e.truck_id = any($1))::int as events_order_counter, to_regclass('public.receipt_counters') is not null as has_counters, (select count(*) from public.order_drafts where truck_id = any($1))::int as order_drafts, (select string_agg(id || '=' || coalesce(vat_regime, '-'), ',' order by id) from public.trucks where id = any($1)) as truck_vat_regimes
select (select count(*) from public.receipt_counters where truck_id = any($1))::int as counter_rows, (select coalesce(sum(last_no), 0) from public.receipt_counters where truck_id = any($1))::int as counter_sum, (select count(*) from public.receipt_no_failures)::int as failures
select id, plan, is_customer from public.trucks where id = any($1) order by id
-- (pre-flight only) the migration's body, as above, its set lock_timeout / begin / commit / notify taken out
insert into public.orders (id, truck_id, customer_name, customer_phone, customer_email, slot, order_type, event_date, event_id, items, deals, discount_code, subtotal, discount_amt, total, total_minor, food_minor, tax_minor, tax_inclusive, tax_label, card_fee_payer, status, payment_status, source) values ($1, $2, 'rollback proof', null, null, null, 'collection', current_date, null, '[]'::jsonb, null, null, 0, 0, 0, 0, 0, 0, true, 'TVA', 'truck', 'confirmed', 'unpaid', 'manual') returning order_key, receipt_no
select vat_regime, receipt_no from public.orders where order_key = $1
update public.trucks set vat_regime = 'franchise' where id = $1
select public.place_order_atomic_v2($1::jsonb, null, 'confirmed', null, $2, current_date, null) as r
insert into public.orders (order_key, id, truck_id, customer_name, customer_email, customer_phone, order_type, table_ref, slot, requested_slot, asap_estimate, event_date, event_id, van_id, items, deals, extras, bundle, discount_code, subtotal, discount_amt, total, total_minor, notes, status, payment_status, placed_at) values (gen_random_uuid(), $1, $2, 'rollback proof', null, null, 'collection', null, null, null, null, current_date, null, null, '[]'::jsonb, null, null, null, null, 0, 0, 0, 0, null, 'pending', 'unpaid', now()) returning order_key, receipt_no
insert into public.order_drafts (order_key, truck_id, subtotal, total, total_minor) values (gen_random_uuid(), $1, 1, 1, 100) returning order_key, vat_regime
insert into public.orders (order_key, id, truck_id, …the same columns…, placed_at, vat_regime) values (gen_random_uuid(), $1, $2, …, now(), 'reel_simplifie') returning order_key, receipt_no
update public.trucks set vat_regime = 'reel_simplifie' where id = $1
rollback
```
The first pre-flight attempt stopped at its card-draft insert: `order_drafts_total_minor_positive`, because the draft carried 0. Like every run, it was rolled back (`preflight-20261126-attempt1.log`). That statement had `values (gen_random_uuid(), $1, 0, 0, 0)`. The script now uses a 1,00 draft.

| Run | Result |
|---|---|
| Pre-flight (before applying) | **7/7.** No regime → NULL (with a receipt number). Franchise → the walk-up, the **deployed** `place_order_atomic_v2` call, the promotion and a card draft are all stamped franchise. Receipt numbers still consecutive alongside. A named regime is kept. GB truck → NULL. The regime changed → the next order gets the new one, and the old order keeps franchise. Counts and regimes identical. |
| `--regime-check` (after applying) | **7/7**, the same. |

**Side effects outside the transaction: none**, as france-records-1 checked for orders.
- No webhook or pg_net triggers.
- The `trucks` triggers don't fire on `vat_regime`.
- Realtime only sends committed transactions.

## 3 · The rules

**Date of sale:** `placed_at`, else `created_at`, on the truck's clock, in the locale's numeric date and the truck's clock style:
- France « 24/11/2026 12:41 »;
- GB "24/11/2026 11:41";
- US "11/24/2026 6:41 AM".

**Receipt number:** "Receipt no. 142" / « Reçu n° 142 ». Only when `orders.receipt_no` is set; orders placed before france-records-1 have none.

**Business details:** only the fields filled in, in this order:

| Line | France | GB | Elsewhere |
|---|---|---|---|
| legal name | as typed | as typed | as typed |
| registered address | the truck's address format, one line | ← | ← |
| registration number | "SIRET 732 829 320 00074" (14 digits) / "SIREN 732 829 320" (9); ticket: digits only | "Company no. 12345678" | "Registration no. …" (translated) |
| VAT number | « N° TVA FR12345678901 » | "VAT no. GB…" | "{label} no." with the order's tax name, in the language (de "MwSt.-Nr.", nl "{label}-nr." …) |

**Franchise en base:**
- **When it applies:** a French truck (`hasVatRegime`) with `vat_regime = 'franchise'`, at the moment of the order.
- **At order time:** every line and deal part is stamped 0 %; the order's `tax_rate_milli` is 0 and its `tax_breakdown` is one row at 0 % (tax 0). For prices that include tax, the total is the same.
- **Never written:** the truck's saved default rate and dish rates.
- **Edits:** follow the order's own stamp.
- **On the outputs:** the line « TVA non applicable, art. 293 B du CGI » shows only when the order is French, stamped franchise and carries no tax at all. « Dont TVA » lines never appear at 0 %.
- **In the accountant files:**
  - Orders CSV: tax 0, basis "stored", its "Net 0% / Tax 0%" columns;
  - daily totals: a 0 % row with VAT 0, e.g. `2026-11-24,Goods,0%,15.00,0.00,15.00,0.00`.

## 4 · Proof — `scripts/france-receipts-1.cjs`: 53 passed, 0 failed

**A · The named difference against `eab06a0a`, extracted from git.** Four orders (France one rate, France mixed rates, GB, US) × three cases:
- **The cases:** no receipt and no details → only the date line; + a receipt number → also the receipt part; + business details → also the block.
- **The method:** each expected output is START's output with exactly those insertions made at named places, then compared byte for byte:
  - the email's HTML and text;
  - the status page's HTML (the real page, rendered);
  - the order API's JSON (the real route on an in-memory database: START's answer plus one `receipt` key);
  - the ticket's line model, and its bytes at 58 and 80 mm through **START's own encoder**.
- **Also byte-identical to START:** the truck's new-order email in every case; the "ready" email with or without facts; an email sent with no facts.
- **A live check** proves the comparison can fail.

**B · Labels:**
- SIRET (spaced; digits on the ticket) and SIREN;
- « N° TVA » (and "No TVA" on paper); the French address format;
- GB "Company no." / "VAT no.";
- the US "Registration no." and its 12-hour date;
- German words from the German file;
- partial details; blanks; none at all.

**C · Franchise en base:**
- 0 % on every line (10 %, 5,5 % and 20 % dishes) and every deal part;
- a 0 % rate and breakdown;
- the saved rates untouched; switched back → 10 / 5,5 / 20 % again;
- France only;
- the exact 293 B line under the total on the email (HTML and text), the status page and the ticket (wrapped at 58 mm), with no « Dont TVA »;
- the new-order email byte-identical to START;
- Orders CSV 0 % "stored" with `net@0 / tax@0` columns, alone and beside a 10 % order;
- the daily-totals row at 0 % with VAT 0;
- an older order untouched; a taxed order stamped franchise never shows the line;
- an edit adds a 20 % cider at 0 %;
- the real submit, walk-up, edit and promotion code use the rules;
- no added line writes a rate.

**D · The 58 mm ticket:** a 74-character legal name and an 80-character address wrap within 32 columns (48 at 80 mm), every word kept, in order.

**E · The migration:**
- additive, no constraint, never fails an insert, triggers only if missing, `place_order_atomic_v2` untouched;
- both recorded live logs: 7 proofs each, counts identical, no COMMIT sent;
- the script is operational-only.

**F · Words:**
- en-GB exact;
- the 54 bases each have the 4 words with their placeholders, the note keeping « franchise en base » / « TVA non applicable », and back-translations;
- the 5 unused bases left alone;
- French « Reçu n° {n} » / « N° {label} »;
- the card's note condition.

## 5 · Text renders

Rendered by the harness from the real code (`node scripts/france-receipts-1.cjs --write-samples` → `docs/france-receipts-1/samples.txt`). The status page's own words are English in this static render; on the live page they follow the truck's language, while the receipt facts arrive already worded.

**(a) A VAT-registered French truck, full details, a mixed-rate order**
```
── email (text part) ──
Commande #23 confirmée — Crêperie
Reçu n° 142
24/11/2026 12:41
1x Crêpe — 8,50 €
1x Canette — 2,50 €
1x Cidre — 4,00 €
Total : 15,00 €
Dont TVA 5,5 % : 0,13 €
Dont TVA 10 % : 0,77 €
Dont TVA 20 % : 0,67 €
Heure de retrait : 12:30. À tout à l’heure au food truck !
À payer au food truck lors du retrait.
📍 Place du Marché, Paris
Crêperie Léa SARL
12 rue des Lilas, 75011 Paris
SIRET 732 829 320 00074
N° TVA FR12345678901
Propulsé par HatchGrab — hatchgrab.com
── status page (text) ──
Crêperie · Order #23 · Reçu n° 142 · 24/11/2026 12:41 · … Total 15,00 € · … · Crêperie Léa SARL · 12 rue des Lilas, 75011 Paris · SIRET 732 829 320 00074 · N° TVA FR12345678901
── ticket, 58 mm ──
TOTAL                  EUR 15,00
Dont TVA 5,5 %          EUR 0,13
Dont TVA 10 %           EUR 0,77
Dont TVA 20 %           EUR 0,67
--------------------------------
Recu no 142
24/11/2026 12:41
Creperie Lea SARL
12 rue des Lilas, 75011 Paris
SIRET 73282932000074
No TVA FR12345678901
            Creperie
```
**(b) A French truck under franchise en base (10 % default, a 20 % cider), the same order**
```
── email (text part) ──
Commande #23 confirmée — Crêperie
Reçu n° 143
24/11/2026 12:41
…
Total : 15,00 €
TVA non applicable, art. 293 B du CGI
…
Crêperie Léa SARL / 12 rue des Lilas, 75011 Paris / SIRET 732 829 320 00074 / N° TVA FR12345678901
── status page ──
… Total 15,00 € · TVA non applicable, art. 293 B du CGI · …
── ticket, 58 mm ──
TOTAL                  EUR 15,00
TVA non applicable, art. 293 B
du CGI
--------------------------------
Recu no 143
24/11/2026 12:41
Creperie Lea SARL
…
```
**(c) A GB truck with no details (no receipt number yet)**
```
── email (text part) ──
Order #23 confirmed — Crêperie
24/11/2026 11:41
2x Crêpe — £17.00
Total: £17.00
…
── status page ──
Crêperie · Order #23 · 24/11/2026 11:41 · Pickup 12:30 … Total £17.00 …
── ticket, 58 mm ──
TOTAL                     £17.00
--------------------------------
24/11/2026 11:41
            Creperie
      printed 24 Nov 12:41
```

## 6 · Re-pins

Each one is marked ⚠️ RE-PINNED (france-receipts-1). Each takes out only this work's named insertions (`scripts/_named-france-receipts-1.cjs`) or names the one changed rule; everything else is compared as before.

| Harness | What moved, and why |
|---|---|
| `france-vat-1.cjs` §A | Its ticket rows carry a `created_at`, so the ticket has the receipt block. It's taken out of HEAD's line model (found exactly once on HEAD, never on BASE) and encoded by the tree's encoder. The order-path check also accepts the franchise book choice. |
| `france-records-1.cjs` | (1) The franchise-note rule asserts the new condition (whenever chosen). (2) §F's ticket strips the receipt block (its row carries a receipt number). (3) "No customer file changed" now reads START → `68742078`, france-records-1's own last commit, which is what it proves. |
| `order-charges.cjs` | The card promotion's confirmation email gains the date line; it's taken out of AFTER's emails. |
| `time-dates-parity.cjs` | The ticket view drops the receipt block, found exactly once above the footer. Not a time change. |
| `money-sweep-parity.cjs` (and `-usd`, which loads it) | Ticket views: the block taken out of the lines, bytes from the tree's encoder. The /dev ticket preview: that view's mapper is patched to leave the block out, since the preview prints the total byte count. |
| `_lp1b-printing.cjs` (language-phase-1b and -2) | The same for the ticket captures; the TicketPreview gets the ticket without its `receipt` field. |
| `_lp-france-records-1.cjs` (the set-aside 8 language harnesses read) | The 5 unused bases also lack the 4 receipt words (`_lp-france-receipts-1.cjs`). |

## 7 · Translators' notes

Worth a native read:
- **is-IS:** TVA is treated as masculine.
- **hu-HU:** "{label}-azonosító" ("identifier"), matching the existing VAT label.
- **et-EE:** "Registrikood".
- **ca-AD:** "Núm. {label}".
- **lt-LT:** "PVM kodas" ("code").
- **ro-RO, sk-SK, sl-SI:** the existing local forms ("Cod {label}", "IČ {label}", "ID za {label}").
- **lo, th, si, uz, zh-HK, zh-TW:** these spell out "number" (there's no abbreviation).
- **tr-TR:** the sentence is reordered so « franchise en base » isn't first.
- **pt-BR / pt-PT:** "Nº {label}" / "N.º {label}".
- **ka-GE, bg-BG:** followed the existing wording; flagged as less certain.

Every franchise note keeps « franchise en base » and « TVA non applicable » in French, in the language's own quotation marks.

## 8 · The sweep (against `eab06a0a`)

**Result: no failure from this work is left.** Every harness that fails on this branch fails exactly as at `eab06a0a`.

- **The baseline,** at `eab06a0a` in a throwaway worktree: 231 harnesses, 21 failing.
- **The branch,** after the build commit `55b87152`: 232 harnesses (`france-receipts-1` is new), every listed file passing the screen, 21 failing.
- **Compared harness by harness:**

| Harness | At start | First branch run | Cause | Now |
|---|---|---|---|---|
| `money-sweep-parity`, `money-sweep-parity-usd` | pass | fail (88 / 68 differences) | The ticket views and the /dev ticket preview print the new receipt block. | **⚠️ RE-PINNED** (§6). Both pass: GB, all 3,038 strings and byte streams identical to the fixture; USD clean. |
| `language-phase-1b` | 3112 / 392 | 2951 / 553 | Its ticket captures (`_lp1b-printing.cjs`) print the receipt block, including reprint tickets, whose banner is also centred. | **⚠️ RE-PINNED** (§6). **3112 / 392**, the baseline's own. |
| `language-phase-2` | 1770 / 404 | 1766 / 565 | It reads the same captures. | **1770 / 404**, the baseline's own. |
| `pending-card-buttons`, `pending-card-render` | fail | pass | **Environment, not code:** the throwaway worktree had no `.next` build ("no .next/static — run `npx next build` first"). This folder has one. | pass |
| every other harness | — | identical to start | — | — |

**Before the sweep, found and fixed by running the affected harnesses early:**
- `order-charges`: the promotion email's date line.
- `time-dates-parity`: the ticket block.
- `france-vat-1`: the ticket block and the order-path check.
- `france-records-1`: the note rule, §F's ticket, and the changed-files check.

All are re-pinned by name (§6), and each now matches the start or passes.

**The runner itself, over the 19 harnesses this work touched or whose helpers changed after the sweep** (`--list`, all 19 pass the screen):
- **12 pass:**
  - france-receipts-1 53/0, france-records-1, france-vat-1, order-charges;
  - time-dates-parity, money-sweep-parity, money-sweep-parity-usd;
  - event-types 192/0, language-phase-0, phase3-screens, schedule-graphics-places 270/0, us-readiness.
- **7 fail exactly as at the start:**
  - costs-accounts-1 77/1;
  - language-phase-1b 3112/392, 1c 4391/10, 1d 486/4, 1e 1020/3, 2 1770/404;
  - 1d2: the same pre-existing crash, "truck" not provided to "No upcoming events listed for {truck}.".

**Also checked:**
- **Type-check:** clean.
- **eslint:** every file this work changed has the same counts as at `eab06a0a`.
- **translation-check:** 0 structural problems in all 54 bases.
- **Restored after the runs:** the `us-changed.txt` fixtures and inbox-1's screenshots the runs rewrite, with `git checkout`.

## 9 · Left undone, and limits

- **No backfill:** existing orders have `vat_regime` NULL, and stay as they are, as asked.
- **Only the three approved outputs:** the cancellation, refund and "ready" emails, the order page and its in-page confirmation, the dashboard card and the KDS are unchanged.
- **The French order number** keeps « Commande #23 » (Things you should know, point 3).
- **A card order whose truck changes regime between the draft and its promotion** keeps the draft's regime, as the draft was priced. If the draft was stamped before this migration, the trigger takes the truck's at promotion. The 293 B line still needs the order to carry no tax.
- **The mockup** wasn't in the repo (point 4).
- **Deploy order:** the code relies on the columns, which are live now. Nothing changes for customers until you deploy.

## 10 · What to click through on localhost

Use a test or demo truck only.

1. **Manage › Settings › Business details (a French test truck):** fill in a legal name, an address, SIRET 73282932000074 and VAT FR12345678901, regime « Réel simplifié ».
   - Place an online order (pay at the truck) and a walk-up with a customer email.
   - Each confirmation email shows « Commande #N · Reçu n° M » and the date under it, the « Dont TVA » lines, and the details block at the bottom.
   - The email's cancel link opens the status page: the same receipt part, date and block.
   - Print the ticket at 58 mm: the block after the totals, the SIRET as digits, "No TVA …".
2. **Change the regime to « Franchise en base »:**
   - the Settings note now reads « Comme vous avez choisi la franchise en base … »;
   - place another order: « TVA non applicable, art. 293 B du CGI » under the total on the email, the status page and the ticket, with no « Dont TVA »;
   - in Manage › Payments the default and item rates are unchanged.
3. **Reports:** the Orders CSV shows that order with tax 0.00 and "Net 0% / Tax 0%" columns. The daily-totals file for today has a 0% row with VAT 0.00.
4. **Switch the regime back to « Réel simplifié »** and place one more order: the « Dont TVA » lines are back. The franchise order's status page still shows the 293 B line.
5. **A GB test truck with no details:** the email and the status page show only the date line under "Order #N"; the ticket's last block is the date.
6. **In the database, for the demo truck:**
   `select id, receipt_no, vat_regime, tax_rate_milli, tax_breakdown from public.orders where truck_id = '<demo truck>' order by created_at desc limit 3;`
