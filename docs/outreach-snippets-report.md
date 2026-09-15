# The Snippets library — replacing the two placeholder-defaults panels

**15 September 2026.** One named value, defined once, pulled into every template that references it.
Two new files, one **unapplied** migration, four modified files, one deleted file.

---

## 0. THREE PREMISES IN THE BRIEF ARE WRONG. Read this before the rest.

**0.1 — `ios/App/App/Info.plist` is NOT modified.** The brief says it is and asks me to report it again.
READ: `git status --porcelain` at the start of this task listed only the four outreach files. Commit
`4d4e5b6 outreach` landed `Info.plist` along with everything else; the working tree was clean. There is
nothing to leave alone and nothing to report. I have not staged, committed or reverted anything.

**0.2 — there is no "settings row the Phase 3 global used".** Brief 0b offers it as an option for where a
snippet value should live. It does not exist. READ: Phase 3 kept its global defaults in **`localStorage`**
(`lib/outreach-globals.ts`, `OUTREACH_GLOBALS_KEY = 'hg.outreach.globals.v1'`), per browser, invisible to
any other device. There is no settings table anywhere in the repo.
*Positive control:* the same search over the same file set finds `outreach_templates` in six places, so
the search works — the absence is real, not a broken grep.

**0.3 — a rail tab for Snippets is impossible.** Brief 0d asks where the view belongs. READ: the
Templates tab's rail renders inside `{selected && (` — it exists only when a template is selected. A
library that spans *all* templates cannot hang off a per-template rail. It is a **top-level view switch**
on the Templates tab instead (`view: 'templates' | 'snippets'`).

---

## 1. Phase 0 answers

**0a — the `[[…]]` tier, end to end.** `unresolvedIn` (`lib/outreach-template-render.ts:283`) scans
subject+body for `[[name]]`. `defaultFillsOf` supplies values; anything left unfilled renders *visibly*
as `[[name]]` and is listed in `ComposedMessage.unresolved`, which the compose window shows as a prompt.
`MUST_RESOLVE = new Set(['demo_link'])` (line 209) refuses to be auto-filled at all — unchanged.

**0b — where a snippet value lives: a new table.** `outreach_snippets (name text primary key, value text
not null default '')`. Not localStorage (per-browser, which is the Phase 3 defect), and **not** fanned out
into `placeholder_defaults` — copying one value into N template rows is the exact complaint this replaces.

**0c — existing `placeholder_defaults` values are left exactly where they are.** Not read, not migrated,
not deleted. The standing rule is that no `outreach_templates` row may be written without sign-off, and a
migration that rewrote them would break it. At compose time the snippet **wins**; the shadowed template
value stays readable so the editor can warn about it (§4).

**0d — top-level view switch on the Templates tab.** See 0.3.

---

## 2. What was built

| File | State |
|---|---|
| `supabase/migrations/20260916_outreach_snippets.sql` | NEW — **NEVER EXECUTED**. Its header says so. |
| `lib/outreach-snippets.ts` | NEW — pure: `snippetIndex`, `snippetMapOf`, `isUnset`, `isAskPerTruck` |
| `app/api/admin/outreach-snippets/route.ts` | NEW — `verifyAdmin` + service-role; names only `outreach_snippets` |
| `lib/outreach-template-render.ts` | MODIFIED — `defaultFillsOf` takes snippets; `fillSourceOf`, `shadowedTemplateValue` |
| `components/admin/TemplatesPanel.tsx` | MODIFIED — Snippets view in, both defaults panels out |
| `components/admin/ComposeWindow.tsx` | MODIFIED — reads snippets; badge says `from snippet` |
| `components/admin/OutreachPanel.tsx` | MODIFIED — non-fatal snippets fetch, passed down |
| `lib/outreach-globals.ts` | **DELETED** — the Phase 3 localStorage layer, no importers left |

**⚠️ THE MIGRATION HAS NOT BEEN RUN.** I have not executed it and I cannot see the database. Until it is
applied *and* `notify pgrst, 'reload schema';` has run, the API returns `hasSnippets: false`, the library
renders disabled with that instruction on screen, and every placeholder is asked per truck exactly as it
is today. Nothing regresses in the meantime.

I am not claiming anything about what is applied from the file's header. That has misled this series
twice. §7 has SQL for you to run if you want to know.

---

## 3. S1–S3, and what the UI actually shows

**S1 — one row per distinct name.** The library is driven by `snippetIndex(templates, unresolvedIn)`,
which folds every occurrence in every body into one entry per distinct name, most-used first.

**S2 — the blast radius, by real label.** Each row lists the **labels** of the templates that use it —
"General approach — listed on Village Foodie", "Chaser — already contacted" — not a count, because
"4 templates" does not tell you *which* four, and seeing that a change reaches the general approach *and*
the chaser before you make it is the whole reason the screen exists.

