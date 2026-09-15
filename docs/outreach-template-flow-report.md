# Making template creation and editing understandable

**READ-ONLY REVIEW. 15 September 2026.** No file changed except this report. No migration, no SQL run,
no database read. Facts and options only.

---

## 0. PREMISES — one of the brief's is CONFIRMED, and one of MY OWN is WRONG

### 0.1 🔴 THE CENTRAL OBSERVATION IS CONFIRMED. This is a form-ordering problem with no schema change.

The brief asks me to test, not assume, whether Dominic's three steps map onto columns that already exist
on one `outreach_templates` row. **They do.** READ, from the editor pane in source order:

| Dominic's step | Field on screen today | Column |
|---|---|---|
| **1. the rule name** | `Label` | `label` |
| **2. the rules** | `Channel`, `Serves rung`, `Serves lead type` | `channel`, `serves_kind`, `serves_lead_type` |
| **3. the template** | `Subject`, `Body` | `subject`, `body` |

🔴 **And they are already in that order.** The editor renders Label + Channel, then the two Serves
dropdowns, then Subject, then Body. Dominic's 1‑2‑3 is not a change of sequence — **the sequence is
already right.** What is missing is that nothing on screen says these are three steps, or what step 2
does. **No new table, no new column, no schema change is needed for §B.** See §B for what actually is.

One thing sits *above* Label and breaks the reading: the read-only **"Snippets used here"** block, which
my own Snippets build put at the top of the editor. It is step 3 material rendered before step 1.

### 0.2 🔴 A NUMBER IN MY OWN LAST REPORT IS WRONG — `docs/outreach-templates-ux-report.md` §D.

I wrote that the Templates tab is capped by the admin shell's `max-w-6xl`, giving "1120px usable" and
"editor 424px, preview 424px". **That is wrong.** I assumed the tab sat inside the shell wrapper at
`app/admin/page.tsx` without checking the nesting.

READ, and this time counted: the shell wrapper `w-full min-[1400px]:max-w-6xl …` **closes at line 1341**
(verified by tracking `<div>`/`</div>` depth from its opening line to zero). The templates block at
`{adminTab === 'templates' && (` is a **sibling** with its own wrapper:
`w-full max-w-[1800px] mx-auto px-4 py-6`.

**Corrected:** the tab is capped at **1800px**, not 1152px.

| Viewport | Content width | Rail | Editor | Preview |
|---|---|---|---|---|
| 1440px laptop | 1440 − 32 = **1408px** | 240px | **568px** | **568px** |
| ≥1800px | 1800 − 32 = **1768px** | 240px | **748px** | **748px** |

🔴 **What survives the correction is the finding that mattered: the rail is a fixed `240px` track at
every viewport width.** Widening the window gives every extra pixel to the editor and preview and none
to the list. The rail arithmetic in that report was right; the column figures were not.

### 0.3 Nothing new is committed.

`git log --oneline -5` still shows **`4d4e5b6`** at HEAD, exactly as at the last report. The Snippets
build — `TemplatesPanel`, `ComposeWindow`, `OutreachPanel`, `outreach-template-render`, the deleted
`outreach-globals`, the snippets route, module and migration — is **still working-tree only, still
uncommitted, and `20260916_outreach_snippets.sql` is still unapplied.** Dominic is evidently running the
working tree, since he describes using the Snippets view.

### 0.4 A small one: the starter body is `'Hi,\n\n'`, not `'Hi,'`.

Dominic reports the accidental `Test` has body `Hi,`. READ: `createTemplate` posts `body: 'Hi,\n\n'` —
five characters, the two trailing newlines invisible on screen. Same row, same problem; noting it only so
the `length(body) = 5` test in §7 SQL reads correctly.

### 0.5 What I cannot see.

The 8 templates, the second `Test`, and whether the tag migration is applied are **database state**. I
cannot read a database. Dominic's figures are used as his and labelled as such. §7 has SQL.

---

## 1. Admin-only surface

