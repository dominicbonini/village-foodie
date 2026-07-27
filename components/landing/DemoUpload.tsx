'use client'

// components/landing/DemoUpload.tsx
// The public demo entry point (spec Stage 1-2, §11).
//
// ── HOW ALL SIX CTAs OPEN ONE MODAL ────────────────────────────────────────────────────────────────
// The landing page is a SERVER component, so its CTAs can't hold an onClick, and the modal state has to
// live somewhere every one of them can reach. Three parts, exported from here:
//   <DemoModalProvider>  — client context holding `open`. Wraps the whole page tree; a client component
//                          can take server-rendered children, so nothing else has to become a client
//                          component.
//   <DemoCta>            — a client <button> that opens it. Drops in where each `<a href="#try">` was,
//                          taking the same className so the page's styling is untouched.
//   <DemoModal>          — the modal itself, mounted ONCE at the end of the page.
// Context over a window CustomEvent: type-safe, no listener lifecycle to get wrong, and the dependency is
// visible in the tree rather than implied by a magic string.
//
// ⚠️ FIXED-HEIGHT MODAL RULE (reference manual): header shrink-0 · body flex-1 min-h-0 overflow-y-auto ·
// footer shrink-0. The failure screen is tall (three fallback routes + an email field) and would push the
// footer off-screen on a short viewport without it. That bug has bitten this codebase before.
//
// Behaviour below the presentation layer is UNCHANGED: same endpoint, same load-screen timing, same
// failure handling. Rate limiting and the size/type caps live server-side and are untouched.

import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { DEMO_TEMPLATES } from '@/lib/demo-templates'
import { MenuUploadFields } from '@/components/menu/MenuUploadFields'

type Phase = 'idle' | 'working' | 'menu_failed' | 'error'

// Framed around THEIR menu, not around us (spec Stage 2). No feature carousel, no tips.
//
// ⚠️ THESE ARE TIMED, NOT REAL PROGRESS — and cannot be otherwise here. /api/demo is ONE blocking fetch
// with no job id / poll / early return (deliberately, per spec), so the client has NO signal for when
// Gemini finishes vs when the commit starts — "Reading your menu…" cannot be literally tied to the model
// returning. The schedule MIRRORS where wall-clock goes on a ~40-45s provision: reading (the Gemini call)
// is the long pole (stage 1 holds ~20s); the later stages step quickly through commit / event+kitchen /
// build. The last stage lands at 35s and then HOLDS until the response — ~5-10s on a typical run, which is
// expected and accepted.
//
// ── ON A FAST RESPONSE: FLUSH, don't jump (see submit()). If the response arrives before the schedule has
// completed, the remaining stages are PLAYED so the sequence visibly finishes, then it redirects — but the
// whole flush is capped at 2s total (min 1s/stage, shared when >2 remain). A response AFTER the schedule
// completes (the normal ~40-45s case) redirects immediately with no added delay. This honours §2 ("degrade
// gracefully if fast; never pad the wait"): a bounded 2s of visual completion, never an unbounded pad.
const STEPS = [
  { at: 0,      label: 'Reading your menu…' },
  { at: 20_000, label: 'Found your items…' },
  { at: 25_000, label: 'Setting up your kitchen…' },
  { at: 30_000, label: 'Building your ordering page…' },
  { at: 35_000, label: 'Almost ready…' },
]

// A template provision makes NO Gemini call, so "Reading your menu…" would be a lie (§11 — never present a
// sample as their own). SAME schedule (.at) as STEPS so the flush/timing logic is unchanged — only the
// LABELS differ, and none claims to read anything. A template run finishes in ~10-15s, so most flush.
const TEMPLATE_STEPS = [
  { at: 0,      label: 'Building your sample truck…' },
  { at: 20_000, label: 'Setting up the menu…' },
  { at: 25_000, label: 'Setting up the kitchen…' },
  { at: 30_000, label: 'Building the ordering page…' },
  { at: 35_000, label: 'Almost ready…' },
]

// ONE unlabelled sample only (Pizza). Burger + Curry stay authored in lib/demo-templates.ts but are no
// longer offered anywhere in this modal. The control never names the cuisine ("See sample menu", no 🍕) so
// the sample can be re-themed later without touching any copy — SAMPLE_TEMPLATE is the single source.
const SAMPLE_TEMPLATE = DEMO_TEMPLATES.find(t => t.id === 'pizza') ?? null

/** Total time budget for playing out any stages still pending when the response lands (§2 bounded cost). */
const MAX_FLUSH_MS = 2_000

