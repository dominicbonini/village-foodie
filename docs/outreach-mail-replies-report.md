# Build 2 — picking up replies, recording Outlook-sent mail, and tidying up sends

**29 September 2026.** Follow-up to `docs/outreach-mail-editor-report.md`. **Sending stays manual:
nothing here composes an email.**

**Nothing was sent during this task**, and no mailbox was touched: the harness runs against pure
functions and a source census, with no network and no IMAP connection. **No SQL was run** — the
constraint change Dominic applied by hand on 29 September is recorded in a migration file with an
`APPLIED BY HAND` header. No `outreach_templates` row was created, edited, seeded or deactivated;
`outreach_snippets` was not touched; the linked-truck refusal is unchanged and a linked truck is now
also skipped by the poll. Brevo and every transactional path are untouched.

---

## The shape of it

| Piece | Where |
|---|---|
| The decisions (matching, classifying, watermarks, retries) | `lib/outreach-mail-poll-rules.ts` — pure |
| The run (IMAP, database, ordering) | `lib/outreach-mail-poll.ts` |
| The send, shared with the manual paths | `lib/outreach-mail-deliver.ts` — extracted, not copied |
| The cron, every 10 minutes | `app/api/cron/outreach-replies/route.ts` |
| "Check for replies now" | `app/api/admin/outreach/mail-poll/route.ts` |

🔴 **One routine, two triggers.** `runReplyPoll` is the whole job; the cron route and the button route
are an auth gate each. A scheduled copy that drifted from the manual one is how "it works when I press
it" becomes a bug report nobody can reproduce — and the harness asserts both call the same function.

---

## 1 · The poll, step by step

### It only ever reads
```ts
const res = await withReadOnlyMailbox(client, path, async () => { … })
```
🔴 Every mailbox is opened through `withReadOnlyMailbox`, which issues **EXAMINE** — the server itself
then refuses a flag change — and every fetch emits `BODY.PEEK[…]`. A reply Dominic has not opened is
still unread in Outlook after a poll.

The harness proves this the only way it can be proved without a live mailbox — a **source census** over
the runner:
```
✓ no `messageFlagsAdd` anywhere in the poll      ✓ no `messageMove` …
✓ no `messageFlagsSet` …                          ✓ no `messageCopy` …
✓ no `messageFlagsRemove` …                       ✓ no `messageDelete` …
✓ no `expunge` …                                  ✓ no `mailboxCreate` / `mailboxDelete` …
✓ no direct APPEND — the only one lives in the deliver module
✓ every walk goes through `withReadOnlyMailbox` (EXAMINE)
✓ no mailbox is ever opened writable
```
⚠️ The census strips comments first. The first version did not, and found every banned name inside this
file's own sentence promising they were absent — it reported the promise as the violation.

### The lock
```ts
async function takeLock(supabase: SupabaseClient, now: Date): Promise<boolean> {
  const held = await readSetting(supabase, LOCK_KEY)
  const takenAt = (held as { takenAt?: string } | null)?.takenAt ?? null
  if (lockIsHeld(takenAt, now)) return false
  await writeSetting(supabase, LOCK_KEY, { takenAt: now.toISOString() })
  return true
}
```
🔴 **Why it matters more than it looks.** The message row is unique on `message_id`, so two concurrent
runs cannot both insert it. **The contact log has no such constraint**, so the reply would be logged
twice — one reply, two rungs, and a ladder that cannot be read.

⚠️ **It expires after two minutes** (`LOCK_STALE_MS`). A container frozen mid-poll never releases its
lock, and a lock only a healthy run can clear turns one bad invocation into a permanent outage.
Released in `finally`, always.

