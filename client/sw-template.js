/* Service worker : garde une copie de l'application sur l'appareil pour qu'elle s'ouvre et fonctionne sans internet.
   Généré au build par vite.config.ts (la liste des fichiers et la version sont injectées). Inactif en développement. */

const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const FONT_CSS = '__FONT_CSS__';
const APP_CACHE = `codes-africa-app-${VERSION}`;
const FONT_CACHE = 'codes-africa-fonts';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Polices Google : la feuille de style et ses fichiers, pour garder le même rendu hors connexion.
async function cacheFonts() {
  try {
    const cache = await caches.open(FONT_CACHE);
    const res = await fetch(FONT_CSS);
    if (!res.ok) return;
    await cache.put(FONT_CSS, res.clone());
    const css = await res.text();
    const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(urls.map(async (u) => { if (!(await cache.match(u))) { const r = await fetch(u); if (r.ok) await cache.put(u, r); } }));
  } catch { /* hors connexion à l'installation : les polices seront gardées au prochain passage en ligne */ }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(ASSETS);
    await cacheFonts();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('codes-africa-app-') && k !== APP_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages : le réseau d'abord (version la plus récente), sinon la copie de l'application.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000); // connexion très lente = comme hors connexion
        const res = await fetch(req, { signal: ctrl.signal });
        clearTimeout(timer);
        return res;
      } catch {
        return (await caches.match('/index.html', { cacheName: APP_CACHE })) ?? Response.error();
      }
    })());
    return;
  }

  // Fichiers de l'application (noms versionnés) : la copie locale d'abord.
  if (url.origin === self.location.origin && ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname, { cacheName: APP_CACHE }).then((hit) => hit ?? fetch(req)));
    return;
  }

  // Polices : la copie locale d'abord, gardée au passage si elle manque.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req.url, res.clone());
      return res;
    })());
  }
});
