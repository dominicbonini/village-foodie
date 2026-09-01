# `bind-device` partial-patch truck reassignment — read, fix, and execution proof

**Build only.** Nothing was committed, pushed or deployed. No migration was written. **No database
row was modified or deleted — the production fixture
`device_id c6b24668-9aa7-4687-9464-d7a2f1c0c2be` is untouched**, and no database was contacted at
any point. `switch-truck` was not altered. `lib/native/push.ts` was not altered. Nothing belonging
to `pizzeria-gusto` or `tikka-tonic` was touched.

**Prompt integrity:** no span of the instructing prompt arrived garbled, and no instruction
contradicted another. Nothing required stopping to ask.

**Exactly one source file changed: `app/api/native/bind-device/route.ts`.** Its diff is §6.

## Which of the three I did — plainly

| | |
|---|---|
| **Parse** | ✅ **Yes.** `ts.transpileModule` parsed the real `route.ts` on every harness run — a parse is a precondition of executing it, not a substitute for anything. |
| **Typecheck** | ❌ **No.** `tsc --noEmit` was not run. `transpileModule` performs **no** type checking by design — it strips types and emits. Nothing in this report rests on type correctness. |
| **Execution** | ✅ **Yes.** The route's real `POST` handler was **run**, eight cases, against an in-memory database, before and after the change. Results in §5. |

⚠️ Stated so it cannot be misread: **this is an execution proof of behaviour, not a build.** The
route was executed in isolation under stubbed modules; it was not compiled by Next, and
`next build` was not run.

---

# PHASE 1 — READ AND REPORT

## 1. The POST handler in full

`app/api/native/bind-device/route.ts:58-90` **as it stood before this task**:

```ts
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { token, device_id, van_id, default_screen, notify_enabled, push_token, platform } = body as {
    token?: string; device_id?: string; van_id?: string | null; default_screen?: string
    notify_enabled?: boolean; push_token?: string | null; platform?: string
  }
  const truck = await truckFromToken(token ?? null)
  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!device_id) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  // SECURITY GATE: van must belong to THIS truck. Reject a cross-truck van_id outright.
  if (van_id) {
    const { data: van } = await supabaseAdmin
      .from('truck_vans').select('id').eq('id', van_id).eq('truck_id', truck.id).eq('active', true).single()
    if (!van) return NextResponse.json({ error: 'van not found for this truck' }, { status: 404 })
  }
  if (default_screen && default_screen !== 'dashboard' && default_screen !== 'kds') {
    return NextResponse.json({ error: 'invalid default_screen' }, { status: 400 })
  }

  // Upsert by device_id (unique). Only patch provided fields; always refresh truck_id + last_seen.
  const patch: Record<string, unknown> = { truck_id: truck.id, device_id, last_seen: new Date().toISOString() }
  if (van_id !== undefined) patch.van_id = van_id
  if (default_screen !== undefined) patch.default_screen = default_screen
  if (notify_enabled !== undefined) patch.notify_enabled = !!notify_enabled
  if (push_token !== undefined) patch.push_token = push_token
  if (platform !== undefined) patch.platform = platform

  const { data, error } = await supabaseAdmin
    .from('van_devices').upsert(patch, { onConflict: 'device_id' }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, device: data })
}
```

### How `truck_id` is derived

`app/api/native/bind-device/route.ts:17-22` — from the token, never from the body:

```ts
async function truckFromToken(token: string | null) {
  if (!token) return null
  const { data } = await supabaseAdmin
    .from('trucks').select('id, name').eq('dashboard_token', token).eq('active', true).single()
  return data
}
```

Called at `:64`; a null result 401s at `:65`. The file header at `:6` states the intent:
*"body.truck_id is never trusted — it's resolved from the token."*

### How the patch is assembled, field by field

