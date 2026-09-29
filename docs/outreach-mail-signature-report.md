# The signature as a token, a signature editor, email viewing, and three defects

**29 September 2026.** Follow-up to `docs/outreach-mail-send-report.md` and
`docs/outreach-mail-send-fix-report.md`. Manual sending only, as before.

**Nothing was sent during this task.** Every message here was composed with nodemailer's
`streamTransport` (`buffer: true`) — bytes to memory, no socket. **No SQL was run.**
`supabase/migrations/20260929_outreach_settings.sql` is a record of what Dominic applied by hand, not a
pending change. No `outreach_templates` row was created, edited, seeded or deactivated;
`outreach_snippets` was not touched; no live trading truck was contacted and the linked-truck refusal is
byte-identical. Brevo and every transactional path are untouched.

---

## Summary

| # | Item | Status |
|---|---|---|
| 1 | `{{signature}}` and `{{opt_out}}` as send-time tokens; no automatic append | Done |
| 2 | "Added below your message" panel removed; chaser note under the text box | Done |
| 3 | Signature panel on the Templates tab | Done |
| 4 | First contact always starts a new thread; chasers reply to the latest email either way | Done |
| 5 | View on every email row | Done |
| 6 | The Sent copy — cause found, raw bytes sent and filed, reason recorded, Save to Sent | Done |
| 7 | The text/plain part carries no HTML | Done |
| 8 | Stage moves on a real send, not on a test | Confirmed and asserted |

---

## 1 · Two send-time tokens

### Why they are not resolved with the rest
`lib/outreach-signature.ts` holds the reasoning. Two reasons, and the second is the one that matters:
the box would otherwise show eleven lines of signature the operator cannot usefully edit; and the
signature would then be **editable text in the box**, so an accidental edit — or a trimmed paragraph —
would change the opt-out line, which is a legal line under PECR. A token cannot be half-deleted: it is
there or it is not, and the window says which.

### How they survive the compose renderer
They resolve **to themselves**, in `resolvedValue`:

```ts
case 'signature': return '{{signature}}'
case 'opt_out': return '{{opt_out}}'
```

🔴 That one placement does three jobs at once, which is why it is there rather than a special case in
`substitute`:
- `substitute` replaces the token with itself, so it reaches the text box untouched;
- `unresolvedIn` never sees it, so it is **not** listed as "still to fill" — it is deferred, not
  outstanding. (Left unknown it would render `[[signature]]` and put an unfillable field on every
  message.)
- `resolvedTokenReference()` reads these `case` labels out of the function's own source, so both tokens
  appear in the Templates tab's reference **automatically** and cannot be forgotten there.

The malformed-token guard already accepts them: `{{signature}}` matches `[a-z_]+`. `{{Signature}}` is
still reported, as it must be.

### The HTML
`signatureLineHtml` — one 12pt div per stored line, bold **inside** the div:

```ts
export function signatureLineHtml(line: SignatureLine): string {
  const inner = line.text.trim() === '' ? '<br>' : escapeHtml(line.text)
  return div(SIG_P_STYLE, line.bold ? `<b>${inner}</b>` : inner)
}
```

🔴 **This is the "Dominic Bonini rendered smaller" bug.** The captured block emitted
`<div><b>Dominic Bonini</b></div>` — a div with **no font style at all** — so that one line inherited
the mail client's default size. Bold is a property of the text, not a reason to drop the style. Broken
variant **V4** restores the unstyled div and must fail; it does.

`{{opt_out}}` becomes one div at `font-size: 13.333333px`, same family and colour.

### Spacing
`expandBody` keeps the paragraph model exactly as it was — paragraphs split on a blank line, one empty
styled div between them, internal newlines as `<br>` — and treats a token line as a block inside it. So
the gap before "Kind regards," is whatever blank line the template has, which is the point of placing
it, and is the missing blank line Dominic saw.

### Copy and Log
Both emit `expandToPlainText(fullText, settings)`. 🔴 The contact log is the record of what was sent; a
row holding `{{signature}}` is not a record of an email anybody received. The **send** does not use the
browser's copy of the settings — the server reads the table itself, so a stale browser value can never
become the email.

