# Contact history becomes a real table — report

Scope as briefed: the prospect modal only. No schema change, no migration, no route change, no change to any
write path. Two files were edited: `components/admin/OutreachPanel.tsx` and `lib/outreach.ts`.

---

## 0. `git status` at the start of this task, verbatim

```
 M app/admin/page.tsx
 M app/api/admin/outreach/route.ts
 M components/admin/OutreachPanel.tsx
 M docs/manual-update-report.md
 M docs/reference-manual.md
 M docs/scraper-reference-manual.md
 M lib/outreach.ts
?? app/api/admin/discovery-events/
?? app/api/admin/outreach-templates/
?? components/admin/ComposeWindow.tsx
?? components/admin/ConfirmDeleteDialog.tsx
?? components/admin/DiscoveryEventsPanel.tsx
?? components/admin/EventRowCells.tsx
?? components/admin/InlineField.tsx
?? components/admin/ScheduleEventsPopup.tsx
?? components/admin/TemplatesPanel.tsx
?? docs/compose-single-pane-report.md
?? docs/compose-window-stacking-report.md
?? docs/discovery-events-delete-report.md
?? docs/discovery-events-table-report.md
?? docs/discovery-run-log-migration-report.md
?? docs/outreach-compose-send-report.md
?? docs/outreach-compose-window-report.md
?? docs/outreach-delete-guard-report.md
?? docs/outreach-filter-ux-report.md
?? docs/outreach-inline-edit-report.md
?? docs/outreach-media-build-report.md
?? docs/outreach-media-delete-report.md
?? docs/outreach-media-report.md
?? docs/outreach-modal-density-report.md
?? docs/outreach-modal-flow-report.md
?? docs/outreach-modal-layout-report.md
?? docs/outreach-schedule-popup-report.md
?? docs/outreach-sequence-report.md
?? docs/outreach-table-report.md
?? docs/outreach-templates-report.md
?? docs/outreach-templates-table-report.md
?? docs/templates-layout-tweaks-report.md
?? docs/templates-page-layout-report.md
?? docs/truck-name-matching-report.md
?? lib/outreach-filter.ts
?? lib/outreach-template-render.ts
?? lib/schedule-match.ts
?? supabase/migrations/20260909_outreach_templates.sql
?? supabase/migrations/20260910_outreach_contact_kinds.sql
```

At the end of the task the only change to that list is `?? .h/` appearing and being removed again (the
measurement harness, deleted — verified: `git status --porcelain | grep -c "\.h/"` → `0`), and this report.
No file outside `components/admin/OutreachPanel.tsx` and `lib/outreach.ts` was written to.

---

## 1. How the measurements were taken — and why they are measurements of the shipped code

The earlier passes measured a hand-written HTML replica of the JSX. That is a weak proof: a replica can drift
from the component it stands for, silently. This pass does not do that.

The harness compiled the **shipped `components/admin/OutreachPanel.tsx`** with the repo's own TypeScript
(`ts.transpileModule`), appended one line to the **compiled** output to expose the module-local component
(`module.exports.__HistoryTable = HistoryTable`), ran it in a `vm` with the **real** `lib/outreach.ts` module
supplying the labels, and rendered it with React 19.

* **Static geometry** — `renderToStaticMarkup` produced the table HTML, which was spliced into the modal shell
  with the container `className` string extracted verbatim from the source file, and measured in headless
  Chrome at 1440×900 against the real compiled Tailwind stylesheet.
* **Behaviour** — React 19's CJS builds (`react`, `react-dom`, `react-dom-client`, `scheduler`) were loaded
  into the page through a small module registry, the real component was mounted with `createRoot`, and the
  clicks and key presses below are real DOM events on the real component.
* **Rows** — every row is a real `outreach_contacts` row, re-fetched at the time of measurement:
  `content-range 0-9/10`, **10 rows fetched, 10 counted** (the length was asserted against the header, per the
  standing rule). Distribution: `d358be00` 4 rows, `cc7c9595` 3 rows (one of them inbound), `000d4a6d` 2,
  `dbbafe8e` 1. Nothing was invented except the explicitly-labelled 20-row pressure page in §3.4.