| Field | Condition | Source |
|---|---|---|
| **`truck_id`** | 🔴 **UNCONDITIONAL** | **derived from the caller's identity** (`truck.id`) |
| **`device_id`** | **UNCONDITIONAL** | caller-supplied, presence-checked at `:66` |
| **`last_seen`** | **UNCONDITIONAL** | server clock |
| `van_id` | conditional — `van_id !== undefined` | caller-supplied |
| `default_screen` | conditional — `!== undefined` | caller-supplied |
| `notify_enabled` | conditional — `!== undefined` | caller-supplied |
| `push_token` | conditional — `!== undefined` | caller-supplied |
| `platform` | conditional — `!== undefined` | caller-supplied |

🔴 **Three fields are written on every request; five only when sent. `truck_id` is in the first
group and `van_id` is in the second — and they are the two fields that must agree.** The upsert at
`:87` is `onConflict: 'device_id'`, so on an existing row every unlisted column survives untouched.
That is what carries the previous truck's `van_id` across a truck reassignment.

## 2. The cross-truck van validation, and which branch it sits on

`app/api/native/bind-device/route.ts:68-73`:

```ts
  // SECURITY GATE: van must belong to THIS truck. Reject a cross-truck van_id outright.
  if (van_id) {
    const { data: van } = await supabaseAdmin
      .from('truck_vans').select('id').eq('id', van_id).eq('truck_id', truck.id).eq('active', true).single()
    if (!van) return NextResponse.json({ error: 'van not found for this truck' }, { status: 404 })
  }
```

**It sits on `if (van_id)` — a truthiness test on the INCOMING value only.**

Precisely:

- It runs **only** when the request body carries a truthy `van_id`.
- A body with **no `van_id` key** — which is what `{push_token}`, `{notify_enabled}` and
  `{default_screen}` patches produce — makes `van_id` `undefined`, so the branch is **skipped
  entirely**. The gate is not wrong; it is never reached.
- Note the asymmetry with the write two lines later: the **gate** tests truthiness
  (`if (van_id)`), the **write** tests presence (`van_id !== undefined`). `null` therefore skips
  the gate but *is* written — unvalidated, though harmless.
- 🔴 It compares the **incoming** `van_id` to the **incoming** token's truck. **It never reads the
  existing row.** Nothing in the pre-fix handler compared the new `truck_id` against the `van_id`
  already stored.

**Confirmation that the gate itself is sound: case D in §5 executes a cross-truck `van_id` against
the new truck's token and returns 404, identically before and after the change.** The observed
production row cannot have come through this branch.

## 3. `switch-truck` — does the same defect exist?

**No. Reported, not fixed, as instructed.**

`app/api/native/switch-truck/route.ts:32-49`:

```ts
  // Resolve the van: explicit (must belong to the target truck) or the sole/first active van of the target.
  let resolvedVanId: string | null = null
  if (van_id) {
    const { data: van } = await supabaseAdmin.from('truck_vans').select('id').eq('id', van_id).eq('truck_id', target_truck_id).eq('active', true).single()
    if (!van) return NextResponse.json({ error: 'van not found for target truck' }, { status: 404 })
    resolvedVanId = van.id
  } else {
    const { data: vans } = await supabaseAdmin.from('truck_vans').select('id').eq('truck_id', target_truck_id).eq('active', true).order('created_at', { ascending: true })
    resolvedVanId = vans && vans.length ? vans[0].id : null
  }

  // UPDATE the existing row (never insert a 2nd) — upsert on device_id, patching ONLY truck/van so
  // push_token/default_screen/notify_enabled carry over. last_seen refreshed.
  const { data: updated, error } = await supabaseAdmin
    .from('van_devices')
    .upsert({ device_id, truck_id: target_truck_id, van_id: resolvedVanId, last_seen: new Date().toISOString() }, { onConflict: 'device_id' })
    .select('device_id')
    .single()
```

**Why the class of defect cannot arise here:** the upsert object is a **literal with `van_id`
always present**. Both branches assign `resolvedVanId` before the write — the explicit branch from
a truck-scoped lookup, the fallback branch from the target truck's own van list. **There is no
path through this route that moves `truck_id` without also writing `van_id`.** `truck_id` and
`van_id` are, in this route, a single atomic decision.

