# Outreach configurability — template tagging, a global default, and three fixes

**15 September 2026.** Two new files (`lib/outreach-globals.ts`, one **unapplied** migration) and five
edited. 🔴 **No `outreach_templates` row was created, edited, seeded, activated or deactivated — not a
body, not a subject, not a `placeholder_defaults` value, not a tag.** Every mechanism ships empty.

⚠️ **I CANNOT SEE A SCREEN.** Layout and behaviour claims are READS of the source.

---

# 🔴 PREMISE CORRECTIONS — TWO

## 1 · My "the migration was never applied" claim was WRONG, and the honest cause is narrower

Dominic's `information_schema` query returned `lead_type_at_first_contact`. **The column exists. My
previous report's §F(i) conclusion is refuted** — I inferred "unapplied" from the file being untracked
and its own header saying so, which was reasoning from artefacts rather than from the database.

⚠️ **And I could not have proved it either way** — that review queried nothing. The lesson is narrower
than "I was wrong": *a file header is not evidence about a database*, and I presented it as though it
were. §Phase 0 has the real diagnosis.

## 2 · My lint baselines in the last two reports were over the wrong file set

🧪 `@typescript-eslint/no-explicit-any` is **18** at HEAD over the files this task touches, not the 15 I
printed twice. The 15 came from a **smaller file set** that excluded
`app/api/admin/outreach-templates/route.ts`. Corrected here, with a like-for-like baseline (§V7).

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
	modified:   ios/App/App/Info.plist
	modified:   lib/outreach-template-render.ts
	modified:   lib/outreach.ts
	modified:   scripts/prune-discovery-events.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-config-review-report.md
	docs/outreach-lead-type-freeze-report.md
	docs/outreach-list-columns-report.md
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

🔴 **Nothing new is committed.** `HEAD` is still `e8b59e5`; six bodies of work now sit in the tree.
⚠️ **`ios/App/App/Info.plist` is modified and belongs to none of this work. Untouched, reported again.**

### Admin-only — confirmed

`OutreachPanel` ← `app/admin/page.tsx` only; `TemplatesPanel`/`ComposeWindow` ← that tree only; both
routes behind `verifyAdmin` with a 404. `lib/outreach-globals.ts` (new) is imported by `ComposeWindow`
and `TemplatesPanel` only. 🔴 **`lib/whatsapp-hint.ts` (shared with the customer-facing live button) and
`components/admin/InlineField.tsx` are READ-ONLY here and carry zero diff.**

---

# PHASE 0 — WHY THE PROBE SAYS FALSE

🔎 **READ**, `app/api/admin/outreach/route.ts`:
```ts
const columnExists = async (col) => {
  const { error } = await supabase.from('outreach_prospects').select(col).limit(1)
  return !error            // any error → treat as absent
}
```

🔴 **IT GOES THROUGH POSTGREST, NOT THROUGH POSTGRES.** The column exists in the database;
**PostgREST answers from a schema cache it holds in memory**, and until that cache is reloaded a
`select` naming the column fails. `!error` then reports "absent". **The column being present in
`information_schema` and PostgREST refusing to select it are entirely compatible states.**

**Three candidates, two ruled out by reading:**

| Candidate | Verdict |
|---|---|
| A cached route response serving a stale `false` | 🧪 **Ruled out.** No `export const dynamic`/`revalidate` in the route — *positive control:* `app/api/ping/route.ts` does declare one, so the search finds it where it exists. The handler takes `req` and calls `verifyAdmin(req)`, which makes it dynamic anyway |
| The route talking to a different project | 🧪 **Ruled out.** `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` resolve to the same host, `ffphgwonshgxamtvefcv.supabase.co` |
| 🔴 **A stale PostgREST schema cache** | **The remaining explanation, and it fits every observation** |

⚠️ **The corroborating detail:** the *same* probe function returns **true** for `contact_name`,
`do_not_contact` and the name-split pair — all columns added earlier. It fails only for the most
recently added one. **That is the signature of a cache, not of a broken probe.**

## 🔴 THE ONE ACTION

```sql
notify pgrst, 'reload schema';
```

