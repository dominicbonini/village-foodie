# The compose box is the email: a rich editor, and a sender name

**29 September 2026.** Follow-up to `docs/outreach-mail-signature-report.md`. Manual sending only, as
before.

**Nothing was sent during this task.** Every message here was composed with nodemailer's
`streamTransport` (`buffer: true`) — bytes to memory, no socket. **No SQL was run, and none was
needed**: `from_name` is a third row in the existing `outreach_settings` table, and **I did not write
it** — Dominic sets it in the panel. No `outreach_templates` row was created, edited, seeded or
deactivated; `outreach_snippets` was not touched; no live trading truck was contacted and the
linked-truck refusal is byte-identical. Brevo and every transactional path are untouched.

**The rule this implements, in one line:** the box shows the email as it will arrive, and exactly what
is in the box is sent. The server adds nothing except, on a reply, the quoted earlier email — still
behind the Show toggle, still in the sandboxed iframe.

---

## 1 · The editor: TipTap/ProseMirror, and why

**Chosen: TipTap 3.31.3 on ProseMirror**, all packages exact-pinned:

| Package | Version |
|---|---|
| `@tiptap/core` | 3.31.3 |
| `@tiptap/pm` | 3.31.3 |
| `@tiptap/react` | 3.31.3 |
| `@tiptap/extension-document` | 3.31.3 |
| `@tiptap/extension-paragraph` | 3.31.3 |
| `@tiptap/extension-text` | 3.31.3 |
| `@tiptap/extension-hard-break` | 3.31.3 |
| `@tiptap/extension-bold` | 3.31.3 |

🔴 **The reason is the schema, not the toolbar.** A bare `contentEditable` gives you whatever the
browser and the clipboard decide: a paste from Word arrives as `<span class=… style="mso-…">`, a paste
from a web page brings links and images, and browsers disagree about what Enter produces. You then
write a sanitiser — a **blocklist** — for markup that will be emailed to strangers under Dominic's own
name. ProseMirror inverts that: the schema *is* the document, so a pasted link is not stripped
afterwards, it is **never representable**. Paste sanitising therefore needs no code of mine at all; it
is a property of the schema.

⚠️ **No `@tiptap/starter-kit`.** Only the six extensions above are loaded, so there is no list,
heading, link, image, code block, blockquote or horizontal rule to disable and later forget to
disable. The Small mark is ~25 lines defined locally.

⚠️ **This is a convenience, not the guard.** The document arrives over HTTP; the server re-validates it
against the same schema and refuses anything outside it.

### The toolbar
**Bold**, **Small** (10pt), **Insert signature**, **Insert opt-out**. The last two insert the current
`outreach_settings` content at the cursor, formatted — the same `paragraphsFromLines` builder the
template path uses, so an inserted signature is indistinguishable from a template-expanded one.

The editing surface is styled with **the same constant the email uses** (`P_STYLE`), so "what I see is
what arrives" is literally rather than approximately true.

---

## 2 · The document schema

`lib/outreach-doc.ts`. Three node types, two marks, and nothing else:

```ts
export type DocMark = 'bold' | 'small'
export const ALLOWED_NODES = ['doc', 'paragraph', 'text', 'hardBreak'] as const

export interface DocText { type: 'text'; text: string; marks?: { type: DocMark }[] }
export interface DocBreak { type: 'hardBreak' }
export interface DocParagraph { type: 'paragraph'; content?: DocInline[] }
export interface EmailDoc { type: 'doc'; content: DocParagraph[] }
```
⚠️ `content` absent **is** an empty paragraph — a blank line, not a missing value.

### Why a document and not HTML on the wire
The browser could POST the editor's HTML. It must not: HTML from a browser is an open set, and
"sanitise this HTML" is the wrong shape of defence for something emailed to strangers. A document is an
allow-list by construction, and the server **generates** every byte of markup from it — so every tag in
the email was written in this repository.

