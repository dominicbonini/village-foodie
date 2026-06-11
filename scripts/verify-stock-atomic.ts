// scripts/verify-stock-atomic.ts
// CONCURRENCY proof for the Option-B atomic stock guard (Stage 2).
//
// Run:  npx tsx scripts/verify-stock-atomic.ts
//
// This models the EXACT new submit control flow from app/api/orders/submit/route.ts:
//   acquireEventLock(per-event)  →  [ read live sold  →  check vs stock  →  (pass) INSERT ]  →  release
// The stock check is BEFORE the insert, and the whole [check → insert] runs under ONE per-event
// mutex (booking_locks). "sold" is DERIVED by counting inserted orders (getLiveItemCounts), so the
// second submit, once it acquires the lock, sees the first submit's insert and is rejected.
//
// STRICT contended-lock policy (no oversell EVER): NO order inserts without holding the lock + passing
// the stock check. A second caller WAITS/retries within the acquire budget (the timing blip is
// absorbed), then runs the real atomic check — rejected only if stock genuinely ran out. If the budget
// is exhausted it bails WITHOUT inserting (contended). There is no best-effort / non-atomic fallback.
//
// The mutex below mirrors acquireEventLock's contract: a single holder; a second caller waits and
// retries until the holder releases (PK-conflict-retry in the real impl). The real booking_locks
// primitive is already production-proven for slot capacity — this proves the REORDERING invariant
// (lock serialises check+insert; check sees prior insert; check precedes any write).
//
// NOTE: we do NOT write to the live DB. The invariant proven here (exactly one of two concurrent
// 4-against-4 submits inserts; total sold never exceeds stock) is the property the real lock gives.

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`   ✅ ${name}${detail ? `  →  ${detail}` : ''}`) }
  else { fail++; console.log(`   ❌ ${name}${detail ? `  →  ${detail}` : ''}`) }
}

// ── Per-event mutex modelling booking_locks (single holder; waiter retries until free) ──
class EventMutex {
  private held = false
  async acquire(maxWaitMs = 1000, retryMs = 15): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs
    for (;;) {
      if (!this.held) { this.held = true; return true }
      if (Date.now() >= deadline) return false
      await sleep(retryMs)
    }
  }
  release() { this.held = false }
}

// ── Shared "DB": orders array; sold is DERIVED by summing it (mirrors getLiveItemCounts) ──
function makeStore(stock: number) {
  const orders: { item: string; qty: number }[] = []
  return {
    soldOf: (item: string) => orders.filter(o => o.item === item).reduce((s, o) => s + o.qty, 0),
    insert: (item: string, qty: number) => { orders.push({ item, qty }) },
    stockOf: () => stock,
    total: (item: string) => orders.filter(o => o.item === item).reduce((s, o) => s + o.qty, 0),
    count: () => orders.length,
  }
}

// ── The submit flow under test (acquire → check-before-insert → release) ──
async function submit(
  mutex: EventMutex,
  store: ReturnType<typeof makeStore>,
  item: string,
  qty: number,
  opts: { critSectionDelayMs?: number; override?: boolean } = {},
): Promise<{ status: 200 | 409 | 'contended'; remaining?: number; oversold?: boolean }> {
  const haveLock = await mutex.acquire()
  // STRICT: never insert without the lock (no best-effort fallback). Budget exhausted → bail.
  if (!haveLock) return { status: 'contended' }
  try {
    // (a) STOCK RE-CHECK — read live sold under the lock, compare to ceiling. BEFORE any insert.
    const remaining = Math.max(0, store.stockOf() - store.soldOf(item))
    if (qty > remaining) {
      // INFORMED override (truck path only): the check RAN and reported `remaining`; the operator
      // proceeds anyway → insert past the shortfall (deliberate oversell). Without override → 409.
      if (!opts.override) return { status: 409, remaining } // no insert → no rollback
      if (opts.critSectionDelayMs) await sleep(opts.critSectionDelayMs)
      store.insert(item, qty)
      return { status: 200, remaining, oversold: true }
    }
    // force an interleaving window so a broken (non-atomic) flow would double-insert
    if (opts.critSectionDelayMs) await sleep(opts.critSectionDelayMs)
    // (c) INSERT — only after the check passed, still under the lock
    store.insert(item, qty)
    return { status: 200, remaining: remaining - qty }
  } finally {
    mutex.release()
  }
}

