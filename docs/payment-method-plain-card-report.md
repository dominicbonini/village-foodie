# A plain paid press always records `card` — the gate is gone, and Add order joins the rule

**Files changed — THREE, all client:**

| File | What |
|---|---|
| `components/dashboard/AddOrderPanel.tsx` | 🔴 **FIX A + D** — both plain "Take payment" mounts record `card`; the toasts name it |
| 🔴 `app/dashboard/[token]/page.tsx` | **GUSTO'S LIVE PATH — FIX B** — the `takesCash` gate removed |
| `app/dashboard/[token]/kds/page.tsx` | **FIX B** — the same, kept identical |
| `docs/payment-method-plain-card-report.md` | this file |

🔴 **NOTHING UNDER `app/api` WAS TOUCHED, AND NOTHING NEEDED TO BE** — the route already honours
`body.method`, which is what the previous diagnosis established. **No SQL, no migration, no schema
change. No commit, stage, revert, stash or clean; no `git stash`, `checkout` or `restore`. No build, no
deploy.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# FIX A — THE ADD-ORDER PANEL

## A.1 Both mounts, before

```tsx
          onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = null; void submitManual() }}   // the phone confirm bar
          onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = null; void submitManual() }}   // the wide confirm bar
```

**Two mounts, the same hardcoded `null`, no `takesCash` anywhere near either.**

## A.2 Both mounts, after

```tsx
          onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'card'; void submitManual() }}
```

✅ **EXECUTED — the file now has FOUR `= 'card'` click handlers, and I checked each one by its button
text: `1602` = `💳 Card`, `1613` = `Take payment`, `1638` = `💳 Card`, `1657` = `Take payment`.** Two were
already the explicit Card buttons; **the two that changed are the plain ones.**

## A.3 🔴 YES, THE PANEL HAS ITS OWN CASH CONTROL — SO ALL THREE STATES EXIST HERE

```tsx
                onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'cash'; void submitManual() }}
                  <><span className="text-sm">💷 Cash</span><span className="text-base font-black">£{manualTotal.toFixed(2)}</span></>
```

**`💷 Cash` → `cash` · `💳 Card` → `card` · plain `Take payment` → 🔴 `card` (this change).** The Cash and
Card pair renders only on a `takesCash` truck; the plain button is what every other truck sees.

## A.4 ⚠️ THE PANEL CANNOT CREATE A STRIPE-SETTLED ORDER — CHECKED, NOT ASSUMED

