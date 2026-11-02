'use client'
// components/admin/FaqTab.tsx — Admin › FAQ: the FAQ's sections and questions, written in English with live values, checked
// against every switched-on country, with private notes and "Copy feedback for Claude" (faq-1, 1 November 2026; the approved
// mockup docs/faq-1/faq-admin-mockup-v2.png; docs/faq-1-report.md §3).
//
// ── WHAT THIS PAGE IS FOR ─────────────────────────────────────────────────────────────────────────────
// public.faq_sections / faq_items hold the FAQ. This is the only way to edit them. The data arrives from /api/admin/faq
// (admin-only, service role); the browser never reads the tables. Nothing public reads them yet.
//
// ── THE CHECK AND THE PREVIEW ─────────────────────────────────────────────────────────────────────────
// lib/faq/check.ts runs here on every keystroke's text and again on the server before a publish, or before a save to a
// published question — the same code, so the page can never show green for something the server refuses. The preview line
// fills the answer for the "Preview as" country, in that country's language (faq-2): its up-to-date translation, or a plain
// note that the question is hidden there until one exists.
//
// ── THE TRANSLATION INDICATORS (faq-2, 2 November 2026 — the approved mockup's dashed parts) ─────────────────────────────
// The summary's "· 28 languages" and "all translations up to date" (or how many are translating / failed), and each question's
// "✓ Translations 28/28 up to date" · "● Translating — within the hour (n/28)" · "✕ n failed" (the reasons on hover) ·
// "○ Translates when published". Counted on the server against the CURRENT English (lib/admin/faq-actions.ts
// translationSummaries); refreshed after every save. The translator is .github/workflows/faq-translate.yml (hourly).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'
import { attemptCopy } from '@/lib/clipboard'
import ConfirmDeleteDialog from '@/components/admin/ConfirmDeleteDialog'
import { InfoTip } from '@/components/admin/CountriesTab'
import { checkItem, singlePlanLabel, showInChoices, type CheckResult } from '@/lib/faq/check'
import { resolveItem, previewLocaleOf, TOKEN_HELP, type FaqWorld } from '@/lib/faq/live-values'
import { feedbackText, openNotes, type FaqItemRow, type FaqSectionRow } from '@/lib/faq/feedback'
import { publicPlans } from '@/lib/plans'
import { isEnglish } from '@/lib/i18n/locales'
import { ensureLanguage, subscribe } from '@/lib/i18n/registry'
import { previewTextOf, TRANSLATED_BASES, type TranslationSummary } from '@/lib/faq/translation'
import { MARKETING_COUNTRY } from '@/lib/marketing-country'

type Patch = Partial<Pick<FaqItemRow, 'questionEn' | 'answerEn' | 'answerSinglePlanEn' | 'showIn' | 'note' | 'noteDone'>>

async function call(method: 'GET' | 'POST', body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch('/api/admin/faq', {
    method,
    headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data: Record<string, unknown> = {}
  try { data = await res.json() } catch { /* an empty or broken body is reported by status */ }
  return { ok: res.ok, status: res.status, data }
}
const errorOf = (r: { data: Record<string, unknown> }, fallback: string) => (typeof r.data.error === 'string' ? r.data.error : fallback)

/** "Português", "Deutsch" — a language in its own words, for the Preview as menu. */
const languageName = (locale: string) => { try { const n = new Intl.DisplayNames([locale], { type: 'language' }).of(locale.slice(0, 2)) ?? locale; return n.charAt(0).toLocaleUpperCase(locale) + n.slice(1) } catch { return locale } }

/* ── one question's translation indicator ── */
function TranslationChip({ status, summary }: { status: 'published' | 'draft'; summary: TranslationSummary | undefined }) {
  if (status !== 'published') return <span className="font-semibold text-amber-700">○ Translates when published</span>
  const total = summary?.total ?? TRANSLATED_BASES.length, fresh = summary?.fresh ?? 0, failed = summary?.failed ?? []
  if (failed.length) return <span className="cursor-help font-semibold text-red-700" title={failed.map(f => `${f.locale}: ${f.reason}`).join('\n')}>✕ {failed.length} failed</span>
  if (fresh >= total) return <span className="font-semibold text-green-700">✓ Translations {fresh}/{total} up to date</span>
  return <span className="font-semibold text-amber-700">● Translating — within the hour ({fresh}/{total})</span>
}

const flagOf = (code: string) => /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : ''
const shortDate = (iso: string) => { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) } catch { return '' } }
const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position
const TOKEN_SPLIT = /(\{[^{}]*\})/g

