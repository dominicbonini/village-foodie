// app/api/admin/faq/route.ts — Admin › FAQ's two routes (faq-1, 1 November 2026; docs/faq-1-report.md §3).
//
//   GET   every section and question, plus the world the check and the preview read (plans, switched-on countries, app flags)
//   POST  one action { action, … } — lib/admin/faq-actions.ts lists them
//
// 🔴 ADMIN ONLY, CHECKED HERE ON THE SERVER; SERVICE ROLE; SERVER ONLY. public.faq_sections and public.faq_items have RLS on and
// no policies, so the browser never touches them. A request that is not from an admin gets 403 (faq-1 asks for 403, where the
// Countries route answers 404). A database error is logged and answered with a plain sentence, never passed through.
// ⚠️ faq-3: after EVERY POST (save, publish, unpublish, reorder, delete — a failed one too, which may have written part) the public
// FAQ's cache is cleared (lib/faq/public.ts), so the English landing pages show the change without a deploy.

import { NextRequest, NextResponse } from 'next/server'
import { adminUser } from '@/lib/auth/admin'
import { serviceFaqStore } from '@/lib/admin/faq-store'
import { listFaq, faqAction, type ActionResult } from '@/lib/admin/faq-actions'
import { clearPublicFaqCache } from '@/lib/faq/public'

export const dynamic = 'force-dynamic'

const forbidden = () => NextResponse.json({ error: 'Admins only.' }, { status: 403 })

function reply<T>(r: ActionResult<T>) {
  return r.ok ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

async function guarded<T>(req: NextRequest, run: (stamp: { by: string; at: string }) => Promise<ActionResult<T>>) {
  const user = await adminUser(req)
  if (!user) return forbidden()
  try {
    return reply(await run({ by: user.email ?? user.id, at: new Date().toISOString() }))
  } catch (e) {
    console.error('[admin/faq]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'That could not be saved just now. Nothing was changed — try again in a moment.' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return guarded(req, () => listFaq(serviceFaqStore))
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { const b = await req.json(); if (b && typeof b === 'object') body = b } catch { /* an empty body is an unknown action */ }
  try {
    return await guarded(req, stamp => faqAction(serviceFaqStore, body, stamp))
  } finally {
    clearPublicFaqCache()
  }
}
