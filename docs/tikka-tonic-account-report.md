# Account-creation paths — read before creating Tikka Tonic

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no SQL was run, no
migration.** This report is the only file created. No `next dev`, no `next build`.

Pizzeria Gusto was **read** (one `SELECT` to confirm which columns exist and their live values). Nothing
was written to it or to anything else.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE HEADLINE — THERE ARE THREE ROUTES, NOT TWO, AND ONLY ONE CREATES A TRUCK

| Route | Creates a truck? | Creates an operator? |
|---|---|---|
| `/api/admin/create-truck` | ✅ **yes** (via `provisionTruck`) | no |
| `/api/setup` `create_truck` | ✅ **yes** (via `provisionTruck`) | no — attaches the caller's existing operator |
| `/api/admin/create-operator` | ❌ **no** — **attaches to an existing truck** | ✅ yes (auth user + `operators` row) |

**So creating Tikka Tonic is two steps, in this order:** make the truck (admin `create-truck`, or the
operator self-serves through `/api/setup`), then make the operator and attach it
(`/api/admin/create-operator`).

🔴 **And one thing to know before you press it:** `create-operator` also writes to `discovery_trucks`,
matching **by name**, not by id — and there is already a `discovery_trucks` row named exactly
`Tikka Tonic`. Section 1b.

---

## 1. `/api/admin/create-operator`

`app/api/admin/create-operator/route.ts`, 159 lines, read in full.

### a. Input, and what must already exist

**Input** — `:35`: `const { truckId, email } = await req.json()`. **Two fields only.**

**Must already exist:**
- 🔴 **The truck.** `:38-42` reads `trucks.name` by `truckId`; `:75-78` updates that row. ⚠️ **If
  `truckId` matches nothing, `truckData` is null and `truckName` falls back to `'your truck'` (`:43`) —
  the route does not abort.** The `UPDATE … .eq('id', truckId)` then matches zero rows and, because
  PostgREST does not treat that as an error, the route **returns `ok: true`** with no warning.
  **INFERRED** from the absence of any row-count check at `:80`.
- The email address must **not** already have a Supabase auth user — `:48-53` `createUser` errors
  otherwise and the route 400s at `:55-57`.

### b. Every row and column it writes

| # | Target | Operation | Columns |
|---|---|---|---|
| 1 | Supabase **auth user** | `auth.admin.createUser` `:48-53` | `email`, `password` (the temp), `email_confirm: true`, `user_metadata: { must_change_password: true }` |
| 2 | **`operators`** | INSERT `:60-68` | `auth_user_id`, `email`, `name` — 🔴 **`name` is `email.split('@')[0]`** (`:65`), so `contact@tikkatonic.com` becomes the operator name `contact` |
| 3 | **`trucks`** | **UPDATE** `:75-78` | **`operator_id` only**, `.eq('id', truckId)` |
| 4 | 🔴 **`discovery_trucks`** | UPDATE `:97` | `excluded: true`, matched **`.ilike('name', shadowName)`** |

🔴 **Row 4 is the one to look at.** It is a **name match, not an id match**, and it is unbounded — every
`discovery_trucks` row whose name case-insensitively equals the truck's name is set `excluded: true`.
The comment at `:90-93` says this is deliberate (the scraped shadow must stop surfacing publicly once the
truck trades through HatchGrab), and it is wrapped in try/catch so it never blocks creation (`:94-101`).

⚠️ **For Tikka Tonic specifically this WILL fire.** `discovery_trucks` contains one row named exactly
`Tikka Tonic` (id `0259e042-6e9d-4af0-a543-62cb4e3c13c5`). That is almost certainly what you want — but
it is a write to a row you did not name in the request, so it should not be a surprise.

**Nothing else is written.** No truck row is created, no van, no menu, no events.

### c. Does it create a truck? **No.**

`:75-78` is `.from('trucks').update({ operator_id }).eq('id', truckId)`. **It is an attach, and the truck
must exist first.** There is no INSERT into `trucks` anywhere in the file.

### d. The initial password

- **Produced** `:11-16`: `generateTempPassword()` — 12 characters from a 54-character
  ambiguity-free alphabet. 🔴 **It uses `Math.random()`, not `crypto.randomBytes`** (`:14`) — unlike
  `lib/provision-truck.ts:38`, which uses `randomBytes` for tokens. **Not cryptographically secure.**
  Stated as a fact, not a request to change it.
