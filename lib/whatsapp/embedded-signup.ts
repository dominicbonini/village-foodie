// lib/whatsapp/embedded-signup.ts
// ── S4: THE EMBEDDED SIGNUP LAUNCHER (CLIENT SIDE). ────────────────────────────────────────────────
//
// 🔴 THIS RUNS IN THE BROWSER AND MUST STAY FREE OF SERVER IMPORTS. It loads Meta's JavaScript SDK,
// opens the Facebook Login for Business flow, and reports what came back. It performs NO Graph call and
// stores NOTHING — the code it captures goes straight to our own server route (S5), which is the only
// thing that ever talks to Meta.
//
// ── 🔴 THE 30-SECOND CODE TTL SHAPES THIS WHOLE FILE ──────────────────────────────────────────────
// Meta: "The exchangeable token code has a time-to-live of 30 seconds." So there is NO confirmation
// step, no "press continue", no queue and no user interaction between the callback firing and the POST
// to our route. The success handler is `async` and posts immediately. If you are ever tempted to add a
// modal between capture and exchange, that modal is a guaranteed failure.
//
// ── 🔴 WHY THE `featureType` PARAMETER IS NOT OPTIONAL FOR THIS PRODUCT ────────────────────────────
// Every food truck already has their number on flyers and in the WhatsApp Business app on a phone in
// the van. The DEFAULT Embedded Signup flow provisions a number into the Cloud API instead, which is
// the wrong product for them. Meta's "Onboard WhatsApp Business app users" documentation states the
// flow must be customised to enable WhatsApp Business app user onboarding (coexistence), and requires
// the customer to be on WhatsApp Business app 2.24.17 or higher.
// ⚠️ SOURCE HONESTY: Meta's *Implementation* page shows `extras: { setup: {} }` and does NOT name this
// parameter. The parameter name and value below come from Meta's onboarding-business-app-users
// documentation as surfaced in search; the coexistence page itself, as fetched, describes the
// requirement and the resulting finish type but did not render the code sample. See the S4/S5 report.
// 🔴 IF THE FLOW OPENS AND OFFERS TO PROVISION A NEW NUMBER RATHER THAN USING THE OPERATOR'S OWN, THIS
// PARAMETER IS THE FIRST THING TO CHECK — that is exactly what a wrong name here looks like.
// ── 🔴 EMBEDDED SIGNUP v4. THIS SHAPE CAME FROM META'S TOOLING, NOT FROM META'S DOCUMENTATION. ────
//
// 🔴 READ THIS BEFORE YOU "FIX" THE extras OBJECT BELOW. Meta's Embedded Signup > Versions page says,
// in as many words:
//         extras: {}   // The extras object is purposely empty for v4.
// 🔴 THAT PAGE IS WRONG. A reader who finds it will "correct" the four keys below to an empty object,
// and because the version is determined INSIDE extras, that silently drops this build to v2 — which
// Meta deprecates on 15 OCTOBER 2026. The failure would be invisible until the flow stopped opening.
//
// ── THE EVIDENCE, WHICH OUTRANKS THE PAGE ─────────────────────────────────────────────────────────
// Meta's own Embedded Signup Integration Helper (App Dashboard > WhatsApp > Embedded Signup Builder),
// with configuration 1544768623597981 selected and Feature Type set to whatsapp_business_app_
// onboarding, GENERATED this Meta-hosted landing URI:
//   https://business.facebook.com/messaging/whatsapp/onboard/?app_id=2196172484540444
//     &config_id=1544768623597981
//     &extras=%7B%22featureType%22%3A%22whatsapp_business_app_onboarding%22%2C%22sessionInfoVersion%22
//       %3A%223%22%2C%22version%22%3A%22v4%22%7D
// Decoded:
//   {"featureType":"whatsapp_business_app_onboarding","sessionInfoVersion":"3","version":"v4"}
// So v4 takes featureType AND sessionInfoVersion AND an explicit version. The Builder also showed a
// "Feature Type" selector on the v4 configuration with whatsapp_business_app_onboarding available —
// so coexistence is still an extras parameter, NOT something the login configuration sets.
//
// ⚠️ THIS IS THE FOURTH TIME IN THIS WORKSTREAM THAT META'S DASHBOARD AND META'S DOCUMENTATION HAVE
// DISAGREED. Where they conflict, the artefact the dashboard GENERATED wins: it is what Meta's own
// systems produce for this app and this configuration, and the page is a description of it.

