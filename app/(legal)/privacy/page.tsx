// app/(legal)/privacy/page.tsx
// 🔴 THE DOCUMENT ITSELF LIVES IN content/legal/privacy-policy.md AND IS THE SINGLE SOURCE OF TRUTH.
// This file reads that markdown at BUILD TIME and renders it. There is no second copy of the text, so an
// amendment is an edit to the .md and nothing here changes.
//
// ⚠️ DO NOT PARAPHRASE, SUMMARISE, REORDER OR "IMPROVE" ANYTHING IN THE SOURCE. It is final legal copy.
// The document carries its own `# Privacy Policy` heading and `**Last updated:**` line, so LegalPage is
// deliberately given NEITHER `title` NOR `updated` — rendering those from the page would restate the
// document's own words back at it and could drift from them.
//
// `fs.readFileSync` at module scope is a SERVER-side read in a server component: the file is inlined at
// build time, never fetched at runtime, and never shipped to the browser as a file.
import fs from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import { LegalPage } from '@/components/legal/LegalPage'
import { renderLegalMarkdown } from '@/lib/legal-markdown'

export const metadata: Metadata = {
  title: 'Privacy Policy — HatchGrab',
  description: 'How HatchGrab Ltd collects and uses personal data.',
}

const SOURCE = fs.readFileSync(
  path.join(process.cwd(), 'content/legal/privacy-policy.md'),
  'utf8',
)

export default function PrivacyPage() {
  return <LegalPage>{renderLegalMarkdown(SOURCE)}</LegalPage>
}
