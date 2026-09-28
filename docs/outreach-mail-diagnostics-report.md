# A read-only mailbox diagnostic: what the real outreach emails look like, and who they went to

**Date** 28 September 2026 · **Diagnose-only.** Nothing is sent, no flag is changed, no database row is
written, no migration was created and no SQL is waiting for anyone to run. No truck and no prospect is
acted on; the route reads Dominic's own mailbox and two outreach tables.

**🔴 This report describes the CODE only.** It contains no prospect email address, no message content and
no header value. Those exist only in the JSON the route returns to Dominic's browser.

---

## Files

| path | what it is |
|---|---|
| **`app/api/admin/outreach/mail-diagnostics/route.ts`** | the route |
| **`lib/outreach-mail-format.ts`** | the pure half — redaction, skeletonisation, MIME walk, matching. No I/O, so every rule is provable without a mailbox |
| **`scripts/outreach-mail-format.cjs`** | the harness for that module |
| `scripts/harnesses.json` | registers it (the suite is now 59) |

Reused unchanged: `lib/outreach-mail-config.ts` (host and IMAP port), the `OUTREACH_MAIL_USER` /
`OUTREACH_MAIL_PASSWORD` variables, `verifyAdmin` with the **404** refusal, the same `sanitise()`, and
`logger: false` with no `console.*` anywhere.

`runtime = 'nodejs'`, `maxDuration = 60`, `dynamic = 'force-dynamic'`. Six mailboxes are opened and
walked, so §35 applies: the route declares the budget its caps are sized against.

---

## Proof: every mailbox is opened READ-ONLY

All three opens, quoted in full — there is no fourth:

```
176:      const lock = await client.getMailboxLock(SENT_BOX, { readOnly: true })
205:        const lock = await client.getMailboxLock(path, { readOnly: true })
271:        const lock = await client.getMailboxLock(SENT_BOX, { readOnly: true })
```

`readOnly: true` issues IMAP **EXAMINE** rather than SELECT. **The server itself then refuses to let the
session set a flag** — that guarantee is not mine to get wrong. `mailboxOpen` is never called; the lock
form is used so the three sequential opens on one connection cannot interleave.

## Proof: every fetch is a peek

All three fetches — again, there is no fourth:

```
180:        for await (const msg of client.fetch('1:*', { uid: true, envelope: true, bodyStructure: true })) {
208:          for await (const msg of client.fetch('1:*', { uid: true, envelope: true })) {
285:              const msg = await client.fetchOne(String(w.hit.uid), { uid: true, bodyParts: parts }, { uid: true })
```

The first two ask for `envelope` and `bodyStructure` only — metadata commands that read no body. The third
is the only one that reads body bytes, and it goes through the same `fetch` machinery, which emits
`BODY.PEEK[…]`. From imapflow's own source, `node_modules/imapflow/dist/cjs/commands/fetch.js`:

```js
// Helper to build BODY.PEEK[section]<partial> or BINARY.PEEK[section]<partial> atoms.
// PEEK avoids marking messages as \Seen. …
value: `${binaryAddressable ? commandKey : 'BODY'}.PEEK`,
```

**Two independent guarantees, one of them the server's.** `client.download()` is never called — it is the
one imapflow API that can mark a message seen.

## Proof: no send, no flag, no move, no destruction, no DB write

Greps over the route. **Every hit is inside a comment that names the rule; there is no call site.**

```
══ FORBIDDEN IMAP CALLS ══     messageFlagsAdd|messageFlagsSet|messageFlagsRemove|.append(|
                               messageMove|messageCopy|messageDelete|.expunge(|setFlags|addFlags
  17://     … `messageFlagsAdd`, `messageFlagsSet`
  18://     and `messageFlagsRemove` appear nowhere here.
  19://   • IT CANNOT MOVE OR DESTROY ANYTHING. No `append`, `messageMove`, …

══ FORBIDDEN SEND ══           sendMail|nodemailer
  13://   • IT CANNOT SEND. There is no nodemailer import and no `sendMail` anywhere in this file.

══ DB verbs used ══            supabase.*|.select(|.insert(|.update(|.upsert(|.delete(|.rpc(
  117:      .select('prospect_id, contacted_at, direction, kind')
  140:        .select('id, discovery_truck_id, discovery_trucks(name, contact_email)')

══ logging ══                  console.
  (no console.* in either new TypeScript file)
```