⚠️ `supabase/migrations/20260914_outreach_lead_type_freeze.sql` **ends with exactly that line**, so if
the whole file was run it should have fired. The likeliest gap is that only the `alter table` was run,
or that the notify was issued on a connection whose reload did not take. **Running it alone is safe and
idempotent** (§SQL 1).

## What I changed, and what I did not

🔴 **No new migration and no change to the probe's logic.** The one change is that **the failure now
logs its code**:

```ts
if (error) console.warn('[admin/outreach] column probe failed:', col, error.code, error.message)
return !error                                        // ← unchanged, still fail-closed
```

🔴 **This is the same defect class the scraper manual already records** — a guard that tested `42P01`
(a Postgres code) while PostgREST returns `PGRST205`. `PGRST204`/`PGRST205` mean *reload the cache*;
`42703` means *the column is absent*. Collapsing them is what made this look like an unapplied
migration for a day. **The return value did not move, so the degrade path is byte-identical.**

---

# PHASE 1 — THE COMPOSE WINDOW NO LONGER CLOSES ON AN OUTSIDE CLICK

## The close paths, as they were

| Path | READ | Now |
|---|---|---|
| **Backdrop click** | `onClick={onClose}` on the `fixed inset-0` overlay | 🔴 **REMOVED** |
| **Escape** | a **capture**-phase `keydown` on `window` → `onClose()` | **gated on a draft** |
| **Close button** | `onClick={onClose}` | unchanged |
| **A successful Log** | 🧪 does **not** close — sets `logged` | unchanged |

🔴 **The backdrop handler is removed, not guarded.** A backdrop that sometimes closes and sometimes does
not is a control nobody can predict, and Close sits two inches away. The `stopPropagation` on the dialog
went with it — it existed only to stop inner clicks reaching a handler that no longer exists, and a
guard against nothing is worse than no guard.

⚠️ **This also fixes a case that was never about "outside":** a drag that *started* inside the textarea
while selecting text and *ended* on the backdrop fired the same handler.

## Escape — decided, and justified

**Escape closes only when there is nothing to lose.** `dirty = edited || fillsTouched` — a keystroke in
the subject/body, or a typed placeholder value.

⚠️ **Selecting a template is deliberately NOT a draft.** The render is deterministic, so re-opening
reproduces it exactly; guarding on "body is non-empty" would make Escape useless the moment a template
was picked, which is every time the queue pre-selects one.

🔴 **THE LOAD-BEARING DETAIL — `stopPropagation()` RUNS EVEN WHEN IT DECLINES:**
```ts
e.stopPropagation(); e.preventDefault()
if (dirtyRef.current) return          // swallow the key, keep the window
onClose()
```
The early-return-without-stopping shape used elsewhere in this tree is for when a *child* should handle
the key. Here the opposite is needed: returning early would let Escape reach the prospect modal's
**bubble** listener and close **the parent**, leaving the draft's own window open underneath it —
strictly worse than the bug being fixed.

## 🔴 How I verified nothing closes two layers at once

**I added no listener.** 🧪 `ComposeWindow` has **exactly one** `keydown` listener, still capture phase,
still on `window` — the same one, with a changed body.

🔎 The full phase audit across the tree: `OutreachPanel` bubble (prospect modal) · `OutreachPanel`
capture (`ScheduleEventsPopup`) · `ComposeWindow` capture · `ConfirmDeleteDialog` capture ·
`ScheduleEventsPopup` capture · `CreateDemoModal` bubble. **C15 is the Schedule-popup/Confirm-dialog
pair, and this change neither joins nor worsens it.**

⚠️ **`dirty` is read through a ref, and the ref is written in an effect** — putting `dirty` in the
effect's deps would tear down and re-register the window listener on every keystroke, which is exactly
the registration churn C15 warns about. Writing the ref during render is the `react-hooks/refs` pattern
this repo has already had to correct once, so it is written after commit instead (§V7).

🔴 **The modal's mobile rounds 1–3 are untouched** — no file in the modal tree was edited for this phase.

---

