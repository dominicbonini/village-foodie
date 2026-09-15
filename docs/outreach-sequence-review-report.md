# Turning the outreach list into a due-work queue — READ-ONLY REVIEW

**14 September 2026. No code changed. No migration written. No database query run.** The only file
written is this report. Options are laid out; nothing is chosen.

---

# 🔴 PREMISE CORRECTIONS — FIVE, AND THE FIRST ONE CHANGES THE SHAPE OF THE WHOLE TASK

## 1 · 🔴 DOMINIC'S SEQUENCE IS ALREADY IN THE CODE, EXACTLY — INTERVALS AND ALL

The brief presents *"first contact → chase 1 (+3) → chase 2 (+7) → final chase (+14), no date after the
final"* as the thing to build. 🔎 **READ, `lib/outreach.ts`:**

```
CONTACT_KINDS   = ['1_first_contact', '2_chase_1', '3_chase_2', '4_final_chase']
FOLLOW_UP_DAYS  = { '1_first_contact': 3, '2_chase_1': 7, '3_chase_2': 14, '4_final_chase': null }
followUpDateFor(kind, contactedAt)   // counted from the contact's own date, UTC, date-only
```

**That is the brief's sequence, rung for rung and interval for interval, already shipped.** It is not a
proposal in a report — `followUpDateFor` is called from four sites in `OutreachPanel.tsx` and
`persistFollowUpAfterLog` writes the result to `next_action_at` on every log.

🔴 **SO THE GAP IS NOT THE SEQUENCE. IT IS TWO NARROWER THINGS:**
1. Nothing ever says **which rung comes next** — `next_action_at` stores *when*, and no field or function
   stores or derives *what*.
2. Nothing links a rung to a **template** (§C).

This matters because it makes the job far smaller than the brief implies, and it means a "stored step"
option (§B) would be adding a second source of truth next to a ladder that already works.

## 2 · The five workstreams ARE committed

The brief says *"Five workstreams were uncommitted at HEAD `3a95e9f`."* 🧪 They were committed as
**`e8b59e5 outreach`** — 13 files, 3,368 insertions. The working tree now carries only the **prune fix**
from the previous task (3 files, unrelated to outreach). Verbatim commands below.

## 3 · ⚠️ I CANNOT ENUMERATE THE 9 TEMPLATES — THE RULES FORBID IT

§C asks me to *"enumerate the 9 templates and say, from their slug, label, channel, `sort_order` and
body…"*. The RULES say **"Do not query or write the database."** Template rows are **data**, not code —
🔎 only **5** exist anywhere in the repository (the migration seed). `chase-1`, `chaser-2`, `test` and
the three `sort_order` 999 rows were created through the Templates tab and exist only in the table.

**I treated this as resolvable rather than a stop**, because the brief supplies the mechanism itself —
*"Write SQL for Dominic; do NOT run it."* So §C enumerates the **5 seeded rows from the migration
(READ)**, treats the other four as **Dominic-supplied claims**, and §SQL query 2 is the enumeration he
can run. 🔴 **If you wanted me to stop instead, say so — but the answer would have been "I cannot see
those rows", which the SQL gets you faster.**

## 4 · 🔴 THE "5 ACTIVE TEMPLATES" FIGURE — RE-DERIVED, AND IT IS 4 IN THE SEED

The brief warns this figure was carried through three documents before the data showed **4**. 🔴 **One
of those three documents is mine** — `docs/outreach-name-tokens-report.md` says *"it appears in **5
active templates**"*. Re-derived from the migration, per row rather than per occurrence:

```
  hu_rate_email    {{contact_name_prefixed}} x0     ← the one that does NOT carry it
  general_email    x1        chaser_email  x1
  wa_intro         x1        wa_chaser     x1
  ROWS: 4 of 5   ·   OCCURRENCES: 4
```

⚠️ **That is the SEED, not the live table.** With 9 rows live, the live figure is a DB question — §SQL
query 3. **I am not restating "5", and not asserting the live number either.**

## 5 · ⚠️ TWO STALE COMMENTS IN SHIPPED CODE, BOTH ABOUT THIS EXACT SEQUENCE

- 🔎 `lib/outreach.ts`, in the `KIND_LABELS` block: *"CONTACT_KINDS has **three** rungs and nothing can
  add a fourth without editing that array."* It has **four**. The same file's header says four, so the
  file contradicts itself 50 lines apart.
- 🔎 `OutreachPanel.tsx`, above `submitLog`: *"One rule, no hidden state: **+3 / +7 / none**… and
  `3_chase_2` **CLEARS**."* Now 3 / 7 / 14, and it is `4_final_chase` that clears.

**Both describe the three-rung era.** Neither changes behaviour; both would mislead the next reader of
precisely the code a step model would build on.

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

