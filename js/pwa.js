/* ── PWA Install Logic ── */
(function() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;

  /* Si ya está instalada no mostrar nada */
  if (isStandalone) return;

  /* iOS: siempre mostrar el hint al cargar (no se puede instalar desde JS) */
  if (isIos) {
    setTimeout(() => {
      document.getElementById('ios-hint-overlay')?.classList.add('show');
    }, 2000);
    return;
  }

  /* Android / Chrome: mostrar topbar siempre que el navegador permita instalar */
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwa-banner')?.classList.add('visible');
  });

  document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    document.getElementById('pwa-banner')?.classList.remove('visible');
  });

  /* X cierra solo por esta sesión — al volver aparece de nuevo */
  document.getElementById('pwa-dismiss-btn')?.addEventListener('click', () => {
    document.getElementById('pwa-banner')?.classList.remove('visible');
  });
})();

function closeIosHint() {
  sessionStorage.setItem('pwa-dismissed', '1');
  document.getElementById('ios-hint-overlay')?.classList.remove('show');
}

