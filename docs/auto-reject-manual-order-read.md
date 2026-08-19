# Can the auto-reject sweep claim a MANUAL order?

**READ ONLY. Nothing changed except this file.** No fix, no SQL, no change to the claim function.
`next dev` / `next build` were not run.

# 🔴 THE ANSWER: **NO.**

**A manual order can never be `status = 'pending'`, so the sweep cannot claim one — marker live or not.**

**The single line that settles it. READ — `app/api/dashboard/action/route.ts`, the `action === 'manual'`
insert payload:**

```ts
          notes: notes || null, status: 'confirmed',
```

🔴 **A LITERAL, NOT A CONDITIONAL.** Every other order-creating path in this codebase writes
`autoAccepted ? 'confirmed' : 'pending'`. **The manual path has no ternary, no `autoAccepted`, and reads
no setting** — an operator-entered order is confirmed by the act of an operator entering it.

⚠️ **THE ANSWER DOES NOT DEPEND ON `o.source` AT ALL**, which is worth saying because the question was
framed around the missing `source` filter. **The `status = 'pending'` predicate already excludes manual
orders by construction.** Adding `and o.source <> 'manual'` would be belt-and-braces over a hole that is
not open — ⚠️ **and I am reporting that, not recommending it.**

---

## 1 · Every path that creates an order, and the status each writes

**Three creators. Searched with `grep -rn "status: 'pending'\|: 'pending'"` over `app lib`, and
`grep -rn "source: 'manual'"`.**

| # | Path | Identifier | Status expression | Source |
|---|---|---|---|---|
| 1 | `app/api/dashboard/action/route.ts` | `action === 'manual'` | 🔴 **`status: 'confirmed'`** — a literal | **`source: 'manual'`**, written explicitly |
| 2 | `app/api/orders/submit/route.ts` | the customer submit → `place_order_atomic` | `const status = autoAccepted ? 'confirmed' : 'pending'` | ⚠️ not written — the column default |
| 3 | `lib/payments/promote-draft.ts` | the card draft promotion (webhook) | `status: autoAccepted ? 'confirmed' : 'pending'` | ⚠️ not written — the column default |

**Path 1, in full — READ:**

```ts
          capacity_ack_at: manualOrder?.capacityAcknowledged === true ? new Date().toISOString() : null,
          notes: notes || null, status: 'confirmed',
          // WHICH ROUTE THIS ROW TOOK. Written explicitly rather than left to the column default, which
          // is what made `source` useless: every row read 'web' whatever created it.
          // orders_source_check  CHECK (source = ANY (ARRAY['web', 'manual', 'whatsapp']))
          // 'manual' is in that list and is honest -- these are operator-created orders, placed at the
          // hatch or replayed from this device's outbox. …
          source: 'manual',
          payment_status: 'unpaid',
```

**Path 2 — READ:**

```ts
      const status = autoAccepted ? 'confirmed' : 'pending'
```

**Path 3 — READ:**

```ts
          status:         autoAccepted ? 'confirmed' : 'pending',
```

✅ **Only paths 2 and 3 can produce `pending`, and both are CUSTOMER paths.**

### And no later transition writes `pending` either

**From the twelve `orders.status` write sites enumerated in `docs/order-status-race-read.md` and re-checked
here, the values written are:** `confirmed` (confirm, unready, time-adjust), `cancelled` (operator,
customer, event bulk), `ready`, `cooking`, `collected`, `modified` (edit), `rejected`, and
`revertTo` (undo_collected). ❌ **`'pending'` is not among them as a literal.**

⚠️ **`undo_collected` IS THE ONE THAT COULD IN PRINCIPLE RESTORE IT, so it is checked rather than waved
past. READ:**

```ts
      const fromStatus = order?.status && order.status !== 'collected' ? order.status : null
…
      const revertTo = order?.status_before_collected || 'confirmed'
```

**`revertTo` can only be `'pending'` if the order was `'pending'` when it was collected.** A manual order
is created `'confirmed'` and nothing moves it backwards to `'pending'`, so its `status_before_collected`
can never hold that value. ⚠️ **INFERRED, by induction over the write sites** — the READ facts are the
hardcoded `'confirmed'` and the enumerated writers. **A customer order collected straight from `pending`
WOULD revert to `pending`; that order is not manual.**

## 2 · Does the marker influence a manual order's status? — **NO. It is read on ONE path.**

**Every reader of `offline_no_autoaccept_until`, from
`grep -rn "offline_no_autoaccept_until" app lib supabase`:**

| Reader | What it does |
|---|---|
| `app/api/orders/submit/route.ts` | 🔴 **the only status decision** |
| `supabase/functions/heartbeat-monitor` | its own "already acted" skip |
| `app/api/heartbeat/route.ts` | nulls it on the van's next ping |
| `app/api/dashboard/action/route.ts:2565` | nulls it when protection is switched off |

**The one status use. READ:**

