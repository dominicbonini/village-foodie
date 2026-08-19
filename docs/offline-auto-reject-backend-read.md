# Offline auto-reject — the backend design read

**READ ONLY. Nothing was changed except this file.** No migration proposed, no SQL written, nothing built.
`next dev` / `next build` were not run.

## Confirming the established facts — five hold, one is wrong as stated

| Established | Verdict |
|---|---|
| `pause` blocks customers server-side; only `no_auto_accept` lets orders land | ✅ **READ. True** |
| Nothing on an order records WHY it is pending | ✅ **READ. True** |
| 🔴 **NO scheduled pass currently touches `orders`** | ❌ **FALSE AS STATED — see below** |
| `orders.rejection_reason` exists, unused by any automatic path | ✅ **READ. True** |
| Rejection is effectively terminal with no undo | ✅ **READ. True** |
| Reject now releases the hold via `releaseHoldForTerminalOrder` | ✅ **READ. True** |

🔴 **THE CORRECTION, AND I AM NOT TREATING IT AS A BLOCKER.** Two scheduled jobs do touch `orders`:

- **`/api/cron/demo-cleanup`** (hourly) calls `deleteTruckCascade`, whose table list opens with
  `'orders', // the guaranteed blocker` — it **DELETES order rows**. ⚠️ Demo trucks only, and it asserts
  the prefix first: *"REFUSED: … is not a demo truck — cleanup must never touch a real truck"*.
- **`/api/cron/capture-stranded-authorizations`** (`*/15`) reaches `recalcOrderPayment`, *"the ONLY writer
  of payment_status/amount_paid"* — it **WRITES to `orders`**.

✅ **The fact is true in the sense that matters here, and I state it in the form the design should use:
NO SCHEDULED JOB MUTATES `orders.status` TODAY.** That is still the load-bearing claim — an auto-reject
would be the first. **I did not stop on this**, because it is a narrowing of the premise rather than a
contradiction of it, and stopping would have withheld the other six answers on a read-only task. **Say so
if you want it treated otherwise.**

---

# 1 · THE TAG

## What it is

**READ — `supabase/migrations/20260818_offline_protection_mode.sql`:**

```sql
alter table truck_events
  add column if not exists offline_no_autoaccept_until timestamptz default null;

comment on column truck_events.offline_no_autoaccept_until is
  'Set by heartbeat-monitor when this event''s van is offline AND the resolved offline-protection mode is '
  '''no_auto_accept''. While in the future, /api/orders/submit forces new orders to status ''pending'' '
  'instead of auto-confirming them; the slot is still claimed and held. Cleared by /api/heartbeat on the '
  'van''s next successful ping. NEVER blocks ordering — that is online_paused_until, which this is not.';

create index if not exists idx_truck_events_offline_no_autoaccept
  on truck_events (van_id)
  where offline_no_autoaccept_until is not null;
```

⚠️ **THE INDEX IS ON `van_id`, PARTIAL ON THE MARKER BEING NON-NULL.** A sweep keyed on the event id or on
`orders.event_id` would not use it; a sweep that starts from *"which vans are currently marked"* would.
**Worth knowing before the predicate is written.**

## What writes it — one writer

**READ — `supabase/functions/heartbeat-monitor/index.ts`:**

```ts
      const patch = mode === 'no_auto_accept'
        ? { offline_no_autoaccept_until: autoPauseUntil }
        : { online_paused_until: autoPauseUntil, last_offline_pause_at: now.toISOString() }
```

`autoPauseUntil` is **now + 2 hours**. ⚠️ **It is written ONCE PER OFFLINE EPISODE, not refreshed**, because
the monitor skips an event whose marker is still in the future:

```ts
      if (ev.offline_no_autoaccept_until && new Date(ev.offline_no_autoaccept_until).getTime() > now.getTime()) {
        console.log(`[heartbeat-monitor]     event ${ev.id}: SKIP — already in no-auto-accept (…, still active)`)
        continue
      }
```

