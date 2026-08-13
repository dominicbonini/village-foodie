# Logo resolution, the cuisine list, `truck_emoji` and `qr_code_style`

Date: 13 August 2026
Status: READ-ONLY INVESTIGATION. **No file was changed, no row was written, no SQL was run, no
migration.** This report is the only file created. No `next dev`, no `next build`. Pizzeria Gusto was
not read or touched.

Nothing in the prompt arrived garbled. No instruction contradicted another.

---

## 0. 🔴 THE HEADLINE — TWO FINDINGS THAT BITE `tikka-tonic` SPECIFICALLY

1. **There is ONE resolver and FIVE bypasses.** `lib/truck-logo.ts` is a genuine shared resolver, used
   by four API routes — but every client-side logo render and the discovery events route reimplement the
   rule or ignore the fallback entirely.
2. 🔴 **The two branded-QR surfaces disagree, and `tikka-tonic` is exactly the case that exposes it.**
   The **dashboard** passes the *resolved* logo (so it falls back to the discovery logo and would render
   a branded QR); **Manage** reads `logo_storage_path` only (so it would render a QR with no centre
   logo, and shows a "No logo" chip). Same truck, same setting, two different outputs.

---

## 1. LOGO RESOLUTION

### a. Every site that resolves a truck logo for display

| # | Site | Reads | Falls back? |
|---|---|---|---|
| 1 | `app/api/dashboard/route.ts:627` | `resolveTruckLogo(supabase, truck.id, truck.logo_storage_path)` → served as `logo` at `:714` | ✅ **yes** |
| 2 | `app/api/menu/[truckId]/route.ts:644` | same call | ✅ **yes** |
| 3 | `app/api/manage/route.ts:164` | same call | ✅ **yes** |
| 4 | `app/api/orders/[id]/route.ts:89` | same call → `truck_logo` at `:119` | ✅ **yes** |
| 5 | 🔴 `app/api/discovery/events/route.ts:297-299` | **its own inline rule** — see below | ✅ yes, but reimplemented |
| 6 | 🔴 `app/manage/[token]/page.tsx:8244-8245` | `truck.logo_storage_path` **only** — the QR composite | ❌ **NO** |
| 7 | `app/manage/[token]/page.tsx:8524-8525` | `form.logo_storage_path` **only** — the Settings upload card | ❌ no (by design, see c) |
| 8 | 🔴 `app/manage/[token]/page.tsx:8950-8958` | `truck.logo_storage_path` **only** — the branded-QR radio's preview + "No logo" chip | ❌ **NO** |
| 9 | `app/manage/[token]/page.tsx:97-100` | `imgUrl(path)` — a local helper that builds a truck-media URL from a path | ❌ n/a (a formatter, not a resolver) |

**Site 5, quoted** — `app/api/discovery/events/route.ts:297-299`:

```ts
            logoUrl: truck?.logo_storage_path
              ? `${supabaseUrl}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
              : formatImageUrl(linked.logo_url || null, 'logos'),
