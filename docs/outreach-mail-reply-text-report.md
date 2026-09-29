# Three fixes to reply handling

**29 September 2026.** Follow-up to `docs/outreach-mail-poll-baseline-report.md`. Sending stays manual;
the mailbox stays read-only.

**Nothing was sent during this task** and no mailbox was written to. **No SQL was run**, and none is
needed. No `outreach_templates` row was created, edited, seeded or deactivated; `outreach_snippets` was
not touched; no live trading truck was involved.

---

## 1 · The cause, as found

### The empty reply text
`lib/outreach-mail-poll.ts`, before this change:

```ts
const plain = findPart(struct, 'text/plain')
if (!plain) return null                    // ← and that is the whole bug
```

🔴 **There was no HTML fallback at all.** Outlook.com/Hotmail sends HTML-only replies routinely — a
`multipart/alternative` with only a `text/html` branch, or a bare `text/html` body. `readText`
therefore returned `null`, `text_body` was stored as `null`, and:

```ts
message: stripQuotedHistory(text ?? '')    // stripQuotedHistory('') returned ''
```

`stripQuotedHistory('')` set `cut = 0`, took `src.slice(0, 0).trim()` = `''`, fell back to
`src.trim()` = `''`, and returned `''`. The contact row was written with an empty message, which the
popout renders as *"No message was recorded with this contact."*

⚠️ **The email was never lost.** The Emails list reads it live from the mailbox, which is why the same
message shows *"Thank you how do I sign up?"* there. The text was not missing — it was never read. The
brief's suspected cause was right; the decoding was fine, the part was simply never requested.

### The reply to a test send
`loadDirectory` built `byMessageId` from **every** message row, tests included, so a reply threaded to
a test send matched by thread and was logged as a real reply — moving the prospect to `replied` on a
conversation that never happened. A test goes to Dominic's own address; replying to it is him
answering himself.

---

## 2 · Reply text: plain when it has words, otherwise the HTML

```ts
const plain = findPart(struct, 'text/plain')
const html = findPart(struct, 'text/html')
const parts = [plain?.part, html?.part].filter((v): v is string => !!v)
…
const plainText = plain ? decodePart(bp, plain.part, plain.encoding ?? null, plain.charset ?? null) : null
const htmlText  = html  ? decodePart(bp, html.part,  html.encoding  ?? null, html.charset  ?? null) : null
const text = replyTextFrom(plainText, htmlText)
```
`decodePart` already handled base64, quoted-printable and the declared charset — both parts go through
it, so *"non-empty after decoding"* is a question this can actually answer.

```ts
export function replyTextFrom(plain, html): string {
  const p = String(plain ?? '').trim()
  if (p) return String(plain)
  return htmlToText(String(html ?? ''))
}
```
⚠️ **"Non-empty after decoding" is the test, not "the part exists".** A `multipart/alternative` can
carry a `text/plain` part that is whitespace or a single `&nbsp;`, precisely because the sender only
ever meant the HTML to be read.

