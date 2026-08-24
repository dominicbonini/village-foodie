# Cost comparison — CTA repair and results layout

**Date:** 23 August 2026
**Status:** built. **NOT deployed, NOT committed, `next dev` NOT run.**
**Prompt integrity:** no span arrived garbled. No instruction contradicted another.

✅ **ONE FILE CHANGED: `app/landing/cost/CostComparison.tsx`.** The gate (`page.tsx`, 23:04), `DemoCta`
(`components/landing/DemoUpload.tsx`, 17:18) and everything in `lib/` are untouched.

---

# §1 — TASK 1: WHY THE CTA WAS INVISIBLE

## 1.a 🔴 YOUR HYPOTHESIS IS HALF RIGHT, AND THE HALF THAT IS WRONG IS THE MECHANISM

**What `DemoCta` actually is:**

```tsx
export function DemoCta({ className, children }: { className?: string; children: React.ReactNode }) {
  const { setOpen } = useDemoModal()
  return (
    <button type="button" className={className} onClick={() => setOpen(true)}>
      {children}
    </button>
  )
}
```

✅ **Props: `{ className?, children }`. It forwards `className` and nothing else. No `style`.** That
part of your hypothesis is exactly right.

🔴 **BUT NO `style` PROP WAS BEING DROPPED, BECAUSE NONE WAS BEING PASSED.** The CTA read:

```tsx
<DemoCta className="block w-full px-6 py-5 text-center text-lg font-bold text-white transition
                    hover:brightness-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300">
```

**`style=` count on every `<DemoCta>` on the page: 0. Background-colour class count: 0.**

## 1.b The actual mechanism

The prototype's CTA was `<a … className="…text-white…" style={{ backgroundColor: ORANGE }}>`. **When I
converted it to `<DemoCta>`, `className` was carried across verbatim and the inline `style` was simply
dropped on the floor — not passed and rejected, just never written.** `text-white` survived; the orange
did not.

🔴 **RESULT: white bold text on the hero card's white background.** The button was full width and
`py-5` tall, so it occupied space and rendered nothing — **exactly the blank band roughly one button
tall that your screenshot shows, between the anchor line and the cream footer.**

## 1.c ✅ PROOF IT COULD NOT HAVE BEEN A SILENTLY-DROPPED PROP

**The typecheck settles it.** `DemoCta`'s props are typed `{ className?: string; children: React.ReactNode }`.
Passing `style={{ … }}` to it is an **excess property**, which TypeScript rejects on JSX attributes.
**`npx tsc --noEmit` exited 0 both before this task and after** — so no `style` prop was reaching
`DemoCta` anywhere, and none could have been silently discarded.

⚠️ **Which means the failure mode is worse than the one you proposed, not better.** A dropped prop
would have been a type error at build. **This was a colour that was never specified at all** — no error,
no warning, nothing to grep for. It typechecked, it rendered, it was invisible.

## 1.d Anything else losing a `style` prop on this page? — **No.**

`style` is passed **18 times** on this page, every one of them to a plain DOM element (`<div>`, `<p>`,
`<span>`, `<input>`), which accepts it. **`DemoCta` is the only component receiving props here, and it
receives `className` only.**

## 1.e The fix, in `className` because that is what is forwarded

```tsx
const CTA_CLASS =
  'block w-full bg-[#EF8B2C] text-center font-bold text-white transition hover:brightness-95 ' +
  'focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300'
```

```tsx
<DemoCta className={`${CTA_CLASS} px-6 py-5 text-lg`}>          {/* primary, in the hero card */}
<DemoCta className={`${CTA_CLASS} mt-6 rounded-2xl px-6 py-4 text-base`}>   {/* secondary, page bottom */}
```

