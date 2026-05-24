'use client'

import { useState } from 'react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    // Always show success regardless of whether email exists
    // This prevents email enumeration attacks
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center
                      justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-100
                        p-8 max-w-sm w-full text-center">
          <div className="text-3xl mb-4">📧</div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Check your email
          </h2>
          <p className="text-sm text-slate-500">
            We've sent a password reset link to {email}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111827] flex items-center
                    justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-100
                      p-8 max-w-sm w-full flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Reset your password
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter your email and we'll send a reset link
          </p>
        </div>
        <form onSubmit={handleReset} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full border border-slate-100 rounded-xl
                       px-3 py-3 text-sm focus:outline-none
                       focus:ring-2 focus:ring-teal-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold
                       py-3 rounded-xl disabled:opacity-40"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <a href="/login"
           className="text-xs text-orange-500 hover:text-orange-600
                      text-center">
          Back to sign in
        </a>
      </div>
    </div>
  )
}