```

⚠️ **That is `resolveTruckLogo`'s rule, written out by hand** — prefer the uploaded logo, else the linked
discovery logo. It reaches the discovery row through a batched `.in('hatchgrab_truck_id', opTruckIds)`
join at `:242-244` rather than the resolver's per-truck query, which is a legitimate performance reason
to differ — but the *rule* is duplicated, not shared.

### b. What AppHeader receives on Manage

**`truck.logo`, computed server-side by `resolveTruckLogo`.**

- `app/manage/[token]/page.tsx:559` — `truckLogoUrl={truck.logo ?? null}`
- `truck.logo` is set by `app/api/manage/route.ts:164`:
  ```ts
  const logo = await resolveTruckLogo(supabase, truck.id, truck.logo_storage_path)
  ```
  with the comment at `:162` making the split explicit: *"`logo_storage_path` stays raw on the truck for
  the Settings upload card (the operator's OWN logo)"* — so the row carries **both** the raw path and the
  resolved URL, and the header takes the resolved one.

✅ **So `tikka-tonic`'s Manage header WILL show the discovery logo.** Same on the dashboard:
`app/dashboard/[token]/page.tsx:2586` passes `truck?.logo`, resolved at `app/api/dashboard/route.ts:627`.

⚠️ `app/admin/page.tsx:717` passes `truckLogoUrl={null}` — the admin console has no truck.

### c. The Manage → Settings logo control

`app/manage/[token]/page.tsx:8519-8527`:

```tsx
      {/* Logo */}
      <Card className="p-4">
        <p className="text-base font-bold text-slate-800 mb-3">Logo</p>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
            {form.logo_storage_path
              ? <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${form.logo_storage_path}`} alt="" className="w-full h-full object-cover" />
              : <span className="text-3xl">🚚</span>
            }
          </div>
```

**It reads `form.logo_storage_path` — the operator's OWN uploaded logo — and renders a 🚚 placeholder
when there is none.** ⚠️ **This one is arguably correct as-is:** the card is the *upload* control, and
showing the discovery logo there would imply the operator had uploaded something they had not, and that
"Upload logo" would replace it. `api/manage/route.ts:162`'s comment says exactly this.

🔴 **But it means `tikka-tonic`'s operator sees a truck emoji in Settings while their header shows a real
logo.** That is confusing without being wrong, and worth knowing before they ask.

### d. Is `lib/truck-logo.ts` a shared resolver?

**Yes — a real one, with a documented contract.** `lib/truck-logo.ts:1-8`:

> *"Single source of truth for a truck's DISPLAY logo URL across every surface … Prefers the operator's
> own uploaded logo (truck-media bucket); when none, falls back to the linked Village Foodie discovery
> logo (`discovery_trucks.logo_url`) … The `discovery_trucks` query runs ONLY when `logo_storage_path` is
> null, so a truck WITH an uploaded logo incurs no extra query."*

```ts
export async function resolveTruckLogo(supabase, truckId, logoStoragePath): Promise<string | null> {
  if (logoStoragePath) {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoStoragePath}`
  }
  const { data: discoveryTruck } = await supabase
    .from('discovery_trucks').select('logo_url').eq('hatchgrab_truck_id', truckId).maybeSingle()
  return formatImageUrl(discoveryTruck?.logo_url ?? null, 'logos') || null
}
```

⚠️ **Note the join key: `hatchgrab_truck_id`.** The fallback only works for a **linked** row — which is
precisely what the promote flow now sets.

| Callers | Bypassers |
|---|---|
| `api/dashboard/route.ts:627` · `api/menu/[truckId]/route.ts:644` · `api/manage/route.ts:164` · `api/orders/[id]/route.ts:89` | `api/discovery/events/route.ts:297-299` (reimplements) · `manage/[token]/page.tsx:8244` (QR, no fallback) · `:8950` (QR preview, no fallback) · `:8524` (upload card, deliberate) · `:97-100` `imgUrl` (a formatter) |

### e. 🔴 One resolver, or several implementations? — **ONE RESOLVER, AND FOUR CLIENT-SIDE PLACES THAT DO NOT USE IT.**

Stated plainly:

- **Server-side, the rule is genuinely shared.** All four API routes call the one function.
- **Client-side, it is not shared at all.** Nothing in `app/manage/[token]/page.tsx` calls
  `resolveTruckLogo` — it cannot; the function takes a `SupabaseClient` and queries. So every client
  render either uses the already-resolved `truck.logo` (the header) or builds a truck-media URL from the
  raw path (the QR paths and the upload card).
- **`api/discovery/events/route.ts` is the one true duplicate:** a second, hand-written copy of the same
  rule, in a route that could have called the resolver but batches its join instead.

**Net: one resolver, one server-side reimplementation, and a client that has no access to either.**

---

## 2. CUISINE LIST

### a. Where it is defined — `lib/cuisines.ts:12-39`, quoted in full

```ts
/** The selectable cuisines, ALPHABETICAL, with "Other" last (it reveals a free-text field in the UI). */
export const CUISINES = [
  'Asian', 'BBQ', 'Bakery', 'Burgers', 'Caribbean', 'Chicken', 'Chinese', 'Coffee', 'Desserts',
  'Fish & Chips', 'Greek', 'Hot Dogs', 'Indian', 'Italian', 'Jacket Potatoes', 'Kebab', 'Korean',
  'Mexican', 'Pie & Mash', 'Pizza', 'Seafood', 'Tacos', 'Thai', 'Vegan', 'Wraps', 'Other',
] as const
```

(Reformatted to one block; in the file each entry is on its own line, `:13-38`.)

⚠️ **Storage format, `:7-9`:** *"cuisines are written to `trucks.cuisine_type` as a COMMA-JOINED string
(`"Pizza, Burgers"`). The live Village Foodie discovery filter splits that column on commas … Do not
change that format."*

### b. Shared constant, or local? — **A shared module, with exactly ONE consumer today.**

`lib/cuisines.ts` is a standalone module. Its only importer is
`components/DemoGetStarted.tsx:48`:

```ts
import { CUISINES, CUISINE_OTHER, emojiForCuisine } from '@/lib/cuisines'
```

⚠️ **Its own header admits the gap** (`:2-5`): *"shared by the signup wizard (`components/DemoGetStarted.tsx`)
and — **in a later diff** — Settings, whose cuisine input is currently free-text."* **That later diff has
not happened.**

### c. Does the admin create-truck modal use it? — **No. Free text.**

`app/admin/page.tsx`'s create modal renders `cuisineType` as a plain input; `CUISINES` is not imported
into that file (no match for `@/lib/cuisines`). **INFERRED from the absence of the import**, plus the
form shape (`NewTruckForm.cuisineType: string`).

**And Manage → Settings is free text too**, per the header comment above.

🔴 **So `tikka-tonic`'s cuisine came through as free text from the discovery row's `cuisine` column
(`'Indian'`), and by luck that string is an exact member of `CUISINES`** — so `emojiForCuisine('Indian')`
would resolve. Nothing checked that; it is a coincidence of the scraper and the list agreeing.

### d. Cuisine → emoji mapping — `lib/cuisines.ts:48-81`

```ts
export const CUISINE_EMOJI: Record<string, string> = {
  'Pizza': '🍕', 'Burgers': '🍔', 'Fish & Chips': '🍟', 'Chicken': '🍗', 'BBQ': '🍖', 'Kebab': '🥙',
  'Wraps': '🌯', 'Tacos': '🌮', 'Mexican': '🌮', 'Thai': '🍜', 'Indian': '🍛', 'Chinese': '🥡',
  'Asian': '🥢', 'Korean': '🍲', 'Caribbean': '🍹', 'Italian': '🍝', 'Greek': '🥗', 'Seafood': '🦞',
  'Hot Dogs': '🌭', 'Pie & Mash': '🥧', 'Jacket Potatoes': '🥔', 'Bakery': '🥐', 'Desserts': '🧁',
  'Coffee': '☕', 'Vegan': '🥗', 'Other': '🍽️',
}