# PHASE 2 — TEMPLATES TAGGED WITH WHAT THEY SERVE

## The migration — **NOT APPLIED**

`supabase/migrations/20260915_outreach_template_tags.sql`: `serves_kind text`, `serves_lead_type text`,
both nullable, **nullable meaning "any"**. Its header says truthfully that it has never run, says it must
be corrected the day it does **in both directions**, and tells the reader to run the `notify` line —
citing Phase 0 as the reason.

🔴 **No CHECK constraint**, per the house rule. Validation is `CONTACT_KINDS` membership and `isLeadType`
in the route (HTTP 400 otherwise), plus two `<select>`s built by mapping the constant arrays.

## 🔴 The Pizza Mondo defect — and the comment that documented its own cause

🔎 The old call site read: *"`kind` and `contacted_at` come from the log form so the compose window
respects what is already selected there rather than inventing its own."* **That is exactly how a chaser
was logged as a first contact** — the dropdown had not been touched, so the history recorded an approach
that never happened, and the derived step, the follow-up interval and the queue all read that history.

**Now:** `onLog` carries a third argument, the template's own rung.
```ts
const effectiveKind = servesKind ?? kind
```
🔴 **And `persistFollowUpAfterLog(effectiveKind)` uses the same value** — otherwise the follow-up date
would be counted from a rung that was never logged (3 days for a "first contact" that was a final chase).

### What happens when `serves_kind` is null — **the default path, not an edge case**

🔴 **Every row ships null and the migration sets nothing, so this is what happens today and tomorrow:**
`servesKind` is `null`, `effectiveKind` falls back to `kind`, and the dropdown governs **byte for byte
as before**. 🧪 Asserted directly (§V3), because it is the path all 9 templates take.

⚠️ **And when a tag DOES override, the window says so before Log is pressed** — *"This template logs as
Chase 1, not First contact"*, shown only when the two actually differ. Fixing a silent override by
adding a silent override in the other direction would be the same fault.

## Pre-selection — `STEP_TEMPLATE` becomes a fallback, not dead

🔎 `templateForStep` now prefers a tagged template and falls back to the hardcoded map.

| | 🧪 |
|---|---|
| No tagged template | falls back to `STEP_TEMPLATE` — **the live path today** |
| One tagged for the rung | wins over the map |
| One general + one lead-type-specific | the **specific** one wins, even with a worse `sort_order` |
| Two tagged identically | 🔴 **`sort_order` breaks the tie** — the column the picker already orders by, so what wins is what sits higher in the list he is looking at. Then slug, so the answer is stable rather than dependent on row arrival order |
| Tagged for the wrong rung / channel / lead type | ignored |

🔴 **`STEP_TEMPLATE` is NOT deleted.** It is what keeps an untagged install working exactly as it does
now. Tagging one template changes the answer for that rung only; tagging none changes nothing.

## 🔴 Which mechanism owns lead type

**`serves_lead_type` picks the TEMPLATE. The `?lead_*:` lines vary the TEXT inside one. They must not
both own the same distinction** — if a rule selected on lead type and the chosen body still carried four
`?lead_*` lines, three would be dead in every message and nothing on screen would say which.

**The division, and it is written into both field titles so it is visible where the choice is made:**
- Use **`?lead_*` lines** when the approach is the same and one sentence differs. One template, four types.
- Use **`serves_lead_type`** when the templates genuinely differ — a different subject, a different ask.
🧪 The seed already shows both shapes: `hu_rate_email` is a *different pitch*, not a variant sentence.

⚠️ **Nothing enforces this**, and I did not build an enforcement: a template tagged for a lead type that
*also* carries `?lead_*` lines still renders. Detecting it would mean parsing bodies to warn about a
combination that might be deliberate. **Reported as a judgement, not automated.**

🔴 **The `{{demo_link}}` constraint is unchanged** — must-resolve, refuses for 230 of 231. A rule that
selects a demo-link template still hits the existing refusal. 🧪 No seeded body uses it, so this is
latent, not live.

---

# PHASE 3 — A GLOBAL PLACEHOLDER DEFAULT

