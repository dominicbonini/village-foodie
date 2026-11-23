// app/api/admin/inbox/route.ts — Admin › Inbox (inbox-1, 23 November 2026; docs/inbox-1-report.md).
//   GET  ?view=count            the emails waiting (the nav's number)
//   GET  ?view=list             every conversation with a waiting email, and the counts per type
//   GET  ?view=thread&key=…     one conversation in full, with its draft
//   POST action 'draft'         make the draft for a conversation that has none (no model → "Drafting isn't switched on yet.")
//   POST action 'update_reply'  rewrite the English with Dominic's comment (an empty comment → "Add a comment first.")
//   POST action 'send'          🔴 THE ONLY SEND — lib/inbox/send.ts — when Dominic presses Send. Nothing is ever sent from anywhere else.
//   POST action 'mark_done' / 'snooze'   a prospect's or partner's waiting emails through the Today timeline's own actions; an enquiry closed
//                                        or snoozed on its own row
//   POST action 'signed_upload' / 'plans_pdf'  an enquiry's or partner's attachment (a prospect's go through /api/admin/outreach/attachments)
// 🔴 404 for anyone who is not an admin, as every admin route. Prospects come from the Today route's own GET and prospect / partner replies
// go through their own send routes — each called as it is, with this request's sign-in.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { GET as todayGET } from '@/app/api/admin/outreach/today/route'
import { POST as timelinePOST } from '@/app/api/admin/outreach/timeline/route'
import { POST as outreachSendPOST } from '@/app/api/admin/outreach/mail-send/route'
import { POST as partnerSendPOST } from '@/app/api/admin/partners/mail-send/route'
import { loadInbox, loadThread } from '@/lib/inbox/read-model'
import { ensureDraft, reviseDraft, type DraftDeps } from '@/lib/inbox/drafting'
import { sendReply, enquiryStoragePath, type SendDeps } from '@/lib/inbox/send'
import { inboxModel, draftingConfigured } from '@/lib/inbox/model-server'
import { readPackInputs } from '@/lib/enquiries/answer-pack-server'
import { resolveAccounts, accountForInboxReply } from '@/lib/outreach-mail-accounts'
import { readFromName } from '@/lib/outreach-settings-read'
import { isSnoozeOption, snoozeUntil } from '@/lib/outreach-attention'
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, safeFilename, uploadRefusal, plansPdfFilename, type OutboundAttachment } from '@/lib/outreach-attachments'
import { partnerStoragePath } from '@/lib/partners'
import { generatePlansPdf } from '@/lib/plans-pdf'
import type { WaitingReply } from '@/lib/outreach-today'
import { parseKey } from '@/lib/inbox/types'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const refuse = (message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, refusal: message, ...extra }, { status: 200 })

/** Call another admin route's handler in this process, with this request's own sign-in (cookies / Bearer). */
async function call(handler: (r: NextRequest) => Promise<Response>, req: NextRequest, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = new Headers(req.headers)
  headers.delete('content-length')
  if (body) headers.set('content-type', 'application/json')
  const r = await handler(new NextRequest(new URL(path, req.url), body ? { method: 'POST', headers, body: JSON.stringify(body) } : { method: 'GET', headers }))
  return (await r.json().catch(() => ({ ok: false, refusal: `The server answered ${r.status}.` }))) as Record<string, unknown>
}