### The refusal
```ts
const settingsRead = await readOutreachSettings(supabase)
if (settingsRead.error) {
  return refuse(`Your signature settings could not be read (${settingsRead.error}), so nothing was sent.`)
}
const missingSettings = missingSettingsFor(bodyIn, settingsRead.values)
if (missingSettings.length) {
  return refuse(`Your signature settings could not be read (no ${missingSettings.join(' or ')} row in outreach_settings), so nothing was sent.`)
}
```
🔴 A missing row is a **refusal, not a blank**. `{{opt_out}}` in a template is an assertion that this
email carries an opt-out line; expanding it to nothing would send a cold approach without one and leave
no trace. ⚠️ A body that mentions neither token needs neither row and is unaffected.

### Warnings
`sendWarnings(body, kind)` returns up to two sentences. They appear **in the footnote line under the
buttons** (amber and semibold when present, replacing the usual grey note) and are **repeated in the
Send confirm**, which is the last moment at which "this has no opt-out line" can still change the
answer.

⚠️ Warnings, not refusals, deliberately: nothing in the codebase can know that a message is a cold
approach rather than a reply to a question — `kind` is the operator's own word for it. The opt-out
warning fires only on the four ladder rungs.

### What this costs, stated plainly
**Nothing appends a signature or an opt-out line any more.** A template without the tokens sends
without them and no code path refuses it. That is deliberate — "send exactly this text" is a thing an
operator is allowed to mean — but it is a real loss of a guarantee, and it is written into
`lib/outreach-mail-message.ts` where the automatic append used to be, not just into this report.

---

## 2 · The compose window is the message and nothing else

**Removed:** the "Added below your message" panel and its rendered signature. There is nothing to
preview any more — the signature is placed by a token that is **visible in the box**, and its lines are
read and edited on the Signature tab.

**Kept, and moved:** the one thing the box genuinely cannot show — that this message will be sent as a
reply. It now sits **directly under the text box**, where the reply it describes is being written:

> Sends as a reply to “*subject*” (11 Sep 2026, 13:07). The earlier email is quoted under your
> signature.  **Show**

🔴 The quoted email stays in a sandboxed iframe (`sandbox=""`, `srcDoc`): it came out of the mailbox, so
its markup is sender-controlled and would otherwise run behind an authenticated admin session. It is
fetched only when **Show** is pressed — opening the compose window opens no IMAP connection.

The label above the textarea was also corrected. It said the opt-out *"must be in your Outlook
signature"*, which stopped being true the day this window started sending: the email is built here, so
Outlook's signature never touches it.

---

## 3 · The Signature panel

A third view on the Templates tab, beside Templates and Snippets — 🔴 a view and not a rail tab for the
same reason Snippets is one: the signature is **global**, so a tab inside the per-template rail would be
unreachable with nothing selected.

**Left:** the ordered lines. Each is a text input with a **Bold** tick and ↑ / ↓ / ✕ buttons; an empty
input is a blank line and says so in its placeholder. **Add a line** appends. Below them, one
**Opt-out line** input.

**Right:** a live preview.
🔴 **Rendered by `signatureBlockHtml` and `optOutHtml` — the functions `buildMessage` calls.** A preview
drawn by a second implementation would be the one thing worse than no preview: it would be believed.

**Save** posts to `/api/admin/outreach/settings`, which parses with the **same** `parseSignature` /
`parseOptOut` the sender uses (a shape the route accepted but the sender could not read would save
happily and then refuse every send), writes exactly the two keys, and **reads the rows back** so the
screen shows what the table holds rather than what was posted. The opt-out cannot be saved empty.

---

## 4 · Threading

### The defect
A first contact to ZZ Test Prospect went out as **"Re: Test email to me again"**. Two things combined:
the importer had matched Dominic's own September test emails to that prospect's address, so the prospect
had earlier-outbound rows; and the rule was *"reply whenever any earlier outbound email exists"*, with no
reference to the rung being sent.

### The rule
```ts
const FIRST_CONTACT_KIND = '1_first_contact'
export function startsNewThread(kind: string | null): boolean {
  return kind === FIRST_CONTACT_KIND
}
```
and in the send, **before the lookup**:
```ts
const firstContact = startsNewThread(sendKind)
const parentRow = firstContact ? undefined : await threadParent(prospectId)
```
🔴 A first contact never even looks for a parent. If the lookup ran first the lookup would decide and the
rule would be decoration.

