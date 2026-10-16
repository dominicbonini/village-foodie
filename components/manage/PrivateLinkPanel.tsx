'use client'

// components/manage/PrivateLinkPanel.tsx — the private link, its QR code, and the printed cards.
//
// 🔴 ONE PANEL, REACHED FROM TWO PLACES: the Events list's "Link & QR" button and the dashboard's
// "This event" card. Both render this; neither has its own copy of a QR code or a print sheet.
//
// ⚠️ THE QR LIBRARY IS THE ONE THIS PRODUCT ALREADY USES. `qrcode` (package.json) through
// `lib/generateQRCode.ts`'s `generateQRWithLogo` — the same function the customer-facing QR modal and
// the Settings poster call, so the truck's logo lands in the middle of this code exactly as it does
// on their hatch poster. ⛔ NO NEW DEPENDENCY WAS ADDED.

import { useCallback, useEffect, useRef, useState } from 'react'
import { generateQRWithLogo } from '@/lib/generateQRCode'
/* 🔴 EVERY WORD IS A `privateEvents` MESSAGE (Language Phase 1d), in the truck's language — the panel's, the
 * confirm's and the printed cards'. The US says "right away". */
import { useT } from '@/lib/i18n/use-t'
import '@/lib/i18n/catalog/privateEvents'

export interface PrivateLinkData {
  eventId: string
  name: string | null
  linkOrdering: boolean
  token: string | null
  url: string | null
  truckName: string
  date?: string
  startTime?: string
  endTime?: string
}

/**
 * The A6 table cards, four to an A4 sheet.
 *
 * 🔴 PRINTED FROM A NEW WINDOW, NOT FROM THE DASHBOARD. `window.print()` on the dashboard would print
 * the dashboard; this writes a self-contained document whose only job is the four cards. The CSS is
 * inline for the same reason — the sheet must not depend on the app's stylesheet having loaded in a
 * window that has no app in it.
 *
 * ⚠️ `@page { margin: 0 }` AND A 2×2 GRID OF EXACT HALVES. A6 is exactly a quarter of A4, so four
 * cards at 105×148.5mm tile it with no scaling — which is what makes the QR code print at a size a
 * phone reads. A browser's default margin would shrink all four and is the single most likely cause
 * of a card that does not scan.
 * ⚠️ THE QR IS A DATA URI ALREADY IN HAND, so the print window needs no network and cannot race the
 * print dialog with an image that has not loaded.
 */
type PrivateEventsT = ReturnType<typeof useT<'privateEvents'>>