**Confirmed by symbol.** `TemplatesPanel` is imported at `app/admin/page.tsx:25` and mounted at :1350 —
that one site. `/api/admin/outreach-templates` is fetched only from `TemplatesPanel` and `OutreachPanel`,
both under `app/admin/`; both handlers open with `verifyAdmin` and 404 a non-admin.

⚠️ **`createSlug` is shared with two customer paths** — `lib/utils.ts:177`, imported by
`lib/provision-truck.ts:17` and `lib/demo-session.ts:10` (truck provisioning, demo sessions). **No option
below proposes changing it.** Where a different slug rule is wanted, the caller should post an explicit
`slug`; the route already validates `^[a-z0-9_-]{3,60}$` itself.

---

## A. THE CREATION FLOW

### A.1 What New template does, step by step (READ, `createTemplate`)

1. `window.prompt('Name for the new template:')` — **one browser prompt, one field.**
2. `createSlug(name)`; reject under 3 characters.
3. De-duplicate against the rows **loaded in this browser**: `for (let n = 2; taken.has(slug); n++)`.
4. 🔴 `post({ action: 'create_template', slug, label: name, channel: 'email', body: 'Hi,\n\n' })` —
   **the row is in the database here.** No draft, no confirmation, no undo.
5. `setRows(rs => [...rs, out.template])`, `setSelId(out.template.id)`, `say('Created …')`.

Route defaults (READ): `sort_order` → **999**; `channel` anything-but-`whatsapp` → `email`; `active`
is not set, so the column default **true** applies — **the blank is in the compose dropdown immediately.**

There is **no delete**, in the UI or the API. *Search:* `delete_template|onDelete|Delete` in
`TemplatesPanel.tsx` and the route — no hit. *Positive control:* the same search shape finds
`forget_snippet` in the snippets route, so it detects delete actions.

**So the orphan problem is structural, not accidental.** Dominic deleted two rows by hand and immediately
made a third the same way, because step 4 has no gate in front of it.

### A.2 🔴 Why clicking it from the Snippets view leaves the row invisible — precisely

Three READs, and the defect is the third:

1. The **New template** button is rendered in the header row *above* the view switch, outside the
   `view === 'snippets' ? … : ( … )` conditional. **It is therefore visible and clickable in both views.**
2. `createTemplate` calls `setRows`, `setSelId` and `say`. It **never calls `setView`.** The only two
   `setView` calls in the file are the switch buttons themselves and the editor's "Edit in Snippets"
   button.
3. The editor that would display the new row lives in the `: ( … )` branch — **not rendered while
   `view === 'snippets'`.**

**Result:** the row is inserted, selected, and drawn nowhere. The only feedback is the toast — `fixed
bottom-4 left-1/2`, rendered outside the view conditional so it *does* appear, for **1800ms** (READ:
`setTimeout(() => setToast(null), 1800)`). A row was created in the database and the evidence expired in
under two seconds, on a screen that cannot show it.

This is my build's defect: I added a view switch and left a creation button straddling it.

### A.3 Options

| | What | Orphans | Cost |
|---|---|---|---|
| **0. One line: `setView('templates')` in `createTemplate`** | switch to the view that can show the row | 🔴 none prevented | 🟢 **Trivial.** Fixes A.2 entirely and nothing else |
| **1. Dialog first — label + channel + the two rule fields, then Create** | nothing written until Create | 🟢 **Eliminates them.** Cancel writes nothing | A real form where a `window.prompt` is. 🟢 Also the natural home for §B step 1–2 and §G duplicate |
| **2. Create only on first save** | hold a draft row client-side | 🟢 **Eliminates them** | 🔴 Two kinds of "selected template": every control (↑↓, ⦸, tags, snippets read-out, preview) needs a has-no-id branch |
| **3. Keep immediate creation, add delete** | pair with the missing delete | 🔴 **Rarer, not eliminated** — cures rather than prevents | 🟢 Cheap, and delete is wanted anyway |
| **4. Insert `active: false`** | new templates start retired | 🔴 Row still created | 🟢 One line in the route. 🔴 An extra click on every real template, and it does not remove the row, its rail entry, or its snippets |

