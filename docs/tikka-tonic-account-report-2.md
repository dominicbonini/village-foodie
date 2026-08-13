# Account-creation investigation, part 2 — `sheet_id`, `active`, vans, and email case

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no SQL was run, no
migration.** This report is the only file created. No `next dev`, no `next build`.

Pizzeria Gusto was **read** (two `SELECT`s across `operators` and `trucks`). Nothing was written.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE TWO THAT MATTER FOR TIKKA TONIC

1. **`Info@tikkatonic.com` with a capital I is load-bearing, and it breaks password reset silently.**
   `/api/admin/create-operator` is the **only** email-handling route in the repo that does not
   lowercase, while `/api/auth/forgot-password` looks up `.toLowerCase()` and, on no match, **returns
   `{ ok: true }` to prevent enumeration** — so the operator would request a reset, be told it worked,
   and never receive one. Section 5.
2. **If that truck is ever `active = false`, its non-admin operator cannot reach `/dashboard` at all** —
   they are redirected to `/login` while already signed in. `/manage`, by contrast, does **not** gate on
   `active`, so the two entry points disagree. Section 2.

---

## 1. `trucks.sheet_id`

### a. Every occurrence — the grep, classified

`grep -rn "sheet_id\|sheetId"` across `app`, `lib`, `components`, `scripts`, `supabase`:

| Site | Kind |
|---|---|
| `lib/provision-truck.ts:403` | 🔴 **the only WRITE** — `sheet_id: ''` |
| `lib/provision-truck.ts:399-402` | comment explaining it |
| `app/api/admin/create-truck/route.ts:5` | comment referencing it |
| `app/api/dashboard/route.ts:49` | **read as a REDACTION key**, not for use — see below |
| `lib/supabase.ts:63` | TypeScript type field only (`sheet_id: string`) |
| `scripts/run-scraper.js:380, 680, 1528, 1552, 1608` | ⚠️ **NOT this column** — `spreadsheetId`, the Google Sheets API parameter |
| `scripts/migrate-from-sheets.cjs:30` | ⚠️ same — `spreadsheetId` |

⚠️ **The `scripts/` hits are a name collision, not a usage.** They are `spreadsheetId` passed to
`sheets.spreadsheets.values.get`, unrelated to `trucks.sheet_id`. Worth stating because a naive grep
makes the column look alive.

### b. Is it read by any live code path? **No — it is dead.**

The single non-type reference is `app/api/dashboard/route.ts:41-50`, and it is a **removal**:

```ts
const TRUCK_REDACT = new Set([
  'dashboard_token', 'dashboard_pin', 'kds_pin', 'messenger_page_token', 'whatsapp_sender',
  'sheet_id',             // dead legacy Google Sheets id (NOT NULL, no default — see provision-truck)
])
…
if (TRUCK_REDACT.has(k) || SECRETISH.test(k)) continue
```

`publicTruckFields` (`:53-60`) **strips it out** of the dashboard payload. So the only code that names
the column exists to make sure nothing sees it. **No branch, no filter, no join, no display reads its
value.**

### c. What each creating path supplies

Part 1 established `lib/provision-truck.ts:390` is the repo's **only** INSERT into `trucks`, and all
three routes funnel through it. Therefore:

| Path | Supplies `sheet_id`? |
|---|---|
| `/api/setup` `create_truck` → `provisionTruck` | ✅ `''` (`:403`) |
| `/api/admin/create-truck` → `provisionTruck` | ✅ `''` |
| `lib/provision-demo.ts` → `provisionTruck` | ✅ `''` |
| 🔴 **Any hand-written SQL / direct table insert** | ❌ **supplies nothing — and therefore CANNOT insert a row.** `NOT NULL`, no default → the insert fails |

