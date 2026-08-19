# Extracting the reject path — a pure refactor

**Done. No behaviour change, and I can prove that rather than assert it.**

- 🔴 **The moved body reconstructs the original branch BYTE-FOR-BYTE** — 6,680 bytes — once the four named
  plumbing substitutions are reversed. **48 statement lines before, 48 after, identical.**
- 🔴 **The route file is `pre` + exactly four edits and nothing else**, proven by rebuilding it from the
  pre-change copy and byte-comparing. **So "no other action branch changed" is not a claim, it is a
  reconstruction.**
- ✅ **`source` was NOT widened.** The extracted function takes `ActorSource` exactly as it is today.
- ✅ **No caller was added.** Nothing calls `rejectOrder` but the route.

⚠️ **THREE THINGS I DID THAT YOU DID NOT ASK FOR, EACH NAMED WITH ITS REASON, in §Unrequested below.** All
three are structural consequences of the move, not tidying.

**All four established facts re-read and TRUE.** Nothing to stop for.

---

# PHASE 1 · READ-ONLY FINDINGS

## 1 · The branch as it stood

**READ — `app/api/dashboard/action/route.ts`, 86 lines, quoted whole (this is the text the proof in
Phase 4 compares against):**

```tsx
    if (action === 'reject') {
      const { rejectionReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // ── 🔴 WHAT THE MONEY WAS DOING, ASKED BEFORE ANYTHING MOVES. ────────────────────────────────
      // THE SAME ORDERING THE CANCEL BRANCH BELOW ESTABLISHES, AND FOR THE IDENTICAL REASON: releasing
      // stamps `authorization_cancelled_at`, after which the resolver answers 'hatch' — "Pay at the
      // truck on collection" — about an order the truck has just refused to cook. One read, one answer,
      // used by the email at the bottom of this branch.
      const rejectPaymentState = await resolveEmailPaymentState(supabase, orderKey)
      // Dedicated rejection_reason column (NOT cancellation_reason — a rejected order isn't cancelled).
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      // ── 🔴 THE ORDER IS REJECTED FIRST, AND THE HOLD IS RELEASED AFTER — CANCEL'S ORDERING. ─────
      // … (the four-paragraph release rationale) …
      const rejectRelease = await releaseHoldForTerminalOrder(supabase, {
        orderKey, truckId: truck.id, trigger: 'operator_reject', actor, source: actorSource,
      })
      // 🔴 THE REJECTION STANDS EITHER WAY, BUT A FAILED RELEASE IS NOT SILENT. …
      if (rejectRelease.status === 'released') {
        console.log(`[reject] hold released pi=${rejectRelease.paymentIntentId} order_key=${orderKey} (operator)`)
      } else if (rejectRelease.status === 'failed' || rejectRelease.status === 'captured') {
        console.error( … )
      }
      if (order.event_date) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) {
        const reasonLine = rejectionReason ? `<p style="color:#475569">Reason: ${escapeHtml(rejectionReason)}</p>` : ''
        const rejectMoney = rejectionPaymentSentence({ truckName: truck.name, paymentState: rejectPaymentState,
          holdReleased: rejectRelease.status === 'released' || (rejectRelease.status === 'none' && rejectRelease.reason === 'already_released') })
        await notifyCustomer(truck, order.customer_email, `Order #${order.id} update`, ` … html … `, ` … text twin … `)
      }
      return NextResponse.json({ success: true, status: 'rejected', hold_release: rejectRelease.status })
    }
