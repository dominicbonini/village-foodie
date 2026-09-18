'use strict'
// Registers the native implementation under the name both native classes declare ("NetPrinter").
// The web implementation is the honest refusal: a browser has no sockets.
const { registerPlugin } = require('@capacitor/core')
const NetPrinter = registerPlugin('NetPrinter', {
  web: () => Promise.resolve({
    async probe() { return { ok: false, error: 'No printer support in a browser', errorCode: 'unsupported' } },
    async send() { return { ok: false, bytesWritten: 0, error: 'No printer support in a browser', errorCode: 'unsupported' } },
  }),
})
module.exports = { NetPrinter }
