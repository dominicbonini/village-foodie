// lib/outreach-doc.ts — the email as a DOCUMENT, and the only two ways it becomes an email.
//
// 🔴 THE RULE THIS FILE EXISTS TO ENFORCE (29 September 2026): what is in the compose box is what is
// sent. Nothing is appended, nothing is decorated, nothing is inferred. The box shows the message as it
// will arrive; the server turns that same document into the two MIME parts and adds only the quoted
// parent on a reply.
//
// ── WHY A DOCUMENT AND NOT HTML ON THE WIRE ─────────────────────────────────────────────────────────
// The browser could POST the editor's HTML. It must not. HTML from a browser is an open set — a paste
// carries spans, styles, classes, `onerror`, whatever the source had — and "sanitise this HTML" is a
// blocklist, which is the wrong shape of defence for something that gets emailed to strangers under
// Dominic's own name. A DOCUMENT is an allow-list by construction: three node types, two marks, and
// `validateDoc` refuses anything else outright rather than stripping it and hoping. The server then
// GENERATES the HTML from that document, so every byte of markup in the email was written here.
//
// ⚠️ THE MARKUP IS STILL THE CAPTURED OUTLOOK MARKUP. `P_STYLE` and `SMALL_STYLE` are the measured
// values from the real Sent folder; the conversion below produces byte-identical output to the
// token-expansion build it replaces, and `scripts/outreach-mail-send.cjs` asserts that equality
// against a template carrying both tokens. That output was verified in Dominic's inbox.
//
// Pure: no network, no database, no editor, no React. The client builds documents with it and the
// server converts them with it, so the two cannot disagree about what a document means.

/** The captured paragraph style. Every ordinary paragraph and every 12pt run uses exactly this. */
export const P_STYLE = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);'
/** 10pt, expressed the way the captured mail expressed it. The opt-out line, and anything marked Small. */
export const SMALL_STYLE = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 13.333333px; color: rgb(0, 0, 0);'
/**
 * 14pt — the Size menu's "Large" (1 October 2026).
 * 🔴 MODEST ON PURPOSE. The three sizes are 10pt / 12pt / 14pt, and 14 is one step up rather than a
 * heading: this is a business email, and a 24pt line in one would read as shouting. ⚠️ EXPRESSED IN px
 * LIKE `SMALL_STYLE`, AND FOR THE SAME REASON — that constant records the px the captured Outlook mail
 * actually carried (10pt = 13.333333px), so 14pt = 18.666667px keeps the one convention. A `pt` value
 * here would be the only one in the set and would round differently in some clients.
 */
export const LARGE_STYLE = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 18.666667px; color: rgb(0, 0, 0);'

// ── THE SCHEMA ──────────────────────────────────────────────────────────────────────────────────────
/**
 * The only three marks. `bold` renders `<b>`; `small` renders 10pt; `link` renders `<a href>`.
 *
 * 🔴 `link` IS THE ONE MARK THAT CARRIES A VALUE, AND THE VALUE IS THE DANGEROUS PART. A mark with
 * an `href` is a hole in an allow-list unless the href itself is one, so `LINK_RE` below is the
 * whole of the permission: `https://` and nothing else — no `javascript:`, no `data:`, no `http:`,
 * no protocol-relative `//`. An href that does not match is REFUSED, not stripped, exactly as every
 * other schema violation is: a sanitiser that quietly drops the bad half and sends the rest is one
 * nobody ever checks.
 * ⚠️ IT EXISTS BECAUSE THE DEMO LINK HAD TO BE CLICKABLE. "Insert in email" put nothing in the
 * email at all; a bare URL as text would have depended on the recipient's mail client to linkify it.
 */
