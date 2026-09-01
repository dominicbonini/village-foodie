# Cross-truck van binding — how `van_devices` came to hold another truck's van

**READ AND REPORT ONLY.** Nothing was changed. No fix, no migration, no correction of the bad
row, no deletion. Nothing belonging to `pizzeria-gusto` or `tikka-tonic` was touched.

**Prompt integrity:** no span of the instructing prompt arrived garbled, and no instruction
contradicted another. Nothing required stopping to ask.

## What verification I performed — plainly

**None of the three.** I did **not** parse, I did **not** typecheck, and I did **not** execute
anything. This report is file reads and greps only. No route was invoked, no database was queried,
nothing was rendered. Every claim below is read from source in the working tree, or explicitly
marked as inference.

## The finding, stated once

**The route's cross-truck validation is correct and would have rejected the van id in question.
It was never asked to. The row was written by a POST that carried NO `van_id` at all.**

`POST /api/native/bind-device` **always** overwrites `truck_id` from the token, but only writes
`van_id` when the caller supplies one — and only validates `van_id` when the caller supplies one.
A patch of `{ push_token }` or `{ notify_enabled }` or `{ default_screen }` therefore **moves the
row to a new truck while leaving the old truck's van id in place**, returns 200, and touches no
validation on the way past.

**Both halves of your question: the route is broken, not the data.** The row is a faithful record
of what the route did.

---

## 1. The cross-truck van validation, quoted in full

`app/api/native/bind-device/route.ts:68-73` — the entire validation, nothing omitted:

```ts
  // SECURITY GATE: van must belong to THIS truck. Reject a cross-truck van_id outright.
  if (van_id) {
    const { data: van } = await supabaseAdmin
      .from('truck_vans').select('id').eq('id', van_id).eq('truck_id', truck.id).eq('active', true).single()
    if (!van) return NextResponse.json({ error: 'van not found for this truck' }, { status: 404 })
  }
```

And the write it guards, `app/api/native/bind-device/route.ts:78-89`:

```ts
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
```

### What it compares

Three equality predicates against `truck_vans`, ANDed:

| Predicate | Compares |
|---|---|
| `.eq('id', van_id)` | the supplied van id |
| `.eq('truck_id', truck.id)` | **the van's owning truck against the truck resolved from the token** |
| `.eq('active', true)` | the van is not soft-deleted |

`.single()` yields `data: null` when the conjunction matches no row, and `!van` returns the 404.

🔴 **Note precisely what the comparison is NOT.** It compares the *incoming* `van_id` to the
*incoming* token's truck. **It never reads the existing `van_devices` row.** There is no
comparison of the new `truck_id` against the van id already stored, in this route or anywhere else.
The gate protects the value being written; nothing protects the value being left behind.

### Every input for which it does NOT reject

The gate is `if (van_id)` — a **truthiness** test. The write is `if (van_id !== undefined)` — a
**presence** test. The two tests are different, and the gap between them is the defect.

| Input for `van_id` | Gate `if (van_id)` | Written? (`!== undefined`) | Result |
|---|---|---|---|
| **key absent from body** | **skipped** (undefined is falsy) | **no** | 🔴 **`truck_id` overwritten, `van_id` left untouched — this is the observed row** |
| `undefined` passed explicitly | **skipped** | **no** | identical to absent — `JSON.stringify` drops undefined-valued keys, so the server cannot tell these apart |
| `null` | **skipped** | **yes** (`null !== undefined`) | `van_id` set to NULL. Unvalidated, but not cross-truck |
| `''` (empty string) | **skipped** | **yes** | `''` sent for a `uuid` column |
| `0` / `false` | **skipped** | **yes** | non-uuid sent for a `uuid` column |
| **a van belonging to another truck** | **RUNS** | — | **REJECTED, 404** |
| a van of this truck with `active = false` | **RUNS** | — | **REJECTED, 404** |
| a valid active van of this truck | **RUNS** | **yes** | accepted, written |

