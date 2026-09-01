#!/usr/bin/env node
// scripts/check-plain-english.mjs
//
// ── THE PLAIN-ENGLISH CHECKER, COMMITTED. ───────────────────────────────────────────────────────────
//
// 🔴 WHY THIS FILE EXISTS. §35 of docs/reference-manual.md records the rule AND records that a checker
// enforces it — but the checker was a session harness that existed only while one chat was open. The
// rule has been re-derived from prose three times since, differently each time. A rule with nothing
// running against it is a preference. This is the checker, in the repository, runnable:
//
//     node scripts/check-plain-english.mjs
//
// ── THE RULE (§35) ─────────────────────────────────────────────────────────────────────────────────
// "Our sentences contain no technical words. Quoted button labels are the platform's words, in quotes,
// capitalised as the operator will see them on screen."
//   • Click the button called "Embed HTML"  ✅   • Insert an HTML element  ❌
//
// 🔴 IT PRINTS EVERY EXCLUSION. §35: "The checker strips quoted labels, URLs and the pasted content
// itself, searches what remains, and prints every exclusion so the exception stays auditable rather
// than becoming a loophole." ⚠️ IT HAS BEEN WRONG TWICE AND BOTH TIMES IT WAS THE CORPUS, NOT THE COPY
// — once flagging a platform's help URL whose path contained "embedding-custom-code", once flagging the
// pasted content itself. "A checker that reports absence it never looked for is worse than none," so
// every narrowing is printed rather than applied quietly.
//
// ⚠️ THE CORPUS IS EXPLICIT, NOT SCRAPED. Scanning whole files would drown in code identifiers and
// comments; what is checked is what an OPERATOR READS. Add each new string here when you write it.

/** Words that must never appear in our own prose. */
const BANNED = [
  'code', 'snippet', 'embed', 'iframe', 'widget', 'element',
  'subdomain', 'domain', 'dns', 'cname', 'record', 'nameserver', 'ttl',
  'redirect', 'resolve', 'endpoint', 'api', 'url', 'http', 'https',
  'cache', 'server', 'static', 'dynamic', 'ssl', 'certificate', 'apex',
]

/**
 * The exclusions, each one a rule with a reason. Every hit is PRINTED.
 * 🔴 Adding one here is how the exception becomes auditable. Do not add one to silence a real hit.
 */
const EXCLUSIONS = [
  { why: 'an example web address is the concrete thing a screen exists to show, not prose',
    re: /\b[a-z0-9-]+\.[a-z0-9.-]+\.[a-z]{2,}\b/g },
  { why: 'a bare example domain, same reason', re: /\b[a-z0-9-]{2,}\.(?:com|co\.uk|uk|net|org)\b/g },
  { why: 'the operator\'s own name for the printed thing', re: /\bQR code\b/gi },
  { why: 'a quoted button or field label is the platform\'s word, per §35', re: /[“"'][^”"']{1,40}[”"']/g },
]

