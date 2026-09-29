#!/usr/bin/env node
// scripts/outreach-mail-poll.cjs — the reply poll decides what gets written about a real business.
//   node scripts/outreach-mail-poll.cjs      (≈ 6 s: one compile, NO NETWORK, NO MAILBOX)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    an out-of-office or a bounce logged as a REPLY — §57.1 exits a prospect's chase sequence on any
//    inbound contact row, so Dominic silently stops chasing someone who never answered; a reply logged
//    TWICE, so the ladder shows a conversation that did not happen; the first run walking two years of
//    history and logging all of it at once; a reply attributed to the WRONG prospect because two share
//    an address; a stage Dominic set by hand overwritten by a machine reading his mailbox; an automatic
//    retry hammering a permanent rejection or a wrong password; or the poll touching the mailbox at all
//    — marking read, moving, deleting — when it is supposed only to look.
//
// HOW: the REAL libs compiled from lib/. Pure rules, plus a source census over the runner.
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const eq = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`  ${ok ? '✓' : '🔴'} ${label}`)
  if (!ok) { console.log(`      want: ${JSON.stringify(want)}`); console.log(`      got:  ${JSON.stringify(got)}`); fails++ }
}

const FILES = [
  'lib/outreach-mail-poll-rules.ts', 'lib/outreach-contact-log.ts',
  'lib/outreach-mail-accounts.ts', 'lib/outreach-poll-claims.ts',
]
function build(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    R: req('lib/outreach-mail-poll-rules.js'),
    L: req('lib/outreach-contact-log.js'),
    A: req('lib/outreach-mail-accounts.js'),
    C: req('lib/outreach-poll-claims.js'),
  }
}

/**
 * A fake `outreach_messages` / `outreach_settings` pair with REAL uniqueness, so two simulated runs
 * actually race. 🔴 THE POINT IS THAT THE TABLE DECIDES, NOT THE TEST: `upsert … ignoreDuplicates`
 * returns rows only to the first caller for a given message_id, and a filtered `update` returns rows
 * only to the caller whose filter still matched. That is exactly what the real client does.
 */
function fakeDb() {
  const messages = new Map()          // message_id -> row
  const settings = new Map()          // key -> { value, updated_at }
  const contacts = []
  const db = {
    messages, settings, contacts,
    from(table) {
      const q = { _table: table, _filters: [], _payload: null, _op: null, _ignoreDup: false }
      q.insert = v => { q._op = 'insert'; q._payload = v; return q }
      q.upsert = (v, o) => { q._op = 'upsert'; q._payload = v; q._ignoreDup = !!(o && o.ignoreDuplicates); return q }
      q.update = v => { q._op = 'update'; q._payload = v; return q }
      q.eq = (c, v) => { q._filters.push(['eq', c, v]); return q }
      q.lt = (c, v) => { q._filters.push(['lt', c, v]); return q }
      q.in = (c, v) => { q._filters.push(['in', c, v]); return q }
      q.select = () => q
      q.single = async () => { const r = await run(q); return { data: (r.data || [])[0] ?? null, error: r.error } }
      q.maybeSingle = q.single
      q.then = (res, rej) => run(q).then(res, rej)
      return q
    },
  }
  const matches = (row, filters) => filters.every(([op, c, v]) =>
    op === 'eq' ? row[c] === v
      : op === 'lt' ? String(row[c] ?? '') < String(v)
      : op === 'in' ? v.includes(row[c])
      : true)
  async function run(q) {
    if (q._table === 'outreach_messages') {
      if (q._op === 'upsert' || q._op === 'insert') {
        const row = { id: `m${messages.size + 1}`, ...q._payload }
        if (messages.has(row.message_id)) {
          // 🔴 THE UNIQUE INDEX. `ignoreDuplicates` ⇒ no rows back; a plain insert ⇒ the 23505 error.
          if (q._ignoreDup) return { data: [], error: null }
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        }
        messages.set(row.message_id, row)
        return { data: [row], error: null }
      }
      if (q._op === 'update') {
        const hit = [...messages.values()].filter(r => matches(r, q._filters))
        for (const r of hit) Object.assign(r, q._payload)
        return { data: hit, error: null }
      }
      return { data: [...messages.values()].filter(r => matches(r, q._filters)), error: null }
    }
    if (q._table === 'outreach_settings') {
      const key = (q._filters.find(f => f[1] === 'key') || [])[2] ?? (q._payload || {}).key
      if (q._op === 'insert') {
        if (settings.has(q._payload.key)) return { data: null, error: { code: '23505', message: 'duplicate key' } }
        settings.set(q._payload.key, { ...q._payload })
        return { data: [{ key: q._payload.key }], error: null }
      }
      if (q._op === 'update') {
        const cur = settings.get(key)
        if (!cur || !matches(cur, q._filters)) return { data: [], error: null }
        Object.assign(cur, q._payload)
        return { data: [{ key }], error: null }
      }
      const cur = settings.get(key)
      return { data: cur ? [cur] : [], error: null }
    }
    if (q._table === 'outreach_contacts') {
      if (q._op === 'insert') { contacts.push(q._payload); return { data: [{ id: `c${contacts.length}` }], error: null } }
      return { data: [], error: null }
    }
    if (q._table === 'outreach_prospects') return { data: [], error: null }
    return { data: [], error: null }
  }
  return db
}

