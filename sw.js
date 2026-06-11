const CACHE = 'delicias-v2';

/* ── Archivos que se cachean al instalar (shell de la app) ── */
const PRECACHE = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/config-loader.js',
  '/js/pwa.js',
  '/data/config.json',
  /* Leaflet local — se cachea en runtime la primera vez */
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  /* Iconos PWA */
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  /* Fuentes */
  'https://fonts.googleapis.com/css2?family=Fredoka+One&family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,500;1,700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap',
];

/* ── Extensiones de imagen que el usuario subirá a la raíz ── */
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];

/* ── Dominios externos que NO cacheamos (tiles del mapa) ── */
const NO_CACHE_HOSTS = [
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
];

/* ════════════════════════════════════════
   INSTALL — precachear el shell
════════════════════════════════════════ */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* ════════════════════════════════════════
   ACTIVATE — borrar cachés viejos
════════════════════════════════════════ */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ════════════════════════════════════════
   FETCH — estrategias por tipo de recurso
════════════════════════════════════════ */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* No interceptar métodos no-GET */
  if (e.request.method !== 'GET') return;

  /* No cachear tiles del mapa — siempre red, sin fallback */
  if (NO_CACHE_HOSTS.includes(url.hostname)) return;

  /* Imágenes locales (las que el usuario sube a la raíz) 
     → Cache First: sirve del caché, actualiza en background */
  const isLocalImg = url.origin === self.location.origin
    && IMG_EXTS.some(ext => url.pathname.toLowerCase().endsWith(ext));

  if (isLocalImg) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  /* Imágenes externas (Unsplash, etc.) 
     → Network First con fallback a caché */
  const isRemoteImg = IMG_EXTS.some(ext => url.pathname.toLowerCase().endsWith(ext));
  if (isRemoteImg) {
    e.respondWith(networkFirstImg(e.request));
    return;
  }

  /* Fuentes de Google → Cache First (no cambian) */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  /* Config JSON → Network First: siempre intenta la versión más nueva */
  if (url.pathname === '/data/config.json') {
    e.respondWith(networkFirst(e.request));
    return;
  }

  /* Todo lo demás (HTML, CSS, JS, Leaflet) → Network First con fallback a caché */
  e.respondWith(networkFirst(e.request));
});

/* ════════════════════════════════════════
   ESTRATEGIAS
════════════════════════════════════════ */

/* Network First: intenta red, si falla usa caché */
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached || offlinePage();
  }
}

/* Cache First: sirve del caché, actualiza en background */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    /* Actualizar en background sin bloquear */
    fetch(request).then(res => {
      if (res && res.status === 200) {
        caches.open(CACHE).then(c => c.put(request, res));
      }
    }).catch(() => {});
    return cached;
  }
  /* No estaba en caché → red */
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    return offlinePage();
  }
}

/* Network First para imágenes externas: si falla, placeholder SVG */
async function networkFirstImg(request) {
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    /* Placeholder SVG cuando no hay imagen ni caché */
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="#FDEBD0"/>
        <text x="50%" y="45%" text-anchor="middle" font-size="48">🍽️</text>
        <text x="50%" y="68%" text-anchor="middle" font-size="14" fill="#9A7B5A">Sin conexión</text>
      </svg>`,
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

/* Página offline para navegación sin caché */
function offlinePage() {
  return new Response(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sin conexión · Las Delicias de Ross</title>
  <style>
    body{margin:0;font-family:sans-serif;background:#FFFBF5;display:flex;align-items:center;
         justify-content:center;min-height:100vh;text-align:center;padding:24px;}
    .box{max-width:320px;}
    h1{font-size:1.4rem;color:#1E1009;margin-bottom:8px;}
    p{font-size:.9rem;color:#9A7B5A;line-height:1.6;margin-bottom:24px;}
    button{background:#FF6B35;color:#fff;border:none;border-radius:30px;
           padding:12px 28px;font-size:.9rem;font-weight:700;cursor:pointer;}
  </style>
</head>
<body>
  <div class="box">
    <img src="data:image/png;base64,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" alt="Las Delicias de Ross" style="width:90px;height:90px;object-fit:contain;margin-bottom:8px;">
    <h1>Sin conexión</h1>
    <p>Parece que no tienes internet. Revisa tu conexión e intenta de nuevo.</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
