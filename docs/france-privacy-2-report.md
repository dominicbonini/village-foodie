# france-privacy-2 — account deletion deletes the trucks' WhatsApp history at once and clears card drafts' customer details

24 November 2026. Branch `france-vat-1`. Starting commit (START): `1bace5d4`. **Committed locally; not pushed, not deployed.**

## Status: DONE

| Part | Status |
|---|---|
| **1 · WhatsApp history deleted at account deletion** | **DONE.** New step 2c deletes the account's trucks' `whatsapp_logs` and `messages` rows, by `truck_id`. |
| **2 · Card drafts' name, email and phone cleared** | **DONE.** New step 2d clears every draft of the account's trucks, promoted or not, to `'[deleted]'`, null, null (the same as orders). |
| **Proof** | `scripts/france-privacy-2.cjs` **36 passed, 0 failed** (in memory only). `france-privacy-1.cjs` re-pinned (2 checks), 47/0. The 53 related harnesses match START (§6). |
| **Manual** | Open item 53 struck, a V16.36 changelog bullet added, and §41's per-table list updated. |

- **No database change was needed, and nothing was written to the database.** The only SQL was three read-only SELECTs (§7).
- Account deletion was **never run against the live database**.
- **Nothing customer-facing changed.**
  - In `app/`, `components/`, `messages/` and `content/`, nothing differs from START.
  - The only code change is `lib/account-deletion.ts`.
  - The admin execute route's JSON answer gains the two new result fields. That route is admin-only.
- No `.env` file was opened. The landing page and `outreach_templates` are untouched.
- **Other sessions' files** were not staged or changed: `docs/plans-everywhere-5-report.md` and the untracked compare-* and other reports.

## 0 · Prompt check

- **Garbled spans:** none.
- **Contradictions:** none.
- **Stop conditions checked, and none applies:**
  - both tables link reliably to a truck (§1);
  - no reader needs the rows once the account is deleted (§2);
  - the new behaviour does not contradict the privacy policy (§4).
- **Interpretation 1, the draft placeholder:** drafts get the same values as orders, `'[deleted]'`, null, null, as the prompt says.
  - Retention writes null for a draft's name.
  - All three draft columns are nullable, so `'[deleted]'` respects every NOT NULL rule.
  - A draft whose name was already null also becomes `'[deleted]'`, as every order does.
- **Interpretation 2, all channels:** `messages` holds all of a truck's channels (`whatsapp`, `sms`, `email`). The prompt says to delete the trucks' rows in `messages`, so every channel goes; live today there are 0 rows.

## 1 · How each table links to a truck

These are read live from `information_schema` and `pg_constraint` (§7).

| Table | Link | Foreign key | Other columns |
|---|---|---|---|
| `whatsapp_logs` | `truck_id text` (nullable) | `whatsapp_logs_truck_id_fkey`: `FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE CASCADE` | id uuid, customer_number, message_in, classification, events_found, response_sent, possible_miss, created_at |
| `messages` | `truck_id text` (nullable) | `messages_truck_id_fkey`: `FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL` | id bigint, order_id text (no FK), direction, channel (`whatsapp` / `sms` / `email`), from_number, to_number, body, inbound_message, created_at |
| `order_drafts` | `truck_id text` **NOT NULL** | — | customer_name, customer_email, customer_phone: all **nullable** text |

**Is the link reliable?** Yes.
- **The writers always set it:**
  - `whatsapp_logs` is written by the Meta webhook (`app/api/webhooks/meta/whatsapp/route.ts`, three inserts) and the Twilio webhook (`app/api/webhooks/whatsapp/route.ts`), always with `truck_id: truck.id`;
  - `messages` is written only by `lib/twilio.ts` `logMessage`, whose three callers (the Twilio webhook) all pass `truckId: truck.id`.
- **Live (24 Nov):** `whatsapp_logs` has 17 rows, 0 without a truck, across 2 trucks; `messages` has 0 rows.
- **Not used as a link:** `messages.order_id`. No code writes it today, and it has no FK.

## 2 · Every reader checked