export type DocMark = 'bold' | 'italic' | 'small' | 'large' | 'link'
export const ALLOWED_MARKS: readonly DocMark[] = ['bold', 'italic', 'small', 'large', 'link']
/**
 * 🔴 THE ONLY hrefs THAT MAY LEAVE THIS APP. Widened on 1 October 2026 from https-only to
 * **https, http and mailto**, by explicit instruction — the toolbar's Link button is for an operator
 * linking to a truck's own site, and plenty of those are still http.
 *
 * 🔴 WHAT IS STILL REFUSED, AND WHY EACH ONE MATTERS: `javascript:` (script execution in any client that
 * honours it), `data:` (a whole document smuggled into an attribute), `vbscript:`, `file:`, and a
 * protocol-relative `//host` (it inherits the viewer's scheme, so it is not a scheme at all). Quotes and
 * angle brackets are refused in every branch, because the value is interpolated into an attribute.
 * ⚠️ ANCHORED AT BOTH ENDS. An unanchored pattern would accept `javascript:alert(1)#https://x` — the
 * trailing `$` is doing as much work here as the leading `^`.
 * ⚠️ IT REFUSES, IT DOES NOT STRIP. `validateDoc` rejects the whole send; see its own note.
 */
export const LINK_RE = /^(?:https?:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s"'<>]*)?|mailto:[^\s"'<>@]+@[a-z0-9.-]+\.[a-z]{2,}(?:\?[^\s"'<>]*)?)$/i
/**
 * The node types. `doc` holds paragraphs and lists; a list holds list items; a list item holds
 * paragraphs; a paragraph holds text and hard breaks.
 * 🔴 LISTS ARRIVED 1 OCTOBER 2026 and are the first NESTING this schema has ever had — which is why
 * `validateDoc` below grew a recursive paragraph check rather than a second copy of the inline loop.
 */
export const ALLOWED_NODES = [
  'doc', 'paragraph', 'bulletList', 'orderedList', 'listItem', 'text', 'hardBreak',
] as const

/** ⚠️ ONLY THE `link` MARK CARRIES `href`, and only an `https://` one. */
export interface DocMarkValue { type: DocMark; href?: string }
export interface DocText { type: 'text'; text: string; marks?: DocMarkValue[] }
export interface DocBreak { type: 'hardBreak' }
export type DocInline = DocText | DocBreak
/** ⚠️ `content` ABSENT IS AN EMPTY PARAGRAPH, which is a blank line — not a missing value. */
export interface DocParagraph { type: 'paragraph'; content?: DocInline[] }
/** 🔴 A LIST ITEM HOLDS PARAGRAPHS, NOT INLINE CONTENT — that is TipTap's `ListItem` shape, and it is
 *  what makes a two-line bullet possible. ⚠️ An empty item is `content: [{ type: 'paragraph' }]`. */
export interface DocListItem { type: 'listItem'; content?: DocParagraph[] }
export interface DocList { type: 'bulletList' | 'orderedList'; content?: DocListItem[] }
/** A top-level block: a paragraph, or a list. */
export type DocBlock = DocParagraph | DocList
export interface EmailDoc { type: 'doc'; content: DocBlock[] }

export const EMPTY_DOC: EmailDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

/** `true` for the two list types — the one place that test is written. */
export const isListBlock = (b: DocBlock): b is DocList =>
  b.type === 'bulletList' || b.type === 'orderedList'

export type DocValidation = { ok: true; doc: EmailDoc } | { ok: false; error: string }

/**
 * 🔴 VALIDATION REFUSES; IT DOES NOT CLEAN. A sanitiser that quietly drops a `<script>` and sends the
 * rest is a sanitiser nobody ever checks, and the first thing it gets wrong goes out under Dominic's
 * name to a business that has never heard of him. Anything outside the schema stops the send and says
 * which node or mark was the problem.
 *
 * ⚠️ THE CLIENT ALSO ENFORCES THE SCHEMA — the editor is configured with these extensions and no
 * others — but the client is not the guard. A document arrives over HTTP; the server is the guard.
 */
/**
 * 🔴 ONE PARAGRAPH, VALIDATED AND REBUILT. Extracted on 1 October 2026 when lists arrived: a list item
 * holds paragraphs, so the paragraph check had to run in two places. 🔴 EXTRACTED RATHER THAN COPIED —
 * a second inline loop is a second allow-list, and the day they drift is the day something unchecked
 * reaches an email.
 * ⚠️ REBUILT, NOT PASSED THROUGH. Only the fields named here survive, so an extra attribute riding
 * along on a text node cannot reach the HTML.
 */
