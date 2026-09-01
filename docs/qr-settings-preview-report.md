# QR previews in the option cards, one button, and the plan gate

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND TWO EXECUTIONS.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. One harness lifts the card's own JSX and the real `QrPreview` and
renders them: **26/26**. The committed checker ran over 25 strings: **26/27 pass, 1 known violation**.
Six further checks in §7 are labelled **PARSE**.

🔴 **Nothing was deployed, no migration was written and the encoded URL is byte-identical.**
⚠️ **`lib/generateQRCode.ts` WAS opened** — the original brief said not to change the generator, and a
later instruction asked for the placeholder to be exactly logo-sized *"apply DRY if necessary"*. It now
EXPORTS its geometry and reads its own constants; **no drawing behaviour changed and no value moved**.
Called out because it crosses the earlier line. Pizzeria Gusto is untouched.

---

## 0. ⚠️ FLAG — ONE OF THE TWO NAMED REPORTS DOES NOT EXIST

The brief opens *"Read docs/qr-settings-layout-report.md and docs/qr-settings-row-report.md first."*

🔴 **`docs/qr-settings-row-report.md` DOES NOT EXIST.** No report with "row" in its name relates to the
QR card (`docs/customer-quantity-row-report.md` is unrelated); the QR-related reports on disk are
`qr-settings-layout-report.md`, `embed-removal-qr-report.md` and `logo-cuisine-qr-report.md`.

**I did not stop, and here is why that was safe:** I verified the card's current state matches
`qr-settings-layout-report.md` exactly — the responsive grid, the reworded first line, the "add a logo"
line and the right-aligned button are all present, the struck "No logo" badge is absent, and the file's
mtime predates this session. **Nothing in this brief depended on content only the missing report could
supply.** If it described something I have not accounted for, say so and I will revisit.

⚠️ **One thing I did read that bears on item 1:** `docs/logo-cuisine-qr-report.md` records that **the
dashboard and Manage disagree about the logo** — the dashboard passes the *resolved* logo (with a
discovery fallback), Manage reads `logo_storage_path` only. **The previews follow Manage's existing
rule**, so a truck like `tikka-tonic` sees an unbranded branded-preview here and its downloaded code
matches. Consistent within this card; the cross-surface disagreement is pre-existing and untouched.

---

## 1. A PREVIEW INSIDE EACH OPTION CARD

A new `QrPreview` primitive renders a 64px-square thumbnail in each option card.

🔴 **IT IS A `<span role="button">`, NOT A BUTTON.** It lives inside the `<button>` that selects the
style, and a nested button is invalid HTML that browsers resolve unpredictably. It carries
`stopPropagation` and `preventDefault`, **so enlarging never silently changes the operator's saved
style** — and `onKeyDown` for Enter/Space so it is reachable without a mouse.

⚠️ **No button was added inside either card**, as instructed — proved by comparing the `<button>` count
with and without previews rendered.

### 🔴 WHERE THERE IS NO LOGO — THE RESERVED CENTRE, LABELLED (mid-turn request)

A truck with no logo would otherwise see **two identical previews** and no way to tell what "branded"
buys them: the option promises a logo in the middle and the picture shows an empty middle. The branded
preview now paints the space a logo *would* occupy — a dashed box with **"Your logo here"** — so the
difference between the two options is **visible rather than described**. The "add your logo" line stays;
the preview shows the state, the line says what to do about it.

🔴 **THE BOX IS EXACTLY LOGO-SIZED, AND THE SIZE IS IMPORTED RATHER THAN EYEBALLED.** A placeholder of
the wrong size is a lie about the product — it shows the operator a hole of the wrong shape in the
middle of their own code. So `lib/generateQRCode.ts` now **exports its geometry** and the preview reads
it:

```ts
export const QR_POSTER = { qrX: 50, qrY: 30, qrSize: 400, stripHeight: 72,
  canvasWidth: 500, canvasHeight: 502, logoSize: 116, logoPadding: 6, logoRadius: 8 } as const

export function posterLogoRect() { … }   // → { x: 186, y: 166, size: 128, radius: 8 }
```