```

⚠️ **The elisions above are comment paragraphs and the two email strings only.** The **complete, unelided**
text is what the byte proof in Phase 4 uses; nothing in it was summarised for that comparison.

## 2 · Every identifier defined outside the branch

| Identifier | Where from | Verdict |
|---|---|---|
| `supabase` | module-level, `@/lib/supabase` | **Parameter.** The extracted function takes the client, and the route passes the same instance |
| `orderKey` | the handler, from `body` | **Parameter** |
| `truck` | the handler, from token + PIN auth | **Parameter.** Only `.id` and `.name` are read |
| `actor` | `resolveActorSafe(req, …)` — **request-scoped** | **Parameter** |
| `actorSource` | `resolveActorSource(req, body)` — **request-scoped** | **Parameter**, named `source` |
| `body.rejectionReason` | the request body | **Parameter** |
| `resolveEmailPaymentState` | `@/lib/payments/email-payment-state` | ✅ **Importable** |
| `releaseHoldForTerminalOrder` | `@/lib/payments/release-hold` | ✅ **Importable** |
| `buildItemCatMap`, `removeOrderFromProductionSlot`, `normaliseOrderLines` | `@/lib/slot-bookings` | ✅ **Importable** |
| `rejectionPaymentSentence` | `@/lib/email` | ✅ **Importable** |
| `escapeHtml` | 🔴 **route-local** | **MOVES.** Its only caller is this branch — `grep` finds one use, at the reject `reasonLine` |
| `notifyCustomer` | 🔴 **route-local** | **MOVES. Two callers — reject AND cancel.** §3 |
| `NextResponse` | `next/server` | ❌ **Stays in the route.** The function returns a value |

## 3 · 🔴 `notifyCustomer` — it cannot be reached from a shared module without moving. Two files.

**READ, in full:**

```tsx
// Raw Brevo sender for the reject/cancel notices. Takes the TRUCK (not just its name) so it shares the
// demo guard above — passing only truckName would have left these two sites unguarded.
async function notifyCustomer(
  truck: { id?: string | null; name?: string | null } | null | undefined,
  email: string, subject: string, html: string,
  /** ⚠️ OPTIONAL, AND ABSENT MEANS EXACTLY TODAY'S BEHAVIOUR. … */
  text?: string,
) {
  const truckName = truck?.name ?? undefined
  if (isDemoIdentifier(truck?.id)) {
    console.log(`[dashboard/action] demo truck ${truck?.id} — email to ${email} suppressed`)
    return
  }
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey || !email) return
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', { … })
  } catch (err) { console.error('Email failed:', err) }
}
```

**What it depends on:** `isDemoIdentifier` (`@/lib/demo`, **importable**), `process.env.BREVO_API_KEY` and
`EMAIL_FROM_ADDRESS`, and global `fetch`. ✅ **It closes over NOTHING route-local** — no `req`, no `body`,
no `truck` from the handler scope. **So it moves verbatim.**

🔴 **AND IT MUST MOVE, BECAUSE IT HAS TWO CALLERS:** `grep -n "notifyCustomer("` gives the definition plus
**reject (`:380`)** and **cancel (`:457`)**. With reject in a module and cancel in the route, a route-local
definition would force either **a second copy of a sender that carries the demo guard** — which the guard's
own comment says must never happen (*"eight chances to miss one — and a missed one is invisible until the
bounce rate moves"*) — or a route importing its own internals back out of a reject module.

✅ **THE STOP CONDITION DOES NOT TRIP. Moving it alters no other branch's email.** The body is unchanged
(byte-proven in Phase 4), the cancel call site is not touched, and only the definition's home changed.

## 4 · Where it should live — following an existing example, not a new convention

🔴 **THE PRECEDENT IS `lib/payments/release-hold.ts`, and it was created for this exact reason.** READ, its
header:

> *"The cancel handler updated `status`, unbooked the slot and emailed, and never touched Stripe… **it
> imports no capture and no refund** …"* — and it exists because **two call sites** (operator cancel and
> customer cancel) needed one implementation of a money step. **`lib/orders/` already holds the same kind
> of thing:** `place-in-slot.ts` and `mergeOrders.ts` — order-lifecycle logic pulled out of the routes that
> call it.

✅ **So: `lib/orders/reject-order.ts`.** Order lifecycle, not payments — it *calls* the payment module
rather than being one. **`notifyCustomer` goes to `lib/email.ts`**, beside `sendConfirmationEmail`, which is
what it parallels and where the module's job already is email transport. ⚠️ **`lib/demo` imports nothing**,
so the new edge `lib/email → lib/demo` cannot cycle. **Checked, not assumed.**

## 5 · The return type — so the route derives nothing

```ts
export type RejectOutcome =
  | { ok: false; reason: 'order_not_found' }
  | { ok: true; status: 'rejected'; holdRelease: 'released' | 'none' | 'captured' | 'failed' }
