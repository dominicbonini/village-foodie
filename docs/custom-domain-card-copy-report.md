# The card description

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every string, call site and line quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean. `npx eslint`: no new rule violated.
- **Execution** — the **real component was transpiled and run** at both the pre-edit and post-edit
  source and the card rendered in **five prop states**; the card's address was compared against the
  **wizard's own `address`** across six shapes of `trucks.website`; and the card was **measured in a
  real browser** at 320/390/768px against the app's compiled stylesheet.

**NO DEPLOY. NO MIGRATION. NO SQL.** Pizzeria Gusto untouched.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**
⚠️ **TWO MID-TURN INSTRUCTIONS OVERRODE THE BRIEF'S OWN SCOPE — §4. The new line is much longer than
the one it replaces, which the card's layout feels — §5. And 🔴 THE ADDRESS LINK CANNOT REACH YOUR
LOCAL TEST PAGE, for a reason worth knowing — §4b.**

---

## 1. THE DESCRIPTION

**Before:** `Show where you are trading next, on your own website.`

**After**, supplied verbatim, with the address interpolated:

> **We create a page at `<their address>` showing where you're trading next. Your own website stays
> exactly as it is.**

⚠️ **HELD AS A STRING EXPRESSION, NOT BARE JSX TEXT.** The apostrophe in `you're` is a straight
`U+0027`; as JSX text it is subject to `react/no-unescaped-entities` and to any formatter that decides
to straighten or reflow the line. As `{"…"}` nothing can touch it.

⚠️ **IT USES A CONTRACTION WHERE THE LINE IT REPLACED WROTE "you are"**, and the wizard's copy below it
still writes "you are" throughout. **That is the wording you supplied and it is left as supplied**, but
the card and the wizard now differ in voice by one word.

---

## 2. THE ADDRESS — THREE STATES, RENDERED

| State | `trucks.website` | `custom_domain` | Rendered description |
|---|---|---|---|
| **no website on file** | `null` | `null` | We create a page at **`events.yourtruck.com`** showing where you're trading next. Your own website stays exactly as it is. |
| **a website on file** | `https://www.thaikitchen.co.uk/about` | `null` | We create a page at **`events.thaikitchen.co.uk`** showing… |
| **a live domain** | `https://www.thaikitchen.co.uk` | `events.thaikitchen.co.uk` | We create a page at **`events.thaikitchen.co.uk`** showing… |

**Two more states, because they are the ones that could go wrong:**

| State | Shows | Why |
|---|---|---|
| **live, but `trucks.website` later changed** to `brandnewsite.com` | `events.thaikitchen.co.uk` | 🔴 **the live domain wins.** It is the page that really exists; the derived one is only what we *would* create |
| **no website on file, but already set up** | `events.thaikitchen.co.uk` | same — `custom_domain` is read first |

**The placeholder is `events.yourtruck.com`** — the same one the address screen already shows, so the
card and the wizard show one example, not two.

---

## 3. 🔴 IT NAMES WHAT THE WIZARD WOULD CREATE, PROVEN — AND THERE IS NO SECOND NORMALISATION

```tsx
const cardAddress = props.customDomain ?? (fixedDomain ? `${PREFIX}.${fixedDomain}` : null)
```

`fixedDomain` is **the variable already holding `domainFromWebsite(props.website)`** — the one
normaliser this feature has. **Reused, not called again.**

**`domainFromWebsite` call sites, code only, before and after:**

```
  BEFORE: ['domainFromWebsite(props.website)', 'domainFromWebsite(typedDomain)']
  AFTER : ['domainFromWebsite(props.website)', 'domainFromWebsite(typedDomain)']
  ✅ IDENTICAL
```

⚠️ **A first pass of that check reported a third occurrence and it was wrong** — the third is inside a
**comment** naming the variable. Counting code lines only, the call sites are unchanged. `domainOf`,
`toLowerCase`, `parentOf` and any hand-rolled scheme strip are all unchanged at their existing counts.

**And the card's address equals the wizard's `address`, executed across six shapes of website:**

```
  trucks.website                          card says                  wizard's `address`
  https://www.thaikitchen.co.uk           events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  https://thaikitchen.co.uk/menu          events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  www.thaikitchen.co.uk                   events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  http://shop.thaikitchen.co.uk/x?y=1     events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  thaikitchen.co.uk                       events.thaikitchen.co.uk   events.thaikitchen.co.uk   ✅
  https://www.bbc.co.uk                   events.bbc.co.uk           events.bbc.co.uk           ✅
```

### ⚠️ DELIBERATELY NOT THE WIZARD'S `address` VARIABLE, THOUGH IT IS THE SAME VALUE

`address` folds in `typedDomain` — **state the operator edits inside the modal.** Reading it on the
card would make the card behind the overlay narrate whatever they were part-way through typing, and
**keep it after they closed without saving**. A card that says *"We create a page at X"* must not name
an X nobody asked for. **`cardAddress` is derived from props only. Props do not move; state does.**

---

## 4. ⚠️ THE MID-TURN INSTRUCTIONS, AND WHAT THEY COST

Both arrived after the brief and both land **inside the confirm block, which this brief's scope line
explicitly protected.** I have treated them as overrides rather than contradictions.

### 4a. The reassurance is gone

*"This changes nothing on your page. It just tells us a person has looked."* — removed from
`CONFIRM_COPY`, from the render, and from the checker's corpus, with the reason recorded at each site.

