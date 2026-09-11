# Templates in the database, managed on their own page

---

# 0. 🔴 WHERE THE BRIEF AND THE DATA DISAGREE

**"19 Hatches Up trucks" is 17.** 🧪 Re-derived live, count-asserted (231/231 prospects):
`hu_ordering = true` → **17**, `null` → **214**, `false` → **0**. It has been 17 every time this series has
measured it. Nothing depends on the number, but the tedium the defaults solve is 17 trucks, not 19.

Two other figures re-derived at the same time: `whatsapp_confirmed = true` → **30**; `stage = contacted`
→ **3**.

**Nothing else in the brief contradicted the code.** No other task was mid-change: `tsc --noEmit` on the
tree as found was **exit 0, 0 errors**.

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

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	app/api/admin/discovery-events/
	components/admin/ComposeWindow.tsx
	components/admin/ConfirmDeleteDialog.tsx
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/EventRowCells.tsx
	components/admin/InlineField.tsx
	components/admin/ScheduleEventsPopup.tsx
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
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/outreach-templates.ts
	lib/schedule-match.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

`git add -A` / `git add .` were not run; nothing was staged.

---

# 2. 🔴 (1) THE MIGRATION — WRITTEN, NOT APPLIED

**`supabase/migrations/20260909_outreach_templates.sql` — 8,480 bytes, 126 lines. NOT APPLIED.**

## 🔴 After you run it, run the last line

```sql
notify pgrst, 'reload schema';
```

It **is** the last line of the file, so running the file whole includes it. It matters because PostgREST
caches the schema and returns **PGRST205** against a table that exists but has not been re-read — which
reads exactly like "the migration failed". That is the code that cost a red scrape.

🧪 **Confirmed live, right now:** `GET /rest/v1/outreach_templates` returns
`404 {"code":"PGRST205", … "Perhaps you meant the table 'public.outreach_contacts'"}`. That is the real
error this build is designed to distinguish, observed against the real database — not a guess about what
it would say.

## Shape

| column | why |
|---|---|
| `id uuid pk` | — |
| `slug text unique` | 🔴 **the stable key, not `id`.** `suggestTemplateId` returns `'chaser_email'`/`'hu_rate_email'` and the picker resolves on it; a uuid that changed on re-seed would break the suggestion silently. Unique so a re-run conflicts rather than duplicating. |
| `label`, `channel` (`check in ('email','whatsapp')`), `subject`, `body` | what the module already used |
| `sort_order` | picker and list order |
| `active` | 🔴 **retire, do not delete** — a contact-log row from months ago references the template that made it |
| `placeholder_defaults jsonb` | `{"your rate":{"value":"…","updated_at":"…"}}` — 🔴 **the timestamp is per placeholder**, because a stale default is worse than an empty field and each value ages separately |
| `created_at`, `updated_at` | — |

Plus an index on `(active, sort_order)` — the picker's access path.

## Grants — service-role only, matching how the route connects

The same three defences as `discovery_run_log`, and the migration says why: **RLS on**, **one
`service_role` policy**, and the default grants **revoked** — enabling RLS alone leaves the capability in
place. 🧪 Confirmed this matches the caller: every route under `app/api/admin/` builds its client with
`SUPABASE_SERVICE_ROLE_KEY`, including the new one.

## The seed — and 🔴 what a failed seed will look like, since I cannot run it

Five rows: `hu_rate_email`, `general_email`, `chaser_email`, `wa_intro`, `wa_chaser` — **including the
four never-agreed ones**, seeded so you edit rather than retype. `on conflict (slug) do nothing`, so
re-running never overwrites an edited template.

🧪 **Validated structurally** (I cannot execute it): quote-aware parse of the VALUES region gives **5
tuples, 6 values each**, **46 `$tpl$` delimiters = 23 literals, balanced**, and `subject` is `null` for
exactly the two WhatsApp rows. No body, subject or label contains the `$tpl$` delimiter.

⚠️ **My first validator reported all five rows malformed and the quotes unbalanced. It was wrong** — it
split tuples by line (bodies are multi-line) and counted a `$tpl$` mention inside a comment. Recorded
because a validator that cries wolf is the same failure class as one that reports green.

**What you will see if it does not work:**