type ParaResult = { ok: true; p: DocParagraph; error?: undefined } | { ok: false; error: string; p?: undefined }
function validateParagraph(value: unknown): ParaResult {
  const node = value as { type?: unknown; content?: unknown }
  if (node.type !== 'paragraph') {
    return { ok: false, error: `a “${String(node.type)}” block is not allowed in an outreach email` }
  }
  if (node.content === undefined) return { ok: true, p: { type: 'paragraph' } }
  if (!Array.isArray(node.content)) return { ok: false, error: 'a paragraph has unreadable content' }
  const inline: DocInline[] = []
  for (const c of node.content) {
    const n = c as { type?: unknown; text?: unknown; marks?: unknown }
    if (n.type === 'hardBreak') { inline.push({ type: 'hardBreak' }); continue }
    if (n.type !== 'text') {
      return { ok: false, error: `a “${String(n.type)}” is not allowed in an outreach email` }
    }
    if (typeof n.text !== 'string') return { ok: false, error: 'a text node has no text' }
    const marks: DocMarkValue[] = []
    if (n.marks !== undefined) {
      if (!Array.isArray(n.marks)) return { ok: false, error: 'a text node has unreadable formatting' }
      for (const m of n.marks) {
        const t = (m as { type?: unknown }).type
        if (typeof t !== 'string' || !(ALLOWED_MARKS as readonly string[]).includes(t)) {
          return { ok: false, error: `“${String(t)}” formatting is not allowed in an outreach email` }
        }
        if (t === 'link') {
          // 🔴 THE href IS CHECKED HERE AND NOWHERE ELSE, AND IT REFUSES. TipTap puts it in
          // `attrs.href`; a mark that arrives with anything else, or with a URL outside `LINK_RE`,
          // stops the send with a sentence naming the link.
          const href = String((m as { attrs?: { href?: unknown } }).attrs?.href ?? (m as { href?: unknown }).href ?? '')
          if (!LINK_RE.test(href)) {
            return { ok: false, error: `“${href || 'that link'}” is not a web or email link, so nothing was sent` }
          }
          if (!marks.some(x => x.type === 'link')) marks.push({ type: 'link', href })
          continue
        }
        if (!marks.some(x => x.type === t)) marks.push({ type: t as DocMark })
      }
    }
    // ⚠️ SMALL AND LARGE ARE MUTUALLY EXCLUSIVE — they are two values of one property (size), and a text
    // node carrying both would render at whichever the HTML writer happened to test first. Refused
    // rather than resolved, because there is no right answer to "10pt and 14pt at once".
    if (marks.some(x => x.type === 'small') && marks.some(x => x.type === 'large')) {
      return { ok: false, error: 'some text is marked both Small and Large, so nothing was sent' }
    }
    inline.push(marks.length ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text })
  }
  return { ok: true, p: inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' } }
}

