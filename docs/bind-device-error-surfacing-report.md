# Surfacing bind-device write failures

**Build only.** Nothing was committed, pushed or deployed. `lib/native/push.ts` is untouched (`git diff`
clean). `app/api/native/switch-truck/route.ts` is untouched (`git diff` clean). No telemetry was added to
any third-party service. No success path was changed. The cross-truck guard and the `truck_id`/`van_id`
reconciliation guard added earlier are untouched — the execution table below re-exercises both.

**Four files changed, and nothing else:**

```
 app/api/native/bind-device/route.ts        | 55 ++++++++++++++++++++++---
 components/native/OperatorDeviceConfig.tsx | 53 ++++++++++++++++++++-----
 components/native/VanMenuChooser.tsx       | 16 +++++++-
 lib/native/device.ts                       | 64 +++++++++++++++++++++++++++---
 4 files changed, 166 insertions(+), 22 deletions(-)
```

## Prompt integrity — one clarification, not a contradiction

No span arrived garbled and no instruction contradicted another.

ⓘ **`saveDeviceConfig` has FIVE call sites, not four.** The fifth is `lib/native/push.ts:145`, and the
prompt separately says **do not touch push.ts**. The two instructions agree: "all four call sites" means
the four outside push.ts. I changed those four and left push.ts alone. Its call is
`void saveDeviceConfig(token, { push_token: t.value })` — it discards the return value, so the new
result shape reaches it without requiring an edit.

## Which of the three I did — plainly

| | |
|---|---|
| **Parse** | ✅ **Yes.** `ts.transpileModule` parsed both `route.ts` and `lib/native/device.ts` from disk on every harness run — a precondition of executing them. |
| **Typecheck** | ❌ **No.** `tsc --noEmit` was not run. `transpileModule` type-checks nothing; it strips types and emits. |
| **Execution** | ✅ **Yes.** The real `saveDeviceConfig` was **run** against the real route handler, eight outcomes, with `globalThis.fetch` wired to the route. Table in §7. |

🔴 **NO UI HAS BEEN RENDERED.** Not one component was mounted, in any browser, at any size. Every
statement about what the picker, the toggles or the van switch *look* like is read from JSX, not seen.
`next dev` was not run and no device was used.

---

# PHASE 1 — READ AND REPORT

## 1. The three shapes

**`DeviceConfigResult` — the shape to mirror.** `lib/native/device.ts:42-48`, quoted with its rationale:

```ts
/**
 * Result of reading this device's config. DISCRIMINATED so callers can tell a FETCH FAILURE
 * (`{ ok: false }` → offer Retry) apart from a successful read that genuinely has no active vans
 * (`{ ok: true, vans: [] }` → "no active van"). Previously BOTH collapsed to `null`, so a transient
 * 429/500/network error masqueraded as "no active van" and trapped the operator behind a dead-end modal.
 */
export type DeviceConfigResult = ({ ok: true } & DeviceConfigData) | { ok: false }
```

**`fetchDeviceConfig` — the read path, which already does it properly.** `:51-58`:

```ts
export async function fetchDeviceConfig(token: string): Promise<DeviceConfigResult> {
  try {
    const res = await fetch(`/api/native/bind-device?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(getDeviceId())}`)
    if (!res.ok) return { ok: false }
    const data = await res.json()
    return { ok: true, device: data.device ?? null, vans: data.vans ?? [], vanHint: data.vanHint ?? null, truck: data.truck ?? null }
  } catch { return { ok: false } }
}
```

**`saveDeviceConfig` — the write path, before this task.** `:61-75`:

```ts
/** Upsert this device's row (van / default screen / notify / push token). Truck-scoped server-side. */
export async function saveDeviceConfig(
  token: string,
  patch: { van_id?: string | null; default_screen?: 'dashboard' | 'kds'; notify_enabled?: boolean; push_token?: string | null },
): Promise<DeviceConfig | null> {
  try {
    const res = await fetch('/api/native/bind-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device_id: getDeviceId(), platform: Capacitor?.getPlatform?.() ?? 'web', ...patch }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.device ?? null
  } catch { return null }
}
```

🔴 **Three distinct outcomes collapse to `null` on three separate lines** — `if (!res.ok) return null`,
an unhandled `res.json()` throw, and the bare `catch { return null }`. No `console.*` anywhere.
⚠️ Note the read path's asymmetry is *smaller* than it looks: `fetchDeviceConfig` also gives no reason —
but it only ever needed one bit (reachable / not), because its caller's response is a Retry card either
way. The write path needed more and got less.

