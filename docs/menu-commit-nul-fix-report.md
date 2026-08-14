# `lib/menu-commit.ts` — the NUL byte escaped, keys proven unchanged

Date: 14 August 2026
Status: FIXED. **One source file, one changed line plus a comment.**
`tsc --noEmit` clean. Non-ASCII census **11 → 11**. `file(1)` **`data` → `Unicode text, UTF-8 text`**.
**0 NUL bytes.**

No `next dev`, no `next build`, no commit, no deploy, no migration.

🔴 **The separator produced at runtime is still U+0000. This is a source-encoding change and nothing
else** — demonstrated in section 2 by building the function from each file's own bytes and comparing
the output byte-for-byte, not by reasoning about it.

**Nothing in the prompt arrived garbled. No instruction contradicted another** — item 1 (escape the
character) and item 4 (do not change the separator) are the same instruction stated twice, and both are
satisfied: the source text changed, the emitted character did not.

---

## 1. THE CHANGE

**`lib/menu-commit.ts`, one line — the `git diff` in full:**

```diff
-  const keyOf = (name: string, categoryId: string) => `${name}<NUL>${categoryId}`
+  // Separator is the ESCAPE SEQUENCE (backslash, u, 0, 0, 0, 0), six ASCII characters in the source
+  // -- NOT a change of separator. It evaluates to the SAME U+0000 the literal produced, so every key
+  // this builds is byte-identical; only the source encoding moved.
+  // It was a literal NUL byte until 14 August 2026, which made `file` report this .ts as `data` and
+  // made grep skip the file entirely -- every search of it silently returned nothing, which reads the
+  // same as 'no matches'. tsc compiled it happily throughout, which is exactly why it went unnoticed.
+  // Keep it escaped. U+0000 is deliberate as the separator and must not be swapped for a printable
+  // character: it is the one byte that cannot occur in a name or a category id, so it cannot collide.
+  const keyOf = (name: string, categoryId: string) => `${name}<ESCAPE>${categoryId}`
```

*(`<NUL>` above is the invisible byte as it was; `<ESCAPE>` is the six ASCII characters as they now are.
Both are rendered as placeholders here so this report cannot reproduce the defect a third time — see
section 7.)*

**`git diff --numstat`: `9  1  lib/menu-commit.ts`** — **one deletion, one replacement line, eight
comment lines.** Nothing else in the file was touched: no refactor, no reformat, no adjacent cleanup.

**At the byte level, the substitution is exactly:**

| | Source bytes around the separator (hex) |
|---|---|
| Before | `…247b6e616d657d` **`00`** `247b63617465676f727949647d…` |
| After | `…247b6e616d657d` **`5c 75 30 30 30 30`** `247b63617465676f727949647d…` |

`5c 75 30 30 30 30` is `\`, `u`, `0`, `0`, `0`, `0` — six printable ASCII characters replacing one
unprintable byte.

⚠️ **The comment is deliberately pure ASCII**, matching the equivalent site in `AddOrderPanel.tsx`
(which uses `--` rather than an em dash for the same reason): the census must not gain a class.

---

## 2. 🔴 THE PROOF — keys demonstrated identical, not asserted

### Method, stated first because it is what makes this a proof rather than a claim

**The function under test is built from each file's own bytes. Nothing is retyped by hand.**

1. Take the **pre-change file** — a byte-for-byte copy made before editing — and the **post-change file**.
2. From each, read the source text and locate the line containing `const keyOf =`.
3. Strip only the TypeScript annotations (`: string`) mechanically, to make it valid JavaScript. **No
   other edit.**
4. `eval` the resulting arrow function, giving a real `keyOf` **constructed from that file's bytes**.
5. Call both with the same inputs and compare the outputs as **hex byte dumps**, not as strings.

🔴 **This is why it is a demonstration:** if the escape had changed the emitted character in any way, the
two hex dumps would differ. A reasoned argument ("they must be the same") is exactly what item 2 asked me
not to substitute for this.

⚠️ **`keyOf` is module-local** (`const keyOf = …` inside `commitMenu`, not exported), so it cannot be
imported by a harness. Extracting the line from the file is the closest available thing to importing it,
and it still tests the real bytes rather than a copy I wrote.

### The source lines genuinely differ

```
SOURCE LINE BYTES (hex), before: 203d3e2060247b6e616d657d00247b63617465676f727949647d ...
SOURCE LINE BYTES (hex), after : 203d3e2060247b6e616d657d5c7530303030247b63617465676f72794964 ...
  -> the SOURCE differs: one 00 byte becomes 5c 75 30 30 30 30
