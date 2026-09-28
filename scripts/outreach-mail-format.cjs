#!/usr/bin/env node
// scripts/outreach-mail-format.cjs — the mailbox diagnostic keeps the FORMAT and throws away the WORDS.
//   node scripts/outreach-mail-format.cjs      (≈ 5 s: one compile, no I/O)
//
// 🔴 FAILURE MODE: a capture that is useless or unsafe — markup mangled, so the template built from it
//    does not match what Outlook sends; or body text surviving into a diagnostic that is meant to record
//    shape, not content; or a sending host's IP left in a Received line.
//
// HOW: the REAL lib/outreach-mail-format.ts compiled from lib/. Pure functions, no IMAP, no database.
const fs = require('fs'); const path = require('path'); const os = require('os')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

const FILES = ['lib/outreach-mail-format.ts']
const build = (root, tag) => compile(root, FILES, tag).req('lib/outreach-mail-format.js')

/** A chase as Outlook writes one: a body, a signature, then the quoted original with its header block. */
const CHASE_HTML = [
  '<html><head><style>p{margin:0}</style></head><body lang="EN-GB">',
  '<p class="MsoNormal"><span style="font-size:11.0pt">Hi Sam,</span></p>',
  '<p class="MsoNormal"><span style="font-size:11.0pt">Just following up on the note below.</span></p>',
  '<p class="MsoNormal"><span style="font-size:11.0pt">Kind regards</span></p>',
  '<p class="MsoNormal"><span style="font-size:11.0pt">Dominic Bonini<br>HatchGrab</span></p>',
  '<div><div style="border:none;border-top:solid #E1E1E1 1.0pt">',
  '<p class="MsoNormal"><b>From:</b> Dominic Bonini</p>',
  '<p class="MsoNormal"><b>Sent:</b> 12 September 2026 09:14</p>',
  '<p class="MsoNormal"><b>Subject:</b> Taking orders online</p>',
  '</div></div>',
  '<p class="MsoNormal"><span>Here is the original pitch, which was quite long.</span></p>',
  '<p class="MsoNormal"><span>Kind regards</span></p>',
  '<p class="MsoNormal"><span>Dominic</span></p>',
  '</body></html>',
].join('')

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `omf-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, 'lib/outreach-mail-format.ts'); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return { tmp, M: build(tmp, tag) }
  }
  {
    // V1 — BODY TEXT SURVIVES: the measurement removed, so the prospect's words are in the diagnostic.
    const v = variant('v1', src => src.replace('    return `[text:${chunk.length}]`', '    return chunk'))
    const { text } = v.M.skeletoniseHtml(CHASE_HTML)
    const leaked = text.includes('Just following up on the note below.')
    console.log(`  ${leaked ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V1 measurement removed: body prose is in the output`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!leaked) process.exit(1)
  }
  {
    // V2 — THE QUOTE HEADER NO LONGER CLOSES THE SIGNATURE RUN: everything after the first "Kind regards"
    // stays verbatim, so the quoted body — the longest prose in a chase — is never measured.
    const v = variant('v2', src => src.replace(
      '      inSignature = false                                   // the quote\'s own header block',
      '      /* the run is no longer closed */'))
    const { text } = v.M.skeletoniseHtml(CHASE_HTML)
    const leaked = text.includes('Here is the original pitch, which was quite long.')
    console.log(`  ${leaked ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V2 the quote header stops closing the run: the quoted body is verbatim`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!leaked) process.exit(1)
  }
  {
    // V3 — THE IP REDACTION GONE: a sending host's address stays in the Received line.
    const v = variant('v3', src => src.replace(
      "    v = v.replace(/\\b(\\d{1,3})\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\b/g, (_m, first) => `${first}.x`)", '    // removed'))
    const out = v.M.redactReceivedIps([{ name: 'Received', value: 'from mail.example.com (203.0.113.42) by x' }])
    const leaked = out[0].value.includes('203.0.113.42')
    console.log(`  ${leaked ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  V3 redaction removed: the full IPv4 is still in the Received line`)
    fs.rmSync(v.tmp, { recursive: true, force: true }); if (!leaked) process.exit(1)
  }

  const M = build(REPO, 'omfReal')

  console.log('\n── THE MARKUP SURVIVES BYTE FOR BYTE ────────────────────────────────────────────────────')
  {
    const { text, capped } = M.skeletoniseHtml(CHASE_HTML)
    check(!capped, 'not capped at this size')
    for (const frag of [
      '<p class="MsoNormal">', '<span style="font-size:11.0pt">', '<br>', '</body></html>',
      '<div style="border:none;border-top:solid #E1E1E1 1.0pt">', '<html><head>', '<body lang="EN-GB">',
    ]) check(text.includes(frag), `kept verbatim: ${frag}`)
    check(text.includes('<style>p{margin:0}</style>'), 'a <style> block is markup and is untouched')
  }

  console.log('\n── THE WORDS DO NOT ─────────────────────────────────────────────────────────────────────')
  {
    const { text } = M.skeletoniseHtml(CHASE_HTML)
    check(!text.includes('Hi Sam,') && text.includes('[text:7]'), 'the greeting is replaced by its length')
    check(!text.includes('Just following up on the note below.'), 'the body prose is gone')
    check(!text.includes('Here is the original pitch, which was quite long.'), 'the QUOTED body prose is gone too')
    check(/\[text:\d+\]/.test(text), 'and what replaced them carries the length')
  }

  console.log('\n── THE SIGNATURE AND THE QUOTE HEADER ARE KEPT ──────────────────────────────────────────')
  {
    const { text } = M.skeletoniseHtml(CHASE_HTML)
    check(text.includes('Kind regards'), 'the signature marker is verbatim')
    check(text.includes('Dominic Bonini<br>HatchGrab'), 'the signature block is verbatim')
    check(text.includes('<b>From:</b> Dominic Bonini'), 'the quote\'s From line is verbatim')
    check(text.includes('<b>Sent:</b> 12 September 2026 09:14'), 'its Sent line is verbatim')
    check(text.includes('<b>Subject:</b> Taking orders online'), 'its Subject line is verbatim')
    check(text.includes('>Dominic<'), 'the quoted signature is verbatim as well — a second run opens')
  }

  console.log('\n── THE PLAIN PART FOLLOWS THE SAME RULE ─────────────────────────────────────────────────')
  {
    const plain = ['Hi Sam,', '', 'Just following up.', '', 'Kind regards', 'Dominic', '', 'From: Dominic Bonini', 'Sent: 12 September 2026', '', 'The original pitch text.'].join('\n')
    const { text } = M.skeletonisePlain(plain)
    const lines = text.split('\n')
    check(lines[0] === '[text:7]', 'the greeting is measured')
    check(lines[2] === '[text:18]', 'the body line is measured')
    check(lines[4] === 'Kind regards' && lines[5] === 'Dominic', 'the signature is verbatim')
    check(lines[7] === 'From: Dominic Bonini' && lines[8] === 'Sent: 12 September 2026', 'the quote header is verbatim')
    check(lines[10] === `[text:${'The original pitch text.'.length}]`, `and the quoted body goes back to being measured (${lines[10]})`)
    check(lines[1] === '' && lines[3] === '', 'blank lines are kept, so the shape survives')
  }

  console.log('\n── RECEIVED-LINE REDACTION ──────────────────────────────────────────────────────────────')
  {
    const out = M.redactReceivedIps([
      { name: 'Received', value: 'from a.example (198.51.100.7) by b.example with ESMTPS id 4x' },
      { name: 'Received', value: 'from c.example ([2001:db8:85a3::8a2e:370:7334]) by d.example' },
      { name: 'Message-ID', value: '<203.0.113.9@hatchgrab.com>' },
      { name: 'X-Other', value: 'ip 192.0.2.1 here' },
    ])
    check(out[0].value.includes('198.x') && !out[0].value.includes('198.51.100.7'), 'IPv4 → first octet + .x')
    check(!/2001:db8:85a3/.test(out[1].value) && out[1].value.includes('2001.x'), 'IPv6 → first segment + .x')
    check(out[2].value === '<203.0.113.9@hatchgrab.com>', 'a Message-ID that merely LOOKS like an IP is untouched — only Received lines are redacted')
    check(out[3].value === 'ip 192.0.2.1 here', 'and a non-Received header is untouched')
  }

  console.log('\n── HEADERS, MIME AND MATCHING ───────────────────────────────────────────────────────────')
  {
    const raw = 'Received: from a.example\r\n\tby b.example\r\nSubject: Taking orders online\r\nFrom: Dominic <d@x.test>\r\n'
    const h = M.parseHeaderBlock(raw)
    check(h.length === 3 && h[0].name === 'Received' && h[1].name === 'Subject', 'headers keep their order and spelling')
    check(h[0].value.includes('\n\tby b.example'), 'a folded continuation line stays with its header')

    const struct = {
      type: 'multipart/mixed', childNodes: [
        { part: '1', type: 'multipart/alternative', childNodes: [
          { part: '1.1', type: 'text/plain', parameters: { charset: 'utf-8' }, encoding: 'quoted-printable', size: 412 },
          { part: '1.2', type: 'text/html', parameters: { charset: 'utf-8' }, encoding: 'quoted-printable', size: 2211 },
        ] },
        { part: '2', type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'menu.pdf' }, size: 91422 },
      ],
    }
    const tree = M.mimeTreeFrom(struct)
    check(tree.children[0].children[1].type === 'text/html' && tree.children[0].children[1].charset === 'utf-8', 'the MIME tree nests and carries charset/encoding')
    const atts = M.attachmentsOf(struct)
    check(atts.length === 1 && atts[0].filename === 'menu.pdf' && atts[0].size === 91422, 'attachment METADATA only — filename, type, size')
    const htmlPart = M.findPart(struct, 'text/html')
    check(htmlPart.part === '1.2' && htmlPart.encoding === 'quoted-printable', 'the html part is addressed by its part number, so only it is fetched')

    check(M.addressesOf([{ address: 'A@Example.TEST' }, { address: null }]).join() === 'a@example.test', 'addresses are lower-cased for matching')
    check(M.sameDay('2026-09-12T00:00:00Z', '2026-09-12T14:03:00Z') === true, 'a midnight log row matches a message sent that day')
    check(M.sameDay('2026-09-12T00:00:00Z', '2026-09-13T08:00:00Z') === false, '…and not the next day')
    check(M.sameDay(null, '2026-09-12T00:00:00Z') === false, 'a missing date matches nothing')
  }

  console.log('\n── THE 40,000-CHARACTER CAP ─────────────────────────────────────────────────────────────')
  {
    // 🔴 THE CAP MUST BE TESTED WITH MARKUP, NOT PROSE. Measuring SHRINKS a text node — 60,000 characters
    // of body become `[text:60000]`, thirteen — so a long paragraph can never reach the cap. Only markup,
    // which is kept verbatim, can. A real Outlook mail with a deep quote chain is exactly that shape.
    const big = '<div class="MsoNormal" style="margin:0">a</div>'.repeat(1200)
    const r = M.skeletoniseHtml(big)
    check(r.capped === true && r.text.length === 40_000, `capped at ${r.text.length} and says so`)
    const small = M.skeletoniseHtml('<p>hello</p>')
    check(small.capped === false, 'and a short body is not marked capped')
  }

  console.log(fails ? `\n🔴 ${fails} FAILED` : '\n✅ the markup survives, the words do not, and only Received lines lose their IPs')
  process.exit(fails ? 1 : 0)
})().catch(e => { console.error('HARNESS THREW', e); process.exit(1) })