### HTML → text, in the order that matters
```ts
s = s.replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
s = s.replace(/<!--[\s\S]*?-->/g, '')
s = s.replace(/<br\s*\/?>/gi, '\n')
s = s.replace(new RegExp(`</(${BLOCK_TAGS})\\s*>\\s*<(${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n')
s = s.replace(new RegExp(`</(${BLOCK_TAGS})\\s*>`, 'gi'), '\n')
s = s.replace(new RegExp(`<(${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '\n')
s = s.replace(/<[^>]+>/g, '')
s = decodeEntities(s)
s = s.split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n')
```
🔴 **Block elements become line breaks BEFORE tags are removed**, and that is what lets the existing
quote stripper keep working. Outlook's quote header is a run of `<div>From: …</div><div>Sent: …</div>`;
stripping tags first would run those four lines into one, and `QUOTE_MARKERS` is anchored to line
starts, so it could no longer find them.

⚠️ **An adjacent pair of boundaries is ONE break.** Hotmail writes each line of a reply as its own
`<div>`, so `</div><div>` appears between every pair; without that rule the whole logged message came
out double-spaced. A deliberate blank line — `<div><br></div>` — still gives two.

⚠️ **Whitespace collapses within a line, never across lines.** Collapsing across newlines would destroy
exactly the line structure the quote stripper reads. `&amp;` decodes last, so `&amp;lt;` decodes once.

### Never an empty message
```ts
if (!body) return NO_TEXT_PLACEHOLDER      // '(no text — open the email to read it)'
```
🔴 An empty contact message reads, months later, as *"they replied and said nothing"* — a different
fact from *"the text could not be extracted"*. The placeholder says which, and says where to look.

---

## 3 · Repairing the rows already logged empty

`repairReplyTexts` runs on every poll, before housekeeping:

```ts
const { data: filled } = await supabase
  .from('outreach_contacts')
  .update({ message: logged })
  .eq('id', r.contact_id)
  .or('message.is.null,message.eq.')          // 🔴 only where it is still empty
  .select('id')
if (text && !(r.text_body ?? '').trim()) {
  await supabase.from('outreach_messages')
    .update({ text_body: text, updated_at: new Date().toISOString() })
    .eq('id', r.id)
    .or('text_body.is.null,text_body.eq.')
}
```

🔴 **It only ever fills a gap.** Both writes are filtered on the column still being null or empty, so a
message Dominic has since edited — or one a previous run repaired — is never overwritten. That is also
what makes it safe to run on every poll: once a row has text it stops matching.

⚠️ **At most 20 a run** (`MAX_REPAIRS_PER_RUN`), each costing one IMAP fetch against a 60-second budget.
Rows are grouped by account so each mailbox is opened once, and each row is read from **its own**
account — a hello@ row from hello@ — because `mailbox` + `uid` mean nothing anywhere else. Read-only
throughout: `withReadOnlyMailbox` (EXAMINE) and a peek. The run reports **"N reply texts filled in"**.

---

## 4 · Replies to test sends are ignored

```ts
if (isReplyToTestOnly(h, dir)) { summary.repliesToTest++; return }
const match = matchIncoming(…)
```
```ts
function isReplyToTestOnly(h, dir): boolean {
  const ids = [...messageIdsIn(h.get('in-reply-to')), ...messageIdsIn(h.get('references'))]
  const known = ids.filter(id => dir.byMessageId.has(id))
  if (!known.length) return false
  return known.every(id => dir.testMessageIds.has(id))
}
```

🔴 **The `return` is the point.** Without it the code would drop through to the From-address match and
log the reply anyway — because it genuinely does come from the prospect's own address. The harness
asserts both that it returns and that it is tested *before* the match is attempted.

⚠️ **"Only" is load-bearing in both directions.** A thread touching *any* real send is a real
conversation and is handled exactly as before. A message with *no* thread ids is not a reply to a test
— it has no thread — so the address match decides, unchanged.

The already-logged test reply is left exactly as it is, as instructed.

---

## 5 · Contact history opens the email it was logged from

The list route links each contact to its message row in one bulk read:
```ts
const { data: linked } = await supabase
  .from('outreach_messages').select('id, contact_id').not('contact_id', 'is', null)
…
for (const c of arr) c.email_message_id = emailByContact.get(c.id) ?? null
```
and the popout shows the logged text, then the email itself:
```tsx
{contact.email_message_id && (
  <div className="mt-4 pt-3 border-t border-slate-200">
    <span …>The email this was logged from</span>
    <EmailBody rowId={contact.email_message_id} />
  </div>
)}
```

🔴 **`EmailBody` uses the same read-only `view` action and the same `sandbox=""` frame the Emails list
uses** — the markup came out of a mailbox, so it is sender-controlled, and injected into the admin page
it would run behind an authenticated admin session. ⚠️ It is fetched when the row is **opened**, not
with the list: most contact rows are never opened, and an IMAP read per row of history would be absurd.

A contact with no linked email — a call, a WhatsApp, a hand-logged row — keeps exactly the view it had.

---

## 6 · Harness

`node scripts/outreach-mail-poll.cjs` · **19 broken variants, 257 assertions**, no network and no
mailbox.

```
  ✓ FAILED as required  V15 the HTML fallback removed: an HTML-only reply yields no text and is logged empty
  ✓ FAILED as required  V16 the block-element breaks removed: Outlook's quote header survives into the logged reply
  ✓ FAILED as required  V17 the placeholder removed: a reply with no readable text is logged as an empty message
```
(plus V1–V14 from the earlier builds, all still failing as required.)

⚠️ **V16 started as something that proved nothing, and that is recorded in the harness.** The first
draft deleted only the closing-tag replacement and *passed*: the opening-tag rule still put a break
before each div, so the lines survived. One change, one meaning — *"block elements are no longer line
breaks"* — is what a variant has to say, so it now empties the tag list instead.

```
── THE REPLY TEXT: HTML-ONLY REPLIES, DECODING, AND THE QUOTE BLOCK ────────────────────
  ✓ 🔴 an HTML-only reply yields its text
  ✓ …with no markup left in it
  ✓ …and entities decoded
  ✓ 🔴 …and the Outlook From:/Sent:/To:/Subject: block is stripped, leaving exactly the reply
  ✓ …so the quoted original is not logged as theirs
  ✓ a real text/plain part is preferred
  ✓ ⚠️ …but a WHITESPACE-ONLY plain part is not "present" — that is the multipart/alternative case
  ✓ neither part gives the empty string, which the caller turns into the placeholder
  ✓ 🔴 …and nothing at all is NEVER logged as an empty message
  ✓ …the placeholder says where to look
  ✓ the Gmail "On … wrote:" form is stripped from HTML too
  ✓ and so is "-----Original Message-----"

── HTML → TEXT ─────────────────────────────────────────────────────────────────────────
  ✓ block elements become line breaks
  ✓ 🔴 …one break between adjacent lines, TWO only where the author left a blank line
  ✓ …and so does <br>
  ✓ a single paragraph is just its text
  ✓ 🔴 a <script> is removed WITH its content — not just its tags
  ✓ …and so is a <style>
  ✓ comments go
  ✓ ⚠️ `&amp;lt;` decodes ONCE, not twice
  ✓ non-breaking spaces collapse within a line
  ✓ …and a run of blank lines collapses to one
  ✓ a numeric entity decodes
  ✓ …and a hex one
  ✓ an entity nobody knows is left alone, not blanked
  ✓ empty in, empty out

── A REPLY TO A TEST SEND IS IGNORED ───────────────────────────────────────────────────
  ✓ the rule exists as its own function
  ✓ 🔴 …and it RETURNS — it does not fall through to the address match, which would log it anyway
  ✓ …and it is tested BEFORE the match is attempted
  ✓ the directory knows which of our Message-IDs are tests
  ✓ ⚠️ a message with NO thread ids is not a reply to a test — the address match decides, as before
  ✓ 🔴 …and a thread touching ANY real send is a real conversation, handled normally

── REPAIRING REPLIES LOGGED WITHOUT THEIR TEXT ─────────────────────────────────────────
  ✓ 🔴 the contact message is written ONLY where it is still empty
  ✓ 🔴 …and so is the message row's text_body
  ✓ only rows whose contact message is null or blank are even considered
  ✓ at most 20 per run — each costs an IMAP fetch against a 60-second budget
  ✓ ⚠️ read-only, like everything else here
  ✓ each row is read from its OWN account — a hello@ row from hello@
  ✓ and the run reports how many it filled in
  ✓ the poll runs it
  ✓ it deletes nothing

── CONTACT HISTORY OPENS THE EMAIL IT WAS LOGGED FROM ──────────────────────────────────
  ✓ the list route links each contact to its email row, from outreach_messages.contact_id
  ✓ …in one bulk read
  ✓ 🔴 a contact WITH a linked email shows it; one without keeps the view it had
  ✓ …through the shared component
  ✓ which uses the SAME read-only view action
  ✓ 🔴 …and the SAME sandboxed frame — the markup is sender-controlled
  ✓ the logged text is still shown, above it
```

The reply-text fixture is the real Hotmail reply, markup and all — the `<hr>`, the `divRplyFwdMsg`
wrapper and the bolded `From:`/`Sent:`/`To:`/`Subject:` block — and it asserts the logged text is
**exactly** `Thank you how do I sign up?`.

⚠️ **One existing census assertion was restated, not loosened.** It banned the *name*
`outreach_contacts` in the poll, which was a fair proxy while the poll only wrote contacts through the
one writer. The repair pass now **reads** that table and **updates** a `message` on rows that already
exist; it still never **inserts** one, which is what the assertion was always about, so that is what it
now says — and it names the two operations that would make it a second ladder.

---

## 7 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx next build` | exit **0** |
| `node scripts/outreach-mail-poll.cjs` | exit **0** — 19 variants failed as required, 257 assertions passed |
| `node scripts/run-harnesses.cjs` | exit **0** — **61 run · 61 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` — unchanged |

### eslint, per rule, against a clean HEAD worktree (`7aa0a4c`)

| Rule | clean HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 14 | 14 | **0** |
| `react-hooks/immutability` | 1 | 1 | **0** |
| `react-hooks/set-state-in-effect` | 7 | 7 | **0** |

**Zero delta on every rule.** No new files. ⚠️ An intermediate run carried `+1 no-unused-vars` from an
import (`NO_TEXT_PLACEHOLDER`) the poll ended up not needing directly — `stripQuotedHistory` applies it
— and it was removed rather than suppressed.

---

## 8 · Files changed

| File | What changed |
|---|---|
| `lib/outreach-mail-poll-rules.ts` | `htmlToText`, `replyTextFrom`, `NO_TEXT_PLACEHOLDER`; the quote marker widened; `stripQuotedHistory` never returns empty. |
| `lib/outreach-mail-poll.ts` | `readText` reads both parts; `isReplyToTestOnly`; `repairReplyTexts`; two new summary counts. |
| `app/api/admin/outreach/route.ts` | Links each contact to its email row. |
| `components/admin/OutreachPanel.tsx` | `EmailBody`; the popout shows the linked email; the two new counts in the summary. |
| `scripts/outreach-mail-poll.cjs` | Three new variants, four new sections, one assertion restated. |

---

## 9 · Dominic's steps on ZZ Test Prospect (Dominic)

Prospect `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`.

### 1 · Repair the reply that was logged empty
Press **Check for replies now**. Expect the summary to include **"1 reply text filled in"**.

Then open **Contact history** and **View** the inbound reply. It should now show:
- **"Thank you how do I sign up?"** as the logged message — where it used to say *"No message was
  recorded with this contact"*;
- below it, under **The email this was logged from**, the whole email — From, Subject, and the body in
  a frame, exactly as the Emails list shows it.

⚠️ **The repair is silent after the first time.** Press the button again and the count is absent: the
row now has text, so it no longer matches.

### 2 · A real send and a real reply
1. **Compose → Send** (a real send, not a test). **Contact history** gains an **outbound** first
   contact.
2. Reply to **that** email from Hotmail.
3. **Wait for the ten-minute run without pressing anything.**

Expect a second inbound **reply** row, logged **with its text** this time — that is the HTML fallback
working on a reply as it arrives rather than as a repair.

### 3 · A reply to a test is ignored
1. **Send test to me**, then reply to the **test** from Hotmail.
2. Press **Check for replies now**.

Expect **"1 reply to a test send (ignored)"** in the summary, and:
- **no new contact row** in Contact history;
- **no new row** in Emails;
- the stage unchanged.

🔴 That is the fix for the second defect. Replying to a test is you answering your own address, and
before this it was logged as a reply from the prospect.

### If step 1 says "0 reply texts filled in"
Open **What each folder did** first — if the run reported an error under `repair:…`, that is the
mailbox refusing the read. Otherwise the contact row already has text, which is the intended end state.

