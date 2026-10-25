'use client'
// components/landing/AdminOnly.tsx — renders its children only after /api/auth/me says the visitor is an admin
// (compare-de-1, 24 October 2026: the footer's link to a comparison page that is not live yet). Nothing is in the server
// HTML, so a crawler or an anonymous visitor never sees it; the page it links to checks admin again on the server.
import { useEffect, useState } from 'react'

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d?.is_admin === true) setAdmin(true) })
      .catch(() => { /* not signed in, or offline — nothing to show */ })
    return () => { cancelled = true }
  }, [])
  return admin ? <>{children}</> : null
}
