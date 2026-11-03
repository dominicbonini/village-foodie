// scripts/_lp-competitor-features-2.cjs — competitor-features-2's two deliberate changes to what the comparison pages show, undone for
// the harnesses that compare a comparison page with a tree from before it (3 November 2026; docs/competitor-features-2-report.md).
// scripts/competitor-features-2.cjs proves both changes.
//
//   featuresAsBefore()  the shipped feature list (data/comparison-features/features.json) as comparison_features rows, with the new
//                       "notify" row taken out and "payattruck" shown everywhere again (it is secondary now, and hidden)
//   tables()            { comparison_features: featuresAsBefore() } — merged into a renderer's tables, the page reads the table
//                       instead of the file (lib/comparison-features-file.ts featuresOrFile), and renders the list as it was
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS module, like every scripts/*.cjs */
'use strict'

const file = require('../data/comparison-features/features.json')

const featuresAsBefore = () => file.features.filter(f => f.key !== 'notify')
  .map(f => ({ labels: {}, explanations: {}, ...f, ...(f.key === 'payattruck' ? { show_scope: 'all' } : {}) }))
const tables = () => ({ comparison_features: featuresAsBefore() })

module.exports = { featuresAsBefore, tables }
