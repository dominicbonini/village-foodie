'use client'
// components/manage/AddressFields.tsx — 🔴 AN ADDRESS, ENTERED THE WAY THE TRUCK'S COUNTRY WRITES ONE (address-formats-2,
// 21 October 2026; docs/address-formats-2-report.md). Every Manage entry form reads lib/address-formats.ts through here:
// which fields, in which order, which are required, their labels (messages `address.*`, keyed by field type and
// variant), their examples, the region dropdown, the postal-code check and the "Customers see:" line.
//
// ⚠️ GB AND THE US RENDER EXACTLY WHAT THEY DID: their formats have every `entry` flag off, so there is no asterisk, no
// live check, no "Customers see:" line, and the US State box is the free text box it was (now no longer than the
// list's longest code — still 2). scripts/address-formats-2.cjs renders both and compares.
import type { ReactNode } from 'react'
import { Input, Select } from '@/components/manage/primitives'
import { useOptionalCountrySettings } from '@/components/CountrySettingsProvider'
import {
  addressFormatOrDefault, fieldOf, isValidPostalCode, normalisePostalCode, postalLabelOf, regionOf, renderFirst,
  renderTemplate, regionDisplay, type AddressField, type AddressFormat, type LocalityLabel,
} from '@/lib/address-formats'
import { upperCasesPostcode } from '@/lib/copy/addressPlaceholders'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/address'

/** The truck's address format, from the country settings Manage is wrapped in (GB when there are none). */
export function useAddressFormat(): AddressFormat {
  return addressFormatOrDefault(useOptionalCountrySettings()?.addressFormat)
}

/** The words for a format's fields. */
export function useAddressWords(format: AddressFormat) {
  const t = useT('address')
  const locality = (fieldOf(format, 'locality') as AddressField).label as LocalityLabel
  const postal = postalLabelOf(format)
  return {
    t,
    postal: t(`label.${postal}`),
    postalInSentence: t(`inSentence.${postal}`),
    postalWithArticle: t(`withArticle.${postal}`),
    locality: t(`label.${locality}`),
    localityShort: t(`short.${locality}`),
    tradeLabel: t(`tradeLabel.${locality}`),
    basedIn: t(`basedIn.${locality}`),
    region: fieldOf(format, 'region') ? t(`label.${fieldOf(format, 'region')!.label}`) : null,
    suburb: fieldOf(format, 'suburb') ? t(`label.${fieldOf(format, 'suburb')!.label}`) : null,
    example: (example: string) => t('example', { example }),
  }
}

/** The warning under a postal code that does not have the format's shape — warn-only, never a block. Null when the
 *  format does not check, the box is empty, or the code is fine. */
export function usePostalWarning(format: AddressFormat, value: string | null | undefined): string | null {
  const w = useAddressWords(format)
  const v = String(value ?? '').trim()
  if (!format.entry.postalCheck || !v || isValidPostalCode(format, v)) return null
  return w.t('postalWarning', { article: w.postalWithArticle, example: format.postalCode.example })
}

/** A typed postal code as it is saved: tidied by the format's normaliser where the format checks it; as typed otherwise. */
export function postalCodeForSave(format: AddressFormat, value: string | null | undefined): string {
  const v = String(value ?? '')
  return format.entry.postalCheck ? normalisePostalCode(format, v) : v
}

/** The region box's value: a stored or typed region as the code in the list ("nsw" → "NSW", "Kerry" → "KY"). */
export const regionCodeOf = (format: AddressFormat, v: string | null | undefined): string => regionOf(format, v)?.code ?? ''

/** The line under a venue in a picker or a conflict (`entry.sublines`): the format's area line, or `legacy`. */
export function placeSubline(format: AddressFormat, p: { town?: string | null; suburb?: string | null; region?: string | null; postcode?: string | null }, legacy: string): string {
  if (format.entry.sublines !== 'area') return legacy
  return renderFirst(format.templates.area, { locality: p.town, suburb: p.suburb, region: regionDisplay(format, p.region), postalCode: p.postcode })
}

const SELECT = 'w-full border rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white border-slate-200'   // the compact text box

/** The region: a dropdown of the format's list (`entry.regionInput: 'select'`), or the free text box (the US). */
export function RegionInput({ format, value, onChange, onBlur, label, required, compact, className }: {
  format: AddressFormat; value: string; onChange: (v: string) => void; onBlur?: (v: string) => void
  label: string; required?: boolean
  /** The import review's cells: no label, the cell's own look (`className`) and height. */
  compact?: boolean; className?: string
}) {
  const w = useAddressWords(format)
  const list = format.regions?.list ?? []
  if (format.entry.regionInput === 'text') {
    const max = Math.max(...list.map(r => r.code.length))
    if (compact) return <input type="text" aria-label={label} value={value} onChange={e => onChange(e.target.value.toUpperCase().slice(0, max))} className={className ?? SELECT} style={{ minHeight: '48px' }} />
    return <Input label={label} value={value} onChange={v => onChange(v.toUpperCase().slice(0, max))} placeholder={format.examples.region ? w.example(format.examples.region) : undefined} />
  }
  // The app's own dropdown (components/shared/PriceControls.tsx): `appearance-none` and a FIXED height, because WebKit
  // ignores min-height on a <select> (23px where the text boxes are 41px).
  const select = (
    <div data-region-select className="w-full">
      <Select ariaLabel={label} value={regionCodeOf(format, value)} height={compact ? 48 : 41} className={`w-full ${className ?? ''}`}
        onChange={v => { onChange(v); onBlur?.(v) }}
        options={[{ value: '', label: w.t('regionChoose') }, ...list.map(r => ({ value: r.code, label: format.regions!.shownAs === 'name' ? r.name : r.code }))]} />
    </div>
  )
  if (compact) return select
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      {select}
    </div>
  )
}

