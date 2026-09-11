# Outreach modal — flow order, collapsed history, host-derived link labels

**9 September 2026.** One file changed: `components/admin/OutreachPanel.tsx`. **No schema change, no
migration, no new route action, no change to any existing write path.** `app/api/admin/outreach/route.ts`
was **not touched** by this task (it carries prior work). Nothing installed. Nothing staged.

🔴 **NOTHING WAS RENDERED OR CLICKED.** No admin session is obtainable. §7 separates the evidence classes.

---

## 0. 🔴 ITEM 1'S PREMISE IS CONTRADICTED BY THE CODE — AND THE REAL CAUSE IS SOMETHING ELSE

**The brief says the Next action field displays today's date, and asks me to find the mechanism before
fixing. I found it, and it is not Next action.**

🔎 There are **exactly two** `type="date"` inputs in the modal:

| line | field | value bound to | shows today? |
|---|---|---|---|
| `:1496` | **Next action** | `nextAt`, seeded `useState(p.next_action_at ?? '')` and re-seeded from the **same expression** in the `[p.id]` effect | **no — empty when the column is null** |
| `:1524` | the **Log a contact** date | `contactedAt`, seeded `useState(today)` where `today = toYMD(new Date())` | 🔴 **YES — 2026-09-09, by design** |

🔴 **And that second input was the only UNLABELLED control in the modal.** Two bare date boxes sat in the
same dialog; one showed today. **The one showing today is the contact date, which defaults to today
deliberately** — the previous brief for this modal required it: *"LOG A CONTACT — add a date picker,
defaulting to today."*

**Three independent lines of evidence that Next action was never the culprit:**

1. 🔎 **Source:** no path assigns today to `nextAt`. `setNextAt` is called from exactly three places — the
   `[p.id]` reset (`p.next_action_at ?? ''`), the quick-set buttons, and Clear (`''`).
   🧪 `setNextAt(today)` appears **nowhere** in the file. **The previous report's claim was correct and has
   not been overtaken.**
2. 🧪 **Your own data disproves it.** If Next action displayed today, blurring it would satisfy
   `nextAt !== (p.next_action_at ?? '')` (`'2026-09-09' !== ''`) and **write today**. 🧪 Re-derived:
   **0 of 231** rows are set to today. Had the field ever shown it, tabbing past it once would have written it.
3. 🧪 **Both rows you named are null:** `Nomadough → null`, `Pimp My Fish → null`, so both render `""`.

✅ **THE FIX IS THE LABELLING, WHICH ITEM 2 ALREADY ASKED FOR.** Both date fields now say what they are —
**"Contacted on"** and **"Follow up on"** — and the three selects beside the contact date got labels too,
since an unlabelled row of four controls was the underlying problem. **I changed nothing about how Next
action seeds or writes, because there was nothing wrong with it, and changing it would have broken the one
row that has a value.**

⚠️ **The manual's "🔴 NO DATE IS EVER SUGGESTED OR WRITTEN AUTOMATICALLY" holds** — it governs
`next_action_at`, which is untouched. The contact date is a *past fact*, written only on Log.

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
	docs/discovery-run-log-migration-report.md
	docs/outreach-delete-guard-report.md
	docs/outreach-filter-ux-report.md
	docs/outreach-inline-edit-report.md
	docs/outreach-media-build-report.md
	docs/outreach-media-delete-report.md
	docs/outreach-media-report.md
	docs/outreach-modal-layout-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts
```

🧪 Scoped `git status --short` over `app/manage`, `app/order`, `app/trucks`, `app/o`, `app/api/menu`,
`app/api/discovery`, `components/dashboard`, `public/` and `package.json` returns **nothing**.

---

## 2. 🔴 PROVED ON BOTH KINDS OF ROW

**Failure mode first:** *230 of 231 rows are null, so "always blank" and "correctly blank" are
indistinguishable unless the one row with a value is tested.* The seeding expression
(`p.next_action_at ?? ''`, used identically at the initialiser and the `[p.id]` reset) was run over all 231:

| | |
|---|---|
| NULL rows | 🧪 **230** — every one seeds to `""` ✅ (Nomadough `""`, Pimp My Fish `""`) |
| 🔴 rows WITH a value | 🧪 **1 — Tikka Tonic** → renders **`"2026-09-14"`** ✅ **stored date preserved** |
| set to today | 🧪 **0** |

**A fix that blanked the field unconditionally would show `""` for Tikka Tonic. It does not, because
nothing about the seeding changed.**

---

## 3. THE NEW ORDER (item 2)

🧪 Verified by slicing the source: the right column now reads **Log a contact → Follow up on → Contact
history**, and `'Follow up on'` appears in the right column and **not** in the left.

| | |
|---|---|
| **LEFT — reference** | Email · Contact name + Phone (WhatsApp tick) · Call/WhatsApp links · Notes |
| **RIGHT — interaction** | **Log a contact** (Contacted on · Channel · Direction · Kind, body, Log) → **Follow up on** (picker + Tomorrow / +3 days / +1 week / Clear) → **Contact history** |

⚠️ **The Follow up block sits under a hairline divider and is `flex-shrink-0`**, so it keeps its height and
only history absorbs the leftover — history remains the sole scrolling region.

---

## 4. CONTACT HISTORY, COLLAPSED (item 3)

Each entry: the metadata line (date · direction · channel · kind), then the body **clamped to two lines**,
with a **More / Less** control that expands **that entry only** (state lives per entry).

🔴 **The control appears only when it would do something.** `needsClamp` is decided from the text —
**two or more line breaks, or more than 160 characters** — not from measuring the rendered box.

**Failure mode:** *a clamp that clips everything looks identical to one that clips correctly unless a short
body is tested.* 🧪 Both directions:

| body | source | length / newlines | `needsClamp` |
|---|---|---|---|
| the three real emails | 🧪 **live `outreach_contacts`** | 295/7 · 584/13 · 801/15 | **true** — More shown ✅ |
| `"Called, no answer"` | ⚠️ **synthetic** | 17 / 0 | **false** — no control ✅ |
| `"Left voicemail."` | ⚠️ synthetic | 15 / 0 | false ✅ |
| 160 × `a` | ⚠️ synthetic | 160 / 0 | false — boundary |
| 161 × `a` | ⚠️ synthetic | 161 / 0 | true — boundary |
| `"one\ntwo"` | ⚠️ synthetic | 7 / 1 | false ✅ |
| `"one\ntwo\nthree"` | ⚠️ synthetic | 13 / 2 | true |

⚠️ **Stated plainly: there is no short body in the live data.** 🧪 `outreach_contacts` holds **6** rows, **3**
with a message, and all three are long emails. **The short-body cases are constructed**, so that half of
the proof is synthetic by necessity — but without it, "clips everything" would have passed.

⚠️ **The rule is approximate at the margin:** a 150-character single-line body that happens to wrap to three
lines would clamp with no way to expand. Chosen over measuring `scrollHeight`, which needs a layout pass I
cannot verify from here and **fails silently in the wrong direction**.

**Whitespace survives both states:** `whitespace-pre-wrap` is on the body unconditionally; only
`line-clamp-2` is toggled. 🧪 Verified the class sits outside the conditional.

### 4.1 Inertness check — can the clamp take effect?

🧪 The clamped element is a **`<p>`**. The unlayered `!important` rule in `globals.css` targets
`input[type=…]`, `select` and `textarea` — 🧪 **not `p`** — so it cannot override the clamp. This was worth
checking precisely because `line-clamp` needs `display:-webkit-box`, and a display override would silently
disable it.

---

## 5. LINK LABELS DERIVED FROM THE HOST (item 4)

The label is read from the URL's hostname — Facebook / Instagram / X / else the fallback — the same
principle as the competitor tag, which the manual records as derived from `order_url`'s host rather than
typed. 🧪 Over the 231 live rows:

| column | non-null | labels |
|---|---|---|
| `website` | **102** | 🔴 **Facebook 64**, Website 38 |
| `schedule_url` | **26** | Schedule 22, **Facebook 4** |

🧪 **Instagram 0, X/Twitter 0** — confirming your figures. **No Instagram or X column was added**; those
label arms exist only to name data that already arrives.

### 5.1 🔴 A real bug found in passing, and two I introduced and caught

🧪 **`Shika Shack.website = "shikashack.co.uk"` — stored with NO SCHEME.** `<a href="shikashack.co.uk">` is
a **relative** link, so the existing Website button navigates to `/admin/shikashack.co.uk`. `safeHref`
prefixes `https://` when a scheme is absent, turning that one dead button into a working one. **Display
only; the stored value is untouched.**

🔴 **My first `safeHref` had two defects, and testing only the 231 live rows would have shown 100% green:**

| input | first attempt | after hardening |
|---|---|---|
| `/relative/path` | 🔴 `https://relative/path` — an invented host that looks like a working link | **null** |
| `javascript:alert(1)` | 🔴 **passed through unchanged — script executes on click** | **null** |

**Both now rejected**, along with `data:`, `ftp:` and `//evil.com`; only `http:`/`https:` survive. ⚠️ These
columns are **scraper-written and anon-readable**, so the value is untrusted input — no live row exercises
either case today, which is exactly why edge cases and not the live set had to be the test.

🧪 **Live regression after hardening: unchanged — 102/26 non-null, same label split, 1 scheme-less rescued,
0 unusable.**

⚠️ **And one of my own checks was vacuous before I caught it:** the first regression run printed
`{}` and `unusable: 0` while processing **zero rows** — I filtered on `d.id` without selecting it. **A green
number over an empty set.** Re-run with 231 rows actually loaded.

---

## 6. WHAT WAS NOT CHANGED

🧪 Verified by structural check: `matchesOutreachFilter`, the chips, every filter control, the inline
phone/email fields, the media cells, the upload path, the delete guard — all untouched. Next action's
**write** behaviour is byte-identical (blur writes `nextAt || null`; the four buttons write immediately);
only its **position and label** moved.

---

## 7. EVIDENCE CLASS

- ✅ **Compiler-confirmed:** `npx tsc --noEmit` → **0 errors**. ⚠️ **No `next build`** — your dev server is
  live and I have already written production output into its `.next` five times this session.
- ✅ **Executed against real data:** §0 and §2 (231 rows, the 1 non-null, the two named rows), §4's three
  real bodies, §5's 102/26 URL split and the post-hardening regression. All re-derived today.
- ✅ **Structural, extracted from source:** the two date inputs and their bindings, the column ordering,
  the `needsClamp` gate, the `safeHref` protocol allow-list, the inertness check in §4.1.
- ⚠️ **Synthetic, and flagged as such:** every short-body case in §4 — live data contains none.
- 🔴 **Reasoned only, NOT OBSERVED:** that two lines is the right clamp height at this width, that the
  right column now fits without scrolling, and every interaction (More/Less, the labels reading clearly,
  the rescued link opening). **No control was clicked or rendered.**
