# Three UX changes — contact box, completion labels, order-ready rename

**Date:** 13 August 2026
**Three files edited. No schema, no migration, no money path. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THREE THINGS TO READ FIRST

1. ✅ **NO TAP CONFLICT.** The card root carries **no** click handler, and `expanded` is a hardcoded `true` — the card does not collapse and tapping it does nothing. Adding a handler to the name nests inside nothing. **§1a.**
2. ⚠️ **YOUR BUTTON NAMES WERE CLOSE BUT NOT THE CODE'S.** The real strings are **`Mark paid & collected`** (lowercase *c*) and **`Mark paid`** / **`Collected`** — the second button is `Collected`, not "Mark Collected". **I used the code's. §2.**
3. ✅ **THE ORDER-READY RENAME IS CORRECT, AND HALF-DONE ALREADY.** `lib/settings-copy.ts` has said `'Order-ready step'` since it was written; only the dashboard's **inline** copy still said "notifications". The setting gates a **button**, and the email is documented in the code as *"model A: email ALWAYS fires on ready, NOT gated"*. **§3 — with one discrepancy you should see.**

---

## 1. The contact box → the customer name

### 1a. 🔴 WHAT THE CARD ALREADY DOES — ESTABLISHED BEFORE TOUCHING IT

**The card root, `components/dashboard/OrderCard.tsx:761`:**

```tsx
    <div id={anchorId} className={`w-full bg-white rounded-2xl overflow-hidden shadow-sm border transition-opacity flex flex-col ${…}`}>
```

✅ **No `onClick`. No `onPointerDown`. No `onTouchStart`.** Tapping the card does **nothing**.

**And the header is not a button either** (`:800`):
```tsx
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
```
Its own comment says *"header (non-collapsing — content always shown)"*, and `:189` is `const expanded = true`.

⚠️ **THE `e.stopPropagation()` ON THE OLD CONTACT CHIPS IS VESTIGIAL.** It survives from when the header was a collapse button. There is no longer anything to stop propagating to — which is exactly why this change is safe rather than a nested-control hazard.

**Every other handler in the file is on a leaf control** — `Btn`, `InlinePriceEditor`, the paid chip, the buzzer chip, the remove-payment modal, per-item tick, slot adjust, Edit/Cancel. None wraps the name.

### 1b. What the old box showed — nothing is lost

```tsx
      {showContact && (
        <div className="px-4 py-2 bg-white border-t border-slate-100 text-xs space-y-0.5">
          {order.customer_email && (
            <a href={`mailto:${order.customer_email}`} className="block text-orange-500 hover:text-orange-600">
              ✉ {order.customer_email}
            </a>
          )}
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="block text-orange-500 hover:text-orange-600">
              📱 {order.customer_phone}
            </a>
          )}
        </div>
      )}
```

🔴 **THIS PANEL IS UNTOUCHED, TO THE BYTE.** The email `mailto:` link and the phone `tel:` link both remain, with the same glyphs and the same tap-to-dial / tap-to-mail behaviour. **The removed thing was the trigger chip, never the details.**

**What was removed** — the same chip, three times, once per view mode:
```tsx
              <button
                onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
                className="text-[11px] text-slate-400 hover:text-orange-500 border border-slate-200 rounded px-1.5 py-0.5 transition-colors">
                Contact
              </button>
```
(cook mode; solo and window were `<span role="button" tabIndex={0}>` variants of the same thing, with an added `onKeyDown`.)

### 1c. The affordance — this file's own, quoted then followed

**The precedent, `InlinePriceEditor` at the top of the same file (`:63-70`):**

```tsx
  return (
    <button onClick={() => { setVal(price.toFixed(2)); setEditing(true) }}
      className="flex items-center gap-1.5 shrink-0 text-right group" title="Tap to override price">
      <span className="text-slate-900 font-bold text-sm">£{(price * quantity).toFixed(2)}</span>
      <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-xs" aria-hidden>✏</span>
    </button>
  )
```

**A `<button>` wrapping the value + a small trailing glyph that colours on hover + a `title` saying what a tap does.** Followed exactly:

```tsx
  const nameEl = (className: string) => (
    (order.customer_email || order.customer_phone) ? (
      <button
        onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
        title="Tap for contact details"
        className={`group inline-flex items-baseline gap-1 text-left ${className}`}>
        <span className="truncate underline underline-offset-2">{order.customer_name}</span>
        <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
      </button>
    ) : (
      <span className={`truncate ${className}`}>{order.customer_name}</span>
    )
  )
```

### 🔴 EXACTLY WHAT VISUAL TREATMENT WAS APPLIED

| | |
|---|---|
| **Underline** | `underline underline-offset-2` on the name |
| **Trailing glyph** | `✉` at `text-[10px]`, `text-slate-300` → `group-hover:text-orange-400` |
| **Tooltip** | `title="Tap for contact details"` |
| **Element** | a real `<button>` — keyboard-focusable and Enter/Space-activatable for free, which the old `<span role="button">` needed a hand-written `onKeyDown` to fake |

🔴 **THE UNDERLINE IS THE LOAD-BEARING PART, AND IT IS AN ADDITION TO THE PRECEDENT.** `InlinePriceEditor`'s glyph only colours **on hover**, and these cards are used on tablets and phones where hover does not exist. A glyph that reveals itself on hover is invisible to the operator actually holding the device. `underline` is the codebase's existing tappable-text affordance elsewhere (`CapacityBreachBanner.tsx:53`, `BuzzerLostBanner.tsx:78`, `DemoLoopComplete.tsx:194`, `dashboard/page.tsx:2761`), so this is two existing patterns combined, not a new one.

⚠️ **NO CONTACT DETAILS ⇒ THE PLAIN SPAN.** A walk-up with no email and no phone gets no underline, no glyph and nothing to tap — never an affordance that leads nowhere.

### 1d. What a card looks like now

**WITH contact details** — one row, no competition:
```
solo    Dominic Bonini ✉        [MODIFIED]  £18.00  PAID
window  Dominic Bonini ✉                    17:00 · 4m
cook    Dominic Bonini ✉  ✓
```

**WITHOUT:**
```
solo    Walk-up                 [MODIFIED]  £18.00  PAID
```

✅ **NOTHING OVERLAPS IN EITHER CASE, AND THE REASON IS STRUCTURAL.** The name keeps `min-w-0` (and `flex-1` in solo) so it is the flex item that absorbs pressure and truncates; every sibling — badge, price, paid chip, time, late pill — keeps `flex-shrink-0`. **Removing the box removed one `flex-shrink-0` competitor from the row**, so the name now has strictly *more* space than before, never less. The glyph is `flex-shrink-0` inside the button, so it never truncates away and the truncation happens on the name text, as it always did.

---

## 2. Completion-presses labels

### 🔴 THE ACTUAL BUTTON STRINGS, QUOTED FIRST

`components/dashboard/OrderCard.tsx`:

```tsx
      return <Btn label="Mark paid & collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
…
      return <Btn label="Collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
…
        label={effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
```

| Setting | Real buttons | You wrote |
|---|---|---|
| One press | **`Mark paid & collected`** | "Mark Paid & Collected" — capitals differ |
| Two presses | **`Mark paid`** then **`Collected`** | "Mark Paid" & "Mark Collected" — 🔴 **the second button is `Collected`, not "Mark Collected"** |

✅ **The code's strings were used.** ⚠️ **Two variants are deliberately not named**, and the manage page's own comment already says why: a part-paid order reads `Mark £X.XX paid`, and with "Do you take cash?" on, the money button splits into `💷 Cash` / `💳 Card`.

⚠️ **The help text under both options was ALREADY correct** — it names `“Mark paid & collected”`, `“Mark paid”` and `“Collected”` verbatim. Only the labels lagged.

### Changed — both surfaces

| File : line | Before | After |
|---|---|---|
| `app/dashboard/[token]/page.tsx:3350` | `'One press'` | `'One press (“Mark paid & collected”)'` |
| `app/dashboard/[token]/page.tsx:3351` | `'Two presses'` | `'Two presses (“Mark paid” & “Collected”)'` |
| `app/manage/[token]/page.tsx:9163` | `'One press'` | `'One press (“Mark paid & collected”)'` |
| `app/manage/[token]/page.tsx:9165` | `'Two presses'` | `'Two presses (“Mark paid” & “Collected”)'` |

