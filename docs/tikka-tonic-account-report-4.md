# Account-creation investigation, part 4 — the commit guard, and what Manage can actually set

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no SQL was run, no
migration.** This report is the only file created. No `next dev`, no `next build`. Pizzeria Gusto was
not read or touched.

Follows reports 1-3. Nothing from them is repeated.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE HEADLINE — AND A CORRECTION TO PART 3

**The deciding question resolves in your favour: an admin-created truck CAN import a menu normally.**

Part 3 said, marked INFERRED: *"an admin-created truck with `setup_step = null` may therefore be
ineligible for that path."* **That inference was wrong, and I am correcting it here rather than leaving
it standing.** The guard is not on the commit — it is on an *optional flag* the operator import never
sends. Section 1.

Two other results worth having up front:

- ✅ **`allergen_display_mode`, `contact_phone`, `whatsapp`, `phone_is_whatsapp` and `kitchen_capacity`
  are all settable from Manage after the fact.** The admin path's gaps are all repairable in the UI.
- 🔴 **`EMAIL_FROM_ADDRESS` is absent from `.env.local`**, so signup emails send from an address the
  code itself calls unverified — and the send failure is swallowed, so signup returns `ok: true` with no
  email delivered and nothing surfaced. Section 5.

---

## 1. THE DECIDING QUESTION — `commit-menu`'s setup guard

### a. The guard, verbatim with its surroundings

`app/api/manage/commit-menu/route.ts:28-47`:

```ts
  // ── CLEAR-BEFORE-RETRY (opt-in; default OFF so the operator path is byte-identical) ──────────────
  // commitMenu is neither transactional nor idempotent, so committing twice APPENDS — which is correct
  // for the operator "import more items" flow, but wrong for the demo→real MIGRATION, where a retry after
  // a partial commit must repair, not duplicate. The migration passes clearFirst:true; the operator import
  // never sets it. Guarded to setup-mode trucks so it can never wipe a live menu: setup_step present and
  // not 'done' means the truck is still being built and has no real service to protect.
  if (clearFirst === true) {
    const { data: t } = await supabase.from('trucks').select('setup_step').eq('id', truck.id).single()
    const inSetup = t?.setup_step != null && t.setup_step !== 'done'
    if (!inSetup) {
      return NextResponse.json({ error: 'clearFirst is only permitted on a truck still in setup.' }, { status: 400 })
    }
    // clearMenu deletes exactly what commitMenu writes (items + groups→options/links + categories), in the
    // module that owns that graph — not reconstructed here from partial FK knowledge.
    try {
      await clearMenu(supabase, truck.id)
    } catch (e) {
      return NextResponse.json({ error: `Could not clear the previous attempt: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 500 })
    }
  }
