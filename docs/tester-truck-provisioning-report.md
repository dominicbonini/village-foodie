# How the Apple Tester truck was created — READ AND REPORT ONLY

**Nothing was created, changed, run or proposed.** No SQL was written. No route was invoked, no database
was queried, no build was run. The only file written is this report.

**Prompt integrity:** no span arrived garbled and no instruction contradicted another. ("Change nothing"
and "write your report to `docs/…`" are consistent — the report is the sanctioned output.)

## Which of the three I did — plainly

**None of them.** I did **not** parse, **not** typecheck, and **not** execute. This is file reads and
greps only.

⚠️ **AND THAT BOUNDS ITEM 3.** I have not read the live `test-truck-3-2` row. What follows establishes
**what the code paths in this repository can and cannot produce**, and reasons from that against the
three facts you supplied (`plan 'trial'`, `trial_expires_at 2026-12-31`, seeded events). Where the answer
depends on a value only the database holds, it is marked **CANNOT DETERMINE**.

---

## 1. Every path that can create a truck with events, orders and a menu

🔴 **THERE IS EXACTLY ONE `INSERT` INTO `trucks` IN THE ENTIRE REPOSITORY**, and it is in
`lib/provision-truck.ts:397`. A grep for `from('trucks')` combined with `insert|upsert` across
`app/`, `lib/`, `scripts/` and `supabase/` returns **no other hit**. Everything below either calls that
function or writes the *dependent* tables.

| # | Path | Kind | How invoked | What it creates |
|---|---|---|---|---|
| 1 | `lib/provision-truck.ts` → `provisionTruck()` | library | called by ①②③ below | **`trucks` + `truck_vans`. Nothing else.** |
| 2 | `app/api/admin/create-truck/route.ts` | **route** (admin-gated) | admin console "Create truck" modal | calls `provisionTruck`, optionally links a `discovery_trucks` row |
| 3 | `app/api/setup/route.ts` | **route** | the self-serve signup wizard | calls `provisionTruck` |
| 4 | `lib/provision-demo.ts` → `provisionDemo()` | library | ⑤ below | orchestrates: truck+van → menu → event → orders |
| 5 | `app/api/admin/provision-demo/route.ts` | **route** (admin-gated) | manual POST; **self-described scaffolding** | calls `provisionDemo` |
| 6 | `lib/menu-commit.ts` → `commitMenu()` | library | `provisionDemo`, and the Manage menu import | `menu_categories`, `menu_items_db`, `menu_subcategories`, `modifier_groups`, `modifier_options`, `item_modifier_groups` |
| 7 | `lib/provision-demo-event.ts` → `provisionDemoEvent()` | library | `provisionDemo` only | `truck_events`, `slot_capacity`, `production_slot_usage` rebuild |
| 8 | `lib/seed-demo-orders.ts` → `seedDemoOrders()` | library | `provisionDemo` only | `orders` (one bulk `.insert(rows)` at `:379`) |
| 9 | `app/api/manage/route.ts` `upsert_event` | **route** (token-authed) | Manage → Schedule | `truck_events` + slot generation + `event_deals` |
| 10 | `app/api/admin/create-operator/route.ts` | **route** (admin-gated) | admin console | Supabase Auth user + `operators` row + `trucks.operator_id` |
| 11 | `scripts/seed-hatchesup-trucks.js` | **script** (`node`) | by hand | ⚠️ seeds **`discovery_trucks`**, not `trucks` — a scraped-shadow seeder, not a provisioner |
| 12 | `scripts/seed-thai-kitchen-screenshots.sql`, `docs/seed-apple-tester-orders.sql`, `docs/seed-thai-kitchen-orders.sql` | **hand-pasted SQL** | Supabase SQL editor, by a human | `orders` (and whatever else the file contains) |

**No migration under `supabase/migrations/` creates a truck.** A grep for `insert into trucks` across
`supabase/**/*.sql` returns nothing.

🔴 **THE SCOPE LINE THAT DECIDES MOST OF THIS REPORT** — `lib/provision-truck.ts:9-12`, verbatim:

```ts
// SCOPE: truck + van. Event creation is deliberately NOT here — events are recurring where trucks are
// one-shot, and `upsert_event` (app/api/manage/route.ts) already handles slot_capacity generation, the
// production_slot_usage rebuild and event_deals seeding correctly. Duplicating that would fork the slot
// engine. The demo's event (status:'open', computed window) lands in Phase 2 alongside its own extraction.
```

**So paths ② and ③ — the only two that produce a NON-demo truck — create a truck and a van and stop.**
Menu, events and orders are somebody else's job on those paths.

### The two profiles, and the identity each produces

`lib/provision-truck.ts:134-…`:

```ts
  operator: {
    identity: 'readable',
    …
    plan: 'trial',
    nameRequired: true,
```
```ts
  demo: {
    identity: 'random',
    plan: 'demo',
    nameRequired: false,
```

`:292-311`:

```ts
function demoIdentity(): Identity {
  // id, slug and token are generated INDEPENDENTLY. All three are publicly resolvable (/api/menu and
  // /api/events each accept id or slug), so leaking one must not hand over the others. Costs nothing.
  return {
    id: DEMO_PREFIX + randomToken(DEMO_TOKEN_CHARS),
    …
}

function operatorIdentity(name: string, slugOverride: string | undefined, attempt: number): Identity {
  const base = createSlug(slugOverride || name)
  const suffixed = attempt === 0 ? base : `${base}-${attempt + 1}`
  return {
    id: suffixed,
    slug: suffixed,
    dashboard_token: `${suffixed.slice(0, 24)}-${randomBytes(6).toString('hex')}`,
  }
}
```

⚠️ **`plan` IS OVERRIDABLE AT CREATION** — `:346` reads `const plan = opts.plan ?? profile.plan`, and
`app/api/admin/create-truck/route.ts:104` passes `plan: body.plan`. **So an admin-created truck can be
`'trial'` from the moment it exists.**

🔴 **BUT `trial_expires_at` IS NOT.** `:412-415`, verbatim and unconditional:

```ts
        // 🔴 STAYS NULL, and now MEANS something: "trial not started". Nomination — the operator
        // choosing which event starts it — is what sets a date, and does not exist yet. canAccess
        // reads NULL as not-started and grants the trial set; a PAST date still denies.
        trial_expires_at: null,   // nomination sets this (§8)
```

**There is no branch, no option and no profile field that makes this anything but `null`.**

---

## 2. What `app/api/admin/provision-demo/route.ts` and `lib/provision-demo.ts` do

### The route

**Admin-gated, and it announces itself as temporary** — `:3-6`, verbatim:

```ts
// ⚠️ TEMPORARY TEST SCAFFOLDING. This is NOT the real entry point. The production path is a PUBLIC upload
// on the landing page (spec Stage 1-2) with no auth at all — anonymous by design. This route exists only so
// provisionDemo() can be exercised against the live DB, by a human, before anonymous traffic drives it.
// DELETE (or repurpose) when the public upload endpoint lands.
```

It accepts a menu **file**, menu **text**, or an `existingTruckId` to re-provision (`:50-55`), calls
`provisionDemo` (`:58`), then reads the counts **back out of the database** rather than trusting the
provisioner's arithmetic (`:60-61`), and returns dashboard / order / KDS URLs.

### The library

`lib/provision-demo.ts:2-19` states the composition exactly:

```ts
// THE demo provisioning service (spec Phase 2, step 8 + 9). ONE code path, three callers:
//   1. first run          — a prospect uploads a menu photo on the landing page
//   2. return visit       — they come back via the emailed link; the old event is stale, so re-provision
//   3. template fallback  — extraction failed, so build Pizza/Burgers/Curries from a fixed menu (§11)
…
//   provisionTruck({kind:'demo'})  → truck + van, hidden, demo- prefixed identity   [lib/provision-truck]
//   extractMenu                    → AI extraction, writes nothing                  [lib/menu-extract]
//   buildDemoAssumptions           → the wizard answers, incl. categoryPrep         [lib/demo-assumptions]
//   commitMenu                     → the one write of the menu                      [lib/menu-commit]
//   provisionDemoEvent             → live event + slot_capacity + occupancy rebuild [lib/provision-demo-event]
//   seedDemoOrders                 → ~10 real orders, customer_email NULL           [lib/seed-demo-orders]
```

Answering your four questions directly:

| Question | Answer |
|---|---|
| **What does it create?** | truck + van + full menu + **one live event** + `slot_capacity` + **~10 orders** + a `demo_sessions` row |
| **What does it name it?** | 🔴 **Nothing you choose.** `provisionTruck` is called with **no `name`** (`:112-115` passes only `kind` and `van`), so `:390` fires: `` `Demo Kitchen (${identity.id.slice(…, …+6)})` `` — **"Demo Kitchen (ab12cd)"** |
| **What plan?** | 🔴 **`'demo'`**, from the demo profile. Not `'trial'`. |
| **Does it set `trial_expires_at`?** | 🔴 **No.** It inherits `provisionTruck`'s hardcoded `null`. |

🔴 **AND IT ALWAYS PRODUCES A `demo-` PREFIXED ID.** `kind: 'demo'` is hardcoded at `:113`; the route
exposes no way to change it. That prefix is load-bearing — `proxy.ts` grants `/dashboard/demo-*` an
exception from the session gate — and it is what the cleanup cron keys on (§6).

⚠️ **It also opens a `demo_sessions` row deliberately early** (`:128-140`) *"so the expiry sweep is the
backstop for EVERY mid-provision failure"* — i.e. **every demo it creates is enrolled for deletion from
birth.**

---

## 3. Does any path produce a truck resembling `test-truck-3-2`?

**No single path does. The shape is consistent with the ADMIN CREATE ROUTE for the truck and van, and
with SOMETHING ELSE for every other part — including at least one edit no provisioning code performs.**

Established as follows, all from source:

**(a) It is not `provisionDemo`.** That path hardcodes `kind: 'demo'` → `DEMO_PREFIX + randomToken(26)`,
i.e. `demo-` followed by 26 base32 characters. `test-truck-3-2` carries no such prefix and is not 26
characters. **`provisionDemo` cannot produce it, and neither can anything downstream of it** — which also
rules out `provisionDemoEvent` and `seedDemoOrders` as the source of its events and orders, because
those two library functions have **exactly one caller each** (`lib/provision-demo.ts`).

**(b) The id shape matches `operatorIdentity` exactly, on a COLLISION.** `:304` is
`attempt === 0 ? base : \`${base}-${attempt + 1}\``. **`test-truck-3-2` is `base = 'test-truck-3'` at
`attempt = 1`** — i.e. a truck whose name or slug-override slugged to `test-truck-3` **when
`test-truck-3` already existed.** ⚠️ **That is a derivation, not a certainty:** a truck literally named
"Test truck 3 2" would slug identically at attempt 0. **CANNOT DETERMINE which, without the row.**

