const SHELL_CACHE = 'vf-shell-v1'
const DATA_CACHE = 'vf-data-v1'
const QUEUE_STORE = 'vf-mutation-queue'
const DB_NAME = 'vf-offline'
const DB_VERSION = 1

const SHELL_ASSETS = ['/offline.html']

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── IndexedDB helpers ─────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(QUEUE_STORE, { autoIncrement: true })
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
}

async function enqueue(payload) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    tx.objectStore(QUEUE_STORE).add(payload)
    tx.oncomplete = resolve
    tx.onerror = e => reject(e.target.error)
  })
}

async function getQueueCount(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly')
    const req = tx.objectStore(QUEUE_STORE).count()
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
}

async function syncMutations() {
  const db = await openDB()
  const tx = db.transaction(QUEUE_STORE, 'readwrite')
  const store = tx.objectStore(QUEUE_STORE)

  const all = await new Promise((resolve, reject) => {
    const req = store.getAll()
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
  const keys = await new Promise((resolve, reject) => {
    const req = store.getAllKeys()
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })

  for (let i = 0; i < all.length; i++) {
    try {
      await fetch(all[i].url, {
        method: all[i].method,
        headers: all[i].headers,
        body: all[i].body,
      })
      // Delete only after successful replay
      await new Promise((resolve, reject) => {
        const delTx = db.transaction(QUEUE_STORE, 'readwrite')
        delTx.objectStore(QUEUE_STORE).delete(keys[i])
        delTx.oncomplete = resolve
        delTx.onerror = e => reject(e.target.error)
      })
    } catch {
      // Leave in queue; next sync will retry
    }
  }

  // Notify all clients about the updated queue count
  const newCount = await getQueueCount(db)
  const clients = await self.clients.matchAll()
  clients.forEach(client => client.postMessage({ type: 'QUEUE_COUNT', count: newCount }))
}

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Mutations: POST to /api/dashboard/action or /api/events/action — enqueue when offline
  if (event.request.method === 'POST' && (url.pathname === '/api/dashboard/action' || url.pathname === '/api/events/action')) {
    event.respondWith(
      fetch(event.request.clone()).catch(async () => {
        const body = await event.request.text()
        await enqueue({
          url: event.request.url,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        // Notify clients about new queue count
        const db = await openDB()
        const count = await getQueueCount(db)
        const clients = await self.clients.matchAll()
        clients.forEach(client => client.postMessage({ type: 'QUEUE_COUNT', count }))

        return new Response(JSON.stringify({ ok: true, queued: true }), {
          headers: { 'Content-Type': 'application/json' },
        })
      })
    )
    return
  }

  // Network-first: dashboard data and events
  if (url.pathname.startsWith('/api/dashboard') || url.pathname.startsWith('/api/events/manage')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone()
          caches.open(DATA_CACHE).then(cache => cache.put(event.request, clone))
          return res
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Cache-first: images and fonts
  if (event.request.destination === 'image' || event.request.destination === 'font') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached
        return fetch(event.request).then(res => {
          const clone = res.clone()
          caches.open(SHELL_CACHE).then(cache => cache.put(event.request, clone))
          return res
        })
      })
    )
    return
  }

  // Navigation: offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html'))
    )
    return
  }
})

// ── Background sync ───────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'vf-sync') {
    event.waitUntil(syncMutations())
  }
})

// ── Message handler ───────────────────────────────────────
self.addEventListener('message', async event => {
  if (event.data?.type === 'GET_QUEUE_COUNT') {
    const db = await openDB()
    const count = await getQueueCount(db)
    event.ports[0]?.postMessage({ type: 'QUEUE_COUNT', count })
  }
})