✅ **Visibly orange (`#EF8B2C`, the prototype's exact colour), full width, white bold text.**
✅ **`DemoCta` was not modified** — other callers depend on its shape.

🔴 **AND A TRAP RECORDED AT THE SITE: THE HEX CANNOT BE INTERPOLATED.** The obvious tidy-up is
`bg-[${ORANGE}]` to avoid repeating the value. **Tailwind scans source for complete class names, so a
template literal produces no CSS at all** — the class would silently not exist and the button would go
back to being invisible, **failing in precisely the way this task exists to fix.** The comment says so.

## 1.f 🔴 THE SECOND CTA HAD THE SAME DEFECT, AND YOU WERE RIGHT TO ASK

It carried `text-white` and no background either. It sits on the page background (`#FAF8F5`), so it was
**white-on-near-white — invisible in the same way**, just without the white card behind it to make it
obvious. **Both now share `CTA_CLASS`**, so they cannot drift apart again.

---

# §2 — TASK 2: THE EFFECTIVE-RATE LINE IS GONE

**Removed:** *"{x}% of takings now, against {y}% on HatchGrab."*

**The reason is recorded at the site**, in the terms you gave: it looks like a helpful summary and it is
the one line on the page that **publishes the exact rate a competitor would need to undercut, computed
from our own pricing, on a page built to be shown to people shopping around.** Every other figure is
about *this operator's* situation; that one was about our position in the market.

## 2.a What became unused, and was also removed

- ✅ **`effTheirs` and `effOurs`** — deleted from the memo's return. **0 references left in code** (2 in
  the comment recording the removal).
- ✅ **`theirsMonth` and `oursMonth` are no longer RETURNED.** They are still *computed* inside the memo
  — `theirsYear` and `oursY1`/`oursY2` are built from them — but the effective-rate line was their only
  consumer outside it. ⚠️ **Returning a value nothing reads is how a deleted feature leaves a trail that
  looks load-bearing to the next person**, so they came off the returned object.
- ⚠️ **`fleetGmv` was KEPT**, though it fed the deleted line: card 3's *"Across N trucks: £X a month"*
  still uses it. **Checked rather than assumed** — every returned field was tested for consumers.

---

# §3 — TASK 3: THE YEAR BLOCKS READ TOP-DOWN

**Before:** label left, saving pushed to the right edge by `justify-between`, comparison line below —
three lines starting at three different places, with the eye crossing the card to connect two facts
about the same year.

**Now:**

```tsx
<p className="text-xs font-black uppercase tracking-wider text-slate-500">{label}</p>
<p className="mt-1 text-2xl font-black tabular-nums" style={{ color: isRealSaving(save) ? ORANGE : SLATE }}>
  {isRealSaving(save) ? 'Save ' : 'Extra '}{gbp(Math.abs(save))}
  <span className="ml-2 text-sm font-bold text-slate-400">{Math.abs(pct).toFixed(0)}%</span>
</p>
<div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
  Current provider … → HatchGrab {planName} …
</div>
```

Rendering as:

```
    YEAR ONE
    Save £530  55%
    Current provider £960 → HatchGrab Pro £430
```

✅ **The figure keeps its size (`text-2xl font-black`), its colour, and the small percentage beside it.
Only its position changed.** ✅ **`justify-between` is gone from `YearLine`** — the two remaining
occurrences in the file are card 3's GMV row (untouched, not in scope) and my own comment describing
what was removed.

✅ **The two-year line is left-aligned too** (`text-center` dropped), so the whole detail card shares
one edge. **`text-center` count inside the detail card: 0.**

✅ **The hero card is untouched and still centred**, as instructed.

## 3.a ⚠️ MID-TURN CHANGE: THE YEAR LINES SAY "HatchGrab", NOT "HatchGrab Pro"

Asked for while this task was running, and applied. The comparison line now reads:

```
    Current provider £960 → HatchGrab £430
```