### The watermark — the first run processes nothing
```ts
export function planFetch(stored, live): PollPlan {
  if (!stored) return { mode: 'baseline', lastUid: live.highestUid }
  if (String(stored.uidvalidity) !== String(live.uidvalidity)) return { mode: 'rescan', sinceDays: RESCAN_DAYS }
  if (live.highestUid <= stored.lastUid) return { mode: 'none' }
  return { mode: 'incremental', from: stored.lastUid + 1 }
}
```
🔴 **A mailbox with two years of history in it would otherwise be walked on the first poll** and every
old reply logged as if it had just arrived — every contacted prospect jumping to `replied`, every
sequence exited, on a timestamp that is a lie. Recording history is the **importer's** job, which
Dominic runs deliberately and which writes no contact rows at all.

⚠️ **A `uidvalidity` change means the uids are meaningless, not that the mail is new.** The server has
rebuilt the mailbox, so the stored `lastUid` points at some unrelated message. Seven days are re-read
and `message_id` uniqueness makes the overlap a no-op. Both are reported in the summary, because
either one explains a spike.

`advanceWatermark` never goes backwards: a run capped at `MAX_PER_MAILBOX` advances only to what it
actually read, and the rest arrives next time.

---

## 2 · Matching a message to a prospect

```ts
const threadIds = [...messageIdsIn(headers.get('in-reply-to')), ...messageIdsIn(headers.get('references'))]
for (const id of threadIds) {
  const p = byMessageId.get(id)
  if (p) return { kind: 'thread', prospectId: p }
}
…
if (distinct.length === 1) return { kind: 'address', prospectId: distinct[0] }
if (distinct.length > 1) return { kind: 'ambiguous' }
return { kind: 'none' }
```

| Order | Rule | Why |
|---|---|---|
| 1 | `In-Reply-To` or any `References` id is one of **our** Message-IDs | We generated and stored it. A match is certain. |
| 2 | `From` equals exactly **one** prospect's `contact_email`, case-insensitively | An inference, made only when unambiguous. |
| — | More than one prospect on that address | 🔴 **`ambiguous` — counted, nothing stored.** Two prospects sharing an address (a chain, an agency inbox) would otherwise have one chosen at random and a reply attributed to a business that never wrote it. |
| — | From `hello@` or `dominic@hatchgrab.com` | Ignored: our own mail is not a reply to us. |
| — | Anything else | 🔴 **Counted and forgotten.** `hello@` takes order and support mail; most of what this reads is nothing to do with outreach, and it is never stored, logged or named. |

🔴 **A prospect linked to a HatchGrab truck is skipped entirely.** The send route already refuses to
email one; auto-logging its mail would put outreach contacts and a `replied` stage on a row that is not
in the outreach process at all.

---

## 3 · Classifying a matched message

```ts
export function classifyIncoming(h: IncomingHeaders): IncomingKind {
  if (isBounce(h)) return 'bounce'
  if (isAutoReply(h)) return 'auto_reply'
  return 'reply'
}
```
⚠️ **Bounce is tested first, and that ordering is load-bearing.** A delivery report usually carries
`Auto-Submitted: auto-replied`, so the other order files every bounce as an out-of-office and the bad
address is never marked. Broken variant **V3** is that swap.

### Auto-reply — recorded, never logged
Four independent tests, because no single one is reliable:
- `Auto-Submitted` present and not `no` (RFC3834, what well-behaved servers send);
- `X-Autoreply` / `X-Autorespond` (older systems);
- `Precedence` of `auto_reply` / `bulk` / `junk` / `list`;
- a subject starting `Automatic reply`, `Auto:`, `Autoreply`, `Out of Office` — Outlook's and Gmail's
  vacation replies frequently carry none of the above.

🔴 **No contact row, no stage change.** §57.1 exits a prospect's sequence on any inbound *contact* row,
so an out-of-office logged as a reply would stop Dominic chasing a business **because their mail server
was polite while they were on holiday**. The message row is still written, so the Emails list shows
what arrived and View opens it.

