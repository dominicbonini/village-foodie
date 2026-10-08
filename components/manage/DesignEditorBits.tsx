'use client'
// components/manage/DesignEditorBits.tsx — the toolbar's small controls, and the popovers.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THESE ARE SEPARATE FROM `DesignEditor.tsx`
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `DesignEditor.tsx` is the one thing on the screen that knows what a LAYOUT is. Everything in this
// file knows only about a value and a callback — a number with a minus and a plus, a colour with
// swatches, a panel that closes when you click outside it. Keeping them apart is what stops the editor
// growing a second copy of "a stepper, but for the band radius this time".
//
// ⚠️ EVERY LABEL HERE IS SMALL UPPERCASE, which is the brief's toolbar and is also load-bearing: the
// toolbar sits directly above the picture, so the labels have to read as labels at a glance and not
// compete with the design underneath. The class is `TOOL_LABEL` and there is one of it.

import { useCallback, useEffect, useId, useRef, useState } from 'react'

/** The small uppercase label above every toolbar control. */
export const TOOL_LABEL = 'block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1 whitespace-nowrap'

/** The toolbar's own select/input styling. ⚠️ `h-8` on everything, so the row has one height. */
export const TOOL_INPUT = 'h-8 border border-slate-200 rounded-lg px-2 text-sm bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-400'

/** A toolbar button: Bold, Capitals, the alignment icons, Effects, Advanced. */
export const TOOL_BTN = 'h-8 px-2 inline-flex items-center justify-center gap-1 rounded-lg border text-sm font-bold'
export const TOOL_BTN_OFF = 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
export const TOOL_BTN_ON = 'border-orange-500 text-orange-700 bg-orange-50'

/** One labelled cell of the toolbar. ⚠️ `shrink-0` so a cell wraps whole rather than squeezing. */
export function ToolCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0">
      <span className={TOOL_LABEL}>{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

/**
 * − value + .
 *
 * 🔴 A STEPPER AND NOT A NUMBER FIELD, because this is the control an operator uses most and a number
 * field asks them to select-all-and-retype to change a font size by two. The value is still typeable:
 * the middle is an input.
 * ⚠️ THE TYPED VALUE IS ONLY APPLIED WHEN IT PARSES. An empty field during editing must not write 0
 * into the design and collapse the box to the minimum font — so a blank or non-numeric entry is kept
 * on screen and not committed.
 */
export function Stepper({ value, onChange, min, max, step = 1, suffix, width = 'w-14', minusLabel, plusLabel }: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
  width?: string
  /* ══ ⚠️ THE TWO BUTTONS CAN SAY WHAT THEY CHANGE (10 October 2026) ══════════════════════════════
   * "Text size" shows `A−` and `A+`, which says "letters" in two characters. ⛔ DEFAULTED TO THE BARE
   * SIGNS so every other stepper in the product is untouched — row spacing and a band's padding are
   * not letters and would be lying if they said so. */
  minusLabel?: string
  plusLabel?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)))
  const shown = draft ?? String(value)
  return (
    <>
      <button type="button" aria-label="Less"
        className={`${TOOL_BTN} ${TOOL_BTN_OFF} w-8`}
        onClick={() => onChange(clamp(value - step))}>{minusLabel ?? '−'}</button>
      <input
        inputMode="numeric"
        value={shown}
        onChange={e => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(clamp(n))
        }}
        onBlur={() => setDraft(null)}
        className={`${TOOL_INPUT} ${width} text-center`}
      />
      {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
      <button type="button" aria-label="More"
        className={`${TOOL_BTN} ${TOOL_BTN_OFF} w-8`}
        onClick={() => onChange(clamp(value + step))}>{plusLabel ?? '+'}</button>
    </>
  )
}

/** A labelled slider, for the Advanced panel. */
export function Slider({ label, value, onChange, min, max, step = 1, hint, format }: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  hint?: string
  format?: (v: number) => string
}) {
  const id = useId()
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs font-bold text-slate-600">{label}</label>
        <span className="text-xs text-slate-400 tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-orange-500" />
      {hint && <p className="text-[11px] text-slate-400 leading-snug">{hint}</p>}
    </div>
  )
}

/**
 * ══ 🔴 THE COLOUR CONTROL — AND IT IS NEVER AN EMPTY BOX ══════════════════════════════════════════
 *
 * ⛔ THE BUG THIS FIXES, AND IT WAS IN BOTH OLD SCREENS. The colour control was a bare
 * `<input type="color">`, which on Safari renders as an EMPTY WELL until the operator opens it — so a
 * design whose date is white showed a blank rectangle where its colour should be, and a truck checking
 * "what colour is my date?" could not tell. The swatch below is a real div filled with the real value,
 * and the native picker is a second, deliberate step behind "More…".
 *
 * ⚠️ THE SWATCHES ARE THE COLOURS A POSTER ACTUALLY USES: white, near-black, and the warm/cool pair
 * that read on a photograph. They are not a palette; they are the shortcuts.
 */
export const COLOUR_SWATCHES = [
  '#ffffff', '#0b0b0b', '#f97316', '#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#a855f7',
] as const