export function validateDoc(value: unknown): DocValidation {
  const root = value as EmailDoc | null
  if (!root || typeof root !== 'object' || root.type !== 'doc') {
    return { ok: false, error: 'the message document is missing or is not a document' }
  }
  if (!Array.isArray(root.content)) return { ok: false, error: 'the message document has no paragraphs' }
  const out: DocBlock[] = []
  for (const block of root.content) {
    const node = block as { type?: unknown; content?: unknown }

    // ── A LIST ────────────────────────────────────────────────────────────────────────────────────
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      if (node.content !== undefined && !Array.isArray(node.content)) {
        return { ok: false, error: 'a list has unreadable content' }
      }
      const items: DocListItem[] = []
      for (const it of (node.content ?? []) as unknown[]) {
        const item = it as { type?: unknown; content?: unknown }
        if (item.type !== 'listItem') {
          return { ok: false, error: `a “${String(item.type)}” is not allowed inside a list` }
        }
        if (item.content !== undefined && !Array.isArray(item.content)) {
          return { ok: false, error: 'a list item has unreadable content' }
        }
        const paras: DocParagraph[] = []
        for (const ip of (item.content ?? []) as unknown[]) {
          /* 🔴 A NESTED LIST INSIDE AN ITEM IS REFUSED, AND THAT IS A DECISION. Tab indents in the
           * editor, which TipTap implements by nesting a list inside a `listItem` — so this is
           * reachable. It is refused because an inline-styled nested list is one of the least reliable
           * things in Outlook, and a send that arrives with the sub-items flattened or doubly bulleted
           * is worse than one that refuses and says why. ⚠️ If nesting is wanted later, this is the one
           * place to widen, and `docToHtml` would need the matching recursion. */
          const inner = ip as { type?: unknown }
          if (inner.type === 'bulletList' || inner.type === 'orderedList') {
            return { ok: false, error: 'a list inside a list cannot be emailed reliably, so nothing was sent — unindent that item' }
          }
          const r: ParaResult = validateParagraph(ip)
          if (!r.ok) return { ok: false, error: String(r.error) }
          paras.push(r.p as DocParagraph)
        }
        items.push(paras.length ? { type: 'listItem', content: paras } : { type: 'listItem', content: [{ type: 'paragraph' }] })
      }
      // ⚠️ AN EMPTY LIST IS DROPPED, NOT REFUSED. TipTap can leave one behind as the caret exits; it has
      // no text and nothing to render, so it is not an error — it is nothing.
      if (items.length) out.push({ type: node.type, content: items })
      continue
    }

    // ── A PARAGRAPH ───────────────────────────────────────────────────────────────────────────────
    const r: ParaResult = validateParagraph(block)
    if (!r.ok) return { ok: false, error: String(r.error) }
    out.push(r.p as DocParagraph)
  }
  if (!out.length) return { ok: false, error: 'the message document has no paragraphs' }
  return { ok: true, doc: { type: 'doc', content: out } }
}


export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const hasMark = (n: DocText, m: DocMark) => !!n.marks?.some(x => x.type === m)

/**
 * The document → the captured Outlook HTML.
 *
 * 🔴 THE FOUR RULES, AND WHY EACH IS SHAPED AS IT IS:
 *   • a paragraph is one styled div — never a `<p>`, never a margin. Outlook's spacing is literal divs.
 *   • an EMPTY paragraph is that div containing `<br>`. An empty div collapses to nothing in most
 *     clients, so the blank line the operator typed would silently vanish.
 *   • Bold is `<b>` INSIDE the styled div. 🔴 This is the "Dominic Bonini rendered smaller" bug: an
 *     unstyled `<div><b>…</b></div>` inherits the client's default font size.
 *   • a paragraph that is ENTIRELY small becomes a 10pt DIV; small mixed into a 12pt paragraph becomes
 *     a `<span>`. Wrapping the whole line is what the captured opt-out line does, and a div-per-line is
 *     what keeps the generated mail identical to the hand-sent ones.
 */
/**
 * 🔴 ONE PARAGRAPH'S WORTH OF INLINE HTML, plus the size the whole line should be.
 * Extracted with the list work: the same inline rendering is needed inside a `<li>` and inside a
 * `<div>`, and a second copy is a second answer about what bold-inside-small looks like.
 */
function inlineHtml(kids: DocInline[]): { inner: string; lineStyle: string } {
  const texts = kids.filter((k): k is DocText => k.type === 'text')
  // "Entirely small/large" ignores whitespace-only runs: a trailing space with no mark must not demote a
  // line that is otherwise all one size.
  const meaningful = texts.filter(t => t.text.trim() !== '')
  const allSmall = meaningful.length > 0 && meaningful.every(t => hasMark(t, 'small'))
  const allLarge = meaningful.length > 0 && meaningful.every(t => hasMark(t, 'large'))
  const inner = kids.map(k => {
    if (k.type === 'hardBreak') return '<br>'
    let html = escapeHtml(k.text)
    // ⚠️ THE SIZE SPAN IS OMITTED WHEN THE WHOLE LINE IS THAT SIZE — the line's own style carries it,
    // and a span repeating it is bytes every client has to parse for nothing.
    if (hasMark(k, 'small') && !allSmall) html = `<span style="${SMALL_STYLE}">${html}</span>`
    if (hasMark(k, 'large') && !allLarge) html = `<span style="${LARGE_STYLE}">${html}</span>`
    if (hasMark(k, 'bold')) html = `<b>${html}</b>`
    // 🔴 `<i>`, NOT `<em>`. Both are honoured, but Outlook's word-based renderer has decades of `<i>`
    // behind it and `<em>` is the one that occasionally arrives unstyled.
    if (hasMark(k, 'italic')) html = `<i>${html}</i>`
    // ⚠️ THE href IS ESCAPED AND WAS ALREADY VALIDATED. `validateDoc` refuses anything outside
    // `LINK_RE`, so by here the only question left is quoting it into the attribute.
    const link = k.marks?.find(m => m.type === 'link')?.href
    if (link) html = `<a href="${escapeHtml(link)}">${html}</a>`
    return html
  }).join('')
  return { inner, lineStyle: allSmall ? SMALL_STYLE : allLarge ? LARGE_STYLE : P_STYLE }
}

