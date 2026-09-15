# Template management on the Templates tab — deleting, creating, duplicating, and the list

**READ-ONLY REVIEW. 15 September 2026.** No file changed except this report. No migration, no SQL run,
no database read. Facts and options only; nothing chosen, nothing built.

---

## 0. PREMISES THAT ARE WRONG — read this first

### 0.1 🔴 THE STATED REASON FOR HAVING NO DELETE IS FALSE. This is the finding of the review.

Three documents give the same justification, in almost the same words:

> "A contact-log row written months ago **references the template that produced it**; removing the
> template makes that history unexplainable."
> — `app/api/admin/outreach-templates/route.ts` header (READ), and again in
> `supabase/migrations/20260909_outreach_templates.sql` (READ), and again in
> `docs/reference-manual.md` §52.2 (READ).

**It does not reference it.** READ, from the create-table in `20260903_outreach_tracking.sql`:

```
outreach_contacts (id, prospect_id, contacted_at, channel, direction, kind, message, created_at)
```

There is no `template_id`, no `template_slug`, no template column of any kind. What the log stores is
`message` — **the rendered text that was actually sent**, which is self-contained and survives a template
delete completely unharmed.

*Proof of the absence:* searched all of `supabase/migrations/` for `template_id` and `template_slug` —
no hit; searched the whole repo (excluding `node_modules`, `.next`, `.git`) for `template_id|templateId`
— every hit outside `docs/` is either `ComposeWindow.tsx:130` (component state, never persisted) or the
**demo-menu** template, a different noun (§0.3). *Positive control:* the identical migration search finds
`prospect_id` and `discovery_truck_id`, so it detects FK columns when they exist. And `outreach_contacts`
has exactly one `alter table` in the whole tree — `enable row level security` — so nothing was added later.

Everything in §A about what a hard delete would break rests on this. **The premise that made hard delete
look dangerous is not true.**

### 0.2 🔴 `set_active` does not exist.

The same route header says "`set_active` retires one instead". READ: the route dispatches on exactly
three actions — `create_template`, `update_template`, `set_defaults`. *Positive control:* the same
search finds `create_template` in the route, both panels and two docs, so it works; `set_active` appears
**once in the entire repo, in the sentence claiming it exists.** Retiring is real, but it is
`update_template` with `active`, via `toggleActive` in the panel.

### 0.3 Two different things are called "template" in this repo.

`templateId` in `components/landing/DemoUpload.tsx`, `CreateDemoModal.tsx`, `app/api/demo/route.ts` and
`app/api/admin/provision-demo/route.ts` is a **demo menu template** (`getDemoTemplate`,
`SAMPLE_TEMPLATE`), unrelated to `outreach_templates`. *Absence check:* none of `components/landing/`,
`app/api/demo/` or `app/api/admin/provision-demo/` mentions `outreach_templates` or `outreach-templates`
at all. *Positive control:* those same files do mention `getDemoTemplate`/`SAMPLE_TEMPLATE`.

### 0.4 One premise of the brief is right but understated — the Snippets build is UNCOMMITTED.

`git status` shows `TemplatesPanel.tsx`, `ComposeWindow.tsx`, `OutreachPanel.tsx`,
`lib/outreach-template-render.ts` modified, `lib/outreach-globals.ts` deleted, and the snippets route,
module, migration and report untracked. **None of it is committed** (`4d4e5b6` is still HEAD), and
**`20260916_outreach_snippets.sql` has not been applied.** Every §G claim below about the Snippets
library describes working-tree code, not shipped code.

### 0.5 What I cannot see, and therefore do not assert.

`Test` (4,208 chars) and `chaser-2` are **database rows**. I cannot read a database. Their bodies, the
16 `[[250]]`…`[[4000]]` names, the 9-row count and the 10/20/30/40/50/999 spread are **Dominic's
figures**, used as given and labelled as his throughout. §F's demonstration runs on a **fixture built to
his stated numbers** — it is not a reading of the database. §7 has SQL to confirm all of it.

