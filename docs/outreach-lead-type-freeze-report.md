# Freezing the lead type at first contact

**14 September 2026.** One new migration (**unapplied**), one new pure function and its validator, and
four files touched. **No backfill. No template row touched. `lib/whatsapp-hint.ts` not touched.**
Nothing staged or committed.

---

# 🔴 PREMISE CORRECTIONS — THREE

## 1 · 🔴 TEMPLATE SELECTION DOES NOT READ THE LEAD TYPE — so there was nothing to change there

Build item 3 says to read the frozen value *"everywhere the lead type is used: the `?lead_*` conditions,
the queue row, and **template selection**."*

🔎 **READ**, `templateForStep` in `lib/outreach-step.ts`: it branches on `step.kind` and `step.channel`
and **nothing else** — `STEP_TEMPLATE` is a 4 × 2 map of rung × channel. That is deliberate and it is the
point of the previous task: **lead type reaches the message through the four `?lead_*` conditions inside
one template, not by selecting a different template.** Selecting per type is the 16-template shape the
steer ruled out.

🧪 **The search:** `leadTypeOf` and `leadType` alone across `app components lib scripts supabase`.
**Before this task, exactly two call sites** — `nextStep` (the queue row) and `contextFromProspect` (the
conditions). *Positive control on the same search:* it also returned `LEAD_TYPE_LABELS` in
`OutreachPanel.tsx:1580` and the type imports, so it finds usages where they exist.

**So "everywhere" is two places, and both now go through `effectiveLeadType`.** 🧪 After the change,
`leadTypeOf` has **one** call site in the whole repository — inside `effectiveLeadType` itself. Every
other mention is a comment.

## 2 · The queue build is STILL uncommitted — HEAD has not moved

The brief asks what is committed now. **Nothing new.** `HEAD` is still `e8b59e5 outreach`. The tree
carries three separate bodies of work: the **prune fix**, the **queue build**, and now this. Listed in
full below so they can be committed apart if you want that.

## 3 · ⚠️ THE 109-of-231 FIGURE IS YOURS AND I HAVE NOT RE-DERIVED IT

The rules say to re-derive every number. **I cannot** — it is a database count and this task queries
nothing. It is carried as your figure, attributed, and §SQL query 2 re-derives it for you. Every number I
*could* derive (the two call sites, the track arithmetic, the lint tallies) is derived below.

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
	docs/outreach-queue-report.md
	docs/outreach-sequence-review-report.md
	lib/outreach-step.ts