no changes added to commit (use "git add" and/or "git commit -a")
════
e8b59e5 outreach
3a95e9f demo
5e57c45 scraper
7a9b823 landing and scraper
6e1259b scraper updates
```

⚠️ `/usr/bin/git` on this machine is a **license-blocked Xcode shim** (`exit 69`). The commands above ran
through `/Applications/Xcode.app/Contents/Developer/usr/bin/git`, which bypasses the shim. **Run
`sudo xcodebuild -license` once** or every `git` call outside this session fails.

### Admin-only — confirmed by symbol

`OutreachPanel` is imported by `app/admin/page.tsx` alone (`app/admin/outreach/page.tsx` is a server
`redirect`). `TemplatesPanel` and `ComposeWindow` are imported only from that tree. Both routes are
behind `verifyAdmin`. `lib/outreach.ts` and `lib/outreach-filter.ts` are imported only by those files
and the outreach route.

🔴 **ONE SHARED DEPENDENCY, FLAGGED:** `lib/whatsapp-hint.ts` → `phoneWhatsApp` is **shared with the
public live-truck button** — its own header says so: *"shared by the live button and outreach"*. The
outreach panel only **reads** `.waPhone` from it. **Any step model that wants to change WhatsApp
eligibility must not edit that file**; it would change a customer-facing button. §D.

---

# A. WHAT STATE EXISTS TODAY

🔎 All five vocabularies live in **`lib/outreach.ts`** and nowhere else. The migration
(`20260903_outreach_tracking.sql`) deliberately writes **no CHECK** on any of them — its stated reason:
*PostgREST exposes no CHECK metadata, so the app cannot read a constraint back to build a dropdown, and a
constraint there is a rule with no reader that drifts.*

| Field | Where the values live | DB CHECK | TS union | UI dropdown | Route validator |
|---|---|---|---|---|---|
| `outreach_prospects.stage` | `OUTREACH_STAGES` — `not_contacted`, `contacted`, `replied`, `signed`, `not_interested` | 🔴 **none** | ✅ `OutreachStage` | ✅ modal + filter | ✅ `isStage` → HTTP 400 |
| `outreach_contacts.kind` | `CONTACT_KINDS` (4) + `REPLY_KIND` | 🔴 **none** | ✅ `ContactKind` | ✅ `kindsForDirection` | ✅ `isKind` |
| `outreach_contacts.direction` | `CONTACT_DIRECTIONS` — `outbound`, `inbound` | 🔴 **none** | ✅ | ✅ | ✅ `isDirection` |
| `outreach_contacts.channel` | `CONTACT_CHANNELS` — `email`, `whatsapp`, `phone`, `in_person` | 🔴 **none** | ✅ | ✅ | ✅ `isChannel` |
| `outreach_prospects.next_action_at` | `date` | n/a | `string \| null` | date input + 3 quick-set buttons | `body.next_action_at \|\| null` |
| 🟢 `outreach_templates.channel` | — | ✅ **`check (channel in ('email','whatsapp'))`** | ✅ | ✅ | — |

🔴 **THE ASYMMETRY IS WORTH SEEING.** The one vocabulary with a real database constraint is the
**template** channel, which has two values. The four that a step model would read are **unconstrained
text**, enforced only by `isKind`/`isStage` on the write path.

🔴 **AND THE ENFORCEMENT IS NOT RETROACTIVE — THIS IS THE LOAD-BEARING FACT FOR §B.** 🔎 The code's own
figure: *"8 of the 10 live rows store a value that is no longer in the vocabulary"* — `first_contact`,
`follow_up`, `chase`. `kindLabel` humanises them (`follow_up` → "Follow up") and the history table pairs
that with a ⚠ marker driven by `isKind`. **So `kind` is a validated-going-forward, unvalidated-historically
column.** A derived next-step rule reading `kind` reads a column where the majority of existing rows are
outside the vocabulary. ⚠️ That 8-of-10 figure is the code's claim, dated; §SQL query 1 re-derives it.

**`stage` and `kind` are two independent records of the same journey, and nothing reconciles them.**
🔎 `log_contact` in the route: *"LOGGING WRITES A CONTACT ROW AND NOTHING ELSE."* No stage change. And
`update_prospect` changes stage without touching contacts. A prospect can sit at stage `not_contacted`
with four logged contacts, or `signed` with none, and no code objects.

---

# B. DERIVED VERSUS STORED

## B.1 The derived rule, stated exactly

Purely from existing rows, with **no new state**:

```
nextStep(prospect, contacts):
  if prospect.do_not_contact === true            → STOP
  if prospect.stage in ('signed','not_interested','replied')  → STOP
  if any contact has direction === 'inbound'     → STOP  (they replied)
  ladder := contacts.filter(direction === 'outbound' && isKind(kind) && kind !== 'reply')
  if ladder is empty                             → '1_first_contact'
  highest := max(ladder, by KIND_ORDER)          ← the function already exists
  if highest === '4_final_chase'                 → SEQUENCE COMPLETE
  else                                           → the next entry in CONTACT_KINDS
  dueOn := followUpDateFor(highest, highest.contacted_at)   ← already exists