**INFERRED** for the `''` / `0` / `false` rows: PostgreSQL rejects a non-uuid literal for a `uuid`
column, so `error` is set and the route returns 400 at `:88`. I did not execute this; it is
inference from the column type at `20260701_van_devices.sql:13` plus the error branch at `:88`.

**🔴 The row you found could NOT have been produced by a POST that carried
`8e38901e-113f-42fc-ac60-11cf1360212b` together with `real-thai-food`'s token.** That input is on
the "REJECTED, 404" row of the table above: the van exists, it is presumably active, and its
`truck_id` is `'test-truck'`, so `.eq('truck_id', 'real-thai-food')` matches nothing and the route
returns 404 before reaching the upsert. **The 200 you observed is only consistent with a request
whose body had no `van_id` key.**

### Which callers send no `van_id` — all of them, quoted

There are exactly **five** call sites that write to this route. Three of them omit `van_id`.

**(a) `lib/native/push.ts:144-146` — the FCM/APNs token listener:**

```ts
          PushNotifications.addListener('registration', (t: { value: string }) => {
            void saveDeviceConfig(token, { push_token: t.value })
          }),
```

**(b) `components/native/NotificationSettings.tsx:59` — a raw fetch, bypassing `saveDeviceConfig`:**

```ts
    try { await fetch('/api/native/bind-device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, device_id: getDeviceId(), notify_enabled: v }) }) } catch { /* offline / transient — retries on next toggle */ }
```

⚠️ This one omits `platform` as well as `van_id`.

**(c) `components/native/OperatorDeviceConfig.tsx:207-210` — the "This device" settings patcher:**

```ts
  const patch = async (p: Parameters<typeof saveDeviceConfig>[1]) => {
    const saved = await saveDeviceConfig(token, p)
    if (saved) setCfg(saved)
  }
```

  Its callers pass `{ default_screen: … }` (`:261`) and `{ notify_enabled: … }` (`:270`) —
  neither carries `van_id`. (`:251` does pass `van_id`.)

The two that DO send `van_id` — `OperatorDeviceConfig.tsx:71` and `:99`, and
`VanMenuChooser.tsx:55` — are the only ones the gate ever sees.

The body shape is fixed at `lib/native/device.ts:66-70`:

```ts
    const res = await fetch('/api/native/bind-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
    })
```

`...patch` — so if the patch has no `van_id` key, the JSON has no `van_id` key.

---

## 2. How the route resolves `token` to a truck

`app/api/native/bind-device/route.ts:17-22`, quoted complete:

```ts
async function truckFromToken(token: string | null) {
  if (!token) return null
  const { data } = await supabaseAdmin
    .from('trucks').select('id, name').eq('dashboard_token', token).eq('active', true).single()
  return data
}
```

Called at `:64`, with the 401 at `:65`:

```ts
  const truck = await truckFromToken(token ?? null)
  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
```

### Could a token resolve to a DIFFERENT truck than the one whose van list the client showed?

**Not by mis-resolution. Yes by staleness — and that is the mechanism.**

**Mis-resolution: no.** — **READ.** The lookup is a single exact-equality match on
`dashboard_token`, with no `ilike`, no `like`, no `.or(...)`, no prefix match and no name
comparison. `.single()` yields `data: null` on both zero rows and multiple rows, and the
destructure `const { data } = …` discards the error entirely — so **any** ambiguity produces a
**401**, never a wrong truck. A duplicate `dashboard_token` would lock the route out, not
mis-route it.

⚠️ **CANNOT DETERMINE** whether `trucks.dashboard_token` carries a UNIQUE constraint. The `trucks`
table has no CREATE TABLE in `supabase/migrations/` (grep for `dashboard_token` across
`supabase/migrations/*.sql` returns **zero hits**; the earliest migration present is
`20260518_production_slot_usage.sql`). It does not matter for this finding — per the paragraph
above, duplication fails closed.

