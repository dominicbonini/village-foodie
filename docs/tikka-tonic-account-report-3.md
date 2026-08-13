# Account-creation investigation, part 3 — the admin create form, first login, and the discovery shadow

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no SQL was run, no
migration.** This report is the only file created. No `next dev`, no `next build`. Pizzeria Gusto was
not read or touched in this pass.

Follows `docs/tikka-tonic-account-report.md` (part 1) and `docs/tikka-tonic-account-report-2.md`
(part 2 — `sheet_id`, `active`, van inserts, email case). Nothing from either is repeated.

Nothing in the prompt arrived garbled. No instruction contradicted another.

⚠️ **One note on filing.** This brief first arrived asking for `docs/tikka-tonic-account-report-2.md`,
which part 2 already occupies and which is untracked in git — overwriting would have destroyed it. The
corrected brief names `-3.md`, so both survive. No action needed; recording it so the numbering is not a
mystery later.

---

## 0. 🔴 THE THREE THAT MATTER FOR TIKKA TONIC

1. **The admin form cannot set a phone number at all** — not the form, not the route. `contact_phone`
   and `whatsapp` must be added afterwards in Manage → Settings. Section 1c.
2. 🔴 **`allergen_display_mode = null` hides unverified items from the CUSTOMER menu while the operator
   still sees them.** An admin-created truck with an AI-imported menu can render **empty or partial** to
   customers and complete to the operator. Section 3b.
3. 🔴 **Creating the operator makes Tikka Tonic disappear from Village Foodie immediately** — the
   `excluded: true` write sets the master hide, and it stays invisible until its HatchGrab truck has
   confirmed events. Section 5b.

---

## 1. `/api/admin/create-truck` from the admin console

### a. There is a form — the route is not curl-only

`app/admin/page.tsx:431` is the call site:

```tsx
const res = await fetch('/api/admin/create-truck', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() },
  body: JSON.stringify({ … }),
})
```

Inside `submitNewTruck` (`:425-467`), driven by the modal whose state is declared at `:236-241`. The
block comment at `:232-235` states the intent: *"This replaces hand-written SQL as the way trucks get
created. Trucks are created HIDDEN by default."*

### b. Fields collected, and the exact body sent

**The form's shape** — `NewTruckForm`, `app/admin/page.tsx:65-74`, defaults at `:76-85`:

| Field | Default |
|---|---|
| `name` | `''` |
| `slug` | `''` |
| `kind` | `'operator'` |
| `visibility` | `'hidden'` — *"fail-safe — going public is an explicit act"* |
| `contactEmail` | `''` |
| `cuisineType` | `''` |
| `vanName` | `'Van 1'` |
| `kitchenCapacity` | `'5'` |

**The exact body** — `:434-446`:

```js
{
  kind: newTruck.kind,
  ...(newTruck.name.trim()         ? { name: newTruck.name.trim() } : {}),
  ...(newTruck.slug.trim()         ? { slug: newTruck.slug.trim() } : {}),
  ...(newTruck.contactEmail.trim() ? { contactEmail: newTruck.contactEmail.trim() } : {}),
  ...(newTruck.cuisineType.trim()  ? { cuisineType: newTruck.cuisineType.trim() } : {}),
  visibility: newTruck.visibility,
  van: {
    name: newTruck.vanName.trim() || 'Van 1',
    ...(Number.isFinite(capacity) && capacity > 0 ? { kitchen_capacity: capacity } : {}),
  },
}
```

⚠️ **Blank optionals are OMITTED, never sent as `''`** (`:437-438`), so the module's `?? null` defaults
apply rather than an empty string landing in the column. ⚠️ **`plan` is never sent**, so the profile's
`'trial'` stands. ⚠️ `name` is required for `kind: 'operator'` — `newTruckNameOk` at `:422` and the
route's own `validation` throw at `provision-truck.ts:340`.

🔴 **`kitchen_capacity` is omitted when the parsed number is not finite or is ≤ 0** (`:445`). With the
default `'5'` that never happens, but **blanking the capacity box sends no key at all**, which
`provision-truck.ts:491` then reads as "omitted" and writes **5** anyway. Blanking the field does not
give you a null capacity; it gives you 5.

