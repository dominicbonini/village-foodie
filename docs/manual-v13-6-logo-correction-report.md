# Manual correction: the V13.6 logo lines

**Date** 19 September 2026 · **Docs only — no code was changed.** The single file touched is
`docs/reference-manual.md`.

---

## git status — before

**HEAD `cd58da6` "demo logo fix" · 0 staged · 0 modified · 0 untracked.** A clean tree; the logo fix and
its report are committed.

## git status — after

**0 staged · 1 modified · 0 untracked.**

```
 M docs/reference-manual.md     32 insertions, 8 deletions
```

Plus `docs/manual-v13-6-logo-correction-report.md`, this report. Nothing was staged, committed, stashed,
reset or restored.

**Version strings:** both already read **V13.6** and were left alone, per the manual's own rule that the
running header and the front matter must agree. This is a correction within V13.6, not a release.

---

# Every line changed

## 1 · The V13.6 changelog — "THE 'UNBRANDED' WARNING LIED ON EVERY REBUILD"

**Before**

> **The warning was the liar, and the fix is that a rebuild READS `trucks.logo_storage_path` BACK** so it
> reports what the truck actually has; a demo with no logo still says so. ⚠️ **`copyDemoLogo` is
> deliberately NOT re-run on a rebuild** — see the open items: changing a prospect's logo and rebuilding
> does **not** yet update the demo's logo.

**After**

> **The warning was the liar, and the first fix was that a rebuild READS `trucks.logo_storage_path` BACK**
> so it reports what the truck actually has; a demo with no logo still says so. **A rebuild now copies the
> CURRENT logo**, skipping the work only when the truck already holds exactly what the source would produce
> (`demoLogoUpToDate`), and removing the demo's logo when the prospect no longer has one. A re-provision
> with no `discoveryTruckId` still only reads, because it does not know the prospect's logo.
> ⚠️ **A REFUSED URL LEAVES THE EXISTING BRAND ALONE** — we could not read the new logo, so we do not know
> it differs, and discarding a working brand on the strength of a URL we could not parse would be a guess.
> When the prospect's logo is REMOVED the demo's is cleared and `qr_code_style` goes back to `standard`, so
> the "Your logo here" plate returns rather than a branded composite rendering with an empty centre.
>
> ⚠️ **THE `!existingTruckId` GUARD WAS PROTECTING SOMETHING REAL, AND `demoLogoUpToDate` IS THAT
> PROTECTION MADE PRECISE.** A `storage` source only re-points `logo_storage_path` at an object that
> already exists, so re-running it is free — but a `static` one reads `public/logos` and UPLOADS
> `<truckId>/<epoch-ms>-<file>`, whose name carries the upload's timestamp. Re-copying unconditionally
> would leave one orphaned object per rebuild, undetectable by name collision. `storage` is therefore
> compared by object path and `static` by the truck's prefix plus the file name the path ends with.

"the fix is" became "the first fix was", because the read-back is still true and still the reason the
warning stopped lying — it was simply not the whole answer.

## 2 · The V13.6 open items — the row that said a rebuild keeps the old logo

**Before**

> | **A rebuild does not re-copy the logo** | Change a prospect's logo and rebuild: the demo keeps the old
> one. `copyDemoLogo` is still `!existingTruckId`-guarded. Decide whether a rebuild should re-copy |

**After** — replaced, not simply deleted, by the open item the fix leaves behind:

> | **Superseded logo objects are never swept** | A changed logo leaves the previous `static` upload in
> `truck-media`; nothing deletes it. Worth a sweep if template demos are rebuilt often |

⚠️ **This is the one place I did more than the report specified.** The report said to delete the row; it
also records, under *Anything I could not establish*, that the orphaned objects the old guard was avoiding
are still not cleaned up. Deleting the row without recording that would have left the manual silent on a
real consequence of the change. Say the word if you would rather the row simply went.

## 3 · §55 "What a demo gets (V13.6)" — the rebuild paragraph

**Before**

> **A rebuild** keeps the truck, the slug and the dashboard token, deletes every order, seeds a new board
> from the current settings, and re-introduces itself to whoever opens it. ⚠️ **It does not re-copy the
> logo** — it reads the stored `logo_storage_path` back, so a logo changed on the prospect since the first
> build is not picked up. Open item.

**After**

> **A rebuild** keeps the truck, the slug and the dashboard token, deletes every order, seeds a new board
> from the current settings, re-introduces itself to whoever opens it, and **copies the prospect's CURRENT
> logo** — skipping the work only when the truck already holds exactly what the source would produce
> (`demoLogoUpToDate`). A logo **removed** from the prospect is removed from the demo, which also sets
> `qr_code_style` back to `standard` so the QR plate returns; a **refused** URL leaves the existing brand
> alone. A re-provision with no `discoveryTruckId` only READS the stored value, because without one there
> is no `logoUrl` and "no logo" would otherwise clear a perfectly good brand.

## 4 · §59 Operational scripts, harnesses and the goldens — one line added

Inserted immediately before "Fixtures cannot catch a mount-time defect", so the two failure modes of a
harness sit together:

> **A harness can PASS FOR THE WRONG REASON when the environment is missing a value it silently depends
> on.** `scripts/demo-rebuild-logo.cjs` asserts that a rebuilt demo copies the prospect's changed logo, and
> its two broken variants both reported "FAILED as required" on the first run — correctly, but for the
> wrong reason. `classifyDemoLogoSource` decides whether a URL is one of OURS from
> `ownStorageOrigins(process.env)`, and with no `NEXT_PUBLIC_SUPABASE_URL` set every absolute URL
> classified as **refused**, so the harness was exercising the refused branch and never reached the
> comparison it exists to test. It now sets a fixed fake project origin before the module is compiled.
> ⚠️ **A variant that fails is not proof the harness is pointing at the right thing** — check that the
> failure is the one you intended, not merely a failure.

The harness is named, as asked.

---

# Verification

- **No stale text remains.** `grep` for "deliberately NOT re-run", "does not re-copy the logo" and
  "A rebuild does not re-copy" returns nothing.
- **Both version strings still read V13.6** and agree: line 1 (`HatchGrab Engineering Reference Manual ·
  V13.6`) and line 9 (`**Version 13.6**`).
- **No code was changed.** `git status` shows one modified file, `docs/reference-manual.md`. No harness,
  build or lint run was needed or performed.

# Anything from the report I could not apply

**Nothing.** Both manual lines the report specified are applied, in the sections it named, with the wording
it gave. The one deviation is §2 above: the open-items row was replaced rather than deleted, so the
orphaned-object consequence the report recorded is not lost from the manual.
