// app/terms/page.tsx
// HOLDING PAGE — honest interim, not the final terms. Same reasoning as app/privacy/page.tsx: /signup
// asks people to agree to this, and a 404 behind a consent line is worse than no consent line.
//
// Deliberately SHORT and deliberately non-committal about anything we have not decided. It states the
// commercial facts already advertised on the landing page — free month, no card, cancel anytime, the
// trial clock starting at go-live rather than signup — because those are promises we are ALREADY making
// publicly, and a terms page that contradicted them would be worse than one that repeated them.
//
// ⚠️ NOT LEGAL ADVICE and not a complete set of terms. It omits, at minimum: limitation of liability,
// warranties, acceptable use, the operator's own obligations to their customers (food safety and allergen
// law sit with the operator, not with us — that clause matters and needs drafting properly), payment and
// refund terms, suspension/termination grounds, and governing law. Replace before any public launch.

import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Terms — HatchGrab',
  description: 'The terms of using HatchGrab.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="23 July 2026">
      <p>
        <strong>Our full terms are being finalised.</strong> Rather than leave this page empty, here is a
        plain statement of what we are promising you today. The complete terms will replace this page
        before launch, and we will tell you when they do.
      </p>

      <h2>What it costs</h2>
      <p>
        Your first month is free with every feature unlocked, and{' '}
        <strong>the month does not start when you sign up — it starts when you decide to go live</strong>{' '}
        and take your first real order. No card is needed to set up, and there is a free-forever plan if
        that is all you need. We will never charge you without your clear permission.
      </p>

      <h2>Nothing goes public until you say so</h2>
      <p>
        Your truck is hidden while you set it up. It becomes visible to customers only when you choose an
        event to go live with. You can cancel at any time, and there is no contract.
      </p>

      <h2>Your menu is yours</h2>
      <p>
        You keep everything you put in. Ask us and we will give it back or delete it.
      </p>

      <h2>What we ask of you</h2>
      <p>
        The food is yours, and so is responsibility for it — including allergen information, which is a
        legal duty that sits with you as the operator. Our tools help you record and display it accurately;
        they do not replace your own checks. Please keep what you publish about your food correct and
        up to date.
      </p>

      <h2>When things go wrong</h2>
      <p>
        We will tell you honestly and fix it. If we ever need to change these terms in a way that affects
        you, we will let you know before it takes effect.
      </p>
    </LegalPage>
  )
}
