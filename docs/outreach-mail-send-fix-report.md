# Outreach email sender — the five defects and the two changes

**29 September 2026.** Follow-up to `docs/outreach-mail-send-report.md`, after the first day in live use.
Five defects found in production, and two changes Dominic asked for. Manual sending only, as before.

**Nothing was sent during this task.** Every message here was composed with nodemailer's
`streamTransport` (`buffer: true`) — bytes to memory, no socket. **No SQL and no migration was run**;
the one optional statement I would suggest is inline in chat and was not executed. No
`outreach_templates` row was created, edited, seeded or deactivated, `outreach_snippets` was not
touched, no live trading truck was contacted, and the linked-truck refusal is unchanged. Brevo and every
transactional path are untouched, as are Copy (WhatsApp) and Log-only.

---

## Summary of the seven items

| # | Item | Status |
|---|---|---|
| 1 | Remove the daily cap entirely | Done — cap, helpers, counter, config constant and harness section all gone |
| 2 | The table probe said yes to a table that did not exist | Cause found (`head: true` ⇒ empty error body) and fixed; shared by both routes |
| 3 | Surface the real reason behind "could not be recorded" | Done, on the send and on the importer's write |
| 4 | The import summary's NaNs | Cause found (invented field names) and fixed with one shared type; mismatches now listed by truck name |
| 5 | `headers: []` after the previous fix | Cause found (imapflow never puts it in `bodyParts`) and fixed in a shared helper; backfill added |
| 6 | One step in the compose window | Done — preview pane and "Build preview" removed |
| 7 | A test send must never be refused on volume | Moot with the cap gone; asserted in the harness anyway |

---

## 1 · The daily cap is gone

**Dominic's decision**, and the record of why, is in `lib/outreach-send-rules.ts` where the cap used to
be: every email goes out by hand, one press at a time, so a limit only ever obstructs the person it is
meant to protect him from being.

⚠️ **It also misfired on its first day.** The cap counted rows by `created_at` with **no filter on
`source`**, so one run of "Import past emails" — 37 rows recorded in a few seconds, every one of them an
email sent *months* ago from Outlook — read as 37 sends today and refused the next message. The refusal
even reached a **test** send, which the spec said the cap must never count.

