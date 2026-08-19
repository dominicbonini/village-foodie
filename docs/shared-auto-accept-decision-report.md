# One auto-accept decision, shared by both order-creation paths

**Built. `lib/orders/auto-accept.ts` now owns the decision; both paths call it and neither computes it.**
🔴 **Submit's behaviour is UNCHANGED — 96 of 96 input combinations identical, proven by executing the
pre-change block against the new function.** The card path changes on exactly **12 of 96**, all in one
direction: `confirmed` → `pending`. **No SQL was run.**

✅ **No Phase 2 stop tripped.** `force_pending` **IS** reachable on a card order (§2), so the extraction is
not larger than the problem; the card path's three refusals are untouched; nothing outside the two named
paths changed.

⚠️ **Two unrequested changes, both consequences of the move, named in §Unrequested.**

---

# PHASE 1 · READ-ONLY

## 1 · Both expressions, and where every input comes from

**Submit — `app/api/orders/submit/route.ts`, as it stood:**

```ts
          const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
          const preorderTz = (truck as any).timezone || 'Europe/London'
          const preorderFeatureOn = canAccess(truck.plan, 'advance_preordering', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)
          const preorderActive = preorderFeatureOn && eventStartMins != null && (truck as any).preorders_enabled !== false
          const preNowMins = getNowMinsInTz(preorderTz)
          const preNowDate = getLocalDateInTz(preorderTz)
          const anyForcesPending = preorderActive && orderLines.some(l => { … pre.pastAction === 'force_pending' })
          const orderHasNotes = !!(notes && notes.trim()) || items…specialInstructions || deals…slotNotes
          const noAutoAcceptUntil = eventRow?.offline_no_autoaccept_until ?? null
          const vanOfflineNoAutoAccept = !!noAutoAcceptUntil && new Date(noAutoAcceptUntil).getTime() > Date.now()
          if (
            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
            && !((truck as any).notes_require_review !== false && orderHasNotes)
            && !vanOfflineNoAutoAccept
          ) { autoAccepted = true }
```

**Promote-draft — as it stood:**

```ts
          const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
          const orderHasNotes = !!(draft.notes && draft.notes.trim()) || items…specialInstructions || deals…slotNotes
          const notesRequireReview = (truck as { notes_require_review?: boolean }).notes_require_review !== false
          if (truck.auto_accept && allItemsAutoAccept && !(notesRequireReview && orderHasNotes)) { autoAccepted = true }
```

| Input | Read from |
|---|---|
| `truck.auto_accept`, `notes_require_review`, `plan`, `feature_overrides`, `trial_expires_at`, `preorders_enabled`, `timezone`, `preorder_*` | the `trucks` row — **`select('*')` on both paths** |
| `autoAcceptByName` | `menu_items_db.auto_accept` |
| `preorderByName` | `menu_items_db.preorder_enabled` + the truck-level `preorder_deadline_type/value/past_action` |
| `eventStartMins` | `truck_events.start_time`, parsed to minutes |
| `offline_no_autoaccept_until` | `truck_events`, written by `heartbeat-monitor`, nulled by `/api/heartbeat` |
| `orderHasNotes` | the order's `notes` + item `specialInstructions` + deal `slotNotes` |

## 2 · 🔴 IS `force_pending` REACHABLE ON A CARD ORDER? — **YES.**

**The card fork, READ — `app/api/orders/submit/route.ts`:**

```ts
    if (payByCard === true) {
```

**Its own comment places it deliberately AFTER the pre-order gate:**

> *"⚠️ THE FORK IS HERE AND NOT AT THE PRICING LINE, DELIBERATELY. Pricing finishes ~30 lines above, but
> between there and here sit the pre-order open gate, the required-modifier completeness guard and the
> option sold-out backstop — all of which REFUSE orders."*

**And that gate refuses only NOT-YET-OPEN pre-orders. READ:**

```ts
        const openYet = isPreorderOpenYet((truck as any).preorder_open_rule, orderEventDate, poNowDate)
        if (!openYet && orderLines.some(l => (menuItems || []).find((m: any) => m.name === l.name)?.preorder_enabled === true)) {
          return NextResponse.json({ error: 'Pre-orders for this event aren’t open yet…', preorder_not_open: true }, { status: 403 })
        }
```