🔴 **STATED PLAINLY: IT WAS THE ONLY PLACE THAT SAID PRESSING THE BUTTON CHANGES NOTHING.** An operator
hesitating over what *"Yes, it looks right"* will do to their live page now has nothing on screen
answering it. **The fact is unchanged** — `domain_confirm` writes one timestamp and touches nothing the
page renders — **it is simply no longer said.**

### 4b. Step one IS the address, and the separate link is gone

*"Open your address and let the page load."* named nothing and could not be clicked, which is why a
**second copy of the address** had to sit above the list purely to be clickable. Now there is **one
address, in the place the instruction actually is:**

```
Have a look, then tell us it is right
 1. Open events.testtruck.test          ← the link
 2. Check the dates and times look right.
Yes, it looks right
Something not right? Email hello@hatchgrab.com and tell us what you are seeing.
```

**Verified in the rendered markup: exactly ONE http link in the block**, inside step 1,
`events.testtruck.test → https://events.testtruck.test`, `target="_blank"`. **The standalone link above
the list is gone.**

⚠️ **NO FULL STOP AFTER STEP ONE.** A trailing dot immediately after a web address reads as part of the
address, and this one is a link an operator may copy.

⚠️ **THE NUMBERING IS `i + 2`** because step 1 is rendered above the loop rather than in it — a third
step added to `checklist` numbers itself 3 correctly.

### 🔴 THE LINK CANNOT REACH YOUR LOCAL TEST PAGE, AND THAT IS CORRECT BEHAVIOUR

You asked me to make sure the address can be opened. **It can — in production.** Tested as rendered:

```
  https://events.testtruck.test        → no response (nothing listens on 443)
  http://events.testtruck.test:3000/   → 200
```

The href is `https://<host>` with no port, which is **right for a real operator domain and wrong for a
dev server on :3000 over http.** For the local check, use `http://events.testtruck.test:3000/`
directly.

⚠️ **I did not add scheme/port detection**, and that is a decision rather than an omission. Mirroring
the current origin would work, but reading `window.location` during render is a **hydration mismatch**,
so it needs `useEffect` machinery — dev-only complexity inside a live operator surface. **Say the word
if you want it; it is about six lines.**

## 5. ⚠️ THE NEW LINE IS TWICE THE LENGTH, AND THE CARD FEELS IT

**9 words → 20.** Measured in a browser, in the card's existing flex row where the button and badge
take the right-hand side:

| Width | Description column | Lines |
|---|---|---|
| **320px** | 95px | **9** |
| **390px** | 165px | **6** |
| 768px | 535px | 2 |

**No overflow at any width**, and this is the card's existing layout rather than anything the change
introduced — the heading already ran to 4 lines at 320px. **But six lines of description on a normal
phone is a lot**, and it is the direct cost of naming the address. **Recorded so it is a decision
rather than a surprise.**

---

## 6. WHAT IS UNCHANGED

| | |
|---|---|
| **The heading** | ✅ **BYTE-IDENTICAL** |
| **The card button** — handler and all three labels | ✅ **BYTE-IDENTICAL** |
| **The Live badge** | ✅ **BYTE-IDENTICAL** |
| **The confirm button and its handler** | ✅ **BYTE-IDENTICAL** — `domain_confirm` called once |
| **The mailto** | ✅ **BYTE-IDENTICAL** |
| The address link | **moved into step 1** — §4b |
| 🔴 **THE ENTIRE WIZARD** — every step, from `{open && overlay(` to the end of file | ✅ **BYTE-IDENTICAL, 22,043 chars** |
| The `overlay` helper | ✅ **BYTE-IDENTICAL** |
| `app/manage/[token]/page.tsx`, `lib/custom-domain/dns.ts`, `apex.ts`, `app/api/manage/route.ts` | ✅ **not opened** |

⚠️ **A first pass reported the wizard as differing and that was a measurement artefact** — the slice
started at the `overlay` helper and so spanned the card as well. Sliced at the modal itself, it is
untouched.

**Three files changed:** `components/dashboard/CustomDomainSetup.tsx`, `lib/custom-domain/copy.ts`,
`scripts/check-plain-english.mjs`.

**Plain-English checker: `96/97 pass`**, the one being the pre-existing `QR: print or display`. **Two
corpus entries** for the description — the placeholder form and the real form, because the address is
interpolated and an operator reads one or the other. Both PASS, and the exclusion is printed as §35
requires:

```
  card description         "events.yourtruck.com"      an example web address is the concrete thing a screen exists to show
  card description, live   "events.thaikitchen.co.uk"  …
```

---

## 7. WHAT REMAINS UNOBSERVED

1. 🔴 **NOT SEEN ON THE REAL SETTINGS TAB.** The card was rendered from props and measured against the
   app's compiled stylesheet in hand-built markup. **The surrounding page was not there**, so how six
   lines of description sit against the cards above and below it is unobserved.
2. ⚠️ **The apostrophe in `you're` is straight (`U+0027`)** where the landing page uses typographic
   ones. It is what you supplied; if the rest of the operator surface should match, that is a
   one-character change.
3. 🔴 **The removed reassurance has no replacement.** §4a.
4. 🔴 **THE LINK WAS NOT CLICKED.** Its href was read from the markup and both URLs were probed with
   `curl` — **no browser followed it**, and whether a real operator domain serves on 443 is the
   production question this local rig cannot answer. §4b.
5. ⚠️ **The placeholder state was rendered from props, not reached by a real truck** — it needs a truck
   with `trucks.website` empty, and the one on the test row has a website.
6. **The description says "We create a page at X" in the present tense even before setup has started.**
   For a truck with a website on file but nothing provisioned, it names an address that does not exist
   yet. That reads as a promise rather than a description, and it is the supplied wording.