### Validation refuses; it does not clean
```ts
if (node.type !== 'paragraph') {
  return { ok: false, error: `a “${String(node.type)}” block is not allowed in an outreach email` }
}
…
if (typeof t !== 'string' || !(ALLOWED_MARKS as readonly string[]).includes(t)) {
  return { ok: false, error: `“${String(t)}” formatting is not allowed in an outreach email` }
}
```
🔴 A sanitiser that silently drops a node is one nobody ever checks, and the first thing it gets wrong
goes out under Dominic's name.

🔴 **Nodes are rebuilt, not passed through.** Only the fields named in the schema survive, so an extra
attribute riding on a text node (`attrs: { onerror: … }`) cannot reach the HTML. The harness asserts
that the rebuilt document does not contain the string `onerror`.

⚠️ **Script-like text stays text.** `<script>alert(1)</script>` typed into the box is a valid document
and comes out as `&lt;script&gt;alert(1)&lt;/script&gt;`, because every text node is escaped.

---

## 3 · Document → email, and the lines that do it

```ts
export function docToHtml(doc: EmailDoc): string {
  return doc.content.map(p => {
    const kids = p.content ?? []
    if (!kids.length) return `<div style="${P_STYLE}"><br></div>`
    const texts = kids.filter((k): k is DocText => k.type === 'text')
    const meaningful = texts.filter(t => t.text.trim() !== '')
    const allSmall = meaningful.length > 0 && meaningful.every(t => hasMark(t, 'small'))
    const inner = kids.map(k => {
      if (k.type === 'hardBreak') return '<br>'
      let html = escapeHtml(k.text)
      if (hasMark(k, 'small') && !allSmall) html = `<span style="${SMALL_STYLE}">${html}</span>`
      if (hasMark(k, 'bold')) html = `<b>${html}</b>`
      return html
    }).join('')
    return `<div style="${allSmall ? SMALL_STYLE : P_STYLE}">${inner}</div>`
  }).join('')
}
```

| Rule | Line |
|---|---|
| paragraph → the captured 12pt div | `return \`<div style="${allSmall ? SMALL_STYLE : P_STYLE}">${inner}</div>\`` |
| empty paragraph → that div containing `<br>` | `if (!kids.length) return \`<div style="${P_STYLE}"><br></div>\`` |
| hard break → `<br>` | `if (k.type === 'hardBreak') return '<br>'` |
| Bold → `<b>` **inside** the styled div | `if (hasMark(k, 'bold')) html = \`<b>${html}</b>\`` |
| whole paragraph Small → a 10pt div | `const allSmall = meaningful.length > 0 && meaningful.every(…)` |
| Small inside a mixed paragraph → a span | `html = \`<span style="${SMALL_STYLE}">${html}</span>\`` |
| all text escaped | `let html = escapeHtml(k.text)` |

🔴 **An empty paragraph is a `<br>` div and not an empty div**, because an empty div collapses to
nothing in most clients — every blank line the operator typed would silently vanish. Broken variant
**V12** is exactly that, and it fails as required.

🔴 **Bold is inside the styled div.** That is the "Dominic Bonini rendered smaller" bug: an unstyled
`<div><b>…</b></div>` inherits the client's default font size.

⚠️ **"Entirely small" ignores whitespace-only runs**, so a trailing unmarked space cannot demote a line
that is otherwise all 10pt.

### The text part
```ts
export function docToText(doc: EmailDoc): string {
  return doc.content
    .map(p => (p.content ?? []).map(k => (k.type === 'hardBreak' ? '\n' : k.text)).join(''))
    .join('\n')
}
```
🔴 **There is nothing to strip.** The previous build had to remove tags from a plain-text body because
the body was a string that might contain them. A document cannot contain a tag — only text that *says*
`<br>`, which is what the operator typed and meant.