---

## 1. Admin-only surface

**Confirmed by symbol.** `TemplatesPanel` is imported at `app/admin/page.tsx:25` and mounted at :1350 —
**that one site, nowhere else.** `/api/admin/outreach-templates` is fetched from exactly two components,
`TemplatesPanel` and `OutreachPanel`, both under `app/admin/`; both `GET` and `POST` open with
`verifyAdmin` and return **404** (not 401) to a non-admin.

⚠️ **ONE SHARED SYMBOL, FLAGGED.** `createSlug` lives in `lib/utils.ts:177` and is imported by
`lib/provision-truck.ts:17` and `lib/demo-session.ts:10` — **both customer-facing paths** (truck
provisioning, demo sessions). It is a pure string function with no state, so reading it is safe, but
**any change to it to improve template creation would silently change truck slugs and demo-session
slugs.** Options in §B and §C are written to leave it alone.

---

## A. DELETE

### A.1 What the API supports

| Action | Effect | UI |
|---|---|---|
| `create_template` | insert | "New template" button |
| `update_template` | patch of `EDITABLE` | editor Save, ↑/↓, ⦸/↺ |
| `set_defaults` | rewrites `placeholder_defaults` | 🔴 **none since the Snippets build removed it** |
| — | — | — |

**There is no delete at any level** — not in the UI, not in the API. *Proof:* the only occurrence of
"delete" in the route is the header sentence saying there isn't one. *Positive control:* the same
`.delete(` search finds real deletes in three sibling admin routes (`outreach-snippets`,
`discovery-events`, `outreach`), so it detects them.

⚠️ Note `set_defaults` is now an **action with no caller** — my Snippets build removed `saveDefaults`.
Live but unreachable.

### A.2 What would actually break on a hard delete

| Depends on a template by… | What it is | Effect of deleting `Test` / `chaser-2` |
|---|---|---|
| `outreach_contacts` | **no template column at all** (§0.1) | 🟢 **nothing.** History is the stored `message` text |
| `STEP_TEMPLATE` (`lib/outreach-step.ts:344`) | slug map, rung × channel | 🟢 names only `general_email`, `wa_intro`, `chaser_email`, `wa_chaser` — **neither** |
| `suggestTemplateId` | returns 3 slugs | 🟢 `chaser_email` / `hu_rate_email` / `general_email` — **neither** |
| `templateForStep` | resolves the slug | 🟢 already returns a **named miss**, `'slug_absent'`, not a crash |
| `ComposeWindow.templateId` | React state | 🟢 `offerable.find(...) ?? null` — a stale id resolves to null |
| Snippets library | derived from bodies | 🟢 **improves** — the 16 junk names disappear with the body |
| `serves_kind` / `serves_lead_type` | columns **on** the row | 🟢 go with it |

**Nothing references a template by id or slug except two hardcoded maps, and neither map names either
junk template.** A dangling reference is already a designed-for state: `TemplateMiss = 'no_step' |
'no_channel' | 'slug_absent' | null`, with the comment "RETURNS A REASON, NOT JUST A NULL".

### A.3 Hard delete vs deactivate — what `active: false` does today

READ, three different answers:

| Surface | Does `active: false` remove it? |
|---|---|
| Compose dropdown | ✅ **yes** — `templatesFor` filters `t.active !== false` |
| Templates tab list | ❌ **no** — the rail renders all rows, struck through and grey |
| Snippets blast radius | ❌ **no** — `snippetIndex` records `active: t.active !== false` and lists it |

🔴 **So retiring `Test` does NOT clean up the Snippets library.** My own build lists inactive templates
struck-through *on purpose* — hiding them would understate the radius — which means **retiring `Test`
leaves all 16 of its junk snippet rows in the library, struck through but present and still occupying
the whole screen.** Deactivation solves the compose-dropdown complaint and **nothing else**. Stated
plainly, as asked: for this particular problem, retire is the wrong tool.

