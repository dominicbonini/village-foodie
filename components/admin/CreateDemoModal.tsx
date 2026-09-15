'use client'

// components/admin/CreateDemoModal.tsx
// The outreach "Create Demo" modal — opened FROM the prospect modal in OutreachPanel, builds a BRANDED
// demo for that prospect through /api/admin/provision-demo and shows the readable /demo/<ref> link.
//
// ── THE MODAL-ON-MODAL RULES, AND WHY EACH CHOICE ────────────────────────────────────────────────
// 1. STACKING — inline `zIndex: 95`, ABOVE the contact popout's 90, the compose window's 85 and the
//    prospect modal's z-50. Inline, never an arbitrary Tailwind value: `z-[85]` once painted the compose
//    window UNDER its parent because no rule was generated for it, and raising the number made it worse.
//    Portaled to <body>, the same rule as ScheduleEventsPopup and the contact popout.
// 2. ESCAPE — a BUBBLE-phase listener on window that closes THIS modal only. The prospect modal's own
//    Escape listener (also bubble, also on window) is GATED by a ref it owns (`createDemoOpenRef`) and
//    declines while this modal is open. 🔴 NOT a capture listener with stopPropagation: two capture
//    listeners on the same node both fire in registration order and stopPropagation does not stop a
//    sibling — that is the C15 bug already shipped between ScheduleEventsPopup and ConfirmDeleteDialog.
//    The gate needs no ordering and no propagation control: both listeners run, one acts.
//    While a build is in flight Escape is ignored — closing would lose the link the admin is waiting for.
// 3. NO NAVIGATION on success. The landing DemoModal calls window.location.assign(redirectTo); reusing it
//    would carry the admin off the outreach page. This modal stays put and renders the link, copyable.
// 4. THE UPLOAD CONTROL IS THE SHARED ONE — MenuUploadFields, the same component the landing modal and the
//    Manage importer use, so the three dropzones cannot drift.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { nativeAuthHeader } from '@/lib/native/session'
import { MenuUploadFields } from '@/components/menu/MenuUploadFields'
import { formatImageUrl } from '@/lib/image-utils'

export const CREATE_DEMO_Z_INDEX = 95
const SAMPLE_TEMPLATE_ID = 'pizza'

export interface CreateDemoProspect {
  id: string
  discovery_truck_id: string
  name: string
  logo_url: string | null
}

interface CreateDemoResult {
  publicRef: string | null
  dashboard: string
  order: string
  counts: { categories: number; items: number; orders: number }
  logoStoragePath: string | null
  logoNote: string | null
  warnings: string[]
}

