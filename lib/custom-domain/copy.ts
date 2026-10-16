import { recordLabelsFor } from './dns'
import type { DnsProvider, ProviderSteps } from './dns'
import { formatInstant, type TimeSettings } from '@/lib/time-utils'
// Language Phase 1d Part 2: every word here — the record screen's hints, the escape-hatch email, the live email, the
// waiting notice, the problem mailto — is `customDomain` in messages/, in the truck's locale (en-GB when none is given,
// which is byte-for-byte what these functions always wrote). The admin alert below is HatchGrab's own and stays inline.
import { translatorFor } from '@/lib/i18n/translator'
import '@/lib/i18n/catalog/customDomain'

/** The custom-domain words in a locale (en-GB when none is given). */
const wordsFor = (locale?: string | null) =>
  translatorFor(locale, 'customDomain') as unknown as (key: string, values?: Record<string, string>) => string

/**
 * ── THE RECORD SCREEN'S WORDS, AND THE EMAIL'S. ONE SOURCE. ─────────────────────────────────────
 *
 * 🔴 PLAIN ENGLISH IS THE EXISTING RULE (§35): OUR sentences carry no technical words; QUOTED FIELD
 * LABELS are the provider's words. Here the rule needs one more distinction the embed wizard did not:
 * **the three VALUES are things the operator types, not prose.** "CNAME" is what goes in the box. The
 * checker excludes the values and the quoted labels, and searches the sentences.
 *
 * ⚠️ TIMING: "usually within an hour, sometimes longer." NOT "instant", which sets an expectation a
 * DNS change cannot meet. NOT "24 to 48 hours" either — that figure is for a NAMESERVER change, where
 * a whole zone moves; a single added record is not that, and quoting it would have an operator give
 * up on something that had already worked.
 */

export type RecordRow = { label: string; value: string; hint: string }

/**
 * The three rows, labelled as the operator's own provider labels them.
 * ⚠️ THE LABELS MATTER MORE THAN THEY LOOK. Cloudflare's third field is "Target"; GoDaddy's is
 * "Points to". An operator hunting a GoDaddy screen for "Value" will not find it, decide they are in
 * the wrong place, and stop.
 */
/**
 * ── 🔴 THE TWO VALUES, LABELLED THE WAY THAT PROVIDER LABELS THEM. ───────────────────────────────
 * `recordRows` above is UNTOUCHED and still serves everyone without verified steps. This is the
 * four-provider version, and the only difference that matters is that it does NOT emit a type row:
 * `fieldLabels.type` is null on Wix, where no such field exists.
 * ⚠️ THE VALUES ARE THE SAME VALUES. `subdomainLabel` and `cnameTarget` are what `recordRows` puts in
 * rows 2 and 3; nothing about what the operator copies changes, only what it is called.
 */
/**
 * ── 🔴 THE VALUE THE OPERATOR ACTUALLY PASTES. ONE FUNCTION, EVERY SURFACE. ──────────────────────
 *
 * The hosting config lookup returns `recommendedCNAME` as Vercel reports it, and **that value can
 * carry a trailing full stop** — the cron already knows this and strips one before comparing
 * (`app/api/cron/custom-domain-check/route.ts`: `expected.toLowerCase().replace(/\.$/, '')`). Nothing
 * on the operator's side stripped it, so whatever Vercel returned was displayed, copied and emailed
 * verbatim. **An operator pasted that into Wix on 4 September 2026 and Wix refused it.** They deleted
 * the character by hand.
 *
 * 🔴 SO IT IS CANONICALISED TO DOTLESS AND THE DOT IS PUT BACK ONLY WHERE A PROVIDER DEMANDS IT.
 * The straight fix — strip it everywhere — breaks 123 Reg **silently**, because their own page
 * requires the dot and a record without it resolves to the wrong name with nothing reporting the
 * error. See `ProviderSteps.targetTrailingDot`.
 *
 * ⚠️ NO SECOND MECHANISM. The answer comes from the provider record the screen and the escape-hatch
 * email already render from; this function only reads it.
 * ⚠️ THE DISPLAYED VALUE AND THE COPIED VALUE ARE THE SAME STRING BY CONSTRUCTION — both come from the
 * `RecordRow` this builds. They could not differ before and must not start now: an operator who
 * distrusts the button and retypes what they can see has to get a working record.
 */
