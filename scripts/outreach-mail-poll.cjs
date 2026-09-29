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

const FILES = ['lib/outreach-mail-poll-rules.ts', 'lib/outreach-contact-log.ts']
function build(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return { R: req('lib/outreach-mail-poll-rules.js'), L: req('lib/outreach-contact-log.js') }
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
    // V1 — THE FIRST RUN WALKS THE WHOLE MAILBOX. Two years of replies logged at once, every contacted
    // prospect jumped to `replied`, every sequence exited, on timestamps that are a lie.
    const v = variant('v1', 'lib/outreach-mail-poll-rules.ts', src => src.replace(
      "  if (!stored) return { mode: 'baseline', lastUid: live.highestUid }",
      "  if (!stored) return { mode: 'incremental', from: 1 }"))
    const plan = v.R.planFetch(undefined, { uidvalidity: '1', highestUid: 9000 })
    variantFails('V1', plan.mode === 'incremental' && plan.from === 1,
      'the first run has no baseline: it reads the mailbox from uid 1 and logs all of it')
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

  const { R, L } = build(REPO, 'ompReal')
  /**
   * 🔴 THE CENSUS READS CODE, NOT COMMENTS, AND THE FIRST VERSION DID NOT. This file's own header says
   * "there is no `messageFlagsAdd`, `messageMove`…" — so a census over the raw text found every banned
   * name in the sentence promising they were absent, and reported the promise as the violation. Block
   * and line comments are removed first; string literals are left alone, because a banned call written
   * as a string would still be a way to make one.
   */
  const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
  const POLL = stripComments(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))

  console.log('\n── THE WATERMARK: THE FIRST RUN PROCESSES NOTHING ───────────────────────────────────────')
  {
    // 🔴 Recording history is the IMPORTER's job — it writes no contact rows. This only ever reports
    // what has happened since it started watching.
    const first = R.planFetch(undefined, { uidvalidity: '42', highestUid: 9000 })
    eq(first, { mode: 'baseline', lastUid: 9000 }, '🔴 no stored watermark ⇒ baseline at the current top, nothing read')
    eq(R.planFetch({ uidvalidity: '42', lastUid: 9000 }, { uidvalidity: '42', highestUid: 9000 }),
      { mode: 'none' }, 'nothing new ⇒ nothing fetched')
    eq(R.planFetch({ uidvalidity: '42', lastUid: 9000 }, { uidvalidity: '42', highestUid: 9003 }),
      { mode: 'incremental', from: 9001 }, 'three new ⇒ from the one after the watermark')
    // ⚠️ A REBUILT MAILBOX MAKES THE STORED uid MEANINGLESS, not the mail new.
    eq(R.planFetch({ uidvalidity: '42', lastUid: 9000 }, { uidvalidity: '43', highestUid: 12 }),
      { mode: 'rescan', sinceDays: 7 }, '🔴 uidvalidity changed ⇒ re-read 7 days, not 9000 uids')
    eq(R.RESCAN_DAYS, 7, 'and the window is 7 days')
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
    check(!/from\('outreach_contacts'\)/.test(POLL), '🔴 …and never inserted beside it')
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
