'use client'
// components/admin/InboxTab.tsx — Admin › Inbox (inbox-1, 23 November 2026; docs/inbox-1-report.md). Approved by Dominic from a clickable
// mockup. ONE place for every incoming email: enquiries, prospects, partners and customers, read and answered side by side.
//   top     — All · Enquiries · Prospects · Partners · Customers, each with its waiting count; a search box (name, email, words).
//   list    — one row per conversation with a waiting email, oldest unanswered first (under Older / Today).
//   middle  — their message: in English (translated) or as written, the earlier messages folded above, the latest in full.
//   right   — your reply: the English draft (type in it), their-language version (read-only), comments for the AI, Update reply, Attach,
//             the From address, Send.
// 🔴 NOTHING IS SENT EXCEPT BY PRESSING SEND (POST /api/admin/inbox action 'send'). No review flags, gaps or back-translation here
// (Dominic's decision: gaps are handled in the background); they stay stored.
// The same layout on a 16in laptop and a 27in monitor — full width, three columns each scrolling on its own; stacked on a phone.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import { uploadRefusal, MAX_ATTACHMENT_BYTES, mb, type OutboundAttachment } from '@/lib/outreach-attachments'
import { SNOOZE_OPTIONS, SNOOZE_LABELS, type SnoozeOption } from '@/lib/outreach-attention'
import { languageName, isEnglish } from '@/lib/inbox/language'
import { shortAddress } from '@/lib/inbox/aliases'
import { OPEN_INBOX_EVENT, INBOX_COUNT_EVENT } from '@/lib/inbox/open'
import {
  INBOX_FILTERS, FILTER_TYPE, INBOX_WORDS, parseKey,
  type InboxConversation, type InboxCounts, type InboxFilter, type InboxThread, type InboxType, type ThreadMessage,
} from '@/lib/inbox/types'

