# Action audit log + actor attribution — BUILD REPORT

**Date:** 29 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ BUILT.** `tsc --noEmit` clean; 7/7 source-detection cases and 16/16 ledger-derivation cases pass.
**Migration NOT applied. `next dev` / `next build` NOT run.** No UI, no PIN model, no Stripe.

> This file replaces the previous fail-open build report. That content is not preserved anywhere.

**Prompt integrity:** no span read as garbled or truncated.

**Nothing in the VERIFIED-BY-YOUR-OWN-REVIEW block disagrees with what I found.** All six statements
re-confirmed while editing.

---

## 1. How the identity resolution is shared, and why

**One implementation, in a new module, imported by both routes.** No second resolver was written.

`lib/audit/actor.ts` is a faithful extraction of the inline block at
`app/api/dashboard/route.ts:55-109` — same cookie-then-Bearer order, same
`operators` → `is_admin` all-access → `truck_users` membership cascade, same value fallbacks
(`name || email || null`), same role defaulting.

**Why extract rather than import from the route:** a Next.js route module cannot be imported by another
route without dragging its handler and its whole import graph along. Extraction was the only way to have
one implementation. It also directly addresses the `makeCartKey` triplication class — `truck_users` is
already queried inline in eight routes with three different shapes, and identity is a far worse thing to
let drift than a cache key.

### The one design problem I hit, and how I resolved it

The original block **returns a 403 mid-resolution** (`route.ts:105`) for a user whose operator record
belongs to a different truck. A helper that returns a `NextResponse` would drag that refusal into the
action route — the exact thing you forbade.

**So the helper returns data, never a response.** It reports `foreignOperator: boolean`; the dashboard GET
inspects that flag and issues its own 403, unchanged. The action route ignores the flag entirely.

### The behaviour change I found in my own first attempt, and reverted

My first version wrapped the whole resolution in `try/catch` returning `'unknown'`. That would have been
a **silent semantic change to the GET route**: the original block has no `try/catch`, so an auth-service
error surfaced as a 500 — and with a blanket catch, a foreign operator holding a valid token would have
been *admitted* during an auth outage instead of refused, because `foreignOperator` would default false.

Fixed by splitting the entry points:

| Function | Posture | Caller |
|---|---|---|
| `resolveActor()` | **May throw**, exactly like the original inline block | `/api/dashboard` (GET) — error semantics preserved byte-for-byte |
| `resolveActorSafe()` | Never throws; degrades to `'unknown'` | `/api/dashboard/action` — attribution can never break an action |

The two postures live in the helper, not the routes, so neither caller can accidentally acquire the
other's. Flagging this because it was a real defect in an intermediate state of this build, not a
hypothetical.

---

## 2. Exactly what each of the six caller types resolves to now

`verifyToken(token, pin)` still runs first and unchanged for all six; the table below is what the **audit
row** now records.

| Caller | `actor_kind` | `actor_id` | `actor_label` | `source` |
|---|---|---|---|---|
| **(a) dashboard token only** | `token` | null | null | `web` |
| **(b) logged-in owner cookie** | `owner` | `auth.users.id` | operator `name \|\| email` | `web` |
| **(c) logged-in staff** | `staff` | `auth.users.id` | truck_user `name \|\| email` | `web` |
| **(d) native Bearer** | `owner` or `staff` (same cascade) | `auth.users.id` | as above | `native` |
| **(e) KDS per-van token** | `token` | null | null | `web` |
| **(f) offline replay** | whatever the replaying device resolves to at **drain** time | ditto | ditto | `offline_replay` |
| *(auth lookup itself fails)* | `unknown` | null | null | as detected |

Every row was previously identical and anonymous; (b), (c) and (d) are newly attributable.

**Notes, all of them limitations rather than wins:**

- **(e) is unchanged and cannot be improved by this work.** `app/kds/[kds_token]/page.tsx:32` exchanges
  the van token for the truck-wide `dashboard_token` and redirects, so by the time an action is posted
  the van scope is gone. A KDS on a shared tablet still records `token`.
- **(f) records who was logged in on the device *at replay time*, not who tapped the button.** And
  `created_at` is the replay time — `client_ts` exists on the op envelope but is "display only — NEVER
  used for reconciliation" (`outbox.ts:62`) and is never transmitted. The `source` value exists precisely
  so a reader can tell the timestamp is not the action time.
- **`manager` collapses to `staff`.** `actor_kind`'s vocabulary is the four values you specified; the
  precise role survives in the GET response's `userRole` but is **not persisted** to the log. A manager
  and a staff member are indistinguishable in the audit trail today.