🔎 `defaultFillsOf(tpl, globals?)` — **the global layer is written FIRST so the per-template value
overwrites it.** Order is the whole precedence rule: nothing compares, nothing branches.

## Where it is stored, and the cost stated

🔴 **`localStorage`, key `hg.outreach.globals.v1`**, edited on the Templates tab beside the
per-placeholder defaults. Why, with the alternatives named:

| Option | Why not |
|---|---|
| A settings table | 🔴 a **second** migration; this task authorises one |
| A value on some template's `placeholder_defaults` | 🔴 **forbidden outright** — that is writing a template row |
| An env var | cannot be changed without a redeploy |

⚠️ **THE COST, NOT SOFTENED: it is per browser.** Another machine, or cleared site data, and the global
is gone — the per-template defaults and typing per truck both still work, so nothing breaks, but the
figure must be re-entered. **The upgrade path is cheap by construction:** `defaultFillsOf` takes the
layer as an *argument*, so only the read would move.

## 🔴 Two sources for one value — the badge names the winner

| Source | Badge | Age |
|---|---|---|
| The template's own default | blue **FROM DEFAULT · date**, red **· stale** past 60 days | ✅ server-stamped |
| The global | violet **FROM GLOBAL** | 🔴 **none, deliberately** — localStorage stores no timestamp, and inventing one would be worse than admitting there is none |

🧪 `fillSourceOf` returns `template` when both hold a value, because that is the one that won. Recorded
at the same moment the values are, from the same two layers, so the badge cannot disagree with what was
used. Typing over a value clears the badge.

⚠️ **Both the hand-picked path (`applyTemplate`) and the queue's pre-selection (`seedFrom`) merge the
global layer** — missing `seedFrom` would have made the feature work only on the least-likely path.

🧪 **The editor lists every `[[placeholder]]` found across the loaded templates**, derived from the
bodies rather than hand-written, so one invented tomorrow appears without anyone remembering to add it.
🔴 **It ships empty.** Nothing seeds a rate.

---

# PHASE 4 — TWO LIST BEHAVIOURS

## The default sort — NEXT ACTION, newest first

🔎 `useState<SortState>({ key: 'next_action', dir: 'desc' })` — one line, and **one word flips it**
(`'desc'` → `'asc'`).

🔴 **WHAT THAT PUTS AT THE TOP, given 231 prospects with 9 dated (6 overdue, 1 today, 2 ahead):**

| | Top of the list | Rows 1–9 | Rows 10–231 |
|---|---|---|---|
| **`desc` — as asked** | the **furthest-future** of the 2 scheduled-ahead rows | the 9 dated, latest → earliest, so the **most overdue is NINTH** | the 222 nulls |
| `asc` — the queue convention | the **most overdue** row | earliest → latest | the 222 nulls |

⚠️ **The 222 nulls land at the bottom either way** — 🔎 `compareBySort` is explicit: *"Nulls last,
ALWAYS — independent of direction."* So this orders 9 rows and then 222 dashes. **In the All view that
is a lot of dashes; in Due work, where every row is actionable, it is the useful ordering.**

## The NEXT ACTION cell opens the prospect

🔎 A real `<button onClick={() => onOpen(p.id)}>` — the same handler the truck name uses, and a
`<button>` for the same stated reason: tab order, focus, Enter and Space for free.

⚠️ **The button wraps only the date, not the cell.** 🧪 222 of 231 rows render `—`, and a full-width
target on a dash would be 222 rows of clickable nothing. The `<tr>` still carries no `onClick`.

🧪 **The zero-link property holds:** row `href` 0 · `mailto:` 0 · `tel:` 0 · `wa.me` 0, comments
stripped. *Positive control:* the modal has 3/1/1/1. 🧪 The row now has **2** `onOpen(p.id)` call sites
— the truck name and the date.

---

# VERIFICATION

**Every harness was pointed at deliberately broken variants FIRST.** 8 mutations; all fail; the real code
passes.

## V1 · Phase 1 — the close paths

*Null result it risks:* a structural check that matches nothing and reports success. *Excluded by:* a
control asserting the Close button **still** calls `onClose` (so "no handler anywhere" cannot pass), and
by three mutations.