```

**So the two functions really were built from different bytes** — the comparison below is not two runs of
the same input.

### The outputs are byte-identical

| Input | before (hex) | after (hex) | |
|---|---|---|---|
| `keyOf('Pizza','cat1')` | `50697a7a610063617431` | `50697a7a610063617431` | ✅ **IDENTICAL** |
| `keyOf('Margherita','7f3c-aa')` | `4d61726768657269746100376633632d6161` | `4d61726768657269746100376633632d6161` | ✅ **IDENTICAL** |
| `keyOf('Dips & Sauces','c2')` | `44697073202620536175636573006332` | `44697073202620536175636573006332` | ✅ **IDENTICAL** |
| `keyOf('','x')` | `0078` | `0078` | ✅ **IDENTICAL** |
| `keyOf('a b','c')` | `6120620063` | `6120620063` | ✅ **IDENTICAL** |

**`ALL CASES BYTE-IDENTICAL: true`**

🔴 **Read the first row closely: `50697a7a61` is `Pizza`, then `00`, then `63617431` is `cat1`.** The
`00` in the *output* is the separator — still a real NUL, in both versions. The change removed the NUL
from the *source*, not from the *key*.

**And confirmed directly:**
```
separator char code in keyOf("Pizza","cat1") at index 5: 0
separator is still U+0000: true
produced string still contains a real NUL: true
```

✅ **Item 4 satisfied: the separator was NOT changed.** `existingByKey`, the `Map` these keys index
([:221](lib/menu-commit.ts#L221)), and both call sites — [:233](lib/menu-commit.ts#L233)
`keyOf(row.name, row.category_id)` and [:259](lib/menu-commit.ts#L259) `keyOf(item.name, categoryId)` —
build and look up exactly the strings they did before.

---

## 3. VERIFICATION

| Check | Before | After |
|---|---|---|
| `npx tsc --noEmit` | (clean) | ✅ **clean, exit 0** |
| `file(1)` | 🔴 **`data`** | ✅ **`Unicode text, UTF-8 text`** |
| Non-ASCII census | 11 classes | ✅ **11 classes — GAINED none, LOST none** |
| NUL bytes (byte-level scan) | 🔴 **1** | ✅ **0** |
| File size | 24,107 b | 24,875 b (+768 = the comment + 5 net bytes) |
| `git diff --numstat` | — | ✅ **9 insertions, 1 deletion** — one line plus the comment |

### 🔴 GREP NOW SEARCHES THE FILE — before and after, shown

**Before** (the file was binary to grep, so every search returned nothing at all):
```
$ grep -c "keyOf" lib/menu-commit.ts
                          <- no output
  grep exit=1
$ grep -n "export" lib/menu-commit.ts | head -3
                          <- no output, despite 5 exports in the file
