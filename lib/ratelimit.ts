import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: true,
  prefix: 'vf_rl',
})

// STRICT tier — public bulk-scrapeable data only (/api/discovery, public /api/events). Intentionally tight
// (3/min): this is a competitor-harvest target, not an interactive flow. (Was mistakenly 60/min — same as
// general — which left the "strict" scraper tier not actually strict.)
export const strictRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '1 m'),
  analytics: true,
  prefix: 'vf_rl_strict',
})
