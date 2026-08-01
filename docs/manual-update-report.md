# MANUAL UPDATE — V9.8 → V9.9 (LANDING ILLUSTRATION + TAGLINE), INTEGRATED

**Date:** 31 July 2026 · **Target:** `docs/reference-manual.md`
**Source:** `~/Downloads/reference-manual-V9.9-illustration.md` — **7,411 bytes, 143 lines**, UTF-8
**Status: ✅ INTEGRATED. Version bumped V9.8 → V9.9. Only `docs/reference-manual.md` was edited.**
No `next dev` / `next build` run. **The delta file was not deleted.**

> This file replaces the previous manual-update report (V9.7 → V9.8). That content is not preserved anywhere.

---

# ✅ INTEGRITY GATE — PASSED

`file` → **`Unicode text, UTF-8 text`**. **143 lines, 7,411 bytes** — matches your stated figures exactly.

## Full non-ASCII census

| Codepoint | Char | Count | Name |
|---|---|---|---|
| U+2014 | `—` | 17 | EM DASH |
| U+00A7 | `§` | 13 | SECTION SIGN |
| U+26A0 | `⚠` | 3 | WARNING SIGN |
| U+FE0F | *(invisible)* | 3 | VARIATION SELECTOR-16 |
| U+1F534 | `🔴` | 3 | LARGE RED CIRCLE |
| U+00B0 | `°` | 1 | DEGREE SIGN |
| U+2192 | `→` | 1 | RIGHTWARDS ARROW |
| U+2248 | `≈` | 1 | ALMOST EQUAL TO |

**U+FFFD replacement characters: 0.** **Mojibake markers (`Â` / `â` / `ð`): 0.**

## ⚠️ 8 codepoints, but that is EXACTLY your 7 expected characters — not an eighth

You expected *"em dash, §, 🔴, ⚠️, →, °, ≈ — and nothing else."* The census shows **8 distinct
codepoints**, and I want to be explicit about why that is not a discrepancy:

🔴 **`⚠️` is a two-codepoint sequence** — U+26A0 WARNING SIGN followed by U+FE0F VARIATION SELECTOR-16,
which is what promotes it from the monochrome `⚠` glyph to the emoji presentation. **Both appear exactly
3 times, i.e. perfectly paired.** U+FE0F is a component of the character you listed, not an extra one.

**Every other codepoint maps 1:1 to your list. No corruption product, no unexpected character. Gate
passed, so I proceeded.**

---

# SECTIONS TOUCHED, WITH LINE RANGES

Final manual: **5,137 lines** (was 5,054 → **+83 lines**). **38 top-level headings, unchanged** — no new
section was created, exactly as you asked.

| # | Section | Lines (final) | What went in |
|---|---|---|---|
| **1** | **Title, line 1** | `1` | `· V9.8` → **`· V9.9`** |
| **2** | **§27 Open backlog** | **3754-3761** | New `## 🔴 V9.9 — added 31 July 2026 (landing illustration)` block at the **top**, above V9.8 — **2 items** (see the merge below) |
| **3** | **§27 V9.8 block** | **3765** | The existing CTA-contrast bullet **annotated**, not duplicated — see MERGES |
| **4** | **§35 Cross-cutting engineering invariants** | **4817-4820** | delta §43.4 — the morphological-closing trap + the erase-without-enumerating bug, appended after the `.hg-landing` lesson, before `# 36.` |
| **5** | **§38 heading** | **4945** | `(V9.8)` → **`(V9.8, extended V9.9)`** so the section records that it grew |
| **6** | **§38 → `## The landing illustration (V9.9)`** | **5058-5104** | delta §43.1, §43.2, §43.3, §43.5 |
| **7** | **§38 → `## Tagline and brand voice (V9.9)`** | **5106-5125** | delta §44 |
| **8** | **§38 → `### Deploy state`** | **5133** | delta §46, appended as a dated **"Update, 31 July 2026 (V9.9)"** paragraph inside the existing block |
| **9** | **Footer, last line** | `5137` | `· V9.8` → **`· V9.9`** |

✅ `grep -c "· V9.9"` → **2** · `grep -c "· V9.8"` → **0** · `grep -c "V9.9 ADDENDUM"` → **0** (nothing appended raw)

