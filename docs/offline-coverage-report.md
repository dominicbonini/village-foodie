# The conflict signal — payment failures made findable and hard to erase — BUILD

**Date:** 6 August 2026. Supersedes the offline-payments report of the same name.
**Six files changed, one new module.** No `next dev` / `next build`. No garbled spans in the brief.

**Provenance honoured:** this builds the remedy §3 of the previous report described and nothing beyond it. Every reference in that report was re-checked against the code before editing; all three defects were confirmed still present.

🔴 **Out of scope and untouched:** retry (a failed replay still stays failed) · the queued-payment rendering · amount pinning / `op_id` · the `edit` kind · the KDS `ledgerRows` defect · printing, trigger modes, the Settings card · commerce-policy, pricing, keep-awake, the native shell, the legal pages.

---

# ESTABLISHED FIRST — the three questions the brief required answering before building

## 4. How is a conflict op's action identified? — **`body.action`, and nothing else can do it**

Confirmed: `kind` **cannot** separate them. A payment op is queued as `kind: 'status'` exactly like `ready` and `collected`, because they replay to the same endpoint. The op's shape ([outbox.ts:65-79](lib/native/outbox.ts#L65)) carries `body`, and the action lives there.

**What I keyed on:** the same `PAYMENT_ACTIONS` set the payment overlay already folds on — surfaced as a predicate rather than duplicated:

```ts
// lib/native/orderGate.ts
const PAYMENT_ACTIONS = new Set(['mark_paid', 'mark_paid_cash', 'mark_paid_card', 'undo_mark_paid'])
export function isPaymentAction(action: string): boolean { return PAYMENT_ACTIONS.has(action) }
export function opAction(op: { body?: unknown }): string { … }
```

🔴 **One owner for the decision.** The overlay and the conflict classifier both call `isPaymentAction`, so they can never disagree about what a payment is, and adding a payment action means editing one set.

## 2. Can the banner reach the display ids on BOTH surfaces? — **Yes on both, and I did not assume it**

| | Dashboard | KDS |
|---|---|---|
| Order source | `/api/dashboard` → `data.orders` | 🔴 **the same endpoint, same shape** — `import type { Order } from '@/components/dashboard/types'` |
| Holds `order.id`? | ✅ | ✅ |
| Can resolve `order_key → #id`? | ✅ | ✅ |

⚠️ **But the banner itself cannot** — the op carries only `order_key`, and `OfflineBanner` held no orders. So **the surface resolves the label and passes a resolver down**. That also means each surface answers for itself rather than one guessing on the other's behalf.

**Two honest degradations, both built rather than papered over:**

1. **An order not in this surface's list** (rare; a filtered or not-yet-fetched order) → falls back to the `provisional_id` an offline create was given, which is the number the operator was actually shown. Failing that → **`null`**, and the banner says *"1 order not on this screen"*. 🔴 **It never invents an order number**, because an operator sent hunting for an id that does not exist is worse off than one told plainly that it is not here.
2. ⚠️ **On the KDS, only `visibleOrders` render**, so a conflicted order filtered out of the columns is **named by the banner but carries no card marker there**. Stated in the KDS's own comment at the hook.

## 3. Where does the marker's state come from once the overlay entry is gone? — **the outbox, not the order**

The brief's premise is correct: [useOfflinePaymentOverlay.ts:76](lib/native/useOfflinePaymentOverlay.ts#L76) deletes the entry the instant an op is flagged `conflict`, so by the time a marker renders there is nothing left in the overlay to read.

**The marker reads the outbox in Capacitor Preferences**, polled on its own 5s interval, entirely independent of `/api/dashboard`.

🔴 **Why it survives a poll — three independent reasons, each verified:**