Removed: the cap check in the send, `capRefusal`, `countsTowardCap`, `CAP_COUNTED_STATUSES`,
`londonDayStartUtc` and its `tzOffsetMs` helper, `londonDay` in `lib/outreach-mail-message.ts` (it
existed only to bound the cap's window), `OUTREACH_DAILY_SEND_CAP` in the config, the GET counter query,
and the "Sent today: N / 30" chip in the compose window. `OUTREACH_TZ` stays — `referenceDate` uses it
for the quote block's date line.

🔴 **Nothing replaces it.** The harness asserts that in five ways, including that only **one**
`count: 'exact'` query remains in the send route and that it counts *contacts* for the threading
decision, never messages sent — so nothing a test send does can be counted at all.

> **If the index should go too** (it is now unused): the SQL is in chat, unexecuted, as asked. I would
> leave it — it costs a little write amplification and would be wanted again the day automation brings
> a cap back.

---

## 2 · The table probe reported a table that did not exist

### The cause
```ts
const { error } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).limit(1)
if (!error) return true
const code = (error as { code?: string }).code
return !(code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(error.message ?? ''))
```
🔴 **A HEAD response has no body**, so PostgREST had nowhere to put its error document: what came back
was an error object with an **empty `code` and an empty `message`**. The matcher asked its three
questions, got no to all three, and returned `true`. The missing-table case was read as *present* —
which is exactly what Dominic saw: the compose window offered Send, and the send died at the insert
with "The message could not be recorded, so nothing was sent."

Both routes carried their own copy of that probe, so the same wrong answer was wrong twice.

### The fix — `lib/outreach-messages-table.ts`
```ts
export async function messagesTableProbe(
  run: () => Promise<{ error: { code?: string | null; message?: string | null } | null }>,
): Promise<TableProbe> {
  let error: { code?: string | null; message?: string | null } | null
  try { ({ error } = await run()) } catch (err) {
    return { ready: false, refusal: `Email sending is off: the messages table could not be read (${dbDetail(err)})` }
  }
  if (!error) return { ready: true }
  const code = (error.code ?? '').trim()
  const message = (error.message ?? '').trim()
  if (code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(message)) {
    return { ready: false, refusal: MIGRATION_OFF }
  }
  return { ready: false, refusal: `Email sending is off: the messages table could not be read (${dbDetail(error)})` }
}
```
Both callers run a **normal** select so the error arrives intact:
```ts
const { error } = await supabase.from('outreach_messages').select('id').limit(1)
```

🔴 **The second change is the one that matters.** The old shape was a whitelist of known failures with
*present* as the **default**; this is the opposite. An unrecognised error is a table this route cannot
read, and offering to send against a table it cannot read is the bug.

**Broken variant V1** restores the old matcher and must fail — it does, reading an empty-bodied error as
a table that is present.

---

## 3 · The real reason now reaches the screen

The insert refusal said only *"The message could not be recorded, so nothing was sent."* — no way to
tell a missing table from a permission problem from a bad column.

```ts
return refuse(`The message could not be recorded, so nothing was sent — ${dbDetail(insErr)}`)
```
```ts
export function dbDetail(err: unknown): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown }
  const code = typeof e.code === 'string' ? e.code.trim() : ''
  const message = typeof e.message === 'string' ? e.message.trim() : ''
  const joined = [code, message].filter(Boolean).join(': ')
  return joined ? joined.slice(0, 200) : 'the database returned no code or message'
}
```
🔴 **Never a credential and never the test address.** Neither appears in a schema or constraint error,
and the 200-character cap stops a long `details` field dragging row content onto the screen with it.

⚠️ **And it never renders as an empty string** — an error reported as `""` is precisely how the probe
bug hid, so an error with nothing in it says so in words. The harness asserts that.

The importer's write step gets the same treatment:
```ts
if (error) fail('insert', { code: (error as { code?: string }).code, message: dbDetail(error) })
```
and so do both halves of the new backfill (`backfill-read`, `backfill-write`).

---

## 4 · The import summary's three NaNs

Production said:

> Read **NaN** messages, matched 37, recorded 37 new. **NaN** logged contacts have no email in the
> mailbox; **NaN** replies are not in the contact log.

### The cause — the panel invented field names
- the route returned `walked` as an **array** of `{ mailbox, count, skipped }`, one per folder; the
  panel did `Number(j.walked ?? 0)`, and `Number([…])` on a multi-element array is `NaN`;
- the route returned `mismatches.loggedButUnmatched` and `.repliesNotLogged` as **arrays of rows**; the
  panel read the same names as counts;
- there was no field called "read" at all.

🔴 **TypeScript could not help, because the panel typed the response as `Record<string, unknown>` and
cast at each use.** That is how this class of bug gets in.

### The fix — one type, imported by both sides
`lib/outreach-mail-import-result.ts` declares `MailImportResult` with `read`, `walked`, `matched`,
`recorded`, `updated`, `perProspect`, `mismatches` and `errors`. The route's return is annotated
`const result: MailImportResult = { … }`; the panel holds no field name of its own.

### What the summary shows now
> Read **N**, matched **M**, recorded **K** new, filled in the missing reply headers on **U**.
> Empty: Archive, Spam.
> **[n] logged as emailed with no email found**  ·  **[m] replies not in the contact log**

🔴 **Both mismatches are lists, by truck name, not counts.** "12 logged contacts have no email in the
mailbox" is a number nobody can act on; a name is a row Dominic can open. Each button expands its list,
and each row carries its own specific reason — *no email address on the truck row*, *no matching message
in the mailbox*, *3 replies in the mailbox, none logged*. Both lists are sorted by name.

⚠️ **Still reported, not repaired.** Only Dominic knows whether a missing Sent message means the email
never went, went from another account, or was filed somewhere else.

---

## 5 · `headers: []` — the previous fix looked in the wrong object

### The cause
`node_modules/imapflow/dist/cjs/tools.js`:
```js
let partKey = key.replace(/^(body|binary)\[|]$/gi, '')
partKey = partKey.replace(/\.fields.*$/g, '')
let value = getBuffer(attribute)
if (partKey === 'header') {
    map.headers = value
    break                       // ← never reaches bodyParts
}
if (!map.bodyParts) { map.bodyParts = new Map() }
map.bodyParts.set(partKey, value)
```
🔴 **imapflow special-cases the header section: a `BODY[HEADER]` response is assigned to `msg.headers`
and is deliberately never added to `bodyParts`.** The first attempt read `bp.get('header')`. The 28
September "fix" added more spellings *and then scanned every entry of `bp`*. Both searched a map the
value is never put in — which is why more spellings and a wider scan changed nothing at all.

The *request* was always right: `bodyParts: ['HEADER']` does emit `BODY.PEEK[HEADER]`
(`dist/cjs/commands/fetch.js`). Only the read was wrong.

**A second bug of the same family** sat in the importer: it collapsed folded-header whitespace with the
regex **literal** `/\\s+/g`, which matches a literal backslash followed by `s` — not whitespace — so
nothing was ever collapsed.

### The fix — `lib/outreach-mail-format.ts`, used by both routes
```ts
export function headerBlockOf(msg: unknown): string {
  const m = (msg ?? {}) as { headers?: unknown; bodyParts?: Map<string, Buffer> }
  const asText = (v: unknown): string | null =>
    Buffer.isBuffer(v) ? v.toString('utf8') : typeof v === 'string' ? v : null
  const direct = asText(m.headers)
  if (direct && direct.trim()) return direct
  const bp = m.bodyParts
  if (bp && typeof bp.entries === 'function') {
    for (const [, v] of bp) {
      const t = asText(v)
      if (t && /^[A-Za-z][A-Za-z0-9-]*:/m.test(t.slice(0, 400))) return t
    }
  }
  return ''
}
```
⚠️ **The `bodyParts` scan is kept as a fallback, not as the primary** — if a future imapflow stops
special-casing the section, the value appears in `bodyParts` instead and this still finds it.

`headerValue(raw, name)` replaces the importer's broken `grab`: case-insensitive, **unfolds continuation
lines** (a `References` on a thrice-round thread is folded, and keeping only the first Message-ID threads
the next reply to the wrong place), and stops at the blank line so a body line that looks like a header
is not read.

Diagnostics now reads `headerBlockOf(msg)`; so does the importer.

### The backfill
`ignoreDuplicates` makes a second import a no-op **by design** — it must not let the importer's thinner
view overwrite a row this app wrote when it *sent* a message. But the first import ran while the header
read was broken, so it recorded 37 rows with `in_reply_to` and `"references"` NULL, and a no-op re-run
can never repair them.

```ts
const { data: gaps } = await supabase
  .from('outreach_messages')
  .select('id, message_id, in_reply_to, "references"')
  .eq('source', 'mailbox_import')
  .in('message_id', Array.from(byId.keys()).slice(0, 1000))
  .or('in_reply_to.is.null,references.is.null')
…
if (g.in_reply_to == null && f.in_reply_to) patch.in_reply_to = f.in_reply_to
if (g.references == null && f.references) patch.references = f.references
```

⚠️ **Three conditions, and each one is a refusal to touch something:**
- `source = 'mailbox_import'` — a row this app **sent** is never edited here. Its headers are what it
  actually put on the wire; the mailbox's copy is at best the same and at worst a rewrite.
- **only where the column IS NULL** — a stored value always wins, so this cannot rewrite a thread.
- **only when the mailbox has something to put there** — a null stays null rather than becoming `''`.

**Re-running stays safe**: once filled, the rows no longer match the `.or(...is.null)` filter, so a
second run updates 0. The count is reported separately from `recorded`, because a re-run records 0 new
and may still repair rows — one number would hide that.

---

## 6 · One step in the compose window

**Removed:** the "Build preview" / "Update preview" button, the rendered preview pane, the
`previewKey` / `previewOf` / `previewStale` machinery, and the rule that Send stayed disabled until the
preview matched the text.

⚠️ **What the preview was protecting is still protected, and by something stronger.** The argument for
it was that the browser must never assemble a message the server then sends differently. That is still
true and still enforced: **the server builds the final message at send time, from the text in the box,
with the same `buildMessage` call and every refusal already run.** The browser assembles nothing. The
preview was showing Dominic the message he had just typed, which is the duplication he asked to remove.

### What the window shows now, top to bottom
1. **To** — the prospect's address.
2. **Subject.** For a first contact it is the editable field it always was. 🔴 **For a chaser it shows
   `Re: …` automatically and is read-only**, because it is not a choice: the server sets it to `Re: ` +
   the parent's subject and ignores whatever is typed, or the subject would disagree with `In-Reply-To`
   and a client that threads on the subject would show the chase as a new conversation. An editable box
   would let him type something silently thrown away. A line underneath says *"Set automatically,
   because this replies to an earlier email."*
3. **The message** — the same editable textarea, unchanged.
4. **Directly under it, read-only: "Added below your message"** — 🔴 not a preview of the message, only
   what he *cannot* see in the textarea:
   - **his signature, rendered as it will be sent.** Rendered from `signatureHtml()` — the same pure
     module the server appends from, not a copy of the markup.
   - for a chaser, one line: *"Sends as a reply to "**&lt;subject&gt;**" (11 Sep 2026, 13:07). The
     earlier email is quoted under your signature."* with a **Show / Hide** toggle.
5. **Buttons:** "Send test to me" and "Send". Send asks for confirmation **naming the recipient address
   and the truck**.

🔴 **The quoted email stays in a sandboxed iframe** (`sandbox=""`, `srcDoc`) — it came out of the
mailbox, so its markup is sender-controlled, and injected into the admin page it would run behind an
authenticated admin session. The signature above it is ours and is rendered inline; the quoted email
never is.

**Opening the window opens no IMAP connection.** A single GET tells it whether this is a chase and what
the subject will be, from the database alone. The quoted body is fetched only if Show is pressed, by a
new read-only `action: 'quoted'`, because most of the time it is not.

**Unchanged:** the idempotency key is still one per exact text (`[subject, body, kind, isTest]`) — that
never depended on the preview — and the synchronous in-flight ref is still claimed before any `await`,
because `sending` is state and two clicks in one tick would both read `false`.

### One lookup, three callers
The parent is resolved by `threadParent(prospectId)` — most recent non-test outbound message the server
accepted or may have accepted — used by the send, by the GET that tells the window it is writing a
chase, and by `quoted`. Its body comes from `parentBodies()`, used by the send and by `quoted`. Three
copies of either would eventually disagree about **which** email a reply attaches to, and Dominic would
be shown one thing and send another.

---

## 7 · A test send can no longer be refused on volume

Moot with the cap gone — there is no send-count check left to refuse it — but asserted anyway, because
"we removed the thing" is not a test. The harness proves the route names no cap symbol, returns no
counter, and holds exactly one `count: 'exact'` query, which counts **contacts** for the threading
decision and cannot see `is_test` at all.

---

## Harness — `scripts/outreach-mail-send.cjs`

`node scripts/outreach-mail-send.cjs` · ≈4 s · **no network**. The cap section and its broken variant
are gone; the probe, the header helper and the no-cap proof are new. **8 broken variants, 69
assertions.**

### The broken variants run FIRST and must all FAIL
```
── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────
  ✓ FAILED as required  V1 the old whitelist matcher: an empty-bodied error reads as a table that is PRESENT
  ✓ FAILED as required  V2 the confirm requirement removed: an uncertain row retries with no human
  ✓ FAILED as required  V3 the linked-truck rule removed: a HatchGrab truck is a valid outreach target
  ✓ FAILED as required  V4 one spacer div removed: the signature no longer matches the captured bytes
  ✓ FAILED as required  V5 the prefix stripped once: a twice-round thread keeps its old prefixes
  ✓ FAILED as required  V6 an X-Mailer and a prospect-id header added: the composed message is no longer on the allow-list
  ✓ FAILED as required  V7 `msg.headers` ignored: the header block comes back empty, exactly as it did in production
  ✓ FAILED as required  V8 continuation lines dropped: a folded References keeps only its first Message-ID
```

### The new sections
```
── THE TABLE PROBE: ANY ERROR MEANS NOT READY ──────────────────────────────────────────
  ✓ no error: the table is there
  ✓ 🔴 an error with an empty code and message reads as NOT ready
  ✓ …and says so, rather than reporting a bare "off"
  ✓ PGRST205 gives the migration sentence
  ✓ 42P01 gives the migration sentence
  ✓ a permission error carries its code AND its message to the screen
  ✓ …and is NOT reported as a missing migration
  ✓ a select that THROWS is not ready either
  ✓ ⚠️ an empty error never renders as an empty string — that is how the bug hid

── THE HEADER BLOCK COMES OFF `msg.headers` ─────────────────────────────────────────────
  ✓ a Buffer on `msg.headers` is the header block
  ✓ a string works too
  ✓ a message with neither gives the empty string, not a throw
  ✓ ⚠️ the bodyParts fallback still works, in case imapflow stops special-casing the section
  ✓ …and does not mistake a decoded BODY part for a header block
  ✓ one header by name
  ✓ the name is case-insensitive, as RFC5322 says
  ✓ 🔴 a FOLDED References is unfolded whole — every Message-ID, not just the first
  ✓ an absent header is null, not an empty string
  ✓ the blank line ends the header block — a body line that looks like a header is not read

── 🔴 THERE IS NO SEND-COUNT CHECK ANYWHERE ─────────────────────────────────────────────
  ✓ capRefusal is gone from the rules module
  ✓ countsTowardCap is gone
  ✓ londonDayStartUtc is gone
  ✓ CAP_COUNTED_STATUSES is gone
  ✓ 🔴 the send route names no cap symbol
  ✓ the route returns no send counter
  ✓ exactly one `count: 'exact'` remains in the send route
  ✓ …and it counts CONTACTS for the threading decision, not messages sent
  ✓ …so nothing a test send does can be counted by it
  ✓ the compose window shows no "Sent today" counter
  ✓ 🔴 the preview machinery is gone with it — no stale-preview gate stands between Send and a send
```

The signature, first-contact, chase-threading, composed-bytes, refusal and failed-vs-uncertain sections
are unchanged and all still pass. Exit code **0**, `✅ ALL CHECKS PASSED`.

⚠️ **Two assertions I wrote and then replaced.** A first draft of the no-cap section asserted
`IMPORTED.length === 37` on a fixture it had just built — a tautology — and probed for a counting query
by slicing the route source between two comment headings, which would break on any edit. Both were
replaced by the `count: 'exact'` census above, which asserts something the code cannot quietly regain.

---

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx next build` | exit **0** |
| `node scripts/run-harnesses.cjs` | exit **0** — **60 run · 60 passed · 0 failed** |
| `node scripts/outreach-mail-send.cjs` | exit **0** — 8 variants failed as required, 69 assertions passed |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` — unchanged |

### eslint delta, per rule, against a clean HEAD worktree
Worktree at `275cf06`; the nine changed pre-existing files; same config.

| Rule | clean HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 5 | 5 | **0** |
| `react-hooks/exhaustive-deps` | 1 | 1 | **0** |
| `react-hooks/immutability` | 1 | 1 | **0** |
| `react-hooks/set-state-in-effect` | 9 | 9 | **0** |

**Zero delta on every rule.** The two new files —`lib/outreach-messages-table.ts` and
`lib/outreach-mail-import-result.ts` — lint with **zero findings of any rule**.

⚠️ The first attempt at this measurement silently linted one non-existent path, because **zsh does not
word-split an unquoted variable** and the whole file list arrived as a single argument. Redone with
explicit arguments; the same trap is recorded in the previous report.

---

## Files changed

### New
| File | What it is |
|---|---|
| `lib/outreach-messages-table.ts` | `messagesTableProbe` and `dbDetail` — the table probe and the safe error string, shared by both mail routes. |
| `lib/outreach-mail-import-result.ts` | `MailImportResult` and friends — the import response contract, imported by the route and the panel. |

### Changed
| File | What changed |
|---|---|
| `lib/outreach-mail-format.ts` | `headerBlockOf` and `headerValue` added, with the imapflow source quoted for why. |
| `lib/outreach-send-rules.ts` | The whole cap section removed; the note explaining why stands in its place. |
| `lib/outreach-mail-config.ts` | `OUTREACH_DAILY_SEND_CAP` removed. |
| `lib/outreach-mail-message.ts` | `londonDay` removed — it existed only for the cap. |
| `app/api/admin/outreach/mail-send/route.ts` | Probe shared and fixed; cap gone; `preview` replaced by `quoted`; `threadParent` and `parentBodies` extracted; GET returns `thread`; the insert refusal carries its code. |
| `app/api/admin/outreach/mail-import/route.ts` | Shared probe; `headerBlockOf`/`headerValue`; `read` counted; the backfill; a typed response; write errors carry their code. |
| `app/api/admin/outreach/mail-diagnostics/route.ts` | Reads `headerBlockOf(msg)`; the wrong comment about `bodyParts` replaced with what is actually true. |
| `components/admin/ComposeWindow.tsx` | One step: preview pane and its button gone, signature and chaser line added, read-only `Re:` subject, counter gone. |
| `components/admin/OutreachPanel.tsx` | The import summary rewritten against the shared type, with both mismatch lists by truck name. |
| `scripts/outreach-mail-send.cjs` | Cap section and V1 removed; probe, header-helper and no-cap sections added; V1 re-aimed, V7 and V8 new. |

---

## Test script for Dominic

🔴 **Use "ZZ Test Prospect (Dominic)" for every real send below** — discovery row
`d34dcbac-0d4a-4d77-a8fa-91ea74559611`, prospect `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`. It is unlinked,
hidden, and carries your own test address. It is the only prospect to send real test emails to.

### 1 · Re-run the import, and check the summary
Press **Import past emails**. Expect a readable line with **no NaN**:

> Read **N**, matched **M**, recorded **0** new, filled in the missing reply headers on **U**.
> Empty: Archive, Spam.

- **recorded 0** is success on a re-run — `message_id` is unique and a second walk conflicts row by row.
- **filled in … on U** should be non-zero the first time you run this build, because the original 37
  rows were recorded while the header read was broken. Run it a **third** time: `U` should then be 0,
  which is the backfill proving it only ever fills a null.
- Press each mismatch link. Both should list **truck names** with a reason each, not a bare count.

### 2 · Open the compose window on the test prospect
Open **ZZ Test Prospect (Dominic)** → **Compose**, pick a first-contact template. Check:
- **no "Build preview" button and no preview pane**;
- under the message box, **"Added below your message"** showing your signature — two blank lines above
  the opt-out sentence, the name in bold;
- the **Subject** field is editable (this is a first contact, so there is nothing to reply to);
- both buttons are live immediately — **no "update the preview first"**.

### 3 · Send a test to yourself
Press **Send test to me** → confirm. Expect *"Test sent to your own address. A copy is in your Sent
folder."*

🔴 **The specific thing to check: it is not refused.** The old build answered this with *"30 outreach
emails have already gone today"* because the import's 37 rows were counted as sends. There is no count
any more.

Then check in Outlook that it arrived and that the signature matches a hand-sent one side by side. Back
in the app: the message list shows a `test` row, and **the contact history has not changed**.

### 4 · Send the first contact for real
Still on the test prospect, press **Send** and read the confirm — it should name **the address and the
truck**. Confirm.

Expect *"Sent to … A copy is in your Sent folder."*, a new outbound rung in **Contact history**, and a
`Sent` row under **Emails** with no "no sent copy" badge.

### 5 · A chaser, to see the new chase panel
Compose again on the same prospect, pick a chase template. Now check:
- the **Subject** box shows **`Re:` + the original subject** and is **read-only**, with *"Set
  automatically, because this replies to an earlier email."* underneath;
- under the message: *"Sends as a reply to "…" (date). The earlier email is quoted under your
  signature."* with a **Show** link;
- press **Show** — the earlier email appears in a bordered frame; press **Hide** and it goes.

Send it, then open the thread in Outlook: the chase should sit **in the same conversation** as the first
contact, not as a separate one.

### 6 · If the migration were ever missing again
You should not see this now that the table is applied, but the wording has changed and is worth
recognising: the compose window says either *"Email sending is off until the outreach_messages
migration is applied."* or *"Email sending is off: the messages table could not be read (**code**:
**message**)."* — the second is new, and the code in brackets is the thing to quote at me. Copy and Log
keep working in both cases.

---

## Commit and deploy evidence

**Commit `b462d2e`** — *"Outreach sender fix-up: remove the cap, fix the probe, the headers and the
NaNs"*, on `main`, pushed to `origin/main` (`275cf06..b462d2e`). Thirteen files: two new, eleven
changed. No other work is in it.

**Deployed and serving on production, confirmed 2026-09-29T01:20:41Z.**

🔴 **This deploy could not be proved the way the last one was, and the difference is worth recording.**
Last time `/api/admin/outreach/mail-import` was a brand-new path, so its JSON refusal was proof by
itself: a path that does not exist returns the HTML 404 page. This commit added no new route — every
change is *inside* routes that were already serving — so "the route answers" would have been just as
true of the old code, and quoting it as evidence would have proved nothing.

So the deployment itself was watched: the set of `/_next/static/chunks/*.js` the home page references
is a build fingerprint, and it changed from `14a2334c…` to `f2b475ac…` while polling, which is the new
build replacing the old one. The route checks below were taken **after** that change.

| Request | Status | Content-Type | Body |
|---|---|---|---|
| `GET /api/admin/outreach/mail-send` | 404 | `application/json` | `{"error":"Unauthorised"}` |
| `POST /api/admin/outreach/mail-import` | 404 | `application/json` | `{"error":"Unauthorised"}` |
| `GET /api/admin/outreach/mail-diagnostics` | 404 | `application/json` | `{"error":"Unauthorised"}` |
| `GET /api/admin/outreach/does-not-exist-check` | 404 | `text/html` | the app's HTML 404 page |

The last row is the control: a non-existent path returns the rendered HTML 404, so
`{"error":"Unauthorised"}` as `application/json` is each route's own `verifyAdmin` refusal.

⚠️ **The 404 on the refusal is deliberate**, not a bug: an admin route does not confirm its own
existence to an unauthenticated caller. And `GET` on `mail-import` answers **405** — it exports only
`POST` — which is another way of seeing that the path is real.

⚠️ **What this evidence does NOT show.** Everything reachable without an admin session is identical
before and after, so the behaviour changes — the import summary, the compose window, the probe's new
sentence — are proved by the harness and the build, not by these four requests. They are confirmed in
use by step 1 and step 2 of the test script above, which is the first thing to run.

---

## Final state of the working tree

```
On branch main
Your branch is up to date with 'origin/main'.

Changes committed in b462d2e:

  new file:   lib/outreach-messages-table.ts
  new file:   lib/outreach-mail-import-result.ts
  new file:   docs/outreach-mail-send-fix-report.md
  modified:   lib/outreach-mail-format.ts
  modified:   lib/outreach-send-rules.ts
  modified:   lib/outreach-mail-config.ts
  modified:   lib/outreach-mail-message.ts
  modified:   app/api/admin/outreach/mail-send/route.ts
  modified:   app/api/admin/outreach/mail-import/route.ts
  modified:   app/api/admin/outreach/mail-diagnostics/route.ts
  modified:   components/admin/ComposeWindow.tsx
  modified:   components/admin/OutreachPanel.tsx
  modified:   scripts/outreach-mail-send.cjs

Untracked files:
  (none)

nothing to commit, working tree clean
```

Nothing was staged, committed, stashed, reset or restored beyond this task's own files; `git add -A`
and `git add .` were not used. No SQL was run. Two `slot-head-dots-*` worktrees from an earlier session
remain listed as prunable — pre-existing, untouched, and already on the open-items list.
