# Message templates for the prospect modal

---

# 0. 🔴 WHERE THE DATA CONTRADICTS THE BRIEF — READ FIRST

## 0.1 `contact_name` is populated on **3 of 231** prospects

The brief puts contact name in the **RESOLVED** tier — *"Filled silently."* 🧪 Re-derived live
(count-asserted, 231/231): **228 rows have no contact name.** Filling silently with the empty string
renders **"Hi ,"** on 98.7% of rows.

**Resolved tokens therefore support a declared fallback** — `{{contact_name|there}}` → *"Hi there,"*.
This still satisfies the tier (nothing visible is left unfilled, nothing is guessed about the person);
it just refuses to produce a broken sentence. **A token with no declared fallback and no value renders
as a visible `[[token]]` rather than a blank**, so a missing field can never masquerade as intentional
prose. Flagged because it changes the tier's behaviour on almost every row.

The three rows that do carry one: **Tikka Tonic** (`Madhur`), **Pizza Mondo** (`Jo`), **Pimp My Fish**
(`Tayyur`) — all at stage `contacted`, all `hu_ordering = true`.

## 0.2 The `whatsapp_confirmed` caveat is not just repeated — it is confirmed

🧪 **30** rows carry `whatsapp_confirmed = true`. All **30** have the scraped hint `advertises`, and there
are **exactly 30** `advertises` trucks among the 231 — a **1:1 match**. The flag is the scraped hint,
recorded from what a truck's own listing advertises, **not a personal verification of anything**. Hint
distribution across all 231: `none` 166 · `mobile_not_advertised` 35 · `advertises` 30.

⚠️ `whatsapp_confirmed` is **never `false`** — 201 null, 30 true. **The data was not changed.**

## 0.3 The next event was **not** available, and now is

The manual and the route agree that the row carries `futureEventCount` and `lastEventDate`. 🔴
`lastEventDate` is the **MAX over all dates** — for a truck with future events that is the *furthest*
one, not the next — and it carries **no venue**. See §2.2 for what it took (no extra query).

## 0.4 The manual's two named sections hold, and both shaped the build

- *"CONTACT HISTORY IS A LOG, NOT A TIMESTAMP… the log is the thing that prevents the failure the page
  exists to prevent."* — this is the whole argument for §3.6: **nothing logs on template selection.**
- *"Reaching operators"* — PECR, individual subscribers, ICO treats messaging apps as in scope, and
  *"email-plus-WhatsApp is the highest-risk combination, not the warmest"* — this is the argument for the
  WhatsApp gate (§3.5) and the mandatory footer (§3.4).

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
	components/admin/ConfirmDeleteDialog.tsx
	components/admin/DiscoveryEventsPanel.tsx
	components/admin/EventRowCells.tsx
	components/admin/InlineField.tsx
	components/admin/ScheduleEventsPopup.tsx
	docs/discovery-events-delete-report.md
	docs/discovery-events-table-report.md
	docs/discovery-run-log-migration-report.md
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
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/schedule-match.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

`git add -A` / `git add .` were not run; nothing was staged. Nothing in the prompt arrived garbled, and no
instruction contradicted another.

---

# 2. DIAGNOSIS

## 2.1 What the two buttons do today

| control | line | what it actually does |
|---|---|---|
| **Email** | `OutreachPanel.tsx:1456` | `href={`mailto:${p.contact_email}`}` — **a bare mailto. No subject, no body.** |
| **WhatsApp** | `:1482` | `href={`https://wa.me/${waPhone}`}` — **no `?text=` prefill**, and already gated on `p.whatsapp_confirmed === true`. |
| Call | `:1481` | `tel:${p.phone}` |

🔴 **The WhatsApp gate already exists at `:1482`.** The template gate reuses **the same condition on the
same row**, so the two cannot disagree about who may be messaged.

**Neither link is modified by this work** (see §3.4 for why the copy button exists instead).

