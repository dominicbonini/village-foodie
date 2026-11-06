# partners-1 — Admin › Partners

*5–6 November 2026. Commits on main: b8475e5a (migration), 9ae595c3 (the tab, routes, poll, compose mode, partners-add.cjs), 3c16b3e8 (proof, screenshots, registry). Not deployed.*

## Summary

- Admin › Partners is built. It's a new tab next to Outreach. The **left** side lists the organisations (search, filters for status, type and country, a **Due** button, and **Add**). The **right** side shows the selected organisation: every field editable in place, selectors for status, priority and follow-up, Offered / Outcome / Notes, a timeline, **Write email** and **Add note**.
- Emails to partners use the **same mail machinery** as truck outreach: the same mailbox account, From name, message builder, attachment store, SMTP send, Sent-copy filing, idempotency key and test path. They're recorded in `outreach_messages` with `partner_id`.
- The reply poll now also matches a partner's address. An address that belongs to **both** a prospect and a partner is filed to **neither**. It's listed, flagged, under "Check for replies now".
- Truck outreach is unchanged. Truck Today was run against fixtures with and without partner rows, and the output is identical. Matching with no partners gives exactly the old answer on all 23 cases. Every existing outreach check passes.
- Checks: `scripts/partners-1.cjs` passes all its checks, `scripts/partners-1-screens.cjs` passes 16 of 16, and the typecheck is clean. The full suite passed 196 of 198. The 2 failures were slow add-order timing checks that I didn't touch, and both pass when run alone (details under Checks).

## Decisions for you

None of these block anything. Each has a default in place.

1. **Opt-out line on partner emails.** Truck emails must carry the opt-out sentence: you signed that off for prospects. I have **not** required it for partners, because the brief says free-form with your normal signature. The opt-out insert button is still in the editor toolbar if you want it. If you want partner emails to require it, that's a one-line change in `ComposeWindow` (`if (partner) return null` in `optOutStop`) plus the same check in the partner route.
2. **"Import past emails" stays prospect-only.** Partner matching is in the **reply poll**, which runs every 10 minutes and on "Check for replies now". That's what picks up new replies, and it also records mail you send a partner from Outlook. The history importer only records mail from before the poll's start date, which is before partners existed. So older correspondence with an organisation won't be backfilled unless you want that added.
3. **No automatic retry for a partner send.** If a partner send fails, it shows **Retry** in the reading panel. The poll's automatic retry only touches truck rows.

## 1 · Diagnosis

**Data model**
- `outreach_messages` has one row per email, in or out.
  - Who: `prospect_id`, which was NOT NULL until now.
  - Status: `sending`, `sent`, `failed`, `uncertain`, `bounced`, `received`, `auto_reply`, `bounce` or `refused`.
  - Source: `system`, `mailbox_import` or `poll`.
  - Threading: `message_id` (unique), `in_reply_to`, `references`.
  - Bodies: `html_body`, `text_body`, and `attachments` (metadata or storage paths).
  - Mailbox: `account`, which is `hello` or `dominic`.
  - Also: `handled_at` and `snoozed_until` (for Today), `guard_override`, `refusal`, `idempotency_key`.
- `outreach_events` holds prospect notes and stage changes. `outreach_contacts` is the ladder.
- `outreach_settings` holds the signature, opt-out sentence, from name, poll watermarks and lock.
- **Do-not-contact is a flag, not a list.** It's `outreach_prospects.do_not_contact = true`, and the address is the truck's `discovery_trucks.contact_email`. Partner sends check the recipient against the contact address of every flagged prospect.
- Everything is RLS on with service role only, behind `verifyAdmin`.

**Sending**
- `app/api/admin/outreach/mail-send` runs every refusal, then inserts the row as `sending` with its Message-ID.
- `sendRow` (`lib/outreach-mail-deliver.ts`) does the nodemailer SMTP send from `accountForSend` (`dominic@` when configured), with the From name from settings.
- The Sent copy is filed after the answer (`fileCopyAndRecord` via `runAfter`).
- The browser sends a validated **document**, never HTML.
- Send is instant with Undo: an outbox (`lib/outreach-outbox.ts`) holds the email for 5 seconds.
- A test send goes to `OUTREACH_TEST_RECIPIENT`.

