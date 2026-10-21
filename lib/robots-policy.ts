// lib/robots-policy.ts — WHO MAY CRAWL WHAT, as data (ai-search-1, 21 October 2026; docs/ai-search-1-report.md). Read by
// app/robots.ts and proved by scripts/ai-search-1.cjs. Pure, no imports.

/** The 5 June 2026 blocklist — still the whole policy on the Village Foodie host. */
export const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Bytespider', 'FacebookBot', 'Applebot-Extended', 'Google-Extended', 'anthropic-ai']

/** ai-search-1: the agents the HatchGrab host explicitly allows — answer / search bots first, then training bots. */
export const ANSWER_BOTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Googlebot', 'Bingbot', 'Applebot']
export const TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot']
/** Still blocked on the HatchGrab host (unchanged from the blocklist). */
export const STILL_BLOCKED = AI_CRAWLERS.filter(a => !TRAINING_BOTS.includes(a))
/** Never crawled, by any bot: the API, the truck order pages (as before), and every token / signed-in area. */
export const PRIVATE_PATHS = ['/api/', '/trucks/', '/manage/', '/dashboard/', '/kds/', '/admin', '/o/', '/order/', '/p/', '/embed/', '/demo/', '/setup', '/auth/', '/dev/']
