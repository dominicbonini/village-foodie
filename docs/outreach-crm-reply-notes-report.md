# Reply to any email, record an Outlook send as a step, and notes that can be corrected

**30 September 2026 · commit `e796e07` · deployed and serving on production at 18:21:06Z**
**⏳ One migration is NOT applied** — one column, for the "edited" mark. It is in §5 and in the chat
reply. Everything else works without it.

Built on [the v4 fixes](outreach-crm-workspace-v4-fixes-report.md) and
[the sequence](outreach-sequence-report.md). Nothing in either was undone.

---

## 1 · Reply to an email I sent, with the history below

Reply existed only on **received** emails, so following up on my own previous email — with the
prospect seeing it underneath — meant leaving the page and using Outlook.

- **Reply is offered on sent emails too**, in the reading panel's footer and therefore on the row's
  actions. On a received email it says **Reply**; on one of ours, **Follow up on this**.
- 🔴 **It goes back to whoever the email was sent TO.** `from_address` on an outbound row is *our own
  mailbox*, so the obvious reading of "reply to this" would have emailed ourselves. One rule,
  `replyRecipientFor`, used by the page and by the route: inbound ⇒ the sender, outbound ⇒ the
  recipient. The address is then still checked against the closed set it always was (the truck's own
  address, or the From of a non-test inbound message already recorded).
- **Subject** `Re: <original>`, with no double `Re:` (`replySubject`, unchanged).
- **In-Reply-To / References** from that message, so it threads in the prospect's mailbox.
- **The quoted history** in the same Outlook-style block the existing reply already used — From /
  Sent / To / Subject, the message, and its own quoted history below it.

### What the send IS, and why that is the interesting part

| Situation | Logged as | Guards | Button |
|---|---|---|---|
| They wrote, I answer | `reply` | 🔴 **exempt** (a conversation) | **Send reply** |
| They have not written, I follow up on **my own** email | the step, e.g. `2_chase_1` | 🔴 **every one** | **Send · Chase 1** |
| An ordinary chase | the step | every one | **Send · Chase 1** |

🔴 **This is one function, `loggedKindFor`, and it is the reason the feature is safe.** `reply` is
deliberately not one of `CONTACT_KINDS`, so it advances nothing. Had "reply to my own email" logged
as `reply`, the ladder would have stood still and the same chase could have gone out again, past
every guard, for ever. The two look identical in the composer — both quote a parent, both thread —
and they are completely different records.

⚠️ **The server decides "has the prospect written back" from the rows**, not from which button was
pressed: `contacts.some(inbound) || step.stopReason === 'replied'`. The old exemption was
`isReply: !!replyParent`, which would have made this build a way to skip every guard.

### Chasers, threading, and the tickbox

- A chaser already threaded onto the most recent email and quoted it. That is unchanged and is still
  the default; **first contact never threads or quotes** (`startsNewThread`).
- **"Include previous email"**, a tickbox next to the To line, **on by default**. 🔴 **Unticking
  removes the quote and never the threading**: `In-Reply-To`, `References` and the `Re:` subject all
  stay, because a chaser that starts a new conversation is one the prospect reads as an unrelated
  email. The flag travels as `include_quote` and lands in `buildMessage`.
- ⚠️ With the quote unticked, a parent whose body was never stored **no longer refuses the send** —
  there is nothing to quote, and the threading headers come from the row.

### How the quote is kept out of the part I type in

🔴 **The editor holds the document and nothing else.** The quoted parent is never inserted into it:
the browser sends `{ document }`, and the **server** appends the reference block in `buildMessage`,
from the body it has stored for that message. So the quote cannot be edited into, half-deleted by a
stray ⌘A, or diverge from what is sent — and the WYSIWYG rule holds because the block on screen is
rendered from the *same stored body* the server quotes.

It is shown as a **collapsed "Previous email ▸"** block below the editor, one click from open.
⚠️ **That is a reversal**: it used to open expanded, which on a fixed-height composer pushed the Send
row and the whole history off a laptop screen on every chase. The v2 check that pinned it is restated
in place with this reason.

---

## 2 · Recording an email sent from Outlook

Per the sequence report's §0c, an email typed in Outlook reaches the mailbox and is imported but
**carries no step**: the poll logs a contact for it only when the prospect has already replied, and
then only as `reply`. So the ladder does not move and the duplicate guard can only ask.

- In the reading panel, an outbound email with **no linked contact** shows **"Record as Chase 1"** —
  the page's own `nextStep` answer, handed down, never a second derivation.