### c. Field by field

| Column | From the form? |
|---|---|
| `cuisine_type` | ✅ **YES-from-the-form** — `cuisineType` (`:438` → `route.ts:56` → `provision-truck.ts:431`) |
| `contact_email` | ✅ **YES-from-the-form** — `contactEmail` (`:437` → `route.ts:55` → `:411`) |
| 🔴 `contact_phone` | ❌ **NO-must-be-set-afterwards** |
| 🔴 `whatsapp` | ❌ **NO-must-be-set-afterwards** |
| `van.kitchen_capacity` | ✅ **YES-from-the-form** — `kitchenCapacity` (`:445` → `route.ts:57` → `:491`) |

🔴 **The phone gap is at the ROUTE, not just the form.** `app/api/admin/create-truck/route.ts:49-58`
forwards exactly `kind, name, slug, plan, visibility, contactEmail, cuisineType, van` — **`contactPhone`
is never accepted or forwarded** (`grep` for `contactPhone|contact_phone|whatsapp` in that file returns
nothing). So even by curl you cannot set a phone through this route.

⚠️ **Contrast with `/api/setup`,** where `contact_phone` is **required and validated**
(`app/api/setup/route.ts:70-76`) and populates `contact_phone`, `whatsapp`, `phone_is_whatsapp` and
`preferred_contact_method` together. **The admin path produces a truck with a contact block the wizard
would have refused to create.** Both are writable later via `update_settings`
(`app/api/manage/route.ts:798`).

### d. Name collision on id or slug

**Not an error — it retries with a numeric suffix.** `provision-truck.ts:380-462`:

```ts
for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
  identity = profile.identity === 'random' ? demoIdentity() : operatorIdentity(name, opts.slug, attempt)
  …
  if (!error && data) { created = data; break }
  lastError = error?.message ?? 'unknown insert error'
  if (error?.code === '23505') {
    console.warn(`[provision-truck] unique violation on attempt ${attempt + 1}: ${lastError}`)
    continue
  }
  throw new ProvisionError('insert_failed', `Truck insert failed: ${lastError}`)
}
```

`operatorIdentity` (`:299-307`) does the suffixing:

```ts
const suffixed = attempt === 0 ? base : `${base}-${attempt + 1}`
…
id: suffixed, slug: suffixed,
dashboard_token: `${suffixed.slice(0, 24)}-${randomBytes(6).toString('hex')}`,
```

So a second "Tikka Tonic" becomes **`tikka-tonic-2`**, then `-3`, up to `MAX_INSERT_ATTEMPTS = 5`
(`:285`). Exhausted → `ProvisionError('unique_exhausted', …)` (`:466-470`) → **HTTP 409**
(`create-truck/route.ts:84-86`).

⚠️ **It regenerates the WHOLE identity on 23505 rather than parsing which of the three unique indexes
fired** — `trucks_pkey`, `trucks_slug_key`, `trucks_dashboard_token_key` — and the comment at `:370-375`
explains why: *"building retry logic on an unverified error shape is how silent bugs start."*

⚠️ **INSERT-and-retry, never SELECT-then-INSERT** (`:367-369`) — a pre-check would be TOCTOU-racy.

🔴 **The practical trap: a collision succeeds silently under a different slug.** The admin sees
`tikka-tonic-2` in the result panel; nothing warns that the name was taken. **Check the slug in the
response before handing out the URL.**

---

## 2. `must_change_password`

### a. Every occurrence

| Site | Kind |
|---|---|
| `app/api/admin/create-operator/route.ts:52` | **WRITE `true`** |
| `app/api/manage/route.ts:1123` | **WRITE `true`** — team-member invite |
| `app/api/signup/route.ts:103` | **WRITE `false`** — *"they chose this password"* (`:97`) |
| `app/api/auth/reset-password/route.ts:76` | **WRITE `false`** |
| `app/reset-password/page.tsx:85` | **WRITE `false`** |
| 🔴 `app/login/page.tsx:44` | ✅ **THE ONLY READ** |

### b. Yes — it is enforced, at exactly one place

`app/login/page.tsx:43-47`:

