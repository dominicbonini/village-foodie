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
import {
  LEAD_TYPES, nextStep, templateForStep, type LeadType, type Step,
} from '@/lib/outreach-step'
// ⚠️ SHARED WITH A CUSTOMER PATH — `components/EventListCard.tsx` (the live call/message button) imports
// this same module. It is READ here and NOTHING ELSE; lib/whatsapp-hint.ts carries no change from this
// task. It is imported for one reason: `nextStep` needs `waPhone` to decide a prospect's channel, and
// OutreachPanel already builds it exactly this way. A second derivation here would be a second answer.
import { phoneWhatsApp } from '@/lib/whatsapp-hint'
import { snippetIndex, snippetMapOf, isUnset, type Snippet, type SnippetUse } from '@/lib/outreach-snippets'
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
  // 🔴 THE FIELDS `nextStep` READS, so the match count under section 2 can drive the REAL step
  // derivation rather than a second copy of it. All are already returned by /api/admin/outreach — this
  // type simply never declared them, because until now the preview was the only consumer.
  // ⚠️ Optional throughout: a route running against an unapplied migration omits some, and `nextStep`
  // treats every one of them as optional too. A missing field must degrade the COUNT, never throw.
  contacts?: { contacted_at?: string | null; direction?: string | null; kind?: string | null; channel?: string | null }[]
  phone?: string | null
  contact_email?: string | null
  do_not_contact?: boolean | null
  stage?: string | null
  hatchgrab_truck_id?: string | null
}

// The rail's two tabs. 🔴 Preview is the default: it is the only way to see the conditional branch
// before sending, and the brief requires it reachable in one action — so it is reachable in zero.
const RAIL_TABS = [
  { key: 'preview' as const, label: 'Preview' },
  { key: 'tokens' as const, label: 'Tokens' },
]
type RailTab = typeof RAIL_TABS[number]['key']