/** A header reader over a raw block, the shape the rules take. */
const hdrs = (raw, extra = {}) => ({
  get: name => {
    const m = new RegExp(`^${name}:[ \\t]*(.*(?:\\n[ \\t].*)*)$`, 'im').exec(raw)
    return m ? m[1].replace(/\s+/g, ' ').trim() : null
  },
  subject: extra.subject ?? null,
  fromAddress: extra.from ?? null,
  contentType: extra.contentType ?? null,
})

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `omp-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, file); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return { tmp, ...build(tmp, tag) }
  }
  const variantFails = (tag, bad, label) => {
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${tag} ${label}`)
    if (!bad) process.exit(1)
  }
  {
    // V1 — THE FIRST LOOK GOES BACK TO BASELINING AT THE CURRENT TOP UID. This is the 29 September
    // defect verbatim: the cron baselined dominic/INBOX at a uid that already included Dominic's
    // reply, so the reply sat below the watermark and was skipped permanently.
    const v = variant('v1', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  if (!stored) return { mode: 'first_look', since }",
      "  if (!stored) return { mode: 'none' }"))
    const plan = v.R.planFetch(undefined, { uidvalidity: '1', highestUid: 9000 }, new Date('2026-09-29T00:00:00Z'))
    variantFails('V1', plan.mode !== 'first_look',
      'a folder with no watermark is not given a first look: everything already in it is skipped for good')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V2b — THE DATE FILTER GOES. A first look then processes the whole mailbox, which is the concern
    // the original baseline existed to address: two years of replies logged at once, every contacted
    // prospect jumped to `replied` on a timestamp that is a lie.
    const v = variant('v2b', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      '  return t >= since.getTime()', '  return true'))
    const old2 = new Date('2024-01-01T00:00:00Z')
    variantFails('V2b', v.R.withinFirstLook(old2, new Date('2026-09-29T00:00:00Z')) === true,
      'the first look stops filtering by date: a 2024 email is processed as if it had just arrived')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V14 — AN EMPTY FOLDER GETS NO WATERMARK AGAIN. That is the second half of the same bug: hello's
    // Spam and Archive reported "first look" on every run for hours, and the first message ever to
    // arrive in one of them would have been swallowed by the next baseline.
    const v = variant('v14', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  return { uidvalidity: String(uidvalidity), lastUid: 0 }",
      "  return undefined as unknown as PollWatermark"))
    variantFails('V14', v.R.emptyWatermark('42') === undefined,
      'an empty folder stores no watermark: its first message is baselined away')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V2 — AN AUTO-REPLY BECOMES A REPLY. An out-of-office then exits the chase sequence for good.
    const v = variant('v2', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  return AUTO_SUBJECT_RE.test(h.subject ?? '')", '  return false'))
    const h = hdrs('Subject: Automatic reply: your email\r\n', { subject: 'Automatic reply: your email', from: 'sam@truck.test' })
    variantFails('V2', v.R.classifyIncoming(h) === 'reply',
      'the subject test removed: Outlook\'s own out-of-office is classified as a reply')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V3 — A BOUNCE IS TESTED AFTER THE AUTO-REPLY. Delivery reports usually carry
    // `Auto-Submitted: auto-replied`, so every bounce files as an out-of-office and the bad address is
    // never marked.
    const v = variant('v3', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  if (isBounce(h)) return 'bounce'\n  if (isAutoReply(h)) return 'auto_reply'",
      "  if (isAutoReply(h)) return 'auto_reply'\n  if (isBounce(h)) return 'bounce'"))
    const h = hdrs('Auto-Submitted: auto-replied\r\n', { from: 'mailer-daemon@hatchgrab.com', subject: 'Undelivered Mail Returned to Sender' })
    variantFails('V3', v.R.classifyIncoming(h) === 'auto_reply',
      'auto-reply tested first: a delivery report is filed as an out-of-office and no address is marked')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V4 — AN AMBIGUOUS FROM IS GUESSED. Two prospects share a contact address; one of them gets a
    // reply logged against it that it never sent.
    const v = variant('v4', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  if (distinct.length > 1) return { kind: 'ambiguous' }",
      "  if (distinct.length > 1) return { kind: 'address', prospectId: distinct[0] }"))
    const m = v.R.matchIncoming({ get: () => null, fromAddress: 'shared@chain.test' },
      new Map(), new Map([['shared@chain.test', ['p1', 'p2']]]))
    variantFails('V4', m.kind === 'address',
      'a shared address is resolved to the first prospect: a reply is attributed to the wrong business')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V5 — A REPLY OVERWRITES ANY STAGE. `not_interested`, `signed` — all dragged back to `replied`
    // by a machine reading the mailbox.
    const v = variant('v5', 'lib/outreach-contact-log.ts', src => src.replace(
      "      .in('stage', REPLY_MOVES_FROM as unknown as string[])", '      // unconditional'))
    const seen = []
    const mock = { from: () => { const q = {
      insert() { return q }, update(v2) { seen.push(v2); return q }, eq: () => q,
      in(...a) { seen.push(['in', ...a]); return q }, select: () => q,
      single: async () => ({ data: { id: 'c' }, error: null }), then: r => r({ data: [], error: null }),
    }; return q } }
    await v.L.logOutreachContact(mock, { prospect_id: 'p', channel: 'email', direction: 'inbound', kind: 'reply', message: 'hi' })
    variantFails('V5', !seen.some(x => Array.isArray(x) && x[0] === 'in'),
      'the stage filter removed: a reply overwrites a stage Dominic set by hand')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V6 — THE LOCK NEVER HOLDS. The cron and the button collide and one reply is logged twice; the
    // message row is unique on message_id but the CONTACT LOG is not.
    const v = variant('v6', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      '  return now.getTime() - t < LOCK_STALE_MS', '  return false'))
    variantFails('V6', v.R.lockIsHeld(new Date().toISOString(), new Date()) === false,
      'the lock never reports itself held: two runs process the same reply')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V7 — THE RETRY TEST DEFAULTS TO ALLOW. This is the realistic version of the mistake: the list of
    // temporary errors is an ALLOW-LIST with "no" as its default, and flipping that default means every
    // error shape nobody anticipated — including a permanent rejection — is retried three times.
    //
    // ⚠️ A FIRST DRAFT OF THIS VARIANT DELETED THE `EAUTH` GUARD AND PASSED, WHICH PROVED NOTHING. That
    // is worth recording rather than hiding: EAUTH is refused twice over, once by its own guard and
    // once by the default, so removing either alone changes no outcome. The guard is still worth having
    // — it states the intent and survives a future widening of the list — but the DEFAULT is what
    // actually holds the line, so that is what this variant attacks.
    const v = variant('v7', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  return /\\b(ECONNECTION|EDNS|ETIMEDOUT|ECONNRESET|ESOCKET|ECONNREFUSED)\\b/i.test(e)",
      '  return true'))
    variantFails('V7', v.R.isTemporaryFailure('EMESSAGE: message rejected by the server') === true,
      'the allow-list defaults to allow: a permanent rejection is retried three times')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V8 — A STUCK SEND IS CALLED `failed`. That is the word that makes an operator press Send again,
    // and the row may well have been delivered.
    const v = variant('v8', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  if (row.status !== 'sending' || row.is_test) return false",
      "  if (row.status !== 'sending') return false"))
    variantFails('V8', v.R.isStuckSending({ status: 'sending', is_test: true, updated_at: new Date(Date.now() - 20 * 60_000).toISOString() }, new Date()) === true,
      'the test exclusion removed: a stuck TEST send is swept like a real one')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  {
    // V9 — THE REPLY GATE GOES BACK TO THE IN-MEMORY CHECK. This is the Build-2 defect verbatim: two
    // overlapping runs each built the "already recorded?" map before either inserted, so both thought
    // the reply was new; the second insert failed on the unique message_id and the code logged the
    // CONTACT anyway. One reply, two rungs, and §57 reads that ladder.
    const v = variant('v9', 'lib/outreach-poll-claims.ts', src => src.replace(
      '  if (!first?.id) return { created: false, error: null }   // somebody else won; nothing to do',
      '  if (!first?.id) return { created: true, id: \'pretend\' }'))
    const db = fakeDb()
    const row = { message_id: '<r1@x>', prospect_id: 'p1', direction: 'inbound', status: 'received', account: 'dominic' }
    const a = await v.C.insertMessageOnce(db, { ...row })
    const b = await v.C.insertMessageOnce(db, { ...row })
    variantFails('V9', a.created === true && b.created === true,
      'the loser of the insert race is told it created the row: the reply is logged twice')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V10 — THE RETRY CLAIM STOPS FILTERING ON `failed`. Both runs then "claim" the same row and each
    // re-sends the same email to the same prospect.
    const v = variant('v10', 'lib/outreach-poll-claims.ts', src => src.replace(
      "    .eq('status', 'failed')\n    .select('id')", "    .select('id')"))
    const db = fakeDb()
    await db.from('outreach_messages').upsert({ message_id: '<f1@x>', status: 'failed' }, { ignoreDuplicates: true }).select('id')
    const id = [...db.messages.values()][0].id
    const first = await v.C.claimRetry(db, id, new Date())
    const second = await v.C.claimRetry(db, id, new Date())
    variantFails('V10', first === true && second === true,
      'the status filter removed: two runs both claim the same failed row and both re-send it')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V11 — THE LOCK GOES BACK TO READ-THEN-WRITE. Two runs a millisecond apart both read "free".
    const v = variant('v11', 'lib/outreach-poll-claims.ts', src => src.replace(
      "    .lt('updated_at', staleBefore)\n    .select('key')", "    .select('key')"))
    const db = fakeDb()
    const now = new Date()
    const first = await v.C.claimPollLock(db, now)
    const second = await v.C.claimPollLock(db, now)
    variantFails('V11', first === true && second === true,
      'the staleness filter removed: a second run takes a lock that is held right now')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V12 — THE FALLBACK BREAKS. With no primary configured the send path must still work through
    // hello@; returning null instead would take outreach down the moment this deploys, before Dominic
    // has added the new variables.
    const v = variant('v12', 'lib/outreach-mail-accounts.ts', src => src.replace(
      '    primary: dominic ?? hello,', '    primary: dominic,'))
    const set = v.A.resolveAccounts({ OUTREACH_MAIL_USER: 'hello@hatchgrab.com', OUTREACH_MAIL_PASSWORD: 'x' })
    variantFails('V12', v.A.accountForSend(set) === null,
      'the hello@ fallback removed: with no primary configured, nothing can send at all')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V13 — A ROW IS READ FROM THE PRIMARY RATHER THAN ITS OWN ACCOUNT. `mailbox`+`uid` mean nothing
    // outside the mailbox they came from: a September import would open nothing, or — worse — open a
    // DIFFERENT message that happens to hold that uid in the new mailbox.
    const v = variant('v13', 'lib/outreach-mail-accounts.ts', src => src.replace(
      "  return isMailAccount(row?.account) ? row.account : LEGACY_ACCOUNT",
      '  return PRIMARY_ACCOUNT'))
    variantFails('V13', v.A.accountOfRow({ account: 'hello' }) === 'dominic',
      "a stored row's account is ignored: an old hello@ email is opened against dominic@")
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  {
    // V15 — THE HTML FALLBACK GOES. This is the 29 September defect verbatim: Hotmail sends HTML-only
    // replies, so a real reply produced no text and the contact row was logged empty — rendering as
    // "No message was recorded with this contact" beside an email that plainly says otherwise.
    const v = variant('v15', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  const h = htmlToText(String(html ?? ''))\n  return h", "  return ''"))
    variantFails('V15', v.R.replyTextFrom(null, '<div>Thank you how do I sign up?</div>') === '',
      'the HTML fallback removed: an HTML-only reply yields no text and is logged empty')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V16 — BLOCK ELEMENTS STOP BECOMING LINE BREAKS. Outlook's quote header is a run of
    // `<div>From: …</div><div>Sent: …</div>`; without the breaks those run into one line and the
    // quote stripper — whose patterns are anchored to line starts — can no longer find it, so the
    // whole quoted original is logged as if the prospect had written it.
    // ⚠️ THE PATCH EMPTIES THE TAG LIST RATHER THAN DELETING ONE OF THE TWO REPLACEMENTS. A first
    // draft removed only the closing-tag rule and PASSED: the opening-tag rule still put a break
    // before each div, so the lines survived. One change, one meaning — "block elements are no longer
    // line breaks" — is what the variant has to say.
    const v = variant('v16', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      /const BLOCK_TAGS = '[^']+'/, "const BLOCK_TAGS = 'nothing'"))
    const html = '<div>Thank you how do I sign up?</div><div>________</div><div>From: Dominic</div><div>Sent: 29 September</div>'
    const text = v.R.htmlToText(html)
    variantFails('V16', !v.R.stripQuotedHistory(text).startsWith('Thank you how do I sign up?')
      || v.R.stripQuotedHistory(text).includes('From: Dominic'),
      "the block-element breaks removed: Outlook's quote header survives into the logged reply")
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V17 — AN EMPTY RESULT IS LOGGED AS ''. A blank contact row reads, months later, as "they replied
    // and said nothing" — which is a different fact from "the text could not be read".
    const v = variant('v17', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      '  if (!body) return NO_TEXT_PLACEHOLDER', '  // removed'))
    variantFails('V17', v.R.stripQuotedHistory('') === '',
      'the placeholder removed: a reply with no readable text is logged as an empty message')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { R, L, A, C } = build(REPO, 'ompReal')
  /**
   * 🔴 THE CENSUS READS CODE, NOT COMMENTS, AND THE FIRST VERSION DID NOT. This file's own header says
   * "there is no `messageFlagsAdd`, `messageMove`…" — so a census over the raw text found every banned
   * name in the sentence promising they were absent, and reported the promise as the violation. Block
   * and line comments are removed first; string literals are left alone, because a banned call written
   * as a string would still be a way to make one.
   */
  const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  const POLL = stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))

  console.log('\n── THE FIRST LOOK READS BY DATE, NOT BY THE CURRENT TOP UID ─────────────────────────────')
  {
    const SINCE = new Date('2026-09-29T00:00:00+01:00')
    // 🔴 THE 29 SEPTEMBER DEFECT. A folder with no watermark used to be baselined at whatever uid
    // happened to be at the top; the cron did exactly that to dominic/INBOX between Dominic's send and
    // his press of the button, at a uid that already included his reply.
    eq(R.planFetch(undefined, { uidvalidity: '42', highestUid: 9000 }, SINCE),
      { mode: 'first_look', since: SINCE }, '🔴 no stored watermark ⇒ a FIRST LOOK from the date, not a baseline')
    eq(R.planFetch({ uidvalidity: '42', lastUid: 9000 }, { uidvalidity: '42', highestUid: 9000 }, SINCE),
      { mode: 'none' }, 'nothing new ⇒ nothing fetched')
    eq(R.planFetch({ uidvalidity: '42', lastUid: 9000 }, { uidvalidity: '42', highestUid: 9003 }, SINCE),
      { mode: 'incremental', from: 9001 }, 'three new ⇒ from the one after the watermark')
    // ⚠️ A REBUILT MAILBOX MAKES THE STORED uid MEANINGLESS, not the mail new. Unchanged.
    eq(R.planFetch({ uidvalidity: '42', lastUid: 9000 }, { uidvalidity: '43', highestUid: 12 }, SINCE),
      { mode: 'rescan', sinceDays: 7 }, '🔴 uidvalidity changed ⇒ re-read 7 days, not 9000 uids')
    eq(R.RESCAN_DAYS, 7, 'and the window is 7 days')
    // ⚠️ A WATERMARK THAT EXISTS IS NEVER A FIRST LOOK, including `lastUid: 0`.
    eq(R.planFetch({ uidvalidity: '42', lastUid: 0 }, { uidvalidity: '42', highestUid: 1 }, SINCE),
      { mode: 'incremental', from: 1 },
      '🔴 a folder that was EMPTY last run reads incrementally from uid 1 — it is not baselined away')
  }

  console.log('\n── WHICH MESSAGES A FIRST LOOK PROCESSES ────────────────────────────────────────────────')
  {
    const SINCE = new Date('2026-09-29T00:00:00+01:00')
    check(R.withinFirstLook(new Date('2026-09-29T20:50:00Z'), SINCE),
      "🔴 Dominic's 20:50 reply IS processed — the message the old code swallowed")
    check(R.withinFirstLook('2026-09-29T00:00:00+01:00', SINCE), 'a message exactly at the instant is in')
    check(!R.withinFirstLook(new Date('2026-09-28T22:00:00Z'), SINCE),
      '…and one from the day before is NOT — history stays the importer\'s job')
    check(!R.withinFirstLook(new Date('2024-06-01T09:00:00Z'), SINCE), 'nor is a 2024 email')
    check(!R.withinFirstLook(null, SINCE), 'a message with no internal date is left alone rather than guessed at')
    check(!R.withinFirstLook('not a date', SINCE), '…and so is an unreadable one')
    // 🔴 THE POLL-SINCE INSTANTS THEMSELVES.
    eq(A.POLL_SINCE.hello, '2026-09-29T17:26:00Z', 'hello reads from when the poll went live')
    eq(A.POLL_SINCE.dominic, '2026-09-29T00:00:00+01:00', "dominic reads from the mailbox's creation day")
    check(A.pollSince('dominic').getTime() < Date.parse('2026-09-29T20:45:00Z'),
      '🔴 …which is before the primary switch, so the whole of that evening is in range')
  }

  console.log('\n── AN EMPTY FOLDER GETS A WATERMARK ─────────────────────────────────────────────────────')
  {
    // 🔴 THE SECOND HALF OF THE BUG. `withReadOnlyMailbox` does not open an empty mailbox, so the
    // callback that stores the watermark never ran: hello/Spam and hello/Archive reported "first look"
    // on every run for hours, and the first message to arrive in one would have been baselined away.
    eq(R.emptyWatermark('4242'), { uidvalidity: '4242', lastUid: 0 },
      '🔴 an empty folder stores lastUid 0 — "nothing seen yet", not "start from the top"')
    eq(R.emptyWatermark(4242), { uidvalidity: '4242', lastUid: 0 }, 'the uidvalidity is stored as a string, as elsewhere')
    // And the next message that arrives is then read incrementally, not skipped.
    const after = R.planFetch(R.emptyWatermark('4242'), { uidvalidity: '4242', highestUid: 1 }, new Date())
    eq(after, { mode: 'incremental', from: 1 }, '🔴 …so the FIRST message ever to arrive is processed')
    eq(R.advanceWatermark(R.emptyWatermark('4242'), { uidvalidity: '4242', highestUid: 1 }, [1]),
      { uidvalidity: '4242', lastUid: 1 }, '…and the watermark then moves past it')
  }

  console.log('\n── THE WATERMARK ADVANCES, AND NEVER GOES BACKWARDS ─────────────────────────────────────')
  {
    eq(R.advanceWatermark({ uidvalidity: '42', lastUid: 100 }, { uidvalidity: '42', highestUid: 105 }, [101, 103, 105]),
      { uidvalidity: '42', lastUid: 105 }, 'the highest uid seen becomes the watermark')
    // 🔴 A SHORT READ MUST NOT RE-PROCESS. Capped at MAX_PER_MAILBOX, the run stops early; the
    // watermark holds at what it actually saw and the rest arrives next time.
    eq(R.advanceWatermark({ uidvalidity: '42', lastUid: 100 }, { uidvalidity: '42', highestUid: 999 }, [101, 102]),
      { uidvalidity: '42', lastUid: 102 }, '🔴 a capped run advances only to what it read')
    eq(R.advanceWatermark({ uidvalidity: '42', lastUid: 100 }, { uidvalidity: '42', highestUid: 105 }, []),
      { uidvalidity: '42', lastUid: 100 }, 'reading nothing leaves the watermark where it was')
    eq(R.advanceWatermark({ uidvalidity: '42', lastUid: 9000 }, { uidvalidity: '43', highestUid: 12 }, [5, 9]),
      { uidvalidity: '43', lastUid: 9 }, 'after a rebuild the new validity and its own uids are stored')
  }

  console.log('\n── MATCHING A MESSAGE TO A PROSPECT ─────────────────────────────────────────────────────')
  {
    const byId = new Map([['<sent-1@hatchgrab.com>', 'p-alpha'], ['<sent-2@hatchgrab.com>', 'p-beta']])
    const byAddr = new Map([['sam@truck.test', ['p-alpha']], ['shared@chain.test', ['p1', 'p2']]])
    const h = raw => ({ get: hdrs(raw).get, fromAddress: null })
    eq(R.matchIncoming(h('In-Reply-To: <sent-1@hatchgrab.com>\r\n'), byId, byAddr),
      { kind: 'thread', prospectId: 'p-alpha' }, '🔴 In-Reply-To matches one of OUR ids — a certain match')
    eq(R.matchIncoming(h('References: <other@x> <sent-2@hatchgrab.com>\r\n'), byId, byAddr),
      { kind: 'thread', prospectId: 'p-beta' }, 'any id in References matches too')
    eq(R.matchIncoming({ get: () => null, fromAddress: 'Sam@Truck.TEST' }, byId, byAddr),
      { kind: 'address', prospectId: 'p-alpha' }, 'otherwise the From address, case-insensitively')
    eq(R.matchIncoming({ get: () => null, fromAddress: 'shared@chain.test' }, byId, byAddr),
      { kind: 'ambiguous' }, '🔴 two prospects on one address ⇒ ambiguous, never a guess')
    eq(R.matchIncoming({ get: () => null, fromAddress: 'someone@nowhere.test' }, byId, byAddr),
      { kind: 'none' }, 'an unknown sender matches nothing')
    // ⚠️ THREAD BEATS ADDRESS. The ids are ours; the address is an inference.
    eq(R.matchIncoming({ get: hdrs('In-Reply-To: <sent-2@hatchgrab.com>\r\n').get, fromAddress: 'sam@truck.test' }, byId, byAddr),
      { kind: 'thread', prospectId: 'p-beta' }, 'the thread wins when both could match')
    // Our own mail is not a reply to us.
    check(R.isOwnAddress('hello@hatchgrab.com') && R.isOwnAddress('Dominic@HatchGrab.com'),
      'both mailbox addresses are recognised as our own')
    check(!R.isOwnAddress('sam@truck.test'), '…and a prospect is not')
    eq(R.matchOutgoing(['sam@truck.test'], byAddr), { kind: 'address', prospectId: 'p-alpha' },
      'a Sent message To exactly one prospect matches it')
    eq(R.matchOutgoing(['sam@truck.test', 'shared@chain.test'], byAddr), { kind: 'ambiguous' },
      'a Sent message to two prospects is ambiguous and stores nothing')
    eq(R.matchOutgoing(['someone@else.test'], byAddr), { kind: 'none' }, 'and ordinary mail matches nothing')
  }

  console.log('\n── CLASSIFYING: AUTO-REPLY, BOUNCE, REPLY ───────────────────────────────────────────────')
  {
    const auto = raw => R.isAutoReply(hdrs(raw, { subject: /Subject: (.*)/.exec(raw)?.[1] ?? null }))
    check(auto('Auto-Submitted: auto-replied\r\n'), 'Auto-Submitted (RFC3834) — the well-behaved marker')
    check(!auto('Auto-Submitted: no\r\n'), '⚠️ …and `no` explicitly means it is NOT automatic')
    check(auto('X-Autoreply: yes\r\n'), 'X-Autoreply')
    check(auto('X-Autorespond: yes\r\n'), 'X-Autorespond')
    check(auto('Precedence: bulk\r\n'), 'Precedence: bulk')
    check(auto('Precedence: auto_reply\r\n'), 'Precedence: auto_reply')
    check(!auto('Precedence: normal\r\n'), '…but not an ordinary Precedence')
    for (const sub of ['Automatic reply: hello', 'Auto: away', 'Autoreply', 'Out of Office until Monday']) {
      check(R.isAutoReply(hdrs('', { subject: sub })), `subject "${sub}"`)
    }
    check(!R.isAutoReply(hdrs('', { subject: 'Re: Taking orders online' })), 'a real reply subject is not auto')
    check(R.isBounce(hdrs('', { from: 'MAILER-DAEMON@hatchgrab.com' })), 'mailer-daemon@ is a bounce')
    check(R.isBounce(hdrs('', { from: 'postmaster@example.test' })), 'so is postmaster@')
    check(R.isBounce(hdrs('', { from: 'x@y.test', contentType: 'multipart/report; report-type=delivery-status; boundary=b' })),
      'so is a multipart/report delivery-status body, whatever the From')
    check(!R.isBounce(hdrs('', { from: 'sam@truck.test', contentType: 'text/plain' })), 'an ordinary reply is not')
    // 🔴 BOUNCE BEFORE AUTO-REPLY.
    eq(R.classifyIncoming(hdrs('Auto-Submitted: auto-replied\r\n', { from: 'mailer-daemon@x.test' })), 'bounce',
      '🔴 a delivery report carrying Auto-Submitted is a BOUNCE, not an out-of-office')
    eq(R.classifyIncoming(hdrs('', { from: 'sam@truck.test', subject: 'Re: hello' })), 'reply', 'everything else is a reply')
  }

  console.log('\n── WHICH EMAIL A BOUNCE IS ABOUT ────────────────────────────────────────────────────────')
  {
    const returned = 'Return-Path: <dominic@hatchgrab.com>\r\nMessage-ID: <orig-7@hatchgrab.com>\r\nSubject: Taking orders online\r\n'
    eq(R.bouncedOriginalId(returned, hdrs('')), '<orig-7@hatchgrab.com>',
      '🔴 the id inside the RETURNED copy is the authority')
    eq(R.bouncedOriginalId(null, hdrs('In-Reply-To: <orig-8@hatchgrab.com>\r\n')), '<orig-8@hatchgrab.com>',
      'with no returned part, In-Reply-To is the fallback')
    eq(R.bouncedOriginalId(null, hdrs('References: <a@x> <orig-9@hatchgrab.com>\r\n')), '<orig-9@hatchgrab.com>',
      '…then the LAST id in References, which is the nearest parent')
    eq(R.bouncedOriginalId(null, hdrs('')), null, 'and nothing at all is null, not a guess')
  }

  console.log('\n── THE REPLY TEXT: QUOTED HISTORY REMOVED ───────────────────────────────────────────────')
  {
    const gmail = 'Yes please, sounds good.\n\nOn Fri, 11 Sep 2026 at 13:07, Dominic Bonini <dominic@hatchgrab.com> wrote:\n> the whole original email\n'
    eq(R.stripQuotedHistory(gmail), 'Yes please, sounds good.', '"On … wrote:" is cut')
    const outlook = 'Not for us thanks.\n\nFrom: Dominic Bonini <dominic@hatchgrab.com>\nSent: 11 September 2026\nSubject: Taking orders online\n\nthe original\n'
    eq(R.stripQuotedHistory(outlook), 'Not for us thanks.', "an Outlook \"From:\" header block is cut")
    const original = 'Interested.\n\n-----Original Message-----\nFrom: Dominic\n'
    eq(R.stripQuotedHistory(original), 'Interested.', '"-----Original Message-----" is cut')
    // ⚠️ NEVER EMPTY. A blank contact row reads as "they said nothing", which is the record Dominic
    // relies on later.
    const topless = 'On Fri, 11 Sep 2026 at 13:07, Dominic wrote:\n> everything\n'
    check(R.stripQuotedHistory(topless).length > 0, '⚠️ a reply with nothing above the quote logs the whole message, not a blank')
    eq(R.stripQuotedHistory('x'.repeat(5000)).length, R.REPLY_TEXT_CAP, `capped at ${R.REPLY_TEXT_CAP} characters`)
    check(R.stripQuotedHistory('x'.repeat(5000)).endsWith('…'), '…and says it was cut')
    eq(R.stripQuotedHistory('  plain reply  '), 'plain reply', 'a reply with no quote is itself, trimmed')
  }

  console.log('\n── THE REPLY TEXT: HTML-ONLY REPLIES, DECODING, AND THE QUOTE BLOCK ────────────────────')
  {
    // 🔴 THE 29 SEPTEMBER DEFECT, REPRODUCED. Hotmail sent this; the old code asked only for
    // text/plain, found none, and logged an empty contact row.
    const HOTMAIL = [
      '<html><head><style>p{margin:0}</style></head><body>',
      '<div dir="ltr">Thank you how do I sign up?</div>',
      '<div id="appendonsend"></div>',
      '<hr style="display:inline-block;width:98%">',
      '<div id="divRplyFwdMsg" dir="ltr">',
      '<font face="Calibri" color="#000000"><b>From:</b> Dominic Bonini &lt;dominic@hatchgrab.com&gt;<br>',
      '<b>Sent:</b> 29 September 2026 20:45<br>',
      '<b>To:</b> Dominic Bonini &lt;dominicbonini@hotmail.com&gt;<br>',
      '<b>Subject:</b> Taking orders online</font><div>&nbsp;</div></div>',
      '<div><div style="font-size:12pt">Hi Sam,</div><div>the whole original pitch</div></div>',
      '</body></html>',
    ].join('')
    const text = R.replyTextFrom(null, HOTMAIL)
    check(text.includes('Thank you how do I sign up?'), '🔴 an HTML-only reply yields its text')
    check(!text.includes('<div'), '…with no markup left in it')
    check(!text.includes('&lt;'), '…and entities decoded')
    const logged = R.stripQuotedHistory(text)
    eq(logged, 'Thank you how do I sign up?',
      "🔴 …and the Outlook From:/Sent:/To:/Subject: block is stripped, leaving exactly the reply")
    check(!logged.includes('the whole original pitch'), '…so the quoted original is not logged as theirs')

    // ⚠️ THE PLAIN PART WINS WHEN IT HAS WORDS.
    eq(R.replyTextFrom('Yes please.', '<div>ignored</div>'), 'Yes please.', 'a real text/plain part is preferred')
    eq(R.replyTextFrom('   ', '<div>from the html</div>'), 'from the html',
      '⚠️ …but a WHITESPACE-ONLY plain part is not "present" — that is the multipart/alternative case')
    eq(R.replyTextFrom(null, null), '', 'neither part gives the empty string, which the caller turns into the placeholder')
    eq(R.stripQuotedHistory(''), R.NO_TEXT_PLACEHOLDER, '🔴 …and nothing at all is NEVER logged as an empty message')
    eq(R.NO_TEXT_PLACEHOLDER, '(no text — open the email to read it)', '…the placeholder says where to look')

    // The other quote shapes still work on HTML-derived text.
    eq(R.stripQuotedHistory(R.replyTextFrom(null, '<div>Sounds good.</div><div>On Fri, 11 Sep 2026 at 13:07, Dominic wrote:</div><div>the original</div>')),
      'Sounds good.', 'the Gmail "On … wrote:" form is stripped from HTML too')
    eq(R.stripQuotedHistory(R.replyTextFrom(null, '<p>Not for us.</p><p>-----Original Message-----</p><p>the original</p>')),
      'Not for us.', 'and so is "-----Original Message-----"')
  }

  console.log('\n── HTML → TEXT ─────────────────────────────────────────────────────────────────────────')
  {
    eq(R.htmlToText('<div>a</div><div>b</div>'), 'a\nb', 'block elements become line breaks')
    // ⚠️ Hotmail writes each line of a reply as its own div, so `</div><div>` sits between every pair.
    eq(R.htmlToText('<div>a</div><div><br></div><div>b</div>'), 'a\n\nb',
      '🔴 …one break between adjacent lines, TWO only where the author left a blank line')
    eq(R.htmlToText('a<br>b'), 'a\nb', '…and so does <br>')
    eq(R.htmlToText('<p>a</p>'), 'a', 'a single paragraph is just its text')
    eq(R.htmlToText('<script>alert(1)</script>visible'), 'visible',
      '🔴 a <script> is removed WITH its content — not just its tags')
    eq(R.htmlToText('<style>p{color:red}</style>visible'), 'visible', '…and so is a <style>')
    eq(R.htmlToText('<!-- hidden -->shown'), 'shown', 'comments go')
    eq(R.htmlToText('&amp;lt; stays escaped once'), '&lt; stays escaped once',
      '⚠️ `&amp;lt;` decodes ONCE, not twice')
    eq(R.htmlToText('a&nbsp;&nbsp;b'), 'a b', 'non-breaking spaces collapse within a line')
    eq(R.htmlToText('a\n\n\n\nb'), 'a\n\nb', '…and a run of blank lines collapses to one')
    eq(R.htmlToText('&#8217;'), '\u2019', 'a numeric entity decodes')
    eq(R.htmlToText('&#x2014;'), '—', '…and a hex one')
    eq(R.htmlToText('&notarealentity;'), '&notarealentity;', 'an entity nobody knows is left alone, not blanked')
    eq(R.htmlToText(''), '', 'empty in, empty out')
  }

  console.log('\n── A REPLY TO A TEST SEND IS IGNORED ───────────────────────────────────────────────────')
  {
    // 🔴 THE SECOND 29 SEPTEMBER DEFECT. Dominic replied to a TEST send; the thread matched, and the
    // reply was logged as a real one — moving the prospect to `replied` on a conversation that never
    // happened. A test goes to his own address, so it is him answering himself.
    const POLL = stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))
    check(/function isReplyToTestOnly/.test(POLL), 'the rule exists as its own function')
    check(/if \(isReplyToTestOnly\(h, dir\)\) \{ summary\.repliesToTest\+\+; return \}/.test(POLL),
      '🔴 …and it RETURNS — it does not fall through to the address match, which would log it anyway')
    const beforeMatch = POLL.indexOf('isReplyToTestOnly(h, dir)')
    const atMatch = POLL.indexOf('matchIncoming({ get: h.get')
    check(beforeMatch > 0 && beforeMatch < atMatch, '…and it is tested BEFORE the match is attempted')
    check(/if \(m\.is_test\) testMessageIds\.add\(m\.message_id\)/.test(POLL),
      'the directory knows which of our Message-IDs are tests')
    // "ONLY" in both directions.
    const fn = POLL.slice(POLL.indexOf('function isReplyToTestOnly'), POLL.indexOf('function headersOf'))
    check(/if \(!known\.length\) return false/.test(fn),
      '⚠️ a message with NO thread ids is not a reply to a test — the address match decides, as before')
    check(/return known\.every\(id => dir\.testMessageIds\.has\(id\)\)/.test(fn),
      '🔴 …and a thread touching ANY real send is a real conversation, handled normally')
  }

  console.log('\n── REPAIRING REPLIES LOGGED WITHOUT THEIR TEXT ─────────────────────────────────────────')
  {
    const POLL = stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))
    const fn = POLL.slice(POLL.indexOf('async function repairReplyTexts'), POLL.indexOf('async function housekeeping'))
    // 🔴 IT ONLY EVER FILLS A GAP.
    check(/\.or\('message\.is\.null,message\.eq\.'\)/.test(fn),
      "🔴 the contact message is written ONLY where it is still empty")
    check(/\.or\('text_body\.is\.null,text_body\.eq\.'\)/.test(fn),
      '🔴 …and so is the message row\'s text_body')
    check(/filter\(c => !\(c\.message \?\? ''\)\.trim\(\)\)/.test(fn),
      'only rows whose contact message is null or blank are even considered')
    check(/MAX_REPAIRS_PER_RUN/.test(fn) && /const MAX_REPAIRS_PER_RUN = 20/.test(POLL),
      'at most 20 per run — each costs an IMAP fetch against a 60-second budget')
    check(/withReadOnlyMailbox\(client, r\.mailbox!/.test(fn), '⚠️ read-only, like everything else here')
    check(/credentialsFor\(accounts, account as MailAccount\)/.test(fn),
      "each row is read from its OWN account — a hello@ row from hello@")
    check(/summary\.textsFilled\+\+/.test(fn), 'and the run reports how many it filled in')
    check(/await repairReplyTexts\(supabase, accounts, summary\)/.test(POLL), 'the poll runs it')
    check(!/\.delete\(\)/.test(fn), 'it deletes nothing')
  }

  console.log('\n── CONTACT HISTORY OPENS THE EMAIL IT WAS LOGGED FROM ──────────────────────────────────')
  {
    const UI = fs.readFileSync(path.join(REPO, 'components/admin/OutreachPanel.tsx'), 'utf8')
    const ROUTE = fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/route.ts'), 'utf8')
    check(/c\.email_message_id = emailByContact\.get\(c\.id\) \?\? null/.test(ROUTE),
      'the list route links each contact to its email row, from outreach_messages.contact_id')
    check(/\.not\('contact_id', 'is', null\)/.test(ROUTE), '…in one bulk read')
    check(/\{contact\.email_message_id && \(/.test(UI),
      '🔴 a contact WITH a linked email shows it; one without keeps the view it had')
    check(/<EmailBody rowId=\{contact\.email_message_id\} \/>/.test(UI), '…through the shared component')
    const body = UI.slice(UI.indexOf('function EmailBody'), UI.indexOf('function ContactPopout'))
    check(/action: 'view', message_row_id: rowId/.test(body), 'which uses the SAME read-only view action')
    check(/sandbox=""/.test(body), '🔴 …and the SAME sandboxed frame — the markup is sender-controlled')
    check(/contact\.message/.test(UI), 'the logged text is still shown, above it')
  }

  console.log('\n── THE STAGE: A REPLY MOVES contacted → replied, AND NOTHING ELSE ──────────────────────')
  {
    // 🔴 THROUGH `logOutreachContact`, THE ONE WRITER. The poll calls this; it does not insert beside it.
    const calls = []
    const mock = (moved) => ({
      from(table) {
        const q = {
          _t: table, _f: {},
          insert(v) { calls.push(['insert', table, v]); return q },
          update(v) { calls.push(['update', table, v]); return q },
          select: () => q,
          eq(c, v) { q._f[c] = v; return q },
          in(c, v) { q._f[c] = v; calls.push(['in', c, v]); return q },
          single: async () => ({ data: { id: 'c1' }, error: null }),
          then: r => r({ data: table === 'outreach_prospects' ? moved : null, error: null }),
        }
        return q
      },
    })
    const out = await L.logOutreachContact(mock([{ id: 'p1', stage: 'replied' }]), {
      prospect_id: 'p1', channel: 'email', direction: 'inbound', kind: 'reply', message: 'yes please',
    })
    eq(out.ok, true, 'the rung is written')
    eq(out.stage, 'replied', '🔴 contacted → replied, reported back')
    const upd = calls.find(c => c[0] === 'update' && c[1] === 'outreach_prospects')
    eq(upd[2].stage, 'replied', 'the update sets `replied`')
    const inFilter = calls.find(c => c[0] === 'in' && c[1] === 'stage')
    eq(inFilter[2], ['not_contacted', 'contacted'],
      '🔴 …only FROM not_contacted or contacted — a hand-set stage is never overwritten')
    const rung = calls.find(c => c[0] === 'insert' && c[1] === 'outreach_contacts')
    eq(rung[2].direction, 'inbound', 'the contact row is inbound')
    eq(rung[2].kind, 'reply', "and its kind is `reply` — the ladder's rungs are outbound-only")
    eq(L.REPLY_MOVES_FROM, ['not_contacted', 'contacted'], 'the two source stages are declared, not inlined')
  }

  console.log('\n── HOUSEKEEPING: STUCK SENDS AND WHICH FAILURES RETRY ───────────────────────────────────')
  {
    const ago = ms => new Date(Date.now() - ms).toISOString()
    check(R.isStuckSending({ status: 'sending', is_test: false, updated_at: ago(11 * 60_000) }, new Date()),
      'a real send stuck at `sending` for 11 minutes is swept')
    check(!R.isStuckSending({ status: 'sending', is_test: false, updated_at: ago(5 * 60_000) }, new Date()),
      '…but not one 5 minutes old')
    check(!R.isStuckSending({ status: 'sending', is_test: true, updated_at: ago(60 * 60_000) }, new Date()),
      '⚠️ a TEST send is never swept — it changes nothing and needs no verdict')
    check(!R.isStuckSending({ status: 'sent', is_test: false, updated_at: ago(60 * 60_000) }, new Date()),
      'and a sent row is left alone')

    // 🔴 ONLY TEMPORARY FAILURES RETRY.
    check(R.isTemporaryFailure('421: Service not available, try later'), 'a 4xx SMTP reply is temporary')
    check(R.isTemporaryFailure('450: Requested action aborted'), 'so is a 450')
    check(!R.isTemporaryFailure('550: No such mailbox'), '🔴 a 5xx is PERMANENT — it never becomes true')
    check(!R.isTemporaryFailure('EAUTH: Invalid login'), '🔴 EAUTH is never retried — that is how accounts get locked')
    check(R.isTemporaryFailure('ETIMEDOUT: connect timed out'), 'a connection timeout is temporary')
    check(R.isTemporaryFailure('ECONNECTION: could not connect'), 'so is ECONNECTION')
    check(R.isTemporaryFailure('EDNS: host not found'), 'so is EDNS')
    check(!R.isTemporaryFailure('EMESSAGE: message rejected'), 'a rejected message is not')
    check(!R.isTemporaryFailure(null), 'and an error nobody recorded is not retried on a guess')

    const row = o => ({ status: 'failed', is_test: false, attempts: 1, last_error: '421: try later', created_at: ago(5 * 60_000), ...o })
    check(R.shouldAutoRetry(row(), new Date()), 'recent, temporary, under the ceiling ⇒ retry')
    check(!R.shouldAutoRetry(row({ created_at: ago(45 * 60_000) }), new Date()), '🔴 older than 30 minutes ⇒ no')
    check(!R.shouldAutoRetry(row({ attempts: 3 }), new Date()), `🔴 ${R.MAX_AUTO_ATTEMPTS} attempts ⇒ no`)
    check(!R.shouldAutoRetry(row({ last_error: 'EAUTH: Invalid login' }), new Date()), '🔴 EAUTH ⇒ no')
    check(!R.shouldAutoRetry(row({ last_error: '550: rejected' }), new Date()), '🔴 a 5xx ⇒ no')
    check(!R.shouldAutoRetry(row({ status: 'uncertain' }), new Date()),
      '🔴 an `uncertain` row is NEVER auto-retried — the whole point is that a human checks Sent first')
  }

  console.log('\n── THE LOCK ─────────────────────────────────────────────────────────────────────────────')
  {
    const now = new Date()
    check(R.lockIsHeld(new Date(now.getTime() - 10_000).toISOString(), now), 'a run 10 seconds old holds the lock')
    check(!R.lockIsHeld(new Date(now.getTime() - 5 * 60_000).toISOString(), now),
      '⚠️ …and a run 5 minutes old does NOT — a frozen container must not disable the feature forever')
    check(!R.lockIsHeld(null, now), 'no lock is no lock')
    check(!R.lockIsHeld('not a date', now), 'and an unreadable one is not treated as held')
    eq(R.LOCK_STALE_MS, 120_000, 'the staleness window is 2 minutes')
  }

  console.log('\n── TWO ACCOUNTS, AND THE FALLBACK THAT MAKES THE DEPLOY A NO-OP ────────────────────────')
  {
    const HELLO = { OUTREACH_MAIL_USER: 'hello@hatchgrab.com', OUTREACH_MAIL_PASSWORD: 'x' }
    const BOTH = { ...HELLO, OUTREACH_PRIMARY_USER: 'dominic@hatchgrab.com', OUTREACH_PRIMARY_PASSWORD: 'y' }

    // 🔴 THE FALLBACK IS THE DEFAULT. This deploy reaches production before Dominic adds the new
    // variables; until he does, everything must behave exactly as it did in Build 2.
    const legacyOnly = A.resolveAccounts(HELLO)
    eq(legacyOnly.configured.map(c => c.account), ['hello'], 'with only the old vars, one account')
    eq(A.accountForSend(legacyOnly).account, 'hello', '🔴 …and hello@ still does the sending')
    eq(legacyOnly.primaryConfigured, false, '…the primary is not configured')
    eq(A.legacyIsReadOnly(legacyOnly), false, '…so hello@ is NOT read-only yet — it is still the sender')

    const both = A.resolveAccounts(BOTH)
    eq(both.configured.map(c => c.account), ['hello', 'dominic'], 'with both, both are configured')
    eq(A.accountForSend(both).account, 'dominic', '🔴 …and the PRIMARY sends')
    eq(A.accountForSend(both).user, 'dominic@hatchgrab.com', '…logging in as dominic@')
    eq(both.primaryConfigured, true, 'the primary is configured')
    eq(A.legacyIsReadOnly(both), true, '🔴 …so hello@ is read-only from now on')

    // ⚠️ HALF A CREDENTIAL IS NO CREDENTIAL. A username with no password would otherwise produce a
    // login attempt that fails for a reason that says nothing.
    eq(A.resolveAccounts({ ...HELLO, OUTREACH_PRIMARY_USER: 'dominic@hatchgrab.com' }).primaryConfigured, false,
      'a primary username with no password is not configured')
    eq(A.resolveAccounts({}).primary, null, 'neither configured ⇒ no primary, and callers refuse as before')

    // Which mailbox a STORED ROW is read from.
    eq(A.accountOfRow({ account: 'hello' }), 'hello', "a 'hello' row opens hello@")
    eq(A.accountOfRow({ account: 'dominic' }), 'dominic', "a 'dominic' row opens dominic@")
    eq(A.accountOfRow({}), 'hello', '⚠️ a row with no account is legacy — that is where those uids point')
    eq(A.accountOfRow({ account: 'nonsense' }), 'hello', '…and so is a row with a value nobody recognises')
    eq(A.credentialsFor(both, 'hello').user, 'hello@hatchgrab.com', 'credentials are looked up per account')
    eq(A.credentialsFor(legacyOnly, 'dominic'), null, '…and are null for an account that is not set up')
    eq(A.ACCOUNT_ENV.dominic.user, 'OUTREACH_PRIMARY_USER', 'the primary reads OUTREACH_PRIMARY_USER')
    eq(A.ACCOUNT_ENV.hello.user, 'OUTREACH_MAIL_USER', '…and the legacy keeps the existing variable')
  }

  console.log('\n── 🔴 TWO CONCURRENT RUNS, ONE REPLY, ONE CONTACT ROW ───────────────────────────────────')
  {
    // 🔴 THE BUILD-2 DEFECT, SIMULATED. The fake table has a REAL unique index on message_id, so this
    // is a genuine race: both runs try, and the table decides.
    const db = fakeDb()
    const row = () => ({ message_id: '<reply-1@prospect.test>', prospect_id: 'p1', direction: 'inbound', status: 'received', account: 'dominic' })
    const [a, b] = await Promise.all([C.insertMessageOnce(db, row()), C.insertMessageOnce(db, row())])
    const winners = [a, b].filter(r => r.created)
    eq(winners.length, 1, '🔴 exactly ONE of two concurrent runs creates the message row')
    eq([a, b].filter(r => !r.created && r.error === null).length, 1, '…and the loser is told so without an error')
    // Only the winner logs. That is the whole fix: the contact row is gated on the insert.
    for (const r of [a, b]) {
      if (r.created) await L.logOutreachContact(db, { prospect_id: 'p1', channel: 'email', direction: 'inbound', kind: 'reply', message: 'yes' })
    }
    eq(db.contacts.length, 1, '🔴 …so exactly ONE contact row is written for the reply')
    eq(db.messages.size, 1, 'and exactly one message row exists')

    // A third run later — the message is already there — still logs nothing.
    const later = await C.insertMessageOnce(db, row())
    eq(later.created, false, 'a later run finds it already recorded')
    eq(db.contacts.length, 1, '…and writes no second contact row')
  }

  console.log('\n── 🔴 TWO CONCURRENT RUNS, ONE FAILED ROW, ONE RETRY ────────────────────────────────────')
  {
    const db = fakeDb()
    await db.from('outreach_messages').upsert({ message_id: '<f@x>', status: 'failed' }, { ignoreDuplicates: true }).select('id')
    const id = [...db.messages.values()][0].id
    const [a, b] = await Promise.all([C.claimRetry(db, id, new Date()), C.claimRetry(db, id, new Date())])
    eq([a, b].filter(Boolean).length, 1, '🔴 exactly ONE run claims the retry — the other re-send never happens')
    eq([...db.messages.values()][0].status, 'sending', "…and the row is left at `sending`, which is honest")
    eq(await C.claimRetry(db, id, new Date()), false, 'a row that is no longer `failed` cannot be claimed again')
  }

  console.log('\n── 🔴 THE LOCK IS ONE STATEMENT, NOT A READ THEN A WRITE ────────────────────────────────')
  {
    const db = fakeDb()
    const now = new Date()
    const [a, b] = await Promise.all([C.claimPollLock(db, now), C.claimPollLock(db, now)])
    eq([a, b].filter(Boolean).length, 1, '🔴 exactly ONE of two concurrent runs takes the lock')
    eq(await C.claimPollLock(db, now), false, 'a third attempt while it is held gets nothing')
    // ⚠️ AND IT EXPIRES, or a frozen container disables the feature for good.
    const later = new Date(now.getTime() + C.LOCK_STALE_MS + 1000)
    eq(await C.claimPollLock(db, later), true, '⚠️ …but a run that has gone quiet for 2 minutes is taken over')
    await C.releasePollLock(db)
    eq(await C.claimPollLock(db, new Date(later.getTime() + 1)), true, 'and a released lock is immediately available')
  }

  console.log('\n── SOURCE CENSUS: THE POLL ONLY EVER READS ──────────────────────────────────────────────')
  {
    // 🔴 THIS IS THE ASSERTION THAT CANNOT BE MADE ANY OTHER WAY without a live mailbox. A single
    // stray `messageFlagsAdd` would mark a prospect's reply read before Dominic ever saw it.
    for (const call of ['messageFlagsAdd', 'messageFlagsSet', 'messageFlagsRemove', 'messageMove',
      'messageCopy', 'messageDelete', 'expunge', 'mailboxCreate', 'mailboxDelete']) {
      check(!POLL.includes(call), `no \`${call}\` anywhere in the poll`)
    }
    check(!/\bappend\(/.test(POLL), 'no direct APPEND — the only one lives in the deliver module')
    check(/withReadOnlyMailbox\(/.test(POLL), 'every walk goes through `withReadOnlyMailbox` (EXAMINE)')
    check(!/getMailboxLock\([^)]*readOnly:\s*false/.test(POLL), 'no mailbox is ever opened writable')
    // The one write it CAN cause, and how narrow it is.
    check(!/sendMail\(/.test(POLL), '🔴 the poll never calls sendMail itself')
    check(/deliver\(supabase/.test(POLL), '…the only send is `deliver`, on a row that already exists')
    check(/shouldAutoRetry\(row, now\)/.test(POLL), '…and only when `shouldAutoRetry` says so')
    check(/logOutreachContact\(/.test(POLL), 'contacts are written through the one writer')
    // 🔴 RESTATED, NOT LOOSENED. It banned the NAME `outreach_contacts`, which was a fair proxy while
    // the poll only ever wrote contacts through the one writer. The repair pass now READS that table
    // (to find which logged replies are empty) and UPDATES a `message` on rows that already exist. It
    // still never INSERTS one, which is what the assertion was always about, so that is what it now
    // says — and it names the two operations that would make it a second ladder.
    const contactRefs = POLL.match(/from\('outreach_contacts'\)[\s\S]{0,140}/g) ?? []
    check(contactRefs.length > 0, 'the poll does touch outreach_contacts (the repair pass reads it)')
    check(!contactRefs.some(r => /\.insert\(|\.upsert\(/.test(r)),
      '🔴 …but never INSERTS a contact row — every rung still comes from logOutreachContact')
    check(!contactRefs.some(r => /\.delete\(/.test(r)), '…and never deletes one')
    check(/dir\.skip\.has\(match\.prospectId\)/.test(POLL), 'a linked HatchGrab truck is skipped')
    check(/hatchgrab_truck_id/.test(POLL), '…identified by its linked truck id, as the send route does')
    // Auto-replies and bounces must not reach the contact log.
    const autoFn = POLL.slice(POLL.indexOf('async function handleAutoReply'), POLL.indexOf('async function handleBounce'))
    check(!/logOutreachContact/.test(autoFn), '🔴 an auto-reply writes NO contact row')
    const bounceFn = POLL.slice(POLL.indexOf('async function handleBounce'), POLL.indexOf('async function handleReply'))
    check(!/logOutreachContact/.test(bounceFn), '🔴 a bounce writes NO contact row either')
    check(/status: 'bounced'/.test(bounceFn), '…it marks the ORIGINAL outbound row `bounced`')
    // Idempotency and the unmatched rule.
    check(/dir\.byMessageId\.has\(m\.messageId\)/.test(POLL), '🔴 a message already recorded is skipped')
    check(/summary\.unmatched\+\+/.test(POLL), 'unmatched mail is counted…')
    check(!/unmatchedDetails|unmatchedList/.test(POLL), '…and nothing about it is stored or named')
    // Outlook-sent gating.
    const outlookFn = POLL.slice(POLL.indexOf('async function handleOutlookSent'))
    check(/if \(!dir\.hasReply\.has\(prospectId\)\) return/.test(outlookFn),
      '🔴 Outlook-sent mail is logged only when the prospect has already replied')
    check(/kind: 'reply'/.test(outlookFn) && !/1_first_contact|2_chase_1/.test(outlookFn),
      "…and never as a ladder rung — the rungs are what THIS page sends")
  }

  console.log('\n── SOURCE CENSUS: WHICH ACCOUNT EACH PATH USES ─────────────────────────────────────────')
  {
    const SEND = stripComments(fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-send/route.ts'), 'utf8'))
    const IMPORT = stripComments(fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-import/route.ts'), 'utf8'))
    const HEALTH = stripComments(fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-health/route.ts'), 'utf8'))
    const DELIVER = stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-deliver.ts'), 'utf8'))

    // 🔴 THE SEND ASKS FOR THE PRIMARY AND CANNOT BE HANDED THE LEGACY ONE.
    check(/accountForSend\(accounts\)/.test(SEND), 'the send resolves its account through `accountForSend`')
    check(/account: sender\.account/.test(SEND), '🔴 …and the new row is stamped with that account')
    check(!/process\.env\.OUTREACH_MAIL_USER/.test(SEND),
      'the send route reads no credential from the environment directly any more')
    check(!/process\.env\.OUTREACH_MAIL_USER/.test(stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))),
      '…nor does the poll')
    check(!/process\.env\.OUTREACH_MAIL_USER/.test(IMPORT), '…nor does the importer')

    // 🔴 EVERY READ BY uid GOES THROUGH THE ROW'S OWN ACCOUNT.
    for (const [what, re] of [
      ['View', /const viewCreds = credentialsFor\(accounts, accountOfRow\(row\)\)/],
      ['the chaser quote', /const creds = credentialsFor\(accounts, accountOfRow\(parent\)\)/],
      ['a retry', /const rowCreds = credentialsFor\(accounts, accountOfRow\(row\)\)/],
      ['Save to Sent', /const copyCreds = credentialsFor\(accounts, accountOfRow\(row\)\)/],
    ]) check(re.test(SEND), `${what} opens the ROW'S account, not the primary`)
    check(/credentialsFor\(accounts, accountOfRow\(row\)\)/.test(stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))),
      'housekeeping does too')

    // 🔴 THE LEGACY ACCOUNT HAS NO SEND PATH OF ITS OWN. Everything that can write to a mailbox —
    // `sendMail` and `append` — lives in the deliver module, and its only callers hand it either the
    // primary (a new send) or the row's own account (a retry / a late Sent copy of a message that
    // account itself sent). There is no code path that picks `hello` for a NEW message.
    check(!/sendMail\(/.test(SEND) && !/\bappend\(/.test(SEND),
      'the send route itself neither sends nor appends — both live in the deliver module')
    check(/sendMail\(/.test(DELIVER) && /appendToSent\(/.test(DELIVER), '…which is the one module that does')
    check(!/'hello'/.test(DELIVER) && !/LEGACY_ACCOUNT/.test(DELIVER),
      "🔴 …and it names no account at all, so it cannot prefer the legacy one")
    check(!/accountForSend/.test(stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))),
      'the poll never resolves a SEND account — its only send is a retry of an existing row')

    // Both accounts are walked for reading.
    const POLLSRC = stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))
    check(/for \(const creds of accounts\.configured\)/.test(POLLSRC), 'the poll walks every configured account')
    check(/for \(const creds of accounts\.configured\)/.test(IMPORT), '…and so does the importer')
    check(/STATE_KEY\[creds\.account\]/.test(POLLSRC), '🔴 each account has its OWN watermarks…')
    check(/hello: 'mail_poll_state'/.test(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8')),
      "…and hello@ keeps the existing key, so the switch does not re-read its recent mail")
    // 🔴 RESTATED 29 September (the baseline fix), NOT SILENTLY RE-POINTED. This read
    // `mail_poll_state_dominic`; that key holds the watermarks the broken cron set by baselining, one
    // of which sat above a real reply. The recovery is a new key — see the recovery section below for
    // why the old one is left in place rather than rewritten.
    check(/dominic: 'mail_poll_state_dominic_v2'/.test(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8')),
      '…while dominic@ has its own key, and therefore its own first look')
    check(/account: creds\.account/.test(IMPORT), 'the importer stamps each new row with the account it read from')
    check(/account,/.test(POLLSRC), '…and so does the poll')

    // The health check reports each account.
    check(/for \(const creds of accounts\.configured\)/.test(HEALTH), 'the health check tests every account')
    check(/role: creds\.account === accounts\.primary\?\.account \? 'primary' : 'legacy'/.test(HEALTH),
      '…labels which is primary')
    check(!/sendMail\(/.test(HEALTH), '🔴 …and still never sends — it is a login check')

    // 🔴 THE ATOMIC CLAIMS ARE USED, not just written.
    check(/claimPollLock\(supabase, now\)/.test(POLLSRC), 'the poll takes the lock atomically')
    check(!/takeLock\(/.test(POLLSRC), '…and the read-then-write version is gone')
    check(/insertMessageOnce\(/.test(POLLSRC), 'every recorded message goes through the insert gate')
    check(!/from\('outreach_messages'\)\.insert\(/.test(POLLSRC),
      '🔴 …and no handler inserts directly any more, which is what made the contact log racy')
    check(/claimRetry\(supabase, row\.id, now\)/.test(POLLSRC), 'the retry is claimed atomically')
  }

  console.log('\n── THE RECOVERY, AND WHAT IT DELIBERATELY LEAVES ALONE ─────────────────────────────────')
  {
    const POLLSRC = stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))
    check(/dominic: 'mail_poll_state_dominic_v2'/.test(POLLSRC),
      "🔴 dominic reads a NEW key, so its folders get the date-based first look and the swallowed reply")
    check(/hello: 'mail_poll_state'/.test(POLLSRC),
      "🔴 hello keeps its EXISTING key — its INBOX and Sent watermarks were set by runs that really read them")
    check(!/mail_poll_state_dominic'/.test(POLLSRC.replace(/mail_poll_state_dominic_v2/g, '')),
      '⚠️ the old dominic key is not read anywhere…')
    const ALL = ['lib/outreach-mail-poll.ts', 'lib/outreach-mail-poll-rules.ts', 'lib/outreach-poll-claims.ts']
      .map(f => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n')
    check(!/delete\(\)/.test(ALL) && !/\.remove\(/.test(ALL),
      '🔴 …and nothing deletes it: it is the only record of what the broken run did')

    // 🔴 A MESSAGE THE IMPORTER ALREADY RECORDED IS NOT LOGGED AGAIN ON A FIRST LOOK. The first look
    // deliberately re-reads mail the importer may have seen; the insert gate is what makes that safe.
    const db = fakeDb()
    const imported = { message_id: '<already@x>', prospect_id: 'p1', direction: 'inbound', status: 'received', source: 'mailbox_import', account: 'dominic' }
    await C.insertMessageOnce(db, imported)
    eq(db.contacts.length, 0, 'the importer writes no contact row, as it never has')
    const again = await C.insertMessageOnce(db, { ...imported, source: 'poll' })
    eq(again.created, false, '🔴 a first look re-reading it does NOT create a second row…')
    eq(db.contacts.length, 0, '…and therefore logs no contact for it')
  }

  console.log('\n── THE SUMMARY EXPLAINS ITSELF ──────────────────────────────────────────────────────────')
  {
    const POLLSRC = stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))
    // 🔴 THE POINT: on 29 September the button said all zeros and nothing on screen could say whether
    // the reply had not arrived, had not matched, or had been skipped by a watermark.
    check(/summary\.folders\.push\(\{/.test(POLLSRC), 'every folder reports what it did')
    for (const field of ['folder:', 'mode:', 'examined:', 'before:', 'after:', 'since:']) {
      check(POLLSRC.includes(field), `…including \`${field}\``)
    }
    check(/examined\+\+/.test(POLLSRC), 'the examined count is the messages actually handed to the matcher')
    check(/before \? before\.lastUid : null/.test(POLLSRC), 'the watermark BEFORE is captured before the walk')
    const UI = fs.readFileSync(path.join(REPO, 'components/admin/OutreachPanel.tsx'), 'utf8')
    check(/What each folder did/.test(UI), 'and the panel shows it')
    check(/result\.folders && result\.folders\.length > 0/.test(UI),
      '⚠️ …guarded, so an older route that does not send it cannot blank the panel')

    // The first look is still reported, and now says from when.
    check(/summary\.baselined\.push\(`\$\{label\} \(since \$\{sinceUsed\}\)`\)/.test(POLLSRC),
      'a first look names the date it read from')
    check(/if \(plan\.mode === 'first_look'\)/.test(POLLSRC),
      "🔴 …and only a genuine first look is reported as one — a folder with a watermark never is")
  }

  console.log('\n── THE CRON IS REGISTERED ───────────────────────────────────────────────────────────────')
  {
    const vercel = JSON.parse(fs.readFileSync(path.join(REPO, 'vercel.json'), 'utf8'))
    const entry = (vercel.crons ?? []).find(c => c.path === '/api/cron/outreach-replies')
    check(!!entry, 'vercel.json has the /api/cron/outreach-replies entry')
    eq(entry && entry.schedule, '*/10 * * * *', '…every 10 minutes')
    const route = fs.readFileSync(path.join(REPO, 'app/api/cron/outreach-replies/route.ts'), 'utf8')
    check(/CRON_SECRET/.test(route) && /Bearer \$\{secret\}/.test(route),
      'and it authenticates with CRON_SECRET, exactly like the other cron routes')
    check(/runReplyPoll\(supabase\)/.test(route), '🔴 it runs the SAME routine as the button, not a copy')
    const btn = fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-poll/route.ts'), 'utf8')
    check(/runReplyPoll\(supabase\)/.test(btn), '…and so does the button')
    check(/maxDuration = 60/.test(route) && /runtime = 'nodejs'/.test(route), 'nodejs runtime, 60s')
  }

  console.log(`\n${fails === 0 ? '✅ ALL CHECKS PASSED' : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
