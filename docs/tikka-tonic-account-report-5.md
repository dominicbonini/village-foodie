# Account-creation investigation, part 5 — the order gate and the visibility mapping

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no SQL was run, no
migration.** This report is the only file created. No `next dev`, no `next build`. Pizzeria Gusto was
not read or touched.

Follows reports 1-4. Nothing from them is repeated.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE ANSWER, UP FRONT

**No — a truck with `active = true` and `excluded = true` CANNOT receive a customer order.** The
eligibility check is in two parts, and the premise of the question (that only `active` is checked) holds
for the *lookup* but not for the route. **`excluded` is enforced fourteen lines later, as a 404.**

🔴 **And it matters directly for Tikka Tonic:** `/api/admin/create-truck` defaults to
`visibility: 'hidden'`, which writes `excluded: true`. **A truck created through the admin console is
closed for orders until that flag is cleared** — the same flag `create-operator` then *sets* on the
discovery shadow (part 3, §5). Two different tables, same column name, opposite directions. Section 2d.

---

## 1. The truck-eligibility check in `/api/orders/submit`

### The lookup — `app/api/orders/submit/route.ts:198-218`, verbatim

```ts
    // ── Fetch truck (by slug or id) ───────────────────────────────────────────
    let truckQuery = await supabase
      .from('trucks')
      .select('*')
      .eq('slug', truckId)
      .eq('active', true)
      .single()

    if (truckQuery.error || !truckQuery.data) {
      truckQuery = await supabase
        .from('trucks')
        .select('*')
        .eq('id', truckId)
        .eq('active', true)
        .single()
    }

    const truck = truckQuery.data
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }
```

### a. Do the queries check `excluded`, `show_on_vf` or `show_on_hg`? — **No. Only `active`.**

Both the slug lookup (`:202-203`) and the id lookup (`:210-211`) filter on `active` alone. Neither
mentions `excluded`, `show_on_vf`, `show_on_hg` or `order_link_*`.

🔴 **But the ROUTE does check `excluded` — separately, at `:238-256`:**

```ts
    // Demo trucks are exempt from the hidden-truck gate below and never send email — see both comments.
    const isDemoTruck = isDemoIdentifier(truck.id)

    // HIDDEN-TRUCK GATE. Discovery gating (show_on_vf/show_on_hg/excluded) only governs the MAP — the
    // customer menu and events APIs resolve any truck by slug/id with no visibility filter, and this route
    // previously checked `active` alone. So anyone who knew or guessed the slug could place a REAL order on
    // a truck that is hidden everywhere else: a demo truck, or an operator still in pre-trial setup mode.
    // `excluded` is the master hide — if it's set, the truck is not open for business. Checked here rather
    // than in the queries above so one condition covers both the slug and the id lookup. Deliberately the
    // SAME 404 as an unknown truck: a hidden truck should not confirm its own existence.
    //
    // DEMO EXEMPTION: a demo truck is excluded=true by construction, but ordering on it IS the demo — the
    // prospect opens their own QR/order link and watches the order land on the dashboard. Safe because the
    // gate exists to stop a STRANGER guessing a slug: a demo slug is 130 bits of random (not a guessable
    // name), the truck is absent from both discovery feeds, and every order dies with the truck at cleanup.
    // Scoped to the `demo-` prefix ONLY — a real hidden/pre-trial truck is gated exactly as before.
    if (truck.excluded === true && !isDemoTruck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }
```

⚠️ **The comment states why it is not in the queries:** *"Checked here rather than in the queries above
so one condition covers both the slug and the id lookup."* One gate, both paths.

⚠️ **`show_on_vf` / `show_on_hg` / `order_link_*` are checked NOWHERE on this route.**
`grep -n "show_on_vf|show_on_hg|order_link"` in the file returns only the comment at `:241`. Per that
comment, those columns *"only govern the MAP"*.

**Full eligibility, in order:**

| Order | Condition | Line | On failure |
|---|---|---|---|
| 1 | `active = true` (slug, then id) | `:203`, `:211` | 404 `Truck not found` (`:216-218`) |
| 2 | `deletion_requested_at` is null | `:231` | **423** `account_closing` |
| 3 | `excluded !== true`, **unless** the id carries the `demo-` prefix | `:254` | 404 `Truck not found` |

### b. Can a truck with `active = true` and `excluded = true` receive a real order? — **NO.**

**The code does not permit it.** `:254` returns **404** before any event, menu, stock or payment logic is
reached. A confirmed future event makes no difference — the gate is above all of that.

**The single exception** is a truck whose **id begins `demo-`** (`isDemoIdentifier(truck.id)`, `:239`),
which is exempt by construction. **Tikka Tonic would not be** — `safeSlug` / `assertReservedPrefix`
prevent a real operator truck from carrying that prefix (part 1).

⚠️ **The 404 is deliberately identical to "unknown truck"** (`:247`): *"a hidden truck should not confirm
its own existence."* So the operator's symptom is *"Truck not found"* on their own order page, with
nothing naming `excluded` as the cause. **INFERRED** that this is what a customer sees; I read the route,
not the order page's rendering of a 404.

---

## 2. `visibility` in `/api/admin/create-truck`

### a. The trace, and the mapping in full