⚠️ **DRY BOTH WAYS — the generator now READS those constants instead of restating its own literals**, so
the two cannot drift. **The values are unchanged and the poster's output is byte-for-byte what it was**;
this names them, it does not move a pixel. The rect is `logoSize + 2 × logoPadding = 116 + 12 = 128`,
i.e. the logo's white backing — the actual visible hole in the pattern, which is the thing to match.

**EXECUTION — both sides run, and the numbers agree:**

```
  generator: posterLogoRect() = {"x":186,"y":166,"size":128}  on 500x502

  128px preview → box 32.8 x 32.6 at (47.6, 42.3)
  expected from the shared rect: 32.8 x 32.6 at (47.6, 42.3)      ← identical
  at full poster size → box 128 x 128 at (186, 166)               ← 1:1 with the logo

  PASS  🔴 the box is EXACTLY the mapped logo rect
  PASS  …mapped through BOTH axes (the poster is 502 tall, not 500 — a square map would skew it)
  PASS  🔴 it sits at the QR PATTERN's centre, not the poster's
  PASS  🔴 at poster scale the box IS the logo rect, 1:1
  PASS  🔴 the generator READS QR_POSTER rather than restating the literals
  PASS  🔴 the poster output is unchanged — same numbers, now named
```

🔴 **THAT THIRD ONE IS THE BUG AN EYEBALLED BOX WOULD HAVE HAD.** The logo is centred on the **QR
pattern** (y = 230 of 502), not on the poster, which is taller because of the branding strip. A
placeholder centred on the canvas would sit ~5px low at preview scale and be visibly wrong beside a real
branded code. Importing the rect gets this right for free.

### 🔴 THE ENLARGED VIEW MATCHES THE PREVIEW (ruled on, 28 August)

An earlier pass drew the placeholder on the **preview only**, and I flagged it for a decision: clicking
a branded preview on a truck with no logo opened a code **without** the box. **That was wrong and the
ruling is that they must match** — a page that shows one picture and then a different one when you click
it is contradicting itself, and the operator has no way to tell which is true.

**Both now go through ONE compositor**, so they cannot drift apart again:

```ts
const compose = (dataUrl, w, h, placeholder) => …          // w/h null = natural size
const downscale = (dataUrl, placeholder = false) => compose(dataUrl, PREVIEW_PX, PREVIEW_PX, placeholder)
```

**EXECUTION — the same drawing, at two scales:**

```
  preview  (128x128) box: 32.8 x 32.6 at (47.6, 42.3)
  enlarged (500x502) box: 128  x 128  at (186, 166)

  as a fraction of canvas — preview  : 0.3720, 0.3307, 0.2560, 0.2550
                            enlarged : 0.3720, 0.3307, 0.2560, 0.2550     ← identical

  PASS  🔴 THE TWO MATCH — identical position and size as a fraction of the canvas
  PASS  🔴 the enlarged view draws it 1:1 with the real logo rect
  PASS  both draw the words · both are dashed
  PASS  with a logo present, NEITHER draws a placeholder
```

⚠️ **AND THE WORDS ARE LEGIBLE IN THE ENLARGED VIEW, WHICH IS WHERE THIS ARGUMENT LANDS.** At 500px the
box is 128px and the text ~22px. The preview's job is to show the *shape* of the difference; the
enlarged view is where it can be read.

### ⚠️ THE ONE REMAINING DIFFERENCE — DELIBERATE, AND NOW UNSTATED

🔴 **THE DOWNLOADED FILE HAS NO BOX ON IT.** Nobody may be handed a PNG with "Your logo here" printed on
their hatch board — the placeholder is an instruction to the operator, not part of their code. So the
modal shows the composited copy and downloads the clean one:

```tsx
<img src={qrModal.displayUrl ?? qrModal.dataUrl} … />     // the box
<a href={qrModal.dataUrl} download=…>                     // no box
```

`full` is never composited; the placeholder goes onto a **copy**.

⛔ **A LINE EXPLAINING THAT DIFFERENCE STOOD HERE AND WAS REMOVED ON REQUEST, 28 August 2026.** It read:
*"The dotted square shows where your logo will sit… The file you download will not have the dotted
square on it."*

