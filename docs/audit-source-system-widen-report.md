# Widening the audit unions to admit `'system'`

**Done. Four TypeScript declarations widened, one migration file written, no caller added, no behaviour
changed.** No SQL was run and no migration was applied — the DDL was already done by hand.

🔴 **PHASE 1 FOUND MORE DECLARATIONS THAN THE BRIEF ANTICIPATED, AND ONE OF THEM I ALMOST MISSED.** There
are **three** declarations of the source union and **two** of the actor-kind union. The second actor-kind
declaration is an **inline object type inside `releaseHoldForTerminalOrder`** — the money path this whole
arc exists for. **All five agreed with each other**, so no stop condition tripped; had I widened only the
exported types, the release path would still have refused a `'system'` actor at compile time.

⚠️ **ONE UNREQUESTED CHANGE, comment-only, named in §Unrequested.**

---

# PHASE 1 · READ-ONLY FINDINGS

## 1 · Every declaration of both unions

### The SOURCE union — three declarations

**(a) The shared type. READ — `lib/audit/actor.ts`, identifier `ActorSource`:**

```ts
/** Where the request came from, where determinable. */
export type ActorSource = 'web' | 'native' | 'offline_replay'
```

**(b) A local literal union. READ — `lib/payments/refund.ts`, in `refundOrder`'s `args`:**

```ts
    actor: Pick<ResolvedActor, 'actorKind' | 'actorId' | 'actorLabel'>
    source: 'web' | 'native' | 'offline_replay'
```

**(c) A local literal union, optional. READ — `lib/payments/release-hold.ts`, in
`releaseHoldForTerminalOrder`'s `args`:**

```ts
    source?: 'web' | 'native' | 'offline_replay'
```

### The ACTOR-KIND union — two declarations

**(d) The shared type. READ — `lib/audit/actor.ts`, identifier `ActorKind`:**

```ts
export type ActorKind = 'owner' | 'staff' | 'token' | 'unknown'
```

**(e) 🔴 AN INLINE OBJECT TYPE, AND IT IS ON THE RELEASE PATH. READ —
`lib/payments/release-hold.ts`, the line ABOVE (c):**

```ts
    actor?: { actorKind: 'owner' | 'staff' | 'token' | 'unknown'; actorId: string | null; actorLabel: string | null }
```

⚠️ **THIS IS THE ONE THE BRIEF'S WARNING WAS ABOUT.** My first search for actor-kind unions filtered out
lines containing `actorKind:` — which excluded exactly this declaration, because it spells the union
*inside* a property. **I found it only when reading the release function's signature for the source union
directly beneath it.** ✅ **The search that does find it:**
`grep -rn "actorKind: 'owner'\|'token' | 'unknown'\|'staff' | 'token'"` — three hits, two of which are
these declarations and the third a return value.

✅ **`lib/orders/reject-order.ts` uses the IMPORTED `ActorSource`/`ResolvedActor`** and declares neither
union — so it needed no widening, and it inherits both.

## 2 · `logAction` and the row it writes

**READ — `lib/audit/actionAudit.ts`:**

```ts
export interface AuditEntry {
  action: string
  truckId: string
  orderKey?: string | null
  amountMinor?: number | null
  beforeState?: unknown
  afterState?: unknown
  actor: Pick<ResolvedActor, 'actorKind' | 'actorId' | 'actorLabel'>
  source: ActorSource
}

function row(entry: AuditEntry) {
  return {
    action: entry.action,
    truck_id: entry.truckId,
    order_key: entry.orderKey ?? null,
    amount_minor: entry.amountMinor ?? null,
    before_state: entry.beforeState ?? null,
    after_state: entry.afterState ?? null,
    actor_kind: entry.actor.actorKind satisfies ActorKind,
    actor_id: entry.actor.actorId,
    actor_label: entry.actor.actorLabel,
    source: entry.source,
  }
}

export async function logAction(supabase: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await supabase.from('action_audit_log').insert(row(entry))
    if (error) console.error(`[action-audit] insert failed for action=${entry.action} …`, error.message)
  } catch (e) { … }
}
```

✅ **`AuditEntry` takes both unions BY REFERENCE** — `ActorSource` and, through `Pick<ResolvedActor, …>`,
`ActorKind`. **So widening the shared types widens `logAction` with no edit to that file.**

⚠️ **`actor_kind: entry.actor.actorKind satisfies ActorKind`** is an assertion, not a narrowing: widening
`ActorKind` keeps it satisfied. **Nothing in `row()` enumerates members.**

