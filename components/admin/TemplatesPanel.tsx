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
import {
  // 🔴 `channelFor` IS THE DEFINITION OF "CONTACTABLE" AND `effectiveLeadType` THE DEFINITION OF A
  // TRUCK'S TYPE — both reused, neither rewritten. The audience count under the message box has to
  // agree with the grid's own counts and with the list's reachability ticks, and the only way it can is
  // by asking the same two functions. See `audience`.
  nextStep, channelFor, effectiveLeadType, type LeadType, type Step,
} from '@/lib/outreach-step'
// ⚠️ SHARED WITH A CUSTOMER PATH — `components/EventListCard.tsx` (the live call/message button) imports
// this same module. It is READ here and NOTHING ELSE; lib/whatsapp-hint.ts carries no change from this
// task. It is imported for one reason: `nextStep` needs `waPhone` to decide a prospect's channel, and
// OutreachPanel already builds it exactly this way. A second derivation here would be a second answer.
import { phoneWhatsApp } from '@/lib/whatsapp-hint'
import SequenceGrid from '@/components/admin/SequenceGrid'
import { TEMPLATES_VIEW_KEY } from '@/lib/outreach-queue'
import { docFromTemplateText, docPlainText, type DocLine } from '@/lib/outreach-doc'
import {
  ANY_LEAD, STEP_LABELS, slotKey, type SequenceSlot, type SlotTemplate,
} from '@/lib/outreach-sequence'
import { snippetIndex, snippetMapOf, isUnset, type Snippet, type SnippetUse } from '@/lib/outreach-snippets'
import {
  contextFromProspect, renderWithFills, unresolvedIn, defaultFillsOf,
  resolvedTokenReference, conditionReference, suspectedMistypedTokens, malformedTokensIn,
  // 🔴 THE CONDITION MACHINERY, ALL FOUR FROM THE RESOLVER. `conditionHolds` is its own `conditionMet`,
  // `conditionalLinesIn` its own line rule, `misplacedConditionMarkers` the anchored-marker lint. This
  // file carries no regex and no predicate of its own for any of it — see the notes on each export.
  conditionHolds, conditionalLinesIn, misplacedConditionMarkers, conditionNotes, hiddenLineNotes,
  type MessageTemplate, type ConditionRefEntry,
} from '@/lib/outreach-template-render'
import {
  signatureBlockHtml, optOutHtml, parseSignature, parseOptOut, type SignatureLine,
} from '@/lib/outreach-signature'

/** The air under the three panes, ON TOP of whatever padding the shell already has below them. */
const BOTTOM_GUTTER_PX = 4
import { fromDisplay, fromNameLooksLikeAddress } from '@/lib/outreach-doc'
import { OUTREACH_FROM_ADDRESS } from '@/lib/outreach-mail-config'

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

/* 🔴 `RAIL_TABS` WAS HERE AND IS GONE (the two-view layout). The right-hand rail had two tabs,
 * Preview and Tokens, and the Tokens one was a pane full of buttons that inserted text at the
 * cursor — which belongs beside the cursor, not in a pane competing with the preview for width. The
 * right pane is the preview and nothing else; the tokens are the editor toolbar's "Insert token ▾",
 * reading the same `resolvedTokenReference()`. */


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