/* ── the text with its live values picked out, as the mockup shows them (at rest) ── */
function TokenText({ text, placeholder }: { text: string; placeholder: string }) {
  if (!text.trim()) return <span className="text-slate-400">{placeholder}</span>
  return <>{text.split(TOKEN_SPLIT).map((part, i) => /^\{[^{}]*\}$/.test(part)
    ? <code key={i} className="mx-0.5 rounded bg-orange-50 px-1 py-0.5 font-mono text-[0.85em] text-orange-700">{part}</code>
    : <span key={i}>{part}</span>)}</>
}

/* ── an answer box: the highlighted text at rest; a plain textarea while editing (saved on blur) ──
 * While editing, a mirror behind the transparent textarea colours the tokens in the SAME font, so the caret and the colour
 * always line up; the chips (a different font) are only drawn at rest. */
function TokenField({ value, onChange, onCommit, placeholder, label, openSignal, big }: {
  value: string; onChange: (v: string) => void; onCommit: () => void; placeholder: string; label: string; openSignal?: number; big?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  // "Add an answer for those countries" opens this box: a new signal opens it (state adjusted during render, not in an effect).
  // Starts unset, so a box that first appears BECAUSE of the link (the single-plan answer) opens at once.
  const [signal, setSignal] = useState<number | undefined>(undefined)
  if (openSignal !== signal) { setSignal(openSignal); if (openSignal) setEditing(true) }
  useEffect(() => { if (editing) { const a = area.current; a?.focus(); a?.setSelectionRange(a.value.length, a.value.length) } }, [editing])
  const box = `w-full rounded-lg border border-slate-200 bg-white px-3 py-2 ${big ? 'text-base' : 'text-sm'} leading-relaxed text-slate-900 whitespace-pre-wrap break-words`
  if (!editing) {
    return (
      <button type="button" aria-label={`Edit ${label}`} onClick={() => setEditing(true)}
        className={`${box} block min-h-[2.75rem] cursor-text text-left hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400`}>
        <TokenText text={value} placeholder={placeholder} />
      </button>
    )
  }
  return (
    <div className="relative">
      <div aria-hidden="true" className={`${box} min-h-[2.75rem] border-transparent`}>
        {value.split(TOKEN_SPLIT).map((part, i) => /^\{[^{}]*\}$/.test(part)
          ? <span key={i} className="rounded bg-orange-100 text-orange-700">{part}</span>
          : <span key={i}>{part}</span>)}{'\n'}
      </div>
      <textarea ref={area} aria-label={label} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { setEditing(false); onCommit() }}
        onKeyDown={e => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur() }}
        className={`${box} absolute inset-0 h-full resize-none overflow-hidden bg-transparent text-transparent caret-slate-900 placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200`} />
    </div>
  )
}

/* ── the check's message: its sentences, the fixes as links, and why it can't be published ── */
function CheckMessage({ check, onAddSingle, onShowOnly }: { check: CheckResult; onAddSingle: () => void; onShowOnly: (key: string) => void }) {
  const { addSingle, showOnly } = check.fixes
  const link = 'font-bold text-orange-600 underline-offset-2 hover:underline'
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">
      {check.sentences.join(' ')}{' '}
      {addSingle && <button type="button" className={link} onClick={onAddSingle}>Add an answer for those countries</button>}
      {addSingle && showOnly && ' or '}
      {showOnly && <button type="button" className={link} onClick={() => onShowOnly(showOnly.key)}>{addSingle ? 'show' : 'Show'} only where {showOnly.name} is offered</button>}
      {(addSingle || showOnly) ? ". It can't be published until one is chosen." : "It can't be published until it reads correctly in every country."}
    </div>
  )
}

