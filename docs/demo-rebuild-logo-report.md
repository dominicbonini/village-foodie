# A rebuilt demo now carries the prospect's current logo

**Date** 19 September 2026 · **Scope** localhost only, nothing deployed · **Trucks written to: none.**
No page, route or API was called with any truck's token; the harness runs against an in-memory Supabase and
storage. Pizzeria Gusto was never touched, and no `outreach_templates` row was read or written.

**The gap, closed.** `copyDemoLogo` was guarded by `!input.existingTruckId` — "first run only" — so a
rebuild never re-copied. A prospect whose logo had been added or changed since their first demo got a
rebuild still branded with the old one, or with none. A rebuild now copies the **current** logo, skips the
work when it already matches, and removes the demo's logo when the prospect no longer has one.

---

## git status — before

**HEAD `231ee26` "landing and demo" · 0 staged · 1 modified · 0 untracked.**

```
 M docs/reference-manual.md      the V13.6 update from the previous task, still uncommitted
```

---

# §1 · The guard, its callers, and what it was protecting

```ts
// ── 2b. BRANDING (outreach, first run only) — logo copy, then qr_code_style ──
if (!input.existingTruckId && input.discoveryTruckId) {
  const logo = await copyDemoLogo(supabase, truckId, input.logoUrl ?? null, { now })
  …
}
```

**`copyDemoLogo` has exactly one caller** — that line in `provisionDemo`. Nothing else in `lib`, `app`,
`components` or `scripts` calls it.

**Why the guard was there.** The comment says "first run only" and "a logo is decoration on a disposable
truck", which reads as cost-avoidance. It is more specific than that, and the specifics are what made a
blanket removal unsafe:

| source kind | what `copyDemoLogo` does | cost of re-running |
|---|---|---|
| `storage` (a URL on our own `truck-media`) | points `logo_storage_path` at an object that already exists — **no upload, no copy** | none; idempotent |
| `static` (a file under `public/logos`) | reads the file and **uploads** it as `<truckId>/<epoch-ms>-<file>` | **one orphaned object in the bucket per rebuild**, for a file that has not changed |
| `none` / `refused` | writes nothing | none |

So re-copying on every rebuild would break nothing functionally, but it would leave a trail of duplicate
objects for every template-menu demo that is rebuilt — and the `static` path's name carries the upload's
timestamp, so the duplicates are not even detectable by name collision. **That is the thing the guard was
protecting, and the fix keeps it** in a narrower form that a changed logo can get past.

# §2 · The fix, by symbol, and how the comparison works

**`lib/demo-logo.ts`**

| symbol | what it does |
|---|---|
| **`demoLogoUpToDate(source, truckId, stored)`** *(new, exported)* | does the truck already hold exactly what this source would produce? |
| `copyDemoLogo(…, opts)` | `opts.existing` puts it in **rebuild mode**: skip when up to date, clear when the prospect has none, copy otherwise |
| `CopyDemoLogoResult` | gains `unchanged?` and `cleared?` so the caller can tell the three outcomes apart |

**How the two are compared** — differently per source, because they have to be:

- **`storage`**: the value that *would* be written **is** `source.objectPath`, so it is compared to the
  stored path directly. Equal ⇒ nothing to do.
- **`static`**: the stored path carries the upload's timestamp (`<truckId>/<epoch>-<file>`), so a string
  comparison is impossible. It is matched against `^<truckId>/\d+-<file>$` — the truck's own prefix and the
  file name the path ends with, which together identify the same source file. A different file, or another
  truck's object, does not match.
- **`none`** and **`refused`** are not comparisons; the caller decides what they mean (below).

**`lib/provision-demo.ts`** — the guard is replaced by three cases:

```ts
if (input.existingTruckId && !input.discoveryTruckId) { …read logo_storage_path back, touch nothing… }
else if (input.discoveryTruckId) {
  let existing: string | null | undefined
  if (input.existingTruckId) { …read the truck's current logo_storage_path… }
  const logo = await copyDemoLogo(supabase, truckId, input.logoUrl ?? null, { now, ...(existing !== undefined ? { existing } : {}) })
  …
}
```

🔴 **The first branch is not an oversight.** Only `discoveryTruckId` carries the prospect's current logo;
without one there is no `logoUrl`, which classifies as "no logo" — and on a rebuild that would **clear a
perfectly good brand** on the strength of a question nobody asked. A re-provision with no discovery id
therefore reads the stored value back and touches nothing, exactly as it did before today. The outreach
modal always sends `discoveryTruckId`, so the rebuild path in the product always takes the second branch.

# §3 · The five cases, and what the modal says in each

The modal raises the amber box on `!result.logoStoragePath` and prints `logoNote` beneath it.