**Accepted values** — `app/api/admin/create-truck/route.ts:38-41`:

```ts
  const visibility = body.visibility as ProvisionTruckOptions['visibility']
  if (visibility !== undefined && visibility !== 'hidden' && visibility !== 'public') {
    return NextResponse.json({ error: 'visibility must be "hidden" or "public"' }, { status: 400 })
  }
```

**The type** — `lib/provision-truck.ts:230`: `visibility?: 'hidden' | 'public'`.

**The resolution** — `lib/provision-truck.ts:356-357`:

```ts
  const visibility = opts.visibility ?? 'hidden'
  const visibilityCols = visibility === 'public' ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY
```

**Spread into the insert** — `:451`: `...visibilityCols,`

**The two constants, verbatim** — `lib/provision-truck.ts:44-70`:

```ts
// ── Visibility ───────────────────────────────────────────────────────────────────────────────────────
// All six columns are written EXPLICITLY, including the three whose DB defaults are already correct.
// Deliberate: these are a security property, the defaults are exactly what migration 20260702 changed and
// could change again, and someone auditing "is this truck hidden?" should find the whole answer in one
// place. Three lines of redundancy against a class of silent-exposure bug.
//
// `active` is NOT a visibility control and is always true — /api/orders/submit filters .eq('active', true),
// so active=false would break order placement rather than hide the truck. Hiding is excluded + show_on_*.
const HIDDEN_VISIBILITY = {
  show_on_vf: false,
  show_on_hg: false,      // DB default is TRUE — must override
  order_link_vf: false,
  order_link_hg: false,   // DB default is TRUE — must override
  is_customer: false,
  excluded: true,         // master hide
} as const

// The go-live state (§4.3). HG only — whether Village Foodie exposure follows is a separate product
// decision (O3), so show_on_vf/order_link_vf stay false here.
const PUBLIC_VISIBILITY = {
  show_on_vf: false,
  show_on_hg: true,
  order_link_vf: false,
  order_link_hg: true,
  is_customer: true,
  excluded: false,
} as const
```

### b. `visibility: 'hidden'` — the literal values

| Column | Value |
|---|---|
| `show_on_vf` | **`false`** |
| `show_on_hg` | **`false`** ⚠️ *DB default is TRUE — must override* |
| `order_link_vf` | **`false`** |
| `order_link_hg` | **`false`** ⚠️ *DB default is TRUE — must override* |
| `is_customer` | **`false`** |
| 🔴 `excluded` | **`true`** — *master hide* |

### c. Every other accepted value

**There are only two**, plus omission.

**`visibility: 'public'`:**

| Column | Value |
|---|---|
| `show_on_vf` | **`false`** 🔴 *not true — see below* |
| `show_on_hg` | **`true`** |
| `order_link_vf` | **`false`** |
| `order_link_hg` | **`true`** |
| `is_customer` | **`true`** |
| `excluded` | **`false`** |

⚠️ **"Public" means HatchGrab only.** `show_on_vf` and `order_link_vf` stay `false` — the comment at
`:61-62` states it: *"HG only — whether Village Foodie exposure follows is a separate product decision
(O3)."* **So `'public'` does NOT put a truck on Village Foodie.** That requires a separate write to
`show_on_vf`, available from the admin console's per-row tickboxes (`updateTruck`, part 1 §5b).

**Omitted / `undefined`:** `opts.visibility ?? 'hidden'` (`:356`) → **identical to `'hidden'`**. The admin
form defaults to `'hidden'` too (`app/admin/page.tsx:80`: *"fail-safe — going public is an explicit
act"*), so omission and the default agree.

**Anything else:** rejected **400** `visibility must be "hidden" or "public"` before `provisionTruck` is
called. There is no third state.

### d. 🔴 WHAT THIS MEANS TOGETHER WITH SECTION 1

A truck created via `/api/admin/create-truck` with the form's default gets **`excluded: true`**. Section
1b establishes that `excluded: true` makes `/api/orders/submit` return **404** for a non-demo truck.

**So an admin-created truck cannot take orders until `excluded` is flipped to `false`.**

Two routes to that, both already established:

- the admin console's per-row **Excluded** tickbox (`updateTruck`, `app/api/admin/route.ts:93`), or
- creating it with `visibility: 'public'` in the first place, which also sets `show_on_hg`,
  `order_link_hg` and `is_customer` — **but still not `show_on_vf`**.

⚠️ **Note the collision of names across two tables**, because it is genuinely confusing:
`trucks.excluded = true` **stops orders**; `discovery_trucks.excluded = true` **hides the scraped
shadow**, which is what `create-operator` sets deliberately (part 3, §5). **Same column name, different
tables, unrelated effects.** Setting the wrong one is a plausible mistake.

---

## 3. READ vs INFERRED

**Read from source:** both lookups and their `.eq('active', true)` filters; the `deletion_requested_at`
gate; the hidden-truck gate and its demo exemption in full; the absence of any `show_on_*` / `order_link_*`
reference on the submit route (grep); the route-level `visibility` validation; the option type; the
`opts.visibility ?? 'hidden'` resolution; both visibility constants verbatim; the `...visibilityCols`
spread at the insert.

**INFERRED, labelled in place:** what the customer order page renders on the 404.

**Not established:** nothing outstanding for these two questions.
