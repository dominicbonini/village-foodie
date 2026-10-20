// app/(legal)/terms/page.tsx
// 🔴 THE DOCUMENT ITSELF LIVES IN content/legal/terms-and-conditions.md AND IS THE SINGLE SOURCE OF TRUTH.
// This file reads that markdown at BUILD TIME and renders it. There is no second copy of the text, so an
// amendment is an edit to the .md and nothing here changes.
//
// ⚠️ DO NOT PARAPHRASE, SUMMARISE, REORDER OR "IMPROVE" ANYTHING IN THE SOURCE. It is final legal copy.
// The document carries its own `# Terms of Service` heading and `**Last updated:**` line, so LegalPage is
// deliberately given NEITHER `title` NOR `updated`.
//
// ⚠️ THE 🔴 AND ⚠️ MARKERS IN THIS DOCUMENT ARE PART OF THE COPY, NOT EDITORIAL NOTES. They sit on three
// substantive clauses — allergen non-verification, the paid-plan dependency warning, and the statement
// that customer money settles to the operator's own Stripe account. They must render; do not strip them.
import fs from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { renderLegalMarkdownHtml } from '@/lib/legal-markdown-html'   // seo-fixes S7: server-only static HTML
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { translatorFor } from '@/lib/i18n/translator'
import { ownUrlMetadata } from '@/lib/site-metadata'
import { TERMS_PATH } from '@/lib/legal'
import '@/lib/i18n/catalog/legalChrome'

// Language Phase 1e: `legalChrome.meta`, en-GB (app/(legal)/layout.tsx says why). Read at build time, like the text.
const t = translatorFor(DEFAULT_LOCALE, 'legalChrome')

// seo-fixes S1 (20 October 2026): its canonical and og:url are its HatchGrab www address on EVERY host — the Village
// Foodie host serves this same document, and the canonical names the HatchGrab copy (lib/site-metadata.ts).
export async function generateMetadata(): Promise<Metadata> {
  return {
    // `absolute`: the document's own title ends "— HatchGrab", so the root template's "| HatchGrab" would double it
    // (legal follow-ups, 19 October 2026).
    title: { absolute: t('meta.termsTitle') },
    description: t('meta.termsDescription'),
    ...(await ownUrlMetadata(TERMS_PATH)),
  }
}

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'content/legal/terms-and-conditions.md'),
  'utf8',
)

export default function TermsPage() {
  return <LegalPage html={renderLegalMarkdownHtml(SOURCE)} />
}
