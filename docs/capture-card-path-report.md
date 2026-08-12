# Capture on the card path, and the blind spot around it

**Date:** 12 August 2026
**BUILD.** No `next dev`, no `next build`. Nothing committed. Nothing deployed.
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE SHORT VERSION

| | |
|---|---|
| **Capture now fires on the card path** | `lib/payments/promote-draft.ts:366`, gated on `if (autoAccepted)` and nothing else |
| **The false comment** | corrected at `submit/route.ts:1058-1073`, and the site map went from "1 of 3" to "1 of 4" |
| **The blind spot** | a read-only SQL finder + a `*/15` cron that **captures and can never cancel**, plus two new audit actions |
| **What you would see** | the board flips to PAID by itself; `capture_missing` / `capture_recovered` / `capture_failed` in `action_audit_log`; `stillStranded` in the cron's JSON |
| **Your one-off script** | `node scripts/list-stranded-authorisations.cjs` — **run it now, it needs no migration** |
| **🔴 MIGRATION FOR YOU TO RUN** | `supabase/migrations/20260815_find_stranded_authorisations.sql` |
| **Non-ASCII census** | 🔴 **NO FILE GAINED A CHARACTER CLASS.** Every distinct set is byte-identical before and after |

**And the answer you actually wanted, measured just now:**

```
🔴 #18    STRANDED      £6.00    confirmed    pi_3U3fB52fB4PPCw2D1VD1opZI   requires_capture capturable=600
🔴 #19    STRANDED      £6.50    confirmed    pi_3U3iwC2fB4PPCw2D0DwOxtVU   requires_capture capturable=650
🔴 STRANDED: 2 order(s), £12.50 held and never taken.
```

✅ **18 AND 19 ARE THE ONLY TWO.** Every other promoted card order in the database has a ledger row.

---

## 1. Capture on the card path

**The call site, quoted in full** — `lib/payments/promote-draft.ts:365-373`, immediately after the event lock is released and **before** the emails:

```ts
    let captureNote = 'no authorisation'
    if (autoAccepted) {
      const cap = await captureOnConfirmation(supabase, {
        orderKey: draft.order_key, truckId: draft.truck_id, trigger: 'promote_auto_accept',
      })
      captureNote = cap.status
    } else if (draft.payment_intent_id) {
      captureNote = 'held, pending confirmation'
    }
```

### 🔴 The condition is `autoAccepted`, and that is the same value the insert wrote

```ts
          status:         autoAccepted ? 'confirmed' : 'pending',
```

The gate is not a re-read, not a status string comparison, and not an inference. It is **the identical local variable** the order row was built from, forty lines earlier in the same function. There is no window in which one could be true and the other false, so "capture follows confirmation" is a property of the code rather than a convention someone has to maintain.

**A promoted order that lands `pending` therefore cannot capture.** Verified against a real order and a real hold in §(b): order #22 landed `pending`, no ledger row was written, and Stripe still reported `requires_capture capturable=650`.

### Three placement decisions, each stated at the line

- **Outside the event lock.** Capture is a Stripe round trip; holding a per-truck, per-day lock across it would stall every other order for that service while the network answers.
- **Before the two emails.** Money first. An invocation killed during a slow mail send must not be what loses a capture — that is the failure being closed, and putting capture behind it would rebuild it.
- **Awaited, and it cannot throw.** `captureOnConfirmation` returns every failure as a value. The order is already committed by this line.

### ⚠️ One honest cost, flagged rather than done quietly

For an **auto-accepted** card order the confirmation email now goes out about a second *after* the money moved, and it still says *"Your card is held, not charged."* That is stale.

I did **not** change it, because `formatConfirmationEmail`'s `cardHeld` parameter has exactly two branches and the other one says **"Pay at the truck on collection"** — telling a customer who has just been charged to pay again, which is the double-payment bug the `cardHeld` branch was added to kill. The load-bearing sentence, *"nothing to pay at the truck"*, is true either way.

**The honest fix is a third branch — a "paid" one — and that is a change to a held-authorisation surface, which this brief puts out of scope.** It is written into the code at `promote-draft.ts:377-387` rather than left for someone to rediscover.

---

## 2. The comment at the pay-at-hatch site

It asserted a premise true of one path and false of the other. **What I wrote** (`app/api/orders/submit/route.ts:1058-1073`):