### The server appends nothing
```ts
const bodyH = docToHtml(input.doc)
const bodyT = docToText(input.doc)
```
The send-time `{{signature}}` / `{{opt_out}}` expansion is **gone from the send path**, and with it the
"your signature settings could not be read" refusal. A literal token is now a refusal:
```ts
const literal = literalTokenRefusal(docIn)
if (literal) return refuse(literal)
```
> Your message still contains {{signature}} — use Insert signature instead.

### 🔴 The consistency check
`scripts/outreach-mail-send.cjs` holds the **frozen** HTML the previous build produced for a template
carrying both tokens — the markup Dominic verified in his own inbox — written out in full as a literal,
and asserts the new pipeline equals it:

```
✓ 🔴 template → document → HTML is byte-identical to the verified build
✓ …and so is the text part
```

⚠️ **A literal, not a second live implementation.** Comparing two live code paths proves only that they
agree; both can drift together. That is also why I deleted the old expansion functions rather than
keeping them as the harness's reference — dead production code kept alive for a test is the thing that
drifts. The frozen string was generated from the old code before it was removed, and verified equal.

---

## 4 · Template → editor

`docFromTemplateText(text, settings)` runs **after** `renderTemplate` has resolved every other token, so
all existing behaviour is untouched and reuses the existing functions:

- `unresolvedIn` / "Still to fill" / `[[…]]` fills — unchanged, now reading the **document's** text;
- `isMustResolveToken` (the `{{demo_link}}` hard stop) — unchanged;
- `malformedTokensIn` — unchanged.

```ts
const guardText = useMemo(
  () => (isEmailChannel ? `${subject}\n${docPlainText(doc)}` : `${subject}\n${body}`),
  [isEmailChannel, subject, doc, body])
```
🔴 The same functions, handed the document's text instead of the textarea's. §58.2 records what
happened the one time a guard was re-implemented next to the thing it guards.

The two send-time tokens keep their pass-through in `resolvedValue` — `renderTemplate` leaves
`{{signature}}` alone so `docFromTemplateText` can expand it into formatted paragraphs.

### The document is derived, not synchronised
```ts
const templateDoc = useMemo(
  () => (isEmailChannel && settingsLoaded ? docFromTemplateText(finalBody, settings) : EMPTY_DOC),
  [isEmailChannel, settingsLoaded, finalBody, settings])
const doc = editedDoc ?? templateDoc
```
⚠️ **The first version of this was a `useEffect` calling `setDoc`** — the `set-state-in-effect` pattern
this repository already carries eleven of, and it would have made twelve. A `useMemo` expresses the
same precedence rule as a derivation: while the operator has not touched the editor the document *is*
the template render, and the first keystroke in the box stores a document that wins from then on. A new
template or "discard my edits" clears `editedDoc`.

The editor skips `setContent` when the incoming value equals what it already holds, which distinguishes
an echo of a keystroke from a genuinely new document — so the caret does not jump to the start on every
character typed.

---

## 5 · What is stored, logged and copied

| Thing | Value |
|---|---|
| `html_body` / `text_body` | exactly what was sent — `docToHtml` / `docToText` output |
| contact-log `message` | `docPlainText(docIn)` — the document's own text |
| Copy (WhatsApp channel) | the textarea's text, unchanged |
| Copy / Log on an email | `docToText(doc)` |
| idempotency key | `hashKey(JSON.stringify([subject, doc, kind, isTest]))` |

🔴 The key is a hash of the **document**, so two sends of the same document are the same send and the
second returns the first's verdict. Changing a single character of formatting changes the document and
therefore the key — which is right: it is a different email.

---

## 6 · The sender name

A third key, `from_name`, holding `{"text": "..."}`.

**The panel** (top of the Signature tab): a **Sender name** field, *"How your name appears in the
recipient's inbox."* Empty means the bare address, as before. If the name contains `@`:

> Spam filters can treat a name containing @ as a disguised address — a plain name is safer.

