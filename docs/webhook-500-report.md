# The 500 on /api/webhooks/stripe at 21:06:29

**Date:** 12 August 2026
**READ-ONLY DIAGNOSIS. No file changed, no file created except this report. No `next dev`, no `next build`, no commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 WHAT THREW, AND WHY IT IS MY FAULT RATHER THAN THE CODE'S

**The intent is `pi_3U3jLy2fB4PPCw2D1HagqEbV`. Its metadata names the order it belongs to:**

```
STRIPE : {"status":"succeeded","capture_method":"manual","amount":650,"received":650,"capturable":0,
          "metadata":{"harness":"A","order_key":"f020ce66-452d-4168-8ab3-f88dbaf9a1c9"}}
```

🔴 **`"harness":"A"`.** That is not a customer's order. It is the first row of **my own verification harness** for the capture-on-the-card-path build — the run that died with `TypeError: (ledgerRows ?? []).filter is not a function` and ran its emergency cleanup, deleting the order, the draft and the ledger rows.

**The 500 was the deployed webhook racing my local harness's `DELETE`.** Not two Stripe events racing each other, and nothing wrong with either deployment.

| | |
|---|---|
| **Which 500 line** | 🔴 **`ledger write failed` — established, not guessed.** See §1 |
| **What threw inside it** | `recordPaymentEvent` → either a `23503` foreign-key violation on the insert, or `readOrder(...).single()` throwing `not found` in the recalc. **Which of the two is not established** — §1 tells you the exact log line that says |
| **Did anything race at Stripe's end?** | ❌ **No.** Nothing in the two branches contends. §3 |
| **Recovery** | ⚠️ **The endpoint recovered. The work did not, and correctly so** — by the redelivery there was no order to record against. §5 |
| **Deployment difference** | ✅ **None that matters.** The webhook route, the ledger and `online.ts` are byte-identical across the two commits. §6 |

---

## 1. Every 500 path reachable on `payment_intent.succeeded`

**Source: QUOTED.** `grep -n "status: 500"` against the deployed shape (`961ecd8`) returns three. **Only two are reachable for this event type.**

### 🔴 (i) `:244` — the receipt insert failed

Reached when the `stripe_webhook_events` insert errors with a code that is **not** `23505`:

```ts
    } else {
      // 🔴 A REAL PERSISTENCE FAILURE. 500 ON PURPOSE, so Stripe retries — we hold no record of this
      // event, and its re-delivery is the recovery path.
      console.error(
        `[webhook/stripe] PERSIST FAILED id=${eventId} type=${eventType} livemode=${livemode} — ` +
        `returning 500 so Stripe retries. ${insertErr.code ?? ''} ${insertErr.message}`,
      )
      return NextResponse.json({ error: 'Could not record event' }, { status: 500 })
    }
```

### (ii) `:323` — ❌ **NOT REACHABLE.** Inside `if (eventType === 'account.updated')`

```ts
  if (eventType === 'account.updated') {
```
Different event type. Excluded.

### 🔴 (iii) `:516` — the ledger write threw

Reached when `order?.truck_id` is truthy **and** `amount_received > 0` **and** `recordOnlineCardPayment` throws:

```ts
    } catch (ledgerErr) {
      // 🔴 500 SO STRIPE RETRIES. The money moved and we failed to record it — a paid order showing
      // unpaid on the hatch. The write is idempotent on the PaymentIntent id, so a retry costs nothing.
      console.error(
        `[webhook/stripe] 🔴 LEDGER WRITE FAILED for order=${orderKey} pi=${piId} — returning 500 so ` +
        `Stripe retries:`, ledgerErr instanceof Error ? ledgerErr.message : ledgerErr,
      )
      return NextResponse.json({ error: 'ledger write failed' }, { status: 500 })
    }
```

### 🔴 IT WAS (iii), AND YOUR OWN LOG PROVES IT

The redelivery 14.7 s later printed:

> `DUPLICATE evt_3U3jLy…1BUO5aSu "recorded but NOT handled (handled=false). Re-running the handler"`

**That message is only reachable through the `23505` arm** — which means the receipt row **had been inserted successfully** on the first attempt. Path (i) returns before writing anything and would have produced a `PERSIST FAILED` line and no row at all. Confirmed live:

```
evt_3U3jLy2fB4PPCw2D1BUO5aSu  payment_intent.succeeded
  stripe_created_at 21:06:29   received_at 21:06:29.896762
  handled true   handled_at 2026-08-12T21:06:44.628+00:00   handler_result "unknown_order"
```

