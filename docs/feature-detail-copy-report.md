# "HatchGrab" removed from two feature detail lines

**Built. Not deployed, not committed. No SQL, no migrations. One file changed: `lib/plan-features.ts`.**

**GARBLED SPANS: none.** No instruction contradicted another.

**VERIFICATION.** Not a typecheck. I **rendered the landing table in a browser**, **regenerated the PDF
and opened page 1**, and **re-read both rows out of the live module** to confirm cells, footnotes and
position.

---

## 1. The two changes

### Smart Slot Management — `lib/plan-features.ts:247`

```
was:  "HatchGrab paces orders across time slots to match your kitchen's capacity."
now:  "Orders are paced across time slots to match your kitchen's capacity."
```

### Automated stock countdown — `lib/plan-features.ts:265`

```
was:  'Set a stock count and HatchGrab counts it down as orders come in, then sells out automatically.'
now:  'Set a stock count and it counts down as orders come in, then sells out automatically.'
```

**Both applied exactly as approved.** The Smart Slot line keeps its **double quotes** because it contains
an apostrophe; I checked the codepoint first — `kitchen's` uses a **straight `'` (U+0027)**, not a curly
one, and it is unchanged.

---

## 2. 🔴 Every other place "HatchGrab" appears — NOT changed, for your approval row by row

**Two more feature detail lines carry it.** You were right that others would.

### Feature row details

| Row | Current text | |
|---|---|---|
| **Discovery map listing** | *"Your truck appears on the public **HatchGrab** map so nearby customers can find you."* | ⚠️ Arguably legitimate — it names a **destination**, a specific place the truck appears |
| **iPhone and iPad kitchen app**³ | *"The fullest way to run **HatchGrab**: a live kitchen screen, plus the only way to keep taking orders when you lose signal."* | ⚠️ Names the product as the thing being run. Closest in character to the two just changed |

### Row labels

**None.** No feature row label contains "HatchGrab".

### FOOTNOTES — three, and these are the ones most likely to be legitimate (see §4)

| # | Current text (the relevant clause) |
|---|---|
| **1** | *"Walk-up orders: **HatchGrab** charges 0% on every plan…"* **and** *"Card payments through **HatchGrab** via Stripe are coming soon —"* |
| **2** | *"Online payments powered by Stripe Connect. Subject to 0.99% **HatchGrab** platform fee plus Stripe card processing fees…"* |
| **5** | *"Kitchen ticket printing requires the **HatchGrab** kitchen app and a compatible thermal printer (neither supplied)…"* |

### TRANSACTION_ROWS — **none**
### PLAN_ALLOWANCES — **none**
### DETAIL_OVERRIDES / NAME_OVERRIDES — **none**

⚠️ Those overrides now live in **`lib/landing-table.ts`**, not `app/landing/page.tsx` — they were
extracted there when the PDF was built so the page and the PDF share one copy. I grepped that file:
**zero occurrences of "HatchGrab".** The one override with a long detail (*Offline Order Protection*)
says *"The iPhone and iPad app keeps you taking orders offline"* — no product name.

### Code comments — not user-facing, listed for completeness

`:61`, `:114`, `:427`, `:432` mention HatchGrab inside `//` comments. **They render nowhere** and are not
part of this question.

**🔴 I changed none of the above. Nothing beyond the two approved lines was touched.**

---

## 3. The protected strings

| | Before | After |
|---|---|---|
| `'Online ordering — Pay at Hatch'` occurrences in `lib/plan-features.ts` | **2** | **2** ✅ |
| The bare `'—'` cell literals | 2 | **2** ✅ |
| The Pizzeria Gusto testimonial | in `app/landing/page.tsx` | **file not touched** ✅ |

**Neither edited line is protected**, as you said — confirmed: the two `detail:` strings I changed are
not join keys and nothing matches on them. The join key lives in the **row label**
`'Online ordering — Pay at Hatch'`, which is a **different row** and was not read or written by this
change.

The two `s.replace()` calls each asserted **exactly one match** on a `detail:` string before replacing,
so it was not possible for either to touch a label.

---

## 4. Where naming the product is legitimate — reported, not changed

**Your rule — a detail line describing what the operator gets should not name us; a footnote about who
holds a contract might — sorts these cleanly:**

### 🟢 Legitimate, and I would leave them

