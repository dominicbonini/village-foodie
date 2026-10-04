'use client'
// components/manage/ScheduleSettingsModal.tsx
//
// ══ 🔴 "SCHEDULE SETTINGS" — THE TWO CARDS THAT LEFT SETTINGS › SCHEDULE ════════════════════════
//
// Opened from the "Finding events automatically" line in Schedule › Events (the ScheduleWhere board).
// It holds exactly two of the three cards that were in Settings › Schedule:
//   1. "Your schedule"      — the manual / automatic choice, the website address, and Verify
//   2. "Import exclusions"  — the terms filtered out of an import
//
// ⛔ `CustomDomainSetup` DID NOT MOVE, AND MUST NOT. It is the third card in that section, and it
// stays exactly where it was — directly above the QR code. page.tsx's comment on it says why in as
// many words: the printed QR encodes a hatchgrab.com address and resolves its destination at SCAN
// time, so once the domain setup is finished the SAME PRINTED CODE starts sending customers to the
// operator's own address. Read in that order it is obvious; separated, an operator concludes they
// need to reprint. That is a cost on printed material, and it is why this build moved two cards and
// not the section. (It is also why the earlier report recommended option (a), which Dominic chose.)
//
// ── 🔴 THE FIELDS, THE WORDING AND THE SAVES ARE UNCHANGED ──────────────────────────────────────
// The JSX below is the two cards verbatim. Every write is the same call SettingsTab made:
//   • the preference and the address → `update_truck` (the `saveSetting` shape)
//   • Verify                         → POST /api/manage/verify-schedule-url
//   • removing a term                → `remove_exclusion_term`
// Nothing here is a new save path, and the five verify messages come from lib/copy/scheduleVerify.ts
// so this file and the setup wizard cannot word a failure differently.
//
// ⚠️ IT OWNS ITS OWN STATE RATHER THAN RECEIVING IT. SettingsTab unmounts the moment the operator is
// on Schedule, so the state these cards used is not in scope here. The alternative — keeping them in
// SettingsTab and lifting a modal flag to the page — would mean Settings' entire tab stays mounted
// behind the Schedule tab, which is a much larger change than the one that was asked for.

import { useEffect, useState } from 'react'
import { Card, Btn } from './primitives'
import { normaliseUrl, isScraperBlockedDomain } from '@/lib/url-normalise'
import { URL_MALFORMED_MSG, VERIFY_MESSAGES, BLOCKED_DOMAIN_MSG } from '@/lib/copy/scheduleVerify'

export interface ScheduleSettingsTruck {
  scraper_preference?: 'auto' | 'manual' | 'both'
  schedule_url?: string | null
}