### Bounce — the original is marked, nothing is logged
```ts
const originalId = bouncedOriginalId(returned, h)
…
await supabase.from('outreach_messages')
  .update({ status: 'bounced', updated_at: new Date().toISOString() })
  .eq('message_id', originalId).eq('direction', 'outbound')
```
🔴 The Message-ID comes from the **returned copy** (`message/rfc822` or `text/rfc822-headers`), falling
back to `In-Reply-To` then the last `References` id. The report itself is stored as an inbound `bounce`;
the **original outbound row** becomes `bounced`, which is what the list and the modal read.

No contact row and no stage change: a bounce is the absence of a conversation, not one.

### Reply — the row, then the rung, through the one writer
```ts
const logged = await logOutreachContact(supabase, {
  prospect_id: prospectId, channel: 'email', direction: 'inbound', kind: 'reply',
  message: stripQuotedHistory(text ?? ''), contacted_at: m.date,
})
```
🔴 **`logOutreachContact` and not an insert.** It owns the conditional stage move and it is what §57
derives the next step from; a parallel insert here would be a second ladder. The stage rule was added
**inside that writer**:
```ts
} else if (input.direction === 'inbound') {
  const { data: moved, error: sErr } = await supabase
    .from('outreach_prospects')
    .update({ stage: REPLIED_STAGE, updated_at: new Date().toISOString() })
    .eq('id', input.prospect_id)
    .in('stage', REPLY_MOVES_FROM as unknown as string[])
    .select('id, stage')
```
🔴 **`not_contacted` or `contacted` only.** A stage Dominic set by hand — `not_interested`, `signed` —
is never overwritten by a machine reading his mailbox. The filter is inside the statement, so the
condition *is* the write rather than a read followed by a hopeful update. Broken variant **V5** removes
it.