```
✓ the BACKDROP no longer has onClick={onClose}          ✓ logNow does not call onClose
✓ the now-pointless stopPropagation on the dialog is gone ✓ CONTROL: it marks logged instead
✓ CONTROL: the Close button still calls onClose          ✓ exactly ONE keydown listener, still capture
✓ Escape closes only after the dirty check               ✓ no new listener of any kind
✓ stopPropagation runs BEFORE the decline                ✓ CONTROL: dirty is NOT in the effect deps

BROKEN VARIANT                              exit
backdrop close restored                       1  ✗ the BACKDROP no longer has onClick={onClose}
Escape ignores the draft                      1  ✗ Escape closes only after the dirty check
stopPropagation moved after the decline       1  ✗ Escape closes only after the dirty check
```

⚠️ **One assertion was wrong and was corrected, not worked around:** it required no trailing comment
after `return`, and the code has one. The regex was loosened; the code was not touched.

## V2 · Phase 3 — the global merges beneath the template

```
no template default, global set → "1.5% + 10p"    the global fills
template default + global       → "1.2% + 8p"     🔴 the TEMPLATE wins
✓ an unrelated global still comes through   ✓ undefined and null globals are identical
✓ a must-resolve key is dropped from BOTH layers   ✓ a whitespace global does not fill
✓ NULL-RESULT CONTROL: the merge returns real values, not {}
```
**The badge:** template-only → `template` · global-only → `global` · **both → `template`** · neither → `null`.

## V3 · Phase 2 — tagged wins, 🔴 untagged is unchanged

```
untagged set  → chaser_email   🔴 falls back to STEP_TEMPLATE — the path every row ships in
one tagged    → my_chase_1     the tag wins over the hardcoded map
general + specific → vf_chase_1  lead-type-specific wins despite a worse sort_order
two identical → z_low          🔴 lower sort_order wins DESPITE a worse id
wrong rung / channel / lead type → ignored, falls back
```

🔴 **THE TIE-BREAK MUTATION PASSED ON THE FIRST RUN, AND THAT WAS A HOLE IN MY FIXTURE.** The two tied
templates were `a_two` (sort 10) and `b_one` (sort 20) — id order agreed with sort order, so removing the
`sort_order` tie-break changed nothing. Renamed to `a_high` (sort 20) / `z_low` (sort 10) so the correct
answer must *lose* on id to win on sort_order. **A mutation that survives is a gap in the test, and it is
reported rather than quietly re-run.**

```
BROKEN VARIANT                                    exit
global layer applied AFTER the template            1  ✗ the global fills when the template has none
fillSourceOf always says template                  1  ✗ global only → global
tagged templates ignored                           1  ✗ a tagged template WINS over the map
tie-break by sort_order removed                    1  ✗ lower sort_order wins DESPITE a worse id
must-resolve key allowed in from the global        1  ✗ demo_link dropped from BOTH layers
```

## V4 · Nothing earlier regressed

🧪 Five prior harnesses re-run **unmodified**: the lead-type freeze (read/write + the rung-1 predicate),
the queue's `nextStep` suite, the renderer suite (lead conditions, the Phase 1 malformed-token guard,
the four tokens), and the `platformFromOrderUrl` characterisation against HEAD — **all exit 0**.
Included: all 7 Phase 1 malformed cases still caught, its 3 valid cases still not flagged, the four
tokens still valid, 12 tokens, 9 conditions.

⚠️ **One harness reported a false failure** — a prior harness copied into the same directory had
overwritten it. Diagnosed as a clobbered file, restored, re-run, exit 0. **Not a regression, and worth
saying rather than silently re-running.**

## V5 · The modal's mobile rounds 1–3

🧪 `max-sm:` classes **removed vs HEAD: 0**. `ProspectMetaFacts` ×3, the `contents max-sm:hidden`
wrapper ×1, the `sm:hidden` phone copy ×1, `max-sm:grid-cols-2` ×1, `max-sm:min-w-0` ×10.

## V6 · No template row was written