**Replies**
- `lib/outreach-mail-poll.ts` walks INBOX, Spam, Archive and Sent read-only for each account.
- Matching (`matchIncoming`) tries thread ids first (certain), then the From address (only if exactly one prospect has it).
- Out-of-office and bounces are classified separately.
- Unmatched and ambiguous mail is **only counted** and shown in the "Check for replies now" summary. That's where the new "both" list goes.

**Reusable as-is or with a flag**
- `EmailReadingPanel` and `EmailBody`: reused unchanged. The `view` action reads any row by id.
- `InlineField`: gained an optional `align="left"`. The default is the same, and the class string is unchanged.
- `RichEmailEditor`: unchanged.
- `outreach-shared`: `FIELD_CLS`, `LABEL_CLS`, `MAIL_STATUS_LABEL` and `mailStatusTone` reused.
- `ComposeWindow`: gained a `partner` mode flag (details below).

**Tied to truck concepts**
- `ComposeWindow`'s templates, snippets, step and kind, the Plans PDF, the opt-out block and the contact log.
- `ProspectTimeline`, which is built around the ladder, recorded steps and contacts. The partner timeline is a small list instead, reusing `RowLabelCell` and the reading panel.
- Demos, logos, screenshots and lead types live in `ProspectWorkspace` and `OutreachPanel`. None of them are used.

## 2 · Data — `supabase/migrations/20261074_partners_1.sql`

I committed the file and ran it with `npx -y -p pg@8.13.1 node scripts/db-migrate.cjs supabase/migrations/20261074_partners_1.sql`. It ran as one transaction with no error.

- **partner_orgs**: all the columns in the brief.
  - `type`, `status` and `priority` are CHECK-constrained to the brief's values.
  - `country_code` must be two upper-case letters.
  - Email is unique case-insensitively when present (`lower(btrim(email))`, partial index).
- **partner_events**: `kind` is `note` or `status`, with a shape check.
- **outreach_messages**:
  - added a nullable `partner_id` → `partner_orgs(id)`;
  - `prospect_id` NOT NULL dropped;
  - added CHECK `outreach_messages_one_owner`: `num_nonnulls(prospect_id, partner_id) = 1`.
  - Every existing row already satisfies it.
- RLS on both new tables, a "service_role only" policy, and all access revoked from anon, authenticated and public.
- No `outreach_templates` row was touched.

**Verify (read-only, Supabase MCP), before → after**

| check | before | after |
|---|---|---|
| outreach_messages rows / with prospect / with partner | 182 / 182 / – | 182 / 182 / 0 |
| fingerprint of every existing row (id, prospect, status, handled_at) | 94bf2caa… | 94bf2caa… (unchanged) |
| outreach_templates count / fingerprint | 12 / 9949335d… | 12 / 9949335d… (unchanged) |
| prospect_id / partner_id nullable | NO / – | YES / YES |
| one-owner constraint | – | `CHECK ((num_nonnulls(prospect_id, partner_id) = 1))` |
| RLS partner_orgs / partner_events | – | true / true |
| grants to anon / authenticated / PUBLIC | – | 0 |
| partner_orgs / partner_events rows | – | 0 / 0 |

`information_schema` now lists 32 columns on `outreach_messages`, including `partner_id`.

## 3 · The tab

- **Files**
  - `components/admin/PartnersTab.tsx`
  - `app/api/admin/partners/route.ts` (list, detail, create, update, status, note)
  - `app/api/admin/partners/mail-send/route.ts` (send, retry, attachment upload and download)
  - `components/admin/partner-outbox.ts`
  - `lib/partners.ts` (every rule, pure)
  - `lib/partner-mail-poll.ts`
  - The tab is mounted in `app/admin/page.tsx` next to Outreach. It mounts on first visit, then hides, so a half-written email survives switching tabs.
- **Left: the list**
  - Each row shows organisation, type, country, contact, a status pill and the follow-up date (amber when due). A high-priority partner gets a dot.
  - Search covers name, contact, email, region, website, notes and source.
  - Filters: status, type and country, plus **Due N** (follow-up today or earlier, using the London date).
  - Sort: follow-up date (no date last), then priority, then name.
  - **Add** opens the short form: name, type, country, website, contact name and role, email, priority, notes.
