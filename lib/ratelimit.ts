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

// ── CUSTOMER-EVENTS tier — /api/events, AND ONLY /api/events ────────────────────────────────────────
// SPLIT OUT OF STRICT ON 11 AUGUST 2026, AFTER IT REFUSED REAL CUSTOMERS.
//
// ── WHAT HAPPENED ───────────────────────────────────────────────────────────────────────────────────
// /api/events shared the STRICT bucket (3/min, keyed on IP alone) with /api/discovery/*. A normal
// customer journey — order page, "change event", back — costs exactly 3, so the FOURTH request in a
// minute was refused. Vercel logs for 14:53 on 11 August: EIGHT 429s in fifty seconds, all on
// /api/events, while /api/menu returned 200 throughout. The customer saw a failure card and could not
// order. The retry loop and the Retry button then spent the budget faster than it refilled.
//
// ── WHY THIS ROUTE IS NOT A SCRAPING TARGET AND STRICT WAS THE WRONG HOME ───────────────────────────
// /api/events?truck=<slug> returns ONE truck's next 50 events. Anyone harvesting the schedule wholesale
// uses /api/discovery/events, which returns every truck in one call and STAYS on STRICT at 3/min. To
// harvest via this route you would need the slug list first — which the discovery feed already gives you
// — so the marginal scraping value here is close to zero, while the cost of refusing is a customer who
// cannot order. The governing principle: a scraper getting through is an acceptable cost; a customer who
// cannot order is not.
//
// ── SO THIS LIMITER'S JOB CHANGED, AND SAYING SO IS THE POINT ───────────────────────────────────────
// It is no longer anti-scraping — that job belongs to STRICT. It is a RUNAWAY-LOOP BACKSTOP: it exists
// so a client bug (an effect that re-fires, a retry loop, a held-down Retry button) cannot become
// unbounded origin load. It is deliberately set far above anything human browsing can reach.
//
// ── 600 PER MINUTE, AND THE ARITHMETIC IT WAS SIZED AGAINST ─────────────────────────────────────────
// One page mount costs ONE request on the success path. Sized against the CUSTOMER, not the scraper:
//   - the full journey that broke (load, change event, back, two reloads)  →   5   — 120x headroom
//   - forty customers on one venue wifi, three mounts each                 → 120   —   5x headroom
//   - two hundred customers on one wifi, three mounts each                 → 600   — AT THE LINE
// ⚠️ That last row is the honest edge and is recorded rather than rounded away. It needs two hundred
// people on ONE address all loading the SAME truck three times inside sixty seconds. If a venue ever
// approaches it, raise this number — do not add a smarter key, because there is no customer identity to
// key on (see proxy.ts) and a shared address is exactly the case that must not be starved.
//
// ── ⚠️ KEYED (IP, TRUCK SLUG), NOT IP ALONE — THE KEY IS BUILT IN proxy.ts ─────────────────────────
// IP alone was the second half of the defect: every customer on a venue's wifi shared one bucket, and UK
// mobile carriers use CGNAT, so hundreds of phones can share one address. Including the truck means one
// truck's customers can never exhaust another truck's budget, and the limit reads as "requests for this
// truck from this address" rather than "requests from this address".
export const eventsRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(600, '1 m'),
  analytics: true,
  prefix: 'vf_rl_events',
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