🔴 **AND NOTE WHAT `logAction` DOES WITH A CHECK VIOLATION: it swallows it.** `console.error`, and on.
**That is the correct posture for a log** — *"A logging failure must NOT fail the underlying write"* — and
it is also why the constraint had to be widened before a caller exists: a 23514 would not throw, so the
sweep would report success while the audit row silently did not exist, **after the hold was cancelled at
Stripe**. ⚠️ **`logActionOrThrow` is the strict sibling and WOULD throw**; its only caller is
`undo_collected`, which this change does not touch.

## 3 · Every call site passing a source or an actor kind

| Site | Passes | Affected by widening? |
|---|---|---|
| `app/api/dashboard/action/route.ts` — **11 sites** | `source: actorSource` (from `resolveActorSource`) | ❌ No |
| `app/api/orders/cancel/route.ts:136-137` | `actorKind: 'unknown'`, `source: 'web'` | ❌ No |
| `app/api/webhooks/stripe/route.ts:734-735, 762-763` | `actorKind: 'unknown'`, `source: 'web'` | ❌ No |
| `lib/payments/online.ts:226-227` | `actorKind: 'unknown'`, `source: 'web'` | ❌ No |
| `lib/payments/release-hold.ts` internal default | `{ actorKind: 'unknown' as const, … }` | ❌ No |

✅ **NOT ONE IS AFFECTED.** Widening a union adds an admissible value; it removes none and changes the
meaning of none. **Every literal above was valid before and is valid now, and means the same thing.**

⚠️ **`resolveActorSource` still returns only the three request values** — its body is untouched:

```ts
export function resolveActorSource(req: NextRequest | Request, body: { expected_from?: unknown }): ActorSource {
  if (Array.isArray(body?.expected_from)) return 'offline_replay'
  if ((req.headers.get('user-agent') || '').includes('HatchGrabNativeApp')) return 'native'
  return 'web'
}
```

**So `'system'` cannot arrive from a request. It has to be passed deliberately, by something that has no
request — which is the point.**

## 4 · The migration convention

**The closest comparable is the last CHECK widening. READ —
`supabase/migrations/20260817_orders_payment_status_part_refunded.sql`:**

```sql
-- 20260817_orders_payment_status_part_refunded.sql
-- 🔴 ADMIT 'part_refunded'. DEPLOY-COUPLED: APPLY THIS BEFORE THE BUILD THAT WRITES IT.
--
-- ── THE DEFECT IT EXISTS FOR ───────────────────────────────────────────────────────────────────────
-- …
-- ✅ WIDENING ONLY. Every value the old constraint admitted, this one admits. No row can become
-- invalid, so it is safe to apply ahead of the deploy …
--
-- IDEMPOTENT: the DO block drops every CHECK on `orders` whose definition mentions payment_status …
--
-- VERIFY AFTER APPLYING:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'orders'::regclass and contype = 'c' …
```

**The convention, stated from what is there:**

- **Name:** `YYYYMMDD_<table>_<what>.sql`, one file per change, dated the day it is written.
- **Header:** the filename, a one-line 🔴 statement of what it admits, **ADDITIVE vs DEPLOY-COUPLED
  declared explicitly**, the defect it exists for, what it does *not* do, an idempotency note, and a
  **VERIFY** block of copy-pasteable SQL.
- **Already-applied DDL:** ✅ **the repo does record it.** `20260818_offline_protection_mode.sql` carries
  `🚫 NOT RUN. Dominic runs all SQL by hand.` — the same marker in the other state. **Several files carry
  `pg_constraint` verification queries in their headers**, so verifying against it is established practice.

✅ **Where it goes: `supabase/migrations/20260819_action_audit_log_system_actor.sql`.** Written.

## 5 · Exhaustive switches — there are none

✅ **Nothing switches on either union, and nothing maps over one.** **INFERRED FROM ABSENCE, and I name
the searches:** `grep -rn "switch (.*[Ss]ource\|switch (.*actorKind\|switch (actor"` returns **nothing**;
`grep -rn "Record<ActorKind\|Record<ActorSource"` returns **nothing**. The only uses of either type name
are four annotations — the two declarations, `AuditEntry.source`, `ResolvedActor.actorKind`,
`resolveActorSource`'s return type, and `rejectOrder`'s parameter.

⚠️ **Contrast, so the shape is clear: `emailPaymentStateFromCapture` in
`lib/payments/email-payment-state.ts` DOES switch exhaustively** on a different union, and its own comment
records a case being added when a new variant appeared. **Neither of these unions has anything like it.**

---

# PHASE 2 · STOP CONDITIONS