- **A template with no label**: `label` is `not null` in the schema (READ, create-table line 9), so this
  cannot arise from the database. The fallback is defensive only: `label → slug → id`.
- **An INACTIVE template**: **listed, struck through, and titled "retired, but still uses this snippet"**.
  Not hidden. It is still a template the value reaches if it is ever switched back on, and hiding it
  would understate the radius — which is the one thing this view exists to state correctly.

**S3 — blank-on-purpose vs never-set: the UI DOES distinguish them.** Three states, one small caption
under the name:

| State | Caption | At compose time |
|---|---|---|
| a row with a value | `set` | filled in every template |
| a row with `''` | `ask per truck` | prompts |
| no row at all | `never set` | prompts |

The two blanks behave **identically** when composing — both prompt — and that is correct; the difference
is only ever information for you. `isAskPerTruck` and `isUnset` are separate functions precisely so the
caption can tell a decision that was made from one nobody has looked at yet.

**S4 — the template editor is read-only about snippets.** "Snippets used here" lists each name with its
current value (or "asked per truck" / "not set — asked per truck") and a button to the Snippets view.
No input. One place to edit, one place to look.

**S5 — both removed.** The global-defaults panel is gone. `fmtWhen`, `daysSince` and the amber-"none" /
red-"stale"-past-60-days badges are gone with it; comments at lines 178 and 340 record why. The route's
`set_defaults` action is deliberately **kept** — removing an API action is not a UI change, and a stored
per-template value is still readable and still surfaced (§4).

---

## 4. Precedence: a legacy value AND a snippet

**THE SNIPPET WINS.** `defaultFillsOf` applies template defaults first, then overwrites with snippets:

```ts
for (const [k, v] of Object.entries(tpl.defaults ?? {})) { … out[k] = v.value }
for (const [k, v] of Object.entries(snippets ?? {}))     { … out[k] = v }   // snippet last = snippet wins
```

If the snippet did not win, "one place to edit" would be a lie — you would edit Snippets and a template
would quietly keep sending its own old value.

**And the UI says so, in both places.** `shadowedTemplateValue` returns the losing value, so the template
editor shows an amber line — *overrides a stored "…"* — naming what is being shadowed. The compose
window's badge reads `from snippet` or `from template`, so the composed message states its own source.
Nothing is silently deleted; the old value stays in the row, outranked and visible.

---

## 5. Verification

Every assertion below was first pointed at a deliberately broken variant, and **each control FAILED
before any of it was accepted as proof.**

```
── CONTROLS (each must FAIL) ──
  ✓ FAILED as required  C1 blind scanner (returns []) → index must be empty
  ✓ FAILED as required  C2 per-occurrence index → distinctness check must catch the duplicate
  ✓ FAILED as required  C3 index over rows with labels stripped → label check must catch it
  ✓ FAILED as required  C4 both blank states collapsed → S3 distinction check must catch it
```

C2 is the one that matters most: `[[my rate]]` occurs in four templates, so an index that emitted per
occurrence rather than per distinct name would produce it four times — the control confirms the S1
assertion actually notices.

**The real scanner (`unresolvedIn`) over the real seeded bodies**, parsed straight out of the insert in
`20260909_outreach_templates.sql`:

```
  [[my rate]]                             ×4  ← General approach · Chaser — already contacted · WhatsApp — short intro · WhatsApp — short chaser
  [[comparison to their current setup]]   ×1  ← General approach — listed on Village Foodie
  [[link]]                                ×1  ← Hatches Up — ordering costs
  [[X]]                                   ×1  ← Hatches Up — ordering costs
  [[your rate]]                           ×1  ← Hatches Up — ordering costs
```

**🔴 THIS COVERS 5 TEMPLATES, NOT 9.** The brief asks for all nine. Five are seeded and I can read their
bodies in the migration. **The other four were created through the admin Templates tab and their bodies
exist only in the database, which I cannot read.** The running library scans whatever the API returns, so
at runtime it covers all nine — but my offline proof covers the five I can actually see, and I am not
going to present five as nine. §7 has SQL that produces the real list from all nine rows.

**And the deeper caveat, which holds even at nine:** the input is the template **BODIES**. The library is
exactly as right as they are. A placeholder misspelt in one body (`[[my rate ]]`, `[[My rate]]`) is a
different name and gets its own row — correctly, because the renderer would treat it as different too.

