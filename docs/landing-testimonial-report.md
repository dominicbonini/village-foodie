# The Pizzeria Gusto testimonial — the quote, and nothing else

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every string below is quoted from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint app/landing/page.tsx`, exit 0, no findings.
- **Execution** — the testimonial `<section>` was **lifted out of `page.tsx` rather than retyped**,
  transpiled, and rendered through `react-dom/server`; the rendered blockquote was HTML-decoded and
  compared character for character against the brief's text.

**NO DEPLOY. NO MIGRATION. NO SQL.** **No credential value was read, printed, invented or committed.**

🔴 **SCOPE CORRECTION APPLIED.** My first pass rebuilt the attribution — it replaced the hardcoded
logo with a database read, dropped the award, and added a component. **You told me everything except
the quote was already present and correct, so all of that is reverted.** `app/landing/page.tsx` is
byte-identical to its pre-session state **except line 209**, and the file I had added is deleted.

✅ **AND THE AWARD IS CONFIRMED.** You have since told me *"Mobile pizzeria of the year — regional
winner is correct."* The rendered award was already restored by the revert and is untouched.

✅ **THE "INVENTED" COMMENTS ARE GONE.** On your instruction, the two code comments that still called
the quote invented and the award unverified have been rewritten. **Comments only — §5. The rendered
markup is unchanged, proven below.**

---

## 1. THE CHANGE — ONE RENDERED LINE, PLUS TWO COMMENTS

```diff
--- app/landing/page.tsx   (pre-edit)
+++ app/landing/page.tsx
@@ -206,7 +206,7 @@
       <section className="quote-sec">
         <div className="wrap quote-in">
           <span className="quote-mark">“</span>
-          <blockquote>Took orders all night and didn’t miss one. First Saturday in years I’ve not had a queue out the door.</blockquote>
+          <blockquote>{"HatchGrab has made ordering so much easier. Everything's organised, we can track stock and know exactly how many pizzas we have left to sell — and the time slots are fantastic for busy villages."}</blockquote>
           <div className="quote-by">
             <Image className="quote-logo" src="/gusto-logo.png" alt="Pizzeria Gusto" width={320} height={233} />
             <span className="quote-who">
```

**That is the entire change to what renders.** At that point the file was 460 lines before and after,
with **one differing line number: 209.** The comment rewrite in §5 came afterwards and adds 7 lines,
none of which render.

### Why `{"…"}` and not bare JSX text

The quote contains a **straight apostrophe** (`U+0027`). As bare JSX text that is subject to
`react/no-unescaped-entities` and to any formatter that decides to reflow or "smarten" the line — and
the surrounding file is entirely typographic apostrophes, so a tidy-up pass would convert it without
anyone noticing. **Held as a string expression, nothing can touch a character of it.** The rendered
output is identical either way; the difference is that this form cannot drift.

---

## 2. WHAT WAS ALREADY THERE (the read you asked for first)

🔴 **YES — a testimonial section already existed**, at `app/landing/page.tsx:201-224`, one
`<section className="quote-sec">` between "Getting going" and "Orders". **This replaces its quote and
joins nothing.** It had four parts:

| Part | Before | After |
|---|---|---|
| The quote | 🔴 **INVENTED** — *"Took orders all night and didn't miss one. First Saturday in years I've not had a queue out the door."* | ✅ **their own words** |
| The logo | `<Image className="quote-logo" src="/gusto-logo.png" alt="Pizzeria Gusto" width={320} height={233} />` | **unchanged** |
| Their name | `<span className="quote-name">Pizzeria Gusto</span>` | **unchanged** |
| The award | `★ Mobile Pizzeria of the Year ★ / Regional winner` | **unchanged — and you have now confirmed it is correct** |

---

## 3. THE QUOTE — CHARACTER FOR CHARACTER

**Rendered from the lifted section, then HTML-decoded:**

```
HatchGrab has made ordering so much easier. Everything's organised, we can track stock and know exactly how many pizzas we have left to sell — and the time slots are fantastic for busy villages.
```

**Against the brief's text, rebuilt in the harness from explicit codepoints so the comparison cannot be
smuggled past itself:**

```
  IDENTICAL: true    lengths 194 / 194
  starts: "HatchGrab ha"   ends: "sy villages."