## 2. The five failure returns, before this task

All five are in `POST`. Quoted with the status each sends:

| # | Line | Status | Body |
|---|---|---|---|
| 1 | `:65` | **401** | `{ error: 'Unauthorised' }` |
| 2 | `:66` | **400** | `{ error: 'device_id required' }` |
| 3 | `:72` | **404** | `{ error: 'van not found for this truck' }` |
| 4 | `:75` | **400** | `{ error: 'invalid default_screen' }` |
| 5 | `:115` | **400** | `{ error: error.message }` — **the database's own message, forwarded** |

```ts
  if (!truck) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!device_id) return NextResponse.json({ error: 'device_id required' }, { status: 400 })
…
    if (!van) return NextResponse.json({ error: 'van not found for this truck' }, { status: 404 })
…
    return NextResponse.json({ error: 'invalid default_screen' }, { status: 400 })
…
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
```

### Could a client distinguish them by the body?

**Only by matching on English prose, and not reliably at all for the fifth.**

- **Status alone is insufficient:** #2, #4 and #5 all send **400**.
- **The `error` string does differ** for #1–#4 — so a client *could* have switched on
  `'van not found for this truck'`. That is matching a human-readable sentence, which changes the moment
  anyone rewords the copy.
- 🔴 **#5 has no fixed string at all.** `error.message` is whatever PostgREST/Postgres produced —
  in the execution below it came back as `null value in column "van_id" violates not-null constraint`.
  It is unpredictable by construction, so **there was no way to identify the "the write itself was
  rejected" case from the client.**

⚠️ **A sixth failure return exists in the file and is deliberately out of scope:** `GET` at `:45` returns
401 `{ error: 'Unauthorised' }`. It is the `fetchDeviceConfig` path, which already has its Retry card,
and `saveDeviceConfig` never reaches it. It was left unchanged.

## 3. All four call sites, and what each did with `null`

| # | Site | Call | What it did with `null` |
|---|---|---|---|
| 1 | `OperatorDeviceConfig.tsx:71` | `saveDeviceConfig(token, { van_id: vanList[0].id, default_screen: … })` | 🔴 **nothing at all** |
| 2 | `OperatorDeviceConfig.tsx:99` | `saveDeviceConfig(token, { van_id: vanId, default_screen: screen })` | 🔴 nothing — modal sat on "Continue" |
| 3 | `OperatorDeviceConfig.tsx:208` | `saveDeviceConfig(token, p)` | 🔴 nothing — control silently sprang back |
| 4 | `VanMenuChooser.tsx:55` | `saveDeviceConfig(token, { van_id: nextVanId })` | 🔴 nothing — select snapped back |

```ts
// 1 — the silent single-van auto-bind. THE WORST OF THE FOUR: no button, no card, no state change.
      if (saved) void registerForPush(token, onOpenOrderRef.current)
      setLoading(false); return          // ← reached identically on success and on failure

// 2 — the picker's Continue.
    setSaving(false)
    if (saved) { void registerForPush(token, onOpenOrderRef.current); setNeedsSetup(false) }

// 3 — the "This device" toggles.
    const saved = await saveDeviceConfig(token, p)
    if (saved) setCfg(saved)

// 4 — the profile-menu van switch.
    if (saved && typeof window !== 'undefined') { window.location.reload(); return }
    setSwitching(false)
```

**Every one is an `if (saved)` with no `else`.** Not one has a `console.*`, an error string, or any state
that a failure could reach.

## 4. Does an existing inline write-error pattern exist? Yes — three, and they agree

I matched them rather than introducing anything.

**(a) In the very file being changed** — `OperatorDeviceConfig.tsx:304`, the set-PIN failure, sitting
directly above the action buttons:

```jsx
          {pinSetupErr && <p className="text-[11px] text-red-500">{pinSetupErr}</p>}
```

**(b) Manage, after a failed verify-and-save** — `app/manage/[token]/page.tsx:9526`:

```jsx
            {!verifying && verifyError && <p className="text-xs text-red-500">{verifyError}</p>}
```

**(c) The shared Manage field primitive** — `components/manage/primitives.tsx:44`:

```jsx
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
```

(Also `components/native/AppLockGate.tsx:89`, `{pinError && <p className="text-red-400 text-xs">…`.)