export function dnsTargetValue(cnameTarget: string, steps?: ProviderSteps | null): string {
  // One dot, not many. `x.com..` is malformed rather than fully qualified.
  const canonical = (cnameTarget || '').trim().replace(/\.$/, '')
  if (!canonical) return canonical
  return steps?.targetTrailingDot ? `${canonical}.` : canonical
}

export function providerFieldRows(args: {
  locale?: string | null
  steps: ProviderSteps
  subdomainLabel: string
  cnameTarget: string
}): RecordRow[] {
  const t = wordsFor(args.locale)
  return [
    { label: args.steps.fieldLabels.name,  value: args.subdomainLabel, hint: t('record.hintWord') },
    // 🔴 `dnsTargetValue`, NEVER `args.cnameTarget` RAW. See that function — this row is the one the
    // operator pastes, and it is the row Wix rejected.
    { label: args.steps.fieldLabels.value, value: dnsTargetValue(args.cnameTarget, args.steps), hint: t('record.hintExact') },
  ]
}

export function recordRows(args: {
  locale?: string | null
  provider: DnsProvider | null
  subdomainLabel: string
  cnameTarget: string
}): RecordRow[] {
  // 🔴 ONE READER. The generic default used to be written out a THIRD time, right here, beside the
  // one already exported as GENERIC_RECORD_LABELS. Same values, so this line's output is unchanged.
  const labels = recordLabelsFor(args.provider)
  const t = wordsFor(args.locale)
  return [
    { label: labels.type,  value: 'CNAME',              hint: t('record.hintChoose') },
    { label: labels.name,  value: args.subdomainLabel,  hint: t('record.hintWord') },
    // 🔴 THE GENERIC PATH HAS NO PROVIDER RECORD TO READ, SO IT IS DOTLESS — correct for every
    // provider we have seen except 123 Reg, which has verified steps and therefore never lands here.
    { label: labels.value, value: dnsTargetValue(args.cnameTarget, args.provider?.steps), hint: t('record.hintExact') },
  ]
}

// ⛔ `TIMING_LINE` moved to messages (Language Phase 1d Part 2): `customDomain.record.timing`.

/**
 * The escape hatch, on the record screen rather than after a failure.
 * 🔴 MANY OPERATORS DO NOT HOLD THEIR OWN DNS LOGIN — it sits with whoever built the site, sometimes
 * years ago. Offering this only after they fail assumes they can try at all, and the ones who cannot
 * are exactly the ones who would have been stuck longest.
 * ⚠️ IT CARRIES THE REASON, NOT JUST THE VALUES. The recipient is a web person with no context; three
 * fields and no explanation reads like a phishing attempt.
 */
