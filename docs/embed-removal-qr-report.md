# Embed removal, move-and-reword, dynamic QR — STOPPED AT STEP ONE

**WHICH OF THE THREE I PERFORMED: A PARSE.** No typecheck, no execution. **Step One is a read, it
produced its stop condition, and I stopped there — so nothing was built to verify.** Every claim below
is a quotation from a file on disk.

🔴 **NOTHING IN THIS WORKSTREAM WAS CHANGED. No column dropped, no migration written, no deploy, no
component removed, and no part of A, B or C implemented.**

⚠️ **ONE UNRELATED EDIT WAS MADE IN THE SAME SESSION, ON A SEPARATE REQUEST, AND IS RECORDED HERE SO
THIS REPORT STAYS TRUE:** a `Coming soon` badge was added beside the **Auto-replies** card title in
`app/manage/[token]/page.tsx:9305-9312`. It is one hunk, `tsc --noEmit` exits 0, and it touches nothing
this workstream concerns — not the embed path, not the custom-domain path, not the QR code.

**Nothing in the prompt arrived garbled.**

---

## 🔴 THE STOP — the instruction is contradictory, and this is the check you built to catch it

You wrote:

> 🔴 whether anything on the custom-domain path reads `embed_enabled`. **If it does, STOP AND SAY SO** —
> removing the wizard would leave nothing able to set it.

**It does.** Traced end to end:

```
app/domain/page.tsx:179          <EmbedSchedule slug={truck.slug ?? ''} truckName={truck.name} orderOrigin={HATCHGRAB_URL} />
        ↓
app/embed/[slug]/EmbedSchedule.tsx:38    fetch(`/api/embed/events?slug=${encodeURIComponent(slug)}`)
        ↓
app/api/embed/events/route.ts:50         .select('id, name, slug, active, embed_enabled, order_link_hg')
app/api/embed/events/route.ts:63         if (!truck || !truck.active || !truck.embed_enabled) {
app/api/embed/events/route.ts:64           return NextResponse.json({ events: [] }, { headers: CACHE_HEADERS })
```

**The custom-domain page's entire schedule body is `EmbedSchedule`, and its only data source refuses
unless `embed_enabled` is true.**

### Why removal breaks it, and the exact mechanism

1. `trucks.embed_enabled` is **`NOT NULL DEFAULT false`** —
   `supabase/migrations/20260826_trucks_embed_enabled.sql:22`.
2. **The only writer in the codebase is `save_embed_setup`**, `app/api/manage/route.ts:920`:
   ```ts
   const patch: { embed_enabled: boolean; website?: string; embed_plan_answer?: string } = { embed_enabled: enabled }
   ```
   Its own header at `:902` says *"This handler writes `website`, `embed_enabled` and NOTHING ELSE."*
3. **The only caller of that action is `EmbedWizard`** — `components/dashboard/EmbedWizard.tsx:111` and
   `:215`.
4. Part A removes **both** — *"the embed API actions"* and *"the embed wizard component and its mount"*.

🔴 **AFTER PART A, `embed_enabled` IS `false` FOR EVERY TRUCK AND NOTHING IN THE CODEBASE CAN EVER SET
IT TRUE AGAIN.** Since you have — correctly — forbidden dropping the column, it would sit there
permanently false, and `/api/embed/events` would return `{ events: [] }` for every custom domain.

### 🔴 AND THE FAILURE IS SILENT, WHICH IS THE WORST PART

`app/domain/page.tsx` does **not** read `embed_enabled` itself. Its gate at `:144` is the plan check,
and its select at `:64` does not name the column. So the page **passes every check it makes, renders its
shell, the truck's name and logo, and "Powered by HatchGrab" — and an empty schedule, for ever.**

⚠️ **Your own verification requirement lands exactly on it:** *"prove the custom-domain page still
renders after the removal, on a custom host, for a truck with no embed columns set."* It **renders**.
It just has nothing in it. A test written to that wording would have passed while the feature was dead.
That is the shape this stop exists to catch, and it is why I did not proceed and then report it after.

### The contradiction, stated plainly

> **PART A** says remove the embed API actions and the wizard.
> **KEEP** says keep *"the schedule page and every shared component the custom-domain path renders"* and
> the custom-domain wizard working.
>
> **Both cannot hold.** The component the custom-domain path renders is fed by an endpoint gated on a
> column whose only setter is in the set being removed.

---

## 1. THE DEPENDENCY MAP (Step One, complete)

