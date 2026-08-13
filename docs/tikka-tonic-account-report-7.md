# Account-creation investigation, part 7 — the admin Trucks tab, the Create button, and create-truck's response

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no SQL was run, no
migration.** This report is the only file created. No `next dev`, no `next build`. Pizzeria Gusto was
not read or touched.

Follows reports 1-6. Nothing from them is repeated.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. THE SHORT ANSWERS

- **Unlinked discovery rows DO render** as their own rows, and offer **three visibility tickboxes and
  nothing else** — no Edit, no Create-from-this, no link control.
- **The Create truck modal is entirely blank-form.** It has **zero awareness** of discovery rows: no
  pre-fill, no dropdown, no name lookup. Creating Tikka Tonic means retyping everything the scraper
  already holds.
- **The response surfaces id, slug AND `dashboard_token`** — the token behind a copy button, shown once.
- 🔴 **Rollback covers exactly one failure: the van insert.** Nothing after it is covered, and there is
  nothing after it inside `provisionTruck`.

---

## 1. The admin Trucks tab and `discovery_trucks`

### a. Yes — unlinked rows render as their own rows

**The filter**, `app/admin/page.tsx:647-649`:

```tsx
    ...discoveryTrucks
      .filter(t => !t.hatchgrab_truck_id)
      .map((t): UnifiedRow => ({ kind: 'discovery', id: t.id, name: t.name, dt: t })),
```

They are concatenated with operator trucks into `unifiedRows` (`:639-650`), then filtered for display
(`:651-657`) and rendered by one loop, `:898`:

```tsx
{filteredRows.map(r => {
  const isOp = r.kind === 'operator'
  const excluded = isOp ? r.op.excluded : r.dt.excluded
  const showVf   = isOp ? r.op.show_on_vf : r.dt.show_on_vf
  const showHg   = isOp ? r.op.show_on_hg : r.dt.show_on_hg
```

**One table, two row kinds**, told apart by `isOp` throughout. A discovery row is badged `Discovery`
instead of a plan (`:956`) and can be isolated with the `planFilter === 'discovery'` filter (`:654`).

⚠️ **Tikka Tonic is currently one of these rows** — `hatchgrab_truck_id` is null (part 3, §4), so it
renders today as a Discovery row in that tab.

### b. Every action such a row offers — **three tickboxes, nothing more**

| Column | Discovery row | Operator row | Line |
|---|---|---|---|
| **Active** | 🔴 `—` (the `na` placeholder) | checkbox → `updateTruck({ active })`, with a confirm | `:941-951` |
| **Show on VF** | ✅ checkbox → `updateDiscovery(r.id, { show_on_vf: v })` | → `updateTruck` | `:960` |
| **Show on HG** | ✅ checkbox → `updateDiscovery(r.id, { show_on_hg: v })` | → `updateTruck` | `:968` |
| **Excluded** | ✅ checkbox → `updateDiscovery(r.id, { excluded: v })` | → `updateTruck` | `:976` |
| **Dashboard 🖥** | 🔴 `—` | `linkBtn(/dashboard/<token>)` | `:979-981` |
| **Manage ⚙️** | 🔴 `—` | `linkBtn(/manage/<token>)` | `:983-985` |
| **Edit** | 🔴 `—` | `openEditModal(r.op)` | `:987-993` |

**So the complete action set for an unlinked discovery row is: Show on VF, Show on HG, Excluded.** All
three POST to `/api/admin` with `discoveryTruckId` (`:357-366`), which routes to the
`discovery_trucks` branch at `app/api/admin/route.ts:78-89`.

⚠️ **The Show-on tickboxes are disabled when `excluded` is set** — `box(checked, dim, …)` at `:906-910`
takes `dim = excluded` for both site columns (`:960`, `:968`) and renders them `opacity-40` and
`disabled`. The Excluded box itself passes `dim = false` (`:976`), so it always remains clickable.

🔴 **There is no "create an operator truck from this discovery row" action, and no link control.** Part 3
established the link control was removed (`app/api/admin/route.ts:81`); this confirms nothing replaced
it in the row UI.

### c. The fold condition, confirmed — and what an unlinked shadow does instead

**Confirmed exactly as reported.** `app/admin/page.tsx:641-649`, the comment and the filter together:

```tsx
    // A discovery_trucks row WITH hatchgrab_truck_id set is an operator truck's linking-shadow — the
    // structural row that carries scraped events into that operator's truck_events + suppresses the raw
    // scraped copies (see reference-manual §33). It is NOT a separate truck: it must NOT render as its own
    // admin row, or the operator shows twice. Fold it behind the operator row (display-only; the shadow row
    // STAYS in the DB — it is load-bearing, do not delete). Unlinked discovery rows (pure discovery) render
    // as normal.
    ...discoveryTrucks
      .filter(t => !t.hatchgrab_truck_id)
```

**The condition is `!t.hatchgrab_truck_id`** — truthiness, so both `null` and `''` fold. ⚠️ **"Fold" means
OMIT, not nest.** There is no expandable sub-row; the linked shadow is simply absent from `unifiedRows`
and its data is not shown anywhere in the tab. The operator row beside it displays the operator truck's
own columns, never the shadow's.

**An unlinked shadow renders as a normal, standalone Discovery row** — with the three tickboxes of (b),
and nothing tying it to any operator truck.

---

## 2. The Create Truck button

### a. Where it sits

**Tab:** `Trucks` — the console has exactly two, `'trucks' | 'features'` (`:217`, `:686`), and the button
is inside the `adminTab === 'trucks'` block (`:799`).

**It is a top-level button in the tab's header bar**, `:844-849`:

```tsx
<button
  onClick={openNewTruck}
  className="ml-auto whitespace-nowrap text-sm px-3.5 py-2 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700"
>
  ＋ Create truck
</button>
```

It sits after the demo-cleanup indicator and is pushed right by `ml-auto`. ⚠️ Beside it is a
**dashed-bordered purple "demo" button** (`:851-857`) whose own comment marks it *"TEMPORARY test
scaffolding — dashed border marks it as not-production furniture."*

**It opens a modal**, gated on `showNewTruck` at `:1707` (`{/* ── Create truck modal ── */}`), with the
heading `Create truck` at `:1714`.

### b. 🔴 Entirely blank-form — zero discovery awareness

`openNewTruck` (`:413-421`) resets to constants and nothing else:

```tsx
const openNewTruck = () => {
  setNewTruck({ ...NEW_TRUCK_DEFAULTS })
  setNewTruckError(null)
  setNewTruckResult(null)
  setTokenCopied(false)
  setShowNewTruck(true)
}
```

`NEW_TRUCK_DEFAULTS` (`:76-85`) is all empty strings plus `kind: 'operator'`, `visibility: 'hidden'`,
`vanName: 'Van 1'`, `kitchenCapacity: '5'` (part 3, §1b).

**No argument is accepted.** It cannot be called with a discovery row, and the row UI offers no button
that would (section 1b). Grepping the modal body for `discovery`, `dt.`, `prefill`, `select` or `option`
returns **nothing** relevant.