```
── ASSERTIONS ──  (15/15)
  ✓ S1 one row per distinct name
  ✓ S1 every name the scanner found is in the library
  ✓ S2 [[my rate]] names exactly the 4 templates whose bodies contain it
  ✓ S2 a single-use name names exactly one template
  ✓ ONE value reaches all 4 templates (no per-template copy)
  ✓ …and it is stored ONCE
  ✓ S3 blank-on-purpose is distinguishable from never-set
  ✓ S3 a blank value still prompts at compose (never fills)
  ✓ S3 a blank snippet still prompts: renderWithFills lists it unresolved
  ✓ …and a set snippet does NOT (control on the same body)
  ✓ precedence: snippet WINS over a legacy placeholder_defaults value
  ✓ precedence: the shadowed legacy value is still readable (so the UI can warn)
  ✓ precedence: with no snippet, the legacy value still applies
  ✓ fillSourceOf reports which one won
  ✓ MUST_RESOLVE still refuses a snippet fill for demo_link
```

The blank-prompts pair runs end to end through `renderWithFills` — the same function the compose window
uses — on the real `chaser_email` body, with the set/blank cases as controls on each other. An earlier
draft of that assertion was a tautology (`R.substitute ? 'x' : 'x'`, both branches identical); it proved
nothing and was replaced rather than reported.

**No `outreach_templates` row is written.** Searched the whole repo for every `from('outreach_templates')`
and filtered to mutations. Every `insert`/`update` sits in `app/api/admin/outreach-templates/route.ts`,
which `git diff --stat` shows is **unmodified**. My three new files mention the table five times and
every one is a `//` or `--` comment (quoted them verbatim to check).
*Positive control:* the same grep shape does find the snippets route's own `.upsert(` and `.delete(`, so
it detects writes when they exist.

**Untouched, checked rather than assumed:**
- **Outside-click on the compose window still does NOT close it.** No `onMouseDown`/backdrop close
  handler exists; my diff hunks in `ComposeWindow.tsx` are lines 23–176 and 587–593, and the fix's
  comment block is at 494–501. *Positive control:* `onClose` is still referenced 7× (the explicit buttons).
- **The `{{token}}` tier, the malformed guard, `MUST_RESOLVE`.** They live at lines 209–456 of
  `outreach-template-render.ts`; the entire diff is at **629+**. All four new tokens still declared.
- **Modal mobile rounds 1–3.** `max-sm:grid-cols-2`, `max-sm:min-w-0` and `ProspectMetaFacts` are all in
  `OutreachPanel.tsx`, which I did modify — so the decisive check is whether any added or removed line
  mentions them. **None does.** *Positive control:* the identical filter on `snippet` returns my changes.

**tsc:** clean. **Lint:** the four files that exist in both trees, same eslint, same config, HEAD
(`4d4e5b6`) in a detached worktree vs the working tree — **19 errors, 1 warning on both sides, and every
rule count identical**. The two new files have **no** HEAD counterpart and lint **0/0** on their own;
positive control — appending `(x: any) => x` makes eslint flag them, so the 0 is a real pass.

---

## 6. The Templates tab on a phone

One line, as asked: the snippet rows wrap — name, input, template chips and Save each take a full-width
line under ~560px instead of truncating — and nothing in the modal's mobile work is touched, because the
Snippets view is a different component in a different file.

---

## 7. SQL for you — I have not run any of it

**A. The real distinct snippet list across all 9 rows** (the four I cannot read included):

```sql
select
  m[1]                                   as snippet_name,
  count(*)                               as templates_using,
  string_agg(t.label, ' · ' order by t.sort_order) as used_by
from public.outreach_templates t
cross join lateral regexp_matches(coalesce(t.subject,'') || E'\n' || t.body, '\[\[([^\]]+)\]\]', 'g') as m
group by m[1]
order by count(*) desc, m[1];
```

**B. Is there a legacy value anywhere that a snippet would shadow?** (I was told these are all `{}`;
this is how to confirm it rather than take it on trust.)

```sql
select slug, label, active, placeholder_defaults
from public.outreach_templates
where placeholder_defaults <> '{}'::jsonb
order by sort_order;
```

**C. Has the migration been applied, and does PostgREST know?**

```sql
select to_regclass('public.outreach_snippets') as table_exists;
select name, value, updated_at from public.outreach_snippets order by name;
```

If A returns names and C returns `null`, apply
`supabase/migrations/20260916_outreach_snippets.sql` and then run `notify pgrst, 'reload schema';` —
without the notify the API answers from a cached schema and the library stays disabled.

---

## 8. What I did not do

- Did not create, edit, seed, activate or deactivate any `outreach_templates` row, or any
  `placeholder_defaults`, `serves_kind` or `serves_lead_type` value. The mechanism ships **empty**.
- Did not apply the migration or run any SQL.
- Did not stage, commit or revert anything.
