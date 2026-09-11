# `kind` vocabulary, inbound replies, and the double-log guard — report

Scope: the prospect modal and the contact-kind vocabulary. **Two files changed**:
`lib/outreach.ts` and `components/admin/OutreachPanel.tsx`. **No route change was needed at all** — the
route validates through `isKind`, which it imports, so widening the vocabulary reached it without the file
being touched. Nothing was installed; `package.json` and the lockfile are untouched.

Nothing in the prompt arrived garbled. One instruction was *unstated* rather than contradictory — whether
`reply` may be selected on an **outbound** row. I did not stop for it; §2.2 records the choice I made, the
evidence for it, and the one line that reverses it.

---

## 0. `git status` before any edit, verbatim

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

`git add -A` / `git add .` were not run. Nothing was staged, committed or applied to the database.

---

## 1. Labels lose the number; the order does not live in the labels

| Stored value — **unchanged** | Label before | Label now |
|---|---|---|
| `1_first_contact` | `1 - First contact` | **First contact** |
| `2_chase_1` | `2 - Chase 1` | **Chase 1** |
| `3_chase_2` | `3 - Chase 2` | **Chase 2** |
| `reply` | `Reply (legacy)` | **Reply** — now a real value, see §2 |
| `first_contact` *(legacy)* | `1 - First contact (legacy)` | First contact (legacy) |
| `follow_up` *(legacy)* | `2 - Chase 1 (legacy)` | Chase 1 (legacy) |
| `chase` *(legacy)* | `Chase (legacy)` | Chase (legacy) |

### Where the order lives

**`KIND_ORDER` in `lib/outreach.ts:70`, derived from the array position of `CONTACT_KINDS`** — not retyped
next to it, so the two cannot drift:

```ts
export const KIND_ORDER: Record<string, number> = {
  ...Object.fromEntries(CONTACT_KINDS.map((k, i) => [k, i + 1])),   // 1_first_contact:1, 2_chase_1:2, 3_chase_2:3
  [REPLY_KIND]: 90,                                                 // outside the sequence, always last
  first_contact: 1, follow_up: 2, chase: 2,                         // legacy values sort onto the rung they mean
}
export const kindOrder = (v) => (v ? KIND_ORDER[v] ?? 99 : 99)      // unknown sorts LAST, never silently first
```

The picker sorts by it explicitly (`components/admin/OutreachPanel.tsx:1894`), so nothing relies on the map's
key order or on how the JSX happens to be written. **This is not decoration — alphabetical order is now
actively wrong**, and executing the shipped module proves it:

```
sorted by kindOrder  (what the picker renders)   ["First contact","Chase 1","Chase 2","Reply"]
sorted ALPHABETICALLY (what it must NOT be)      ["Chase 1","Chase 2","First contact","Reply"]
kindOrder of each      {"1_first_contact":1,"2_chase_1":2,"3_chase_2":3,"reply":90}
kindOrder of an unknown value    99
```

### Confirmation that no stored value moved

Every row of `outreach_contacts` was captured **before** the label change and re-fetched **after**, and the
two were diffed on every field:

```
range 0-9/10 fetched 10          ← length asserted against the count header, both times
── diff of stored values, before the label change vs after ──
IDENTICAL — no stored value moved (10 rows, every field compared)
```

Also confirmed by execution: `CONTACT_KINDS` is still `["1_first_contact","2_chase_1","3_chase_2"]`, and
`isKind("first_contact")` is still **false** — the legacy strings remain readable in history and remain
un-writable, exactly as before. And the follow-up intervals are untouched: `followUpDateFor` from a 10 Sep
contact still yields `["2026-09-13","2026-09-17",null]`.

---

## 2. `reply` — a kind outside the ladder

### 2.1 What the live data says

All three Azahar rows are dated 9 Sep 2026:

| id | direction | stored `kind` | what it actually is |
|---|---|---|---|
| `3cd8425e-93ad-4bf2-9f31-34ef4faa0901` | outbound | `first_contact` | my approach — correct |
| `076f3cb2-af88-4d27-ad06-e381619cd1c0` | **inbound** | `first_contact` | **them replying**, wearing the label of my approach |
| `46c6c4eb-3628-4843-b35a-af30e5fdd931` | outbound | `reply` | **my response**, wearing a label that was never a rung |