**The established vocabulary is a bare `<p>` in `text-red-500`, `text-[11px]` in native surfaces and
`text-xs` in Manage, placed adjacent to the control it refers to.** Every line added in Phase 2 uses
`text-[11px] text-red-500`, matching (a) — the same file.

---

# PHASE 2 — BUILD

## 5. The server: a stable `reason` on each of the five

**Status codes unchanged. `error` unchanged on every branch. The success response untouched.** `reason`
is purely additive.

```ts
// ── 🔴 EVERY FAILURE BODY CARRIES A STABLE `reason`. THE `error` STRING IS NOT ONE. ─────────────────
// The five rejections below used to be distinguishable only by their prose `error` text — and one of
// them (`upsert_failed`) does not have a fixed string at all, it forwards whatever PostgREST said. So
// a client could not tell them apart without matching on English, and diagnosing one instance meant
// streaming production logs. `reason` is a closed, machine-readable vocabulary the client switches on.
// ⚠️ ADDITIVE ONLY. `error` is unchanged on every branch, the STATUS CODES are unchanged, and the
// success response at the bottom is untouched — anything already reading those still reads the same
// bytes. ⚠️ `reason` is INTERNAL: it names a cause for a log line, never for an operator to read.
// Client contract: lib/native/device.ts SaveDeviceConfigResult.
type BindDeviceReason =
  | 'unauthorised'            // 401 — token did not resolve to an active truck
  | 'device_id_required'      // 400 — no device_id in the body
  | 'van_not_for_truck'       // 404 — the cross-truck guard refused the van
  | 'invalid_default_screen'  // 400 — default_screen outside ('dashboard'|'kds')
  | 'upsert_failed'           // 400 — the write itself was rejected by the database
```

`satisfies BindDeviceReason` on each literal, so a typo becomes a compile error rather than a silently
unmatched string on the client.

## 6. The client: a discriminated result mirroring `DeviceConfigResult`

```ts
export type SaveDeviceConfigResult =
  | { ok: true; device: DeviceConfig | null }
  | { ok: false; status: number | null; reason: string | null; networkError: boolean }
```

Carrying all three things asked for: **the HTTP status where there was one** (`null` only on a network
throw), **the distinguishing reason from the server body where present**, and **a flag for whether it was
a network throw rather than a server rejection**.

The logging lives in the function, once:

```ts
  // 🔴 LOGGED HERE, ONCE, NOT AT FOUR CALL SITES. Every writer goes through this function, so this is
  // the only place that cannot be forgotten by a future caller. Prefix matches the convention the
  // webhook route uses (`[webhook/meta-whatsapp] …`) so the tag is greppable in the same way.
  const fail = (r: { status: number | null; reason: string | null; networkError: boolean }): SaveDeviceConfigResult => {
    console.error(
      `[native/bind-device] write failed — ${r.networkError ? 'network throw (server not reached)' : `status ${r.status}`}` +
      `, reason=${r.reason ?? 'none'}, patch keys=[${Object.keys(patch).join(', ')}]`
    )
    return { ok: false, ...r }
  }
```

⚠️ **One outcome was previously invisible and is now named: `bad_json`.** A 200 whose body will not parse
used to fall into the bare `catch` and be indistinguishable from an unreachable server. It is now a
**server** failure with `status: 200, reason: 'bad_json', networkError: false`.

And the operator-facing text, which never names the reason:

```ts
/** The ONE operator-facing sentence for a failed write. 🔴 IT NEVER NAMES `reason`: the internal cause
 *  is for the console line above, not for a hatch. Only the network/server split changes the wording,
 *  because only that changes what the operator should do about it. */
export function saveFailureMessage(r: Extract<SaveDeviceConfigResult, { ok: false }>): string {
  return r.networkError
    ? 'Couldn’t reach the server — check the connection and try again.'
    : 'Couldn’t save that just now. Please try again.'
}
```

**Two sentences, total. Five internal reasons behind them.**

## 7. 🔴 PROOF BY EXECUTION

**The real `saveDeviceConfig` from `lib/native/device.ts`, driven against the real `POST` from
`app/api/native/bind-device/route.ts`.** Both transpiled from disk and run in a `vm`; `fetch` is wired
to the route handler, so **every body in the second table below was produced by the server code, not
hand-written**. Case 2 (`device_id_required`) is reached honestly by running `device.ts` in a sandbox
with no `window`, which is the SSR path where `getDeviceId()` genuinely returns `''`.