### A.4 Options

| | What it is | For | Against |
|---|---|---|---|
| **1. Hard delete + typed confirm** | `delete_template` action, id + slug must match | Actually removes the junk, the snippets, the dropdown entry, the list row. §A.2 shows nothing dangles | Irreversible. Needs a confirm that cannot be misclicked |
| **2. Soft delete (`deleted_at`)** | third state beside `active` | Reversible; a real audit trail | 🔴 A **migration**, a third state in every filter, and the Snippets library must then learn to skip deleted-but-present rows — the exact thing it deliberately does not do for inactive |
| **3. Both** | retire for real templates, delete for junk | Matches the two real intents | Two controls in a 240px rail that already truncates labels (§D) |
| **4. Nothing — delete by hand in SQL** | what the header already recommends | Zero build. Available **today** | Every future blank needs a developer |

**Facts that bear on the choice:** §0.1 removes the stated objection to option 1. The route still
enforces the real invariant — `slug` is excluded from `EDITABLE`, so the picker's key can never be
renamed out from under `STEP_TEMPLATE`. And a delete is strictly *safer* than the rename the route
already forbids, because `templateForStep` has a named branch for a missing slug and none for a wrong one.

---

## B. CREATION

### B.1 What it does today, by symbol

`createTemplate` (READ):

1. `window.prompt('Name for the new template:')` — **a browser prompt**, one field.
2. `createSlug(name)`; reject if under 3 chars.
3. Suffix for uniqueness against `rows`: `for (let n = 2; taken.has(slug); n++) slug = base-n`.
4. `post({ action: 'create_template', slug, label: name, channel: 'email', body: 'Hi,\n\n' })`.
5. Select the new row.

Route defaults: `channel` anything-but-`'whatsapp'` → `'email'`; `sort_order` → **999**;
`subject` → null for WhatsApp.

🔴 **The row hits the database at step 4 — immediately after the single prompt.** There is no draft
state. Dismissing the prompt aborts; typing a name and then changing your mind does not. `chaser-2` is
exactly this: `createSlug("Chaser 2") → "chaser-2"`, `label: "Chaser 2"`, `body: 'Hi,\n\n'` — **5
characters**, matching Dominic's observation exactly. (INFERRED as to which of the two paths produced
the `-2`: typing "Chaser 2" and the collision suffix on "Chaser" both yield `chaser-2`.)

⚠️ It is also created **`active: true`**, because the column defaults to true and the insert does not set
it — so an abandoned blank is in the compose dropdown from the moment it exists.

### B.2 Options

| | What | Orphans | Cost |
|---|---|---|---|
| **1. Dialog first — label, channel, and a starting point** | collect before inserting | 🟢 **Fewest.** Nothing is written until Create is pressed; Cancel writes nothing | A real form where a one-line `window.prompt` is today. Also the natural home for §C's duplicate |
| **2. Create only on first save** | hold a draft row client-side | 🟢 **Zero** from abandonment | 🔴 Two kinds of "selected template" everywhere — every control (↑↓, ⦸, tags, snippets read-out) needs a has-no-id branch |
| **3. Keep immediate creation, add delete** | pair with §A | 🔴 Orphans still created, just removable | 🟢 **Cheapest by a wide margin**, and delete is wanted anyway |
| **4. Set `active: false` on create** | insert retired | Orphans exist but are **invisible in compose** | 🟢 One line in the route. 🔴 Every new template then needs an extra click, and it does not remove the row or its snippets |

**Fewest orphans: option 1.** Cheapest fix for the pain actually reported: option 3. They are not
exclusive — 1 prevents, 3 cures, and only 3 helps with the two rows that already exist.

⚠️ Whatever is chosen, do not change `createSlug` (§1). If the dialog needs different slug behaviour, it
should post an explicit `slug` — the route already validates `^[a-z0-9_-]{3,60}$` itself.

---