/* ── one question ── */
function QuestionCard({ item, world, previewCode, busy, summary, onPatch, onPublish, onMove, onDelete, first, last }: {
  item: FaqItemRow; world: FaqWorld; previewCode: string; busy: boolean; summary: TranslationSummary | undefined
  onPatch: (patch: Patch) => Promise<string | null>; onPublish: (publish: boolean) => Promise<string | null>
  onMove: (dir: -1 | 1) => void; onDelete: () => void; first: boolean; last: boolean
}) {
  // Drafts: what is in the boxes. Each is replaced by the saved value whenever the saved value changes.
  const [q, setQ] = useState(item.questionEn)
  const [a, setA] = useState(item.answerEn)
  const [s, setS] = useState(item.answerSinglePlanEn ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const [singleOpen, setSingleOpen] = useState(false)
  const [openSingle, setOpenSingle] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A newly saved value replaces its draft — adjusted during render when the saved row changes (React's pattern for state
  // that follows a prop), so a field the save did not touch keeps what is being typed in it.
  const [seen, setSeen] = useState(item)
  if (seen !== item) {
    setSeen(item)
    if (item.questionEn !== seen.questionEn) setQ(item.questionEn)
    if (item.answerEn !== seen.answerEn) setA(item.answerEn)
    if (item.answerSinglePlanEn !== seen.answerSinglePlanEn) setS(item.answerSinglePlanEn ?? '')
    if (item.note !== seen.note) setNote(item.note ?? '')
  }
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(null), 2000); return () => clearTimeout(t) }, [saved])

  const draft = { ...item, questionEn: q, answerEn: a, answerSinglePlanEn: s.trim() ? s : null }
  const check = useMemo(() => checkItem(draft, world), [q, a, s, item.showIn, world]) // eslint-disable-line react-hooks/exhaustive-deps
  const unsaved = q !== item.questionEn || a !== item.answerEn || (s.trim() ? s : null) !== item.answerSinglePlanEn

  const save = async (patch: Patch, what: string) => {
    setError(null)
    const err = await onPatch(patch)
    if (err) setError(err); else setSaved(what)
  }
  const commit = (field: 'questionEn' | 'answerEn' | 'answerSinglePlanEn') => {
    const value = field === 'questionEn' ? q : field === 'answerEn' ? a : (s.trim() ? s : null)
    if (value === item[field]) return
    if (field === 'questionEn' && !q.trim()) { setQ(item.questionEn); setError('A question can’t be empty.'); return }
    // A published question keeps its published text until the new text reads correctly everywhere — the server refuses too.
    if (item.status === 'published' && !check.ok) { setError('Not saved: this question is published, so the published text stays until the new text reads correctly in every country.'); return }
    void save({ [field]: value }, 'Saved')
  }
  const putBack = () => { setQ(item.questionEn); setA(item.answerEn); setS(item.answerSinglePlanEn ?? ''); setError(null) }

  const country = world.countries.find(c => c.settings.countryCode === previewCode) ?? null
  // faq-2: the preview in the country's own language — an English page reads the draft (or an English variant's own row); any
  // other page its up-to-date translation, or nothing (hidden there, as on the public page).
  const locale = country?.settings.locale ?? 'en-GB'
  const picked = country ? previewTextOf(summary, locale) : null
  const previewSource = picked === 'english' ? draft : picked ? { ...draft, questionEn: picked.question ?? '', answerEn: picked.answer ?? '', answerSinglePlanEn: picked.answerSinglePlan } : null
  const preview = country && previewSource ? resolveItem(previewSource, world, country, isEnglish(locale) ? previewLocaleOf(country.settings) : locale) : null
  const choices = showInChoices(world)
  if (!choices.some(([v]) => v === item.showIn)) choices.push([item.showIn, `${item.showIn} (not offered in any switched-on country)`])
  const showSingle = singleOpen || !!item.answerSinglePlanEn || !!s
  const total = world.countries.length
  const edited = item.updatedAt !== item.createdAt

  return (
    <div className="grid gap-x-6 gap-y-4 border-t border-slate-200 px-4 py-5 first:border-t-0 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,30rem)]">
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="flex shrink-0 flex-col items-center pt-1 text-slate-300">
            <button type="button" aria-label="Move question up" disabled={busy || first} onClick={() => onMove(-1)} className="rounded px-1 leading-none hover:text-slate-600 disabled:opacity-30">↑</button>
            <span aria-hidden="true" className="leading-none">⠿</span>
            <button type="button" aria-label="Move question down" disabled={busy || last} onClick={() => onMove(1)} className="rounded px-1 leading-none hover:text-slate-600 disabled:opacity-30">↓</button>
          </div>
          <input aria-label="Question" value={q} onChange={e => setQ(e.target.value)} onBlur={() => commit('questionEn')}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 text-lg font-bold text-slate-900 hover:border-slate-200 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>

        <div className="mt-2 space-y-3 sm:pl-8">
          <TokenField value={a} onChange={setA} onCommit={() => commit('answerEn')} placeholder="Write the answer…" label="Answer" big />

          {showSingle && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{singlePlanLabel(world)}</span>
                <button type="button" className="text-xs font-semibold text-slate-400 hover:text-red-600"
                  onClick={() => { setSingleOpen(false); setS(''); if (item.answerSinglePlanEn) void save({ answerSinglePlanEn: null }, 'Saved') }}>Remove</button>
              </div>
              <TokenField value={s} onChange={setS} onCommit={() => commit('answerSinglePlanEn')} openSignal={openSingle}
                placeholder="The answer where only one plan is offered…" label="Answer where only one plan is offered" big />
            </div>
          )}

          {/* The status row. faq-2: "Translations 28/28 up to date" / "Translates when published" go at its end. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span className={`rounded-md px-2 py-0.5 text-sm font-bold ${item.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
              {item.status === 'published' ? 'Published' : 'Draft'}
            </span>
            <span className="text-slate-500">{edited ? `Edited ${shortDate(item.updatedAt)}` : 'New'}</span>
            <label className="inline-flex items-center gap-1 text-slate-500">Show in:
              <select value={item.showIn} disabled={busy} onChange={e => void save({ showIn: e.target.value }, 'Saved')}
                className="max-w-[16rem] rounded-md border border-slate-200 bg-white px-2 py-0.5 text-sm text-slate-800">
                {choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            {check.ok && (check.shownCount === 0
              ? <span className="font-semibold text-amber-700">Not shown in any switched-on country</span>
              : <span className="font-semibold text-green-700">✓ Reads correctly in all {check.shownCount} countries{check.shownCount < total ? ' where it shows' : ''}</span>)}
            <TranslationChip status={item.status} summary={summary} />
            {saved && <span className="text-xs text-slate-400" aria-live="polite">{saved}</span>}
            <span className="ml-auto flex items-center gap-3">
              {item.status === 'published'
                ? <button type="button" disabled={busy} onClick={async () => { setError(null); const e = await onPublish(false); if (e) setError(e) }} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Unpublish</button>
                : <button type="button" disabled={busy || !check.ok || unsaved} title={!check.ok ? "It can't be published until it reads correctly in every country" : unsaved ? 'Save your changes first' : undefined}
                    onClick={async () => { setError(null); const e = await onPublish(true); if (e) setError(e) }}
                    className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Publish</button>}
              <button type="button" disabled={busy} onClick={onDelete} className="text-sm font-semibold text-slate-400 hover:text-red-600">Delete</button>
            </span>
          </div>

          {!check.ok && <CheckMessage check={check}
            onAddSingle={() => { setSingleOpen(true); setOpenSingle(n => n + 1) }}
            onShowOnly={key => void save({ showIn: `plan:${key}` }, 'Saved')} />}
          {error && (
            <p role="alert" className="text-sm font-semibold text-red-700">{error}{unsaved && item.status === 'published' && <> <button type="button" onClick={putBack} className="underline">Put back the published text</button></>}</p>
          )}

          {country && !preview && (
            <p className="text-sm text-slate-500"><span>{country.settings.name} preview: </span>
              <span className="italic">no up-to-date {languageName(locale)} translation yet, so it is hidden on {country.settings.name}&rsquo;s page{item.status === 'published' ? ' until the next translation run' : ' (it is translated once published)'}</span></p>
          )}
          {country && preview && (
            <p className="text-sm text-slate-500">
              <span>{country.settings.name} preview: </span>
              {!preview.shown
                ? <span className="italic">not shown in {country.settings.name}</span>
                : <span className={preview.problems.length ? 'text-red-700' : 'text-slate-800'}>{preview.text || <span className="italic text-slate-400">(no answer yet)</span>}</span>}
              {preview.shown && picked !== 'english' && unsaved && <span className="text-slate-400"> (the translation of the saved text)</span>}
              {preview.shown && preview.omitted.length > 0 && <span className="text-blue-700"> ({preview.omitted.map(t => `{${t}}`).join(', ')} left out: the iPad and Android apps aren&rsquo;t in {country.settings.name}&rsquo;s stores)</span>}
            </p>
          )}
        </div>
      </div>

      {/* MY NOTES — private; only "Copy feedback for Claude" sends them anywhere. */}
      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">My notes</span>
          <label className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={item.noteDone} disabled={busy} onChange={e => void save({ noteDone: e.target.checked }, 'Saved')} className="h-4 w-4" />Done
          </label>
        </div>
        <textarea aria-label="My notes" value={note} rows={4} placeholder="Add a note…"
          onChange={e => setNote(e.target.value)}
          onBlur={() => { const v = note.trim() ? note : null; if (v !== item.note) void save({ note: v }, 'Saved') }}
          className={`w-full resize-y rounded-lg border px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-200 ${
            item.noteDone ? 'border-slate-200 bg-orange-50/40 text-slate-400' : note.trim() ? 'border-orange-200 bg-orange-50 text-slate-800' : 'border-slate-200 bg-white text-slate-800'}`} />
      </div>
    </div>
  )
}

