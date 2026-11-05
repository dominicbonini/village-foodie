// components/shared/FlowLogo.tsx — site-chrome-1 (5 November 2026, manual 35.ao-13): THE FOCUSED FLOWS' LOGO, ONE DEFINITION.
// Sign-up, log-in, forgot / reset password, verify email, setup and the demo walkthrough have no shared header and no footer — just the
// HatchGrab wordmark, and it LINKS HOME ('/', which on HatchGrab is the router to the visitor's country page). Inside the native app
// it renders unchanged and does not navigate (BrandHomeLink, kind "branding": there is no back button in the app's web view).
//   • 'card' — the navy wordmark at the top of the white card (/login, /signup, /forgot-password, /reset-password, /verify-email):
//     48px tall, centred, the same <img> /login and /reset-password already drew.
//   • 'header' — the white wordmark in a slate bar (/setup, /try): the HatchGrabWordmark component's dark variant.
'use client'

import { BrandHomeLink } from '@/components/shared/BrandHomeLink'
import { HatchGrabWordmark } from '@/components/brand/HatchGrabWordmark'
import { BRANDS, HATCHGRAB_WORDMARK_SVG } from '@/lib/brand'

export const HOME_HREF = '/'

export function FlowLogo({ variant }: { variant: 'card' | 'header' }) {
  if (variant === 'header') {
    return (
      <BrandHomeLink href={HOME_HREF} kind="branding" className="inline-flex hover:opacity-80 transition-opacity" nativeClassName="inline-flex">
        <HatchGrabWordmark variant="dark" />
      </BrandHomeLink>
    )
  }
  return (
    <BrandHomeLink href={HOME_HREF} kind="branding" className="block w-fit mx-auto mb-4 hover:opacity-80 transition-opacity" nativeClassName="block w-fit mx-auto mb-4">
      {/* ⚠️ NAVY, not white: it sits inside the white card. width/height reserve the 4.548:1 aspect (post-crop). */}
      <img src={HATCHGRAB_WORDMARK_SVG} alt={BRANDS.HATCHGRAB.name} width={191} height={42} className="h-12 w-auto" />
    </BrandHomeLink>
  )
}
