'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { HATCHGRAB_WORDMARK_SVG } from '@/lib/brand'
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/auth'
import { errorText } from '@/lib/i18n/customer-errors'
import '@/lib/i18n/catalog/errorsOnboarding'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const isFirstLogin = searchParams.get('firstLogin') === 'true'
  // Language Phase 1c: `auth.reset` / `auth.fields`. This route has no provider and reads no truck, so en-GB
  // (DEFAULT_LOCALE), as the page always did.
  const t = useT('auth.reset')
  const tField = useT('auth.fields')
  // A refusal is worded from its code (errorsOnboarding), its English `error` the fallback (US polish batch, 19 Oct 2026).
  const tErr = useT('errorsOnboarding')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // No token and not first login — invalid URL
  if (!token && !isFirstLogin) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center
                      justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200
                        p-8 max-w-sm w-full text-center border-slate-100 shadow-xl">
          <div className="text-3xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            {t('invalidTitle')}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {t('invalidBody')}
          </p>
          <a href="/forgot-password"
             className="text-sm text-orange-600 font-medium">
            {t('requestNew')}
          </a>
        </div>
      </div>
    )
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError(t('mismatch'))
      return
    }
    if (password.length < 8) {
      setError(t('tooShort'))
      return
    }

    setLoading(true)
    setError(null)

    if (token) {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setError(errorText(tErr, data, t('errorFallback')))
        setLoading(false)
        return
      }

      // FORCE a clean sign-out of any EXISTING session on this device (e.g. the owner was still
      // signed in) before sending the new user to login — otherwise the device is left in a confused
      // half-state (set-password creates no session, but the old one lingers → blank/broken screen).
      // Same forced-sign-out pattern as the email-change flow (Section 12): browser client + HARD
      // redirect, which properly clears the SSR cookie (plain client sign-out alone does not).
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
      await createSupabaseBrowserClient().auth.signOut()
      window.location.href = '/login?message=password_reset'
      return
    }

    if (isFirstLogin) {
      const { createSupabaseBrowserClient } = await import('@/lib/supabase/client')
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.updateUser({
        password,
        data: { must_change_password: false },
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xl
                      w-full max-w-sm p-8 flex flex-col gap-6">
        <div className="text-center">
          {/* HatchGrab wordmark — identical case to /login and /signup: dark page, WHITE CARD, so the
              NAVY variant is correct. h-12 (48px) preserved so nothing shifts. */}
          <img
            src={HATCHGRAB_WORDMARK_SVG}
            alt="HatchGrab"
            width={191}
            height={42}
            className="h-12 w-auto mx-auto mb-4"
          />
          <h1 className="text-xl font-semibold text-slate-900">
            {isFirstLogin ? t('titleFirstLogin') : t('titleReset')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isFirstLogin ? t('subtitleFirstLogin') : t('subtitleReset')}
          </p>
        </div>

        <form onSubmit={handleReset} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500
                             uppercase tracking-wide block mb-1">
              {t('newPassword')}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={tField('passwordHint')}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full border border-slate-200 rounded-xl px-3 py-3
                         text-sm focus:outline-none focus:ring-2
                         focus:ring-orange-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500
                             uppercase tracking-wide block mb-1">
              {t('confirmPassword')}
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder={t('confirmPlaceholder')}
              required
              autoComplete="new-password"
              className="w-full border border-slate-200 rounded-xl px-3 py-3
                         text-sm focus:outline-none focus:ring-2
                         focus:ring-orange-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white
                       font-semibold py-3 rounded-xl transition-colors
                       disabled:opacity-40"
          >
            {loading ? t('saving') : t('submit')}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
