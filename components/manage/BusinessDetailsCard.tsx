'use client'
// components/manage/BusinessDetailsCard.tsx — france-records-1 (24 November 2026, docs/france-records-1-report.md): Manage › Settings ›
// Business details. Every field optional; each saves when its box loses focus, through `update_business_details`, which runs
// lib/business-details.ts again on the server. The owner (or an admin) can edit; everyone else sees the values, read-only.
//   • legal name; registered address (the truck's address format — no "Customers see" line: customers never see it);
//   • registration number — France "SIREN or SIRET" (Luhn), GB "Company number" (8 characters), elsewhere "Registration number";
//   • VAT number — EU countries: the country's prefix and pattern (format only);
//   • VAT regime — France only. Picking "franchise en base" shows a short note: new orders are sold at 0 % with « TVA non applicable »
//     on the receipts (france-receipts-1); the truck's saved rates are never changed.
// Not on customer pages, receipts or emails (that comes later, after a mockup). One layout on phone, iPad, laptop and desktop.
import { useState } from 'react'
import { Card, Input } from './primitives'
import { useCountrySettings } from '@/components/CountrySettingsProvider'
import { EventAddressFields, useAddressFormat } from '@/components/manage/AddressFields'
import { checkBusinessDetails, euVatRuleOf, hasVatRegime, registrationKindOf, VAT_REGIMES, type BusinessDetailsInput, type RegisteredAddress } from '@/lib/business-details'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/manageSettings'
import '@/lib/i18n/catalog/errorsManage'

export interface BusinessTruck {
  country?: string | null
  legal_name?: string | null
  registered_address?: RegisteredAddress | null
  registration_number?: string | null
  vat_number?: string | null
  vat_regime?: string | null
  tax_rate_milli?: number | null
  base_region_code?: string | null
}

const REGIME_KEY: Record<string, 'franchise' | 'reelSimplifie' | 'reelNormalMonthly' | 'reelNormalQuarterly'> = {
  franchise: 'franchise', reel_simplifie: 'reelSimplifie', reel_normal_monthly: 'reelNormalMonthly', reel_normal_quarterly: 'reelNormalQuarterly',
}

