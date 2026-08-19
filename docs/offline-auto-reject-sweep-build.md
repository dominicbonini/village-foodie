# Offline auto-reject sweep — the build

**Built: the claim function (SQL, for you to run), the cron route, and the `*/5` registration.**
🚫 **No SQL was executed.** No existing write site gained a status guard; `rejectOrder`, the release path,
`/api/heartbeat` and the marker's lifecycle are untouched.

| Piece | Where |
|---|---|
| a · the atomic claim | `supabase/migrations/20260819_claim_order_for_auto_reject.sql` — **ADDITIVE, DEPLOY-COUPLED ORDERING: migration first** |
| b · the route | `app/api/cron/auto-reject-offline-orders/route.ts` |
| c · `rejectOrder` with `'system'` + a connectivity reason | in that route |
| d · per-run limit | **50**, reasoned in §d |
| e · registration | `vercel.json`, `*/5 * * * *` |
| f · monitoring | ❌ **None built, and §f says plainly what that costs** |

✅ **Both Phase 2 stop conditions checked and NOT tripped:** `rejectOrder` needs nothing request-scoped,
and the delay mirrors the mode's inherit chain exactly.

---

# PHASE 1 · READ-ONLY

## 1 · `rejectOrder` — every argument a scheduled caller can supply

**READ — `lib/orders/reject-order.ts`:**

```ts
export async function rejectOrder(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    /** The truck row. Only `id` and `name` are read, and `name` reaches the customer's email. */
    truck: { id: string; name: string }
    /** The operator's free text, or null/absent. Escaped before it reaches the email. */
    rejectionReason?: string | null
    /** Who did it, for the audit row the release writes. */
    actor: ResolvedActor
    source: ActorSource
  },
): Promise<RejectOutcome> {
```

| Argument | Supplied by the sweep as |
|---|---|
| `supabase` | the module-scope **service-role** client |
| `orderKey` | `claim.order_key` |
| `truck` | one read: `select id, name from trucks where id = claim.truck_id` |
| `rejectionReason` | `CONNECTIVITY_REASON` — §c |
| `actor` | `{ actorKind: 'system', actorId: null, actorLabel: null, userRole: null, currentUserName: null, foreignOperator: false }` |
| `source` | `'system'` |

✅ **NOTHING REQUEST-SCOPED.** `grep` of the module for `req`, `body`, `NextRequest`, `NextResponse`
returns **nothing**. **The first stop condition does not trip.** ⚠️ **`actor` is the FULL `ResolvedActor`
interface — six fields, not the three `logAction` reads** — so all six are supplied.

## 2 · The capture sweep's route, and its `vercel.json` entry

**READ — `app/api/cron/capture-stranded-authorizations/route.ts`:**

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
  // ⚠️ `?dry=1` LISTS WITHOUT CAPTURING. …
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  const res = await recoverStrandedAuthorisations(supabase, { limit: 100, dryRun })
  if (!res.ok) {
    // 🔴 A 500, NOT AN `ok: true, examined: 0`. The query itself failed, so this run knows NOTHING about
    // whether money is stranded. Reporting zero here would turn a broken backstop into a clean bill of
    // health, and Vercel's cron dashboard would show a green tick over an unanswered question.
    console.error('[cron/capture-stranded] 🔴 THE BACKSTOP COULD NOT RUN …', res.error)
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, dryRun, ...res.summary })
}
```

```json
    { "path": "/api/cron/capture-stranded-authorizations", "schedule": "*/15 * * * *" }
```

✅ **All four elements copied: the `authorised` gate verbatim in shape, `?dry=1`, the 500-on-query-failure
branch with its reasoning restated for this job, and a `vercel.json` entry.**

## 3 · The inherit chain, so the delay resolves identically

**READ — `supabase/functions/heartbeat-monitor/index.ts`:**

```ts
      // Event override ?? van default ?? 'pause' — the SAME null-means-inherit chain the switch itself
      // uses two lines up, so the two cannot resolve against different events.
      const modeRaw = ev.offline_protection_mode_override ?? van.offline_protection_mode ?? 'pause'