- **`token` vs `unknown` is the honesty split** you asked for, modelled on
  `allergen_audit_log.auth_method`: `token` = resolution ran cleanly and there was no session (a shared
  token acted — a fact); `unknown` = resolution itself failed (we don't know). Both carry a null
  `actor_id`, so `actor_kind` is the only thing separating them.

---

## 3. Confirmation: attribution cannot refuse an action

**Confirmed, and verified mechanically rather than by inspection alone.**

- `verifyToken` at [action/route.ts:139-140](app/api/dashboard/action/route.ts#L139) is still the only
  gate, unchanged, and still the only refusal before the action branches.
- `grep -cE "throw|NextResponse|status: *[0-9]" lib/audit/actor.ts` → **2 hits, both inside comments**
  (lines 27 and 46). There is no code path in the module that constructs a response or a status.
- `grep -c "foreignOperator" app/api/dashboard/action/route.ts` → **1 hit, in a comment** (line 152)
  explaining that it is deliberately ignored. It is never read as a value in that file.
- The action route calls **`resolveActorSafe`**, whose every failure path returns `UNKNOWN`.

So: absent cookie, malformed Bearer, Supabase auth outage, foreign-operator session — **every one of
these proceeds**, and the action completes exactly as it would have before this change. The only
observable difference is which values land in the log.

---

## 4. The audit rows written for collect → undo → re-collect

Walking your exact fraud sequence. Assume order `a1b2…` on `pizzeria-gusto`, £9.50, an owner logged in on
the web, `total_minor` 950.

**1 — collect.** Ledger row inserted (`collect:a1b2…`, 950). Audit row appended:

```
action        = 'collected'
truck_id      = 'pizzeria-gusto'
order_key     = 'a1b2…'
amount_minor  = 950
before_state  = { "status": "confirmed", "paid_at": null, "collected_at": null }
after_state   = { "status": "collected", "paid_at": "…T18:31:02Z", "collected_at": "…T18:31:02Z",
                  "charged_minor": 950, "ledger_failed": false }
actor_kind    = 'owner'   actor_id = '9f3c…'   actor_label = 'Dominic Bonini'
source        = 'web'     created_at = …T18:31:02Z
```

**2 — undo.** Audit row appended **first**; only then is the ledger row deleted:

```
action        = 'undo_collected'
amount_minor  = 950
before_state  = { "status": "collected",
                  "ledger_row": { "id": "7c1e…", "kind": "charge", "channel": "in_person_other",
                                  "amount_minor": 950, "currency": "GBP", "state": "succeeded",
                                  "external_ref": null, "note": "Mark paid & done — taken at the hatch",
                                  "idempotency_key": "collect:a1b2…", "created_at": "…T18:31:02Z",
                                  "created_by": "9f3c…" } }
after_state   = { "ledger_row": null, "ledger_row_deleted": true, "status": "ready" }
actor_kind    = 'owner'   actor_id = '9f3c…'   actor_label = 'Dominic Bonini'
source        = 'web'     created_at = …T18:31:09Z
```

The deleted row is captured **in full** — every column including `idempotency_key`, `created_at` and
`created_by` — so the deletion is reconstructable from the log alone.

**3 — re-collect.** New ledger row (the key was freed by the delete, as designed). Third audit row,
identical in shape to #1 with a later `created_at`.

**Net: three permanent rows for a sequence that previously left nothing.** The ledger still shows exactly
one charge — correct, because one charge is what is owed — while the log shows the full history and who
did each step. That is the ledger/audit split working as intended.

---

## 5. The undo rule, adjusted — and the two opposite failure postures

`undo_collected` still **DELETES**; that ruling stands untouched. What changed is ordering and posture.

`reverseCollectionPayment` gained an optional `beforeDelete(row)` callback
([ledger.ts:289-312](lib/payments/ledger.ts#L289)), awaited immediately before the delete and
**deliberately not wrapped in try/catch** — a throw aborts the delete, leaves the ledger row intact, and
propagates. The route passes `logActionOrThrow` there. Its `select` was widened to read every column
(`currency`, `note`, `idempotency_key`, `created_at`, `created_by`) so `before_state` is complete.

| Branch | Posture | Helper | Reasoning (recorded in a comment at each branch) |
|---|---|---|---|
| `collected` | **Fails OPEN** | `logAction` (swallows) | Nothing is destroyed — ledger and order rows both persist, so a lost audit row is a gap, not an erasure. Blocking a hatch mid-service is worse. |
| `undo_collected` | **Fails CLOSED** | `logActionOrThrow` | It DELETES a payment row. An erased payment record with no log of the erasure is precisely the fraud vector this table exists to prevent. Losing an undo is recoverable; losing the evidence of one is not. |

The `'refunded'` and `'none'` undo paths destroy nothing, so they log **after** the fact, best-effort
([action/route.ts:452-460](app/api/dashboard/action/route.ts#L452)) — added so that *every* undo appears
in the trail, not only the deleting one.

`order_payments.created_by` is now populated from `actor.actorId` on both the collect and the reversal
paths. It remains null for `token`/`unknown` actors — correctly, since there is no user to name.

---

## 6. Files and lines changed

| File | Change |
|---|---|
| **`lib/audit/actor.ts`** *(new, 150 lines)* | `resolveActor` (may throw — GET), `resolveActorSafe` (never throws — action), `resolveActorSource`, the `ActorKind`/`ActorSource` types and the `token`/`unknown` doctrine |
| **`lib/audit/actionAudit.ts`** *(new, 84 lines)* | `logAction` (best-effort) and `logActionOrThrow` (strict); the `AuditEntry` shape, designed so `cancel`/`reject`/`edit`/stock need no signature change |
| [app/api/dashboard/route.ts:7](app/api/dashboard/route.ts#L7), [:54-64](app/api/dashboard/route.ts#L54) | **+13/−56** — 55 inline lines replaced by the shared call; the 403 preserved via `foreignOperator` |
| [app/api/dashboard/action/route.ts:21-22](app/api/dashboard/action/route.ts#L21) | imports |
| [action/route.ts:142-157](app/api/dashboard/action/route.ts#L142) | actor + source resolution, with the "logging never authorises" rule in comment |
| [action/route.ts:348-370](app/api/dashboard/action/route.ts#L348) | `collected` — `createdBy` passed; audit row appended after (fail-open) |
| [action/route.ts:412-460](app/api/dashboard/action/route.ts#L412) | `undo_collected` — audit **before** delete via `beforeDelete`, fail-closed; non-deleting paths logged after |
| [lib/payments/ledger.ts:78-87](lib/payments/ledger.ts#L78) | new `DeletedCollectRow` type (full stored shape) |
| [lib/payments/ledger.ts:289-312](lib/payments/ledger.ts#L289) | `beforeDelete` hook; widened `select`; **the delete rule itself is unchanged** |
| **`supabase/migrations/20260729_action_audit_log.sql`** *(new)* | see §7 |

Diff totals: `action/route.ts` +70/−3, `dashboard/route.ts` +13/−56, `ledger.ts` +31/−3.
**No other file touched.** No UI, no toast wiring, no PIN model, no `cancel`/`reject`/`edit`/stock
wiring, no backfill, no outbox change, nothing Stripe.

---

## 7. Migration

**`supabase/migrations/20260729_action_audit_log.sql` — ✅ ADDITIVE.**
New table, nothing deployed reads or writes it; applying it changes nothing for the running app.

**RUN ORDER: apply BEFORE deploying.** Additive is not the same as order-free, and the consequence
differs by branch — this is in the header:

- `collected` writes **best-effort** → a missing table logs to console and the collection still
  completes. Degraded, not broken.
- `undo_collected` writes **strictly** → a missing table throws, which aborts the ledger delete and
  **refuses the undo with a 500**. Deploying the code first would break undo on a live path.

Twelve columns exactly as specified, verified: `id`, `action`, `truck_id`, `order_key`, `amount_minor`,
`before_state`, `after_state`, `actor_kind`, `actor_id`, `actor_label`, `source`, `created_at`.

**🔴 NO FOREIGN KEYS — confirmed, and asserted by the verification block** (`fk_count` → expect 0).
`truck_id`, `order_key` and `actor_id` are plain values. CHECKs on `actor_kind` and `source` only.
`action` is deliberately free text: a CHECK would make every future caller a deploy-coupled migration,
which is how an audit log quietly stops being written to.

**RLS posture — it matches the house pattern, with one caveat I have to state.** The migration does
`enable row level security` with **no policy** and the `-- service-role only, no anon policy` comment.
⚠️ **That does not match `allergen_audit_log` itself, which enables no RLS at all** — the only
application table in the repo in that state, and (per my earlier review) apparently an oversight rather
than a decision. I matched its *siblings* (`order_payments`, `device_notification_prefs`,
`booking_locks`, `whatsapp_logs`, `excluded_terms`), which is the stricter and, I believe, intended
posture. Flagging rather than silently choosing.

**Append-only is stated in the migration header and at the write helper**, as asked.
⚠️ It is enforced **by convention only** — the service role bypasses RLS, so nothing at the database
level prevents a `delete`. A dedicated insert-only role would be the real enforcement and is not built.
Code-side: `grep` confirms the only `update|delete|upsert` mention of `action_audit_log` anywhere is the
comment forbidding it.

---

## 8. REPORT BUT DO NOT FIX — `order_payments` cascade

**Current state.** [20260729_order_payments_ledger.sql:57,60](supabase/migrations/20260729_order_payments_ledger.sql#L57):

```sql
order_key uuid not null references orders(order_key) on delete cascade,
truck_id  text not null references trucks(id)        on delete cascade,
```

Deleting an order, or a truck, silently destroys its entire payment history. `deleteTruckCascade`
deletes `orders` first (`lib/delete-truck.ts:37`), so the order-level cascade fires on every truck
teardown — including the **hourly** demo-cleanup cron.

**What I would change it to.** Drop both `on delete cascade` and replace with **`on delete set null`**,
keeping the columns nullable — or, matching `allergen_audit_log` and the new audit table, **drop the FKs
entirely** and store plain values. My recommendation is **`set null` on `order_key`, and no FK on
`truck_id`**: it keeps referential integrity where it is cheap (an order that exists is guaranteed to be
the right one) while ensuring the money record outlives its subject. `truck_id` is the column you would
aggregate fees by, and it must never go null.

**What it would cost.**

- **Migration:** one `alter table … drop constraint` + `add constraint` per FK, plus making `order_key`
  nullable. **Additive-ish but not free** — dropping a NOT NULL is trivial, but the FK swap needs the
  constraint names, which (as with `orders_payment_status_check`) are Postgres-assigned and asserted
  nowhere in this repo, so it needs the same `DO`-loop-over-`pg_constraint` treatment.
- **Code:** `lib/payments/ledger.ts` reads and groups by `order_key` throughout; a nullable `order_key`
  means `recalcOrderPayment` and the reconciliation query need a null guard. **INFERRED** ~10-20 lines.
- **Semantics:** the reconciliation query currently joins `orders` to `order_payments`; orphaned rows
  would stop appearing in it, so it needs a companion "orphaned payments" query or they become invisible.
- **The real cost is deciding what an orphaned payment row *means* for the 0.99% fee calculation** —
  whether revenue from a deleted truck still counts. That is a §37 commercial question, not a schema one,
  and it is the reason I would not change this without your ruling.

**Interim mitigation, already in place:** the new `action_audit_log` row for every collect carries
`truck_id`, `order_key` and `amount_minor` with **no FKs**, so even if a cascade wipes the ledger the
*fact and amount* of each collection survives. It is not a full ledger, but it is not nothing.

---

## 9. What I verified by reading vs by running

**By RUNNING:**
- `npx tsc --noEmit` → **exit 0, clean** (run after every edit, including the final safe/throw split).
- **7/7 behavioural cases on `resolveActorSource`** (pure function, extracted byte-identically to a
  scratchpad harness, run under Node 22 `--experimental-strip-types`): plain web; native UA marker;
  `expected_from` → `offline_replay`; **replay wins over native UA**; missing UA header; non-array
  `expected_from` ignored; empty array still counts as replay.
- **16/16 ledger-derivation cases re-run** after the `ledger.ts` changes → still all pass, confirming
  `beforeDelete` and the widened `select` did not disturb the rollup.
- The greps quoted in §3 — `throw`/`NextResponse`/`status` in `actor.ts` (comments only),
  `foreignOperator` in the action route (comment only), `update|delete|upsert` on `action_audit_log`
  (comment only), migration column count (12) and FK count (0).

**By READING only:** the extraction's fidelity to `dashboard/route.ts:55-109` (compared line by line via
`git diff`); the `expected_from` replay marker (`orderGate.ts:135`); the native UA marker
(`proxy.ts:164`); the `deleteTruckCascade` ordering; the `allergen_audit_log` RLS gap.

---

## 10. What I could NOT verify

- **The migration has not been applied.** The table does not exist. Nothing in the SQL is verified
  against a real database, and every `VERIFY AFTER APPLYING` query is written but unrun.
- **No audit row has ever been written.** Every field value in §4 is derived from reading the code, not
  observed. The `before_state` JSON shape in particular is my construction and has never round-tripped
  through Postgres.
- **`resolveActor` has never executed.** Its cookie path needs `next/headers`, its Bearer path needs a
  real JWT, and neither runs outside a request. **The six-row table in §2 is reasoned from the code, not
  measured** — I could not test even one caller type end to end. This is the largest untested surface in
  this pass.
- **The GET route refactor is unverified at runtime.** I preserved its error semantics deliberately, but
  I have not loaded a dashboard. A regression here would affect every operator on every page load.
- **The fail-closed undo has not been exercised** — I have not forced an audit-insert failure and
  observed the delete being aborted. Verified by reading the control flow (`beforeDelete` awaited,
  uncaught, before the `delete`), not by running it.
- **Whether `actor_kind` will in practice be dominated by `'token'`** is unknown. If the counter tablet
  runs without a logged-in session, attribution gains nothing in the real deployment — worth checking on
  Gusto's device before assuming this pass solved the attribution problem.
- **No `next dev` / `next build`** — per constraint. tsc-clean does not prove the routes bundle, and
  `lib/audit/actor.ts` imports `next/headers` transitively, which is build-sensitive.
- **Nothing observed on a device**, and no real order placed on `test-truck`.