1. A `/api/dashboard` poll calls `setOrders(...)`. **The conflict state is separate React state** fed only by `listUnacknowledgedConflicts()`. Nothing in the poll path touches it.
2. **A conflicted op is never retried and never removed by a drain.** `drainOnce` opens with `const ops = (await listOps()).filter(o => o.state !== 'conflict')` ([orderGate.ts:234](lib/native/orderGate.ts#L234)) — conflicts are skipped entirely, so no amount of reconnecting clears the marker.
3. The 5s Preferences poll returns the **same durable ops** every time, and `sameEntries` keeps the array identity stable so a re-poll cannot even re-render the board.

**Only an explicit acknowledgement clears it.**

---

# 1. 🔴 DISMISS IS NO LONGER DESTRUCTIVE — the most important change

**Dismissing the banner and discarding the record are now two different operations**, and only one of them is reachable from the UI.

```ts
// lib/native/outbox.ts
const ACK_KEY = 'hg_outbox_conflict_ack'   // a SEPARATE key — the op is never mutated, never removed

export async function acknowledgeConflicts(opIds: string[]): Promise<void>   // HIDES. Additive only.
export async function listUnacknowledgedConflicts(): Promise<OutboxOp[]>     // what the UI reads
export async function clearConflicts(): Promise<void>                        // 🔴 DELETES. Zero call sites.
```

⚠️ **Acknowledgement is stored beside the ops, not inside them.** Writing a flag onto the op would mean `saveOp`-ing it, and ops are **frozen when deserialized on-device** (the copy-on-write hazard already recorded in the drain). A separate key makes "acknowledging cannot damage an op" structural rather than careful.

**It prunes.** Every write intersects the ack list with the op_ids that still exist, so the key stays bounded and a re-queued op can never inherit a stale acknowledgement.

## Proof by execution, not by reading

Compiled `outbox.ts` standalone against an in-memory Preferences stub and ran the round trip:

```
conflicts on disk           : p1,s1        (p1 = mark_paid, s1 = ready)
unacknowledged (banner sees): p1,s1

--- operator acknowledges the PAYMENT conflict p1 ---
unacknowledged (banner sees): s1
🔴 conflicts STILL on disk   : p1,s1
   the op itself, intact     : {"op_id":"p1",…,"body":{"action":"mark_paid"},…,"state":"conflict","last_error":"409"}

--- acknowledge the status one too ---
unacknowledged (banner sees): (none)
🔴 conflicts STILL on disk   : p1,s1

--- the ack list PRUNES ---
ack list                    : ["p1","s1","q1"]
ack list after q1 drained   : ["p1","s1"]

--- removePendingStatusOp cannot destroy a conflict ---
removePendingStatusOp(ok-A) : false        (refused — p1 is a conflict)
🔴 conflicts STILL on disk   : p1,s1
```

**After both acknowledgements the ops are byte-identical to before.** The banner is silent; the record is complete.

## The payment acknowledgement — an explicit decision, not "are you sure"

Tapping **Dismiss** on a payment conflict does not dismiss. It opens a panel that **names the orders and states what is kept**:

> **Confirm you have checked #12**
> This hides the warning. The record is kept on this device either way.
> [ **Not yet** ] [ **I've checked #12** ]

🔴 **The confirm button carries the order number**, so the operator cannot complete the gesture without reading which order it was about. Status conflicts keep the lighter single-tap dismissal, as the brief allows.

⚠️ **The open/closed state is DERIVED (`confirming && paymentConflicts.length > 0`), not trusted.** If the last payment conflict were acknowledged on the *other* surface, a leftover `confirming: true` would greet the **next** payment failure already half-confirmed — putting a one-tap dismissal straight back. Deriving it removes the possibility rather than relying on a reset firing.

## 🔴 EVERY REMAINING PATH TO DELETION — stated plainly

| # | Path | Reachable by an operator? |
|---|---|---|
| 1 | `removeOp` after a **successful** drain ([orderGate.ts:254](lib/native/orderGate.ts#L254)) | The op synced. Correct, and it can never hit a conflict — the drain filters them out at line 234 |
| 2 | `clearAllOps()` — the **dev inspector's "Clear"** | ⚠️ **One tap, and it does delete.** But `DevOutboxInspector` is `IS_PROD`-gated and **returns `null` on a production build** — unreachable to an operator. **The only surviving one-tap deletion, and it is not on their build** |
| 3 | `clearConflicts()` | 🔴 **ZERO call sites**, verified by grep. Kept only as a deliberate recovery lever for a poison op, with an unmissable header saying that wiring it to a control re-introduces this defect |
| 4 | `removePendingStatusOp` | **Cannot** — filters `state !== 'conflict'`. Proven false in the harness above |
| 5 | `enqueue` coalescing | **Cannot** — guarded on `prev.state !== 'conflict'`, and only for `kind: 'stock'` |
| 6 | Deleting the app / clearing app data | Outside the software |

✅ **On a production build there is NO path — at any number of taps — by which the UI destroys a payment conflict record.** Acknowledging does not delete; it is not a matter of how many taps.

---

# 2. THE ORDERS ARE NAMED

`nameConflictOrders` is a **pure exported function** rather than a closure inside the banner, specifically so the branches could be **run** instead of eyeballed in a screenshot:

```
one order                          → "#12"
exactly the limit (3)              → "#12, #13, #14"
over the limit (5)                 → "#12, #13, #14 +2 more"
SAME order, two failed ops         → "#12"                              ← named once, not twice
unresolvable, offline create       → "#A13"                             ← the provisional id
unresolvable, no provisional       → "1 order not on this screen"
mixed: 1 named + 2 unresolvable    → "#12 +2 not on this screen"
4 named + 1 unresolvable           → "#12, #13, #14 +1 more +1 not on this screen"
```

⚠️ **One thing the first run got subtly wrong, and I changed rather than accepted:** the mixed case originally rendered `"#12 +2 more"`, folding unresolvable orders into the overflow count. **"+2 more" tells an operator to go looking; "not on this screen" tells them nothing here can point them at it.** They are different facts and now use different suffixes.

---

# 3. THE PER-ORDER MARKER

A strip **inside the card, above the header** — visible without opening, expanding or scrolling anything — plus a card border in the matching colour.

| | Marker |
|---|---|
| **Payment** | `bg-red-700`, `⚠ PAYMENT NOT RECORDED — check before releasing`, plus a 2px red card border |
| **Status** | `bg-amber-500`, `⚠ Last update didn't sync`, amber border |

🔴 **The money copy says what is untrue and what to do.** "Couldn't sync" does not lead an operator to the conclusion that they are owed money; "not recorded — check before releasing" does.

✅ **This is not the pending/syncing distinction returning.** `pendingPayment` is untouched — a QUEUED payment still renders identically to a confirmed one, and the argument for that is still recorded on the prop. This marks a **REJECTED** op, which is a different state and is allowed to look different, because it is.

**Payment wins over status** when one order has both: an order with a failed `ready` *and* a failed `mark_paid` is a money problem first.

---

# VERIFY — the walk

## A payment replay fails while the operator is on another tab

| Step | What they see |
|---|---|
| Offline, tap **Mark paid** on #12 | Green `PAID` chip, buttons gone. **Identical to online** — unchanged by this build |
| They switch to Menu & Stock; reconnect happens | Drain runs. #12's `mark_paid` returns 409 → op flagged `conflict`, `last_error` recorded |
| Still on Menu & Stock | 🔴 **The red `⚠ PAYMENT NOT RECORDED — #12` bar is at the top of THIS tab too.** `OfflineBanner` is mounted at the page root, above the tab content |
| **They return to Orders** | The overlay entry is gone, so #12's chip has reverted to unpaid and the pay buttons are back — **but the card carries a red strip and a red border**, and the banner names #12. 🔴 **The revert is no longer silent, and the order is no longer anonymous** |
| A `/api/dashboard` poll lands | ✅ **The marker stays.** It is read from Preferences, not from the order; and a conflicted op is skipped by every drain, so nothing removes it |
| They tap **Dismiss** | ⚠️ **Nothing is dismissed.** A panel opens: *"Confirm you have checked #12 — this hides the warning. The record is kept on this device either way."* |
| They tap **"I've checked #12"** | Banner clears **and the card strip clears in the same render** — one source drives both. 🔴 **The op is still in the outbox**, `state: 'conflict'`, `last_error` intact |

## A status replay fails

| Step | What they see |
|---|---|
| Offline, tap **Ready** on #14 | Card advances. Unchanged |
| Reconnect; the op 409s | Amber `⚠ Last update didn't sync` strip on #14's card; **red bar naming `#14 — update didn't sync, needs review`** |
| They tap **Dismiss** | ✅ **Single tap, as the brief allows** — a failed `ready` costs a re-tap, not money. **It still only acknowledges; the op survives** |

## 🔴 GUSTO — verified by tracing every producer, not assumed

They are `show_paid_step: false`. **The brief's expectation is correct, and here is the evidence:**

| Producer of a payment action | Gusto |
|---|---|
| `completionBtn()` primary action | `if (!showPaidStep) return <Btn label="Paid & collected" … 'collected' />` — 🔴 **an early return before any payment branch** |
| Cash / Card split (`mark_paid_cash`, `mark_paid_card`) | **Below that return — unreachable** |
| `Mark paid` / `Mark £X.XX paid` (`mark_paid`) | **Below that return — unreachable** |
| The tappable paid chip → `undo_mark_paid` | `paidChipStatic = !showPaidStep ? null` — **never renders**, so the confirm never renders |
| Dashboard `:1636` `mark_paid` toast | Reacts to an action already dispatched; **nothing dispatches one** |

✅ **No payment op can be enqueued on their truck**, so `isPaymentAction` is never true for any op of theirs → **the payment banner and the payment card marker are unreachable for Gusto**. Only the status path applies.

**What DOES change on their live path** — two things, both improvements to the bar they already had:

1. Their conflict bar now says **`⚠ #12 — update didn't sync, needs review`** instead of *"1 order couldn't sync"*.
2. **Their Dismiss no longer deletes the op.** It acknowledges it. Same single tap, same result on screen, but the record survives.

⚠️ **Nothing else on their path moves.** Their button is still `Paid & collected` firing `collected`, a status action already in `OFFLINE_STATUS_MAP`.

## Build

```
$ npx tsc --noEmit
TSC EXIT: 0
```

| File | Baseline | Now | |
|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 68 err, 25 warn | **68, 25** | ✅ |
| `app/dashboard/[token]/kds/page.tsx` | 14 err, 2 warn | **14, 2** | ✅ |
| `components/dashboard/OrderCard.tsx` | 2 err, 4 warn | **2, 4** | ✅ |
| `components/native/OfflineBanner.tsx` | 3 err, 0 warn | **3, 0** | ✅ |
| `lib/native/orderGate.ts` | 3 err, 0 warn | **3, 0** | ✅ |
| `lib/native/outbox.ts` | clean | **clean** | ✅ |
| `lib/native/useOutboxConflicts.ts` | *(new)* | **clean** | ✅ |

⚠️ **I substantially rewrote `OfflineBanner.tsx`, so a matching COUNT is not sufficient evidence.** I compared the **rules**, per file, via a stashed baseline — before and after are the same three (`react-hooks/immutability`, `react-hooks/refs`, `react-hooks/set-state-in-effect`), one each. **The whole diff across all seven files is one added line: the new module, clean.**

### Files changed

`lib/native/useOutboxConflicts.ts` **(new)** · `lib/native/outbox.ts` · `lib/native/orderGate.ts` · `components/native/OfflineBanner.tsx` · `components/dashboard/OrderCard.tsx` · `app/dashboard/[token]/page.tsx` · `app/dashboard/[token]/kds/page.tsx`

### ⚠️ Still true, and NOT addressed here

- **No retry, by instruction.** A failed replay stays failed; the drain skips conflict ops permanently. The operator knowing is the whole deliverable.
- **The dev inspector's one-tap "Clear" still deletes everything** — `IS_PROD`-gated, so not on an operator's build, but it is the one remaining one-tap deletion in the codebase.
- ⚠️ **The KDS marks only orders it renders.** A conflicted order filtered out of its columns is named by the banner and nowhere else on that surface.
- **The KDS still shows no payment state at all** (no `ledgerRows`, no `pendingPayment`) — pre-existing, out of scope, and unchanged.
- **The sequence from the previous report still ends the same way**: `mark_paid` 409s but `undo_mark_paid` succeeds → no charge, no error on the undo. It is now **named on the card and in the banner** instead of being a countless bar, which was the gap. The ledger outcome is unchanged.
