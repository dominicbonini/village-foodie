# Outreach Send: instant, with Undo — and the server still decides

**Date:** 15 October 2026.

**Branch:** `main`, working tree, not committed. Nothing was pushed or deployed.

**SQL:** one migration, written and **not run** (§6). Until it is run, everything works as before, except that a refused send is not yet recorded or flagged.

**Emails:** none were sent. Every database read I made was a `select`. No `outreach_templates` row was touched.

**Garbled or contradictory instructions:** none.

**One thing needs you before the localhost timing can run (§1):** `.env.local` has no `OUTREACH_PRIMARY_USER` and no `OUTREACH_TEST_RECIPIENT`, so localhost cannot send at all.

---

## 1 · Where the time went (measure first)

**What I could measure, and what I could not.** The send route needs a signed-in admin. Locally it also needs two settings that are absent:
- `OUTREACH_PRIMARY_USER` — the mailbox password is present, but not the user;
- `OUTREACH_TEST_RECIPIENT`.

Without them the route refuses before any mail server is contacted, so three timed Send tests on localhost were not possible. I did not invent those values or edit `.env.local`. Instead:

- **Measured, three runs:**
  - every database read the route makes for a real send to ZZ Test Prospect (Dominic), read-only;
  - the TLS connection set-up to the mail host (`mail.privateemail.com`), with no login and no send.
- **Read from the code:** the steps after the SMTP send, including the fixed waits.

| Step (in order) | Run 1 | Run 2 | Run 3 | Notes |
|---|---:|---:|---:|---|
| Table probe | 86 ms | 116 ms | 71 ms | measured |
| Idempotency lookup | 89 | 62 | 49 | measured |
| Prospect + truck | 74 | 70 | 35 | measured |
| Sender name (settings) | 46 | 54 | 38 | measured |
| Guards: contact history | 53 | 47 | 32 | measured |
| Guards: sent emails | 46 | 58 | 37 | measured |
| Guards: same address elsewhere | 40 | 39 | 39 | measured (plus up to 2 more reads when shared) |
| Thread parent / emailed-before | 84 | 103 | 70 | measured (two reads) |
| **All database reads before the send** | **≈ 520** | **≈ 550** | **≈ 370** | sequential |
| Insert the message row | — | — | — | one write, ~50–90 ms by the same round trip |
| SMTP: TLS handshake | 304 | 310 | 298 | measured |
| SMTP: to the server's banner | 449 | 462 | 448 | measured |
| SMTP: EHLO, AUTH, MAIL/RCPT, DATA, QUIT | — | — | — | not measurable without the login; ~5–6 round trips at ~150 ms ≈ **0.8–1.2 s** |
| **Sent copy:** IMAP TLS + greeting | 442 | 459 | 442 | measured |
| Sent copy: LOGIN, SELECT, SEARCH | — | — | — | ~3 round trips ≈ 0.5 s (estimate) |
| Sent copy: **fixed wait when the first search misses** | — | — | — | **3,000 ms** (`SENT_REFETCH_DELAY_MS`, lib/outreach-mail-deliver.ts) |
| Sent copy: second SEARCH (+ APPEND if still absent) | — | — | — | ~0.2–0.5 s (estimate) |
| Contact log (insert + stage/lead-type writes) | — | — | — | 2–4 writes ≈ 0.2–0.3 s (estimate) |

**What it adds up to.**
- **Before this change,** the button waited for all of it. That is about 0.5 s of reads, plus 1.3–1.7 s of SMTP, plus **1 s to 4.5 s for the Sent copy**, plus the contact log. Several seconds, and the Sent copy's fixed 3-second wait was the largest single item whenever Namecheap had not filed the copy by the first search. On Vercel a cold start comes on top.
- **Now,** the window closes the moment Send is pressed, and the request goes out 5 s later. The server answers as soon as SMTP accepts (reads + SMTP, ≈ 1.5–2 s). The Sent copy and the contact log run after that answer.

**To take the three timed runs yourself:**
1. Add these three lines to `.env.local`:
   - `OUTREACH_PRIMARY_USER` — the mailbox address;
   - `OUTREACH_TEST_RECIPIENT` — your own address;
   - `OUTREACH_SEND_TIMING=1`.
