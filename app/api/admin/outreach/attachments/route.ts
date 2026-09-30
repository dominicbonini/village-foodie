// app/api/admin/outreach/attachments/route.ts — getting a file into the private bucket, and back out.
//
// 🔴 THE BYTES NEVER PASS THROUGH THIS ROUTE EITHER. It issues a SIGNED UPLOAD URL and the browser
// PUTs the file straight to Supabase Storage. A 9 MB base64 body would exceed the serverless request
// limit and fail as something that looks like a mail problem; more importantly, a route that accepts
// arbitrary bytes from a browser has to decide what they are, which is a much bigger thing to get
// right than a path this route composed itself.
//
// 🔴 THE PATH IS THE SERVER'S. `prospects/<prospect_id>/<uuid>-<filename>` with a uuid this route
// generates — a caller cannot choose where its bytes land, cannot overwrite another prospect's file,
// and cannot collide with a file of the same name.
//
// ⚠️ THE BUCKET IS PRIVATE AND NOTHING HERE MAKES IT PUBLIC. A download is a signed URL that expires
// in five minutes, issued only to an authenticated admin.
// ⚠️ NO FILENAME, NO SIZE AND NO CONTENT IS LOGGED. §52's rule about not logging message content
// applies to what is attached to one.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, storagePathFor, safeFilename,
  uploadRefusal, pathBelongsToProspect, plansPdfFilename, type OutboundAttachment,
} from '@/lib/outreach-attachments'
import { generatePlansPdf } from '@/lib/plans-pdf'

export const runtime = 'nodejs'
// ⚠️ SIXTY SECONDS BECAUSE OF THE PLANS PDF. Chromium cold-starts and renders an A4 table; the
// signed-URL actions return in milliseconds and are nowhere near this.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const refuse = (message: string) => NextResponse.json({ ok: false, refusal: message }, { status: 200 })

/** How long a download link lives. Long enough to click, short enough not to be worth forwarding. */
const DOWNLOAD_TTL_SECONDS = 300

export async function POST(req: NextRequest) {
  // 🔴 404, NOT 401 — an admin route does not confirm its own existence to an unauthenticated caller.
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const action = String(body.action ?? '')

  // ── AN UPLOAD SLOT ──────────────────────────────────────────────────────────────────────────────
  if (action === 'signed_upload') {
    const prospectId = String(body.prospect_id ?? '')
    if (!prospectId) return NextResponse.json({ error: 'prospect_id required' }, { status: 400 })
    const filename = safeFilename(String(body.filename ?? ''))
    const contentType = String(body.content_type ?? '')
    const size = Number(body.size ?? 0)
    // 🔴 THE ALLOW-LIST IS APPLIED HERE, SERVER-SIDE. The file input's `accept` attribute is a
    // convenience for the picker and is trivially bypassed; this is the rule.
    const stop = uploadRefusal({ filename, contentType, size })
    if (stop) return refuse(stop.refusal)

    const path = storagePathFor(prospectId, crypto.randomUUID(), filename)
    const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return refuse(`That file could not be prepared for upload (${error?.message ?? 'no signed URL'}).`)
    const attachment: OutboundAttachment = { filename, contentType, size, storagePath: path }
    return NextResponse.json({ ok: true, signedUrl: data.signedUrl, token: data.token, path, attachment })
  }

  // ── A DOWNLOAD LINK, FOR AN ADMIN LOOKING AT WHAT WAS SENT ─────────────────────────────────────
  if (action === 'signed_download') {
    const path = String(body.path ?? '')
    const prospectId = String(body.prospect_id ?? '')
    // ⚠️ THE PATH IS CHECKED AGAINST THE PROSPECT IT IS CLAIMED FOR. Everything in this bucket is
    // ours and every caller here is an admin, so this is not a privilege boundary — it is a guard
    // against a mis-linked row handing out a file from a conversation it does not belong to.
    if (!path || !prospectId) return NextResponse.json({ error: 'path and prospect_id required' }, { status: 400 })
    if (!pathBelongsToProspect(path, prospectId)) return refuse('That file does not belong to this prospect.')
    const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET)
      .createSignedUrl(path, DOWNLOAD_TTL_SECONDS)
    if (error || !data) return refuse('That file could not be opened — it may have been removed.')
    return NextResponse.json({ ok: true, url: data.signedUrl, expiresIn: DOWNLOAD_TTL_SECONDS })
  }

  // ── THE PLANS PDF, GENERATED FRESH AND PUT WHERE EVERY OTHER ATTACHMENT LIVES ───────────────────
  // 🔴 GENERATED AT ATTACH TIME, NOT AT SEND TIME, AND THAT IS DELIBERATE. Generating it during the
  // send would put a Chromium cold start inside the same 60 seconds as an SMTP conversation and an
  // IMAP append; and a REGENERATED copy at retry time would be different bytes, so `Retry` and
  // `Save to Sent` could no longer reproduce the message. Uploading it here makes it an ordinary
  // attachment with a storage path, which every one of those paths already handles.
  // ⚠️ IT IS THE SAME DOCUMENT THE ADMIN TOOLBAR DOWNLOADS — one generator, `lib/plans-pdf.ts`.
  if (action === 'plans_pdf') {
    const prospectId = String(body.prospect_id ?? '')
    if (!prospectId) return NextResponse.json({ error: 'prospect_id required' }, { status: 400 })
    let pdf: Buffer
    try {
      pdf = await generatePlansPdf()
    } catch (err) {
      console.error('[outreach/attachments] plans PDF generation failed:', (err as { message?: string })?.message || err)
      return refuse('The plans PDF could not be generated just now. Try again, or attach a saved copy.')
    }
    if (pdf.byteLength > MAX_ATTACHMENT_BYTES) {
      return refuse('The generated plans PDF is larger than the 10 MB an email can carry.')
    }
    const filename = plansPdfFilename()
    const path = storagePathFor(prospectId, crypto.randomUUID(), filename)
    const { error } = await supabase.storage.from(ATTACHMENT_BUCKET)
      .upload(path, pdf, { contentType: 'application/pdf', upsert: false })
    if (error) return refuse(`The plans PDF could not be stored (${error.message}).`)
    const attachment: OutboundAttachment = {
      filename, contentType: 'application/pdf', size: pdf.byteLength, storagePath: path,
    }
    return NextResponse.json({ ok: true, attachment })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