```tsx
// Force password change on first login
if (data.user?.user_metadata?.must_change_password) {
  router.push('/reset-password?firstLogin=true')
  return
}
```

⚠️ **It is a client-side redirect in the login form, not middleware and not a page guard.**
`grep must_change_password proxy.ts` → **nothing**. There is no `middleware.ts`.

🔴 **So the enforcement is bypassable by construction:** anyone who reaches a URL without going through
`/login` — a bookmarked `/manage/<token>`, the native app's `/app` route, or a session restored from a
cookie — **is never asked to change the password**. It is a nudge on one path, not an invariant.
**INFERRED** that the native path skips it: `:50-53` returns early to `/app` **after** the check, so
native logins *do* hit it; a *restored* session that never re-renders the login form does not.

The flag does clear correctly: `/reset-password?firstLogin=true` sets it `false` at
`app/reset-password/page.tsx:85` before redirecting.

---

## 3. What the admin path leaves unset

### a. First login — where they land

For an admin-created operator (truck exists, `setup_step = null`), traced end to end:

1. `/login` → `must_change_password` is `true` (`create-operator:52`) → **`/reset-password?firstLogin=true`**
   (`login/page.tsx:44-47`).
2. They set a password → `must_change_password: false` → **`router.push('/dashboard')`**
   (`reset-password/page.tsx:95`).
3. `/dashboard` → not an admin → owner query with `.eq('active', true)` → truck found → **redirect to
   `/dashboard/<token>`** (part 2, §2).

**They land on the KDS-style dashboard and never see `/setup` or Manage.** The onboarding wizard is
skipped entirely.

**And if they did reach `/setup`:** `app/setup/page.tsx:61-76` calls `/api/setup?check=truck`, which
returns their truck (`route.ts:171-176` → `resolveOperatorTruck`), and the page **redirects to
`/manage/<token>?import=demo`** (`:69`). ⚠️ **It never inspects `setup_step`** — the presence of *any*
truck is the whole test. So they are bounced to Manage with a demo-import query parameter for a demo
session that does not exist.

⚠️ **`setup_step = null` is correct and deliberate**, not a gap. `app/api/auth/post-login/route.ts:79-81`
is explicit: *"`setup_step` is NULL for every truck that predates the wizard and every admin-created
truck, and NULL means 'not in setup' — never 'at step 1'. Reading it the other way round would sweep
existing live operators into an onboarding flow."* `:94` treats null as **settled** and leaves them
where they are.

### b. 🔴 `allergen_display_mode = null` — IT HIDES CUSTOMER MENU ITEMS

Every read traced:

| Site | Behaviour when `null` |
|---|---|
| 🔴 `app/api/menu/[truckId]/route.ts:501-503` | `perDish = (mode ?? null) !== 'card'` → **`true`** → for a customer (`!isDashboard`), `return i.allergens_verified !== false` — **every explicitly-unverified item is FILTERED OUT** |
| `app/api/menu/[truckId]/route.ts:719` | `allergensVerified` = `mode === 'card' && (url \|\| text)` → **false** |
| `app/api/menu/[truckId]/route.ts:705` | passed through to the client as `null` |
| `app/trucks/[slug]/order/page.tsx:2610, 2616` | `mode !== 'card'` → **per-dish allergen chips are shown** |
| `app/trucks/[slug]/order/page.tsx:3478` | mode read for the allergen modal's branch |
| `app/manage/[token]/page.tsx:284` | `cardModeSetUp = mode === 'card'` → **false** |
| `app/manage/[token]/page.tsx:3681` | `hiddenCount` computed because `mode !== 'card'` |
| `app/manage/[token]/page.tsx:4156, 5709` | the import wizard's committed mode |
| `lib/go-live-checks.ts:86` | ⚠️ **module has ZERO call sites** (`app/api/setup/route.ts:103-106`) — inert |

🔴 **The consequence, stated plainly.** `null` behaves like `per_dish` for the customer gate. The
provision profile's own comment for the *demo* records exactly this danger
(`provision-truck.ts:189-191`): *"NEVER 'per_dish' for a demo: import commits every item
allergens_verified=false, and the per-dish customer-menu gate HIDES unverified items → the demo would
render an EMPTY MENU."*

