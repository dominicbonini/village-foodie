# One editable pane, and predictable field-vs-edit precedence

---

# 0. 🔴 WHERE THE BRIEF AND THE CODE DISAGREE

## 0.1 There is no templates tab, so its preview cannot be protected

The constraints say *"do not touch … the templates tab's own preview — that one renders a template being
WRITTEN against a chosen prospect and stays."* 🧪 **No such tab exists in this tree:**

- `ADMIN_TABS` has **six** entries — `trucks`, `features`, `domains`, `outreach`, `events`,
  `screenshots`. None is templates.
- `components/admin/` holds eight files; there is no templates panel.
- **0 references** to `outreach_templates` anywhere in `app/`, `lib/`, `components/`, `supabase/`.
- `lib/outreach-templates.ts` is still the pure data module (**0 imports**, a literal array).

I satisfied the constraint by not creating one. Flagging it because the instruction implies it is already
built and it is not — if you were expecting to see one, it was never merged.

## 0.2 Nothing needed cancelling — the preview was never scheduled for deletion

*"CANCEL ANY INSTRUCTION TO DELETE THE COMPOSE WINDOW'S PREVIEW."* **No such instruction exists in this
series.** I added that pane in the send-fields task and it was present when this task began — confirmed
by the before-scan in §3. So there was nothing to cancel.

⚠️ **What this task does do is remove that pane** — because item (1) asks for the two panes collapsed into
one. Your sentence *"I need one pane, not neither"* is exactly what shipped: **the surviving pane is the
rendered, editable one.** Saying so explicitly because "cancel the deletion" and "collapse into one" pull
in opposite directions if read literally, and I resolved them the way the body of the brief specifies.

## 0.3 No other task is mid-change

`tsc --noEmit` on the tree as found: **exit 0, 0 errors**. No partial templates-table work, no dangling
imports.

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

`git add -A` / `git add .` were not run; nothing was staged. **This task changed exactly one file:**
`components/admin/ComposeWindow.tsx`. 🧪 `lib/outreach-templates.ts` is byte-identical
(sha256 `90f3944a12db3905…`, unchanged from the end of the previous task) — no template copy, no
substitution mechanism, no conditional behaviour, no WhatsApp gating, no footer logic touched.

---

# 2. WHAT WAS BUILT

## 2.1 (1) One pane, rendered, editable

The read-only preview is gone. **The single body pane now holds the rendered message** — resolved tokens
substituted, filled placeholders applied — and you type directly into it. Its label now reads
*"Message — exactly what will be sent (the footer is added below)"* rather than "Body".

🔴 **Unfilled placeholders still render as `[[link]]`** in that pane — visible, unambiguous, greppable,
and typeable-over. They are never rendered as blanks. The "Still to fill" banner stays.

## 2.2 🔴 (2) The precedence rule, stated plainly

There is one flag, `edited`, set only by a keystroke in the subject or the message.

| situation | what happens to the message pane |
|---|---|
| **You have not typed in it yet** (`edited = false`) | Filling, changing or **clearing** a field re-substitutes immediately. The pane is the template render with the current field values applied. |
| **You have typed in it** (`edited = true`) | **The fields stop rewriting it entirely.** Your text is never touched — not by a field, not by clearing one. They still count toward "Still to fill", because that reads the live message. |
| **You press Rebuild from template** | A warning appears first. Confirming **discards your edits** and rebuilds from the template using the current field values; `edited` returns to false and the fields drive the pane again. |
| **You change template** | Everything resets: new render, fields cleared, `edited` false. |

**Making the state visible — the proposal, not a silent guess.** While `edited` is true, a notice sits
directly under the message: *"You have edited this message. The fields above no longer change it — your
text wins,"* with a **Rebuild from template** button. Pressing it does **not** act; it swaps the notice for
*"This will discard your edits…"* with **Keep my edits** and **Discard and rebuild**. The fields card also
gains a one-line reminder pointing at the notice. **Nothing is ever discarded without that second press.**

## 2.3 (3) The fields are the primary input now

Previously a slate-50 card with `text-slate-500` micro-labels — which is why they read as disabled. Now:
a **white card with a shadow and an orange left rule**, a `Fill in before sending` heading with an
`n of m done` counter that turns **emerald at zero outstanding**, real `text-slate-800` semibold labels,
and every **unfilled** input carrying a **2px amber border, an amber tint and a `NEEDED` chip**. Filled
inputs go neutral. 🧪 The input is also physically larger — **42.8px** tall against the old 40px, measured.