/** WHAT AN OPERATOR READS. Keep in step with the screens. */
const CORPUS = {
  // ── The card in Settings ────────────────────────────────────────────────────────────────────────
  'card heading':            'Add your schedule to your website',
  // 🔴 REPLACED 28 August 2026. It said nothing about an address; it now NAMES the one the wizard
  // would create. Two entries because the address is interpolated — the placeholder form is what an
  // operator with no website on file reads, and the real form is what everyone else reads.
  // 🔴 CUT TO ONE SENTENCE 28 August 2026. The second — "Your own website stays exactly as it is."
  // — is gone, so no string here says it except the wizard's own address-screen line below.
  // That absence is a decision, not the rule being satisfied.
  'card description':        'We create a page at events.yourtruck.com showing your schedule.',
  // The live-domain banner at the top of the manage page. It was never in this corpus either.
  'banner, live':            'events.yourtruck.com is live. Have a look at it, then tell us it is right in Settings.',
  // 🔴 THE LIVE FORM IS A DIFFERENT SENTENCE NOW, not the same one with a different address —
  // once it is live there is nothing left to create. Branched on props.verifiedAt.
  'card description, live':  'events.thaikitchen.co.uk is showing your schedule.',
  // ── The address screen (rewritten 28 August 2026 — the copy cut) ────────────────────────────────
  // 🔴 SIX ENTRIES BECAME FOUR, AND THAT IS THE POINT OF THE CUT, NOT AN OVERSIGHT. Gone with the
  // screen: 'first screen, line 1' (the sentence describing the shape — the address itself now shows
  // it), 'first screen, label a' / 'label b' (the two-address block), 'confirm line' (which restated
  // the website-unaffected fact for the THIRD time) and 'no-website assembled' (the chip beside the
  // box already assembles it in front of them).
  'address, heading':        'Your schedule gets its own web address.',
  'address, unaffected':     'Your website does not change — you just add a link to the new address.',
  // ⛔ 'where ordering happens' WAS REMOVED FROM THE SCREEN ON 28 AUGUST 2026, to be placed elsewhere.
  // 🔴 Until it lands, that expectation is stated NOWHERE in the flow. It is not in this corpus
  // because it is not on any screen — do not read its absence as the rule being satisfied.
  'no-website question':     'What is your web address?',
  'no-website help':         'The one people already use to find you.',
  // The result line under the field (28 August 2026). The `events.` chip beside the box is gone; the
  // whole address is stated underneath instead, and it is the SAME string that gets submitted.
  'no-website result':       'Your address will be events.yourtruck.com',
  'no-website example':      'For example, events.yourtruck.com',
  // One button now, and its label is the progress indicator.
  'address, button':         'Set up this address',
  'address, button setting': 'Setting up…',
  'address, button busy':    'Checking…',
  'address, button provision': 'Set up this address',
  // The provisioning-failure state (V11.50): its own block beside the button, and the button renames.
  'provision failed, heading': 'We could not set that address up.',
  'provision failed, retry': 'Try again',
  'address, dismiss':        'Not now',
  // ── The pre-flight warnings ─────────────────────────────────────────────────────────────────────
  // ⚠️ THESE WERE NEVER IN THE CORPUS AND BOTH BROKE THE RULE. The padlock warnings said "domain" and
  // "security certificates"; they now say what the operator sees instead of what the mechanism is.
  // 🔴 REVERSED 28 August 2026: a certificate problem now STOPS the run instead of being a note.
  'padlock, stopped heading':'We have not set this up.',
  'padlock, restricted':     'Whoever looks after your web address has to let us set up the padlock — the little lock customers see beside it. Until they add us it will not appear, so we have stopped rather than leave you waiting for it. Ask them to add us, then try again.',
  'padlock, blocked':        'Your web address currently blocks the padlock completely. Whoever looks after it has to allow it before this can work. Ask them to change that, then try again.',
  'collision warning':       'Something already answers on that address. Send the message on the next screen to whoever looks after it — they will know what to do.',
  'provider named':          'Your web address is looked after by Cloudflare. We will show you where to go.',
  // ── The record screen ───────────────────────────────────────────────────────────────────────────
  // ⚠️ THE THREE ROW VALUES ARE DELIBERATELY NOT HERE. "CNAME" is a banned word AND it is the thing the
  // operator types into a box — it is the provider's vocabulary, not a word we are explaining with, and
  // the file's own header makes that distinction. Putting it in the corpus would ask the checker to
  // police a value. The three HINTS beside them are ours, so they are here.
  'record, instruction':     'Add this at Cloudflare, and save.',
  'record, instruction (no provider)': 'Add this where your web address is looked after, and save.',
  'record, hint type':       'Choose this from the list.',
  'record, hint name':       'Just this word, not the whole address.',
  'record, hint value':      'Copy this exactly.',
  'record, copy button':     'Copy',
  'timing line':             'It usually starts working within an hour, though it can take longer. You do not need to keep this page open.',
  'record, email offer':     'Someone else looks after your web address?',
  'record, email button':    'Send these details',
  // 🔴 IT SAID "Done" AND NOTHING WAS DONE — the record may never have been added and nothing is
  // verified. The label now names what pressing it actually does.
  'record, close':           'Close',
  // ── Resuming a part-finished setup (the step that used to render an empty panel) ────────────────
  'resume, working':         'Picking up where you left off…',
  'resume, failed heading':  'We could not load your setup.',
  'resume, failed body':     'Nothing has changed. Try again shortly.',
  // ── The errors an operator can be shown ─────────────────────────────────────────────────────────
  // ⚠️ THE FIRST THREE GUARD A PATH THE INTERFACE CANNOT REACH now that the word in front is fixed, but
  // anything that can POST reaches the action directly, so they are still copy someone can read.
  'guard, apex':             'yourtruck.com is your whole website address. If you point that at us, your website is replaced by this page. Put a word in front of it instead — for example events.yourtruck.com.',
  'guard, too deep':         'That address has too many parts. Something like events.yourtruck.com works best.',
  'guard, www':              'www.yourtruck.com is usually where your existing website already lives. If you point that at us, your website is replaced by this page. Use a different word in front, like events.',
  // The second www case: nonsense rather than dangerous, and unreachable from the interface.
  'guard, www inner':        'That address has www in the middle of it. Take the www. off the front of your web address and try again.',
  // 🔴 THESE FOUR REPLACED THE HOSTING LAYER'S OWN MESSAGES, TWO OF WHICH WERE THE NAMES OF
  // ENVIRONMENT VARIABLES rendered in red on an operator's screen. See app/api/manage/route.ts.
  'provision failed, ours':  'Something is not set up on our side, so we could not add your address. Nothing has changed at your end. Try again shortly.',
  'provision failed, taken': 'That address is already in use somewhere else.',
  'provision failed, refused': 'We were not allowed to add that address.',
  'provision failed, other': 'We could not add that address just now. Nothing has changed at your end. Try again shortly.',
  // ── 🔴 THE ACKNOWLEDGEMENT AND THE TURN-OFF (28 August 2026). ─────────────────────────────────
  // Generated from CONFIRMED_COPY and TURN_OFF_COPY so this corpus cannot drift from what ships.
  'turn off, link':            'Turn this off',
  'turn off, heading':         'Turn off your own web address?',
  'turn off, stops':           'This will stop working:',
  'turn off, carriesOn':       'This carries on exactly as it is, and is where your QR code sends people:',
  'turn off, reAdd':           'If you are setting it up again later, leave the line you added at your web address company. If you are not, ask them to remove it.',
  'turn off, cancel':          'Keep it on',
  'turn off, confirm':         'Turn it off',
  'turn off, working':         'Turning it off…',
  'turn off, failed':          'We could not switch that off just now. Nothing has changed — your address is still working. Try again shortly.',
  'confirmed, heading':        'Thanks — that is all noted.',
  'confirmed, body':           'There is nothing else to do.',

  // ── 🔴 THE CONFIRM BLOCK (28 August 2026). It was never in this corpus at all — the checker only
  // ever knew what somebody fed it, and nobody had fed it these. Generated from CONFIRM_COPY.
  'confirm heading':         'Have a look, then tell us it is right',
  // Step 1 ends in the address, which is a link — the corpus entry is the assembled line.
  'confirm step 1':          'Open events.yourtruck.com',
  'confirm step 2':          'Check the dates and times look right.',
  'confirm button':          'Yes, it looks right',
  // ⛔ 'confirm gates nothing' REMOVED 28 August 2026 — the line is off the screen, so it is out of
  // the corpus. Its absence here is not the rule being satisfied; it is the string no longer existing.
  // ── 🔴 TWO BUTTONS NOW (28 August 2026). The old single sentence with a mailto inside it is gone.
  'confirm no button':       "No, there",
  'confirm problem line':    'Tell us what you are seeing and we will look at it.',
  'confirm problem button':  'Email us',
  'card button, live':       'View setup',

  // ── 🔴 PER-PROVIDER RECORD INSTRUCTIONS (28 August 2026). ────────────────────────────────────
  // Every string below is generated from lib/custom-domain/dns.ts, the ONE provider record, so this
  // corpus cannot drift from what the screen and the email render.
  // ⚠️ The quoted fragments are the PROVIDER'S OWN BUTTON LABELS and are stripped by the §35
  // exclusion — that is the rule, not a loophole: they are what the operator reads on their screen.
  'wix step 1':              'Open "Domains", then click the "Domain Actions" icon beside your web address.',
  'wix step 2':              'Choose "Manage DNS Records".',
  'wix step 3':              'In the "CNAME (Aliases)" section, click "+ Add Record", then click "Got it".',
  'wix step 4':              'Put the first value below in "Host Name".',
  'wix step 5':              'Put the second value below in "Value".',
  'wix step 6':              'Click "Save", then click "Save Changes" in the pop-up.',
  'wix caveat':              'If your web address only points at Wix rather than being held there, Wix cannot make this change — whoever holds it has to.',
  'wix heading':             'Add this at Wix',
  'wix help link':           "Wix's own guide to this",
  'godaddy step 1':          'Open your "Domain Portfolio" and choose your web address.',
  'godaddy step 2':          'On "Domain Settings", select "DNS".',
  'godaddy step 3':          'Select "Add New Record", then pick "CNAME" from the "Type" menu.',
  'godaddy step 4':          'Put the first value below in "Name".',
  'godaddy step 5':          'Put the second value below in "Value".',
  'godaddy step 6':          'Leave "TTL" as it is and select "Save".',
  'godaddy caveat':          'If you added more than one at once, the button says "Save All Records".',
  'godaddy heading':         'Add this at GoDaddy',
  'godaddy help link':       "GoDaddy's own guide to this",
  'cloudflare step 1':       'Open your web address, then "DNS" and "Records".',
  'cloudflare step 2':       'Select "Add record", then pick "CNAME" as the "Type".',
  'cloudflare step 3':       'Put the first value below in "Name".',
  'cloudflare step 4':       'Put the second value below in "Target".',
  'cloudflare step 5':       'Set "Proxy status" to "DNS only" — the cloud beside it must be grey, not orange.',
  'cloudflare step 6':       'Leave "TTL" as "Auto" and select "Save".',
  'cloudflare caveat':       'If the cloud stays orange the padlock will never appear, and nothing will say why.',
  'cloudflare heading':      'Add this at Cloudflare',
  'cloudflare help link':    "Cloudflare's own guide to this",
  '123reg step 1':           'Sign in to your "123 Reg Control Panel".',
  '123reg step 2':           'Beside "Domains", select "Manage All", then choose your web address.',
  '123reg step 3':           'Select "DNS", then "Add New Record".',
  '123reg step 4':           'Pick "CNAME" from the "Type" list.',
  '123reg step 5':           'Put the first value below in "Name".',
  '123reg step 6':           'Put the second value below in "Value", and add a full stop to the end of it.',
  '123reg step 7':           'Leave "TTL" as "Default" and click "Save".',
  '123reg caveat':           '123 Reg needs a full stop at the end of the second value or it will not work.',
  '123reg heading':          'Add this at 123 Reg',
  '123reg help link':        "123 Reg's own guide to this",

  // ── The Order QR code card (28 August 2026) ──────────────────────────────────────────────────────
  'QR: no custom domain':    'This QR code sends customers to your HatchGrab ordering page. If you set up your own web address later, the same QR code will send them there instead — you will not need to print a new one.',
  // ⚠️ THE PLACEHOLDER, NOT THE COPY. The live line renders `truck.custom_domain`; this entry only
  // needs a representative value, and it said `schedule.` — the word in front we no longer use.
  'QR: domain live':         'This QR code now sends customers to events.yourtruck.com. You never need to print a new one.',
  'QR: no logo':             'Add your logo to your profile and it will show here.',
  'QR: branded option':      'Your logo shown in the middle of the QR code',
  'QR: button':              'View QR code',
  'QR: preview tooltip':     'View QR code',
  'QR: locked tooltip':      'Branded codes are part of a higher plan',
  'QR: locked explanation':  'Branded codes are part of a higher plan. Your standard QR code works exactly the same for customers — the difference is your logo in the middle.',
  'QR: build failed':        'That could not be built just now. Try again shortly.',
  'QR: logo placeholder':    'Your logo here',
  'QR: standard option':     'Standard QR code',
  'QR: print or display':    'Print or display this code so customers can scan and pre-order. Place it at your hatch, on your van, or share it online.',

  // ── The lapsed-plan fallback on the operator's own domain (29 August 2026) ────────────────────
  // The ONE line a customer gets when the plan lapses, so it earns a corpus entry of its own. It read
  // 'View <name>'s schedule' and pointed at a page that says "Truck not found"; the destination is now
  // the ordering page, and the words had to stop promising a schedule page that does not exist.
  // ⚠️ A REPRESENTATIVE NAME, not a live value — the real string interpolates `truck.name`.
  // ⚠️ UPDATED 29 August 2026: was "See Pizzeria Gusto's dates and order". The wording is now the
  // destination page's own heading verbatim, which also drops a double possessive on names ending in s.
  'fallback link':           'Order from Pizzeria Gusto',
}

