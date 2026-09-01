# WhatsApp reply cap v2 — decision core and handoff message

**Date:** 25 August 2026
**Build only. NOT committed, NOT pushed, NOT deployed.** `next dev` was not run.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another. **No stop condition
was reached** — §3.1 records the one place a stop was on the table and why it was not needed.

🔴 **THE PREVIOUS EXECUTION TABLE IS VOID AND IS NOT CITED ANYWHERE BELOW.** The signature changed; §4
is a fresh run of the real exported function.

---

# §1 — THE READS, BEFORE ANY EDIT

## 1.1 THE EXPORTED SURFACE AS IT WAS

```ts
  export const MAX_REPLIES_PER_CUSTOMER_24H = 10
  export const MAX_REPLIES_PER_TRUCK_DAY    = 300
  export const CLASSIFICATION_CUSTOMER_CAP = 'CAP_CUSTOMER_24H'
  export const CLASSIFICATION_TRUCK_CAP    = 'CAP_TRUCK_DAY'
  export type ReplyCapDecision = 'REPLY' | 'NOTIFY_CUSTOMER_CAP' | 'SILENT_TRUCK_CAP'
  export interface ReplyCapCounts {
    customerReplies24h: number
    truckRepliesToday: number
    customerCapNoticeSent: boolean
  }
  export function decideReplyCap(counts: ReplyCapCounts): ReplyCapDecision
```

**Two constants, two classifications, a three-member union, and a decision taking a single `counts`
object — no limit parameter.**

## 1.2 THE HANDOFF TEMPLATE AS IT WAS

```ts
  const hgUrlCap = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
  const orderLink = truck.slug ? `${hgUrlCap}/trucks/${truck.slug}/order` : ''
  const capMessage =
    `Thanks for all your messages! I can only reply a few times a day here.\n\n` +
    (orderLink ? `To order: ${orderLink}\n` : '') +
    (truck.whatsapp ? `To reach us directly: ${truck.whatsapp}` : `Please contact ${truck.name} directly.`)
```

**Substitutes three truck fields:** `truck.slug` (order link), `truck.whatsapp` (contact), **and
`truck.name` — inside the fallback clause.** All three are selected in `TRUCK_FIELDS` at `route.ts:22-23`
(`id, name, slug, truck_emoji,` / `whatsapp_sender, whatsapp, phone_number_id,`).

🔴 **THE FALLBACK IS EXACTLY WHAT THIS SPEC FORBIDS.** *"Please contact {name} directly."* told the
customer to do the one thing the message had just failed to help them do. **Removed — §3.2.**

## 1.3 THE TIMEZONE EXPRESSION

```ts
  // Single tz swap point: → truck.timezone ?? 'Europe/London' once that column exists.
  const truckTz = 'Europe/London'
```

