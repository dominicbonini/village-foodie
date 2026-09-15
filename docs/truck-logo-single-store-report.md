# Truck logos: why Pig-Casso's logo shows in one place and not the others, and how to get to one store

**15 September 2026. INVESTIGATION ONLY — no code changed.** Written to be reviewed without the
repository open: every claim below is quoted from the file it comes from, and marked **READ** (quoted
from source) or **INFERRED** (reasoned, not directly observed).

---

## 1. The short version

There are **two independent pointers to the same storage bucket**, and they are synchronised **once,
at the moment a truck is provisioned, and never again.**

| | Column | Holds | Written by | Read by |
|---|---|---|---|---|
| **Prospect logo** | `discovery_trucks.logo_url` | a **full URL** | the outreach admin's drag-and-drop; the scraper | the outreach list **and** the outreach modal |
| **Truck logo** | `trucks.logo_storage_path` | a **bucket path** | the operator's Settings page; demo onboarding; `copyDemoLogo` **at provision time only** | `resolveTruckLogo` → manage header, operator dashboard, customer order page, order confirmation |

Both point into the **same bucket**, `truck-media`. The files are already in one place. **It is the
pointer that is duplicated**, and that is the whole defect.

Changing the logo through the outreach admin after the truck already exists writes
`discovery_trucks.logo_url` and nothing else. The manage page reads the other column, finds it empty, and
shows the "Upload logo" placeholder. That is screenshot 3, fully explained.

---

## 2. The evidence

### 2.1 The outreach admin writes only the discovery column — READ

`app/api/admin/outreach/route.ts`:

```ts
const MEDIA_COLUMN: Record<string, 'logo_url' | 'photo_url'> = { logo: 'logo_url', photo: 'photo_url' }
...
  .from('discovery_trucks').update({ [column]: publicUrl }).eq('id', truckId)
```

The upload resolves the prospect to its `discovery_truck_id` and updates `discovery_trucks`. **It never
touches `trucks`.**

### 2.2 The manage page reads only the truck column — READ

`lib/truck-logo.ts`, in full:

```ts
export async function resolveTruckLogo(
  _supabase: SupabaseClient, _truckId: string, logoStoragePath: string | null
): Promise<string | null> {
  if (!logoStoragePath) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/truck-media/${logoStoragePath}`
}
```

Four call sites — `/api/manage`, `/api/dashboard`, `/api/menu/[truckId]`, `/api/orders/[id]` — all pass
`truck.logo_storage_path`. **Null path, null logo. No fallback.**

🔴 **That absence is deliberate and must not be casually undone.** The file's own header:

> There used to be a fallback here: when `logo_storage_path` was null this queried
> `discovery_trucks.logo_url` … That made REMOVAL IMPOSSIBLE TO SEE — an operator who cleared the logo in
> Settings watched the header keep showing one … "Removed" and "never uploaded" are the same row, so no
> fallback can honour both.

**Any fix that re-adds a fallback re-breaks a bug that was already fixed.** This is the landmine in the
whole area.

### 2.3 The two are copied exactly once — READ

`app/api/admin/provision-demo/route.ts` reads `discovery_trucks.logo_url` server-side and passes it to
`provisionDemo`, which calls `copyDemoLogo` (`lib/demo-logo.ts`). That function ends:

```ts
const { error: dbErr } = await supabase.from('trucks')
  .update({ logo_storage_path: objectPath }).eq('id', truckId)
