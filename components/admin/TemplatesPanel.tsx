'use client'
// components/admin/TemplatesPanel.tsx
//
// The Templates tab: manage outreach message templates. List on the left, editor on the right.
//
// 🔴 THE PREVIEW IS NOT A REIMPLEMENTATION. It calls `contextFromProspect` → `renderWithFills` →
// from lib/outreach-template-render — the SAME functions the compose window calls,
// in the same order. There is no substitution code in this file: grep it for `replace(`. A preview that
// rendered independently would agree until the day it did not, and that day would be an email going out
// wrong.
//
// 🔴 IT NEVER READS OR WRITES `truck_events`, `discovery_events` or `discovery_trucks`.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import { createSlug } from '@/lib/utils'
import { CONTACT_KINDS, kindLabel } from '@/lib/outreach'
import { LEAD_TYPES, LEAD_TYPE_LABELS } from '@/lib/outreach-step'
import { readOutreachGlobals, writeOutreachGlobals } from '@/lib/outreach-globals'   // the repo's existing slug function — not a second one
import {
  contextFromProspect, renderWithFills, unresolvedIn, defaultFillsOf,
  resolvedTokenReference, conditionReference, suspectedMistypedTokens, malformedTokensIn,
  type MessageTemplate,
} from '@/lib/outreach-template-render'

type Row = {
  id: string; slug: string; label: string; channel: 'email' | 'whatsapp'
  subject: string | null; body: string; sort_order: number; active: boolean
  placeholder_defaults: Record<string, { value: string; updated_at: string | null }> | null
  /** 🔴 NULLABLE = ANY, and every row ships null. Optional on the type too, because the route omits
   *  them entirely until the migration is applied and its schema cache reloaded. */
  serves_kind?: string | null
  serves_lead_type?: string | null
  created_at: string | null; updated_at: string | null
}
type Prospect = {
  id: string; name: string; website: string | null
  /** The two name columns the substitution reads. `contact_name` is deliberately NOT here: the preview
   *  must render what a real send renders, and nothing reads that column any more. */
  contact_first_name: string | null; contact_last_name: string | null
  order_url: string | null; nextEventDate: string | null; nextEventVenue: string | null
  /** The prospect's newest live demo, as the outreach route reports it — what `{{demo_link}}` needs.
   *  🧪 Exactly 1 of 231 prospects has one, so picking any other prospect previews the REFUSAL. */
  demo?: { publicRef: string | null; expiresAt: string | null } | null
  /** 🔴 THE LEAD-TYPE INPUTS. The preview must render the SAME lead line a real send would, so it needs
   *  the same four fields `leadTypeOf` reads. The compiler required these — `ProspectLike` makes them
   *  mandatory precisely so a preview cannot quietly fall back to "not listed". */
  hu_ordering: boolean | null
  hu_map: boolean | null
  show_on_vf?: boolean | null
  excluded?: boolean | null
  futureEventCount?: number | null
  /** 🔴 THE FROZEN LEAD TYPE. Carried so the preview renders the SAME ?lead_ line a real send would:
   *  for a prospect mid-sequence that is the value frozen at first contact, NOT today's derivation.
   *  Without it the preview would quietly disagree with the message, which is the one thing this
   *  preview exists not to do. */
  lead_type_at_first_contact?: string | null
  whatsapp_confirmed: boolean | null
}

// The rail's two tabs. 🔴 Preview is the default: it is the only way to see the conditional branch
// before sending, and the brief requires it reachable in one action — so it is reachable in zero.
const RAIL_TABS = [
  { key: 'preview' as const, label: 'Preview' },
  { key: 'tokens' as const, label: 'Tokens' },
]
type RailTab = typeof RAIL_TABS[number]['key']

