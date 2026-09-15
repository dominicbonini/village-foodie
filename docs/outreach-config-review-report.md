# Outreach configurability — provenance, the `[[…]]` tier, and a rules layer

**15 September 2026. READ-ONLY.** No code changed, no migration, no database query. The only file
written is this report. 🔴 **No `outreach_templates` row was created, edited, seeded, activated or
deactivated, and nothing below proposes that I do so** — every template action named here is Dominic's.

⚠️ **I CANNOT SEE A SCREEN.** Layout statements are READS of class chains and declared widths.

---

# 🔴 PREMISE CORRECTIONS — THREE

## 1 · 🔴 THE FREEZE IS NOT WRITING — BUT NOT FOR THE REASON THE BRIEF SUSPECTS

§F(i) asks whether last task's removals broke the `lead_type_at_first_contact` write. **They did not.**
🔎 The write lives in `persistFollowUpAfterLog` inside **`Detail`** — the modal — and last task removed
inline editors from **`Row`** — the list. 🧪 Both call sites are intact (`submitLog`, and the compose
window's `onLog`), and `shouldFreezeLeadType(k, p, hasLeadTypeFreeze)` is still called.

🔴 **It is not writing because the migration has never been applied.** The third argument is
`hasLeadTypeFreeze`, which comes from the route's capability probe. `supabase/migrations/20260914_outreach_lead_type_freeze.sql`
is **untracked and unapplied** — I wrote it and never ran it. While that is true, the flag is `false`,
`shouldFreezeLeadType` returns `false` for every prospect, and **all 231 fall back to the live
derivation.**

⚠️ **The brief is right that it fails silently**, and the only visible signal is the modal's Lead type
label reading **"(live)"** rather than "(frozen)". **One action fixes it: apply the migration** (§SQL 4).

## 2 · The "46/34/30/45" lead split was mine and was wrong — the corrected figures are Dominic's

The brief notes the data showed **46/6/25/78**. 🔴 **That figure came from my own fixture, not from the
database** — it was a synthetic population built to *check the ordering logic*, and I labelled its
buckets with his earlier prose figures. The ordering logic was verified; **the distribution was never
measured** and I should not have printed it as though it were. §SQL 3 measures it properly. The one
figure I re-derive below from source rather than prose is `[[my rate]]`: **4 of 5 seeded rows**.

## 3 · A file appeared in the tree that is not mine

`ios/App/App/Info.plist` is newly modified and belongs to none of this series. Flagged, untouched.

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

🔴 **Nothing new is committed.** `HEAD` is still `e8b59e5`. The tree carries **five** bodies of work: the
prune fix, the queue, the lead-type freeze, the list columns, and this report.

### Admin-only — confirmed

`OutreachPanel` ← `app/admin/page.tsx` only. `TemplatesPanel` / `ComposeWindow` ← that tree only. Both
routes behind `verifyAdmin` with a **404, not 401**, so a non-admin cannot confirm the route exists.
🔴 **Two shared files, both READ-ONLY here and unmodified:** `lib/whatsapp-hint.ts` (shared with the
customer-facing live button) and `components/admin/InlineField.tsx` (shared with two other admin panels).

---

# A · 🔴 TEMPLATE PROVENANCE

## Every place in the repository that can write `outreach_templates` — there are exactly two

🧪 **The search:** `outreach_templates` alone, whole repo, no extension scoping, intersected with
`insert|update|upsert|delete|seed`. *Positive control over the same technique:* the identical search for
`outreach_prospects` returns writers in three files, so it finds writers where they exist.

| # | Writer | What it writes | When it runs | Idempotent? |
|---|---|---|---|---|
| 1 | `supabase/migrations/20260909_outreach_templates.sql:81` | **5 rows**, `sort_order` 10/20/30/40/50 | **Only when Dominic runs it by hand** in the SQL editor | 🟢 **Yes** — `on conflict (slug) do nothing` |
| 2 | `app/api/admin/outreach-templates/route.ts` POST | `create_template` (insert) · `update_template` (update) · `set_defaults` (update) | **Only from the Templates tab, in a browser, with an admin session** | n/a — each is a deliberate click |

🧪 **There is no third.** `scripts/` contains **zero** files mentioning outreach at all — *positive
control:* `scripts/` does hold real scripts that write other tables (`backfill-discovery-dedup.mjs`,
`backfill-venue-id.ts`, …), so the directory search works. **No fixture, no seeder, no CI task, no
cron.** 🔎 `verifyAdmin` gates the route, so nothing server-side or automated can reach it.

## The seed, read rather than summarised

🔎 It creates exactly five slugs — `hu_rate_email`, `general_email`, `chaser_email`, `wa_intro`,
`wa_chaser` — and its own comment states the re-run behaviour:
> *"🔴 `on conflict (slug) do nothing` — re-running this file NEVER overwrites an edited template."*

**On re-run it inserts nothing and changes nothing.** It cannot be the source of an unexpected row, and
it cannot have overwritten an edited one.

⚠️ **Its header is stale and worth correcting:** line 5 says *"⛔ NOT APPLIED"*, while
`docs/reference-manual.md` §52.2 says *"applied 9 September"*. That is the stale-header trap this repo
records — in the safe direction this time, but it should be fixed.

## 🔴 WHERE THE FOUR NON-SEED ROWS CAME FROM — traced to the character

🔎 The Templates tab's `createTemplate`: a `window.prompt` for a **name**, the slug **derived** with the
repo's `createSlug`, and the row created with a starter body.

🧪 **Run `createSlug` on the names a human would type:**
```
   createSlug("Chaser 2") → "chaser-2"
   createSlug("Chase 1")  → "chase-1"
   createSlug("Test")     → "test"
```
🧪 **The starter body is `'Hi,\n\n'` — exactly 5 characters.** Dominic's own earlier note recorded
*"`chaser-2` has a **5-character** body"*. 🧪 **The route defaults `sort_order` to 999** when the caller
sends none, and the UI sends none — which is why three rows sit at 999 while the seeded five sit at
10–50.

🔴 **That is a complete signature, and it is the Templates tab's, not a script's:** a hyphenated slug
that is exactly `createSlug(<a typed name>)`, `sort_order` 999, and a body left at the 5-character
starter. **These rows were created by pressing "new template" in the browser and typing a name.**

## Did anything in this series write a template row? — **No**

**Both writers are unreachable from an agent.** Writer 1 needs someone to paste SQL into the Supabase
editor; writer 2 needs a browser with an admin cookie. 🧪 In this series the only code ever executed
against the live database was the **prune diagnostics**, which issue `select` only, and the offline
harnesses, which run against transpiled modules with no network. **Every task's instruction was "write
SQL; do NOT run it", and none was run.**

⚠️ **What I can prove is that no mechanism exists and none was invoked. What I cannot prove is a
negative about the database itself** — only `created_at` can do that, which is why §SQL 1 exists. **If
it shows a row created at a time Dominic was not at the keyboard, that is a finding and I want to know.**

---

# B · THE `[[…]]` TIER AND `my rate`

## End to end, READ

```
UNRESOLVED_RE = /\[\[([^\]]+)\]\]/g          the whole detector — anything between [[ ]]
unresolvedIn(text)                            distinct names, first-appearance order
applyPlaceholderFills(text, fills)            replaces [[name]] when fills[name] is non-blank
defaultFillsOf(tpl)                           tpl.defaults → { name: value }, must-resolve keys dropped
```
🔴 **There is no vocabulary.** Unlike `{{token}}`, a `[[placeholder]]` is *anything* the author writes —
the resolver never needs to know the name, which is exactly why this tier can be data where tokens
cannot (§C).

**In the compose window:** `tokens` = `unresolvedIn(source)` minus must-resolve names → one input per
placeholder; `fills` holds the values; `fromDefault` records which came from a stored default and when
it was last changed; a value is applied **on the way out** (preview, copy, send, log), never written into
the textarea — so a hand edit and a field value cannot destroy each other.

## `placeholder_defaults` — what reads it, what shape, and why it is `{}`

**Shape**, 🔎 from the writer: `{ "<name>": { "value": "<text>", "updated_at": "<iso>" } }`. The
timestamp is stamped **server-side, per placeholder, and only when the value actually changes** — so
"how old is this default" is a fact the server recorded.

**Readers:** the route's `SELECT`; `TemplatesPanel` (the editor, and the preview via `defaultFillsOf`);
`OutreachPanel` maps it onto `MessageTemplate.defaults`; `ComposeWindow` pre-fills from it on template
select.

🔴 **The mechanism is complete and shipped. It is `{}` on all 9 rows because nobody has typed into it.**
🔎 The editor is on the Templates tab: one input per `[[placeholder]]` found in the body, with an age
badge — amber **"none"** when unset, red **"stale"** past 60 days. **Setting a value is: pick the
template → type in the box → Save.** Nothing is missing.

## How Dominic could set his rate once

🧪 **Re-derived from the seed, per row:** `[[my rate]]` appears in **4 of the 5** seeded templates —
`general_email`, `chaser_email`, `wa_intro`, `wa_chaser`. Not `hu_rate_email`, which instead carries
`[[your rate]]` (the prospect's *current* Hatches Up rate), `[[link]]` and `[[X]]`. ⚠️ Whether any of the
four UI-created rows use it is a database question — §SQL 2.

| Option | What exists | What would be new | Honest cost |
|---|---|---|---|
| **1 · Use the editor that is already there** | 🟢 **Everything.** Editor, storage, age badge, pre-fill | nothing | 🔴 **It is PER TEMPLATE.** He types the rate into **4** templates (plus any of the 4 UI rows). Change the rate → edit 4 again. It is "once per template", not "once" |
| **2 · A global default, falling back per template** | the merge point exists — `defaultFillsOf` is the single funnel | a place to store it (a settings row, or an env var) + a merge in `defaultFillsOf` | 🟢 Genuinely once. ⚠️ **Two sources for one value** — the age badge would need to say which won, or a stale global hides behind a fresh-looking field |
| **3 · Promote `my rate` to a `{{token}}`** | the resolver, the reference, the guard | a `case 'my_rate'` + a value source | 🔴 **Moves it INTO code** — the opposite of what he is asking for — unless the value still comes from data. And 🔴 **it would require editing the 4 template bodies**, which is his call alone |
| **4 · Seed the default when a template is created** | `create_template` | a default in the route | 🔴 **Writes on his behalf.** Against the standing rule in spirit even though it is a default and not a body |

🔴 **Option 1 is available today with no code at all** — and its limitation ("once per template") is
exactly the thing he is objecting to. **Option 2 is the smallest change that actually means "once".**

---

# C · WHAT ELSE IS HARDCODED

🔎 Every value below is READ from source. **Worth it?** is my assessment; **schema?** is whether it needs
a migration; **validation?** is what would have to exist if it became data.

| Value | Symbol · file | Worth configuring? | Schema? | Validation needed |
|---|---|---|---|---|
| **Follow-up intervals** 3 / 7 / 14 / null | `FOLLOW_UP_DAYS` · `lib/outreach.ts` | 🟢 **YES — this is data, plainly.** "Chase after 3 days" is a business decision he already changed once (14 was my choice, flagged as such) | 🟢 No — a settings row or a column on a rules table | integers ≥ 0, and the terminal rung must stay null |
| **Rung → template** | `STEP_TEMPLATE` · `lib/outreach-step.ts` | 🟢 **YES — this is the §D ask** | depends on §D option | a slug that resolves |
| **Stage + hu_ordering → template** | `suggestTemplateId` · `lib/outreach-template-render.ts` | 🟡 **Probably delete rather than configure** — see §D, it is a second selector | — | — |
| **Lead-type derivation + its 4 names** | `LEAD_TYPES`, `leadTypeOf` · `lib/outreach-step.ts` | 🟡 **The NAMES could be data; the DERIVATION should not.** The rule reads `hu_ordering`, `hu_map`, `show_on_vf`, `excluded` and an event count — that is code | no | if the names are data, the `?lead_*` conditions must be generated from them or they drift |
| **The ladder** `1_first_contact` … | `CONTACT_KINDS` · `lib/outreach.ts` | 🟡 **Borderline.** Four touches is a decision; but the values are **stored in `outreach_contacts.kind`**, so renaming one orphans history — 🧪 exactly what happened with `first_contact` → `1_first_contact`, leaving 8 of 17 rows unreadable | no | 🔴 a migration over live rows for any rename — the reason to leave it alone |
| **Stage values** | `OUTREACH_STAGES` · `lib/outreach.ts` | 🔴 **NO.** Stored on 231 rows, referenced by `TERMINAL_STAGES` and the queue's stop logic. Adding one is cheap; renaming one is a data migration | no | — |
| **Terminal stages** | `TERMINAL_STAGES` · `lib/outreach-step.ts` | 🟢 **YES, cheaply** — "which stages stop the sequence" is a policy, not a mechanism | no | must be a subset of `OUTREACH_STAGES` |
| **Token vocabulary** (12) | `resolvedValue` cases | 🔴 **NO, AND THIS IS THE CLEAREST "CODE IS RIGHT".** A token exists because the **resolver knows how to compute it**. A configurable token name would be a name with nothing behind it. 🧪 The reference is already *derived from the code* so it can never go stale | — | — |
| **Condition names** (9) | `conditionMet` cases | 🔴 **NO, same reason** — each is a predicate over the context. ⚠️ **But the four `?lead_*` are a special case:** they are pure equality against `leadType`, so if lead-type names ever became data these four should be generated, not hand-written | — | — |
| **`MUST_RESOLVE`** = `{demo_link}` | `lib/outreach-template-render.ts` | 🟡 **Marginal.** It is a safety rule ("never send this unresolved"), not a preference. Configurable means switchable off | no | must name a real token |
| **`HATCHGRAB_BASE`** | `lib/outreach-template-render.ts` | 🟢 **Already configurable** — `process.env.NEXT_PUBLIC_HATCHGRAB_URL` with a working production default | — | — |
| **`CONTACT_CHANNELS`** (4) | `lib/outreach.ts` | 🔴 **NO.** Stored on contact rows; `email`/`whatsapp` are also the template CHECK constraint | — | — |
| **Lead ranking** | `LEAD_RANKS`, `leadOf` · `lib/outreach.ts` | 🟡 **The ORDER could be data; the host tests should not be** | no | — |

🔴 **THE HONEST SUMMARY: three things are genuinely data wearing code's clothes** — the **intervals**,
the **rung → template map**, and **which stages stop the sequence**. Everything else is either a
mechanism the resolver must know (tokens, conditions, channels) or a stored value whose rename costs a
migration (kinds, stages). **Making it all configurable would trade a small amount of editing for a
large amount of validation, and would put a "send anyway" switch next to a guard.**

---

# D · THE RULES LAYER

## What already exists — and 🔴 there are already TWO selectors, which is half the problem

| Mechanism | Keys on | Where it is used |
|---|---|---|
| `suggestTemplateId` | `stage` + `hu_ordering` → 3 hardcoded slugs | 🔎 `OutreachPanel:2144` — **display only**, appends "(suggested)" to a picker option |
| `templateForStep` / `STEP_TEMPLATE` | **rung × channel** → slug | 🔎 `OutreachPanel:2398` — the composer's actual pre-selection |
| `?lead_*` conditions | **lead type**, inside the body | the rendered text |

🔴 **So lead type reaches the message through the CONDITIONS, and template choice ignores it entirely.**
A rules layer keyed on lead type would be the first mechanism to make that choice — which is exactly why
the overlap question below matters.

## The three options

### Option 1 — a rules TABLE (lead type × rung/stage × channel → template)

| | |
|---|---|
| **Schema** | 1 table: `(lead_type, kind, channel, template_slug, priority)` + FK or a validated slug. 1 migration |
| **UI** | A new tab or section: list rules, add, delete, reorder. The largest cost by far |
| **No match** | Fall back to `STEP_TEMPLATE`, or to "nothing pre-selected" — the composer already handles a null (`templateForStep` returns a **reason**: `no_step` / `no_channel` / `slug_absent`) |
| **Two match** | 🔴 **Must be decided, not left.** A `priority` column, or most-specific-wins. Undefined precedence is how two rules become a coin toss |
| **Fit** | 🔴 **Heaviest.** 4 lead types × 4 rungs × 2 channels = **32 cells**. With 9 templates most cells are empty or duplicated |

### Option 2 — columns ON `outreach_templates` declaring what a template serves

| | |
|---|---|
| **Schema** | `serves_kind text`, `serves_lead_type text` (nullable = any). 1 migration, no new table |
| **UI** | 🟢 **Two dropdowns on the Templates tab he already uses.** `EDITABLE` gains two names |
| **No match** | Fall back to `STEP_TEMPLATE` |
| **Two match** | Possible — two templates both claiming (chase 1, hu_ordering). Needs `sort_order` as the tie-break, which **already exists** |
| **Fit** | 🟢 **The mapping lives with the thing it describes** and survives a rename. 🔴 **But it ships EMPTY and does nothing until Dominic fills it in** — and under the standing rule, filling it is his |

### Option 3 — keep selection in code, vary the text with conditions (as built)

| | |
|---|---|
| **Schema** | none |
| **UI** | none |
| **No match** | already handled |
| **Two match** | cannot happen — one rung, one channel, one slug |
| **Fit** | 🟢 Zero cost, working today. 🔴 **But `STEP_TEMPLATE` is a hardcoded slug map — the thing he is objecting to** |

## 🔴 DO THE TWO MECHANISMS COEXIST, OR SHOULD ONE REPLACE THE OTHER?

**They overlap, and the overlap is real but not symmetrical.** A rule picks *which template*; a condition
varies *the text inside one*. They answer different questions, and the sensible division is:

- **Conditions handle variation that shares a structure** — the same approach, one sentence different per
  lead type. That is what the four `?lead_*` lines do, and it is why one template covers four types.
- **A rule is only needed when the templates genuinely differ** — a different subject, a different ask, a
  different length. 🧪 The seed already has that shape: `hu_rate_email` is a *different pitch*, not a
  variant sentence, which is why `suggestTemplateId` was written to choose it.

🔴 **What they must NOT both do is decide on lead type.** If a rule selects by lead type *and* the
selected template still carries four `?lead_*` lines, three of those lines are dead in every message and
the author cannot tell which. **Whichever is chosen, lead type should drive exactly one of them.**

## 🔴 The `{{demo_link}}` constraint

🔎 `MUST_RESOLVE = new Set(['demo_link'])`: `substitute` emits `[[demo_link]]` even when a fallback is
declared, `defaultFillsOf` drops the key, and the compose window **refuses all three exits** while it is
unresolved. It resolves for **1 of 231**.

**So any rule that could select a demo-link template needs one of:** a precondition on the rule
(`requires_demo`), a fallback rule, or the operator seeing the refusal and choosing again. 🧪 **Today
this never fires** — `{{demo_link}}` appears **0 times** in the seeded bodies (*positive control:*
`{{truck_name}}` appears 7 times there, so the search finds tokens that exist). It becomes live the
moment a template uses it.

---

# E · TWO LIST BEHAVIOURS

## E1 · Default sort on NEXT ACTION

🔎 **Today:** `const [sort, setSort] = useState<SortState>(null)`. `null` means the **priority sort** —
🔎 a 5-way rank on `isHatchesUp(platform)` + `hasEmail` + `stage === 'not_contacted'`, which **never
reads `next_action_at`**. `toggleSort` cycles asc → desc → null. ⚠️ **Sort is NOT persisted** — only
`filter` goes to `localStorage` (`hg.outreach.filter.v1`); sort and the view toggle reset on reload.

🔴 **THE FACT THAT DECIDES THIS: nulls sort last in BOTH directions.** 🔎 `compareBySort`:
> *"Nulls last, ALWAYS — independent of direction."*

🧪 Most prospects have `next_action_at` **null** — the column is written only when a contact is logged,
and only 9 prospects have contacts. So:

| Ordering | Top of the list | Bottom |
|---|---|---|
| **asc** (oldest first — the work-queue convention) | the **most overdue** dated row | the ~222 nulls |
| **desc** (newest first — what Dominic asked for) | the **furthest-future** dated row | the ~222 nulls |
| **today's default** (priority) | Hatches Up + has email + not contacted | everything else |

🔴 **Either way the ~222 undated rows go to the bottom, so this choice only orders about 9 rows today** —
and in the **All** view it would push 222 dashes below them. In the **Due work** view (70 rows, all
actionable) it is far more useful. ⚠️ **"Newest first" also puts the row you are *least* urgent on at the
top**, which is the opposite of a work queue — that is the trade, stated rather than resolved.
⚠️ And note "newest" is ambiguous: newest *next action* (a future date) is not the same as *most
recently contacted* — `LAST CONTACTED` is the column for that.

## E2 · Make the NEXT ACTION cell open the prospect

🔎 **Today** the truck name is a real `<button onClick={() => onOpen(p.id)}>` — the file's own note says a
`<button>` is used rather than a div "so it is in the tab order, takes focus, and activates on Enter and
Space for free". The NEXT ACTION cell is a plain `<td>` with a `<span>` and no handler.

**Cost: small, and consistent with the existing design.** The same `onOpen(p.id)` handler, wrapped the
same way. 🧪 **It does NOT break the zero-href property** — that property is about a row *contacting*
someone; there is still no `href`, `mailto:`, `tel:` or `wa.me` anywhere in a row, and opening the modal
is what every other interactive cell already does.

⚠️ **Three things to decide with it:** whether the whole cell or just the date is clickable (the file
already rejected a row-level `onClick` — 🔎 *"the `<tr>` carries no onClick"* — so a mis-click while
scanning 231 rows cannot open a modal); whether an empty cell (`—`, ~222 rows) is clickable too; and
that a second focusable element per row lengthens the tab order.

---

# F · FROM THE LAST BUILD

**(i) The freeze — §Premise 1.** The write path is intact; the migration is unapplied, so the gate is
false and every prospect uses the live derivation. **Apply it (§SQL 4) and it starts working.** ⚠️ It
freezes **going forward only** — the 9 prospects already mid-sequence stay on the live derivation unless
Dominic sets their type by hand, which is deliberate (a backfill would stamp today's drifted value and
freeze it as if it were evidence).

**(ii) The leads as links.** 🔎 Today the CONTACT cell renders the **host** as text with the full URL in
the `title`. Making it an `<a href target="_blank" rel="noreferrer">` would be **one element** — 🔎
`safeHref` already exists in this file for exactly this (it rejects `javascript:` and fixes scheme-less
values, 🧪 `shikashack.co.uk` being the recorded case).

🔴 **It would break the stated property, and the property is worth restating precisely:** *"nothing in a
row contacts anyone"*. A storefront link **does not contact a prospect** — it opens a competitor's page
so he can find an address. **The zero-`href` count was my evidence for the property, not the property
itself.** So the honest position: linking these does not violate the intent, but it does end the simple
"grep says zero" proof. **His call; one line either way.**

---

# G · OPTIONS FOR DOMINIC

**G1 · Template provenance.** The four non-seed rows carry the Templates tab's fingerprint — a
`createSlug` slug, `sort_order` 999, a 5-character starter body. **Run §SQL 1** to see `created_at` on
all 9. *If any timestamp is one you cannot account for, tell me — that would be a real finding.*
*Question: delete or deactivate `test` and the empty `chaser-2`?* 🔴 **Yours to do; I will not.**

**G2 · The rate, typed once.** Option 1 works today with no code but means **4 templates**. Option 2 (a
global default merged in `defaultFillsOf`) is the smallest change that genuinely means once.
*Question: live with per-template, or add the global?*

**G3 · What to make configurable.** Three candidates are honestly data: **the intervals**, **the rung →
template map**, **which stages stop the sequence**. Tokens and conditions are code because the resolver
must know them. *Question: all three, or intervals first?*

**G4 · The rules layer.** Option 2 (two columns on `outreach_templates`) is much the cheapest and puts
the mapping where he already edits. 🔴 **It ships empty and stays inert until he fills it in.**
*Question: columns-on-templates, a rules table, or leave selection in code?* And: *should lead type
drive template CHOICE or template TEXT — because it should not drive both.*

**G5 · The sort.** Nulls land last in both directions, so today the choice orders ~9 rows and sends 222
dashes to the bottom of the All view. *Question: newest-first as asked, oldest-first as a queue, or
leave the priority sort and default the **Due work** view instead?*

**G6 · The NEXT ACTION cell.** Small, consistent, no href. *Question: whole cell or just the date, and
should the ~222 empty cells be clickable?*

**G7 · Apply the freeze migration.** 🔴 Until it runs, the lead type is not frozen for anyone and the
only sign is the modal reading "(live)".

---

# SQL — for Dominic to run; **nothing here was executed**

🔴 **None of this writes. There is no `insert`, `update` or `delete` against `outreach_templates`
anywhere below** — the standing rule applies to SQL I hand over as much as to code I write.

**1 · 🔴 TEMPLATE PROVENANCE — which rows came from where.** The seed sets `sort_order` 10–50; the
Templates tab defaults it to **999** and starts the body at 5 characters:

```sql
select t.slug,
       t.label,
       t.channel,
       t.sort_order,
       t.active,
       length(t.body)            as body_chars,
       t.created_at,
       t.updated_at,
       (t.created_at = t.updated_at) as never_edited,
       case
         when t.slug in ('hu_rate_email','general_email','chaser_email','wa_intro','wa_chaser')
           then 'seed migration (20260909)'
         when t.sort_order = 999 then 'Templates tab — new template button'
         else 'Templates tab (sort_order edited since)'
       end as likely_origin
  from public.outreach_templates t
 order by t.created_at;
```

⚠️ **Read `created_at` against your own calendar.** A row whose `body_chars` is **5** is one created via
the tab and never written — that is the `'Hi,\n\n'` starter, not a corruption. 🔴 **If any `created_at`
falls at a time you were not using the Templates tab, say so — the only two writers in the repository
both require a human, and that would mean my inventory is incomplete.**

**2 · The `[[…]]` placeholders across all 9 rows, and where `[[my rate]]` actually is** — the §B cost:

```sql
select t.slug,
       t.placeholder_defaults,
       (t.body like '%[[my rate]]%' or coalesce(t.subject,'') like '%[[my rate]]%')   as uses_my_rate,
       (t.body like '%[[your rate]]%' or coalesce(t.subject,'') like '%[[your rate]]%') as uses_your_rate,
       (t.body like '%[[%')                                                          as has_any_placeholder,
       (t.body like '%{{demo_link}}%' or coalesce(t.subject,'') like '%{{demo_link}}%') as uses_demo_link,
       (t.body like '%?lead_%')                                                       as uses_lead_conditions
  from public.outreach_templates t
 order by t.sort_order, t.slug;
```

🔴 **`uses_my_rate` counts the templates you would have to type the rate into** under §B option 1.
⚠️ `uses_demo_link` true on any row means §D's refusal constraint is live for that template.

**3 · 🔴 THE LEAD DISTRIBUTION, MEASURED — the figure I got wrong** (§Premise 2). This is the real one:

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

⚠️ The app also treats `fb.com` and `fb.me` as Facebook and this SQL does not, so a row or two may differ.

**4 · 🔴 IS THE FREEZE COLUMN THERE AT ALL?** §F(i) — run this before anything else:

```sql
select c.column_name, c.data_type, c.is_nullable
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name = 'outreach_prospects'
   and c.column_name = 'lead_type_at_first_contact';
```

🔴 **No rows = the migration is unapplied**, `hasLeadTypeFreeze` is false, nothing is ever frozen, and
every prospect uses the live derivation. The fix is to run
`supabase/migrations/20260914_outreach_lead_type_freeze.sql` — and then correct its "NOT APPLIED" header.

**5 · How many rows a NEXT ACTION sort would actually order** (§E1 — nulls land last either way):

```sql
select count(*)                                             as prospects,
       count(p.next_action_at)                              as with_a_date,
       count(*) - count(p.next_action_at)                   as null_sort_to_the_bottom,
       count(*) filter (where p.next_action_at < current_date)  as overdue,
       count(*) filter (where p.next_action_at = current_date)  as due_today,
       count(*) filter (where p.next_action_at > current_date)  as scheduled_ahead,
       min(p.next_action_at)                                as oldest_date,
       max(p.next_action_at)                                as newest_date
  from public.outreach_prospects p;
```

⚠️ `null_sort_to_the_bottom` is the number of rows that render `—` beneath the sorted ones **in both
directions**. If `with_a_date` is single digits, the sort choice matters far less than which view it is
applied in.