function printTableCards(d: PrivateLinkData, qrDataUrl: string, t: PrivateEventsT) {
  const title = (d.name || t('publicName')).replace(/[<>&]/g, '')
  const truck = d.truckName.replace(/[<>&]/g, '')
  const card = `
    <div class="card">
      <div class="truck">${truck}</div>
      <div class="event">${title}</div>
      <img class="qr" src="${qrDataUrl}" alt="" />
      <div class="scan">${t('cards.scan')}</div>
      <div class="blurb">${t('cards.blurb')}</div>
      <div class="foot">${t('cards.footer')}</div>
    </div>`
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${t('cards.printTitle', { truck })}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
           width: 210mm; height: 297mm; }
  .card { display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 8mm 6mm; border: 0.3mm dashed #cbd5e1; }
  .truck { font-size: 13pt; font-weight: 700; color: #0f172a; }
  .event { margin-top: 1.5mm; font-size: 10pt; color: #475569; }
  .qr { width: 52mm; height: 52mm; margin: 4mm 0 3mm; }
  .scan { font-size: 12pt; font-weight: 700; color: #0f172a; }
  .blurb { margin-top: 2mm; font-size: 8.5pt; line-height: 1.35; color: #64748b; max-width: 72mm; }
  .foot { margin-top: 4mm; font-size: 7pt; letter-spacing: 0.04em; text-transform: uppercase; color: #94a3b8; }
</style></head>
<body><div class="sheet">${card}${card}${card}${card}</div>
<script>window.onload = function () { window.print() }</script>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
}

export function PrivateLinkPanel({
  data, logoUrl, onReplaced, editable = true,
}: {
  data: PrivateLinkData
  logoUrl?: string | null
  /** Called with the new link after "Make a new link" succeeds, so the caller can refresh. */
  onReplaced?: (next: { token: string; url: string }) => void
  editable?: boolean
}) {
  const t = useT('privateEvents')
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* 🔴 REDRAWN WHENEVER THE URL CHANGES, which is what makes "Make a new link" visibly take effect:
   * the code on screen is the new one before the operator can print the old one.
   * ⚠️ `live` GUARDS THE SET — generating a QR is async, and a replace mid-flight must not land the
   * previous code over the new URL. */
  /* ⚠️ THE CLEAR IS INSIDE THE ASYNC BRANCH, NOT BEFORE IT. An early `setQr(null)` in the effect body
   * is a synchronous setState during render-commit, which the React Compiler's `set-state-in-effect`
   * rule refuses — and it is right to: it causes a second render every time the url changes. One
   * async path that always ends in exactly one set has the same effect and no extra pass. */
  useEffect(() => {
    let live = true
    ;(async () => {
      if (!data.url) { if (live) setQr(null); return }
      try {
        const png = await generateQRWithLogo(data.url, logoUrl ?? null, 600)
        if (live) setQr(png)
      } catch { if (live) setQr(null) }
    })()
    return () => { live = false }
  }, [data.url, logoUrl])

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current) }, [])

  const copy = useCallback(async () => {
    if (!data.url) return
    try {
      await navigator.clipboard.writeText(data.url)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1800)
    } catch { /* A clipboard refusal is not an error worth a banner — the link is on screen to select. */ }
  }, [data.url])

  const download = useCallback(() => {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr
    /* The file name says which event it is, so a truck with three private bookings in a week does not
     * end up with qr-code(2).png. */
    a.download = `${(data.name || t('publicName')).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`
    a.click()
  }, [qr, data.name, t])

  /** ⛔ CONFIRMED FIRST, AND THE CONFIRM NAMES THE PAPER. See `privateEvents.link.newLinkConfirm`. */
  const makeNewLink = useCallback(async () => {
    if (!editable || busy) return
    if (!window.confirm(t('link.newLinkConfirm'))) return
    setBusy(true); setErr(null)
    try {
      const token = window.location.pathname.split('/')[2] || ''
      const r = await fetch('/api/manage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'private_new_link', id: data.eventId }),
      })
      const j = await r.json()
      if (!r.ok || !j?.ok) { setErr(j?.error || t('link.newLinkFailed')); return }
      onReplaced?.({ token: String(j.token), url: String(j.url) })
    } catch {
      setErr(t('link.newLinkFailed'))
    } finally {
      setBusy(false)
    }
  }, [editable, busy, data.eventId, onReplaced, t])

  /* ── ORDERING BY LINK IS OFF: there is no link, and saying so is the whole panel ──────────────── */
  if (!data.linkOrdering || !data.url) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-900">{t('link.title')}</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{t('link.offNotice')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-purple-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{t('link.title')}</h3>
      {data.name && <p className="mt-0.5 text-xs text-slate-500">{data.name}</p>}

      <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI generated in the browser;
            next/image cannot optimise one and would only add a loader in front of it. */}
        {qr && <img src={qr} alt="" className="h-36 w-36 shrink-0 rounded-lg border border-slate-200" />}

        <div className="min-w-0 flex-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t('link.label')}
          </label>
          <div className="mt-1 flex items-center gap-2">
            {/* 🔴 `readOnly`, NOT `disabled`: the operator must be able to select the text by hand when
                the clipboard is refused, which a disabled input forbids. */}
            <input
              readOnly
              value={data.url}
              onFocus={e => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
            />
            <button
              type="button" onClick={copy}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {copied ? t('link.copied') : t('link.copy')}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button" onClick={download} disabled={!qr}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('link.qrDownload')}
            </button>
            <button
              type="button" onClick={() => qr && printTableCards(data, qr, t)} disabled={!qr}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {t('link.tableCards')}
            </button>
          </div>
        </div>
      </div>

      {/* ── 🔴 THE DESTRUCTIVE ACTION, IN ITS OWN RED-BORDERED BOX ────────────────────────────────
          It is bordered and separated because it cannot be undone in the way that matters: the cards
          already on the tables stop working, and no amount of clicking brings them back. */}
      {editable && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3">
          <button
            type="button" onClick={makeNewLink} disabled={busy}
            className="rounded-lg border border-red-400 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {busy ? t('link.working') : t('link.newLink')}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-red-800">
            {t('link.newLinkHelp')}
          </p>
          {err && <p className="mt-2 text-[11px] font-semibold text-red-700">{err}</p>}
        </div>
      )}
    </div>
  )
}