⚠️ A warning, never a refusal — a name is a person's to choose. The preview pane now shows
**`From: Dominic Bonini <dominic@hatchgrab.com>`** above the signature block.

**The route** writes exactly three keys, parses with the same parsers the sender uses, and reads back.

**The send** reads it server-side and can never refuse on it:
```ts
export async function readFromName(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('outreach_settings').select('value').eq('key', FROM_NAME_KEY).maybeSingle()
    if (error) return null
    return parseFromName((data as { value?: unknown } | null)?.value)
  } catch { return null }
}
```
🔴 Every failure returns `null`, which is the bare-address behaviour that shipped before the setting
existed. Refusing an email because a cosmetic header could not be decorated would be the wrong trade
every time.

**The header** hands nodemailer the pair rather than building the string:
```ts
const name = (row.from_name ?? OUTREACH_FROM_NAME ?? '').trim()
return { from: name ? { name, address: OUTREACH_FROM_ADDRESS } : OUTREACH_FROM_ADDRESS, … }
```
⚠️ **Quoting is delegated on purpose.** `Bonini, Dominic` must be quoted or the comma reads as an
address separator; an accented name needs encoded-word form. The harness asserts both against the
composed bytes.

**The quote block** on a reply uses the same name, so the `From:` line in the quoted header matches the
From header of the email above it in the thread.

---

## 7 · What Dominic sees, step by step

1. **Subject** — editable on a first contact; read-only `Re: …` on a chase, as before.
2. **The message box** — a bordered editor with a small toolbar: **B · Small · Insert signature ·
   Insert opt-out**, and on the right, *"This is the email. Exactly what is here is sent."*
3. **The message itself**, in Aptos 12pt black — with the signature **already formatted**: "Dominic
   Bonini" in bold at the same size as the rest, two blank lines above it, and the opt-out sentence in
   10pt at the bottom. No `{{signature}}` anywhere.
4. He can click into any of it and edit it, including the signature area.
5. **Under the box**, on a chase only: *"Sends as a reply to "…" (date). The earlier email is quoted
   under your signature."* with **Show**, which opens the quoted email in the sandboxed iframe.
6. **Under the buttons**: *"Send test to me goes only to you and changes nothing. Send goes to the
   prospect, logs it and updates the stage."* — replaced by an amber warning when there is one.
7. **Buttons**: Copy · Send test to me · Send · Log as outbound contact. Send asks first, naming the
   address and the truck, and repeats any warning.

**The label above the box has been wrong twice and is now simply true.** It once said the opt-out
"must be in your Outlook signature" (Outlook never touches these emails), then that the tokens "are
filled in when it sends" (they are filled in when the template is chosen). It now reads: *"Message —
this is the email. Exactly what is here is sent, signature and all."*

**Dropped:** the "No {{signature}} in this message" warning. He can see the signature.

---

## 8 · Harness

`node scripts/outreach-mail-send.cjs` · **14 broken variants, 170 assertions**, no network.

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
  ✓ FAILED as required  V10 a disallowed mark is silently dropped instead of refusing the send
  ✓ FAILED as required  V11 the first-contact rule removed: a first contact is eligible to reply to an earlier email
  ✓ FAILED as required  V12 an empty paragraph renders as an empty div: every blank line vanishes in most clients
  ✓ FAILED as required  V13 the server appends to the document: the box stops being the email
  ✓ FAILED as required  V14 text is no longer escaped: script-like text becomes a tag in the email
```

⚠️ **V10 and V12 were re-aimed, and V13/V14 are new.** V10 and V12 used to patch the send-time
expansion functions, which no longer exist; rather than delete the slots I pointed them at the
equivalent failures in the new pipeline, and said so in the harness file.

### The new sections
```
── TEMPLATE → DOCUMENT → THE SAME BYTES AS THE VERIFIED BUILD ─────────────────────────
  ✓ 🔴 template → document → HTML is byte-identical to the verified build
  ✓ …and so is the text part
  ✓ the text part contains no "<" at all
  ✓ and no token survives into either part

