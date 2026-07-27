// app/privacy/page.tsx
// HOLDING PAGE — honest interim, not the final policy.
//
// WHY A HOLDING PAGE AND NOT A 404: /signup asks people to agree to this by creating an account, and the
// landing footer already links it. Claiming agreement to a document that does not exist is weaker than
// saying nothing, and a 404 at the signup moment costs more trust than the whole funnel builds.
//
// WHAT IT MUST SAY TODAY: the concrete, non-templatable facts about what we actually do — above all that
// an uploaded menu photo is processed by GOOGLE GEMINI, a third-party processor. That is the clause no
// boilerplate supplies, it is already true of the live demo, and it is the one a food operator would
// reasonably want to know before uploading their menu.
//
// ⚠️ NOT LEGAL ADVICE and not a complete UK GDPR privacy notice. It omits, at minimum: the legal basis for
// each processing purpose, retention periods beyond the demo, the full sub-processor list (Supabase,
// Vercel, Brevo, Upstash), international transfer terms, and the data-subject rights section. Replace
// before any public launch.

import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy — HatchGrab',
  description: 'What HatchGrab does with your data.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="23 July 2026">
      <p>
        <strong>Our full privacy policy is being finalised.</strong> Rather than leave this page empty,
        here is a plain account of what we actually do with your information today. It is accurate, but
        it is not yet the complete notice — that will replace this page before launch.
      </p>

      <h2>What we collect</h2>
      <p>
        If you try the demo, we take the menu you upload and the email address you give us — nothing else,
        and we never ask who you are. If you create an account we also hold your email address, your
        truck&apos;s details, and the orders your customers place with you.
      </p>

      <h2>Your menu is read by Google Gemini</h2>
      <p>
        When you upload a photo, screenshot or PDF of your menu, we send it to <strong>Google Gemini</strong>,
        a third-party AI service, which reads it and turns it into a list of dishes and prices. That is the
        only way the upload works. Your menu leaves our systems to be processed by Google, under their
        terms as our processor.
      </p>

      <h2>How long we keep it</h2>
      <p>
        A demo you leave without giving an email is deleted <strong>24 hours</strong> later. If you give us
        an email so you can come back to it, the demo and that address are kept for <strong>14 days</strong>,
        and we tell you the exact deletion date when you ask us to save it. Accounts are kept for as long
        as you have one.
      </p>

      <h2>What we never do</h2>
      <p>
        We do not sell your data, and we do not pass your customers&apos; details to anyone. We email your
        customers only about the orders they have actually placed with you.
      </p>

      <h2>Getting it removed</h2>
      <p>
        Ask us and we will delete your data. For a demo you can simply walk away — it deletes itself.
      </p>
    </LegalPage>
  )
}
