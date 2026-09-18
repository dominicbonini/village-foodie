// Shared by the scripts/printing-*.cjs harnesses. The compiled lib/printing modules require native
// Capacitor packages at runtime; in Node those must be FAKES we control. installMocks() writes fake
// packages into the compiled tree's own node_modules so `require('@capacitor/core')` etc. resolve to them.
// Every fake records its calls on global.__hg so a harness can assert what the transport actually did.
const fs = require('fs'); const path = require('path')
function write(out, pkg, body) {
  const dir = path.join(out, 'node_modules', ...pkg.split('/')); fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pkg, main: 'index.js' }))
  fs.writeFileSync(path.join(dir, 'index.js'), body)
}
/** @param opts { native:boolean, net:{probe,send} handlers, ble:{...} } */
function installMocks(out, opts = {}) {
  global.__hg = global.__hg || {}
  const g = global.__hg
  g.native = opts.native !== false
  // Does the RUNNING BINARY carry the NetPrinter plugin? Capacitor.isPluginAvailable's answer.
  g.pluginAvailable = opts.pluginAvailable !== false
  g.prefs = new Map()
  g.calls = []
  g.netProbe = opts.netProbe || (async () => ({ ok: false, error: 'no printer', errorCode: 'refused' }))
  g.netSend = opts.netSend || (async () => ({ ok: false, bytesWritten: 0, error: 'no printer', errorCode: 'refused' }))
  // isPluginAvailable mirrors @capacitor/core 8.4.0: a JS impl for THIS platform, or a native
  // PluginHeader. Our plugin registers only a `web` implementation, so on ios the answer is the header
  // — i.e. whether the binary was built with it. That is exactly what __hg.pluginAvailable models.
  write(out, '@capacitor/core', `module.exports = { Capacitor: {
    isNativePlatform: () => global.__hg.native,
    getPlatform: () => (global.__hg.native ? 'ios' : 'web'),
    isPluginAvailable: (n) => (global.__hg.native ? (n === 'NetPrinter' ? global.__hg.pluginAvailable : true) : true),
  }, registerPlugin: () => ({}), WebPlugin: class {} }`)
  write(out, '@capacitor/preferences', `const p = () => global.__hg.prefs; module.exports = { Preferences: {
    async get({ key }) { return { value: p().has(key) ? p().get(key) : null } },
    async set({ key, value }) { p().set(key, value) },
    async remove({ key }) { p().delete(key) } } }`)
  write(out, '@hatchgrab/net-printer', `module.exports = { NetPrinter: {
    async probe(o) { global.__hg.calls.push(['probe', o]); return global.__hg.netProbe(o) },
    async send(o) { global.__hg.calls.push(['send', o]); return global.__hg.netSend(o) } } }`)
  write(out, '@capacitor-community/bluetooth-le', `module.exports = { BleClient: {
    async initialize() { global.__hg.calls.push(['ble.initialize']) }, async isEnabled() { return true },
    async requestLEScan() {}, async stopLEScan() {}, async connect() { global.__hg.calls.push(['ble.connect']) },
    async disconnect() {}, async getServices() { return [] }, async getConnectedDevices() { return [] },
    async write() { global.__hg.calls.push(['ble.write']) }, async writeWithoutResponse() { global.__hg.calls.push(['ble.writeWithoutResponse']) } },
    numbersToDataView: (a) => new DataView(new Uint8Array(a).buffer) }`)
  // hook modules (printWatcher) need the real React; link the repo's copy in
  for (const pkg of ['react', 'react-dom']) { const dst = path.join(out, 'node_modules', pkg); if (!fs.existsSync(dst)) fs.symlinkSync(path.join(__dirname, '..', 'node_modules', pkg), dst) }
  return g
}
module.exports = { installMocks }
