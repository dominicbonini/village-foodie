# CRM part 1 — a Today screen and a per-truck timeline

**29 September 2026 · commit `10d78dc` · deployed and serving on production at 23:53:23Z**

The outreach page could tell you everything about a truck and nothing about your morning. There was no
answer to "what do I do now" except 231 rows and a memory, and a prospect's own modal showed its
history twice — a contact table and an Emails list, sorted independently, with every logged email in
both. This build adds **Today**, the default tab, and replaces those two lists with one **timeline**,
plus notes and a record of every stage change.

Sending stays manual. The mailbox is still read-only, and **nothing on either new screen opens one**:
the bodies were stored by the previous build, so all of this is Postgres.

---

## 1 · What Dominic sees

### Today (the tab that now opens, with its count)

Four sections, each hidden when empty, each row opening the prospect:

| Section | What is in it | Order |
|---|---|---|
| **Replies waiting** | Inbound emails not yet answered, snoozed or marked done — truck, the first ~140 characters, when it arrived, and **Open · Mark done · Snooze** | **Oldest first** — the longest wait is the first answer |
| **Chasers due** | Every *contactable* prospect whose derived next step is due today or overdue: the rung's name, its due date, how many days late, the channel, and **Compose** | **Most overdue first** |
| **Follow-ups due** | `next_action_at` today or earlier, for anyone **not already listed above** | Most overdue first |
| **Emails needing a look** | Outbound rows that `failed`, are `uncertain`, or `bounced` — the last reading *"Bounced — check the address"* | Newest first |

With nothing in any of them: **"Nothing waiting. Nice."** The count on the tab is every row across the
four, so "is there anything?" is answered before clicking.

**Compose** opens the prospect *and* its compose window, on that step's own template — the same
`templateForStep` pre-selection the modal already used. It opens a window; it sends nothing.

### The timeline (in place of two lists)

One list, newest first, merging **emails**, **contact rows that are not emails** (calls, WhatsApp,
hand-logged), and **stage changes and notes**. An email that wrote a contact row appears **once**, as
the email.

- Each email shows direction (inbound rows are tinted and read `← in`), a status badge that names
  itself — Sent / Reply / Auto-reply / Bounce / Bounced / Failed / May have been sent, plus `imported`
  and `from Outlook` — the subject, the time, any attachment count, and the first three lines of text.
- **Open** expands the whole email inline, instantly, from the stored body, in the same `sandbox=""`
  iframe with `srcDoc`, attachment names listed and nothing downloaded.
- An inbound reply that is waiting carries **"Waiting for you"** and **Mark done / Snooze**; one that
  is not carries **Mark as needing reply**, which is the undo for either.
- **Retry**, **Save to Sent** and **log it** are unchanged and still appear on exactly the rows that
  need them.
- A contact row shows its channel, its kind and its message, and opens the same popout as before —
  which is where **Delete** lives.
- **Add note** sits at the top, where the newest entry goes.
- Test sends are hidden behind **Show test sends (n)**.

The prospect's own `notes` column is now labelled **Pinned notes** — what is always true of this truck,
as against a timeline note, which is what happened once, on a day.

---

## 2 · Every writer of `outreach_prospects.stage`

Found by census, not by memory — and the census is in the harness, so a fourth writer added later
fails it:

| # | Writer | Move | Records |
|---|---|---|---|
| 1 | [`lib/outreach-contact-log.ts:84`](../lib/outreach-contact-log.ts#L84) — outbound log | `not_contacted` → `contacted`, filtered `.eq('stage', DEFAULT_STAGE)` | `stage_change`, body *"First email sent"* at rung 1, else *"Contact logged"* |
| 2 | [`lib/outreach-contact-log.ts:113`](../lib/outreach-contact-log.ts#L113) — inbound log | `not_contacted`/`contacted` → `replied`, filtered `.in('stage', REPLY_MOVES_FROM)` | `stage_change`, body *"Reply received"* |
| 3 | [`app/api/admin/outreach/route.ts:700`](../app/api/admin/outreach/route.ts#L700) — `update_prospect` (the modal's Stage select) | any validated stage | `stage_change`, body *"Set by hand"* |

**Nothing else writes it.** `mail-send`, `mail-import`, `mail-poll`, `mail-diagnostics` and the two new
routes read `outreach_prospects`; none updates a stage. The harness asserts exactly that, and it
recognises **both shapes of write** — the inline `update({ stage: … })` and the allow-listed
`patch.stage = …` — because a census that knew only the first would have declared the hand-set stage a
non-writer, which is the one a person uses most.

🔴 **An event is written only when a row actually changed.** Two of the three writes are conditional,
so most calls update nothing; the guard is `if (stage)` — non-null only when the filtered UPDATE
returned a row — and, for the hand-set stage, an explicit comparison against the value read first.
"contacted → contacted" never appears.

⚠️ **`from_stage` is a fact on one path and a read on the other.** The outbound move's filter *is*
`stage = not_contacted`, so a returned row was on that stage; nothing is read. The inbound move may
come from either of two stages and an UPDATE cannot return what it replaced, so the previous value is
read first — that read decides nothing, it only names what the timeline says.

---

## 3 · The rules, and the lines that implement them

### (1) "Waiting for me"

[`lib/outreach-attention.ts:36`](../lib/outreach-attention.ts#L36) — one predicate, five refusals:

```ts
if (opts.linkedTruck) return false
if (row.status !== 'received') return false
if (row.is_test === true) return false
if (row.handled_at) return false
if (row.snoozed_until && new Date(row.snoozed_until).getTime() > opts.now.getTime()) return false
```

Each clause has a case behind it: an auto-reply or a delivery report is not a reply; a reply to a test
send is Dominic answering himself; a linked HatchGrab truck is a **customer**, which the send route,
the poll and the queue already refuse to treat as a lead. The Today route, the timeline's badge and
the tab's count all call this one function — [`today/route.ts:93`](../app/api/admin/outreach/today/route.ts#L93)
and the timeline row in the panel.

⚠️ **The snooze test is deliberately NOT in the SQL.** The query narrows what has to be read; the
predicate decides. One place owns "waiting".

### (2) Answering handles what came before it

[`lib/outreach-contact-log.ts:91`](../lib/outreach-contact-log.ts#L91), inside the **single contact
writer** and nowhere else, so a system send, a logged call, a WhatsApp and an Outlook reply the poll
finds all count:

```ts
await markEarlierRepliesHandled(supabase, input.prospect_id, happenedAt, nowIso)
```

and the sweep itself ([`:173`](../lib/outreach-contact-log.ts#L173)):

```ts
.eq('prospect_id', prospectId).eq('direction', 'inbound')
.is('handled_at', null)
.lt('message_date', happenedAt)
```

🔴 **`.lt`, not `.lte`, and never unfiltered.** A reply that lands while he is typing the answer has
not been answered by it. `.is('handled_at', null)` keeps it idempotent: re-logging cannot rewrite
*when* a reply was dealt with.

🔴 **And `happenedAt` is not `contacted_at`.** The Log-a-contact form stores a **date**, so comparing
it as an instant means **midnight** — a call logged today would have marked nothing, and the headline
behaviour of this build would have silently done nothing. [`handledBoundary`](../lib/outreach-attention.ts#L156)
owns the difference: a date-only contact counts as **the earlier of (the end of that day) and (now)** —
logged today ⇒ now, so everything earlier today is before it; back-dated ⇒ the end of *its* day, so
replies on later days are untouched. A real timestamp is used exactly as it stands.

### (3) The timeline

[`lib/outreach-timeline.ts:72`](../lib/outreach-timeline.ts#L72) — pure, and the two rules that matter
are one line each:

```ts
if (m.is_test === true && !input.showTests) continue   // a test is not correspondence
if (c.email_message_id) continue                       // shown as the EMAIL, not twice
```

⚠️ Hiding tests hides the *email*; the rung behind it is **not** promoted into view, or the toggle
would change what the ladder looks like rather than what is displayed.

### (4) Today

[`lib/outreach-today.ts:79`](../lib/outreach-today.ts#L79) sorts and buckets and **derives nothing**.
Chasers are `step.state === 'due' && p.channel !== null`
([`:96`](../lib/outreach-today.ts#L96)); follow-ups exclude anyone already listed
([`:111`](../lib/outreach-today.ts#L111)).

🔴 **§57.1 holds: one derivation.** The panel calls `nextStep` **exactly once**
([`OutreachPanel.tsx:748`](../components/admin/OutreachPanel.tsx#L748) feeds `buildToday` from that
same map), and contactability comes from `channelFor`'s map, never from `step.channel` — every stopped
step carries `channel: null`, so reading the step would file reachable trucks as unreachable (§57.2).

### (5) The four writes

[`app/api/admin/outreach/timeline/route.ts`](../app/api/admin/outreach/timeline/route.ts) —
`mark_handled` ([:123](../app/api/admin/outreach/timeline/route.ts#L123)), `snooze`
([:125](../app/api/admin/outreach/timeline/route.ts#L125)), `needs_reply`
([:134](../app/api/admin/outreach/timeline/route.ts#L134)), `add_note`
([:136](../app/api/admin/outreach/timeline/route.ts#L136)).

- Done is done: `mark_handled` clears the snooze too, or it would come back.
- A snooze leaves `handled_at` **null** — "not now" is not "done", which is the whole reason there are
  two columns.
- `needs_reply` clears **both**, because it is the undo for either.
- 🔴 **None of them writes a contact row.** Marking a reply done is not a touch, and putting it on the
  ladder would change what §57 derives.
- Snoozes land at **08:00 London** on the chosen morning, with the offset resolved at the *target*
  instant — 07:00Z in summer, 08:00Z in winter, and correct across the October clock change.

### (6) Imported mail is history, so it is already handled

One line in the importer
([`mail-import/route.ts`](../app/api/admin/outreach/mail-import/route.ts)):

```ts
...(f.direction === 'inbound' ? { handled_at: new Date().toISOString() } : {}),
```

⚠️ **Found while building, not after.** Everything the importer records is now strictly *before* the
account's `POLL_SINCE`; left unhandled, a single "Import past emails" would have dropped months of old
replies into the morning's work as if every one were waiting — exactly what the migration's one-off
backfill had to undo for the rows already in the table.

---

## 4 · The harness

`scripts/outreach-crm-today.cjs` — **NEW**, registered in `scripts/harnesses.json` (62 harnesses),
**124 checks**, no network, no mailbox, no database.

### Broken variants — shown FAILING first

```
✓ FAILED as required  V1  the test exclusion removed: a reply to a test send is presented as a business waiting
✓ FAILED as required  V2  the handled test removed: a reply dealt with weeks ago is still "waiting for me"
✓ FAILED as required  V3  the snooze test removed: a reply snoozed until next week is on the list now
✓ FAILED as required  V4  a customer's email is queued as outreach work
✓ FAILED as required  V5  the status test removed: an out-of-office is presented as a reply needing an answer
✓ FAILED as required  V6  the timezone conversion removed: a summer snooze returns at 09:00 London, not 08:00
✓ FAILED as required  V7  one email appears twice — once as itself and once as its rung
✓ FAILED as required  V8  a test send is part of the conversation by default
✓ FAILED as required  V9  one truck is listed as two separate jobs — a chase AND a follow-up
✓ FAILED as required  V10 a prospect with no email and no WhatsApp number is listed as a chase to send today
✓ FAILED as required  V11 a call logged today counts as midnight: this evening's reply is not marked handled
```

Three **censuses** are also shown failing on a mutated source, because a census over a file the
harness cannot compile proves nothing otherwise.

### What it proves

```
── WHICH REPLIES ARE WAITING ────────────────────────────────────────────────────────────
  ✓ 🔴 a real, unhandled, unsnoozed reply is waiting
  ✓ …a reply to a TEST send is not      ✓ …an auto-reply is not      ✓ …a bounce report is not
  ✓ 🔴 …and a prospect linked to a HatchGrab truck is never queued: it is a customer, not a lead
  ✓ 🔴 …and an EXPIRED snooze brings it back with nobody pressing anything

── WHEN A SNOOZE COMES BACK ─────────────────────────────────────────────────────────────
  ✓ 🔴 in summer, 08:00 London is 07:00Z        ✓ …in winter it is 08:00Z
  ✓ 🔴 a snooze taken before the clocks change still comes back at eight in the morning

── AN OUTBOUND CONTACT HANDLES ONLY WHAT CAME BEFORE IT ─────────────────────────────────
  ✓ 🔴 EARLIER ONLY — `.lt`, not `.lte` and not unfiltered
  ✓ 🔴 …and it runs on EVERY outbound log — a send, a call, a WhatsApp, an Outlook reply the poll finds
  ✓ ⚠️ …and never on an inbound one: a reply does not answer itself
  ✓ 🔴 mail-send / mail-poll / outreach / today do not write handled_at
  ✓ 🔴 imported INBOUND mail is recorded already handled — it is history, not work

── WHAT "AFTER" MEANS WHEN A PERSON TYPES A DATE ────────────────────────────────────────
  ✓ 🔴 a call logged with TODAY's date counts as now, not as midnight
  ✓ 🔴 a back-dated call counts as the end of ITS day…

── EVERY STAGE WRITER RECORDS WHAT IT DID ───────────────────────────────────────────────
  ✓ 🔴 exactly two files write a stage, and they are the two that record events
  ✓ 🔴 …only when the update actually returned a row
  ✓ 🔴 the hand-set stage records one ONLY when the value actually changed — no 'contacted → contacted'
  ✓ lib/outreach-events.ts owns the table   ✓ …mail-poll / mail-send never write it directly

── THE TIMELINE ─────────────────────────────────────────────────────────────────────────
  ✓ 🔴 newest first, across all three sources
  ✓ 🔴 the contact row written BY an email is not shown — the email is
  ✓ ⚠️ and a test send is out of the story by default
  ✓ ⚠️ …and showing tests does NOT promote a de-duplicated rung into view

── TODAY ────────────────────────────────────────────────────────────────────────────────
  ✓ 🔴 replies OLDEST first — longest wait, first answer
  ✓ 🔴 only DUE and reachable, most overdue first; a scheduled step and an unreachable prospect are out
  ✓ 🔴 follow-ups exclude anyone already listed above, and anything not yet due
  ✓ ⚠️ the tab counts every row across the four sections   ✓ 🔴 a bounce says what to DO about it

── ONE DERIVATION, AND NO MAILBOX ───────────────────────────────────────────────────────
  ✓ 🔴 lib/outreach-today.ts derives no step of its own…
  ✓ ⚠️ …and the same census FAILS on a version that does, so it is testing the rule
  ✓ 🔴 the panel calls `nextStep` EXACTLY ONCE — the map the table, the counts and Today all read
  ✓ 🔴 today/timeline routes and all four libs open no mailbox   ✓ …and send nothing
  ✓ 🔴 …and the CRM buttons write no contact row: marking a reply done is not a rung on the ladder

── WHAT THE SCREEN DOES ─────────────────────────────────────────────────────────────────
  ✓ 🔴 Today is the DEFAULT tab, not a second page      ✓ …and the tab carries the count
  ✓ ⚠️ mailbox HTML still renders only in a sandboxed iframe
  ✓ 🔴 …and says so, rather than reporting an empty queue, when the migration is missing
```

### Two stale anchors, restated rather than re-pointed

- **`scripts/outreach-mail-poll.cjs`** sliced `function ProspectMessages` … `interface ViewedEmail` and
  counted three `await onChanged()` calls. Both anchors are gone — that component and the separate
  `EmailViewer` were replaced by `Timeline`, which absorbed all three actions and added four. The
  harness now says so in a comment, asserts the **rule** (every write refreshes both), and checks the
  three actions survived the move.
- **`scripts/outreach-stage-advance.cjs`** matched `updated_at: new Date().toISOString()` literally.
  The writer now computes one `nowIso` and shares it between the stage move, the handled sweep and the
  event, so those three cannot be recorded milliseconds apart and read as three separate moments. The
  check is restated to assert exactly that, and the runtime check that `updated_at` is set is
  untouched and still passes (28 checks, all green).

Three mocks in two existing harnesses also gained the methods the writer now calls — `maybeSingle` in
both `outreach-mail-poll.cjs` mocks, and `is` / `lt` / `maybeSingle` in `outreach-mail-send.cjs`'s —
each with a comment naming the new calls and stating that nothing those blocks assert has changed.
⚠️ **The send harness caught this itself**, mid-sweep, by throwing rather than by quietly passing: a
fake client that does not implement a method the real one has is a fake that would hide the next real
call too.

---

## 5 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 4.8s` |
| eslint — the six new `lib/` and route files | **clean, 0 problems** |
| eslint — `OutreachPanel.tsx` | 13 problems, **identical to HEAD** (5 × `no-explicit-any`, 7 × `set-state-in-effect`, 1 × `immutability`) |
| eslint — `outreach/route.ts` · `mail-import/route.ts` · `outreach-contact-log.ts` | 9 / 0 / 0 — **identical to HEAD** |
| `node scripts/outreach-crm-today.cjs` | **124 checks, all passed** |
| `node scripts/run-harnesses.cjs` (run alone) | **62 run · 62 passed · 0 failed** |
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` ✅ unchanged |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` ✅ unchanged |

⚠️ **The new harness reports 4 eslint errors and so does every other harness in `scripts/`** — all four
are `no-require-imports` on its `require()` lines. `scripts/*.cjs` are CommonJS by design and the repo's
config flags them identically in `outreach-mail-poll.cjs` and the rest; this file is consistent with
them rather than clean against a rule none of them meets.

No email was sent. No SQL was run. No template or snippet row was touched. `do_not_contact` is still
never set automatically, and no live trading truck was involved.

---

## 6 · SQL (already applied by Dominic, recorded only)

`supabase/migrations/20260929_outreach_crm_today_timeline.sql`:

```sql
alter table public.outreach_messages add column if not exists handled_at    timestamptz;
alter table public.outreach_messages add column if not exists snoozed_until timestamptz;

update public.outreach_messages set handled_at = now()
  where direction = 'inbound' and handled_at is null;

create table if not exists public.outreach_events (
  id          uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.outreach_prospects(id) on delete cascade,
  kind        text not null check (kind in ('stage_change','note')),
  from_stage  text,
  to_stage    text,
  body        text,
  created_at  timestamptz not null default now()
);
create index if not exists outreach_events_prospect_created_idx
  on public.outreach_events (prospect_id, created_at desc);
alter table public.outreach_events enable row level security;
revoke all on public.outreach_events from anon, authenticated;

notify pgrst, 'reload schema';
```

The `'outreach-attachments'` bucket exists and **is not used here** — it is for part 2.

---

## 7 · Commit and deploy evidence

**Commit `10d78dc`** — *"A Today screen and a per-truck timeline: the outreach page becomes a daily
workspace"*, on `main`, pushed to `origin/main` (`0b540d1..10d78dc`). Fifteen files: eight new (four
`lib/` modules, two routes, the harness, the migration record), six changed, one report. No other work
is in it.

**Deployed and serving on production, confirmed 2026-09-29T23:53:23Z.**

Build-fingerprint method — the set of `/_next/static/chunks/*.js` the home page references:

```
fingerprint at push:  d652182b9124945c7075889636bd4e25
23:51:41Z poll 1:     d652182b9124945c7075889636bd4e25
23:52:01Z poll 2:     d652182b9124945c7075889636bd4e25
23:52:22Z poll 3:     d652182b9124945c7075889636bd4e25
23:52:42Z poll 4:     d652182b9124945c7075889636bd4e25
23:53:02Z poll 5:     d652182b9124945c7075889636bd4e25
23:53:23Z poll 6:     f5a578703399b6ae832053751adbbfae     ← DEPLOY LANDED
```

🔴 **And this time two NEW routes prove it directly**, which the last three commits could not:

| Request | Status | Body |
|---|---|---|
| `GET /api/admin/outreach/today` | 404 | `{"error":"Unauthorised"}` — the route exists and refused |
| `GET /api/admin/outreach/timeline` | 404 | `{"error":"Unauthorised"}` — same |
| `GET /api/admin/outreach/does-not-exist-check` | 404 | the app's **HTML** 404 page |

⚠️ **The two 404s are not the same 404.** An admin route answers `{"error":"Unauthorised"}` as JSON —
it does not confirm its own existence to an unauthenticated caller — while a path that does not exist
returns the app's HTML page. The JSON body is therefore evidence the new code is deployed: before this
commit, both of those paths returned the HTML.

---

## 8 · Test script — ZZ Test Prospect (Dominic) only

`a5beca7f-3edb-4fa1-abc1-6b00e75d1e46`. Nothing below touches another prospect.

1. **Reply from Hotmail** to the last email in the thread. Wait for the ten-minute cron, or press
   **Check for replies now**.
   → The reply appears under **Replies waiting** with its first line and the time, and the **Today**
   tab's count goes up. The page does this without being reloaded.
2. **Snooze → In 3 days.**
   → The row leaves Today immediately. Open the prospect: the email is still in the timeline, now with
   **Mark as needing reply** instead of the waiting badge.
3. **Mark as needing reply.**
   → It is back under Replies waiting at once, oldest-first among anything else there.
4. **Log a call** in the prospect modal (Channel `phone`, Direction `outbound`, today's date).
   → The reply is marked handled **automatically** and leaves Today. The timeline shows the call as its
   own row. ⚠️ This is the step that would have silently done nothing if `contacted_at` were read as
   midnight — see §3(2).
5. **Add a note** at the top of the timeline.
   → It appears immediately as the newest entry, above the call.
6. **Change the stage by hand** in the modal's Stage select.
   → A **Stage** line appears in the timeline: `replied → not interested · Set by hand`. Choosing the
   same stage again adds nothing.

⚠️ **Expect a second stage line from step 1** if the reply moved the prospect: `contacted → replied ·
Reply received`, written by the poll through the single contact writer.

---

## 9 · What was deliberately not done

- **Part 2 is not here.** No Reply-with-full-history, no attachments, and the private
  `outreach-attachments` bucket is untouched.
- **The Emails list and the contact-history table are gone, not hidden.** `HistoryTable`,
  `HISTORY_COLS`, `ProspectMessages`, `MailMessage` and the separate `EmailViewer` popout were deleted;
  `ContactPopout` — where Delete lives — is unchanged and is opened from a contact row in the timeline.
  Leaving dead components beside their replacement is how two implementations of one list start.
- **A note is not a contact.** Notes and stage changes go to `outreach_events`, which nothing derives
  from; putting them in `outreach_contacts` would change what §57 computes as the next step.
- **Nothing auto-snoozes and nothing auto-marks by time.** A reply stops waiting when it is answered or
  when Dominic says so, never because it got old.
