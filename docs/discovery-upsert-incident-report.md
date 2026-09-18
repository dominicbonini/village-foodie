# Stray run of `scripts/migrate-from-sheets.cjs` against production — investigation and recovery plan

**Date:** 17 September 2026 · **Incident window:** 2026-09-17 **12:53:11.46 → 12:53:12.65 UTC** (1.2 seconds)
**Scope of this document:** read-only investigation. No code was changed. Nothing was written to any
database or to storage. No script under `scripts/` was run. The three helpers I wrote for this
investigation live in the session scratchpad and are GET-only (plus the storage *list* call, which is a
read); each is quoted below.

**No part of the prompt arrived garbled, and no instruction contradicted another.**

---

## STEP 0 — `git status`

Branch `main`, up to date with `origin/main`. **Nothing staged.** 35 modified files, 71 untracked.

```
Changes not staged for commit:
  modified:   android/app/capacitor.build.gradle      modified:   lib/capacity-breach.ts
  modified:   android/capacitor.settings.gradle       modified:   lib/features.ts
  modified:   app/api/dashboard/action/route.ts       modified:   lib/orders/place-in-slot.ts
  modified:   app/api/dashboard/route.ts              modified:   lib/payments/promote-draft.ts
  modified:   app/api/events/route.ts                 modified:   lib/plan-features.ts
  modified:   app/api/manage/route.ts                 modified:   lib/printing/bleTransport.ts
  modified:   app/api/menu/[truckId]/route.ts         modified:   lib/printing/transport.ts
  modified:   app/api/orders/submit/route.ts          modified:   lib/printing/usePrinting.ts
  modified:   app/api/slots/[truckId]/route.ts        modified:   lib/slot-availability.ts
  modified:   app/dashboard/[token]/page.tsx          modified:   lib/slot-bookings.ts
  modified:   app/landing/page.tsx                    modified:   lib/slot-display.ts
  modified:   app/manage/[token]/page.tsx             modified:   lib/slot-generation.ts
  modified:   app/trucks/[slug]/order/page.tsx        modified:   lib/supabase.ts
  modified:   components/dashboard/AddOrderPanel.tsx  modified:   package-lock.json
  modified:   components/dashboard/CapacityBreachBanner.tsx   modified:   package.json
  modified:   components/printing/PrintingSettings.tsx modified:  scripts/whatsapp-golive-parity-harness.cjs
  modified:   content/store-listing.md                modified:   ios/App/App/Info.plist
  modified:   ios/App/CapApp-SPM/Package.swift

Untracked: app/api/printing/, components/printing/PrinterTypeChoice.tsx, 19 × docs/*.md,
  lib/orders/cooking-reservation.ts, lib/printing/{netAddress,netTransport,networkGuard,testTicket}.ts,
  lib/slot-fit-message.ts, lib/slot-interval.ts, plugins/, 30 × scripts/*.cjs, scripts/fixtures/,
  5 × supabase/migrations/2026091*.sql
no changes added to commit
```

`git add -A` / `git add .` were not run. Nothing was staged, committed, stashed, reset or restored.

---

## 1. What the script writes

### 1.1 `migrateTrucks`, quoted in full — `scripts/migrate-from-sheets.cjs` lines 47–84

```js
async function migrateTrucks(sheets) {
  console.log('\n📦 Migrating Trucks...');
  const rows = await readTab(sheets, 'Trucks!A:U');
  const data = rows.slice(1).filter(r => r[0]);

  const trucks = data.map(r => ({
    name: r[0] || '',
    cuisine: r[1] || null,
    phone: r[2] || null,
    order_url: r[3] || null,
    accepted_methods: r[4] || null,
    notes: r[5] || null,
    website: r[6] || null,
    menu_url: r[7] || null,
    schedule_url: r[8] || null,
    logo_url: r[9] || null,
    contact_email: r[10] || null,
    mobile: r[11] || null,
    verified: String(r[12]).toLowerCase() === 'true' || String(r[12]).toLowerCase() === 'yes',
    type: r[13] || null,
    ai_instructions: r[14] || null,
    scraper_strategy: r[15] || null,
    photo_url: r[16] || null,
    aliases: r[17] ? r[17].split(',').map(a => a.trim()).filter(Boolean) : [],
    is_meal: String(r[18]).toLowerCase() !== 'no',
    exclude_reason: r[19] || null,
  }));

  let inserted = 0, failed = 0;
  for (const truck of trucks) {
    const { error } = await supabase
      .from('discovery_trucks')
      .upsert(truck, { onConflict: 'name' });
    if (error) { console.error(`  ❌ ${truck.name}: ${error.message}`); failed++; }
    else inserted++;
  }
  console.log(`  ✅ ${inserted} trucks migrated, ${failed} failed`);
}
```

The two helpers it calls, verbatim (lines 20–34):

```js
async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function readTab(sheets, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  return res.data.values || [];
}
```

The client is built at lines 15–18 with `SUPABASE_SERVICE_ROLE_KEY`, so **row-level security does not
apply** — every write lands.

### 1.2 Every column it sets, and what an empty sheet cell becomes

The sheet's header row is:

```
Truck Name | Cuisine | Phone Number | Order URL | Accepted Methods | Notes | Website | Menu URL |
Schedule URL | Logo URL | Contact Email | Mobile | Verified | Type | AI Instructions | Strategy |
Photo | Alias | Is Meal? | Exclude? | Sheet ID
```

