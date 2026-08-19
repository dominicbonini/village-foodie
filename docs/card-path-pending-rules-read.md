# The card path and the pending rules

**READ ONLY. Nothing changed except this file.** No fix, no SQL, no proposal. `next dev` / `next build`
were not run.

# 🔴 THE HYPOTHESIS IS CONFIRMED, AND IT IS WORSE THAN A MISSING `&&`

**`lib/payments/promote-draft.ts` computes `autoAccepted` with NO offline term — READ, not inferred. And
it is missing a SECOND term the pay-at-hatch path has: pre-order `force_pending`.**

⚠️ **THE MARKER COLUMN IS NOT EVEN SELECTED.** The event read in that file is
`select('id, start_time, end_time, venue_name, town, postcode, van_id')` — `offline_no_autoaccept_until`
is absent from it. **So this is not a forgotten conjunct in a condition that had the value to hand; the
value never enters the function.**

🔴 **AGAINST YOUR STATED RULE:** *"the same order, placed the same minute, should land in the same state
regardless of how the customer chose to pay"* — **it does not.** A card order placed while the van is
offline lands `confirmed` and **is captured in the same invocation**, where the identical pay-at-hatch
order lands `pending` and is not.

⚠️ **AND NOTHING IN THE FILE EXPLAINS IT.** §5 records the searches. **I am not concluding it was an
oversight; I am reporting that no recorded reasoning exists either way.**

---

## 1 · Every expression that decides `confirmed` vs `pending`

**Three writers of a new order row exist (§7). Only two compute a condition.**

### (a) The customer pay-at-hatch path — `app/api/orders/submit/route.ts`

**READ, verbatim and entire:**

```ts
          const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
          …
          const anyForcesPending = preorderActive && orderLines.some(l => {
            const cfg = preorderByName[l.name]
            if (!cfg) return false
            const pre = isPreorderDeadlinePassed(cfg, orderEventDate, eventStartMins as number, preNowDate, preNowMins)
            return pre.isPreorder && pre.passed && pre.pastAction === 'force_pending'
          })
          …
          const orderHasNotes =
            !!(notes && notes.trim()) ||
            (Array.isArray(items) && items.some((i: any) => i?.specialInstructions?.trim())) ||
            (Array.isArray(deals) && deals.some((d: any) =>
              Object.values(d?.slotNotes ?? {}).some((n: any) => typeof n === 'string' && n.trim())))
          …
          const noAutoAcceptUntil = eventRow?.offline_no_autoaccept_until ?? null
          const vanOfflineNoAutoAccept = !!noAutoAcceptUntil && new Date(noAutoAcceptUntil).getTime() > Date.now()
          if (
            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
            && !((truck as any).notes_require_review !== false && orderHasNotes)
            && !vanOfflineNoAutoAccept
          ) {
            autoAccepted = true
          }
```
```ts
      // (c) STATUS — pending unless auto-accepted above (only reachable when booked).
      const status = autoAccepted ? 'confirmed' : 'pending'
```

⚠️ **`autoAccepted` starts `false` and this block is reachable only when the slot claim BOOKED.** A full
event therefore lands `pending` on both paths — *"A FULL EVENT IS NOT A REFUSAL"*.

### (b) The card promotion path — `lib/payments/promote-draft.ts`

**READ, verbatim and entire:**

```ts
          const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
          const orderHasNotes =
            !!(draft.notes && draft.notes.trim()) ||
            (Array.isArray(items) && items.some(i => {
              const si = (i as { specialInstructions?: unknown })?.specialInstructions
              return typeof si === 'string' && si.trim().length > 0
            })) ||
            (Array.isArray(deals) && deals.some(d =>
              Object.values((d as { slotNotes?: Record<string, unknown> })?.slotNotes ?? {})
                .some(n => typeof n === 'string' && n.trim().length > 0)))
          const notesRequireReview = (truck as { notes_require_review?: boolean }).notes_require_review !== false
          if (truck.auto_accept && allItemsAutoAccept && !(notesRequireReview && orderHasNotes)) {
            autoAccepted = true
          }
```
```ts
          status:         autoAccepted ? 'confirmed' : 'pending',
```