const FIELD = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm'
const LABEL = 'block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5'
const fmtWhen = (iso: string | null) => {
  if (!iso) return 'never'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
/** Days since an ISO timestamp, for the staleness marker. */
const daysSince = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null

/** The DB row as the shared mechanism wants it. One mapping, used for preview and for the picker. */
function toMessageTemplate(r: Row): MessageTemplate {
  return {
    id: r.slug, label: r.label, channel: r.channel,
    subject: r.subject ?? undefined, body: r.body,
    sortOrder: r.sort_order, active: r.active,
    servesKind: r.serves_kind ?? null, servesLeadType: r.serves_lead_type ?? null,
    defaults: Object.fromEntries(Object.entries(r.placeholder_defaults ?? {})
      .map(([k, v]) => [k, { value: v?.value ?? '', updatedAt: v?.updated_at ?? null }])),
  }
}

export default function TemplatesPanel() {
  const [rows, setRows] = useState<Row[]>([])
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  // 🔴 THREE DISTINCT STATES, NEVER COLLAPSED: loading, "the table is not there yet", and "the table is
  // there and empty". The third is a normal state you can act on; the second is a setup step.
  const [loadError, setLoadError] = useState<{ message: string; needsMigration: boolean } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  // 🔴 THE EXPLICIT BRANCH TOGGLE. The conditional clause is the one thing you cannot otherwise see
  // before sending, and whether a real prospect has an upcoming event changes day to day. This forces
  // the no-event branch regardless of who is selected.
  const [forceNoEvent, setForceNoEvent] = useState(false)
  const [rail, setRail] = useState<RailTab>('preview')
  const [draft, setDraft] = useState<Partial<Row>>({})
  const [defaultsDraft, setDefaultsDraft] = useState<Record<string, string>>({})
  /** Whether 20260915_outreach_template_tags.sql is applied AND PostgREST has reloaded. Reported by
   *  the route as a capability flag, exactly like hasContactNames on the outreach route. */
  const [hasTemplateTags, setHasTemplateTags] = useState(false)
  /** 🔴 GLOBAL PLACEHOLDER DEFAULTS — values stated ONCE and used by every template that has no
   *  default of its own. Read lazily so the server render never touches localStorage. */
  // 🔴 LAZY INITIALISERS, NOT A MOUNT EFFECT, AND THE SSR ARGUMENT IS SPELLED OUT BECAUSE THIS FILE'S
  // SIBLING DELIBERATELY DOES THE OPPOSITE. OutreachPanel restores its filter blob in an effect and
  // says why: a 'use client' component is still server-rendered for the initial HTML, so seeding state
  // from localStorage would make the server and client markup disagree.
  // ⚠️ THAT ARGUMENT DOES NOT APPLY HERE, and the reason is structural rather than lucky: everything
  // these two values feed is inside `{allPlaceholders.length > 0 && …}`, and `allPlaceholders` derives
  // from `rows`, which starts `[]` and only fills after a fetch. So on the server AND on the hydration
  // render this block renders NOTHING — the state differs between the two, but no markup does.
  // 🔴 If that gate is ever removed, these must go back to the restore-after-mount pattern.
  const [globals, setGlobals] = useState<Record<string, string>>(() => readOutreachGlobals())
  const [globalsDraft, setGlobalsDraft] = useState<Record<string, string>>(() => readOutreachGlobals())
  /** Every [[placeholder]] across every LOADED template — what a global could usefully cover. 🔴 It is
   *  DERIVED from the bodies, never a hand-written list, so a placeholder invented tomorrow appears
   *  here without anyone remembering to add it. */
  const allPlaceholders = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) for (const n of unresolvedIn(`${r.subject ?? ''}\n${r.body}`)) set.add(n)
    return [...set].sort()
  }, [rows])

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800) }

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const h = await nativeAuthHeader()
      const res = await fetch('/api/admin/outreach-templates', { headers: h, credentials: 'same-origin' })
      if (res.status === 404 || res.status === 401) { setDenied(true); setLoading(false); return }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLoadError({ message: data?.error || `Could not load (${res.status})`, needsMigration: !!data?.needsMigration })
        setLoading(false); return
      }
      setRows(data.templates || [])
      setHasTemplateTags(!!data.hasTemplateTags)
    } catch (e: any) { setLoadError({ message: e?.message || 'Could not load templates', needsMigration: false }) }
    setLoading(false)
  }, [])

  // ⚠️ A READ-ONLY REUSE of the EXISTING outreach route, declared as such: it already returns every field
  // the substitution needs (name, contact_first_name, contact_last_name, website, order_url,
  // nextEventDate, nextEventVenue, demo), so the preview reads the same rows the compose window renders
  // against. Nothing is written here.
  const loadProspects = useCallback(async () => {
    try {
      const h = await nativeAuthHeader()
      const res = await fetch('/api/admin/outreach', { headers: h, credentials: 'same-origin' })
      if (!res.ok) return
      const data = await res.json()
      setProspects(data.rows || data.prospects || [])
    } catch { /* the preview degrades to "pick a prospect"; the editor still works */ }
  }, [])

  useEffect(() => { void load(); void loadProspects() }, [load, loadProspects])

  const selected = useMemo(() => rows.find(r => r.id === selId) ?? null, [rows, selId])

  // Seed the editor when the selection changes.
  useEffect(() => {
    if (!selected) { setDraft({}); setDefaultsDraft({}); return }
    // 🔴 THE TAGS ARE SEEDED INTO THE DRAFT TOO, or saving any other field would post the draft
    // without them and the update would read as "no change" for the tags while silently keeping the
    // stored value. Seeding them makes what is on screen what gets sent.
    setDraft({ label: selected.label, channel: selected.channel, subject: selected.subject,
      body: selected.body, sort_order: selected.sort_order, active: selected.active,
      serves_kind: selected.serves_kind ?? null, serves_lead_type: selected.serves_lead_type ?? null })
    setDefaultsDraft(Object.fromEntries(
      Object.entries(selected.placeholder_defaults ?? {}).map(([k, v]) => [k, v?.value ?? ''])))
  }, [selected])

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const h = await nativeAuthHeader()
    const res = await fetch('/api/admin/outreach-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
      credentials: 'same-origin', body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { say(data?.error || `Failed (${res.status})`); return null }
    if (data?.template) setRows(rs => rs.map(r => r.id === data.template.id ? data.template : r))
    return data
  }, [])

  const saveDraft = async () => {
    if (!selected) return
    const out = await post({ action: 'update_template', id: selected.id, ...draft })
    if (out) say('Saved')
  }
  const saveDefaults = async () => {
    if (!selected) return
    const out = await post({ action: 'set_defaults', id: selected.id, defaults: defaultsDraft })
    if (out) say('Defaults saved')
  }
  const toggleActive = async (r: Row) => { await post({ action: 'update_template', id: r.id, active: !r.active }) }
  const move = async (r: Row, dir: -1 | 1) => {
    const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order)
    const i = ordered.findIndex(x => x.id === r.id)
    const j = i + dir
    if (j < 0 || j >= ordered.length) return
    await post({ action: 'update_template', id: r.id, sort_order: ordered[j].sort_order })
    await post({ action: 'update_template', id: ordered[j].id, sort_order: r.sort_order })
    void load()
  }
  // 🔴 ASK FOR THE NAME, NOT THE SLUG. It used to prompt for a slug and reject anything outside
  // [a-z0-9_], so typing a real template name — "Hatches Up - map only" — failed on the capitals, the
  // spaces and the hyphen. The name is what the operator has in mind; the slug is an implementation
  // detail (the stable key the compose picker resolves against), so it is DERIVED rather than typed.
  // ⚠️ DERIVED WITH `createSlug` FROM lib/utils — the slug function this repo already has. Writing a
  // second one here would be the same mistake as a sixth truck-name normaliser.
  const createTemplate = async () => {
    const name = window.prompt('Name for the new template:')?.trim()
    if (!name) return
    const base = createSlug(name)
    // createSlug strips punctuation, so a name of only symbols can come back empty or too short.
    if (base.length < 3) { say(`"${name}" does not give a usable slug — use at least three letters or digits.`); return }
    // 🔴 UNIQUE, BECAUSE `slug` IS A UNIQUE COLUMN. Two templates called the same thing is a reasonable
    // thing to want; a 23505 from Postgres is not a reasonable way to find out. Suffix until it is free.
    const taken = new Set(rows.map(r => r.slug))
    let slug = base
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
    const out = await post({ action: 'create_template', slug, label: name, channel: 'email', body: 'Hi,\n\n' })
    if (out?.template) {
      setRows(rs => [...rs, out.template]); setSelId(out.template.id)
      // Name the derived slug rather than letting it appear silently — it is fixed after creation.
      say(`Created "${name}" (slug: ${slug})`)
    }
  }

  // ── THE PREVIEW ────────────────────────────────────────────────────────────────────────────────────
  const previewProspect = useMemo(() => prospects.find(p => p.id === previewId) ?? null, [prospects, previewId])
  const filteredProspects = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q ? prospects.filter(p => (p.name ?? '').toLowerCase().includes(q)) : prospects
    return base.slice(0, 60)
  }, [prospects, search])

  const preview = useMemo(() => {
    if (!selected || !previewProspect) return null
    const tpl = toMessageTemplate({ ...selected, ...draft } as Row)
    // 🔴 THE SAME THREE CALLS THE COMPOSE WINDOW MAKES, IN THE SAME ORDER.
    const base = contextFromProspect(previewProspect)
    const ctx = forceNoEvent ? { ...base, nextEventDate: null, nextEventVenue: null } : base
    const fills = defaultFillsOf(tpl)          // the template's own defaults, as the compose window pre-fills
    const m = renderWithFills(tpl, ctx, fills)
    // 🔴 THE PREVIEW IS THE WHOLE MESSAGE, because nothing is appended to it any more. It used to be
    // `composeEmail(m.body)` for email, which added the signature and the mandatory opt-out line; both
    // now come from the Outlook signature, so showing them here would show a message that is never sent.
    const full = m.body
    return { ...m, full, isEmail: tpl.channel === 'email' }
  }, [selected, draft, previewProspect, forceNoEvent])

  const tokenRef = useMemo(() => resolvedTokenReference(), [])
  const condRef = useMemo(() => conditionReference(), [])
  const mistyped = useMemo(
    () => suspectedMistypedTokens(`${draft.subject ?? ''}\n${draft.body ?? ''}`), [draft.subject, draft.body])
  /** 🔴 `{{…}}` the renderer cannot read. Shown HERE as well as in the compose window because this is
   *  where the template is written — catching it at compose time is the safety net, catching it here is
   *  the fix. Unlike `mistyped` (a hint about single brackets) this is an error: the compose window
   *  REFUSES to send or copy a message containing one. */
  const malformed = useMemo(
    () => malformedTokensIn(`${draft.subject ?? ''}\n${draft.body ?? ''}`), [draft.subject, draft.body])
  const bodyPlaceholders = useMemo(
    () => unresolvedIn(`${draft.subject ?? ''}\n${draft.body ?? ''}`), [draft.subject, draft.body])

  // ── 🔴 (4) CLICK-TO-INSERT AT THE CARET ────────────────────────────────────────────────────────────
  // Click, not drag. A drop into a textarea has to reconstruct a caret from a pointer position, and it
  // fails by landing the text at the end or in the wrong place after a scroll — with no visible sign it
  // went wrong. A click can use the field's OWN selection, which is exact.
  const subjectRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  // 🔴 WHICH FIELD RECEIVES AN INSERT. Null until one has been focused — see `insertAtCaret`.
  const [lastFocus, setLastFocus] = useState<null | 'subject' | 'body'>(null)

  /** Insert `text` at the caret of the last-focused field, replacing any selection. */
  const insertAtCaret = useCallback((text: string, opts?: { ownLines?: boolean }) => {
    // 🔴 NOTHING HAS BEEN FOCUSED: DO NOT GUESS. Appending to the body, or silently picking a field,
    // puts text somewhere the operator did not ask for and did not watch happen. The palette's buttons
    // are disabled in this state and say why, so this is belt-and-braces.
    if (!lastFocus) { say('Click into the subject or body first — then the token lands at your cursor.'); return }
    const el = lastFocus === 'subject' ? subjectRef.current : bodyRef.current
    if (!el) return
    const cur = lastFocus === 'subject' ? (draft.subject ?? '') : (draft.body ?? '')
    const start = el.selectionStart ?? cur.length
    const end = el.selectionEnd ?? start
    let ins = text
    if (opts?.ownLines) {
      // A conditional marker is only recognised at the START of a line, so an insert mid-line would
      // produce a clause that never fires. Force it onto its own line, and keep what followed.
      const before = cur.slice(0, start)
      const needsLeading = before.length > 0 && !before.endsWith('\n')
      const after = cur.slice(end)
      const needsTrailing = after.length > 0 && !after.startsWith('\n')
      ins = `${needsLeading ? '\n' : ''}${text}${needsTrailing ? '\n' : ''}`
    }
    const next = cur.slice(0, start) + ins + cur.slice(end)
    if (lastFocus === 'subject') setDraft(d => ({ ...d, subject: next }))
    else setDraft(d => ({ ...d, body: next }))
    // Put the caret after what was inserted, and keep focus where the operator was working.
    const caret = start + ins.length
    requestAnimationFrame(() => { el.focus(); try { el.setSelectionRange(caret, caret) } catch { /* older engines */ } })
  }, [lastFocus, draft.subject, draft.body])

  // ── 🔴 (5) CONDITIONAL PAIRS, DERIVED — AND ONLY WHERE BOTH HALVES REALLY EXIST ────────────────────
  // `conditionMet` returns FALSE for an unknown condition, so a `?no_website:` line would be dropped
  // every single time, silently. Offering a pair for a condition whose counterpart is not in the code
  // would MANUFACTURE the exact failure this feature exists to prevent. So a pair is offered only when
  // both `C` and `no_C` are present in the derived list. 🧪 Today that yields one pair (next_event) and
  // three singles (order_url, website, contact_name) — read from the code, not written here.
  const condNames = useMemo(() => condRef.map(c => c.name), [condRef])
  const condPairs = useMemo(
    () => condNames.filter(c => !c.startsWith('no_') && condNames.includes(`no_${c}`)), [condNames])
  const condSingles = useMemo(() => {
    const paired = new Set(condPairs.flatMap(c => [c, `no_${c}`]))
    return condNames.filter(c => !paired.has(c))
  }, [condNames, condPairs])

  /** 🔴 HALF-WRITTEN CONDITIONALS. One half without the other has no visible failure mode — the branch
   *  simply never fires — so it is called out in the editor. */
  const halfPairs = useMemo(() => {
    const b = draft.body ?? ''
    const has = (c: string) => new RegExp(`^\\?${c}:`, 'm').test(b)
    return condPairs
      .map(c => ({ c, pos: has(c), neg: has(`no_${c}`) }))
      .filter(x => x.pos !== x.neg)
  }, [draft.body, condPairs])


  if (denied) return <div className="text-slate-900 p-6"><p className="text-sm text-slate-500">/api/admin/outreach-templates refused this session.</p></div>

  return (
    <div className="text-slate-900">
      <div className="max-w-[1800px] mx-auto">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : <><span className="font-semibold text-slate-700">{rows.length}</span> templates</>}
          </p>
          <button onClick={createTemplate}
            className="text-sm font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-400">
            New template
          </button>
        </div>

        {/* 🔴 "NOT SET UP" AND "SET UP BUT EMPTY" MUST NOT LOOK THE SAME. */}
        {loadError && (
          <div className={`mb-4 rounded-xl border p-4 ${loadError.needsMigration ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50'}`}>
            {loadError.needsMigration ? (
              <>
                <p className="text-sm font-bold text-amber-900">The templates table is not there yet.</p>
                <p className="text-sm text-amber-800 mt-1">
                  Apply <code className="font-mono">supabase/migrations/20260909_outreach_templates.sql</code> in
                  the SQL editor, then run <code className="font-mono">notify pgrst, &apos;reload schema&apos;;</code> —
                  PostgREST returns PGRST205 against a table that exists until its cache reloads.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-red-900">Could not load templates.</p>
                <p className="text-sm text-red-800 mt-1">{loadError.message}</p>
              </>
            )}
          </div>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <div className="mb-4 rounded-xl border border-slate-300 bg-white p-4">
            <p className="text-sm font-bold text-slate-800">No templates yet.</p>
            <p className="text-sm text-slate-600 mt-1">
              The table is there and reachable — it just has no rows. Either the seed was skipped, or they
              were all deleted. Press <b>New template</b>, or re-run the seed section of the migration.
            </p>
          </div>
        )}

        {/* ── 🔴 MASTER — DETAIL — RAIL ─────────────────────────────────────────────────────────────
            THE GRID IS AN INLINE STYLE, NOT `grid-cols-[…]`. An arbitrary Tailwind value used by only
            one file has no generated rule until the JIT has scanned that file, and this file is new —
            that is precisely what left the compose window painting at `z-index: auto` behind the modal
            today. If this class went missing the three panes would stack into one column, which is the
            exact layout being fixed. An inline style cannot be absent from a stylesheet. */}
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: '240px minmax(0, 1fr) minmax(0, 1fr)' }}>

          {/* ── LIST — ONE LINE PER ROW ──────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {[...rows].sort((a, b) => a.sort_order - b.sort_order).map((r, i, arr) => {
              const isSel = selId === r.id
              return (
                <div key={r.id}
                  className={`group flex items-center gap-1.5 px-2.5 py-1.5 border-b border-slate-100 last:border-b-0 cursor-pointer ${isSel ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
                  onClick={() => setSelId(r.id)}>
                  <span className={`text-sm truncate flex-1 min-w-0 ${r.active ? (isSel ? 'font-semibold text-slate-900' : 'text-slate-800') : 'text-slate-400 line-through'}`}>
                    {r.label}
                  </span>
                  <span className="text-[10px] font-bold uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">
                    {r.channel === 'whatsapp' ? 'wa' : 'em'}
                  </span>
                  {/* 🔴 THE CONTROLS COST NO WIDTH WHEN IDLE. They are laid out only on hover or when the
                      row is selected; otherwise they are `hidden`, so the label gets the full row. */}
                  <span className={`flex items-center gap-0.5 flex-shrink-0 ${isSel ? 'flex' : 'hidden group-hover:flex'}`}>
                    <button onClick={e => { e.stopPropagation(); void move(r, -1) }} disabled={i === 0}
                      title="Move up" className="text-[11px] leading-none px-1 py-0.5 rounded border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50">↑</button>
                    <button onClick={e => { e.stopPropagation(); void move(r, 1) }} disabled={i === arr.length - 1}
                      title="Move down" className="text-[11px] leading-none px-1 py-0.5 rounded border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50">↓</button>
                    <button onClick={e => { e.stopPropagation(); void toggleActive(r) }}
                      title={r.active ? 'Retire (kept, hidden from the compose picker)' : 'Restore'}
                      className={`text-[11px] leading-none px-1 py-0.5 rounded border bg-white ${r.active ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-emerald-300 text-emerald-700'}`}>
                      {r.active ? '⦸' : '↺'}
                    </button>
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── EDITOR ───────────────────────────────────────────────────────────────────────────── */}
          <div className="min-w-0">
            {!selected && !loading && rows.length > 0 && (
              <p className="text-sm text-slate-500">Pick a template on the left.</p>
            )}
            {selected && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                {/* 🔴 DEFAULTS FIRST. They were below the body, which put them off screen — the one
                    thing on this pane that is set once and then rarely touched was the hardest to reach.
                    Above the label row they are visible the moment a template is selected, and they
                    still occupy a single row. */}
                {/* ── DEFAULTS — ONE ROW ─────────────────────────────────────────────────────────── */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Placeholder defaults</p>
                    {bodyPlaceholders.length > 0 && (
                      <button onClick={saveDefaults}
                        className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100">
                        Save defaults
                      </button>
                    )}
                  </div>
                  {bodyPlaceholders.length === 0 ? (
                    <p className="text-[12px] text-slate-500">No <code className="font-mono">[[placeholders]]</code> in this template.</p>
                  ) : (
                    <div className="flex gap-2.5">
                      {bodyPlaceholders.map(name => {
                        const stored = selected.placeholder_defaults?.[name]
                        const age = daysSince(stored?.updated_at ?? null)
                        const stale = age !== null && age > 60
                        return (
                          <label key={name} className="block flex-1 min-w-0">
                            <span className="flex items-center gap-1 mb-0.5 min-w-0">
                              <span className="text-[11px] font-semibold text-slate-700 truncate">{`[[${name}]]`}</span>
                              {stored
                                ? <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded flex-shrink-0 ${stale ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-600'}`}
                                    title={`Last changed ${fmtWhen(stored.updated_at)}${stale ? ' — over 60 days ago; check it is still correct.' : ''}`}>
                                    {stale ? 'stale' : fmtWhen(stored.updated_at)}
                                  </span>
                                : <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-100 text-amber-800 flex-shrink-0">none</span>}
                            </span>
                            <input type="text" className="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white"
                              value={defaultsDraft[name] ?? ''} placeholder="(typed per truck)"
                              onChange={e => setDefaultsDraft(d => ({ ...d, [name]: e.target.value }))} />
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-end gap-3">
                  <label className="block flex-1 min-w-0"><span className={LABEL}>Label</span>
                    <input type="text" className={FIELD} value={draft.label ?? ''}
                      onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} />
                  </label>
                  <label className="block w-36 flex-shrink-0"><span className={LABEL}>Channel</span>
                    <select className={FIELD} value={draft.channel ?? 'email'}
                      onChange={e => setDraft(d => ({ ...d, channel: e.target.value as 'email' | 'whatsapp' }))}>
                      <option value="email">email</option>
                      <option value="whatsapp">whatsapp</option>
                    </select>
                  </label>
                  {/* 🔴 THE SLUG APPEARS ONCE, HERE, FOR THE SELECTED TEMPLATE ONLY — it is fixed and
                      rarely relevant, so it does not belong on every list row. */}
                  <span className="flex-shrink-0 pb-1.5 text-[11px] text-slate-400 font-mono"
                    title="The key the compose picker resolves against. Fixed after creation — renaming it would orphan the suggestion.">
                    {selected.slug}
                  </span>
                </div>

                {/* ── 🔴 GLOBAL PLACEHOLDER DEFAULTS — SET ONCE, USED EVERYWHERE ─────────────────────
                    🧪 [[my rate]] appears in 4 of the 5 seeded templates. The per-template default
                    below stores a value on ONE template, so "set my rate" meant typing the same figure
                    four times and changing it meant editing four rows again. A value here reaches every
                    template that has no default of its own.
                    🔴 PRECEDENCE, STATED ONCE: a template default BEATS a global. The compose window
                    badges say which layer won — violet FROM GLOBAL, blue FROM DEFAULT with its age — so
                    a stale global cannot hide behind a field that looks freshly filled.
                    ⚠️ STORED IN THIS BROWSER (localStorage), not in the database. One operator, one
                    machine, and no second migration; the cost is that another machine will not have it.
                    🔴 IT SHIPS EMPTY. Nothing seeds a rate — these boxes start blank and stay blank
                    until you type in them, and nothing here writes to any template row. */}
                {allPlaceholders.length > 0 && (
                  <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-800">Global defaults</span>
                      <span className="text-[11px] text-violet-700">used when a template has no default of its own</span>
                      <button type="button"
                        onClick={() => { writeOutreachGlobals(globalsDraft); setGlobals(readOutreachGlobals()); say('Global defaults saved') }}
                        className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-700 text-white hover:bg-violet-800">
                        Save globals
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {allPlaceholders.map(name => (
                        <label key={name} className="block flex-1 min-w-[12rem]">
                          <span className="flex items-center gap-1 mb-0.5 min-w-0">
                            <span className="text-[11px] font-semibold text-slate-700 truncate">{}</span>
                            {globals[name] ? null : <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-slate-200 text-slate-600 flex-shrink-0">unset</span>}
                          </span>
                          <input type="text" className="w-full border border-violet-200 rounded-lg px-2 py-1 text-sm bg-white"
                            value={globalsDraft[name] ?? ''} placeholder="(not set)"
                            onChange={e => setGlobalsDraft(d => ({ ...d, [name]: e.target.value }))} />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {/* ── 🔴 WHAT THIS TEMPLATE SERVES — BOTH SHIP EMPTY AND NOTHING SETS THEM ─────────────
                    "— any —" is the stored NULL and is where every row starts. Setting a rung makes the
                    compose window log THAT rung when this template is used, which is the Pizza Mondo
                    defect: a chaser was sent and recorded as a first contact because the log form's
                    dropdown had the last word.
                    🔴 LEAD TYPE HERE PICKS THE TEMPLATE; IT DOES NOT VARY THE TEXT. The `?lead_*:` lines
                    inside a body already vary the wording per type, and lead type must drive exactly one
                    of the two — if a rule selected on lead type AND the chosen body still carried four
                    `?lead_*` lines, three would be dead in every message and nothing on screen would say
                    which. The rule of thumb in the field title below is the whole of it.
                    ⚠️ Disabled until the migration is applied AND PostgREST has reloaded its schema. */}
                <div className="flex items-end gap-3">
                  <label className="block w-52 flex-shrink-0">
                    <span className={LABEL}>Serves rung</span>
                    <select className={FIELD} disabled={!hasTemplateTags}
                      value={draft.serves_kind ?? ''}
                      title={hasTemplateTags
                        ? 'When set, choosing this template in the compose window LOGS this rung — instead of whatever the log form’s dropdown happens to hold. "— any —" leaves the dropdown in charge, which is how every template behaves today.'
                        : 'Needs migration 20260915_outreach_template_tags.sql, then notify pgrst, ‘reload schema’'}
                      onChange={e => setDraft(d => ({ ...d, serves_kind: e.target.value || null }))}>
                      <option value="">— any —</option>
                      {CONTACT_KINDS.map(k => <option key={k} value={k}>{kindLabel(k)}</option>)}
                    </select>
                  </label>
                  <label className="block w-60 flex-shrink-0">
                    <span className={LABEL}>Serves lead type</span>
                    <select className={FIELD} disabled={!hasTemplateTags}
                      value={draft.serves_lead_type ?? ''}
                      title={hasTemplateTags
                        ? 'Narrows which prospects this template is pre-selected for. "— any —" means it can serve all four. 🔴 Use this to pick a DIFFERENT template per type; use the ?lead_ lines inside the body to vary a sentence within ONE template. Not both for the same distinction.'
                        : 'Needs migration 20260915_outreach_template_tags.sql, then notify pgrst, ‘reload schema’'}
                      onChange={e => setDraft(d => ({ ...d, serves_lead_type: e.target.value || null }))}>
                      <option value="">— any —</option>
                      {LEAD_TYPES.map(lt => <option key={lt} value={lt}>{LEAD_TYPE_LABELS[lt]}</option>)}
                    </select>
                  </label>
                  {!hasTemplateTags && (
                    <span className="pb-1.5 text-[11px] text-amber-700">
                      Tagging needs <code className="font-mono">20260915_outreach_template_tags.sql</code>
                    </span>
                  )}
                </div>

                {draft.channel !== 'whatsapp' && (
                  <label className="block"><span className={LABEL}>Subject</span>
                    <input type="text" ref={subjectRef} className={FIELD} value={draft.subject ?? ''}
                      onFocus={() => setLastFocus('subject')}
                      onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} />
                  </label>
                )}

                <label className="block">
                  <span className={LABEL}>Body</span>
                  {/* Sized with `rows`: `text-sm` is INERT on a textarea (the unlayered rule in
                      globals.css forces font-size: inherit), so a class cannot set this height. */}
                  {/* 🔴 15 ROWS = 404px, MEASURED, AND THE 16TH ROW WAS CUT DELIBERATELY.
                      At 16 rows (430px) the Save button's bottom lands at 899px with the admin chrome
                      above it (AppHeader 52 + tab bar 37) — a ONE-PIXEL margin on a 1440x900 laptop,
                      which is not "fits". 15 rows puts it at 873px with real margin. The cost is 26px of
                      body height, and the box is `resize-y` so it can be dragged taller on a big screen.
                      🔴 SIZED WITH `rows`, NOT A CLASS: `text-sm` is INERT on a textarea here — the
                      unlayered rule in globals.css forces `font-size: inherit`, so the box renders at
                      16px whatever class it carries and only `rows` can set the height. */}
                  <textarea ref={bodyRef} rows={15} className={`${FIELD} resize-y leading-relaxed font-normal`}
                    value={draft.body ?? ''}
                    onFocus={() => setLastFocus('body')}
                    onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} />
                </label>

                {/* 🔴 (5) A HALF-WRITTEN CONDITIONAL HAS NO VISIBLE FAILURE MODE — the branch just never
                    fires. This is the only warning that can catch it before an email goes out. */}
                {halfPairs.length > 0 && (
                  <p className="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2">
                    <span className="font-bold">Half of a conditional pair:</span>{' '}
                    {halfPairs.map(x => x.pos ? `?${x.c}: without ?no_${x.c}:` : `?no_${x.c}: without ?${x.c}:`).join('; ')}.
                    {' '}Whichever half is missing, that branch never renders — the sentence simply
                    disappears for those prospects, with nothing on screen to say so.
                  </p>
                )}
                {/* 🔴 THE SECOND HARD STOP, SHOWN WHERE THE TEMPLATE IS WRITTEN. Unlike the unreadable-token
                    error this one is about DATA, not syntax: the token is spelled correctly and the
                    prospect simply has no live demo. It is prospect-specific, so it moves as the preview
                    prospect changes — which is exactly what makes it informative here. */}
                {(preview?.blocking.length ?? 0) > 0 && (
                  <p className="text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
                    <span className="font-bold">Cannot be sent to {previewProspect?.name}:</span>{' '}
                    {preview!.blocking.map(b => `{{${b}}}`).join(', ')}{' '}
                    — there is no live demo link for this prospect, and this token has no fallback on
                    purpose. 🧪 Only 1 of 231 prospects has one; the compose window refuses to send,
                    copy or log while it is unresolved.
                  </p>
                )}
                {malformed.length > 0 && (
                  <p className="text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
                    <span className="font-bold">Unreadable token{malformed.length > 1 ? 's' : ''}:</span>{' '}
                    <code className="font-mono">{malformed.join('  ')}</code>{' '}
                    — the renderer cannot read {malformed.length > 1 ? 'these' : 'this'} and would leave the
                    braces in the message, so the compose window will refuse to send it. Tokens are
                    lower-case with underscores: <code className="font-mono">{'{{truck_name}}'}</code>, not{' '}
                    <code className="font-mono">{'{{truck name}}'}</code>.
                  </p>
                )}
                {mistyped.length > 0 && (
                  <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <span className="font-bold">Possible mistyped token{mistyped.length > 1 ? 's' : ''}:</span>{' '}
                    {mistyped.map(m => `[${m}]`).join(', ')} — single brackets are ordinary text and print
                    literally. Use <code className="font-mono">{'{{token}}'}</code> or{' '}
                    <code className="font-mono">[[name]]</code>.
                  </p>
                )}

                <div className="flex justify-end">
                  <button onClick={saveDraft}
                    className="text-sm font-bold px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-400">
                    Save template
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── RAIL ─────────────────────────────────────────────────────────────────────────────── */}
          {/* 🔴 WHY A RAIL WITH A TAB STRIP, AND NOT THE ALTERNATIVES.
              • Collapsible panels below the editor — rejected: that IS the current layout's fault. The
                preview would sit under a 430px textarea, so seeing the conditional branch means
                scrolling, and the brief requires it in one action.
              • Tabs that REPLACE the editor — rejected: the preview's whole job is showing the effect of
                an edit, and hiding the body to look at the result makes comparing them impossible.
              • A rail beside the editor — chosen: both are on screen at once, switching Preview↔Tokens
                is one click, and the editor never moves. The cost is 360px of width, which a desktop-only
                page at max-w-[1800px] has to spare. */}
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="flex border-b border-slate-200 bg-slate-50">
                {RAIL_TABS.map(t => (
                  <button key={t.key} onClick={() => setRail(t.key)}
                    className={`flex-1 text-xs font-bold uppercase tracking-wide px-3 py-2 ${rail === t.key ? 'bg-white text-slate-800 border-b-2 border-orange-500' : 'text-slate-500 hover:text-slate-700'}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {rail === 'preview' && (
                <div className="p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input type="text" className="text-sm border border-slate-200 rounded-lg px-2 py-1 flex-1 min-w-0"
                      placeholder="Search trucks…" value={search} onChange={e => setSearch(e.target.value)} />
                    <select className="text-sm border border-slate-200 rounded-lg px-2 py-1 w-full"
                      value={previewId ?? ''} onChange={e => setPreviewId(e.target.value || null)}>
                      <option value="">— pick a prospect —</option>
                      {filteredProspects.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.nextEventDate ? '' : '  (no upcoming event)'}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-[12px] text-slate-700">
                      <input type="checkbox" className="w-4 h-4 accent-orange-600"
                        checked={forceNoEvent} onChange={e => setForceNoEvent(e.target.checked)} />
                      Simulate no upcoming event
                    </label>
                  </div>
                  {!previewProspect ? (
                    <p className="text-sm text-slate-500">Pick a prospect to render this against.</p>
                  ) : preview && (
                    <>
                      {preview.subject && (
                        <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                          <span className="font-bold uppercase text-slate-400 text-[9px]">Subject </span>{preview.subject}
                        </p>
                      )}
                      {/* 🔴 16px, MATCHING THE BODY, AND THAT IS THE WHOLE POINT OF THE EQUAL PANES.
                          The body textarea is FORCED to 16px by the unlayered !important rule in
                          globals.css and cannot be shrunk, so alignment had to come from raising
                          this instead. At 12px the preview fitted ~26% more characters per line
                          than the body, so the same paragraph broke in different places and the
                          two panes could not be compared line for line.
                          ⚠️ `text-base` is a core utility with 25 other users in the repo, so
                          unlike an arbitrary value it cannot be missing a generated rule.
                          `leading-relaxed` gives 26px here exactly as it does on the body. */}
                      <pre className="text-base leading-relaxed text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-2 whitespace-pre-wrap font-sans overflow-y-auto"
                        style={{ maxHeight: 340 }}>{preview.full}</pre>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.unresolved.length > 0 && (
                          <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            Unresolved: {preview.unresolved.map(u => `[[${u}]]`).join(', ')}
                          </span>
                        )}
                        {preview.droppedConditions.length > 0 && (
                          <span className="text-[11px] text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                            Dropped: {preview.droppedConditions.join(', ')}
                          </span>
                        )}
                        {preview.isEmail && (
                          <span className="text-[11px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded px-1.5 py-0.5">
                            Footer appended above
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {rail === 'tokens' && (
                <div className="p-3 space-y-3">
                  {/* 🔴 THE PALETTE IS DISABLED UNTIL A FIELD HAS BEEN FOCUSED, and says why. Inserting
                      into a guessed field is how text lands somewhere nobody watched. */}
                  <p className={`text-[11px] rounded px-2 py-1 ${lastFocus ? 'text-slate-500' : 'text-amber-800 bg-amber-50 border border-amber-200'}`}>
                    {lastFocus
                      ? `Clicking inserts at your cursor in the ${lastFocus}.`
                      : 'Click into the subject or body first — then these insert at your cursor.'}
                  </p>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">Values from the row</p>
                    <div className="flex flex-wrap gap-1">
                      {tokenRef.map(t => (
                        <button key={t.name} onClick={() => insertAtCaret(t.syntax)} disabled={!lastFocus}
                          title={t.description}
                          className="text-[11px] font-mono px-1.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-orange-50 hover:border-orange-300 disabled:opacity-40">
                          {t.syntax}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">Conditional clause pairs</p>
                    {/* 🔴 ONE CLICK INSERTS BOTH LINES. Two lines that must both exist, where a missing
                        half fails silently, is the most error-prone thing to type by hand. */}
                    <div className="flex flex-col gap-1">
                      {condPairs.map(c => (
                        <button key={c}
                          onClick={() => insertAtCaret(`?${c}: 
?no_${c}: `, { ownLines: true })}
                          disabled={!lastFocus}
                          title={`Inserts both halves: ?${c}: and ?no_${c}: — one renders, the other is dropped, so the sentence always exists.`}
                          className="text-[11px] font-mono text-left px-1.5 py-1 rounded border border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100 disabled:opacity-40">
                          {`?${c}: / ?no_${c}:`} <span className="font-sans not-italic">(both lines)</span>
                        </button>
                      ))}
                      {condPairs.length === 0 && <p className="text-[11px] text-slate-400">No condition has a matching negative half.</p>}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">Single conditions</p>
                    {/* ⚠️ These have NO `no_` counterpart in the code, so they are offered singly. A
                        `?no_website:` line would hit conditionMet's default and be dropped every time. */}
                    <div className="flex flex-wrap gap-1">
                      {condSingles.map(c => (
                        <button key={c} onClick={() => insertAtCaret(`?${c}: `, { ownLines: true })} disabled={!lastFocus}
                          className="text-[11px] font-mono px-1.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-orange-50 hover:border-orange-300 disabled:opacity-40">
                          {`?${c}:`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1">Fill-in placeholder</p>
                    <button onClick={() => insertAtCaret('[[name]]')} disabled={!lastFocus}
                      className="text-[11px] font-mono px-1.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-orange-50 hover:border-orange-300 disabled:opacity-40">
                      [[name]]
                    </button>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Stays visible until filled in the compose window, and is never guessed. An unknown
                      <code className="font-mono"> {'{{token}}'}</code> also becomes one, so a typo shows up
                      rather than printing literally.
                    </p>
                  </div>

                  {/* 🔴 NOTHING IS APPENDED ANY MORE. This block named the two things the mechanism
                      added to every email — the signature and the mandatory opt-out line. Both moved to
                      the Outlook signature, so a note here saying "every email also gets this" would be
                      describing behaviour that no longer exists. The preview above is the whole message. */}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg" style={{ zIndex: 60 }}>{toast}</div>
      )}
    </div>
  )
}
