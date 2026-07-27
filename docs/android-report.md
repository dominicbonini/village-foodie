# Task report — resource-name build failure: source tree is CLEAN, nothing deleted · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only).
`docs/last-report.md` belongs to a separate workstream — not read, not written, not opened.

**No file was deleted. No source file was modified. `build/` was not touched.**

---

## 0. Prompt integrity — two garbled spots, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| item 2: *"This looks like a macOS duplicate ("filename 2.ext"). **tablish:**"* | *"**Establish:**"* | Leading `Es` dropped; the bullets that follow are all provenance questions. |
| item 6: *"the stale copy will still be sitting in **andpp/build/**"* | *"in **android/app/build/**"* | Characters dropped mid-path; that is the directory the error's path is under. |

Neither changed the work.

---

## ⚠️ HEADLINE — the premise does not hold, so I deleted nothing

**There is no offending file in any source directory.** The duplicates exist **only** inside
`android/app/build/`, and not as one stray file: **34** of them inside `packaged_res` alone,
**139** across the whole build tree. Every icon, every splash, `values 2.xml`,
`activity_main 2.xml` — the resource output was wholesale duplicated by something that is not
Gradle.

**So the fix is exactly the Clean you had already planned (item 6), and nothing else.** Had I
followed item 3 literally and deleted the file the error names, I would have left 33 more in
`packaged_res` and the next build would have failed on the next one alphabetically.

---

## 1. LOCATE — `find android/app/src -name "* *"`

```
$ find android/app/src -name "* *"
(no output)
```

**Zero results.** Nothing with a space anywhere under `android/app/src`.

**Does an original `ic_launcher_background.xml` exist? Yes — two of them, both legitimate:**

```
android/app/src/main/res/drawable/ic_launcher_background.xml    5606 bytes   Jun  2 16:55
android/app/src/main/res/values/ic_launcher_background.xml       120 bytes   Jun  2 16:55
```

These are **not** duplicates of each other. One is the adaptive-icon background **vector
drawable**, the other is a **colour resource** that happens to share the name — different
resource types, so no collision. Both are standard Capacitor/Android-Studio scaffolding, both
dated with the rest of the scaffold (Jun 2 16:55), and both tracked by git.

---

## 2. PROVENANCE — established before touching anything

| Question | Finding |
| --- | --- |
| **Tracked by git, or untracked?** | **Neither — it does not exist in the working tree.** `git ls-files android/app/src/main/res/` lists only the six legitimate files. `git status --porcelain android/app/src/main/res/` is **empty** (no untracked, no modified). |
| **Byte-identical to the original?** | **Yes** — `diff -q "…/packaged_res/…/drawable/ic_launcher_background 2.xml" android/app/src/main/res/drawable/ic_launcher_background.xml` → identical. Same 5606 bytes. |
| **Created by `cap add`/`sync`, or later?** | **Neither.** It carries the **original's mtime** (Jun 2 16:55) while sitting in a build directory whose parent was written **Jul 27 15:31** — i.e. it was copied *with metadata preserved*, not generated. Gradle does not preserve source mtimes into `packaged_res` this way, and it never creates " 2" names. |
| **Permissions** | Duplicates: **`-rw-------`**. Originals: **`-rw-r--r--@`** (note the `@` — extended attributes). A different writer, with a different umask, and no xattrs. |

**Verdict: it is a duplicate, but not of a source file that exists — and not one created by the
Android toolchain.** The signature (byte-identical, mtime preserved, mode 600, no xattrs,
applied across an entire directory tree) is a **file-sync or copy tool duplicating
`android/app/build/`**.

**Per item 2's own instruction — "If it is NOT a duplicate … say so and STOP" — the sibling
case applies here: the source is clean, so there is nothing in source to delete, and I
stopped.**

---

## 3. DELETION — none performed

Nothing was deleted. There was no source file to delete, and `build/` was explicitly out of
bounds ("Find the source, do not touch build/"). **The remedy is item 6's Clean.**

