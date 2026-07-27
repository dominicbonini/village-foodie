'use client'

// app/signup/page.tsx
// Self-serve account creation. Email + password ONLY — everything else is the wizard's job.
//
// ── CONSENT BY CONDUCT, NOT A TICK-BOX ─────────────────────────────────────────────────────────────
// "By creating an account you agree to…" under the submit button, both documents linked and live. A
// tick-box adds friction at the single highest-intent moment in the funnel, and acceptance by conduct is
// the norm for contract terms. What makes it defensible is the RECORD: /api/signup stores
// terms_accepted_at + terms_version, so we can say when and to what.
//
// 🔴 MARKETING IS A SEPARATE, UNTICKED OPT-IN. Bundling it into terms acceptance is not consent under UK
// GDPR/PECR, and a pre-ticked box is not consent either. It is deliberately the only checkbox on the page,
// so it cannot be mistaken for a required step.

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'

function SignupForm() {
  const router = useRouter()
  const params = useSearchParams()
  // Carried from the demo's "Save my menu" CTA so the account can be linked to the demo it came from.
  const demo = params.get('demo')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [marketing, setMarketing] = useState(false)   // UNTICKED — see the header
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null); setExisting(false)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, marketing_opt_in: marketing, demo }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error || 'Could not create your account.')
        setExisting(!!data.existing)
        return
      }
      // Sign them straight in — an account created and then a login screen is a pointless wall at the
      // moment they have just committed.
      const supabase = createSupabaseBrowserClient()
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInErr) { router.push('/login?message=signed_up'); return }
      router.push('/setup')
    } catch {
      setError('Couldn’t reach us just now — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#111827] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-sm p-8 flex flex-col gap-6">
        <div className="text-center">
          <div className="flex justify-center mb-4"><HatchGrabWordmark /></div>
          <h1 className="text-xl font-black text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-500 mt-1">
            Your free month doesn&apos;t start until you go live.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              autoComplete="email" placeholder="you@yourtruck.co.uk"
              className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              autoComplete="new-password" minLength={8} placeholder="At least 8 characters"
              className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
          </div>

          {/* The ONLY checkbox on the page, and it is not required. */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-orange-600" />
            <span className="text-xs text-slate-500">
              Email me occasional tips and product news. Nothing to do with your orders — you can stop any time.
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600 text-center">
              {error}{' '}
              {existing && <a href="/login" className="underline font-semibold">Sign in</a>}
            </p>
          )}

          <button type="submit" disabled={busy || !email.includes('@') || password.length < 8}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-3 rounded-xl transition-colors disabled:opacity-40">
            {busy ? 'Creating your account…' : 'Create my account'}
          </button>

          {/* Consent by conduct — directly under the action it refers to, which is what makes it consent. */}
          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            By creating an account you agree to our{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Terms</a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">Privacy Policy</a>.
            No card needed. Nothing goes public until you say so.
          </p>
        </form>

        <div className="text-center">
          <a href="/login" className="text-xs text-orange-500 hover:text-orange-600">Already have an account? Sign in</a>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>
}
