# The outreach list — column layout, the cut, the Due gate, and the leads view

**14 September 2026.** Three files changed: `lib/outreach.ts`, `components/admin/OutreachPanel.tsx`, and
nothing else of substance. **No migration. No template row touched. `lib/whatsapp-hint.ts` not
modified.** Nothing staged or committed.

⚠️ **I CANNOT SEE A SCREEN.** Every layout figure is a READ of a declared width or of the CSS
fixed-table rule. Nothing was observed rendering.

---

# 🔴 PREMISE CORRECTIONS — TWO, PLUS ONE CONSEQUENCE I HAD TO DEAL WITH

## 1 · `colSpan={12}` needed no change — the cut fixed it by arithmetic

The brief calls `colSpan={12}` "the same omission's second symptom", and it was. But Phase 2 removes two
columns, so the table is **back to 12** and the existing `colSpan={12}` is now correct as written. 🧪 The
invariant check asserts it rather than assuming it: *"every colSpan equals the column count (12)"*.

## 2 · 🔴 CUTTING THE INLINE EDITORS KILLED THE LIST-FREEZE MECHANISM — a consequence nobody asked about

Not in the brief, and I could not leave it. 🔎 `OutreachPanel` carried a freeze: while an inline input
had focus it pinned the row set and order so a row could not move or vanish mid-edit, releasing a tick
late so tabbing Phone → Email did not unmount the row focus was travelling to.

🧪 **`Row` was its only consumer** — `onHold` appears on `Row` and nowhere else. PHONE and EMAIL were the
only inline inputs in the table. With both cut, **`holdList` can never be called**, `heldOrder` is
permanently null and `visible` is always `computedVisible`. That is **unreachable code, not merely
unused**, so removing it changes nothing observable — and leaving it would have added two
`no-unused-vars` findings (🧪 it did: `InlineField` and `onHold`, both caught by the lint diff before I
removed them).

**Removed, with a comment in place of the code** recording what it did, why it went, and to bring it back
if an inline editor ever returns. ⚠️ **`InlineField` itself is untouched and still used** by
`EventRowCells` and `DiscoveryEventsPanel` — 🧪 both still import it; only OutreachPanel's import went.

## 3 · Everything else in the brief checked out

The missing `<col>`, the `channelFor` reuse, `noColumn`, and the per-column inventory were all confirmed
by re-reading. 🧪 **Two of Dominic's figures were re-derived from the code and matched: the old ungated
count 224, and the contactable/uncontactable split 76/155.**

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .github/workflows/discovery_prune.yml
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/ComposeWindow.tsx
	modified:   components/admin/OutreachPanel.tsx
	modified:   components/admin/TemplatesPanel.tsx
	modified:   docs/scraper-reference-manual.md
	modified:   lib/outreach-template-render.ts
	modified:   scripts/prune-discovery-events.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-lead-type-freeze-report.md
	docs/outreach-list-view-report.md
	docs/outreach-queue-report.md
	docs/outreach-sequence-review-report.md
	lib/outreach-step.ts
	supabase/migrations/20260914_outreach_lead_type_freeze.sql