### What the custom-domain serving path renders

`app/domain/page.tsx`, in render order:

| Line | Renders | From |
|---|---|---|
| `:158`/`:174` | `<Shell>` | `components/embed/EmbedParts.tsx` |
| `:159`/`:175` | `<TruckIdentity name logoPath>` | `components/embed/EmbedParts.tsx` |
| `:179` | `<EmbedSchedule slug truckName orderOrigin>` | **`app/embed/[slug]/EmbedSchedule.tsx`** |
| `:168`/`:180` | `<PoweredBy>` | `components/embed/EmbedParts.tsx` |

Its imports, `:1-9`:

```ts
import { canAccess } from '@/lib/features'
import { createSlug } from '@/lib/utils'
import { hostKey } from '@/lib/custom-host'
import { Shell, TruckIdentity, PoweredBy, truckLogoUrl } from '@/components/embed/EmbedParts'
import EmbedSchedule from '@/app/embed/[slug]/EmbedSchedule'
```

Its truck query, `:64` — note what is **not** there:

```ts
.select('id, name, slug, logo_storage_path, plan, feature_overrides, trial_expires_at, active, custom_domain, custom_domain_verified_at')
```

**No `embed_enabled`.** Which is exactly why the breakage is invisible at this layer.

### Full dependency set

| Dependency | Kind | Removable under Part A? |
|---|---|---|
| `components/embed/EmbedParts.tsx` | shared components | ❌ KEEP (named in your KEEP list) |
| `app/embed/[slug]/EmbedSchedule.tsx` | shared component **living in the embed route folder** | ❌ KEEP |
| **`app/api/embed/events/route.ts`** | **data endpoint — the whole schedule body** | 🔴 **KEEP, and it is the blocker** |
| `lib/custom-host.ts`, `lib/features.ts`, `lib/utils.ts` | helpers | ❌ KEEP |
| `components/TruckListCard.tsx` | rendered by `EmbedSchedule` | ❌ KEEP |

### Does it depend on the `/embed/[slug]` route itself?

**No — and the distinction matters for scoping.** That folder holds two files:

```
app/embed/[slug]/EmbedSchedule.tsx   ← a COMPONENT the custom-domain page imports
app/embed/[slug]/page.tsx            ← the ROUTE
```

✅ **`app/embed/[slug]/page.tsx` (the public iframe route) can be deleted without touching the
custom-domain path.** Nothing imports it.
🔴 **`app/embed/[slug]/EmbedSchedule.tsx` cannot** — it is imported at `app/domain/page.tsx:9`. It sits
in the embed folder by history, not by dependency, and a removal that treated the folder as one unit
would take it out.
🔴 **`app/api/embed/events/route.ts` cannot either** — it is the schedule data for the custom domain.

### The load stamp — safe, and this one is clean

✅ **Nothing on the custom-domain path uses it.** Every reference to `embed_last_seen_at` is in
`app/embed/[slug]/page.tsx` (`:66`, `:86-91`, `:123-125`, `:139`, `:164`) plus one read-back in
`get_embed_status` (`app/api/manage/route.ts:961`). `app/domain/page.tsx` neither selects nor writes it.
**Part A's conditional — *"IF nothing on the custom-domain path uses it"* — is satisfied.**

---

## 2. WHAT I DID NOT DO

Nothing in Parts A, B or C was implemented.

⚠️ **Parts B and C are NOT blocked by this** — Part B moves and rewords the custom-domain card, Part C is
the QR redirect, and neither touches the embed removal. **I did not start them anyway**, because your
standing instruction is to stop and ask rather than choose, and a partial delivery would have left you
reading a report about work whose scope may change. **Say the word and I will do B and C immediately,
with or without a resolution to A.**

---

## 3. PART C — THE READ YOU ASKED FOR BEFORE ANY CHANGE

### How QR codes are generated today

| | |
|---|---|
| **Generator** | `lib/generateQRCode.ts` — `generateQRCodePNG()` at `:135`, `generateQRWithLogo()` at `:58` |
| **Library** | `qrcode`, via `QRCode.toDataURL(url, …)` at `:64` and `:141` |
| **Error correction** | `errorCorrectionLevel: 'H'` (`:68`, `:145`) — the highest, which is what allows a logo to be composited into the centre |
| **Output** | a PNG data URL (`canvas.toDataURL('image/png')`, `:132`, `:229`) |
| **Trigger** | `handleGenerateQR`, `app/manage/[token]/page.tsx:8785`, dynamically importing the generator at `:8789` |
| **Branded variant** | `const showBrandedQr = can('branded_qr_code') && qrCodeStyle === 'branded'` (`:8790`) — a Pro+ feature that changes only the **image**, never the URL |

