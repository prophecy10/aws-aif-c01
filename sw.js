/* sw.js — offline support. The app and the whole question bank are cached on first visit.
   Same-origin files are served from the cache immediately and refreshed in the background,
   so question corrections reach users on their next visit. */
const CACHE = 'aifc01-v1';
const FONT_CACHE = 'aifc01-fonts-v1';
const SHELL = ['./','index.html','manifest.webmanifest','css/style.css','js/config.js','js/storage.js','js/bank.js',
  'js/share.js','js/app.js','data/_taxonomy.json','data/questions.json','data/cards.json','icons/icon-192.png','icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache:'reload'})).catch(()=>{}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE && k!==FONT_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type==='opaque') c.put(req, res.clone()); return res; }
      catch(err){ return Response.error(); }
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, {ignoreSearch:true}) || (req.mode==='navigate' ? await c.match('index.html') : null);
    const network = fetch(req, {cache:'no-store'}).then(res => {
      if (res.ok) c.put(req.mode==='navigate' ? 'index.html' : new Request(url.origin + url.pathname), res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(network); return hit; }
    return (await network) || new Response('Offline', {status:503, headers:{'Content-Type':'text/plain'}});
  }));
});