no changes added to commit (use "git add" and/or "git commit -a")
════
e8b59e5 outreach
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
```

🔴 **Nothing new is committed.** `HEAD` is still `e8b59e5`, and the tree now carries **four** bodies of
work: the prune fix, the queue build, the lead-type freeze, and this. ⚠️ They share files and can no
longer be committed apart.

⚠️ `/usr/bin/git` is a license-blocked Xcode shim here (`exit 69`); these ran through the Xcode binary
directly. **`sudo xcodebuild -license` once.**

### Admin-only — confirmed, with the shared file flagged and untouched

`OutreachPanel` ← `app/admin/page.tsx` only. `lib/outreach.ts` and `lib/outreach-step.ts` are imported by
the outreach tree and the outreach route. 🔴 **`lib/whatsapp-hint.ts` is shared with the CUSTOMER-FACING
live button** (`components/EventListCard.tsx`) — `phoneWhatsApp` is **read** to build `waPhone` and
**nothing in it changed**; 🧪 the file has zero diff. `InlineField` is shared across three admin panels
and is likewise unmodified.

---

# PHASE 1 — THE LAYOUT BUG

## What it was

🔎 **READ:** `COLUMNS` had **13** entries and `<thead>` maps over it, so 13 `<th>` rendered; the
`<colgroup>` had **12** `<col>`. The file's own comment states the invariant:
> *"THE SUM OF THESE EQUALS `minWidth` EXACTLY (1198px), AND THAT IS THE POINT."*

Under `table-fixed`, a column with no declared width absorbs the surplus. The table is `w-full` with a
`minWidth` floor, so in an 1800px container the twelve declared columns stayed pinned at 115/210/88…
**at every window width** while NEXT STEP took up to ~600px. **That is why email, phone and every date
truncated on a wide screen — it was never the columns being too narrow.**

## 🔴 TWO COLUMNS WERE ALSO JUST TOO SMALL FOR THEIR OWN CONTENT, INDEPENDENTLY

Found while sizing, and it means the missing `<col>` was not the whole story:

| Column | Content, READ | Needs | Had | |
|---|---|---|---|---|
| `stage` | `STATUS_LABEL` → **"not contacted"**, 13 chars ≈ 94px + 24px `px-3` | **118px** | 105px | 🔴 truncated at ANY width |
| dates | `fmtDate` uses `year: 'numeric'` → **"10 Sept 2026"**, 12 chars ≈ 86px + 24px | **110px** | 88px | 🔴 same |

⚠️ Note **"Sept"**, not "Sep" — `en-GB` `month: 'short'` emits four characters for September. Dominic's
observed *"10 Sep …"* is that string being cut.

## The repair, re-derived

🧪 **Not transcribed — computed from the declared values:**

```
 64 +  64 + 210 + 150 +  72 +  76 +  68 +  78 + 125 + 112 + 112 + 190 = 1321
logo photo name  contact wa  huOrd huMap sched stage lastC nextA nextStep
```

**`minWidth: '1321px'`, 12 `<col>`, 12 columns, `colSpan={12}`.** The comment now carries that sum, the
arithmetic, and the record of what broke it — a comment that misdescribes its code is a recorded failure
mode here, so it was rewritten rather than left.

**At 1440px:** surplus = `1440 − 1321 = 119px`, distributed proportionally by `table-fixed` → every
column renders **×1.090**. Nothing that fits at the floor starts truncating as the window grows.

---

# PHASE 2 — THE COLUMN SET

**Removed:** `PHONE`, `EMAIL`. **Added:** `CONTACT`. **12 columns.**

| # | Column | px | at 1440 | Worst realistic content | Fits? |
|---|---|---|---|---|---|
| 1 | LOGO | 64 | 70 | a 40px thumb | ✅ |
| 2 | PHOTO | 64 | 70 | " | ✅ |
| 3 | TRUCK | **210** ⬆︎170 | 229 | "Between Buns Royston" ≈ 168 | ✅ |
| 4 | **CONTACT** 🆕 | **150** | 164 | "hatchesup.app" ≈ 118 | ✅ |
| 5 | WHATSAPP | 72 | 78 | a checkbox | ✅ |
| 6 | HU ORDERING | 76 | 83 | a tri-state box | ✅ |
| 7 | HU MAP | 68 | 74 | " | ✅ |
| 8 | SCHEDULE | 78 | 85 | "Y (11)" | ✅ |
| 9 | STAGE | **125** ⬆︎105 | 136 | "not contacted" ≈ 118 | ✅ |
| 10 | LAST CONTACTED | **112** ⬆︎88 | 122 | "10 Sept 2026" ≈ 111 | ✅ |
| 11 | NEXT ACTION | **112** ⬆︎88 | 122 | " | ✅ |
| 12 | NEXT STEP | **190** 🆕 | 207 | "Chase 2 · 10 Sept 2026" ≈ 183 | ✅ |

🧪 Every row of that table is asserted by the invariant check, not eyeballed.

⚠️ **TWO HONEST LIMITS, because "no column truncates" cannot be true of arbitrary text:**
1. **A truck name longer than ~26 characters still truncates.** 210px holds about that; names are free
   text. The `title` carries the full value, as it always has.
2. **A `stopped` NEXT STEP label truncates.** `"Converted — now a HatchGrab truck"` (33 chars ≈ 262px)
   and `"Sequence complete — final chase sent"` (36) exceed 190px. 🧪 Dominic's data has **6** stopped
   rows in 231; the common cases ("First contact", "⚠ Can't tell", "Chase 2 · 10 Sept 2026") all fit,
   and the full string is in the `title`. **Sizing for the 6 would cost 70px of every other row.**

## The CONTACT column — what it encodes

**Reachable** → the channel a message would actually go out on: **Email** or **WhatsApp**.
**Not reachable** → the **lead to chase instead**, as its host: `hatchesup.app` (orange, the strongest
lead), a real site, a Facebook page, or `—`.

🔴 **THE PREDICATE IS `channelFor`, REUSED, NOT REWRITTEN.** 🧪 It already computes exactly Dominic's
rule and therefore exactly his 76/155 split — verified below on a 231-row fixture.

🔴 **AND IT CALLS `channelFor(p)` DIRECTLY, NOT `step.channel` — A TRAP I PROVED BEFORE WRITING THE
COLUMN.** 🎯 `nextStep` builds its `base` with `channel: null` and **every stop returns that base**:

```
  PROOF: a prospect that HAS an email and is do_not_contact
    step.channel  = null    ← wrong signal
    channelFor(p) = email   ← right signal