**Eliminates orphans entirely: 1 and 2.** Option 1 does it without inventing a second row-state, which
is why it costs less than 2 despite looking bigger. Option 0 is not a fix for orphans at all — but it is
the one-line repair for the specific thing that confused him, and it is independent of everything else.

---

## B. THE FORM ORDER

### B.1 What the editor shows today, exactly (READ, in source order)

| # | Control | Notes |
|---|---|---|
| 1 | **Snippets used here** (read-only block) | 🔴 step-3 material, rendered first |
| 2 | `Label` + `Channel` on one row | plus the slug, greyed, `font-mono`, right-aligned |
| 3 | `Serves rung` + `Serves lead type` on one row | `disabled={!hasTemplateTags}` |
| 4 | `Subject` | hidden entirely when `draft.channel === 'whatsapp'` |
| 5 | `Body` | `rows={15}` |

**The 1‑2‑3 order is already there** (rows 2→3→4/5). Three things stop it reading that way:

- 🔴 **No group headings.** Six labels of equal weight down one pane. Nothing says "these two decide
  *when* this template is used; these two are *what it says*".
- 🔴 **The explanations exist but are invisible.** Both Serves dropdowns carry a genuinely good
  explanation — in a `title=` attribute. A tooltip needs a hover and a wait, never appears on touch, and
  is the first thing a user does not know is there. **Dominic's "no explanation of what they do" is
  accurate as a description of the screen**, even though the text has been written.
- 🔴 **The Snippets block is above everything**, so the first thing in the "name it" position is about
  the body.

### B.2 Options

| | Shape | Survives EDITING? | Cost |
|---|---|---|---|
| **1. Grouped sections in place** — three headed blocks: "1 · Name it", "2 · When to use it", "3 · What it says", with the tooltip text promoted to one visible line per group | 🟢 **Yes — identical for create and edit.** It *is* the editor | 🟢 Lowest. Markup and copy only: no new state, no new route action, no schema change. Move the Snippets block under Body |
| **2. A stepper (wizard)** | 🔴 **No.** A wizard is a creation flow; editing lands back on today's form, which is where he spends most of his time | Medium — and it leaves the actual problem unfixed |
| **3. Dialog for steps 1–2, editor for step 3** | 🟡 **Partly.** Good at creation (it is §A option 1); editing still needs the editor to explain steps 1–2 | Medium. 🔴 Only worth it *combined with* option 1, or the two halves disagree about what a "rule" is |
| **4. Reorder only** — move the Snippets block below Body, change nothing else | 🟢 Yes | 🟢 Trivial, but it does not address the "no explanation" complaint at all |

🔴 **The brief's test — "which survives editing" — eliminates the wizard.** Option 1 is the only shape
that is the same object in both modes, and option 3 is only coherent on top of it.

---

## C. THE "HARDCODED" COMPLAINT — two different things, needing different fixes

### C.1 Where each list comes from (READ)

| Dropdown | Source | Labels shown |
|---|---|---|
| `Serves rung` | `CONTACT_KINDS` = `['1_first_contact','2_chase_1','3_chase_2','4_final_chase']` in `lib/outreach.ts`, labelled by `kindLabel` → `KIND_LABELS` | **First contact · Chase 1 · Chase 2 · Final chase** |
| `Serves lead type` | `LEAD_TYPES` = `['hu_ordering','hu_map','on_vf','not_listed']` in `lib/outreach-step.ts`, labelled by `LEAD_TYPE_LABELS` | **Hatches Up — ordering · Hatches Up — map only · On the Village Foodie map · Not listed** |

Both are `as const` arrays in code. Both prepend `<option value="">— any —</option>`, which is the
stored NULL.

### C.2 🔴 Being honest: code IS the right home for these lists

READ, `leadTypeOf`:

```ts
if (p.hu_ordering === true) return 'hu_ordering'
if (p.hu_map === true)      return 'hu_map'
if (isOnVillageFoodieMap(p)) return 'on_vf'   // reads excluded, show_on_vf, futureEventCount
return 'not_listed'
```

