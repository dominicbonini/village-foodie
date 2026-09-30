// lib/outreach-attachments.ts — what may be attached, how big, and where it lives.
//
// 🔴 THE BYTES NEVER TRAVEL THROUGH THE SEND REQUEST. The browser uploads a file straight to a private
// Supabase Storage bucket with a signed URL, and the send is given a PATH. Three reasons, in order:
// a send that carried base64 would blow the serverless body limit on a 9 MB attachment and fail in a
// way that looks like a mail problem; the same bytes would have to be re-uploaded for a retry, so a
// retry could not reproduce the message; and a route that accepts file bytes from a browser is a
// route that has to decide what those bytes are, which is a much larger thing to get right than a
// storage path it wrote itself.
//
// ⚠️ THE BUCKET IS PRIVATE AND STAYS PRIVATE. Nothing here returns a public URL; a download is a
// short-lived signed URL issued to an authenticated admin.
//
// Pure: no Supabase, no network. `scripts/outreach-reply-attach.cjs` proves every rule.

/** What a prospect can be sent. 🔴 AN ALLOW-LIST: anything not named here is refused. */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
}

/** For the file picker. The same list, as extensions. */
export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.values(ALLOWED_ATTACHMENT_TYPES).flat()

/**
 * 🔴 TEN MEGABYTES FOR THE WHOLE EMAIL, NOT PER FILE. Namecheap's SMTP and most receiving servers
 * refuse somewhere between 20 and 25 MB AFTER base64 expansion, which adds a third — so 10 MB of
 * attachments is about 13.5 MB on the wire and leaves room for the message itself. A refusal here is
 * a sentence on screen; the same email refused by the far end is a bounce the prospect never sees and
 * Dominic has to go looking for.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** What is stored on the message row, and what the send reads. */
export interface OutboundAttachment {
  filename: string
  contentType: string
  size: number
  /** 🔴 The object in the private bucket. The ONLY way the send route obtains bytes. */
  storagePath: string
}

export const ATTACHMENT_BUCKET = 'outreach-attachments'

/** The extension of a filename, lower-cased, with its dot. '' when there is none. */
export function extensionOf(filename: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(String(filename ?? '').trim())
  return m ? m[0].toLowerCase() : ''
}

/**
 * A filename safe to put in a storage path and in a `Content-Disposition`.
 * ⚠️ IT IS NOT A SECURITY BOUNDARY ON ITS OWN — the path is built from a uuid the server generates —
 * but a filename carrying `/` or `..` would make the stored object unfindable, and one carrying a
 * newline would break the MIME header it ends up in.
 */
export function safeFilename(filename: string): string {
  const base = String(filename ?? '').split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').replace(/\.\.+/g, '.').trim()
  return cleaned.slice(0, 120) || 'attachment'
}

/**
 * Where one file lives. `prospects/<prospect_id>/<uuid>-<filename>`.
 * 🔴 THE UUID IS FIRST AND THE SERVER MAKES IT, so two files with the same name never collide and a
 * caller cannot choose where its bytes land.
 */
export function storagePathFor(prospectId: string, uuid: string, filename: string): string {
  return `prospects/${prospectId}/${uuid}-${safeFilename(filename)}`
}

/** Is this path inside the prospect's own folder? The download route's check. */
export function pathBelongsToProspect(path: string, prospectId: string): boolean {
  return String(path ?? '').startsWith(`prospects/${prospectId}/`)
}

export interface AttachmentRefusal { refusal: string }

/**
 * May this ONE file be uploaded?
 * ⚠️ TYPE **AND** EXTENSION, BOTH. A browser reports `application/octet-stream` for a .docx often
 * enough that type alone would refuse a legitimate file, and type alone would also accept a .exe
 * renamed and mislabelled. They have to agree.
 */
export function uploadRefusal(file: { filename: string; contentType: string; size: number }): AttachmentRefusal | null {
  const name = safeFilename(file.filename)
  const ext = extensionOf(name)
  const allowedExts = ALLOWED_ATTACHMENT_TYPES[String(file.contentType ?? '').toLowerCase()]
  if (!allowedExts) {
    return { refusal: `${name} is a ${file.contentType || 'file of unknown type'} — only PDF, PNG, JPG, DOCX and XLSX can be attached.` }
  }
  if (!allowedExts.includes(ext)) {
    return { refusal: `${name} does not match its type (${file.contentType}). Rename it with the right extension, or re-export it.` }
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { refusal: `${name} is empty.` }
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { refusal: `${name} is ${mb(file.size)} — one email can carry ${mb(MAX_ATTACHMENT_BYTES)} of attachments in total.` }
  }
  return null
}

/**
 * May this SET of files be sent together?
 * 🔴 THE LIMIT IS THE TOTAL, tested at the moment of sending as well as at upload: three files of
 * 4 MB each pass one at a time and must not pass together.
 */
export function attachmentSetRefusal(files: readonly { filename: string; contentType: string; size: number }[]): AttachmentRefusal | null {
  for (const f of files) {
    const one = uploadRefusal(f)
    if (one) return one
  }
  const total = totalBytes(files)
  if (total > MAX_ATTACHMENT_BYTES) {
    return { refusal: `Those files come to ${mb(total)} — one email can carry ${mb(MAX_ATTACHMENT_BYTES)} in total. Remove one.` }
  }
  return null
}

export const totalBytes = (files: readonly { size: number }[]): number =>
  files.reduce((n, f) => n + (Number.isFinite(f.size) ? f.size : 0), 0)

/** "2.4 MB" / "236 KB" — the unit a person would use for a file this size. */
export function mb(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Read what is stored on a message row back into attachments the send can fetch. */
export function parseOutboundAttachments(value: unknown): OutboundAttachment[] {
  if (!Array.isArray(value)) return []
  const out: OutboundAttachment[] = []
  for (const raw of value) {
    const a = raw as Partial<OutboundAttachment>
    if (!a || typeof a !== 'object') continue
    // ⚠️ NO PATH, NO ATTACHMENT. An inbound message's stored metadata has filename/type/size and no
    // `storagePath` — those are names of files in somebody else's email that were never downloaded,
    // and a retry must not invent a path for them.
    if (typeof a.storagePath !== 'string' || !a.storagePath) continue
    out.push({
      filename: safeFilename(String(a.filename ?? 'attachment')),
      contentType: String(a.contentType ?? 'application/octet-stream'),
      size: typeof a.size === 'number' ? a.size : 0,
      storagePath: a.storagePath,
    })
  }
  return out
}

/** The name the plans PDF is attached under. 🔴 The date is in the name so a folder of them sorts. */
export const plansPdfFilename = (d: Date = new Date()): string =>
  `hatchgrab-plans-and-features-${d.toISOString().slice(0, 10)}.pdf`