| Sheet col | Index | Target column | Empty cell becomes | Note |
|---|---|---|---|---|
| Truck Name | A / 0 | `name` | `''` | the conflict key; rows with a falsy name are filtered out first |
| Cuisine | B / 1 | `cuisine` | `null` | |
| Phone Number | C / 2 | `phone` | `null` | 🔴 also editable in the outreach console |
| Order URL | D / 3 | `order_url` | `null` | |
| Accepted Methods | E / 4 | `accepted_methods` | `null` | |
| Notes | F / 5 | `notes` | `null` | |
| Website | G / 6 | `website` | `null` | |
| Menu URL | H / 7 | `menu_url` | `null` | |
| Schedule URL | I / 8 | `schedule_url` | `null` | |
| Logo URL | J / 9 | `logo_url` | `null` | 🔴 also written by the outreach console's uploader |
| Contact Email | K / 10 | `contact_email` | `null` | 🔴 also editable in the outreach console |
| Mobile | L / 11 | `mobile` | `null` | |
| Verified | M / 12 | `verified` | **`false`** | `String(undefined)` is `'undefined'`, which is neither `'true'` nor `'yes'` |
| Type | N / 13 | `type` | `null` | |
| AI Instructions | O / 14 | `ai_instructions` | `null` | |
| Strategy | P / 15 | `scraper_strategy` | `null` | |
| Photo | Q / 16 | `photo_url` | `null` | 🔴 also written by the outreach console's uploader |
| Alias | R / 17 | `aliases` | **`[]`** | |
| Is Meal? | S / 18 | `is_meal` | **`true`** | `'undefined' !== 'no'` |
| Exclude? | T / 19 | `exclude_reason` | `null` | free text, **not** the `excluded` boolean |
| Sheet ID | U / 20 | — | — | read but never used |

Nothing is ever *omitted*: `r[i] || null` turns a blank cell, a missing cell and a trailing cell that
the Sheets API truncated into the same explicit `null`. So **all twenty columns are overwritten on every
upsert**, whether or not the sheet has a value.

**Columns it does NOT set** (and which therefore survived): `id`, `hatchgrab_truck_id`, `created_at`,
`updated_at`, `visibility`, `show_on_vf`, `show_on_hg`, `excluded`.

### 1.3 Conflict key, and whether new rows can be inserted

`{ onConflict: 'name' }` with no `ignoreDuplicates`, i.e. PostgREST `resolution=merge-duplicates` →
`INSERT … ON CONFLICT (name) DO UPDATE SET <the twenty columns>`. So:

- an **exact** name match updates that row;
- **any other name inserts a brand-new row** — this is not an update-only script;
- the match is case- and punctuation-sensitive, which is what produced the one failure (§2.3).

### 1.4 `updated_at`, and whether a trigger bumps it

The payload never contains `updated_at`, and **there is no `ON UPDATE` trigger on `discovery_trucks`.**
Evidence, in order of strength:

1. **Direct measurement.** 19 rows have `created_at = updated_at = 12:53:1x`. **Zero** rows have
   `updated_at` at the incident with an earlier `created_at` — yet 132 rows were demonstrably updated
   (§2). Had a trigger existed, all 132 would carry a 12:53 `updated_at`.
2. Pizzeria Gusto's row was updated by the run and still reads `updated_at = 2026-05-22T14:58:19`.
3. The repo's only `updated_at` trigger is on a different table:
   `supabase/migrations/20260703_orders_updated_at_trigger.sql` → `create trigger orders_set_updated_at`.
   No migration under `supabase/migrations/` creates any trigger on `discovery_trucks`.
4. The 58 rows where `updated_at > created_at` are explained by application code that sets the column
   explicitly, not by a trigger.

