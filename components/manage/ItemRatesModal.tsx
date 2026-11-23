'use client'
// components/manage/ItemRatesModal.tsx — france-vat-1 (24 November 2026, docs/france-vat-1-report.md): the "Item rates" popup,
// opened from Manage › Payments › "Change item rates".
//
// Every dish, grouped by menu category in menu order, with a rate dropdown: "Default (x %)" (= no rate of its own, NULL), the
// country's quick rates where we know them (lib/item-rates.ts), and "Other…", which shows a number box checked exactly as the
// default-rate box is (lib/charge-settings.ts rateBoxToMilli, 0–30 %, up to 3 decimals, the truck's decimal mark). Each category
// header has "Set all". NOTHING IS SAVED UNTIL SAVE, and Save sends only the dishes that changed (`set_item_rates`).
// One layout everywhere — phone, iPad (the apps load this page), laptop, desktop: a centred panel that scrolls inside itself.
import { useMemo, useState } from 'react'
import { useCountrySettings } from '@/components/CountrySettingsProvider'
import { formatRateMilli } from '@/lib/order-charge-lines'
import { normaliseDecimal, decimalForInput } from '@/lib/decimal-input'
import { rateBoxToMilli } from '@/lib/charge-settings'
import { quickRatesFor } from '@/lib/item-rates'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/manageCharges'
import '@/lib/i18n/catalog/errorsManage'
import '@/lib/i18n/catalog/charges'

export interface ItemRateRow { id: string; name: string; category_id: string | null; tax_rate_milli: number | null }
export interface ItemRateData { categories: { id: string; name: string }[]; items: ItemRateRow[] }

/** One dropdown's state: the default (NULL), a quick rate, or "Other…" with its typed text. */
type Choice = { kind: 'default' } | { kind: 'rate'; milli: number } | { kind: 'other'; text: string }

const OTHER = 'other', DEFAULT = 'default'