**A lead type is not a name. It is a branch of this function.** If an operator added a fifth type through
some settings screen, there would be no branch that returns it, so **`leadTypeOf` could never produce it,
no prospect would ever carry it, and a template tagged with it would never be pre-selected for anybody.**
It would be a dropdown entry that silently switches the template off. Stated plainly, as the brief asks:
**making this list user-editable would be actively harmful, not merely expensive.**

The same holds for `Serves rung`: the four rungs are the outbound ladder `nextStep` walks. A fifth rung
would have no position in the ladder and no due-date rule.

**What configurability would genuinely cost:** a fifth lead type needs a *derivation* — the data question
that decides who is in it — and that is a code predicate over `hu_ordering`/`hu_map`/`show_on_vf`/
`excluded`/`futureEventCount`. The name is the cheap part; the predicate is the whole of it. A table of
names with no predicates behind them is worse than the current four.

### C.3 🔴 But "hardcoded" may be describing something else entirely — and it is checkable

Both dropdowns carry `disabled={!hasTemplateTags}`, where `hasTemplateTags` comes from the route's
capability probe on `serves_kind, serves_lead_type`. **If `20260915_outreach_template_tags.sql` is not
applied — or is applied but PostgREST has not reloaded its schema cache — both dropdowns render greyed
out and unclickable**, with an amber "Tagging needs …" note beside them and the tooltip replaced by a
migration instruction.

🔴 **A greyed-out dropdown is indistinguishable from "hardcoded" to the person looking at it.** I cannot
tell which Dominic saw — I cannot read the database, and I will not infer it from a migration file's
header. **§7 SQL A settles it in one query**, and the answer decides which fix applies:

| If the tag columns are **absent/stale** | The complaint is "these controls are dead". Fix: apply the migration, run `notify pgrst, 'reload schema';`. **No UI work at all.** |
| If they are **present and enabled** | The complaint is "the list is fixed and unexplained". Fix: §D labelling + §B option 1. **The list should stay fixed** (§C.2) |

**These are two different fixes and only one of them is needed.** Do not build the labelling work before
running that query.

---

## D. LANGUAGE — a labelling change only

🔴 **Code identifiers stay exactly as they are.** `CONTACT_KINDS`, `LEAD_TYPES`, `serves_kind`,
`serves_lead_type`, `kindLabel`, `LEAD_TYPE_LABELS`, the stored strings — none of this is a rename.
Everything below is display text.

### D.1 🟢 The option labels are ALREADY in Dominic's words

Worth saying before proposing anything: `KIND_LABELS` renders **First contact / Chase 1 / Chase 2 /
Final chase**, and `LEAD_TYPE_LABELS` renders **Hatches Up — ordering / Hatches Up — map only / On the
Village Foodie map / Not listed**. Those are his vocabulary, near-verbatim. **The jargon is not in the
options. It is in the field labels above them.**

### D.2 Every visible term, and a plainer alternative

| Shown now | Where | Plainer |
|---|---|---|
| **Serves rung** | editor field label | **Use at this stage** (or "Which contact is this?") |
| **Serves lead type** | editor field label | **Use for these trucks** |
| **— any —** | both dropdowns | **Any — no restriction** |
| **rung** | `ComposeWindow` sentence "it is tagged for that rung"; two `OutreachPanel` tooltips | **stage** |
| **Label** | editor | **Template name** |
| **Channel** | editor | **Send by** (Email / WhatsApp) |
| **Snippets used here** | editor block heading | **Reusable values this template fills in** |
| **Fill-in placeholder** | Tokens rail | **Something you type each time — `[[like this]]`** |
| **Values from the row** | Tokens rail | **Filled in automatically — `{{truck_name}}`** |
| **Conditional clause pairs** | Tokens rail | **Lines that appear only sometimes** |
| **Single conditions** | Tokens rail | **One-sided version of the above** |
| **snippet / placeholder / token** | three names for two ideas | 🔴 Pick **two**: a **token** fills itself in; a **snippet** is a value you set once in Snippets. "Placeholder" is a third word for the snippet case and should go |