Every other kind replies to the most recent **non-test** message **in either direction**:
```ts
.eq('prospect_id', prospectId).eq('is_test', false)
.in('status', ['sent', 'uncertain', 'received'])
.order('message_date', { ascending: false, nullsFirst: false })
```
⚠️ Either direction is itself a change. It used to be outbound only, so a chase sent after a prospect
replied threaded onto Dominic's own last email and quoted that, ignoring the reply in between. A
conversation is a conversation. Tests stay excluded — a test went to Dominic, not the prospect.

The "can't find the earlier email" refusal is unchanged for non-first-contact kinds.

**The window and the send share the rule.** The GET now takes the rung:
```ts
const kind = req.nextUrl.searchParams.get('kind')
if (!startsNewThread(kind)) { … }
```
and the compose window sends `kindForSend` with it. Without that the GET could only answer "there is an
earlier email" — the question that produced the wrong subject.

---

## 5 · Viewing an email

Every row in the prospect modal's **Emails** list gets a **View** button, whatever its status: *"what
did I actually send?"* is the first question asked about a row that went wrong, and the list could not
answer it. The Contact history view is untouched.

The panel shows From, To, Date, Subject, attachment names and sizes, and the body.

- **System-sent rows** render from the stored `html_body` / `text_body`.
- **Imported and received rows** are fetched from the mailbox by `mailbox` + `uid` through the new
  read-only `action: 'view'`. `fetchMessageForView` opens with **EXAMINE** and `fetch` emits
  `BODY.PEEK[…]`, so opening an email here does not mark it read in Outlook.
- ⚠️ **Attachments are named, never downloaded.** Only the text/html and text/plain parts are named in
  the fetch; the list comes from the BODYSTRUCTURE, which is metadata the server already sent.
- 🔴 **A uid that no longer matches says so in words**, because showing nothing would look like an empty
  email:
  > The Sent folder has been rebuilt since this was recorded (uidvalidity changed), so the stored
  > reference no longer points at this email. Run Import past emails to re-record it.

  and, for a moved or deleted message:
  > That email is no longer at its recorded place in Sent — it has been moved or deleted.

The body renders in a **sandboxed iframe** (`sandbox=""`, `srcDoc`); a text-only email renders in a
`<pre>`, which is inert by construction.

---

## 6 · The Sent copy — the defect, found

### The cause
```ts
const info = await transporter.sendMail(mail)
raw = (info as { message?: Buffer }).message ?? null     // ← ALWAYS null over SMTP
…
} else if (raw) { await appendToSent(client, raw, …) }   // ← therefore never reached
```

🔴 **`info.message` is populated by the *stream* transport and by no other.**
`nodemailer/dist/cjs/stream-transport/index.js` ends with `message: Buffer.concat(chunks, chunklen)`;
the SMTP transport's info carries `accepted`, `rejected`, `response`, `messageId` and `envelope`, and no
`message`. So after every real send `raw` was `null`, the APPEND branch was skipped silently, and
because `appendToSent` was never called **there was no error to record** — which is exactly the row
Dominic found: `sent_copy = 'absent'`, `last_error = null`.

⚠️ **It was invisible to the harness by construction.** The harness composes with `streamTransport`
precisely so it can read the bytes — the one transport where that field *is* populated. The test was
passing on the only configuration in which the production path could not fail.

### The fix
Compose once, send those bytes, file those bytes:
```ts
raw = await composeRaw(row)                 // streamTransport, in memory
await transporter.sendMail(rawMailFor(raw, row))   // { raw, envelope }
…
const copy = await fileSentCopy(row, raw, date, env)
```
Composing twice would produce two different messages — `Date` moves and the MIME boundary is random per
composition — so the Sent copy would differ from what the prospect received, in a way nobody would
notice until a thread failed to match. ⚠️ `envelope` is explicit because `raw` bypasses the
header-derived envelope: nodemailer is handed bytes, not fields.

### The sequence
```ts
let found = await findInSent(client, row.message_id)
if (!found) {
  await new Promise(r => setTimeout(r, SENT_REFETCH_DELAY_MS))   // 3_000
  found = await findInSent(client, row.message_id)
}
if (found) return { sentCopy: 'server_filed', … }
const appended = await appendToSent(client, raw, date)
if (appended.ok) return { sentCopy: 'appended', … }
return miss(`append refused — ${appended.error}`)
```
1. Search Sent — Namecheap files an authenticated submission itself, and appending then would put a
   **second** copy in the folder.
