# Outreach logos: reaching the demo, and one authoritative store

**15 September 2026.** Two defects, in order. **No migration, no backfill, no SQL run, no
`outreach_templates` row written.** tsc clean; lint rule-for-rule identical to HEAD `4d4e5b6`.

---

## 0. PREMISES — one framing in the brief is wrong, and one is nearly right

### 0.1 🔴 "MATCH ON THE BUCKET, NOT THE FOLDER" — the storage branch ALREADY matched on the bucket.

The brief says the classifier "recognises two shapes and refuses the outreach one", and that "four folder
patterns in, the list is still growing". **There was never a folder list in the bucket branch.** READ, the
pre-fix `classifyDemoLogoSource`: branch 2 tested `raw.startsWith(origin + '/storage/v1/object/public/truck-media/')`
and then accepted **any** object path after it. A folder has never been part of that test.

🧪 **Driven, not argued.** The pre-fix function, compiled from `git show HEAD:lib/demo-logo.ts`, over the
outreach shape in both spellings:

```
REFUSED  outreach drag-and-drop   fc15d42b-…/logos/1757900000000-pigcasso.png
STORAGE  the SAME value as a full URL   → objectPath fc15d42b-…/logos/1757900000000-pigcasso.png
```

**The real defect is the spelling, not the folder.** `formatImageUrl` runs first, and it rewrites any
value with no scheme and no leading slash to `/logos/<value>`. A bare bucket path therefore arrived at the
*static repo file* branch, which refused it for containing a slash — so it **never reached a bucket branch
at all.** That is why three of the four live shapes failed, including the two that have nothing to do with
outreach (`discovery-logos/…` from the scraper and `<truck-id>/…` from operator Settings).

This matters for the answer the brief asked for, below (§1.2): a bucket-level rule was not a loosening of
the storage branch — it was giving bare paths a way to reach it.

### 0.2 The refusal was not quite invisible — it was *quiet*, which is worse than either.