/* ── 🔴 LIST STYLES — INLINE, AND SHAPED FOR OUTLOOK FIRST ─────────────────────────────────────────
 * No classes and no `<style>` block anywhere in a sent email: Gmail strips a `<style>` in some views,
 * and Outlook's Word renderer ignores most of what survives. So the indent and the spacing live on the
 * elements themselves.
 * 🔴 `padding-left`, NOT `margin-left`. Outlook puts the bullet glyph itself inside the padding box;
 * with margin-only indentation the markers land outside the content area and clip at the left edge.
 * 🔴 `margin: 0` ON THE `<ul>`/`<ol>` AND THE SPACING ON THE `<li>`. A default list margin differs
 * between Gmail (1em), Apple Mail and Outlook, so it is zeroed and the rhythm is set once, per item.
 * ⚠️ `mso-*` HINTS ARE DELIBERATELY ABSENT. They would help Outlook and they are also the first thing
 * a future reader would copy into a place they do not belong; the plain properties are honoured well
 * enough by every client in the three the brief names, and the layout degrades to "a bit tighter"
 * rather than "wrong" where they are not. */
const LIST_STYLE = 'margin: 0; padding-left: 24px;'
const LIST_ITEM_STYLE_SUFFIX = ' margin: 0 0 4px;'

export function docToHtml(doc: EmailDoc): string {
  return doc.content.map(block => {
    if (isListBlock(block)) {
      const tag = block.type === 'bulletList' ? 'ul' : 'ol'
      const items = (block.content ?? []).map(item => {
        /* ⚠️ AN ITEM'S PARAGRAPHS ARE JOINED WITH `<br>`, NOT WRAPPED IN `<div>`s. A block element
         * inside an `<li>` pushes the bullet onto its own line in Outlook; a break keeps the marker
         * beside the first line, which is what a two-line bullet should look like. */
        const paras = (item.content ?? []).map(pp => inlineHtml(pp.content ?? []))
        const inner = paras.map(x => x.inner).join('<br>') || '<br>'
        // The item's size follows its FIRST paragraph — a bullet is one line of reading.
        const lineStyle = paras[0]?.lineStyle ?? P_STYLE
        return `<li style="${lineStyle}${LIST_ITEM_STYLE_SUFFIX}">${inner}</li>`
      }).join('')
      return `<${tag} style="${LIST_STYLE}">${items}</${tag}>`
    }
    const kids = block.content ?? []
    if (!kids.length) return `<div style="${P_STYLE}"><br></div>`
    const { inner, lineStyle } = inlineHtml(kids)
    return `<div style="${lineStyle}">${inner}</div>`
  }).join('')
}

/**
 * The same document as text/plain.
 * 🔴 NO HTML, EVER — this is generated from the document's own text nodes, so there is nothing to
 * strip. A document cannot contain a tag, only text that says `<br>`, and that text is what the
 * operator typed and meant.
 *
 * 🔴 LISTS AND LINKS ARE SPELLED OUT, because text/plain has no markup to carry them: a bullet becomes
 * `• `, a numbered item becomes `1. `, and a link becomes `text (url)` so the address survives for a
 * reader whose client shows them the plain part.
 * ⚠️ `text (url)` IS SKIPPED WHEN THE TEXT ALREADY IS THE URL — "https://x (https://x)" is noise.
 */
