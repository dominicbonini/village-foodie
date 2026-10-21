// app/robots.ts — serves /robots.txt, PER HOST (seo-fixes S3 + N3, 20 October 2026; docs/seo-fixes-report.md).
//
// It replaced the static public/robots.txt, which was ONE file for both brands: villagefoodie.co.uk/robots.txt pointed
// at the HatchGrab sitemap. Each host now advertises its OWN sitemap (app/sitemap.ts is host-aware too).
// ⛔ The Village Foodie host's rules are the static file's, unchanged — the AI-crawler blocklist and the /api/ + /trucks/
// disallows are policy decisions from 5 June 2026 — EXCEPT `Crawl-delay: 10`, removed on purpose (N3: Google ignores it,
// Bing obeyed it and crawled ten times slower).
//
// ── 🟢 ai-search-1 (21 October 2026, docs/ai-search-1-report.md): THE HATCHGRAB HOST ALLOWS THE ANSWER ENGINES ──────────────
// Dominic's decision: the AI answer/search bots AND the training bots may read HatchGrab's public marketing pages, so
// ChatGPT, Claude, Perplexity, Google and Apple can read, classify and cite them. Each agent name is checked against its
// vendor's current documentation (the report cites each page).
// 🔴 A NAMED GROUP REPLACES `*` FOR THAT BOT — Google and Bing both follow only the most specific group that names them —
// so the named group repeats every private disallow. Without that, naming a bot to allow it would open /api/ to it.
// 🔴 PRIVATE_PATHS: today's two (/api/, /trucks/) plus every token and signed-in area, for every bot. All are already
// noindex (vercel.json headers or the page's own robots meta) or behind sign-in; none is a marketing page. The unlisted
// landing preview is deliberately NOT listed — a robots.txt line would publish its address.
// ⚠️ Bytespider, FacebookBot and `anthropic-ai` keep the old `Disallow: /` — not part of this decision (anthropic-ai is a
// retired Anthropic token; its crawler is ClaudeBot, allowed below).
import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { BRANDS } from '@/lib/brand'
import { HATCHGRAB_ORIGIN } from '@/lib/marketing-country'
import { AI_CRAWLERS, ANSWER_BOTS, TRAINING_BOTS, STILL_BLOCKED, PRIVATE_PATHS } from '@/lib/robots-policy'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') ?? ''
  if (!host.includes('hatchgrab')) {
    return {
      rules: [
        ...AI_CRAWLERS.map(userAgent => ({ userAgent, disallow: '/' })),
        { userAgent: '*', disallow: ['/api/', '/trucks/'] },
      ],
      sitemap: `https://${BRANDS.VILLAGE_FOODIE.domain}/sitemap.xml`,
    }
  }
  return {
    rules: [
      { userAgent: [...ANSWER_BOTS, ...TRAINING_BOTS], allow: '/', disallow: PRIVATE_PATHS },
      ...STILL_BLOCKED.map(userAgent => ({ userAgent, disallow: '/' })),
      { userAgent: '*', disallow: PRIVATE_PATHS },
    ],
    sitemap: `${HATCHGRAB_ORIGIN}/sitemap.xml`,
  }
}
