# Landing copy — restore notes (WhatsApp → coming soon)

**Recorded 1 September 2026. Every string below was captured BEFORE it was touched.**

🔴 **EXACTLY ONE SOURCE EDIT HAS BEEN MADE: the pricing-card reorder in §3b** (moving "Offline order
protection" to the second bullet), which you asked for mid-task. **Its BEFORE state is recorded there
verbatim.**
✅ **EVERYTHING ELSE IN THIS FILE IS UNCHANGED ON DISK** — §1, §2, §3 and §4 record the current state
and are recorded because they were *proposed* for change, not because they were changed. **The WhatsApp
→ coming-soon change was NOT made; see `docs/landing-whatsapp-change-report.md` for why.**

This file exists so that anything changed can be put back character for character.

**Method:** each block was extracted with `sed -n '<line>p'` from the working tree and pasted
unaltered. **Smart quotes (`“ ” ’`), HTML entities (`&amp;`), em dashes (`—`) and whitespace are as
they appear in the file.** ⚠️ **Do not retype these by hand — copy them.**

---

## 1 · The comparison-table row — `lib/plan-features.ts:212`

**Proposed to change under task item 1(a). NOT CHANGED — see the contradiction in
`docs/landing-whatsapp-change-report.md`.**

```
      { name: 'WhatsApp auto-replies',            footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true,           max: true           },
```

⚠️ **The column padding is deliberate alignment** — `pro: true,` is followed by 11 spaces and
`max: true` by 11 spaces, so the row lines up with its neighbours. **Preserve it on restore.**

### The two comment lines immediately above it (`:209-211`) — context, unchanged

```
      // Auto-replies are SPLIT on purpose: WhatsApp is LIVE, Messenger/Instagram are coming soon. Do not
      // re-merge them into one row — a combined row reads as "all three work today", which isn't true.
      // Both carry footnote 4 (business account required + AI replies can be wrong).
```

🔴 **If row 212 is ever flipped to `coming_soon`, this comment becomes false and must be rewritten in
the same change.** It is recorded here so the pair can be restored together.

---

## 2 · The key-features block — `app/landing/page.tsx:179`

**Proposed to change under task item 1(b). NOT CHANGED — wording is awaiting your approval.**

```
            <div className="does-item"><h3>Social media auto-replies</h3><p>“Where are you tonight?” “Do you do gluten free?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill. Messenger and Instagram coming soon.</p></div>
```

**Plain-text of the copy itself, for reference:**

> **Social media auto-replies**
> “Where are you tonight?” “Do you do gluten free?” Your WhatsApp gets answered while you’re driving to
> the pitch or at the grill. Messenger and Instagram coming soon.

⚠️ **The quotation marks are CURLY (`“ ”`) and the apostrophe in `you’re` is CURLY (`’`).** A restore
that types straight quotes is not a restore.

### The editorial comment governing it (`app/landing/page.tsx:174-178`) — unchanged

```
                🔴 THE MIXED TENSES ARE DELIBERATE. WhatsApp is PRESENT tense because it ships at launch;
                Messenger and Instagram carry "coming soon" because they may not. Same standing editorial
                rule as FOOTNOTES[3] in lib/plan-features.ts — the landing page describes the product AT
                LAUNCH — applied to two features with different readiness. It is NOT an inconsistency; do
                not "harmonise" the tenses. */}
```

🔴 **THIS COMMENT EXPLICITLY FORBIDS THE CHANGE REQUESTED IN 1(b)** — it says WhatsApp is present tense
*on purpose* and tells the next reader not to harmonise it. **It is not a blocker (you are the author of
the rule and may change it), but it must be rewritten in the same edit or the file will contradict
itself.** Recorded so the original reasoning is not lost.

---

## 3 · The Pro tier bullet — `app/landing/page.tsx:331`

**NOT in the task's list. NOT CHANGED. Recorded because it is the third place on this same page that
presents WhatsApp as included, and leaving it would make the page self-contradictory.**

```
                <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
```

⚠️ **`&amp;` is an HTML entity in the source, not a bare `&`.**

⚠️ **THE LINE NUMBER MOVED.** This bullet was at `:331` when recorded; after the §3b reorder it is at
`:332`. **The string itself is unchanged.** For the surrounding list in both its states, see §3b.

**Note the existing in-list coming-soon mechanism:** `<span className="soon-inline">Coming soon</span>`.
**That is the pattern to reuse if this bullet is ever changed — do not invent another.**

---

## 3b · The Pro pricing-card bullet list — `app/landing/page.tsx:326-333`

🔴 **CHANGED — this is the one edit made in this task (the mid-turn request: move "Offline order
protection" to the second bullet, directly below the lead).** Original recorded here verbatim.

**BEFORE (the state on disk before my edit):**

```
                <li className="lead">Everything in Free, plus</li>
                <li>Take payment online</li>
                <li>Pre-orders &amp; collection times</li>
                <li>Smart slot management</li>
                <li>Auto-accept orders</li>
                <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
                <li>Offline order protection</li>
                <li>Take payment on your phone <span className="soon-inline">Coming soon</span></li>
```

**AFTER (what is on disk now):**

```
                <li className="lead">Everything in Free, plus</li>
                <li>Offline order protection</li>
                <li>Take payment online</li>
                <li>Pre-orders &amp; collection times</li>
                <li>Smart slot management</li>
                <li>Auto-accept orders</li>
                <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
                <li>Take payment on your phone <span className="soon-inline">Coming soon</span></li>
```

⚠️ **A PURE REORDER. No text, entity, indentation or class changed** — the same eight `<li>` elements
in a different order. To restore, paste the BEFORE block over the AFTER block.
⚠️ **Indentation is 16 spaces on every line.**
⚠️ **The Max card is untouched** — it carries no "Offline order protection" bullet of its own; it
inherits via `Everything in Pro, plus`.

---

## 4 · The three PROTECTED strings — recorded to prove they are untouched

🔴 **NONE OF THESE HAS BEEN CHANGED, AND NONE NEEDED TO BE.** Recorded verbatim so that any future diff
can be checked against them.

### (a) The row label whose em dash is a join key

`lib/plan-features.ts:185`
```
      { name: 'Online ordering — Pay at Hatch', footnote: '1', detail: 'Customers order ahead online and pay in person when they collect.', starter: true, pro: false, max: false },
```

**It is matched by exact string in two further places, both unchanged:**

`app/landing/page.tsx:64`
```
  if (row.name === 'Online ordering — Pay at Hatch') return true
```

`lib/plan-features.ts:383`
```
  'Online ordering — Pay at Hatch': 'online_ordering_pay_at_hatch',
```

🔴 **Three occurrences of one string, joined by exact match. Changing the dash in one breaks the other
two silently.**

### (b) The bare `—` not-included cell value

`app/landing/page.tsx:96`
```
  return <span className="no">—</span>
```

⚠️ **This is an EM DASH (U+2014), not a hyphen and not an en dash.**

### (c) The customer testimonial

**A real operator's words (Pizzeria Gusto). NOT reproduced here** — copying it into a second file would
create exactly the drift this note exists to prevent, and it is not among the strings under change.
**It is untouched in `app/landing/page.tsx`.** ⚠️ **The landing page carries a standing note (`:7`) that
written permission is still outstanding for it — a separate matter, flagged not actioned.**

---

## 5 · Restore procedure

1. **`git diff`** against the recorded strings above — if none of them appears in the diff, nothing
   needs restoring.
2. To restore any block: **copy the fenced text above verbatim** into the stated file and line. Do not
   retype.
3. **Check the curly quotes and the `&amp;` entity survived the paste.**
4. If `lib/plan-features.ts:212` was changed, **restore its comment block (§1) in the same edit.**
5. If `app/landing/page.tsx:179` was changed, **restore its editorial comment (§2) in the same edit.**
6. **Re-run the landing page in dev.** `findPlanParityViolations()` runs at module load and **throws in
   development** — a broken restore of row 212 will surface immediately there. ⚠️ **In production it
   only `console.error`s, so dev is where this check has teeth.**

---

## Verification of this file

- **Executed:** `sed -n` extraction of each line from the working tree, and `grep` to confirm each
  string's occurrence count. **That is execution of my extraction, not of the product.**
- **Not executed:** no build, no browser, no deploy. **I have not rendered the landing page.**
- 🔴 **At the moment of writing, `git status` shows `app/landing/page.tsx` and `lib/plan-features.ts` as
  UNMODIFIED. These notes describe the committed-and-working state, not a state I created.**

---

## 6 · STATUS UPDATE — the continuation of 1 September 2026

**ADDED, not edited.** 🔴 **The verbatim originals in §1–§4 are UNTOUCHED and remain the restore
source.** Their "NOT CHANGED" labels were accurate when written; this section supersedes them.

**You approved the three-surface spread. These are now CHANGED on disk:**

| Section | String | Status |
|---|---|---|
| **§1** | `lib/plan-features.ts:212` — the matrix row | 🔴 **CHANGED** — `pro`/`max` flipped to `'coming_soon'` |
| **§1** | `lib/plan-features.ts:209-211` — the "WhatsApp is LIVE" comment | 🔴 **CHANGED** — rewritten; it asserted the opposite of the new state |
| **§2** | `app/landing/page.tsx:179` — the key-features block | 🔴 **CHANGED** — your approved wording |
| **§2** | `app/landing/page.tsx:174-178` — the mixed-tenses comment | 🔴 **CHANGED** — rewritten per item 5 |
| **§3** | the Pro-card bullet (was `:332`) | 🔴 **CHANGED** — `soon-inline` badge applied |
| **§3b** | the pricing reorder | ✅ Already applied in the previous task |
| **§4** | the three protected strings | ✅ **STILL UNTOUCHED** |

### The one string this task changed that was NOT already recorded above

**`lib/plan-features.ts:209-211` is recorded verbatim in §1** as "context, unchanged" — **it is now
changed, and §1's copy is the restore source.** No string was altered without a verbatim record.

### To restore everything to the pre-continuation state

1. §1 row + §1 comment block → `lib/plan-features.ts`
2. §2 block + §2 comment → `app/landing/page.tsx`
3. §3 bullet → `app/landing/page.tsx`
4. ⚠️ **Leave §3b (the pricing reorder) alone unless you also want that reverted** — it was a separate,
   separately-approved change.
5. **Run the landing page in dev.** `findPlanParityViolations()` throws in development, and restoring
   the row to `true` while the gate is intact is the safe direction (no violation).

---

## 7 · ANDROID → COMING SOON (added 1 September 2026)

**ADDED, not edited.** Six strings, recorded verbatim BEFORE any of them was touched.

### 7.1 · `lib/plan-features.ts:196` — the MERGED compare-table row

```
      { name: 'iPhone, iPad and Android kitchen app', footnote: '3', detail: 'The fullest way to run HatchGrab: a live kitchen screen, plus the only way to keep taking orders when you lose signal.', starter: true, pro: true, max: true },
```

### 7.2 · `lib/plan-features.ts:186-195` — the merge comment above it

```
      // MERGED ROW. This was 'iPad kitchen app' (true/true/true) with a separate 'Android kitchen app'
      // (coming_soon/coming_soon/coming_soon) beneath it. Android now launches alongside iPad, so the second
      // row became a duplicate of this one and was removed. Both rows were UNIFORM across all three plans,
      // so the merge needed no per-plan decision — see the report.
      // 🔴 iPhone ADDED (was 'iPad and Android kitchen app'). The kitchen app is the SAME app with the same
      // features on a phone, and Pizzeria Gusto run their service on phones rather than tablets — so naming
      // only tablets under-claimed what a live operator does every day. This is the claim, not the form
      // factor: footnote 3 carries the browser fallback and the "not supplied" caveat.
      // ⚠️ AT 36 CHARACTERS THIS IS NOW THE LONGEST CELL IN THE MATRIX, two ahead of
      // 'Messenger & Instagram auto-replies' (34), which already renders on all three surfaces.
```

🔴 **THIS COMMENT RECORDS THE PRE-MERGE STRUCTURE, WHICH IS EXACTLY WHAT THE CHANGE RESTORES:**
`'iPad kitchen app'` true/true/true **plus** a separate `'Android kitchen app'` coming_soon×3.

### 7.3 · `lib/plan-features.ts:399` — the ROW_FEATURE_MAP key

```
  'iPhone, iPad and Android kitchen app': 'ipad_kds',
```

### 7.4 · `lib/plan-features.ts:360` — footnote 3 text

```
    text: 'Device not supplied. There are native kitchen apps for iPhone, iPad and Android, and the kitchen screen also runs on any phone or tablet with a modern browser.',
```

### 7.5 · `app/landing/page.tsx:88` — landing-only DETAIL_OVERRIDES entry

```
  'Offline Order Protection': "If you lose signal, online ordering pauses so customers can't place orders you won't see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection.",
```

⚠️ **Straight apostrophes here (`can't`, `won't`) — the string is double-quoted. NOT curly.**

### 7.6 · `app/landing/page.tsx:188` — the "No signal? Keep serving." block

```
            <div className="does-item"><h3>No signal? Keep serving.</h3><p>If you lose signal, online ordering pauses automatically so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app.</p></div>
```

⚠️ **CURLY apostrophes here (`can’t`, `won’t`) — the opposite of 7.5. Do not normalise either.**

### 7.7 · `app/landing/page.tsx:321` — the Free-tier pricing bullet

```
                <li>iPhone, iPad and Android kitchen app</li>
```

**Its governing comment (`:318-320`), recorded because it is the rule that forced 7.7 to change with 7.1:**

```
                {/* ⚠️ HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS. This bullet is a literal twin of the
                    matrix row in lib/plan-features.ts and nothing checks the two against each other, so it
                    must be changed in the SAME commit or the same page shows two different claims. */}
```

### Restore order for §7

1. 7.1 + 7.2 + 7.3 + 7.4 → `lib/plan-features.ts` (the row, its comment, the map key, the footnote)
2. 7.5 + 7.6 + 7.7 → `app/landing/page.tsx`
3. **Run the landing page in dev** — `findPlanParityViolations()` throws there. ⚠️ **Restoring 7.1
   without 7.3 leaves the map key pointing at a row name that no longer exists, which the checker
   SILENTLY SKIPS (`continue` on no entry). Restore them together.**

---

## 8 · "What it does" — question swap (added 1 September 2026)

**ADDED, not edited.** Your mid-task request: change `“Do you do gluten free?”` to
`“What desserts do you have?”` in the key-features ("what it does") block.

⚠️ **This edits the block ALREADY CHANGED in §2 of this session**, so the string below is its
POST-§2 / PRE-§8 state. **The true original — before any change today — is in §2 and is still the
restore source for a full revert.**

**BEFORE (state on disk immediately before this edit), `app/landing/page.tsx:187`:**

```
            <div className="does-item"><h3>Social media auto-replies — coming soon</h3><p>“Where are you tonight?” “Do you do gluten free?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow.</p></div>
```

**AFTER:**

```
            <div className="does-item"><h3>Social media auto-replies — coming soon</h3><p>“Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow.</p></div>
```

⚠️ **CURLY quotes on both questions (`“ ”`) and a curly apostrophe in `you’re`. Unchanged by this
edit — only the words between the second pair of quotes changed.**

---

## 9 · "What it does" — tile reorder (added 1 September 2026)

**ADDED, not edited.** Your request: move **Social media auto-replies** below **No signal? Keep
serving.** so it is last in the "what it does" grid.

**BEFORE — `app/landing/page.tsx:170-188`, in this order:**

1. the 17-line comment block beginning `{/* ⚠️ "driving to the pitch or at the grill"…`
2. `<div className="does-item"><h3>Social media auto-replies — coming soon</h3>…`
3. `<div className="does-item"><h3>No signal? Keep serving.</h3>…`

**AFTER — the same three blocks, reordered to:**

1. `<div className="does-item"><h3>No signal? Keep serving.</h3>…`
2. the 17-line comment block (unchanged, moved intact)
3. `<div className="does-item"><h3>Social media auto-replies — coming soon</h3>…`

🔴 **THE COMMENT BLOCK MOVED WITH THE TILE IT DESCRIBES.** It opens by justifying
*"driving to the pitch or at the grill"* and then explains the WhatsApp tense decision — **left in
place it would have sat above "No signal? Keep serving." and described the wrong tile.**

⚠️ **A PURE REORDER — not one character inside any of the three blocks changed.** To restore, put the
comment block back above the social-media tile and swap the two tiles.

⚠️ **The exact text of both tiles is already recorded verbatim: the social-media tile in §2 (original)
and §8 (current), the "No signal?" tile in §7.6 (original).**

---

## 10 · HERO SCREENSHOT FAN — wiring real images (added 1 September 2026)

**ADDED, not edited.** Everything below is the state on disk **BEFORE** the slots were wired.

### 10.1 · Markup — `app/landing/page.tsx:137-144`

```
          {/* Screenshot fan — dashed PLACEHOLDER frames. DOMINIC: swap each .shot for a real <img> (tidy data,
              plausible names/items) when screenshots are ready. */}
          <div className="fan">
            <div className="shot shot-kds"><span className="lbl">Screenshot</span><span className="hint">Kitchen screen — tickets in cook order</span></div>
            <div className="shot shot-dash"><span className="lbl">Screenshot</span><span className="hint">Orders dashboard — realistic orders, capacity strip visible</span></div>
            <div className="shot shot-phone"><span className="lbl">Screenshot</span><span className="hint">Customer ordering</span></div>
          </div>
```

⚠️ **The six spans (two per slot) and their exact hint wording are the brief for what each screenshot
shows.** They are recorded here because deleting them deletes that brief — **§2 of
`docs/landing-screenshot-spec-report.md` also carries it.**

### 10.2 · CSS — `app/landing/landing.css:161-171`

```
/* ---------- screenshot fan (dashed placeholders — keep until real shots land) ---------- */
.hg-landing .fan { position: relative; display: flex; align-items: center; justify-content: center; min-height: clamp(300px,42vw,430px); animation: hg-rise .7s cubic-bezier(.2,.7,.3,1) both; }
@keyframes hg-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@media(prefers-reduced-motion:reduce){ .hg-landing .fan { animation: none; } html:has(.hg-landing){ scroll-behavior: auto; } }
.hg-landing .shot { background: var(--paper); border: 2px dashed var(--line); border-radius: 12px; box-shadow: 0 22px 50px -20px rgba(15,23,42,.32),0 2px 8px rgba(15,23,42,.06); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .35rem; text-align: center; padding: 1rem; position: absolute; }
.hg-landing .shot .lbl { font-family: var(--display); font-weight: 700; font-size: .66rem; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-faint); }
.hg-landing .shot .hint { font-size: .78rem; color: var(--ink-faint); max-width: 22ch; line-height: 1.35; }
.hg-landing .shot-kds { width: min(58%,320px); aspect-ratio: 4/3; left: 0; top: 8%; transform: rotate(-6deg); z-index: 1; }
.hg-landing .shot-dash { width: min(72%,400px); aspect-ratio: 16/11; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(-1deg); z-index: 2; border-color: var(--ink-faint); }
.hg-landing .shot-phone { width: min(26%,140px); aspect-ratio: 9/17; right: 2%; bottom: 0; transform: rotate(5deg); z-index: 3; border-radius: 18px; }
.hg-landing .shot-phone .hint { font-size: .7rem; }
```

⚠️ **Of these, `.fan`, `@keyframes hg-rise`, the reduced-motion query, and the three `.shot-*` position
rules are KEPT** (minus one placeholder-only declaration on `.shot-dash`). **The `.shot` base rule is
rewritten and the three `.lbl` / `.hint` rules are deleted.**

### 10.3 · To restore

1. Paste 10.1 over the wired markup, and remove the `Image` usages.
2. Paste 10.2 over the rewritten CSS block.
3. ⚠️ **`import Image from 'next/image'` at `page.tsx:20` PRE-DATES this change** (it serves the Gusto
   logo at `:225`) — **do NOT remove it on restore.**
4. **Nothing needs deleting from `public/screenshots/`** — an unused folder is inert.

---

## 11 · HERO FAN — two real images in, third slot back to a placeholder (added 1 September 2026)

**ADDED, not edited.** ⚠️ **The pre-wiring state is in §10. This section records the state as it stood
AFTER §10's wiring and BEFORE this change** — i.e. all three slots wired to `next/image`, two of them
pointing at files that did not exist.

### 11.1 · The customer slot as it stood before this change — `app/landing/page.tsx`

```
            <div className="shot shot-phone">
              <Image src="/screenshots/customer.png" alt="A customer ordering from a food truck on their phone" width={140} height={264} sizes="(max-width: 939px) 26vw, 140px" priority />
            </div>
```

🔴 **This is what is being replaced by a placeholder div in this change.** The kitchen and dashboard
slots are UNCHANGED by this task — only their target files now exist.

### 11.2 · The `.shot` rule as it stood before this change — `app/landing/landing.css:175-178`

```
.hg-landing .shot { background: var(--line); border-radius: 12px; box-shadow: 0 22px 50px -20px rgba(15,23,42,.32),0 2px 8px rgba(15,23,42,.06); overflow: hidden; display: block; position: absolute; }
/* The image fills its frame. object-fit:cover crops rather than distorts — the export ratios in
   docs/landing-screenshot-spec-report.md §3 are chosen so there is nothing to crop when they match. */
.hg-landing .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
```

⚠️ **A `.shot-empty` modifier is ADDED after these in this change.** The base rule above is NOT edited.
**To restore: delete the `.shot-empty` block and revert 11.1.**

### 11.3 · Files added to `public/screenshots/`

```
kitchen.png    ← ~/Downloads/Screenshot_20260901_114103.png   (2560x1440)
dashboard.png  ← ~/Downloads/Screenshot_20260901_114038.png   (2560x1440)
```

⚠️ **`customer.png` deliberately NOT created** — that slot is a placeholder again until the phone shot
exists. **To restore: delete both files and revert 11.1.**

---

## 12 · HERO FAN — frame ratios matched to the 16:9 screenshots (added 1 September 2026)

**ADDED, not edited.** 🔴 **Reason: you rendered the page and the images were cut off at the sides.**
Both screenshots are 2560x1440 (16:9); the frames were 4:3 and 16:11, so `object-fit: cover` cropped
25% and 18% of the width respectively, symmetrically off both edges.

**BEFORE — `app/landing/landing.css`:**

```
.hg-landing .shot-kds { width: min(58%,320px); aspect-ratio: 4/3; left: 0; top: 8%; transform: rotate(-6deg); z-index: 1; }
.hg-landing .shot-dash { width: min(72%,400px); aspect-ratio: 16/11; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(-1deg); z-index: 2; }
```

**BEFORE — `app/landing/page.tsx`, the two Image width/height pairs:**

```
width={320} height={240}    (kitchen)
width={400} height={275}    (dashboard)
```

⚠️ **`.shot-phone` is NOT changed** — it stays `aspect-ratio: 9/17`. It holds a placeholder, and its
future screenshot is a portrait phone capture, not a 16:9 tablet one.

⚠️ **`app/landing/page.tsx` also contains `width={320} height={233}` — that is the GUSTO LOGO, not a
screenshot. Do not touch it on restore.**

⚠️ **To restore the original composition, put all four values back together** — the CSS ratios and the
Image width/height must agree, or next/image and the CSS disagree about the frame shape.

---

## 13 · HERO FAN — 16:9 reverted, original design ratios restored (added 1 September 2026)

**ADDED, not edited.** 🔴 **§12's 16:9 change is REVERTED. The iPad is a 4:3 device and 16:9 frames do
not read as a tablet — the design ratios win and the images are cropped to fit.**

**The four values, back to their originals (all four must stay in step):**

| Where | §12 set | Restored to |
|---|---|---|
| `landing.css` `.shot-kds` | `aspect-ratio: 16/9` | **`aspect-ratio: 4/3`** |
| `landing.css` `.shot-dash` | `aspect-ratio: 16/9` | **`aspect-ratio: 16/11`** |
| `page.tsx` kitchen Image | `width={320} height={180}` | **`width={320} height={240}`** |
| `page.tsx` dashboard Image | `width={400} height={225}` | **`width={400} height={225}` → `height={275}`** |

⚠️ **`.shot-phone` untouched — still `aspect-ratio: 9/17`, still a placeholder.**
⚠️ **`width={320} height={233}` in `page.tsx` is the GUSTO LOGO. Not touched.**

### 13.1 · Image files — originals preserved

**`public/screenshots/kitchen.png` is CROPPED in place** from 2560x1440 to 1920x1440 (4:3), removing
640px of width, 320px from each side, centred.

🔴 **THE UNCROPPED ORIGINALS REMAIN AT:**

```
~/Downloads/Screenshot_20260901_114103.png   (2560x1440)  -> kitchen.png
~/Downloads/Screenshot_20260901_114038.png   (2560x1440)  -> dashboard.png
```

**To restore either image, re-copy from Downloads.** ⚠️ **A crop is LOSSY — the cropped file cannot be
un-cropped.**

### 13.2 · `dashboard.png` NOT cropped

🔴 **The instruction "crop from the TOP and BOTTOM, never the sides" is geometrically impossible for
16:11 from a 16:9 source** — removing height makes an image WIDER, moving away from 16:11, which needs
320px of height ADDED. **Left at 2560x1440 pending your decision. See the report.**

---

## 14 · kitchen.png replaced with the 11-inch iPad KDS capture (added 1 September 2026)

**ADDED, not edited.**

**BEFORE:** `public/screenshots/kitchen.png` = 1920x1440, cropped from
`~/Downloads/Screenshot_20260901_114103.png` (2560x1440, 16:9 Android-ish capture).

**AFTER:** cropped from
`~/Downloads/Simulator Screenshot - iPad Pro 11-inch (M5) - 2026-09-01 at 19.18.34.png`
(2420x1668) to **2224x1668** (4:3), removing 196px of width, 98px per side, centred.

🔴 **BOTH ORIGINALS REMAIN IN ~/Downloads AND ARE UNTOUCHED:**

```
Simulator Screenshot - iPad Pro 11-inch (M5) - 2026-09-01 at 19.18.34.png   2420x1668  KDS   <- now used
Simulator Screenshot - iPad Pro 13-inch (M5) - 2026-09-01 at 18.48.45.png   2752x2064  Add order  (RULED OUT by you)
Screenshot_20260901_114103.png                                              2560x1440  KDS   (superseded)
Screenshot_20260901_114038.png                                              2560x1440  Add order (superseded)
```

⚠️ **`dashboard.png` is UNCHANGED** — still the superseded 2560x1440 16:9 Add-order capture. **The
11-inch replacement for it is not on disk.**
⚠️ **No CSS or markup changed by this step.** Ratios stay 4:3 / 16:11 / 9:17.

---

## 15 · Both slots wired from 11-inch captures; .shot-kds moved to 16:11 (added 1 September 2026)

**ADDED, not edited.**

🔴 **WHY THE 4:3 FRAME WAS ABANDONED — established by producing the crop and LOOKING at it.**
A 4:3 crop of a 2420x1668 capture removes 196px of width (98 per side). This app is a full-bleed grid
with no outer margin, so that width is CONTENT: the first and last columns of order cards were sliced
mid-card (`#3` -> `3`, `Chloe` -> `oe`, `PIZZA` -> `ZZA`, `Manage event` -> `Manage eve`). It read as a
broken screenshot, not a cropped one.

🔴 **THE DEVICE FACT BEHIND IT:**

```
iPad Pro 11-inch  2420x1668 = 1.4508  ~= 16:11  <- NOT 4:3
iPad Pro 13-inch  2752x2064 = 1.3333  =  4:3    exactly
```

**A 4:3 frame therefore requires a 13-INCH capture. The 11-inch cannot fill one without slicing.**

**BEFORE — `app/landing/landing.css`:**

```
.hg-landing .shot-kds { width: min(58%,320px); aspect-ratio: 4/3; left: 0; top: 8%; transform: rotate(-6deg); z-index: 1; }
```

**BEFORE — `app/landing/page.tsx`, kitchen Image:**

```
width={320} height={240}
```

⚠️ **`.shot-dash` is UNCHANGED at 16:11** — it was already correct.
⚠️ **`.shot-phone` UNCHANGED at 9/17, still the `shot-empty` placeholder.**

### 15.1 · Image files replaced

```
kitchen.png    <- ~/Desktop/Simulator Screenshot - iPad Pro 11-inch (M5) - 2026-09-01 at 19.27.56.png  (KDS)
dashboard.png  <- ~/Desktop/Simulator Screenshot - iPad Pro 11-inch (M5) - 2026-09-01 at 19.29.35.png  (Add order)
```

**Both 2420x1668, cropped to 2420x1664 — 4px of HEIGHT, top and bottom. 0.25%.**

🔴 **ALL ORIGINALS REMAIN UNTOUCHED on Desktop and in Downloads.** To restore an earlier state,
re-copy and re-crop from them.

---

## 16 · NO CROP — frames set to the exact capture ratio 605/417 (added 1 September 2026)

**ADDED, not edited.** 🔴 **Supersedes §15's 16:11 decision within minutes: you said do not crop at
all.** §15 still needed a 4px height crop because 16/11 (1.45455) is 0.25% off the capture's 1.45084.

**The fix: make the FRAMES the capture's exact aspect, so `object-fit: cover` has nothing to remove.**

```
2420 x 1668, gcd 4  ->  605/417 = 1.45084   EXACT
```

**BEFORE (state immediately prior, i.e. after §15):**

```
.hg-landing .shot-kds  { ... aspect-ratio: 16/11; left: 0; top: 8%; ... }      page.tsx: width={320} height={220}
.hg-landing .shot-dash { ... aspect-ratio: 16/11; left: 50%; top: 50%; ... }   page.tsx: width={400} height={275}
```

**AFTER:**

```
.hg-landing .shot-kds  { ... aspect-ratio: 605/417; ... }   page.tsx: width={320} height={221}
.hg-landing .shot-dash { ... aspect-ratio: 605/417; ... }   page.tsx: width={400} height={276}
```

⚠️ **`.shot-phone` UNCHANGED at 9/17, still the `shot-empty` placeholder.**

### 16.1 · Images copied UNCROPPED

```
kitchen.png    <- ~/Desktop/... 11-inch ... 19.27.56.png  (KDS)        2420x1668, uncropped
dashboard.png  <- ~/Desktop/... 11-inch ... 19.29.35.png  (Add order)  2420x1668, uncropped
```

🔴 **No `sips -c` was run on either. The previously cropped kitchen.png (2224x1668, 4:3) is
OVERWRITTEN — it was lossy and is not recoverable from the repo, but every original is intact on
Desktop and in Downloads.**

---

## 17 · 13-inch 4:3 captures, frames back to 4/3, images downscaled to 2x (added 1 September 2026)

**ADDED, not edited.** 🔴 **Supersedes §16.** The 11-inch captures forced a non-standard 605/417 frame;
the 13-inch iPad is EXACTLY 4:3 (2752x2064), so the original design ratio works with zero crop.

**BEFORE (state after §16):**

```
.hg-landing .shot-kds  { ... aspect-ratio: 605/417; left: 0; top: 8%; ... }      page.tsx: width={320} height={221}
.hg-landing .shot-dash { ... aspect-ratio: 605/417; left: 50%; top: 50%; ... }   page.tsx: width={400} height={276}
kitchen.png    2420x1668  420 KB   (11-inch KDS, uncropped)
dashboard.png  2420x1668  394 KB   (11-inch Add order, uncropped)
```

**AFTER:**

```
.hg-landing .shot-kds  { ... aspect-ratio: 4/3; ... }    page.tsx: width={320} height={240}
.hg-landing .shot-dash { ... aspect-ratio: 4/3; ... }    page.tsx: width={400} height={300}
kitchen.png    640x480   (13-inch KDS,              downscaled 2x, NOT cropped)
dashboard.png  800x600   (13-inch ORDERS DASHBOARD, downscaled 2x, NOT cropped)
```

⚠️ **`.shot-phone` UNCHANGED at 9/17, still the `shot-empty` placeholder.**

### 17.1 · Sources — all from ~/Desktop/landing page screeshots/

```
...13-inch (M5) - 2026-09-01 at 21.08.35.png  2752x2064  KDS              -> kitchen.png
...13-inch (M5) - 2026-09-01 at 21.07.46.png  2752x2064  ORDERS DASHBOARD -> dashboard.png   (capacity strip visible)
...13-inch (M5) - 2026-09-01 at 21.09.28.png  2752x2064  Add order        -> UNUSED
```

🔴 **NO CROP. `sips -Z` (proportional resize) only — the full frame is preserved, just fewer pixels.**
**All three originals remain in that folder untouched.**

### 17.2 · The dashboard alt text reverted

`dashboard.png` is now the REAL orders dashboard, so the alt written for the Add-order screen is wrong
again and is reverted to the original wording.

---

## 18 · object-fit: cover -> contain on the screenshot slots (added 1 September 2026)

**ADDED, not edited.**

**BEFORE — `app/landing/landing.css:176-178`:**

```
/* The image fills its frame. object-fit:cover crops rather than distorts — the export ratios in
   docs/landing-screenshot-spec-report.md §3 are chosen so there is nothing to crop when they match. */
.hg-landing .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
```

**AFTER:** the same rule with `object-fit: contain` and a rewritten comment.

⚠️ **This is the ONLY place object-fit is set for these slots.** The `<Image>` tags carry no `style`,
no `className` and no `fill`, so nothing competes with it.
⚠️ **No aspect-ratio, no next/image width/height and no image FILE was touched.**
⚠️ **`.shot-phone` / `.shot-empty` hold no `<img>`, so this rule does not reach the placeholder.**

---

## 19 · Background split off the filled slots (added 1 September 2026)

**ADDED, not edited.**

**BEFORE — `app/landing/landing.css:175`, unchanged, still shared by all three slots:**

```
.hg-landing .shot { background: var(--line); border-radius: 12px; box-shadow: 0 22px 50px -20px rgba(15,23,42,.32),0 2px 8px rgba(15,23,42,.06); overflow: hidden; display: block; position: absolute; }
```

**AFTER:** the rule above is UNTOUCHED; a new rule is added immediately after `.shot img` that clears
`background` and `padding` on the two FILLED slots only:

```
.hg-landing .shot-kds, .hg-landing .shot-dash { background: none; padding: 0; }
```

🔴 **The placeholder is deliberately NOT covered by it** — `.shot-empty` keeps `background: var(--paper)`,
its dashed border and its `padding: 1rem`, and is declared AFTER this rule so it wins for `.shot-phone`.

⚠️ **No aspect-ratio, no object-fit, no next/image width/height and no image file was touched.**

---

## 20 · dashboard slot swapped to the Add-order screen (added 1 September 2026)

**ADDED, not edited.**

**BEFORE — `public/screenshots/dashboard.png`** = the **ORDERS DASHBOARD** (capacity strip visible),
derived from `~/Desktop/landing page screeshots/Simulator Screenshot - iPad Pro 13-inch (M5) - 2026-09-01
at 21.07.46.png`, downscaled to 800x600. **Verified by opening the file, not by notes.**

**AFTER** = the **ADD ORDER** screen, from
`~/Desktop/landing page screeshots/dashboard-v2.png` (2752x2064, 21:09), downscaled to 800x600.

**BEFORE — the alt text in `app/landing/page.tsx`:**

```
alt="The HatchGrab orders dashboard, showing live orders and the day's kitchen capacity strip"
```

⚠️ **That alt is FALSE for the Add-order screen and is changed with the image.**

🔴 **The Orders-dashboard source is untouched at 21.07.46.png if you want it back.**
⚠️ **No aspect-ratio, object-fit or next/image width/height changed. Still 4:3 / contain / 400x300.**

---

## 21 · dashboard image moved to a NEW url: `dashboard-v3.png` (added 1 September 2026)

**ADDED, not edited.**

**BEFORE:** `app/landing/page.tsx` — `src="/screenshots/dashboard.png"`
**AFTER:**  `app/landing/page.tsx` — `src="/screenshots/dashboard-v3.png"`

**Why the url changed and not just the bytes:** Next's image optimiser cache is keyed on
**url + w + q**. Overwriting a file at the same url never invalidates it. Proved by execution:
after `public/screenshots/dashboard.png` was REMOVED from disk, the old url still answered
**HTTP 200 with `X-Nextjs-Cache: HIT`**. A new url is the only thing that invalidates every
width at once.

**The retired file is NOT deleted** — moved to the session scratchpad as `retired-dashboard.png`,
and its Desktop original is untouched.

⚠️ **`kitchen.png` still sits on a plain, re-overwritable name and carries the same risk.**
⚠️ **No aspect-ratio, object-fit or next/image width/height changed. Still 4:3 / contain / 400x300.**

---

## 22 · dashboard swapped to the 11-inch capture, frame reshaped to match (added 1 September 2026)

**ADDED, not edited.**

**Image.** `public/screenshots/dashboard-v4.png`, from `~/Desktop/landing page screeshots/Dashboard 11in.png`
(2420x1668 = 1.4508, iPad Pro 11-inch), downscaled to **800x551**. Supersedes `dashboard-v3.png`
(13-inch, 4:3), which is **retired to the session scratchpad, not deleted**; both Desktop originals untouched.

**BEFORE / AFTER — `app/landing/page.tsx` line 155:**

```
-  <Image src="/screenshots/dashboard-v3.png" ... width={400} height={300} ... />
+  <Image src="/screenshots/dashboard-v4.png" ... width={800} height={551} ... />
```

**BEFORE / AFTER — `app/landing/landing.css` line 207:**

```
-  .hg-landing .shot-dash { width: min(72%,400px); aspect-ratio: 4/3;      left: 50%; ... }
+  .hg-landing .shot-dash { width: min(72%,400px); aspect-ratio: 800/551;  left: 50%; ... }
```

🔴 **The 4:3 dashboard frame is GONE, by your explicit decision.** An 11-inch capture is 1.4519,
not 4:3; keeping 4:3 would have letterboxed ~12px top and bottom, and cropping was ruled out.
**CSS, next/image and the file are now all exactly 1.451906, so `contain` letterboxes by 0px.**

⚠️ **`.shot-kds` is still `aspect-ratio: 4/3` with a 13-inch capture** — the two tiles are deliberately
different shapes. Reverting means a new kitchen capture at 2420x1668, or going back to `dashboard-v3.png`.
⚠️ **`object-fit: contain` unchanged. Phone placeholder unchanged. Gusto logo `height={233}` unchanged.**
