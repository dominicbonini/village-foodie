// lib/outreach-mail-bodies.ts — storing what an email SAYS, so opening it does not mean logging in.
//
// 🔴 WHY THIS EXISTS. View took several seconds on every open: each one connected to IMAP, selected a
// mailbox and downloaded the message, because nothing stored the bodies of imported or polled mail.
// The mailbox is the source of truth for what arrived; it is a terrible source of truth for "show me
// that again". Every path that already has the message open now writes it down, and View reads the
// database.
//
// ⚠️ ATTACHMENT CONTENTS ARE NEVER DOWNLOADED AND NEVER STORED. Only the name, the type and the size,
// which come off the BODYSTRUCTURE the server has already sent — metadata the fetch cost nothing for.
// A prospect's attachment is their file; this app has no reason to hold a copy and every reason not to.
//
// ⚠️ AND THE STORED HTML IS STILL SENDER-CONTROLLED MARKUP. Storing it changes nothing about that: it
// is rendered in the same `sandbox=""` iframe it always was. "It came from our own database" is not a
// provenance claim about the person who wrote it.

/** What the viewer needs, and all it needs. */
export interface StoredBodies {
  html: string | null
  text: string | null
  attachments: AttachmentMeta[]
  /** True when the HTML was longer than the cap and was cut. The viewer says so. */
  truncated: boolean
}

export interface AttachmentMeta {
  filename: string | null
  contentType: string
  size: number | null
}

/**
 * 🔴 ONE MEGABYTE OF HTML IS ALREADY ABSURD FOR AN EMAIL, and the cap is what stops one message
 * making a row nobody can load. A marketing email with inlined images as data: URIs can run to tens of
 * megabytes; storing that would bloat the table, slow every list query that touches the row, and
 * display no better than the first megabyte does.
 * ⚠️ TRUNCATION IS REPORTED, NEVER SILENT. A viewer that quietly shows half an email is worse than one
 * that shows half and says so — the reader would take the missing half for "nothing more was said".
 */
export const HTML_BODY_CAP = 1_000_000
/** The marker appended to a cut body, so the stored value itself carries the fact. */
export const TRUNCATION_MARKER = '<!--hatchgrab:truncated-->'

export function capHtml(html: string | null | undefined): { html: string | null; truncated: boolean } {
  const s = html ?? null
  if (s === null) return { html: null, truncated: false }
  if (s.length <= HTML_BODY_CAP) return { html: s, truncated: false }
  return { html: s.slice(0, HTML_BODY_CAP) + TRUNCATION_MARKER, truncated: true }
}

export function isTruncated(html: string | null | undefined): boolean {
  return typeof html === 'string' && html.endsWith(TRUNCATION_MARKER)
}

/** `attachments` as stored: an array, or null when the message was read without asking. */
export function parseAttachments(value: unknown): AttachmentMeta[] {
  if (!Array.isArray(value)) return []
  const out: AttachmentMeta[] = []
  for (const raw of value) {
    const a = raw as { filename?: unknown; contentType?: unknown; size?: unknown }
    if (!a || typeof a !== 'object') continue
    out.push({
      filename: typeof a.filename === 'string' ? a.filename : null,
      contentType: typeof a.contentType === 'string' ? a.contentType : 'application/octet-stream',
      size: typeof a.size === 'number' ? a.size : null,
    })
  }
  return out
}

/**
 * Has this row got enough stored to render without touching the mailbox?
 * ⚠️ EITHER BODY IS ENOUGH. A plain-text-only email has no HTML and is complete; requiring both would
 * send every one of them back to IMAP forever.
 */
export function hasStoredBody(row: { html_body?: string | null; text_body?: string | null }): boolean {
  return !!(row.html_body ?? '').trim() || !!(row.text_body ?? '').trim()
}

/** The columns to write after reading a message. Shared by the poll, the importer and a live View. */
export function bodyColumns(b: StoredBodies): Record<string, unknown> {
  const capped = capHtml(b.html)
  return {
    html_body: capped.html,
    text_body: b.text,
    // ⚠️ AN EMPTY ARRAY IS A FACT — "we looked, there are none" — and null is "we never looked".
    attachments: b.attachments,
  }
}