```

**The delay resolves through the identical shape, in SQL:**

```sql
coalesce(e.offline_auto_reject_mins_override, v.offline_auto_reject_mins)
```

🔴 **WITH ONE DELIBERATE DIFFERENCE, AND IT IS THE ONE YOU SPECIFIED: THERE IS NO THIRD TERM.** The mode
falls back to `'pause'`; the delay falls back to **nothing**, and a NULL result means the feature is off
for that van. **`coalesce(…, 0)` or any default would switch automatic rejection on for all 17 vans at
once.** ✅ **The second stop condition does not trip — the chain is mirrorable, and is mirrored.**

## 4 · `assign_buzzer_atomic`'s lock, and this codebase's convention for a writer

**READ:**

```sql
begin
  -- Lock the target first, then the contended holder. Consistent order, so two concurrent calls for
  -- the same pair queue rather than deadlock.
  select id, coalesce(placed_at, created_at)
    into v_target_id, v_target_ts
    from orders
   where order_key = p_order_key and truck_id = p_truck_id
   for update;
```

**The convention, established by reading every function's declaration:**

| Function | Kind | `security definer`? |
|---|---|---|
| `assign_buzzer_atomic` | writes, locks | ❌ plain `language plpgsql` |
| `place_order_atomic` | writes | ❌ plain `language plpgsql` |
| `increment_event_order_counter` | writes | ❌ plain `language plpgsql` |
| `find_stranded_authorisations` | read-only | ✅ + `set search_path = public` |
| `purge_order_drafts`, the `order_drafts` helpers | read/maintenance | ✅ + `set search_path` |

✅ **I FOLLOWED THE WRITERS: plain `language plpgsql`, invoker rights, no `set search_path`.** ⚠️ **The
new function only READS — but it takes a row lock, it is a peer of `assign_buzzer_atomic`, and it is
called only by a cron route holding the service-role key, which bypasses RLS anyway.** `security definer`
exists in this repo for functions whose point is to run regardless of the caller's rights; that is not
this one. **Said here rather than left to inference, as asked.**

---

# PHASE 3 · THE BUILD

## a · The claim function

**🔴 SQL FOR YOU TO RUN. NOT APPLIED — I executed nothing.**
`supabase/migrations/20260819_claim_order_for_auto_reject.sql`

✅ **ADDITIVE** — one function, no table, column, constraint or write.
🔴 **DEPLOY ORDER: MIGRATION FIRST, DEPLOY SECOND.** The route calls
`supabase.rpc('claim_order_for_auto_reject')`; against a database without it every invocation returns
**PGRST202** and the sweep does nothing — the failure mode `assign_buzzer_atomic`'s header already
records. **The reverse order is safe: an unused function changes nothing.**

**The shape, and why it is two steps rather than one joined `FOR UPDATE`:**

```sql
  -- ── 1. FIND A LIKELY CANDIDATE. Oldest first, and this is NOT the guard. ───────────────────────
  select o.order_key into v_key
    from orders o
    join truck_events e on e.id = o.event_id
    join truck_vans   v on v.id = e.van_id
   where o.status = 'pending'
     and e.status = 'open'
     and e.offline_no_autoaccept_until is not null
     and e.offline_no_autoaccept_until > now()
     and coalesce(e.offline_auto_reject_mins_override, v.offline_auto_reject_mins) is not null
     and o.created_at < now() - make_interval(
           mins => coalesce(e.offline_auto_reject_mins_override, v.offline_auto_reject_mins))
     and not (o.order_key = any(p_exclude))
   order by o.created_at asc
   limit 1;
```
```sql
  -- ── 2. LOCK THE ORDER ROW. `skip locked` so two overlapping runs never queue on each other. ────
  select o.order_key, o.id, o.truck_id, o.event_id, o.status, o.created_at
    into v_order from orders o where o.order_key = v_key
   for update skip locked;
  if not found then return; end if;
```
```sql
  -- ── 3. RE-CHECK EVERYTHING, AGAINST THE STATE AS IT IS NOW. ────────────────────────────────────
  if v_order.status is distinct from 'pending' then return; end if;

  select e.status, e.offline_no_autoaccept_until,
         coalesce(e.offline_auto_reject_mins_override, v.offline_auto_reject_mins)
    into v_ev_status, v_marker, v_delay
    from truck_events e join truck_vans v on v.id = e.van_id
   where e.id = v_order.event_id;

  if not found                                 then return; end if;
  if v_ev_status is distinct from 'open'        then return; end if;
  if v_marker is null or v_marker <= now()      then return; end if;
  if v_delay is null                            then return; end if;
  if v_order.created_at > now() - make_interval(mins => v_delay) then return; end if;