## 2.2 Fields available for substitution

Available on the loaded row already: `name`, `contact_name`, `contact_email`, `phone`, `mobile`,
`website`, `schedule_url`, `order_url`, `stage`, `hu_map`, `hu_ordering`, `whatsapp_confirmed`,
`whatsappHint`, `platform`, `notes`, `next_action_at`, `futureEventCount`, `lastEventDate`,
`outboundCount`, `lastContactedAt`, `contacts[]`.

🔴 **The next event's date and venue were NOT available.** What it took — **no extra query, and none per
row**: `buildScheduleIndex` already does one bulk paged read of `discovery_events`. It now selects
`venue_name` as well, and the *same* in-memory pass that accumulates `futureCount` also tracks the
soonest `event_date >= today` and that row's venue. `scheduleFor` takes the earliest across the truck's
name and aliases. Two new fields on the row: `nextEventDate`, `nextEventVenue`.

🧪 **58** prospects have a next event; **173** do not. Verified in §4 (P9) against an independent
algorithm.

## 2.3 How the log form holds state

`OutreachPanel.tsx:1403-1411` — plain `useState` inside the modal body component:
`channel` (`'email'`), `direction` (`'outbound'`), `kind` (`'first_contact'`), `message` (`''`),
`contactedAt` (today). `submitLog` (`:1474`) is the only caller of `onLog`, and it reads exactly those.

`useEffect(… , [p.id])` (`:1415`) already resets all five when the modal moves to another truck — so a
pre-filled body is cleared by the mechanism that already exists. **`templateId` was added to that same
effect** rather than to a new one.

---

# 3. WHAT WAS BUILT

Three files: `lib/outreach-templates.ts` (new), `app/api/admin/outreach/route.ts` (next-event fields),
`components/admin/OutreachPanel.tsx` (the picker). Nothing else.

## 3.1 Templates as data — one module

`TEMPLATES` is an array of `{ id, label, channel, subject?, body }`. The picker enumerates it; the
renderer is generic. **Adding a template later is one entry in one file** — no new component, no branch.

🔴 **The module imports nothing.** Zero imports, zero `fetch`, zero `supabase` — *"this cannot send or
write"* is a property of the file provable by `grep`, not a claim in a comment.

## 3.2 The three tiers, and how each is expressed

| tier | syntax | behaviour |
|---|---|---|
| **RESOLVED** | `{{truck_name}}`, `{{contact_name\|there}}` | filled silently; optional fallback; **no value and no fallback → a visible `[[token]]`, never a blank** |
| **CONDITIONAL** | `?next_event: your pitch at {{next_event_venue}}` | **the marker is at the START OF THE LINE, and the whole line is dropped** when unmet |
| **UNRESOLVED** | `[[my rate]]` | rendered **verbatim**, double brackets and all; listed in the UI as outstanding |

🔴 **Why the conditional marker is line-leading:** the unit being dropped has to be unambiguous. A token
in the middle of a sentence can only ever blank *itself*, which is precisely the *"your pitch at "*
failure the tier exists to prevent. `?next_event` additionally requires **both** a date **and** a
non-empty venue — a next event with a null venue does **not** satisfy it.

Blank-line runs left by a dropped paragraph are collapsed, so removing a line never leaves a gap that
says *"something used to be here."*

Conditions available: `next_event`, `order_url`, `website`, `contact_name`. An **unknown** condition drops
its line rather than leaking the marker.

## 3.3 The templates shipped, and their placeholders by tier

