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
    .emoji{font-size:4rem;margin-bottom:16px;}
    h1{font-size:1.4rem;color:#1E1009;margin-bottom:8px;}
    p{font-size:.9rem;color:#9A7B5A;line-height:1.6;margin-bottom:24px;}
    button{background:#FF6B35;color:#fff;border:none;border-radius:30px;
           padding:12px 28px;font-size:.9rem;font-weight:700;cursor:pointer;}
  </style>
</head>
<body>
  <div class="box">
    <div class="emoji">📡</div>
    <h1>Sin conexión</h1>
    <p>Parece que no tienes internet. Revisa tu conexión e intenta de nuevo.</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body>
</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