The row exists, and its `handled_at` is the **redelivery's** time. So the first attempt got past the receipt insert, past the order lookup, and died in the ledger write.

### What threw inside it — two candidates, both from the same cause

**QUOTED**, `lib/payments/ledger.ts`:

```ts
    if (error.code === '23505') inserted = false
    else throw new Error(`[ledger] insert failed for ${event.orderKey}: ${error.message}`)
  }

  const balance = await recalcOrderPayment(supabase, event.orderKey)
```
and
```ts
async function readOrder(supabase: SupabaseClient, orderKey: string): Promise<BalanceableOrder> {
  const { data, error } = await supabase
    .from('orders').select('total, total_minor').eq('order_key', orderKey).single()
  if (error || !data) throw new Error(`[ledger] could not read order ${orderKey}: ${error?.message ?? 'not found'}`)
```
and the schema, `20260729_order_payments_ledger.sql:57`:
```sql
  order_key       uuid        not null references orders(order_key) on delete cascade,
```

| If the harness's DELETE landed… | What throws |
|---|---|
| **before** the `order_payments` insert | `23503` foreign-key violation → `[ledger] insert failed for f020ce66-…: …violates foreign key constraint` |
| **between** the insert and the recalc | the new row cascades away, `readOrder` `.single()` finds nothing → `[ledger] could not read order f020ce66-…: not found` |

⚠️ **WHICH ONE IS NOT ESTABLISHED FROM HERE — but your log already contains the answer.** Filter the runtime log for invocation `bqwq2` and look for:

> `[webhook/stripe] 🔴 LEDGER WRITE FAILED for order=f020ce66-452d-4168-8ab3-f88dbaf9a1c9 pi=pi_3U3jLy2fB4PPCw2D1HagqEbV — returning 500 so Stripe retries: <the message>`

The trailing message distinguishes them exactly.

---

## 2. `payment_intent.succeeded` versus `amount_capturable_updated`

**Source: QUOTED.** The event 2.2 seconds earlier, on the same intent, returned 200 because **the two branches do entirely different work, and only one of them writes money inside the response.**

### `amount_capturable_updated` — 🔴 NO LEDGER, NO 500 OF ITS OWN

```ts
    // 🔴 THE AMOUNT IS `amount_capturable`, NOT `amount_received`. Money is HELD, not taken — nothing has
    // moved, so nothing is written to the ledger here. The ledger stays exactly as it was: it records
    // captures, and this is not one.
    …
    startPromotion(orderKey, 'webhook', eventId)
    console.log(`[webhook/stripe] AUTHORISED pi=${piId} order_key=${orderKey} capturable=${capturable} — promotion started`)
    return NextResponse.json({ received: true })
```

Its only work is **out of band**. It cannot fail the response, and its outcome is recorded later — which is exactly what happened:

```
evt_3U3jLy2fB4PPCw2D1x8ov905  amount_capturable_updated
  received_at 21:06:28.437   handled_at 21:06:28.651   handler_result "promotion:already"
```

`promotion:already` — the harness had already claimed the draft locally, so the webhook's promoter lost the claim and did nothing. **214 ms, one indexed read, 200.**

### `payment_intent.succeeded` — reads the order, then WRITES THE LEDGER SYNCHRONOUSLY

```ts
    const { data: order } = await supabase
      .from('orders').select('order_key, truck_id').eq('order_key', orderKey).maybeSingle()
    …
    const moneyMoved = amountReceived !== null && amountReceived > 0
    …
    try {
      const { inserted, balance } = await recordOnlineCardPayment(supabase, { … })
      …
      await markHandled(eventId, `online_payment:${balance.status}`)
      return NextResponse.json({ received: true })
    } catch (ledgerErr) { … 500 … }
```

🔴 **THIS IS THE ONLY BRANCH IN THE FILE THAT WRITES MONEY INSIDE THE REQUEST**, and the only one whose failure is deliberately a 500. Its own comment says why: *"a lost event here is a paid order showing unpaid on the hatch."*

**So the asymmetry is by design.** The first event touched nothing that the harness's cleanup could pull out from under it. The second one depended on the `orders` row still being there.

---

## 3. Could the two events 2.2 s apart have raced?

# ❌ NO. Nothing in those two branches contends, and I can name every candidate.

**INFERRED, from the quoted code paths.**

