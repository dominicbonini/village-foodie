'use client'
// components/PartnerCodeField.tsx — partners-2 (16 November 2026, docs/partners-2-report.md): "Partner or promo code
// (optional)" with Apply, on the signup page AND the demo's "Start free, keep my menu" step (one component, one set of words:
// auth.signup.*).
//
//   • OPTIONAL AND NEVER BLOCKING: the form submits with an empty, unchecked, invalid or expired code exactly as before — the
//     code is checked again on the server when the account is created (lib/partner-codes-server.ts), and only a live partner
//     code is recorded as a redemption. Any code is still kept on operators.signup_promo_code, as it always was.
//   • Apply asks /api/signup/code and shows "✓ Code applied: 2 extra months free (NCASS)", or "That code isn't valid." /
//     "That code has expired." Editing the code clears the answer.
//   • 🔴 iOS (App Store 3.1.1 / 3.1.3): no gate needed and none added — the field takes no payment, shows no price and has no
//     link or instruction to buy (the same reasoning as lib/settings-copy.ts's trial lines). purchaseCtaAllowed() stays the one
//     commerce predicate.
import { useState } from 'react'
import { useT, useTIn } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/auth'

type Deal = { kind: 'extraMonths'; months: number } | { kind: 'percentOff'; pct: number; months: number }
type Answer = { state: 'idle' } | { state: 'checking' } | { state: 'applied'; deal: Deal; partner: string } | { state: 'invalid' | 'expired' }

export default function PartnerCodeField({ value, onChange, locale, inputId, onEnter, compact }: {
  value: string
  onChange: (v: string) => void
  /** The demo wizard's chosen language (its words follow it); the signup page passes nothing (the page's language). */
  locale?: string | null
  inputId?: string
  onEnter?: () => void
  compact?: boolean
}) {
  const tPage = useT('auth.signup')
  const tIn = useTIn(locale ?? null, 'auth.signup')
  const t = tIn ?? tPage
  const [answer, setAnswer] = useState<Answer>({ state: 'idle' })

  const apply = async () => {
    const code = value.trim()
    if (!code) return
    setAnswer({ state: 'checking' })
    try {
      const res = await fetch('/api/signup/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
      const data = await res.json()
      if (data?.ok) setAnswer({ state: 'applied', deal: data.deal as Deal, partner: String(data.partner ?? '') })
      else setAnswer({ state: data?.reason === 'expired' ? 'expired' : 'invalid' })
    } catch {
      setAnswer({ state: 'invalid' })
    }
  }

  const dealText = (d: Deal) => d.kind === 'extraMonths'
    ? t('dealExtraMonths', { months: d.months })
    : t('dealPercentOff', { pct: d.pct, months: d.months })

  const pad = compact ? 'py-2.5' : 'py-3'
  return (
    <div data-partner-code>
      <label htmlFor={inputId} className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
        {t.rich('codeLabel', { optional: c => <span className="normal-case font-normal text-slate-400">{c}</span> })}
      </label>
      <div className="flex gap-2">
        <input id={inputId} type="text" value={value}
          onChange={e => { onChange(e.target.value); if (answer.state !== 'idle') setAnswer({ state: 'idle' }) }}
          onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }}
          maxLength={40} autoComplete="off" placeholder={t('codePlaceholder')}
          className={`min-w-0 flex-1 border border-slate-200 rounded-xl px-3 ${pad} text-sm focus:outline-none focus:ring-2 focus:ring-orange-400`} />
        <button type="button" onClick={apply} disabled={!value.trim() || answer.state === 'checking'}
          className={`shrink-0 rounded-xl border border-slate-300 bg-white px-4 ${pad} text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50`}>
          {t('codeApply')}
        </button>
      </div>
      {answer.state === 'applied' && (
        <p className="mt-1.5 text-xs font-medium text-green-700" data-code-applied>
          ✓ {t('codeApplied', { deal: dealText(answer.deal), partner: answer.partner })}
        </p>
      )}
      {(answer.state === 'invalid' || answer.state === 'expired') && (
        <p className="mt-1.5 text-xs text-red-600" role="alert" data-code-error={answer.state}>
          {t(answer.state === 'expired' ? 'codeExpired' : 'codeInvalid')}
        </p>
      )}
    </div>
  )
}
