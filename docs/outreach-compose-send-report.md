# Placeholder fields, and an Email button for the compose window

---

# 0. STATE OF THE TREE, AND ONE CORRECTION

## 0.1 No templates-table work is in flight — checked before editing

You warned a templates-table task might be mid-change on the same files. **It is not, and nothing was
found incomplete.** Verified before any edit:

| check | result |
|---|---|
| `docs/outreach-templates-table-report.md` | does not exist |
| `lib/outreach-templates.ts` | still the pure data module — **0 imports**, `TEMPLATES` is a literal array |
| any `outreach_templates` table/route/migration | **0 references** anywhere in `app/`, `lib/`, `components/`, `supabase/` |
| latest migrations | `20260909_discovery_exclusion_terms.sql` — nothing template-related |
| `tsc --noEmit` on the tree as found | **exit 0, 0 errors** |

So the tree was coherent and I proceeded.

## 0.2 🔴 A correction to my own previous report

`docs/outreach-compose-window-report.md` §3.4 says a `mailto` *"is truncated by real clients well below a
full template, which would send a half email silently"*, and I used that to justify shipping only a copy
button. **Measured, that was wrong for this template.** A real rendered example encodes to **1163
characters** against a practical ceiling of ~2048 — it fits with **885 characters of headroom**. The
concern was real in kind but wrong in degree, and it was asserted rather than measured. Numbers in §2.

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

`git add -A` / `git add .` were not run; nothing was staged. Nothing in the prompt arrived garbled and no
instruction contradicted another.

⚠️ **Mid-task instruction, applied:** *"just change the Send in Outlook button to Email."* Done — the
button reads **Email**. Its behaviour, tooltip and guard are unchanged.

---

# 2. 🔴 DIAGNOSIS FIRST — `mailto:` LENGTH AND ENCODING

Measured on a **real prospect** (Azahar, `info@azaharartisanspanishfood.com`, next event 2026-09-10 at
`Off The Beaten Truck - Northstowe`), rendering the real Hatches Up template through the real module
compiled with the repository's own TypeScript compiler. Live data count-asserted: 231/231 prospects,
231/231 trucks, 902/902 events.

| | raw chars | encoded URL |
|---|---|---|
| body only (no footer) | 571 | — |
| opt-out footer | 94 | — |
| **body + footer** | **667** | 1125 (CRLF) |
| **+ placeholders filled** (realistic) | **723** | **1163** |
| + 300 chars of hand editing | 1011 | 1475 |
| + 900 chars of hand editing | 1611 | **2075 — over the ceiling** |

- **Encode inflation: ×1.487**, measured on this text (spaces → `%20`, newlines → `%0D%0A`).
- **Fixed overhead** (`mailto:` + encoded address + subject, empty body): **88 chars**.
- **Budget**: at a 2048-char URL limit that leaves room for **~1318 raw body characters**. This email uses
  **723**, so there are **885 characters of headroom**.

**What limit applies.** Browsers do not cap `mailto:` themselves; the constraint is what the OS hands the
registered protocol handler. On Windows that is the ~2083-character URL limit inherited from IE, which
Outlook sits behind; **2048 is the conventional safe ceiling**. There is no error when it is exceeded —
the handler simply opens with the tail of the body missing.

