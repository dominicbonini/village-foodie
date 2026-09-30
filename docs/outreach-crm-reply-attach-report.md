# CRM part 2 — replying with the conversation, attachments, and the Plans PDF

**30 September 2026 · commit `3ad9958` · deployed and serving on production at 07:43:05Z**

Part 1 gave Dominic a Today screen and a timeline. He could see a reply; he could not answer one
without leaving the page, and the answer carried no history and no files. This build adds Reply — with
the earlier conversation visible below the editor *and* included in what is sent — file attachments
that never pass through this app, and a one-press Plans PDF.

Sending stays manual. The mailbox stays read-only. Nothing here sends an email by itself.

---

## 1 · What Dominic sees

### Reply

A **Reply** button sits on every non-test inbound email in the timeline and on every **Replies
waiting** row in Today. Either opens the compose window for *that specific message*:

- **To** is the address that wrote — which may be a different mailbox at the same business from the one
  stored on the truck — shown on the line above the conversation.
- **Subject** is `Re: ` + theirs, with the existing repeated-prefix stripping, so a thread that has been
  round twice does not become `Re: RE: FW: …`.
- **The editor is at the top.** Directly below it, **expanded**, the message being answered, rendered
  from its stored `html_body` in the sandboxed iframe — it already contains the older history quoted
  inside it, so that is the whole conversation. Collapsible, because a long thread would otherwise push
  Send off the screen.
- **Chasers get the same treatment**: the quote that used to hide behind a Show toggle is now open on
  arrival.
- The rung is **`reply`** — no ladder rung, no opt-out warning.

What the prospect receives is a normal-looking reply: the message, the signature, then the Outlook
reference block (From / Date / To / Subject, as captured) and their own words underneath.

### Attachments

The compose toolbar gains **Attach file** and **Plans PDF**, with the running total beside them
("2 files · 1.4 MB of 10.0 MB") and a removable chip per file. PDF, PNG, JPG, DOCX and XLSX; 10 MB per
email in total. A test send carries exactly the same files.

In a viewed email, an attachment **we sent** gets a **Download** link (a five-minute signed URL); an
attachment on an **inbound** message stays a name and still reads *"listed only, not downloaded"*.

### Plans PDF

**Case 1 of the two the task described applied: the app already generates this document.**
`app/landing/features-pdf/route.ts` has produced it from `lib/plan-features.ts` since V12.0, which is
what Admin's own download button uses. So there is **no upload slot and no stored file**: the button
generates a fresh copy from the live feature matrix, names it
`hatchgrab-plans-and-features-YYYY-MM-DD.pdf`, and attaches it.

⚠️ **The generator had to move to be shared.** It is now `lib/plans-pdf.ts`, verbatim, and both callers
import it — a Route Handler cannot export helpers (Next refuses any export that is not a handler), and
copying `buildHtml` would have produced exactly the hand-built duplicate that file's own header warns
about: *"correct the day it was written and wrong the first time a row changed."*

---

## 2 · Threading and quoting

