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

// DEMO tier — /api/demo, the public "upload your menu" entry point. Neither existing tier fits: this is not
// a scraping target (STRICT) and not a cheap page read (GENERAL). Each request spends a Gemini call, runs
// 10–30s, and leaves a truck + van + event + menu + ~10 orders behind, so the cost of abuse is real money
// and real rows, not just bandwidth.
//
// 5 PER HOUR per IP. Sized to the WORST legitimate journey, not the best: upload fails → try another photo
// → that fails → pick a sample template = 3 provisions, plus headroom for a genuine retry. Anything past
// that is a loop or an attack.
//
// ⚠️ KNOWN TRADE-OFF: this is per-IP, so a café/CGNAT network shares one bucket and a second genuine
// visitor behind it can be turned away (the same shared-IP concern the GENERAL tier comment raises). Erring
// tight is the right way round here — the failure is a polite "try again shortly", whereas the failure in
// the other direction is an unbounded bill. Revisit if it ever bites a real prospect.
export const demoRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: true,
  prefix: 'vf_rl_demo',
})

// SIGNUP tier — /signup, the public self-serve account-creation endpoint. Cheaper per request than DEMO
// (no Gemini call, no seeded rows) but with a sharper edge: it SENDS AN EMAIL, and Brevo Free is a shared
// 300/day cap that stops sending SILENTLY. At the GENERAL tier's 60/min an attacker exhausts the whole
// day's transactional email in five minutes, and the first casualty is order confirmations for LIVE
// trucks. Signup abuse degrades the paying service, which is why this gets its own tier rather than
// borrowing one.
//
// ⚠️ Rate limiting is MITIGATION, not the fix. The fix for the email ceiling is Brevo Starter (see the
// infra note); this only makes the ceiling harder to hit maliciously.
//
// ── TWO DIMENSIONS, FOR TWO DIFFERENT ATTACKS ──────────────────────────────────────────────────────
// PER-IP (3/hour): sized to the worst LEGITIMATE journey — a typo'd email plus a rejected password, with
// headroom. Protects our costs and the email cap.
//
// PER-EMAIL (3/day): protects a THIRD PARTY. Without it, anyone can use our signup form to mail-bomb an
// arbitrary inbox with verification emails, and a per-IP limit does nothing to stop that (rotate the IP,
// keep the address). This is the standard vector for any unauthenticated endpoint that emails an address
// it was handed.
//
// ⚠️ SHARED-IP TRADE-OFF, and it is WORSE here than for DEMO: a turned-away demo visitor gets "try again
// shortly", a turned-away signup is a lost customer. Still erring tight — 3 attempts covers a genuine
// person twice over, and the failure is recoverable by waiting. Revisit if it ever bites a real prospect.
export const signupRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  analytics: true,
  prefix: 'vf_rl_signup',
})

export const signupEmailRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '1 d'),
  analytics: true,
  prefix: 'vf_rl_signup_email',
})