```

**Every non-alphanumeric, non-space character in what renders:**

| index | codepoint | char |
|---|---|---|
| 42 | `U+002E` | `.` |
| 54 | `U+0027` | `'` — **straight apostrophe** |
| 66 | `U+002C` | `,` |
| 141 | `U+2014` | `—` — **em dash, intact** |
| 193 | `U+002E` | `.` |

### ⚠️ THREE MARKUP FACTS THAT COULD ALTER THE TEXT — FLAGGED, NOT ADJUSTED

1. ⚠️ **THE APOSTROPHE IS `U+0027`, AND EVERY OTHER APOSTROPHE ON THE PAGE IS `U+2019`.** The
   surrounding copy is typographic throughout — *"they're"*, *"don't"*, and the invented quote this
   replaces used *"didn't"* and *"I've"*. **I did not harmonise it**, because rule 2 says do not
   re-punctuate. It will render very slightly straighter and narrower than the page's other
   apostrophes. **If the operator's own message used a curly apostrophe and it was flattened somewhere
   between them and this brief, that is the one character worth checking with them.** It is a
   one-character edit and I am not making it on my own judgement.
2. **React serialises `'` as `&#x27;` in the HTML.** That is the encoding, not the text — the browser
   decodes it back to `U+0027`. The comparison above is against the **decoded** output, which is what a
   reader sees and what a copy-paste yields.
3. **The decorative `“` above the quote is a separate element** (`.quote-mark`, 3.4rem, orange, own
   line) that was already there. It does not wrap the text: the blockquote starts `HatchGrab ` and ends
   ` villages.` with **no added opening or closing marks**, and there is no matching `”` anywhere. That
   asymmetry is the existing design and I left it.

### Truncation — proven impossible at any width

Every rule in `landing.css` that touches this text:

```
.hg-landing .quote-in { max-width: 44rem; margin: 0 auto; text-align: center; }
.hg-landing blockquote { font-family: var(--display); font-weight: 700; font-size: clamp(1.25rem,2.6vw,1.7rem); line-height: 1.35; letter-spacing: -.02em; color: var(--head); margin-bottom: 1.5rem; }
```

**No `text-overflow`, no `-webkit-line-clamp`, no `-webkit-box`, no `white-space`, no fixed height** —
grepped and confirmed absent for `blockquote` and every `.quote-*` class. The `clamp()` sets the *font
size*, not a line count. The text wraps freely in a 44rem centred column and every word is present at
every width.

⚠️ **The new quote is 194 characters against the old one's 105 — it is 85% longer.** Nothing truncates
it, but at desktop width it will run to roughly twice the lines. **Not observed in a browser.**

---

## 4. THE ATTRIBUTION — UNCHANGED, AND CONFIRMED STILL RENDERING

You asked me to prove the logo resolves and to say what happens if it does not. **The mechanism is the
one that was already there and I did not touch it**, so this is a report on it, not a change to it.

**Rendered from the lifted section (next/image stubbed as a plain `<img>` so the markup is visible):**

```html
<div class="quote-by">
  <img class="quote-logo" src="/gusto-logo.png" alt="Pizzeria Gusto" width="320" height="233"/>
  <span class="quote-who">
    <span class="quote-name">Pizzeria Gusto</span>
    <span class="quote-cred" …>
      <span class="cred-title" …>★ Mobile Pizzeria of the Year ★</span>
      <span class="cred-scope" …>Regional winner</span>
```

**The logo is `public/gusto-logo.png` — a real file, 54,891 bytes, 320 × 233, present on disk.** It is a
build-time asset in the repository, not a database read, so **it cannot be missing at runtime**: if it
were deleted the build would fail, not the page.

**If it somehow failed to load anyway, the quote is still attributed** — `<span class="quote-name">Pizzeria
Gusto</span>` and the award line sit beneath the logo and are plain text. **There is no state in which
this renders as an unattributed quote.** The `alt="Pizzeria Gusto"` covers screen readers and a
broken-image state alike.

