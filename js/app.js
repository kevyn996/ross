/* ══════════════════════════════════════════════
   APP — Lógica principal
   Todas las funciones en scope global.
   CONFIG, MENUS, CAT_BASE_PRICE vienen de
   config-loader.js (se cargan antes).
   ══════════════════════════════════════════════ */


/* ── ESTADO ── */
let currentStep = 1;
let selectedCat = null;
let diasCount = 1;
let selectedDayNames = []; // nombres de días elegidos (ej: ['Lunes','Miércoles'])
let activeDayIdx = 0;
let daySelections = {}; // { 0: {principal, contorno, jugo, postre}, ... }

/* ── FECHA ACTUAL para bloquear días pasados ── */
function getTodayWeekdayIdx() {
  const d = new Date().getDay(); // 0=dom,1=lun,...,5=vie,6=sab
  if (d === 0 || d === 6) return 0; // finde → desde lunes de la próxima semana todo disponible
  return d - 1; // lun=0,mar=1,...,vie=4
}

/* ── SHEET OPEN/CLOSE ── */
function openPedidoSheet() {
  /* Si hay datos guardados, mostrar diálogo de recuperación */
  const hasSavedData = selectedCat && selectedDayNames.length > 0;
  if (hasSavedData) {
    showRecoverDialog();
    return;
  }
  _openPedidoSheetFresh();
}
function _openPedidoSheetFresh() {
  currentStep = 1;
  resetSheetState();
  document.getElementById('pedido-overlay').classList.add('open');
  document.getElementById('cta-bar').style.display = 'none';
  document.body.style.overflow = 'hidden';
}
function _openPedidoSheetResume() {
  document.getElementById('pedido-overlay').classList.add('open');
  document.getElementById('cta-bar').style.display = 'none';
  document.body.style.overflow = 'hidden';
  /* Ir al paso donde estaba: si tiene días elegidos y al menos un menú empezado → paso 3 */
  const anySelection = Object.keys(daySelections).length > 0;
  const targetStep = anySelection ? 3 : (selectedDayNames.length > 0 ? 2 : 1);
  goStep(targetStep);
  if (targetStep === 3) {
    renderDayTabs();
    renderProgressDias();
    renderDayBuilder();
  }
}

function showRecoverDialog() {
  const CAT_LABELS = { libre:'🌿 Libre de Grasa', dieta:'⚖️ Dieta Balanceada', proteina:'💪 Full Proteína', variado:'🎨 Variado' };
  const meta = document.getElementById('recover-meta');
  const doneCount = selectedDayNames.filter((_, i) => isDayDone(i)).length;
  meta.innerHTML = `
    <span class="recover-tag">${CAT_LABELS[selectedCat] || selectedCat}</span>
    <span class="recover-tag">📅 ${selectedDayNames.length} día${selectedDayNames.length > 1 ? 's' : ''}</span>
    ${doneCount > 0 ? `<span class="recover-tag">✓ ${doneCount} menú${doneCount > 1 ? 's' : ''} completado${doneCount > 1 ? 's' : ''}</span>` : ''}
  `;
  document.getElementById('recover-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function recoverContinue() {
  document.getElementById('recover-overlay').classList.remove('open');
  _openPedidoSheetResume();
}

function recoverReset() {
  document.getElementById('recover-overlay').classList.remove('open');
  document.body.style.overflow = '';
  _openPedidoSheetFresh();
}


function closePedidoSheet() {
  document.getElementById('pedido-overlay').classList.remove('open');
  document.getElementById('cta-bar').style.display = '';
  document.body.style.overflow = '';
}
function handlePedidoOverlayClick(e) {
  if (e.target === document.getElementById('pedido-overlay')) closePedidoSheet();
}
function resetSheetState() {
  selectedCat = null; diasCount = 1; selectedDayNames = []; activeDayIdx = 0; daySelections = {};
  ['libre','dieta','proteina','variado'].forEach(c => {
    const el = document.getElementById('cat-' + c);
    if (el) el.classList.remove('selected');
  });
  const planes = document.getElementById('step-2-planes');
  const selector = document.getElementById('step-2-selector');
  if (planes) planes.style.display = '';
  if (selector) selector.style.display = 'none';
  updateStepBtns(1);
  document.getElementById('step-1').style.display = '';
  document.getElementById('step-2').style.display = 'none';
  document.getElementById('step-3').style.display = 'none';
  const tabs = document.getElementById('sheet-day-tabs-sticky');
  if (tabs) tabs.style.display = 'none';
  const sheetBody = document.getElementById('sheet-body');
  if (sheetBody) sheetBody.scrollTop = 0;
}

/* ── PASOS ── */
function goStep(n) {
  if (n === 2 && !selectedCat) { showToast('⚠️ Elige una categoría primero', true); return; }
  if (n === 3 && selectedDayNames.length === 0) { showToast('⚠️ Elige al menos un día', true); return; }
  if (n === 2) {
    // Resetear vistas del paso 2
    const planes = document.getElementById('step-2-planes');
    const selector = document.getElementById('step-2-selector');
    if (planes) planes.style.display = '';
    if (selector) selector.style.display = 'none';
  }

  currentStep = n;
  document.getElementById('step-1').style.display = n === 1 ? '' : 'none';
  document.getElementById('step-2').style.display = n === 2 ? '' : 'none';
  document.getElementById('step-3').style.display = n === 3 ? '' : 'none';

  // Mostrar tabs de días solo en paso 3
  const tabs = document.getElementById('sheet-day-tabs-sticky');
  if (tabs) tabs.style.display = n === 3 ? '' : 'none';

  updateStepBtns(n);

  if (n === 2) {
    // Actualizar label del día de hoy
    const todayIdx = getTodayWeekdayIdx();
    const isWeekend = [0,6].includes(new Date().getDay());
    const label = document.getElementById('hoy-dia-label');
    if (label) label.textContent = isWeekend ? 'No disponible hoy (fin de semana)' : `Pedido para hoy · ${DIAS_SEMANA[todayIdx]}`;
  }

  if (n === 3) {
    activeDayIdx = 0;
    renderDayTabs();
    renderProgressDias();
    renderDayBuilder();
    updateP3StatusBar();
  }

  // Scroll al tope del sheet body
  const sheetBody = document.getElementById('sheet-body');
  if (sheetBody) setTimeout(() => { sheetBody.scrollTop = 0; }, 30);
}

/* ── BARRA PROGRESO + PRECIO PASO 3 ── */
function updateP3StatusBar() {
  const doneCount = selectedDayNames.filter((_, i) => isDayDone(i)).length;
  const totalDays = selectedDayNames.length;
  const remaining = totalDays - doneCount;
  const progressEl = document.getElementById('p3-progress-text');
  const totalEl = document.getElementById('p3-total');
  if (!progressEl || !totalEl) return;
  if (remaining === 0) {
    progressEl.innerHTML = `<span style="color:var(--verde2)">✓ Todos los menús listos</span>`;
  } else {
    progressEl.innerHTML = `<span style="color:var(--naranja2)">Faltan <strong>${remaining}</strong> día${remaining > 1 ? 's' : ''} por completar</span>`;
  }
  totalEl.textContent = fmt(getCartTotal());
}

function updateStepBtns(n) {
  ['sbtn-1','sbtn-2','sbtn-3'].forEach((id, i) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.remove('active','done');
    if (i + 1 === n) btn.classList.add('active');
    else if (i + 1 < n) btn.classList.add('done');
  });
}

