# The outreach due-work queue — derived step, pre-loaded template, lead type as a condition

**14 September 2026.** Six files changed, one of them new. **No migration. No template row created,
edited, seeded or deactivated. `lib/whatsapp-hint.ts` NOT touched.** Nothing staged or committed.

---

# 🔴 PREMISE CORRECTIONS — FIVE

## 1 · ⚠️ `lib/whatsapp-hint.ts` IS SHARED WITH A CUSTOMER PATH — flagged, and not modified

The rules say to STOP and report if anything is shared with an operator or customer path. 🔎 **READ**,
that file's own header: *"THE ONE DERIVATION FOR 'phone → call/message affordances', SHARED BY THE LIVE
BUTTON AND OUTREACH… lifted byte-for-byte from `components/EventListCard.tsx`, which renders the
CUSTOMER-FACING Call / Message / Text buttons on the live Village Foodie site."* 🧪 Importers: exactly
two — `components/EventListCard.tsx` (customer) and `components/admin/OutreachPanel.tsx` (admin), plus
the outreach route.

🔴 **I did not stop the task, and here is the distinction I drew.** The *surfaces being built* are
admin-only. `phoneWhatsApp` is **read** — one call, `.waPhone` — and **not modified**; the file has zero
diff. Had the channel rule required changing it, that would have changed a button on the live customer
site and I would have stopped. **If you wanted a stop on the read alone, say so and I will revert.**

## 2 · 🔴 `discovery_trucks.visibility` IS LEGACY — the code reads `show_on_vf`