```

### b. 🔴 FOR A TRUCK WITH `setup_step = null`, THE GUARD IS NEVER REACHED. THE COMMIT PROCEEDS.

**Plainly: it does not fail. The menu imports.**

The guard sits **inside `if (clearFirst === true)`** (`:34`). `clearFirst` arrives from the request body
(`:18`), and the client computes it as `demoImportMode`
(`app/manage/[token]/page.tsx:3302`):

```tsx
body: JSON.stringify({ token, categories: importResult.categories, items: itemsToCommit, categoryPrep, clearFirst: demoImportMode }),
```

`demoImportMode` is `inSetup`, defined at `app/manage/[token]/page.tsx:2748`:

```tsx
const inSetup = truck.setup_step != null && truck.setup_step !== 'done'
```

with the comment at `:2743-2747` stating the intent exactly:

> *"Condition matches commit-menu (:35-36) EXACTLY … 🔴 Every setup-only UI change below is gated on
> this — an existing operator (Gusto: setup_step NULL) hits none of them, so their import is
> byte-for-byte today's."*

**So for `setup_step = null`: `inSetup` → `false` → `clearFirst: false` → `:34` is false → the entire
block is skipped → `commitMenu` runs at `:58`.**

⚠️ **Tikka Tonic would be in exactly the same position as Pizzeria Gusto**, whose `setup_step` is also
`null` and which imports menus normally. That is the strongest possible evidence: **the live trading
truck already exercises this path every time it imports.**

### c. Other paths that can commit an imported menu — for completeness

The question was conditional on (b) failing, and it does not. Listed anyway, since the answer is short:

| Path | Notes |
|---|---|
| `app/api/manage/commit-menu/route.ts:58` | the HTTP route — **works for `setup_step = null`** |
| `lib/menu-commit.ts` → `commitMenu()` | the logic itself; the route is *"a thin HTTP wrapper"* (`:1-4`) |
| `lib/provision-demo.ts:352` | calls `commitMenu` **directly, server-side**, bypassing the route entirely — *"so the server-side demo provisioner can call it directly instead of self-fetching this route"* |

**No path is blocked for an admin-created truck.**

### d. What a `clearFirst` failure would look like

Only reachable by forcing `clearFirst: true` on a truck not in setup — which the UI cannot do, since it
derives the flag from the same condition.

- **HTTP 400**, body `{ error: 'clearFirst is only permitted on a truck still in setup.' }` (`:38`).
- **What the wizard renders: INFERRED.** `app/manage/[token]/page.tsx:3359-3361` notes commit-menu *"is
  NON-TRANSACTIONAL and can return ok:false AFTER a partial write, so the copy…"* and `:3355` that the
  operator *"never learns to retry (so clearFirst's retry path never runs)"*. I read the call site and
  the comments but did not trace the error branch's rendered output.

---

## 2. `allergen_display_mode` outside the wizard — ✅ YES, IT CAN BE SET

**Two write sites, and they share one API action.**

| Site | Context |
|---|---|
| `app/manage/[token]/page.tsx:3333` | the **import wizard's commit** — `if (chosenDisplayMode) { await api('update_settings', { allergen_display_mode: chosenDisplayMode }) }` |
| 🔴 `app/manage/[token]/page.tsx:4125` | the **Allergen wizard modal**, `onSetDisplayMode={async (m) => { await api('update_settings', { allergen_display_mode: m }) }}` |

The second is **not** part of the import wizard. Its own comment (`:4106-4109`) says it is *"opened from
the 'allergens not set' banners"* and that *"The chosen display mode is persisted to
`trucks.allergen_display_mode`"* — a standalone allergen flow reachable at any time.

**And the column is on the `update_settings` allow-list** — `app/api/manage/route.ts:798`:

```ts
'website', 'allergen_info_url', 'allergen_info_text', 'allergen_display_mode', 'truck_emoji',
```

⚠️ **It is permission-gated, not open.** `:813-815`: `ALLERGEN_SETTING_KEYS` includes it, and a change
by a non-owner/non-admin returns `ALLERGEN_FORBIDDEN`. An owner is fine.

**So the part-3 finding stands but is fixable in the UI:** the admin path leaves it `null` and the
customer menu hides unverified items until it is set — but the operator can set it themselves from the
allergen banner without touching the import wizard.

---

## 3. `kitchen_capacity` for a single-van truck — ✅ YES, SETTABLE

**The `vans.length > 1` gate does not hide the van UI. It hides one button.**

`app/manage/[token]/page.tsx:9496-9518` renders **one block per van, unconditionally**:

```tsx
{vans.map(van => (
  <div key={van.id} className="mt-4 border border-slate-200 rounded-2xl p-4">
    …
    <span className="text-base font-bold text-slate-900">{van.name}</span>
    …
      <button onClick={() => { setRenamingVanId(van.id); setRenameVanName(van.name) }}>Rename</button>
      {vans.length > 1 && (
        <button onClick={() => setDeletingVan(van)} …>Delete</button>
      )}
```

🔴 **The `vans.length > 1` gate at `:9509` wraps only the Delete button** — sensibly, since a truck must
keep at least one van. Everything else in the block renders for a single-van truck.

**The capacity control lives inside that same per-van block**, `:9659-9683`:

```tsx
{/* Kitchen capacity — ONE aligned grid … Writes unchanged: … updateVanSetting (kitchen_capacity / capacity_window_mins). */}
<div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
  <p className={`${SUBCARD_HEADING} mb-3`}>Kitchen capacity</p>
  …
  const hasCap = van.kitchen_capacity != null
```

and writes through `updateVanSetting` (`:8439-8446`):

```tsx
const updateVanSetting = async (
  vanId: string,
  field: 'show_cooking_step' | 'auto_pause_on_offline' | 'order_ready_enabled' | 'kitchen_capacity' | 'capacity_window_mins' | 'buzzer_count',
  value: boolean | number | null
) => {
  setVans(prev => prev.map(v => v.id === vanId ? { ...v, [field]: value } : v))
  await api('update_van_settings', { vanId, [field]: value })
}
```

⚠️ **Every `vans.length > 1` occurrence in the file was checked** (17 sites): they gate the Delete
button, event-form van pickers, a schedule table column, and invite van-assignment. **None gates the
capacity control.**

**So the part-2 finding — `/api/setup` provisions `kitchen_capacity: null`, leaving the capacity engine
inert — is repairable from Settings → Kitchen capacity without adding a second van.**

---

## 4. Contact fields via Manage → Settings

Checked against `update_settings`'s allow-list, `app/api/manage/route.ts:795-804`:

```ts
const ALLOWED = [
  'name', 'description', 'cuisine_type', 'contact_email', 'contact_phone',
  'social_instagram', 'social_facebook', 'auto_accept', 'notes_require_review', 'logo_storage_path',
  'website', 'allergen_info_url', 'allergen_info_text', 'allergen_display_mode', 'truck_emoji',
  // Customer-facing WhatsApp (the phone number, when the operator ticks "this number is on
  // WhatsApp") + the tick flag. SEPARATE from whatsapp_sender (Auto-replies/Connect) — not written here.
  'whatsapp', 'phone_is_whatsapp',
  'sound_config',
]
```

| Column | On `update_settings`? |
|---|---|
| `contact_phone` | ✅ **YES** — `:796` |
| `whatsapp` | ✅ **YES** — `:801` |
| `phone_is_whatsapp` | ✅ **YES** — `:801` |
| 🔴 `preferred_contact_method` | ❌ **NO — absent from this list** |

🔴 **`preferred_contact_method` is writable, but through a DIFFERENT action.** It is on
`update_truck`'s allow-list, `app/api/manage/route.ts:854`:

```ts
if (action === 'update_truck') {
  const allowed = ['crew_mode', 'kds_mode', 'display_mode', 'extra_wait_mins', 'paused_until', 'whatsapp_sender', 'preferred_contact_method', …]
```

⚠️ **Both are reachable from Manage**, so the practical answer is **yes, all four can be set** — but not
through one save. **INFERRED** that the Settings UI wires a control to `update_truck` for it; I
confirmed the server accepts it and did not trace the specific input.

⚠️ **Silent-drop hazard, stated because it bites here:** both handlers filter by allow-list
(`:805-807`, `:855-857`), so a key sent to the wrong action is **dropped without an error**. Sending
`preferred_contact_method` to `update_settings` returns 200 and writes nothing.

---

## 5. `EMAIL_FROM_ADDRESS`

### a. Every reference

| Site | Use |
|---|---|
| `lib/email-signup.ts:33` | `const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS \|\| HATCHGRAB_REPLY_TO` → falls back to **`hello@hatchgrab.com`** |
| `lib/email-signup.ts:28-31` | the warning comment |
| `lib/email.ts:553` | `process.env.EMAIL_FROM_ADDRESS \|\| 'donotreply@villagefoodie.co.uk'` |
| `app/api/dashboard/action/route.ts:148` | `process.env.EMAIL_FROM_ADDRESS \|\| 'donotreply@villagefoodie.co.uk'` |
| `docs/signup-email-report.md:169-176`, `docs/tikka-tonic-account-report.md:339-346` | documentation |

🔴 **`grep -c "^EMAIL_FROM_ADDRESS=" .env.local` returns 0 — the variable is ABSENT locally.** Whether
it is set in Vercel is not visible from here (**INFERRED risk, not a confirmed fault**).

⚠️ **Three consumers, two different fallbacks.** `lib/email.ts` and the dashboard action fall back to
`donotreply@villagefoodie.co.uk` — a verified domain. `lib/email-signup.ts` deliberately does **not**,
per its own comment at `:29-31`:

> *"🔴 The fallback is DELIBERATELY NOT villagefoodie.co.uk. With `EMAIL_FROM_ADDRESS` unset these two
> emails send from an as-yet-unverified domain and Brevo will reject them — see the report."*

**So with the variable unset, order emails still send and signup emails do not.**

### b. 🔴 THE SEND RESULT IS CHECKED, BUT ONLY TO LOG IT — SIGNUP CONTINUES REGARDLESS

`lib/email-signup.ts:100-126`:

```ts
async function send(params: …): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.warn('[email-signup] BREVO_API_KEY not set — skipping email')
    return
  }
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', { … signal: AbortSignal.timeout(8_000) })
    if (!res.ok) console.error('[email-signup] Brevo send failed:', res.status, await res.text())
  } catch (err) {
    console.error('[email-signup] send error:', err)
    // Never throw.
  }
}
```

- **Checked?** Yes — `if (!res.ok)` at `:120`.
- **What happens on failure?** `console.error` and nothing else. `send` returns `void`; it **cannot**
  signal failure to its caller.

And the caller, `app/api/signup/route.ts:216-231`:

```ts
    // Never throws — email failure must not fail signup. The welcome email is NOT sent here; it goes
    // out when this link is clicked (/api/auth/verify-signup).
    await sendSignupVerificationEmail({ … })
  }

  return NextResponse.json({ ok: true, operatorId: operator.id })