| symptom | meaning |
|---|---|
| `INSERT 0 0`, no error | those slugs already existed — `on conflict do nothing` did its job |
| `ERROR 42P07` / `42710` | table or policy already exists from a partial earlier run — the `if not exists` covers the table, not a half-created policy |
| `ERROR 42501` | not running as owner/service role in the SQL editor |
| app shows PGRST205 | the table is there; **you have not run the `notify`** |
| `ERROR 22P02`/syntax near a body | a dollar-quote delimiter collision — the file asserts there is none |

---

# 3. (2) THE TEMPLATES TAB, AND A NEW ROUTE

**`app/api/admin/outreach-templates/route.ts` is a NEW ROUTE. It is not a reuse** — it borrows only the
gate pattern (`verifyAdmin` + service role, 404 for a non-admin). §51.7 records a "reuse" that was a
fourth independent implementation; calling this a reuse of the outreach or discovery-events route would
repeat that. 🧪 It names exactly one table: `from('outreach_templates')`, and nothing else.

Actions: `create_template`, `update_template`, `set_defaults`. `GET` lists everything including inactive.

**Deletion: not implemented, deliberately.** `active = false` retires a template instead —
`templatesFor` drops inactive ones from the compose picker while they stay readable, so a contact-log row
from months ago is still explicable. A genuine removal is a one-line delete in the SQL editor, which is
the right amount of friction for something that rewrites history.

**`slug` is not editable after creation** — it is the key the picker and `suggestTemplateId` resolve
against, and renaming it would orphan the suggestion silently.

The tab (`✉️ Templates`, a seventh entry in `ADMIN_TABS`) is list-left / editor-right, with create,
reorder (↑↓ swapping `sort_order`), and retire/restore.

---

# 4. 🔴 (3) THE PREVIEW IS ONE CODE PATH — PROVEN, NOT ASSERTED

The mechanism moved to **`lib/outreach-template-render.ts`** and now exposes the whole composition:

```
contextFromProspect(prospect) → renderWithFills(tpl, ctx, fills) → composeEmail(body)
```

**Both surfaces call exactly those, in that order.** The compose window's own `applyFills` was deleted and
replaced with the shared `applyPlaceholderFills`.

🧪 **Structural:** `TemplatesPanel.tsx` contains **zero** substitution code — 0 `[[`, 0 `matchAll`, 0
`?next_event`; its single `replace(` is inside a comment and its three `{{` are display strings plus a
JSX `style={{…}}`. It imports the substitution from the shared module and has none of its own.

🧪 **Executed:** the compose window's composition and the preview's composition, run over **5 templates ×
3 prospect shapes = 15 compositions**, are **byte-for-byte identical, 0 differences**. They cannot drift
because both reduce to the same three function calls.

**The conditional branch is reachable two ways**, as asked: the prospect dropdown marks rows with
`(no upcoming event)`, **and** there is an explicit **"Simulate no upcoming event"** checkbox that nulls
the event fields regardless of who is selected — so the branch is visible even on a day when every truck
has a booking. The preview reports `Dropped clause: next_event` when it fires.

The preview shows the resolved body **with the footer already appended** (it calls `composeEmail`), the
unresolved placeholders, and the dropped conditions.

---

# 5. 🔴 (4) THE TOKEN REFERENCE IS DERIVED FROM THE CODE

A hand-written list goes stale the first time a `case` is added, and the staleness is invisible. So the
names are read out of the functions themselves: `resolvedValue.toString()` and `conditionMet.toString()`
are scanned for `case 'x':` labels. **String literals survive minification** (minifiers rename
identifiers, not string contents), so this holds in a production build.

🧪 Executed against the compiled module — **8 tokens and 5 conditions, all documented**:

`{{truck_name}}` · `{{contact_name}}` · `{{contact_name_prefixed}}` · `{{website}}` · `{{order_url}}` ·
`{{next_event_day}}` · `{{next_event_date}}` · `{{next_event_venue}}`
`?next_event:` · `?no_next_event:` · `?order_url:` · `?website:` · `?contact_name:`

⚠️ **The descriptions are prose and cannot be derived** — the code does not contain them. A token with no
description still appears, marked undocumented, so the gap is visible rather than silent.

## An unknown token never renders literally