/* ── CAT ── */
function selectCat(cat) {
  selectedCat = cat;
  ['libre','dieta','proteina','variado'].forEach(c => {
    document.getElementById('cat-'+c).classList.toggle('selected', c === cat);
  });
  daySelections = {};
  setTimeout(() => goStep(2), 260);
}

/* ── PASO 2: PLANES ── */
function volverPlanes() {
  document.getElementById('step-2-planes').style.display = '';
  document.getElementById('step-2-selector').style.display = 'none';
  cancelarAvisoHoy();
  selectedDayNames = [];
  daySelections = {};
}

function selectSoloHoy() {
  const isWeekend = [0,6].includes(new Date().getDay());
  if (isWeekend) {
    const diasNombre = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    document.getElementById('hoy-weekend-dia-actual').textContent = diasNombre[new Date().getDay()];
    document.getElementById('hoy-weekend-aviso').style.display = '';
    document.getElementById('card-solo-hoy').style.borderRadius = 'var(--r2) var(--r2) 0 0';
    document.getElementById('card-solo-hoy').style.marginBottom = '0';
    return;
  }
  diasCount = 1;
  selectedDayNames = [DIAS_SEMANA[getTodayWeekdayIdx()]];
  daySelections = {};
  setTimeout(() => goStep(3), 260);
}

function confirmarPedidoLunes() {
  diasCount = 1;
  selectedDayNames = ['Lunes'];
  daySelections = {};
  cancelarAvisoHoy();
  setTimeout(() => goStep(3), 260);
}

function cancelarAvisoHoy() {
  document.getElementById('hoy-weekend-aviso').style.display = 'none';
  document.getElementById('card-solo-hoy').style.borderRadius = 'var(--r2)';
  document.getElementById('card-solo-hoy').style.marginBottom = '12px';
}

function selectSemanaCompleta() {
  diasCount = 5;
  const todayIdx = getTodayWeekdayIdx();
  const isWeekend = [0,6].includes(new Date().getDay());
  selectedDayNames = DIAS_SEMANA.filter((_, i) => isWeekend || i >= todayIdx);
  if (selectedDayNames.length < 5) selectedDayNames = [...DIAS_SEMANA];
  daySelections = {};
  setTimeout(() => goStep(3), 260);
}

function mostrarSelectorDias() {
  selectedDayNames = [];
  daySelections = {};
  diasCount = 5;
  document.getElementById('step-2-planes').style.display = 'none';
  document.getElementById('step-2-selector').style.display = '';
  renderDiasEspecificos();
  updateBtn2();
}

function changeDiasCount(d) {} // legacy, no se usa

/* ── DÍAS ESPECÍFICOS ── */
function renderDiasEspecificos() {
  const todayIdx = getTodayWeekdayIdx();
  const isWeekend = [0,6].includes(new Date().getDay());

  const grid = document.getElementById('dias-esp-grid');
  grid.innerHTML = DIAS_SEMANA.map((nombre, i) => {
    const isPast = !isWeekend && i < todayIdx;
    const isSel = selectedDayNames.includes(nombre);
    return `<button
      class="dia-esp-btn ${isSel ? 'selected' : ''} ${isPast ? 'past' : ''}"
      onclick="${isPast ? '' : `toggleDiaEsp('${nombre}')`}"
      ${isPast ? 'disabled title="Este día ya pasó"' : ''}
    >
      ${nombre}
      ${isPast ? '<span class="de-label">No disponible</span>' : `<span class="de-label">${isSel ? '✓ Elegido' : 'Toca para elegir'}</span>`}
    </button>`;
  }).join('');

  const hint = document.getElementById('dias-esp-hint');
  if (selectedDayNames.length === 0) {
    hint.textContent = 'Elige al menos un día';
    hint.className = 'dias-esp-hint';
  } else {
    hint.textContent = `✓ ${selectedDayNames.length} día${selectedDayNames.length > 1 ? 's' : ''} seleccionado${selectedDayNames.length > 1 ? 's' : ''}`;
    hint.className = 'dias-esp-hint';
  }
}

function toggleDiaEsp(nombre) {
  if (selectedDayNames.includes(nombre)) {
    selectedDayNames = selectedDayNames.filter(d => d !== nombre);
  } else {
    selectedDayNames.push(nombre);
    selectedDayNames.sort((a,b) => DIAS_SEMANA.indexOf(a) - DIAS_SEMANA.indexOf(b));
  }
  diasCount = selectedDayNames.length;
  daySelections = {};
  renderDiasEspecificos();
  updateBtn2();
}