export const COEXISTENCE_FEATURE_TYPE = 'whatsapp_business_app_onboarding'

/** Session logging version. Coexistence onboarding requires Embedded Signup WITH session logging — the
 *  message-event listener below IS that session logging, and this asks for the richer payload.
 *  ⚠️ PRESENT IN THE v4 URI META GENERATED, despite the Versions page listing `sessionInfoVersion` as a
 *  v2-only key. Same drift as the rest of this header; the generated URI wins. */
export const SESSION_INFO_VERSION = '3'

/** 🔴 THE EMBEDDED SIGNUP VERSION, EXPLICIT AND LOAD-BEARING. Meta: "The Embedded Signup version is
 *  determined inside of the extras object." 🔴 OMITTING THIS KEY DOES NOT DEFAULT TO THE LATEST — it
 *  silently selects **v2**, which Meta DEPRECATES ON 15 OCTOBER 2026. There is no error and no warning;
 *  the flow simply runs an old version until the day it stops running at all. Never remove it. */
export const EMBEDDED_SIGNUP_VERSION = 'v4'

// ── 🔴 TWO SEPARATE GRAPH VERSIONS. DO NOT COLLAPSE THEM. ─────────────────────────────────────────
// This is the version the BROWSER SDK initialises with. Meta's guidance is "set this to the latest API
// version"; latest is v26.0 (Meta's own sample still prints v25.0 — reported, not copied).
// ⚠️ THE SEND PATH IS PINNED SEPARATELY at `GRAPH_API_VERSION = 'v19.0'` in lib/meta-whatsapp.ts, past
// its deprecation date and shared with the template calls. That pin is REPORTED AND DELIBERATELY LEFT
// ALONE by this workstream: moving it changes live customer-facing sends, which is not an S4 decision.
// These two numbers are independent and are allowed to differ.
export const SDK_GRAPH_VERSION = 'v26.0'

// ── 🔴 META'S FINISH TYPES. THE FLOW'S ONLY STATEMENT OF WHAT IT ACTUALLY DID. ────────────────────
// 📄 Embedded Signup v4 specification. Free text on the wire and in the column — an unknown value must
// STORE, never fail — but these five are the documented set, and the server keys registration on them.
// 🔴 THESE ARE NOT INTERCHANGEABLE. `FINISH` provisions a NEW Cloud API number; `FINISH_WHATSAPP_
// BUSINESS_APP_ONBOARDING` adopts the operator's EXISTING one. Treating them the same either
// re-registers a live number that is already registered, or leaves a new number unregistered and mute.

/** Coexistence: the operator kept their own WhatsApp Business app number. The food-truck case. */
export const FINISH_COEXISTENCE = 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
/** The default flow: a number was provisioned into the Cloud API. NEEDS REGISTERING. */
export const FINISH_CLOUD_API = 'FINISH'
/** A WABA was shared with no phone number at all. Nothing to register, nothing to send from. */
export const FINISH_ONLY_WABA = 'FINISH_ONLY_WABA'
/** On-behalf-of migration: a number moving in from another provider. NEEDS REGISTERING. */
export const FINISH_OBO_MIGRATION = 'FINISH_OBO_MIGRATION'
/** API access granted without onboarding a number through this flow. */
export const FINISH_GRANT_ONLY_API_ACCESS = 'FINISH_GRANT_ONLY_API_ACCESS'

/** What the flow gave us on success. 🔴 `code` is a live credential for 30 seconds. */
export interface EmbeddedSignupSuccess {
  kind: 'complete'
  code: string
  wabaId: string | null
  phoneNumberId: string | null
  businessId: string | null
  finishType: string
}

/** The operator closed the flow. `currentStep` is the screen they left on — diagnostic gold. */
export interface EmbeddedSignupAbandoned {
  kind: 'abandoned'
  currentStep: string | null
  sessionId: string | null
}

