// app/(legal)/layout.tsx — THE ONE CHROME FOR EVERY LEGAL PAGE. The chrome itself is components/legal/LegalChrome.tsx
// (a client component — its notes say why, and why it is a layout rather than a shared component). This server layer
// decides one thing: where the logo goes. Language Phase 1e tidy: the visitor's country page ('/uk', '/us'), by the
// router's own rule (lib/visitor-country.ts routedAddress), so a tap lands there without hopping through /landing.
// Off a HatchGrab host the router does not run, and the logo keeps '/landing' as before.
import { LegalChrome } from '@/components/legal/LegalChrome'
import { routedAddress } from '@/lib/visitor-country'

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  return <LegalChrome homeHref={(await routedAddress('landing')) ?? '/landing'}>{children}</LegalChrome>
}
