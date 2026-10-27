// ==UserScript==
// @name         Poppen.de – Opa-Schutz Helfer (Werte-Erfassung)
// @namespace    local.visitor-age-filter.helfer
// @version      1.6.1
// @description  Einmalige Erfassung aller user/info-Werte (Code→Klartext) für den Opa-Schutz und Untersuchung von Alter 99. Labels gibt es nur auf der Profilseite, daher wird dafür unsichtbar offen gelesen. Eigenständig mit eigenem Rekorder – das Hauptscript währenddessen bitte deaktivieren.
// @match        https://www.poppen.de/*
// @grant        GM_getValue
// @grant        GM_setValue
// @updateURL    https://raw.githubusercontent.com/Schimmelreiter/poppen-opa-scan/main/helfer/poppen-opa-helfer.user.js
// @downloadURL  https://raw.githubusercontent.com/Schimmelreiter/poppen-opa-scan/main/helfer/poppen-opa-helfer.user.js
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  const VERSION = '1.6.1';
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  if (W.top !== W) return;                 // nur im Hauptfenster
  if (!/(^|\.)poppen\.de$/.test(location.hostname)) return;

  const now = () => Date.now();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uniq = (a) => [...new Set(a)];
  const log = (...a) => console.log('[Opa-Helfer]', ...a);
  const warn = (...a) => console.warn('[Opa-Helfer]', ...a);
  const K = (k) => 'opahelfer_' + k;
  const G = { get: (k, d) => GM_getValue(K(k), d), set: (k, v) => GM_setValue(K(k), v), del: (k) => GM_deleteValue(K(k)) };

  // eigene Fehler sammeln (hilft, rote Konsolenmeldungen zuzuordnen)
  const errors = [];
  try {
    W.addEventListener('error', (e) => { try { errors.push({ t: 'error', msg: String((e && (e.message || (e.error && e.error.message))) || ''), src: (e && e.filename) || '', line: (e && e.lineno) || 0 }); } catch {} });
    W.addEventListener('unhandledrejection', (e) => { try { errors.push({ t: 'reject', msg: String((e && e.reason && (e.reason.message || e.reason)) || '') }); } catch {} });
  } catch {}

  // =====================================================================================
  // API-Schicht (eigenes fetch, Kopfzeilen von der Seite spiegeln) + eigener Rekorder
  // =====================================================================================
  const origFetch = W.fetch.bind(W);
  const XO = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
  const xOpen = XO && XO.open, xSend = XO && XO.send, xSet = XO && XO.setRequestHeader;
  const descRT = XO && Object.getOwnPropertyDescriptor(XO, 'responseText');
  let mirror = null;
  const SKIP = /^(content-length|cookie|host|content-type)$/i;
  function captureHeaders(h) {
    if (!h) return;
    const out = {};
    try {
      if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v, k) => { out[k] = v; });
      else if (Array.isArray(h)) h.forEach(([k, v]) => { out[k] = v; });
      else Object.assign(out, h);
    } catch { return; }
    const m = {};
    for (const [k, v] of Object.entries(out)) if (!SKIP.test(k)) m[k] = String(v);
    if (Object.keys(m).length || !mirror) mirror = m;
  }

  // ---------- Rekorder: je Pfad + wichtige Parameter-Werte ein Beispiel ----------
  const REDACT = /(e-?mail|pass(word|wd)?|token|secret|session_?id|auth|dino|cookie|phone|telefon|mobile|lat|lon|latitude|longitude|zipcode)/i;
  function redact(v, key = '', depth = 0) {
    if (depth > 14) return '…';
    if (key && REDACT.test(key)) return '«entfernt»';
    if (key && /^birthday$/i.test(key)) return Array.isArray(v) ? v.map((b) => (typeof b === 'string' ? b.slice(0, 4) + '-…' : b)) : v;
    if (key && /^(geo_location|location)$/i.test(key) && v && typeof v === 'object' && !Array.isArray(v)) return { city: v.city || '' };
    if (Array.isArray(v)) return v.map((x) => redact(x, '', depth + 1));
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = redact(x, k, depth + 1); return o; }
    if (typeof v === 'string') return v.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '«E-Mail»');
    return v;
  }
  // Schlüssel so wählen, dass i18n je Modul und user/info je Nick getrennt bleiben
  function recKey(info) {
    let extra = '';
    const b = info.body || {};
    if (/i18n\/pull/.test(info.path)) extra = ' module=' + (b.module || '');
    else if (/^feed\//.test(info.path)) extra = ' ' + JSON.stringify(Object.keys(b).sort());
    return `${info.method} ${info.path}${extra}`;
  }
  const Recorder = {
    data: G.get('rec', {}),
    add(info, json) {
      const key = recKey(info);
      const e = this.data[key] || (this.data[key] = { method: info.method, path: info.path, first: now(), n: 0, examples: [] });
      e.n++; e.last = now();
      if (e.examples.length < 2) e.examples.push({ query: redact(info.query), body: redact(info.body), response: redact(json) });
      this.save();
    },
    _t: null,
    save() { clearTimeout(this._t); this._t = setTimeout(() => G.set('rec', this.data), 1000); },
    clear() { this.data = {}; G.set('rec', {}); },
    export() { return { version: VERSION, at: new Date().toISOString(), entries: Object.values(this.data).sort((a, b) => a.path.localeCompare(b.path)) }; },
  };

  function parseBody(b) {
    if (b == null) return null;
    if (typeof b === 'string') { try { return JSON.parse(b); } catch { try { return Object.fromEntries(new URLSearchParams(b)); } catch { return b; } } }
    if (b instanceof W.URLSearchParams) return Object.fromEntries(b);
    return null;
  }
  function handle(method, url, body, text) {
    let u; try { u = new URL(url, location.origin); } catch { return; }
    const path = u.pathname.replace(/^\/v2-api\//, '');
    let json; try { json = JSON.parse(text); } catch { return; }
    try { Recorder.add({ method: String(method || 'GET').toUpperCase(), path, query: Object.fromEntries(u.searchParams), body: parseBody(body) }, json); } catch (e) { warn('Rekorder', e); }
  }
  W.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (!/\/v2-api\//.test(url)) return origFetch(input, init);
    const method = (init && init.method) || (input && input.method) || 'GET';
    let body = init && init.body;
    try { captureHeaders((init && init.headers) || (input && input.headers)); } catch {}
    if (body == null && input && typeof input.clone === 'function' && method !== 'GET') { try { body = await input.clone().text(); } catch {} }
    const res = await origFetch(input, init);
    try { const ct = res.headers.get('content-type') || ''; if (/json/i.test(ct)) { const t = await res.clone().text(); handle(method, url, body, t); } } catch {}
    return res;
  };
  if (XO) {
    XO.open = function (m, u) { this.__h = { m, u: String(u), h: {} }; return xOpen.apply(this, arguments); };
    XO.setRequestHeader = function (k, v) { if (this.__h) this.__h.h[k] = v; return xSet.apply(this, arguments); };
    XO.send = function (body) {
      const inf = this.__h;
      if (inf && /\/v2-api\//.test(inf.u)) {
        captureHeaders(inf.h);
        this.addEventListener('readystatechange', () => { if (this.readyState === 4) { try { handle(inf.m, inf.u, body, descRT.get.call(this)); } catch {} } });
      }
      return xSend.apply(this, arguments);
    };
  }

  class ApiError extends Error {}
  let apiCount = 0;
  async function waitMirror(ms = 8000) { const t = now(); while (!mirror && now() - t < ms) await sleep(200); }
  async function api(path, { method = 'GET', query = null, body = null } = {}) {
    await waitMirror();
    const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])) : '';
    const headers = { Accept: 'application/json, text/plain, */*', ...(mirror || {}) };
    if (body != null) headers['Content-Type'] = 'application/json';
    const res = await origFetch(location.origin + '/v2-api/' + path + qs, { method, credentials: 'include', headers, body: body != null ? JSON.stringify(body) : undefined });
    apiCount++;
    let j = null; try { j = await res.json(); } catch { throw new ApiError('kein JSON'); }
    if (!j || j.code !== 0) throw new ApiError((j && (j.msg || j.message)) || 'Fehler ' + (j && j.code));
    return j.data;
  }
  const apiGet = (p, q) => api(p, { method: 'GET', query: q });
  const apiPost = (p, b, q) => api(p, { method: 'POST', body: b, query: q });

  // =====================================================================================
  // Feldkatalog: trait-Schlüssel ↔ Label auf der Profilseite (für die Code→Klartext-Paarung)
  // =====================================================================================
  const FIELD_BY_LABEL = {
    'figur': 'figure_name', 'körperform': 'figure_name', 'augenfarbe': 'eyes_name', 'haarfarbe': 'hair', 'haarlänge': 'hair_length',
    'bart': 'beard', 'sexualität': 'sex_type', 'orientierung': 'sex_type', 'intimbehaarung': 'intimately_hair', 'typ': 'ethnicity', 'ethnie': 'ethnicity',
    'herkunft': 'origin', 'körperbehaarung': 'body_hair', 'penislänge': 'dick_length', 'penisbreite': 'dick_width', 'penisdicke': 'dick_width',
    'beschnitten': 'circumcised', 'sternzeichen': 'zodiac', 'brille': 'glass', 'raucher': 'smoker', 'tätowierungen': 'tattoo', 'tattoos': 'tattoo',
    'piercings': 'piercing', 'körbchengröße': 'tits', 'behinderung': 'handicap', 'stellung': 'sexual_position', 'religion': 'religion',
    'safer sex': 'sex_safe', 'identität': 'camp', 'outing': 'how_out', 'status': 'personality', 'prep': 'prevent_hiv',
  };
  // numerische / direkt verständliche Felder brauchen keine Zuordnung
  const NUMERIC = new Set(['age', 'size', 'weight', 'dick_length', 'dick_width']);
  // alle enum-Felder, für die wir Code→Klartext suchen
  const WANT = ['figure_name', 'eyes_name', 'hair', 'hair_length', 'beard', 'sex_type', 'intimately_hair', 'ethnicity',
    'body_hair', 'circumcised', 'zodiac', 'glass', 'smoker', 'tattoo', 'piercing', 'tits', 'handicap',
    'sexual_position', 'religion', 'sex_safe', 'camp', 'how_out', 'personality', 'prevent_hiv'];

  // mapping: field -> { code: label }ß   ;   seen: field -> Set(codes)
  const mapping = G.get('mapping', {});
  const seenCodes = {};
  const editReadDone = new Set();   // Felder, die diesen Lauf schon von der Bearbeiten-Seite gelesen wurden
  function addMap(field, code, label) {
    if (code == null || code === '' || label == null || label === '') return false;
    code = String(code); label = String(label).trim();
    if (!label || /^keine angabe$/i.test(label)) return false;
    mapping[field] = mapping[field] || {};
    if (mapping[field][code] === label) return false;
    mapping[field][code] = label; G.set('mapping', mapping); return true;
  }
  const unresolved = () => WANT.filter((f) => (seenCodes[f] && [...seenCodes[f]].some((c) => c !== '0' && !(mapping[f] && mapping[f][c]))));
  const seenCodeCount = () => Object.values(seenCodes).reduce((a, s) => a + s.size, 0);

  // =====================================================================================
  // Quellen: i18n (Labels), user/list/relationship, user/info (Codes), Profilseite (Klartext)
  // =====================================================================================
  const I18N_MODULES = ['profile', 'user', 'user-info', 'personal-detail', 'detail', 'settings', 'search', 'common', 'me',
    'account', 'relationship', 'member', 'person', 'trait', 'edit-profile', 'profile-edit', 'about', 'interview'];
  const ALT = { figure_name: ['figure', 'figure_name', 'figure-name'], eyes_name: ['eyes', 'eyes_name', 'eyes-name'], sex_type: ['sex_type', 'sex-type', 'orientation'],
    hair_length: ['hair_length', 'hair-length'], body_hair: ['body_hair', 'body-hair'], intimately_hair: ['intimately_hair', 'intimately-hair', 'intim'],
    dick_length: ['dick_length', 'dick-length'], dick_width: ['dick_width', 'dick-width'], prevent_hiv: ['prevent_hiv', 'prevent-hiv'],
    sexual_position: ['sexual_position', 'sexual-position'], sex_safe: ['sex_safe', 'sex-safe'], how_out: ['how_out', 'how-out'] };
  async function pullI18n(phase) {
    for (const module of I18N_MODULES) {
      phase('i18n: ' + module);
      let d; try { d = await apiPost('i18n/pull', { locale: 'de-DE', module }); } catch { continue; }
      if (!d || typeof d !== 'object') continue;
      for (const f of WANT) {
        const keys = (ALT[f] || [f]);
        const re = new RegExp('^(' + keys.join('|') + ')[._-](\\d+)$', 'i');
        for (const [k, v] of Object.entries(d)) { const m = re.exec(k); if (m && typeof v === 'string') addMap(f, m[2], v); }
      }
      await sleep(120);
    }
  }
  async function pullRelationship() {
    try { const d = await apiPost('user/list/relationship', null); for (const c of (d && d.category) || []) if (c.category_id != null && c.title) addMap('relationship_category', c.category_id, c.title); } catch (e) { warn('relationship', e); }
  }

  function noteTrait(tr) {
    if (!tr) return false;
    let got = false;
    for (const f of WANT) {
      const vals = tr[f]; if (vals == null) continue;
      for (const v of (Array.isArray(vals) ? vals : [vals])) { if (v == null || v === '') continue; (seenCodes[f] = seenCodes[f] || new Set()).add(String(v)); got = true; }
    }
    return got;
  }
  async function userInfo(nick) {
    try { const d = await apiGet('user/info/' + encodeURIComponent(String(nick).toLowerCase()), { _version: 2 }); return d; } catch { return null; }
  }

  // Profilseite in verstecktem Rahmen laden und „Persönliche Details" (Label→Wert) lesen
  let frame = null;
  function theFrame() {
    if (frame && frame.isConnected) return frame;
    frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1024px;height:900px;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    return frame;
  }
  function loadFrame(url) {
    return new Promise((resolve) => { const f = theFrame(); const done = () => { f.removeEventListener('load', done); resolve(); }; f.addEventListener('load', done); f.src = url; setTimeout(done, 25000); });
  }
  // Wert zu einem Detail-Label finden – robust gegen mehrere DOM-Formen,
  // da Klassennamen zufällig (styled-components) sind.
  function valueForLabel(lab) {
    const lt = (lab.textContent || '').trim();
    // 1) nächstes Geschwister-Element mit Text (…<label>Figur</label><div>Normal</div>)
    for (let s = lab.nextElementSibling; s; s = s.nextElementSibling) {
      const t = (s.textContent || '').trim(); if (t) return t;
    }
    // 2) Rest des Eltern-/Großeltern-Containers ohne den Label-Text
    for (let p = lab.parentElement, i = 0; p && i < 3; p = p.parentElement, i++) {
      const full = (p.textContent || '').trim();
      if (full.length > lt.length && full.startsWith(lt)) {
        const rest = full.slice(lt.length).trim();
        if (rest && rest.length <= 60) return rest;
      }
    }
    return '';
  }
  const PLACEHOLDER = /^(bitte\s*(aus)?wählen|aus\s*wählen|auswählen|wählen|keine angabe|k\.? ?a\.?|—|-|–)$/i;
  function readDetailsFrom(doc) {
    const out = {};
    for (const lab of doc.querySelectorAll('label')) {
      const key = (lab.textContent || '').trim().toLowerCase();
      const field = FIELD_BY_LABEL[key];
      if (!field) continue;
      const txt = valueForLabel(lab);
      if (txt && !PLACEHOLDER.test(txt)) out[field] = txt;
    }
    return out;
  }
  // Diagnose, damit wir sehen, was eine Seite im iframe wirklich liefert
  // (nur im Eigen-Profil-Debug aktiv – im vollen Lauf aus, sonst Speicher-Blowup)
  let capture = false;
  const diag = [];
  const savedPages = [];   // komplette Seiten-HTMLs (für Debug-Download)
  function pageSlug(u) { try { return new URL(u, location.origin).pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'seite'; } catch { return 'seite'; } }
  function snapFrame(tag, url) {
    if (!capture) return;
    let d = null, accessible = true;
    try { d = theFrame().contentDocument; } catch { accessible = false; }
    try { if (d) savedPages.push({ slug: pageSlug(url), html: '<!-- ' + tag + ' ' + url + ' -->\n' + d.documentElement.outerHTML }); } catch {}
    const info = { tag, url, accessible, frameUrl: null, title: null, labels: 0, selItems: 0, labelFor: 0, bodyLen: 0, bodyHead: '' };
    try { info.frameUrl = theFrame().contentWindow && theFrame().contentWindow.location && theFrame().contentWindow.location.href; } catch { info.frameUrl = '«blockiert»'; }
    if (d) {
      try { info.title = d.title; } catch {}
      try { info.labels = d.querySelectorAll('label').length; } catch {}
      try { info.labelFor = d.querySelectorAll('label[for]').length; } catch {}
      try { info.selItems = d.querySelectorAll('.ant-select-selection-item').length; } catch {}
      try { const b = (d.body && d.body.innerText || '').trim(); info.bodyLen = b.length; info.bodyHead = b.slice(0, 160).replace(/\s+/g, ' '); } catch {}
      try { info.labelTexts = [...d.querySelectorAll('label')].map((l) => (l.textContent || '').trim()).filter(Boolean).slice(0, 30); } catch {}
      try { info.headings = [...d.querySelectorAll('h1,h2,h3')].map((h) => (h.textContent || '').trim()).filter(Boolean).slice(0, 20); } catch {}
      try {
        const ds = [];
        for (const lab of d.querySelectorAll('label')) {
          const key = (lab.textContent || '').trim().toLowerCase();
          if (!FIELD_BY_LABEL[key]) continue;
          ds.push({ label: (lab.textContent || '').trim(), wert: valueForLabel(lab), html: (lab.parentElement ? lab.parentElement.outerHTML : '').replace(/\s+/g, ' ').slice(0, 300) });
          if (ds.length >= 3) break;
        }
        info.detailSample = ds;
      } catch {}
    }
    diag.push(info);
    return info;
  }

  // offscreen-iframe scrollen, damit per IntersectionObserver lazy gemountete
  // Abschnitte (z.B. „Persönliche Details") tatsächlich rendern
  async function scrollFrameThrough() {
    try {
      const w = theFrame().contentWindow, d = theFrame().contentDocument;
      if (!w || !d) return;
      const h = Math.max(d.body ? d.body.scrollHeight : 0, 4000);
      for (let y = 0; y <= h; y += 500) { w.scrollTo(0, y); await sleep(120); }
      w.scrollTo(0, h); await sleep(300);
    } catch {}
  }
  async function readDisplayUrl(url) {
    await loadFrame(url);
    const t0 = now();
    let doc = null;
    const match = (d) => d && [...d.querySelectorAll('label')].some((l) => FIELD_BY_LABEL[(l.textContent || '').trim().toLowerCase()]);
    while (now() - t0 < 24000) {
      try { doc = theFrame().contentDocument; } catch { doc = null; }
      await scrollFrameThrough();          // lazy-Abschnitte erzwingen
      if (match(doc)) break;
      await sleep(400);
    }
    snapFrame('display', url);
    if (!doc) return {};
    // ZUERST lesen (vor jeglichem Klick), damit ein Klick, der die SPA
    // weiternavigiert, die bereits gelesenen Werte nicht zunichtemacht.
    let res = readDetailsFrom(doc);
    // „mehr anzeigen" nur über echte Buttons aufklappen (keine <a>/<span>,
    // die navigieren könnten), dann erneut lesen und ergänzen.
    try {
      for (let r = 0; r < 2; r++) {
        const more = [...doc.querySelectorAll('button,[role="button"]')].filter((b) => /mehr anzeigen|alle anzeigen|mehr details/i.test((b.textContent || '').trim()));
        if (!more.length) break;
        more.forEach((b) => { try { b.click(); } catch {} });
        await sleep(600);
        await scrollFrameThrough();
      }
      res = { ...res, ...readDetailsFrom(doc) };
    } catch (e) { warn('aufklappen', e); }
    return res;
  }
  const readProfileDetails = (nick) => readDisplayUrl(location.origin + '/p/' + encodeURIComponent(String(nick).toLowerCase()));

  // Sichtbarkeit (wio/state) für die offenen Profilbesuche
  async function setVisible(v) { try { await apiPost('wio/state', { value: v }); } catch (e) { warn('Sichtbarkeit', e); } }
  async function getVisible() { try { const d = await apiGet('wio/state'); const x = d && (d.value || d.state || d); return x === 'visible' ? 'visible' : x === 'invisible' ? 'invisible' : null; } catch { return null; } }

  // Eigenes Geo-Objekt (mit geo_id) für eine funktionierende Suche – nur geo_location, niemals E-Mail o.ä.
  async function myGeo() {
    const cached = G.get('mygeo', null);
    if (cached && cached.geo_id) return cached;
    try {
      const s = await apiGet('user/session/info');
      const loc = s && s.account && s.account.geo_location;
      if (loc && loc.geo_id) { const { distance, distance_unit, ...geo } = loc; G.set('mygeo', geo); return geo; }
    } catch (e) { warn('Geo', e); }
    return { country_iso: 'DE', country_name: 'Germany' };
  }
  // Eigener Nickname (aus session/info.account – nur der Nick, niemals E-Mail o.ä.)
  async function mySelf() {
    try { const s = await apiGet('user/session/info'); const a = (s && s.account) || {}; return a.nickname || a.nick || null; } catch (e) { warn('Eigener Nick', e); return null; }
  }

  // =====================================================================================
  // Badge oben + Status
  // =====================================================================================
  let badge = null, badgeTxt = null;
  function ensureBadge() {
    if (badge && badge.isConnected) return;
    const host = document.querySelector('header .dbbwwS') || document.querySelector('header [data-type="main-navigation"]') || document.querySelector('header') || document.body;
    badge = document.createElement('div');
    badge.id = 'opahelfer-badge';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:8px;background:#e53935;color:#fff;font:600 13px system-ui,sans-serif;padding:6px 12px;border-radius:999px;margin:0 8px;box-shadow:0 0 0 2px #fff3;cursor:default;z-index:2147483647';
    badge.innerHTML = '<span style="width:9px;height:9px;border-radius:50%;background:#fff;animation:ohblink 1s infinite"></span><span data-txt>Helfer läuft …</span>';
    const st = document.createElement('style'); st.textContent = '@keyframes ohblink{50%{opacity:.25}}'; document.head.appendChild(st);
    try { host.prepend(badge); } catch { host.appendChild(badge); }
    badgeTxt = badge.querySelector('[data-txt]');
  }
  function status(t) { ensureBadge(); if (badgeTxt) badgeTxt.textContent = t; log(t); }
  function badgeDone(t) { ensureBadge(); badge.style.background = '#2e7d32'; badge.querySelector('span').style.animation = 'none'; if (badgeTxt) badgeTxt.textContent = t; }

  // =====================================================================================
  // Ablauf
  // =====================================================================================
  function download(name, text) {
    const b = new Blob([text], { type: 'application/json' }); const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function stamp() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }

  // Suchkörper: alle Geschlechter, keine echten Filter. location wird separat
  // gesetzt (der funktionierende Suchraum wird zu Beginn ermittelt).
  function searchBody(loc, age) {
    return {
      location: loc, genders: ['m', 'w', 'ts', 'tv'], has_image: 0, online: false,
      enable_search_gender: false, enable_fakecheck_status: false,
      sort: ['last_riseup'], order: ['desc'], preference_conjunction: 'or', second_preference_conjunction: 'or',
      size_min: 130, size_max: 220, weight_min: 0, weight_max: 300, age_min: age, age_max: age,
    };
  }

  // Funktionierenden Suchraum ermitteln: mehrere location-Formate auf Alter 30
  // testen, erstes mit Treffern gewinnt. Nur geo_location (Stadt/geo_id), keine E-Mail.
  async function probeLocation() {
    let acc = {};
    try { const s = await apiGet('user/session/info'); acc = (s && s.account) || {}; } catch (e) { warn('session', e); }
    const gl = acc.geo_location || {};
    const city = gl.city || null;
    let geo = null;
    if (gl.geo_id) { const { distance, distance_unit, ...g } = gl; geo = g; }
    const variants = [];
    if (geo) variants.push(['geo_id', { ...geo, distance: 0, distance_unit: 'km' }]);
    if (city) variants.push(['city', { city }]);
    if (city) variants.push(['city+200km', { city, distance: 200, distance_unit: 'km' }]);
    variants.push(['country', { country_iso: 'DE', country_name: 'Germany', distance: 0, distance_unit: 'km' }]);
    variants.push(['null', null]);
    const probe = []; let chosen = null;
    for (const [name, loc] of variants) {
      let total = 0, n = 0, msg = null;
      try { const d = await apiPost('user/search', { ...searchBody(loc, 30), page: 1, limit: 30 }); total = (d && d.total) || 0; n = ((d && d.users) || []).length; }
      catch (e) { msg = String((e && e.message) || e); }
      probe.push({ name, total, n, msg });
      if (!chosen && (total > 0 || n > 0)) chosen = { name, loc };
      await sleep(300);
    }
    return { probe, chosen, city, hasGeoId: !!geo };
  }

  async function ageNinetyNine(phase, loc) {
    const result = { counts: {}, links: {} };
    for (const age of [97, 98, 99, 100, 101]) {
      phase('Alter-99-Suche: ' + age);
      let total = 0, links = [];
      try {
        const d = await apiPost('user/search', { ...searchBody(loc, age), page: 1, limit: 20 });
        total = d && d.total || 0;
        links = ((d && d.users) || []).slice(0, 3).map((u) => location.origin + '/p/' + encodeURIComponent(String(u.nickname || '').toLowerCase()));
      } catch (e) { warn('Suche ' + age, e); }
      result.counts[age] = total; result.links[age] = links;
      await sleep(400);
    }
    const c = result.counts;
    const sum = [97, 98, 99, 100, 101].reduce((a, k) => a + (c[k] || 0), 0);
    let verdict = 'unklar';
    if (sum === 0) {
      verdict = 'Suche lieferte keine Treffer (alle 0) – Ergebnis nicht verwertbar, Geo/Suche prüfen';
    } else if (c[99] != null) {
      const neighbours = [c[97], c[98]].filter((x) => x != null);
      const avgN = neighbours.length ? neighbours.reduce((a, b) => a + b, 0) / neighbours.length : 0;
      if ((c[100] || 0) === 0 && (c[101] || 0) === 0 && c[99] > avgN * 3 && c[99] > 20) verdict = '99 ist das Sammelalter „99+" (viele 99er, keine 100er/101er)';
      else if ((c[100] || 0) > 0 || (c[101] || 0) > 0 || c[99] <= avgN * 2) verdict = '99 ist ein echtes Alter (vergleichbar mit Nachbarjahrgängen bzw. es gibt 100er/101er)';
    }
    result.verdict = verdict;
    return result;
  }

  // trait nur dann zum Paaren brauchbar, wenn Einzelprofil (keine Paar-Arrays)
  function isSingleTrait(tr) {
    if (!tr) return false;
    if (Array.isArray(tr.age)) return false;
    return WANT.some((f) => tr[f] != null && !Array.isArray(tr[f]));
  }
  function scalarCode(tr, f) {
    if (!tr || tr[f] == null) return null;
    const v = tr[f];
    return Array.isArray(v) ? (v.find((x) => x != null && x !== 0) ?? null) : v;
  }
  // Eindeutiger Einzel-Code: Skalar, oder Array mit genau EINEM Nicht-Null-Wert
  // (Paare mit zwei belegten Werten je Feld sind mehrdeutig -> null -> überspringen).
  function singleCode(tr, f) {
    if (!tr || tr[f] == null) return null;
    const v = tr[f];
    if (!Array.isArray(v)) return v;
    const nz = v.filter((x) => x != null);
    return nz.length === 1 ? nz[0] : null;
  }
  const paarDiag = [];

  const mapCount = () => Object.values(mapping).reduce((a, m) => a + Object.keys(m).length, 0);

  // Voller Lauf: Werte über eine Alle-Geschlechter-Suche erfassen.
  // Alter 30, danach 31, 32 … bis nichts Neues mehr kommt.
  // ---------- Turbo: komplette Optionslisten + gezielte Code-Suche ----------
  // Manche Felder liefert user/login/option/list komplett auf einen Schlag.
  async function pullOptionLists(phase) {
    const out = {};
    for (const key of ['searching_interests', 'spoken_language', 'origin']) {
      phase('Optionsliste: ' + key);
      try { const d = await apiGet('user/login/option/list', { key }); if (d && typeof d === 'object' && !Array.isArray(d)) out[key] = d; } catch (e) { warn('option/list ' + key, e); }
      await sleep(150);
    }
    // „Suche nach" (searching_interests) hat echten Klartext → direkt ins Mapping
    if (out.searching_interests) { mapping.searching = { ...(mapping.searching || {}), ...out.searching_interests }; G.set('mapping', mapping); }
    return out;
  }
  // Suchfilter-Name je trait-Feld (meist = trait-Name; Ausnahmen hier)
  const SEARCH_FILTER = { sex_type: 'sexual_orientation' };
  function gendersForField(f) {
    if (f === 'tits') return ['w'];
    if (['beard', 'circumcised', 'dick_length', 'dick_width'].includes(f)) return ['m'];
    return ['m', 'w'];
  }
  // Ein Feld gezielt auflösen: pro Code eine Suche, einen passenden Einzel-Treffer verifizieren und paaren.
  async function resolveFieldTurbo(F, loc, phase) {
    const sf = SEARCH_FILTER[F] || F;
    const genders = gendersForField(F);
    let reads = 0, miss = 0;
    for (let code = 1; code <= 16 && miss < 4; code++) {
      if (mapping[F] && mapping[F][String(code)]) continue;            // schon bekannt
      phase(`Turbo: ${F} = ${code} · ${mapCount()} Werte`);
      let paired = false;
      for (const g of genders) {
        let d;
        try { d = await apiPost('user/search', { ...searchBody(loc, 0), genders: [g], [sf]: [code], age_min: 25, age_max: 70, page: 1, limit: 12 }); }
        catch (e) { warn('Turbo-Suche', e); continue; }
        for (const u of ((d && d.users) || []).slice(0, 6)) {
          const info = await userInfo(u.nickname); const tr = info && info.user_trait;
          noteTrait(tr); reads++;
          // nur verwenden, wenn der Code wirklich passt (schützt vor ignoriertem Filter) und Einzelprofil
          if (isSingleTrait(tr) && String(scalarCode(tr, F)) === String(code)) {
            const pg = await readProfileDetails(u.nickname).catch(() => ({}));
            // ALLE auf der Profilseite sichtbaren Felder paaren, nicht nur das Zielfeld –
            // so werden z.B. Raucher=Nein/Brille=Nein gratis aus denselben Profilen gelernt.
            for (const f of WANT) {
              const c = scalarCode(tr, f);
              if (c != null && String(c) !== '0' && pg[f]) addMap(f, String(c), pg[f]);
            }
            if (mapping[F] && mapping[F][String(code)]) paired = true;
            await sleep(500);
            if (paired) break;
          }
          await sleep(250);
        }
        if (paired) break;
        await sleep(250);
      }
      if (paired) miss = 0; else miss++;
    }
    return reads;
  }

  // ---------- Bearbeiten-Seite: Dropdown-Optionen direkt auslesen (schnellster, vollständiger Weg) ----------
  const PLACE = /^(bitte|keine angabe|beliebig|auswählen|wählen|—|-)/i;
  // Ein antd-Select öffnen, durchscrollen und aus der versteckten Listbox Code(=Text)+Klartext(=aria-label) lesen.
  async function readOneSelect(doc, win, lab) {
    const out = {};
    const item = lab.closest('.ant-form-item');
    const sel = item && item.querySelector('.ant-select');
    if (!sel) return out;
    const trigger = sel.querySelector('.ant-select-selector') || sel;
    try { trigger.scrollIntoView({ block: 'center' }); } catch {}
    for (const t of ['mousedown', 'mouseup']) { try { trigger.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: win })); } catch {} }
    try { trigger.click(); } catch {}
    await sleep(350);
    const dd = [...doc.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')].pop();
    if (dd) {
      // Virtualisierte antd-Liste: nur ein Fenster um den aktuellen Wert ist gerendert.
      // Deshalb explizit von ganz oben bis ganz unten durchscrollen und bei jedem Schritt einsammeln.
      const scroller = dd.querySelector('.rc-virtual-list-holder') || dd.querySelector('.ant-select-dropdown-list-holder') || dd;
      const collect = () => { for (const o of dd.querySelectorAll('[role="option"]')) { const code = (o.textContent || '').trim(); const label = (o.getAttribute('aria-label') || '').trim(); if (/^\d+$/.test(code) && label) out[code] = label; } };
      try { scroller.scrollTop = 0; } catch {}
      await sleep(70); collect();
      let stall = 0;
      for (let step = 0; step < 200 && stall < 4; step++) {
        const beforeN = Object.keys(out).length;
        const prevTop = scroller.scrollTop;
        const stepPx = Math.max(80, (scroller.clientHeight || 220) - 40);
        try { scroller.scrollTop = prevTop + stepPx; } catch {}
        try { scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: stepPx, bubbles: true, cancelable: true })); } catch {}
        await sleep(60); collect();
        const atEnd = (scroller.scrollHeight - scroller.scrollTop - (scroller.clientHeight || 0)) <= 2;
        const moved = scroller.scrollTop !== prevTop;
        if (!moved && Object.keys(out).length === beforeN) stall++; else stall = 0;
        if (atEnd) { await sleep(70); collect(); break; }
      }
      // zur Sicherheit auch das letzte sichtbare Option-Element in den Blick holen
      try { const opts = dd.querySelectorAll('[role="option"]'); if (opts.length) { opts[opts.length - 1].scrollIntoView({ block: 'end' }); await sleep(60); collect(); } } catch {}
    }
    // schließen
    try { trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); } catch {}
    try { doc.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } catch {}
    await sleep(120);
    return out;
  }
  // Alle Enum-Felder der Bearbeiten-Seite auslesen (label[for]=trait-Schlüssel).
  async function readEditDropdowns(url, phase) {
    await loadFrame(url);
    let doc = null; const t0 = now();
    while (now() - t0 < 22000) { try { doc = theFrame().contentDocument; } catch { doc = null; } await scrollFrameThrough(); if (doc && doc.querySelector('label[for]')) break; await sleep(400); }
    const diag = [];
    if (!doc) return diag;
    const win = theFrame().contentWindow;
    for (const F of WANT) {
      if (editReadDone.has(F)) continue;   // jedes Feld genau einmal von der Bearbeiten-Seite auslesen
      const lab = doc.querySelector('label[for="' + F + '"]');
      if (!lab) { diag.push({ f: F, gefunden: false }); continue; }   // nicht auf diesem Reiter -> nächster Reiter probiert erneut
      phase('Bearbeiten-Dropdown: ' + F);
      const opts = await readOneSelect(doc, win, lab).catch(() => ({}));
      let n = 0;
      for (const [code, label] of Object.entries(opts)) {
        if (code === '0' || PLACE.test(label)) continue;
        (seenCodes[F] = seenCodes[F] || new Set()).add(code);
        if (addMap(F, code, label)) n++;   // überschreibt auch vorhandene Labels mit dem exakten poppen-Text
      }
      editReadDone.add(F);
      diag.push({ f: F, gelesen: Object.keys(opts).length, neu: n });
    }
    return diag;
  }

  async function run() {
    ensureBadge(); G.set('started', now());
    status('Lese Bearbeiten-Dropdowns (schnellster, vollständiger Weg) …');

    await pullI18n(status).catch((e) => warn('i18n', e));
    await pullRelationship();
    const opt = await pullOptionLists(status);

    // 1) Bearbeiten-Seite(n): komplette Optionslisten aller Felder direkt auslesen
    const editDiag = [];
    for (const url of ['/setting/profile/personals', '/setting/profile/preferences', '/setting/profile/sexual']) {
      if (WANT.every((f) => editReadDone.has(f))) break;
      try { editDiag.push(...await readEditDropdowns(location.origin + url, status)); } catch (e) { warn('Edit-Dropdowns ' + url, e); }
    }

    // 2) Fallback-Turbo nur noch für Felder, die so nicht abgedeckt wurden
    status('Ermittle funktionierenden Suchraum (für Restfelder) …');
    const probeRes = await probeLocation();
    let read = 0, loc = probeRes.chosen && probeRes.chosen.loc;
    const rest = WANT.filter((f) => !(mapping[f] && Object.keys(mapping[f]).length));
    if (loc && rest.length) {
      status(`Fallback-Turbo für ${rest.length} Restfelder …`);
      const visBefore = await getVisible(); await setVisible('invisible'); await sleep(1500);
      for (const F of rest) read += await resolveFieldTurbo(F, loc, status);
      if (visBefore === 'visible') await setVisible('visible');
    }

    status('Untersuche Alter 99 …');
    const age99 = loc ? await ageNinetyNine(status, loc).catch(() => null) : null;

    const fertig = { version: VERSION, at: new Date().toISOString(), quelle: 'Bearbeiten-Dropdowns + Fallback', suchraum: probeRes.chosen && probeRes.chosen.name, profile_gelesen: read,
      werte: mapping, option_listen: opt, edit_diag: editDiag, beobachtete_codes: Object.fromEntries(Object.entries(seenCodes).map(([k, v]) => [k, [...v]])),
      offene_felder: unresolved(), alter_99: age99, such_probe: probeRes.probe, fehler: errors };
    download(`poppen-helfer-roh-${stamp()}.json`, JSON.stringify(Recorder.export(), null, 2));
    download(`poppen-helfer-zuordnung-${stamp()}.json`, JSON.stringify(fertig, null, 2));

    badgeDone(`Fertig – ${mapCount()} Werte`);
    status('Fertig. Roh-Aufnahme + Zuordnung heruntergeladen.');
    log('ALTER 99:', age99); log('EDIT-DIAG:', editDiag); log('ZUORDNUNG:', mapping);
  }
  // Felder ohne (ausreichende) Zuordnung – als grobe Abbruchbedingung fürs Durchgehen der Reiter
  const unresolvedOrEmpty = () => WANT.filter((f) => !(mapping[f] && Object.keys(mapping[f]).length >= 2));

  // Nur das eigene Profil auswerten (keine fremden Besuche, keine Unsichtbarkeit nötig)
  async function runOwn() {
    ensureBadge(); G.set('started', now());
    capture = true;   // Debug: Seiten-HTML + Diagnose nur im Eigen-Lauf sammeln
    status('Eigenes Profil – Werte holen …');
    await pullI18n(status).catch((e) => warn('i18n', e));
    await pullRelationship();
    const me = await mySelf();
    if (!me) { badgeDone('Eigenen Nick nicht gefunden'); status('Eigenen Nickname nicht gefunden – bist du eingeloggt?'); return; }
    status('Eigenes user/info …');
    const d = await userInfo(me);
    const tr = d && d.user_trait;
    noteTrait(tr);
    let paired = 0;
    if (tr) {
      // Beide Seiten über den bewährten Label-Text-Weg lesen (valueForLabel).
      // Bearbeiten-Seite ist am reichsten (figure, typ, tits, …), Profilanzeige
      // ergänzt Felder, die das Formular nicht hat.
      status('Eigene Bearbeiten-Seite lesen (/setting/profile/personals) …');
      const pEdit = await readDisplayUrl(location.origin + '/setting/profile/personals').catch(() => ({}));
      status('Eigene Profilanzeige lesen (/p/…) …');
      const pDisp = await readProfileDetails(me).catch(() => ({}));
      const page = { ...pEdit, ...pDisp };   // Anzeige-Labels bevorzugt, wo beide
      for (const f of WANT) {
        const code = scalarCode(tr, f); const label = page[f];
        if (code != null && label) if (addMap(f, code, label)) paired++;
      }
      log('eigene Seiten-Labels:', page);
    }
    log('DIAGNOSE Seiten:', diag);
    // komplette Seiten als HTML sichern (damit sich Fehler offline nachvollziehen lassen)
    savedPages.forEach((p, i) => download(`poppen-helfer-seite-${i + 1}-${p.slug}-${stamp()}.html`, p.html));
    const fertig = { version: VERSION, at: new Date().toISOString(), quelle: 'eigenes Profil', neu_gepaart: paired,
      werte: mapping, beobachtete_codes: Object.fromEntries(Object.entries(seenCodes).map(([k, v]) => [k, [...v]])),
      offene_felder: unresolved(), diagnose: diag, fehler: errors };
    download(`poppen-helfer-roh-${stamp()}.json`, JSON.stringify(Recorder.export(), null, 2));
    download(`poppen-helfer-eigenes-${stamp()}.json`, JSON.stringify(fertig, null, 2));
    badgeDone(`Eigenes Profil fertig – ${paired} Werte gepaart`);
    status(`Fertig. ${paired} Werte gepaart. Zuordnung + ${savedPages.length} Seiten-HTML heruntergeladen.`);
    log('ZUORDNUNG (eigenes Profil):', mapping);
  }

  // Start-Auswahl: voller Lauf (Export fremder Profile) oder nur eigenes Profil
  function chooseMode() {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif';
      ov.innerHTML = `<div style="background:#1f1f1f;color:#e8e8e8;border-radius:16px;padding:22px;width:min(560px,94vw)">
        <h2 style="margin:0 0 6px;color:#fff;font-size:18px">Opa-Schutz Helfer</h2>
        <div style="color:#a6a6a6;margin:0 0 16px">Was soll der Helfer tun? Das Hauptscript sollte jetzt deaktiviert sein.</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button data-full style="text-align:left;background:#2a2a2a;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:10px;padding:12px 16px;cursor:pointer">
            <b style="color:#ffc21a">Voller Lauf (Turbo)</b><br><span style="color:#a6a6a6">Kein Import nötig. Liest die kompletten Dropdown-Optionen deiner Bearbeiten-Seite direkt aus (alle Felder, auch seltene Werte) – praktisch ohne Profilbesuche. Rest per gezielter Suche. Außerdem Alter-99-Prüfung.</span></button>
          <button data-self style="text-align:left;background:#2a2a2a;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:10px;padding:12px 16px;cursor:pointer">
            <b style="color:#ffc21a">Nur eigenes Profil</b><br><span style="color:#a6a6a6">Nur die Werte des eigenen Profils holen – keine fremden Besuche, keine Unsichtbarkeit. Gedacht als Ergänzung zum vollen Lauf im anderen Profil.</span></button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      ov.querySelector('[data-full]').addEventListener('click', () => { ov.remove(); resolve('full'); });
      ov.querySelector('[data-self]').addEventListener('click', () => { ov.remove(); resolve('self'); });
    });
  }

  async function start() {
    ensureBadge();
    const mode = await chooseMode();
    if (mode === 'self') await runOwn();
    else await run();
  }
  function onReady(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true }); else fn(); }
  onReady(() => { try { start(); } catch (e) { console.error('[Opa-Helfer]', e); } });
})();