---

## 2. What was built

### 2.1 One row per contact, with a header row

Five columns, declared once in `HISTORY_COLS` and mapped over by both the `<colgroup>` and the `<thead>`, so
the widths and the headings cannot drift apart:

| Column | Width | Source |
|---|---|---|
| Date | 76px | `fmtDate(c.contacted_at)` |
| Direction | 78px | `directionLabel(c.direction)` |
| Stage | 132px | `kindLabel(c.kind)` |
| Channel | auto (153.4px measured) | `channelLabel(c.channel)` |
| *(View)* | 46px | the row's own affordance |

**The body preview is gone from the row entirely.** Measured row height is **25px** on every row of every
page — one 20px line plus 2×`py-1`. `rowLines` (row height ÷ line-height) is **1.25** on all 20 rows of the
pressure page: there is no second line anywhere.

### 2.2 The full message: a popout, not an in-place expansion

The brief said "clicking a row expands the full body beneath it in place… one row expanded at a time is
fine", then amended it to "include a view option, can be a popout if better". **I took the popout, and this is
the reversal being recorded rather than made silently.** The reason is measured, not aesthetic: the left
column is **491.4px** wide and it is the modal's only shrinking child. An email body rendered inside a row is
977 characters for the live `cc7c9595` row — at that width it wraps to roughly forty lines, which pushes every
later row out of the viewport and turns the four-column table straight back into the wall of prose the table
was built to replace. The popout gets a `max-w-2xl` window and leaves the table's geometry untouched.

Both affordances exist and open the same thing: the **whole row** is clickable (and keyboard-reachable —
`tabIndex={0}`, `role="button"`, Enter/Space), and the last column carries a visible **View** link so the
affordance is not invisible. "One at a time" is preserved trivially: `viewing` is a single `Contact | null`.

The popout is portalled to `<body>` at an **inline** `zIndex: 90` — above the compose window's 85 — for the
reason recorded in `docs/compose-window-stacking-report.md`: an arbitrary Tailwind z-index used by exactly one
file can resolve to `z-index: auto` because no rule was ever generated. An inline style cannot go missing.

### 2.3 The other four amendments made mid-task

* **`1 - First contact`, not `1 · first contact`.** Bullet → dash, and capitalised. `KIND_LABELS` in
  `lib/outreach.ts` now reads `1 - First contact` / `2 - Chase 1` / `3 - Chase 2`, and the legacy values
  `1 - First contact (legacy)` / `2 - Chase 1 (legacy)` / `Chase (legacy)` / `Reply (legacy)`. The same map
  feeds the Kind dropdown in the log form and the Stage column, so they cannot disagree.
* **Direction is the word, not the arrow.** `→`/`←` needed a legend nobody has; `Outbound`/`Inbound` does not,
  and the column now has a heading, which is part of what makes it read as a table. Inbound rows stay
  visually distinct by the inline `#ecfdf5` tint plus emerald text; the tint is inline for the same
  reason as the z-index.
* **Oldest at the top.** Reversed, and reversed **at the point of display**, not upstream:
  `/api/admin/outreach` returns contacts newest-first and `lastContactedAt` is read off `contacts[0]`
  (`app/api/admin/outreach/route.ts:178`), so reversing the fetch would have silently changed the table's
  "Last contacted" column. `HistoryTable` sorts a copy ascending in a `useMemo`; `Array.prototype.sort` is
  stable, so same-day rows keep the server's order instead of shuffling.
* **The box is no longer grey.** The container was `border-slate-100 rounded-lg p-1 bg-slate-50` — a grey card
  with a 4px inset, which read as a boxed note. It is now `border-slate-300 rounded-lg bg-white` with no
  inset: paper-white, a ruled header band (`#f8fafc`, `border-b border-slate-300`), and `border-b
  border-slate-100` between rows. The header is **sticky** — proven in §3.4 — because the container is the
  thing that scrolls, and a header that scrolls away makes a long history unreadable again. `position:
  sticky` and its opaque background are inline for the same reason as the z-index: a header that failed to
  paint its band would let rows smear through it.

