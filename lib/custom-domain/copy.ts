import { recordLabelsFor } from './dns'
import type { DnsProvider, ProviderSteps } from './dns'

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
export function providerFieldRows(args: {
  steps: ProviderSteps
  subdomainLabel: string
  cnameTarget: string
}): RecordRow[] {
  return [
    { label: args.steps.fieldLabels.name,  value: args.subdomainLabel, hint: 'Just this word, not the whole address.' },
    { label: args.steps.fieldLabels.value, value: args.cnameTarget,    hint: 'Copy this exactly.' },
  ]
}

export function recordRows(args: {
  provider: DnsProvider | null
  subdomainLabel: string
  cnameTarget: string
}): RecordRow[] {
  // 🔴 ONE READER. The generic default used to be written out a THIRD time, right here, beside the
  // one already exported as GENERIC_RECORD_LABELS. Same values, so this line's output is unchanged.
  const labels = recordLabelsFor(args.provider)
  return [
    { label: labels.type,  value: 'CNAME',              hint: 'Choose this from the list.' },
    { label: labels.name,  value: args.subdomainLabel,  hint: 'Just this word, not the whole address.' },
    { label: labels.value, value: args.cnameTarget,     hint: 'Copy this exactly.' },
  ]
}

export const TIMING_LINE =
  'It usually starts working within an hour, though it can take longer. You do not need to keep this page open.'

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
}): { subject: string; html: string; text: string } {
  const { truckName, address, providerLabel, rows, operatorEmail, steps } = args
  const where = providerLabel ? ` at ${providerLabel}` : ' with whoever holds our domain'
  // 🔴 WITH VERIFIED STEPS THE EMAIL TAKES THE SCREEN'S SHAPE: the steps, THEN the two values the
  // steps refer to. The steps say "the first value below", so the values must actually be below them —
  // and the type row goes, because on Wix there is no type field for the recipient to look for.
  // ⚠️ THE VALUES ARE THE SAME VALUES. They are lifted out of the `rows` the caller already built
  // (rows[1] name, rows[2] target, the order `recordRows` fixes) rather than recomputed here.
  const shown = steps ? providerFieldRows({ steps, subdomainLabel: rows[1]?.value ?? '', cnameTarget: rows[2]?.value ?? '' }) : rows
  const table = shown.map(r => `  ${r.label}: ${r.value}`).join('\n')
  const numbered = steps ? steps.steps.map((t, i) => `  ${i + 1}. ${t}`).join('\n') : ''
  const stepsText = steps ? `At ${providerLabel}:\n\n${numbered}\n\n` : ''
  const tailText = steps ? `\n\nTheir own guide: ${steps.helpUrl}${steps.caveat ? `\n\n${steps.caveat}` : ''}` : ''
  const stepsHtml = steps
    ? `<p style="margin-bottom:4px">At <strong>${providerLabel}</strong>:</p><ol style="margin:0 0 12px 0;padding-left:20px">${steps.steps.map(t => `<li style="margin:2px 0">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</li>`).join('')}</ol>`
    : ''
  const tailHtml = steps
    ? `<p>Their own guide: <a href="${steps.helpUrl}">${steps.helpUrl}</a></p>`
      + (steps.caveat ? `<p><strong>${steps.caveat.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</strong></p>` : '')
    : ''

  const text =
`Hello,

We are putting ${truckName}'s live schedule on ${address}, and it needs one record adding to our domain${where}.

${stepsText}${table}${tailText}

That is the whole change — nothing else on the website is affected, and the rest of our domain keeps working exactly as it does now. It usually starts working within an hour.

The page it points at shows where we are trading next and keeps itself up to date.${operatorEmail ? `\n\nReply to ${operatorEmail} if you have any questions.` : ''}

Thank you,
${truckName}`

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html =
`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
  <p>Hello,</p>
  <p>We are putting <strong>${esc(truckName)}</strong>'s live schedule on <strong>${esc(address)}</strong>, and it needs one record adding to our domain${esc(where)}.</p>
  ${stepsHtml}
  <table style="border-collapse:collapse;margin:12px 0">
    ${shown.map(r => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${esc(r.label)}</td><td style="padding:4px 0;font-family:ui-monospace,monospace"><strong>${esc(r.value)}</strong></td></tr>`).join('')}
  </table>
  ${tailHtml}
  <p>That is the whole change — nothing else on the website is affected, and the rest of our domain keeps working exactly as it does now. It usually starts working within an hour.</p>
  <p>The page it points at shows where we are trading next and keeps itself up to date.${operatorEmail ? ` Reply to <a href="mailto:${esc(operatorEmail)}">${esc(operatorEmail)}</a> if you have any questions.` : ''}</p>
  <p>Thank you,<br>${esc(truckName)}</p>
