# The tappable customer name — replacing the underline

**Date:** 13 August 2026
**COPY AND STYLE ONLY. One file, two markup lines. No layout class touched. No migration. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 WHAT CHANGED, IN ONE LINE

**The underline is gone; the envelope glyph is now permanently orange instead of hover-revealed grey.** Colour is the only property that moved, so nothing on the card changes width or position in any view mode.

```diff
-        <span className="truncate underline underline-offset-2">{order.customer_name}</span>
-        <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
+        <span className="truncate">{order.customer_name}</span>
+        <span className="text-orange-500 group-hover:text-orange-600 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
```

---

## 1. The current markup — BEFORE

**Source: QUOTED.** `components/dashboard/OrderCard.tsx:759-771` as it stood:

```tsx
  const nameEl = (className: string) => (
    (order.customer_email || order.customer_phone) ? (
      <button
        onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
        title="Tap for contact details"
        className={`group inline-flex items-baseline gap-1 text-left ${className}`}>
        <span className="truncate underline underline-offset-2">{order.customer_name}</span>
        <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
      </button>
    ) : (
      <span className={`truncate ${className}`}>{order.customer_name}</span>
    )
  )
```

**Two signals: `underline underline-offset-2` on the name, and a `text-slate-300` glyph that only became visible on hover.**

---

## 2. Every other tappable-text affordance, and the pick

**Source: QUOTED.** All of these are in the dashboard today.

**A — glyph suffix on a value.** 🔴 **This card's own**, `OrderCard.tsx:63-70`:
```tsx
    <button onClick={() => { setVal(price.toFixed(2)); setEditing(true) }}
      className="flex items-center gap-1.5 shrink-0 text-right group" title="Tap to override price">
      <span className="text-slate-900 font-bold text-sm">£{(price * quantity).toFixed(2)}</span>
      <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-xs" aria-hidden>✏</span>
    </button>
```

**B — bordered pill / chip.** `buzzerChip` (`:485-497`) and `paidChip` (`:421-425`):
```tsx
      className={`flex-shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full border whitespace-nowrap transition-colors ${…}`}>
```

**C — bare underline in a banner.** `CapacityBreachBanner.tsx:53` and `BuzzerLostBanner.tsx:78`:
```tsx
        className="self-end sm:self-auto underline font-bold shrink-0"
              className="min-h-[44px] underline font-bold px-1"
```

**D — underline with offset.** `DemoLoopComplete.tsx:194`:
```tsx
              className="font-bold underline underline-offset-2 hover:text-orange-800">
```

**E — orange + underline. 🔴 THE APP'S NAVIGATION IDIOM.** `page.tsx:2271`, `:2761`:
```tsx
<Link href="/" className="mt-4 inline-block text-orange-600 text-sm hover:underline">← {_brand}</Link>
<AppLink href={`/manage/${token}`} className="text-xs font-medium text-orange-700 underline">Edit categories</AppLink>
```

**F — muted underline, KDS.** `kds/page.tsx:1172`:
```tsx
            className="text-xs text-slate-400 hover:text-slate-600 underline"
```

**G — chevron disclosure.** `page.tsx:2649` `Event actions ▾`; `UserMenu.tsx:98` `rotate-180`.

**H — dashed border, reserved for "add".** `AddOrderPanel.tsx:1822`, `page.tsx:4218`.

### 🔴 THE PICK: A — THE GLYPH SUFFIX

**Why it is the most native of the eight:**

- ✅ **It is already on this card**, on `InlinePriceEditor`, doing the same job: a value you can tap, marked by a small trailing glyph and a `title="Tap to …"`. **Two controls, one idiom.**
- 🔴 **D, E and F were the problem, not the alternatives.** They are all underlines, and **E is what the app uses for links that navigate** — which is exactly why the underlined name read as a hyperlink dropped into a card of chips and pills.
- ⚠️ **B, the chip, was rejected on layout grounds.** A border plus `px-1.5` adds real width to the one row the audit found crowded, and the name is the flexing element that would absorb it. **Layout is out of scope**, so a treatment that changes width was not available.
- ⚠️ **G means "a menu opens"**, and **H means "create"**. Neither is what a tap on the name does.

---

## 3. 🔴 WHY IT IS STILL OBVIOUS WITHOUT HOVER

**The treatment: the trailing `✉` renders at `text-orange-500` from the first paint. Hover only darkens it to `text-orange-600`.**

**The underline existed for a real reason and I have not simply deleted it.** Its own comment said so:

> *"Hover does not exist on the touch screens this card is actually used on, so a glyph that only colours on hover is invisible to the operator holding a tablet."*

🔴 **THAT DIAGNOSIS WAS RIGHT AND THE REMEDY WAS WRONG.** The flaw was never "one signal is not enough" — it was that pattern A, as `InlinePriceEditor` writes it, is **hover-dependent and therefore invisible on touch**. The underline was a second signal bolted on to compensate for a first signal that did not work. **Fixing the first signal is the better answer than keeping both.**

| | Before | After |
|---|---|---|
| On a **tablet** (no hover) | `text-slate-300` glyph — near-invisible. **The underline was doing all the work** | 🔴 **`text-orange-500` glyph, visible from the first paint** |
| On a **pointer** device | grey → orange on hover | orange → darker orange on hover. Feedback retained |
| What it reads as | a hyperlink | ⚠️ a value with something attached — the same thing `£18.00 ✏` reads as |

**Why orange specifically:** it is the card's interactive colour and nothing else uses it. The contact panel's own `mailto:`/`tel:` links are `text-orange-500`; `InlinePriceEditor`'s glyph goes orange on hover; every primary button is `bg-orange-600`. **A persistent orange mark beside a name, and nowhere else on the card, is unambiguous — and it is not an underline.**