⚠️ **THE DIFFERENCE ITSELF IS UNCHANGED — ONLY THE DISCLOSURE IS GONE.** An operator with no logo now
sees a code with a dotted square, downloads one without it, and meets that difference **when they open
the file rather than before**. Recorded plainly because it is the kind of gap that reads as a bug to
whoever hits it, and because the code comment at the site is the only remaining trace.

✅ **`showsPlaceholder` IS DELIBERATELY KEPT ON THE MODAL STATE.** Nothing reads it now, which would
normally make it dead — it is retained so that **restoring a line, or blocking the download in that one
state, is a one-line change** rather than re-deriving which case is which. Say the word for either.

### 🔴 THE POSTER'S BRANDING ROW — THE WORDS, NOT THE MARK (28 August)

The generated poster drew the **HatchGrab logo image** bottom-right, with the text *"Powered by
HatchGrab"* only as a fallback when that file failed to load. **The text is now the only path.**

**Why it is the better artefact, not just the requested one:** on a printed board beside the operator's
own name, a second logo reads as **co-branding** — two businesses on one sign — where the words read as
an attribution, which is what it is. Their name is the brand on their board.

✅ **AND IT REMOVES A FAILURE MODE RATHER THAN ADDING ONE.** The image path fetched a PNG through a blob
URL at draw time; when that silently failed the poster fell back to this text anyway. **One path that
always works replaces two paths where the better-looking one could vanish without notice** — and the
manual already records a live instance of exactly that (the `/logos/hatchgrab.png` asset that never
existed, so the fallback was what shipped).

**EXECUTION — the real generator, run against a recording canvas:**

```
  no truck logo       text: ["Real Thai Food", "Powered by HatchGrab"]   drawImage x1  (the QR only)
  with a truck logo   text: ["Real Thai Food", "Powered by HatchGrab"]   drawImage x2  (QR + their logo)

  PASS  "Powered by HatchGrab" is drawn as TEXT, in both cases
  PASS  the truck's own name is still drawn
  PASS  exactly the expected image count — no HatchGrab mark
  PASS  🔴 the hatchgrabLogoUrl option is gone from the module and its only call site
  PASS  the now-orphaned brand import was removed
  PASS  loadImageViaBlobUrl survives for the TRUCK logo
  PASS  the geometry constants are untouched by this change
```

⚠️ **THIS ONE CHANGES THE PRINTED ARTEFACT, UNLIKE THE DRY PASS ABOVE.** The geometry export moved no
pixel; this moves one. A code downloaded before today has a logo bottom-right and one downloaded after
has the words — **both scan identically**, since the branding row is outside the QR pattern, but the
posters are not interchangeable to look at. Flagged because it is a real difference on paper.

⚠️ **The option was REMOVED, not left unused.** `hatchgrabLogoUrl` is gone from `QRCodeOptions`, from
the destructure and from the call site, and the manage page's now-orphaned `HATCHGRAB_LOGO_PNG` import
went with it. `lib/brand.ts` still exports it — the email templates use it and are untouched.

---

## 2. LAZY, AND WHERE IT CACHES

🔴 **AN `IntersectionObserver` ON THE STYLE SELECTOR, WITH `rootMargin: '200px'`.** The Settings tab is
long and this card sits near the bottom, so on most visits the two composites **never run at all**.

**What was chosen, precisely:**

| | |
|---|---|
| **Trigger** | `IntersectionObserver` on the grid wrapper (`qrSelectorRef`), not a mount effect |
| **Runs once** | `io.disconnect()` on first intersection, plus a `useRef` guard (`qrPreviewsRequested`) — a ref, not state, so two intersections in one frame cannot both see an empty cache and both generate |
| **Cache** | `qrPreviews` component state, `{ standard?, branded? }`, written once per mount |
| **Reuse** | The render reads that object; nothing regenerates per render |

```
  with an empty cache: preview <img> tags = 0, placeholders = 2
  PASS  🔴 with an empty cache NO preview image is in the DOM
  PASS  …a quiet placeholder renders instead
```

⚠️ **A placeholder, not a spinner.** This is a preview nobody is waiting for; a spinner on a card the
operator has not interacted with invents urgency that is not there.

---

