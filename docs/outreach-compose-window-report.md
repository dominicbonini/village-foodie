# The compose window, and the Hatches Up copy correction

---

# 0. 🔴 THE TEMPLATE COPY — WHAT I HAD WRITTEN vs WHAT YOU SUPPLIED

**You were right and I should own this.** Last task I invented the Hatches Up body, labelled it *"a first
draft"* in a comment, and shipped it in the picker where it looked exactly like agreed copy. Two of the
lines you called out — the order-link line and the *"if that is worth ten minutes"* line — were never in
your text; **I wrote them.**

```diff
--- MINE (invented)
+++ YOURS (agreed)
@@ -2 +2 @@
-label: 'Hatches Up — rate comparison',
+label: 'Hatches Up — ordering costs',
@@ -4 +4 @@
-subject: 'Your online ordering rate, {{truck_name}}',
+subject: 'Ordering costs for {{truck_name}}',
@@ -6 +6 @@
-'Hi {{contact_name|there}},',
+'Hi,',
@@ -8,2 +8,2 @@
-'I run Village Foodie, where {{truck_name}} is already listed.',
-"?next_event: I can see you're at {{next_event_venue}} on {{next_event_day}} {{next_event_date}}.",
+"?next_event: I run villagefoodie.co.uk, the food truck directory — your schedule's listed on it, including your {{next_event_day}} pitch at {{next_event_venue}}.",
+"?no_next_event: I run villagefoodie.co.uk, the food truck directory — your schedule's listed on it.",
@@ -11 +11 @@
-"I noticed you take online orders through Hatches Up. They charge [[their current rate]]; I charge [[my rate]], which on your volume would be about [[monthly saving]] a month.",
+"I've also built HatchGrab, an ordering system for trucks. Here's one running live so you can see it: [[link]]",
@@ -13 +13 @@
-'?order_url: Your current ordering page: {{order_url}}',          ← REMOVED (you never had it)
+"I noticed you're on Hatches Up at 4.5% + 20p. HatchGrab is [[your rate]] — on £10k a month through the site, that's about £[[X]] a year difference.",
@@ -15 +15 @@
-'If that is worth ten minutes, I can set it up and you can compare the two side by side before committing to anything.',   ← REMOVED (you never had it)
+"I'm doing a free introductory period while I onboard this season's trucks.",
@@ -17 +17,3 @@
-'Best,',
+'Want me to set yours up with your menu on it so you can have a look?'
+''
+'Dominic',
```

## 0.1 🧪 Verbatim check — not asserted, executed

The rendered body was compared **byte-for-byte** against your supplied text with the tokens substituted
back to their bracket forms: **identical: true**. The subject renders `Ordering costs for Azahar`.

## 0.2 The token mapping, exactly as you specified

| your text | tier | how |
|---|---|---|
| `[Truck Name]` | RESOLVED | `{{truck_name}}` |
| `your [day] pitch at [venue]` | **CONDITIONAL clause** | a `?next_event:` / `?no_next_event:` **line pair** — see §0.3 |
| `[link]` | 🔴 **UNRESOLVED** | `[[link]]` — see §0.4 |
| `[your rate]`, `[X]` | UNRESOLVED | `[[your rate]]`, `[[X]]` (the `£` sits outside: `£[[X]]`) |
| `4.5% + 20p` | **fixed text** | plain characters, derived from nothing |
| `Hi,` | fixed text | literal — **no token**, per your copy |

## 0.3 🔴 What the sentence reads as with no upcoming event

You asked for the clause dropped and the rest of the sentence left intact. The mechanism drops whole
**lines**, and you told me not to change that mechanism — so the paragraph is expressed as **two mutually
exclusive lines**, of which exactly one ever renders. With no event after today it reads, in full:

> I run villagefoodie.co.uk, the food truck directory — your schedule's listed on it.

Grammatical, and nothing dangles. ⚠️ This added one **condition value** (`no_next_event`) to the existing
`conditionMet` switch, exactly as `order_url` and `website` already sit there. **The line-dropping rule
itself is untouched.**

## 0.4 🔴 `[link]` is UNRESOLVED, and why

**There is no live demo ordering URL in this codebase to resolve it from.** Demo trucks are provisioned
per session with a random `demo-` prefixed id/slug (`lib/demo.ts`, `lib/provision-truck.ts`), so no stable
address exists; the only hardcoded URL is the marketing homepage `https://www.hatchgrab.com/`, which is
not *"one running live so you can see it"*. So it renders as a visible `[[link]]` for you to paste a real
one into. 🧪 **It is never filled from the prospect's own `order_url`** — proven by rendering with a
sentinel order URL and asserting it does not appear in the body (`false`).

## 0.5 ⚠️ The greeting consequence, stated rather than decided for you