🔴 **AND NOTE WHAT MODE B DOES NOT WRITE:** `last_offline_pause_at`. The monitor says why —

```ts
      // NOTE: AND last_offline_pause_at IS WRITTEN ONLY IN PAUSE MODE. It drives the dashboard's "Orders
      // were paused while your device was offline" notice, which would be a false statement here.
```

## What reads it — three readers, and I am naming them because the last task's lesson was exactly this

| Reader | What it does with it |
|---|---|
| `app/api/orders/submit/route.ts` | `vanOfflineNoAutoAccept` → suppresses `autoAccepted`, so the order lands `pending` |
| `supabase/functions/heartbeat-monitor` | the skip above — *"already acted, don't re-write"* |
| `app/api/dashboard/action/route.ts:2565` | on switching offline protection OFF: `patch.offline_no_autoaccept_until = null` |

**The submit-side use. READ:**

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

## When it is cleared — and this already matches your rule

**READ — `app/api/heartbeat/route.ts`:**

```ts
  await supabaseAdmin
    .from('truck_events')
    .update({ offline_no_autoaccept_until: null })
    .in('van_id', vanIds)
    .not('offline_no_autoaccept_until', 'is', null)
```

✅ **"THE TAG IS CLEARED WHEN THE DEVICE COMES BACK ONLINE" IS ALREADY THE BEHAVIOUR, AND IT IS EXACTLY
THIS COLUMN.** A returning ping nulls it. ⚠️ It is also cleared by the operator switching protection off,
and it **expires by itself after 2 hours** — *"an expiry, not a flag, so a monitor that stops running
cannot strand a truck"*. **Three ways out, all of which correctly stop a sweep touching those orders.**

## 🔴 IS THE EVENT FIELD PLUS `orders.created_at` ENOUGH? — MOSTLY YES. NO NEW COLUMN IS REQUIRED.

**The join exists:** `orders.event_id` is populated and already used by the reject branch
(`removeOrderFromProductionSlot(supabase, truck.id, order.event_id, …)`). **READ.**

**A sweep could select, with no schema change:**

> orders where `status = 'pending'`, joined to `truck_events` on `event_id`, where
> `offline_no_autoaccept_until > now()`, and `created_at < now() - <delay>`.

**Everything in that predicate exists today.** ✅ **So the answer you were hoping for is the right one: a
per-order marker is NOT required to identify the orders.**

⚠️ **BUT IT SELECTS A SUPERSET, AND THE OVER-INCLUSION IS WORTH A DECISION RATHER THAN A COLUMN.** Two
distinct causes:

**(a) Orders that were pending for a different reason.** The submit gate has five ways to land `pending`:
`truck.auto_accept` off · an item that forces pending · `notes_require_review` with notes · the capacity
claim not booking · the offline marker. **Nothing on the row distinguishes them.** ⚠️ **I judge this
over-inclusion HARMLESS AND ARGUABLY CORRECT** — the feature's premise is *"the device is unreachable, so
nobody can accept this order"*, which is true of a pending order on an offline van **whatever made it
pending**. **A product call, not a data problem.**

**(b) 🔴 ORDERS THAT WERE ALREADY PENDING BEFORE THE DEVICE WENT OFFLINE. This one is real.** The operator
was online and had simply not got to it yet. **The window START is NOT RECORDED IN MODE B** — the marker
stores only an expiry, and `last_offline_pause_at` is deliberately pause-mode only. **Three ways to
exclude them, none needing a new column:**

1. **Derive the start as `offline_no_autoaccept_until - 2h`.** ⚠️ **Brittle.** The 2h constant lives in a
   Deno edge function that *"cannot be imported by Vercel code"* — the migration says so about the 30s
   threshold and the same applies. **A second home for a constant is exactly what that design refused.**
