// scripts/_language-phase-1a-after.cjs — the AFTER half of scripts/language-phase-1a.cjs: the two NAMED DIFFERENCES,
// each proven to be the only change where it applies, and the checks on the code that carries them.
const path = require('path')

module.exports = async function after({ kit, t, head, read, REPO, before, got, diffJson, renderOrderPage }) {
  const { createTranslator } = require(path.join(REPO, 'node_modules/next-intl'))
  const MESSAGES = JSON.parse(read('messages/en-GB.json'))
  const CODES = MESSAGES.errorsCustomer || {}
  const tErr = createTranslator({ locale: 'en-GB', messages: MESSAGES, namespace: 'errorsCustomer' })
  const tErrUS = createTranslator({ locale: 'en-US', messages: MESSAGES, namespace: 'errorsCustomer' })

  /** NAMED DIFFERENCE 2, for one JSON body. `textField` is `error` (the routes) or `message` (payments/return). */
  function proveBody(name, b, a, textField) {
    let B, A
    try { B = JSON.parse(b); A = JSON.parse(a) } catch { t(`${name}: both bodies are JSON`, false, `${b} · ${a}`); return }
    if (!B || typeof B !== 'object' || !(textField in B) || B.outcome === 'confirmed' || B.outcome === 'pending') {
      t(`${name}: not a refusal — byte-identical`, a === b, diffJson(b, a)); return
    }
    const hadCode = 'code' in B
    const added = hadCode ? ['params'] : ['code', 'params']
    t(`${name}: the BEFORE body is the exact prefix of the AFTER body`, a.startsWith(b.slice(0, -1) + ','), `BEFORE ${b}\n      AFTER  ${a}`)
    t(`${name}: every BEFORE field is unchanged, in its place`, JSON.stringify(Object.keys(A).slice(0, Object.keys(B).length)) === JSON.stringify(Object.keys(B))
      && Object.keys(B).every(k => JSON.stringify(A[k]) === JSON.stringify(B[k])), a)
    t(`${name}: the ONLY fields added are ${added.join(' and ')}, last`, JSON.stringify(Object.keys(A).slice(Object.keys(B).length)) === JSON.stringify(added), Object.keys(A).join(','))
    t(`${name}: "${A.code}" is a message in errorsCustomer`, typeof A.code === 'string' && A.code in CODES, A.code)
    t(`${name}: params is an object of strings and numbers`, A.params && typeof A.params === 'object' && !Array.isArray(A.params)
      && Object.values(A.params).every(v => typeof v === 'string' || typeof v === 'number'), JSON.stringify(A.params))
    if (A.code in CODES) {
      t(`${name}: the screen's words for the code are today's ${textField}, GB and US`, tErr(A.code, A.params) === B[textField] && tErrUS(A.code, A.params) === B[textField],
        `${tErr(A.code, A.params)} · ${B[textField]}`)
    }
  }

  head('2 · NAMED DIFFERENCE 2 — every customer-facing API refusal gains "code" and "params"; nothing else moves')
  for (const k of Object.keys(before.api)) {
    const B = before.api[k], A = got.api[k]
    if (typeof B === 'string' || typeof A === 'string') { t(`api · ${k}: ran`, B === A, `${B} · ${A}`); continue }
    t(`api · ${k}: status unchanged (${B.status})`, A.status === B.status, A.status)
    t(`api · ${k}: no redirect, or the same one`, A.location === B.location, A.location)
    t(`api · ${k}: every email it sends is byte-identical`, JSON.stringify(A.sends) === JSON.stringify(B.sends), diffJson(B.sends, A.sends))
    proveBody(`api · ${k}`, B.body, A.body, 'error')
  }

  head('3 · NAMED DIFFERENCE 1 — ?payment_failed= carries a code; the page shows today\'s words')
  for (const k of Object.keys(before.paymentReturn)) {
    const B = before.paymentReturn[k], A = got.paymentReturn[k]
    t(`paymentReturn · ${k}: status unchanged`, A.status === B.status, A.status)
    if (k.endsWith('|json')) { proveBody(`paymentReturn · ${k}`, B.body, A.body, 'message'); continue }
    t(`paymentReturn · ${k}: no body either side`, A.body === B.body)
    const bu = new URL(B.location), au = new URL(A.location)
    if (!bu.searchParams.has('payment_failed')) { t(`paymentReturn · ${k}: not a refusal — the same URL`, A.location === B.location, `${B.location} · ${A.location}`); continue }
    t(`paymentReturn · ${k}: same address, same other parameters in the same order`, bu.origin + bu.pathname === au.origin + au.pathname
      && JSON.stringify([...bu.searchParams].filter(([p]) => p !== 'payment_failed')) === JSON.stringify([...au.searchParams].filter(([p]) => p !== 'payment_failed' && p !== 'payment_failed_params')),
      `${B.location}\n      ${A.location}`)
    const code = au.searchParams.get('payment_failed'), params = JSON.parse(au.searchParams.get('payment_failed_params') || '{}')
    t(`paymentReturn · ${k}: the URL carries a code ("${code}"), not a sentence`, code in CODES && !/\s/.test(code), code)
    t(`paymentReturn · ${k}: the code's words are today's sentence`, code in CODES && tErr(code, params) === bu.searchParams.get('payment_failed'), `${code in CODES ? tErr(code, params) : '?'} · ${bu.searchParams.get('payment_failed')}`)
    const viaCode = renderOrderPage(au.search.slice(1)), viaSentence = renderOrderPage(bu.search.slice(1))
    t(`paymentReturn · ${k}: the order page renders the code URL exactly as it rendered the sentence URL`, viaCode === viaSentence && viaCode.includes(bu.searchParams.get('payment_failed').replace(/'/g, '&#x27;')), diffJson(viaSentence, viaCode))
  }

  head('4 · the providers — each surface names what it reads, and a shared control never prints a key')
  {
    const m = await kit.bundle('lp1a-provider', [
      "export { I18nProvider } from '@/lib/i18n/client'", "export { NAMESPACES } from '@/lib/i18n/namespaces'",
      "export { DealsModal } from '@/components/dashboard/DealsModal'", "export { MoneyProvider } from '@/components/MoneyContext'",
    ].join('\n'))
    const h = kit.h
    const deal = { id: 'b1', name: 'Lunch deal', description: 'Any pizza', bundle_price: 12, original_price: 14, slot_1_category: 'Pizzas', slot_2_category: null, slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }
    const render = namespaces => kit.quiet(() => kit.renderStatic(h(m.I18nProvider, { namespaces }, h(m.MoneyProvider, { fmt: { currency: 'GBP', locale: 'en-GB' } },
      h(m.DealsModal, { bundles: [deal, { ...deal, name: 'Big deal' }], menuItems: [], basketItems: [], menuCategories: [], onApply() {}, onClose() {} })))))
    const none = render([]), dash = render(m.NAMESPACES.dashboard), ord = render(m.NAMESPACES.order)
    t('the deals picker under a provider that sends NO namespace shows its words, not keys', none.includes('Apply a deal') && !/deals\.|\btitle\b/.test(none.replace(/class="[^"]*"/g, '')), none.slice(0, 300))
    t('…the same under the dashboard\'s provider and the order page\'s, byte for byte', dash === none && ord === none)
    // Every namespace a customer surface's components read is one its provider sends.
    const used = files => new Set(files.flatMap(f => [...read(f).matchAll(/useT\('([A-Za-z]+)'\)/g)].map(x => x[1])))
    const orderUses = used(['app/trucks/[slug]/order/page.tsx', 'components/TruckListCard.tsx', 'components/dashboard/OrderLineItem.tsx',
      'components/dashboard/DealsModal.tsx', 'components/OptionStockBadge.tsx', 'components/SpiceLevel.tsx'])
    const missing = [...orderUses].filter(n => !m.NAMESPACES.order.includes(n))
    t(`NAMESPACES.order sends every namespace the order page and its components read (${[...orderUses].join(', ')})`, missing.length === 0, missing.join(', '))
    const statusUses = used(['app/order/[id]/manage/page.tsx'])
    t(`NAMESPACES.confirmation sends every namespace the status page reads (${[...statusUses].join(', ')})`, [...statusUses].every(n => m.NAMESPACES.confirmation.includes(n)))
    t('messages/en-US.json is still {} — so US output is en-GB\'s, byte for byte', read('messages/en-US.json').trim() === '{}')
  }

  head('5 · the code that carries them')
  const helper = read('lib/i18n/customer-errors.ts')
  t('customerErrorBody puts code and params after every existing field', /\{ error: t\(code, params\), \.\.\.\(extra \?\? \(\{\} as X\)\), code, params \}/.test(helper))
}