Your copy opens with a bare `Hi,` and your mapping did not list a greeting token, so it is **literal
text**. That means the Hatches Up template says `Hi,` even on the **3 of 231** rows that do carry a
contact name (Tikka Tonic/`Madhur`, Pizza Mondo/`Jo`, Pimp My Fish/`Tayyur`). If you want those three
personalised, say so and it becomes `Hi{{contact_name_prefixed}},` — one edit. **I have not made that
change**, because your copy is your copy.

## 0.6 🔴 EVERY OTHER TEMPLATE — THE AUDIT YOU ASKED FOR

**You have supplied wording for exactly one template. All four others are entirely mine — every line.**
None of it was agreed. Listed in full so you can see precisely what is there:

**`general_email`** — subject `{{truck_name}} on Village Foodie`
```
Hi{{contact_name_prefixed}},

I run Village Foodie, a site that lists street food traders and where they are trading this week. {{truck_name}} is on there already.
?next_event: Your next listed pitch is {{next_event_venue}} on {{next_event_day}} {{next_event_date}}.

I am adding online ordering for traders who want it — customers order and pay ahead, you get the order on your phone. My rate is [[my rate]], which is [[comparison to their current setup]].

?website: I have linked your site at {{website}} so customers can find you directly.

Worth a quick chat?

Best,
```

**`chaser_email`** — subject `Following up — {{truck_name}}`
```
Hi{{contact_name_prefixed}},

I got in touch a little while ago about online ordering for {{truck_name}} and I do not think I heard back — entirely possible it landed at a busy moment.
?next_event: I see you're at {{next_event_venue}} on {{next_event_day}}, so I imagine this week is full.

If it is not for you, just say so and I will leave it there. If it is, the offer stands at [[my rate]].

Best,
```

**`wa_intro`**
```
Hi{{contact_name_prefixed}} — {{truck_name}}? I run Village Foodie, where you are listed.
?next_event: Saw you're at {{next_event_venue}} on {{next_event_day}}.
I am adding online ordering at [[my rate]]. Worth a look?
```

**`wa_chaser`**
```
Hi{{contact_name_prefixed}}, following up on my note about online ordering for {{truck_name}} — [[my rate]].
Happy to leave it if it is not for you, just let me know.
```

**These four are now marked in the module as NOT SUPPLIED**, with a note that an invented body and an
agreed body render and send identically, so the distinction has to be written down. They were left in
place rather than deleted because you did not ask for that — say the word and they go, or send copy.

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
	docs/outreach-templates-report.md
	docs/truck-name-matching-report.md
	lib/outreach-filter.ts
	lib/outreach-templates.ts
	lib/schedule-match.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

`git add -A` / `git add .` were not run; nothing was staged. Nothing in either prompt arrived garbled, and
no instruction contradicted another.

---

# 2. (4b) THE NEXT-EVENT PREDICATE

## 2.1 What it selected

🔎 `app/api/admin/outreach/route.ts` used **`e.event_date >= todayYMD`** for *both* `futureCount` and
`nextEventDate` — so **today's event counted as "next"**. 🧪 For **Azahar** today (2026-09-09) that is
`foodPark`, exactly the render you saw.

## 2.2 What it selects now — and the predicate that deliberately did NOT change

The two are now separate, because they answer different questions:

| field | predicate | why |
|---|---|---|
| `futureCount` | **`>= today`** — **unchanged** | it is the Schedule cell's `Y (n)` and the number the schedule popup must agree with. Changing it would move counts across the table. |
| `nextEventDate` / `nextEventVenue` | **`> today`** | it feeds a sentence in an email. An event happening as you write reads oddly, and an email composed today and sent tomorrow names an event that has already happened. |

Consumers of `nextEvent*` are only the two `renderTemplate` call sites — 🧪 verified by grep — so nothing
else moves.

## 2.3 🔴 How many rows change

🧪 Re-derived over all 231 prospects (231/231, 902/902 events, header == fetched):

- **21** prospects had a next event dated **today**.
  - **19** now name a **later** event.
  - **2** now **drop the clause**: **Naked Fish** and **Suffolk Spice Fusion**.
- **210** unaffected.
- Rows rendering the event clause at all: **58 → 56**.

**Azahar**: `2026-09-09 foodPark` → **`2026-09-10 Off The Beaten Truck - Northstowe`**.

---

# 3. THE COMPOSE WINDOW

## 3.1 What left the log block

The dropdown, the subject preview, the "still to fill" banner and the footer preview are **gone from the
modal body** — 🧪 verified: `"Still to fill"`, `"Appended automatically"`, `"Copy + footer"` and `"— none —"`
each appear **0** times in `OutreachPanel.tsx` and **1** time in `ComposeWindow.tsx`. What remains in the
log block is a single button, **"Compose from template…"**, which opens a window and **writes nothing**.

## 3.2 The window

