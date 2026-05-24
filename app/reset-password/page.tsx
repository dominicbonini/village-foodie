'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFirstLogin = searchParams.get('firstLogin') === 'true'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm
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
                         focus:ring-teal-400"
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
                         focus:ring-teal-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white
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