🔴 **A BARE CONSTANT.** Not a column, not a column-with-fallback. ⚠️ **And the comment beside it is
wrong on a fact you supplied:** it says *"once that column exists"* — `trucks.timezone` **does** exist and
is NULL on all twelve trucks. **The comment was left as found** (it is not in this task's scope) but the
month boundary now records the accurate position — §3.3.

## 1.4 🔴 THE PER-TRUCK COUNT FETCHED ROWS. PLAINLY.

```ts
  supabase.from('whatsapp_logs')
    .select('created_at, classification')      // ← rows, not a count
    .eq('truck_id', truck.id)
    .not('response_sent', 'is', null)
    .gte('created_at', since26h)
  …
  truckRepliesToday: (day.data ?? []).filter(…).length     // ← lengthed in JS
```

**It fetched rows and took `.length`.** ⚠️ **That day read STAYS as-is — you ruled the existing wiring
correct, and the count-only requirement is scoped to the MONTH.** The day window still needs the rows,
because its boundary is applied in JS by local date.

---

# §2 — THE DECISION CORE

## 2.1 THE CONSTANTS

```ts
  export const DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H = 3
  export const MAX_REPLIES_PER_TRUCK_MONTH = 2000
  export const MAX_REPLIES_PER_TRUCK_DAY = Math.ceil(MAX_REPLIES_PER_TRUCK_MONTH / 10)
```

✅ **DERIVED, NOT A SECOND LITERAL** — a grep for `= 200` in the module returns nothing, and execution
confirms `ceil(2000/10) = 200 → MAX_REPLIES_PER_TRUCK_DAY = 200` **MATCH**.

✅ **The month ceiling is commented as a RUNAWAY CEILING, not a budget lever**, and must not be lowered
into budget territory until an operator notification exists — *"a truck that silently exhausts its month,
with nobody told, looks exactly like a truck whose WhatsApp integration has broken … A cap nobody is told
about is an outage with a good excuse."*

## 2.2 FOUR CLASSIFICATIONS, AND NO LITERAL ANYWHERE ELSE

```ts
  CLASSIFICATION_CUSTOMER_CAP      = 'CAP_CUSTOMER_24H'
  CLASSIFICATION_CUSTOMER_NOTIFIED = 'CAP_CUSTOMER_NOTIFIED'
  CLASSIFICATION_TRUCK_DAY_CAP     = 'CAP_TRUCK_DAY'
  CLASSIFICATION_TRUCK_MONTH_CAP   = 'CAP_TRUCK_MONTH'
  CAP_CLASSIFICATIONS: readonly string[]        // all four, in one place
  isCapClassification(c): boolean               // so no caller ever lists them
```

✅ **A grep across `app/` and `lib/` for any of the four as a quoted literal, excluding the module,
returns NOTHING.** The route's row filter is now `isCapClassification(c)` and its SQL exclusion is built
from `CAP_CLASSIFICATIONS.join(',')`.

## 2.3 THE LIMIT IS A PARAMETER, PROVEN

```ts
  export interface ReplyCapInput { …; maxRepliesPerCustomer24h: number }
```
✅ **`DEFAULT_MAX_REPLIES_PER_CUSTOMER_24H` appears ZERO times inside `decideReplyCap`** — verified by
scanning the function body. It reads `input.maxRepliesPerCustomer24h` only.

✅ **Proven by execution, not by inspection:** passing `5` with a count of `4` returns **REPLY** and with
`5` returns **NOTIFY_CUSTOMER_CAP` — impossible if the module constant (3) were being read.

The comment names the future one-liner: *"pass `truck.max_replies_per_customer ?? DEFAULT_…` instead of
the bare default"*, intended ceiling 5.

## 2.4 PRECEDENCE AND THE DEFECT FIX

```ts
  if (truckRepliesThisMonth >= MAX_REPLIES_PER_TRUCK_MONTH) return 'SILENT_TRUCK_MONTH_CAP'
  if (truckRepliesToday     >= MAX_REPLIES_PER_TRUCK_DAY)   return 'SILENT_TRUCK_DAY_CAP'
  if (customerReplies24h    >= input.maxRepliesPerCustomer24h)
    return customerCapNoticeSent ? 'SILENT_CUSTOMER_ALREADY_NOTIFIED' : 'NOTIFY_CUSTOMER_CAP'
  return 'REPLY'
```

✅ **Month → day → customer**, with the reason recorded: *"A truck over its ceiling sends nothing at all
— not even the handoff, because the handoff is itself a billable message … The wider window wins because
it is the one with money attached."* ✅ **All three `>=` — inclusive.**

🔴 **THE DEFECT IS FIXED AND THE FIX IS THE POINT.** The old code returned the truck-day member for an
already-notified customer, so a truck at **zero** replies wrote a row claiming it had hit its daily
ceiling. §4 shows that case now returning `SILENT_CUSTOMER_ALREADY_NOTIFIED`. The comment records why it
mattered: *"`whatsapp_logs` IS THE TABLE WE WILL READ TO JUDGE WHETHER THESE LIMITS ARE SET RIGHT, and it
was reporting caps that never happened — in the direction that would have made the day limit look too
tight and invited someone to raise it."*

---

# §3 — THE HANDOFF, THE MONTH WINDOW, THE COUNTS

## 3.1 ✅ COUNT-ONLY WAS POSSIBLE, SO NO STOP WAS NEEDED

You said to stop rather than fetch rows if the client could not do it. **It can** — `@supabase/supabase-js
2.108.1`, and the pattern is already used three times in this codebase (`lib/account-deletion.ts:140`,
`lib/provision-demo.ts:147`, `app/api/admin/provision-demo/route.ts:66`).

```ts
  supabase.from('whatsapp_logs')
    .select('*', { count: 'exact', head: true })
    .eq('truck_id', truck.id)
    .not('response_sent', 'is', null)
    .gte('created_at', monthStart)
    .or(`classification.is.null,classification.not.in.(${CAP_CLASSIFICATIONS.join(',')})`)
```

✅ **`month.data` is referenced ZERO times — only `month.count`.** No month of rows enters memory.

🔴 **THE `or` IS NOT STYLISTIC AND THE COMMENT SAYS SO.** A plain `.not('classification','in',…)`
evaluates to NULL for a NULL classification and Postgres **drops those rows**, silently undercounting.
The `or` keeps them.

## 3.2 THE HANDOFF — A WHOLE CLAUSE, PRESENT OR ABSENT

Both variants are exported from the pure module (`handoffMessageWithContact`,
`handoffMessageWithoutContact`, plus `handoffMessage` which picks). **Null, empty and whitespace-only are
all treated as absent** — proven across all three in §4.

✅ **The order link is unconditional** (slug is non-null on all twelve). ✅ **No fallback string, no
placeholder, no empty clause.** ✅ **No precondition refuses to send** — a handoff without a phone
number is still a handoff, because the order link always works.

⚠️ **Recorded in the module:** *"THE HANDOFF IS ITSELF A BILLABLE MESSAGE. A per-customer limit of 3
therefore yields THREE replies PLUS ONE handoff — four billable messages, not three."*

## 3.3 THE MONTH BOUNDARY — ✅ NO NEW TIMEZONE HELPER

The local month start is converted to an instant (which a count-only query requires) by **binary search
using `localDateOfInstant` alone** — the same primitive the day boundary uses. ~13 `Intl` calls, not a
loop over minutes. **Nothing was added to `lib/time-utils.ts`.**

🔴 **THE UK-ONLY ASSUMPTION IS RECORDED AT THE BOUNDARY, IN THOSE WORDS:**

> 🔴 `truckTz` IS 'Europe/London', A BARE CONSTANT — AND `trucks.timezone` IS NULL ON ALL TWELVE TRUCKS.
> The column exists and nothing populates it, so a `?? 'Europe/London'` would not be a fallback: **it is
> the ONLY BRANCH THAT EVER RUNS. This is a UK-ONLY ASSUMPTION, not a defensive default.**
> ⚠️ A wrong timezone on the DAY boundary shifts a cap by an hour. On the MONTH boundary it shifts **A
> WHOLE BILLING PERIOD — silently, and in the direction of a cap that RESETS EARLY**, i.e. a ceiling that
> quietly stops being a ceiling.

✅ **And that month ≠ WABA billing cycle:** *"Meta's cycle starts on whatever day the account was created
and is not exposed to us. This is a PROXY, deliberately — it becomes per-truck and real when Embedded
Signup ships."*

---

# §4 — EXECUTION. THE REAL EXPORTED FUNCTION, RE-RUN.

🔴 **I DID ALL THREE — a parse, a typecheck (`npx tsc --noEmit`, exit 0), AND AN EXECUTION.** The table
below is the execution: the module transpiled by the TypeScript compiler and the real exports called.
**The typecheck is not what proves any row of it.**

```
  CONSTANTS   customer default=3    truck/day=200 (derived)    truck/month=2000
  derivation  ceil(2000/10) = 200  ->  MAX_REPLIES_PER_TRUCK_DAY = 200   MATCH
  classes     CAP_CUSTOMER_24H  CAP_CUSTOMER_NOTIFIED  CAP_TRUCK_DAY  CAP_TRUCK_MONTH

  case                                cust   day    month  notified  → decision
  ----------------------------------  -----  -----  -----  --------  --------------------------------
  customer: one UNDER                 2      0      0      false     REPLY
  customer: EXACTLY AT                3      0      0      false     NOTIFY_CUSTOMER_CAP
  customer: one OVER                  4      0      0      false     NOTIFY_CUSTOMER_CAP
  truck DAY: one UNDER                0      199    0      false     REPLY
  truck DAY: EXACTLY AT               0      200    0      false     SILENT_TRUCK_DAY_CAP
  truck DAY: one OVER                 0      201    0      false     SILENT_TRUCK_DAY_CAP
  truck MONTH: one UNDER              0      0      1999   false     REPLY
  truck MONTH: EXACTLY AT             0      0      2000   false     SILENT_TRUCK_MONTH_CAP
  truck MONTH: one OVER               0      0      2001   false     SILENT_TRUCK_MONTH_CAP
  ALREADY NOTIFIED, truck at ZERO     3      0      0      true      SILENT_CUSTOMER_ALREADY_NOTIFIED
  customer over + truck DAY over      3      200    0      false     SILENT_TRUCK_DAY_CAP
  customer over + truck MONTH over    3      0      2000   false     SILENT_TRUCK_MONTH_CAP
  ALL THREE at once                   3      200    2000   false     SILENT_TRUCK_MONTH_CAP
  param=5, count 4 (must REPLY)       4      0      0      false     REPLY
  param=5, count 5 (must NOTIFY)      5      0      0      false     NOTIFY_CUSTOMER_CAP
```

✅ **The required outcome holds: already-notified on a truck at ZERO returns the CUSTOMER member, not a
truck one.**

## 4.1 THE TWO TEMPLATES, EXACT OUTPUT

**WITH a contact number** (`'07380 736226'`):
```
Thanks for all your messages! I can only reply a few times a day here.

To order: https://www.hatchgrab.com/trucks/test-truck/order
To reach us directly: 07380 736226
```

**WITHOUT — identical for `null`, `''` and `'   '` (all three run, all three byte-identical):**
```
Thanks for all your messages! I can only reply a few times a day here.

To order: https://www.hatchgrab.com/trucks/test-truck/order
```

✅ **No trailing clause, no trailing newline, no placeholder.** The absent case simply ends after the
order link.

---

# §5 — SCOPE, AND THE WIRING THAT STAYED

| Contract | Result |
|---|---|
| Shared reply function / classifier | ✅ **`lib/whatsapp-classifier.ts` UNMODIFIED** |
| Dormant Twilio handler | ✅ **`app/api/webhooks/whatsapp/route.ts` UNMODIFIED** |
| Operator UI, trucks column, plan tiering, notification, migration | ✅ **none added** |
| Files changed | `lib/whatsapp/reply-cap.ts` (rewritten) · `app/api/webhooks/meta/whatsapp/route.ts` (rewired) |

**The wiring you ruled correct is intact, checked by token:** the 26-hour fetch (`since26h` ×2), the
local-date filter (`localDateOfInstant(r.created_at, truckTz) === today`), the fail-open block
(`FAILING OPEN`, `capDecision = 'REPLY'`) with its `OPPOSITE DIRECTION TO THE SIGNATURE GATE` reasoning,
the position after the plan gate and before the reply call, and **ten `{ ok: true }` returns**.

⚠️ `docs/reference-manual.md`, `docs/pre-reply-tree-check-report.md` and `docs/whatsapp-reply-cap-report.md`
are in the tree from earlier tasks, untouched by this one.

---

# §6 — UNOBSERVED

1. 🔴 **NO INBOUND MESSAGE HAS EVER HIT THIS CODE.** No cap has fired, no log row exists, no handoff has
   been sent or seen. **Only the pure function was executed; the wiring around it was typechecked.**
2. 🔴 **THE COUNT-ONLY QUERY HAS NEVER RUN.** ⚠️ The `.or(classification.is.null,…not.in.(…))` filter is
   PostgREST syntax I reasoned about and did not execute — **if it is malformed it throws, which the
   fail-open catch turns into "reply anyway", so a broken month cap fails as NO CAP AT ALL and silently.**
   That is the single most valuable thing to exercise first.
3. 🔴 **THE MONTH BOUNDARY SEARCH HAS NEVER RUN.** It is exact by construction over a ±18h band, but a
   wrong boundary fails as an under-count — a ceiling that resets early (§3.3).
4. ⚠️ **`MAX_REPLIES_PER_TRUCK_MONTH = 2000` still has no traffic behind it.** It is a runaway ceiling
   chosen without data, as the module says.
5. ⚠️ **Nothing tells an operator a cap fired.** No surface reads `whatsapp_logs`; that remains the known
   gap this ceiling is explicitly not allowed to become a budget lever until it is closed.