Portalled to `<body>` at **`z-[85]`** — clearing the prospect modal (50), toast (60), confirm dialog (70)
and schedule popup (80). Portalling is what stops an ancestor stacking context trapping it, which is the
fault the schedule popup hit when a `sticky z-40` tab bar painted over it. Background scroll is locked,
restoring the previous value rather than resetting it.

Contains: template picker (WhatsApp gating unchanged), **editable subject**, **editable body at
`rows={18}`**, the outstanding-placeholder list, and the fixed footer preview.

**🔴 Escape closes only this window.** The prospect modal listens on `window` in the **bubble** phase; this
listens on the same target with **`{ capture: true }`**, and the capture phase at window runs before any
bubble-phase listener there regardless of registration order — so this handler sees Escape first and calls
`stopPropagation()`, ending the event before the modal's handler is reached. Registration order is not
relied on.

**What closes the window:** the Close button, Escape, or a backdrop click. 🔴 **Copying does not close it.
Logging does not close it.** Both can be done in either order, repeatedly. After a successful log the
button reads **"Logged ✓"** and is disabled — editing the subject or body clears that, because changed
text is a different message. Without it, a second press would silently write a second contact row.

## 3.3 The footer stays out of reach

`composeEmail(body)` appends `OPT_OUT_FOOTER` at compose time; the textarea never contains it. It is shown
read-only beneath the body. Email only.

---

# 4. 🔴 PROOFS — AND WHAT EACH FAILURE WOULD LOOK LIKE

**P1 · The verbatim copy check.** Rendered body, tokens restored to bracket form, compared against your
supplied text: **identical: true**. Sentinel `order_url` does **not** appear in the body.
*Failure mode:* a paraphrase that reads fine and is not your text — which is exactly what happened last
task and was only caught because you read it.

**P2 · 🔴 THE EDITED BODY IS WHAT REACHES THE LOG.** The brief names this: *"a compose window that logs the
template's original render instead of my edits looks identical in the UI until you compare the stored
text."* So the stored text was compared. The **real `logContact` source** was extracted and executed with
a stubbed `fetch`, capturing the actual JSON payload after an edit that filled `[[your rate]]` and
rewrote a sentence:

| assertion | result |
|---|---|
| payload `url` / `action` / `direction` | `/api/admin/outreach` / `log_contact` / `outbound` |
| contains my edit `1.5% + 10p` | **true** |
| contains my rewritten sentence | **true** |
| still contains original `[[your rate]]` | **false** ✅ |
| still contains the original sentence | **false** ✅ |
| `stored === composeEmail(edited)` | **true** ✅ |
| `stored === composeEmail(original render)` | **false** ✅ |
| includes the opt-out footer | **true** |

The two candidate texts differ by **25 characters** — logging the wrong one would be invisible on screen.
Structurally: `doLog` sends `fullText = composeEmail(body)` where `body` is the textarea's state, and
**`renderTemplate` appears nowhere in `doLog`**; the parent passes `message: editedBody` straight through.

**P3 · 🔴 The next-event change selects, and does not merely stop selecting.** The brief names this too:
*"a change that selects nothing and one that selects correctly both produce a body without the line on
rows that have no future event."* So **named rows that DO have an event after today** were rendered:

- **Azahar** → *"…including your Thursday pitch at Off The Beaten Truck - Northstowe."* — names the later
  event: **true**; mentions today's date: **false**.
- **Between Buns** → *"…including your Thursday pitch at 11 Kneesworth St."* — same result.

And the two rows that now legitimately drop the clause are **named** (Naked Fish, Suffolk Spice Fusion)
with their full rendered sentence shown. Corpus: **58 → 56** rows render the clause; **21** changed.

**P4 · 🔴 Styling can TAKE EFFECT — and one thing I got wrong, caught by measuring.** Measured in headless
Chrome against the project's own compiled Tailwind (4.3.1) with the unlayered block copied verbatim:

| element | class | computed | verdict |
|---|---|---|---|
| compose body | `text-sm` + `rows={18}` + `leading-relaxed` | 16px, line-height 26px, **height 482px** | `text-sm` **inert** as warned; **`rows` works** — 18 × 26 + 14 = **482**, matching exactly |
| subject input **(first attempt)** | `text-sm`, **no `type`** | **14px** | 🔴 **wrong — see below** |
| subject input **(fixed)** | `text-sm` + `type="text"` | **16px** | consistent |
| picker select | `text-sm` | 16px | inert, matching the other selects |
| log button | `text-sm` | 14px | takes effect (a `<button>` is not in the rule) |

🔴 **The defect I introduced and then measured out:** the unlayered rule selects `input[type="text"]` — an
**attribute selector**, which does **not** match an input that omits the attribute. My subject box had no
`type`, so it rendered at **14px** while every other field in the app renders at 16px, and it would have
**zoomed on focus on iOS** — the very thing that rule exists to prevent. Adding `type="text"` fixed both.
*This is why the check is "measure it", not "write the class".*

