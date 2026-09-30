// lib/outreach-attachment-store.ts — reading attachment bytes back out of the private bucket.
//
// 🔴 THIS IS THE ONLY WAY A SEND OBTAINS FILE CONTENT, and it is the reason the send request carries
// paths instead of bytes: the same three callers that re-compose a message — Send, Retry and Save to
// Sent — all read from here, so all three produce the SAME attachment parts. A retry that re-uploaded
// from the browser could not, and the Sent copy would differ from what the prospect received.
//
// ⚠️ NOTHING IS CACHED. A message is composed once per send; caching megabytes per row in a
// serverless container buys nothing and is the kind of thing that runs a container out of memory
// three requests later.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, totalBytes, mb, type OutboundAttachment,
} from '@/lib/outreach-attachments'

/** One attachment, ready for nodemailer. */
export interface LoadedAttachment {
  filename: string
  contentType: string
  content: Buffer
}

export type LoadResult =
  | { ok: true; attachments: LoadedAttachment[] }
  | { ok: false; refusal: string }

/**
 * Fetch every attachment's bytes by storage path.
 *
 * 🔴 ALL OR NOTHING. A message that quietly went without one of its attachments would be worse than
 * one that refused: Dominic would believe the plans PDF had gone, and the prospect would have a reply
 * referring to a document that is not there.
 * 🔴 AND THE TOTAL IS CHECKED AGAIN HERE, against the REAL sizes on disk rather than the sizes the
 * browser reported. The upload check reads what the file input claimed; this reads what actually
 * arrived, which is the number the mail server will see.
 */
export async function loadAttachments(
  supabase: SupabaseClient, attachments: readonly OutboundAttachment[],
): Promise<LoadResult> {
  if (!attachments.length) return { ok: true, attachments: [] }
  const out: LoadedAttachment[] = []
  for (const a of attachments) {
    const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).download(a.storagePath)
    if (error || !data) {
      // ⚠️ THE FILENAME IS IN THE REFUSAL AND NOWHERE ELSE. It is shown to the operator, who needs to
      // know WHICH file is missing; it is not written to a server log.
      return { ok: false, refusal: `${a.filename} could not be read back from storage, so nothing was sent. Attach it again.` }
    }
    const buf = Buffer.from(await data.arrayBuffer())
    out.push({ filename: a.filename, contentType: a.contentType, content: buf })
  }
  const total = totalBytes(out.map(a => ({ size: a.content.byteLength })))
  if (total > MAX_ATTACHMENT_BYTES) {
    return { ok: false, refusal: `Those attachments come to ${mb(total)} — one email can carry ${mb(MAX_ATTACHMENT_BYTES)}. Remove one and try again.` }
  }
  return { ok: true, attachments: out }
}
