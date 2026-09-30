# Outreach CRM polish — the date that stuck, one row per note, and two controls that did nothing

**30 September 2026 · commit `67f7c6e` · deployed and serving on production at 19:02:02Z**

Seven fixes and one diagnosis. Item 8's SQL is in §8 and in the chat reply; **nothing was run**.

---

## 1 · The follow-up date did not stick — the diagnosis

**Exactly as you expected, and worse in one way.** Two separate faults:

```ts
const followUpSeed = useMemo(
  () => defaultFollowUpChoice(oneClick, today, followUpDateFor), [oneClick, today])   // ← the suggestion
const [followUp, setFollowUp] = useState<…>(null)                                     // ← local only
…
onClick={() => onSetFollowUp({ choice: c, date })}                                     // ← setState, nothing else
```

1. 🔴 **A chip wrote nothing.** It set local state, and that state was read by `applyFollowUp` — which
   runs **after a log or a send**. Choose a date, do nothing else, and nothing was ever written.
2. 🔴 **The chips never showed the stored value.** They were seeded from `defaultFollowUpChoice` —
   the interval the *next action* would set. On Nomadough, which has **replied**, there is no rung,
   so there is no suggestion, so the seed was `none`: **"None" rendered over a real date in the
   database.** Even a date written by a previous send was invisible.
3. 🔴 **And the banner hid it too.** `nextAction`'s case (3) only fired when `nextActionAt <= today`;
   a date in the future fell through to **"No next step"**.

### What it does now

- **Choosing a date saves it immediately**, through `applyFollowUp` — still the **one writer** of
  `next_action_at`, now with an optional explicit date and a **nullable kind**: a date chosen on its
  own contacts nobody, so it must never freeze the lead type. Two callers, one statement.
- **"Follow-up set for Wed 7 Oct"** with **Undo** for 8 seconds; **None** clears it the same way.
- The chips are seeded from the **stored value first** (`storedFollowUpChoice`), naming the matching
  chip so a week out reads as "+1 week" rather than an anonymous "Pick".
- The banner shows a stored follow-up — **including a future one, and including on a prospect who
  has replied**: *"Follow up — Wed 7 Oct"*, or *"… · 2 days overdue"*. ⚠️ It never outranks a waiting
  reply or a due chase; it sits after both.
- Logging a call or sending still sets the follow-up exactly as before, and the chips follow.

---

## 2 · A note is one row again

A multi-line note rendered `whitespace-pre-wrap` inline, blank lines and all, so the history stopped
being a list. It is now **one row — icon · date · "Note" · the first line, truncated — with Edit and
Delete on the right**, and clicking it expands the full text in place.

`tidyNoteText` collapses runs of empty lines to **one** break and keeps every line break that was
typed; it is used by the row, the expanded view and the Notes card. ⚠️ The Notes card still shows
every note **in full** — that list *is* the notes — which is what the `collapsible` flag decides.

---

## 3 · "also logged by hand" is gone

Removed from the history row and from the reading panel. 🔴 **The pairing is untouched**: still one
row per email, still refusing to guess on an ambiguous day, still matching on the opening words.
What went was the *label*, which announced a de-duplication nobody had asked about.

What survives is the only part that carries information: when the hand-logged note says something
the email does not, the panel shows **"Note logged with this email ▸"**, closed. When it is the email
pasted in, nothing is shown at all.

---

## 4 · Plans PDF

A plain white toolbar button, exactly like Attach file. 🔴 Orange on this page means one thing —
something is about to leave the building — and that belongs to **Send** and the **Next banner**.

---

## 5 · "Previous email ▸" did nothing — the diagnosis

**Two causes, both fixed.**

1. 🔴 **It opened below the fold.** The toggle set `quotedOpen` and the block rendered *underneath a
   fixed-height editor*, on a page that by then also carried the composer, the send row and the
   history. On a laptop the newly opened block appeared off the bottom of the screen: nothing was
   broken, and nothing was visible either. It now **scrolls itself into view** (`QUOTE_BLOCK_ID`,
   `block: 'nearest'`).
2. 🔴 **A second condition the toggle did not share.** The link lives in the To line, which has
   rendered unconditionally since v4; the block was gated `isEmail && thread && quotedOpen`. With a
   WhatsApp template selected the link was there and the block could **never** appear. One condition
   now, in one place: `thread && quotedOpen`.

With **Include previous email** unticked the link reads **"Previous email (not included) ▸"** and
still opens it for reading.

---

## 6 · "Insert in email" inserted nothing — the diagnosis

```ts
const insertDemoLink = useCallback(() => {
  setPanel('email')
  setNote('Paste the demo link into the email with ⌘V — it is on your clipboard.')
}, [])
```