/**
 * ── 🔴 KNOWN VIOLATIONS — REPORTED, NOT EXCLUDED, AND NOT SILENCED. ────────────────────────────────
 * A string that genuinely breaks the rule but sits in copy the current brief may not touch. It is
 * printed in its own section on every run, with WHY it is still here, so it cannot quietly become
 * permanent — but it does not fail the exit code, because a check that is always red is a check
 * everybody learns to ignore.
 * ⚠️ THIS IS NOT AN EXCLUSION. An exclusion says "the rule does not apply here". This says "the rule
 * applies, we are breaking it, and here is the reason it is not fixed yet." Empty this list.
 */
const KNOWN = {
  'QR: print or display': 'pre-existing copy; the 28 August brief scoped changes to two lines and this was not one of them',
}

const applied = []
function strip(label, text) {
  let out = text
  for (const ex of EXCLUSIONS) {
    out = out.replace(ex.re, (m) => { applied.push({ label, why: ex.why, match: m }); return ' ' })
  }
  return out
}

let failed = 0
console.log(`\nPLAIN-ENGLISH CHECK — ${Object.keys(CORPUS).length} strings, ${BANNED.length} banned words\n`)
for (const [label, text] of Object.entries(CORPUS)) {
  const hits = BANNED.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(strip(label, text)))
  const known = KNOWN[label]
  if (hits.length && !known) failed++
  console.log(`  ${!hits.length ? 'PASS' : known ? 'KNOWN' : 'FAIL'}  ${label}`)
  if (hits.length) { console.log(`        ${text}`); console.log(`        banned: ${hits.join(', ')}`) }
}
console.log('\n  EXCLUSIONS APPLIED (printed so the exception stays auditable — §35):')
const seen = new Set()
for (const a of applied) {
  const k = `${a.label}|${a.match}`
  if (seen.has(k)) continue
  seen.add(k)
  console.log(`    ${a.label.padEnd(24)} ${JSON.stringify(a.match).padEnd(34)} ${a.why}`)
}
if (!applied.length) console.log('    none')
const knownHit = Object.keys(KNOWN)
if (knownHit.length) {
  console.log('\n  🔴 KNOWN VIOLATIONS — the rule applies and is being broken. Fix and delete the entry:')
  for (const k of knownHit) console.log(`    ${k.padEnd(24)} ${KNOWN[k]}`)
}
console.log(`\n  ${Object.keys(CORPUS).length - failed - knownHit.length}/${Object.keys(CORPUS).length} pass, ${knownHit.length} known violation(s)\n`)
process.exit(failed ? 1 : 0)