2. ⚠️ **Wait ~3 s and ask again.** Server-side filing is not synchronous with the SMTP `250`; the first
   search can lose a race it was never going to win, and appending on that answer is how a duplicate
   appears a moment later.
3. Still absent → APPEND the exact bytes, `\Seen`.

### The reason is recorded
```ts
...(copy.sentCopy === 'absent' ? { last_error: `sent copy: ${copy.reason}` } : {}),
```
🔴 `sent_copy: 'absent'` with `last_error: null` was the shape of the defect — nothing had been
attempted, so nothing had failed. A successful copy clears the field rather than leaving a stale one.

### Save to Sent
A button on any `sent`, non-test row whose `sent_copy` is `absent`. It re-composes the **same** bytes
from the stored row — same Message-ID, same headers, same bodies — and repeats the whole sequence.
🔴 **It never sends: no transporter is constructed on that path**, and the harness asserts that by
reading the block.

---

## 7 · The text part carries no HTML

`text_body` on the last real send contained a literal `<br><br>`: the old `bodyText` passed the body
through untouched, so a `<br>` typed in a template arrived as four characters in the text/plain part —
and as `&lt;br&gt;` in the HTML part, **visible to the reader**. Both halves are fixed:

```ts
export function stripHtmlToText(s: string): string {
  return decodeEntities(
    String(s ?? '')
      .replace(BR_RE, '\n')
      .replace(/<\/?[a-zA-Z][^>]*>/g, ''),
  )
}
```
and on the HTML side, `<br>` is the one tag allowed through the escape:
```ts
escapeHtml(l).replace(/&lt;br\s*\/?&gt;/gi, '<br>')
```
⚠️ **Entity decoding is last on purpose** — decoding first would turn a literal `&lt;b&gt;`, text a
template meant to *show*, into a tag and then delete it. A bare `<` in prose (`price < £5`) is not
tag-like and survives.

🔴 **I fixed the HTML side too, and the brief only asked for the text side.** Item 7 scopes to
text/plain, but the same input was putting the characters `<br>` in front of the prospect in the HTML
part, and fixing one while knowingly leaving the other would mean the two parts of the same email
disagreed about what the operator wrote. Broken variant **V10** covers the text side as asked; the HTML
side is covered by a positive assertion.

---

## 8 · The stage

Confirmed and asserted. A real send logs through the same writer the Log button uses:

```ts
if (!isTest && result.status === 'sent') {
  … await logOutreachContact(supabase, { prospect_id, channel: 'email', direction: 'outbound', kind,
      message: expandToPlainText(bodyIn, settingsRead.values), contacted_at: null }, …)
}
```

The harness runs the real `logOutreachContact` against a mock client and confirms it writes the rung and
moves `not_contacted → contacted`; then reads the route to confirm the log block is guarded by
`!isTest && result.status === 'sent'`, that the route's single `outreach_contacts` reference is a
**count** for the threading decision and not a write, and that it never updates a prospect's stage
itself. A test send therefore cannot move a stage or write a contact row — structurally, not by promise.

⚠️ One assertion I wrote and then corrected: the first version banned the string `from('outreach_contacts')`
outright and failed, because that name appears once as a legitimate **read**. The assertion is now about
the write, which is what it always meant.

---

## Harness

`node scripts/outreach-mail-send.cjs` · ≈6 s · **no network**. **12 broken variants, 133 assertions.**

⚠️ One piece of harness plumbing changed: `build()` now symlinks `node_modules` into the **compile
output** directory. `lib/outreach-mail-envelope.ts` does a runtime `import nodemailer` — it composes the
raw bytes itself — where it previously imported only types, which tsc erases.

### The broken variants run FIRST and must all FAIL
```
── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────
  ✓ FAILED as required  V1 the old whitelist matcher: an empty-bodied error reads as a table that is PRESENT
  ✓ FAILED as required  V2 the confirm requirement removed: an uncertain row retries with no human
  ✓ FAILED as required  V3 the linked-truck rule removed: a HatchGrab truck is a valid outreach target
  ✓ FAILED as required  V4 a bold line put in its own unstyled div: it inherits the client default and renders smaller
  ✓ FAILED as required  V5 the prefix stripped once: a twice-round thread keeps its old prefixes
  ✓ FAILED as required  V6 an X-Mailer and a prospect-id header added: the composed message is no longer on the allow-list
  ✓ FAILED as required  V7 `msg.headers` ignored: the header block comes back empty, exactly as it did in production
  ✓ FAILED as required  V8 continuation lines dropped: a folded References keeps only its first Message-ID
  ✓ FAILED as required  V9 the pass-through removed: {{signature}} renders as an unresolvable [[signature]] in the box
  ✓ FAILED as required  V10 the text/plain part carries `<br>` tags instead of line breaks
  ✓ FAILED as required  V11 the first-contact rule removed: a first contact is eligible to reply to an earlier email
  ✓ FAILED as required  V12 an automatic append restored: a message with no {{signature}} gets one anyway
```