```ts
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

🔴 **THAT BLOCK IS INSIDE `app/api/orders/submit/route.ts` AND NOWHERE ELSE.** The manual branch does not
read the marker, does not import it, and does not select it — **the `manual` insert has no `autoAccepted`
variable at all.**

⚠️ **AND A SEPARATE FINDING THE SEARCH TURNED UP, reported because it is the same question asked of a
different path: `lib/payments/promote-draft.ts` DOES NOT READ THE MARKER EITHER.** Its `autoAccepted` is
`truck.auto_accept && allItemsAutoAccept && !(notesRequireReview && orderHasNotes)` — **no offline term.**
**So a CARD order promoted by the webhook while the van is offline still auto-confirms.** ⚠️ **That is
outside the question asked and I am not chasing it**, but it means the marker does not do for the card
path what it does for pay-at-hatch. **INFERRED FROM ABSENCE**, and the search is named above.

## 3 · An offline-replayed manual order

✅ **It lands `'confirmed'`, and the marker is not consulted at replay time.**

**READ:** the outbox replays a `kind: 'create'` op as the **same** `action: 'manual'` request to the same
route — `lib/native/orderGate.ts` stamps the provisional inside `queuedBody.manualOrder` and changes
nothing else about the body. **There is no separate replay handler**, so the replay executes the identical
insert quoted in §1, including the literal `status: 'confirmed'`.

🔴 **AND THE ONE GUARD THAT COULD HAVE INTERVENED EXPLICITLY EXCLUDES IT. READ:**

```ts
    if (Array.isArray(body.expected_from) && orderKey && action !== 'manual') {
```

⚠️ **`action !== 'manual'`** — the replay conflict guard skips manual ops entirely, because a create has no
prior status to compare against. **So a manual order replayed hours later, onto an event whose marker is
live, still lands `confirmed`.** ✅ **Which is the correct outcome for the sweep: it is not `pending`, so
the claim function's first predicate excludes it.**

## 4 · `orders.source` — the values, and who writes each

**The CHECK, quoted from the route's own comment. READ:**

```
orders_source_check  CHECK (source = ANY (ARRAY['web', 'manual', 'whatsapp']))
```

| Value | Written by |
|---|---|
| `'manual'` | ✅ **The `action === 'manual'` insert. The only explicit writer of any value.** |
| `'web'` | ⚠️ **Nothing writes it explicitly.** It arrives as the column default — the route's comment: *"Written explicitly rather than left to the column default, which is what made `source` useless: every row read 'web' whatever created it."* |
| `'whatsapp'` | ❌ **No writer.** `grep -rn "source: 'whatsapp'"` over `app lib` returns nothing — it is in the CHECK and unused |

⚠️ **CANNOT DETERMINE the column's DEFAULT or its CHECK from this repo.** `orders.source` predates the
tracked migrations — no `add column … source` for `orders` exists in `supabase/migrations`, so the CHECK
above is quoted from a code comment, not from DDL. **What would settle it:**
`select column_default from information_schema.columns where table_name = 'orders' and column_name = 'source';`
and `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'orders'::regclass and contype = 'c';`

⚠️ **SO `source` IS A WEAKER DISCRIMINATOR THAN IT LOOKS.** A customer order does not carry `'web'` because
anything decided so — it carries whatever the default is. **`status` is the reliable test here, and it is
the one the claim function already uses.**

## 5 · What WOULD happen, if one ever were pending

**Answered conditionally, because §1 says it cannot be — but the shape matters if a future path ever
creates a manual order `pending`.**

**It would be claimed and fully rejected**, because nothing downstream distinguishes source:

- ✅ **Rejected** — `rejectOrder` writes `status: 'rejected'` with the connectivity reason.
- ⚠️ **Hold released — but there would be nothing to release.** The manual insert writes
  `payment_status: 'unpaid'` and creates no `order_drafts` row, so `releaseHoldForTerminalOrder` would
  return `none` / `no_draft` on its first guard. **No Stripe call, no money touched.**
- ⚠️ **The slot would be unbooked**, exactly as an operator reject does.
- 🔴 **Email: USUALLY NONE, AND THAT CUTS BOTH WAYS.** `rejectOrder` sends only
  `if (order.customer_email)`. **READ — `components/dashboard/AddOrderPanel.tsx`:**

```tsx
  const [manualEmail, setManualEmail] = useState('')
```
```tsx
        <input type="email" placeholder="Email for receipt" value={manualEmail}
```
```tsx
          customer_name: manualName || 'Walk-up', customer_phone: manualPhone || null, customer_email: manualEmail || null,
```

**An optional field, placeholder *"Email for receipt"*, defaulting to `''` → `null`.** ✅ **So a typical
walk-up would be refused SILENTLY** — no email, and the operator would find the order rejected with no
notification anywhere. ⚠️ **That is arguably worse than the email**, because nothing would tell anybody
it happened. **CANNOT DETERMINE how many manual orders carry an email;**
`select count(*) filter (where customer_email is not null), count(*) from orders where source = 'manual';`
settles it.

---

## Marking summary

| Claim | Status |
|---|---|
| 🔴 **The manual insert writes the literal `status: 'confirmed'`** | ✅ **READ** — the decisive fact |
| Only submit and promote-draft can write `pending` | ✅ **READ** — both expressions quoted, search named |
| No transition writes `pending` | ⚠️ **INFERRED** by enumeration over the twelve write sites |
| `undo_collected` cannot restore `pending` on a manual order | ⚠️ **INFERRED** by induction from the above |
| The marker is read on one status path only | ✅ **READ** — all four readers listed |
| `promote-draft` does not read the marker | ⚠️ **INFERRED FROM ABSENCE** — search named in §2 |
| A replayed manual order lands `confirmed`; the guard skips it | ✅ **READ** |
| `'whatsapp'` has no writer | ⚠️ **INFERRED FROM ABSENCE** — search named in §4 |
| The `orders.source` DEFAULT and CHECK | ⚠️ **CANNOT DETERMINE** — not in the migrations. Queries given |
| A walk-up usually has no email | ✅ **READ** for the input's optionality. ⚠️ **CANNOT DETERMINE the real rate** |
| **Anything about live rows** | ⚠️ **UNOBSERVED.** No SQL was run |

**Surfaces, kept apart:** the manual insert and the replay guard are the **operator dashboard route**;
`app/api/orders/submit` is the **customer** path; `lib/payments/promote-draft` is the **webhook** path;
`AddOrderPanel` is the operator's **order-entry UI**. **Each was read on its own and no fact is carried
between them.**

**No span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census — nothing else was touched. The result, the
non-ASCII census and the carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