🧪 The two writers are the seed migration (`on conflict (slug) do nothing`, needs a human in the SQL
editor) and the Templates tab route (needs a browser with an admin session). **Neither was invoked.**
The new migration adds two **nullable** columns and sets no value; both dropdowns default to `— any —`,
which is the stored NULL.

## V7 · tsc and lint

`tsc --noEmit -p .` → **exit 0**.

```
                                         HEAD    now
@typescript-eslint/no-explicit-any         18     18
react-hooks/set-state-in-effect            11     11
react-hooks/immutability                    1      1
react-hooks/exhaustive-deps                 1      1
@typescript-eslint/no-unsafe-function-type  1      1
@typescript-eslint/no-unused-vars           1      0   ← removed by an earlier task, already declared
```
🧪 The two new files contribute **zero**.

🔴 **AN INTERMEDIATE STATE ADDED TWO FINDINGS AND THEY WERE FIXED, NOT DECLARED:**
1. **`react-hooks/refs`** — `dirtyRef.current = dirty` written during render. Moved into an effect.
2. **`set-state-in-effect` 11 → 12** — a mount effect reading the globals. Replaced with lazy `useState`
   initialisers. ⚠️ **The SSR argument is spelled out in the code**, because the sibling file
   deliberately does the opposite: everything those values feed sits behind
   `{allPlaceholders.length > 0 && …}`, and `allPlaceholders` derives from `rows`, which starts `[]` —
   so on the server *and* on the hydration render that block renders nothing. **If that gate is removed,
   they must go back to restore-after-mount.**

---

# CHECKLIST

### First — Phase 0
- **P1.** 🔴 Run `notify pgrst, 'reload schema';` (§SQL 1). Reload the outreach console. The prospect
  panel's **Lead type** control should stop being greyed and its label should read **(live)** rather than
  disabled — that is `hasLeadTypeFreeze` turning true.
- **P2.** If it is still greyed, the server log now names the reason: `PGRST204`/`PGRST205` = the cache
  is still stale; `42703` = the column really is missing. **Tell me which code appears.**

### The compose window
- **C1.** 🔴 Open Compose, pick a template, **type in the body**, then click the dark area outside the
  window. **Nothing should happen and the draft should still be there.**
- **C2.** With that draft, press **Escape**. Nothing should close — not the compose window, and **not the
  prospect panel underneath it**.
- **C3.** Open Compose and press Escape **without typing**. It should close (nothing was lost).
- **C4.** **Close** always works. **Log** still leaves the window open with the button marked logged.
- **C5.** Type into a placeholder field, then press Escape — it should decline, same as C2.

### Template tagging (after the migration)
- **T1.** Run `20260915_outreach_template_tags.sql` **and its `notify` line** (§SQL 2). The Templates tab
  should show **Serves rung** and **Serves lead type**, both at **— any —**, both enabled.
- **T2.** 🔴 **Before tagging anything**, send as normal. Everything must behave exactly as today — that
  is the untagged path, and it is the one all 9 templates are on.
- **T3.** Tag a chaser as **Chase 1**. Open Compose on a prospect, pick it, and check the grey line:
  *"This template logs as Chase 1, not First contact"*. Log it, then open the history — 🔴 **it should
  read Chase 1**. That is the Pizza Mondo defect fixed.
- **T4.** Tag two templates for the same rung; the one with the **lower sort order** should be the one
  pre-selected from the due queue.

### Global defaults
- **G1.** Templates tab → the violet **Global defaults** box lists every `[[placeholder]]`. Type your
  rate into `[[my rate]]` and **Save globals**.
- **G2.** Compose with a template that has no default of its own — the field should be pre-filled with a
  violet **FROM GLOBAL** badge.
- **G3.** Set a default on one template for the same placeholder. That template should now show the blue
  **FROM DEFAULT · date** badge instead. 🔴 **Template beats global.**
- **G4.** ⚠️ It is stored in this browser only. Another machine will show the boxes empty.

### The list
- **L1.** The table should open sorted by **Next action, newest first**: the furthest-future date on top,
  the most overdue **ninth**, and 222 dashes below. **If you want the most overdue first, say so — it is
  one word.**
