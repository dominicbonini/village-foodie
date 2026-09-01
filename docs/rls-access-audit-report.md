# RLS access-pattern audit — READ AND REPORT ONLY

**Date:** 25 August 2026
**Nothing was changed.** No policy written, no migration run, no RLS enabled, no file edited.
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

🔴 **WHICH OF THE THREE: A SOURCE READ. Nothing else.** I did **not** run a typecheck, did **not**
execute anything against the database, and did **not** query `pg_policies` or `pg_tables` to confirm
which tables currently have RLS enabled — **that comes from your message and is taken as given.** Every
claim below is traceable to a file and a line in this repository.

---

# VERDICTS

| Table | Verdict |
|---|---|
| **`event_option_stock`** | ✅ **SAFE TO ENABLE RLS WITH NO POLICIES** |
| **`allergen_audit_log`** | ✅ **SAFE TO ENABLE RLS WITH NO POLICIES** |
| **`van_devices`** | ✅ **SAFE TO ENABLE RLS WITH NO POLICIES** |

✅ **All three are reached ONLY by the service-role key, ONLY from server modules.** The comparisons you
asked for are in §4 and §5 and are the strongest evidence here — **for `van_devices` the comparator is
read eleven lines away in the same function.**

---

# §1 — `event_option_stock`

## 1.1 EVERY SITE

| File:line | Operation | Client |
|---|---|---|
| `app/api/menu/[truckId]/route.ts:335` | `.from('event_option_stock')` — **read** | module `supabase` |
| `app/api/dashboard/action/route.ts:1151` | **read** | module `supabase` |
| `app/api/dashboard/action/route.ts:1836` | `.upsert({…})` — **write** | module `supabase` |
| `app/api/dashboard/action/route.ts:1858` | `.upsert({…})` — **write** | module `supabase` |
| `lib/option-stock.ts:94` | **read** | injected `SupabaseClient` |
| `lib/option-stock.ts:152` | **read** | injected `SupabaseClient` |

⚠️ `lib/delete-truck.ts:52` names the table **in a comment only**, in a list of what a cascade removes.

## 1.2 THE CLIENT, QUOTED AT ITS CONSTRUCTION

All three routes import the same module client:
```ts
  import { supabase } from '@/lib/supabase'          // menu:5, action:4, submit:6
```
`lib/supabase.ts:3-6`:
```ts
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```
✅ **SERVICE ROLE. Unambiguous — the key is named in the constructor.**

`lib/option-stock.ts` **holds no client of its own.** It takes one as a parameter:
```ts
  supabase: SupabaseClient, truckId: string, names: string[], eventId?: string | null,   // :88
```
**Its three importers all pass the service-role client:** `app/api/dashboard/action/route.ts:48`,
`app/api/orders/submit/route.ts:16` (both `import { supabase } from '@/lib/supabase'`), and
`lib/payments/promote-draft.ts:54`, which is itself parameterised (`supabase: SupabaseClient`, `:95`,
`:127`) and reached from the same service-role routes.

## 1.3 BROWSER EXECUTION — ✅ **NONE**

**Established by test, not by assumption:** for every file containing
`from('event_option_stock')`, I checked whether line 1 is `'use client'`. **Result: none are.** And no
file that touches the table imports `createSupabaseBrowserClient` or references
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — checked per file, all eight reported "no anon key".

## 1.4 DIRECT POSTGREST / REALTIME — ✅ **NONE**

A repo-wide search for `postgres_changes` and `table:` returns realtime subscriptions on **`orders`** and
**`trucks`** only (`app/dashboard/[token]/kds/page.tsx:1001,1023`;
`app/dashboard/[token]/page.tsx:1184,1192`). **`event_option_stock` appears in no channel.**

---

# §2 — `allergen_audit_log`

## 2.1 EVERY SITE — 🔴 **THERE IS EXACTLY ONE, AND IT IS A WRITE**

```ts
    const { error } = await supabase.from('allergen_audit_log').insert(rows)   // lib/allergen-audit.ts:31
```
🔴 **NOTHING IN THE CODEBASE EVER READS THIS TABLE.** A full-text search for the table name across
`app/`, `lib/`, `components/` and `scripts/` returns that insert plus one comment
(`lib/menu-commit.ts:83`). **Write-only by construction.**

