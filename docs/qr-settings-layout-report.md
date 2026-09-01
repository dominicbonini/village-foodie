# The Order QR code card — layout and two copy fixes

**WHICH OF THE THREE I PERFORMED: A TYPECHECK AND TWO EXECUTIONS.** No standalone parse — `npx tsc
--noEmit` subsumes it and **exits 0**. One harness lifts the card's own JSX and renders it: **14/14**.
The **committed** plain-English checker ran over 20 strings: **19/20 pass, 1 known violation**. Five
further checks in §6 are labelled **PARSE**.

🔴 **Nothing was deployed, no migration was written, and the encoded URL is byte-identical.** Pizzeria
Gusto is untouched.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.** Item 3
carried a stop condition — *"if that state is not available in this component, SAY SO"* — and **it did
not fire: the state is available.** §3.

**One file modified: `app/manage/[token]/page.tsx`.** Plus a corpus update to
`scripts/check-plain-english.mjs`.

---

## 1. LAYOUT

### (a) The two style options, side by side

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
```

🔴 **PATTERN FOLLOWED, NOT INVENTED — and this is the name you asked for: `grid grid-cols-1
sm:grid-cols-2 gap-3`**, the shape the add-event form in this same file already uses
(`app/manage/[token]/page.tsx`, the `#add-event-form` grid). It stacks below `sm` (640px) for the reason
this file records at its own auto-reply input row: *"at 375px an inline button would leave the input
around 200px and shrinking further with any longer label."* The branded option carries a second line and
a logo preview, so two columns at phone width would be worse than stacking.

Both buttons gained `h-full` so unequal content does not leave one card short in its column.

**Why:** stacked full-width they read as independent switches an operator might turn on individually.
Abreast, the choice is visible as a choice.

### (b) Generate QR code, right-aligned and sized to its text

```tsx
<div className="flex justify-end">
  <button … className="bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm …">
```

`w-full … py-3` → `px-5 py-2.5` inside a right-aligning wrapper. **A full-width primary bar read as the
main action of the whole Settings tab rather than of one card among eight.**

### (c) The URL row and its Copy control

**Untouched.** Proved in §6.

---

## 2. THE "NO LOGO" BADGE → AN INSTRUCTION

**Removed:**

```tsx
<span className="text-[10px] text-amber-600 bg-amber-50 border … shrink-0">No logo</span>
```

**Replaced with**, inside the option's own text block rather than as a badge beside it:

> **Add a logo further up this page and it will show here.**

🔴 **A BADGE IS FOR A STATE YOU CAN READ PAST; THIS IS ONE THEY HAVE TO ACT ON.** It told an operator who
had just chosen *Branded — your logo shown in the middle* that the logo is missing, and stopped there:
no cause, no next step. The new line names the action and where to do it — the **Logo** card sits higher
up this same tab, so *"further up this page"* is literally true rather than a hand-wave.

⚠️ **BEHAVIOUR IS UNCHANGED.** Selecting branded without a logo does exactly what it did before; only
what the operator is told has changed, as instructed.

**Where a logo IS present: nothing is shown**, and the existing logo preview thumbnail still renders.
Both constructed and proved in §4.

---

## 3. THE FIRST LINE — PRESENT TENSE, PER TRUCK

### The stop condition did not fire

The brief said to report and stop if the domain state were not available in this component. **It is.**
`SettingsTab` receives `truck`, and the page's local `Truck` interface already declared
`custom_domain`, `custom_domain_verified_at` and `custom_domain_confirmed_at`. **No fetch was added and
no new source introduced.**

⚠️ **ONE FIELD WAS MISSING FROM THE TYPE AND I ADDED IT: `custom_domain_last_ok_at`.** This is a
**type-only** change — `/api/manage` GET returns `truck: { ...truck, logo }` over a `select('*')`, so the
column was already arriving and simply was not declared. Flagged because it is one line outside the card
itself. **Without it the copy could not test the same thing the redirect tests** — see below.

### What it now says

| State | Copy |
|---|---|
| No domain, or not yet live | *"This QR code sends customers to your HatchGrab ordering page. If you set up your own web address later, the same QR code will send them there instead — you will not need to print a new one."* |
| Live and confirmed | *"This QR code now sends customers to `schedule.pizzacompany.com`. You never need to print a new one."* |