export default function FaqTab() {
  const [sections, setSections] = useState<FaqSectionRow[]>([])
  const [items, setItems] = useState<FaqItemRow[]>([])
  const [world, setWorld] = useState<FaqWorld | null>(null)
  const [translations, setTranslations] = useState<Record<string, TranslationSummary>>({})
  // Re-render when a language's words arrive (the preview's live values in that language).
  const [, setWordsVersion] = useState(0)
  useEffect(() => subscribe(() => setWordsVersion(v => v + 1)), [])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [previewCode, setPreviewCode] = useState(MARKETING_COUNTRY)
  const [busy, setBusy] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; label: string; body: ReactNode; run: () => Promise<void> } | null>(null)

  useEffect(() => {
    let cancelled = false
    call('GET').then(r => {
      if (cancelled) return
      if (!r.ok) { setLoadError(errorOf(r, 'The FAQ could not be loaded.')); return }
      setSections(r.data.sections as FaqSectionRow[]); setItems(r.data.items as FaqItemRow[])
      setTranslations((r.data.translations ?? {}) as Record<string, TranslationSummary>)
      const w = r.data.world as FaqWorld
      setWorld(w)
      if (!w.countries.some(c => c.settings.countryCode === MARKETING_COUNTRY) && w.countries[0]) setPreviewCode(w.countries[0].settings.countryCode)
    }).catch(() => { if (!cancelled) setLoadError('The FAQ could not be loaded.') })
    return () => { cancelled = true }
  }, [])
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(null), 2500); return () => clearTimeout(t) }, [copied])
  // The preview country's language words (plan names, the apps sentence) — loaded in the browser only when asked for.
  const previewLocale = world?.countries.find(c => c.settings.countryCode === previewCode)?.settings.locale
  useEffect(() => { if (previewLocale && !isEnglish(previewLocale)) void ensureLanguage(previewLocale) }, [previewLocale])
  /** faq-2: after a save, the indicators again (an English edit makes every translation of it out of date). */
  const refreshTranslations = () => { void call('GET').then(r => { if (r.ok) setTranslations((r.data.translations ?? {}) as Record<string, TranslationSummary>) }).catch(() => {}) }

  /** A structural action (sections, moves, deletes, new question): the reply is the whole list. */
  const act = async (body: Record<string, unknown>): Promise<string | null> => {
    setBusy(true); setPageError(null)
    try {
      const r = await call('POST', body)
      if (!r.ok) { const e = errorOf(r, 'That could not be saved.'); setPageError(e); return e }
      setSections(r.data.sections as FaqSectionRow[]); setItems(r.data.items as FaqItemRow[])
      refreshTranslations()
      return null
    } catch { setPageError('That could not be saved.'); return 'That could not be saved.' }
    finally { setBusy(false) }
  }
  /** A question's own save: the reply is that question. */
  const itemCall = async (body: Record<string, unknown>): Promise<string | null> => {
    try {
      const r = await call('POST', body)
      if (!r.ok) return errorOf(r, 'That could not be saved.')
      const saved = r.data.item as FaqItemRow
      setItems(prev => prev.map(i => (i.id === saved.id ? saved : i)))
      refreshTranslations()
      return null
    } catch { return 'That could not be saved.' }
  }

  const checks = useMemo(() => (world ? new Map(items.map(i => [i.id, checkItem(i, world)])) : new Map<string, CheckResult>()), [items, world])
  if (loadError) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{loadError}</p>
  if (!world) return <p className="text-sm text-slate-500">Loading the FAQ…</p>

  const sortedSections = [...sections].sort(byPosition)
  const itemsOf = (sid: string) => items.filter(i => i.sectionId === sid).sort(byPosition)
  const published = items.filter(i => i.status === 'published').length
  const pubItems = items.filter(i => i.status === 'published')
  const failedTr = pubItems.filter(i => (translations[i.id]?.failed.length ?? 0) > 0).length
  const translating = pubItems.filter(i => !(translations[i.id]?.failed.length) && (translations[i.id]?.fresh ?? 0) < TRANSLATED_BASES.length).length
  const failing = [...checks.values()].filter(c => !c.ok).length
  const notes = openNotes(items)
  // The heading's example token is the highlighted plan's price — read from the data, never typed.
  const plans = publicPlans(world.catalog)
  const example = `{${(plans.find(p => p.isHighlighted) ?? plans[0])?.key ?? 'K'}.price}`
  const lastSection = sortedSections[sortedSections.length - 1]
  const offFeatures = [...new Set(world.catalog.features.filter(f => !f.enabled).map(f => f.feature))]
  const chip = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm'

  const copyFeedback = () => {
    // attemptCopy is called FIRST, in the click's own tick (lib/clipboard.ts: Safari drops the gesture after an await).
    void attemptCopy(feedbackText(sortedSections, items, world, MARKETING_COUNTRY)).then(r => setCopied(r === 'copied' ? `Copied ${notes} ${notes === 1 ? 'note' : 'notes'}` : 'Copy failed — your browser blocked the clipboard'))
  }

  return (
    <div className="space-y-5">
      {/* ── the heading and its controls ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="inline-flex items-center text-2xl font-black text-slate-900">FAQ
            <InfoTip label="live values">
              <p className="mb-1 font-semibold">Live values you can type in an answer</p>
              {TOKEN_HELP.map(([t, d]) => <p key={t}><code className="font-mono text-orange-300">{t}</code> — {d}</p>)}
              <p className="mt-1 text-slate-300">K is a plan key: {plans.map(p => p.key).join(', ')}. F is a feature key{offFeatures.length ? `, e.g. ${offFeatures.join(', ')}` : ''}.</p>
            </InfoTip>
          </h2>
          <p className="mt-1 max-w-4xl text-sm text-slate-600">
            You write in English. Answers use live values like <code className="rounded bg-orange-50 px-1 font-mono text-orange-700">{example}</code>, so every country sees its own prices. Publishing translates into every language automatically. Notes are private and only go out with &ldquo;Copy feedback&rdquo;.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${chip} font-semibold text-slate-800`}>Preview as:
            <select value={previewCode} onChange={e => setPreviewCode(e.target.value)} className="bg-transparent font-semibold focus:outline-none">
              {[...world.countries].sort((x, y) => x.settings.name.localeCompare(y.settings.name)).map(c => (
                <option key={c.settings.countryCode} value={c.settings.countryCode}>{flagOf(c.settings.countryCode)} {c.settings.name} · {languageName(c.settings.locale)}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => setAdding('')} className={`${chip} font-bold text-slate-800 hover:bg-slate-50`}>+ Section</button>
          <button type="button" disabled={busy || !lastSection} title={lastSection ? `Adds a question at the end of “${lastSection.titleEn}”` : 'Add a section first'}
            onClick={() => lastSection && void act({ action: 'item.create', sectionId: lastSection.id })}
            className={`${chip} font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40`}>+ Question</button>
          <button type="button" onClick={copyFeedback} disabled={notes === 0}
            className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">Copy feedback for Claude ({notes})</button>
        </div>
      </div>
      {copied && <p aria-live="polite" className="text-sm font-semibold text-slate-600">{copied}</p>}
      {pageError && <p role="alert" className="text-sm font-semibold text-red-700">{pageError}</p>}

      {/* ── the summary, counted from the data (faq-2: the languages, and the translations' state) ── */}
      <div className="flex flex-wrap gap-2">
        <span className={chip}>🌍 <b>{world.countries.length}</b> countries · <b>{TRANSLATED_BASES.length}</b> languages</span>
        {failedTr === 0 && translating === 0
          ? <span className={`${chip} font-semibold text-green-700`}>✓ {published} published{published ? ', all translations up to date' : ''}</span>
          : <span className={`${chip} font-semibold text-green-700`}>✓ {published} published
              {translating > 0 && <span className="text-amber-700"> · ● {translating} translating</span>}
              {failedTr > 0 && <span className="text-red-700"> · ✕ {failedTr} with failed translations</span>}</span>}
        {failing > 0
          ? <span className={`${chip} font-semibold text-amber-700`}>● {failing} {failing === 1 ? 'question needs' : 'questions need'} an answer for some countries</span>
          : <span className={`${chip} font-semibold text-green-700`}>✓ Every question reads correctly in every country</span>}
      </div>

      {adding !== null && (
        <form className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"
          onSubmit={async e => { e.preventDefault(); if (!adding.trim()) return; if (!(await act({ action: 'section.create', title: adding }))) setAdding(null) }}>
          <input autoFocus aria-label="New section name" placeholder="Section name" value={adding} onChange={e => setAdding(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-orange-400 focus:outline-none" />
          <button type="submit" disabled={busy || !adding.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-40">Add section</button>
          <button type="button" onClick={() => setAdding(null)} className="text-sm font-semibold text-slate-500">Cancel</button>
        </form>
      )}

      {sortedSections.length === 0 && <p className="text-sm text-slate-500">No sections yet. Add one with + Section.</p>}

      {sortedSections.map((s, si) => {
        const list = itemsOf(s.id)
        return (
          <section key={s.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100/70 px-4 py-3 sm:px-6">
              {renaming?.id === s.id ? (
                <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={async e => { e.preventDefault(); if (!(await act({ action: 'section.rename', id: s.id, title: renaming.title }))) setRenaming(null) }}>
                  <input autoFocus aria-label="Section name" value={renaming.title} onChange={e => setRenaming({ id: s.id, title: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Escape') setRenaming(null) }}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm font-bold uppercase tracking-wider focus:border-orange-400 focus:outline-none" />
                  <button type="submit" disabled={busy} className="text-sm font-bold text-slate-800">Save</button>
                  <button type="button" onClick={() => setRenaming(null)} className="text-sm text-slate-500">Cancel</button>
                </form>
              ) : (
                <h3 className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.15em] text-slate-600"><span aria-hidden="true" className="text-slate-400">⠿</span>{s.titleEn}</h3>
              )}
              <div className="flex items-center gap-1 text-sm text-slate-500">
                <button type="button" disabled={busy} onClick={() => setRenaming({ id: s.id, title: s.titleEn })} className="hover:text-slate-900">Rename</button>
                <span aria-hidden="true">·</span>
                <button type="button" aria-label={`Move ${s.titleEn} up`} disabled={busy || si === 0} onClick={() => void act({ action: 'section.move', id: s.id, dir: -1 })} className="px-0.5 hover:text-slate-900 disabled:opacity-30">↑</button>
                <button type="button" aria-label={`Move ${s.titleEn} down`} disabled={busy || si === sortedSections.length - 1} onClick={() => void act({ action: 'section.move', id: s.id, dir: 1 })} className="px-0.5 hover:text-slate-900 disabled:opacity-30">↓</button>
                <span aria-hidden="true">·</span>
                <button type="button" disabled={busy} className="hover:text-red-600" onClick={() => setConfirm({
                  title: `Delete “${s.titleEn}”?`, label: list.length ? `Delete the section and ${list.length} ${list.length === 1 ? 'question' : 'questions'}` : 'Delete the section',
                  body: <p>{list.length ? `Its ${list.length} ${list.length === 1 ? 'question goes' : 'questions go'} with it, notes included.` : 'It has no questions.'} This can&rsquo;t be undone.</p>,
                  run: async () => { const e = await act({ action: 'section.delete', id: s.id }); if (e) throw new Error(e) },
                })}>Delete</button>
              </div>
            </div>
            {list.length === 0 && <p className="px-6 py-4 text-sm text-slate-400">No questions in this section yet.</p>}
            {list.map((i, ii) => (
              <QuestionCard key={i.id} item={i} world={world} previewCode={previewCode} busy={busy} summary={translations[i.id]}
                first={si === 0 && ii === 0} last={si === sortedSections.length - 1 && ii === list.length - 1}
                onPatch={patch => itemCall({ action: 'item.update', id: i.id, patch })}
                onPublish={on => itemCall({ action: on ? 'item.publish' : 'item.unpublish', id: i.id })}
                onMove={dir => void act({ action: 'item.move', id: i.id, dir })}
                onDelete={() => setConfirm({
                  title: 'Delete this question?', label: 'Delete the question',
                  body: <p>&ldquo;{i.questionEn}&rdquo;{i.note?.trim() ? ' and its note' : ''} will be deleted. This can&rsquo;t be undone.</p>,
                  run: async () => { const e = await act({ action: 'item.delete', id: i.id }); if (e) throw new Error(e) },
                })} />
            ))}
          </section>
        )
      })}

      {confirm && (
        <ConfirmDeleteDialog title={confirm.title} confirmLabel={confirm.label} onCancel={() => setConfirm(null)}
          onConfirm={async () => { await confirm.run(); setConfirm(null) }}>
          {confirm.body}
        </ConfirmDeleteDialog>
      )}
    </div>
  )
}