```ts
    // ── 🔴 CAPTURE SITE 1 of 4: AUTO-ACCEPT ON THE PAY-AT-HATCH PATH, AND ONLY THAT PATH. ─────────
    // 🔴 THIS COMMENT USED TO CLAIM MORE THAN THE CODE DOES, AND THAT COST AN ORDER ITS CAPTURE.
    // It read: "Auto-accept writes 'confirmed' in the SAME INSERT as the order, inside
    // place_order_atomic, so there is no separate confirmation write to hook." That is true of a
    // pay-at-hatch order and FALSE of a card one. A CARD ORDER NEVER REACHES THIS LINE: its fork
    // returns at :820 with a client secret, 248 lines above here, and its order is created later by
    // lib/payments/promote-draft — which decides auto-accept itself and writes 'confirmed' itself.
    // So this site captures pay-at-hatch auto-accepts. The CARD auto-accept is capture site 4, in
    // promote-draft's step 8a, and the two are separate because the code paths are separate.
    // ⚠️ IF YOU ADD A THIRD WAY TO CREATE AN ORDER, IT NEEDS ITS OWN CAPTURE CALL. There is no shared
    // choke point below the fork; `grep -rn "captureOnConfirmation(" app lib` is the whole list.
```

⚠️ **I ALSO RENUMBERED SITES 2 AND 3, WHICH IS ONE EDIT BEYOND THE BRIEF AND I AM DECLARING IT.** Leaving "site 2 of 3" and "site 3 of 3" standing next to a new fourth site would have been a documentation defect I created in this build. `git diff` proves both files changed **comment lines only**:

```
$ git diff -U0 app/api/orders/submit/route.ts | grep -vE "^[+-]\s*//" …
(end)                                                 <- zero non-comment changed lines
$ git diff -U0 app/api/dashboard/action/route.ts | grep -vE "^[+-]\s*//" …
(end)                                                 <- zero non-comment changed lines
```

**The site map is now:**

| Site | Where | Trigger |
|---|---|---|
| 1 | `submit/route.ts:1078` | `auto_accept` — pay-at-hatch only |
| 2 | `action/route.ts:231` | `confirm` — operator, and every offline replay |
| 3 | `action/route.ts:1673` | `time_adjust` |
| 4 | 🔴 **`promote-draft.ts:367`** | `promote_auto_accept` — **the card path, new** |
| — | `stranded-authorisations.ts:165` | `stranded_sweep` — the backstop, not a confirmation |

---

## 3. 🔴 THE BLIND SPOT

### The mechanism I chose, and why not yours

Your framing was right and I kept the question — *what finds an authorisation that was promoted, should have been captured, and was not* — but I did not take the implied answer of widening the existing sweep. Three reasons:

1. **The existing sweep's verb is CANCEL.** Teaching a job that releases money to sometimes take money instead is how a future edit releases a hold it meant to capture. The two jobs now **partition** the space and cannot collide: `promoted_at IS NULL` for the canceller, `promoted_at IS NOT NULL` for this one. Complementary predicates, no ordering requirement, no race.
2. **The predicate is an anti-join and PostgREST cannot express one.** A TypeScript loop must page every promoted draft that ever had an intent — every card order ever taken — and filter in memory. That works on today's tens of rows and silently stops finding old strandings the moment the limit is smaller than the history. **A silent cap on a money query is the same class of failure being closed**, so the join went where joins belong.
3. **The audit log could not have been the answer, and it is worth being precise about why.** `capture_failed` only exists when something *tried*. Nothing tried. **An unattempted action leaves no trace anywhere** — which is exactly why three safety nets all read clean over £12.50.

### What I built

| File | What |
|---|---|
| 🔴 `supabase/migrations/20260815_find_stranded_authorisations.sql` | **YOU RUN THIS.** One read-only function. Creates and alters nothing |
| `lib/payments/stranded-authorisations.ts` | the finder + the recovery loop + the audit records |
| `app/api/cron/capture-stranded-authorizations/route.ts` | the schedule's entry point, `?dry=1` to preview |
| `vercel.json` | one cron entry, `*/15 * * * *` |

**The predicate:**

```sql
    d.payment_intent_id is not null
    and d.promoted_at is not null
    and d.authorization_cancelled_at is null
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
    and d.promoted_at < now() - make_interval(mins => greatest(coalesce(p_grace_minutes, 10), 0))
    and not exists (
      select 1 from order_payments p
      where p.idempotency_key = 'stripe_pi:' || d.payment_intent_id
    )
```

`'collected'` is present deliberately: an order **handed over** without its money taken is the worst case, not an excluded one.

### When it finds one

