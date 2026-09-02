# Pre-order deadlines — the feature, and the row

**Reported first, then built. Not deployed, not committed. No SQL, no migrations.**

**GARBLED SPANS: none.** No instruction contradicted another. **No mismatch was found in items 1–3, so I
did not stop** — the approved wording matches what the product actually does, and §2 shows the check.

**VERIFICATION.** Not a typecheck. I **ran the parity checker**, **rendered the landing table in a
browser**, and **regenerated the PDF and opened both pages**. What I could not verify is named in §6.

---

## 1. 🔴 Is the feature actually built? — **Yes. Both halves.**

**This is not a claim ahead of the product.** Read from the code:

### The columns, and what each does

| Column | Lives on | What it does |
|---|---|---|
| `trucks.preorders_enabled` | truck | **Master switch.** Gates *all* pre-order effects. Checked `!== false` so an unset column means on — a backfill default, per `lib/provision-truck.ts:92-93` |
| `menu_items_db.preorder_enabled` | item | **Inclusion only.** Which items are pre-order items. `app/api/manage/route.ts:520` — *"per-item stores ONLY `preorder_enabled` (inclusion)"* |
| `trucks.preorder_deadline_type` | truck | `'hours_before'` \| `'daily_cutoff'` — see §3 |
| `trucks.preorder_deadline_value` | truck | hours before event start, or cutoff minutes-of-day |
| `trucks.preorder_past_action` | truck | `'sold_out'` \| `'force_pending'` — see §2 |

⚠️ **The type/value/action columns also exist on `menu_items_db`** (typed in `app/manage/[token]/page.tsx:80`)
but are **not written per item any more**: the V7.8 "global-config" change moved them to the truck row.
`manage/route.ts:748-755` is explicit — *"The deadline type/value/action live ONCE on the truck row."*
So a stale per-item value is inert. Worth knowing; not a defect and not this task's business.

### Enforced on the customer ordering path? — **Yes, and by one shared engine**

`lib/preorder.ts` is a **pure function** and its header states the design:

> *"THE DRY LINCHPIN: a PURE function (no I/O, no side effects) called by BOTH the menu-API sold-out read
> (Stage 3) AND the submit force-pending check (Stage 4), so display and enforcement can NEVER diverge."*

| Where | What happens |
|---|---|
| `app/api/menu/[truckId]/route.ts:566-576` | Past deadline → `sold_out`, or `closed_pending` for force_pending. **What the customer sees.** |
| `app/api/orders/submit/route.ts:535-540` | `canAccess(plan,'advance_preordering')` **then** the deadline check. **Enforcement at submission.** |
| `lib/orders/auto-accept.ts:72-91` | A past-deadline `force_pending` line suppresses auto-accept |
| `lib/payments/promote-draft.ts:288-291` | Same config honoured on the **card** path |

### Configurable in Manage today? — **Yes**

| Control | Where |
|---|---|
| Master toggle | `app/manage/[token]/page.tsx:8801-8804` → `update_truck` |
| Deadline type / value / action | `:8809-8826` → `update_truck` |
| Per-item inclusion (single + bulk, by category/subcategory) | `:8829-8843`, `:10604-10636` → `set_item_preorder_bulk` |
| A plain-English rule summary shown to the operator | `:10501` |
| A "Pre-order" badge on included items | `:4195-4196` |

**Neither half is missing.** The customer-facing enforcement and the operator-facing configuration both
exist, and they share one engine.

---

## 2. 🔴 `preorder_past_action` — exactly two values, and they are your two

**READ:** the column is typed `'sold_out' | 'force_pending'` in every place it appears — `lib/preorder.ts:19`,
`app/manage/[token]/page.tsx:78` and `:80`. **There is no third value, and none is missing.**

**Manage's own labels, verbatim from `app/manage/[token]/page.tsx:10563-10564`:**

| Value | Operator sees | Help text |
|---|---|---|
| `sold_out` | **"Mark sold out"** | *"Customers can't order it after the deadline."* |
| `force_pending` | **"Allow, require approval"** | *"Customers can still order, but the order needs your approval (won't auto-accept)."* |

**Against your approved wording:**