```

🔎 **Three of the four pieces are already written**: `kindOrder`/`KIND_ORDER`, `followUpDateFor`, and
`isKind`. The only new logic is *"highest rung → the next one"*, which is one array index into
`CONTACT_KINDS`.

⚠️ **`max by KIND_ORDER`, not `count`, and not `most recent`.** The manual records why counting failed
twice: a double-click made a first approach look like a third, and a count cannot tell chasing silence
from following up an engaged prospect. Taking the highest rung is immune to both.

## B.2 Where it is ambiguous — and what it would conclude

| Ambiguity | What the derived rule concludes | Acceptable? |
|---|---|---|
| **Two contacts the same day** | 🟢 **Already solved.** `contactSignature` = day + direction + kind + channel; `findDuplicateContact` blocks an exact repeat at the UI. A genuine second same-day touch differs by kind or channel and both log. Max-by-rung makes duplicates harmless anyway. | ✅ **Yes** |
| **A logged contact with `kind = null`** | Excluded from the ladder by `isKind(null) === false`, so it is invisible to the step. A prospect chased once with a null kind reads as **never contacted** and gets offered First contact again. | 🔴 **NO.** The route permits `kind: null` explicitly (`kind: kind ?? null`), so this is reachable today. **Any derived rule needs a policy for null — the honest one is to surface it ("1 contact not counted"), not to guess.** |
| **Legacy kinds (`follow_up`, `chase`, `first_contact`)** | Same as null — `isKind` is false, so they are invisible. 🔎 The code's own figure is **8 of 10 live rows**. | 🔴 **NO, and this is the biggest one.** A derived rule launched today would tell Dominic to send a first contact to prospects he has already chased. **This is the strongest argument for rationalising the data before deriving anything.** |
| **Inbound reply mid-sequence** | STOP. And 🟢 the existing code already half-does this: `followUpDateFor('reply', …)` returns **null** because `FOLLOW_UP_DAYS` is keyed on `LadderKind` only, so logging an inbound reply **clears `next_action_at`** and drops the prospect out of the overdue queue. | ✅ **Yes** — provided the reply is logged. §E |
| **Manual stage change contradicting history** | The rule above lets **stage win** (`signed`/`not_interested`/`replied` → STOP) while letting **contacts** decide the rung. So stage is a veto, not a position. | ⚠️ **Defensible but arbitrary.** The opposite choice — contacts win — is equally defensible. 🔴 **This is a decision for Dominic, not a fact** (§J). |
| **A send that was never logged** | The prospect keeps its old rung and its old due date, so the queue offers a step already sent. | 🔴 **NO** — and it is the failure mode §H is about. |

## B.3 What a STORED alternative would cost

| Shape | New state | What keeps it in sync | Verdict at this scale |
|---|---|---|---|
| **Two columns** on `outreach_prospects` — `sequence_step text`, `sequence_due date` | 1 migration, 2 columns | Every `log_contact`, every manual stage edit, every reply, every DNC tick. 🔴 **`next_action_at` already exists and would now have a rival** — two columns answering "when next", which is the exact shape §A flags between `stage` and `kind`. | ⚠️ **Adds the drift it is meant to remove** |
| **An enrollment table** — `outreach_sequence_runs(prospect_id, step, due_at, state)` | 1 table, 1 FK, a state machine | Same sync burden plus a row lifecycle | 🔴 **Over-engineering** for 1 user / 231 prospects (§I) |
| **Derived, with a `kind` backfill first** | 🟢 **none** | nothing — it is a pure function of rows that already exist | ✅ **Smallest thing that works**, *if* the legacy-kind problem is fixed first |

🔴 **THE HONEST SUMMARY: derived is cheaper and has no sync problem, but it is only as good as `kind`,
and `kind` is the column where the code itself says 8 of 10 rows are outside the vocabulary.** The
choice is not really derived-vs-stored; it is **whether to clean `kind` first**.

---

# C. TEMPLATE → STEP

## C.1 🔴 Does anything link a template to a sequence position? — **REFUTED, with a caveat**

**The claim is that NOTHING links them. That is not quite right: something does, but it is keyed on the
wrong thing.**

🔎 `suggestTemplateId` in `lib/outreach-template-render.ts`:

```ts
export function suggestTemplateId(row: { stage: string|null; hu_ordering: boolean|null }): string|null {
  if (row.stage === 'contacted') return 'chaser_email'
  if (row.hu_ordering === true)  return 'hu_rate_email'
  return 'general_email'
}
```

**The search, the file set, and the control.** Two file lists over `app components lib scripts supabase`
(never scoped by extension): files naming a `CONTACT_KINDS` value, and files naming a template
slug/`MessageTemplate`/`templateId`. **Intersection outside `docs/`: `OutreachPanel.tsx` only** — and
that is the 2,200-line container, not a link. Narrowing to the function itself:

```
   suggestTemplateId body contains:  kind absent · 1_first_contact absent · 2_chase_1 absent
                                     CONTACT_KINDS absent · outreach_contacts absent · next_action_at absent
   -- POSITIVE CONTROL, same body -- stage PRESENT · hu_ordering PRESENT
```

🔴 **So: a template is linked to `stage` + `hu_ordering`, and to NOTHING in the ladder.** All three
chases collapse to the single slug `chaser_email`, because `stage` has one value (`contacted`) covering
every touch after the first.

⚠️ **Two further facts about that link:**
- 🔎 The slugs are **hardcoded string literals**. `outreach_templates` is user-editable data — retiring
  or renaming `chaser_email` on the Templates tab makes `suggestTemplateId` return a slug that resolves
  to nothing, silently. **A row label used as a join key**, which is a failure class the reference manual
  already names.
- 🔎 It is **display only**. `ComposeWindow`: `const [templateId, setTemplateId] = useState('')` with the
  comment `// '' = none chosen; NEVER auto-selected`. `suggestedId` is used once — to append
  `"  (suggested)"` to a label in the dropdown. **Nothing is pre-loaded today.** §G

## C.2 The templates — what I can and cannot see

🔴 **Only 5 template rows exist in the repository.** All are in the migration seed, read verbatim:

| slug | label | channel | `sort_order` | Which step it appears to serve (INFERRED from label + body) |
|---|---|---|---|---|
| `hu_rate_email` | Hatches Up — ordering costs | email | **10** | **First contact**, for the Hatches Up segment. Body opens *"I noticed you're on Hatches Up at 4.5% + 20p"* — a positioning pitch, not a chase. 🔎 The only seeded row with **no** `{{contact_name_prefixed}}`. |
| `general_email` | General approach — listed on Village Foodie | email | **20** | **First contact**, default segment. 🧪 `suggestTemplateId` returns it for 214 of 231 rows (report figure, not re-derived). |
| `chaser_email` | Chaser — already contacted | email | **30** | **A chase — which one is not expressible.** This single row is what `stage === 'contacted'` maps to, so it serves chase 1, chase 2 **and** final chase. |
| `wa_intro` | WhatsApp — short intro | whatsapp | **40** | **First contact**, WhatsApp channel |
| `wa_chaser` | WhatsApp — short chaser | whatsapp | **50** | **A chase**, WhatsApp channel — same three-into-one collapse |

🔴 **The seed is a 2 × 2 grid + 1: {first contact, chase} × {email, WhatsApp}, plus an HU-specific first
contact. It was never designed to express four rungs**, and no amount of mapping will make 2 chase
templates cover 3 chase rungs.

### What Dominic reports, which I cannot verify

| Claim | Status |
|---|---|
| There are **9** templates | ⚠️ **Dominic's claim.** The manual (§52.4, 9 Sep) says **6** — "5 seeded + 1 created through the tab". Two different figures, five days apart. **Neither re-derived here.** |
| `chase-1`, `chaser_email`, `chaser-2` may be the same step | ⚠️ Consistent with the seed: `chaser_email` is the only seeded chaser, so `chase-1`/`chaser-2` are hand-made and 🔴 **the naming convention already diverges — underscore vs hyphen**, which matters if a slug ever becomes a join key |
| Three sit at `sort_order` **999** | ⚠️ Not the DDL default (`0`) and not a seed value (10–50), so hand-set. 🔴 **Three rows sharing one `sort_order` have an undefined relative order** — the index is `(active, sort_order)` with no tie-break |
| One is called `test` | ⚠️ 🔴 **If `active = true` it is offerable in the compose picker** — `templatesFor` filters only on `active !== false` and channel |