</div>`

  return { subject: `One record to add for ${truckName}'s schedule page`, html, text }
}


/**
 * ── THE OPERATOR'S TWO NOTIFICATION STATES ──────────────────────────────────────────────────────
 *
 * 🔴 WAITING IS THE ONE THAT EARNS ITS KEEP. Setup ends with an operator adding a record and closing
 * the tab. If it never resolves, **nothing happens** — no error, no page, no complaint — and they
 * simply wait, indefinitely, believing it is coming. This state is the only thing that turns a silent
 * stall into a sentence.
 */
export function notificationCopy(args: { address: string; startedAt: string | null }):
  { waiting: { title: string; body: string }; ready: { title: string; body: string } } {
  const since = args.startedAt
    ? new Date(args.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : null
  return {
    waiting: {
      title: `${args.address} is not working yet`,
      body: since
        ? `You started setting this up on ${since} and it has not started working. If you added the line we gave you, it may still be on its way. If someone else was adding it for you, it is worth checking they did.`
        : `It has not started working yet. If you added the line we gave you, it may still be on its way. If someone else was adding it for you, it is worth checking they did.`,
    },
    ready: {
      title: `${args.address} is live`,
      body: 'Have a look at it, then tell us it is right in your settings.',
    },
  }
}

/**
 * The email when it goes live. Sent ONCE, on the transition.
 * 🔴 A DASHBOARD-ONLY NOTICE REACHES NOBODY HERE. Setup ends with the operator closing the tab and
 * going back to running a food truck; they have no reason to open the dashboard for days.
 */
export function liveEmail(args: { truckName: string; address: string }): { subject: string; html: string; text: string } {
  const { truckName, address } = args
  const text =
`Good news — ${address} is working.

Your schedule is now showing at your own address. Have a look at it and check it is right: open ${address}, make sure the events are yours and the dates look correct.

When you have, open your settings on HatchGrab and tell us it is right. Nothing depends on that — it just means we know a person has seen it.

${truckName}`
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html =
`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
  <p>Good news — <strong>${esc(address)}</strong> is working.</p>
  <p>Your schedule is now showing at your own address. Have a look at it and check it is right: open ${esc(address)}, make sure the events are yours and the dates look correct.</p>
  <p>When you have, open your settings on HatchGrab and tell us it is right. Nothing depends on that — it just means we know a person has seen it.</p>
  <p>${esc(truckName)}</p>
</div>`
  return { subject: `${address} is working`, html, text }
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

export const CONFIRM_COPY = {
  heading: 'Have a look, then tell us it is right',
  // 🔴 TWO STEPS, NOT THREE (29 August 2026). "Check the events shown are yours." was removed: an
  // operator looking at their own dates and times has already established whose events they are, and a
  // checklist earns its keep by being short enough to actually be done.
  // 🔴 STEP 1 IS A PREFIX, NOT A WHOLE SENTENCE, BECAUSE IT ENDS IN THE ADDRESS AND THE ADDRESS IS A
  // LINK. It read "Open your address and let the page load." — which named nothing and could not be
  // clicked, so a separate copy of the address had to sit above the list to make it openable. The step
  // now IS the link, and that second copy is gone.
  // ⚠️ NO FULL STOP AFTER IT. A trailing dot immediately after a web address reads as part of the
  // address, and this one is a link an operator may copy.
  openPrefix: 'Open ',
  checklist: [
    'Check the dates and times look right.',
  ],
  button: 'Yes, it looks right',
  // ── 🔴 TWO BUTTONS, AND "No" REVEALS RATHER THAN FIRES (29 August 2026). ─────────────────────
  // It was one button and a sentence with a mailto in it, so the only way to say "no" was to notice a
  // link inside a paragraph. Two buttons make both answers the same size.
  // 🔴 "No" RECORDS NOTHING AND SENDS NOTHING. It reveals the line and the control below it, and the
  // operator can still press "Yes" afterwards — there is no state on the server and nothing to undo.
  noButton: "No, there's a problem",
  problemLine: 'Tell us what you are seeing and we will look at it.',
  problemButton: 'Email us',
  supportEmail: 'hello@hatchgrab.com',
  // ⛔ `gatesNothing` REMOVED 29 August 2026 on instruction. It read: "This changes nothing on your
  // page. It just tells us a person has looked." ⚠️ IT WAS THE ONLY PLACE THAT SAID PRESSING THE
  // BUTTON CHANGES NOTHING — the reassurance is now unstated, and an operator who hesitates over
  // what the button will do to their live page has nothing on screen answering it. The FACT is
  // unchanged: `domain_confirm` writes one timestamp and touches nothing the page renders.
}

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
 * 🔴 THE TWO URLS NOW HAVE ONE JOB EACH. `/o/<slug>` DECIDES (custom domain, else the ordering
 * page); `/trucks/<slug>/order` SERVES, always, for every arrival. A page that both decides and serves
 * cannot tell an inbound scan from a customer coming back to buy — which is exactly what the cycle was.
 *
 * ⚠️ SHORT ON PURPOSE. A QR's module count grows with the payload, so fewer characters means larger
 * modules at the same printed size and a code that scans from further away, in worse light, on a
 * cheaper camera. `/o/<pizzeria-gusto>` is 42 characters against the ordering page's 53.
 *
 * ⚠️ `origin` EXISTS FOR THE DEMO DASHBOARD AND MUST NOT BE DROPPED. Real trucks always take the
 * canonical production host, because their code gets printed. A DEMO truck takes the current origin, so
 * a localhost tester is not sent to production where their truck does not exist — the reasoning is at
 * app/dashboard/[token]/page.tsx:185-192 and predates this function.
 */
export function scanUrl(slug: string, origin?: string): string {
  return `${origin || process.env.NEXT_PUBLIC_HATCHGRAB_URL || 'https://www.hatchgrab.com'}/o/${slug}`
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
export const TURN_OFF_COPY = {
  link: 'Turn this off',
  heading: 'Turn off your own web address?',
  stops: 'This will stop working:',
  carriesOn: 'This carries on exactly as it is, and is where your QR code sends people:',
  // 🔴 REVERSED 29 August 2026. It said the line they added "can stay where it is" — true, and the
  // wrong advice. We remove the address from our hosting, but their CNAME is theirs and we never touch
  // it, so it goes on pointing at a host that no longer recognises the name. What their customers then
  // see is the hosting provider's own error page, under the operator's brand — worse than nothing.
  // ⚠️ IT DOES NOT PROMISE WHAT THE ADDRESS WILL SHOW, because that has never been observed. It says
  // what to do. If they ARE setting it up again the line is worth keeping, so both cases are named.
  reAdd: 'If you are setting it up again later, leave the line you added at your web address company. If you are not, ask them to remove it.',
  cancel: 'Keep it on',
  confirm: 'Turn it off',
  working: 'Turning it off…',
  failed: 'We could not switch that off just now. Nothing has changed — your address is still working. Try again shortly.',
}

/**
 * ── THE ACKNOWLEDGEMENT AFTER "Yes". ────────────────────────────────────────────────────────────
 * 🔴 THE BLOCK USED TO SIMPLY VANISH. A control that disappears on click looks like a page that lost
 * the click; an operator who is not sure it registered presses again, or goes looking for what they
 * broke. One short line costs nothing and answers both.
 */
export const CONFIRMED_COPY = {
  heading: 'Thanks — that is all noted.',
  body: 'There is nothing else to do.',
}

export function confirmProblemMailto(args: {
  truckName: string
  address: string
  verifiedAt: string | null
}): string {
  const live = args.verifiedAt
    ? new Date(args.verifiedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  const body = [
    `${args.truckName}`,
    `${args.address}`,
    live ? `Live since ${live}` : null,
    '',
    'What I am seeing:',
    '',
  ].filter(l => l !== null).join('\n')
  return `mailto:${CONFIRM_COPY.supportEmail}`
    + `?subject=${encodeURIComponent(`Problem with ${args.address}`)}`
    + `&body=${encodeURIComponent(body)}`
}