- **L2.** Click a date — the prospect panel should open. An empty `—` is not clickable.

---

# SQL — for Dominic to run; **nothing here was executed**

🔴 **None of this writes to `outreach_templates`.** No `insert`, no `update`, no `delete` against that
table appears below.

**1 · 🔴 PHASE 0 — THE ONE ACTION. Safe, idempotent, and the likeliest fix:**

```sql
notify pgrst, 'reload schema';
```

Then confirm the app can now see the column (this is a READ; it returns a count, not rows):

```sql
select count(*)                                                as prospects,
       count(p.lead_type_at_first_contact)                     as already_frozen,
       count(*) - count(p.lead_type_at_first_contact)          as still_live_derivation
  from public.outreach_prospects p;
```

⚠️ `already_frozen` should be **0** today — nothing has been frozen because the write has never fired.
It should start rising as first contacts are logged once the flag flips true.

**2 · PHASE 2 — the tagging migration. 🔴 Run the `notify` line too, per Phase 0:**

```sql
set lock_timeout = '3s';

begin;

alter table public.outreach_templates
  add column if not exists serves_kind      text,
  add column if not exists serves_lead_type text;

comment on column public.outreach_templates.serves_kind is
  'Which rung of the contact ladder this template is written for: 1_first_contact | 2_chase_1 | '
  '3_chase_2 | 4_final_chase. NULL = any rung. When set, choosing this template in the compose window '
  'also sets the logged contact kind. Unconstrained text by the no-CHECK rule — validated by isKind.';

comment on column public.outreach_templates.serves_lead_type is
  'Which lead type this template is written for: hu_ordering | hu_map | on_vf | not_listed. '
  'NULL = any. Used to prefer a template when pre-selecting for a due prospect. Unconstrained text by '
  'the no-CHECK rule — validated by isLeadType.';

commit;

notify pgrst, 'reload schema';
```

🔴 **This sets no value on any row.** Both columns arrive NULL on all 9 templates, which means "any",
which is the behaviour you have today. **Tagging is yours to do in the UI.**

**3 · What each template currently looks like, before you tag anything** — a READ, so you can decide
which rung each serves without opening nine editors:

```sql
select t.slug,
       t.label,
       t.channel,
       t.sort_order,
       t.active,
       length(t.body)                                                       as body_chars,
       (t.body like '%?lead_%')                                             as uses_lead_conditions,
       (t.body like '%[[my rate]]%' or coalesce(t.subject,'') like '%[[my rate]]%') as uses_my_rate,
       (t.body like '%{{demo_link}}%' or coalesce(t.subject,'') like '%{{demo_link}}%') as uses_demo_link
  from public.outreach_templates t
 order by t.active desc, t.sort_order, t.slug;
```

⚠️ 🔴 **`uses_lead_conditions` is the column to read against the Phase 2 warning.** A template that
carries `?lead_*` lines should generally be left at **Serves lead type = — any —**, because those lines
already vary its text per type. Tagging it for one type would leave the other three lines dead in every
message it sends.

**4 · The Pizza Mondo row and anything shaped like it** — outbound contacts recorded as a first contact
where an earlier one already exists. 🔴 A READ only; fixing a row is yours:

```sql
with ranked as (
  select oc.prospect_id,
         oc.id,
         oc.contacted_at,
         oc.kind,
         row_number() over (partition by oc.prospect_id order by oc.contacted_at, oc.id) as seq
    from public.outreach_contacts oc
   where oc.direction is distinct from 'inbound'
)
select t.name,
       r.contacted_at::date as contacted_on,
       r.kind,
       r.seq                as position_in_sequence
  from ranked r
  join public.outreach_prospects p on p.id = r.prospect_id
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
 where r.kind = '1_first_contact'
   and r.seq > 1
 order by t.name, r.contacted_at;
```

⚠️ Every row here is an outbound contact logged as a **first contact** that was not the first one — the
shape of the Pizza Mondo defect. **A clean result does not mean it never happened**: a chaser logged as
a first contact when it genuinely *was* the first outbound row would not appear.
