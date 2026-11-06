// app/admin/outreach/p/[prospectId]/page.tsx — one prospect, as a page.
//
// 🔴 THE GATE IS THE SAME ONE EVERY OTHER ADMIN SURFACE USES, AND IT IS SERVER-SIDE. This file is a
// shell: it renders a client component that carries `nativeAuthHeader()` on every fetch, and the
// REAL refusal comes from `verifyAdmin` inside each route it calls. A non-admin who types this URL
// gets a page that cannot load anything — exactly as `/admin` itself behaves, and for the same
// reason (see app/admin/whatsapp-templates/page.tsx, which records the pattern).
//
// ⚠️ `/admin/outreach` ITSELF IS STILL A REDIRECT to `/admin?tab=outreach`. A nested route under it
// is unaffected by that redirect, which matches only the exact path.
import ProspectWorkspace from '@/components/admin/ProspectWorkspace'

export const dynamic = 'force-dynamic'

export default async function ProspectPage({ params }: { params: Promise<{ prospectId: string }> }) {
  const { prospectId } = await params
  return <ProspectWorkspace prospectId={prospectId} />
}
