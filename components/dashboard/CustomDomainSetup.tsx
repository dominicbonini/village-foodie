'use client'

import { useCallback, useEffect, useState } from 'react'
import { canAccess, type Plan } from '@/lib/features'
import { nativeAuthHeader } from '@/lib/native/session'
import { checkSubdomain, domainFromWebsite } from '@/lib/custom-domain/apex'
import { recordRows, providerFieldRows, TIMING_LINE, CONFIRM_COPY, CONFIRMED_COPY, TURN_OFF_COPY, confirmProblemMailto, addressUrl, orderPageUrl, type RecordRow, scanUrl } from '@/lib/custom-domain/copy'
import type { DnsProvider } from '@/lib/custom-domain/dns'

/**
 * ── "YOUR SCHEDULE AT YOUR OWN ADDRESS" ─────────────────────────────────────────────────────────
 *
 * 🔴 THE WHOLE SCREEN IS ONE RECORD AND A SAVE BUTTON, AND THAT IS THE PRODUCT. Everything before it
 * — the suggestion, the apex guard, the certificate check, naming their DNS provider — exists so that
 * by the time an operator reaches the record they have nothing left to decide.
 *
 * 🔴 PLAIN ENGLISH: our sentences carry no technical words. Quoted field labels are the PROVIDER's
 * words, and the three VALUES are things the operator types rather than prose — "CNAME" is what goes
 * in the box, not a word we are explaining with.
 */

type Props = {
  token: string
  plan: Plan
  featureOverrides: Record<string, boolean> | null
  trialExpiresAt: string | null
  truckName: string
  /** `trucks.slug` — the ORDERING page resolves in the column's slug space, not the name-derived one. */
  slug: string | null
  website: string | null
  customDomain: string | null
  setupState: 'choosing' | 'registered' | 'awaiting_dns' | null
  verifiedAt: string | null
  confirmedAt: string | null
}

type Step = 'idle' | 'address' | 'record' | 'email'

type Preflight = {
  ok: boolean
  message?: string
  address?: string
  caa?: { state: 'clear' | 'blocked' | 'restricted' | 'unknown'; issuers: string[] }
  provider?: DnsProvider | null
  already_elsewhere?: boolean | null
}

/**
 * ── 🔴 THE PREFIX IS FIXED, AND THAT REMOVES A WHOLE CLASS OF FAILURE. ─────────────────────────────
 * Every operator gets `events.<their domain>`. There is nothing to type, so there is nothing to get
 * wrong: no character rules, no leading-hyphen case, no `www` typed into the box, no empty field, and
 * none of the error messages that existed to police a decision nobody needed to make.
 *
 * ⚠️ THE GUARDS THAT POLICED IT STAY, AND THEIR JOB IS NOW DIFFERENT RATHER THAN GONE. `checkSubdomain`
 * and the server's `www` refusal now defend a path THE INTERFACE CANNOT REACH. That is correct and
 * deliberate: they are the last line before a side effect that takes over a website, and a client is a
 * courtesy — anything that can POST reaches the action directly, with no screen in the way.
 *
 * ⚠️ ONE WORD FOR EVERY TRUCK IS ALSO WHAT MAKES THE COPY POSSIBLE. "Your new address is
 * events.yourtruck.com" is a sentence; "choose a word, here are the rules" was a form.
 */
const PREFIX = 'events'

// 🔴 THE VALUES COME OUT OF THE ROWS ALREADY BUILT, NOT FROM A SECOND COMPUTATION. `rows` is what
// `recordRows` produced at provisioning time; rows[1] is the name and rows[2] is the target, in the
// order that function fixes. Re-deriving them here would be a second source for the one thing the
// operator copies — the exact fault the record pattern exists to prevent.
const subdomainOf = (rows: RecordRow[]) => rows[1]?.value ?? ''
const targetOf = (rows: RecordRow[]) => rows[2]?.value ?? ''

/** Resume: an operator returning to a part-finished setup. Only the domain half is recoverable now. */
function domainOf(full: string | null | undefined): string {
  if (!full) return ''
  const i = full.indexOf('.')
  return i > 0 ? full.slice(i + 1) : ''
}

