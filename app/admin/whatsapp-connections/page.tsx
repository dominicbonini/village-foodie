// app/admin/whatsapp-connections/page.tsx
// 🔴 ADMIN ONLY. One table: every truck's WhatsApp credential, what state it is in, and the three
// things that can be done to it by hand.
//
// ── ✅ THE EXISTING ADMIN PATTERN ──────────────────────────────────────────────────────────────────
// Same shape as app/admin/whatsapp-templates/page.tsx: a client component carrying `nativeAuthHeader()`
// on every fetch, with the REAL gate on the server in app/api/admin/whatsapp-connections/route.ts via
// `verifyAdmin`. This page holds no authority — a non-admin who loads the URL sees the error the API
// returns, because the API refuses them.
//
// ⚠️ NOT LINKED FROM THE ADMIN CONSOLE, for the same reason the templates page is not: adding a nav
// item means editing app/admin/page.tsx, which carries the live plan, trial and feature-override
// controls. Navigate to /admin/whatsapp-connections directly.
//
// 🔴 NOTHING ON THIS PAGE EVER DISPLAYS A TOKEN, because the API never sends one. The column says
// present / absent and when it expires. That is the whole of what support needs.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'

interface ConnectionRow {
  truckId: string
  truckName: string
  wabaId: string | null
  phoneNumberId: string | null
  displayPhoneNumber: string | null
  verifiedName: string | null
  tokenPresent: boolean
  tokenIssuedAt: string | null
  tokenExpiresAt: string | null
  tokenRevokedAt: string | null
  daysLeft: number | null
  paymentMethodPresent: boolean | null
}

type Action = 'refresh_token' | 'check_token' | 'check_payment'

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB') : '—')

/** 🔴 THE HEALTH WORD IS DERIVED HERE AND NOWHERE ELSE, so two columns cannot disagree about a row. */
function health(r: ConnectionRow): { label: string; tone: string } {
  if (r.tokenRevokedAt) return { label: 'Revoked', tone: 'bg-red-100 text-red-700' }
  if (!r.tokenPresent) return { label: 'No token', tone: 'bg-slate-100 text-slate-600' }
  if (r.daysLeft === null) return { label: 'No expiry', tone: 'bg-slate-100 text-slate-600' }
  if (r.daysLeft <= 0) return { label: 'Expired', tone: 'bg-red-100 text-red-700' }
  if (r.daysLeft < 7) return { label: `${r.daysLeft}d left`, tone: 'bg-red-100 text-red-700' }
  if (r.daysLeft < 30) return { label: `${r.daysLeft}d left`, tone: 'bg-amber-100 text-amber-700' }
  return { label: `${r.daysLeft}d left`, tone: 'bg-green-100 text-green-700' }
}

export default function WhatsAppConnectionsPage() {
  const [rows, setRows] = useState<ConnectionRow[]>([])
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/whatsapp-connections', { headers: { ...(await nativeAuthHeader()) } })
      const json = await res.json()
      if (!res.ok || !json.ok) { setError(json.error || 'Failed to load'); setRows([]) }
      else { setRows(json.connections || []); setAutoRefresh(!!json.autoRefresh) }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async (truckId: string, action: Action) => {
    // ⚠️ THE ONLY CONFIRMATION ON THIS PAGE, AND ONLY FOR THE ONE ACTION THAT WRITES A LIVE CREDENTIAL.
    // The two checks are reads; making them confirm too would train the reflex that dismisses this one.
    if (action === 'refresh_token' &&
        !confirm(`Refresh the WhatsApp token for ${truckId}?\n\nThis replaces their live credential. Meta invalidates the old one.`)) return
    setBusy(`${truckId}:${action}`)
    try {
      const res = await fetch('/api/admin/whatsapp-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
        body: JSON.stringify({ action, truckId }),
      })
      const json = await res.json()
      let text: string
      if (!json.ok) text = `✗ ${json.error}`
      else if (action === 'check_payment') text = `✓ Payment method: ${json.paymentStatus}`
      else if (action === 'check_token') {
        text = json.isValid
          ? `✓ Valid${json.neverExpires ? ', never expires' : json.expiresAt ? `, expires ${fmt(json.expiresAt)}` : ''}`
          : '✗ Meta says this token is NOT valid'
      } else text = `✓ Refreshed${json.expiresIn ? ` (${Math.round(json.expiresIn / 86400)} days)` : ' (Meta returned no expiry)'}`
      setResult(prev => ({ ...prev, [truckId]: text }))
      if (json.ok && action !== 'check_token') await load()
    } catch (e) {
      setResult(prev => ({ ...prev, [truckId]: `✗ ${e instanceof Error ? e.message : 'Request failed'}` }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-slate-800">WhatsApp connections</h1>
      <p className="mt-1 text-sm text-slate-600">
        Nightly maintenance runs at 03:00 UTC. Automatic token refresh is{' '}
        <strong className={autoRefresh ? 'text-green-700' : 'text-amber-700'}>{autoRefresh ? 'on' : 'off'}</strong>.
        {/* 🔴 SAYING WHICH WAY THE FLAG IS SET IS THE POINT OF PUTTING IT HERE. Without it, "the cron
            should have handled this" is unfalsifiable from the support screen. */}
        {!autoRefresh && ' Tokens are only refreshed when someone presses the button below.'}
      </p>

      {loading && <p className="mt-6 text-sm text-slate-500">Loading…</p>}
      {error && <p className="mt-6 text-sm text-red-700">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">No WhatsApp connections yet.</p>
      )}

      {rows.length > 0 && (
        // ⚠️ THE TABLE IS THE ONE THING ALLOWED TO SCROLL SIDEWAYS, in its own container.
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Truck</th>
                <th className="py-2 pr-3">Number</th>
                <th className="py-2 pr-3">Token</th>
                <th className="py-2 pr-3">Expires</th>
                <th className="py-2 pr-3">Payment</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const h = health(r)
                return (
                  <tr key={r.truckId} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-slate-800">{r.truckName}</div>
                      <div className="text-xs text-slate-500">{r.truckId}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div>{r.displayPhoneNumber || '—'}</div>
                      <div className="text-xs text-slate-500">{r.verifiedName || ''}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${h.tone}`}>{h.label}</span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">
                      <div>{fmt(r.tokenExpiresAt)}</div>
                      <div className="text-slate-400">issued {fmt(r.tokenIssuedAt)}</div>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {/* 🔴 THREE-VALUED. null is "never asked", and it must not render as "missing". */}
                      {r.paymentMethodPresent === true ? <span className="text-green-700">Added</span>
                        : r.paymentMethodPresent === false ? <span className="text-red-700">Missing</span>
                        : <span className="text-slate-400">Not checked</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {([
                          ['check_token', 'Check token'],
                          ['check_payment', 'Check payment status'],
                          ['refresh_token', 'Refresh token now'],
                        ] as [Action, string][]).map(([a, label]) => (
                          <button
                            key={a}
                            onClick={() => { void run(r.truckId, a) }}
                            disabled={busy !== null}
                            className={`text-xs px-2 py-1 rounded border disabled:opacity-40 ${
                              a === 'refresh_token'
                                ? 'border-red-200 text-red-700 hover:bg-red-50'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                          >
                            {busy === `${r.truckId}:${a}` ? '…' : label}
                          </button>
                        ))}
                      </div>
                      {result[r.truckId] && (
                        <p className={`mt-1 text-xs ${result[r.truckId].startsWith('✓') ? 'text-green-700' : 'text-red-700'}`}>
                          {result[r.truckId]}
                        </p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
