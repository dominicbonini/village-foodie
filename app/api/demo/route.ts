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
// Language Phase 1c: a refusal of ours is `{ error, …, code, params }` (lib/i18n/onboarding-errors.ts). The demo has no
// truck yet when this route refuses, so its words are en-GB (docs/language-phase-1c-report.md). ⚠️ provisionDemo's
// `reason` (an honest-failure outcome, not a refusal) is passed on as lib/provision-demo.ts words it.
import { onboardingErrorBody } from '@/lib/i18n/onboarding-errors'
import { DEFAULT_LOCALE } from '@/lib/i18n/locales'
import { visitorCountryCodeOf } from '@/lib/visitor-country'
// demo-2 (30 Oct 2026, docs/demo-2-report.md): the email asked before the build, the menu kept for Admin, the counts,
// and the link sent once the build is done. The visitor is sent to the walkthrough (/try/<slug>), never to a URL that
// carries the dashboard token.
import { isDemoEmail, recordDemoVisitorEmail } from '@/lib/demo-session'
import { saveDemoMenuFiles } from '@/lib/demo-menu-files'
import { recordDemoEvent } from '@/lib/demo-events'
import { sendDemoLinkEmail } from '@/lib/demo-link-email'
import { localeForTruck } from '@/lib/i18n/server-locale'
import { truckTimeSettings } from '@/lib/truck-time'

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
  let email = ''
  let marketingOptIn = false

  try {
    const form = await req.formData()
    const f = form.get('file')
    file = f instanceof File && f.size > 0 ? f : null
    const t = form.get('text')
    text = typeof t === 'string' && t.trim() ? t.trim() : null
    const tpl = form.get('template')
    templateId = typeof tpl === 'string' && tpl.trim() ? tpl.trim() : null
    const em = form.get('email')
    email = typeof em === 'string' ? em.trim() : ''
    marketingOptIn = form.get('marketing') === 'true'
  } catch {
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'upload_unreadable'), { status: 400 })
  }

  // ── 2. Cheap rejections BEFORE the rate limit ─────────────────────────────────────────────────────
  // Deliberately ordered this way: a 12 MB video shouldn't consume one of the visitor's five hourly
  // attempts. Malformed input is the user's mistake, not their quota.
  if (file) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        onboardingErrorBody(DEFAULT_LOCALE, 'file_too_big', { mb: Math.round(MAX_UPLOAD_BYTES / 1024 / 1024) }),
        { status: 413 },
      )
    }
    const type = file.type || ''
    const accepted = ACCEPTED_PREFIXES.some(p => type.startsWith(p)) || ACCEPTED_EXACT.includes(type)
    if (!accepted) {
      return NextResponse.json(
        onboardingErrorBody(DEFAULT_LOCALE, 'file_type_unsupported'),
        { status: 415 },
      )
    }
  }
  if (text && text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'text_too_long'), { status: 413 })
  }

  const template = getDemoTemplate(templateId)
  if (!file && !text && !template) {
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'menu_missing'), { status: 400 })
  }
  // 🔴 demo-2: THE EMAIL IS REQUIRED, and checked BEFORE the rate limit — a typo must not spend one of the visitor's
  // five hourly builds. (Outreach demos are built by /api/admin/provision-demo and never come through here.)
  if (!isDemoEmail(email)) {
    return NextResponse.json(onboardingErrorBody(DEFAULT_LOCALE, 'email_not_valid'), { status: 400 })
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
          onboardingErrorBody(DEFAULT_LOCALE, 'demo_rate_limited', {}, { rateLimited: true }),
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
  // The count of a started build has no demo yet — its truck is created inside provisionDemo — so it is filed unnamed.
  await recordDemoEvent(supabase, { demoId: null, event: 'build_started', source: 'landing' })
  try {
    // 🔴 THE DEMO IS BUILT IN THE VISITOR'S COUNTRY (Language Phase 2) — the marketing pages' rule (?country → the
    // hg_country cookie → where the request comes from), switched-on countries only, else GB. While the US is
    // switched off this is always GB. provisionDemo falls back to GB again for anything it cannot use.
    const country = await visitorCountryCodeOf(req)
    const result = await provisionDemo(supabase, { file, text, template, country })

    // demo-2: whatever the outcome, the demo's session exists now — file the email, the menu and the counts on it.
    await recordDemoVisitorEmail(supabase, result.truckId, email, marketingOptIn)
    if (file || text) await saveDemoMenuFiles(supabase, result.truckId, { file, text })
    if (template) await recordDemoEvent(supabase, { demoId: result.truckId, event: 'sample_used', source: 'landing' })
    await recordDemoEvent(supabase, { demoId: result.truckId, event: result.menu.kind === 'failed' ? 'build_failed' : 'build_ok', source: 'landing' })

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

    // demo-2: the visitor's link, emailed once the build is done. Awaited so the answer can say whether it went, but a
    // failure never fails the demo.
    const emailed = await emailDemoLink(req, result.truckId, result.slug, email)

    return NextResponse.json({
      ok: true,
      outcome: result.menu.kind,          // 'imported' | 'template'
      // demo-2: the slug is the walkthrough's identifier (it is already public on the order page's URL); the dashboard
      // token is NOT sent back any more — the walkthrough never needs it.
      slug: result.slug,
      emailSent: emailed,
      itemsImported: result.menu.inserted,
      partial: result.menu.kind === 'imported' ? result.menu.partial : false,
      // No `?welcome=sample` here any more. It used to carry the outcome to the welcome popup because a
      // fresh dashboard load couldn't see it — but a query param survives exactly one navigation, so a
      // reloaded sample demo lost the signal and started calling itself "your menu" (§11 says a template
      // truck must be NAMED as a sample). A fresh load CAN see the outcome now: /api/dashboard serves
      // demo_sessions.extraction_source in its `demo` block, which survives reloads, tabs and devices.
      // The param had zero readers repo-wide once that landed, and a param nothing consumes is a trap for
      // whoever reads this next.
      redirectTo: `/try/${encodeURIComponent(result.slug)}`,
    })
  } catch (err) {
    await recordDemoEvent(supabase, { demoId: err instanceof ProvisionDemoError && err.truckId ? err.truckId : null, event: 'build_failed', source: 'landing' })
    if (err instanceof ProvisionDemoError) {
      console.error(`[demo] provisioning failed${err.truckId ? ` (truck ${err.truckId})` : ''}:`, err.message)
    } else {
      console.error('[demo] unexpected failure:', err)
    }
    // Deliberately vague to the visitor — internal failure detail helps them not at all.
    return NextResponse.json(
      { ok: false, outcome: 'error', ...onboardingErrorBody(DEFAULT_LOCALE, 'demo_build_failed') },
      { status: 500 },
    )
  }
}

/** demo-2: emails the walkthrough link to the visitor. The link's base is the public site (NEXT_PUBLIC_HATCHGRAB_URL),
 *  else this request's own origin (local testing). Returns whether it went. */
async function emailDemoLink(req: NextRequest, truckId: string, slug: string, to: string): Promise<boolean> {
  try {
    const [{ data: truck }, { data: session }] = await Promise.all([
      supabase.from('trucks').select('id, country, timezone').eq('id', truckId).maybeSingle(),
      supabase.from('demo_sessions').select('expires_at').eq('truck_id', truckId).maybeSingle(),
    ])
    const locale = truck ? await localeForTruck(truck) : DEFAULT_LOCALE
    const time = truck ? await truckTimeSettings(truck).catch(() => null) : null
    const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL || new URL(req.url).origin
    const r = await sendDemoLinkEmail({ to, slug, expiresAt: (session?.expires_at as string | null) ?? null, locale, time, base })
    if (!r.sent) console.warn(`[demo] link email not sent for ${truckId}: ${r.reason}`)
    return r.sent
  } catch (err) {
    console.warn(`[demo] link email failed for ${truckId}:`, err)
    return false
  }
}
