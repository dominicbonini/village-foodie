# The till's signing public key

Made 2026-11-25 by `scripts/till-signing-keygen.cjs` (till-pack-4, law change 11). It CHECKS the signature of
every close (`till_close_signatures.signature`, Ed25519, over the close's chain hash — its 64 hex characters as UTF-8 bytes). It cannot
sign anything. The private half is the server-only variable `TILL_SIGNING_KEY` and is in no file.

- key id: `ff6ea8b232e9bc8e`  (the first 16 hex characters of sha256 of the public key's SPKI DER)
- public key (SPKI DER, base64): `MCowBQYDK2VwAyEA2l/ln6WysDGNR3UwnL3jLQUIUSZHHWPpdBTHUDU9ZkE=`

Check one close (Node): `crypto.verify(null, Buffer.from(hash, 'utf8'), crypto.createPublicKey({ key: Buffer.from(PUB, 'base64'), format: 'der', type: 'spki' }), Buffer.from(signature, 'base64'))`