**No fuzzy matching anywhere.** — **INFERRED from absence**, and I checked this specifically
because of the "thai" observation. Searches:
- `.eq('name')` / `ilike` / `.or(` / `match(` within 3 lines of any `truck_vans` query, over
  `app/` and `lib/`: **zero hits. Nothing in this codebase selects a van by name.**
- `ilike` / `.like(` / `textSearch` / `.or(` within 4 lines of any `from('trucks')` query, over
  `app/` and `lib/`: two hits, **neither on `trucks`** —
  `app/api/webhooks/meta/whatsapp/route.ts:216` (`whatsapp_sender.eq.` variants) and
  `app/api/cron/demo-cleanup/route.ts:164` (`.like('id', 'demo-%')`).

**That the two vans are both named "Van1" and both trucks contain "thai" is a coincidence of the
data, not a cause.** No code path in this repository resolves either entity by name or by
substring.

**Staleness: yes, and it is the answer.** The divergence is not within one request — it is across
time. `saveDeviceConfig(token, …)` uses whatever `token` its caller holds, and
`lib/native/push.ts:144-146` holds a token **captured in a module-level listener closure that
survives unmount and truck switch**. See §6, sequence A.

---

## 3. Where the client gets the van list it renders

### The GET handler

`app/api/native/bind-device/route.ts:40-56`, quoted complete:

```ts
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const deviceId = url.searchParams.get('device_id')
  const truck = await truckFromToken(token)
  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const [{ data: device }, { data: vans }, vanHint] = await Promise.all([
    deviceId
      ? supabaseAdmin.from('van_devices').select('*').eq('device_id', deviceId).eq('truck_id', truck.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('truck_vans').select('id, name').eq('truck_id', truck.id).eq('active', true),
    singleVanStaffHint(truck.id),
  ])
  // truck = the CURRENT bound truck (from the token) — for the "You're viewing: <truck> — <van>" display.
  return NextResponse.json({ device: device ?? null, vans: vans ?? [], vanHint, truck: { id: truck.id, name: (truck as any).name ?? null } })
}
```

**The van list is scoped to `truck.id`, resolved from the token, via
`.eq('truck_id', truck.id).eq('active', true)` at `:51`.** It is correct, and it is the same
`truck.id` the POST's gate compares against.

🔴 **Note the device read at `:49`: it is ALSO scoped `.eq('truck_id', truck.id)`.** A row whose
`truck_id` points elsewhere comes back as `device: null` — **the GET cannot see the cross-truck
row it is about to be asked to overwrite.** This is what lets the picker present a clean
"unconfigured device" state over a row that is already bound to another truck's van.

### The client

`components/native/OperatorDeviceConfig.tsx:56-81` — `runSetup`, quoted complete:

```ts
  const runSetup = useCallback(async () => {
    if (!isNativeApp()) { setLoading(false); return }
    setFetchError(false); setLoading(true)
    const result = await fetchDeviceConfig(token)
    if (!mounted.current) return
    // FETCH FAILED (null/network/non-OK) — do NOT show "no active van"; offer Retry. This is where a transient
    // 429/500 used to masquerade as "no van" and trap the operator.
    if (!result.ok) { setFetchError(true); setLoading(false); return }
    const device = result.device
    const vanList = result.vans
    // Already configured (row exists WITH a van) → apply side effects, no card.
    if (device && device.van_id) { void registerForPush(token, onOpenOrderRef.current); setLoading(false); return }
    // Single active van → auto-bind SILENTLY (no van question; screen defaults to 'dashboard', changeable in
    // This-device settings). Per spec: single van = no modal.
    if (vanList.length === 1) {
      const saved = await saveDeviceConfig(token, { van_id: vanList[0].id, default_screen: device?.default_screen ?? 'dashboard' })
      if (!mounted.current) return
      if (saved) void registerForPush(token, onOpenOrderRef.current)
      setLoading(false); return
    }
    // Genuinely 0 (fetch OK, no active vans) OR >1 → show the card. Pre-fill van from the single-van staff hint.
    setVans(vanList)
    setVanId(result.vanHint ?? '')
    setScreen(device?.default_screen ?? 'dashboard')
    setNeedsSetup(true)
    setLoading(false)
```