function updateBtn2() {
  const btn = document.getElementById('btn-next-2');
  if (btn) btn.disabled = selectedDayNames.length < 1;
}

function updateBtn2() {
  document.getElementById('btn-next-2').disabled = selectedDayNames.length !== diasCount;
}

/* ── TABS DE DÍAS (paso 3) ── */
function renderDayTabs() {
  document.getElementById('day-builder-tabs').innerHTML = selectedDayNames.map((nombre, i) => {
    const done = isDayDone(i);
    return `<button class="dbt ${i === activeDayIdx ? 'on' : ''} ${done ? 'done' : ''}" onclick="switchDay(${i})">
      ${done ? '✓ ' : ''}${nombre}
    </button>`;
  }).join('');
  scrollTabIntoView(activeDayIdx);
}

function renderProgressDias() {
  document.getElementById('progress-dias').innerHTML = selectedDayNames.map((_, i) => {
    const done = isDayDone(i);
    return `<div class="pd-dot ${done ? 'done' : i === activeDayIdx ? 'active' : ''}"></div>`;
  }).join('');
}

function isDayDone(idx) {
  const s = daySelections[idx];
  return s && s.principal && s.contorno && s.jugo;
}

function showCopyHint() {
  document.getElementById('copy-hint-overlay')?.classList.add('show');
  setTimeout(closeCopyHint, 6000);
}

function closeCopyHint() {
  document.getElementById('copy-hint-overlay')?.classList.remove('show');
}

function toggleCopyPanel() {
  const panel = document.getElementById('copy-panel');
  const btn = document.getElementById('copy-toggle-btn');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (btn) btn.classList.toggle('active', open);
}

function copyFromDay(sourceIdx) {
  const src = daySelections[sourceIdx];
  if (!src) return;
  daySelections[activeDayIdx] = { ...src, _copiedFrom: sourceIdx };
  renderDayTabs();
  renderProgressDias();
  const nextIdx = activeDayIdx + 1;
  if (nextIdx < selectedDayNames.length) {
    switchDay(nextIdx);
  } else {
    tryOpenCart();
  }
}

/* Devuelve el menú correcto según categoría. 'variado' = merge de las 3 */
function getMenuForCat(cat) {
  if (cat !== 'variado') return MENUS[cat];
  const uniq = arr => { const s=new Set(); return arr.filter(x=>s.has(x.name)?false:(s.add(x.name),true)); };
  const sortNone = arr => { const n=arr.filter(x=>x.icon==='—'); const r=arr.filter(x=>x.icon!=='—'); return [...r,...n]; };
  return {
    principales: uniq([...MENUS.libre.principales, ...MENUS.dieta.principales, ...MENUS.proteina.principales]),
    contornos:   sortNone(uniq([...MENUS.libre.contornos, ...MENUS.dieta.contornos, ...MENUS.proteina.contornos])),
    jugos:       sortNone(uniq([...MENUS.libre.jugos,     ...MENUS.dieta.jugos,     ...MENUS.proteina.jugos])),
    postres:     sortNone(uniq([...MENUS.libre.postres,   ...MENUS.dieta.postres,   ...MENUS.proteina.postres])),
  };
}

function scrollTabIntoView(idx) {
  setTimeout(() => {
    const container = document.getElementById('day-builder-tabs');
    if (!container) return;
    const btn = container.querySelectorAll('.dbt')[idx];
    if (!btn) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const scrollLeft = container.scrollLeft + (btnRect.left - containerRect.left) - (containerRect.width / 2) + (btnRect.width / 2);
    container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
  }, 50);
}

function switchDay(idx) {
  activeDayIdx = idx;
  renderDayTabs();
  renderProgressDias();

  /* ── Transición de entrada al nuevo día ── */
  const builder = document.getElementById('day-builder');
  if (builder) {
    builder.style.opacity = '0';
    builder.style.transform = 'translateY(10px)';
    builder.style.transition = 'none';
  }
  renderDayBuilder();
  if (builder) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        builder.style.transition = 'opacity .28s ease, transform .28s cubic-bezier(.2,0,.2,1)';
        builder.style.opacity = '1';
        builder.style.transform = 'translateY(0)';
      });
    });
  }

  scrollTabIntoView(idx);
  setTimeout(() => {
    const sheetBody = document.getElementById('sheet-body');
    const sticky = document.getElementById('sheet-day-tabs-sticky');
    if (sheetBody && sticky) {
      sheetBody.scrollTo({ top: sticky.offsetTop - 4, behavior: 'smooth' });
    }
  }, 60);
}