| Rule | Where |
|---|---|
| `reply_to_message_id` names the parent; the row is re-read server-side | [`mail-send/route.ts:486`](../app/api/admin/outreach/mail-send/route.ts#L486) |
| It must belong to this prospect, not be a test, and have a Message-ID | [`replyParentRefusal`](../lib/outreach-reply-rules.ts#L75) |
| To is the truck's address **or** the From of a recorded non-test inbound message | [`replyRecipientRefusal`](../lib/outreach-reply-rules.ts#L31), called at [`:503`](../app/api/admin/outreach/mail-send/route.ts#L503) |
| Subject / In-Reply-To / References | `buildMessage`, unchanged — the parent is simply a different row |
| The reference block shows **their** From/Date/To/Subject | [`mail-send/route.ts:573`](../app/api/admin/outreach/mail-send/route.ts#L573) |
| The quoted HTML is sanitised before embedding | [`sanitiseQuotedHtml`](../lib/outreach-quote-sanitise.ts#L66) |
| `kind` is `reply`, decided by the server | [`mail-send/route.ts:562`](../app/api/admin/outreach/mail-send/route.ts#L562) |

🔴 **The recipient is the one place a browser gets a say in who an email goes to, so the set is
closed.** Every other send addresses `discovery_trucks.contact_email`, read server-side, precisely so a
stale address on screen cannot become the envelope. A reply has to go back to whoever wrote, so the
route accepts exactly two sources — the truck's own address, and the From of a non-test inbound message
already in `outreach_messages` for this prospect. Both are values the server already holds; a caller
cannot introduce a third.

🔴 **`reply` is not a ladder rung, and the server decides that, not the client.** A request carrying
`kind: '2_chase_1'` alongside a reply id is overridden. `reply` is absent from `CONTACT_KINDS`, so §57
counts nothing for it — answering somebody neither advances a chase sequence nor restarts one — and
`optOutWarning`, which only fires on ladder rungs, is silent by the same fact rather than by a second
rule.

### The sanitiser, and why it is not the iframe

[`lib/outreach-quote-sanitise.ts`](../lib/outreach-quote-sanitise.ts) takes the body's inner HTML, then
removes — repeatedly, until the string stops changing —

```
script  style  meta  link  base  iframe  object  embed  form
```

every `on*` attribute, and every `javascript:` / `vbscript:` / `data:text/html` URL, **decoded first**
so `&#106;avascript:`, `java\tscript:` and `JaVaScRiPt:` all fail the same test.

🔴 **This is a different problem from the one `sandbox=""` solves.** Everywhere else, mailbox HTML is
rendered in a sandboxed iframe and the browser simply refuses to run it. A reply is the one place
somebody else's markup is copied into a message that goes **out under Dominic's address** — into their
inbox, their colleagues' when it is forwarded, and their archive. A `<form>` in that position, posting
wherever its author chose, from our From header, is the phishing shape.

⚠️ **Presentation is left alone, deliberately.** A quoted email has to still look like the email it is
quoting; the harness asserts that `style="color:red"` and ordinary links survive.

⚠️ **The chase path is sanitised too, and that is a change.** A chase usually quotes our own generated
markup — but since chases learned to thread onto a reply, `threadParent` correctly returns *their*
message, and its raw HTML has been going out embedded in our email ever since
([`:616`](../app/api/admin/outreach/mail-send/route.ts#L616)).

---

## 3 · The attachment flow

```
browser ──1──▶ /api/admin/outreach/attachments  {signed_upload, filename, type, size}
        ◀──2── {signedUrl, path, attachment}          ← the server composed the path
        ──3──▶ Supabase Storage (PUT, private bucket)  ← the bytes go HERE, not through us
        ──4──▶ /api/admin/outreach/mail-send  {attachments: [{…, storagePath}]}
                       └─5─▶ loadAttachments() downloads by path, server-side
                       └─6─▶ nodemailer builds multipart/mixed
                       └─7─▶ the paths are stored on the row
```

| Step | Where |
|---|---|
| Type, extension and size allow-list | [`uploadRefusal`](../lib/outreach-attachments.ts#L88) — applied in the window *and* again in the route |
| 10 MB **total**, not per file | [`attachmentSetRefusal`](../lib/outreach-attachments.ts#L112), `MAX_ATTACHMENT_BYTES` at [`:35`](../lib/outreach-attachments.ts#L35) |
| Signed upload URL, server-composed path | [`attachments/route.ts:47`](../app/api/admin/outreach/attachments/route.ts#L47) |
| **Paths in, bytes never** | [`parseOutboundAttachments`](../lib/outreach-attachments.ts#L134), called at [`mail-send:632`](../app/api/admin/outreach/mail-send/route.ts#L632) |
| Bytes read from the bucket | [`loadAttachments`](../lib/outreach-attachment-store.ts#L37) |
| `multipart/mixed` wrapping `multipart/alternative` | `mailFor` in [`outreach-mail-envelope.ts`](../lib/outreach-mail-envelope.ts) |
| Stored on the row for Retry / Save to Sent | [`mail-send:673`](../app/api/admin/outreach/mail-send/route.ts#L673) |
| Five-minute signed download | [`attachments/route.ts:66`](../app/api/admin/outreach/attachments/route.ts#L66) |
| Plans PDF generated and stored | [`attachments/route.ts:87`](../app/api/admin/outreach/attachments/route.ts#L87) |

🔴 **`parseOutboundAttachments` is the guard, not a parser.** It keeps only entries carrying a
`storagePath` and drops everything else, so a request containing base64, a data: URI or a URL yields an
empty list. There is no field on the send path through which file bytes can reach the mail server — and
the harness census proves neither route calls `Buffer.from(body.…)`, touches `base64`, or reads
`formData()`.

🔴 **That is also what makes Retry honest.** The paths are on the row, so Retry and Save to Sent read
the same objects and compose the same bytes. The harness composes twice and compares everything except
the MIME boundary, which nodemailer randomises per composition by design.

⚠️ **All or nothing.** A file that cannot be read back refuses the send by name rather than sending
without it — a message that quietly dropped its plans PDF would leave Dominic believing it had gone.

⚠️ **The Plans PDF is generated at attach time, not at send time.** Generating it during the send would
put a Chromium cold start inside the same 60 seconds as an SMTP conversation and an IMAP append; and a
copy regenerated at *retry* time would be different bytes from the one already delivered.

⚠️ **The bucket stays private.** Nothing produces a public URL; `getPublicUrl` appears nowhere, and the
harness checks that.

---

## 4 · The harness

`scripts/outreach-reply-attach.cjs` — **NEW**, registered (63 harnesses), **120 checks**, no network, no
mailbox, no database. The real libs, and the real message composed by nodemailer's `streamTransport`.

### Broken variants — shown FAILING first

```
✓ FAILED as required  V1  a quoted email's script and form are copied into the message we sign
✓ FAILED as required  V2  an inline event handler survives into the sent email
✓ FAILED as required  V3  a javascript: link survives into the sent email
✓ FAILED as required  V4  a whole document is embedded inside our message
✓ FAILED as required  V5  a reply is addressed to somebody who has never written to us
✓ FAILED as required  V6  one prospect's message can be replied to in another's thread
✓ FAILED as required  V7  a test send is offered as something to reply to
✓ FAILED as required  V8  twelve megabytes of attachments are accepted for one email
✓ FAILED as required  V9  an executable can be attached to an email sent from hatchgrab.com
✓ FAILED as required  V10 an attachment with no storage path is accepted — the door bytes would come through
```

⚠️ **V9's patch was rewritten after it crashed rather than failed.** Deleting the guard's `if` left
`allowedExts` undefined and the variant threw on the next line — a broken patch reporting a pass. It
now makes the allow-list accept the file's own type instead: one change, one meaning.

### What it proves

```
── THE QUOTED HTML IS CLEANED BEFORE IT IS PUT IN OUR EMAIL ─────────────────────────────
  ✓ <script>/<style>/<meta>/<link>/<base>/<iframe>/<object>/<embed>/<form> is removed and the prose around it is kept
  ✓ 🔴 every on* handler goes, quoted or bare
  ✓ a javascript: href goes  ✓ …however it is cased  ✓ …however it is spaced
  ✓ 🔴 …and however it is entity-encoded — the value is DECODED before the test
  ✓ 🔴 a nested tag that only appears after one removal is removed too
  ✓ 🔴 a whole document becomes the BODY's contents, and the head goes with it
  ✓ ⚠️ PRESENTATION IS LEFT ALONE — a quoted email must still look like the email it is quoting

── WHAT THE RECIPIENT ACTUALLY RECEIVES ─────────────────────────────────────────────────
  ✓ 🔴 the subject is "Re: " + theirs, with the existing prefix stripping
  ✓ In-Reply-To is the message being answered
  ✓ 🔴 References is THEIR chain plus THEIR id — the whole thread, not just the last hop
  ✓ 🔴 the reference block names THEM, not us — it is their message being quoted
  ✓ …with the subject as captured   ✓ …and the date as captured, in London time
  ✓ 🔴 …followed by their actual words
  ✓ 🔴 the signature comes BEFORE the quote block — a reply above the line
  ✓ the text/plain part quotes too   ✓ …including their text_body

── WHO A REPLY MAY BE SENT TO ───────────────────────────────────────────────────────────
  ✓ 🔴 a colleague who has actually written to us is allowed — that is the case this exists for
  ✓ 🔴 …and nobody else is, however the browser asks
  ✓ ⚠️ …and a plausible address is still refused when no inbound message records it

── A REPLY IS NEVER A RUNG, AND CARRIES NO OPT-OUT ──────────────────────────────────────
  ✓ 🔴 a reply with no opt-out line produces no warning
  ✓ ⚠️ …while a first contact without one still does, unchanged
  ✓ 🔴 the SERVER decides the kind on a reply — a client cannot send `2_chase_1` with a reply id

── THE COMPOSED BYTES, WITH FILES ───────────────────────────────────────────────────────
  ✓ 🔴 the message is multipart/mixed once it carries files
  ✓ 🔴 …WRAPPING the existing multipart/alternative — the html and text parts are untouched
  ✓ the PDF part declares its own type   ✓ …and so does the image
  ✓ 🔴 each part carries its own filename, so it arrives named   ✓ …both of them
  ✓ 🔴 no header outside the allow-list (10 names), attachments and all
  ✓ ⚠️ with no files it is multipart/alternative exactly as before

── RETRY RE-COMPOSES THE SAME MESSAGE ───────────────────────────────────────────────────
  ✓ 🔴 a second composition of the same row is byte-identical
  ✓ ⚠️ …which is only meaningful because dropping the files WOULD change the bytes

── THE BYTES NEVER TRAVEL THROUGH THE SEND REQUEST ──────────────────────────────────────
  ✓ 🔴 the send parses PATHS from the request and reads the bytes itself, server-side
  ✓ ⚠️ …and the same census FAILS on a version that takes them from the request
  ✓ 🔴 mail-send / attachments never turn request content into bytes
  ✓ 🔴 …and a file that cannot be read refuses the send rather than sending without it
  ✓ 🔴 …and nothing anywhere makes the bucket public

── WHAT MAY BE ATTACHED ─────────────────────────────────────────────────────────────────
  ✓ 🔴 an executable is not  ✓ …nor a file whose extension and declared type disagree
  ✓ 🔴 …and three 4 MB files are not: the limit is the TOTAL
  ✓ 🔴 a traversing filename cannot escape its folder

── THE PLANS PDF: THE APP ALREADY MAKES IT ──────────────────────────────────────────────
  ✓ 🔴 …still generated from lib/plan-features.ts, never from a copy of the markup
  ✓ 🔴 …and so does the attach button — ONE generator, two callers
  ✓ 🔴 hatchgrab-plans-and-features-YYYY-MM-DD.pdf, as asked
  ✓ ⚠️ the generated copy is STORED like any other attachment, so a retry re-sends the same bytes
```

### One stale anchor, restated

`scripts/outreach-mail-send.cjs` matched `const firstContact = startsNewThread(sendKind)` exactly. That
line now reads `!replyParent && startsNewThread(sendKind)` — a real behavioural change (an explicit
reply is never a first contact, whatever its kind would say), so it is restated in the harness with the
reason, plus a second check that the parent lookup reads the variable rather than deciding for itself.

---

## 5 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 4.7s` |
| eslint — the six new `lib/` and route files | **clean, 0 problems** |
| eslint — `ComposeWindow.tsx` 3, `OutreachPanel.tsx` 13 | **identical to HEAD** |
| eslint — `mail-send`, `timeline`, `today`, `envelope`, `deliver`, `bodies`, `timeline`/`today` libs | 0, as at HEAD |
| eslint — `app/landing/features-pdf/route.ts` | 6 → **0** (the code carrying them moved) |
| `node scripts/outreach-reply-attach.cjs` | **120 checks, all passed** |
| `node scripts/run-harnesses.cjs` (run alone) | **63 run · 63 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` ✅ |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` ✅ |

⚠️ **`lib/plans-pdf.ts` reports 4 eslint findings and they are not new** — three `require()` calls and
one `any` in the Chromium launcher, which came across verbatim with the code. The route they left
reported six; the pair's total went **down by two**. Converting a serverless Chromium launcher's
`require()` to a dynamic import changes how an optional dependency resolves on Vercel, and I am not
making that change as a side effect of an outreach feature.

⚠️ **The two new `.cjs` harnesses report `no-require-imports` exactly as every other harness in
`scripts/` does** — they are CommonJS by design.

No email was sent: the harness composes through `streamTransport` with `buffer: true` and never opens a
socket. No SQL was run. No template or snippet row was touched, no live trading truck was involved, and
nothing about Brevo changed.

---

## 6 · SQL

**None.** The bucket and every column this uses were applied with Part 1 and are recorded in
`supabase/migrations/20260929_outreach_crm_today_timeline.sql` and
`20260929_outreach_messages_attachments.sql`. Outbound attachment metadata goes in the existing
`outreach_messages.attachments` JSONB, with a `storagePath` on each entry — which is also how the
viewer tells "a file of ours" from "a name in somebody else's email".

---

## 7 · Commit and deploy evidence

**Commit `3ad9958`** — *"Reply from the timeline with the conversation visible and quoted, plus
attachments and a Plans PDF button"*, on `main`, pushed to `origin/main` (`0a08513..3ad9958`). Twenty
files: six new modules, one new route, one new harness, and the rest changed.

**Deployed and serving on production, confirmed 2026-09-30T07:43:05Z.**

```
fingerprint at push:  b10617ef868738a6065e5dd2ba70479c
07:41:23Z poll 1:     b10617ef868738a6065e5dd2ba70479c
07:41:43Z poll 2:     b10617ef868738a6065e5dd2ba70479c
07:42:04Z poll 3:     b10617ef868738a6065e5dd2ba70479c
07:42:24Z poll 4:     b10617ef868738a6065e5dd2ba70479c
07:42:44Z poll 5:     b10617ef868738a6065e5dd2ba70479c
07:43:05Z poll 6:     399fbedc79ad5685fae00ac4643300a2     ← DEPLOY LANDED
```

| Request | Status | Body |
|---|---|---|
| `GET /api/admin/outreach/attachments` | 405 | POST-only — **the new route exists** |
| `GET /landing/features-pdf` | 404 | `{"error":"Not found"}` — the moved generator still behind its gate |
| `GET /api/admin/outreach/does-not-exist-check` | 404 | the app's HTML 404 page |

⚠️ The 405 is the evidence: before this commit that path did not exist and returned the HTML 404.

---

## 8 · Test script — ZZ Test Prospect (Dominic) only

`a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`. Nothing below touches another prospect.

1. **Reply from Hotmail** to the last email in the thread, then press **Check for replies now** (or wait
   for the cron). The reply appears under **Replies waiting**.
2. **Press Reply** — on that row, or on the message in the prospect's timeline.
   → The compose window opens: To is the Hotmail address, the subject is `Re: …`, and **the earlier
   conversation is visible, expanded, directly below the editor**. Type an answer.
3. **Press Plans PDF**, then **Attach file** and pick one other file (PNG or DOCX).
   → The chips read `hatchgrab-plans-and-features-2026-09-30.pdf` and your file, with the running total.
4. **Send test to me.**
   → Check in Hotmail: the history is quoted under the signature with the From/Date/To/Subject block
   above it, and **both files open**.
5. **Real Send.**
   → The reply is logged as `reply` (no new rung on the ladder), the message it answered is **marked
   handled automatically** by Part 1's rule, and it **leaves Today** without a reload.
6. **In Hotmail**, the sent message sits in the **same conversation** as the original.

⚠️ **Watch for one thing in step 5**: the reply is logged with `kind: 'reply'`, so the prospect's
derived next step does not change. That is correct — §57 stops the chase sequence on any inbound reply
anyway, and an answer is not a rung.

---

## 9 · What was deliberately not done

- **No upload slot for the Plans PDF, and no `plans_pdf` settings row.** Case 1 applied: the app
  generates the document. Adding a stored copy would create a second answer to "what are our plans",
  and the stored one would be the stale one.
- **A removed attachment's object is left in the bucket.** Unreferenced and private; deleting on
  unpick would mean a delete path that runs while an upload of the same name may be in flight, to
  reclaim kilobytes in a private bucket.
- **Inbound attachments are still never downloaded.** The rule from the last build stands: names come
  off the BODYSTRUCTURE, and no attachment part is ever fetched from the mailbox.
- **The quoted history is not editable before sending.** It is shown exactly as it will be embedded;
  letting it be edited would mean Dominic could alter what a prospect is shown as their own words.
