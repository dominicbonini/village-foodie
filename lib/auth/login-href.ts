// lib/auth/login-href.ts — "sign in again" links that bring the person BACK to the screen they were on
// (dashboard-auth-2, 18 November 2026). A kitchen tablet that has to sign in again mid-service should land on its
// board, not on the default page. app/(app)/login/page.tsx already honours `?next=` (router.push(next)).
//
// ⚠️ CLIENT-ONLY. Call it where the link renders only after mount (the session banner and the dashboard's "Access
// denied" screen both do), so server and client never disagree about the href. On the server it answers '/login'.
// ⚠️ SAME-ORIGIN PATH ONLY: it is built from window.location.pathname + search — never from a parameter — so it can
// never point anywhere off the site.

export function loginHrefBackHere(): string {
  if (typeof window === 'undefined') return '/login'
  const here = window.location.pathname + window.location.search
  if (!here.startsWith('/') || here.startsWith('//') || here === '/login' || here.startsWith('/login?')) return '/login'
  return `/login?next=${encodeURIComponent(here)}`
}