2. **Write `last_offline_pause_at` in mode B too.** 🔴 **NO — AND THIS IS THE LESSON FROM LAST TIME
   APPLIED.** Its **consumer** is the dashboard's *"Orders were paused while your device was offline"*
   notice (`app/api/dashboard/route.ts:521` → `app/dashboard/[token]/page.tsx:636`, `:1253`, `:4671`),
   which would then display a **false statement** in a mode where ordering was never paused. **The
   monitor's own comment says exactly that.** **Reusing the column breaks its reader.**
3. **Don't exclude them.** An order sitting pending while the van is unreachable is in the same position
   whenever it arrived. **Simplest, and needs nothing.**

⚠️ **IF YOU DO WANT (b) EXCLUDED PROPERLY, WHAT IS MISSING IS A MODE-B START TIMESTAMP** — a sibling of
`last_offline_pause_at` on `truck_events`, written by the monitor. **That is a column, and I am naming it
rather than proposing it.** **CANNOT DETERMINE whether it is worth one** — that is your call.

---

# 2 · THE REJECT PATH

**READ — `app/api/dashboard/action/route.ts`, the branch as it now stands (comments trimmed, code entire):**

```tsx
    if (action === 'reject') {
      const { rejectionReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      const rejectPaymentState = await resolveEmailPaymentState(supabase, orderKey)
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      const rejectRelease = await releaseHoldForTerminalOrder(supabase, {
        orderKey, truckId: truck.id, trigger: 'operator_reject', actor, source: actorSource,
      })
      if (rejectRelease.status === 'released') { console.log(…) }
      else if (rejectRelease.status === 'failed' || rejectRelease.status === 'captured') { console.error(…) }
      if (order.event_date) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap)
      }
      if (order.customer_email) {
        const reasonLine = rejectionReason ? `<p …>Reason: ${escapeHtml(rejectionReason)}</p>` : ''
        const rejectMoney = rejectionPaymentSentence({ truckName: truck.name, paymentState: rejectPaymentState,
          holdReleased: rejectRelease.status === 'released' || (rejectRelease.status === 'none' && rejectRelease.reason === 'already_released') })
        await notifyCustomer(truck, order.customer_email, `Order #${order.id} update`, `…${rejectMoney.html}…`, `…`)
      }
      return NextResponse.json({ success: true, status: 'rejected', hold_release: rejectRelease.status })
    }
```

## 🔴 IT CANNOT BE CALLED FROM ANYWHERE BUT A REQUEST HANDLER. THIS NEEDS AN EXTRACTION BEFORE IT NEEDS A SWEEP.

**READ. It is 30 lines of inline branch inside `POST`, not a function.** There is nothing to import.

| Dependency | Where it comes from now | What a cron would have to supply |
|---|---|---|
| `truck` | token + PIN auth earlier in the handler | **Read the truck row by id.** No token exists in a cron; `truck.id` and `truck.name` are all this branch uses |
| `orderKey` | `body` | The sweep's own row |
| `body.rejectionReason` | the operator's modal | 🔴 **A CONNECTIVITY REASON THE SWEEP COMPOSES.** `rejection_reason` is a plain text column with no CHECK |
| `actor` | `resolveActorSafe(req, supabase, truck)` — **needs `req`** | ⚠️ **Nothing honest to pass.** The param is optional and defaults to `actorKind: 'unknown'`, which is the closest true answer |
| `actorSource` | `resolveActorSource(req, body)` — **needs `req`** | 🔴 **NO VALID VALUE EXISTS. See below** |
| `notifyCustomer(...)` | a **local, non-exported** function in the route file | Would move with the extraction, or be re-imported from `lib/email` |
| `NextResponse.json(...)` | the HTTP contract | Returns a value instead |
| `escapeHtml`, `buildItemCatMap`, `removeOrderFromProductionSlot`, `normaliseOrderLines`, `resolveEmailPaymentState`, `rejectionPaymentSentence`, `releaseHoldForTerminalOrder` | imports / a local helper | ✅ **All portable.** Only `escapeHtml` and `notifyCustomer` are local to the file |

### 🔴 TWO CLOSED UNIONS BLOCK AN AUTOMATIC CALLER, AND ONE OF THEM IS ENFORCED BY THE DATABASE

**(i) `source` — and this is the hard one. READ:**

```ts
export type ActorSource = 'web' | 'native' | 'offline_replay'
```
```sql
  constraint action_audit_log_source_chk     check (source     in ('web', 'native', 'offline_replay'))