Two labels also gained a single source of truth in `lib/outreach.ts`, next to `kindLabel`:
`channelLabel` (`email → Email`, `whatsapp → WhatsApp`, `in_person → In person`) and `directionLabel`. History
had been rendering raw storage values. Both are lookups with a fallback, so an unknown value renders as
itself rather than blank.

### 2.4 History moved to the left column, above Notes — a recorded reversal

`docs/outreach-modal-flow-report.md` put history above **Log a contact** in the right column, deliberately, so
that what was last sent could be read before writing the next message. **That decision is now reversed.** The
reasoning it rested on was a prose preview — something you read. A five-column table is glanced at, and the
message body is one click away in the popout rather than on the page. Reading the last message before writing
the next one is now a deliberate act (click the row) instead of an ambient one.

The left column had to be reflowed for it: it was `self-start max-h-full overflow-y-auto`, sized to its
content with a scrollbar as a safety valve. It is now `flex flex-col gap-3 min-h-0 pr-1` with every sibling
marked `flex-shrink-0`, so all shrinkage lands on history — exactly the arrangement the right column had.
**The modal now has exactly one scroller**, confirmed in §3.4.

### 2.5 The split is 45/55

`style={{ gridTemplateColumns: '45fr 55fr' }}` — `fr`, not `%`, because percentages resolve against the
content box and overflow by the gap. Measured in §3.1.

---

## 3. The measurements

### 3.1 Pane widths at 1440px

| Page | Left | Right | Ratio |
|---|---|---|---|
| Before (38/62) | 415.0px | 677.0px | 38.0 / 62.0 |
| After, 3 real rows | **491.4px** | **600.6px** | **45.0 / 55.0** |
| After, 4 real rows | 491.4px | 600.6px | 45.0 / 55.0 |
| After, 20 rows | 491.4px | 600.6px | 45.0 / 55.0 |
| After, empty history | 491.4px | 600.6px | 45.0 / 55.0 |

The left column gained **76.4px**. The ratio does not move with row count, which is the point of `fr`.

### 3.2 Column x-positions across every row

The check the brief asked for. `left` of every cell, read from `getBoundingClientRect()`:

**`cc7c9595` — 3 real rows (one inbound):**

| | Date | Direction | Stage | Channel | View |
|---|---|---|---|---|---|
| header | 165 | 241 | 319 | 451 | 604.4 |
| row 1 | 165 | 241 | 319 | 451 | 604.4 |
| row 2 | 165 | 241 | 319 | 451 | 604.4 |
| row 3 *(inbound)* | 165 | 241 | 319 | 451 | 604.4 |

**`d358be00` — 4 real rows:** identical — every row `[165, 241, 319, 451, 604.4]`.

**20-row pressure page:** all 20 rows `[165, 241, 319, 451, 604.4]`.

Reduced to the assertion: for each of the five columns, the set of distinct x-values across all rows has size
**1** (`allColumnsFixed: true` on every page), and each header cell sits within 0.5px of its column's cells
(`headerMatchesRows: true`). Column widths are `[76, 78, 132, 153.4, 46]` on every row. The inbound row, the
`WhatsApp` rows and the long `1 - First contact (legacy)` label all sit on the same grid — the tint and the
longer strings move nothing, because `table-fixed` + `<colgroup>` decide the geometry, not the content.

### 3.3 What the rows actually say

Rendered text, straight out of the live rows (`d358be00`, oldest first — note the dates ascend):

```
3 Sept 2026 | Outbound | 1 - First contact (legacy) | Email    | View
3 Sept 2026 | Outbound | 1 - First contact (legacy) | Email    | View
3 Sept 2026 | Outbound | 2 - Chase 1 (legacy)       | WhatsApp | View
8 Sept 2026 | Outbound | 2 - Chase 1 (legacy)       | WhatsApp | View
```