- **Right: the selected organisation**
  - The header shows the name (editable), type, **status**, priority, follow-up date, **Write email** and **Add note**.
  - The fields column holds every field as an `InlineField`, plus Offered, Outcome and Notes.
  - The timeline shows emails both ways, notes and status changes, newest first. A failed, uncertain or bounced email gets a badge.
  - Clicking an email opens the outreach **reading panel**, with Reply (for an inbound email) or Retry (for a failed one).
  - **Status:** only these two moves are automatic:
    - a real (non-test) send the server accepted moves `to_contact` → `contacted`;
    - a reply received moves `contacted` → `replied`.
  - An email sent from Outlook to a partner counts as an email sent.
  - Every change, manual or automatic, writes a `partner_events` row. Updates are filtered on the old status, so two tabs can't double-log.
  - The edit action refuses a `status` key, so status can only change through the logged path.
- **Write email: `ComposeWindow` with `partner={{ id }}`**
  - What's shown: To (prefilled), Subject, the body with your normal signature already in it, and Attach file. Attachments go to `partners/<id>/` in the same private bucket.
  - What's hidden: template chips, the snippet and placeholder panel, sequence step and kind, Plans PDF, opt-out block, demo, logo and screenshots.
  - Send goes through a partner outbox with the same 5-second Undo, to the partner route.
  - **Without `partner`, every expression is the old one.** The legal-footer, instant-send and reply-attach checks pass unchanged, and a rendered default-mode window still shows the chips and the Plans PDF.