export function ColourField({ value, onChange, label }: {
  value: string
  onChange: (hex: string) => void
  label?: string
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-1">
      {COLOUR_SWATCHES.map(c => (
        <button key={c} type="button" aria-label={c}
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-md border-2 ${value.toLowerCase() === c ? 'border-orange-500' : 'border-slate-200'}`}
          style={{ backgroundColor: c }} />
      ))}
      {/* 🔴 THE CURRENT COLOUR IS DRAWN BY US, and the native input sits invisibly on top of it. The
        * operator always SEES the colour, and clicking it still opens the system picker — so "never an
        * empty box" costs nothing in function. */}
      <span className="relative inline-block w-8 h-6 rounded-md border-2 border-slate-300 overflow-hidden"
        style={{ backgroundColor: value }}>
        <input id={id} type="color" value={value}
          aria-label={label ? `${label} — choose any colour` : 'Choose any colour'}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      </span>
    </div>
  )
}

/** A colour that can be off. ⚠️ Off is `null`, not '#000000' — "no band" is a real state. */
export function OptionalColourRow({ label, value, onChange, hint }: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  hint?: string
}) {
  return (
    <div className="mb-3">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600 mb-1">
        <input type="checkbox" checked={value !== null}
          onChange={e => onChange(e.target.checked ? '#000000' : null)} />
        {label}
      </label>
      {value !== null && <ColourField value={value} onChange={onChange} label={label} />}
      {hint && <p className="text-[11px] text-slate-400 leading-snug mt-0.5">{hint}</p>}
    </div>
  )
}

/** A switch. ⚠️ `aria-pressed`, so a screen reader and the harness can both read its state. */
/**
 * ══ 🔴 THE KNOB SITS **INSIDE** THE TRACK — REPORTED BY DOMINIC, 9 OCTOBER 2026 ═══════════════════
 *
 * ⛔ IT WAS POSITIONED BY A TRANSFORM FROM AN `auto` LEFT EDGE:
 *
 *     <span className="absolute top-0.5 w-4 h-4 … translate-x-4 / translate-x-0.5" />
 *
 * 🔴 `absolute` WITH **NO `left`** USES THE ELEMENT'S *STATIC POSITION*, and a static position is a
 * property of the inline formatting context the element would have had — not a reliable 0. The knob
 * is the only child of an empty `block` span, so where its static position lands depends on the
 * engine's line box, and in Safari it resolved outside the track's left edge; the `translate-x-4` then
 * carried it out the other side. **A box that is positioned relative to "wherever it would have been"
 * is not positioned at all when there is nothing to be relative to.**
 *
 * ⚠️ SO BOTH EDGES ARE NOW STATED, AND NOTHING IS TRANSFORMED. `left-0.5` when off and `right-0.5`
 * when on: a 36 × 20 track, a 16px knob, 2px of clearance at whichever end it is at. ⛔ `left-auto`
 * IS WRITTEN OUT ON THE ON STATE even though Tailwind's `right-0.5` would usually be enough — with
 * both `left` and `right` set and a fixed width, the one that wins is writing-direction dependent, and
 * saying `left: auto` removes the question.
 * ⚠️ IT STILL ANIMATES: `transition-all` over `left`/`right` is the same half-second as the transform.
 */
export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} aria-label={label} className="shrink-0">
      <span className={`relative block h-5 w-9 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
        <span data-switch-knob
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-auto right-0.5' : 'left-0.5 right-auto'}`} />
      </span>
    </button>
  )
}

/** A checkbox row inside a popover or panel. */
export function CheckRow({ label, checked, onChange, hint }: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <div className="mb-2">
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="min-w-0">{label}</span>
      </label>
      {hint && <p className="text-[11px] text-slate-400 leading-snug ml-6">{hint}</p>}
    </div>
  )
}

/**
 * ══ 🔴 THE POPOVER — ANCHORED, AND IT CLOSES ON AN OUTSIDE CLICK OR Escape ════════════════════════
 *
 * ⚠️ `position: absolute` INSIDE A `relative` WRAPPER, not a fixed overlay. The Effects panel belongs
 * to the button that opened it; a centred modal would take the operator away from the picture they are
 * judging the effect against, which is the one thing they need to see while using it.
 *
 * ⛔ IT IS CONSTRAINED TO THE VIEWPORT WIDTH (`max-w-[min(20rem,calc(100vw-2rem))]`) BECAUSE THIS
 * TOOLBAR WRAPS. A fixed 20rem panel opened from a button near the right edge of a 390px phone pushes
 * the page sideways — and "no horizontal page scroll at any width" is an explicit requirement of this
 * screen, so a popover is exactly where it would be broken first.
 */
export function Popover({ open, onClose, title, subtitle, children, align = 'left' }: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const close = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = ref.current
      if (el && e.target instanceof Node && !el.contains(e.target)) close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    /* ⚠️ `pointerdown`, NOT `click`. A click fires after the mouse is released, which on a control
     * inside the panel that re-renders the tree can arrive at a different element than the one pressed
     * — and the panel would close while the operator was dragging a slider inside it. */
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  if (!open) return null
  return (
    <div ref={ref}
      className={`absolute z-40 top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} w-80 max-w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white shadow-xl p-4 text-left`}>
      <p className="text-sm font-black text-slate-900">{title}</p>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5 mb-3 leading-snug">{subtitle}</p>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  )
}

/** A small uppercase group heading inside the Advanced panel. */
export function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-4 mb-2 first:mt-0">{children}</p>
  )
}