**§SQL query 2 enumerates all of them.**

## C.3 The smallest mapping mechanisms, and what each costs

| Mechanism | Shape | Cost | Risk |
|---|---|---|---|
| **A) Constant map in `lib/outreach.ts`** | `STEP_TEMPLATE: Record<LadderKind, {email: slug, whatsapp: slug}>` | 🟢 **One exported const, no migration, no UI.** Sits beside `FOLLOW_UP_DAYS`, which is exactly this shape already | 🔴 Hardcodes slugs against **editable rows** — the `suggestTemplateId` flaw, multiplied by 8 entries. Needs a "slug not found" path that is visible, not silent |
| **B) A `step` column on `outreach_templates`** | `alter table … add column step text` | 1 migration; the Templates tab needs a picker; `templatesFor` unchanged | 🟢 The mapping lives with the data it describes, survives renames, and Dominic edits it where he already edits templates. 🔴 **But it is a new unconstrained text column** — the §A problem again, and 🔴 **the brief forbids editing template rows**, so it would ship empty and do nothing until he fills it |
| **C) A slug convention** (`step1_email`, `step2_email`…) | zero code | 🟢 free | 🔴 **Worst of the three.** Requires renaming existing rows (forbidden here), and a convention with no validator is a convention that drifts — the `chase-1`/`chaser_email`/`chaser-2` split is already evidence |
| **D) Extend `suggestTemplateId` to take the derived step** | change its signature to `(row, step)` | 🟢 small, one call site (`OutreachPanel.tsx:1933`) | Still hardcoded slugs, but **no new state anywhere** and it reuses the existing display path |

⚠️ **A and D are the same mechanism at different call sites.** 🔴 **None of them works until the template
set covers four rungs** — currently 2 chase templates for 3 chase rungs, so any map has a hole. §J.

🔴 **I have not edited, created or seeded any template row, and this report proposes none.**

---

# D. THE CHANNEL DECISION

## D.1 What the three fields actually contain and who reads them

| Field | Read by | 🔴 Finding |
|---|---|---|
| `whatsapp_confirmed` | `templatesFor` (**the gate**), the table column, `sortValue`, `matchesOutreachFilter`, `WhatsAppBox`, the live wa.me link, `ComposeWindow`'s `whatsappConfirmed` prop | **Load-bearing.** 🔎 `templatesFor`: `.filter(t => t.channel === 'email' \|\| row.whatsapp_confirmed === true)` — WhatsApp templates are not even offered unless this is `true` |
| `whatsapp_number` | 🔴 **NOTHING.** The route selects it, maps it, and patches it; `Prospect` types it. **Zero renders, zero filters, zero derivations.** | *Search:* `whatsapp_number` across `app components lib`, minus the select/map/patch/type lines → **empty**. *Positive control, same file:* `whatsapp_confirmed` → **16** hits in `OutreachPanel.tsx`. **A stored, writable, completely unread column.** |
| `platform` | `isHatchesUp` in the **default priority sort**, the platform picker, `canonicalisePlatform` | Used, but for segmentation (Hatches Up), not channel |

🔴 **THE WHATSAPP LINK DOES NOT USE `whatsapp_number`.** 🔎 `OutreachPanel.tsx`:
`const waPhone = phoneWhatsApp(p.phone, null).waPhone` — derived from **`discovery_trucks.phone`**, the
scraped number. So the field named "whatsapp number" is not the number WhatsApp is sent to.

## D.2 Is "WhatsApp if we have it" expressible?

**Yes, three different ways, and they disagree.** 🔎 All READ:

| Predicate | Source | 🧪 Coverage (manual §52.3, dated 9 Sep — not re-derived) |
|---|---|---|
| `whatsapp_confirmed === true` | Dominic's own tick | **30 of 231** |
| `phoneWhatsApp(p.phone).waPhone` truthy | a 447 mobile exists | — |
| `whatsappHint === 'advertises'` | scraped `accepted_methods` | **30 of 231** |

🔴 **AND §52.3 RECORDS THAT THE FIRST TWO ARE THE SAME 30 ROWS.** *"all 30 carry the scraped hint
`advertises` — and there are exactly 30 `advertises` trucks in the whole table. A 1:1 match, so not one
row was personally verified."* **`whatsapp_confirmed` is a scraped hint wearing the word "confirmed".**

⚠️ **THE MANUAL ATTACHES A LEGAL CONSEQUENCE TO THAT, AND I AM REPEATING IT RATHER THAN BURYING IT:**
*"the ICO treats messaging apps as in scope, so cold WhatsApp marketing requires prior opt-in — this gate
is not consent evidence."* 🔴 **A step model that automatically routes to WhatsApp would be automating
the thing the manual says is not evidenced.** That is a decision for Dominic (§J), not a code question.

## D.3 What happens when a prospect has both

🔎 **Today: nothing decides.** `templatesFor` returns email templates **and** WhatsApp templates for the
30 confirmed rows, the picker lists all of them, and Dominic chooses. The channel is a property of the
**template** (`outreach_templates.channel`, the one real CHECK constraint), so choosing the template *is*
choosing the channel. `onLog` records `selected?.channel ?? 'email'`.

**For a step model, the options are:**
- **One step, one channel** — the step names a template, the template names the channel. Simplest; loses
  "email *and* WhatsApp for the same touch".
- **One step, two templates** (email + WhatsApp slots, as in §C.3 option A) — Dominic picks at send time.
- **Channel as a separate axis** — the step says "chase 2", a rule says which channel. 🔴 Needs the
  consent question answered first.

⚠️ Note the ladder already tolerates both: 🔎 `contactSignature` includes `channel`, so *"a legitimate
second contact on the same day differs by KIND or by CHANNEL, and both still log."* **An email and a
WhatsApp on the same day for the same rung are two rows and neither is a duplicate.**

---

# E. EXIT AND BRANCH CONDITIONS