## 2.2 THE CLIENT

`lib/allergen-audit.ts` holds no client — `logAllergenChanges(supabase: SupabaseClient, rows)` (`:28`).
**Six call sites, two constructors, both service role:**

- `app/api/manage/route.ts:403, 415, 506, 516, 823` → `app/api/manage/route.ts:18-21`:
  ```ts
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  ```
- `lib/menu-commit.ts:432` → callers are `app/api/manage/commit-menu/route.ts:58`, whose client is
  `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)` (`:12-15`),
  and `lib/provision-demo.ts:352`.

⚠️ **Note the URL variable differs between the two** (`SUPABASE_URL` vs `NEXT_PUBLIC_SUPABASE_URL`) —
**the KEY is `SUPABASE_SERVICE_ROLE_KEY` in both**, which is what RLS turns on.

## 2.3 BROWSER / REALTIME — ✅ **NONE.** No `'use client'` file contains a `.from()` on it; no channel
subscribes to it.

---

# §3 — `van_devices`

## 3.1 EVERY SITE

| File:line | Operation | Client |
|---|---|---|
| `app/api/native/bind-device/route.ts:49` | `.select('*')` — **read** | `supabaseAdmin` |
| `app/api/native/bind-device/route.ts:87` | `.upsert(patch, …)` — **write** | `supabaseAdmin` |
| `app/api/native/my-trucks/route.ts:93` | `.select('truck_id, van_id, default_screen')` — **read** | `supabaseAdmin` |
| `app/api/native/switch-truck/route.ts:46` | **update** | `supabaseAdmin` |
| `app/api/orders/submit/route.ts:1273` | `.select('device_id, push_token, platform')` — **read** | module `supabase` |
| `app/api/orders/submit/route.ts:1305` | `.update({ push_token: null })` — **write** | module `supabase` |

## 3.2 THE CLIENTS, QUOTED

```ts
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```
— `switch-truck/route.ts:10` and `my-trucks/route.ts:10`, identical single-line form;
`bind-device/route.ts:12-15` is the same call across four lines. `orders/submit` uses the module
`lib/supabase.ts` client quoted in §1.2. ✅ **All service role.**

⚠️ **`bind-device` ALSO constructs a cookie client** — `const supabaseAuth = await createSupabaseServerClient()`
(`:28`) — **but that one is used to identify the caller, not to touch `van_devices`.** The table is
reached only through `supabaseAdmin`.

## 3.3 BROWSER EXECUTION — 🔴 **THE MENTIONS IN CLIENT COMPONENTS ARE COMMENTS, NOT ACCESS**

Six `'use client'` files name `van_devices`: `components/native/NotificationSettings.tsx` (`:6, :20, :57`),
`VanMenuChooser.tsx:56`, `OperatorDeviceConfig.tsx` (`:4, :214`), `components/dashboard/UserMenu.tsx:79`.
✅ **Every one is prose describing what the server does.** None contains a `.from('van_devices')` — the
per-file check returned **NONE** for all three tables.

**What the browser actually does** is call the API. `lib/native/device.ts:69`:
```ts
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
```
— a `fetch` to `/api/native/bind-device`. **The write happens server-side under the service role.**

## 3.4 REALTIME — ✅ **NONE.**

---

# §4 — ✅ COMPARISON: `event_option_stock` vs THE THREE RLS-ENABLED STOCK TABLES

**The access pattern is the same. Not similar — the same three surfaces, in the same shape.**

| Surface | `event_item_stock` (RLS on) | `event_category_stock` (RLS on) | `event_option_stock` (RLS off) |
|---|---|---|---|
| Customer menu read | `menu/[truckId]:295` | `menu/[truckId]:318` | **`menu/[truckId]:335`** |
| Operator writes | `action:1055, 1874` | `action:1890, 1909` | **`action:1836, 1858`** |
| Operator read | `action:1069, 1738` | `action:1743` | **`action:1151`** |
| `lib/` helper with injected client | `stock-guard:177`, `stock-availability:74,119,123` | `stock-guard:178,262`, `stock-availability:75` | **`option-stock:94,152`** |

