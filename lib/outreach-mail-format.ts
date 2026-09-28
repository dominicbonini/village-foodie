// lib/outreach-mail-format.ts — the pure half of the mailbox diagnostic: redaction, skeletonisation and
// the shapes the route reports. No IMAP, no database, no I/O of any kind, so every rule here is provable
// by scripts/outreach-mail-format.cjs without a mailbox.
//
// WHY THE FORMAT IS BEING CAPTURED AT ALL: outreach has been sent by hand from Outlook, and the templates
// that will replace it must produce a message a prospect cannot tell apart from the ones already sent.
// That means the real headers, the real MIME tree and the real HTML — the markup, not the words.
//
// ⚠️ THE WORDS ARE NOT THE POINT, AND ARE DELIBERATELY THROWN AWAY. Body text is replaced by its LENGTH,
// so the shape of a paragraph survives and its content does not. The signature is the exception: it is
// boilerplate Dominic wrote once and needs to reproduce verbatim.

/** One header, exactly as stored, in the order the message carries it. */
export interface RawHeader { name: string; value: string }

/**
 * Redact IP addresses inside `Received:` headers.
 *
 * 🔴 ONLY INSIDE Received LINES. Those are the hop-by-hop trace a mail server writes, and they carry the
 * sending host's address — Dominic's home or office IP among them. Nothing else in a header block is an
 * address worth hiding, and a blanket IP regex over every header would mangle a `Message-ID` or a DKIM
 * signature that happens to contain four dot-separated numbers.
 *
 * IPv4 → first octet + `.x`; IPv6 → first segment + `.x`, per the brief.
 */