export function ScheduleSettingsModal({ token, truck, api, onTruckUpdate, onVerifySuccess, onClose }: {
  token: string
  truck: ScheduleSettingsTruck
  api: (action: string, extra?: Record<string, unknown>) => Promise<Record<string, unknown>>
  /** Keeps the page's copy of the truck fresh — the same callback SettingsTab's `saveSetting` used. */
  onTruckUpdate: (partial: Record<string, unknown>) => void
  /** Verify found events: hand them to the same approval flow Settings handed them to. */
  onVerifySuccess: (events: unknown[]) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<ScheduleSettingsTruck>({ ...truck })
  const [settingsExclusionList, setSettingsExclusionList] = useState<{ id: string; term: string }[]>([])
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  /* The same read SettingsTab did on mount. ⚠️ Failures are swallowed exactly as they were — an
   * unreadable exclusion list hides the card rather than breaking the modal. */
  /* ⚠️ NO `eslint-disable` HERE, UNLIKE SettingsTab'S COPY. The state is set inside the promise's
   * `.then()`, not in the effect body, so the rule does not fire — and an unused disable is itself a
   * lint error. */
  useEffect(() => {
    api('get_exclusion_terms').then(r => setSettingsExclusionList((r.terms as { id: string; term: string }[]) || [])).catch(() => {})
  }, [api])

  /** SettingsTab's `saveSetting`, unchanged: one `update_truck`, then the page's mirror. */
  const saveSetting = async (key: string, value: string | boolean | number | null) => {
    try {
      await api('update_truck', { data: { [key]: value } })
      onTruckUpdate({ [key]: value })
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : String(e))
    }
  }

  const isBlockedDomain = isScraperBlockedDomain

  /** SettingsTab's `handleVerifyUrl`, unchanged. */
  const handleVerifyUrl = async () => {
    const url = normaliseUrl(form.schedule_url ?? '')
    if (!url) { setVerifyError(URL_MALFORMED_MSG); return }
    if (isBlockedDomain(url)) { setVerifyError(BLOCKED_DOMAIN_MSG); return }
    setForm(p => ({ ...p, schedule_url: url }))
    setVerifying(true)
    setVerifyError(null)
    try {
      const res = await fetch('/api/manage/verify-schedule-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, url }),
      })
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      if (data.found) { onVerifySuccess((data.events as unknown[]) ?? []); return }
      const reason = String(data.reason ?? '')
      setVerifyError(VERIFY_MESSAGES[reason] || VERIFY_MESSAGES.unreachable)
    } catch {
      setVerifyError(VERIFY_MESSAGES.unreachable)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label="Schedule settings"
        data-schedule-settings-modal
        className="bg-white w-full max-w-[560px] max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-900 text-lg min-w-0 flex-1">Schedule settings</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-lg font-bold">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
    {/* Your schedule */}
    <Card className="p-4 space-y-4">
      <p className="text-base font-bold text-slate-800">Your schedule</p>
      <div className="space-y-2">
        {([
          { value: 'manual', label: "I'll add events myself" },
          { value: 'auto',   label: 'Find my events automatically',    desc: "Tell us where you post your schedule and we'll check it for you, sending any events we find for your approval. This needs to be your own website — not a Facebook or Instagram page." },
        ] as { value: 'auto' | 'manual'; label: string; desc?: string }[]).map(opt => {
          const pref = form.scraper_preference ?? 'manual'
          const selected = pref === opt.value || (opt.value === 'auto' && pref === 'both')
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setForm(p => ({ ...p, scraper_preference: opt.value }))
                saveSetting('scraper_preference', opt.value)
              }}
              className={`w-full text-left border rounded-xl p-4 transition-colors ${selected ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? 'border-orange-500' : 'border-slate-300'}`}>
                  {selected && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                  {opt.desc && <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {/* Clarifier — applies to BOTH options: found events always come for approval, nothing
          goes live until confirmed (so a "I'll add events myself" truck isn't surprised). */}
      <p className="text-xs text-slate-500">
        Either way, if we find your events listed elsewhere, we&apos;ll still send these to you for approval. Nothing goes live until you confirm it.
      </p>
      {['auto', 'both'].includes(form.scraper_preference ?? 'manual') && (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-800">Where do you post your schedule?</p>
          <div className="flex gap-2">
            <input
              type="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={form.schedule_url ?? ''}
              onChange={e => { setForm(p => ({ ...p, schedule_url: e.target.value })); setVerifyError(null) }}
              onBlur={e => {
                // N1: the blur-save normalises too, not just the Verify button. Otherwise an operator
                // who typed `www.…` and tabbed away would have the scheme-less string SAVED and later
                // handed to the scraper, which is the same failure one step further downstream.
                const raw = e.target.value.trim()
                if (!raw) { setVerifyError(null); saveSetting('schedule_url', null); return }
                const val = normaliseUrl(raw)
                if (!val) { setVerifyError(URL_MALFORMED_MSG); return }
                setForm(p => ({ ...p, schedule_url: val }))
                if (isBlockedDomain(val)) {
                  setVerifyError(BLOCKED_DOMAIN_MSG)
                } else {
                  setVerifyError(null)
                  saveSetting('schedule_url', val)
                }
              }}
              placeholder="https://yourtruck.co.uk/events"
              disabled={verifying}
              className={`flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 ${verifying ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <button
              type="button"
              onClick={handleVerifyUrl}
              disabled={!form.schedule_url?.trim() || verifying}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {verifying
                ? <><div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />Checking...</>
                : 'Verify'}
            </button>
          </div>
          {verifying && (
            <div className="mt-1 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <svg className="animate-spin h-4 w-4 text-amber-600 shrink-0 mt-0.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">Checking your website...</p>
                <p className="text-xs text-amber-700 mt-0.5">{"This can take up to 2 minutes — please keep this page open and don't close the tab."}</p>
              </div>
            </div>
          )}
          {!verifying && verifyError && <p className="text-xs text-red-500">{verifyError}</p>}
          <p className="text-xs text-slate-500">Your website where customers can see your upcoming events — not a Facebook or Instagram page</p>
        </div>
      )}
    </Card>

    {/* Import exclusions */}
    {settingsExclusionList.length > 0 && (
      <Card className="p-4 space-y-3">
        <div>
          <p className="text-base font-bold text-slate-800">Import exclusions</p>
          <p className="text-xs text-slate-500 mt-0.5">These terms are automatically filtered out when importing your schedule. Remove any that were added by mistake.</p>
        </div>
        <div className="space-y-1.5">
          {settingsExclusionList.map(item => (
            <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-sm text-slate-700">{item.term}</span>
              <button
                type="button"
                onClick={async () => {
                  if (item.id) {
                    try { await api('remove_exclusion_term', { id: item.id }) } catch { /* continue */ }
                  }
                  setSettingsExclusionList(prev => prev.filter(t => t.id !== item.id))
                }}
                className="text-slate-400 hover:text-red-600 transition-colors ml-3"
                aria-label={`Remove exclusion for ${item.term}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      </Card>
    )}
        </div>
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 flex justify-end">
          <Btn label="Done" onClick={onClose} />
        </div>
      </div>
    </div>
  )
}