1. 🔴 **`console.error`, every run.** The count per day is the signal.
2. 🔴 **`capture_missing` in `action_audit_log`, once per order ever** (deduplicated by an indexed read on `order_key`). Written **before** any repair is attempted — a silent self-heal is how a defect survives for months.
3. **It captures**, via the same `captureOnConfirmation` every confirmation site calls, with `trigger: 'stranded_sweep'`.
4. On success → **`capture_recovered`**. A recovery is a defect report, not a success story.
5. On `expired` → it **marks the draft's authorisation cancelled** and shouts that the customer owes money at the hatch. That is the truth, not a silencer: Stripe has said the hold is gone, so `authorization_cancelled_at` is accurate, the CARD HELD chip correctly disappears, and — critically — this stops an unrecoverable order generating a Stripe call and a `capture_failed` row every fifteen minutes forever.
6. On `failed` (transient) → left alone and retried. `captureOnConfirmation` writes `capture_failed` itself.

### 🔴 WHY IT CANNOT CANCEL A HOLD LEGITIMATELY AWAITING CONFIRMATION

**Two independent reasons. Either alone would be sufficient; both are present because this runs unattended against real money.**

**First — a pending order is never returned.** `o.status` is an **ALLOW-list** and `'pending'` is absent from it. Deliberately an allow-list, not a deny-list: a status added to `orders_status_check` in future is excluded until a human decides otherwise, rather than silently inheriting capture.

**Second — there is no cancellation verb anywhere in the mechanism.** `grep -n "cancelAuthorization\|paymentIntents.cancel"` across the new route and the new module returns **nothing**. The only Stripe call reachable from this cron is `paymentIntents.capture`, inside `captureOnConfirmation`. Even a future edit that broke the predicate could only capture the wrong order — which the three idempotency layers make a no-op — never release the right one.

**And it is proved by data, not by argument.** In verification §(b), order #22 sat `pending` with a live £6.50 hold. `list-stranded-authorisations --all` classified it **`PENDING-OK`** and the default run excluded it entirely.

### ⚠️ One thing this does not close

The finder joins `order_drafts` to `orders`. **A promoted draft with no order row** — promotion claimed the draft and then failed to insert — has no status to test and so is invisible to the SQL function. The one-off script **does** show it, marked `CHECK BY HAND`, because it is money held against nothing at all. It is a different defect with a different fix (`markPromotionFailed` plus a release), and I have not built for it here.

---

## 4. What an operator, or you, would see

**It is not silent at four levels, and the first one needs nobody to look.**

| Who | Where | What |
|---|---|---|
| 🔴 **The operator, passively** | the board | **The order flips from `CARD HELD` to `PAID` by itself.** The recovery writes the ledger row; `readHeldAuthorisations` excludes captured intents and `getOrderBalance` reads the ledger. **No display code changed** — the existing surfaces simply start reading a true fact |
| **The operator, when it cannot be fixed** | the board | The order **keeps** saying `CARD HELD` (a `failed`), or reverts to reading as owing money at the hatch (an `expired`, once marked). Either way they are told to collect, which is correct |
| 🔴 **You, durably** | `action_audit_log` | One query: `select * from action_audit_log where action in ('capture_missing','capture_recovered','capture_failed') order by created_at desc;` |
| **You, live** | the cron's JSON | `{ ok, dryRun, examined, recovered, stillStranded, outcomes[] }` — **`stillStranded > 0` is the field that matters** |
| **You, on demand** | the terminal | `node scripts/list-stranded-authorisations.cjs` |

### 🔴 AND IT REFUSES TO REPORT "NOTHING WRONG" WHEN IT CANNOT ASK

```ts
  if (!res.ok) {
    console.error('[cron/capture-stranded] 🔴 THE BACKSTOP COULD NOT RUN — stranded money, if any, is undetected:', res.error)
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 })
  }
```

A backstop that answers `examined: 0` because its own query failed converts an outage into a clean bill of health, and Vercel's cron dashboard would show a green tick over an unanswered question. **Proved, live, right now** — the migration is not yet applied, so:

```
[stranded] 🔴 COULD NOT ASK WHETHER ANY ORDER IS STRANDED: Could not find the function public.find_stranded_authorisations(...)
listStrandedAuthorisations -> {"ok":false,"error":"Could not find the function public.find_stranded_authorisations(p_grace_minutes, p_limit) in the schema cache"}
```