```

🔴 **WHY NOT ONE STATEMENT.** A joined `select … for update of o` locks the order and re-evaluates the
qualifier on the locked row — **but only for `orders`' own columns. Postgres does not re-check the joined
tables, and the marker lives on `truck_events`.** So step 1 is a search and step 3 is the guard. **This is
exactly the "a status guard alone guards the wrong column" case, implemented rather than described.**

⚠️ **TIMEZONES: THERE ARE NONE, AND THAT IS DELIBERATE.** The window test is `e.status = 'open'` — the
same live test `heartbeat-monitor` uses — so no timezone rule is duplicated in SQL. **The only clock
comparison is on `orders.created_at`, a TIMESTAMPTZ: an absolute instant, so `now() - interval` is correct
without any timezone at all.** A wall-clock column would have needed one; this does not. **Stated in the
migration header too, so it does not read as an oversight there either.**

⚠️ **`p_exclude` exists because the claim WRITES NOTHING**, so a row it hands back is still eligible next
call. **Without it a looping caller would be handed the same oldest order for ever** — a live-lock in a
dry run always, and in a live run whenever the rejection failed to write.

## b · The route

`app/api/cron/auto-reject-offline-orders/route.ts` — `runtime = 'nodejs'`, `GET`, the same `authorised()`
gate, `?dry=1`, a service-role client at module scope, and:

```ts
    if (error) {
      console.error('[cron/auto-reject] 🔴 THE CLAIM QUERY FAILED — this run knows nothing:', error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
```

⚠️ **THE DRY RUN EXERCISES THE REAL PREDICATE, NOT A COPY.** The claim writes nothing, so a dry run is the
identical work minus the rejection. **On a path whose action is terminal and has no undo, that is not a
nicety.**

## c · The rejection, and the customer's sentence

```ts
      const result = await rejectOrder(supabase, {
        orderKey: claim.order_key,
        truck: { id: truck.id as string, name: (truck.name as string) ?? '' },
        rejectionReason: CONNECTIVITY_REASON,
        actor: { actorKind: 'system', actorId: null, actorLabel: null, userRole: null, currentUserName: null, foreignOperator: false },
        source: 'system',
      })
```

```ts
const CONNECTIVITY_REASON =
  'The van lost its internet connection, so this order could not be confirmed.'
```

✅ **It works whether or not a card was involved**, because it says nothing about money — it renders as
*"Reason: …"* **above** the payment sentence `rejectOrder` already builds, and
`rejectionPaymentSentence` is what distinguishes *"You have not been charged for this order."* from
*"…that hold has now been released."* ✅ **No timeframe and no promise.** *"Try again shortly"* would be a
prediction about a connection nobody can see — the same class of error as the *"resuming in ~119 min"*
banner.

⚠️ **A failed hold release is not swallowed:**

```ts
      if (result.holdRelease === 'failed' || result.holdRelease === 'captured') {
        console.error(`[cron/auto-reject] 🔴 order #${claim.order_id} rejected but the hold was NOT released: ${result.holdRelease}`)
      }
```

**and `hold_release` is carried in the response for every order.** `rejectOrder` has already written the
`hold_release_failed` audit row.

## d · The per-run limit — **50**

**Chosen against the capture sweep's `limit: 100`, and deliberately lower.** ⚠️ **Each rejection here makes
a Stripe call AND sends an email — so 50 is already up to a hundred external round trips inside one
invocation, and the function timeout is the real ceiling, not the row count.** The `*/5` schedule collects
the remainder within five minutes, and a backlog anywhere near 50 pending orders on one offline van is far
outside anything observed. ✅ **It is a safety valve, and when it closes the response says so** —
`hitLimit: true` — **rather than reporting a truncated run as a complete one.**

## e · Registration

```json
    {
      "path": "/api/cron/auto-reject-offline-orders",
      "schedule": "*/5 * * * *"
    }
```

### 🔴 THE REAL RANGE, FOR THE UI

**A cron at `*/5` means the order's age when it is actually refused lands anywhere in one interval above
the setting.** ⚠️ **The error is ALWAYS LATE, never early — an order is never rejected before its delay.**

| Setting | ⚠️ **What the UI must say** |
|---|---|
| 5 | **about 5–10 minutes** |
| 10 | about 10–15 minutes |
| 15 | about 15–20 minutes |
| 20 | about 20–25 minutes |
| 25 | about 25–30 minutes |
| 30 | about 30–35 minutes |

🔴 **A label reading "5 minutes" would be this codebase's "resuming in ~119 min" again — a backstop
reported as a prediction.** ⚠️ **And the range widens on top of that if a run is skipped or overruns;
these figures assume the schedule fires.**

## f · Monitoring — 🔴 NONE WAS BUILT, AND HERE IS WHAT THAT COSTS

**No run-log table, no self-measured gap, no alert, no admin surface** — and **no error-reporting service
exists anywhere in this codebase** (searched `sentry|Sentry|alert(|pagerduty|slack` across `app/api` and
`lib`: nothing). **demo-cleanup solves this with four layers and still admits only a human seeing a stale
timestamp catches total death. None of those layers exists here.**

🔴 **SO IF THIS JOB SILENTLY STOPPED, NOTHING WOULD NOTICE. Not a dashboard, not an alert, not a log
anybody reads.**

✅ **AND THE FAILURE DIRECTION IS THE SAFE ONE, WHICH IS WHY THAT IS TOLERABLE HERE.** A stopped
auto-reject leaves orders `pending` for the operator — **today's behaviour, unchanged since the product
existed.** Nothing is lost and nothing wrong is done; the customer is simply not told. **Contrast the
capture sweep, where a stopped run loses money the truck is owed.**

⚠️ **AND THE BACKLOG DOES NOT SURVIVE A GAP, unlike the capture sweep's.** The marker is nulled on
reconnect and expires in about two hours, so a missed run means those orders are **never** auto-rejected
rather than caught up later. **A resumed job cannot wake up and refuse yesterday's orders** — which is
also the reason a long outage of this job is not dangerous.

---

# PHASE 4 · VERIFICATION

⚠️ **NOTHING WAS EXERCISED.** No SQL ran, no route was called, no order was rejected, nothing touched
Stripe. **Every outcome below is READ-FROM-SOURCE and unobserved.** `tsc --noEmit` passes and is **not**
offered as verification; `next dev` / `next build` were not run.

### 1 · Order pending 20 minutes, delay 15, van offline, event open

**Step 1** matches: `status='pending'`, `e.status='open'`, marker non-null and in the future, delay 15 not
null, `created_at < now() - 15 min`. **Step 2** locks it. **Step 3** re-reads: still `pending`, event still
`open`, marker still live, delay 15, age 20 > 15. ✅ **Claimed.** The route reads the truck, calls
`rejectOrder` with `source: 'system'`, `actorKind: 'system'` and the connectivity reason; the order becomes
`rejected`, the hold is released, the slot is unbooked, the customer is emailed. **The response lists it
with its `hold_release` and `age_secs`.**

### 2 · The van pings between the SELECT and the claim

`/api/heartbeat` nulls `offline_no_autoaccept_until`. **Step 3 reads `truck_events` AFTER the lock**, under
a fresh statement snapshot, so it sees the committed NULL → `if v_marker is null … then return`.
✅ **Nothing is claimed and nothing is rejected.**

🔴 **THE WINDOW THAT REMAINS, STATED PLAINLY: if the ping commits AFTER step 3 but before `rejectOrder`'s
write, the order is still rejected.** The lock is released when the function returns, because the
rejection is a separate statement. **This narrows the race from the whole sweep run to one round trip; it
does not remove it.** Closing it fully would mean the SQL function performing the rejection — a second
implementation of the hold release in the database, which is the one thing `lib/orders/reject-order.ts`
exists to prevent. ⚠️ **The migration header says the same thing, so it is not buried here.**

### 3 · An operator confirms at that moment

**Three cases, and two are safe:**

- **The confirm commits before step 2's lock** → step 3 reads `status = 'confirmed'` →
  `is distinct from 'pending'` → ✅ **return nothing.**
- **The confirm's UPDATE is in flight, holding the row lock** → `for update skip locked` finds nothing →
  ✅ **return nothing.**
- 🔴 **The confirm lands AFTER the claim returns** → `rejectOrder` writes `rejected` over `confirmed` and
  releases the hold. ⚠️ **PARTIAL PROTECTION EXISTS AND IS WORTH NAMING:** if that confirm already
  CAPTURED, `releaseHoldForTerminalOrder` re-reads the ledger and **refuses** — it returns `captured` and
  the route logs it. **So the unprotected case is narrowly: confirm lands, capture has not yet completed,
  and the release goes first.**

### 4 · Event no longer `'open'`, marker still set

**Excluded twice.** Step 1's `e.status = 'open'` never selects it, and step 3 re-checks with
`if v_ev_status is distinct from 'open' then return`. ✅ **Nothing.** ⚠️ **A marker left on a closed or
finished event rejects nothing, which is the rule you set.**

### 5 · A van whose delay column is NULL

**Excluded twice:** step 1's `coalesce(…) is not null`, and step 3's `if v_delay is null then return`.
✅ **Nothing.** 🔴 **AND THAT IS EVERY VAN TODAY** — no row has a value, so this sweep sees **zero orders**
until an operator chooses a delay. **There is no default and none was invented.**

### 6 · A truck in `pause` mode

✅ **Zero rows, for two independent reasons.** `heartbeat-monitor` in pause mode writes
`online_paused_until`, **not** `offline_no_autoaccept_until` — its own comment: *"THE TWO WRITES ARE
DELIBERATELY DIFFERENT COLUMNS, AND MUST STAY SO."* So the marker this sweep reads is never set. **And
pause blocks customers server-side, so there are no new pending orders to sweep in the first place.**
⚠️ **All 17 vans are `pause` today.**

### 7 · Two sweep runs overlapping

`for update skip locked` means run B never queues behind run A. ⚠️ **BUT — AND THIS IS BEHAVIOUR WORTH
KNOWING RATHER THAN DISCOVERING:** when step 2 skips a locked row the function returns nothing, and the
route's loop treats that as "nothing eligible" and **exits early**. **So an overlap makes run B do LESS
work, not duplicate work.** ✅ **No order is ever rejected twice, and no run blocks.** The next `*/5` firing
collects the remainder. **Reported rather than redesigned — looping past a skipped row would need the
scan to live inside SQL, which is beyond what was specified.**

## Executable diff and line counts

| File | Before | After | − | + |
|---|---|---|---|---|
| `vercel.json` | 50 | 54 | 0 | 4 |
| `app/api/cron/auto-reject-offline-orders/route.ts` | — | **new** — 168 lines total, **80 executable** | — | — |
| `supabase/migrations/20260819_claim_order_for_auto_reject.sql` | — | **new** — 156 lines total, **81 executable** | — | — |

**`vercel.json`'s whole diff:**

```
+},
+{
+"path": "/api/cron/auto-reject-offline-orders",
+"schedule": "*/5 * * * *"
```

✅ **It still parses as JSON** — checked by `json.load`, not by eye.

✅ **Nothing else changed.** `git status` shows `vercel.json` as the only modified file from this task; the
other modified entries pre-date it in this session, and the only new paths are the route directory and the
migration.

## Marking

| Claim | Status |
|---|---|
| Every quotation from an existing file | ✅ **READ** |
| The writer/reader `security definer` split | ✅ **READ** — every declaration checked |
| `vercel.json` parses | ✅ **EXECUTED** |
| Line counts and the diff | ✅ **EXECUTED** — comment-stripped comparison |
| **All seven Phase 4 outcomes** | ⚠️ **READ-FROM-SOURCE and UNOBSERVED.** No SQL ran, no route was called |
| That `for update skip locked` behaves as described | ⚠️ **READ-FROM-SOURCE** — Postgres semantics, not tested here |
| That the sweep sees zero rows today | ⚠️ **INFERRED** from every van's column being null. **CANNOT DETERMINE against the live database;** `select id, offline_auto_reject_mins from truck_vans;` settles it |
| `tsc --noEmit` passes | ⚠️ **A breakage check, NOT verification** |

**Surfaces:** the cron route, the SQL function, `lib/orders/reject-order.ts`, `heartbeat-monitor` and the
capture sweep were each read on their own. **No fact is carried between them.**

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the new route, the new
migration, `vercel.json` and this report.** The result, the non-ASCII census of characters introduced, and
the carrier-aware variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
