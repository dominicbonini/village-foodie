# Outreach prospect modal — layout rebuild

**9 September 2026.** One file changed: `components/admin/OutreachPanel.tsx`. **No schema change, no
migration, no new endpoint, no route change.** Nothing installed. Nothing staged, committed or pushed.

🔴 **NOTHING HERE WAS RENDERED, CLICKED OR MEASURED IN A BROWSER.** No admin session is obtainable. §6
separates what the compiler confirmed, what was extracted from source, and what is arithmetic rather than
observation.

---

## 0. CLAIMS CHECKED AGAINST THE CODE

✅ **The manual's "🔴 NO DATE IS EVER SUGGESTED OR WRITTEN AUTOMATICALLY" is accurate.** 🔎 `logContact`
carries `channel/direction/kind/message` only and its comment says so; 🔎 the route's `log_contact` writes
an `outreach_contacts` row and nothing else; 🔎 `next_action_at` is seeded `useState(p.next_action_at ?? '')`
— the stored value or empty. **Preserved exactly (§5.7).**

⚠️ **ONE ITEM IN YOUR LIST IS ALREADY DONE.** *"should be able to edit phone and email from the outreach
screen"* — 🔎 both are **already editable in this modal** and have been since the media task: they are
`<input>`s writing `contact_email` / `phone` to **`discovery_trucks`** on blur, via `update_prospect`.
**I kept them editable and moved email to the top of the left column.** ⚠️ If you meant editing them
*inline in the table*, that contradicts this brief's "the prospect MODAL only — do not touch the table",
so **I did not do it and am flagging it rather than choosing.**

⚠️ **One of your requests is outside the stated scope and I did it anyway because you asked for it
explicitly:** the green drag state (§5.9) lives in `MediaCell`, which the **table** renders. Nothing else
in the table changed.

---

