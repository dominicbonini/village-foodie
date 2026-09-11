# Follow-up intervals, and the cap at four rungs — report

🔴 **No file was changed by this task.** Item (1) asked for behaviour the code already has, and I am not
going to manufacture an edit to make a report look busy. Item (2) was report-only by instruction. The only
new file in the tree is this report.

Nothing in the prompt arrived garbled, and no instruction contradicted another.

---

## 0. `git status` before anything, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/admin/page.tsx
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx
	modified:   docs/manual-update-report.md
	modified:   docs/reference-manual.md
	modified:   docs/scraper-reference-manual.md
	modified:   lib/outreach.ts

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/admin/discovery-events/
	app/api/admin/outreach-templates/
	components/admin/ComposeWindow.tsx
	components/admin/ConfirmDeleteDialog.tsx
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/EventRowCells.tsx
	components/admin/InlineField.tsx
	components/admin/ScheduleEventsPopup.tsx
	components/admin/TemplatesPanel.tsx
	docs/compose-single-pane-report.md
	docs/compose-window-stacking-report.md
	docs/discovery-events-delete-report.md
	docs/discovery-events-table-report.md
	docs/discovery-run-log-migration-report.md
	docs/outreach-compose-send-report.md
	docs/outreach-compose-window-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-history-table-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-kind-final-report.md
	docs/outreach-kind-vocabulary-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-schedule-popup-report.md
	docs/outreach-sequence-report.md
	docs/outreach-table-report.md
	docs/outreach-templates-report.md
	docs/outreach-templates-table-report.md
	docs/templates-layout-tweaks-report.md
	docs/templates-page-layout-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/outreach-template-render.ts
	lib/schedule-match.ts
	supabase/migrations/20260909_outreach_templates.sql
	supabase/migrations/20260910_outreach_contact_kinds.sql