### (c) The operator manual insert — `app/api/dashboard/action/route.ts`

```ts
          notes: notes || null, status: 'confirmed',
```

⚠️ **No condition at all — a literal.** An operator-entered order is confirmed by the act of entering it.
**Not a party to this comparison, but named so the set is complete.**

## 2 · 🔴 THE COMPARISON, TERM BY TERM

| # | Term | Pay-at-hatch (`orders/submit`) | Card promotion (`promote-draft`) | Difference |
|---|---|---|---|---|
| 1 | slot claim BOOKED (the enclosing branch) | ✅ | ✅ | — |
| 2 | `truck.auto_accept` | ✅ | ✅ | — |
| 3 | `allItemsAutoAccept` — a per-item `auto_accept = false` | ✅ | ✅ | — |
| 4 | notes-require-review × `orderHasNotes` | ✅ | ✅ | ⚠️ **same effect, different source** — see below |
| 5 | 🔴 **`!anyForcesPending`** — pre-order `force_pending` | ✅ **present** | ❌ **ABSENT** | 🔴 **MISSING FROM THE CARD PATH** |
| 6 | 🔴 **`!vanOfflineNoAutoAccept`** — the offline marker | ✅ **present** | ❌ **ABSENT** | 🔴 **MISSING FROM THE CARD PATH** |

✅ **NOTHING IS PRESENT ON THE CARD PATH AND ABSENT FROM SUBMIT.** The difference runs one way only:
**submit has two terms the card path does not.**

⚠️ **TERM 4 IS EQUIVALENT BUT NOT IDENTICAL, and the difference is worth stating rather than smoothing
over.** Submit reads the REQUEST's `notes`; promotion reads `draft.notes` — the same value having made a
round trip through `order_drafts`. Both then check item `specialInstructions` and deal `slotNotes` with
the same `!== false` safe-by-default read of `notes_require_review`. ✅ **Same rule, two implementations.**

🔴 **AND THE STRUCTURAL FACT BEHIND TERM 6, WHICH DECIDES HOW IT READS. The card path's event select:**

```ts
        .from('truck_events')
        .select('id, start_time, end_time, venue_name, town, postcode, van_id')
```

**`offline_no_autoaccept_until` is not in that list.** ⚠️ **So the condition could not have used the
marker even if a `&&` had been written — the column is never fetched.** **The two paths are not one rule
with a term dropped; they are two rules written separately.**

## 3 · What each missing term would have caught

### Term 6 — the offline marker

🔴 **A CARD ORDER PLACED WHILE THE VAN IS OFFLINE LANDS `confirmed`. YES.**

**What it would have caught:** the mode-B window — the van is unreachable, `heartbeat-monitor` has written
`offline_no_autoaccept_until`, and the pay-at-hatch path is holding every new order `pending` for a human
who is not there. **What happens instead:** the card order auto-confirms, joins the Confirmed list, **and
captures** (§4).

⚠️ **AND IT IS THE EXACT SITUATION MODE B EXISTS FOR.** The submit path's own comment: *"THE VAN IS
OFFLINE, SO NOTHING AUTO-CONFIRMS."* **On the card path, something does.**

⚠️ **A SECOND-ORDER CONSEQUENCE, since the auto-reject sweep now exists:** an order that lands `confirmed`
is **not** claimable by `claim_order_for_auto_reject` (it selects `status = 'pending'`). **So a card
customer in an outage is charged and left waiting, while a cash customer's order is held and — once a
delay is configured — refused with a connectivity reason.** ⚠️ **INFERRED** by composing the two predicates;
neither has been observed running.