**The tier is already stated once, in question 2** (*"Pro — £29 per truck per month, £1,500 of online
orders included on each"*). Repeating it on both year lines made the comparison read as being about
**which plan they would be on**, when the line exists to compare **two totals**.

✅ **`planName` is no longer a prop of `YearLine`** — removed from the signature, the type and both
call sites, on the same principle as `theirsMonth`/`oursMonth` in §2.a. It is still used where it
belongs, in question 2.

---

# §4 — TASK 4: THE GAP

✅ **No spacing was added anywhere.** The blank band was a rendered-but-invisible button, so **restoring
the background fills the space that was always allocated to it** — the layout did not have a hole to
patch, it had an element nobody could see.

**The hero card's rhythm is unchanged and reads, top to bottom:**

```
  px-6 py-9  ┌ eyebrow
             │ mt-3  hero figure (dynamic fontSize, lineHeight 0.92)
             │ mt-4  "55% less than you pay now"
             └ mt-5  border-t pt-5  "That's a new fryer and griddle."   (only when the anchor applies)
  ── the orange CTA band, px-6 py-5, edge to edge inside the rounded card ──
  px-6 py-3  cream footer: "No card needed to set up · Keep your own customers"
```

⚠️ **The CTA has no margin of its own and should not gain one** — it is a full-bleed band inside
`overflow-hidden rounded-2xl`, so its `py-5` is its whole height and the card's own `py-9` provides the
separation above it.

🔴 **WHAT I CANNOT TELL YOU: whether it now LOOKS right.** Nothing has been rendered. Two things I would
look at, offered as candidates rather than findings:

1. **The anchor line already has a `border-t` rule above it**, and the CTA band arrives immediately after
   the card's bottom padding. **Rule, text, gap, solid orange bar** may read as two dividers close
   together.
2. ⚠️ **The second CTA has effectively appeared from nowhere.** It was invisible before, so the bottom
   of the page has gained a full-width orange button under the small print that you have never seen in
   position. **`mt-6` is what it had while invisible; it was never chosen against a visible element.**

---

# §5 — VERIFICATION

| Check | Method | Result |
|---|---|---|
| `DemoCta`'s contract | read the component | ✅ **`{ className?, children }`, forwards `className` only** |
| No `style` was being dropped | `style=` count on every `<DemoCta>` + a clean typecheck | ✅ **0 passed; TS would have errored if one were** |
| Other `style` props on the page | scan | ✅ **17, all on plain DOM elements** |
| Both CTAs now coloured | scan of both tags | ✅ **both use `CTA_CLASS` with `bg-[#EF8B2C]`** |
| `DemoCta` unmodified | mtime 17:18, hours before this task | ✅ **untouched** |
| Effective-rate line and its computation | comment-stripped grep | ✅ **0 `effTheirs`/`effOurs` in code** |
| Unused returned fields | every memo field tested for consumers | ✅ **`theirsMonth`/`oursMonth` removed, `fleetGmv` correctly kept** |
| Year blocks left-aligned | `justify-between` / `text-center` counts | ✅ **gone from `YearLine` and the detail card** |
| Typecheck | `npx tsc --noEmit` | **exit 0, zero output** — ⚠️ **not offered as verification** |
| Character census | NUL / control / carrier-aware selectors | ✅ **0 NUL, 0 orphan selectors, no bare glyphs** |

## 5.a ⚠️ I HIT THE JSX-COMMENT TRAP AGAIN, FOR THE THIRD TIME

My first version of the two-year change put a `{/* … */}` comment **in an expression position**, directly
after `{isRealSaving(m.twoYear) && (`. **Nine typecheck errors.** A `&&` body must be a single
expression, and a JSX comment there is a second child. Fixed by folding the note into the comment above
the conditional.

🔴 **This is the third occurrence in this codebase and the typecheck caught it every time.** It is
invisible to reading and fatal to the build. **The pattern: never open a `{/* */}` immediately after
`&& (`, `? (` or `return (`.**

---

# §6 — WHAT REMAINS UNOBSERVED

1. 🔴 **NOTHING HAS BEEN RENDERED.** `next dev` was not run. **I have not seen the orange button, the
   restructured year blocks, or the closed gap.** The diagnosis in §1 is read from source and confirmed
   by the type system; **the fix's appearance is not.**
2. 🔴 **`bg-[#EF8B2C]` HAS NOT BEEN COMPILED.** Arbitrary Tailwind values compile in this project
   (`min-h-[8rem]` and `max-w-[85%]` are already in this file), but **a typecheck does not validate
   Tailwind classes** — only a build or a dev server proves the CSS exists. ⚠️ **If the button is still
   invisible when you run it, this is the first thing to check**, and it would mean the arbitrary-value
   syntax is not reaching the compiler for this file.
3. ⚠️ **The two spacing candidates in §4 are guesses at what to look at**, not findings. I did not add
   compensating spacing and would not without seeing it.
4. ⚠️ **The left-aligned year block has never been seen against the centred hero card above it.** One
   card centred and the next left-aligned is a deliberate contrast; whether it reads as deliberate is a
   visual judgement.
5. ⚠️ **Everything unobserved from the previous two reports still is** — the range focus ring, the 375px
   behaviour, and the gate, which has never fired.