### The new sections
```
── THE SIGNATURE IS DATA, AND THE TOKEN PLACES IT ──────────────────────────────────────
  ✓ the signature block is the stored lines, each in a 12pt div
  ✓ 🔴 a bold line is <b> INSIDE the 12pt div — never a div with no style
  ✓ …so no unstyled div survives anywhere in the block
  ✓ the opt-out line is one 13.333333px div, quotes escaped
  ✓ no <a> anywhere — the domains are plain text
  ✓ the text form keeps the lines and the blanks
  ✓ a missing `bold` parses as false
  ✓ a line with no text is a malformed row, not a blank line
  ✓ a blank opt-out row is malformed — it is a legal sentence, not a field

── TOKEN EXPANSION, IN BOTH PARTS ───────────────────────────────────────────────────────
  ✓ the prose is still the captured paragraph div
  ✓ the signature block is expanded in place
  ✓ the opt-out is expanded at 10pt
  ✓ and it lands where the token was
  ✓ the opt-out follows the signature, as the text says
  ✓ blank lines become spacer divs (5 of them here)
  ✓ the text part carries the signature lines
  ✓ and ends with the opt-out sentence
  ✓ 🔴 no {{signature}} in the body ⇒ NO signature in the HTML
  ✓ …and none in the text either
  ✓ …and no opt-out line appears from nowhere
  ✓ both tokens are found, in order
  ✓ ⚠️ a token mid-sentence is NOT a block and is left alone
  ✓ a body needing a row that is not there is reported — the send refuses on this
  ✓ …and a body needing nothing needs nothing

── THE TOKENS SURVIVE THE COMPOSE RENDERER UNTOUCHED ────────────────────────────────────
  ✓ {{signature}} is still literally in the rendered box
  ✓ {{opt_out}} too
  ✓ …not turned into an unresolved marker
  ✓ 🔴 neither counts as "still to fill" — they are deferred, not outstanding
  ✓ the malformed-token guard recognises both as well formed
  ✓ …and still catches a mistyped one, which would otherwise reach a prospect verbatim
  ✓ both appear in the Templates tab reference, derived from the code
  ✓ …with a description, not marked undocumented

── COPY AND LOG NEVER EMIT A RAW TOKEN ──────────────────────────────────────────────────
  ✓ no `{{` survives into the copied / logged text
  ✓ the signature is there as plain text
  ✓ and so is the opt-out sentence
  ✓ and it is plain text — no tags at all

── THE TEXT PART CARRIES NO HTML ────────────────────────────────────────────────────────
  ✓ 🔴 the text part contains no "<" at all
  ✓ `<br><br>` became line breaks and `&amp;` decoded
  ✓ and the HTML part uses real <br> tags, not escaped ones
  ✓ …so the prospect never sees the characters "<br>"
  ✓ any other tag is dropped from the text part
  ✓ entities decode last, so an escaped < is not re-stripped
  ✓ …and `&amp;lt;` decodes ONCE, not twice

── THE WARNINGS (warnings, not refusals) ────────────────────────────────────────────────
  ✓ both tokens present: no warning
  ✓ a first contact with neither: two warnings
  ✓ a chase with no opt-out is named
  ✓ ⚠️ a NON-ladder kind is not warned about an opt-out — a reply to a question is not a cold approach
  ✓ a missing signature is warned about whatever the kind

── THREADING: A FIRST CONTACT IS NEVER A REPLY ─────────────────────────────────────────
  ✓ 🔴 1_first_contact starts a NEW thread, always
  ✓ a chase does not
  ✓ nor do the later rungs
  ✓ an unstated kind does not start a new thread — it threads, and the refusal covers it
  ✓ the send resolves the rule into a variable before the parent lookup
  ✓ 🔴 …and a first contact never even looks for a parent
  ✓ the parent lookup is no longer filtered to outbound — EITHER DIRECTION
  ✓ …and `received` counts, so a chase threads onto the prospect's REPLY when that is the latest
  ✓ ⚠️ a test send is still excluded from the thread — it went to Dominic, not the prospect
  ✓ 🔴 the GET the compose window calls applies the SAME rule, so the two cannot disagree

── THE STAGE MOVES ON A REAL SEND, AND NOT ON A TEST ────────────────────────────────────
  ✓ a rung is written
  ✓ 🔴 not_contacted → contacted, reported back
  ✓ the move is an update to outreach_prospects
  ✓ and the rung is a contact row
  ✓ 🔴 the send logs ONLY for a non-test message the server accepted
  ✓ …through logOutreachContact, inside that guard
  ✓ the route touches outreach_contacts exactly once
  ✓ …and it is a COUNT for the threading decision, not a write
  ✓ 🔴 the route never inserts, updates or deletes a contact row itself
  ✓ …and never moves a stage itself, so a test send cannot move one
  ✓ 🔴 the logged message is the EXPANDED text — a history row never holds a raw token

── THE SENT COPY: ONE SET OF BYTES, SEARCH TWICE, THEN APPEND ──────────────────────────
  ✓ 🔴 the route no longer reads the composed bytes off the SMTP result
  ✓ it composes them itself, once, before sending
  ✓ …sends exactly those bytes
  ✓ …and appends exactly those bytes, so the Sent copy is byte-identical
  ✓ the second search waits ~3 seconds
  ✓ 🔴 the order is search → wait → search → append, so a late-filed copy is never duplicated
  ✓ a refused append records WHY
  ✓ 🔴 an absent copy now writes its reason to last_error — the old row had 'absent' and null
  ✓ and "Save to Sent" repeats the sequence
  ✓ 🔴 …and it never sends — no transport is even constructed on that path
```

The signature-bytes, first-contact, chase-threading, composed-bytes, probe, header, no-cap, refusal and
failed-vs-uncertain sections all still pass. Exit code **0**, `✅ ALL CHECKS PASSED`.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx next build` | exit **0**; `/api/admin/outreach/settings` listed as ƒ (dynamic) |
| `node scripts/run-harnesses.cjs` | exit **0** — **60 run · 60 passed · 0 failed** |
| `node scripts/outreach-mail-send.cjs` | exit **0** — 12 variants failed as required, 133 assertions passed |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` — unchanged |

### eslint delta, per rule, against a clean HEAD worktree (`78921b9`)

| Rule | clean HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 6 | 6 | **0** |
| `@typescript-eslint/no-unsafe-function-type` | 1 | 1 | **0** |
| `react-hooks/exhaustive-deps` | 1 | 1 | **0** |
| `react-hooks/immutability` | 1 | 1 | **0** |
| `react-hooks/set-state-in-effect` | 11 | 11 | **0** |

**Zero delta on every rule.** The three new files — `lib/outreach-signature.ts`,
`lib/outreach-settings-read.ts` and `app/api/admin/outreach/settings/route.ts` — lint with **zero
findings of any rule**. An intermediate run carried `+2 no-unused-vars` from `stripHtmlToText` and
`OPTOUT_STYLE`, left behind when the signature moved out of `lib/outreach-mail-message.ts`; both were
removed rather than suppressed, and `OPTOUT_SENTENCE` went with them (it is a settings row now).

---

## Files changed

### New
| File | What it is |
|---|---|
| `lib/outreach-signature.ts` | The two tokens, the settings shapes, `expandBody`, `stripHtmlToText`, `sendWarnings`. Pure. |
| `lib/outreach-settings-read.ts` | The one reader of the two `outreach_settings` rows. |
| `app/api/admin/outreach/settings/route.ts` | GET / POST for the signature panel. Writes exactly two keys. |
| `supabase/migrations/20260929_outreach_settings.sql` | The record of what Dominic applied by hand on 29 September. |

### Changed
| File | What changed |
|---|---|
| `lib/outreach-mail-message.ts` | `signatureHtml`/`signatureText`/`bodyHtml`/`bodyText`/`OPTOUT_SENTENCE` removed; `buildMessage` takes `settings` and expands. |
| `lib/outreach-mail-envelope.ts` | `composeRaw` and `rawMailFor` — compose once, send those bytes. |
| `lib/outreach-mail-box.ts` | `fetchMessageForView` (read-only, uidvalidity-checked) and a shared `decodePart`. |
| `lib/outreach-send-rules.ts` | `startsNewThread`. |
| `lib/outreach-template-render.ts` | The two pass-through `case` labels and their descriptions. |
| `app/api/admin/outreach/mail-send/route.ts` | Settings refusal; first-contact rule; either-direction parent; `fileSentCopy`; `save_to_sent`; `view`. |
| `components/admin/ComposeWindow.tsx` | Panel removed, chaser note moved, warnings, token-expanded Copy/Log, `kind` on the GET. |
| `components/admin/TemplatesPanel.tsx` | The Signature view and its editor. |
| `components/admin/OutreachPanel.tsx` | View on every email row, Save to Sent, the `EmailViewer`. |
| `scripts/outreach-mail-send.cjs` | Eight new sections, four new variants, V4 re-aimed, the `node_modules` link. |

---

## Test script for Dominic

🔴 **ZZ Test Prospect (Dominic)** — prospect `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46` — is the only
prospect to send real test emails to. It is unlinked, hidden, and carries your own address.

### 1 · Edit and save the signature
1. **Templates → Signature.** The eight seeded lines should be there, "Dominic Bonini" with **Bold**
   ticked, and two empty inputs showing *(blank line)*.
2. Look at the preview on the right: **"Dominic Bonini" should now be the same size as every other
   line.** That is the fix — it used to arrive smaller.
3. Change something small (add "07941 042 253 " a trailing space, or add a line and remove it again),
   press **Save**, reload the page. What comes back is what the table holds, not what you typed.
4. Check the opt-out input refuses to save empty — clear it and press Save; it should say the sentence
   is what lets a prospect stop the emails.

### 2 · Put the tokens in a template
On **Templates**, open the first-contact template and add, at the end, on lines of their own with a
blank line before each:

```
{{signature}}

{{opt_out}}
```

The **Tokens** rail should now list both, with descriptions. ⚠️ I have not edited any template — this
step is yours.

### 3 · A test send with both tokens
1. Open **ZZ Test Prospect (Dominic)** → **Compose**, choose that template.
2. In the box the tokens should still read literally `{{signature}}` and `{{opt_out}}` — **not**
   `[[signature]]`, and **not** listed under "Still to fill".
3. The footnote under the buttons should be the ordinary grey line, **not** an amber warning. Delete the
   `{{opt_out}}` line and watch the amber warning appear; put it back.
4. **Send test to me** → confirm → check your inbox:
   - the signature is there, **"Dominic Bonini" the same size as the rest**;
   - there is a **blank line** between the last paragraph and "Kind regards,";
   - the opt-out line is last and smaller;
   - view the source or the plain-text part: **no `<br>`** anywhere in it.

### 4 · A real first contact — it must NOT be "Re:"
1. Same prospect, first-contact template, **kind = 1_first_contact**.
2. 🔴 **There should be no "Sends as a reply to …" line under the text box.** That line appearing on a
   first contact is the defect returning.
3. **Send** → confirm (it names the address and the truck).
4. Check: the email in your inbox has the template's own subject, **no `Re:`**; the prospect's **stage
   has moved to `contacted`**; **Contact history** has a new outbound rung whose message text contains
   the signature as plain text and **no `{{`**.

### 5 · A chaser — it should thread
Compose again with a chase template. Now the reply line **should** appear, naming the first contact and
its date, with **Show** revealing the quoted email. Send it and check in Outlook that it sits in the
same conversation.

### 6 · View
1. In the **Emails** list, press **View** on the email you just sent — headers, then the body in a
   frame. This one is served from the database.
2. Press **View** on an **imported** row (one marked `imported`). This one is read from the mailbox
   live, read-only: check afterwards in Outlook that it is **still unread** if it was unread.
3. If a row shows a uidvalidity or moved-message message instead of a body, run **Import past emails**
   and try again — that is the case working, not failing.

### 7 · Save to Sent
1. Look for a `Sent` row with the amber **no sent copy** badge. If there is one, its **last_error** now
   records why — press **View** on it first if you want the email, then press **Save to Sent**.
2. Expect either *"It was already there — the server had filed it."* (the copy arrived late and the
   search found it) or *"Saved to your Sent folder."*
3. 🔴 **It never sends.** Check Outlook: the Sent folder gains a copy; the prospect gets nothing.
4. If it still fails, the row's reason is now on screen — quote it to me.