**Quoted history** is cut at the earliest of `-----Original Message-----`, Outlook's rule line, `On …
wrote:`, an Outlook `From:` header block, or `Sent from my …`, and capped at 4,000 characters.
⚠️ It never returns empty: a top-post with nothing above the quote logs the whole message rather than a
blank row, because a blank row reads as "they said nothing" and this is the record Dominic reads later.

### Idempotent on `message_id`
```ts
if (dir.byMessageId.has(m.messageId)) return
```
A message the importer already recorded, or that a previous poll saw, is skipped and never logged twice.

---

## 4 · Outlook-sent mail

A message in Sent addressed to exactly one prospect, whose `message_id` is not already recorded, is
stored as outbound `sent` / `poll` / `server_filed`.

```ts
if (!dir.hasReply.has(prospectId)) return
const logged = await logOutreachContact(supabase, {
  prospect_id: prospectId, channel: 'email', direction: 'outbound', kind: 'reply', …
})
```
⚠️ **Logged only when the prospect has already replied, and then only as `reply`.** Outlook is where
Dominic answers people; the ladder rungs (`1_first_contact` … `4_final_chase`) are what *this page*
sends, and guessing that a hand-sent email was a chase would put a rung on the ladder that §57 then
counts. With no reply on file the message is recorded and nothing is logged — the record is useful, the
inference is not. 🔴 **A ladder kind is never assigned here**, and the harness asserts that by reading
the function.

System-sent messages already have rows and are skipped by `message_id`.

---

## 5 · Housekeeping, in the same run

| Rule | Line |
|---|---|
| A non-test outbound row stuck at `sending` for >10 min → `uncertain` | `if (isStuckSending(row, now))` → `.update({ status: 'uncertain', … }).eq('id', row.id).eq('status', 'sending')` |
| Automatic retry, temporary failures only | `if (shouldAutoRetry(row, now))` → `await deliver(supabase, { ...row, from_name: fromName }, …)` |
| A `sent` row with no copy in Sent → the Save-to-Sent sequence | `const copy = await fileSentCopy({ ...row, from_name: fromName }, raw, …)` |

🔴 **`uncertain`, not `failed`, and never a re-send.** The row was written before the socket opened, so
a stuck one may well have been delivered. "Failed" is the word that makes an operator press Send again;
`uncertain` is the state that already requires a human to confirm before a retry. A **test** send is
never swept — variant **V8**.

🔴 **What retries, and what never does:**
```ts
export function isTemporaryFailure(lastError: string | null | undefined): boolean {
  const e = String(lastError ?? '')
  if (/\bEAUTH\b/i.test(e)) return false
  const numeric = /^(\d{3})\s*:/.exec(e.trim())
  if (numeric) { const code = Number(numeric[1]); return code >= 400 && code < 500 }
  if (/\b5\d\d\b/.test(e) && !/\b4\d\d\b/.test(e)) return false
  return /\b(ECONNECTION|EDNS|ETIMEDOUT|ECONNRESET|ESOCKET|ECONNREFUSED)\b/i.test(e)
}
```
- a **4xx** reply is the SMTP spec's own word for "try later" — greylisting, a full mailbox, a rate
  limit;
- a **connection-class** error never reached a server that could form an opinion;
- 🔴 **never EAUTH** — the password is wrong, and repeated auth failures are how a mail host locks an
  account out;
- 🔴 **never a 5xx** — "no such mailbox" does not become true on the third attempt;
- 🔴 **never an `uncertain` row at all** — the whole point of `uncertain` is that a human looks in Sent
  first.

Plus: within **30 minutes** of creation, and fewer than **3** attempts. A retry sends the **same stored
bytes with the same Message-ID** through the existing `deliver`, and logs exactly as a manual send would
— including the rule that a test never logs.

The Save-to-Sent sequence is the existing one: **search → wait 3 s → search → append**. It never sends.

---

## 6 · What Dominic sees

- **Outreach page:** a **Check for replies now** button beside Import past emails. Its summary reads
  *"N replies logged, N auto-replies, N bounces, N sent from Outlook recorded, N retried, N marked
  uncertain, N copies filed."* then, greyed, *"N ambiguous, N not outreach."* — and, when either
  happened, a sentence about a first look at a mailbox or a mailbox the server rebuilt.
- **Prospect modal → Emails:** each row now names its own status — **Reply**, **Auto-reply**,
  **Bounce**, **Bounced**, **Sent** — with a **from Outlook** badge on poll-recorded outbound mail and
  the existing **imported** / **test** badges. 🔴 The old version said "Reply" for *every* inbound row,
  so an auto-reply and a bounce both read as a reply from the prospect — the two things this build
  exists to tell apart. **View** works on all of them, read-only and sandboxed as before.
- **A bounced prospect** shows **Email bounced** in the list (beside the DNC chip, outside the name
  button) and *"Email bounced — check the address."* above the Emails list in the modal. The flag is
  derived by the list route from the message rows; nothing is stored on the prospect.
- **The Log-a-contact panel** gains one line: *"Email replies are logged automatically — only log
  calls, WhatsApp and anything sent outside this page."*
- The line under the compose buttons is unchanged.

---

## 7 · Harness

`node scripts/outreach-mail-poll.cjs` · **8 broken variants, 113 assertions**, no network and no
mailbox. Registered in `scripts/harnesses.json`.

🔴 **Failure mode, in the order it would hurt:** an out-of-office or a bounce logged as a **reply** —
§57.1 exits a prospect's chase sequence on any inbound contact row, so Dominic silently stops chasing
someone who never answered; a reply logged **twice**, so the ladder shows a conversation that did not
happen; the first run walking two years of history and logging all of it; a reply attributed to the
**wrong prospect** because two share an address; a stage Dominic set by hand overwritten by a machine;
an automatic retry hammering a permanent rejection or a wrong password; or the poll touching the
mailbox at all when it is supposed only to look.

```
── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────
  ✓ FAILED as required  V1 the first run has no baseline: it reads the mailbox from uid 1 and logs all of it
  ✓ FAILED as required  V2 the subject test removed: Outlook's own out-of-office is classified as a reply
  ✓ FAILED as required  V3 auto-reply tested first: a delivery report is filed as an out-of-office and no address is marked
  ✓ FAILED as required  V4 a shared address is resolved to the first prospect: a reply is attributed to the wrong business
  ✓ FAILED as required  V5 the stage filter removed: a reply overwrites a stage Dominic set by hand
  ✓ FAILED as required  V6 the lock never reports itself held: two runs process the same reply
  ✓ FAILED as required  V7 the allow-list defaults to allow: a permanent rejection is retried three times
  ✓ FAILED as required  V8 the test exclusion removed: a stuck TEST send is swept like a real one