Two observations recorded without action, neither an instance of this defect:

- ⚠️ A target truck with **zero active vans** yields `resolvedVanId = null` and writes
  `van_id = NULL`. Consistent with the new `truck_id`, not cross-truck.
- ⚠️ It is an **upsert**, not an update, despite the comment at `:43` reading *"UPDATE the existing
  row (never insert a 2nd)"*. An unknown `device_id` **inserts** rather than failing. The comment
  is about not creating a *second* row for one device, which `onConflict: 'device_id'` does
  guarantee — but a first row for an unrecognised device is created silently.

Also unlike `bind-device`, `truck_id` here is **caller-supplied** (`target_truck_id`) and gated by
a membership check at `:29-30`, rather than derived from a token. Different shape, and one that
does not admit a partial write.

## 4. Every caller of `saveDeviceConfig`, and the patch shape each sends

`saveDeviceConfig` is defined at `lib/native/device.ts:61-75`; the body shape is fixed at `:66-70`:

```ts
    const res = await fetch('/api/native/bind-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
    })
```

🔴 `...patch` is a spread — **a patch with no `van_id` key produces JSON with no `van_id` key.**
`JSON.stringify` also drops keys whose value is `undefined`, so the server cannot distinguish
"omitted" from "explicitly undefined".

| # | Call site | Patch shape | Carries `van_id`? |
|---|---|---|---|
| 1 | `components/native/OperatorDeviceConfig.tsx:71` | `{ van_id: vanList[0].id, default_screen: … }` | ✅ yes — silent single-van auto-bind |
| 2 | `components/native/OperatorDeviceConfig.tsx:99` | `{ van_id: vanId, default_screen: screen }` | ✅ yes — the multi-van picker's Continue |
| 3 | `components/native/OperatorDeviceConfig.tsx:208` | `p` — forwarded from `patch(…)` | **depends, see below** |
| 4 | `components/native/VanMenuChooser.tsx:55` | `{ van_id: nextVanId }` | ✅ yes — profile-menu van switch |
| 5 | `lib/native/push.ts:145` | `{ push_token: t.value }` | 🔴 **no** |

Call site 3 is a pass-through. Its three callers, `OperatorDeviceConfig.tsx:251`, `:261`, `:270`:

| Control | Patch | Carries `van_id`? |
|---|---|---|
| Van `<select>` (`:251`) | `{ van_id: e.target.value }` | ✅ yes |
| Default-screen `<select>` (`:261`) | `{ default_screen: … }` | 🔴 **no** |
| Order-notifications checkbox (`:270`) | `{ notify_enabled: e.target.checked }` | 🔴 **no** |

**And one writer that does not go through `saveDeviceConfig` at all** —
`components/native/NotificationSettings.tsx:59`:

```ts
    try { await fetch('/api/native/bind-device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, device_id: getDeviceId(), notify_enabled: v }) }) } catch { /* offline / transient — retries on next toggle */ }
```

🔴 **no `van_id`** — and no `platform` either.

**Four distinct request shapes reach the route with no `van_id`:** `{push_token}` (push.ts),
`{default_screen}` and `{notify_enabled}` (ThisDeviceSettings), and `{notify_enabled}` again via
the raw fetch. Each is exercised in §5 as case B, B3, B2.

---

# PHASE 2 — THE FIX

## 5. Execution proof

**Harness:** `ts.transpileModule` compiles the **real, unmodified-on-disk** `route.ts` to CommonJS;
the module is evaluated in a `vm` context whose `require` returns stubs for `next/server`
(a `NextResponse.json` that records status + body), `@supabase/supabase-js` (a PostgREST-shaped
fake over an in-memory database), and `@/lib/supabase/server` (unused by POST). The exported
`POST` is then **called** with `{ json: async () => body }`. The database is rebuilt per case.