🔴 **It never inserted anything.** It switched to the Email tab and printed a note asking for a
paste — and it only worked at all because the button called `copy()` first. On Nomadough that reads
exactly as "did nothing": the note is one grey line at the top of the tab strip, and nothing had gone
into the email.

**Now:** the editor publishes an imperative handle (`insertLink`), the page holds it in a ref, and
the Demo card sends it the **full URL**. It focuses first — without a selection ProseMirror has
nowhere to put the text — and inserts at the caret, or at the end when the editor has never been
focused. It works with Blank and with a template loaded, and it does **not** raise the "you have
edited this message" banner wrongly, because that banner compares the text against the template's own
render and requires a template.

🔴 **It is a real link, and that needed the document schema.** The schema is an allow-list by
construction — three node types and, until now, two marks. A `link` mark carries a **value**, which
is a hole unless the value is an allow-list too:

```ts
export const LINK_RE = /^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>]*)?$/i
```

`https` only. `javascript:`, `data:`, `http:`, protocol-relative `//`, and anything with a quote or
an angle bracket in it are **refused, not stripped** — the send stops with a sentence naming the
link, exactly as every other schema violation does.

⚠️ **Copy**: it copies the full `https://…/demo/<slug>` URL, from the same one value the insert uses.
It did already; the two now cannot disagree. Insert no longer copies as a side effect — a silent
clipboard write on an unrelated click loses whatever you had copied a moment ago.

---

## 7 · A call is no longer labelled "reply"

After a prospect replies, `oneClickKind` logs every one-click contact as `reply` — **correctly**,
because `reply` is not a rung and a call back must not advance the chase ladder. The row printed that
stored kind. `contactRowLabel` now says what happened: **"Call"**, **"WhatsApp"**, **"Text"** — and
keeps the rung wording for **email**, where "reply" is the right word. 🔴 **Display only. The stored
kind is unchanged**, and `nextStep` reads exactly what it always read.

---

## 8 · Stages that are out of date — the SQL (not run)

**Read-only: who is affected.**

```sql
-- Prospects still sitting at not_contacted/contacted that have actually replied.
with inbound as (
  select prospect_id, min(contacted_at) as first_inbound
  from public.outreach_contacts
  where direction = 'inbound'
  group by prospect_id
  union all
  select prospect_id, min(coalesce(message_date, created_at))
  from public.outreach_messages
  where direction = 'inbound' and is_test = false and status = 'received'
  group by prospect_id
)
select t.name,
       p.stage,
       min(i.first_inbound) as first_inbound
from public.outreach_prospects p
join public.discovery_trucks t on t.id = p.discovery_truck_id
join inbound i on i.prospect_id = p.id
where p.stage in ('not_contacted', 'contacted')
group by t.name, p.stage
order by first_inbound;
```

**The UPDATE, if you choose to run it.** 🔴 It mirrors **`logOutreachContact`'s own rule**: when an
inbound contact is recorded, the prospect moves to `replied` **only from a stage that has not already
moved past it** (`REPLY_MOVES_FROM` = `not_contacted`, `contacted`), and the move is recorded through
`recordStageChange` with a cause. The `from_stage`/`to_stage`/`body` written here are the same shape
that writer produces, with `STAGE_CAUSE.replyReceived`.

```sql
begin;

with inbound as (
  select prospect_id, min(contacted_at) as first_inbound
  from public.outreach_contacts
  where direction = 'inbound'
  group by prospect_id
  union all
  select prospect_id, min(coalesce(message_date, created_at))
  from public.outreach_messages
  where direction = 'inbound' and is_test = false and status = 'received'
  group by prospect_id
),
targets as (
  select p.id, p.stage as from_stage
  from public.outreach_prospects p
  join inbound i on i.prospect_id = p.id
  where p.stage in ('not_contacted', 'contacted')
  group by p.id, p.stage
),
moved as (
  update public.outreach_prospects p
  set stage = 'replied', updated_at = now()
  from targets tg
  where p.id = tg.id
  returning p.id, tg.from_stage
)
insert into public.outreach_events (prospect_id, kind, from_stage, to_stage, body)
select id, 'stage_change', from_stage, 'replied', 'Reply received'
from moved;

commit;

notify pgrst, 'reload schema';

-- Verification: nobody left behind, and the events that were written.
select count(*) as still_wrong
from public.outreach_prospects p
join public.outreach_contacts c on c.prospect_id = p.id and c.direction = 'inbound'
where p.stage in ('not_contacted', 'contacted');

select e.created_at, t.name, e.from_stage, e.to_stage, e.body
from public.outreach_events e
join public.outreach_prospects p on p.id = e.prospect_id
join public.discovery_trucks t on t.id = p.discovery_truck_id
where e.kind = 'stage_change' and e.body = 'Reply received'
order by e.created_at desc
limit 50;
```