🔴 **The one real ambiguity is `snippet` vs `placeholder` vs `token`.** Three words, two concepts, used
interchangeably across the editor, the Tokens rail and the Snippets view. Whatever else is done, settling
on two words and using them everywhere is the single highest-value copy change here.

⚠️ Scope note: "rung" appears in `ComposeWindow` and `OutreachPanel` too, so a consistent relabel touches
three components, not one. Changing it in the editor alone would leave the compose window explaining a
tag using a word the editor no longer uses.

---

## E. WHAT A ROW SHOULD SAY ONCE THE RULES ARE SET

### E.1 The width, re-derived (see §0.2 for the correction)

READ: grid `240px minmax(0,1fr) minmax(0,1fr)` with `gap-4`; wrapper `max-w-[1800px] … px-4`.
Rail container `border` → 238px; row `px-2.5` → 218px; `gap-1.5` = 6px between children.

| Rail state | Label width | Chars at `text-sm` (14px) |
|---|---|---|
| Idle | 218 − 6 − ~21 (the em/wa badge) = **~191px** | ~28 |
| **Selected or hovered** | 191 − 6 − ~55 (the three ↑↓⦸ buttons) = **~130px** | ~19 |

⚠️ INFERRED: the character counts assume an average glyph width; I cannot measure a rendered font.
Dominic reported seeing ~14 characters, which is *narrower* than my estimate — so the real fit is worse,
not better. The claim that does not depend on the estimate: **a 43-character label cannot fit in a 240px
track at 14px, and in the selected state the controls take a third of what remains.**

### E.2 What to show — and the cheap answer

**A tagged template's rules cannot fit in the rail.** Two tags rendered as badges would cost roughly
34 + 40 = ~74px of a 130px label. That is not a trade worth making.

| Option | Cost |
|---|---|
| **Two badges in the row** | 🔴 ~74px from a label that already truncates at ~19 chars. Rejected on arithmetic |
| **One combined badge, e.g. `Chase 1 · HU ordering`** | 🔴 Still ~110px. Same objection |
| **🟢 A `title=` on the row** | 0px. But it is a tooltip — the same invisibility §B.2 criticises |
| **🟢 A single dot/tint when a template is tagged**, full rules in the editor | ~8px. Says *"this one has rules — open it"*, which is all the rail has room to say |
| **🟢 Group the rail by stage** — a small heading per `serves_kind`, untagged under "Any" | 0px per row; ~20px per heading. **Shows which template serves which situation at a glance, which is the actual ask**, and gives the rail a reason to exist beyond a list |

🔴 **The honest answer to "see at a glance which template serves which situation" is not a badge — it is
grouping.** Badges fight a 130px label; a heading costs nothing per row. And §0.2's correction matters
here: the editor has **568–748px**, far more than I previously reported, so the *full* rule statement
("Used for **Chase 1** to **Hatches Up — ordering** trucks, by **email**") fits comfortably as one
readable sentence at the top of the editor. **Put the glance in the grouping and the detail in the
editor; put neither in a badge.**

---

## F. THE FEEDBACK LOOP

READ, `post`: on a non-OK response it calls `say(error)` and returns null. On success, if the body
carries `template`, it does `setRows(rs => rs.map(r => r.id === data.template.id ? data.template : r))`.

| Event | What happens |
|---|---|
| **Save** (`saveDraft`) | Posts `update_template` with the whole draft; on success `say('Saved')` — a **1800ms** toast. The row in the list is replaced, so a renamed label updates in the rail immediately. 🟢 This part works |
| **Create** | Row appended, selected, toast. 🔴 Invisible from the Snippets view (§A.2). 🔴 `post`'s `rs.map` finds no match for a new id, so the append in `createTemplate` is what adds it — correct, but the two mechanisms are easy to misread |
| **Channel → whatsapp** | 🔴 **The Subject field disappears from the form** (`draft.channel !== 'whatsapp' && …`) and the route sets `subject: null` on save. **A subject typed and then made WhatsApp is silently discarded, with no warning and no way to see what was lost.** Reversing the dropdown brings back an empty box |
| **Retire** (`toggleActive`) | Posts immediately, row replaced, strikethrough appears. 🔴 **No toast** — it is the one write with no confirmation at all |
| **Reorder** (`move`) | Two posts then a full `load()`. 🔴 A no-op when both rows share `sort_order` — the finding from the last report, unchanged |
| **Delete** | 🔴 Does not exist |
| **Unsaved changes** | 🔴 **Nothing guards them.** `draft` is reset by the effect on `[selected]`, so clicking another template in the rail **silently discards an unsaved edit.** No dirty marker, no prompt |