## C. DUPLICATE

**It does not exist.** Searched `TemplatesPanel.tsx` and the route for
`duplicate|Duplicate|clone|Clone` — no hit. *Positive control:* the same term is found in
`lib/basket-utils.ts`, `lib/landing-table.ts`, `lib/venue-matcher.ts`, `lib/capacity-breach.ts`.

**What it would need — all of it already present:**

- **Slug collision:** `createTemplate` already solves this. `createSlug(label) + -n` until free.
  ⚠️ The uniqueness set is `new Set(rows.map(r => r.slug))` — **the rows loaded in the browser**, not the
  table. If the tab is stale the insert hits the unique constraint and returns a raw `23505`. Latent
  today; a duplicate button would make it likelier, since copies are made in bursts.
- **The copy itself:** `create_template` accepts `slug, label, channel, subject, body, sort_order` —
  everything a copy needs **except the two tag columns**, which are not in the insert. So a duplicate
  would be insert-then-`update_template`, two calls, or the route's insert would need extending.

**Should `serves_kind` / `serves_lead_type` carry over?** The facts, not a choice:

- **For carrying over:** Dominic's stated reason for duplicating is the four lead types. A copy made to
  become the `hot`-variant of a template starts from one that is `warm` — the *kind* is nearly always
  right, and only `serves_lead_type` changes.
- **Against:** two rows with identical tags both match the same selector. Whichever selector consumes
  the tags must already break that tie, and a duplicate button would manufacture ties on purpose.
- 🔴 **Unresolved and material:** `20260915_outreach_template_tags.sql` may not be applied — the route
  runs a capability probe (`tagColumnsExist`) and **refuses** any tag write when the columns are absent.
  So a duplicate that copies tags must handle `hasTemplateTags === false` or it will 400. §7 SQL C.

---

## D. THE LIST LAYOUT — where the truncation actually is

⚠️ I cannot see a screen. Every number below is a READ of the style chain plus arithmetic; the
character counts are INFERRED from an assumed average glyph width and are the softest claim here.

**The chain, READ outside-in:**

1. `app/admin/page.tsx:864` — `w-full min-[1400px]:max-w-6xl min-[1400px]:mx-auto px-4 py-6`
   → at ≥1400px viewport: **1152 − 32 = 1120px** usable.
2. `TemplatesPanel` — `gridTemplateColumns: '240px minmax(0, 1fr) minmax(0, 1fr)'`, `gap-4`
   → rail **240px fixed**; 1120 − 240 − 32 = 848 → editor **424px**, preview **424px**.
   🔴 **The rail is a fixed track. It is 240px at every window width** — widening the browser gives the
   gain entirely to the editor and preview.
3. Rail container `border` → 238px content. Row `px-2.5` → 218px. `gap-1.5` = 6px.
4. Row children: label `flex-1 min-w-0 truncate` · badge `flex-shrink-0` · controls `flex-shrink-0`,
   `hidden` unless hovered or selected.

**So the truncation is `text-overflow: ellipsis` (Tailwind `truncate`) on a `flex-1 min-w-0` span inside
a fixed 240px track.** Not a grid `min-width: auto` overflow, and not a hard width on the label.

| State | Label width | Chars at `text-sm` (14px) |
|---|---|---|
| Idle | 218 − 6 − ~21 (badge) = **~191px** | ~28 |
| **Selected or hovered** | 191 − 6 − ~55 (3 buttons) = **~130px** | ~19 |

Dominic's longest label is **43 chars** ("General approach — listed on Village Foodie"). **It does not
fit in either state**, and it is the selected state he will normally be looking at. He reports seeing
"General approa…" ≈ 14 chars, which is *narrower* than my ~19 estimate — so my glyph-width assumption is
optimistic and the real fit is worse, not better. The robust conclusion, independent of the estimate:
**43 characters cannot fit in a 240px track at 14px, and the controls take a third of what is left.**