⚠️ **It is a deliberate trade and I am stating it: this is quieter than an underline.** What defends it is that the glyph is now *always* visible where before it was *never* visible on the device that matters, so the affordance on touch is **stronger than what shipped**, not weaker. `title="Tap for contact details"` is unchanged behind it.

---

## 4. The glyph: KEPT

🔴 **Kept, and it is now the whole affordance rather than half of one.**

- **Dropping it would have left nothing.** Remove the underline and the glyph together and a tappable name becomes indistinguishable from every non-tappable name on the card. That is the "worse problem" requirement 3 warns against.
- ✅ **It is the pattern's defining element.** `InlinePriceEditor` is `value + glyph`; without the glyph there is no pattern A to follow.
- ✅ **`✉` states WHAT the tap does** — contact details — where an underline says only "something happens".
- ⚠️ **`aria-hidden` retained**, so it is decoration to a screen reader, which gets the `title` instead.

---

## VERIFICATION

### Before and after

**BEFORE** (§1). **AFTER** — `:769-780`:

```tsx
  const nameEl = (className: string) => (
    (order.customer_email || order.customer_phone) ? (
      <button
        onClick={(e) => { e.stopPropagation(); setShowContact(v => !v) }}
        title="Tap for contact details"
        className={`group inline-flex items-baseline gap-1 text-left ${className}`}>
        <span className="truncate">{order.customer_name}</span>
        <span className="text-orange-500 group-hover:text-orange-600 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
      </button>
    ) : (
      <span className={`truncate ${className}`}>{order.customer_name}</span>
    )
  )
```

### 🔴 LAYOUT CLASSES UNCHANGED — BY GREP

**The three call sites, byte-identical:**
```
824:            {nameEl('text-xs text-slate-600 min-w-0')}
860:                {nameEl('text-sm opacity-70 min-w-0 flex-1')}
894:                {nameEl('opacity-80 min-w-0')}
```

**The button's own layout, byte-identical:**
```
773:        className={`group inline-flex items-baseline gap-1 text-left ${className}`}>
```

**The complete diff of markup lines — nothing else in the file changed:**
```
-        <span className="truncate underline underline-offset-2">{order.customer_name}</span>
-        <span className="text-slate-300 group-hover:text-orange-400 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
+        <span className="truncate">{order.customer_name}</span>
+        <span className="text-orange-500 group-hover:text-orange-600 transition-colors text-[10px] flex-shrink-0" aria-hidden>✉</span>
```

✅ **`truncate`, `text-[10px]`, `flex-shrink-0`, `gap-1`, `inline-flex`, `items-baseline` — every one identical.** The only removals are `underline` and `underline-offset-2`, **neither of which occupies space**: `text-decoration` paints inside the element's existing box. **The card's geometry cannot have changed.**

✅ **No `underline` class remains anywhere in `OrderCard.tsx`** — the four remaining hits are all prose in the comment explaining why it went.

### The three view modes

| Mode | Row | With contact details | Without |
|---|---|---|---|
| **cook** (`:824`) | header row 2, `text-xs text-slate-600 min-w-0` | `Dominic Bonini ✉` — grey name, orange envelope | `Dominic Bonini` — plain span, no glyph |
| **solo** (`:860`) | header row 2, `text-sm opacity-70 min-w-0 flex-1` | `Dominic Bonini ✉` beside the status badge, £total and paid chip | `Walk-up` |
| **window** (`:894`) | header row 2, `opacity-80 min-w-0` | `Dominic Bonini ✉` with the time pushed right by `ml-auto` | `Walk-up` |

🔴 **NOTHING MOVED IN ANY MODE.** The name is still the `min-w-0` element that truncates, the glyph is still `flex-shrink-0` at the same size, and the no-contact branch is **byte-identical to before** — a plain `<span className={truncate …}>`, no glyph, nothing tappable.

### Not touched

| Constraint | Held? |
|---|---|
| Row structure, paid chip, buzzer chip, time label, positions | ✅ **Not opened** |
| Contact panel, `mailto:`/`tel:` links, tap behaviour | ✅ **Not opened** — `onClick`, `setShowContact` and the panel are unchanged |
| Any other text on the card | ✅ **None changed** |

### Gates

```
tsc: clean
eslint — OrderCard 2 errors (baseline 2). ZERO NEW.
```

---

## NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `components/dashboard/OrderCard.tsx` | 1239 / 31 | 1247 / 31 | ✅ **none** |

✅ **DISTINCT IS UNCHANGED AT 31, AND THE SET IS IDENTICAL.**

⚠️ **The glyph was kept, so no class was dropped.** For completeness: `✉` (U+2709) appears **twice** in this file — the name's glyph at `:776` and the contact panel's email line at `:900`:

```tsx
              ✉ {order.customer_email}
```

🔴 **So even if the glyph HAD been dropped, `✉` would have stayed in the census** — the contact panel uses it independently and is out of scope.

**Total rose by 8** — comment prose only (the explanation of why the underline went), no new character class.

---

## Not established

- **Whether orange at `text-[10px]` is loud enough on a real tablet in daylight.** It is strictly more visible than what shipped (which was `text-slate-300` and hover-gated), but I have not seen it on the hardware. ⚠️ **If it proves too quiet, the next lever that costs no layout is the glyph's weight or a slightly larger `text-xs` — 2px, which the `flex-shrink-0` glyph can take from the name's truncation budget.**
- **Whether `✉` is the right glyph** when the order has a phone but no email. It currently shows the envelope either way; `📱` is already in the file. Not changed, because that is a copy decision beyond replacing the underline.