── THE DOCUMENT → THE CAPTURED MARKUP ───────────────────────────────────────────────────
  ✓ a paragraph is one 12pt div — never a <p>, never a margin
  ✓ 🔴 Bold is <b> INSIDE the 12pt div
  ✓ 🔴 an empty paragraph is the styled div containing <br>, not an empty div
  ✓ a hard break is <br> inside the paragraph
  ✓ 🔴 a paragraph that is ENTIRELY small becomes a 10pt DIV — what the captured opt-out line is
  ✓ …and small MIXED into a 12pt paragraph becomes a span
  ✓ all text is HTML-escaped
  ✓ bold AND small together: a 10pt div with <b> inside
  ✓ the text part comes from the document, so there is nothing to strip

── THE SCHEMA REFUSES; IT DOES NOT CLEAN ────────────────────────────────────────────────
  ✓ an allowed document validates
  ✓ 🔴 a link mark is REFUSED
  ✓ …and the refusal names it
  ✓ an image node is refused
  ✓ a heading is refused
  ✓ a list is refused
  ✓ even a harmless-looking italic is refused — the mark list is two long, on purpose
  ✓ no document at all is refused
  ✓ an empty document is refused
  ✓ text that looks like a script is still text, and validates
  ✓ …and comes out escaped, never as a tag
  ✓ an unknown attribute does not fail validation…
  ✓ …because the node is REBUILT from the allowed fields only

── THE SERVER APPENDS NOTHING ───────────────────────────────────────────────────────────
  ✓ 🔴 a document with no signature produces no signature
  ✓ …and no opt-out line appears from nowhere
  ✓ 🔴 buildMessage adds NOTHING to the document on a first contact
  ✓ a hand-typed {{signature}} is refused, and the sentence names the button
  ✓ and so is {{opt_out}}
  ✓ an ordinary document is not refused
  ✓ 🔴 the send route names no expansion function at all
  ✓ it validates the document it is given
  ✓ …and refuses a literal token

── THE From HEADER, WITH AND WITHOUT A NAME ─────────────────────────────────────────────
  ✓ no name: the bare address, exactly as before this setting existed
  ✓ a blank name is no name
  ✓ a name gives `Name <address>` — what the quote header on a reply shows
  ✓ a name containing @ is flagged…
  ✓ …and a plain one is not
  ✓ with no name the From header is the bare address
  ✓ with a name it is `Name <address>`
  ✓ 🔴 a name containing a comma is QUOTED, or the comma would read as a second recipient
  ✓ a non-ASCII name is encoded rather than emitted raw
  ✓ a display name adds no header outside the allow-list

── THE OPT-OUT WARNING (a warning, and the only one left) ───────────────────────────────
  ✓ the sentence is there: no warning
  ✓ a first contact without it is warned about
  ✓ so is a final chase
  ✓ ⚠️ a NON-ladder kind is not warned — a reply to a question is not a cold approach
  ✓ nor is an unstated kind
  ✓ the sentence typed by hand counts — it is the sentence that matters, not how it got there
  ✓ the "no signature" warning is gone — he can see the signature in the box now