export function BusinessDetailsCard<T extends BusinessTruck>({ truck, api, showToast, onTruckUpdate, readOnly = false }: {
  truck: T
  api: (action: string, extra?: Record<string, unknown>) => Promise<{ truck?: Partial<T> } | null | undefined>
  showToast: (msg: string, kind?: 'success' | 'error') => void
  onTruckUpdate: (partial: Partial<T>) => void
  readOnly?: boolean
}) {
  const cs = useCountrySettings()
  const t = useT('manageSettings')
  const tErr = useT('errorsManage') as unknown as (code: string, params?: Record<string, string>) => string
  const format = useAddressFormat()
  const country = truck.country ?? cs.countryCode
  const kind = registrationKindOf(country)
  const vatRule = euVatRuleOf(country)
  const showRegime = hasVatRegime(country)
  const [legalName, setLegalName] = useState(truck.legal_name ?? '')
  const [address, setAddress] = useState({ address: truck.registered_address?.address ?? '', town: truck.registered_address?.town ?? '', suburb: truck.registered_address?.suburb ?? '', region: truck.registered_address?.region ?? '', postcode: truck.registered_address?.postcode ?? '' })
  const [registration, setRegistration] = useState(truck.registration_number ?? '')
  const [vatNumber, setVatNumber] = useState(truck.vat_number ?? '')
  const [regime, setRegime] = useState(truck.vat_regime ?? '')
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  const save = async (field: keyof BusinessDetailsInput, value: unknown) => {
    if (readOnly) return
    const input = { [field]: value } as BusinessDetailsInput
    const r = checkBusinessDetails(input, country)
    if (!r.ok) { setErrors(e => ({ ...e, [field]: tErr(r.code, r.params) })); return }
    setErrors(e => ({ ...e, [field]: null }))
    try {
      const res = await api('update_business_details', input as Record<string, unknown>)
      if (res?.truck) onTruckUpdate(res.truck)
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('business.saveFailed')
      setErrors(x => ({ ...x, [field]: msg })); showToast(msg, 'error')
    }
  }

  const regLabel = kind === 'siren' ? t('business.registration.siren') : kind === 'gb_company' ? t('business.registration.gb') : t('business.registration.other')
  const regHint = kind === 'siren' ? t('business.registration.sirenHint') : kind === 'gb_company' ? t('business.registration.gbHint') : t('business.registration.otherHint')
  const taxLabel = cs.taxLabel
  // france-receipts-1: franchise en base is applied to every new order (0 %, « TVA non applicable » on the receipts), so the note now
  // says so whenever it is chosen — the old "you may want to set your VAT to 0 %" note is gone (the saved rates are left untouched).
  const franchiseNote = showRegime && regime === 'franchise'

  return (
    <Card className="p-4" >
      <div data-business-details>
        <h3 className="text-base font-bold text-slate-800">{t('business.title')}</h3>
        <p className="text-xs text-slate-500 mt-0.5 mb-3">{t('business.intro')}</p>
        {readOnly && <p className="text-xs text-slate-500 mb-3" data-business-readonly>{t('business.ownerOnly')}</p>}
        <fieldset disabled={readOnly} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Input label={t('business.legalName.label')} hint={t('business.legalName.hint')} value={legalName} maxLength={200}
              onChange={setLegalName} onBlur={() => { void save('legalName', legalName) }} error={errors.legalName ?? undefined} />
          </div>
          <div className="sm:col-span-2">
            <p className="block text-xs font-bold text-slate-600">{t('business.address.label')}</p>
            <p className="text-slate-400 text-xs mb-1">{t('business.address.hint')}</p>
          </div>
          <div className="contents" onBlur={() => { void save('registeredAddress', address) }} data-business-address>
            <EventAddressFields format={format} value={address} venueName="" customersSee={false} addressLabel={t('business.address.street')}
              onChange={patch => setAddress(a => ({ ...a, ...patch, suburb: patch.suburb ?? a.suburb, region: patch.region ?? a.region }))} />
          </div>
          {errors.registeredAddress && <p className="text-xs text-red-500 sm:col-span-2">{errors.registeredAddress}</p>}
          <Input label={regLabel} hint={regHint} value={registration} maxLength={40} inputMode={kind === 'siren' ? 'numeric' : undefined}
            onChange={setRegistration} onBlur={() => { void save('registrationNumber', registration) }} error={errors.registrationNumber ?? undefined} />
          <Input label={t('business.vat.label', { label: taxLabel })} value={vatNumber} maxLength={40}
            hint={vatRule ? t('business.vat.euHint', { prefix: vatRule.prefix, example: vatRule.example }) : t('business.vat.hint')}
            onChange={setVatNumber} onBlur={() => { void save('vatNumber', vatNumber) }} error={errors.vatNumber ?? undefined} />
          {showRegime && (
            <div className="sm:col-span-2" data-business-regime>
              <label className="block text-xs font-bold text-slate-600 mb-1">{t('business.regime.label')}</label>
              <select value={regime} aria-label={t('business.regime.label')}
                onChange={e => { const v = e.target.value; setRegime(v); void save('vatRegime', v) }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                <option value="">{t('business.regime.none')}</option>
                {VAT_REGIMES.map(r => <option key={r} value={r}>{t(`business.regime.${REGIME_KEY[r]}`)}</option>)}
              </select>
              <p className="text-slate-400 text-xs mt-0.5">{t('business.regime.hint')}</p>
              {errors.vatRegime && <p className="text-xs text-red-500 mt-1">{errors.vatRegime}</p>}
              {franchiseNote && <p className="text-xs text-amber-700 mt-1" data-franchise-note>{t('business.regime.franchiseNote')}</p>}
            </div>
          )}
        </fieldset>
      </div>
    </Card>
  )
}
