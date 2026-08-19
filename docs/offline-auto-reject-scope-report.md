# Offline auto-reject — scoping diagnostic

**READ-ONLY. Nothing was built, no schema proposed, no file edited except this report.**

🔴 **THE HEADLINE, BEFORE ANYTHING ELSE: THE FEATURE AS DESCRIBED HAS NO ORDERS TO ACT ON IN THE DEFAULT
CONFIGURATION.** Offline protection has **two modes**. In the default mode (`pause`) customers are blocked
server-side and **no order can be placed at all**. Only the second mode (`no_auto_accept`) lets orders land
— and that mode already forces every order to `pending`, which is precisely the population this feature
would sweep. **§2 and §4 carry the evidence.**

---

## 1 · Auto-accept today

**Two independent things share the name.** **READ.**

**Truck-level** — `trucks.auto_accept`, a boolean, in the manage settings allow-list:

```ts
      'social_instagram', 'social_facebook', 'auto_accept', 'notes_require_review', 'logo_storage_path',
```

**Item-level** — `menu_items_db.auto_accept`, defaulting true:

```ts
        .update({ …, auto_accept: auto_accept ?? true, …})
```

**Both are consulted together at submit:**

```ts
          if (
            truck.auto_accept && allItemsAutoAccept && !anyForcesPending
            && !((truck as any).notes_require_review !== false && orderHasNotes)
            && !vanOfflineNoAutoAccept
          ) {
            autoAccepted = true
          }
```

**So: PER-TRUCK (a boolean) AND PER-ITEM (a boolean), ANDed.** **Not per-event and not per-device.**
⚠️ **There is no per-event override for auto-accept** — unlike offline protection, which has both a van
default and an event override. **READ.**

⚠️ **A fourth and fifth gate also force `pending`:** `notes_require_review` when the order carries notes,
and `anyForcesPending`. **The feature's phrase "auto-accept OFF" is therefore ambiguous today** — an order
can be `pending` for five distinct reasons, and nothing on the row records which. See §4.

## 2 · 🔴 CAN AN ORDER EVEN BE PLACED DURING AN OFFLINE PAUSE?

**In mode `pause` (the DEFAULT): NO. Customers are fully blocked.** **READ**, from the **customer** menu
route (`app/api/menu/[truckId]/route.ts` — read as the customer path):

```ts
      const offlineProtectionEnabled =
        ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
          ? ev.offline_protection_override
          : vanAutoPause

      const manualPaused = ev.paused_until ? new Date(ev.paused_until) > new Date() : false
      const offlinePaused = offlineProtectionEnabled && ev.online_paused_until
        ? new Date(ev.online_paused_until) > new Date()
        : false

      if (offlinePaused) { isPaused = true; pauseReason = 'offline' }
```

🔴 **SAID PLAINLY, AS ASKED: in the default configuration the described feature would have nothing to act
on.** No order can be created while `online_paused_until` is in the future, so there is no held order to
reject after 5–30 minutes.

**BUT THE PREMISE IS RESCUED BY MODE B, and this is the key structural fact:**

```ts
      const modeRaw = ev.offline_protection_mode_override ?? van.offline_protection_mode ?? 'pause'
      const mode = modeRaw === 'no_auto_accept' ? 'no_auto_accept' : 'pause'
      //   pause          → online_paused_until, which the CUSTOMER GATE reads. Writing it IS the pause.
      //   no_auto_accept → offline_no_autoaccept_until, which /api/orders/submit reads to force `pending`.
      //     It must NEVER touch online_paused_until: this mode exists so customers CAN still order.
      const patch = mode === 'no_auto_accept'
        ? { offline_no_autoaccept_until: autoPauseUntil }
        : { online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() }
```

🔴 **THE FEATURE IS A MODE-B FEATURE.** In mode B customers order normally, every order is forced
`pending`, and those orders are exactly the ones that would need auto-rejecting if the truck never comes
back. **In mode A the feature is inert by construction.** ⚠️ **The brief's framing — "offline protection
active AND auto-accept OFF" — describes mode B, but mode B is not the default:** `offline_protection_mode`
is `not null default 'pause'`. **CANNOT DETERMINE** how many trucks have selected mode B; **what would
settle it:** a count of `truck_vans` where `offline_protection_mode = 'no_auto_accept'`.

