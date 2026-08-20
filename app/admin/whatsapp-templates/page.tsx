// app/admin/whatsapp-templates/page.tsx
// 🔴 ADMIN ONLY. A PLAIN SURFACE FOR ONE JOB: being filmed creating a WhatsApp message template.
//
// Meta's Tech Provider app review asks for a video of OUR app creating a template. Everything on this
// page serves that: the preflight is visible before anything is pressed, every failure is shown in full
// rather than summarised, and Meta's raw response is on screen so a rejected attempt can be diagnosed
// from the recording itself.
//
// ── ✅ THE EXISTING ADMIN PATTERN ──────────────────────────────────────────────────────────────────
// Same as app/admin/page.tsx: a client component that carries `nativeAuthHeader()` on every fetch (the
// native app sends its Supabase session as a Bearer; on web it is `{}` and the cookie does the work),
// with the REAL gate on the server in app/api/admin/whatsapp-templates/route.ts via `verifyAdmin`. A
// non-admin loading this URL sees the error this page renders, because the API refuses them — the page
// itself is a shell and holds no authority, exactly as the existing admin console does not.
//
// ⚠️ NOT LINKED FROM THE ADMIN CONSOLE, DELIBERATELY. Adding a link means editing app/admin/page.tsx —
// 1,700 lines carrying the live plan, trial and feature-override controls. The risk of touching it is
// not worth a nav item on a tool that will be opened by URL a handful of times. Navigate to
// /admin/whatsapp-templates directly.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { nativeAuthHeader } from '@/lib/native/session'

interface ConfigStatus {
  wabaIdPresent: boolean
  accessTokenPresent: boolean
  graphApiVersion: string
  graphBaseUrl: string
  missing: string[]
}

interface TemplateRow {
  id: string | null
  name: string
  status: string | null
  category: string | null
  language: string | null
}

const CATEGORIES = ['UTILITY', 'MARKETING', 'AUTHENTICATION'] as const