```
====================================================================================================================
saveDeviceConfig() RESULT, per outcome — REAL client against REAL route
====================================================================================================================
case                      ok    status  reason                  network  operator-facing message
--------------------------------------------------------------------------------------------------------------------
1  401 unauthorised       false 401     unauthorised            false    Couldn’t save that just now. Please try again.
2  400 device_id_required false 400     device_id_required      false    Couldn’t save that just now. Please try again.
3  404 van_not_for_truck  false 404     van_not_for_truck       false    Couldn’t save that just now. Please try again.
4  400 invalid_default_screen false 400 invalid_default_screen  false    Couldn’t save that just now. Please try again.
5  400 upsert_failed      false 400     upsert_failed           false    Couldn’t save that just now. Please try again.
0  200 SUCCESS (control)  true  200     —                       —        —
6  network throw          false null    null                    true     Couldn’t reach the server — check the connection and try again.
7  200 bad_json           false 200     bad_json                false    Couldn’t save that just now. Please try again.
```

### The body each rejection actually sent

```
1  401 unauthorised          {"error":"Unauthorised","reason":"unauthorised"}
2  400 device_id_required    {"error":"device_id required","reason":"device_id_required"}
3  404 van_not_for_truck     {"error":"van not found for this truck","reason":"van_not_for_truck"}
4  400 invalid_default_screen {"error":"invalid default_screen","reason":"invalid_default_screen"}
5  400 upsert_failed         {"error":"null value in column \"van_id\" violates not-null constraint","reason":"upsert_failed"}
0  200 SUCCESS (control)     {"ok":true,"device":{"id":"row-1","device_id":"c6b24668-…","truck_id":"rea…
```

🔴 **Case 5 is the point of the whole change.** Its `error` is a Postgres sentence nobody could have
matched on; its `reason` is `upsert_failed`, fixed. **Case 3 is the cross-truck guard still firing** —
a `test-truck` van against `real-thai-food`'s token, still 404.

### The `console.error` lines emitted

```
[native/bind-device] write failed — status 401, reason=unauthorised, patch keys=[van_id]
[native/bind-device] write failed — status 400, reason=device_id_required, patch keys=[van_id]
[native/bind-device] write failed — status 404, reason=van_not_for_truck, patch keys=[van_id]
[native/bind-device] write failed — status 400, reason=invalid_default_screen, patch keys=[default_screen]
[native/bind-device] write failed — status 400, reason=upsert_failed, patch keys=[van_id]
[native/bind-device] write failed — network throw (server not reached), reason=none, patch keys=[push_token]
[native/bind-device] write failed — status 200, reason=bad_json, patch keys=[notify_enabled]
```

### Assertions

```
  five server rejections all distinguishable by reason...... PASS
  reasons are the documented vocabulary..................... PASS
  status codes preserved (401,400,404,400,400).............. PASS
  every server rejection has networkError=false............. PASS
  network throw: networkError=true AND status=null.......... PASS
  bad_json is a SERVER failure, not a network one........... PASS
  success returns ok:true with a device..................... PASS
  success emits NO console.error............................ PASS
  every failure emits exactly one [native/bind-device] line. PASS
  NO operator message contains an internal reason........... PASS
  operator messages are one of the two sanctioned sentences. PASS

  11/11 pass
```

The last two are the constraint that the operator-facing text must not expose the internal reason,
asserted mechanically: no message contains any of the six reason strings, and only the two sanctioned
sentences ever appear.

## 8. The four call sites, as changed

**Site 2 — the picker's Continue. Inline error above the button; the modal stays open.**

```diff
   const onSave = async () => {
     setSaving(true)
+    setSaveError(null)   // clear the previous attempt's line before this one reports
     const saved = await saveDeviceConfig(token, { van_id: vanId, default_screen: screen })
     setSaving(false)
-    if (saved) { void registerForPush(token, onOpenOrderRef.current); setNeedsSetup(false) }
+    // 🔴 THE MODAL STAYS OPEN ON FAILURE, AND THAT IS THE POINT. setNeedsSetup(false) is the ONLY thing
+    // that closes it, and it is reachable only from the success branch — a card that closed on a failed
+    // save would be indistinguishable from one that saved. Unchanged behaviour on success.
+    if (saved.ok) { void registerForPush(token, onOpenOrderRef.current); setNeedsSetup(false); return }
+    setSaveError(saveFailureMessage(saved))
   }
```