```

**The route's two responses map one-to-one and compute nothing:**

| Today | Now |
|---|---|
| `if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })` | `if (!rejected.ok) return NextResponse.json({ error: 'Order not found' }, { status: 404 })` |
| `…{ success: true, status: 'rejected', hold_release: rejectRelease.status }` | `…{ success: true, status: 'rejected', hold_release: rejected.holdRelease }` |

⚠️ **`holdRelease` is `ReleaseOutcome['status']` spelled out** rather than imported, so the module's public
type does not re-export a payment type. **The four members are exactly that union's members.**

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| Cannot be done without changing observable behaviour | ❌ **Not tripped** — byte-proven in Phase 4 |
| Requires moving `notifyCustomer` **and** that alters another branch's emails | ⚠️ **It requires the move; it does NOT alter them.** Body verbatim, cancel's call site untouched |
| Requires widening `source` | ❌ **Not tripped.** `ActorSource` is used exactly as-is |
| Instructions contradict | ❌ No |
| Garbled span | ❌ None |

---

# PHASE 3 · WHAT WAS DONE

**Three files. `lib/orders/reject-order.ts` is new; the other two lost code or gained an import.**

**The four plumbing substitutions — the complete list, and the only edits inside the moved body:**

| # | Before | After | Why |
|---|---|---|---|
| 1 | `const { rejectionReason } = body` | `const { orderKey, truck, rejectionReason, actor, source } = args` | Request-scoped values become arguments |
| 2 | `return NextResponse.json({ error: 'Order not found' }, { status: 404 })` | `return { ok: false, reason: 'order_not_found' }` | A value, not an HTTP response |
| 3 | `return NextResponse.json({ success: true, … })` | `return { ok: true, status: 'rejected', holdRelease: … }` | Same |
| 4 | `source: actorSource` | `source` | The parameter is named `source`; shorthand |

✅ **Nothing else in the body was touched** — not a statement, not an argument, not a comment, not a
string. ✅ **The ordering comment travelled with its statement:** *"WHAT THE MONEY WAS DOING, ASKED BEFORE
ANYTHING MOVES"* sits immediately above `resolveEmailPaymentState`, which is still the first thing the
function does.

**The route's branch is now:**

```tsx
    if (action === 'reject') {
      // ⚠️ THE LOGIC MOVED, THE ANSWER DID NOT. Both responses below are the ones this branch already
      // returned, built from the outcome without re-deriving anything.
      const { rejectionReason } = body
      const rejected = await rejectOrder(supabase, {
        orderKey, truck, rejectionReason, actor, source: actorSource,
      })
      if (!rejected.ok) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // ⚠️ ADDITIVE FIELD. `success` and `status` are unchanged and mean exactly what they meant; …
      return NextResponse.json({ success: true, status: 'rejected', hold_release: rejected.holdRelease })
    }
