// app/api/admin/outreach-templates/route.ts
//
// 🔴 THIS IS A NEW ROUTE, NOT A REUSE. It follows the GATE PATTERN every other admin route uses —
// `verifyAdmin` on the handler plus a service-role client, and a 404 (not 401) for a non-admin so the
// route does not confirm its own existence. Nothing else is shared. App manual §51.7 records a "reuse"
// that was really a fourth independent implementation; calling this a reuse of the outreach route or the
// discovery-events route would be that mistake again. Its subject is templates and nothing else.
//
// 🔴 IT NEVER READS OR WRITES `truck_events`, `discovery_events`, `outreach_prospects` OR
// `discovery_trucks`. It names exactly one table — grep it.
//
// 🔴 THERE IS NO HARD DELETE, AND THAT IS DELIBERATE. A contact-log row written months ago references the
// template that produced it; removing the template makes that history unexplainable. `set_active` retires
// one instead: `templatesFor` drops inactive templates from the compose picker while they stay readable
// here. If a template genuinely must go, it is a one-line delete in the SQL editor, which is the right
// amount of friction for something that rewrites history.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const SELECT = 'id, slug, label, channel, subject, body, sort_order, active, placeholder_defaults, created_at, updated_at'

/** 🔴 THE ONLY COLUMNS A WRITE MAY TOUCH. `slug` is excluded after creation: it is the key the compose
 *  picker and `suggestTemplateId` resolve against, and renaming it would silently orphan a suggestion. */
const EDITABLE = ['label', 'channel', 'subject', 'body', 'sort_order', 'active', 'placeholder_defaults'] as const
type EditableCol = typeof EDITABLE[number]
const isEditable = (k: string): k is EditableCol => (EDITABLE as readonly string[]).includes(k)

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  try {
    const { data, error } = await supabase
      .from('outreach_templates').select(SELECT)
      .order('sort_order', { ascending: true }).order('slug', { ascending: true })
    if (error) throw error
    return NextResponse.json({ templates: data ?? [] })
  } catch (e: any) {
    // 🔴 THE TWO FAILURES MUST NOT LOOK THE SAME ON SCREEN, so the code is passed through rather than
    // flattened. PGRST205 = the table is missing OR PostgREST has not reloaded its schema cache after the
    // migration; that is a SETUP state and reads completely differently from "you have no templates yet".
    const code = e?.code || null
    console.error('[admin/outreach-templates] GET failed:', code, e?.message || e)
    return NextResponse.json(
      { error: e?.message || 'Could not load templates', code, needsMigration: code === 'PGRST205' },
      { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  try {
    // ── CREATE ──────────────────────────────────────────────────────────────────────────────────────
    if (body?.action === 'create_template') {
      const slug = String(body.slug ?? '').trim()
      // 🔴 HYPHENS ALLOWED. The UI derives this with `createSlug`, which joins words with hyphens, so a
      // name like "Hatches Up - map only" becomes `hatches-up-map-only`. The seeded templates use
      // underscores (`hu_rate_email`), so BOTH separators must pass or the existing rows become
      // un-editable. Still lowercase and still no spaces: this is a key the compose picker resolves
      // against and that appears in logs — the display name lives in `label`, which is free text.
      if (!/^[a-z0-9_-]{3,60}$/.test(slug)) {
        return NextResponse.json(
          { error: 'slug must be 3-60 characters of a-z, 0-9, hyphen or underscore (the display name goes in the label)' },
          { status: 400 })
      }
      const channel = body.channel === 'whatsapp' ? 'whatsapp' : 'email'
      const { data, error } = await supabase.from('outreach_templates').insert({
        slug,
        label: String(body.label ?? slug).trim() || slug,
        channel,
        // A WhatsApp template carries no subject — enforced here rather than trusting the form.
        subject: channel === 'email' ? (body.subject ?? null) : null,
        body: String(body.body ?? ''),
        sort_order: Number.isFinite(body.sort_order) ? Number(body.sort_order) : 999,
      }).select(SELECT).single()
      if (error) throw error
      return NextResponse.json({ ok: true, template: data })
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────────────────────────────
    if (body?.action === 'update_template') {
      const id = String(body.id ?? '')
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const patch: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(body)) {
        if (k === 'action' || k === 'id') continue
        if (!isEditable(k)) continue           // unknown keys ignored, never fatal
        patch[k] = v
      }
      if (patch.channel === 'whatsapp') patch.subject = null
      if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, noop: true })
      patch.updated_at = new Date().toISOString()
      const { data, error } = await supabase
        .from('outreach_templates').update(patch).eq('id', id).select(SELECT).single()
      if (error) throw error
      return NextResponse.json({ ok: true, template: data })
    }

    // ── PLACEHOLDER DEFAULTS ────────────────────────────────────────────────────────────────────────
    // 🔴 THE TIMESTAMP IS STAMPED SERVER-SIDE, PER PLACEHOLDER, AND ONLY WHEN THE VALUE ACTUALLY CHANGES.
    // A stale default is worse than an empty field, so "when was this last changed" has to be a fact the
    // server recorded, not something the form asserted. Re-saving the same text does not refresh the age.
    if (body?.action === 'set_defaults') {
      const id = String(body.id ?? '')
      const incoming = body.defaults
      if (!id || typeof incoming !== 'object' || incoming === null) {
        return NextResponse.json({ error: 'id and defaults required' }, { status: 400 })
      }
      const { data: before, error: rErr } = await supabase
        .from('outreach_templates').select('placeholder_defaults').eq('id', id).maybeSingle()
      if (rErr) throw rErr
      if (!before) return NextResponse.json({ error: 'No such template' }, { status: 404 })
      const prev = (before.placeholder_defaults ?? {}) as Record<string, { value?: string; updated_at?: string }>
      const now = new Date().toISOString()
      const next: Record<string, { value: string; updated_at: string }> = {}
      for (const [name, raw] of Object.entries(incoming as Record<string, unknown>)) {
        const value = String(raw ?? '')
        if (!value.trim()) continue                       // clearing a default removes it entirely
        const was = prev[name]
        next[name] = {
          value,
          updated_at: was && was.value === value && was.updated_at ? was.updated_at : now,
        }
      }
      const { data, error } = await supabase.from('outreach_templates')
        .update({ placeholder_defaults: next, updated_at: now })
        .eq('id', id).select(SELECT).single()
      if (error) throw error
      return NextResponse.json({ ok: true, template: data })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    const code = e?.code || null
    console.error('[admin/outreach-templates] write failed:', code, e?.message || e)
    return NextResponse.json({ error: e?.message || 'Write failed', code }, { status: 500 })
  }
}