const ORANGE = '#EF8B2C'
const FILTER_LABEL: Record<InboxFilter, string> = { all: 'All', enquiries: 'Enquiries', prospects: 'Prospects', partners: 'Partners', customers: 'Customers' }
const COUNT_KEY: Record<InboxFilter, keyof InboxCounts> = { all: 'all', enquiries: 'enquiries', prospects: 'prospects', partners: 'partners', customers: 'customers' }
/** Enquiry blue, Prospect violet, Partner teal, Customer amber. */
export const TYPE_CHIP: Record<InboxType, { label: string; cls: string }> = {
  enquiry: { label: 'Enquiry', cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  prospect: { label: 'Prospect', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  partner: { label: 'Partner', cls: 'bg-teal-100 text-teal-800 border-teal-200' },
  customer: { label: 'Customer', cls: 'bg-amber-100 text-amber-900 border-amber-200' },
}
const EMPTY_COUNTS: InboxCounts = { all: 0, enquiries: 0, prospects: 0, partners: 0, customers: 0 }

const londonDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
function when(iso: string | null | undefined, now: Date): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = londonDay(d) === londonDay(now)
  return new Intl.DateTimeFormat('en-GB', sameDay
    ? { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
    : { timeZone: 'Europe/London', day: 'numeric', month: 'short' }).format(d)
}
function whenLong(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

async function api(method: 'GET' | 'POST', qs: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(`/api/admin/inbox${qs}`, {
      method, credentials: 'same-origin',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(await nativeAuthHeader()) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return (await r.json().catch(() => ({ ok: false, refusal: `The server answered ${r.status}.` }))) as Record<string, unknown>
  } catch { return { ok: false, refusal: 'The connection dropped before the server answered.' } }
}

interface ReplyState {
  english: string
  comment: string
  /** The draft as the server holds it (to tell whether the English changed since it was translated). */
  draft: InboxThread['draft']
  showCustomer: boolean
  files: OutboundAttachment[]
  note: { tone: 'info' | 'error' | 'sent'; text: string } | null
  busy: null | 'draft' | 'update' | 'send' | 'attach' | 'plans' | 'done' | 'snooze'
}
const blankReply = (draft: InboxThread['draft']): ReplyState => ({ english: draft?.english ?? '', comment: '', draft, showCustomer: false, files: [], note: null, busy: null })

export default function InboxTab({ onCount }: { onCount?: (n: number) => void }) {
  const [conversations, setConversations] = useState<InboxConversation[]>([])
  const [counts, setCounts] = useState<InboxCounts>(EMPTY_COUNTS)
  const [drafting, setDrafting] = useState(false)
  const [loaded, setLoaded] = useState<'loading' | 'ok' | string>('loading')
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [thread, setThread] = useState<InboxThread | null>(null)
  const [threadState, setThreadState] = useState<'idle' | 'loading' | string>('idle')
  const [sent, setSent] = useState<Record<string, true>>({})
  const [replies, setReplies] = useState<Record<string, ReplyState>>({})
  const [showOriginal, setShowOriginal] = useState(false)
  const [showEarlier, setShowEarlier] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  // 🔴 THE SAME LAYOUT ON A 16in LAPTOP AND A 27in MONITOR: the three columns fill the window below the admin header and tab row, each
  // scrolling on its own. The height is MEASURED (window height minus where the Inbox starts), not a guessed header height, so a taller
  // tab row (a scrollbar, a wrapped badge) never makes the page itself scroll. On a phone the columns stack at their natural height.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const fit = () => {
      if (!window.matchMedia('(min-width: 768px)').matches) { el.style.height = ''; return }
      const top = el.getBoundingClientRect().top + window.scrollY
      if (el.offsetParent === null) return   // hidden (another admin tab is open)
      el.style.height = `${Math.max(560, Math.floor(window.innerHeight - top))}px`
    }
    fit()
    window.addEventListener('resize', fit)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(el); ro?.observe(document.body)
    return () => { window.removeEventListener('resize', fit); ro?.disconnect() }
  }, [])
  const messageRef = useRef<HTMLDivElement>(null)
  const now = useMemo(() => new Date(), [conversations])   // eslint-disable-line react-hooks/exhaustive-deps

  /** The conversation being shown; a slower answer for an earlier choice is ignored. */
  const wanted = useRef<string | null>(null)
  /** Open one conversation in full (and make its draft now if it has none and drafting is on). */
  const openThread = useCallback(async (key: string) => {
    wanted.current = key
    setSelected(key); setThreadState('loading'); setShowOriginal(false); setShowEarlier(false); setSnoozeOpen(false); setAttachOpen(false)
    const j = await api('GET', `?view=thread&key=${encodeURIComponent(key)}`)
    if (wanted.current !== key) return
    if (j.ok !== true) { setThread(null); setThreadState(String(j.refusal ?? 'That conversation could not be read.')); return }
    const t = j as unknown as InboxThread
    setThread(t); setThreadState('idle')
    setReplies(r => (r[key] && (r[key].english || r[key].draft === t.draft)) ? r : { ...r, [key]: blankReply(t.draft) })
    if (!t.draft && t.drafting) {
      setReplies(r => ({ ...r, [key]: { ...(r[key] ?? blankReply(null)), busy: 'draft' } }))
      const d = await api('POST', '', { action: 'draft', key })
      setReplies(r => {
        const cur = r[key] ?? blankReply(null)
        if (d.ok === true && d.draft) { const draft = d.draft as InboxThread['draft']; return { ...r, [key]: { ...cur, busy: null, draft, english: cur.english || draft?.english || '' } } }
        return { ...r, [key]: { ...cur, busy: null, note: { tone: 'info', text: String(d.refusal ?? 'No draft could be made.') } } }
      })
    }
  }, [])

  const load = useCallback(async () => {
    const j = await api('GET', '?view=list')
    if (j.ok !== true) { setLoaded(String(j.refusal ?? j.error ?? 'The inbox could not be read.')); return }
    const list = (j.conversations ?? []) as InboxConversation[]
    setConversations(list); setCounts((j.counts ?? EMPTY_COUNTS) as InboxCounts); setDrafting(j.drafting === true); setLoaded('ok')
    onCount?.(((j.counts ?? EMPTY_COUNTS) as InboxCounts).all)
    // a deep link (?c=) selects its conversation on the first load
    if (!wanted.current && typeof window !== 'undefined') {
      const c = new URLSearchParams(window.location.search).get('c')
      if (c && parseKey(c)) void openThread(c)
    }
  }, [onCount, openThread])
  useEffect(() => { void Promise.resolve().then(load) }, [load])   // deferred, as PartnersTab does

  // "Open in Inbox" from Today or a partner's drawer selects the conversation.
  useEffect(() => {
    const on = (e: Event) => { const key = (e as CustomEvent<{ key?: string }>).detail?.key; if (key && parseKey(key)) { void openThread(key); void load() } }
    window.addEventListener(OPEN_INBOX_EVENT, on)
    return () => window.removeEventListener(OPEN_INBOX_EVENT, on)
  }, [load, openThread])

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return conversations.filter(c => (filter === 'all' || c.type === FILTER_TYPE[filter]) && (!needle || c.searchText.includes(needle)))
  }, [conversations, filter, q])
  const groups = useMemo(() => {
    const today = londonDay(now)
    const older = visible.filter(c => !c.waitingSince || londonDay(new Date(c.waitingSince)) < today)
    const todays = visible.filter(c => c.waitingSince && londonDay(new Date(c.waitingSince)) >= today)
    return [{ label: 'Older', rows: older }, { label: 'Today', rows: todays }].filter(g => g.rows.length)
  }, [visible, now])

  const reply = selected ? replies[selected] ?? blankReply(thread?.draft ?? null) : null
  const patch = (p: Partial<ReplyState>) => { if (selected) setReplies(r => ({ ...r, [selected]: { ...(r[selected] ?? blankReply(thread?.draft ?? null)), ...p } })) }

  const conv = thread?.conversation
  const kind = conv ? parseKey(conv.key)?.kind : undefined
  const theirLang = thread?.theirLanguage ?? 'en'
  const english = isEnglish(theirLang)
  const langName = languageName(theirLang)
  const latestTranslation = reply?.draft && reply.draft.customer && reply.draft.translatedFrom != null && reply.draft.translatedFrom.trim() === reply.english.trim() ? reply.draft.customer : null
  const canTranslate = drafting || !!latestTranslation
  const sendBlocked = !reply || !reply.english.trim() || !!reply.busy || (!english && !canTranslate) || (selected ? !!sent[selected] : false)

  const earlier = thread ? thread.messages.filter(m => m.id !== thread.latest.id) : []

  // ── actions ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const updateReply = async () => {
    if (!selected || !reply) return
    if (!reply.comment.trim()) { patch({ note: { tone: 'error', text: INBOX_WORDS.needComment } }); return }
    if (!drafting) { patch({ note: { tone: 'info', text: INBOX_WORDS.draftingOff } }); return }
    patch({ busy: 'update', note: null })
    const j = await api('POST', '', { action: 'update_reply', key: selected, english: reply.english, comment: reply.comment })
    if (j.ok === true && j.draft) {
      const draft = j.draft as InboxThread['draft']
      patch({ busy: null, draft, english: draft?.english ?? reply.english, comment: '', note: { tone: 'info', text: String(j.message ?? INBOX_WORDS.rewritten) } })
    } else patch({ busy: null, note: { tone: 'error', text: String(j.refusal ?? 'The reply could not be rewritten.') } })
  }

  const send = async () => {
    if (!selected || !reply || !conv) return
    if (!english && !canTranslate) { patch({ note: { tone: 'error', text: INBOX_WORDS.translationOff } }); return }
    patch({ busy: 'send', note: null })
    const idem = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    const j = await api('POST', '', { action: 'send', key: selected, english: reply.english, attachments: reply.files, idempotency_key: `inbox:${idem}` })
    if (j.ok === true) {
      patch({ busy: null, files: [], note: { tone: 'sent', text: String(j.message ?? 'Sent.') } })
      setSent(s => ({ ...s, [selected]: true }))
      // 🔴 It drops out of the waiting count at once (the list itself is re-read on the next visit).
      setCounts(c => {
        const t = conv.type, n = conv.waitingCount
        const k: keyof InboxCounts = t === 'enquiry' ? 'enquiries' : t === 'prospect' ? 'prospects' : t === 'partner' ? 'partners' : 'customers'
        const next = { ...c, [k]: Math.max(0, c[k] - n), all: Math.max(0, c.all - n) }
        onCount?.(next.all)
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(INBOX_COUNT_EVENT, { detail: { waiting: next.all } }))
        return next
      })
    } else patch({ busy: null, note: { tone: 'error', text: String(j.refusal ?? 'That was not sent.') } })
  }

  const markDone = async () => {
    if (!selected) return
    patch({ busy: 'done', note: null })
    const j = await api('POST', '', { action: 'mark_done', key: selected })
    patch({ busy: null, note: { tone: j.ok === true ? 'info' : 'error', text: String(j.ok === true ? j.message : j.refusal ?? 'That could not be saved.') } })
    if (j.ok === true) await load()
  }
  const snooze = async (option: SnoozeOption) => {
    if (!selected) return
    setSnoozeOpen(false); patch({ busy: 'snooze', note: null })
    const j = await api('POST', '', { action: 'snooze', key: selected, option })
    patch({ busy: null, note: { tone: j.ok === true ? 'info' : 'error', text: String(j.ok === true ? j.message : j.refusal ?? 'That could not be saved.') } })
    if (j.ok === true) await load()
  }

  /** The CRM's own attachment paths: a prospect's through the outreach route, a partner's through the partner route, an enquiry's here. */
  const uploadVia = (): { url: string; extra: Record<string, unknown> } | null => {
    const k = selected ? parseKey(selected) : null
    if (!k) return null
    if (k.kind === 'prospect') return { url: '/api/admin/outreach/attachments', extra: { prospect_id: k.id } }
    if (k.kind === 'partner') return { url: '/api/admin/partners/mail-send', extra: { partner_id: k.id } }
    return { url: '/api/admin/inbox', extra: { key: selected } }
  }
  const attachFiles = async (picked: FileList | null) => {
    const via = uploadVia()
    if (!picked || !picked.length || !via || !reply) return
    setAttachOpen(false)
    let files = [...reply.files]
    for (const file of Array.from(picked)) {
      const stop = uploadRefusal({ filename: file.name, contentType: file.type, size: file.size })
      if (stop) { patch({ note: { tone: 'error', text: stop.refusal } }); continue }
      if (files.reduce((n, f) => n + f.size, 0) + file.size > MAX_ATTACHMENT_BYTES) { patch({ note: { tone: 'error', text: `${file.name} would take this email over ${mb(MAX_ATTACHMENT_BYTES)}.` } }); continue }
      patch({ busy: 'attach' })
      try {
        const r = await fetch(via.url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
          body: JSON.stringify({ action: 'signed_upload', ...via.extra, filename: file.name, content_type: file.type, size: file.size }) })
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
        if (j.ok !== true || typeof j.signedUrl !== 'string') { patch({ busy: null, note: { tone: 'error', text: String(j.refusal ?? 'That file could not be prepared for upload.') } }); continue }
        const up = await fetch(j.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!up.ok) { patch({ busy: null, note: { tone: 'error', text: `${file.name} did not upload — try again.` } }); continue }
        files = [...files, j.attachment as OutboundAttachment]
        patch({ busy: null, files })
      } catch { patch({ busy: null, note: { tone: 'error', text: `${file.name} did not upload — check the connection.` } }) }
    }
    if (fileRef.current) fileRef.current.value = ''
  }
  const attachPlans = async () => {
    const via = uploadVia()
    if (!via || !reply) return
    setAttachOpen(false); patch({ busy: 'plans', note: null })
    const k = parseKey(selected)
    const url = k?.kind === 'prospect' ? '/api/admin/outreach/attachments' : '/api/admin/inbox'
    try {
      const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
        body: JSON.stringify({ action: 'plans_pdf', ...(k?.kind === 'prospect' ? { prospect_id: k.id } : { key: selected }) }) })
      const j = (await r.json().catch(() => ({}))) as Record<string, unknown>
      if (j.ok !== true) { patch({ busy: null, note: { tone: 'error', text: String(j.refusal ?? 'The plans PDF could not be attached.') } }); return }
      patch({ busy: null, files: [...reply.files, j.attachment as OutboundAttachment] })
    } catch { patch({ busy: null, note: { tone: 'error', text: 'The plans PDF could not be attached — check the connection.' } }) }
  }

  const pick = (key: string) => {
    void openThread(key)
    try { window.history.replaceState(null, '', `/admin?tab=inbox&c=${encodeURIComponent(key)}`) } catch { /* fine */ }
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) setTimeout(() => messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // ── render ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  return (
    <div ref={rootRef} data-inbox className="flex flex-col bg-white md:min-h-[560px]">
      {/* top bar: the filters with their waiting counts, the search on the right */}
      <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-2 border-b border-slate-200 bg-slate-50">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Show">
          {INBOX_FILTERS.map(f => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} data-filter={f} onClick={() => setFilter(f)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-lg border ${filter === f ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'}`}>
              {FILTER_LABEL[f]} <span className={`ml-1 tabular-nums ${filter === f ? 'text-slate-300' : 'text-slate-500'}`} data-count={f}>{counts[COUNT_KEY[f]]}</span>
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or words" aria-label="Search the inbox"
          className="ml-auto w-full sm:w-72 text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white" />
      </div>

      <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-[300px_minmax(0,1fr)_minmax(0,1fr)]">
        {/* a · the list */}
        <div data-inbox-list className="md:overflow-y-auto md:min-h-0 border-b md:border-b-0 md:border-r border-slate-200 max-md:max-h-[50vh] max-md:overflow-y-auto">
          {loaded === 'loading' && <p className="px-4 py-6 text-sm text-slate-400">Loading the inbox…</p>}
          {loaded !== 'loading' && loaded !== 'ok' && <p className="px-4 py-6 text-sm text-red-700">{loaded}</p>}
          {loaded === 'ok' && visible.length === 0 && <p data-inbox-empty className="px-4 py-10 text-center text-sm font-semibold text-slate-500">{INBOX_WORDS.empty}</p>}
          {groups.map(g => (
            <div key={g.label}>
              <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 bg-white sticky top-0">{g.label}</p>
              <ul>
                {g.rows.map(c => {
                  const on = c.key === selected, done = !!sent[c.key]
                  return (
                    <li key={c.key}>
                      <button type="button" data-row={c.key} onClick={() => pick(c.key)} aria-current={on || undefined}
                        className={`relative w-full text-left pl-4 pr-3 py-2 border-b border-slate-100 ${on ? 'bg-orange-50' : 'hover:bg-slate-50'} ${done ? 'opacity-70' : ''}`}>
                        {on && <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: ORANGE }} />}
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
                            {c.name}{c.organisation && <span className="font-normal text-slate-500"> ({c.organisation})</span>}
                          </span>
                          {done ? <span data-sent className="text-[11px] font-bold text-emerald-700">Sent</span>
                            : <span className="text-[11px] text-slate-500 whitespace-nowrap tabular-nums">{when(c.latestAt, now)}</span>}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 min-w-0">
                          <span className={`shrink-0 px-1.5 py-px rounded border font-bold ${TYPE_CHIP[c.type].cls}`}>{TYPE_CHIP[c.type].label}</span>
                          <span className="truncate">{c.viaForm ? 'contact form' : shortAddress(c.wroteTo)} · {languageName(c.language)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-slate-600">{c.preview}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* b · their message */}
        <div ref={messageRef} data-inbox-message className="md:overflow-y-auto md:min-h-0 border-b md:border-b-0 md:border-r border-slate-200 px-5 py-4">
          {!selected && loaded === 'ok' && <p className="text-sm text-slate-400">Choose an email on the left.</p>}
          {selected && threadState === 'loading' && !thread && <p className="text-sm text-slate-400">Opening…</p>}
          {selected && threadState !== 'idle' && threadState !== 'loading' && <p className="text-sm text-red-700">{threadState}</p>}
          {thread && conv && (
            <>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-[12rem] flex-1">
                  <h2 className="text-base font-black text-slate-900">Their message</h2>
                  <p className="text-[12px] text-slate-500">{thread.translated ? `in English, translated from ${langName}` : english ? 'in English' : `in ${langName}`}</p>
                </div>
                <div className="flex items-center gap-1 relative">
                  {thread.translated && (
                    <button type="button" data-toggle-original onClick={() => setShowOriginal(v => !v)}
                      className="text-[12px] font-semibold px-2 py-1 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
                      {showOriginal ? 'Show English' : 'Show original'}
                    </button>
                  )}
                  <button type="button" onClick={() => void markDone()} disabled={!!reply?.busy}
                    title="Dealt with: it leaves the inbox. Nothing is sent."
                    className="text-[12px] font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40">Mark done</button>
                  <button type="button" onClick={() => setSnoozeOpen(v => !v)} title="Hide it until a chosen morning. It comes back on its own."
                    className="text-[12px] font-semibold px-2 py-1 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50">Snooze</button>
                  {snoozeOpen && (
                    <div className="absolute right-0 top-full mt-1 z-10 bg-white border border-slate-200 rounded-lg shadow-lg p-1 flex flex-col">
                      {SNOOZE_OPTIONS.map(o => <button key={o} type="button" onClick={() => void snooze(o)} className="text-left text-[12px] px-3 py-1.5 rounded hover:bg-slate-50">{SNOOZE_LABELS[o]}</button>)}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-2 text-[13px] text-slate-700">
                <b>{conv.name}</b>{conv.organisation && <> · {conv.organisation}</>}{conv.email && <span className="text-slate-500"> · {conv.email}</span>}
                {' · '}{conv.viaForm ? <span className="text-slate-500">through the contact form</span> : <span className="text-slate-500">to {conv.wroteTo ?? '—'}</span>}
                {conv.ref && <span className="text-slate-400"> · {conv.ref}</span>}
              </p>
              {earlier.length > 0 && (
                <div className="mt-3">
                  <button type="button" data-earlier onClick={() => setShowEarlier(v => !v)}
                    className="text-[12px] font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900">
                    {showEarlier ? 'Hide earlier messages' : `Show ${earlier.length} earlier message${earlier.length === 1 ? '' : 's'}`}
                  </button>
                  {showEarlier && (
                    <ol className="mt-2 flex flex-col gap-2" data-earlier-list>
                      {earlier.map(m => <EarlierMessage key={m.id} m={m} />)}
                    </ol>
                  )}
                </div>
              )}
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] text-slate-500 mb-1">{whenLong(thread.latest.at)}{thread.latest.subject && <> · {thread.latest.subject}</>}</p>
                <div data-latest className="text-[15px] leading-[1.65] text-slate-900 whitespace-pre-wrap break-words">
                  {thread.translated && !showOriginal ? thread.theirEnglish : thread.latest.text}
                </div>
              </div>
            </>
          )}
        </div>

        {/* c · your reply */}
        <div data-inbox-reply className="md:overflow-y-auto md:min-h-0 px-5 py-4">
          {thread && conv && reply && (
            <>
              <div className="flex items-start gap-2">
                <h2 className="min-w-0 flex-1 text-base font-black text-slate-900">Your reply · in English · you can type in it</h2>
                {!english && (
                  <button type="button" data-toggle-customer onClick={() => patch({ showCustomer: !reply.showCustomer })}
                    className="text-[12px] font-semibold px-2 py-1 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50">
                    {reply.showCustomer ? 'Hide' : 'Show'} {langName}
                  </button>
                )}
              </div>
              {!english && reply.showCustomer && (
                <div data-customer-version className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[11px] text-slate-500 mb-1">What they will receive, in {langName} (read only)</p>
                  {latestTranslation
                    ? <div className="text-[14px] leading-[1.6] text-slate-800 whitespace-pre-wrap break-words">{latestTranslation}</div>
                    : <p className="text-[13px] text-slate-600">{drafting
                      ? (reply.draft?.customer ? 'You changed the English after it was translated: Send translates the final English again first.' : 'Send translates the English first.')
                      : INBOX_WORDS.translationOff}</p>}
                </div>
              )}
              {reply.busy === 'draft' && <p className="mt-2 text-[12px] text-slate-500">Writing a draft…</p>}
              <textarea data-english value={reply.english} onChange={e => patch({ english: e.target.value })} aria-label="Your reply in English"
                placeholder="Type your reply in English." disabled={!!sent[selected!]}
                className="mt-2 w-full min-h-[330px] resize-y rounded-xl border border-slate-300 px-4 py-3 text-[15px] leading-[1.6] text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:bg-slate-50" />
              <label className="mt-3 block text-[12px] font-semibold text-slate-600" htmlFor="inbox-comment">Your comments for the AI</label>
              <textarea id="inbox-comment" data-comment value={reply.comment} onChange={e => patch({ comment: e.target.value })} rows={3}
                placeholder="e.g. mention the iPad works offline; shorter"
                className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-[14px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-300" />
              {reply.files.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {reply.files.map(f => (
                    <li key={f.storagePath} className="flex items-center gap-1 text-[12px] px-2 py-1 rounded-lg border border-slate-200 bg-slate-50">
                      📎 {f.filename} <span className="text-slate-400">{mb(f.size)}</span>
                      <button type="button" aria-label={`Remove ${f.filename}`} onClick={() => patch({ files: reply.files.filter(x => x.storagePath !== f.storagePath) })} className="ml-1 text-slate-500 hover:text-slate-900">×</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" data-update onClick={() => void updateReply()} disabled={!!reply.busy || !!sent[selected!]}
                  className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-800 bg-white hover:bg-slate-50 disabled:opacity-40">
                  {reply.busy === 'update' ? 'Rewriting…' : 'Update reply'}
                </button>
                <div className="relative">
                  <button type="button" data-attach onClick={() => setAttachOpen(v => !v)} disabled={!!reply.busy || !!sent[selected!]}
                    className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-800 bg-white hover:bg-slate-50 disabled:opacity-40">
                    {reply.busy === 'attach' ? 'Uploading…' : reply.busy === 'plans' ? 'Generating…' : 'Attach'}
                  </button>
                  {attachOpen && (
                    <div className="absolute left-0 bottom-full mb-1 z-10 bg-white border border-slate-200 rounded-lg shadow-lg p-1 flex flex-col min-w-[160px]">
                      <button type="button" onClick={() => fileRef.current?.click()} className="text-left text-[13px] px-3 py-1.5 rounded hover:bg-slate-50">A file…</button>
                      <button type="button" onClick={() => void attachPlans()} className="text-left text-[13px] px-3 py-1.5 rounded hover:bg-slate-50">Plans PDF</button>
                    </div>
                  )}
                  <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" onChange={e => void attachFiles(e.target.files)} />
                </div>
                <span data-from className="text-[12px] text-slate-500">from {thread.from}</span>
                <button type="button" data-send onClick={() => void send()} disabled={sendBlocked}
                  className="ml-auto text-sm font-bold px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-40">
                  {reply.busy === 'send' ? 'Sending…' : english ? 'Send' : `Send in ${langName}`}
                </button>
              </div>
              {!english && !canTranslate && !sent[selected!] && <p data-translation-off className="mt-2 text-[12px] text-amber-800">{INBOX_WORDS.translationOff}</p>}
              {reply.note && (
                <p data-note={reply.note.tone} className={`mt-2 text-[13px] ${reply.note.tone === 'sent' ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800' : reply.note.tone === 'error' ? 'text-red-700' : 'text-slate-600'}`}>
                  {reply.note.text}
                </p>
              )}
              {kind === 'prospect' && <p className="mt-3 text-[11px] text-slate-400">A prospect’s reply goes through the outreach send, logged in their timeline.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EarlierMessage({ m }: { m: ThreadMessage }) {
  const out = m.direction === 'out'
  return (
    <li className={`rounded-xl border px-3 py-2 ${out ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
      <p className="text-[11px] text-slate-500">{out ? 'You' : 'They'} · {whenLong(m.at)}{m.status && out && m.status !== 'sent' ? ` · ${m.status}` : ''}</p>
      <div className="mt-1 text-[14px] leading-[1.6] text-slate-800 whitespace-pre-wrap break-words">{m.english && out ? m.english : m.text}</div>
    </li>
  )
}
