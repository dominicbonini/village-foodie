// app/api/admin/outreach-snippets/route.ts
//
// 🔴 THE SNIPPETS LIBRARY — the ONLY writer of `outreach_snippets`, and it writes NOTHING ELSE.
// It follows the gate pattern every other admin route uses: `verifyAdmin` plus a service-role client,
// and a 404 (not 401) for a non-admin so the route does not confirm its own existence.
//
// 🔴 IT NEVER READS OR WRITES `outreach_templates`. Not a body, not a subject, not
// `placeholder_defaults`, not `serves_kind`. A snippet is a value shared BY templates, held outside
// them — that separation is the whole design, and it is enforced here by naming one table. Grep it.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { isSnippetName } from '@/lib/outreach-snippets'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const SELECT = 'name, value, updated_at'

/**
 * 🔴 THE TABLE MAY NOT EXIST YET — the migration is applied by hand and is not applied at time of
 * writing. Every failure is reported with its CODE rather than flattened, because the two causes read
 * completely differently and collapsing them cost this series a day:
 *   PGRST205 / PGRST204 → the table (or column) is there but PostgREST is serving a stale schema cache.
 *                         Fix: notify pgrst, 'reload schema'.
 *   42P01               → the table is genuinely absent. Fix: run the migration.
 */
const codeOf = (e: unknown) => (e as { code?: string })?.code ?? null

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  try {
    const { data, error } = await supabase
      .from('outreach_snippets').select(SELECT).order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ snippets: data ?? [], hasSnippets: true })
  } catch (e: unknown) {
    const code = codeOf(e)
    console.warn('[admin/outreach-snippets] GET failed:', code, (e as Error)?.message)
    // 🔴 A MISSING TABLE IS NOT AN ERROR THE PAGE SHOULD DIE ON. The Templates tab must keep working
    // before the migration is applied — it did before snippets existed and it does now — so this
    // degrades to "no library yet" and says why, rather than 500ing a tab that has other jobs.
    return NextResponse.json({ snippets: [], hasSnippets: false, code }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: { action?: string; name?: unknown; value?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  try {
    // ── SET ONE SNIPPET ─────────────────────────────────────────────────────────────────────────────
    // 🔴 ONE NAME PER CALL, DELIBERATELY. A bulk save would make "which of these did I just change"
    // unanswerable, and the blast radius shown beside each row is per name.
    if (body.action === 'set_snippet') {
      const name = String(body.name ?? '').trim()
      if (!isSnippetName(name)) {
        return NextResponse.json(
          { error: 'name must be 1-80 characters and contain no square brackets' }, { status: 400 })
      }
      // ⚠️ THE VALUE IS NOT TRIMMED TO NULL. '' is a legitimate stored state meaning "ask me per truck",
      // and it is distinct from having no row — see lib/outreach-snippets.ts. Leading and trailing
      // whitespace IS trimmed, because a value that differs only by a space is a value nobody chose.
      const value = String(body.value ?? '').trim()
      const { data, error } = await supabase
        .from('outreach_snippets')
        .upsert({ name, value, updated_at: new Date().toISOString() }, { onConflict: 'name' })
        .select(SELECT).single()
      if (error) throw error
      return NextResponse.json({ ok: true, snippet: data })
    }

    // ── FORGET ONE ──────────────────────────────────────────────────────────────────────────────────
    // 🔴 DELETING A SNIPPET IS NOT THE SAME AS BLANKING IT, and both are offered because they mean
    // different things: blank = "always ask me", gone = "no opinion recorded". Neither touches a
    // template body, so a `[[name]]` in a template survives either way and simply prompts.
    if (body.action === 'forget_snippet') {
      const name = String(body.name ?? '').trim()
      if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
      const { error } = await supabase.from('outreach_snippets').delete().eq('name', name)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: unknown) {
    const code = codeOf(e)
    console.error('[admin/outreach-snippets] write failed:', code, (e as Error)?.message)
    return NextResponse.json(
      { error: (e as Error)?.message || 'Write failed', code, needsMigration: code === 'PGRST205' || code === '42P01' },
      { status: 500 })
  }
}