| template | channel | fits | RESOLVED | CONDITIONAL lines | 🔴 UNRESOLVED (survive into the body) |
|---|---|---|---|---|---|
| `hu_rate_email` — Hatches Up rate comparison | email | `hu_ordering === true` | truck name, contact name (fallback `there`), order_url | `?next_event`, `?order_url` | `[[their current rate]]`, `[[my rate]]`, `[[monthly saving]]` |
| `general_email` — general approach | email | not recorded on HU ordering | truck name, contact name, website | `?next_event`, `?website` | `[[my rate]]`, `[[comparison to their current setup]]` |
| `chaser_email` — already contacted | email | `stage === 'contacted'` | truck name, contact name | `?next_event` | `[[my rate]]` |
| `wa_intro` | whatsapp | gated | truck name, contact name | `?next_event` | `[[my rate]]` |
| `wa_chaser` | whatsapp | gated | truck name, contact name | — | `[[my rate]]` |

⚠️ **The wording is a first draft and is meant to be replaced.** You said you would supply and edit it;
the mechanism is the deliverable. Edit the strings in place — no other file changes.

**Suggestion, never auto-selection.** The picker defaults to `— none —` and marks one option
`(suggested)`. 🧪 Across 231 rows: `general_email` **214**, `hu_rate_email` **14**, `chaser_email` **3**.
The 14 (not 17) is because 3 of the 17 `hu_ordering = true` rows are at stage `contacted` and stage wins —
17 − 3 = 14, re-derived. **A WhatsApp template is never suggested.**

⚠️ `hu_ordering` is **tri-state**: 🧪 17 `true`, 214 `null`, **0 `false`**. So *"not on Hatches Up"* here
means *"not recorded as on it"*, and the general template is the fallback rather than a positive finding.

## 3.4 🔴 The mandatory opt-out footer

`OPT_OUT_FOOTER` is defined once and appended by `composeEmail(body)` at compose time. **It is never
placed in the editable textarea.** It is shown read-only beneath the box, labelled *"Appended
automatically"*, so it is visible without being reachable. 🧪 Proven in §4 (P6): 0 of 5 rendered bodies
contain it; `composeEmail` still appends it to a **completely rewritten** body.

⚠️ **Email only.** A footer on a two-line WhatsApp message reads as spam; that channel's control is the
opt-in gate, which is stricter.

⚠️ **A copy button, not a `mailto` with the body in it.** A `mailto` carries the body in the query string
and is truncated by real clients well below a full template — which would send a half email silently. The
clipboard is lossless. **The existing Email link is untouched**, and the body ends at *"Best,"* — nothing
here writes, duplicates or disables your Outlook signature.

## 3.5 🔴 WhatsApp gating

`templatesFor(row)` returns email templates always and WhatsApp templates **only** when
`row.whatsapp_confirmed === true` — the same condition the live WhatsApp link uses. When a row is not
confirmed the UI says so in a muted line rather than silently offering less.

## 3.6 🔴 Pre-fill, not auto-log — and how the distinction is kept

Selecting a template sets **local state only**: `message`, `channel` (from the template), `direction`
(`outbound`). `contactedAt` is deliberately left alone — it is already today, and it records when a
contact *happened*, which choosing a template does not change.

🔴 **Nothing is written until `Log contact` is pressed.** 🧪 Structurally proven (P1): the handler's only
calls are `setTemplateId`, `setMessage`, `setChannel`, `setDirection`, `renderTemplate` and
`TEMPLATES.find`. **`onLog`, `onPatch`, `fetch`, `submitLog` and `supabase` appear nowhere in it**, and
`submitLog` has exactly one caller — the button at `:1677`.

**Why this matters and is not pedantry:** the browser cannot observe whether a `mailto` was actually
sent. Logging on selection — or on clicking Email — would record *that I opened a compose window*. The
manual is explicit that the log is what stops a fourth email; a log entry for an email never sent
destroys exactly the property the log exists for.

**The `[p.id]` reset clears an unlogged pre-fill.** `templateId` was added to the existing effect, so
prev/next cannot carry a rendered-but-never-sent template into the next truck.

---

# 4. 🔴 PROOFS — AND WHAT EACH FAILURE WOULD HAVE LOOKED LIKE