export default function WhatsAppTemplatesPage() {
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listRaw, setListRaw] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // ⚠️ UTILITY IS THE DEFAULT CATEGORY. An order-related notification is a utility message, and it is
  // the honest category for what this product would actually send. Picking MARKETING for a review demo
  // would be demonstrating a message we do not intend to send.
  const [name, setName] = useState('order_ready_notification')
  const [language, setLanguage] = useState('en_GB')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('UTILITY')
  const [bodyText, setBodyText] = useState(
    'Hi {{1}}, your order at {{2}} is ready to collect. Thanks for ordering ahead!',
  )
  const [examplesText, setExamplesText] = useState('Sarah, Pizzeria Gusto')
  const [creating, setCreating] = useState(false)
  const [createMessage, setCreateMessage] = useState<string | null>(null)
  const [createOk, setCreateOk] = useState<boolean | null>(null)
  const [createRaw, setCreateRaw] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/whatsapp-templates?section=config', {
        headers: await nativeAuthHeader(),
      })
      const data = await res.json()
      if (!res.ok) { setListError(data.error || `Request failed (${res.status})`); return }
      setConfig(data.config ?? null)
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => { void loadConfig() }, [loadConfig])

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setListError(null)
    setListRaw(null)
    try {
      const res = await fetch('/api/admin/whatsapp-templates', { headers: await nativeAuthHeader() })
      const data = await res.json()
      if (!res.ok) { setListError(data.error || `Request failed (${res.status})`); return }
      if (data.config) setConfig(data.config)
      if (!data.ok) { setListError(data.message || 'The request failed and returned no message.'); setTemplates(null); return }
      setTemplates(data.templates ?? [])
      setListRaw(data.raw ?? null)
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const create = async () => {
    setCreating(true)
    setCreateMessage(null)
    setCreateOk(null)
    setCreateRaw(null)
    try {
      const res = await fetch('/api/admin/whatsapp-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
        body: JSON.stringify({
          name,
          language,
          category,
          bodyText,
          // Comma-separated in the box, one sample per variable, in order.
          bodyExamples: examplesText.split(',').map(s => s.trim()).filter(Boolean),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateOk(false); setCreateMessage(data.error || `Request failed (${res.status})`); return }
      setCreateOk(data.ok === true)
      setCreateMessage(data.message || (data.ok ? 'Created.' : 'The request failed and returned no message.'))
      setCreateRaw(data.raw ?? (data.error?.raw ?? null))
      if (data.ok) void loadTemplates()
    } catch (e) {
      setCreateOk(false)
      setCreateMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const notConfigured = !!config && config.missing.length > 0

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>WhatsApp message templates</h1>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        Admin only. Uses the platform WhatsApp Business Account and the platform access token. No truck
        is involved and nothing is stored.
      </p>

      {/* ── PREFLIGHT ── it renders before anything is pressed, on purpose. */}
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Configuration</h2>
        {!config && <p style={{ fontSize: 13, color: '#64748b' }}>Checking…</p>}
        {config && (
          <ul style={{ fontSize: 13, lineHeight: 1.8, listStyle: 'none', padding: 0, margin: 0 }}>
            <li>
              META_WHATSAPP_BUSINESS_ACCOUNT_ID:{' '}
              <strong style={{ color: config.wabaIdPresent ? '#15803d' : '#b91c1c' }}>
                {config.wabaIdPresent ? 'present' : 'MISSING'}
              </strong>
            </li>
            <li>
              META_WHATSAPP_ACCESS_TOKEN:{' '}
              <strong style={{ color: config.accessTokenPresent ? '#15803d' : '#b91c1c' }}>
                {config.accessTokenPresent ? 'present' : 'MISSING'}
              </strong>
            </li>
            <li style={{ color: '#64748b' }}>Graph API base: {config.graphBaseUrl}</li>
          </ul>
        )}
        {notConfigured && (
          <p style={{ marginTop: 10, fontSize: 13, color: '#b91c1c' }}>
            Set {config!.missing.join(' and ')} in the hosting environment and redeploy. Nothing on this
            page can work until then. Presence is all that is checked here — a value that is present but
            wrong will fail at Meta instead, with Meta&apos;s own message shown below.
          </p>
        )}
      </section>

      {/* ── LIST ── */}
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>Existing templates</h2>
          <button
            onClick={() => void loadTemplates()}
            disabled={loading}
            style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', cursor: loading ? 'default' : 'pointer' }}
          >
            {loading ? 'Loading…' : 'Load templates'}
          </button>
        </div>
        {listError && (
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#b91c1c', background: '#fef2f2', padding: 10, borderRadius: 8 }}>
            {listError}
          </pre>
        )}
        {templates && templates.length === 0 && (
          <p style={{ fontSize: 13, color: '#64748b' }}>Meta returned no templates for this account.</p>
        )}
        {templates && templates.length > 0 && (
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#64748b' }}>
                <th style={{ padding: '4px 0' }}>Name</th><th>Status</th><th>Category</th><th>Language</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={`${t.id ?? t.name}-${t.language ?? ''}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 0' }}>{t.name}</td>
                  <td>{t.status ?? '—'}</td>
                  <td>{t.category ?? '—'}</td>
                  <td>{t.language ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {listRaw && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>Raw response from Meta</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, background: '#f8fafc', padding: 10, borderRadius: 8 }}>{listRaw}</pre>
          </details>
        )}
      </section>

      {/* ── CREATE ── */}
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Create a template</h2>

        <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
          Name — lowercase letters, digits and underscores only
        </label>
        <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} />

        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Language</label>
            <input value={language} onChange={e => setLanguage(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4 }}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as (typeof CATEGORIES)[number])} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <label style={{ display: 'block', fontSize: 12, color: '#64748b', margin: '10px 0 4px' }}>
          Body — use {'{{1}}'}, {'{{2}}'} for variables
        </label>
        <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />

        <label style={{ display: 'block', fontSize: 12, color: '#64748b', margin: '10px 0 4px' }}>
          Example values — comma separated, one per variable, in order. Required when the body has variables.
        </label>
        <input value={examplesText} onChange={e => setExamplesText(e.target.value)} style={inputStyle} />

        <button
          onClick={() => void create()}
          disabled={creating}
          style={{
            marginTop: 14, fontSize: 14, fontWeight: 600, padding: '10px 18px', borderRadius: 10,
            border: 'none', background: creating ? '#94a3b8' : '#ea580c', color: 'white',
            cursor: creating ? 'default' : 'pointer',
          }}
        >
          {creating ? 'Creating…' : 'Create template'}
        </button>

        {createMessage && (
          <pre
            style={{
              whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 12, padding: 10, borderRadius: 8,
              color: createOk ? '#15803d' : '#b91c1c',
              background: createOk ? '#f0fdf4' : '#fef2f2',
            }}
          >
            {createMessage}
          </pre>
        )}
        {createRaw && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>Raw response from Meta</summary>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, background: '#f8fafc', padding: 10, borderRadius: 8 }}>{createRaw}</pre>
          </details>
        )}
      </section>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8,
  padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
}