**To fit 43 chars** would need roughly 300px of text + ~90px of chrome and controls ≈ **~400px rail**,
which would leave 1120 − 400 − 32 = 688 → **344px each** for editor and preview.

### Options

| | What | Cost | Effect on the Snippets view |
|---|---|---|---|
| **1. Wider rail (320–400px)** | change one inline value | Editor+preview lose 80–160px **at every width** | 🟢 **None.** Snippets replaces the grid entirely — it is not a grid child |
| **2. Preview as a rail tab beside Tokens** | drop to 2 columns | 🟢 Frees a whole ~424px column; rail could double with room left | 🟢 None. 🔴 Loses body-and-preview side by side |
| **3. Full-width editor, list as a dropdown** | master–detail → select | 🟢 Most editor width of any option | 🔴 Loses at-a-glance comparison of 9 templates; ↑/↓ reorder needs a new home |
| **4. Two-line rows** | drop `truncate`, allow wrap | 🟢 **Cheapest — no width taken from anything.** ~56 chars across two lines at the *idle* width | Rail ~160px taller for 9 rows. 🔴 At the **selected** width (~130px) even two lines is ~38 chars — still short of 43, so pair with a modest widening |

🔴 **The controls are the hidden half of this problem.** They are `hidden group-hover:flex`, so the label
is widest exactly when nobody is looking at it and narrowest when a row is selected. Moving ↑/↓/⦸ to a
second line, or into the editor pane, recovers ~61px in the state that matters — more than option 1 buys
for 80px of stolen width.

---

## E. WHAT THE LIST SHOULD SHOW

Available today (all in `BASE_SELECT`, all already in `Row`): `active`, `sort_order`, `serves_kind`,
`serves_lead_type`, `body.length`, `slug`, `updated_at`.

| Field | Cost in width | Earns its place? |
|---|---|---|
| `active` | **0px** — already shown as grey + strikethrough | ✅ already there, free |
| `body` length | ~30px, or 0px as a dot/tint | 🟡 **Only for the blank case.** A 5-char body is a defect; 4,208 vs 900 is noise |
| `serves_lead_type` | ~34px badge | 🔴 Not yet — §C shows the tag columns may not even be applied |
| `serves_kind` | ~40px badge | 🔴 Same, and it duplicates what the editor shows on selection |
| `sort_order` | ~26px numeral | 🔴 An implementation detail; the list order already *is* the answer |
| `slug` | ~90px | 🔴 Never — it is fixed after creation and named in the toast when it matters |

**Recommended minimum: nothing new that costs width.** Add **one** zero-width signal — mark a template
whose body is still the untouched `'Hi,\n\n'` starter, as a tint or a small "empty" dot in the space the
badge already occupies. That is the only one of these that names a *defect* rather than an attribute,
and it is precisely how `chaser-2` would have been visible the day it was made.

Everything else on this list is better served by §D freeing width first. Adding badges to a rail that
already truncates at 14 characters makes the reported problem worse.

---

## F. ORDERING — 🔴 the reorder buttons are dead for every template made in this tab

READ, `move(r, dir)`: sort the rows, find the neighbour, then **swap the two `sort_order` values** with
two `update_template` posts.

🔴 **If both rows hold 999, the swap writes 999 over 999. Nothing moves.** Demonstrated by transcribing
`move` verbatim and running it on a fixture built to Dominic's reported spread (5 seeded at 10–50, 4 at
999) — ⚠️ **a fixture of his stated figures, NOT a reading of the database**:

```
rail order before : hu_rate general chaser wa_intro wa_chaser test chaser-2 tab3 tab4
rail order after ↑: hu_rate general chaser wa_intro wa_chaser test chaser-2 tab3 tab4
🔴 NO-OP — the ↑ button changed nothing (both rows were 999)

control: move a seeded row (sort_order 30) up
  before: hu_rate general chaser wa_intro wa_chaser test chaser-2 tab3 tab4
  after : hu_rate chaser general wa_intro wa_chaser test chaser-2 tab3 tab4
  ✅ CONTROL MOVED — so the harness can detect a move; the no-op above is real
```