export function emojiForCuisine(name: string | null | undefined): string {
  if (!name) return CUISINE_EMOJI['Other']
  return CUISINE_EMOJI[name.trim()] ?? CUISINE_EMOJI['Other']
}
```

**`'Indian' → 🍛`.**

---

## 3. `trucks.truck_emoji`

### a. Every write site

| Site | What it writes |
|---|---|
| `components/DemoGetStarted.tsx:591` | 🔴 **the only DERIVATION** — `truck_emoji: emojiForCuisine(resolvedCuisines[0])`, in the signup wizard |
| `app/manage/[token]/page.tsx:9931-9932` | the operator's manual picker — `setForm(...)` then `saveFormField({ truck_emoji: emoji })` |
| `app/api/manage/route.ts:798` | the `update_settings` allow-list entry that permits both of the above |

🔴 **Nothing derives it on the admin path.** `provisionTruck`'s insert does not write `truck_emoji`
(no match in `lib/provision-truck.ts`), and `/api/admin/create-truck` never sends it. **So the DB default
is the only source for an admin-created truck** — which is why `tikka-tonic` shows the pizza default
against an Indian cuisine.

⚠️ **INFERRED:** that the column's default is `'🍕'` — every read site falls back to `'🍕'` with
`|| '🍕'`, which is consistent with either a `'🍕'` default or a NULL. I did not read the column
definition.

**The fix, if you want one, is one field in Settings** — the operator's own picker at `:9931` — or
`update_settings { truck_emoji: '🍛' }`. It is on the allow-list.

### b. Every read site — where it actually appears

**To operators:**

| Site | Where |
|---|---|
| `app/manage/[token]/page.tsx:521` | 🔴 **the Menu tab's icon** in Manage's tab bar — `icon: truck?.truck_emoji \|\| '🍕'` |
| `app/manage/[token]/page.tsx:8556` | the emoji picker's current-value preview in Settings |
| `app/dashboard/[token]/page.tsx:3285` | a 4xl emoji on the dashboard (empty-state / header block) |
| `components/dashboard/OrderCard.tsx:889` | 🔴 **the "Ready" button label** on every order card — `` `${truck?.truck_emoji \|\| "🍕"} Ready` `` |

**To customers:**

| Site | Where |
|---|---|
| `app/api/webhooks/meta/whatsapp/route.ts:128` and `app/api/webhooks/whatsapp/route.ts:77` | passed as `truckEmoji` into the WhatsApp auto-reply classifier |
| `lib/whatsapp-classifier.ts:99, 198, 250, 277, 299, 375, 387, 396, 399` | 🔴 **the sign-off on every automated WhatsApp reply** — *"— {truckName} {truckEmoji}"*, and `:387` instructs the model that this is *"the ONLY food emoji … used once at the very end in the sign-off"* |

⚠️ **`app/api/dashboard/route.ts:728` serves it** (`truck_emoji: truck.truck_emoji ?? null`), which is
how the dashboard and OrderCard receive it.

🔴 **So the pizza default is not cosmetic for a customer-facing surface:** if `tikka-tonic` ever enables
WhatsApp auto-replies, every reply signs off *"— Tikka Tonic 🍕"*.

---

## 4. `trucks.qr_code_style`

### a. Write and read sites

**Writes:**

| Site | What |
|---|---|
| `app/manage/[token]/page.tsx:8929` | Standard radio → `saveSetting('qr_code_style', 'standard')` |
| `app/manage/[token]/page.tsx:8942` | Branded radio → `saveSetting('qr_code_style', 'branded')` |
| `app/api/manage/route.ts:854` | `update_truck`'s allow-list — the only server-side acceptor |

⚠️ **`provisionTruck` does not write it**; the column is `NOT NULL DEFAULT 'standard'`
(`page.tsx:8093`), so a new truck is Standard.

**Reads:**

| Site | What |
|---|---|
| `app/manage/[token]/page.tsx:8110-8116` | the radio's initial state, with a setup-only auto-select |
| `app/manage/[token]/page.tsx:8241` | the poster generator's branch |
| `app/dashboard/[token]/page.tsx:1246` | the fullscreen QR's branch |
| `app/dashboard/[token]/page.tsx:1145` | a cache-buster effect keyed on `truck?.logo` and `truck?.qr_code_style` |
| `app/api/dashboard/route.ts:727` | served as `(truck.qr_code_style ?? 'standard')` |

### b. 🔴 WHAT THE BRANDED COMPOSITE READS — AND THE TWO SURFACES DISAGREE

**Manage — `app/manage/[token]/page.tsx:8241-8246`:**

```tsx
      const showBrandedQr = can('branded_qr_code') && qrCodeStyle === 'branded'
      const dataUrl = await generateQRCodePNG({
        url: orderUrl,
        logoUrl: showBrandedQr && truck.logo_storage_path
          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${truck.logo_storage_path}`
          : null,
```

🔴 **`logo_storage_path` ONLY. No fallback.** A truck whose logo comes from the discovery row gets
`logoUrl: null`.

**Dashboard — `app/dashboard/[token]/page.tsx:1246-1252`:**

```tsx
      const showBrandedQr=hasFeature(truck.plan,'branded_qr_code')&&truck.qr_code_style==='branded'
      setQrFullscreenDataUrl(await generateQRWithLogo(
        orderUrl,
        showBrandedQr?truck.logo:null,
        600,
        isDemo?'Your logo here':null,
      ))
```

✅ **`truck.logo` — the RESOLVED url** from `api/dashboard/route.ts:627`, so **this one DOES fall back to
the discovery logo.**

**Answer: it depends which screen you are on.** Manage reads the raw path; the dashboard reads a resolved
URL. For `tikka-tonic` — `logo_storage_path` NULL, discovery logo present — **the dashboard's fullscreen
QR would carry the logo and Manage's printable poster would not.**

### c. `'branded'` with a NULL `logo_storage_path` — traced

**No error, no fallback to `'standard'`, and the stored value stays `'branded'`.**

- **Manage:** `logoUrl` is `null` → `generateQRCodePNG` reaches `lib/generateQRCode.ts:175`
  `if (logoUrl) { … }` → the branch is skipped → **a poster with a plain QR and no centre logo.** The
  surrounding poster (truck name, HatchGrab mark) still renders.
- **Dashboard:** `generateQRWithLogo` at `:72` — `if (!logoUrl && !placeholderText) return qrDataUrl` →
  **the plain QR is returned.** (For `tikka-tonic` this branch is not reached, because `truck.logo`
  resolves.)

**And the UI says so, honestly** — `page.tsx:8956-8958` renders a **"No logo"** amber chip beside the
Branded radio when `truck.logo_storage_path` is falsy. 🔴 **But that chip reads the raw path too**, so
`tikka-tonic` would be told "No logo" while its header displays one.

⚠️ **One more consequence:** the setup-only auto-select at `:8114` requires `truck.logo_storage_path`, so
a promoted truck is **never** auto-switched to Branded — correct here by accident rather than by design.

### d. Gating — and 🔴 the two surfaces use DIFFERENT functions

| Surface | Gate |
|---|---|
| Manage (`:8113`, `:8241`) | **`canAccess(truck.plan, 'branded_qr_code', truck.feature_overrides ?? {}, truck.trial_expires_at ?? null)`** |
| Dashboard (`:1246`) | 🔴 **`hasFeature(truck.plan, 'branded_qr_code')`** |

`'branded_qr_code'` is in `MAX_FEATURES` (`lib/features.ts:48`), and `TRIAL_FEATURES = [...MAX_FEATURES]`,
so a trial holds it.

**What an EXPIRED trial gets:**

- **Manage → `canAccess`**: `if (new Date(trialExpiresAt) <= new Date()) return false` → **branded is
  refused.** The radio renders disabled (`:8939` `can('branded_qr_code') ? … : …`, with an upsell at
  `:8969`), and `showBrandedQr` is false so the poster is plain.
- **Dashboard → `hasFeature`**: that function takes **no expiry argument** and, for `plan === 'trial'`,
  returns `PLAN_FEATURES.trial.has(feature)` → **`true`**. 🔴 **So an expired trial still gets a branded
  fullscreen QR on the dashboard.**

**Net: an expired trial is refused branded QR in Manage and granted it on the dashboard.** It also
ignores `feature_overrides` there, so a per-truck override cannot switch it off either.

⚠️ **Not a new bug introduced by anything here** — `hasFeature`'s own docstring says callers with expiry
context should use `hasFeatureWithContext`. **INFERRED** that this call site simply predates that advice.

---

## 5. READ vs INFERRED

**Read from source:** `lib/truck-logo.ts` in full; all four resolver call sites; all five bypasses; the
Manage header and Settings logo card; `lib/cuisines.ts` in full; every `truck_emoji` write and read
including the WhatsApp classifier's sign-offs; every `qr_code_style` write and read; both QR composite
call sites; `generateQRCode.ts`'s null-logo branches; both gate expressions; the setup-only auto-select.

**INFERRED, labelled in place:** that `trucks.truck_emoji`'s DB default is `'🍕'` (every read falls back
to it, so a NULL is indistinguishable); that the admin modal's cuisine is free text (from the absent
import plus the form's `string` type); that the dashboard's `hasFeature` call predates
`hasFeatureWithContext`.

**Not established:** the `truck_emoji` column definition; whether any of the QR divergences have been
observed in practice.