```

## Unrequested changes, named as instructed

1. **`escapeHtml` moved out of the route entirely** rather than staying and being imported. **Reason: its
   only caller is the reject branch** (one `grep` hit), so leaving it would have left dead code in the
   route. ⚠️ **Its comment moved with it**, including the note that the cancel email does not escape today —
   that note is still true and still worth carrying.
2. **`notifyCustomer` landed in `lib/email.ts`, not in `lib/orders/reject-order.ts`.** **Reason: the cancel
   branch still needs it**, and a route importing an email sender out of a *reject* module is a coupling
   that would read as an accident. `lib/email` is where the sibling sender already lives.
3. **`rejectionPaymentSentence` was dropped from the route's `@/lib/email` import** and `notifyCustomer`
   added in its place. **Reason: mechanical** — the route no longer calls the first and now calls the
   second. **No other name in that import changed.**

---

# PHASE 4 · VERIFICATION

## 🔴 The proof that the body is the same statements

**Method.** The pre-change branch was captured to a file **before any edit**. The extracted function's body
is then read back out of `lib/orders/reject-order.ts`, the **four named substitutions are reversed**, the
indentation and the `if (action === 'reject') {` wrapper are restored, and the result is compared to the
captured original **as bytes**.

```
RECONSTRUCTED == ORIGINAL BRANCH (bytes): True   bytes=6680
statement lines: original=48 reconstructed=48  identical=True
```

✅ **NO STATEMENT WAS ADDED, REMOVED OR REORDERED.** A reordering would fail the byte comparison, and an
added or dropped statement would fail the 48-line census. **Both pass.**

## 🔴 The proof that nothing else in the route changed

Rather than diffing and reading, the route was **rebuilt**: the pre-change copy plus exactly the four edits
(cut `escapeHtml`, cut `notifyCustomer`, swap the two import lines, replace the branch), then byte-compared
against the file on disk.

```
ROUTE: pre + exactly the 4 named edits == current file (bytes): True
```

✅ **THAT IS STRONGER THAN "NO OTHER BRANCH CHANGED".** Any character anywhere else — in confirm, cancel,
ready, collected, time-adjust, manual, bulk-update or any helper — would have broken the equality. **This
is how I established it; I did not read the branches and judge them unchanged.**

## `notifyCustomer` moved verbatim

```
notifyCustomer present in lib/email.ts VERBATIM (only `export ` added): True
old definition gone from the route: True
escapeHtml gone from the route: True
cancel branch still calls notifyCustomer: True   (exactly one `await notifyCustomer(` remains)
```

## Executable line counts, per file

| File | Before | After | − | + |
|---|---|---|---|---|
| `app/api/dashboard/action/route.ts` | 1518 | 1448 | 77 | 7 |
| `lib/email.ts` | 594 | 623 | 0 | 29 |
| `lib/orders/reject-order.ts` | — | **new** | — | the moved body + signature |

⚠️ **77 removed / 7 added on the route is the shape a pure extraction should have**: the branch and the two
helpers leave, a call and an import arrive. **The 29 added to `lib/email.ts` are `notifyCustomer` and its
`isDemoIdentifier` import — the same 28 lines the route lost, plus the import.**

## What a reject request now does, end to end

**READ-FROM-SOURCE. Nothing was exercised; no request was made and no email sent.**

1. The route authenticates the truck (token + PIN), resolves `actor` and `actorSource` — **unchanged**.
2. The `expected_from` replay guard runs — **unchanged, and still ahead of every branch**.
3. `if (action === 'reject')` reads `rejectionReason` from the body and calls `rejectOrder(supabase, …)`.
4. Inside, in this order — **the same order as before, byte-proven**:
   **(a)** read the order by `order_key` + `truck_id`; **(b)** `resolveEmailPaymentState` — **before any
   mutation**; **(c)** `update({ status: 'rejected', rejection_reason })`; **(d)**
   `releaseHoldForTerminalOrder(… trigger: 'operator_reject' …)`; **(e)** log the release outcome —
   `console.log` on released, `console.error` on failed/captured; **(f)** unbook the slot when
   `order.event_date`; **(g)** email the customer when `order.customer_email`, with
   `rejectionPaymentSentence` and its text twin.
5. The route returns **404** when the order was not found, else
   `{ success: true, status: 'rejected', hold_release }`.

✅ **Every side effect still happens, in the same order, with the same conditions.**

## Marking

| Claim | Status |
|---|---|
| Body identical to the original branch | ✅ **EXECUTED** — byte comparison against a pre-edit capture |
| Route changed in exactly four places | ✅ **EXECUTED** — whole-file reconstruction, byte-compared |
| `notifyCustomer` verbatim; helpers gone from the route | ✅ **EXECUTED** — substring checks |
| Line counts | ✅ **EXECUTED** — comment-stripped comparison |
| `escapeHtml` had one caller; `notifyCustomer` two | ✅ **READ** — grep |
| `lib/demo` imports nothing, so no cycle | ✅ **READ** |
| **What a request actually does at runtime** | ⚠️ **READ-FROM-SOURCE and UNOBSERVED.** No request was made, no email sent, nothing exercised against Stripe |
| `tsc --noEmit` passes | ⚠️ **A breakage check, NOT verification.** Offered as neither |

**Surfaces:** one operator route, one new order-lifecycle module, one shared email module. **The customer
surfaces were not touched** and are not claimed on.

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the three source files
and this report.** The result, the non-ASCII census of characters introduced, and the carrier-aware
variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
