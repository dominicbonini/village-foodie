// app/docs/[token]/all/route.ts — "Download all": every document the organiser's link shows today, as one ZIP made on the fly
// (paperwork-1, 4 November 2026). The same check as one file (a live link; its current documents only). STREAMED: each file
// is fetched from the private bucket and written straight out (lib/paperwork/zip.ts), so nothing is assembled in memory first.
// ⚠️ A streamed response is how a function sends more than the 4.5 MB a buffered one may; that it holds for this route on
// Vercel with several 20 MB files is UNVERIFIED until it is tried there (docs/paperwork-1-report.md).
import { createClient } from '@supabase/supabase-js'
import { resolveOrganiserLink } from '@/lib/paperwork/organiser'
import { downloadFile, downloadName } from '@/lib/paperwork/store'
import { safeFileName } from '@/lib/paperwork/model'
import { zipStream, uniqueNames } from '@/lib/paperwork/zip'
import { translatorFor } from '@/lib/i18n/translator'
import { localeForTruck } from '@/lib/i18n/server-locale'
import '@/lib/i18n/catalog/paperwork'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const link = await resolveOrganiserLink(db, decodeURIComponent(token), false)
  if (link.kind !== 'live' || !link.docs.length) return new Response('Not found', { status: 404, headers: NO_STORE })
  const t = translatorFor(await localeForTruck({ country: link.truck.country }), 'paperwork')
  const docs = link.docs.filter(d => d.storagePath)
  const names = uniqueNames(docs.map(d => downloadName(d.typeKey ? t(`types.${d.typeKey}` as never) : (d.customName ?? 'document'), d.mime)))
  const stream = zipStream(docs.map((d, i) => ({ name: names[i], bytes: () => downloadFile(db, d.storagePath!) })))
  return new Response(stream, {
    status: 200,
    headers: { ...NO_STORE, 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${safeFileName(link.truck.name, 'documents')}-documents.zip"` },
  })
}