### Term 5 — pre-order `force_pending`

🔴 **A CARD ORDER PAST A `force_pending` PRE-ORDER DEADLINE LANDS `confirmed`. YES.**

**What it would have caught:** an item whose pre-order deadline has passed with `pastAction ===
'force_pending'` — the operator's instruction that late orders for that item must be reviewed by a human.
**What happens instead:** auto-confirmed and captured.

⚠️ **THE CARD PATH DOES ENFORCE THE OTHER PRE-ORDER OUTCOME.** `checkStockShortfall`,
`checkClosedCategories` and `checkOptionCeilingShortfall` all run in `promote-draft` and REFUSE the
promotion, releasing the hold with a customer message. **So "sold out" and "category closed" are
enforced; "force pending" is not.** ⚠️ **That asymmetry makes an oversight more likely than a decision —
but it is not proof, and §5 stands.**

### Anything else I found

- ✅ **Per-modifier flags: none exist.** `grep -rn "auto_accept"` shows the flag on `menu_items_db` only;
  `modifier_options` has `available` and `stock_count`, no auto-accept. **Both paths use the same
  `autoAcceptByName` item map, so neither is ahead.** ⚠️ **INFERRED FROM ABSENCE**, search named.
- ✅ **`anyForcesPending`'s plan gate and timezone plumbing** (`canAccess`, `getNowMinsInTz`,
  `preorders_enabled`) exist only on the submit path — **but they are inputs to term 5, not separate
  terms.**
- ⚠️ **The card path has THREE refusal guards submit does not** — closed categories, stock shortfall,
  option-ceiling shortfall. **They refuse outright rather than holding pending**, so they are not
  `confirmed`/`pending` terms; **they are listed so "the card path is simply weaker" is not the takeaway.
  It is different, and weaker on exactly two terms.**

## 4 · What follows a wrongly-`confirmed` card order — **it captures, in the same invocation**

**READ — `lib/payments/promote-draft.ts`, step 8a:**

```ts
    let captureNote = 'no authorisation'
    let captureResult: CaptureResult | undefined
    if (autoAccepted) {
      captureResult = await captureOnConfirmation(supabase, {
        orderKey: draft.order_key, truckId: draft.truck_id, trigger: 'promote_auto_accept',
      })
      captureNote = captureResult.status
    } else if (draft.payment_intent_id) {
      captureNote = 'held, pending confirmation'
    }
```

**The gate, in the code's own words:**

> *"🔴 GATED ON `autoAccepted`, AND ON NOTHING ELSE. That flag IS the confirmation: it is the value this
> function just wrote into `orders.status` as 'confirmed'. A promoted order that landed 'pending' has NOT
> been confirmed, so it must NOT capture — its hold is legitimately held, waiting for a human."*

✅ **THE CAPTURE RULE IS SOUND AND IS NOT THE DEFECT.** It faithfully captures exactly when the order is
confirmed. 🔴 **THE DEFECT IS UPSTREAM: `autoAccepted` is TRUE in situations where your rule says the
order should be pending.** The gate then does what it was told.

**Is the customer's card actually charged, and when?**

🔴 **YES — seconds after they finish paying, inside the promotion that creates the order.** Not on a
later confirm, not on a sweep. `captureOnConfirmation` is awaited, **outside the event lock and BEFORE
the emails** (*"Money first"*), so the charge lands before the customer's confirmation email.

⚠️ **UNOBSERVED. Stripe has never been live on any truck**, so no card has actually been charged by this
path. **CANNOT DETERMINE from the repo that a real capture succeeds;** the ledger — `select * from
order_payments where idempotency_key like 'stripe_pi:%'` — would settle it once live.

⚠️ **AND `payment_status` STAYS `'unpaid'` ON THE ROW**, deliberately: *"That column is not what makes an
order paid — the LEDGER is."* **So the wrongly-captured order does not announce itself in the column most
people would look at.**