```

**Answer: BEST-EFFORT. Signup does not hard-fail and does not roll back.** The operator row, the auth
user and the verification row all persist; `:231` returns `{ ok: true }` unconditionally.

🔴 **The failure mode, spelled out.** With `EMAIL_FROM_ADDRESS` unset, `FROM_ADDRESS` is
`hello@hatchgrab.com`, which the code itself says Brevo will reject. Brevo answers non-2xx → `:120`
logs it → `send` returns → signup returns `ok: true`. **The operator sees a successful signup, never
receives the verification email, and cannot proceed** — because the welcome email and the account's
activation both hang off clicking that link (`verify-signup`). Nothing surfaces the failure except a
server log.

⚠️ **This affects the SELF-SERVE path only.** `/api/admin/create-operator` hand-rolls its own Brevo call
with `HATCHGRAB_SENDER` (`hello@villagefoodie.co.uk`, verified) and does not read
`EMAIL_FROM_ADDRESS` — so the admin path is unaffected. **For Tikka Tonic via the admin route, this is
not a risk.**

---

## 6. READ vs INFERRED

**Read from source:** the full `clearFirst` block and its call site, `demoImportMode`'s definition, every
`commitMenu` entry point, both `allergen_display_mode` write sites, `update_settings`' and
`update_truck`'s allow-lists, all 17 `vans.length` sites, the per-van Settings block and
`updateVanSetting`, every `EMAIL_FROM_ADDRESS` reference, `send()`'s error path, and `/api/signup`'s
return.

**INFERRED, labelled in place:** what the import wizard renders on a `clearFirst` 400; that a Settings
control wires `preferred_contact_method` to `update_truck`; whether `EMAIL_FROM_ADDRESS` is set in
Vercel.

**Corrected from part 3:** the claim that an admin-created truck may be ineligible for `commit-menu`.
**It is eligible.** Section 1b.