⚠️ **What I did NOT build: an email or push alert.** There is no existing channel for a platform-fault alert to a truck, the recovery is automatic in the ordinary case, and inventing a notification path would be a materially larger change than the brief. **The trade, stated: nothing pages you at 3am.** If `stillStranded` stays non-zero, the only thing that surfaces it is the audit query or the script.

---

## 5. The one-off script

```bash
node scripts/list-stranded-authorisations.cjs                # accepted orders holding uncaptured money
node scripts/list-stranded-authorisations.cjs --all          # also show PENDING holds, marked PENDING-OK
node scripts/list-stranded-authorisations.cjs --no-stripe    # database only, no Stripe calls
node scripts/list-stranded-authorisations.cjs --json
```

✅ **READ-ONLY. Three SELECTs plus one Stripe `retrieve` per row.** There is no insert, update, delete, capture or cancel anywhere in the file.
✅ **IT NEEDS NO MIGRATION.** It mirrors the predicate in JavaScript on purpose, so you can run it before applying the SQL. If the two ever disagree, **the SQL function is right and the script is stale.**
⚠️ **No sandbox guard, unlike the scripts that move money** — `retrieve` changes nothing, and refusing a live key would make it useless in production, which is exactly where an unnoticed hold costs a real truck real money. The mode is printed on every run.

**Actual output, just now:**

```
Stripe mode : SANDBOX (sk_test_)
Promoted drafts with an uncancelled authorisation : 2
Of those, not captured                            : 2 (accepted orders only; --all to include pending)

🔴 #18    STRANDED      £6.00    confirmed    pi_3U3fB52fB4PPCw2D1VD1opZI
     truck=test-truck  order_key=3a621e2f-92b6-4d70-9d37-c5a0e469426c
     promoted=2026-08-12T16:39:30.604+00:00  orders.payment_status=unpaid  stripe=requires_capture capturable=600 received=0
🔴 #19    STRANDED      £6.50    confirmed    pi_3U3iwC2fB4PPCw2D0DwOxtVU
     truck=test-truck  order_key=a06c2090-99bd-40da-9f3c-10c5779b964f
     promoted=2026-08-12T20:40:21.021+00:00  orders.payment_status=unpaid  stripe=requires_capture capturable=650 received=0

🔴 STRANDED: 2 order(s), £12.50 held and never taken.
```

🔴 **BOTH HOLDS ARE STILL LIVE AT STRIPE.** They will expire around 19 and 20 August and the truck will never be paid. Once the migration is applied, `GET /api/cron/capture-stranded-authorizations` takes both.

---

# VERIFICATION

**Method:** the **real** TypeScript modules, loaded through `jiti` with the `@/` alias, against the **real** database and the **real** Stripe sandbox on `acct_1U30w22fB4PPCw2D`. No mocks. `BREVO_API_KEY` deleted from the harness environment so no email could leave.

## 🔴 WRITES DECLARED

