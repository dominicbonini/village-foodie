# Offline auto-reject sweep — Phase 1, and TWO STOPS

🔴 **STOPPED AT PHASE 2. NOTHING WAS BUILT.** No SQL function, no route, no `vercel.json` entry, no
monitoring. **The only file written is this report.**

**Two enumerated stop conditions are met, and one established fact is partly false.**

| # | Stop | Status |
|---|---|---|
| 1 | 🔴 **The delay setting column does not exist** | **MET — hard stop.** You said you would run the migration by hand first. The DDL you need is in §Stop 1 |
| 2 | 🔴 **The trading-window check cannot use the existing helper inside SQL** | **MET — a decision, not a blocker.** Two ways out, §Stop 2. I did not choose |
| — | ⚠️ **`assign_buzzer_atomic` is NOT `security definer`** | **Established fact partly false.** The lock is real; the security setting is not. §1.2 |

**Everything else established re-read and TRUE:** the marker's lifecycle and its writers, `orders.event_id`
joining to it, `rejectOrder`'s existence and shape, `'system'` on both CHECKs, the twelve blind write
sites, and the zero-row/`PGRST116` behaviour.

---

# STOP 1 · 🔴 THERE IS NO DELAY COLUMN, ANYWHERE

**Searched:** `grep -rn "reject_delay\|auto_reject\|reject_after\|offline_reject"` across
`supabase/migrations app lib components` — **nothing.** And every column ever added to `truck_vans`, from
the migrations:

```
  add column if not exists paused_until timestamptz,
  add column if not exists online_paused_until timestamptz,
  add column if not exists buzzer_count smallint;
  add column if not exists offline_protection_mode text not null default 'pause';
```

❌ **No delay, on `truck_vans`, `truck_events` or `trucks`.** The sweep has nothing to read, so its
predicate cannot be written. **This halts the build on its own, independently of Stop 2.**

## What is needed, following the established pattern exactly

**The mode's own migration is the shape to copy** — a `truck_vans` column plus a nullable `truck_events`
override, resolved `event.override ?? van.value ?? fallback`. **Here is the DDL, for you to run by hand.
🚫 NOT RUN. I executed nothing.**

```sql
-- 20260819_offline_auto_reject_delay.sql
-- The per-van auto-reject delay, at the SAME level as the offline-protection mode it belongs to.
-- 🚫 NOT RUN. Dominic runs all SQL by hand.
--
-- ✅ ADDITIVE, NOT DEPLOY-COUPLED. Both columns are nullable or carry a default and nothing reads them
-- yet, so applying this changes no behaviour. ⚠️ THE ONE TRAP IS THE ONE THE MODE MIGRATION NAMED: a
-- NAMED select listing a column that does not exist returns 42703 and fails the whole statement. Apply
-- this BEFORE any deploy that names these columns.
--
-- 🔴 NULL MEANS OFF, AND THAT IS WHY THERE IS NO DEFAULT VALUE. A number here is an instruction to
-- reject a customer's order automatically; a default would switch that on for all 17 vans at once.
-- Every existing row stays null, so the sweep sees nothing until an operator chooses a delay.

alter table truck_vans
  add column if not exists offline_auto_reject_mins integer default null;

alter table truck_vans
  drop constraint if exists truck_vans_offline_auto_reject_mins_check;
alter table truck_vans
  add constraint truck_vans_offline_auto_reject_mins_check
  check (offline_auto_reject_mins is null
         or (offline_auto_reject_mins >= 5 and offline_auto_reject_mins <= 30));

comment on column truck_vans.offline_auto_reject_mins is
  'Minutes an order may sit ''pending'' while this van is offline in no_auto_accept mode before the '
  'auto-reject sweep refuses it. NULL = the feature is OFF for this van, which is every row today. '
  'Judged per ORDER AGE, never on how long the van has been offline. Range 5-30 enforced here so a '
  'nonsense value cannot reach the sweep; see the granularity note before offering 5 in the UI.';

alter table truck_events
  add column if not exists offline_auto_reject_mins_override integer default null;

alter table truck_events
  drop constraint if exists truck_events_offline_auto_reject_mins_override_check;
alter table truck_events
  add constraint truck_events_offline_auto_reject_mins_override_check
  check (offline_auto_reject_mins_override is null
         or (offline_auto_reject_mins_override >= 5 and offline_auto_reject_mins_override <= 30));

comment on column truck_events.offline_auto_reject_mins_override is
  'Per-event override for the auto-reject delay. null = use the van default '
  '(truck_vans.offline_auto_reject_mins). Mirrors offline_protection_mode_override''s '
  'null-means-inherit rule so the two resolve through the same chain.';

notify pgrst, 'reload schema';

-- VERIFY AFTER APPLYING:
--   select column_name, data_type from information_schema.columns
--    where table_name in ('truck_vans','truck_events') and column_name like 'offline_auto_reject%';
--     -- expect 2 rows, both integer
--   select id, offline_protection_mode, offline_auto_reject_mins from truck_vans;
--     -- expect every offline_auto_reject_mins null, every mode 'pause'
```

