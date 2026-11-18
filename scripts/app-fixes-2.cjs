#!/usr/bin/env node
// scripts/app-fixes-2.cjs — app-fixes-2 (15 November 2026, docs/app-fixes-2-report.md). Swept. Reads source files only:
// no server, no browser, no database. (The screenshots are scripts/app-fixes-2-screens.cjs, run by hand.)
//   §1 one word for logging in: "Log in", never "Sign in", in HatchGrab's own words (third-party steps left alone); the
//      app-fixes-1 duplicates merged; Bengali / Hindi / Urdu use their own landing-page "log in" word
//   §2 the dashboard's "Access denied" screen has a "Back to log in" button to /login (the web and the app)
//   §3 inside the app, /dev goes to /app; /signup, /setup and /admin stay
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const ts = require(path.join(REPO, 'node_modules/typescript'))
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8')
const json = p => JSON.parse(read(p))
const get = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o)
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const leaves = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o || {})) { const id = p ? `${p}.${k}` : k; if (typeof v === 'string') out[id] = v; else leaves(v, id, out) } return out }
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)
function loadTs(p) {
  const out = ts.transpileModule(read(p), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const m = { exports: {} }; new Function('module', 'exports', 'require', out)(m, m.exports, require); return m.exports
}

const EN = json('messages/en-GB.json')
const BASES = JSON.parse(read('lib/i18n/locales.ts').match(/export const LANGUAGE_BASES[^=]*=\s*(\[[^\]]*\])/)[1].replace(/'/g, '"'))
const LOCALES = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))

/** Dominic's wording (app-fixes-2 §1), exactly. */
const WORDING = {
  'auth.login.title': 'Log in to your kitchen',
  'auth.login.submit': 'Log in',
  'auth.login.submitting': 'Logging in…',
  'auth.forgot.back': 'Back to log in',
  'auth.login.resetSuccess': 'Password updated. Please log in.',
  'auth.login.emailChanged': 'Email address updated. Please log in with your new email address.',
  'auth.signup.signIn': 'Log in',
  'auth.signup.haveAccount': 'Already have an account? Log in',
  'auth.sessionAlert.title': 'Your login needs attention',
  'auth.sessionAlert.body': 'Everything on screen is still here. New changes may not save until you log in again.',
  'auth.sessionAlert.signIn': 'Log in again',
  'errorsOnboarding.not_signed_in': 'Not logged in',
  'errorsOnboarding.account_exists': 'There’s already an account with that email — log in instead.',
  'errorsOnboarding.deletion_sign_in': 'Log in to request account deletion.',
  'errorsManage.sign_in_required': 'Log in required',
  'errorsKitchen.sign_in_check_failed': 'Could not check your login right now',
  'demoGetStarted.signIn': 'Log in',
  'userMenu.signOut': 'Log out',
  'manageMenuImport.discard.setupBody': 'Your account and truck are saved — nothing is lost. You can add your menu any time: log in and tap <b>Import menu</b> on your menu screen to pick up right here.',
  'managePayments.admin.body': 'This truck has not set up online payments. Only the owner can start it, from their own logged-in account — there is nothing to press here.',
}
// managePayments.permission.body names the payment provider, a word the sweep's runner refuses in a harness (run-harnesses.cjs
// screen), so it is checked by its changed words instead of whole.
const PARTLY = { 'managePayments.permission.body': 'so it has to be set up from their own logged-in account. Nothing is wrong with this truck or with HatchGrab.' }
/** Left alone on purpose: another company's own wording, and the comparison table's row (Dominic, app-fixes-2). */
const THIRD_PARTY = ['managePayments.onboarding.restricted', 'managePayments.onboarding.firstRun', 'customDomain.providers.123reg.signIn', 'comparison.features.staff.explain']
const SIGN = /\bsign(?:ed|ing|s)?[ -]?(?:in|out)\b/i