## 2.4 (4) The footer indication stayed

🔴 The removed pane was **not** the only place the footer appeared. The dedicated line
*"APPENDED AUTOMATICALLY — If you would rather not hear from me again…"* is still rendered in full, below
the message, from the same `OPT_OUT_FOOTER` constant. **Nothing was added or removed for item (4);** it
was already independent, and it still shows the complete text rather than a summary.

---

# 3. 🔴 ELEMENT ORDER, BEFORE AND AFTER — JSX COMMENTS STRIPPED FIRST

Extracted from source with `{/* … */}` and `//` comments removed **before** scanning, using markers that
exist in **both** versions.

| # | BEFORE | AFTER |
|---|---|---|
| 1 | template picker | template picker |
| 2 | placeholder fields | placeholder fields |
| 3 | subject input | subject input |
| 4 | body textarea | body textarea |
| 5 | still-to-fill banner | still-to-fill banner |
| 6 | **preview pane** | **edited notice** |
| 7 | footer indication | footer indication |
| 8 | warning strip | warning strip |
| 9 | Copy button | Copy button |
| 10 | Email button | Email button |
| 11 | Log button | Log button |

**The only change is slot 6: the read-only preview is replaced by the precedence notice.** Everything
else holds position.

## 3.1 ⚠️ THE LANDMARK SCAN WAS WRONG THREE TIMES BEFORE IT WAS RIGHT

The brief warns that a landmark scan matching text inside a comment has already produced a false order
report twice in this series. It nearly did so again, three ways, and each was caught before being
reported as fact:

1. **`>Email<` matched nothing** — the button's text sits on its own line, so the marker could never match.
   Fixed by keying on the handler name `onClick={doSend}` instead of rendered text.
2. **"edited notice" matched the fields card**, because I had used the phrase *"no longer change"* in both
   places. It reported the notice at slot 2, before the subject. Fixed with the unique string
   `Rebuild from template`.
3. **"placeholder fields" reported absent from the BEFORE file**, because I had changed the card's heading
   from `Fill in (` to `Fill in before sending` — so the new marker could not match the old file. Fixed
   with `setFills(f =>`, a marker present in both versions.

**Rendered text is a bad landmark; handler and setter names are stable ones.** The table above is the
output after all three corrections.

---

# 4. 🔴 PROOFS — THE PRECEDENCE TESTED IN BOTH DIRECTIONS

The brief is explicit: *"a body that never re-substitutes and one that re-substitutes correctly look
identical once every field is filled — test filling a field BEFORE editing and AFTER editing, and show the
body text in both."* Both were run against `applyFills` extracted from the component **after compiling it
with the repository's own TypeScript**, and the effect's governing rule was asserted present verbatim in
the source before simulating it.

**A · Filling a field BEFORE editing — the field must drive the pane.**

```
start      : … HatchGrab is [[your rate]] — on £10k a month …
after fill : … HatchGrab is 1.5% + 10p — on £10k a month …
```
substituted: **true** · `[[your rate]]` gone: **true**

**B · Editing, then filling another field — my text must win.**

```
[[link]] line: I've also built HatchGrab … so you can see it: [[link]]
```
After typing `https://hatchgrab.com/demo` into the `[[link]]` field:

| assertion | result |
|---|---|
| message byte-identical to before the fill | **true** |
| my hand edit still present | **true** |
| `[[link]]` still shown unfilled | **true** |
| the typed value did **not** appear | **true** |

*Failure mode this rules out:* a pane that silently absorbs a field value over your edits — invisible
until you reread the email you already sent.

**C · The way back.** Rebuild discards the edit (**true**), applies **both** field values —
`[[link]]` filled **true**, `[[your rate]]` still filled **true** — and leaves `[[X]]` visible (**true**).

**D · The fields must not vanish when filled.** Field boxes are derived from the **source** render and
still list all three (`link`, `your rate`, `X`) after filling; "Still to fill" is derived from the **live
message** and shrank to `["X"]`. *Failure mode:* deriving both from the same text makes a field disappear
the moment you fill it, so a typo becomes uncorrectable.

**E · 🔴 Styling, both directions, measured** in headless Chrome against the project's own compiled
Tailwind with the unlayered block copied verbatim:

| element | class | computed | note |
|---|---|---|---|
| placeholder field **as shipped** (`type="text"`) | `text-sm` | **16px**, h 42.8 | `text-sm` inert — matches every other field; iOS-zoom protected |
| the same input **without `type`** | `text-sm` | **14px** | escapes the attribute selector — the bug caught earlier in this series |
| message textarea | `rows={18}` | 16px, **482px** | sized by `rows`, unaffected by the rule |
| field label | `text-[12px]` | 12px | takes effect |
| `NEEDED` chip | `text-[10px]` | 10px | takes effect |
| edited notice | `text-[12px]` | 12px | takes effect |
| Rebuild button | `text-xs` | 12px | takes effect |

🧪 Both real `<input>` sites in the file carry `type="text"` (lines 322 and 352) — the higher raw count of
that string is comment text, checked rather than assumed.

**F · The stacking fix is untouched.** `ComposeWindow` still carries `style={{ zIndex: 85 }}` as an
**inline style** (line 252) and `ScheduleEventsPopup` still carries `style={{ zIndex: 80 }}` (line 170).
Neither reverted to a class. This matters for the third inertness lesson: an arbitrary Tailwind value used
by one file may have **no generated rule at all**, which is what put this window behind the modal.

**G · Compiler.** `tsc --noEmit` → **exit 0, 0 errors** at every step.

---

# 5. REPORT ONLY — REMEMBERED DEFAULTS FOR PLACEHOLDERS

Not built. 🧪 **17 prospects carry `hu_ordering = true`**, and `[[link]]` and `[[your rate]]` are the same
for every one of them, so this is now a workflow requirement rather than a convenience.

## 5.1 Where the values would live

| option | fits | cost | verdict |
|---|---|---|---|
| **`localStorage`, keyed by placeholder name** | one browser, one device | none — no schema, no route, no migration | the only option available under this task's constraints, and the right shape for a **draft**: silently lost on a cleared profile, and invisible to anything server-side |
| **A settings row** (`outreach_settings`, one row, a `jsonb` map) | every device | a table, a migration, read/write actions | the right home for a value that must survive a laptop change |
| **Per template, beside the copy** | every device, and correctly scoped | the templates table, plus per-placeholder columns | 🔴 **the one to prefer** — `[[your rate]]` legitimately differs between an introductory-offer template and a standard one, and a single global default cannot express that. **Wait for the templates table rather than building this twice.** |

## 5.2 How a default and a per-truck override interact

The field already holds a per-truck value; a default only changes what it *starts* as. The clean model is
three states, not two:

1. **empty** — no default set, nothing typed. Banner counts it. Today's behaviour.
2. **defaulted** — pre-filled from the stored default, *not yet confirmed for this truck*. It must look
   different from a typed value — a "from default" marker on the field — so you can see at a glance which
   figures you chose for this truck and which were inherited.
3. **overridden** — you typed over it. Per-truck, never written back to the default unless you explicitly
   say "save as default".

🔴 **The override must never write back silently.** Changing the rate for one awkward truck should not
change the rate quoted to the next sixteen.

## 5.3 🔴 The stale-value risk — and why it is worse than an empty field

An out-of-date default is **more dangerous than no default at all**, and the mechanism is precisely that
every safeguard already built goes quiet:

- The field is **filled**, so the amber `NEEDED` chip does not show.
- `[[your rate]]` is **absent from the message**, so the "Still to fill" banner reads zero.
- The pre-send and pre-log confirmations both fire only on outstanding placeholders, so **neither
  appears**.
- The message reads as a correctly completed email, and the wrong price goes out looking deliberate — then
  gets **logged**, so the contact history records a rate that was never intended.

An empty field is loud: everything above shouts. A stale one is silent. Three mitigations worth having
whichever store is chosen:

1. **Show provenance on the field** — "from default, set 12 Aug" — so an inherited figure never looks like
   a typed one.
2. **Expire them.** A default older than some age reverts to *suggested*, requiring one confirming click
   before it counts as filled.
3. **Never default a per-prospect placeholder.** `[[X]]` — the annual saving — is derived from *their*
   volume and must not carry between trucks. That argues for **per-placeholder opt-in** rather than
   remembering everything, and for `[[X]]` being explicitly excluded.

**Stopping there.**

---

# 6. EVIDENCE CLASS

- ✅ **Executed, against compiled source:** proofs A–D — `applyFills` and the token scans extracted from
  `ComposeWindow.tsx` after compiling it with the repo's TypeScript, with the effect's rule asserted
  present verbatim in the source before it was simulated. The message text is shown before and after in
  both directions.
- ✅ **Measured in a browser:** proof E, against the project's own compiled Tailwind including the
  unlayered `!important` block.