✅ **Same three files. Same service-role module client. Same helper-takes-a-`SupabaseClient` shape, with
the same routes injecting it** — `action`, `submit` and `promote-draft` import the option helpers at
`:48`, `:16` and `:54` exactly as they import the item/category helpers at `:46/:47`, `:25/:30`,
`:53/:63`.

🔴 **`event_item_stock` and `event_category_stock` ARE RLS-ENABLED AND SERVE PIZZERIA GUSTO TODAY THROUGH
THE SAME CUSTOMER MENU ROUTE.** If RLS on those does not break the customer menu, RLS on
`event_option_stock` cannot either — **it is read by the same handler, on the same request, with the same
key.**

⚠️ **ONE COMPARATOR DID NOT COMPARE: `category_stock` HAS ZERO CODE REFERENCES.** A search for
`from('category_stock')` and for the bare name across `app/`, `lib/` and `components/` returns **nothing**.
**It is RLS-enabled and, as far as this repository is concerned, unused.** That makes it evidence that
enabling RLS is survivable, but **not** evidence about an access pattern — there is no pattern to compare.

---

# §5 — 🔴 COMPARISON: `van_devices` vs `van_notification_prefs` — THE TIGHTEST EVIDENCE IN THIS REPORT

**`van_notification_prefs` is RLS-enabled with zero policies, and it is read ELEVEN LINES BEFORE
`van_devices`, in the same function, on the same request, with the same client.**

```ts
  :1254   .from('van_notification_prefs').select('enabled').eq('van_id', vanId).eq('type', 'order_pending').maybeSingle()
                                    ⋮        (same push block, same `supabase`)
  :1273   .from('van_devices').select('device_id, push_token, platform').eq('van_id', vanId)…
```
Both in `app/api/orders/submit/route.ts`, both using the `lib/supabase.ts` service-role client.

🔴 **THIS IS AS CLOSE TO A CONTROLLED COMPARISON AS THE CODEBASE OFFERS.** One table has RLS on, the other
does not; they are read consecutively in one code path that runs on **every customer order**, including
Pizzeria Gusto's. **The RLS-enabled one works.** There is no mechanism by which the second read would
behave differently — same key, same connection, same request.

⚠️ **`device_notification_prefs` HAS ZERO CODE REFERENCES**, like `category_stock`. Same caveat: evidence
that enabling RLS is survivable, not evidence about an access pattern.

---

# §6 — VERDICTS, WITH THE REASONING COMPRESSED

**`event_option_stock` — ✅ SAFE TO ENABLE RLS WITH NO POLICIES.** Six access sites, all server-side, all
service-role; no browser access, no realtime; **and its access pattern is identical to two tables that
already have RLS enabled and are read by the same customer-facing handler.**

**`allergen_audit_log` — ✅ SAFE TO ENABLE RLS WITH NO POLICIES.** One site, an insert, service-role only.
**Nothing reads it at all**, so there is no read to preserve.

**`van_devices` — ✅ SAFE TO ENABLE RLS WITH NO POLICIES.** Six sites, all server-side, all service-role;
the client components mention it only in comments and reach it through `/api/native/bind-device`;
**and a comparator table eleven lines away in the same function already has RLS enabled with zero
policies and works in production.**

---

# §7 — 🔴 THE LIMITS OF THIS AUDIT, STATED SO THEY ARE NOT ASSUMED AWAY

1. **This is a read of THIS REPOSITORY.** It cannot see access from outside it: the Supabase SQL editor,
   `psql`, a BI tool, a Zapier-style connector, or a script on someone's machine. ⚠️ **If anything outside
   the repo reads these tables with the anon key, this audit would not know.**
2. 🔴 **I DID NOT VERIFY WHICH TABLES CURRENTLY HAVE RLS ENABLED.** That premise — three live tables
   without it, and the six comparators' states — is taken from your message. **One `pg_tables` /
   `pg_policies` read would confirm it and I did not run one.**
3. ⚠️ **The Supabase dashboard's Table Editor is a separate consideration.** Enabling RLS changes what a
   dashboard session sees in some configurations. **That is a convenience question, not a production
   one**, but it is worth knowing before you wonder why a table looks empty.
4. ⚠️ **Nothing here says anything about the three BACKUP tables**, which you are handling separately.

✅ **No policy was written, no migration run, no RLS enabled, nothing edited.**
