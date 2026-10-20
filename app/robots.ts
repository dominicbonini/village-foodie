// app/robots.ts — serves /robots.txt, PER HOST (seo-fixes S3 + N3, 20 October 2026; docs/seo-fixes-report.md).
//
// It replaced the static public/robots.txt, which was ONE file for both brands: villagefoodie.co.uk/robots.txt pointed
// at the HatchGrab sitemap. Each host now advertises its OWN sitemap (app/sitemap.ts is host-aware too).
// ⛔ EVERY RULE IS THE STATIC FILE'S, UNCHANGED — the AI-crawler blocklist and the /api/ + /trucks/ disallows are policy
// decisions from 5 June 2026 — EXCEPT `Crawl-delay: 10`, removed on purpose (N3: Google ignores it, Bing obeyed it and
// crawled ten times slower).
import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { BRANDS } from '@/lib/brand'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'

const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Bytespider', 'FacebookBot', 'Applebot-Extended', 'Google-Extended', 'anthropic-ai']

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') ?? ''
  const origin = host.includes('hatchgrab') ? HATCHGRAB_ORIGIN : `https://${BRANDS.VILLAGE_FOODIE.domain}`
  return {
    rules: [
      ...AI_CRAWLERS.map(userAgent => ({ userAgent, disallow: '/' })),
      { userAgent: '*', disallow: ['/api/', '/trucks/'] },
    ],
    sitemap: `${origin}/sitemap.xml`,
  }
}
