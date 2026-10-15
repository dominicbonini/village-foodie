// scripts/_lp1c-fixtures.cjs — the shared fixtures for scripts/language-phase-1c.cjs (Language Phase 1c,
// docs/language-phase-1c-report.md). The GB and US trucks, orders and clock are Phase 1b's (scripts/_lp1b-fixtures.cjs);
// what changes is the commit BEFORE is captured on.
// 🔴 BEFORE_REF is HEAD when the phase began. Step 0 made no commit: the Phase 1b work was already committed by
// `89b3f29` ("template update"), and `accbb61` is the head that carries it.
const base = require('./_lp1b-fixtures.cjs')
module.exports = { ...base, BEFORE_REF: 'accbb61' }