⚠️ **Nothing in this build changes a stage.** Going forward the single writer handles it; this is
only the history that predates it.

---

## 9 · The harness

`scripts/outreach-crm-polish.cjs` — **NEW**, registered (72 harnesses), **61 checks**, **10 broken
variants**, no network, no mailbox, no database.

```
✓ FAILED as required  V1 🔴 a stored follow-up is invisible until it falls due
✓ FAILED as required  V2 🔴 the chips ignore the stored date again
✓ FAILED as required  V3 🔴 a call is labelled by its stored kind — "reply · Spoke to Libby"
✓ FAILED as required  V4 a note keeps its blank lines and takes six rows
✓ FAILED as required  V5 🔴 a javascript: href is accepted into an email
✓ FAILED as required  V6 🔴 a chip saves nothing — it only pre-sets the next log
✓ FAILED as required  V7 🔴 the "also logged by hand" marker is back on the row
✓ FAILED as required  V8 🔴 Plans PDF is orange again
✓ FAILED as required  V9 🔴 "Previous email" opens nothing you can see
✓ FAILED as required  V10 🔴 "Insert in email" goes back to asking for a paste
…
✅ all 61 passed
```

### Stale checks, restated in place

| File | Check | Why |
|---|---|---|
| `outreach-workspace.cjs` | "a FUTURE follow-up date is not due" | **reversed on purpose** — it is not *due*, but it is what happens next |
| | the banner's wording | gained the weekday, lost "due" |
| `outreach-workspace-v2.cjs` | "the chosen date is written ONLY by `applyFollowUp`" | still true; the function gained a second caller and an optional date |
| `outreach-mail-send.cjs` | the "unknown mark" variant used `link` | `link` **is** a mark now; `strike` stands for the unknown one |
| `outreach-workspace-v3.cjs` ×2, `-v4.cjs`, `-v4-fixes.cjs` ×4 | the "also logged by hand" anchors | the marker was removed at your instruction; the pairing and the reachable note are still asserted |
| `outreach-workspace-v3-fixes.cjs` | "each note in full" | still true of the Notes card; the history collapses one |
| `outreach-reply-attach.cjs`, `outreach-reply-any-notes.cjs` | the "Previous email ▸" label | it now says whether it will be sent |

---

## 10 · Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | `✓ Compiled successfully in 5.7s` |
| eslint — all nine changed files | **identical to HEAD** |
| `node scripts/outreach-crm-polish.cjs` | **61 checks, all passed**, 10 variants caught |
| `HG_RENDER=1` (Chromium + WebKit) | all measurements still correct in both engines |
| `node scripts/run-harnesses.cjs` | **72 run · 72 passed · 0 failed** |
| goldens | `8bdae817…` and `e3f0a880…` ✅ unchanged |

No email sent. No SQL run. No template row touched. No database change. One send path, one contact
writer, one follow-up writer, one `nextStep` per page, every sequence guard, `EMAIL_FRAME_SANDBOX`
unchanged.

Fingerprint `5d9932d4…` at push → `d65a1e91…` at **19:02:02Z**.

---

## 11 · What to test

**ZZ Test Prospect** for anything that writes or sends. **Nomadough: viewing only.**

1. **ZZ Test Prospect** ① — click **+1 week** under Next follow-up. You should see **"Follow-up set
   for …"** with **Undo**. Reload: the chip is still lit and the date is still there. The Next banner
   should read **"Follow up — <that day>"**. Press **None**: it clears, with the same receipt.
2. ① Press **Undo** within 8 seconds after a change and check the previous date comes back.
3. ① Log a call: the follow-up should move as it always did, and the chips should follow it.
4. ⑥ Open the **Demo** card → **Insert in email**. The full `https://www.hatchgrab.com/demo/…` URL
   should appear **in the email, as a link**, at your cursor. Try it with **Blank** and with a
   template loaded — and check **no** "You have edited this message" banner appears for Blank.
   Press **Copy** and paste somewhere: the same full URL.
5. ⑤ On a chaser, click **Previous email ▸**: the quoted email should **open and scroll into view**.
   Untick **Include previous email** — the link becomes **"Previous email (not included) ▸"** and
   still opens.
6. ④ **Plans PDF** is a plain white button beside Attach file.
7. ② Add a note with several lines and a blank line between them. In **History** it is **one row**
   ("Note · the first line"); click it to expand. In the **Notes card** it is shown in full — with no
   blank-line gaps in either.
8. ⑦ Log a call on a prospect that has replied: the row should read **"Call · …"**, never "reply · …".
9. **Nomadough — viewing only** ①③⑦: the banner should show its follow-up date if one is set; no
   "also logged by hand" anywhere; its calls should read "Call". **Send nothing.**
