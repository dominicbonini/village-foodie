# Payment audit trail & actor attribution — READ-ONLY REVIEW

**Date:** 29 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Nothing was changed.** No code written, no migration created, no file modified except this report.
Everything below was established by **reading** (grep/sed over the working tree). I have no DB access,
so nothing is confirmed against live data; anything not directly readable is marked **INFERRED**.

**Prompt integrity:** no span read as garbled or truncated. (The first prompt ends with a stray `....`
after "confirm the file is written" — trailing punctuation only, no content missing.)

---

## HEADLINE

**The entire `/api/dashboard/action` surface is anonymous.** Payment is not a special case — it is the
28th action on a route that has never been able to identify a human. The route authenticates with a
**single per-truck shared secret** and resolves **no user whatsoever**: no session, no cookie, no
Bearer, no `truck_users` lookup, no device id.

The sharpest finding is an asymmetry nobody appears to have intended: **`/api/dashboard` (GET, the read
route) fully resolves the current user — name, role, membership — and `/api/dashboard/action` (POST,
every mutation) does not.** The dashboard displays who you are while recording nothing about what you
did. The resolution code already exists, forty lines away, in the sibling file.

Consequence for the fraud vector you described: today, **"who did this" is not answerable even in
principle** for any order action. It is not merely unrecorded — the server never receives it.

---

## Q1 — WHAT AUDIT INFRASTRUCTURE ALREADY EXISTS?

### `allergen_audit_log` — the house pattern