✅ **EXECUTED — `grep -n "stripe\|Stripe"` over the whole 176KB file returns EXACTLY ONE hit, and it is
the word "stripe" inside a comment about a colour band** (*"drew as a bright stripe across a grey
pane"*). **No `payment_intent`, no `channel:'online'`, no Stripe client.** Every order this panel books
is money taken at the hatch, so nothing here can reach an `online` row. **That path is untouched because
it does not exist here.**

⚠️ **`null` REMAINS REACHABLE AND MUST BE:** `paymentMethod: takePaymentRef.current ? paymentMethodRef.current : null`
— an order saved **unpaid** sends `null`, and the server writes **no payment row at all**.

---

# FIX B — 🔴 THE `takesCash` GATE IS REMOVED, NOT WEAKENED

**Before, on both surfaces:**

```ts
  const plainPaidMethod:'card'|null=resolvePaidStep(truck,selectedOrDefaultEvent).takesCash?null:'card'
  const plainPaidMethod: 'card' | null = resolvePaidStep(truck, activeEvent).takesCash ? null : 'card'
```

**After:**

```ts
  const plainPaidMethod:'card'|null='card'
  const plainPaidMethod: 'card' | null = 'card'
```

**The rule now, in full:**

| Control | Action dispatched | Recorded |
|---|---|---|
| plain `Mark paid` | `mark_paid` + `method:'card'` | 🔴 **card** |
| plain `Mark paid & collected` | `collected` + `method:'card'` | 🔴 **card** |
| Add order, plain `Take payment` | `manual` + `paymentMethod:'card'` | 🔴 **card** |
| `💷 Cash` (either surface, either shape) | `mark_paid_cash` / `collected_cash` | **cash — derived by the SERVER from the name** |
| `💳 Card` | `mark_paid_card` / `collected_card` | **card — derived by the SERVER from the name** |
| Add order, `💷 Cash` / `💳 Card` | `manual` + `paymentMethod` | cash / card |
| an order saved UNPAID | `manual`, no payment | **no row** |
| a Stripe-settled order | `lib/payments/online.ts` | 🔴 **`channel:'online'`, method null — NOT REACHED BY ANY OF THE ABOVE** |

⚠️ **THE TYPE STAYS `'card' | null` DELIBERATELY** — it is the shape the hook and the body spread already
expect, and a future rule that needs null again has somewhere to put it. ✅ **`resolvePaidStep` is still
imported and still used on both surfaces** (4 other call sites on the dashboard, 2 on the KDS) — only
this one decision stopped consulting it.

## 🔴 STRIPE, THE 409 GUARD AND THE CHECK

- ✅ **EXECUTED — `app/api/dashboard/action/route.ts` IS NOT IN THIS TASK'S DIFF AT ALL.** The 409
  held-authorisation guard (`if (await hasHeldAuthorisation(supabase, orderKey))`, which refuses
  `mark_paid` outright while a card hold is live) is **byte-identical**.
- ✅ **THE CHECK CANNOT BE VIOLATED, AND THERE ARE TWO VALIDATORS BETWEEN A CLIENT AND THE COLUMN.** The
  route still narrows to the vocabulary itself —
  `body.method === 'cash' || body.method === 'card' ? body.method : null` — and the panel's payload is
  narrowed the same way (`manualOrder?.paymentMethod === 'cash' || … === 'card' ? … : null`).
  🔴 **The only literals this change puts on the wire are `'card'` and `'cash'`.** A hand-rolled POST
  sending `'cheque'` still falls to `null` rather than reaching a 23514.

---

# FIX C — THE PAYMENT-NOT-RECORDED REPAIR

🔴 **DECISION: IT RECORDS `card` TOO, AND IT DOES SO WITHOUT A LINE OF ITS OWN.**

```tsx
        { duration: 20000, action: { label: 'Record payment', run: () => runAction('mark_paid', orderKey) } },
```

**It dispatches PLAIN `mark_paid`, which is one of the two `PLAIN_PAID_ACTIONS`** — so it now carries
`method:'card'` for free, on every truck. ⚠️ **On a `takesCash` truck the card renders `💷 Cash` /
`💳 Card` for the repair instead, and those still answer for themselves.**

**The reason, which is your own:** the repair exists to record a payment nobody recorded at the time. **If
the operator is telling us money was taken and cash was not chosen, the same reading applies —
otherwise the repair would be the one paid press in the product that still writes an unknown.** ⚠️ **The
cost, stated: the repair is used when nobody was asked at the time, so `card` here is an inference from
the button pressed rather than from an answer given. It is the same inference every other plain press
now makes, and making it everywhere is better than making it in three places out of four.**

---

# FIX D — THE TOASTS

✅ **The order-card paths already named the method and now always will**, because `payMethodPhrase`
takes `plainPaidMethod` and that value is no longer ever null:

```ts
function payMethodPhrase(action: string, plain: 'cash' | 'card' | null | undefined): string | null {
  if (action.endsWith('_cash')) return METHOD_PHRASE.cash
  if (action.endsWith('_card')) return METHOD_PHRASE.card
  return plain ? METHOD_PHRASE[plain] : null
}
```

**`Order #12 paid on your card machine` · `Order #12 collected — paid on your card machine`** — both
branches already existed (`isPayAction` and `isCollectAction`), so no toast string was rewritten.

🔴 **THE ADD-ORDER PANEL'S OWN TOASTS SAID NOTHING ABOUT MONEY AND NOW DO:**

```tsx
  const paidPhrase = () => {
    if (!takePaymentRef.current) return ''
    const m = paymentMethodRef.current
    return m === 'cash' ? ' — paid in cash' : m === 'card' ? ' — paid on your card machine' : ''
  }
```
```tsx
        showToast(`Order ${displayId} saved${paidPhrase()}`, 'success')     // the offline/queued branch
        showToast(`Order #${data.orderId} confirmed${paidPhrase()}`)         // the online branch
```

✅ **The words are `PaymentActionsModal`'s and `useGatedActionResult`'s, not a third vocabulary.**
✅ **Where nothing was recorded — an order saved unpaid — the phrase is the empty string and the toast
is byte-identical to what it always was.**

---

# 🔴 NO BACKFILL — AND HOW MANY PATHS COULD HAVE WRITTEN A NULL

**`order_payments` is append-only. Every existing NULL row stays NULL, and nothing in this change reads
or rewrites history.**

**Paths that could produce a NULL in-person row BEFORE this change — five, of which four were live as of
this morning:**

1. 🔴 **Add order's plain `Take payment`, phone mount** — hardcoded null, any truck. **Closed by Fix A.**
2. 🔴 **Add order's plain `Take payment`, wide mount** — the same. **Closed by Fix A.**
3. **Plain `mark_paid` on a `takes_cash = TRUE` truck** — the gate returned null. **Closed by Fix B.**
4. **Plain `collected` on a `takes_cash = TRUE` truck** — the same gate. **Closed by Fix B.**
5. ⚠️ **Any plain press before `7672bae` (17 Aug)** — no method was sent at all. **Historical; cannot be
   closed and must not be.**

**Still able to write NULL after this change, correctly:** a hand-rolled or replayed POST with no
`method`, and any value outside the vocabulary — both fall to `null` by the route's own validation,
which is the honest answer for a request that did not say.

---

# ⚠️ PIZZERIA GUSTO — `takes_cash = false`, `show_paid_step = true`

| | Before | After | Method of the claim |
|---|---|---|---|
| Plain `Mark paid` on an order card | `card` | 🔴 **`card` — UNCHANGED.** Their gate already resolved to card | ✅ **source-read** (the expression they hit) |
| `Mark paid & collected` | `card` | **`card` — unchanged** | ✅ source-read |
| **Add order → `Take payment`** | 🔴 **NULL** | 🔴 **`card` — THIS IS THE CHANGE FOR THEM** | ✅ **source-read; the row was not observed being written** |
| Their buttons, labels, colours, positions | — | ✅ **untouched — no button markup is in the diff** | ✅ **EXECUTED** — the diff on the panel is two `onClick` bodies, one ref comment, one helper, two toast strings |
| Cash / Card buttons | not rendered (`takesCash` false) | ✅ **still not rendered — nothing changed the condition that renders them** | ✅ source-read |
| Toasts | `Order X saved` | **`Order X saved — paid on your card machine`** when payment was taken | ✅ source-read |

🔴 **NOT ONE OF THESE CLAIMS IS EXECUTION-VERIFIED AGAINST THEIR DATA. No order was placed, no button
pressed, no row read.** Everything above is the source of the path they take.

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` per file: AddOrderPanel 12 errors / 11 warnings (23 —
identical to the count recorded in the two previous Add-order reports), dashboard 82/26 (108),
KDS 18/3 (21) — every figure identical to this session's baselines.**

| Required claim | Method |
|---|---|
| Add order's `Take payment` persists `card` at BOTH mounts | ✅ **EXECUTED (source)** — both handlers now read `'card'`, identified by button text (§A.2); the payload line `paymentMethod: takePaymentRef.current ? paymentMethodRef.current : null` and the route's `manualMethod` narrowing are unchanged and carry it. 🔴 **No order was created** |
| Plain `mark_paid` on a two-press truck persists `card` | ✅ **SOURCE READ** — `plainPaidMethod` is now the literal `'card'`; the body spread `PLAIN_PAID_ACTIONS.has(action) && plainPaidMethod` is unchanged; the route's `mark_paid` branch honours `body.method` |
| Plain `Mark paid & collected` persists `card` | ✅ **SOURCE READ** — `collected` is the second member of `PLAIN_PAID_ACTIONS`, and the route's `collected` branch uses the same three-way expression |
| Explicit cash/card still persist cash and card | ✅ **SOURCE READ** — untouched: the server derives them from the action NAME (`action === 'mark_paid_cash' ? 'cash' : …`), and this value never reaches them |
| A `takes_cash` TRUE truck also records `card` on a plain press | ✅ **SOURCE READ — that is precisely what removing the gate does.** On such a truck a plain press arrives from the repair action and from any stale/queued client; both now carry card |
| Stripe untouched, 409 guard unchanged | ✅ **EXECUTED** — `app/api/dashboard/action/route.ts` and `lib/payments/online.ts` are **not in the diff**; the panel contains no Stripe path at all (§A.4) |
| The CHECK cannot be violated | ✅ **EXECUTED (source)** — two validators, both unchanged, and the only literals introduced are `'card'` and `'cash'` |
| The toasts name the method | ✅ **SOURCE READ** — `payMethodPhrase` with a non-null `plainPaidMethod` on the card paths; `paidPhrase()` on both of the panel's own toasts. 🔴 **No toast was rendered** |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RUN, RENDERED OR WRITTEN.** No order, no press, no row, no query.
- 🔴 **THE ONE CHECK THAT SETTLES IT, after the next deploy: place a walk-up order through Add order with
  `Take payment`, then read that `order_key`'s `order_payments` row — `method` should be `'card'`.**
- ⚠️ **The observed order from the previous report is not explained by this change and cannot be:** its
  row was written by one of the five NULL paths above and stays NULL. **Only new presses differ.**

---

# INTEGRITY

⚠️ **"BEFORE" is the figure the previous reports recorded for each file** — the tree was already dirty and
`checkout` is forbidden. **The class census is also checked against `HEAD`.**

```
components/dashboard/AddOrderPanel.tsx    BEFORE 173,964 → 176,053 bytes · 2,554 lines · 36 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   U+26A0 50, 47 paired, 3 bare (all pre-existing)   ·   added vs HEAD: NONE · removed: NONE

app/dashboard/[token]/page.tsx            BEFORE 392,305 → 393,662 bytes · 5,058 lines · 53 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   U+26A0 86, 84 paired, 2 bare (both pre-existing)  ·   added vs HEAD: NONE · removed: NONE

app/dashboard/[token]/kds/page.tsx        BEFORE 228,741 → 229,279 bytes · 3,068 lines · 33 classes
   NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
   U+26A0 140, 140 paired, ✅ 0 bare                  ·   added vs HEAD: NONE · removed: NONE
```

✅ **No file gained or lost a non-ASCII class.** ⚠️ **The `💷` and `💳` in this report are quoted from
existing button labels; neither file gained a glyph.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/payment-method-plain-card-report.md   bytes 17,672
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 34 | 0 | 34 |
| U+26A0 (warning sign — TEXT presentation) | 13 | 13 | 0 |
| U+2705 (check mark button) | 28 | 0 | 28 |
| U+1F4B7 (banknote) | 6 | 0 | 6 |
| U+1F4B3 (credit card) | 7 | 0 | 7 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.

## Working tree

```
 M app/api/dashboard/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/UserMenu.tsx
 M components/shared/EventActionsModal.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/ExtraWaitModal.tsx
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/add-order-overflow-third-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-phone-controls-final-report.md
?? docs/kds-phone-expand-final-report.md
?? docs/kds-phone-expand-report.md
?? docs/kds-phone-width-fix-report.md
?? docs/kds-screen-on-header-report.md
?? docs/kds-sound-chips-report.md
?? docs/kds-view-panel-report.md
?? docs/landing-features-move-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/payment-method-not-recorded-report.md
?? docs/payment-method-plain-card-report.md
?? docs/plan-feature-order-domain-report.md
?? docs/screen-sound-alignment-report.md
?? docs/screen-sound-fix-report.md
?? docs/splice-verification-report.md
?? docs/van-name-hide-report.md
?? docs/van-name-visibility-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/AddOrderPanel.tsx` | ⚠️ already `M`; 🔴 **THIS TASK wrote to it** |
| 🔴 `M app/dashboard/[token]/page.tsx` | ⚠️ already `M`; 🔴 **THIS TASK wrote to it** |
| 🔴 `M app/dashboard/[token]/kds/page.tsx` | ⚠️ already `M`; 🔴 **THIS TASK wrote to it** |
| 🔴 `?? docs/payment-method-plain-card-report.md` | 🔴 **THIS TASK** — this file |
| `M app/api/dashboard/route.ts` | ✅ pre-existing — the van-count field, **and NOT the action route, which this task did not touch** |
| everything else | ✅ pre-existing — earlier tasks this session and their reports |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