## 3 · Windows where an order lands despite a mode-A pause

**Three, all INFERRED from the mechanism rather than observed:**

1. 🔴 **The ~30-second detection lag.** The monitor pauses only once a van's heartbeat is stale past its
   threshold. **Between real connectivity loss and the write, the menu is orderable and orders land
   normally** — and in mode A they are *not* forced pending, so an order in that window may even
   auto-confirm. **INFERRED.**
2. **A page already loaded.** The gate is evaluated when `/api/menu/[truckId]` is served. **A customer
   mid-checkout on a page fetched before the pause has already passed it.** ⚠️ **CANNOT DETERMINE whether
   `/api/orders/submit` re-checks `online_paused_until`** — I read its use of
   `offline_no_autoaccept_until` (§2) and did not find a corresponding `online_paused_until` read on that
   path. **What would settle it:** a targeted read of the submit route's event-gate block.
3. **The two-hour backstop lapsing** while the van is still offline — after which the menu is orderable
   again with the device still dark.

⚠️ **Window 1 is the one that matters for scoping: those orders are `pending` for the offline reason but
carry no marker saying so** (§4), and in mode A they are indistinguishable from ordinary pending orders.

## 4 · 🔴 THE TAG — it does not exist

**Nothing on `orders` records WHY an order is unaccepted, or that it arrived during an offline window.**
**READ** — the submit path computes `autoAccepted` as a local boolean and writes only the outcome:

```ts
      // (c) STATUS — pending unless auto-accepted above (only reachable when booked).
      const status = autoAccepted ? 'confirmed' : 'pending'
```

🔴 **THIS IS A NEW COLUMN, AND I AM STATING IT AS NEW.** There is no `pending_reason`, no
`held_offline_at`, no equivalent. The five distinct causes of `pending` (§1) all collapse to one value.

**`truck_events.offline_no_autoaccept_until` — what it is, and why it is NOT the tag:**

| | |
|---|---|
| **Written by** | `heartbeat-monitor`, in mode B only: `{ offline_no_autoaccept_until: autoPauseUntil }` (a `now + 2h` expiry) |
| **Read by** | `/api/orders/submit` — `const noAutoAcceptUntil = eventRow?.offline_no_autoaccept_until ?? null` |
| **Cleared by** | `/api/heartbeat` on the van's next ping: `.update({ offline_no_autoaccept_until: null })`; and by `set_offline_protection` when disabled |
| **Scope** | 🔴 **PER EVENT, NOT PER ORDER** |

🔴 **IT IS RELATED BUT IT IS NOT A TAG.** It is a live window on the *event*, not a mark on the *order* —
and **it is cleared the instant the device returns**. So after reconnection there is no way to tell which
orders were held for the offline reason.

⚠️ **THAT IS EXACTLY THE BRIEF'S THIRD REQUIREMENT, AND IT CUTS BOTH WAYS.** The brief says the tag must be
cleared when the device returns. **The existing event-level marker already behaves that way** — so a sweep
could simply *scope itself to events whose marker is live* and would inherit the clearing semantics free,
with no per-order column at all. **A per-order tag would then need its own clearing pass on reconnect,
which the event marker does not.** ⚠️ **INFERRED as a design consequence, not a recommendation** — the
brief forbids proposing schema, and this is the observation that bears on it.

## 5 · The sweep — what exists, and how failure is noticed

**Two Edge Functions, and that is all:**

```
supabase/functions/
  auto-event-scheduler
  heartbeat-monitor
```

🔴 **NEITHER OPERATES ON PENDING ORDERS.** `heartbeat-monitor` reads `truck_vans` and writes
`truck_events`; `auto-event-scheduler` works on events. **No scheduled pass touches the `orders` table
today.** **READ.**

🔴 **WHAT SCHEDULES THEM: CANNOT DETERMINE FROM THE REPO.** A grep of `supabase/migrations` for cron
scheduling finds only unrelated `schedule_url` columns — **no `cron.schedule` call is committed.** The
schedule is configured outside version control (the Supabase dashboard). **What would settle it:**
`select * from cron.job` on the live database.

🔴 **AND FAILURE WOULD BE SILENT — this is the most important operational finding in §5.** The monitor's
own design turns a stopped scheduler into a no-op rather than an alarm:

```ts
      // ⚠️ AN EXPIRY, NOT A FLAG: a monitor that stops running cannot strand a truck here, because
      // the marker it wrote (now + 2h) simply lapses.
```

✅ **That is correct for the pause** — failing open is right when the failure mode is "customers blocked".
🔴 **IT IS THE WRONG DEFAULT FOR AN AUTO-REJECT.** A sweep that stops running leaves orders held
indefinitely, and **nothing in the product would say so** — precedent already exists: `heartbeat-monitor`
ran **64 days stale** because its deploy was blocked, and it was found by comparing timestamps, not by any
alert. **A reject sweep needs a liveness signal that the pause mechanism did not.**

## 6 · Rejection today, and whether it is terminal

```ts
    if (action === 'reject') {
      const { rejectionReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // Dedicated rejection_reason column (NOT cancellation_reason — a rejected order isn't cancelled).
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order.event_date) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) {
        const reasonLine = rejectionReason ? `<p style="color:#475569">Reason: ${escapeHtml(rejectionReason)}</p>` : ''
        await notifyCustomer(truck, order.customer_email, `Order #${order.id} update`,
          `…<p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${order.id}.</p>
            ${reasonLine}
            <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>…`)
      }
      return NextResponse.json({ success: true, status: 'rejected' })
    }
```

**Writes:** `status: 'rejected'` + `rejection_reason`. **Frees capacity** via
`removeOrderFromProductionSlot`. **Emails** the customer, with the operator's reason interpolated — ✅ **so
a customer-facing connectivity reason needs no new email path; it is a string into an existing field.**

**Is it terminal? EFFECTIVELY YES, though not enforced by a database constraint.** **READ:**

```tsx
  const otherOrders=eventOrders.filter(o=>['collected','cancelled','rejected'].includes(o.status))