🔴 **`force_pending` IS THE OPPOSITE CASE — the deadline has PASSED, and the truck's `preorder_past_action`
says the item stays orderable but the order must be reviewed.** `pastAction` is truck-level config, so
every pre-order item on the truck carries it. **Nothing gates `payByCard` on it.** ✅ **READ.**

✅ **So a customer can put a past-deadline force-pending item in a basket and pay by card**, and before
this change that order auto-confirmed and captured. **The third stop condition does not trip.**

⚠️ **CANNOT DETERMINE whether any truck is configured this way today.**
`select id, preorder_past_action, preorders_enabled from trucks;` settles it.

## 3 · Each input, for promote-draft: has / could fetch / cannot reach

| Input | Promote-draft's position |
|---|---|
| `truck.*` (all of it) | ✅ **HAS** — `select('*')` on `trucks` |
| `autoAcceptByName` | ✅ **HAS** — already built it |
| `orderHasNotes` inputs | ✅ **HAS** — `draft.notes`, `items`, `deals` |
| `eventStartMins` | ✅ **HAS** — `start_time` already in its event select |
| `preorderByName` | ⚠️ **COULD FETCH** — needed `preorder_enabled` added to the `menu_items_db` select |
| `offline_no_autoaccept_until` | ⚠️ **COULD FETCH** — needed adding to the `truck_events` select |

❌ **NOTHING IS GENUINELY UNREACHABLE.** Both gaps were one column each.

🔴 **THE COST OF CHANGING THOSE SELECTS, STATED.** Both are **NAMED** selects, and PostgREST answers
**42703** for a column that does not exist, failing the whole statement — **which here would fail the
promotion of a card order whose money is already authorised.** ⚠️ **Both columns exist today:**
`preorder_enabled` has been named by the submit path since June, and `offline_no_autoaccept_until` was
applied on 18 August. **So the cost is a deploy-ordering constraint that is already satisfied, not a
migration.**

## 4 · The other two order-row writers

| Writer | Should it share the decision? |
|---|---|
| **The operator manual insert** (`action === 'manual'`) | ❌ **NO.** It writes the literal `status: 'confirmed'` because **an operator entering an order IS the confirmation.** There is no decision to share — no condition, no inputs, nothing that could be wrong |
| **`lib/seed-demo-orders.ts`** | ❌ **NO, and you were right to expect it.** It fabricates rows for demo trucks and evaluates no rule; making it consult a live truck's settings would be inventing behaviour |

✅ **Both are named in the shared module's header so a future reader does not have to re-derive it.**

## 5 · Tests covering either condition

🔴 **NONE. There are no tests in this repository at all.** `ls __tests__ tests test` → nothing;
`find . -name "*.test.ts*"` outside `node_modules` → nothing; no `"test"` script in `package.json`.
⚠️ **INFERRED FROM ABSENCE**, searches named. **So the cross-product harness in Phase 4 is the only
executable check either condition has ever had.**

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| Cannot unify without changing a third path | ❌ **Not tripped** — only the two named paths call it |
| Would drop a card-path refusal | ❌ **Not tripped** — the three refusals are separate guards that return `refused`; untouched |
| `force_pending` unreachable on a card order | ❌ **Not tripped — it IS reachable** (§2) |
| Instructions contradict | ❌ No |
| Garbled span | ❌ None |

---

# PHASE 3 · THE BUILD

## a · `lib/orders/auto-accept.ts` — `decideAutoAccept(args): boolean`

**Every input explicit; nothing read from a request, a session or a client.** The terms are **submit's
terms, moved with their comments**, in the same order, with the same `!== false` safe-by-default reads.

⚠️ **I CONSIDERED RETURNING A REASON (`blockedBy`) AND DID NOT.** It would have been useful for logging,
but "MOVE THE LOGIC, DO NOT REWRITE IT" is the instruction and a boolean is what both call sites consumed.
**Named here rather than done quietly.**

## b · What each path now does