// ══ §1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('§1 · "Log in", never "Sign in"')
{
  const en = leaves(EN)
  for (const [k, v] of Object.entries(WORDING)) t(`en-GB ${k}: ${JSON.stringify(v)}`, en[k] === v, en[k])
  for (const [k, v] of Object.entries(PARTLY)) t(`en-GB ${k}: …${JSON.stringify(v)}`, (en[k] || '').endsWith(v), en[k])
  const left = Object.entries(en).filter(([k, v]) => SIGN.test(v) && !THIRD_PARTY.includes(k)).map(([k, v]) => `${k}: ${v}`)
  t('en-GB: no other HatchGrab message says sign in / sign out', left.length === 0, left.join(' · '))
  t('the third-party steps and the comparison row are unchanged (still "sign in")', THIRD_PARTY.every(k => SIGN.test(en[k] || '')), THIRD_PARTY.filter(k => !SIGN.test(en[k] || '')).join(', '))
  // Every locale's own overrides (en-US, en-AU, …) — none may bring the old English back.
  const overrides = []
  for (const l of LOCALES.filter(l => l.startsWith('en-') && l !== 'en-GB')) for (const [k, v] of Object.entries(leaves(json(`messages/${l}.json`)))) if (SIGN.test(v) && !THIRD_PARTY.includes(k)) overrides.push(`${l} ${k}`)
  t('no English locale overrides it back', overrides.length === 0, overrides.join(', '))

  // The duplicates app-fixes-1 added, merged (same words in every language).
  const dup = LOCALES.filter(l => { const m = json(`messages/${l}.json`); return get(m, 'auth.forgot.backToLogin') !== undefined || get(m, 'auth.reset.logIn') !== undefined })
  t('merged: auth.forgot.backToLogin → auth.forgot.back, auth.reset.logIn → auth.login.submit (gone from every locale)', dup.length === 0, dup.join(', '))
  const backDup = fs.readdirSync(path.join(REPO, 'docs/i18n/back')).filter(f => f.endsWith('.json')).filter(f => { const b = json(`docs/i18n/back/${f}`); return 'auth.forgot.backToLogin' in b || 'auth.reset.logIn' in b })
  t('…and from every back-translation', backDup.length === 0, backDup.join(', '))
  const missing = []
  for (const l of BASES) { const m = json(`messages/${l}.json`); for (const k of Object.keys(WORDING)) if (typeof get(m, k) !== 'string') missing.push(`${l}:${k}`) }
  t(`all ${BASES.length} language bases still have every key`, missing.length === 0, missing.slice(0, 20).join(', '))
  const reset = stripComments(read('app/(app)/reset-password/page.tsx')), forgot = stripComments(read('app/(app)/forgot-password/page.tsx'))
  t('reset: "Back to log in" is auth.forgot.back; success\'s "Log in" is auth.login.submit', reset.includes("{tForgot('back')}") && reset.includes("{tLogin('submit')}") && !/backToLogin|t\('logIn'\)/.test(reset))
  t('forgot: the "email sent" link is auth.forgot.back', /data-auth-next="login"[\s\S]{0,200}\{t\('back'\)\}/.test(forgot) && !forgot.includes('backToLogin'))
  const codeUses = []
  for (const dir of ['app', 'components', 'lib']) (function walk(d) { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && /backToLogin|\breset\.logIn\b/.test(stripComments(read(p)))) codeUses.push(p) } })(dir)
  t('no code reads the merged keys', codeUses.length === 0, codeUses.join(', '))

  // Bengali, Hindi, Urdu: their auth words were the transliterated "sign in" while their landing page says "log in".
  const OWN = { 'bn-BD': ['লগ ইন', /সাইন[ -]?(ইন|আউট)/], 'hi-IN': ['लॉग इन', /साइन[ -]?(इन|आउट)/], 'ur-PK': ['لاگ اِن', /سائن (اِن|آؤٹ)/] }
  for (const [l, [word, old]] of Object.entries(OWN)) {
    const m = json(`messages/${l}.json`)
    t(`${l}: the landing page's own word is ${word}`, (get(m, 'landingNav.logIn') || '').includes(word))
    const still = Object.keys(WORDING).filter(k => old.test(get(m, k) || ''))
    t(`${l}: no login message uses the transliterated "sign in"`, still.length === 0, still.join(', '))
    t(`${l}: auth.login.submit uses ${word}`, (get(m, 'auth.login.submit') || '').includes(word))
    t(`${l}: the payment provider's and 123 Reg's own steps unchanged`, ['managePayments.onboarding.firstRun', 'customDomain.providers.123reg.signIn'].every(k => old.test(get(m, k) || '')))
  }
  // Every other language already used ONE word for logging in (its landing page's), so nothing else changes there.
  const fr = json('messages/fr-FR.json')
  t('fr-FR unchanged: "Se connecter" / "Retour à la connexion"', get(fr, 'auth.login.submit') === 'Se connecter' && get(fr, 'auth.forgot.back') === 'Retour à la connexion')
  const nsEn = json('messages/ns/en-GB/auth.json')
  t('the namespace files were regenerated (split-messages)', get(nsEn, 'login.submit') === 'Log in' && get(nsEn, 'forgot.backToLogin') === undefined)
  const bFr = json('docs/i18n/back/fr-FR.json'), bBn = json('docs/i18n/back/bn-BD.json')
  t('back-translations follow ("Log in", not "Sign in")', bFr['auth.login.submit'] === 'Log in' && bBn['auth.login.submit'] === 'Log in' && !Object.keys(WORDING).some(k => SIGN.test(bFr[k] || '')))

  // Hard-coded English HatchGrab words.
  const admin = stripComments(read('app/(app)/admin/page.tsx'))
  t('admin: "Log out" and "log in again"', /rounded-xl hover:bg-slate-700"\s*>\s*Log out\s*</.test(admin) && admin.includes('Reload and log in again.') && !/>\s*Sign out\s*</.test(admin))
  t('the API\'s fallback sentence: "Log in required" (the code is unchanged: sign_in_required)', read('lib/truck-access.ts').includes("error: 'Log in required', code: 'sign_in_required'"))
}