export function docToText(doc: EmailDoc): string {
  const inlineText = (kids: DocInline[]): string => kids.map(k => {
    if (k.type === 'hardBreak') return '\n'
    const href = k.marks?.find(m => m.type === 'link')?.href
    if (!href) return k.text
    // ⚠️ `mailto:` IS STRIPPED FOR THE READER. "(mailto:dominic@hatchgrab.com)" shows a scheme nobody
    // needs to see; the address is the useful part and is what a reader would copy.
    const shown = href.replace(/^mailto:/i, '')
    return k.text.trim() === shown.trim() ? k.text : `${k.text} (${shown})`
  }).join('')

  return doc.content.map(block => {
    if (isListBlock(block)) {
      return (block.content ?? []).map((item, i) => {
        // ⚠️ THE MARKER IS 1-BASED AND COUNTS ONLY THIS LIST. A continuation across two lists is not a
        // thing this schema can express, so there is no state to carry.
        const marker = block.type === 'bulletList' ? '• ' : `${i + 1}. `
        /* ⚠️ A WRAPPED ITEM'S LATER LINES ARE INDENTED BY THE MARKER'S WIDTH, so a two-line bullet reads
         * as one item rather than as an item and a stray line. */
        const body = (item.content ?? []).map(pp => inlineText(pp.content ?? [])).join('\n')
        const pad = ' '.repeat(marker.length)
        return marker + body.split('\n').join('\n' + pad)
      }).join('\n')
    }
    return inlineText(block.content ?? [])
  }).join('\n')
}

/** Every character of text in the document, for the guards that read prose. */
export function docPlainText(doc: EmailDoc): string {
  return docToText(doc)
}


// ── BUILDING A DOCUMENT ─────────────────────────────────────────────────────────────────────────────

/** One line of a signature, as stored. Mirrors `lib/outreach-signature.ts#SignatureLine`. */
export interface DocLine { text: string; bold?: boolean; small?: boolean }

/** Lines → paragraphs. An empty line becomes an empty paragraph, which renders as the `<br>` div. */
export function paragraphsFromLines(lines: DocLine[]): DocParagraph[] {
  return lines.map(l => {
    if (l.text === '') return { type: 'paragraph' } as DocParagraph
    const marks: { type: DocMark }[] = []
    if (l.bold) marks.push({ type: 'bold' })
    if (l.small) marks.push({ type: 'small' })
    return { type: 'paragraph', content: [marks.length ? { type: 'text', text: l.text, marks } : { type: 'text', text: l.text }] }
  })
}

/**
 * Plain template text → a document.
 * A blank line starts a new paragraph, as it always has; a single newline inside a paragraph is a hard
 * break, as it always has. ⚠️ `<br>` TYPED IN A TEMPLATE IS STILL A LINE BREAK — templates carry them,
 * and the previous build had to honour that too. Everything else is text.
 */
export function paragraphsFromPlain(text: string): DocParagraph[] {
  const src = String(text ?? '').replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, '\n')
  const out: DocParagraph[] = []
  for (const block of src.split(/\n{2,}/)) {
    const lines = block.split('\n')
    if (lines.every(l => l.trim() === '')) { out.push({ type: 'paragraph' }); continue }
    const content: DocInline[] = []
    lines.forEach((l, i) => {
      if (i > 0) content.push({ type: 'hardBreak' })
      if (l !== '') content.push({ type: 'text', text: l })
    })
    out.push(content.length ? { type: 'paragraph', content } : { type: 'paragraph' })
  }
  return out.length ? out : [{ type: 'paragraph' }]
}

/**
 * 🔴 THE TWO TOKENS ARE EXPANDED HERE, ONCE, WHEN THE TEMPLATE IS CHOSEN — and never again.
 * They used to be expanded by the SERVER at send time, because the box was a textarea that could not
 * show bold or 10pt and had to keep them as literal `{{signature}}`. The box can show both now, so the
 * expansion moved to the moment the template is loaded and the result is editable like any other part
 * of the message. The send-time expansion is gone: `validateDocForSend` REFUSES a document that still
 * contains a literal token, because that token would otherwise be emailed verbatim.
 */
export interface DocSettings {
  signatureLines: DocLine[]
  optOut: string | null
}

