// lib/static-markup.ts — seo-fixes S7 (20 October 2026, docs/seo-fixes-report.md): a React element tree → static HTML,
// on the server, for content that has NO interactivity (the legal documents).
//
// WHY: server-component output travels twice — as HTML and as a JSON element tree in the RSC payload. For a long document
// of distinct elements (the legal pages: privacy 65.8 → 54.4 KB, terms 82.3 → 69.0 KB, measured) rendering it to ONE
// HTML string (set as innerHTML) keeps the DOM identical and carries the content once. ⚠️ NOT a win for repetitive
// content: React's tree de-duplicates repeats, and the /features plan table got BIGGER as a string — measured, reverted.
// Next forbids `react-dom/server` inside the app ("render the content directly as a Server Component"), so this is a
// minimal serializer for what these trees contain: host elements, fragments, function components (called), strings and
// numbers, `className`, `style`, aria-* / role / data-* attributes and the SVG presentation attributes.
// ⛔ NOT A GENERAL RENDERER: no hooks, no context, no event handlers (dropped), no forms. Anything it does not know
// throws rather than rendering something different.
// 🔴 PROVEN BYTE-IDENTICAL to react-dom/server's renderToStaticMarkup for every legal document (and the plan table, as a
// wider fixture) by scripts/seo-fixes.cjs — that is what licenses using it.
import { Fragment, isValidElement, type ReactNode } from 'react'

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
// React's attribute names for the camelCase props these trees use (the SVG presentation attributes are hyphenated).
const ATTR: Record<string, string> = {
  className: 'class', htmlFor: 'for',
  strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin',
  fillRule: 'fill-rule', clipRule: 'clip-rule', strokeMiterlimit: 'stroke-miterlimit',
}
// Kept as written (React passes these through in camelCase).
const KEEP = new Set(['viewBox', 'role', 'href', 'id', 'title', 'alt', 'src', 'width', 'height', 'fill', 'stroke', 'd', 'colSpan', 'rowSpan', 'tabIndex'])
const KEEP_NAME: Record<string, string> = { colSpan: 'colspan', rowSpan: 'rowspan', tabIndex: 'tabindex' }

/** React's escape (escapeTextForBrowser): & < > " ' — the same five, the same entities. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#x27;'))
}
const hyphenate = (k: string) => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()))
function styleOf(style: Record<string, unknown>): string {
  return Object.entries(style)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean')
    .map(([k, v]) => {
      if (typeof v === 'number' && v !== 0 && !k.startsWith('--')) throw new Error(`[static-markup] unitless number for style ${k}`)
      return `${hyphenate(k)}:${String(v).trim()}`
    })
    .join(';')
}

function attrs(props: Record<string, unknown>): string {
  let out = ''
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'dangerouslySetInnerHTML' || k === 'key' || k === 'ref') continue
    if (/^on[A-Z]/.test(k)) continue                               // handlers: static HTML has none
    if (v === null || v === undefined || v === false && !/^(aria|data)-/.test(k)) continue
    if (k === 'style') { const s = styleOf(v as Record<string, unknown>); if (s) out += ` style="${esc(s)}"`; continue }
    let name: string
    if (ATTR[k]) name = ATTR[k]
    else if (/^(aria|data)-/.test(k)) name = k
    else if (KEEP.has(k)) name = KEEP_NAME[k] ?? k
    else if (/^[a-z]+$/.test(k)) name = k
    else throw new Error(`[static-markup] attribute ${k} is not one this serializer knows`)
    if (typeof v === 'function' || typeof v === 'object') throw new Error(`[static-markup] attribute ${k} is not a primitive`)
    out += v === true && !/^(aria|data)-/.test(k) ? ` ${name}=""` : ` ${name}="${esc(String(v))}"`
  }
  return out
}

export function staticMarkup(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string') return esc(node)
  if (typeof node === 'number' || typeof node === 'bigint') return esc(String(node))
  if (Array.isArray(node)) return node.map(staticMarkup).join('')
  if (!isValidElement(node)) throw new Error('[static-markup] not a renderable node')
  const { type } = node
  const props = (node.props ?? {}) as Record<string, unknown> & { children?: ReactNode; dangerouslySetInnerHTML?: { __html: string } }
  if (type === Fragment) return staticMarkup(props.children)
  if (typeof type === 'function') return staticMarkup((type as (p: unknown) => ReactNode)(props))
  if (typeof type !== 'string') throw new Error('[static-markup] unsupported element type')
  if (VOID.has(type)) return `<${type}${attrs(props)}/>`          // React self-closes void elements
  const open = `<${type}${attrs(props)}>`
  const inner = props.dangerouslySetInnerHTML ? props.dangerouslySetInnerHTML.__html : staticMarkup(props.children)
  return `${open}${inner}</${type}>`
}