The control moved a distinctly-ordered row, so the harness detects movement; the no-op is real and not a
broken test. Two further reads:

- The rail sorts `a.sort_order - b.sort_order` with **no tie-break**. `Array.sort` is stable, so the four
  999s keep the order the API returned — `.order('sort_order').order('slug')`, i.e. slug order. Correct
  today **by accident of stability**, not by declaration.
- `sort_order` is **not editable anywhere in the UI** except through `move`. Its only other appearance
  is being echoed back in the editor's save payload.

### Options

| | What | For | Against |
|---|---|---|---|
| **1. Tie-break the swap** | when values are equal, write `neighbour ± 1` | Smallest real fix; buttons start working | Still dense integers; repeated moves converge |
| **2. Renumber on drop** | rewrite all rows as 10, 20, 30… after any move | Always sane. Fixes the existing pile permanently | 🔴 Writes **every** template row — needs sign-off (§rules) |
| **3. Create with `max + 10`** | instead of the route's literal 999 | New templates are distinct from birth | Does not fix the four already at 999 |
| **4. Expose `sort_order` as a number field** | direct edit | Zero new logic — the column is already in `EDITABLE` | Exposes an implementation detail; nothing stops two rows colliding again |
| **5. Add a stable tie-break to the sort** | `|| a.slug.localeCompare(b.slug)` | Makes today's accidental order declared | Ordering still cannot be *changed* |

Option 3 + option 1 together fix cause and symptom without rewriting any existing row.

---

## G. DERIVED VERSUS DECLARED SNIPPETS

**Today: derived.** `snippetIndex(templates, unresolvedIn)` scans every body and subject for `[[name]]`
and folds occurrences into one row per distinct name. A name exists because it appears in a body —
there is no other way to make one, and no way to refuse one.

🔴 **That is why a pasted pricing table became 16 rows.** `[[250]]`…`[[4000]]` are indistinguishable,
to the scanner, from `[[my rate]]`. `isSnippetName` (non-empty, ≤80 chars, no brackets) accepts all of
them, and correctly so: the *renderer* will prompt for every one of them at compose time, so the library
is telling the truth about what the template will ask for. **The junk rows are not a library defect.
They are an accurate report of a junk body.**

**Declared would mean:** a snippet is a row you create deliberately; inserting `[[name]]` into a body
references it. Requires: a create-snippet control; a way to insert one into a body at the cursor; and a
decision about the new third state — **a `[[name]]` in a body with no declared snippet.**

| | Derived (today) | Declared |
|---|---|---|
| Can the library disagree with what compose will ask for? | 🟢 Never — same scanner | 🔴 Yes, and that gap is the whole risk |
| Junk body → junk rows | 🔴 Yes | 🟢 No |
| Typo `[[my rate ]]` | 🔴 Silent second row | 🟢 Visible as undeclared |
| Deleting a snippet | Edit the bodies | 🟢 Delete the row — but the `[[…]]` is orphaned |
| Cost | 🟢 Already built | 🔴 Insert-at-cursor UI, an undeclared state, migration unchanged but route grows |

**Which problems in A–F it solves:** the **16 junk rows** (§A.3) — and only by making a bad body's
markers invisible in one screen, which is arguably worse than showing them. **Not** the missing delete,
**not** creation orphans, **not** duplication, **not** the 240px rail, **not** the 999 pile.

🔴 **Deleting the `Test` row removes the 16 junk snippets under either model.** Declared snippets are a
large change that addresses one symptom of one row that ought not to exist.

---

## H. RECOMMENDED SEQUENCE

### Step 0 — 🔴 DELETE THE TWO ROWS BY HAND. Today, with no build at all.

