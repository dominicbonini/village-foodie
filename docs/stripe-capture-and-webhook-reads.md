# Stripe — four closing reads

**READ-ONLY. Nothing changed** except this report. No type widened, no call site added, no migration
proposed, no build run.

**All four CANNOT DETERMINEs are now closed.** Headline answers:

| # | Question | Answer |
|---|---|---|
| 1 | Captured without operator confirmation? | 🔴 **NO** — every capture site is gated on a confirmation |
| 2 | Any webhook releases an authorisation? | 🔴 **NO** — so a new release call **CANNOT double-release** |
| 3 | Can the purge orphan a live hold? | ✅ **NO** — guarded twice. **Reject is not an instance of a wider problem** |
| 4 | Customer page on reject? | 🔴 **No `rejected` branch at all**, and nothing about payment |

---

## 1 · When is a payment captured?

**Five call sites. READ** — from `grep -rn "captureOnConfirmation(" app lib`, which the code itself names
as the authoritative list: *"there is no shared choke point below the fork; `grep -rn
"captureOnConfirmation(" app lib` is the whole list."*

| # | Site | Trigger | Gating condition | Reachable? |
|---|---|---|---|---|
| 1 | `orders/submit:1103` | `'auto_accept'` | `if (autoAccepted) {` | ✅ Yes |
| 2 | `promote-draft:385` | `'promote_auto_accept'` | `if (autoAccepted) {` | ✅ Yes |
| 3 | `dashboard/action:259` | `'confirm'` | operator taps Confirm | ✅ Yes |
| 4 | `dashboard/action:2020` | `'time_adjust'` | quick-time-adjust, offered on **pending only**, writes `status: 'confirmed'` unconditionally | ✅ Yes |
| 5 | `stranded-authorisations:165` | `'stranded_sweep'` | rows from `find_stranded_authorisations` | ✅ Yes |

**The trigger union is closed and matches exactly. READ:**

```ts
    trigger: 'auto_accept' | 'promote_auto_accept' | 'confirm' | 'time_adjust' | 'stranded_sweep'
```

### Reachability — checked per the brief's warning, and all five are live

🔴 **No capture call sits below a `return`.** I read `captureOnConfirmation`'s body from its signature to
the Stripe call at `:274`. The seven `return`s between are **guard clauses inside one `try`**, each an
early exit on a specific state — draft read failed, no intent, already cancelled, already captured, balance
unavailable, not owed, no Stripe account — after which execution reaches
`await stripe.paymentIntents.capture(`. **READ.**

**Site 4's condition, quoted, because "time adjust" does not sound like a confirmation:**

```ts
      // ── 🔴 CAPTURE SITE 3 of 4: QUICK-TIME-ADJUST, WHICH IS A CONFIRMATION IN DISGUISE. ─────────
      // The line above writes `status: 'confirmed'` UNCONDITIONALLY alongside the new slot, and the
      // control is offered on PENDING orders only — so pressing "+10m" confirms the order.
```

⚠️ **Its comment numbers the sites "3 of 4" while there are five.** The count predates the stranded sweep.
**Stale comment, not a stale code path** — the sweep is real and reachable. **READ.**

### 🔴 Is a payment EVER captured for an order the operator has not confirmed? — **NO**

**Settled by the gate on each site. READ:**

- **Sites 1 and 2** are both `if (autoAccepted)`. `autoAccepted` is what sets `status = 'confirmed'` at
  creation — the truck's standing instruction to accept. The submit path states the consequence
  explicitly:

```ts
    // 🔴 GATED ON `autoAccepted`, WHICH IS THE CONFIRMATION. An order that auto-accept declined is
    // `pending` and stays UNCAPTURED, exactly like any other pending order — it captures when a human
    // confirms it, at site 2 or 3.
```

- **Sites 3 and 4** are operator actions that write `status: 'confirmed'`.
- **Site 5** draws only from `find_stranded_authorisations`, whose allow-list is
  `o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')` — **every member is a
  post-confirmation status.** A `pending` order cannot appear, and the migration says why: *"a pending
  order's hold is correct."*

⚠️ **One nuance worth stating rather than glossing:** an auto-accepted order is confirmed *by policy*, not
by a human tap. **If "confirmed by the operator" means a human pressing Confirm, then sites 1 and 2 capture
without one** — but the order is `confirmed`, not `pending`, so it is not an unconfirmed order. **On the
reading that matters for holds — is a PENDING order ever captured? — the answer is an unqualified NO.**

## 2 · The webhook dispatch

**`app/api/webhooks/stripe/route.ts`, 887 lines. READ** — dispatch located by grepping every
`eventType === '…'`, then each branch read.

| Event type | Line | What it writes |
|---|---|---|
| `account.updated` | 316 | Connect account state — `charges_enabled` on the operator row |
| `payment_intent.amount_capturable_updated` | 410 | **the authorisation landing** |
| `payment_intent.succeeded` | 448 | **the charge into `order_payments`** — *"THE ONLY WRITER OF AN ONLINE PAYMENT INTO order_payments"* |
| `charge.refunded` / `refund.created` / `refund.updated` / `refund.failed` | 588, 601 | refund records |

### 🔴 Does any webhook release, void or cancel an authorisation? — **NO**

**INFERRED FROM ABSENCE, AND I NAME THE SEARCHES.** I grepped the file for
`paymentIntents.cancel`, `authorization_cancelled_at`, and `cancel|canceled|cancelled`
(case-insensitive). **There is no `payment_intent.canceled` handler and no call that voids a hold.** The
only `canceled` hits are about **refund** status:

```ts
      // ⚠️ `canceled` IS THE SAME TERMINAL SHAPE and is handled here for the same reason. Stripe:
      // "Canceled refunds transition to a `canceled` status. …
      if (status === 'failed' || status === 'canceled') {
```

**Could any fire for a REJECTED order?** `payment_intent.amount_capturable_updated` fires at
authorisation — **before** any reject. The others require a capture or refund that a rejected order never
had. **INFERRED** from the event semantics.

### 🔴 SAID EXPLICITLY, AS ASKED: a new release call could NOT double-release

**Nothing in the webhook layer cancels an authorisation, so there is no second releaser to race.** And the
release function is idempotent on its own account — `if (draft.authorization_cancelled_at) return { status:
'none', reason: 'already_released' }`. **Two independent reasons. READ.**

## 3 · `purge_order_drafts()` — it cannot orphan a hold

**Full predicate. READ:**

```sql
  delete from order_drafts
   where promoted_at is null
     and expires_at < now()
     -- Never delete a row that may still be holding a customer's money (20260813).
     and (payment_intent_id is null or authorization_cancelled_at is not null);
```

🔴 **NO — it cannot delete a row carrying a live intent with no `authorization_cancelled_at`.** The third
clause exists precisely to prevent it, and says so.

⚠️ **A rejected order's draft is excluded TWICE OVER:** it also fails `promoted_at is null`, because a
draft that became an order has been promoted. **The migration's header states the same invariant from the
other side:** *"Widening this delete to promoted rows would make every held order read 'collect at the
hatch' again."*

✅ **So reject is NOT one instance of a wider orphaning problem via the purge.** The purge is careful.
**The reject gap stands alone** — which narrows the fix rather than widening it.

## 4 · The customer order-status page on `rejected`

🔴 **THERE IS NO `rejected` BRANCH. It falls through a status ladder to a generic sentence. READ** —
`app/order/[id]/manage/page.tsx`:

```tsx
  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    if (!order.allow_cancellation) return 'Cancellations are not accepted for this order.'
    // Any remaining status (rejected, or one added later) is genuinely past cancelling. Same wording as
    // the server's 409 for the same case, so the two layers cannot say different things.
    return 'This order can no longer be cancelled.'
  }
```

**A rejected order shows: _"This order can no longer be cancelled."_**

🔴 **It says NOTHING about payment** — no hold, no refund, no reassurance. ⚠️ **And it does not even say
the order was rejected**; it answers a question about cancellation that the customer did not ask.

⚠️ **This is the CUSTOMER surface, read as such.** The operator-side rejection email (a different surface,
established previously) also says nothing about payment. **Both are silent, independently.**

## 5 · Is `releaseHoldForCancelledOrder` cancellation-specific?

**Structurally NO — it resolves a hold generally. But its OUTPUT is cancellation-specific in three places
that would produce false records for a reject caller. READ.**

**Generic (would serve a reject caller unchanged):** fetch the draft by `order_key`; bail on no
draft / no intent / already cancelled; refuse if the ledger shows a capture; refuse on a ledger read
failure; call `releaseHold`. **None of that references cancellation.**

**Cancel-specific — the audit trail and the log line:**

```ts
        afterState: {
          released: false,
          meaning: 'the order was cancelled and its card authorisation was NOT released; the hold may still be live',
          resolves: 'cancel_this_intent_by_hand_or_let_it_expire',
        },
```
```ts
      afterState: { released: true, meaning: 'the order was cancelled and the card authorisation was released; no money moved' },
```
```ts
        `[release-hold] 🔴 COULD NOT RELEASE pi=${draft.payment_intent_id} for cancelled order_key=` +
        `${args.orderKey} (${args.trigger}). The order IS cancelled and a hold may remain on this ` +
```

⚠️ **A reject caller would write `'the order was cancelled'` into `action_audit_log` for an order that was
REJECTED** — and that log is the designated recovery record for a stranded hold, with a documented query
against it. **Wrong provenance in the one place somebody looks during an incident.**

⚠️ **Also cancel-shaped:** the function name, the `trigger` union, and the comment *"THE CANCELLATION IS
NOT UNDONE"* on the failure path — reasoning that is still true for a reject but is argued about the wrong
action.

🔴 **ANSWERING THE QUESTION DIRECTLY: it can serve a reject caller unchanged MECHANICALLY — the money logic
is action-agnostic — but doing so would drag cancel-specific WORDING into the audit trail.** Nothing
harmful executes; the harm is that the record would lie about which action stranded the hold. **Reported,
not acted on.**

---

## Marking summary

| Claim | Status |
|---|---|
| Five capture sites, their triggers and conditions | ✅ **READ** |
| All five reachable; no capture below a `return` | ✅ **READ** — body traced signature → `:274` |
| No `pending` order is ever captured | ✅ **READ** — every gate quoted |
| The webhook's four handled event families | ✅ **READ** |
| No webhook releases/voids an authorisation | ⚠️ **INFERRED FROM ABSENCE** — searched `paymentIntents.cancel`, `authorization_cancelled_at`, `cancel\|canceled\|cancelled` |
| A new release call cannot double-release | ✅ **READ** (idempotency guard) + INFERRED (webhook absence) |
| The purge cannot orphan a live hold | ✅ **READ** — predicate quoted |
| The customer page has no `rejected` branch | ✅ **READ** — customer surface |
| The release function's cancel-specific wording | ✅ **READ** |
| Whether an auto-accepted order counts as "operator-confirmed" | ⚠️ **A definitional point, flagged rather than decided** |

**Surfaces:** §4 is the **customer** page. §1 sites 3–4 and §5 are the **operator** path. §1 sites 1–2 are
the **customer submit** and **draft promotion** paths. I have not generalised between them.

**No instruction contradicted another, and no span arrived garbled.**

---

## Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes.** Counts, the non-ASCII census and the
per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