The rendered `<select>`, `:151-158`:

```jsx
            <div>
              <p className="text-sm font-bold text-slate-800 mb-1.5">Which van is this device?</p>
              <select value={vanId} onChange={e => setVanId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Select a van…</option>
                {vans.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
```

and the save, `:97-102`:

```ts
  const onSave = async () => {
    setSaving(true)
    const saved = await saveDeviceConfig(token, { van_id: vanId, default_screen: screen })
    setSaving(false)
    if (saved) { void registerForPush(token, onOpenOrderRef.current); setNeedsSetup(false) }
  }
```

The client's `token` is a prop; the same value feeds the GET and the POST. **The picker cannot
offer a van from the wrong truck** — `vans` comes straight from the truck-scoped GET, and every
option's value is one of those ids. `VanMenuChooser.tsx:22-32, 52-59` is the same shape.

🔴 **The picker also mounts on ONE route only.** `<DeviceSetupGate>` appears exactly once:
`app/dashboard/[token]/page.tsx:2975`. It is **not** mounted on the KDS, on `/app`, or anywhere
else. `<ThisDeviceSettings>` — which contains the no-`van_id` writers at `:261` and `:270` — mounts
in **two** places: `components/dashboard/UserMenu.tsx:311` (dashboard) and
`app/dashboard/[token]/kds/page.tsx:3121` (KDS). **On the KDS, the settings that write without a
`van_id` are reachable while the gate that would have rebound the van never runs.**

---

## 4. Is `van_id` validated on the other writer?

**Yes — `switch-truck` is correct, and it cannot produce this row.**

`app/api/native/switch-truck/route.ts:32-49`, quoted complete:

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
```

🔴 **The structural difference from `bind-device`, and it is the whole difference:** `van_id` is
**always** present in this upsert. Both branches assign `resolvedVanId` before the write — the
explicit branch from a truck-scoped lookup, the fallback branch from the target truck's own van
list. `truck_id` and `van_id` therefore move together, always. There is no path through this route
that changes one without the other.

⚠️ Its only lax case is benign: a target truck with zero active vans yields `resolvedVanId = null`
and writes `van_id = NULL` — consistent, not cross-truck.

⚠️ The file header at `:4-5` claims *"the device can never appear under two trucks (no cross-truck
notification leak)"*. **That claim is about two ROWS and it holds** — `device_id` is UNIQUE. It
does not, and was never meant to, prevent one row pointing at another truck's van.

### The two other `van_devices` touch points

- `app/api/native/my-trucks/route.ts:93` — read only, `.maybeSingle()`.
- `app/api/orders/submit/route.ts:1305` — `update({ push_token: null }).in('push_token', invalidTokens)`.
  Touches `push_token` only.

That is the complete set. `grep -rn "from('van_devices')"` over `*.ts`/`*.tsx` returns six hits
(`bind-device` ×2, `switch-truck`, `my-trucks`, `orders/submit` ×2) and no others.

### 🔴 Why this row is not merely untidy

`app/api/orders/submit/route.ts:1272-1273` — the push send path:

```ts
                    const { data: devices } = await supabase
                      .from('van_devices').select('device_id, push_token, platform').eq('van_id', vanId).eq('notify_enabled', true).not('push_token', 'is', null)