```

⚠️ **V7 started as something that proved nothing, and that is recorded in the harness rather than
hidden.** The first draft deleted the `EAUTH` guard and *passed*: EAUTH is refused twice over, once by
its own guard and once by the allow-list's default of "no". Removing either alone changes no outcome.
The guard is still worth having — it states the intent and survives a future widening of the list — but
the **default** is what holds the line, so V7 attacks that instead.

```
── THE WATERMARK: THE FIRST RUN PROCESSES NOTHING ───────────────────────────────────────
  ✓ 🔴 no stored watermark ⇒ baseline at the current top, nothing read
  ✓ nothing new ⇒ nothing fetched
  ✓ three new ⇒ from the one after the watermark
  ✓ 🔴 uidvalidity changed ⇒ re-read 7 days, not 9000 uids
  ✓ and the window is 7 days

── THE WATERMARK ADVANCES, AND NEVER GOES BACKWARDS ─────────────────────────────────────
  ✓ the highest uid seen becomes the watermark
  ✓ 🔴 a capped run advances only to what it read
  ✓ reading nothing leaves the watermark where it was
  ✓ after a rebuild the new validity and its own uids are stored

── MATCHING A MESSAGE TO A PROSPECT ─────────────────────────────────────────────────────
  ✓ 🔴 In-Reply-To matches one of OUR ids — a certain match
  ✓ any id in References matches too
  ✓ otherwise the From address, case-insensitively
  ✓ 🔴 two prospects on one address ⇒ ambiguous, never a guess
  ✓ an unknown sender matches nothing
  ✓ the thread wins when both could match
  ✓ both mailbox addresses are recognised as our own
  ✓ …and a prospect is not
  ✓ a Sent message To exactly one prospect matches it
  ✓ a Sent message to two prospects is ambiguous and stores nothing
  ✓ and ordinary mail matches nothing

── CLASSIFYING: AUTO-REPLY, BOUNCE, REPLY ───────────────────────────────────────────────
  ✓ Auto-Submitted (RFC3834) — the well-behaved marker
  ✓ ⚠️ …and `no` explicitly means it is NOT automatic
  ✓ X-Autoreply
  ✓ X-Autorespond
  ✓ Precedence: bulk
  ✓ Precedence: auto_reply
  ✓ …but not an ordinary Precedence
  ✓ subject "Automatic reply: hello"
  ✓ subject "Auto: away"
  ✓ subject "Autoreply"
  ✓ subject "Out of Office until Monday"
  ✓ a real reply subject is not auto
  ✓ mailer-daemon@ is a bounce
  ✓ so is postmaster@
  ✓ so is a multipart/report delivery-status body, whatever the From
  ✓ an ordinary reply is not
  ✓ 🔴 a delivery report carrying Auto-Submitted is a BOUNCE, not an out-of-office
  ✓ everything else is a reply

── WHICH EMAIL A BOUNCE IS ABOUT ────────────────────────────────────────────────────────
  ✓ 🔴 the id inside the RETURNED copy is the authority
  ✓ with no returned part, In-Reply-To is the fallback
  ✓ …then the LAST id in References, which is the nearest parent
  ✓ and nothing at all is null, not a guess