⚠️ **THE RANGE IS IN THE CHECK BECAUSE YOU NAMED 5–30**, and because a CHECK is the only thing that stops
a bad value reaching a money path. ⚠️ **NULL-MEANS-OFF IS A DESIGN CALL I MADE IN THE DDL AND AM FLAGGING
RATHER THAN BURYING** — say if you would rather the column carried a default.

---

# STOP 2 · 🔴 THE TRADING-WINDOW CHECK CANNOT USE THE EXISTING HELPER INSIDE SQL

**Phase 3a requires the window re-checked *inside the same transaction as the lock*. Phase 2 forbids
writing a new time comparison. In SQL those pull against each other, and resolving it is a choice — so I
stopped rather than choose.**

**The correct helper exists, and it is TypeScript. READ — `lib/time-utils.ts`:**

```ts
/** Current minute-of-day (hour*60+min) in the given timezone, regardless of device/server tz. */
export function getNowMinsInTz(tz: string = 'Europe/London'): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? '0')
  return get('hour') * 60 + get('minute')
}
```

**Its own architecture note is the rule this stop protects. READ:**

> *"TIMEZONE ARCHITECTURE (V7.x) — the event's wall clock, not the device's or the server's (UTC on
> Vercel). All "now"/"today" decisions for slots run in the EVENT's timezone so server and every client
> agree."*

**And its partner `getLocalDateInTz` answers "is the event's date today".** `hasValidEventTimes` gates
whether an event has usable times at all. **All three are `lib/`, none reachable from Postgres.**

## The two ways out — I am not choosing between them

**(a) The route computes `now` with the helper and PASSES it in.** The claim function takes
`p_now_mins integer` and `p_today date`, and compares them to `start_time`/`end_time`/`event_date`. ✅ **The
rule stays in one home** — SQL only compares numbers the helper produced. ⚠️ **The `now` is read a few
milliseconds before the lock**, which is immaterial for a window measured in hours, **but it is no longer
"inside the transaction" in the strict sense.**

**(b) The function reads its own clock:** `now() at time zone 'Europe/London'`. ✅ **Genuinely inside the
transaction**, and Postgres's conversion is at least as correct as `Intl`. 🔴 **BUT IT IS A SECOND HOME FOR
THE TIMEZONE RULE** — exactly what the offline-mode migration refused for the staleness threshold: *"One
owner of the staleness rule; everyone else reads a value."* ⚠️ **And it hardcodes `'Europe/London'` in a
second place**, at the moment `trucks.timezone` is documented as the thing that will replace the default.

⚠️ **MY READING, OFFERED NOT ACTED ON: (a).** The drift risk in (b) is permanent; the staleness in (a) is
milliseconds against an hours-long window. **Your call.**

---

# PHASE 1 · THE READ

## 1 · `rejectOrder` — signature, arguments, and what a sweep supplies

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

