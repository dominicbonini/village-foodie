'use client'
// components/admin/partner-outbox.ts — the Partners tab's outbox (partners-1, 5 November 2026).
//
// 🔴 THE SAME OUTBOX AS TRUCK OUTREACH (`createOutbox`, lib/outreach-outbox.ts): Send closes the window at once, the
// message is held five seconds with Undo, then posted once with the key made at the press. Only the two endpoints
// differ — the partner route — so a partner send can never reach the truck route and the truck outbox is untouched.
// ⚠️ An entry's `prospectId` holds the PARTNER id here; the outbox treats it as an opaque key.
import { nativeAuthHeader } from '@/lib/native/session'
import { createOutbox, type Outbox } from '@/lib/outreach-outbox'

let shared: Outbox | null = null
export function getPartnerOutbox(): Outbox {
  if (shared) return shared
  shared = createOutbox({
    post: async body => {
      const r = await fetch('/api/admin/partners/mail-send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...await nativeAuthHeader() }, body: JSON.stringify(body),
      })
      return (await r.json().catch(() => ({ ok: false, refusal: `The server answered ${r.status}.` }))) as Record<string, unknown>
    },
    check: async (partnerId, rowId) => {
      const r = await fetch(`/api/admin/partners/mail-send?partner_id=${encodeURIComponent(partnerId)}`, { headers: { ...await nativeAuthHeader() } })
      const j = await r.json().catch(() => ({})) as { messages?: Record<string, unknown>[] }
      return (j.messages ?? []).find(m => m.id === rowId) ?? null
    },
    setTimer: (fn, ms) => window.setTimeout(fn, ms),
    clearTimer: h => window.clearTimeout(h as number),
  })
  return shared
}