/* ── BUILDER ── */
function renderDayBuilder() {
  const label = selectedDayNames[activeDayIdx];
  const menu = getMenuForCat(selectedCat);
  const sel = daySelections[activeDayIdx] || {};
  const CAT_COLORS = { libre:{bg:'#E8F5EF',text:'#3D8B6E',label:'🌿 Libre de Grasa'}, dieta:{bg:'#EDE5F7',text:'#6B4FA0',label:'⚖️ Dieta Balanceada'}, proteina:{bg:'#FFF0E8',text:'#C4521E',label:'💪 Full Proteína'}, variado:{bg:'#F3F0FF',text:'#6d28d9',label:'🎨 Variado'} };
  const catColor = CAT_COLORS[selectedCat];
  const baseP = getCatBasePrice(selectedCat, sel.principal ? menu.principales.find(p=>p.id===sel.principal) : null);
  let extra = 0;
  if (sel.principal) extra += menu.principales.find(p=>p.id===sel.principal)?.price||0;
  if (sel.contorno) extra += menu.contornos.find(p=>p.id===sel.contorno)?.price||0;
  if (sel.jugo) extra += menu.jugos.find(p=>p.id===sel.jugo)?.price||0;
  if (sel.postre) extra += menu.postres.find(p=>p.id===sel.postre)?.price||0;

  /* Solo días configurados manualmente (sin _copiedFrom) pueden ser fuente de copia */
  const doneDays = selectedDayNames
    .map((n, i) => ({ i, n }))
    .filter(d => d.i !== activeDayIdx && isDayDone(d.i) && !daySelections[d.i]?._copiedFrom);
  const isEmpty = !sel.principal && !sel.contorno && !sel.jugo;
  const showCopyBar = isEmpty && doneDays.length > 0;

  document.getElementById('day-builder').innerHTML = `
    <div class="db-header">
      <div class="db-header-left">
        <div class="db-day-label">📅 ${label}</div>
        <span class="db-cat-badge" style="background:${catColor.bg};color:${catColor.text}">${catColor.label}</span>
      </div>
      <div class="db-total">${fmt(baseP + extra)}</div>
    </div>
    <div class="db-section">
      <div class="db-sec-header">
        <div class="db-sec-title"><span>🍽️</span> Plato principal</div>
        ${sel.principal
          ? `<span class="db-sec-summary" onclick="expandSection('principal')">${menu.principales.find(p=>p.id===sel.principal)?.name||''}</span>`
          : showCopyBar
            ? `<button class="copy-icon-btn" id="copy-toggle-btn" onclick="toggleCopyPanel()">📋 Copiar</button>`
            : ''
        }
      </div>
      ${showCopyBar ? `<div class="copy-panel" id="copy-panel"><span class="copy-panel-label">¿De qué día?</span>${doneDays.map(d=>`<button class="copy-chip" onclick="copyFromDay(${d.i})">${d.n}</button>`).join('')}</div>` : ''}
      <div class="db-sec-body ${sel.principal ? 'collapsed' : ''}" id="sec-principal" style="max-height:${sel.principal?'0':'2000px'}">
        ${menu.principales.map(p=>`
          <div class="menu-opt ${sel.principal===p.id?'selected':''}" onclick="selectItem(${activeDayIdx},'principal','${p.id}')">
            <img class="menu-opt-img" src="${p.img}" alt="${p.name}" loading="lazy">
            <div class="menu-opt-body">
              <div class="menu-opt-radio"></div>
              <div class="menu-opt-top">
                <div class="menu-opt-info">
                  <div class="menu-opt-name">${p.name}</div>
                  <div class="menu-opt-desc">${p.desc}</div>
                </div>
              </div>
              <div class="menu-opt-bottom">
                ${p.tags[0]?`<span class="menu-opt-tag">${p.tags[0]}</span>`:''}
                ${p.price>0?`<div class="menu-opt-price">+${fmt(p.price)}</div>`:''}
              </div>
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div class="db-section">
      <div class="db-sec-header">
        <div class="db-sec-title"><span>🥗</span> Contorno</div>
        ${sel.contorno ? `<span class="db-sec-summary" onclick="expandSection('contorno')">${menu.contornos.find(c=>c.id===sel.contorno)?.name||''}</span>` : ''}
      </div>
      <div class="db-sec-body ${sel.contorno ? 'collapsed' : ''}" id="sec-contorno" style="max-height:${sel.contorno?'0':'600px'}">
        <div class="extras-grid">
          ${[...menu.contornos].sort((a,b)=>(a.icon==='—'?1:0)-(b.icon==='—'?1:0)).map(c=>`
            <div class="extra-pill ${sel.contorno===c.id?'selected':''}" onclick="selectItem(${activeDayIdx},'contorno','${c.id}')">
              <span class="ep-icon">${c.icon}</span>${c.name}${c.price>0?` <small>+${fmt(c.price)}</small>`:''}
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="db-section">
      <div class="db-sec-header">
        <div class="db-sec-title"><span>🥤</span> Bebida</div>
        ${sel.jugo ? `<span class="db-sec-summary" onclick="expandSection('jugo')">${menu.jugos.find(j=>j.id===sel.jugo)?.name||''}</span>` : ''}
      </div>
      <div class="db-sec-body ${sel.jugo ? 'collapsed' : ''}" id="sec-jugo" style="max-height:${sel.jugo?'0':'600px'}">
        <div class="extras-grid">
          ${[...menu.jugos].sort((a,b)=>(a.icon==='—'?1:0)-(b.icon==='—'?1:0)).map(j=>`
            <div class="extra-pill ${sel.jugo===j.id?'selected':''}" onclick="selectItem(${activeDayIdx},'jugo','${j.id}')">
              <span class="ep-icon">${j.icon}</span>${j.name}${j.price>0?` <small>+${fmt(j.price)}</small>`:''}
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="db-section">
      <div class="db-sec-header">
        <div class="db-sec-title"><span>🍮</span> Postre</div>
        ${sel.postre ? `<span class="db-sec-summary" onclick="expandSection('postre')">${menu.postres.find(p=>p.id===sel.postre)?.name||''}</span>` : ''}
      </div>
      <div class="db-sec-body ${sel.postre ? 'collapsed' : ''}" id="sec-postre" style="max-height:${sel.postre?'0':'600px'}">
        <div class="extras-grid">
          ${[...menu.postres].sort((a,b)=>(a.icon==='—'?1:0)-(b.icon==='—'?1:0)).map(p=>`
            <div class="extra-pill ${sel.postre===p.id?'selected':''}" onclick="selectItem(${activeDayIdx},'postre','${p.id}')">
              <span class="ep-icon">${p.icon}</span>${p.name}${p.price>0?` <small>+${fmt(p.price)}</small>`:''}
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function selectItem(dayIdx, tipo, id) {
  if (!daySelections[dayIdx]) daySelections[dayIdx] = {};

  /* ── Animación cascada antes de colapsar ── */
  const secMap = { principal:'sec-principal', contorno:'sec-contorno', jugo:'sec-jugo', postre:'sec-postre' };
  const secBody = document.getElementById(secMap[tipo]);
  let itemCount = 0;
  if (secBody) {
    const items = secBody.querySelectorAll('.menu-opt, .extra-pill');
    itemCount = items.length;
    items.forEach((el, i) => {
      const delay = i * 75;
      el.style.transition = `transform 320ms cubic-bezier(.4,0,1,1) ${delay}ms, opacity 272ms ease ${delay}ms`;
    });
    secBody.classList.add('collapsing');
  }

  const delay = secBody ? Math.min(itemCount * 35 + 100, 380) : 0;
  setTimeout(() => {
    daySelections[dayIdx][tipo] = id;
    renderDayBuilder();
    renderDayTabs();
    renderProgressDias();
    updateP3StatusBar();
    updateFloatBtn();
    updateBottomBar();

    /* ── Scroll al header del día ── */
    const orden = ['principal','contorno','jugo','postre'];
    const nextTipo = orden[orden.indexOf(tipo) + 1];
    if (nextTipo) {
      setTimeout(() => {
        const sheetBody = document.getElementById('sheet-body');
        const header = document.getElementById('sheet-header');
        const headerH = header ? header.offsetHeight : 0;
        const dayHeader = sheetBody?.querySelector('.db-header');
        if (dayHeader) {
          const top = dayHeader.offsetTop - headerH - 8;
          sheetBody.scrollTo({ top, behavior: 'smooth' });
        }
      }, 280);
    }

    const allFieldsDone = daySelections[dayIdx]?.principal && daySelections[dayIdx]?.contorno &&
                          daySelections[dayIdx]?.jugo && daySelections[dayIdx]?.postre;
    if (allFieldsDone) {
      /* Mostrar hint de copia una sola vez al completar el primer día */
      if (dayIdx === 0 && selectedDayNames.length > 1 && !sessionStorage.getItem('copyHintSeen')) {
        sessionStorage.setItem('copyHintSeen', '1');
        setTimeout(showCopyHint, 420);
      }
      const isLastDay = dayIdx >= selectedDayNames.length - 1;
      if (!isLastDay) {
        /* ── Animación: tab pulse + toast + salto al siguiente día ── */
        setTimeout(() => {
          /* 1. Tab completing pulse */
          const tabs = document.getElementById('day-builder-tabs');
          const tabBtn = tabs ? tabs.querySelectorAll('.dbt')[dayIdx] : null;
          if (tabBtn) tabBtn.classList.add('completing');

          /* 2. Toast "Menú del X completado ✓" */
          const toast = document.createElement('div');
          toast.className = 'day-done-toast';
          toast.textContent = 'Menú del ' + selectedDayNames[dayIdx] + ' completado ✓';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 1900);

          /* 3. Saltar al siguiente día después del pulse */
          setTimeout(() => {
            if (tabBtn) tabBtn.classList.remove('completing');
            switchDay(dayIdx + 1);
            setTimeout(() => {
              const sheetBody = document.getElementById('sheet-body');
              if (sheetBody) sheetBody.scrollTo({ top: 0, behavior: 'smooth' });
            }, 80);
          }, 800);
        }, 200);
      } else {
        setTimeout(() => { tryOpenCart(); }, 400);
      }
    }
  }, delay);
}

/* ── EXPANDIR SECCIÓN PARA CORREGIR ── */
function expandSection(tipo) {
  const secMap = { principal:'sec-principal', contorno:'sec-contorno', jugo:'sec-jugo', postre:'sec-postre' };
  const secBody = document.getElementById(secMap[tipo]);
  if (!secBody) return;

  /* Quitar collapsed y fijar altura para la transición */
  secBody.classList.remove('collapsed');
  secBody.style.maxHeight = '2000px';
  secBody.style.opacity = '1';

  /* Poner items en estado inicial (abajo, invisibles) */
  const items = secBody.querySelectorAll('.menu-opt, .extra-pill');
  items.forEach(el => {
    el.style.transition = 'none';
    el.style.transform = 'scale(0.87) translateY(6px)';
    el.style.opacity = '0';
  });

  /* Frame siguiente: animar hacia posición normal, del último al primero */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const total = items.length;
      items.forEach((el, i) => {
        const delay = (total - 1 - i) * 75;
        el.style.transition = `transform 320ms cubic-bezier(0,.8,.6,1) ${delay}ms, opacity 272ms ease ${delay}ms`;
        el.style.transform = 'scale(1) translateY(0)';
        el.style.opacity = '1';
      });
    });
  });
}


function getCatBasePrice(cat, menuItem) {
  if (cat !== 'variado') return CAT_BASE_PRICE[cat] || 0;
  // Variado: precio del principal según su categoría original
  if (!menuItem) return 0;
  const id = menuItem.id || '';
  if (id.startsWith('l-')) return CAT_BASE_PRICE.libre;
  if (id.startsWith('d-')) return CAT_BASE_PRICE.dieta;
  if (id.startsWith('p-')) return CAT_BASE_PRICE.proteina;
  return CAT_BASE_PRICE.dieta; // fallback
}

function getCartTotal() {
  if (!selectedCat || !selectedDayNames.length) return 0;
  const menu = getMenuForCat(selectedCat);
  let total = 0;
  selectedDayNames.forEach((_, i) => {
    const s = daySelections[i] || {};
    const pItem = s.principal ? menu.principales.find(p=>p.id===s.principal) : null;
    let d = getCatBasePrice(selectedCat, pItem);
    if (pItem) d += pItem.price||0;
    if (s.contorno) d += menu.contornos.find(p=>p.id===s.contorno)?.price||0;
    if (s.jugo) d += menu.jugos.find(p=>p.id===s.jugo)?.price||0;
    if (s.postre) d += menu.postres.find(p=>p.id===s.postre)?.price||0;
    total += d;
  });
  return total;
}

function tryOpenCart() {
  // Verificar que todos los días tengan al menos plato + contorno + bebida
  const incomplete = selectedDayNames.map((nombre, i) => ({ nombre, i, done: isDayDone(i) })).filter(d => !d.done);
  if (incomplete.length > 0) {
    const first = incomplete[0];
    showToast(`⚠️ Falta completar el menú del ${first.nombre}`, true);
    // Llevar al día incompleto
    switchDay(first.i);
    return;
  }
  openCart();
}

/* Estado temporal del editor inline del carrito */
let cartEditDraft = {}; // { dayIdx: {principal, contorno, jugo, postre} }
let cartEditOpen = null; // índice del día abierto (null = ninguno)

function renderCart() {
  const body = document.getElementById('cart-body');
  const footer = document.getElementById('cart-footer');
  const form = document.getElementById('cart-form');
  if (!selectedCat || !selectedDayNames.length) {
    body.innerHTML = `<div class="cart-empty"><div class="cart-empty-icon">🍽️</div><p>Completa los pasos para ver tu pedido.</p></div>`;
    footer.style.display='none'; form.style.display='none'; return;
  }
  const menu = getMenuForCat(selectedCat);
  const CAT_COLORS = { libre:{bg:'#E8F5EF',text:'#3D8B6E',label:'🌿 Libre de Grasa'}, dieta:{bg:'#EDE5F7',text:'#6B4FA0',label:'⚖️ Dieta Balanceada'}, proteina:{bg:'#FFF0E8',text:'#C4521E',label:'💪 Full Proteína'}, variado:{bg:'#F3F0FF',text:'#6d28d9',label:'🎨 Variado'} };
  const catColor = CAT_COLORS[selectedCat];

  let html = `
    <div style="background:${catColor.bg};border-radius:14px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="font-size:.82rem;font-weight:700;color:${catColor.text};">${catColor.label}</div>
      <div style="font-size:.76rem;font-weight:600;color:${catColor.text};opacity:.85;">${selectedDayNames.length} día${selectedDayNames.length>1?'s':''} · <span id="cart-total-inline">${fmt(getCartTotal())}</span></div>
    </div>`;

  selectedDayNames.forEach((nombre, i) => {
    const s = daySelections[i] || {};
    const done = isDayDone(i);
    const pItem  = s.principal ? menu.principales.find(p=>p.id===s.principal) : null;
    const cItem  = s.contorno  ? menu.contornos.find(p=>p.id===s.contorno)   : null;
    const jItem  = s.jugo      ? menu.jugos.find(p=>p.id===s.jugo)           : null;
    const posItem= s.postre    ? menu.postres.find(p=>p.id===s.postre)       : null;
    let dayTotal = getCatBasePrice(selectedCat, pItem);
    if (pItem)   dayTotal += pItem.price||0;
    if (cItem)   dayTotal += cItem.price||0;
    if (jItem)   dayTotal += jItem.price||0;
    if (posItem) dayTotal += posItem.price||0;

    const isEditing = cartEditOpen === i;

    // Editor inline: usa draft si está abierto, si no usa selecciones guardadas
    const draft = cartEditDraft[i] || {...s};

    const editorHtml = `
      <div id="cde-panel-${i}" style="display:${isEditing?'flex':'none'};flex-direction:column;gap:12px;border-top:1.5px solid var(--borde);background:var(--bg);padding:14px 16px;">

        <!-- Principal -->
        <div class="cde-section">
          <div class="cde-label">🍽️ Plato principal</div>
          ${menu.principales.map(p=>`
            <div class="cde-opt ${draft.principal===p.id?'selected':''}" onclick="cartEditSelect(${i},'principal','${p.id}')">
              <img class="cde-opt-img" src="${p.img}" alt="${p.name}" loading="lazy">
              <span class="cde-opt-name">${p.name}</span>
              ${p.price>0?`<span class="cde-opt-price">+${fmt(p.price)}</span>`:''}
              <div class="cde-radio"></div>
            </div>`).join('')}
        </div>

        <!-- Contorno -->
        <div class="cde-section">
          <div class="cde-label">🥗 Contorno</div>
          ${menu.contornos.map(c=>`
            <div class="cde-opt ${draft.contorno===c.id?'selected':''}" onclick="cartEditSelect(${i},'contorno','${c.id}')">
              <span class="cde-opt-icon">${c.icon}</span>
              <span class="cde-opt-name">${c.name}</span>
              ${c.price>0?`<span class="cde-opt-price">+${fmt(c.price)}</span>`:''}
              <div class="cde-radio"></div>
            </div>`).join('')}
        </div>

        <!-- Bebida -->
        <div class="cde-section">
          <div class="cde-label">🥤 Bebida</div>
          ${menu.jugos.map(j=>`
            <div class="cde-opt ${draft.jugo===j.id?'selected':''}" onclick="cartEditSelect(${i},'jugo','${j.id}')">
              <span class="cde-opt-icon">${j.icon}</span>
              <span class="cde-opt-name">${j.name}</span>
              ${j.price>0?`<span class="cde-opt-price">+${fmt(j.price)}</span>`:''}
              <div class="cde-radio"></div>
            </div>`).join('')}
        </div>

        <!-- Postre -->
        <div class="cde-section">
          <div class="cde-label">🍮 Postre</div>
          ${menu.postres.map(p=>`
            <div class="cde-opt ${draft.postre===p.id?'selected':''}" onclick="cartEditSelect(${i},'postre','${p.id}')">
              <span class="cde-opt-icon">${p.icon}</span>
              <span class="cde-opt-name">${p.name}</span>
              ${p.price>0?`<span class="cde-opt-price">+${fmt(p.price)}</span>`:''}
              <div class="cde-radio"></div>
            </div>`).join('')}
        </div>

        <button class="cde-save" onclick="cartEditSave(${i})">✓ Guardar cambios</button>
      </div>`;

    html += `
      <div style="background:var(--white);border:1.5px solid ${done?'var(--borde)':'#FBBF24'};border-radius:16px;overflow:hidden;">

        <!-- Header del día -->
        <div style="padding:11px 16px;background:${done?'var(--bg2)':'#FFFBEB'};border-bottom:1.5px solid ${done?'var(--borde)':'#FDE68A'};display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:.9rem;font-weight:700;color:var(--txt);">📅 ${nombre}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:.7rem;font-weight:700;color:${done?'var(--verde)':'#D97706'}">${done?'✓ Completo':'⚠ Incompleto'}</span>
            <span style="font-family:var(--fd);font-size:1rem;font-weight:700;color:var(--naranja)">${fmt(dayTotal)}</span>
            <button onclick="cartEditToggle(${i})" style="background:${isEditing?'var(--borde2)':'var(--bg3)'};border:1.5px solid var(--borde2);border-radius:10px;padding:4px 10px;font-size:.66rem;font-weight:700;color:var(--txt2);cursor:pointer;font-family:var(--fb);transition:all .2s;">${isEditing?'✕ Cancelar':'✏️ Editar'}</button>
          </div>
        </div>

        <!-- Vista resumida (se oculta si está editando) -->
        <div id="cde-view-${i}" style="display:${isEditing?'none':'block'}">
          <!-- Plato principal con foto -->
          ${pItem ? `
            <div style="padding:12px 16px 10px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--borde);">
              <img src="${pItem.img}" style="width:52px;height:52px;border-radius:10px;object-fit:cover;flex-shrink:0;" loading="lazy">
              <div style="flex:1;min-width:0;">
                <div style="font-size:.62rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);margin-bottom:2px;">Plato principal</div>
                <div style="font-size:.84rem;font-weight:700;color:var(--txt);line-height:1.25;">${pItem.name}</div>
                <div style="font-size:.66rem;color:var(--txt3);margin-top:2px;">${pItem.desc}</div>
              </div>
            </div>` :
            `<div style="padding:10px 16px;border-bottom:1px solid var(--borde);">
              <div style="font-size:.72rem;color:#D97706;font-weight:600;padding:7px 10px;background:#FFFBEB;border-radius:8px;border:1px solid #FDE68A;">⚠ Sin plato principal</div>
             </div>`}
          <div style="padding:10px 16px;display:flex;flex-direction:column;gap:7px;">
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--borde);">
              <span style="font-size:1.1rem;flex-shrink:0;">${cItem ? cItem.icon : '🥗'}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:.58rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);">Contorno</div>
                <div style="font-size:.78rem;font-weight:600;color:${cItem?'var(--txt)':'#D97706'};">${cItem ? cItem.name : 'Sin elegir'}</div>
              </div>
              ${cItem && cItem.price > 0 ? `<span style="font-size:.68rem;font-weight:700;color:var(--naranja);">+${fmt(cItem.price)}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--borde);">
              <span style="font-size:1.1rem;flex-shrink:0;">${jItem ? jItem.icon : '🥤'}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:.58rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);">Bebida</div>
                <div style="font-size:.78rem;font-weight:600;color:${jItem?'var(--txt)':'#D97706'};">${jItem ? jItem.name : 'Sin elegir'}</div>
              </div>
              ${jItem && jItem.price > 0 ? `<span style="font-size:.68rem;font-weight:700;color:var(--naranja);">+${fmt(jItem.price)}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--borde);">
              <span style="font-size:1.1rem;flex-shrink:0;">${posItem ? posItem.icon : '🍮'}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:.58rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--txt3);">Postre</div>
                <div style="font-size:.78rem;font-weight:600;color:var(--txt);">${posItem ? posItem.name : 'Sin elegir'}</div>
              </div>
              ${posItem && posItem.price > 0 ? `<span style="font-size:.68rem;font-weight:700;color:var(--naranja);">+${fmt(posItem.price)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Editor inline -->
        ${editorHtml}
      </div>`;
  });

  body.innerHTML = html;
  form.style.display = '';
  footer.style.display = '';
  document.getElementById('cart-total').textContent = fmt(getCartTotal());
}