/* 🔴 `PROBE_ID` WAS HERE AND IS GONE (30 September 2026, the sequence grid). It was a sentinel slug
 * fed to `templateForStep` so the match count could tell a TAG hit from the hardcoded `STEP_TEMPLATE`
 * fallback — a distinction that existed only because two mechanisms chose a template. There is one
 * now: the count asks `chooseTemplate` which box a due prospect resolves to and compares the uuid,
 * so there is no fallback branch to be confused with and nothing to probe. */

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
  /** 🔴 THE SEND-TIME SETTINGS, READ FOR THE PREVIEW. `null` means "not read yet" — see the effect. */
  const [sendSettings, setSendSettings] = useState<{ signatureLines: DocLine[]; optOut: string | null } | null>(null)
  // 🔴 THE EXPLICIT BRANCH TOGGLE. The conditional clause is the one thing you cannot otherwise see
  // before sending, and whether a real prospect has an upcoming event changes day to day. This forces
  // the no-event branch regardless of who is selected.
  const [forceNoEvent, setForceNoEvent] = useState(false)
  const [draft, setDraft] = useState<Partial<Row>>({})
  /* 🔴 `hasTemplateTags` WAS HERE AND IS GONE. It disabled the two tag dropdowns and explained why;
   * those dropdowns were removed when the sequence grid took over choosing a template, so the flag
   * drove nothing. The ROUTE still reports it — it is a capability of the table, not of this screen
   * — and nothing on this screen needs it any more. */
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
  /**
   * 🔴 TWO VIEWS, AND THE TAB REMEMBERS WHICH. "Sequence" is the decision — who gets which words and
   * when — and "Templates" is the writing. They were one column of stacked panels, so reading the
   * grid meant scrolling past the editor and editing meant scrolling past the grid.
   * ⚠️ Snippets and Signature are NOT in the switch. They are global libraries, reached from the
   * Templates view's left pane, and putting four things in a two-way switch would have made the
   * switch a menu.
   */
  const [view, setView] = useState<'sequence' | 'templates' | 'snippets' | 'signature'>('templates')
  useEffect(() => {
    // ⚠️ IN A MICROTASK, AFTER MOUNT. Reading storage during render differs between the server and
    // the client; a bad value reads as 'templates'.
    void Promise.resolve().then(() => {
      try {
        const saved = window.localStorage.getItem(TEMPLATES_VIEW_KEY)
        if (saved === 'sequence' || saved === 'templates') setView(saved)
      } catch { /* storage disabled: the default stands */ }
    })
  }, [])
  const chooseView = (v: 'sequence' | 'templates') => {
    setView(v)
    try { window.localStorage.setItem(TEMPLATES_VIEW_KEY, v) } catch { /* nothing to remember, no crash */ }
  }
  /**
   * A "Used in" chip → the Sequence view, with that box outlined.
   * 🔴 THE CHIP IS A LABEL AND THE GRID WANTS A KEY, so this turns one back into the other through
   * the SAME `slotKey` the grid indexes by — it looks the box up in the slots rather than parsing
   * the words back, because the words are Dominic's own names for the truck types and are not a key.
   */
  const openBox = (chipLabel: string) => {
    const hit = slots.find(sl => usedIn(sl.template_id).includes(chipLabel) && sl.template_id === selId)
    if (hit) setHighlightBox(slotKey(hit.channel, hit.step, hit.lead_type))
    chooseView('sequence')
  }

  /**
   * 🔴 THE PANES' HEIGHT IS MEASURED, NOT GUESSED, AND THE GUESS IS WHY THE PAGE SCROLLED.
   * It was `calc(100vh - 12rem)`: 192px of assumed chrome above this element. The real chrome in the
   * admin shell is the header, the tab strip, the shell's padding, the view switcher and — until
   * this build — a second tab row, which came to MORE than 192px. So the panes were taller than the
   * space left for them, the document grew past the window, and the whole page scrolled, taking the
   * left list with it. The fixture measured in the last report did not reproduce it because a
   * fixture has no admin shell above it: 12rem happened to be right there.
   * ⚠️ IT IS READ FROM THE ELEMENT'S OWN TOP EDGE, so it cannot go stale when anything above it
   * changes height — the unsaved-changes bar appearing, the switcher wrapping on a narrow window.
   * `BOTTOM_GUTTER` keeps the panes off the very edge of the glass.
   */
  const panesRef = useRef<HTMLDivElement | null>(null)
  const [panesHeight, setPanesHeight] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (view !== 'templates') return
    let frame = 0
    const measure = () => {
      frame = 0
      const el = panesRef.current
      if (!el) return
      const top = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))
      /* 🔴 AND WHAT IS BELOW IS MEASURED TOO. The admin shell wraps this tab in `pb-6`, which sits
       * UNDER the panes: taking only the top left the document 24px taller than the window, and a
       * document one pixel taller than the window is a page that scrolls. Reading the container's
       * own computed padding means this survives that padding changing. */
      const pad = Math.round(parseFloat(
        window.getComputedStyle(el.parentElement ?? el).paddingBottom || '0') || 0)
      setPanesHeight(`calc(100vh - ${top + pad + BOTTOM_GUTTER_PX}px)`)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    schedule()
    window.addEventListener('resize', schedule)
    // ⚠️ THE BAR ABOVE CAN APPEAR AND DISAPPEAR, which moves this element without a resize event.
    const ro = new ResizeObserver(schedule)
    if (panesRef.current?.parentElement) ro.observe(panesRef.current.parentElement)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      ro.disconnect()
    }
  }, [view])

  /** A box the Sequence view should outline, set by a "Used in" chip. */
  const [highlightBox, setHighlightBox] = useState<string | null>(null)
  /** The left pane's search, and the channel a "+ Write a new one" arrived with. */
  const [listSearch, setListSearch] = useState('')
  const [retiredOpen, setRetiredOpen] = useState(false)

  /**
   * The list, sorted and searched.
   * 🔴 THE SAME COMPARATOR `move` USES — `sort_order` then `slug`. Sorting on `sort_order` alone
   * left ties to `Array.sort`'s stability, which is the order the API happened to return, so the
   * list and the reorder arrows could disagree about which row sits where.
   * ⚠️ THE SEARCH READS THE NAME AND THE SLUG, because half of these are known by their slug.
   */
  const listRows = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    return [...rows]
      .filter(r => !q || r.label.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))
      .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
  }, [rows, listSearch])


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


  // ── 🔴 WHERE EVERY TRUCK STANDS, DERIVED FROM THE REAL FUNCTION ─────────────────────────────────
  // `steps` below asks `nextStep` — the same call the outreach list makes — which rung each prospect
  // is on. It is what the Sequence view's "n due" pills count, and it is the reason a pill cannot
  // disagree with the list: there is no second copy of the rule here to drift.
  //
  // ⚠️ COST. It is keyed on `prospects` ALONE, so it is computed once per load — typing in the editor
  // recomputes nothing. ⚠️ IT USED TO FEED A SECOND READER, the "sends this to N trucks" line in the
  // editor, which walked all 231 prospects per render; v2 item 5 replaced that line with the chips.
  /** The grid, and the two things the tab derives from it. */
  const [slots, setSlots] = useState<SequenceSlot[]>([])
  const [hasSequence, setHasSequence] = useState(false)
  const [leadLabels, setLeadLabels] = useState<Record<string, string> | null>(null)
  const [gridBusy, setGridBusy] = useState(false)

  /**
   * 🔴 "USED IN", DERIVED FROM THE GRID AND NOT FROM THE ROW'S OWN TAGS. A chip here means this
   * template is in that box and will be sent from it; the tags say only what somebody once wrote on
   * the row. ⚠️ The DEFAULT column says "All trucks" rather than naming four types, because that is
   * what the box means.
   */
  /* ⚠️ PLAIN FUNCTIONS AND PLAIN DERIVATIONS FROM HERE DOWN, NOT `useMemo`/`useCallback`.
   * The React Compiler declines to preserve memoisation that closes over `slots` — it cannot prove
   * the array is not mutated later — and a `useMemo` it has skipped is a lie about stability that
   * reads as an optimisation. What these actually cost: `usedIn` walks ~5 slots and `slotTemplates`
   * maps ~10 rows, per render of this editor. That is microseconds, and a price worth paying to
   * keep every hook in this file honest.
   * 🔴 THE ONE EXPENSIVE DERIVATION HERE WAS `match`, which walked 231 prospects; v2 item 5 deleted
   * both it and the sentence it fed, so the question does not arise any more. */
  const usedIn = (templateUuid: string): string[] => {
    const out: string[] = []
    for (const s of slots) {
      if (s.template_id !== templateUuid) continue
      const where = s.lead_type === ANY_LEAD
        ? 'All trucks'
        : (leadLabels?.[s.lead_type] ?? LEAD_TYPE_PLAIN[s.lead_type as keyof typeof LEAD_TYPE_PLAIN] ?? s.lead_type)
      out.push(`${s.channel === 'email' ? '' : 'WhatsApp · '}${STEP_LABELS[s.step as keyof typeof STEP_LABELS] ?? s.step} · ${where}`)
    }
    return out.sort()
  }

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
      setSlots((data.slots || []) as SequenceSlot[])
      setHasSequence(!!data.hasSequence)
      setLeadLabels((data.leadTypeLabels ?? null) as Record<string, string> | null)
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
    } catch (e: any) { setLoadError({ message: e?.message || 'Could not load templates', needsMigration: false }) }
    setLoading(false)
  }, [])

  /**
   * Every grid write, through one function. 🔴 IT RE-READS RATHER THAN PATCHING STATE: a box is one
   * row in one table and the answer to "what is in it now" is the server's, not a merge of what this
   * tab believed a moment ago.
   */
  const postGrid = useCallback(async (body: Record<string, unknown>) => {
    const h = await nativeAuthHeader()
    const res = await fetch('/api/admin/outreach-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
      credentials: 'same-origin', body: JSON.stringify(body),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j?.error) { setToast(String(j?.error ?? 'That did not save.')); setTimeout(() => setToast(null), 2500); return }
    await load()
  }, [load])


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

  /* ── 🔴 THE SIGNATURE AND THE OPT-OUT LINE, FOR THE PREVIEW ONLY ───────────────────────────────
   * The preview showed `{{signature}}` and `{{opt_out}}` as those literal characters, because
   * `renderWithFills` returns both tokens VERBATIM by design — they are deferred, not unresolved
   * (see lib/outreach-template-render.ts). The compose window then expands them the moment the
   * template is chosen, with `docFromTemplateText`. So the preview was showing a message nobody
   * ever sends, and hiding the two lines most worth reading before sending: the sign-off and the
   * PECR opt-out sentence.
   * ⚠️ THE SAME ROUTE AND THE SAME PARSERS THE COMPOSE WINDOW USES — read-only, and it writes
   * nothing. `null` until it answers, so a slow settings read shows the body without a half-built
   * signature rather than an empty one. */
  useEffect(() => {
    let live = true
    void (async () => {
      const r = await fetch('/api/admin/outreach/settings').catch(() => null)
      if (!r || !live) return
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (!live || j.ok !== true) return
      const sig = parseSignature(j.signature)
      const oo = parseOptOut(j.optOut)
      setSendSettings({
        signatureLines: (sig?.lines ?? []).map(l => ({ text: l.text, bold: l.bold })),
        optOut: oo?.text ?? null,
      })
    })()
    return () => { live = false }
  }, [])

  useEffect(() => { void load(); void loadProspects() }, [load, loadProspects])

  const selected = useMemo(() => rows.find(r => r.id === selId) ?? null, [rows, selId])

  /**
   * 🔴 THE MATCH COUNT, FROM THE GRID INSTEAD OF FROM THE TAGS. It used to probe `templateForStep`
   * with the two dropdowns' values — the mechanism that has been replaced — and would now count a
   * rule nothing applies. What it answers is the same question: how many contactable trucks are due
   * at a box this template sits in. Zero is not an error and says so.
   * ⚠️ IT WALKS THE PROSPECT LIST ONCE PER SELECTION, not per keystroke: `steps` is memoised on the
   * prospects alone and this is keyed on the selected row and the grid.
   */
  /* ⚠️ THE TWO CHEAP DERIVATIONS ARE THEIR OWN MEMOS. The count below walks the prospect list, and
   * building the template list and the slot index inside it made one memo the React Compiler
   * declined to preserve — which is a `useMemo` that does not memoise, on the one derivation here
   * that is actually expensive. Split, it keeps its memo. */
  /* ⚠️ ONE LIST OF TEMPLATES FOR THE GRID, BUILT HERE. The Sequence view used to map `rows` into
   * this shape inline in the JSX, which was a second copy of the same four fields; `match` built
   * the first. `match` is gone, so the copy that survives is the one the grid is handed. */
  const slotTemplates: SlotTemplate[] = rows.map(r => ({ uuid: r.id ?? '', slug: r.slug, label: r.label, channel: r.channel, active: r.active }))
  const selectedId = selected?.id ?? null
  /* 🔴 THE EDITOR AND THE LIST ASK THE SAME FUNCTION THE SAME QUESTION, with the same id. They did
   * not: the editor passed `draft.id`, which the draft never carries. One name, used by both. */
  const usedInChips = selectedId ? usedIn(selectedId) : []
  /* ── 🔴 THE MATCH COUNT IS GONE, NOT COMMENTED OUT (v2 item 5) ─────────────────────────────────
   * It walked every prospect to write "The sequence sends this to N trucks", one of the three
   * prose lines the chips replace. Left in place it would have walked 231 prospects on every
   * keystroke in the editor to compute a number nothing renders — dead work that lint sees as an
   * unused variable and a reader sees as a feature that is still here. The count it produced is
   * the Sequence view's job now: a chip opens the box, and the box carries its own due pill. */

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
  /**
   * ⚠️ THE CHANNEL IS A PARAMETER NOW, because "+ Write a new one for this box" arrives from a grid
   * cell that already knows which channel it is. It still creates nothing until the name is given —
   * the prompt is the same one — and the row it then creates is the same row.
   */
  const createTemplate = async (channel: 'email' | 'whatsapp' = 'email') => {
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
    const out = await post({ action: 'create_template', slug, label: name, channel, body: 'Hi,\n\n' })
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
    /* 🔴 THE PREVIEW IS THE WHOLE MESSAGE, AND FOR AN EMAIL THAT INCLUDES THE SIGNATURE AND THE
     * OPT-OUT LINE. `renderWithFills` leaves `{{signature}}` and `{{opt_out}}` standing — they are
     * filled from `outreach_settings`, not from the prospect — so a preview that stopped there
     * printed two tokens where the two most-read lines of the email go.
     * ⚠️ IT IS THE COMPOSE WINDOW'S OWN CALL, NOT A SECOND EXPANSION. `docFromTemplateText` is what
     * builds the document the operator edits and the server converts; `docPlainText` is how the
     * guards read that document back. A preview drawn by a second implementation would agree on
     * the day it was written and drift afterwards — and be believed while it drifted.
     * ⚠️ EMAIL ONLY, and only once the settings have arrived: WhatsApp has no document and no
     * signature, and a null `sendSettings` means the read has not answered yet. Both fall back to
     * the body as rendered, which is what this pane showed before. */
    const full = tpl.channel === 'email' && sendSettings
      ? docPlainText(docFromTemplateText(m.body, sendSettings))
      : m.body
    return { ...m, full, isEmail: tpl.channel === 'email', expanded: tpl.channel === 'email' && !!sendSettings }
  }, [selected, draft, previewProspect, forceNoEvent, sendSettings])

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
  /* 🔴 `condNames` AND `condPairs` ARE GONE FROM HERE. The pair rule — a condition with a `no_`
   * counterpart in the switch — moved into `conditionNotes`, which is the only thing that still needed
   * it once the Insert-condition menu stopped offering pairs and started offering every condition. Two
   * copies of "which conditions have a negative half" is exactly the drift this module keeps warning
   * about, and the panel's copy was the one with no test able to reach it. */
  /* 🔴 `condSingles` WAS HERE AND IS GONE. It listed the conditions with no negative half, for a
   * row of buttons in the Tokens rail. The rail went; a single-sided condition is still insertable
   * by hand and `halfPairs` below still calls out a half-written one, which is the failure that
   * actually matters. */

  /* ── 🔴 `halfPairs` IS GONE, AND THAT IS THE WHOLE POINT OF THIS CHANGE ─────────────────────────
   * It derived every condition written on one side only and painted it RED: "Half of a conditional
   * pair: ?next_event: without ?no_next_event:". The reasoning was that a branch which never fires
   * fails silently, which is true — and the conclusion drawn from it was wrong, because a one-sided
   * condition is USUALLY DELIBERATE. "Hatches Up - map only" mentions the truck's next pitch when
   * there is one and says nothing when there is not; that is the copy as written, not a half-finished
   * pair. The warning accused the operator of a mistake on every single view of a correct template,
   * and a red box that is usually wrong is worse than no box at all: it teaches the eye to skip red,
   * and the next red thing on this screen is `{{truck name}}` reaching a real food business.
   * 🔴 WHAT REPLACED IT IS NOT A SOFTER VERSION OF THE SAME CLAIM. It makes no claim at all: it states
   * who sees the line and how many that is today. The operator can read that and decide. Red is kept
   * for the three things that are broken however the copy was intended — see `unknownConds`,
   * `misplaced`, and the malformed/must-resolve guards that were already here. */

  // ── 🔴 WHO THIS TEMPLATE ACTUALLY GOES TO ────────────────────────────────────────────────────────
  //
  // "Trucks this template goes to" = the CONTACTABLE prospects in the sequence boxes this template
  // fills. Both halves of that are existing definitions and both are reused rather than restated:
  //
  //   • CONTACTABLE is `channelFor`. 🧪 It is the predicate behind the operator's own 76/155 split and
  //     it gates the work queue; OutreachPanel calls it for the list's reachability ticks. A truck we
  //     hold no address and no usable WhatsApp number for is not in anybody's audience.
  //     ⚠️ `channelFor`, NOT `step.channel` — the same trap OutreachPanel documents: `nextStep` returns
  //     `channel: null` for every STOPPED step, so reading the step would file a reachable truck under
  //     "cannot be reached" and undercount the audience by exactly the do-not-contact rows.
  //   • A TRUCK'S TYPE is `effectiveLeadType` — the grid's own call, frozen-value-first, so a truck
  //     mid-sequence is counted under the type its sequence started in rather than today's derivation.
  //
  // A box is (channel, step, lead type). A truck is in it when the channel we would reach it on is the
  // box's channel and the box's row is either its type or the "All trucks" default.
  // ⚠️ STEP IS DELIBERATELY NOT PART OF THIS, and it is the one place this differs from the grid's
  // pills. The grid answers "who is waiting at this box NOW", which is a work queue and changes every
  // morning. The note under a message box answers "who will ever read this sentence", which is an
  // AUDIENCE: a truck on rung 1 today reaches rung 3 next week and reads the chase then. Counting only
  // today's due rows would print a number that shrinks as the work gets done, under copy that did not
  // change — and the operator would reasonably read that as the line reaching fewer trucks.
  // ⚠️ COST: keyed on the prospects, the grid and the SELECTED ROW — never on the body. Typing in the
  // message box recomputes nothing here. This is the derivation v2 deleted for walking 231 prospects on
  // every keystroke, brought back on a key that cannot do that.
  /** 🔴 THE EXPENSIVE HALF, AND THE ONLY PART THAT IS MEMOISED: one `contextFromProspect` and one
   *  `channelFor` per prospect, keyed on the prospect list ALONE so it survives every keystroke and
   *  every change to the grid. ⚠️ It closes over nothing else on purpose — see the note below. */
  const reachable = useMemo(
    () => prospects
      .map(p => ({
        p,
        // 🔴 THE PREVIEW'S OWN CONTEXT BUILDER, so the count and the rendered preview cannot disagree
        // about a truck. It is also where `effectiveLeadType` reaches the `?lead_*` conditions.
        ctx: contextFromProspect(p),
        // ⚠️ `waPhone` BUILT EXACTLY AS `steps` BUILDS IT, from the shared `phoneWhatsApp`.
        ch: channelFor({ ...p, waPhone: phoneWhatsApp(p.phone ?? null, null).waPhone }),
      }))
      .filter(x => x.ch !== null),
    [prospects])

  /* ⚠️ PLAIN DERIVATIONS FROM HERE TO THE NOTES, NOT `useMemo` — FOR THE REASON THIS FILE ALREADY
   * DOCUMENTS ABOVE `usedIn`. Anything keyed on `slots` is memoisation the React Compiler declines to
   * preserve, because it cannot prove the array is not mutated later; it says so as a build error, and a
   * `useMemo` it has skipped is a lie about stability that reads as an optimisation. The first attempt
   * here WAS a `useMemo` on `[prospects, slots, selectedId]` and it produced exactly that error.
   * 🔴 SO THE EXPENSIVE WORK WAS MOVED OUT OF THE SLOTS-DEPENDENT PART rather than the error silenced.
   * `reachable` above holds the 231 context builds and is memoised properly. What is left below is a
   * filter over ~5 boxes and a switch per condition per contactable truck — 🧪 ~76 contactable rows and
   * one or two conditions on a real template, so a few hundred `conditionHolds` calls per render of the
   * editor. That is microseconds, and it is the same price `usedIn` and `slotTemplates` already pay.
   * ⚠️ IT IS NOT THE DERIVATION v2 DELETED. That one called `chooseTemplate` for all 231 prospects to
   * produce a number nothing rendered any more. This counts only contactable rows, only for conditions
   * actually written in the body, and every number it produces is on screen. */
  const audienceBoxes = selectedId ? slots.filter(s => s.template_id === selectedId) : []
  // ── 🔴 WHO THIS TEMPLATE ACTUALLY GOES TO ────────────────────────────────────────────────────────
  //
  // "Trucks this template goes to" = the CONTACTABLE prospects in the sequence boxes this template
  // fills. Both halves of that are existing definitions and both are reused rather than restated:
  //
  //   • CONTACTABLE is `channelFor`. 🧪 It is the predicate behind the operator's own 76/155 split and
  //     it gates the work queue; OutreachPanel calls it for the list's reachability ticks. A truck we
  //     hold no address and no usable WhatsApp number for is not in anybody's audience.
  //     ⚠️ `channelFor`, NOT `step.channel` — the same trap OutreachPanel documents: `nextStep` returns
  //     `channel: null` for every STOPPED step, so reading the step would file a reachable truck under
  //     "cannot be reached" and undercount the audience by exactly the do-not-contact rows.
  //   • A TRUCK'S TYPE is `effectiveLeadType` — the grid's own call, frozen-value-first, so a truck
  //     mid-sequence is counted under the type its sequence started in rather than today's derivation.
  //
  // A box is (channel, step, lead type). A truck is in it when the channel we would reach it on is the
  // box's channel and the box's row is either its type or the "All trucks" default.
  // ⚠️ STEP IS DELIBERATELY NOT PART OF THIS, and it is the one place this differs from the grid's
  // pills. The grid answers "who is waiting at this box NOW", which is a work queue and changes every
  // morning. The note under a message box answers "who will ever read this sentence", which is an
  // AUDIENCE: a truck on rung 1 today reaches rung 3 next week and reads the chase then. Counting only
  // today's due rows would print a number that shrinks as the work gets done, under copy that did not
  // change — and the operator would reasonably read that as the line reaching fewer trucks.
  // 🔴 A TEMPLATE IN NO BOX COUNTS ACROSS EVERY CONTACTABLE TRUCK, AND THE NOTE SAYS SO. It is pickable
  // by hand in the composer for any of them, so "every contactable truck" is the honest denominator —
  // but printed without that clause it would read as a sequence audience the template does not have.
  const audienceRows = audienceBoxes.length === 0
    ? reachable
    : reachable.filter(x => audienceBoxes.some(b =>
      b.channel === x.ch && (b.lead_type === ANY_LEAD || b.lead_type === effectiveLeadType(x.p))))
  const audience = {
    rows: audienceRows,
    inNoBox: audienceBoxes.length === 0,
    /** 🔴 FALSE UNTIL THE PROSPECT LIST HAS ARRIVED. The fetch is allowed to fail silently, and
     *  "0 of 0 trucks" is a wrong answer stated confidently — the notes omit the count instead. */
    loaded: prospects.length > 0,
  }

  /** The conditional lines as the RENDERER reads them — its own line rule, not a second one. */
  const condLines = useMemo(() => conditionalLinesIn(draft.body ?? ''), [draft.body])

  /** 🔴 RED #1: A CONDITION NAME THE RESOLVER HAS NO BRANCH FOR. `conditionMet` returns false for it, so
   *  the line is dropped for EVERY truck, every time, with nothing on screen to say so. A typo here is
   *  not a style choice — it is a sentence that can never render. */
  const unknownConds = useMemo(
    () => [...new Set(condLines.filter(l => !l.known).map(l => l.cond))], [condLines])

  /** 🔴 RED #2: A MARKER THAT IS NOT AT THE START OF ITS LINE — the characters reach the prospect. */
  const misplaced = useMemo(() => misplacedConditionMarkers(draft.body ?? ''), [draft.body])

  /** 🔴 HOW MANY OF THAT AUDIENCE EACH WRITTEN CONDITION KEEPS. `conditionHolds` is the resolver's own
   *  `conditionMet`, so the number under the box is produced by the function that decides it at send
   *  time. ⚠️ Only the conditions actually written in the body are counted — 🧪 one or two on a real
   *  template, so this is a few hundred switch evaluations per render, not 231 template resolutions. */
  const keeping: Record<string, number> = {}
  for (const l of condLines) {
    if (!l.known || l.cond in keeping) continue
    let n = 0
    for (const x of audience.rows) if (conditionHolds(l.cond, x.ctx)) n += 1
    keeping[l.cond] = n
  }

  /* 🔴 THE SENTENCES THEMSELVES COME FROM THE RESOLVER MODULE, beside the conditions they describe and
   * beside `CONDITION_PLAIN`. This component renders them and composes none of them — the same rule it
   * already follows for substitution, applied to the text that explains substitution. It is also what
   * lets the harness assert the wording by CALLING it rather than by grepping this file for markup. */
  const condNotes = conditionNotes(draft.body ?? '', {
    total: audience.loaded ? audience.rows.length : null,
    inNoBox: audience.inNoBox,
    keeping,
  })
  const droppedNotes = hiddenLineNotes(draft.body ?? '', preview?.droppedConditions ?? [])

  if (denied) return <div className="text-slate-900 p-6"><p className="text-sm text-slate-500">/api/admin/outreach-templates refused this session.</p></div>

  return (
    <div className="text-slate-900">
      <div className="max-w-[1800px] mx-auto">
        {/* ── 🔴 TWO VIEWS, AND ONE LINE SAYING WHAT EACH IS FOR ───────────────────────────────
            The tab stacked the grid, two standing panels and a three-pane editor in one column, so
            every question meant scrolling past the answer to a different one. These are the two
            things this tab is: deciding who gets which words, and writing them. */}
        {/* ⚠️ `mb-2`, AND THE SHELL'S TOP PADDING IS `pt-3` FOR THIS TAB — together with the tab row
            above, that was about 80px of nothing between the admin header and the first control. */}
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
            {([['sequence', 'Sequence'], ['templates', 'Templates']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => chooseView(v)} aria-pressed={view === v}
                className={`text-sm font-semibold px-3 py-1.5 ${view === v
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-slate-500">
            {view === 'sequence'
              ? 'Which template each kind of truck gets, at each step of the sequence.'
              : 'The words themselves — write them here and the sequence decides who gets them.'}
          </p>
          {loading && <span className="text-[12px] text-slate-400">Loading…</span>}
        </div>

        {/* ── 🔴 THE SEQUENCE IS ITS OWN VIEW NOW ──────────────────────────────────────────────
            It answers "what does an HU-map truck get for chase 2" — which is the only question this
            tab exists for — and it answers it without the editor underneath it. */}
        {view === 'sequence' && (
          <SequenceGrid
            templates={slotTemplates}
            slots={slots}
            leadLabels={leadLabels}
            prospects={prospects}
            steps={steps}
            hasSequence={hasSequence}
            busy={gridBusy}
            onSetSlot={async (channel, step, leadType, templateId) => {
              setGridBusy(true)
              try { await postGrid({ action: 'set_slot', channel, step, lead_type: leadType, template_id: templateId }) }
              finally { setGridBusy(false) }
            }}
            onClearSlot={async (channel, step, leadType) => {
              setGridBusy(true)
              try { await postGrid({ action: 'clear_slot', channel, step, lead_type: leadType }) }
              finally { setGridBusy(false) }
            }}
            onRename={async (leadType, label) => {
              setGridBusy(true)
              try { await postGrid({ action: 'rename_lead_type', lead_type: leadType, label }) }
              finally { setGridBusy(false) }
            }}
            onOpenProspect={id => { window.location.href = `/admin/outreach/p/${id}` }}
            highlight={highlightBox}
            onOpenTemplate={uuid => { setHighlightBox(null); requestSelect(uuid); chooseView('templates') }}
            onNewTemplate={channel => { chooseView('templates'); void createTemplate(channel) }}
          />
        )}

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

        {/* 🔴 THE SECOND TAB ROW WAS HERE AND IS GONE. Under the Sequence|Templates switcher sat a
            row reading "Templates | Snippets (2) | Signature" — so the word Templates appeared twice,
            two rows apart, meaning two different things. The switcher is the only view control now;
            Snippets and Signature are the two links at the bottom of the left pane, which already
            carried them, and the Snippets count went with the link. */}
        {view === 'snippets' && snippetNote && (
          <p className="text-xs text-slate-600 mb-2">{snippetNote}</p>
        )}

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

        {view === 'signature' ? <SignaturePanel /> : view === 'snippets' ? <SnippetsLibrary
          uses={snippetUses} snippets={snippets} draft={snippetDraft} setDraft={setSnippetDraft}
          onSave={saveSnippet} enabled={hasSnippets} /> : view === 'sequence' ? null : (
        /* ── 🔴 THREE PANES, EACH SCROLLING ON ITS OWN ─────────────────────────────────────────
           The page used to scroll as one, so reading the preview scrolled the list and the editor
           away — and with a tall message box the list ran out long before the editor did. Each pane
           now owns its own scrollbar and the page itself does not move.
           ⚠️ `height: calc(100vh - 12rem)` IS AN INLINE STYLE, and deliberately: an arbitrary
           Tailwind height used by one file may have no generated rule, which is this codebase's
           recorded failure (the compose window painting behind its own modal). 12rem is the admin
           chrome above it — the tab strip, the view switch and the page padding.
           ⚠️ IT SETS NO `overflow` ON `body`. The v4-fixes bug was a scroll lock left on the whole
           page by a composer that had stopped being a modal; nothing here touches the document. */
        <div ref={panesRef} className="grid gap-4 max-md:grid-cols-1 max-md:h-auto"
          style={{ gridTemplateColumns: '270px minmax(0, 1fr) minmax(0, 30%)', height: panesHeight }}>

          {/* ── LEFT: THE LIBRARY ────────────────────────────────────────────────────────────────
              🔴 GROUPED BY CHANNEL AND LABELLED BY WHERE EACH ONE IS USED. It was one flat list of
              names with an `em`/`wa` chip, which answered neither "which of these go by email" nor
              the question this tab exists for — "is this one actually in the sequence". Retired rows
              were in the same list, struck through, taking a line each.
              ⚠️ THE REORDER ARROWS AND RETIRE STAY, on the row, on hover — `sort_order` is what the
              compose picker orders by and retiring is how a template leaves it without being
              deleted. Nothing was dropped. */}
          <div className="rounded-xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
            <div className="p-2 flex flex-col gap-2 border-b border-slate-100">
              {/* 🔴 DARK, NOT ORANGE. Orange on these screens means one thing — something is about
                  to leave the building — and that belongs to Send and the Next banner. Creating a
                  template and saving one send nothing. */}
              <button onClick={() => void createTemplate()}
                className="text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400">
                + New template
              </button>
              <input type="search" value={listSearch} onChange={e => setListSearch(e.target.value)}
                placeholder="Search templates…"
                className="text-sm border border-slate-200 rounded-lg px-2 py-1" />
            </div>

            {/* ⚠️ THIS PANE SCROLLS, NOT THE PAGE. */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {(['email', 'whatsapp'] as const).map(ch => {
                const group = listRows.filter(r => r.active && r.channel === ch)
                if (group.length === 0) return null
                return (
                  <div key={ch}>
                    <p className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      {ch === 'email' ? 'Email' : 'WhatsApp'}
                    </p>
                    {group.map((r, i, arr) => (
                      <ListRow key={r.id} r={r} i={i} arr={arr} selId={selId}
                        usedIn={usedIn(r.id ?? '')} onSelect={requestSelect} onMove={move} onToggle={toggleActive} />
                    ))}
                  </div>
                )
              })}
              {/* 🔴 RETIRED ROWS ARE COLLAPSED, NOT STRUCK THROUGH IN THE MIDDLE OF THE LIST. They are
                  kept for the history that references them and are otherwise not what anybody is
                  looking for. */}
              {listRows.some(r => !r.active) && (
                <div className="border-t border-slate-100 mt-1">
                  <button type="button" onClick={() => setRetiredOpen(v => !v)}
                    className="w-full text-left px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-slate-600">
                    {retiredOpen ? '▾' : '▸'} Retired ({listRows.filter(r => !r.active).length})
                  </button>
                  {retiredOpen && listRows.filter(r => !r.active).map((r, i, arr) => (
                    <ListRow key={r.id} r={r} i={i} arr={arr} selId={selId}
                      usedIn={usedIn(r.id ?? '')} onSelect={requestSelect} onMove={move} onToggle={toggleActive} />
                  ))}
                </div>
              )}
            </div>

            {/* ⚠️ THE TWO GLOBAL LIBRARIES, AT THE BOTTOM. They are not templates and never were, so
                they are links out of this view rather than a third and fourth item in a two-way
                switch. Their screens are exactly the ones that already existed. */}
            <div className="border-t border-slate-100 p-2 flex items-center gap-3">
              <button type="button" onClick={() => setView('snippets')}
                className="text-[12px] font-semibold text-slate-600 hover:underline">
                Snippets{snippetUses.length ? ` (${snippetUses.length})` : ''}
              </button>
              <button type="button" onClick={() => setView('signature')}
                className="text-[12px] font-semibold text-slate-600 hover:underline">Signature</button>
            </div>
          </div>

          {/* ── EDITOR ───────────────────────────────────────────────────────────────────────────── */}
          {/* ⚠️ `min-h-0` ON THE PANE ITSELF, or a flex child with its own scroller grows the grid row
              instead of scrolling — the default `min-height: auto` on a grid item is the classic
              reason a "scrolling pane" silently becomes a taller page. */}
          <div className="min-w-0 min-h-0">
            {!selected && !loading && rows.length > 0 && (
              <p className="text-sm text-slate-500">Pick a template on the left.</p>
            )}
            {selected && (
              // ⚠️ THE EDITOR IS A COLUMN THAT FILLS THE PANE: the message grows into the space that
              // is left and Save sits under it, on screen, without the pane scrolling to reach it.
              /* ── 🔴 THE OVERLAP, AND WHY IT IS A ONE-LEVEL FLEX COLUMN NOW ──────────────────
               * REPORTED: the "Values this message fills in" box and the conditional warning were
               * drawn ACROSS the bottom of the message box.
               * WHY: a flex item's default `flex-shrink: 1`. When the column ran out of room every
               * block was squeezed — and a squeezed block does not squeeze what is inside it. The
               * `rows={15}` textarea kept its 404px, spilled out of the wrapper that had been
               * shrunk around it, and the blocks below — later siblings, so painted on top —
               * landed over it. Nothing was absolutely positioned; it was flex-shrink all along.
               * 🔴 AND IT COULD NOT BE FIXED BLOCK BY BLOCK, because it was NESTED. The write
               * section was two wrappers deep, each `flex-1 min-h-0`, and any ancestor that may
               * shrink below its content will absorb the shortfall and let the content spill.
               * `shrink-0` on the leaves does nothing while an ancestor is still shrinking. So the
               * two wrappers are gone: the editor is ONE flex column, every block in it refuses to
               * shrink, and the MESSAGE is the single item that gives — down to a floor, after
               * which the column overflows and the scroller does its job.
               * 🔴 SAVE IS OUTSIDE THE SCROLLER. It used to be the last item inside it, pushed down
               * by `mt-auto`, so the moment the editor did scroll the button scrolled away with it.
               * Pinned here it is on screen at every height, which is what item 4 asked for. */
              <div className="rounded-xl border border-slate-200 bg-white p-4 h-full min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 flex flex-col">
                {/* 🔴 THE NUMBERED HEADINGS ARE GONE — "1 Name it", "3 Write it", AND NO 2. There were
                    three of them when the middle one explained a section of controls; that section
                    went when the sequence grid took over deciding where a template is used, and what
                    was left was a numbered list that skipped a number. Three labelled fields need no
                    steps and no paragraphs above them: "Template name", "Subject", "Message". */}
                <div className="shrink-0">
                  <div className="flex items-end gap-3">
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

                {/* ── 🔴 "WHEN TO USE IT" IS GONE FROM THE EDITOR ─────────────────────────────────
                    It was a headed section carrying a channel picker, two READ-ONLY tag fields and a
                    match count — a block about WHERE this template is used, on the screen for WRITING
                    it. The sequence view decides where; this one says so in a line of chips and gets
                    out of the way. The channel moved up beside the name, because it is part of what
                    the template IS.
                    ⚠️ NOTHING WAS DROPPED: the chips are the same `usedIn` derivation, the match
                    count moved under them in a sentence, and the tag columns are still shown — read
                    only, greyed, where they belong, under the chips. */}
                {/* ── 🔴 "Used in" IS A ROW OF CHIPS, AND ONLY WHEN THERE ARE ANY ────────────────
                    🔴 AND IT WAS READING THE WRONG ID, ALWAYS. It asked `usedIn(draft.id ?? '')`, and
                    `draft` is seeded with the EDITABLE fields only — label, channel, subject, body,
                    sort_order, active and the two tags — deliberately, because the id is not one of
                    them. So the argument was `''` for every template ever selected, no slot matched,
                    and the editor said "Not in the sequence" about rows the left list correctly
                    showed as used. The LIST was right; this was wrong, for every row. It reads
                    `selectedId` now — the same uuid the list passes into the same function.
                    ⚠️ AND IT SAYS NOTHING WHEN THERE IS NOTHING TO SAY. "Not in the sequence — pick
                    it by hand", the match-count sentence and the older-tags line were three lines of
                    prose above the field somebody came here to type in; the left list already says
                    "Not in sequence" beside the name. */}
                {usedInChips.length > 0 && (
                  <div className="shrink-0 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <span className={LABEL}>Used in</span>
                    {usedInChips.map((u: string) => (
                      // 🔴 A CHIP IS A LINK. Clicking one opens the Sequence view with that box
                      // outlined — the two views are two halves of one decision.
                      <button key={u} type="button" onClick={() => openBox(u)}
                        title="Show this box in the sequence"
                        className="text-[11px] font-semibold px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100">
                        {u} ↗
                      </button>
                    ))}
                  </div>
                )}

                {/* ⚠️ THE ONE SENTENCE WORTH KEEPING FROM "Write it" MOVED UNDER THE MESSAGE LABEL,
                    where the two kinds of bracket are actually typed. */}
                {/* ⚠️ THE DIVIDER IS ITS OWN LINE, not a wrapper's border, because the wrapper it
                    belonged to was one of the two that had to go. */}
                <div className="shrink-0 border-t border-slate-100" />
                    {/* 🔴 THE SUBJECT IS HIDDEN, NOT CLEARED — and the warning says what saving will do.
                        Switching to WhatsApp used to make a typed subject vanish with no warning, and
                        the ROUTE (not this form) is what discards it: `update_template` sets
                        `subject = null` whenever the patch carries `channel: 'whatsapp'`. So hiding the
                        field alone would be a LIE — the text would still be destroyed on save. The draft
                        keeps it, switching back to Email brings it straight back, and if he saves as
                        WhatsApp he does it having been told. */}
                    {draft.channel === 'whatsapp' && (draft.subject ?? '').trim() !== '' && (
                      <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2">
                        <p className="text-[12px] font-bold text-amber-900">WhatsApp messages have no subject line.</p>
                        <p className="text-[12px] text-amber-800 mt-0.5">
                          Your subject — “{draft.subject}” — is still here and comes back if you switch to
                          Email. <b>Saving while this is set to WhatsApp will clear it permanently.</b>
                        </p>
                      </div>
                    )}

                    {draft.channel !== 'whatsapp' && (
                      <label className="block shrink-0"><span className={LABEL}>Subject</span>
                        <input type="text" ref={subjectRef} className={FIELD} value={draft.subject ?? ''}
                          onFocus={() => setLastFocus('subject')}
                          onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} />
                      </label>
                    )}

                    <div className="shrink-0 flex items-center gap-2 flex-wrap">
                      <span className={LABEL}>Message</span>
                      {/* ── 🔴 INSERT TOKEN ▾ — THE RESOLVER'S OWN VOCABULARY ────────────────────
                          `resolvedTokenReference()` reads the labels off the resolver's switch, so
                          this list cannot drift from what actually substitutes: a token the resolver
                          does not know is not in the menu, and one it knows appears the day it is
                          written. A second hand-kept list is exactly how `{{truck name}}` shipped on
                          an active template.
                          ⚠️ IT INSERTS TEXT AND GUARDS NOTHING. The malformed-token check
                          (`malformedTokensIn`) still reads the finished body — this writes the same
                          characters a person would type and is checked the same way.
                          ⚠️ IT REPLACES THE "Tokens" RAIL, which was a third pane competing with the
                          preview for the width beside the editor. */}
                      <TokenMenu tokens={tokenRef} disabled={!lastFocus}
                        hint={lastFocus ? `Inserts at your cursor in the ${lastFocus}.` : 'Click into the subject or body first.'}
                        onInsert={syntax => insertAtCaret(syntax)} />
                      {/* ── 🔴 EVERY CONDITION, IN PLAIN WORDS, ONE MARKER PER CLICK ──────────────
                          It offered the PAIRS only, writing both halves in one click. That followed
                          from treating a one-sided condition as a half-finished one — the same premise
                          as the red warning that is now gone — and it left `?website:`,
                          `?contact_name:`, `?order_url:` and the four `?lead_*` lines out of the menu
                          entirely, because they have no negative half to pair with.
                          ⚠️ `ownLines` IS KEPT AND STILL MATTERS: a marker is only recognised as the
                          first thing on its line, so an insert at a mid-line caret would produce a
                          clause that never fires — and `misplacedConditionMarkers` now calls that out
                          in red if it is typed by hand. */}
                      {condRef.length > 0 && (
                        <CondMenu conds={condRef} disabled={!lastFocus}
                          onInsert={c => insertAtCaret(`?${c}: `, { ownLines: true })} />
                      )}
                    </div>
                    {/* ── 🔴 (v2 item 3) THE ONE LINE THAT SURVIVED THE NUMBERED HEADINGS ───────────
                        The "3 Write it" paragraph went with the rest of the tutorial prose, but this
                        sentence is not tutorial: it is the ONLY place the two bracket shapes are told
                        apart. {{double braces}} resolve at send; [[square brackets]] are asked for.
                        Deleting it is how someone types [[truck name]] and wonders why it never fills.
                        ⚠️ IT SITS UNDER THE LABEL, NOT IN A TOOLTIP — the brief asks for a small grey
                        line, and `scripts/outreach-templates-layout.cjs` checks it is still here. */}
                    <p className="shrink-0 text-[11px] text-slate-500 -mt-1">
                      {'{{double braces}}'} fill themselves in; {'[[square brackets]]'} are values you
                      set once in Snippets, or are asked for per truck.
                    </p>
                    <label className="flex-1 min-h-[7rem] flex flex-col">
                      {/* 🔴 THE MESSAGE FILLS WHAT IS LEFT, AND IS THE ONLY THING THAT SHRINKS. It was
                          a fixed `rows={15}` (404px, measured against a 1440x900 laptop) inside a
                          column that is now the measured height of the pane — so on a shorter window
                          the column had to take 404px out of somewhere, took it out of every block at
                          once, and the boxes below ended up drawn across the textarea.
                          🔴 `rows` IS STILL 15 AND STILL MATTERS: it is the flex BASIS, so it is the
                          height the box has when the column has no height of its own — the phone
                          layout, where the three panes stack and the page scrolls.
                          🔴 SIZED WITH `rows`, NOT A CLASS: `text-sm` is INERT on a textarea here —
                          the unlayered rule in globals.css forces `font-size: inherit`.
                          ⚠️ `resize-y` IS GONE, DELIBERATELY. Dragging set an inline height that the
                          flex column then fought, which is the same overlap by another route; a box
                          that already fills the pane has nothing to be dragged taller into.
                          🔴 `min-h-[7rem]` IS THE FLOOR, AND IT IS WHAT MAKES THE PANE SCROLL INSTEAD
                          OF COLLAPSING. With `min-h-0` the message would be squeezed towards nothing
                          on a short window — a writing box with no room to write in — and the column
                          would keep "fitting". At seven rems it stops shrinking, the column overflows,
                          and `overflow-y-auto` on the pane does what it is for. */}
                      <textarea ref={bodyRef} rows={15} className={`${FIELD} flex-1 min-h-0 resize-none leading-relaxed font-normal`}
                        value={draft.body ?? ''}
                        onFocus={() => setLastFocus('body')}
                        onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} />
                </label>

                {/* ── 🔴 (S4 / item 6) THE SNIPPET LINE — UNDER THE MESSAGE, AND READ-ONLY ──────────
                    Moved here from the top of the pane. It was the first thing on screen, which put
                    step-3 detail above the template's own name and broke the 1-2-3 reading before it
                    started. It belongs under the message it describes.
                    🔴 STILL NO INPUT. This used to be an editable "Placeholder defaults" row, and that
                    is exactly what made one value four edits: the same `[[my rate]]` had its own box on
                    every template that mentioned it. One place to edit, one place to look — an editable
                    field here would recreate the problem on the screen that replaced it. */}
                <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
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

                {/* ── 🔴 THE CONDITIONAL LINES, IN PLAIN ENGLISH AND IN GREY ───────────────────────
                    THIS REPLACED A RED "Half of a conditional pair" ERROR. One half of a pair without
                    the other is usually the copy as intended — "Hatches Up - map only" names the next
                    pitch when there is one and says nothing when there is not — so the red box accused
                    the operator of a mistake every time a correct template was opened. Red that is
                    usually wrong is worse than no red: the next red thing on this screen is a token
                    that would reach a real food business as literal braces.
                    ⚠️ GREY, AND NO HEADING. These are notes, not findings. They say who reads the line
                    and how many that is today, and leave the decision where it belongs.
                    ⚠️ THERE IS NO "no conditions" EMPTY STATE, deliberately — a template without a
                    conditional line has nothing to be told about one. */}
                {condNotes.length > 0 && (
                  <div className="shrink-0 space-y-1">
                    {condNotes.map(n => (
                      <p key={n.key} className="text-[11px] leading-snug text-slate-500">{n.text}</p>
                    ))}
                  </div>
                )}
                {/* 🔴 RED #1 — A CONDITION THE RESOLVER HAS NO BRANCH FOR. `conditionMet` returns false
                    for an unknown name, so the line is dropped for every truck, every time, and nothing
                    anywhere says so. This is the one-sided-condition case's opposite: not a choice, a
                    sentence that can never render. */}
                {unknownConds.length > 0 && (
                  <p className="shrink-0 text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
                    <span className="font-bold">
                      Unknown condition{unknownConds.length > 1 ? 's' : ''}:
                    </span>{' '}
                    <code className="font-mono">{unknownConds.map(c => `?${c}:`).join('  ')}</code>{' '}
                    — {unknownConds.length > 1 ? 'these are not conditions' : 'that is not a condition'} this
                    system knows, so the line is dropped for every truck. Use one from “Insert condition ▾”.
                  </p>
                )}
                {/* 🔴 RED #2 — A MARKER THAT IS NOT AT THE START OF ITS LINE. The renderer's line rule is
                    anchored, so a mid-line marker is not a condition at all: it is prose, and the
                    characters `?next_event:` are emailed to the prospect. Same class as a malformed
                    token, and invisible to every other guard here — they all read `{{…}}` or `[[…]]`. */}
                {misplaced.length > 0 && (
                  <p className="shrink-0 text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
                    <span className="font-bold">
                      Condition{misplaced.length > 1 ? 's' : ''} in the middle of a line:
                    </span>{' '}
                    <code className="font-mono">{misplaced.map(c => `?${c}:`).join('  ')}</code>{' '}
                    — a condition only works as the FIRST thing on its line, so{' '}
                    {misplaced.length > 1
                      ? 'these would be sent as those exact characters. Move each to the start of its own line.'
                      : 'this one would be sent as those exact characters. Move it to the start of its own line.'}
                  </p>
                )}
                {/* 🔴 THE SECOND HARD STOP, SHOWN WHERE THE TEMPLATE IS WRITTEN. Unlike the unreadable-token
                    error this one is about DATA, not syntax: the token is spelled correctly and the
                    prospect simply has no live demo. It is prospect-specific, so it moves as the preview
                    prospect changes — which is exactly what makes it informative here. */}
                {(preview?.blocking.length ?? 0) > 0 && (
                  <p className="shrink-0 text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
                    <span className="font-bold">Cannot be sent to {previewProspect?.name}:</span>{' '}
                    {preview!.blocking.map(b => `{{${b}}}`).join(', ')}{' '}
                    — there is no live demo link for this prospect, and this token has no fallback on
                    purpose. 🧪 Only 1 of 231 prospects has one; the compose window refuses to send,
                    copy or log while it is unresolved.
                  </p>
                )}
                {malformed.length > 0 && (
                  <p className="shrink-0 text-[12px] text-red-800 bg-red-50 border border-red-300 rounded-lg px-2.5 py-2">
                    <span className="font-bold">Unreadable token{malformed.length > 1 ? 's' : ''}:</span>{' '}
                    <code className="font-mono">{malformed.join('  ')}</code>{' '}
                    — the renderer cannot read {malformed.length > 1 ? 'these' : 'this'} and would leave the
                    braces in the message, so the compose window will refuse to send it. Tokens are
                    lower-case with underscores: <code className="font-mono">{'{{truck_name}}'}</code>, not{' '}
                    <code className="font-mono">{'{{truck name}}'}</code>.
                  </p>
                )}
                {mistyped.length > 0 && (
                  <p className="shrink-0 text-[12px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <span className="font-bold">Possible mistyped token{mistyped.length > 1 ? 's' : ''}:</span>{' '}
                    {mistyped.map(m => `[${m}]`).join(', ')} — single brackets are ordinary text and print
                    literally. Use <code className="font-mono">{'{{token}}'}</code> or{' '}
                    <code className="font-mono">[[name]]</code>.
                  </p>
                )}

                </div>
                {/* ⚠️ SAVE SITS AT THE BOTTOM OF THE PANE AND IS ALWAYS ON SCREEN — it is OUTSIDE the
                    scroller above, so the editor scrolling is not the button leaving. */}
                <div className="shrink-0 flex justify-end pt-2">
                  <button onClick={saveDraft}
                    className="text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400">
                    Save template
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── RAIL ─────────────────────────────────────────────────────────────────────────────── */}
          {/* ── RIGHT: THE LIVE PREVIEW, AND ONLY THAT ────────────────────────────────────────────
              🔴 THE "Tokens" TAB IS GONE FROM HERE. It was a second pane competing with the preview
              for the width beside the editor, and everything in it was a button that inserted text
              at the cursor — which belongs beside the cursor. It is the toolbar's "Insert token ▾"
              and "Insert condition ▾" now, reading the same `resolvedTokenReference()`.
              ⚠️ THE PANE SCROLLS ON ITS OWN, like the other two. */}
          {selected && (
            <div className="rounded-xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
              <p className="px-3 py-2 border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                Preview
              </p>
              {/* ⚠️ A FLEX COLUMN, NOT A SCROLLER. The pane's scrolling moved INTO the rendered
                  email below, so the picker at the top and the "Dropped / Footer" line at the bottom
                  stay put while the email itself scrolls — which is what makes the footer one of the
                  two things the acceptance requires to be on screen. */}
              <div className="flex-1 min-h-0 flex flex-col">
              <div className="p-3 space-y-2 flex-1 min-h-0 flex flex-col">
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
                      {/* 🔴 IT FILLS THE PANE. A fixed 340px box left empty space under a short email
                          and a letterbox onto a long one, in a pane that already knows how tall it
                          is. `flex-1 min-h-0` takes the height that is left after the picker above
                          and the footer below, and scrolls inside when the email is longer. */}
                      <pre className="flex-1 min-h-0 text-base leading-relaxed text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-2 whitespace-pre-wrap font-sans overflow-y-auto">{preview.full}</pre>
                      <div className="flex flex-wrap gap-1.5">
                        {preview.unresolved.length > 0 && (
                          <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            Unresolved: {preview.unresolved.map(u => `[[${u}]]`).join(', ')}
                          </span>
                        )}
                        {/* ⚠️ THIS CHIP SAID `Dropped: next_event` — the renderer's verb and the
                            resolver's case label, naming no line. See `droppedNotes`. */}
                        {droppedNotes.map(d => (
                          <span key={d.key}
                            className="text-[11px] text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                            {d.text}
                          </span>
                        ))}
                        {/* ⚠️ THIS CHIP SAID "Footer appended above", WHICH HAD NOT BEEN TRUE SINCE
                            the signature stopped being appended automatically (29 September). It now
                            says what the pane is actually doing: the two send-time tokens have been
                            expanded from the Signature screen's rows, exactly as the composer will. */}
                        {preview.isEmail && (
                          <span className="text-[11px] text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded px-1.5 py-0.5">
                            {preview.expanded ? 'Signature and opt-out from Settings' : 'Reading the signature…'}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
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

// ── THE SIGNATURE EDITOR ────────────────────────────────────────────────────────────────────────────
/**
 * The signature lines and the opt-out sentence, edited as DATA.
 *
 * 🔴 THE PREVIEW IS RENDERED BY THE FUNCTION THE SENDER USES — `signatureBlockHtml` and `optOutHtml`
 * from `lib/outreach-signature.ts`, the same module `buildMessage` calls. A preview drawn by a second
 * implementation would be the one thing worse than no preview: it would be believed.
 * ⚠️ IT TOUCHES NOTHING ELSE. No template, no snippet — the route writes exactly two keys of
 * `outreach_settings` and nothing in this panel can ask it for a third.
 */
function SignaturePanel() {
  const [lines, setLines] = useState<SignatureLine[] | null>(null)
  const [optOut, setOptOut] = useState('')
  const [fromName, setFromName] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const r = await fetch('/api/admin/outreach/settings').catch(() => null)
      if (!r || !live) return
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (!live) return
      if (j.ok !== true) { setLoadError(String(j.refusal ?? 'The settings could not be read.')); return }
      const sig = parseSignature(j.signature)
      const oo = parseOptOut(j.optOut)
      setLines(sig?.lines ?? [])
      setOptOut(oo?.text ?? '')
      setFromName(typeof j.fromName === 'string' ? j.fromName : '')
    })()
    return () => { live = false }
  }, [])

  const edit = (fn: (l: SignatureLine[]) => SignatureLine[]) => {
    setLines(cur => (cur ? fn(cur) : cur)); setDirty(true); setNote(null)
  }
  const save = async () => {
    if (inFlight.current || !lines) return
    inFlight.current = true; setSaving(true); setNote(null)
    try {
      const r = await fetch('/api/admin/outreach/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: { lines }, optOut: { text: optOut }, fromName: { text: fromName } }),
      })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (j.ok !== true) { setNote(String(j.refusal ?? 'That could not be saved.')); return }
      // 🔴 THE SCREEN SHOWS WHAT THE TABLE HOLDS, not what was posted. The route reads it back.
      const sig = parseSignature(j.signature)
      const oo = parseOptOut(j.optOut)
      setLines(sig?.lines ?? []); setOptOut(oo?.text ?? '')
      setFromName(typeof j.fromName === 'string' ? j.fromName : '')
      setDirty(false); setNote('Saved.')
    } catch {
      setNote('That could not be saved — check the connection and try again.')
    } finally { inFlight.current = false; setSaving(false) }
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4">
        <p className="text-sm font-bold text-red-900">Could not load the signature.</p>
        <p className="text-sm text-red-800 mt-1">{loadError}</p>
      </div>
    )
  }
  if (!lines) return <p className="text-sm text-slate-500">Loading…</p>

  const btn = 'text-xs font-semibold px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-slate-400'
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {/* ── THE SENDER NAME, AT THE TOP, BECAUSE IT IS THE FIRST THING A RECIPIENT SEES ──────────
            🔴 Without it the From header is the bare address, and every prospect's inbox showed
            "dominic@hatchgrab.com <dominic@hatchgrab.com>". */}
        <label className="block mb-4">
          <span className="block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5">Sender name</span>
          <input type="text" value={fromName}
            placeholder="Dominic Bonini"
            onChange={e => { setFromName(e.target.value); setDirty(true); setNote(null) }}
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
          <span className="block mt-1 text-[11px] text-slate-500">
            How your name appears in the recipient&apos;s inbox. Leave it empty to send from the bare
            address, as before.
          </span>
          {/* ⚠️ A WARNING, NEVER A REFUSAL. Some filters score a display name containing `@` as a
              disguised address, but a name is a person's to choose. */}
          {fromNameLooksLikeAddress(fromName) && (
            <span className="block mt-1 text-[11px] font-semibold text-amber-800">
              Spam filters can treat a name containing @ as a disguised address — a plain name is safer.
            </span>
          )}
        </label>

        <p className="text-sm font-bold text-slate-800">Signature lines</p>
        <p className="text-[12px] text-slate-600 mt-1 mb-3">
          These are inserted wherever a template has <code className="font-mono">{'{{signature}}'}</code> on
          a line of its own. Leave an input empty for a blank line. Nothing is added automatically — a
          template without the token sends without a signature.
        </p>
        <div className="flex flex-col gap-1.5">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-5 text-right text-[11px] text-slate-400 tabular-nums">{i + 1}</span>
              <input type="text" value={l.text}
                placeholder="(blank line)"
                onChange={e => edit(cur => cur.map((c, j) => j === i ? { ...c, text: e.target.value } : c))}
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
              <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 select-none">
                <input type="checkbox" checked={l.bold}
                  onChange={e => edit(cur => cur.map((c, j) => j === i ? { ...c, bold: e.target.checked } : c))} />
                Bold
              </label>
              <button type="button" className={btn} disabled={i === 0} title="Move up"
                onClick={() => edit(cur => { const n = [...cur]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })}>↑</button>
              <button type="button" className={btn} disabled={i === lines.length - 1} title="Move down"
                onClick={() => edit(cur => { const n = [...cur]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n })}>↓</button>
              <button type="button" className={btn} title="Remove this line"
                onClick={() => edit(cur => cur.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => edit(cur => [...cur, { text: '', bold: false }])}
          className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
          Add a line
        </button>

        <label className="block mt-4">
          <span className="block text-[10px] uppercase tracking-wide font-bold text-slate-400 mb-0.5">Opt-out line</span>
          <input type="text" value={optOut}
            onChange={e => { setOptOut(e.target.value); setDirty(true); setNote(null) }}
            className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
          <span className="block mt-1 text-[11px] text-slate-500">
            Inserted at <code className="font-mono">{'{{opt_out}}'}</code>, at 10pt. This is the sentence
            that lets a prospect stop the emails, so it cannot be saved empty.
          </span>
        </label>

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={saving || !dirty}
            className="text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-400">
            {saving ? 'Saving…' : 'Save'}
          </button>
          {note && <span className="text-[12px] text-slate-600">{note}</span>}
          {dirty && !note && <span className="text-[12px] font-semibold text-amber-800">Unsaved changes</span>}
        </div>
      </div>

      {/* 🔴 THE SAME RENDERER THE SENDER USES. Not a lookalike. */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-bold text-slate-800">Preview</p>
        <p className="text-[12px] text-slate-600 mt-1 mb-3">
          Exactly what an email carries where the two tokens sit — rendered by the same code that builds
          the message, so this cannot drift from what is sent.
        </p>
        {/* The From line as the recipient will read it, above the block it belongs to. */}
        <p className="text-[12px] text-slate-700 mb-2">
          <span className="font-bold">From:</span>{' '}
          <span className="font-mono">{fromDisplay(fromName, OUTREACH_FROM_ADDRESS)}</span>
        </p>
        <div className="border border-slate-200 rounded-lg p-3 bg-white"
          dangerouslySetInnerHTML={{ __html: signatureBlockHtml({ lines }) + optOutHtml({ text: optOut }) }} />
      </div>
    </div>
  )
}

/**
 * One row of the template list.
 *
 * 🔴 IT SAYS WHERE THE TEMPLATE IS USED, which is the question the list could not answer before: a
 * name and an `em`/`wa` chip told you it existed. "Used in 2 boxes · default" is the difference
 * between a template the sequence will send and one nobody has put anywhere.
 * ⚠️ THE REORDER AND RETIRE CONTROLS ARE UNCHANGED, and still cost no width until the row is
 * hovered or selected.
 */
function ListRow({ r, i, arr, selId, usedIn, onSelect, onMove, onToggle }: {
  r: Row
  i: number
  arr: Row[]
  selId: string | null
  usedIn: string[]
  onSelect: (id: string) => void
  onMove: (r: Row, dir: -1 | 1) => Promise<void> | void
  onToggle: (r: Row) => Promise<void> | void
}) {
  const isSel = selId === r.id
  const inDefault = usedIn.some(u => u.endsWith('All trucks'))
  return (
    <div
      className={`group px-2.5 py-1.5 border-b border-slate-100 last:border-b-0 cursor-pointer ${isSel ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
      onClick={() => r.id && onSelect(r.id)}>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm truncate flex-1 min-w-0 ${r.active ? (isSel ? 'font-semibold text-slate-900' : 'text-slate-800') : 'text-slate-400'}`}>
          {r.label}
        </span>
        <span className={`flex items-center gap-0.5 flex-shrink-0 ${isSel ? 'flex' : 'hidden group-hover:flex'}`}>
          <button onClick={e => { e.stopPropagation(); void onMove(r, -1) }} disabled={i === 0}
            title="Move up" className="text-[11px] leading-none px-1 py-0.5 rounded border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50">↑</button>
          <button onClick={e => { e.stopPropagation(); void onMove(r, 1) }} disabled={i === arr.length - 1}
            title="Move down" className="text-[11px] leading-none px-1 py-0.5 rounded border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50">↓</button>
          <button onClick={e => { e.stopPropagation(); void onToggle(r) }}
            title={r.active ? 'Retire (kept, hidden from the compose picker)' : 'Restore'}
            className={`text-[11px] leading-none px-1 py-0.5 rounded border bg-white ${r.active ? 'border-slate-200 text-slate-500 hover:bg-slate-50' : 'border-emerald-300 text-emerald-700'}`}>
            {r.active ? '⦸' : '↺'}
          </button>
        </span>
      </div>
      <p className={`text-[11px] ${usedIn.length ? 'text-slate-500' : 'text-slate-400'}`}>
        {usedIn.length
          ? `Used in ${usedIn.length} box${usedIn.length === 1 ? '' : 'es'}${inDefault ? ' · default' : ''}`
          : 'Not in sequence'}
      </p>
    </div>
  )
}

/**
 * "Insert token ▾" — every token the RESOLVER understands, with what each one fills in.
 *
 * 🔴 THE LIST IS `resolvedTokenReference()`, WHICH READS THE RESOLVER'S OWN SWITCH. There is no
 * array of token names in this file and there must never be one: a second copy agrees on the day it
 * is written and then quietly offers a token that expands to nothing, or hides one that works.
 * ⚠️ IT IS DISABLED UNTIL A FIELD HAS BEEN FOCUSED, and says why — inserting into a guessed field is
 * how text lands somewhere nobody watched.
 */
function TokenMenu({ tokens, disabled, hint, onInsert }: {
  tokens: readonly { syntax: string; name: string; description: string }[]
  disabled: boolean
  hint: string
  onInsert: (syntax: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} disabled={disabled} title={hint}
        aria-expanded={open}
        className="text-[11px] font-bold px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        Insert token ▾
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} role="presentation" />
          <div className="absolute z-30 mt-1 w-80 max-h-80 overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg p-1">
            <p className="px-2 py-1 text-[11px] text-slate-500">{hint}</p>
            {tokens.map(t => (
              <button key={t.name} type="button"
                onClick={() => { onInsert(t.syntax); setOpen(false) }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-100">
                <span className="block text-[11px] font-mono text-slate-800">{t.syntax}</span>
                <span className="block text-[11px] text-slate-500">{t.description}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Every condition the resolver understands, in plain words. One click inserts ONE marker.
 *
 * 🔴 IT LISTS EVERY CONDITION, NOT THE PAIRS. This menu used to offer only the conditions that have a
 * negative half, and one click wrote BOTH halves — built that way because a half-written pair "fails
 * silently", which was also the reasoning behind the red warning this task removes. Both followed from
 * treating a one-sided condition as a mistake, and it is not one: a line that appears only when there
 * is something to say is the commonest correct use of this whole tier, and `?website:` /
 * `?contact_name:` / the four `?lead_*` lines have no negative half to write even in principle. Offering
 * only pairs hid seven of today's nine conditions behind "type it from memory".
 * ⚠️ SO INSERTING A PAIR IS NOW TWO CLICKS, and that is the right trade. Writing two lines when one was
 * wanted is visible and deletable; the operator can see both lines appear. The reverse — a menu that
 * cannot offer `?website:` at all — was invisible.
 *
 * 🔴 THE LIST IS `conditionReference()`, THE RESOLVER'S OWN CASE LABELS, and the plain wording travels
 * with it on the same entry. A condition added to `conditionMet` appears here the day it is written,
 * worded or not. A second list here is the mistake that shipped `{{truck name}}` on an active template.
 */
function CondMenu({ conds, disabled, onInsert }: {
  conds: readonly ConditionRefEntry[]
  disabled: boolean
  onInsert: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} disabled={disabled} aria-expanded={open}
        className="text-[11px] font-bold px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40">
        Insert condition ▾
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} role="presentation" />
          <div className="absolute z-30 mt-1 w-80 max-h-80 overflow-y-auto rounded-lg border border-slate-300 bg-white shadow-lg p-1">
            <p className="px-2 py-1 text-[11px] text-slate-500">
              Keeps its line only for the trucks it names. Inserted at the start of the current line.
            </p>
            {conds.map(c => (
              <button key={c.name} type="button" onClick={() => { onInsert(c.name); setOpen(false) }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-100">
                {/* 🔴 THE PLAIN LINE IS THE PROMINENT ONE. The marker is shown under it, smaller: it is
                    what gets typed into the message, so it has to be visible, but it is not what the
                    choice is made on. */}
                <span className="block text-[11px] text-slate-800">{c.only}</span>
                <span className="block text-[10px] font-mono text-slate-400">{c.syntax.trim()}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
