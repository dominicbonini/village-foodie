# Outreach — manual-only next-action dates, status relabel, logo verification

**Scope:** `app/admin/outreach/page.tsx`, its route, and `lib/outreach.ts` (item 1 explicitly directed the lib cleanup). No migration, no schema change.
**Verification:** **no admin session (nine failures still hold; not retried)** — page/route are code-only and unobserved on the running app. **No DB rows were written this turn** — only read-only counts. tsc is clean (not behavioural verification).

---

## 1. AUTOMATIC NEXT-ACTION DATE — removed entirely
- **Logging writes a contact row and nothing else.** `logContact` no longer computes or sends `next_action_at`; the route's `log_contact` action no longer updates it. No date is suggested, computed or written automatically anywhere.
- **Helper text removed** ("+7 / +14 / +30 … rolled off the weekend").
- **`lib/outreach.ts` cleanup — caller sweep first, then delete:**
  - `suggestNextActionYMD` — only caller was `logContact` (now gone) → **deleted**.
  - `nextActionIntervalDays` — only used inside `suggestNextActionYMD` → **deleted**.
  - `rollOffWeekend` — only used by `suggestNextActionYMD` + `parkUntilFebruaryYMD` → **deleted**.
  - `parkUntilFebruaryYMD` — **no callers anywhere** (the button was removed earlier) → **deleted**.
  - 🔴 **`toYMD` KEPT** — still used by `isOverdue`. **`isOverdue` KEPT** — it reads a date, never writes one.
- **Kept:** `next_action_at` column, the date picker, and the Clear button. **Overdue flagging kept** (reads a hand-set date).
- ⚠️ **Existing values left untouched:** **1 row** currently holds a `next_action_at`. Not cleared — your call.

## 2. STATUS LABELS — display relabel applied (stored values unchanged)
A `STATUS_LABEL` map drives both the row select and the modal-header select:
`not_contacted → "not contacted"`, `contacted → "contacted"`, `replied → "replied"`, `signed → "signed"`, **`not_interested → "no sale"`** (the only change). `contacted` and `replied` stay distinct and pickable — no collapse, no stored-value change.

## 3. LOGO FIX — verified against real rows
Over the 231 prospect rows' discovery logos:
- **153 pass the resolver** (http(s) or leading-slash) · **44 absolute** · **109 leading-slash** · **78 have no logo**.
- **Spot-check (all exist in `public/logos/`):** `pizzeriagusto.jpg` ✓, `bbpizza.jpg` ✓, `smotherspudders.jpg` ✓.
- **0 of the 109** `/logos/…` paths point to a missing file — every relative logo has its file. So all 153 resolvable logos will render (44 from the public storage bucket, 109 from `public/logos/`); the remaining 78 rows correctly show no logo.

## Your mid-turn fixes
- **Modal Close was unreachable when the content was tall** — fixed: the panel now scrolls **internally** with a **pinned header** (logo + truck name + status + Close), so **✕ Close is always visible**; **Escape** also closes. The backdrop still has **no outside-click close**.
- **Truck name** — it is in the header (`<h3>{name}</h3>`) and, with the pinned header, always on screen.
- **"WA" → "WhatsApp"** beside the phone.
- **Do-not-contact moved to the BOTTOM** of the modal (after history).
- **Entity type removed** from the modal. The `entity_type` column and its values are untouched (just not rendered); the field's probe/data still flow but nothing displays them.

## ORDER (unchanged apart from DNC moving to the bottom)
Header (logo + name + status) → contact → log a contact → next action → notes → history → do-not-contact.

---

## FLAGS
- **No garbled text; no contradiction.** Item 2 is now resolved (you kept contacted/replied distinct), so the earlier tension is gone.
- **Scope note:** `lib/outreach.ts` was edited because item 1 directed it; the caller sweep is reported above. HU columns, sort/layout, the search box and `discovery_trucks.excluded` untouched. No migration, no schema change.
- **No DB writes this turn** (only read-only counts). The 1 existing `next_action_at` was left as-is.
- **Not verified live** — no admin session (nine failures). You verify on localhost.

*2026-09-04. Page/route/lib code-only and unobserved; no DB writes.*