| Reader | What it reads | After account deletion |
|---|---|---|
| `app/api/manage/route.ts` (Settings, WhatsApp usage line) | count of `whatsapp_logs` with a reply this month, `eq('truck_id', truck.id)` | per truck; the account is gone, so no one can open Manage |
| `app/api/manage/route.ts` `get_report` (Reports) | `classification, possible_miss` per truck per day | per truck; same as above |
| `app/api/webhooks/meta/whatsapp/route.ts` (the reply caps) | the customer's last 24 h and the month's count, per truck | the truck lookup requires `active = true`, and step 4 sets `active: false`, so nothing is sent or counted; a reset counter can't matter |
| `app/api/webhooks/whatsapp/route.ts` (Twilio) | none (writes only) | its truck lookup also requires `active = true` |
| `lib/whatsapp-classifier.ts` | none (a dormant follow-up read, `isFollowUp: false` today) | — |
| `lib/order-retention.ts` / `app/api/cron/order-retention` | deletes both tables' rows older than 12 months | still runs and finds fewer rows; unchanged |
| `lib/delete-truck.ts` (`deleteTruckCascade`, demo trucks only) | `whatsapp_logs` cascades; `messages.truck_id` set null | unchanged; never called by account deletion |
| `app/api/manage/whatsapp-preview/route.ts` | writes nothing and reads no log row | — |
| Billing (`lib/billing/`), Meta compliance, accountant reports | **none read either table** (grep of `app/`, `lib/`, `components/`, `supabase/functions`) | — |
| `messages` | **no reader at all** in the code, apart from retention's delete | — |

Harnesses also read these tables, but only in-memory fixtures (§6).

## 3 · What changed (files)

- **`lib/account-deletion.ts`:** two new steps after 2b, before 3 (staff). The existing step order, named steps and re-runnability are kept.
  - **2c · WhatsApp history.** For `whatsapp_logs`, then `messages`, and for each of the account's trucks: `delete().eq('truck_id', truckId).select('id')`. The count goes into `whatsappDeleted`.
    - Named step: `delete_whatsapp:<table>:<truckId>`.
    - A second run finds nothing to delete.
  - **2d · Card drafts' customer details.** For each truck: `update({ customer_name: '[deleted]', customer_email: null, customer_phone: null }).eq('truck_id', truckId)`. These are the same values as step 2, on every draft, promoted or not; the count goes into `draftsAnonymised`.
    - Named step: `anonymise_drafts:<truckId>`.
    - A re-run writes the same values.
  - **The result** gains `whatsappDeleted: { whatsapp_logs, messages }` and `draftsAnonymised`. The header comment gains one line.
  - Still never calls `deleteTruckCascade`, and still never deletes an order, draft, payment, truck or operator.
- **`scripts/france-privacy-2.cjs`** (new; registered in `scripts/harnesses.json` after france-privacy-1).
- **`scripts/france-privacy-1.cjs`:** re-pinned, two checks (§5).
- **`docs/reference-manual.md`:**
  - Open item 53 struck: "⛔ Done V16.36 (france-privacy-2): both, as decided by Dominic 24 Nov".
  - One france-privacy-2 bullet in the V16.36 changelog entry.
  - §41 "What deletion does, per table": `order_drafts` (⛔ name, email and phone now cleared), new `whatsapp_logs` and `messages` rows (DELETED, step 2c), and the WhatsApp row of the where-notes-live table.
- **`docs/france-privacy-2-report.md`:** this report.

## 4 · The legal wording checked (not edited)

From `content/legal/privacy-policy.md`, byte-identical to START:

- **Section 7:** "**WhatsApp messages your customers send a truck, and our automatic replies:** 12 months." and "We delete or anonymise data once these periods end."
- **Section 7:** "**Operator accounts:** for as long as the account is active, and for 12 months after it closes."
- **Section 8:** "**Deleting your account.** Operators can request account deletion from within the app or by emailing privacy@hatchgrab.com. We will delete your account and personal data, except where we are required to retain records for accounting or legal reasons. When an operator's account is deleted, we also remove their customers' names, contact details and notes from the orders we keep."