🔴 **THE FIVE CONDITIONS MIRROR `app/trucks/[slug]/order/layout.tsx` EXACTLY** — domain set, verified,
confirmed by a person, plan still granting it, and the last check within `STOPPED_AFTER_MS`. Anything
looser and the card would promise an address the redirect has already stopped using.

```tsx
const domainLive = !!truck.custom_domain
  && !!truck.custom_domain_verified_at
  && !!truck.custom_domain_confirmed_at
  && can('embed_schedule')
  && !!lastOk && Date.now() - lastOk <= STOPPED_AFTER_MS
```

`STOPPED_AFTER_MS` is **imported** from `lib/custom-domain/cadence`, not restated — the one term most
likely to drift is now the one that cannot.

### ⚠️ AND THE DUPLICATION IS DEBT, RECORDED RATHER THAN HIDDEN

**Those five conditions now exist in two files.** `layout.tsx` decides where a scan actually goes; this
card decides what the operator is told. 🔴 **If they drift we tell a truck their code points at their
own address while the redirect quietly serves ours — the worst kind of disagreement, because nothing
errors.** The right fix is **one shared predicate both call**, and it was **out of scope here** — this
brief forbids touching anything outside the card, and `layout.tsx` is outside it. **Extract it next.**
The comment at the code says so too, so the next reader finds it without this report.

---

## 4. VERIFICATION — the card rendered, both states

The harness **lifts the card's own JSX out of the 2,242-line component** and renders it with the same
locals in scope, so what is rendered is the shipping source character for character.

### A. No custom domain

```
   Order QR code
   This QR code sends customers to your HatchGrab ordering page. If you set up your own web address
   later, the same QR code will send them there instead — you will not need to print a new one.
   Print or display this code so customers can scan and pre-order. Place it at your hatch, on your
   van, or share it online.
   https://www.hatchgrab.com/trucks/rtf/order
   Copy
   QR code style
   Standard QR code
   Branded QR code
   Your logo shown in the middle of the QR code
   Generate QR code
```

### B. Live, confirmed custom domain

```
   Order QR code
   This QR code now sends customers to schedule.pizzacompany.com. You never need to print a new one.
   Print or display this code so customers can scan and pre-order. Place it at your hatch, on your
   van, or share it online.
   https://www.hatchgrab.com/trucks/rtf/order
   Copy
   QR code style
   Standard QR code
   Branded QR code
   Your logo shown in the middle of the QR code
   Generate QR code
```

🔴 **Note what does NOT change between A and B: the URL row.** It reads
`https://www.hatchgrab.com/trucks/rtf/order` in both — which is the whole point of the feature and is
now visible on screen.

### C. The no-logo line

```
  logo present : nothing shown ✅
  logo absent  : "Add a logo further up this page and it will show here." ✅
```

### The assertions

```
  PASS  A says it sends to the HatchGrab ordering page
  PASS  A promises no reprint if they set one up later
  PASS  🔴 B states the PRESENT: it now sends to their address
  PASS  🔴 B does NOT contain the old future-tense promise (neither state does)
  PASS  B says they never need to reprint
  PASS  🔴 with a logo, NOTHING is shown
  PASS  🔴 without a logo, the instruction is shown
  PASS  🔴 the old "No logo" badge is gone in both
  PASS  with a logo the preview img still renders
  PASS  🔴 the two options are in a responsive 2-col grid
  PASS  🔴 Generate is right-aligned and sized to its text
  PASS  🔴 the branded plan gate is unchanged (FeatureGate on the disabled branch)
  PASS  …and the gated branch shows no radio action
  PASS  the URL row and Copy control are untouched

  14/14 pass
```

---

## 5. THE PLAIN-ENGLISH CHECKER — the committed one

✅ **Used the committed script**, `scripts/check-plain-english.mjs`, written in the previous workstream.
Its corpus gained the six QR-card strings. **19/20 pass, 1 known violation.**

🔴 **IT CAUGHT TWO, AND ONLY ONE WAS MINE.**

1. **Mine:** my first draft read *"the same **code** will send them there instead"* — `code` is banned.
   **Fixed** to *"the same QR code"*.
2. **Pre-existing, and NOT MINE TO FIX HERE:** *"Print or display this **code** so customers can scan"*
   — copy that predates this brief, which scoped changes to two lines and this was not one of them.

