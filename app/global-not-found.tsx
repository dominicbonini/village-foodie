// cwv-2 (6 November 2026, docs/cwv-2-report.md §4): THE 404 FOR AN ADDRESS THAT MATCHES NO ROUTE. With two root layouts there is no
// app/layout.tsx, so Next would answer such an address with its own bare page; `experimental.globalNotFound` (next.config.ts) makes
// it render this file instead. It is TODAY'S page exactly: the app's root layout (app/(app)/layout.tsx — html lang, data-brand, the
// fonts, PostHog, the session banner) around the app's not-found card (app/(app)/not-found.tsx), both unchanged, on either host.
import RootLayout from './(app)/layout'
import NotFound from './(app)/not-found'

export { generateMetadata, viewport } from './(app)/layout'

export default function GlobalNotFound() {
  return <RootLayout><NotFound /></RootLayout>
}
