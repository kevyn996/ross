/* ══════════════════════════════════════════════
   CONFIG LOADER
   1. Fetch data/config.json
   2. Setea globales CONFIG, MENUS, CAT_BASE_PRICE
   3. Aplica colores y textos al DOM
   4. Llama initUI() para estado inicial de la app
   ══════════════════════════════════════════════ */

var CONFIG = {};
var MENUS  = {};
var CAT_BASE_PRICE = {};
var DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes'];

/* fmt y WA en scope global — app.js los usa */
function fmt(n) { return (CONFIG.moneda || '$ ') + Number(n).toFixed(2); }

async function loadConfig() {
  try {
    const res  = await fetch('/data/config.json');
    const data = await res.json();

    /* ── Poblar globales ── */
    Object.assign(CONFIG, {
      nombre:        data.nombre,
      nombreCorto:   data.nombreCorto,
      emoji:         data.emoji,
      tagline:       data.tagline,
      descripcion:   data.descripcion,
      telefono:      data.telefono,
      wa:            data.wa,
      email:         data.email,
      horario:       data.horario,
      colorPrimario: data.colorPrimario,
      colorBg:       data.colorBg,
      moneda:        data.moneda,
      año:           data.año,
      instagram:     data.instagram  || '#',
      facebook:      data.facebook   || '#',
      direccion:     data.direccion  || '',
    });

    Object.assign(CAT_BASE_PRICE, data.catPrecios);
    Object.assign(MENUS, data.menus);

    /* ── Variable global WA usada por sendWA() en app.js ── */
    window.WA = data.wa;

    /* ── Aplicar colores CSS ── */
    const root = document.documentElement;
    root.style.setProperty('--naranja',  CONFIG.colorPrimario);
    root.style.setProperty('--bg-base',  CONFIG.colorBg);

    /* ── Aplicar textos estáticos ── */
    const $ = id => document.getElementById(id);
    if ($('hero-nombre'))   $('hero-nombre').textContent  = CONFIG.nombre;
    if ($('hero-tagline'))  $('hero-tagline').textContent = CONFIG.tagline;
    if ($('foot-horario'))  $('foot-horario').textContent = CONFIG.horario;
    if ($('foot-tel'))      $('foot-tel').textContent     = CONFIG.telefono;
    if ($('foot-tel'))      $('foot-tel').href            = 'tel:' + CONFIG.telefono;
    if ($('foot-email'))    $('foot-email').textContent   = CONFIG.email;
    if ($('foot-email'))    $('foot-email').href          = 'mailto:' + CONFIG.email;
    if ($('foot-copy'))     $('foot-copy').textContent    = `© ${CONFIG.año} ${CONFIG.nombre} · Todos los derechos reservados`;
    if ($('sheet-title'))   $('sheet-title').textContent  = CONFIG.nombre;
    document.title = CONFIG.nombre;

    /* Links de redes sociales */
    const igLinks = document.querySelectorAll('[data-social="instagram"]');
    const fbLinks = document.querySelectorAll('[data-social="facebook"]');
    igLinks.forEach(el => el.href = CONFIG.instagram);
    fbLinks.forEach(el => el.href = CONFIG.facebook);

    /* ── Manifest PWA dinámico ── */
    const iconSvg = (size, rx) =>
      `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${size}'><rect width='${size}' height='${size}' rx='${rx}' fill='${encodeURIComponent(CONFIG.colorPrimario)}'/><text y='.85em' font-size='${Math.round(size*.72)}' x='${Math.round(size*.1)}'>${CONFIG.emoji}</text></svg>`;

    const manifest = {
      name:             CONFIG.nombre,
      short_name:       CONFIG.nombreCorto,
      description:      CONFIG.descripcion,
      start_url:        '/',
      display:          'standalone',
      background_color: CONFIG.colorBg,
      theme_color:      CONFIG.colorPrimario,
      orientation:      'portrait',
      icons: [
        { src: iconSvg(192, 40),  sizes: '192x192',  type: 'image/svg+xml', purpose: 'any maskable' },
        { src: iconSvg(512, 100), sizes: '512x512',  type: 'image/svg+xml', purpose: 'any maskable' },
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const manifestEl = document.getElementById('pwa-manifest');
    if (manifestEl) manifestEl.href = URL.createObjectURL(blob);

    /* ── Service Worker ── */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    /* ── Arrancar UI de la app ── */
    if (typeof initUI === 'function') initUI();

  } catch (err) {
    console.error('Error cargando config:', err);
  }
}

document.addEventListener('DOMContentLoaded', loadConfig);