| Write | Cleanup |
|---|---|
| 3 `order_drafts` rows | ✅ deleted |
| 3 `orders` rows (#21, #22, #23) | ✅ deleted |
| 2 `order_payments` rows | ✅ deleted |
| 3 sandbox PaymentIntents (2 captured, 1 cancelled) | ⚠️ **NOT reversible.** Sandbox test data on the connected account; £13.00 of fake money |
| `production_slot_usage` for 2026-08-13 | ✅ `rebuildProductionSlotUsage` re-run after deletion |
| 3 display numbers (#21, #22, #23) consumed | ⚠️ **NOT reversible.** The counter does not go backwards; the next real order is #24 |
| 1 `action_audit_log` row (`capture_failed`) | ⚠️ **NOT deleted, ON PURPOSE.** That table is append-only and nothing in this codebase may ever delete from it |

**Cleanup proved:**
```
cleaned 36f8a257-…  payments=ok order=ok draft=ok
cleaned 49fca838-…  payments=ok order=ok draft=ok
cleaned 834b84d6-…  payments=ok order=ok draft=ok
production_slot_usage rebuilt for test-truck 2026-08-13
residual drafts/orders/payments: 0 0 0
```
And the finder re-run afterwards reports **exactly 18 and 19** — the database is back where it started.

## (a) 🔴 AN AUTO-ACCEPTED CARD ORDER CAPTURES

```
[A] draft=36f8a257-… pi=pi_3U3jMR2fB4PPCw2D1ZqhBUN1 status=requires_capture
[capture] CAPTURED order_key=36f8a257-… pi=pi_3U3jMR2fB4PPCw2D1ZqhBUN1 amount_minor=650 trigger=promote_auto_accept -> status=paid
[promote:redirect] PROMOTED draft=36f8a257-… -> order #21 truck=test-truck slot=18:00 status=confirmed capture=captured
[A] order      : #21 status=confirmed payment_status=paid amount_paid=6.5
[A] ledger     : [{"idempotency_key":"stripe_pi:pi_3U3jMR2fB4PPCw2D1ZqhBUN1","amount_minor":650,"state":"succeeded","channel":"online"}]
[A] stripe     : status=succeeded capturable=0 received=650
[A] CARD HELD? : false
```

✅ `requires_capture` → **`succeeded`**. ✅ **exactly one** ledger row. ✅ order reads **`paid`, £6.50**. ✅ the CARD HELD chip correctly clears itself.

## (b) 🔴 A CARD ORDER THAT LANDS PENDING DOES NOT CAPTURE, AND ITS HOLD IS INTACT

```
[promote:redirect] PROMOTED draft=49fca838-… -> order #22 truck=test-truck slot=18:00 status=pending capture=held, pending confirmation
[B] order      : #22 status=pending payment_status=unpaid amount_paid=null
[B] ledger     : []
[B] stripe     : status=requires_capture capturable=650 received=0
[B] CARD HELD? : true
[B] draft      : {"promoted_at":"2026-08-12T21:07:00.108+00:00","authorization_cancelled_at":null}
```

✅ **No ledger row.** ✅ **`requires_capture`, £6.50 still capturable, £0 received — the hold is untouched.** ✅ `authorization_cancelled_at` still null. ✅ The board shows CARD HELD, which is exactly right. And `--all` classified this same row **`PENDING-OK`**, excluded from the default run.

## (c) 🔴 IT CAPTURES WHEN THE OPERATOR CONFIRMS — THROUGH THE REAL ROUTE HANDLER

Not a direct call to the capture function: the actual `POST` export of `app/api/dashboard/action/route.ts`, with the truck's real `dashboard_token`, on the **same order #22** left pending by (b).

```
[C] POST /api/dashboard/action {action:confirm} -> 200 {"success":true,"status":"confirmed"}
[capture] CAPTURED order_key=49fca838-… pi=pi_3U3jMV2fB4PPCw2D1zGOmCq6 amount_minor=650 trigger=confirm -> status=paid
[C] order      : #22 status=confirmed payment_status=paid amount_paid=6.5
[C] stripe     : status=succeeded capturable=0 received=650
[C] CARD HELD? : false
```

✅ The existing site 2 captured a hold that promotion deliberately left alone. ⚠️ One noise line: `[actor] identity resolution failed … cookies was called outside a request scope` — the route's own `resolveActorSafe`, degrading to `actor_kind: 'unknown'` exactly as designed when there is no Next request scope. A harness artefact, not a defect.

## (d) 🔴 A FAILING CAPTURE LEAVES THE ORDER CONFIRMED, AND IS FINDABLE

The hold was cancelled **at Stripe, behind the system's back** — the closest real analogue to an expired authorisation.

```
[capture] 🔴 AUTHORISATION GONE for order_key=834b84d6-… (confirm): This PaymentIntent could not be captured
          because it has a status of canceled… The order IS confirmed and the customer has NOT paid.
[D] captureOnConfirmation -> {"status":"expired","paymentIntentId":"pi_3U3jMa2fB4PPCw2D0yCwrzWV", …}
[D] order      : #23 status=confirmed payment_status=unpaid amount_paid=null
[D] ledger     : []
[D] CARD HELD? : true
```

✅ **The order stayed `confirmed`.** Confirmation did not fail because money did not move — the whole point of the function being unable to throw. ✅ No ledger row was invented.

**And here is where you find it** — `action_audit_log`:

```json
[{ "action": "capture_failed",
   "order_key": "834b84d6-58d0-4015-8a3a-e02d978c558c",
   "before_state": { "trigger": "confirm", "payment_intent_id": "pi_3U3jMa2fB4PPCw2D0yCwrzWV" },
   "after_state":  { "kind": "expired", "detail": "This PaymentIntent could not be captured…", "captured": false },
   "created_at": "2026-08-12T21:07:06.579048+00:00" }]
```

**Three places, in ascending durability:** the `🔴` console line; the board still reading `CARD HELD`; and that row, which outlives everything. Before this build the same failure produced **nothing at all**, because nothing tried.

## (e) ✅ PAY-AT-HATCH UNCHANGED

```
[E] pay-at-hatch order #17 -> {"status":"none"} in 38ms (no Stripe call)
```

One indexed read of `order_drafts` and out, as before. And the diff is comment-only:

```
$ git diff -U0 app/api/orders/submit/route.ts | grep -vE "^[+-]\s*//" | grep -vE "^[+-]\s*$"
(end)
```

**Zero non-comment changed lines.** The pay-at-hatch behaviour is byte-identical.

## Tooling

```
$ npx tsc --noEmit          -> clean, exit 0
$ npx eslint <all 4 files>  -> clean, no output
```
⚠️ **tsc-clean is not verification and is not offered as any.** The evidence above is real rows and real Stripe.

---

# 🔴 NON-ASCII CENSUS

| File | Before | After | Distinct set |
|---|---|---|---|
| `lib/payments/promote-draft.ts` | 453 / **7** | 534 / **7** | `— • → ─ ⚠ 🔴 ️` **identical** |
| `app/api/orders/submit/route.ts` | 1441 / **19** | 1400 / **19** | `£ § × — ’ … → ∈ ≥ ─ ⚠ ⟷ 🎁 📝 📞 📧 🔔 🔴 ️` **identical** |
| `app/api/dashboard/action/route.ts` | 2700 / **16** | 2702 / **16** | `£ § · à – — … → ⇒ ─ ⚠ ✅ ✓ 🔔 🔴 ️` **identical** |
| `lib/payments/capture.ts` | 490 / **6** | 527 / **6** | `— … ─ ⚠ 🔴 ️` **identical** |
| `vercel.json` | 0 / **0** | 0 / **0** | 🔴 **still pure ASCII** |

✅ **NO FILE GAINED A CHARACTER CLASS IT DID NOT ALREADY CONTAIN.** `submit/route.ts` fell by 41 because the replaced comment was shorter, not because a class was dropped — the distinct set is unchanged at 19.

**New files** (no baseline; every character drawn from classes already in the codebase):

| File | Total | Distinct |
|---|---|---|
| `lib/payments/stranded-authorisations.ts` | 294 | 7 — `£ — • ─ ⚠ 🔴 ️` |
| `app/api/cron/capture-stranded-authorizations/route.ts` | 226 | 5 — `— ─ ⚠ 🔴 ️` |
| `scripts/list-stranded-authorisations.cjs` | 226 | 7 — `£ — ─ ⚠ ✅ 🔴 ️` |
| `supabase/migrations/20260815_find_stranded_authorisations.sql` | 263 | 7 — `£ — • ─ ⚠ 🔴 ️` |

---

# 🔴 WHAT YOU HAVE TO DO

### 1. Run the migration

```sql
-- supabase/migrations/20260815_find_stranded_authorisations.sql
```

✅ **Additive and reversible.** It creates one read-only function and touches no existing object. `drop function find_stranded_authorisations(integer, integer);` restores the database exactly.

**Verify after applying:**
```sql
select proname, provolatile from pg_proc where proname = 'find_stranded_authorisations';  -- expect 's'
select * from find_stranded_authorisations(0, 100);                                        -- expect #18 and #19
```

### 2. Then take the £12.50

```
GET /api/cron/capture-stranded-authorizations?dry=1   -- preview, captures nothing
GET /api/cron/capture-stranded-authorizations         -- takes it
```

### 3. Deploy order matters, slightly

⚠️ **The cron entry and the route can ship before the migration** — the route will 500 loudly every fifteen minutes until it is applied, which is the designed behaviour and not a silent failure. **The capture fix itself has no migration dependency at all** and can ship immediately.

---

# Not established, and deliberately not built

- 🔴 **The SQL function has never been executed.** There is no `psql` and no `DATABASE_URL` in this environment, and applying migrations is yours by instruction. Its **semantics** were validated by running the identical predicate in JavaScript against the same rows (it returned #18 and #19, and correctly excluded the pending #22) — but the SQL text itself is unrun. **A syntax error would surface as a failed migration, not as a wrong answer**, and the route reports a missing function loudly.
- **Vercel's cron plan tier.** This is now the fourth entry, on a schedule finer than daily. `vercel.json` already carried three, so a Pro plan is implied, but I have not confirmed it.
- **The `payment_intent.amount_capturable_updated` webhook subscription** is still not enabled — unchanged by this work, and still worth doing.
- **No alerting channel was built.** See §4.
- **A promoted draft with no order row** is out of scope. See §3.
- **The confirmation email's missing "paid" branch.** See §1.