**P5 · Nothing writes before the log control.** `doLog` is the only path to `onLog`; the picker's
`applyTemplate`, the subject and body `onChange` handlers and `doCopy` call no writer. The
"Compose from template…" button only calls `setComposeOpen(true)`.

**P6 · Scope.** Occurrence counts before vs after in `OutreachPanel`: `matchesOutreachFilter` 4/4,
`MediaCell` 4/4, `uploadMedia` 3/3, `deleteMedia` 2/2, `EMPTY_OUTREACH_FILTER` 5/5, `TriStateBox` 4/4,
`ConfirmDeleteDialog` 4/4, `ScheduleEventsPopup` 2/2. The events tab, schedule popup, `EventRowCells` and
`lib/outreach-filter.ts` were not modified. No schema change, no migration, no new route action, no
dependency change. Files touched: `lib/outreach-templates.ts`, `app/api/admin/outreach/route.ts`,
`components/admin/OutreachPanel.tsx`, and the new `components/admin/ComposeWindow.tsx`.

**P7 · Compiler.** `tsc --noEmit` → **exit 0, 0 errors** at every step. No `next build` — your dev server
is live.

---

# 5. REPORT ONLY — MOVING TEMPLATES INTO A DATABASE TABLE

Not built: no table, no migration, no editor.

**Schema.** `outreach_templates(id uuid pk, slug text unique, label text, channel text check (channel in
('email','whatsapp')), subject text null, body text not null, active bool default true, sort_order int,
created_at, updated_at)`. **RLS on, no anon policy** — the manual is explicit that outreach data must not
sit on a publicly-readable table, and these bodies name rates. `slug` matters because `suggestTemplateId`
returns an identifier; a uuid that changes on re-seed would break the suggestion.

**Route actions.** Three on the existing admin route: `list_templates` (or fold into the outreach `GET`),
`upsert_template`, `archive_template`. 🔴 **Deleting should be an `active` flag, not a `DELETE`** — a
logged contact's stored body is a snapshot, but you will want to know which template produced it, and a
hard delete makes past logs unattributable.

**Editing UI.** A tab or a panel with a list, a subject field, a large body textarea (the same `rows`
sizing lesson from P4), and — the part that matters — **a live preview against a real prospect**, because
the placeholder grammar is the failure surface.

**🔴 Would the substitution mechanism have to change? No — but its guarantees would.** Today `{{…}}`,
`?cond:` and `[[…]]` are validated by the module living in one file under TypeScript; a typo like
`{{contact_nam}}` is caught when I render it. In a table those become **runtime data typed by hand**, so
the mechanism would need:
1. **Validation on write** — reject unknown `{{tokens}}` and unknown `?conditions:` at save time, listing
   the valid ones. Without this the first typo renders `[[contact_nam]]` into a real email.
2. **A preview before activating** — render against a row with an event and a row without, since the
   conditional pair is the part most easily got wrong.
3. **A decision on the `?next_event:` / `?no_next_event:` pairing** — it is currently a convention held by
   whoever writes the template. In a table it should be checked: a template with one and not the other is
   almost always a mistake.
4. 🔴 **The opt-out footer must stay in code.** If the body is editable data, the footer must remain
   appended by the mechanism and unreachable from the editor — the same invariant as today, but now
   defended across a trust boundary rather than by the file being source.

**Stopping there.**

---

# 6. EVIDENCE CLASS

- ✅ **Executed against live data:** the 21 / 19 / 2 impact split, the 58 → 56 clause counts, the named
  rows (Azahar, Between Buns, Naked Fish, Suffolk Spice Fusion), the 3-of-231 contact-name figure — all
  count-asserted (231/231 prospects, 231/231 trucks, 902/902 events).
- ✅ **Executed, compiler-transpiled source:** the verbatim copy check and P2's payload capture — the real
  `renderTemplate`/`composeEmail` module via `ts.transpileModule`, and the real `logContact` extracted
  from the component with a stubbed `fetch`. Not transcriptions.
- ✅ **Measured in a browser:** P4's font sizes and the 482px body height.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** the `doLog` call census, the picker-removal counts, the scope
  counts, the `nextEvent*` consumer grep.
- 🔴 **Reasoned only, NOT OBSERVED:** that the window looks right at 482px on your screen, that Escape and
  the backdrop behave as intended in the browser, that `navigator.clipboard` succeeds in your context.
  **No admin session is obtainable here — I opened nothing, copied nothing, sent nothing and logged
  nothing. I claim no write succeeded.**
- ⚠️ **Not verified and stated as such:** that the four unsupplied templates say anything you would want
  to send. They are mine, they are marked as such, and they are awaiting your copy.