The **BEFORE** column is produced by the same harness with one in-memory source transform that
collapses the new `else` branch back to the single line it replaced. **The file on disk is not
modified to produce it**, and if the guard cannot be located the harness throws rather than
silently reporting a false baseline.

Fixture: `test-truck` owns van `8e38901e-113f-42fc-ac60-11cf1360212b`; `real-thai-food` owns van
`d9265182-66eb-4395-8469-7d795885cfe8`. Both vans are named "Van1", exactly as in production.

### Results — verbatim from the run

```
================================================================================================================
BEFORE — guard reverted in memory (the file on disk is NOT modified)
================================================================================================================
case                                          status  truck_id          van_id                                  patch.van_id                            result
A  same truck, NO van_id                      200     test-truck        8e38901e-113f-42fc-ac60-11cf1360212b    (key absent)                            PASS
B  DIFFERENT truck, NO van_id                 200     real-thai-food    8e38901e-113f-42fc-ac60-11cf1360212b    (key absent)                            FAIL  want {"status":200,"truck_id":"real-thai-food","van_id":null}
B2 DIFFERENT truck, NO van_id (notify_enabled only)200     real-thai-food    8e38901e-113f-42fc-ac60-11cf1360212b    (key absent)                            FAIL  want {"status":200,"truck_id":"real-thai-food","van_id":null}
B3 DIFFERENT truck, NO van_id (default_screen only)200     real-thai-food    8e38901e-113f-42fc-ac60-11cf1360212b    (key absent)                            FAIL  want {"status":200,"truck_id":"real-thai-food","van_id":null}
C  DIFFERENT truck, valid van_id for the NEW truck200     real-thai-food    d9265182-66eb-4395-8469-7d795885cfe8    d9265182-66eb-4395-8469-7d795885cfe8    PASS
D  DIFFERENT truck, van_id belonging to ANOTHER truck404     test-truck        8e38901e-113f-42fc-ac60-11cf1360212b    (no upsert)                             PASS
E  FIRST-EVER bind, no row exists, with van_id200     real-thai-food    d9265182-66eb-4395-8469-7d795885cfe8    d9265182-66eb-4395-8469-7d795885cfe8    PASS
E2 FIRST-EVER bind, no row exists, NO van_id  200     real-thai-food    null                                    (key absent)                            PASS

  5/8 pass

================================================================================================================
AFTER  — the route source as it now stands on disk
================================================================================================================
case                                          status  truck_id          van_id                                  patch.van_id                            result
A  same truck, NO van_id                      200     test-truck        8e38901e-113f-42fc-ac60-11cf1360212b    (key absent)                            PASS
B  DIFFERENT truck, NO van_id                 200     real-thai-food    null                                    null                                    PASS
B2 DIFFERENT truck, NO van_id (notify_enabled only)200     real-thai-food    null                                    null                                    PASS
B3 DIFFERENT truck, NO van_id (default_screen only)200     real-thai-food    null                                    null                                    PASS
C  DIFFERENT truck, valid van_id for the NEW truck200     real-thai-food    d9265182-66eb-4395-8469-7d795885cfe8    d9265182-66eb-4395-8469-7d795885cfe8    PASS
D  DIFFERENT truck, van_id belonging to ANOTHER truck404     test-truck        8e38901e-113f-42fc-ac60-11cf1360212b    (no upsert)                             PASS
E  FIRST-EVER bind, no row exists, with van_id200     real-thai-food    d9265182-66eb-4395-8469-7d795885cfe8    d9265182-66eb-4395-8469-7d795885cfe8    PASS
E2 FIRST-EVER bind, no row exists, NO van_id  200     real-thai-food    null                                    (key absent)                            PASS

  8/8 pass

================================================================================================================
DELTA
================================================================================================================
A  same truck, NO van_id                       before={"status":200,"truck_id":"test-truck","van_id":"8e38901e-113f-42fc-ac60-11cf1360212b"} identical
B  DIFFERENT truck, NO van_id                  before={"status":200,"truck_id":"real-thai-food","van_id":"8e38901e-113f-42fc-ac60-11cf1360212b"} CHANGED
B2 DIFFERENT truck, NO van_id (notify_enabled only) before={"status":200,"truck_id":"real-thai-food","van_id":"8e38901e-113f-42fc-ac60-11cf1360212b"} CHANGED
B3 DIFFERENT truck, NO van_id (default_screen only) before={"status":200,"truck_id":"real-thai-food","van_id":"8e38901e-113f-42fc-ac60-11cf1360212b"} CHANGED
C  DIFFERENT truck, valid van_id for the NEW truck before={"status":200,"truck_id":"real-thai-food","van_id":"d9265182-66eb-4395-8469-7d795885cfe8"} identical
D  DIFFERENT truck, van_id belonging to ANOTHER truck before={"status":404,"truck_id":"test-truck","van_id":"8e38901e-113f-42fc-ac60-11cf1360212b"} identical
E  FIRST-EVER bind, no row exists, with van_id before={"status":200,"truck_id":"real-thai-food","van_id":"d9265182-66eb-4395-8469-7d795885cfe8"} identical
E2 FIRST-EVER bind, no row exists, NO van_id   before={"status":200,"truck_id":"real-thai-food","van_id":null}                 identical

EXIT: all AFTER cases pass
```

