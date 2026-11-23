'use client'
// components/manage/DailyTotalsCsv.tsx — france-records-1 (24 November 2026, docs/france-records-1-report.md): Reports › For your
// accountant › "Daily totals by VAT rate (CSV)", with its own period picker.
// The presets follow the truck's French VAT regime (lib/accounts/periods.ts): franchise en base → two-month blocks; réel simplifié →
// the month; réel normal monthly → 1–10, 11–20, 21–end; réel normal quarterly → the month; no regime / not France → the month. A custom
// range is always there. The rows come from `get_daily_totals`; lib/accounts/daily-totals.ts holds every rule and writes the file.
import { useMemo, useState } from 'react'
import { useCountrySettings } from '@/components/CountrySettingsProvider'
import { periodKindFor, recentPeriods, defaultPeriod } from '@/lib/accounts/periods'
import { dailyTotals, dailyTotalsCsv, type DailyInput, type DailyWords } from '@/lib/accounts/daily-totals'
import { registrationKindOf } from '@/lib/business-details'
import { getLocalDateInTz } from '@/lib/time-utils'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/manageReports'
import '@/lib/i18n/catalog/manageSettings'

export interface DailyTotalsTruck {
  country?: string | null; timezone?: string | null; vat_regime?: string | null
  legal_name?: string | null; registration_number?: string | null; vat_number?: string | null
}
const REGIME_KEY: Record<string, string> = { franchise: 'franchise', reel_simplifie: 'reelSimplifie', reel_normal_monthly: 'reelNormalMonthly', reel_normal_quarterly: 'reelNormalQuarterly' }

export function DailyTotalsCsv({ truck, api, currency }: {
  truck: DailyTotalsTruck
  api: (action: string, extra?: Record<string, unknown>) => Promise<unknown>
  currency: string
}) {
  const cs = useCountrySettings()
  const t = useT('manageReports')
  const tS = useT('manageSettings')
  const country = truck.country ?? cs.countryCode
  const kind = periodKindFor(country, truck.vat_regime)
  const today = getLocalDateInTz(truck.timezone || cs.timezones?.[0] || 'UTC')
  const presets = useMemo(() => recentPeriods(kind, today, 6), [kind, today])
  const start = defaultPeriod(kind, today)
  const [choice, setChoice] = useState(`${start.from}|${start.to}`)
  const [from, setFrom] = useState(start.from)
  const [to, setTo] = useState(start.to)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = (v: string) => {
    setChoice(v)
    if (v !== 'custom') { const [f, tt] = v.split('|'); setFrom(f); setTo(tt) }
  }
  const words: DailyWords = {
    meta: { legalName: t('dailyCsv.meta.legalName'), registration: registrationKindOf(country) === 'siren' ? t('dailyCsv.meta.siren') : t('dailyCsv.meta.registration'),
      vatNumber: t('dailyCsv.meta.vatNumber'), vatRegime: t('dailyCsv.meta.vatRegime'), period: t('dailyCsv.meta.period') },
    header: { date: t('dailyCsv.header.date'), type: t('dailyCsv.header.type'), rate: t('dailyCsv.header.rate'), sales: t('dailyCsv.header.sales'),
      refunds: t('dailyCsv.header.refunds'), net: t('dailyCsv.header.net'), vat: t('dailyCsv.header.vat') },
    goods: t('dailyCsv.goods'), total: t('dailyCsv.total'),
    noRate: n => t('dailyCsv.noRate', { n, count: String(n) }),
  }
  const download = async () => {
    if (!from || !to || from > to) { setError(t('daily.badRange')); return }
    setBusy(true); setError(null)
    try {
      const res = await api('get_daily_totals', { from, to }) as DailyInput & { ok?: boolean }
      const result = dailyTotals({ orders: res.orders, payments: res.payments, cancelledAt: res.cancelledAt, tax: res.tax, timeZone: res.timeZone, from, to })
      const csv = dailyTotalsCsv(result, {
        legalName: truck.legal_name ?? null, registration: truck.registration_number ?? null, vatNumber: truck.vat_number ?? null,
        vatRegime: truck.vat_regime && REGIME_KEY[truck.vat_regime] ? tS(`business.regime.${REGIME_KEY[truck.vat_regime]}` as 'business.regime.franchise') : null, from, to,
      }, currency, words)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `daily-totals-${from}-to-${to}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('daily.failed'))
    } finally { setBusy(false) }
  }

  const sel = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white text-slate-900'
  return (
    <div className="mt-4 pt-4 border-t border-slate-100" data-daily-totals>
      <p className="text-sm font-semibold text-slate-800">{t('daily.title')}</p>
      <p className="text-xs text-slate-500 mt-0.5">{t('daily.help')}</p>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <select aria-label={t('daily.period')} value={choice} onChange={e => pick(e.target.value)} className={sel} data-daily-period>
          {presets.map(p => <option key={`${p.from}|${p.to}`} value={`${p.from}|${p.to}`}>{`${p.from} – ${p.to}`}</option>)}
          <option value="custom">{t('daily.custom')}</option>
        </select>
        {choice === 'custom' && (<>
          <input type="date" aria-label={t('daily.from')} value={from} max={today} onChange={e => setFrom(e.target.value)} className={sel} data-daily-from />
          <input type="date" aria-label={t('daily.to')} value={to} max={today} onChange={e => setTo(e.target.value)} className={sel} data-daily-to />
        </>)}
        <button onClick={() => { void download() }} disabled={busy} data-daily-download
          className="px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60">{t('daily.button')}</button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1" role="alert">{error}</p>}
    </div>
  )
}