⚠️ **These strings are INLINE on both surfaces, not in `lib/settings-copy.ts`.** Both were found and both were changed — the dashboard's is the per-event override, the manage page's is the truck default, and a customer-facing surface does not exist for this setting.

**Quote style:** curly `“ ”`, matching the manage page's own instruction three lines above the edit — *"⚠️ CURLY QUOTES, matching how this file already names a button inline (the paid-step and cash rows both do it). Not a new convention."*

---

## 3. 'Order-ready notifications' → 'Order-ready step'

### 🔴 ESTABLISHED FIRST: THE SETTING, THE COLUMN, AND EVERY BEHAVIOUR

| | |
|---|---|
| **Truck default** | `truck_vans.order_ready_enabled` (Manage → Settings → Your trucks) |
| **Per-event override** | `truck_events.order_ready_override` (dashboard, concrete `true`/`false`, never null) |
| **Resolved** | `effectiveOrderReady = event override ?? van default`, computed in `/api/dashboard` |

**Everything it controls — one thing, and the file says so, `OrderCard.tsx:723-731`:**

```tsx
    // solo mode (default — the operator ORDERS screen). The order-READY step shows when pub mode OR the
    // resolved order-ready setting is on (effectiveOrderReady = event override ?? van default, computed in
    // /api/dashboard — stage 3 re-point off show_cooking_step). When enabled: confirmed → Ready (fires the
    // customer ready-email — model A: email ALWAYS fires on ready, NOT gated) → "Mark paid & done". When
    // off, the current one-tap complete is unchanged.
    const readyStepEnabled = isPub || effectiveOrderReady
    if (['confirmed', 'modified'].includes(order.status)) {
      return readyStepEnabled
        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} colour="green" … />
        : completionBtn()
    }
```

✅ **`effectiveOrderReady` appears in exactly one behavioural expression: `readyStepEnabled`, which decides whether the `Ready` BUTTON renders.** Nothing else reads it.

**The email is NOT gated by it.** `send_ready_email` (`action/route.ts:355-361`) checks only `order.status !== 'ready'`:

```ts
    if (action === 'send_ready_email') {
      const { data: order } = await supabase.from('orders').select('*')…
      if (order.status !== 'ready') return NextResponse.json({ success: true, skipped: 'not ready' })
      await deliverReadyEmail(order, truck)
```

🔴 **AND THE KDS PROVES IT INDEPENDENTLY.** `app/dashboard/[token]/kds/page.tsx` has its own Ready flow calling the same `scheduleReadyEmail` (`:676`), and **`effectiveOrderReady` is never read there and never passed to its cards.** So turning this setting off does not stop customers being emailed — it removes the dashboard button, and the KDS can still mark orders ready and email them.

✅ **THE RENAME IS CORRECT.** It does not control a WhatsApp message, an email or a push. It controls a step in the operator's flow. "Step" does not understate it; **"notifications" overstated it.**

### ⚠️ AND ONE DISCREPANCY YOU SHOULD SEE — REPORTED, NOT CHANGED

The dashboard's help line under the toggle reads:

> Show a &ldquo;Mark ready&rdquo; button on the orders screen **and notify customers by email when their order is ready.**

That second clause is what makes the old label look justified, and it is **misleading in one direction**: turning the toggle **off** does not stop the email, because the KDS route is ungated. It is accurate about what happens when the toggle is **on**.

🔴 **I DID NOT CHANGE IT.** The brief was labels, and this is a help sentence whose accuracy question is separate from the rename. `lib/settings-copy.ts`'s equivalent has the same clause without "by email". **Flagged for your call.**

### Changed

| File : line | Before | After |
|---|---|---|
| `app/dashboard/[token]/page.tsx:3511` | `Order-ready notifications{demoLockChip}` | `Order-ready step{demoLockChip}` |
| `app/dashboard/[token]/page.tsx:3500` | `{/* Order-ready notifications — PER-EVENT on/off …` | `{/* Order-ready step — PER-EVENT on/off …` (comment) |

