// app/(app)/admin/inbox/page.tsx — inbox-1 (23 November 2026): /admin/inbox is Admin's Inbox TAB, the way /admin/outreach is its Outreach
// tab. A redirect, rendered on the server before anything paints; `?c=<conversation>` is carried so "Open in Inbox" selects it.
import { redirect } from 'next/navigation'

export default async function InboxRedirect({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const c = (await searchParams).c
  const key = typeof c === 'string' && /^(enquiry|prospect|partner):[0-9a-f-]{36}$/.test(c) ? c : null
  redirect(key ? `/admin?tab=inbox&c=${encodeURIComponent(key)}` : '/admin?tab=inbox')
}