🧪 Executed: a body containing `{{truk_name}}` renders as **`[[truk_name]]`**, is listed in `unresolved`,
and **`{{truk_name}}` does not appear in the output**. This is the mechanism's existing behaviour —
`substitute` falls back to `[[token]]` — and was **not changed**. It therefore reaches the compose
window's "still to fill" list and both confirmations for free.

⚠️ **One case the renderer cannot catch:** a *single*-bracket `[Truck Name]` is ordinary text and would
print literally. Since the mechanism must not change, this is caught by a **lint** instead:
`suspectedMistypedTokens` flags single-bracket sequences in the editor, before the template is ever used.
🧪 On `"Hi [Truk Name] and [[real]]"` it returns `["Truk Name"]` and correctly ignores the real
placeholder.

---

# 6. 🔴 (5) PLACEHOLDER DEFAULTS

Stored per template in `placeholder_defaults`, edited on the Templates tab, **with a per-placeholder
`updated_at` stamped server-side and only when the value actually changes** — re-saving the same text does
not refresh the age, so "last changed" is a fact the server recorded rather than something the form
asserted.

**On the Templates tab:** each placeholder shows `set 9 Sep 2026`, or `no default`, and turns **red ·
stale** past 60 days.

**In the compose window:** fields pre-fill from the defaults, and a defaulted value carries a
**`from default · <date>`** chip — red and marked **stale** past 60 days. Typing in the field clears the
chip, because it is no longer a default. **Overriding never writes back:** the compose window has no route
to the templates table at all.

**Why the chip is the whole protection.** A stale default is worse than an empty field precisely because
every other guard goes quiet: the field is filled so the `NEEDED` chip does not show, the placeholder is
absent from the body so "Still to fill" reads zero, and neither the pre-send nor the pre-log confirmation
fires. The provenance marker is the only thing left that can tell you.

---

# 7. 🔴 (6) THE GUARDS STAYED IN CODE — EACH CONFIRMED

| guard | where it lives now | can a template row switch it off? |
|---|---|---|
| **Opt-out footer** | `OPT_OUT_FOOTER` + `composeEmail` in the mechanism module. 🧪 The only two callers are the compose window (`fullText`) and the preview — both append it outside the editable body. | **No.** A row controls its `body`; the footer is concatenated after it. |
| **WhatsApp gate** | `templatesFor(all, row)` — filters on `row.whatsapp_confirmed === true`, reading the **prospect**, not the template. | **No.** A row controls its own `channel`, and `channel = 'whatsapp'` is exactly what the gate refuses unless the prospect is confirmed. |
| **Unresolved visible** | `substitute` returns `` `[[${token}]]` `` when a token has no value and no fallback. | **No.** It is the renderer's own fallback. |
| **mailto ceiling** | `MAILTO_URL_CEILING = 2000` in the compose window; refuses and points at Copy rather than truncating. | **No.** Not reachable from template data. |
| **Stacking fix** | 🧪 `style={{ zIndex: 85 }}` (compose) and `style={{ zIndex: 80 }}` (schedule popup) still inline. | Untouched. |

`templatesFor` also now drops `active === false`, so a retired template cannot reach the picker.

---

# 8. 🔴 (7) NO HARDCODED MESSAGE COPY REMAINS

**`lib/outreach-templates.ts` is deleted.** Its rendering half was moved **verbatim** into
`lib/outreach-template-render.ts`; the `TEMPLATES` array went with the file.

🧪 **The grep, with a positive control** so "found nothing" cannot be confused with "the grep failed":

```
POSITIVE CONTROL  'applyPlaceholderFills' in code: 8 hits  -> grep is working: true

hu_rate_email    code:0  migration-seed:1  OK
general_email    code:0  migration-seed:1  OK
chaser_email     code:0  migration-seed:1  OK
wa_intro         code:0  migration-seed:1  OK
wa_chaser        code:0  migration-seed:1  OK
```

**0 of 5** templates' copy appears in `app/`, `components/`, `lib/` or `scripts/`. The migration hits are
expected — the seed is where the copy now lives. 🧪 **0** imports of the deleted module remain.

⚠️ **One string in code is message text and stays there by design:** `OPT_OUT_FOOTER`. Item (6) requires
it be un-editable, so it is deliberately not in the table.