function cartEditToggle(i) {
  if (cartEditOpen === i) {
    // Cancelar: descartar draft y cerrar
    cartEditOpen = null;
    delete cartEditDraft[i];
  } else {
    // Abrir: inicializar draft con selección actual
    cartEditOpen = i;
    cartEditDraft[i] = {...(daySelections[i] || {})};
  }
  renderCart();
  // Scroll al panel abierto
  if (cartEditOpen === i) {
    setTimeout(() => {
      const panel = document.getElementById(`cde-panel-${i}`);
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }
}

function cartEditSelect(dayIdx, tipo, id) {
  if (!cartEditDraft[dayIdx]) cartEditDraft[dayIdx] = {};
  cartEditDraft[dayIdx][tipo] = id;
  // Re-render solo el panel del día sin cerrar
  const menu = getMenuForCat(selectedCat);

  // Actualizar clases selected de las opciones de ese tipo dentro del panel
  const panel = document.getElementById(`cde-panel-${dayIdx}`);
  if (!panel) return;
  const sections = panel.querySelectorAll('.cde-section');
  const tipoIdx = { principal:0, contorno:1, jugo:2, postre:3 }[tipo];
  if (tipoIdx === undefined) return;
  const section = sections[tipoIdx];
  if (!section) return;
  section.querySelectorAll('.cde-opt').forEach(el => el.classList.remove('selected'));
  // Find the clicked one by re-querying with the id
  const allOpts = section.querySelectorAll('.cde-opt');
  // Map options for this tipo
  const srcList = tipo === 'principal' ? menu.principales : tipo === 'contorno' ? menu.contornos : tipo === 'jugo' ? menu.jugos : menu.postres;
  allOpts.forEach((el, idx) => {
    if (srcList[idx] && srcList[idx].id === id) el.classList.add('selected');
  });
}

function cartEditSave(i) {
  if (!cartEditDraft[i]) { cartEditOpen = null; renderCart(); return; }
  // Aplicar draft a daySelections
  daySelections[i] = {...cartEditDraft[i]};
  cartEditOpen = null;
  delete cartEditDraft[i];
  renderCart();
  showToast('✓ Cambios guardados');
}

function openCart() { closePedidoSheet(); cartEditOpen = null; cartEditDraft = {}; renderCart(); document.getElementById('cart-overlay').classList.add('open'); document.getElementById('cta-bar').style.display = 'none'; document.body.style.overflow='hidden'; }
function closeCart() { document.getElementById('cart-overlay').classList.remove('open'); document.getElementById('cta-bar').style.display = ''; document.body.style.overflow=''; }
function handleCartClick(e) { if (e.target===document.getElementById('cart-overlay')) closeCart(); }

let tipoEntrega = 'domicilio';
function setTipoEntrega(tipo, el) {
  tipoEntrega = tipo;
  document.querySelectorAll('.tipo-btn').forEach(b=>b.classList.remove('on'));
  el.classList.add('on');
}

/* ── MAPA LEAFLET ── */
let map = null, marker = null, mapaVisible = false;

function toggleMapa() {
  const wrap = document.getElementById('mapa-wrap');
  mapaVisible = !mapaVisible;
  wrap.style.display = mapaVisible ? 'block' : 'none';
  if (mapaVisible && !map) {
    setTimeout(() => {
      map = L.map('map').setView([10.4806, -66.9036], 13); // Caracas por defecto
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19
      }).addTo(map);
      map.on('click', function(e) {
        const {lat, lng} = e.latlng;
        setMapPin(lat, lng);
        reverseGeocode(lat, lng);
      });
    }, 100);
  } else if (mapaVisible && map) {
    map.invalidateSize();
  }
}