```

**Targets on `van_id` alone. There is no `truck_id` predicate.** So an order placed against
`test-truck`'s van `8e38901e…` selects this device — which is now bound to `real-thai-food` — and
sends it that order's push. Reported as read, not evaluated.

---

## 5. Would any database constraint have prevented it?

**No. Nothing in the schema relates `van_devices.truck_id` to `van_devices.van_id`.**

`supabase/migrations/20260701_van_devices.sql:10-25`, quoted complete:

```sql
CREATE TABLE IF NOT EXISTS van_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id       text NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,   -- trucks.id is TEXT (not uuid) — FK must match
  van_id         uuid REFERENCES truck_vans(id) ON DELETE SET NULL,        -- truck_vans.id IS uuid — correct as-is
  device_id      text NOT NULL UNIQUE,               -- stable client UUID (localStorage, first launch); re-bind = UPDATE
  push_token     text,                                -- APNs device token; NULL until push permission granted
  platform       text,                                -- 'ios' | 'web' | …
  default_screen text NOT NULL DEFAULT 'dashboard' CHECK (default_screen IN ('dashboard','kds')),
  notify_enabled boolean NOT NULL DEFAULT true,       -- device-level opt-out (van-level master lives in van_notification_prefs)
  last_seen      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Push send path resolves van → devices; look-ups also by truck.
CREATE INDEX IF NOT EXISTS van_devices_van_idx   ON van_devices (van_id);
CREATE INDEX IF NOT EXISTS van_devices_truck_idx ON van_devices (truck_id);
```

- `truck_id` → `trucks(id)`: **single-column FK.** Guarantees the truck exists. Says nothing about the van.
- `van_id` → `truck_vans(id)`: **single-column FK.** Guarantees the van exists. Says nothing about the truck.
- The only `CHECK` is on `default_screen`.
- The only `UNIQUE` is on `device_id`.
- **No composite foreign key** to `truck_vans(id, truck_id)`, **no CHECK** relating the two, **no
  trigger.**

**The two columns are independently valid and jointly unconstrained. The observed row satisfies
both FKs.**

**INFERRED from absence** for the negative, with the search named: `grep -rniE "van_devices"` over
`supabase/migrations/*.sql` filtered to lines containing
`check|trigger|constraint|unique|foreign key|references` returns **four** hits, all four in
`20260728_device_notification_prefs.sql` and all four about a *different* table's FK **to**
`van_devices(device_id)`. A separate search for `create (or replace) trigger|function` mentioning
"van" over the same path returns **zero hits**. Five migration files mention `van_devices` in
total; the other three concern `notify_enabled` retirement and a notification-prefs backfill.

⚠️ **CANNOT DETERMINE** whether a constraint or trigger exists in the live database that is not
represented in `supabase/migrations/`. That would require inspecting the deployed schema, which I
did not do. What is READ is that this repository defines none.

---

## 6. The sequences that could produce this row

**At least four can, and they share one root cause.** The shared prerequisite is:

> the `van_devices` row already holds `van_id = 8e38901e…` (test-truck's Van1) — written legitimately,
> validated at the time — and a later POST arrives bearing **`real-thai-food`'s `dashboard_token`
> and no `van_id` key**.

At that point `bind-device` skips the gate (`if (van_id)` is false), skips the write
(`van_id !== undefined` is false), sets `truck_id = 'real-thai-food'` unconditionally at `:79`,
upserts on `device_id`, and returns 200. The van id is simply never looked at.

### Sequence A — the stale push-token listener. **The strongest candidate: needs no operator action at all.**

`lib/native/push.ts` attaches the FCM/APNs `registration` listener exactly once per app process,
behind a module-level single-flight latch — `:39`:

```ts
let attachPromise: Promise<void> | null = null
```

`:140-146`:

```ts
    if (!attachPromise) {
      attachPromise = (async () => {
        const handles = await Promise.all([
          // FCM/APNs token → persist to this device's row so the server push path can target it.
          PushNotifications.addListener('registration', (t: { value: string }) => {
            void saveDeviceConfig(token, { push_token: t.value })
          }),
```

🔴 **`token` here is the parameter of `registerForPush`, captured in the closure at first attach
and never refreshed.** `currentOnOpenOrder` was deliberately hoisted to module state so the *tap
handler* stays current (`:95`, `:152-153`) — **the token was not given the same treatment.**

And the teardown does not help. `lib/native/push.ts:79-85`:

```ts
export function releasePushHandlers(full = false): void {
  currentOnOpenOrder = undefined
  if (!full) return
  for (const h of attachedHandles) { try { h.remove() } catch { /* already gone */ } }
  attachedHandles = []
  attachPromise = null
}
```

The only caller passes no argument — `components/native/OperatorDeviceConfig.tsx:54`:

```ts
  useEffect(() => () => { releasePushHandlers() }, [])