| Condition | Result |
|---|---|
| Widening breaks an exhaustive switch or a narrowing | ❌ **Not tripped** — none exists; `tsc` agrees |
| A union declared in more than one place, and they disagree | ⚠️ **Declared in more than one place — three and two — but ALL FIVE AGREED EXACTLY.** No pre-existing drift, so no stop |
| Instructions contradict | ❌ No |
| Garbled span | ❌ None |

🔴 **THE NEAR-MISS IS WORTH RECORDING EVEN THOUGH NOTHING TRIPPED.** The duplicates agreed *today* only
because nobody had widened one yet. **This task widened five declarations that could have been one type
reference** — and the inline one at `release-hold.ts:63` is on the money path. **Collapsing (b), (c) and
(e) onto the exported types is a separate, obvious follow-up and I did not do it here**, because it is a
refactor and this task is a widening.

---

# PHASE 3 · THE CHANGES

## a + b · The declarations, with the meaning documented

**`lib/audit/actor.ts`:**

```ts
/** Coarse identity class. 'token' and 'unknown' are NOT the same thing and must not be collapsed:
 *  …
 *  'system'  — scheduled or automatic server-side work acted; no request and no human behind it.
 *  🔴 'system' AND 'unknown' ARE OPPOSITES AND MUST NOT BE COLLAPSED EITHER. 'unknown' means the actor
 *  could not be determined; 'system' means it is known exactly and is not a person. Reading a sweep's
 *  rows as 'unknown' would make a deliberate automatic action indistinguishable from a failed lookup. */
export type ActorKind = 'owner' | 'staff' | 'token' | 'unknown' | 'system'

/** Where the request came from, where determinable.
 *  'system' — there was no request: scheduled or automatic server-side work, with no human behind it.
 *  ⚠️ NOTHING RETURNS IT YET. resolveActorSource below reads a request and therefore never produces it;
 *  it exists so a caller that has no request has an honest value instead of borrowing 'web'. */
export type ActorSource = 'web' | 'native' | 'offline_replay' | 'system'
```

**`lib/payments/refund.ts`** and **`lib/payments/release-hold.ts`** take the same two members on their
local unions. **Those are one-token edits; the surrounding lines are untouched.**

## c · The migration file

**`supabase/migrations/20260819_action_audit_log_system_actor.sql`.** Header states, in the convention's
own shape:

```sql
-- 🚫 ALREADY APPLIED. Dominic ran this by hand on 19 August 2026 and verified it against pg_constraint;
-- both constraints already read exactly what this file writes. It is recorded here so the migration
-- history matches the database, and it is IDEMPOTENT (drop-if-exists, then add), so re-running it is a
-- no-op that restores the same definitions. Do not run it again expecting it to do something.
```

**The DDL is `drop constraint if exists` then `add constraint` for each** — idempotent by construction,
and it also refreshes both column comments so the database's own documentation names `'system'`.

### 🔴 ADDITIVE or DEPLOY-COUPLED, and the deploy order

✅ **ADDITIVE. WIDENING ONLY.** Every value the old constraints admitted, the new ones admit. **No row can
become invalid, nothing is backfilled, no column or type changes.**

🔴 **THE ORDER THE DEPLOY MUST FOLLOW: MIGRATION FIRST, DEPLOY SECOND — and it is already satisfied**,
because the DDL was applied by hand before this build exists.

⚠️ **AND THE HONEST QUALIFIER: TODAY THE ORDER DOES NOT MATTER, BECAUSE NOTHING PASSES `'system'` YET.**
This build could ship against the *old* constraints without a single row failing. **It matters the moment
a caller passes `'system'` — from that build on, the migration is a hard precondition**, and getting it
wrong is a 23514 that `logAction` swallows, after the money has already moved. **That is the reason the
type and the constraint were widened while nothing uses them.**

## Unrequested changes

**One, comment-only, zero executable lines.** `lib/orders/reject-order.ts`'s header said:

> *"🔴 `source` KEEPS EXACTLY TODAY'S TYPE … and is deliberately NOT widened … its ABSENCE is the signal
> that such a caller does not exist yet, and adding a member is a separate, deploy-coupled change."*

🔴 **THIS CHANGE MAKES THAT PARAGRAPH FALSE**, in a file header, on a money path, about the exact union
being widened. **I rewrote it** to say the union now admits `'system'`, name this migration, and record
that nothing passes it yet. ⚠️ **I did not touch a line of that file's code** — its executable diff is
**0 removed, 0 added**. **Revert is that one comment block if you would rather it had been left.**

---

# PHASE 4 · VERIFICATION

## Executable line counts, per file