### Read against the required table

| Required case | Requirement | Before | After | Verdict |
|---|---|---|---|---|
| **same truck, no `van_id`** (A) | `van_id` **preserved** | `8e38901e…` | `8e38901e…` | ✅ preserved, and **unchanged by the fix** |
| **different truck, no `van_id`** (B, B2, B3) | `van_id` **becomes null** | 🔴 `8e38901e…` carried over — **the production row reproduced exactly** | `null` | ✅ fixed |
| **different truck, valid `van_id` for the new truck** (C) | **accepted** | accepted | accepted | ✅ **unchanged by the fix** |
| **different truck, `van_id` of another truck** (D) | **still 404** | 404, row untouched | 404, row untouched | ✅ **unchanged by the fix** |
| **first-ever bind, no row** (E, E2) | must work | works | works | ✅ **unchanged by the fix** |

**Three cases changed. Five are byte-identical.** The three that changed are precisely the three
partial-patch shapes §4 identified as reaching the route with no `van_id`. **Case B before the fix
is the production row**: `truck_id 'real-thai-food'`, `van_id 8e38901e…`, HTTP 200.

⚠️ **B2 is the `NotificationSettings.tsx:59` shape and carries no `platform` either** — it is
included because that writer bypasses `saveDeviceConfig` and would otherwise be untested.
⚠️ **E2 is the branch that distinguishes "no row" from "same truck"**: with no existing row the
`van_id` key is left **off the patch entirely** (`(key absent)`), so the INSERT takes the column
default rather than an explicit `null`. That distinction is visible in the `patch.van_id` column
and is why it is printed.

## 6. The change

One file. One `if`/`else`. The existing 404 validation is not touched, `switch-truck` is not
touched, `lib/native/push.ts` is not touched, no migration was written.