```

Reading the step would have filed every do-not-contact / replied / converted row under "no lead" while
the Due gate still looked correct.

**Filterable:** through the three-view control (§Phase 3/4), which is where contactability can be
combined with the clock and `waPhone`. ⚠️ **Stated plainly: there is no `contactable: yes/no` entry in
the filter bar.** `matchesOutreachFilter` is pure over one row and has neither, and putting a key there
that the pure function ignores is worse than a separate control — the same reasoning the Due toggle
already used.

## Not cut, and why — these are controls, not columns

🔴 **HU ORDERING and HU MAP are the ONLY editor for those flags.** 🧪 `TriStateBox` appears 4× in the
file and **zero times inside `Detail`**. **LOGO and PHOTO are the ONLY upload path** — 🧪 `MediaCell`
appears only in its definition and the two list cells; the modal's `ModalThumb` shows and **deletes**,
but does not upload. Cutting any of the four removes a capability. **Both are logged as a later job:
move the controls into the modal first, then cut.**

## 🔴 LAST CONTACTED — KEPT, and here is the case both ways

**Kept. Recommendation: keep it for now, and it is the easiest next cut if you disagree.**

**What would be lost:** it is the only column showing *history*. NEXT ACTION is a **plan** and NEXT STEP
is a **rung** — neither answers *"when did I last touch this truck?"*, which is the "have I gone quiet"
signal. **What argues for cutting:** 🧪 with 223 of 231 prospects `not_contacted`, it renders `—` on
about **96%** of rows today, and 🧪 it is the only column in the table with **no filter at all**. It fills
as the sequence runs. **112px is the price.**

---

# PHASE 3 — DUE WORK COUNTS ONLY WORK THAT CAN BE DONE

🔎 Before: `dueCounts` counted every `state === 'due'` row. **The channel was computed by `channelFor`,
carried on the step, and never consulted.** Now `due` requires a channel; unreachable rows are counted
as `leads` instead.

🧪 **Driven on a 231-row fixture built to Dominic's verified distribution:**

```
   UNGATED (the old count) : 224      ← reproduces the number on his screen
   GATED   (the new count) : 70       ← 🔴 the target
   Needs details           : 155
   the gate removes exactly the 154 due-but-unreachable rows
