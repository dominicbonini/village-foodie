# One rule for "already a recorded step", a Record-as list, and no note for an override

**1 October 2026 · built on `ea0bf9c`**
**⏳ One migration is NOT applied** — one column, for the override line. It is in §2 and in the chat
reply. Everything else works without it.

Built on [the reply/notes build](outreach-crm-reply-notes-report.md) and
[the sequence](outreach-sequence-report.md). Nothing in either was undone. No `outreach_templates`
change, no email sent, no SQL run, no row written. One send path, one contact writer
(`logOutreachContact`), one follow-up writer (`applyFollowUp`), every other sequence guard and
`EMAIL_FRAME_SANDBOX` unchanged.

---

## 0 · What actually went wrong, because it is one defect and not three

Guerrilla Kitchen, 15 September: a first contact sent from Outlook and **logged by hand** — an
`outreach_contacts` row with no linked message. Import past emails later stored that same email as an
`outreach_messages` row with `contact_id` null.

**The history got it right.** `pairHandLoggedEmails` pairs the two and shows **one** row. That function
has been there since 30 September and is unchanged by this build.

**Nothing else knew it existed.** Three readers answered the same question three ways:

| Reader | What it asked | Answer for the 15 Sep email |
|---|---|---|
| the history | the pairing | ✅ one row — recorded |
| `guardUnattributed` | `kind == null && via === 'mailbox'` | 🔴 "not recorded as a step — it was sent from Outlook" |
| the reading panel | `!m.contact_id` | 🔴 offered **"Record as Chase 1"**, then **"Record as Chase 2"** after the chase went out |

🔴 **That last row is two separate errors in one button.** It offered to record an email that was
already a recorded step — a second rung on the ladder for one email — and the step it named came from
the **prospect's current position**, not from the email. The email did not change when the ladder moved;
the label did.

**So the fix is one function, not three patches.** `recordedStepsFor` answers "is this email already a
recorded step" once, and the history, the guards and the reading panel all read it.

---

## 1 · The one rule

🔎 `recordedStepsFor` in `lib/outreach-timeline.ts`, beside the pairing it is built on. An outbound,
non-test email counts as **recorded** when either:

- **`contact_id` is set** — this system sent it and wrote the rung; or
- **it pairs with a hand-logged outbound email contact whose `kind` is one of `CONTACT_KINDS`.**

🔴 **Pairing is `pairHandLoggedEmails` itself, passed in** — not a second implementation of the same
idea. Same London day and direction with exactly one of each, or the opening-words rule when the day is
ambiguous, and **ambiguity pairs nothing**. A looser rule here than the history's would silence a guard
about an email the history still shows as unaccounted for; a stricter one would warn about a row the
history has already merged. It takes the pairing rather than deriving one because every caller already
builds it for the display, and a quiet re-derivation could disagree with the rows on screen.

⚠️ **A `kind` outside `CONTACT_KINDS` is not a recorded step.** `reply` is the case that matters: it sits
outside the ladder on purpose, so an email logged as a reply has had **no rung** recorded for it and must
still be offered one. Treating it as recorded would strand the ladder.

⚠️ **`contact_id` set but the contact row unread ⇒ not named.** The link proves a rung was written;
without the row the step cannot be named, and naming it wrongly is worse than a quiet panel.

🔴 **Display and guard logic only. Nothing is written, linked or deleted.** Both records stay as they
are, because both are true — one is what the mail server did, the other what a person recorded. The
harness asserts no link column is set anywhere in that module.

### How the guards read it, and why neither guard changed

The whole fix at the call site is **one line**: a paired message's prior carries the rung it was recorded
as instead of `null`.

```ts
...messages.filter(m => !m.contact_id && m.status !== 'failed').map(m => ({
  kind: recordedSteps.get(m.id)?.kind ?? null,   // ← was: kind: null
```

Both guards already select on `kind`, so both behaviours fall out of that line:

- `guardUnattributed` selects `p.kind == null`, so a recorded email **is no longer loose** and the
  Guerrilla Kitchen warning cannot fire.
- `guardAlreadySent` selects `p.kind === step`, so it **counts the email as the step it was recorded
  as** — which is exactly what the brief asks for, from the same line.

🔴 **`lib/outreach-sequence.ts` is not touched by this build** — `git diff` on it is empty. That is the
check on whether the fix is in the right place: if the guards had needed editing, the rule would have
been living in two places again.

