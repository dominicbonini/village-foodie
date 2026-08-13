# Promote a discovery row into an operator truck

Date: 13 August 2026
Status: BUILT. `tsc --noEmit` clean. **Neither file gained a non-ASCII character class.**

No `next dev`, no `next build`, no commit, no deploy, no migration. `lib/provision-truck.ts` was **not
opened for editing** and is byte-identical to `HEAD`. Pizzeria Gusto was not read, written or referenced.

Nothing in the prompt arrived garbled. ⚠️ One trivial naming slip: the briefs are
`docs/tikka-tonic-account-report.md` (part 1, no `-1`) then `-2` … `-7`. There is no `-1.md`.

---

## 0. 🔴 ONE CONTRADICTION, AND HOW I RESOLVED IT — READ THIS FIRST

**Instruction 2b requires pre-filling `cuisineType <- dt.cuisine` and `contactEmail <- dt.contact_email`.
Those fields do not exist on the client.**

- `app/api/admin/route.ts:47` selects only
  `id, name, visibility, hatchgrab_truck_id, exclude_reason, show_on_vf, show_on_hg, excluded`.
- `app/admin/page.tsx:51-60`'s `DiscoveryTruck` interface declares exactly those eight.

So 2b as written requires widening that query — **`app/api/admin/route.ts`, a third file**, against
"SCOPE - EXACTLY TWO FILES".

**I did not edit a third file, and I did not silently drop the requirement.** I added a small
**admin-gated GET to `app/api/admin/create-truck/route.ts`** — one of the two in-scope files, and the
one that already owns promotion — returning `id, name, cuisine, contact_email` for a single row.

```ts
export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('discoveryTruckId')
  if (!id) return NextResponse.json({ error: 'discoveryTruckId required' }, { status: 400 })
  const { data, error } = await supabase
    .from('discovery_trucks').select('id, name, cuisine, contact_email').eq('id', id).maybeSingle()
  …
}
```

**Why this rather than stopping:** the contradiction is narrow — two fields of one pre-fill — and it has
a resolution that stays inside the fence and adds no new file. It returns nothing an admin cannot
already see, and the client **falls back to name-only** if it fails, so the pre-fill is a convenience and
never a dependency.

⚠️ **If you would rather widen `/api/admin`'s select instead, this GET is deletable in one block** and
`openPromote` then reads `dt.cuisine` / `dt.contact_email` directly. Your call — say which and I will
switch it.

---

## 1. `app/api/admin/create-truck/route.ts`

### 1a — optional `discoveryTruckId`

```ts
const discoveryTruckId = typeof body.discoveryTruckId === 'string' && body.discoveryTruckId.trim()
  ? body.discoveryTruckId.trim()
  : null
```

Absent → `null` → the link block below never runs. **The blank create is otherwise untouched.**

### 1b — the van is built here now, capacity always an explicit null

**Before:**
```ts
const van = body.van === false ? false as const : (body.van as ProvisionTruckOptions['van']) ?? undefined
```

**After:**
```ts
const vanName = typeof (body.van as { name?: unknown } | undefined)?.name === 'string'
  ? ((body.van as { name: string }).name).trim()
  : ''
const van: ProvisionTruckOptions['van'] = {
  ...(vanName ? { name: vanName } : {}),
  kitchen_capacity: null,
}
```

- `kitchen_capacity: null` is **always present**, so the module's `'kitchen_capacity' in vanOpts` test
  (`provision-truck.ts:491`) sees the key and writes `null` rather than defaulting to 5.
- **`van: false` is no longer reachable** — the van row is always created.
- **The route no longer reads any capacity value from the body.** Verified: `grep kitchen_capacity` in
  the route matches only the literal `null` at `:96`.
- The name is omitted when blank, so the module applies `'Van 1'`.

### 1c/1d — the link, and the rollback