```

🔴 **THE FIXTURE HAD TO BE CORRECTED ONCE, AND THAT IS WORTH RECORDING.** A first version put all seven
non-due rows (6 stopped + 1 scheduled) on contactable prospects and produced **69**. For Dominic's
breakdown to sum to 231 the six stops must land on **contactable** rows (76 − 6 = 70) and the one
scheduled row on an **uncontactable** one (155 − 1 = 154). **The fixture was wrong, not the gate** — and
the off-by-one was only visible because the expected number was stated in advance.

**What was already excluded, with evidence** (🧪 `needsAttention` is `due || unknown`):

| State | Counted? | Evidence |
|---|---|---|
| `stopped` (DNC, converted, replied, terminal stage) | ❌ | 🧪 6 in the fixture, none counted |
| `scheduled` (due in future) | ❌ | 🧪 1, not counted |
| `complete` | ❌ | 🧪 asserted, none counted |
| `unknown` | ✅ **by design** | An unreadable history is work — it needs the log corrected. 🧪 0 in today's data; still counted when present, and shown separately by the amber badge |

---

# PHASE 4 — THE UNCONTACTABLE VIEW

**A third view, "Needs details (155)"**, beside All and Due work. Every prospect with no contact route,
whatever its step state.

⚠️ **No state filter on it, deliberately.** Dominic's data says all 155 are `not_contacted`, so one
would be a no-op today — and would hide a row the day that stops being true, which is the opposite of
what this view is for.

## What each row shows, and 🔴 why it is text and not a link

The **CONTACT** column carries the lead — the **host**, because that is the signal and a full URL would
truncate in any sane column. The whole URL is in the `title`.

🔴 **NO `<a href>` WAS ADDED, AND THAT WAS A JUDGEMENT CALL BETWEEN TWO INSTRUCTIONS.** Phase 4 asks to
*show* `order_url` and `website` per row; the constraints say *"nothing in a row contacts anyone today
(🧪 zero href/mailto:/tel:/wa.me) and that stays true."* A storefront link does not contact a prospect,
but it would break the cited property. **Showing the host as text satisfies both readings**, and it is
better for triage than a truncated URL. 🧪 Re-verified after the change, comments stripped:

```
  ROW:   href 0 · mailto: 0 · tel: 0 · wa.me 0
  MODAL: href 3 · mailto: 1 · tel: 1 · wa.me 1   ← POSITIVE CONTROL, same technique
```

⚠️ **Making them clickable is a one-line change if you want it — say so and I will.**

## The ordering, and how the four groups are distinguished

🔎 `leadOf(order_url, website)` in `lib/outreach.ts`, ranked by array position in `LEAD_RANKS`:

| # | Rank | Test | 🧪 Dominic's figure |
|---|---|---|---|
| 0 | **Hatches Up store** | order-url host is `hatchesup.app` or `*.hatchesup.app` | **46** ✅ matched |
| 1 | Ordering page | any other order-url host, not Facebook | — |
| 2 | Website | a website host that is not Facebook | 34 |
| 3 | Facebook | host is/ends with `facebook.com`, `fb.com`, `fb.me` | **30** ✅ matched |
| 4 | No lead | neither | **45** ✅ matched |

🔴 **AN UNRECOGNISED HOST RANKS AS A REAL WEBSITE (2), NOT AS "nothing"** — a host this code has not seen
is far likelier to be a small trader's own site than worthless, and ranking it last would bury exactly
the leads nobody has looked at. 🧪 Asserted: `never-seen.xyz` → `website`.
⚠️ **A Facebook page in `order_url` is still only a Facebook lead** — tested before the website so it
cannot outrank a truck with a real site. 🧪 `fb order + real site` → `website`.

🔴 **`menu_url` IS NOT CONSULTED AT ALL.** Per the verified note: usually the order URL repeated, and
sometimes a Facebook CDN image link that expires (`Naked Fish`). **A lead that dies silently is worse
than no lead.** It is named in the code comment so nobody adds it later.

**Sorting:** the leads view defaults to best-lead-first; an explicit column-header sort still wins in
every view. ⚠️ The normal priority sort is useless here by construction — it ranks on `hasEmail`, and
every row in this view has none, so it would collapse to one bucket and leave 155 rows arbitrary.

**No new state, no new columns, no scraper change**: one `useState` replaced the old boolean, the lead is
derived per row, `order_url` and `website` were already on the row.

---

# VERIFICATION

**Every harness was pointed at deliberately broken variants first.** 11 variants; all fail; the real code
passes.

## V1 · The layout invariant, and the check that would have caught the bug

*Null result it risks:* a checker that reads nothing and reports nothing. *Excluded by:* it prints the
counts and the arithmetic it asserts on, and by three broken variants.

```
   columns: 12  <col>: 12  sum: 1321px  minWidth: 1321px  colSpan: 12
   64 + 64 + 210 + 150 + 72 + 76 + 68 + 78 + 125 + 112 + 112 + 190 = 1321
   ✓ <col> count (12) equals <th> count (12)
   ✓ widths sum (1321) equals minWidth (1321)
   ✓ every colSpan equals the column count (12)
   ✓ the whole table fits a 1440px viewport (1321 <= 1440)
   ✓ every sized column fits its worst realistic content at the DECLARED width
