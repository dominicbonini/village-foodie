// scripts/_demo2b-privacy.cjs — demo-2b (31 October 2026, docs/demo-2b-report.md): the ONE named change to the Privacy
// Policy — the approved "If you try the HatchGrab demo" section, added at the end of section 5 ("If you visit our
// websites"), and the document's date moved with it (19 → 31 October 2026, the document's own line AND PRIVACY_UPDATED in
// lib/legal.ts, which the manual's legal-date rule moves together).
// ⚠️ RE-PINNED (demo-2c, 31 October 2026, docs/demo-2c-report.md): the FINAL wording, made strictly true before it ships —
// in the section, the counts sentence ("…once your demo is deleted they can no longer be linked to you") and the
// claimed-demo sentence ("If you sign up, we keep the demo record for up to 30 days…"); and three sentences OUTSIDE it,
// named in EDITS: section 5's browser-storage examples (the demo orders you placed), section 5's PostHog paragraph (it does
// run on the demo — app/providers.tsx inits on every path but /embed, foreign hosts and /dashboard|/manage|/kds), and a
// "Demo data" line in section 7's list. The date stays 31 October 2026.
// A MODULE, read by the harnesses that pin the privacy policy's bytes or date (anz-terms, canada-2, ireland-3,
// us-legal-draft): each still proves "the document is its old self", now as "its old self + exactly this change".
// The words are written out here, so a later edit to them shows up as a failure rather than being absorbed.
'use strict'

const ANCHOR = "You can block or delete cookies in your browser settings, though parts of the site may stop working if you block the necessary ones.\n"
const SECTION = "\n**If you try the HatchGrab demo**\n\nWhen you build a demo from the HatchGrab website, we ask for your email address. We use it to send you a link to your demo and may contact you about setting up HatchGrab; we do this because it is in our legitimate interest to follow up on a demo you asked for. If you tick \"Send me occasional tips and news from HatchGrab\", we will also send you occasional tips and news, based on your consent; you can unsubscribe at any time, and not ticking it does not affect your demo.\n\nWe also keep the menu you upload (a photo, PDF or pasted text) and the menu we read from it. We send it to Google's Gemini service so it can read the dishes and prices, and we keep it so we can check how well that worked and help you if you go on to set up HatchGrab. It is stored privately; only HatchGrab staff can open it.\n\nWe delete your demo email, the menu file and the demo itself when the demo expires: 24 hours after you build it, or 14 days if you ask us to keep it. If you sign up, we keep the demo record for up to 30 days so your menu can move into your account, then delete it. If you sign up, your menu moves into your account, and your account's privacy terms apply from then on.\n\nWe keep anonymous counts of how far demos get, such as \"a demo was built\" or \"an order was placed\". They contain no email address, and once your demo is deleted they can no longer be linked to you.\n\nDemos we prepare for a food truck we have contacted are kept for up to 30 days and do not ask for an email.\n"
/** demo-2c: [old sentence, new sentence] outside the demo section, each applied exactly once. */
const EDITS = [
  [
    "signing you in, keeping your basket, and remembering your preferences, such as your country and postcode.",
    "signing you in, keeping your basket, remembering your preferences, such as your country and postcode, and, while you try the demo, which demo orders you placed."
  ],
  [
    "or on truck pages shown on an operator's own website.",
    "or on truck pages shown on an operator's own website. It does run on the HatchGrab demo, which shows a sample kitchen screen."
  ],
  [
    "- **Technical and security logs:** 90 days.\n",
    "- **Technical and security logs:** 90 days.\n- **Demo data:** 24 hours, or 14 days if you ask us to keep your demo; up to 30 days if you sign up from it, or for demos we prepare for a food truck we have contacted (see section 5).\n"
  ]
]
const OLD_DATE = '19 October 2026'
const NEW_DATE = '31 October 2026'

/** The privacy policy as it was + demo-2b/2c's change. Throws if an anchor or the old date line is not there exactly once. */
function apply(before) {
  if (before.split(ANCHOR).length !== 2) throw new Error('demo-2b: the section-5 anchor is not in the document exactly once')
  const dated = `**Last updated:** ${OLD_DATE}`
  if (before.split(dated).length !== 2) throw new Error('demo-2b: the old date line is not in the document exactly once')
  let out = before.replace(ANCHOR, ANCHOR + SECTION).replace(dated, `**Last updated:** ${NEW_DATE}`)
  for (const [from, to] of EDITS) {
    if (out.split(from).length !== 2) throw new Error(`demo-2c: not in the document exactly once: ${from.slice(0, 60)}`)
    out = out.replace(from, to)
  }
  return out
}

module.exports = { apply, SECTION, EDITS, OLD_DATE, NEW_DATE }