```ts
const { data: linked, error: linkErr } = await supabase
  .from('discovery_trucks')
  .update({ hatchgrab_truck_id: result.truck.id, updated_at: new Date().toISOString() })
  .eq('id', discoveryTruckId)
  .is('hatchgrab_truck_id', null)
  .select('id')

if (linkErr || !linked || linked.length === 0) {
  const why = linkErr ? linkErr.message
    : 'that discovery row is already linked to another truck, or does not exist'
  try {
    await deleteTruckCascade(supabase, result.truck.id)
  } catch (cleanupErr) {
    console.error(
      `[create-truck] PROVISION_ORPHAN_TRUCK truck_id=${result.truck.id} — discovery link failed ` +
      `AND the compensating delete failed. Manual cleanup required.`,
      cleanupErr,
    )
    return NextResponse.json({ error: …, code: 'link_failed', orphanTruckId: result.truck.id }, { status: 500 })
  }
  return NextResponse.json({ error: …, code: 'link_failed' }, { status: 409 })
}
```

| Requirement | How |
|---|---|
| `.is(…, null)` concurrency guard | present — a racing promote matches zero rows and loses |
| **both** error and row count checked | `linkErr \|\| !linked \|\| linked.length === 0`. ⚠️ `.select('id')` is what makes the count observable — a zero-row UPDATE is **not** a PostgREST error |
| compensate by deleting the truck | `deleteTruckCascade` — **the same helper** `provision-truck.ts:512` uses |
| delete also fails → same log shape + id to client | `PROVISION_ORPHAN_TRUCK truck_id=…` and `orphanTruckId` in the body |
| distinct error code | **`link_failed`**, 409 on a clean rollback, 500 when orphaned |

### 1e — what it does NOT do

