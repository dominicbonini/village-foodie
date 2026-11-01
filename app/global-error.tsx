'use client'
// app/global-error.tsx — legal-languages-1 (1 November 2026): THE LAST-RESORT ERROR PAGE (the root layout itself threw), which
// replaces <html> — so it names its own language: the one the failed document had (its <html lang>, still in the DOM when this
// first renders), else the browser's when it is one of ours, else en-GB. Words: `errorPage`, shown only once a non-English language's words
// have arrived (ensureLanguage). No stylesheet is guaranteed
// here, so it is styled inline.
import { useEffect, useState } from 'react'
import { useTIn } from '@/lib/i18n/use-t'
import { resolveLocale } from '@/lib/i18n/locales'
import { ensureLanguage } from '@/lib/i18n/registry'
import '@/lib/i18n/catalog/errorPage'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale] = useState(() => (typeof document === 'undefined' ? 'en-GB'
    : resolveLocale(document.documentElement.getAttribute('lang') || (typeof navigator !== 'undefined' ? navigator.language : null))))
  const [ready, setReady] = useState(false)
  useEffect(() => { let on = true; void ensureLanguage(locale).then(() => { if (on) setReady(true) }); return () => { on = false } }, [locale])
  const t = useTIn(locale, 'errorPage')
  return (
    <html lang={locale}>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {t && ready && (
          <div style={{ textAlign: 'center', background: '#fff', borderRadius: 16, padding: 32, maxWidth: 360, margin: 16 }}>
            <h1 style={{ fontSize: 18, color: '#0f172a' }}>{t('errorTitle')}</h1>
            <p style={{ fontSize: 14, color: '#64748b' }}>{t('errorBody')}</p>
            <button type="button" onClick={reset} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 12, border: 0, background: '#ea580c', color: '#fff', fontWeight: 600 }}>{t('retry')}</button>
          </div>
        )}
      </body>
    </html>
  )
}