```

🔴 **A SWEEP IS NONE OF THOSE, AND THE CHECK IS IN POSTGRES, NOT ONLY IN TYPESCRIPT.** Passing `'system'`
would fail the insert with 23514 inside `logAction` — **on the release path, after the hold was already
cancelled at Stripe.** ⚠️ **The alternative is passing `'web'`, which is a lie in the one table that exists
to answer "who did this".** **What is missing: a fourth member, in the type AND in the CHECK. Named, not
proposed.**

**(ii) `trigger` on the release call. READ:**

```ts
    trigger: 'operator_cancel' | 'customer_cancel' | 'operator_reject'
```

⚠️ **An automatic reject is not an operator reject.** This one is TypeScript-only — `trigger` is stored
inside `beforeState` **jsonb**, so no CHECK stands in the way. **Widening it is the same shape of change
that added `'operator_reject'` last time, and the derived audit wording would need a third word.**

✅ **THE DRY REQUIREMENT IS SATISFIABLE AND SHOULD DRIVE THE ORDER OF WORK.** Extract the branch into
something like `rejectOrder(supabase, { orderKey, truckId, reason, trigger, actor, source })` returning a
result object, call it from **both** the route and the sweep. **The route keeps `req`, auth and the HTTP
response; the extracted function keeps the money, the slot and the email.** ⚠️ **Extract first, sweep
second — a sweep built against a copied branch is the drift this codebase keeps recording.**

---

# 3 · THE EXISTING CRONS — the pattern to follow

**Both payment jobs are identical in shape. READ —
`app/api/cron/capture-stranded-authorizations/route.ts`:**

```ts
export const runtime = 'nodejs'

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Admins may also trigger it by hand — the
 *  same gate app/api/cron/cancel-stale-authorizations uses. */
async function authorised(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authz = req.headers.get('authorization') || ''
  if (secret && authz === `Bearer ${secret}`) return true
  return verifyAdmin(req)
}

