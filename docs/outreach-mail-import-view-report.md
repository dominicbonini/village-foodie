# Three fixes to the outreach mail system

**29 September 2026 · commit `510a332` · deployed and serving on production at 21:37:56Z**

The importer was taking new mail out of reply pickup's reach, View opened an IMAP session every time
it was pressed, and nothing on the page changed after a check until Dominic reloaded it. All three are
fixed, and a fourth defect — found while fixing the second — would have hung every poll run that met a
real reply.

Sending is still manual. The mailbox is still read-only: EXAMINE and `BODY.PEEK[…]` on every path, no
flag set or cleared, nothing moved, copied, deleted or expunged. No attachment content is downloaded
or stored anywhere.

---

## 1 · What was wrong, and why

### (a) The importer was stealing new mail from reply pickup

At **20:57:07Z on 29 September** a reply arrived at `dominic@hatchgrab.com`. **Twenty-seven seconds
later** *Import past emails* was pressed. The importer recorded it as a `mailbox_import` row — and the
importer writes no `outreach_contacts` row, deliberately, because it walks years of history and
logging all of it would invent a ladder that was never climbed.

The poll then ran, advanced its watermark over that uid, found the `message_id` already in
`outreach_messages`, and treated it as seen. Correctly: the insert gate is what stops a reply being
logged twice. But no contact row had ever been written, so the reply sat in the Emails list and
nowhere in the contact history.

**The root cause is not the importer and not the poll. It is that two things read the same mailbox and
only one of them logs contacts, with no boundary between them.** Anything the importer records first,
the poll skips forever.

### (b) View had to log in to show a three-line reply

Nothing stored the body of an imported or polled message. Every press of **View** — and every open of
an email from the contact history — connected to IMAP, authenticated, selected a mailbox, read the
BODYSTRUCTURE, fetched two parts and decoded them. That is several seconds for text this app had
already had in its hands once.

It was also fragile in a way a stored copy is not: a message that has since been moved cannot be shown
at all, and `attachments: []` was hard-coded on the one path that *did* serve from the database, so a
stored message with three attachments said it had none.

### (c) The page did not refresh itself

*Check for replies now* logs contacts and moves stages. *Import past emails* records rows the Emails
list shows. Both reported what they had done and left the screen showing what it had loaded before
they ran. Dominic pressed a button, was told "1 reply logged", and had to reload the page to see it.

### (d) 🔴 The fix for (b) uncovered a deadlock in the poll

Storing a body means reading it, and the obvious place to read it is where the poll already has the
message: inside `walkMailbox`'s loop. That would have hung.

**imapflow allows exactly one command in flight.** `exec()` pushes onto `requestQueue` and `trySend()`
dispatches only when `currentRequest` is clear. Its `fetch()` generator yields each message *before*
calling `res.next()`, so the server is not allowed to send the next message until the consumer's
`yield` returns. A handler running inside that loop which issues its own `fetchOne` therefore queues
behind a FETCH that cannot finish until the handler returns — and the handler cannot return until its
own fetch completes.

**This was already live.** `handleReply` called `readText`, and `handleBounce` called
`readReturnedPart`, both from inside the loop. The path had never been exercised on production — the
first-look defect swallowed the one real reply, and the importer took the next — so it hung nothing
yet. It would have hung the first poll run that met a genuine reply, until the connection deadline.

---

## 2 · The fixes

### Item 1 — the importer is history only