export default function CustomDomainSetup(props: Props) {
  const { token, plan, featureOverrides, trialExpiresAt, truckName } = props
  const allowed = canAccess(plan, 'embed_schedule', featureOverrides ?? {}, trialExpiresAt)

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  // ── 🔴 THE ADDRESS IS TWO PARTS, AND ONLY ONE OF THEM IS TYPEABLE. ─────────────────────────────
  // `fixedDomain` is the operator's own domain read from `trucks.website` (captured further up the
  // manage page) and normalised. When it is present it is rendered as TEXT beside the input, never as
  // a field — which is what makes an apex and a mistyped domain unreachable from this screen.
  // ⚠️ Null only when the row has no website. Then, and only then, the operator types the domain too.
  const fixedDomain = domainFromWebsite(props.website)
  const [typedDomain, setTypedDomain] = useState(() => fixedDomain ? '' : domainOf(props.customDomain))
  // ── 🔴 THE TYPED DOMAIN GOES THROUGH THE SAME NORMALISER AS THE STORED ONE. ─────────────────────
  // `domainFromWebsite` is what the has-website path already uses on `trucks.website`: it strips the
  // scheme, the path, the port and any trailing dot, then reduces to the REGISTRABLE domain via the
  // public suffix list. There is deliberately no second normaliser.
  // 🔴 THIS CHANGES WHAT IS SUBMITTED, AND THAT IS THE POINT (28 August 2026). It used to be
  // `typedDomain.trim().toLowerCase()` with no parsing at all, so `www.yourtruck.com` built
  // `events.www.yourtruck.com` and `https://yourtruck.com/x` built `events.https://yourtruck.com/x`.
  // The screen could not honestly preview an address it was not going to create; normalising here is
  // what lets the line below state the address that will actually exist.
  // ⚠️ NULL WHEN IT CANNOT BE PARSED — a half-typed `yourtruc` included — which empties `address` and
  // disables the button rather than letting a malformed name reach the guards.
  const typedDomainNormalised = domainFromWebsite(typedDomain)
  const domain = fixedDomain ?? typedDomainNormalised ?? ''
  // The whole address. Every existing call receives exactly what it did before — one string.
  const address = domain ? `${PREFIX}.${domain}` : ''

  /**
   * ── 🔴 THE ADDRESS THE CARD NAMES. PROPS ONLY, AND THE WIZARD'S OWN NORMALISER. ─────────────────
   * `fixedDomain` above IS `domainFromWebsite(props.website)` — the one normaliser this feature has.
   * Reusing that variable rather than calling it again is the point: there is no second normalisation
   * and no second place for it to drift.
   * 🔴 A LIVE DOMAIN WINS OVER THE DERIVED ONE. `props.customDomain` is what actually exists; the
   * derived one is only what we WOULD create. They differ if an operator changes `trucks.website`
   * after setting up, and in that case the card must name the page that is really there.
   * ⚠️ DELIBERATELY NOT `address` ABOVE, THOUGH IT IS THE SAME VALUE WHEN A WEBSITE IS ON FILE.
   * `address` folds in `typedDomain`, which the operator edits inside the modal — so the card behind
   * the overlay would narrate whatever they were part-way through typing, and keep it after they
   * closed without saving. A card that says "we create a page at X" must not name an X nobody asked
   * for. Props do not move; state does.
   */
  const cardAddress = props.customDomain ?? (fixedDomain ? `${PREFIX}.${fixedDomain}` : null)
  const setAddress = (full: string) => { if (!fixedDomain) setTypedDomain(domainOf(full)) }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const [pre, setPre] = useState<Preflight | null>(null)
  const [rows, setRows] = useState<RecordRow[] | null>(null)
  const [provider, setProvider] = useState<DnsProvider | null>(null)
  const [emailTo, setEmailTo] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [confirmed, setConfirmed] = useState(!!props.confirmedAt)
  // 🔴 "No" IS A SCREEN STATE AND NOTHING ELSE. It is not sent, not stored, and not reported: it
  // reveals the email control below and brings the card's button back. An operator who presses it and
  // then decides the page is fine can still press "Yes" — there is nothing to undo because nothing
  // happened. ⚠️ It is deliberately NOT part of `confirmed`, which is a server fact.
  const [saidNo, setSaidNo] = useState(false)
  // 🔴 THE TURN-OFF IS TWO STEPS AND THE FIRST ONE IS NOT A REQUEST. `offAsking` only opens the
  // confirmation; nothing reaches the server until `turnOff` runs, so the panel cannot be skipped and
  // cancelling is a state change and nothing else.
  const [offAsking, setOffAsking] = useState(false)
  const [offBusy, setOffBusy] = useState(false)
  const [offError, setOffError] = useState<string | null>(null)
  const [turnedOff, setTurnedOff] = useState(false)
  // 🔴 THE THIRD RESUME OUTCOME, WHICH USED TO HAVE NO SCREEN. The effect below either lands on
  // the record step or gives up; when it gave up, `step` stayed 'idle' and NO BRANCH MATCHED 'idle',
  // so the operator got an empty white panel over a black backdrop with no text and no button.
  const [resumeFailed, setResumeFailed] = useState(false)
  // 🔴 A PROVISIONING FAILURE IS A STATE, NOT A LINE OF RED TEXT. `error` is shared by the apex
  // guard, the copy button and the email send, so it cannot tell the screen which of them failed. This
  // flag says "the last thing you pressed was Set up this address, and it did not work" — which is what
  // lets the screen stop looking identical to the screen before the press.
  const [provisionFailed, setProvisionFailed] = useState(false)
  // 🔴 ONE PRESS, TWO PHASES, AND THE BUTTON IS WHERE THE PROGRESS LIVES (28 August 2026).
  // It used to be two presses: "Check this address", then the SAME SCREEN re-rendered with a different
  // button, then "Set up this address". With no warnings to show — which is the ordinary case —
  // NOTHING VISIBLE CHANGED between them, so it read as the same page twice and the second press
  // looked like the first one having failed.
  // ⚠️ A PHASE RATHER THAN A SPINNER, because the two halves take different times for different
  // reasons: the check is up to five outbound lookups, the setup is one call to the hosting API. An
  // operator watching "Checking…" become "Setting up…" is being told it is still moving.
  const [phase, setPhase] = useState<'idle' | 'checking' | 'setting'>('idle')

  /**
   * ── 🔴 CLOSING THE WIZARD MUST DISCARD WHAT WAS DERIVED FROM AN ADDRESS. ─────────────────────────
   * `open` is only a boolean and this component never unmounts — it renders the CARD, which is always
   * on the Settings tab. So every `useState` above survives a close, and "Not now" used to clear
   * nothing at all.
   * 🔴 THE BUG THAT CAUSED: type an address, delete it, press Not now, reopen — and the line naming
   * the operator's DNS provider was still there, derived from an address no longer in the box. Worse,
   * `pre` being non-null also flipped the button to "Set up this address", so the stale screen offered
   * to provision an EMPTY address.
   * ⚠️ `rows` and `emailSent` are deliberately NOT cleared: they belong to the record step, which is
   * only reachable once a domain has actually been provisioned, and the resume effect re-reads them.
   */
  const closeWizard = useCallback(() => {
    setOpen(false)
    setPre(null)
    setProvider(null)
    setError(null)
    setProvisionFailed(false)
    setResumeFailed(false)
    setPhase('idle')
  }, [])

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch('/api/manage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await nativeAuthHeader()) },
      body: JSON.stringify({ token, action, ...extra }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Something went wrong')
    return data
  }, [token])

  /**
   * 🔴 RESUME. An operator who closed the tab returns to the record, not to the start. This matters
   * most for exactly the operators who need two attempts — the ones who had to go and find who holds
   * their domain, which is the longest gap in this whole flow.
   */
  useEffect(() => {
    if (!open || !props.customDomain || step !== 'idle') return
    let cancelled = false
    ;(async () => {
      try {
        const d = await call('domain_status')
        if (cancelled) return
        // ⚠️ THE REACHABLE-TODAY CASE. `cname_target` comes from the hosting config lookup, which needs
        // credentials that are not set, so this branch — not the catch — is the one that fires now.
        if (!d.address || !d.cname_target) { setResumeFailed(true); return }
        const v = checkSubdomain(d.address)
        setAddress(d.address)
        setRows(recordRows({ provider: null, subdomainLabel: v.ok ? v.subdomain : d.address, cnameTarget: d.cname_target }))
        setStep('record')
      } catch { if (!cancelled) setResumeFailed(true) }
    })()
    return () => { cancelled = true }
  }, [open, props.customDomain, step, call])

  /**
   * ── 🔴 ESCAPE MUST NOT CLOSE THIS WIZARD EITHER, AND TODAY THAT IS TRUE BY ACCIDENT. ────────────
   * Nothing in this component listens for a key, so Escape already does nothing to it. **A property
   * that holds because nobody wrote the opposite is not a property** — the manage page and its children
   * already carry document- and window-level Escape listeners (the delete-account dialog, the
   * walkthrough), and the next one added would dismiss a half-finished setup with no code change here.
   * So the swallow is explicit and it is in the CAPTURE phase: capture listeners on `document` run
   * before bubble listeners on `document`, which is where the existing ones are, so this reaches the
   * event first and stops it.
   * ⚠️ It is registered only while the wizard is open, so Escape behaves normally everywhere else.
   */
  useEffect(() => {
    if (!open) return
    const swallow = (e: KeyboardEvent) => { if (e.key === 'Escape') e.stopPropagation() }
    document.addEventListener('keydown', swallow, true)
    return () => document.removeEventListener('keydown', swallow, true)
  }, [open])

  if (!allowed) return null

  /**
   * ── 🔴 ONE ACTION: CHECK, THEN SET UP, THEN THE RECORD SCREEN. ──────────────────────────────────
   *
   * 🔴 WHAT STOPS IT AND WHAT DOES NOT — THIS IS THE WHOLE DESIGN DECISION.
   * A warning interrupts only when the operator can act on it and the outcome is otherwise wasted:
   *   • A CERTIFICATE-AUTHORITY PROBLEM STOPS IT. Whether the domain refuses every issuer (`blocked`)
   *     or refuses ours (`restricted`), the certificate does not issue as things stand — so carrying
   *     on would attach a domain to the hosting project that CANNOT SERVE, and leave the operator
   *     waiting for a padlock that will never appear. It is silent, which is why it must be loud here.
   *   • NOTHING ELSE STOPS IT. The provider's name is not a decision, it is an instruction, and it
   *     belongs on the record screen where they act on it. An address that already answers elsewhere
   *     is not a refusal either — the record screen already tells them what to do about it.
   *   • A pre-flight that ERRORS does not stop it. FAIL OPEN, unchanged: the check exists to make
   *     setup smoother, not to gate it.
   *   • A pre-flight that REFUSES (`ok:false`) does stop it. That is a verdict, not a warning.
   *
   * 🔴 THE PROVIDER IS PASSED AS AN ARGUMENT, NOT READ FROM STATE. `setProvider()` does not update
   * the `provider` variable in this same tick, so provisioning would build the record rows with the
   * value from the PREVIOUS render — null on a first run. That would have silently dropped the
   * provider's name from the record screen, which is the one place the brief says it is useful.
   */
  const setUp = async () => {
    // 🔴 THE APEX GUARD, CLIENT-SIDE FIRST so the message arrives without a round trip. The server
    // runs it again before the hosting call — see app/api/manage/route.ts.
    const v = checkSubdomain(address)
    if (!v.ok) { setError(v.message); return }

    setBusy(true); setError(null); setProvisionFailed(false); setPre(null); setPhase('checking')
    let flight: Preflight
    try {
      const d = await call('domain_preflight', { address })
      if (!d.ok) {
        setError(d.message || 'That address will not work.')
        setBusy(false); setPhase('idle'); return
      }
      flight = d
    } catch {
      // ⚠️ FAIL OPEN, unchanged.
      flight = { ok: true, address }
    }

    const dnsProvider = flight.provider ?? null
    setProvider(dnsProvider)

    const caa = flight.caa?.state
    if (caa === 'blocked' || caa === 'restricted') {
      // The one stop. `pre` is set so the warning block below renders it, and nothing was written.
      setPre(flight)
      setBusy(false); setPhase('idle'); return
    }

    setPhase('setting')
    try {
      const d = await call('domain_provision', { address })
      if (!d.ok) { setError(d.message || 'That address could not be set up.'); setProvisionFailed(true); return }
      const w = checkSubdomain(d.address)
      setRows(recordRows({
        provider: dnsProvider,
        subdomainLabel: w.ok ? w.subdomain : d.address,
        cnameTarget: d.cname_target ?? '',
      }))
      setStep('record')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set that up')
      setProvisionFailed(true)
    } finally { setBusy(false); setPhase('idle') }
  }

  /**
   * 🔴 THE ONLY CALLER OF `domain_turn_off`, AND IT IS REACHED ONLY FROM THE CONFIRMATION PANEL.
   * The server releases the domain from the hosting project BEFORE clearing a single column, so a
   * failure here leaves the row exactly as it was and the operator's page still serving. See the
   * handler in app/api/manage/route.ts for the three-outcome reasoning.
   */
  const turnOff = async () => {
    setOffBusy(true); setOffError(null)
    try {
      const d = await call('domain_turn_off')
      if (!d.ok) { setOffError(d.message || TURN_OFF_COPY.failed); return }
      setTurnedOff(true); setOffAsking(false)
    } catch (e) {
      setOffError(e instanceof Error ? e.message : TURN_OFF_COPY.failed)
    } finally { setOffBusy(false) }
  }

  const copy = async (text: string, which: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 2500) }
    catch { setError('Could not copy — select the writing and copy it yourself.') }
  }

  const sendEmail = async () => {
    setBusy(true); setError(null)
    try { await call('domain_send_instructions', { to: emailTo }); setEmailSent(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not send') }
    finally { setBusy(false) }
  }

  const Btn = ({ onClick, children, tone = 'primary', disabled }: { onClick: () => void; children: React.ReactNode; tone?: 'primary' | 'dark' | 'quiet'; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled}
      className={`whitespace-nowrap ${tone === 'primary' ? 'rounded-lg bg-orange-600 text-white text-sm font-bold px-4 py-2.5 hover:bg-orange-700 disabled:opacity-50'
        : tone === 'dark' ? 'rounded-lg bg-slate-900 text-white text-sm font-semibold px-3.5 py-2 hover:bg-slate-800 disabled:opacity-50'
        : 'rounded-lg border border-slate-200 text-slate-700 text-sm font-semibold px-3.5 py-2 hover:bg-slate-50 disabled:opacity-50'}`}>
      {children}</button>
  )

  /**
   * ── 🔴 THE WIZARD OPENS IN A MODAL, AND EVERYTHING BELOW IS THE SAME MARKUP IT ALWAYS WAS. ───────
   * PATTERN FOLLOWED, NOT INVENTED: `fixed inset-0 bg-black/60 z-50 flex items-center justify-center
   * p-4` with a `bg-white rounded-2xl w-full max-w-md shadow-2xl` panel — the shape used a dozen times
   * in app/manage/[token]/page.tsx (the import wizard, the van modals, the subcategory editor). The
   * backdrop closes on a click that lands ON THE BACKDROP, which is the same `e.target ===
   * e.currentTarget` test those use; the panel stops propagation so a click inside never closes it.
   *
   * ⚠️ WHY A MODAL AT ALL: expanded in place, the setup pushed the whole Settings tab down and an
   * operator halfway through the record step could scroll away from it into unrelated controls. The
   * steps are a sequence with an order; the tab is a list of independent settings.
   *
   * ✅ CLOSING MID-SETUP LOSES NOTHING, AND THAT IS A PROPERTY OF THE ROW RATHER THAN A PROMISE MADE
   * HERE. `domain_provision` writes `custom_domain` and `custom_domain_setup_state` BEFORE the record
   * screen is ever shown, and the resume effect above re-reads them on reopen and puts the operator
   * back on the record step. See the report for the one case where it does not.
   */
  const overlay = (children: React.ReactNode) => (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-5">
        {children}
      </div>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 🔴 HEADING SUPPLIED VERBATIM, 28 August 2026. It is in the OPERATOR'S language — what they
              get, not how it works. Do not "clarify" it back into technical wording.
              🔴 THE DESCRIPTION WAS REPLACED, ALSO VERBATIM, 28 August 2026. It read "Show where you are
              trading next, on your own website." and said nothing about an address; it now NAMES the
              address, because that is the one fact an operator cannot guess and the thing they are
              being asked to agree to.
              🔴 CUT TO ONE SENTENCE, 28 August 2026. The second — "Your own website stays exactly as it
              is." — is gone on instruction. ⚠️ CONSEQUENCE, STATED: NO LINE ON THIS CARD NOW SAYS THEIR
              EXISTING WEBSITE IS UNAFFECTED. The wizard still says it, once, on the address screen
              ("Your website does not change — you just add a link to the new address."), so the
              reassurance survives one screen further in — but an operator who reads only the card no
              longer gets it. */}
          <h3 className="font-bold text-slate-900">Add your schedule to your website</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {/* 🔴 THE TENSE FOLLOWS THE FACT (28 August 2026). Before setup we are describing something
                we WILL do; once it is live there is nothing left to create, and "We create a page at…"
                reads as an offer to an operator who already accepted it. Branch on `props.verifiedAt` —
                the same condition the `Live` badge above uses, so the badge and the sentence cannot
                disagree about what "live" means. ⚠️ The ADDRESS is unchanged: still `cardAddress`, still
                derived from `fixedDomain`, still no second normalisation. */}
            {props.verifiedAt ? (
              <>
                <span className="font-mono text-slate-700 break-all">{cardAddress ?? `${PREFIX}.yourtruck.com`}</span>
                {' is showing your schedule.'}
              </>
            ) : (
              <>
                {'We create a page at '}
                <span className="font-mono text-slate-700 break-all">{cardAddress ?? `${PREFIX}.yourtruck.com`}</span>
                {' showing your schedule.'}
              </>
            )}
          </p>
        </div>
        {/* ── THE ACTION SITS BESIDE THE TITLE, NOT UNDER IT. ────────────────────────────────────
            It was a full row of its own below the description, which left the right-hand half of the
            card empty on every screen wider than a phone.
            🔴 `shrink-0` HERE AND `min-w-0` ON THE TEXT BLOCK ARE THE PAIR THAT MAKES IT FIT. Without
            both, flex resolves the overflow by squeezing whichever side it reaches first: the button
            loses its padding and the label wraps mid-word, or the heading is crushed to one word per
            line. This way the heading wraps — which it is happy to do — and the control never does.
            ⚠️ BOTH LABELS ARE SHORT FOR THE SAME REASON. In the worst case ("Live" + the button on a
            320px phone) the two together take about half the width; a long label would leave the
            heading a column of single words. */}
        <div className="flex shrink-0 items-center gap-2">
          {props.verifiedAt && <span className="rounded-full bg-green-50 text-green-700 border border-green-200 text-xs font-bold px-2.5 py-1">Live</span>}
          {/* ── 🔴 THREE LABELS, ONE BEHAVIOUR. The handler is UNCHANGED (28 August 2026). ────────────
              It opens the modal at `address` when nothing is stored, and at `idle` otherwise — where
              the resume effect fetches the status and lands on THE RECORD SCREEN.
              🔴 SO ONCE THE DOMAIN IS LIVE, "Continue" WAS A LIE: nothing is in progress, and what it
              opens is the record screen — the values their web person typed in, the timing line and the
              email hatch. "View setup" is what that is.
              ⚠️ THE BUTTON MUST NOT GO. It is the ONLY route back to those values and to the email hatch
              once setup is done — an operator whose web person asks "what was that address again?" has
              nowhere else to look. Only the label changes, and only in the live state. */}
          {/* ── 🔴 ONE BUTTON AT A TIME. ─────────────────────────────────────────────────────────
              While the confirm block is showing and unanswered, this one is hidden: two buttons on one
              card, and only one of them is the thing to do.
              🔴 IT IS THE ONLY ROUTE TO THE RECORD'S FIELD VALUES AND THE EMAIL FORM, so hiding it is
              not free. It returns the moment they answer — `confirmed` after "Yes", `saidNo` after
              "No" — and "No" costs nothing, so the window is one click wide and the click is free.
              See docs/custom-domain-two-buttons-report.md §1 for what is reachable in that window. */}
          {!open && !(props.verifiedAt && !confirmed && !saidNo) && (
            <Btn onClick={() => { setOpen(true); setResumeFailed(false); setStep(props.customDomain ? 'idle' : 'address') }}>
              {!props.customDomain ? 'Set up' : props.verifiedAt ? 'View setup' : 'Continue'}
            </Btn>
          )}
        </div>
      </div>

      {/* ── THE CONFIRM STEP. ONE BUTTON, AND IT GATES NOTHING. ────────────────────────────────────
          🔴 THE CHECKLIST IS THE POINT. Without it the button records "I saw a notification" rather
          than "I looked at my page", and the confirmed column in the admin table would mean nothing.
          ⚠️ NO "SOMETHING'S WRONG" BRANCH: nothing sits behind one to triage, and a button that files
          a signal nobody reads is worse than a sentence naming who to contact. */}
      {props.verifiedAt && !confirmed && (
        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4">
          <p className="text-sm font-bold text-green-900">{CONFIRM_COPY.heading}</p>
          {/* ── 🔴 THE ADDRESS IS STEP ONE, AND STEP ONE IS THE LINK. ─────────────────────────────
              It was "Open your address and let the page load." — which named nothing and could not be
              clicked — with a SECOND copy of the address sitting above the list purely so there was
              something to click. One address, in the place the instruction actually is.
              ⚠️ `props.customDomain` IS THE TRUCK'S OWN STORED HOST, so the link cannot point anywhere
              but their page. `https://` is added here because the column holds a bare host, and a new
              tab because this card is what they come back to in order to press the button below.
              ⚠️ THE NUMBERING IS `i + 2`, because step 1 is rendered above the loop rather than in it.
              Add a step to `checklist` and it numbers itself 3. */}
          <ol className="mt-2 space-y-1">
            {props.customDomain && (
              <li className="flex gap-2 text-sm text-green-800">
                <span className="shrink-0 font-bold">1.</span>
                <span>
                  {CONFIRM_COPY.openPrefix}
                  <a
                    href={addressUrl(props.customDomain)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all font-mono font-semibold underline hover:text-green-900"
                  >
                    {props.customDomain}
                  </a>
                </span>
              </li>
            )}
            {CONFIRM_COPY.checklist.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-green-800">
                <span className="shrink-0 font-bold">{i + 2}.</span><span>{line}</span>
              </li>
            ))}
          </ol>
          {/* ── 🔴 TWO ANSWERS, THE SAME SIZE. ────────────────────────────────────────────────────
              "Yes" is BYTE-IDENTICAL to what it always was — same handler, same action, same record.
              "No" only sets a screen flag: it sends nothing, stores nothing, and reports nothing, so
              pressing it is reversible by pressing "Yes". */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={async () => {
              setBusy(true)
              try { await call('domain_confirm'); setConfirmed(true) }
              catch (e) { setError(e instanceof Error ? e.message : 'Could not save') }
              finally { setBusy(false) }
            }} disabled={busy}>{CONFIRM_COPY.button}</Btn>
            {/* ⚠️ SAME TONE AS "Yes", ON INSTRUCTION (28 August 2026). It was `tone="quiet"` — a bordered
                secondary — which made the two answers different weights on a card that is asking a
                straight question. Both are now the primary orange, so neither answer is nudged. */}
            <Btn onClick={() => setSaidNo(true)} disabled={busy}>{CONFIRM_COPY.noButton}</Btn>
          </div>
          {/* ── 🔴 REVEALED BY "No", NOT FIRED BY IT. ───────────────────────────────────────────────
              Nothing is sent until the operator clicks the control, and the control is a plain mailto —
              their own mail client, their own send button. ⚠️ The mailto is unchanged: the truck's name,
              the address and the GO-LIVE date, not today's. Today's date is already on the email the
              moment it is sent, and `new Date()` in a render is a hydration mismatch. */}
          {saidNo && (
            <div className="mt-3 rounded-lg border border-green-200 bg-white p-3">
              <p className="text-xs text-green-800 leading-relaxed">{CONFIRM_COPY.problemLine}</p>
              <a
                href={confirmProblemMailto({ truckName, address: props.customDomain ?? '', verifiedAt: props.verifiedAt })}
                className="mt-2 inline-block rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {CONFIRM_COPY.problemButton}
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── 🔴 THE ACKNOWLEDGEMENT. The block used to simply vanish on "Yes". ────────────────────
          A control that disappears on click looks like a page that lost the click — so an operator who
          is not certain it registered presses again, or goes looking for what they broke. One line.
          ⚠️ It shows only when THEY pressed it this session (`confirmed && !props.confirmedAt`), so an
          operator returning to an already-confirmed truck does not get thanked for something they did
          last week. */}
      {props.verifiedAt && confirmed && !props.confirmedAt && (
        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4">
          <p className="text-sm font-bold text-green-900">{CONFIRMED_COPY.heading}</p>
          <p className="mt-1 text-sm text-green-800">{CONFIRMED_COPY.body}</p>
        </div>
      )}

      {/* ── 🔴 TURNING IT OFF — LIVE STATE ONLY, AND BEHIND A PANEL THAT NAMES BOTH ADDRESSES. ──────
          There was no way to switch this off at all. It appears only once the domain is live, because
          there is nothing to switch off before that — a half-finished setup is released by the orphan
          sweep, not by this.
          🔴 THE PANEL CANNOT BE SKIPPED. The link only sets `offAsking`; nothing reaches the server
          until "Turn it off" inside the panel is pressed, and "Keep it on" sets the flag back with no
          request of any kind.
          🔴 BOTH ADDRESSES ARE NAMED. One stops working and one does not, and an operator told only
          the first has no way to know their QR code still works. */}
      {/* ⚠️ `(confirmed || saidNo)` ADDED 28 August 2026 — it is held until they have answered. It used
          to sit beside "Yes" and "No" on an unanswered card: three controls for one question, and the
          one that undoes everything was the same size as the two that answer it.
          🔴 `confirmed` is seeded from `props.confirmedAt`, so a truck confirmed in an earlier session
          shows it immediately — the hold is on the UNANSWERED card, not on returning operators. */}
      {props.verifiedAt && props.customDomain && !turnedOff && (confirmed || saidNo) && (
        <div className="mt-3">
          {!offAsking ? (
            <button onClick={() => { setOffAsking(true); setOffError(null) }}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600">
              {TURN_OFF_COPY.link}
            </button>
          ) : (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-bold text-red-900">{TURN_OFF_COPY.heading}</p>

              <p className="mt-3 text-xs text-red-800">{TURN_OFF_COPY.stops}</p>
              <p className="font-mono text-sm font-semibold text-red-900 break-all">{props.customDomain}</p>

              <p className="mt-3 text-xs text-red-800">{TURN_OFF_COPY.carriesOn}</p>
              <p className="font-mono text-sm font-semibold text-slate-800 break-all">
                {/* 🔴 `scanUrl`, NOT `orderPageUrl`, SINCE 29 August 2026. The line above this is
                    TURN_OFF_COPY.carriesOn — "and is where your QR code sends people" — which is a
                    claim about the QR, so it must name what the QR actually encodes. The code now
                    encodes /o/<slug>. Leaving `orderPageUrl` here would have made the sentence false
                    the moment the generator changed. */}
                {props.slug ? scanUrl(props.slug) : '—'}
              </p>

              <p className="mt-3 text-xs text-red-800 leading-relaxed">{TURN_OFF_COPY.reAdd}</p>

              {offError && <p className="mt-3 text-xs font-semibold text-red-700 leading-relaxed">{offError}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                {/* ⚠️ "Keep it on" FIRST and PRIMARY. The destructive one is the quiet one. */}
                <Btn onClick={() => { setOffAsking(false); setOffError(null) }} disabled={offBusy}>{TURN_OFF_COPY.cancel}</Btn>
                <Btn tone="quiet" onClick={turnOff} disabled={offBusy}>
                  {offBusy ? TURN_OFF_COPY.working : TURN_OFF_COPY.confirm}
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 🔴 EVERY STEP NOW LIVES IN THE MODAL. The markup inside is UNCHANGED — the steps, the
          guards, the record screen and the email are byte-for-byte what they were; only what wraps
          them moved. ⚠️ `open &&` came OFF each step's own guard because the overlay already carries
          it: two conditions for one question is how a step ends up rendering in the wrong place. */}
      {open && overlay(
        <>
        {/* ⚠️ SUPPRESSED FOR A PROVISIONING FAILURE, which renders its own block beside the button it
            belongs to. Every other error — the apex guard, the copy button, the email send — still
            surfaces here, because those have no better home. */}
        {error && !provisionFailed && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {/* ── 🔴 IDLE — THE STEP THAT RENDERED NOTHING. ─────────────────────────────────────────────
            `setStep('idle')` is what the open button seeds whenever a domain is already stored, and the
            resume effect above moves it to 'record'. WHEN THAT FETCH DID NOT PRODUCE A RECORD, NO BRANCH
            MATCHED 'idle' AND THE MODAL RENDERED AN EMPTY PANEL — white box, black backdrop, no text, no
            button, nothing to press but the backdrop itself. An operator returning to a part-finished
            setup got that, and it is reachable TODAY: `cname_target` needs hosting credentials that are
            not set, so the early return fires on every resume.
            ⚠️ TWO STATES, AND THEY ARE DIFFERENT PROMISES. Before the fetch settles we are still working,
            so it says so and offers nothing to press. After it fails we are not going to succeed by
            waiting, so it says so, says nothing has changed, and gives them a way out. */}
        {step === 'idle' && (
          <div className="mt-4">
            {resumeFailed ? (
              <>
                <p className="text-sm font-semibold text-slate-800">We could not load your setup.</p>
                <p className="mt-1 text-sm text-slate-600">Nothing has changed. Try again shortly.</p>
                <div className="mt-3">
                  <Btn onClick={closeWizard}>Close</Btn>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-600">Picking up where you left off…</p>
            )}
          </div>
        )}

        {/* ── THE ADDRESS ────────────────────────────────────────────────────────────────────────── */}
        {step === 'address' && (
          <div className="mt-4 space-y-3">
            {/* ── 🔴 WHAT IS ACTUALLY BEING DELIVERED, BEFORE ANYTHING IS ASKED. ──────────────────────
                The card's heading is in the operator's language ("add your schedule to your website"),
                which on its own reads as though the schedule appears ON their existing site, or at a path
                like yourtruck.com/schedule. IT IS NEITHER, and the second is a DIFFERENT PRODUCT WE CANNOT
                DELIVER: a path lives inside their website and only their website can serve it. What they
                get is a NEW ADDRESS WITH A WORD IN FRONT OF THEIR DOMAIN.
                🔴 THE ADDRESS IS THE EXPLANATION. This screen used to describe the shape in a sentence AND
                THEN show it twice, in a two-row block captioned "Your website today" / "Your new schedule
                address". Their existing address was never in question and never needed a caption; showing
                `events.theirtruck.co.uk` on its own says everything the block said.
                ⚠️ WHEN THERE IS NO WEBSITE ON FILE the same slot carries the field instead. The `events.`
                half is fixed text beside the box, so the shape is still visible while they type. */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-sm text-slate-700">Your schedule gets its own web address.</p>
              {fixedDomain ? (
                <p className="mt-1.5 font-mono text-base font-semibold text-slate-900 break-all">{address}</p>
              ) : (
                /* ── THE EMPTY-WEBSITE PATH KEEPS ITS FIELD. ───────────────────────────────────────────
                   We hold no website for this truck, so there is nothing to fix in place and the operator
                   types their own address.
                   🔴 THE `events.` CHIP BESIDE THE BOX IS GONE (28 August 2026). The box now holds ONE
                   thing — the address they already know — because a fragment fixed to the left of it
                   invites the question "do I type around this?". The result moved UNDERNEATH, where it
                   states the whole address rather than asking them to assemble it by eye.
                   ⚠️ THE APEX GUARD STILL DOES THE WORK THE FIXED HALF DOES ELSEWHERE, which is exactly
                   why it was kept rather than replaced — this is the one path where an operator types the
                   domain, so an apex is reachable through the field. */
                <div className="mt-2">
                  <p className="text-sm font-semibold text-slate-800">What is your web address?</p>
                  <p className="mt-0.5 text-sm text-slate-600">The one people already use to find you.</p>
                  <div className="mt-2">
                    {/* 🔴 THE KEYBOARD MUST NOT REWRITE A WEB ADDRESS (V11.50). `pizzeriagusto` was
                        being autocapitalised and autocorrected into `Pizzeria Gusto`, and this field is
                        the one that then gets POSTed. Four attributes, each doing a different job:
                        `autoCapitalize="none"` stops the first letter being upper-cased;
                        `autoCorrect="off"` stops iOS substituting a dictionary word; `spellCheck={false}`
                        stops the Android IME doing the same and removes the red underline;
                        `inputMode="url"` gives the on-screen keyboard its URL layout without touching
                        the element's type.
                        🔴 THE TYPE MUST STAY "text". An operator may reasonably type a BARE DOMAIN —
                        `yourtruck.com`, no scheme — and that is INVALID for `type="url"`, which requires
                        one. Switching the type would mark the commonest correct entry as invalid. */}
                    <input type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      value={typedDomain} onChange={e => setTypedDomain(e.target.value)}
                      placeholder="yourtruck.com" aria-label="Your own web address"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
                  </div>
                  {/* 🔴 THE RESULT, NOT A HALF-BUILT STRING. Before anything parses it shows a neutral
                      example; once it parses it states the address that WILL be created — the same string
                      `address` carries to the action, so the line and the submission cannot disagree.
                      ⚠️ An unparseable entry keeps the example rather than showing `events.` with nothing
                      after it, which is the half-built string this line exists to avoid. */}
                  <p className="mt-2 text-xs text-slate-500">
                    {address
                      ? <>Your address will be{' '}<span className="font-mono font-semibold text-slate-800 break-all">{address}</span></>
                      : <>For example,{' '}<span className="font-mono text-slate-400">{PREFIX}.yourtruck.com</span></>}
                  </p>
                </div>
              )}
              {/* 🔴 THE ONLY PLACE THIS SCREEN SAYS IT. It used to say it three times — "Your website does
                  not change at all…", "Your website keeps working exactly as it does now" on the
                  confirmation line, and a third time inside the ordering box — sixty words apart, on a
                  screen with one button. Saying it once is not a cut in meaning; three times reads as a
                  thing we are nervous about. */}
              <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                Your website does not change — you just add a link to the new address.
              </p>
              {/* ⛔ THE ORDERING LINE WAS REMOVED HERE ON 28 AUGUST 2026, TO BE PLACED ELSEWHERE.
                  It read: "Tapping Order takes customers to HatchGrab to pay, so card details stay with
                  us." 🔴 UNTIL IT LANDS SOMEWHERE, THAT EXPECTATION IS STATED NOWHERE IN THE FLOW — not
                  on this screen, not on the record screen, not in either email, not in the confirm block.
                  An operator who tells customers "order on our website" is then misled by our silence,
                  which is the exact reason it was written. It is not a caveat to bury at the end. */}
            </div>

            {/* ── 🔴 THIS BLOCK NOW MEANS "WE STOPPED", NOT "HERE IS A NOTE". ─────────────────────────
                `pre` is set ONLY when the certificate check stopped the run (see setUp). Everything
                else that pre-flight returns is carried on with, so if this is on screen, nothing was
                written and nothing was registered.
                ⚠️ THE `restricted` COPY IS REVERSED FROM WHAT IT SAID BEFORE. It used to read "this
                still works without it" and let the operator continue. It no longer does — a domain
                whose certificate cannot issue is a domain that cannot serve, and attaching it would
                leave them waiting for a padlock that never arrives. */}
            {pre && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">We have not set this up.</p>
                {/* 🔴 THE ONE THAT FAILS SILENTLY. Left unchecked, the padlock simply never appears and
                    nothing anywhere says why. */}
                {pre.caa?.state === 'restricted' && (
                  <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
                    Whoever looks after your web address has to let us set up the padlock — the little
                    lock customers see beside it. Until they add us it will not appear, so we have
                    stopped rather than leave you waiting for it. Ask them to add us, then try again.
                  </p>
                )}
                {pre.caa?.state === 'blocked' && (
                  <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
                    Your web address currently blocks the padlock completely. Whoever looks after it
                    has to allow it before this can work. Ask them to change that, then try again.
                  </p>
                )}
                {pre.already_elsewhere && (
                  <p className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 leading-relaxed">
                    {/* ⚠️ REWRITTEN: the old line said "pick a different word in front of your domain",
                        which is now advice nobody can take. It names what to do instead. */}
                    Something already answers on that address. Send the message on the next screen to
                    whoever looks after it — they will know what to do.
                  </p>
                )}
                {provider && (
                  <p className="text-xs text-slate-500">
                    Your web address is looked after by <span className="font-semibold">{provider.label}</span>. We will show you where to go.
                  </p>
                )}
              </div>
            )}

            {/* ── 🔴 A PROVISIONING FAILURE IS A STATE, NOT A LINE OF RED TEXT. ──────────────────────
                REPORTED AS "a dead screen after Set up this address". It is not a step and not a step
                ORDER problem: pressing the button calls provisioning, provisioning fails because the
                hosting credentials are not set, and the screen re-renders IDENTICALLY except for one
                small red line at the very top of a panel that scrolls. The button underneath still says
                "Set up this address", so the only thing on offer is to press the same button again with
                nothing changed.
                🔴 SO THE FIX IS THE PRESENTATION OF THE FAILURE, NOT THE ORDER OF THE STEPS. The message
                appears where the operator is looking — beside the button they just pressed — in a block
                that reads as an outcome, and the button renames itself to what pressing it now does.
                ⚠️ NO NEW STEP AND NO NEW SCREEN. There is nothing to advance to: nothing was written, so
                a retry is a retry rather than a resume into a state that never happened. */}
            {provisionFailed && error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-900">We could not set that address up.</p>
                <p className="mt-1 text-xs text-red-800 leading-relaxed">{error}</p>
              </div>
            )}

            {/* ── 🔴 ONE BUTTON, AND ITS LABEL IS THE PROGRESS INDICATOR. ────────────────────────────
                There were two, and pressing the first re-rendered the same screen with the second on it.
                The label now carries the whole journey — "Set up this address" → "Checking…" →
                "Setting up…" → the record screen — so the operator is told which half is running
                WITHOUT a second screen and without a spinner competing with the button for attention.
                ⚠️ `!address.trim()` GUARDS IT, which the second button used to lack: a stale `pre` from
                a previous open once put an ENABLED provision button in front of an EMPTY field. */}
            <div className="flex flex-wrap gap-2">
              <Btn onClick={setUp} disabled={busy || !address.trim()}>
                {phase === 'checking' ? 'Checking…'
                  : phase === 'setting' ? 'Setting up…'
                  : provisionFailed ? 'Try again'
                  : 'Set up this address'}
              </Btn>
              <button onClick={closeWizard} className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2">Not now</button>
            </div>
          </div>
        )}

        {/* ── THE RECORD ─────────────────────────────────────────────────────────────────────────── */}
        {step === 'record' && rows && (
          <div className="mt-4 space-y-4">
            {/* ── 🔴 TWO SHAPES, AND THE FALLBACK IS THE ONE MOST OPERATORS GET. ────────────────────
                `provider.steps` exists only for the four whose CURRENT help pages were read (Wix,
                GoDaddy, Cloudflare, 123 Reg — lib/custom-domain/dns.ts). Everyone else — undetected, or
                detected without verified steps — falls to the generic three rows below, unchanged.
                🔴 THE STEPS ARE NOT WRITTEN HERE. They come from the provider record, which the
                escape-hatch email renders from as well; this file holds no provider knowledge at all. */}
            {provider?.steps ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-800">Add this at {provider.label}</p>
                <a href={provider.dashboardUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block text-sm font-semibold text-orange-600 hover:underline">
                  Open {provider.label}
                </a>
                <ol className="space-y-1.5">
                  {provider.steps.steps.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700 leading-relaxed">
                      <span className="shrink-0 font-bold text-slate-400">{i + 1}.</span><span>{t}</span>
                    </li>
                  ))}
                </ol>

                {/* 🔴 THE TWO VALUES, AGAINST THE FIELD NAMES THAT PROVIDER USES — no type row, because
                    on Wix there is no type field and a row for one sends them hunting. The VALUES are
                    identical to the generic rows; only the label differs. */}
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {providerFieldRows({ steps: provider.steps, subdomainLabel: subdomainOf(rows), cnameTarget: targetOf(rows) }).map(r => (
                    <div key={r.label} className="flex items-center gap-3 p-3">
                      <div className="w-24 shrink-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{r.label}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{r.hint}</p>
                      </div>
                      <p className="flex-1 min-w-0 truncate font-mono text-sm text-slate-800">{r.value}</p>
                      <button onClick={() => copy(r.value, r.label)}
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        {copied === r.label ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>

                {provider.steps.caveat && (
                  <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
                    {provider.steps.caveat}
                  </p>
                )}

                {/* ⚠️ THEIR PAGE, LAST. Our wording goes stale the next time they redesign; theirs does not. */}
                <a href={provider.steps.helpUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block text-xs font-semibold text-slate-500 hover:underline">
                  {provider.label}&apos;s own guide to this
                </a>
              </div>
            ) : (
              <>
                {/* ⚠️ ONE LINE, NOT THREE. "Go to <provider>" / the link / "Add this, and save." were three
                    separate blocks saying one instruction. The link still carries the provider's name, so
                    the sentence does not need to say it twice. */}
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {provider ? <>Add this at {provider.label}, and save.</> : <>Add this where your web address is looked after, and save.</>}
                  </p>
                  {provider && (
                    <a href={provider.dashboardUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-1 inline-block text-sm font-semibold text-orange-600 hover:underline">
                      Open {provider.label}
                    </a>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {rows.map(r => (
                    <div key={r.label} className="flex items-center gap-3 p-3">
                      <div className="w-24 shrink-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{r.label}</p>
                        <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{r.hint}</p>
                      </div>
                      <p className="flex-1 min-w-0 truncate font-mono text-sm text-slate-800">{r.value}</p>
                      <button onClick={() => copy(r.value, r.label)}
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        {copied === r.label ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p className="text-xs text-slate-500 leading-relaxed">{TIMING_LINE}</p>

            {/* 🔴 THE ESCAPE HATCH IS HERE, NOT AFTER THEY FAIL. Many operators do not hold their own
                domain login — it sits with whoever built the site. Offering this only after a failure
                assumes they could try at all. */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Someone else looks after your web address?
              </p>
              {emailSent ? (
                <p className="mt-2 text-xs font-semibold text-green-700">Sent to {emailTo}</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)}
                    placeholder="their email address"
                    className="flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                  <Btn tone="dark" onClick={sendEmail} disabled={busy || !emailTo}>{busy ? 'Sending…' : 'Send these details'}</Btn>
                </div>
              )}
            </div>

            {/* ── 🔴 IT SAID `Done`, AND NOTHING WAS DONE. ────────────────────────────────────────────
                It is the only button on the screen, it sits directly under an email form, and pressing it
                verifies nothing: the record may never have been added. The operator who added it and the
                operator who did not pressed the same button and were both told they had finished.
                ⚠️ NO SECOND BUTTON AND NO CONFIRMATION STEP — there is nothing here to confirm against.
                The fix is only that the label stops claiming completion and names what it actually does.
                The timing line above already says what happens next and that they need not wait here. */}
            <div className="flex flex-wrap gap-2">
              <Btn onClick={closeWizard}>Close</Btn>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