**The SQL you should run to confirm this independently** (I could not: `information_schema` is not
reachable through PostgREST — it answers `PGRST205`, "Could not find the table
`public.information_schema.triggers` in the schema cache"). Run it in the Supabase SQL editor:

```sql
select triggers.trigger_name, triggers.event_manipulation, triggers.action_timing
from information_schema.triggers
where triggers.event_object_schema = 'public'
  and triggers.event_object_table  = 'discovery_trucks';
-- expected: zero rows
```

**Consequence, and it is the single most important fact in this report:** `updated_at` is *not* a marker
of what the run touched. The 132 overwritten rows are indistinguishable from untouched rows by timestamp.
Everything below therefore identifies them by **matching the sheet against the table by name**.

---

## 2. Which rows

### 2.1 How I read the sheet

Read-only, with the same credentials, the same scope and the same call the script uses — no write API is
imported. Full source (`$SCRATCH/inc-sheet.cjs`):

```js
// READ-ONLY: reads the master sheet's Trucks tab with the SAME call the migration uses
// (spreadsheets.values.get, scope spreadsheets.readonly). No write API is imported or called.
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('…/.env.local','utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')] }));
const { google } = require('…/node_modules/googleapis');
(async () => {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SHEETS_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: env.SPREADSHEET_ID, range: 'Trucks!A:U' });
  fs.writeFileSync(process.argv[2], JSON.stringify(res.data.values || []));
})();
```

Result: **153 rows including the header; 152 with a name** — which reconciles exactly with the run's own
log line, `✅ 151 trucks migrated, 1 failed`.

### 2.2 The reconciliation

I re-applied the script's own `r => ({…})` mapping to all 152 sheet rows and matched them against the
current table by exact name.

| | Count |
|---|---|
| Sheet rows with a name | 152 |
| Matched a current `discovery_trucks` row by exact name | **151** |
| Of those, **INSERTED** by the run (`created_at` = 12:53) | **19** |
| Of those, **UPDATED** by the run (pre-existing row) | **132** |
| Failed, nothing written | **1** ("Pimp My FIsh") |
| Rows in the table the run never touched | 99 |
| Table total now | 250 |

**Proof that the overwrite landed in full:** for all 132 updated rows I compared the current value of
each of the 18 comparable columns against the value the script would have written from the sheet.
**0 rows differ on 0 fields.** Every one of those 132 rows now holds the sheet's values verbatim.

### 2.3 The 19 rows INSERTED by the run

These did not exist before 12:53:11 on 17 September 2026. They take the table's column **defaults** for
everything the script does not set:

```
visibility = 'public'   show_on_vf = true   show_on_hg = true   excluded = false   verified = false
cuisine = null          exclude_reason = 'Yes - New Truck'      hatchgrab_truck_id = null
```

```
10 Yrs Wildlife Trust & Stpm Event   Chaii Hub                Duynyvolck
Farndons                             Hongkong Hitwrap         Jonny Drop Vinyl Dj
Little Bangkok                       Little Luigi             Mumma B
New Wellington                       Off The Beaten Truck     Santoni Fish & Chips
Shano                                The Chequers             The Copper Tree
The Fox Inn                          The Pod                  The Secret Seamstress Events
Trumpington Meadows Food Vans
```

Several are plainly not food trucks — a wildlife-trust anniversary, a vinyl DJ, four pub names, a
seamstress's events, a business park's van rota. They carry `exclude_reason = 'Yes - New Truck'` (the
scraper's marker for a name it appended to the sheet but has not yet vetted) while the **`excluded`
boolean that actually governs visibility is `false`**, because the script does not set it.

**They are not publicly listed today.** The public listing is driven by events, and **none of the 19 has
a single upcoming `discovery_events` row** (checked against all 747 events dated on or after
2026-09-17). They also have no `outreach_prospects` row. The exposure is latent, not live: the moment
the scraper attaches an event to one of those names, it becomes a public listing that nobody vetted.

### 2.4 "Pimp My FIsh" — the one failure

```
❌ Pimp My FIsh: duplicate key value violates unique constraint "discovery_trucks_norm_name_uniq"
```

The table carries a second unique constraint on a *normalised* name, alongside the unique `name` the
upsert targets. The sheet still spells the row `Pimp My FIsh` (capital I); the table holds
`Pimp My Fish`, renamed during the July de-duplication. So `ON CONFLICT (name)` found no match, fell
through to `INSERT`, and the normalised-name constraint rejected it.

**Nothing was written for this row, and that is lucky:** the existing row is intact and complete —
`logo_url = /logos/pimpmyfish.jpg`, `photo_url = /photos/pimpmyfish.jpg`, `excluded = false`, created
2026-05-22. The constraint did exactly its job. (`discovery_trucks_norm_name_uniq` does not appear in
`supabase/migrations/`, so it was added directly in Supabase.)

### 2.5 Tables the run did NOT reach

The venue stage failed on every row (`there is no unique or exclusion constraint matching the ON CONFLICT
specification` — `venues` has no unique index on `name`), and I stopped the process during that stage, so
exclusions, subscribers, events and `resolveLinks` never ran. Confirmed read-only:

```sql
select count(*) from public.venues          where venues.created_at          >= '2026-09-17T12:50:00Z';  -- 0
select count(*) from public.discovery_events where discovery_events.created_at >= '2026-09-17T12:50:00Z'; -- 0
select count(*) from public.subscribers     where subscribers.created_at     >= '2026-09-17T12:50:00Z';  -- 0
select count(*) from public.excluded_terms;                                                              -- 0 (table empty)
```

**`discovery_trucks` is the only table this incident changed.**

---

## 3. What changed, and every possible source of the pre-incident values

### 3.1 Bounding the damage — which columns could have held anything but sheet data

`discovery_trucks` is written by exactly three things. I checked every writer in the repo:

| Writer | Columns it writes |
|---|---|
| The sheet migration (this incident) | the 20 columns in §1.2 |
| `scripts/run-scraper.js:2278` | `{ name, exclude_reason }` only, with `ignoreDuplicates: true` |
| `app/api/admin/outreach/route.ts` (the console) | **`logo_url`, `photo_url`** (upload at line 575, clear at line 870) and **`contact_email`, `phone`** (line 646–657) |

Everything else on the table is sheet- or scraper-sourced, so for those columns "the sheet's value" *is*
the intended value and there is nothing to recover. **The loss is confined to four columns on the 132
overwritten rows: `logo_url`, `photo_url`, `contact_email`, `phone`.**

### 3.2 The measured loss on the two media columns

Fill-rate of the two media columns, overwritten rows versus rows the run never touched:

| Column | | Supabase-storage URL | external / static | null |
|---|---|---|---|---|
| `logo_url` | **overwritten (132)** | **0** | 108 | 24 |
| | untouched (99) | 42 | 1 | 56 |
| `photo_url` | **overwritten (132)** | **0** | 77 | 55 |
| | untouched (99) | 3 | 1 | 95 |

Not one of the 132 overwritten rows still points at the storage bucket; 45 of the 99 untouched rows do.
That is the signature of the damage: every uploaded image URL on an affected row was replaced by the
sheet's static path or by `null`.

### 3.3 Every candidate source for the pre-incident values

**(a) Supabase backups — I cannot reach these; here is what to look for.** In the Supabase dashboard
under *Database → Backups*, the project's daily physical backup taken before 12:53 UTC on 17 September
2026 (on Pro, also Point-in-Time Recovery, which can target 12:50 UTC exactly). **Do not restore the
project** — that would roll back every table, including live `orders` written since. Instead restore
into a *branch* or a scratch project and read one table out of it:

```sql
select discovery_trucks.id, discovery_trucks.name, discovery_trucks.logo_url,
       discovery_trucks.photo_url, discovery_trucks.contact_email, discovery_trucks.phone
from public.discovery_trucks
order by discovery_trucks.name;
```
This is the **only** source that can recover `contact_email` and `phone`, and the only complete one.

**(b) Scraper outputs, logs and Actions artifacts — none carry these values.** `scripts/backfill-output/`
holds eleven JSON snapshots, but their payloads are `{generatedAt, scope, counts, appliedIds, updates}`
over `discovery_events.venue_id` — event linkage, not truck media. Grep of the whole folder for
`logo_url|photo_url` matches only two hand-written SQL files (§3.3e). The `discovery_run_log` table
(1,044 rows, latest 2026-09-17 11:10) records `site_name / outcome / page_chars / events_extracted` —
scrape outcomes, no truck columns. The four workflows in `.github/workflows/` run the scraper; they
upload no artifact containing table rows.

**(c) `docs/*.md` from this and earlier sessions — nothing usable.** Ten reports mention
`discovery_trucks`, but a grep for a quoted `logo_url`/`photo_url` **value** (any `truck-media`,
`discovery-logos`, `.jpg`, `.png` or `.jpeg` string) returns **no matches**. The reports discuss the
columns, never their contents.

**(d) The `truck-media` bucket — intact, and the best source for images.** This is §4. The incident
changed database columns only; **no storage object was touched**. Every uploaded image still exists.

**(e) Audit / history tables — none for this table.** Of the 70 tables PostgREST exposes, the
backup-looking ones are `venue_link_backup_20260907`, `discovery_events_relink_backup_20260703`,
`venue_coord_backup_20260907`, `venues_strategy_backup_20260909`, `venues_backup_20260909`,
`dedupe_events_backup_20260702` and `dedupe_trucks_backup_20260702`. Only the last holds
`discovery_trucks` rows — and only **four**, snapshotted 2026-07-02 during the Pimp-My-Fish
de-duplication:

| name | logo_url | photo_url |
|---|---|---|
| Grab A Burger | `/logos/grababurger.jpg` | `null` |
| Pimp My Fish | `/logos/pimpmyfish.jpg` | `null` |
| Grab a Burger | `/logos/grababurger.jpg` | `/photos/grababurger.jpg` |
| Pimp My FIsh | `/logos/pimpmyfish.jpg` | `/photos/pimpmyfish.jpg` |

Both surviving rows are unaffected today, so this snapshot recovers nothing. `action_audit_log` exists
but is the order-actions log (`truck_id`, `order_key`, `before_state`, `after_state`) — it never records
`discovery_trucks`.

**(f) The scraper's next run restores nothing, and will do no further harm.** Its only write to this
table is `scripts/run-scraper.js:2278`:

```js
const { error: trErr } = await supabase.from('discovery_trucks').upsert({
  name: row[0],
  exclude_reason: 'Yes - New Truck',
}, { onConflict: 'name', ignoreDuplicates: true });
```

`ignoreDuplicates: true` makes this `ON CONFLICT DO NOTHING`, and it only runs for names newly appended
to the sheet. It cannot overwrite an existing row and it will not repair one.

---

## 4. Images — the `truck-media` bucket

### 4.1 The conventions, quoted

`app/api/admin/outreach/route.ts`:

```js
const MEDIA_BUCKET = 'truck-media'                                                    // line 465
const MEDIA_COLUMN: Record<string, 'logo_url' | 'photo_url'> = { logo: 'logo_url', photo: 'photo_url' }
const MEDIA_FOLDER: Record<string, string> = { logo: 'logos', photo: 'photos' }
```
```js
const safeName = (file.name || 'image').replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)   // line 552
const path = `${truckId}/${MEDIA_FOLDER[kind]}/${Date.now()}-${safeName}`             // line 553
…
const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL}` +
                  `/storage/v1/object/public/${MEDIA_BUCKET}/${path}`                 // line 560
```

so `truckId` is the **`discovery_trucks.id`**, and the column receives that absolute URL. The route's own
comment (line 401) states the other convention explicitly:

> 🔴 `truck-media` IS THE ONLY RUNTIME-WRITABLE STORE. The `/logos/…` and `/photos/…` values that most
> discovery rows carry are STATIC FILES IN `public/`, tracked in git and shipped with the deploy.

A third shape exists, `discovery-logos/<slug>.<ext>` — the seeded logo folder (route line 775). And
`lib/image-utils.ts` resolves a bare filename against a default folder:

```ts
export function formatImageUrl(rawPath: string | null, defaultFolder: string): string {
  if (!rawPath) return ''
  const cleanPath = rawPath.trim()
  if (cleanPath.startsWith('http') || cleanPath.startsWith('/')) return cleanPath
  return `/${defaultFolder}/${cleanPath}`
}
```

So `chaistall.jpg` renders as `/photos/chaistall.jpg` from `public/photos/` (76 files), and
`/logos/pigcasso.jpg` from `public/logos/` (122 files). **This is why the breakage is uneven**: an
affected row whose sheet value is a static path that exists still renders something; one whose sheet
cell was blank now renders nothing at all.

### 4.2 How I listed the bucket

`$SCRATCH/inc-storage.cjs` / `inc-relink.cjs` issue only `GET /rest/v1/…` and
`POST /storage/v1/object/list/truck-media` — the *list* endpoint. No upload, remove, move or copy call
appears in either file.

The bucket's 20 top-level prefixes: four operator truck slugs (`village-spice`, `tikka-tonic`,
`test-truck`, `real-thai-food`, `pizzeria-gusto`), two demo truck ids, the seeded `discovery-logos/`
(43 objects), and **13 UUID folders, every one of which is a `discovery_trucks.id`**, each holding
`logos/` and/or `photos/`.

### 4.3 THE RELINK TABLE

Newest object of each kind per affected row, against the column's current value. Proposed values are
built exactly as line 560 builds them.

| Row | Column | Current value | Proposed value (full URL, built as the upload route builds it) | Object date | Ambiguous? |
|---|---|---|---|---|---|
| Pig-Casso's | logo_url | `/logos/pigcasso.jpg` | `…/truck-media/fc15d42b-2e2d-45ad-bf2a-711485954d9b/logos/1789489057229-pigcasso.png` | 2026-09-15 | 🔶 YES — see note |
| Pig-Casso's | photo_url | `null` | `…/truck-media/fc15d42b-2e2d-45ad-bf2a-711485954d9b/photos/1788949004809-image.jpeg` | 2026-09-09 | no |
| Perky Beans | photo_url | `null` | `…/truck-media/e4ccb606-30c5-473a-8a5f-78660fa74859/photos/1788949882892-image.jpeg` | 2026-09-09 | no |
| Guerrilla Kitchen | logo_url | `null` | `…/truck-media/e21068b9-cdf4-4bec-80fa-4a6e956b508d/logos/1788950590118-image.jpeg` | 2026-09-09 | no |
| Guerrilla Kitchen | photo_url | `null` | `…/truck-media/e21068b9-cdf4-4bec-80fa-4a6e956b508d/photos/1788950617756-image.jpeg` | 2026-09-09 | no |
| Azahar | photo_url | `null` | `…/truck-media/d5802c04-7ee3-46e3-85a3-f581545ee8d9/photos/1788948861675-image.jpeg` | 2026-09-09 | no |
| The Purple Pepper | photo_url | `null` | `…/truck-media/7b788033-6cfc-4b3a-bae0-18419d2cf09f/photos/1788948269254-image.jpeg` | 2026-09-09 | no |
| Nomadough | photo_url | `null` | `…/truck-media/63454dc4-4d62-4a8a-bf51-1df656250bef/photos/1788948904787-image.jpeg` | 2026-09-09 | no |
| Steak & Honour | photo_url | `steakandhonour.jpg` | `…/truck-media/4e5dcb9f-12b7-49db-af55-92f866f01b8b/photos/1788950253289-image.png` | 2026-09-09 | no |
| Buffalo Joe's | photo_url | `null` | `…/truck-media/24a60d3e-267a-490f-9156-73138562ddb7/photos/1788948497564-image.jpeg` | 2026-09-09 | no |
| Chai Stall | photo_url | `chaistall.jpg` | `…/truck-media/2461b11b-b3c1-4db5-9388-39e99e1a882a/photos/1788956383022-image.jpeg` | 2026-09-09 | no |
| Churros Bar | logo_url | `null` | `…/truck-media/discovery-logos/churros-bar.jpg` | 2026-06-05 | no |
| MumTas | logo_url | `null` | `…/truck-media/discovery-logos/mumtas.png` | 2026-06-05 | no |

**12 rows, 13 columns provably lost a working image.** Three untouched rows also hold storage objects
(Between Buns Royston, Kerief Catering Ltd, Optio Pizza) and their columns still point at them correctly
— they are the control group that proves the URL shape above.

**🔶 The one ambiguous row — Pig-Casso's `logo_url`.** Its logo is *not* authored on the discovery row.
The console's "Option A" (route lines 566–575) writes a **linked** prospect's logo to
`trucks.logo_storage_path` instead, and Pig-Casso's has a demo session on truck
`demo-3hgvth0mancbak5krsxhy6fda7`, whose `logo_storage_path` is
`fc15d42b-2e2d-45ad-bf2a-711485954d9b/logos/1789489057229-pigcasso.png` — intact. **That is exactly why
you still see the logo and not the photo.** So its `logo_url` row in the table above is optional: the
logo already resolves. Its **`photo_url` is the real loss** and is unambiguous.

**Accounting for the seeded folder, which closes the set.** `discovery-logos/` holds 43 objects; 41 are
still referenced, and every one of those 41 referring rows is untouched. The two unreferenced objects are
exactly Churros Bar and MumTas — both affected rows whose logo the sheet blanked. There is no third
category of lost image.

---

## 5. Flags and links

### 5.1 The script sets none of them

`visibility`, `show_on_vf`, `show_on_hg`, `excluded` and `hatchgrab_truck_id` are absent from the
payload, so **on the 132 updated rows all five are exactly as they were.** `verified` *is* set, and was
forced to `false` wherever the sheet's Verified cell is not `true`/`yes` (29 of the 132 are `true` now).
`is_meal` was forced `true` on 131 of 132, and `aliases` blanked to `[]` on 112 of 132 — both from the
sheet, both recoverable only from a backup, and neither affects visibility.

### 5.2 Pizzeria Gusto — the link is intact

```sql
select discovery_trucks.id, discovery_trucks.name, discovery_trucks.hatchgrab_truck_id,
       discovery_trucks.visibility, discovery_trucks.show_on_vf, discovery_trucks.show_on_hg,
       discovery_trucks.excluded, discovery_trucks.logo_url, discovery_trucks.photo_url,
       discovery_trucks.updated_at
from public.discovery_trucks
where discovery_trucks.name = 'Pizzeria Gusto';
```

```
id                 729fc2b2-62cf-42d9-8fd8-772301c6c67f
hatchgrab_truck_id pizzeria-gusto      ← INTACT
visibility         hg_only             ← INTACT
show_on_vf         false               ← INTACT
show_on_hg         true                ← INTACT
excluded           true                ← INTACT
logo_url           /logos/pizzeriagusto.jpg      (static file, present in public/logos — renders)
photo_url          pizzeriagusto.jpg             (resolves to /photos/pizzeriagusto.jpg — renders)
updated_at         2026-05-22T14:58:19+00:00     ← unchanged, which is the trigger proof of §1.4
```

Gusto's row was among the 132 overwritten, but it holds **no** storage object in `truck-media` under its
discovery id, so nothing was lost: both media values are static paths that still resolve. Its live
trading truck, its orders and its events were never in scope — `discovery_trucks` has no bearing on them.
All four rows carrying a `hatchgrab_truck_id` survived: Pizzeria Gusto, Real Thai Food and Tikka Tonic
(all three overwritten, links intact) and Test Kitchen (not in the sheet, untouched).

### 5.3 Rows the sheet could have made publicly visible

**None among the 132.** Because the script writes neither `excluded` nor `show_on_vf`/`show_on_hg`, no
pre-existing hidden or excluded row was revealed. The only new public surface is the **19 inserted rows**
of §2.3, which took `visibility='public', show_on_vf=true, show_on_hg=true, excluded=false` from the
column defaults. None is listed today (no upcoming events), so this is a latent exposure.

### 5.4 `outreach_prospects`

Untouched — the script never names the table.

```sql
select count(*) from public.outreach_prospects
where outreach_prospects.updated_at >= '2026-09-17T12:50:00Z';   -- 0
```

231 prospects exist; **132 point at an affected discovery truck** (`not_contacted` 120, `contacted` 9,
`not_interested` 2, `replied` 1). None of the 19 new rows has a prospect.

The 12 whose stage has advanced are the ones whose `contact_email`/`phone` are most likely to have been
typed into the console rather than the sheet — i.e. the ones where a silent revert would matter. Their
**current** values, all of which are now the sheet's:

| Truck | Stage | contact_email | phone |
|---|---|---|---|
| BB Pizza | not_interested | eveandkarim@bbpizzas.co.uk | — |
| Smother Spudders | contacted | smotherspudders@gmail.com | 07500 333469 |
| Elder Street Food | contacted | info@elderstreetfood.co.uk | 07526 660262 |
| Nomadough | contacted | hello@nomadough.co.uk | 07912 527218 |
| Guerrilla Kitchen | contacted | — | — |
| Pig-Casso's | replied | INFO@PIGCASSOSCATERING.CO.UK | 07507 846 622 |
| The Purple Pepper | contacted | kw.purplepepper@gmail.com | 07719 073160 |
| Steak & Honour | contacted | hello@steakandhonour.co.uk | — |
| Buffalo Joe's | contacted | — | — |
| Tikka Tonic | contacted | info@tikkatonic.com | 01284 724298 |
| Pizza Mondo | contacted | — | — |
| Azahar | not_interested | info@azaharartisanspanishfood.com | 01223 360747 |

Most look like real, hand-quality contacts (note the upper-case address and the spaced mobile), which
suggests the sheet already held them. **But three rows are blank where a `contacted` prospect would
normally have a contact — Guerrilla Kitchen, Buffalo Joe's, Pizza Mondo. Those are the strongest
candidates for a console edit that this run reverted.** I cannot prove it either way without a backup.

---

## 6. Every glob used in this workstream

I searched all eight session transcripts under
`~/.claude/projects/-Users-dominicbonini-dev-village-foodie/` for Bash commands globbing `scripts/`.
Seven distinct globs were used across the workstream:

| # | Glob | Files it matches | Any of them operational? |
|---|---|---|---|
| 1 | `scripts/add-order-*.cjs` | add-order-fit-message, add-order-render | no |
| 2 | `scripts/batch-*.cjs` | batch-reservation-{display-equals-picker, golden-on, helper, immutability, instants, lock, p2-identity, p3-worked-case, switch, writers}, batch-rolling-{check, identity} | no |
| 3 | `scripts/customer-path-*.cjs` | customer-path-identity | no |
| 4 | `scripts/printing-*.cjs` | printing-{copy, dedupe, escpos-identity, failure-split, gating, network-guard, transport-contract} | no |
| 5 | `scripts/slot-interval-*.cjs` | slot-interval-{dots, engine-identity, event-override, generator, grid-routing, settings, van-list-tolerance, van-resolution} | no |
| 6 | `scripts/outreach-*.cjs` | outreach-{channel-for, dnc-pool, list-columns, log-once, logo-latch, stage-advance, upload-refresh} | no |
| 7 | `scripts/whatsapp-*.cjs` / `*harness*.cjs` | whatsapp-{background-jobs, connection-view, golive-parity, settings-row, setup-machine}-harness | no |
| **8** | **`ls scripts/*.cjs` (the P3 sweep)** | **all 52 `.cjs` files** | **🔴 YES — four** |

### 6.1 The capability test, applied to all 52 `.cjs` files

Rather than judging by name, I tested each file for the ability to reach anything:

| Script | Supabase client | Service-role key | HTTP | Google | `.env.local` |
|---|---|---|---|---|---|
| `list-stranded-authorisations.cjs` | ✔ | ✔ | — | — | ✔ |
| `migrate-from-sheets.cjs` | ✔ | ✔ | — | ✔ | ✔ |
| `register-payment-domain.cjs` | ✔ | ✔ | — | — | ✔ |
| every other `.cjs` (49 files) | — | — | — | — | — |

**Only three of the 52 can reach a database, a credential or a network at all.** Not one file matched by
globs 1–7 constructs a client, reads a key, or calls `fetch`. Those globs were, and remain, safe. Their
harnesses compile TypeScript into a temp directory and run pure functions against fixtures.

Write-capability of the four non-harness files, by inspection:

| File | Class | Can it write? |
|---|---|---|
| `migrate-from-sheets.cjs` | 🔴 OPERATIONAL | **Yes** — upsert/insert into `discovery_trucks`, `venues`, `discovery_events`, `excluded_terms`, `subscribers`; update on `discovery_events`. Reads Sheets read-only. |
| `register-payment-domain.cjs` | 🔴 OPERATIONAL | **Yes** — Stripe + Supabase. **Never ran** (no output file; the sweep was stopped before reaching it alphabetically). |
| `list-stranded-authorisations.cjs` | 🔵 operational, read-only | **No** — zero insert/upsert/update/delete and no Stripe mutation in its source. |
| `dev-virtual-printer.cjs` | 🔵 dev server | **No** — opens a local TCP socket. It is a long-running server; it held the sweep for 200 s, which is the only reason I noticed the sweep at all. |

### 6.2 What glob 8 actually executed

Alphabetical order, with `dev-virtual-printer` stalling for 200 s in the middle:

```
add-order-fit-message ✅   …12 harnesses…   customer-path-identity ✅
dev-virtual-printer               (200 s, local socket, harmless)
list-stranded-authorisations      🔵 READ-ONLY. Printed: Stripe mode LIVE, 10 promoted drafts with an
                                     uncancelled authorisation, 0 not captured, "Nothing stranded."
migrate-from-sheets               🔴 THE INCIDENT — stopped during the venues stage
── stopped here ──                outreach-*, printing-*, register-payment-domain.cjs never reached
```

`register-payment-domain.cjs`, the only other script that could have written anything, sorts after
`printing-*` and was never reached. **No prompt before this one ran any operational file.** Glob 8 was
used once, in the P3 verification step, and is the sole cause.

---

## 7. Recovery plan — nothing here has been run

### (a) Image relink — one statement per row

Each is guarded by `is not distinct from <the value I observed>`, so if anything changes between now and
when you run it, that statement writes nothing rather than clobbering a newer value. Review, then run in
the Supabase SQL editor.

```sql
-- Pig-Casso's  (photo_url)  current: null   object uploaded 2026-09-09T10:16:44Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/fc15d42b-2e2d-45ad-bf2a-711485954d9b/photos/1788949004809-image.jpeg'
 where discovery_trucks.id = 'fc15d42b-2e2d-45ad-bf2a-711485954d9b' and discovery_trucks.photo_url is not distinct from NULL;

-- Perky Beans  (photo_url)  current: null   object uploaded 2026-09-09T10:31:23Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/e4ccb606-30c5-473a-8a5f-78660fa74859/photos/1788949882892-image.jpeg'
 where discovery_trucks.id = 'e4ccb606-30c5-473a-8a5f-78660fa74859' and discovery_trucks.photo_url is not distinct from NULL;

-- Guerrilla Kitchen  (logo_url)  current: null   object uploaded 2026-09-09T10:43:10Z
update public.discovery_trucks set logo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/e21068b9-cdf4-4bec-80fa-4a6e956b508d/logos/1788950590118-image.jpeg'
 where discovery_trucks.id = 'e21068b9-cdf4-4bec-80fa-4a6e956b508d' and discovery_trucks.logo_url is not distinct from NULL;

-- Guerrilla Kitchen  (photo_url)  current: null   object uploaded 2026-09-09T10:43:38Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/e21068b9-cdf4-4bec-80fa-4a6e956b508d/photos/1788950617756-image.jpeg'
 where discovery_trucks.id = 'e21068b9-cdf4-4bec-80fa-4a6e956b508d' and discovery_trucks.photo_url is not distinct from NULL;

-- Azahar  (photo_url)  current: null   object uploaded 2026-09-09T10:14:22Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/d5802c04-7ee3-46e3-85a3-f581545ee8d9/photos/1788948861675-image.jpeg'
 where discovery_trucks.id = 'd5802c04-7ee3-46e3-85a3-f581545ee8d9' and discovery_trucks.photo_url is not distinct from NULL;

-- The Purple Pepper  (photo_url)  current: null   object uploaded 2026-09-09T10:04:29Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/7b788033-6cfc-4b3a-bae0-18419d2cf09f/photos/1788948269254-image.jpeg'
 where discovery_trucks.id = '7b788033-6cfc-4b3a-bae0-18419d2cf09f' and discovery_trucks.photo_url is not distinct from NULL;

-- Nomadough  (photo_url)  current: null   object uploaded 2026-09-09T10:15:05Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/63454dc4-4d62-4a8a-bf51-1df656250bef/photos/1788948904787-image.jpeg'
 where discovery_trucks.id = '63454dc4-4d62-4a8a-bf51-1df656250bef' and discovery_trucks.photo_url is not distinct from NULL;

-- Steak & Honour  (photo_url)  current: 'steakandhonour.jpg'   object uploaded 2026-09-09T10:37:33Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/4e5dcb9f-12b7-49db-af55-92f866f01b8b/photos/1788950253289-image.png'
 where discovery_trucks.id = '4e5dcb9f-12b7-49db-af55-92f866f01b8b' and discovery_trucks.photo_url is not distinct from 'steakandhonour.jpg';

-- Buffalo Joe's  (photo_url)  current: null   object uploaded 2026-09-09T10:08:17Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/24a60d3e-267a-490f-9156-73138562ddb7/photos/1788948497564-image.jpeg'
 where discovery_trucks.id = '24a60d3e-267a-490f-9156-73138562ddb7' and discovery_trucks.photo_url is not distinct from NULL;

-- Chai Stall  (photo_url)  current: 'chaistall.jpg'   object uploaded 2026-09-09T12:19:43Z
update public.discovery_trucks set photo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/2461b11b-b3c1-4db5-9388-39e99e1a882a/photos/1788956383022-image.jpeg'
 where discovery_trucks.id = '2461b11b-b3c1-4db5-9388-39e99e1a882a' and discovery_trucks.photo_url is not distinct from 'chaistall.jpg';

-- Churros Bar  (logo_url)  current: null   seeded object 2026-06-05T22:36:55Z
update public.discovery_trucks set logo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/discovery-logos/churros-bar.jpg'
 where discovery_trucks.id = '0c04a511-1309-44f8-a01d-1170c0fe95ee' and discovery_trucks.logo_url is not distinct from NULL;

-- MumTas  (logo_url)  current: null   seeded object 2026-06-05T22:35:31Z
update public.discovery_trucks set logo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/discovery-logos/mumtas.png'
 where discovery_trucks.id = '6b08e536-a2b0-4b67-bbca-60b5c9d84f0f' and discovery_trucks.logo_url is not distinct from NULL;

-- 🔶 OPTIONAL AND AMBIGUOUS — Pig-Casso's logo already resolves from its demo truck's
--    trucks.logo_storage_path (Option A). Run this ONLY if you want the discovery row to carry it too.
-- update public.discovery_trucks set logo_url = 'https://ffphgwonshgxamtvefcv.supabase.co/storage/v1/object/public/truck-media/fc15d42b-2e2d-45ad-bf2a-711485954d9b/logos/1789489057229-pigcasso.png'
--  where discovery_trucks.id = 'fc15d42b-2e2d-45ad-bf2a-711485954d9b' and discovery_trucks.logo_url is not distinct from '/logos/pigcasso.jpg';
```

Verify afterwards:

```sql
select discovery_trucks.name, discovery_trucks.logo_url, discovery_trucks.photo_url
from public.discovery_trucks
where discovery_trucks.id in (
  'fc15d42b-2e2d-45ad-bf2a-711485954d9b','e4ccb606-30c5-473a-8a5f-78660fa74859',
  'e21068b9-cdf4-4bec-80fa-4a6e956b508d','d5802c04-7ee3-46e3-85a3-f581545ee8d9',
  '7b788033-6cfc-4b3a-bae0-18419d2cf09f','63454dc4-4d62-4a8a-bf51-1df656250bef',
  '4e5dcb9f-12b7-49db-af55-92f866f01b8b','24a60d3e-267a-490f-9156-73138562ddb7',
  '2461b11b-b3c1-4db5-9388-39e99e1a882a','0c04a511-1309-44f8-a01d-1170c0fe95ee',
  '6b08e536-a2b0-4b67-bbca-60b5c9d84f0f')
order by discovery_trucks.name;
```

An alternative to all of the above, if you would rather not run SQL: the console's own uploader refuses a
filled slot but accepts an empty one, so for each row you could re-upload the image by hand. That writes
a **new** object and leaves the existing one orphaned, so the SQL is cleaner.

### (b) Text fields — `contact_email` and `phone`

The only recoverable-from-anywhere columns beyond the images, and the **only** source is a backup
(§3.3a). Route:

1. Restore the pre-12:53 backup into a **branch or scratch project**, never over production.
2. Export `id, name, contact_email, phone` from the restored `discovery_trucks`.
3. Diff against production and look only at rows where the restored value is non-null and production's
   differs. Start with Guerrilla Kitchen, Buffalo Joe's and Pizza Mondo (§5.4).
4. Apply, guarded the same way: `where … and discovery_trucks.contact_email is not distinct from <now>`.

If no usable backup exists, this data is gone. The sheet's values stand, and for most rows they are
almost certainly the same values.

Do **not** attempt a wholesale restore of all twenty columns from a backup: `verified`, `is_meal` and
`aliases` were also reset to sheet-derived values, and re-running the sheet later would undo any repair.
The cost-effective fix for those is to correct the **sheet**, which is the upstream source.

### (c) Checklist for Gusto's listing

Nothing here needs changing — this is a confirmation list, all read-only, all already run above.

- [x] `hatchgrab_truck_id = 'pizzeria-gusto'` — intact.
- [x] `visibility = 'hg_only'`, `show_on_vf = false`, `show_on_hg = true`, `excluded = true` — intact.
- [x] `logo_url = /logos/pizzeriagusto.jpg` → `public/logos/pizzeriagusto.jpg` exists — renders.
- [x] `photo_url = pizzeriagusto.jpg` → `/photos/pizzeriagusto.jpg` — renders.
- [x] No `truck-media` object exists under Gusto's discovery id — nothing was lost.
- [x] `updated_at` still 2026-05-22 — no trigger, consistent with §1.4.
- [ ] **For you, by eye:** open the HatchGrab listing for Pizzeria Gusto and confirm the logo and photo
      display as before. No page, route or API was called with Gusto's token or device id at any point in
      this investigation, and nothing of Gusto's was created, edited, cancelled or deleted.

### (d) Should the scraper cron be paused?

**No — leave all four workflows running.** Reasons:

- Pass A's only write to this table is `ON CONFLICT DO NOTHING` on `{name, exclude_reason}` (§3.3f). It
  cannot overwrite a media column or a contact field, so it cannot damage a row you are repairing, and a
  repair cannot be undone by it.
- `discovery_prune.yml` (03:30 daily) deletes stale `discovery_events`, not trucks.
- Pausing has its own cost: a missed day of events for every venue.

The one thing to do before the next 06:00 Pass A: decide about the 19 inserted rows (§2.3). If the
scraper attaches an event to, say, *The Fox Inn* or *Jonny Drop Vinyl Dj*, an unvetted row becomes a
public listing. Reviewing them is cheap:

```sql
select discovery_trucks.id, discovery_trucks.name, discovery_trucks.excluded,
       discovery_trucks.show_on_vf, discovery_trucks.show_on_hg
from public.discovery_trucks
where discovery_trucks.created_at >= '2026-09-17T12:50:00Z'
order by discovery_trucks.name;
```

and, for any that are not food businesses, the fix is the `excluded` boolean that the run left at its
default — your call, not mine to run:

```sql
-- REVIEW THE LIST FIRST. Exclude only the rows you judge not to be food trucks.
update public.discovery_trucks
set excluded = true, show_on_vf = false, show_on_hg = false
where discovery_trucks.id in ( /* the ids you chose from the select above */ );
```

---

## 8. Prevention — proposals only, nothing implemented

1. **Move operational scripts to `scripts/ops/`.** `migrate-from-sheets.cjs`,
   `register-payment-domain.cjs`, `list-stranded-authorisations.cjs`, `dev-virtual-printer.cjs` and the
   `.js`/`.mjs`/`.ts` operational files (`run-scraper.js`, `process-next-truck.js`,
   `prune-discovery-events.mjs`, `seed-hatchesup-trucks.js`, `backfill-*`, `reresolve-event-venues.ts`,
   …). Then `scripts/*.cjs` means "harness" by construction and glob 8 becomes harmless. The capability
   test in §6.1 is the objective criterion for which files move.
2. **Refuse to run without an explicit confirmation flag.** At the top of each operational script:
   ```js
   if (!process.argv.includes('--yes-write-to-production')) {
     console.error('This script WRITES to production. Re-run with --yes-write-to-production.');
     process.exit(2);
   }
   ```
   A glob then produces a wall of exit-2s instead of a wall of writes. Worth pairing with a line naming
   the tables it will write.
3. **Sweeps read an explicit committed list.** `scripts/harnesses.json` enumerating every harness, with a
   runner that iterates it and fails loudly on a file that is on disk but not in the list — so a new
   harness is either registered or noticed. A CI check that every `scripts/*.cjs` is either in the list
   or under `ops/` keeps it honest.
4. **No prompt may run a file it did not name.** The rule that would have prevented this on its own:
   expand a glob first, print the matched list, and run nothing until every entry is one the prompt (or I)
   named explicitly. In this incident the sweep was written as `ls scripts/*.cjs | grep -v '/_'` with two
   `case` exclusions — the exclusions show I knew the list needed filtering, and filtered for the wrong
   thing. An allow-list cannot fail that way; a deny-list always can.
5. **One more, from what this investigation revealed:** `discovery_trucks` has no `updated_at` trigger,
   so a bulk write leaves no trace at all. Adding one (the same shape as `orders_set_updated_at`) would
   have turned this two-day forensic exercise into a single `where updated_at >= …` query. That is a
   migration, so I am proposing it, not writing it.

---

## 9. Anything I could not establish

- **The pre-incident values of `logo_url`, `photo_url`, `contact_email`, `phone` and the other 16
  columns on the 132 overwritten rows.** No audit table, no snapshot, no log and no report holds them. A
  Supabase backup from before 12:53 UTC is the only source, and I cannot reach one. Everything in §4 and
  §7(a) is *reconstruction from surviving storage objects*, not the original values — the objects prove
  an image was uploaded for that row, not that the column pointed at that particular object.
- **Whether the three blank contacts (Guerrilla Kitchen, Buffalo Joe's, Pizza Mondo) were ever filled
  in.** They are `contacted`-stage prospects with no email and no phone, which is suggestive, not proof.
- **`information_schema.triggers` directly** — PostgREST returns `PGRST205` for it. The no-trigger
  finding rests on the four independent lines of evidence in §1.4; the confirming SQL is there for you.
- **Whether any of the 151 rows genuinely differed from the sheet before the run.** They are all equal to
  it now, and "equal" cannot distinguish "was already equal" from "was overwritten to equal".
- **Whether the outreach console's list view shows the 19 new rows as prospects.** They have no
  `outreach_prospects` row today; I did not trace whether the console creates one on demand.
- The **exact wall-clock moment** I stopped the process, beyond the bounds the data gives: the last
  insert is 12:53:12.65 UTC and the venue stage's 773 failures followed within the same run.