**Asked directly, answered directly: yes, this removes most of the pain on its own.** It clears the
compose dropdown, the 16 junk snippet rows, and both squashed rail entries. §A.2 shows nothing dangles:
no contact row references a template, and neither slug map names either one. §7 SQL B and D — **run the
SELECT first, and they are yours to run, not code's.**

Everything below is about *not needing to do this by hand again*.

### Step 1 — Correct the false premise in three places (documentation only)
The route header, the migration comment, and manual §52.2 all state that contact rows reference
templates. While that sentence stands, the next person will re-derive the same wrong conclusion. This
costs nothing and unblocks step 2.

### Step 2 — Add delete, with a typed confirmation
Depends on step 1 only for honesty. Cures the orphan problem for every future blank, and is the
prerequisite that makes immediate-creation (§B option 3) tolerable. **Not** soft delete: it needs a
migration and would force the Snippets library to learn a state it deliberately ignores.

### Step 3 — Fix creation so it stops producing orphans: `max + 10` instead of 999, and a two-field
dialog (label + channel) before the insert
Independent of step 2; together they prevent and cure. The `max + 10` half is one line and also
half-fixes §F.

### Step 4 — Make ↑/↓ work: tie-break the swap when the two values are equal
Small, and only sensible after step 3 stops adding new 999s.

### Step 5 — The rail. Move the ↑/↓/⦸ controls off the label line first, then reassess width
Recovers ~61px in the selected state — more than widening the rail by 80px — and costs no width from
the editor or preview. Measure again before taking width from anything.

### Step 6 — Duplicate
Last, because it is the only one that is pure new capability rather than a defect. It should reuse
step 3's dialog, and it needs §7 SQL C answered first — if the tag columns are not applied, a
tag-copying duplicate 400s.

### Skip
- **Declared snippets (§G).** Step 0 removes the symptom.
- **Soft delete (§A.2 option 2).** A migration and a third state for no gain over step 2.
- **Extra badges in the rail (§E).** Do not add width to the thing that is too narrow.

---

## 7. SQL FOR DOMINIC — I have not run any of this

**A. Confirm the §0.1 finding — does `outreach_contacts` reference a template?** Run this first; every
recommendation above depends on the answer being "no rows".

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_contacts'
order by ordinal_position;
```

**B. The real template inventory** — the 9 rows, their bodies' length, their order, and which are still
the untouched starter:

```sql
select
  slug, label, channel, active, sort_order,
  length(body)                                as body_chars,
  (body = E'Hi,\n\n')                         as is_untouched_starter,
  (select count(*) from regexp_matches(coalesce(subject,'') || E'\n' || body, '\[\[([^\]]+)\]\]', 'g')) as placeholder_count,
  created_at
from public.outreach_templates
order by sort_order, slug;
```

**C. Are the tag columns actually applied?** (§C and §E depend on this.)

```sql
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'outreach_templates'
  and column_name in ('serves_kind', 'serves_lead_type');
```

**D. Step 0 — delete the two junk rows. 🔴 RUN THE SELECT FIRST and read what comes back.**
Substitute the exact slugs query B reports; do not trust the labels.

```sql
-- 1. LOOK. Nothing is deleted by this.
select slug, label, active, sort_order, length(body) as body_chars
from public.outreach_templates
where slug in ('test', 'chaser-2');

-- 2. Only if step 1 returned exactly the two rows you mean to remove.
delete from public.outreach_templates
where slug in ('test', 'chaser-2')
returning slug, label;
```

⚠️ `delete` here is irreversible and the bodies are not recoverable. It affects no contact-log row
(§0.1), and neither slug appears in `STEP_TEMPLATE` or `suggestTemplateId` (§A.2). Take a copy of the
`Test` body first if the pricing table in it is worth keeping.

---

## 8. Scope

No file changed except this report. No migration written, no SQL executed, no database read. No
`outreach_templates` row created, edited, seeded, activated or deactivated, and nothing above proposes
that **code** do so — §7 D is Dominic's to run, and every option in §A–§F is UI that would let him act.