⚠️ **The hand-logged contact is also in `priors`, carrying the same rung.** Two priors for one event is
harmless — every guard asks "did this step go", never "how many times" — and dropping either would mean
choosing which of two true records to believe. ⚠️ **A linked message is still excluded entirely** by
`!m.contact_id`: its contact row is already in `priors`, and counting the message too would double a rung
this system wrote itself.

### 🔴 The server could not see the hand log, and that is why it warned

The send route selected `contacted_at, created_at, direction, kind, channel` from `outreach_contacts` —
no `id`, no `email_message_id`, no `message`. **The pairing needs all three.** So the server was not
wrong about what it could see; it could not see the thing that made the email recorded. The select is
widened, and `preview`/`sent_copy` are added to the messages read for the opening-words rule.

**The guard still fires on what it is for.** Asserted both ways: a genuinely unattributed Outlook email
still warns, and an **ambiguous day still warns**, because nothing there is recorded.

---

## 2 · No note for an override

🔴 **`recordSendOverride` and `OVERRIDE_PREFIX` are deleted.** A waved guard used to insert an
`outreach_events` row of kind `note`:

> `Sent anyway: [already_sent] An email went to this prospect 15 Sept 2026 … Send anyway?`

**A note is the wrong shape for it, three ways.** It sits in the timeline as though a person typed it;
`NoteRow` offers **Edit and Delete** on it, so a record of a decision could be rewritten like prose; and
it names **no email** beyond sharing a day with one.

It lives on the sent message's own row now — **`outreach_messages.guard_override`**, holding the guard
ids *and the sentences that were on screen*. ⚠️ **The sentences are stored, not re-derived:** a guard's
wording can change, and what belongs in a record of a decision is the words the decision was made on.

Shown as **one small grey line in that email's reading panel**:

> Sent after a warning: An email went to this prospect 15 Sept 2026 (16 days ago) that is not recorded
> as a step — it was sent from Outlook. Send anyway?

**Nothing in the history list.** A warning waved through is context for the email, not an event in the
conversation — asserted from the other side too: `guard_override` appears nowhere in `ProspectTimeline`.

🔴 **Existing "Sent anyway:" notes are untouched.** Nothing migrates, rewrites or deletes them; they read
exactly as they do today and you remove them yourself with the note Delete button.

### ⚠️ The one property this gives up, stated rather than buried

The old write happened **before** the send, deliberately, so that a send which then failed still left the
waved guard in the history. The override now travels on the message row, and **the row is inserted after
every refusal has run** — so a send that never reaches the insert records no override.

**Nothing is lost by it.** With no message row there is no email for the override to be about, and the
refusal is already returned to the browser. The reverse — a note about an email that does not exist — is
a line in the history pointing at nothing. It is a trade, and this is where it is written down.

### The probe

⚠️ **Everything above works without the migration.** Both the send route and the timeline route probe for
the column, the same pattern as `outreach_events.updated_at`. Until it exists an overridden send goes out
exactly as it does today and records nothing; the alternative is a 500 on the one button that means "I
know, send it anyway". 🔴 **The timeline's probe is the load-bearing one**: naming a missing column fails
the *whole* read, which there would answer `migrationApplied: false` and **blank the entire CRM** to add
one grey line.

⚠️ **An empty override omits the key** rather than writing `[]`, so "no warning was waved" and "this row
predates the column" are both null and neither claims the other happened.

⚠️ `parseGuardOverride` is what stops a malformed `jsonb` value reaching the panel: the only guarantee on
that column is that it is JSON, so anything not of the stored shape becomes **null** — one grey line
missing — rather than throwing inside a render.

---

## 3 · "Record as ▾" — a list

One button opening the four steps, each labelled with what is true of it:

| | |
|---|---|
| **First contact** | `recorded 15 Sep` — greyed out, disabled |
| **Chase 1** | *suggested* |
| **Chase 2** | |
| **Final chase** | |

- 🔴 **A recorded step is disabled, not hidden**, and carries the day it happened. Hiding it would leave
  a list whose length changes as the ladder fills and no way to see that first contact is already done;
  greying it out answers "why can't I pick that" on the spot.
- **The ladder's own answer is marked `suggested`**, not pressed on your behalf.
- ⚠️ **Skipping asks first**, naming the step being skipped: *"Chase 1 isn't recorded yet — record this
  as Chase 2 anyway?"* It is legitimate — a chase may genuinely have gone unlogged — and it is also
  exactly what a mis-click looks like, and the ladder derives every later date from the rungs it sees.