## 5 · Is the difference deliberate? — **NOTHING RECORDS IT. Saying that plainly.**

**Searches run over `lib/payments/promote-draft.ts`:** `offline`, `preorder`, `pre-order`,
`force_pending`, `no_autoaccept`.

- **`force_pending`, `preorder`, `no_autoaccept`: ZERO hits.**
- **`offline`: ONE hit, and it is unrelated** — line 291, about supplying the order key:
  *"Supplying it here is the same thing the offline walk-up path does every day."*

**The file's comments around the flag are detailed and discuss a DIFFERENT question — whether capture
follows the flag:**

> *"🔴 THIS FLAG IS THE CONFIRMATION, AND CAPTURE NOW FOLLOWS IT — see step 8a, after the lock. The
> comment that stood here said 'capture does not follow it here, in a later phase…'. That later phase
> arrived and hooked the OTHER auto-accept (place_order_atomic, on the pay-at-hatch path), not this one,
> so every auto-accepted card order was confirmed and never captured. Do not restore that sentence."*

⚠️ **THAT PARAGRAPH IS EVIDENCE OF THE SHAPE OF THE PROBLEM, NOT OF A DECISION.** It records a previous
occasion when work was applied to **one** auto-accept and not the **other** — the same two-implementations
split, caught late. **It says nothing about the offline or pre-order terms.**

🔴 **CONCLUSION, MARKED HONESTLY: NO RECORDED REASONING EXISTS FOR EITHER MISSING TERM. I am NOT
concluding it is an oversight** — the file is dense with deliberate, argued omissions, and a reason may
live outside it. ⚠️ **CANNOT DETERMINE.** **What would settle it:** `git log -S "vanOfflineNoAutoAccept"`
and `git log -p lib/payments/promote-draft.ts` around the offline-modes build, or
`docs/offline-protection-modes-build.md`, which the submit path cites by name for its Stage 1 Q2 decision.

## 6 · What triggers the promotion, and does connectivity bear on it?

**Two triggers, both server-side. READ.**

| Trigger | Where | Shape |
|---|---|---|
| `'redirect'` | `app/api/payments/return/route.ts:158` | `promoteDraft(supabase, draftKey, 'redirect')`, registered with `keepAlive`, then raced against a deadline |
| `'webhook'` | `app/api/webhooks/stripe/route.ts:841` | `startPromotion(...)` → `keepAlive(() => promoteDraft(supabase, orderKey, trigger)…)` |

**The webhook's own note on the relationship. READ:**

> *"/api/payments/return promotes as well, and since the return_url now points at it, that path runs for
> every customer who comes back — awaited, ahead of this one, in the ordinary case; the cancellation
> sweep releases any authorisation that never became an order."*

🔴 **THE VAN'S CONNECTIVITY HAS NO BEARING ON IT WHATSOEVER, AND THAT IS THE HEART OF THIS.** Both
triggers run on Vercel, from the customer's browser return and from Stripe's servers. **The van can be
switched off, out of signal, or in a field** — the promotion still runs, still evaluates `autoAccepted`,
still writes `confirmed`, and still captures. ⚠️ **The pay-at-hatch path runs on exactly the same
infrastructure and is equally indifferent to connectivity — it simply READS the marker the monitor wrote.
The marker is the whole mechanism, and the card path does not read it.**

## 7 · Every other writer of a new order row

**`grep -rn "from('orders')" app lib | grep insert/upsert` — three sites, and one more via RPC:**

| Writer | Status written |
|---|---|
| `app/api/orders/submit` → `place_order_atomic` RPC | `autoAccepted ? 'confirmed' : 'pending'` |
| `lib/payments/promote-draft.ts` insert | `autoAccepted ? 'confirmed' : 'pending'` |
| `app/api/dashboard/action/route.ts` (`upsert` + `insert`, the manual branch) | literal `'confirmed'` |
| ⚠️ **`lib/seed-demo-orders.ts:379`** | literal `status: 'confirmed'`, `payment_status: 'unpaid'` |

