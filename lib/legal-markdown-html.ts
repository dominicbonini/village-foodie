// lib/legal-markdown-html.ts — seo-fixes S7 (20 October 2026, docs/seo-fixes-report.md): a legal document as STATIC HTML,
// rendered on the server only.
//
// The pages used to pass renderLegalMarkdown()'s React elements as children of the legal chrome (a client component),
// so the whole document travelled TWICE: once as HTML and once as a JSON element tree in the RSC payload. Rendering the
// SAME elements to a string here and setting it as the content div's innerHTML (components/legal/LegalPage.tsx `html`)
// produces the IDENTICAL DOM — the same elements, classes and text — while the payload carries one compact HTML string.
// ⛔ ONE RENDERER: this calls lib/legal-markdown.tsx's renderLegalMarkdown and only serialises its output
// (lib/static-markup.ts — proven byte-identical to react-dom/server by scripts/seo-fixes.cjs), so the legal text still
// has exactly one parser. The documents have no interactive element (their links are plain <a href>).
import 'server-only'
import { renderLegalMarkdown } from '@/lib/legal-markdown'
import { staticMarkup } from '@/lib/static-markup'

export function renderLegalMarkdownHtml(src: string): string {
  return staticMarkup(renderLegalMarkdown(src))
}