```

**This is the only code path that moves a logo from the discovery side to the truck side, and it runs
only during provisioning.** There is no later sync, no trigger, and no job. *(Absence claim: searched the
whole repo, excluding `node_modules`/`.next`/`.git`, for every writer of `logo_storage_path`. The
complete set is the operator's Settings page, `DemoGetStarted`, and `copyDemoLogo`. Positive control: the
same search finds all three writers of the other column, so it does detect writes.)*

**INFERRED, and the likely history for Pig-Casso's:** the truck was provisioned first, the outreach logo
was set afterwards, so the copy never ran with the new value.

### 2.4 🔴 A documented assumption in the code is contradicted by this very truck

`app/api/admin/outreach/route.ts`, in the media-delete guard:

> ⚠️ **PHOTO ONLY.** The logo has the same fallback shape but `logo_storage_path` **is set on every linked
> truck that is public**, so the discovery logo is not a live source for any of them. **No logo refusal.**

Pig-Casso's is a **linked** truck — it has a HatchGrab management console (INFERRED from screenshot 3) —
and its `logo_storage_path` is evidently **not set** (the Settings page renders the "Upload logo"
placeholder, which `resolveTruckLogo` produces only for a null path).

**So the assumption is false for at least one live row.** It is load-bearing: it is the stated reason the
delete path applies a public-visibility refusal to photos but *not* to logos. Worth re-checking against
the database regardless of which option below is chosen (§5, query B).

### 2.5 The admin list and the popup cannot disagree about the data

`components/admin/OutreachPanel.tsx`:

```ts
const modalProspect = modalId ? prospects.find(p => p.id === modalId) ?? null : null
```

The modal thumbnail and the list cell read **the same object, the same field, through the same helper**
(`mediaSrc` → `formatImageUrl`). There is no second fetch and no snapshot. **A data difference between
them is not possible.**

What *does* differ is rendering — READ:

| | Classes |
|---|---|
| List cell (`MediaCell`) | `w-10 h-10 rounded-full … object-cover` |
| Modal thumb (`ModalThumb`) | `w-11 h-11 rounded-lg … object-cover` |

**INFERRED, not confirmed:** `object-cover` scales an image to fill and crops the overflow. A **wide
wordmark** — which Pig-Casso's appears to be — cropped into a 40px **circle** loses its left and right
ends and can read as a near-blank disc, while the same crop in a rounded *square* shows more of it. That
would explain "present in the popup, absent in the list" with identical underlying data.

⚠️ I cannot verify this from a screenshot, and it is a **separate, smaller defect** from the two-column
problem. The fix, if confirmed, is `object-contain` plus a little padding for logos — a brand mark should
be shown whole, not cropped. Photos should stay `object-cover`.

---

## 3. What "one place" can and cannot mean

The constraint that shapes every option:

- A **truck can exist with no discovery row** — someone who signed up directly, never scraped, never part
  of outreach. So `discovery_trucks.logo_url` **cannot** be the single store.
- A **discovery prospect can exist with no truck** — 231 of them do. So `trucks.logo_storage_path` cannot
  be the single store *for prospects* without giving every prospect a truck row.

**Therefore the only coherent "one store" is: one store per thing that has a logo, with exactly one
writer and one reader path for each state.** The files are already unified in the `truck-media` bucket;
what needs unifying is which column is authoritative once a truck exists.

---

## 4. The options

### Option A — `trucks.logo_storage_path` is authoritative the moment a truck exists

The outreach admin, **for a linked prospect**, reads and writes `trucks.logo_storage_path` directly.
`discovery_trucks.logo_url` keeps its original job: the scraper's find for a prospect that has no truck
yet.

- 🟢 **Genuinely one store per state.** No copy, no sync, no drift. Provision-time `copyDemoLogo` becomes
  the *only* moment the two ever meet, and only for a prospect that had no truck.
- 🟢 **No migration.** Both columns already exist; `truck-media` is already the shared bucket.
- 🟢 **No fallback re-added**, so §2.2's fixed bug stays fixed and clearing a logo stays visible.
- 🟢 Fixes §2.4's false assumption by making it true: once a truck is linked, the logo *is* the truck's.
- 🔴 **The consequence that needs sign-off:** deleting a logo in the outreach admin would then clear the
  **operator's real logo** — because it would *be* the operator's logo. The existing public-visibility
  refusal would need extending from photos to logos.
- 🔴 The outreach LOGO column changes meaning for linked rows, and its column tooltip
  ("`discovery_trucks.logo_url`") must change with it or it lies.
- ⚠️ The two columns hold **different shapes** — a full URL vs a bucket path. Writing the truck column
  from the outreach admin means storing the path, not the URL. `classifyDemoLogoSource` already contains
  the URL→path conversion and should be reused rather than re-implemented.

### Option B — keep both columns, write both on save

The outreach upload writes `discovery_trucks.logo_url` and, when the row is linked, also pushes the path
to `trucks.logo_storage_path`.

- 🟢 Smallest change; nothing else moves; existing delete semantics survive untouched.
- 🔴 **It is two stores kept in sync, which is the opposite of what was asked.** They drift the instant
  anything writes one directly — and something does: the operator's own Settings page writes
  `logo_storage_path` and would immediately disagree with the outreach column.
- 🔴 Leaves the reviewer with the same question again the next time a surface is added.

### Option C — one column for the whole system

Make `trucks.logo_storage_path` the only logo column anywhere, giving every discovery prospect a `trucks`
row.

- 🟢 Literally one column.
- 🔴 Needs a migration and a backfill, and creates ~231 truck records for businesses that have not signed
  up. Changes what "a truck" means in the data model to solve a display problem.

---

## 5. SQL to settle the facts before deciding — not run

**A. The two columns for Pig-Casso's, side by side.** This is the query that confirms §1 outright.

```sql
select
  dt.name,
  dt.hatchgrab_truck_id                        as linked_truck,
  dt.logo_url                                  as discovery_logo_url,
  t.logo_storage_path                          as truck_logo_path,
  t.active, t.show_on_vf, t.show_on_hg, t.excluded
