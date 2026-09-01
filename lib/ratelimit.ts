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

// ── EMBED tier — /embed/* and /api/embed/*, AND NOTHING ELSE ────────────────────────────────────────
//
// ── WHY IT IS NOT ON STRICT, WHICH IS WHERE THE OBVIOUS ANSWER WOULD HAVE PUT IT ────────────────────
// The embed's data used to have to come from /api/discovery/events, which is STRICT at 3/min keyed on
// IP alone, with the operator bypass DELIBERATELY excluded. That is correct for a bulk-harvest feed and
// catastrophic for a widget on a business's homepage: the FOURTH visitor behind one shared address in
// any minute gets a 429, and what they see is a broken box on their local pizza place's website.
// UK carriers use CGNAT and offices NAT behind one address, so "four visitors from one IP" is a Tuesday.
//
// ── WHY IT IS NOT ON GENERAL EITHER ─────────────────────────────────────────────────────────────────
// GENERAL is 60/min keyed on IP alone, shared across /trucks and /trucks/*. An embed is loaded by
// people who never chose to visit us — they went to the operator's website — so its traffic shape is
// the operator's traffic shape, not ours, and it must not be able to exhaust a bucket that the
// discovery pages also draw from. Its own prefix means an embed surge cannot 429 the profile pages.
//
// ── 600 PER MINUTE, KEYED (IP, SLUG), AND THE ARITHMETIC ────────────────────────────────────────────
// Sized against the VISITOR, exactly as the events tier was, and set to the same number for the same
// reason — it is a runaway-loop backstop, not an anti-scraping control.
// ⚠️ ONE EMBED VIEW COSTS **TWO** TOKENS, NOT ONE: the page (/embed/<slug>) and its data fetch
// (/api/embed/events) are both in this bucket. So:
//   - 600 tokens ÷ 2 = 300 embed views per minute, from ONE address, for ONE truck
//   - a busy office or a CGNAT range behind one IP, all opening the same operator's homepage → nowhere near
//   - a client bug that re-mounts the iframe in a loop → caught, which is the actual job
// ⚠️ SIZED PESSIMISTICALLY ON THE CACHE. The route sets s-maxage=60, so most repeat views should be
// answered by the CDN — but whether Vercel's Edge Middleware runs BEFORE the cache lookup (and
// therefore spends a token even on a cache hit) was NOT verified. The number above assumes it does.
// If it turns out the CDN short-circuits the middleware, the effective headroom is far larger, and
// nothing needs changing either way.
//
// ── KEYED (IP, SLUG) ────────────────────────────────────────────────────────────────────────────────
// The same reasoning as the events tier: one operator's embed traffic must never exhaust another
// operator's budget. The slug is in the PATH for /embed/<slug> and in the QUERY for the API, so
// proxy.ts derives it from whichever is present (see embedSlug there).
// ── CUSTOM-HOST tier — an operator's OWN domain, and nothing else ───────────────────────────────────
//
// 🔴 IT EXISTS BECAUSE EVERY OTHER PREDICATE IN proxy.ts TAKES ONLY `pathname`. A custom domain serving
// at '/' matched none of them, so the one public surface an operator would put in front of their entire
// customer base was **the only one with no limiter at all**. That is the wrong way round: it is the
// surface whose traffic we least control, because it is the operator's traffic and not ours.
//
// ── KEYED (ADDRESS, HOST), NOT (ADDRESS, SLUG) ─────────────────────────────────────────────────────
// The host IS the tenant here — it is what the request resolves a truck by — so keying on it means one
// operator's domain can never exhaust another's budget, and it needs no database read to build the key.
//
// ── 600 PER MINUTE, IN THE SAME UNITS AS THE EMBED TIER ────────────────────────────────────────────
// ⚠️ ONE PAGE VIEW COSTS **TWO** TOKENS: the page ('/') and its data fetch ('/api/embed/events') are
// both on this host and both in this bucket. So 600 is 300 views per minute from ONE address for ONE
// operator — far above anything human browsing reaches from a single address, and low enough to catch a
// client that re-mounts in a loop. Deliberately the same number as the embed tier: the two surfaces have
// the same shape and a different number would be a distinction without a reason.
// ⚠️ Sized pessimistically on caching, exactly as the embed tier is: whether Vercel's Edge Middleware
// runs BEFORE the CDN lookup — and therefore spends a token on a cache hit — was NOT verified.
export const customHostRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(600, '1 m'),
  analytics: true,
  prefix: 'vf_rl_customhost',
})