[`app/api/admin/outreach/mail-import/route.ts:109`](../app/api/admin/outreach/mail-import/route.ts#L109)
takes the boundary from the same constant the poll's first look uses, per account:

```ts
const since = pollSince(creds.account)
```

and [line 136](../app/api/admin/outreach/mail-import/route.ts#L136) refuses anything at or after it:

```ts
if (withinFirstLook(msg.internalDate, since)) { leftForPoll++; continue }
```

`internalDate: true` was added to the fetch so the rule has the value it reads. The count travels to
the screen through the shared result type (`leftForPoll` in
[`lib/outreach-mail-import-result.ts`](../lib/outreach-mail-import-result.ts)) and the panel prints
**"N left for reply pickup"** — [`OutreachPanel.tsx:1678`](../components/admin/OutreachPanel.tsx#L1678).

Before `POLL_SINCE` is history and is still recorded exactly as it always was.

### Item 2 — adoption recovers what was already taken

The guard above fixes the next one; it cannot fix the rows already in the table.
[`adoptImportedMessages`](../lib/outreach-mail-poll.ts#L701) takes up to **20 rows a run** with
`source = 'mailbox_import'`, `contact_id` null and `message_date` at or after **that row's own
account's** `POLL_SINCE` (the two mailboxes have different values, so the filter is applied per row
rather than as one `gte` that could only be right for one of them).

Each is claimed by [`claimAdoption`](../lib/outreach-poll-claims.ts#L133):

```ts
.update({ source: 'poll', updated_at: now.toISOString() })
.eq('id', rowId)
.eq('source', 'mailbox_import')
.select('id')
```

🔴 **The claim is the protection, not a nicety.** Adoption ends in `logOutreachContact`, and
`outreach_contacts` has no unique constraint to catch a second write. One filtered statement that both
tests and acts means exactly one of two overlapping runs proceeds.

[`adoptOne`](../lib/outreach-mail-poll.ts#L760) then re-reads the message read-only **from the row's
own account and mailbox** and applies the same four rules as new mail:

| What arrived | What happens | Contact row? |
|---|---|---|
| A thread of test sends only | counted as `repliesToTest`, **returns** | no |
| Auto-reply | row status `auto_reply` | no |
| Bounce | the ORIGINAL marked `bounced`, this row `bounce` | no |
| Real reply | `logOutreachContact` with the extracted text, `contact_id` linked | yes |
| Outlook-sent outbound | the existing rule: `reply` only if the prospect has replied | conditional |

⚠️ The test-only check **returns**. Without that it would fall through to the From-address match and
log the reply anyway, because a reply to a test genuinely does come from the prospect's own address —
the 29 September defect, in a new place.

⚠️ It **updates** where the live handlers **insert**, and that is the only structural difference: the
row already exists, so `insertMessageOnce` has nothing to gate and the claim is the gate instead.

The run reports **"N adopted from import"** — [`OutreachPanel.tsx:1567`](../components/admin/OutreachPanel.tsx#L1567).

### Item 3 — the bodies are stored, so View opens instantly

[`lib/outreach-mail-bodies.ts`](../lib/outreach-mail-bodies.ts) is the one contract: `capHtml`
(**1 MB**, with `TRUNCATION_MARKER` appended so the stored value itself carries the fact),
`isTruncated`, `parseAttachments`, `hasStoredBody` and `bodyColumns` — which writes exactly three
columns, `html_body`, `text_body` and `attachments`, and has **nowhere to put attachment content**.

Every path that records or re-reads a message now writes them:

| Path | Where |
|---|---|
| `handleReply`, `handleAutoReply`, `handleBounce`, `handleOutlookSent` | [`lib/outreach-mail-poll.ts`](../lib/outreach-mail-poll.ts) |
| `adoptOne` | [`:760`](../lib/outreach-mail-poll.ts#L760) |
| `repairReplyTexts` | the repair now stores bodies as well as the contact text |
| the importer | [`route.ts:177`](../app/api/admin/outreach/mail-import/route.ts#L177), after its walk, capped at 40 reads a run and skipping messages already stored |
| a live View | [`mail-send/route.ts:337`](../app/api/admin/outreach/mail-send/route.ts#L337) |

View [`:310`](../app/api/admin/outreach/mail-send/route.ts#L310) serves from the database when
`hasStoredBody(row)`, with the **real** attachment list (`parseAttachments(row.attachments)` — the
hard-coded `[]` is gone) and `truncated: isTruncated(row.html_body)`. From, To, Date and Subject come
from the stored columns on both paths. A row with nothing stored is read live **once** and the read is
saved, filtered `.is('html_body', null).is('text_body', null)` so a stored body is never overwritten.

[`fillMissingBodies`](../lib/outreach-mail-poll.ts#L946) backfills **25 rows a run**, newest first,
each from its own account, filtered on having neither body **and** a null `attachments`.

⚠️ That third condition is the anti-thrash guard: `attachments` is an array once a message has been
looked at — `[]` when it genuinely has no text parts — so such a message stops matching instead of
being re-read on every run forever. It is the difference the migration comment records: **null means
"never looked", `[]` means "looked, none"**.

The body still renders in `sandbox=""` with `srcDoc`. Coming out of our own database is not a
provenance claim about who wrote it.

### Item 4 — the page refreshes itself

[`OutreachPanel.tsx:1088-1089`](../components/admin/OutreachPanel.tsx#L1088) gives both toolbar buttons
`onDone={load}`, called **after** the answer is shown. `load()` re-reads the prospects, their contact
history and their stages, and bumps `refreshNonce` — which is now passed into the modal, so
[`:3316`](../components/admin/OutreachPanel.tsx#L3316) reads:

```tsx
<ProspectMessages prospectId={p.id} nonce={messagesNonce + refreshNonce}
```

⚠️ The two nonces are **added**, not chosen between: `messagesNonce` is the modal's own ("I just sent
something"), `refreshNonce` is the page's ("the list was re-read"). Both only increase, so the sum
changes whenever either does. Send, Log, Retry and Save to Sent already reloaded both; that is now
asserted rather than assumed.

### Item (d) — the deadlock

[`walkMailbox`](../lib/outreach-mail-poll.ts#L269) collects into `batch` and runs every handler after
the stream is drained, with the mailbox still open and nothing in flight:

```ts
state[path] = advanceWatermark(state[path], { uidvalidity, highestUid }, seenUids)
for (const m of batch) await onMessage(m)
```

The importer does the same with its body reads. `readWholeMessageLocked` and `structureOf` were
exported from [`lib/outreach-mail-box.ts`](../lib/outreach-mail-box.ts#L242) so View's reader and the
poll's reader are **one** function — which is how the `attachments: []` divergence happened in the
first place.

---

## 3 · The harness

`scripts/outreach-mail-poll.cjs`, **356 checks, all passing**, no network and no mailbox.

### Broken variants — shown FAILING first

```
✓ FAILED as required  V18 the source filter removed: two runs both claim the same imported reply and it is logged twice
✓ FAILED as required  V19 the cap removed: a two-megabyte body is stored whole and the viewer is told nothing was cut
✓ FAILED as required  V20 the emptiness test removed: a row with two blank columns claims to have a stored body
```

(V1–V17 are the existing seventeen, all still failing as required.)

🔴 **Three censuses are also shown failing**, because a census over a file this harness cannot compile
(the routes import `next/server`) proves nothing unless the same predicate is run against a source with
the rule removed:

```
✓ 🔴 the importer skips anything at or after POLL_SINCE and counts it as left for reply pickup
✓ ⚠️ …and the same census FAILS on a source with that line removed, so it is testing the rule
✓ 🔴 no handler runs inside the fetch loop — it only collects
✓ ⚠️ …and the same census FAILS on a loop with a handler put back in
✓ 🔴 "Check for replies now" reloads the list when it finishes
✓ ⚠️ …and the census FAILS on the version without it
```

### What it proves

```
── THE IMPORTER IS HISTORY ONLY ─────────────────────────────────────────────────────────
  ✓ 🔴 the reply that was stolen is at or after POLL_SINCE — the importer must leave it
  ✓ …and a 2025 email is before it, so the importer still records history as it always did
  ✓ …the boundary is inclusive at POLL_SINCE and exclusive one millisecond before it

── ADOPTION: THE POLL TAKES OVER WHAT THE IMPORTER GRABBED ──────────────────────────────
  ✓ 🔴 exactly ONE of two overlapping runs claims the row
  ✓ …and the row is no longer adoptable
  ✓ ⚠️ the claim itself logs nothing — logging is what the winner goes on to do
  ✓ 🔴 …and only those at or after THAT ROW'S OWN account's POLL_SINCE — history is left alone
  ✓ 🔴 a reply to a test send is tested BEFORE classification…
  ✓ …and it RETURNS, so it cannot fall through to the address match as it did on 29 September
  ✓ 🔴 an auto-reply is recorded as 'auto_reply' and RETURNS — no contact row, so §57.1 cannot exit the sequence
  ✓ a bounce marks its ORIGINAL bounced and records itself, and logs nothing
  ✓ 🔴 a real reply is logged WITH ITS TEXT, quoted history stripped

── ONE COMMAND AT A TIME: THE DEADLOCK THAT WOULD HAVE HUNG EVERY RUN ───────────────────
  ✓ 🔴 no handler runs inside the fetch loop — it only collects
  ✓ the handlers run after the stream is drained, with the mailbox still open
  ✓ the importer reads no body inside its fetch loop either…

── THE BODIES ARE STORED, AND VIEW READS THEM ───────────────────────────────────────────
  ✓ 🔴 an oversized body is cut at the cap
  ✓ …and the cut is reported
  ✓ 🔴 two blank columns are NOT a stored body — that row is read live once and saved
  ✓ 🔴 three columns and no fourth: attachment CONTENT has nowhere to be written
  ✓ ⚠️ only the two text parts are ever named in a fetch…
  ✓ …so no attachment part crosses the wire
  ✓ 🔴 View serves a stored body without opening the mailbox
  ✓ …with the REAL attachment list: the hard-coded `attachments: []` is gone
  ✓ 🔴 a live read SAVES what it fetched, so the next open costs a query
  ✓ ⚠️ …only where there is nothing to overwrite
  ✓ 🔴 …only rows that have NEITHER body…
  ✓ …and only ones never looked at, so a message with no text parts is not re-read forever
  ✓ handleReply / handleAutoReply / handleBounce / handleOutlookSent / adoptOne stores what the email says

── THE PAGE REFRESHES ITSELF ────────────────────────────────────────────────────────────
  ✓ 🔴 an OPEN prospect modal re-reads its Emails list too — the page nonce reaches it
  ✓ Retry, Save to Sent and Log each reload the list and the modal
  ✓ a Send does the same
```

---

## 4 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 4.8s`, no new warnings |
| eslint on the eight changed files | **13 warnings — identical to clean HEAD**, zero delta |
| eslint on the new `lib/outreach-mail-bodies.ts` | clean |
| `node scripts/run-harnesses.cjs` (run alone) | **61 run · 61 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` ✅ unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` ✅ unchanged |

The 13 eslint warnings are all pre-existing in `OutreachPanel.tsx` (5 × `no-explicit-any`, 7 ×
`set-state-in-effect`, 1 × `immutability`); the same count and the same rules on a clean worktree at
`HEAD`. No email was sent and no SQL was run by anything here.

---

## 5 · SQL

The one column, **already applied by Dominic** and recorded in
`supabase/migrations/20260929_outreach_messages_attachments.sql`:

```sql
alter table public.outreach_messages
  add column if not exists attachments jsonb;

comment on column public.outreach_messages.attachments is
  'Attachment metadata only — filename, contentType, size. Contents are never downloaded or stored.';

notify pgrst, 'reload schema';
```

`html_body` and `text_body` already existed.

---

## 6 · Commit and deploy evidence

**Commit `510a332`** — *"Three fixes: the importer stops stealing new mail, View opens from the
database, the page refreshes itself"*, on `main`, pushed to `origin/main` (`880600c..510a332`). Ten
files, two of them new. No other work is in it.

**Deployed and serving on production, confirmed 2026-09-29T21:37:56Z.**

Build-fingerprint method — the set of `/_next/static/chunks/*.js` the home page references:

```
fingerprint at push:  8e567d913b9ef721c6d2a4b8c9e1328a
21:36:55Z poll 1:     8e567d913b9ef721c6d2a4b8c9e1328a
21:37:15Z poll 2:     8e567d913b9ef721c6d2a4b8c9e1328a
21:37:35Z poll 3:     8e567d913b9ef721c6d2a4b8c9e1328a
21:37:56Z poll 4:     f09007884c32ea1711af83c4a3129f21     ← DEPLOY LANDED
```

Routes checked after it changed:

| Request | Status | Body |
|---|---|---|
| `GET /api/admin/outreach/mail-poll` | 405 | POST-only, so the path exists |
| `GET /api/admin/outreach/mail-import` | 405 | POST-only, so the path exists |
| `GET /api/cron/outreach-replies` | 401 | `{"error":"Unauthorised"}` |
| `GET /api/admin/outreach/does-not-exist-check` | 404 | the app's HTML 404 page |

⚠️ Those four rows prove the site is up, not that this fix is live — no route was added or changed.
The fingerprint change is what proves the build was replaced.

---

## 7 · What Dominic should do

On **ZZ Test Prospect (Dominic)** — `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`:

1. **Press "Check for replies now".** Expect **"1 adopted from import"** in the summary line, and the
   Contact history to gain **"Test msg 2"** — *without reloading the page*. Expect a
   **"N emails stored for instant viewing"** count too, as the backfill fills older rows.
2. **Press View on any email.** It should open effectively instantly, from the database. The first open
   of a row the backfill has not reached yet is still a live read — and saves itself, so the second
   open of that same row is instant.
3. **Do a REAL send** from the compose window. That is the outbound first contact; the Emails list and
   the contact history should both show it without a reload.
4. **Reply from Hotmail, then press "Import past emails" straight away.** Expect **"1 left for reply
   pickup"** and **0 recorded** for that message. The importer must not touch it.
5. **Wait for the ten-minute cron, or press "Check for replies now".** That is what logs the reply, with
   its text, and moves the stage to `replied`.

⚠️ **The cron may get there before you do**, on any of steps 1 and 5. That is harmless — whichever runs
first does the work and the other finds nothing left; the claim and the insert gate are what make that
true rather than lucky.

---

## 8 · What was deliberately not done

- **The importer does not read every body it records.** It is capped at 40 reads a run and skips
  messages already stored, because its walk is unbounded — a mailbox with two thousand matched messages
  would otherwise blow the route's 60-second budget. The poll's backfill finishes the job at 25 a run.
- **Adoption is a one-way door.** Once claimed, `source` says `poll` and the row can never be picked up
  again, so a run that dies between the claim and the log leaves a recorded-but-unlogged row — the same
  state the importer left it in. Making it reversible would mean a second claim state, and a row stuck
  half-way is a worse failure than a row left exactly where it was.
- **`do_not_contact` is still never set automatically**, on any reply, including one that says no. That
  is Dominic's decision and nothing here touches it.