| Argument | What a scheduled caller supplies |
|---|---|
| `supabase` | The **service-role** client the cron routes already build at module scope |
| `orderKey` | The claimed row's `order_key` |
| `truck` | ✅ **One read.** `select id, name from trucks where id = …` — the function reads nothing else off it |
| `rejectionReason` | The connectivity sentence. §3c below |
| `actor` | `{ actorKind: 'system', actorId: null, actorLabel: null, userRole: null, currentUserName: null, foreignOperator: false }` |
| `source` | `'system'` |

✅ **`'system'` IS VALID ON BOTH, CONFIRMED BY READING BOTH DECLARATIONS AND BOTH CHECKS:**

```ts
export type ActorKind = 'owner' | 'staff' | 'token' | 'unknown' | 'system'
export type ActorSource = 'web' | 'native' | 'offline_replay' | 'system'
```
```sql
  check (source     in ('web', 'native', 'offline_replay', 'system'));
  check (actor_kind in ('owner', 'staff', 'token', 'unknown', 'system'));
```

✅ **NOTHING REQUEST-SCOPED REMAINS.** `grep` of the module for `req`, `body`, `NextRequest` and
`NextResponse` returns **nothing**. **The second stop condition — "if `rejectOrder` cannot be called
without request-scoped values, STOP" — does NOT trip.**

⚠️ **`actor` is typed `ResolvedActor`, the FULL interface** — six fields, not the three `logAction` uses.
**A caller must build all six.** Minor, and worth knowing before it surprises someone.

## 2 · `assign_buzzer_atomic` — and the correction

**READ — the declaration:**

```sql
create or replace function assign_buzzer_atomic(
  p_truck_id  text,
  p_event_id  uuid,
  p_order_key uuid,
  p_buzzer    smallint,
  p_replay    boolean default false
) returns jsonb
language plpgsql
as $$
```

🔴 **THERE IS NO `security definer` AND NO `set search_path`.** The established fact said *"`SELECT … FOR
UPDATE` in a security definer function"*. **The lock is real; the security setting is not.** ⚠️ **It runs
with invoker rights and is called with the service-role key, which bypasses RLS anyway.**

⚠️ **`security definer` + `set search_path = public` IS the convention — for the READ-ONLY functions:**
`find_stranded_authorisations`, `purge_order_drafts`, and the `order_drafts` helpers all carry both.
**So the repo has two shapes, and "follow assign_buzzer_atomic's mechanism" means the LOCK, not the
security setting.** **That is a choice still open, and I did not make it.**

**The lock, and the deadlock note that is the reason to copy it:**

```sql
begin
  -- Lock the target first, then the contended holder. Consistent order, so two concurrent calls for
  -- the same pair queue rather than deadlock.
  select id, coalesce(placed_at, created_at)
    into v_target_id, v_target_ts
    from orders
   where order_key = p_order_key and truck_id = p_truck_id
   for update;
  if v_target_id is null then
    raise exception 'order % not found for truck %', p_order_key, p_truck_id;
  end if;
