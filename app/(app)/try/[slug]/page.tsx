'use client'
// app/try/[slug]/page.tsx — demo-2 (30 October 2026, docs/demo-2-report.md): THE DEMO WALKTHROUGH.
// Where a finished demo build lands, where the emailed link points and where an outreach link (/demo/<ref>) redirects.
// 🔴 KEYED ON THE SLUG, NEVER THE DASHBOARD TOKEN: the slug is already public in the customer order page's address; the
// token is the demo's full credential and never appears in this URL, in this page's state or in any analytics event.
// The whole experience lives in components/demo/DemoWalkthrough.tsx.
import { use } from 'react'
import { DemoWalkthrough } from '@/components/demo/DemoWalkthrough'

export default function TryDemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <DemoWalkthrough slug={decodeURIComponent(slug)} />
}