- **Partner route refusals, all before anything is written or sent**
  - an address on the do-not-contact list (the recipient or the partner's own);
  - the do-not-contact list can't be read;
  - no address;
  - the document fails the truck route's own `validateDoc` or `literalTokenRefusal`;
  - no subject;
  - an attachment that isn't in this partner's folder;
  - an oversized attachment set.
  - A reply's To must be the partner's address or the sender of the email being answered.
- **Replies in the poll**
  - `matchIncoming` and `matchOutgoing` are called exactly as before. `addPartnerMatch` then layers partners on top, in this order:
    1. a prospect thread id wins (unchanged);
    2. then a partner thread id;
    3. then the From address: partner only → **partner**; prospect only → as before; **both** → neither, added to `summary.prospectAndPartner`.
  - The "both" list shows under "Check for replies now" in an amber ⚑ box with the address, subject, date and folder. It renders only when the list isn't empty.
  - A partner's inbound row is written with `handled_at` set and **never** writes `outreach_contacts`.
  - Bounces of partner emails mark the original `bounced`.
- **Layout**
  - Laptop (1440): list 380px; fields 320px; compose, notes and timeline fill the rest (the editor box is the Outreach default, ~300px, with ⤢ for full height). Write email and Add note are visible without scrolling.
  - Monitor (2560): list 440px, fields 380px; the timeline and editor take the remaining ~1,600px.
  - The reading panel is 792px wide on the laptop and 960px on the monitor.
  - At 1440 the header's two buttons wrap onto a second line.
- **Bulk add: `scripts/partners-add.cjs <file.json> [--apply]`**
  - It's a dry run by default; `--apply` inserts.
  - It skips rows whose email (case-insensitive) or name + country already exists, in the table or earlier in the same file.
  - It lists invalid rows, ignores any `status`, never updates, and prints what it added.
  - It's registered as `operational_refused`, so no sweep runs it.

## 4 · Truck outreach unchanged — the proof

These checks are in `scripts/partners-1.cjs` §I and §E:
- **Today, before and after, with fixtures.** The Today route was compiled from **b5a43927** (before partners-1) and from the working tree, and run against an in-memory table with its Supabase client replaced.
  - Before (truck rows only): 1 waiting, 1 problem, 1 snoozed.
  - After (truck rows **plus** a partner's unhandled reply and failed send): **identical JSON**.
  - Broken variant: the old route given the partner rows **would** show them. So the new `prospect_id is not null` filter is what keeps Today identical.
- **Counts.** The list route's bounced set now carries the same filter and ignores a partner's bounce. The contact-to-email map can't contain a partner row, because partner rows have no `contact_id`.
- **Census.** I classified all 72 `outreach_messages` reads in the 10 truck-outreach files. Each one is either:
  - keyed to a prospect, a row id, a Message-ID or a `contact_id`;
  - filtered; or
  - named as harmless to a partner row (probes, the poll's directory, body backfill, housekeeping).
  - Broken variant: an unkeyed read of all inbound mail is flagged.
- **Matching equivalence.** With no partners, `matchIncomingWithPartners` returns exactly `matchIncoming`'s answer on 18 cases, and `matchOutgoingWithPartners` matches `matchOutgoing` on 5.
- **The required trio.** A prospect's address goes to that prospect, a partner's to the partner, an address in both to neither (flagged), and one in neither stays unmatched.
- Two more truck-side safeguards: housekeeping's automatic retry is gated on `row.prospect_id`, and the poll's directory falls back to the old select if `partner_id` can't be read.

## 5 · Checks

- **`node scripts/partners-1.cjs`** passes all its checks, covering:
  - add and edit;
  - status changes logged;
  - the two automatic moves (fake table: only `to_contact` moves on a send, only `contacted` on a reply, one event each);
  - Due and sort (including London dates);
  - reply matching and the poll's handling: idempotent, an out-of-office moves nothing, never writes the ladder;
  - do-not-contact, checked before the insert;
  - free-form compose, **rendered in WebKit**: no Template, Plans PDF or opt-out block; signature present; Send posts to `/api/admin/partners/mail-send` with `partner_id` and no `prospect_id`, kind, override or template field. The POST was captured by a stub — **no email was sent**;
  - partners-add dedupe;
  - truck unchanged.
  - It uses fixtures and an in-memory database only, and never touches real prospects or real `outreach_messages` rows.
- **`node scripts/partners-1-screens.cjs`** passes 16 of 16, in Chromium and WebKit at 1440×900 and 2560×1440. Screenshots are in `docs/partners-1/`:
  - `<engine>-detail-<w>.png` — the list and the selected organisation;
  - `<engine>-compose-<w>.png` — Write email open;
  - `<engine>-reading-<w>.png` — a reply open in the reading panel.
- **Typecheck:** `npx tsc --noEmit` is clean.
- **Lint:** no problems in any new file. The edited files still have 30 older problems (27 errors, 3 warnings), all on lines outside my changes (for example `any` in `outreach/route.ts`, set-state-in-effect in `ComposeWindow:441`).
- **Full suite:** `node scripts/run-harnesses.cjs` ran 198, **196 passed, 2 failed**: `add-order-refresh-inputs.cjs` and `add-order-refresh.cjs`.
  - I didn't touch either. They test `AddOrderPanel` and `lib/capacity-refresh`, and are slow timing checks (224s and 50s).
  - Both passed in the earlier baseline run and **both pass when run alone** (re-run 6 November). The suite run overlapped my browser runs, so this looks like load.
- **Existing checks I had to change.** These two changes were forced by the schema and tab changes, not by behaviour:
  - `outreach-schema-census.cjs` pins the live `information_schema` column list. I re-pinned it from a read-only query to 32 columns: `partner_id` is new, and `refusal` had already been applied, so it moved out of "proposed". It's marked "RE-PINNED 5 November 2026".
  - `country-settings-parity.cjs` compares the admin tab bar. I added a named allowance for the single label "🤝 Partners" after Outreach, the same way it already allows "🌍 Countries"; the rest of the tab bar is still compared exactly.
- **Code changes made to keep existing checks passing.** Several outreach checks look for specific lines in the source. I kept those lines exactly and put the partner branch next to them, rather than editing the checks:
  - the queue call in `sendNow`;
  - the `optOutShown` line;
  - the chase early-return;
  - the poll's `matchIncoming({ get: h.get…` and `dir.byMessageId.has(m.messageId)`.

## Rules kept

- No deploy. Commits on main by explicit paths only.
- No `.env*` file was opened, read or listed. `db-migrate.cjs` and `partners-add.cjs` read their own variables.
- No real email was sent, and no real prospect or `outreach_messages` row was changed.
- Nothing touches trucks, orders, payments or public pages.
- The other session's files were left alone.
- No part of the brief arrived garbled, and no two instructions contradicted each other. The "results inline in chat" and "two-line chat summary" instructions were reconciled: the migration SQL and verify results went in a chat message during the run, and the final message is the two-line summary.

## Undo (only if Dominic asks)

```sql
-- Only after deleting any partner emails: the one-owner check means partner rows have no prospect.
begin;
alter table public.outreach_messages drop constraint if exists outreach_messages_one_owner;
delete from public.outreach_messages where partner_id is not null;
alter table public.outreach_messages drop column if exists partner_id;
alter table public.outreach_messages alter column prospect_id set not null;
drop table if exists public.partner_events;
drop table if exists public.partner_orgs;
commit;
notify pgrst, 'reload schema';
```
The code revert is `git revert 3c16b3e8 9ae595c3`.