> *"Choose what happens after: **the item shows as sold out**, or **the order comes to you to approve**."*

| Your phrase | The product | |
|---|---|---|
| "the item shows as sold out" | `sold_out` → *"Mark sold out"* | ✅ exact |
| "the order comes to you to approve" | `force_pending` → *"the order needs your approval"* | ✅ exact |

🟢 **No mismatch. Two promises, two values, no third outcome hidden and none advertised that does not
exist.** Your wording is used verbatim and I adjusted nothing.

---

## 3. Both kinds of cut-off — confirmed

`preorder_deadline_type` is `'hours_before' | 'daily_cutoff'`, and `lib/preorder.ts:17` documents both:

> *"hours_before → whole hours before event start; daily_cutoff → cutoff minutes-of-day on the event's date."*

- **Offset before the event:** `hours_before`. ✅
- **Fixed clock time:** `daily_cutoff`. ✅

**Both are operator-selectable** — `gType` at `app/manage/[token]/page.tsx:8809` is a two-way choice
written through `update_truck`. `resolvePreorderDeadlineClock` handles the cross-day case where an
`hours_before` cut-off lands on the previous calendar date.

🟢 **So "a cut-off", unqualified, is the right wording** — naming only one kind would understate it.

---

## 4. The row, and where it went

Added to **`lib/plan-features.ts`**, in the **"Online sales & automation"** section, **immediately after
`Advance pre-ordering`** (which is where you asked for it, and where it belongs):

```ts
{ name: 'Pre-order deadlines', detail: 'Set a cut-off for items that need notice. Choose what happens
  after: the item shows as sold out, or the order comes to you to approve.',
  starter: false, pro: true, max: true },
```

**Why that section:** `Advance pre-ordering` is the row directly above it and lives there already. The two
are halves of one capability — that row sells ordering ahead, this one sells the cut-off that makes it
safe to promise — and they share a gate (§5). Splitting them across sections would separate a feature
from its own constraint. **No footnote**, because the approved wording carries no claim needing one.

**Trial** is not stored: the Trial column is **derived** (`trialFeatureValue` → `row.max`), so
`max: true` makes Trial ✓ automatically. That is the existing mechanism, not a new one.

---

## 5. 🔴 The gate — it already exists, and no new key was invented

**Is there a corresponding `Feature`?** **Yes: `advance_preordering`**, and it is *already* the gate that
enforces this behaviour. `app/api/orders/submit/route.ts:535`, READ:

```ts
const poFeatureOn = canAccess(truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, …)
const poActive    = poFeatureOn && truck.preorders_enabled !== false
```

**The deadline logic runs behind exactly that key.** So:

- 🔴 **I did NOT add a new Feature to `lib/features.ts`, deliberately.** A `'preorder_deadlines'` key
  would have **zero `canAccess` call sites** — it would gate nothing, and would pass the parity checker
  vacuously while advertising a control that does not exist. The manual already records **five unenforced
  gates** as a problem; a sixth invented today would be worse, because it would be invented knowingly.
  `lib/features.ts` is **untouched** — confirmed by `git diff`.
- ✅ **A `ROW_FEATURE_MAP` entry WAS needed and was added**, mapping `'Pre-order deadlines'` →
  `'advance_preordering'`. Without it the checker skips the row entirely (`if (!feature) continue`).
- **Two rows sharing one key is fine**: `findPlanParityViolations` looks the key up **per row**, so both
  are checked against the same grant.

### What `PLAN_FEATURES` grants today

`advance_preordering` is a literal member of **`PRO_FEATURES`**; `MAX_FEATURES` spreads `PRO_FEATURES`;
`TRIAL_FEATURES` spreads `MAX_FEATURES`. So Pro, Max and Trial hold it and Starter does not — **exactly
the distribution you asked for.** Nothing in `lib/features.ts` needed to change.

### The parity checker — run, and deliberately not trusted on its own

```
violations: none
new row   : {"starter":false,"pro":true,"max":true,"footnote":null}
```

🔴 **A clean run is not proof, and you were right to say so** — the checker only inspects cells that are
literally `true`, so **`starter: false` is invisible to it**. A row wrongly marked false for Starter would
pass silently. So I checked **all three tiers in both directions**:

| Tier | `canAccess(tier,'advance_preordering')` | Row says | |
|---|---|---|---|
| starter | **false** | false | ✅ agree |
| pro | **true** | true | ✅ agree |
| max | **true** | true | ✅ agree |
| trial | **true** | derived from max | ✅ agree |

**The false cell is verified, not merely unflagged.**

---

## 6. Every surface it now appears on

All four render `FEATURE_SECTIONS` with **no per-row filtering** — confirmed: neither Admin nor Manage
has a `HIDDEN_ROWS`, `NAME_OVERRIDES` or `.rows.filter`, so the row appears on both by construction.

| Surface | Iterates at | Status |
|---|---|---|
| **Landing table** | `app/landing/page.tsx` via `visibleRows()` | ✅ **measured in a browser** |
| **PDF** | `app/landing/features-pdf/route.ts` | ✅ **regenerated and opened** |
| **Admin** | `app/admin/page.tsx:984` `section.rows.map` | ⚠️ **not rendered — see below** |
| **Manage → Billing** | `app/manage/[token]/page.tsx:11402` `section.rows.map` | ⚠️ **not rendered — see below** |

### Landing — measured

```
rows: 33  (was 32)
row immediately above : "Advance pre-ordering"
label : "Pre-order deadlines"
detail: "Set a cut-off for items that need notice. Choose what happens after: the item shows as sold
         out, or the order comes to you to approve."
cells : ["✓","—","✓","✓"]   [Trial, Starter, Pro, Max]
```

**Exact approved wording, correct position, correct cells** — including the protected `'—'` em dash in
the Starter column.

### PDF — regenerated and opened

**Still 2 pages, A4, 167,207 bytes** (was 165,236).

🔴 **The new row does NOT split across pages.** It lands on **page 1**, whole, directly under
*Advance pre-ordering*, with its detail on two lines (48px tall in the print DOM). Page 1 now ends after
*Customer time slot selection*; page 2 begins at *Smart Slot Management* — the break moved up by one row
and fell cleanly. `tr { break-inside: avoid }` did its job. **Nothing is cut off**, the header still
repeats on page 2, and all five footnotes are present. A fresh copy is at
`~/Downloads/hatchgrab-plans-and-features.pdf`.

### ⚠️ Admin and Manage — reads correct, but I did not see them

**I have no admin credential and no Manage token, and creating either needs SQL, which is forbidden.**
Both surfaces map over `section.rows` with no filter and use the same `✓ / — / Coming soon` renderer, so
the row will appear with the same values — but that is **read from the code, not observed**, and I am not
going to call it verified. **Worth one look at Admin → Features and Manage → Billing before this deploys.**

🟢 One thing that *is* verified for those two: `findPlanParityViolations()` runs **at module load** and
**throws in development**. Both surfaces import `lib/plan-features.ts`, so if the row and the gate
disagreed, neither page would render at all. They will render.

---

## 7. What was not touched

| | |
|---|---|
| The three protected strings | ✅ `'Online ordering — Pay at Hatch'` still **2 occurrences**; the bare `'—'` cell literals still **2** |
| Any other row | ✅ **no row line was removed or rewritten** — `git diff` shows no `- { name:` line. The change is purely additive |
| `lib/pricing.ts` (price mask set) | ✅ untouched |
| `lib/features.ts` (feature gate) | ✅ untouched — no new key |
| `app/landing/layout.tsx` (landing admin gate) | ✅ untouched |

⚠️ **`git diff lib/plan-features.ts` shows three removed lines that are NOT from this task** — they are
the `'Pay at hatch'` → `'Pay at Hatch'` case fix from the previous task, still uncommitted in the working
tree. This task's own edit inserted **two blocks and removed nothing**.

---

## Files changed

```
lib/plan-features.ts   +43 / -3   the new row after 'Advance pre-ordering', its ROW_FEATURE_MAP entry,
                                  and the comments recording that the feature is built and why no new
                                  Feature key was created. (The -3 is the previous task's case fix.)
```

**Nothing deployed. Nothing committed.**
