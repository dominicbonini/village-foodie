# manual-v16-41 — reference manual delta V16.40 → V16.41 (the till module)

**Written for:** Dominic, and whoever next edits `docs/reference-manual.md`.

## Summary

- **Applied:** `~/Downloads/reference-manual-delta-v16-41.md` to `docs/reference-manual.md`, following its "HOW TO APPLY". Only one
  copy exists (modified 26 Nov 08:57), so there was no choice of file.
- **Version:** V16.41 in both places (line 1 and the front matter; grep finds both).
- **Open items:** the heading is now V16.41, 26 November 2026. Items 43 and 47 are edited in place (47's V16.36 "Have / Missing" is
  struck and points to the new text). New items 60–64 continue after 59, the highest number in use.
- **Changelog:** the V16.41 entry sits at the top of `# Changelog`, with an OBSERVED block from §D.
- **Reference sections:**
  - a new section, **"Till module — tamper-evident sales records"**, after §37 Payments;
  - additions to §16, §19, §37, §41, §43 and §83.9;
  - V16.37's France-chat line now points to V16.41.
- **Where the delta differed from the reports or the code, the manual follows the reports and the code.** There are 19
  differences, listed in §3.
- **Read-only throughout:** 9 SQL statements, all reads, through the Supabase MCP (§2, Appendix). Nothing was written to the
  database, nothing deployed, nothing pushed.
- **Commit:** this report and the manual only (§5).

## 0 · Prompt check

- **Garbled text:** none, in the prompt or the delta.
- **Contradictions:** none that needed a stop. The delta says "write from the reports and the code wherever they differ", and the
  prompt says the same.
- **The usual tension:** the prompt asks for the SQL inline in chat *and* for "only a two-line summary" in chat. As in earlier
  rounds, the final message gives the two lines, the SQL blocks, the confirmation and the filename last.
- **How I read the seven reports:**
  - Four read-only agents read the reports in full (pack-0 and law-1; pack-1 and 1b; pack-2; pack-4 and 5-6). Each checked every
    delta claim against them, with line references, and against the code.
  - I re-checked the points that mattered myself: the law report's §1 and §3 counts, `till_applies`, the key registration, the cron
    schedule and the grants (live).
  - I wrote packs 4 and 5-6 in this session.
- **Nothing written to the reports.**

## 1 · What changed in `docs/reference-manual.md`

| Where | Change |
|---|---|
| Line 1, front matter | V16.40 → V16.41 |
| `# Open items` heading | `(V16.41, 26 November 2026)` |
| Item 43 | V16.41 line: built (observe, not deployed); held until till-pack-3 enforces and the attestation is signed |
| Item 47 | V16.36 Have / Missing struck; V16.41: decided (build), what is built, the six steps left, the "don't tell French VAT trucks" rule |
| Items 60–64 (new) | 60 the till screens; 61 online walk-ups without a fingerprint; 62 Tap to Pay outside counter refunds / Q5; 63 a second archive store (decision); 64 the adviser questions |
| `# Changelog` | the V16.41 entry (§A, corrected per §3), OBSERVED block |
| V16.37 entry | "⛔ V16.41 records the till module." |
| §16 | new "The till tables and the reversal columns" (before §17) |
| §19 | "a sale counts on the day placed" struck in place → `event_date`; new "Daily totals dated by the trading day" |
| §37 | new "Reversals, counter refunds and Q5" (end of §37) |
| **Till module** (new top-level section, after §37, before §38) | status and reports; the chain; the guard and the sqlstates; reversals (pointer); closes; signing; the cron; the archive; the version; the drafts; tables, functions and grants; proofs and harnesses; decisions Q1–Q15; what till-pack-3 must do; screens |
| §41 | new "Step 1b — the final till archive, before anything is anonymised" (before step 2b) |
| §43 | the retention summary's "accounting 6 years" struck with a pointer; new "The accounting-records line" |
| §83.9 | "HatchGrab has neither." struck, with a pointer to the Till module and item 47 |