no changes added to commit (use "git add" and/or "git commit -a")
════
e8b59e5 outreach
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
```

**Three workstreams in one tree:** prune fix (`discovery_prune.yml`, `prune-discovery-events.mjs`,
`scraper-reference-manual.md`) · queue build (`lib/outreach-step.ts` + the four outreach files) · this
task (the migration + edits to the same four). 🔴 **The queue and this task share files and can no longer
be committed separately** — that is inherent, since this reads the value the queue derives.

⚠️ `/usr/bin/git` is a license-blocked Xcode shim here (`exit 69`); commands ran through
`/Applications/Xcode.app/Contents/Developer/usr/bin/git`. **`sudo xcodebuild -license` once.**

### Admin-only — confirmed by symbol

`OutreachPanel` ← `app/admin/page.tsx` only. `TemplatesPanel`/`ComposeWindow` ← that tree only. Both
routes behind `verifyAdmin`. `lib/outreach-step.ts` is imported by `OutreachPanel`,
`lib/outreach-template-render.ts` and now `app/api/admin/outreach/route.ts` — all admin.
✅ **`lib/whatsapp-hint.ts` was read in the queue task and is NOT touched here** — 🧪 zero diff.

---

# THE BUILD

| File | Change |
|---|---|
| 🆕 `supabase/migrations/20260914_outreach_lead_type_freeze.sql` | **UNAPPLIED.** One nullable column |
| `lib/outreach-step.ts` | `isLeadType`, `effectiveLeadType`, `isLeadTypeFrozen`, `shouldFreezeLeadType`; `Step.leadTypeFrozen`; `nextStep` reads the effective value |
| `lib/outreach-template-render.ts` | `contextFromProspect` reads the effective value |
| `app/api/admin/outreach/route.ts` | capability probe, select, row map, validated PATCH writer |
| `components/admin/OutreachPanel.tsx` | freeze on the rung-1 log; the visible, correctable control |
| `components/admin/TemplatesPanel.tsx` | the preview row carries the frozen value |

## 1 · The migration — `lead_type_at_first_contact`

🔴 **NOT APPLIED, AND THE HEADER SAYS SO TRUTHFULLY.** It also says what to do the day it *is* applied,
because a stale "NOT APPLIED" header on a live file is a recorded trap here — the run-log migration was
read as unapplied for two days while it was live — **and so is the reverse**.

**Named for what it is:** not `lead_type_frozen` (which names the mechanism) but
**`lead_type_at_first_contact`** — which names the *content* and the *moment it was captured*, and the
moment is the whole point.

**Values:** exactly one of `hu_ordering` · `hu_map` · `on_vf` · `not_listed`.

🔴 **CONSTRAINED BY A TS UNION AND A ROUTE VALIDATOR, NOT A CHECK CONSTRAINT — and that is the house
rule, stated in `20260903_outreach_tracking.sql`:** PostgREST exposes no CHECK metadata, so the app
cannot read a constraint back to build a dropdown from it, and *"a constraint there is a rule with no
reader that drifts the moment someone edits one side."* Three layers instead:

| Layer | What |
|---|---|
| `LeadType` | a TS union derived from the `LEAD_TYPES` array — never a second list |
| **`isLeadType`** | 🔴 the enforcement. Called by the route before every write (HTTP 400) **and** by `effectiveLeadType` before every read |
| the modal | a `<select>` built by mapping `LEAD_TYPES`, so no other value can be typed |

⚠️ **THE COST OF THE NO-CHECK RULE IS NAMED IN THE MIGRATION ITSELF, NOT GLOSSED.** `outreach_contacts.kind`
is also unconstrained text, and that is exactly how it split into `first_contact` / `1_first_contact` and
left 8 of 17 rows unreadable this week. **The difference:** `kind` was renumbered *after* rows existed,
whereas this column starts empty and has one validated writer. The migration carries the paragraph that
should stop a second writer being added.

## 2 · WHERE IT IS WRITTEN — the one point both log paths converge

🔎 **`persistFollowUpAfterLog` in `OutreachPanel.tsx`.** Both logging paths call it, and both only on a
write that succeeded: the modal's own Log button (`submitLog`, `if (!ok) return`) and the compose
window's log control (`if (ok) persistFollowUpAfterLog(kind)`). 🔎 Its own header records why it exists:
the compose path *"logged a contact and set NO follow-up date at all"* until both were routed through
here. **Putting the freeze anywhere else would repeat exactly that bug.**

🔴 **THE PREDICATE WAS MOVED OUT OF THE COMPONENT INTO `shouldFreezeLeadType`, AND THAT WAS NOT
COSMETIC.** Three clauses inline in a React handler are *inspectable* but not *testable* — no harness can
reach them. As a pure function they are driven directly (§V3), including against broken variants.

```ts
shouldFreezeLeadType(kind, p, columnExists):
  columnExists                                  // the migration is applied
  && kind === CONTACT_KINDS[0]                  // 🔴 the RUNG-1 log, not any log
  && !isLeadType(p.lead_type_at_first_contact)  // 🔴 WRITE ONCE