**`.select()` is the only database verb in the file.** The client is the same
`createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` the outreach route uses;
it *could* write, and the proof that nothing does is that no other verb appears.

**Attachments are never downloaded.** `attachmentsOf` walks the body STRUCTURE for filename, content type
and size. The Part B fetch names only `HEADER` and the two text part numbers, so no attachment part is
ever transferred.

---

## What it returns

`{ region, generatedAt, counts, cappedMailboxes, prospects, samples, errors }`. Every step's failure is
caught, sanitised and pushed to `errors`; **no step is fatal to the rest**.

### Part A — prospects

Every prospect with at least one `outreach_contacts` row where `channel = 'email'`, joined to its truck.

🔴 **The address is `discovery_trucks.contact_email`, read through the same embed
`app/api/admin/outreach/route.ts` uses** — that route both reads it and writes it there, so the column was
confirmed rather than guessed.

Per prospect: `prospect_id`, `name`, `email`, `log: [{contacted_at, direction, kind}]`, `sent[]` and
`replies: { inbox[], archive[], spam[] }` — the three reply folders counted separately.

⚠️ **A prospect with no address is reported, not skipped**: it comes back with `email: null` and
`noEmailAddress: true`. A prospect logged as emailed with no address on its truck is the most interesting
row in the output, not one to drop quietly.

Matching is by **address**, lower-cased on both sides: a Sent message belongs to a prospect when its
envelope `To` or `Cc` contains the address; a reply when its `From` does. One pass per mailbox, then
grouping in memory — six folder walks, not one search per prospect.

### Part B — format samples

Up to two, chosen from Part A: the most recent Sent message whose **date matches a `1_first_contact` log
date**, and the most recent matching a chase (`2_chase_1` / `3_chase_2` / `4_final_chase`).

🔴 **Matched by address and DAY, never by log order.** `contacted_at` on a manually dated row is midnight,
so two rows on one day carry the same instant and their stored order says nothing. `sameDay` compares the
calendar date in `Europe/London`.

Each sample returns `headers`, `mimeTree`, `htmlSkeleton` (+ `htmlSkeletonCapped`) and `plainSkeleton`
(+ `plainSkeletonCapped`).

---

## The redaction rules, as implemented

### Received-line IPs

`redactReceivedIps` touches **only headers whose name is `Received`**, case-insensitively. IPv6 is
replaced first so an IPv4-mapped form (`::ffff:a.b.c.d`) is not half-eaten by the IPv4 pass.

| input | output |
|---|---|
| IPv4 `a.b.c.d` | `a.x` |
| IPv6 `w:x:y::z` | `w.x` |

⚠️ **Nothing outside a `Received` line is touched.** A blanket IP regex over the whole header block would
mangle a `Message-ID` or a DKIM signature that happens to contain four dot-separated numbers — the harness
asserts a `Message-ID` shaped like an IP survives intact, and that a non-`Received` header does too.

### Body skeletonisation

Markup is kept **byte for byte**: every tag, attribute, `style=`, `class=`, `<br>`, `<p>` and the spacing
between them. Only **text nodes** are replaced, each by `[text:N]` where N is its length. `<style>`,
`<script>` and comment contents are markup, not prose, and pass through untouched — a mangled stylesheet
would misrepresent the very format this capture exists to record.

**🔴 ONE PLACE THE BRIEF NEEDED RECONCILING, AND WHAT I DID.** Two of its rules meet here:

1. *"every text node BEFORE the one containing 'Kind regards' replaced … from 'Kind regards' onward keep
   text verbatim"*, and
2. *"if the message quotes an earlier email … keep the quote's header block verbatim and **skeletonise the
   quoted body text** the same way"*.

Read literally the first makes the second impossible: a chase quotes an earlier mail that ends in its own
"Kind regards", so "verbatim from there on" would swallow the quoted body the second rule asks to measure.
**So "Kind regards" opens a signature RUN rather than switching the whole document, and a quote header
line (`From:`, `Sent:`, `To:`, `Subject:`, `Date:`, `Cc:`, `Bcc:`, `Reply-To:`) CLOSES it.** Those lines
are themselves verbatim; the quoted body after them goes back to being measured; a second "Kind regards"
inside the quote opens the next run. Both sentences then hold, which a strict reading of either alone does
not. Flagged rather than chosen silently.