from public.discovery_trucks dt
left join public.trucks t on t.id = dt.hatchgrab_truck_id
where dt.name ilike '%pig%casso%';
```

Expected if §1 is right: `discovery_logo_url` populated, `truck_logo_path` **null**.

**B. How widely the §2.4 assumption fails** — every linked, publicly-visible truck with no logo of its
own:

```sql
select dt.name, dt.logo_url is not null as has_discovery_logo,
       t.logo_storage_path is not null  as has_truck_logo,
       t.active, t.show_on_vf, t.show_on_hg
from public.discovery_trucks dt
join public.trucks t on t.id = dt.hatchgrab_truck_id
where t.active and not t.excluded and (t.show_on_vf or t.show_on_hg)
  and t.logo_storage_path is null
order by dt.name;
```

Every row returned is a truck the delete guard currently assumes cannot exist.

**C. The scale of the divergence across all linked trucks** — how much work a one-off reconciliation
would be under Option A:

```sql
select
  count(*)                                                              as linked_trucks,
  count(*) filter (where t.logo_storage_path is null
                     and dt.logo_url is not null)                       as truck_blank_discovery_set,
  count(*) filter (where t.logo_storage_path is not null
                     and dt.logo_url is null)                           as truck_set_discovery_blank,
  count(*) filter (where t.logo_storage_path is not null
                     and dt.logo_url is not null)                       as both_set
from public.discovery_trucks dt
join public.trucks t on t.id = dt.hatchgrab_truck_id;
```

⚠️ `both_set` rows are the ones where a reconciliation has to **choose**, and choosing wrong overwrites an
operator's own uploaded logo. That number should be known before any option is built.

---

## 6. What a reviewer should decide

1. **Which column is authoritative once a truck exists?** (Recommendation: Option A, `trucks.logo_storage_path`.)
2. **If Option A: what should deleting a logo in the outreach admin do to a live, public truck?** Refuse
   it the way photo deletion is already refused, or allow it with a warning?
3. **For rows where both columns are set and disagree, which wins in a one-off reconciliation** — and
   should there be one at all, or should divergence simply stop from here on?
4. **Separately: should a logo be `object-contain` rather than `object-cover`?** A brand mark cropped to
   fill a circle can vanish (§2.5). This is independent of 1–3 and is likely the reason the list and the
   popup look different.

---

## 7. Scope

No file changed except this report. No migration, no SQL executed, no database read, no code modified.
The working tree still carries the uncommitted outreach templates/snippets work and nothing from this
investigation; HEAD is `4d4e5b6`.