⚠️ **I ADDED A `KNOWN` CHANNEL RATHER THAN AN EXCLUSION, AND THE DISTINCTION IS THE POINT.** An
exclusion says *"the rule does not apply here"*; this says *"the rule applies, we are breaking it, and
here is why it is not fixed yet."* It prints in its own section on every run with its reason, so it
cannot quietly become permanent — but it does not fail the exit code, **because a check that is always
red is a check everybody learns to ignore.**

```
  🔴 KNOWN VIOLATIONS — the rule applies and is being broken. Fix and delete the entry:
    QR: print or display     pre-existing copy; the 28 August brief scoped changes to two lines…
```

**Your call whether to fix that line.** It is a one-word change (`this code` → `this QR code`) and I did
not make it because it was outside the stated scope.

---

## 6. SCOPE PROOFS (PARSE)

**6.1 🔴 THE ENCODED URL IS BYTE-IDENTICAL.**

```
  before: 'const orderUrl = truck.slug\n    ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`\n    : null'
  after : 'const orderUrl = truck.slug\n    ? `${process.env.NEXT_PUBLIC_HATCHGRAB_URL}/trucks/${truck.slug}/order`\n    : null'
  IDENTICAL
```

The dashboard's separate construction is untouched, and the expression **names no `custom_domain` term**
— it is a pure function of the slug, for a truck with a domain and one without alike. Both rendered
states in §4 show the same URL on screen.

**6.2 QR generation is untouched.** `handleGenerateQR` extracted from both versions: **IDENTICAL, 25
lines** — including the `generateQRCodePNG` call, the `logoUrl` argument and the branded-vs-standard
decision.

**6.3 The branded plan gate is unchanged.** Rendering with `can('branded_qr_code') === false` still
produces the disabled branch with `opacity-50 cursor-not-allowed` and a rendered `FeatureGate`, and no
selection action.

**6.4 Eight changed regions, ALL INSIDE THE CARD.**

```
  SettingsTab: 2196 -> 2242 lines, 8 changed region(s)
    replace  the first line, now conditional
    insert   the responsive grid opening
    replace  standard option → h-full
    replace  branded option  → h-full
    insert   the no-logo instruction
    delete   the "No logo" badge
    insert   the grid closing tag
    replace  the Generate button, right-aligned

  unchanged lines carried through identically: True (2174 lines)
  the QR card spans old lines 1030-1153; changed regions OUTSIDE it: 0
```

🔴 **Zero changed regions outside the QR card**, and all 2,174 unchanged lines carried through
byte-identically. Every other section's occurrence count is unchanged: Accepting orders, Taking payment,
Opening and closing, Display settings, Kitchen capacity, the danger zone and Auto-replies.

**6.5 One line outside the card:** `custom_domain_last_ok_at` added to the `Truck` interface (§3). Type
only; no query, endpoint or fetch changed.

---

## 7. WHAT REMAINS UNVERIFIED

1. 🔴 **NOTHING WAS RENDERED IN A BROWSER.** `renderToStaticMarkup` gives text and markup, **not
   layout**. **Whether the two options actually sit half-width and abreast above 640px, and whether they
   stack cleanly below it, is UNOBSERVED** — the grid classes are an intent, matched to a pattern used
   elsewhere in the file, not a measurement. The same applies to the right-aligned button.
2. **The card was lifted and rendered in isolation**, not as part of the real `SettingsTab`. Its
   surrounding locals were supplied by the harness. What is proven is the card's own JSX and its
   conditionals, not its behaviour inside the live page.
3. **No interaction was simulated.** Selecting a style, generating a code and copying the URL were not
   exercised; §6.2 shows only that their code is unchanged.
4. **The `domainLive` predicate was proved by rendering seeded states**, not against a real truck row.
   ⚠️ **And it is a SECOND copy of the redirect's conditions** — if `layout.tsx` changes and this does
   not, no test here would catch it. That is the debt recorded in §3.
5. **The checker's banned-word list is a reading of §35.** A word the rule would catch but the list
   omits will pass.
6. **`next build` was not run.** `tsc --noEmit` is a typecheck, not a build.
7. **Six migrations remain unapplied**, and this work needed none.