**Submit** builds `eventStartMins` (moved up out of the removed block, unchanged) and calls the shared
function. **Promote-draft** builds `preorderByName` and `eventStartMins` and calls it.

🔴 **THE COLUMNS ADDED TO PROMOTE-DRAFT, NAMED EXACTLY AS ASKED — TWO, ONE PER SELECT:**

```
menu_items_db :  preorder_enabled
truck_events  :  offline_no_autoaccept_until
```

✅ **Nothing else was added to either select.**

## c · The card path's refusals

✅ **UNTOUCHED, AND DELIBERATELY NOT ABSORBED.** `checkClosedCategories`, `checkStockShortfall` and
`checkOptionCeilingShortfall` still sit where they were, still `return { status: 'refused' … }` and still
release the hold. **They answer "may this order exist at all"; the shared decision answers "should a human
look at it first".** **The module header records that distinction so the next person does not merge them.**

## d/f · capture.ts's warning, replaced not deleted

**The old header said "THERE ARE TWO AUTO-ACCEPTS, AND THAT COST ONE ORDER ITS CAPTURE".** It now says
what is true:

```
// ⚠️ WHAT THE WARNING HERE USED TO SAY, AND WHY IT IS GONE. It read "THERE ARE TWO AUTO-ACCEPTS, AND
// THAT COST ONE ORDER ITS CAPTURE" … It then did not prevent the recurrence: the offline-protection work
// added a term to submit and not to the promotion path …
// 🔴 THE HAZARD IS ANSWERED BY A MECHANISM NOW, NOT BY A NOTE ASKING TWO CONDITIONS TO BE KEPT IN
// AGREEMENT BY HAND: both paths call `decideAutoAccept` … THE TWO CAPTURE SITES REMAIN TWO — that is a
// fact about where orders are created, not a duplicated rule.
```

⚠️ **`capture.ts`'s executable diff is 0 removed / 0 added.** **Comment only.**

## Unrequested changes

1. **`eventStartMins` moved OUT of the removed block and now sits just above the call, in both files.** It
   was computed inside the block being extracted and is still needed by the caller. **The arithmetic is
   byte-identical; only its position changed.**
2. **`getNowMinsInTz` removed from submit's `@/lib/time-utils` import**, and `isPreorderDeadlinePassed`
   from its `@/lib/preorder` import. **Both left with the terms they served**, so both had become dead
   imports. **A comment records why.** `getLocalDateInTz`, `canAccess`, `isPreorderOpenYet` and
   `PreorderConfig` all remain — the pre-order **open-window** gate still uses them.

---

# PHASE 4 · VERIFICATION

⚠️ **Nothing was exercised against Stripe, no order was placed, no route was called.** `tsc --noEmit`
passes and is **not** offered as verification. `next dev` / `next build` were not run.

## 🔴 Submit is unchanged — 96 of 96, compared as bytes

**Method:** the pre-change block is extracted from a copy of `submit/route.ts` **taken before the first
edit**, compiled into a function with its inputs supplied, and evaluated beside the real `decideAutoAccept`
imported through jiti. **Both sides use the same real `canAccess`, `getNowMinsInTz`, `getLocalDateInTz`
and `isPreorderDeadlinePassed`** — the helpers are not stubbed, so the comparison is of the conditions
alone. **Cross-product: `auto_accept` × item flag × force-pending × `notes_require_review` × has-notes ×
marker(null | past | live) = 96.**

```
COMBINATIONS: 96
IDENTICAL (pre === post): 96
DIFFERENT: 0
```

**The six combinations that auto-accept, unchanged before and after:**

```
aa=true item=true force=false nrr=true  notes=false marker=null
aa=true item=true force=false nrr=true  notes=false marker=past
aa=true item=true force=false nrr=false notes=true  marker=null
aa=true item=true force=false nrr=false notes=true  marker=past
aa=true item=true force=false nrr=false notes=false marker=null
aa=true item=true force=false nrr=false notes=false marker=past
```

✅ **A `past` marker behaves exactly as `null`**, which is the "an expiry, not a flag" property, and it
survives the move.

## The card path — exactly 12 combinations change, all one way