**No contradiction:**
- **WhatsApp:** section 7's 12 months is the longest we keep the messages. Deleting them at account deletion is sooner, and is what section 8 already promises ("We will delete your account and personal data").
- **The "Operator accounts" line** is about the operator's own account data, and account deletion's existing steps are unchanged. The WhatsApp rows are customers' correspondence, which section 7 lists separately.
- **Drafts:** clearing their names, emails and phones goes further than section 8's "from the orders we keep", and in the same direction. No wording says drafts keep them. Section 7 deletes unfinished card orders within a day of expiring anyway.

## 5 · Re-pins (by name)

`scripts/france-privacy-1.cjs` §A, both marked `⚠️ RE-PINNED (france-privacy-2, 24 November 2026, …)`:

1. **"the drafts: every column but the notes …"**
   - It asserted drafts' name, email and phone were *not* cleared, as at its START. Step 2d now clears them, by Dominic's decision on item 53.
   - Those three columns are now set aside in the START comparison. The check asserts `'[deleted]'`, null, null on the account's drafts, and the other account's values as START. Every other column is compared as before, and the label is updated to match.
2. **"the result reports the notes cleared …"**
   - Its comparison with START's result now also leaves out the two new fields, `whatsappDeleted` and `draftsAnonymised`, which france-privacy-2 proves.

No other harness was changed.

## 6 · Proof

**`scripts/france-privacy-2.cjs`: 36 passed, 0 failed.** It runs in memory on paperwork-1's fake database, never live. It runs this tree and START (`1bace5d4`, extracted from git) on the same seed.

**The seed:**
- an account with two trucks (tA, tB) and another account's truck (tX);
- `whatsapp_logs` and `messages` rows for all three (including an sms row);
- card drafts with customer details: promoted, unpromoted and already blank on the account, plus one on tX;
- old- and new-style orders with notes, and order_payments.