⚠️ **What I did NOT do, and it was in the brief:** the brief asked for the logo to be resolved from the
truck's record via the shared `resolveTruckLogo` helper rather than a hardcoded path. **You have since
told me the attribution was already present and correct, so I reverted that.** For the record, I did
verify during the first pass that it works — `trucks` row `slug = 'pizzeria-gusto'` carries
`logo_storage_path = "pizzeria-gusto/1781784850351-pizzeriagusto.jpg"` and the resolved public URL
returns **HTTP 200, image/jpeg, 246,320 bytes, 1600 × 1280**. **That path is not in use and this change
does not depend on it.** If you ever do want the switch, note that the real upload is **4.5× the bytes
and a 22× oversample** of the committed PNG, and is 1.25:1 where the PNG is 1.37:1 — so the mark would
render squarer.

---

## 5. THE STALE COMMENTS — REWRITTEN

I flagged three comments that described a state no longer true. **You told me to remove the reference
to the quote being invented, so I rewrote the two that are inside the testimonial block.** Both are
**comments only** — see the proof at the end of this section.

### 5.1 The section header comment, `page.tsx:201-205`

**Before** — 🔴 the dangerous one. Someone reading it could have deleted a real customer's real words
believing they were placeholder text:

```
⚠️⚠️ PLACEHOLDER — DO NOT PUBLISH. The quote below is INVENTED and Pizzeria Gusto have NOT given
permission. This whole section must stay off any public/promoted build until Dominic has their
actual words AND their consent. The logo is real (public/gusto-logo.png) but the attribution +
award credit are unverified.
```

**After:**

```
✅ THE QUOTE IS REAL. These are Pizzeria Gusto's own words, supplied by Dominic on 28 August 2026,
and the award credit below is confirmed correct by him on the same day. The INVENTED placeholder
quote that stood here until then is gone. 🔴 DO NOT EDIT, TIGHTEN OR RE-PUNCTUATE THE QUOTE — it is a
live trading business's speech, not our copy. It is held as a string expression rather than bare
JSX text so no formatter can straighten its apostrophe to match the rest of this page.
🔴 THE GATE IN layout.tsx AND THE noindex ABOVE STAY ON, AND THIS DOES NOT CHANGE THAT. Having their
words is not the same as having their written permission to publish them, and no record of consent
exists in this repository. layout.tsx's condition 1 is still unmet and still correctly worded.
The logo is public/gusto-logo.png, which is real and always has been.
```

🔴 **NOTE WHAT SURVIVED THE REWRITE.** The old comment bundled two separate claims into one
"DO NOT PUBLISH": *the content is fake* and *we have no permission*. **Only the first has stopped
being true.** The new comment keeps the second, states it on its own, and points at `layout.tsx` —
so removing "invented" does not quietly remove the reason the gate exists.

### 5.2 The award comment, `page.tsx:214`

**Before:** `⚠️ Award wording UNVERIFIED (pending Gusto confirmation) — shown here only because /landing is admin-gated.`

**After:** `✅ Award wording CONFIRMED by Dominic, 28 August 2026 ("Mobile pizzeria of the year — regional winner is correct").`

⚠️ **I changed this one on your award confirmation, not on an explicit instruction to touch it.** Your
message said to remove the reference to being invented; this comment said "UNVERIFIED", which is the
same stale falsehood one message after you confirmed the award is correct. **Say so and I will put it
back.** The rest of that comment — the note about inline styles surviving a stale cached stylesheet —
is unchanged.

### 5.3 Not touched, because they are still TRUE

- **`layout.tsx:5-8`** — *"THE PIZZERIA GUSTO TESTIMONIAL IS NOT CLEARED FOR PUBLICATION… Permission
  has not been given."* It does not say "invented". It says unpermissioned, which still holds. **Byte-identical.**
- **`page.tsx:7` and `page.tsx:44`** — both refer to the testimonial being *unpermissioned*, not fake.
  **Unchanged.**
- ⚠️ **`docs/reference-manual.md`** (V8.9, V11.34) still says *"the quote + award are not [real]"*. **That
  is now out of date and I have not edited the manual** — merging a delta is a separate workstream you
  drive.