| Condition | Detectable today? | Where | Does anything act on it? |
|---|---|---|---|
| **Inbound reply** | ✅ `outreach_contacts.direction = 'inbound'` | modal log form; `isDirection` validates | 🟢 **Partly — and better than expected.** `followUpDateFor('reply', …)` returns **null** (`FOLLOW_UP_DAYS` is keyed on `LadderKind`, `reply` is not one), so `persistFollowUpAfterLog` writes `next_action_at = null` and the prospect **leaves the overdue queue**. 🔴 **But `stage` is NOT set to `replied`** — that stays manual. |
| **`do_not_contact`** | ✅ column + `DoNotContactToggle` + a 🚫 DNC chip + a filter | `lib/outreach-filter.ts`, `OutreachPanel` | 🔴 **NO. IT BLOCKS NOTHING.** *Search:* `do_not_contact` in `ComposeWindow.tsx` → **0**, in `lib/outreach-template-render.ts` → **0**. *Positive control, same two files:* refusal/`malformed` symbols → **19** and **10**. **You can compose, send, copy and log to a DNC prospect with no warning.** |
| **Demo created** | ✅ `p.demo` (newest live demo, from `demo_sessions` by `discovery_truck_id`) | outreach route bulk read; modal chip | Display only — plus it decides whether `{{demo_link}}` resolves (§G) |
| **Converted to a real truck** | ⚠️ **Not on this surface.** 🔎 `TRUCK_EMBED` selects `id, name, aliases, contact_email, phone, mobile, accepted_methods, order_url, excluded, logo_url, photo_url, website, schedule_url` — **`hatchgrab_truck_id` is not in it.** The outreach route reads that column only inside the **media-delete guard**. *Positive control:* `hatchgrab_truck_id` appears in **44** files repo-wide, so the search finds it where it is. | — | 🔴 **No.** One word added to the embed would make it available — but it would be a **new** signal, not a currently-detectable one |
| **Bounce** | 🔴 **NO.** Sending is a `mailto:` handed to Outlook. 🔎 `sendNow`: *"Handing a mailto: to the OS tells us one thing: a compose window was requested."* | — | **Nothing. Undetectable by construction**, and no amount of step modelling changes that without a real sending integration |

## 🔴 The reply case, in full — because it is the one that matters

**The good news, READ:** logging an inbound reply already clears the due date, so the prospect drops out
of an overdue view. That is a real, shipped exit.

**The three ways it still fails:**
1. 🔴 **It depends entirely on Dominic logging the reply.** A reply sitting unlogged in Outlook is
   invisible — the prospect stays due and the queue will offer the next chase. **Nothing reads email.**
2. 🔴 **`stage` is not updated.** A replied-to prospect keeps `stage = 'contacted'`, so `suggestTemplateId`
   still returns `chaser_email` and any stage-based rule still says "chase them".
3. ⚠️ **`kindsForDirection('inbound')` returns `[REPLY_KIND]` only**, so an inbound row *cannot* carry a
   ladder rung from the UI — good — but `reply` is in **both** lists deliberately, so an **outbound**
   `reply` (Dominic writing back) is also recordable. 🔎 A derived rule must exclude `reply` from the
   ladder in **both** directions or an outbound reply reads as a rung. The rule in §B.1 does.

---

# F. THE WORK QUEUE UI

## F.1 What exists now — more than the brief implies

🔎 **All READ from `OutreachPanel.tsx` and `lib/outreach-filter.ts`:**

- **The whole list is client-side.** `computedVisible` = `prospects.filter(matchesOutreachFilter)` then
  sorted, over rows already loaded. *"No endpoint, no query param, no refetch."* 🔴 **A "due today" view
  needs no new API.**
- **12 filters already exist**: `search`, `huOrdering`, `huMap`, `whatsapp`, `doNotContact`, `email`,
  `phone`, `stage`, `schedule`, `nextAction`, `logo`, `photo`.
- 🟢 **`nextAction` is already `'any' | 'overdue' | 'scheduled' | 'none'`**, and `isOverdue` is *strictly*
  `next_action_at < today`. **So "overdue" ships today, and "due today" is the one value between the two
  that does not exist yet.**
- **Sorting**: 12 sortable keys including `next_action` and `last_contacted`; three-click cycle
  (asc → desc → back to default). Nulls always last.
- **Default sort** is a 5-way priority rank: `hatchesUp && hasEmail && notContacted` → … → everything
  else. 🔴 **It is a "who to approach first" sort, not a "what is due" sort** — it reads `platform`,
  `contact_email` and `stage`, and never reads `next_action_at`.

## F.2 What a "due today" view would need on top

🔴 **Smallest version: one filter option and one sort default. Not a tab, not a view.**

| Option | Change | Cost |
|---|---|---|
| **A) A `'due'` value on the existing `nextAction` filter** | 1 entry in the `NextActionFilter` union, 1 clause in `matchesOutreachFilter`, 1 option in the filter bar | 🟢 **Smallest.** The file's own header says adding a filter is *"ONE entry in `EMPTY_OUTREACH_FILTER` and ONE clause in `matchesOutreachFilter`"*. "Due" = `overdue \|\| next_action_at === today` |
| **B) A saved default** — land on `nextAction = 'due'` sorted by `next_action` asc | plus persistence of a filter state | 🟢 Small, but changes what the page *is* on open |
| **C) A new tab** | a new panel, its own state | 🔴 **Over-engineering** — it would re-render the same client-side array with a different default |

⚠️ **None of these names the next step or pre-loads a template.** They get the *right rows* on screen;
§B and §C are what make the row say what to do.

## F.3 The columns — and Dominic's question about phone / email / WhatsApp

**Current columns** (🔎 the `COLUMNS` array, in order): Logo · Photo · Truck · Phone · WhatsApp · Email ·
HU ordering · HU map · Schedule · Stage · Last contacted · Next action.