export function instructionsEmail(args: {
  truckName: string
  address: string
  providerLabel: string | null
  rows: RecordRow[]
  operatorEmail: string | null
  /**
   * 🔴 THE SAME PROVIDER RECORD THE SCREEN RENDERS. Passed in rather than looked up so this file
   * keeps no provider knowledge of its own — no provider's steps are written twice, which is the
   * whole point of the record. Absent for a provider with no verified steps, and then this email is
   * byte-identical to what it always sent.
   */
  steps?: ProviderSteps | null
  /** The truck's locale (Language Phase 1d Part 2). en-GB when absent — the email it always sent. */
  locale?: string | null
}): { subject: string; html: string; text: string } {
  const { truckName, address, providerLabel, rows, operatorEmail, steps } = args
  const t = wordsFor(args.locale)
  // 🔴 ONE SENTENCE PER CASE, NOT A SUFFIX: "…to our domain at {provider}." / "…with whoever holds our domain."
  const intro = (name: string, addr: string, provider: string | null) =>
    provider ? t('instructionsEmail.introAt', { truckName: name, address: addr, provider }) : t('instructionsEmail.introHolder', { truckName: name, address: addr })
  // 🔴 WITH VERIFIED STEPS THE EMAIL TAKES THE SCREEN'S SHAPE: the steps, THEN the two values the
  // steps refer to. The steps say "the first value below", so the values must actually be below them —
  // and the type row goes, because on Wix there is no type field for the recipient to look for.
  // ⚠️ THE VALUES ARE THE SAME VALUES. They are lifted out of the `rows` the caller already built
  // (rows[1] name, rows[2] target, the order `recordRows` fixes) rather than recomputed here.
  const shown = steps ? providerFieldRows({ locale: args.locale, steps, subdomainLabel: rows[1]?.value ?? '', cnameTarget: rows[2]?.value ?? '' }) : rows
  const table = shown.map(r => `  ${r.label}: ${r.value}`).join('\n')
  // The steps and the caveat are message keys (lib/custom-domain/dns.ts), read here in the truck's locale.
  const stepWords = steps ? steps.steps.map(k => t(k)) : []
  const caveat = steps?.caveat ? t(steps.caveat) : null
  const numbered = steps ? stepWords.map((w, i) => `  ${i + 1}. ${w}`).join('\n') : ''
  const stepsText = steps ? `${t('instructionsEmail.stepsAt', { provider: providerLabel ?? '' })}\n\n${numbered}\n\n` : ''
  const tailText = steps ? `\n\n${t('instructionsEmail.guide', { url: steps.helpUrl })}${caveat ? `\n\n${caveat}` : ''}` : ''
  const stepsHtml = steps
    ? `<p style="margin-bottom:4px">${t('instructionsEmail.stepsAt', { provider: `<strong>${providerLabel}</strong>` })}</p><ol style="margin:0 0 12px 0;padding-left:20px">${stepWords.map(w => `<li style="margin:2px 0">${w.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('')}</ol>`
    : ''
  const tailHtml = steps
    ? `<p>${t('instructionsEmail.guide', { url: `<a href="${steps.helpUrl}">${steps.helpUrl}</a>` })}</p>`
      + (caveat ? `<p><strong>${caveat.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</strong></p>` : '')
    : ''

  const text =
`${t('instructionsEmail.hello')}

${intro(truckName, address, providerLabel)}

${stepsText}${table}${tailText}

${t('instructionsEmail.wholeChange')}

${t('instructionsEmail.pointsAt')}${operatorEmail ? `\n\n${t('instructionsEmail.replyTo', { email: operatorEmail })}` : ''}

${t('instructionsEmail.thanks')}
${truckName}`

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html =
`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
  <p>${t('instructionsEmail.hello')}</p>
  <p>${intro(`<strong>${esc(truckName)}</strong>`, `<strong>${esc(address)}</strong>`, providerLabel ? esc(providerLabel) : null)}</p>
  ${stepsHtml}
  <table style="border-collapse:collapse;margin:12px 0">
    ${shown.map(r => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${esc(r.label)}</td><td style="padding:4px 0;font-family:ui-monospace,monospace"><strong>${esc(r.value)}</strong></td></tr>`).join('')}
  </table>
  ${tailHtml}
  <p>${t('instructionsEmail.wholeChange')}</p>
  <p>${t('instructionsEmail.pointsAt')}${operatorEmail ? ` ${t('instructionsEmail.replyTo', { email: `<a href="mailto:${esc(operatorEmail)}">${esc(operatorEmail)}</a>` })}` : ''}</p>
  <p>${t('instructionsEmail.thanks')}<br>${esc(truckName)}</p>
</div>`

  return { subject: t('instructionsEmail.subject', { truckName }), html, text }
}


/**
 * ── THE OPERATOR'S TWO NOTIFICATION STATES ──────────────────────────────────────────────────────
 *
 * 🔴 WAITING IS THE ONE THAT EARNS ITS KEEP. Setup ends with an operator adding a record and closing
 * the tab. If it never resolves, **nothing happens** — no error, no page, no complaint — and they
 * simply wait, indefinitely, believing it is coming. This state is the only thing that turns a silent
 * stall into a sentence.
 */
export function notificationCopy(args: { address: string; startedAt: string | null; time: TimeSettings | null | undefined; locale?: string | null }):
  { waiting: { title: string; body: string }; ready: { title: string; body: string } } {
  // The truck's zone and words (Phase 2B): GB "9 October", US "October 9".
  const since = args.startedAt
    ? formatInstant(args.startedAt, args.time, { day: 'numeric', month: 'long' })
    : null
  const t = wordsFor(args.locale)
  return {
    /**
     * ── 🔴 THIS IS NOT A FAILURE MESSAGE, AND THAT IS THE WHOLE POINT (5 September 2026). ──────────
     * It read "<address> is not working yet" followed by "it has not started working" — a sentence
     * that tells an operator who has done everything correctly that something is wrong. They then get
     * in touch about a non-problem, and learn to distrust a screen that will later say something true.
     * 🔴 THE TITLE NOW STATES THE STAGE, NOT A VERDICT. "We are waiting for your web address" is what
     * is actually happening.
     *
     * 🔴 "UP TO 24 HOURS" IS A FACT ABOUT DNS, NOT ABOUT OUR SCHEDULE, AND THE WORDING MUST NOT
     * CODIFY OUR LIMITATION AS ONE. Until today it was BOTH — the only thing that could mark a domain
     * live was a daily cron, so 24 hours was our cadence wearing DNS's clothes. That is fixed: the
     * setup box now checks on demand. So the sentence leads with "usually a few minutes", which is
     * what propagation actually does, and names 24 hours as the rare outer edge that it genuinely is.
     * ⚠️ IF THIS EVER READS "up to 24 hours" WITHOUT "usually a few minutes" IN FRONT OF IT, someone
     * has quietly re-described our own delay as the internet's.
     *
     * ⚠️ OPERATOR VOCABULARY THROUGHOUT: "web address". Never domain, subdomain, DNS, CNAME or record.
     * The one thing they did is "the line we gave you", which is what the screen above calls it.
     * ⚠️ THE LAST SENTENCE EARNS ITS PLACE. Many operators do not hold their own domain login — it
     * sits with whoever built the site — so "check they did it" is the single most useful action, and
     * it is phrased as a possibility rather than an accusation.
     */
    waiting: {
      title: t('waiting.title', { address: args.address }),
      body: since ? t('waiting.bodySince', { date: since }) : t('waiting.body'),
    },
    ready: {
      title: t('ready.title', { address: args.address }),
      body: t('ready.body'),
    },
  }
}

/**
 * ── 🔴 THE ADMIN ALERT. IT GOES TO US, NEVER TO THE OPERATOR. ───────────────────────────────────
 *
 * The operator sees the waiting copy and nothing else while a setup is in flight, because at that
 * point they have most likely done everything right and DNS is simply propagating. **A failure message
 * to someone who did nothing wrong produces a support call about a non-problem** — and, worse, teaches
 * them to distrust a screen that will later tell them something true.
 *
 * 🔴 SO THIS CARRIES WHAT DIAGNOSES IT, NOT WHAT REASSURES ANYONE. Every field is here because it
 * distinguishes one cause from another:
 *   • `lastSeenValue` is the one that actually decides it — **a mistyped record, a record pointing at
 *     someone else's host, and a site that has moved provider look identical from the outside and are
 *     told apart entirely by what the name currently resolves to.** `nothing` means the record was
 *     never added or was added on the wrong name.
 *   • `startedAt` vs `lastOkAt` separates "never worked" from "worked and stopped", which are different
 *     conversations with the operator.
 *   • The truck name and address are what makes it actionable without opening the admin table.
 */
export function adminDomainAlertEmail(args: {
  kind: 'setup_stalled' | 'stopped_working'
  truckName: string
  truckId: string
  address: string
  startedAt: string | null
  lastOkAt: string | null
  lastSeenValue: string | null
  expected: string | null
  graceLabel: string
}): { subject: string; html: string; text: string } {
  const stopped = args.kind === 'stopped_working'
  const subject = stopped
    ? `Custom domain STOPPED WORKING — ${args.address} (${args.truckName})`
    : `Custom domain not working after ${args.graceLabel} — ${args.address} (${args.truckName})`

  const headline = stopped
    ? `${args.address} was working and has stopped.`
    : `${args.address} has never started working since setup began.`

  // ⚠️ `nothing` RATHER THAN AN EMPTY CELL. "Resolving to:" followed by blank reads as a rendering bug;
  // "nothing" is the actual finding and is the most common one.
  const seen = args.lastSeenValue ?? 'nothing'
  const rows: Array<[string, string]> = [
    ['Truck', `${args.truckName} (${args.truckId})`],
    ['Address', args.address],
    ['Resolving to', seen],
    ['Should resolve to', args.expected ?? 'unknown — the hosting config lookup did not answer'],
    ['Setup started', args.startedAt ?? '—'],
    ['Last successful check', args.lastOkAt ?? 'never'],
  ]

  const html =
    `<p><strong>${headline}</strong></p>` +
    `<table cellpadding="6" style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px">` +
    rows.map(([k, v]) =>
      `<tr><td style="color:#64748b">${k}</td><td style="font-family:ui-monospace,monospace">${v}</td></tr>`).join('') +
    `</table>` +
    `<p style="color:#64748b;font-size:13px">The operator has not been shown a failure message. ` +
    `This is the only email for this outage — it is sent once, when the check crosses the line, and again ` +
    `only if the domain recovers and fails afresh.</p>`

  const text = `${headline}\n\n` + rows.map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nThe operator has not been shown a failure message. Sent once per outage.`

  return { subject, html, text }
}

/**
 * The email when it goes live. Sent ONCE, on the transition.
 * 🔴 A DASHBOARD-ONLY NOTICE REACHES NOBODY HERE. Setup ends with the operator closing the tab and
 * going back to running a food truck; they have no reason to open the dashboard for days.
 */
export function liveEmail(args: { truckName: string; address: string; locale?: string | null }): { subject: string; html: string; text: string } {
  const { truckName, address } = args
  const t = wordsFor(args.locale)
  const text =
`${t('liveEmail.goodNews', { address })}

${t('liveEmail.body', { address })}

${t('liveEmail.confirm')}

${truckName}`
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html =
`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
  <p>${t('liveEmail.goodNews', { address: `<strong>${esc(address)}</strong>` })}</p>
  <p>${t('liveEmail.body', { address: esc(address) })}</p>
  <p>${t('liveEmail.confirm')}</p>
  <p>${esc(truckName)}</p>
</div>`
  return { subject: t('liveEmail.subject', { address }), html, text }
}

/**
 * ── THE CONFIRM STEP'S COPY ─────────────────────────────────────────────────────────────────────
 * 🔴 IT NAMES WHAT TO CHECK, AND THAT IS THE WHOLE POINT. Without it the button records "I saw a
 * notification" rather than "I looked at my page", and the confirmed column in the admin table means
 * nothing at all.
 * ⚠️ ONE BUTTON. There is no "something is wrong" branch: nothing sits behind it to triage, and a
 * button that files a signal nobody reads is worse than a sentence naming who to contact.
 */
/**
 * ── 🔴 ONE WAY TO TURN A STORED HOST INTO A LINK. ────────────────────────────────────────────────
 * `trucks.custom_domain` holds a BARE host — `domain_provision` writes `verdict.host`, which
 * `checkSubdomain` has already stripped of any scheme. So every surface that links to an operator's
 * page has to add one, and every surface adding its own is a place for them to disagree.
 * ⚠️ ALWAYS `https`. A live custom domain has a certificate by definition — `custom_domain_verified_at`
 * is only set once it is serving — so there is no case where `http` is the right guess.
 */
export function addressUrl(host: string): string {
  return `https://${host}`
}

/** The confirm step's checklist, after "Open {address}" — message keys under `customDomain.confirm` (Language Phase 1d
 *  Part 2; the heading, the buttons and the problem line moved there too). */
export const CONFIRM_CHECKLIST = ['checkTimes'] as const
/** Where "Email us" writes to. An address, not a word. */
export const CONFIRM_SUPPORT_EMAIL = 'hello@hatchgrab.com'

/**
 * ── THE ESCAPE HATCH, WITH THE CONTEXT ALREADY IN IT. ───────────────────────────────────────────
 * 🔴 THE DATE IS WHEN IT WENT LIVE, NOT TODAY, AND THAT IS DELIBERATE FOR TWO REASONS. Today's date
 * is already on the email the moment it is sent, so it carries nothing; the go-live date is the fact
 * only we hold. And `new Date()` in a render is a HYDRATION MISMATCH waiting to happen — the server
 * and the client can disagree across midnight — so a value from props is the safe one as well as the
 * useful one.
 * ⚠️ Every part is encoded. A truck name with an `&` in it would otherwise truncate the body.
 */
/** The permanent hatchgrab.com ordering page — the one the QR code encodes and the one that never moves. */
/**
 * ── 🔴 THE ADDRESS A PRINTED QR CODE ENCODES, AND IT IS DELIBERATELY NOT THE ORDERING PAGE. ─────
 *
 * WHY A SECOND URL EXISTS AT ALL (29 August 2026). `/trucks/<slug>/order` used to resolve the custom
 * domain and redirect to it, which made the QR dynamic — and closed a cycle no error could report. The
 * schedule page's Order button targets the ordering page, so a customer who scanned, landed on the
 * operator's domain and tapped Order was sent straight back to the page they were already on. Each hop
 * was a valid 307 followed by a 200; the return leg was a user click, so no browser ever flagged a
 * loop and nothing appeared in monitoring. See docs/qr-redirect-trace-report.md.
 *
 * 🔴 THE TWO URLS NOW HAVE ONE JOB EACH. `/order/<slug>` DECIDES (custom domain, else the ordering
 * page); `/trucks/<slug>/order` SERVES, always, for every arrival. A page that both decides and serves
 * cannot tell an inbound scan from a customer coming back to buy — which is exactly what the cycle was.
 * (The decider was renamed `/o/<slug>` → `/order/<slug>`; `/o/<slug>` is kept as a permanent shim to it,
 * so codes already printed with `/o/` still resolve.)
 *
 * ⚠️ SHORT ON PURPOSE. A QR's module count grows with the payload, so fewer characters means larger
 * modules at the same printed size and a code that scans from further away, in worse light, on a
 * cheaper camera. `/order/<pizzeria-gusto>` is 46 characters against the ordering page's 53 — still
 * shorter than the serving URL, and the tradeoff for a spellable, memorable address.
 *
 * ⚠️ `origin` EXISTS FOR THE DEMO DASHBOARD AND MUST NOT BE DROPPED. Real trucks always take the
 * canonical production host, because their code gets printed. A DEMO truck takes the current origin, so
 * a localhost tester is not sent to production where their truck does not exist — the reasoning is at
 * app/dashboard/[token]/page.tsx:185-192 and predates this function.
 */
export function scanUrl(slug: string, origin?: string): string {
  return `${origin || process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}/order/${slug}`
}

export function orderPageUrl(slug: string): string {
  // ⚠️ THE `||` FALLBACK IS NOT DECORATION (29 August 2026). `app/domain/page.tsx` has always carried
  // `process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'` on its own constant, and it
  // now calls this helper — without the fallback, an unset variable would turn the ONE link a lapsed
  // operator's customers are given into `undefined/trucks/…`. Adding it here rather than at that one
  // call site means the QR card and the turn-off panel get the same floor.
  // 🔴 IT CHANGES NOTHING WHERE THE VARIABLE IS SET, which is everywhere it matters — proven by
  // running both forms side by side. It only replaces a broken string with a working one.
  return `${process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}/trucks/${slug}/order`
}

/**
 * ── 🔴 SWITCHING IT OFF. THE COPY NAMES BOTH ADDRESSES. ─────────────────────────────────────────
 * One stops working and one does not, and an operator who reads only "your address will stop working"
 * has no way to know their ordering page is untouched. Naming both is the difference between a
 * decision and a leap.
 * ⚠️ The ordering address is spelled out rather than described, because it is the thing they will go
 * and check before pressing the button.
 */
// ⛔ `TURN_OFF_COPY` moved to messages (Language Phase 1d Part 2): `customDomain.turnOff`.

/**
 * ── THE ACKNOWLEDGEMENT AFTER "Yes". ────────────────────────────────────────────────────────────
 * 🔴 THE BLOCK USED TO SIMPLY VANISH. A control that disappears on click looks like a page that lost
 * the click; an operator who is not sure it registered presses again, or goes looking for what they
 * broke. One short line costs nothing and answers both.
 */
// ⛔ `CONFIRMED_COPY` moved to messages (Language Phase 1d Part 2): `customDomain.confirmed`.

export function confirmProblemMailto(args: {
  truckName: string
  address: string
  verifiedAt: string | null
  time: TimeSettings | null | undefined
  locale?: string | null
}): string {
  const t = wordsFor(args.locale)
  const live = args.verifiedAt
    ? formatInstant(args.verifiedAt, args.time, { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const body = [
    `${args.truckName}`,
    `${args.address}`,
    live ? t('confirm.mailLiveSince', { date: live }) : null,
    '',
    t('confirm.mailSeeing'),
    '',
  ].filter(l => l !== null).join('\n')
  return `mailto:${CONFIRM_SUPPORT_EMAIL}`
    + `?subject=${encodeURIComponent(t('confirm.mailSubject', { address: args.address }))}`
    + `&body=${encodeURIComponent(body)}`
}
