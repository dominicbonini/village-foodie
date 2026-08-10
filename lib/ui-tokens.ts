// ── SHARED UI COLOUR TOKENS ──────────────────────────────────────────────────────────────────────
// One definition per colour, imported by every surface. This file exists because there were TWO
// identical `green` tokens — components/dashboard/OrderCard.tsx and components/manage/primitives.tsx —
// and the moment one moved for accessibility (green-600 → green-700, 3.30:1 → 5.02:1) they diverged.
// Two copies that agree today are two copies that disagree tomorrow; a shared constant cannot drift.
//
// ── THE THREE ACTION COLOURS ON AN ORDER CARD, AND WHY THEY ARE DIFFERENT ────────────────────────
//   GREEN  — a KITCHEN state advancing (Ready, ✓ Confirm)
//   BLUE   — a MONEY action (Mark paid, Take payment)
//   SLATE  — COMPLETION (Done, Mark paid & done)
// Green previously meant both "ready" and "mark paid", so on adjacent cards a kitchen state and a money
// action rendered as the same class of thing. They are not the same, and an operator mid-service reads
// colour before text.
//
// ⚠️ CONTRAST IS A HARD FLOOR HERE, NOT A PREFERENCE. These are 14-16px bold labels pressed outdoors,
// possibly in daylight. WCAG AA for normal text is 4.5:1 against white. Every value below is measured:
//   green-600 #16a34a  3.30:1  ⚠️  BELOW AA — this is the ORIGINAL, pre-30-July value, RESTORED by
//                                  operator decision after it was moved to green-700 (5.02:1) and then
//                                  to green-500 (2.28:1). Do NOT "fix" it back up: the ratio is known
//                                  and the call was made deliberately. Raise it only if asked.
//   orange-600 #ea580c  3.56:1  ⚠️  brand primary, white text — pre-existing, below AA
//   orange-700 #c2410c  5.18:1  ✅  as TEXT on white (the outline variant)
//   slate-800 #1e293b 14.63:1  ✅
// If you change one of these, recompute the ratio. Do not eyeball it.

// ── THE SOLIDS — exported individually, because the dashboard and manage Btn palettes have DIFFERENT
// shapes (manage's primary is orange, its red/slate are tints). Sharing the individual colour rather
// than forcing one palette lets both import the same green without pretending they are the same button.
/** Kitchen state advancing — Ready, ✓ Confirm. 3.30:1 — see the note above before changing. */
export const GREEN_SOLID = 'bg-green-600 hover:bg-green-700 text-white'
/** A MONEY action — Mark paid, Cash, Card, Take payment. The page's vocabulary is orange/slate/green,
 *  so money is BRAND ORANGE, not a foreign accent colour. Hierarchy (solid vs outline) separates
 *  "confirm" from "pay"; an ICON separates cash from card. Colour encodes what KIND of action something
 *  is — never which variant of it. ⚠️ white on orange-600 is 3.56:1, below the 4.5:1 AA floor; it is the
 *  pre-existing brand primary and is used here for consistency with the rest of the page. */
export const ORANGE_SOLID = 'bg-orange-600 hover:bg-orange-700 text-white'
/** SECONDARY of the same brand colour — "Place order" beside "Take payment" / "Cash" / "Card".
 *  ⚠️ This doc named "Confirm order" until 10 August 2026, which had not been the rendered label since
 *  the Add Order bar was rebuilt — a token comment naming a button that no longer exists is exactly the
 *  drift the header of this file warns about. If the label changes again, change it here too.
 *  Orange-700 TEXT is
 *  5.18:1 on white (AA pass); the orange-600 border is 3.56:1, clearing the 3:1 UI-component bar.
 *  ⚠️ Contrast is SYMMETRIC — "orange text on white" is NOT automatically safer than the reverse:
 *  text-orange-600 on white is the same 3.56:1 as white on orange-600. 700 is what makes it pass. */
export const ORANGE_OUTLINE = 'bg-white hover:bg-orange-50 text-orange-700 border border-orange-600'
/** Completion — Done, Mark paid & done. 14.63:1. */
export const DARK_SOLID  = 'bg-slate-800 hover:bg-slate-900 text-white'

// ── TYPOGRAPHY ───────────────────────────────────────────────────────────────────────────────────
// Not a colour token, but the same argument: it had FOUR inline copies (two Settings screens) that had
// to agree, with nothing making them agree — the makeCartKey triplication class. A shared constant
// cannot drift.
/** Sub-card group headings in Settings ("Accepting orders", "Taking payment", "Opening and closing").
 *  STRUCTURE, not secondary text — hence slate-800, the same colour as the row titles beneath it, with
 *  the hierarchy carried by SIZE + UPPERCASE + TRACKING rather than by being faded.
 *  ⚠️ NOT for the orders-board column headings or the Allergens h2, which keep slate-500 DELIBERATELY:
 *  a board label sits above live tickets an operator scans past and must not compete with them, whereas
 *  a settings heading should be as prominent as its rows. That divergence is a decision — do not
 *  "unify" those onto this token. */
export const SUBCARD_HEADING = 'text-xs font-black text-slate-800 uppercase tracking-widest'

/** The dashboard order-card Btn palette. */
export const BTN_COLOURS: Record<string, string> = {
  green:  GREEN_SOLID,
  money:  ORANGE_SOLID,
  'money-outline': ORANGE_OUTLINE,
  dark:   DARK_SOLID,
  red:    'bg-red-500 hover:bg-red-600 text-white',
  teal:   'bg-teal-600 hover:bg-teal-700 text-white',
  slate:  'bg-slate-500 hover:bg-slate-600 text-white',
  amber:  'bg-amber-500 hover:bg-amber-600 text-white',
  orange: 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200',
}