```

**Captured with `leadTypeOf`, not `effectiveLeadType`** — every *reader* uses the effective value; this
is the one *writer*, and it must capture what the prospect is right now. (With the column null they
return the same thing; the intent differs, and the comment says which is which.)

### 🔴 What happens if the first logged contact is NOT rung 1

**Nothing freezes — then or ever.** No later rung satisfies clause two, so a sequence started at Chase 1
stays on the live derivation and **can still drift**. That is a real gap and I am not dressing it up.

It is mitigated, not hidden: the modal's control reads **"Lead type (live)"** rather than "(frozen)", and
the value can be set by hand at any time. 🧪 §SQL query 3 lists any prospect in that state.

⚠️ **I did not widen the rule to "the first ladder rung, whatever it is"**, because the brief is explicit
— *"the rung-1 log, not any log"* — and because widening it would let a Chase-1 log freeze a framing for
an approach that was never sent from here. **Say the word if you want it widened; it is one clause.**

## 3 · WHERE IT IS READ — two call sites, one function

```ts
effectiveLeadType(p):
  isLeadType(p.lead_type_at_first_contact) ? that : leadTypeOf(p)
```

| Reader | Feeds |
|---|---|
| `nextStep` | the queue row's **Next step** cell and its tooltip; `Step.leadTypeFrozen` says which source it came from |
| `contextFromProspect` | 🔴 the four **`?lead_*` conditions** — i.e. the actual sentence in the message |
| ~~template selection~~ | **does not read lead type at all** — premise 1 |

🔴 **NULL FALLS BACK TO THE LIVE DERIVATION, WHICH IS WHAT MAKES A BACKFILL UNNECESSARY.** The 9
prospects already mid-sequence and the 222 not yet contacted behave exactly as before. 🧪 Proved on six
shapes in §V2, including the two that matter operationally (an unapplied migration, and a genuinely
unset column).

⚠️ **AN UNREADABLE STORED VALUE ALSO FALLS BACK**, rather than propagating — the same posture `isKind`
takes in the contact history. 🔴 **It is not silently repaired**: nothing rewrites the column, so a bad
value stays visible in the control until a human changes it.

## 4 · No backfill, and the derivation is untouched

🔴 **A backfill would stamp TODAY's derived type onto the 9 mid-sequence prospects — the exact drift this
column exists to prevent, applied retroactively and then frozen as if it were evidence.** The migration
carries that paragraph so nobody adds one later.

🧪 `leadTypeOf` is byte-identical: the harness asserts that on a frozen row the *derivation* still returns
the changed value (`not_listed`) while the *effective* value returns the frozen one (`on_vf`) — so the
derivation demonstrably was not quietly patched.

## 5 · Where you can SEE it — and correct it

🔴 **A wrong freeze is otherwise invisible and permanent**: it would pick the wrong `?lead_*` line in
every remaining message of the sequence with nothing on any screen saying why. So it is a labelled
control in the prospect modal's left column, reading **"Lead type (frozen)"** or **"(live)"**.

- The empty option is **"— derive live (X) —"**, and choosing it **clears the column to null**, which is
  how a wrong freeze is *undone* rather than merely re-pointed.
- ⚠️ That option's label shows the **live** derivation, not `step.leadType` — on a frozen row those
  differ, and labelling it with the frozen value would promise that clearing changes nothing, which is
  backwards.
- Disabled with an explanatory title until the migration is applied.

### 🔴 THE MOBILE ARITHMETIC, for the row I added to

**A FOURTH CELL IN THE EXISTING `grid grid-cols-2 gap-2`, NOT A THIRD COLUMN.**

| | tracks | the widest thing in a cell | verdict |
|---|---|---|---|
| **Desktop**, `grid-cols-2` | `(487 − 8)/2` = **239px** | Phone's input + WA tick ≈ 227px | ✅ unchanged — Phone keeps the width it has today; the new cell wraps to row two beside it |
| **Desktop**, if `grid-cols-3` | `(487 − 16)/3` = **157px** | same ≈ 227px | 🔴 the CONTACTED ON / CHANNEL overlap again |
| **390px**, `grid-cols-2` | `(342 − 8)/2` = **167px** | a `<select>`'s min-content = its longest option, *"Hatches Up — map only"*, wider than 167px | ⚠️ **`max-sm:min-w-0` REQUIRED**, and applied |

487px = `(1152 − 40 − 20) × 0.45` less `pr-1`; 342px = `390 − 16` (overlay `p-2`) `− 32` (panel
`max-sm:p-4`). `fieldCls` carries `max-sm:text-base` (16px), which is what stops iOS zooming on focus.

🧪 **Rounds 1–3 intact:** `max-sm:` classes **removed vs HEAD: 0**. `ProspectMetaFacts` ×3, the
`contents max-sm:hidden` wrapper ×1, the `sm:hidden` phone copy ×1, `max-sm:grid-cols-2` ×1,
`max-sm:overflow-y-auto` ×1, the grid still `grid grid-cols-2 gap-2 flex-shrink-0`. `max-sm:min-w-0`
went **8 → 10** (the new cell, plus one mention in its comment).

---

# VERIFICATION

**Every harness was pointed at deliberately broken variants first.** Seven variants, all fail; the real
modules pass. A harness that cannot fail proves nothing.

```
BROKEN VARIANT                                        exit   first failure
freeze ignored — always derives live                    1    ✗ FROZEN WINS over a changed derivation
validator accepts anything                              1    ✗ null frozen derives live
nextStep reverts to leadTypeOf                          1    ✗ the step carries the frozen type
conditions revert to the live derivation                1    ✗ frozen renders the FROZEN line
rung check dropped — any log freezes                    1    ✗ 2_chase_1 does NOT freeze
write-once dropped — every rung-1 log re-stamps         1    ✗ already 'hu_ordering' not overwritten
migration gate dropped                                  1    ✗ column absent ⇒ no write
                          ── the real modules ──        0    ✅ ALL CHECKS PASSED