```

`full` defaults to `false`, so it **returns at line 81**. The listener is not removed and
`attachPromise` is not cleared. **The captured token outlives the component, the truck switch, and
every subsequent `registerForPush` call.**

**The sequence:**

1. Device opens **`real-thai-food`**'s dashboard. `registerForPush(RTF_TOKEN, …)` attaches the
   listener, capturing `RTF_TOKEN`.
2. Device is later moved to **`test-truck`** — via `switch-truck`, or by signing in and landing on
   its dashboard. `DeviceSetupGate` binds it correctly: `truck_id = 'test-truck'`,
   `van_id = 8e38901e…`. ✅ valid at this point.
3. A later `registerForPush(TT_TOKEN, …)` runs. `attachPromise` is already set, so **the listener
   is not re-attached** — the `RTF_TOKEN` closure is still the live one. `:166` awaits the
   existing promise, `:198` calls `PushNotifications.register()`.
4. FCM fires `registration`. `:130-131` records that this is effectively immediate on any relaunch:
   *"FCM CACHES THE TOKEN, so on any relaunch register() resolves almost immediately and the event
   fires effectively synchronously."*
5. The stale listener runs `saveDeviceConfig(RTF_TOKEN, { push_token: t.value })` →
   **POST with `real-thai-food`'s token and no `van_id`.**
6. Route: 200. Row becomes `truck_id = 'real-thai-food'`, `van_id = 8e38901e…`.

**This is the observed row exactly, and step 5 requires nobody to touch the device.**

### Sequence B — the KDS "This device" panel, where the rebinding gate never runs

1. Row is `truck_id = 'test-truck'`, `van_id = 8e38901e…`. ✅ valid.
2. The operator opens **`real-thai-food`'s KDS** — `app/dashboard/[token]/kds/page.tsx`. 🔴 That
   route mounts `<ThisDeviceSettings>` (`:3121`) but **not** `<DeviceSetupGate>`, which exists only
   at `app/dashboard/[token]/page.tsx:2975`. Nothing re-binds the van.
3. `ThisDeviceSettings` mounts. Its effect (`:193-203`) only reads. The GET is truck-scoped
   (`:49`), so `cfg` is `null` and the panel renders defaults.
4. The operator changes **Default screen** (`:261`) or **Order notifications** (`:270`):

```jsx
        <select value={cfg?.default_screen ?? 'dashboard'} onChange={e => patch({ default_screen: e.target.value as 'dashboard' | 'kds' })}
…
        <input type="checkbox" checked={cfg?.notify_enabled ?? true} onChange={e => patch({ notify_enabled: e.target.checked })} />
