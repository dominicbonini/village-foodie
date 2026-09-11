# The contact sequence, the auto-populated follow-up, and a scannable history

---

# 0. 🔴 WHERE THE LIVE DATA CONTRADICTS THE BRIEF

Two premises in the brief are wrong, and both change the work.

## 0.1 There are NINE contact rows, not six — and they carry THREE kinds, not one

The brief says *"the 6 existing rows (all `first_contact`)"* and, in the constraints, *"The live data has
SIX contact rows, all outbound, all one stage — so an inbound row and a chase row cannot be tested against
it."* 🧪 Re-derived 10 September, count-asserted (header total 9 = rows fetched 9):

| `kind` | rows | directions |
|---|---|---|
| `first_contact` | **6** | 5 outbound, **1 inbound** |
| `follow_up` | **2** | both outbound |
| `reply` | **1** | **outbound** |
| **total** | **9** | 8 outbound, 1 inbound |

So **an inbound row does exist and can be tested against real data.** Only a `3_chase_2` row has no live
equivalent, and that one test is labelled synthetic below.

## 0.2 🔴 The `reply` row is OUTBOUND, which is why it cannot be mapped

The whole thread on prospect `cc7c9595`, in order:

```
outbound  first_contact   "Hi, I run villagefoodie.co.uk, the food truck directory …"
inbound   first_contact   "Thanks Dominic / But we're not looking to change our provider …"
outbound  reply           "Ok thanks for getting back to me Guillermo - I wont reach out to you again."
```

🔴 **`reply` was recording "my reply to them", while `direction` was already recording "they replied" —
and the row that actually *is* the reply is labelled `first_contact`.** That is exactly the inconsistent
logging this change removes, and it means the `reply` row is **neither a first contact nor a chase**.

**It is therefore left alone.** The brief's instruction is *"do not lose them or rewrite their meaning"*,
and mapping an outbound sign-off to either rung of a three-step outbound ladder would rewrite what
happened. It stays as `reply`, a legacy value the picker no longer offers and the history renders as
"reply (legacy)". `kind` is unconstrained text, so a value outside the current vocabulary is legal.

---

# 1. `git status`, verbatim, before any edit

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
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-density-report.md
	docs/outreach-modal-flow-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-schedule-popup-report.md
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