| Candidate | Verdict |
|---|---|
| **The receipt insert** | ❌ Keyed on `stripe_event_id`, and the two events have **different ids**. `stripe_webhook_events_event_id_uniq` cannot fire between them |
| **The claim** | ❌ Only `amount_capturable_updated` promotes. `payment_intent.succeeded` promotes **only if there is no order** (`if (!order?.truck_id)`), and there was one. They never both claim |
| **The ledger write** | ❌ Only `succeeded` writes it. `amount_capturable_updated` explicitly does not — *"nothing is written to the ledger here"* |

### What DOES serialise anything here

**Only one thing, and it prevents duplicates rather than ordering:** `order_payments_idempotency_key_uidx` on `stripe_pi:<intent id>`, treated as a successful no-op by `recordPaymentEvent`:

```ts
    if (error.code === '23505') inserted = false
```

**QUOTED: nothing else serialises them.** No advisory lock, no transaction spanning both, no queue.

### 🔴 THE ACTUAL RACE WAS WITH SOMETHING THAT IS NOT STRIPE

The deployed webhook and my local harness were writing the same rows through the same service-role key at the same second. The harness's emergency cleanup was:

```js
    await sb.from('order_payments').delete().eq('order_key', c.key)
    await sb.from('orders').delete().eq('order_key', c.key)
    await sb.from('order_drafts').delete().eq('order_key', c.key)
```

**Three unguarded deletes against a row the deployed webhook was in the middle of writing to.** Nothing in the application could serialise that, because the two processes are not aware of each other.

### And the same shape three more times, without a 500 — which corroborates it

The second (successful) run of that harness produced three more pairs at 21:06:55-21:07:05:

```
evt_3U3jMR…YbvYdFS  amount_capturable_updated  21:06:56.804 -> promotion:already
evt_3U3jMR…7I3EgjK  payment_intent.succeeded   21:06:58.928 -> online_payment:paid    ✅ 200
evt_3U3jMV…ZgQO0vu  amount_capturable_updated  21:07:00.691 -> promotion:already
evt_3U3jMV…H9lHFFQ  payment_intent.succeeded   21:07:03.664 -> online_payment:paid    ✅ 200
evt_3U3jMa…El4g4JD  amount_capturable_updated  21:07:05.709 -> promotion:already
```

**Same 2-4 second gap, same intent-per-pair, same deployment — no 500.** Because that run did not delete anything until it had finished. **The gap between the events is not the variable; the concurrent DELETE is.**

---

## 4. The order, read live

**Source: QUOTED.** Read just now:

```
DRAFT  : null
ORDER  : null
LEDGER : []
AUDIT  : []
STRIPE : {"status":"succeeded","capture_method":"manual","amount":650,"received":650,"capturable":0,
          "metadata":{"harness":"A","order_key":"f020ce66-452d-4168-8ab3-f88dbaf9a1c9"}}
```

| | |
|---|---|
| **Order key** | `f020ce66-452d-4168-8ab3-f88dbaf9a1c9` — harness row "A", order **#20**, created and deleted 12 August |
| **Draft** | ❌ **gone** — deleted by the harness's emergency cleanup |
| **Order row** | ❌ **gone** |
| **Ledger row** | ❌ **none.** Neither by `order_key` nor by `idempotency_key = stripe_pi:pi_3U3jLy…` |
| **Audit rows** | ❌ none |
| 🔴 **At Stripe** | **`succeeded`, £6.50 received, capturable 0.** The capture stands and is unreconciled |

⚠️ **THAT £6.50 IS SANDBOX MONEY AND IT IS A DECLARED WRITE.** The `docs/capture-card-path-report.md` verification section lists *"3 sandbox PaymentIntents (2 captured, 1 cancelled) — ⚠️ NOT reversible"*. This is one of them. **No real money and no real customer is involved.**

---

## 5. Was the recovery complete?

## ⚠️ THE ENDPOINT RECOVERED. THE WORK DID NOT — AND THAT WAS THE RIGHT OUTCOME HERE.

The redelivery at 21:06:44.355 fell through the duplicate branch (`handled = false`) into the dispatch, and by then **the order and the draft were both gone**, so it took this exit:

```ts
      console.error(
        `[webhook/stripe] 🔴 payment_intent.succeeded FOR AN UNKNOWN ORDER AND NO DRAFT — pi=${piId} ` +
        `order_key=${orderKey} amount_received=${amountReceived}. The customer HAS been charged. Reconcile by hand.`,
      )
      await markHandled(eventId, 'unknown_order')
      return NextResponse.json({ received: true })
```

```
handled true   handled_at 21:06:44.628   handler_result "unknown_order"
```