Nothing else changed. The diff removes 8 lines, each one struck and kept, and adds 515.

## 2 · Verify (§D): OBSERVED 26 Nov 2026, 08:59 UTC, read-only

**Git:**
- `france-vat-1` is checked out.
- origin/main is `5df925d8`, main is `59ae6161` (2 ahead of origin/main, 0 behind), and france-vat-1 is `ea4fb658`.
- `git rev-list --count main..france-vat-1` = **588**.
- The tag `till-module-1.0.0` is a lightweight tag on commit `ea4fb658`, and it is not on origin (`git ls-remote` is empty).

**SQL** (every statement is in the Appendix):

| Check | Observed |
|---|---|
| Till tables | 13, RLS on all; rows: `till_settings` 1, the other 12 **0** |
| Policies / grants | no policy on any till table; anon and authenticated: nothing; service role: SELECT on all 13, write only on `till_settings`, `till_failures`, `till_guard_events` |
| `till_settings` | `guard_mode` **observe**; `software_name` "HatchGrab, till module"; `software_version` **1.0.0**; `signing_key_id` **null**, no public key; updated 25 Nov 20:54 UTC |
| Triggers on `orders` | `orders_till_seal` (after insert), `orders_till_guard` (after update), `orders_till_guard_delete` (after delete) |
| Triggers on `order_payments` | `order_payments_till_chain` (after insert), `order_payments_till_guard` (after update), `order_payments_till_guard_delete` (after delete) |
| Triggers on `action_audit_log` | `action_audit_log_append_only` (before update, delete), `action_audit_log_no_truncate` (before truncate) |
| Triggers on `storage.objects` | `till_archive_objects_keep` (before update, delete) |
| | all enabled; also `trucks_till_identity` on `trucks`; 14 append-only triggers on the till tables |
| Bucket `till-archives` | public **false**, 524,288,000 bytes, `application/zip`; 0 objects; 0 storage policies name it; no `storage.objects` policy for anon or public |
| `order_payments` by kind | charge 882, refund 1, reversal 0; `reverses_payment_id` set on 0 rows; kind check `charge, refund, reversal` |
| Orders since 25 Nov | 0 (why the chain is empty) |
| Functions | 51 `till_*`, none executable by public / anon / authenticated; 12 by the service role |
| `place_order_atomic_v2` md5 | `e4b273abcf8e7609c6ca54033ed59332` (**as expected**) |

The **empty chain** is expected. The chain only grows when an order or payment is written. None has been written since the migrations
went live, and the baseline has not run.

## 3 · Where the delta and the reports or code differ (the manual follows the reports and the code)

1. **"12 changes folded into the packs (law report §3)."** The law report has **twelve gaps** (§1) and **fourteen changes** (§3).
   Thirteen of the changes go into packs; #14, the Inspection page, goes to the screens. Written that way.
2. **"rejected as first written on 25 Nov."** The first design was **written on 24 Nov**. `db-migrate.cjs` refused it (it updated
   `orders`, a protected table), and Dominic said no on 25 Nov. Written that way.
3. **The chain formula `prev_hash ‖ seq ‖ …`.** The code joins the five fields with a literal **`|`**
   (`v_prev || '|' || v_seq::text || '|' || …`; `till_verify`, `till-verify.cjs`). Written with `|`.
4. **"seals at acceptance, first payment, final state or the day's close."** Pack-1b built the first three. The **day-close seal came
   with till-pack-4** (`till_seal(…, 'day_close')`). A payment on a pending order also seals it. Written with the packs named.
5. **"no personal data."** That is true for customers. But the identity entries hold a **sole trader's legal name and address**, and
   account deletion cannot remove them (1b report; adviser question 9). Added as a caveat.
6. **The triggers "never write to `orders` or `order_payments`."** They also never write `trucks`. Added.
7. **"till_id prefers the device."** The actual order is **van → `web` → device → source → `unrecorded`**. The device wins only over
   the source (`manual`). Written that way.