## No fallback, and the two failure states look different

There is no built-in copy to fall back to. The compose window distinguishes:

- **Could not load** (red): *"Templates could not be loaded… Nothing is being substituted from the bundle
  — there is no built-in copy any more."*
- **Loaded, none offerable** (grey): *"No templates are available for this prospect."*

The Templates tab distinguishes the same two, and names the migration and the `notify` when the route
reports `needsMigration` (PGRST205).

---

# 9. PROOFS, AND THE FAILURE EACH RULES OUT

**P1 · One code path** — 15 compositions byte-identical; `TemplatesPanel` has no substitution code.
*Rules out:* a preview that agrees until the day it does not.

**P2 · Token reference derived** — 8 + 5 read from the functions' own source.
*Rules out:* a reference that silently omits a working token.

**P3 · Unknown token safe** — `{{truk_name}}` → `[[truk_name]]`, listed unresolved, never literal.

**P4 · Seed shape** — 5 tuples × 6 values, quotes balanced, subjects null for the two WhatsApp rows.
*Rules out:* a seed that inserts nothing while looking correct. ⚠️ Structural only — I cannot run it.

**P5 · PGRST205 is real** — observed live against the database now.
*Rules out:* guessing what the not-set-up state looks like.

**P6 · Shared `/g` regex is not stateful** — `UNRESOLVED_RE` is now used by both `matchAll` and `replace`,
a classic `lastIndex` bug that works once and fails the second time. 🧪 6 interleaved calls returned
identical results; counts `[3,3,3,3]` and the replacement fired every time.
*Rules out:* a substitution that works on the first template you open and quietly misses on the next.

**P7 · 🔴 Inertness, all three lessons, measured** in headless Chrome against the project's own compiled
Tailwind with the unlayered block copied verbatim:

| control | class | computed | note |
|---|---|---|---|
| Templates text inputs (`type="text"`) | `text-sm` | **16px** | inert as expected; matches every other field; iOS-safe |
| the same input **without `type`** | `text-sm` | **14px** | escapes the attribute selector — the trap, avoided |
| channel / prospect `<select>` | `text-sm` | 16px | inert, consistent |
| body `<textarea rows={16}>` | — | **430px** | sized by `rows`; 16 × 26 + 14 = **430**, matching exactly |
| `from default` chip | `text-[10px]` | 10px | takes effect |
| preview `<pre>` | `text-[12px]` | 12px | takes effect |

🧪 All 6 `<input>` elements in `TemplatesPanel` carry a type (5 `text`, 1 `checkbox`); both in
`ComposeWindow` carry `type="text"`.

**P8 · Compiler** — `tsc --noEmit` **exit 0, 0 errors** at every step, including after deleting the module.

**P9 · Scope** — untouched: `lib/outreach-filter.ts`, `ScheduleEventsPopup`, `DiscoveryEventsPanel`,
`EventRowCells`, `ConfirmDeleteDialog`, the discovery-events route. (`app/api/admin/outreach/route.ts`
shows modified from an **earlier** task — the next-event predicate — not this one.)

---

# 10. EVIDENCE CLASS

- ✅ **Executed against live data:** the 17 / 214 / 0 `hu_ordering` split, 30 WhatsApp-confirmed, 3
  contacted (231/231 count-asserted); and the live PGRST205 from `outreach_templates`.
- ✅ **Executed, against compiled source:** P1, P2, P3, P6 — the mechanism and the original templates
  compiled with the repository's own TypeScript, then run.
- ✅ **Measured in a browser:** P7.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** the guard census, the one-table check on the new route, the
  grep-with-control, the `<input type>` audit, the seed validation.
- 🔴 **Reasoned only, NOT OBSERVED:** that the tab lays out well, that the list/editor split reads
  correctly, that reorder feels right. **No admin session is obtainable here — I saved no template,
  rendered no preview in a browser, and set no default. I claim nothing was written.**
- 🔴 **NOT RUN, AND CANNOT BE:** the migration. It is validated structurally only, and §2 says what each
  failure will look like when you run it. **Until it is applied and the `notify` issued, the Templates tab
  shows the amber "table is not there yet" panel and the compose window shows the red "could not be
  loaded" notice — which is the correct behaviour, not a bug.**
