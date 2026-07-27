// app/api/demo/route.ts
// THE public demo entry point (spec Stage 1-2). Anonymous by design: no name, no email, no account —
// every extra field is friction on the highest-value action a prospect ever takes.
//
// ⚠️ This is the ONLY unauthenticated route in the app that spends money (Gemini) and writes persistent
// rows (truck + van + event + menu + ~10 orders). Abuse protection is therefore in the route itself, not
// deferred to proxy.ts: the proxy's rate-limit scope is a positive allowlist of SCRAPING-prone endpoints
// with tiers (60/min, 3/min) tuned for cheap reads, and neither fits a 10–30s paid operation. Doing it here
// also lets the response say something useful instead of a bare 429.
//
// Three protections, in order of how cheaply they reject:
//   1. size + type cap   — rejected before anything is read into memory or sent to Gemini
//   2. per-IP rate limit — demoRatelimit, 5/hour (see lib/ratelimit.ts for the sizing rationale)
//   3. the work itself   — provisionDemo, which is the expensive part

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionDemo, ProvisionDemoError } from '@/lib/provision-demo'
import { getDemoTemplate } from '@/lib/demo-templates'
import { demoRatelimit } from '@/lib/ratelimit'

// 🔴 THIS ROUTE BLOCKS FOR THE WHOLE PROVISION (Gemini extract + ~85-round-trip commit + event + seed +
// rebuild) — ~40-80s. It had NO maxDuration, so it inherited the PLATFORM DEFAULT (10s on Hobby / 15s on
// Pro), which is far below the real duration: every demo would 504 before provisionDemo finished. Set
// EXPLICITLY to the highest a Vercel Pro Node function permits (300s). ⚠️ REQUIRES THE PRO PLAN — on Hobby
// the cap is 60s, which cannot host an 80s provision; there the route needs an async shape, not a bigger
// number. lib/menu-extract's per-attempt timeout is derived FROM this ceiling (see EXTRACT_TIMEOUT_MS).
export const maxDuration = 300

const supabase = createClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// 10 MB. A phone photo of a menu board is ~2-5 MB; a PDF menu is usually under 2 MB. Well clear of any
// legitimate upload, while stopping someone base64-ing a video into a Gemini request.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const ACCEPTED_PREFIXES = ['image/']
const ACCEPTED_EXACT = ['application/pdf']
// Guards the paste-text path, which has no file size to check.
const MAX_TEXT_CHARS = 20_000

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : '127.0.0.1'
}

export async function POST(req: NextRequest) {
  // ── 1. Parse ───────────────────────────────────────────────────────────────────────────────────────
  let file: File | null = null
  let text: string | null = null
  let templateId: string | null = null

  try {
    const form = await req.formData()
    const f = form.get('file')
    file = f instanceof File && f.size > 0 ? f : null
    const t = form.get('text')
    text = typeof t === 'string' && t.trim() ? t.trim() : null
    const tpl = form.get('template')
    templateId = typeof tpl === 'string' && tpl.trim() ? tpl.trim() : null
  } catch {
    return NextResponse.json({ error: 'Could not read your upload — please try again.' }, { status: 400 })
  }

  // ── 2. Cheap rejections BEFORE the rate limit ─────────────────────────────────────────────────────
  // Deliberately ordered this way: a 12 MB video shouldn't consume one of the visitor's five hourly
  // attempts. Malformed input is the user's mistake, not their quota.
  if (file) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `That file is too big (max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB). A normal photo of your menu is fine.` },
        { status: 413 },
      )
    }
    const type = file.type || ''
    const accepted = ACCEPTED_PREFIXES.some(p => type.startsWith(p)) || ACCEPTED_EXACT.includes(type)
    if (!accepted) {
      return NextResponse.json(
        { error: 'That file type isn’t supported — send a photo or a PDF of your menu.' },
        { status: 415 },
      )
    }
  }
  if (text && text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: 'That’s a lot of text — please paste just the menu.' }, { status: 413 })
  }

  const template = getDemoTemplate(templateId)
  if (!file && !text && !template) {
    return NextResponse.json({ error: 'Add a photo of your menu, or paste it in.' }, { status: 400 })
  }

  // ── 3. Rate limit ─────────────────────────────────────────────────────────────────────────────────
  // Mirrors proxy.ts's bypasses so local development and loopback aren't throttled (dev has no
  // x-forwarded-for, so every request would otherwise share one 127.0.0.1 bucket).
  const ip = clientIp(req)
  const isDev = process.env.NODE_ENV !== 'production'
  const isLoopback = !req.headers.get('x-forwarded-for') || ip === '127.0.0.1' || ip === '::1'
  if (!isDev && !isLoopback) {
    try {
      const { success } = await demoRatelimit.limit(ip)
      if (!success) {
        return NextResponse.json(
          { error: 'You’ve built a few demos already. Try again in a little while, or get in touch and we’ll help.', rateLimited: true },
          { status: 429, headers: { 'Retry-After': '3600' } },
        )
      }
    } catch (err) {
      // Redis unreachable → FAIL OPEN. A prospect being turned away by our own infrastructure is worse
      // than a brief loss of throttling, and the size/type caps still apply.
      console.error('[demo] rate-limit check failed, allowing through:', err)
    }
  }

  // ── 4. Provision ──────────────────────────────────────────────────────────────────────────────────
  try {
    const result = await provisionDemo(supabase, { file, text, template })

    // The honest-failure path (§11) is NOT an error — it is the product working correctly. 200 with a
    // machine-readable outcome so the client can offer templates / retry / build-for-me.
    if (result.menu.kind === 'failed') {
      // Log warnings[] server-side: the client-facing `reason` collapses extraction-aborted / zero-items /
      // commit-inserted-nothing into one string, but warnings[] carries the distinguishing detail (e.g.
      // "Extraction failed: …" vs "Commit inserted 0 items …"). This is the only place that detail is
      // surfaced — the client response is UNCHANGED (still just `reason`).
      console.warn(`[demo] extraction produced nothing for ${result.truckId}: ${result.menu.reason} | warnings: ${JSON.stringify(result.warnings)}`)
      return NextResponse.json({
        ok: false,
        outcome: 'menu_failed',
        reason: result.menu.reason,
        // The truck exists but is menu-less and unusable. Returned so the cleanup job can sweep it and so
        // a retry can be correlated in logs. NOT surfaced to the visitor.
        truckId: result.truckId,
      })
    }

    return NextResponse.json({
      ok: true,
      outcome: result.menu.kind,          // 'imported' | 'template'
      itemsImported: result.menu.inserted,
      partial: result.menu.kind === 'imported' ? result.menu.partial : false,
      // Carry the source to the welcome popup (a fresh dashboard load can't see the outcome otherwise). A
      // template demo must be named as a SAMPLE, not "here's your menu" (§11). One signal, read once on load.
      redirectTo: `/dashboard/${result.dashboardToken}${result.menu.kind === 'template' ? '?welcome=sample' : ''}`,
    })
  } catch (err) {
    if (err instanceof ProvisionDemoError) {
      console.error(`[demo] provisioning failed${err.truckId ? ` (truck ${err.truckId})` : ''}:`, err.message)
    } else {
      console.error('[demo] unexpected failure:', err)
    }
    // Deliberately vague to the visitor — internal failure detail helps them not at all.
    return NextResponse.json(
      { ok: false, outcome: 'error', error: 'Something went wrong building your demo. Please try again.' },
      { status: 500 },
    )
  }
}