```

## V1 · A frozen type wins over a derivation that has since CHANGED

*Null result it risks:* the fixture's live and frozen types are the same, so "frozen wins" is vacuous.
*Excluded by:* driving it with one truck in **two states** and asserting the derivation still disagrees.

```
4 upcoming events  → leadTypeOf = on_vf
0 upcoming events  → leadTypeOf = not_listed      ← the scraper drops the events
frozen 'on_vf' on the 0-event row:
   live = not_listed   effective = on_vf          🔴 the freeze holds
```
✅ **CONTROL: `leadTypeOf` still returns `not_listed`** for that row — the derivation was not quietly
patched to agree.

## V2 · A null frozen type derives live — six shapes

```
null frozen (222 not contacted)  → not_listed     undefined field entirely → on_vf
explicit null                    → on_vf          empty string             → on_vf
garbage value ('banana')         → on_vf          legacy-looking ('on-vf') → on_vf
```
✅ **NULL-RESULT CONTROL: would these pass if `effectiveLeadType` ALWAYS derived?** No — V1's frozen case
returns something the derivation does not. Both halves are exercised in the same run.

🧪 `isLeadType` rejects `""`, `null`, `undefined`, `"banana"`, `"HU_ORDERING"`, `"on vf"`, `0`, `{}`,
`[]`; **control:** it accepts all four real values.

## V3 · Rung 1 writes exactly once; rungs 2–4 never overwrite

```
1_first_contact, unfrozen, column applied   → true    🔴 freezes
2_chase_1 / 3_chase_2 / 4_final_chase       → false   does NOT freeze
reply / first_contact / follow_up / '' / banana → false
already frozen as any of the four values    → false   🔴 WRITE ONCE
already 'banana' (unreadable)               → true    garbage is not a freeze
column absent                               → false
column present                              → true    ← CONTROL: "false" is not the only answer
```

## V4 · The four `?lead_*` conditions select on the FROZEN value

One template, four lines (`A`/`B`/`C`/`D`), rendered through the real `renderTemplate`:

```
no freeze (live not_listed)  → "D"       frozen 'hu_ordering' → "A"
frozen on_vf                 → "C"  🔴   frozen 'hu_map'      → "B"
frozen 'not_listed'          → "D"       frozen 'banana'      → "D" (falls back to live)
```
**The same prospect renders C when frozen and D when not.** That is the whole feature in one line.

## V5 · The queue row reads it, and says which source

```
frozen row → leadType=on_vf      leadTypeFrozen=true
live row   → leadType=not_listed leadTypeFrozen=false
```
✅ **CONTROL:** the frozen row's ladder still computes (`kind = 2_chase_1`) — this is not a step that
silently failed.

## V6 · Nothing from the previous two tasks regressed

🔴 **The queue task's OWN harnesses, re-run unmodified against this task's modules:**

```
queue nextStep harness (6 broken variants + ~90 assertions)   exit 0  ✅
renderer harness (lead conditions, Phase 1 guard, tokens)     exit 0  ✅
```

Included in that: all 7 Phase 1 malformed cases still caught; its 3 valid cases still **not** flagged
(*the control*); the four tokens still valid; the token vocabulary still **12**; the condition vocabulary
still **9**; `{{demo_link}}` still blocks with no demo and the lead template still does not.

**`do_not_contact` still blocks all three exits:** 🧪 `const refusal = dncNotice ?? …` present, **3**
`if (refusal)` guards. ⚠️ `ComposeWindow.tsx` was **not edited by this task at all** — its diff is
entirely the queue task's, so the guarantee is untouched rather than re-established.

## V7 · tsc and lint

`tsc --noEmit -p .` → **exit 0**.

```
                                         HEAD    now