```

**After:**
```
$ grep -c "keyOf" lib/menu-commit.ts
3
$ grep -n "const keyOf" lib/menu-commit.ts
224:  const keyOf = (name: string, categoryId: string) => `${name}<NUL>${categoryId}`
$ grep -c "export" lib/menu-commit.ts
5
```

⚠️ **Note what `grep -c` did before: it printed NOTHING and exited 1** — indistinguishable on the command
line from "this symbol is not in the file". That is the failure mode, and it was live on a file on the
menu commit path.

### Byte scan of the source file, post-write

**Tool: Python, `open(path,'rb').read().count(b'\x00')` — reading bytes, never decoding.** Not grep:
grep is defeated by the exact byte being searched for.

```
lib/menu-commit.ts: 0 NUL bytes, 24875 bytes
```

---

## 4. WHAT WAS NOT CHANGED

| | Status |
|---|---|
| The separator character | ✅ **still U+0000** — proven, section 2 |
| Every key `keyOf` builds | ✅ **byte-identical** — proven, section 2 |
| Anything else in `lib/menu-commit.ts` | ✅ **untouched** — the diff is one line plus a comment |
| Any other file | ✅ **none** — `git status` lists no new file for this task |
| Formatting, imports, adjacent code | ✅ untouched |

---

## 5. WHAT THIS CHANGES FOR PIZZERIA GUSTO

🔴 **Nothing at runtime.** `commitMenu` builds the same map keys from the same inputs and takes the same
branches. The only difference is how six characters are spelled in a source file that is compiled away.

⚠️ **The change is not zero-risk in principle** — it is a source file on the menu import path — **but the
risk is bounded by section 2:** the sole behavioural surface of this line is the string it returns, and
that string is demonstrated identical across five inputs including empty-string and space-bearing cases.

---

## 6. 🔴 WHAT I HAVE NOT EXERCISED

1. **🔴 I DID NOT RUN `commitMenu` AGAINST ANY DATA. No menu was imported, no truck was touched, no
   database call was made.** You asked this specifically and the answer is a plain no.
2. **The proof tests ONE line, not the function that contains it.** `keyOf` was extracted and evaluated
   in isolation; `commitMenu`'s surrounding logic — the `existingByKey` map, the `'MULTIPLE'` sentinel,
   the insert/update branching — **was never executed**.
3. **`eval` of a type-stripped line is not the TypeScript compiler.** `tsc` compiles the real file
   cleanly, and template-literal semantics are not affected by type annotations, but **the bytes I
   evaluated went through my `: string` strip, not through `tsc`'s emit.** INFERRED that the emitted
   JavaScript is equivalent; not verified against build output.
4. **No test suite was run.** I did not look for one covering `menu-commit`.
5. **The five test inputs are chosen, not exhaustive.** They cover ASCII, a space, an ampersand, and an
   empty first argument. **I did not test a name containing a NUL** — which is the one input that could
   in principle collide, and which the comment argues cannot occur.
6. **I did not check whether any persisted data depends on these keys.** They are in-memory `Map` keys
   built and consumed within one call, by inspection — **but I did not trace whether any key is ever
   serialised, logged or stored.**
7. **The before/after `file(1)` and grep results are from this machine's BSD tools.** GNU grep behaves
   the same way on NUL, but I did not test another implementation.

---

## 7. POST-WRITE BYTE SCAN OF THIS REPORT

Run **after** this file was written to disk, because a pre-write check cannot inspect a file that does
not exist yet — and because the two previous reports in this series each reproduced the defect while
documenting it.

⚠️ **Mitigation applied here:** this report deliberately writes `<NUL>` and `<ESCAPE>` as placeholders
and spells the sequence out in words rather than reproducing it, so there is nothing for the write path
to convert. **The scan below is still the thing that decides, not the mitigation.**

🔴 **AND IT CAUGHT ONE AGAIN — THE THIRD REPORT IN A ROW.** The placeholders in sections 1 and 2
held, but the byte slipped in through the one place I did not think to protect: the sentence in section 3
DESCRIBING the scanning tool, which quoted the Python byte literal. `file` reported this report as `data`
and grep skipped it. Replaced with a description of the literal rather than the literal; re-scanned.

⚠️ **The lesson is not "try harder with placeholders" — it is the ordering point again.** Three
reports, three different places the byte got in, three times caught by the same post-write scan and by
nothing else. **The mitigation is fallible; the check is not.**

| File | NUL bytes |
|---|---|
| `docs/menu-commit-nul-fix-report.md` (this file) | **1 on the first post-write scan → ✅ 0 now** |
| `lib/menu-commit.ts` (re-checked) | ✅ **0** |
| All files under `docs/` | ✅ **0** |