```

5. `patch(…)` → `saveDeviceConfig(RTF_TOKEN, { default_screen })` → **no `van_id`.** 200. Row moves
   to `real-thai-food`, van stays `test-truck`'s.

### Sequence C — the notification toggle, via the raw fetch

Same as B, but through `components/native/NotificationSettings.tsx:59`, which does not go through
`saveDeviceConfig` at all and sends `{ token, device_id, notify_enabled }`. Any surface mounting
that component on `real-thai-food`'s token, over a row bound to `test-truck`'s van, produces the
row.

### Sequence D — the dashboard, when the gate declines to write

On `real-thai-food`'s **dashboard** the gate does run, but three of its branches write nothing —
`OperatorDeviceConfig.tsx:63`, `:121-132`, `:159-165`:

- `!result.ok` → Retry card, **no write**.
- `vanList.length === 0` (real-thai-food has no active van) → the "No active van" card, whose only
  actions are a link to Settings and "Later" — **it never calls `saveDeviceConfig`**.
- `vanList.length > 1` and the operator taps **"Later"** (`setDismissed(true)`) → **no write**.

In each case the stale row survives, and the next no-`van_id` POST from A, B or C lands on it.

⚠️ Note the branch that *would* have healed it: `vanList.length === 1` auto-binds at `:71` with
`van_id: vanList[0].id`, which would set `van_id = d9265182…` correctly. **So a single-van
`real-thai-food` visited via the dashboard self-corrects — until sequence A's stale listener fires
afterwards and moves it back.** `:73` calls `registerForPush` immediately after that very
auto-bind, which is precisely when step 4 of sequence A occurs.

### What CANNOT have produced it

- **A POST carrying the cross-truck `van_id`.** The gate rejects it with a 404 (§1). Ruled out
  by the 200 you observed.
- **`switch-truck`.** It always writes `truck_id` and `van_id` together, both resolved from the
  same `target_truck_id` (§4).
- **Name matching of any kind.** Nothing selects a van by name; nothing matches a truck by
  substring (§2). The shared "Van1" and shared "thai" are coincidence.
- **A van being moved between trucks.** `truck_vans` has exactly four writers — `add_van`
  (`app/api/manage/route.ts:1034-1038`, `insert({ truck_id: truck.id, … })`),
  `update_van_settings` (`:1011-1015`), `delete_van` (`:1056-1060`) and `rename_van`
  (`:1069-1073`). **All three updates are `.eq('id', vanId).eq('truck_id', truck.id)` and none of
  them writes `truck_id`.** No path reassigns a van's owner.
- **A truck's `id` changing under the row.** ⚠️ `app/api/admin/route.ts:93` is unallowlisted —
  `const { truckId, discoveryTruckId, ...updates } = body` then
  `.from('trucks').update(updates).eq('id', truckId)` — so an admin POST can write **any** column
  on `trucks`, `id` included. But `van_devices.truck_id` is
  `REFERENCES trucks(id) ON DELETE CASCADE` **with no `ON UPDATE CASCADE`**
  (`20260701_van_devices.sql:12`), so changing a referenced `trucks.id` is refused by the FK
  rather than silently rewriting children. **INFERRED** — PostgreSQL FK semantics, not executed.
  I record the unallowlisted admin update because it is a real hazard on its own terms, not
  because it explains this row.

### So: which half is broken

**The route.** Not the client, not the data, not the schema. The client sent a legitimate patch;
the schema permitted what it was told to store; the row is an accurate record. **`bind-device`'s
POST treats `truck_id` as unconditionally rewritable and `van_id` as optional, and validates only
the second — so the one field that binds the two tables together is the one field it never checks
against the row it is about to overwrite.**

---

## What remains unobserved

1. **Nothing was executed.** No parse, no typecheck, no run. No request was made to
   `/api/native/bind-device` or any other route.
2. **No database was queried.** I did not verify that `8e38901e…` is `active`, that
   `real-thai-food` has one van or several, or the row's `last_seen` / `created_at` — any of which
   would discriminate between sequences A, B, C and D. **`last_seen` and `push_token` are the two
   fields most likely to tell you which one it was**, and `last_seen` is written on every upsert
   (`route.ts:79`).
3. **The live schema was not inspected.** §5's conclusion is that *this repository* defines no
   relating constraint.
4. **No device was observed.** The stale-closure behaviour in §6 sequence A is read from source;
   I did not watch a `registration` event fire.
5. I did not attempt to determine which of the four sequences actually occurred. All four are
   consistent with a 200 and with the row as given.