**§A, after account deletion:**
- The account's 3 `whatsapp_logs` and 3 `messages` rows are gone. tX's rows are byte-identical to the seed.
- All 5 of the account's drafts read `'[deleted]'`, null, null. Every other draft column is byte-identical to START's result (2b's notes as before). tX's draft is untouched.
- Orders are byte-identical to START's result, covering step 2 and france-privacy-1's notes step. order_payments are byte-identical to the seed and never written.
- Operators, trucks and staff end exactly as START's run left them.
- **Nothing else is deleted:** every table keeps START's row count except the two WhatsApp tables (−3 each). Apart from those, the only deletes are exactly START's (staff, paperwork, loyalty, tokens), and none touches an order, draft, payment, truck or operator.
- **The result:** `whatsappDeleted {"whatsapp_logs":3,"messages":3}`, `draftsAnonymised 5`; every other figure equals START's.
- **Twice:**
  - a second run leaves every table byte-identical, with a zero count;
  - a recovery re-run with the trucks still on the account deletes nothing and changes no order, draft, payment or WhatsApp row.
- **A failing step throws its named step, and a re-run finishes the job** (the same end state as a clean run). Tested on:
  - `delete_whatsapp:whatsapp_logs:tA`
  - `delete_whatsapp:messages:tA`
  - `anonymise_drafts:tA`
  - `clear_notes:order_drafts:…` (2b, unchanged)

**§B, the code:**
- the order is 2b → 2c → 2d → 3;
- deletes come only from the two tables, by `truck_id`;
- 2d's values match step 2's;
- the named steps are in place;
- there is no `deleteTruckCascade` and no order/draft/payment/truck delete;
- the rest of `lib/account-deletion.ts` is byte-identical to START (only the two steps, two result fields and a header line added);
- `lib/order-retention.ts`, the admin execute route, the retention cron route and both legal documents are byte-identical to START;
- the policy still holds the three sentences quoted in §4.

**Related harnesses, at START (a worktree at `1bace5d4`, this folder's `.next` linked) and on this tree, through `scripts/run-harnesses.cjs --list`:**

| Group | Harnesses | START | This tree |
|---|---|---|---|
| Account deletion, retention, WhatsApp, and their shared helpers (37) | anz-1, address-formats-1, private-events, schedule-graphics-places, whatsapp-background-jobs-harness, whatsapp-settings-row-harness, country-settings-parity, money-sweep-parity, phone-parity, time-dates-parity, phase3-screens, us-rehearsal-fixes, us-polish-batch, legal-follow-ups, canada-1, languages-1, france-1, europe-languages-1, messages-parity, language-phase-1a/1b/1c/2/1d/1d2/1e, language-phase-1e-tidy, competitor-features-2, paperwork-1, loyalty-1, costs-accounts-1, contact-1, email-sender-1, inbox-1, france-records-1, france-notes-1, france-privacy-1 | 11 fail | 12 fail: the same 11, plus france-privacy-1 (the 2 checks in §5; **47/0 after the re-pin**) |
| Harnesses that read the registry or legal pins (15) | plans-data-model, ops-write-guard, us-legal-draft, badges-manual-1, world-countries-2, world-countries-3, faq-1, tidy-1, copy-truth-1, billing-1/2/3, enquiries-backend-1, inbox-2, france-receipts-1 | 4 fail | the same 4 |
| Not registered (run directly) | whatsapp-approved-only-1 | 17/0 | 17/0 |

- **Every failure is identical, check line by check line, at START and on this tree.** All of them were already failing before this work:
  - country-settings-parity, france-1, language-phase-1b/1c/1d/1d2/1e/2 and loyalty-1;
  - costs-accounts-1 77/1 and contact-1 252/1 (the planTable files);
  - faq-1 (the same git output), tidy-1 ("no code reads a trucks.is_test"), billing-1 130/1;
  - inbox-2 45/1 (its dry-run check, see below).
- **`compare-fix-2.cjs` was not run.** The runner's screen refuses it (`createClient; SUPABASE_SERVICE_ROLE_KEY`) at START and now. It is another session's file and reaches the live database, so I left it out. That screen refusal is also why `--dry-run` refuses the whole registry, and why inbox-2's dry-run check fails, the same at START. `france-privacy-2.cjs` passes the screen.
- **Type-check:** clean. **ESLint:** clean on `lib/account-deletion.ts`, `scripts/france-privacy-2.cjs` and `scripts/france-privacy-1.cjs`.

## 7 · SQL run (all read-only; nothing written)

```sql
select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name in ('whatsapp_logs','messages','order_drafts') order by table_name, ordinal_position;
```
```sql
select conrelid::regclass as tbl, conname, contype, pg_get_constraintdef(oid) as def from pg_constraint where conrelid in ('public.whatsapp_logs'::regclass, 'public.messages'::regclass) or (confrelid in ('public.whatsapp_logs'::regclass, 'public.messages'::regclass)) order by 1, 2;
```
```sql
select 'whatsapp_logs' as tbl, count(*) as total, count(*) filter (where truck_id is null) as no_truck, count(distinct truck_id) as trucks from public.whatsapp_logs
union all select 'messages', count(*), count(*) filter (where truck_id is null), count(distinct truck_id) from public.messages;
```

**Results:**
- the columns and constraints are as in §1;
- `whatsapp_logs`: 17 rows, 0 without a truck, 2 trucks;
- `messages`: 0 rows.

## 8 · Left undone, and limits

- **Not deployed.** The deployed code still leaves the WhatsApp rows and the drafts' details until you deploy.
- **The admin dry-run preview** (`app/api/admin/execute-account-deletion` without `execute: true`) still lists only its existing counts. It doesn't preview how many WhatsApp rows or drafts will be touched. The executed result reports both. Say if you'd like them in the preview too; it's an admin-only change.
- **A card payment in flight at the moment of deletion:** if Stripe confirms it afterwards, the promoted order takes the draft's cleared details (`'[deleted]'`, no email), so no confirmation email goes out. The truck is already inactive by then, so this is in keeping with the deletion.
- **`messages` rows with no `truck_id`**, if any were ever written, can't be tied to an account and aren't touched. There are none live, and no writer omits it.
- **Retention later:** a draft older than 12 months that reads `'[deleted]'` gets one more retention write, setting the name to null, as retention already does to orders' `'[deleted]'`. This is harmless and unchanged.