## 3. THE PREVIEW ENLARGES ON CLICK

Clicking either preview calls `openQrView(style)`, which builds the full-size code and opens the modal.
**No button, no label** — `cursor-zoom-in` and a title attribute, nothing more.

---

## 4. ONE BUTTON, RENAMED

**"Generate QR code" → "View QR code".** It opens the enlarged view for the **selected** style, and the
download lives in there.

🔴 **THE OLD NAME DESCRIBED SOMETHING THAT NO LONGER HAPPENS.** "Generate" was true when the code did
not exist until you pressed it. The operator now sees both codes in the cards above, so there is nothing
to generate — the button reveals the big one.

⚠️ **It routes through the SAME `openQrView` as a preview click.** The selected style can be `branded`
on a truck that has since dropped below the plan, and that case is refused by the same call. **One gate,
two doors.**

**The dead flow was removed cleanly:** `handleGenerateQR` (25 lines), the `qrDataUrl` state, both
`setQrDataUrl(null)` calls, and the inline large-image / Download / Regenerate block. `grep` for either
name now returns **0**.

---

## 5. 🔴 THE PLAN GATE, AND WHAT A PREVIEW MUST NOT LEAK

### The existing mechanism, followed

`can('branded_qr_code')` — the same call the option card and the old `handleGenerateQR` already used,
with `FeatureGate` for the upgrade prompt. **No second mechanism, no new predicate.**

### The pixel size, and what it is and is not

**The in-card preview is 128×128 actual pixels, displayed at 64 CSS px.**

🔴 **THE SIZE IS A SECURITY DECISION, NOT A LAYOUT ONE.** The generator emits **500×502**. Rendering
that at 64 CSS pixels would put the **full-resolution** image in the DOM, where "save image as" retrieves
it at printable quality — so a truck below the plan could see, save and print the branded code the plan
gates. **So the preview is re-drawn onto a 128×128 canvas and that copy is what reaches the page.**
Saving it yields 128px, which prints as a blurred square at any usable size.

⚠️ **IT IS A DETERRENT, NOT THE CONTROL, AND I WILL NOT OVERSTATE IT.** 128px is legible on screen and a
determined person could photograph it. **The control is that the enlarged view and the download are
refused** — this only removes the easy route.

### The refusal — the absence of the artefact, not a hidden button

```ts
  const openQrView = async (style) => {
    if (style === 'branded' && !can('branded_qr_code')) {
      setQrModal({ style, dataUrl: null, locked: true })
      return
    }
    …
```

🔴 **WHEN IT REFUSES, NO FULL-SIZE IMAGE IS EVER BUILT.** The locked branch of the modal, quoted in full
from source, contains **no `<img>`, no `download=`, and no data URL** — only the explanation and the
existing `FeatureGate`. There is nothing in the DOM to save.

### EXECUTION — the gate bites

```
  branded preview shown : YES ✅     (with their own logo — that is the point)
  upgrade gate shown    : YES ✅
  any download in card  : none ✅

  PASS  🔴 below plan the branded preview IS shown, with their logo
  PASS  …marked locked in the tooltip
  PASS  🔴 no download anywhere in the card
  PASS  the option is not selectable
  PASS  🔴 openQrView refuses branded below plan BEFORE building anything
  PASS  …and the single button routes through the SAME openQrView
  PASS  🔴 the LOCKED modal contains no download at all
  PASS  …and explains the lock instead of showing the code
```

**Both routes the interface offers — the preview click and the button — go through one refusal.**

---

## 6. VERIFICATION SUMMARY

```
  npx tsc --noEmit                                exit 0
  qrprev.cjs      (card JSX + real QrPreview, rendered)      26/26 PASS
  placeholder.cjs (real withLogoPlaceholder + real geometry)  12/12 PASS
  match.cjs       (preview vs enlarged, both composited)      11/11 PASS
  branding.cjs    (real generator, recording canvas)          11/11 PASS
  scripts/check-plain-english.mjs                     25/26 pass, 1 known violation
```

✅ **Both previews render, with and without a logo** — §1.
✅ **Previews are not generated on page load** — §2.
✅ **A below-plan truck sees the branded preview but cannot enlarge or download it** — §5.
✅ **The encoded URL is byte-identical** — §7.1.
✅ **The rest of the Settings tab is unchanged** — §7.2.