/** The "Customers see:" line (`entry.customersSee`): the format's one-line address of what has been typed — the
 *  examples until anything is. */
export function CustomersSee({ format, venue, town, suburb, region, postcode, className = '' }: {
  format: AddressFormat; venue?: string | null; town?: string | null; suburb?: string | null; region?: string | null; postcode?: string | null; className?: string
}) {
  const w = useAddressWords(format)
  if (!format.entry.customersSee) return null
  const typed = [venue, town, suburb, region, postcode].some(v => String(v ?? '').trim())
  const ex = format.examples
  const line = typed
    ? renderTemplate(format.templates.line, { venue, locality: town, suburb, region: regionDisplay(format, region) ?? region, postalCode: postcode })
    : renderTemplate(format.templates.line, { venue: ex.venue, locality: ex.locality, suburb: ex.suburb, region: ex.region, postalCode: format.postalCode.example })
  return (
    <p className={`text-xs text-slate-500 ${className}`} data-customers-see>
      {w.t('customersSee')} <span className="font-medium text-slate-700">{line}</span>
    </p>
  )
}

export interface EventAddressValue { address: string; town: string; suburb?: string | null; region?: string | null; postcode: string }

/**
 * Manage › Schedule › Add/Edit event: the address fields after the venue. Rendered INSIDE the form's two-column grid,
 * so each field is its own grid item, exactly as the GB and US fields always were.
 */
export function EventAddressFields({ format, value, venueName, onChange, addressLabel }: {
  format: AddressFormat
  value: EventAddressValue
  venueName: string
  onChange: (patch: Partial<EventAddressValue>) => void
  /** "Full address (optional)" — the form's own label for the street line. */
  addressLabel: string
}) {
  const w = useAddressWords(format)
  const warning = usePostalWarning(format, value.postcode)
  const marks = format.entry.requiredMarks
  const req = (k: AddressField['key']) => (marks && fieldOf(format, k)?.required) || undefined
  const upper = upperCasesPostcode(format)
  const postal = (
    <Input label={w.postal} value={value.postcode} required={req('postalCode')}
      onChange={v => onChange({ postcode: format.entry.postalCheck && upper ? v.toUpperCase() : v })}
      onBlur={format.entry.postalCheck ? () => onChange({ postcode: postalCodeForSave(format, value.postcode) }) : undefined}
      placeholder={w.example(format.postalCode.example)} />
  )
  // A checking format keeps the box and its warning in one grid item — always wrapped, so typing never remounts the box.
  const postalWithWarning: ReactNode = format.entry.postalCheck
    ? <div>{postal}{warning && <p className="text-xs text-amber-700 mt-1" data-postal-warning>{warning}</p>}</div>
    : postal
  const hasRegion = !!fieldOf(format, 'region')
  return (
    <>
      <div className="sm:col-span-2">
        <Input label={addressLabel} value={value.address} onChange={v => onChange({ address: v })} placeholder={w.example(format.examples.addressLine)} />
      </div>
      {fieldOf(format, 'suburb') && (
        <div>
          <Input label={w.suburb!} value={value.suburb ?? ''} required={req('suburb')} onChange={v => onChange({ suburb: v })}
            placeholder={format.examples.suburb ? w.example(format.examples.suburb) : undefined} />
        </div>
      )}
      <div>
        <Input label={w.locality} value={value.town} required={req('locality')} onChange={v => onChange({ town: v })} placeholder={w.example(format.examples.locality)} />
      </div>
      {hasRegion ? (
        // The region beside the postal code — the US "State | ZIP code" row (19 October 2026); a county name needs
        // the wider half.
        <div className={format.regions?.shownAs === 'name' ? 'grid grid-cols-2 gap-2' : format.entry.regionInput === 'select' ? 'grid grid-cols-[9rem_1fr] gap-2' : 'grid grid-cols-[5.5rem_1fr] gap-2'}>
          <RegionInput format={format} value={value.region ?? ''} onChange={v => onChange({ region: v })} label={w.region!} required={req('region')} />
          {postalWithWarning}
        </div>
      ) : postalWithWarning}
      {format.entry.customersSee && (
        <CustomersSee format={format} className="sm:col-span-2" venue={venueName} town={value.town} suburb={value.suburb} region={value.region} postcode={value.postcode} />
      )}
    </>
  )
}
