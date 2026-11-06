// app/admin/outreach/page.tsx
// 🔴 THIS ROUTE NO LONGER HOLDS THE OUTREACH CONSOLE. It is a TAB on /admin now, and the console itself
// lives in components/admin/OutreachPanel.tsx (moved wholesale — same state, same fetches, same table).
//
// This file stays as a REDIRECT rather than being deleted, because /admin/outreach has been the console's
// address since V12.1: it is in the manual, in several reports, and in whatever bookmarks and pasted links
// exist. Deleting it would turn all of those into a 404 with no hint of where the page went.
//
// ⚠️ NOT 'use client' any more, deliberately: as a server component the redirect happens BEFORE anything
// renders, so nobody sees a flash of an empty console. It is also why there is no useRouter here.
import { redirect } from 'next/navigation'

export default function OutreachRedirect() {
  redirect('/admin?tab=outreach')
}
