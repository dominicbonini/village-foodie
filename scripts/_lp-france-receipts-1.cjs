// scripts/_lp-france-receipts-1.cjs (france-receipts-1, 24 November 2026, docs/france-receipts-1-report.md): the NEW message keys this work
// adds — the receipt's words in the shared `charges` namespace. (Business details' franchise note is france-records-1's key, reworded in
// place.) Like france-vat-1's and france-records-1's, they are translated into the 54 language bases an enabled country uses and NOT into
// the 5 unused ones (scripts/_lp-france-vat-1.cjs UNUSED_BASES), so those 5 lack exactly these keys too: scripts/_lp-france-records-1.cjs's
// set-aside names them alongside its own.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness module, like every scripts/*.cjs */
'use strict'
const NEW_KEYS = ['charges.receipt.number', 'charges.receipt.companyNumber', 'charges.receipt.registrationNumber', 'charges.receipt.taxNumber']
module.exports = { NEW_KEYS }