### PROOF IT IS COMMENTS ONLY

- **Every changed line is inside a JSX comment** — 11 lines, mechanically checked; not one starts a tag.
- **The section was re-rendered through `react-dom/server` before and after the edit and the output is
  byte-identical.** The only difference between the two harness runs is the *lifted source* length
  (2165 → 2172 chars, because the comments live inside the section). **The rendered blockquote,
  the logo, the name and the award markup are character-for-character the same.**
- `tsc --noEmit` clean; `eslint app/landing/page.tsx` exit 0.

---

## 6. 🔴 I DID NOT TAKE THE GATE OFF, AND I DID NOT TOUCH `noindex`

`app/landing/layout.tsx` holds this route admin-only on two conditions, the first being *"THE PIZZERIA
GUSTO TESTIMONIAL IS NOT CLEARED FOR PUBLICATION… Permission has not been given."*

🔴 **YOU GAVE ME THEIR WORDS AND CONFIRMED THEIR AWARD. NEITHER IS THE SAME AS WRITTEN PERMISSION TO
PUBLISH THEM**, and nothing in this repository records consent. **So `layout.tsx` is byte-identical,
`robots: { index: false }` is byte-identical, and condition 1 stands.** If you do hold their
permission, that is a separate change — and `layout.tsx` says the gate removal and the `index: true`
flip must ship in the same commit.

⚠️ **Condition 2 is untouched and unmet regardless** — the three `.shot` screenshot frames are still
dashed placeholders.

---

## 7. THE PLAIN-ENGLISH CHECKER — NOT RUN OVER THE QUOTE, AND NO EXCLUSION WAS NEEDED

🔴 **The checker's corpus is EXPLICIT, not scraped.** Its own header: *"THE CORPUS IS EXPLICIT, NOT
SCRAPED… what is checked is what an OPERATOR READS. Add each new string here when you write it."*

**So it does not pick the quote up unless somebody adds it, and I did not add it.** Confirmed:
`grep -c 'busy villages' scripts/check-plain-english.mjs` → **0**. **Leaving it out is the exclusion.**

`scripts/check-plain-english.mjs` is **byte-unchanged**. Run for completeness, its result is identical
to before this session: `23/24 pass, 1 known violation(s)` — the pre-existing `QR: print or display`
entry, unrelated to this.

⚠️ **For the record it would have passed anyway** — no `BANNED` word appears in it. It is excluded on
principle, not to hide a hit.

---

## 8. EVERYTHING ELSE IS UNCHANGED — NAMED

| File | State |
|---|---|
| `app/landing/page.tsx` | **one rendered line (209) plus two comment blocks (§5).** Every other line byte-identical |
| `app/landing/landing.css` | ✅ **BYTE-IDENTICAL** (`cmp -s`) |
| `app/landing/layout.tsx` | ✅ **BYTE-IDENTICAL** (`cmp -s`) |
| `public/gusto-logo.png` | ✅ untouched, still referenced, still 54,891 bytes |
| `components/landing/` | ✅ back to three files — `DemoUpload.tsx`, `LandingFooter.tsx`, `LandingNav.tsx`. **The file my first pass added is deleted** |
| `lib/`, `scripts/`, `supabase/` | ✅ untouched by this workstream |

⚠️ `git status` lists many other modified and untracked files. **None is mine** — they are the
uncommitted state of earlier workstreams and were already there when this one started.

---

## 9. WHAT REMAINS UNOBSERVED

1. 🔴 **NO PAGE WAS LOADED IN A BROWSER.** The markup in §3 and §4 came from `react-dom/server` on the
   section lifted out of `page.tsx`. **How the longer quote actually sets — line count, whether it
   crowds the logo beneath it — is not observed**, and it is 85% longer than what it replaces.
2. **The apostrophe question in §3 is unresolved** and only the operator's original message settles it.
3. **The award's wording is confirmed by you in chat. That confirmation now lives in a code comment
   dated 28 August 2026 — which is a record, but not a signed one from Gusto.** §5.2.
4. **Written permission to publish is still not recorded anywhere.** §6.
