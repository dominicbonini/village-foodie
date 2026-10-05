'use client'
// components/shared/PriceControls.tsx — THE PRICE CONTROLS, ONE SET, TWO SCREENS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS IS IN `components/shared` AND NOT IN `components/manage`
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// Prices are set on TWO screens on two different surfaces: the Event types grid (Manage, per type)
// and the dashboard's "Prices for this event" sheet (per event). Dominic, 5 October 2026: "Same
// controls, components and arithmetic as the grid — no second implementation."
//
// `components/manage/primitives.tsx` carries its own note on exactly this boundary — CONTROL_BOX was
// moved out to `lib/ui-tokens.ts` because "the dashboard uses the same box and must NOT import from
// the manage primitives to get it". A control the dashboard needs is the same case one level up, so
// it lives here, which is where `AppHeader` and the five shared modals already live.
//
// ⚠️ `Select` MOVED HERE WITH THEM, AND `components/manage/primitives.tsx` RE-EXPORTS IT. Every one
// of its existing manage callers imports it by the same name from the same path and is unchanged;
// there is still exactly ONE definition, and now the sheet can reach it without reaching into Manage.
// 🔴 THE SHEET MUST USE THIS `Select`, NOT A NATIVE ONE, AND THE REASON IS MEASURED: WebKit does not
// apply vertical padding (or `min-height`) to a native `<select>`, so the same markup renders 38px in
// Chromium and 23px in Safari — found by scripts/event-types-render.cjs, recorded in the combine
// report §9. An operator taps these on an iPad mid-service. `appearance-none` plus an inline chevron
// is what makes a fixed height stick in both engines.
//
// ── 🔴 THIS FILE COMPUTES NOTHING ────────────────────────────────────────────────────────────────
// Every price shown is `priceForItem` from lib/event-pricing/price.ts, called by the caller or by
// `PriceCell` below — the SAME function the menu API serves and the submit route charges. There is no
// arithmetic in this file and none may be added to it.

import { useEffect, useRef, useState } from 'react'
import { CONTROL_BOX } from '@/lib/ui-tokens'
import {
  PRICE_MODE_CHOICES, PRICE_ROUNDING_CHOICES,
} from '@/lib/copy/serviceSettings'
import {
  amountUnitFor, applyPriceRule, cleanPriceAmount, cleanTypedPrice, priceForItem, toPence, toPounds,
  type PriceMode, type PriceRounding, type PriceSetup,
} from '@/lib/event-pricing/price'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · THE SHARED NON-NATIVE SELECT (moved from components/manage/primitives.tsx, verbatim)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ══ THE MANAGE DROPDOWN ════════════════════════════════════════════════════════════════════════
 *
 * 🔴 WHY THIS IS NOT LIFTED FROM SETTINGS, WHICH IS A FINDING AND NOT A FREE CHOICE. Dominic asked
 * for "the same select/dropdown component and styling as Settings (not native browser selects with
 * the system arrows)". Settings has no such component: every `<select>` on the Manage page is a
 * NATIVE one with the platform's own arrow, repeating the same class string inline. The only
 * non-native select in the repository was in components/dashboard/AddOrderPanel.tsx, whose comment
 * explains the trick — `appearance-none` is what lets `rounded-lg` actually take effect, because a
 * native select paints its own chrome over it.
 *
 * So this is the two halves of that instruction reconciled: the BORDER, RADIUS, TEXT SIZE, COLOUR
 * and FOCUS RING are Settings' own (the class string eight of its selects already share, named here
 * once), and `appearance-none` plus an inline chevron replaces the system arrow.
 *
 * ⚠️ SETTINGS ITSELF STILL RENDERS NATIVE SELECTS. Converting all of them is a Manage-wide visual
 * change and was not asked for. The two therefore differ in their ARROW and in nothing else.
 */