2. Run `npm run dev`.
3. On ZZ Test Prospect (Dominic), press **Send test to me** three times.

The terminal prints two lines per send: `[send-timing] sent {…}` with every step up to the SMTP answer, and `[send-timing] after {"Sent copy": …, "contact log": …}`.

**The timing flag stays in the code, off by default** (`lib/outreach-send-timing.ts`). Unset, it does nothing and adds nothing to the answer.

---

## 2 · Instant Send with Undo

**Pressing Send** (the existing "Send it" confirm, after the existing placeholder and follow-up warnings) **closes the compose window at once.** A toast says **"Sending… Undo"** for 5 seconds.
- `lib/outreach-outbox.ts` holds the send.
- `components/admin/OutboxToasts.tsx` draws the toast on the prospect page and the outreach list, so it survives moving between them.

**Undo within the 5 seconds:**
- **Nothing is sent.**
- The compose window re-opens **exactly as it was**: the template, both subject/body layers, placeholder values, edits, the edited document, the attachments, "include previous email" and the reply target. They are restored from a snapshot taken at the press (`ComposeSnapshot`).
- If you have moved to another page, Undo takes you back to the prospect and re-opens the window there.

**After 5 seconds** the request goes out: the same request the window always built.
- **The idempotency key is made when Send is pressed** (`crypto.randomUUID()`), one per send.
- **The server refuses a repeat key.** It answers with the first send's status and sends nothing.

**If the tab is closed during the 5 seconds, nothing is sent.** That is the same as Undo. The hold is a page timer, with no beacon and no keepalive request.

**The timeline shows the held send straight away** as **"Sending…"**, with its subject and recipient. When the server answers, the page re-reads its lists and the real row replaces it.

---

## 3 · The server still decides

Every check runs on the server **before the mail server is contacted**, in exactly the order it did before. Only what a refusal leaves behind is new (§4).

| # | Guard | Where |
|---|---|---|
| 1 | The messages table must exist | `app/api/admin/outreach/mail-send/route.ts:299` |
| 2 | Mailbox credentials set | `route.ts:309` |
| 3 | Test recipient set (test sends) | `route.ts:314` |
| 4 | **Repeat idempotency key** → the first send's verdict, nothing sent | `route.ts:532` |
| 5 | Prospect readable | `route.ts:545` |
| 6 | **Do-not-contact, no address, linked HatchGrab truck** (`prospectRefusal`, `lib/outreach-send-rules.ts:62-64`) | `route.ts:601` |
| 7 | Reply: the message being answered belongs to this prospect and is not a test (`replyParentRefusal`) | `route.ts:622` |
| 8 | Reply: the recipient is the truck's own address or one that wrote to us (`replyRecipientRefusal`) | `route.ts:633` |
| 9 | The document passes the schema (`validateDoc`) | `route.ts:646` |
| 10 | The body is not empty | `route.ts:649` |
| 11 | **A literal `{{signature}}`, `{{opt_out}}` or `{{plans_pdf}}`** (`literalTokenRefusal`, `lib/outreach-doc.ts:637`) | `route.ts:655` |
| 12 | A malformed token (`malformedTokensIn`) | `route.ts:664` |
| 13 | A must-resolve token unresolved (`{{demo_link}}`) | `route.ts:666` |
| 14 | **The history reads**: an unreadable history asks rather than guesses (`guardHistoryUnreadable`) | `route.ts:741-793`, `lib/outreach-sequence.ts:261` |
| 15 | **The sequence guards** (`evaluateGuards`, `lib/outreach-sequence.ts:349`): `guardAlreadySent` :195, `guardUnattributed` :220, `guardNotDue` :276, `guardAfterFinal` :316, `guardSharedAddress` :295 — overridable only by ids the operator answered | `route.ts:912-926` |
| 16 | Reply with no stored body to quote | `route.ts:974` |
| 17 | Chase whose earlier email cannot be found (two places) | `route.ts:998`, `route.ts:1021` |
| 18 | A first contact needs a subject | `route.ts:1024` |
| 19 | Attachments too big | `route.ts:1034` |
| 20 | An attachment missing from storage | `route.ts:1038` |
| 21 | The message row could not be recorded | `route.ts:1104` |
| — | **The provider call** (`sendRow`) — after all of the above | `route.ts:1121` |

