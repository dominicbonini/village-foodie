#!/usr/bin/env node
// scripts/till-signing-keygen.cjs — till-pack-4 (25 November 2026, docs/till-pack-4-report.md §4). THE TILL'S SIGNING KEY PAIR (law change 11).
//
// Run it ONCE, by hand, in your own terminal:   node scripts/till-signing-keygen.cjs
//   • the PRIVATE key is printed to THIS TERMINAL ONLY, as the line `TILL_SIGNING_KEY=…` — copy it into Vercel (Production, server-only,
//     "Sensitive"), then clear the terminal. It is never written to a file, never sent anywhere, and must never be committed;
//   • the PUBLIC key and its id are written to docs/till-signing-public-key.md (safe to commit: it only lets anyone CHECK a signature).
// The server registers the public key itself on its first signed close (till_settings.signing_public_key / signing_key_id) and refuses
// any other key afterwards. Running this again makes a NEW pair — only do that to replace the key on purpose (see the report).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS operational script, like every scripts/*.cjs */
'use strict'
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
const keyId = crypto.createHash('sha256').update(Buffer.from(pub, 'base64')).digest('hex').slice(0, 16)

const doc = path.join(__dirname, '..', 'docs', 'till-signing-public-key.md')
fs.writeFileSync(doc, `# The till's signing public key

Made ${new Date().toISOString().slice(0, 10)} by \`scripts/till-signing-keygen.cjs\` (till-pack-4, law change 11). It CHECKS the signature of
every close (\`till_close_signatures.signature\`, Ed25519, over the close's chain hash — its 64 hex characters as UTF-8 bytes). It cannot
sign anything. The private half is the server-only variable \`TILL_SIGNING_KEY\` and is in no file.

- key id: \`${keyId}\`  (the first 16 hex characters of sha256 of the public key's SPKI DER)
- public key (SPKI DER, base64): \`${pub}\`

Check one close (Node): \`crypto.verify(null, Buffer.from(hash, 'utf8'), crypto.createPublicKey({ key: Buffer.from(PUB, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature, 'base64'))\`
`)

process.stdout.write(`
The till's signing key pair (Ed25519), key id ${keyId}.

1. Add this ONE line to Vercel → Project → Settings → Environment Variables (Production; mark it Sensitive). Do not paste it anywhere else.

TILL_SIGNING_KEY=${priv}

2. The public key and the key id are in docs/till-signing-public-key.md (safe to commit).
3. Clear this terminal now (macOS: Cmd + K).
`)
