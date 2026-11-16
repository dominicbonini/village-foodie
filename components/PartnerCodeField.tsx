'use client'
// components/PartnerCodeField.tsx — partners-2 (16 November 2026, docs/partners-2-report.md): "Partner or promo code
// (optional)" with Apply, on the signup page AND the demo's "Start free, keep my menu" step — one component; each caller hands
// it ITS OWN words (`words`): the signup page's auth.signup.*, the demo's demoGetStarted.* (the same texts). ⚠️ It imports no
// catalogue itself, on purpose: the demo also renders on the customer order page and the kitchen screen, which must not load the
// whole `auth` namespace for seven strings (scripts/messages-split.cjs checks each page's namespaces).
//
//   • OPTIONAL AND NEVER BLOCKING: the form submits with an empty, unchecked, invalid or expired code exactly as before — the
//     code is checked again on the server when the account is created (lib/partner-codes-server.ts), and only a live partner
//     code is recorded as a redemption. Any code is still kept on operators.signup_promo_code, as it always was.
//   • Apply asks /api/signup/code and shows "✓ Code applied: 2 extra months free (NCASS)", or "That code isn't valid." /
//     "That code has expired." Editing the code clears the answer.
//   • 🔴 iOS (App Store 3.1.1 / 3.1.3): no gate needed and none added — the field takes no payment, shows no price and has no
//     link or instruction to buy (the same reasoning as lib/settings-copy.ts's trial lines). purchaseCtaAllowed() stays the one
//     commerce predicate. ⚠️ partners offer (16 November 2026): a FIXED-PRICE deal names an amount, so inside the iOS app
//     (purchaseCtaAllowed() false) it is shown without one — "a special price on Pro for 6 months" (words.planOffer).
import { useState, type ReactNode } from 'react'
import { purchaseCtaAllowed } from '@/lib/commerce-policy'

// partners offer (16 November 2026): a % off may name a plan; a fixed monthly price always does (planName / price come from the
// API already in the visitor's language — POST { code, locale }).
export type Deal = { kind: 'extraMonths'; months: number }
  | { kind: 'percentOff'; pct: number; months: number; planName?: string | null }
  | { kind: 'fixedPrice'; months: number; planName: string; price: string }
/** The field's words, in the caller's language. */
export interface PartnerCodeWords {
  label: ReactNode; placeholder: string; apply: string; invalid: string; expired: string
  applied: (deal: string, partner: string) => string
  extraMonths: (months: number) => string
  percentOff: (pct: number, months: number) => string
  /** partners offer: "20% off Pro for 6 months", "Pro at €19 a month for 6 months", and the iOS app's "a special price on Pro for 6 months". */
  percentOffPlan?: (pct: number, plan: string, months: number) => string
  fixedPrice?: (plan: string, price: string, months: number) => string
  planOffer?: (plan: string, months: number) => string
  /** The caller's locale, so the plan name and price come back in its language. */
  locale?: string
}
type Answer = { state: 'idle' } | { state: 'checking' } | { state: 'applied'; deal: Deal; partner: string } | { state: 'invalid' | 'expired' }

export default function PartnerCodeField({ value, onChange, words, inputId, onEnter, compact }: {
  value: string
  onChange: (v: string) => void
  words: PartnerCodeWords
  inputId?: string
  onEnter?: () => void
  compact?: boolean
}) {
  const [answer, setAnswer] = useState<Answer>({ state: 'idle' })

  const apply = async () => {
    const code = value.trim()
    if (!code) return
    setAnswer({ state: 'checking' })
    try {
      const res = await fetch('/api/signup/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, locale: words.locale }) })
      const data = await res.json()
      if (data?.ok) setAnswer({ state: 'applied', deal: data.deal as Deal, partner: String(data.partner ?? '') })
      else setAnswer({ state: data?.reason === 'expired' ? 'expired' : 'invalid' })
    } catch {
      setAnswer({ state: 'invalid' })
    }
  }

  const dealText = (d: Deal) => {
    if (d.kind === 'extraMonths') return words.extraMonths(d.months)
    if (d.kind === 'fixedPrice') {
      if (!purchaseCtaAllowed()) return words.planOffer ? words.planOffer(d.planName, d.months) : d.planName
      return words.fixedPrice ? words.fixedPrice(d.planName, d.price, d.months) : `${d.planName} ${d.price}`
    }
    return d.planName && words.percentOffPlan ? words.percentOffPlan(d.pct, d.planName, d.months) : words.percentOff(d.pct, d.months)
  }

  const pad = compact ? 'py-2.5' : 'py-3'
  return (
    <div data-partner-code>
      <label htmlFor={inputId} className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">
        {words.label}
      </label>
      <div className="flex gap-2">
        <input id={inputId} type="text" value={value}
          onChange={e => { onChange(e.target.value); if (answer.state !== 'idle') setAnswer({ state: 'idle' }) }}
          onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }}
          maxLength={40} autoComplete="off" placeholder={words.placeholder}
          className={`min-w-0 flex-1 border border-slate-200 rounded-xl px-3 ${pad} text-sm focus:outline-none focus:ring-2 focus:ring-orange-400`} />
        <button type="button" onClick={apply} disabled={!value.trim() || answer.state === 'checking'}
          className={`shrink-0 rounded-xl border border-slate-300 bg-white px-4 ${pad} text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50`}>
          {words.apply}
        </button>
      </div>
      {answer.state === 'applied' && (
        <p className="mt-1.5 text-xs font-medium text-green-700" data-code-applied>
          ✓ {words.applied(dealText(answer.deal), answer.partner)}
        </p>
      )}
      {(answer.state === 'invalid' || answer.state === 'expired') && (
        <p className="mt-1.5 text-xs text-red-600" role="alert" data-code-error={answer.state}>
          {answer.state === 'expired' ? words.expired : words.invalid}
        </p>
      )}
    </div>
  )
}
