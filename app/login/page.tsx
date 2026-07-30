'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { isNativeApp } from '@/lib/native/device'
import { getNativeSupabase } from '@/lib/native/session'
import { HATCHGRAB_WORDMARK_SVG } from '@/lib/brand'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'
  const message = searchParams.get('message')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showResetSuccess, setShowResetSuccess] = useState(message === 'password_reset')
  const showEmailChanged = message === 'email_changed'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setShowResetSuccess(false)

    // NATIVE: use the persistent localStorage-backed client so the session survives cold-launch (plan a).
    // WEB: unchanged cookie @supabase/ssr client.
    const supabase = isNativeApp() ? getNativeSupabase() : createSupabaseBrowserClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message || 'Incorrect email or password. Please try again.')
      setLoading(false)
      return
    }

    // Force password change on first login
    if (data.user?.user_metadata?.must_change_password) {
      router.push('/reset-password?firstLogin=true')
      return
    }

    // NATIVE: go to the app landing, which routes to this device's remembered truck/van/screen.
    if (isNativeApp()) {
      router.push('/app'); return
    }

    // ── ONBOARDING RESUME (additive; every failure falls through to the line below) ────────────────
    // 🔴 SMALLEST POSSIBLE DIFF ON THE LOGIN PATH. A bug here locks an operator out on a trading day, so:
    //   • it runs ONLY when `next` is the default — an explicit ?next= is honoured exactly as before;
    //   • the endpoint answers `null` for anything it isn't certain about, and NULL means "carry on";
    //   • a throw, a non-ok response or an unparseable body all fall through to router.push(next);
    //   • the only destination it can ever return is /setup, built server-side from an id we looked up.
    // Delete this block and login behaves precisely as it did before Phase 4.
    if (next === '/dashboard') {
      try {
        const res = await fetch('/api/auth/post-login')
        if (res.ok) {
          const { redirect } = await res.json()
          if (typeof redirect === 'string' && redirect.startsWith('/setup')) {
            router.push(redirect); return
          }
        }
      } catch { /* fall through — the default route below is always correct */ }
    }

    router.push(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xl
                      w-full max-w-sm p-8 flex flex-col gap-6">

        {/* Logo */}
        <div className="text-center">
          {/* HatchGrab wordmark. ⚠️ NAVY variant, not white: the page is bg-[#111827] but this logo
              sits INSIDE the bg-white card above — the immediate background is WHITE. The white
              wordmark would be invisible here. Height stays h-12 (48px), byte-identical to the mark it
              replaces, so nothing shifts vertically; width/height attributes are the 4.548:1 aspect
              reservation (post-crop). ⚠️ h-12 w-auto means the RENDERED WIDTH grows ~191px → ~218px now the
              artwork is tight-cropped — still well inside the card's 320px content box, and mx-auto keeps
              it centred. */}
          <img
            src={HATCHGRAB_WORDMARK_SVG}
            alt="HatchGrab"
            width={191}
            height={42}
            className="h-12 w-auto mx-auto mb-4"
          />
          <h1 className="text-xl font-semibold text-slate-900">
            Sign in to your kitchen
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {typeof window !== 'undefined' && window.location.hostname.includes('hatchgrab')
              ? 'HatchGrab'
              : 'Village Foodie'} operator dashboard
          </p>
        </div>

        {showResetSuccess && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl
                          px-4 py-3 text-sm text-orange-700 text-center">
            Password updated successfully. Please sign in.
          </div>
        )}

        {showEmailChanged && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl
                          px-4 py-3 text-sm text-orange-700 text-center">
            Email address updated. Please sign in with your new email address.
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500
                             uppercase tracking-wide block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setShowResetSuccess(false) }}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full border border-slate-200 rounded-xl px-3 py-3
                         text-sm focus:outline-none focus:ring-2
                         focus:ring-orange-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500
                             uppercase tracking-wide block mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setShowResetSuccess(false) }}
              placeholder="••••••••"
              required
              autoComplete="current-password"
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
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {/* Forgot password */}
        <div className="text-center">
          <a
            href="/forgot-password"
            className="text-xs text-orange-500 hover:text-orange-600"
          >
            Forgot your password?
          </a>
        </div>

      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