| # | situation | stored after | the modal says |
|---|---|---|---|
| 1 | **No logo anywhere** (prospect has none, first build) | `null` | 🟠 *"This demo is unbranded — no logo was copied."* + *"This prospect has no logo stored, so the demo is unbranded."* |
| 2 | **Copied on the first build** | the new path | nothing — no warning |
| 3 | **Logo ADDED before a rebuild** | the new path | nothing — the warning stops showing |
| 4 | **Logo CHANGED before a rebuild** | the **new** path | nothing — no warning |
| 5 | **Prospect's logo REMOVED before a rebuild** | `null` | 🟠 *"This demo is unbranded — no logo was copied."* + *"This prospect no longer has a logo, so the demo's has been removed and it is unbranded."* |

Case 5's note is deliberately **not** case 1's. "The prospect has none" and "the prospect's was removed, so
the demo's has been too" are different facts, and the second one is the admin's own doing.

**A sixth, which is not in the five but must not regress:** a **refused** source (a logo URL that is not on
one of our origins) **leaves the working brand alone** and says *"The logo was refused: …"*. We could not
read the new logo, so we do not know that it differs — throwing away a working brand on the strength of a
URL we could not parse would be a guess.

# §4 · The QR plate follows the same answer

The dashboard's `showBrandedQr` is `hasFeature(plan,'branded_qr_code') && truck.qr_code_style === 'branded'`,
and `DemoWelcome` passes `truck.logo` only under that same predicate; `generateQRWithLogo` prefers a real
logo over the `'Your logo here'` plate. So:

- a copy (cases 2, 3, 4) writes `qr_code_style: 'branded'` — as before, and now **also on the unchanged
  case**, so a rebuild cannot leave a branded truck reading `standard`;
- **case 5 sets it back to `'standard'` and nulls `logo_storage_path` in the same statement**, inside
  `copyDemoLogo`, so the branded composite can never render with an empty centre. The plate returns.

# §5 · Nothing else changed

No change to the Create Demo controls, the validation, the seeder, the event window, the introduction, or
any other panel. `lib/provision-demo.ts`'s diff is the branding block; `lib/demo-logo.ts`'s is the predicate
and the rebuild mode.

---

# PROOF

## `scripts/demo-rebuild-logo.cjs` — new, listed (the suite is now 58)

**Failure mode:** a demo branded with a logo its prospect no longer uses, or a modal that describes the
wrong one. The real `copyDemoLogo`, `demoLogoUpToDate` and `classifyDemoLogoSource` are compiled from
`lib/` and run against an in-memory Supabase whose `storage.upload` **counts** — so "did no copying work"
is observed, not asserted.

**Both broken variants ran FIRST and FAILED as required:**

```
  ✓ FAILED as required  V1 the guard restored: after a logo CHANGE the demo still holds "discovery/old-logo.png"
  ✓ FAILED as required  V2 the unchanged case reporting null: the modal would call a branded demo unbranded
```

**The real tree:**

```
── A REBUILD AFTER A LOGO CHANGE ────────────────────────────────────────────────────────
  ✓ the demo now holds the NEW logo: "discovery/new-logo.png"
  ✓ and trucks.logo_storage_path was written
  ✓ reported as a real copy — not unchanged, not cleared, no error

── A REBUILD WITH AN UNCHANGED LOGO DOES NO WORK ────────────────────────────────────────
  ✓ the same logo is recognised and kept
  ✓ no upload and no write: 0 upload(s), 0 update(s)
  ✓ a static logo is recognised by the truck prefix and the file name, not by the timestamp in the path
  ✓ a DIFFERENT static file is not mistaken for it
  ✓ and another truck's object is not either

── THE FIVE CASES THE WARNING MUST GET RIGHT ────────────────────────────────────────────
  ✓ no logo anywhere → nothing stored, source "none" — the warning shows
  ✓ copied on the first build → stored — no warning
  ✓ a logo ADDED before a rebuild → copied now — the warning stops showing
  ✓ a logo CHANGED before a rebuild → the new one is stored — no warning
  ✓ the prospect's logo REMOVED → the demo's is removed too, and the warning shows again
  ✓ §4 the QR plate follows: logo_storage_path null and qr_code_style "standard" — the branded composite cannot render with an empty centre
  ✓ a REFUSED source leaves the working brand alone and says why — it is not evidence the logo changed

── THE FIRST BUILD IS UNCHANGED ─────────────────────────────────────────────────────────
  ✓ a FIRST build with no logo records null and clears nothing — only a rebuild may remove a logo
```

⚠️ **One thing the first draft of this harness got wrong, recorded because it nearly passed.**
`classifyDemoLogoSource` decides whether a URL is ours from `ownStorageOrigins(process.env)`. With no
origin set, **every absolute URL is `refused`** — so both broken variants "failed as required" for the
wrong reason, testing the refused branch rather than the comparison. The harness now sets a fixed fake
project origin before the module is compiled.

## `scripts/demo-seed-parameters.cjs` — its ITEM 1 block restated

That block asserted the *previous* fix: that a rebuild reads `logo_storage_path` back, and that
`copyDemoLogo` is **never** re-run on a rebuild. The second half is exactly what this task overturns, so it
is restated to assert the wiring this file owns — that a rebuild is routed **into** the copier with
`existing`, that the "first run only" guard is gone, that a re-provision with no discovery id still only
reads, and that the note distinguishes "has none" from "was removed". The behaviour itself is proven in the
new harness against the real copier.