The comment at `:399-402` records exactly this, and that empty string is the established convention
("the live test-truck row carries `sheet_id = ''`, verified July 2026, which also confirms there is no
unique index on the column").

**Practical answer: you never need to think about `sheet_id` provided you create the truck through the
app. It only bites if someone writes SQL by hand.**

---

## 2. The `/dashboard` router

`app/dashboard/page.tsx`, 86 lines, read in full.

### a. The resolving query — and yes, it filters on `active`

`:36-41`:

```ts
const { data: trucks } = await supabaseAdmin
  .from('trucks')
  .select('dashboard_token')
  .eq('operator_id', operator.id)
  .eq('active', true)
  .order('created_at', { ascending: true })
```

### b. 🔴 A NON-ADMIN OPERATOR WHOSE ONLY TRUCK IS INACTIVE ENDS AT `/login`

Traced line by line:

1. `:18` — session exists, so no native fallback.
2. `:24-30` — `operators` row found, `is_admin` is false → **no redirect to `/admin`**.
3. `:35-43` — the owner query above returns **zero rows** (the `active` filter excludes their truck), so
   `trucks.length > 0` is false and **nothing redirects**.
4. `:49-65` — the staff path queries `truck_users`. ⚠️ **That table is empty across the entire
   database** (established in part 1), so `truckUser` is `undefined` and the block is skipped.
5. `:85` — the fall-through:

```ts
// Authenticated, but NO resolvable surface (not an admin, owns no active truck, no truck_users
// membership) → send to login. (Future: a clearer "no truck found" page rather than a login bounce.)
redirect('/login')
```

🔴 **They are signed in and are sent to the sign-in page.** Logging in again returns them to
`/dashboard`, which bounces them again — a loop with no error message. The code's own comment
acknowledges the shape ("Future: a clearer 'no truck found' page").

⚠️ **The staff branch has its own, separate `active` gate** at `:68`:
`if (!truck?.active) redirect('/login')` — same destination, reached a different way.

✅ **Live check: every truck in the database currently has `active = true`**, so nobody is in this state
today. It is a trap for later, most plausibly via the admin edit modal, which **always sends `active`**
on save (part 1, §5b).

### c. Does the admin branch run first? ✅ **Yes — confirmed at `:30`**

`if (operator?.is_admin) redirect('/admin')` sits **before** the owner query at `:36`. The comment at
`:20-23` states it is deliberate: *"MUST run first — an admin who owns 0 or 2+ active trucks would
otherwise null the trucks lookup and bounce to /login (the 'blank')."*

**So an admin never experiences 2b.** Which is precisely why it could go unnoticed: the person most
likely to toggle `active` is the one person the bug cannot reach.

### d. `/manage` — 🔴 NEITHER ENTRY POINT GATES ON `active`

**Tokenless `/manage`** — `app/manage/page.tsx:34-57`. Session → `operators` row → then
`resolveOperatorTruck`. That resolver, `lib/resolve-operator-truck.ts:41-48`:

```ts
const { data: trucks } = await supabase
  .from('trucks')
  .select('dashboard_token, setup_step, name')
  .eq('operator_id', operatorId)
  .order('created_at', { ascending: true })
```

**`operator_id` only. No `active` filter.** Its header states it is "a routing convenience, not an
authorisation check" (`:18-20`).

**`/manage/[token]`** — no `active` check anywhere in the page (grep for `active` returns only
`activeTab`, `activeCategory` and unrelated locals). And `/api/manage`'s `getTruck` fetches by
`dashboard_token` alone with no `active` filter (part 1).

🔴 **So the two consoles disagree.** With `active = false`:

| Surface | Outcome |
|---|---|
| `/dashboard` (index) | ❌ `/login` |
| `/dashboard/<token>` | ✅ still loads (token path, no `active` gate) |
| `/manage` (tokenless) | ✅ resolves and forwards |
| `/manage/<token>` | ✅ loads |
| `/kds/<kds_token>` | ❌ `/login` (`app/kds/[kds_token]/page.tsx:30`) |

**INFERRED** for `/dashboard/<token>`: I read the index router and found no `active` gate on the token
route, but did not read that page end to end.

---

## 3. Every `active` check on an operator-facing path

`grep -rn "eq('active', true)|.active === false|!truck?.active|!truck.active"` across `app`, `lib`,
`components`, each site then read to determine **which table** it tests.

### On `trucks.active` — these can lock an operator out

| Site | Effect |
|---|---|
| `app/dashboard/page.tsx:40` | 🔴 owner resolution — section 2b |
| `app/dashboard/page.tsx:68` | 🔴 staff resolution → `/login` |
| `app/kds/[kds_token]/page.tsx:24-30` | 🔴 **the KDS redirects to `/login`** |
| `app/api/native/bind-device/route.ts:20` | 🔴 the native app cannot bind a device |
| `app/api/native/my-trucks/route.ts:49, 54, 79` | 🔴 the truck vanishes from the native truck list — **including the `is_admin` all-access branch at `:49`** |
| `app/api/orders/submit/route.ts:203, 211` | 🔴 **customers cannot place orders** (both the slug and the id lookup) |
| `app/api/discovery/events/route.ts:253` | the truck is filtered out of discovery |

### On `truck_vans.active` — van housekeeping, not lockouts

`app/api/manage/route.ts:965, 1029, 1073` · `app/api/events/action/route.ts:87` (the "choose which truck
is working this event" guard when 2+ vans are active) · `app/dashboard/[token]/kds/page.tsx:545` ·
`app/api/native/bind-device/route.ts:51, 71` · `app/api/native/switch-truck/route.ts:35, 39` ·
`lib/van-utils.ts:19` · `lib/provision-demo.ts:108`.

### On `trucks.active` but sibling-listing only

`app/api/manage/route.ts:131` — lists the operator's *other* active trucks for the truck switcher. An
inactive truck simply does not appear in its siblings' switcher.

### 🔴 What is NOT gated — the answer to "setting up"

**`/api/manage` GET has no `active` filter at all**, so with `active = false` an operator who reaches
`/manage/<token>` can still use **the Menu tab, the import wizard, event creation, Settings and the team
page** normally. `app/api/heartbeat/route.ts:45-102` gates on **vans**, not trucks.

**So `active = false` does not block setup. It blocks: the `/dashboard` index, the KDS, the native app,
and customer ordering.** An operator could configure everything and only discover the problem when a
customer tried to order — or when they opened the kitchen screen.

---

## 4. `truck_vans` creation — two paths

`grep` for inserts into `truck_vans` returns **exactly two**.

| Column | `lib/provision-truck.ts:484-501` | `app/api/manage/route.ts:1014` (`add_van`) |
|---|---|---|
| `truck_id` | the new truck | the token's truck |
| `name` | `vanOpts.name?.trim() \|\| 'Van 1'` | `name.trim()`, **required** (400 if blank, `:1010-1012`) |
| `active` | `true` | `true` |
| **`kitchen_capacity`** | `'kitchen_capacity' in vanOpts ? vanOpts.kitchen_capacity : 5` | 🔴 **NOT SUPPLIED** |
| **`capacity_window_mins`** | 🔴 **omitted** → DB default `5` | 🔴 **NOT SUPPLIED** |
| **`order_ready_enabled`** | 🔴 **NOT SUPPLIED by either path** | 🔴 **NOT SUPPLIED** |
| `buzzer_count` | `profile.buzzerCount` (operator `null`, demo `10`) | not supplied |
| `kds_token` | omitted → DB default `encode(gen_random_bytes(24),'hex')` | omitted → same |

### 🔴 Flagging every unset `kitchen_capacity`, as asked

1. **`/api/setup` → `provisionTruck`** passes `van: { kitchen_capacity: null }` explicitly
   (`app/api/setup/route.ts:107`), so the key **is** present and the value is **`null`** —
   deliberately, per `:100-106`. The `'kitchen_capacity' in vanOpts` test at `:491` exists precisely so
   `?? 5` cannot coerce that intentional null back to 5.
2. 🔴 **`add_van` supplies nothing at all** (`:1014`), so a second van created from Manage inherits
   whatever the column's DB default is. **INFERRED: that default is null**, since `provisionTruck` goes
   to the trouble of writing 5 explicitly for the "omitted" case — but I did not read the column
   definition, so treat it as unverified.
3. `/api/admin/create-truck` with `van` omitted → `vanOpts = {}` → **`kitchen_capacity: 5`**.

⚠️ **`order_ready_enabled` is written by neither insert.** It is read at `lib/van-utils.ts:40` to seed
new events and at `app/api/dashboard/route.ts:540` with `?? false`, and it is only ever *updated* via
`app/api/manage/route.ts:982`. **Every new van starts with whatever the DB default is** — the `?? false`
at the read site suggests null is expected and tolerated. **INFERRED.**

**For Tikka Tonic:** if it is created through `/api/setup`, its Van 1 has `kitchen_capacity: null` — the
capacity engine is inert until an operator sets it in Manage. If created through
`/api/admin/create-truck` without a `van` object, it gets **5**. Same product, two different answers,
depending which route you use.

---

## 5. 🔴 `operators.email` AND CASE — IT IS LOAD-BEARING

### Every email comparison in the repo, and what each does

| Site | Normalises? |
|---|---|
| `app/api/signup/route.ts:41` | ✅ `.trim().toLowerCase()` |
| `app/api/auth/forgot-password/route.ts:23` | ✅ **looks up** `.eq('email', email.toLowerCase().trim())` |
| `app/api/auth/change-email/route.ts:28, 38, 44, 45` | ✅ normalises, and compares `.toLowerCase()` both sides |
| `app/api/manage/route.ts:894, 1083, 1095, 1119, 1136, 1152, 1164` | ✅ every team-member write and lookup lowercases |
| `lib/demo-session.ts:73` | ✅ lowercases |
| 🔴 **`app/api/admin/create-operator/route.ts:35, 49, 64, 65`** | ❌ **NO trim, NO lowercase — the address is used verbatim** |

`create-operator` destructures `const { truckId, email } = await req.json()` (`:35`) and passes that
string straight to `auth.admin.createUser({ email, … })` (`:49`), to
`operators.insert({ … email … })` (`:64`), to `name: email.split('@')[0]` (`:65`), and into the email
body (`:123`).

### What happens with `Info@tikkatonic.com`

1. `operators.email` stores **`Info@tikkatonic.com`** — capital I preserved.
2. `operators.name` becomes **`Info`** (`:65`), which is also what the operator sees as their name.
3. 🔴 **Password reset breaks, silently.** `forgot-password:20-29`:

```ts
const { data: operator } = await supabase
  .from('operators').select('id, email')
  .eq('email', email.toLowerCase().trim())
  .single()

// Always return success — prevents email enumeration
if (!operator) {
  return NextResponse.json({ ok: true })
}
```

`.eq` is **case-sensitive** in PostgREST/Postgres for a `text` column. The lookup asks for
`info@tikkatonic.com`, the row holds `Info@tikkatonic.com`, **no match** — and the route returns
`{ ok: true }` regardless, so **the operator is told the reset was sent and no email is ever
generated.** The anti-enumeration design makes the failure indistinguishable from success.

4. **Duplicate detection would miss it** — `change-email:44` checks `.eq('email', normalised)`, so a
   later account at `info@tikkatonic.com` would not collide with `Info@tikkatonic.com`. **INFERRED**
   unless `operators.email` carries a case-insensitive unique index, which I did not verify.
5. **Login itself probably still works** — **INFERRED**: Supabase GoTrue normalises addresses on both
   signup and sign-in, so the auth user would be created as `info@tikkatonic.com` regardless of what the
   `operators` row says. The mismatch is between `operators.email` and everything that queries it, not
   between the operator and Supabase Auth.

### Live check: this has not bitten yet

All eight existing `operators.email` values are already lowercase —
`dbonini82@gmail.com`, `testtruck@`, `realthaifood@`, `contact@pizzeriagusto.co.uk`, `hello@`,
`hello1@`, `dominicbonini@hotmail.com`, `tt4@`. **Every one of them was created before this mattered,
or through a path that normalises.** Tikka Tonic would be the first with a capital letter.

### The answer

**Type the email in lowercase when you create the account.** The route will not do it for you, and the
failure it causes is silent. ⚠️ **I have not changed the route** — this is a read-only report, and
normalising `create-operator` is a one-line change you may want to make deliberately, since it also
affects `operators.name` derivation.

---

## 6. WHAT WAS READ vs INFERRED

**Read from source, with line numbers given throughout:** the `sheet_id` grep and every hit classified ·
`app/dashboard/page.tsx` in full · `app/manage/page.tsx` in full · `lib/resolve-operator-truck.ts` in
full · every `active` check site, each opened to determine its table · both `truck_vans` insert literals
· every email comparison site · `forgot-password`'s lookup and its anti-enumeration return.

**INFERRED, labelled in place:**
- `/dashboard/<token>` has no `active` gate (index router read; that page not read end to end).
- The DB defaults for `truck_vans.kitchen_capacity`, `capacity_window_mins` and `order_ready_enabled`
  where an insert omits them.
- That Supabase Auth lowercases the address, so login survives a mixed-case `operators.email`.
- That no case-insensitive unique index exists on `operators.email`.

**Read from the live database (two `SELECT`s, no writes):** all eight `operators.email` values are
lowercase; all 13 trucks currently have `active = true`.

**Not established:** the exact DB column defaults above, which would need the schema rather than the
application code.