export function ItemRatesModal({ data, defaultLabel, api, onClose, onSaved, showToast }: {
  data: ItemRateData
  /** "Default (10 %)" / "Default (No VAT)", worded by the card. */
  defaultLabel: string
  api: (action: string, extra?: Record<string, unknown>) => Promise<unknown>
  onClose: () => void
  onSaved: (data: ItemRateData) => void
  showToast: (msg: string, type?: 'success' | 'error') => void
}) {
  const cs = useCountrySettings()
  const t = useT('manageCharges')
  const tCharges = useT('charges')
  const tErr = useT('errorsManage') as unknown as (code: string, params?: Record<string, string>) => string
  const quick = quickRatesFor(cs.countryCode)
  const rateText = (milli: number) => tCharges('rate', { rate: decimalForInput(formatRateMilli(milli), cs.locale) })

  const choiceOf = (milli: number | null): Choice => milli === null ? { kind: 'default' }
    : quick.includes(milli) ? { kind: 'rate', milli } : { kind: 'other', text: decimalForInput(formatRateMilli(milli), cs.locale) }
  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(data.items.map(i => [i.id, choiceOf(i.tax_rate_milli)])))
  const [setAllOther, setSetAllOther] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Categories in menu order, then the dishes with no (known) category under "Other items".
  const groups = useMemo(() => {
    const known = new Set(data.categories.map(c => c.id))
    const list = data.categories.map(c => ({ key: c.id, name: c.name, items: data.items.filter(i => i.category_id === c.id) })).filter(g => g.items.length > 0)
    const rest = data.items.filter(i => !i.category_id || !known.has(i.category_id))
    if (rest.length) list.push({ key: '__other', name: t('itemRates.otherItems'), items: rest })
    return list
  }, [data, t])

  /** A choice → its stored value: null, a rate, or a refusal code for a bad "Other…" box. */
  const valueOf = (c: Choice): number | null | 'charges_rate_range' | 'charges_rate_decimals' => {
    if (c.kind === 'default') return null
    if (c.kind === 'rate') return c.milli
    const v = rateBoxToMilli(normaliseDecimal(c.text, cs.locale))
    if (v === null || v === 'bad') return 'charges_rate_range'
    if (v === 'decimals') return 'charges_rate_decimals'
    return v
  }
  const selectValue = (c: Choice) => (c.kind === 'default' ? DEFAULT : c.kind === 'other' ? OTHER : String(c.milli))
  const fromSelect = (v: string, prevText = ''): Choice => (v === DEFAULT ? { kind: 'default' } : v === OTHER ? { kind: 'other', text: prevText } : { kind: 'rate', milli: Number(v) })

  const options = (
    <>
      <option value={DEFAULT}>{defaultLabel}</option>
      {quick.map(m => <option key={m} value={String(m)}>{rateText(m)}</option>)}
      <option value={OTHER}>{t('otherRate')}</option>
    </>
  )

  const save = async () => {
    const changes: { id: string; rate: number | null }[] = []
    for (const i of data.items) {
      const v = valueOf(choices[i.id] ?? { kind: 'default' })
      if (typeof v === 'string') { setError(tErr(v)); return }
      if (v !== i.tax_rate_milli) changes.push({ id: i.id, rate: v })
    }
    if (changes.length === 0) { onClose(); return }
    setSaving(true); setError(null)
    try {
      const res = await api('set_item_rates', { rates: changes }) as Partial<ItemRateData> | null
      if (res?.items && res?.categories) onSaved({ items: res.items, categories: res.categories })
      showToast(t('itemRates.saved'), 'success')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'))
    } finally { setSaving(false) }
  }

  const selectCls = 'rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400'
  const boxCls = 'w-20 rounded-xl border border-slate-200 px-2 py-1.5 text-sm text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-400'

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="item-rates-title" data-item-rates-modal>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 id="item-rates-title" className="text-lg font-semibold text-slate-900">{t('itemRates.title')}</h3>
            <p className="text-sm text-slate-600 mt-0.5">{t('itemRates.intro')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('itemRates.close')} data-item-rates-close
            className="flex-shrink-0 w-9 h-9 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl font-bold flex items-center justify-center">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {groups.length === 0 && <p className="text-sm text-slate-500 py-4">{t('itemRates.noItems')}</p>}
          {groups.map(g => (
            <section key={g.key} className="py-2" data-item-rates-category={g.name}>
              <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-100">
                <h4 className="text-sm font-bold text-slate-800">{g.name}</h4>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">{t('itemRates.setAll')}</span>
                  <select aria-label={`${t('itemRates.setAll')} · ${g.name}`} className={selectCls} value="" data-item-rates-set-all
                    onChange={e => {
                      const v = e.target.value
                      if (!v) return
                      if (v === OTHER) { setSetAllOther(p => ({ ...p, [g.key]: p[g.key] ?? '' })); return }
                      setChoices(p => ({ ...p, ...Object.fromEntries(g.items.map(i => [i.id, fromSelect(v)])) }))
                    }}>
                    <option value="" disabled>—</option>
                    {options}
                  </select>
                  {setAllOther[g.key] !== undefined && (
                    <input type="text" inputMode="decimal" aria-label={`${t('itemRates.setAll')} · ${g.name} · ${t('otherRate')}`} className={boxCls}
                      value={setAllOther[g.key]} placeholder="0" data-item-rates-set-all-other
                      onChange={e => { const text = e.target.value; setSetAllOther(p => ({ ...p, [g.key]: text })) }}
                      onBlur={() => {
                        const text = setAllOther[g.key] ?? ''
                        if (text.trim() === '') return
                        setChoices(p => ({ ...p, ...Object.fromEntries(g.items.map(i => [i.id, { kind: 'other', text } as Choice])) }))
                      }} />
                  )}
                </div>
              </div>
              <ul className="divide-y divide-slate-50">
                {g.items.map(i => {
                  const c = choices[i.id] ?? { kind: 'default' }
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-2" data-item-rate-row={i.name}>
                      <span className="min-w-0 text-sm text-slate-800 break-words">{i.name}</span>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        <select aria-label={t('itemRates.rateAria', { item: i.name })} className={selectCls} value={selectValue(c)} data-item-rate-select
                          onChange={e => { const v = e.target.value; setChoices(p => ({ ...p, [i.id]: fromSelect(v, c.kind === 'other' ? c.text : '') })) }}>
                          {options}
                        </select>
                        {c.kind === 'other' && (
                          <span className="flex items-center gap-1">
                            <input type="text" inputMode="decimal" aria-label={t('itemRates.rateAria', { item: i.name })} className={boxCls}
                              value={c.text} placeholder="0" data-item-rate-other
                              onChange={e => { const text = e.target.value; setChoices(p => ({ ...p, [i.id]: { kind: 'other', text } })) }} />
                            <span className="text-sm text-slate-600">%</span>
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-slate-100">
          {error && <p className="text-xs text-red-600 mb-2" role="alert">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200" data-item-rates-cancel>{t('itemRates.cancel')}</button>
            <button type="button" onClick={() => { void save() }} disabled={saving} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-60" data-item-rates-save>{t('itemRates.save')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
