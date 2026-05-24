'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createSupabaseBrowserClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Incorrect email or password. Please try again.')
      setLoading(false)
      return
    }

    // Force password change on first login
    if (data.user?.user_metadata?.must_change_password) {
      router.push('/reset-password?firstLogin=true')
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm
                      w-full max-w-sm p-8 flex flex-col gap-6">

        {/* Logo */}
        <div className="text-center">
          <img
            src="/logos/village-foodie-logo-v2.png"
            alt="Village Foodie"
            className="h-12 mx-auto mb-4"
          />
          <h1 className="text-xl font-semibold text-slate-900">
            Sign in to your kitchen
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Village Foodie operator dashboard
          </p>
        </div>

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
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full border border-slate-200 rounded-xl px-3 py-3
                         text-sm focus:outline-none focus:ring-2
                         focus:ring-teal-400"
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
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
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
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {/* Forgot password */}
        <div className="text-center">
          <a
            href="/forgot-password"
            className="text-xs text-slate-400 hover:text-slate-600"
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