export async function GET(req: NextRequest) {
  if (!await authorised(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  …
}
```

**Registration — `vercel.json`. READ, complete:**

```json
  "crons": [
    { "path": "/api/cron/demo-cleanup",                    "schedule": "0 * * * *" },
    { "path": "/api/cron/account-deletion-due",            "schedule": "0 9 * * *" },
    { "path": "/api/cron/cancel-stale-authorizations",     "schedule": "*/10 * * * *" },
    { "path": "/api/cron/capture-stranded-authorizations", "schedule": "*/15 * * * *" }
  ]
```

**The pattern, stated rather than invented:**

1. `app/api/cron/<name>/route.ts`, `export const runtime = 'nodejs'`, **a `GET` handler**.
2. `authorised(req)` — `Bearer $CRON_SECRET`, falling back to `verifyAdmin` so a human can trigger it.
3. A **service-role** Supabase client built at module scope from `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
4. `?dry=1` listing without acting. ⚠️ **For an auto-reject this is not a nicety — it is how you would ever
   trust the predicate**, given the action is terminal.
5. A bounded `limit`, JSON summary out, **500 on a query failure** so a broken run is not reported green:
   *"Reporting zero here would turn a broken backstop into a clean bill of health."*
6. One entry in `vercel.json` `crons`.

⚠️ **ONE STALE COMMENT, REPORTED AS FOUND.** `cancel-stale-authorizations`'s header says *"NOT YET
REGISTERED IN vercel.json"*. **It is registered, at `*/10`.** The comment is out of date, not the config.

⚠️ **The Deno edge functions are a DIFFERENT mechanism** — `supabase/functions/heartbeat-monitor` and
`auto-event-scheduler` are not in `vercel.json` and their schedule is not in this repo. **CANNOT DETERMINE
their cadence from source;** the monitor's comments imply ~30s. **The Supabase dashboard's scheduled-function
list would settle it.**

---

# 4 · 🔴 HOW A STOPPED JOB IS NOTICED

## Honestly: for the payment sweeps, **nothing would notice**

⚠️ **INFERRED FROM ABSENCE, and I name the search:** `grep -rln "sentry\|Sentry\|alert(\|pagerduty\|slack"
across `app/api` and `lib` returns **nothing**. **There is no error-reporting service, no alerting
integration, and no uptime monitor in this codebase.**

**Neither payment sweep writes a run log, measures a gap, or notifies anyone.** They return JSON to
whoever called them. **A silently-stopped capture sweep would be invisible** — which is exactly what the
Vault-key incident was, and its own header admits the mitigation is the work being resumable, not the
failure being noticed.

## ✅ ONE JOB DOES SOLVE THIS, AND IT IS THE PATTERN TO COPY

**READ — `app/api/cron/demo-cleanup/route.ts`, its own header:**

```
// ── HOW THIS SURFACES ITS OWN FAILURE ─────────────────────────────────────────────────────────────
//   1. EVERY invocation writes a demo_cleanup_log row — success, partial or hard failure.
//   2. The job measures its own GAP since the last successful run and records it; an INTERMITTENT death
//      is therefore visible in the history even after it recovers.
//   3. A gap over the alert threshold, or any error, EMAILS the team.
//   4. The admin console reads the log and shows the last-run age, red when stale.
// ⚠️ Nothing inside a job that never runs can report that it never ran. Layer 4 — a human seeing a stale
// timestamp — is the only thing that catches total death. That is a real residual gap, not a solved one.
```

```ts
const GAP_ALERT_MINS = 180
…
      const { data: last } = await supabase
        .from('demo_cleanup_log').select('run_at')
        .eq('ok', true).order('run_at', { ascending: false }).limit(1).maybeSingle()
…
  } else if (gapMins !== null && gapMins > GAP_ALERT_MINS) {
    await notify('⚠️ Demo cleanup had a gap', `<p>Ran successfully, but the previous successful run was …`)
  }
```

✅ **A new job should follow THIS, not the payment sweeps.** ⚠️ **Layer 4 requires an admin-console
surface**, which for a new job does not exist — **that is work, and it is the only layer that catches
total death.**

## 🔴 CAN AN AUTO-REJECT USE THE CAPTURE SWEEP'S MITIGATION? — NO. THE ANALOGY BREAKS, IN BOTH DIRECTIONS.

**The capture sweep's claim. READ:** *"the work is idempotent and the backlog is a single SQL predicate, so
a resumed job catches up rather than losing anything."*

**Neither half transfers:**

| | Capture sweep | Auto-reject |
|---|---|---|
| **Idempotent?** | ✅ Re-capturing is a no-op — the ledger key and the not-owed refusal both stop it | ⚠️ **Re-rejecting a rejected order is a no-op too** — so this half *does* hold, **if** the predicate keeps `status = 'pending'` |
| **Backlog survives a gap?** | ✅ The rows stay selectable until captured | 🔴 **NO. THE PREDICATE SELF-ERASES.** The marker is nulled on reconnect and expires after 2h, so a missed run means those orders are **never** auto-rejected |
| **Is late action still correct?** | ✅ Money owed is still owed | 🔴 **NO.** Rejecting late refuses an order the customer may have waited for — and **rejection is terminal with no undo** |

✅ **THE FAILURE DIRECTION IS THE SAFE ONE, WHICH IS THE GOOD NEWS.** A stopped auto-reject means orders
stay pending for the operator — **today's behaviour**. Nothing is lost and nothing wrong is done; the
customer is simply not told. **A stopped CAPTURE sweep loses money; a stopped auto-reject loses only the
courtesy.**

🔴 **AND THE DANGEROUS CASE IS BOUNDED BY THE 2h EXPIRY, NOT BY THE JOB.** A job that resumes after a long
outage can only act while a marker is still live, so it cannot wake up and reject a day's worth of orders.
⚠️ **It CAN still reject an order whose customer has since been served in person.** **CANNOT DETERMINE how
often — no observation exists.** ⚠️ **The `?dry=1` mode is the mitigation available here**, plus keeping
`status = 'pending'` in the predicate so anything the operator touched is already out of scope.

---

# 5 · THE SETTING

🔴 **OFFLINE PROTECTION'S MODE IS PER-VAN, WITH A PER-EVENT OVERRIDE. THE DELAY MUST SIT AT THE SAME LEVEL.
READ:**

```sql
alter table truck_vans
  add column if not exists offline_protection_mode text not null default 'pause';

alter table truck_vans
  add constraint truck_vans_offline_protection_mode_check
  check (offline_protection_mode in ('pause', 'no_auto_accept'));

alter table truck_events
  add column if not exists offline_protection_mode_override text default null;

alter table truck_events
  add constraint truck_events_offline_protection_mode_override_check
  check (offline_protection_mode_override is null
         or offline_protection_mode_override in ('pause', 'no_auto_accept'));
```

**The switch it hangs off is `truck_vans.auto_pause_on_offline` with
`truck_events.offline_protection_override` (null = inherit).** **The resolution chain, READ from the
monitor:**

```ts
      const modeRaw = ev.offline_protection_mode_override ?? van.offline_protection_mode ?? 'pause'
```

**So the established pattern for a setting of this shape is exact and needs no invention:**

- **A `truck_vans` column** with `not null default <today's behaviour>` and a CHECK — the delay's default
  would be whatever "off" means for it.
- **A nullable `truck_events` `_override` column**, null = inherit, same CHECK.
- **Resolved as `event.override ?? van.value ?? <fallback>`**, in **one place**, by whatever owns the
  decision.
- ⚠️ **Additive, not deploy-coupled** — *"nothing reads the new columns yet"* — **but the migration's own
  header names the trap: any NAMED select listing the new column fails 42703 if the deploy lands first.**
  The two named selects for the last pair were `app/api/manage/route.ts get_vans` and the monitor.

🔴 **A DELAY IS NOT A MODE, AND ONE DETAIL DOES NOT TRANSFER: 5–30 MINUTES IS A RANGE, AND THERE IS NO
INTEGER-RANGE SETTING PRECEDENT QUOTED ABOVE.** The nearest existing shapes are `cancellation_cutoff_mins`
and `capacity_window_mins`. **CANNOT DETERMINE from this read whether either carries a CHECK on its
range** — I did not open their migrations, and I am not going to claim it by analogy.

---

# 6 · CONFLICTS — what else can act on a pending order

| Actor | Acts on pending? | Note |
|---|---|---|
| **Auto-accept** | ❌ **Submit-time only** | It decides `pending` vs `confirmed` at insert. It never revisits an order |
| **Operator confirm / reject / time-adjust** | ✅ Yes | The only writers of `orders.status` today, all request-driven |
| **Offline-replay guard** | ✅ Indirectly | `expected_from` 409s a replay whose order has moved on |
| **`capture-stranded-authorizations`** | ❌ **Excluded by allow-list** | `'pending'` is deliberately absent: *"a pending order's hold is correct"* |
| **`cancel-stale-authorizations`** | ❌ | Owns `promoted_at IS NULL` — drafts that never became orders |
| **`demo-cleanup`** | ⚠️ **Deletes them** | Demo trucks only, prefix asserted. **Not a status transition** |
| **`account-deletion-due`** | ⚠️ Anonymises identity | Retains the rows as a financial record |
| **Any expiry on pending orders** | ❌ **None exists** | ⚠️ **INFERRED FROM ABSENCE** — `grep -n "from('orders')" app/api/cron/*/route.ts` returns nothing |
| **`heartbeat-monitor` / `auto-event-scheduler`** | ❌ | `truck_vans` and `truck_events` only |

✅ **SO THERE IS NOTHING TO TAKE PRECEDENCE OVER TODAY.** *"Offline takes priority over any other
auto-reply behaviour"* is satisfiable trivially, **because no other automatic reply to a pending order
exists.** ⚠️ **Record it as an invariant now**, because the moment a second automatic responder is built
the precedence has to be decided somewhere, and the natural home is the extracted reject function rather
than the sweep.

⚠️ **THE ONE REAL INTERACTION IS WITH THE OPERATOR**, and that is §7.

---

# 7 · 🔴 THE RACE — there is no concurrency control on order status. None.

**READ — every status transition in `app/api/dashboard/action/route.ts` has this shape:**

```ts
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: … })
        .eq('order_key', orderKey).eq('truck_id', truck.id)
```

🔴 **NO `.eq('status', …)`. NO version column. NO `updated_at` precondition. NO row lock. NO transaction.**
Confirm, reject, cooking, ready, collected and cancel are all blind last-writer-wins writes. **There is no
`SELECT … FOR UPDATE` and no RPC serialising these** — the only serialising RPCs in this codebase are the
order-number counter and the slot claim.

**The single precedent for a guarded transition. READ:**

```ts
    if (Array.isArray(body.expected_from) && orderKey && action !== 'manual') {
      const { data: cur } = await supabase.from('orders').select('status').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (cur && !body.expected_from.includes(cur.status)) {
        return NextResponse.json({ error: 'conflict', current_status: cur.status }, { status: 409 })
      }
    }
```

⚠️ **AND IT IS A READ-THEN-CHECK, NOT AN ATOMIC ONE.** Between the `select` and the `update` the status
can change. **It narrows the window; it does not close it.** It is also opt-in — online requests omit
`expected_from` entirely.

## So, directly: what prevents an order being rejected microseconds after the operator could have accepted it?

🔴 **NOTHING TODAY. Both the sweep and the operator would issue unconditional writes, and the last one
wins.** Worse in one direction than the other: **the sweep also cancels the card hold**, so *"confirmed by
the operator, hold released by the sweep"* is reachable — the order would then be `confirmed` with its
authorisation gone, and `captureOnConfirmation` would find nothing to take.

⚠️ **THE ORDERING MAKES IT NARROWER THAN IT SOUNDS**, and this is worth knowing before designing around it:
the reject branch writes the status **before** it releases, and `releaseHoldForTerminalOrder` re-reads the
draft and **refuses if the ledger shows a capture**. So an operator confirm that captured *first* is
protected by the ledger check. **The unprotected order is: sweep rejects → sweep releases → operator's
confirm lands and captures nothing.**

✅ **THE FIX NEEDS NO NEW DATA AND NO NEW COLUMN, AND IT IS ONE CLAUSE:** make the sweep's write
`.eq('status', 'pending')` and act only if a row came back — a compare-and-set on the value that is
already there. ⚠️ **That pattern does not exist anywhere in this codebase yet**, so it would be new, and it
would want the same treatment on the release call: **release only if the status write actually won.**

🔴 **AND THERE IS A SECOND, WIDER RACE THE PREDICATE CANNOT SEE:** the device could come back online
between the sweep's `select` and its `update`. `/api/heartbeat` would null the marker, but the sweep is
already holding rows selected under it. **A status-guarded write does not help here** — the order really is
still `pending`. **What would: re-checking the marker inside the same statement**, i.e. making the update's
predicate include the join condition rather than filtering in application code. **CANNOT DETERMINE whether
PostgREST can express that**; a `security definer` function could. **Named, not proposed.**

---

# What is missing — the complete list, no SQL

**Needed before an auto-reject can exist:**

1. 🔴 **An extraction of the reject branch** into a callable function. **This is the first piece of work**;
   everything else depends on it, and the DRY requirement makes it non-optional.
2. 🔴 **A fourth `ActorSource` member** — in the TypeScript union **and** in
   `action_audit_log_source_chk`. **A DB CHECK, so this one is a migration.**
3. **A `trigger` member** on `releaseHoldForTerminalOrder` for an automatic reject, plus a third word in
   the derived audit wording. **TypeScript only** — `trigger` is stored in jsonb.
4. **A delay setting**: a `truck_vans` column plus a nullable `truck_events` override, following §5's
   pattern exactly.
5. **A cron route** following §3, with `?dry=1`, and **the demo-cleanup self-monitoring pattern** from §4
   rather than the payment sweeps' silence.
6. **A compare-and-set on the status write** (§7) — no new data, but a new pattern here.
7. ⚠️ **OPTIONAL, AND ONLY IF YOU WANT PRE-OFFLINE PENDING ORDERS EXCLUDED:** a mode-B start timestamp on
   `truck_events`. **§1 argues you probably do not need it.**

**NOT needed:** ❌ a per-order marker · ❌ a new column on `orders` · ❌ any change to
`offline_no_autoaccept_until`, which already has exactly the lifecycle your rule describes.

---

## Marking summary

| Claim | Status |
|---|---|
| Every SQL, TypeScript and JSON quotation above | ✅ **READ** |
| The tag's one writer, three readers and three clearing paths | ✅ **READ** |
| The reject branch cannot be called outside a request handler | ✅ **READ** — it is an inline branch, not a function |
| `ActorSource` is CHECK-constrained in Postgres | ✅ **READ** — `20260729_action_audit_log.sql:97` |
| No status guard on any order transition | ✅ **READ** — every update quoted has only `order_key` + `truck_id` |
| No alerting service anywhere | ⚠️ **INFERRED FROM ABSENCE** — searched sentry/Sentry/alert(/pagerduty/slack across `app/api` and `lib` |
| No cron touches `orders` directly | ⚠️ **INFERRED FROM ABSENCE**, and **it is the claim I corrected** — `deleteTruckCascade` and `recalcOrderPayment` both do, reached indirectly |
| Over-inclusion is harmless | ⚠️ **A JUDGEMENT, flagged as one.** Not a fact |
| The edge functions' cadence | ⚠️ **CANNOT DETERMINE** — not in this repo. The Supabase scheduled-function list settles it |
| Whether `cancellation_cutoff_mins` carries a range CHECK | ⚠️ **CANNOT DETERMINE** — not read, and deliberately not assumed by analogy |
| Whether any order is affected today | ⚠️ **CANNOT DETERMINE.** All 17 vans are `pause`, so mode B has never run. `select id, offline_protection_mode from truck_vans;` settles it |

**Surfaces, kept apart:** the submit path, the dashboard action route, the two Vercel crons, the two Deno
edge functions and the migrations were each read on their own. **No behaviour of one is claimed of
another** — in particular the demo-cleanup monitoring pattern is described as *demo-cleanup's*, and the
payment sweeps are separately confirmed to have none of it.

⚠️ **THE PREDICATE LESSON, HONOURED:** for `offline_no_autoaccept_until`, for
`find_stranded_authorisations`' allow-list and for `last_offline_pause_at`, I named **what READS them**
before saying anything about what they select — and that is what rules out reusing
`last_offline_pause_at` in §1.

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census — nothing else was touched. The result, the
non-ASCII census and the carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