// A non-blocking reassurance if the provision runs long. NOTE the client can't observe GEMINI specifically
// (single blocking request, above) — this fires on elapsed wall-clock from submit, not on any AI signal.
const SLOW_PROMPT_AT = 60_000
// 15s AFTER the first prompt, offer the authored sample menus as an ESCAPE HATCH. Deliberately later than
// the reassurance: the first message is "hang on", not "give up". Taking a sample ABORTS the in-flight
// fetch (the server-side provision finishes and orphans a demo truck — reclaimed by the cleanup sweep).
//
// ⚠️ MUST STAY BELOW the server's per-attempt Gemini abort (EXTRACT_TIMEOUT_MS = 90s, lib/menu-extract.ts).
// It was 90s — level with the abort — so the offer and the failure screen raced: the visitor could watch
// the escape hatch appear and be replaced a second later by "we couldn't read that menu", which reads as
// the offer being snatched away. 75s gives a clear 15s window to take it before the server decides.
const SAMPLE_OFFER_AT = 75_000

// ── Context ─────────────────────────────────────────────────────────────────────────────────────────
const DemoModalCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null)

export function DemoModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <DemoModalCtx.Provider value={{ open, setOpen }}>{children}</DemoModalCtx.Provider>
}

function useDemoModal() {
  const ctx = useContext(DemoModalCtx)
  if (!ctx) throw new Error('DemoCta/DemoModal must be inside <DemoModalProvider>')
  return ctx
}

/** Drop-in replacement for the old `<a href="#try">` CTAs — opens the modal wherever the visitor is,
 *  instead of scrolling them to a section. Same className in, same look out. */
export function DemoCta({ className, children }: { className?: string; children: React.ReactNode }) {
  const { setOpen } = useDemoModal()
  return (
    <button type="button" className={className} onClick={() => setOpen(true)}>
      {children}
    </button>
  )
}

