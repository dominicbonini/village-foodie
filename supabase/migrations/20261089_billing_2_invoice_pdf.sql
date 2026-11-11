-- supabase/migrations/20261089_billing_2_invoice_pdf.sql — billing-2 (11 November 2026; docs/billing-2-report.md).
-- The Invoices card's "Download" link is Stripe's hosted invoice PDF (invoice_pdf). One nullable column; no row changes.
begin;
alter table public.billing_invoices add column if not exists invoice_pdf_url text;
commit;
-- read-only check: select column_name from information_schema.columns where table_name = 'billing_invoices' and column_name = 'invoice_pdf_url';