### 3.4 What scrolls

| Page | Elements where `scrollHeight − clientHeight > 1` | Log button inside the modal shell |
|---|---|---|
| 3 real rows | *(none)* | yes |
| 4 real rows | *(none)* | yes |
| 20 rows (synthetic) | **`history` only** — 52px of overflow | yes |
| empty history | *(none)* | yes |

`body`, the modal shell, the left column and the right column were all checked explicitly on every page and
none of them scrolls. **The history container is the only scroller in the modal**, which was the goal of the
left-column reflow.

**Sticky header, proven:** on the 20-row page the header's top sits **1px** below the container's top; the
container was then scrolled to its bottom (`scrollTop` 52) and the header's top was re-read — still **1px**.
It does not move.

### 3.5 Empty history

`No contacts yet.` — one line, height 22px for the whole container, `1.25` line-heights of text, and the
check `hist.innerHTML.includes('<table')` returns **false**: no header, no colgroup, no table furniture at
all. The empty state still collapses to a single line.

### 3.6 The popout, exercised

Real clicks and key presses on the real mounted component:

| Action | Result |
|---|---|
| before any click | no `[role="dialog"]` in the document |
| click row 1 | dialog opens, **portalled outside `#root`**, header reads `9 Sept 2026 / Outbound / 1 - First contact (legacy) / Email`, body is the live 977-character message |
| press Escape | dialog gone |
| click the **View** cell of the inbound row | dialog opens, header reads `Inbound`, and the body **matches the database row** for that contact (`includes(message.slice(0,40))` → `true`) |
| click the backdrop | dialog gone |
| a row whose `message` is empty (`d358be00` has two) | dialog opens and reads *"No message was recorded with this contact."* — no blank window |
| Escape with a **bubble-phase** `window` keydown listener registered (what the prospect modal uses) | popout closed, and the listener **never fired** (`leaked: false`) |

That last row is the one that matters: Escape closes the popout and does **not** close the prospect modal
behind it. Capture phase + `stopPropagation` beats a bubble-phase window listener regardless of registration
order — the same rule `ScheduleEventsPopup` relies on.

---

## 4. Item (4): does the follow-up date actually auto-populate?

**It did not, on one of the two paths. That was a real bug and it is fixed.**

### 4.1 What was wrong

The populate lived inside `submitLog` — the handler behind the **Log contact** button. The compose window has
its own `onLog` handler and does **not** call `submitLog`, so logging a contact from the compose window wrote
the contact row and left `next_action_at` exactly as it was. The date you saw could only ever have come from
the button you pressed.

The fix is a single shared function that both paths call — there is now exactly one place where the follow-up
date is persisted on log:

```
components/admin/OutreachPanel.tsx:1645   const persistFollowUpAfterLog = (k: string) => { … }
components/admin/OutreachPanel.tsx:1676     ← submitLog (the Log contact button)
components/admin/OutreachPanel.tsx:1786     ← the compose window's onLog
```

### 4.2 Your clarification — "it should auto-populate when kind is chosen"

Built. The Kind `<select>`'s `onChange` calls `fillNextFromKind`
(`components/admin/OutreachPanel.tsx:1821`), which fills the visible field the moment you pick a stage.
**It never writes** — the standing rule that nothing is written to `next_action_at` on open is untouched;
the field is filled locally and the value is persisted only when you actually log.

A `nextTouched` flag guards it. Any hand edit of the date input, the Clear button, or a `+N` button sets it
(`:1854`, `:1859`, `:1622`), and once set, logging keeps **your** date rather than overwriting it. Clearing
the field deliberately and then logging writes `null`, not a recomputed date.

### 4.3 The proof from a clean state

Contact date 10 Sep 2026, no date stored, no button pressed, `followUpDateFor` executed from the compiled
`lib/outreach.ts`:

| Stage chosen | Date produced |
|---|---|
| `1 - First contact` (+3) | `"2026-09-13"` |
| `2 - Chase 1` (+7) | `"2026-09-17"` |
| `3 - Chase 2` (terminal) | `null` — the field clears; the ladder ends |

