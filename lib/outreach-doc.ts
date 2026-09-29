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

// ── THE SCHEMA ──────────────────────────────────────────────────────────────────────────────────────
/** The only two marks. `bold` renders `<b>`; `small` renders 10pt. */
export type DocMark = 'bold' | 'small'
export const ALLOWED_MARKS: readonly DocMark[] = ['bold', 'small']
/** The only three node types. `doc` holds paragraphs; a paragraph holds text and hard breaks. */
export const ALLOWED_NODES = ['doc', 'paragraph', 'text', 'hardBreak'] as const

export interface DocText { type: 'text'; text: string; marks?: { type: DocMark }[] }
export interface DocBreak { type: 'hardBreak' }
export type DocInline = DocText | DocBreak
/** ⚠️ `content` ABSENT IS AN EMPTY PARAGRAPH, which is a blank line — not a missing value. */
export interface DocParagraph { type: 'paragraph'; content?: DocInline[] }
export interface EmailDoc { type: 'doc'; content: DocParagraph[] }

export const EMPTY_DOC: EmailDoc = { type: 'doc', content: [{ type: 'paragraph' }] }

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
export function validateDoc(value: unknown): DocValidation {
  const root = value as EmailDoc | null
  if (!root || typeof root !== 'object' || root.type !== 'doc') {
    return { ok: false, error: 'the message document is missing or is not a document' }
  }
  if (!Array.isArray(root.content)) return { ok: false, error: 'the message document has no paragraphs' }
  const out: DocParagraph[] = []
  for (const p of root.content) {
    const node = p as { type?: unknown; content?: unknown; attrs?: unknown }
    if (node.type !== 'paragraph') {
      return { ok: false, error: `a “${String(node.type)}” block is not allowed in an outreach email` }
    }
    if (node.content === undefined) { out.push({ type: 'paragraph' }); continue }
    if (!Array.isArray(node.content)) return { ok: false, error: 'a paragraph has unreadable content' }
    const inline: DocInline[] = []
    for (const c of node.content) {
      const n = c as { type?: unknown; text?: unknown; marks?: unknown }
      if (n.type === 'hardBreak') { inline.push({ type: 'hardBreak' }); continue }
      if (n.type !== 'text') {
        return { ok: false, error: `a “${String(n.type)}” is not allowed in an outreach email` }
      }
      if (typeof n.text !== 'string') return { ok: false, error: 'a text node has no text' }
      const marks: { type: DocMark }[] = []
      if (n.marks !== undefined) {
        if (!Array.isArray(n.marks)) return { ok: false, error: 'a text node has unreadable formatting' }
        for (const m of n.marks) {
          const t = (m as { type?: unknown }).type
          if (typeof t !== 'string' || !(ALLOWED_MARKS as readonly string[]).includes(t)) {
            return { ok: false, error: `“${String(t)}” formatting is not allowed in an outreach email` }
          }
          if (!marks.some(x => x.type === t)) marks.push({ type: t as DocMark })
        }
      }
      // 🔴 REBUILT, NOT PASSED THROUGH. Only the fields named here survive into the document the
      // server converts, so an extra attribute riding along on a text node cannot reach the HTML.
      inline.push(marks.length ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text })
    }
    out.push(inline.length ? { type: 'paragraph', content: inline } : { type: 'paragraph' })
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
export function docToHtml(doc: EmailDoc): string {
  return doc.content.map(p => {
    const kids = p.content ?? []
    if (!kids.length) return `<div style="${P_STYLE}"><br></div>`
    const texts = kids.filter((k): k is DocText => k.type === 'text')
    // "Entirely small" ignores whitespace-only runs: a trailing space with no mark must not demote a
    // line that is otherwise all 10pt.
    const meaningful = texts.filter(t => t.text.trim() !== '')
    const allSmall = meaningful.length > 0 && meaningful.every(t => hasMark(t, 'small'))
    const inner = kids.map(k => {
      if (k.type === 'hardBreak') return '<br>'
      let html = escapeHtml(k.text)
      if (hasMark(k, 'small') && !allSmall) html = `<span style="${SMALL_STYLE}">${html}</span>`
      if (hasMark(k, 'bold')) html = `<b>${html}</b>`
      return html
    }).join('')
    return `<div style="${allSmall ? SMALL_STYLE : P_STYLE}">${inner}</div>`
  }).join('')
}

/**
 * The same document as text/plain.
 * 🔴 NO HTML, EVER — this is generated from the document's own text nodes, so there is nothing to
 * strip. The previous build had to strip tags out of a plain-text body because the body was a string
 * that might contain them; a document cannot contain a tag, only text that says `<br>`, and that text
 * is what the operator typed and meant.
 */
export function docToText(doc: EmailDoc): string {
  return doc.content
    .map(p => (p.content ?? []).map(k => (k.type === 'hardBreak' ? '\n' : k.text)).join(''))
    .join('\n')
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