✅ **`lib/settings-copy.ts:120` ALREADY read `label: 'Order-ready step'`**, and Manage → Settings renders `{SETTING_COPY.orderReady.label}`. **So the manage surface already said the right thing; the dashboard was the outlier.** No change was needed there — which is why "apply the same labelling in manage → settings" required no edit for change 3, and two edits for change 2.

---

## V. VERIFICATION

### Every file and line changed

| File | Change |
|---|---|
| `components/dashboard/OrderCard.tsx` | `nameEl` helper added (~:743-772); three Contact chips removed (cook `:815`, solo `:853`, window `:885`); five stale layout comments corrected |
| `app/dashboard/[token]/page.tsx` | `:3350`, `:3351` labels; `:3511` label; `:3500` comment |
| `app/manage/[token]/page.tsx` | `:9163`, `:9165` labels |

### 🔴 THE OLD STRINGS — ZERO REMAINING HITS

```
'One press'                  -> 0
'Two presses'                -> 0
Order-ready notifications    -> 0
```
(across `app/`, `lib/`, `components/`)

**And "Contact" in `OrderCard.tsx` — four hits, all correct:**
```
511:  const [showContact, setShowContact] = useState(false)      <- state, deliberately NOT renamed
746:  // There used to be a separate "Contact" chip beside the name …   <- my comment
762:        onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
896:      {showContact && (                                       <- the panel, untouched
```

✅ **No rendered "Contact" text remains on any card, in any of the three view modes.**

### Gates

```
tsc: clean
eslint — dashboard 62, manage 285, OrderCard 2 … IDENTICAL before and after. ZERO NEW.
```

⚠️ **No variable, constant, column or key was renamed:** `showContact`, `setShowContact`, `order_ready_enabled`, `order_ready_override`, `effectiveOrderReady`, `completion_presses`, `'one'`/`'two'` are all untouched. **Values only.**

⚠️ **No behaviour changed.** The toggle still writes the same column, the same options still map to `'one'`/`'two'`, and the contact panel opens and closes on the same state via the same setter.

### 🔴 NO MIGRATION IS NEEDED

Nothing schema-shaped was touched. All three changes are strings and JSX.

---

## VI. NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `components/dashboard/OrderCard.tsx` | 1178 / 31 | 1239 / 31 | ✅ none |
| `app/dashboard/[token]/page.tsx` | 2448 / 53 | 2454 / 53 | ✅ none |
| `app/manage/[token]/page.tsx` | 6265 / 176 | 6271 / 176 | ✅ none |

✅ **Every distinct set is identical to its baseline.**

### Apostrophe / quote convention used

| File | Convention | What I used |
|---|---|---|
| `app/dashboard/[token]/page.tsx` | carries `“ ” ’` | 🔴 **curly `“ ”`** — matching the help text on the very same lines |
| `app/manage/[token]/page.tsx` | carries `“ ” ’` | 🔴 **curly `“ ”`** — matching the file's own stated rule three lines above the edit |
| `components/dashboard/OrderCard.tsx` | ⚠️ **carries NO `“ ” ’ '` at all** | 🔴 **none used.** My new code and comments contain no apostrophe or quotation mark of any kind — the glyph `✉` was already in the file (the contact panel uses it) |

---

## What was NOT touched

| Constraint | Held? |
|---|---|
| No schema, no migration | ✅ **None needed, none written** |
| No variable/constant/column/key renamed | ✅ **Values only** |
| No behaviour changed | ✅ Same handlers, same setter, same column, same option values |
| Anything else | ✅ Three files, all strings and JSX |

## Flagged for your decision

- ⚠️ **The dashboard's help line still says the setting will "notify customers by email".** True when the toggle is on; misleading about what turning it **off** does, because the KDS marks orders ready and emails regardless. Left alone — it is a sentence, not a label, and correcting it is a copy decision rather than the rename you asked for.
- ⚠️ **`app/manage/[token]/page.tsx:9613`** references *"the 'Order-ready step' row directly above"* in a comment — already consistent, no change needed.
- ⚠️ **`lib/payments/paid-step.ts:52` and `components/dashboard/types.ts:126`** both describe the two modes in doc comments as `One press ("Mark paid and collected")` — note **"and"**, where the button says **"&"**. Internal comments only, never rendered; not changed, because the brief was rendered labels.