export function redactReceivedIps(headers: RawHeader[]): RawHeader[] {
  return headers.map(h => {
    if (h.name.toLowerCase() !== 'received') return h
    let v = h.value
    // IPv6 first: an IPv4-mapped form (::ffff:1.2.3.4) must not be half-eaten by the IPv4 pass below.
    v = v.replace(/\b(?:[0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}(?:%[0-9A-Za-z]+)?\b/g, m => {
      const first = m.split(':')[0]
      return `${first === '' ? '::' : first}.x`
    })
    v = v.replace(/\b(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, (_m, first) => `${first}.x`)
    return { name: h.name, value: v }
  })
}

/**
 * Parse a raw RFC822 header block into ordered name/value pairs, unfolding continuation lines.
 * Order and spelling are preserved exactly: the point of the capture is what Outlook actually emits.
 */
export function parseHeaderBlock(raw: string): RawHeader[] {
  const out: RawHeader[] = []
  // Normalise line endings for splitting only; the VALUES keep their own internal folding whitespace.
  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    if (!line) continue
    if (/^[ \t]/.test(line) && out.length) { out[out.length - 1].value += '\n' + line; continue }
    const i = line.indexOf(':')
    if (i <= 0) continue
    out.push({ name: line.slice(0, i), value: line.slice(i + 1).replace(/^ /, '') })
  }
  return out
}

/** The nested body structure, flattened to the fields that describe a format. */
export interface MimeNode {
  part: string | null
  type: string
  charset: string | null
  encoding: string | null
  disposition: string | null
  filename: string | null
  size: number | null
  children?: MimeNode[]
}

interface StructureLike {
  part?: string; type: string
  parameters?: Record<string, string>
  encoding?: string; size?: number
  disposition?: string
  dispositionParameters?: Record<string, string>
  childNodes?: StructureLike[]
}

export function mimeTreeFrom(node: StructureLike): MimeNode {
  const params = node.parameters ?? {}
  const dparams = node.dispositionParameters ?? {}
  const out: MimeNode = {
    part: node.part ?? null,
    type: node.type,
    charset: params.charset ?? null,
    encoding: node.encoding ?? null,
    disposition: node.disposition ?? null,
    // Outlook puts the name on either the content type or the disposition; read both.
    filename: dparams.filename ?? params.name ?? null,
    size: typeof node.size === 'number' ? node.size : null,
  }
  if (node.childNodes?.length) out.children = node.childNodes.map(mimeTreeFrom)
  return out
}

/** Every attachment in a structure — metadata only; nothing is ever downloaded. */
export function attachmentsOf(node: StructureLike): { filename: string | null; contentType: string; size: number | null }[] {
  const out: { filename: string | null; contentType: string; size: number | null }[] = []
  const walk = (n: StructureLike) => {
    const dparams = n.dispositionParameters ?? {}
    const params = n.parameters ?? {}
    const name = dparams.filename ?? params.name ?? null
    if ((n.disposition ?? '').toLowerCase() === 'attachment' || (name && !n.childNodes?.length)) {
      out.push({ filename: name, contentType: n.type, size: typeof n.size === 'number' ? n.size : null })
    }
    for (const c of n.childNodes ?? []) walk(c)
  }
  walk(node)
  return out
}

/** Find the first part of a given content type, returning its part number for a targeted fetch. */
export function findPart(node: StructureLike, type: string): { part: string; encoding: string | null; charset: string | null } | null {
  let found: { part: string; encoding: string | null; charset: string | null } | null = null
  const walk = (n: StructureLike) => {
    if (found) return
    if (n.type?.toLowerCase() === type && n.part) {
      found = { part: n.part, encoding: n.encoding ?? null, charset: (n.parameters ?? {}).charset ?? null }
      return
    }
    for (const c of n.childNodes ?? []) walk(c)
  }
  walk(node)
  // A single-part message has no `part` number; IMAP addresses its body as section 1.
  if (!found && node.type?.toLowerCase() === type) {
    return { part: '1', encoding: node.encoding ?? null, charset: (node.parameters ?? {}).charset ?? null }
  }
  return found
}

/** Where the signature starts. Case-insensitive; the brief names this phrase exactly. */
const SIGNATURE_MARK = /kind regards/i
/**
 * A quoted-message header line, as Outlook writes it when a reply includes the original.
 * 🔴 THIS IS WHAT ENDS A SIGNATURE RUN. See `skeletoniseHtml`.
 */
const QUOTE_HEADER = /^\s*(From|Sent|To|Cc|Bcc|Subject|Date|Reply-To)\s*:/i
/**
 * The same labels, but with NOTHING after the colon.
 * 🔴 OUTLOOK BOLDS THE LABEL, WHICH SPLITS THE LINE IN TWO. `<b>From:</b> Dominic Bonini` is two text
 * nodes — `From:` and ` Dominic Bonini` — so matching only the first kept the label verbatim and then
 * MEASURED the value, cutting the quote's header block in half. A bare label therefore says "the next
 * text node is my value, keep it too". A label that already carries its value on the same node claims no
 * follow-on, so an ordinary body line after a one-node header is still measured.
 */
const QUOTE_HEADER_LABEL_ONLY = /^\s*(From|Sent|To|Cc|Bcc|Subject|Date|Reply-To)\s*:\s*$/i

export interface SkeletonResult { text: string; capped: boolean }

const CAP = 40_000
const cap = (s: string): SkeletonResult =>
  s.length > CAP ? { text: s.slice(0, CAP), capped: true } : { text: s, capped: false }

/**
 * ── 🔴 THE SKELETON RULE, AND THE ONE PLACE THE BRIEF NEEDED RECONCILING ───────────────────────────
 *
 * Markup is kept byte for byte: every tag, every attribute, every `style=`, `class=`, `<br>`, `<p>` and
 * every space between them. Only TEXT NODES are replaced, each by `[text:N]` where N is its length.
 *
 * Two rules from the brief meet here:
 *   • "every text node BEFORE the one containing 'Kind regards' replaced … from 'Kind regards' onward
 *     (the signature) keep text verbatim"; and
 *   • "if the message quotes an earlier email … keep the quote's header block verbatim and SKELETONISE
 *     THE QUOTED BODY TEXT the same way".
 * Read literally, the first makes the second impossible: a chase quotes an earlier mail that ends in its
 * own "Kind regards", so "verbatim from there on" would swallow the quoted body the second rule asks to
 * skeletonise. So "Kind regards" opens a SIGNATURE RUN rather than switching the whole document, and a
 * quote header line (`From:`, `Sent:`, `To:`, `Subject:` …) CLOSES it — those lines are themselves kept
 * verbatim, and the quoted body after them goes back to being measured. A second "Kind regards" inside
 * the quote opens the next run. Both sentences then hold, which a strict reading of either alone does not.
 *
 * ⚠️ `<style>`, `<script>` and comment contents are NOT text nodes for this purpose and stay verbatim —
 * they are markup, they carry no prospect's words, and a mangled stylesheet would misrepresent the format
 * this capture exists to record.
 */
export function skeletoniseHtml(html: string): SkeletonResult {
  let out = ''
  let i = 0
  let inSignature = false
  /** Set by a bare quote-header label; makes the next text node (its value) verbatim too. */
  let expectHeaderValue = false
  /** Inside <style>/<script>: contents are markup, pass them through. */
  let rawUntil: string | null = null

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt === -1) { out += renderText(html.slice(i)); break }
    if (lt > i) out += renderText(html.slice(i, lt))

    // A comment or CDATA runs to its own terminator and is copied whole.
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt)
      const stop = end === -1 ? html.length : end + 3
      out += html.slice(lt, stop); i = stop; continue
    }
    const gt = html.indexOf('>', lt)
    if (gt === -1) { out += html.slice(lt); break }
    const tag = html.slice(lt, gt + 1)
    out += tag
    i = gt + 1

    const nameMatch = /^<\s*(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(tag)
    const closing = nameMatch?.[1] === '/'
    const name = nameMatch?.[2]?.toLowerCase() ?? ''
    if (!closing && (name === 'style' || name === 'script') && !tag.endsWith('/>')) rawUntil = name
    else if (closing && name === rawUntil) rawUntil = null
    if (rawUntil && !closing && name === rawUntil) {
      // copy the raw block through to its closing tag, untouched
      const close = html.toLowerCase().indexOf(`</${rawUntil}`, i)
      const stop = close === -1 ? html.length : close
      out += html.slice(i, stop); i = stop
    }
  }
  return cap(out)

  function renderText(chunk: string): string {
    if (rawUntil) return chunk                       // inside <style>/<script>: markup, not prose
    // Whitespace-only runs (indentation between tags) are layout, not content — keep them, or the
    // captured skeleton would not resemble the message it came from.
    if (!chunk.trim()) return chunk
    if (QUOTE_HEADER.test(chunk)) {
      inSignature = false                                   // the quote's own header block
      expectHeaderValue = QUOTE_HEADER_LABEL_ONLY.test(chunk)
      return chunk
    }
    if (expectHeaderValue) { expectHeaderValue = false; return chunk }     // the bolded label's value
    if (SIGNATURE_MARK.test(chunk)) { inSignature = true; return chunk }   // the signature run opens here
    if (inSignature) return chunk
    return `[text:${chunk.length}]`
  }
}

