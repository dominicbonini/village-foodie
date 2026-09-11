# Outreach logo/photo media — DIAGNOSIS ONLY. Two stop conditions hit; no code written.

**9 September 2026.** 🔴 **NOTHING WAS BUILT AND NO FILE WAS EDITED.** No upload was performed, no
storage object created, no database row written, nothing staged. The only file this task creates is this
report. **Two independent stop conditions in your brief were triggered** — one you named explicitly, one
that is an internal contradiction in the brief. Both are below, with the evidence.

---

## 🔴 0. THREE CLAIMS IN THE BRIEF AND MANUAL ARE CONTRADICTED BY THE CODE

### 0.1 The order page does **not** fall back to `discovery_trucks.logo_url`. The fallback was deliberately removed.

**Your brief, item 3:** *"The customer order page reads `trucks.logo_storage_path` and falls back to
`discovery_trucks.logo_url` when that is null."*
**App manual §14 (V7.5 note):** the same claim, at length.

🔴 **Both are stale.** 🔎 `lib/truck-logo.ts:21-28` is the whole of `resolveTruckLogo`:

```ts
export async function resolveTruckLogo(
  _supabase: SupabaseClient, _truckId: string, logoStoragePath: string | null
): Promise<string | null> {
  if (!logoStoragePath) return null
  return `${...}/storage/v1/object/public/truck-media/${logoStoragePath}`
}
```

**It returns `null`. There is no query and no fallback** — note `_supabase` and `_truckId` are underscore-
prefixed and unused. 🧪 `grep discovery_trucks app/api/menu/[truckId]/route.ts` → **exit 1, no match**.

🔎 The file's own header states why, and it is a good reason: *"There used to be a fallback here… That
made REMOVAL IMPOSSIBLE TO SEE — an operator who cleared the logo in Settings watched the header keep
showing one… 'Removed' and 'never uploaded' are the same row, so no fallback can honour both."* The
signature kept its two unused parameters so the four call sites did not have to change.

**What is true instead:** `trucks.logo_storage_path` is the **only** source for the operator manage
header, operator dashboard, customer order page and order confirmation. `discovery_trucks.logo_url`
reaches **none** of them.

### 0.2 🔴 `/logos/…` and `/photos/…` are NOT bucket prefixes. They are static files in this repository.

This is the finding that stops the build, and the brief assumes the opposite throughout.

🧪 `public/logos/` holds **122 files** and `public/photos/` holds **76**, all **tracked in git**
(`git ls-files public/logos` → 122; `git check-ignore` → not ignored). They are served by Next as static
assets and deployed with the app.

🧪 Re-derived over the **231** rows this page loads, checking each stored value against the filesystem:

| | |
|---|---|
| leading-slash values that resolve to a real file in `public/` | **186** |
| leading-slash values that resolve to **nothing** | **1** — `Chai Stall photo_url=/photos/chaistall.jpg` |
| absolute URLs, and where they point | **44**, all to **Supabase `truck-media`** |

**So the column holds two different storage systems**, and the shape tells you which:

- `/logos/x.jpg` → **a file committed to `public/logos/`**. 🔴 **A serverless function cannot write here.**
- `https://…/storage/v1/object/public/truck-media/…` → **the Supabase bucket**, which *is* writable at runtime.

⚠️ **The Chai Stall row is a live instance of the exact silent failure your brief warns about** — a
leading-slash path with no file behind it, rendering as a blank slot on a public page today. It is
pre-existing; I changed nothing.

### 0.3 The screenshot-upload tab is not a precedent — confirmed, as you said

🔎 Verified rather than assumed: `app/api/admin/screenshot-events/route.ts` contains **no** `storage`,
`BUCKET` or upload call. Scraper manual §21.1 is accurate. **I did not model anything on it.**

---

## 1. 🔴 STOP CONDITION 1 — the file already carries two unstaged layers

**`git status`, verbatim, before anything:**

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   components/admin/OutreachPanel.tsx

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/outreach-filter-ux-report.md
	docs/outreach-table-report.md
	lib/outreach-filter.ts