```

**Its purpose, from the header:**

> *"ONE TRANSACTION, so buzzer 7 is never on two orders and never on neither. Phase 1 did this as two
> sequential statements from the route with the clear deliberately first, accepting a small window in
> which the number could appear free while a customer held it. **That window is closed here.**"*

**Called by `supabase.rpc`. READ — `lib/buzzer.ts`:**

```ts
  const { data, error } = await supabase.rpc('assign_buzzer_atomic', {
    p_truck_id: truckId,
    p_event_id: eventId,
    p_order_key: orderKey,
```

⚠️ **AND ITS CONFLICT POLICY IS THE ONE YOU SAID NOT TO COPY, correctly.** It arbitrates and always
assigns *somebody* the buzzer — *"TIES GO TO THE INCUMBENT"*. **A claim function must instead return
NOTHING when the precondition fails**, so the caller does no side effects at all. **Different verb: the
buzzer function decides; a claim function refuses.**

## 3 · The cron pattern, and 🔴 the granularity answer

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
  const dryRun = new URL(req.url).searchParams.get('dry') === '1'
  const res = await recoverStrandedAuthorisations(supabase, { limit: 100, dryRun })
  if (!res.ok) {
    console.error('[cron/capture-stranded] 🔴 THE BACKSTOP COULD NOT RUN …', res.error)
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
  }
  return NextResponse.json({ ok: true, dryRun, ...res.summary })
}
```

**Registered — `vercel.json`. READ:**

```json
    { "path": "/api/cron/cancel-stale-authorizations",     "schedule": "*/10 * * * *" },
    { "path": "/api/cron/capture-stranded-authorizations", "schedule": "*/15 * * * *" }
```

**Interval: `*/15` — every fifteen minutes.**

### 🔴 SO A 5-MINUTE SETTING CANNOT MEAN FIVE MINUTES. SAYING IT PLAINLY.

**A cron at `*/N` gives a per-order delay of `delay + [0, N)`.** The order's age when it is actually
rejected is uniformly distributed across a whole cron interval above the setting.

| Cron | A "5 min" setting really means | A "30 min" setting really means |
|---|---|---|
| `*/15` | 🔴 **5 to 20 minutes** — up to **4× the number shown** | 30 to 45 minutes |
| `*/5` | 5 to 10 minutes | 30 to 35 minutes |
| `*/2` | 5 to 7 minutes | 30 to 32 minutes |

🔴 **WHAT THIS DECIDES FOR THE UI: at `*/15`, offering "5 minutes" is a lie of a factor of four**, and the
customer is the one waiting. **Either the job runs far more often than the payment sweeps, or the shortest
option offered is a multiple of the interval.** ⚠️ **AND THE ERROR IS ONE-SIDED — always LATE, never
early**, which is the safe direction: an order is never rejected before its delay.

⚠️ **CANNOT DETERMINE the finest cron cadence available.** Vercel's per-plan limits are not in this repo,
and both existing jobs sit at 10–15 minutes. **The Vercel project's cron settings page settles it.**

## 4 · The trading window — see Stop 2

**The helpers are `getNowMinsInTz` / `getLocalDateInTz` / `hasValidEventTimes`, all in `lib/time-utils.ts`,
all TypeScript.** ⚠️ **The event's `status` is a second, cheaper signal and is NOT a clock at all:**
`heartbeat-monitor` selects `.eq('status', 'open')`, calling that *"the LIVE redefinition (V7.0): the
operator STARTED it… NOT the published clock window."* **A claim function could require `status = 'open'`
with no time comparison whatsoever** — ⚠️ **but that is a different rule from "still in its trading
window", and choosing between them is a product decision I am not making.**

## 5 · The setting's level — see Stop 1

**The mode is per-VAN with a per-event override. READ:**

```sql
alter table truck_vans
  add column if not exists offline_protection_mode text not null default 'pause';
alter table truck_events
  add column if not exists offline_protection_mode_override text default null;
```
```ts
      const modeRaw = ev.offline_protection_mode_override ?? van.offline_protection_mode ?? 'pause'
```

✅ **So the delay must be per-van with a per-event override, resolved through the identical chain.** That
is what the DDL in Stop 1 provides.

## 6 · demo-cleanup's four layers — what a new job must copy

**READ — its own header:**

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

**What a new job would need:** 🔴 **layer 1 needs a TABLE** (`demo_cleanup_log`'s equivalent) — **another
migration, and it is not in Stop 1's DDL because you have not asked for the job yet.** Layers 2 and 3
follow from it with no new infrastructure. ⚠️ **Layer 4 needs an admin-console surface that does not
exist for a new job — and it is the only layer that catches total death.**

### 🔴 WHY A MISSED RUN MATTERS MORE HERE THAN FOR THE CAPTURE SWEEP

**The capture sweep's mitigation is its backlog: `"the work is idempotent and the backlog is a single SQL
predicate, so a resumed job catches up rather than losing anything."` Neither half transfers cleanly:**

| | Capture sweep | Auto-reject |
|---|---|---|
| Backlog survives a gap | ✅ Rows stay selectable until captured | 🔴 **NO — the predicate SELF-ERASES.** The marker is nulled on reconnect and expires in 2h, so a missed run means those orders are **never** auto-rejected |
| Late action still correct | ✅ Money owed is still owed | 🔴 **NO. The customer has been waiting**, and rejection is terminal with no undo |

✅ **THE FAILURE DIRECTION IS THE SAFE ONE, AND THAT IS THE HONEST GOOD NEWS.** A stopped auto-reject
leaves orders pending for the operator — **today's behaviour**. **A stopped capture sweep loses money; a
stopped auto-reject loses only the courtesy.**

🔴 **WHAT WOULD NOT BE NOTICED: everything.** With no run-log table there is no gap to measure, no alert
to fire and nothing for a console to show — and there is **no Sentry, no Slack and no uptime monitor
anywhere in this codebase** (`grep -rln "sentry\|Sentry\|alert(\|pagerduty\|slack"` over `app/api` and
`lib` returns nothing). **A silently stopped sweep would be invisible until someone asked why a customer
was never told.**

---

# What I did NOT do

❌ No SQL claim function. ❌ No route. ❌ No `vercel.json` entry. ❌ No monitoring table. ❌ No copy for the
rejection reason. ❌ No per-run limit chosen. **All of Phase 3 is held** behind Stop 1, which cannot be
worked around: without the column there is no predicate to write.

✅ **No existing write site was given a status guard, `rejectOrder` was not changed, and neither was the
release path, heartbeat or the marker's lifecycle** — trivially, because nothing was changed at all.

## To unblock, in order

1. **Run Stop 1's DDL** (or a variant — tell me if null-means-off or the 5–30 CHECK is wrong).
2. **Decide Stop 2:** the route passes `now` from `getNowMinsInTz`, or the function reads
   `now() at time zone 'Europe/London'`.
3. **Decide the window rule:** clock comparison, or `event.status = 'open'` as `heartbeat-monitor` uses.
4. **Decide the cron interval**, knowing §3's granularity table — it decides what the UI may offer.
5. **Say whether the run-log table is in scope**, since layer 1 needs its own migration.

---

## Marking summary

| Claim | Status |
|---|---|
| No delay column exists | ⚠️ **INFERRED FROM ABSENCE** — four name patterns plus every `truck_vans` column added by any migration. **CANNOT DETERMINE that the live database matches the migrations**; `select column_name from information_schema.columns where table_name = 'truck_vans';` settles it |
| `rejectOrder`'s signature and arguments | ✅ **READ** |
| `'system'` valid in both types and both CHECKs | ✅ **READ** — all four quoted |
| `assign_buzzer_atomic` has no `security definer` | ✅ **READ** — the full declaration |
| `security definer` is the read-only functions' convention | ✅ **READ** — five migrations carry it |
| The cron auth, schedule and registration | ✅ **READ** |
| The granularity arithmetic | ✅ **Arithmetic over the `*/15` schedule.** ⚠️ The available cadence is **CANNOT DETERMINE** |
| The timezone helpers are TypeScript-only | ✅ **READ** |
| demo-cleanup's four layers | ✅ **READ** |
| No alerting anywhere | ⚠️ **INFERRED FROM ABSENCE** — search named above |
| **Any behaviour of the sweep** | ⚠️ **NOT APPLICABLE — no sweep exists.** Nothing here is a behavioural claim |

**Surfaces:** `lib/orders/reject-order.ts`, the buzzer migration, the capture cron, `lib/time-utils.ts`,
the mode migration and demo-cleanup were each read on their own. **No fact is carried between them.**

**No span of the prompt arrived garbled.** ⚠️ **Phase 3a and the Phase 2 time-comparison rule pull against
each other in SQL — reported as Stop 2 rather than resolved by choosing.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census — nothing else was touched, and no SQL was run. The
result, the non-ASCII census and the carrier-aware per-base variation-selector figures are in the chat
reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