The ladder counts *my* attempts. An inbound row is not an attempt, so no rung can describe it.

### 2.2 What was built

`lib/outreach.ts:52-63`:

```ts
export const CONTACT_KINDS      = ['1_first_contact', '2_chase_1', '3_chase_2'] as const  // the OUTBOUND ladder
export const REPLY_KIND         = 'reply' as const
export const CONTACT_KINDS_ALL  = [...CONTACT_KINDS, REPLY_KIND] as const                 // what the API validates
export const kindsForDirection  = (d) => d === 'inbound' ? [REPLY_KIND] : CONTACT_KINDS
export const defaultKindFor     = (d) => d === 'inbound' ? REPLY_KIND  : CONTACT_KINDS[0]
```

Executed against the shipped module:

```
isKind("reply")                          true       ← the API validator now accepts it
isKind of each ladder rung               [true,true,true]
kindsForDirection("inbound")             ["reply"]
kindsForDirection("outbound")            ["1_first_contact","2_chase_1","3_chase_2"]
defaultKindFor inbound / outbound        ["reply","1_first_contact"]
followUpDateFor("reply", 2026-09-10)     null       ← a reply ends the sequence; no date is proposed
```

**The stored string is `reply` — the same string the legacy row already holds.** Minting `inbound_reply`
would have meant a migration to move that row; adopting `reply` means no migration can move it wrongly.

In the modal, changing **Direction** changes **Kind** (`:1881`): inbound selects Reply and clears the
follow-up date; switching back to outbound restores the first rung rather than leaving Reply on an outbound
row. The Kind picker offers only `kindsForDirection(direction)` (`:1894`), so **the UI cannot put a numbered
rung on an inbound row at all**.

**The judgement call, stated plainly.** You said the three numbered stages stay outbound-only and that Kind
should default to Reply when inbound; you did not say whether Reply may be *chosen* on an outbound row. I
made it **inbound-only**, because you listed `outbound/reply` among the rows to correct — if it were valid
under the new vocabulary there would be nothing to correct. The consequence is real and you should decide
it: **"my response to their reply" now has no label**, which is the question you will hit when you
hand-correct row `46c6c4eb`. To allow it instead, one line in `lib/outreach.ts:59` becomes
`direction === 'inbound' ? [REPLY_KIND] : CONTACT_KINDS_ALL`. Nothing else changes.

### 2.3 The history table shows an inbound row as a reply

Rendered from the **shipped** `HistoryTable` (compiled from the real `.tsx`, real `lib/outreach`), over the
three real Azahar rows plus one synthetic already-corrected row:

| row | Direction cell | Stage cell | inbound accent | marker |
|---|---|---|---|---|
| outbound / `first_contact` | Outbound | First contact (legacy) | no | no |
| **inbound / `first_contact`** | **Inbound** | **Reply ⚠** | **yes** | **yes** |
| **outbound / `reply`** | Outbound | **Reply ⚠** | no | **yes** |
| inbound / `reply` *(corrected)* | Inbound | Reply | yes | no |

* An inbound row renders **Reply** whatever it stores, because that is the only thing an inbound row can
  mean. It keeps the emerald tint and gains a **3px emerald accent** down its left edge (an inset
  box-shadow, not a border — `border-collapse` drops a border set on one cell).
* **⚠ marks a direction/kind contradiction in both directions** (`:1553`): an inbound row that is not a
  reply, and an outbound row claiming to be one. Its `title` names the stored value. Legacy ladder names on
  outbound rows are deliberately **not** flagged — flagging 7 of the 10 live rows would make the marker mean
  nothing. This is how the rows still needing a hand fix are found on screen.
* **The mid-task styling note is done and proven**: the Stage cell was a shade heavier than the rest of the
  row (`text-slate-700` / `text-emerald-900`). It now carries exactly the Direction cell's weight and colour
  — the render above shows `font-semibold … text-slate-500` and `font-semibold … text-emerald-700` on both.