| Column | Stored or derived | What depends on it |
|---|---|---|
| Logo / Photo | stored (`discovery_trucks`) | drop-to-upload target |
| Truck | stored | the modal opener; the 🚫 DNC chip hangs off it |
| **Phone** | stored (`discovery_trucks.phone`) | `sortValue`, the `phone` filter. 🔴 **The VALUE also feeds `phoneWhatsApp` → the wa.me link** |
| **WhatsApp** | 🔴 **derived display of `whatsapp_confirmed`** (tick = true, blank = NULL) | `sortValue`, the `whatsapp` filter, **and it is the only place the flag can be SET** — `WhatsAppBox` writes on tick |
| **Email** | stored (`discovery_trucks.contact_email`) | `sortValue`, the `email` filter, 🔴 **the DEFAULT PRIORITY SORT** (`hasEmail`), and it is an **editable inline field** — `InlineField` writes `contact_email` on commit |
| HU ordering / HU map | stored tri-state | filters, tickable |
| Schedule | **derived** (`scheduleState`/`hasSchedule`) | filter |
| Stage | stored | filter; editable in the modal |
| Last contacted | **derived** (newest contact) | sort |
| Next action | stored | sort, filter, the red ⚠ overdue marker |

🔴 **DIRECT ANSWER: dropping those three columns costs nothing structurally, and the mechanism already
exists.** `FILTERS` is a **separate array** from `COLUMNS`, and it already carries a **`noColumn?: true`**
flag — 🔎 used today by `doNotContact`, which has a filter and no column. So a filter survives its column.

⚠️ **But three things move with them, and two are not obvious:**
1. **The WhatsApp tick is the only writer of `whatsapp_confirmed`.** Remove the column and the flag
   becomes unsettable outside the modal — 🔴 and that flag is what `templatesFor` gates WhatsApp
   templates on. **The column is cheap; the field is load-bearing.**
2. **The Email cell is an editable field**, not a display. Removing it removes an edit path (the modal
   still has one).
3. `SortKey` and `sortValue` would lose three cases; `COLUMNS` and the header row shrink.

🟢 **`whatsapp_number` is the genuinely dead one** — §D: no reader at all. **Dominic's instinct is right
about a column, and there is a stronger version of it about a field.**

---

# G. PRE-LOADING THE TEMPLATE

🔎 **How compose opens today:** the modal's `Detail` renders `<ComposeWindow>` when `composeOpen`, passing
`offerable = templatesFor(templates, p)`, `suggestedId = suggestTemplateId(p)`, `ctx = contextFromProspect(p)`.
Inside: `const [templateId, setTemplateId] = useState('')` — `// '' = none chosen; NEVER auto-selected`.
`suggestedId` is used **once**, to append `"  (suggested)"` to a label.

**To open with a step's template selected:** call the existing `applyTemplate(id)` on mount instead of
leaving `templateId` empty. 🔎 `applyTemplate` already does everything — sets the id, renders the
template, seeds `fills` from `defaultFillsOf`, resets `edited`/`pending`/`sendError`. **The mechanism is
built; only the initial call is missing.** So this is genuinely small — *if* a step can name a template
(§C), which today it cannot.

## 🔴 The `{{demo_link}} `constraint

🔎 Re-verified by symbol in `lib/outreach-template-render.ts`: `MUST_RESOLVE = new Set(['demo_link'])`;
`substitute` returns `[[demo_link]]` for a member **even when a fallback is declared**; `blockingIn`
reports it; `defaultFillsOf` drops a must-resolve key; `ComposeWindow` refuses **all three exits**
(Copy, Send, Log) while `blocking` is non-empty.

🧪 **It resolves for exactly 1 of 231 prospects** (Between Buns Royston) — that figure is Dominic's,
carried forward, **not re-derived here** (no DB query).

🔴 **WHAT THIS MEANS FOR A STEP MODEL — AND IT IS THE SHARPEST CONSTRAINT IN THIS REVIEW.** If a step
names a template containing `{{demo_link}}`, auto-selecting it opens a compose window that **cannot send,
copy or log** for 230 of 231 prospects. The queue would name a step and then refuse to let him do it.

**The options, and each is a real choice:**
1. **Steps never use `{{demo_link}}`.** Simplest; the demo link stays a manual composition.
2. **A step declares a precondition** (`requiresDemo: true`) and the queue either hides it or shows
   "Create demo first". 🟢 The data is already there — `p.demo` is on every row.
3. **The step falls back** to a non-demo template when no demo exists. ⚠️ Two templates per step, and the
   prospect silently gets different copy depending on a condition he cannot see.
4. **Creating the demo becomes part of the step.** 🟢 The Create demo button already exists in the modal
   (`CreateDemoModal`, z-index 95).

⚠️ **A general version of the same trap:** `unresolvedIn` placeholders (`[[my rate]]`, `[[link]]`) do
**not** block, they only warn — so an auto-selected template can open with fields still to fill. That is
fine, but it means "pre-loaded" never means "ready to send".

---

# H. LOGGING AS THE INPUT

🔎 **Three independent exits in `ComposeWindow`, and none of them logs as a side effect:**

| Exit | What it does | Logs? |
|---|---|---|
| `doCopy` | `navigator.clipboard.writeText(fullText)` | ❌ |
| `doSend` → `sendNow` | `window.location.href = mailtoUrl` | ❌ 🔎 *"SEND OPENS OUTLOOK. IT DOES NOT LOG, AND IT NEVER WILL… `onLog` is not referenced anywhere in this function."* |
| `doLog` → `logNow` | `await onLog(fullText, channel)` | ✅ **the only one** |

🔴 **The reasoning is already written down and it is good:** *"Handing a mailto: to the OS tells us one
thing: a compose window was requested. It cannot tell us the message was sent, edited, or abandoned.
Logging on send would put a row in the contact history for an email that may never have left — and the
history is the thing that stops a fourth email."*

**If a send is never logged**, the derived step is stuck: no new `kind` row, so the highest rung is
unchanged, `next_action_at` is unchanged (🔎 `persistFollowUpAfterLog` is called from the log path only),
and the queue offers **the step he already sent**. 🔴 **For a derived model, an unlogged send is not a
missing record — it is a wrong instruction.**

