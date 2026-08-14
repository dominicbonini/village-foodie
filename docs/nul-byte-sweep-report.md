# NUL byte sweep — the report that reproduced the defect it documented

Date: 14 August 2026
Status: FIXED and SWEPT. **Two documentation files changed. NO source file touched.**

No `next dev`, no `next build`, no code change, no migration, no commit, no deploy.

**Nothing in the prompt arrived garbled. No instruction contradicted another.**

🔴 **AND THEN THIS REPORT DID IT AGAIN — 7 of its own, caught by the post-write scan and fixed.**
Section 7. It is the clearest possible demonstration of section 5's point.

**RESULT IN ONE LINE:** `docs/menu-layout-move-report.md` held **3** literal NUL bytes and now holds
**0**; a byte-level scan of all **1,003** files in the repo found **one other text file** carrying a
NUL — 🔴 **`lib/menu-commit.ts`, a source file, committed and pre-existing** — plus 250 genuinely binary
files where NULs are expected. **All 182 files under `docs/` are now clean.**

---

## 1. THE FIX — three NUL bytes replaced

**All three sat in the passage demonstrating the escape sequence**, which is exactly how they got there:
the intent was to write the six characters `\u0000`, and the character itself was written instead.

| Line | Before (byte-repr) | After |
|---|---|---|
| 293 | ``I intended the escape sequence `'\x00'` as a separator; …`` | ``I intended the escape sequence `'\u0000'` as a separator; …`` |
| 309 | `// Separator is the ESCAPE SEQUENCE '\x00', six ASCII characters in the source. …` | `// Separator is the ESCAPE SEQUENCE '\u0000', six ASCII characters in the source. …` |
| 313 | `const catsKey = cats.join('\x00')` | `const catsKey = cats.join('\u0000')` |

**Method:** a byte-level `bytes.replace(b'\x00', b'\\u0000')` in Python — operating on bytes, never on a
decoded string, so nothing could re-normalise or re-introduce the character.

**Measured effect:**

| | Before | After |
|---|---|---|
| NUL bytes | **3** | **0** |
| File size | 22,595 b | 22,610 b (**+15 = 3 × 5 extra characters**, the arithmetic confirming exactly three substitutions of 1 byte by 6) |
| `file(1)` classification | `data` | ✅ **`Unicode text, UTF-8 text`** |
| `grep` | skipped the file entirely | ✅ **searches it** — `grep -c "escape sequence"` now returns 2 |

🔴 **The prose and the code block now read as intended**, which they did not before: a reader's terminal
or editor would render the raw NUL as nothing, so the sentence said *"I intended the escape sequence
`''`"* — an empty pair of quotes, which is the opposite of the point being made.

---

## 2. THE SWEEP — every file in the repo, byte-scanned

**Scope:** `os.walk('.')` from the repo root, excluding only `node_modules`, `.git`, `.next`, `.vercel`,
`dist`, `build`, `out`, `.turbo`. **1,003 files read, 0 unreadable, 0 skipped for any other reason** —
including every binary, because a scan that skips binaries cannot prove a text file has not become one.

### 2a. 🔴 Text files containing a NUL — the whole list

| File | NUL count | Verdict |
|---|---|---|
| `docs/menu-layout-move-report.md` | **3 → 0** | ✅ **FIXED** (section 1) |
| 🔴 **`lib/menu-commit.ts`** | **1** | ⚠️ **PRE-EXISTING SOURCE FILE — left alone.** Section 3 |

**That is the complete list. No other text file in the repository contains a NUL byte.**

### 2b. Every file under `docs/` — 182 files, all clean

I scanned all 182, not a sample. **After the fix, every one reports 0 NUL bytes**, including the largest
(`reference-manual.md`, 1,377,128 b) and every one of the reports written in this session:

`add-order-layout-report.md` · `add-order-view-report.md` · `customer-one-page-review.md` ·
`event-times-build-report.md` · `event-times-report.md` · `manual-integration-report.md` ·
`menu-layout-move-report.md` · `trial-billing-copy-report.md` · `onboarding-flow.md` ·
`reference-manual.md` — **and the other 172.**

🔴 **Only ONE docs file was ever affected.** The concern that others might be is answered: they are not.
⚠️ **INFERRED as to cause, but strongly:** the idiom appeared exactly once, in exactly the report that
was about it, which is consistent with it being introduced by the act of quoting the source line rather
than by any recurring habit.

### 2c. Binary files containing NUL — 250, all expected

Counted and classified, not ignored:

| Kind | Examples |
|---|---|
| Images (`.png .jpg .jpeg .webp .avif .ico`) | `public/logos/*`, `public/photos/*`, app icons, splash screens |
| macOS metadata | `.DS_Store` × 4 |
| Gradle caches / locks (`.bin .lock .probe`) | `android/.gradle/**` |
| Java archive | `android/gradle/wrapper/gradle-wrapper.jar` |
| Xcode UI state | `ios/.../UserInterfaceState.xcuserstate` |

**A NUL in these is normal and carries no information.** They are listed only so the 252-file raw total
reconciles: **252 = 250 binary + `menu-commit.ts` + the report now fixed.**

---

## 3. 🔴 THE OTHER ONE — `lib/menu-commit.ts:216`, NOT TOUCHED

```
lib/menu-commit.ts: 1 NUL at byte 11467, line 216
b'  const keyOf = (name: string, categoryId: string) => `${name}\x00${categoryId}`'
```

**A composite-key separator** — the same construction, and the same mistake, as the one I made in
`AddOrderPanel.tsx`. ⚠️ **This is almost certainly where the idiom came from.**

**Dated, not assumed:**

| Check | Result |
|---|---|
| NUL count in `git show HEAD:lib/menu-commit.ts` | **1** — 🔴 **it is committed** |
| `git status --porcelain lib/menu-commit.ts` | **empty** — unmodified since HEAD |
| Introduced by this session's work? | ✅ **No. It predates all of it.** |

**🔴 NOT CHANGED, because your brief says "Do not change any source file."** Reported so you can decide.

**What it costs today, stated so the decision is informed:**
- **`grep` skips `lib/menu-commit.ts` entirely.** Any search of that file — by me, by you, by an editor's
  project-wide find — silently returns nothing. **That is a live, ongoing blind spot in a source file**,
  not a cosmetic issue.
- **`file` reports it as `data`.** Tools that branch on that will treat it as binary.
- **Runtime is unaffected** — a NUL is a valid separator, and it is arguably a *good* one for a composite
  key precisely because it cannot occur in a category name.

**The fix, if you want it, is one line:** write `\u0000` as the escape sequence instead of the literal
character. **Identical runtime behaviour, byte-for-byte identical key values**, and the file becomes
greppable. ⚠️ **It is a source change and I have not made it.**

---

## 4. THE TOOL, AND WHY IT IS IMMUNE

**Tool: Python 3, reading each file in binary mode and counting the byte directly.**

```python
with open(path, 'rb') as fh:
    data = fh.read()
n = data.count(b'\x00')
```

**Why this is immune to the defect it is looking for — three independent reasons:**

1. 🔴 **It never decodes.** `open(..., 'rb')` yields `bytes`. There is no encoding step, no text/binary
   heuristic, and no notion of a "line" — so nothing can classify the file and skip it. A NUL is just
   byte `0x00` among the others.
2. 🔴 **It has no binary-file guard to trip.** `grep` inspects the first block, decides a file is binary
   the moment it sees a NUL, and stops reporting matches. **The tool's own defence against the byte is
   what makes it blind to it** — searching for NUL with grep is asking a tool to report the exact
   condition under which it goes quiet. `data.count()` has no such branch.
3. 🔴 **It cannot report a false clean.** Failure to read raises, and the scan counted and printed
   `unreadable: 0`. A silent skip is not one of its outcomes — whereas grep's skip is *indistinguishable
   from "no matches"* on the command line, which is precisely how this went unnoticed.

**Also acceptable and equivalent in kind:** `xxd -p file | grep -c 00` (the hex dump is text, so grep is
searching characters, not bytes), or `tr -d '\0' < f | wc -c` against `wc -c < f`. **Not acceptable:**
`grep -c $'\0' file`, `grep -P '\x00'`, or ripgrep without `--text` — all defeated by the same guard.

⚠️ **Cross-checked, not taken on faith.** `file(1)` independently agreed at every step: `data` before
the fix, `Unicode text, UTF-8 text` after — a second tool, with a different implementation, reaching the
same verdict.

---

## 5. 🔴 THE ORDERING PROBLEM — recorded in the other report too

**Added to `docs/menu-layout-move-report.md` §5**, per your item 3, alongside a strike-through of the
false "the repo contains 0 NUL bytes" claim.

**The structural point, stated plainly:**

> **Verification runs BEFORE the report is written.** Every check in that report's verification section —
> `tsc`, the censuses, the `file` classification, the greps — ran against source files while the report
> did not yet exist. **By construction, a defect introduced by the act of writing the report cannot
> appear in the report's own verification section**, however thorough that section is. The report is the
> last artefact produced and the only one nothing inspects.

**Two properties turned "unchecked" into "invisible":**