function setMapPin(lat, lng) {
  if (marker) map.removeLayer(marker);
  marker = L.marker([lat, lng], {
    icon: L.divIcon({ html:'<div style="background:#FF6B35;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>', iconSize:[20,20], iconAnchor:[10,20] })
  }).addTo(map);
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const data = await res.json();
    const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('cf-dir').value = addr;
    document.getElementById('geo-status').textContent = '📍 Ubicación marcada en el mapa';
  } catch(e) {
    document.getElementById('cf-dir').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

function usarUbicacion() {
  const status = document.getElementById('geo-status');
  if (!navigator.geolocation) { status.textContent = '❌ Tu navegador no soporta geolocalización'; return; }
  status.textContent = '🔍 Obteniendo tu ubicación...';
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      status.textContent = '✓ Ubicación obtenida';
      reverseGeocode(lat, lng);
      if (!mapaVisible) toggleMapa();
      setTimeout(() => {
        if (map) { map.setView([lat, lng], 16); setMapPin(lat, lng); }
      }, 200);
    },
    err => { status.textContent = '❌ No se pudo obtener la ubicación. Escríbela manualmente.'; },
    { timeout: 8000 }
  );
}

/* ── WHATSAPP ── */
function sendWA() {
  const nombre = document.getElementById('cf-nombre').value.trim();
  const dir = document.getElementById('cf-dir').value.trim();
  const nEl = document.getElementById('cf-nombre');
  const dEl = document.getElementById('cf-dir');
  nEl.classList.remove('error'); dEl.classList.remove('error');
  if (!nombre) { nEl.classList.add('error'); showToast('⚠️ Ingresa tu nombre', true); return; }
  if (!dir) { dEl.classList.add('error'); showToast('⚠️ Ingresa tu dirección', true); return; }
  const menu = getMenuForCat(selectedCat);
  const catLabel = { libre:'🌿 Libre de Grasa', dieta:'⚖️ Dieta Balanceada', proteina:'💪 Full Proteína', variado:'🎨 Variado' }[selectedCat];
  let msg = `¡Hola! Quiero hacer un pedido 🍱\n\n`;
  msg += `👤 *Nombre:* ${nombre}\n`;
  msg += `🥗 *Plan:* ${catLabel}\n`;
  msg += `🚚 *Entrega:* ${tipoEntrega==='domicilio'?'🏠 Domicilio':'🏢 Trabajo'} — ${dir}\n\n`;
  msg += `*📅 Mi menú:*\n`;
  selectedDayNames.forEach((nombre2, i) => {
    const s = daySelections[i] || {};
    const p = s.principal ? menu.principales.find(x=>x.id===s.principal)?.name : 'No elegido';
    const c = s.contorno ? menu.contornos.find(x=>x.id===s.contorno)?.name : 'No elegido';
    const j = s.jugo ? menu.jugos.find(x=>x.id===s.jugo)?.name : 'No elegido';
    const pos = s.postre ? menu.postres.find(x=>x.id===s.postre)?.name : 'Sin postre';
    msg += `\n*${nombre2}:*\n• 🍽️ ${p}\n• 🥗 ${c}\n• 🥤 ${j}\n• 🍮 ${pos}\n`;
  });
  msg += `\n💰 *Total estimado:* ${fmt(getCartTotal())}\n\n¿Confirman disponibilidad? ¡Gracias!`;
  window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`, '_blank');
}

/* ── UI UTILS ── */
function updateFloatBtn() {}
function updateBottomBar() {}

function showToast(msg, isError=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error-toast' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

document.getElementById('hamburger').addEventListener('click', function() {
  this.classList.toggle('open');
  document.getElementById('mobile-menu').classList.toggle('open');
  document.body.style.overflow = this.classList.contains('open') ? 'hidden' : '';
});
function closeMobile() {
  document.getElementById('hamburger').classList.remove('open');
  document.getElementById('mobile-menu').classList.remove('open');
  document.body.style.overflow = '';
}

window.addEventListener('scroll', () => {
  document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 20);
});

/* ── ENTER CIERRA TECLADO ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.blur();
    }
  }
});

const io = new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('on');});},{threshold:.1});
document.querySelectorAll('.rv').forEach(el=>io.observe(el));


/* ── initUI — llamado por config-loader después de cargar config.json ── */
function initUI() {
  /* Footer logo */
  const $ = id => document.getElementById(id);
  if ($('foot-logo-txt')) $('foot-logo-txt').textContent = CONFIG.emoji + ' ' + CONFIG.nombre;
  if ($('foot-tagline-txt')) $('foot-tagline-txt').textContent = CONFIG.tagline;
}
