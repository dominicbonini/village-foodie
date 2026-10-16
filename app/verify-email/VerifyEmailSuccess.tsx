'use client'

import { useEffect, useMemo } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { I18nContext, useSeedWords, useT } from '@/lib/i18n/use-t'
import { DEFAULT_LOCALE, type AppLocale } from '@/lib/i18n/locales'
import type { SeedWords } from '@/lib/i18n/registry'
import '@/lib/i18n/catalog/auth'

// Language Phase 1c: the words are `auth.verifyEmail`, in the locale the page resolved on the server (the operator's
// truck's, else en-GB). This route has no provider, so the locale is handed down and provided here.
// Language Phase 1e Part C: with that locale's overrides (`words`, null for en-GB), registered before the screen
// renders — the browser bundle carries only the en-GB base, and hydration must see the server's words.
export default function VerifyEmailSuccess({ newEmail, locale, words }: { newEmail: string; locale?: AppLocale; words?: SeedWords | null }) {
  useSeedWords(words)
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    supabase.auth.signOut().then(() => {
      window.location.href = '/login?message=email_changed'
    })
  }, [])

  const i18n = useMemo(() => ({ locale: locale ?? DEFAULT_LOCALE, setLocale: () => {} }), [locale])
  return (
    <I18nContext.Provider value={i18n}>
      <Updated newEmail={newEmail} />
    </I18nContext.Provider>
  )
}

function Updated({ newEmail }: { newEmail: string }) {
  const t = useT('auth.verifyEmail')
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-sm w-full">
        <div className="text-4xl mb-4">✅</div>
        <p className="text-lg font-semibold text-slate-900">{t('successTitle')}</p>
        <p className="text-sm text-slate-500 mt-2">
          {t.rich('successBody', { email: newEmail, b: c => <strong>{c}</strong> })}
        </p>
      </div>
    </div>
  )
}
