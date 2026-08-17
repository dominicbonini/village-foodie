'use client'

// ── THE ONE CUISINE CONTROL ────────────────────────────────────────────────────────────────────────
// 🔴 ONE FIELD HAD TWO SHAPES. The signup wizard offered a dropdown from the canonical list, up to three
// choices, with "Other…" revealing free text. Settings offered:
//     <Input label="Cuisine type" placeholder="e.g. Italian, Thai, Burgers" />
// a bare text box, so the value a truck went live with could be re-typed into anything — including a
// typo that becomes a PUBLIC filter option, because the discovery map derives its cuisine filter from
// whatever these strings contain (hooks/useVillageData.ts). This component is the wizard's control,
// lifted out of components/DemoGetStarted.tsx, so both surfaces offer one control with one list.
// lib/cuisines.ts already said this was coming: "shared by the signup wizard … and — in a later diff —
// Settings, whose cuisine input is currently free-text". This is that diff.
//
// ── 🔴 THE STORAGE FORMAT IS NOT NEGOTIABLE, AND IT IS COMMA-SPACE ────────────────────────────────
// `resolveCuisines(...).join(', ')` — the exact expression the wizard has always submitted. "Thai, Asian",
// NOT "Thai,Asian". The discovery filter splits on ',' and then TRIMS each part, so both would read back,
// but only one round-trips byte-identically through this component, and a settings save must never
// rewrite a stored value it was not asked to change.
//
// ── ⚠️ AN OFF-LIST VALUE IS PRESERVED, NEVER DROPPED ───────────────────────────────────────────────
// 🔴 THIS IS THE FAILURE THE WHOLE DESIGN IS SHAPED AROUND. Settings has been free text, so a truck may
// hold a cuisine that is not one of the canonical 26. A plain <select> whose value matches no <option>
// renders as the FIRST option — here "Choose a cuisine…", whose value is '' — and one save would write
// that emptiness over the truck's real cuisine, removing it from its own filter on the public map.
// `storedToCuisineSlots` prevents that by construction: an unrecognised value is loaded into an "Other"
// slot carrying its original text, so it is VISIBLE, EDITABLE and resolves back to itself unchanged.
// No new list plumbing, no injected pseudo-option — it reuses the escape hatch the wizard already had.
import { CUISINES, CUISINE_OTHER } from '@/lib/cuisines'

/** One row of the control: a dropdown value, plus the free text an "Other" row carries. */
export type CuisineSlot = { value: string; other: string }

/** The wizard's cap, kept so both surfaces offer the same number of rows. */
export const MAX_CUISINE_SLOTS = 3

/** Slots → the cuisines they mean. Deduped, blanks dropped, ORDER PRESERVED.
 *  Lifted verbatim from DemoGetStarted's `resolvedCuisines` so the two cannot drift. */
export function resolveCuisines(slots: CuisineSlot[]): string[] {
  const out: string[] = []
  for (const s of slots) {
    const v = s.value === CUISINE_OTHER ? s.other.trim() : s.value.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/** Slots → the string written to trucks.cuisine_type. THE join(', ') the wizard has always used. */
export function cuisinesToStored(slots: CuisineSlot[]): string {
  return resolveCuisines(slots).join(', ')
}

/** trucks.cuisine_type → slots, LOSSLESSLY.
 *  ⚠️ Splits on ',' and trims, matching the discovery filter's own reader. A part that is in CUISINES
 *  becomes a dropdown selection; anything else becomes an "Other" slot carrying that exact text, so
 *  `cuisinesToStored(storedToCuisineSlots(x))` returns x for every value this app can have stored —
 *  with ONE deliberate normalisation: separators become ', '. See the report's C1 arithmetic.
 *  ⚠️ Empty/null yields ONE empty slot, never zero, so the control always has a row to render. */
export function storedToCuisineSlots(raw: string | null | undefined): CuisineSlot[] {
  const parts = (raw || '').split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return [{ value: '', other: '' }]
  return parts.slice(0, MAX_CUISINE_SLOTS).map(p =>
    (CUISINES as readonly string[]).includes(p)
      ? { value: p, other: '' }
      : { value: CUISINE_OTHER, other: p }
  )
}

export function CuisinePicker({
  slots,
  onChange,
  idPrefix,
  firstSelectRef,
  invalid = false,
  disabled = false,
}: {
  /** CONTROLLED. The caller owns the array — the wizard needs it for validation and the emoji it
   *  derives at submit, and Settings needs it to build the string it saves. */
  slots: CuisineSlot[]
  onChange: (next: CuisineSlot[]) => void
  /** Distinguishes the two surfaces' input ids/labels on a page that may render other selects. */
  idPrefix: string
  /** The wizard focuses row 0 when validation fails. Optional — Settings does not. */
  firstSelectRef?: React.RefObject<HTMLSelectElement | null>
  /** Red border on the selects. The caller owns the message; this only colours the field. */
  invalid?: boolean
  disabled?: boolean
}) {
  const setValue = (i: number, value: string) =>
    onChange(slots.map((s, j) => (j === i ? { ...s, value } : s)))
  const setOther = (i: number, other: string) =>
    onChange(slots.map((s, j) => (j === i ? { ...s, other } : s)))
  const addSlot = () =>
    onChange(slots.length >= MAX_CUISINE_SLOTS ? slots : [...slots, { value: '', other: '' }])
  // ⚠️ NEVER REMOVES THE LAST ROW — the control must always have something to render, and a caller
  // that wants "no cuisine" clears the row rather than deleting it.
  const removeSlot = (i: number) =>
    onChange(slots.length <= 1 ? slots : slots.filter((_, j) => j !== i))

  const resolved = resolveCuisines(slots)

  return (
    <>
      <div className="flex flex-col gap-2">
        {slots.map((slot, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <select
              id={`${idPrefix}-cuisine-${i}`}
              ref={i === 0 ? firstSelectRef : undefined}
              value={slot.value}
              disabled={disabled}
              onChange={e => setValue(i, e.target.value)}
              className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 ${invalid ? 'border-red-400' : 'border-slate-200'}`}>
              <option value="">Choose a cuisine…</option>
              {CUISINES.map(c => <option key={c} value={c}>{c === CUISINE_OTHER ? 'Other…' : c}</option>)}
            </select>
            {slot.value === CUISINE_OTHER && (
              <input type="text" value={slot.other} disabled={disabled} onChange={e => setOther(i, e.target.value)}
                placeholder="Tell us your cuisine"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            )}
          </div>
        ))}
      </div>
      {slots.length < MAX_CUISINE_SLOTS && (
        <button type="button" onClick={addSlot} disabled={disabled}
          className="mt-2 text-xs font-bold text-orange-600 hover:text-orange-700">+ Choose another</button>
      )}
      {/* Chips — only once 2+ cuisines are chosen; each removable. */}
      {resolved.length >= 2 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {slots.map((slot, i) => {
            const label = slot.value === CUISINE_OTHER ? slot.other.trim() : slot.value.trim()
            if (!label) return null
            return (
              <span key={i} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                {label}
                <button type="button" aria-label={`Remove ${label}`} onClick={() => removeSlot(i)} disabled={disabled}
                  className="text-orange-400 hover:text-orange-700 leading-none">×</button>
              </span>
            )
          })}
        </div>
      )}
    </>
  )
}
