/* Carte d'Eridune — Reiseatlas v1
   Read-only-Karte zum Register: liest die Daten der Kartenwerkstatt
   (../werkstatt/werkstatt-daten.json) und lotst zu den Wiki-Einträgen.
   Kein Editor, kein Upload. Kein Build-Schritt, keine Abhängigkeiten. */
(function () {
  'use strict';

  const DATEN_URL = '../werkstatt/werkstatt-daten.json';
  const THEME_KEY = 'eridune.theme';

  /* Dieselben Typen und Farben wie in der Kartenwerkstatt */
  const TYPEN = {
    stadt:      { label: 'Stadt',           farbe: '#e6c86a' },
    dorf:       { label: 'Dorf',            farbe: '#d8c9a0' },
    grenze:     { label: 'Grenze/Festung',  farbe: '#c96a5a' },
    ruine:      { label: 'Ruine',           farbe: '#a08a72' },
    verkehr:    { label: 'Verkehrsweg',     farbe: '#8ab0c8' },
    natur:      { label: 'Naturmarke',      farbe: '#7aa86a' },
    wald:       { label: 'Wald',            farbe: '#56845a' },
    gebirge:    { label: 'Gebirge',         farbe: '#8d8d8d' },
    gewaesser:  { label: 'Gewässer',        farbe: '#5a9ab0' },
    geheimnis:  { label: 'Geheimnis',       farbe: '#a56ac8' },
    kult:       { label: 'Kultstätte',      farbe: '#b04a6a' },
    untergrund: { label: 'Untergrund',      farbe: '#7a6a5a' },
    artefakt:   { label: 'Artefakt',        farbe: '#d4a45c' },
    ziel:       { label: 'Ziel',            farbe: '#e0d060' }
  };

  let daten = { markers: [], settings: {}, updated: null };
  let sel = null;
  let typFilter = null;
  let imgW = 0, imgH = 0;
  const view = { s: 1, tx: 0, ty: 0 };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const typInfo = (t) => TYPEN[t] || { label: t, farbe: '#737B84' };

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 3200);
  }

  /* ---------- Daten ---------- */
  async function ladeDaten(bust) {
    const url = DATEN_URL + (bust ? '?_=' + Date.now() : '');
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      daten = {
        markers: Array.isArray(d.markers) ? d.markers : [],
        settings: d.settings || {},
        updated: d.updated || null
      };
      $('fehler').style.display = 'none';
      renderAll();
    } catch (e) {
      const f = $('fehler');
      f.textContent = 'Die Kartendaten ließen sich nicht laden („' + DATEN_URL + '“). Vielleicht offline?';
      f.style.display = 'block';
    }
  }

  function karteSrc() {
    const u = (daten.settings && daten.settings.mapUrl) || '';
    if (!u) return '';
    if (/^(https?:)?\/\//i.test(u) || u.indexOf('data:') === 0 || u.indexOf('/') === 0) return u;
    return '../werkstatt/' + u.replace(/^\.\//, '');
  }

  function wikiHref(m) {
    if (m.url) return m.url;
    if (!m.wiki) return '';
    return '../#/' + encodeURIComponent(m.wiki);
  }

  /* ---------- Karte: Pan & Zoom ---------- */
  function applyView() {
    $('world').style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.s + ')';
  }
  function zoomAt(mx, my, f) {
    const ns = clamp(view.s * f, 0.08, 14);
    const rf = ns / view.s;
    view.tx = mx - (mx - view.tx) * rf;
    view.ty = my - (my - view.ty) * rf;
    view.s = ns;
    applyView();
  }
  function fitView() {
    if (!imgW || !imgH) return;
    const r = $('karte').getBoundingClientRect();
    view.s = clamp(Math.min(r.width / imgW, r.height / imgH), 0.08, 14);
    view.tx = (r.width - imgW * view.s) / 2;
    view.ty = (r.height - imgH * view.s) / 2;
    applyView();
  }
  function gotoMarker(m) {
    if (!imgW || !imgH) return;
    const r = $('karte').getBoundingClientRect();
    const s = Math.max(view.s, 1.15);
    view.s = s;
    view.tx = r.width / 2 - (m.x / 100) * imgW * s;
    view.ty = r.height / 2 - (m.y / 100) * imgH * s;
    applyView();
  }

  function applyKarte() {
    const img = $('karte-img');
    const world = $('world');
    const src = karteSrc();
    imgW = 0; imgH = 0;
    world.classList.add('leer');
    $('hinweis').hidden = true;
    if (!src) { $('hinweis').hidden = false; img.removeAttribute('src'); renderMarkers(); return; }
    img.onload = () => {
      imgW = img.naturalWidth; imgH = img.naturalHeight;
      world.classList.remove('leer');
      $('hinweis').hidden = true;
      world.style.width = imgW + 'px';
      world.style.height = imgH + 'px';
      fitView();
      renderMarkers();
    };
    img.onerror = () => {
      world.classList.add('leer');
      $('hinweis').hidden = false;
      img.removeAttribute('src');
      toast('Kartenbild konnte nicht geladen werden: ' + src);
      renderMarkers();
    };
    img.src = src;
  }

  /* ---------- Auswahl ---------- */
  function choose(id, fliege) {
    sel = id;
    renderMarkers();
    renderList();
    showDetail();
    if (fliege !== false) {
      const m = daten.markers.find((x) => x.id === id);
      if (m) gotoMarker(m);
    }
  }
  function showDetail() {
    const box = $('detail');
    const m = daten.markers.find((x) => x.id === sel);
    if (!m) { box.hidden = true; return; }
    const href = wikiHref(m);
    box.hidden = false;
    box.innerHTML =
      '<h2>' + esc(m.label || 'Ohne Namen') + '</h2>' +
      '<p class="typzeile">' + esc(typInfo(m.typ).label) + '</p>' +
      (href
        ? '<a class="eintrag" href="' + esc(href) + '">Zum Eintrag ↗</a>'
        : '<p class="ohne">Dazu steht noch nichts im Register.</p>');
  }

  /* ---------- Rendering ---------- */
  function renderAll() {
    applyKarte();
    renderLegende();
    renderList();
    showDetail();
    standText();
  }
  function standText() {
    const n = daten.markers.length;
    const d = daten.updated ? new Date(daten.updated).toLocaleDateString('de-DE') : '';
    $('stand').textContent = n + (n === 1 ? ' Ort' : ' Orte') + (d ? ' · Stand ' + d : '');
  }
  function renderMarkers() {
    const world = $('world');
    world.querySelectorAll('.marke').forEach((el) => el.remove());
    if (!imgW || !imgH) return; /* ohne Kartenbild keine Ortsmarken */
    const frag = document.createDocumentFragment();
    daten.markers.forEach((m) => {
      if (!m || !Number.isFinite(+m.x) || !Number.isFinite(+m.y)) return;
      const el = document.createElement('div');
      el.className = 'marke' + (sel === m.id ? ' sel' : '');
      el.dataset.id = m.id;
      el.style.left = clamp(+m.x, 0, 100) + '%';
      el.style.top = clamp(+m.y, 0, 100) + '%';
      const info = typInfo(m.typ);
      el.innerHTML = '<span class="punkt" style="background:' + info.farbe + '"></span>' +
        (m.label ? '<span class="mname">' + esc(m.label) + '</span>' : '');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', m.label || 'Ort');
      frag.appendChild(el);
    });
    world.appendChild(frag);
  }
  function sichtbar() {
    const q = $('suche').value.trim().toLowerCase();
    return daten.markers.filter((m) => {
      if (typFilter && m.typ !== typFilter) return false;
      if (q && !(
        String(m.label || '').toLowerCase().indexOf(q) >= 0 ||
        typInfo(m.typ).label.toLowerCase().indexOf(q) >= 0
      )) return false;
      return true;
    });
  }
  function renderLegende() {
    const present = {};
    daten.markers.forEach((m) => { present[m.typ] = (present[m.typ] || 0) + 1; });
    let html = '<span class="chip' + (typFilter === null ? ' on' : '') + '" data-t="">Alle (' + daten.markers.length + ')</span>';
    Object.keys(present).forEach((k) => {
      html += '<span class="chip' + (typFilter === k ? ' on' : '') + '" data-t="' + esc(k) + '">' +
        esc(typInfo(k).label) + ' (' + present[k] + ')</span>';
    });
    $('legende').innerHTML = html;
  }
  function renderList() {
    const vis = sichtbar();
    const list = $('liste');
    if (!vis.length) {
      list.innerHTML = '<p class="leer-liste">Keine Orte' + (daten.markers.length ? ' zu dieser Suche.' : ' auf der Karte.</p>');
      return;
    }
    list.innerHTML = vis.map((m) => {
      const href = wikiHref(m);
      return '<div class="zeile' + (sel === m.id ? ' sel' : '') + '" data-id="' + esc(m.id) + '" role="button" tabindex="0">' +
        '<span class="punkt" style="background:' + typInfo(m.typ).farbe + '"></span>' +
        '<span class="zname">' + esc(m.label || '(ohne Namen)') + '</span>' +
        (href ? '<span class="zl" title="Eintrag im Register">↗</span>' : '') +
        '</div>';
    }).join('');
  }

  /* ---------- Interaktion ---------- */
  function initGesten() {
    const karte = $('karte');
    const pointers = new Map();
    let pinch = null;

    karte.addEventListener('pointerdown', (e) => {
      const mEl = e.target.closest('.marke');
      if (mEl) { choose(mEl.dataset.id, false); return; }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { karte.setPointerCapture(e.pointerId); } catch (err) {}
      if (pointers.size === 2) pinch = null;
      e.preventDefault();
    });
    karte.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const p = pointers.get(e.pointerId);
      if (pointers.size === 1) {
        view.tx += e.clientX - p.x;
        view.ty += e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        applyView();
      } else if (pointers.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const pts = Array.from(pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
        if (!pinch) {
          pinch = { dist: dist, s: view.s, mx: mx, my: my, tx: view.tx, ty: view.ty };
          return;
        }
        const r = karte.getBoundingClientRect();
        const ns = clamp(pinch.s * (dist / Math.max(pinch.dist, 1)), 0.08, 14);
        const cx = pinch.mx - r.left, cy = pinch.my - r.top;
        const rf = ns / pinch.s;
        view.s = ns;
        view.tx = cx - (cx - pinch.tx) * rf;
        view.ty = cy - (cy - pinch.ty) * rf;
        applyView();
      }
    });
    const loose = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
    karte.addEventListener('pointerup', loose);
    karte.addEventListener('pointercancel', loose);
    karte.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = karte.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
    }, { passive: false });
    window.addEventListener('resize', fitView);
  }

  function initUi() {
    $('bFit').onclick = fitView;
    $('bNeu').onclick = async () => { await ladeDaten(true); toast('Kartendaten neu geladen.'); };
    $('suche').addEventListener('input', renderList);
    $('legende').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      typFilter = chip.dataset.t || null;
      renderLegende();
      renderList();
    });
    $('liste').addEventListener('click', (e) => {
      const row = e.target.closest('.zeile');
      if (row) choose(row.dataset.id, true);
    });
    $('liste').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const row = e.target.closest('.zeile');
        if (row) { e.preventDefault(); choose(row.dataset.id, true); }
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { sel = null; renderMarkers(); renderList(); showDetail(); }
    });
  }

  /* ---------- Ansicht hell/dunkel (gleiches Muster wie im Register) ---------- */
  function initTheme() {
    const btn = $('theme-btn');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => {
      const t = document.documentElement.dataset.theme;
      return t ? t === 'dark' : mq.matches;
    };
    const sync = () => { btn.textContent = isDark() ? 'Hell' : 'Dunkel'; };
    sync();
    btn.onclick = () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
      sync();
    };
    if (mq.addEventListener) mq.addEventListener('change', sync);
  }

  /* ---------- Start ---------- */
  async function init() {
    initGesten();
    initUi();
    initTheme();
    await ladeDaten(false);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }
  init();
})();