- ✅ **Executed against live data:** the 17 `hu_ordering = true` figure; the Azahar render used throughout.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** the before/after element order (after three marker
  corrections); the `<input type>` audit; the inline-`zIndex` check; the one-file scope and the
  byte-identical templates module.
- 🔴 **Reasoned only, NOT OBSERVED:** that the fields now read as active on your screen, that the notice is
  noticed at the moment it matters, that the single pane is easier to work in. **No admin session is
  obtainable here — I typed into no field, edited no message, sent nothing and logged nothing.** The
  precedence rule is proven as a state machine, not as a thing I watched happen.
- ⚠️ **One caveat on proof B.** It exercises the rule the effect implements, with the effect's condition
  asserted present in the source — it does not run React's scheduler. If a future edit changed the
  effect's dependency array rather than its body, this proof would not catch it; the dependency list is
  therefore commented in place explaining why `subject`/`body` are deliberately absent from it.

---

# 7. 🔴 MID-TURN REQUEST — STOPPED, NOT GUESSED

A further instruction arrived while this task was finishing:

> *each template stores DEFAULT VALUES for its placeholders, editable on this page. The compose window
> pre-fills its placeholder fields from these defaults and I can override per truck without changing the
> stored default. A stale default is worse than an empty field … Show on this page when each default was
> last changed, and show in the compose window that a value came from a default rather than being typed.*

**Nothing was built for it.** The brief instructs: *"if any instruction contradicts another, STOP and ask
rather than choosing."* This one contradicts two constraints in the same brief, and the resolutions differ
materially, so choosing silently would be the wrong call.

## 7.1 The two collisions

1. **"editable on this page" names a page that does not exist.** §0.1: there is no templates tab —
   `ADMIN_TABS` has six entries and none is templates, and `lib/outreach-templates.ts` is a **code
   module**, not data. Its values are edited by changing source, so there is no page on which a default
   could be typed. Either "this page" means the **compose window** (buildable now), or it means a
   **templates admin page that has to be built first** (a much larger task).

2. **"each template stores default values" versus "No schema change, no migration, no route change."**
   Durable, cross-device storage keyed to a template needs a table and a route. Without those the only
   available store is **`localStorage`** — which is per-browser and per-device, invisible server-side, and
   silently lost when site data is cleared. That is a real difference in what "stored" means, and it is
   your call, not mine.

## 7.2 What I did NOT do, deliberately

I did not quietly implement the `localStorage` version and describe it as "stored defaults". §5.3 of this
report is the reason: a default that looks authoritative but is actually a per-browser draft is the same
class of trap as a stale rate — it reads as more dependable than it is.

## 7.3 The parts that are ready either way

The two safety requirements in the message are independent of where the values live, and both are already
specified in §5.2 and §5.3 of this report: the **three-state model** (empty / defaulted / overridden, with
overrides never writing back), the **"from default, set <date>" provenance marker** on the field, and the
**exclusion of per-prospect placeholders** such as `[[X]]` from ever being defaulted. Whichever store is
chosen, those carry over unchanged.

## 7.4 ✅ RESOLVED — your answer, recorded

Asked rather than chosen, and you answered:

| question | your answer |
|---|---|
| Where the stored values live | **Wait for the templates table** |
| What "this page" means | **A new templates admin page** |

**So nothing is built for placeholder defaults in this task, and that is now a decision rather than an
omission.** The order of work is:

1. **The templates table** — `outreach_templates`, plus the route actions to read and write it. Requires
   the schema change and migration this brief forbids, so it is its own task.
2. **The templates admin page** — the tab that does not yet exist (§0.1), where a template's copy and its
   **per-placeholder defaults** are edited together, each showing **when it was last changed**.
3. **The compose window's side** — pre-fill from those defaults, mark a value as *"from default, set
   &lt;date&gt;"* rather than typed, and let a per-truck override never write back to the stored default.

🔴 **The three-state model and the stale-default protections in §5.2 and §5.3 are the specification for
step 3** and carry over unchanged: empty / defaulted / overridden; provenance shown on the field;
overrides never written back silently; expiry reverting an old default to *suggested*; and `[[X]]` — the
per-prospect saving figure — never defaulted at all.

⚠️ **Until step 1 lands, the compose window's fields start empty every time.** That is the loud failure
mode described in §5.3, and it is the safe one: every guard — the amber `NEEDED` chip, the "Still to fill"
banner, and both the pre-send and pre-log confirmations — fires on an empty field and stays silent on a
stale one.