### 2.4 Migration: **none is needed**

No schema change is required, and none was written.

* `supabase/migrations/20260903_outreach_tracking.sql:60` declares `kind text,` — **plain text, no CHECK, no
  enum**. Re-verified by grepping every migration in the repo for `check (` / `create type` / `enum`: the
  matches are all in unrelated tables (`slot_bookings`, `plans`, `kds_*`, `allergen_*`, `van_devices`…) and
  **none is on any `outreach_*` table**. The code already records why: *"the migration carries no CHECK, so
  THESE are the enforcement"* (`lib/outreach.ts:107`).
* Therefore adding `reply` to the vocabulary is a code change only. Since no migration was written, there is
  **nothing to run and no `notify pgrst, 'reload schema';` needed for this change**.

⚠️ **One interaction you should know about before you correct anything by hand.** The already-written,
**still-unapplied** `supabase/migrations/20260910_outreach_contact_kinds.sql` contains
`update … set kind = '1_first_contact' where kind = 'first_contact'` — with no direction filter. Applied
*before* you fix the inbound Azahar row, it would move that row onto a rung and re-mislabel it. **Correct the
rows by hand first; then the migration cannot match them.** (When you do apply that file, it ends with
`notify pgrst, 'reload schema';` — run it, or PostgREST serves a stale schema cache and returns `PGRST205`.)

### 2.5 The rows to correct by hand — I have not touched them

Re-derived live, `content-range 0-9/10`, 10 of 10 fetched:

**Azahar — the three 9 Sep rows**

| id | direction | stored `kind` | should be |
|---|---|---|---|
| `3cd8425e-93ad-4bf2-9f31-34ef4faa0901` | outbound | `first_contact` | `1_first_contact` — correct rung, legacy name |
| `076f3cb2-af88-4d27-ad06-e381619cd1c0` | inbound | `first_contact` | **`reply`** |
| `46c6c4eb-3628-4843-b35a-af30e5fdd931` | outbound | `reply` | **your call — see §2.2** |

**Tikka Tonic — the two legacy `follow_up` rows**

| id | contacted_at | channel | stored `kind` | note |
|---|---|---|---|---|
| `f1213d14-0b15-4d93-ab1b-e4cc2a1bbfbd` | 2026-09-03T22:45:21.698273+00 | whatsapp | `follow_up` | → `2_chase_1` |
| `b097cd09-04d4-4ae9-ab49-042744602b15` | 2026-09-08T16:51:47.746522+00 | whatsapp | `follow_up` | → **`3_chase_2`**, not `2_chase_1` |

The second one is worth a second look: **both rows are the same stage**, five days apart. The ladder does not
allow a rung to be climbed twice, so mapping both to `2_chase_1` (which the pending migration would do) keeps
the contradiction — the later one is really the second chase.

**And the double-log pair (§3)** — `8cccac3a-394b-4191-bd32-c362424dcf21` and
`0dc56f47-e1ed-4581-9461-8ca0906e5c25`, 2026-09-03, outbound/`first_contact`/email, created **0.755s apart**
(22:17:47.610099 and 22:17:48.365027). One of the two should be deleted; nothing in the data says which.

---

## 3. The double-log guard

### 3.1 Where it lives, and why there

**In the writer — `logContact` (`components/admin/OutreachPanel.tsx:604`) — not in the form.** There are two
logging paths (the Log button and the compose window) and exactly one writer. A guard in either form would
have to be written twice and could be true in one and false in the other: that is the identical shape to the
follow-up-date bug fixed last task, where the populate lived in `submitLog` and the compose window never
called it.

### 3.2 The window, and why it is the window

**Two contacts are the same touch when they share `(calendar day, direction, kind, channel)`** —
`contactSignature`, `lib/outreach.ts:170`.