### Mid-turn changes, all folded in

| Asked | Done |
|---|---|
| "Add a logo further up this page…" → generic | **"Add your logo to your profile and it will show here."** |
| `pizzacompany.com` placeholder → `yourtruck.com` | 4 occurrences in `CustomDomainSetup.tsx`, 1 in the checker corpus |
| Not "See it bigger" → **"View QR code"** | button label and preview tooltip |
| No logo → show the centre space labelled | **dashed box + "Your logo here"**, preview only — §1 |
| The box must be exactly logo-sized, DRY | **`QR_POSTER` + `posterLogoRect()` exported from the generator; the generator now reads them too** — §1 |
| The enlarged view must match the preview | **one `compose()` serves both; identical fractions** — §1. Download stays clean, and says so |
| Poster shows the HatchGrab logo → show "Powered by HatchGrab" | **text is now the only path; the option removed** — §1 |
| Remove the dotted-square explanation from the view | **removed; the difference it disclosed remains** — §1 |

⚠️ `lib/custom-domain/apex.ts` still says `pizzacompany.com` in **two doc comments** — worked examples
of the normaliser, not a placeholder an operator sees. Left alone; say if you want them changed too.

🔴 **The checker caught one of my own strings again**: the locked explanation read *"Your standard
**code** works exactly the same"* — reworded to *"standard QR code"*.

---

## 7. SCOPE PROOFS (PARSE)

**7.1 The encoded URL is byte-identical.** The `orderUrl` construction is unchanged; `buildQr` passes
`url: orderUrl` and interpolates nothing; the enlarged view displays the same string; the download
filename encodes only the truck name. **Previews, enlarged view and download all encode one URL.**

**7.2 Sixteen changed regions; 2,178 unchanged lines carried through byte-identically.** Twelve are
inside the QR card. ⚠️ **Four are outside it, and all four are QR-specific:** the removed `qrDataUrl`
state, the new preview state block, and the two regions where `handleGenerateQR` was replaced by
`buildQr` / `downscale` / the observer / `openQrView`. **Supporting state and helpers cannot live inside
a JSX card** — they sit in the component body above it. Every other section is untouched: Accepting
orders, Taking payment, Opening and closing, Display settings, Kitchen capacity, the danger zone and
Auto-replies all have identical counts.

**7.3 ⚠️ The generator WAS opened, additively.** `QR_POSTER` and `posterLogoRect()` added; the drawing
code now destructures them instead of restating `50 / 30 / 400 / 72 / 500 / 116 / 6 / 8`. **Every value
is identical**, asserted in the harness, so the poster it produces is unchanged.

**7.4 The plan gate's rules are unchanged** — same `can('branded_qr_code')`, same `FeatureGate`, same
props.

**7.5 No orphans.** `grep -c "qrDataUrl\|handleGenerateQR"` → **0**.

**7.6 No migration, no column touched.**

---

## 8. WHAT REMAINS UNVERIFIED

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER, AND THAT MATTERS MORE HERE THAN USUAL.** This change is
   canvas work. `withLogoPlaceholder` **was** executed against a recording context, so its drawing calls
   are observed — but **`downscale` itself was never executed** — there is no DOM in the harness, so
   `document.createElement('canvas')` and `drawImage` were not run. **That the preview is genuinely
   128×128 is a reading of the code, not a measured image.** So is the claim that it prints badly.
2. 🔴 **The IntersectionObserver was never fired.** Laziness is proved by *reading* the source (observer
   present, disconnect on hit, ref guard) and by rendering with an empty cache. **No scroll happened.**
3. **The modal was rendered from seeded state, not opened by a click.** `openQrView`'s refusal is proved
   by source inspection plus rendering the locked state; the click path was not exercised.
4. **No image was actually saved from the page.** The leak claim rests on what is in the markup.
5. **`generateQRCodePNG` was not run**, so that both previews and the download encode the same URL is
   proved from the call site, not from decoding two PNGs.
6. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
7. **The missing report (§0) may contain something I have not accounted for.**