@typescript-eslint/no-explicit-any         15     15
react-hooks/set-state-in-effect            11     11
react-hooks/immutability                    1      1
react-hooks/exhaustive-deps                 1      1
@typescript-eslint/no-unsafe-function-type  1      1
@typescript-eslint/no-unused-vars           1      0   ← carried over, NOT introduced here
```

🔴 **THE ONE DELTA IS THE QUEUE TASK'S, ALREADY DECLARED IN ITS REPORT** — adding a *used* `step`
parameter after `_hatchesUp` stopped `no-unused-vars` reporting it. **This task adds no finding and
removes none.** 🧪 `eslint lib/outreach-step.ts` → **zero output**, so the new and extended pure module
contributes nothing.

⚠️ Two imports were added and then reverted during the build (`type LeadType`, `CONTACT_KINDS`) once the
predicate moved into the pure module and they became unused. Reverting them is why the tally is clean
rather than carrying two new warnings.

---

# CHECKLIST

### Before anything works
- **M1.** 🔴 Apply `supabase/migrations/20260914_outreach_lead_type_freeze.sql` (§SQL query 1), then
  **correct its header** — it currently says NOT APPLIED, truthfully.
- **M2.** Until then: the control is **disabled** with an explanatory title, nothing is written, and the
  console behaves exactly as before. That is worth seeing once — reload before applying and confirm
  the Lead type box is greyed.

### After applying
- **L1.** Open any prospect. The left column shows **Lead type (live)** with *"— derive live (X) —"*
  selected, where X matches the **Next step** column's tooltip.
- **L2.** 🔴 Log a **First contact**. Reopen: the label reads **(frozen)** and the select shows the
  captured value.
- **L3.** Log a **Chase 1** on that prospect. The frozen value must **not** change.
- **L4.** Log a First contact **again** (different channel, so the duplicate guard allows it). Still
  must not change.
- **L5.** 🔴 **The drift test, which is the point.** Take a prospect frozen as *On the Village Foodie
  map*. When the scraper next drops its upcoming events, the live derivation becomes *Not listed* — the
  control must still read **(frozen) · On the Village Foodie map**, and a chase must still render the
  `?lead_on_vf:` line.
- **L6.** Set the select to a different type by hand, then back to **— derive live —**. The label must
  flip (frozen) → (live) and the column must clear to null.

### Mobile, 390px (Safari RDM)
- **R1.** 🔴 In the modal's left column: **First | Last**, then **Phone | Lead type**, side by side with
  **no overlap**. That is the `max-sm:min-w-0` fix at 167px tracks.
- **R2.** Tap the Lead type select — **the page must not zoom** (16px).
- **R3.** Rounds 1–3 unchanged: only **STAGE** locked in the grey strip; the rest scrolling away; LOG A
  CONTACT two-per-row.

### Only you can decide
- **D1.** A sequence started at **Chase 1** never freezes (§2). Widen the rule, or leave it and correct
  by hand? One clause either way.
- **D2.** The 9 mid-sequence prospects are **not** backfilled, deliberately. If any of them should carry
  a frozen type, set it by hand in the modal — that is the intended route, and §SQL query 3 lists them.

---

# SQL — for Dominic to run; **nothing here was executed**

**1 · 🔴 APPLY THE MIGRATION.** This is the file's body, verbatim:

```sql
set lock_timeout = '3s';