export function Select({ value, onChange, options, ariaLabel, disabled, faded = false, title, className = '', height }: {
  value: string | number
  onChange: (v: string) => void
  options: readonly { value: string | number; label: string }[]
  ariaLabel: string
  disabled?: boolean
  /**
   * ⚠️ OPTIONAL, AND OMITTED BY EVERY EXISTING CALLER. `CONTROL_BOX` carries Settings' own `py-1` and
   * NO fixed height, deliberately — that note is below. A fixed height is what keeps a dense GRID's
   * rows aligned, so the Event types grid passes one and nothing else does.
   * 🔴 WEBKIT IS WHY THIS IS A HEIGHT AND NOT A `min-height`: WebKit does not apply `min-height` to a
   * `<select>`, so the same class rendered 40px in Chromium and 23px in Safari. Measured in both
   * engines by scripts/event-types-render.cjs, which is how that was found.
   */
  height?: number
  /** Showing an inherited value — see `<Toggle>`'s `faded`. */
  faded?: boolean
  /** The full text, for an option a narrow column truncates. */
  title?: string
  className?: string
}) {
  return (
    /* ── 🔴 `text-sm` ON THE WRAPPER, AND THIS IS NOT BELT AND BRACES ────────────────────────────────
      * app/globals.css carries an iOS zoom guard:
      *     select, input[type=text], … { font-size: 16px !important }          (below 640px)
      *     @media (min-width: 640px) { … { font-size: inherit !important } }   (640px and up)
      * `!important` beats `.text-sm` on the <select> itself, so from `sm` up the control takes
      * `inherit` — which means ITS PARENT'S size. The parent is this span; with no size on it the
      * chain ran to <body> and every dropdown rendered at 16px while the labels beside them were 14px.
      *
      * 🔴 PUTTING THE SIZE HERE FIXES IT WITHOUT TOUCHING THE GUARD. Below 640px the select is still
      * forced to 16px and iOS still does not zoom on focus — which is the right behaviour on the one
      * device this is used on at the hatch, and must not be "fixed" to match the labels. */
    <span className={`relative inline-flex min-w-0 items-stretch text-sm ${className}`}>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        aria-label={ariaLabel} title={title}
        style={height ? { height } : undefined}
        /* ── 🔴 THE BOX IS SETTINGS' BOX, AND THE CHEVRON IS ON THE RIGHT ──────────────────────────
          * `CONTROL_BOX` carries Settings' own `px-2 py-1 text-sm rounded-lg`. The only additions are
          * layout: `appearance-none` drops the platform arrow so `rounded-lg` takes effect, and `pr-7`
          * is the room the chevron sits in. NOTHING is added on the left, so the text starts at
          * Settings' own `px-2`. */
        className={`w-full min-w-0 truncate appearance-none pr-7 disabled:opacity-50 disabled:cursor-not-allowed ${faded ? 'opacity-50' : ''} ${CONTROL_BOX}`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {/* ⚠️ `aria-hidden` AND `pointer-events-none`: it is decoration over a real <select>, and a click
        * on it must reach the control underneath. */}
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400">
        <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE ROW HEIGHTS, AS NUMBERS, BECAUSE THREE THINGS COMPUTE FROM THEM
// ════════════════════════════════════════════════════════════════════════════════════════════════

/* 🔴 ONE SOURCE FOR THE GRID'S GEOMETRY. The grid's inline styles, the sheet's controls and
 * scripts/event-types-render.cjs all read these, so "rows are 44px" is a number with a measurement
 * behind it rather than a class someone has to keep in step. Dominic's 5 October figures:
 * control rows 44, item rows 36, category rows ~26, section rows ~34, selects/inputs 32, switch 44×26.
 * ⚠️ `SWITCH_H` IS 26 AND THE SHARED `Toggle` IS `w-11 h-6` — 44×24. The brief says 44×26; the
 * ROW is 44 tall and the switch's TRACK is 24 inside a 26px line box, which is what `h-6` plus the
 * row's centring produces. The track is NOT restyled: one switch component, product-wide, is a rule
 * this file is not the place to break (components/manage/primitives.tsx's own note). */
/**
 * ── 🔴 THE **SHEET'S** SIZES. TOUCHED BY TOUCH, DURING SERVICE. ───────────────────────────────────
 * `CONTROL_H` is the dashboard "Prices for this event" sheet's control height and it must NOT shrink:
 * Dominic, 5 October 2026 — "leave the dashboard sheet at its current sizes; it's used by touch during
 * service." A 28px select is a poor target on an iPad at a hatch.
 * ⚠️ IT IS THE DEFAULT FOR EVERY CONTROL HERE, so a caller that passes no height gets the sheet's.
 */
export const CONTROL_H = 32

/**
 * ── 🔴 THE **GRID'S** SIZES, SEPARATE, BECAUSE THE TWO SCREENS ARE NOT THE SAME JOB ──────────────
 * Schedule › Event types is a sit-down configuration screen read with a mouse, and it has to show a
 * whole menu's prices across several type columns — so it is dense. The sheet is one event, by touch,
 * mid-service.
 *
 * ⚠️ `ROW_H` IS THE GRID'S ALONE and the sheet never reads it, which is why these numbers could move
 * without the "the sheet must not change" instruction being at risk. `CONTROL_H` genuinely WAS shared
 * (through this module's `CONTROL_STYLE`), so the controls take an optional `height` instead and the
 * grid is the only caller that passes one.
 * 🔴 THEY ARE NUMBERS IN ONE PLACE because three things read them: the grid's inline styles, the
 * controls' heights, and `scripts/event-types-render.cjs`, which measures the rendered rows against
 * them. "Rows are 36px" is then a measurement rather than a class someone has to keep in step.
 */
export const ROW_H = { control: 36, item: 28, category: 22, section: 28 } as const
/** Selects and inputs inside the grid. */
export const GRID_CONTROL_H = 28
/** The typed-price box inside the grid — smaller again, because it sits inside a 28px item row. */
export const GRID_TYPED_H = 22

/** The class every select/input in the PRICES section carries, so the 32px is in one place. */
export const PRICE_CONTROL_CLASS = 'w-full'
/** The sheet's control box. A caller may override the height; nothing else differs. */
const styleFor = (height?: number) => ({ height: height ?? CONTROL_H })

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE RULE: MODE, AMOUNT, ROUNDING
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function PriceModeSelect({ value, onChange, disabled, label, height }: {
  value: PriceMode; onChange: (v: PriceMode) => void; disabled?: boolean; label: string
  /** Omitted ⇒ the sheet's `CONTROL_H`. The grid passes `GRID_CONTROL_H`. */
  height?: number
}) {
  return (
    <Select className={PRICE_CONTROL_CLASS} height={height} ariaLabel={label} disabled={disabled} value={value}
      title={PRICE_MODE_CHOICES.find(c => c.value === value)?.label ?? ''}
      options={PRICE_MODE_CHOICES.map(c => ({ value: c.value, label: c.label }))}
      onChange={v => onChange(v as PriceMode)} />
  )
}

export function PriceRoundingSelect({ value, onChange, disabled, label, faded, height }: {
  value: PriceRounding; onChange: (v: PriceRounding) => void; disabled?: boolean; label: string
  /** Omitted ⇒ the sheet's `CONTROL_H`. The grid passes `GRID_CONTROL_H`. */
  height?: number
  /**
   * 🔴 AN UNTOUCHED ROUNDING SHOWS FADED 'None', LIKE EVERY OTHER UNTOUCHED TYPE VALUE IN THE GRID.
   * `price_rounding` is `NOT NULL DEFAULT 'none'`, so there is no null to render differently — the
   * screen has to be told. Without it the column would show a crisp "None" that reads as a choice
   * the operator made, which is the "Varies by van" mistake in a new costume.
   */
  faded?: boolean
}) {
  return (
    <Select className={PRICE_CONTROL_CLASS} height={height} ariaLabel={label} disabled={disabled} value={value} faded={faded}
      title={PRICE_ROUNDING_CHOICES.find(c => c.value === value)?.label ?? ''}
      options={PRICE_ROUNDING_CHOICES.map(c => ({ value: c.value, label: c.label }))}
      onChange={v => onChange(v as PriceRounding)} />
  )
}

/**
 * The Amount box, with the mode's unit as a suffix.
 *
 * 🔴 IT COMMITS ON BLUR AND ON ENTER, NOT ON EVERY KEYSTROKE. Typing "15" is two keystrokes and the
 * first of them is "1" — a per-keystroke save would store a 1% uplift, recompute every price on the
 * screen, and then store 15%. The grid saves as you go everywhere else, so this says why it does not
 * here.
 * ⚠️ IT IS A LOCAL DRAFT WHILE FOCUSED AND THE PROP WHILE NOT. `useEffect` syncing a prop into state
 * is the pattern this codebase has been bitten by (`react-hooks/set-state-in-effect`), so the draft
 * is seeded on FOCUS and dropped on blur instead.
 * ⚠️ `cleanPriceAmount` IS THE SAME VALIDATOR THE ROUTE USES, so a value this box accepts is a value
 * the server stores, and a value it rejects never leaves the screen.
 */
export function PriceAmountInput({ mode, value, onCommit, disabled, label, height }: {
  mode: PriceMode
  value: number | null
  onCommit: (v: number | null) => void
  disabled?: boolean
  label: string
  /** Omitted ⇒ the sheet's `CONTROL_H`. The grid passes `GRID_CONTROL_H`. */
  height?: number
}) {
  const unit = amountUnitFor(mode)
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null || value === undefined ? '' : String(value))

  const commit = () => {
    const next = cleanPriceAmount(mode, draft)
    setDraft(null)
    /* ⚠️ ONLY WHEN IT CHANGED. Tabbing through the box must not write. */
    if (next !== (value ?? null)) onCommit(next)
  }

  return (
    <span className="relative inline-flex w-full min-w-0 items-stretch text-sm">
      <input
        type="text" inputMode="decimal" aria-label={label} disabled={disabled || unit === null}
        value={unit === null ? '' : shown}
        /* 🔴 `placeholder` CARRIES THE UNIT TOO, so an EMPTY box still says what it wants. */
        placeholder={unit === null ? '' : unit === '%' ? '0' : '0.00'}
        onFocus={() => setDraft(value === null || value === undefined ? '' : String(value))}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
        style={styleFor(height)}
        className={`w-full min-w-0 ${unit ? 'pr-6' : ''} text-center disabled:opacity-50 disabled:cursor-not-allowed ${CONTROL_BOX}`} />
      {/* ⚠️ THE SUFFIX IS DECORATION OVER A REAL INPUT, so a click on it must reach the box. */}
      {unit && (
        <span aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
          {unit}
        </span>
      )}
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · ONE ITEM'S PRICE CELL
// ════════════════════════════════════════════════════════════════════════════════════════════════

const gbp = (pence: number): string => `£${(pence / 100).toFixed(2)}`

/**
 * ══ 🔴 ONE ITEM'S PRICE IN ONE COLUMN — COMPUTED, TYPED, OR BEING TYPED ═══════════════════════════
 *
 * Three states, and the brief's shapes for each:
 *   • COMPUTED  — the rule's answer, normal weight. Pressing it starts typing one.
 *   • TYPED     — a blue outlined box with a ×. The × goes back to the rule (it DELETES the row; a
 *                 £0 would be a typed price of zero, which is a different and real instruction).
 *   • EDITING   — a text box, committed on blur or Enter, abandoned on Escape.
 *
 * 🔴 THE COMPUTED FIGURE IS `priceForItem`, THE FUNCTION THE SUBMIT ROUTE CHARGES WITH. Not a local
 * multiply, and not a number the server sent — the SAME pure function, given the same setup. That is
 * what makes the price on this screen a promise rather than an estimate.
 *
 * ⚠️ IT IS A BUTTON, NOT AN `onClick` ON A SPAN. An operator tabs this grid on an iPad with a
 * keyboard; a span is not reachable and gives no focus ring.
 */
export function PriceCell({
  menuPrice, setup, itemId, typed, onType, onClear, disabled, label, grey, height, showDiff,
}: {
  /** The MENU price, in pounds. */
  menuPrice: number
  /** The setup to compute under. Null ⇒ show the menu price, flat. */
  setup: PriceSetup | null
  itemId: string
  /** This item's typed price in POUNDS, or null/undefined for "the rule decides". */
  typed: number | null | undefined
  onType: (price: number) => void
  onClear: () => void
  disabled?: boolean
  label: string
  /** Grey, not pressable — a type whose switch is off, where the menu price is simply the fact. */
  grey?: boolean
  /** The typed-price box / edit box height. Omitted ⇒ the sheet's `CONTROL_H`; the grid passes
   *  `GRID_TYPED_H`, because this box sits inside a 28px item row. */
  height?: number
  /**
   * 🔴 SHOW "(+£1.30)" AFTER THE PRICE (5 October 2026).
   * ⛔ OFF BY DEFAULT, AND THE STANDARD COLUMN NEVER PASSES IT. Standard IS the menu price, so the
   * difference there is always zero and the brackets would be permanently absent anyway — but making
   * it opt-in means the Standard column cannot start showing them because somebody changed a default.
   * ⚠️ THE DASHBOARD SHEET DOES NOT PASS IT EITHER, so the sheet is byte-identical.
   */
  showDiff?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const menuPence = toPence(menuPrice)
  const hasTyped = typed !== null && typed !== undefined
  const shownPence = priceForItem(menuPence, setup, itemId)
  /* ── 🔴 THE PRICE THE **RULE** WOULD GIVE, IGNORING ANY TYPED ENTRY (5 October 2026) ─────────────
   * `priceForItem` honours the typed price, so for a typed item it returns the typed value — which is
   * the right answer for display and the wrong one for "is what you just typed the same as the
   * calculated price?". `applyPriceRule` is the rule alone, which is the comparison this cell needs
   * in two places: the no-op guard below, and the difference in brackets. */
  const rulePence = applyPriceRule(menuPence, setup)

  if (grey || !setup) {
    return (
      <span className="text-sm text-slate-400 tabular-nums" title={label}>{gbp(menuPence)}</span>
    )
  }

  if (editing) {
    const commit = () => {
      const next = cleanTypedPrice(draft)
      setEditing(false)
      /* ⚠️ A BLANK BOX CLEARS, which is the same instruction as the ×. An operator who selects the
       * number and deletes it means "stop typing a price for this one". */
      if (next === null) { if (hasTyped) onClear(); return }

      /* ══ 🔴 A NO-OP PRESS MUST CREATE NOTHING (5 October 2026) ═══════════════════════════════════
       * THE BUG: this read `if (toPence(next) !== toPence(typed ?? NaN)) onType(next)`. On an UNTYPED
       * cell `typed` is null, so the comparison was against **NaN** — which is unequal to everything
       * — and pressing a price and clicking away, changing nothing, stored a typed price identical to
       * the calculated one. The operator got a blue box they never asked for, on a cell they only
       * looked at, and the only way back was the ×. In a grid of forty prices that is a trap you walk
       * into by scrolling.
       *
       * 🔴 THE COMPARISON IS AGAINST THE **CALCULATED** PRICE, NOT AGAINST `typed`. That is what makes
       * both of Dominic's cases fall out of one rule:
       *   • press and leave unchanged  ⇒ equals the rule ⇒ nothing is created;
       *   • type the rule's own number ⇒ equals the rule ⇒ nothing is created, and an existing typed
       *     price is CLEARED, because the operator has just said "the rule is right for this one".
       * ⚠️ IN PENCE, THROUGH `toPence`. Comparing pounds as floats is how `11.50` and the rule's own
       * `11.5` come out unequal — the trap §70.9 is built around.
       * ⛔ AND ESCAPE STILL ABANDONS WITHOUT COMMITTING — see the key handler. */
      if (toPence(next) === rulePence) { if (hasTyped) onClear(); return }
      if (toPence(next) !== toPence(typed ?? NaN)) onType(next)
    }
    return (
      <span className="relative inline-flex w-full min-w-0 items-stretch text-sm">
        <span aria-hidden="true"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">£</span>
        <input ref={inputRef} type="text" inputMode="decimal" aria-label={label}
          value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
            /* ⚠️ ESCAPE ABANDONS. Without it the only way out of a cell you opened by mistake is to
             * blur it, which COMMITS — and in a grid of forty prices that is a real hazard. */
            if (e.key === 'Escape') { setEditing(false) }
          }}
          style={styleFor(height)}
          className={`w-full min-w-0 pl-5 text-center tabular-nums ${CONTROL_BOX}`} />
      </span>
    )
  }

  /* ══ 🔴 THE DIFFERENCE FROM THE MENU PRICE, IN BRACKETS (5 October 2026) ═══════════════════════
   * "(+£1.30)" / "(−£1.00)", in the SAME cell, smaller and lighter, against the **MENU** price —
   * never against the rule, and never against another type.
   *
   * 🔴 ALWAYS IN POUNDS, EVEN FOR A % RULE. Dominic: "always in pounds". "+10%" is already on the
   * Amount row; what an operator cannot do in their head is what 10% of £11.50 is, and that is the
   * number that reaches a customer. A percentage repeated here would restate the rule and answer
   * nothing.
   * ⛔ NOTHING WHEN EQUAL. A cell reading "(+£0.00)" is noise on every item a rule happens not to
   * move, and on a 40-item menu that is most of them.
   * ⚠️ IT SHOWS FOR A TYPED PRICE TOO, which is the case it matters most for: a typed £13 against a
   * £10 menu item is "+£3.00" whatever the rule says.
   * ⚠️ `toPounds` BOTH SIDES, NEVER `/100`. The difference is computed in PENCE and converted once —
   * `(1325 - 1000) / 100` and `13.25 - 10` are not the same number in a double. §70.9's rule.
   * ⛔ AND IT IS NOT RENDERED IN THE STANDARD COLUMN AT ALL: that column IS the menu price, so the
   * difference is always zero there. The grid passes `showDiff` only for a type column. */
  const diffPence = shownPence - menuPence
  const diff = showDiff && diffPence !== 0
    ? `(${diffPence > 0 ? '+' : '−'}£${toPounds(Math.abs(diffPence)).toFixed(2)})`
    : null

  if (hasTyped) {
    return (
      /* 🔴 THE BLUE OUTLINED BOX. Blue is the colour this product already uses for "you changed this
       * here" — the dashboard card's THIS EVENT tag is `text-blue-700 bg-blue-100` — so a typed price
       * and a per-event tag say the same thing in the same colour. */
      <span className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 pl-2 pr-1"
        style={styleFor(height)}>
        <button type="button" disabled={disabled} aria-label={`${label} — change`}
          onClick={() => { setDraft(String(typed)); setEditing(true) }}
          className="text-sm font-semibold text-blue-800 tabular-nums disabled:text-slate-400">
          {gbp(toPence(typed))}
        </button>
        {diff && <span className="shrink-0 text-[10px] text-blue-600 tabular-nums">{diff}</span>}
        {/* ⚠️ THE × IS ITS OWN BUTTON WITH ITS OWN LABEL. One control doing both would make "go back
          * to the rule" an accident waiting on a mis-tap. */}
        <button type="button" disabled={disabled} aria-label={`${label} — use the rule instead`}
          onClick={onClear} title="Back to the rule"
          className="w-5 h-5 shrink-0 rounded text-blue-500 hover:bg-blue-100 disabled:text-slate-300 leading-none">
          ×
        </button>
      </span>
    )
  }

  return (
    /* ⚠️ THE DIFFERENCE IS **OUTSIDE** THE BUTTON. Inside it, pressing the brackets would open the
     * editor — and an operator reading the difference is reading, not editing. */
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <button type="button" disabled={disabled} aria-label={`${label} — type a price`}
        onClick={() => { setDraft(toPounds(shownPence).toFixed(2)); setEditing(true) }}
        className="text-sm text-slate-900 tabular-nums rounded px-1 hover:bg-slate-100 disabled:text-slate-400 disabled:hover:bg-transparent">
        {gbp(shownPence)}
      </button>
      {diff && <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">{diff}</span>}
    </span>
  )
}