**The operator profile sets `allergenDisplayMode: null`** (`:150`, *"operator chooses in the wizard"*) —
which is fine when the wizard runs, because it writes a mode at commit
(`app/manage/[token]/page.tsx:3333`). **On the admin path nothing writes it**, so the truck sits at
`null` with the per-dish gate active.

⚠️ **The asymmetry is the dangerous part:** the operator dashboard (`isDashboard`) shows everything
(`:502`), so the menu looks complete to them while customers see less. **Set the allergen display mode
in Manage before Tikka Tonic goes public, or verify every item's allergens.**

### c. Other columns the wizard sets that the admin path leaves unset

| Column | Wizard | Admin path | Depends on it |
|---|---|---|---|
| `contact_phone` | required + validated (`setup/route.ts:70-76`) | 🔴 **null** | customer contact; `lib/email.ts`'s contact block |
| `whatsapp` | same number (`provision-truck.ts:424`) | 🔴 `''` (falls back at `:424` since `contactPhone` is undefined) | WhatsApp contact rendering |
| `phone_is_whatsapp` | from the tick (`:425`) | `false` — INFERRED from `body.phone_is_whatsapp === true` never being sent |
| `preferred_contact_method` | `'phone'`/`'whatsapp'` (`:430`) | 🔴 **null** — read at `dashboard/action/route.ts:193, 299, 1604, 1960` and `orders/submit/route.ts:1229`. ⚠️ **`null` renders no contact section rather than breaking** (`:426-429`) |
| `allergen_display_mode` | written at import commit | 🔴 **null** — section 3b |
| `setup_step` | `'menu'` then advanced | `null` — ✅ **correct**, section 3a |
| `operator_id` | set by `/api/setup:116` | set later by `create-operator:77` | the whole ownership chain |

⚠️ **`commit-menu` is guarded to setup-mode trucks** (`app/api/manage/commit-menu/route.ts:32`:
*"Guarded to setup-mode trucks so it can never wipe a live menu: setup_step present and…"*). **INFERRED:
an admin-created truck with `setup_step = null` may therefore be ineligible for that path** — I read the
comment but not the full guard.

---

## 4. `discovery_trucks.hatchgrab_truck_id`

### a. 🔴 There is no "Link HG truck" control any more

`app/api/admin/route.ts:80-81`, in the discovery-update branch:

```ts
// Per-site booleans + `excluded` master-hide are the live controls; `visibility` still accepted for
// back-compat until it's dropped. (linkDiscoveryTruck / hatchgrab_truck_id is no longer set from the UI.)
```

The column is still **read** in three places — `app/api/admin/route.ts:47` (selected for the console),
`app/admin/page.tsx:648` (see below), and `app/api/discovery/events/route.ts:242-244` (profile
read-through) — plus `app/api/inbound-schedule/route.ts:120-144` and `lib/truck-logo.ts:24`.

⚠️ **What it still does in the console:** `app/admin/page.tsx:644-650` folds a linked shadow row *behind*
its operator row so the truck does not appear twice —

> *"A `discovery_trucks` row WITH `hatchgrab_truck_id` set is an operator truck's linking-shadow … It is
> NOT a separate truck: it must NOT render as its own admin row … the shadow row STAYS in the DB — it is
> load-bearing, do not delete."*

**What linking writes besides the column: not established.** The writing code no longer exists in the
repo — `grep -rn "hatchgrab_truck_id:"` finds **only a TypeScript interface field**
(`app/admin/page.tsx:55`) and **no assignment anywhere**.

### b. Automatic on creation? **No — and not manual either. Nothing sets it at all.**

Neither `create-truck`, `create-operator`, `/api/setup` nor `provisionTruck` writes it. `create-operator`
touches `discovery_trucks` only to set `excluded: true` by name (part 1, §1b) — **it does not link**.

🔴 **So Tikka Tonic's discovery row will be `excluded: true` with `hatchgrab_truck_id` still NULL.** It
becomes an *excluded, unlinked* shadow rather than a linked one, and section 5b is what that means.

**INFERRED:** setting it now requires direct SQL, since no app code path writes it.

---

## 5. `discovery_trucks.excluded = true` — the read path

### a. Every filter, and the visible effect