begin;

alter table public.outreach_prospects
  add column if not exists lead_type_at_first_contact text;

comment on column public.outreach_prospects.lead_type_at_first_contact is
  'The lead type captured when the first contact was logged: hu_ordering | hu_map | on_vf | not_listed. '
  'NULL = not captured, so the app derives it live instead. Written once, by the rung-1 log path only; '
  'never backfilled. Unconstrained text by the V12.1 no-CHECK rule — validated by isLeadType in '
  'lib/outreach-step.ts and by the API route before every write.';

commit;

notify pgrst, 'reload schema';
```

⚠️ `notify pgrst, 'reload schema'` is not optional — until the cache reloads, a column that exists still
answers `PGRST205` and the capability probe reports it absent.

**2 · Re-derive the 109 of 231** (premise 3 — your figure, not mine), including the event condition the
flags alone cannot express:

```sql
select case
         when p.hu_ordering is true then '1 hu_ordering'
         when p.hu_map is true then '2 hu_map'
         when coalesce(t.excluded, false) = false
          and coalesce(t.show_on_vf, true) = true
          and exists (select 1 from public.discovery_events e
                       where e.discovery_truck_id = t.id and e.event_date >= current_date)
           then '3 on_vf'
         else '4 not_listed'
       end as live_lead_type,
       count(*) as prospects
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
 group by 1
 order by 1;
```

🔴 **Types 3 and 4 together are the drifting population.** If they sum to ~109, the freeze is worth
having; if types 1 and 2 dominate, it matters much less.

**3 · Who is mid-sequence and therefore NOT frozen** — the §2 gap and the §D2 decision, in one query.
🔴 **Run this AFTER the migration**, since it names the new column:

```sql
with first_rung as (
  select oc.prospect_id,
         min(oc.contacted_at) filter (where oc.kind = '1_first_contact') as first_rung1_at,
         count(*) filter (where oc.direction is distinct from 'inbound') as outbound_rows
    from public.outreach_contacts oc
   group by oc.prospect_id
)
select p.id,
       t.name,
       p.stage,
       p.lead_type_at_first_contact,
       coalesce(f.outbound_rows, 0) as outbound_rows,
       f.first_rung1_at,
       case
         when p.lead_type_at_first_contact is not null then 'frozen'
         when coalesce(f.outbound_rows, 0) = 0 then 'not started — will freeze on first contact'
         when f.first_rung1_at is null then 'STARTED WITHOUT A RUNG-1 LOG — will never freeze'
         else 'started before the column existed — set by hand if it matters'
       end as freeze_state
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
  left join first_rung f on f.prospect_id = p.id
 where coalesce(f.outbound_rows, 0) > 0
    or p.lead_type_at_first_contact is not null
 order by freeze_state, t.name;
```

⚠️ **`STARTED WITHOUT A RUNG-1 LOG` is the §2 gap made visible.** Those prospects stay on the live
derivation for ever unless you set the value by hand in the modal.

**4 · A guard against the thing the no-CHECK rule cannot prevent.** 🔴 Run it occasionally: any row here
is a value `isLeadType` will refuse to read, so the app silently falls back to deriving — which is safe,
but it means a hand-edit in SQL did nothing:

```sql
select p.id, t.name, p.lead_type_at_first_contact
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
 where p.lead_type_at_first_contact is not null
   and p.lead_type_at_first_contact not in ('hu_ordering', 'hu_map', 'on_vf', 'not_listed')
 order by t.name;
```

**Expect zero rows.** The route validates every write, so a non-empty result means something wrote to
this column outside the app — which is the one scenario the migration's own header asks you to prevent.