Definition, [supabase/migrations/20260628_allergen_audit_log.sql:13-28](supabase/migrations/20260628_allergen_audit_log.sql#L13):

```sql
CREATE TABLE IF NOT EXISTS allergen_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id      text NOT NULL,
  item_id       uuid,
  change_type   text NOT NULL CHECK (change_type IN ('confirm','edit','card_save','import')),
  field         text NOT NULL CHECK (field IN ('allergens','dietary','allergens_verified','card')),
  old_value     text,
  new_value     text,
  actor_user_id uuid,
  actor_role    text,
  auth_method   text NOT NULL CHECK (auth_method IN ('token','authenticated')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS allergen_audit_log_truck_created_idx ON allergen_audit_log (truck_id, created_at DESC);
CREATE INDEX IF NOT EXISTS allergen_audit_log_item_idx          ON allergen_audit_log (item_id);
```

`change_type` was later widened to add `'card_match'`
([20260629_allergen_audit_card_match.sql:11-13](supabase/migrations/20260629_allergen_audit_card_match.sql#L11)).

**Columns it carries:** actor ✅ (`actor_user_id`, `actor_role`), before/after ✅ (`old_value`,
`new_value`), action type ✅ (`change_type` + `field`), timestamp ✅ — **and one more that is the most
interesting thing in this file:**

```
auth_method text NOT NULL CHECK (auth_method IN ('token','authenticated'))
```

The migration header calls it "the **HONEST identity-quality flag**" — `'authenticated'` = a real
logged-in user resolved; `'token'` = token-only access, which *resolves to `'owner'` in the role model*
so "the gate is only as strong as the token until real auth; auth_method records that truthfully"
([:6-10](supabase/migrations/20260628_allergen_audit_log.sql#L6)). This is the existing, deliberate answer
to exactly the problem you are now hitting on payments: it does not pretend to know who acted — it
records *how confident it is* that it knows.

**How it is written.** Via one helper, [lib/allergen-audit.ts:28-35](lib/allergen-audit.ts#L28):

```ts
export async function logAllergenChanges(supabase: SupabaseClient, rows: AllergenAuditRow[]) {
  if (!rows.length) return
  try {
    const { error } = await supabase.from('allergen_audit_log').insert(rows)
    if (error) console.error('[allergen-audit] insert failed:', error.message)
  } catch (e) { console.error('[allergen-audit] insert threw:', e) }
}
```

**INSERT only** — the comment at [:5-6](lib/allergen-audit.ts#L5) states "The audit table is append-only —
these only ever INSERT", and the migration header agrees: "The app only ever INSERTs here — never
UPDATE/DELETE" ([:3](supabase/migrations/20260628_allergen_audit_log.sql#L3)). Grep confirms: no `update`,
`delete` or `upsert` against the table anywhere.

Note it is **best-effort and fails open** — a logging failure is logged to console and does not fail the
underlying write, because "the data change is already committed" ([:26-27](lib/allergen-audit.ts#L26)).
Same posture as the fail-open decision on `collected`.

**Five write sites**, all in one route:
[app/api/manage/route.ts:403](app/api/manage/route.ts#L403), [:415](app/api/manage/route.ts#L415),
[:506](app/api/manage/route.ts#L506), [:516](app/api/manage/route.ts#L516),
[:823](app/api/manage/route.ts#L823).

**Deleted or pruned?** No. No delete path, and — importantly — **`truck_id` has NO foreign key**
([:15](supabase/migrations/20260628_allergen_audit_log.sql#L15): plain `text NOT NULL`). It is not in
`deleteTruckCascade`'s `NO_ACTION_TABLES` and it does not cascade, so **audit rows survive deletion of
the truck they describe**. For a compliance record that is almost certainly deliberate. ⚠️ It is the
**opposite** of `order_payments`, which cascades on both order and truck delete — see Q7.

**RLS posture: NONE.** There is no `enable row level security` statement for this table in any
migration. It is the only application table I found in that state — `whatsapp_logs`, `booking_locks`,
`excluded_terms`, `device_notification_prefs` and `order_payments` all enable RLS with no policy.
**INFERRED:** this is an oversight rather than a decision, since the table's own header discusses
identity honesty carefully but never mentions access control. Flagging it as a finding, not a proposal.

**Read back in the UI?** **No.** Grep for `allergen_audit_log` across `app/`, `components/` and `lib/`
returns only the writer. Nothing selects from it, and there is no viewer of any kind. It is a
write-only record today.

### Every other log/history table

| Table | Records | Append-only? |
|---|---|---|
| `whatsapp_logs` ([20260605:5-15](supabase/migrations/20260605_whatsapp_logs.sql#L5)) | Inbound WhatsApp message, classification, response sent, `possible_miss` flag | Append-only in practice; no actor (customer phone number only) |
| `scraper_run_log` ([20260604:2-11](supabase/migrations/20260604_scraper_adaptive.sql#L2)) | Per-run scraper telemetry: events found/changed, rule used, notes | Append-only; **machine actor only**, no human |
| `demo_cleanup_log` ([20260723:57-69](supabase/migrations/20260723_demo_sessions.sql#L57)) | Cron outcome: ok, counts deleted, failures jsonb, duration, gap_mins | Append-only; machine actor |
| `upsell_events` ([20260529:6-18](supabase/migrations/20260529_checkout_upsells.sql#L6)) | Customer-side upsell impressions/acceptance per order | Append-only; **customer** behaviour, no operator |
| `discovery_events` ([20260522:68+](supabase/migrations/20260522_discovery_schema.sql#L68)) | Scraped third-party events — a data table, not a log | Not an audit log |
| `rejected_event_signatures` ([20260613:7-13](supabase/migrations/20260613_rejected_event_signatures.sql#L7)) | Signatures of scraped events the operator rejected | Append-only; **no actor** — records the decision, not the decider |
| `kds_sessions` ([20260521_plans.sql:16-23](supabase/migrations/20260521_plans.sql#L16)) | See Q9 — **dead table** | n/a |

**`allergen_audit_log` is the only table in the repo that records a human actor at all.**

---

## Q2 — WHAT IDENTITY DOES THE SERVER ACTUALLY HAVE AT `/api/dashboard/action`?

**The complete auth surface**, [app/api/dashboard/action/route.ts:27-33](app/api/dashboard/action/route.ts#L27):

```ts
async function verifyToken(token: string, pin?: string) {
  const { data: truck } = await supabase
    .from('trucks').select('*').eq('dashboard_token', token).single()
  if (!truck) return null
  if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null
  return truck
}
```

called once, at [:135-136](app/api/dashboard/action/route.ts#L135):

```ts
const { token, pin, action, order_key: orderKey, manualOrder, itemName, available, editedOrder } = body
const truck = await verifyToken(token, pin)
if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
```

**That is the entirety of authentication for all 28 actions.** This grep over the whole file returns
**nothing**:

```
grep -n "getUser|createSupabaseServerClient|truck_users|auth_user_id|Bearer|cookies()|operators" \
     app/api/dashboard/action/route.ts     →  (no matches)
```

Per case:

| Case | truck? | van? | auth_user_id? | truck_users row? | role? | name/email? |
|---|---|---|---|---|---|---|
| **(a) dashboard token only** | ✅ full row | ❌ | ❌ | ❌ | ❌ | ❌ |
| **(b) logged-in owner cookie** | ✅ | ❌ | ❌ **not read** | ❌ | ❌ | ❌ |
| **(c) logged-in staff member** | ✅ | ❌ | ❌ **not read** | ❌ | ❌ | ❌ |
| **(d) native Bearer** | ✅ | ❌ | ❌ **not read** | ❌ | ❌ | ❌ |
| **(e) KDS per-van token** | ✅ | ❌ *(see below)* | ❌ | ❌ | ❌ | ❌ |
| **(f) offline replay** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Every row is identical, and that is the finding.** The cookie is present on (b) and (c) and the
`Authorization` header on (d) — the route simply never looks at either. **Identity is not
determinable, for any caller, in any case.**

**(e) deserves emphasis — the per-van KDS token is not a credential.**
[app/kds/[kds_token]/page.tsx:16-32](app/kds/[kds_token]/page.tsx#L16) looks up the van by `kds_token`,
then:

```ts
redirect(`/dashboard/${truck.dashboard_token}/kds?van_id=${van.id}&van_name=${...}`)
```

It **exchanges the van-scoped token for the truck-wide `dashboard_token`** and redirects. `van_id` then
rides in the query string as a *display filter*, not an identity. The in-app KDS confirms it:
"This route runs on the DASHBOARD token"
([kds/page.tsx:47-48](app/dashboard/[token]/kds/page.tsx#L47)). So a device given only a van's KDS link
ends up holding the full truck credential, and the server cannot tell a KDS action from a dashboard one.

**The asymmetry.** The sibling GET route does all of this properly —
[app/api/dashboard/route.ts:55-109](app/api/dashboard/route.ts#L55): cookie `getUser()`, Bearer
fallback, `operators` lookup, `is_admin` all-access branch, `truck_users` membership with role, and a
403 for a user belonging to a different truck. It returns `currentUserName` and `userRole`
([:451-452](app/api/dashboard/route.ts#L451)). **The read route knows exactly who you are. The write
route does not ask.**

---

## Q3 — IS `created_by` POPULATED?

**No. It is always `null`.**

The column is accepted and passed through three layers, but never supplied:

- [lib/payments/ledger.ts:217](lib/payments/ledger.ts#L217) — the insert: `created_by: event.createdBy ?? null`
- [:268](lib/payments/ledger.ts#L268) (`recordCollectionPayment`) and [:326](lib/payments/ledger.ts#L326)
  (`reverseCollectionPayment`) — both `createdBy: opts.createdBy ?? null`
- Both are declared optional: `createdBy?: string | null` at [:198](lib/payments/ledger.ts#L198),
  [:247](lib/payments/ledger.ts#L247), [:291](lib/payments/ledger.ts#L291)

And the only two call sites omit it entirely:

```
app/api/dashboard/action/route.ts:348   await recordCollectionPayment(supabase, { orderKey, truckId: truck.id })
app/api/dashboard/action/route.ts:385   await reverseCollectionPayment(supabase, { orderKey, truckId: truck.id })
```

Nothing else in the repo calls either function. **Every `order_payments` row will carry
`created_by = null`.** Note this is not a wiring oversight that could be fixed at the call site: per Q2
the route has no identity to pass.

---

## Q4 — WHAT DO OTHER MUTATING ACTIONS RECORD?

**None of them record who did it.** All eight live in the same `POST` handler behind the same
`verifyToken`, so none *can*.

| Action | Line | Actor recorded? | What it does record |
|---|---|---|---|
| `collected` | [:321](app/api/dashboard/action/route.ts#L321) | ❌ | `paid_at`, `collected_at`, `status_before_collected`, + ledger row (`created_by` null) |
| `undo_collected` | [:377](app/api/dashboard/action/route.ts#L377) | ❌ | clears status/timestamps; **deletes** the ledger row |
| `cancel` (operator) | [:238](app/api/dashboard/action/route.ts#L238) | ❌ | `cancellation_reason` — free text, *what* not *who* |
| `reject` | [:204](app/api/dashboard/action/route.ts#L204) | ❌ | `rejection_reason` — free text |
| `edit` | [:375+](app/api/dashboard/action/route.ts#L375) | ❌ | new items/totals on the row; no history of the prior values |
| `manual` order create | [:655](app/api/dashboard/action/route.ts#L655) | ❌ | no actor field in the insert payload |
| stock override (`set_stock` etc.) | [:1167+](app/api/dashboard/action/route.ts#L1167) | ❌ | absolute value only |
| `set_paused` | [:1334](app/api/dashboard/action/route.ts#L1334) | ❌ | boolean only |

`cancellation_reason` and `rejection_reason` are the closest thing to a trail, and both are
operator-typed free text with no identity attached.

**`orders` has no actor column at all.** The complete 35-column list
([reference-manual.md:2884](docs/reference-manual.md#L2884)) contains no `created_by`, `updated_by`,
`actor_*` or `user_id`. There is nothing for payment attribution to inherit or join to.

**So payment is not a special case.** The whole mutation surface is anonymous. What makes payment feel
different is only that `undo_collected` now *destroys* evidence rather than merely failing to create it.

---

## Q5 — THE OFFLINE PATH

**The queued body carries the truck credential and nothing else.**
[app/dashboard/[token]/page.tsx:1222](app/dashboard/[token]/page.tsx#L1222):

```ts
const result = await gatedAction({
  url: '/api/dashboard/action',
  body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) },
  kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM
})
```

`token`, `pin`, `action`, `order_key`. **No user identity.** The op envelope
([outbox.ts:55-67](lib/native/outbox.ts#L55)) adds `op_id`, `seq`, `client_ts`, `attempts`,
`provisional_id`, `state` — all local bookkeeping, and per the previous pass **`op_id` is never
transmitted**: the drain posts only `syncing.body`
([orderGate.ts:198](lib/native/orderGate.ts#L198)).

**Does the replay re-authenticate?** **No — it reuses a stored credential.** The whole body, including
the token and pin, is serialised into Capacitor Preferences at enqueue
([outbox.ts:135](lib/native/outbox.ts#L135)) and re-posted verbatim on drain. There is no refresh, no
session check, no re-auth.

**Whose identity would attach if user A queues and user B replays?** **Neither.** The replay carries
the *truck's* token, which is the same string regardless of who queued it or when. There is not even a
device identifier: `getDeviceId()` is used only by `/api/native/*` routes and for the outbox's display
letter ([outbox.ts:90](lib/native/outbox.ts#L90)) — **it is never sent to `/api/dashboard/action`**.

⚠️ Two further consequences for an audit trail, both readable in the code:

- **A queued action's timestamp is not its execution time.** `client_ts` is explicitly marked "display
  only — NEVER used for reconciliation" ([outbox.ts:62](lib/native/outbox.ts#L62)), and the server would
  stamp `created_at = now()` at drain. An offline collect at 18:30 replayed at 21:00 records 21:00.
- **An offline collect + undo leaves the server no trace whatsoever** —
  `removePendingStatusOp` ([outbox.ts:185-191](lib/native/outbox.ts#L185)) deletes the pending op so the
  revert is "clean … as-if-never-happened, no compensating op". The collect never reaches the server at
  all. This is a *second*, independent instance of the erasure you found live, and it is not fixed by
  changing what the ledger does on undo.

---

## Q6 — SHARED-TOKEN REALITY

**The dashboard token is PER-TRUCK, not per-user.** `verifyToken` queries
`trucks.dashboard_token` ([action/route.ts:29](app/api/dashboard/action/route.ts#L29)); the login router
hands the *same* string to whoever authenticates — owners via
`trucks.dashboard_token` ([dashboard/page.tsx:43](app/dashboard/page.tsx#L43)) and staff via
`truck_users → trucks.dashboard_token` ([:52-64](app/dashboard/page.tsx#L52)).

**Can two people use it simultaneously? Yes — trivially, and with no way to tell them apart.** It is one
shared secret per truck, held in the URL path (`/dashboard/[token]`), so it is bookmarkable, shareable,
and visible in browser history and screenshots. The per-van KDS token collapses into it too (Q2e).

**`kds_sessions` — exists, tracks neither device nor person, and is DEAD.**
[supabase/migrations/20260521_plans.sql:16-23](supabase/migrations/20260521_plans.sql#L16):

```sql
create table if not exists kds_sessions (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null references trucks(id) on delete cascade,
  session_token text null unique,
  view_mode text not null check (view_mode in ('window', 'cook')),
  last_ping timestamptz not null default now(),
  created_at timestamptz not null default now()
);
```

No `auth_user_id`, no `device_id`, no name — it identifies **a session**, and only by an opaque
`session_token` with nothing to resolve it to. And it is **never written or read by any application
code**: the only occurrence outside migrations is a comment in
[lib/delete-truck.ts:49](lib/delete-truck.ts#L49) listing it among cascading tables. It is defined
twice (`20260521_plans.sql` and `20260521_plans_and_trial.sql`) and used nowhere. **Vestigial.**

**So: is "who did this" answerable in principle?** As the system stands, **no** — not even "which
device". The server receives one shared per-truck string and nothing else. Today you cannot distinguish
person, device, van, or even browser tab.

The nearest existing identity primitive is `van_devices.device_id` — "stable client UUID (localStorage,
first launch)" ([20260701_van_devices.sql:14](supabase/migrations/20260701_van_devices.sql#L14)), unique,
FK-able, already bound to a van and truck. It answers "which device", not "which person", and it is
**not currently sent** to the action route.

---

## Q7 — RETENTION AND VOLUME

**Volume.** One `order_payments` row per collection today (one charge per order), plus a row per
part-payment or refund once those exist. Grounded figures, all from the live-verified numbers in the
manual:

- **Pizzeria Gusto: 108 orders in July** (£2,633.20) — [reference-manual.md:4683](docs/reference-manual.md#L4683)
- **356 orders lifetime, all trucks, all time** — [:23](docs/reference-manual.md#L23)
- **Per event: ~15 orders** — the recovery check records "counter 15, highest order 15, 15 saved"
  ([:29](docs/reference-manual.md#L29))

**INFERRED** from those: ~15 rows per truck per event; ~100–150/month for an active truck; on the order
of **1,000–2,000 rows/year per active truck**. With an audit row per *action* rather than per *money
event* (collect + undo + re-collect = 3), **INFERRED** a 1.5–2× multiplier — call it 2,000–4,000
rows/truck/year. This is a trivially small table by any measure; there is no volume-driven retention
pressure. `allergen_audit_log` has run unpruned since June on the same basis.

**Existing cleanup that would need to know about a new table:**

1. **`deleteTruckCascade`** ([lib/delete-truck.ts:57-75](lib/delete-truck.ts#L57)) — deletes an explicit
   `NO_ACTION_TABLES` list (`orders`, `category_stock`, `collection_times`, `item_overrides`,
   `order_counters`, `slot_capacity`), then `referrals`, then `trucks`.
   ⚠️ **`order_payments` needs no entry** — it declares `on delete cascade` on **both** FKs
   ([20260729_order_payments_ledger.sql:57,60](supabase/migrations/20260729_order_payments_ledger.sql#L57)),
   so it is cleared automatically when `orders` rows go (step 1) or the truck row goes.
   **But that is exactly the problem for an audit trail: the ledger is destroyed by a truck delete, and
   by any order delete.** `allergen_audit_log` deliberately does the opposite — no FK at all, so its
   rows outlive the truck. The two tables take **opposite positions on whether the record survives its
   subject**, and only one of them was chosen with audit in mind.
   The doc comment at [:48-52](lib/delete-truck.ts#L48) listing cascading tables is also now stale — it
   predates `order_payments` and `device_notification_prefs`.
2. **The hourly demo-cleanup cron** (`vercel.json` → `/api/cron/demo-cleanup`, `0 * * * *`) calls
   `deleteTruckCascade`, so it inherits the above. Relevant because five `demo-*` trucks generated
   ~£3,170 of synthetic gross in July ([:4685](docs/reference-manual.md#L4685)) — demo payment rows will
   be created and hourly destroyed.
3. ⚠️ `deleteTruckCascade` is **not transactional** ([:12-17](lib/delete-truck.ts#L12)) — "a failure
   part-way leaves a partially-deleted truck".

No other cron, retention or pruning job exists in the repo.

---

## Q8 — WHAT PIN INFRASTRUCTURE ALREADY EXISTS?

### `trucks.dashboard_pin` — live gate, but unreachable and always null

| | Finding |
|---|---|
| **Read by** | [app/api/dashboard/route.ts:112](app/api/dashboard/route.ts#L112) and [app/api/dashboard/action/route.ts:31](app/api/dashboard/action/route.ts#L31) — both `if (truck.dashboard_pin && truck.dashboard_pin !== pin) return null` |
| **Written by** | **One place**, and only to null: [lib/provision-truck.ts:275](lib/provision-truck.ts#L275) `dashboard_pin: null` |
| **UI that sets it** | **None.** No PIN input, setting, or form anywhere in `app/` or `components/` |
| **What it gates** | Both the dashboard GET and every one of the 28 mutating actions |

The provisioning comment is explicit about why it is nulled
([:272-274](lib/provision-truck.ts#L272)): *"verifyToken (api/dashboard/action) REJECTS when a pin is set
and unmatched — a provisioned truck must never carry one."*

**Net effect: the gate is live but inert.** Because the check short-circuits on a falsy value, a null
PIN means the `pin` field in every request body is ignored. The client dutifully sends `pin` in every
call ([page.tsx:1222](app/dashboard/[token]/page.tsx#L1222), AddOrderPanel etc.) and it has never been
validated against anything. **INFERRED** (from the null-on-provision plus absent UI): no truck currently
has a PIN set, so the branch has never fired in production. Not vestigial in code — the mechanism works
— but **vestigial in practice**, with no way to turn it on short of a manual DB update.

### `trucks.kds_pin` — no code references at all

`grep -rn "kds_pin" app lib components supabase/migrations` → **zero matches.** Nothing reads it,
nothing writes it, no UI, no migration in this repo creates it. I cannot confirm the column exists (no
DB access); on your statement that it does, it is **fully vestigial** — a column with no code path
whatsoever.

### Per-truck or per-user?

**Per-truck: one shared secret**, a plain-text column on `trucks` compared with `!==`
([action/route.ts:31](app/api/dashboard/action/route.ts#L31)) — not hashed, not salted, no attempt
limiting. **There is no per-user PIN anywhere in the repo.** `truck_users` is selected for
`name`, `email`, `role`, `id` and `auth_user_id` across eight routes; no PIN-like column is ever
referenced.

---

## Q9 — IS THERE ANY CONCEPT OF A "CURRENT USER" ON A SHARED DEVICE?

**Yes on the client, for display only. No on the write path, at all.**

**The dashboard does hold an active-operator notion.** [app/dashboard/[token]/page.tsx:293-295](app/dashboard/[token]/page.tsx#L293):

```ts
const[currentUserName,setCurrentUserName]=useState<string|null>(null)
const[currentUserFirstName,setCurrentUserFirstName]=useState<string|null>(null)
const[currentUserEmail,setCurrentUserEmail]=useState<string|null>(null)
```

populated from the dashboard GET payload at [:606-607](app/dashboard/[token]/page.tsx#L606):

```ts
if(data.currentUserName !== undefined) setCurrentUserName(data.currentUserName)
if(data.userRole !== undefined) setUserRole(data.userRole)
```

and rendered by [components/dashboard/UserMenu.tsx:73](components/dashboard/UserMenu.tsx#L73). It is
also refreshed from `/api/auth/update-profile` at
[page.tsx:478](app/dashboard/[token]/page.tsx#L478).

**So the browser knows the operator's name and role, displays them in the user menu, and never sends
either with an action.** The information is one variable away from the `gatedAction` body and is not
used.

⚠️ This is a **session** notion, not a "who is at the hatch right now" notion. It reflects whoever last
logged in on that browser profile. On a counter tablet that stays logged in all service, it is a
constant — it cannot distinguish two staff sharing the device, which is precisely the fraud scenario.
And it is **absent entirely** for token-only access: `/api/dashboard/route.ts:107` notes "No operator
record + no truck_users → token-only access (KDS/anonymous), `userRole` stays null".

**`kds_sessions`** — quoted in full under Q6. It stores `id`, `truck_id`, `session_token`, `view_mode`,
`last_ping`, `created_at`. It identifies **a session** (opaque token) — *not* a device (no `device_id`)
and *not* a person (no `auth_user_id`, no name). And it is **never written and never read** by any
application code. Dead.

**The only per-device identity that exists** is `van_devices.device_id`
([20260701_van_devices.sql:14](supabase/migrations/20260701_van_devices.sql#L14)) — stable, unique,
already bound to van and truck, and reachable client-side via `getDeviceId()`. It is **native-app only**
(localStorage-seeded, registered through `/api/native/bind-device`) and, again, never sent to the action
route.

---

## Q10 — WHAT WOULD A PER-ACTION ACTOR COST?

**Findings only — no design below.**

**(a) Accepting an actor id.** The body is already destructured loosely at
[action/route.ts:135](app/api/dashboard/action/route.ts#L135); an extra field costs one identifier there.
⚠️ But note what a *client-supplied* actor id would be worth: the client currently authenticates with a
shared per-truck secret, so a self-asserted actor id is **unverified by construction** — anyone holding
the token can claim to be anyone. That is the same weakness `allergen_audit_log.auth_method` was
invented to record honestly (Q1).

**(b) Validating against `truck_users` for that truck.** The logic exists and is proven — but **there is
no shared helper.** It is written inline, three times, with three different shapes:

| Location | Shape |
|---|---|
| [app/api/dashboard/route.ts:75-108](app/api/dashboard/route.ts#L75) | Fullest: cookie `getUser()` → Bearer fallback → `operators` (+`is_admin` all-access) → `truck_users` by `auth_user_id` **and** `truck_id` → role; 403 for a user belonging to another truck |
| [app/api/manage/route.ts:198-237](app/api/manage/route.ts#L198) | Same idea; role defaults to `'owner'` for token-only, and emits the `Actor` for the audit log |
| [app/api/native/bind-device/route.ts:32](app/api/native/bind-device/route.ts#L32) | Minimal: `truck_users.select('id, role').eq('auth_user_id',…).eq('truck_id',…)` |

`grep -rn "truck_users" lib/` returns **no helper** — only a comment in `delete-truck.ts`. Eight API
routes query the table directly. **So a validated-membership helper would be NEW**, though it would be
an extraction of `app/api/dashboard/route.ts:75-108` rather than novel logic.

Supporting pieces that already exist and would be reused: `createSupabaseServerClient()`
([lib/supabase/server.ts:4](lib/supabase/server.ts#L4), cookie-based) and the Bearer-JWT pattern
(`supabase.auth.getUser(jwt)`, [dashboard/route.ts:67](app/api/dashboard/route.ts#L67);
`userIdFromBearer` duplicated in [my-trucks:12](app/api/native/my-trucks/route.ts#L12) and
[switch-truck:12](app/api/native/switch-truck/route.ts#L12)).

**(c) Rejecting a mismatch.** A 403 precedent exists at
[app/api/dashboard/route.ts:105](app/api/dashboard/route.ts#L105) for a user whose operator record
belongs to a different truck. ⚠️ Two readable obstacles to *rejecting* rather than merely *recording*:

- **Token-only access is legitimate today and resolves to no user.** `/api/dashboard/route.ts:107`
  treats it as a supported mode (KDS/anonymous), and `/api/manage/route.ts:228-229` flags that
  token-only *"resolves to requestingUserRole='owner'"* — a known-weak gate recorded honestly rather
  than closed. Rejecting unidentified actors would change who can operate the dashboard, not just what
  gets logged.
- **The offline replay path cannot satisfy a validation.** Per Q5 the queued body carries only the
  token, and the drain re-posts it verbatim with no session; a cookie/Bearer check at replay time would
  fail for every queued op. Any actor validation would need a defined behaviour for that path.

**Cost summary, as read:** (a) trivial; (b) new helper, but a lift-and-shift of ~35 existing lines;
(c) not a code cost but a **policy** decision, because it necessarily interacts with token-only access
and with offline replay — both of which are working-as-designed today.

---

## What I could NOT verify

- **No DB access.** Nothing is confirmed against live data: not that `trucks.kds_pin` exists, not that
  every truck's `dashboard_pin` is null, not row counts in any table, not the live RLS state of
  `allergen_audit_log` (I can only say no migration enables it).
- **Nothing was executed.** No route was run, no query issued, no `tsc`, no build. This review is
  entirely static reading.
- **The "collect → undo → re-collect leaves no trace" behaviour is yours, observed live** — I did not
  reproduce it. I confirmed the *mechanism* by reading `reverseCollectionPayment`
  ([ledger.ts:315-320](lib/payments/ledger.ts#L315)) and the offline `removePendingStatusOp`
  ([outbox.ts:185](lib/native/outbox.ts#L185)).
- **Volume figures are INFERRED** from three live-verified data points in the manual (108 Gusto orders
  in July, 356 lifetime, ~15/event). I did not count rows.
- **Whether any truck has ever had a `dashboard_pin` set** is INFERRED from provisioning + absent UI,
  not observed.
- **Whether `allergen_audit_log`'s missing RLS is oversight or decision** is INFERRED; no comment in the
  repo addresses it either way.
- I did not check migrations applied outside `supabase/migrations/` — the repo's own
  `delete-truck.ts:9-10` warns that the directory "does not contain the FKs for the older core tables",
  so schema facts for `trucks`, `orders` and `truck_users` come from code usage, not DDL.