- When the ladder cannot say which step it was (stopped, or an unreadable history), it shows a
  **four-button picker** instead of guessing.
- One click logs it through **`log_only`** — the existing route action, the **one contact writer**,
  linked to that message — and then **`applyFollowUp`**, the page's one writer of `next_action_at`,
  so it schedules exactly what a system send of that step would have.
- 🔴 **Never automatic**, and refused three ways: a message **already logged** (`contact_id` set), a
  **test send**, and any `kind` that is not one of `CONTACT_KINDS` — an unrecognised value would
  write a contact row `nextStep` cannot read, and one blind row makes the *whole* ladder report
  "can't tell".
- The history row then shows the step like any other send.

⚠️ **"log it" is gone as a separate button.** It was the same write for a narrower case — a send the
server accepted while the log write failed — and is now one of the cases this covers.

---

## 3 · Notes — the diagnosis, then edit and delete

### What already existed

| | Contact-history rows (the outreach panel) |
|---|---|
| **Delete** | Yes — the ⋯ popout's Delete, behind `ConfirmDeleteDialog` (a titled alert dialog with a named confirm button), by **explicit id**, never "the latest". The route `.select('id')`s the delete so "it removed nothing" is observable — PostgREST reports no error when a filter matches zero rows, and this action used to answer `{ok:true}` about a row still in the table. |
| **What is kept** | 🔴 **Nothing.** It is a hard delete, with no tombstone and no undo. |
| **Edit** | 🔴 **Nothing in the outreach panel can be edited.** There is no edit path for a contact, a message or an event, anywhere. |

So **half** the rules existed. I applied the half that did — the confirmation, the explicit id, the
route reporting how many rows it actually changed — and used the brief's specified fallback for the
half that did not: **edit in place with Save/Cancel**, an **"edited" mark with the time**, and an
**8-second Undo**.

### What was built

- **In the Notes card and on the history row, through one component** (`NoteRow` in
  `outreach-shared.tsx`) — so there is one set of rules, one confirmation and one Undo, not two
  copies that can drift.
- **Edit** in place, Save/Cancel; the note shows **"edited <date>"** with the full timestamp on hover.
- **Delete** asks **"Delete this note?"** through the same dialog the contact delete uses, showing
  the note's text, then removes it and offers **Undo for 8 seconds**.
- 🔴 **Undo restores the words *and the day*.** The deleted row travels back with the answer and is
  re-inserted with its **original `created_at`** — a note put back with today's date would move in
  the history and stop explaining the day it was about. ⚠️ The **id** changes, and nothing references
  a note's id.
- 🔴 **Only notes.** `editNote` and `deleteNote` both carry **`.eq('kind', 'note')` in the statement**
  — not a read-then-decide, so there is no window in which the answer could change and no second path
  that forgets. A stage change is a record of something that happened, and the timeline is a history.
  The row renders **no controls at all** for one.

---

## 4 · Does `outreach_events` block update or delete?

**No.** Its policy is `for all to service_role using (true) with check (true)`, `anon`/`authenticated`
revoked, and every writer is a server route holding the service-role key. There is **no trigger and
no check constraint** on the table beyond `kind in ('stage_change','note')`. Editing and deleting a
note needed **no migration at all** and no workaround.

What did need one is the **mark**: "edited 30 Sep" is a fact about a row and there was nowhere to put
it. Appending "(edited)" to the body would have put it inside the words Dominic wrote.

---

## 5 · The migration (one column)

⚠️ **Everything above works without it.** The route probes for the column
(`eventsHaveUpdatedAt`); while it is absent, the timeline selects the columns it always did and an
edit lands without a stamp. The only symptom is a missing "edited" label.

```sql
-- 20260930_outreach_events_updated_at.sql
begin;

alter table public.outreach_events
  add column if not exists updated_at timestamptz;

comment on column public.outreach_events.updated_at is
  'Set when a note is edited. Null on every row that has never been edited; never set on a stage_change.';

commit;

notify pgrst, 'reload schema';

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_events' and column_name = 'updated_at';

select kind, count(*) as rows, count(updated_at) as edited
from public.outreach_events
group by kind
order by kind;
```

---

## 6 · The harness

`scripts/outreach-reply-any-notes.cjs` — **NEW**, registered (71 harnesses), **53 checks**, **7
broken variants**, no network, no mailbox, no database.