/**
 * The same rule for `text/plain`, line by line — a plain part has no tags, so the unit is the line.
 * Blank lines are kept so the shape of the message survives.
 */
export function skeletonisePlain(text: string): SkeletonResult {
  let inSignature = false
  const out = text.split('\n').map(line => {
    if (!line.trim()) return line
    if (QUOTE_HEADER.test(line)) { inSignature = false; return line }
    if (SIGNATURE_MARK.test(line)) { inSignature = true; return line }
    if (inSignature) return line
    return `[text:${line.length}]`
  }).join('\n')
  return cap(out)
}

/** Lower-cased addresses from an envelope address list, for matching. */
export function addressesOf(list: { address?: string | null }[] | undefined | null): string[] {
  return (list ?? []).map(a => (a.address ?? '').trim().toLowerCase()).filter(Boolean)
}

/**
 * Same calendar day in one fixed zone.
 * 🔴 DATE, NOT ORDER, AND NOT A TIMESTAMP. `outreach_contacts.contacted_at` on a manually dated row is
 * midnight, so two rows on one day carry the same instant and their stored order says nothing. Matching
 * on the DAY is the only comparison the data supports — §57's ladder is derived, not sequenced.
 */
export function sameDay(a: Date | string | null | undefined, b: Date | string | null | undefined, tz = 'Europe/London'): boolean {
  const key = (v: Date | string | null | undefined) => {
    if (!v) return null
    const d = v instanceof Date ? v : new Date(v)
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  }
  const ka = key(a), kb = key(b)
  return !!ka && ka === kb
}