🔴 **Two silent data losses in this table** — the discarded subject and the discarded draft — and neither
is on Dominic's list, because a silent loss is not observable. They are worth more than the wording work.

---

## G. DUPLICATE

**Still absent.** *Search:* `duplicate|Duplicate|clone|Clone` in `TemplatesPanel.tsx` and the route — no
hit. *Positive control:* the same term is found in `lib/basket-utils.ts`, `lib/landing-table.ts`,
`lib/venue-matcher.ts`.

**What it costs:** small. Everything is already present.

- **Slug collision** — already solved by `createTemplate`'s suffix loop. ⚠️ It de-duplicates against
  `rows` **in the browser**, not the table; a stale tab hits the unique constraint and surfaces a raw
  `23505`. Latent today, likelier with a duplicate button because copies are made in bursts.
- **The copy** — `create_template` accepts `slug, label, channel, subject, body, sort_order`:
  everything **except the two tag columns**, which are not in the insert. So a duplicate is either
  insert-then-`update_template` (two calls) or a small change to the route's insert.

**Should the tags carry over?** The facts:

- **For:** the stated reason for duplicating *is* the four lead types. A copy is nearly always
  "same stage, same channel, different lead type" — so `serves_kind` and `channel` are right, and only
  `serves_lead_type` changes. Carrying them over means changing **one** field.
- **Against:** two rows with identical tags both match the same situation, and a duplicate button
  manufactures that collision deliberately. Whatever consumes the tags must already break the tie.
- 🔴 **Blocked on the same question as everything else:** if the tag columns are absent, the route
  **refuses** a tag write with a 400 (READ: the `!hasTemplateTags` guard). A tag-copying duplicate must
  handle that or it fails. §7 SQL A.

🔴 **The brief's instinct is right and worth stating plainly: "duplicate and change one field" removes
more pain than any wizard**, because it skips naming, channel, rules and body in one action — and unlike
a wizard it is equally useful on day 100. It is the highest value-per-line item in this review.

---

## H. WHAT THIS DOES NOT FIX

**The Snippets library is still DERIVED from `[[…]]` in bodies.** Nothing in §A–§G changes that.
`snippetIndex(templates, unresolvedIn)` scans every subject and body; a name exists because it appears in
a body. A pasted pricing table still becomes one snippet row per bracketed number — because the
*renderer* will genuinely prompt for every one of them, so the library is reporting the body accurately.

**Nothing above changes it, and two things make it less visible:**

- **Delete** (§A option 3 / last report's step 2) removes a junk body and its rows with it.
- **Creation that does not leave blanks** (§A options 1–2) means fewer junk bodies exist to scan.

**Sequence it AFTER this work, not before.** Declared snippets would need an insert-at-cursor UI and a
new "referenced but not declared" state, and they solve exactly one symptom — junk rows from junk
bodies — which deleting the junk body already solves. None of Dominic's actual complaints (the orphan
`Test`, the invisible row, the unexplained dropdowns, the 1‑2‑3 order) is touched by it.

⚠️ And a reminder: all of this is **uncommitted** (§0.3). The Snippets library is not shipped code.

---

## I. RECOMMENDED SEQUENCE

### Step 0 — no build, today
- **Delete the second `Test`** — §7 SQL C, SELECT first. Nothing references a template by id or slug
  except two hardcoded maps, neither of which names it (established in the last report, unchanged).
- **Run §7 SQL A.** One query, and it decides whether §C is a migration or a copy change. **Do this
  before any UI work is scoped.**

