# Review order button - matching the app's action colour

Task: the operator "Review order" button is teal; everything else on that screen is orange.
Match it to the app's action colour.

Scope honoured: no `next dev`, no `next build`, no `cap sync`, no deploy, no archive, no commit,
no package installed, no database write, no Stripe call, no environment variable read or changed.
One character changed in one file. Pizzeria Gusto and Tikka Tonic are untouched by anything here -
this is a display-only class swap with no handler, no query and no money path in the diff.

Every claim below is marked **READ** (quoted from the tree) or **INFERRED** (my reasoning on top of
what I read).

---

## A1. The button, quoted

**READ** - [components/dashboard/AddOrderPanel.tsx:2126-2139](components/dashboard/AddOrderPanel.tsx#L2126-L2139),
as it stood before this turn:

```tsx
      {/* ── Phone: sticky bottom bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-3 z-20">
        <div>
          <p className="text-sm font-bold text-slate-900">£{manualTotal.toFixed(2)}</p>
          <p className="text-xs text-slate-400">{totalItemCount} item{totalItemCount !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowOrderSheet(true)}
          disabled={!hasItems}
          className="flex-1 max-w-xs bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 active:scale-95"
        >
          Review order →
        </button>
      </div>
```

Two facts worth carrying forward:

- It is `md:hidden` - **this is the phone/narrow sticky bar only**, not a tablet or desktop control.
- It has **no `hover:` state at all**. It carries `disabled:opacity-40` and `active:scale-95`.

## A2. The customer equivalent, quoted - and NOT changed

**READ** - [app/trucks/[slug]/order/page.tsx:3597-3601](app/trucks/[slug]/order/page.tsx#L3597-L3601):

```tsx
          <button onClick={e => { e.preventDefault(); setFormSheetOpen(true) }}
            disabled={isOrderingBlocked || !hasItems || (!eventLoading && !event)}
            className="w-full bg-orange-600 text-white font-black py-3.5 px-6 rounded-xl text-base hover:bg-orange-700 transition-colors active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
```

Customer and operator are near-duplicate surfaces in separate files, reported separately as required.
The customer button was **already `bg-orange-600`**. So the two surfaces were *inconsistent with each
other* before this change, and the operator side was the odd one out.

---

## A3. The teal sweep - is solid teal a "commit" convention?

Swept `app/dashboard`, `app/manage`, `components/dashboard`, `components/manage`,
`components/printing`, `components/native`.

### What teal is used for, overwhelmingly

**READ** - teal appears on operator surfaces almost entirely as **pale chips, panels, borders, text
and focus rings**, never as a button fill: `bg-teal-50`, `border-teal-200`, `text-teal-600/700/800`,
`focus:ring-teal-400`, and `teal-500` as the canonical toggle-switch ON colour. One example from the
target file itself - [AddOrderPanel.tsx:1314](components/dashboard/AddOrderPanel.tsx#L1314):

```ts
  const SLOT_SELECT_CLASS = '... bg-white focus:outline-none focus:ring-2 focus:ring-teal-400'
```

### Every SOLID `bg-teal-600` fill found on an operator surface - all four

| # | Location | What it is | Container |
|---|---|---|---|
| 1 | [kds/page.tsx:1188](app/dashboard/[token]/kds/page.tsx#L1188) | "Screen on" - the **ON half of a binary state**, grey when off | own toggle |
| 2 | [kds/page.tsx:1263](app/dashboard/[token]/kds/page.tsx#L1263) | "Start Event" button | inside a **teal-bordered banner** |
| 3 | [manage/[token]/page.tsx:9857](app/manage/[token]/page.tsx#L9857) | "Got it" - dismisses an explainer | inside a **teal-bordered panel** |
| 4 | [AddOrderPanel.tsx:2135](components/dashboard/AddOrderPanel.tsx#L2135) | **"Review order"** - the target | plain **white** bar |

**READ** - #1 is explicitly documented as a state, not an action, at
[kds/page.tsx:1184-1185](app/dashboard/[token]/kds/page.tsx#L1184-L1185):

```
        {/* BINARY: teal "Screen on" ONLY when the lock is actually HELD; grey "Screen off" otherwise. Failure
            is a plain-English toast on the tap (screenFailMsg), never a hedged label. */}
```

**READ** - #2 and #3 each sit inside a teal-themed container and match it:

```tsx
        <div className="bg-white border-2 border-teal-500 m-3 rounded-2xl p-5 text-center flex-shrink-0">
          ...
          <button onClick={() => openEvent(activeEvent.id)}
            className="w-full bg-teal-600 text-white font-bold py-3 rounded-xl text-base hover:bg-teal-700 active:scale-[0.98] transition-all">
            Start Event
```

```tsx
                <div className="mt-3 pt-3 border-t border-teal-200">
                  <p className="text-xs text-teal-700"> ... </p>
                  <button onClick={() => setShowAutoPauseInfo(null)}
                    className="mt-3 w-full py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg">
                    Got it
```

### The decisive evidence: this exact question was already settled once

**READ** - [app/manage/[token]/page.tsx:9012-9022](app/manage/[token]/page.tsx#L9012-L9022) - a prior
task removed a solid teal button and recorded why, in a comment that survives above the replacement:

```
                        ⚠️ WAS `bg-teal-600 text-white ... rounded-xl` - a one-off on this page: teal
                        appears elsewhere only as a pale chip/background (`bg-teal-50`), never as a
                        button fill. It now uses the page's OWN small-button class, copied verbatim from
                        the three existing instances of it, so it matches every other inline action
                        beside an input rather than standing out as a different kind of thing. */}
                    <button
                      onClick={saveWhatsappSender}
                      className="flex-shrink-0 text-xs px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700"
                    >
                      Connect
```

A solid teal button was already judged a one-off and converted to `bg-orange-600` /
`hover:bg-orange-700`. One honest qualification: that comment says "never as a button fill" scoped to
*that page*, and #2 above shows solid teal fills do exist elsewhere. I am not overstating it - but the
direction of the recorded decision is unambiguous.

### 🔴 The finding that settles it: the SAME action is orange in this very file

**READ** - [AddOrderPanel.tsx:2023-2027](components/dashboard/AddOrderPanel.tsx#L2023-L2027) - the
operator's own **"Start Event"** button, the same action as teal #2 on the KDS:

```tsx
            <button
              onClick={() => isDemo ? onLockedEventAction?.() : onOpenEvent(manualEvent.id)}
              className={`mt-2 w-full font-bold py-2.5 rounded-xl text-sm transition-all ${isDemo ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-pointer' : 'bg-orange-600 text-white hover:bg-orange-700 active:scale-[0.98]'}`}>
              {isDemo && <span aria-hidden>🔒 </span>}{liveEvent?.status === 'closed' ? 'Restart Event' : 'Start Event'}
```

**INFERRED** - if teal meant "commit/confirm", "Start Event" would be teal in both places. It is teal
on one screen and orange on the other. That is not a convention; it is a drift.

**Fill counts inside the target file alone** - **READ**, `grep -c`: `bg-orange-600` **8**,
`bg-teal-600` **1** (the target).

### A3 verdict

**No "teal = commit" pattern exists, so the STOP condition is not met.** Teal's consistent roles are
(a) informational chips/panels/borders/focus rings, (b) the ON half of a toggle, and (c) a fill that
matches an already-teal container. The Review order button is none of those: it sits on a plain white
bar surrounded by orange controls. Changing it removes an inconsistency rather than creating one.

## A4. Is there a shared component, helper, or token to inherit from?

**Not found. State it plainly: there is no shared button component, no class helper, and no button
colour token.** Buttons in this codebase are hand-written Tailwind class strings, repeated per site.
The only class constant in the target file is `SLOT_SELECT_CLASS` (a `<select>`, not a button).

And [lib/brand.ts](lib/brand.ts) explicitly forbids inheriting from the brand hex - **READ**,
[lib/brand.ts:46-52](lib/brand.ts#L46-L52):

```ts
// ⚠️ CURRENT SCOPE: EMAIL ONLY (lib/email-signup.ts). White text on it measures 2.50:1, below the 4.5:1
// AA floor for normal text - accepted as a deliberate BRAND decision for email, where the button is
// large, short and unmissable. 🔴 THE APP-WIDE BUTTON COLOUR IS A SEPARATE DECISION AND MUST NOT
// INHERIT FROM HERE. The app's orange-600 (#ea580c, 3.56:1) is already a recorded accessibility
// backlog item; adopting a *lower*-contrast value across the product because an email uses it would
// make that backlog worse, not better.
export const HATCHGRAB_ORANGE_HEX = '#EF8B2C'
```

So: no token to use, **and a standing instruction not to invent one from `HATCHGRAB_ORANGE_HEX`**.
The correct move is to copy the Tailwind class already used by the controls beside it. No hex was
written anywhere in this change.

---

## B. The change

### B1-B2. Which orange, and where the class came from

`bg-orange-600` - **copied verbatim from the active category chip on the same screen, 375 lines above
the button**. **READ**, [AddOrderPanel.tsx:1756-1761](components/dashboard/AddOrderPanel.tsx#L1756-L1761):

```tsx
          <button
            key={cat}
            onClick={() => setActiveMenuCat(cat)}
            className={`shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-black uppercase tracking-wide transition-colors active:scale-95 ${
              cat === selectedMenuCat ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
```

The per-item `+` circle uses the pale pair from the same ramp - **READ**,
[AddOrderPanel.tsx:1905](components/dashboard/AddOrderPanel.tsx#L1905):

```
className={`w-8 h-8 rounded-full ... ${atStockLimit ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-orange-100 text-orange-600 act…
```

So the screen's action ramp is orange-100 / orange-600, and the solid action fill is `bg-orange-600`.
**This is Tailwind `orange-600` = `#ea580c`, NOT the brand mark `#EF8B2C`** - the two oranges stay
different, per §38 and per the `lib/brand.ts` comment quoted above.

### 🔴 The destination screen corroborates it

You raised this mid-task: tapping Review order lands on orange buttons. Confirmed, and it is in the
same file. The button opens `showOrderSheet`, whose body is `{submitPanel}` -
**READ**, [AddOrderPanel.tsx:2155](components/dashboard/AddOrderPanel.tsx#L2155) - and that panel's
primary action is **READ**, [AddOrderPanel.tsx:1592-1597](components/dashboard/AddOrderPanel.tsx#L1592-L1597):

```tsx
        <button
          onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = null; void submitManual() }}
          disabled={loading || !hasItems || !manualEvent}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 rounded-xl text-base disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-[0.98]"
        >
          {loading ? 'Confirming...' : !manualEvent ? 'Select an event to confirm' : `Take payment${manualTotal > 0 ? ` £${manualTotal.toFixed(2)}` : ''}`}
```

**INFERRED** - the operator was meeting a teal button and, one tap later, an orange button of the same
shape (`font-semibold`, `rounded-xl`, full-width) doing the next step of the same job. The teal was a
colour change mid-flow with no meaning behind it. After this change the flow is one colour end to end:
orange `+` circles -> orange active chip -> orange **Review order** -> orange **Take payment**.

### B3. The diff

```diff
--- a/components/dashboard/AddOrderPanel.tsx
+++ b/components/dashboard/AddOrderPanel.tsx
@@ -2134,3 +2134,3 @@
           disabled={!hasItems}
-          className="flex-1 max-w-xs bg-teal-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 active:scale-95"
+          className="flex-1 max-w-xs bg-orange-600 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 active:scale-95"
         >
```

One token. `+2` bytes (`teal` -> `orange`).

**Hover and disabled states - the honest answer.** The disabled state is unchanged: `disabled:opacity-40`,
which is opacity-based and colour-agnostic, and matches the customer button's `disabled:opacity-40`
exactly. **There is no hover state to match, before or after.** I deliberately did not add
`hover:bg-orange-700`, for two reasons, both **READ**: the class I copied from (the active category
chip) has no hover on its selected branch, and the button is `md:hidden` - phone-width only, where
hover does not fire. Adding a hover would be introducing a behaviour that never existed on a
touch-only control. Flagging it rather than doing it silently.

### B4. Files in this turn's diff

**Only `components/dashboard/AddOrderPanel.tsx`.** The customer file `app/trucks/[slug]/order/page.tsx`
does appear in `git diff`, but that is the **previous** turn's quantity-row spacing work, already
written up in `docs/customer-quantity-row-report.md`. Proof - **READ**, filtering that file's diff:

```
$ git diff -- "app/trucks/[slug]/order/page.tsx" | grep -E "^[-+].*(bg-teal|bg-orange|Review order)"
NONE
```

No colour line, no button line. This turn added no hunk to it.

### B5. What did NOT change

Size (`flex-1 max-w-xs`, `py-3`, `text-sm`), position (same sticky bar, same slot), the label
("Review order →", arrow included), the handler (`setShowOrderSheet(true)`), the disabled predicate
(`!hasItems`), the press animation (`active:scale-95`), and the totals block beside it. No layout
property was touched.

---

## C1. Contrast - before and after, computed

WCAG 2.1 relative luminance, white foreground:

| | Colour | Ratio |
|---|---|---|
| BEFORE | teal-600 `#0d9488` | **3.74:1** |
| AFTER | orange-600 `#ea580c` | **3.56:1** |
| (brand hex, email only) | `#EF8B2C` | 2.50:1 |

### 🔴 Say it plainly: the change is very slightly WORSE for contrast

**-0.18, from 3.74:1 to 3.56:1.** Both fail the AA 4.5:1 floor for normal text. Both clear the 3.0:1
large-text floor, but this button is `text-sm` / `font-semibold` = 14px / 600, which is **not** WCAG
"large text" (that needs 18.66px bold or 24px), so the 3.0:1 allowance does not apply to it.

**INFERRED, and offered as context not as an excuse:** orange-600 at 3.56:1 is the app's *existing*
recorded accessibility exception, named as such in `lib/brand.ts:49`, and it is what 228 other controls
already use - including the customer's own Review-order-equivalent and the Take payment button one tap
later. This change moves one button from an off-convention colour that was marginally better into the
app-wide colour that is marginally worse. It does not create a new exception; it enrols one more
control into the existing one. If you want that exception closed, the fix is `orange-700` (`#c2410c`,
**5.18:1**, a genuine AA pass) applied across all 228 sites as one decision - not a second one-off here.
Not doing that in this turn; flagging it as the real fix.

---

## D. Blast radius

`AddOrderPanel.tsx` is the operator Add Order surface. The changed line is inside the `md:hidden`
phone sticky bar, so **only the narrow-viewport operator layout renders it**; the tablet/desktop
layout of the same component is untouched. No customer surface, no email, no PDF, no printed ticket,
no push payload, no database column and no Stripe path reads this class. A className string cannot
affect behaviour: the handler, the disabled predicate and the totals are byte-identical.

---

## E. Verification

### E1. Non-ASCII census, `components/dashboard/AddOrderPanel.tsx`

| | Before | After |
|---|---|---|
| bytes | 168,993 | 168,995 |
| chars | 163,666 | 163,668 |
| lines | 2,477 | 2,477 |
| non-ASCII total | 2,659 | **2,659** |
| distinct classes | 36 | **36** |

**No character class gained. No class lost. The non-ASCII count is identical.** The +2 bytes are the
four ASCII letters `teal` becoming the six ASCII letters `orange`.

### E3. Carrier-aware variation-selector check (per emoji-presentation base)

Bare vs paired counted **per base**, not as a raw U+26A0 vs U+FE0F total:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 42 | 39 | 3 |
| U+270F PENCIL | 2 | 1 | 1 |
| U+2139 INFORMATION SOURCE | 1 | 1 | 0 |
| U+1F534 LARGE RED CIRCLE | 37 | 0 | 37 |
| U+1F512 LOCK | 7 | 0 | 7 |
| (11 further bases) | - | 0 | - |

Sum of per-base paired = **41** = total U+FE0F count **41**. ✅ Every selector is accounted for by a
named carrier - no orphan, no double-count.

🔴 **A refinement to the method, worth recording.** My first pass reported 40 paired against 41
selectors - an apparent orphan. The missing carrier is **U+2139 INFORMATION SOURCE, whose Unicode
general category is `Ll` (lowercase letter), not `So`**. Any carrier scan that gathers candidate bases
by `category == 'So'` will silently miss it and report a phantom discrepancy. Candidates must be taken
from *what actually precedes each U+FE0F*, not from a category filter. Corrected here.

The 3 bare U+26A0 and 1 bare U+270F are **pre-existing and unchanged** - the census is identical
before and after, and my edit touched no glyph at all.

### E2. Byte scan, `components/dashboard/AddOrderPanel.tsx` - byte-level, not grep

Scanned all 168,995 bytes for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and
0x7F:

```
scanned 168995 bytes; offending=0
NONE - no NUL, no control byte below 0x09, no C0 stragglers
CRLF=0  lone CR=0  tabs=0
```

### E4. Git

`git diff --stat` for the changed file: `components/dashboard/AddOrderPanel.tsx | 2 +-`. Nothing
staged, nothing committed, no branch change. Working tree still carries the earlier turns' modified
files, untouched by this turn.

---

## F. Summary

The operator "Review order" button was the only solid teal button on a screen whose every other
control is orange, and it opened a sheet whose primary action is orange. The teal was not a
convention - the same "Start Event" action is teal on the KDS and orange in this very file, and a
prior task on the manage page had already recorded solid teal as a one-off and replaced it with
`bg-orange-600` / `hover:bg-orange-700`. There is no shared button component and no colour token, and
`lib/brand.ts` explicitly forbids inheriting the brand hex for app buttons, so the class was copied
from the active category chip on the same screen. One token changed, `bg-teal-600` -> `bg-orange-600`;
size, position, label, handler, disabled predicate and totals are untouched, the customer file gained
no hunk, and contrast moves from 3.74:1 to 3.56:1 - marginally worse, both below AA, and now sharing
the app's already-recorded exception rather than sitting outside it.
