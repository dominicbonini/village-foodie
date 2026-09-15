# The template editor as 1-2-3, plus four defects

**15 September 2026.** One file written: `components/admin/TemplatesPanel.tsx`. **No schema change, no
migration, no SQL run, no `outreach_templates` row written by code.** tsc clean; lint identical to HEAD.

---

## 1. 🔴 THE ONE-LINE FIX, FIRST, AS ASKED

```ts
setRows(rs => [...rs, out.template]); setSelId(out.template.id)
setView('templates')        // ← this line
```

**Why it was broken.** The **New template** button is rendered in the header row *above* the view switch,
so it is clickable from the Snippets view. `createTemplate` set `rows` and `selId` but **never** called
`setView` — and the editor lives in the other branch of `view === 'snippets' ? … : ( … )`, which is not
rendered there. The row was inserted, selected, and drawn nowhere. The only evidence was the toast, which
clears itself after **1800ms**. That is exactly what happened to Dominic.

Creating from the Templates view sets a value it already holds, so it is a no-op there.

---

## 0. PREMISES — every one in the brief holds, and one thing is worth adding

**0.1 Nothing is committed.** `git log --oneline -5` still shows **`4d4e5b6`** at HEAD. What Dominic is
about to commit together is:

| | File | From |
|---|---|---|
| M | `components/admin/TemplatesPanel.tsx` | Snippets build **+ this task** |
| M | `components/admin/ComposeWindow.tsx` | Snippets build |
| M | `components/admin/OutreachPanel.tsx` | Snippets build |
| M | `lib/outreach-template-render.ts` | Snippets build |
| D | `lib/outreach-globals.ts` | Snippets build |
| ?? | `lib/outreach-snippets.ts`, `app/api/admin/outreach-snippets/`, `supabase/migrations/20260916_outreach_snippets.sql` | Snippets build |
| ?? | four `docs/*.md` reports | reviews |

🧪 **Only `TemplatesPanel.tsx` was written by this task** — mtimes: `TemplatesPanel.tsx` **15:38**,
every other file in the set **11:41–11:55**, roughly four hours earlier. (An earlier `find -newermt`
attempt returned nothing *and its positive control also returned nothing*, so that search was broken and
its empty result is not quoted as proof; the mtimes are.)

**0.2 The 1-2-3 mapping is confirmed, as my own review found.** `label` / `channel` + `serves_kind` +
`serves_lead_type` / `subject` + `body` are one row, already in that order. **No schema change was needed
and none was made.**

**0.3 The probe — what it needs.** READ, `tagColumnsExist`:

```ts
const { error } = await supabase.from('outreach_templates').select(TAG_COLS).limit(1)
if (!error) return true
```

It is a `select` on the two columns. **A column that does not exist and a PostgREST schema cache that has
not reloaded fail it in exactly the same way.** Dominic has confirmed the columns exist, so if the two
dropdowns are still greyed, it is the cache. **No second migration is needed or written** — the fix is
`notify pgrst, 'reload schema';` (§8 SQL A). The on-screen message used to name only the migration; it now
names **both** causes and puts the reload first, because it is the likelier one and costs nothing to try.

**0.4 ⚠️ ONE SHARED FILE IS NOW READ BY THIS PANEL — flagged, not modified.** `lib/whatsapp-hint.ts`
(`phoneWhatsApp`) is shared with `components/EventListCard.tsx`, the **customer-facing** call/message
button. `TemplatesPanel` now imports it, **read-only**, for one reason: `nextStep` needs `waPhone` to
decide a prospect's channel, and `OutreachPanel` already builds it with the identical call. A second
derivation here would be a second answer to "who is reachable on WhatsApp". 🧪 `lib/whatsapp-hint.ts` has
**zero diff** — its mtime is untouched and it is not in the change set above.

**0.5 Out of scope, stated in one line as asked:** the Snippets library is still **derived** from
`[[…]]` in bodies, so a stray `[[bracket]]` pasted into a message still becomes a snippet row.