// ── The modal ───────────────────────────────────────────────────────────────────────────────────────
export function DemoModal() {
  const { open, setOpen } = useDemoModal()
  const [phase, setPhase] = useState<Phase>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [slowPrompt, setSlowPrompt] = useState(false)   // 60s non-blocking reassurance (message, not cancel)
  const [sampleOffer, setSampleOffer] = useState(false) // 90s: add the sample-menu escape hatch to that prompt
  const [templateRun, setTemplateRun] = useState(false) // this submit is a SAMPLE (no Gemini) → template load labels
  const [failedTruckId, setFailedTruckId] = useState<string | null>(null)

  const [buildEmail, setBuildEmail] = useState('')
  const [buildSent, setBuildSent] = useState(false)
  const [buildBusy, setBuildBusy] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const stepIdxRef = useRef(0)  // mirrors stepIdx (kept in sync by the stage timers) so the flush can read the
                                // current stage without Date.now() — the React Compiler flags Date.now() as impure
  const abortRef = useRef<AbortController | null>(null)   // in-flight /api/demo fetch — aborted when a sample is taken
  const requestSeq = useRef(0)  // supersede guard: a stale (aborted/replaced) submit must not setState over the new one
  useEffect(() => () => { timers.current.forEach(clearTimeout); abortRef.current?.abort() }, [])

  // PORTAL — the modal renders into <body>, NOT inside the landing page's tree.
  // ⚠️ WHY THIS MATTERS: landing.css carries a scoped reset, `.hg-landing * { margin:0; padding:0 }`.
  // That selector has the SAME specificity as Tailwind's `px-6`/`pt-6`, and landing.css loads later, so
  // it WINS — every padding utility inside the modal was being zeroed, which is what made it look
  // stretched edge-to-edge. Portalling out of `.hg-landing` removes the modal from that reset's reach
  // entirely, so it renders with the same Tailwind rhythm as the Manage importer. A fixed-position
  // overlay belongs on <body> anyway. Beating the reset with !important would have been a fragile
  // whack-a-mole across every utility the modal uses.
  // No `mounted` flag needed (and it tripped react-hooks/set-state-in-effect): `open` starts false and can
  // only flip via a user click, which is necessarily post-hydration — so SSR never reaches the portal. The
  // `typeof document` guard below is belt-and-braces.

  const close = useCallback(() => {
    if (phase === 'working') return          // never yank the modal mid-provision
    timers.current.forEach(clearTimeout)
    setOpen(false)
    abortRef.current?.abort()
    setPhase('idle'); setFile(null); setText(''); setMessage(null); setSlowPrompt(false); setSampleOffer(false); setTemplateRun(false)
    setBuildEmail(''); setBuildSent(false); setFailedTruckId(null)
  }, [phase, setOpen])

  // Escape closes — same guard as the backdrop and the ×.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const advanceStep = (i: number) => { stepIdxRef.current = i; setStepIdx(i) }

  const startProgress = () => {
    advanceStep(0)
    setSlowPrompt(false)
    setSampleOffer(false)
    timers.current.forEach(clearTimeout)
    // Steps advance on a schedule. On response the redirect either fires immediately (schedule already
    // complete) or FLUSHES the remaining stages within a 2s cap first (see submit()) — never an unbounded
    // pad. The 60s slow-prompt timer rides in the SAME array so every clear site (response, close,
    // re-submit) cancels it too — it is a message that appears, never a state the redirect waits on.
    timers.current = [
      ...STEPS.slice(1).map((s, i) => setTimeout(() => advanceStep(i + 1), s.at)),
      setTimeout(() => setSlowPrompt(true), SLOW_PROMPT_AT),
      setTimeout(() => setSampleOffer(true), SAMPLE_OFFER_AT),
    ]
  }

  const submit = async (opts: { templateId?: string } = {}) => {
    setTemplateRun(!!opts.templateId)   // choose the load labels: template run makes no Gemini call
    // Supersede + abort bookkeeping: each submit gets a fresh sequence number and its own AbortController.
    // Taking a sample menu aborts the previous fetch and starts this one; the aborted one's continuation
    // sees a stale seq and bails, so two provisions never race the modal into inconsistent state.
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const seq = ++requestSeq.current
    const stale = () => requestSeq.current !== seq

    setPhase('working'); setMessage(null); startProgress()
    try {
      const fd = new FormData()
      if (opts.templateId) fd.append('template', opts.templateId)
      else {
        if (file) fd.append('file', file)
        if (text.trim()) fd.append('text', text.trim())
      }
      const res = await fetch('/api/demo', { method: 'POST', body: fd, signal: ac.signal })
      const data = await res.json()
      if (stale()) return                    // a newer submit (or a sample) replaced this one — do nothing
      timers.current.forEach(clearTimeout)   // stop the scheduled advances; the flush below drives stepIdx

      if (data.ok && data.redirectTo) {
        // FLUSH-THEN-REDIRECT (§2 bounded). If the response beat the schedule, play out the stages that
        // haven't shown yet so the sequence visibly completes — but cap the WHOLE flush at MAX_FLUSH_MS
        // (min 1s/stage, shared when >2 remain). If the schedule already finished (the normal ~40-45s
        // case) there's nothing pending → redirect with zero added delay.
        const curIdx = stepIdxRef.current   // where the schedule actually is (mirrored by the stage timers)
        const remaining = STEPS.length - 1 - curIdx
        if (remaining > 0) {
          const perStage = Math.min(1000, MAX_FLUSH_MS / remaining)
          for (let i = curIdx + 1; i < STEPS.length; i++) {
            await new Promise(r => setTimeout(r, perStage))
            advanceStep(i)
          }
        }
        // Full navigation: the demo dashboard is a different app shell and should start from a clean
        // mount. `.assign()` rather than `location.href =` — identical semantics, but an assignment trips
        // react-hooks/immutability inside a component.
        window.location.assign(data.redirectTo)
        return
      }
      if (data.outcome === 'menu_failed') {
        setFailedTruckId(data.truckId ?? null); setPhase('menu_failed'); return
      }
      setMessage(data.error || 'Something went wrong. Please try again.')
      setPhase('error')
    } catch {
      // An AbortError here is EXPECTED when a sample replaced this fetch — the stale guard suppresses it
      // (the newer submit owns the modal). A genuine network error on the current request falls through.
      if (stale()) return
      timers.current.forEach(clearTimeout)
      setMessage('We couldn’t reach the server. Check your connection and try again.')
      setPhase('error')
    }
  }

  const sendBuildRequest = async () => {
    setBuildBusy(true)
    try {
      const res = await fetch('/api/demo/build-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: buildEmail.trim(), truckId: failedTruckId }),
      })
      const data = await res.json()
      if (data.ok) setBuildSent(true)
      else setMessage(data.error || 'Couldn’t send that — try again.')
    } catch {
      setMessage('Couldn’t send that — try again.')
    } finally {
      setBuildBusy(false)
    }
  }

  const canSubmit = !!file || !!text.trim()
  // Which load labels to show. Same schedule either way (STEPS/TEMPLATE_STEPS share .at), so only the
  // working-view text changes — a template run never shows "Reading your menu…".
  const shownSteps = templateRun ? TEMPLATE_STEPS : STEPS
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    // p-4 on phones, more air on larger screens so the card never crowds the viewport edge.
    // `hg-demo-modal` re-declares the landing page's tokens (landing.css) — the portal is outside
    // `.hg-landing`, so without it var(--orange) would resolve to nothing. It brings the TOKENS only,
    // not the scoped reset that was flattening the padding.
    <div className="hg-demo-modal fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 sm:p-6" onClick={close}>
      {/* Mirrors the Manage "Import your menu" modal: rounded-2xl, max-w-md, shadow-2xl, p-6 rhythm — but
          as a three-part flex shell so the tall failure screen can't push the footer off-screen. The p-6
          lives on header/body/footer rather than the card, which is what lets the body scroll. */}
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] text-left"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Upload your menu"
      >
        {/* ── Header (shrink-0) — matches Manage's h3 mb-1 + copy mb-5 ── */}
        <div className="px-6 pt-6 pb-5 shrink-0 relative">
          {/* Title AND its intro paragraph centred, as one header block; the × is absolutely positioned
              so the centring is true rather than centred-within-the-space-left-over. The FORM below stays
              left-aligned — labelled fields read wrong centred. */}
          <h3 className="font-black text-slate-900 mb-1 text-center px-6">
            {phase === 'menu_failed' ? 'We couldn’t read that menu' : '✨ Upload your menu'}
          </h3>
          {phase !== 'working' && (
            <button type="button" onClick={close} aria-label="Close"
              className="absolute top-4 right-5 text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
          )}
          {(phase === 'idle' || phase === 'error') && (
            // NO "you review everything before it saves" — that's true in Manage, NOT here. The demo is
            // built and shown immediately, so promising a review step would be a promise we don't keep.
            <p className="text-slate-600 text-sm text-center">
              A photo of your menu board, a screenshot, a PDF, or paste it as text. Our AI reads it and
              builds you a working ordering page — your items, your prices — in about 30 seconds. No
              sign-up, no card.
            </p>
          )}
          {phase === 'menu_failed' && (
            <p className="text-slate-600 text-sm text-center">
              Sometimes a photo is too dark, too angled, or handwritten. That’s ours to handle, not
              something you did wrong. A few ways forward:
            </p>
          )}
        </div>

        {/* ── Body (flex-1 min-h-0 overflow-y-auto) ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          {phase === 'working' && (
            // The one deliberately centred block: it's a progress indicator, not body copy.
            <div className="py-8 flex flex-col items-center gap-3 text-center" aria-live="polite" aria-busy="true">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-[var(--orange)] rounded-full animate-spin" />
              <p className="font-black text-slate-900">{shownSteps[stepIdx].label}</p>
              <div className="flex gap-1.5" aria-hidden>
                {shownSteps.map((s, i) => (
                  <span key={s.at} className={`w-7 h-1 rounded-full transition-colors ${i <= stepIdx ? 'bg-[var(--orange)]' : 'bg-slate-200'}`} />
                ))}
              </div>
              <p className="text-slate-500 text-xs">This usually takes about 30 seconds.</p>

              {/* 60s NON-BLOCKING reassurance. The in-flight /api/demo request is UNTOUCHED — "Keep waiting"
                  (the PRIMARY action) only dismisses this message; there is no cancel. At 90s (sampleOffer)
                  the authored sample menus appear below as an ESCAPE HATCH — taking one ABORTS the in-flight
                  fetch and provisions the template instead (§11: unmistakably a sample, never a silent swap). */}
              {slowPrompt && (
                <div className="mt-2 w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left">
                  <p className="text-sm font-semibold text-amber-900">This is taking longer than usual — big menus sometimes do.</p>
                  <button type="button" onClick={() => { setSlowPrompt(false); setSampleOffer(false) }}
                    className="mt-1.5 text-xs font-bold text-amber-800 underline underline-offset-2 hover:text-amber-900">
                    Keep waiting
                  </button>

                  {sampleOffer && SAMPLE_TEMPLATE && (
                    <div className="mt-3 pt-3 border-t border-amber-200">
                      <p className="text-xs font-bold text-amber-900 mb-1">Or look round with a sample menu while you wait</p>
                      <p className="text-xs text-amber-800/80 mb-2">
                        This <strong>won’t be your menu</strong> — it’s a stand-in so you can see how it works.
                      </p>
                      <button type="button" onClick={() => submit({ templateId: SAMPLE_TEMPLATE.id })}
                        className="w-full border border-amber-300 bg-white text-slate-700 font-medium py-2 rounded-xl text-sm hover:bg-amber-50">
                        See sample menu
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === 'menu_failed' && (
            <div className="space-y-5 pb-1">
              {/* TRY AGAIN — re-submit the SAME file/text (both retained on this screen; only "Try a
                  different photo" clears them). The most common recovery for a transient failure or a
                  Gemini timeout, so it leads and is the primary action. */}
              {canSubmit && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Try again</label>
                  <button type="button" onClick={() => submit()}
                    className="w-full bg-[var(--orange)] text-white font-black py-2.5 rounded-xl text-sm hover:bg-[var(--orange-deep)]">
                    Try this photo again
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Try a different photo</label>
                <button type="button"
                  onClick={() => { setFile(null); setText(''); setMessage(null); setPhase('idle') }}
                  className="w-full border border-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm hover:bg-slate-50">
                  ← Upload another photo
                </button>
              </div>

              {/* SEE A SAMPLE MENU — the "clearly-marked slot" (spec §11). Rendered ONLY when templates
                  exist, so when the Pizza/Burgers/Curries set is parked/empty there is no dead header and
                  no button that leads nowhere; it appears automatically once templates are authored. */}
              {SAMPLE_TEMPLATE && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Or look round with a sample menu</label>
                  {/* NEVER present a template as their own menu — for this audience a discovered deception
                      costs far more than a visible fallback (§11). */}
                  <p className="text-xs text-slate-600 mb-2">
                    This <strong>won’t be your menu</strong> — it’s a stand-in so you can see how it works.
                  </p>
                  <button type="button" onClick={() => submit({ templateId: SAMPLE_TEMPLATE.id })}
                    className="w-full border border-slate-200 text-slate-700 font-medium py-2 rounded-xl text-sm hover:bg-slate-50">
                    See sample menu
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Or we’ll build it for you</label>
                {buildSent ? (
                  <p className="text-sm text-emerald-700 font-semibold">✓ Thanks — we’ve got it. We’ll email you.</p>
                ) : (
                  <>
                    <p className="text-xs text-slate-600 mb-2">
                      Leave your email and a real person will put your menu in and send you the link.
                    </p>
                    <div className="flex gap-2">
                      <input type="email" inputMode="email" autoComplete="email"
                        value={buildEmail} onChange={e => setBuildEmail(e.target.value)}
                        placeholder="you@yourtruck.co.uk"
                        className="flex-1 min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--orange)]" />
                      <button type="button" onClick={sendBuildRequest}
                        disabled={buildBusy || !buildEmail.includes('@')}
                        className="bg-[var(--orange)] text-white font-bold px-4 rounded-xl text-sm disabled:opacity-40 hover:bg-[var(--orange-deep)]">
                        {buildBusy ? '…' : 'Send'}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {message && <p className="text-sm text-red-600">{message}</p>}
            </div>
          )}

          {(phase === 'idle' || phase === 'error') && (
            <>
              {phase === 'error' && message && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{message}</p>
              )}
              {/* SHARED with Manage → Menu's importer — one dropzone, one set of section labels. */}
              <MenuUploadFields file={file} onFile={setFile} text={text} onText={setText} accent="landing" />

              {/* FRONT-DOOR sample entry — SUBORDINATE to the upload (smaller, muted, below a divider) so
                  uploading their own menu stays the obvious primary path. For a visitor with no photo to
                  hand. §11: framed unmistakably as a sample, never a silent substitute. */}
              {SAMPLE_TEMPLATE && (
                <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                  <p className="text-sm font-semibold text-slate-700">Haven&apos;t got a menu photo to hand?</p>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">Look round with a sample truck instead — you can upload yours any time.</p>
                  {/* One unlabelled, SUBORDINATE button (not full-width, muted) — the upload above stays the
                      obvious primary path. No cuisine named, so the sample can be re-themed without copy. */}
                  <button type="button" onClick={() => submit({ templateId: SAMPLE_TEMPLATE.id })}
                    className="inline-block border border-slate-200 text-slate-600 font-medium py-1.5 px-4 rounded-xl text-sm hover:bg-slate-50">
                    See sample menu
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer (shrink-0) — Manage's mt-5 rhythm ── */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="px-6 pt-5 pb-6 shrink-0">
            <button type="button" onClick={() => submit()} disabled={!canSubmit}
              className="w-full bg-[var(--orange)] text-white font-black py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-[var(--orange-deep)]">
              Build my demo →
            </button>
            <p className="text-xs text-slate-500 mt-2 text-center">Nothing is published — only you can see it.</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
