// lib/inbox/open.ts — "Open in Inbox" (inbox-1, 23 November 2026). Client-safe.
// On /admin the Inbox tab is selected in place (an event the admin page and the Inbox listen for); anywhere else (a prospect's page) the
// browser goes to /admin/inbox?c=<key>, which redirects to /admin?tab=inbox&c=<key>. Either way the conversation is selected.
import { keyOf } from '@/lib/inbox/types'

export const OPEN_INBOX_EVENT = 'hg:open-inbox'
export const INBOX_COUNT_EVENT = 'hg:inbox-count'

export const inboxHref = (key: string) => `/admin/inbox?c=${encodeURIComponent(key)}`
export const prospectInboxKey = (prospectId: string) => keyOf('prospect', prospectId)
export const partnerInboxKey = (partnerId: string) => keyOf('partner', partnerId)

/** Select the conversation in the Inbox: in place on /admin, or by going there. */
export function openInInbox(key: string): void {
  if (typeof window === 'undefined') return
  if (window.location.pathname === '/admin') {
    try { window.history.pushState(null, '', `/admin?tab=inbox&c=${encodeURIComponent(key)}`) } catch { /* the event still selects it */ }
    window.dispatchEvent(new CustomEvent(OPEN_INBOX_EVENT, { detail: { key } }))
    return
  }
  window.location.assign(inboxHref(key))
}