/** Meta reported an error inside the flow. Carries a code and a session id support can quote. */
export interface EmbeddedSignupError {
  kind: 'error'
  errorCode: string | null
  errorMessage: string | null
  sessionId: string | null
}

export type EmbeddedSignupOutcome = EmbeddedSignupSuccess | EmbeddedSignupAbandoned | EmbeddedSignupError

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FBGlobal = any

declare global {
  interface Window {
    FB?: FBGlobal
    fbAsyncInit?: () => void
  }
}

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const SDK_SCRIPT_ID = 'facebook-jssdk'

let sdkPromise: Promise<FBGlobal> | null = null

/**
 * Load and initialise Meta's JavaScript SDK exactly once per page.
 * ⚠️ MEMOISED. Two presses of Set up must not inject two <script> tags or call FB.init twice; the
 * second press awaits the same promise. Rejects if the script cannot load, so the caller can say so
 * rather than leaving a button that does nothing.
 */
export function loadFacebookSdk(appId: string): Promise<FBGlobal> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Embedded Signup is browser-only'))
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<FBGlobal>((resolve, reject) => {
    const init = () => {
      try {
        window.FB!.init({
          appId,
          autoLogAppEvents: true,
          xfbml: true,
          version: SDK_GRAPH_VERSION,
        })
        resolve(window.FB)
      } catch (e) {
        reject(e as Error)
      }
    }

    if (window.FB) { init(); return }

    window.fbAsyncInit = init

    if (document.getElementById(SDK_SCRIPT_ID)) return   // already injected, fbAsyncInit will fire

    const s = document.createElement('script')
    s.id = SDK_SCRIPT_ID
    s.src = SDK_SRC
    s.async = true
    s.defer = true
    s.crossOrigin = 'anonymous'
    // 🔴 A BLOCKED OR OFFLINE SDK MUST FAIL LOUDLY, not leave the caller waiting forever. Ad blockers
    // and tracking-protection lists routinely block connect.facebook.net, and an operator whose button
    // silently does nothing will report it as "your site is broken".
    s.onerror = () => { sdkPromise = null; reject(new Error('Meta’s login script could not load. An ad blocker or tracking protection is the usual cause.')) }
    document.body.appendChild(s)
  })

  return sdkPromise
}

/**
 * ── 🔴 SESSION LOGGING: THE `message` EVENT LISTENER. THREE SHAPES, ALL HANDLED. ──────────────────
 * Meta posts a window message from the flow. Documented shapes:
 *   success      { type:'WA_EMBEDDED_SIGNUP', event:'<FINISH_TYPE>', data:{ waba_id, phone_number_id, business_id } }
 *   abandonment  { type:'WA_EMBEDDED_SIGNUP', event:'CANCEL',        data:{ current_step } }
 *   error        { type:'WA_EMBEDDED_SIGNUP', event:'CANCEL',        data:{ error_message, error_code, session_id } }
 * ⚠️ ABANDONMENT AND ERRORS SHARE THE `CANCEL` EVENT and are told apart by their DATA, not their event
 * name — `error_code`/`error_message` present means an error, otherwise it is an abandonment. Getting
 * this wrong silently reclassifies every failure as "they changed their mind".
 * 🔴 ORIGIN IS CHECKED. Any window can post a message; only facebook.com is trusted here.
 * 🔴 META'S SAMPLE CONTAINS FOUR `console.log(...) // remove after testing` LINES. THEY ARE NOT
 * REPRODUCED. Two of them print the message payload and the code — a credential in a browser console,
 * which is a credential in a screen-share, a support screenshot and a session recording.
 */
