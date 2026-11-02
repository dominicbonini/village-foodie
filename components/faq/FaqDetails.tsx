// components/faq/FaqDetails.tsx — ONE FAQ'S QUESTIONS AS <details> (faq-3, 2 November 2026; docs/faq-3-report.md §3).
//
// 🔴 THE ONE MARKUP for the comparison pages' FAQ (app/[country]/[section]/[slug]/page.tsx, class "cmp-faq") and the English
// landing pages' (app/landing/page.tsx, class "faq-q"). MOVED, NOT REWRITTEN: the comparison pages render byte-identical HTML
// (scripts/faq-3.cjs). Server-rendered: each answer is in the HTML while its question is closed, for search and answer engines.
// The JSON-LD of the same pairs is lib/structured-data.ts faqPageLd, so the visible text and the structured data are one list.
import type { FaqPair } from '@/lib/structured-data'

export function FaqDetails({ items, className }: { items: FaqPair[]; className: string }) {
  return (
    <>
      {items.map(f => (
        <details key={f.q} className={className}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </>
  )
}