🔴 **So creating Tikka Tonic means retyping the name, cuisine and contact email by hand**, even though
`discovery_trucks` already holds `name: 'Tikka Tonic'`, `cuisine: 'Indian'`,
`contact_email: 'info@tikkatonic.com'`, `phone: '01284 724298'`, a website and logo/photo paths (part 1
of this series' predecessor investigation). **Nothing carries any of it across**, and the phone cannot be
carried at all because the route does not accept it (part 3, §1c).

⚠️ **And the two rows never converge automatically:** creating the operator truck leaves the discovery
row unlinked (`hatchgrab_truck_id` stays null — part 3, §4b), so the tab will then show **two rows
named "Tikka Tonic"** — one operator, one discovery — until the discovery row is excluded. Which
`create-operator` does do, by name (part 1, §1b). **INFERRED** that the excluded row still renders in the
tab (excluding hides it from the public sites, not from the admin table — nothing in `filteredRows`
filters on `excluded`).

---

## 3. `/api/admin/create-truck` — response and failure

### a. The success response, quoted

`app/api/admin/create-truck/route.ts:60-73`:

```ts
    // ⚠️ dashboard_token is a SECRET and is in this response by necessity (it's how the admin reaches the
    // truck). It is never logged server-side; the console should render it once behind a copy button, the
    // same pattern create-operator uses for tempPassword.
    return NextResponse.json({
      ok: true,
      truck: result.truck,
      van: result.van,
      urls: {
        manage: `/manage/${result.truck.dashboard_token}`,
        dashboard: `/dashboard/${result.truck.dashboard_token}`,
        order: `/trucks/${result.truck.slug}/order`,
      },
      warnings: result.warnings,
    })
```

`result.truck` is what the insert's `.select()` returned (`provision-truck.ts:453`), typed client-side at
`app/admin/page.tsx:115-129`: `id, slug, name, plan, dashboard_token, active, excluded, show_on_vf,
show_on_hg`; `van` is `{ id, name, kds_token } | null`.

### b. 🔴 Rollback covers the van insert, and nothing else

`lib/provision-truck.ts:505-528`:

```ts
    if (vanError || !vanRow) {
      // ── COMPENSATING DELETE ──────────────────────────────────────────────────────────────────────
      // Not transactional: the van needs truck_id, so the truck must commit first and a partial state is
      // possible by construction. Roll the truck back rather than leaving a vanless husk. commit-menu is
      // the cautionary precedent — its partial inserts hurt precisely because nothing surfaces them, so
      // this fails LOUDLY AND COMPLETELY instead of half-succeeding quietly.
      try {
        await deleteTruckCascade(supabase, truckId)
      } catch (cleanupErr) {
        console.error(
          `[provision-truck] PROVISION_ORPHAN_TRUCK truck_id=${truckId} — van insert failed AND the ` +
          `compensating delete failed. Manual cleanup required.`,
          cleanupErr,
        )
        throw new ProvisionError('van_failed', `Van creation failed (…) and rollback failed — truck ${truckId} is orphaned.`, truckId)
      }
      throw new ProvisionError('van_failed', `Van creation failed, truck rolled back: …`)
    }
```

**What it DOES cover:** the truck INSERT succeeding and the **van** INSERT then failing. The truck is
deleted via `deleteTruckCascade`. If that delete also fails, a `PROVISION_ORPHAN_TRUCK` line is logged
and the truck id is returned to the client as `orphanTruckId` (route `:78-83`), so the stranded row is
recoverable without a log dive.

**What it does NOT cover — plainly:**

1. 🔴 **Nothing after the van, because `provisionTruck` does nothing after the van.** The van insert is
   the last write in the function; `:531-534` only pushes a warning when `van: false`. **So "a write
   AFTER the insert fails" cannot arise inside `provisionTruck`.**
2. 🔴 **Nothing the CALLER does afterwards.** `/api/setup:115-117` updates `operator_id` and
   `setup_step` **after** `provisionTruck` returns — outside any rollback. If that update failed, the
   truck would exist with `operator_id: null` and no compensation. **INFERRED:** its error is not
   checked at that call site.
3. **Not transactional in any sense** — the comment says so at `:506-507`. Each statement commits
   independently.
4. **`/api/admin/create-operator`'s later writes** (the `trucks.operator_id` update, the
   `discovery_trucks` exclusion) are a different route entirely and have no rollback — part 1, §1b.

### c. What the console surfaces — **all three, and more**

The result panel (`:1920-2025`) renders:

| Value | Line |
|---|---|
| name | `:1925` |
| 🔴 **id** | `:1932` — `<code className="font-mono …">{newTruckResult.truck.id}</code>` |
| 🔴 **slug** | `:1936` — same treatment |
| plan badge | `:1940-1941` |
| the visibility proof — `active`, `excluded`, `show_on_vf`, `show_on_hg` | `:1956-1959`, under a banner reading `🔒 Created hidden ✓` or `🌍 Created PUBLIC` (`:1953`) |
| van name + truncated id | `:1965-1968` |
| 🔴 **dashboard_token** | `:1981`, with a **copy button** at `:1984` (`copyToken`) |
| the three URLs | `:2001-2003` |
| warnings | `:2020-2022` |

**So yes — id, slug and `dashboard_token` are all shown**, the token behind a copy button exactly as the
route's comment at `:60-62` asks. ⚠️ **The token is displayed once, in the result panel**; `openNewTruck`
clears `newTruckResult` (`:416`), so reopening the modal loses it. After that it is reachable only from
the row's 🖥/⚙️ links or the admin GET.

⚠️ **The panel is the only place `excluded` is surfaced at creation** — worth reading, given part 5:
`🔒 Created hidden ✓` means the truck **cannot take orders** until that flag is cleared.

---

## 4. READ vs INFERRED

**Read from source:** `unifiedRows` and its filter; the row-render loop and every action column; the
`box`/`linkBtn`/`na` helpers and the `dim` disabling; the tab list; the Create-truck button and
`openNewTruck`; `NEW_TRUCK_DEFAULTS`; the modal's absence of discovery references; the success response;
the compensating-delete block; the route's `orphanTruckId` branch; the result panel's fields and the copy
button.

**INFERRED, labelled in place:** that an `excluded` discovery row still renders in the admin table
(nothing in `filteredRows` filters on it); that `/api/setup`'s post-provision update does not check its
error.

**Not established:** nothing outstanding for these three questions.