- **Surfaced twice:**
  1. **In the HTTP response** — `:158` `{ ok: true, tempPassword, operatorId }`, rendered by the admin
     console.
  2. 🔴 **In the welcome email, in plain text** — `:124-125`, inside a `<code>` block.
- **Email send site:** `:138-153`, a direct `fetch` to `https://api.brevo.com/v3/smtp/email`. **Not**
  `lib/email-signup.ts` and **not** `lib/email.ts` — this route hand-rolls its own send.
  - **FROM:** `HATCHGRAB_SENDER` (`lib/email-config.ts:10-14`) = name **`HatchGrab`**, address
    **`hello@villagefoodie.co.uk`**, replyTo `hello@villagefoodie.co.uk`.
  - **Subject:** `Your HatchGrab dashboard is ready 🚚`
  - **Link:** `${NEXT_PUBLIC_HATCHGRAB_URL}/login` — ✅ **no dashboard token.**
  - Skipped entirely with a `console.warn` if `BREVO_API_KEY` is unset (`:154-156`).

### e. Authorisation

`:19-33`. Cookie session first, then a `Bearer` fallback for the native app, then
`operators.is_admin` — 401 on any failure. ⚠️ It does **its own inline `is_admin` lookup** rather than
calling `verifyAdmin`; `app/api/admin/create-truck/route.ts:8` notes this ("same effect").

---

## 2. `/api/setup` action `create_truck`

`app/api/setup/route.ts`, 217 lines.

### a. Auth

`:38-44`. **Supabase session cookie only** — no Bearer fallback, no admin requirement:

1. `auth.getUser()` → 401 `Not signed in` if absent.
2. `operators` row for that `auth_user_id` → 401 `No operator record` if absent.

**So the operator must already exist and be signed in.** This is the self-serve path; it cannot be
driven by an admin on someone's behalf.

⚠️ **Idempotence guard** `:79-84`: if that operator already has a truck with a non-null `setup_step`
that is not `'done'`, it returns that truck with `resumed: true` and creates nothing.

### b. The `trucks` insert — the full literal

🔴 **`/api/setup` does not write the row itself. It calls `provisionTruck`** (`:87-108`), which owns the
only INSERT. The literal is `lib/provision-truck.ts:391-452`, and here it is in full:

```
id, slug, name, dashboard_token, dashboard_pin: null, sheet_id: '', active: true, plan,
trial_expires_at: null, operator_id: null, contact_email, contact_phone, whatsapp,
phone_is_whatsapp, preferred_contact_method, cuisine_type, truck_order_email_enabled,
auto_accept, allergen_display_mode, preorders_enabled, notes_require_review, show_paid_step,
takes_cash, completion_presses, default_auto_open: true, default_auto_close: true,
…visibilityCols (show_on_vf, show_on_hg, order_link_vf, order_link_hg, is_customer, excluded)
```

Against your named list:

| Column | Written? | Value on the `/api/setup` path |
|---|---|---|
| `slug` | ✅ `:393` | `safeSlug(name)` — `createSlug`, with the `demo-` prefix defused (`route.ts:32-35`) |
| `dashboard_token` | ✅ `:395` | `` `${suffixed.slice(0,24)}-${randomBytes(6).toString('hex')}` `` (`:306`) — **`crypto`, unlike the password** |
| `active` | ✅ `:404` | **`true`**, always. `:50-51` notes it is *not* a visibility control |
| `plan` | ✅ `:405` | **`'trial'`** (operator profile) |
| `trial_expires_at` | ✅ `:409` | 🔴 **`null`** — and null now *means* "trial not started"; nomination sets it |
| `contact_email` | ✅ `:411` | `body.contact_email` or the operator's email (`route.ts:52`) |
| `contact_phone` | ✅ `:423` | **required and validated** at `route.ts:70-76` (`isValidUKPhone`) |
| `whatsapp` | ✅ `:424` | **the same number**, falling back to `''` never `null` |
| `cuisine_type` | ✅ `:431` | `opts.cuisineType ?? null` — 🔴 **`/api/setup` never passes it, so `null`** |
| 🔴 **`hide_pricing`** | ❌ **NOT WRITTEN** | **inherits the DB default.** Not present anywhere in `provision-truck.ts` (`grep` = 0 hits) |
| 🔴 **`timezone`** | ❌ **NOT WRITTEN** | column exists (Gusto reads `null`) but nothing in provisioning touches it |

