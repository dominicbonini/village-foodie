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
//   blue-600  #2563eb  5.17:1  ✅   (blue-500 3.68:1 ❌)
//   slate-800 #1e293b 14.63:1  ✅
// If you change one of these, recompute the ratio. Do not eyeball it.

// ── THE SOLIDS — exported individually, because the dashboard and manage Btn palettes have DIFFERENT
// shapes (manage's primary is orange, its red/slate are tints). Sharing the individual colour rather
// than forcing one palette lets both import the same green without pretending they are the same button.
/** Kitchen state advancing — Ready, ✓ Confirm. 3.30:1 — see the note above before changing. */
export const GREEN_SOLID = 'bg-green-600 hover:bg-green-700 text-white'
/** A MONEY action — Mark paid, Take payment. 5.17:1. Deliberately not green. */
export const BLUE_SOLID  = 'bg-blue-600 hover:bg-blue-700 text-white'
/** Completion — Done, Mark paid & done. 14.63:1. */
export const DARK_SOLID  = 'bg-slate-800 hover:bg-slate-900 text-white'

/** The dashboard order-card Btn palette. */
export const BTN_COLOURS: Record<string, string> = {
  green:  GREEN_SOLID,
  blue:   BLUE_SOLID,
  dark:   DARK_SOLID,
  red:    'bg-red-500 hover:bg-red-600 text-white',
  teal:   'bg-teal-600 hover:bg-teal-700 text-white',
  slate:  'bg-slate-500 hover:bg-slate-600 text-white',
  amber:  'bg-amber-500 hover:bg-amber-600 text-white',
  orange: 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200',
}