```diff
--- a/app/api/native/bind-device/route.ts
+++ b/app/api/native/bind-device/route.ts
@@ -77,7 +77,34 @@ export async function POST(req: NextRequest) {
 
   // Upsert by device_id (unique). Only patch provided fields; always refresh truck_id + last_seen.
   const patch: Record<string, unknown> = { truck_id: truck.id, device_id, last_seen: new Date().toISOString() }
-  if (van_id !== undefined) patch.van_id = van_id
+  if (van_id !== undefined) {
+    patch.van_id = van_id
+  } else {
+    // ── 🔴 IF truck_id CHANGES, van_id MUST BE REVALIDATED OR CLEARED. ──────────────────────────────
+    // The two fields on this row arrive by DIFFERENT ROUTES and were previously reconciled by neither.
+    // `truck_id` is DERIVED FROM THE CALLER'S IDENTITY (the token, line 79) and is therefore rewritten on
+    // EVERY write, including a partial one. `van_id` is SUPPLIED BY THE CALLER and is therefore validated
+    // only when present — the cross-truck gate above sits on `if (van_id)`, so a patch that omits it never
+    // enters that gate at all. A derived field that always moves and a supplied field that is only ever
+    // checked when sent cannot be left to independent branches: a partial patch of {push_token},
+    // {notify_enabled} or {default_screen} bearing a DIFFERENT truck's token used to reassign the row to
+    // that truck while leaving the PREVIOUS truck's van_id in place, return 200, and touch no validation
+    // on the way past. (Observed: device c6b24668… on 'real-thai-food' holding 'test-truck''s van.)
+    // There is no composite FK or CHECK relating the two columns — 20260701_van_devices.sql declares two
+    // INDEPENDENT single-column foreign keys — so the reconciliation has to be explicit, and here.
+    // ⚠️ CLEAR, DO NOT CARRY OVER. We have no van to substitute: the caller sent none, and picking one for
+    // them would be inventing a binding they did not ask for. NULL is the honest state — the device is on
+    // the new truck and not yet bound to any of its vans, which is exactly what DeviceSetupGate's
+    // `device && device.van_id` test reads as "needs setup".
+    // ⚠️ NOT SCOPED BY truck_id, deliberately: this read must see the row AS IT STANDS, under whichever
+    // truck currently owns it. The GET above is truck-scoped (line 49) and therefore CANNOT see a
+    // cross-truck row — which is what let the picker present a clean slate over a stale binding.
+    // A missing row (first-ever bind) leaves van_id off the patch entirely, so the INSERT takes the
+    // column default rather than an explicit null.
+    const { data: existing } = await supabaseAdmin
+      .from('van_devices').select('truck_id').eq('device_id', device_id).maybeSingle()
+    if (existing && existing.truck_id !== truck.id) patch.van_id = null
+  }
   if (default_screen !== undefined) patch.default_screen = default_screen
   if (notify_enabled !== undefined) patch.notify_enabled = !!notify_enabled
   if (push_token !== undefined) patch.push_token = push_token
```

### Design notes

- **The `if (van_id)` gate is untouched.** The new code lives entirely in the `else` of
  `van_id !== undefined`, so any request carrying a `van_id` takes exactly the path it took before —
  proven by cases C, D and E coming back identical.
- **The read is deliberately NOT truck-scoped.** It must see the row under whichever truck
  currently owns it; the GET at `:49` *is* truck-scoped and therefore cannot.
- **`maybeSingle()`, not `single()`.** A first-ever bind has no row and must not be an error;
  `existing` is `null`, the condition short-circuits, and `van_id` stays off the patch (case E2).
- **One extra round-trip, only on the partial-patch path.** Requests that carry a `van_id` add no
  query.

---

## What remains unobserved

1. **No typecheck.** `tsc --noEmit` was not run; `next build` was not run. Correctness here is
   behavioural, established by execution, not by the compiler.
2. **No real database.** The proof runs against an in-memory PostgREST-shaped fake modelling only
   the chains this route uses. Real PostgREST/Postgres semantics — FK enforcement, upsert
   behaviour under concurrency, RLS — were not exercised.
3. **Nothing was deployed and no live row was read or written.** The production fixture
   `c6b24668-9aa7-4687-9464-d7a2f1c0c2be` is untouched and will **not** self-heal: the fix prevents
   new occurrences and will clear that row's `van_id` the next time a partial patch bearing a
   different truck's token reaches it, but it performs no backfill.
4. **A race remains, unaddressed and out of scope.** The existence check and the upsert are two
   separate statements, not one atomic write. Two concurrent partial patches bearing different
   trucks' tokens could interleave. This is not the reported defect and no instruction covered it.
5. **`switch-truck` was read but not executed**, per the instruction not to alter it. §3's
   conclusion is from source.
6. **`lib/native/push.ts`'s stale-closure lifecycle is untouched**, per instruction — it remains
   the mechanism most likely to *deliver* a different truck's token to this route, and it is a
   separate item.