**A bug the harness caught, worth recording.** Outlook bolds the quote's labels, which splits a header
line into two text nodes — the label, then the value. Matching only the label kept it verbatim and then
**measured the value**, cutting the header block in half. A *bare* label (nothing after the colon) now
says "the next text node is my value, keep it too"; a label that already carries its value on the same
node claims no follow-on, so an ordinary body line after a one-node header is still measured.

`text/plain` follows the same rule line by line, blank lines kept so the shape survives. Both cap at
**40,000 characters** and report `…Capped: true` when they bite.

---

## The harness — `scripts/outreach-mail-format.cjs`

**Failure mode:** a capture that is useless or unsafe — markup mangled so a template built from it would
not match what Outlook sends; body text surviving into a diagnostic meant to record shape; or a sending
host's IP left in a `Received` line.

**All three broken variants ran FIRST and FAILED as required:**

```
  ✓ FAILED as required  V1 measurement removed: body prose is in the output
  ✓ FAILED as required  V2 the quote header stops closing the run: the quoted body is verbatim
  ✓ FAILED as required  V3 redaction removed: the full IPv4 is still in the Received line
```

**The real tree — 33 assertions, all passing**, over a synthetic Outlook-shaped chase (fixture written for
the harness; no real message is involved): the markup survives byte for byte, the prose does not, the
signature and the quote header block are verbatim, the quoted body is measured, IPv4 and IPv6 are redacted
in `Received` lines only, headers keep their order and folding, the MIME tree nests with charset and
encoding, attachments are metadata only, the HTML part is addressed by part number so only it is fetched,
a midnight log row matches a message sent that day and not the next, and the cap reports itself.

⚠️ **Two of my own assertions were wrong and the harness said so**, recorded because both are easy to
repeat: a character count I did by eye, and a cap fixture built from a 60,000-character paragraph —
measuring *shrinks* prose to `[text:60000]`, thirteen characters, so only markup can ever reach the cap.

---

## Verification

| command | result |
|---|---|
| `npx tsc --noEmit` | **exit 0**, no output |
| `npx next build` | **exit 0**; route listed as `ƒ /api/admin/outreach/mail-diagnostics` |
| `npx eslint` on the two new TS files | **clean** |
| `npx eslint scripts/outreach-mail-format.cjs` | 4 `@typescript-eslint/no-require-imports` — the house pattern every `.cjs` harness reports |
| `node scripts/run-harnesses.cjs` | **exit 0** — 59 run · 59 passed · 0 failed |

Both goldens untouched; no generator was run.

## Commit and deploy

**Commit `080059b`**, pushed `95327c3..080059b  main -> main`. Exactly five files, nothing else staged:

```
app/api/admin/outreach/mail-diagnostics/route.ts
docs/outreach-mail-diagnostics-report.md
lib/outreach-mail-format.ts
scripts/harnesses.json
scripts/outreach-mail-format.cjs
```

**Deploy evidence** — the same test as last time, and stronger than a dashboard badge because it proves
*this commit's code is serving*:

| request | before | after |
|---|---|---|
| `GET /api/admin/outreach/mail-diagnostics` | `404` · `text/html` · the Next 404 page | **`404` · `application/json` · `{"error":"Unauthorised"}`** |

Confirmed live **72 seconds after the push**. That JSON body is the route's own `verifyAdmin` refusal and
cannot come from a path that does not exist — `GET /api/admin/outreach/no-such-route` on the same host,
checked at the same moment, still returns the HTML 404 page. (The Vercel CLI on this machine is not
authenticated and the repo has no `.vercel` link, so the dashboard state could not be read directly; this
is the stronger evidence anyway, because it proves the code is serving rather than that a build finished.)

## The URL to open

While signed in as admin in Safari:

```
https://www.hatchgrab.com/api/admin/outreach/mail-diagnostics
```

Give it up to a minute: it opens six mailboxes in sequence. `counts` tells you how many messages each
folder held, and `cappedMailboxes` names any folder that hit the 2,000-message ceiling.

---

## Anything I could not establish

- **Whether the matching actually finds anything.** That needs the production mailbox and the live
  outreach tables, neither of which exists on this machine. The route is written so a miss is visible
  rather than silent: `counts` shows what was read, a prospect with no address says so, and every step's
  error is reported separately.
- **The real message format.** That is the output, not something I can predict. If the two samples come
  back `null`, the likely cause is that no Sent message's date lands on a logged contact day — the
  `counts` and each prospect's `sent[]` will show whether the messages are there at all.