- **Choosing a step records it exactly as before**: `log_only` → the one contact writer, linked to that
  message → `applyFollowUp`. Unchanged, and the route's three refusals are unchanged with it: already
  logged, a test send, a `kind` outside `CONTACT_KINDS`.

⚠️ **The four-button fallback is gone.** It appeared only when the ladder could not name a step, and the
list now always shows the four steps — there is nothing left for it to fall back to.

**An email that counts as recorded shows no button**, and one grey line instead:

> Recorded as First contact (logged by hand, 15 Sep)

The hand-log clause appears **only when it was matched by pairing**. A linked row needs no explanation —
this app wrote it. A paired one is two honest records of one event, and the date is the hand-logged
contact's own, which is the day you said it happened.

---

## 4 · The migration

⚠️ **Not applied.** Run it when you are ready; nothing above waits on it.

```sql
-- 20261001_outreach_messages_guard_override.sql
begin;

alter table public.outreach_messages
  add column if not exists guard_override jsonb;

comment on column public.outreach_messages.guard_override is
  'The guards waved through when this message was sent: [{"id","message"}], with the sentences as they were shown. Null on a clean send and on every row written before this column existed. Replaces the "Sent anyway:" note in outreach_events; existing notes are left alone.';

commit;

-- verification
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'outreach_messages'
  and column_name = 'guard_override';
```

---

## 5 · The harness

**`scripts/outreach-recorded-steps.cjs`, registered in `scripts/harnesses.json`** (74 → 75) —
🧪 **40 checks, 6 broken variants, all failing as required.** The rule and the guards are tested by
**calling the compiled modules**; the screens and the route by reading their source.

Every case is built from the real shape: the 15 September email plus the hand-logged contact.

| Variant | What it breaks | Caught by |
|---|---|---|
| **W1** | the guard ignores the pairing — warns on Guerrilla again | *a paired message's prior carries its RECORDED kind* |
| **W2** | the button uses the current step instead of a list | *one button opening a list…* + *the ladder's answer is "suggested"* |
| **W3** | a recorded step is selectable twice | *a step already recorded is DISABLED and says when* |
| **W4** | the override is written as a note again | three checks, including *nothing writes a "Sent anyway" note* |
| **W5** | a recorded email still offers the button | *a recorded email shows NO button…* |
| **W6** | the server stops reading the columns pairing needs | *…or it could not see the hand log* |

> ⚠️ **AND ESLINT CAUGHT A THIRD SLIP IN IT.** The "one contact writer" walker was written as an
> `exec` loop assigning a match it never read — `'m' is assigned a value but never used`. It records
> *which file* writes, never the match, so it is a `.test` now. One warning, and the brief's "no new
> warnings on changed files" is the only reason it was looked at.
>
> ⚠️ **TWO OF MY OWN CHECKS WERE TOO WEAK AND THE VARIANTS CAUGHT THEM, WHICH IS THE POINT OF HAVING
> THEM.** W5 **passed** against the first draft: the check required the grey line and the button block
> to exist, both of which survive deleting `&& !recorded`. W2 was caught only by the *"suggested"*
> check, because the primary one pinned `function RecordAsMenu` and the button label — both of which
> survive leaving the component in the file and reverting the **call site**. Both checks now pin the
> strings that carry the property: the full `unrecorded` expression, and `<RecordAsMenu busy=…`.

### Five stale checks, restated in place

🔴 **All five failed for real on this build, and each was asserting the thing just found wrong.**
Four are in `outreach-reply-any-notes.cjs`; the fifth is in `outreach-sequence.cjs`.

> ⚠️ **THE FIFTH WAS FOUND BY THE FULL SWEEP, NOT BY ME, AND IT IS WORTH SAYING SO.** The four below
> came from running the harness I knew touched this code. `outreach-sequence.cjs` also pinned
> `recordSendOverride` and was failing the whole sweep (`75 run · 74 passed · 1 failed`) while every
> harness I had thought to run was green. **Running the one harness that covers the file you edited is
> not the same as running the suite**, and the gap between those two is exactly one silent red build.