The renderer was transpiled with **the repository's own TypeScript compiler** (`ts.transpileModule`), not
hand-stripped, so what was executed is the shipped source.

**P1 · Selection writes nothing.** Call census inside the handler — no write path present. *Failure mode:*
a pre-fill that quietly logs a contact, making the log say an email was sent that never was. *Ruled out
by* enumerating every call in the handler rather than reading it.

**P2 · The `[p.id]` reset clears it.** `setMessage`, `setTemplateId`, `setChannel`, `setDirection`,
`setKind`, `setContactedAt` — **all six** present in the effect.

**P3 · 🔴 The three required row categories — named, and one does not exist.**

| category | live rows | example used |
|---|---|---|
| missing contact name, **has** next event | **55** | **Pizzeria Gusto** — next 2026-09-18 at `MSC` |
| **neither** | **173** | **3Bros Burgers** |
| has contact name, has next event | 3 | **Tikka Tonic** — `Madhur`, next 2026-09-10 |
| has contact name, **no** next event | **0** | 🔴 **none exist — tested synthetically and labelled as such** |

Rendered output confirmed by eye for each: Pizzeria Gusto keeps the event line with a real venue and day
and greets *"Hi there,"*; 3Bros Burgers drops **both** conditional lines with no dangling *"at"*; Tikka
Tonic greets *"Hi Madhur,"* and takes the chaser. The synthetic fourth case greets *"Hi Sam,"* and drops
the event line.

**P4 · 🔴 The leak sweep — 231 prospects × 5 templates = 1155 renders.**

| check | result |
|---|---|
| condition markers (`?cond:`) leaking into output | **0** |
| unsubstituted `{{tokens}}` in output | **0** |
| `[[placeholders]]` reported but missing from the body | **0** |
| empty greetings (`"Hi ,"`) | **0** |
| renders with ≥1 condition **dropped** | **744** |
| renders with all conditions **kept** | **411** |

🔴 *Failure mode the brief named:* *"a conditional line that never fires and one that always fires both
produce a consistent-looking body."* **Ruled out by measuring both halves** — the tier demonstrably fires
411 times and drops 744 times across the corpus. Neither branch is vacuous.

🔴 *And the other one:* *"a substitution that fills nothing looks identical to one that works if every
test row happens to have every field."* Here the corpus is the opposite — 228 of 231 rows are **missing**
the contact name — so the fallback path is the common one, and the 0 empty greetings is a real result
rather than an accident of test selection.

**P5 · WhatsApp gating.** 🧪 30 confirmed rows, **30** offered WhatsApp templates, **0** non-confirmed
rows offered any. Explicit tri-state check: `null` → false, `false` → false, `true` → true. All 231 rows
are offered all 3 email templates. *Failure mode:* a gate keyed on truthiness would pass `false`; it was
tested explicitly even though **no `false` rows exist live**.

**P6 · The footer cannot be edited away.** 0 of 5 rendered bodies contain it; `composeEmail` appends it to
an arbitrary edited body; defined once.

**P7 · Suggestion never auto-selects.** Default `''`; `setTemplateId` is called only in the picker's
`onChange` and the `[p.id]` reset.

**P8 · The 17 / 14 / 3 arithmetic.** `hu_ordering === true` = 17; of those, 3 are `stage = contacted` and
take the chaser; remainder 14 — matching the measured suggestion count exactly.

**P9 · The next-event derivation.** The route's **incremental single-pass** algorithm compared against an
independent **sort-and-take-first** recomputation over all 231 prospects: **0 date disagreements**, and in
**0** cases was the chosen venue not one recorded on that date. Two different algorithms agree on every
row. *Failure mode:* silently returning `lastEventDate` (the furthest event) and calling it "next" — which
would read plausibly and be wrong on every multi-event truck.

**P10 · 🔴 Styling can TAKE EFFECT.** Measured in headless Chrome against the project's own compiled
Tailwind (v4.3.1) with the unlayered block copied verbatim:

| element | class | computed | verdict |
|---|---|---|---|
| the picker `<select>` | `text-sm` (via `fieldCls`) | **16px** | 🔴 **inert, as warned** |
| "Still to fill" `<p>` | `text-[11px]` | 11px | takes effect |
| footer `<p>` | `text-[11px]` | 11px | takes effect |
| Copy button | `text-xs` | 12px | takes effect |
| field label `<span>` | `text-[10px]` | 10px | takes effect |

⚠️ **The one inert class is deliberate, not an oversight.** The picker uses the same `fieldCls` as the
three existing selects (Channel / Direction / Kind), which are inert in exactly the same way — so the new
control renders **identical** to its neighbours. Giving it a class that *did* take effect would have made
it the odd one out.

**P11 · Scope.** Occurrence counts before vs after in `OutreachPanel`: `matchesOutreachFilter` 4/4,
`MediaCell` 4/4, `uploadMedia` 3/3, `deleteMedia` 2/2, `EMPTY_OUTREACH_FILTER` 5/5, `TriStateBox` 4/4,
`ConfirmDeleteDialog` 4/4, `ScheduleEventsPopup` 2/2. The events tab, the schedule popup,
`EventRowCells`, `lib/outreach-filter.ts` and the discovery-events route were **not modified**. No schema
change, no migration, no new route action, no dependency change.

**P12 · Compiler.** `tsc --noEmit` → **exit 0, 0 errors** at every step. No `next build` — your dev server
is live.

---

# 5. WHAT A TEMPLATES TABLE WOULD REQUIRE — REPORTED, NOT BUILT

Not built: no table, no migration, no admin editor.

1. **A table** — `outreach_templates(id, label, channel, subject, body, active, sort_order, updated_at)`
   with RLS on and **no anon policy**: the manual is explicit that outreach data must not sit on a
   publicly-readable table, and template bodies name rates.
2. **A route action to read and write it**, which this task is explicitly forbidden from adding.
3. **A migration path for the placeholder grammar.** The tiers only work because `{{…}}`, `?cond:` and
   `[[…]]` are validated at author time by TypeScript and by the module living in one file. In a table,
   a typo like `{{contact_nam}}` becomes runtime data — so the table needs **validation on write** plus a
   preview, or the first bad row sends a broken email.
4. **A decision on who may edit.** A template body is outbound marketing copy carrying a legal footer; if
   it is editable in the admin UI, the opt-out footer must still be appended by the mechanism and remain
   unreachable from that editor — the same invariant as §3.4, but now defended across a trust boundary.

**Stopping there.**

---

# 6. EVIDENCE CLASS

- ✅ **Executed against live data:** every count in §0 and §3 (231/231, 30, 3, 17/214, 58/173, 55/173);
  the 1155-render leak sweep; the WhatsApp gate over all rows; the next-event cross-algorithm check; the
  `whatsapp_confirmed` ↔ scraped-hint 1:1 correlation.
- ✅ **Executed, compiler-transpiled source:** the renderer proofs — real shipped module via
  `ts.transpileModule`, not a transcription.
- ✅ **Measured in a browser:** P10's font sizes against the project's own compiled Tailwind.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** P1, P2, P7, P11 — the handler call census, the reset contents,
  the writer census, the scope counts.
- 🔴 **Reasoned only, NOT OBSERVED:** that the picker reads well in the modal, that the subject and
  "still to fill" chips are noticed, that the clipboard write succeeds in your browser
  (`navigator.clipboard` requires a secure context). **No admin session is obtainable here — I selected no
  template, copied nothing, sent nothing and logged nothing. I claim no write succeeded.**
- 🔴 **NOT TESTED LIVE:** the combination *has contact name + no upcoming event*, because **0 of 231 rows
  are in that state**. It was tested synthetically and is labelled as such wherever it appears.