const SIG_LINE_RE = /^\s*\{\{\s*signature\s*\}\}\s*$/
const OPT_LINE_RE = /^\s*\{\{\s*opt_out\s*\}\}\s*$/

export function docFromTemplateText(text: string, settings: DocSettings): EmailDoc {
  const src = String(text ?? '').replace(/\r\n/g, '\n')
  const out: DocParagraph[] = []
  // A blank line between two blocks is a blank line in the email, so the spacer is explicit.
  src.split(/\n{2,}/).forEach((block, i) => {
    if (i > 0) out.push({ type: 'paragraph' })
    let prose: string[] = []
    const flushProse = () => {
      if (!prose.length) return
      out.push(...paragraphsFromPlain(prose.join('\n')))
      prose = []
    }
    for (const line of block.split('\n')) {
      if (SIG_LINE_RE.test(line)) {
        flushProse()
        out.push(...paragraphsFromLines(settings.signatureLines))
      } else if (OPT_LINE_RE.test(line)) {
        flushProse()
        // ⚠️ AN ABSENT opt-out ROW EXPANDS TO NOTHING HERE, and that is safe because it is visible:
        // the operator is looking at the box, and the missing line is the missing line. The send-time
        // version had to refuse instead, because nobody could see what it had produced.
        if (settings.optOut) out.push(...paragraphsFromLines([{ text: settings.optOut, small: true }]))
      } else {
        prose.push(line)
      }
    }
    flushProse()
  })
  return { type: 'doc', content: out.length ? out : [{ type: 'paragraph' }] }
}

// ── THE SEND-SIDE GUARD ─────────────────────────────────────────────────────────────────────────────
/**
 * 🔴 A LITERAL TOKEN IN THE DOCUMENT IS A REFUSAL, NOT A SUBSTITUTION. Nothing expands tokens at send
 * time any more, so `{{signature}}` typed by hand would be emailed as those thirteen characters. The
 * sentence names the button that does the right thing rather than saying "invalid input".
 */
export function literalTokenRefusal(doc: EmailDoc): string | null {
  const text = docPlainText(doc)
  for (const name of ['signature', 'opt_out']) {
    if (new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(text)) {
      return `Your message still contains {{${name}}} — use Insert ${name === 'signature' ? 'signature' : 'opt-out'} instead.`
    }
  }
  return null
}

/** The four outreach rungs. An email on one of these is a cold approach and wants an opt-out line. */
const LADDER_KINDS = new Set(['1_first_contact', '2_chase_1', '3_chase_2', '4_final_chase'])

/**
 * ⚠️ A WARNING, NOT A REFUSAL, and only one of them now. The "no {{signature}}" warning is gone: the
 * signature is visible in the box, so telling him it is missing would be telling him what he can see.
 * The opt-out warning stays because its absence is the thing that is easy not to notice, and it is a
 * legal line under PECR.
 * 🔴 IT CHECKS THE STORED SENTENCE AGAINST THE TEXT, not a token. The sentence is what a recipient
 * needs; whether it arrived via the button or was typed out is not the point.
 */
export function optOutWarning(doc: EmailDoc, kind: string | null, optOut: string | null): string | null {
  if (!kind || !LADDER_KINDS.has(kind)) return null
  const want = (optOut ?? '').trim()
  if (!want) return null
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  if (norm(docPlainText(doc)).includes(norm(want))) return null
  return 'This outreach email has no opt-out line.'
}

// ── THE FROM HEADER ─────────────────────────────────────────────────────────────────────────────────
/**
 * `Name <address>`, or the bare address when there is no name.
 * ⚠️ NEVER REFUSES. A missing or empty `from_name` row falls back to exactly what was sent before this
 * feature existed. Quoting is left to nodemailer, which encodes a display name correctly (a comma, a
 * quote or a non-ASCII character all need different treatment and getting it wrong here would corrupt
 * the header) — this returns the pair, and `mailFor` hands it over as `{ name, address }`.
 */
export function fromDisplay(name: string | null | undefined, address: string): string {
  const n = (name ?? '').trim()
  return n ? `${n} <${address}>` : address
}

/** Does this display name look like an address? A warning on the settings screen, never a refusal. */
export function fromNameLooksLikeAddress(name: string): boolean {
  return name.includes('@')
}