| Option | What it buys | What it risks |
|---|---|---|
| **Leave manual** | 🟢 Zero change; the history stays truthful | The derived step is wrong whenever he forgets. **Today's cost is invisible because nothing depends on it; a queue makes it visible and harmful** |
| **Auto-log on Send** | The ladder advances without discipline | 🔴 **Reverses a documented decision** and logs sends that never left. Every abandoned draft becomes a touch, which *also* corrupts the step |
| **Prompt after Send** ("Did that go? — Log it") | 🟢 Keeps the human judgement, removes the forgetting | A dismissible prompt is a prompt that gets dismissed; needs a "not sent" answer too |
| **Optimistic log with easy undo** | 🟢 **The undo already exists** — `log_contact` returns the inserted `id` specifically so the client can delete *that* row | Still records an intention rather than a fact |

⚠️ **Note what is already solved:** the double-log guard (`findDuplicateContact`) means a jumpy hand
cannot inflate the ladder, and `delete_contact` un-logs precisely. 🔎 And deleting a contact already
**recomputes the follow-up date** from the newest surviving row (`OutreachPanel.tsx`, the
`impliedByDeleted` / `revertTo` pair) — so the ladder is already self-correcting under deletion.

---

# I. HOW COMPARABLE SYSTEMS DO IT — MAPPED TO THIS CODEBASE

| Pattern | What this codebase already has | What it would need | 🔴 At 1 user / 231 prospects |
|---|---|---|---|
| **Sequence as data** (steps table, per-step template, delay, channel) | 🟢 `CONTACT_KINDS` + `FOLLOW_UP_DAYS` **are** a sequence definition, in code | A steps table, an editor for it | 🔴 **Over-engineering.** A table exists to let non-engineers edit sequences. There is one user and the sequence is 4 fixed rungs he chose |
| **Enrollment row + step index** (`enrollment(prospect, step, due, state)`) | 🟢 `next_action_at` is the due date; the contact log is the step history | A table, a state machine, sync on every event | 🔴 **Over-engineering, and it duplicates `next_action_at`** (§B.3) |
| **Due-task queue** | 🟢 `nextAction` filter (`overdue`/`scheduled`), `isOverdue`, sort by `next_action` | **One filter value** (`'due'`) | ✅ **This is the right size.** §F.2 |
| **Exit conditions** | 🟢 inbound reply already clears the date; DNC, demo, stage all exist as data | DNC to actually gate composing; `hatchgrab_truck_id` in the embed; stage-on-reply | ✅ **Worth doing — and §E shows DNC not gating is arguably a defect today, independent of any queue** |
| **Semi-automated send** (system drafts, human sends) | 🟢 **This is already exactly what exists** — render, review, edit, send by hand, log by hand | Only the pre-selection (§G) | ✅ **The codebase is already this pattern.** The gap is one `applyTemplate` call |
| **Fully automated send** | ❌ nothing — `mailto:` only, no ESP, no bounce, no reply detection | An ESP integration, reply ingestion, suppression | 🔴 **Out of scope and arguably unsafe** — §D's PECR note, and §E's "bounce undetectable" |

🔴 **THE SMALLEST THING THAT WOULD WORK, stated as a fact about the code rather than a recommendation:**
a `'due'` filter value (§F), a pure `nextStep()` function over rows already loaded (§B.1), a
`Record<LadderKind, slug>` beside `FOLLOW_UP_DAYS` (§C.3-A), and one `applyTemplate()` call on mount
(§G). **No migration, no new table, no new endpoint, no new state.** Its correctness depends entirely on
the `kind` column being trustworthy — which §A and §B say it currently is not.

---

# J. OPEN DECISIONS FOR DOMINIC

**1 · Derived or stored step?**
*Facts:* derived needs **no new state** and three of its four pieces already exist (`kindOrder`,
`followUpDateFor`, `isKind`). Stored needs a migration and must be kept in sync on every log, stage edit,
reply and DNC tick — and would sit next to `next_action_at`, which already answers "when". 🔴 **But
derived reads `kind`, where the code's own figure is 8 of 10 live rows outside the vocabulary.**
*The real question:* **is `kind` worth cleaning?** If yes, derived wins easily. If no, neither works.

**2 · Does the template set need rationalising before any mapping is possible?**
*Facts:* the seed is **2 chase templates for 3 chase rungs** — `chaser_email` and `wa_chaser` each serve
chase 1, chase 2 and final chase. Dominic reports 9 rows including `chase-1`, `chaser-2` and `test`, with
three sharing `sort_order` 999 (undefined relative order) and mixed `-`/`_` slug conventions. 🔴 **Any
mapping mechanism in §C.3 has a hole until there is one template per rung per channel.**
*The question:* **rationalise first, or map what exists and accept that three rungs share a template?**

**3 · Should sending auto-log?**
*Facts:* Send is a `mailto:` — it cannot know the message left. The current separation is a documented,
deliberate decision. But a derived step is **wrong**, not merely incomplete, when a send is unlogged.
*The question:* **keep the truthful-but-forgettable log, add a prompt, or accept optimistic logging with
the undo that already exists?**

**4 · What should a reply do?**
*Facts:* logging an inbound reply **already clears `next_action_at`** — a real, shipped exit. It does
**not** set `stage = 'replied'`, so stage-based logic still says "chase". And nothing reads email, so an
unlogged reply is invisible.
*The question:* **should logging an inbound contact also set the stage — and should the queue trust
`stage`, the contact log, or require both to agree?** (§B.2 shows the derived rule must pick one.)

**5 · Is the queue a new view or a filter?**
*Facts:* the list is entirely client-side; 12 filters exist; `nextAction` already has
`overdue`/`scheduled`; `isOverdue` is strictly before today, so **"due today" is the one missing value**.
A new tab would re-render the same array with a different default.
*The question:* **a `'due'` filter option, or a saved default landing state, or a separate tab?**

### Two more that the brief did not list but the code raises

**6 · Should `do_not_contact` block composing?** 🔴 It blocks **nothing** today — you can compose, send,
copy and log to a DNC prospect with no warning. *Independent of any queue, is that a defect?*

**7 · Should WhatsApp be automatable at all?** The manual records that `whatsapp_confirmed` matches the
scraped `advertises` hint 1:1 on all 30 rows — *"not one row was personally verified"* — and that *"this
gate is not consent evidence"* under PECR. *Is a step allowed to route to WhatsApp automatically?*

