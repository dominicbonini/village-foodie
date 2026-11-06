// app/docs/[token]/file/[documentId]/route.ts — one document on an organiser's link (paperwork-1, 4 November 2026).
// 🔴 ONLY A DOCUMENT THE LINK SHOWS TODAY: the link must be live (not expired, not turned off) and the document one of its
// CURRENT documents (lib/paperwork/organiser.ts) — any other id on the truck, or any other truck's, is a 404.
// The answer is a redirect to a signed storage URL that lasts SIGNED_URL_SECONDS (the files can be 20 MB, past what a
// function may return). `?download=1` downloads it under its name; otherwise the browser shows it. Nothing is counted here.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOrganiserLink } from '@/lib/paperwork/organiser'
import { signedFileUrl, downloadName } from '@/lib/paperwork/store'
import { translatorFor } from '@/lib/i18n/translator'
import { localeForTruck } from '@/lib/i18n/server-locale'
import '@/lib/i18n/catalog/paperwork'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; documentId: string }> }) {
  const { token, documentId } = await params
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const link = await resolveOrganiserLink(db, decodeURIComponent(token), false)
  const doc = link.kind === 'live' ? link.docs.find(d => d.id === documentId) : undefined
  if (link.kind !== 'live' || !doc?.storagePath) return new NextResponse('Not found', { status: 404, headers: NO_STORE })
  const t = translatorFor(await localeForTruck({ country: link.truck.country }), 'paperwork')
  const name = doc.typeKey ? t(`types.${doc.typeKey}` as never) : (doc.customName ?? 'document')
  const url = await signedFileUrl(db, doc.storagePath, req.nextUrl.searchParams.get('download') ? downloadName(`${link.truck.name} ${name}`, doc.mime) : null)
  if (!url) return new NextResponse('Not found', { status: 404, headers: NO_STORE })
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE })
}