── THE REPLY TEXT: QUOTED HISTORY REMOVED ───────────────────────────────────────────────
  ✓ "On … wrote:" is cut
  ✓ an Outlook "From:" header block is cut
  ✓ "-----Original Message-----" is cut
  ✓ ⚠️ a reply with nothing above the quote logs the whole message, not a blank
  ✓ capped at 4000 characters
  ✓ …and says it was cut
  ✓ a reply with no quote is itself, trimmed

── THE STAGE: A REPLY MOVES contacted → replied, AND NOTHING ELSE ──────────────────────
  ✓ the rung is written
  ✓ 🔴 contacted → replied, reported back
  ✓ the update sets `replied`
  ✓ 🔴 …only FROM not_contacted or contacted — a hand-set stage is never overwritten
  ✓ the contact row is inbound
  ✓ and its kind is `reply` — the ladder's rungs are outbound-only
  ✓ the two source stages are declared, not inlined

── HOUSEKEEPING: STUCK SENDS AND WHICH FAILURES RETRY ───────────────────────────────────
  ✓ a real send stuck at `sending` for 11 minutes is swept
  ✓ …but not one 5 minutes old
  ✓ ⚠️ a TEST send is never swept — it changes nothing and needs no verdict
  ✓ and a sent row is left alone
  ✓ a 4xx SMTP reply is temporary
  ✓ so is a 450
  ✓ 🔴 a 5xx is PERMANENT — it never becomes true
  ✓ 🔴 EAUTH is never retried — that is how accounts get locked
  ✓ a connection timeout is temporary
  ✓ so is ECONNECTION
  ✓ so is EDNS
  ✓ a rejected message is not
  ✓ and an error nobody recorded is not retried on a guess
  ✓ recent, temporary, under the ceiling ⇒ retry
  ✓ 🔴 older than 30 minutes ⇒ no
  ✓ 🔴 3 attempts ⇒ no
  ✓ 🔴 EAUTH ⇒ no
  ✓ 🔴 a 5xx ⇒ no
  ✓ 🔴 an `uncertain` row is NEVER auto-retried — the whole point is that a human checks Sent first

── THE LOCK ─────────────────────────────────────────────────────────────────────────────
  ✓ a run 10 seconds old holds the lock
  ✓ ⚠️ …and a run 5 minutes old does NOT — a frozen container must not disable the feature forever
  ✓ no lock is no lock
  ✓ and an unreadable one is not treated as held
  ✓ the staleness window is 2 minutes

── SOURCE CENSUS: THE POLL ONLY EVER READS ──────────────────────────────────────────────
  ✓ no `messageFlagsAdd` / `messageFlagsSet` / `messageFlagsRemove` anywhere in the poll
  ✓ no `messageMove` / `messageCopy` / `messageDelete` / `expunge` anywhere in the poll
  ✓ no `mailboxCreate` / `mailboxDelete` anywhere in the poll
  ✓ no direct APPEND — the only one lives in the deliver module
  ✓ every walk goes through `withReadOnlyMailbox` (EXAMINE)
  ✓ no mailbox is ever opened writable
  ✓ 🔴 the poll never calls sendMail itself
  ✓ …the only send is `deliver`, on a row that already exists
  ✓ …and only when `shouldAutoRetry` says so
  ✓ contacts are written through the one writer
  ✓ 🔴 …and never inserted beside it
  ✓ a linked HatchGrab truck is skipped
  ✓ …identified by its linked truck id, as the send route does
  ✓ 🔴 an auto-reply writes NO contact row
  ✓ 🔴 a bounce writes NO contact row either
  ✓ …it marks the ORIGINAL outbound row `bounced`
  ✓ 🔴 a message already recorded is skipped
  ✓ unmatched mail is counted…
  ✓ …and nothing about it is stored or named
  ✓ 🔴 Outlook-sent mail is logged only when the prospect has already replied
  ✓ …and never as a ladder rung — the rungs are what THIS page sends