### 🔴 The URL it encodes — one construction, one shape

`app/manage/[token]/page.tsx:8772-8774`:

```ts
  const orderUrl = truck.slug
    ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`
    : null
```

…passed straight through at `:8791-8792`:

```ts
      const dataUrl = await generateQRCodePNG({
        url: orderUrl,
```

and displayed beneath the code at `:9707` (`<p …>{orderUrl}</p>`).

The dashboard builds the same shape independently at `app/dashboard/[token]/page.tsx:1441`:

```ts
  const customerOrderUrl = truck?.slug ? `${customerUrlBase}/trucks/${truck.slug}/order` : null
```

✅ **THE ENCODED URL IS ALREADY A PERMANENT hatchgrab.com URL AND CONTAINS NOTHING TRUCK-SPECIFIC BEYOND
THE SLUG.** It has no notion of a custom domain and never had. **So Part C's hard requirement — that the
encoded URL must not change when a truck gets a domain — is satisfied by the code as it stands**, and
the work is entirely on the *serving* side of `/trucks/[slug]/order`, plus the QR settings copy.

⚠️ **Two constructions of the same URL exist** (manage `:8772`, dashboard `:1441`) with different base
variables (`NEXT_PUBLIC_HATCHGRAB_URL` vs `customerUrlBase`). **Only the manage one feeds the QR
generator.** Flagged because a Part C change that touched the URL shape would need both, and because
they are a drift pair.

---

## 4. WHAT WOULD RESOLVE THE STOP — options, not a choice

I am not choosing between these; each has a different blast radius and one of them is a live-surface
decision.

| Option | What it means | Cost / risk |
|---|---|---|
| **A. Stop gating `/api/embed/events` on `embed_enabled`** | Delete `&& !truck.embed_enabled` from `:63`. The page-level gate in `app/embed/[slug]/page.tsx:172` still exists for the iframe route, which is being removed anyway. | Smallest change. ⚠️ It makes every active truck's schedule readable at that endpoint by slug — currently opt-in. That is a **public-surface** decision. |
| **B. Give the custom-domain path its own data endpoint** | Copy `/api/embed/events` to a domain-specific route gated on `custom_domain_verified_at` instead. | No public widening. ⚠️ Two near-identical endpoints — the duplication the manual's DRY section exists to prevent, and the two would drift. |
| **C. Keep a minimal writer for `embed_enabled`** | Remove the wizard and the platform machinery, keep `save_embed_setup` (or set the column true on custom-domain provisioning). | Keeps the column meaningful. ⚠️ Leaves an action Part A asked to remove, and couples two features you deliberately separated (`20260827_trucks_custom_domain.sql:9-10` says so explicitly). |
| **D. Narrow Part A** | Remove the operator-facing wizard, platform records, detection, picker, plan-requirement screen, escape-hatch email and the load stamp — **but keep `save_embed_setup`, `get_embed_status` and the events endpoint as internal plumbing.** | Delivers the intent (the iframe path disappears from the operator's view) with no serving-path risk. ⚠️ Leaves code with no UI, which needs a comment saying why. |

🔴 **I have a view and it is only a view: D is the smallest change that satisfies the intent without
either widening a public endpoint or duplicating one.** But *"the embed API actions"* is explicitly on
your removal list, so narrowing it is your call, not mine.

---

## 5. What remains unobserved

1. **Nothing was executed and nothing was typechecked** — Step One stopped the work before there was
   anything to check.
2. **Nothing was rendered.** The claim that the custom-domain page would show an empty schedule after
   removal is traced through four files; **no page was loaded and no request was made.**
3. **I did not verify the runtime value of `embed_enabled` for any real truck.** The migration declares
   `NOT NULL DEFAULT false`; whether any live row has been set true is a database question and **no SQL
   was run.**
4. **I did not audit `/api/embed/events` for other callers.** `EmbedSchedule` and the iframe route are
   the two I traced; a third consumer would change option A's blast radius.
5. **Parts B and C were read, not built.** The Part C read is §3; the plain-English checker was not run,
   because no copy was changed.
6. **No column was dropped, no migration written, nothing deployed.** Six migrations remain unapplied,
   unchanged by this workstream.