no changes added to commit (use "git add" and/or "git commit -a")
```

`git add -A` / `git add .` were not run; nothing was staged.

---

# 2. DIAGNOSIS, IN THE ORDER ASKED

## 2.1 🔴 How `kind` is constrained — and why NO MIGRATION IS NEEDED

**Free text. No CHECK, no enum.** 🔎 `supabase/migrations/20260903_outreach_tracking.sql` declares
`kind text, -- lib/outreach.ts CONTACT_KINDS`, and 🧪 that is the **only** migration in the repository
mentioning `outreach_contacts` — no later `ALTER`, no constraint, no type. The code says so itself, in
`lib/outreach.ts`: *"the migration carries no CHECK, so THESE are the enforcement"*. The runtime
validator `isKind` is the whole of it.

🔴 **So changing the allowed values needs no schema change, and I did not stop.** The gate in the brief
was *"if changing the allowed values needs a migration, SAY SO AND STOP"* — it does not.

A **data** migration is supplied anyway, to make stored history read consistently with the picker, but it
is optional: §4 shows the app renders legacy values correctly whether or not it is ever run.

## 2.2 Every read/write site for `kind`

| Site | What it does |
|---|---|
| `lib/outreach.ts` `CONTACT_KINDS` / `isKind` | the vocabulary and the only enforcement |
| `route.ts` — the `log_contact` branch | validates with `isKind`, writes `kind ?? null` |
| `route.ts` — the prospects `SELECT` | reads `kind` into the per-prospect history |
| `OutreachPanel.tsx` — `Contact` type | `kind: string \| null` |
| `OutreachPanel.tsx` — `HistoryEntry` | **displayed** it, in the run-on sentence being replaced |
| `OutreachPanel.tsx` — `kind` state + `[p.id]` reset | the log form's selected value |
| `OutreachPanel.tsx` — the `<select>` | offers `CONTACT_KINDS` |
| `OutreachPanel.tsx` — `submitLog` and the compose window's `onLog` | passes it to the writer |

🔴 **There is no filter on `kind`, and no count derived from it.** The `kind` seen in `FILTER_CONTROLS`
and in `MediaCell` is an unrelated identifier (a control type, and `'logo' \| 'photo'`).

## 2.3 How `next_action_at` is written today

Three paths, all by hand, plus one deliberate absence:

- **On blur** of the date input — writes when the value differs from the stored column, `'' → null`.
- **Quick-set buttons** (`setNext(days)`) — computes **today** + n and writes immediately via `onPatch`.
- **Clear** — sets `''` and writes `null`.
- 🔴 **`log_contact` writes a contact row and nothing else.** Both the route and the panel carry an
  explicit comment saying no `next_action_at` is suggested, computed or sent. **That is what this change
  reverses**, and only that.

## 2.4 The current sort order of contact history

🔴 **Already most-recent-first, and I changed nothing.** 🔎 The route orders
`.order('contacted_at', { ascending: false })`, and 🧪 the client renders `p.contacts.map(...)` with **no
client-side sort** — so the server order is what you see. The brief's requirement was already met; saying
I "made it most recent first" would have been claiming credit for existing behaviour.

---

# 3. 🔴 THE RULE REVERSAL, RECORDED

**The manual's standing rule — "NO DATE IS EVER SUGGESTED OR WRITTEN AUTOMATICALLY" — is now partly
reversed, deliberately.** Recorded here rather than made quietly, and recorded in the code at `submitLog`
and at `FOLLOW_UP_DAYS`.

**What the rule was written against.** The manual states it plainly: *"The original design computed the
next action from the count of outbound contacts. It was removed the first time it met a real prospect."*
Its two recorded failures:

1. a double-click logged two contacts, so a first approach counted as a third and the suggestion jumped a
   month out;
2. *"an outbound count cannot distinguish chasing silence from following up an engaged prospect, and it
   counts an email and a WhatsApp about the same thing as two attempts rather than one."*

**Why neither objection survives a selected stage.** Both are properties of **counting**, not of
scheduling:

- A double-click now logs the **same stage twice** and yields the **same date** — `1_first_contact` is
  +3 whether it is logged once or five times. There is nothing to compound.
- "Engaged" is no longer inferred. It is recorded: a reply is an **inbound row**, which ends the ladder.
- An email and a WhatsApp about the same thing are the same stage, so they imply the same date rather
  than two attempts.

The interval follows a value **explicitly selected from a three-item list**, not derived from anything.

**🔴 The half of the rule that STANDS, unchanged.** Nothing is written on **open**. `nextAt` is still
seeded only from `p.next_action_at ?? ''` — 🧪 verified at both the `useState` and the `[p.id]` reset —
so the field is empty when the column is null and stays empty until `submitLog` runs. Proof in §5.

---

# 4. WHAT WAS BUILT

## 4.1 The numbered sequence

`CONTACT_KINDS` is now `['1_first_contact', '2_chase_1', '3_chase_2']`. `reply` and `chase` are gone from
the vocabulary: a reply is `direction = 'inbound'` and ends the sequence; a call is a **channel**, and
`CONTACT_CHANNELS` already carries `phone` and `in_person`. 🧪 `chase` was never once written — 0 of 9
rows — so the synonym pair was already producing one dead value.

`kindLabel()` is a lookup with a **fallback to the raw value**, so legacy rows render and an unknown value
shows as itself rather than blank.

## 4.2 The migration — WRITTEN, NOT APPLIED

**`supabase/migrations/20260910_outreach_contact_kinds.sql` — 3,882 bytes, 53 lines.**

🔴 **Run `notify pgrst, 'reload schema';` after applying** — it is the last line of the file. PostgREST
caches the schema and answers **PGRST205** against a table that exists until it reloads, which reads as
"the migration failed" and cost a red scrape on 9 September.

🧪 The executable content is exactly five statements — `begin`, **two** `UPDATE`s, `commit`, `notify`.
**No `DELETE`, no `DROP`, no `ALTER`** (the one `grep` hit for "delete" is the word inside a verification
comment).

| From | To | Rows |
|---|---|---|
| `first_contact` | `1_first_contact` | 6 |
| `follow_up` | `2_chase_1` | 2 |
| `reply` | **untouched** | 1 |

Each `UPDATE` is scoped to the old value, so a second run matches nothing. The file carries the expected
post-state (`1_first_contact` 6 · `2_chase_1` 2 · `reply` 1 · **total 9, unchanged**) and a verification
query.

## 4.3 Auto-populate on log

`submitLog` now computes `followUpDateFor(kind, contactedAt)` **after** a successful log and writes it.

🔴 **Counted from the contact's own date, not from today** — logging Monday's email on Wednesday must
schedule from Monday, or back-dating a contact silently pushes the chase out. The arithmetic is UTC
date-only, so it cannot shift a day for anyone west of Greenwich.

**What happens when the prospect already has a follow-up date** — the question the brief asked:
🔴 **the date always matches the stage just logged, including when that means clearing it.** One rule, no
hidden state. An existing date is **overwritten**, because the ladder's point is that the latest step
governs — leaving a first-contact date in place after logging a chase would leave a *past* date driving
the work queue. And `3_chase_2` **clears** rather than leaving a stale date, because a finished sequence
must not sit in the overdue queue for ever. Both are visible in the field immediately, and the brief's own
"I can override or Clear afterwards" is preserved — the picker, the quick-sets and Clear all still work.

## 4.4 The history row

One row per contact, fixed horizontal positions, **no header row** (🧪 the live table is 9 contacts across
4 prospects — 1 to 3 each — so a header would cost vertical space on every prospect to serve a case that
does not exist).

```
[ date 58px ][ dir 14px ][ stage 104px ][ channel 1fr ][ More auto ]
[ one clamped body line, with More/Less per entry                  ]
```

🔴 The **stage** sits at a fixed offset with a fixed width, so the eye runs down a column. Direction is a
**symbol** — `→` outbound, `←` inbound — with the word kept in `title`/`aria-label`. An **inbound row is
tinted** emerald with an emerald border.

⚠️ **The clamp threshold was lowered** from `newlines >= 2 || length > 160` to `newlines >= 1 ||
length > 90`. With a one-line clamp the old threshold would have hidden the More control on a two-line
body that is visibly cut off — a control that is absent when the text is truncated is worse than no clamp.

## 4.5 Layout

- **Follow up on moved ABOVE the Log contact button.** 🧪 Element order confirms it: it was position 11,
  it is now position 10, with the button at 11.
- **Column split 38 / 62**, as an **inline `gridTemplateColumns`**.
- 🔴 **Contact history stays in the right column, above Log a contact** — 🧪 positions 4–5, before the
  "Log a contact" heading at 6. Untouched.

---

# 5. 🔴 PROOFS — AND THE FAILURE EACH RULES OUT

Logic was executed against `lib/outreach.ts` **compiled by the repository's own TypeScript**, so the
tested code is the shipped code.

**P1 · All three stages, against a known contact date (2026-09-08).** The brief's trap: *an auto-populate
that never fires and one that works both leave the field empty on a prospect I have not logged against.*

| stage | interval | resulting date |
|---|---|---|
| `1_first_contact` | +3 | **2026-09-11** |
| `2_chase_1` | +7 | **2026-09-15** |
| `3_chase_2` | none | **no date — the sequence ends** |

*An interval that never fires would print "no date" for all three. It does not.*

**P2 · Counted from the contact date, not today** (today is 2026-09-10):
contacted 2026-09-08 → 09-11 / 09-15 · contacted 2026-09-10 → 09-13 / 09-17 · contacted 2026-08-31 →
09-03 / 09-07. **A "+3 from today" bug would give 09-13 for all three.**

**P3 · Month and year boundaries.** 2026-09-29 → +3 = **2026-10-02**; 2026-12-30 → +3 = **2027-01-02**;
2026-02-26 → +3 = **2026-03-01**.

**P4 · Malformed and legacy input invents nothing.** `''` → null; `'not-a-date'` → null; and the legacy
kinds `first_contact` / `reply` → **null** (they are not rungs on the ladder, so they imply no interval).

**P5 · 🔴 EMPTY ON OPEN, for a prospect with no stored date.** 🧪 Structural: `nextAt` is initialised
`useState(p.next_action_at ?? '')` and re-seeded on `[p.id]` from the same expression — **the only two
places it is set from the row.** Neither reads the contact list, the stage or the clock. 🧪 Live: **227
of 231** prospects have `next_action_at` null, and all 227 therefore open with an empty field. *A field
that populates on OPEN and one that populates on LOG look identical once a date is present — this is
proven from the seeding expression, which is the only thing that runs on open.*

**P6 · Labels, including legacy.** `1 · first contact` / `2 · chase 1` / `3 · chase 2`;
`first_contact` → "1 · first contact (legacy)", `follow_up` → "2 · chase 1 (legacy)", `reply` →
"reply (legacy)"; an unknown value renders as itself; `null` renders `—`. *A label map without a fallback
would render blank for the three legacy values still in the table.*

**P7 · 🔴 The inbound row is genuinely distinct — measured, not asserted.** In headless Chrome against the
project's own compiled Tailwind with the unlayered `!important` block copied verbatim:

| | background | border |
|---|---|---|
| outbound | `rgb(255, 255, 255)` | slate-200 |
| **inbound** | **`rgb(236, 253, 245)`** | **emerald-300** |

`tintDiffers: true`, `borderDiffers: true`. ⚠️ The background is an **inline style**, not a class:
🧪 `border-sky-200` has **zero** other users in this repo and `bg-sky-50` has one — a colour class that
failed to resolve would remove the distinction **silently**, which is the exact failure this is guarding
against. (`line-clamp-1` was kept as a class because it has a real co-user, `TruckListCard.tsx`.)

**P8 · The stage really is in a fixed position.** 🧪 Measured on an outbound and an inbound row:
`stageSameX: true` — both at **x = 97px**, width **104px**.

**P9 · The one-line clamp takes effect.** 🧪 Clamped body **16px** vs unclamped **72px** at a 16px line
height. *A clamp that did not resolve would look correct on any short body.*

**P10 · Widths and scrolling, measured @1440×900.**

| | left | right | split |
|---|---|---|---|
| before | 546px | 546px | 50 / 50 |
| **after** | **415px** | **677px** | **38.0 / 62.0** |

🔴 **History is the only region that actually scrolls.** Under pressure (40 entries): history
`scrolls: true, overflow: 1516`; **left `false`, right `false`, body `false`**; and both the follow-up
block and the Log contact button remain visible. ⚠️ The left column does still carry
`overflow-y-auto` as a safety valve — it is a *potential* second scroll region — but 🧪 it measures
`overflow: 0` at the new narrower width, both with and without history under pressure, so it never
actually scrolls. Narrowing it to 38% did **not** push it into scrolling.

**P11 · The grid split is an inline style.** An arbitrary Tailwind value used by one file may have **no
generated rule at all** — that is what painted the compose window under its own modal yesterday — and if
this one went missing the columns would fall back to `grid-cols-2`, i.e. the 50/50 split being corrected.
⚠️ `fr`, not `%`: percentages resolve against the content box and would overflow by the 20px gap.

**P12 · Element order, JSX comments stripped before matching** (a landmark scan has misreported order
three times in this series):

| # | BEFORE | AFTER |
|---|---|---|
| 1–3 | left column · notes · right column | unchanged |
| 4–5 | **history heading · history list** | unchanged — still above "Log a contact" |
| 6–9 | Log a contact · 4-control grid · compose · message | unchanged |
| 10 | Log contact button | **FOLLOW UP ON** |
| 11 | FOLLOW UP ON | **Log contact button** |

**P13 · Compiler and scope.** `tsc --noEmit` → **exit 0, 0 errors**. 🧪 Three files written:
`lib/outreach.ts`, `components/admin/OutreachPanel.tsx`, and the new migration. The compose window,
templates system, substitution mechanism, outreach filters, chips, media cells, delete guards, events tab
and schedule popup were **not** opened — verified by timestamp against a pre-edit snapshot.

---

# 6. EVIDENCE CLASS

- ✅ **Executed against live data:** the 9-row count and its kind/direction breakdown, the `cc7c9595`
  thread, the 227-of-231 null `next_action_at` figure. All count-asserted.
- ✅ **Executed, against compiled source:** P1–P4 and P6 — `followUpDateFor` and `kindLabel` compiled from
  `lib/outreach.ts` with the repo's own TypeScript.
- ✅ **Measured in a browser:** P7–P11 — the tint, the fixed stage position, the clamp, the column widths
  and every scroll region, against the project's own compiled Tailwind including the unlayered block.
- ✅ **Structural, extracted from source:** P5 (the seeding expression), P12 (element order), P13 (scope),
  the read-site census, the sort order, and the absence of any CHECK on `kind`.
- 🔴 **Reasoned only, NOT OBSERVED:** that the row reads well at a glance, that `→`/`←` is legible at
  11px, that the emerald tint is obvious enough in situ, and that 38/62 feels right. **No admin agent
  session is obtainable — I logged no contact, selected no stage, and saved nothing. No date was written
  to any prospect.**
- 🔴 **SYNTHETIC, and labelled as such:** `3_chase_2` has no live row (nothing has reached that step), so
  its "no date" behaviour is proven from the compiled function, not from data. The inbound row **is**
  real — contrary to the brief — and the tint was measured on a constructed row because rendering the
  real one needs a session.
- ⚠️ **NOT APPLIED:** the migration. Its effect on the 9 live rows is predicted, not observed, and the
  file carries the expected post-state so the prediction is checkable when you run it.