Touched-guard cases: a hand-set 17th survives a `+3` log; a deliberately cleared field logs `null`; an
untouched stale value is replaced by the computed one.

**And the thing that made the two outcomes indistinguishable:** `2 - Chase 1` from a 10 Sep contact is
**2026-09-17** — the exact date you saw. You said you set it by hand, and you were right; the computation
happens to agree, which is why the screen could not tell you which had happened.

---

## 5. Not built, as instructed: a terminal value

No fourth `kind` was added. Three touches remains the cap.

What a terminal **stage on the prospect** would take — "the sequence ended with no reply", which is a fact
about the truck, not about any one message:

* **No migration.** `outreach_prospects.stage` is plain `text` with no CHECK and no enum, the same finding
  that let the `kind` vocabulary change without one. Re-derived live: 231 prospects,
  `not_contacted` 227 / `contacted` 3 / `not_interested` 1.
* **Two lines of code, structurally.** `OUTREACH_STAGES` in `lib/outreach.ts:11` is the single source: the
  stage dropdown in the modal (`:850`), the stage filter's options (`:269`) and `isStage` — the API's
  validator (`app/api/admin/outreach/route.ts:340`) — all map over that one array. Adding
  `'no_reply'` to the array and one entry to `STATUS_LABEL` (`components/admin/OutreachPanel.tsx:163`) is the
  whole mechanical change. The table's Stage column already renders through `stageLabel`.
* **Two decisions that are not mechanical**, and are the real reason this is a separate task:
  1. **Does it clear `next_action_at`?** It should — `isOverdue` flags any past date regardless of stage, so a
     truck marked "no reply" with a stale follow-up date would sit in the overdue queue forever. That means
     the stage change needs a write to a second column, which no other stage change does today.
  2. **Is it distinct from `not_interested` ("no sale")?** They differ in evidence: `not_interested` is a
     stated refusal, `no_reply` is silence after three touches. Worth keeping apart — silence is worth
     retrying next season, a refusal is not — but that is a judgement about how you work, not about the code.
* **What it is not:** it must not be inferred automatically from "3 touches logged and no inbound row". That
  is the counting rule the sequence work already rejected. It should be a value you set, like every other
  stage.

---

## 6. What is proven how

* **Compiler-confirmed:** `npx tsc --noEmit` → **0 errors** after every edit, including the removal of the now
  unused `Fragment` import and the addition of `createPortal` and `type CSSProperties`.
* **Measured in a real browser, against the shipped component:** all pane widths, all column x-positions and
  widths, row heights and line counts, which elements scroll, the sticky header's fixed offset, the empty
  state's single line, and every popout interaction in §3.6.
* **Re-derived from the live database:** 10 contact rows (asserted against `content-range`), their kinds,
  directions, channels and message lengths; 231 prospects and their stage distribution.
* **Structural (read from the code, not executed):** that both log paths call `persistFollowUpAfterLog`, and
  that `OUTREACH_STAGES` has exactly the three consumers listed in §5.
* **Executed against the shipped module:** the three `followUpDateFor` results in §4.3.
* **Reasoned only:** that a 977-character body would wrap to about forty lines in a 491px column — the
  proportion is arithmetic, but I did not render it to count the lines. It is the justification for the
  popout, not a claim the popout depends on.

## 7. Limits worth knowing

* The 20-row page is **synthetic** — the four real `d358be00` rows repeated five times with unique ids and
  spread dates. No live prospect has 20 contacts. It exists only to force the container past its height so
  scrolling and the sticky header could be tested; it proves nothing about the data.
* Same-day rows keep the server's order among themselves. `outreach_contacts.contacted_at` is a date, not a
  timestamp, so three contacts on one day have no true order to restore — `created_at` exists on the table but
  is not carried into the client's `Contact` type, and adding it would be a route change, which was out of
  scope.
* The `.h/` harness has been deleted. Everything in §3 is reproducible from the description in §1, but the
  scripts themselves are not in the tree.