```

```
BROKEN VARIANT                                   exit
one <col> removed (the original bug's shape)       1  ✗ <col> count (11) != <th> count (12)
minWidth left at 1198                              1  ✗ widths sum (1321) != minWidth (1198)
stage back to 105px                                1  ✗ stage fits "not contacted" (105 >= 118)
                     ── the real file ──           0  ✅
```

## V2 · The contactable indicator agrees with `channelFor` on all 231

Built a 231-row fixture to the verified distribution: 🧪 **76 contactable, 155 not** — the figures
straight out of `channelFor`, not asserted separately.

## V3 · Due work reads 70; the leads view reads 155 in order

```
BROKEN VARIANT                            exit
gate removed (the pre-fix behaviour)        1  ✗ Due work reads 70 (got 224)
gate inverted                               1  ✗ Due work reads 70 (got 154)
channelFor ignores the phone                1  ✗ channelFor reports 76 (got 81)
lead order collapses                        1  ✗ sorted best-lead-first
```

🔴 **"channelFor ignores the phone" PASSED ON THE FIRST RUN, AND THAT WAS A HOLE IN MY FIXTURE, NOT A
PASS.** Every confirmed-WhatsApp row happened to have a number, so dropping the requirement changed
nothing. I added **5 rows that are `whatsapp_confirmed` with NO phone** — still correctly uncontactable —
and the mutation now fails. **A mutation that survives is a gap in the test, and it is reported rather
than quietly re-run.**

## V4 · The removed columns' filters still work

🧪 `FILTER_CONTROLS` still declares **12** controls; `phone` and `email` now carry `noColumn: true` —
the flag that already existed and was already used by `doNotContact`. 🧪 `FILTER_CONTROLS` is a separate
array from `COLUMNS`, so neither filter depended on its column. Their titles now say where the value
moved to.

## V5 · Nothing earlier regressed

🧪 All four prior harnesses re-run **unmodified** against this task's modules: the lead-type freeze
(read/write + the rung-1 predicate), the queue's `nextStep` suite, and the renderer suite (lead
conditions, the Phase 1 malformed-token guard, the four tokens) — **all exit 0**.

🧪 `platformFromOrderUrl` **characterised against HEAD** over 17 inputs after `hostOf` was factored out:
**17/17 identical**, with a control proving real values come back rather than all-null.

## V6 · The modal's mobile rounds 1–3 are untouched

🧪 `max-sm:` classes **removed vs HEAD: 0**. `ProspectMetaFacts` ×3, the `contents max-sm:hidden`
wrapper ×1, the `sm:hidden` phone copy ×1, `max-sm:grid-cols-2` ×1, `max-sm:min-w-0` ×10,
`max-sm:overflow-y-auto` ×1. **No modal code was edited by this task.**

## V7 · tsc and lint

`tsc --noEmit -p .` → **exit 0**.

```
                                         HEAD    now
@typescript-eslint/no-explicit-any         15     15
react-hooks/set-state-in-effect            11     11
react-hooks/immutability                    1      1
react-hooks/exhaustive-deps                 1      1
@typescript-eslint/no-unsafe-function-type  1      1
@typescript-eslint/no-unused-vars           1      0   ← the queue task's, already declared
```

**No finding added.** 🧪 `eslint lib/outreach-step.ts` → zero. ⚠️ An intermediate state of this task
*did* add two (`InlineField` and `onHold`, both orphaned by the cut); they were found by the lint diff
and removed properly rather than declared — see premise 2.

⚠️ **One meaningless-green caught:** the first working-tree lint run returned an **empty** tally because
a shell variable did not word-split and eslint matched no files. An empty tally is not a clean tally; it
was re-run with an explicit file list.

## 🔴 One line on the list's mobile behaviour (out of scope, reported)

**Marginally worse in one way, better in another.** 🧪 `minWidth` 1198 → **1321px**, so there is **123px
more horizontal scroll** on a 390px phone. Against that, the two inline text inputs are gone from every
row, so **nothing in the table takes text focus any more** — which removes the iOS focus-zoom risk from
the rows (⚠️ the `text-xs` filter bar above still has it). The list still has **no `sm:`/`max-sm:`
treatment at all**, exactly as before.

---

# CHECKLIST

### Layout — the thing you reported
- **L1.** 🔴 Full-width browser. **Email and phone columns are gone.** No date should read "10 Sept …" —
  they should show **"10 Sept 2026"** in full. STAGE should read **"not contacted"** in full.
- **L2.** Drag the window from ~1350px to full width. Every column should widen *together*. If one
  column swallows all the growth, the `<col>` invariant has broken again.
- **L3.** At 1440px there should be **no horizontal scrollbar** (1321 < 1440).
- **L4.** NEXT STEP: "First contact" and "Chase 2 · 10 Sept 2026" fit. ⚠️ A *stopped* row's long label
  ("Converted — now a HatchGrab truck") will still clip — hover for the full text.

### The CONTACT column
- **C1.** A truck with an email reads **Email**; one that is WhatsApp-confirmed with a number reads
  **WhatsApp**. Hover shows the address or number.
- **C2.** A truck with neither shows a **host** — `hatchesup.app` in orange, otherwise grey — or `—`.
- **C3.** 🔴 Open a **do-not-contact** prospect that has an email. Its CONTACT cell must still read
  **Email**, not a lead. (That is the `step.channel` trap; if it reads a lead, the wrong predicate is
  being used.)
- **C4.** Click the CONTACT header: reachable rows first, then unreachable best-lead-first.

### The three views
- **V1.** The header shows **All (231) · Due work (70) · Needs details (155)**. 🔴 **Due work must read
  70, not 224.** If it reads 224 the gate is not firing; if it reads something else, tell me the number.
- **V2.** **Needs details**: 155 rows, `hatchesup.app` first, then other ordering pages, then real
  websites, then Facebook, then `—`.
- **V3.** Filters still compose with a view — e.g. Needs details + HU ordering = Yes.
- **V4.** The bar still has **Phone** and **Email** filters even though the columns are gone; both still
  narrow the list. They now sit at the end, next to Do not contact.

### Unchanged, worth confirming
- **U1.** HU ORDERING / HU MAP tickboxes still set the flags. LOGO / PHOTO still accept a dropped image.
- **U2.** 🔴 **Phone and email are no longer editable from the list** — open the prospect panel to edit
  them. That is the real cost of the cut; tell me if it bites.
- **U3.** The prospect modal is unchanged, including on a phone.
- **U4.** ⚠️ The list no longer freezes while you type in it, because there is nothing to type in.

---

# SQL — for Dominic to run; **nothing here was executed**

⚠️ Every column named is one already read this session.

**1 · Confirm the gate's two numbers against the live database** — the 70 and the 155 the buttons now
show. 🔴 If `due_contactable` is not 70, that is the number the button will read:

```sql
with ladder as (
  select oc.prospect_id,
         max(case oc.kind when '1_first_contact' then 1 when '2_chase_1' then 2
                          when '3_chase_2' then 3 when '4_final_chase' then 4 end) as top_rung,
         count(*) filter (where oc.direction = 'inbound')                          as replies,
         count(*) filter (
           where oc.direction is distinct from 'inbound'
             and (oc.kind is null
               or oc.kind not in ('1_first_contact','2_chase_1','3_chase_2','4_final_chase','reply'))
         ) as blind_rows
    from public.outreach_contacts oc
   group by oc.prospect_id
)
select count(*) filter (where reachable and state in ('due','unknown'))     as due_contactable,
       count(*) filter (where not reachable)                                as needs_details,
       count(*) filter (where state in ('due','unknown'))                   as ungated_old_count,
       count(*)                                                             as prospects
  from (
    select (coalesce(trim(t.contact_email), '') <> ''
            or (p.whatsapp_confirmed is true and coalesce(trim(t.phone), '') <> '')) as reachable,
           case
             when p.do_not_contact then 'stopped'
             when t.hatchgrab_truck_id is not null then 'stopped'
             when coalesce(l.replies, 0) > 0 then 'stopped'
             when p.stage in ('signed','not_interested','replied') then 'stopped'
             when coalesce(l.blind_rows, 0) > 0 then 'unknown'
             when coalesce(l.top_rung, 0) >= 4 then 'complete'
             when coalesce(l.top_rung, 0) = 0 then 'due'
             when p.next_action_at is null or p.next_action_at <= current_date then 'due'
             else 'scheduled'
           end as state
      from public.outreach_prospects p
      left join public.discovery_trucks t on t.id = p.discovery_truck_id
      left join ladder l on l.prospect_id = p.id
  ) x;
```

⚠️ This approximates the due/scheduled split with `next_action_at`; the app counts from the contact's own
date via `followUpDateFor`. Treat it as within a day or two, not exact. `due_contactable` and
`needs_details` do **not** depend on that and should match the buttons exactly.

**2 · The leads view, in the order the screen will show it** — verify the 46 / 34 / 30 / 45 split and
spot any host the ranking calls a "website" that you would not:

```sql
select case
         when lower(split_part(regexp_replace(coalesce(t.order_url,''), '^https?://', ''), '/', 1))
              like '%hatchesup.app' then '0 hatchesup'
         when coalesce(trim(t.order_url), '') <> ''
          and lower(split_part(regexp_replace(t.order_url, '^https?://', ''), '/', 1))
              not like '%facebook.com' then '1 ordering page'
         when coalesce(trim(t.website), '') <> ''
          and lower(split_part(regexp_replace(t.website, '^https?://', ''), '/', 1))
              not like '%facebook.com' then '2 website'
         when coalesce(trim(t.order_url), '') <> '' or coalesce(trim(t.website), '') <> ''
              then '3 facebook'
         else '4 no lead'
       end as lead_rank,
       count(*) as prospects
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
 where coalesce(trim(t.contact_email), '') = ''
   and not (p.whatsapp_confirmed is true and coalesce(trim(t.phone), '') <> '')
 group by 1
 order by 1;
```

⚠️ The SQL only tests `facebook.com`; the app also treats `fb.com` and `fb.me` as Facebook, so a row or
two may land one rank apart between this query and the screen. The app is the stricter of the two.

**3 · The 46 Hatches Up storefronts, named** — the strongest leads, ready to work through:

```sql
select t.name,
       t.order_url,
       nullif(trim(t.website), '') as website,
       p.stage,
       p.next_action_at
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
 where coalesce(trim(t.contact_email), '') = ''
   and not (p.whatsapp_confirmed is true and coalesce(trim(t.phone), '') <> '')
   and lower(split_part(regexp_replace(coalesce(t.order_url,''), '^https?://', ''), '/', 1))
       like '%hatchesup.app'
 order by t.name;
```

**4 · Sanity-check the two columns that were too narrow** — how long the real values actually are, so the
125px and 112px hold up against live data rather than against my estimate:

```sql
select max(length(t.name))                                   as longest_truck_name,
       count(*) filter (where length(t.name) > 26)           as names_over_26_chars,
       count(distinct p.stage)                               as distinct_stages,
       max(length(p.stage))                                  as longest_stage_value
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id;
```

⚠️ `names_over_26_chars` is the count of truck names that will still truncate in a 210px TRUCK column at
the floor width. If it is more than a handful, widen TRUCK and raise `minWidth` by the same amount —
**the two must move together or Phase 1's bug comes straight back.**