⚠️ **THE DEMO SEEDER IS A FOURTH WRITER and I am naming it rather than filtering it out.** It writes
`'confirmed'` unconditionally, evaluates no rule, and exists to populate demo trucks — **not a party to
this comparison, but it is a fourth place a new order row is created.**

✅ **So: two paths compute the rule, and they disagree.** **The near-duplicate shape you predicted is
exactly what is here.**

## 8 · "Landed on the Confirmed list", in data terms

**READ — `app/dashboard/[token]/page.tsx`:**

```ts
  const confirmedOrders=eventOrders.filter(o=>['confirmed','modified','cooking','ready'].includes(o.status)).sort(sortByTimeThenId)
  const otherOrders=eventOrders.filter(o=>['collected','cancelled','rejected'].includes(o.status))
```

⚠️ **THIS IS THE DASHBOARD. I did not read the KDS's grouping**, which builds its own lists — a fact
about one is not a fact about the other.

### Do the grouping and the capture gate disagree? — **NO, and the near-miss is worth stating**

| Status | On the Confirmed list? | Capturable? |
|---|---|---|
| `pending` | ❌ | ❌ |
| `confirmed` | ✅ | ✅ |
| `modified` | ✅ | ✅ — in `find_stranded_authorisations`' allow-list |
| `cooking` | ✅ | ✅ — same |
| `ready` | ✅ | ✅ — same |
| `collected` | ❌ (it is in `otherOrders`) | ⚠️ **YES — it IS in the sweep's allow-list** |

✅ **On your rule as stated — "landed on the Confirmed list" — the two agree for every status that can
reach capture from a new order.** 🔴 **The one row where they differ is `collected`: the dashboard has
moved it OFF the Confirmed list, and the stranded sweep can still capture it.** ⚠️ **That is DELIBERATE
and documented** — *"'collected' IS present — an order handed over without its money taken is the worst
case, not an excluded one."* **So it is a difference in the lists, not a disagreement about what
confirmation means.** ✅ **`pending` is absent from both, which is the property that matters.**

---

## Marking summary

| Claim | Status |
|---|---|
| 🔴 **Both conditions, verbatim** | ✅ **READ** — the hypothesis is CONFIRMED by reading, not carried over |
| The card path's event select omits the marker column | ✅ **READ** |
| Terms 5 and 6 missing from the card path; nothing missing the other way | ✅ **READ** — term-by-term |
| A card order in those situations lands `confirmed` | ⚠️ **INFERRED** from the condition — **UNOBSERVED**, no order was placed |
| The capture fires on `autoAccepted`, in the same invocation | ✅ **READ** — the call and its gate quoted |
| A real card is charged | ⚠️ **CANNOT DETERMINE.** Stripe has never been live. The `order_payments` ledger settles it once it is |
| No modifier-level auto-accept flag exists | ⚠️ **INFERRED FROM ABSENCE** — search named |
| No recorded reasoning for either omission | ⚠️ **CANNOT DETERMINE whether deliberate.** Searches named; `git log -S` would settle it |
| Two promotion triggers; connectivity is irrelevant to both | ✅ **READ** |
| Four writers of a new order row | ✅ **READ** — searches named |
| The dashboard's Confirmed grouping | ✅ **READ** — **dashboard only; the KDS was not read** |
| The sweep's allow-list including `collected` | ✅ **READ** |

**Surfaces, kept apart:** `app/api/orders/submit` is the **customer pay-at-hatch** path;
`lib/payments/promote-draft` is the **card promotion** path, reached from a **webhook** and a **customer
return**; the manual insert is the **operator** route; the Confirmed grouping is the **operator
dashboard**. **Each was read on its own and no fact is carried between them.**

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census — nothing else was touched. The result, the
non-ASCII census and the carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