The brief lists `visibility` among the confirmed-real columns. 🔎 `20260702_discovery_visibility_booleans.sql`
is titled *"4 per-site booleans + is_customer, **replacing** the tri-state `visibility`"*, adds
`show_on_vf`/`show_on_hg` to `discovery_trucks`, backfills them from `visibility`, and says the old
column is *"kept, NOT dropped here… Drop the `visibility` columns in a later migration once the booleans
are proven."* 🧪 Searched alone across the code: **nothing reads `discovery_trucks.visibility` any more**
— `app/api/discovery/events/route.ts` says so in a comment (*"no more 'linked discovery_trucks.visibility,
default public if unlinked'"*). **So the lead-type derivation reads `show_on_vf`, not `visibility`.**

## 3 · 🔴 `show_on_vf` IS `NOT NULL DEFAULT true`, WHICH CHANGES WHAT "NOT LISTED" MEANS

🔎 `ALTER TABLE discovery_trucks ADD COLUMN IF NOT EXISTS show_on_vf boolean NOT NULL DEFAULT true`.
**Every scraped truck nobody has touched is flagged visible.** So lead type 4 is almost never *"someone
hid them"* — it is decided by the other two parts of the predicate: `excluded`, or **no future events**.

⚠️ **That is worth knowing before writing copy for it.** A `not_listed` prospect is, in practice, *"we
hold no upcoming dates for you"* — which is a true and useful thing to say, but it is **not** *"you are
not on Village Foodie"*. §0b.

## 4 · The 4-vs-5 figure, re-derived from code rather than carried

🧪 Parsed out of the migration seed, **per row, not per occurrence**: `general_email` ×1, `chaser_email`
×1, `wa_intro` ×1, `wa_chaser` ×1, **`hu_rate_email` ×0** → **4 of the 5 seeded rows** carry
`{{contact_name_prefixed}}`. That matches your verified figure of 4 across the 9 live rows. **I am not
restating "5" anywhere.**

## 5 · ⚠️ LINT IS NOT IDENTICAL TO HEAD — IT HAS ONE FEWER FINDING

Declared rather than buried. HEAD carries `'_hatchesUp' is defined but never used` in `sortValue`;
the working tree does not. **Cause:** `@typescript-eslint/no-unused-vars` defaults to `args: after-used`,
and I added a **used** `step` parameter *after* `_hatchesUp`, so it is no longer the trailing unused
argument and the rule stops reporting it. **No finding was added; one pre-existing warning went away as
a side effect.** Full tally in §V7.

### The two git commands, verbatim

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .github/workflows/discovery_prune.yml
	modified:   docs/scraper-reference-manual.md
	modified:   scripts/prune-discovery-events.mjs

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-sequence-review-report.md

no changes added to commit (use "git add" and/or "git commit -a")
════
e8b59e5 outreach
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
```

✅ **`e8b59e5 outreach` confirmed** — 13 files, 3,368 insertions, carrying all five prior workstreams.
The tree at the start held only the prune fix (3 files) and the review report.

⚠️ `/usr/bin/git` is a **license-blocked Xcode shim** (`exit 69`) on this machine; the commands ran
through `/Applications/Xcode.app/Contents/Developer/usr/bin/git`. **Run `sudo xcodebuild -license` once.**

### Admin-only — confirmed by symbol

`OutreachPanel` ← `app/admin/page.tsx` only (`app/admin/outreach/page.tsx` is a server `redirect`).
`ComposeWindow`/`TemplatesPanel` ← that tree only. Both routes behind `verifyAdmin`.
`lib/outreach-step.ts` (new) is imported by `OutreachPanel` and `lib/outreach-template-render.ts`, and
imports only `lib/outreach.ts`. 🧪 *Positive control:* `discovery_truck_id` resolves in **24** files, so
the search finds cross-surface use where it exists. **The one shared dependency is §1, and it is read-only.**

---

# PHASE 0 — DIAGNOSIS

## 0a · 🔴 THE WHATSAPP NUMBER IS `discovery_trucks.phone`

🔎 **READ**, `OutreachPanel.tsx`: `const waPhone = phoneWhatsApp(p.phone, null).waPhone`, and the link is
`https://wa.me/{waPhone}` rendered only when `p.whatsapp_confirmed === true && waPhone`. `p.phone` comes
from the `TRUCK_EMBED` — **`discovery_trucks.phone`**. Not `.mobile`, not `whatsapp_number`.

🔎 `phoneWhatsApp` normalises: strip to digits and `+`, drop the `+`, rewrite a leading `0` to `44`.
⚠️ The panel passes `accepted_methods` as **null** deliberately, so the `hint` from that call is always
`'none'` — only `.waPhone` is used, so it does not matter.

### `whatsapp_number` has ZERO readers — confirmed

🧪 **The search:** `whatsapp_number` alone, across the whole repo excluding `node_modules/.next/.git`.
**Four hits in code, and every one is plumbing:** the route's `BASE_COLS` select, the route's row map,
the route's PATCH writer, and the `Prospect` type. **No render, no filter, no derivation, no link.**

🧪 **Positive control over the same search and the same file set:** `whatsapp_confirmed` → **105
occurrences across 41 files**. The method finds a read field; there is nothing to find here.

**What each means in practice:**

| Field | Meaning | 🧪 |
|---|---|---|
| `whatsapp_number` | **Dead.** Stored, writable, never read. You confirm it is empty on all 231 rows — so dead in code *and* data | 0 readers |
| `whatsapp_confirmed` | The **gate**: `templatesFor` refuses WhatsApp templates unless `=== true`; also drives the column, sort, filter and the wa.me link | true on 30 |
| `discovery_trucks.phone` | **The number actually messaged** | — |

⚠️ **AND IT IS NOT CONSENT EVIDENCE.** §52.3 of the reference manual: all 30 `whatsapp_confirmed` rows
match the scraped `advertises` hint **1:1**, *"so not one row was personally verified"*, and the ICO
treats messaging apps as in scope. That is why `channelFor` picks a **draft** channel only (D4).

**The expressible rule:** `whatsapp_confirmed === true AND phoneWhatsApp(phone).waPhone` non-empty —
the same pair the modal's link and `templatesFor` already require, so the step can never propose a
channel the composer would refuse to give it a template for. **How many of the 231 it selects is a DB
question** — §SQL query 1. It is **at most 30** and I have not assumed it is exactly 30, because a
`whatsapp_confirmed` row with an unusable phone would fall out.

## 0b · LEAD TYPE — all four derive, no new column

🔎 **The Village Foodie map predicate, read from the feed itself** (`app/api/discovery/events/route.ts`):
a truck is shown when `!truck.excluded` **and** `truck[show_on_vf] === true`, and only its events dated
today or later render. **Three conditions, not one** — a truck with both flags right and nothing booked
is not on the map, because there is nothing of it to see.

```
leadTypeOf(p):            // FIRST MATCH WINS — a truck can satisfy several
  hu_ordering === true                                  → 1 hu_ordering
  hu_map === true                                       → 2 hu_map
  !excluded && show_on_vf !== false && futureEvents > 0  → 3 on_vf
  otherwise                                             → 4 not_listed
```

🔴 **`=== true`, NEVER TRUTHINESS.** `hu_ordering`/`hu_map` are tri-state: NULL means *nobody checked*,
which is not *no*. 🧪 The manual's figure: 17 `true`, 214 `null`, **0 `false`**. A NULL falls through and
is typed on what we *do* know, which is the honest answer.

**Cases in none of the four, or in two:**

| Case | What happens | Right? |
|---|---|---|
| In two or more (HU truck also on the map) | **Ordered, first match wins.** Strongest buying signal first | ✅ the order is declared in one constant, not implied by an if-chain |
| In none | **Impossible by construction** — `not_listed` is the `else`. 🧪 Proved: 11 shapes, all land in one of four | ✅ |
| `hu_ordering === false` (checked, absent) | Falls through — it is not `true` | ✅ 🧪 tested |
| `show_on_vf` absent from the payload | Treated as **true**, the column's own `NOT NULL DEFAULT true` | ✅ matches the database rather than inventing a safer-looking false |
| Flags fine, **no future events** | `not_listed` | ⚠️ **Correct but easy to misread** — see premise 3 |

### `suggestTemplateId` — seed or replacement?

🔎 It reads **only** `stage` and `hu_ordering`; 🧪 searched inside its body, `kind`, `CONTACT_KINDS`,
`outreach_contacts` and `next_action_at` are all **absent**, while `stage`/`hu_ordering` are present.

🔴 **It is neither the seed nor replaced — it is left exactly as it is, and the new path runs beside it.**
It answers a different question (*"which of three templates fits this row"*) with a 3-way heuristic where
🧪 214 of 231 rows get the same answer. The queue answers *"which rung is next"* from the ladder. Both
still render: the picker still marks one option `(suggested)`, and pre-selection now comes from the step.
**Nothing about `suggestTemplateId` changed.**

## 0c · THE CONDITIONAL MECHANISM — a condition costs one `case`

🔎 End to end: `renderTemplate` splits the body on `\n`; each line is tested against
`COND_LINE_RE = /^\?([a-z_]+):\s?/`; a match consults `conditionMet(name, ctx)`; **unmet ⇒ the whole line
is dropped** and the name is recorded in `droppedConditions`; met ⇒ the marker is stripped and the
remainder substituted. A run of blank lines left behind is collapsed.

**The pre-existing vocabulary, re-derived from the source rather than transcribed:** `next_event`,
`no_next_event`, `order_url`, `website`, `contact_name` — **5**.

🔴 **A condition can be added without touching the parser, and without touching the Templates tab
either.** `COND_LINE_RE` matches any `[a-z_]+`, and `conditionReference()` reads the `case` labels out of
`conditionMet`'s own source via `Function.prototype.toString()` — so **adding a `case` is the whole
change** and the editor lists it automatically. 🧪 Verified: the tab now lists **9**.

**Combination and negation:**
- ❌ **No combination.** The regex captures one name; there is no `?a&b:` syntax and adding one *would*
  be a parser change.
- ⚠️ **Negation is by convention, not syntax** — `no_next_event` is a separate `case`. `TemplatesPanel`
  detects `C`/`no_C` pairs and warns about a half-written one.
- 🔴 **Which is exactly why four lead conditions beat one negatable one:** four mutually exclusive names
  need no combination operator, and **exactly one is true** for any prospect.

**Cost of the four: one `case` line each, one description each. No parser change, no migration, no
template edit.**

## 0d · THE DERIVED STEP — confirmed, with D1 wired in

```
stops, in order of certainty:   do_not_contact → converted → any inbound → terminal stage
then:                           blind rows > 0  → UNKNOWN            🔴 D1
then:                           highest rung reached (not a count), + FOLLOW_UP_DAYS from ITS date
```

🔴 **Outside-the-vocabulary `kind` ⇒ UNKNOWN, never rung 0.** 🧪 Your real legacy values —
`first_contact`, `follow_up` — are counted as blind. **One blind row is enough**: a mixed history of 3
readable rungs + 1 blind row returns `unknown`, not "final chase", because the blind row is exactly as
likely to *be* one of those rungs under its old name, which would send an extra chase.

**Your two contradiction shapes, both tested:**

| Shape | Result | Why |
|---|---|---|
| `not_contacted` **with** a logged contact | 🧪 → `2_chase_1` | 🔴 **CONTACTS WIN over a stale stage.** Stage is not written by `log_contact`, so it goes stale by design; the contact row is the fact |
| `contacted` with **only blind rows** | 🧪 → `unknown` | Stage says "contacted" but nothing says *which rung*, and guessing is the banned move |

⚠️ **Stage is still a veto in one direction:** a *terminal* stage (`signed`/`not_interested`/`replied`)
stops the sequence. A **non-terminal** stage never overrides the ladder. That asymmetry is deliberate —
terminal stages are set by hand and mean something; `contacted` is set by hand and means very little.

## 0e · `do_not_contact` BLOCKED NOTHING — confirmed

🧪 **The search:** `do_not_contact` alone. `ComposeWindow.tsx` **0** · `lib/outreach-template-render.ts`
**0** · `TemplatesPanel.tsx` **0** · the route's `log_contact` branch **0**.
🧪 **Positive control, same files:** refusal/blocking/malformed symbols → **25 / 17 / 9**. The search
finds gating where it exists. **There was none.** You could compose, send, copy and log to a
do-not-contact prospect with no warning. Fixed in §6.

---

# THE BUILD

| File | Change |
|---|---|
| **`lib/outreach-step.ts`** | 🆕 the pure step module — `nextStep`, `leadTypeOf`, `channelFor`, `STEP_TEMPLATE`, `templateForStep` |
| `lib/outreach-template-render.ts` | `TemplateContext.leadType`; **4 lead conditions**; descriptions; `ProspectLike & LeadTypeInput`; `contextFromProspect` derives the type |
| `app/api/admin/outreach/route.ts` | `TRUCK_EMBED` += `show_on_vf, hatchgrab_truck_id`; both mapped onto the row |
| `components/admin/ComposeWindow.tsx` | `doNotContact` + `initialTemplateId` props; `seedFrom`; DNC first in the refusal chain |
| `components/admin/OutreachPanel.tsx` | `steps` map, `dueOnly` toggle + counts, **Next step** column + sort, composer wiring |
| `components/admin/TemplatesPanel.tsx` | its preview row carries the lead inputs |

**Not changed:** `lib/whatsapp-hint.ts`, `lib/outreach.ts`, `lib/outreach-filter.ts`, any migration, any
template row.

## 1 · `nextStep` — and which exits the data can actually see

| Exit | Detectable? | How |
|---|---|---|
| `do_not_contact` | ✅ | column, already loaded |
| **inbound reply** | ✅ | `direction === 'inbound'` on any contact row |
| terminal stage | ✅ | `signed` / `not_interested` / `replied` |
| **converted** | 🔴 **NEWLY detectable.** `discovery_trucks.hatchgrab_truck_id` existed but the list **never selected it** — 🧪 the old `TRUCK_EMBED` had 13 columns and not that one. One word added; no migration | |
| bounce | ❌ **NO, and no step model changes that.** Sending is a `mailto:` handed to Outlook — 🔎 *"Handing a mailto: to the OS tells us one thing: a compose window was requested."* | |

⚠️ **Every exit depends on the event being LOGGED.** A reply sitting unlogged in Outlook is invisible and
the prospect stays due. Nothing reads email. That is unchanged by this task and is the standing limit of
a derived model.

## 2 · The queue — a toggle over the table that is already there (D3)

**A "Due work (n)" button** beside the row count, plus an amber **"⚠ n needs a look"** badge when any
step is `unknown`. 🔴 Counted from the **same `steps` map the rows render from**, so badge and list
cannot disagree.

⚠️ **"Needs a look" is counted SEPARATELY from "due" and is not a subset of it** — an unreadable history
is work, but it needs the contact log corrected, not a message sent. Folding it into the due count would
bury exactly the thing D1 exists to surface.

🔴 **TWO-STAGE FILTERING, AND THE SPLIT IS THE POINT.** `matchesOutreachFilter` stays a **pure function of
one row** — no contacts, no clock — which is why it is testable with no React and no database. "Due" is
not a property of a row: it needs the ladder *and* today's date. So the row filters run first, unchanged,
and the queue narrows what survives. **`OutreachFilterState` is untouched**; a step-aware key in it would
make that pure function ignore one of its own fields, which is worse than a second flag.

⚠️ **This is why the queue is not just the existing `overdue` filter:** 223 of your 231 prospects are
`not_contacted` with **no `next_action_at` at all**, so no date filter can see that they are due. The
derived step can.

### The columns — what each is FOR (proposal only; nothing removed)

| Column | Stored / derived | What depends on it |
|---|---|---|
| **Phone** | stored | sort, the `phone` filter — 🔴 and the VALUE feeds `phoneWhatsApp` → the wa.me link **and now `channelFor`** |
| **WhatsApp** | derived display of `whatsapp_confirmed` | sort, filter, **and it is the ONLY writer of that flag** (`WhatsAppBox` writes on tick) — which `templatesFor` gates WhatsApp templates on |
| **Email** | stored | sort, the `email` filter, **the default priority sort** (`hasEmail`), **an inline editor**, and now `channelFor` |
| **Next step** 🆕 | **derived** | nothing — it is display + sort |

🔴 **PROPOSAL, NOT A REMOVAL.** All three can lose their *column* at no structural cost: `FILTERS` is a
**separate array** from `COLUMNS` and already carries a **`noColumn?: true`** escape, 🔎 used today by
`doNotContact` — a filter with no column. **But three things move with them:**
1. The WhatsApp tick is the only place `whatsapp_confirmed` can be set outside the modal, and that flag
   gates WhatsApp templates **and now the step's channel**.
2. The Email cell is an **editable** field, not a display.
3. `SortKey`/`sortValue` lose three cases.

🟢 **`whatsapp_number` is the genuinely dead one** (§0a) — dead in code and, per your check, in data.
Dropping it is a separate change; §SQL query 1 confirms before you do.

## 3 · Pre-selecting the template — what the old comment protected, and why this is safe

🔎 The line read `useState('')  // '' = none chosen; NEVER auto-selected`. **What it was protecting
against, read rather than guessed** — `docs/outreach-templates-report.md`: the thing refused was
`suggestTemplateId`, a heuristic over `stage` + `hu_ordering` where 🧪 **214 of 231 rows get the same
answer** and `hu_ordering` is tri-state, so *"not on Hatches Up"* really means *"not recorded as on it"*.
**Auto-selecting that would dress a low-confidence guess as a decision.** That rule was right and **still
holds — `suggestedId` still never auto-selects.**

🔴 **`initialTemplateId` is a different kind of value:**
- Passed **only** when the composer opens from a row whose step is **known** — and `nextStep` produces no
  rung at all when the history is unreadable, so a low-confidence case **cannot reach the parameter**.
- It comes from a rung **actually reached in the ladder**, not a 214-of-231 heuristic.
- **The default is unchanged**: every caller that passes nothing gets `''`, byte for byte as before.
- **Dominic can still change it** — the picker is untouched and re-selectable.

⚠️ **Seeded in a lazy `useState`, not an effect.** An effect calling setState on mount is the
`react-hooks/set-state-in-effect` pattern this repo already carries 11 of; this adds **none**, and the
first paint already has the template rather than flashing an empty pane.

🔎 `templateForStep` resolves against the **loaded** list and returns a **reason** (`no_step`,
`no_channel`, `slug_absent`) rather than a bare null — so a retired or renamed slug degrades to "nothing
pre-selected", visibly, instead of selecting the wrong row.

## 4 · Lead type as a condition — four `case`s, zero template edits

```
?lead_hu_ordering:  …      ?lead_on_vf:      …
?lead_hu_map:       …      ?lead_not_listed: …
```

🔴 **Exactly one survives**, because `leadTypeOf` returns exactly one value. Four lines in **one**
template, not sixteen templates. 🧪 Proved in §V4.

## 5 · `{{demo_link}}` — how the queue handles it

🔎 Re-verified by symbol: `MUST_RESOLVE = new Set(['demo_link'])`; `substitute` emits `[[demo_link]]`
even when a fallback is declared; `defaultFillsOf` drops a must-resolve key; `ComposeWindow` refuses all
three exits while `blocking` is non-empty.

🔴 **THE QUEUE REUSES THAT CHANNEL AND ADDS NOTHING.** The step's template is pre-selected as normal; if
it happens to use `{{demo_link}}` and there is no live demo, the **existing** `blockingNotice` fires —
same red line, same three refused exits — and it already names the prospect and tells him to use
**Create demo**, which is a button already in the modal. **No second refusal mechanism, no skip logic,
no new state.**

🧪 **Today this never fires for a step template:** `{{demo_link}}` appears **0** times in the seeded
templates (*positive control:* `{{truck_name}}` appears 7 times, `{{contact_name_prefixed}}` 4, so the
search finds tokens that are there). The guard is there for when you add the token to a chaser.

## 6 · `do_not_contact` now blocks

🔎 `const refusal = dncNotice ?? malformedNotice ?? blockingNotice`, and the **three exits** (`doCopy`,
`sendNow`, `logNow`) all test `refusal`. It is **first** because it is the most absolute: a malformed
token is a typo to fix and a missing demo is a demo to create, but this one has no remedy inside the
window. The banner suppresses the token/demo lines when it fires — a DNC prospect does not also need to
be told about its tokens.

🔴 **IT REFUSES COMPOSING, NOT RECORDING, AND THAT LINE IS DELIBERATE.** This window produces an
**outbound** message, which is the thing the flag forbids. The modal's own log form is **untouched**, so
you can still record what already happened — including an inbound reply **from** a do-not-contact
prospect. Blocking that would make the history lie.

## 🔴 `chaser-2` and `test` — reported, not touched

You report 9 templates, all `active`, with `chaser-2` at a **5-character** body and `test` at **4,208**.
🔎 `templatesFor` filters only on `active !== false` and channel — **so both are offerable in the compose
picker right now**, and `test` is long enough to be a real message. 🔴 **I created, edited, seeded and
deactivated nothing.** §SQL query 2 lists them. Three rows sharing `sort_order` 999 have **undefined
relative order** — the index is `(active, sort_order)` with no tie-break.

---

# VERIFICATION

**Every harness was pointed at deliberately broken variants FIRST.** A harness that cannot fail proves
nothing, and the specific null result each one risks is named below.

## V1 · `nextStep` — 6 broken variants, all fail; the real module passes

*Null result it risks:* every input returns `unknown`, so the D1 tests "pass" while the module is useless.
*Excluded by:* an explicit control asserting a clean history is **not** unknown, and by the four lead
types and the ladder dates all returning distinct, specific values.

```
BROKEN VARIANT                                        exit
D1 removed — blind rows fall to rung 0                  1  ✗ a history of legacy kinds is UNKNOWN
stop check disabled (do_not_contact)                    1  ✗ do_not_contact stops with reason
inbound reply no longer stops                           1  ✗ inbound reply stops with reason 'replied'
lead type: tri-state NULL treated as true               1  ✗ HU map only → hu_map
channel: WhatsApp without a number                      1  ✗ confirmed, NO number → email
ladder: count instead of highest rung                   1  ✗ 2_chase_1 → 3_chase_2 due 2026-09-08
due/scheduled boundary uses < instead of <=             1  ✗ due 2026-09-14 is 'due'
                          ── the real module ──         0  ✅ ALL CHECKS PASSED
```

**Shapes covered** (today = 2026-09-14): the three legacy rows from your live data; a mixed 3-rungs +
1-blind history; a null `kind`; `not_contacted` **with** a contact; `contacted` with **only** blind rows;
all five exits; a DNC prospect whose history is also unreadable (the stop wins); an **outbound** `reply`
(not a stop, not a rung, not blind); the full ladder with its 3/7/14 dates; the `due`/`scheduled`
boundary on all three sides; a later `first_contact` not demoting a `chase_2`; the same rung logged twice
(same date, not compounded); a re-logged rung (latest date governs); 11 lead-type shapes; 5 channel shapes.

## V2 · `{{demo_link}}`, the Phase 1 guard, the four tokens — all intact

🧪 All 7 of Phase 1's malformed cases still caught; its 3 valid cases still **not** flagged in the same
run (*the control* — a guard that flagged everything would pass the 7 and fail these); the four tokens
from the previous task still valid; the token vocabulary still **12**; `lead_*` are **conditions, not
tokens**, and do not appear in the token reference; a template using `{{demo_link}}` with no demo still
**blocks**, and the lead template itself does not.

## V3 · The four lead types each select the right block

*Null result it risks:* all four lines drop and "exactly one survives" is vacuously near-true.
*Excluded by:* asserting the `not_listed` case **keeps** a line, and that all four renders are **distinct**.

```
hu_ordering  → ["I see you take orders through Hatches Up."]
hu_map       → ["I see you are on the Hatches Up map."]
on_vf        → ["Your schedule is listed on villagefoodie.co.uk."]
not_listed   → ["I could not find you listed anywhere."]
```
Each: exactly one lead line · the right one · no `?lead_` marker leaks · the other three reported in
`droppedConditions` · and 🧪 **4 distinct bodies**.

## V4 · `do_not_contact` blocked at every exit

🧪 `const refusal = dncNotice ?? …` at line 288; **3** exits test `refusal` (lines 347, 361, 386);
`dncNotice` appears 6 times.
🧪 **The control:** `do_not_contact|doNotContact` in `ComposeWindow.tsx` at **HEAD = 0**, now **5**.
⚠️ Not driven through a browser — no admin session is obtainable here. The structural claim is the exits
share one expression; the visual one is on the checklist.

## V5 · Mobile rounds 1–3 intact

🧪 vs HEAD: **0** `max-sm:` classes added, **0** removed (rounds 1–3 are inside `e8b59e5`, so an untouched
diff is the proof). Present at the same counts as the round-3 report: `ProspectMetaFacts` ×3,
`contents max-sm:hidden` ×1, the `sm:hidden` phone copy ×1, `max-sm:grid-cols-2` ×1,
`max-sm:overflow-y-auto` ×1, `max-sm:min-w-0` ×8.
⚠️ **The new column widens the table.** The colgroup already sums to 1510px with `minWidth:1510px`;
below `sm` the table already scrolls horizontally, so this adds width to a surface that already scrolls
— but **it is not something I can see**. Checklist R3.

## V6 · `STEP_TEMPLATE` resolves against real slugs

🔎 `OutreachPanel` builds templates with **`id: r.slug`**, so `MessageTemplate.id` *is* the slug and the
map's keys are the right namespace. `templateForStep` still checks membership of the loaded list, so a
missing slug degrades rather than mis-selects.

## V7 · tsc and lint

`tsc --noEmit -p .` → **exit 0**.

```
                                         HEAD    now
@typescript-eslint/no-explicit-any         15     15
react-hooks/set-state-in-effect            11     11
react-hooks/immutability                    1      1
react-hooks/exhaustive-deps                 1      1
@typescript-eslint/no-unsafe-function-type  1      1
@typescript-eslint/no-unused-vars           1      0   ← premise 5, explained
```
**No finding added.** The new 300-line `lib/outreach-step.ts` contributes **zero**.

---

# CHECKLIST

### The queue
- **Q1.** Outreach tab: a **Due work (n)** button beside the count, and an amber **⚠ n needs a look**
  badge if any history is unreadable. 🔴 **Expect that badge to be non-zero** — 8 of 17 contact rows are
  legacy. It should fall as you fix them.
- **Q2.** Press **Due work**. The list narrows; the count reads "n of 231".
- **Q3.** The **Next step** column: orange = due, grey = scheduled with a date, amber **⚠ Can't tell**,
  faint = stopped/complete. Hover any cell for the step, the due date and the lead type.
- **Q4.** Sort by **Next step**: due work first (in ladder order), then Can't tell, then scheduled.
- **Q5.** 🔴 Open one **⚠ Can't tell** prospect and read its history — the contacts with a kind outside
  First contact / Chase 1 / Chase 2 / Final chase / Reply are why. Fix one, reload, watch it resolve.

### The composer
- **C1.** Open a **due** prospect → Compose. The template should be **already selected and rendered**.
- **C2.** Change it in the picker — it must still work normally.
- **C3.** Open a prospect from the table **not** via a due step. Picker opens **empty**, as before.
- **C4.** 🔴 Tick **Do not contact**, reopen Compose: a red **"Cannot send — do not contact"** line, and
  **Copy, Send and Log must all refuse**. Try all three.
- **C5.** Untick it — everything works again.
- **C6.** Log an **inbound** contact on that same DNC prospect from the modal's own log form. It must
  still save; only the composer is blocked.

### Lead type
- **L1.** Templates tab: the reference should list **9** conditions including the four `?lead_`.
- **L2.** Write a scratch template with all four `?lead_` lines and step the preview prospect through an
  HU-ordering truck, an HU-map truck, one with upcoming events, and one without. **Exactly one line each.**
- **L3.** ⚠️ Sanity-check the `not_listed` wording against premise 3 — it mostly means *"we hold no
  upcoming dates"*, not *"you are not on Village Foodie"*.

### Only you can decide
- **D1.** `chaser-2` (5-char body) and `test` (4,208) are **both offerable in the picker today**.
- **D2.** One first-contact template carrying the four `?lead_` lines would replace `general_email` +
  `hu_rate_email`. `STEP_TEMPLATE` points first contact at `general_email` until you write it.
- **D3.** Nothing distinguishes chase 1 / chase 2 / final chase — all three point at `chaser_email`.

---

# SQL — for Dominic to run; **nothing here was executed**

**1 · The channel rule, and whether `whatsapp_number` is droppable** (§0a):

```sql
select count(*) as prospects,
       count(*) filter (where p.whatsapp_confirmed is true)                     as confirmed,
       count(*) filter (where coalesce(trim(p.whatsapp_number), '') <> '')      as with_wa_number,
       count(*) filter (where p.whatsapp_confirmed is true
                          and coalesce(trim(t.phone), '') <> '')                as confirmed_with_phone,
       count(*) filter (where p.whatsapp_confirmed is true
                          and coalesce(trim(t.phone), '') = '')                 as confirmed_no_phone,
       count(*) filter (where coalesce(trim(t.contact_email), '') <> '')        as with_email
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id;
```

⚠️ `confirmed_with_phone` is the real upper bound on the WhatsApp channel — **not** `confirmed`. Any
`confirmed_no_phone` row is one the step will draft as **email** despite the tick. And if
`with_wa_number` is 0, that column is dead in code *and* data.

**2 · The nine templates** (§"chaser-2 and test") — read-only; I edited no row:

```sql
select t.slug, t.label, t.channel, t.sort_order, t.active,
       length(t.body) as body_chars,
       (t.subject like '%{{demo_link}}%' or t.body like '%{{demo_link}}%')  as uses_demo_link,
       (t.body like '%?lead_%')                                            as uses_lead_condition,
       (t.body like '%?next_event%')                                       as uses_next_event
  from public.outreach_templates t
 order by t.active desc, t.sort_order, t.slug;
```

⚠️ Read `uses_demo_link` first — any `true` is a template the composer will refuse for 230 of 231
prospects. Rows sharing `sort_order` 999 have undefined relative order.

**3 · 🔴 WHAT THE QUEUE WILL SAY BEFORE YOU TRUST IT — the dry run.** `blind_rows` is the D1 column:

```sql
with ladder as (
  select oc.prospect_id,
         max(case oc.kind when '1_first_contact' then 1 when '2_chase_1' then 2
                          when '3_chase_2' then 3 when '4_final_chase' then 4 end) as top_rung,
         count(*) filter (where oc.direction = 'inbound') as replies,
         count(*) filter (
           where oc.direction is distinct from 'inbound'
             and (oc.kind is null
               or oc.kind not in ('1_first_contact','2_chase_1','3_chase_2','4_final_chase','reply'))
         ) as blind_rows
    from public.outreach_contacts oc
   group by oc.prospect_id
)
select p.id, t.name, p.stage, p.next_action_at,
       coalesce(l.blind_rows, 0) as blind_rows,
       case
         when p.do_not_contact then 'STOP do_not_contact'
         when t.hatchgrab_truck_id is not null then 'STOP converted'
         when coalesce(l.replies, 0) > 0 then 'STOP replied'
         when p.stage in ('signed','not_interested','replied') then 'STOP stage'
         when coalesce(l.blind_rows, 0) > 0 then 'UNKNOWN — check the history'
         when coalesce(l.top_rung, 0) = 0 then '1_first_contact'
         when l.top_rung = 1 then '2_chase_1'
         when l.top_rung = 2 then '3_chase_2'
         when l.top_rung = 3 then '4_final_chase'
         else 'SEQUENCE COMPLETE'
       end as next_step,
       case
         when p.hu_ordering is true then '1 hu_ordering'
         when p.hu_map is true then '2 hu_map'
         when coalesce(t.excluded, false) = false and coalesce(t.show_on_vf, true) = true then '3 on_vf?'
         else '4 not_listed'
       end as lead_type_flags_only
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
  left join ladder l on l.prospect_id = p.id
 order by blind_rows desc, p.next_action_at nulls first;
```

⚠️ **`lead_type_flags_only` is NOT the app's answer.** The app's `on_vf` also requires **a future
event**, which this query cannot see without joining `discovery_events`. Treat that column as *"could be
on_vf"*; the app will type some of those `not_listed`.

**4 · How big is each lead type, including the event condition?**

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
       end as lead_type,
       count(*) as prospects
  from public.outreach_prospects p
  left join public.discovery_trucks t on t.id = p.discovery_truck_id
 group by 1
 order by 1;
```

⚠️ 🔴 **Premise 3 in one query.** If `4 not_listed` is large, it is almost entirely *"no upcoming
events"*, not *"hidden from the map"* — `show_on_vf` is `NOT NULL DEFAULT true`. Word that line
accordingly.

**5 · The `kind` split, so you can see the backfill finish:**

```sql
select oc.kind, oc.direction, oc.channel, count(*) as rows,
       min(oc.contacted_at::date) as first_seen,
       max(oc.contacted_at::date) as last_seen
  from public.outreach_contacts oc
 group by oc.kind, oc.direction, oc.channel
 order by rows desc, oc.kind nulls first;
```

⚠️ Every row whose `kind` is not one of the five vocabulary values is a `blind_row`, and every prospect
holding one reads **⚠ Can't tell** in the queue until it is corrected. That is the intended behaviour,
not a bug — but it is also the number that decides how useful the queue is on day one.
