'use client'

import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function VerifyEmailSuccess({ newEmail }: { newEmail: string }) {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.signOut().then(() => {
      window.location.href = '/login?message=email_changed'
    })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <div className="text-4xl mb-4">✅</div>
        <p className="text-lg font-semibold text-slate-900">Email address updated</p>
        <p className="text-sm text-slate-500 mt-2">
          Your email has been changed to <strong>{newEmail}</strong>. Signing you out…
        </p>
      </div>
    </div>
  )
}