── THE CRON IS REGISTERED ───────────────────────────────────────────────────────────────
  ✓ vercel.json has the /api/cron/outreach-replies entry
  ✓ …every 10 minutes
  ✓ and it authenticates with CRON_SECRET, exactly like the other cron routes
  ✓ 🔴 it runs the SAME routine as the button, not a copy
  ✓ …and so does the button
  ✓ nodejs runtime, 60s

✅ ALL CHECKS PASSED
```

---

## 8 · The migration, recorded not run

`supabase/migrations/20260929_outreach_messages_poll_states.sql` carries an **APPLIED BY HAND on 29
September 2026** header. It widens two check constraints and removes nothing, so every existing row
still satisfies them and no data migration was needed:

- **status** gains `bounced` (an *outbound* row the mail system reported undeliverable), `auto_reply`
  (an inbound out-of-office — recorded, never logged) and `bounce` (the inbound delivery report).
- **source** gains `poll`, beside `system` and `mailbox_import`.

⚠️ `bounced` goes on the **original outbound** row, not the report, so the prospect's own email row is
the one that says the address is bad.

---

## 9 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx next build` | exit **0**; `/api/admin/outreach/mail-poll` and `/api/cron/outreach-replies` both listed as ƒ (dynamic) |
| `node scripts/outreach-mail-poll.cjs` | exit **0** — 8 variants failed as required, 113 assertions passed |
| `node scripts/run-harnesses.cjs` | exit **0** — **61 run · 61 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` — unchanged |

### eslint delta, per rule, against a clean HEAD worktree (`bc7ab41`)

| Rule | clean HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 14 | 14 | **0** |
| `react-hooks/immutability` | 1 | 1 | **0** |
| `react-hooks/set-state-in-effect` | 7 | 7 | **0** |

**Zero delta on every rule.** The five new files — `lib/outreach-mail-poll.ts`,
`lib/outreach-mail-poll-rules.ts`, `lib/outreach-mail-deliver.ts`,
`app/api/cron/outreach-replies/route.ts` and `app/api/admin/outreach/mail-poll/route.ts` — lint with
**zero findings of any rule**.

⚠️ Extracting `deliver` and `fileSentCopy` out of the send route left five unused imports behind
(`nodemailer`, `OUTREACH_SENT_MAILBOX`, `classifySendFailure`, `findInSent`, `appendToSent`). They were
removed rather than suppressed.

### 🔴 One existing harness had to be re-anchored, and it is recorded rather than quietly re-pointed
`scripts/outreach-mail-send.cjs` reads the send route's source to prove the Sent-copy sequence. Moving
`deliver` and `fileSentCopy` into `lib/outreach-mail-deliver.ts` broke **seven** of those assertions.
Every one now reads the module that holds the code, and **not one is weakened** — each still names the
same statement in the same order (compose once → send those bytes → search → wait → search → append →
record the reason). ⚠️ **Two were ADDED while the anchor was open**, so the extraction cannot be quietly
undone:

```
✓ the route IMPORTS the send rather than defining it
✓ 🔴 …and has no second copy of either
```
The note explaining the move sits in the harness file, at the assertions it governs.

---

## 10 · Files

### New
| File | What it is |
|---|---|
| `lib/outreach-mail-poll-rules.ts` | Watermarks, the lock, matching, classification, quote-stripping, the retry rules. Pure. |
| `lib/outreach-mail-poll.ts` | The run: IMAP, the database, the ordering. Read-only in the mailbox. |
| `lib/outreach-mail-deliver.ts` | `deliver` and `fileSentCopy`, extracted from the send route so the poll's retry is not a copy. |
| `app/api/cron/outreach-replies/route.ts` | The 10-minute cron, gated on `CRON_SECRET`. |
| `app/api/admin/outreach/mail-poll/route.ts` | "Check for replies now". |
| `supabase/migrations/20260929_outreach_messages_poll_states.sql` | The record of the constraint change. |
| `scripts/outreach-mail-poll.cjs` | The harness. |

### Changed
| File | What changed |
|---|---|
| `lib/outreach-contact-log.ts` | The inbound branch: `not_contacted`/`contacted` → `replied`, conditionally. |
| `app/api/admin/outreach/mail-send/route.ts` | Imports `deliver`/`fileSentCopy` instead of defining them. |
| `app/api/admin/outreach/route.ts` | Derives `emailBounced` for the list. |
| `components/admin/OutreachPanel.tsx` | The button and its summary, the status badges, the bounce flag and line, the log-panel note. |
| `vercel.json` | The cron entry. |
| `scripts/harnesses.json` | Registers the harness. |

---

## 11 · Test script for Dominic

🔴 **ZZ Test Prospect (Dominic)** — prospect `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`, address
`dominicbonini@hotmail.com` — is the only prospect to test with.

### 1 · A first look costs nothing
Press **Check for replies now** once. Expect a summary saying **first look at INBOX, Spam, Archive,
Sent — older mail was left alone**, with everything at 0.

🔴 **That is the design, not a failure.** The first run records where the mailboxes are and processes
nothing older; auto-logging two years of history would move every contacted prospect to `replied` and
end their sequences. Use **Import past emails** for history — it writes no contact rows.

### 2 · A real reply
1. Open **ZZ Test Prospect (Dominic)** → **Compose** → send a real first contact (the previous report's
   script covers this; the subject must not be `Re:` and the stage must move to `contacted`).
2. In **Hotmail**, reply to it. Write a couple of lines and leave the quoted original below them.
3. **Do not open it in Outlook.**
4. Back on the outreach page, press **Check for replies now**.

Expect:
- the summary says **1 reply logged**;
- the prospect's **stage is `replied`**;
- **Contact history** has one inbound `reply` row, dated when the reply was sent, whose text is what
  you typed **without the quoted original**;
- **Emails** shows a **Reply** row — press **View** and the whole email opens;
- 🔴 **in Outlook, the reply is still unread.** Every folder was opened with EXAMINE and every fetch
  was a peek. This is the check that proves the poll only looks.

### 3 · It does not log the same email twice
Press **Check for replies now** again immediately. Expect **0 replies logged** and no second row in
Contact history — the message is skipped on its `message_id`.

Then reply **again** from Hotmail and press it once more: **1 reply logged**, a second row. Two
different emails are two contacts; the same email is one, however often you check.

### 4 · The cron
It runs every ten minutes on its own. To confirm it is live, wait ten minutes after a new reply without
pressing anything — the reply should already be logged when you next look.

### 5 · Optional — a bounce
⚠️ Do this on the test prospect only, and put the address back afterwards.
1. On the test prospect's truck row, change the contact email to something that does not exist at a
   real domain, e.g. `nobody-at-all-9f2@hatchgrab.com`.
2. **Compose** and **Send** a message to it. It will be accepted by the server and bounce a moment later.
3. Wait a minute, then press **Check for replies now**.

Expect:
- the summary says **1 bounce**;
- the message you sent now reads **Bounced** in the Emails list;
- *"Email bounced — check the address."* appears above that list;
- **Email bounced** appears on the prospect's row in the outreach list;
- 🔴 **no contact row and no stage change** — a bounce is the absence of a conversation.
4. **Set the email back to `dominicbonini@hotmail.com`.** The bounce flag stays until that bounced
   message row is gone, which is correct: it records that an email to this prospect failed.

### 6 · An auto-reply, if you want to see one
Turn on an out-of-office in Hotmail, reply to a sent message, press the button. Expect **1 auto-reply**,
an **Auto-reply** row in Emails, and — deliberately — **no contact row and no stage change**. Turn the
out-of-office back off.