| Where | Why |
|---|---|
| **Footnote 1** — *"HatchGrab charges 0% on every plan"* | 🔴 **The name is doing real work: it says WHO charges.** The same footnote then names Stripe's separate fee. Remove "HatchGrab" and *"charges 0% on every plan"* has no subject, and the distinction between our fee and Stripe's collapses — which is the exact confusion the footnote exists to prevent |
| **Footnote 2** — *"Subject to 0.99% HatchGrab platform fee plus Stripe card processing fees"* | Same reason, and stronger: two fees from two parties in one sentence. **Removing the name would make it read as one charge** |
| **Footnote 5** — *"requires the HatchGrab kitchen app"* | Names a **specific installable artifact** the operator must obtain, not a capability. *"requires the kitchen app"* would be vaguer about which app |

### ⚠️ Redundant by your rule, and the ones to look at next

| Where | Why |
|---|---|
| **Automated stock countdown** *(just changed)* | ✅ Was describing a capability |
| **Smart Slot Management** *(just changed)* | ✅ Same |
| **Discovery map listing** | Borderline. *"the public HatchGrab map"* names a destination, but *"appears on the public map"* loses nothing — the reader knows whose table they are reading |
| **iPhone and iPad kitchen app** | *"The fullest way to run HatchGrab"* is the closest remaining match to what you just removed. *"The fullest way to run your service"* or *"…to run it"* would carry the same meaning |

**Reported only. Send me wording for either and I will apply it the same way.**

---

## 5. Copy only — cells, footnotes and positions unchanged

Read back out of the live module after the edit:

| | Section | Cells | Footnote | Above | Below |
|---|---|---|---|---|---|
| **Smart Slot Management** | Online sales & automation | `{starter:false, pro:true, max:true}` | **null** | Customer time slot selection | Automated stock countdown |
| **Automated stock countdown** | Online sales & automation | `{starter:false, pro:true, max:true}` | **null** | Smart Slot Management | Auto-accept online orders |

**Both identical to before this change.** Also verified:

- **Parity checker: no violations.**
- **`ROW_FEATURE_MAP` keys matching no row: none.** Neither row label changed, so both join keys still
  resolve — checked rather than assumed, because that is the failure that happens silently.

⚠️ **`git diff lib/plan-features.ts` shows more than these two lines**, because the working tree still
carries three earlier uncommitted tasks (the `'Pay at hatch'` case fix, the pre-order row, and the
countdown row's move off Starter). **This change's own edit was two `detail:` string replacements and
nothing else** — no line was added or removed.

---

## 6. Every surface, and the PDF

| Surface | Status |
|---|---|
| **Landing table** | ✅ **measured in a browser** |
| **PDF** | ✅ **regenerated, page 1 opened** |
| **Admin** (`app/admin/page.tsx:984`) | ⚠️ **not rendered** — no admin credential; creating one needs SQL |
| **Manage → Billing** (`app/manage/[token]/page.tsx:11402`) | ⚠️ **not rendered** — no token, same reason |

### Landing — measured

```
Smart Slot Management : "Orders are paced across time slots to match your kitchen's capacity."
  cells ["✓","—","✓","✓"]
Automated stock countdown : "Set a stock count and it counts down as orders come in, then sells out automatically."
  cells ["✓","—","✓","✓"]
rows still naming HatchGrab in the rendered table: ["Discovery map listing","iPhone and iPad kitchen app3"]
```

**Exact approved wording on both, cells unchanged** — and the rendered table confirms §2's list from the
other direction: those two rows are all that remain.

### PDF — regenerated and opened

**2 pages, A4, 167,063 bytes.** Both rows sit at the **bottom of page 1** and **neither splits**:

| Row | Detail height | Lines |
|---|---|---|
| Smart Slot Management | **36px** (was 48px) | **2 → 1 line of detail** |
| Automated stock countdown | **48px** (unchanged) | 2 lines of detail |

🔴 **The wrap DID change — Smart Slot Management lost a line**, because *"Orders are paced"* is shorter
than *"HatchGrab paces orders"*. That is the risk you asked about, so it was checked rather than assumed:
**it did not push anything across the page break.** Page 1 still ends with *Automated stock countdown*
rendered whole — both detail lines and all four cells — and page 2 still begins at *Auto-accept online
orders*. `tr { break-inside: avoid }` held, and losing a line only ever creates slack, never pressure.

Header still repeats on page 2; all five footnotes present. A fresh copy is at
`~/Downloads/hatchgrab-plans-and-features.pdf`.

⚠️ Admin and Manage → Billing render the same source through the same cell renderer with no per-row
filtering, so both lines will read the same way there — but **that is read from code, not observed.**

---

## Files changed

```
lib/plan-features.ts   two `detail:` strings. No line added, none removed, no cell, footnote,
                       label, position or map entry touched.
```

**Untouched:** the three protected strings, `lib/pricing.ts`, `lib/features.ts`,
`app/landing/layout.tsx`, `lib/landing-table.ts`, and every other row and footnote.

**Nothing deployed. Nothing committed.**