Verified by grep over the route: **no write to `discovery_trucks.excluded`** (the only `excluded`
occurrence is inside a comment listing the admin GET's columns), **no `operators` write** (the only match
is a comment about `create-operator`'s inline `is_admin` lookup), **no `is_customer`** anywhere.

---

## 2. `app/admin/page.tsx`

### 2a — the action, and which cell

**The Actions cell** — the rightmost, where `Edit` sits for an operator and `na` sat for a discovery row.

**Why that one, of the four empty cells:** Active, Dashboard and Manage each describe a *property or
destination of a truck that already exists*; a discovery row has none of those, which is why they read
`—`. "Create account" is a **verb performed on the row**, which is exactly what this column already means
for an operator. It also keeps every row's rightmost control in the same place, so the eye does not hunt.

```tsx
: <button
    onClick={() => openPromote(r.dt)}
    disabled={promoteLoading === r.id}
    title="Create a real operator truck from this scraped row and link the two"
    className="text-xs px-2.5 py-1 border border-orange-200 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50">
    {promoteLoading === r.id ? '…' : 'Create account'}
  </button>
```

⚠️ It renders only on discovery rows, which the existing `!t.hatchgrab_truck_id` filter (`:648`) already
guarantees are **unlinked**. No new filter was needed.

### 2b — the pre-fill

`openPromote(dt)` awaits the GET, then sets the form:

```tsx
setNewTruck({
  ...NEW_TRUCK_DEFAULTS,
  name: dt.name ?? '',
  cuisineType: prefill.cuisine ?? '',
  contactEmail: prefill.contact_email ?? '',
  // slug left blank so lib/provision-truck derives it from the name, exactly as a blank create does.
})
```

`kind` stays `'operator'` and `visibility` stays `'hidden'` from `NEW_TRUCK_DEFAULTS` — both unchanged
defaults. **Every field remains an ordinary controlled input; nothing is disabled or read-only.**

✅ **Phone and website are not pre-filled**, as instructed, and the reason is recorded in the code
comment: the scraped phone is a landline and the scraped website is usually a Facebook URL.

### 2c — the id is held separately and cleared

```tsx
const [promoteFrom, setPromoteFrom] = useState<{ id: string; name: string } | null>(null)
```

Held **outside** `NewTruckForm` deliberately — it is not a form field, and separateness is what makes the
clear a single line in `openNewTruck`:

```tsx
const openNewTruck = () => {
  setNewTruck({ ...NEW_TRUCK_DEFAULTS })
  …
  setPromoteFrom(null)      // ⚠️ so a blank create can never inherit the last promote's id
  setShowNewTruck(true)
}
```

Submit sends it only when set:

```tsx
...(promoteFrom ? { discoveryTruckId: promoteFrom.id } : {}),
```

### 2d — capacity removed

- `kitchenCapacity` gone from `NewTruckForm` (`:73`) and from `NEW_TRUCK_DEFAULTS` (`:84`).
- The `<input type="number">` and its `capacity` label are gone; the van-name input is now full width.
- `const capacity = Number(newTruck.kitchenCapacity)` and the conditional
  `kitchen_capacity` spread are gone from the request body.
- The explanatory note was rewritten rather than deleted — it now says capacity is **not** set here and
  names Manage as where it is chosen.

### 2e — the outcome in the result panel

An additive block, placed **above** the van line and **below** the visibility proof:

```tsx
{newTruckResult.linkedDiscoveryTruckId && (
  <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
    <p className="text-xs font-semibold text-green-800">✓ Linked to discovery row</p>
    …
  </div>
)}
```

**Nothing existing was removed or reordered.** The `dashboard_token` block and its `copyToken` button are
untouched — verified by diff: no `-` line in the changed file touches them.

**The failure surface:** `link_failed` gets its own headline (*"Could not link the discovery row"*) and
its own explanatory line — *"The new truck was rolled back — nothing was created"* — because the route
compensates, so "partly happened" would be a lie. The 409 slug-suffix hint is suppressed for this code,
and the orphan banner's wording was widened from "its van failed" to "a later step failed" since two
paths now reach it.

---

## 3. VERIFICATION — WHAT I CHECKED

### Checked and passing

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `lib/provision-truck.ts` untouched | ✅ `git diff --stat` empty |
| `/api/setup` reaches `provisionTruck` unchanged | ✅ `git diff` empty; still `kind: 'operator'`, `van: { kitchen_capacity: null }` |
| `lib/provision-demo.ts` unchanged | ✅ `git diff` empty; still `kind: 'demo'`, `van: { name: 'Van 1', kitchen_capacity: DEMO_VAN_CAPACITY }` |
| Only two files modified | ✅ `git status` lists exactly `app/admin/page.tsx` and `app/api/admin/create-truck/route.ts` |
| Non-ASCII census | ✅ route 4 → 4 classes, page 26 → 26. **None gained.** ⚠️ I introduced `─` into the route on the first pass, which that file had never contained; the census caught it and the header was rewritten in plain text |
| Route writes no `excluded` / `operators` / `is_customer` | ✅ by grep |
| `.is(…, null)` + row-count check both present | ✅ by grep |

### The blank-create path — what changed and what did not

**Unchanged:** auth, `kind`/`visibility` validation and their 400s, `name`/`slug`/`plan`/`contactEmail`/
`cuisineType` forwarding, the success response's existing fields, the `ProvisionError` status mapping,
the result panel, the token copy button.

**Changed, and only this:** `kitchen_capacity` is now always `null` instead of `5`. That is 1b, and it is
intended. The response gains `linkedDiscoveryTruckId: null`, which the panel does not render when falsy.

### 🔴 WHAT I HAVE NOT EXERCISED — nothing here was run against the database

**I did not execute a single line of this code.** Specifically not verified:

1. **No promote was performed.** No `discovery_trucks` row was linked; no truck was created.
2. **The rollback path is unexercised.** `deleteTruckCascade` on link failure is correct by construction
   (same helper, same shape as the module's van path) but has **never been run** from here.
3. **The `.is(…, null)` race** is reasoned, not tested. Two concurrent promotes were not attempted.
4. **The prefill GET has not been called**, so neither the happy path nor the name-only fallback is
   confirmed at runtime.
5. **The UI has not been rendered.** Button placement, the modal's promote title, the green confirmation
   and the `link_failed` copy are all unseen — `tsc` proves they compile, not that they look right.
6. **`discovery_trucks.updated_at` is assumed to exist and be writable.** It appeared on a row I read in
   an earlier investigation; I did not re-verify the column or check for a trigger that owns it.
   **INFERRED.**

**Test it against a throwaway discovery row first, as you planned.** The two failure modes worth watching
are (a) a link failure correctly rolling the truck back and leaving no `trucks` row, and (b) the pre-fill
populating cuisine and email rather than silently falling back to name-only.
