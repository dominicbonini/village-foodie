# manual-v16-35 — the reference manual moved from V16.34 to V16.35

**24 November 2026 · status: DONE · commit `6c51d285` on `france-vat-1` (not pushed, not deployed) · this report is not committed
(the brief named only three files to commit)**

## 0 · Result

- `~/Downloads/reference-manual-delta-v16-35.md` is applied to `docs/reference-manual.md`, following its "HOW TO APPLY" section:
  - the version is V16.35 in both places;
  - the new standing rule is in place, the V16.35 changelog entry is at the top of `# Changelog`, and the reference changes are made;
  - the open items are edited in place, with the new ones numbered **40–51**.
- The read-only verify steps were run on 24 Nov at 10:12 UTC (§2). What I observed is recorded in the manual, both in the changelog
  entry and in open items 40–42.
- **Committed together, in `6c51d285`:** `docs/reference-manual.md` (+346 / −8), `docs/vercel-cost-1-report.md` and
  `docs/france-readiness-1-report.md` (both previously untracked).
  - No git lock got in the way.
  - Before committing, I checked the two reports for secrets. The only match is the placeholder `REVALIDATE_SECRET='<the secret>'`.
- **Left alone:** every other uncommitted file. That includes the france-receipts-1 session's work: `lib/email.ts`,
  `lib/receipt*.ts`, `lib/printing/*`, `messages/*`, `docs/i18n/back/*`, `scripts/france-receipts-1.cjs`, `scripts/harnesses.json`,
  `docs/france-receipts-1/`, `docs/plans-everywhere-5-report.md` and others.
- **Not done:** no .env file opened, no push, no deploy, no database write. Every SQL statement was read-only, through the MCP.

## 1 · What changed in the manual

| Part | Change |
|---|---|
| Header, line 1 | `HatchGrab Engineering Reference Manual · V16.35` |
| Front matter | `**Version 16.35**` (grep: lines 1 and 9 agree) |
| Standing rules (top) | New: **"A change to the order path in the shared database is proved live, rolled back, before and after it is applied"** — the delta's text, after "Translate only what's used" |
| Open items heading | `(V16.35, 24 November 2026)` |
| Item 10 and item 23 | Added: France makes non-Latin ticket printing urgent ("é" → "e", "€" → "EUR") |
| Item 12 | Added: 209 passed, 21 failed (list in `docs/inbox-2-report.md` §3); still one tidy-up prompt |
| Item 26 | Added: Dominic reaches out to partners once the landing page is updated |
| Item 35 | ⛔ Mostly done by vercel-cost-1; what is left is listed (401 check, Ignored Build Step, Usage after a week); the old text struck through |
| Item 36 | Unchanged, as the delta says |
| Items 40–51 (new) | Move main forward; the Inbox switch-on order; the knowledge screen; the till line; forecasting; the per-market deadline; France e-reporting; till-software compliance; France receipts; Microsoft 365; channels research; the German comparison page. Items 40–42 also carry what the verify step observed. Item 43's cross-reference points at item 47 |
| Changelog | The V16.35 entry at the top, from the delta, plus an **OBSERVED 24 Nov** block (git, settings, `reply_knowledge`, columns, triggers), a corrected migration name (§3), what france-receipts-1 shows on 24 Nov, and a list of the reference sections touched |
| §35.ap-2 | ⛔ pointer: `revalidate = 300` / "within 300 seconds" superseded |
| §48 | New subsection **"Marketing pages refresh only on demand (V16.35 — vercel-cost-1)"**. Checked against the code: `revalidate = false`, `dynamicParams = true`, the 8 countries, and `/api/revalidate` answering 503 / 401 / 400 |
| §60.2 | hello@'s row: ⛔ now also a send account, for Inbox replies to enquiries only. Added: who replies from which address |
| §60.5 | New bullet: enquiry intake (behind the switch, read-only, its own watermark, the skips) |
| §61.1 | "Open in Inbox" from Replies waiting, the prospect timeline and the partner drawer |
| §37 Tax, tips and fees | ⛔ on "CHECK 0–20000 / rounded once per order". New subsection: per-dish rates, `lib/order-tax.ts`, `tax_breakdown`, 0–30 %, the finished-order lock, the replaced `place_order_atomic_v2`, receipt numbers, the VAT-regime stamp, "triggers never fail an insert" |
| §19 (costs-accounts-1) | New subsection: "Daily totals by VAT rate (CSV)" (columns, rules, presets per regime, from `docs/france-records-1-report.md`), "Receipt no.", per-rate Net / Tax |
| §50 | New subsection: Manage › Settings › Business details (columns, checks, the owner-or-admin route, the audit row) |
| V11.52 audit note | ⛔ `action_audit_log` now also records placement, edit, cancel and reject; still no trail for settings changes |
| §43 retention job | Enquiries are deleted 24 months after their last message; orders unchanged |
| §83.9 France | ⛔ "no per-item TVA yet" superseded. New block: e-reporting, till software, the written promises, what is held |
| **§90 (new)** | **Enquiries and the Inbox**: tables, the switch and intake, drafting and the answer pack, the numbers check, the $5 cap, `reply_knowledge`, Admin › Inbox and Send, send addresses, retention, harnesses. Facts checked against the migrations and `lib/` |

## 2 · Verify steps (read-only, 24 November 2026, 10:12 UTC)

