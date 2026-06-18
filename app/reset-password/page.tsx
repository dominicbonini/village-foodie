'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const isFirstLogin = searchParams.get('firstLogin') === 'true'

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
            Invalid reset link
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            This link is invalid or has expired.
          </p>
          <a href="/forgot-password"
             className="text-sm text-orange-600 font-medium">
            Request a new reset link
          </a>
        </div>
      </div>
    )
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
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
        setError(data.error || 'Something went wrong. Please try again.')
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
          <img
            src="/logos/village-foodie-logo-v2.png"
            alt="Village Foodie"
            className="h-12 mx-auto mb-4"
          />
          <h1 className="text-xl font-semibold text-slate-900">
            {isFirstLogin ? 'Set your password' : 'Choose a new password'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isFirstLogin
              ? 'Choose a password to secure your account'
              : 'Your new password must be at least 8 characters'}
          </p>
        </div>

        <form onSubmit={handleReset} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500
                             uppercase tracking-wide block mb-1">
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat your password"
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
            {loading ? 'Saving...' : 'Set password'}
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