export default function CreateDemoModal({ prospect, onClose, onCreated }: {
  prospect: CreateDemoProspect
  onClose: () => void
  /** Fired once, on a successful build, with the public ref (null when the server minted none). */
  onCreated?: (publicRef: string | null) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CreateDemoResult | null>(null)
  const [copied, setCopied] = useState<'public' | 'dashboard' | null>(null)
  useEffect(() => { setMounted(true) }, [])

  // Rule 2 — bubble phase, this modal only, inert while busy.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (busyRef.current) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (opts: { templateId?: string } = {}) => {
    if (busyRef.current) return
    if (!opts.templateId && !file && !text.trim()) { setError('Add a photo of the menu, paste it in, or use the sample.'); return }
    busyRef.current = true; setBusy(true); setError(null)
    try {
      const fd = new FormData()
      if (opts.templateId) fd.append('template', opts.templateId)
      else if (file) fd.append('file', file)
      else fd.append('text', text.trim())
      fd.append('discoveryTruckId', prospect.discovery_truck_id)
      const h = await nativeAuthHeader()
      const res = await fetch('/api/admin/provision-demo', { method: 'POST', body: fd, headers: h, credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) {
        setError(data.error || `Could not build the demo (${res.status})`)
        return
      }
      if (data.menu?.kind === 'failed') {
        setError(`We couldn't read that menu (${data.menu.reason}). Try a clearer photo, paste the text, or use the sample.`)
        return
      }
      const r: CreateDemoResult = {
        publicRef: data.publicRef ?? null,
        dashboard: data.urls?.dashboard ?? '',
        order: data.urls?.order ?? '',
        counts: { categories: data.counts?.categories ?? 0, items: data.counts?.items ?? 0, orders: data.counts?.orders ?? 0 },
        logoStoragePath: data.truck?.logo_storage_path ?? null,
        logoNote: typeof data.logoNote === 'string' ? data.logoNote : null,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      }
      setResult(r)
      onCreated?.(r.publicRef)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server')
    } finally {
      busyRef.current = false; setBusy(false)
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = result?.publicRef ? `${origin}/demo/${result.publicRef}` : null
  const dashboardUrl = result?.dashboard ? `${origin}${result.dashboard}` : null
  const copy = async (which: 'public' | 'dashboard', value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(which); setTimeout(() => setCopied(null), 1500) } catch { /* noop */ }
  }
  const logoSrc = formatImageUrl(prospect.logo_url, 'logos')

  if (!mounted) return null
  return createPortal(
    <div style={{ zIndex: CREATE_DEMO_Z_INDEX }} className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="create-demo-title"
        className="bg-white rounded-2xl w-full max-w-lg flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 flex-shrink-0">
          {logoSrc
            ? <img src={logoSrc} alt="" className="w-9 h-9 rounded-lg object-contain p-0.5 bg-slate-100 flex-shrink-0" />
            : <div className="w-9 h-9 rounded-lg bg-slate-100 flex-shrink-0" />}
          <div className="min-w-0">
            <h3 id="create-demo-title" className="text-base font-semibold text-slate-900 truncate">Create demo · {prospect.name}</h3>
            <p className="text-xs text-slate-500">Branded with their name{prospect.logo_url ? ' and logo' : ''} · lives 30 days · Settings are yours to change</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close"
            className="ml-auto text-sm font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40">✕ Close</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {result ? (
            <div className="space-y-4">
              <p className="text-sm text-emerald-700 font-semibold">Demo built — {result.counts.items} items in {result.counts.categories} categories, {result.counts.orders} orders on the board.</p>
              {publicUrl ? (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Send them this link</label>
                  <div className="flex gap-2">
                    <input readOnly value={publicUrl} onFocus={e => e.currentTarget.select()}
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 font-mono" />
                    <button type="button" onClick={() => copy('public', publicUrl)}
                      className="text-sm font-semibold px-3 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600">{copied === 'public' ? 'Copied' : 'Copy'}</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-700">No readable link was minted — use the dashboard link below.</p>
              )}
              {dashboardUrl && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Dashboard (open to set auto-accept, capacity…)</label>
                  <div className="flex gap-2">
                    <input readOnly value={dashboardUrl} onFocus={e => e.currentTarget.select()}
                      className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 font-mono" />
                    <button type="button" onClick={() => copy('dashboard', dashboardUrl)}
                      className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">{copied === 'dashboard' ? 'Copied' : 'Copy'}</button>
                    <a href={dashboardUrl} target="_blank" rel="noreferrer"
                      className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">Open ↗</a>
                  </div>
                </div>
              )}
              {/* 🔴 AN UNBRANDED DEMO SAYS SO, AND SAYS WHY, WITHOUT BEING OPENED. This was a grey
                  one-liner with the REASON hidden in the collapsed "Notes" list below it; a demo went
                  out unbranded and the only evidence was a disclosure triangle nobody had reason to
                  click. Amber, and it names the cause. */}
              {!result.logoStoragePath && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                  <p className="text-xs font-bold text-amber-900">This demo is unbranded — no logo was copied.</p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    {result.logoNote ?? 'No logo was available for this prospect.'}{' '}
                    The QR shows the “Your logo here” plate. Set a logo on the prospect and create the demo again.
                  </p>
                </div>
              )}
              {result.warnings.length > 0 && (
                <details className="text-xs text-slate-500"><summary className="cursor-pointer">Notes ({result.warnings.length})</summary>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <MenuUploadFields file={file} onFile={setFile} text={text} onText={setText} disabled={busy} accent="app" />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => submit()} disabled={busy}
                  className="text-sm font-semibold px-4 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
                  {busy ? 'Building… (up to a minute)' : 'Build the demo'}
                </button>
                <button type="button" onClick={() => submit({ templateId: SAMPLE_TEMPLATE_ID })} disabled={busy}
                  className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Use the sample pizza menu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