The harness asserts that order from the source: all 15 recorded refusals and `evaluateGuards` sit above `sendRow`. It also asserts it at run time: do-not-contact, a linked truck, no address, a literal `{{plans_pdf}}` and a malformed token each send nothing.

**What moved after the provider confirms** (`runAfter` → Next's `after()`, `lib/outreach-after.ts`):
- the **Sent-folder copy** (`fileCopyAndRecord` — the IMAP session and its fixed 3-second wait);
- the **contact log** (`logOutreachContact`: the contact row, the stage advance, the lead-type freeze, `contact_id`).

Neither decides whether the email may go. The answer goes back as soon as SMTP accepts.

**Their failures are recorded on the message row, never lost:**
- `sent copy: …` and `sent, not logged: …`, as before, which the history turns into **Save to Sent** and **"log it"**;
- `post-send: …` if a step throws;
- the server log.

**Retry and the poll's automatic retry are unchanged.** `deliver` is still both halves, in order: `sendRow` followed by `fileCopyAndRecord`.

---

## 4 · When something goes wrong, flagged through what exists

**The existing mechanism is the Today screen's "Emails needing a look"** (`lib/outreach-today.ts` `PROBLEM_STATUSES`, `app/api/admin/outreach/today/route.ts`), plus the prospect's history row. It already lists failed, uncertain and bounced sends and counts towards the tab's number. No second mechanism was built.

**A guard refusal** (any of #6–#20 above) is recorded as an `outreach_messages` row with **status `refused`**.
- Nothing was sent.
- `last_error` holds the plain-English reason, e.g. "This prospect is marked do not contact."
- `refusal` holds `{ reason, guards, request }`.
- **Today** lists it as **"Not sent"** with the reason beside it.
- The **prospect's history** shows "Not sent: …" with **Dismiss**.
- ⚠️ It is not `failed`, on purpose: a `failed` row offers **Retry**, and Retry re-sends a stored row **without** running the guards.

**A refused row is never treated as an email:**
- the guards' prior sends and "last email" leave it out;
- the same-address check on other prospects leaves it out;
- `pairHandLoggedEmails` (history and guards) leaves it out;
- the thread parent already did;
- the poll's sweeps and retries select other statuses only.

**A guard that asks ("send anyway").** The refused row stores the guard sentences exactly as the compose window showed them. The history row shows them with **"Send anyway"**, or **"Send it twice anyway"** for an already-sent step: the same wording as before.
- Pressing it (`send_refused`) re-submits the stored message through **the whole send path**. Every guard runs again, and the answered ids are overridden and written to `guard_override`, the same override write as before.
- It uses its own idempotency key, so a second press is the same send.
- The flag clears once the new attempt has a row of its own.

**A provider failure:** the row is `failed` (or `uncertain`), exactly as `deliver` always recorded it, and Today already lists those.

**The toast:**
- **"Not sent — see <prospect>"**, linking to the prospect, with the reason underneath;
- or **"May have been sent — see <prospect>"** for an uncertain send.

**A post-send step that fails:** the email **still counts as sent**. About 4 s later the toast reads the row back (`postSendState`) and adds a smaller notice, e.g. "Sent — but it is not in your Sent folder (use Save to Sent on the prospect)."

---

## 5 · Proof

**New harness: `scripts/outreach-instant-send.cjs` — 26 checks, all pass, registered.** It runs the outbox on a fake clock, and the **real** send and Today routes against an in-memory database. SMTP, IMAP and the admin check are faked; the guards, the contact log and the refusal recording are real. Each case passes and **its broken variant fails**:

| Case | Broken variant (caught) |
|---|---|
| Send closes at once: held, nothing posted for 5 s, then posted once with its key | the outbox posts at once |
| Undo within 5 s sends nothing and hands back exactly what was in the window | Undo forgets to cancel |
| The same idempotency key twice sends once; the second is `duplicate` | the key neither checked nor stored |
| A guard refusal (do-not-contact) sends nothing and flags the prospect on Today with the reason | the refusal not recorded |
| A guard that asks is recorded with its sentences; "Send anyway" re-runs every guard, sends once, writes the same `guard_override`, clears the flag | the refusal not recorded |
| A provider failure is recorded and flagged on Today | a failure recorded as sent |
| A Sent-folder failure: still sent, logged as a contact, notice says which step | a missing copy fails the send |
| The answer returns before the Sent copy | the copy back on the critical path |
| Every guard still runs before the provider (five refusals, zero emails) | do-not-contact skipped |

It also checks the source:
- all 15 recorded refusals and the sequence guards sit above `sendRow`;
- the Sent copy and contact log come after it;
- Send queues and closes with no request inside the window;
- the key is made at the press;
- the page remounts the window on Send and restores it on Undo;
- the history shows "Sending…";
- the hold is a page timer.

**Existing harnesses: all pass.** 29 outreach and related harnesses compile a changed file, including:
- `outreach-mail-send`, `outreach-send-visible`, `outreach-sequence`, `outreach-log-once`, `outreach-reply-attach`, `outreach-reply-any-notes`, `outreach-crm-today`, `outreach-crm-polish`, `outreach-mail-poll`, `outreach-send-read-failure`, `outreach-stage-advance`, `outreach-recorded-steps`, `outreach-step-logging`;
- `outreach-workspace`, `-v2`, `-v3`, `-v3-fixes`, `-v4`, `-v4-fixes`;
- `outreach-dnc-pool`, `outreach-list-columns`, `outreach-schema-census`, `outreach-upload-refresh`, `outreach-logo-latch`, `outreach-bold-persists`, `outreach-editor-toolbar`;
- `demo-reset-for-sending`, `screenshot-truck-details`, `template-formatting`.

**Browser checks, Chromium and WebKit:**
- `outreach-bold-persists-render`, `outreach-editor-render`, `outreach-workspace-render`;
- `outreach-editor-toolbar` with `HG_RENDER=1` (104, of which 56 run in a real browser).

⚠️ The last of these failed one check on its first run. I did not capture which. It then passed twice in a row, and its own header records local Chromium protocol timeouts.

**Named re-pins.** Each is a check that pinned the old in-window send, restated with what it still protects:
- `outreach-sequence`:
  - "keys every message" → **keys every send, made at the press**;
  - "Send disabled while in flight" → **the in-flight gate, then the window closes**;
  - "a blocked send writes nothing" → **sends nothing; recorded as refused once migrated**.
- `outreach-crm-today`:
  - the send route writes `handled_at` **only on its own refused rows** (4 writes, each on a row checked to be `refused`);
  - `PROBLEM_STATUSES` gains `refused`.
- `outreach-send-read-failure`:
  - the refusals are now `return await flagged(…)`;
  - "one send path" counts `deliver` (Retry) plus `sendRow` (Send), with still no transport in the route.
- `outreach-crm-polish`, `outreach-workspace-v4-fixes`: the guards are still answered by the operator — the outbox reads `needsConfirm`, and the history offers `send_refused`.
- `outreach-mail-poll`, `outreach-workspace`: `onSent` → the outbox's `onSettled`, with the same two effects (re-read the lists; arm "Done").
- `outreach-send-visible`: the Send label has no `sending ?` branch.
- `outreach-schema-census`: the proposed `refusal` column is set aside by name until the migration runs.
- `screenshot-truck-details`: the sandbox check asks about the sandbox constant, not whole-file byte identity (a badge was added to that file).

**Two fixes were made in the code rather than re-pinned:**
- the compose window keeps `inline` as its first prop;
- the history's "Send anyway" is the dark button — the Send colour stays the composer's alone.

**Build and lint:**
- **`npx tsc --noEmit`:** clean.
- **`npm run build`:** exit 0.
- **ESLint:** no rule count grew in any of the 17 changed or new source files, compared with HEAD.
- **`run-harnesses --dry-run`:** 121 files pass the screen.
- **Full sweep:** not run.

**One slip, recorded.** While checking which mail settings exist, one command printed a non-secret line from `.env.local`: the Firebase service account's address. It is part of a multi-line value. No key or password was printed. Every later check reported only set or missing.

---

## 6 · The migration (written, not run)

`supabase/migrations/20261015_outreach_messages_refused.sql` — run it once.

```sql
set lock_timeout = '3s';
begin;
alter table public.outreach_messages drop constraint if exists outreach_messages_status_check;
alter table public.outreach_messages add constraint outreach_messages_status_check
  check (status in ('sending', 'sent', 'failed', 'uncertain', 'bounced', 'received', 'auto_reply', 'bounce', 'refused'));
alter table public.outreach_messages add column if not exists refusal jsonb;
comment on column public.outreach_messages.refusal is
  'Set only on status = refused: { reason, guards: [{ id, kind, message }], request }. Nothing was sent.';
commit;
notify pgrst, 'reload schema';
```

**Before it runs:**
- the route answers a refusal exactly as before and records nothing;
- the toast still says why;
- there is no Today flag.

The route probes for the `refusal` column. The status list is the current one (`20260929_outreach_messages_poll_states.sql`) plus `refused`.

---

## 7 · Localhost test list — ZZ Test Prospect (Dominic), Send test only

⚠️ **First:** add `OUTREACH_PRIMARY_USER` and `OUTREACH_TEST_RECIPIENT` to `.env.local`, run the migration, then `npm run dev`. A Send test goes only to your own address.

1. **Instant.** Open ZZ Test Prospect (Dominic) → Email, pick a template, and press **Send test to me** → **Send test**.
   - The window closes at once, and a fresh one appears.
   - The toast says **"Sending test… Undo"**.
   - The history shows **"Sending…"** at the top. Turn on the history's test toggle to see the real row arrive afterwards.
2. **Undo.** Repeat, and press **Undo** within 5 s.
   - The window comes back with the same template, text, attachments and "include previous email".
   - Nothing arrives in your inbox.
   - Send test again from the restored window.
3. **Sent.** After about 5 s the toast says **"Test sent to your own address."** The email is in your inbox, and the copy is in Sent a few seconds later.
4. **Close the tab inside 5 s.** Send test, then close the tab at once. Nothing arrives.
5. **A refusal.** Type `{{plans_pdf}}` in the middle of a sentence and press **Send test**.
   - After 5 s the toast says **"Not sent — see ZZ Test Prospect (Dominic)"**, with "Your message still contains {{plans_pdf}}…".
   - With tests shown, the history has a **"Not sent"** row with **Dismiss**.
   - (A refused **test** is not listed on Today, because tests never are. The Today flag for a real send is proven by the harness.)
6. **Double press.** Press **Send test** and then **Send test** again quickly in the confirm. Only one email arrives.
7. **Timing.** With `OUTREACH_SEND_TIMING=1`, the terminal prints `[send-timing] sent {…}` and `[send-timing] after {…}` for each send. Those are the numbers for §1's table.

---

## 8 · Files

**New:**
- `lib/outreach-outbox.ts`, `lib/outreach-refusal.ts`, `lib/outreach-after.ts`, `lib/outreach-send-timing.ts`;
- `components/admin/OutboxToasts.tsx`;
- `supabase/migrations/20261015_outreach_messages_refused.sql`;
- `scripts/outreach-instant-send.cjs`.

**Changed:**
- `app/api/admin/outreach/mail-send/route.ts`:
  - refusals recorded;
  - `send_refused` and `dismiss_refused`;
  - `sendRow` then `runAfter`;
  - refused rows excluded from the guards;
  - timing marks;
  - the GET returns `contact_id`.
- `lib/outreach-mail-deliver.ts`: `sendRow`, `fileCopyAndRecord`, and `deliver` as their composition.
- `app/api/admin/outreach/today/route.ts`: refused rows that have been handled drop off.
- `app/api/admin/outreach/timeline/route.ts`: `refusal`, behind a probe.
- `lib/outreach-today.ts`: `refused`, labelled "Not sent".
- `lib/outreach-timeline.ts`: the pairing skips refused rows; the `refusal` type.
- `lib/outreach-workspace.ts`: the "Not sent" badge.
- `components/admin/ComposeWindow.tsx`:
  - Send queues and closes;
  - the Undo snapshot;
  - the dead in-window guard dialog removed (it now lives on the prospect).
- `components/admin/ProspectWorkspace.tsx`: remount on Send, restore on Undo, re-read on settle, "Sending…" rows, toasts.
- `components/admin/ProspectTimeline.tsx`: "Sending…" rows; a refused row's reason, Send anyway and Dismiss.
- `components/admin/OutreachPanel.tsx`: toasts; Today shows a refused row's reason.
- `scripts/harnesses.json`, and the re-pins in §5.