If you would rather not run a full Clean, deleting the 34 entries under
`android/app/build/intermediates/packaged_res/` would also unblock `parseDebugLocalResources` —
but Clean is safer, because the remaining 105 duplicates elsewhere in `build/` (including
`values-XX 2` directories in `mergeDebugResources/merged.dir`) are corrupted incremental state
that a partial delete leaves behind. **Your call; I have done neither.**

---

## 4. SWEEP — the full picture

### 4.1 `find android ios -name "* *" -not -path "*/build/*"`

```
(no output)
```

**Zero hits.** Both native source trees are clean — `android/app/src`, `android/*.gradle`,
`ios/App`, everything.

### 4.2 Inside `android/app/build/` — where the problem actually is

**34 in `packaged_res` (the input to the failing task):**

```
drawable/ic_launcher_background 2.xml          ← the one the error names
drawable/splash 2.png
drawable-v24/ic_launcher_foreground 2.xml
drawable-{land,port}-{m,h,xh,xxh,xxxh}dpi-v4/splash 2.png     (10 files)
mipmap-{m,h,xh,xxh,xxxh}dpi-v4/ic_launcher 2.png
mipmap-{m,h,xh,xxh,xxxh}dpi-v4/ic_launcher_round 2.png
mipmap-{m,h,xh,xxh,xxxh}dpi-v4/ic_launcher_foreground 2.png   (15 files)
mipmap-anydpi-v26/ic_launcher 2.xml
mipmap-anydpi-v26/ic_launcher_round 2.xml
layout/activity_main 2.xml
values/values 2.xml
xml/config 2.xml
xml/file_paths 2.xml
```

**139 across the whole build tree**, the remainder mostly `values-XX 2` directories under
`intermediates/incremental/debug/mergeDebugResources/merged.dir` (`values-ta 2`, `values-sv 2`,
`values-v30 2`, …).

**Every one is a stray duplicate. None is legitimate.** Gradle never emits " 2" names.

### 4.3 Repo-wide, outside `build/` / `node_modules/` / `.git/` / `.next/`

```
./Village Foodie Master Context.txt
./public/logos/village-foodie logo-sharing.png
```

**Both legitimate, both long-standing, neither an Android resource.** A space is fine in a
docs file and in a web asset served by Next; the constraint is Android-specific. **Not
touched, and not to be touched** — the logo is referenced by the web app.

---

## 5. Reference check — nothing orphaned, and a warning

**Nothing references the space-named filename.** `grep -rn "ic_launcher_background"
android/app/src/` returns three hits, none of them " 2":

```
android/app/src/main/res/values/ic_launcher_background.xml:3   <color name="ic_launcher_background">#FFFFFF</color>
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml:3   <background android:drawable="@color/ic_launcher_background"/>
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml:3   <background android:drawable="@color/ic_launcher_background"/>
```

`AndroidManifest.xml` references `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round` (`:6`,
`:8`), which resolve through those two adaptive-icon XMLs.

⚠️ **Warning worth recording:** `values/ic_launcher_background.xml` **is referenced** and must
not be deleted by anyone tidying up "duplicate" `ic_launcher_background` files. The two files
sharing that name are a name collision *across resource types*, which Android permits by
design. (`drawable/ic_launcher_background.xml` is referenced by nothing in `src` — a scaffold
leftover superseded by the colour — but it is harmless and I have not removed it.)

---

## 6. FOR YOU — what to do

1. **Android Studio → Build → Clean Project.** That is the whole fix. I cannot run gradle.
2. Rebuild. `parseDebugLocalResources` should pass — the source it reads from is clean.
3. **If it comes back, the cause is not in the repo.** See §7.

---

## 7. ⚠️ Flagged — a Clean fixes today's build, not the cause

**Something duplicated 139 paths inside `android/app/build/`.** A Clean deletes them; it does
not stop it happening again. And the next occurrence may land in
`android/app/src/main/res/`, where it stops being a stale artefact and becomes a real source
defect that survives a Clean and gets committed.