export const embedRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(600, '1 m'),
  analytics: true,
  prefix: 'vf_rl_embed',
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

// ── CUSTOM-DOMAIN ACTION TIERS — /api/manage `domain_preflight` and `domain_send_instructions` ────────
//
// 🔴 THESE ARE ENFORCED IN THE ROUTE HANDLER, NOT IN proxy.ts, AND THAT IS DELIBERATE.
// proxy.ts's rate-limit scope is a POSITIVE ALLOWLIST of public paths and `/api/manage` is STRUCTURALLY
// outside it — the comment at the top of that file says so, and says why: "no future edit to an exempt
// list can accidentally re-expose them". Adding `/api/manage` to that allowlist would put ONE bucket in
// front of ~60 actions, including every menu write an operator makes during service. These two buckets
// are checked inside their own `if (action === …)` branches instead, so no other action on that route —
// and no other route anywhere — can reach them.
//
// 🔴 KEYED ON THE TRUCK, NOT THE IP. Both actions are reachable only by a caller this route has
// authenticated and confirmed has a role on this truck, so the truck IS the abuse unit. An IP key would
// be both wrong (one operator legitimately moves between networks) and useless (an authenticated caller
// can rotate address without losing their session).

// PREFLIGHT — 10 per 10 minutes per truck.
//
// WHY A LIMIT AT ALL: one call becomes THREE TO FIVE outbound requests on a host the CALLER NAMES — a
// CAA lookup and an NS lookup, each of which falls through Cloudflare to Google on failure, plus one
// authenticated GET to api.vercel.com that spends our API quota. It is the only one of the four actions
// whose fan-out is driven by caller-supplied input.
//
// WHY 10/10min: sized to the worst LEGITIMATE journey, which is a person typing. An operator lands on
// the screen, mistypes, corrects, tries `schedule.` then `orders.`, backs out and returns — call it five
// or six attempts with headroom for a double-submit. Ten is roughly double that. The ceiling it sets is
// ~60 preflights an hour per truck, so ~300 outbound requests an hour rather than an unbounded loop.
// ⚠️ It is a CEILING, not a target: no legitimate operator will come close, which is what makes a 429
// here a signal rather than an inconvenience.
export const domainPreflightRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 m'),
  analytics: true,
  prefix: 'vf_rl_domain_preflight',
})

// SEND INSTRUCTIONS — 3 per 24 hours per truck.
//
// 🔴 THIS ONE SENDS MAIL TO AN ADDRESS THE CALLER SUPPLIES, WHICH IS THE SHARPEST SHAPE ON THIS ROUTE.
// The reasoning is already written down beside `signupEmailRatelimit` above and applies verbatim: an
// endpoint that emails an address it was handed is the standard mail-bomb vector, and it spends a SHARED
// Brevo allowance whose first casualty is order confirmations for live trucks.
//
// WHY 3/DAY: the legitimate journey is "send the record to whoever runs our website" — once, plus a
// resend when the first is missed, plus one more for a second person. Three covers that with nothing
// left over. It DELIBERATELY MATCHES `signupEmailRatelimit`'s 3/day rather than inventing a new number,
// because it is the same risk with the same ceiling behind it.
//
// ⚠️ THE KEY IS THE TRUCK, NOT THE RECIPIENT — the opposite of signupEmailRatelimit, and for a reason.
// There, the caller is anonymous and the THIRD PARTY needs protecting from many senders. Here the caller
// is an authenticated operator, so the question is "how much mail may this truck cause", and a
// per-recipient key would let one truck mail a hundred different addresses three times each.
// ⚠️ A rolling window, not a calendar day: a fixed day would allow six sends across a midnight boundary.
export const domainInstructionsRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '24 h'),
  analytics: true,
  prefix: 'vf_rl_domain_instructions',
})