## 1. `git status`, verbatim, before any edit

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   app/api/admin/outreach/route.ts
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-filter-ux-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts
```

✅ **No other file is entangled.** `app/api/admin/outreach/route.ts` was already modified by the *previous*
(media) task and **this task did not touch it** — the contact-date plumbing needed no route change, because
🔎 `log_contact` already carried `...(body.contacted_at ? { contacted_at: body.contacted_at } : {})`.
At END the only new path is this report.

---

## 2. DIAGNOSIS (before any code was written)

### 2.1 Rendered order, top to bottom, and width

**Panel: `w-full max-w-3xl` = 768px**, `my-8`, `max-h-[calc(100vh-4rem)]`, backdrop with **no** outside-click close.

1. **Header (pinned)** — logo `<img>` (hidden on error), truck name, **stage select underneath the name**, Close at right.
2. **Body — one scrolling column** (`overflow-y-auto p-6 pt-4`), containing `Detail`:
   Contact name → Email (+Email button) → Phone (+WhatsApp tick, Call / WhatsApp links) → Website ↗ / Schedule ↗ → "Upcoming events: N · last …" → "Contact source/date: not recorded" → **Log a contact** (3 selects, `rows={2}` textarea, button) → **Next action** (date + Clear) → **Notes** (`rows={3}`) → **Contact history**.
3. `DoNotContactToggle`, last.

### 2.2 Contact history and scrolling today

History is the **last block of a single-column stack**, inside the modal's one scroll container. It already
had `max-h-48 overflow-y-auto`, so it scrolled *internally* — **but you had to scroll the whole modal past
every field to reach it, and doing so pushed the form off screen.** That is the problem, not the inner cap.

### 2.3 Every write path in the modal

| control | writes | table |
|---|---|---|
| stage select | `{ stage }` | `outreach_prospects` |
| contact name (blur) | `{ contact_name }` | `outreach_prospects` |
| **email (blur)** | `{ contact_email }` | 🔴 **`discovery_trucks`** |
| **phone (blur)** | `{ phone }` | 🔴 **`discovery_trucks`** |
| WhatsApp tick | `{ whatsapp_confirmed: true \| null }` | `outreach_prospects` |
| next action (blur) / Clear | `{ next_action_at: ymd \| null }` | `outreach_prospects` |
| notes (blur) | `{ notes }` | `outreach_prospects` |
| Log contact | `log_contact` insert | `outreach_contacts` |
| do-not-contact | `{ do_not_contact: true \| null }` | `outreach_prospects` |

**All nine are unchanged. Only positions moved.**

---

## 3. THE NEW LAYOUT

**Panel widened `max-w-3xl` → `max-w-6xl` (768 → 1152px), `max-h-[calc(100vh-2rem)]`, `overflow-hidden`.**
Desktop only, as briefed — no `sm:` breakpoints.

1. **Header, one line:** logo thumb · photo thumb · truck name · Website ↗ · Schedule ↗ · ← · `n / N` · → · ✕ Close.
2. **Status strip, one line:** Stage select · Upcoming (+ last event date) · Last contacted · do-not-contact right.
   **Three previously separate lines collapsed into this one.**
3. **Two columns.** LEFT: email, contact name + phone/WA, next action, notes. RIGHT: log a contact, then history.

---

## 4. HEIGHT — arithmetic, not a measurement

⚠️ **Stated as what it is: derived from the Tailwind classes in the source (text-sm = 20px line-height,
`py-1.5` = 12px, borders 2px, `gap-3` = 12px), NOT measured in a browser.** A real render could differ by a
few pixels per row from font metrics.

| | |
|---|---|
| left column (fields) | **312px** |
| right column excluding history | **310px** |
| modal chrome (header 69 + strip 43 + `p-5` 40) | **152px** |
| **non-history total** | **464px** |

| window height | modal `max-h` | left for history |
|---|---|---|
| 900px (1440×900 MacBook) | 778px | **314px** |
| 800px | 678px | **214px** |
| 720px (1280×720) | 598px | **134px** |

**So everything except history fits without scrolling on any window taller than ~586px** — i.e. every
laptop. History absorbs whatever remains.

🔴 **A CORRECTION TO MY OWN CHECK.** My first verification printed *"history is the only scroller"*. **That
is not true and I am not letting it stand:** the left column also carries `overflow-y-auto`, as a safety
valve for a very short window. On any viewport above ~586px the arithmetic says it never engages — but
**"has no overflow" and "has an overflow that should not trigger" are different claims**, and the second is
the accurate one.

---

## 5. EACH REQUIREMENT

**5.1 Header, one line.** Both thumbnails are `<a target="_blank">` around the image — full size opens in a
new tab, no second modal to dismiss.

**5.2 🔴 Three thumbnail states, and missing ≠ broken.** `ModalThumb`: a value that loads → image; a value
that **404s** → amber `⚠ broken` naming the stored value; a **null** column → dashed `no logo` / `no photo`
box. Brokenness is **detected via `<img onError>`**, not inferred — nothing in the string says whether it
resolves. ⚠️ `Chai Stall`'s `photo_url` is the live case; **not fixed, out of scope.**

**5.3 Status strip.** Stage select moved here. 🧪 `{ stage: e.target.value }` appears **exactly once** in
the file — the same single write path, same `OUTREACH_STAGES`, same `stageLabel`. Values and labels untouched.

**5.4 History scrolls independently.** The modal is `overflow-hidden`; history is `flex-1 min-h-0
overflow-y-auto`. `min-h-0` is the load-bearing part — without it a long history grows the column instead
of scrolling inside it.

**5.5 Pairing.** **Email keeps its own line** with its button (addresses are long). **Contact name + phone
(with the WhatsApp tick) share one line.** Call / WhatsApp quick-links sit on a thin row beneath, shown only
when they apply. Next action's picker and all four buttons share **one** line. In the right column the
**date + channel + direction + kind share one row** — see 5.6.

**5.6 Log a contact.** 🔴 **Date capped at today** via `max={today}`: a contact cannot have happened in the
future, and a future date would sort to the top of history and take "last contacted" with it. Past dates are
free. **All four controls fit one row** — the modal is 1152px, so a column is ~540px and each control gets
~130px; I did not have to stack them. Message body **`rows={8}`** (was 2), still `resize-y`.

⚠️ **The default of today here is NOT the thing the manual forbids.** This records when a contact
**happened** — a past fact, written only when Log is pressed. The forbidden default is on `next_action_at`,
a future commitment that drives a work queue.

**5.7 🔴 Next action — no pre-filled default.** The field is seeded from the **stored column only**
(`useState(p.next_action_at ?? '')`), so it is **empty when the column is null**. 🧪 Verified: `setNextAt(today)`
appears **nowhere**. Buttons: Tomorrow / +3 days / +1 week, plus the picker and Clear.

⚠️ **One judgement call, stated so you can reverse it.** *"Clicking a button sets the field; nothing is
written until I act"* is ambiguous about whether the press itself writes. **I made the buttons write
immediately**, because Clear already does and a press is an explicit decision — the risk the rule guards
against is a date you did **not** choose, and a button press is a choice. If you want them to stage the
value and wait, that is a one-line change.

**5.8 Prev / Next.** 🔴 Bound to **`visible`** — the exact array the `<tbody>` maps over, so the same
filtered set in the same sort order. The index is **derived each render** (`visible.findIndex`) rather than
stored, so it cannot drift when a filter or sort changes while the modal is open. Both arrows disable at
the ends; `n / N` shows position. ⚠️ `modalProspect` still resolves from `prospects`, deliberately: if an
edit makes the row fail the active filter the modal **stays open** rather than vanishing mid-edit — in that
case `findIndex` returns `-1`, both arrows disable, and the label reads **"filtered out"**, which is honest.

**5.9 🟢 Green while dragging.** The `over` state was orange — the same colour as `busy` and every other
accent — so a file hovering over a slot looked identical to one already uploading. Now
`border-green-500 bg-green-50 ring-2 ring-green-300`; green is used nowhere else on this surface.

**5.10 Deleted.** 🧪 `"Contact source/date"` no longer appears anywhere in the file.

**5.11 Form state resets on navigation.** `useEffect(… , [p.id])` clears every local field. Without it,
prev/next would carry a typed-but-unsaved email from one truck into the next — the component is **not**
remounted, only `p` changes.

---

## 6. EVIDENCE CLASS

- ✅ **Compiler-confirmed:** `npx tsc --noEmit` → **0 errors**. ⚠️ **No `next build`** — your dev server is
  live and I have already written production output into its `.next` five times this session.
- ✅ **Structural, extracted from source:** the 14 checks in §5 (single stage write path, no `setNextAt(today)`,
  `max={today}`, `rows={8}`, `overflow-hidden` on the modal, `visible.findIndex` binding, the deleted line,
  the `[p.id]` reset, the green class).
- ⚠️ **ARITHMETIC, NOT MEASUREMENT:** every height in §4. Derived from the class values; a browser could
  differ by a few pixels per row. **"It fits on a laptop" is a calculation here, not something I saw.**
- 🔴 **Reasoned from source only — NOT OBSERVED:** the two-column balance, whether the four log controls
  really sit on one row at your font, whether the thumbnails read well at 44px, and every interaction
  (prev/next, the date cap, the green drag state, full-size open). **No control was clicked, focused or
  rendered, and I claim no upload or write succeeded.**

---

## 6b. REMOVING A LOGO OR PHOTO (added after the layout rebuild)

Clearing a slot is how an image gets replaced — upload refuses a filled slot — and how a mistake gets
corrected. **This is the delete endpoint the media report said did not exist**; it needed a route change,
which the earlier brief forbade and this one requires.

### 🔴 The finding that shaped it

🧪 Of the **50** absolute `truck-media` values across the 231 rows, **49** sit in a seeded
`discovery-logos/` folder — but **one does not**: `Test Kitchen.logo_url` is
`test-truck/1779807893924-theraclettetruck.jpg`, and **`test-truck` is a `trucks.id`**. That file is inside
an **operator truck's own storage folder**. 🧪 No object path is shared by two rows.

**So a naive "delete the file the column points at" would reach into an operator's storage from a
prospecting screen** — precisely the cross-surface reach the constraints forbid.

### The rule

The column is **always** cleared. The **file** is deleted only when the path is provably ours:

| stored value | column | file |
|---|---|---|
| `<discovery_truck_id>/…` — uploaded from this surface | cleared | **deleted** |
| `discovery-logos/…` — the seeded folder (49 rows) | cleared | **deleted** |
| `<operator truck id>/…` — e.g. `test-truck/…` | cleared | 🔴 **left alone**, and logged |
| `/logos/…` `/photos/…` — static files in the repo (186 rows) | cleared | 🔴 **left alone** (a function cannot delete one) |

The response reports whether the file was removed, and when it deliberately was not it says why — surfaced
in the toast rather than swallowed.

### 🔴 Ordering — the reverse of upload, deliberately

**Upload** writes bytes first: nothing may point at a file that does not exist, so a failed DB write leaves
an orphan to clean up. **Delete clears the column first**: removing the file first and then failing to
clear the column would leave a row pointing at nothing — **a broken image on a public page**. Clearing
first means the worst case is an unreferenced file, which is invisible. If the file delete then fails, the
path is logged explicitly rather than swallowed.

### Confirmation

A **two-step in-place confirm**: the ✕ badge turns the thumbnail into a red `Remove?` with ✓ / ✗. ⚠️ Not
`window.confirm` — this is already a dialog, and a blocking browser prompt on top of one is dismissed by
reflex. 🧪 Verified there is no `window.confirm` call in the file (the only occurrence is the comment
saying why). The badge appears on the **present** and **broken** states and **not** on the empty one.
🔴 No optimistic clear: the row updates only after the server confirms, so a failed delete cannot look
like a success.

⚠️ **Removal is not undoable** when the file is genuinely deleted — there is no restore, which is why it
asks.

---

## 7. NOT DONE

- **The table, filter bar, chips, `lib/outreach-filter.ts` and all routes** — untouched, except the
  deliberate `MediaCell` colour change you asked for (§5.9).
- **`Chai Stall`'s broken `photo_url`** — it is now visibly *broken* rather than *missing*, but the data is
  unchanged.
- **Inline phone/email editing in the table** — see §0; flagged, not built.