| Check | Why it could not see a NUL |
|---|---|
| `grep` | A NUL makes the file binary; grep silently skips binary files. **The search returns nothing, which reads exactly like "clean".** |
| 🔴 The non-ASCII census | It counts `[^\x00-\x7F]` — a range that **EXCLUDES** NUL. **The one automated check that runs over every changed file is structurally blind to this byte.** |
| `tsc` | Compiles it happily; a NUL is a valid string character |

🔴 **SO THE REMEDY IS ORDERING, NOT DILIGENCE.** No amount of care inside the pre-write verification pass
can catch this, because the artefact does not exist yet. **The check has to be a separate pass AFTER the
write** — byte-scan the file once it is on disk, with a byte-level tool.

⚠️ **And the census should arguably widen.** `[^\x00-\x7F]` is the right range for "did this file gain a
character class", but it leaves control characters entirely unpoliced. **A one-line companion check —
"does this file contain any byte below 0x09 other than newline" — would have caught this on the first
pass, in the source file, before any report was written.** Flagged as a suggestion; not implemented, and
it would be a change to the checking convention rather than to any file.

---

## 6. WHAT CHANGED

| File | Change |
|---|---|
| `docs/menu-layout-move-report.md` | 3 NUL bytes → the six ASCII characters `\u0000`; strike-through of the false claim; the §5 correction and ordering note |
| `docs/nul-byte-sweep-report.md` | This file |

**No source file was touched.** `lib/menu-commit.ts` was read and reported, never written.
**The previous task was not re-run** — no verification of the menu-layout work was repeated, and nothing
in that report's substance was altered beyond the correction you asked for.

---

## 7. FINAL BYTE SCAN — including this file

Run **after** this report was written to disk, which is the whole point of section 5.

### 🔴 AND IT CAUGHT THIS REPORT. THE FIRST POST-WRITE SCAN FOUND **7** NUL BYTES IN THIS FILE.

**I reproduced the defect a second time, while writing the document about it.** Every place this report
quotes the escape sequence — section 1's "the six characters", the before/after table rows, section 3's
one-line fix, section 6's change list, section 8's rendering caveat — went in as the literal character
again. `file` reported this file as `data`; `grep -c "NUL"` returned a count for
`menu-layout-move-report.md` and **nothing at all for this one**.

**Replaced by the same byte-level substitution: 7 NUL → 0, 12,692 b → 12,727 b (+35 = 7 × 5).** Re-scanned
after the write; the table below is that second pass.

⚠️ **This is the strongest evidence section 5 could have.** The defect is not a lapse of care — I knew
exactly what I was looking for, was writing a document whose entire subject was this byte, and still
introduced it seven times. **What caught it was not diligence but ORDER: a byte-level scan run after the
file existed.** Nothing available before the write could have found it.

⚠️ **It also means the count in section 2 was a snapshot, not a standing claim.** "All 182 files under
`docs/` are clean" was true when measured and became false the moment this file was written. The table
below re-measures.

| File | NUL bytes |
|---|---|
| `docs/nul-byte-sweep-report.md` (this file) | **7 on the first post-write scan → ✅ 0 now** |
| `docs/menu-layout-move-report.md` | ✅ **0** |
| All 182 files under `docs/` | ✅ **0** |
| All text files in the repo | ✅ **0 — except `lib/menu-commit.ts` (1), left as found** |

---

## 8. WHAT I HAVE NOT VERIFIED

1. **I did not open the fixed report in a renderer.** The three lines are correct as bytes and as text;
   **I have not seen them displayed.** The `\u0000` inside backticks should render literally in
   GitHub-flavoured Markdown, but that is INFERRED.
2. **The scan excluded `node_modules`, `.git`, `.next`, `.vercel`, `dist`, `build`, `out`, `.turbo`.**
   Those are dependency and build artefacts, and `.next` is yours; **NULs there would be normal and are
   not yours to fix.** ⚠️ **But I did not scan them, so "the repo contains no other text-file NUL" is
   scoped to tracked working files.**
3. **I did not scan git history.** An earlier commit could contain NULs in files since changed. Only the
   current working tree was examined, plus the one `git show HEAD:` check on `lib/menu-commit.ts`.
4. **I did not check for other invisible or control characters** — zero-width spaces, BOMs, other C0
   controls, lone surrogates. **The scan looked for `0x00` and nothing else**, so a different invisible
   byte would have passed. §5's closing suggestion is exactly this gap.
5. **I did not run `tsc` or any test.** No code changed, so nothing could have regressed — but that is
   reasoning, not a run.
6. **I did not verify that `lib/menu-commit.ts`'s NUL is harmless at runtime.** Its position in a
   template literal makes it a separator by inspection; **I did not trace its callers or execute it.**
7. **The claim that the report's NULs came from quoting the source line is INFERRED** from where they
   appear, not from any record of how the file was written.