function listenForSession(
  onSession: (s: { waba: Partial<EmbeddedSignupSuccess>; cancel: EmbeddedSignupAbandoned | EmbeddedSignupError | null }) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    if (!/^https:\/\/(www\.)?facebook\.com$/.test(event.origin)) return
    let payload: any
    try {
      payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    } catch {
      return   // not ours; a JSON parse failure here is normal traffic, not an error
    }
    if (!payload || payload.type !== 'WA_EMBEDDED_SIGNUP') return

    const d = payload.data ?? {}
    if (payload.event === 'CANCEL') {
      const isError = d.error_code != null || d.error_message != null
      onSession({
        waba: {},
        cancel: isError
          ? { kind: 'error', errorCode: d.error_code != null ? String(d.error_code) : null,
              errorMessage: d.error_message != null ? String(d.error_message) : null,
              sessionId: d.session_id != null ? String(d.session_id) : null }
          : { kind: 'abandoned', currentStep: d.current_step != null ? String(d.current_step) : null,
              sessionId: d.session_id != null ? String(d.session_id) : null },
      })
      return
    }

    // Anything else is a finish type. 🔴 STORED AS RECEIVED — an unknown finish type must not be
    // rejected here or the flow silently fails for a case Meta added after this was written.
    onSession({
      waba: {
        wabaId: d.waba_id != null ? String(d.waba_id) : null,
        phoneNumberId: d.phone_number_id != null ? String(d.phone_number_id) : null,
        businessId: d.business_id != null ? String(d.business_id) : null,
        finishType: String(payload.event),
      },
      cancel: null,
    })
  }

  window.addEventListener('message', handler)
  return () => window.removeEventListener('message', handler)
}

/**
 * Open the flow and resolve with exactly one outcome.
 *
 * ⚠️ TWO INDEPENDENT SOURCES OF TRUTH, JOINED HERE. The `message` event carries the ids and the finish
 * type; the FB.login CALLBACK carries the code. Neither alone is enough, and they can arrive in either
 * order — so this waits for the callback (which always fires last, on close) and merges whatever the
 * listener saw.
 * 🔴 RESOLVES, NEVER THROWS, FOR A USER-VISIBLE OUTCOME. Abandonment is not an exception; it is an
 * answer. Only an SDK that will not load rejects.
 */
export function launchEmbeddedSignup(opts: { appId: string; configId: string }): Promise<EmbeddedSignupOutcome> {
  return loadFacebookSdk(opts.appId).then(FB => new Promise<EmbeddedSignupOutcome>(resolve => {
    let session: Partial<EmbeddedSignupSuccess> = {}
    let cancel: EmbeddedSignupAbandoned | EmbeddedSignupError | null = null
    const stop = listenForSession(s => {
      if (s.cancel) cancel = s.cancel
      else session = { ...session, ...s.waba }
    })

    FB.login(
      (response: any) => {
        stop()
        const code = response?.authResponse?.code
        // 🔴 NO `console.log('response: ', code)`. Meta's sample has exactly that line, twice, marked
        // "remove after testing". A code in the console is a credential in the console.
        if (typeof code === 'string' && code) {
          resolve({
            kind: 'complete',
            code,
            wabaId: session.wabaId ?? null,
            phoneNumberId: session.phoneNumberId ?? null,
            businessId: session.businessId ?? null,
            finishType: session.finishType ?? '',
          })
          return
        }
        if (cancel) { resolve(cancel); return }
        // No code and no session message: the window was closed before anything happened.
        resolve({ kind: 'abandoned', currentStep: null, sessionId: null })
      },
      {
        config_id: opts.configId,
        response_type: 'code',
        override_default_response_type: true,
        // ── 🔴 THE v4 extras OBJECT. FOUR KEYS. SEE THE MODULE HEADER BEFORE CHANGING ANY OF THEM. ──
        // 🔴 `version` IS WHAT MAKES THIS v4. Remove it and the flow silently drops to v2, which Meta
        // deprecates on 15 October 2026 — no error, no warning, just an old version until it dies.
        // ⚠️ `setup: {}` IS KEPT EVEN THOUGH META'S GENERATED URI OMITS IT. It is still in the current
        // implementation page's FB.login sample, it is an EMPTY object so it carries no data and can
        // change no behaviour, and the generated URI is a LANDING-PAGE form of the flow rather than the
        // FB.login form — an omission there is not evidence that FB.login rejects it. Keeping the
        // documented key is the lower-risk half of a disagreement we cannot test without HTTPS.
        extras: {
          setup: {},
          featureType: COEXISTENCE_FEATURE_TYPE,
          sessionInfoVersion: SESSION_INFO_VERSION,
          version: EMBEDDED_SIGNUP_VERSION,
        },
      },
    )
  }))
}