/** The Today screen's "Replies waiting", exactly as Today reads it. */
const todayWaiting = (req: NextRequest) => async (): Promise<WaitingReply[]> => {
  const j = await call(todayGET as never, req, '/api/admin/outreach/today')
  return j.ok === true && j.migrationApplied === true && Array.isArray(j.waiting) ? (j.waiting as WaitingReply[]) : []
}

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const view = req.nextUrl.searchParams.get('view') ?? 'list'
  const now = new Date()
  try {
    if (view === 'thread') {
      const ctx = await loadThread(supabase, now, req.nextUrl.searchParams.get('key') ?? '', todayWaiting(req))
      if (!ctx) return refuse('That conversation is not in the inbox any more.')
      return NextResponse.json({ ...ctx.thread, drafting: draftingConfigured(), draftHeld: ctx.thread.draft ? null : (draftingConfigured() ? null : 'no_model') })
    }
    const inbox = await loadInbox(supabase, now, todayWaiting(req))
    if (view === 'count') return NextResponse.json({ ok: true, waiting: inbox.counts.all, counts: inbox.counts })
    return NextResponse.json({ ok: true, conversations: inbox.conversations, counts: inbox.counts, drafting: draftingConfigured() })
  } catch (err) {
    return refuse(`The inbox could not be read (${String(err instanceof Error ? err.message : err).split('\n')[0].slice(0, 160)}).`)
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Bad body' }, { status: 400 }) }
  const action = String(body.action ?? '')
  const key = String(body.key ?? '')
  const k = parseKey(key)
  if (!k) return NextResponse.json({ error: 'key required' }, { status: 400 })
  const now = new Date()
  const started = Date.now()

  // ── attachments (an enquiry's or a partner's; a prospect's use the outreach attachments route as the CRM does) ─────────────
  if (action === 'signed_upload') {
    if (k.kind !== 'enquiry') return refuse('Attach files to a prospect or partner through their own upload.')
    const filename = safeFilename(String(body.filename ?? ''))
    const contentType = String(body.content_type ?? '')
    const size = Number(body.size ?? 0)
    const stop = uploadRefusal({ filename, contentType, size })
    if (stop) return refuse(stop.refusal)
    const path = enquiryStoragePath(k.id, crypto.randomUUID(), filename)
    const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return refuse(`That file could not be prepared for upload (${error?.message ?? 'no signed URL'}).`)
    const attachment: OutboundAttachment = { filename, contentType, size, storagePath: path }
    return NextResponse.json({ ok: true, signedUrl: data.signedUrl, token: data.token, path, attachment })
  }
  if (action === 'plans_pdf') {
    if (k.kind === 'prospect') return refuse('A prospect’s plans PDF comes from the outreach attachments route.')
    let country = 'GB'
    if (k.kind === 'enquiry') {
      const { data } = await supabase.from('enquiries').select('country').eq('id', k.id).maybeSingle()
      const c = String((data as { country?: string } | null)?.country ?? '').toUpperCase(); if (/^[A-Z]{2}$/.test(c)) country = c
    } else {
      const { data } = await supabase.from('partner_orgs').select('country_code').eq('id', k.id).maybeSingle()
      const c = String((data as { country_code?: string } | null)?.country_code ?? '').toUpperCase(); if (/^[A-Z]{2}$/.test(c)) country = c
    }
    let pdf: Buffer
    try { pdf = await generatePlansPdf(country) } catch { return refuse('The plans PDF could not be generated just now. Try again.') }
    if (pdf.byteLength > MAX_ATTACHMENT_BYTES) return refuse('The generated plans PDF is larger than the 10 MB an email can carry.')
    const filename = plansPdfFilename()
    const path = k.kind === 'enquiry' ? enquiryStoragePath(k.id, crypto.randomUUID(), filename) : partnerStoragePath(k.id, crypto.randomUUID(), filename)
    const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false })
    if (error) return refuse(`The plans PDF could not be stored (${error.message}).`)
    return NextResponse.json({ ok: true, attachment: { filename, contentType: 'application/pdf', size: pdf.byteLength, storagePath: path } satisfies OutboundAttachment })
  }

  const ctx = await loadThread(supabase, now, key, todayWaiting(req)).catch(() => null)
  if (!ctx) return refuse('That conversation is not in the inbox any more.')

  // ── Mark done / Snooze ───────────────────────────────────────────────────────────────────────────────────────────────
  if (action === 'mark_done' || action === 'snooze') {
    const option = body.option
    if (action === 'snooze' && !isSnoozeOption(option)) return NextResponse.json({ error: 'Invalid snooze option' }, { status: 400 })
    if (k.kind === 'enquiry') {
      const patch = action === 'mark_done' ? { status: 'closed', snoozed_until: null } : { snoozed_until: snoozeUntil(option as never, now).toISOString() }
      const { error } = await supabase.from('enquiries').update({ ...patch, updated_at: now.toISOString() }).eq('id', k.id)
      if (error) return refuse(`That could not be saved (${error.message}).`)
      return NextResponse.json({ ok: true, message: action === 'mark_done' ? 'Marked done.' : 'Snoozed.' })
    }
    // the Today timeline's own actions, per waiting email — the same columns, the same rule
    for (const id of await waitingIdsOf(ctx)) {
      const last = await call(timelinePOST as never, req, '/api/admin/outreach/timeline', action === 'mark_done' ? { action: 'mark_handled', message_id: id } : { action: 'snooze', message_id: id, option })
      if (last.ok !== true) return refuse(String(last.refusal ?? last.error ?? 'That could not be saved.'))
    }
    return NextResponse.json({ ok: true, message: action === 'mark_done' ? 'Marked done.' : 'Snoozed.' })
  }

  const deadline = started + 50_000
  const model = action === 'draft' || action === 'update_reply' || action === 'send' ? await inboxModel(supabase, deadline) : null
  const draftDeps: DraftDeps = { db: supabase, model, packInputs: c => readPackInputs(c), now: () => new Date() }

  if (action === 'draft') {
    const r = await ensureDraft(draftDeps, ctx)
    return NextResponse.json(r.ok ? { ok: true, draft: r.draft } : { ok: false, refusal: r.refusal, held: r.held ?? null })
  }
  if (action === 'update_reply') {
    const r = await reviseDraft(draftDeps, ctx, { english: String(body.english ?? ''), comment: String(body.comment ?? '') })
    return NextResponse.json(r.ok ? { ok: true, draft: r.draft, message: r.message } : { ok: false, refusal: r.refusal, held: r.held ?? null })
  }
  if (action === 'send') {
    const hello = accountForInboxReply(resolveAccounts())
    const deps: SendDeps = {
      ...draftDeps,
      sendProspect: b => call(outreachSendPOST as never, req, '/api/admin/outreach/mail-send', b),
      sendPartner: b => call(partnerSendPOST as never, req, '/api/admin/partners/mail-send', b),
      hello: hello ? { user: hello.user, pass: hello.pass } : null,
      fromName: () => readFromName(supabase),
    }
    const idem = typeof body.idempotency_key === 'string' && body.idempotency_key ? body.idempotency_key.slice(0, 200) : null
    return NextResponse.json(await sendReply(deps, ctx, { english: String(body.english ?? ''), attachments: body.attachments, idempotencyKey: idem }))
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

/** The waiting emails of a prospect or partner conversation (the ones Mark done / Snooze apply to). */
async function waitingIdsOf(ctx: NonNullable<Awaited<ReturnType<typeof loadThread>>>): Promise<string[]> {
  const latest = ctx.thread.conversation.latestInboundId
  const base = supabase.from('outreach_messages').select('id, status, is_test, handled_at, message_date')
  const { data } = await (ctx.kind === 'prospect' ? base.eq('prospect_id', ctx.id) : base.eq('partner_id', ctx.id))
    .eq('direction', 'inbound').eq('status', 'received').eq('is_test', false).is('handled_at', null)
  const ids = ((data ?? []) as { id: string }[]).map(r => r.id)
  return ids.length ? ids : [latest]
}
