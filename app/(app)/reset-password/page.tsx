'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FlowLogo } from '@/components/shared/FlowLogo'   // site-chrome-1: the focused flows' logo, linking home (inert in the app)
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/auth'
import { errorText } from '@/lib/i18n/customer-errors'
import '@/lib/i18n/catalog/errorsOnboarding'
import { isNativeApp } from '@/lib/native/device'

/** app-fixes-1: the reset flow's end states. Every one has a way forward (docs/app-fixes-1-report.md §1). The links are
 *  /login and /forgot-password, which are the same routes on the web and in the app (never the landing page). */
const LINK_CODES = new Set(['reset_link_expired', 'reset_link_used', 'reset_link_invalid'])
function EndCard({ icon, title, body, children, state }: { icon: string; title?: string; body: string; children: React.ReactNode; state: string }) {
  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4">
      <div data-auth-end={state} className="bg-white rounded-2xl border border-slate-100 shadow-xl p-8 max-w-sm w-full text-center">
        <FlowLogo variant="card" />
        <div className="text-3xl mb-4" aria-hidden="true">{icon}</div>
        {title && <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>}
        <p className={title ? 'text-sm text-slate-500' : 'text-base font-medium text-slate-800'}>{body}</p>
        <div className="mt-6 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  )
}
const PRIMARY = 'w-full inline-block bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl'
const SECONDARY = 'w-full inline-block border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold py-3 rounded-xl'

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
  const tForgot = useT('auth.forgot')
  const tLogin = useT('auth.login')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // app-fixes-1: an expired / used / unknown link is an END STATE (a card with a way forward), not a red line under a form
  // that can never succeed; and a successful reset shows a "Log in" button instead of jumping away.
  const [linkError, setLinkError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const nextSteps = (
    <>
      <Link href="/forgot-password" data-auth-next="forgot" className={PRIMARY}>{t('sendNewLink')}</Link>
      <Link href="/login" data-auth-next="login" className={SECONDARY}>{tForgot('back')}</Link>
    </>
  )

  // No token and not first login — invalid URL
  if (!token && !isFirstLogin) {
    return <EndCard state="invalid" icon="⚠️" title={t('invalidTitle')} body={t('invalidBody')}>{nextSteps}</EndCard>
  }
  // The server said the link is expired, already used or unknown: its own sentence, and the two ways forward.
  if (linkError) return <EndCard state="link-error" icon="⏱️" body={linkError}>{nextSteps}</EndCard>
  if (done) {
    return (
      <EndCard state="done" icon="✅" body={tLogin('resetSuccess')}>
        {/* A full page load, not <Link>: the old session was just signed out, and a fresh document is the clean start. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/login" data-auth-next="login" className={PRIMARY}>{tLogin('submit')}</a>
      </EndCard>
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
        if (typeof data?.code === 'string' && LINK_CODES.has(data.code)) { setLinkError(errorText(tErr, data, t('errorFallback'))); setLoading(false); return }
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
      // app-fixes-1: a success screen with a "Log in" button (was a jump to /login?message=password_reset). The sign-out
      // above still runs first, and the button is a full page load, so the old session is gone either way.
      setDone(true)
      setLoading(false)
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

      // app-fixes-1: in the app, /app routes to the device's truck (never a web-only page).
      router.push(isNativeApp() ? '/app' : '/dashboard')
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
          <FlowLogo variant="card" />
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