---

## 2. THE EDITOR — three numbered sections

**Grouped sections on one screen, not a stepper.** The brief invited a reason a stepper might be needed;
there is none, and there is a reason against it: a wizard runs once, at creation, and Dominic spends most
of his time editing templates that already exist. These sections are **the editor** — identical markup for
a brand-new row and a ten-month-old one.

🧪 **Proved, not asserted:** the Template name input, the Message box and both Serves dropdowns each
appear **exactly once** in the file. A separate creation form would mean a second copy, and that is the
thing that would drift.

| | Heading | Visible sentence | Fields |
|---|---|---|---|
| **1** | **Name it** | "This name is for you… **Nobody you contact ever sees it.**" | Template name (+ the slug, greyed) |
| **2** | **When to use it** | "When a truck is due… **if that matches the three settings below, this template is the one it opens for you.**" | Send by · At which stage · For which trucks · **the match count** |
| **3** | **Write it** | what `{{braces}}` and `[[brackets]]` mean | Subject (email only) · Message · the snippet line |

🔴 **The explanations were already written — as `title=` tooltips, which is to say they did not exist.**
A tooltip needs a hover and a wait, never appears on a touch screen, and is invisible to anyone who does
not already know it is there. The same sentences are now on the page.

**Order changed:** the read-only snippets block used to render **above** the template's own name. It now
sits under the message it describes (§7).

---

## 3. LANGUAGE — labels only, and the stored values are provably unchanged

| Was | Now |
|---|---|
| `Label` | **Template name** |
| `Channel` → `email` / `whatsapp` | **Send by** → **Email** / **WhatsApp** |
| `Serves rung` | **At which stage** |
| `Serves lead type` | **For which trucks** |
| `— any —` (rung) | **Never picked automatically** |
| `— any —` (lead type) | **Any truck** |
| `Body` | **Message** |
| `Snippets used here` | **Values this message fills in** |
| `asked per truck` | **you are asked each time** |

**The rungs already read in Dominic's words** — `kindLabel` renders *First contact · Chase 1 · Chase 2 ·
Final chase*. Unchanged, and still supplied by `kindLabel`.

**The four lead types** get plain wording from a **new local map**, `LEAD_TYPE_PLAIN`:
*On Hatches Up, taking orders · On Hatches Up, map only · On the Village Foodie map · Not listed
anywhere*. Its keys are typed `Record<LeadType, string>`, so it cannot drift from the real union.
🔴 **`LEAD_TYPE_LABELS` is NOT touched** — the outreach list and the compose window render it, and two
screens disagreeing about a truck's description would be worse than either wording.

### 🔴 The two "— any —" options do NOT mean the same thing, and the labels now say so

READ, `templateForStep`:

```ts
t.servesKind === step.kind
&& (t.channel === undefined || t.channel === step.channel)
&& (t.servesLeadType == null || t.servesLeadType === step.leadType)
```

`servesLeadType` null **is** a wildcard. `servesKind` null is **not** — it never equals a rung, so an
untagged template is never picked automatically at all. Labelling both "— any —" was the more misleading
of the two, because the operator would wait for a match that cannot come. The rung's null now reads
**"Never picked automatically"**.

### Why the lists stay in code — the honest answer, unchanged from the review

`leadTypeOf` decides a truck's type with a fixed predicate over `hu_ordering` / `hu_map` /
`isOnVillageFoodieMap`. **A fifth type typed into a settings screen would have no branch there, so no
truck could ever derive to it, and a template tagged with it would silently match nobody.** The fix for
"these seem hardcoded" is that the wording is plain and the explanation is on the page — not a dropdown
that can be filled with dead entries.

---

## 4. THE MATCH COUNT

Under section 2: **"Matches 105 trucks due now."**

**Where it comes from.** Two memos, both driving the **real** functions:

- `steps` — `nextStep({ ...p, waPhone: phoneWhatsApp(p.phone, null).waPhone }, p.contacts)` for every
  prospect. The identical call `OutreachPanel` makes.
- `match` — calls **`templateForStep`**, the matcher the compose window's pre-selection uses.

**Nothing re-implements either.** A second copy would agree on the day it was written and drift
afterwards, and the drift would surface as a count that quietly disagreed with what the composer opened.

🔴 **The sentinel, and why it is load-bearing.** `templateForStep` falls back to the hardcoded
`STEP_TEMPLATE` map when no tagged template matches, and then returns *that* slug. Probing with the
template's own slug would therefore count a **fallback** hit as a **tag** match — and a template whose
slug happened to be `chaser_email` would read as matching everything. The probe id is
`'@@match-probe@@'`: `@` cannot appear in a slug (the route validates `^[a-z0-9_-]{3,60}$`) and appears
in no `STEP_TEMPLATE` entry, so the fallback can only ever return `slug_absent`, making
`slug === PROBE_ID` true **if and only if** the tag branch matched.

**Cost per keystroke: none.** `steps` is keyed on `prospects` alone — computed once per load. The count is
keyed on the three rule fields only, so typing in Name, Subject or Message recomputes **nothing**.
Changing a dropdown walks the prospect list once.

**Three states, deliberately distinct:**

| State | What it says |
|---|---|
| Rung not set | "Not picked automatically. You can still choose it by hand." — **not** a zero |
| Prospects not loaded | "Counting needs the prospect list — it has not loaded, so this is not a zero." |
| 0 matches | "**No trucks match this right now.** Nothing is broken… It will pick up trucks as they become due." |
| n matches | "Matches **n** trucks due now" + a note that a same-tagged template higher in the list wins |

---

## 5. THE TWO SILENT DATA LOSSES

### 5.1 The subject — **hidden, not discarded, and the warning names what saving will do**

The brief offered "hide rather than discard, **or** warn — say which and why". **Both, and here is why
hiding alone would have been a lie:** the value is destroyed by the **route**, not the form —
`update_template` sets `subject = null` whenever the patch carries `channel: 'whatsapp'`. So hiding the
field while leaving the route alone would still have lost the text on save, silently, exactly as before.

What happens now: the draft **keeps** the subject (🧪 proved — the channel handler writes `channel` and
nothing else), switching back to Email brings it straight back, and while WhatsApp is selected with a
subject present an amber panel quotes the text and says **"Saving while this is set to WhatsApp will
clear it permanently."** He can still do it; he cannot do it unknowingly.

### 5.2 The unsaved draft — held, never dropped

**What happens if Dominic switches anyway: nothing happens until he answers.** The click is *held*, not
applied and not thrown away. The editor still shows his work and a bar offers exactly three outcomes:

- **Save, then switch** — 🔴 switches **only if the save actually succeeded**. `saveDraft` now returns a
  boolean; a failed write leaves him where he is, with the draft intact. Pressing a button labelled
  "Save" must never be how work is lost.
- **Discard my changes** — the only path that loses anything, and it says so.
- **Stay here.**

`dirty` is a **field-by-field comparison against the stored row**, not an onChange flag: typing a
character and deleting it again is not dirty, and a guard that cries wolf is a guard people learn to click
through. `?? null` on both sides, so `null` vs `''` never reads as a change. Every selection goes through
`requestSelect` — there is exactly one place the guard could be bypassed, and it is not bypassed.

---

## 6. THE SNIPPET LINE

Under the message: each `[[name]]` the body uses, with its current value, or **"you are asked each
time"** (blank on purpose) or **"not set — you are asked each time"**. Read-only, with one button to
Snippets. An editable box here would recreate the one-value-four-edits problem on the screen that
replaced it. A legacy `placeholder_defaults` value that a snippet now overrides is still named in amber —
nothing deletes it, because nothing here writes a template row.