```
✓ FAILED as required  V1 🔴 a follow-up to my own email is addressed to ME instead of the recipient
✓ FAILED as required  V2 🔴 a chaser is logged as `reply` — the ladder stands still and the chase can go twice
✓ FAILED as required  V3 unticking "Include previous email" also drops the threading headers
✓ FAILED as required  V4 🔴 an Outlook send can be recorded twice — two rungs for one email
✓ FAILED as required  V5 🔴 a test send can be recorded as a step
✓ FAILED as required  V6 🔴 a stage_change can be deleted
✓ FAILED as required  V7 🔴 …or edited
…
✅ all 53 passed
```

### Stale checks, restated in place with their reasons

| File | Check | Why |
|---|---|---|
| `outreach-reply-attach.cjs` | "the SERVER decides the kind on a reply" | the rule gained one condition; the protection is unchanged and now lives in `loggedKindFor` |
| | "…and the window agrees with it" | same |
| | "the earlier conversation is EXPANDED by default" | **reversed on purpose** — an expanded quote pushed Send and the history off the screen |
| | "Reply is offered on a real inbound message and nowhere else" | it is offered on sent mail too; a **test send** is still never replyable |
| | "…in reply mode, naming the message being answered" | the handler's parameters grew (direction and `to_address`) |
| `outreach-crm-today.cjs`, `outreach-mail-poll.cjs` | "the timeline kept `'log_only'`" | the *action* is unchanged; the button that names it moved to the page's "Record as <step>" |
| `outreach-sequence.cjs` ×2, `outreach-workspace-v4-fixes.cjs` | the `kindForSend` / `derivedKind` anchors | the same one condition |
| `outreach-workspace-v4.cjs` | "only for a received, non-test message" | same as above; the test-send half is kept |
| `outreach-workspace-v3-fixes.cjs` ×2 | the note's markup | it moved into `NoteRow`, so one component serves both places |

---

## 7 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.0s` |
| eslint — all eleven changed files | **identical to HEAD** (every new/changed lib and component 0/0; `ComposeWindow` 2+1 and `outreach-shared` 2, both pre-existing) |
| `node scripts/outreach-reply-any-notes.cjs` | **53 checks, all passed**, 7 variants caught |
| `node scripts/run-harnesses.cjs` | **71 run · 71 passed · 0 failed** |
| goldens | `8bdae817…` and `e3f0a880…` ✅ unchanged |

No email sent. No SQL run. No `outreach_templates` row touched. One send path, one contact writer,
one follow-up writer, one `nextStep` per page, every sequence guard, `EMAIL_FRAME_SANDBOX` unchanged.

Fingerprint `3a9483e0…` at push → `0be96850…` at **18:21:06Z**; `GET /admin/outreach/p/a5beca7f-…` →
**200**.

---

## 8 · What to test — ZZ Test Prospect only

Everything here sends or writes, so it is ZZ Test Prospect throughout.

1. **Reply to an email I sent.** Open a sent email in the reading panel → **Follow up on this**. Check
   the composer's To line shows the **prospect's** address (not yours), the subject is `Re: …` with no
   double `Re:`, and the button reads **Send · Chase 1** (or whatever step it is on) — *not* "Send
   reply". Send it, then look in **Hotmail**: it should land **in the same conversation** as the
   original, with the original quoted below your text in the Outlook block.
2. **Untick "Include previous email"** and send another. The prospect's copy should carry **only your
   words** — and still arrive **in the same thread**, not as a new one.
3. **The quote block.** "Previous email ▸" is **closed** when the composer opens; open it and check it
   is the email you are following up on. Type into the editor and confirm the quote is **not** in the
   box — it cannot be selected or deleted from there.
4. **Reply to an email they sent** (after ZZ Test Prospect has replied to you): the button should read
   **Send reply**, and it should not be refused by the "chase 1 has already gone" guard.
5. **Record an Outlook send.** Send ZZ Test Prospect an email **from Outlook**, run **Import past
   emails**, open it in the panel → **Record as \<step\>**. Check: the history row then shows the step,
   the follow-up date moves as it would for a system send, and the button is **gone** (recording it
   twice is refused). Try it on a **test send** — there should be no button at all.
6. **Notes.** Add a note. **Edit** it, Save, and check it shows **edited** with today's date (this one
   needs the migration in §5). **Delete** it — it should ask first, showing the text — then press
   **Undo** within 8 seconds and check it comes back **with its original date**, in the same place in
   the history. Do the same from the **history row**: same buttons, same dialog, same Undo.
7. **A stage change** in the history should have **no Edit and no Delete** at all.
