// app/api/admin/whatsapp-templates/route.ts
// 🔴 ADMIN ONLY. THE PLATFORM CREDENTIAL AND THE PLATFORM WABA. NO TRUCK IS INVOLVED ANYWHERE.
//
// This exists for ONE reason: Meta's Tech Provider app review asks for a video of OUR app creating a
// WhatsApp message template. This is the smallest surface that satisfies that. It is deliberately NOT
// operator-facing template management — there is no truck parameter, no per-truck token, no storage and
// no migration. It reads and writes nothing in our database.
//
// ── ✅ THE EXISTING PATTERN, NOT A NEW ONE ─────────────────────────────────────────────────────────
// A sibling of app/api/admin/{create-truck,delete-truck,provision-demo,…}: `verifyAdmin(req)` first,
// 401 with a bare `{ error }` on failure, `NextRequest` in, `NextResponse.json` out. `verifyAdmin` is
// the canonical check (Supabase session cookie on web, Bearer fallback for the native app, authority =
// `operators.is_admin`) — see lib/auth/admin.ts. Nothing here forks it.
//
// ── 🔴 EVERY FAILURE IS SPECIFIC, AND EVERY FAILURE IS A 200 WITH `ok: false` ──────────────────────
// Except the admin gate itself, which is a real 401. The reason: this page is driven on camera, and a
// non-2xx makes a browser's own error handling and a fetch rejection compete with the message we
// actually want read aloud. A structured body the page can render beats an HTTP status it must decode.
// The one thing that must never happen during a review recording is a blank screen.
import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/auth/admin'
import {
  listMessageTemplates,
  createMessageTemplate,
  metaTemplateConfigStatus,
  describeFailure,
  type TemplateCategory,
} from '@/lib/meta-whatsapp'

const CATEGORIES: TemplateCategory[] = ['MARKETING', 'UTILITY', 'AUTHENTICATION']

/**
 * GET — the preflight and the list.
 *
 * `?section=config` returns ONLY the environment preflight and makes NO Meta call. That separation is
 * deliberate and mirrors the Stripe Connect route's own `status` vs `requirements` split: the cheap
 * question ("is this deployment configured") must be answerable without spending a request on the
 * provider, because it is the question asked first and asked most.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const config = metaTemplateConfigStatus()

  if (req.nextUrl.searchParams.get('section') === 'config') {
    return NextResponse.json({ ok: true, config })
  }

  // 🔴 REFUSE BEFORE CALLING META WHEN WE KNOW IT CANNOT WORK. A `Bearer ` with nothing after it earns
  // an opaque 401 from Meta that reads like a revoked token; naming the missing variable instead is the
  // difference between a ten-second fix and a wrong diagnosis on camera.
  if (config.missing.length) {
    return NextResponse.json({
      ok: false,
      config,
      error: {
        kind: 'missing_env',
        missing: config.missing,
        message: `Not configured: ${config.missing.join(' and ')} missing from this environment.`,
      },
      message: `Not configured: ${config.missing.join(' and ')} missing from this environment. Set ${config.missing.length === 1 ? 'it' : 'them'} in the hosting environment and redeploy.`,
    })
  }

  const limitParam = Number(req.nextUrl.searchParams.get('limit'))
  const result = await listMessageTemplates(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50)

  if (!result.ok) {
    return NextResponse.json({ ok: false, config, error: result.error, message: describeFailure(result.error) })
  }
  return NextResponse.json({ ok: true, config, templates: result.templates, raw: result.raw })
}

/**
 * POST — create one template.
 *
 * ⚠️ THE VALIDATION HERE IS ONLY ABOUT THE SHAPE OF THE REQUEST, not about Meta's rules. Meta's rules
 * (the name pattern, the variable/example count) are enforced in lib/meta-whatsapp.ts so that they live
 * beside the call that will be judged by them, and so a future caller cannot bypass them by not being
 * this route.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, message: 'The request body was not valid JSON.' })
  }

  const name = typeof body.name === 'string' ? body.name : ''
  const language = typeof body.language === 'string' ? body.language : ''
  const bodyText = typeof body.bodyText === 'string' ? body.bodyText : ''
  const categoryRaw = typeof body.category === 'string' ? body.category : ''
  const bodyExamples = Array.isArray(body.bodyExamples)
    ? body.bodyExamples.filter((e): e is string => typeof e === 'string')
    : []

  if (!CATEGORIES.includes(categoryRaw as TemplateCategory)) {
    return NextResponse.json({
      ok: false,
      message: `Category must be one of ${CATEGORIES.join(', ')} — got "${categoryRaw || '(empty)'}".`,
    })
  }

  console.log(
    `[admin/whatsapp-templates] CREATE requested name=${name} language=${language} ` +
    `category=${categoryRaw} bodyChars=${bodyText.length} examples=${bodyExamples.length}`,
  )

  const result = await createMessageTemplate({
    name,
    language,
    category: categoryRaw as TemplateCategory,
    bodyText,
    bodyExamples,
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, message: describeFailure(result.error) })
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    status: result.status,
    category: result.category,
    raw: result.raw,
    message:
      `Template "${name}" was created. Meta's status for it is ` +
      `${result.status ?? 'not reported in the response'} — a new template is normally PENDING until Meta reviews it.`,
  })
}
