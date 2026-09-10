/*
 * Network-first for the app shell and every unhashed file (index.html, any
 * navigation, the manifest, the icons), cache-first only for hashed build
 * assets under /assets/ (the fingerprinted JS/CSS Vite emits).
 *
 * Why the split: a navigation always tries the network first and only falls
 * back to cache when offline — so a new deploy shows up the very next time
 * you open the app with a connection, with no manual cache-busting. The same
 * has to apply to the icons and manifest: they live at a fixed, unhashed
 * filename, so "cache-first forever" for them means an icon change (or any
 * edit to one of these files) never reaches a phone that already cached the
 * old bytes, no matter how many later deploys ship the new ones — that
 * class of bug already happened once here and cost real back-and-forth to
 * track down. /assets/* is the one safe exception: every deploy ships those
 * under a new fingerprinted filename, so a cache hit for one is always
 * current — there is no "stale" version of a file whose name encodes its
 * content.
 *
 * CACHE only needs bumping when this file's own caching *logic* changes
 * (like this rewrite) — not for ordinary app deploys, icon changes included,
 * anymore.
 */
const CACHE = 'jarvis-v4'
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  const isSameOrigin = url.origin === location.origin
  const isHashedAsset = isSameOrigin && url.pathname.includes('/assets/')
  // Cross-origin (fonts) stays cache-first as before — the browser's own HTTP
  // cache already handles those, and there's no deploy-driven staleness risk
  // for a file this app doesn't control the update cadence of anyway.
  const cacheFirst = isHashedAsset || !isSameOrigin

  if (!cacheFirst) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        // Offline (or the request otherwise failed): fall back to whatever's
        // cached for this exact request, then the app shell, so the app
        // still opens (and its icon/manifest still resolve) with no network.
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
    )
    return
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            // Only stored in our own cache when it's a hashed asset we know
            // is safe to keep forever — a cross-origin font still gets
            // served cache-first here, just via the browser's own HTTP
            // cache rather than being duplicated into this one too.
            if (res.ok && isHashedAsset) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          })
          .catch(() => caches.match('./index.html')),
    ),
  )
})