```diff
+            {saveError && <p className="text-[11px] text-red-500 -mb-1">{saveError}</p>}
             <div className="flex gap-2">
               <button type="button" disabled={!vanId || saving} onClick={onSave}
-                {saving ? 'Saving…' : 'Continue'}
+                {saving ? 'Saving…' : saveError ? 'Try again' : 'Continue'}
```

**Site 3 — the toggles. Revert visibly, and say why.**

```diff
-  const patch = async (p: Parameters<typeof saveDeviceConfig>[1]) => {
+  const patch = async (p: Parameters<typeof saveDeviceConfig>[1], label: string) => {
+    setPatchError(null)
     const saved = await saveDeviceConfig(token, p)
-    if (saved) setCfg(saved)
+    if (saved.ok) { setCfg(saved.device); return }
+    setPatchError(`${label} didn’t save. ${saveFailureMessage(saved)}`)
   }
```

Each of the three controls now passes its own label (`'Van'`, `'Default screen'`,
`'Order notifications'`), so one shared line names which one failed. ⚠️ **The revert itself was already
structural** — every control is `value={cfg?.…}` and not calling `setCfg` is what puts it back. The
message is the new part, because a control that silently springs back reads as a mis-tap.

**Site 4 — the van switch. Keep the previous value; say why.**

```diff
-    if (saved && typeof window !== 'undefined') { window.location.reload(); return }
+    if (saved.ok && typeof window !== 'undefined') { window.location.reload(); return }
+    // ⚠️ `vanId` IS DELIBERATELY NOT TOUCHED. The <select> is controlled by it, so leaving it alone is
+    // what keeps the previous van selected — the device is still bound to that van, and showing the
+    // one the operator picked would claim a switch that did not happen.
     setSwitching(false)
+    if (!saved.ok) setSwitchError(saveFailureMessage(saved))
```

**Site 1 — the silent auto-bind. The one with no button behind it.**

```diff
-      if (saved) void registerForPush(token, onOpenOrderRef.current)
+      if (saved.ok) { void registerForPush(token, onOpenOrderRef.current); setLoading(false); return }
+      // 🔴 A SILENT AUTO-BIND THAT FAILS MUST NOT STAY SILENT. This branch used to fall straight through
+      // to setLoading(false) whatever happened, so the device ended up bound to nothing and the operator
+      // was shown a perfectly normal dashboard. It is the only save on this card with no button behind it,
+      // which is exactly why its failure was invisible. Fall through to the card — pre-filled with the one
+      // van it tried — so there is something to press. Success is untouched: it still shows no modal.
+      setVans(vanList)
+      setVanId(vanList[0].id)
+      setScreen(device?.default_screen ?? 'dashboard')
+      setSaveError(saveFailureMessage(saved))
+      setNeedsSetup(true)
       setLoading(false); return
```

⚠️ **This is the one place I made a judgement the prompt did not spell out.** The three named surfaces
were the picker, the toggles and the van switch; this fourth site has no UI of its own. On failure it now
falls through to the setup card rather than returning silently — otherwise it remains the one write whose
failure is invisible, which is the defect. **Its success path is byte-identical: still no modal.**

---

## What remains unobserved

1. **🔴 NO UI WAS RENDERED.** No component was mounted. That the error line appears above the Continue
   button, that the select holds its old value, that the toggle springs back — all read from JSX, none
   seen. `next dev` was not run.
2. **No typecheck and no build.** `tsc --noEmit` and `next build` were not run. In particular the
   `satisfies BindDeviceReason` operator and the narrowing of `saved.ok` are **unverified by a compiler**.
3. **No real server, no real database.** The route ran against an in-memory PostgREST-shaped fake. Real
   PostgREST error shapes, RLS and network behaviour were not exercised.
4. **Nothing deployed.** Deploys remain frozen; no row was read or written in production.
5. **`push.ts` is untouched and still discards the result.** Its `{ push_token }` write now logs a
   `[native/bind-device]` line on failure — via `saveDeviceConfig` itself, not via any change to that
   file — but it still has no UI and takes no action. That is the separate item.
6. **The GET 401 has no `reason`.** Out of scope by the read in §2; `fetchDeviceConfig` still returns a
   bare `{ ok: false }`, unchanged.
