'use client'
// components/shared/useDecimalBox.ts — A NUMBER BOX THAT TAKES "12,50" WHERE THE TRUCK'S LOCALE WRITES A DECIMAL COMMA
// (france-1, 22 October 2026; lib/decimal-input.ts).
//
// Manage's price boxes are `type="number"` inputs whose state is a NUMBER. A decimal-comma locale needs a text box (a
// number input drops "12,5" in most browsers) that keeps what was typed while the number it means is passed on. `box()`
// returns the props to spread where `type` / `value` / `onChange` were:
//   • a decimal-POINT locale (every English one): `{ type: 'number', value, onChange }` — the SAME three props, in the same
//     order, with the same values, so the box renders and behaves exactly as before;
//   • a decimal-COMMA locale: a text box with `inputMode="decimal"`; what it shows is the typed text while that text still
//     means the current value (so "12," survives), else the value written with a comma; `onChange` hands the parent the
//     normalised text ("12.50"), which its own parseFloat reads as it always did.
import { useState } from 'react'
import { decimalForInput, normaliseDecimal, usesDecimalComma } from '@/lib/decimal-input'

type Shown = string | number

export function useDecimalBox(locale: string | null | undefined) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const comma = usesDecimalComma(locale)
  const means = (text: string) => { const n = parseFloat(normaliseDecimal(text, locale)); return Number.isFinite(n) ? n : null }
  /** For an `<Input>` (onChange gets the string). */
  function box(key: string, value: Shown, onChange: (v: string) => void) {
    if (!comma) return { type: 'number' as const, value, onChange }
    const draft = drafts[key]
    const current = value === '' || value === null || value === undefined ? null : Number(value)
    const shown = draft !== undefined && (means(draft) === current || (draft.trim() === '' && current === null)) ? draft : decimalForInput(value, locale)
    return {
      type: 'text' as const, inputMode: 'decimal' as const, value: shown,
      onChange: (v: string) => { setDrafts(d => ({ ...d, [key]: v })); onChange(normaliseDecimal(v, locale)) },
    }
  }
  /** For a raw `<input>` (onChange gets the event); the parent reads `e.target.value` as before. */
  function rawBox(key: string, value: Shown, onChange: (e: { target: { value: string } }) => void) {
    if (!comma) return { type: 'number' as const, value, onChange }
    const b = box(key, value, v => onChange({ target: { value: v } }))
    return { type: b.type, inputMode: b.inputMode, value: b.value, onChange: (e: { target: { value: string } }) => b.onChange(e.target.value) }
  }
  return { box, rawBox, comma }
}