---

## 7. THE DEAD ↑/↓ ARROWS

**The old body swapped the two rows' `sort_order` values.** 🧪 `chase-1` and `wa_chaser` both sit at 999
(Dominic's figure), and swapping 999 with 999 writes 999 over 999 — two posts, a reload, and nothing
moved. Every template the tab creates gets 999 from the route, so **the arrows were dead on every row the
tab itself made.**

**The fix stops moving values and starts assigning positions.** Build the order the operator asked for,
then number it 10, 20, 30… A position is unambiguous where a swap is not, so a move **always** reorders —
including when every row shares one value. The list now sorts with the **same comparator**, tie-break
included, so the list and the arrows cannot disagree about which row sits where.

### 🔴 What this writes, stated plainly

**It writes only the rows whose number actually changes** — 🧪 moving one of the two tied rows writes
**those two rows and nothing else**. But it is more than the old one wrote, so: **`sort_order` is still
only ever written by this click.** Nothing renumbers on load, on save, on mount, or in a migration, and
**no migration in this task touches `outreach_templates`**. If a one-off tidy of the stored numbers is
wanted, §8 SQL B is Dominic's to run — this code will not do it for him.

---

## 8. SQL FOR DOMINIC — I have not run any of it

**A. 🔴 If the two dropdowns are still greyed out, this is almost certainly it.** The columns exist
(Dominic verified today), so the probe is failing on a stale schema cache, not a missing column.

```sql
notify pgrst, 'reload schema';
```

Then reload the Templates tab. To confirm the columns really are there:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_templates'
  and column_name in ('serves_kind', 'serves_lead_type');
```

**B. Optional, and only if you want the stored numbers tidy.** The arrows work without this — it just
makes the starting numbers even. 🔴 It writes every template row, so it is yours to run, not the app's.
**Run the SELECT first.**

```sql
-- 1. LOOK: what the renumber would set.
select slug, label, sort_order,
       row_number() over (order by sort_order, slug) * 10 as would_become
from public.outreach_templates
order by sort_order, slug;

-- 2. Only if step 1 reads correctly.
with ranked as (
  select id, row_number() over (order by sort_order, slug) * 10 as n
  from public.outreach_templates
)
update public.outreach_templates t
   set sort_order = ranked.n, updated_at = now()
  from ranked
 where ranked.id = t.id and t.sort_order <> ranked.n
returning t.slug, t.sort_order;
```

**C. What the tab is working from**, if a figure ever needs checking:

```sql
select slug, label, channel, active, sort_order, serves_kind, serves_lead_type,
       length(body) as body_chars
from public.outreach_templates
order by sort_order, slug;
```

---

## 9. VERIFICATION — 43 assertions, every harness pointed at a broken variant first

For each: **what a green-but-meaningless result would look like, and how it was excluded.**

### 9.1 The match count — 3 controls, 8 assertions

*Meaningless green:* a fixture with one prospect per lead type gives 1, 1, 1, 1 — and a matcher that
ignored lead type entirely produces exactly those four numbers. **This actually happened on the first
run and controls C2/C3 caught it.** The fixture was rebuilt with deliberately unequal counts — 3 / 1 / 2
/ 4 — so a wrong answer is visibly wrong.

```
── CONTROLS (each must FAIL) ──
  ✓ FAILED as required  C1 probe id = a real STEP_TEMPLATE slug (general_email) → count must be WRONG
  ✓ FAILED as required  C2 treating a specific lead type as a wildcard → per-type counts must differ
  ✓ FAILED as required  C3 all four per-type counts identical → assertion would be vacuous

── PER LEAD TYPE (first contact, email) ──
  hu_ordering  count 3  · independently expected 3
  hu_map       count 1  · independently expected 1
  on_vf        count 2  · independently expected 2
  not_listed   count 4  · independently expected 4
  "Any truck" → 10  · sum of the four types → 10
✅ all 8 passed
```

⚠️ **3 / 1 / 2 / 4 is a FIXTURE, invented to exercise the four branches. It is not the database's
distribution and is not reported as one.** Dominic's live split (17 / 105 / 25 / 84) is his figure; it is
not hardcoded anywhere and nothing here re-derives it.

C1 is the one that matters: probing with a real `STEP_TEMPLATE` slug makes the fallback branch answer for
every prospect, inflating the count to everybody — which is precisely what the sentinel prevents.

### 9.2 🔴 The labels changed; the stored values did not — 2 mutation controls, 5 assertions

*Meaningless green:* asserting the file still contains the strings `CONTACT_KINDS` and `LEAD_TYPES` would
pass even if the option **value** had been swapped for the label — the exact defect that would silently
mis-tag templates. So the harness extracts the `value=` **expression** from each `<option>` and is pointed
at mutated copies first.

```
  ✓ FAILED as required  M1 rung option value replaced by its label
  ✓ FAILED as required  M2 lead-type option value replaced by its label

  rung  <option value={k}>{kindLabel(k)}
  lead  <option value={lt}>{LEAD_TYPE_PLAIN[lt]}
  CONTACT_KINDS = ['1_first_contact', '2_chase_1', '3_chase_2', '4_final_chase']
  LEAD_TYPES    = ["hu_ordering","hu_map","on_vf","not_listed"]
✅ all 5 passed
```

Both dropdowns write the raw loop variable. `LEAD_TYPE_LABELS` is not redefined in the panel.

### 9.3 The reorder — the OLD code is the broken variant, 8 assertions

*Meaningless green:* a fixture whose rows all have distinct `sort_order` would pass with the old swap too.
So the fixture reproduces the tie, and the **old function is run first and must fail**.

```
── CONTROL (must FAIL) ──
  before: hu_rate_email general_email chaser_email wa_intro wa_chaser_seed chase-1 wa_chaser
  after : hu_rate_email general_email chaser_email wa_intro wa_chaser_seed chase-1 wa_chaser
  ✓ FAILED as required — the OLD swap moved nothing (999 over 999)

── THE NEW move ON THE SAME TWO TIED ROWS ──
  after : … wa_chaser_seed wa_chaser chase-1
  rows written: wa_chaser, chase-1
✅ all 8 passed
```

⚠️ One edge assertion failed on the first run — **my test was wrong, not the code**: it picked "the last
row" with a comparator that lacked the slug tie-break, so it chose `chase-1` rather than `wa_chaser` and
a legitimate move looked like a violated no-op. Fixed to use the display comparator.

### 9.4 The guard and the structure — 2 controls, 22 assertions

*Meaningless green:* a `dirty()` stubbed to `false` lets everything through, and the old unguarded select
switches regardless. Both are run first and both fail.

Covers: a clean draft switches; a **dirty** draft does **not**, holds the request, and keeps the text;
typing-and-undoing is not dirty; `null` vs `''` is not dirty; the three sections appear in order 1-2-3;
the match count renders between sections 2 and 3; the snippet line sits after the message; the channel
handler writes `channel` and nothing else; `createTemplate` reaches `setView('templates')`; and **each
field exists exactly once**, which is the real test of "one code path for create and edit".

⚠️ One assertion was wrong and was replaced rather than reported: counting `{selected && (` and expecting
**one** — there are two, and the second is the pre-existing Preview/Tokens **rail**, which my own
snippets report already recorded. Counting the fields is the claim I actually meant.

### 9.5 Nothing else moved

- **No `outreach_templates` row written by code.** Every `insert`/`update` on that table sits in
  `app/api/admin/outreach-templates/route.ts`, which `git diff --stat` shows is **unmodified**. Each is
  reached only by a click. *Positive control:* the same grep shape finds the snippets route's own
  `.upsert(` and `.delete(`.
- **Snippets library:** the previous build's harness re-run against the current tree — **15/15**, with
  its four controls still failing first.
- **Compose window:** no `onMouseDown`/`onPointerDown` handler exists, so outside-click still does not
  close it. *Positive control:* `onClose` is still referenced 7× by the explicit buttons. The file's
  mtime is four hours old — untouched by this task.
- **tsc:** clean. **Lint:** the four files present in both trees, same eslint and config, HEAD
  (`4d4e5b6`) in a detached worktree vs the working tree — **19 errors / 1 warning on both sides, every
  rule count identical.**

⚠️ **One process note, for confidence in the file itself.** A scripted edit mid-task used a replacement
string containing `` $` ``, which JavaScript's `String.replace` treats as a substitution token — it
spliced a copy of the file's first 194 lines into the middle. It was caught immediately by `tsc`
(duplicate identifiers), repaired surgically rather than by reverting (a revert would have destroyed the
uncommitted Snippets build), and integrity re-checked: every key symbol — `SnippetsLibrary`,
`TemplatesPanel`, `createTemplate`, `saveDraft`, `move`, `toggleActive` — appears exactly once, and all
43 assertions above ran against the repaired file.

---

## 10. A CHECKLIST DOMINIC CAN WALK

Templates tab, in order. Anything that does not behave as written is a defect in this build.

1. **Switch to Snippets. Press New template.** Name it something throwaway.
   → You land in the **Templates** view with the new row selected and its editor open. *(§1)*
   ⚠️ It is still created immediately — that is unchanged and out of scope. You now have one to delete.
2. **Look at the editor.** Three numbered headings: **1 Name it · 2 When to use it · 3 Write it**, each
   with a sentence under it. Section 1 says the name is for you and nobody you contact sees it.
3. **Click an existing template — say "General approach".** The same three sections, same order. There
   is no separate creation form.
4. **Section 2 dropdowns.** If **At which stage** and **For which trucks** are greyed, read the amber
   note and run **§8 SQL A** (`notify pgrst, 'reload schema';`), then reload the tab.
5. **Set "At which stage" to First contact.** A count appears: *"Matches N trucks due now."*
   Change **For which trucks** through the four options — the number should change with each.
   Set the stage back to **Never picked automatically** — it should say so, **not** "0".
6. **Type something in the Message, then click another template in the list.**
   → The amber **Unsaved changes** bar appears. Nothing has switched. Press **Stay here** — your text is
   still there. Press it again and choose **Save, then switch**. *(§5.2)*
7. **Type a Subject on an email template, then change "Send by" to WhatsApp.**
   → The Subject box hides and an amber panel quotes your text and warns that saving will clear it.
   Switch back to **Email** — your subject is back, exactly as typed. *(§5.1)*
8. **Find the two templates sitting at the bottom** (the ones at 999). Hover one and press **↑**.
   → It moves. Press **↓** — it goes back. *(§7)*
9. **Scroll below the Message.** "Values this message fills in" lists each `[[name]]` with its value or
   "you are asked each time", with one button through to Snippets.
10. **Open Snippets.** Your two rows are still there and still save. Open a prospect and the compose
    window; click outside it — it must **not** close.
11. **Delete the throwaway from step 1** when you are done — there is still no delete button, so that is
    SQL, as before.

---

## 11. Scope

One file written: `components/admin/TemplatesPanel.tsx`. No schema change, no migration written or
applied, no SQL executed, no database read. No `outreach_templates` row created, edited, seeded,
activated or deactivated by code — `sort_order` is written only by Dominic's own click on ↑/↓, and §8
SQL B is his to run or ignore. `createSlug` unchanged. `lib/whatsapp-hint.ts` imported read-only and
unmodified. `LEAD_TYPE_LABELS`, `CONTACT_KINDS`, `LEAD_TYPES`, `kindLabel` and every stored string
unchanged. Nothing staged, committed or reverted.