---

# VERIFICATION — true exit codes

| command | exit |
|---|---|
| `node scripts/demo-rebuild-logo.cjs` | **0** (16 assertions; V1–V2 failed first) |
| `node scripts/demo-seed-parameters.cjs` | **0** |
| `node scripts/run-harnesses.cjs` | **0** — 58 run · 58 passed · 0 failed |
| `npx tsc --noEmit` | **0** |
| `npx next build` | **0** |

**Goldens — unchanged, byte for byte. No generator was run.**

| golden | sha256 |
|---|---|
| `scripts/fixtures/batch-rolling-golden.json` | `8bdae817748ad334bdac297592f19a58550fd17bc5ce7424331d73df82f32660` |
| `scripts/fixtures/batch-reservation-golden-on.json` | `e3f0a88099fd797c659da57881febc378e928dbc7bc8283a6931c814d6b29222` |

## eslint, per rule, against a clean HEAD worktree (`231ee26`)

| rule | HEAD | working tree | delta |
|---|---|---|---|
| `@typescript-eslint/no-require-imports` (error) | 4 | 4 | 0 |

**Zero delta.** `lib/demo-logo.ts` and `lib/provision-demo.ts` lint clean on both sides; the new harness
reports 4 `no-require-imports`, the house pattern for `.cjs` harnesses.

---

# LOCALHOST CHECK for Dominic

1. `npm run dev`, sign in as an admin, open the outreach console and pick a **test prospect that already
   has a demo**.
2. **Change its logo** — drag a different image onto the prospect's logo in the modal, or clear it.
3. Press **Rebuild** beside the demo link, set whatever kitchen numbers you like, and **Rebuild the demo**.
4. *Expect, with a NEW logo:* no amber box, and the result panel shows the link. Open the demo, dismiss the
   introduction, and press the QR button — the **new** logo is in the centre of the code.
5. *Expect, with the logo REMOVED:* the amber box, reading *"This demo is unbranded — no logo was copied."*
   and beneath it *"This prospect no longer has a logo, so the demo's has been removed and it is
   unbranded."* The QR shows the **"Your logo here"** plate again.
6. *Expect, rebuilding twice in a row with no logo change:* the second rebuild is no slower and no new
   object appears under that truck's prefix in the `truck-media` bucket — the copy is skipped.

# The manual line to change once this is in

**I did not edit `docs/reference-manual.md`.** Two places need a one-line change, and both currently say
the opposite of the code:

1. **The V13.6 changelog entry**, in the "THE 'UNBRANDED' WARNING LIED" paragraph — replace:

   > ⚠️ **`copyDemoLogo` is deliberately NOT re-run on a rebuild** — see the open items: changing a
   > prospect's logo and rebuilding does **not** yet update the demo's logo.

   with:

   > **A rebuild now copies the CURRENT logo**, skipping the work only when the truck already holds exactly
   > what the source would produce (`demoLogoUpToDate`), and removing the demo's logo when the prospect no
   > longer has one. A re-provision with no `discoveryTruckId` still only reads, because it does not know
   > the prospect's logo.

2. **§55's "What a demo gets (V13.6)"**, the rebuild paragraph — replace *"⚠️ It does not re-copy the logo
   … Open item."* with the same sentence, and **delete the first row of the V13.6 open-items table**
   ("A rebuild does not re-copy the logo").

---

# Anything I could not establish

- **I did not rebuild a real demo.** `/api/admin/provision-demo` is gated by `verifyAdmin` and answers 401
  from here; minting an admin session needs the service-role key, which the permission classifier refused
  in an earlier round and which I did not work around. The behaviour is proven against the real copier with
  a counting storage stand-in, which is where the comparison and the three outcomes live.
- **The orphaned objects the old guard was avoiding are not cleaned up.** Nothing in this change deletes a
  superseded logo object from `truck-media` — a changed logo leaves the previous `static` upload behind, as
  it always did on first builds. Worth a sweep if template demos are rebuilt often; not in scope here.
- **I did not read any live truck's `logo_storage_path`.** This task's rule limits reads to test-truck and
  demo trucks, and nothing required one.

---

# git status — after

**0 staged · 5 modified · 1 untracked.**

```
 M docs/reference-manual.md            the V13.6 update from the previous task, unchanged by this one
 M lib/demo-logo.ts                    demoLogoUpToDate, rebuild mode, unchanged/cleared outcomes
 M lib/provision-demo.ts               the guard replaced by the three cases
 M scripts/demo-seed-parameters.cjs    its ITEM 1 block restated to the new rule
 M scripts/harnesses.json              + demo-rebuild-logo.cjs (58)
?? scripts/demo-rebuild-logo.cjs       the new harness
```

Plus `docs/demo-rebuild-logo-report.md`, this report.

Nothing was staged, committed, stashed, reset or restored. The temporary HEAD worktree used for the lint
delta was removed. **No truck row and no demo was written to by this task.**
