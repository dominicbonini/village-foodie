// app/api/reviews/unsubscribe/route.ts — reviews-weather-1 (5 November 2026, docs/reviews-weather-1-report.md).
// The unsubscribe link in a review request email: GET (the link) and POST (one-click, RFC 8058 List-Unsubscribe-Post).
// The token belongs to one request; unsubscribing records an opt-out for that truck and customer (a salted hash).
// 🔴 IT WORKS WHETHER OR NOT THE SWITCHES ARE ON: a link already emailed must keep working. Today no request exists, so every
// token is unknown and every call answers 404 — no customer-facing change. The confirmation's look is to be agreed (plain for now).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseReviewStore } from '@/lib/reviews/store'
import { unsubscribe } from '@/lib/reviews/run'
import { isToken } from '@/lib/reviews/model'
import { translatorFor } from '@/lib/i18n/translator'
import { langAttrOf } from '@/lib/page-lang'
import '@/lib/i18n/catalog/emailReview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const db = () => createClient((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const HEADERS = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow' }

function page(locale: string | null, title: string, body: string, status: number) {
  const lang = langAttrOf(locale)   // ` lang="…"` for a non-English locale, else ''
  const dir = locale?.startsWith('ar') ? ' dir="rtl"' : ''
  return new NextResponse(`<!doctype html><html${lang}${dir}><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="font-family:Arial,sans-serif;color:#334155;max-width:560px;margin:48px auto;padding:0 20px"><h1 style="font-size:22px;color:#0f172a">${esc(title)}</h1>${body ? `<p>${esc(body)}</p>` : ''}</body></html>`, { status, headers: HEADERS })
}

async function handle(req: NextRequest, source: 'link' | 'one_click') {
  const token = new URL(req.url).searchParams.get('t')
  const sb = db()
  const done = isToken(token) ? await unsubscribe(supabaseReviewStore(sb), token, source) : null
  if (!done) {
    if (source === 'one_click') return new NextResponse(null, { status: 404 })
    const t = translatorFor(null, 'emailReview')
    return page(null, t('unsubscribed.invalid'), '', 404)
  }
  if (source === 'one_click') return new NextResponse(null, { status: 200 })
  const { data: truck } = await sb.from('trucks').select('name').eq('id', done.truckId).maybeSingle()
  const t = translatorFor(done.locale, 'emailReview')
  const name = (truck as { name?: string | null } | null)?.name ?? ''
  return page(done.locale, t('unsubscribed.title'), t('unsubscribed.body', { truck: name }), 200)
}

export async function GET(req: NextRequest) { return handle(req, 'link') }
export async function POST(req: NextRequest) { return handle(req, 'one_click') }