**That has already happened once in this repo.** `git log --all --diff-filter=A --name-only`
shows **`app/manage/[token]/page 2.tsx` was committed** at some point — same " 2" signature, in
the web tree, where it broke nothing loudly and so went unnoticed.

**Hypothesis, not a finding — and it is your filesystem, not the codebase, so I did not
investigate further:** the project lives under `~/Desktop`, and
`~/Library/Mobile Documents/com~apple~CloudDocs` exists on this machine, so iCloud
"Desktop & Documents" sync may be enabled. iCloud is a well-known source of " 2" conflict
duplicates. Against that: `~/Desktop` is a real directory rather than a symlink, and I found
no `.icloud` placeholders near the project. **Unresolved — check System Settings → iCloud.**

**If some sync is running, the durable fix** is excluding `android/app/build`, `.next` and
`node_modules` from it (or moving the project off Desktop). Those directories are large,
regenerated constantly, and never want syncing.

**Cheap guard for the future:** `find android/app/src ios -name "* *"` — expect zero output.
One second, and it distinguishes "stale build artefact" from "real source defect" immediately.
That distinction is the entire content of today's investigation.

---

## 8. Files changed

| File | Change |
| --- | --- |
| `docs/android.md` | **Appended** 928 → 1013 lines, nothing overwritten. |
| `docs/android-report.md` | This file, overwritten. |

**No source file, no `android/` file, no `ios/` file, and no file under `build/` was created,
modified, or deleted.**

---

## 9. `docs/android.md` — appended

Entry `### 2026-07-27 — parseDebugLocalResources failure: the source tree was CLEAN. Nothing
deleted.`: the error, the three `find` commands proving the source tree clean, the 34/139
counts, the copy signature (byte-identical, mtime preserved, mode 600 vs 644+xattrs), the
"Clean fixes today not the cause" warning with the `page 2.tsx` corroboration, the iCloud
hypothesis marked as such, the resource-reference confirmation, and the suggested pre-build
guard.

Plus the **invariant candidate for manual §35**, recorded as you dictated:

> Android resource filenames must be lowercase a-z, 0-9 or underscore. A macOS duplicate
> ("name 2.xml") in `res/` fails the build with an error naming the BUILD OUTPUT path, not the
> source. Same trap family as the XML double-hyphen comment failure: native tooling has
> filename and content constraints the web codebase never enforces.

**with one refinement this incident adds:** here there was **no source duplicate at all**. The
error naming a `build/intermediates/…` path is exactly what makes it read as a source problem,
so the first move must be `find <source> -name "* *"`, **not** deleting the file the error
names. *An error that names a generated path is evidence about the generated tree — it locates
the symptom, not the cause.*

It pairs directly with the XML double-hyphen entry: both are cases where the native toolchain
rejects something the web toolchain accepts silently, and neither is visible to `tsc`, ESLint,
or code review.

---

## 10. What I could not do / did not do

- **Could not run gradle, a build, or a Clean** — hence item 6 is yours. My `tsc` is irrelevant
  here (no TypeScript changed) so I did not run it.
- **Did not delete anything**, in source or in `build/` — the source was clean, and `build/`
  was out of bounds. §3 offers the partial-delete alternative if you prefer it to a Clean.
- **Did not touch the two legitimate space-named files** outside the native tree
  (`Village Foodie Master Context.txt`, `public/logos/village-foodie logo-sharing.png`) — both
  are fine where they are, and the logo is referenced by the web app.
- **Did not investigate the sync hypothesis** beyond checking whether `~/Desktop` is a symlink
  and whether iCloud exists on the machine. Determining what is actually syncing is a
  System-Settings question, not a codebase one.
- **Did not touch `docs/reference-manual.md`** — the §35 candidate sits in `docs/android.md`.
- **Did not touch `docs/last-report.md`** — not read, not written, not opened.