The day is not a round number chosen for comfort. `contacted_at` is `timestamptz`, but the modal sends a
**date** (`YYYY-MM-DD`), which Postgres stamps at midnight — the live row `1aa26b89` was created at 13:53 and
stored `2026-09-10T00:00:00+00:00`. So two same-day logs of the same stage on the same channel are identical
in **every stored field except `id` and `created_at`**. There is nothing in the data that distinguishes them,
and a narrower window (30 seconds, five minutes) would decide by wall-clock luck which indistinguishable row
survives. A legitimate second contact on the same day differs by **kind** or by **channel** — and both still
log (§3.4).

A second, session-local backstop (`writtenRef`, `:592`) remembers signatures this session has successfully
written, because `logContact` awaits `load()` before returning and a failed or slow refetch would otherwise
leave the guard reading stale rows. **Undo drops the signature again** (`:633`), so an undone contact can be
re-logged immediately — a guard that outlived the row it guards would be a new bug.

### 3.3 What the UI does when it refuses

* **Before the click.** The same pure function runs over the loaded rows (`:1719`). When it matches, an amber
  panel appears above the button — *"Already logged on 3 Sept 2026: **First contact** by **Email**. Change the
  stage, the channel or the date to log a different contact."* — and the button is **disabled** and reads
  **"Already logged"**. It is not a toast that scrolls away; it stays until the stage, channel, direction or
  date changes, because those are the four things that would make this a different contact.
* **At the click.** The writer refuses independently: no `fetch` is issued, a toast says *"Not logged — First
  contact by Email is already recorded for that date"*, and it returns `false`.
* **Nothing else moves on a refusal.** The message box is not cleared and the follow-up date is not touched —
  showing the shape of a successful log after a refusal is how you end up believing you sent something.
* **The compose window respects it too**, without being modified: its `onLog` already does
  `const ok = await onLog(…); if (ok) setLogged(true)`, and the wrapper now returns the writer's `false`
  (`:1844`), so the window does not mark a send that was never recorded.

### 3.4 Proof that it refuses the duplicate **and still logs real work**

Executed against Tikka Tonic's four **real** rows:

```
their signatures   ["2026-09-03|outbound|first_contact|email",
                    "2026-09-03|outbound|first_contact|email",   ← the double-click, same signature
                    "2026-09-03|outbound|follow_up|whatsapp",
                    "2026-09-08|outbound|follow_up|whatsapp"]
distinct signatures among the four rows: 3

  REFUSED  the exact double-click that happened            (duplicates 8cccac3a)
  REFUSED  same day, SAME kind, SAME channel               (duplicates f1213d14)
  LOGS     same day, DIFFERENT kind, same channel
  LOGS     same day, same kind, DIFFERENT channel
  LOGS     same day, same kind+channel, INBOUND
  LOGS     DIFFERENT day, same kind and channel
  LOGS     a brand-new stage on a busy day
  LOGS     the reply they might send that day
```

Two of the eight candidates are refused and six log. A guard that always refused would show eight REFUSED;
this one does not.

Across every prospect: **each of the 10 real rows, re-offered as a candidate against its own prospect's rows,
is refused — 10/10** (Pimp My Fish `[true,true]`, Azahar `[true,true,true]`, Tikka Tonic
`[true,true,true,true]`, Pizza Mondo `[true]`), while a legitimate next touch (10 Sep, Chase 2, email) **logs
for all four prospects**.

---

## 4. Report only — surfacing the three-touch cap (nothing built)

### 4.1 The count you are over is not the count you think

Re-derived live:

| prospect | rows | outbound rows | **distinct touches** |
|---|---|---|---|
| Pimp My Fish | 2 | 2 | 2 |
| Azahar | 3 | 2 | 2 |
| **Tikka Tonic** | **4** | **4** | **3 ← at the cap, not over it** |
| Pizza Mondo | 1 | 1 | 1 |

Tikka Tonic's fourth touch is the double-click. De-duplicated by the §3 signature it is **exactly at the
cap** — which matters, because a badge built on the raw count would have told you Tikka Tonic was over the
cap when it is not, and the first thing you would have done is stop contacting a truck that still has one
chase left.

### 4.2 What it would take

**No migration, no route change, no new query.** The data is already on every table row:

* `outboundCount` is already computed server-side (`app/api/admin/outreach/route.ts:177`), already returned
  (`:212`) and already typed on the client (`components/admin/OutreachPanel.tsx:80`). **But it is the raw
  count** — 4 for Tikka Tonic — so it should not be the thing displayed.
* Every prospect row also already carries its full `contacts` array (the modal's history table reads
  `p.contacts`), so the distinct count is a one-line client derivation using the function §3 already ships:
  `new Set(p.contacts.filter(c => c.direction === 'outbound').map(contactSignature)).size`.

Two candidate definitions of "at the cap", and they disagree on the live data:

1. **Distinct outbound touches ≥ 3.** Tikka Tonic qualifies. Counts anything outbound, including a touch
   logged on a rung that was already used.
2. **The last rung has been logged** (`3_chase_2` present). Nobody qualifies today — Tikka Tonic's two
   `follow_up` rows both map to chase 1 until you correct `b097cd09` (§2.5).

I would surface **(1)**, and show the number rather than a boolean — "3 of 3 touches" says more than a red
dot, and it degrades honestly when the vocabulary is only half corrected.

Where, in rough order of cost:

* **Modal, next to the truck name** — one derived number and a badge; ~10 lines, no other file involved.
  This is where "before I send" actually happens, since the compose window opens from here.
* **Table** — the Stage column already renders through `stageLabel`; a `3/3` suffix or a small pill in that
  cell needs no new column and no width change. A new column would, and the table's widths were measured and
  settled last task.
* **Filter** — one entry in `EMPTY_OUTREACH_FILTER` and one clause in `matchesOutreachFilter`
  (`lib/outreach-filter.ts`), which is the documented shape for adding a filter. This is the one that turns
  it from a warning into a worklist ("show me everyone at the cap"), and it is the only one of the three that
  touches a file outside the modal.

One caveat worth deciding before it is built: an **inbound reply ends the sequence**, so a prospect who
replied after two touches is not "1 touch remaining" — they are finished. A cap badge that ignores inbound
rows would nag you to chase people who already answered.

---

## 5. What is proven how

**Compiler-confirmed** — `npx tsc --noEmit` → **0 errors**, after every edit.

**Executed against the shipped code** (the real `lib/outreach.ts` and the real `HistoryTable`, compiled from
source with the repo's own TypeScript and run, not re-implemented):
every label; the `kindOrder` sequence and the alphabetical order it beats; `isKind`, `kindsForDirection`,
`defaultKindFor`, `followUpDateFor` including `reply → null`; every duplicate-guard case in §3.4; the four
rendered history rows in §2.3 with their emitted classes, accent and ⚠ marker.

**Re-derived from the live database** — all 10 `outreach_contacts` rows with ids, timestamps, directions,
kinds and channels (`content-range 0-9/10`, length asserted both times); the 4 prospects they belong to; the
before/after stored-value diff; every count in §4.1.

**Structural (read from the code, not executed)** — that the route reaches the new vocabulary through its
existing `isKind` import; that the compose window's `onLog` consumes the boolean it is now given
(`const ok = await onLog(…); if (ok) setLogged(true)`, `ComposeWindow.tsx:252`); that the Direction→Kind
coupling and the disabled-button wiring are attached to the handlers described (the handlers are inline JSX
and were not executed — the pure functions they call were).

**Reasoned only** — that `reply` should be inbound-only (§2.2); that distinct touches rather than the raw
count is the right cap measure (§4.1); the recommendation of definition (1) and the badge placements in §4.2.

**Not run** — `npm run build`. And `npx eslint` reports 13 errors on `OutreachPanel.tsx`
(lines 327, 385, 396, 403, 505, 544, 565, 1101, 1111, 1375, 1469, 1632, 1633, 1680) — all pre-existing
`set-state-in-effect` / `no-explicit-any` patterns; **none is on a line this task added**. The pair at
1633/1680 (`setNextTouched` used in the reset effect above its own declaration) came from the previous task
and is a hoisting complaint, not a runtime fault; fixing it means moving a `useState` line inside the
auto-populate block, which this task was told not to touch.