no changes added to commit (use "git add" and/or "git commit -a")
```

---

## 1. The intervals — all five, executed from a clean state

### 1.1 What the code holds

`lib/outreach.ts:149` is the whole of it:

```ts
export const FOLLOW_UP_DAYS: Record<LadderKind, number | null> = {
  '1_first_contact': 3,
  '2_chase_1': 7,
  '3_chase_2': 14,
  '4_final_chase': null,   // the sequence ends here; no date is proposed
}
```

`reply` is deliberately absent from the map, and `followUpDateFor` treats a missing entry exactly as it
treats `null` (`if (days == null) return null` — `==` catches `undefined` too).

### 1.2 The proof — the shipped handlers, not the pure function alone

The failure you named ("a populate that never fires and one that works look identical whenever a date is
already present") is a UI-layer failure, so the pure function is not enough to prove anything. These are the
**compiled component's own handlers**, extracted from the transpiled `OutreachPanel.tsx` by brace-matching
and executed — this is the code that ships, character for character:

```js
const fillNextFromKind = (k) => {
    setNextAt((0, outreach_1.followUpDateFor)(k, contactedAt) ?? '');
    setNextTouched(false);
}
const persistFollowUpAfterLog = (k) => {
    const due = nextTouched ? (nextAt || null) : (0, outreach_1.followUpDateFor)(k, contactedAt);
    setNextAt(due ?? '');
    setNextTouched(false);
    onPatch(p.id, { next_action_at: due });
}
```

Each stage is run twice, in two separate sandboxes — choosing a stage re-renders before the Log click, so
running both in one closure would let the second handler read stale state. Contact date 2026-09-10.

**A) CLEAN STATE — no stored date, no button pressed** *(the state item (1) asked for)*

| Stage chosen | Field after choosing the stage | Written to `next_action_at` on log |
|---|---|---|
| First contact | `"2026-09-13"` | `"2026-09-13"` |
| Chase 1 | `"2026-09-17"` | `"2026-09-17"` |
| Chase 2 | `"2026-09-24"` | `"2026-09-24"` |
| **Final chase** | `""` | **`null`** |
| Reply | `""` | `null` |

+3, +7, +14, clear, clear. Chase 2's +14 is untouched, as instructed.

**B) A DATE WAS ALREADY SET — 2026-09-30, seeded from the stored column, untouched**
*(this is the case the red constraint demands: a clear that never fires and one that works both leave an
empty field empty, so the only honest test starts with a date present)*

| Stage chosen | Field after choosing the stage | Written on log |
|---|---|---|
| First contact | `"2026-09-13"` | `"2026-09-13"` |
| Chase 1 | `"2026-09-17"` | `"2026-09-17"` |
| Chase 2 | `"2026-09-24"` | `"2026-09-24"` |
| **Final chase** | **`""` — the 30th is gone** | **`null` — the column is cleared** |
| Reply | `""` | `null` |

**C) A DATE WAS HAND-SET AND `nextTouched` IS TRUE** — same table again: Final chase clears to `""` and
writes `null`. Choosing a stage resets `nextTouched`, so a stale hand-set date does not survive a stage
change. (A date set *after* choosing the stage does survive — see §1.4.)

### 1.3 So what did you see? I could not reproduce it, and here is what I checked

I take the report seriously rather than filing it as user error, so I traced every path that can put a value
into that field. There are exactly five (`components/admin/OutreachPanel.tsx`, grep for `setNextAt(`):

| line | what sets it | can it produce today's date? |
|---|---|---|
| 1627 | the `[p.id]` reset — `p.next_action_at ?? ''` | only if the stored column is today |
| 1663 | `setNext(days)` behind Tomorrow / +3 days / +1 week | +1, +3, +7 — never +0 |
| 1678 | `fillNextFromKind` — the stage populate | proven above; Final chase gives `""` |
| 1688 | `persistFollowUpAfterLog` — on log | proven above; Final chase gives `null` |
| 1921 | you typing in the field | — |

And the stored column cannot be the source either: re-derived live, **4 of 231 prospects have a
`next_action_at` at all** (Azahar 2026-09-15, Tikka Tonic 2026-09-14, Pimp My Fish 2026-09-17, Pizza Mondo
2026-09-15) and **none of them is today (2026-09-10)**.

**The most likely explanation is one this codebase has already recorded once.**
`components/admin/OutreachPanel.tsx:1851` carries this comment, from the task that fixed the previous
"next action shows today" report:

> *🔴 LABELLED, AND THIS IS THE ACTUAL FIX FOR THE "next action shows today" REPORT. This input defaults to
> today BY DESIGN (a contact almost always happened today) and was the only UNLABELLED control in the
> modal — two bare date boxes, one showing today. `nextAt` never held today; this did.*

The **Contacted on** box defaults to today, always — it is showing `10/09/2026` in the screenshot you sent.
When Final chase empties the Follow-up box, the only date left on that side of the modal reading today is
that one. The second candidate is a stale bundle: the Final chase rung existed for a few minutes before your
message, and a page loaded before it would not have the interval map that goes with it.

**What would settle it in ten seconds:** hard-reload the page, pick Final chase, and look at the Follow-up
box specifically. Empty renders as `dd/mm/yyyy` in grey; a populated date renders in black. If it genuinely
shows a black `10/09/2026`, tell me and I will treat it as a live bug with a reproduction rather than a
question of which box.

### 1.4 One case where Final chase does **not** clear — by existing design, and you should know it

The order matters. **Choose the stage, then set a date by hand (or with a quick-set button), and logging
keeps your date** — `nextTouched` is true, so `persistFollowUpAfterLog` writes `nextAt` rather than the
stage's `null`. The reverse order clears, because choosing a stage resets `nextTouched` (case C above).

That is the operator-override rule agreed when the populate was built, and I have not touched it. But it does
mean "Final chase always clears" is true of the *stage*, not of the *field*. Say if you want the override
suppressed for Final chase specifically — it is one condition in one function.

### 1.5 `Reply` — what it does now, and what I think it should do

**Now:** identical to Final chase. `reply` is not in `FOLLOW_UP_DAYS`, so choosing it empties the field and
logging writes `null`. Proven in all three tables above.

**What I think it should do: not clear.** I am flagging this rather than changing it, as instructed.

The reasoning: clearing is right for Final chase because nothing follows it — the sequence is over and the
prospect should leave the work queue. A reply is the opposite situation. It ends the *outbound ladder*, but
it is the moment the prospect is most engaged and the moment you most need to do something (write back,
send a link, book a call). Clearing the date drops exactly those prospects out of the queue, and the
evidence that this matters is already in your data: Azahar replied, and the thread ended with your closing
message — that one worked because it happened in the same sitting, not because anything tracked it.

My recommendation is **+1 day**, not zero and not a long interval: a reply that came in today wants an
answer tomorrow at the latest, and a date of "today" would be indistinguishable from an unset field to your
eye and would go overdue by tomorrow morning.

⚠️ One consequence to weigh before you decide: `next_action_at` currently means *"chase them again"*. Giving
a reply a date makes it also mean *"answer them"*. Those are different jobs on the same column, and the
overdue flag cannot tell them apart. If that bothers you, the alternative is to leave `reply` clearing and
let the `replied` **stage** carry the signal instead — but nothing surfaces stage-based work today, so that
is a bigger change than one map entry.

---

## 2. Report only — the cap, and what surfacing the last rung would take

### 2.1 (a) The numbers, re-derived from live data

`content-range` asserted on both reads: **10 contact rows of 10**, **231 prospects of 231**.

Duplicates are discounted on the same rule the double-log guard uses — `contactSignature`, i.e.
`(calendar day | direction | kind | channel)`. **Exactly one row is discounted**: the Tikka Tonic pair
`8cccac3a` / `0dc56f47`, logged 0.755s apart on 2026-09-03.

| prospect | rows | outbound | **distinct touches** | distinct rungs reached | highest rung | inbound reply |
|---|---|---|---|---|---|---|
| Pimp My Fish | 2 | 2 | 2 | 2 | 2 | no |
| Azahar | 3 | 2 | 2 | 1 | 1 | **yes** |
| **Tikka Tonic** | 4 | 4 | **3** | 2 | 2 | no |
| Pizza Mondo | 1 | 1 | 1 | 1 | 1 | no |

**Answers:**

* **Prospects at three distinct outbound touches: 1** (Tikka Tonic).
* **Prospects at four: 0.**
* Prospects with any contact at all: **4 of 231**. With none: **227**.
* Rows storing `4_final_chase`: **0**. Rows storing `3_chase_2`: **0**. Nobody has reached rung 3 or 4 by
  any measure.

Two things worth seeing in that table before you decide about cadence:

* **Touches and rungs are not the same number.** Tikka Tonic has 3 distinct touches but only **2** distinct
  rungs — its two `follow_up` rows are the same rung logged twice, five days apart. Under a four-rung
  ladder it has used first contact and chase 1; under the old three-rung ladder it had also used two of
  three. Which number the cap counts changes the answer.
* **The rung measure barely works on today's data.** 8 of the 10 rows store values outside the vocabulary,
  so a rung-based cap has to map `first_contact`→1 and `follow_up`→2 to say anything at all (which is what
  the table above does). Until those rows are corrected, a **touch-count** measure is the only one that
  reads the data honestly.

### 2.2 (b) What surfacing "reached the last rung" in the modal would take

**No route change, no migration, no new query — the data is already in the browser.** Every prospect row
carries its full `contacts` array (the history table reads `p.contacts`), and `outboundCount` is already
computed server-side (`app/api/admin/outreach/route.ts:177`), returned (`:212`) and typed on the client
(`components/admin/OutreachPanel.tsx:80`). ⚠️ `outboundCount` is the **raw** count, so it says 4 for Tikka
Tonic where the true figure is 3 — it should not be the thing displayed.

**Where it should go: the modal's status strip** — `components/admin/OutreachPanel.tsx:869`, the
`Stage · Upcoming · Last contacted` band that sits directly above both the log form and the
`Compose from template…` button. That band is already the "what do I know before I act" line, it is read
before composing rather than after sending, and adding a fourth item needs no layout work.

The derivation is one line, reusing the function the double-log guard already ships:

```ts
const touches = new Set(p.contacts.filter(c => c.direction === 'outbound').map(contactSignature)).size
```

Cost: roughly 10–15 lines in one file — the derivation, a `Touches 3 / 4` badge that turns amber at the cap,
and a `title` explaining that duplicates are discounted. Nothing else is affected.

**The two definitions still disagree, and you have to pick one:**

1. **Touch count ≥ the cap.** Works today. Tikka Tonic shows at the cap under three rungs, one short under
   four. Immune to the legacy-value problem.
2. **A `4_final_chase` row exists.** Precise and self-explanatory, but returns **zero** for every prospect
   today, and will keep doing so until the ladder is actually used with the new vocabulary.

I would surface **(1)** and show the number rather than a flag — `Touches 3 / 4` tells you where you are;
a red dot only tells you to stop.

**And one caveat that matters more than the definition:** an inbound reply ends the sequence. Azahar has 2
outbound touches and a reply — it should never be shown as "1 touch remaining", because chasing someone who
already answered is worse than not chasing at all. Whatever measure you choose needs `contacts.some(c =>
c.direction === 'inbound')` as an override.

### 2.3 If you decide four rungs is not what you want

Reverting is cheap and costs no data: **no row anywhere stores `4_final_chase`** (0 of 10). Making Final
chase the *label* of `3_chase_2` again and deleting the fourth entry restores the three-touch ladder with
intervals +3 / +7 / clear, and the only open question would be whether `3_chase_2` keeps the +14 you just
approved or returns to being terminal. Nothing needs migrating either way.

---

## 3. What is proven how

**Executed against the shipped code** — the interval map and `followUpDateFor` for all five values; and the
component's own `fillNextFromKind` / `persistFollowUpAfterLog`, extracted from the compiled
`OutreachPanel.tsx` and run across three starting states (§1.2). These are executions, not readings.

**Re-derived from the live database** — 10 contact rows and 231 prospects, both count-asserted against
`content-range`; the per-prospect touch/rung table; the four stored `next_action_at` values and the fact
that none is today; 0 rows storing `3_chase_2` or `4_final_chase`; the single discounted duplicate.

**Structural (read, not executed)** — the five `setNextAt(` call sites and what each can produce; that the
status strip at `:869` renders above the compose button; that `outboundCount` is already carried to the
client.

**Reasoned only** — that `reply` should schedule +1 day rather than clear (§1.5), and the caveat about one
column carrying two meanings; the recommendation of the touch-count definition over the rung definition
(§2.2); the inbound-reply override; that the "today" you saw is most likely the Contacted-on box or a stale
bundle (§1.3) — that one is a hypothesis, and it is the only claim in this report I cannot test from here,
because it depends on what your browser was actually rendering.

**Compiler-confirmed** — nothing new to confirm: no source file was changed. `npx tsc --noEmit` was run
after the previous task and reported 0 errors; the tree is unchanged since.