## Where §43.1-§43.3 and §43.5 went, as you asked me to report

**Into §38 as a `## The landing illustration (V9.9)` subsection**, sitting after the icon material and
**before** the deploy-state block — i.e. a continuation of the existing brand section, not a new section.
Its sub-headings (`### What it replaced, and why`, `### Shipped files`, `### How it was made`,
`### Colour — the truck is --head, not HEADER_BG`) match §38's existing prose-heading style rather than
the delta's `§43.x` numbering.

## Where §44 went — and the answer to your conditional

🔴 **There is no copy / voice / tone / wording section in the manual.** I searched headings for *copy,
voice, tone, wording, microcopy, language, tagline, slogan*: the only near-miss is
`## Platform compliance and tone` (line 3342), which is about **regulatory tone in customer-facing
compliance text**, not brand copy — putting a tagline there would misfile it.

**So, per your instruction, it went into the brand section (§38) rather than inventing a home**, as
`## Tagline and brand voice (V9.9)`, with a note at the top recording *why* it lives there so the next
reader does not think it was misplaced.

## Where §46 went

**Appended to §38's existing `### Deploy state — end of session, NOT DEPLOYED` block** as a dated update
paragraph — the same treatment V9.8's snapshot received, so the two sit together and the older one is not
overwritten.

---

# 🔴 CONTRADICTION — ONE FOUND. I CHANGED NOTHING. YOU DECIDE.

## The delta's canonical tagline does not match the shipped code