```

The signature-panel, first-contact, chase-threading, composed-bytes, probe, header, no-cap, threading,
stage, Sent-copy, refusal and failed-vs-uncertain sections all still pass. Exit **0**,
`✅ ALL CHECKS PASSED`.

⚠️ **Paste sanitising has no assertion of its own, deliberately.** It is not code I wrote: the editor
loads six extensions, so a pasted link, image, heading or list has no schema slot to land in. What IS
asserted is the property that matters — the server refuses every one of those node and mark types if
one ever arrives over HTTP.

⚠️ **One assertion was restated rather than silently re-anchored.** The stage section checked
`message: expandToPlainText(bodyIn, settingsRead.values)`. There is no expansion any more, so it now
checks `const bodyIn = docPlainText(docIn)` and `message: bodyIn` — a stronger form of the same
guarantee, since a document holding a raw token is refused outright. The change is recorded in the
harness file.

---

## 9 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit **0** |
| `npx next build` | exit **0** |
| `node scripts/outreach-mail-send.cjs` | exit **0** — 14 variants failed as required, 170 assertions passed |
| `node scripts/run-harnesses.cjs` | exit **0** — **60 run · 60 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` — unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` — unchanged |

⚠️ **One sweep is reported as a failure that was mine, not the code's.** I ran `run-harnesses.cjs` and
`next build` concurrently to save time, and `add-order-refresh-inputs.cjs` — a React-rendering harness
with real timers, which took 467 s under that load — failed its V2 variant. Run on its own it passes
(`✅ every capacity input AND every status change invalidates the Add Order snapshot`), and it touches
`components/dashboard/AddOrderPanel.tsx` and `lib/capacity-refresh.ts`, neither of which this task
changes. The clean sweep above is the one with nothing else running. Recorded rather than quietly
re-run, because "it passes if you run it again" is exactly the sentence that hides a real flake.

### eslint delta, per rule, against a clean HEAD worktree (`c8675f6`)

| Rule | clean HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 1 | 1 | **0** |
| `react-hooks/exhaustive-deps` | 1 | 1 | **0** |
| `react-hooks/set-state-in-effect` | 4 | 4 | **0** |

**Zero delta on every rule.** The two new files — `lib/outreach-doc.ts` and
`components/admin/RichEmailEditor.tsx` — lint with **zero findings of any rule**.

⚠️ **An intermediate run carried `+1 set-state-in-effect` and a fatal `Unused eslint-disable`.** That
was the `useEffect` rebuilding the document, with a disable comment I had placed on the wrong line.
Rather than move the comment I removed the effect: the document is now derived with `useMemo`, which
is the same rule with no state to synchronise and no suppression to explain. The editor's
`setContent` effect that remains compares against what it already holds instead of taking a reset key
from the parent, so it needs no dependency suppression either.

---

## 10 · Files

### New
| File | What it is |
|---|---|
| `lib/outreach-doc.ts` | The document schema, `validateDoc`, `docToHtml`/`docToText`, the builders, `literalTokenRefusal`, `optOutWarning`, `fromDisplay`. Pure. |
| `components/admin/RichEmailEditor.tsx` | The TipTap editor, the Small mark and the toolbar. |

### Changed
| File | What changed |
|---|---|
| `package.json` / `package-lock.json` | Eight exact-pinned TipTap packages at 3.31.3. |
| `components/admin/ComposeWindow.tsx` | The editor replaces the email textarea; the document is derived; the guards read it; the send posts it; the warning set is down to one. |
| `components/admin/TemplatesPanel.tsx` | The Sender name field, its `@` warning, and the `From:` line in the preview. |
| `app/api/admin/outreach/mail-send/route.ts` | Validates the document, refuses a literal token, appends nothing, reads `from_name`. |
| `app/api/admin/outreach/settings/route.ts` | The third key. |
| `lib/outreach-mail-message.ts` | `buildMessage` takes a document and a display name. |
| `lib/outreach-mail-envelope.ts` | The From header carries the display name; nodemailer does the quoting. |
| `lib/outreach-settings-read.ts` | Reads `from_name`; `readFromName` cannot fail. |
| `lib/outreach-signature.ts` | The send-time expansion machinery deleted; the panel's renderer and the parsers stay. |
| `scripts/outreach-mail-send.cjs` | Five new sections, two variants re-aimed, two new, one assertion restated. |

🔴 **Code deleted rather than left dead:** `SEND_TIME_TOKENS`, `isSendTimeToken`, `sendTimeTokensIn`,
`expandBody`, `expandToPlainText`, `missingSettingsFor`, `stripHtmlToText` and `sendWarnings`. They
existed only because the box was a textarea. Keeping them "in case" would leave a second way to turn a
body into email HTML, which is exactly the thing that drifts from the first one.

---

## 11 · Test script for Dominic

🔴 **ZZ Test Prospect (Dominic)** — prospect `a5beca7f-3edb-4fa1-abc1-6b00e75d1e46` — is the only
prospect to send real test emails to.

### 1 · Set your sender name
1. **Templates → Signature.** There is a new **Sender name** field at the top.
2. Type `Dominic Bonini`. The preview on the right should immediately read
   **`From: Dominic Bonini <dominic@hatchgrab.com>`**.
3. Try typing `dominic@hatchgrab.com` into it — an amber warning appears under the field about `@` in a
   display name. It is only a warning; you can still save. Put the plain name back.
4. Press **Save**, reload the page, and check the name came back.

### 2 · Choose a template and look at the box
1. **ZZ Test Prospect (Dominic)** → **Compose** → the first-contact template.
2. 🔴 **The whole email should be in the box, formatted.** Specifically:
   - **no `{{signature}}` and no `{{opt_out}}` anywhere** — the signature lines are there as text;
   - **"Dominic Bonini" in bold, the same size as every other line**;
   - the opt-out sentence at the bottom in **smaller** text;
   - the blank lines where your template has them.
3. The toolbar above it: **B · Small · Insert signature · Insert opt-out**.
4. If any `[[placeholder]]` is still outstanding, the "Still to fill" list works exactly as before.

### 3 · Edit a word in the signature
1. Click into the signature area and change something — your phone number, say, or bold a line.
2. 🔴 **This is the point of the whole change**: it is ordinary editable text, and it will be sent
   exactly as you leave it.
3. Press **Insert signature** at the end and watch a second copy appear at the cursor; undo it (⌘Z).
4. Try pasting something rich — a link from a web page, or a bulleted list from a document. **Only the
   text arrives** (bold survives). There is nowhere in the document for a link or a list to live.

### 4 · Send test to me, and compare
1. Press **Send test to me** → confirm.
2. Open it in Outlook **next to a hand-sent email from September** and compare:
   - the **From** line now reads your name, not `dominic@hatchgrab.com <dominic@hatchgrab.com>`;
   - the signature spacing and sizes match;
   - the edit you made in step 3 is there;
   - view the plain-text part: **no `<br>`, no tags at all**.
3. Nothing is logged, no stage moves, no contact row appears. The footnote under the buttons now says
   so in as many words.

### 5 · A real first contact
1. Same prospect, **kind = 1_first_contact**.
2. 🔴 **No "Sends as a reply to …" line under the box** — a first contact never threads.
3. Delete the opt-out line and watch the amber warning appear under the buttons: *"This outreach email
   has no opt-out line."* Press **Send** and check the confirm **repeats it**. Then go back and undo.
4. Send for real. Check:
   - the subject has **no `Re:`**;
   - the prospect's **stage moves to `contacted`**;
   - **Contact history** gains an outbound rung whose text is the message as plain text, with **no
     `{{`** in it;
   - **Emails → View** on the new row shows exactly the email you sent.

### 6 · A chaser
Compose with a chase template. The reply line appears under the box with **Show**; the subject is
read-only `Re: …`. Send it, then open the thread in Outlook — it should sit in the same conversation,
and the quoted header inside it should read **`From: Dominic Bonini <dominic@hatchgrab.com>`**, matching
the email above it.

### 7 · The one thing that is now refused
Type `{{signature}}` into the box by hand and press Send. It refuses with:
> Your message still contains {{signature}} — use Insert signature instead.

Nothing expands tokens at send time any more, so those characters would otherwise have been emailed.