// ── 🔴 THE SNIPPETS LIBRARY ─────────────────────────────────────────────────────────────────────────
// One row per DISTINCT `[[name]]` across every loaded template — not per template, not per occurrence.
// Beside each, the real LABELS of the templates that use it, because the point of the redesign is that
// the blast radius is visible BEFORE saving: a value used by four emails should say so while you are
// changing it, not after.
function SnippetsLibrary({ uses, snippets, draft, setDraft, onSave, enabled }: {
  uses: SnippetUse[]
  snippets: Snippet[]
  draft: Record<string, string>
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onSave: (name: string) => void
  enabled: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline gap-3 mb-3">
        <p className="text-sm font-semibold text-slate-900">Snippets</p>
        <p className="text-[12px] text-slate-500">
          A value set here is used by every template that writes <code className="font-mono">[[its name]]</code>.
          Leave one blank to be asked per truck.
        </p>
      </div>

      {!enabled && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-[12px] font-bold text-amber-900">The snippets table is not there yet.</p>
          <p className="text-[12px] text-amber-800 mt-0.5">
            Apply <code className="font-mono">supabase/migrations/20260916_outreach_snippets.sql</code>, then run{' '}
            <code className="font-mono">notify pgrst, &apos;reload schema&apos;;</code> — PostgREST answers from a
            cached schema until it is told to reload. Until then every placeholder is asked per truck, as before.
          </p>
        </div>
      )}

      {uses.length === 0 ? (
        // ⚠️ THE EMPTY STATE NAMES ITS CAUSE. An empty library is not a fault — it means no template
        // body contains a `[[marker]]` — and saying so stops it reading as a failed load.
        <p className="text-[13px] text-slate-500">
          No <code className="font-mono">[[placeholders]]</code> in any template, so there is nothing to define.
          Add one to a template body and it appears here.
        </p>
      ) : (
        <div className="divide-y divide-slate-100">
          {uses.map(u => {
            const stored = snippets.find(s => s.name === u.name)
            const value = draft[u.name] ?? ''
            const dirty = (stored?.value ?? '') !== value
            // 🔴 THREE STATES, AND TWO OF THEM LOOK THE SAME TO THE RENDERER BUT NOT TO A PERSON.
            //   a value      → filled in every message
            //   blank ROW    → "ask me per truck", a decision that was made
            //   NO row       → nobody has looked at this one yet
            // Both blanks prompt at compose time; only the operator needs them told apart.
            const unset = isUnset(snippets, u.name)
            return (
              <div key={u.name} className="py-2.5 flex items-start gap-3 flex-wrap">
                <div className="w-44 flex-shrink-0">
                  <div className="text-[12px] font-mono font-semibold text-slate-800 truncate"
                    title={`[[${u.name}]]`}>{`[[${u.name}]]`}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {unset ? 'never set' : (stored?.value ?? '').trim() === '' ? 'ask per truck' : 'set'}
                  </div>
                </div>

                <div className="flex-1 min-w-[12rem]">
                  <input type="text" disabled={!enabled}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white disabled:bg-slate-50"
                    placeholder="(blank = ask me per truck)"
                    value={value}
                    onChange={e => setDraft(d => ({ ...d, [u.name]: e.target.value }))} />
                </div>

                {/* 🔴 THE BLAST RADIUS. Real labels, not counts alone — "four templates" does not tell
                    you WHICH four, and the whole reason this screen exists is to see that a change
                    reaches the general approach AND the chaser before making it.
                    ⚠️ An INACTIVE template is listed and marked, not hidden: it is still a template the
                    value reaches if it is ever switched back on, and hiding it would understate the
                    radius. */}
                <div className="flex-1 min-w-[14rem]">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">
                    Used by {u.templates.length} template{u.templates.length === 1 ? '' : 's'}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {u.templates.map(t => (
                      <span key={t.id}
                        className={`text-[11px] px-1.5 py-0.5 rounded border ${t.active
                          ? 'border-slate-200 bg-slate-50 text-slate-700'
                          : 'border-slate-200 bg-white text-slate-400 line-through'}`}
                        title={t.active ? t.label : `${t.label} — retired, but still uses this snippet`}>
                        {t.label}
                      </span>
                    ))}
                  </div>
                </div>

                <button type="button" disabled={!enabled || !dirty} onClick={() => onSave(u.name)}
                  className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-700 text-white hover:bg-violet-800 disabled:bg-slate-200 disabled:text-slate-400">
                  {dirty ? 'Save' : 'Saved'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 🔴 A SENTINEL ID, AND IT IS LOAD-BEARING. `templateForStep` falls back to the hardcoded
// `STEP_TEMPLATE` slug map when no tagged template matches, and then returns THAT slug — so probing
// with the template's own slug would count a FALLBACK hit as a TAG match, and a template whose slug
// happened to be `chaser_email` would read as matching everything. `@` cannot appear in a slug (the
// route validates `^[a-z0-9_-]{3,60}$`) and appears in no STEP_TEMPLATE entry, so the fallback branch
// can only ever return `slug_absent` — making `slug === PROBE_ID` true if and only if the TAG branch
// matched. 🧪 The mutation test for this is the "probe id equals a real slug" control in the report.
const PROBE_ID = '@@match-probe@@'

// 🔴 PLAIN WORDING FOR THE FOUR LEAD TYPES — A LABEL MAP, NOT A RENAME.
// The KEYS are `LeadType`, so this map is checked against the real union at compile time and cannot
// drift out of step with it; the VALUES are only what the dropdown prints. Nothing here changes a
// stored string, a column, or `LEAD_TYPE_LABELS` — which stays exactly as it is because the outreach
// list and the compose window render it, and two screens disagreeing about a truck's description would
// be worse than either wording.
// ⚠️ THE LIST ITSELF STAYS IN CODE, AND THAT IS THE HONEST ANSWER, NOT A SHORTCUT. `leadTypeOf` decides
// a truck's type with a fixed predicate over `hu_ordering` / `hu_map` / `show_on_vf`; a fifth type typed
// into a settings screen would have no branch there, so no truck could ever derive to it and a template
// tagged with it would silently match nobody. The fix for "these seem hardcoded" is that the wording is
// plain and the explanation is ON THE PAGE — not a dropdown the operator can add dead entries to.
const LEAD_TYPE_PLAIN: Record<LeadType, string> = {
  hu_ordering: 'On Hatches Up, taking orders',
  hu_map: 'On Hatches Up, map only',
  on_vf: 'On the Village Foodie map',
  not_listed: 'Not listed anywhere',
}

const FIELD = 'w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm'
const LABEL = 'block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5'
// 🔴 `fmtWhen` AND `daysSince` ARE GONE WITH THE BADGES THEY SERVED. They rendered a per-placeholder
// age — amber "none" when unset, red "stale" past 60 days — on a value the operator sets once and
// changes when his rate changes. Tracking how old it is answered a question nobody was asking, and it
// made an unset field look like a warning. The snippet library says "not set" or "asked per truck" and
// stops there.

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
  /** Whether 20260915_outreach_template_tags.sql is applied AND PostgREST has reloaded. Reported by
   *  the route as a capability flag, exactly like hasContactNames on the outreach route. */
  const [hasTemplateTags, setHasTemplateTags] = useState(false)
  // 🔴 THE SNIPPET LIBRARY — the single place a `[[name]]` value is set, replacing BOTH of the panels
  // that used to do this job: the per-template "Placeholder defaults" row (one value, one edit per
  // template that mentioned it) and the localStorage "Global defaults" box added on 15 September (one
  // edit, but only in the browser it was typed into). Neither was a library; this is.
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [snippetDraft, setSnippetDraft] = useState<Record<string, string>>({})
  /** False until 20260916_outreach_snippets.sql is applied AND PostgREST has reloaded its schema. */
  const [hasSnippets, setHasSnippets] = useState(false)
  const [snippetNote, setSnippetNote] = useState<string | null>(null)
  /** Which top-level view the tab is showing. Snippets is global, so it cannot live in the rail — the
   *  rail only renders with a template selected. See the report for the alternatives considered. */
  const [view, setView] = useState<'templates' | 'snippets'>('templates')

  /** name → value, for the read-only display on the template editor and for the compose pre-fill. */
  const snippetValues = useMemo(() => snippetMapOf(snippets), [snippets])

  // 🔴 EVERY DISTINCT `[[name]]` ACROSS EVERY LOADED TEMPLATE, WITH THE TEMPLATES THAT USE IT.
  // ⚠️ THE INPUT IS THE TEMPLATE BODIES, so the library is only as right as they are: a template the
  // route did not return is not counted, and a name typed two ways is two snippets. That is a property
  // of the marker being free text — normalising case here would silently merge two markers the
  // renderer treats as distinct, which is worse than showing both.
  const snippetUses = useMemo(
    () => snippetIndex(rows.map(r => ({
      id: r.id, label: r.label, slug: r.slug, active: r.active, subject: r.subject, body: r.body,
    })), unresolvedIn),
    [rows])


  // ── 🔴 THE MATCH COUNT — "how many prospects would this actually pick up?" ───────────────────────
  // A rule you cannot count is a rule you cannot check. These two memos turn the three dropdowns in
  // section 2 into a number against the live list.
  //
  // 🔴 IT DRIVES THE REAL FUNCTIONS. `nextStep` derives the rung, the channel and the lead type exactly
  // as the outreach list does; `templateForStep` is THE matcher the compose window's pre-selection
  // uses. Nothing here re-implements either. A second copy would agree on the day it was written and
  // drift afterwards, and the drift would surface as a count that quietly disagreed with what the
  // composer actually opened.
  //
  // ⚠️ COST. `steps` is keyed on `prospects` ALONE, so it is computed once per load — not per keystroke.
  // The count is keyed on the three rule fields only, so typing in Label, Subject or Body recomputes
  // NOTHING. Changing a dropdown walks the prospect list once.
  const steps = useMemo(() => {
    const m = new Map<string, Step>()
    for (const p of prospects) {
      // ⚠️ `waPhone` from the SHARED `phoneWhatsApp`, built exactly as OutreachPanel builds it — the
      // same call, so the two cannot disagree about who is reachable on WhatsApp.
      m.set(p.id, nextStep({ ...p, waPhone: phoneWhatsApp(p.phone ?? null, null).waPhone }, p.contacts ?? []))
    }
    return m
  }, [prospects])




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
      // 🔴 THE LIBRARY, FETCHED BESIDE THE TEMPLATES AND NEVER FATAL. Before the migration is applied
      // the route answers 200 with `hasSnippets: false`, so the tab keeps working and every field
      // simply prompts — which is what the `[[…]]` tier has always done.
      try {
        const rs = await fetch('/api/admin/outreach-snippets', { headers: h, credentials: 'same-origin' })
        if (rs.ok) {
          const ds = await rs.json()
          setSnippets(ds.snippets ?? [])
          setHasSnippets(!!ds.hasSnippets)
          setSnippetDraft(Object.fromEntries((ds.snippets ?? []).map((x: Snippet) => [x.name, x.value ?? ''])))
        }
      } catch { /* the tier prompts, as it always has */ }
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

  const match = useMemo(() => {
    if (!selected) return null
    // 🔴 NULL RUNG IS NOT "ANY". `templateForStep` tests `servesKind === step.kind`, so a null rung
    // never tag-matches anything — the template falls through to the hardcoded map instead. Reporting
    // "0 prospects" there would be true but misleading, so this reports a DIFFERENT state.
    if (!draft.serves_kind) return { kind: 'untagged' as const, n: 0 }
    if (prospects.length === 0) return { kind: 'noprospects' as const, n: 0 }
    const probe = [{
      id: PROBE_ID,
      channel: draft.channel ?? 'email',
      sortOrder: 0,
      servesKind: draft.serves_kind ?? null,
      servesLeadType: draft.serves_lead_type ?? null,
    }]
    let n = 0
    for (const p of prospects) {
      const step = steps.get(p.id)
      if (!step) continue
      if (templateForStep(step, probe).slug === PROBE_ID) n++
    }
    return { kind: 'counted' as const, n }
  }, [selected, prospects, steps, draft.channel, draft.serves_kind, draft.serves_lead_type])
  // ── 🔴 THE UNSAVED-DRAFT GUARD ──────────────────────────────────────────────────────────────────
  // `draft` is reset by the effect on [selected], so clicking another template in the list USED TO
  // destroy every unsaved edit with no warning and no undo. That is the worse of the two silent losses
  // in this file: the work was typed, it was on screen, and one click erased it.
  //
  // 🔴 DIRTY IS COMPARED FIELD BY FIELD AGAINST THE STORED ROW, not tracked with an onChange flag. A
  // flag says "something was typed", which is true even after typing a character and deleting it again
  // — and a guard that fires when nothing actually changed is a guard people learn to click through.
  // ⚠️ `?? null` on both sides of every comparison: the route returns null for an absent subject and
  // the draft holds '' after the field is emptied, and null !== '' would mark a clean row dirty for ever.
  const dirty = useMemo(() => {
    if (!selected) return false
    const a = draft
    return (a.label ?? '') !== (selected.label ?? '')
      || (a.channel ?? 'email') !== (selected.channel ?? 'email')
      || (a.subject ?? '') !== (selected.subject ?? '')
      || (a.body ?? '') !== (selected.body ?? '')
      || (a.serves_kind ?? null) !== (selected.serves_kind ?? null)
      || (a.serves_lead_type ?? null) !== (selected.serves_lead_type ?? null)
  }, [draft, selected])

  /** The row the operator asked for while an edit was outstanding. Null when nothing is pending. */
  const [pendingSelId, setPendingSelId] = useState<string | null>(null)

  // 🔴 EVERY SELECTION GOES THROUGH HERE. The list calls this, never `setSelId` directly, so there is
  // exactly one place the guard can be bypassed — and it is not bypassed.
  const requestSelect = (id: string) => {
    if (id === selId) return
    if (dirty) { setPendingSelId(id); return }   // hold it; the bar below decides
    setSelId(id)
  }

  // Seed the editor when the selection changes.
  useEffect(() => {
    if (!selected) { setDraft({}); return }
    // 🔴 THE TAGS ARE SEEDED INTO THE DRAFT TOO, or saving any other field would post the draft
    // without them and the update would read as "no change" for the tags while silently keeping the
    // stored value. Seeding them makes what is on screen what gets sent.
    setDraft({ label: selected.label, channel: selected.channel, subject: selected.subject,
      body: selected.body, sort_order: selected.sort_order, active: selected.active,
      serves_kind: selected.serves_kind ?? null, serves_lead_type: selected.serves_lead_type ?? null })
  }, [selected])

  /** 🔴 ONE NAME PER SAVE. A bulk write would make "which of these did I just change" unanswerable,
   *  and the blast radius shown beside each row is per name. */
  const saveSnippet = async (name: string) => {
    const h = await nativeAuthHeader()
    const res = await fetch('/api/admin/outreach-snippets', {
      method: 'POST', credentials: 'same-origin',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_snippet', name, value: snippetDraft[name] ?? '' }),
    })
    const out = await res.json().catch(() => null)
    if (!res.ok) { setSnippetNote(out?.error || 'Could not save'); return }
    setSnippets(cur => {
      const rest = cur.filter(x => x.name !== name)
      return [...rest, out.snippet].sort((a, b) => a.name.localeCompare(b.name))
    })
    const used = snippetUses.find(u => u.name === name)?.templates.length ?? 0
    setSnippetNote(`Saved [[${name}]] — used by ${used} template${used === 1 ? '' : 's'}`)
  }

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

  // 🔴 IT REPORTS WHETHER IT ACTUALLY SAVED. The unsaved-changes bar switches template only on a
  // TRUE here: a failed write that switched anyway would discard the draft in the one flow built to
  // protect it, and the operator would have pressed a button labelled "Save" to lose their work.
  const saveDraft = async (): Promise<boolean> => {
    if (!selected) return false
    const out = await post({ action: 'update_template', id: selected.id, ...draft })
    if (out) { say('Saved'); return true }
    return false            // `post` has already shown the error in the toast
  }
  // 🔴 `saveDefaults` IS GONE. It was the only caller of the route's `set_defaults` action and the only
  // way the UI wrote `outreach_templates.placeholder_defaults` — which is exactly the per-template
  // storage this redesign replaces. The ROUTE ACTION IS DELIBERATELY LEFT IN PLACE: it is the only
  // mechanism that can clear a legacy value, and removing it would leave a shadowed value with no way
  // out short of hand-written SQL. Nothing in the UI calls it, so nothing writes a template row.
  const toggleActive = async (r: Row) => { await post({ action: 'update_template', id: r.id, active: !r.active }) }
  // ── 🔴 REORDER — REBUILT, BECAUSE THE OLD ONE WAS DEAD ON EXACTLY THE ROWS DOMINIC USES ──────────
  // The old body SWAPPED the two rows' `sort_order` values. 🧪 `chase-1` and `wa_chaser` both sit at
  // 999 (his figure), and swapping 999 with 999 writes 999 over 999 — the button posted twice, the
  // list reloaded, and nothing moved. Every template created through this tab gets 999 from the route,
  // so the arrows were dead for every row the tab itself made.
  //
  // 🔴 THE FIX IS TO STOP MOVING VALUES AND START ASSIGNING POSITIONS. Build the order the operator
  // asked for, then number it 10, 20, 30 … A position is unambiguous where a swap is not, so a move
  // ALWAYS reorders — including when every row in the list shares one value.
  //
  // ⚠️ IT WRITES ONLY THE ROWS WHOSE NUMBER ACTUALLY CHANGES. Renumbering the whole list on every click
  // would touch template rows the operator did not ask to touch; the filter below means moving one of
  // two tied rows writes those rows and nothing else. 🔴 NOTHING RENUMBERS ON LOAD, on save, or in a
  // migration — the only thing that ever writes `sort_order` is this click. See the report's SQL if a
  // one-off tidy of the stored numbers is wanted; that is Dominic's to run, not this code's.
  const move = async (r: Row, dir: -1 | 1) => {
    // 🔴 THE SAME COMPARATOR THE LIST RENDERS WITH, INCLUDING THE TIE-BREAK. Sorting here by
    // `sort_order` alone would let two tied rows come back in a different order than the one on screen,
    // and the arrow would then move a row the operator was not pointing at.
    const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    const i = ordered.findIndex(x => x.id === r.id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ordered.length) return
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]     // positions, not values
    const writes = ordered
      .map((row, idx) => ({ row, next: (idx + 1) * 10 }))
      .filter(({ row, next }) => row.sort_order !== next)
    for (const { row, next } of writes) {
      await post({ action: 'update_template', id: row.id, sort_order: next })
    }
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
      // 🔴 AND SWITCH TO THE VIEW THAT CAN SHOW IT. The New template button sits ABOVE the view switch,
      // so it is clickable from the Snippets view — but the editor lives in the other branch of that
      // switch and is not rendered there. Without this line the row is inserted, selected, and drawn
      // NOWHERE: the only evidence is an 1800ms toast, which is how a blank template got left behind.
      // 🧪 Creating from the Templates view already sets this to the value it already has — a no-op there.
      setView('templates')
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
        {/* ── 🔴 A TOP-LEVEL VIEW SWITCH, NOT A THIRD RAIL TAB ──────────────────────────────────────
            The rail (Preview / Tokens) renders only inside `{selected && …}`, so a Snippets tab there
            would be unreachable with no template selected — and the library is GLOBAL: its whole point
            is that it is not about one template. A switch here is always reachable, leaves the
            master–detail–rail grid untouched, and keeps the two views from competing for width.
            ⚠️ Alternatives weighed and rejected: a fourth grid column (squeezes the editor at every
            width), a collapsible strip above the grid (pushes the editor down permanently), and its own
            admin nav item (a whole tab for one table). */}
        <div className="flex items-center gap-2 mb-4">
          {([['templates', 'Templates'], ['snippets', `Snippets${snippetUses.length ? ` (${snippetUses.length})` : ''}`]] as const)
            .map(([v, label]) => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
                className={`text-sm rounded-lg px-3 py-1.5 border font-semibold ${view === v
                  ? 'bg-slate-800 border-slate-800 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          {view === 'snippets' && snippetNote && (
            <span className="text-xs text-slate-600">{snippetNote}</span>
          )}
        </div>

        {/* ── 🔴 THE UNSAVED-CHANGES BAR ────────────────────────────────────────────────────────────
            What happens if Dominic clicks another template with an edit outstanding: NOTHING happens
            until he answers this. The click is HELD, not applied and not thrown away — the editor still
            shows his work, and the three buttons are the three things he could mean. There is no fourth
            outcome, and no path that discards typed text without him pressing a button that says so. */}
        {pendingSelId && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-bold text-amber-900">Unsaved changes</span>
            <span className="text-[12px] text-amber-800 flex-1 min-w-[12rem]">
              You edited <b>{selected?.label}</b> without saving. Switching now would lose it.
            </span>
            <button type="button"
              onClick={async () => { const go = pendingSelId; if (await saveDraft()) { setPendingSelId(null); setSelId(go) } }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-700 text-white hover:bg-violet-800">
              Save, then switch
            </button>
            <button type="button"
              onClick={() => { const go = pendingSelId; setPendingSelId(null); setSelId(go) }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-400 bg-white text-amber-900 hover:bg-amber-100">
              Discard my changes
            </button>
            <button type="button" onClick={() => setPendingSelId(null)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">
              Stay here
            </button>
          </div>
        )}

        {view === 'snippets' ? <SnippetsLibrary
          uses={snippetUses} snippets={snippets} draft={snippetDraft} setDraft={setSnippetDraft}
          onSave={saveSnippet} enabled={hasSnippets} /> : (
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: '240px minmax(0, 1fr) minmax(0, 1fr)' }}>

          {/* ── LIST — ONE LINE PER ROW ──────────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* 🔴 THE SAME COMPARATOR `move` USES. Sorting on `sort_order` alone left ties to Array.sort
                stability — the order the API happened to return — so the list and the arrows could disagree
                about which row sits where. Declared here, declared there, identical. */}
            {[...rows].sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug)).map((r, i, arr) => {
              const isSel = selId === r.id
              return (
                <div key={r.id}
                  className={`group flex items-center gap-1.5 px-2.5 py-1.5 border-b border-slate-100 last:border-b-0 cursor-pointer ${isSel ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
                  onClick={() => requestSelect(r.id)}>
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
                {/* ══ 1 · NAME IT ═══════════════════════════════════════════════════════════════════
                    🔴 THE THREE SECTIONS ARE THE EDITOR, NOT A WIZARD. Dominic spends most of his time
                    editing templates that already exist, and a stepper only ever runs once — it would
                    have left the common case exactly as it was. These are headed groups on one screen:
                    identical markup for a new row and a ten-month-old one, every field reachable at all
                    times, no "next" to press and no state to be half-way through.
                    ⚠️ The order is the order the fields were already in. What was missing was the
                    headings, and one visible sentence each saying what the group is for. */}
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold grid place-items-center">1</span>
                    <h3 className="text-sm font-bold text-slate-900">Name it</h3>
                  </div>
                  <p className="text-[12px] text-slate-500 mb-2 ml-7">
                    This name is for you — it appears in your template list and the compose picker.
                    <b> Nobody you contact ever sees it.</b>
                  </p>
                  <div className="ml-7 flex items-end gap-3">
                    <label className="block flex-1 min-w-0"><span className={LABEL}>Template name</span>
                      <input type="text" className={FIELD} value={draft.label ?? ''}
                        onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} />
                    </label>
                    {/* 🔴 THE SLUG APPEARS ONCE, HERE, FOR THE SELECTED TEMPLATE ONLY — it is fixed and
                        rarely relevant, so it does not belong on every list row. */}
                    <span className="flex-shrink-0 pb-1.5 text-[11px] text-slate-400 font-mono"
                      title="The key the compose picker resolves against. Fixed after creation — renaming it would orphan the suggestion.">
                      {selected.slug}
                    </span>
                  </div>
                </div>

                {/* ══ 2 · WHEN TO USE IT ════════════════════════════════════════════════════════════
                    🔴 THE EXPLANATIONS USED TO BE `title=` TOOLTIPS AND THEY MAY AS WELL NOT HAVE
                    EXISTED. A tooltip needs a hover and a wait, never appears on a touch screen, and is
                    invisible to someone who does not already know it is there — which is everyone who
                    needed it. The same sentences are now on the page. */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold grid place-items-center">2</span>
                    <h3 className="text-sm font-bold text-slate-900">When to use it</h3>
                  </div>
                  <p className="text-[12px] text-slate-500 mb-2 ml-7">
                    When a truck is due to be contacted, Village Foodie works out which stage they are at
                    and what kind of truck they are. <b>If that matches the three settings below, this
                    template is the one it opens for you.</b> Leave them alone and this template is only
                    ever chosen by hand.
                  </p>

                  <div className="ml-7 flex items-end gap-3 flex-wrap">
                    <label className="block w-40 flex-shrink-0"><span className={LABEL}>Send by</span>
                      <select className={FIELD} value={draft.channel ?? 'email'}
                        onChange={e => setDraft(d => ({ ...d, channel: e.target.value as 'email' | 'whatsapp' }))}>
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                      </select>
                    </label>

                    {/* 🔴 LABELS ONLY. `CONTACT_KINDS` supplies the VALUES and they are written to the
                        database unchanged; `kindLabel` supplies the words, and it already spells them
                        the way Dominic does — "First contact", "Chase 1", "Chase 2", "Final chase".
                        Nothing here renames a column, a constant or a stored string. */}
                    <label className="block w-52 flex-shrink-0">
                      <span className={LABEL}>At which stage</span>
                      <select className={FIELD} disabled={!hasTemplateTags}
                        value={draft.serves_kind ?? ''}
                        onChange={e => setDraft(d => ({ ...d, serves_kind: e.target.value || null }))}>
                        {/* 🔴 NULL IS NOT "ANY STAGE". `templateForStep` tests `servesKind === step.kind`,
                            so an untagged template is never picked automatically at all — it falls
                            through to the built-in map. The option has to say that, or it reads as a
                            wildcard and the operator waits for a match that cannot come. */}
                        <option value="">Never picked automatically</option>
                        {CONTACT_KINDS.map(k => <option key={k} value={k}>{kindLabel(k)}</option>)}
                      </select>
                    </label>

                    <label className="block w-64 flex-shrink-0">
                      <span className={LABEL}>For which trucks</span>
                      <select className={FIELD} disabled={!hasTemplateTags}
                        value={draft.serves_lead_type ?? ''}
                        onChange={e => setDraft(d => ({ ...d, serves_lead_type: e.target.value || null }))}>
                        {/* Here null REALLY IS "any" — `servesLeadType == null || === step.leadType`. */}
                        <option value="">Any truck</option>
                        {LEAD_TYPES.map(lt => (
                          <option key={lt} value={lt}>{LEAD_TYPE_PLAIN[lt]}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* ── 🔴 THE MATCH COUNT — the rule, made concrete ─────────────────────────────────
                      Three dropdowns describe a rule; this says who it actually catches, from the live
                      prospect list, using the same two functions the outreach list and the compose
                      window use. It is the difference between "I think this is right" and "this picks
                      up 105 trucks". ⚠️ It costs one walk of the prospect list when a dropdown changes
                      and NOTHING when typing — the memo above is keyed on the three rule fields only. */}
                  <div className="ml-7 mt-2">
                    {match?.kind === 'untagged' && (
                      <p className="text-[12px] text-slate-500">
                        Not picked automatically. You can still choose it by hand in the compose window.
                      </p>
                    )}
                    {match?.kind === 'noprospects' && (
                      <p className="text-[12px] text-slate-400">
                        Counting needs the prospect list — it has not loaded, so this is not a zero.
                      </p>
                    )}
                    {match?.kind === 'counted' && (
                      <p className={`text-[12px] ${match.n === 0 ? 'text-amber-800' : 'text-slate-700'}`}>
                        {match.n === 0 ? (
                          <>
                            <b>No trucks match this right now.</b> Nothing is broken — it means nobody is
                            currently due at this stage with this description. It will pick up trucks as
                            they become due.
                          </>
                        ) : (
                          <>
                            Matches <b>{match.n}</b> truck{match.n === 1 ? '' : 's'} due now.
                            {' '}<span className="text-slate-500">
                              Another template tagged the same way and sitting higher in the list would
                              be chosen instead.
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  {/* ⚠️ THE DISABLED STATE NAMES BOTH CAUSES, BECAUSE THEY LOOK IDENTICAL FROM HERE.
                      The probe is a `select` on the two columns: a column that does not exist and a
                      PostgREST schema cache that has not reloaded fail it in exactly the same way, and
                      the old message named only the first. 🧪 Dominic has confirmed the columns EXIST,
                      so if this is on screen it is the cache — which is why the reload is named first. */}
                  {!hasTemplateTags && (
                    <div className="ml-7 mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2">
                      <p className="text-[12px] font-bold text-amber-900">These two are switched off right now.</p>
                      <p className="text-[12px] text-amber-800 mt-0.5">
                        Either PostgREST has not reloaded its schema — run{' '}
                        <code className="font-mono">notify pgrst, &apos;reload schema&apos;;</code> — or
                        <code className="font-mono"> 20260915_outreach_template_tags.sql</code> has not been
                        applied. The reload is the likelier of the two and costs nothing to try.
                      </p>
                    </div>
                  )}
                </div>

                {/* ══ 3 · WRITE IT ══════════════════════════════════════════════════════════════════ */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] font-bold grid place-items-center">3</span>
                    <h3 className="text-sm font-bold text-slate-900">Write it</h3>
                  </div>
                  <p className="text-[12px] text-slate-500 mb-2 ml-7">
                    This is what actually gets sent. <code className="font-mono">{'{{double braces}}'}</code> fill
                    themselves in; <code className="font-mono">[[square brackets]]</code> are values you set
                    once in Snippets or are asked for per truck.
                  </p>

                  <div className="ml-7 space-y-3">
                    {/* 🔴 THE SUBJECT IS HIDDEN, NOT CLEARED — and the warning says what saving will do.
                        Switching to WhatsApp used to make a typed subject vanish with no warning, and
                        the ROUTE (not this form) is what discards it: `update_template` sets
                        `subject = null` whenever the patch carries `channel: 'whatsapp'`. So hiding the
                        field alone would be a LIE — the text would still be destroyed on save. The draft
                        keeps it, switching back to Email brings it straight back, and if he saves as
                        WhatsApp he does it having been told. */}
                    {draft.channel === 'whatsapp' && (draft.subject ?? '').trim() !== '' && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2">
                        <p className="text-[12px] font-bold text-amber-900">WhatsApp messages have no subject line.</p>
                        <p className="text-[12px] text-amber-800 mt-0.5">
                          Your subject — “{draft.subject}” — is still here and comes back if you switch to
                          Email. <b>Saving while this is set to WhatsApp will clear it permanently.</b>
                        </p>
                      </div>
                    )}

                    {draft.channel !== 'whatsapp' && (
                      <label className="block"><span className={LABEL}>Subject</span>
                        <input type="text" ref={subjectRef} className={FIELD} value={draft.subject ?? ''}
                          onFocus={() => setLastFocus('subject')}
                          onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} />
                      </label>
                    )}

                    <label className="block">
                      <span className={LABEL}>Message</span>
                      {/* 🔴 15 ROWS = 404px, MEASURED, AND THE 16TH ROW WAS CUT DELIBERATELY. At 16 rows
                          (430px) the Save button's bottom lands at 899px with the admin chrome above it
                          — a ONE-PIXEL margin on a 1440x900 laptop. 15 rows puts it at 873px with real
                          margin, and the box is `resize-y` so it can be dragged taller.
                          🔴 SIZED WITH `rows`, NOT A CLASS: `text-sm` is INERT on a textarea here — the
                          unlayered rule in globals.css forces `font-size: inherit`, so only `rows` can
                          set the height. */}
                      <textarea ref={bodyRef} rows={15} className={`${FIELD} resize-y leading-relaxed font-normal`}
                        value={draft.body ?? ''}
                        onFocus={() => setLastFocus('body')}
                        onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} />
                    </label>
                  </div>
                </div>

                {/* ── 🔴 (S4 / item 6) THE SNIPPET LINE — UNDER THE MESSAGE, AND READ-ONLY ──────────
                    Moved here from the top of the pane. It was the first thing on screen, which put
                    step-3 detail above the template's own name and broke the 1-2-3 reading before it
                    started. It belongs under the message it describes.
                    🔴 STILL NO INPUT. This used to be an editable "Placeholder defaults" row, and that
                    is exactly what made one value four edits: the same `[[my rate]]` had its own box on
                    every template that mentioned it. One place to edit, one place to look — an editable
                    field here would recreate the problem on the screen that replaced it. */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      Values this message fills in
                    </p>
                    <button type="button" onClick={() => setView('snippets')}
                      className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded border border-violet-300 bg-white text-violet-800 hover:bg-violet-50">
                      Edit in Snippets
                    </button>
                  </div>
                  {bodyPlaceholders.length === 0 ? (
                    <p className="text-[12px] text-slate-500">
                      This message has no <code className="font-mono">[[bracketed values]]</code>, so nothing
                      needs setting.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2.5">
                      {bodyPlaceholders.map(name => {
                        const v = snippetValues[name]
                        const has = typeof v === 'string' && v.trim() !== ''
                        const askPer = typeof v === 'string' && v.trim() === ''
                        // 🔴 A LEGACY PER-TEMPLATE VALUE THAT A SNIPPET IS NOW OVERRIDING. It is not
                        // deleted — nothing here writes a template row — so it is named instead. An
                        // override the operator cannot see is the defect this whole screen replaces.
                        const shadowed = has ? (selected.placeholder_defaults?.[name]?.value ?? '') : ''
                        return (
                          <div key={name} className="min-w-[11rem] flex-1">
                            <div className="text-[11px] font-semibold text-slate-700 truncate">{`[[${name}]]`}</div>
                            <div className={`text-sm truncate ${has ? 'text-slate-900' : 'text-slate-400'}`}
                              title={has ? v : undefined}>
                              {has ? v : askPer ? 'you are asked each time' : 'not set — you are asked each time'}
                            </div>
                            {shadowed.trim() !== '' && (
                              <div className="mt-0.5 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1 py-0.5"
                                title={`This template still stores "${shadowed}" for [[${name}]] from the old per-template defaults. The snippet above is what actually gets used. Nothing here has changed the stored value.`}>
                                overrides a stored “{shadowed}”
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

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
        </div>)}
      </div>
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg" style={{ zIndex: 60 }}>{toast}</div>
      )}
    </div>
  )
}