```
CARD PATH — combinations: 96
unchanged: 84
CHANGED (was confirmed → now pending): 12
   aa=true item=true force=true  nrr=true  notes=false marker=null   true -> false
   aa=true item=true force=true  nrr=true  notes=false marker=past   true -> false
   aa=true item=true force=true  nrr=true  notes=false marker=live   true -> false
   aa=true item=true force=true  nrr=false notes=true  marker=null   true -> false
   aa=true item=true force=true  nrr=false notes=true  marker=past   true -> false
   aa=true item=true force=true  nrr=false notes=true  marker=live   true -> false
   aa=true item=true force=true  nrr=false notes=false marker=null   true -> false
   aa=true item=true force=true  nrr=false notes=false marker=past   true -> false
   aa=true item=true force=true  nrr=false notes=false marker=live   true -> false
   aa=true item=true force=false nrr=true  notes=false marker=live   true -> false
   aa=true item=true force=false nrr=false notes=true  marker=live   true -> false
   aa=true item=true force=false nrr=false notes=false marker=live   true -> false
any change in the other direction (pending -> confirmed): false
```

✅ **Read it as two groups:** **nine** where a past-deadline **force-pending** item is in the basket, and
**three** where the **offline marker is live** and force-pending is not. ✅ **Nothing moves from `pending`
to `confirmed`** — the card path only ever becomes MORE cautious.

## No capture fires for any of them

**The gate, quoted — `lib/payments/promote-draft.ts` step 8a, unchanged by this work:**

```ts
    if (autoAccepted) {
      captureResult = await captureOnConfirmation(supabase, {
        orderKey: draft.order_key, truckId: draft.truck_id, trigger: 'promote_auto_accept',
      })
      captureNote = captureResult.status
    } else if (draft.payment_intent_id) {
      captureNote = 'held, pending confirmation'
    }
```

✅ **All twelve now evaluate `autoAccepted === false`, so the `else if` runs instead: `'held, pending
confirmation'`.** **The authorisation stays held, and captures later at the operator-confirm site if a
human accepts the order.** ⚠️ **READ-FROM-SOURCE and unobserved** — no capture was attempted.

## Executable line counts

| File | Before | After | − | + |
|---|---|---|---|---|
| `app/api/orders/submit/route.ts` | 788 | 772 | 30 | 14 |
| `lib/payments/promote-draft.ts` | 310 | 325 | 17 | 32 |
| `lib/payments/capture.ts` | 245 | 245 | **0** | **0** |
| `lib/orders/auto-accept.ts` | — | **new** — 129 lines, **53 executable** | — | — |

⚠️ **Submit LOST 30 and gained 14** — the shape of logic leaving a file. **Promote-draft gained more than
it lost** because it now builds `preorderByName` and `eventStartMins`, which it never had.

## Marking

| Claim | Status |
|---|---|
| Both original expressions and every input's source | ✅ **READ** |
| `force_pending` is reachable on a card order | ✅ **READ** — the fork, the gate and the truck-level `pastAction` |
| Promote-draft could fetch both missing inputs | ✅ **READ** — both selects quoted |
| Submit unchanged across 96 combinations | ✅ **EXECUTED** — pre-change block vs the real function, real helpers, byte-compared |
| Exactly 12 card-path combinations change, all one way | ✅ **EXECUTED** |
| No capture fires for those 12 | ⚠️ **READ-FROM-SOURCE** — the gate is quoted; **nothing was run against Stripe** |
| No tests exist | ⚠️ **INFERRED FROM ABSENCE** — searches named |
| Whether any truck is configured for `force_pending` today | ⚠️ **CANNOT DETERMINE.** Query given in §2 |
| `tsc --noEmit` passes | ⚠️ **A breakage check, NOT verification** |

**Surfaces:** `app/api/orders/submit` is the **customer pay-at-hatch** path; `lib/payments/promote-draft`
is the **card promotion** path, reached from a webhook and a customer return; the manual insert is the
**operator** route; the seeder is demo infrastructure. **Each was read on its own.**

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the new module, the
two paths, `capture.ts` and this report.** The result, the non-ASCII census of characters introduced, and
the carrier-aware variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
