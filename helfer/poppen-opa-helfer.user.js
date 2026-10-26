// ==UserScript==
// @name         Poppen.de – Opa-Schutz Helfer (Werte-Erfassung)
// @namespace    local.visitor-age-filter.helfer
// @version      1.2.6
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
  const VERSION = '1.2.6';
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
  // Detail-Block der Profilanzeige: <label>Figur</label><div><div>Normal</div></div>
  // Klassennamen sind zufällig (styled-components) -> nur über den Label-Text gehen.
  function readDetailsFrom(doc) {
    const out = {};
    for (const lab of doc.querySelectorAll('label')) {
      const key = (lab.textContent || '').trim().toLowerCase();
      const field = FIELD_BY_LABEL[key];
      const v = lab.nextElementSibling;
      if (!field || !v) continue;
      const txt = (v.textContent || '').trim();
      if (txt) out[field] = txt;
    }
    return out;
  }
  // Diagnose, damit wir sehen, was eine Seite im iframe wirklich liefert
  const diag = [];
  function snapFrame(tag, url) {
    let d = null, accessible = true;
    try { d = theFrame().contentDocument; } catch { accessible = false; }
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
    // etwaige „mehr anzeigen"-Schalter aufklappen (auch mehrere / Paar-Abschnitt)
    for (let r = 0; r < 3; r++) {
      const more = [...doc.querySelectorAll('button,a,span')].filter((b) => /mehr anzeigen|alle anzeigen|mehr details/i.test((b.textContent || '').trim()));
      if (!more.length) break;
      more.forEach((b) => { try { b.click(); } catch {} });
      await sleep(600);
    }
    return readDetailsFrom(doc);
  }
  const readProfileDetails = (nick) => readDisplayUrl(location.origin + '/p/' + encodeURIComponent(String(nick).toLowerCase()));

  // Eigenes Profil: Bearbeiten-Seite /setting/profile/personals.
  // Dort ist das <label for="figure_name"> direkt der trait-Schlüssel und der
  // gewählte Wert steht in .ant-select-selection-item (antd-Klassen sind stabil).
  async function readOwnEditSelections() {
    await loadFrame(location.origin + '/setting/profile/personals');
    const t0 = now();
    let doc = null;
    const known = new Set(WANT.concat(['origin']));
    const selText = (lab) => {
      const item = lab.closest('.ant-form-item') || lab.parentElement;
      const s = item && item.querySelector('.ant-select-selection-item');
      return s ? (s.getAttribute('title') || s.textContent || '').trim() : '';
    };
    while (now() - t0 < 24000) {
      try { doc = theFrame().contentDocument; } catch { doc = null; }
      await scrollFrameThrough();
      if (doc) {
        const labs = [...doc.querySelectorAll('label[for]')].filter((l) => known.has(l.getAttribute('for')));
        if (labs.length && labs.some((l) => selText(l))) break;   // Werte sind hydriert
      }
      await sleep(400);
    }
    snapFrame('edit', location.origin + '/setting/profile/personals');
    const out = {};
    if (!doc) return out;
    for (const lab of doc.querySelectorAll('label[for]')) {
      const f = lab.getAttribute('for');
      if (!WANT.includes(f)) continue;
      const t = selText(lab);
      if (t) out[f] = t;
    }
    return out;
  }

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
  // Export-Abfrage (Datenexport des Hauptscripts)
  // =====================================================================================
  function askExport() {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;font:14px system-ui,sans-serif';
      ov.innerHTML = `<div style="background:#1f1f1f;color:#e8e8e8;border-radius:16px;padding:22px;width:min(640px,94vw)">
        <h2 style="margin:0 0 6px;color:#fff;font-size:18px">Opa-Schutz Helfer</h2>
        <div style="color:#a6a6a6;margin:0 0 12px">Füge hier den <b>Datenexport des Hauptscripts</b> ein (Opa-Schutz → „Alle Daten sichern"). Daraus nehme ich die bekannten Profile. Das Hauptscript sollte jetzt deaktiviert sein.</div>
        <textarea data-in style="width:100%;height:180px;background:#141414;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:10px;padding:10px;box-sizing:border-box;font-family:monospace"></textarea>
        <div style="color:#ff8a80;min-height:18px;margin:6px 0" data-err></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">
          <button data-file style="background:#2a2a2a;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:10px;padding:9px 16px;cursor:pointer">Datei wählen …</button>
          <button data-go style="background:#ffc21a;color:#1a1a1a;border:0;border-radius:10px;padding:9px 18px;font-weight:600;cursor:pointer">Start</button>
        </div>
        <input data-f type="file" accept=".json,application/json" style="display:none">
      </div>`;
      document.body.appendChild(ov);
      const ta = ov.querySelector('[data-in]'), err = ov.querySelector('[data-err]'), f = ov.querySelector('[data-f]');
      ov.querySelector('[data-file]').addEventListener('click', () => f.click());
      f.addEventListener('change', () => { const file = f.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { ta.value = r.result; }; r.readAsText(file); });
      ov.querySelector('[data-go]').addEventListener('click', () => {
        const nicks = extractNicks(ta.value);
        if (!nicks.length) { err.textContent = 'Keine Profile im Export gefunden. Bitte den kompletten Export einfügen.'; return; }
        ov.remove(); resolve(nicks);
      });
    });
  }
  function extractNicks(text) {
    let nicks = [];
    try {
      const j = JSON.parse(text);
      const walk = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) { o.forEach(walk); return; }
        const n = o.nick || o.nickname; if (typeof n === 'string' && /^[^*\s]{2,}$/.test(n)) nicks.push(n);
        for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
      };
      walk(j);
    } catch {
      nicks = (text.match(/"nick(?:name)?"\s*:\s*"([^"*][^"]*)"/g) || []).map((s) => s.replace(/.*:"|"$/g, ''));
    }
    return uniq(nicks.filter((n) => n && !/\*/.test(n)));
  }

  // =====================================================================================
  // Ablauf
  // =====================================================================================
  function download(name, text) {
    const b = new Blob([text], { type: 'application/json' }); const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function stamp() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }

  async function ageNinetyNine(phase) {
    const result = { counts: {}, links: {} };
    const geo = await myGeo();
    result.geo = { city: geo.city || '', geo_id: geo.geo_id || null };
    const base = { location: { ...geo, distance: 0, distance_unit: 'km' }, has_image: 0, online: false,
      enable_search_gender: false, size_min: 130, size_max: 220, weight_min: 0, weight_max: 300, enable_fakecheck_status: false,
      sort: ['last_riseup'], order: ['desc'], preference_conjunction: 'or', second_preference_conjunction: 'or', genders: ['m', 'w', 'ts', 'tv'] };
    for (const age of [97, 98, 99, 100, 101]) {
      phase('Alter-99-Suche: ' + age);
      let total = 0, links = [];
      try {
        const d = await apiPost('user/search', { ...base, age_min: age, age_max: age, page: 1, limit: 20 });
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

  async function run() {
    const nicks = await askExport();
    ensureBadge();
    G.set('started', now());
    status(`Start – ${nicks.length} Profile`);

    // 1) i18n + Beziehungsstatus (Labels für die meisten Felder NICHT enthalten – nur als Bonus)
    status('Werte aus i18n ziehen …');
    await pullI18n(status).catch((e) => warn('i18n', e));
    await pullRelationship();

    // Trait je Nick zwischenspeichern, damit Durchgang B user/info nicht erneut braucht
    const traitByNick = new Map();

    // 2a) Verborgener Durchgang: user/info für alle (billig), Code-Universum vollständig erfassen
    let gathered = 0, noNewCode = 0;
    for (const nick of nicks) {
      if (noNewCode >= 150) { status('Keine neuen Codes mehr – Sammeln beendet.'); break; }
      if (gathered >= 400) { status('400 Profile gesammelt – Sammeln beendet.'); break; }
      gathered++;
      status(`Codes sammeln ${gathered}: ${nick} – ${seenCodeCount()} Codes bekannt`);
      const d = await userInfo(nick);
      const tr = d && d.user_trait;
      if (tr) traitByNick.set(nick, tr);
      const before = seenCodeCount();
      noteTrait(tr);
      if (seenCodeCount() > before) noNewCode = 0; else noNewCode++;
      await sleep(180);
    }

    // 2b) Offener Durchgang: Labels gibt es nur auf der Profilseite -> unsichtbar + Seite lesen
    let visBefore = null, read = 0, noNew = 0, open = false;
    const need0 = unresolved();
    if (need0.length) {
      status(`Schalte unsichtbar für offene Profilbesuche (${need0.length} Felder ohne Klartext) …`);
      visBefore = await getVisible(); await setVisible('invisible'); await sleep(1500); open = true;
      for (const nick of nicks) {
        if (unresolved().length === 0) { status('Alle gesuchten Werte erfasst.'); break; }
        if (noNew >= 300) { status('300 Profile ohne neuen Klartext – Stopp.'); break; }
        read++;
        status(`Profil (offen) ${read}: ${nick} – ${unresolved().length} Felder offen`);
        let tr = traitByNick.get(nick);
        if (!tr) { const d = await userInfo(nick); tr = d && d.user_trait; }
        const needLabels = unresolved();
        let newHere = false;
        // nur Einzelprofile zum Paaren nutzen (Paar-Arrays sind mehrdeutig)
        if (isSingleTrait(tr) && needLabels.length) {
          const page = await readProfileDetails(nick).catch(() => ({}));
          for (const f of needLabels) {
            const code = scalarCode(tr, f);
            const label = page[f];
            if (code != null && label) if (addMap(f, code, label)) newHere = true;
          }
        }
        if (newHere) noNew = 0; else noNew++;
        await sleep(800);
      }
      if (visBefore === 'visible') { status('Stelle Sichtbarkeit wieder her …'); await setVisible('visible'); }
    }

    // 3) Alter 99
    status('Untersuche Alter 99 …');
    const age99 = await ageNinetyNine(status).catch((e) => { warn('Alter99', e); return null; });

    // 4) Export
    const fertig = { version: VERSION, at: new Date().toISOString(), profile_gesammelt: gathered, profile_offen_gelesen: read,
      werte: mapping, beobachtete_codes: Object.fromEntries(Object.entries(seenCodes).map(([k, v]) => [k, [...v]])),
      offene_felder: unresolved(), alter_99: age99 };
    download(`poppen-helfer-roh-${stamp()}.json`, JSON.stringify(Recorder.export(), null, 2));
    download(`poppen-helfer-zuordnung-${stamp()}.json`, JSON.stringify(fertig, null, 2));

    const u = unresolved();
    badgeDone(u.length ? `Fertig – ${u.length} Felder noch offen (im 2. Profil wiederholen)` : 'Fertig – alle Werte erfasst');
    status('Fertig. Zwei Dateien wurden heruntergeladen (Roh-Aufnahme + fertige Zuordnung).');
    log('ALTER 99:', age99);
    log('ZUORDNUNG:', mapping);
    if (u.length) log('Noch offen:', u, '– bitte den Helfer auch im anderen Profil laufen lassen.');
  }

  // Nur das eigene Profil auswerten (keine fremden Besuche, keine Unsichtbarkeit nötig)
  async function runOwn() {
    ensureBadge(); G.set('started', now());
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
      status('Eigene Profilanzeige lesen (/setting/profile) …');
      const dispOwner = await readDisplayUrl(location.origin + '/setting/profile').catch(() => ({}));
      status('Eigene Bearbeiten-Seite lesen (/setting/profile/personals) …');
      const edit = await readOwnEditSelections().catch(() => ({}));
      let page = { ...edit, ...dispOwner };   // Anzeige-Labels bevorzugt
      if (!Object.keys(page).length) { status('Fallback: öffentliches eigenes Profil lesen …'); page = await readProfileDetails(me).catch(() => ({})); }
      for (const f of WANT) {
        const code = scalarCode(tr, f); const label = page[f];
        if (code != null && label) if (addMap(f, code, label)) paired++;
      }
      log('eigene Seiten-Labels:', page);
    }
    log('DIAGNOSE Seiten:', diag);
    const fertig = { version: VERSION, at: new Date().toISOString(), quelle: 'eigenes Profil', neu_gepaart: paired,
      werte: mapping, beobachtete_codes: Object.fromEntries(Object.entries(seenCodes).map(([k, v]) => [k, [...v]])),
      offene_felder: unresolved(), diagnose: diag };
    download(`poppen-helfer-roh-${stamp()}.json`, JSON.stringify(Recorder.export(), null, 2));
    download(`poppen-helfer-eigenes-${stamp()}.json`, JSON.stringify(fertig, null, 2));
    badgeDone(`Eigenes Profil fertig – ${paired} Werte gepaart`);
    status('Fertig. Zuordnung aus dem eigenen Profil wurde heruntergeladen.');
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
            <b style="color:#ffc21a">Voller Lauf</b><br><span style="color:#a6a6a6">Datenexport des Hauptscripts einlesen und fremde Profile besuchen (unsichtbar), bis alle Werte erfasst sind. Außerdem Alter-99-Prüfung.</span></button>
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
