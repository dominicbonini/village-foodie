# Build 1 of 2 — sending outreach emails from Dominic's own mailbox

**28 September 2026.** Server + admin UI. **Manual only: nothing is sent without a press of Send on a
message that has been previewed.** No reply poller and no automatic retry — those are Build 2, and
neither is present in this code.

**Nothing was sent during this task, by any route.** Every message in this report was composed with
nodemailer's `streamTransport` (`buffer: true`), which writes the RFC822 bytes to memory and opens no
socket. The migration was **not applied** and **no SQL was run** — it is reproduced in full below.
No `outreach_templates` row was created, edited, seeded or deactivated, and `outreach_snippets` was not
touched. No live trading truck was contacted; §"the live-truck rule, in code" explains what makes that
structural rather than a promise.

---

## 1. What changed

### New
| File | What it is |
|---|---|
| `supabase/migrations/20260928_outreach_messages.sql` | One row per outreach email. **Not applied.** |
| `lib/outreach-mail-message.ts` | The message itself: signature, body, quote block, threading, `classifySendFailure`. Pure. |
| `lib/outreach-mail-envelope.ts` | The exact nodemailer transport and message options the route sends. Pure. |
| `lib/outreach-send-rules.ts` | The refusals and the cap window, as pure functions. |
| `lib/outreach-mail-box.ts` | IMAP helpers: read-only mailbox walk, find-in-Sent, append-to-Sent, fetch a body by uid. |
| `lib/outreach-contact-log.ts` | The ONE writer of an outreach rung, extracted from the outreach route. |
| `app/api/admin/outreach/mail-send/route.ts` | `GET` (counter + a prospect's messages); `POST` `preview` / `send` / `retry` / `log_only`. |
| `app/api/admin/outreach/mail-import/route.ts` | Reads the mailbox read-only and records what is already there. |
| `scripts/outreach-mail-send.cjs` | The harness. 6 broken variants, 51 assertions, no network. |

### Changed
| File | What changed |
|---|---|
| `components/admin/ComposeWindow.tsx` | The `mailto:` path replaced by the server send, plus preview, test send, confirm, counter. Copy and Log unchanged. |
| `components/admin/OutreachPanel.tsx` | "Import past emails"; the prospect modal's `Emails` list with Retry and "log it". |
| `app/api/admin/outreach/route.ts` | `log_contact` now calls `logOutreachContact`; two now-unused constants moved with it. Behaviour identical. |
| `app/api/admin/outreach/mail-diagnostics/route.ts` | Three fixes (below). |
| `lib/outreach-mail-config.ts` | From address, send port, EHLO name, Sent mailbox, import mailboxes, daily cap, timezone. |
| `scripts/harnesses.json` | Registers the new harness. |
| `scripts/outreach-stage-advance.cjs` | **Re-anchored, and said so in the file** — see §9. |

**Brevo and every transactional email path are untouched.** No file under the transactional mail path
was opened, and nothing here imports it. Outreach sends over SMTP as the mailbox; Brevo remains the
sender for order and account mail.

---

## 2. The migration (NOT APPLIED)

Run it by hand in the Supabase SQL editor. It is idempotent, and the last line matters: PostgREST caches
the schema, so until `notify pgrst, 'reload schema'` runs, every request against the table returns
PGRST205 and reads exactly like a failed migration.

```sql
-- 20260928_outreach_messages.sql
begin;

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  contact_id uuid references public.outreach_contacts(id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  status text not null check (status in ('sending', 'sent', 'failed', 'uncertain', 'received')),
  is_test boolean not null default false,
  source text not null check (source in ('system', 'mailbox_import')),
  message_id text not null unique,
  in_reply_to text,
  "references" text,
  subject text,
  from_address text,
  to_address text,
  message_date timestamptz,
  mailbox text,
  uid bigint,
  uidvalidity bigint,
  html_body text,
  text_body text,
  sent_copy text not null default 'absent' check (sent_copy in ('server_filed', 'appended', 'absent')),
  attempts integer not null default 0,
  last_error text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_messages_prospect_date_idx
  on public.outreach_messages (prospect_id, message_date desc nulls last);
create index if not exists outreach_messages_outbound_created_idx
  on public.outreach_messages (created_at desc)
  where direction = 'outbound' and is_test = false;

alter table public.outreach_messages enable row level security;

drop policy if exists "service_role only" on public.outreach_messages;
create policy "service_role only" on public.outreach_messages
  for all to service_role using (true) with check (true);

revoke all on public.outreach_messages from anon, authenticated, public;

comment on table public.outreach_messages is
  'One row per outreach email, in or out. Written only by server routes using the service role.';

commit;

notify pgrst, 'reload schema';
```

**Why a table and not a column on `outreach_contacts`.** `outreach_contacts` is the ladder: one row per
rung, hand-datable, and §57's derived next step reads it. An email is a different object with a
different lifetime — attempted, possibly uncertain, possibly retried, carrying a Message-ID that threads
the next one, and sometimes existing with no contact row at all (a test send; an inbound reply). Hanging
those on the ladder would make the ladder lie.

**The two unique constraints do real work.** `message_id` is what makes the import re-runnable — a
second walk of the mailbox conflicts instead of duplicating — and is how a sent copy is found in Sent.
`idempotency_key` is what makes one compose unable to send twice.

**RLS is the §52.2 pattern**: enabling RLS alone leaves the default grants in place, so the capability
stays reachable with the anon key. The `revoke` is the half that closes it. This table holds
correspondence with named businesses and is never client-readable.

---

## 3. Before the migration is applied, sending is simply OFF

Both routes probe the table rather than assume it, because the migration is applied by hand:

```ts
async function messagesTableReady(): Promise<boolean> {
  try {
    const { error } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).limit(1)
    if (!error) return true
    const code = (error as { code?: string }).code
    return !(code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(error.message ?? ''))
  } catch { return false }
}
```

PGRST205 ("not in the schema cache") and 42P01 ("no such table") both mean *not applied yet*, and both
must read as a feature that is off rather than as an error page.

**What Dominic sees before applying it:** the compose window shows
*"Email sending is off until the outreach_messages migration is applied. Copy and Log still work."*
The Send and Send-test buttons and the preview pane are not rendered at all; **Copy and Log behave
exactly as they do today**. The prospect modal shows no `Emails` section. "Import past emails" returns
the same sentence. A `head` count costs nothing, so the probe runs on every call rather than being
cached into a stale "off".

---

## 4. The send, step by step, with the line that enforces each refusal

Order matters: **every refusal runs before the SMTP server is contacted**, then the row goes in, then the
send, then the log, then the Sent copy.

| # | Refusal | The line |
|---|---|---|
| 1a | The migration is not applied | `if (!(await messagesTableReady())) return refuse(MIGRATION_OFF, { migrationApplied: false })` |
| 1b | No mailbox credentials | `if (!mailUser \|\| !mailPass) return refuse('The mailbox credentials are not set on this environment, so nothing can be sent.')` |
| 1c | A test with no test address | `if (isTest && !testRecipient) return refuse('OUTREACH_TEST_RECIPIENT is not set on this environment, so a test cannot be sent.')` |
| 2 | This exact message was already submitted | `if (prior) return NextResponse.json({ ok: true, duplicate: true, ...(prior as object) })` |
| 3 | The prospect cannot be read | `if (pErr \|\| !pRow) return refuse('That prospect could not be read.')` |
| 4 | Do not contact / no address / **a linked HatchGrab truck** | `const blocked = prospectRefusal({...}); if (blocked) return refuse(blocked.refusal)` |
| 5 | Nothing to send | `if (!bodyIn.trim()) return refuse('There is no message body to send.')` |
| 6 | A malformed token | `const malformed = malformedTokensIn(whole); if (malformed.length) return refuse(...)` |
| 7 | A must-resolve token unresolved | `const mustResolve = unresolvedIn(whole).filter(isMustResolveToken); if (mustResolve.length) return refuse(...)` |
| 8 | The daily cap | `const capped = capRefusal(count ?? 0); if (capped) return refuse(capped.refusal)` |
| 9 | A chase with nothing to reply to | `return refuse("I can't find the earlier email to reply to — run Import past emails, or check this truck's email address.")` |
| 10 | A first contact with no subject | `if (!parent && !subjectIn) return refuse('A first contact needs a subject.')` |

Then:

11. **The row is inserted as `sending`, carrying its Message-ID, before SMTP is contacted.** A crash
    between here and the server leaves evidence rather than a silent gap, and a double submit collides on
    `idempotency_key` instead of sending twice:
    `status: 'sending', ... message_id: messageId, ... idempotency_key`.
    A `23505` on that insert **is** the double-submit guard working, and is answered with the first
    send's verdict.
12. **The send**, through `deliver()`, which increments `attempts`, calls `transporter.sendMail(mail)`,
    and writes `sent` — or `failed` / `uncertain`, never both.
13. **The contact log**, and only for a non-test send the server accepted:
    `if (!isTest && result.status === 'sent') { ... await logOutreachContact(...) }`.
14. **The Sent copy** (§7), which is never fatal.

### §6/§7 are imported, not re-implemented
`malformedTokensIn`, `unresolvedIn` and `isMustResolveToken` come from `lib/outreach-template-render.ts`.
§58.2 records why that matters: a guard that shares the resolver's regex is blind to exactly the mistakes
the resolver cannot consume, and `{{truck name}}` shipped on an active template because three guards
shared one pattern. A second copy in this route would have been a fourth reader of that blind spot.

### The live-truck rule, in code
`prospectRefusal` refuses any prospect whose `discovery_trucks.hatchgrab_truck_id` is set, **before the
address is even read**. A linked row is a customer, a demo or the test truck — never a prospect. Pizzeria
Gusto's discovery row carries that column, so this route cannot reach it however it is called. The
harness asserts it, and a broken variant proves the assertion bites (V3, §8).

---

## 5. Failed, uncertain, and why the default is uncertain

The most dangerous outcome of a send is not a failure. It is an **unknown treated as a failure** and then
retried, which sends a prospect the same cold email twice.

```ts
const DEFINITE_FAILURE_CODES = new Set(['EAUTH', 'ECONNECTION', 'EDNS', 'EENVELOPE', 'EMESSAGE'])

export function classifySendFailure(err: unknown): SendOutcome {
  const e = (err ?? {}) as { code?: unknown; responseCode?: unknown }
  if (typeof e.responseCode === 'number' && e.responseCode >= 400) return 'failed'
  if (typeof e.code === 'string' && DEFINITE_FAILURE_CODES.has(e.code)) return 'failed'
  return 'uncertain'
}
```

- **failed** — the server *spoke*: a numeric 4xx/5xx reply, or a connect/DNS/auth/envelope/message
  rejection. In every one of these the server has told us it did not accept the mail. Retry is offered
  plainly.
- **uncertain** — the data was handed over and nothing came back: a dropped socket, a read timeout
  mid-conversation. The message may well have been delivered.
- **The default is uncertain.** An error shape nobody anticipated lands on the cautious side; worst case
  an operator checks a Sent folder they did not need to.

A retry of an uncertain row is refused unless the caller explicitly confirms:

```ts
export function retryRefusal(row: { status: string }, confirmUncertain: boolean): SendRefusal | null {
  if (row.status === 'sent') return { refusal: 'That message was already sent.' }
  if (row.status === 'uncertain' && confirmUncertain !== true) {
    return { refusal: 'May have been sent — check your Sent folder before retrying.', needsConfirm: true }
  }
  return null
}
```

**A retry re-sends the same row with the same Message-ID.** If the first copy did arrive, most clients
collapse the two rather than showing the prospect a duplicate — a mitigation, not a licence, which is why
the confirm exists as well.

**`sent, not logged` is not a failed send and must never be retried.** The prospect has the email; the
database write after it failed. The row records it, the message list offers a one-click **log it**, and
the only thing that action does is write the missing rung.

---

## 6. Threading — a chase is a reply in three places at once

The subject, `In-Reply-To` and `References` must all agree, or the chase appears in the prospect's inbox
as a brand-new conversation and the whole point of chasing in-thread is lost.

```ts
const chain = [input.parent.references, input.parent.messageId].filter(Boolean).join(' ').trim()
return {
  subject: replySubject(q.subject),          // Re: + the parent subject, prefixes stripped REPEATEDLY
  html: bodyHtml(input.body) + sig + referenceBlockHtml(q),
  inReplyTo: input.parent.messageId,
  references: chain || null,
}
```

**The parent is the most recent non-test outbound row for this prospect** that the server accepted or may
have accepted (`status in ('sent','uncertain')`), ordered by `message_date`.

**Where the quoted body comes from.** A message this app sent stored its own bodies. An **imported**
one did not — the importer records an Outlook message's headers and leaves the body in the mailbox, where
it already is — so it is read back from Sent by uid, read-only:

```ts
if (!quotedHtml && parentRow.mailbox && parentRow.uid != null) {
  const c = makeImapClient(mailUser, mailPass)
  try { await c.connect(); const bodies = await fetchBodiesByUid(c, parentRow.mailbox, parentRow.uid)
        quotedHtml = bodies.html; quotedText = bodies.text }
  catch { /* fall through to the refusal below */ } finally { try { await c.logout() } catch {} }
}
```

**Only when neither source has it is the chase refused**, with the sentence that says what to do:
*"I can't find the earlier email to reply to — run Import past emails, or check this truck's email
address."* A reply quoting nothing is not the email Dominic thinks he is sending.

**And a new thread is never started silently.** If the contact log says this prospect has been emailed
but no message row can be found, the send is refused with the same sentence rather than opening a fresh
subject that would arrive as an unrelated first approach.

### The format is transcribed, not designed
Every literal in `lib/outreach-mail-message.ts` came out of the mailbox diagnostic's capture of real
Outlook-sent mail: the paragraph div, the two `direction: ltr` spacer divs in the signature, the
`mail-editor-reference-message-container` and its rule, and the date line. That date line is assembled
from `Intl` **parts** rather than formatted whole, because en-GB's own long format writes
"Friday 11 September 2026" with **no comma** after the weekday and the captured header has one:

```ts
return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')} at ${get('hour')}:${get('minute')}`
```

### Nothing on the message says "generated"
`ALLOWED_HEADERS` is ten names: `from, to, subject, date, message-id, mime-version, content-type,
content-transfer-encoding, in-reply-to, references`. No `X-Mailer`, no `List-Unsubscribe`, no
`Precedence`, no tracking pixel, no rewritten links. The opt-out is a **sentence asking for a reply**,
not a header:

> If you would rather not hear from me again, reply with "no thanks" and I will not contact you.

⚠️ One correction to an earlier assumption: **nodemailer 10 does not stamp `X-Mailer` by default** —
`mailer/mail-message.js#setMailerHeader` returns early on a falsy `data.xMailer`. `xMailer: false` is
kept in `mailFor()` as a guard against that default returning, not as a fix for something happening
today, and the lib comment says so rather than overstating it. The harness proves the *outcome* — the
composed bytes carry nothing outside the allow-list — which holds either way.

---

## 7. The Sent copy: found, or appended, and never fatal

```ts
const found = await findInSent(client, row.message_id)
if (found) { sentCopy = 'server_filed'; ... }
else if (raw) { const appended = await appendToSent(client, raw, ...); if (appended.ok) sentCopy = 'appended' }
```

- **`server_filed`** — the mail host filed it itself (Namecheap does this for authenticated submissions).
  🔴 Appending now would put a **second** copy in Dominic's Sent folder, so the search comes first.
- **`appended`** — it was not there, so the app IMAP-APPENDed the exact bytes nodemailer composed.
  `appendToSent` is **the only non-read-only IMAP call in this build**, it only ever adds, and its
  failure never fails the send.
- **`absent`** — neither worked. The send still succeeded; the message row says `absent` and the UI
  labels that message **no sent copy**.

The whole block is wrapped so that a mailbox problem cannot turn a delivered email into a failure: *the
mail has gone; the copy is a convenience.*

---

## 8. The harness — `scripts/outreach-mail-send.cjs`

`node scripts/outreach-mail-send.cjs` · ≈3.2 s · **no network**. Registered in `scripts/harnesses.json`.

**Failure mode it exists to catch, in the order it would hurt:** a prospect receives the same email
twice, because an uncertain send was retried without a human looking; an email goes to a truck that is
already a HatchGrab customer, or to one marked do-not-contact; the cap silently admits more than thirty
because its day is the wrong day; or the message arrives looking generated.

**How it is built:** the real libs compiled from `lib/`, and the real message composed by nodemailer's
`streamTransport` with `buffer: true`. Every refusal it checks is the function the route calls — which is
why `lib/outreach-send-rules.ts` and `lib/outreach-mail-envelope.ts` exist as separate files rather than
as inline blocks in the route. A rule that cannot be run without a database and a mailbox cannot be
proven.

### The broken variants run FIRST and must all FAIL

```
── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────
  ✓ FAILED as required  V1 cap window at UTC midnight: an email sent at 00:30 London is not counted
  ✓ FAILED as required  V2 the confirm requirement removed: an uncertain row retries with no human
  ✓ FAILED as required  V3 the linked-truck rule removed: a HatchGrab truck is a valid outreach target
  ✓ FAILED as required  V4 one spacer div removed: the signature no longer matches the captured bytes
  ✓ FAILED as required  V5 the prefix stripped once: a twice-round thread keeps its old prefixes
  ✓ FAILED as required  V6 an X-Mailer and a prospect-id header added: the composed message is no longer on the allow-list
```

Each variant copies `lib/` to a temp tree, patches one line, recompiles, and asserts the defect is
observable. A patch that does not apply exits 1 rather than passing silently.

### Then the real run — 51 assertions, all passing

```
── THE SIGNATURE, BYTE FOR BYTE ─────────────────────────────────────────────────────────
  ✓ signatureHtml() is the captured Outlook signature exactly
  ✓ both `direction: ltr` spacer divs are present
  ✓ no <a> anywhere in the signature — the domains are plain text
  ✓ the opt-out sentence is present, and its quotes are escaped
  ✓ the text part ends with the same opt-out sentence

── A FIRST CONTACT ──────────────────────────────────────────────────────────────────────
  ✓ a first contact keeps the template subject — no Re:
  ✓ no In-Reply-To
  ✓ no References
  ✓ no quote block
  ✓ the first paragraph is the captured paragraph div
  ✓ paragraphs are separated by an empty div of the same style, not a margin
  ✓ a truck called `Bill & Ben's <Truck>` is escaped, not turned into markup

── A CHASE IS A REPLY IN THREE PLACES AT ONCE ───────────────────────────────────────────
  ✓ the subject is Re: + the parent subject
  ✓ In-Reply-To is the parent
  ✓ References is the parent's own chain PLUS the parent, space-separated
  ✓ RE: FW: RE: is stripped repeatedly, not once
  ✓ Re: is not doubled
  ✓ the reference date is "Friday, 11 September 2026 at 13:07"
  ✓ Outlook's quote container is present
  ✓ the parent's body is inside the reference body div
  ✓ the From line repeats the bare address in both halves, as the captured mail does
  ✓ the Date line is in the quote header
  ✓ the Subject line closes the quote header
  ✓ the signature comes BEFORE the quote block — a reply above the line, as Outlook writes it
  ✓ the text part quotes too

── THE COMPOSED BYTES: THE ALLOWED HEADER SET AND NOTHING ELSE ──────────────────────────
  ✓ no header outside the allow-list (10 names)
  ✓ no X-Mailer — nodemailer does not get to sign the email
  ✓ no List-Unsubscribe, Precedence, Auto-Submitted or X-Priority — none of the bulk markers
  ✓ From is the bare address, as the captured mail has it
  ✓ the Message-ID is the one the row was written with
  ✓ In-Reply-To survives composition
  ✓ References survives composition
  ✓ the Subject is the reply subject
  ✓ both parts are sent: multipart/alternative
  ✓ no tracking pixel and no rewritten link anywhere in the bytes

── THE DAILY CAP COUNTS THE RIGHT ROWS, IN THE LONDON DAY ───────────────────────────────
  ✓ in BST the London day starts at 23:00Z the day before
  ✓ in GMT it starts at 00:00Z
  ✓ the clock-change day itself starts at 23:00Z
  ✓ the day after the change starts at 00:00Z
  ✓ 00:30 London counts — the hour UTC midnight would lose
  ✓ 23:30 London YESTERDAY does not count
  ✓ a test send does not count
  ✓ an inbound reply does not count
  ✓ a failed send does not count — nothing reached anyone
  ✓ an uncertain send DOES count — it may well have gone
  ✓ a row stuck at `sending` DOES count
  ✓ 29 today: the 30th is allowed
  ✓ 30 today: refused, with the reset named

── THE REFUSALS ─────────────────────────────────────────────────────────────────────────
  ✓ an ordinary prospect with an address is sendable
  ✓ do_not_contact is refused
  ✓ a blank address is refused, not sent to nobody
  ✓ 🔴 a prospect linked to a HatchGrab truck is refused — this is what puts a LIVE TRADING TRUCK out of reach
  ✓ do-not-contact is reported first when several apply
  ✓ a failed row retries freely — the server refused it
  ✓ a sent row never retries, confirm or no confirm
  ✓ an uncertain row refuses without the confirm
  ✓ and it tells the UI to ask — needsConfirm
  ✓ with the confirm, the operator may retry

── FAILED vs UNCERTAIN ──────────────────────────────────────────────────────────────────
  ✓ EAUTH — the credentials were refused
  ✓ a rejected recipient
  ✓ any 4xx reply is an answer
  ✓ a timeout mid-conversation is UNKNOWN, not failed
  ✓ a dropped socket is UNKNOWN
  ✓ ⚠️ an unrecognised error lands on the cautious side
  ✓ even nothing at all lands on the cautious side

✅ ALL CHECKS PASSED
```
Exit code **0**.

### 🔴 The harness found a real bug: the cap's day was the wrong day

The cap query bounded its window at `` `${londonDay(new Date())}T00:00:00Z` `` — **UTC** midnight labelled
with the **London** date. For the seven months of British Summer Time, London midnight is 23:00Z the day
before, so every email sent between 00:00 and 01:00 London fell *below* the bound and was never counted.
The cap would have admitted thirty-one or more on a BST morning — silently, and only ever in the
direction of sending more. `londonDayStartUtc` computes the real instant, applying the zone's offset and
then re-reading it at the corrected instant so the clock-change weekend settles too. V1 is that bug,
restored, and it fails as required.

---

## 9. Two harness anchors that had to be restated

**`scripts/outreach-stage-advance.cjs`** read `app/api/admin/outreach/route.ts` for the stage-move
statement, because that route's `log_contact` action *was* the only writer of an outreach rung. Sending
an email must produce the same rung — same kind, same stage move — or the ladder §57 derives from would
disagree with itself depending on which button was pressed. So the block moved, unchanged, into
`lib/outreach-contact-log.ts#logOutreachContact`, and the harness section is **re-anchored, with the move
recorded in the harness file itself** rather than silently re-pointed. None of the assertions is
weakened: each still names the same statement, the same constants and the same
`.eq('stage', DEFAULT_STAGE)` filter. Two were **added** while the anchor was open —
`🔴 THE ROUTE HAS NO SECOND COPY of the stage move` and `🔴 the SEND route logs through the same writer,
not its own insert` — so the extraction cannot be quietly undone by a later copy-paste. 27 pass.

**`app/api/admin/outreach/route.ts` lost two imports**, `DEFAULT_STAGE` and `CONTACTED_STAGE`. They moved
with the code, and the import comment says so explicitly rather than leaving a reader to wonder whether
the vocabulary rule was abandoned.

---

## 10. The three mail-diagnostics fixes

1. **Samples returned `headers: []`.** The cause: `bp.get('header')`. imapflow keys `bodyParts` by the
   section it actually asked for, and for a whole-header fetch that is **the empty string** — so the
   lookup missed every time. Now every plausible spelling is tried, and then any entry that *looks* like
   a header block, so a future imapflow change cannot silently empty it again.
2. **Empty mailboxes guarded with the same helper the new code uses.** `withReadOnlyMailbox` checks the
   count first and reports `skipped`. `fetch('1:*')` on an empty mailbox throws "Command failed", which
   is precisely what produced the diagnostic's two errors against empty Archive and Spam. An empty
   mailbox is a state, not a failure; the response now carries `emptyMailboxes`.
3. **The first-contact sample is chosen only from messages with no `In-Reply-To`.** Matching on the log
   date alone picked chases logged the same day as something else, and a chase is not a specimen of a
   first contact — it carries a quote block and a `Re:` subject, the opposite of what that sample is for.

---

## 11. The admin UI

### The compose window
- **The `mailto:` path is gone.** It could report one thing only — that a compose window was *requested*
  — so it could not be logged, could not be threaded, could not carry more than ~1300 characters
  (measured: a 2000-char URL ceiling, above which the Windows shell truncates the message Outlook opens),
  and depended on whichever account Outlook defaulted to. The From address is now fixed in
  `lib/outreach-mail-config.ts` and cannot be anything else.
- **To, Subject and a full rendered preview** — body, signature and, on a chase, the quote block.
  🔴 The preview HTML is produced by the **server's own `buildMessage` call**, through
  `action: 'preview'`, which runs every refusal above and stops immediately before the insert. A preview
  assembled a second time in the browser would eventually differ from what leaves the building.
- **Send is refused while the preview is stale.** The preview records the exact text it was built from;
  edit anything and both send buttons disable until it is rebuilt. You cannot send a message you have not
  read.
- 🔴 **The preview renders in a sandboxed iframe** (`sandbox=""`, `srcDoc`), not
  `dangerouslySetInnerHTML`. Most of that HTML is ours, but a chase quotes a message that came out of the
  mailbox — arbitrary sender-controlled markup, which injected into the admin page would run behind an
  authenticated admin session.
- **"Send test to me"** sends to `OUTREACH_TEST_RECIPIENT`, logs no contact, and does not count towards
  the cap. It is filed in Sent by the same logic as a real send.
- **Send asks first, and the confirm names the recipient and the truck.** "Are you sure?" prevents
  nothing; the mistake this catches is the right email to the wrong prospect, and only the address on
  screen at the moment of pressing can catch that.
- **"Sent today: N / 30"**, read from the same query and the same window the cap enforces, so the
  displayed number cannot disagree with the check that refuses.
- **The in-flight guard is a ref, claimed before any `await`** — the V13.5 pattern. `sending` is state
  and does not take effect until the next render, so two clicks in one tick would both proceed. That
  defect logged two contacts 0.755 s apart once; here it would send two emails.
- **One idempotency key per exact message**, regenerated only when the text changes. A double press, or a
  press after a reply that never arrived, returns the first send's verdict instead of a second email.
- **A dropped browser connection is never reported as a failure.** The route may well have sent and
  logged it, so the operator is sent to look at the message list rather than told it failed.
- **Copy and Log are untouched** — same plain-text copy, same single writer.

### The prospect modal and the panel
- **"Import past emails"** on the list toolbar. Reports messages read, matched and recorded, plus the two
  mismatch counts.
- **An `Emails` section**, kept deliberately separate from Contact history: the history is what a person
  recorded, this is what the mail server did. When they disagree, both are shown and a person reconciles
  them — neither quietly rewrites the other.
- Each row shows status, `test` / `imported` badges, subject, date, and **no sent copy** where that
  applies. **Retry** appears on `failed` and `uncertain`; on `uncertain` the first press turns the button
  red and reads **"Yes, send again"**, because the server refuses without the confirm flag. **"log it"**
  appears only on a `sent, not logged` row and writes the rung — it sends nothing.

---

## 12. The importer

`POST /api/admin/outreach/mail-import` walks `Sent`, `INBOX`, `Archive` and `Spam` through
`withReadOnlyMailbox` — IMAP **EXAMINE**, so nothing is marked read and no flag changes; running it
cannot alter what Outlook shows.

- **Direction is decided by which side the prospect's address is on, not by the folder.** A prospect's
  message in Archive is still theirs.
- **It writes one table.** Nothing is written to `outreach_contacts`, `outreach_prospects` or
  `discovery_trucks`. Upserts use `{ onConflict: 'message_id', ignoreDuplicates: true }` in chunks of
  200, so an import is additive or a no-op, and re-running it is safe.
- **It reports mismatches rather than reconciling them**: `loggedButUnmatched` (a logged contact with no
  email behind it) and `repliesNotLogged`. Deciding what those mean is a person's job.

---

## 13. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx next build` | exit **0**; `/api/admin/outreach/mail-send`, `/mail-import`, `/mail-diagnostics` all listed as ƒ (dynamic) |
| `node scripts/run-harnesses.cjs` | exit **0** — **60 run · 60 passed · 0 failed** |
| `node scripts/outreach-mail-send.cjs` | exit **0** — 6 variants failed as required, 51 assertions passed |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` — unchanged |

### eslint delta, per rule, against a clean HEAD worktree
Worktree at `f7eb674`, same five changed pre-existing files, same config:

| Rule | clean HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 14 | 14 | **0** |
| `react-hooks/exhaustive-deps` | 1 | 1 | **0** |
| `react-hooks/immutability` | 1 | 1 | **0** |
| `react-hooks/set-state-in-effect` | 9 | 9 | **0** |

**Zero delta on every rule.** The seven **new** files lint with **zero findings of any rule**. An
intermediate run carried `+2 @typescript-eslint/no-unused-vars` from the two constants left behind by the
contact-log extraction; both were removed rather than suppressed.

---

## 14. How to test it, in order

Everything below is safe to stop at any point. Nothing sends without a press of Send.

### Before anything
1. **Apply the migration** (§2) in the Supabase SQL editor, and make sure the final
   `notify pgrst, 'reload schema';` runs with it. Without that line the app will still say sending is
   off, and it will look like the migration failed.
2. **Set `OUTREACH_TEST_RECIPIENT`** in Vercel → Project → Settings → Environment Variables →
   **Production**, to the address you want test sends to arrive at. `OUTREACH_MAIL_USER` and
   `OUTREACH_MAIL_PASSWORD` are already set from the health check. **Redeploy** after adding it —
   environment variables are read at boot.
3. Open the admin outreach page and hard-refresh.

### Step 1 — the mailbox knows what you have already sent
Press **Import past emails** on the list toolbar. It reads the mailbox read-only; nothing is marked read.
Expect a line like *"Read N messages, matched M, recorded K new…"* plus the two mismatch counts. Run it
twice: the second run should record **0 new** — that is the re-runnability working, not a failure.

### Step 2 — send a test to yourself
1. Open **any prospect** → **Compose**, pick a template.
2. Press **Build preview**. Check the To line, the Subject, and the rendered message: your signature,
   the two blank lines above the opt-out sentence, the 12pt body.
3. Press **Send test to me** → confirm.
4. **In Outlook**, check: it arrived at your test address; the signature matches a hand-sent one
   side-by-side; the opt-out line is last and smaller; there is **no** "sent via" or X-Mailer line if you
   view the source.
5. Back in the app, the message list shows a `test` row. It is **not** in the contact history and the
   "Sent today" counter has **not** moved. Both are intentional.

### Step 3 — a first contact to your test prospect
🔴 **Use a test prospect, not a real truck, for this one.** A prospect whose discovery row is linked to a
HatchGrab truck is refused outright; that is the guard, not a test.

1. Open the test prospect → **Compose** → the first-contact template → **Build preview**.
2. The preview should have **no quote block** and the subject should have **no `Re:`**.
3. Press **Send**. The confirm names the address and the truck — read it before confirming.
4. Expect: *"Sent to … A copy is in your Sent folder."*
5. Check three things: **Contact history** has a new outbound rung; **Emails** shows a `Sent` row with no
   "no sent copy" badge; **"Sent today"** has gone up by one.
6. **In Outlook**, the message is in **Sent** — exactly one copy, not two.

### Step 4 — a chaser on the same prospect
1. Same prospect → **Compose** → a chase template → **Build preview**.
2. The preview header should show **"Replies to the last email"**, the subject should be **`Re:` + the
   original subject**, and the quote block should be below your signature with the original underneath
   it, dated like *Friday, 11 September 2026 at 13:07*.
3. Press **Send** and confirm.
4. **In Outlook**, open the prospect's thread: the chase should sit **in the same conversation** as the
   first contact, not as a separate one.

### Step 5 — the refusals, if you want to see them bite
- Open a prospect marked **do not contact** → the send is refused with that sentence.
- Open a prospect linked to a **HatchGrab truck** → refused: *"This row is linked to a HatchGrab truck…"*
- Edit the body after building a preview → both send buttons disable until you press **Update preview**.

### If something goes wrong
- **"May have been sent"** — do **not** press Retry first. Check your Sent folder. If it is there, the
  email went; use **log it** if the row says it was not logged. Only if it is genuinely absent should you
  confirm the retry.
- **"no sent copy"** on a `Sent` row — the email was accepted by the server but the copy is not in Sent.
  The prospect has it; only your own filing is missing.
- **"Sent, not logged"** — the email went and the contact log missed it. Press **log it**. Never Retry.

---

## 15. Build 2 is not in this code

There is no scheduler, no queue drain, no reply poller and no automatic retry anywhere in this build. A
search for a cron entry, a `setInterval`, or a call site that sends without a request finds none: every
send is a `POST` carrying an idempotency key, made by a button press. Build 2 adds the reply poller and
automatic retries, and will need its own decisions about both.

---

## 16. Commit and deploy evidence

**Commit `7beed77`** — *"Send outreach emails from the mailbox over SMTP (manual only)"*, on `main`,
pushed to `origin/main` (`f7eb674..7beed77`). Seventeen files: eleven new, six changed. No other work is
in it.

**Deployed and serving on production, confirmed 2026-09-28T21:25:58Z.** Vercel's CLI here is
unauthenticated, so the deploy is proved by asking production what each path answers with:

| Request | Status | Content-Type | Body |
|---|---|---|---|
| `GET https://www.hatchgrab.com/api/admin/outreach/mail-send` | 404 | `application/json` | `{"error":"Unauthorised"}` |
| `POST https://www.hatchgrab.com/api/admin/outreach/mail-import` | 404 | `application/json` | `{"error":"Unauthorised"}` |
| `GET https://www.hatchgrab.com/api/admin/outreach/mail-diagnostics` | 404 | `application/json` | `{"error":"Unauthorised"}` |
| `GET https://www.hatchgrab.com/api/admin/outreach/does-not-exist-check` | 404 | `text/html` | the app's HTML 404 page |

🔴 **The last row is the control, and it is what makes the other three mean something.** A path that does
not exist returns the rendered HTML 404 page. `{"error":"Unauthorised"}` as `application/json` is the
route's **own** `verifyAdmin` refusal — code that can only be running if it deployed. `mail-import` did
not exist before this commit at all, so its JSON refusal is specific to `7beed77`.

⚠️ **The 404 on the refusal is deliberate, not a bug.** `verifyAdmin` answers 404 rather than 401 so an
admin route does not confirm its own existence to an unauthenticated caller. See §"Admin gate" in the
manual.

Note `hatchgrab.com` 307-redirects to `www.hatchgrab.com`; the checks were made against the canonical
host, because a redirect proves only that the edge answered.

---

## 17. Final state of the working tree

```
On branch main
Your branch is up to date with 'origin/main'.

Changes to be committed — ALL COMMITTED IN 7beed77:

  new file:   supabase/migrations/20260928_outreach_messages.sql
  new file:   lib/outreach-mail-message.ts
  new file:   lib/outreach-mail-envelope.ts
  new file:   lib/outreach-send-rules.ts
  new file:   lib/outreach-mail-box.ts
  new file:   lib/outreach-contact-log.ts
  new file:   app/api/admin/outreach/mail-send/route.ts
  new file:   app/api/admin/outreach/mail-import/route.ts
  new file:   scripts/outreach-mail-send.cjs
  new file:   docs/outreach-mail-send-report.md
  modified:   lib/outreach-mail-config.ts
  modified:   app/api/admin/outreach/mail-diagnostics/route.ts
  modified:   app/api/admin/outreach/route.ts
  modified:   components/admin/ComposeWindow.tsx
  modified:   components/admin/OutreachPanel.tsx
  modified:   scripts/harnesses.json
  modified:   scripts/outreach-stage-advance.cjs

Untracked files:
  (none)

nothing to commit, working tree clean
```

Nothing was staged, committed, stashed, reset or restored beyond this task's own files; `git add -A` and
`git add .` were not used. Two `slot-head-dots-*` worktrees from an earlier session remain listed as
prunable — they are pre-existing and untouched here, and are already on the open-items list.