// ══ §2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('§2 · "Access denied" has a way forward')
{
  const dash = read('app/(app)/dashboard/[token]/page.tsx')
  const line = dash.split('\n').find(l => l.includes("tDash('gate.accessDenied')")) || ''
  // ⚠️ RE-PINNED (dashboard-auth-2, 18 November 2026): the button still goes to /login, now with ?next=<this page> so a re-login
  // lands back on the board (lib/auth/login-href.ts loginHrefBackHere — a same-origin path built from window.location only).
  t('the Access denied screen has a "Back to log in" button to /login', /<Link href=\{loginHrefBackHere\(\)\} data-gate-next="login"[^>]*>\{tForgotGate\('back'\)\}<\/Link>/.test(line)
    && /return `\/login\?next=\$\{encodeURIComponent\(here\)\}`/.test(fs.readFileSync(path.join(__dirname, '..', 'lib/auth/login-href.ts'), 'utf8')))
  // ⚠️ RE-PINNED (android-1-1, 15 November 2026, docs/android-1-1-report.md §7): the "← HatchGrab" line under the button (a link home
  // on the web, an inert span in the app) was removed, so there is no isNativeApp() branch left on this screen to sit outside of.
  t('…shown on the web AND in the app (no platform branch on the screen), and it is the only way forward (android-1-1: the brand line is gone)',
    line.includes('data-gate-next="login"') && !line.includes('isNativeApp()') && !line.includes('_brand') && (line.match(/<Link /g) || []).length === 1)
  t('…worded by auth.forgot.back', /const tForgotGate=useT\('auth\.forgot'\)/.test(dash) && dash.includes("import '@/lib/i18n/catalog/auth'"))
  const ns = read('lib/i18n/namespaces.ts')
  const dashList = ns.slice(ns.indexOf('dashboard: ['), ns.indexOf(']', ns.indexOf("'whereYouTrade'", ns.indexOf('dashboard: ['))) + 1)
  t('the dashboard loads the auth namespace', /'auth'\]$/.test(dashList.trim()))
  const { inAppRoute } = loadTs('lib/app-navigation.ts')
  t('/login stays inside the app (it is the app\'s login route too)', inAppRoute('/login') === 'stay')
}

// ══ §3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('§3 · /dev goes to /app inside the app')
{
  const { inAppRoute } = loadTs('lib/app-navigation.ts')
  t('/dev and /dev/ticket-preview → /app', inAppRoute('/dev') === 'app' && inAppRoute('/dev/ticket-preview') === 'app')
  const stay = ['/signup', '/setup', '/admin', '/dashboard/tok', '/dashboard/tok/kds', '/kds/x', '/manage/tok', '/login']
  t('/signup, /setup, /admin (and the operator screens) stay', stay.every(p => inAppRoute(p) === 'stay'), stay.filter(p => inAppRoute(p) !== 'stay').join(', '))
  t('a path that only starts with the letters (/devices) is not /dev', inAppRoute('/devices') === 'app')
}

console.log(`\n${fail ? '🔴' : '✅'} app-fixes-2: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