8. **Q5 "a counter refund with the original method."** It covers `in_person_other` only (cash, or the truck's own card machine).
   Tap to Pay and online card money are not covered. Written that way (also item 62).
9. **§37 "`getOrderBalance` netting".** The primary netting is in **`readLedger`**. `getOrderBalance` is the defensive second layer,
   and `readOrderBalance` uses both. Every reader is listed.
10. **The 409.** The wording agrees exactly. The dashboard action route's catch-all answers in the default locale, not the truck's.
    Noted in the manual.
11. **The daily totals "always" match the Z.** They match **at each close**. In observe mode, an edit after a day's close changes
    that day's daily totals but not its Z (pack-4 report). Parity is permanent once till-pack-3 enforces. Written that way.
12. **Grand totals "from `till_started_at`".** No such column exists on trucks or settings. The start is the `till_start` chain
    entry (seq 1), which `till_closes.till_started_at` records. Written that way.
13. **"the public key in `till_settings`".** OBSERVED: `signing_key_id` and the public key are **null**. The first deployed run
    registers them (`till_register_signing_key`, in `close-run.ts` / `archive.ts`). The public key is in
    `docs/till-signing-public-key.md`. Written that way.
14. **"Dominic set [`TILL_SIGNING_KEY`] in Vercel Production on 25 Nov."** This is not in the reports: the pack-4 report says "not
    set". It is in Dominic's own till-pack-5-6 prompt, and `docs/till-signing-public-key.md` is dated 25 Nov. Kept, and not checked
    in Vercel.
15. **"the attestation will name 2.0.0".** The drafts in `docs/till/` name **1.0.0** (root 1). The till-pack-5-6 report (§12) is
    what says to sign naming 2.0.0 after pack-3's major bump. Written as "the drafts name 1.0.0; the report says sign naming 2.0.0".
16. **"Q1–Q15 as recommended in till-pack-0 §8."** Three exceptions:
    - Q1's recommendation (first payment, final state, day close) was **extended by law change 1** (seal at acceptance).
    - Q11 gained `gt_period` (law change 9).
    - Q15 had **no recommendation** in pack-0 ("your decision").

    Written as "with the law check's changes", plus a full Q1–Q15 table in the Till module section.
17. **Item 47 step (2), the baseline.** The signature is right (`till_baseline(p_truck text default null)`). But EXECUTE is revoked
    from every API role, service role included, so it runs **only as the database owner**, and it **writes** the till tables. The
    item now says "ask Dominic first".

    The suggested test archive must use a truck that is *in* the till. A demo truck is refused with HGT20.
18. **Item 47 step (3), "7 clean days".** The rule is from till-pack-0 (Q6): after till-pack-2 is deployed. Added.
19. **§C "The crons section".** The manual has **no crons section**. Crons are described where each feature is. `/api/cron/till-close`
    (hourly at **:15**, `vercel.json` `15 * * * *`) and the year-archive step are in the Till module section. The changelog says so.

**Not in the reports, kept as the delta has them** (the delta is the record of Dominic's chat):
- "hide the payment-recording buttons … accepted with 'go with your suggestions'". The law report (24 Nov) only recommends it.
- "decide [a second store] when the first French VAT-registered truck signs up". Pack-0's Q10 says "later".
- "approved 25 Nov" for the privacy line. Dominic's till-pack-5-6 prompt gives the wording; its date is the prompt's.

**Corrections to the delta's §B items:**
- **Item 64 (the adviser questions).** The texts of loi n° 2026-534 arts. 36 and 87 and CIBS L216-48 are not among the 10
  questions. They are the law report's §5 "Not checked". Written as "also give the adviser the texts…".
- **Q9 (item 64).** The law report asks whether the legal name **and address** *must* stay in the record for 10 years. Written
  with that wording.

**Also recorded** (from the code, not the delta):
- the till covers every non-demo truck in every country and VAT regime (`till_applies`);
- the email goes out in en-GB and **59** bases, while the privacy line was translated in the **54** bases in use;
- the service role can write `till_settings`, so a service-role call could change `guard_mode`. This is recorded as a fact in the
  grants paragraph; I added no new open item.

## 4 · Judgement calls

- **Where the Till module section sits:** as an unnumbered top-level section after §37, before §38. The delta says "next to the
  payments / tax sections", and the manual already has unnumbered top-level sections (e.g. "Venue creation…", between §25 and §26).
  Renumbering would have changed every later section's number.
- **New item numbers:** 60–64 (the delta asks for five new items; 59 was the highest in use).
- **Item 47:** "replace Have / Missing" is done by striking the V16.36 text and adding V16.41 below it (strike and point, never
  delete). The old "Keep" sentence is carried into the new text's last line.
- **§19:** the V16.35 bullet's "on the day placed" is struck in place. The new subsection says what replaced it.

## 5 · Commit

- **Staged and committed:** `docs/reference-manual.md` and `docs/manual-v16-41-report.md`, together.
- **Not staged:** other sessions' files: `docs/inbox-1/*`, `docs/plans-everywhere-5-report.md`, `docs/manual-v16-37/-39`,
  `docs/till-law-1`, `docs/till-pack-0` and the `scripts/fixtures/language-phase-*` files.
- **Also not staged:** `docs/till-pack-1/*` and `docs/till-pack-2/*`, which check runs re-export.
- **Not pushed, not deployed.**

## Appendix · Every SQL statement I ran (read-only, Supabase MCP)

```sql
select c.relname as table_name, c.reltuples::bigint as est, c.relrowsecurity as rls from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'till\_%' order by 1;
```
```sql
select json_build_object(
 'till_archive_signatures', (select count(*) from public.till_archive_signatures),
 'till_archives', (select count(*) from public.till_archives),
 'till_chain', (select count(*) from public.till_chain),
 'till_chain_heads', (select count(*) from public.till_chain_heads),
 'till_close_signatures', (select count(*) from public.till_close_signatures),
 'till_closes', (select count(*) from public.till_closes),
 'till_device_fingerprints', (select count(*) from public.till_device_fingerprints),
 'till_entry_actors', (select count(*) from public.till_entry_actors),
 'till_failures', (select count(*) from public.till_failures),
 'till_guard_events', (select count(*) from public.till_guard_events),
 'till_order_seals', (select count(*) from public.till_order_seals),
 'till_settings', (select count(*) from public.till_settings),
 'till_truck_settings', (select count(*) from public.till_truck_settings)) as counts;
```
```sql
select to_jsonb(s) - 'signing_public_key' as settings, (s.signing_public_key is not null) as has_public_key from public.till_settings s;
```
```sql
select c.relnamespace::regnamespace::text || '.' || c.relname as tbl, t.tgname, case when t.tgtype & 2 = 2 then 'before' when t.tgtype & 64 = 64 then 'instead' else 'after' end as timing, concat_ws(',', case when t.tgtype & 4 = 4 then 'insert' end, case when t.tgtype & 8 = 8 then 'delete' end, case when t.tgtype & 16 = 16 then 'update' end, case when t.tgtype & 32 = 32 then 'truncate' end) as events, case when t.tgtype & 1 = 1 then 'row' else 'statement' end as level, p.proname as fn, t.tgenabled from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid where not t.tgisinternal and (c.oid in ('public.orders'::regclass, 'public.order_payments'::regclass, 'public.action_audit_log'::regclass, 'storage.objects'::regclass)) and (t.tgname ilike '%till%' or p.proname ilike '%till%' or c.relname = 'action_audit_log') order by 1, 2;
```
```sql
select json_build_object(
 'bucket', (select json_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) from storage.buckets where id = 'till-archives'),
 'bucket_objects', (select count(*) from storage.objects where bucket_id = 'till-archives'),
 'storage_policies_naming_bucket', (select count(*) from pg_policies where schemaname = 'storage' and (coalesce(qual,'') ilike '%till-archives%' or coalesce(with_check,'') ilike '%till-archives%')),
 'storage_objects_policies_for_anon_or_public', (select json_agg(policyname order by policyname) from pg_policies where schemaname = 'storage' and tablename = 'objects' and (roles && array['anon','public']::name[])),
 'payments_by_kind', (select json_object_agg(coalesce(kind,'(null)'), n) from (select kind, count(*) n from public.order_payments group by kind) k),
 'reversal_rows_with_reverses_id', (select count(*) from public.order_payments where reverses_payment_id is not null),
 'v2_md5', md5(pg_get_functiondef('public.place_order_atomic_v2(jsonb,text,text,uuid,text,date,jsonb)'::regprocedure)),
 'orders_since_till_1', (select count(*) from public.orders where created_at >= '2026-11-25'),
 'trucks_with_till_started', (select count(*) from information_schema.columns where table_schema='public' and table_name='trucks' and column_name='till_started_at')
) as r;
```
```sql
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn, p.prosecdef as secdef, (select string_agg(distinct grantee::regrole::text, ',' order by grantee::regrole::text) from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type = 'EXECUTE' and a.grantee <> 0) as exec_roles, (select bool_or(a.grantee = 0) from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.privilege_type='EXECUTE') as public_exec from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'till\_%' order by p.proname;
```
```sql
select table_name, string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type) as grants from information_schema.role_table_grants where table_schema = 'public' and table_name like 'till\_%' and grantee in ('anon','authenticated','service_role') group by table_name order by table_name;
```
```sql
select (select count(*) from pg_policies where schemaname = 'public' and tablename like 'till\_%') as till_table_policies, (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace and c.relname like 'till\_%') as triggers_on_till_tables, (select string_agg(distinct c.relname, ',' order by c.relname) from pg_trigger t join pg_class c on c.oid = t.tgrelid where not t.tgisinternal and c.relnamespace = 'public'::regnamespace and c.relname like 'till\_%') as till_tables_with_triggers, (select string_agg(t.tgname, ',' order by t.tgname) from pg_trigger t where t.tgrelid = 'public.trucks'::regclass and not t.tgisinternal and t.tgname ilike '%till%') as trucks_till_triggers, (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'order_payments' and column_name in ('reverses_payment_id','reason')) as payment_cols, (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.order_payments'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%reversal%' limit 1) as kind_check;
```
```sql
select c.relname as tbl, r.rolname as role, has_table_privilege(r.oid, c.oid, 'SELECT') as sel, has_table_privilege(r.oid, c.oid, 'INSERT') as ins, has_table_privilege(r.oid, c.oid, 'UPDATE') as upd, has_table_privilege(r.oid, c.oid, 'DELETE') as del from pg_class c cross join pg_roles r where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname like 'till\_%' and r.rolname in ('anon','authenticated','service_role') and (has_table_privilege(r.oid, c.oid, 'SELECT') or has_table_privilege(r.oid, c.oid, 'INSERT') or has_table_privilege(r.oid, c.oid, 'UPDATE') or has_table_privilege(r.oid, c.oid, 'DELETE')) order by 1, 2;
```

The `information_schema.role_table_grants` query (the 7th) returned no rows, because that view shows only grants that involve the
current role's memberships. The `has_table_privilege` query (the 9th) is the one the grants findings rest on.

The tool loaded no other statements. The git checks were local commands:
- `git branch --show-current`;
- `git rev-parse` of origin/main, main and france-vat-1;
- `git rev-list --count` main..france-vat-1, origin/main..main and main..origin/main;
- `git rev-parse 'till-module-1.0.0^{commit}'`, `git cat-file -t`, `git ls-remote --tags origin till-module-1.0.0`.