`app/api/discovery/events/route.ts` is the single consumer. `:76` selects the per-site column:

```ts
// Per-site boolean: HatchGrab reads show_on_hg, Village Foodie reads show_on_vf.
const showCol = isHG ? 'show_on_hg' : 'show_on_vf'
```

| Line | Filters | Effect |
|---|---|---|
| `:146` | `if (truck.excluded) return null` — **scraped events** | the shadow's events vanish from the events list. Comment `:144-145`: *"Master hide … also how a graduated truck's scraped shadow is suppressed."* |
| `:254` | `if (truck.excluded) return false` — ⚠️ **`trucks.excluded`, the OPERATOR truck**, not the discovery row | an excluded operator truck's own events vanish |
| `:339` | `!t.excluded && t[showCol] === true` — **the trucks list** | the truck disappears from the discovery truck listing entirely |

**Visible effect:** on **Village Foodie** (`show_on_vf`) and on **HatchGrab** (`show_on_hg`) alike, an
`excluded` discovery truck contributes **no events and no listing**. `excluded` is a master switch that
overrides both per-site booleans — it is tested *first* at `:146` and ANDed at `:339`.

⚠️ **`:126` recovers orphaned events by name** when the FK does not resolve, *"so those events get their
profile back AND are gated exactly like a linked event"* (`:119-120`) — so renaming or unlinking does not
leak a hidden truck back onto the site.

### b. Interaction with `visibility`, `show_on_vf`, `show_on_hg` — and the empty-events case

**Precedence:** `excluded` (master) → `show_on_vf` / `show_on_hg` (per-site) → `visibility` (legacy).

🔴 **`visibility` is no longer consulted on the read path.** `:185-186`:

> *"Operator-event visibility is now read DIRECTLY off the truck's own NOT-NULL `show_on_vf`/`show_on_hg`
> — no more 'linked `discovery_trucks.visibility`, default public if unlinked' (that missing-link default
> was the leak)."*

It survives only as a write in `app/api/admin/route.ts:86`, accepted *"for back-compat until it's
dropped"*.

### 🔴 The answer to your scenario

**A Village Foodie visitor sees NOTHING where that truck used to be — it disappears completely.**

Walk it:

1. The scraped shadow's events are dropped at `:146` (`excluded`).
2. The truck is dropped from the trucks list at `:339` (`!t.excluded` fails).
3. The linked HatchGrab truck contributes nothing to `mappedOperatorEvents` because **it has no events**
   — `:249-259` filters a list that is already empty.

**Net: no events, no listing, no placeholder.** Not a "coming soon" card, not a profile with an empty
schedule — the truck is simply absent.

⚠️ **And for Tikka Tonic this fires the moment the operator account is created**, because
`create-operator:97` sets `excluded: true` by name match, and its discovery row is named exactly
`Tikka Tonic` (part 1, §1b). **From that instant until its HatchGrab truck has confirmed
`truck_events`, Tikka Tonic is invisible on Village Foodie.**

🔴 **That is the designed graduation behaviour** (`create-operator:90-93`: *"this truck now takes orders
via HatchGrab, so its scraped SHADOW must never surface publicly — the truck's public schedule comes
solely from its confirmation-gated `truck_events`"*). **It is only a problem if the gap between account
creation and their first confirmed event is long.** Worth telling them, or worth confirming an event the
same day.

---

## 6. READ vs INFERRED

**Read from source:** the create-truck modal, its state shape and defaults, the exact request body, the
route's forwarding and error mapping, the retry/suffix loop, every `must_change_password` site, the login
redirect, `proxy.ts`'s absence of a check, the `/setup` guard and `?check=truck`, `post-login`'s
`setup_step` reasoning, every `allergen_display_mode` read, the customer-menu filter, every
`hatchgrab_truck_id` reference, and all three `excluded` gates with their per-site column.

**INFERRED, labelled in place:** `phone_is_whatsapp` defaulting false on the admin path; that a restored
session bypasses the `must_change_password` redirect; that `commit-menu`'s setup-mode guard excludes an
admin-created truck; that linking now requires SQL.

**Not established:** what `linkDiscoveryTruck` used to write besides the column — the code no longer
exists in the repository.