**Do newlines survive as paragraph breaks?** Yes — **if encoded as `%0D%0A`**. RFC 6068 defines the
`mailto` body as `text/plain` with **CRLF** line breaks. `%0A` alone is honoured by some clients and
dropped by others, which is exactly how a mailto arrives as one run-on paragraph. 🧪 The shipped builder
emits `%0D%0A` — verified: `buildMailto("a@b.com","S","one\nthen") → body=one%0D%0Athen`. It costs 6
encoded characters per newline instead of 3 (**+42 characters** for this email's 14 newlines), and that is
affordable within the headroom above.

## 🔴 Verdict: mailto is viable here — but it is guarded, not trusted

It fits today with wide margin, so **Email ships**. But *"it opened"* is not evidence the body arrived,
so the length is checked **before** opening: if the built URL exceeds **2000 characters** the window
**refuses to open Outlook** and says so, naming the actual length and pointing at Copy. 🧪 Proven to fire:
a body 900 characters longer produces a 2075-character URL and is refused. **Copy + footer remains the
lossless path and is unchanged.**

---

# 3. WHAT WAS BUILT

Two files touched: `components/admin/ComposeWindow.tsx`, and **one line** in
`components/admin/OutreachPanel.tsx` (passing `toEmail={p.contact_email}`).

## 3.1 (1) Fields for the unresolved placeholders — derived, never hardcoded

At the top of the window, under the picker: one labelled input per placeholder found in the **current
subject + body**, using `unresolvedIn` — **the module's own scanner**, the same one `renderTemplate`
reports with, so the fields and the "Still to fill" list cannot disagree.

🔴 **Nothing in the component names `link`, `your rate` or `X`.** 🧪 Proven with a synthetic template
containing `[[discount code]]`, `[[deadline]]`, `[[named person]]`: the fields derive correctly and none
of today's three appear. That matters because templates are about to become editable data.

The header reads `Fill in (n of m done)`; the amber banner counts `outstanding` = tokens minus those with
a value, so it **shrinks as fields are filled and disappears at zero**.

## 3.2 🔴 How hand edits and field values BOTH survive

**The `[[token]]` markers stay in the editable body. Filling a field never rewrites the textarea.** Values
are held separately in a `fills` map and applied on the way **out** — to the preview, the clipboard, the
mailto and the log.

**Why, given the ask was "substitutes into the body live":** substituting *into* the textarea consumes the
marker, so a later correction to that field would have nothing left to replace, and every keystroke in a
field would be rewriting text you may have hand-edited in between. Keeping the marker means **neither can
destroy the other** — edits are never overwritten, and a value can be changed or cleared at any time.

**Nothing is lost, so this is not a "which wins" trade.** The live substitution *is* shown, in a read-only
**Preview** pane directly under the body labelled *"exactly what will be copied, sent and logged"* — and
it is literally the same string those three actions use, so there is no third version of the text.

🧪 Proven: with a hand-edited sentence in the body, filling `[[your rate]]` leaves the stored body
**byte-identical**, the hand edit survives into the output, the field value appears, `[[link]]` remains
visibly unfilled, and clearing the field restores `[[your rate]]`.

## 3.3 (2) The **Email** button

Builds `mailto:<address>?subject=<subject>&body=<body>` with the field values applied, CRLF newlines, and
**the opt-out footer appended by `composeEmail`** — the footer is still never in the editable body. 🧪
Verified: the rendered body does **not** contain the footer; the mailto URL **does**.

Disabled when the row has no address, with the reason in the tooltip.

## 3.4 (3) Warn on unfilled placeholders, then allow

Pressing **Email** or **Log as outbound contact** with anything outstanding shows an inline amber strip
that **names exactly which placeholders remain**, with **Go back** and **Send anyway** / **Log anyway**.
Proceeding is allowed — it may be deliberate.

⚠️ It is rendered **inline in the window's footer, not as a nested dialog**, deliberately: a second
portalled overlay above this one would need its own Escape handling and its own place in a z-order that
this window already tops at 85. An inline strip has neither problem. This also leaves the
compose window's Escape behaviour, and the whole stacking arrangement fixed in the previous task,
completely untouched.

## 3.5 🔴 (4) Send does not log

Two separate handlers, and the separation is **structural, not a promise**. 🧪 Call census inside the
shipped functions:

```
sendNow : [ if, setPending, setSendError ]   onLog: false   logNow: false
doSend  : [ body.trim, if, sendNow, setPending ]   onLog: false   logNow: false
```

Neither send function references `onLog` or `logNow`. Handing a `mailto:` to the OS tells us one thing: a
compose window was *requested*. It cannot tell us the message was sent, edited or abandoned — and the
contact log is what stops a fourth email, so a row written for an email that never left would destroy
exactly the property the log exists for. The window says so on screen too: *"Send opens Outlook; it does
not log. Logging stays a separate press."*

---

# 4. 🔴 PROOFS — AND THE FAILURE MODE EACH RULES OUT

Logic was extracted from **the component compiled by the repository's own TypeScript compiler**, so what
ran is the shipped code, not a transcription.

**P1 · Detection fires on an unfilled template — the named case.** Row **Azahar**, template
`hu_rate_email`, nothing filled: tokens `["link","your rate","X"]`, outstanding **3**.
*Failure mode:* a detector that finds nothing looks identical to a working one once everything is filled.
*Ruled out by* testing the unfilled state and showing a non-zero list, not the empty one.

**P2 · The banner shrinks and disappears.** 0 filled → 3 outstanding; 1 → 2; 2 → 1; 3 → **0**.

**P3 · The fields are derived, not hardcoded.** A synthetic template with `[[discount code]]`,
`[[deadline]]`, `[[named person]]` yields exactly those three, and none of today's.

**P4 · Filling a field does not discard hand edits.** Stored body unchanged in length and content; the
hand edit survives into the output; the field value appears; an unfilled marker stays visible; clearing
restores the marker.

**P5 · The mailto guard — measured, not observed.** 1125 / 1163 / 1475 / **2075 (refused)**.
*Failure mode:* a truncating mailto still opens Outlook, so a click proves nothing. *Ruled out by*
measuring the encoded URL and refusing above the ceiling instead of opening it.

**P6 · CRLF.** The body parameter uses `%0D%0A`, per RFC 6068.

**P7 · The footer is appended by the mechanism, not editable.** Absent from the rendered body, present in
the mailto.

**P8 · 🔴 Input styling, both directions, measured** in headless Chrome against the project's own compiled
Tailwind with the unlayered block copied verbatim:

| element | class | computed | note |
|---|---|---|---|
| placeholder field **as shipped** (`type="text"`) | `text-sm` | **16px** | matches every other field; iOS-zoom protected |
| the same input **without `type`** | `text-sm` | **14px** | 🔴 escapes the rule — the bug introduced and caught on the subject field earlier this session |
| Preview `<pre>` | `text-[12px]` | 12px | takes effect |
| field label `<span>` | `text-[11px]` | 11px | takes effect |
| Email button | `text-sm` | 14px | takes effect (a `<button>` is not in the rule) |
| warning `<p>` | `text-[12px]` | 12px | takes effect |

🧪 Every `<input>` in the file carries a `type` — the subject field and the new placeholder fields both.

**P9 · Scope.** Unchanged this task: `lib/outreach-templates.ts` (**byte-identical**, no template copy, no
substitution mechanism, no conditional behaviour, no WhatsApp gating touched), `lib/outreach-filter.ts`,
`ScheduleEventsPopup.tsx`, `DiscoveryEventsPanel.tsx`, `ConfirmDeleteDialog.tsx`. The only
`OutreachPanel.tsx` change is the single added line `toEmail={p.contact_email}`. No schema change, no
migration, no new route action, no dependency change. (`app/api/admin/outreach/route.ts` shows as modified
in `git status` from an **earlier** task — the next-event predicate — not from this one.)

**P10 · Compiler.** `tsc --noEmit` → **exit 0, 0 errors** at every step.

---

# 5. REPORT ONLY — REMEMBERING PLACEHOLDER VALUES BETWEEN PROSPECTS

Not built. `[[link]]` and `[[your rate]]` are the same every time, and 🧪 **17 prospects carry
`hu_ordering = true`** today (14 of which the picker suggests the Hatches Up template for — the other 3
are at stage `contacted` and get the chaser), so this is real, repeated typing.

**Where such values could live, in increasing order of commitment:**

1. **`localStorage`, keyed by placeholder name.** Cheapest — no schema, no route, no migration, and it
   fits this task's constraints. Per-browser and per-device, invisible to anything server-side, and lost
   when site data is cleared. Good for exactly this: a convenience default you can always overwrite.
2. **A settings row** (`outreach_settings`, one row, a `jsonb` of defaults). Survives devices and is
   readable by anything else that ever needs the rate. Costs a table, a migration and read/write actions —
   all out of scope here.
3. **Per template, alongside the template.** Only coherent *after* templates become editable data: the
   default belongs with the copy that uses it, and `[[your rate]]` may legitimately differ between an
   introductory-offer template and a standard one. **This is the option to prefer, and it should wait for
   the templates table rather than being built twice.**

**🔴 The risk, and it is not hypothetical.** A remembered value is a **stale figure that looks deliberate**.
If the rate changes and the stored default does not, the field arrives pre-filled with the old number, the
"Still to fill" banner is empty, every warning in §3.4 stays silent, and the email goes out quoting a price
that is wrong — with nothing on screen indicating it was remembered rather than typed. The three
mitigations worth having, whichever store is chosen:

- **Show the value as a suggestion that must be accepted**, not as a filled field, the first time a
  template is opened in a session.
- **Stamp it with when it was last changed** and surface that next to the field.
- **Never remember a placeholder whose name suggests a per-prospect value** — `[[X]]`, the saving figure,
  is derived from *their* volume and must not be carried between trucks. That argues for an explicit
  per-placeholder opt-in rather than remembering everything by default.

**Stopping there.**

---

# 6. EVIDENCE CLASS

- ✅ **Executed against live data:** the Azahar example and every length in §2; the 231/231, 231/231,
  902/902 count-asserted fetches; the 17 `hu_ordering = true` figure.
- ✅ **Executed, compiler-compiled source:** P1–P7 — `applyFills`, the token scan, `outstanding` and the
  mailto builder extracted from `ComposeWindow.tsx` **after** compiling it with the repo's TypeScript, so
  the tested code is the shipped code.
- ✅ **Measured in a browser:** P8's font sizes, against the project's own compiled Tailwind.
- ✅ **Compiler-confirmed:** `tsc --noEmit`, 0 errors.
- ✅ **Structural, extracted from source:** the send/log call census, the `<input type>` audit, the scope
  comparison.
- 🔴 **Reasoned only, NOT OBSERVED:** that Outlook opens, that the body arrives intact in Outlook
  specifically, that the fields and preview read well on your screen. **No admin session is obtainable
  here — I typed into no field, opened no email and logged nothing. I claim no email was sent.** What I
  have is the encoded URL measured against a documented limit, which is stronger than clicking and
  weaker than you receiving one.
- ⚠️ **The ~2048 ceiling is a platform convention, not something I measured on your machine.** It is the
  IE-derived Windows URL limit that protocol handlers inherit, and it is why the guard exists at 2000
  rather than at the exact number. If Outlook on your setup accepts more, the guard is merely
  conservative; if it accepts less, the guard is what will tell you, instead of a silently truncated email.