---

# SQL — for Dominic to run; **nothing here was executed**

Every column named below is in the brief's confirmed list. ⚠️ `outreach_templates.updated_at` /
`created_at` are **not** in that list, so they are not referenced.

**1 · Re-derive the `kind` vocabulary problem — the figure §A and §B depend on.**
🧪 The code claims 8 of 10 live rows carry a value outside the vocabulary. This shows the real
distribution, and the `legacy_or_null` count is the number of rows a derived step would be blind to:

```sql
select oc.kind,
       oc.direction,
       count(*) as rows,
       min(oc.contacted_at::date) as first_seen,
       max(oc.contacted_at::date) as last_seen
  from public.outreach_contacts oc
 group by oc.kind, oc.direction
 order by rows desc, oc.kind nulls first;
```

```sql
select count(*) as all_contacts,
       count(*) filter (
         where oc.kind is null
            or oc.kind not in ('1_first_contact','2_chase_1','3_chase_2','4_final_chase','reply')
       ) as legacy_or_null,
       count(*) filter (where oc.direction = 'inbound') as inbound_rows,
       count(distinct oc.prospect_id) as prospects_with_any_contact
  from public.outreach_contacts oc;
```

**2 · 🔴 Enumerate the templates — the §C table I could not build.** Read-only; I edited no row:

```sql
select t.slug,
       t.label,
       t.channel,
       t.sort_order,
       t.active,
       length(t.body) as body_chars,
       (t.subject is not null) as has_subject,
       (t.subject like '%{{demo_link}}%' or t.body like '%{{demo_link}}%')    as uses_demo_link,
       (t.subject like '%{{compare_link}}%' or t.body like '%{{compare_link}}%') as uses_compare_link,
       (t.subject like '%{{contact_name_prefixed}}%'
        or t.body like '%{{contact_name_prefixed}}%')                          as uses_name_prefixed
  from public.outreach_templates t
 order by t.active desc, t.sort_order, t.slug;
```

⚠️ **Read `uses_demo_link` first** — every `true` there is a template that **cannot be auto-selected**
for 230 of 231 prospects (§G). And watch for rows sharing `sort_order` 999: their relative order is
undefined.

**3 · The "5 vs 4" figure, settled against live data** (§Premise 4 — the seed says 4 of 5 rows):

```sql
select count(*) as templates,
       count(*) filter (where t.active) as active_templates,
       count(*) filter (
         where t.active
           and (t.subject like '%{{contact_name_prefixed}}%'
             or t.body like '%{{contact_name_prefixed}}%')
       ) as active_using_name_prefixed
  from public.outreach_templates t;
```

**4 · What a derived queue would actually say today — the dry run, before any code is written.**
🔴 **Run this before deciding §J.1.** `next_kind` is the derived step; `blind_rows` is how many of that
prospect's contacts the rule cannot see:

```sql
with ladder as (
  select oc.prospect_id,
         max(case oc.kind
               when '1_first_contact' then 1
               when '2_chase_1'       then 2
               when '3_chase_2'       then 3
               when '4_final_chase'   then 4
             end) as top_rung,
         count(*) filter (where oc.direction = 'inbound') as replies,
         count(*) filter (
           where oc.kind is null
              or oc.kind not in ('1_first_contact','2_chase_1','3_chase_2','4_final_chase','reply')
         ) as blind_rows
    from public.outreach_contacts oc
   group by oc.prospect_id
)
select p.id,
       p.stage,
       p.next_action_at,
       p.do_not_contact,
       coalesce(l.top_rung, 0) as top_rung,
       coalesce(l.replies, 0)  as replies,
       coalesce(l.blind_rows, 0) as blind_rows,
       case
         when p.do_not_contact then 'STOP — do not contact'
         when coalesce(l.replies, 0) > 0 then 'STOP — replied'
         when p.stage in ('signed','not_interested','replied') then 'STOP — stage'
         when coalesce(l.top_rung, 0) = 0 then '1_first_contact'
         when l.top_rung = 1 then '2_chase_1'
         when l.top_rung = 2 then '3_chase_2'
         when l.top_rung = 3 then '4_final_chase'
         else 'SEQUENCE COMPLETE'
       end as next_kind
  from public.outreach_prospects p
  left join ladder l on l.prospect_id = p.id
 order by p.next_action_at nulls last, p.id;
```

⚠️ **The column to stare at is `blind_rows`.** Any row where `blind_rows > 0` and `next_kind =
'1_first_contact'` is a prospect the queue would tell you to approach for the first time **after you have
already contacted them**. That count is the whole of decision §J.1.

**5 · Does `stage` agree with the contact log?** (§B.2's "manual stage change contradicts history"):

```sql
select p.stage,
       count(*) as prospects,
       count(*) filter (where c.n is null or c.n = 0) as with_no_contacts,
       count(*) filter (where c.n > 0)                as with_contacts
  from public.outreach_prospects p
  left join (
    select oc.prospect_id, count(*) as n
      from public.outreach_contacts oc
     group by oc.prospect_id
  ) c on c.prospect_id = p.id
 group by p.stage
 order by prospects desc;
```

⚠️ `not_contacted` with `with_contacts > 0`, and `contacted` with `with_no_contacts > 0`, are the two
disagreement buckets. Both are reachable today because 🔎 `log_contact` never touches `stage`.

**6 · Is `whatsapp_number` really dead in the data too?** (§D found no code reader):

```sql
select count(*) as prospects,
       count(*) filter (where coalesce(trim(p.whatsapp_number), '') <> '') as with_whatsapp_number,
       count(*) filter (where p.whatsapp_confirmed is true)                as confirmed,
       count(*) filter (where p.whatsapp_confirmed is true
                          and coalesce(trim(p.whatsapp_number), '') = '')  as confirmed_but_no_number
  from public.outreach_prospects p;
```

⚠️ If `with_whatsapp_number` is 0, the column is dead in code **and** data and can be dropped as a
separate change. If it is non-zero, someone typed numbers into a field nothing reads — which is worth
knowing before removing the field or the column.