| File | Before | After | − | + |
|---|---|---|---|---|
| `lib/audit/actor.ts` | 86 | 86 | 2 | 2 |
| `lib/payments/release-hold.ts` | 92 | 92 | 2 | 2 |
| `lib/payments/refund.ts` | 173 | 173 | 1 | 1 |
| `lib/orders/reject-order.ts` | 73 | 73 | **0** | **0** |
| `supabase/migrations/20260819_…sql` | — | **new** | — | — |

**The complete executable diff — six lines, all of them type declarations:**

```
-export type ActorKind = 'owner' | 'staff' | 'token' | 'unknown'
+export type ActorKind = 'owner' | 'staff' | 'token' | 'unknown' | 'system'
-export type ActorSource = 'web' | 'native' | 'offline_replay'
+export type ActorSource = 'web' | 'native' | 'offline_replay' | 'system'
-actor?: { actorKind: 'owner' | 'staff' | 'token' | 'unknown'; actorId: string | null; actorLabel: string | null }
+actor?: { actorKind: 'owner' | 'staff' | 'token' | 'unknown' | 'system'; actorId: string | null; actorLabel: string | null }
-source?: 'web' | 'native' | 'offline_replay'
+source?: 'web' | 'native' | 'offline_replay' | 'system'
-source: 'web' | 'native' | 'offline_replay'
+source: 'web' | 'native' | 'offline_replay' | 'system'
```

⚠️ **Not one statement, argument, guard or string changed. There is no runtime code in this diff at all.**

## 🔴 The set comparison, EXECUTED — both sides listed, not asserted equal

A script parses the string literals **out of the files themselves** and compares them as sets against the
constraint definitions the brief quoted from `pg_constraint`:

```
SOURCE
  lib/audit/actor.ts  ActorSource            ['native', 'offline_replay', 'system', 'web']
  lib/payments/release-hold.ts (local)       ['native', 'offline_replay', 'system', 'web']
  lib/payments/refund.ts (local)             ['native', 'offline_replay', 'system', 'web']
  migration file  CHECK                      ['native', 'offline_replay', 'system', 'web']
  pg_constraint (as quoted in the brief)     ['native', 'offline_replay', 'system', 'web']
  ALL FIVE EQUAL: True
ACTOR KIND
  lib/audit/actor.ts  ActorKind              ['owner', 'staff', 'system', 'token', 'unknown']
  lib/payments/release-hold.ts (local)       ['owner', 'staff', 'system', 'token', 'unknown']
  migration file  CHECK                      ['owner', 'staff', 'system', 'token', 'unknown']
  pg_constraint (as quoted in the brief)     ['owner', 'staff', 'system', 'token', 'unknown']
  ALL FOUR EQUAL: True

stale union declarations: 0
```

⚠️ **THE FIFTH ROW IS A TRANSCRIPTION, NOT AN OBSERVATION.** I did not query the database — no SQL was
run. **That row is the constraint text as your brief quoted it**, typed into the comparison. **CANNOT
DETERMINE the live definitions independently;** `select conname, pg_get_constraintdef(oid) from
pg_constraint where conrelid = 'action_audit_log'::regclass and contype = 'c';` settles it, and it is in
the migration's VERIFY block.

## No call site's behaviour changed

✅ **Established two ways.** (1) The diff above contains **no executable statement** — only type
annotations, which are erased at build. (2) `grep -rn "source: 'system'\|actorKind: 'system'"` across
`app lib components` returns **0** — **nothing passes the new value anywhere.**

## `tsc`

`npx tsc --noEmit` **exits 0**. ⚠️ **I am not offering that as verification** — but as the brief says, a
*failure* here would have been meaningful, because a widened union is exactly what breaks an exhaustive
switch. **It did not fail, which is consistent with §5 finding no switch to break.** `next dev` and
`next build` were not run.

## Marking

| Claim | Status |
|---|---|
| The five declarations and their text | ✅ **READ** |
| `logAction`, `AuditEntry`, `row()` | ✅ **READ** |
| The call-site inventory | ✅ **READ** — grep, all sites listed |
| Set equality across all five/four sources | ✅ **EXECUTED** — parsed from the files, compared as sets |
| The live constraints match | ⚠️ **TRANSCRIBED from your brief, NOT OBSERVED.** No SQL was run |
| No exhaustive switch or `Record<>` map | ⚠️ **INFERRED FROM ABSENCE** — searches named in §5 |
| Line counts and the diff | ✅ **EXECUTED** — comment-stripped comparison against pre-change copies |
| That a `'system'` row would insert cleanly | ⚠️ **UNOBSERVED.** Nothing writes one, and nothing was run against the database |

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the four source files,
the migration and this report.** The result, the non-ASCII census of characters introduced, and the
carrier-aware variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