**Git:**
```
branch checked out: france-vat-1
origin/main  f2e2b4ab
main         59ae6161
france-vat-1 56ce9d7d
git rev-list --count main..france-vat-1   → 17
git rev-list --count origin/main..main    → 10
```
- Every commit the delta names exists, and all of them are on france-vat-1: `59ae6161 5df925d8 40c27cd4 09f191df fbc98a34 8e6104f4
  38d579e6 26a8b0b9 c91b7a59 12e9a770 1e10844e 099019cf 8956bb90 eab06a0a 0b2cad75 3a796041 d6231c73 68742078 6ed618a9 56ce9d7d
  f2e2b4ab`.
- `59ae6161`, `5df925d8`, `40c27cd4` and `f2e2b4ab` are also on main.
- **Note:** `git rev-parse --short origin/main main france-vat-1` as written in the delta fails ("Needed a single revision"), so I
  resolved each name on its own.

**SQL (Supabase MCP, read-only):**
```sql
select key, case when key = 'mail_aliases' then jsonb_array_length(value)::text else value::text end as value
  from public.outreach_settings
 where key in ('enquiries_intake_enabled', 'enquiries_reply_from_alias', 'mail_aliases') order by 1;
```
| key | value |
|---|---|
| enquiries_intake_enabled | false |
| enquiries_reply_from_alias | false |
| mail_aliases | 36 |

```sql
select status, kind, count(*) from public.reply_knowledge group by 1, 2 order by 1, 2;
```
| status | kind | count |
|---|---|---|
| approved | fact | 4 |
| approved | gap | 1 |
| approved | guidance | 2 |
| suggested | fact | 1 |

This matches the delta's seed list: eight lines, with the till line the one suggested fact.

```sql
select table_name, column_name from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'orders' and column_name in ('tax_breakdown', 'receipt_no', 'vat_regime'))
     or (table_name = 'menu_items_db' and column_name = 'tax_rate_milli')
     or (table_name = 'trucks' and column_name in ('vat_regime', 'legal_name', 'siren')))
 order by 1, 2;
```
| table_name | column_name |
|---|---|
| menu_items_db | tax_rate_milli |
| orders | receipt_no |
| orders | tax_breakdown |
| orders | vat_regime |
| trucks | legal_name |
| trucks | vat_regime |

**`trucks.siren` does not exist.** As the delta instructs for that case, I read the names from
`supabase/migrations/20261125_france_records_1.sql` (`legal_name`, `registered_address`, `registration_number`, `vat_number`,
`vat_regime`) and checked what exists:

```sql
select 'col' as k, table_name||'.'||column_name||' '||data_type as v from information_schema.columns
 where table_schema='public' and ((table_name='trucks' and column_name in ('legal_name','registered_address','registration_number','vat_number','vat_regime'))
   or (table_name='order_drafts' and column_name in ('vat_regime','tax_breakdown')))
union all
select 'trigger', c.relname||': '||t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where c.relnamespace='public'::regnamespace and c.relname in ('orders','order_drafts') and not t.tgisinternal
order by 1,2;
```
- **Columns:** `order_drafts.tax_breakdown jsonb`, `order_drafts.vat_regime text`, `trucks.legal_name text`,
  `trucks.registered_address jsonb`, `trucks.registration_number text`, `trucks.vat_number text`, `trucks.vat_regime text`.
- **Triggers:** `order_drafts_stamp_vat_regime` on order_drafts. On orders: `orders_fill_currency_country`, `orders_receipt_no`,
  `orders_receipt_no_keep`, `orders_set_updated_at`, `orders_stamp_vat_regime`.

```sql
select count(*) as enquiries from public.enquiries;
```
**Result: 0.**

## 3 · Where the delta and reality differ (I recorded reality)

1. **The 1b migration's filename.** The delta writes `20261125b_…_receipt_replay.sql`; the file is
   `supabase/migrations/20261125_france_records_1b_receipt_replay.sql`. The changelog entry uses the real name.
2. **No `trucks.siren` column.** SIREN / SIRET is stored in `trucks.registration_number`. I recorded this in the changelog's OBSERVED
   block and in §50.
3. **The "unmatched mail is not stored, logged or named" sentence isn't in the manual.** The delta asks to supersede it in the poll's
   description, but there is no such text in §60.5 or anywhere else (searched). Instead, I added the new intake rule to §60.5 as its
   own bullet.
4. **main is 10 commits ahead of origin/main.** The delta doesn't mention this; V16.34 recorded 5 on 23 Nov. I recorded it in open item 40.
5. **france-receipts-1 has moved on since the delta was written.** Its `vat_regime` columns and both stamp triggers are live. There is
   now uncommitted code in the folder (`lib/receipt.ts`, `lib/receipt-server.ts`, `scripts/france-receipts-1.cjs`, edits to the
   email, ticket and status page). I recorded only what I observed, and left the full entry to V16.36 as the delta asks.
6. **The new open items had no numbers in the delta.** I numbered them 40–51. Cross-references now use those numbers: the till line
   points at item 47, and the French promises at items 44 and 46.

## 4 · Flags

- Nothing in the prompt or the delta arrived garbled.
- **No contradiction, but worth knowing:** the prompt says "commit only" the manual and the two reports, and also asks for this report.
  So this report, `docs/manual-v16-35-report.md`, is written but **not committed**. Say if you want it committed.
- I didn't change the version rule's own grep example (it still says `V15\.`); "change nothing else" covers it.