The brief says Pig-Casso's "provisioned unbranded with nothing on screen". READ: the plumbing already
existed end to end — `copyDemoLogo` → `warnings.push('Logo not copied — …')` → the route's
`warnings: result.warnings` → `CreateDemoModal`. What was on screen was a grey one-liner ("No logo was
copied — the QR shows the 'Your logo here' plate") with the **reason** filed inside a collapsed
`<details>Notes (n)</details>` alongside incidental notes. So there was something; it did not say why, and
nothing made it worth opening. Fixed in §1.3.

### 0.3 My own §2.4 was wrong, as Dominic established. Acknowledged and not built on.

`docs/truck-logo-single-store-report.md` §2.4 claimed a documented assumption was contradicted by
Pig-Casso's. Pig-Casso's `hatchgrab_truck_id` is **null** — it is not a linked truck, so it was never
evidence of anything about linked trucks, and query B returned zero rows. Nothing in this build rests on
it. (The comment it referred to is still rewritten — but for a different and now-correct reason: §2.5.)

### 0.4 Where the "extend the refusal" instruction was resolved rather than followed literally.

The brief asks both for "an explicit confirmation … before any write" **and** to "extend the delete path's
public-visibility refusal from photos to logos". A flat refusal and a confirmation are different things and
cannot both apply to the same write. **Built: a confirmation.** A photo refusal is right because a
discovery photo is a *fallback* the operator cannot reach from anywhere; under Option A a logo **is** the
operator's own logo, and refusing to let Dominic change it would make the feature unusable. The guard is a
**name-echo** confirmation on both write paths — §2.4. Flagged here in case a hard refusal was meant.

### 0.5 What is in the tree, so Dominic sees what he is committing together.

HEAD is still **`4d4e5b6`**; nothing is committed. The tree holds **two unrelated bodies of work**:

| Work | Files |
|---|---|
| **Outreach templates / snippets** (earlier, uncommitted) | `TemplatesPanel`, `ComposeWindow`, `lib/outreach-template-render`, deleted `lib/outreach-globals`, `lib/outreach-snippets`, `app/api/admin/outreach-snippets/`, `supabase/migrations/20260916_outreach_snippets.sql` (**unapplied**), 4 docs |
| **This task** | `lib/demo-logo.ts`, `lib/provision-demo.ts`, `app/api/admin/provision-demo/route.ts`, `components/admin/CreateDemoModal.tsx`, **new** `lib/outreach-logo-target.ts`, `app/api/admin/outreach/route.ts`, `components/admin/OutreachPanel.tsx`, `components/DemoGetStarted.tsx`, `app/manage/[token]/page.tsx` |

`components/admin/OutreachPanel.tsx` is the one file **both** touched.

---

## 1. DEFECT 1 — outreach-uploaded logos never reached a demo

### 1.1 What was wrong

`classifyDemoLogoSource` never saw three of the four live shapes, for the reason in §0.1. `copyDemoLogo`
therefore returned `{ logoStoragePath: null, source: refused }`, `provisionDemo` never wrote
`trucks.logo_storage_path`, and the demo provisioned unbranded.

⚠️ **One more condition worth naming**, READ from `lib/provision-demo.ts`: the copy runs only inside
`if (!input.existingTruckId && input.discoveryTruckId)`. A demo created **without** a discovery id copies
no logo at all, and always did. §5 SQL B says which of the two happened to Pig-Casso's.

### 1.2 🔴 Does a bucket-level rule preserve the security property exactly? **Yes — and here is why.**

The property the refusal exists to protect is: **no server-side reference to an untrusted HOST, and no
filesystem read outside `public/logos`.** The rewritten classifier has four branches, ordered so that the
only one able to name a host is tested first:

| Branch | Input | Touches | Rule |
|---|---|---|---|
| 1 | anything with a scheme (`https:`, `data:`, `file:`) | nothing | **must be one of OUR origins + this bucket, else REFUSED** — unchanged |
| 2 | leading `/` | **the filesystem** | `/logos/<basename>` + character class — **unchanged, still strict** |
| 3 | bare, contains `/` | nothing | **a bucket object path** — the new branch |
| 4 | bare filename | **the filesystem** | normalised to `/logos/<name>`, same character class |

Branch 3 performs **no fetch and no disk read**. A value there has no scheme, so it *cannot name a host*;
it records a string that `resolveTruckLogo` later concatenates into a public URL for our own bucket.
Widening which folders it accepts cannot widen the host check (branch 1) or the disk check (branch 2),
because it is not either of them. **A fifth folder next month needs no code change.**

⚠️ **What it does allow, stated:** a scraper could write `nonexistent/x.png` and it will now be stored and
render as a **broken image** rather than as no logo. That is a wrong picture, not an untrusted one — and
it is the identical failure mode the column already has on every display surface.

### 1.3 The refusal is now visible at creation

`ProvisionDemoResult` gains `logoNote` — one sentence fit to show a human, kept **separate from
`warnings`** precisely because warnings are a collapsed list. The route returns it; `CreateDemoModal`
renders an **amber panel**: *"This demo is unbranded — no logo was copied."* plus the reason and what to
do. It is not a disclosure triangle.

### 1.4 Verification — 20 + 7 assertions, controls first

*What a green-but-meaningless result would be:* a harness that only checked "the four live shapes are
accepted" would pass equally against a classifier that accepted **everything**, `evil.example.com`
included. So every acceptance is paired with a refusal over the same function, and both are pointed at
broken variants first.

```
── CONTROLS (each must FAIL) ──
  ✓ FAILED as required  C1 the OLD classifier accepts all four live shapes
  ✓ FAILED as required  C2 an accept-everything stub still refuses external hosts
  ✓ FAILED as required  C3 the external set overlaps the live set

── OLD vs NEW on the four LIVE shapes ──
  static (seeded)          old=static   new=static
  scraper bucket folder    old=refused  new=storage  discovery-logos/pig-cassos.png
  operator Settings path   old=refused  new=storage  a1b2c3d4-…/1757800000000-logo.jpg
  outreach drag-and-drop   old=refused  new=storage  fc15d42b-…/logos/1757900000000-pigcasso.png

── EXTERNAL AND HOSTILE INPUT (all REFUSED) ──
  ✓ plain external host   ✓ external mimicking our path   ✓ data: URL
  ✓ file: URL             ✓ protocol-relative             ✓ our host, wrong bucket
  ✓ /logos traversal      ✓ absolute path outside /logos  ✓ bare non-image name
✅ all 20 passed
```

🔴 **The external refusal is proved with a deliberately external value**, as required — including one that
*mimics our own storage path on another host* (`https://evil.example.com/storage/v1/object/public/truck-media/…`),
which is the case a naive "does it contain truck-media" test would wave through.

**End to end**, driving the real `copyDemoLogo` against a client that **records every call**, so "it never
fetched" is observed rather than asserted:

```
── CONTROL (must write nothing) ──
  ✓ REFUSED, zero writes, zero uploads — external host

── THE OUTREACH SHAPE, END TO END ──
  source=storage  logoStoragePath=fc15d42b-…/logos/1757900000000-pigcasso.png
  updates=[{"table":"trucks","patch":{"logo_storage_path":"fc15d42b-…"},"id":"demo-truck-1"}]
  uploads=[]
  → renders as https://…/storage/v1/object/public/truck-media/fc15d42b-…
✅ all 7 passed
```

A demo built from an outreach-uploaded logo now writes `logo_storage_path` and **renders branded**, moving
zero bytes — it points at the object the outreach upload already put in the bucket.

---

## 2. DEFECT 2 — one authoritative store (Option A)

### 2.1 The rule, in one new pure module

`lib/outreach-logo-target.ts` — `resolveLogoTarget`, `isPubliclyVisible`, `needsTruckConfirmation`. It
decides **which row owns a prospect's logo** and nothing else. The route's read path and both write paths
call the same function, so a write can never disagree with what the list showed.

| State | Authoritative column | Shape |
|---|---|---|
| Real truck (`discovery_trucks.hatchgrab_truck_id`) | `trucks.logo_storage_path` | bucket path |
| Live demo only (`demo_sessions.discovery_truck_id` → `truck_id`) | `trucks.logo_storage_path` | bucket path |
| Neither | `discovery_trucks.logo_url` | full URL |

### 2.2 🔴 A demo, a real truck, or BOTH — what was built

**Dominic's steer, implemented exactly: the real truck wins.** A prospect with both a live demo and a real
truck writes to the **real** truck; the demo keeps whatever it was provisioned with and expires anyway.
🧪 Asserted directly — *"BOTH: the id written to is the REAL truck, not the demo"*.

⚠️ **An expired demo is never a target.** The cleanup is hourly so expired rows exist briefly, and writing
a logo onto one would be writing to a truck about to be deleted.

### 2.3 Shape conversion — and why none was needed on the write path

The brief requires reusing `classifyDemoLogoSource`'s URL→path conversion rather than re-implementing it.
**The upload path needs no conversion at all:** it has just uploaded the object and already holds `path`,
which is exactly what `logo_storage_path` wants. `classifyDemoLogoSource` remains the single URL→path
converter and is still the one `copyDemoLogo` uses. **No second converter was written** — that is the drift
the file already warns about.

For **display**, path→URL goes through `resolveTruckLogo`, the one resolver, awaited in the row map. (The
row map became `async` + `Promise.all` purely so that shared function could be awaited; it is declared
`async` but performs **no I/O**, so this adds no round trips.)

### 2.4 🔴 THE GUSTO GATE — exactly which writes are gated

**Predicate, named as asked:** `needsTruckConfirmation(target)` ≡ `target.kind === 'truck' && target.publiclyVisible`,
where `publiclyVisible` ≡ `active === true && excluded !== true && (show_on_vf === true || show_on_hg === true)`.
It **fails closed**: a row with unknown flags is not public. 🧪 Both directions asserted, each flag on its own.

| Write | Gated? |
|---|---|
| Logo **upload** onto a real, publicly-visible truck | 🔴 **YES** — confirmation naming the truck |
| Logo **delete** on a real, publicly-visible truck | 🔴 **YES** — same |
| Logo write on a **demo** truck | no — disposable, expires, on no public map |
| Logo write on a linked truck that is **not** public (inactive/excluded/neither site) | no — nothing a customer can reach changes |
| Logo write on an **unlinked** prospect | no — it is scraped prospect metadata |
| Any **photo** write | no change whatsoever — still `discovery_trucks.photo_url`, still the existing hard refusal |

**It is not a delete-only guard.** Replacing Pizzeria Gusto's logo changes its order page, its confirmation
email and its QR poster exactly as removing it would, so the upload is gated too.

🔴 **The server demands the truck's NAME back, not a boolean.** A stale tab posting `confirm: true` would
satisfy a boolean; it cannot produce the name. The 409 carries `needsConfirm: true` and the truck name so
the UI can act. The browser confirmation names the truck and the three customer surfaces in words.

### 2.5 The delete path, and the comment that said the opposite

The old comment claimed *"`logo_storage_path` is set on every linked truck that is public, so the discovery
logo is not a live source for any of them. **No logo refusal.**"* Under Option A that reasoning does not
apply at all — the logo of a linked prospect **is** the operator's own `logo_storage_path`, so a delete
removes live branding directly rather than removing a fallback. Rewritten to say how logos *are* guarded.
The photo block below it is untouched and remains a hard refusal.

### 2.6 🔴 NO FALLBACK WAS ADDED — proved

`lib/truck-logo.ts` is **byte-identical to HEAD**: `git diff --stat -- lib/truck-logo.ts` is empty and it
does not appear in `git status`. *Positive control:* the same commands show `lib/demo-logo.ts` at
`72 insertions(+), 20 deletions(-)`.

*What a meaningless check would be:* "the file does not contain the word fallback" — its header contains
it repeatedly, explaining why there isn't one. So the assertions are on the **function body**: it never
names `discovery_trucks`, never calls `.from(`, still returns `null` for a null path, and has exactly two
`return` statements. *Positive control:* the same `discovery_trucks` regex matches the outreach route.

Clearing a logo still clears it everywhere. That is the behaviour `lib/truck-logo.ts` was changed to
guarantee, and nothing here re-introduces what was removed.

### 2.7 The LOGO column tooltip

Was: `discovery_trucks.logo_url…`. Now names what it actually is — *the linked truck's own logo once it has
one (and that changing it changes what its customers see), the prospect's scraped logo until then.*

### 2.8 Verification — 19 + 22 assertions, controls first

*Meaningless green:* a gate returning **true** for everything passes every "Gusto is gated" assertion while
making the feature unusable; a gate returning **false** for everything passes every "demos are not gated"
assertion while leaving Gusto unprotected. Both stubs are run first and both fail.

```
  unlinked prospect            kind=prospect confirm=false
  live demo only               kind=demo     confirm=false
  real truck, public (GUSTO)   kind=truck    confirm=true
  real truck, not public       kind=truck    confirm=false
  🔴 BOTH — real wins          kind=truck    confirm=true   truckId=truck-gusto
✅ all 19 passed
```

Structural, over the real route source — and 🔴 **one assertion failed on the first run against correct
code**: counting `confirmationRefusal(` found three, because the first is the function *definition*. The
test was wrong, not the code; it now counts call sites only.

```
  ✓ the gate is called on the UPLOAD path      ✓ the gate is called on the DELETE path
  ✓ 🔴 the gate is called exactly twice — no third, ungated write path
  ✓ 🔴 the gate compares the supplied NAME, not a boolean
  ✓ upload writes trucks.logo_storage_path     ✓ delete clears trucks.logo_storage_path
  ✓ an UNLINKED prospect still writes the discovery column (and still clears it)
  ✓ the empty-slot check tests the TRUCK row for a linked prospect
  ✓ the old "No logo refusal" comment is gone  ✓ the photo path is still a HARD refusal
✅ all 22 passed
```

⚠️ The empty-slot check now tests the **authoritative** column. Checking `discovery_trucks.logo_url` for a
linked prospect would have called a filled slot empty and silently overwritten a live truck's branding.

---

## 3. `object-contain` for logos — which components changed

`object-cover` fills the box and crops the overflow, which for a wide wordmark in a 40px circle can crop
away every letter — a logo that is present looking exactly like one that is missing.

| File | What |
|---|---|
| `components/admin/OutreachPanel.tsx` | the list cell (`MediaCell`) and the modal thumb (`ModalThumb`) — **logos only**, photos still `object-cover` |
| `components/admin/CreateDemoModal.tsx` | the demo-result logo |
| `components/DemoGetStarted.tsx` | the onboarding logo preview |
| `app/manage/[token]/page.tsx` | 🔴 the **operator's own Settings logo preview** — the box in Dominic's screenshot |

⚠️ The manage-page edit was refused on its first attempt because the anchor matched **twice**; the second
match is a **menu-item photo** at `:4175`, which must stay `object-cover`. Re-anchored on the
`logo_storage_path` expression and re-checked: the menu-item line is unchanged.

🧪 Worth noting: the **customer-facing** order and truck pages already render logos with `object-contain`.
This makes the admin and operator surfaces agree with what customers already see.

---

## 4. Nothing else moved

- **No `outreach_templates` row is written.** None of the nine files this task touched contains the
  identifier except one **comment** in `OutreachPanel.tsx:449`. *Positive control:* the same grep finds it
  6× in `app/api/admin/outreach-templates/route.ts`, which is unmodified.
- **No migration, no backfill.** Both columns already exist; nothing reconciles the three linked trucks
  that already agree.
- **tsc:** clean.
- **Lint:** the 8 changed files that exist in both trees, same eslint and config, HEAD in a detached
  worktree vs the working tree — **308 errors / 76 warnings on both sides, every rule count identical.**
  🔴 An earlier pass showed `no-explicit-any` at **268 → 276**; those eight were mine and were **fixed, not
  declared** — replaced with two named local types (`LogoTruckWithPath`, `LogoScanRow`). The new file
  `lib/outreach-logo-target.ts` lints **0/0** on its own.

---

## 5. SQL FOR DOMINIC — I have not run any of it

**A. Confirm the columns this build names.** Everything was read from source, but this is the cheap check.

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (  (table_name = 'trucks'           and column_name in ('logo_storage_path','active','excluded','show_on_vf','show_on_hg'))
      or (table_name = 'discovery_trucks' and column_name in ('logo_url','photo_url','hatchgrab_truck_id'))
      or (table_name = 'demo_sessions'    and column_name in ('truck_id','discovery_truck_id','expires_at')) )
order by table_name, column_name;
```

**B. Pig-Casso's — which of the two causes it actually was.** If `logo_url` is set and the demo's
`logo_storage_path` is null, it was the classifier (now fixed) and re-creating the demo will brand it. If
`discovery_truck_id` on the demo row is null, the demo was created without a discovery id and no logo was
ever attempted.

```sql
select
  dt.name,
  dt.hatchgrab_truck_id,
  dt.logo_url,
  ds.truck_id            as demo_truck_id,
  ds.discovery_truck_id  as demo_discovery_id,
  ds.expires_at,
  t.logo_storage_path    as demo_logo_path
from public.discovery_trucks dt
left join public.demo_sessions ds on ds.discovery_truck_id = dt.id
left join public.trucks t        on t.id = ds.truck_id
where dt.name ilike '%pig%casso%'
order by ds.created_at desc;
```

**C. 🔴 GUSTO SAFETY CHECK — run before and after using the new controls.** Its `logo_storage_path` must
not change unless you confirmed by name.

```sql
select t.name, t.logo_storage_path, t.active, t.excluded, t.show_on_vf, t.show_on_hg,
       dt.name as discovery_name, dt.logo_url as discovery_logo
from public.trucks t
left join public.discovery_trucks dt on dt.hatchgrab_truck_id = t.id
where t.name ilike '%gusto%' or t.name ilike '%real thai%' or t.name ilike '%tikka%'
order by t.name;
```

---

## 6. A checklist Dominic can walk

1. **Outreach list, Pig-Casso's LOGO cell.** The logo should now be visible whole rather than cropped —
   `object-contain`. Hover the LOGO column header: the tooltip says what the column now is.
2. **Create a demo for Pig-Casso's.** It should come out **branded**. If it does not, the modal now shows
   an **amber panel** naming the reason — read it rather than opening "Notes".
3. **Open its management console → Settings.** The logo should be there and uncropped.
4. **🔴 Pizzeria Gusto — the live truck.** Drag a logo onto its slot, or remove its logo from the modal.
   You must get a confirmation naming *Pizzeria Gusto* and its order page, confirmation email and QR
   poster. **Press Cancel and nothing is written** — check with §5 SQL C.
5. **Test Kitchen** (linked but not public) gets **no** confirmation, by design.
6. An **unlinked** prospect behaves exactly as before — the value goes to `discovery_trucks.logo_url`.
7. Photos are untouched everywhere: same column, same hard refusal, still `object-cover`.

---

## 7. Scope

Nine files written, listed in §0.5. No migration, no backfill, no SQL executed, no database read. No
`outreach_templates` row created, edited, seeded, activated or deactivated. `lib/truck-logo.ts` is
byte-identical to HEAD and **no fallback was added**. Nothing staged, committed or reverted.