async function main() {
  console.log('\nSTOCK ATOMIC GUARD — concurrency proof (models booking_locks mutex)\n')

  // ── TEST 1 — THE CONCURRENCY TEST: two SIMULTANEOUS 4-against-4 submits ──
  console.log('TEST 1 — two simultaneous submits, each requesting 4 against 4 remaining:')
  {
    const mutex = new EventMutex()
    const store = makeStore(4)
    // critSectionDelayMs forces the two promises to overlap — a non-atomic [check then insert]
    // (no lock, or insert-before-lock) would let BOTH read sold=0 and BOTH insert → 8 sold.
    const [a, b] = await Promise.all([
      submit(mutex, store, 'pizza', 4, { critSectionDelayMs: 25 }),
      submit(mutex, store, 'pizza', 4, { critSectionDelayMs: 25 }),
    ])
    const oks = [a, b].filter(r => r.status === 200).length
    const rejects = [a, b].filter(r => r.status === 409).length
    const contended = [a, b].filter(r => r.status === 'contended').length
    check('exactly ONE submit inserts (200)', oks === 1, `200s=${oks}`)
    check('the other is an HONEST stock 409 (not a timing blip)', rejects === 1 && contended === 0, `409s=${rejects} contended=${contended}`)
    check('total sold NEVER exceeds stock', store.total('pizza') === 4, `sold=${store.total('pizza')} / stock=4`)
    check('only one order row written', store.count() === 1, `rows=${store.count()}`)
  }

  // ── TEST 2 — stale page (sequential): sell the 4 elsewhere, then a stale 4 → 409 ──
  console.log('\nTEST 2 — stale page: 4 already sold elsewhere, stale submit of 4:')
  {
    const mutex = new EventMutex()
    const store = makeStore(4)
    const first = await submit(mutex, store, 'pizza', 4)           // someone else takes all 4
    const stale = await submit(mutex, store, 'pizza', 4)           // stale-open page submits 4
    check('first submit succeeds', first.status === 200)
    check('stale submit rejected (409)', stale.status === 409, `remaining=${stale.remaining}`)
    check('no oversell', store.total('pizza') === 4, `sold=${store.total('pizza')}`)
  }

  // ── TEST 3 — within stock: order ≤ remaining → succeeds, happy path unchanged ──
  console.log('\nTEST 3 — within stock (request 2 of 4):')
  {
    const mutex = new EventMutex()
    const store = makeStore(4)
    const r = await submit(mutex, store, 'pizza', 2)
    check('submits normally (200)', r.status === 200, `remaining left=${r.remaining}`)
    check('sold = 2', store.total('pizza') === 2)
  }

  // ── TEST 4 — many concurrent submits of 1 against stock 3 → exactly 3 succeed ──
  console.log('\nTEST 4 — 6 simultaneous submits of 1 against stock 3:')
  {
    const mutex = new EventMutex()
    const store = makeStore(3)
    const results = await Promise.all(
      Array.from({ length: 6 }, () => submit(mutex, store, 'pizza', 1, { critSectionDelayMs: 10 })),
    )
    const oks = results.filter(r => r.status === 200).length
    check('exactly 3 succeed', oks === 3, `200s=${oks}`)
    check('exactly 3 honest 409 (none contended — all waited their turn)',
      results.filter(r => r.status === 409).length === 3 && results.filter(r => r.status === 'contended').length === 0)
    check('total sold == stock (no oversell)', store.total('pizza') === 3, `sold=${store.total('pizza')}`)
  }

  // ── TEST 5 — TRUCK non-override concurrency: two operator submits for the last item ──
  console.log('\nTEST 5 — truck path, two NON-OVERRIDE submits for the last 1 item:')
  {
    const mutex = new EventMutex()
    const store = makeStore(1)
    const [a, b] = await Promise.all([
      submit(mutex, store, 'pizza', 1, { critSectionDelayMs: 25 }),         // operator A
      submit(mutex, store, 'pizza', 1, { critSectionDelayMs: 25 }),         // operator B
    ])
    const oks = [a, b].filter(r => r.status === 200).length
    check('exactly ONE inserts', oks === 1, `200s=${oks}`)
    check('the other gets the honest shortfall (409, not contended)',
      [a, b].filter(r => r.status === 409).length === 1 && [a, b].filter(r => r.status === 'contended').length === 0)
    check('no accidental oversell WITHOUT override', store.total('pizza') === 1, `sold=${store.total('pizza')}`)
  }

  // ── TEST 6 — TRUCK informed override: shortfall, operator proceeds anyway → inserts ──
  console.log('\nTEST 6 — truck path, shortfall then INFORMED override:')
  {
    const mutex = new EventMutex()
    const store = makeStore(2)
    const first = await submit(mutex, store, 'pizza', 2)                    // takes all 2
    const noOverride = await submit(mutex, store, 'pizza', 1)               // 1 more, no override
    check('non-override blocked (honest 409, real remaining)', noOverride.status === 409 && noOverride.remaining === 0)
    check('not inserted without override', store.total('pizza') === 2)
    const overridden = await submit(mutex, store, 'pizza', 1, { override: true }) // operator proceeds anyway
    check('override INSERTS despite shortfall (deliberate oversell)', overridden.status === 200 && overridden.oversold === true)
    check('sold now exceeds stock — by deliberate choice only', store.total('pizza') === 3, `sold=${store.total('pizza')} / stock=2`)
  }

  console.log('\n' + '─'.repeat(60))
  if (fail === 0) console.log(`✅ ATOMIC STOCK GUARD PROVEN — ${pass} checks pass, no accidental oversell under concurrency (override = informed only).`)
  else { console.log(`❌ ${fail} checks FAILED (${pass} passed).`); process.exit(1) }
}

main()
