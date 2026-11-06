#!/usr/bin/env node
// scripts/legal-languages-1-payments.cjs — legal-languages-1 (1 November 2026, docs/legal-languages-1-report.md §3): THE PAYMENT
// SCREENS IN THE PAGE'S LANGUAGE. Pure: it bundles lib/stripe-locale.ts and reads two source files — no client, no key, no network.
//   node scripts/legal-languages-1-payments.cjs
// ⚠️ Run by hand: scripts/run-harnesses.cjs refuses any listed file that names the payment provider (its screen cannot tell a
// locale table from an API call), so this lives in scripts/harnesses.json's `names_payment_provider` group, with its reason.
// Checked: stripeLocaleOf maps our locales to Stripe's (fr, de, pt-BR, zh-HK, es-419 for Mexico, nb for Norwegian) and leaves every
// English locale to Stripe's own default; the order page's card form (Elements) and Manage's Connect onboarding pass it.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'legal-languages-1-payments' })
const { REPO } = kit
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

;(async () => {
  const S = await kit.bundle('ll1-pay', "export { stripeLocaleOf } from '@/lib/stripe-locale'")
  const cases = [['fr-FR', 'fr'], ['de-AT', 'de'], ['de-CH', 'de'], ['pt-BR', 'pt-BR'], ['pt-PT', 'pt'], ['zh-HK', 'zh-HK'], ['es-MX', 'es-419'], ['es-ES', 'es'], ['nb-NO', 'nb'], ['ja-JP', 'ja'], ['ar-AE', 'ar'],
    ['en-GB', undefined], ['en-US', undefined], ['en-IE', undefined], ['en-SG', undefined], [null, undefined]]
  const got = cases.map(([l]) => S.stripeLocaleOf(l))
  t(`stripeLocaleOf: ${cases.map(([l, w]) => `${l} → ${w ?? '(Stripe\'s default)'}`).join(' · ')}`, cases.every(([, w], i) => got[i] === w), got)
  t('the order page\'s card form is created in the page\'s language (stripe.elements({ …, locale }))',
    /\.\.\.\(stripeLocaleOf\(pageLocale\) \? \{ locale: stripeLocaleOf\(pageLocale\) as never \} : \{\}\)/.test(read('app/(app)/trucks/[slug]/order/page.tsx')))
  t('Manage\'s Connect onboarding (loadConnectAndInitialize) is created in the truck\'s language',
    /\.\.\.\(stripeLocaleOf\(appLocale\) \? \{ locale: stripeLocaleOf\(appLocale\) as never \} : \{\}\)/.test(read('components/manage/PaymentsTab.tsx')))
  console.log(`\n${fail ? '🔴' : '✅'} legal-languages-1-payments: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