| | |
|---|---|
| **Did the redelivery finish the abandoned work?** | ❌ **No.** No ledger row was written, then or since |
| **Is something missing for that order?** | ❌ **No — because there is no order.** A ledger row cannot exist without one; the FK forbids it. Nothing is inconsistent |
| **Is the endpoint settled?** | ✅ Yes. `handled = true`, so a further redelivery short-circuits at the duplicate branch |

🔴 **BUT READ THE OUTCOME HONESTLY: the 500-and-retry mechanism did not do its job here, it was excused from it.** Its purpose is *"a lost event here is a paid order showing unpaid on the hatch"* — and the retry landed on nothing to record against. **For a genuine customer order deleted the same way, the money would have moved at Stripe with no ledger row and no order, and `unknown_order` — which logs "The customer HAS been charged. Reconcile by hand." — is the only trace.** That log line is correct and it is the entire safety net for this state.

---

## 6. `dpl_Doq…` versus `dpl_4gQ…`

⚠️ **Which commit each deployment carries is NOT ESTABLISHED** — I have no Vercel access and deployment ids appear nowhere in the repo.

**INFERRED from timestamps**, and the inference is tight:

| | UTC | |
|---|---|---|
| `f7aed6c` payment fix again | 14:57:41 | |
| `acb8957` payments x | 16:34:29 | |
| `961ecd8` payment fix | **20:35:27** | 🔴 the newest commit at 21:06 |
| **the 500** | **21:06:29** | so `dpl_Doq` almost certainly builds `961ecd8` |
| `d9cf8b5` another payment fix | **21:12:23** | |
| the 21:18 / 21:22 events | 21:18, 21:22 | so `dpl_4gQ` almost certainly builds `d9cf8b5` |

**So yes — `dpl_Doq` is the older build.**

### 🔴 AND NOTHING RELEVANT DIFFERS BETWEEN THEM. QUOTED.

```
$ git diff --stat 961ecd8 d9cf8b5 -- app/api/webhooks/stripe/route.ts lib/payments/ledger.ts lib/payments/online.ts
(empty)
```

**The webhook route, the ledger and the online-payment writer are byte-identical across the two commits.** `d9cf8b5` changed `capture.ts`, `promote-draft.ts`, `submit/route.ts`, `action/route.ts`, `vercel.json` and added the stranded-authorisation work — **none of which is on the `payment_intent.succeeded` path**.

⚠️ **One consequence worth stating:** `dpl_Doq` did not yet have card-path capture. The capture that produced `payment_intent.succeeded` at 21:06:29 was performed **by my local harness through `jiti`, running the uncommitted working tree** — not by the deployed build. That is precisely why a deployed webhook and a local process were writing the same rows at the same moment.

---

# Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — all three 500 sites, the ledger's throw sites, the FK. That it was site (iii) is **QUOTED-derived** from the DUPLICATE message plus the live receipt row. *Which* of the two throws fired is **not established** |
| 2 | **QUOTED** — both branches in full, and both live `handler_result` values |
| 3 | **INFERRED** from the quoted branches; the absence of any serialiser is **QUOTED by absence**. The corroborating three pairs are **QUOTED** |
| 4 | **QUOTED** — read live, all four sources |
| 5 | **QUOTED** — the exit taken, its `handler_result` and `handled_at` |
| 6 | Commit times **QUOTED**; the deployment-to-commit mapping is **INFERRED**; the byte-identical diff is **QUOTED** |

# Not established

- 🔴 **Which of the two throws produced the 500** — the FK violation on insert, or `readOrder` finding nothing in the recalc. §1 names the exact log line in invocation `bqwq2` that says.
- **Which commit each `dpl_` id builds.** Timestamps make it near-certain; only Vercel's deployment list is proof.
- **The exact wall-clock instant of the harness's DELETE.** It is bracketed — after the webhook's `orders` read at ~21:06:29.9 and before the redelivery at 21:06:44.4 — but not timed, because the harness printed no timestamps.

# Standing

- ⚠️ **This was self-inflicted by a verification harness and is not a production defect.** No customer order took this path, and none of the code involved is wrong: the 500 is the documented, correct response to a failed ledger write, and Stripe's retry is what recovered the endpoint.
- 🔴 **The lesson worth keeping is about the harnesses, not the webhook.** Running verification against the live database while a deployed webhook is subscribed to the same Stripe account means two writers with no mutual awareness. Every future harness that deletes rows can produce exactly this. Nothing in the repo prevents it.