| The check | Why it went stale | What it says now |
|---|---|---|
| `an unrecorded outbound email offers its step`, pinning `Record as {STEP_LABELS[stepKind` | 🔴 **That pattern was the defect.** `stepKind` is the prospect's current step, so a check requiring it would **require the bug** | the offer is a **list** of the four steps, and `Record as {STEP_LABELS[stepKind` appears nowhere |
| `…and a picker when the ladder cannot say which` | pinned the four-button fallback, which existed only when the ladder could not name a step. The list is always the four steps, so there is nothing to fall back to | replaced by: the ladder's answer is marked **suggested** |
| `"unrecorded" is the CONTACT LINK, not a guess`, pinning `!m.contact_id` as the whole test | 🔴 **That is the Guerrilla Kitchen bug exactly.** The 15 Sep email has no `contact_id` and *is* a recorded first contact | the link **and** the shared rule — still necessary, no longer sufficient |
| `the sequence guards still run`, requiring `recordSendOverride` in the route | that function is gone (§2) | the guards still **run**, and a waved guard is still **recorded** — on the message row, never as a note |
| **`outreach-sequence.cjs`** · `an override is recorded in the history before the send`, pinning `await recordSendOverride(supabase, prospectId` | 🔴 **both halves changed**: not a note, and no longer before the send (§2's trade) | a waved guard is still recorded — **on the message row, never as a note** — plus the probe that keeps the send working before the migration |

---

## 6 · Verification

| | |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npx next build` | **compiled successfully**, 96 static pages |
| `node scripts/outreach-recorded-steps.cjs` | **40 passed**, 6 variants failing as required |
| `node scripts/outreach-reply-any-notes.cjs` | **54 passed** (was failing on 4 stale checks) |
| `node scripts/outreach-sequence.cjs` | **64 passed** (was failing on 1 stale check, found by the sweep) |
| `node scripts/run-harnesses.cjs` | **75 run · 75 passed · 0 failed** |
| ⚠️ one caveat on that sweep | `outreach-recorded-steps.cjs` was edited **mid-run** to clear the eslint warning above. The edit is lint-only — an `exec` loop became a `.test` — and the harness was re-run standalone afterwards at **40 passed**. Every other harness in the tally ran against the final tree |
| `--dry-run` screen | all 75 pass |
| goldens | `batch-rolling-golden.json` `8bdae817748ad334…`, `batch-reservation-golden-on.json` `e3f0a88099fd797c…` — **unchanged** |
| eslint, the six changed source files | **0 problems — identical to a worktree of HEAD.** No new warnings, no new errors |
| eslint, the three changed harnesses | **11 errors, 0 warnings.** The two existing ones are at their HEAD baseline (8 errors, 0 warnings); the new one adds 3 of the same `no-require-imports` every `.cjs` harness in this repo reports. **No new warnings** |
| `lib/outreach-sequence.ts` | 🔴 **not changed at all** — `git diff` on it is empty. Both guards' own code is byte-for-byte what it was; only the data handed to them changed |

**Nothing was written.** No `outreach_contacts`, `outreach_messages`, `outreach_events` or
`outreach_templates` row was created, edited or deleted; no SQL was run; no email was sent. The harness
re-proves `lib/outreach-contact-log.ts` is still the only writer of `outreach_contacts`, that the display
pairing sets no link column, and that `EMAIL_FRAME_SANDBOX` is untouched.

---

## 7 · What to test

### Guerrilla Kitchen — **viewing only, nothing to press**

1. Open Guerrilla Kitchen and open the **15 September** email. The panel shows one grey line,
   **"Recorded as First contact (logged by hand, 15 Sep)"**, and **no Record button at all**.
2. The history still shows that email as **one row**, as it did before.
3. ⚠️ **Do not send anything from this prospect.** If you want to see that the warning is gone, open the
   composer far enough to see the guard sentences and then close it — the warning fires on opening the
   send, and the point is that it no longer appears.

### ZZ Test Prospect — the writes

4. On an email **sent from Outlook** (one with no step recorded), the panel offers **"Record as ▾"**.
   Open it: four steps; any step already recorded for ZZ is **greyed out with its date**; the ladder's
   next step says **suggested**.
5. Pick a step that **skips** an unrecorded earlier one — it asks *"Chase 1 isn't recorded yet — record
   this as Chase 2 anyway?"* Say no, and nothing is written.
6. Record a step for real. The row then shows that step like any other send, and the panel's button is
   replaced by **"Recorded as <step>"** — with no "(logged by hand)" clause, because this one is linked.
7. **Send with a warning and press Send anyway.** Then check both halves: the **history has no new
   "Sent anyway:" note**, and that email's reading panel shows one grey line,
   **"Sent after a warning: <the sentence you saw>"**.
   ⚠️ **Before the migration is applied, step 7's grey line will not appear** — the send still works and
   simply records nothing. That is the probe, not a fault.
8. Your existing "Sent anyway:" notes on Guerrilla Kitchen are **still there and still deletable** with
   the note Delete button. Nothing in this build touched them.