```

Rejected lands in the terminal "Done" bucket on the dashboard and is excluded from the KDS board. **There
is no `undo_reject` action** — the route has `undo_collected` and a ready→confirmed undo, but nothing for
rejected. **INFERRED that an operator cannot re-accept it through the UI; CANNOT DETERMINE** that no path
exists at all without an exhaustive transition audit.

⚠️ **For a 5-minute auto-reject that is a real risk: a truck that reconnects at minute 6 cannot take back
an order the sweep rejected at minute 5.**

## 7 · 🔴 MONEY — and there is an asymmetry I did not expect

**Pay-at-hatch: nothing was taken, nothing to release. No issue.** **READ.**

🔴 **CARD: THE REJECT PATH TOUCHES PAYMENT NOWHERE. NOT ONCE.** The branch quoted in full above contains
**no** `resolveEmailPaymentState`, **no** authorisation release, **no** refund call — and a grep of
`lib/payments/*` for `'reject'` returns **nothing**.

**Contrast the CANCEL branch, which does exactly what reject does not:**

```ts
      // ── 🔴 WHAT THE MONEY WAS DOING, ASKED BEFORE ANYTHING MOVES. ────────────────────────────────
      // Resolved here rather than after the release, because releasing stamps `authorization_cancelled_at`
      // and the resolver would then answer 'hatch' …
      const cancelPaymentState = await resolveEmailPaymentState(supabase, orderKey)
      await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null })…
      // ── 🔴 THE ORDER IS CANCELLED FIRST, AND THE HOLD IS RELEASED AFTER. ────────────────────────
```

🔴 **SO IF A CARD-AUTHORISED ORDER IS REJECTED TODAY, THE HOLD IS NOT RELEASED BY THAT PATH.** **INFERRED**
from the absence — I read the reject branch in full and searched the payment helpers; I did not exhaustively
trace every route that might release a hold on a status change. **CANNOT DETERMINE** whether some other
mechanism (a webhook, a sweeper, Stripe's own 7-day expiry) releases it. **What would settle it:** find a
rejected order that had an authorisation and check `authorization_cancelled_at`.

⚠️ **THIS MATTERS DISPROPORTIONATELY FOR THIS FEATURE.** A human reject is rare and deliberate; **an
automatic reject would fire unattended, at scale, on exactly the day a truck's signal is bad — and if it
leaves card holds outstanding, that is money held on customers who were told the order was rejected.**
🔴 **This should be settled before the feature is built, not after.**

## 8 · Where the delay would be configured — the established pattern

**Van-level settings with an event-level override are the pattern this feature's siblings already use.**
The closest precedent is the mode switch itself:

```sql
  add column if not exists offline_protection_mode text not null default 'pause';
```
```sql
  drop constraint if exists truck_vans_offline_protection_mode_check;
```

**The pattern is: `truck_vans.<setting>` as the default + `truck_events.<setting>_override` as a nullable
per-event override, resolved `override ?? vanDefault`** — quoted in §2 from the monitor, and mirrored in
the customer route's `offline_protection_override ?? vanAutoPause`.

⚠️ **I FOUND NO EXAMPLE OF A REQUIRED, NON-NULLABLE, NO-DEFAULT OPERATOR CHOICE ANYWHERE IN THE SCHEMA I
READ.** Every comparable setting is `not null default <value>` or nullable-means-inherit. **The brief's
"CHOSEN, NOT OPTIONAL" would therefore be a new convention**, not an application of an existing one.
**Reported, not proposed** — the brief forbids proposing schema. **CANNOT DETERMINE** whether such a
pattern exists elsewhere in migrations I did not read.

## 9 · Surfaces that would need to show this

| Surface | What I read | Would need |
|---|---|---|
| **Operator order list** (`app/dashboard/[token]/page.tsx`) | ✅ READ — `otherOrders` bucket includes `rejected` | a held-offline indicator on pending cards; the reject already lands correctly |
| **KDS** (`kds/page.tsx`) | ✅ READ — board excludes `['collected','cancelled','rejected']` | nothing for the rejected state; possibly a held indicator |
| **Customer order status page** | ❌ **NOT READ** | **CANNOT DETERMINE** what it shows for `rejected` |
| **Email** | ✅ READ — the reject email interpolates `rejectionReason` | 🔴 **nothing new** — the connectivity reason is a string into the existing template |
| **Dashboard pause banner / chip** | ✅ READ (prior task) | would need to say orders are being held, not just that ordering is paused |

⚠️ **A fact verified on the operator surface is not a fact about the customer surface. I did not read the
customer order status page**, so its handling of `rejected` is unestablished.

## 10 · Existing auto-reply / auto-reject behaviour that could conflict

**One family, and it is unrelated to orders:** the WhatsApp auto-replies (`lib/meta-whatsapp.ts`,
`app/api/webhooks/meta/whatsapp`). **They answer inbound messages; they do not act on orders.** **READ.**

🔴 **THERE IS NO EXISTING AUTOMATIC ORDER-REJECT BEHAVIOUR AT ALL, so there is no precedence rule today
and none to inherit.** The brief's "offline takes PRIORITY over any other auto-reply/auto-reject" describes
a conflict that **does not currently exist** — which is good news, but it means precedence would be
invented rather than followed.

⚠️ **The one real interaction is within offline protection itself:** modes A and B are mutually exclusive
by construction (`patch` writes one column or the other, never both), and the monitor **skips an event that
is already marked** in either mode. **A reject sweep would have to respect that same skip logic or it could
act on an event the monitor considers already handled.**

---

## Summary for the build decision

| Question | Answer |
|---|---|
| Does the feature have orders to act on? | 🔴 **Only in mode `no_auto_accept`. In the default `pause` mode, none — customers are blocked.** |
| Is there a tag today? | 🔴 **No. New column** — but the event-level `offline_no_autoaccept_until` already has the required clear-on-reconnect semantics. |
| Is there a sweep to extend? | 🔴 **No pass touches `orders`. Two Edge Functions exist; neither qualifies.** |
| Would sweep failure be noticed? | 🔴 **No — silently. Precedent: 64 days stale.** |
| Is reject terminal? | ⚠️ **Effectively yes; no undo path found.** A 5-minute delay is unforgiving. |
| Is the money path safe? | 🔴 **UNRESOLVED AND THE BIGGEST RISK — reject touches payment nowhere, while cancel releases the hold.** |
| Is the settings pattern established? | ⚠️ Van default + event override, yes. **A required no-default choice, no — that would be new.** |

**No instruction contradicted another, and no span arrived garbled.**

---

## Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes.** Counts, the non-ASCII census and the
per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