⚠️ **The name "Apple Tester" does not slug to `test-truck-3`.** `createSlug('Apple Tester')` is
`apple-tester`. So **either** the slug field in the admin modal was set explicitly (the route accepts
`slug: body.slug` at `:103`, and `app/admin/page.tsx:453` confirms the modal has one — *"slug left blank
so lib/provision-truck derives it from the name"*), **or the truck was renamed after creation.**
`trucks.name` is in `/api/manage`'s `update_settings` allowlist, so a rename is an ordinary app action.

**(c) `plan: 'trial'` at creation is possible.** `:346` `opts.plan ?? profile.plan`, and create-truck
forwards `body.plan`. **This one needs no explanation beyond the admin modal.**

**(d) 🔴 `trial_expires_at = 2026-12-31` CANNOT HAVE COME FROM ANY PROVISIONING PATH.** The insert writes
`null`, unconditionally. Two independent comments in unrelated modules say the same thing —
`lib/settings-copy.ts:34`: *"nothing in application code writes `trucks.trial_expires_at` except
lib/provision-truck.ts setting it"*, and `lib/email-signup.ts:171`: *"trial_expires_at is written as null
by lib/provision-truck.ts and by nothing else, no nomination…"*. **A grep for `trial_expires_at` across
`app/` and `lib/` confirms it: the only other writers are three lines in `app/admin/page.tsx`.**

**So the expiry was set AFTER creation, by one of exactly two mechanisms:**

- **The admin console's edit modal.** `app/admin/page.tsx:640-652`:

```ts
  const setModalTrial = (months: 1 | 3) => {
    const expires = new Date()
    expires.setMonth(expires.getMonth() + months)
    setModalEdits(prev => ({ ...prev, plan: 'trial', trial_expires_at: expires.toISOString() }))
  }
  // Custom trial end date from the date picker. Sets it to end-of-day so the trial lasts
  // THROUGH the chosen date.
  const setModalTrialDate = (dateStr: string) => {
    if (!dateStr) return
    const expires = new Date(`${dateStr}T23:59:59`)
    setModalEdits(prev => ({ ...prev, plan: 'trial', trial_expires_at: expires.toISOString() }))
  }
```

  submitted to `app/api/admin/route.ts:93`, which is **unallowlisted** — `const { truckId,
  discoveryTruckId, ...updates } = body` then `.from('trucks').update(updates)`. ⚠️ **A 31 December
  end-of-day value is exactly what `setModalTrialDate` produces from a date picker**, and is **not** what
  either month preset produces. **That is the strongest single indicator in this report that a human used
  the date picker.**
- **Hand-run SQL.** Indistinguishable from the above in the row itself.

**CANNOT DETERMINE which** — the row does not record its author.

**(e) The events, menu and orders came from elsewhere again.** `provisionTruck` creates truck + van only.
For a non-`demo-` truck the available producers are the **app's own routes** (`upsert_event` in Manage,
menu import via `commitMenu`, orders via `/api/orders/submit` or the dashboard's Add Order) **or hand
SQL.**

⚠️ **A hand-SQL artefact for this exact truck exists in the repository.** `docs/seed-apple-tester-orders.sql`
opens:

```sql
-- seed-apple-tester-orders.sql — 64 orders on each of 8 events, 21–28 August 2026.
-- 🚫 NOT RUN. Dominic runs all SQL by hand. Paste the whole file into the Supabase SQL editor.
```

🔴 **REPORTED AS AN ARTEFACT, NOT AS PROOF.** The file's own header says it was **not run**, and a file
claiming something is exactly the kind of evidence you asked me not to rely on. **What it does establish
independently of its claims is that the project's working method for this truck's data was hand-pasted
SQL against 8 events** — and that no code path in the repository was written to do it.

### The verdict, stated plainly

🔴 **`test-truck-3-2` WAS ASSEMBLED, NOT PROVISIONED.** No path in item 1 produces it end to end. The
truck and van are consistent with `/api/admin/create-truck`; **`plan: 'trial'` could be set there**;
**`trial_expires_at` demonstrably could not**; and the menu, 8 events and their orders came from the app's
ordinary routes, hand SQL, or both. **The nearest thing to a single button is `provisionDemo`, and it
produces a differently-shaped truck on a different plan with a different id, enrolled for automatic
deletion.**

---

## 4. What an operator LOGIN requires — and there IS a path

**Table:** `operators`, joined to Supabase Auth by `auth_user_id`. **Ownership of a truck is
`trucks.operator_id`**, or a row in `truck_users`.

The rule, from `app/api/native/my-trucks/route.ts:42-60` (the same resolver `switch-truck` gates on):

```ts
export async function resolvePermittedTrucks(userId: string): Promise<{ isAdmin: boolean; ids: Set<string> }> {
  const ids = new Set<string>()
  const { data: op } = await supabaseAdmin.from('operators').select('id, is_admin').eq('auth_user_id', userId).maybeSingle()
  if (op?.is_admin) { … return { isAdmin: true, ids } }
  if (op) {
    const { data: owned } = await supabaseAdmin.from('trucks').select('id').eq('operator_id', op.id).eq('active', true)
    owned?.forEach((t: { id: string }) => ids.add(t.id))
  }
  const { data: memberships } = await supabaseAdmin.from('truck_users').select('truck_id').eq('auth_user_id', userId)
  memberships?.forEach((m: { truck_id: string | null }) => { if (m.truck_id) ids.add(m.truck_id) })
  return { isAdmin: false, ids }
}
```

### 🔴 THE ANSWER TO YOUR DECIDING QUESTION: A PATH EXISTS, AND IT DOES ALL THREE STEPS

`app/api/admin/create-operator/route.ts` — admin-gated (`:32` checks `operators.is_admin`) — does the
whole thing, `:45-78`:

```ts
  const tempPassword = generateTempPassword()

  // Create Supabase Auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  })
…
  // Create operator record
  const { data: operator, error: opError } = await supabase
    .from('operators')
    .insert({
      auth_user_id: authData.user.id,
      email,
      name: email.split('@')[0],
    })
    .select('id')
    .single()
…
  // Link operator to truck
  const { error: truckError } = await supabase
    .from('trucks')
    .update({ operator_id: operator.id })
    .eq('id', truckId)
```

**So creating a login does NOT require anything no code path does.** It requires an admin session, a
truck id and an email address. The password is **generated server-side** (`generateTempPassword()`),
`email_confirm: true` skips verification, and `must_change_password: true` forces a reset at first login.

⚠️ **Three things to know about it, all read from the same file:**
- **It emails the temporary password via Brevo** (`:103-126`, *"Temporary password: …"*). **The password
  is returned in the JSON response too** (`:84`), so it is recoverable without the email arriving.
- ⚠️ **THE TRUCK LINK IS BEST-EFFORT AND FAILS SOFT.** `:80-88` — if the `operator_id` update fails it
  returns **`ok: true`** with a `warning`. **An account created but not linked reaches no truck**, and
  the response still reads as success.
- 🔴 **IT HAS A GRADUATION SIDE EFFECT.** `:94-101` sets `discovery_trucks.excluded = true` for **any**
  discovery row whose name matches the truck's, case-insensitively. Harmless for a uniquely-named tester
  truck; **worth knowing before pointing it at a name that collides with a real scraped truck.**

---

## 5. Every table a fully functional tester truck needs — and who populates it

The authoritative inventory is `lib/delete-truck.ts:36-55`, because a delete cascade must name everything
a truck touches.

| Table | Needed for | Populated by which path in §1 |
|---|---|---|
| **`trucks`** | the truck itself | ① (via ②③④) — **the only inserter** |
| **`truck_vans`** | events, KDS, device binding | ① |
| **`menu_categories`**, **`menu_items_db`** | a menu at all | ⑥ `commitMenu` |
| `menu_subcategories`, `modifier_groups`, `modifier_options`, `item_modifier_groups` | modifiers | ⑥ |
| **`truck_events`** | anything to order against | ⑦ (demo only) or ⑨ `upsert_event` |
| **`slot_capacity`** | the slot engine | ⑦ or ⑨ |
| `production_slot_usage` | occupancy | ⑦ / ⑨ rebuild |
| `event_deals` | per-event deals | ⑨ only |
| **`orders`** | a populated dashboard/KDS | ⑧ (demo only), `/api/orders/submit`, Add Order, or hand SQL |
| `order_counters` | order numbering | ⚠️ **not populated by any path in §1** |
| **`operators`** + Supabase Auth user | **a login** | ⑩ |
| **`trucks.operator_id`** | that login seeing the truck | ⑩ |
| `truck_users` | staff logins / van scoping | `/api/manage` `invite_team_member` |
| `demo_sessions` | expiry tracking | ④ only — 🔴 **and enrolling a tester truck here is what would make a cron care about it** |
| `van_devices` | native device binding | `/api/native/bind-device` |
| `discovery_trucks` link | public profile fallbacks | ② optionally, ⑩ as a side effect |
| `bundles_db`, `discount_codes_db`, `upsell_rules`, `kds_sessions`, `booking_locks`, `slot_bookings`, `collection_times`, `event_option_stock`, `category_stock`, `item_overrides`, `whatsapp_logs`, `excluded_terms`, `rejected_event_signatures`, `scraper_run_log` | optional / runtime | created on demand |

🔴 **THE GAP, STATED PLAINLY: of that list, the two NON-demo provisioning routes (②③) populate exactly
TWO tables — `trucks` and `truck_vans`.** Everything a reviewer would actually see — menu, events,
orders — is outside them.

---

## 6. 🔴 Would a cron delete or expire such a truck? **NO — and the guard is explicit**

`app/api/cron/demo-cleanup/route.ts` runs **hourly** (`vercel.json`: `"path": "/api/cron/demo-cleanup",
"schedule": "0 * * * *"`). It has three sweeps, and **every one of them funnels through a single
function that refuses anything without the `demo-` prefix** — `:53-63`, verbatim:

```ts
/** Delete one demo truck through the SINGLE verified cascade, asserting the demo prefix first. */
async function sweep(truckId: string, failures: Failure[]): Promise<boolean> {
  // ASSERT, don't assume (the brief's requirement). Every query below is already prefix-filtered, so this
  // can only fire if a query is later loosened — which is exactly when you want a hard stop rather than a
  // cascade delete running against a real operator's truck.
  if (!isDemoIdentifier(truckId)) {
    const msg = `REFUSED: ${truckId} is not a ${DEMO_PREFIX} truck — cleanup must never touch a real truck`
    console.error(`[demo-cleanup] ${msg}`)
    failures.push({ truckId, error: msg })
    return false
  }
```

with `lib/demo.ts:21,27-29`:

```ts
export const DEMO_PREFIX = 'demo-'
…
export function isDemoIdentifier(identifier?: string | null): boolean {
  return typeof identifier === 'string' && identifier.startsWith(DEMO_PREFIX)
}
```

### The three sweeps and their criteria

| Sweep | Criteria | Source |
|---|---|---|
| **1a — expired, unclaimed** | `demo_sessions.expires_at < now()` **AND** `claimed_by_operator_id IS NULL` | `:124-128` |
| **1b — claimed but abandoned** | `claimed_by_operator_id IS NOT NULL` **AND** `expires_at < now()` **AND** `created_at < now() − CLAIM_GRACE_DAYS` | `:145-150` |
| **2 — orphans** | `trucks.id LIKE 'demo-%'`, older than `ORPHAN_WINDOW_HOURS`, with **no active menu items or no events** | `:162-186` |

**Sweep 2 is prefix-filtered at the query.** Sweeps 1a/1b are keyed on `demo_sessions`, which is
*not* prefix-filtered at the query — **but their output still passes through `sweep()`, which refuses.**

### Verdict

✅ **`test-truck-3-2` is safe from `demo-cleanup`, and would remain safe even if someone gave it a
`demo_sessions` row** — the prefix assertion is the last gate on every path, and it would log a `REFUSED`
line rather than delete. 🔴 **The one thing that WOULD make it deletable is naming a tester truck with a
`demo-` prefixed id** — which `provisionDemo` does automatically, and which is the single strongest
argument in this report against using that route for a tester.

### The other four crons — checked, none of them a risk

| Cron | Touches `trucks`? |
|---|---|
| `account-deletion-due` | **reads** `trucks` (`:91`, `select('id, name').eq('operator_id', op.id)`) as part of the operator-initiated deletion flow — ⚠️ **so a tester truck IS reachable if its linked operator requests account deletion.** Never fires on a timer alone. |
| `cancel-stale-authorizations` | no |
| `capture-stranded-authorizations` | no |
| `auto-reject-offline-orders` | reads one truck for a name (`:122`); rejects **orders**, never a truck |

⚠️ **Nothing expires a `trial` plan on a schedule.** `trial_expires_at` is read by `canAccess()` at
request time; a past date **denies features**, it does not delete anything. **CANNOT DETERMINE** what a
2026-12-31 date does on 1 January 2027 beyond that — no code sweeps it.

---

## What remains unobserved

1. **I ran nothing** — no parse, no typecheck, no execution. Nothing was created, written or queried.
2. 🔴 **THE LIVE ROW WAS NOT READ.** I have not seen `test-truck-3-2`'s `name`, `slug`,
   `dashboard_token`, `operator_id`, `created_at`, or whether it has a `demo_sessions` row. Every
   statement about how it was made is an inference from **what the code can produce**, against the three
   facts you supplied.
3. **CANNOT DETERMINE, and each would be settled by one look at the row:** whether the id came from a
   slug override or a collision; whether it was renamed after creation; whether `trial_expires_at` was
   set via the admin date picker or by hand SQL; and whether its events came from Manage or from SQL.
4. **`docs/seed-apple-tester-orders.sql` says it was NOT run**, and I did not verify that either way. It
   is reported as an artefact whose existence is a fact; its claims are its own.
5. **`CLAIM_GRACE_DAYS` and `ORPHAN_WINDOW_HOURS` values were not quoted** — the sweeps' *shape* is what
   decides §6, and the prefix guard makes their numbers irrelevant to a non-`demo-` truck.
6. **No approach is proposed here**, as instructed.