Then `route.ts:115-117` does a **second statement** on the row it just made:
`update({ operator_id: operator.id, setup_step: 'menu' }).eq('id', result.truck.id)`.

⚠️ **`trucks` has 94 columns; the insert names 26 plus 6 visibility.** Everything else inherits its DB
default — that is by design, but it is why `hide_pricing` and `timezone` arrive unset.

### c. Does it create a `truck_vans` row? **YES.**

`lib/provision-truck.ts:481-501`, unless `opts.van === false`. `/api/setup:107` passes
`van: { kitchen_capacity: null }`.

| Column | Value on this path |
|---|---|
| `truck_id` | the new truck |
| `name` | `'Van 1'` |
| `active` | `true` |
| 🔴 **`kitchen_capacity`** | **`null`** — explicitly, because `'kitchen_capacity' in vanOpts` is true (`:491`). ⚠️ The `?? 5` trap is avoided deliberately |
| **`capacity_window_mins`** | 🔴 **omitted** → DB default **5** (`:492`) |
| `buzzer_count` | `null` (operator profile) |
| `kds_token` | omitted → DB default `encode(gen_random_bytes(24),'hex')` |

⚠️ **`kitchen_capacity: null` means the capacity engine is inert for this truck** — `upsert_event` only
writes `slot_capacity` when the van carries a capacity. `route.ts:100-106` says this is deliberate ("it
must be an active decision, not an inherited guess") and **corrects an earlier claim**: `checkGoLive` has
**zero call sites**, so nothing blocks go-live on it.

🔴 **The admin path differs here.** `/api/admin/create-truck` passes `van` straight through from the
request body (`:44-46`); **omitting `van` entirely gives `kitchen_capacity: 5`**, not null.

---

## 3. `lib/provision-truck.ts`

### a. The `operator` profile, quoted verbatim (`:134-183`, comments elided)

```ts
operator: {
  identity: 'readable',
  plan: 'trial',
  nameRequired: true,
  truckOrderEmailEnabled: true,
  allergenDisplayMode: null,    // operator chooses in the wizard
  autoAccept: true,
  preordersEnabled: false,
  buzzerCount: null,
  notesRequireReview: true,
  showPaidStep: true,
  takesCash: false,
  completionPresses: 'two',
},
```

🔴 **`takesCash: false` is why Tikka Tonic will not get the cash/card split** — the same setting that
made 165 of 166 in-person ledger rows carry `method = NULL` (manual §16). It is an operator setting they
can turn on in Settings; it is simply off at creation.

⚠️ **`plan: 'trial'` with `trial_expires_at: null`** grants the full trial feature set, because
`canAccess` reads a null expiry as "not started" (`lib/features.ts`).

### b. Committed, and identical to what is deployed

```
$ git status --short lib/provision-truck.ts     → (no output — clean)
$ git log --oneline -1 -- lib/provision-truck.ts → afa31e2 payments
$ git merge-base --is-ancestor afa31e2 origin/main → YES
$ git diff origin/main -- lib/provision-truck.ts  → (empty)
```

✅ **The working tree is byte-identical to `origin/main`, and `git status --short` on the whole repo is
empty** — there is no uncommitted work anywhere at the time of writing.

⚠️ **The honest limit:** this proves the file matches `origin/main`. **It does not prove what Vercel is
serving** — that depends on which commit the current Production deployment was built from, which is not
visible from the repo. Given your history with fix-in-repo-not-deployed, **check the Vercel deployment's
commit SHA against `d4e99bac` before relying on it.**

### c. Does it create a van row? **Yes** — section 2c. It is the only file that does, on any path.

---

## 4. Every code path that creates a `trucks` row

**Exactly one INSERT exists in the entire repository.**

```
$ grep -rn "from('trucks')" app lib components scripts   → every hit checked for a following .insert/.upsert
INSERT/UPSERT  lib/provision-truck.ts:390
```

Cross-checked: `grep -rn "provisionTruck("` finds **three** callers —

| Caller | Auth |
|---|---|
| `app/api/setup/route.ts:87` | operator session |
| `app/api/admin/create-truck/route.ts:49` | `verifyAdmin(req)` (`:22-24`) |
| `lib/provision-demo.ts:112` | the demo path (`kind: 'demo'`) |

**No raw SQL insert into `trucks` exists** in `scripts/` or `supabase/`
(`grep -rln "INSERT INTO trucks"` → nothing). ✅ **`lib/provision-truck.ts:390` is the sole writer**, so
everything in section 2b holds for every creation path.

---

## 5. The admin truck edit modal

### a. `hide_pricing` control — ✅ present, reads and writes the column

`app/admin/page.tsx:1085-1093`:

```tsx
<input
  type="checkbox"
  checked={modalEdits.hide_pricing ?? editingTruck.hide_pricing ?? false}
  onChange={e => setModalEdits(prev => ({ ...prev, hide_pricing: e.target.checked }))}
/>
<span …>Hide pricing (show TBC)</span>
```

Read back from `trucks.hide_pricing` in the GET's named select (`app/api/admin/route.ts:54`). Gusto's
live value is **`true`**.

### b. 🔴 WHOLE PAYLOAD OR CHANGED FIELDS? — BOTH, AND THIS IS THE ANSWER TO YOUR ACTUAL QUESTION

**The server has no allow-list at all.** `app/api/admin/route.ts:76,93`:

```ts
const { truckId, discoveryTruckId, ...updates } = body
…
const { error } = await supabase.from('trucks').update(updates).eq('id', truckId)
```

**Whatever the client sends is written.** So the answer lives entirely in the client.

`openEditModal` (`app/admin/page.tsx:376-386`) **seeds `modalEdits` with six fields**:

```ts
setModalEdits({
  plan, active, trial_expires_at, feature_overrides,
  lifetime_discount_pct, lifetime_discount_note,
})
```

`saveModal` (`:388-396`) sends `{ truckId: editingTruck.id, ...modalEdits }`.

**Therefore:**

| Column | Sent on every save? | Can opening-and-saving clear it? |
|---|---|---|
| `plan` | ✅ always | rewritten with the value loaded at page load |
| `active` | ✅ always | same |
| `trial_expires_at` | ✅ always | same — 🔴 and `:1030` sets it to `null` if plan is changed away from `trial` |
| `feature_overrides` | ✅ always | same |
| `lifetime_discount_pct` | ✅ always | same |
| `lifetime_discount_note` | ✅ always | same |
| 🔴 **`hide_pricing`** | ❌ **only if the checkbox is touched** | ✅ **NO — it is absent from the payload and cannot be cleared** |

✅ **Direct answer: opening and saving the modal WITHOUT touching the pricing tick cannot clear
`hide_pricing`.** It is not seeded into `modalEdits`, so the key never reaches the server.

🔴 **But the six seeded fields ARE rewritten on every save, changed or not** — with values read when the
admin page last loaded (`:281`). **If anything else changed one of those six in the interim, saving the
modal silently reverts it.** That is a genuine stale-write window, and it includes `plan`,
`trial_expires_at` and `feature_overrides`.

**Two other write paths on the same endpoint**, both narrow patches rather than whole payloads:

- `update(truckId, updates)` `:323-337` — generic, sends whatever it is handed.
- `updateTruck(truckId, patch)` `:341-355` — typed to `show_on_vf | show_on_hg | order_link_vf |
  order_link_hg | excluded | active`.

**Full set of `trucks` columns the admin console can write:** `plan`, `active`, `trial_expires_at`,
`feature_overrides`, `lifetime_discount_pct`, `lifetime_discount_note`, `hide_pricing`, `show_on_vf`,
`show_on_hg`, `order_link_vf`, `order_link_hg`, `excluded` — plus **anything else a caller passes**,
since the server filters nothing.

### c. Trial controls

- **Presets** `:597-601` — `setModalTrial(1 | 3)`: `plan: 'trial'` + `trial_expires_at` = now + N months,
  ISO.
- **Custom date picker** `:605-609` — `setModalTrialDate(dateStr)`: `plan: 'trial'` +
  `trial_expires_at` = `${dateStr}T23:59:59` ⚠️ **end-of-day, so the trial lasts THROUGH the chosen
  date**, and selecting a date deselects both preset chips.
- **Plan change** `:1030` — moving off `trial` writes `trial_expires_at: null`.

---

## 6. New-operator email — both paths

| | `/api/admin/create-operator` | Self-serve signup |
|---|---|---|
| **Sends?** | ✅ yes, inline `fetch` at `:138-153` | ✅ two emails via `lib/email-signup.ts` |
| **FROM name** | `HatchGrab` | `HatchGrab` (`FROM_NAME`, `:32`) |
| **FROM address** | 🔴 **`hello@villagefoodie.co.uk`** (`HATCHGRAB_SENDER`, `email-config.ts:12`) | 🔴 **`process.env.EMAIL_FROM_ADDRESS`, falling back to `hello@hatchgrab.com`** (`:33`) |
| **Reply-To** | `hello@villagefoodie.co.uk` | `hello@hatchgrab.com` (`HATCHGRAB_REPLY_TO`, `:25`) |
| **Contains the temp password?** | 🔴 **YES, in plain text** (`:124-125`) | n/a — the operator sets their own |
| **Contains a dashboard token?** | ✅ **No** — links to `/login` | ✅ **No** — `grep` for `dashboard_token` in `email-signup.ts` returns **nothing** |

🔴 **The two paths send from different addresses.** `email-config.ts:5-7` records why —
`hatchgrab.com` is not yet SPF/DKIM-verified in Brevo, so the admin path deliberately still uses
`villagefoodie.co.uk`. `email-signup.ts:26-31` warns that **with `EMAIL_FROM_ADDRESS` unset, its two
emails send from an unverified domain and Brevo will reject them.** ⚠️ **Worth checking that variable is
set before relying on the self-serve path for a real operator.**

⚠️ **The self-serve welcome email deliberately dropped its token** — `verify-signup/route.ts:106-116`
records that `manageUrl` used to be `${base}/manage/${truck.dashboard_token}`, "a long-lived bearer
credential written in plain text into an inbox", and is now the bare `/manage`, resolved from the
session. **The admin path's password is the remaining plaintext credential in an email.**

---

## 7. Can any of these touch a different truck or operator? — READ, NOT ASSUMED

| Path | Statement | Scope |
|---|---|---|
| `create-operator` | `trucks.update({operator_id}).eq('id', truckId)` `:78` | ✅ **one truck, by primary key** |
| `create-operator` | `operators.insert(...)` `:62` | ✅ INSERT only — cannot touch an existing row |
| `create-operator` | 🔴 `discovery_trucks.update({excluded:true}).ilike('name', …)` `:97` | ⚠️ **NOT id-scoped — matches by name, unbounded.** A **different table**, so no `trucks`/`operators` row is at risk, but it can update **more than one `discovery_trucks` row** |
| `/api/setup` | `trucks.update({operator_id, setup_step}).eq('id', result.truck.id)` `:117` | ✅ **the truck it just created** |
| `provisionTruck` | `trucks.insert` `:390`, `truck_vans.insert` `:485` | ✅ INSERT only |
| `provisionTruck` | 🔴 `deleteTruckCascade(supabase, truckId)` `:512` | ✅ **`truckId` is `created.id` (`:473`) — the truck it just inserted.** A compensating rollback when the van insert fails; it cannot name any other truck |
| `/api/admin` POST | `trucks.update(updates).eq('id', truckId)` `:93` | ⚠️ **one truck by id — but ANY truck the admin names.** Not a bug; it is the admin console. The risk is section 5b's stale-write, not cross-truck leakage |

✅ **Confirmed by reading: no path above can UPDATE or DELETE a `trucks` or `operators` row belonging to
a different truck.** Every mutation is either an INSERT or is `.eq('id', …)`-scoped to a row the caller
named or just created.

🔴 **The one unbounded write in the whole survey is `discovery_trucks` by name**, and for Tikka Tonic it
will match the existing row. **Pizzeria Gusto is untouched by every path here** unless an admin
explicitly opens its edit modal — and section 5b is why that is worth avoiding while it is trading.

---

## 8. INFERRED vs READ

**Read from source** (file:line given throughout): every route body, both auth blocks, the full `trucks`
insert literal, the van insert, the operator profile, the admin GET/POST handlers, the modal seed and
save, both email send sites, `HATCHGRAB_SENDER`, and the git state.

**INFERRED, and labelled as such above:**
- That `create-operator` with a bad `truckId` returns `ok: true` — inferred from the absence of a
  row-count check, not from a test run.
- That `hide_pricing` and `timezone` inherit DB defaults — inferred from their absence in the insert
  plus their presence as columns.

**Read from the live database** (one `SELECT` on Pizzeria Gusto, no write): `trucks` has **94 columns**;
`hide_pricing = true`, `timezone = null`, `cuisine_type = "Pizza"`, `plan = "trial"`,
`trial_expires_at = 2026-10-17T22:59:59+00:00`, `setup_step = null`.

**Not established:** which commit the running Vercel deployment was built from.