| Source | Says |
|---|---|
| **Delta §44** | Canonical wording: *"Less time booking**,** more time cooking."* — and, explicitly: **"Comma, not full stops.** One balanced phrase; full stops chop it into fragments and lose the swing." |
| **The code, both slots** | `Less time booking.<br />More time cooking.` — **full stops, split across two lines** ([page.tsx:148](app/landing/page.tsx#L148) hero, [:464](app/landing/page.tsx#L464) footer) |

**I think the CODE is right and the delta's punctuation paragraph is stale.** The two-line, full-stop form
exists because of an explicit instruction in this session to put *"each sentence on its own line"* — a
later and more specific decision than the delta's prose. The delta appears to have been written against
the intended wording rather than the shipped one.

**What I did:** recorded §44's reasoning verbatim — including the "Comma, not full stops" paragraph — and
**immediately beneath it added a marked, unresolved note** quoting what actually ships, so the manual does
not silently assert something the code contradicts. **Neither the code nor the delta's wording was
changed.** Resolving it is a one-line edit in either direction:

- **keep the code** → delete that paragraph from §38's tagline subsection, or
- **keep the delta** → change both slots to `Less time booking, more time cooking.` on one line.

## ✅ Everything else in the delta verified TRUE against the code

| Delta claim | Check |
|---|---|
| H1 stays *"The ordering system built for food trucks."* | ✅ [page.tsx:147](app/landing/page.tsx#L147) — exactly that, with "food trucks." in the accent span |
| Hero subhead **and** footer both carry the tagline | ✅ both present, wording identical to each other |
| Hero sets "cooking" in orange; footer is plain | ✅ hero has `<span className="lean">cooking.</span>`, footer does not |
| `food-truck-themed.svg` is the one inlined | ✅ inline in `page.tsx`; the plain file is unreferenced |
| Old fills were `#EA580C` | ✅ matches the audit; the code is now gone |

⚠️ **One stale detail preserved verbatim, with a note.** §43.1 cites `app/landing/page.tsx:389` and `:393`
for the old hardcoded fills. Those were the line numbers at audit time; the block had drifted to ~410/414
by the time it was replaced. **I kept the numbers as written** (you asked for verbatim preservation) and
added *"(Those line numbers are historical — the block had shifted by the time it was replaced, and the
code is now gone.)"* so nobody hunts for them.

---

# MERGES

## 1. The landing CTA contrast item — merged, not repeated

Delta §45.1 re-reports it as *"unchanged and still open"*. **It is already recorded** in §27's V9.8 block.
Rather than carry the same item in two adjacent backlog blocks, I **annotated the existing V9.8 bullet**:

> *"…Fixable on that button alone without touching the token or the logo. **Still open at V9.9** —
> re-reported in that session and merged here rather than duplicated."*

and left a pointer in the V9.9 block:

> *"(The landing CTA contrast item is NOT repeated here — it is recorded once in the V9.8 block below and
> annotated as still open.)"*

**So the V9.9 backlog block carries only the 2 genuinely new items**, and the 2.50:1 figure appears in
exactly one backlog entry.

## 2. The morphological-closing trap — cross-referenced, not duplicated

§43.4 is engineering, so it went to §35. **§38's illustration subsection therefore carries a pointer
instead of a copy:** *"⚠️ The trap that cost three attempts … is recorded with the other silent-failure
invariants in §35, not here."* The §35 entry in turn closes by naming the class it shares with the
V9.8 `.hg-landing` lesson directly above it: *"a silent failure that reports clean."*

---

# ✅ CROSS-REFERENCES — BOTH WERE BROKEN, BOTH CORRECTED

You asked me to check the `§38.4` pointer. **It did not resolve — and neither did a second one.**

| Delta pointer | Problem | Corrected to |
|---|---|---|
| **§44 → "the two oranges in §38.4"** | 🔴 **§38 has no numbered subsections.** The V9.8 integration used prose headings, so the two-oranges note lives in **§38 → `## Colours`** (line 4984). `§38.4` resolves to nothing | *"the two oranges in the Colours subsection above"* |
| **§45.1 → "(see §41.4)"** | 🔴 **§41 does not exist in the manual at all.** The manual has 38 sections; §41 was the delta's own invented numbering from V9.8. The CTA item lives in **§27's V9.8 block** | Replaced by the merge note pointing at the V9.8 block |

✅ `grep -c "§38.4"` → **0** · `grep -c "§41.4"` → **0**. **Neither dangling pointer survives.**

---

# VERBATIM PRESERVATION — VERIFIED BY FIXED-STRING COUNT

| Value | Count |
|---|---|
| `-0.299` | 1 |
| `16.7°` | 1 |
| `y=500` | 1 |
| `y 762-787` | 2 |
| `viewBox="24.0 18.0 351.5 176.0"` | 1 |
| `1.997:1` | 1 |
| `0.0293` · `0.0088` | 1 · 1 |
| `2.50:1` | 2 |
| `#16314F` · `#0F172A` · `#EF8B2C` · `#EA580C` | 4 · 5 · 7 · 6 |
| `public/illustrations/food-truck-themed.svg` · `food-truck.svg` | 1 · 2 |
| `x 634-667, y 310-760` · `x 878-962, y 492-548` · `y=198` | 1 · 1 · 1 |
| `y=787` · `y≈831` · `x 180-684` · `85-746` | 1 · 1 · 1 · 1 |

Also preserved verbatim: the wheel constants (r=96, hub r=42, 44%, ~13 units), the 640-wide hatch, the
4-unit corner radius, the 13-subpath / 50-unit / 8-unit scan figures, `MORPH_CLOSE` 5x5 at 2x, rows
205/215/560/770, and the rgb triples (22, 49, 79) and (15, 23, 42).

---

## What I could NOT verify

- **The manual has not been rendered.** Structure is verified by heading counts, line ranges and
  fixed-string greps — not by viewing it. A malformed table would not have been caught.
- 🔴 **I did not verify the delta's measured constants.** The rake `-0.299`, the nose break at `y=500`,
  the luminance figures `0.0293` / `0.0088`, the 70%-darker claim and the trace geometry are **carried
  through on the delta's authority** — I recomputed none of them. What I *did* check is everything
  observable in the code: the H1, both tagline slots, which SVG is inlined, and that the old `#EA580C`
  fills are gone.
- **The "70% darker" figure is the delta's**, and I note it sits alongside luminances of 0.0293 and
  0.0088 — a ratio of ~3.3×, i.e. ~70% lower. Consistent, but I did not audit the wording.
- **I did not check whether §38's illustration material duplicates anything in §35 or §36** beyond the
  §43.4 content I deliberately routed to §35.
- ⚠️ **The pre-edit manual is recoverable from `git` only if V9.8 was committed.** `HEAD` held V9.7 at the
  last check and V9.8 was uncommitted, so **this edit is now stacked on top of an uncommitted V9.8** —
  which is precisely the risk delta §46 raises about the diff getting harder to read. **Committing before
  the next pass would make the next one much safer.**