### Step 1 — 🔴 THE CHEAPEST BIG WIN, and it is one line
Add `setView('templates')` to `createTemplate`. That is the whole of §A.2. A new row can never again be
written to a screen that cannot display it.

**If only one thing is done from this review, it is this — and it is not the wizard.**

### Step 2 — the two silent losses (§F)
Warn before discarding a subject on channel change, and mark the draft dirty before switching templates.
Independent of everything else, and more valuable than any wording change because neither is observable
today.

### Step 3 — Duplicate (§G)
Highest value per line. Depends on step 0's SQL only for the tag-carrying decision. **Before** any
wizard: it makes most template creation not start from blank at all, which is the underlying problem the
wizard was reaching for.

### Step 4 — Delete, with a typed confirm
Cures the orphans step 1 does not prevent, and is what stops step 0 recurring by hand.

### Step 5 — §B option 1: three headed groups, tooltips promoted to visible text
The "understandable" ask proper. **Survives editing**, which the wizard does not. Do it after step 3 so
the duplicate flow and the editor are labelled once, together.

### Step 6 — §D wording, all three components at once
Pure copy. Settle `snippet`/`token` and drop "placeholder"; replace "rung" with "stage" in
`TemplatesPanel`, `ComposeWindow` and `OutreachPanel` together, or the two halves disagree.

### Step 7 — §E rail grouping, and `max + 10` instead of 999 on create
Grouping needs tags to exist (step 0's answer). The `max + 10` half is one line and also half-fixes the
dead ↑/↓ buttons from the last report.

### Skip
- **A wizard/stepper (§B option 2)** — fails the editing test; steps 3 and 5 cover the ground.
- **User-editable rung / lead-type lists (§C)** — a name with no derivation behind it can never match a
  prospect. Code is the right home.
- **Declared snippets (§H)** — after all of the above, if at all.
- **Rule badges in the rail (§E)** — the arithmetic refuses them; group instead.

---

## 7. SQL FOR DOMINIC — I have not run any of this

**A. 🔴 RUN THIS FIRST — are the tag columns actually there?** This decides whether §C is "apply a
migration" or "relabel a form", and §G's duplicate depends on it.

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_templates'
  and column_name in ('serves_kind', 'serves_lead_type');
```

Two rows = applied. No rows = not applied, and the dropdowns are greyed out for that reason.
⚠️ If two rows come back but the tab still shows them disabled, it is the PostgREST schema cache, not the
column — run `notify pgrst, 'reload schema';`.

**B. The real inventory** — the 8 rows, which are still blank starters, and which carry rules:

```sql
select
  slug, label, channel, active, sort_order,
  length(body)                          as body_chars,
  (body = E'Hi,\n\n')                   as is_untouched_starter,
  serves_kind, serves_lead_type,
  created_at
from public.outreach_templates
order by sort_order, slug;
```

⚠️ If query A returned no rows, drop `serves_kind, serves_lead_type` from this one or it will error.

**C. Step 0 — remove the accidental second `Test`. 🔴 RUN THE SELECT FIRST and read what comes back.**
Use the exact slug query B reports; do not trust the label.

```sql
-- 1. LOOK. Nothing is deleted by this.
select slug, label, active, sort_order, length(body) as body_chars, created_at
from public.outreach_templates
where length(body) <= 8 or lower(label) = 'test'
order by created_at desc;

-- 2. Only if step 1 returned exactly the row you mean to remove — substitute its real slug.
delete from public.outreach_templates
where slug = 'test'
returning slug, label, created_at;
```

⚠️ Irreversible, and the body is not recoverable. No contact-log row references a template (established
last report: `outreach_contacts` has no template column), and `test` appears in neither `STEP_TEMPLATE`
nor `suggestTemplateId`.

---

## 8. Scope

No file changed except this report. No migration written, no SQL executed, no database read. No
`outreach_templates` row created, edited, seeded, activated or deactivated, and nothing above proposes
that **code** do so — §7 C is Dominic's to run, and every option in §A–§G is UI that would let him act.
No change is proposed to `createSlug`, which is shared with two customer paths.