no changes added to commit (use "git add" and/or "git commit -a")
```

🧪 `components/admin/OutreachPanel.tsx` is **+276 / −54** against HEAD, and HEAD contains **none** of the
previous two tasks' work — `FILTER_CONTROLS`, `FilterChip`, `matchesOutreachFilter`, `scheduleState`,
`Clear all` and `nextAction` are all **0 occurrences in HEAD** and present in the working copy.

**Your instruction:** *"If `components/admin/OutreachPanel.tsx` still carries uncommitted work from the
previous two tasks, STOP and tell me before writing anything… a third unstageable layer in it is not
acceptable."* **It does. I stopped.**

---

## 2. 🔴 STOP CONDITION 2 — two instructions in the brief cannot both be satisfied

> *"It writes to a PUBLIC storage bucket"* … *"🔴 WRITE LEADING-SLASH PATHS, and pick the prefix BY
> COLUMN: logo → `/logos/…`, photo → `/photos/…`."* … *"The bucket is public and flat within a prefix."*

**These describe two different stores.** Per §0.2, `/logos/…` is `public/logos/` in the repo; the bucket
is `truck-media`. Uploading bytes to `truck-media/logos/<id>.jpg` and then writing `/logos/<id>.jpg` into
the column produces a value that resolves to **a static file that does not exist** — the slot renders
blank, on a public page, for **every** upload. That is precisely the silent failure your own brief calls
out, arriving through a different door than the prefix mix-up you anticipated.

⚠️ **The brief's premise "the bucket is flat within a prefix" is also not the bucket's actual shape:**
🧪 the 44 bucket-hosted values are `truck-media/<truck-id>/<timestamp>-<name>.jpg` — **per-truck folders**,
which is what `get_upload_url` writes (§3.1). There is no `logos/` prefix inside the bucket at all today.

**The resolution I would propose, and am NOT acting on without your word:** write the **absolute Supabase
URL**, which is the shape **44 rows in this very column already use and which renders correctly today**.
`formatImageUrl` passes `http…` through untouched (§3.2), so both shapes keep working and no consumer
changes. The prefix-by-column rule then moves inside the bucket path rather than into the column value.

**I am not choosing between your two instructions. Which do you want?**

---

## 3. THE DIAGNOSIS YOU ASKED FOR

### 3.1 The existing persistent-media upload path — it exists, and 🔴 it is not reusable here

🧪 A repo-wide sweep for `storage.from(` across `.ts`/`.tsx`/`.js` (excluding `node_modules`, `.next`,
`docs`, `scripts`) returns **exactly one app-side site**:

🔎 **`app/api/manage/route.ts:1565-1571`, action `get_upload_url`:**

| | |
|---|---|
| bucket | **`truck-media`** |
| path convention | **`${truck.id}/${Date.now()}-${filename}`** — per-truck folder, timestamp-prefixed name |
| mechanism | **`createSignedUploadUrl(path)`** → returns a signed URL; **the CLIENT then PUTs the bytes** |
| gate | **`dashboard_token`** (an operator credential), **not** `verifyAdmin` |
| returns | `{ upload_url, path }` |

🧪 **There is no shared client helper.** The three-step dance is hand-rolled at **five** call sites —
`app/manage/[token]/page.tsx:3612` (menu item photo), `:3634` (→ `upsert_item`), `:3658`
(→ `update_settings { allergen_info_url }`), `:9414` (→ `update_settings { logo_storage_path }`), and
`components/DemoGetStarted.tsx:598`. Each does `api('get_upload_url') → fetch(PUT) → write the column`.

🔴 **Why it cannot be reused as-is** — stated *before* building anything, because §51.7 records a "reuse"
that was a fourth independent implementation:

1. **Wrong gate.** It authenticates on `dashboard_token`. The outreach page is `verifyAdmin`-gated and
   holds no dashboard token for a prospect — most prospects have no `trucks` row at all.
2. **Wrong id space.** It writes under `${truck.id}` — an **operator** truck id. These are
   `discovery_trucks` rows; 227 of the 231 have no operator truck.
3. **Wrong model for this brief.** It is a **signed-URL client PUT**. Your brief requires *"THE WRITE GOES
   THROUGH THE SERVER, SERVICE ROLE… No client-side storage call."* A signed-URL PUT is a client-side
   storage call (it does not use the anon key, but the bytes go from browser to storage).

⚠️ **So: a genuine precedent exists for the *shape* — one bucket, per-entity folder, timestamped name,
column written after the bytes land — and I would follow that shape. But the route itself cannot be
called from this page.** That is a new server action on the existing admin route, and I am flagging it as
new rather than describing it as a reuse.

✅ **What IS directly reusable, and I would use it:** 🔎 `app/api/admin/outreach/route.ts`'s own
`update_prospect` already writes `discovery_trucks` — resolving `discovery_truck_id` from the prospect id
and updating with the **service role** behind **`verifyAdmin`**, for `contact_email` and `phone`. **Same
route, same gate, same table, same pattern.** The column write belongs there.

### 3.2 `formatImageUrl(rawPath, defaultFolder)` — 🔎 `lib/image-utils.ts`

| input | output |
|---|---|
| `null` / `''` | `''` |
| starts with `http` | **passed through untouched** |
| starts with `/` | **passed through untouched** |
| anything else (bare filename) | `` `/${defaultFolder}/${cleanPath}` `` |

**The second argument is the default folder, and it is used ONLY in the bare-filename case.**

⚠️ 🧪 **It is therefore inert on all 231 rows today** — every stored value is `http…` or `/…` (44 + 109
logo, 78 photo, re-derived), so **no value currently reaches the branch that uses it**. It would matter
only if something started writing bare filenames. Both shapes render; that is why 44 absolute URLs and
109 static paths coexist in one column without a consumer noticing.

### 3.3 🔴 THE TRADING-TRUCK PATH — Gusto is reachable, but no write can touch it

Answering your three questions exactly, all 🧪 re-derived:

| question | answer |
|---|---|
| Does Pizzeria Gusto have a `discovery_trucks` row? | **YES**, linked `hatchgrab_truck_id = 'pizzeria-gusto'` |
| Is it reachable from this page's 231 prospects? | 🔴 **YES** — its `discovery_truck_id` is in `outreach_prospects` |
| Is its `logo_storage_path` null? | **NO.** `trucks.logo_storage_path = "pizzeria-gusto/1781784850351-pizzeriagusto.jpg"` |

**And the decisive one, which your brief did not ask but which settles it:** 🧪 Gusto's discovery row has
**`logo_url = "/logos/pizzeriagusto.jpg"` and `photo_url = "/photos/pizzeriagusto.jpg"` — both already
populated.**

🔴 **So there are three independent reasons a write from this page cannot change what a Gusto customer
sees, and any one of them alone is sufficient:**

1. **Both of Gusto's slots are FILLED.** The feature writes **empty slots only** — *"DROPPING ONTO A
   FILLED SLOT IS OUT OF SCOPE"* — so Gusto's cells are not drop targets at all.
2. **`trucks.logo_storage_path` is set**, so the operator upload is what every operator- and
   customer-facing surface resolves.
3. **No surface reads `discovery_trucks.logo_url` for a trading truck anyway** (§0.1) — the fallback was
   removed.

⚠️ **The same holds for the other three linked trucks** — 🧪 Real Thai Food and Tikka Tonic both have
`logo_url` and `photo_url` populated and a non-null `logo_storage_path`. **Test Kitchen is the one
exception**: `photo_url` is **null**, so its photo slot *would* be a drop target — but it is a test truck,
not a trading one, and its `logo_url` is an absolute `truck-media` URL.

**I am therefore NOT stopping on item 3.** Stop conditions 1 and 2 stand on their own.

### 3.4 Existing admin writes to `discovery_trucks` — yes, three, all service role

| site | what | gate |
|---|---|---|
| 🔎 `app/api/admin/route.ts:87` | `show_on_vf`, `show_on_hg`, **`excluded`**, `visibility` — the excluded toggle | `verifyAdmin` + service role (`:7`, `:17`) |
| 🔎 `app/api/admin/outreach/route.ts` `update_prospect` | `contact_email`, `phone` | `verifyAdmin` + service role |
| 🔎 `app/api/admin/create-operator/route.ts:97` | `excluded: true` on the shadow row | admin route |

⚠️ **The "Link HG truck" dropdown no longer writes** — 🔎 the comment at `app/api/admin/route.ts:81` says
`hatchgrab_truck_id` *"is no longer set from the UI"*. Your brief listed it as a candidate; it is not one.

✅ **The precedent is established and consistent: admin writes to `discovery_trucks` go through
`verifyAdmin` + service role on a server route. Nothing here needs to widen that.**

---

## 4. WHAT I WOULD BUILD, ONCE YOU UNBLOCK BOTH STOPS

Recorded so the decision is on the table, **not built**:

- **Ordering (your item 1).** Logo far left, **photo immediately after it** — no reason found to separate
  them; they are the same kind of thing and the two filters then sit adjacently in the bar under the
  existing column-order rule.
- **Filename scheme (your item 2).** `<discovery_truck_id>-<timestamp>.<ext>` inside a per-column folder,
  mirroring `get_upload_url`'s `${id}/${Date.now()}-…`. The discovery truck id is a uuid, so collision
  between two trucks is impossible; the timestamp keeps a re-upload from overwriting.
- 🔴 **The orphan-file ordering you asked about.** Bytes must land before the column can reference them,
  so the failure window is real and one-directional: **upload succeeds → DB write fails → a public object
  exists that nothing references.** I would (a) write the column immediately after the upload with no
  work in between, (b) on DB failure **delete the just-uploaded object** and report the failure in the
  UI, and (c) if that cleanup *also* fails, log the orphan path explicitly rather than swallowing it.
  ⚠️ **The reverse ordering is not available** — a column written first would point at nothing, which is
  the silent-blank failure again.
- **Filters (your item 3).** Two presence clauses, Any / Has / Missing, added *after* the existing
  clauses in `matchesOutreachFilter` with nothing above them touched — the same additive shape as the
  `nextAction` clause, which was proven not to disturb any existing count.
  ⚠️ **A presence filter proves nothing if the column is populated on every row.** 🧪 It is not: logo is
  **153 present / 78 absent**, photo **78 / 153** — both proper subsets, so each filter will visibly
  narrow.
- **Replacing a filled slot (out of scope, as instructed).** It would need a delete endpoint that does
  not exist (🔎 `app/manage/[token]/page.tsx:9385` records the same gap for operator logos), a decision
  about whether to remove the old object or leave it, and — for the 186 rows pointing at `public/` — a
  rule for what replacing a *repo static file* even means, since the app cannot delete one. **Stopped
  there.**

---

## 5. EVIDENCE CLASS — what is proven and what is not

- 🧪 **Executed against real data:** every count in §0.2 and §3.3 (231 prospects, 44/109/78 shapes,
  186 resolving + 1 not, Gusto's four column values, the four linked trucks). Pagination was not a factor
  — `discovery_trucks` and `outreach_prospects` were read whole and cross-checked against
  `outreach_prospects` = 231.
  ⚠️ **These are direct service-role reads of the tables. Not the route, not the page.**
- 🔎 **Source-read:** `lib/truck-logo.ts`, `lib/image-utils.ts`, `app/api/manage/route.ts:1565`, the five
  upload call sites, the three `discovery_trucks` write sites, `app/api/menu/[truckId]/route.ts`.
- ✅ **Filesystem-verified:** `public/logos` 122 files, `public/photos` 76, both git-tracked.
- 🔴 **NOT verified, because nothing was built:** no upload, no storage write, no column write, no render.
  **No admin session is obtainable here** (manual: "NO ADMIN SURFACE CAN BE VERIFIED BEFORE THE OPERATOR
  SEES IT"), so even had I built it, no upload could have been claimed to succeed.
- ⚠️ **Failure mode of the §0.2 proof, stated:** a file-existence check that pointed at the wrong
  directory would report everything missing, and one that silently passed would report everything
  present. **Neither happened — it returned 186 present and 1 missing**, and the single miss is a named
  row (`Chai Stall`) I can quote, which is what a working check looks like.

---

## 6. THE TWO QUESTIONS I NEED ANSWERED

1. **Commit or stash the two pending layers in `components/admin/OutreachPanel.tsx`**, so this task's
   hunks are stageable on their own — or tell me to proceed and accept a third layer.
2. **Which store do you want written?** Bucket + **absolute URL** (works today, 44 rows prove it), or
   something that puts files under `public/logos` (which a deploy can do and a running app cannot).
   **I did not choose.**
