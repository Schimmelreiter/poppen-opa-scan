// ==UserScript==
// @name         Poppen.de – Besucher nach Alter ignorieren
// @namespace    local.visitor-age-filter
// @version      2.13
// @description  Opa-Schutz für poppen.de: erkennt Mitglieder über einer Altersgrenze (Besucher, Likes, Sticker, Nachrichten, Gruppen, Mitgliedersuche) und blockiert sie in Etappen. Dazu Fickliste, Figur-Badges, Gruppen-Whitelist und mehr.
// @homepageURL  https://github.com/Schimmelreiter/poppen-opa-scan
// @supportURL   https://github.com/Schimmelreiter/poppen-opa-scan/issues
// @updateURL    https://raw.githubusercontent.com/Schimmelreiter/poppen-opa-scan/main/poppen-opa-schutz.user.js
// @downloadURL  https://raw.githubusercontent.com/Schimmelreiter/poppen-opa-scan/main/poppen-opa-schutz.user.js
// @match        https://www.poppen.de/*
// @match        https://www.joyclub.de/*
// @match        https://schimmelreiter.github.io/joyclub-opa-scan/briefkasten.html*
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzAiIGZpbGw9IiMyYjJiMmIiIHN0cm9rZT0iI2U1MzkzNSIgc3Ryb2tlLXdpZHRoPSI1Ii8+PHRleHQgeD0iMzIiIHk9IjQxIiBmb250LWZhbWlseT0iQXJpYWwsSGVsdmV0aWNhLHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMjUiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSIjZmZmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj41MCs8L3RleHQ+PGxpbmUgeDE9IjEyIiB5MT0iNTIiIHgyPSI1MiIgeTI9IjEyIiBzdHJva2U9IiNlNTM5MzUiIHN0cm9rZS13aWR0aD0iNiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      poppen.de
// @connect      img-z.poppen.de
// @connect      schimmelreiter.github.io
// @sandbox      JavaScript
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';
  const VERSION = '2.13';
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  const IN_FRAME = W.top !== W;
  const HOST = location.hostname;
  const ON_POPPEN = /(^|\.)poppen\.de$/.test(HOST) && !IN_FRAME;    // volle Funktion nur auf poppen.de (kein iframe)

  // =====================================================================================
  // Hilfsfunktionen
  // =====================================================================================
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  async function sha256hex(str) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(str))); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const deDate = (d) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  const deTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const deDateTime = (ts) => { const d = new Date(ts); return `${deDate(d)} ${deTime(d)}`; };
  const DAY = 86400000;
  const now = () => Date.now();
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const uniq = (a) => [...new Set(a)];
  const plural = (n, one, many) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
  const fmtN = (n) => Number(n || 0).toLocaleString('de-DE');
  const log = (...a) => console.log('[Opa-Schutz]', ...a);
  const warn = (...a) => console.warn('[Opa-Schutz]', ...a);

  async function waitFor(fn, timeout = 10000, step = 250) {
    const t0 = now();
    while (now() - t0 < timeout) {
      let r = null;
      try { r = fn(); } catch { r = null; }
      if (r) return r;
      await sleep(step);
    }
    return null;
  }
  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }
  const isVisible = (e) => !!e && e.isConnected && e.getClientRects().length > 0;

  // Profilpfad <-> Benutzername: /p/<name in Kleinbuchstaben, URL-kodiert>
  const slugOf = (path) => { try { return decodeURIComponent(String(path).replace(/^\/p\//, '').replace(/\/.*$/, '')).toLowerCase(); } catch { return String(path).toLowerCase(); } };
  const pathOfName = (name) => '/p/' + encodeURIComponent(String(name).trim().toLowerCase());
  const profileUrl = (name) => location.origin + pathOfName(name);

  // Benutzer-ID aus einer Profilbild-Adresse: …/fsk16/B/D/4/8194027-BD4B…_350_sq.jpg
  function uidFromAvatar(src) {
    const m = /\/(\d{3,10})-[0-9A-F]{16,}/i.exec(String(src || ''));
    return m ? m[1] : '';
  }
  const isPlaceholderAvatar = (src) => !src || /image_null_|avatar-[\w-]+\.[\w]+\.svg|avatar-(man|woman|couple|female|male)|plc-images|plcblur|\/v2-static\//i.test(src);

  // Alter aus "Mann · 48 Jahre · 15 km" (Paare: "45/42 Jahre", "45 & 42 Jahre" …)
  function agesFromText(text) {
    const re = /\b(1[89]|[2-9]\d)\b(?=(?:\s*(?:\/|&|\+|und|,|\||·)\s*(?:1[89]|[2-9]\d)\b)*\s*Jahre)/gi;
    const out = [];
    let m;
    while ((m = re.exec(text || '')) && out.length < 2) out.push(Number(m[1]));
    return out;
  }
  const TYPE_WORDS = { mann: 'm', frau: 'w', paar: 'p', trans: 'ts', 'nicht-binär': 'tv', 'nicht binär': 'tv', 'non-binary': 'tv', transvestit: 'tv' };
  function genderFromText(text) {
    const t = norm(String(text || '').split('·')[0]);
    if (TYPE_WORDS[t]) return t === 'paar' ? ['w', 'm'] : [TYPE_WORDS[t]];
    if (/paar/.test(t)) return ['w', 'm'];
    return [];
  }

  // Datei herunterladen
  function download(name, text, type = 'application/json') {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  function pickFile(accept = '.json,application/json') {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept;
      inp.onchange = async () => { const f = inp.files && inp.files[0]; resolve(f ? await f.text() : null); };
      inp.click();
    });
  }
  const stamp = () => { const d = new Date(); return `${isoDay(d)}_${pad2(d.getHours())}${pad2(d.getMinutes())}`; };

  // Schlanker Ereignis-Bus innerhalb des Tabs
  const Bus = (() => {
    const map = new Map();
    return {
      on(ev, fn) { if (!map.has(ev)) map.set(ev, new Set()); map.get(ev).add(fn); return () => map.get(ev).delete(fn); },
      emit(ev, data) { (map.get(ev) || []).forEach((fn) => { try { fn(data); } catch (e) { warn(ev, e); } }); },
    };
  })();

  // Tab-Kennung (bleibt beim Seitenwechsel im selben Tab erhalten)
  const TAB_ID = (() => {
    try {
      const m = /(?:^|;)vaf:([a-z0-9]+)/.exec(W.name || '');
      if (m) return m[1];
      const id = Math.random().toString(36).slice(2, 10);
      W.name = (W.name ? W.name + ';' : '') + 'vaf:' + id;
      return id;
    } catch { return Math.random().toString(36).slice(2, 10); }
  })();

  // SVG-Symbol aus Pfaddaten
  const svgIcon = (inner, vb = '0 0 24 24', extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="${vb}" fill="currentColor" ${extra}>${inner}</svg>`;

  // =====================================================================================
  // Einstellungen (Quelltext-Werte). Auf der Seite „Opa-Schutz“ änderbar; dort geänderte Werte
  // gelten, solange der Quelltext-Wert unverändert bleibt.
  // =====================================================================================
  const SRC_KEYS = ['interaktionen', 'besucher', 'party', 'gruppen', 'suche'];
  const SOURCES = {
    interaktionen: { label: 'Interaktionen', avail: true, tip: 'Mitglieder, die dir ein Like, einen Sticker oder eine Nachricht geschickt haben' },
    besucher: { label: 'Profilbesucher', avail: true, tip: 'Mitglieder, die dein Profil besucht haben' },
    party: { label: 'Partygäste', avail: false, tip: 'Mitglieder, die auf denselben Partys angemeldet sind wie du (gibt es auf poppen.de nicht)' },
    gruppen: { label: 'Gruppen', avail: true, tip: 'Mitglieder deiner Gruppen' },
    suche: { label: 'Mitgliedersuche', avail: true, tip: 'Alle poppen.de-Mitglieder, die auf die Einstellungen passen' },
  };
  // Quelle in der Notiz → Spalte der Altersgrenzen
  const NOTE_SOURCES = {
    Likes: 'interaktionen', Sticker: 'interaktionen', Nachrichten: 'interaktionen', Interaktionen: 'interaktionen',
    Besucher: 'besucher', Profilbesucher: 'besucher', Gruppen: 'gruppen', Suche: 'suche', Mitgliedersuche: 'suche',
    Vorgemerkt: 'suche', Sync: 'sync', Profil: 'besucher', Warteliste: 'suche',
  };
  const ages3 = (a, b, c) => ({ interaktionen: [a, b, c], besucher: [a, b, c], party: [a, b, c], gruppen: [a, b, c], suche: [a, b, c] });

  const DEFAULTS = {
    groups: {
      m: { visual: true, ignore: true, types: ['m'], src: ages3(29, 48, 50),
        labels: ['Jungspund', 'Jungspunde', 'Mann', 'Männer', 'Opa', 'Opas'] },
      w: { visual: false, ignore: false, types: ['w'], src: ages3(29, 48, 50),
        labels: ['junge Frau', 'junge Frauen', 'Frau', 'Frauen', 'Oma', 'Omas'] },
      p: { visual: false, ignore: false, types: ['p'], separate: false, coupleMode: 'any',
        src: ages3(29, 48, 50), srcW: ages3(29, 48, 50), srcM: ages3(29, 48, 50),
        sugarDaddy: { on: false, gap: 15 }, sugarMom: { on: false, gap: 15 },
        labels: ['junges Paar', 'junge Paare', 'Paar', 'Paare', 'Geronto-Paar', 'Geronto-Paare'] },
    },
    warnYears: 1,                 // so viele Jahre vor „Ignorieren ab“: dunkelorange + vormerken
    watch: true,
    whitelist: {
      names: [{ n: 'Wildschwein_AC', g: '' }],
      groups: [],
      prefixes: ['Pop-MOD-'],
    },
    auto: { besucher: true, suche: true, interaktionen: true },   // auf der Seite automatisch auf die Warteliste
    autoLogin: true,
    autoLoginPauseMin: 30,
    maintenanceMin: 15,
    // Regeln für die automatische Annahme/Ablehnung von Gruppenanfragen: leer = aus.
    // Nicht im Quelltext hinterlegt; in den Experten-Einstellungen unter „Gruppenanfragen“ einzutragen.
    groupReq: { match: '', accept: [], reject: [], noPicNoType: false, photos: 6,
      fields: ['Geschlecht', 'Sexualität', 'Typ', 'Herkunft', 'Sprachen'] },
    groupScan: {},                // cms_id → false = beim Gruppen-Scan auslassen (Standard: alle)
    managedWhitelist: {},         // cms_id → false = Mitglieder NICHT whitelisten (Standard: whitelisten)
    expert: {
      debug: false,
      dryRun: false,
      firstScanMax: 1000,
      limit: 10000000,
      rank: ['interaktionen', 'besucher', 'party', 'gruppen', 'suche', 'sync'],
      writeNote: true,              // fest (nicht mehr einstellbar)
      noteRequired: true,           // fest: ohne Notiz keine Sperre (nicht mehr einstellbar)
      noteText: '{bezeichnung} ({quelle}) geblockt am {datum} um {uhrzeit}',
      pauseMin: 1,
      pauseMax: 3,
      bodyValidDays: 90,
      bodyUnknownDays: 30,
      groupGraceDays: 30,
      recorder: false,
      evil: [],                     // „Besonders böse Popsters“: User-IDs oder Nicknames, je Zeile einer
    },
  };

  // ---------- flach ↔ verschachtelt ----------
  function flatten(o, pre = '', out = {}) {
    for (const [k, v] of Object.entries(o)) {
      const p = pre ? pre + '.' + k : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) flatten(v, p, out);
      else out[p] = v;
    }
    return out;
  }
  function getPath(o, p) { return p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o); }
  function setPath(o, p, v) {
    const ks = p.split('.'); let x = o;
    for (let i = 0; i < ks.length - 1; i++) { if (x[ks[i]] == null || typeof x[ks[i]] !== 'object') x[ks[i]] = {}; x = x[ks[i]]; }
    x[ks[ks.length - 1]] = v;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const K_SETTINGS = 'vaf2_settings';      // { path: { v, src } }  nur Abweichungen vom Quelltext
  let SETTINGS = null;

  function loadSettings() {
    const stored = GM_getValue(K_SETTINGS, {}) || {};
    const s = clone(DEFAULTS);
    const flatDef = flatten(DEFAULTS);
    for (const [p, e] of Object.entries(stored)) {
      if (!e || typeof e !== 'object' || !('v' in e)) continue;
      const def = p in flatDef ? flatDef[p] : getPath(DEFAULTS, p);
      // Quelltext geändert → der neue Quelltext-Wert gilt
      // 2.1: Pop-MOD-Klarsinn aus dem Quelltext entfernt (über das Präfix „Pop-MOD-“ abgedeckt) – eigene Namen bleiben
      if (p === 'whitelist.names' && Array.isArray(e.v) && Array.isArray(e.src)) {
        const drop = (a) => a.filter((x) => (x && x.n) !== 'Pop-MOD-Klarsinn');
        if (same(def, drop(e.src))) { setPath(s, p, clone(drop(e.v))); continue; }
      }
      if (def !== undefined && !same(def, e.src)) continue;
      setPath(s, p, clone(e.v));
    }
    normalizeSettings(s);
    SETTINGS = s;
    return s;
  }
  // Feste Werte und Kopplungen, die auf der Seite nicht (mehr) einstellbar sind
  function normalizeSettings(s) {
    // Notiz: immer schreiben, Pflicht, fester Text
    s.expert.writeNote = true;
    s.expert.noteRequired = true;
    s.expert.noteText = DEFAULTS.expert.noteText;
    // Partygäste (gibt es auf poppen.de nicht, ausgeblendet) = Profilbesucher
    for (const k of Object.keys(s.groups || {})) {
      const g = s.groups[k];
      for (const key of ['src', 'srcW', 'srcM']) if (g[key] && g[key].besucher) g[key].party = [...g[key].besucher];
    }
    return s;
  }
  // Ganze Einstellungen speichern: nur Abweichungen vom Quelltext werden abgelegt
  function saveSettings(s) {
    s = normalizeSettings(clone(s));
    const flat = flatten(s);
    const flatDef = flatten(DEFAULTS);
    const out = {};
    const paths = new Set([...Object.keys(flat), ...Object.keys(flatDef)]);
    // Container ohne Unterschlüssel (z. B. groupScan = {}) als Ganzes vergleichen
    for (const p of paths) {
      const v = p in flat ? flat[p] : getPath(s, p);
      const def = p in flatDef ? flatDef[p] : getPath(DEFAULTS, p);
      if (!same(v, def)) out[p] = { v: clone(v), src: clone(def) };
    }
    GM_setValue(K_SETTINGS, out);
    SETTINGS = clone(s);
    Bus.emit('settings', SETTINGS);
  }
  const S = () => SETTINGS || loadSettings();
  // Weicht ein Wert vom Quelltext ab?
  const deviates = (path, s = S()) => !same(getPath(s, path), getPath(DEFAULTS, path));

  // Schalter „Opa-Schutz“ im Profil-Menü (Automatik an/aus)
  const K_ON = 'vaf2_on';
  const isOn = () => GM_getValue(K_ON, true) !== false;
  const setOn = (v) => { GM_setValue(K_ON, !!v); Bus.emit('on', !!v); };
  const dry = () => !!S().expert.dryRun;

  // =====================================================================================
  // Speicher
  //  - Kleine Daten (Einstellungen, Zustände, Sperren der Tabs): Tampermonkey-Speicher
  //  - Gesamtliste aller Mitglieder, Bilder, Profil-Archiv, Warteliste, Fickliste, Rekorder:
  //    Datenbank des Browsers (IndexedDB) – jeder Eintrag wird einzeln gelesen/geschrieben.
  // =====================================================================================
  const DB_NAME = 'opa-schutz';
  const DB_VER = 1;
  const STORES = {
    members: { keyPath: 'uid', indexes: [['nl', 'nl']] },
    images: { keyPath: 'uid' },
    archive: { keyPath: 'id', autoIncrement: true, indexes: [['uid', 'uid']] },
    queue: { keyPath: 'uid' },
    fick: { keyPath: 'id' },
    kv: { keyPath: 'k' },
  };
  let dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise((resolve, reject) => {
      const rq = W.indexedDB.open(DB_NAME, DB_VER);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        for (const [name, def] of Object.entries(STORES)) {
          if (d.objectStoreNames.contains(name)) continue;
          const st = d.createObjectStore(name, { keyPath: def.keyPath, autoIncrement: !!def.autoIncrement });
          for (const [iname, kp] of def.indexes || []) st.createIndex(iname, kp, { unique: false });
        }
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    return dbP;
  }
  const reqP = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  async function tx(store, mode = 'readonly') { return (await db()).transaction(store, mode).objectStore(store); }
  const DB = {
    async get(store, key) { return reqP((await tx(store)).get(key)); },
    async put(store, val) { return reqP((await tx(store, 'readwrite')).put(val)); },
    async del(store, key) { return reqP((await tx(store, 'readwrite')).delete(key)); },
    async clear(store) { return reqP((await tx(store, 'readwrite')).clear()); },
    async all(store) { return reqP((await tx(store)).getAll()); },
    async keys(store) { return reqP((await tx(store)).getAllKeys()); },
    async count(store) { return reqP((await tx(store)).count()); },
    async byIndex(store, index, key) { return reqP((await tx(store)).index(index).getAll(key)); },
    async putMany(store, vals) {
      if (!vals.length) return;
      const d = await db();
      await new Promise((res, rej) => {
        const t = d.transaction(store, 'readwrite');
        const st = t.objectStore(store);
        for (const v of vals) st.put(v);
        t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    },
    async delMany(store, keys) {
      if (!keys.length) return;
      const d = await db();
      await new Promise((res, rej) => {
        const t = d.transaction(store, 'readwrite');
        const st = t.objectStore(store);
        for (const k of keys) st.delete(k);
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
    },
    // Alle Einträge durchgehen, ohne alles auf einmal in den Speicher zu laden
    async each(store, fn) {
      const d = await db();
      await new Promise((res, rej) => {
        const rq = d.transaction(store).objectStore(store).openCursor();
        rq.onsuccess = () => { const c = rq.result; if (!c) return res(); try { fn(c.value); } catch (e) { warn(e); } c.continue(); };
        rq.onerror = () => rej(rq.error);
      });
    },
  };
  const KV = {
    async get(k, def = null) { const r = await DB.get('kv', k); return r ? r.v : def; },
    async set(k, v) { await DB.put('kv', { k, v }); chan.post({ t: 'kv', k }); },
  };

  // ---------- Tab-übergreifende Benachrichtigung ----------
  const chan = (() => {
    let bc = null;
    try { bc = new BroadcastChannel('opa-schutz'); } catch {}
    const h = new Set();
    if (bc) bc.onmessage = (e) => h.forEach((f) => { try { f(e.data); } catch {} });
    return { post(m) { try { bc && bc.postMessage(m); } catch {} }, on(f) { h.add(f); } };
  })();

  // ---------- Mitglieder-Gesamtliste mit Zwischenspeicher ----------
  // Ein Eintrag je Mitglied (Schlüssel: Benutzer-ID). Änderungen werden gesammelt und etwa
  // alle 2 Sekunden auf einmal geschrieben, beim Verlassen der Seite sofort.
  //   { uid, nick, nl, nicks[], g[], ages[], ageAt, birth[{lo,hi}], by[], zod[], pay, avatar, img,
  //     first, last, seen{Quelle: ts}, body[{h,wlo,whi,at}], bodyUnk, blk{at,src,note,opa}, unblk,
  //     auto{admin, friend, grp{cms:ts}, gone}, friend, friendAt, del, city }
  const Members = (() => {
    const cache = new Map();
    const dirty = new Set();
    let timer = null;
    chan.on((m) => { if (m && m.t === 'm') for (const u of m.u) cache.delete(u); });
    async function flush() {
      timer = null;
      if (!dirty.size) return;
      const ids = [...dirty]; dirty.clear();
      const vals = ids.map((u) => cache.get(u)).filter(Boolean);
      try { await DB.putMany('members', vals); chan.post({ t: 'm', u: ids }); }
      catch (e) { warn('Speichern fehlgeschlagen', e); ids.forEach((u) => dirty.add(u)); }
    }
    W.addEventListener('pagehide', () => { flush(); });
    const sched = () => { if (!timer) timer = setTimeout(flush, 2000); };
    return {
      async get(uid) {
        uid = String(uid);
        if (cache.has(uid)) return cache.get(uid);
        const m = await DB.get('members', uid);
        if (m) cache.set(uid, m);
        return m || null;
      },
      async byNick(nick) {
        const l = norm(nick);
        for (const m of cache.values()) if (m.nl === l) return m;
        const r = await DB.byIndex('members', 'nl', l);
        if (!r.length) return null;
        r.sort((a, b) => (b.last || 0) - (a.last || 0));
        cache.set(r[0].uid, r[0]);
        return r[0];
      },
      // Eintrag ändern: fn(m) bekommt den (ggf. neuen) Eintrag und ändert ihn
      async update(uid, fn) {
        uid = String(uid);
        if (!uid || uid === 'undefined') return null;
        const m = (await this.get(uid)) || { uid, first: now() };
        fn(m);
        if (m.nick) m.nl = norm(m.nick);
        cache.set(uid, m);
        dirty.add(uid); sched();
        return m;
      },
      put(m) { cache.set(m.uid, m); dirty.add(m.uid); sched(); },
      flush,
      cached: () => cache,
      async all() { await flush(); return DB.all('members'); },
      async each(fn) { await flush(); return DB.each('members', fn); },
      async count() { await flush(); return DB.count('members'); },
    };
  })();

  // ---------- Tab-Sperre: nur ein Tab arbeitet an einer Aufgabe ----------
  const Lock = (() => {
    const STALE = 30000;
    const key = (what) => 'vaf2_lock_' + what;
    const held = new Set();
    setInterval(() => {
      for (const w of held) {
        const l = GM_getValue(key(w), null);
        if (l && l.tab === TAB_ID) GM_setValue(key(w), { ...l, ts: now() });
        else held.delete(w);
      }
    }, 5000);
    return {
      async take(what, info = '') {
        const l = GM_getValue(key(what), null);
        if (l && l.tab !== TAB_ID && now() - l.ts < STALE) return false;
        GM_setValue(key(what), { tab: TAB_ID, ts: now(), info, page: location.pathname });
        await sleep(200 + Math.random() * 300);
        const l2 = GM_getValue(key(what), null);
        if (l2 && l2.tab === TAB_ID) { held.add(what); return true; }
        return false;
      },
      release(what) { const l = GM_getValue(key(what), null); if (l && l.tab === TAB_ID) GM_deleteValue(key(what)); held.delete(what); },
      other(what) { const l = GM_getValue(key(what), null); return l && l.tab !== TAB_ID && now() - l.ts < STALE ? l : null; },
    };
  })();
  W.addEventListener('pagehide', () => { try { for (const k of GM_listValues()) if (k.startsWith('vaf2_lock_')) { const l = GM_getValue(k, null); if (l && l.tab === TAB_ID) GM_deleteValue(k); } } catch {} });

  // ---------- kleine Zustände ----------
  const G = {
    get: (k, d) => GM_getValue('vaf2_' + k, d),
    set: (k, v) => GM_setValue('vaf2_' + k, v),
    del: (k) => GM_deleteValue('vaf2_' + k),
  };

  // =====================================================================================
  // Schnittstellen (v2-api)
  //  - eigene Abfragen laufen über das Original-fetch (ohne Umweg über die Mitschnitte)
  //  - Abfragen der Seite selbst werden beobachtet: Mitglieder-Infos nebenbei merken,
  //    API-Rekorder, Antworten der Suche umsortieren (Figur-Badges)
  //  - Kopfzeilen, die die Seite selbst mitschickt, werden für eigene Abfragen übernommen
  //    (nur im Arbeitsspeicher, nie gespeichert oder exportiert)
  // =====================================================================================
  const origFetch = W.fetch.bind(W);
  const XO = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
  const xOpen = XO && XO.open, xSend = XO && XO.send, xSet = XO && XO.setRequestHeader;
  const descRT = XO && Object.getOwnPropertyDescriptor(XO, 'responseText');
  const descR = XO && Object.getOwnPropertyDescriptor(XO, 'response');
  let mirror = null;              // Kopfzeilen der Seite (ohne Cookie/Länge)
  const SKIP_HEADERS = /^(content-length|cookie|host|content-type)$/i;

  function captureHeaders(h) {
    if (!h) return;
    const out = {};
    try {
      if (typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach((v, k) => { out[k] = v; });
      else if (Array.isArray(h)) h.forEach(([k, v]) => { out[k] = v; });
      else Object.assign(out, h);
    } catch { return; }
    const m = {};
    for (const [k, v] of Object.entries(out)) if (!SKIP_HEADERS.test(k)) m[k] = String(v);
    if (Object.keys(m).length || !mirror) mirror = m;
  }

  // ---------- Beobachter für Antworten der Seite ----------
  const RespHooks = [];   // { re, onData(data, info), rewrite(data, info) → neue Daten oder null }
  function onApi(re, onData, rewrite) { RespHooks.push({ re, onData, rewrite }); }

  function parseBody(b) {
    if (b == null) return null;
    if (typeof b === 'string') { try { return JSON.parse(b); } catch { try { return Object.fromEntries(new URLSearchParams(b)); } catch { return b; } } }
    if (b instanceof W.URLSearchParams) return Object.fromEntries(b);
    if (b instanceof W.FormData) { const o = {}; b.forEach((v, k) => { o[k] = typeof v === 'string' ? v : '[Datei]'; }); return o; }
    return null;
  }
  function handleResponse(method, url, reqBody, text) {
    let u;
    try { u = new URL(url, location.origin); } catch { return null; }
    const path = u.pathname.replace(/^\/v2-api\//, '');
    const info = { method: String(method || 'GET').toUpperCase(), path, query: Object.fromEntries(u.searchParams), body: parseBody(reqBody), page: location.pathname };
    let json;
    try { json = JSON.parse(text); } catch { return null; }
    try { Recorder.add(info, json); } catch (e) { warn('Rekorder', e); }
    if (!json || json.code !== 0) return null;
    let data = json.data, changed = false;
    for (const h of RespHooks) {
      if (!h.re.test(path)) continue;
      if (h.onData) { try { const r = h.onData(data, info); if (r && r.catch) r.catch((e) => warn('Hook', path, e)); } catch (e) { warn('Hook', path, e); } }
      if (h.rewrite) { try { const nd = h.rewrite(data, info); if (nd) { data = nd; changed = true; } } catch (e) { warn('Umschreiben', path, e); } }
    }
    return changed ? JSON.stringify({ ...json, data }) : null;
  }

  // fetch der Seite
  if (ON_POPPEN) {
  W.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (!/\/v2-api\//.test(url)) return origFetch(input, init);
    let method = (init && init.method) || (input && input.method) || 'GET';
    let body = init && init.body;
    try { captureHeaders((init && init.headers) || (input && input.headers)); } catch {}
    if (body == null && input && typeof input.clone === 'function' && method !== 'GET') { try { body = await input.clone().text(); } catch {} }
    const res = await origFetch(input, init);
    try {
      const ct = res.headers.get('content-type') || '';
      if (!/json/i.test(ct)) return res;
      const text = await res.clone().text();
      const nt = handleResponse(method, url, body, text);
      if (nt != null) return new Response(nt, { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (e) { warn('fetch-Beobachter', e); }
    return res;
  };

  // XMLHttpRequest der Seite
  if (XO) {
    XO.open = function (m, u) { this.__vaf = { m, u: String(u), h: {} }; return xOpen.apply(this, arguments); };
    XO.setRequestHeader = function (k, v) { if (this.__vaf) this.__vaf.h[k] = v; return xSet.apply(this, arguments); };
    XO.send = function (body) {
      const inf = this.__vaf;
      if (inf && /\/v2-api\//.test(inf.u)) {
        captureHeaders(inf.h);
        const xhr = this;
        let done = false, rewritten = null;
        const ensure = () => {
          if (done || xhr.readyState !== 4) return;
          done = true;
          try {
            const rt = descRT.get.call(xhr);
            rewritten = handleResponse(inf.m, inf.u, body, rt);
          } catch { rewritten = null; }
        };
        try {
          Object.defineProperty(xhr, 'responseText', { configurable: true, get() { ensure(); return rewritten != null ? rewritten : descRT.get.call(xhr); } });
          Object.defineProperty(xhr, 'response', { configurable: true, get() {
            ensure();
            if (rewritten == null) return descR.get.call(xhr);
            return xhr.responseType === 'json' ? JSON.parse(rewritten) : rewritten;
          } });
        } catch {}
        xhr.addEventListener('readystatechange', ensure);
      }
      return xSend.apply(this, arguments);
    };
  }
  }   // Ende if (ON_POPPEN): Seiten-Hooks nur auf poppen.de

  // ---------- eigene Abfragen ----------
  class ApiError extends Error { constructor(msg, code, status) { super(msg); this.code = code; this.status = status; } }
  let apiCount = 0;
  async function api(path, { method = 'GET', query = null, body = null } = {}) {
    const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString() : '';
    const url = location.origin + '/v2-api/' + path + qs;
    const attempt = async () => {
      const headers = { Accept: 'application/json, text/plain, */*', ...(mirror || {}) };
      if (body != null) headers['Content-Type'] = 'application/json';
      const res = await origFetch(url, { method, credentials: 'include', headers, body: body != null ? JSON.stringify(body) : undefined });
      apiCount++;
      let j = null;
      try { j = await res.json(); } catch { throw new ApiError(`Antwort ist kein JSON (HTTP ${res.status})`, -1, res.status); }
      if (!res.ok && (!j || j.code === undefined)) throw new ApiError(`HTTP ${res.status}`, -1, res.status);
      if (!j || j.code !== 0) throw new ApiError((j && (j.msg || j.message || j.error)) || `Fehlercode ${j && j.code}`, j && j.code, res.status);
      return j.data;
    };
    try { return await attempt(); }
    catch (e) {
      // Noch keine Kopfzeilen der Seite gesehen? Kurz warten und einmal wiederholen
      if (!mirror && (e.status === 401 || e.status === 403 || e.code === -1)) {
        await waitFor(() => mirror, 8000);
        return attempt();
      }
      throw e;
    }
  }
  const apiGet = (path, query) => api(path, { method: 'GET', query });
  const apiPost = (path, body, query) => api(path, { method: 'POST', body, query });

  // ---------- API-Rekorder ----------
  // Schneidet Abfragen der Seite mit (nur neue Muster, je 2 Beispiele, Listen gekürzt, Sensibles geschwärzt).
  const KNOWN_API = ['v2/ignore/list', 'ignore/uid/list', 'ignore/add', 'ignore/delete', 'ignore/comment/add', 'user/search', 'rates',
    'my/received/gift', 'group/my', 'group/attendee/list', 'messenger/group/list', 'messenger/p2p/profile/display', 'user/session/info',
    'wio/state', 'messenger/message/list', 'messenger/backend/settings', 'v2/comment/list', 'friends/list', 'favourite/list', 'group/moderator/list',
    'group/profile', 'group/attendee/specific/pending/list', 'group/attendee/deny', 'v3/profile/gallery', 'ignore/be-ignored/uid/list', 'global/emojis', 'i18n/pull'];
  const API_HINTS = [
    [/^\/connection\/visitors/, '#1 Profilbesucher'], [/^\/groups\/\d+\/requests/, '#2/#3 Gruppenanfragen'],
    [/^\/p\//, '#4/#8/#11 Profil'], [/^\/search\/member/, '#10 Suchseite'],
  ];
  const REDACT_KEYS = /(e-?mail|pass(word|wd)?|token|secret|session_?id|auth|dino_client|cookie|phone|telefon|mobile)/i;
  const TEXT_KEYS = /^(content|description|private_description|text|message|body_text|about|desc|private_comment|public_comment|friendComment|note|media_note|wishes|profileNote|notes|metrics|status_text)$/i;
  function redact(v, key = '', depth = 0) {
    if (depth > 12) return '…';
    if (key && REDACT_KEYS.test(key)) return '«entfernt»';
    if (key && TEXT_KEYS.test(key) && typeof v === 'string') return v ? '«entfernt»' : '';
    if (key && /^(answers)$/i.test(key) && v && typeof v === 'object') return '«entfernt»';             // Interview-Antworten
    if (key && /^birthday$/i.test(key)) return Array.isArray(v) ? v.map((b) => (typeof b === 'string' ? b.slice(0, 4) + '-…' : b)) : v;   // nur das Jahr
    // Text, der selbst JSON enthält (z. B. data beim Senden): auspacken und mitschwärzen
    if (typeof v === 'string' && /^\s*[{[]/.test(v)) { try { const j = JSON.parse(v); return JSON.stringify(redact(j, key, depth + 1)); } catch {} }
    if (key && /^(geo_location|location)$/i.test(key) && v && typeof v === 'object' && !Array.isArray(v)) return { city: v.city || '' };
    if (key && /^(lat|lon|latitude|longitude|zipcode)$/i.test(key)) return '«entfernt»';
    if (Array.isArray(v)) {
      const head = v.slice(0, 2).map((x) => redact(x, '', depth + 1));
      if (v.length > 2) head.push(`… ${v.length - 2} weitere`);
      return head;
    }
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = redact(x, k, depth + 1); return o; }
    if (typeof v === 'string') {
      const t = v.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '«E-Mail»');
      if (/^https?:\/\//i.test(t) || /^\/\w/.test(t)) return t;
      return t.replace(/(?<![\w-])(\+?\d[\d\s/()-]{7,}\d)(?![\w-])/g, '«Telefon»');
    }
    return v;
  }
  const shapeOf = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).sort().join(',') : typeof o);
  const Recorder = (() => {
    let data = null, saveT = null, loading = null;
    const load = async () => { if (data) return data; if (!loading) loading = KV.get('recorder', {}).then((d) => (data = d || {})); return loading; };
    return {
      add(info, json) {
        if (!S().expert.recorder) return;
        load().then(() => {
          const key = `${info.method} ${info.path} ?${shapeOf(info.query)} ${shapeOf(info.body)}`;
          const e = data[key] || (data[key] = { method: info.method, path: info.path, known: KNOWN_API.includes(info.path), first: now(), n: 0, examples: [], pages: [] });
          e.n++; e.last = now();
          if (!e.pages.includes(info.page) && e.pages.length < 10) e.pages.push(info.page);
          if (e.examples.length < 2) e.examples.push({ page: info.page, query: redact(info.query), body: redact(info.body), response: redact(json) });
          // Hinweis nur für seitenbezogene Abfragen, nicht für allgemeine (Smileys, Übersetzungen, Zähler …)
          const general = /^(i18n|global|dino|egg-hunt|feedback|fakecheck|fsk18|wio|user\/gaclient|messenger\/(status|irc|backend)|browser-notification|tooltip|points)\b/.test(info.path);
          const hint = !general && API_HINTS.find(([re]) => re.test(info.page));
          if (hint && !e.known) e.hint = 'Kandidat für ' + hint[1];
          clearTimeout(saveT); saveT = setTimeout(() => KV.set('recorder', data), 1500);
          Bus.emit('recorder');
        });
      },
      async stats() { await load(); const v = Object.values(data); return { total: v.length, fresh: v.filter((x) => !x.known).length }; },
      async export() { await load(); return { version: VERSION, at: new Date().toISOString(), entries: Object.values(data).sort((a, b) => (a.known - b.known) || a.path.localeCompare(b.path)) }; },
      async clear() { data = {}; await KV.set('recorder', {}); Bus.emit('recorder'); },
    };
  })();

  // =====================================================================================
  // Regelwerk: Gruppen, Altersgrenzen je Quelle, Paare, Whitelist, Bezeichnungen, Notizen
  // =====================================================================================
  const GROUP_KEYS = ['m', 'w', 'p'];
  const GROUP_NAMES = { m: 'Männer', w: 'Frauen', p: 'Paare' };
  const TYPE_NAMES = { m: 'Mann', w: 'Frau', p: 'Paar', ts: 'Trans', tv: 'Nicht-binär' };

  // poppen-Typcode eines Mitglieds: m, w, p (zwei Personen), ts, tv
  function typeCode(g) {
    if (!g || !g.length) return '';
    if (g.length > 1 || g[0] === 'p') return 'p';
    return g[0];
  }
  function groupOf(g, s = S()) {
    const t = typeCode(g);
    if (!t) return null;
    return GROUP_KEYS.find((k) => (s.groups[k].types || []).includes(t)) || null;
  }

  // ---------- eigenes Profil, Region ----------
  // Ruhrgebiet (Regionalverband Ruhr): kreisfreie Städte und Kreise
  const RUHR = ['bochum', 'bottrop', 'dortmund', 'duisburg', 'essen', 'gelsenkirchen', 'hagen', 'hamm', 'herne', 'mülheim an der ruhr', 'mülheim',
    'oberhausen', 'castrop-rauxel', 'datteln', 'dorsten', 'gladbeck', 'haltern am see', 'herten', 'marl', 'oer-erkenschwick', 'recklinghausen', 'waltrop',
    'bergkamen', 'bönen', 'fröndenberg', 'holzwickede', 'kamen', 'lünen', 'schwerte', 'selm', 'unna', 'werne', 'breckerfeld', 'ennepetal', 'gevelsberg',
    'hattingen', 'herdecke', 'schwelm', 'sprockhövel', 'wetter', 'witten', 'alpen', 'dinslaken', 'hamminkeln', 'hünxe', 'kamp-lintfort', 'moers',
    'neukirchen-vluyn', 'rheinberg', 'schermbeck', 'sonsbeck', 'voerde', 'wesel', 'xanten'];
  const RHEINLAND = ['aachen', 'herzogenrath', 'alsdorf', 'würselen', 'stolberg', 'eschweiler', 'baesweiler', 'monschau', 'roetgen', 'simmerath',
    'köln', 'bonn', 'düsseldorf', 'neuss', 'mönchengladbach', 'krefeld', 'leverkusen', 'solingen', 'remscheid', 'wuppertal', 'düren', 'euskirchen',
    'heinsberg', 'viersen', 'kleve', 'bergheim', 'frechen', 'hürth', 'kerpen', 'pulheim', 'siegburg', 'troisdorf', 'jülich', 'geilenkirchen', 'erkelenz',
    'hückelhoven', 'übach-palenberg', 'grevenbroich', 'ratingen', 'mettmann', 'langenfeld (rheinland)', 'langenfeld', 'hilden', 'velbert'];
  // Gebiete mit Sonderregeln (das Rheinland ist angelegt, hat aber noch keine Sonderregeln)
  const REGIONS = { ruhr: { cities: RUHR, special: true }, rheinland: { cities: RHEINLAND, special: false } };
  function regionOf(city) {
    const c = norm(city).replace(/\s*\(.*\)$/, '');
    for (const [k, r] of Object.entries(REGIONS)) if (r.cities.includes(c) || r.cities.includes(norm(city))) return k;
    return '';
  }
  // eigenes Profil: { uid, nick, g, cities: [Hauptwohnsitz, Zweitwohnsitz] }
  const Me = {
    get: () => G.get('me', null),
    set: (m) => { G.set('me', m); Bus.emit('me', m); },
    uid: () => (G.get('me', null) || {}).uid || '',
    region() {
      const me = Me.get();
      const special = ((me && me.cities) || []).map(regionOf).filter((r) => r && REGIONS[r].special);
      return special[0] || '';      // genau eines oder mehrere → das zuerst genannte
    },
    male() { const me = Me.get(); return !!me && typeCode(me.g) === 'm'; },
  };
  // „Opa“ / „Oma“ / „Oppa“ / „Omma“
  function word() {
    const ruhr = Me.region() === 'ruhr';
    if (Me.male()) return ruhr ? 'Omma' : 'Oma';
    return ruhr ? 'Oppa' : 'Opa';
  }
  const wordPl = () => word() + 's';
  const REGIONAL = { Opa: 'Oppa', Opas: 'Oppas', Oma: 'Omma', Omas: 'Ommas' };
  function labelsOf(gk, s = S()) {
    const l = [...(s.groups[gk].labels || DEFAULTS.groups[gk].labels)];
    if (Me.region() === 'ruhr') for (const i of [4, 5]) if (REGIONAL[l[i]]) l[i] = REGIONAL[l[i]];
    return l;
  }

  // ---------- Altersgrenzen ----------
  // je Quelle [Stufe 1 bis, Stufe 2 bis, Ignorieren ab]
  function limitsOf(gk, src, person = -1, s = S()) {
    const grp = s.groups[gk];
    const key = SRC_KEYS.includes(src) ? src : 'suche';
    if (gk === 'p' && grp.separate && person >= 0) return (person === 0 ? grp.srcW : grp.srcM)[key];
    return grp.src[key];
  }
  const srcKeyOf = (src) => (SRC_KEYS.includes(src) ? src : (NOTE_SOURCES[src] || 'suche'));

  // ---------- Whitelist ----------
  function manualWhite(nick, s = S()) {
    const n = norm(nick);
    if (!n) return '';
    if ((s.whitelist.names || []).some((x) => norm(x.n) === n)) return 'Whitelist';
    if ((s.whitelist.prefixes || []).some((p) => p && n.startsWith(norm(p)))) return 'Whitelist (Präfix)';
    return '';
  }
  // automatische Whitelist: Mitarbeiter, Freunde, Favoriten, Gruppen-Leitungen, verwaltete Gruppen (mit Schonfrist)
  function autoWhite(m, s = S()) {
    if (!m) return '';
    if (m.pay === 'site_admin') return 'poppen-Mitarbeiter';
    const a = m.auto || {};
    if (a.friend) return 'Freund';
    if (a.fav) return 'Favorit';
    if (a.lead && Object.keys(a.lead).length) return 'Gruppen-Leitung';
    const grp = Object.entries(a.grp || {}).filter(([cms]) => s.managedWhitelist[cms] !== false);
    if (grp.length) {
      const grace = s.expert.groupGraceDays * DAY;
      const live = grp.filter(([, ts]) => now() - ts < grace);
      if (live.length) {
        const names = G.get('groupnames', {});
        return 'Mitglied in ' + live.map(([c]) => names[c] || ('Gruppe ' + c)).join(', ');
      }
    }
    return '';
  }
  const whiteReason = (m, nick) => manualWhite(nick || (m && m.nick)) || autoWhite(m);

  // ---------- Einstufung ----------
  // x = { uid, nick, g, ages, pay, auto } (Mitglied oder Treffer), src = Quelle
  // Ergebnis: { gk, stage 0–3, ignore, near, white, unclear, sugar, label }
  function classify(x, src, s = S()) {
    const r = { gk: null, stage: 0, ignore: false, near: false, white: '', unclear: false, sugar: '', label: '', reason: '' };
    const ages = (x.ages || []).filter((a) => a > 0);
    r.gk = groupOf(x.g, s);
    r.white = whiteReason(x, x.nick);
    if (ages.some((a) => a >= 99)) { r.unclear = true; r.reason = 'Alter 99 (unklar)'; return r; }
    if (!ages.length || !r.gk) return r;
    const grp = s.groups[r.gk];
    const sk = srcKeyOf(src);
    const mode = r.gk === 'p' ? grp.coupleMode : 'any';
    const per = ages.map((a, i) => {
      const lim = limitsOf(r.gk, sk, ages.length > 1 ? i : -1, s);
      const stage = a <= lim[0] ? 1 : a <= lim[1] ? 2 : 3;
      return { a, lim, stage, over: a >= lim[2], near: a < lim[2] && a + (s.warnYears || 0) >= lim[2] };
    });
    const pick = (f) => (mode === 'all' ? per.every(f) : per.some(f));
    r.stage = mode === 'all' ? Math.min(...per.map((p) => p.stage)) : Math.max(...per.map((p) => p.stage));
    const over = pick((p) => p.over);
    r.near = !over && pick((p) => p.over || p.near) && s.watch;
    // Sugar Daddy / Sugar Mom (nur Paare: [Frau, Mann])
    if (r.gk === 'p' && ages.length === 2 && x.g && x.g.length === 2) {
      const iw = x.g.indexOf('w'), im = x.g.indexOf('m');
      if (iw >= 0 && im >= 0) {
        const gap = ages[im] - ages[iw];
        if (grp.sugarDaddy.on && gap >= grp.sugarDaddy.gap) r.sugar = 'Sugar Daddy';
        else if (grp.sugarMom.on && -gap >= grp.sugarMom.gap) r.sugar = 'Sugar Mom';
      }
    }
    const lbl = labelsOf(r.gk, s);
    r.label = r.sugar || lbl[(Math.max(1, r.stage) - 1) * 2];
    r.ignore = !!grp.ignore && (over || !!r.sugar) && !r.white;
    if (r.ignore) r.reason = r.sugar ? r.sugar : `über der Grenze (${per.map((p) => p.a).join('/')} ≥ ${per.map((p) => p.lim[2]).join('/')})`;
    if (r.white) { r.near = false; r.reason = r.white; }
    return r;
  }
  // Bezeichnung für Notizen: Stufe-3-Bezeichnung der Gruppe (bzw. Sugar Daddy/Mom)
  function noteWord(x, s = S()) {
    const gk = groupOf(x.g, s) || 'm';
    const c = classify(x, 'suche', s);
    return c.sugar || labelsOf(gk, s)[4];
  }

  // ---------- Notizen ----------
  function makeNote(x, src, when = new Date(), s = S()) {
    const pad = (n) => String(n).padStart(2, '0');
    let t = s.expert.noteText;
    t = src ? t.replace('{quelle}', src) : t.replace(/\s*\(\{quelle\}\)|\s*\{quelle\}/, '');
    return t.replace('{bezeichnung}', noteWord(x, s)).replace('{datum}', `${pad(when.getDate())}.${pad(when.getMonth() + 1)}.${when.getFullYear()}`)
      .replace('{uhrzeit}', `${pad(when.getHours())}:${pad(when.getMinutes())}`);
  }
  // Erkennt Opa-Schutz-Notizen (auch ältere: „Alter Sack (Suche) geblockt am …“)
  const NOTE_RE = /^(.{1,40}?)(?:\s+\(([^)]{1,30})\))?\s+geblockt am\s+(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+um\s+(\d{1,2}):(\d{2}))?/i;
  function parseNote(note) {
    const m = NOTE_RE.exec(String(note || '').trim());
    if (!m) return null;
    const at = new Date(+m[5], +m[4] - 1, +m[3], +(m[6] || 0), +(m[7] || 0)).getTime();
    return { word: m[1], src: m[2] || '', at };
  }
  const isOpaNote = (note) => !!parseNote(note);

  // ---------- Geburtszeiträume ----------
  function birthRange(age, when = new Date()) {
    const hi = new Date(when.getFullYear() - age, when.getMonth(), when.getDate());
    const lo = new Date(when.getFullYear() - age - 1, when.getMonth(), when.getDate() + 1);
    return { lo: isoDay(lo), hi: isoDay(hi) };
  }
  const intersect = (a, b) => { if (!a) return b; if (!b) return a; const lo = a.lo > b.lo ? a.lo : b.lo; const hi = a.hi < b.hi ? a.hi : b.hi; return lo <= hi ? { lo, hi } : null; };
  const yearRange = (y) => ({ lo: `${y}-01-01`, hi: `${y}-12-31` });
  // Sternzeichen (Beginn MM-DD)
  const ZODIAC = [['Steinbock', '12-22'], ['Wassermann', '01-20'], ['Fische', '02-19'], ['Widder', '03-21'], ['Stier', '04-20'], ['Zwillinge', '05-21'],
    ['Krebs', '06-21'], ['Löwe', '07-23'], ['Jungfrau', '08-23'], ['Waage', '09-23'], ['Skorpion', '10-23'], ['Schütze', '11-22']];
  function zodiacRanges(sign, y1, y2) {
    const i = ZODIAC.findIndex(([n]) => norm(n) === norm(sign));
    if (i < 0) return [];
    const start = ZODIAC[i][1], end = ZODIAC[(i + 1) % 12][1];
    const out = [];
    for (let y = y1 - 1; y <= y2; y++) {
      const s0 = `${y}-${start}`;
      const ey = end < start ? y + 1 : y;
      const e = new Date(`${ey}-${end}T00:00:00`); e.setDate(e.getDate() - 1);
      out.push({ lo: s0, hi: isoDay(e) });
    }
    return out;
  }
  function applyZodiac(range, sign) {
    if (!range) return range;
    const hits = zodiacRanges(sign, +range.lo.slice(0, 4), +range.hi.slice(0, 4)).map((z) => intersect(range, z)).filter(Boolean);
    return hits.length === 1 ? hits[0] : hits.length ? { lo: hits[0].lo, hi: hits[hits.length - 1].hi } : range;
  }
  function yearText(p) { if (!p) return ''; const y1 = +p.lo.slice(0, 4), y2 = +p.hi.slice(0, 4); return y1 === y2 ? String(y1) : `${y1}/${String(y2).slice(-2)}`; }
  function ageToday(p, today = new Date()) {
    if (!p) return null;
    const [y, m, d] = p.hi.split('-').map(Number);
    let a = today.getFullYear() - y; if (today < new Date(today.getFullYear(), m - 1, d)) a--;
    return a;
  }

  // =====================================================================================
  // Mitglieder-Wissen: aus jeder Quelle nebenbei merken
  // =====================================================================================
  const IMG_SOURCES = new Set(['Likes', 'Sticker', 'Nachrichten', 'Besucher', 'Profil', 'Gruppenanfrage']);

  // Ein Benutzerobjekt der Schnittstelle vereinheitlichen
  function normUser(u) {
    if (!u) return null;
    const uid = String(u.uid || u.user_id || u.id || '');
    if (!uid || uid === '0') return null;
    // verschleierte Mitglieder (Prüfsumme statt Nummer, Sternchen-Name, is_blurry): nicht verwertbar
    if (!/^\d+$/.test(uid) || u.is_blurry === true || /^\S\*{3,}$/.test(u.nickname || '')) return null;
    const g = Array.isArray(u.gender) ? u.gender.filter(Boolean) : u.gender_string ? (u.gender_string === 'p' ? ['w', 'm'] : [u.gender_string]) : [];
    return {
      uid, nick: u.nickname || u.name || '', g,
      ages: Array.isArray(u.age) ? u.age.map(Number).filter((a) => a > 0) : u.age ? [Number(u.age)] : [],
      by: Array.isArray(u.birthday) ? u.birthday.map((b) => (b && /^\d{4}/.test(b) ? +b.slice(0, 4) : 0)) : [],
      avatar: u.avatar || '', pay: u.payclass || u.membership || '',
      city: (u.geo_location && u.geo_location.city) || (u.location && u.location.city) || '',
      note: typeof u.note === 'string' ? u.note : undefined,
      active: u.is_active, lastLogin: u.last_visible_login || 0, fake: u.fakecheck,
    };
  }

  // Gesehenes Mitglied verbuchen. src = „Likes“, „Sticker“, „Nachrichten“, „Besucher“, „Gruppen“, „Suche“, „Profil“, „Blockierliste“ …
  async function seen(u, src, { images = true } = {}) {
    const x = u && u.uid && u.g ? u : normUser(u);
    if (!x) return null;
    const today = new Date();
    const m = await Members.update(x.uid, (m) => {
      if (x.nick && m.nick && m.nick !== x.nick) { m.nicks = uniq([...(m.nicks || []), m.nick]).slice(-10); }
      if (x.nick) m.nick = x.nick;
      if (x.g && x.g.length) m.g = x.g;
      if (x.ages && x.ages.length) {
        // Geburtszeiträume eingrenzen (Paare: gleiche Reihenfolge, sonst neu)
        const fresh = x.ages.map((a) => birthRange(a, today));
        const old = m.birth || [];
        let birth = fresh.map((f, i) => (old.length === fresh.length ? intersect(old[i], f) : f) || f);
        (x.by || []).forEach((y, i) => { if (y > 1900 && birth[i]) birth[i] = intersect(birth[i], yearRange(y)) || birth[i]; });
        m.birth = birth;
        m.ages = x.ages; m.ageAt = isoDay(today);
        if (x.by && x.by.some(Boolean)) m.by = x.by;
      }
      if (x.avatar && !isPlaceholderAvatar(x.avatar)) { if (m.avatar !== x.avatar) m.avatarNew = true; m.avatar = x.avatar; }
      if (x.pay) {
        m.pay = x.pay;
        m.auto = m.auto || {};
        if (x.pay === 'site_admin') m.auto.admin = now(); else delete m.auto.admin;
      }
      if (x.city) m.city = x.city;
      if (x.note !== undefined) {
        const pn = parseNote(x.note);
        if (pn && (!m.blk || !m.blk.opa)) m.blk = { at: pn.at, src: pn.src, note: x.note, opa: true };
      }
      if (x.lastLogin) m.lastLogin = x.lastLogin;
      if (m.del && src !== 'Blockierliste') delete m.del;
      m.last = now();
      m.seen = m.seen || {};
      if (src) m.seen[src] = now();
    });
    if (legacy && !m.legacyDone) { await legacyApply(m); m.legacyDone = 1; Members.put(m); }
    if ((x.ages || []).some((a) => a >= 99)) log99(x.uid, x.nick);
    if (images && IMG_SOURCES.has(src) && m.avatar && (m.avatarNew || !m.img)) Images.want(m.uid, m.avatar);
    return m;
  }
  async function seenMany(list, src, opts) { const out = []; for (const u of list || []) { const m = await seen(u, src, opts); if (m) out.push(m); } return out; }

  // ---------- Alter 99: mitloggen ----------
  async function log99(uid, nick) {
    const l = await KV.get('log99', {});
    if (l[uid]) return;
    l[uid] = { nick, at: now() };
    await KV.set('log99', l);
  }

  // ---------- Profilbilder als kleine Kopie ----------
  // Die Bildadressen von poppen.de sind nur begrenzt gültig – deshalb eine eigene, kleine Kopie (~150 px).
  const Images = (() => {
    const want = new Map();
    let busy = false;
    async function load(url) {
      const u300 = url.replace(/_(\d+)(_sq)?(\.jpe?g)/i, '_300_sq$3');
      let blob = await new Promise((resolve) => {
        try {
          GM_xmlhttpRequest({ method: 'GET', url: u300, responseType: 'blob', timeout: 20000,
            onload: (r) => resolve(r.status === 200 && r.response ? r.response : null), onerror: () => resolve(null), ontimeout: () => resolve(null) });
        } catch { resolve(null); }
      });
      if (!blob) {
        // Rückfall: Bild über ein <img>-Element (klappt nur, wenn der Bildserver es erlaubt)
        blob = await new Promise((resolve) => {
          const im = new Image(); im.crossOrigin = 'anonymous';
          im.onload = () => { try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(resolve, 'image/jpeg', 0.8); } catch { resolve(null); } };
          im.onerror = () => resolve(null);
          im.src = url;
        });
      }
      if (!blob) return null;
      const bmp = await createImageBitmap(blob);
      const size = 150, c = document.createElement('canvas');
      const sc = Math.max(size / bmp.width, size / bmp.height);
      c.width = size; c.height = size;
      c.getContext('2d').drawImage(bmp, (size - bmp.width * sc) / 2, (size - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
      return c.toDataURL('image/jpeg', 0.72);
    }
    async function pump() {
      if (busy) return;
      busy = true;
      try {
        while (want.size) {
          const [uid, url] = want.entries().next().value;
          want.delete(uid);
          try {
            const data = await load(url);
            if (data) {
              await DB.put('images', { uid, data, src: url, at: now() });
              await Members.update(uid, (m) => { m.img = now(); delete m.avatarNew; });
            }
          } catch (e) { /* Bild nicht ladbar – beim nächsten Mal erneut */ }
          await sleep(300);
        }
      } finally { busy = false; }
    }
    return {
      want(uid, url) { want.set(String(uid), url); setTimeout(pump, 1500); },
      async get(uid) { const r = await DB.get('images', String(uid)); return r ? r.data : ''; },
    };
  })();

  // ---------- eigenes Profil ----------
  // Aus session/info werden NUR uid, Nickname, Geschlecht und Wohnort gelesen.
  async function loadMe(force = false) {
    const me = Me.get();
    if (me && !force && now() - (me.at || 0) < 6 * 3600000) return me;
    try {
      const d = await apiGet('user/session/info', { _version: 2 });
      const a = d && d.account;
      if (!a) return me;
      const nm = { uid: String(a.uid), nick: a.nickname, g: a.gender || [], cities: [(a.geo_location && a.geo_location.city) || ''], second: !!a.secondary_location_status, at: now() };
      if (me && me.cities && me.cities[1]) nm.cities[1] = me.cities[1];
      if (a.geo_location && a.geo_location.geo_id) { const { distance, distance_unit, ...geo } = a.geo_location; G.set('mygeo', geo); }
      Me.set(nm);
      return nm;
    } catch (e) { warn('Eigenes Profil nicht lesbar', e); return me; }
  }
  // Zweitwohnsitz: aus der Einstellungsseite (Zeile „Zweitwohnsitz“), höchstens einmal täglich
  async function loadSecondHome() {
    const me = Me.get();
    if (!me || !me.second) return;
    if (now() - (G.get('second_at', 0)) < DAY) return;
    G.set('second_at', now());
    const doc = await Frame.load('/setting/profile', (d) => d.querySelector('a[href="/setting/profile/second-home"]'), 20000);
    if (!doc) return;
    const a = doc.querySelector('a[href="/setting/profile/second-home"] .ant-list-item-meta-description');
    const city = a ? a.textContent.split(',')[0].trim() : '';
    const m2 = Me.get();
    m2.cities = [m2.cities[0] || '', city];
    Me.set(m2);
  }
  // Eigenes Profil auf der Einstellungsseite direkt mitlesen (wenn der Nutzer sie öffnet)
  function readSecondHomeFromPage() {
    const a = document.querySelector('a[href="/setting/profile/second-home"] .ant-list-item-meta-description');
    const me = Me.get();
    if (!a || !me) return;
    const city = a.textContent.split(',')[0].trim();
    if (city && city !== me.cities[1]) { me.cities = [me.cities[0] || '', city]; Me.set(me); }
  }

  // ---------- unsichtbarer Rahmen zum Laden von poppen-Seiten ----------
  const Frame = (() => {
    let f = null;
    function el() {
      if (f && f.isConnected) return f;
      f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:1000px;border:0;visibility:hidden;pointer-events:none';
      document.body.appendChild(f);
      return f;
    }
    return {
      async load(url, ready, timeout = 25000) {
        const fr = el();
        await new Promise((res) => { const h = () => { fr.removeEventListener('load', h); res(); }; fr.addEventListener('load', h); fr.src = url; setTimeout(res, timeout); });
        const doc = () => { try { return fr.contentDocument; } catch { return null; } };
        return waitFor(() => { const d = doc(); return d && (!ready || ready(d)) ? d : null; }, timeout);
      },
      doc() { try { return f && f.contentDocument; } catch { return null; } },
      remove() { if (f) { f.remove(); f = null; } },
    };
  })();

  // =====================================================================================
  // Blocken: Warteliste, Etappen, Vorprüfungen
  // =====================================================================================
  const RANK = () => S().expert.rank;
  const rankOf = (src) => { const i = RANK().indexOf(srcKeyOf(src)); return i < 0 ? 9 : i; };

  const Queue = {
    async add(x, src) {
      const m = x.uid ? await Members.get(x.uid) : null;
      if (m && m.blk && m.blk.at && !m.unblk) return false;
      const old = x.uid ? await DB.get('queue', String(x.uid)) : null;
      const oldest = Math.max(...(x.ages || [0]));
      const item = {
        uid: String(x.uid || ('nick:' + norm(x.nick))), nick: x.nick || (m && m.nick) || '', g: x.g || (m && m.g) || [], ages: x.ages || (m && m.ages) || [],
        src: old && rankOf(old.src) <= rankOf(src) ? old.src : src, added: (old && old.added) || now(), tries: (old && old.tries) || 0,
      };
      item.prio = rankOf(item.src) * 1000 + (200 - oldest);
      await DB.put('queue', item);
      Queue.changed();
      return !old;
    },
    async remove(uid) { await DB.del('queue', String(uid)); Queue.changed(); },
    async list() { const l = await DB.all('queue'); l.sort((a, b) => a.prio - b.prio || a.added - b.added); return l; },
    async count() { return DB.count('queue'); },
    async clear() { await DB.clear('queue'); Queue.changed(); },
    changed: (() => { let t; return () => { clearTimeout(t); t = setTimeout(async () => { G.set('qcount', await DB.count('queue')); Bus.emit('queue'); }, 300); }; })(),
  };

  // ---------- Vormerken: knapp unter der Grenze ----------
  async function watchMark(m, on) {
    const w = await KV.get('watch', {});
    if (on && !w[m.uid]) { w[m.uid] = now(); await KV.set('watch', w); }
    if (!on && w[m.uid]) { delete w[m.uid]; await KV.set('watch', w); }
  }
  // Vorgemerkte, die laut Geburtszeitraum inzwischen sicher über der Grenze sind → Warteliste
  async function watchDue() {
    const w = await KV.get('watch', {});
    let n = 0;
    for (const uid of Object.keys(w)) {
      const m = await Members.get(uid);
      if (!m || !m.birth || !m.birth.length) continue;
      if (m.blk && !m.unblk) { delete w[uid]; continue; }
      const ages = m.birth.map((b) => ageToday(b));
      const c = classify({ ...m, ages }, 'Vorgemerkt');
      if (c.white || c.unclear) { delete w[uid]; continue; }
      if (c.ignore) { await Queue.add({ ...m, ages }, 'Vorgemerkt'); delete w[uid]; n++; }
    }
    await KV.set('watch', w);
    return n;
  }

  // Treffer einer Quelle verarbeiten: einstufen, vormerken, ggf. auf die Warteliste
  // Ergebnis: { hits, white, near, unclear, queued }
  async function judge(list, src, { enqueue = true } = {}) {
    const res = { total: 0, hits: 0, white: 0, near: 0, unclear: 0, queued: 0, known: 0 };
    for (const x of list) {
      res.total++;
      const m = x.uid ? await Members.get(x.uid) : null;
      const c = classify({ ...(m || {}), ...x }, src);
      if (c.unclear) { res.unclear++; continue; }
      if (c.white) { res.white++; continue; }
      if (c.near && m) { res.near++; await watchMark(m, true); }
      if (!c.ignore) continue;
      res.hits++;
      if (m && m.blk && !m.unblk) { res.known++; continue; }
      if (enqueue && await Queue.add(x, src)) res.queued++;
    }
    return res;
  }

  // ---------- Schnittstellen der Blockierliste ----------
  const BL = {
    async page(page, nickname = '') { return apiPost('v2/ignore/list', { page, nickname, sort: 'recently_added' }); },
    async uids() {
      let d;
      try { d = await apiGet('ignore/uid/list'); } catch { d = await apiPost('ignore/uid/list', {}); }
      return ((d && d.list) || []).map(String);
    },
    // ganze Liste lesen (30 je Seite)
    async all(onPage) {
      const out = [];
      let page = 1;
      for (let guard = 0; guard < 100000; guard++) {
        const d = await BL.page(page);
        const l = (d && d.list) || [];
        out.push(...l);
        if (onPage && onPage(out.length, page, l) === false) break;
        if (!l.length || !d.next_page || d.next_page === page) break;
        page = d.next_page;
      }
      return out;
    },
    async find(nick) {
      const d = await BL.page(1, nick);
      return ((d && d.list) || []).find((e) => e.user && norm(e.user.nickname) === norm(nick)) || null;
    },
    add: (uid, nickname) => apiPost('ignore/add', { uid: String(uid), nickname }),
    del: (uid, nickname) => apiPost('ignore/delete', { uid: String(uid), nickname }),
    note: (uid, comment) => apiPost('ignore/comment/add', { igrid: String(uid), comment }),
  };

  // Profil-Kurzinfo (Alter, Notiz, Freundschaft) – ohne Profilaufruf
  async function profileShort(nick) {
    try { return await apiPost('messenger/p2p/profile/display', { nickname: nick }); } catch { return null; }
  }

  // Ein Mitglied blockieren (mit Notiz). Gibt 'ok' | 'bereits' | Fehlertext zurück
  async function blockOne(m, src, { note = true } = {}) {
    const s = S();
    const when = new Date();
    const text = makeNote(m, src, when);
    if (dry()) { log('Testlauf – würde blockieren:', m.nick, src, text); return 'Test'; }
    try { await BL.add(m.uid, m.nick); }
    catch (e) {
      const there = /already|bereits|schon/i.test(e.message) || await BL.find(m.nick).then(Boolean).catch(() => false);
      if (!there) return 'Fehler: ' + e.message;
    }
    let noted = false;
    if (note && s.expert.writeNote) {
      try { await BL.note(m.uid, text); noted = true; }
      catch (e) {
        warn('Notiz fehlgeschlagen', m.nick, e);
        if (s.expert.noteRequired) { try { await BL.del(m.uid, m.nick); } catch {} return 'Fehler: Notiz ließ sich nicht schreiben'; }
      }
    }
    await Members.update(m.uid, (x) => { x.blk = { at: when.getTime(), src, note: noted ? text : '', opa: true }; delete x.unblk; });
    G.set('blocked_count', (G.get('blocked_count', 0) || 0) + 1);
    return 'ok';
  }
  async function unblockOne(m, { keepMemory = false } = {}) {
    if (dry()) { log('Testlauf – würde entsperren:', m.nick); return 'Test'; }
    try { await BL.del(m.uid, m.nick); } catch (e) { return 'Fehler: ' + e.message; }
    if (!keepMemory) await Members.update(m.uid, (x) => { x.unblk = now(); x.blk = null; });
    G.set('blocked_count', Math.max(0, (G.get('blocked_count', 0) || 0) - 1));
    return 'ok';
  }

  // Ohne bekannte Benutzer-ID: über „Benutzer hinzufügen“ auf der Blockierliste (im unsichtbaren Rahmen)
  async function blockByNickDom(nick) {
    const doc = await Frame.load('/setting/privacy/ignore-list', (d) => d.querySelector('main input#nickname'), 25000);
    if (!doc) return 'Fehler: Blockierliste nicht ladbar';
    const w = doc.defaultView;
    const inp = () => doc.querySelector('main input#nickname');
    const setVal = (el, v) => {
      el.focus();
      Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
      el.dispatchEvent(new w.Event('change', { bubbles: true }));
    };
    const l = norm(nick);
    const opts = () => [...doc.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')];
    const match = (o) => norm(o.getAttribute('title')) === l || norm(o.textContent) === l || norm(o.textContent).startsWith(l + ' ') ||
      [...o.querySelectorAll('*')].some((e) => !e.children.length && norm(e.textContent) === l);
    inp().dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
    setVal(inp(), '');
    for (let i = 1; i <= nick.length; i++) { setVal(inp(), nick.slice(0, i)); await sleep(60); }
    const opt = await waitFor(() => opts().find(match), 6000);
    if (!opt) { setVal(inp(), ''); return 'Fehler: Name nicht in der Vorschlagsliste'; }
    opt.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    opt.click();
    const addBtn = () => { const f = inp() && inp().closest('form'); const b = f && [...f.querySelectorAll('button')].find((x) => norm(x.textContent) === 'hinzufügen'); return b && !b.disabled ? b : null; };
    if (!(await waitFor(addBtn, 3000))) return 'Fehler: „Hinzufügen“ bleibt gesperrt';
    if (dry()) { setVal(inp(), ''); return 'Test'; }
    addBtn().click();
    await sleep(1500);
    const e = await BL.find(nick).catch(() => null);
    return e && e.user ? { uid: String(e.user.uid), user: e.user } : 'Fehler: Name erscheint nicht in der Liste';
  }

  // ---------- eine Etappe ----------
  // ---------- Vorrang: andere Vorgänge pausieren das Hintergrundblockieren ----------
  // Prio.run('name', fn) markiert einen Vorgang (für alle Tabs sichtbar); das Blockieren wartet, bis er fertig ist.
  const Prio = (() => {
    const pre = 'vaf2_prio_';
    const mine = new Map();
    setInterval(() => { for (const [k, v] of mine) GM_setValue(k, { ...v, ts: now() }); }, 5000);
    W.addEventListener('pagehide', () => { for (const k of mine.keys()) try { GM_deleteValue(k); } catch {} });
    const LOCKS = ['scan', 'blocklist', 'grpreq', 'grpwl'];
    return {
      enter(what) { const k = pre + what + '_' + TAB_ID + '_' + Math.random().toString(36).slice(2, 6); const v = { what, ts: now() }; mine.set(k, v); GM_setValue(k, v); return k; },
      leave(k) { mine.delete(k); try { GM_deleteValue(k); } catch {} },
      async run(what, fn) { const k = this.enter(what); try { return await fn(); } finally { this.leave(k); } },
      // läuft gerade etwas mit Vorrang (in irgendeinem Tab)?
      busy() {
        for (const k of GM_listValues()) {
          if (!k.startsWith(pre) && !LOCKS.some((l) => k === 'vaf2_lock_' + l)) continue;
          const v = GM_getValue(k, null);
          if (v && now() - (v.ts || 0) < 30000) return (v.what || v.info || k.replace('vaf2_lock_', ''));
        }
        return '';
      },
    };
  })();

  // ---------- Hintergrundblockieren (ersetzt die Etappen) ----------
  // Solange Kandidaten auf der Warteliste stehen und der Schalter an ist, blockiert ein Tab einen nach dem anderen.
  const TAB_SINCE = (() => { try { const v = +sessionStorage.getItem('vaf_tab_since'); if (v) return v; const t = now(); sessionStorage.setItem('vaf_tab_since', String(t)); return t; } catch { return now(); } })();
  const Etappe = {
    running: false, stopFlag: false, manual: false, listeners: new Set(), state: 'idle',
    status() { return { running: this.running, state: this.state, last: G.get('etappe_last', null) }; },
    setState(st) { this.state = st; G.set('blk_state', { st, at: now(), tab: TAB_ID }); Bus.emit('etappe', { running: this.running, state: st }); },
    // Prüft und blockiert einen Kandidaten. Ergebnis wird in st gezählt.
    async one(q, s, st) {
      let m = q.uid.startsWith('nick:') ? await Members.byNick(q.nick) : await Members.get(q.uid);
      if (!m && !q.uid.startsWith('nick:')) m = { uid: q.uid, nick: q.nick, g: q.g, ages: q.ages };
      // Vorprüfung 1: Profil-Kurzinfo (Freund? schon geblockt? aktuelles Alter)
      const ps = await profileShort(q.nick);
      if (ps) {
        if (ps.friend_status && ps.friend_status !== 'none') {
          if (m && m.uid && !String(m.uid).startsWith('nick:')) await Members.update(m.uid, (x) => { x.auto = x.auto || {}; x.auto.friend = now(); x.friend = ps.friend_status; });
          await Queue.remove(q.uid); st.dropped++; st.items.push({ nick: q.nick, res: 'Freund – nicht blockiert' }); return 'skip';
        }
        if (Array.isArray(ps.age) && ps.age.length && m) m = { ...m, ages: ps.age };
        if (ps.note && isOpaNote(ps.note) && m && m.uid) {
          const pn = parseNote(ps.note);
          await Members.update(m.uid, (x) => { x.blk = { at: pn.at, src: pn.src, note: ps.note, opa: true }; });
          await Queue.remove(q.uid); st.dropped++; return 'skip';
        }
      }
      // Vorprüfung 2: Regeln (Whitelist, Favoriten, Mitarbeiter, verwaltete Gruppen, Alter 99, Grenzen)
      const c = classify({ ...(m || q), nick: q.nick }, q.src);
      if (!c.ignore) { await Queue.remove(q.uid); st.dropped++; st.items.push({ nick: q.nick, res: c.white ? 'Whitelist: ' + c.white : c.unclear ? 'Alter unklar' : 'nicht mehr über der Grenze' }); return 'skip'; }
      if (!m || !m.uid || String(m.uid).startsWith('nick:')) {
        const r = await blockByNickDom(q.nick);
        if (typeof r === 'string') { if (r === 'Test') { st.test++; return 'test'; } await this.fail(q, r, st); return 'fail'; }
        m = await seen(r.user, 'Blockierliste', { images: false });
        if (!dry()) {
          try { await BL.note(m.uid, makeNote(m, q.src)); }
          catch (e) { warn('Notiz fehlgeschlagen', q.nick, e); try { await BL.del(m.uid, m.nick); } catch {} await this.fail(q, 'Fehler: Notiz ließ sich nicht schreiben', st); return 'fail'; }
        }
        await Members.update(m.uid, (x) => { x.blk = { at: now(), src: q.src, note: makeNote(m, q.src), opa: true }; delete x.unblk; });
        await Queue.remove(q.uid); st.ok++; st.items.push({ nick: q.nick, res: 'blockiert' });
        return 'ok';
      }
      const r = await blockOne(m, q.src);
      if (r === 'ok') { await Queue.remove(q.uid); await watchMark(m, false); st.ok++; st.items.push({ nick: q.nick, res: 'blockiert' }); return 'ok'; }
      if (r === 'Test') { st.test++; st.items.push({ nick: q.nick, res: 'Testlauf' }); return 'test'; }
      await this.fail(q, r, st);
      return 'fail';
    },
    // Arbeitet die Warteliste ab, solange erlaubt. manual=true: auch bei ausgeschaltetem Schalter, bis die Liste leer ist.
    async run(reason = 'automatisch', onProgress, opts = {}) {
      if (this.running) return null;
      if (!(await Lock.take('etappe', reason))) return null;
      this.running = true; this.stopFlag = false; this.manual = !!opts.manual;
      const st = { ok: 0, fail: 0, dropped: 0, test: 0, items: [], started: now(), reason };
      let fails = 0, i = 0;
      const done = new Set();                       // im Testlauf bleiben Einträge stehen: jeden nur einmal je Lauf
      try {
        const total0 = await Queue.count();
        for (;;) {
          if (this.stopFlag) break;
          if (!this.manual && !isOn()) break;
          const ho = G.get('blk_handover', null);
          if (ho && ho.tab !== TAB_ID && now() - ho.at < 60000) break;          // ein anderer Tab übernimmt („Jetzt abarbeiten“)
          const pauseUntil = G.get('blk_pause_until', 0);
          if (pauseUntil > now()) { this.setState('pause-fehler'); await sleep(Math.min(5000, pauseUntil - now())); continue; }
          const busy = Prio.busy();
          if (busy) { this.setState('pause'); await sleep(2000); continue; }
          const s = S();
          if ((G.get('blocked_count', 0) || 0) >= s.expert.limit) { st.limit = true; break; }
          const q = (await Queue.list()).find((x) => !done.has(x.uid));
          if (!q) break;
          done.add(q.uid);
          this.setState('blockiert');
          i++;
          const left = await Queue.count();
          if (onProgress) onProgress(i, Math.max(total0, i + left - 1), q);
          Bus.emit('etappe', { running: true, st, i, cur: q });
          let r;
          try { r = await this.one(q, s, st); } catch (e) { warn('Blockieren', e); r = 'fail'; await this.fail(q, 'Fehler: ' + (e.message || e), st); }
          if (r === 'fail') { if (++fails >= 5) { G.set('blk_pause_until', now() + 5 * 60000); fails = 0; } } else if (r === 'ok') fails = 0;
          if (r === 'ok' || r === 'fail') await sleep(rand(s.expert.pauseMin * 1000, s.expert.pauseMax * 1000));
        }
        return st;
      } finally {
        this.running = false; this.manual = false;
        st.ended = now();
        G.set('etappe_last', { at: now(), ok: st.ok, fail: st.fail, dropped: st.dropped, reason });
        Lock.release('etappe');
        this.setState('idle');
        Bus.emit('etappe', { running: false, st });
        Queue.changed();
      }
    },
    async fail(q, msg, st) {
      st.fail++; st.items.push({ nick: q.nick, res: msg });
      q.tries = (q.tries || 0) + 1;
      if (q.tries >= 3) { await Queue.remove(q.uid); await KV.set('failed', { ...(await KV.get('failed', {})), [q.uid]: { nick: q.nick, msg, at: now() } }); }
      else { q.prio = (q.prio || 0) + 100000; await DB.put('queue', q); }           // ans Ende, nächster Versuch später
    },
    stop() { this.stopFlag = true; },
    // Zeitgeber: alle 10 s prüfen, ob blockiert werden soll; Vorgemerkte alle 5 Minuten
    start() {
      setInterval(async () => {
        if (!isOn() || this.running) return;
        if (now() - TAB_SINCE < 60000) return;          // frischer Tab: erst nach einer Minute übernehmen
        if (Lock.other('etappe')) return;
        if (!(await Queue.count())) return;
        this.run('automatisch').catch((e) => warn('Blockieren', e));
      }, 10000);
      setInterval(async () => {
        if (!isOn() || Lock.other('watch')) return;
        if (now() - G.get('watch_at', 0) < 5 * 60000) return;
        G.set('watch_at', now());
        try { const n = await watchDue(); if (n) log(`${n} Vorgemerkte auf die Warteliste.`); } catch (e) { warn('Vormerken', e); }
      }, 60000);
    },
  };

  // =====================================================================================
  // Quellen (Scans). Jede liefert Mitglieder an judge(); Fortschritt über ctx.
  //   ctx = { stop: () => bool, step(i, n, text), add(res) }
  // =====================================================================================
  const newRes = () => ({ total: 0, hits: 0, white: 0, near: 0, unclear: 0, queued: 0, known: 0, unblocked: 0, whitelisted: 0, kicked: 0 });
  const addRes = (a, b) => { for (const k of Object.keys(b)) a[k] = (a[k] || 0) + (b[k] || 0); return a; };

  // ---------- Interaktionen: Likes ----------
  async function scanLikes(ctx) {
    const res = newRes();
    const st = G.get('scan_rates', { newest: 0, complete: false });
    const firstMax = S().expert.firstScanMax;
    const seenU = new Set();
    let page = null, read = 0, newest = st.newest, stopOld = false;
    for (let guard = 0; guard < 5000 && !ctx.stop(); guard++) {
      const d = await apiGet('rates', page ? { _version: 2, page } : { _version: 2 });
      const l = (d && d.rates) || [];
      const users = [];
      for (const r of l) {
        read++;
        const ts = r.timestemp || 0;
        if (ts > newest) newest = ts;
        if (st.complete && ts && ts <= st.newest) { stopOld = true; break; }
        const u = r.user && normUser(r.user);
        if (u && !seenU.has(u.uid)) { seenU.add(u.uid); users.push(u); }
      }
      await seenMany(users, 'Likes');
      addRes(res, await judge(users, 'Likes'));
      ctx.step(read, null, `Likes: ${fmtN(read)} gelesen, ${fmtN(seenU.size)} Mitglieder`);
      if (stopOld || !l.length || !d.next_page) break;
      if (!st.complete && read >= firstMax) break;
      page = d.next_page;
    }
    if (!ctx.stop()) G.set('scan_rates', { newest, complete: true, at: now() });
    return res;
  }

  // ---------- Interaktionen: Sticker ----------
  async function scanStickers(ctx) {
    const res = newRes();
    const me = Me.get() || await loadMe();
    if (!me || !me.uid) throw new Error('Eigene Benutzer-ID unbekannt');
    const st = G.get('scan_gift', { newest: 0, complete: false });
    const firstMax = S().expert.firstScanMax;
    const seenU = new Set();
    let page = null, read = 0, newest = st.newest, stopOld = false;
    for (let guard = 0; guard < 5000 && !ctx.stop(); guard++) {
      const q = { uid: me.uid, limit: 30 };
      if (page) q.page = page;
      const d = await apiGet('my/received/gift', q);
      const l = (d && d.list) || [];
      const users = [];
      for (const g of l) {
        read++;
        const id = +g.id || 0;
        if (id > newest) newest = id;
        if (st.complete && id && id <= st.newest) { stopOld = true; break; }
        const u = normUser(g.user || g);
        if (u && !seenU.has(u.uid)) { seenU.add(u.uid); users.push(u); }
      }
      await seenMany(users, 'Sticker');
      addRes(res, await judge(users, 'Sticker'));
      ctx.step(read, null, `Sticker: ${fmtN(read)} gelesen, ${fmtN(seenU.size)} Mitglieder`);
      if (stopOld || !l.length || !d.next_page) break;
      if (!st.complete && read >= firstMax) break;
      page = d.next_page;
    }
    if (!ctx.stop()) G.set('scan_gift', { newest, complete: true, at: now() });
    return res;
  }

  // ---------- Interaktionen: Nachrichten (Unterhaltungsliste, ohne Nachrichtentexte) ----------
  const DELETED_NICK = /^gelöschter popster$/i;
  async function scanMessages(ctx) {
    const res = newRes();
    const st = G.get('scan_msg', { newest: 0, complete: false });
    const firstMax = S().expert.firstScanMax;
    const seenU = new Set();
    let offset = 0, read = 0, newest = st.newest, stopOld = false;
    for (let guard = 0; guard < 5000 && !ctx.stop(); guard++) {
      const d = await apiPost('messenger/group/list', { offset, filter: 0 });
      const l = (d && d.list) || [];
      const users = [];
      for (const c of l) {
        read++;
        const ts = c.last_updated || 0;
        if (ts > newest) newest = ts;
        if (st.complete && ts && ts <= st.newest) { stopOld = true; break; }
        if (c.group_type !== 1 || !c.group_data) continue;
        const gd = c.group_data;
        if (DELETED_NICK.test(gd.nickname || '')) { await Members.update(gd.uid, (m) => { m.del = m.del || now(); }); continue; }
        const u = normUser(gd);
        if (u && !seenU.has(u.uid)) { seenU.add(u.uid); users.push(u); }
      }
      await seenMany(users, 'Nachrichten');
      addRes(res, await judge(users, 'Nachrichten'));
      ctx.step(read, null, `Nachrichten: ${fmtN(read)} Unterhaltungen`);
      if (stopOld || !l.length || !d.next || d.next === offset) break;
      if (!st.complete && read >= firstMax) break;
      offset = d.next;
    }
    if (!ctx.stop()) G.set('scan_msg', { newest, complete: true, at: now() });
    return res;
  }

  async function scanInteractions(ctx) {
    const res = newRes();
    for (const [name, fn] of [['Likes', scanLikes], ['Sticker', scanStickers], ['Nachrichten', scanMessages]]) {
      if (ctx.stop()) break;
      ctx.phase && ctx.phase(name);
      try { addRes(res, await fn(ctx)); } catch (e) { ctx.error && ctx.error(name, e); }
    }
    return res;
  }

  // ---------- Profilbesucher (Seite, unsichtbar geladen) ----------
  function visitorItems(doc) {
    return [...doc.querySelectorAll('main .ant-list-items .ant-list-item, main .ant-list-item')].map((item) => {
      const a = item.querySelector('.ant-card-meta-title a[href^="/p/"]') || item.querySelector('a[href^="/p/"]');
      if (!a) return null;
      const desc = (item.querySelector('.ant-card-meta-description') || item).textContent || '';
      const img = item.querySelector('img');
      const src = img ? img.getAttribute('src') : '';
      const nick = a.getAttribute('title') || a.textContent.trim();
      return { item, nick, uid: uidFromAvatar(src), ages: agesFromText(desc), g: genderFromText(desc), avatar: isPlaceholderAvatar(src) ? '' : src };
    }).filter(Boolean);
  }
  function scroller(el, doc = document) {
    const w = doc.defaultView;
    for (let e = el; e && e !== doc.body; e = e.parentElement) {
      const oy = w.getComputedStyle(e).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight + 10) return e;
    }
    return doc.scrollingElement || doc.documentElement;
  }
  // Liste durchscrollen und alle Einträge einsammeln
  async function collectList(doc, itemsFn, ctx, { max = 100000, label = 'Einträge', stopWhen } = {}) {
    const all = new Map();
    const first = await waitFor(() => itemsFn(doc)[0], 15000);
    if (!first) return all;
    const sc = scroller(first.item, doc);
    sc.scrollTop = 0;
    await sleep(500);
    let idle = 0;
    for (let i = 0; i < 20000 && idle < 5 && !ctx.stop(); i++) {
      const before = all.size;
      for (const x of itemsFn(doc)) if (!all.has(x.nick)) all.set(x.nick, x);
      ctx.step(all.size, null, `${label}: ${fmtN(all.size)} gelesen`);
      if (all.size >= max) break;
      if (stopWhen && stopWhen(all)) break;
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5;
      idle = all.size === before && atBottom ? idle + 1 : 0;
      sc.scrollTop += Math.max(300, sc.clientHeight * 0.8);
      await sleep(atBottom ? 1000 : 350);
    }
    return all;
  }
  async function scanVisitors(ctx) {
    const res = newRes();
    const st = G.get('scan_vis', { complete: false, at: 0 });
    const onPage = location.pathname.startsWith('/connection/visitors');
    const doc = onPage ? document : await Frame.load('/connection/visitors', (d) => visitorItems(d).length || d.querySelector('main .ant-empty'), 30000);
    if (!doc) throw new Error('Besucherliste nicht ladbar');
    let knownRun = 0;
    const all = await collectList(doc, visitorItems, ctx, {
      max: st.complete ? 100000 : S().expert.firstScanMax, label: 'Profilbesucher',
      // Folgescans: aufhören, sobald 30 Mitglieder hintereinander schon beim letzten Scan gesehen wurden
      stopWhen: (map) => {
        if (!st.complete) return false;
        knownRun = 0;
        for (const x of [...map.values()].slice(-30)) { const m = x.uid && Members.cached().get(x.uid); if (m && m.seen && m.seen.Besucher && m.seen.Besucher < st.at) knownRun++; }
        return knownRun >= 30;
      },
    });
    const list = [...all.values()].map(({ item, ...x }) => x);
    for (const x of list) {
      if (!x.uid) { const m = await Members.byNick(x.nick); if (m) x.uid = m.uid; }
      if (x.uid) await seen(x, 'Besucher');
    }
    addRes(res, await judge(list, 'Besucher'));
    if (!onPage) Frame.remove();
    if (!ctx.stop()) G.set('scan_vis', { complete: true, at: now() });
    return res;
  }

  // ---------- Freunde und Favoriten (friends/list, favourite/list) ----------
  // Beide Listen haben denselben Aufbau: { users, next_page, total_count }. Alle Einträge → automatische Whitelist.
  const FF = { friend: { path: 'friends/list', label: 'Freund' }, fav: { path: 'favourite/list', label: 'Favorit' } };
  const validUid = (u) => u && /^\d+$/.test(String(u.uid || '')) && !u.is_blurry && !/^\S\*{3,}$/.test(u.nickname || '');
  async function readFF(kind, ctx) {
    const out = [];
    let page = 1;
    for (let guard = 0; guard < 1000 && !(ctx && ctx.stop && ctx.stop()); guard++) {
      const d = await apiPost(FF[kind].path, { sort: 'online', page });
      const l = (d && d.users) || [];
      for (const u of l) { if (validUid(u)) out.push(u); else warn(`${FF[kind].label}: Eintrag ohne gültige uid übersprungen`, u && Object.keys(u)); }
      if (!l.length || !d.next_page || d.next_page === page) break;
      page = d.next_page;
    }
    return out;
  }
  async function markFF(kind, users, { complete = false, ctx = null } = {}) {
    const res = { whitelisted: 0, unblocked: 0 };
    const ids = new Set();
    for (const u of users) {
      const m = await seen(u, FF[kind].label === 'Freund' ? 'Freunde' : 'Favoriten', { images: false });
      if (!m) continue;
      ids.add(m.uid);
      const was = !!(m.auto && m.auto[kind]);
      await Members.update(m.uid, (x) => { x.auto = x.auto || {}; x.auto[kind] = now(); });
      if (!was) res.whitelisted++;
      if (m.blk && m.blk.opa && !m.unblk) {
        const r = await unblockOne(m);
        if (r === 'ok' || r === 'Test') { res.unblocked++; if (ctx && ctx.notes) ctx.notes.push(`${m.nick}: entsperrt (${FF[kind].label})`); else log(`${m.nick}: entsperrt (${FF[kind].label})`); }
      }
    }
    if (complete) {
      const gone = [];
      await Members.each((m) => { if (m.auto && m.auto[kind] && !ids.has(m.uid)) gone.push(m.uid); });
      for (const uid of gone) await Members.update(uid, (x) => { delete x.auto[kind]; if (kind === 'friend') delete x.friend; });
    }
    return res;
  }
  async function refreshFriendsFavs(ctx) {
    const res = newRes();
    for (const kind of ['friend', 'fav']) {
      try { const l = await readFF(kind, ctx); if (ctx && ctx.stop && ctx.stop()) break; addRes(res, await markFF(kind, l, { complete: true, ctx })); }
      catch (e) { warn(FF[kind].label, e); }
    }
    G.set('ff_at', now());
    return res;
  }

  // ---------- user/info: Angaben eines Profils ----------
  async function ingestUserInfo(d) {
    const ui = d && d.userInfo, tr = d && d.user_trait;
    if (!ui || !/^\d+$/.test(String(ui.uid || ''))) return null;
    const m = await seen({ uid: ui.uid, nickname: ui.nickname, gender: Array.isArray(tr && tr.gender) ? tr.gender : [ui.gender], age: ui.age, avatar: ui.avatar, payclass: ui.userClass }, 'Profil', { images: false });
    if (!m || !tr) return m;
    const g = Array.isArray(tr.gender) ? tr.gender : [];
    const h = +((tr.size || [])[0] || 0), w = +((tr.weight || [])[0] || 0);
    if (g.length <= 1 && h >= 120 && h <= 230 && w >= 30 && w <= 350) {
      await Members.update(m.uid, (x) => { x.body = [{ h, wlo: w, whi: w, at: now(), src: 'Profil', fig: (tr.figure_name || [])[0] || 0 }]; delete x.bodyUnk; });
    }
    return m;
  }

  // ---------- Gruppen ----------
  async function myGroups(subset) {
    const out = [];
    let page = 1;
    for (let guard = 0; guard < 200; guard++) {
      const d = await apiGet('group/my', { _version: 2, page, subset, limit: 25, ...(subset === 'managed' ? { sort: 'pending_count' } : {}) });
      const l = (d && d.cms_list) || [];
      out.push(...l.map((g) => ({ cms: String(g.cms_id), name: g.name, url: g.profile_url, count: g.attendee_count || 0, pending: g.pending_count || 0, role: g.creator_status || '', subset })));
      if (!l.length || !d.next_page || d.next_page === page) break;
      page = d.next_page;
    }
    return out;
  }
  async function loadGroups() {
    const [managed, attended] = await Promise.all([myGroups('managed'), myGroups('attended')]);
    const names = { ...G.get('groupnames', {}) };
    for (const g of [...managed, ...attended]) names[g.cms] = g.name;
    G.set('groupnames', names);
    G.set('groups', { managed, attended: attended.filter((a) => !managed.some((m) => m.cms === a.cms)), at: now() });
    G.set('pending', { n: managed.reduce((s, g) => s + g.pending, 0), groups: managed.filter((g) => g.pending).map((g) => ({ cms: g.cms, name: g.name, n: g.pending })), at: now() });
    Bus.emit('pending');
    return G.get('groups');
  }
  async function groupMembers(cms, ctx, onPage) {
    let page = 1, n = 0, meta = null;
    ctx = ctx || { stop: () => false };
    for (let guard = 0; guard < 100000 && !ctx.stop(); guard++) {
      const d = await apiGet('group/attendee/list', { _version: 2, page, cms_id: cms, limit: 30 });
      const l = (d && d.users) || [];
      if (!meta) meta = { total: d.total || 0, invisible: d.invisible_count || 0, masked: 0 };
      n += l.length;
      const valid = l.map(normUser).filter(Boolean);
      meta.masked += l.length - valid.length;
      // nur verschleierte Mitglieder: Gruppe nicht einsehbar, nicht weiter blättern
      if (page === 1 && l.length && !valid.length) { meta.hidden = true; break; }
      await onPage(valid, page, meta);
      if (!l.length || !d.next_page || d.next_page === page) break;
      page = d.next_page;
    }
    return { n, meta };
  }
  // Verwaltungsliste einer eigenen Gruppe (unverschleiert). Mit keyword = Namenssuche.
  async function manageMembers(cms, ctx, onPage, { keyword = '', sort = 'last_joined' } = {}) {
    let page = 1, n = 0, meta = null;
    ctx = ctx || { stop: () => false };
    for (let guard = 0; guard < 100000 && !ctx.stop(); guard++) {
      const d = await apiPost('group/attendee/manage/list', { cms_id: cms, page, limit: 30, keyword, sort }, { _version: 2 });
      const l = (d && d.users) || [];
      if (!meta) meta = { total: d.total || 0 };
      n += l.length;
      await onPage(l.map(normUser).filter(Boolean), page, meta);
      if (!l.length || !d.next_page || d.next_page === page) break;
      page = d.next_page;
    }
    return { n, meta };
  }
  // „Besonders böse Popsters“ aus den Einstellungen: User-IDs und Nicknames getrennt
  function evilTargets(s = S()) {
    const list = (s.expert.evil || []).map((t) => String(t).trim()).filter(Boolean);
    const uids = new Set(list.filter((t) => /^\d+$/.test(t)));
    for (const u of G.get('evil_ids', [])) uids.add(String(u));     // dauerhafte ID-Liste aus dem Tampermonkey-Speicher
    const nicks = new Set(list.filter((t) => !/^\d+$/.test(t)).map((t) => t.toLowerCase()));
    return { size: uids.size + nicks.size, uids, nicks };
  }
  const isEvil = (u, evil) => evil.size && (evil.uids.has(String(u.uid)) || evil.nicks.has((u.nick || '').toLowerCase()));
  // Ein Mitglied aus einer verwalteten Gruppe entfernen (mit Vermerk). Braucht den Nickname.
  async function kickEvil(g, u, res, ctx) {
    const when = new Date();
    const note = `Ignorant (${g.name}) blockiert am ${deDate(when)} um ${deTime(when)}`;
    if (dry()) { log('Testlauf – würde entfernen:', u.nick, 'aus', g.name); (ctx.notes || []).push(`${u.nick}: würde aus ${g.name} entfernt (Testlauf)`); res.kicked++; return; }
    try { await apiPost('group/attendee/note', { cms_id: g.cms, nickname: u.nick, note }, { _version: 2 }); }
    catch (e) { warn('Gruppennotiz', u.nick, e); }
    try {
      await apiPost('group/attendee/kick', { cms_id: g.cms, nickname: u.nick }, { _version: 2 });
      res.kicked++; (ctx.notes || []).push(`${u.nick}: aus ${g.name} entfernt (besonders böse)`);
      await Members.update(u.uid, (x) => { x.kicked = x.kicked || {}; x.kicked[g.cms] = now(); });
    } catch (e) { warn('Entfernen', u.nick, e); (ctx.notes || []).push(`${u.nick}: Entfernen aus ${g.name} fehlgeschlagen (${e.message})`); }
  }
  // Zuordnung ID → Nickname für die bösen Popsters liegt dauerhaft im Tampermonkey-Speicher (überlebt das Löschen der poppen.de-Browserdaten).
  const evilNames = () => G.get('evil_names', {});
  // Anzeigeliste (Nicknames, alphabetisch) aus den gemerkten IDs aufbauen und in die Einstellungen schreiben
  function buildEvilList() {
    const names = evilNames();
    const seenE = new Set();
    const list = G.get('evil_ids', [])
      .map((uid) => names[uid] || String(uid))
      .filter((e) => { const k = e.toLowerCase(); if (seenE.has(k)) return false; seenE.add(k); return true; })
      .sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    const s = clone(S());
    if (same(s.expert.evil || [], list)) return;
    s.expert.evil = list;
    saveSettings(s);
  }
  // „Besonders böse Popsters“ aus der Liste der mich blockierenden Popsters füllen (ersetzt den bisherigen Inhalt).
  // Nick-Auflösung: zuerst der Tampermonkey-Speicher; nur wenn dort noch keine Zuordnung steht, das Profilgedächtnis (und von dort in den TM-Speicher kopieren).
  async function refreshEvilFromBlockers() {
    let d;
    try { d = await apiGet('ignore/be-ignored/uid/list', { _version: 2 }); }
    catch (e) { warn('Blockierer-Liste', e); return; }
    const uids = [...new Set(((d && d.list) || []).map(String).filter((u) => /^\d+$/.test(u)))];
    G.set('evil_at', now());
    G.set('evil_ids', uids);
    const names = evilNames();
    let changed = false;
    for (const uid of uids) {
      if (names[uid]) continue;                          // TM-Speicher hat bereits eine Zuordnung → Gedächtnis nicht nötig
      const m = Members.cached().get(uid) || await Members.get(uid).catch(() => null);
      if (m && m.nick) { names[uid] = m.nick; changed = true; }
    }
    if (changed) G.set('evil_names', names);
    buildEvilList();
    log(`Besonders böse Popsters aus Blockierer-Liste ersetzt: ${uids.length} Einträge.`);
  }
  // Umgekehrt: TM-Speicher aus dem Profilgedächtnis nachführen, falls sich ein Nick geändert hat, die ID aber gleich blieb.
  async function syncEvilNames() {
    const names = evilNames();
    let changed = false;
    for (const uid of G.get('evil_ids', [])) {
      const m = Members.cached().get(uid) || await Members.get(uid).catch(() => null);
      if (m && m.nick && m.nick !== names[uid]) { names[uid] = m.nick; changed = true; }
    }
    if (changed) { G.set('evil_names', names); buildEvilList(); log('Besonders böse Popsters: Nicknames aus dem Gedächtnis nachgeführt.'); }
  }

  // ---------- Gruppen-Leitung (Besitzer + Moderatoren) ----------
  // Antwortformate sind nicht fest dokumentiert: Mitglieder-Objekte (uid + nickname) werden gesucht.
  function findUsers(d, keyRe, depth = 0, under = false) {
    const out = [];
    if (!d || typeof d !== 'object' || depth > 6) return out;
    if (Array.isArray(d)) { for (const x of d) out.push(...findUsers(x, keyRe, depth + 1, under)); return out; }
    if (under && (d.uid || d.user_id) && (d.nickname || d.name)) { const u = normUser(d); if (u) out.push(u); return out; }
    for (const [k, v] of Object.entries(d)) if (v && typeof v === 'object') out.push(...findUsers(v, keyRe, depth + 1, under || !keyRe || keyRe.test(k)));
    return out;
  }
  async function groupLead(cms) {
    const lead = new Map();
    try {
      const d = await apiGet('group/profile', { _version: 2, cms_id: cms });
      for (const u of findUsers(d, /creator|owner|besitzer/i)) lead.set(u.uid, { ...u, role: 'owner' });
    } catch (e) { warn('Gruppen-Besitzer ' + cms, e); }
    let mods = [];
    try {
      const d = await apiPost('group/moderator/list', { cms_id: cms });
      mods = findUsers(d, null).filter((u, i, l) => l.findIndex((x) => x.uid === u.uid) === i);
      for (const u of mods) if (!lead.has(u.uid)) lead.set(u.uid, { ...u, role: 'moderator' });
    } catch (e) { warn('Gruppen-Moderatoren ' + cms, e); mods = null; }
    return { lead: [...lead.values()], mods };
  }
  // Allein in der Leitung: als Moderator nie (es gibt den Besitzer); als Besitzer, wenn außer mir niemand moderiert.
  // Eigene weitere Profile zählen nicht als „ich“.
  function aloneIn(g, info) {
    if (g.role !== 'owner') return false;
    if (!info || info.mods == null) return false;            // Liste nicht lesbar → vorsichtshalber nicht allein
    const me = String(Me.uid());
    return !info.mods.some((u) => u.uid !== me);
  }

  // ---------- Gruppen (Whitelist) ----------
  // Leitung aller Gruppen → Whitelist (Geblockte entsperren); verwaltete Gruppen, die ich allein leite → alle Mitglieder Whitelist;
  // leite ich nicht allein → Whitelist-Einträge dieser Gruppe sofort entfernen, Mitglieder nach den Regeln behandeln (nur im Scan).
  async function refreshManagedWhitelist(ctx, groups) {
    const res = newRes();
    const s = S();
    groups = groups || (await loadGroups());
    const me = String(Me.uid());
    const all = [...groups.managed, ...groups.attended];
    const t0 = now();
    const alone = {};
    const unblock = async (m, why) => {
      if (m && m.blk && m.blk.opa && !m.unblk) {
        const r = await unblockOne(m);
        if (r === 'ok' || r === 'Test') { res.unblocked++; (ctx.notes || []).push(`${m.nick}: entsperrt, ${why}`); }
      }
    };
    // 1) Leitung aller Gruppen
    let gi = 0;
    for (const g of all) {
      if (ctx.stop()) return res;
      gi++;
      ctx.phase && ctx.phase(`Leitung ${gi}/${all.length}: ${g.name}`);
      ctx.outer && ctx.outer(gi - 1, all.length * 2);
      const info = await groupLead(g.cms);
      if (g.subset === 'managed') alone[g.cms] = aloneIn(g, info);
      for (const u of info.lead) {
        if (u.uid === me) continue;
        const m = await seen(u, 'Gruppen', { images: false });
        if (!m) continue;
        const was = !!(m.auto && m.auto.lead && m.auto.lead[g.cms]);
        await Members.update(u.uid, (x) => { x.auto = x.auto || {}; x.auto.lead = x.auto.lead || {}; x.auto.lead[g.cms] = now(); });
        if (!was) res.whitelisted++;
        await unblock(m, `weil ${u.role === 'owner' ? 'Besitzer' : 'Moderator'} von ${g.name}`);
      }
      ctx.step(gi, all.length, `${g.name}: ${info.lead.length} in der Leitung`);
    }
    // nicht mehr in der Leitung → Eintrag weg
    const ids = new Set(all.map((g) => g.cms));
    const stale = [];
    await Members.each((m) => { const l = m.auto && m.auto.lead; if (l && Object.entries(l).some(([c, ts]) => ts < t0 && ids.has(c))) stale.push(m.uid); });
    for (const uid of stale) await Members.update(uid, (x) => { for (const [c, ts] of Object.entries(x.auto.lead)) if (ts < t0 && ids.has(c)) delete x.auto.lead[c]; });
    // 2) verwaltete Gruppen: Whitelist + besonders böse Popsters entfernen (über die Verwaltungsliste, unverschleiert)
    const managed = groups.managed;   // in allen verwalteten Gruppen kann entfernt werden
    const evil = evilTargets(s);
    gi = 0;
    for (const g of managed) {
      if (ctx.stop()) break;
      gi++;
      ctx.outer && ctx.outer(all.length + gi - 1, all.length * 2);
      const wlOn = s.managedWhitelist[g.cms] !== false;
      const doWhite = wlOn && alone[g.cms];
      if (wlOn && !alone[g.cms]) {
        // nicht allein in der Leitung: Gruppen-Whitelist dieser Gruppe sofort entfernen
        const drop = [];
        await Members.each((m) => { if (m.auto && m.auto.grp && m.auto.grp[g.cms]) drop.push(m.uid); });
        for (const uid of drop) await Members.update(uid, (x) => { delete x.auto.grp[g.cms]; });
        if (drop.length) log(`${g.name}: nicht allein in der Leitung – ${drop.length} Whitelist-Einträge entfernt.`);
      }
      const judgeHere = ctx.full && wlOn && !alone[g.cms];   // nicht allein → Mitglieder nach den Regeln prüfen
      if (!(doWhite || judgeHere || evil.size)) continue;
      ctx.phase && ctx.phase(`${doWhite ? 'Whitelist' : 'Prüfen'}: ${g.name}`);
      const seenIds = new Set();
      const toKick = [];
      const { meta } = await manageMembers(g.cms, ctx, async (users, page, meta) => {
        for (const u of users) {
          if (String(u.uid) === me) continue;
          seenIds.add(u.uid);
          if (isEvil(u, evil)) toKick.push(u);
          if (doWhite) {
            const m = await seen(u, 'Gruppen', { images: false });
            const was = !!(m.auto && m.auto.grp && m.auto.grp[g.cms]);
            await Members.update(u.uid, (x) => { x.auto = x.auto || {}; x.auto.grp = x.auto.grp || {}; x.auto.grp[g.cms] = now(); });
            if (!was) res.whitelisted++;
            await unblock(m, `weil Mitglied in ${g.name}`);
          } else if (judgeHere) {
            await seen(u, 'Gruppen', { images: false });
          }
        }
        if (judgeHere) addRes(res, await judge(users, 'Gruppen'));
        ctx.step(page * 30, Math.max(1, meta.total), `${g.name}: ${fmtN(seenIds.size)} Mitglieder`);
      });
      // besonders böse Popsters entfernen, nachdem die Liste geladen ist
      for (const u of toKick) { if (ctx.stop()) break; await kickEvil(g, u, res, ctx); }
      if (ctx.stop() || !meta) break;
    }
    G.set('grp_alone', alone);
    if (!ctx.stop()) G.set('grp_wl_at', now());
    ctx.outer && ctx.outer(1, 1);
    return res;
  }
  const scanGroupsWhite = async (ctx) => { const r = await refreshManagedWhitelist({ ...ctx, full: true }); await syncEvilNames().catch((e) => warn('Nick-Abgleich', e)); return r; };

  // ---------- Gruppen (Blacklist) ----------
  // Mitglieder der Gruppen, in denen ich Mitglied bin, nach den Regeln prüfen (Whitelist wird in judge berücksichtigt)
  async function scanGroupsBlack(ctx) {
    const res = newRes();
    const groups = await loadGroups();
    const s = S();
    const list = groups.attended.filter((g) => s.groupScan[g.cms] !== false);
    let gi = 0;
    for (const g of list) {
      if (ctx.stop()) break;
      gi++;
      ctx.phase && ctx.phase(`Gruppe ${gi}/${list.length}: ${g.name}`);
      ctx.outer && ctx.outer(gi - 1, list.length);
      await groupMembers(g.cms, ctx, async (users, page, meta) => {
        for (const u of users) await seen(u, 'Gruppen', { images: false });
        addRes(res, await judge(users, 'Gruppen'));
        ctx.step(page * 30, Math.max(1, meta.total - meta.invisible), `${g.name}: Seite ${page}`);
      });
    }
    ctx.outer && ctx.outer(list.length, list.length);
    return res;
  }
  async function scanGroups(ctx) { const r = await scanGroupsWhite(ctx); return addRes(r, await scanGroupsBlack(ctx)); }

  // ---------- Mitgliedersuche, systematisch (Alter für Alter, ganz Deutschland) ----------
  function searchBase() {
    const loc = G.get('mygeo', null) || { country_iso: 'DE', country_name: 'Germany' };
    return {
      location: { ...loc, distance: 0, distance_unit: 'km' }, has_image: 0, online: false, enable_search_gender: false,
      sort: ['last_riseup'], order: ['desc'], preference_conjunction: 'or', second_preference_conjunction: 'or',
      size_min: 130, size_max: 220, weight_min: 0, weight_max: 300, enable_fakecheck_status: false,
    };
  }
  async function searchAll(payload, ctx, onUsers, label) {
    let page = 1, n = 0, total = 0;
    for (let guard = 0; guard < 100000 && !ctx.stop(); guard++) {
      const d = await apiPost('user/search', { ...payload, page, limit: 20 });
      const l = (d && d.users) || [];
      total = d.total || total;
      n += l.length;
      await onUsers(l.map(normUser).filter(Boolean), page, total);
      if (label) ctx.step(n, total, `${label}: ${fmtN(n)} von ${fmtN(total)}`);
      if (!l.length || !d.next_page || d.next_page === page) break;
      page = d.next_page;
    }
    return { n, total };
  }
  async function scanSearch(ctx) {
    const res = newRes();
    const s = S();
    const base = searchBase();
    const plan = [];
    for (const gk of GROUP_KEYS) {
      const grp = s.groups[gk];
      if (!grp.ignore) continue;
      const lims = gk === 'p' && grp.separate ? [grp.srcW.suche[2], grp.srcM.suche[2]] : [grp.src.suche[2]];
      let from = Math.min(...lims);
      if (gk === 'p' && (grp.sugarDaddy.on || grp.sugarMom.on)) from = 18;
      for (const t of grp.types) plan.push({ gk, t, from });
    }
    const steps = plan.reduce((a, p) => a + (99 - p.from + 1), 0);
    let done = 0;
    for (const p of plan) {
      for (let age = 98; age >= p.from && !ctx.stop(); age--) {
        ctx.outer && ctx.outer(done++, steps);
        ctx.phase && ctx.phase(`Mitgliedersuche: ${TYPE_NAMES[p.t]} · ${age} Jahre`);
        await searchAll({ ...base, genders: [p.t], age_min: age, age_max: age }, ctx, async (users) => {
          for (const u of users) await seen(u, 'Suche', { images: false });
          addRes(res, await judge(users, 'Suche'));
        }, `${TYPE_NAMES[p.t]}, ${age} Jahre`);
      }
    }
    ctx.outer && ctx.outer(steps, steps);
    return res;
  }

  // Treffer der Seite (Hooks): Antworten, die die Seite selbst lädt, nebenbei verbuchen
  function installPassiveHooks() {
    onApi(/^rates$/, (d) => seenMany(((d && d.rates) || []).map((r) => r.user).filter(Boolean), 'Likes'));
    onApi(/^my\/received\/gift$/, (d) => seenMany(((d && d.list) || []).map((g) => g.user).filter(Boolean), 'Sticker'));
    onApi(/^messenger\/group\/list$/, (d) => seenMany(((d && d.list) || []).filter((c) => c.group_type === 1 && c.group_data && !DELETED_NICK.test(c.group_data.nickname || '')).map((c) => c.group_data), 'Nachrichten'));
    onApi(/^group\/attendee\/list$/, (d) => seenMany((d && d.users) || [], 'Gruppen', { images: false }));
    onApi(/^user\/search$/, (d, info) => {
      if (info.body && info.body.location && info.body.location.geo_id && !G.get('mygeo', null)) {
        const { distance, distance_unit, ...geo } = info.body.location; G.set('mygeo', geo);
      }
      return seenMany((d && d.users) || [], 'Suche', { images: false });
    });
    onApi(/^v2\/ignore\/list$/, (d) => {
      const l = (d && d.list) || [];
      return Promise.all(l.map(async (e) => {
        const m = await seen(e.user, 'Blockierliste', { images: false });
        if (m) await Members.update(m.uid, (x) => { const pn = parseNote(e.note); x.blk = { at: pn ? pn.at : (x.blk && x.blk.at) || now(), src: pn ? pn.src : '', note: e.note || '', opa: !!pn }; delete x.unblk; });
      }));
    });
    onApi(/^messenger\/p2p\/profile\/display$/, () => {});
    // Profil-Angaben (user/info/<nick>): genaue Größe und Gewicht ins Gedächtnis (Figur-Badges)
    onApi(/^user\/info\/[^/]+$/, async (d) => { try { await ingestUserInfo(d); } catch (e) { warn('user/info', e); } });
    // eigene Freunde/Favoriten (ohne uid im Body; mit uid sind es die Freunde eines anderen Mitglieds)
    onApi(/^friends\/list$/, (d, info) => { if (info.body && info.body.uid) return; return markFF('friend', ((d && d.users) || []).filter(validUid)); });
    onApi(/^favourite\/list$/, (d, info) => { if (info.body && info.body.uid) return; return markFF('fav', ((d && d.users) || []).filter(validUid)); });
  }

  // =====================================================================================
  // Oberfläche: Stile, Popups im poppen-Stil, Markierungen
  // =====================================================================================
  const OLD_MAN_PATH = 'M3408 12790 c-235 -43 -487 -227 -651 -477 -33 -50 -47 -63 -67 -63 -37 0 -119 -24 -168 -49 -102 -52 -148 -120 -201 -298 -48 -164 -73 -337 -69 -483 3 -112 6 -131 30 -180 15 -30 41 -64 58 -75 29 -19 30 -23 30 -92 0 -39 -3 -74 -8 -77 -4 -2 -86 -1 -182 4 -273 12 -411 -7 -566 -80 -227 -105 -387 -276 -518 -551 -127 -266 -203 -574 -253 -1019 -22 -199 -25 -1016 -5 -1265 20 -240 60 -603 82 -750 12 -82 15 -131 9 -133 -6 -3 -6 -8 0 -16 7 -8 -3 -51 -30 -136 -109 -339 -191 -737 -235 -1140 -22 -191 -25 -693 -6 -845 33 -258 72 -434 158 -699 234 -721 431 -1986 554 -3566 12 -145 22 -265 23 -266 1 -1 52 -16 114 -34 98 -29 113 -36 121 -59 45 -127 347 -276 743 -366 622 -140 1209 -69 1131 137 l-10 28 168 0 c273 0 423 30 492 100 62 62 50 120 -43 204 -59 53 -250 150 -377 191 l-84 27 6 77 c35 439 116 2702 166 4611 15 587 12 548 44 595 65 94 130 255 161 400 9 44 19 87 21 97 4 13 23 4 102 -49 201 -134 411 -220 617 -252 109 -16 209 -22 222 -14 18 13 32 57 39 126 l6 64 69 -35 69 -36 0 -156 c0 -170 4 -186 60 -215 37 -19 64 -19 104 0 55 26 61 45 66 214 l5 155 28 7 27 7 0 -2924 c0 -3216 -5 -2965 60 -2999 62 -32 136 -10 164 49 15 31 16 279 16 3052 l0 3017 25 64 c99 246 -33 525 -286 604 -33 10 -83 19 -110 19 -27 0 -60 6 -72 14 -37 24 -132 36 -367 46 -124 6 -272 15 -330 20 -98 9 -467 74 -476 83 -3 2 -9 91 -14 198 -27 543 -53 829 -125 1389 l-6 45 53 35 c141 94 296 282 422 513 20 37 42 67 49 67 7 0 46 -17 87 -38 59 -29 78 -45 93 -74 30 -59 36 -140 25 -308 -13 -195 -6 -359 17 -424 26 -71 104 -148 178 -175 200 -73 369 48 421 302 9 42 16 81 16 86 0 17 -87 71 -148 92 -72 26 -220 28 -308 5 -34 -9 -66 -16 -72 -16 -5 0 -11 71 -15 173 -4 137 -9 186 -26 239 -28 89 -88 155 -173 193 -35 15 -65 29 -66 31 -2 1 10 39 27 83 40 105 106 337 122 433 11 69 16 78 40 88 77 32 105 336 42 457 -16 31 -21 68 -27 190 -4 84 -14 199 -21 255 -14 100 -13 104 6 120 23 19 35 74 25 113 -6 24 -10 26 -39 21 l-32 -6 -19 82 c-10 46 -35 137 -57 203 -171 527 -466 883 -824 994 -79 25 -249 36 -327 21z';
  const oldManSvg = (scale = 1.25) => `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 640 1280" preserveAspectRatio="xMidYMid meet" fill="currentColor" style="transform:scale(${scale})"><g transform="translate(0,1280) scale(0.1,-0.1)"><path d="${OLD_MAN_PATH}"></path></g></svg>`;

  // Opa mit Stift (Menüeintrag „Opa-Schutz“): Stift von „Profil bearbeiten“ verkleinert unten rechts, mit Rand in Hintergrundfarbe
  const PEN_PATH = 'M21.988 2.514C21.14 1.698 19.395.258 18.273.057c-1.873-.328-3.069.826-4.222 1.938-1.82 1.758-3.62 3.6-5.365 5.38-2.19 2.244-4.455 4.553-6.794 6.734-.836.922-.846 1.673-.857 2.626 0 .202 0 .403-.01.625-.053 1.165-.085 2.542 0 3.908.116 1.99.687 2.541 2.74 2.658A42 42 0 0 0 6.326 24c.836 0 1.661-.021 2.392-.074.952-.064 1.534-.307 2.158-.868 2.074-1.885 4.085-3.993 6.032-6.026 2.064-2.16 4.19-4.395 6.413-6.375 1.069-.964 1.63-2.001 1.65-3.092.032-1.906-1.565-3.707-2.973-5.051zm-1.778 8.672-9.789 9.732-.127-.052c-1.598-2.097-3.576-4.078-6.2-6.238l9.745-9.838c.37.138 2.074 1.494 2.54 1.896 1.249 1.112 2.35 2.33 3.196 3.516l.137.2s.085.107.138.17c.106.127.423.52.37.604zM15.194 3.52a7 7 0 0 1 .444-.52c1.037-1.111 1.937-1.408 2.847-.931.444.233 1.185.826 1.735 1.302l.477.435c.846.815 2.18 2.53 2.338 3.61.127.9-.624 1.578-1.29 2.182-.075.064-.149.138-.223.201l-1.714-2.181c-1.45-1.567-2.91-2.88-4.487-4.024a.6.6 0 0 0-.138-.074zM8.982 22.062h-.37c-1.418.074-2.89.127-4.318.064-.074 0-.137-.021-.211-.032-.074-.021-.149-.032-.223-.043h-.306c-.35.022-.604.022-.635-.137-.106-2.298-.117-4.183-.011-5.93.064.042.148.106.275.211 1.905 1.515 3.556 3.145 5.185 5.126l.096.116s.042.053.084.096c.212.243.36.413.445.53h-.01Z';
  const oldManPenSvg = () => `<span style="position:relative;display:inline-flex;width:1em;height:1em">${oldManSvg(1)}<svg viewBox="0 0 25 24" width="0.62em" height="0.62em" style="position:absolute;right:-0.28em;bottom:-0.12em;overflow:visible" aria-hidden="true"><path d="${PEN_PATH}" fill="none" stroke="var(--vaf-menu-bg,#1f1f1f)" stroke-width="5" stroke-linejoin="round"/><path d="${PEN_PATH}" fill="currentColor"/></svg></span>`;

  const UI_CSS = `
  .vaf-ov{position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1.45;color:#e8e8e8}
  .vaf-ov, .vaf-ov button, .vaf-ov input, .vaf-ov select, .vaf-ov textarea{font-family:inherit}
  .vaf-md{width:min(640px,94vw);max-height:92vh;overflow:auto;background:#1f1f1f;border-radius:18px;padding:24px 24px 20px;box-shadow:0 12px 40px rgba(0,0,0,.6)}
  .vaf-md.vaf-wide{width:min(900px,96vw)}
  .vaf-md h2{margin:0;font-size:22px;font-weight:700;color:#fff}
  .vaf-md h3{margin:14px 0 6px;font-size:15px;color:#fff}
  .vaf-sub{color:#a6a6a6;margin:4px 0 16px}
  .vaf-warn{background:rgba(255,194,26,.14);color:#ffd35c;border-radius:10px;padding:8px 12px;margin-bottom:14px}
  .vaf-err{background:rgba(229,57,53,.15);color:#ff8a80;border-radius:10px;padding:8px 12px;margin-bottom:14px}
  .vaf-bar{height:10px;background:#333;border-radius:6px;overflow:hidden;margin:6px 0 4px}
  .vaf-bar>div{height:100%;background:#ffc21a;width:0;transition:width .3s}
  .vaf-cur{color:#a6a6a6;font-size:13px;margin-bottom:10px;min-height:19px}
  .vaf-stats{display:grid;grid-template-columns:1fr auto;gap:4px 16px;background:#2a2a2a;border-radius:12px;padding:12px 14px;margin-bottom:16px}
  .vaf-stats b{color:#fff;text-align:right}
  .vaf-btns{display:flex;flex-direction:column;gap:10px}
  .vaf-btns.vaf-row{flex-direction:row;flex-wrap:wrap}
  .vaf-big{width:100%;border:0;border-radius:12px;padding:12px;font-weight:700;font-size:15px;cursor:pointer;background:#3a3a3a;color:#fff}
  .vaf-row .vaf-big{width:auto;flex:1 1 auto}
  .vaf-big.vaf-pri{background:#ffc21a;color:#141414}
  .vaf-big:disabled{opacity:.45;cursor:default}
  .vaf-big.vaf-focus{outline:2px solid #fff;outline-offset:-2px}
  .vaf-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px}
  .vaf-tilew{display:flex;flex-direction:column;gap:4px}.vaf-tilew .vaf-tile{flex:1;width:100%}
  .vaf-tsel{font-size:12px;color:#a6a6a6;display:flex;gap:6px;align-items:center;padding-left:4px;cursor:pointer}
  .vaf-tile{background:#2a2a2a;border:0;border-radius:12px;padding:12px;text-align:left;color:#e8e8e8;cursor:pointer}
  .vaf-tile b{display:block;color:#fff;font-size:15px}
  .vaf-tile span{color:#a6a6a6;font-size:12.5px}
  .vaf-tile:disabled{opacity:.4;cursor:default}
  .vaf-tile.vaf-on{outline:2px solid #ffc21a}
  .vaf-list{max-height:40vh;overflow:auto;background:#2a2a2a;border-radius:12px;padding:8px 12px;margin-bottom:12px;font-size:13px}
  .vaf-list div{padding:2px 0;border-bottom:1px solid #333}
  .vaf-in{width:100%;background:#141414;border:1px solid #3a3a3a;border-radius:10px;padding:8px 12px;color:#e8e8e8;font-size:14px;box-sizing:border-box}
  .vaf-chk{display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer}
  .vaf-mark{font:600 11px/1.3 system-ui,sans-serif;padding:2px 6px;border-radius:4px;display:inline-block;margin:2px 4px 2px 0;white-space:nowrap}
  .vaf-prev{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-width:90vw;max-height:90vh;border-radius:10px;box-shadow:0 10px 50px rgba(0,0,0,.8);z-index:2147483646;pointer-events:none;display:none}
  .vaf-toast{position:fixed;right:16px;bottom:16px;z-index:2147483645;background:#1f1f1f;color:#e8e8e8;border:1px solid #3a3a3a;border-radius:12px;padding:10px 14px;max-width:340px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5)}
  .vaf-toast b{color:#ffc21a}
  .vaf-hdr-dot{position:absolute;top:-4px;left:-6px;background:#ffc21a;color:#141414;border-radius:10px;font:700 11px/16px system-ui;min-width:16px;padding:0 4px;text-align:center;cursor:pointer;z-index:2}
  .vaf-strike{text-decoration:line-through}
  .vaf-also{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px}
  .vaf-also-i{display:inline-flex;align-items:center;white-space:nowrap}
  .vaf-plus{min-width:44px;height:24px;padding:0 14px;border-radius:12px;border:1px solid #6b6f76;background:transparent;color:inherit;font:bold 16px/1 system-ui,sans-serif;cursor:pointer}
  .vaf-plus:hover{border-color:#ffc21a;color:#ffc21a}
  `;
  function ensureStyle() {
    if (document.getElementById('vaf-style')) return;
    const st = document.createElement('style');
    st.id = 'vaf-style';
    st.textContent = UI_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // Popup-Gerüst; buttons = [{ label, fn, primary, focus, disabled }]
  function modal({ title = '', sub = '', html = '', wide = false, closable = true, onClose = null } = {}) {
    ensureStyle();
    const ov = document.createElement('div');
    ov.className = 'vaf-ov';
    const md = document.createElement('div');
    md.className = 'vaf-md' + (wide ? ' vaf-wide' : '');
    md.innerHTML = (title ? `<h2>${esc(title)}</h2>` : '') + (sub ? `<div class="vaf-sub">${sub}</div>` : '') + `<div class="vaf-body">${html}</div><div class="vaf-btns"></div>`;
    ov.appendChild(md);
    document.body.appendChild(ov);
    const m = {
      ov, md, closable, body: md.querySelector('.vaf-body'),
      close() { if (!ov.isConnected) return; ov.remove(); document.removeEventListener('keydown', onKey, true); if (onClose) onClose(); },
      buttons(list, row = false) {
        const box = md.querySelector('.vaf-btns');
        box.className = 'vaf-btns' + (row ? ' vaf-row' : '');
        box.innerHTML = '';
        m.focusBtn = null;
        for (const b of list) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'vaf-big' + (b.primary ? ' vaf-pri' : '') + (b.focus ? ' vaf-focus' : '');
          el.textContent = b.label;
          el.disabled = !!b.disabled;
          if (b.title) el.title = b.title;
          el.addEventListener('click', () => b.fn(el));
          if (b.focus) m.focusBtn = el;
          box.appendChild(el);
        }
      },
    };
    const onKey = (e) => {
      if (!ov.isConnected) return;
      if (e.key === 'Escape' && m.closable) { e.preventDefault(); e.stopPropagation(); m.close(); }
      if (e.key === 'Enter' && m.focusBtn && !m.focusBtn.disabled && !/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); m.focusBtn.click(); }
    };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov && m.closable) m.close(); });
    return m;
  }
  // Rückfrage mit mehreren Antworten; liefert den Wert der gewählten Antwort (Esc = Wert der focus-Antwort mit cancel)
  function ask(title, html, answers) {
    return new Promise((resolve) => {
      let done = false;
      const fin = (v) => { if (done) return; done = true; m.close(); resolve(v); };
      const cancel = answers.find((a) => a.cancel);
      const m = modal({ title, html, onClose: () => { if (!done) { done = true; resolve(cancel ? cancel.value : null); } } });
      m.buttons(answers.map((a) => ({ label: a.label, primary: a.primary, focus: a.focus, fn: () => fin(a.value) })));
    });
  }
  function toast(html, ms = 6000) {
    ensureStyle();
    let t = document.getElementById('vaf-toast');
    if (!t) { t = document.createElement('div'); t.id = 'vaf-toast'; t.className = 'vaf-toast'; document.body.appendChild(t); }
    t.innerHTML = html;
    clearTimeout(t._t);
    if (ms) t._t = setTimeout(() => t.remove(), ms);
    return t;
  }

  // ---------- Markierung eines Mitglieds auf Listen ----------
  const COLORS = { 1: '#43a047', 2: '#ffb74d', near: '#e65100', 3: '#e53935', white: '#ffffff', unclear: '#8c8c8c', blocked: '#7b1fa2' };
  function markInfo(x, src, m) {
    const s = S();
    const c = classify({ ...(m || {}), ...x }, src, s);
    const gk = c.gk;
    const visual = gk ? s.groups[gk].visual : false;
    const blocked = m && m.blk && !m.unblk;
    const jg = m && m.birth && m.birth.length ? m.birth.map(yearText).join('/') : '';
    let color = '', text = '';
    const ages = (x.ages && x.ages.length ? x.ages : (m && m.ages) || []).join('/');
    if (c.unclear) { color = COLORS.unclear; text = `${ages}? unklar`; }
    else if (c.white) { color = COLORS.white; text = `${ages} · ${c.white}`; }
    else if (blocked) { color = COLORS[3]; text = `${c.label || word()} · ${ages} · blockiert`; }
    else if (c.ignore) { color = COLORS[3]; text = `${c.label} · ${ages} → Warteliste`; }
    else if (c.near && visual) { color = COLORS.near; text = `${c.label} · ${ages} · vorgemerkt`; }
    else if (visual && c.stage) { color = COLORS[c.stage]; text = `${c.label} · ${ages}`; }
    if (!text) return null;
    if (jg && (blocked || c.white || c.near)) text += ` (Jg. ${jg})`;
    return { color, text, dark: color === COLORS.white || color === COLORS[2], c };
  }
  function putMark(host, info, cls = 'vaf-mark') {
    if (!host) return;
    let b = host.querySelector(':scope > .' + cls);
    if (!info) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = cls; host.prepend(b); }
    if (b.textContent !== info.text) b.textContent = info.text;
    b.style.cssText = `background:${info.color};color:${info.dark ? '#111' : '#fff'}`;
  }

  // =====================================================================================
  // Listen-Seiten markieren (Besucher, Likes, Sticker, Posteingang, Suche, Gruppen-Mitglieder)
  // und – wenn der Schalter „Opa-Schutz“ und die Automatik an sind – Treffer auf die Warteliste setzen.
  // =====================================================================================
  const PAGE_SOURCES = [
    { re: /^\/connection\/visitors/, src: 'Besucher', auto: 'besucher' },
    { re: /^\/connection\/image\/rating/, src: 'Likes', auto: 'interaktionen' },
    { re: /^\/connection\/gift\/received/, src: 'Sticker', auto: 'interaktionen' },
    { re: /^\/inbox/, src: 'Nachrichten', auto: 'interaktionen' },
    { re: /^\/search\/member/, src: 'Suche', auto: 'suche' },
    { re: /^\/groups\//, src: 'Gruppen', auto: null },
  ];
  const pageSource = () => PAGE_SOURCES.find((p) => p.re.test(location.pathname)) || null;
  const autoDone = new Set();

  // Karten mit Profil-Link einsammeln
  function cardsOn(root = document) {
    const out = new Map();
    for (const a of root.querySelectorAll('a[href^="/p/"]')) {
      if (a.closest('header, .vaf-ov, #vaf-fick-sec, [data-vaf-skip]')) continue;
      const card = a.closest('.ant-list-item, [data-item-id], .ant-card, [data-index]');
      if (!card || out.has(card)) continue;
      const nick = (a.getAttribute('title') || a.textContent || '').trim() || slugOf(a.getAttribute('href'));
      const descEl = [...card.querySelectorAll('span, div')].find((e) => e.children.length === 0 && /\d+\s*Jahre/.test(e.textContent || ''));
      const desc = descEl ? descEl.textContent : '';
      const img = card.querySelector('img');
      const src = img ? img.getAttribute('src') : '';
      out.set(card, { card, nick, uid: card.getAttribute('data-item-id') || uidFromAvatar(src), ages: agesFromText(desc), g: genderFromText(desc), host: descEl ? descEl.parentElement : card });
    }
    // Posteingang: Einträge ohne Profil-Link
    for (const it of root.querySelectorAll('[data-item-id]')) {
      if (out.has(it) || it.closest('.vaf-ov')) continue;
      const nameEl = it.querySelector('span[title]');
      if (!nameEl) continue;
      out.set(it, { card: it, nick: nameEl.getAttribute('title'), uid: it.getAttribute('data-item-id'), ages: [], g: [], host: nameEl.closest('div') || it, inbox: true });
    }
    return [...out.values()];
  }

  let markBusy = false, markAgain = false;
  async function markPage() {
    if (markBusy) { markAgain = true; return; }
    markBusy = true;
    try {
      const ps = pageSource();
      if (!ps) return;
      const s = S();
      const auto = isOn() && ps.auto && s.auto[ps.auto];
      for (const x of cardsOn(document)) {
        if (DELETED_NICK.test(x.nick)) { await showDeleted(x); continue; }
        let m = x.uid ? await Members.get(x.uid) : await Members.byNick(x.nick);
        if (m && !x.uid) x.uid = m.uid;
        if (!x.ages.length && m) { x.ages = m.ages || []; x.g = m.g || []; }
        if (m && (!x.g || !x.g.length)) x.g = m.g || [];
        if (x.uid && x.ages.length && !x.inbox && (!m || !m.ageAt || m.ageAt !== isoDay(new Date()))) m = await seen(x, ps.src);
        const info = markInfo(x, ps.src, m);
        putMark(x.inbox ? x.card : x.host, info);
        if (auto && info && info.c.ignore && !(m && m.blk && !m.unblk) && !autoDone.has(x.nick)) {
          autoDone.add(x.nick);
          await Queue.add(x, ps.src);
        }
      }
    } catch (e) { warn('Markieren', e); }
    finally { markBusy = false; if (markAgain) { markAgain = false; setTimeout(markPage, 300); } }
  }

  // ---------- Gelöschte Konten im Posteingang ----------
  async function showDeleted(x) {
    if (!x.uid) return;
    const m = await Members.get(x.uid);
    if (!m || !m.nick || DELETED_NICK.test(m.nick)) return;
    if (!m.del) await Members.update(x.uid, (y) => { y.del = now(); });
    const nameEl = x.card.querySelector('span[title]');
    if (nameEl && !nameEl.dataset.vafDel) {
      nameEl.dataset.vafDel = '1';
      nameEl.style.display = 'none';
      const s = document.createElement('span');
      s.className = (nameEl.className || '') + ' vaf-strike';
      s.textContent = m.nick;
      s.title = `Gelöschter Popster – früher: ${m.nick}`;
      nameEl.after(s);
    }
    const img = x.card.querySelector('img');
    if (img && !img.dataset.vafDel) {
      const data = await Images.get(x.uid);
      if (data) { img.dataset.vafDel = '1'; img.src = data; }
    }
    x.card.addEventListener('click', () => { try { sessionStorage.setItem('vaf_inbox_uid', x.uid); } catch {} }, { once: true });
  }
  // Kopf des geöffneten Chats mit einem gelöschten Konto
  async function fixDeletedChatHeader() {
    const a = document.querySelector('a[href="/p/gel%C3%B6schter-popster"], a[href="/p/gelöschter-popster"]');
    if (!a || a.dataset.vafDel) return;
    let uid = '';
    try { uid = sessionStorage.getItem('vaf_inbox_uid') || ''; } catch {}
    if (!uid) {
      const dels = cardsOn(document).filter((c) => DELETED_NICK.test(c.nick));
      if (dels.length === 1) uid = dels[0].uid;
    }
    const m = uid ? await Members.get(uid) : null;
    if (!m || !m.nick || DELETED_NICK.test(m.nick)) return;
    a.dataset.vafDel = '1';
    a.textContent = m.nick;
    a.title = `Gelöschter Popster – früher: ${m.nick}. Klick öffnet das Profil-Archiv.`;
    a.href = '/setting/profile#archiv=' + encodeURIComponent(uid);
    a.target = '_blank';
    a.style.textDecorationLine = 'line-through';
    a.addEventListener('click', (e) => { e.stopPropagation(); }, true);
  }

  function initListPages() {
    let t = null;
    const run = () => { clearTimeout(t); t = setTimeout(() => { markPage(); if (location.pathname.startsWith('/inbox')) fixDeletedChatHeader(); }, 250); };
    new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
    Bus.on('settings', run);
    run();
  }

  // =====================================================================================
  // Sichtbarkeit (wio/state)
  // =====================================================================================
  const Vis = {
    userChanged: 0,
    async state() {
      try { const d = await apiGet('wio/state'); const v = d && (d.value || d.state || d); if (v === 'visible' || v === 'invisible') return v; } catch {}
      const sw = [...document.querySelectorAll('button[role=switch]')].find((b) => /unsichtbar/i.test((b.closest('li,div') || {}).textContent || ''));
      if (sw) return sw.getAttribute('aria-checked') === 'true' ? 'invisible' : 'visible';
      return G.get('vis_state', null);
    },
    async set(v) { await apiPost('wio/state', { value: v }); G.set('vis_state', v); },
    // Vor einer Funktion mit Profilaufruf: warnen und ggf. unsichtbar schalten
    // Ergebnis: null = abgebrochen, { restore: bool }
    async guard(what) {
      const st = await this.state();
      if (st === 'invisible') return { restore: false };
      const v = await ask('Sichtbarkeit', `<p>${esc(what)} ruft ein Profil auf. Dein Besuch erscheint dann beim Mitglied in der Besucherliste.</p>` +
        (st ? '' : '<p style="color:#a6a6a6">Ob du gerade sichtbar bist, ließ sich nicht feststellen.</p>'), [
        { label: 'Unsichtbar schalten und fortfahren', value: 'inv', primary: true, focus: true },
        { label: 'Sichtbar fortfahren', value: 'vis' },
        { label: 'Abbrechen', value: null, cancel: true },
      ]);
      if (!v) return null;
      if (v === 'vis') return { restore: false };
      await this.set('invisible');
      const t0 = now();
      this.userChanged = 0;
      const tt = toast('Unsichtbar geschaltet – warte 15 Sekunden …', 0);
      while (now() - t0 < 15000) { tt.innerHTML = `Unsichtbar geschaltet – noch <b>${Math.ceil((15000 - (now() - t0)) / 1000)}</b> s …`; await sleep(500); }
      tt.remove();
      return { restore: true, at: now() };
    },
    async restore(tok) {
      if (!tok || !tok.restore) return;
      if (this.userChanged > (tok.at || 0)) return;     // selbst umgeschaltet → nichts zurückstellen
      try { await this.set('visible'); } catch {}
    },
  };
  onApi(/^wio\/state$/, (d, info) => { if (info.method === 'POST' && info.body && info.body.value) { G.set('vis_state', info.body.value); Vis.userChanged = now(); } });

  // =====================================================================================
  // Blockierliste (/setting/privacy/ignore-list): Reparieren, Synchronisieren, Mülleimer
  // =====================================================================================
  const IGNORE_LIST_PATH = '/setting/privacy/ignore-list';

  function ignoreListUi() {
    if (!location.pathname.startsWith(IGNORE_LIST_PATH)) return;
    const inp = document.querySelector('main input#nickname');
    const form = inp && inp.closest('form');
    if (!form || document.getElementById('vaf-il-box')) return;
    const box = document.createElement('div');
    box.id = 'vaf-il-box';
    box.style.cssText = 'margin:12px 0 16px';
    box.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap">
        <button type="button" class="ant-btn ant-theme ant-btn-default ant-btn-color-default ant-btn-variant-outlined" data-a="repair"><span>Reparieren</span></button>
        <button type="button" class="ant-btn ant-theme ant-btn-default ant-btn-color-default ant-btn-variant-outlined" data-a="sync"><span>Synchronisieren</span></button>
        <button type="button" class="ant-btn ant-theme ant-btn-text" data-a="stop" style="display:none"><span>Abbrechen</span></button>
      </div>
      <div id="vaf-il-status" class="ant-typography ant-typography-secondary" style="margin-top:8px;font-size:13px"></div>`;
    form.after(box);
    box.querySelector('[data-a=repair]').addEventListener('click', () => runIgnoreJob('repair'));
    box.querySelector('[data-a=sync]').addEventListener('click', () => syncDialog());
    box.querySelector('[data-a=stop]').addEventListener('click', () => { ilJob.stop = true; });
    const last = G.get('il_last', null);
    if (last) ilStatus(`Zuletzt: ${last.text} (${deDateTime(last.at)})`);
  }
  const ilStatus = (t) => { const s = document.getElementById('vaf-il-status'); if (s) s.textContent = t; };
  const ilJob = { running: false, stop: false };

  // Liest die komplette Blockierliste über die Schnittstelle
  async function readWholeBlocklist() {
    let n = 0;
    const list = await BL.all((count, page) => { n = count; ilStatus(`Lese Blockierliste … ${fmtN(count)} Einträge (Seite ${page})`); return !ilJob.stop; });
    if (ilJob.stop) throw new Error('abgebrochen');
    G.set('blocked_count', list.length);
    return list;
  }
  // Script-Gedächtnis: alle vom Opa-Schutz Geblockten
  async function memoryBlocked() {
    const out = [];
    await Members.each((m) => { if (m.blk && m.blk.opa && !m.unblk) out.push(m); });
    return out;
  }

  // Blockierliste still ins Gedächtnis einlesen (ändert nichts auf poppen.de): einmal je Version und danach wöchentlich.
  // Ohne das kennt das Gedächtnis nach einem Update nur die Mitglieder, die seitdem aufgetaucht sind.
  const INGEST_KEY = 'bl_ingest';
  const ingestDue = () => { const g = G.get(INGEST_KEY, null); return !g || g.v !== VERSION || now() - g.at > 7 * DAY; };
  async function ingestBlocklist(onStep) {
    const list = await BL.all((count, page) => { if (onStep) onStep(count, page); return true; });
    G.set('blocked_count', list.length); G.set('blocked_count_at', now());
    const onList = new Set();
    let opa = 0, manual = 0;
    for (const e of list) {
      if (!e || !e.user || !e.user.uid) continue;
      const uid = String(e.user.uid);
      onList.add(uid);
      await seen(e.user, 'Blockierliste', { images: false });
      const pn = parseNote(e.note);
      if (pn) {
        opa++;
        await Members.update(uid, (x) => { if (!x.blk || !x.blk.opa || x.unblk) x.blk = { at: pn.at, src: pn.src || 'Sync', note: e.note, opa: true }; else if (!x.blk.note) x.blk.note = e.note; delete x.unblk; });
      } else {
        manual++;
        await Members.update(uid, (x) => { if (!x.blk || x.unblk) { x.blk = { at: now(), note: e.note || '', opa: false }; delete x.unblk; } });
      }
    }
    // von Hand Blockierte, die nicht mehr auf der Liste stehen: Vermerk entfernen (Opa-Sperren bleiben „Reparieren“ überlassen)
    const stale = [];
    await Members.each((m) => { if (m.blk && !m.blk.opa && !m.unblk && !onList.has(m.uid)) stale.push(m.uid); });
    for (const uid of stale) await Members.update(uid, (x) => { x.blk = null; });
    G.set(INGEST_KEY, { v: VERSION, at: now(), n: list.length, opa, manual });
    Bus.emit('ingested', { n: list.length, opa, manual });
    log(`Blockierliste eingelesen: ${list.length} Einträge, davon ${opa} mit ${word()}-Notiz.`);
    return { n: list.length, opa, manual };
  }

  async function runIgnoreJob(kind, opts = {}) {
    if (ilJob.running) return;
    if (!(await Lock.take('blocklist', kind))) { toast('Ein anderer Tab arbeitet gerade an der Blockierliste.'); return; }
    ilJob.running = true; ilJob.stop = false;
    const stopBtn = document.querySelector('#vaf-il-box [data-a=stop]');
    if (stopBtn) stopBtn.style.display = '';
    try {
      const list = await readWholeBlocklist();
      const onList = new Map(list.filter((e) => e.user).map((e) => [String(e.user.uid), e]));
      const mem = await memoryBlocked();
      let text = '';
      if (kind === 'repair') {
        let gone = 0, notes = 0, adopted = 0;
        // 1. nicht mehr blockiert → aus dem Gedächtnis
        for (const m of mem) if (!onList.has(m.uid)) { await Members.update(m.uid, (x) => { x.unblk = now(); x.blk = null; }); gone++; }
        // 2. Einträge mit Opa-Notiz ins Gedächtnis, fehlende Notizen ergänzen
        let i = 0;
        for (const [uid, e] of onList) {
          if (ilJob.stop) break;
          if (++i % 200 === 0) ilStatus(`Prüfe Einträge … ${fmtN(i)} / ${fmtN(onList.size)}`);
          let m = await Members.get(uid);
          const pn = parseNote(e.note);
          if (!pn && !e.note && legacy && legacy.done[norm(e.user.nickname)] && !(m && m.legacyDone)) m = await seen(e.user, 'Blockierliste', { images: false });
          if (pn) { if (!m || !m.blk || !m.blk.opa) { await seen(e.user, 'Blockierliste', { images: false }); await Members.update(uid, (x) => { x.blk = { at: pn.at, src: pn.src, note: e.note, opa: true }; delete x.unblk; }); adopted++; } continue; }
          if (m && m.blk && m.blk.opa && !e.note && S().expert.writeNote) {
            const t = makeNote(m, m.blk.src, new Date(m.blk.at || now()));
            if (!dry()) { try { await BL.note(uid, t); notes++; } catch {} }
            await Members.update(uid, (x) => { x.blk.note = t; });
          }
        }
        text = `Reparieren: ${fmtN(list.length)} Einträge, ${gone} nicht mehr blockiert, ${adopted} übernommen, ${notes} Notizen ergänzt`;
      } else if (kind === 'sync-poppen') {
        let adopted = 0, dropped = 0, notes = 0;
        for (const [uid, e] of onList) {
          const pn = parseNote(e.note);
          if (!pn) continue;                                   // von Hand Blockierte: nichts tun
          await seen(e.user, 'Blockierliste', { images: false });
          await Members.update(uid, (x) => { if (!x.blk || !x.blk.opa) adopted++; x.blk = { at: pn.at, src: pn.src || 'Sync', note: e.note, opa: true }; delete x.unblk; });
          if (opts.notes) notes += await alignNote(uid, e, pn);
        }
        for (const m of mem) if (!onList.has(m.uid)) { await Members.update(m.uid, (x) => { x.unblk = now(); x.blk = null; }); await Queue.remove(m.uid); dropped++; }
        text = `Sync (poppen.de hat Vorrang): ${adopted} übernommen, ${dropped} als entsperrt vermerkt${opts.notes ? `, ${notes} Notizen angepasst` : ''}`;
      } else if (kind === 'sync-script') {
        const reblock = mem.filter((m) => !onList.has(m.uid));
        const unblock = [];
        for (const [uid, e] of onList) {
          const pn = parseNote(e.note);
          if (!pn) continue;
          const m = await Members.get(uid);
          const x = m || normUser(e.user);
          const white = whiteReason(m || {}, e.user.nickname);
          if ((m && m.unblk) || white) unblock.push({ uid, nick: e.user.nickname, why: white || 'im Skript entsperrt' });
        }
        const ok = await ask('Synchronisieren – Script hat Vorrang',
          `<div class="vaf-stats"><span>Neu blockieren (im Skript blockiert, auf poppen.de nicht)</span><b>${fmtN(reblock.length)}</b>` +
          `<span>Entsperren (Opa-Notiz, im Skript entsperrt oder auf der Whitelist)</span><b>${fmtN(unblock.length)}</b>` +
          `<span>Von Hand Blockierte (ohne Opa-Notiz)</span><b>bleiben unberührt</b></div>`,
          [{ label: 'Jetzt ausführen', value: true, primary: true }, { label: 'Abbrechen', value: false, focus: true, cancel: true }]);
        if (!ok) { text = 'Synchronisieren abgebrochen'; }
        else {
          let a = 0, b = 0, notes = 0;
          for (const m of reblock) { if (ilJob.stop) break; await Queue.add(m, (m.blk && m.blk.src) || 'Sync'); a++; }
          for (const u of unblock) {
            if (ilJob.stop) break;
            const r = await unblockOne({ uid: u.uid, nick: u.nick });
            if (r === 'ok' || r === 'Test') b++;
            ilStatus(`Entsperre … ${b} / ${unblock.length}`);
            await sleep(rand(S().expert.pauseMin * 1000, S().expert.pauseMax * 1000));
          }
          if (opts.notes) for (const [uid, e] of onList) { const pn = parseNote(e.note); if (pn) notes += await alignNote(uid, e, pn); }
          text = `Sync (Script hat Vorrang): ${a} auf die Warteliste zum Neu-Blockieren, ${b} entsperrt${opts.notes ? `, ${notes} Notizen angepasst` : ''}`;
          if (a) Etappe.run('Synchronisieren', null, { manual: true }).catch(() => {});
        }
      }
      G.set('il_last', { text, at: now() });
      ilStatus(text);
    } catch (e) { ilStatus(e.message === 'abgebrochen' ? 'Abgebrochen.' : 'Fehler: ' + e.message); }
    finally {
      ilJob.running = false;
      Lock.release('blocklist');
      if (stopBtn) stopBtn.style.display = 'none';
    }
  }
  // Notiz an die aktuelle Vorlage angleichen (gleiche Quelle, gleicher Zeitpunkt)
  async function alignNote(uid, e, pn) {
    const m = await Members.get(uid) || normUser(e.user);
    const want = makeNote(m, pn.src, new Date(pn.at));
    if (want === e.note) return 0;
    if (dry()) return 1;
    try { await BL.note(uid, want); await Members.update(uid, (x) => { if (x.blk) x.blk.note = want; }); return 1; } catch { return 0; }
  }
  async function syncDialog() {
    const m = modal({ title: 'Synchronisieren', sub: 'Gleicht die Blockierliste von poppen.de mit dem Gedächtnis des Opa-Schutzes ab. Von Hand Blockierte (ohne Opa-Notiz) bleiben immer unberührt.',
      html: `<label class="vaf-chk"><input type="checkbox" id="vaf-sync-notes"> Notizen abgleichen (an die aktuelle Vorlage anpassen)</label>` });
    const notes = () => m.md.querySelector('#vaf-sync-notes').checked;
    m.buttons([
      { label: 'poppen.de hat Vorrang', primary: true, fn: () => { const n = notes(); m.close(); runIgnoreJob('sync-poppen', { notes: n }); } },
      { label: 'Script hat Vorrang', fn: () => { const n = notes(); m.close(); runIgnoreJob('sync-script', { notes: n }); } },
      { label: 'Abbrechen', focus: true, fn: () => m.close() },
    ]);
  }

  // ---------- Mülleimer: Rückfrage bei vom Opa-Schutz Blockierten ----------
  let trashBypass = false;
  function hookTrash() {
    document.addEventListener('click', async (e) => {
      if (trashBypass || !location.pathname.startsWith(IGNORE_LIST_PATH)) return;
      const btn = e.target.closest && e.target.closest('main .ant-list-item button');
      if (!btn || btn.closest('#vaf-il-box')) return;
      const item = btn.closest('.ant-list-item');
      const isTrash = btn.querySelector('svg') && !norm(btn.textContent) && !btn.closest('form');
      if (!isTrash) return;
      const nameEl = item.querySelector('span.df-text-weight-semi-bold') || item.querySelector('a[href^="/p/"]');
      const nick = nameEl ? nameEl.textContent.trim() : '';
      const note = (item.querySelector('input') || {}).value || '';
      const m = nick ? await Members.byNick(nick) : null;
      const byOpa = isOpaNote(note) || (m && m.blk && m.blk.opa && !m.unblk);
      if (!byOpa) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const v = await confirmUnblock(nick);
      if (!v) return;
      if (v === 'white') addToWhitelist(nick);
      if (m) await Members.update(m.uid, (x) => { x.unblk = now(); x.blk = null; });
      trashBypass = true;
      try { btn.click(); } finally { setTimeout(() => { trashBypass = false; }, 500); }
    }, true);
  }
  function confirmUnblock(nick) {
    return ask(`${nick} entsperren`, `<p>${esc(nick)} wurde durch den ${esc(word())}-Schutz ignoriert.</p>`, [
      { label: 'Trotzdem entsperren', value: 'yes' },
      { label: 'Trotzdem entsperren & Whitelist', value: 'white' },
      { label: 'Abbrechen', value: null, focus: true, primary: true, cancel: true },
    ]);
  }
  function addToWhitelist(nick, group = '') {
    const s = clone(S());
    if (!s.whitelist.names.some((x) => norm(x.n) === norm(nick))) s.whitelist.names.push({ n: nick, g: group });
    saveSettings(s);
  }

  // =====================================================================================
  // Profil eines Geblockten: „Du hast diesen Popster blockiert“
  // =====================================================================================
  const isBlockedProfilePage = () => /^\/p\/[^/]+\/?$/.test(location.pathname) && /Du hast diesen Popster blockiert/.test((document.querySelector('main') || {}).textContent || '');
  async function blockedProfileUi() {
    if (!isBlockedProfilePage() || document.getElementById('vaf-bp')) return;
    const unb = [...document.querySelectorAll('main button')].find((b) => norm(b.textContent) === 'diesen benutzer entblockieren');
    if (!unb) return;
    const nick = slugOf(location.pathname);
    let m = await Members.byNick(nick);
    if (!m) { const e = await BL.find(nick).catch(() => null); if (e && e.user) m = await seen(e.user, 'Blockierliste', { images: false }); }
    const realNick = (m && m.nick) || nick;
    const bar = unb.parentElement;
    const wrap = document.createElement('div');
    wrap.id = 'vaf-bp';
    wrap.style.cssText = 'display:contents';
    const mk = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = unb.className; b.innerHTML = `<span>${esc(label)}</span>`; b.addEventListener('click', fn); return b; };
    wrap.append(mk('Trotzdem öffnen', () => openBlockedOnce(m, realNick)), mk('Nicht mehr ignorieren', () => unblockForGood(m, realNick)));
    bar.appendChild(wrap);
    const note = m && m.blk && m.blk.note;
    if (note) { const p = document.createElement('div'); p.className = 'ant-typography ant-typography-secondary'; p.style.marginTop = '10px'; p.textContent = 'Grund: ' + note; bar.after(p); }
    // poppen-Knopf „Diesen Benutzer entblockieren“: gleiche Rückfrage wie der Mülleimer
    unb.addEventListener('click', async (e) => {
      if (trashBypass) return;
      if (!(m && m.blk && m.blk.opa)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const v = await confirmUnblock(realNick);
      if (!v) return;
      if (v === 'white') addToWhitelist(realNick);
      await Members.update(m.uid, (x) => { x.unblk = now(); x.blk = null; });
      trashBypass = true; unb.click(); setTimeout(() => { trashBypass = false; }, 500);
    }, true);
  }
  async function openBlockedOnce(...a) { return Prio.run('Trotzdem öffnen', () => openBlockedOnce_(...a)); }
  async function openBlockedOnce_(m, nick) {
    if (!m || !m.uid) { toast('Benutzer-ID unbekannt – „Trotzdem öffnen“ geht hier nicht.'); return; }
    const vis = await Vis.guard('„Trotzdem öffnen“');
    if (!vis) return;
    const note = (m.blk && m.blk.note) || '';
    const r = await unblockOne(m, { keepMemory: true });
    if (r !== 'ok' && r !== 'Test') { toast('Entsperren fehlgeschlagen: ' + esc(r)); return; }
    G.set('reblock', { uid: m.uid, nick, note, path: location.pathname, tab: TAB_ID, at: now(), vis });
    location.reload();
  }
  async function unblockForGood(m, nick) {
    const v = await ask(`${nick} nicht mehr ignorieren`, `<p>${esc(nick)} wird dauerhaft entsperrt.</p>`, [
      { label: 'Entsperren', value: 'yes' }, { label: 'Entsperren & Whitelist', value: 'white' }, { label: 'Abbrechen', value: null, focus: true, primary: true, cancel: true }]);
    if (!v) return;
    if (v === 'white') addToWhitelist(nick);
    if (m && m.uid) { const r = await unblockOne(m); if (r !== 'ok' && r !== 'Test') { toast('Fehler: ' + esc(r)); return; } }
    location.reload();
  }
  // Nach „Trotzdem öffnen“: beim Verlassen des Profils wieder sperren (spätestens beim nächsten Seitenaufruf)
  async function checkReblock() {
    const rb = G.get('reblock', null);
    if (!rb) return;
    const here = location.pathname.replace(/\/+$/, '');
    const stillThere = rb.tab === TAB_ID && here === rb.path.replace(/\/+$/, '');
    if (stillThere && now() - rb.at < 6 * 3600000) {
      if (!rb.armed) G.set('reblock', { ...rb, armed: true });
      if (!document.getElementById('vaf-rb')) toast(`<b>${esc(rb.nick)}</b> ist vorübergehend entsperrt und wird beim Verlassen des Profils wieder gesperrt.`, 8000);
      return;
    }
    if (rb.tab !== TAB_ID && now() - rb.at < 10 * 60000) return;   // anderer Tab schaut noch
    G.del('reblock');
    if (!dry()) {
      try { await BL.add(rb.uid, rb.nick); if (rb.note) await BL.note(rb.uid, rb.note); }
      catch (e) {
        const there = await BL.find(rb.nick).catch(() => null);      // durch keepalive schon gesperrt?
        if (there) { if (rb.note && !there.note) { try { await BL.note(rb.uid, rb.note); } catch {} } }
        else { warn('Wiedersperren fehlgeschlagen', e); G.set('reblock', rb); return; }
      }
    }
    await Members.update(rb.uid, (x) => { if (!x.blk) x.blk = { at: now(), src: 'Profil', note: rb.note, opa: !!rb.note }; delete x.unblk; });
    if (rb.vis) await Vis.restore(rb.vis);
  }
  W.addEventListener('pagehide', () => {
    let rb = null;
    try { rb = G.get('reblock', null); } catch { return; }
    if (!rb || rb.tab !== TAB_ID || !rb.armed || dry()) return;
    // Seite wird verlassen: sofort wieder sperren (keepalive, damit die Abfrage den Seitenwechsel überlebt)
    try {
      const h = { 'Content-Type': 'application/json', ...(mirror || {}) };
      origFetch(location.origin + '/v2-api/ignore/add', { method: 'POST', credentials: 'include', keepalive: true, headers: h, body: JSON.stringify({ uid: String(rb.uid), nickname: rb.nick }) });
    } catch {}
  });

  // =====================================================================================
  // Opa-Scan: Popup mit allen Scans
  // =====================================================================================
  const SCANS = [
    { k: 'besucher', title: 'Profilbesucher', sub: 'Wer dein Profil besucht hat', fn: scanVisitors },
    { k: 'interaktionen', title: 'Interaktionen', sub: 'Likes, Sticker und Nachrichten', fn: scanInteractions },
    { k: 'party', title: 'Partygäste', sub: 'gibt es auf poppen.de nicht', fn: null },
    { k: 'gruppen_wl', src: 'gruppen', title: 'Gruppen (Whitelist)', sub: 'Leitung aller Gruppen; Mitglieder verwalteter Gruppen, wenn du sie allein leitest', fn: scanGroupsWhite, def: true },
    { k: 'gruppen_bl', src: 'gruppen', title: 'Gruppen (Blacklist)', sub: 'Mitglieder deiner Gruppen nach den Regeln prüfen', fn: scanGroupsBlack, def: false },
    { k: 'suche', title: 'Mitgliedersuche', sub: 'Ganz Deutschland, Alter für Alter', fn: scanSearch },
  ];
  let scanRun = null;
  // Auswahl für „Alle Scans nacheinander“ (wird gemerkt)
  const scanSel = () => { const st = G.get('scan_sel', {}); const o = {}; for (const sc of SCANS) if (sc.fn) o[sc.k] = sc.k in st ? !!st[sc.k] : sc.def !== false; return o; };

  async function statusLine() {
    const q = await Queue.count().catch(() => 0);
    const w = Object.keys(await KV.get('watch', {})).length;
    const b = G.get('blocked_count', null);
    return `Blockiert: <b style="color:#fff">${b == null ? '?' : fmtN(b)}</b> · Warteliste: <b style="color:#fff">${fmtN(q)}</b> · Vorgemerkt: <b style="color:#fff">${fmtN(w)}</b>` +
      (dry() ? ' · <span style="color:#ffb300">Testlauf</span>' : '') + (isOn() ? '' : ' · <span style="color:#ff8a80">Automatik aus</span>') +
      (() => { const bs = (G.get('blk_state', null) || {}).st; return bs === 'blockiert' ? ' · blockiert gerade' : bs === 'pause' ? ' · Blockieren pausiert' : bs === 'pause-fehler' ? ' · Pause nach Fehlern' : q ? ' · wartet' : ''; })();
  }

  async function openScanPopup() {
    if (scanRun && scanRun.m && scanRun.m.ov) { if (!scanRun.m.ov.isConnected) document.body.appendChild(scanRun.m.ov); return; }
    const W1 = word();
    const m = modal({ title: `${W1}-Scan`, sub: await statusLine() });
    const groups = G.get('groups', null);
    const sel = scanSel();
    const tiles = SCANS.map((sc) => {
      let sub = sc.sub;
      if (sc.k === 'gruppen_wl' && groups) sub = `${groups.attended.length + groups.managed.length} Gruppen, ${groups.managed.length} verwaltet`;
      if (sc.k === 'gruppen_bl' && groups) sub = groups.attended.length === 1 ? '1 Gruppe, in der du Mitglied bist' : `${groups.attended.length} Gruppen, in denen du Mitglied bist`;
      const chk = sc.fn ? `<label class="vaf-tsel" title="Bei „Alle Scans nacheinander“ mitnehmen"><input type="checkbox" data-sel="${sc.k}" ${sel[sc.k] ? 'checked' : ''}> bei „Alle“</label>` : '';
      return `<div class="vaf-tilew"><button type="button" class="vaf-tile" data-k="${sc.k}" ${sc.fn ? '' : 'disabled'} title="${esc(SOURCES[sc.src || sc.k].tip)}"><b>${esc(sc.title)}</b><span>${esc(sub)}</span></button>${chk}</div>`;
    }).join('');
    m.body.innerHTML = `<div class="vaf-grid">${tiles}</div>`;
    m.body.querySelectorAll('.vaf-tile').forEach((b) => b.addEventListener('click', () => runScans(m, [b.dataset.k])));
    m.body.querySelectorAll('[data-sel]').forEach((c) => c.addEventListener('change', () => { const st = { ...G.get('scan_sel', {}) }; st[c.dataset.sel] = c.checked; G.set('scan_sel', st); }));
    m.buttons([
      { label: 'Alle Scans nacheinander', primary: true, focus: true, fn: () => { const sl = scanSel(); const ks = SCANS.filter((x) => x.fn && sl[x.k]).map((x) => x.k); if (ks.length) runScans(m, ks); else toast('Kein Scan ausgewählt.'); } },
      { label: 'Jetzt abarbeiten', fn: () => runEtappeInPopup(m) },
      { label: 'Schließen', fn: () => m.close() },
    ]);
  }

  async function runScans(m, keys) {
    if (!(await Lock.take('scan', keys.join(',')))) { toast('Ein anderer Tab scannt gerade.'); return; }
    const run = scanRun = { m, stopped: false, notes: [], errors: [] };
    m.closable = false;
    const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
    W.addEventListener('beforeunload', guard);
    const total = newRes();
    m.body.innerHTML = `<div class="vaf-warn">Bitte diese Seite nicht verlassen, solange der Scan läuft.</div>
      <div class="vaf-cur" data-r="phase"></div>
      <div class="vaf-bar"><div data-r="b1"></div></div><div class="vaf-bar"><div data-r="b2"></div></div>
      <div class="vaf-cur" data-r="cur"></div><div class="vaf-stats" data-r="stats"></div>`;
    const $ = (r) => m.body.querySelector(`[data-r=${r}]`);
    const showStats = () => {
      $('stats').innerHTML = `<span>Mitglieder gelesen</span><b>${fmtN(total.total)}</b><span>Über der Grenze</span><b>${fmtN(total.hits)}</b>` +
        `<span>Neu auf der Warteliste</span><b>${fmtN(total.queued)}</b><span>Schon blockiert</span><b>${fmtN(total.known)}</b>` +
        `<span>Whitelist</span><b>${fmtN(total.white)}</b><span>Vorgemerkt (knapp unter der Grenze)</span><b>${fmtN(total.near)}</b>` +
        `<span>Alter unklar (99)</span><b>${fmtN(total.unclear)}</b>` +
        (total.whitelisted || total.unblocked ? `<span>Gruppen-Whitelist neu / entsperrt</span><b>${fmtN(total.whitelisted)} / ${fmtN(total.unblocked)}</b>` : '') +
        (total.kicked ? `<span>Besonders böse entfernt</span><b>${fmtN(total.kicked)}</b>` : '');
    };
    showStats();
    m.buttons([{ label: 'Abbrechen', focus: true, fn: () => { run.stopped = true; $('cur').textContent = 'Breche ab …'; } }]);
    let si = 0;
    for (const k of keys) {
      if (run.stopped) break;
      const sc = SCANS.find((x) => x.k === k);
      const ctx = {
        stop: () => run.stopped,
        phase: (t) => { $('phase').textContent = `${sc.title} – ${t}`; },
        step: (i, n, t) => { $('cur').textContent = t || ''; $('b2').style.width = n ? `${Math.min(100, Math.round(i / n * 100))}%` : `${(i % 50) * 2}%`; },
        outer: (i, n) => { $('b1').style.width = `${Math.round(((si + (n ? i / n : 0)) / keys.length) * 100)}%`; },
        error: (what, e) => { run.errors.push(`${what}: ${e.message}`); },
        notes: run.notes,
      };
      $('phase').textContent = sc.title;
      ctx.outer(0, 1);
      try {
        const r = await sc.fn(ctx);
        addRes(total, r);
      } catch (e) { run.errors.push(`${sc.title}: ${e.message}`); warn(sc.title, e); }
      si++;
      $('b1').style.width = `${Math.round(si / keys.length * 100)}%`;
      showStats();
      G.set('scan_last_' + k, now());
    }
    W.removeEventListener('beforeunload', guard);
    Lock.release('scan');
    scanRun = null;
    m.closable = true;
    const warnEl = m.body.querySelector('.vaf-warn'); if (warnEl) warnEl.remove();
    $('phase').textContent = run.stopped ? 'Abgebrochen.' : 'Fertig.';
    $('cur').innerHTML = await statusLine();
    if (run.errors.length) m.body.insertAdjacentHTML('beforeend', `<div class="vaf-err">${run.errors.map(esc).join('<br>')}</div>`);
    if (run.notes.length) m.body.insertAdjacentHTML('beforeend', `<h3>Gruppen-Whitelist</h3><div class="vaf-list">${run.notes.map((n) => `<div>${esc(n)}</div>`).join('')}</div>`);
    const q = await Queue.count();
    m.buttons([
      ...(q ? [{ label: `Jetzt abarbeiten (${fmtN(q)} auf der Warteliste)`, primary: true, fn: () => runEtappeInPopup(m) }] : []),
      { label: 'Schließen', focus: true, fn: () => m.close() },
    ]);
  }

  async function runEtappeInPopup(m) {
    m.closable = false;
    m.body.innerHTML = `<div class="vaf-cur" data-r="cur">Starte Etappe …</div><div class="vaf-bar"><div data-r="b"></div></div><div class="vaf-list" data-r="list"></div>`;
    const $ = (r) => m.body.querySelector(`[data-r=${r}]`);
    m.buttons([{ label: 'Anhalten', focus: true, fn: () => Etappe.stop() }]);
    G.set('blk_handover', { tab: TAB_ID, at: now() });
    if (Etappe.running) Etappe.stop();
    for (let t = 0; (Etappe.running || Lock.other('etappe')) && t < 120; t++) await sleep(500);
    const st = await Etappe.run('Opa-Scan', (i, n, q) => {
      $('cur').textContent = `${i}/${n}: ${q.nick} (${(q.ages || []).join('/')}) – ${q.src}`;
      $('b').style.width = `${Math.round(i / n * 100)}%`;
    }, { manual: true });
    G.del('blk_handover');
    m.closable = true;
    if (!st) { $('cur').textContent = 'Das Blockieren läuft gerade in einem anderen Tab.'; }
    else {
      $('cur').innerHTML = `Fertig: ${st.ok} blockiert, ${st.fail} Fehler, ${st.dropped} übersprungen${st.test ? `, ${st.test} Testlauf` : ''}${st.limit ? ' – Höchstzahl erreicht' : ''}.<br>` + await statusLine();
      $('b').style.width = '100%';
      $('list').innerHTML = st.items.map((x) => `<div>${esc(x.nick)}: ${esc(x.res)}</div>`).join('') || '<div>Nichts zu tun.</div>';
    }
    m.buttons([{ label: 'Schließen', focus: true, primary: true, fn: () => m.close() }]);
  }

  // =====================================================================================
  // Einstellungsseite „Opa-Schutz“ (/setting/profile#opa-schutz) und Menüpunkte der Einstellungen
  // =====================================================================================
  const SETTINGS_CSS = `
  #vaf-set{color:#e8e8e8;font-size:14px;line-height:1.45;padding-bottom:40px}
  #vaf-set h2{font-size:18px;margin:22px 0 10px;display:flex;align-items:center;gap:12px;color:#fff}
  #vaf-set h2 small, #vaf-set .vaf-src{font-size:12px;font-weight:400;color:#ffc21a;cursor:pointer}
  #vaf-set .vaf-card{background:#1f1f1f;border-radius:10px;padding:4px 16px;margin-bottom:6px}
  #vaf-set .vaf-r{display:flex;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid #2c2c2c}
  #vaf-set .vaf-r:last-child{border-bottom:0}
  #vaf-set .vaf-lab{flex:0 0 230px}
  #vaf-set .vaf-lab .vaf-d{color:#8c8c8c;font-size:12px}
  #vaf-set .vaf-ctl{flex:1;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  #vaf-set .vaf-num{width:70px;background:#141414;border:1px solid #444;border-radius:6px;color:#fff;padding:4px 8px}
  #vaf-set .vaf-txt{flex:1;min-width:240px;background:#141414;border:1px solid #444;border-radius:6px;color:#fff;padding:5px 8px}
  #vaf-set select{background:#141414;border:1px solid #444;border-radius:6px;padding:4px 10px;color:#fff}
  #vaf-set .vaf-btn{background:#3a3a3a;color:#fff;border:0;border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit}
  #vaf-set .vaf-btn.vaf-y{background:#ffc21a;color:#111;font-weight:600}
  #vaf-set .vaf-btn:disabled{opacity:.4;cursor:default}
  #vaf-set .vaf-sw{width:40px;height:22px;border-radius:11px;background:#555;position:relative;display:inline-block;flex:none;cursor:pointer;border:0;padding:0}
  #vaf-set .vaf-sw::after{content:"";position:absolute;left:2px;top:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .15s}
  #vaf-set .vaf-sw.on{background:#ffc21a}
  #vaf-set .vaf-sw.on::after{left:20px}
  #vaf-set .vaf-rank{display:flex;flex-direction:column;gap:4px}
  #vaf-set .vaf-rank > div{display:flex;align-items:center;gap:8px;background:#2b2b2b;border-radius:8px;padding:4px 10px;width:260px}
  #vaf-set .vaf-rank i{font-style:normal;color:#8c8c8c;width:18px}
  #vaf-set .vaf-rank span{flex:1}
  #vaf-set .vaf-rank b{cursor:pointer;color:#a6a6a6;font-weight:400;padding:0 3px}
  #vaf-set .vaf-rank b.off{opacity:.25;cursor:default}
  #vaf-set .vaf-red{color:#ff7875}
  #vaf-set .vaf-chip{background:#2b2b2b;border-radius:12px;padding:2px 10px;font-size:12px;display:inline-flex;gap:6px;align-items:center}
  #vaf-set .vaf-chip b{cursor:pointer;color:#a6a6a6;font-weight:400}
  #vaf-set .vaf-info{background:#1f1f1f;border-radius:10px;padding:12px 16px;display:flex;gap:40px;flex-wrap:wrap}
  #vaf-set .vaf-info b{color:#ffc21a}
  #vaf-set .vaf-srcgrid{display:grid;grid-template-columns:150px 1fr 1fr;gap:6px 18px;align-items:center;padding:10px 0;border-bottom:1px solid #2c2c2c}
  #vaf-set .vaf-srcgrid .vaf-h{color:#8c8c8c;font-size:12px}
  #vaf-set .vaf-sl{position:relative;height:36px;min-width:180px;user-select:none;touch-action:none}
  #vaf-set .vaf-sl .t{position:absolute;top:22px;left:8px;right:8px;height:4px;background:#444;border-radius:2px}
  #vaf-set .vaf-sl .f{position:absolute;top:22px;height:4px;background:#ffc21a;border-radius:2px}
  #vaf-set .vaf-sl .h{position:absolute;top:16px;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #ffc21a;margin-left:-8px;cursor:grab;box-sizing:border-box}
  #vaf-set .vaf-sl .v{position:absolute;left:50%;bottom:100%;margin-bottom:3px;font-size:11px;line-height:12px;color:#ddd;transform:translateX(-50%);white-space:nowrap;pointer-events:none}
  #vaf-set .vaf-exp{margin:24px 0 8px;font-size:16px;font-weight:600;cursor:pointer;color:#fff}
  #vaf-set .vaf-foot{display:flex;gap:10px;margin:26px 0 40px}
  #vaf-set .vaf-grp{display:flex;flex-direction:column;gap:4px;max-height:260px;overflow:auto;width:100%}
  #vaf-set .vaf-grp label{display:flex;gap:8px;align-items:center}
  #vaf-set .vaf-mini{font-size:12px;color:#8c8c8c}
  `;

  // ---------- Menüpunkte in der linken Spalte der Einstellungen ----------
  function settingsMenu() {
    const nav = document.querySelector('[data-type="secondary-navigation"]');
    if (!nav || !location.pathname.startsWith('/setting') && !location.pathname.startsWith('/dating/my-dates')) return;
    const links = [...nav.querySelectorAll('a[href]')];
    if (!links.length) return;
    // aktive Klasse = Klasse, die nur ein Link hat
    const counts = {};
    links.forEach((a) => a.classList.forEach((c) => { counts[c] = (counts[c] || 0) + 1; }));
    const activeCls = Object.keys(counts).find((c) => counts[c] === 1 && links.length > 2) || '';
    const base = links.find((a) => !a.classList.contains(activeCls)) || links[0];
    const mk = (id, label, hash, icon) => {
      let a = document.getElementById(id);
      if (a) { const l = a.querySelector('[data-type="label"]'); if (l && l.textContent !== label) l.textContent = label; return a; }
      a = base.cloneNode(true);
      a.id = id;
      if (activeCls) a.classList.remove(activeCls);
      a.setAttribute('href', '/setting/profile#' + hash);
      const lab = a.querySelector('[data-type="label"]'); if (lab) lab.textContent = label;
      const ic = a.querySelector('[data-type="icon"]'); if (ic) ic.innerHTML = icon;
      a.addEventListener('click', (e) => { e.preventDefault(); goHash(hash); });
      return a;
    };
    const fick = mk('vaf-nav-fick', 'Meine Fickliste', 'fickliste', fickIcon(2, 18));
    const opa = mk('vaf-nav-opa', `${word()}-Schutz`, 'opa-schutz', oldManSvg(1.1));
    const after = nav.querySelector('a[href="/dating/my-dates"]');
    const before = nav.querySelector('a[href="/setting/privacy/home"]');
    if (after && fick.previousElementSibling !== after) after.after(fick);
    if (before && opa.nextElementSibling !== before) before.before(opa);
    const h = location.hash.replace('#', '').split('=')[0];
    const ours = location.pathname === '/setting/profile' && ['opa-schutz', 'fickliste', 'archiv', 'extern'].includes(h);
    if (activeCls) {
      for (const a of nav.querySelectorAll('a[href]')) {
        const want = ours ? ((a.id === 'vaf-nav-opa' && h === 'opa-schutz') || (a.id === 'vaf-nav-fick' && h !== 'opa-schutz'))
          : !a.id.startsWith('vaf-nav') && location.pathname.startsWith(a.getAttribute('href'));
        if (a.classList.contains(activeCls) !== want) a.classList.toggle(activeCls, want);
      }
    }
  }
  function goHash(hash) {
    if (location.pathname === '/setting/profile') { if (location.hash !== '#' + hash) { location.hash = hash; } else routeSettings(); }
    else location.href = '/setting/profile#' + hash;
  }

  // ---------- eigener Inhalt im Hauptbereich ----------
  let ownView = null;   // { kind, el }
  function mainArea() { return document.querySelector('main.ant-layout-content .Hg9Kid') || document.querySelector('main.ant-layout-content') || document.querySelector('main'); }
  function showOwn(kind, render) {
    const main = mainArea();
    if (!main) return false;
    if (ownView && ownView.kind === kind && ownView.el.isConnected) return true;
    hideOwn(true);
    for (const c of main.children) if (!c.dataset.vafOwn) { c.dataset.vafHidden = '1'; c.style.display = 'none'; }
    const el = document.createElement('div');
    el.dataset.vafOwn = '1';
    main.appendChild(el);
    ownView = { kind, el };
    render(el);
    return true;
  }
  function hideOwn(quiet = false) {
    if (ownView && ownView.el) ownView.el.remove();
    ownView = null;
    for (const c of document.querySelectorAll('[data-vaf-hidden]')) { c.style.display = ''; delete c.dataset.vafHidden; }
  }
  function routeSettings() {
    if (location.pathname !== '/setting/profile') { if (ownView) hideOwn(); return; }
    const [h, arg] = location.hash.replace('#', '').split('=');
    if (ownView && ownView.kind === 'opa' && h !== 'opa-schutz' && settingsDirty) {
      if (!confirmLeaveSync()) { history.replaceState(null, '', '#opa-schutz'); return; }
      settingsDirty = false;
    }
    if (h === 'opa-schutz') showOwn('opa', renderSettings);
    else if (h === 'fickliste') showOwn('fick', renderFickList);
    else if (h === 'archiv') showOwn('archiv:' + arg, (el) => renderArchive(el, decodeURIComponent(arg || '')));
    else if (h === 'extern') showOwn('extern:' + arg, (el) => renderExternal(el, decodeURIComponent(arg || '')));
    else if (ownView) { if (!settingsDirty || confirmLeaveSync()) hideOwn(); }
    settingsMenu();
  }
  let settingsDirty = false;
  const confirmLeaveSync = () => W.confirm('Ungespeicherte Änderungen verwerfen?');

  // ---------- Bausteine ----------
  function sw(on, fn, title = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'vaf-sw' + (on ? ' on' : ''); b.title = title;
    b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.addEventListener('click', () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); b.setAttribute('aria-checked', v ? 'true' : 'false'); fn(v); });
    return b;
  }
  function numIn(v, fn, min = 0, max = 100000, step = 1) {
    const i = document.createElement('input');
    i.type = 'number'; i.className = 'vaf-num'; i.value = v; i.min = min; i.max = max; i.step = step;
    i.addEventListener('change', () => { let x = Number(i.value); if (!isFinite(x)) x = min; x = Math.max(min, Math.min(max, x)); i.value = x; fn(x); });
    return i;
  }
  function txtIn(v, fn, ph = '') {
    const i = document.createElement('input'); i.type = 'text'; i.className = 'vaf-txt'; i.value = v || ''; i.placeholder = ph;
    i.addEventListener('change', () => fn(i.value)); return i;
  }
  // Schieberegler mit 1–2 Griffen
  function slider(min, max, vals, fn) {
    const el = document.createElement('div');
    el.className = 'vaf-sl';
    el.innerHTML = '<div class="t"></div><div class="f"></div>' + vals.map(() => '<div class="h"><span class="v"></span></div>').join('');
    const hs = [...el.querySelectorAll('.h')], f = el.querySelector('.f');
    const cur = [...vals];
    const pos = (v) => `calc(8px + (100% - 16px) * ${(v - min) / (max - min)})`;
    const draw = () => {
      hs.forEach((h, i) => { h.style.left = pos(cur[i]); h.querySelector('.v').textContent = cur[i]; });
      if (cur.length === 2) { f.style.left = pos(cur[0]); f.style.width = `calc((100% - 16px) * ${(cur[1] - cur[0]) / (max - min)})`; }
      else { f.style.left = pos(cur[0]); f.style.width = `calc((100% - 16px) * ${(max - cur[0]) / (max - min)})`; }
    };
    hs.forEach((h, i) => h.addEventListener('pointerdown', (e) => {
      e.preventDefault(); h.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        const r = el.getBoundingClientRect();
        let v = Math.round(min + (ev.clientX - r.left - 8) / (r.width - 16) * (max - min));
        v = Math.max(min, Math.min(max, v));
        if (cur.length === 2) { if (i === 0) v = Math.min(v, cur[1]); else v = Math.max(v, cur[0]); }
        if (v !== cur[i]) { cur[i] = v; draw(); }
      };
      const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); fn([...cur]); };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
    }));
    draw();
    el.set = (v) => { v.forEach((x, i) => { cur[i] = x; }); draw(); };
    return el;
  }
  function row(card, label, desc, ...ctl) {
    const r = document.createElement('div');
    r.className = 'vaf-r';
    r.innerHTML = `<div class="vaf-lab"><span class="vaf-l">${label}</span>${desc ? `<div class="vaf-d">${desc}</div>` : ''}</div><div class="vaf-ctl"></div>`;
    ctl.flat().filter(Boolean).forEach((c) => r.querySelector('.vaf-ctl').append(typeof c === 'string' ? document.createRange().createContextualFragment(c) : c));
    card.appendChild(r);
    return r;
  }
  function card(root, title, extra = '') {
    const h = document.createElement('h2'); h.innerHTML = title + extra; root.appendChild(h);
    const c = document.createElement('div'); c.className = 'vaf-card'; root.appendChild(c);
    return c;
  }

  // ---------- Seite rendern ----------
  let draft = null;
  function renderSettings(el) {
    if (!document.getElementById('vaf-set-style')) { const st = document.createElement('style'); st.id = 'vaf-set-style'; st.textContent = SETTINGS_CSS; document.head.appendChild(st); }
    ensureStyle();
    draft = clone(S());
    settingsDirty = false;
    el.id = 'vaf-set';
    const W1 = word();
    el.innerHTML = `<h2 style="margin-top:4px">${esc(W1)}-Schutz</h2><div class="vaf-info"><div>Derzeit blockiert: <b id="vaf-cur-n">…</b></div><div>Nach Anwenden der neuen Einstellungen: <b id="vaf-after-n">…</b></div><div>Warteliste: <b id="vaf-q-n">…</b></div></div><div id="vaf-set-body"></div>`;
    const body = el.querySelector('#vaf-set-body');
    const touch = () => { settingsDirty = true; projectLater(); };
    const lab = (text, path) => `<span data-path="${path}">${text}</span>`;
    const rerender = () => { const y = W.scrollY; body.innerHTML = ''; build(); W.scrollTo(0, y); };

    function build() {
      // ---- Gruppen ----
      for (const gk of GROUP_KEYS) {
        const g = draft.groups[gk];
        const c = card(body, GROUP_NAMES[gk]);
        row(c, 'Schalter', '',
          sw(g.visual, (v) => { g.visual = v; touch(); }), lab('Visuelle Einstufung', `groups.${gk}.visual`),
          '<span style="width:20px"></span>',
          sw(g.ignore, (v) => { g.ignore = v; touch(); }), lab('Ignorieren aktiv', `groups.${gk}.ignore`));
        if (gk === 'p') {
          const sel = document.createElement('select');
          sel.innerHTML = '<option value="any">einer über der Grenze</option><option value="all">beide über der Grenze</option>';
          sel.value = g.coupleMode; sel.addEventListener('change', () => { g.coupleMode = sel.value; touch(); });
          row(c, lab('Paar-Regel', 'groups.p.coupleMode'), 'wann ein Paar als alt gilt', sel);
          const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = !!g.separate;
          chk.addEventListener('change', () => { g.separate = chk.checked; rerender(); touch(); });
          row(c, lab('Getrenntes Alter', 'groups.p.separate'), 'je Quelle eine Zeile für die Frau und eine für den Mann', chk);
        }
        const rowsFor = (key, who) => {
          const grid = document.createElement('div');
          grid.className = 'vaf-srcgrid';
          grid.innerHTML = `<div class="vaf-h">Quelle${who ? ' · ' + who : ''}</div><div class="vaf-h">Visuell: Stufe 1 bis · Stufe 2 bis</div><div class="vaf-h">Ignorieren ab</div>`;
          for (const sk of SRC_KEYS) {
            if (!SOURCES[sk].avail) continue;   // Partygäste: ausgeblendet, intern = Profilbesucher
            const v = g[key][sk];
            const name = document.createElement('div');
            name.innerHTML = lab(esc(SOURCES[sk].label), `groups.${gk}.${key}.${sk}`); name.title = SOURCES[sk].tip;
            const s1 = slider(18, 100, [v[0], v[1]], (x) => { v[0] = x[0]; v[1] = x[1]; touch(); });
            const s2 = slider(18, 100, [v[2]], (x) => { v[2] = x[0]; touch(); });
            grid.append(name, s1, s2);
          }
          c.appendChild(grid);
          const b = document.createElement('button'); b.type = 'button'; b.className = 'vaf-btn'; b.textContent = 'Werte der ersten Zeile für alle Quellen übernehmen';
          b.addEventListener('click', () => { const f = g[key][SRC_KEYS[0]]; for (const sk of SRC_KEYS) g[key][sk] = [...f]; rerender(); touch(); });
          row(c, '', '', b);
        };
        if (gk === 'p' && g.separate) { rowsFor('srcW', 'Frau'); rowsFor('srcM', 'Mann'); } else rowsFor('src', '');
        if (gk === 'p') {
          row(c, lab('Sugar Daddy', 'groups.p.sugarDaddy'), 'Mann deutlich älter als die Frau', sw(g.sugarDaddy.on, (v) => { g.sugarDaddy.on = v; touch(); }), 'Altersabstand ab', numIn(g.sugarDaddy.gap, (x) => { g.sugarDaddy.gap = x; touch(); }, 1, 60), 'Jahren');
          row(c, lab('Sugar Mom', 'groups.p.sugarMom'), 'Frau deutlich älter als der Mann', sw(g.sugarMom.on, (v) => { g.sugarMom.on = v; touch(); }), 'Altersabstand ab', numIn(g.sugarMom.gap, (x) => { g.sugarMom.gap = x; touch(); }, 1, 60), 'Jahren');
        }
        const lbl = document.createElement('div'); lbl.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%';
        [0, 2, 4, 1, 3, 5].forEach((i) => { const t = g.labels[i]; const inp = txtIn(t, (v) => { g.labels[i] = v.trim() || DEFAULTS.groups[gk].labels[i]; touch(); }, i % 2 ? 'Mehrzahl' : 'Einzahl'); inp.style.minWidth = '0'; lbl.appendChild(inp); });
        row(c, lab('Bezeichnungen', `groups.${gk}.labels`), 'Stufe 1 · 2 · 3; oben Einzahl, unten Mehrzahl', lbl);
        const types = document.createElement('div'); types.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap';
        for (const t of ['m', 'w', 'p', 'ts', 'tv']) {
          const l = document.createElement('label'); l.style.cssText = 'display:flex;gap:6px;align-items:center';
          const ch = document.createElement('input'); ch.type = 'checkbox'; ch.checked = g.types.includes(t);
          ch.addEventListener('change', () => {
            if (ch.checked) { for (const k of GROUP_KEYS) draft.groups[k].types = draft.groups[k].types.filter((x) => x !== t); g.types.push(t); }
            else g.types = g.types.filter((x) => x !== t);
            rerender(); touch();
          });
          l.append(ch, TYPE_NAMES[t]); types.appendChild(l);
        }
        row(c, lab('Profiltypen', `groups.${gk}.types`), 'ein Haken entfernt den Typ aus den anderen Gruppen', types);
      }

      // ---- Allgemein ----
      const ca = card(body, 'Allgemein');
      row(ca, lab('Warnalter', 'warnYears'), 'so viele Jahre vor „Ignorieren ab“: dunkelorange und vormerken', numIn(draft.warnYears, (x) => { draft.warnYears = x; touch(); }, 0, 10), 'Jahr(e)',
        sw(draft.watch, (v) => { draft.watch = v; touch(); }), lab('vormerken', 'watch'));
      const wl = draft.whitelist;
      const wlSum = `${wl.names.slice(0, 6).map((x) => esc(x.n)).join(', ')}${wl.names.length > 6 ? ' …' : ''}${wl.prefixes.length ? ` · Präfix ${wl.prefixes.map((p) => '„' + esc(p) + '“').join(', ')}` : ''} · ${wl.names.length} Einträge${wl.groups.length ? `, ${wl.groups.length} Gruppen` : ''}`;
      const wb = document.createElement('button'); wb.type = 'button'; wb.className = 'vaf-btn'; wb.textContent = 'Whitelist bearbeiten';
      wb.addEventListener('click', () => editWhitelist(() => { rerender(); touch(); }));
      row(ca, lab('Whitelist', 'whitelist'), '', `<span>${wlSum}</span>`, wb);
      const ab = document.createElement('button'); ab.type = 'button'; ab.className = 'vaf-btn'; ab.textContent = 'Anzeigen';
      ab.addEventListener('click', showAutoWhitelist);
      row(ca, 'Automatische Whitelist', 'poppen-Mitarbeiter, Freunde, Mitglieder verwalteter Gruppen', '<span id="vaf-autowl">…</span>', ab);
      // Party-Termine (Messenger, Abschnitt „Termine“)
      const tSt = document.createElement('span'); tSt.className = 'vaf-mini';
      termHandle().then((h) => { tSt.textContent = !termSupported() ? 'nur in Chrome/Edge' : h ? `Datei: ${h.name}` : 'keine Datei gewählt'; });
      const tB = document.createElement('button'); tB.type = 'button'; tB.className = 'vaf-btn'; tB.textContent = 'Datei wählen …';
      tB.addEventListener('click', async () => { const h = await pickTermFile(); if (h) tSt.textContent = `Datei: ${h.name}`; });
      row(ca, 'Party-Termine', 'Textdatei „wann - wo - was - Link“; die nächsten 5 Termine stehen im Messenger unter „Termine“', tB, tSt);
      autoWhitelistCount().then((n) => { const e = el.querySelector('#vaf-autowl'); if (e) e.textContent = `${fmtN(n)} Mitglieder`; });

      // ---- Gruppen ----
      const cg = card(body, 'Gruppen', ' <small data-reload="1">neu laden</small>');
      body.lastElementChild.previousElementSibling.querySelector('[data-reload]').addEventListener('click', async () => { await loadGroups().catch(() => {}); rerender(); });
      const gr = G.get('groups', null);
      if (!gr) { row(cg, 'Noch nicht geladen', '', '<span class="vaf-mini">„neu laden“ klicken</span>'); loadGroups().then(() => rerender()).catch(() => {}); }
      else {
        const mbox = document.createElement('div'); mbox.className = 'vaf-grp';
        for (const g of gr.managed) {
          const l = document.createElement('label');
          const s2 = sw(draft.managedWhitelist[g.cms] !== false, (v) => { if (v) delete draft.managedWhitelist[g.cms]; else draft.managedWhitelist[g.cms] = false; touch(); });
          l.append(s2, `${g.name} · ${g.role === 'moderator' ? 'Moderatorin' : 'Eigentümerin'} · ${fmtN(g.count)} Mitglieder`);
          mbox.appendChild(l);
        }
        row(cg, lab('Verwaltete Gruppen', 'managedWhitelist'), `Schalter = Mitglieder whitelisten, wenn du die Gruppe allein leitest (Schonfrist ${draft.expert.groupGraceDays} Tage)`, gr.managed.length ? mbox : '<span class="vaf-mini">keine</span>');
        const abox = document.createElement('div'); abox.className = 'vaf-grp';
        for (const g of gr.attended) {
          const l = document.createElement('label');
          const ch = document.createElement('input'); ch.type = 'checkbox'; ch.checked = draft.groupScan[g.cms] !== false;
          ch.addEventListener('change', () => { if (ch.checked) delete draft.groupScan[g.cms]; else draft.groupScan[g.cms] = false; touch(); });
          l.append(ch, `${g.name} · ${fmtN(g.count)}`);
          abox.appendChild(l);
        }
        row(cg, lab('Beim Gruppen-Scan prüfen', 'groupScan'), 'Gruppen, in denen du Mitglied bist', abox);
      }

      // ---- Automatik ----
      const cu = card(body, 'Automatik');
      row(cu, lab('Besucherliste', 'auto.besucher'), '', sw(draft.auto.besucher, (v) => { draft.auto.besucher = v; touch(); }), 'beim Öffnen automatisch prüfen');
      row(cu, lab('Mitgliedersuche (Seite)', 'auto.suche'), '', sw(draft.auto.suche, (v) => { draft.auto.suche = v; touch(); }), 'beim Öffnen automatisch prüfen');
      row(cu, lab('Interaktionen (Seiten)', 'auto.interaktionen'), 'Likes, Sticker, Posteingang', sw(draft.auto.interaktionen, (v) => { draft.auto.interaktionen = v; touch(); }), 'beim Öffnen automatisch prüfen');
      row(cu, lab('Automatisch anmelden', 'autoLogin'), 'nur mit vom Browser ausgefüllten Daten', sw(draft.autoLogin, (v) => { draft.autoLogin = v; touch(); }), 'Pause zwischen Versuchen', numIn(draft.autoLoginPauseMin, (x) => { draft.autoLoginPauseMin = x; touch(); }, 1, 1440), 'Min.');
      row(cu, lab('Wartungsseite', 'maintenanceMin'), '', 'neuer Versuch nach', numIn(draft.maintenanceMin, (x) => { draft.maintenanceMin = x; touch(); }, 1, 1440), 'Min.');

      // ---- Experten ----
      const exp = document.createElement('div'); exp.className = 'vaf-exp'; exp.textContent = '▸ Experten-Einstellungen';
      body.appendChild(exp);
      const ce = document.createElement('div'); ce.className = 'vaf-card'; ce.style.display = 'none'; body.appendChild(ce);
      exp.addEventListener('click', () => { const open = ce.style.display === 'none'; ce.style.display = open ? '' : 'none'; exp.textContent = (open ? '▾' : '▸') + ' Experten-Einstellungen'; });
      const x = draft.expert;
      row(ce, lab('Debug-Ausgaben', 'expert.debug'), 'zusätzliche Ausgaben in der Konsole (F12)', sw(x.debug, (v) => { x.debug = v; touch(); }));
      row(ce, lab('Testlauf', 'expert.dryRun'), 'nichts wird verändert, nur protokolliert', sw(x.dryRun, (v) => { x.dryRun = v; touch(); }));
      row(ce, lab('Obergrenze erster Scan', 'expert.firstScanMax'), 'Profilbesucher / Interaktionen', numIn(x.firstScanMax, (v) => { x.firstScanMax = v; touch(); }, 10, 1000000));
      const lim = row(ce, lab('Höchstzahl der Einträge auf der Blockierliste', 'expert.limit'), '', numIn(x.limit, (v) => { x.limit = v; touch(); }, 1, 1e9));
      lim.querySelector('.vaf-num').style.width = '120px';
      const rank = document.createElement('div'); rank.className = 'vaf-rank';
      rank.title = 'Bestimmt, welche Quelle in der Notiz steht und wer auf der Warteliste zuerst drankommt';
      const drawRank = () => {
        rank.innerHTML = '';
        // Partygäste ausgeblendet; ihr Platz in x.rank bleibt erhalten
        const vis = x.rank.filter((k) => !(SOURCES[k] && !SOURCES[k].avail));
        const swap = (a, b) => { const ia = x.rank.indexOf(a), ib = x.rank.indexOf(b); [x.rank[ia], x.rank[ib]] = [x.rank[ib], x.rank[ia]]; drawRank(); touch(); };
        vis.forEach((k, i) => {
          const r = document.createElement('div');
          r.innerHTML = `<i>${i + 1}.</i><span>${esc((SOURCES[k] || { label: 'Synchronisation' }).label)}</span><b data-u class="${i ? '' : 'off'}">▲</b><b data-d class="${i < vis.length - 1 ? '' : 'off'}">▼</b>`;
          r.querySelector('[data-u]').addEventListener('click', () => { if (i) swap(vis[i - 1], k); });
          r.querySelector('[data-d]').addEventListener('click', () => { if (i < vis.length - 1) swap(k, vis[i + 1]); });
          rank.appendChild(r);
        });
      };
      drawRank();
      row(ce, lab('Rangfolge der Quellen', 'expert.rank'), 'oben = wichtigste', rank);
      row(ce, lab('Pause zwischen Sperren', 'expert.pauseMin'), 'zufällig', numIn(x.pauseMin, (v) => { x.pauseMin = Math.min(v, x.pauseMax); touch(); }, 0, 600), 'bis', numIn(x.pauseMax, (v) => { x.pauseMax = Math.max(v, x.pauseMin); touch(); }, 0, 600), 'Sek.');
      row(ce, lab('Messung gültig', 'expert.bodyValidDays'), 'Größe/Gewicht (Figur-Badges)', numIn(x.bodyValidDays, (v) => { x.bodyValidDays = v; touch(); }, 1, 3650), 'Tage · „UNKNOWN“ erneut prüfen nach', numIn(x.bodyUnknownDays, (v) => { x.bodyUnknownDays = v; touch(); }, 1, 3650), 'Tagen');
      row(ce, lab('Schonfrist Gruppen-Whitelist', 'expert.groupGraceDays'), '', numIn(x.groupGraceDays, (v) => { x.groupGraceDays = v; touch(); }, 1, 3650), 'Tage');
      // ---- Besonders böse Popsters (User-ID oder Nickname, je Zeile einer) ----
      const evil = document.createElement('textarea'); evil.className = 'vaf-in'; evil.rows = 5; evil.spellcheck = false;
      evil.placeholder = 'User-ID oder Nickname, je Zeile einer'; evil.style.cssText = 'resize:vertical;font-family:inherit;min-width:220px';
      evil.value = (x.evil || []).join('\n');
      evil.addEventListener('change', () => {
        const seenE = new Set();
        x.evil = evil.value.split(/\r?\n/).map((t) => t.trim()).filter((t) => t && !seenE.has(t.toLowerCase()) && seenE.add(t.toLowerCase()));
        evil.value = x.evil.join('\n'); touch();
      });
      row(ce, lab('Besonders böse Popsters', 'expert.evil'), 'User-IDs oder Nicknames, je Zeile einer', evil);
      // ---- Gruppenanfragen (Regeln nur hier, nicht im Quelltext) ----
      const gq = draft.groupReq;
      const chips = (arr) => {
        const box = document.createElement('div'); box.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
        const draw = () => {
          box.innerHTML = '';
          arr.forEach((t, i) => { const c = document.createElement('span'); c.className = 'vaf-chip'; c.innerHTML = `${esc(t)} <b>✕</b>`; c.querySelector('b').addEventListener('click', () => { arr.splice(i, 1); draw(); touch(); }); box.appendChild(c); });
          const add = document.createElement('button'); add.type = 'button'; add.className = 'vaf-btn'; add.textContent = '+';
          add.addEventListener('click', () => { const v = W.prompt('Typ (wie im Profil unter „Typ“):'); if (v && v.trim()) { arr.push(v.trim()); draw(); touch(); } });
          box.appendChild(add);
        };
        draw(); return box;
      };
      row(ce, lab('Gruppenanfragen: Gruppen', 'groupReq.match'), 'Name enthält (regulärer Ausdruck); leer = aus', txtIn(gq.match, (v) => { gq.match = v; touch(); }, 'z. B. muster1|muster2'));
      row(ce, lab('Typ annehmen', 'groupReq.accept'), '', chips(gq.accept));
      row(ce, lab('Typ ablehnen', 'groupReq.reject'), '', chips(gq.reject));
      row(ce, lab('Ohne Typ/Bild & nur Deutsch ablehnen', 'groupReq.noPicNoType'), 'zusätzliche Ablehnregel', sw(!!gq.noPicNoType, (v) => { gq.noPicNoType = v; touch(); }));
      row(ce, lab('Fotos in der Prüfung', 'groupReq.photos'), '', numIn(gq.photos, (v) => { gq.photos = v; touch(); }, 0, 20));

      const recSt = document.createElement('span'); recSt.className = 'vaf-mini';
      Recorder.stats().then((r) => { recSt.textContent = `${r.total} Schnittstellen erfasst, davon ${r.fresh} neu`; });
      const recEx = document.createElement('button'); recEx.type = 'button'; recEx.className = 'vaf-btn'; recEx.textContent = 'Exportieren';
      recEx.addEventListener('click', async () => download(`poppen-api-rekorder-${stamp()}.json`, JSON.stringify(await Recorder.export(), null, 2)));
      const recCl = document.createElement('button'); recCl.type = 'button'; recCl.className = 'vaf-btn'; recCl.textContent = 'Leeren';
      recCl.addEventListener('click', async () => { if (W.confirm('Rekorder leeren?')) { await Recorder.clear(); recSt.textContent = '0 Schnittstellen erfasst'; } });
      row(ce, lab('API-Rekorder', 'expert.recorder'), 'schneidet Abfragen der Seite mit (Sensibles geschwärzt)', sw(x.recorder, (v) => { x.recorder = v; touch(); }), recSt, recEx, recCl);
      // Daten
      const btn = (t, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'vaf-btn'; b.textContent = t; b.addEventListener('click', fn); return b; };
      // Abgleich mit JOYclub (Briefkasten)
      const bkSt = document.createElement('span'); bkSt.className = 'vaf-mini';
      const bkInfo = () => { const t = G.get('bk_test', null); const at = G.get('bk_full_sent', 0); bkSt.textContent = (t ? t.msg : 'noch nicht geprüft') + (at ? ` · letzter Abgleich ${deDateTime(at)}` : ''); };
      bkInfo();
      const bkBtn = btn('Jetzt prüfen', async () => { bkSt.textContent = 'prüfe …'; try { await bkTest(); } catch {} bkInfo(); });
      row(ce, 'Abgleich mit JOYclub', 'automatisch über den Briefkasten (Fickliste und Textvorlagen)', bkSt, bkBtn);

      row(ce, 'Alle Daten', 'Einstellungen, Gedächtnis, Warteliste, Fickliste (verschlüsselt) …', btn('Alle Daten sichern', () => backupAll()), btn('Alle Daten wiederherstellen', () => restoreAll()));
      row(ce, 'Mitglieder-Gedächtnis', 'Wissen über andere Mitglieder (z. B. für ein zweites Profil)', btn('Exportieren ohne Bilder', () => exportMemory(false)), btn('mit Bildern', () => exportMemory(true)), btn('Importieren (mischen)', () => importMemory()));
      const n99 = document.createElement('span'); n99.className = 'vaf-mini';
      KV.get('log99', {}).then((l) => { n99.textContent = `${Object.keys(l).length} erfasst`; });
      row(ce, '99-Jährige', 'Profile mit Alter 99 (gelten als unklar)', btn('Exportieren (.txt)', export99), btn('Liste leeren', async () => { if (W.confirm('Liste der 99-Jährigen leeren?')) { await KV.set('log99', {}); n99.textContent = '0 erfasst'; } }), n99);
      const work = btn('Jetzt abarbeiten', () => workQueue(work));
      if (Etappe.running && Etappe.manual) work.textContent = 'Anhalten';
      row(ce, 'Warteliste', 'Blockiert wird im Hintergrund; „Jetzt abarbeiten“ arbeitet die Warteliste auch bei ausgeschaltetem Schalter einmal ganz ab', btn('Anzeigen', showQueue), work, btn('Leeren', async () => { if (W.confirm('Warteliste leeren?')) { await Queue.clear(); updateCounts(); } }));

      // ---- Fuß ----
      const foot = document.createElement('div'); foot.className = 'vaf-foot';
      const save = btn('Speichern', () => saveFromPage()); save.classList.add('vaf-y');
      const cancel = btn('Abbrechen', () => { draft = clone(S()); settingsDirty = false; rerender(); projectLater(); });
      foot.append(save, cancel);
      body.appendChild(foot);
    }
    build();
    updateCounts();
    projectLater();
    const iv = setInterval(() => { if (!el.isConnected) clearInterval(iv); else updateCounts(); }, 5000);
  }
  async function updateCounts() {
    const e1 = document.getElementById('vaf-cur-n'), e3 = document.getElementById('vaf-q-n');
    const b = G.get('blocked_count', null), lim = S().expert.limit;
    if (e1) e1.textContent = `${b == null ? '?' : fmtN(b)} / ${fmtN(lim)}`;
    if (e3) e3.textContent = fmtN(await Queue.count());
  }
  // „Nach Anwenden der neuen Einstellungen“: aus dem Gedächtnis aller bekannten Mitglieder
  let projT = null;
  function projectLater() { clearTimeout(projT); projT = setTimeout(async () => {
    const e = document.getElementById('vaf-after-n');
    if (!e || !draft) return;
    e.textContent = 'rechne …';
    if (ingestDue()) {
      e.textContent = 'Blockierliste wird eingelesen …';
      e.title = 'Nach dem Update liest das Skript die Blockierliste einmal ins Gedächtnis ein. Erst danach lässt sich die Zahl berechnen.';
      setTimeout(projectLater, 10000);   // das Einlesen kann auch in einem anderen Tab laufen
      return;
    }
    const p = await projection(S(), draft);
    const lim = draft.expert.limit;
    // Basis ist die ganze Blockierliste (auch von Hand Blockierte); verändert wird nur, was die neuen Regeln wegnehmen oder hinzufügen
    const cur = G.get('blocked_count', null);
    const after = cur == null ? p.keep + p.add : Math.max(0, cur - p.drop + p.add);
    e.textContent = `${fmtN(after)} / ${fmtN(lim)}${p.unclear ? ' +' : ''}`;
    e.style.color = after > lim ? '#ff7875' : lim - after < 50 ? '#ffa940' : '';
    e.title = `bleiben ${fmtN(p.keep)}, fallen weg ${fmtN(p.drop)}, kommen dazu ${fmtN(p.add)}, unklar ${fmtN(p.unclear)}`;
  }, 600); }

  // Auswirkungen einer Regeländerung
  const srcOfMember = (m) => {
    const keys = Object.keys(m.seen || {});
    const ranked = keys.map((k) => srcKeyOf(k)).filter((k) => SRC_KEYS.includes(k));
    return ranked.sort((a, b) => S().expert.rank.indexOf(a) - S().expert.rank.indexOf(b))[0] || 'suche';
  };
  async function projection(oldS, newS) {
    const res = { keep: 0, drop: 0, add: 0, notes: 0, unclear: 0, dropList: [], addList: [], noteList: [] };
    await Members.each((m) => {
      const blocked = m.blk && m.blk.opa && !m.unblk;
      if (!m.ages || !m.ages.length) { if (blocked) res.keep++; return; }
      const src = blocked && m.blk.src ? m.blk.src : srcOfMember(m);
      const ages = m.birth && m.birth.length ? m.birth.map((b) => ageToday(b)) : m.ages;
      const cn = classify({ ...m, ages }, src, newS);
      if (cn.unclear) { res.unclear++; return; }
      if (blocked) {
        if (cn.ignore) { res.keep++; if (m.blk.note && noteWord(m, newS) !== noteWord(m, oldS)) { res.notes++; res.noteList.push(m); } }
        else { res.drop++; res.dropList.push(m); }
      } else if (cn.ignore && !(m.blk && !m.unblk)) { res.add++; res.addList.push({ ...m, ages, _src: src }); }
    });
    return res;
  }
  const RULE_PATHS = (s) => JSON.stringify([GROUP_KEYS.map((k) => { const g = s.groups[k]; return [g.ignore, g.types, g.src, g.srcW, g.srcM, g.separate, g.coupleMode, g.sugarDaddy, g.sugarMom, g.labels[4]]; }), s.whitelist, s.expert.limit]);

  async function saveFromPage(...a) { return Prio.run('Einstellungen speichern', () => saveFromPage_(...a)); }
  async function saveFromPage_() {
    const old = S();
    if (RULE_PATHS(old) === RULE_PATHS(draft)) { saveSettings(draft); settingsDirty = false; toast('Gespeichert.'); return; }
    const p = await projection(old, draft);
    const cur = G.get('blocked_count', null);
    const html = `<div class="vaf-stats"><span>Derzeit blockiert</span><b>${fmtN(cur == null ? p.keep + p.drop : cur)}</b>` +
      `<span>Nach Anwenden</span><b>${fmtN(cur == null ? p.keep + p.add : Math.max(0, cur - p.drop + p.add))}</b><span>Fallen weg</span><b>${fmtN(p.drop)}</b><span>Kommen dazu</span><b>${fmtN(p.add)}</b>` +
      `<span>Notizen weichen ab</span><b>${fmtN(p.notes)}</b><span>Unklar (Alter 99)</span><b>${fmtN(p.unclear)}</b></div>`;
    const v = await ask('Regeln geändert', html, [
      { label: 'Änderungen speichern und anwenden', value: 'all', primary: true },
      ...(p.drop ? [{ label: '… und Mitglieder entsperren', value: 'drop' }] : []),
      ...(p.add ? [{ label: '… und Mitglieder sperren', value: 'add' }] : []),
      { label: 'Änderungen nur speichern', value: 'save' },
      { label: 'Änderungen verwerfen', value: 'discard', focus: true, cancel: true },
    ]);
    if (!v || v === 'discard') { draft = clone(S()); settingsDirty = false; routeSettingsRerender(); return; }
    saveSettings(draft); settingsDirty = false;
    if (v === 'all' || v === 'add') { for (const m of p.addList) await Queue.add(m, m._src); }
    if (v === 'all' || v === 'drop') applyDrops(p.dropList, v === 'all' ? p.noteList : []);
    else if (v === 'all') applyDrops([], p.noteList);
    toast(`Gespeichert.${p.add && (v === 'all' || v === 'add') ? ` ${fmtN(p.add)} auf die Warteliste.` : ''}`);
    updateCounts(); projectLater();
  }
  function routeSettingsRerender() { hideOwn(); routeSettings(); }
  async function applyDrops(drops, notes) {
    let i = 0;
    for (const m of drops) {
      i++;
      toast(`Entsperre ${i} / ${drops.length}: ${esc(m.nick)}`, 0);
      await unblockOne(m);
      await sleep(rand(S().expert.pauseMin * 1000, S().expert.pauseMax * 1000));
    }
    for (const m of notes) {
      const t = makeNote(m, m.blk.src, new Date(m.blk.at || now()));
      if (!dry()) { try { await BL.note(m.uid, t); await Members.update(m.uid, (x) => { x.blk.note = t; }); } catch {} }
    }
    if (drops.length || notes.length) toast(`Fertig: ${drops.length} entsperrt, ${notes.length} Notizen angepasst.`);
  }

  // ---------- Whitelist bearbeiten (mit Gruppen) ----------
  function editWhitelist(done) {
    const wl = draft.whitelist;
    const m = modal({ title: 'Whitelist bearbeiten', wide: false });
    const draw = () => {
      const groups = [...wl.groups].sort((a, b) => a.localeCompare(b, 'de'));
      const byG = (g) => wl.names.filter((x) => (x.g || '') === g).sort((a, b) => a.n.localeCompare(b.n, 'de'));
      m.body.innerHTML = `<h3>Eigene Whitelist-Gruppen</h3><div class="vaf-list">${groups.map((g) => `<div>${esc(g)} <a href="#" data-ren="${esc(g)}">✎</a> <a href="#" data-delg="${esc(g)}">✕</a></div>`).join('') || '<div>keine</div>'}</div>
        <div style="display:flex;gap:8px;margin-bottom:12px"><input class="vaf-in" id="vaf-ng" placeholder="Neue Gruppe"><button type="button" class="vaf-big" style="width:auto" id="vaf-ngb">Speichern</button></div>
        <h3>Präfixe</h3><input class="vaf-in" id="vaf-pre" value="${esc(wl.prefixes.join(', '))}" placeholder="z. B. Pop-MOD-">
        ${['', ...groups].map((g) => `<h3>${g ? esc(g) : 'Ohne Gruppe'}</h3><div class="vaf-list">${byG(g).map((x) => `<div>${esc(x.n)} <a href="#" data-deln="${esc(x.n)}">✕</a></div>`).join('') || '<div>leer</div>'}</div>
          <div style="display:flex;gap:8px;margin-bottom:6px"><input class="vaf-in" data-addin="${esc(g)}" placeholder="Name"><button type="button" class="vaf-big" style="width:auto" data-addbtn="${esc(g)}">Speichern</button></div>`).join('')}`;
      m.body.querySelector('#vaf-ngb').addEventListener('click', () => { const v = m.body.querySelector('#vaf-ng').value.trim(); if (!v) return; if (wl.groups.includes(v)) { W.alert('Diese Gruppe gibt es schon.'); return; } wl.groups.push(v); draw(); });
      m.body.querySelector('#vaf-pre').addEventListener('change', (e) => { wl.prefixes = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); });
      m.body.querySelectorAll('[data-ren]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const o = a.dataset.ren; const n = (W.prompt('Neuer Name:', o) || '').trim(); if (!n || n === o) return; if (wl.groups.includes(n)) { W.alert('Diese Gruppe gibt es schon.'); return; } wl.groups = wl.groups.map((g) => (g === o ? n : g)); wl.names.forEach((x) => { if (x.g === o) x.g = n; }); draw(); }));
      m.body.querySelectorAll('[data-delg]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const o = a.dataset.delg; wl.groups = wl.groups.filter((g) => g !== o); wl.names.forEach((x) => { if (x.g === o) x.g = ''; }); draw(); }));
      m.body.querySelectorAll('[data-deln]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); wl.names = wl.names.filter((x) => x.n !== a.dataset.deln); draw(); }));
      m.body.querySelectorAll('[data-addbtn]').forEach((b) => b.addEventListener('click', () => {
        const g = b.dataset.addbtn; const inp = m.body.querySelector(`[data-addin="${W.CSS.escape(g)}"]`); const v = inp.value.trim(); if (!v) return;
        const ex = wl.names.find((x) => norm(x.n) === norm(v));
        if (ex) { W.alert(`Steht schon in ${ex.g || '„Ohne Gruppe“'}.`); return; }
        wl.names.push({ n: v, g }); draw();
      }));
    };
    draw();
    m.buttons([{ label: 'Fertig', primary: true, focus: true, fn: () => { m.close(); done(); } }]);
  }
  async function autoWhitelistCount() { let n = 0; await Members.each((m) => { if (autoWhite(m)) n++; }); return n; }
  async function showAutoWhitelist() {
    const rows = [];
    await Members.each((m) => { const r = autoWhite(m); if (r) rows.push(`<div>${esc(m.nick || m.uid)} – ${esc(r)}</div>`); });
    const m = modal({ title: 'Automatische Whitelist', sub: 'Wird automatisch gepflegt; Einträge lassen sich hier nicht entfernen.', html: `<div class="vaf-list">${rows.join('') || '<div>leer</div>'}</div>` });
    m.buttons([{ label: 'Schließen', focus: true, fn: () => m.close() }]);
  }
  async function showQueue() {
    const l = await Queue.list();
    const m = modal({ title: 'Warteliste', sub: `${fmtN(l.length)} Mitglieder, in dieser Reihenfolge`, html: `<div class="vaf-list">${l.slice(0, 2000).map((q) => `<div>${esc(q.nick)} · ${(q.ages || []).join('/')} · ${esc(q.src)}</div>`).join('') || '<div>leer</div>'}${l.length > 2000 ? '<div>…</div>' : ''}</div>` });
    m.buttons([{ label: 'Schließen', focus: true, fn: () => m.close() }]);
  }

  // Button „Jetzt abarbeiten“: Warteliste in diesem Tab bis zum Ende abarbeiten (auch bei ausgeschaltetem Schalter)
  let workCancel = false;
  async function workQueue(b) {
    if (Etappe.manual) { workCancel = true; Etappe.stop(); b.textContent = 'Halte an …'; b.disabled = true; return; }
    const n = await Queue.count();
    if (!n) { toast('Die Warteliste ist leer.'); return; }
    if (dry()) toast('Testlauf ist an: es wird nichts blockiert, nur protokolliert.', 5000);
    workCancel = false;
    b.textContent = 'Übernehme …';
    try {
      // läuft das Blockieren schon (hier oder in einem anderen Tab): übernehmen
      G.set('blk_handover', { tab: TAB_ID, at: now() });
      if (Etappe.running) Etappe.stop();
      for (let t = 0; (Etappe.running || Lock.other('etappe')) && t < 120; t++) { if (workCancel) return; await sleep(500); }
      if (workCancel) return;
      b.textContent = 'Anhalten';
      const st = await Etappe.run('Jetzt abarbeiten', (i, total) => { if (b.isConnected && !b.disabled) b.textContent = `Anhalten (${fmtN(i)} / ${fmtN(total)})`; updateCounts(); }, { manual: true });
      if (!st) { toast('Konnte nicht starten – ein anderer Tab arbeitet gerade.'); return; }
      const rows = st.items.map((it) => `<div>${esc(it.nick)} · ${esc(it.res)}</div>`).join('');
      const m = modal({ title: 'Warteliste abgearbeitet', sub: workCancel ? 'angehalten' : '',
        html: `<div class="vaf-stats"><span>Blockiert</span><b>${fmtN(st.ok)}</b><span>Fallen weg</span><b>${fmtN(st.dropped)}</b><span>Fehlgeschlagen</span><b>${fmtN(st.fail)}</b>${st.test ? `<span>Testlauf</span><b>${fmtN(st.test)}</b>` : ''}${st.limit ? '<span>Höchstzahl erreicht</span><b>ja</b>' : ''}</div>` +
          (rows ? `<div class="vaf-list" style="margin-top:10px">${rows}</div>` : '') +
          (st.fail ? '<p class="vaf-mini">Fehlgeschlagene bleiben auf der Warteliste und werden bis zu dreimal versucht.</p>' : '') });
      m.buttons([{ label: 'Schließen', focus: true, fn: () => m.close() }]);
    } finally {
      G.del('blk_handover');
      if (b.isConnected) { b.disabled = false; b.textContent = 'Jetzt abarbeiten'; }
      updateCounts();
    }
  }

  // Seite mit ungespeicherten Änderungen verlassen
  function leaveGuard() {
    W.addEventListener('beforeunload', (e) => { if (settingsDirty && ownView && ownView.kind === 'opa') { e.preventDefault(); e.returnValue = ''; } });
    document.addEventListener('click', async (e) => {
      if (!settingsDirty || !ownView || ownView.kind !== 'opa') return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.closest('#vaf-set') || a.target === '_blank') return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const v = await ask('Ungespeicherte Änderungen', '<p>Du hast Änderungen auf dieser Seite noch nicht gespeichert.</p>', [
        { label: 'Speichern und verlassen', value: 'save', primary: true }, { label: 'Verwerfen und verlassen', value: 'drop' }, { label: 'Abbrechen', value: null, focus: true, cancel: true }]);
      if (!v) return;
      if (v === 'save') await saveFromPage();
      settingsDirty = false;
      a.click();
    }, true);
  }

  // =====================================================================================
  // Profil-Menü (Klick auf das eigene Profilbild): „Opa-Scan“, „Opa-Schutz“ (Einstellungen), Schalter „Opa-Schutz aktiv“
  // =====================================================================================
  function leafWithText(root, text) {
    const t = norm(text);
    return [...root.querySelectorAll('*')].find((e) => e.children.length === 0 && norm(e.textContent) === t) || null;
  }
  function rowOf(leaf, root) {
    let item = leaf;
    while (item.parentElement && item.parentElement !== root && item.parentElement.children.length < 3) item = item.parentElement;
    return item;
  }
  function profileMenu() {
    for (const pop of document.querySelectorAll('.ant-popover:not(.ant-popover-hidden) .ant-popover-content, .ant-dropdown:not(.ant-dropdown-hidden)')) {
      const edit = leafWithText(pop, 'Profil bearbeiten');
      if (!edit || pop.querySelector('#vaf-pm-scan')) continue;
      const W1 = word();
      const item = rowOf(edit, pop);
      const mk = (id, label, fn, icon) => {
        const c = item.cloneNode(true);
        c.id = id;
        c.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
        const lf = leafWithText(c, 'Profil bearbeiten');
        if (lf) lf.textContent = label;
        const svg = c.querySelector('svg');
        if (svg && icon) { const s = document.createElement('span'); s.innerHTML = icon; s.style.cssText = 'display:inline-flex;font-size:1em'; svg.replaceWith(s); }
        for (const a of [c, ...c.querySelectorAll('a')]) if (a.tagName === 'A') a.setAttribute('href', '#');
        c.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); document.body.click(); fn(); }, true);
        return c;
      };
      // „Fickliste“ vor dem Scan (wie im JOYclub-Skript)
      item.before(mk('vaf-pm-fick', 'Fickliste', () => goHash('fickliste'), fickIcon(1, 18)));
      item.before(mk('vaf-pm-scan', `${W1}-Scan`, () => openScanPopup(), oldManSvg(1)));
      item.after(mk('vaf-pm-conf', `${W1}-Schutz`, () => goHash('opa-schutz'), oldManPenSvg()));
      // Schalter vor „Unsichtbar“
      const inv = leafWithText(pop, 'Unsichtbar');
      if (inv) {
        const r = rowOf(inv, pop);
        const c = r.cloneNode(true);
        c.id = 'vaf-pm-toggle';
        const lf = leafWithText(c, 'Unsichtbar'); if (lf) lf.textContent = `${W1}-Schutz aktiv`;
        const swb = c.querySelector('button[role=switch]') || c.querySelector('.ant-switch');
        const paint = () => {
          const on = isOn();
          if (swb) { swb.classList.toggle('ant-switch-checked', on); swb.setAttribute('aria-checked', on ? 'true' : 'false'); }
          c.title = on ? 'Automatik an: Seiten prüfen, Etappen blockieren' : 'Automatik aus';
        };
        paint();
        c.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setOn(!isOn()); paint(); }, true);
        r.before(c);
      }
    }
  }

  // =====================================================================================
  // Opa-Symbol in der Kopfleiste (→ Einstellungen) mit Zähler und gelbem Punkt für Gruppenanfragen
  // =====================================================================================
  function headerButton() {
    try {
      const inbox = document.querySelector('header a[href="/inbox"]');
      if (!inbox) return;
      const anchor = inbox.closest('.ant-badge') || inbox;
      let wrap = document.getElementById('vaf-header-btn');
      if (!wrap || !wrap.isConnected || wrap.nextElementSibling !== anchor || !wrap.querySelector('.vaf-hdr-dot')) {
        if (wrap) wrap.remove();
        wrap = document.createElement('span');
        wrap.id = 'vaf-header-btn';
        wrap.className = 'ant-badge ant-theme';
        wrap.style.position = 'relative';
        wrap.innerHTML = `<a href="/setting/profile#opa-schutz" class="ant-btn ant-theme ant-btn-circle ant-btn-text ant-btn-color-default ant-btn-variant-text ant-btn-icon-only" tabindex="0"><span class="ant-btn-icon">${oldManSvg()}</span></a>` +
          '<sup data-show="true" class="ant-scroll-number ant-badge-count"><bdi></bdi></sup><span class="vaf-hdr-dot" style="display:none"></span>';
        anchor.parentElement.insertBefore(wrap, anchor);
        wrap.querySelector('a').addEventListener('click', (e) => { e.preventDefault(); goHash('opa-schutz'); });
        wrap.querySelector('.vaf-hdr-dot').addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const p = G.get('pending', null);
          const g = p && p.groups && [...p.groups].sort((a, b) => b.n - a.n)[0];
          if (g) location.href = `/groups/${g.cms}/requests`;
        });
      }
      const n = G.get('blocked_count', null);
      const q = G.get('qcount', 0) || 0;
      const txt = n == null ? '' : n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1).replace('.', ',') + 'k' : String(n);
      const sup = wrap.querySelector('sup');
      sup.style.display = txt ? '' : 'none';
      if (sup.querySelector('bdi').textContent !== txt) { sup.querySelector('bdi').textContent = txt; sup.classList.toggle('ant-badge-multiple-words', txt.length > 1); }
      const bs = (G.get('blk_state', null) || {}).st; const et = Etappe.running || bs === 'blockiert' ? ' · blockiert gerade' : bs === 'pause' ? ' · Blockieren pausiert' : bs === 'pause-fehler' ? ' · Blockieren pausiert (Fehler)' : '';
      const tip = `${word()}-Schutz${isOn() ? '' : ' (Automatik aus)'}${dry() ? ' – Testlauf' : ''}: ${n == null ? '?' : fmtN(n)} geblockt, ${fmtN(q)} in der Warteschlange${et} – Einstellungen öffnen`;
      const a = wrap.querySelector('a');
      if (a.title !== tip) { a.title = tip; a.setAttribute('aria-label', tip); }
      a.style.opacity = isOn() ? '' : '.5';
      const p = G.get('pending', null);
      const dot = wrap.querySelector('.vaf-hdr-dot');
      if (p && p.n > 0) {
        dot.style.display = '';
        dot.textContent = String(p.n);
        dot.title = p.groups.map((g) => `${g.name}: ${g.n} offene Anfrage${g.n === 1 ? '' : 'n'}`).join('\n');
      } else dot.style.display = 'none';
    } catch (e) { warn('Kopfleiste', e); }
  }
  // Offene Gruppenanfragen: höchstens alle 5 Minuten abfragen
  async function refreshPending(force = false) {
    const p = G.get('pending', null);
    if (!force && p && now() - p.at < 5 * 60000) return;
    if (!(await Lock.take('pending'))) return;
    try {
      const managed = await myGroups('managed');
      G.set('pending', { n: managed.reduce((s, g) => s + g.pending, 0), groups: managed.filter((g) => g.pending).map((g) => ({ cms: g.cms, name: g.name, n: g.pending })), at: now() });
      const names = { ...G.get('groupnames', {}) }; managed.forEach((g) => { names[g.cms] = g.name; }); G.set('groupnames', names);
    } catch (e) { warn('Gruppenanfragen', e); }
    finally { Lock.release('pending'); }
  }

  // =====================================================================================
  // Gruppen-Beitrittsanfragen (/groups/<Nummer>/requests): prüfen, annehmen/ablehnen,
  // Aufgenommene sofort auf die Gruppen-Whitelist
  // =====================================================================================
  const groupMatch = () => { const m = (S().groupReq.match || '').trim(); if (!m) return false; try { return new RegExp(m, 'i').test(groupName()); } catch { return false; } };
  const reqCms = () => (/^\/groups\/(\d+)\/requests/.exec(location.pathname) || [])[1] || '';
  async function show(target, label, action = (x) => x.click()) {
    const el = typeof target === 'function' ? target() : target;
    if (!el) throw new Error(`„${label}“ nicht mehr auf der Seite`);
    action(el);
  }
  async function writeNote(item, text, overwrite = false) {
    const inp = item.querySelector('input.ant-input') || item.querySelector('input');
    if (!inp || (inp.value.trim() && !overwrite)) return false;
    inp.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, text);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
    for (const type of ['keydown', 'keypress', 'keyup']) inp.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    await sleep(200);
    inp.blur();
    await sleep(500);
    return true;
  }
  // Popup im alten Stil (Inhalte setzen md.innerHTML direkt)
  function openModal({ closable = true } = {}) {
    ensureStyle(); ensureGrpStyle();
    const ov = document.createElement('div');
    ov.className = 'vaf-ov';
    const md = document.createElement('div');
    md.className = 'vaf-md';
    ov.appendChild(md);
    document.body.appendChild(ov);
    const m = {
      ov, md, closable,
      close() { ov.remove(); document.removeEventListener('keydown', onKey, true); },
      buttons(list) {
        let box = md.querySelector('.vaf-btns');
        if (!box) { box = document.createElement('div'); box.className = 'vaf-btns'; md.appendChild(box); }
        box.innerHTML = '';
        for (const b of list) {
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'vaf-big' + (b.primary ? ' vaf-pri' : '') + (b.focus ? ' vaf-focus' : '');
          el.textContent = b.label;
          el.disabled = !!b.disabled;
          el.addEventListener('click', b.fn);
          if (b.focus) m.focusBtn = el;
          box.appendChild(el);
        }
      },
    };
    const onKey = (e) => {
      if (!ov.isConnected) return;
      if (e.key === 'Escape' && m.closable) { e.preventDefault(); m.close(); }
      if (e.key === 'Enter' && m.focusBtn && !m.focusBtn.disabled && document.activeElement && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); m.focusBtn.click(); }
    };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov && m.closable) m.close(); });
    return m;
  }
  function ensureGrpStyle() {
    if (document.getElementById('vaf-grp-style')) return;
    const st = document.createElement('style');
    st.id = 'vaf-grp-style';
    st.textContent = `
      .vaf-item{background:#2a2a2a;border-radius:14px;padding:14px;margin-bottom:12px}
      .vaf-top{display:flex;align-items:center;gap:12px}
      .vaf-av{width:52px;height:52px;border-radius:50%;object-fit:cover;flex:none;background:#3a3a3a}
      .vaf-who{flex:1;min-width:0}
      .vaf-who a{font-weight:600;color:#fff;text-decoration:none}
      .vaf-who a:hover{text-decoration:underline}
      .vaf-meta{color:#a6a6a6;font-size:13px}
      .vaf-sb{border:0;border-radius:8px;font-weight:600;font-size:13px;padding:5px 12px;cursor:pointer}
      .vaf-acc{background:#ffc21a;color:#141414}
      .vaf-rej{background:transparent;color:#e8e8e8;border:1px solid #4a4a4a;margin-left:6px}
      .vaf-reason{margin:10px 0 8px;padding:6px 10px;border-radius:8px;background:rgba(255,194,26,.12);color:#ffd35c;font-size:13px}
      .vaf-reason.vaf-fail{background:rgba(229,57,53,.15);color:#ff8a80}
      .vaf-det{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
      .vaf-ov .vaf-chip{background:#1f1f1f;border:1px solid #3a3a3a;border-radius:6px;padding:2px 8px;font-size:12.5px}
      .vaf-chip i{color:#a6a6a6;font-style:normal}
      .vaf-chip .vaf-na{color:#666}
      .vaf-th{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
      .vaf-th img{width:64px;height:64px;border-radius:8px;object-fit:cover;cursor:zoom-in;background:#3a3a3a}
      .vaf-th img:hover{outline:2px solid #ffc21a}
      .vaf-note{width:100%;background:#141414;border:1px solid #3a3a3a;border-radius:10px;padding:9px 12px;color:#e8e8e8;font-size:14px;box-sizing:border-box}`;
    document.head.appendChild(st);
  }
  const GROUP_REQ_RE = /^\/groups\/\d+\/requests\/?$/;
  const isGroupRequestsPage = () => GROUP_REQ_RE.test(location.pathname);
    const groupName = () => { const h = document.querySelector('main h1') || document.querySelector('h1'); return h ? h.textContent.trim() : ''; };

  // Einträge der Anfragenliste: jeder hat die Knöpfe "Akzeptieren" und "Ablehnen"
  function findRequestItems() {
    const out = [];
    for (const b of document.querySelectorAll('main button')) {
      if (norm(b.textContent) !== 'akzeptieren') continue;
      let root = b;
      for (let i = 0; i < 8 && root && root.tagName !== 'MAIN'; i++, root = root.parentElement) {
        if (root.querySelector('span.df-text-weight-semi-bold') && root.querySelector('input')) break;
      }
      if (!root || root.tagName === 'MAIN') continue;
      const nameEl = root.querySelector('span.df-text-weight-semi-bold');
      if (!nameEl) continue;
      const name = nameEl.textContent.trim();
      const descEl = root.querySelector('.ant-typography-secondary');
      const img = root.querySelector('img');
      const btns = [...root.querySelectorAll('button')];
      out.push({
        root, name, nameEl,
        desc: descEl ? descEl.textContent.trim() : '',
        avatar: img ? img.getAttribute('src') : '',
        online: (root.querySelector('.ant-badge-status-dot') || {}).className || '',
        accept: btns.find((x) => norm(x.textContent) === 'akzeptieren'),
        reject: btns.find((x) => norm(x.textContent) === 'ablehnen'),
        note: root.querySelector('input'),
      });
    }
    return out;
  }

  // Namen in der Anfragenliste zu Links machen (neuer Tab). Der ursprüngliche Text bleibt unangetastet
  // (React verwaltet ihn) und wird nur ausgeblendet; der Link daneben folgt ihm, wenn die Liste Einträge neu belegt.
  function linkifyRequestNames() {
    for (const it of findRequestItems()) {
      const span = it.nameEl;
      let a = span.nextElementSibling && span.nextElementSibling.classList.contains('vaf-name-link') ? span.nextElementSibling : null;
      if (!a) {
        a = document.createElement('a');
        a.className = span.className + ' vaf-name-link';
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.cssText = 'color:inherit;cursor:pointer';
        a.addEventListener('mouseenter', () => { a.style.textDecoration = 'underline'; });
        a.addEventListener('mouseleave', () => { a.style.textDecoration = 'none'; });
        span.after(a);
        span.style.display = 'none';
      }
      if (a.textContent !== it.name) { a.textContent = it.name; a.href = profileUrl(it.name); a.title = `Profil von ${it.name} in neuem Tab öffnen`; }
    }
  }

  // Alle Anfragen einsammeln (die Liste lädt beim Scrollen nach)
  async function collectRequests() {
    const all = new Map();
    const first = findRequestItems()[0];
    if (!first) return all;
    const sc = scroller(first.root);
    const startTop = sc.scrollTop;
    sc.scrollTop = 0;
    await sleep(400);
    let idle = 0;
    for (let i = 0; i < 500 && idle < 3; i++) {
      const before = all.size;
      for (const it of findRequestItems()) if (!all.has(it.name)) all.set(it.name, { name: it.name, desc: it.desc, avatar: it.avatar, online: it.online });
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5;
      idle = (all.size === before && atBottom) ? idle + 1 : 0;
      sc.scrollTop += Math.max(300, sc.clientHeight * 0.8);
      await sleep(atBottom ? 700 : 300);
    }
    sc.scrollTop = startTop;
    return all;
  }

  // Eintrag eines Namens finden – notfalls durch die Liste scrollen
  async function findRequestByName(name) {
    const hit = () => findRequestItems().find((x) => x.name === name);
    if (hit()) return hit();
    const first = findRequestItems()[0];
    if (!first) return null;
    const sc = scroller(first.root);
    sc.scrollTop = 0;
    await sleep(300);
    for (let i = 0; i < 200; i++) {
      if (hit()) return hit();
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5;
      if (atBottom) break;
      sc.scrollTop += Math.max(300, sc.clientHeight * 0.8);
      await sleep(250);
    }
    return hit() || null;
  }

  // Annehmen / Ablehnen auf der Originalseite; Erfolg = der Eintrag verschwindet
  async function decideRequest(name, accept) {
    const it = await findRequestByName(name);
    if (!it) return 'Fehlschlag: Anfrage nicht mehr in der Liste';
    if (dry()) return 'Test';
    await show(() => { const x = findRequestItems().find((y) => y.name === name); return x && (accept ? x.accept : x.reject); },
      `${accept ? 'Akzeptieren' : 'Ablehnen'} (${name})`);
    // ggf. Rückfrage "Bist du sicher?" bestätigen
    await sleep(700);
    const ok = [...document.querySelectorAll('button')].find((b) => isVisible(b) && norm(b.textContent) === 'ok' && b.closest('.ant-modal, [role=dialog]'));
    if (ok) { ok.click(); await sleep(500); }
    const gone = await waitFor(() => !findRequestItems().some((x) => x.name === name), 6000);
    if (gone && accept) await whitelistAccepted(name, it.avatar, it.desc);
    return gone ? 'ok' : 'Fehlschlag: Eintrag blieb nach dem Klick in der Liste';
  }
  // Aufgenommene sofort auf die Gruppen-Whitelist (auch unsichtbare Mitglieder)
  async function whitelistAccepted(name, avatar, desc) {
    const cms = reqCms();
    if (!cms || S().managedWhitelist[cms] === false) return;
    let uid = uidFromAvatar(avatar);
    if (!uid) { const m = await Members.byNick(name); uid = m && m.uid; }
    if (!uid) return;
    await seen({ uid, nick: name, g: genderFromText(desc), ages: agesFromText(desc), avatar }, 'Gruppenanfrage');
    await Members.update(uid, (x) => { x.auto = x.auto || {}; x.auto.grp = x.auto.grp || {}; x.auto.grp[cms] = now(); });
  }

  // ---------- Profil unsichtbar prüfen ----------
  // Lädt das Profil in einem unsichtbaren Fenster (gleiche Seite, daher lesbar), klickt in
  // "Persönliche Details" auf "Mehr anzeigen" und liest Felder und Fotos.
  let probeFrame = null;
  function frame() {
    if (probeFrame && probeFrame.isConnected) return probeFrame;
    probeFrame = document.createElement('iframe');
    probeFrame.setAttribute('aria-hidden', 'true');
    probeFrame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:1000px;border:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(probeFrame);
    return probeFrame;
  }
  function frameLoad(url) {
    return new Promise((resolve) => {
      const f = frame();
      const done = () => { f.removeEventListener('load', done); resolve(); };
      f.addEventListener('load', done);
      f.src = url;
      setTimeout(done, 30000);
    });
  }
  const bigPhotoUrl = (src) => String(src).replace(/_\d+(?:_sq)?(?=\.jpe?g(?:$|\?))/i, '');
  const thumbUrl = (src) => bigPhotoUrl(src).replace(/(\.jpe?g)(?=$|\?)/i, '_350_sq$1');
  const realPhoto = (src) => !!src && /img-[a-z]\.poppen\.de\//i.test(src) && !/plcblur/i.test(src);

  // ---------- Prüfung über Schnittstellen (user/info + v3/profile/gallery) ----------
  // Typ steht dort nur als Zahl (user_trait.ethnicity); die Texte kommen aus den Übersetzungen der Seite (i18n/pull).
  const LANG_DE = { de: 'Deutsch', en: 'Englisch', fr: 'Französisch', es: 'Spanisch', it: 'Italienisch', nl: 'Niederländisch', pl: 'Polnisch', tr: 'Türkisch', ru: 'Russisch', pt: 'Portugiesisch', ar: 'Arabisch', hu: 'Ungarisch', hr: 'Kroatisch', cs: 'Tschechisch', ro: 'Rumänisch', el: 'Griechisch' };
  async function ethnicityMap() {
    const c = G.get('eth_map', null);
    if (c && c.at > now() - 30 * DAY && Object.keys(c.map || {}).length) return c.map;
    const map = {};
    for (const module of ['profile', 'user', 'user-info', 'personal-detail', 'setting', 'search', 'common']) {
      let d = null;
      try { d = await apiPost('i18n/pull', { locale: 'de-DE', module }); } catch { continue; }
      if (!d || typeof d !== 'object') continue;
      for (const [k, v] of Object.entries(d)) {
        const m = /ethnic\w*[._-](\d+)$/i.exec(k);
        if (m && typeof v === 'string') map[m[1]] = v;
      }
      if (Object.keys(map).length) break;
    }
    if (Object.keys(map).length) G.set('eth_map', { at: now(), map });
    return Object.keys(map).length ? map : null;
  }
  async function apiProbe(name) {
    const eth = await ethnicityMap().catch(() => null);
    if (!eth) return null;                                   // keine Zuordnung → klassisch über das Profil
    let d;
    try { d = await apiGet('user/info/' + encodeURIComponent(String(name).toLowerCase()), { _version: 2 }); } catch (e) { return null; }
    if (!d || !d.userInfo) return null;
    ingestUserInfo(d).catch(() => {});
    const tr = d.user_trait || {}, ui = d.userInfo;
    const code = String((tr.ethnicity || [])[0] || '');
    const fields = {};
    fields['Typ'] = code && code !== '0' ? (eth[code] || '') : '';
    if (code && code !== '0' && !eth[code]) return null;     // unbekannte Zahl → lieber klassisch prüfen
    const langs = ((tr.spoken_language || [])[0] || []).filter(Boolean);
    if (langs.length) fields['Sprachen'] = langs.map((l) => LANG_DE[l] || l).join(', ');
    fields['Geschlecht'] = TYPE_NAMES[ui.gender] || ui.gender || '';
    if (Array.isArray(ui.age)) fields['Alter'] = ui.age.join('/');
    if ((tr.size || [])[0]) fields['Größe'] = tr.size[0] + 'cm';
    if ((tr.weight || [])[0]) fields['Gewicht'] = tr.weight[0] + 'kg';
    // öffentliche Fotos aus der Galerie (private = verschwommene Platzhalter zählen nicht)
    const photos = [];
    try {
      const g = await apiGet('v3/profile/gallery', { _version: 2, nickname: String(name).toLowerCase(), page: 1, limit: Math.max(6, S().groupReq.photos) });
      for (const it of (g && g.items) || []) {
        const md = it.media_data || {};
        const src = md.source_url || md.preview_url || '';
        if (it.media_type === 'image' && !it.is_private && realPhoto(src) && !photos.includes(src)) photos.push(src);
      }
    } catch (e) { warn('Galerie', e); }
    return { name, fields, photos: photos.slice(0, S().groupReq.photos), avatar: ui.avatar || '', error: '', viaApi: true };
  }

  async function probeProfile(name) {
    const res = { name, fields: {}, photos: [], avatar: '', error: '' };
    const wait = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const r = fn(); if (r) return r; await sleep(250); } return null; };
    for (let attempt = 1; attempt <= 2; attempt++) {
      await frameLoad(profileUrl(name));
      const doc = () => { try { return frame().contentDocument; } catch { return null; } };
      const kind = await wait(() => { const d = doc(); if (!d) return null; const k = pageKind(d); return k === 'loading' ? null : k; }, 20000);
      if (kind === 'werbung' && attempt === 1) continue;      // Werbe-Zwischenseite: Profil noch einmal laden
      if (kind === 'notfound') { res.error = 'Profil nicht gefunden („Diese Seite ist spurlos verschwunden“)'; return res; }
      if (kind === 'login' || kind === 'abgemeldet') { res.error = 'nicht eingeloggt'; res.loggedOut = true; return res; }
      if (kind === 'wartung') { res.error = 'poppen.de wird gewartet'; res.loggedOut = true; return res; }
      const d = doc();
      const sectionOf = (title) => {
        const h = [...d.querySelectorAll('main h2, aside h2, h2')].find((x) => x.textContent.trim().startsWith(title));
        if (!h) return null;
        let s = h;
        for (let i = 0; i < 6 && s; i++, s = s.parentElement) if (s.querySelector('label') || s.querySelector('img')) return s;
        return h.parentElement;
      };
      const details = await wait(() => sectionOf('Persönliche Details'), 15000);
      if (details) {
        const more = [...details.querySelectorAll('button')].find((b) => norm(b.textContent) === 'mehr anzeigen');
        if (more) {
          more.click();
          await wait(() => [...sectionOf('Persönliche Details').querySelectorAll('button')].some((b) => norm(b.textContent) === 'weniger anzeigen'), 8000);
          await sleep(600);
        }
        for (const lab of sectionOf('Persönliche Details').querySelectorAll('label')) {
          const v = lab.nextElementSibling;
          const key = lab.textContent.trim();
          if (!key || !v) continue;
          const vals = [...v.children].map((c) => c.textContent.trim()).filter(Boolean);
          res.fields[key] = (vals.length ? vals : [v.textContent.trim()]).join(', ');
        }
      }
      // Profilbild im Kopf des Profils (img mit dem Namen als alt-Text)
      const av = [...d.querySelectorAll('main img[alt]')].find((im) => norm(im.getAttribute('alt')) === norm(name) && !im.closest('header'));
      res.avatar = av ? av.getAttribute('src') || '' : '';
      // Fotos: die Vorschauen im Abschnitt "Fotos (N)", verschwommene Platzhalter auslassen
      const photos = [];
      const fotoSec = sectionOf('Fotos');
      if (fotoSec) for (const im of fotoSec.querySelectorAll('img')) {
        const src = im.getAttribute('src');
        if (realPhoto(src) && !photos.includes(bigPhotoUrl(src))) photos.push(bigPhotoUrl(src));
      }
      // Zu wenige? Dann die Galerie öffnen ("Alle anzeigen") und durchblättern
      if (photos.length < S().groupReq.photos && fotoSec) {
        const all = [...fotoSec.querySelectorAll('a, button')].find((x) => norm(x.textContent) === 'alle anzeigen');
        if (all) {
          all.click();
          await sleep(1500);
          for (let i = 0; i < 20 && photos.length < S().groupReq.photos; i++) {
            for (const im of d.querySelectorAll('.swiper img, .swiper-slide img')) {
              const src = im.getAttribute('src');
              if (realPhoto(src) && !photos.includes(bigPhotoUrl(src))) photos.push(bigPhotoUrl(src));
            }
            const next = d.querySelector('.swiper-button-next:not(.swiper-button-disabled)');
            if (!next) break;
            next.click();
            await sleep(600);
          }
        }
      }
      res.photos = photos.slice(0, S().groupReq.photos);
      if (!details) res.error = 'Profilangaben nicht gefunden';
      return res;
    }
    res.error = 'Werbe-Zwischenseite ließ sich nicht überspringen';
    return res;
  }

  // Entscheidung nach den Regeln
  function decide(fields, extra = {}) {
    const typ = (fields['Typ'] || '').trim();
    const is = (list) => list.some((x) => norm(x) === norm(typ));
    if (typ && is(S().groupReq.accept)) return { verdict: 'accept', reason: `Typ: ${typ}` };
    if (typ && is(S().groupReq.reject)) return { verdict: 'reject', reason: `Typ: ${typ}` };
    // Zusatzregel (nur wenn eingeschaltet): Typ leer + kein Profilbild + einzige Sprache Deutsch → ablehnen
    if (!typ && S().groupReq.noPicNoType) {
      const langs = String(fields['Sprachen'] || '').split(/\s*,\s*/).map(norm).filter(Boolean);
      const noPic = isPlaceholderAvatar(extra.listAvatar) && isPlaceholderAvatar(extra.avatar) && !(extra.photos || []).length;
      if (noPic && langs.length === 1 && langs[0] === 'deutsch') return { verdict: 'reject', reason: 'Typ leer, kein Profilbild, nur Deutsch' };
    }
    return { verdict: 'manual', reason: typ ? `Typ: ${typ} – keine Regel` : 'Typ fehlt im Profil' };
  }

  // ---------- Popup "Beitrittsanfragen prüfen" ----------
  let groupRun = null;
  async function openGroupCheck(...a) { return Prio.run('Gruppenanfragen', () => openGroupCheck_(...a)); }
  async function openGroupCheck_() {
    if (groupRun) { if (groupRun.modal && !groupRun.modal.ov.isConnected) document.body.appendChild(groupRun.modal.ov); return; }
    const m = openModal();
    m.md.innerHTML = `<h2>Beitrittsanfragen prüfen</h2><div class="vaf-sub">Lese die offenen Anfragen …</div>`;
    m.buttons([{ label: 'Jetzt prüfen …', primary: true, focus: true, disabled: true, fn: () => {} }, { label: 'Schließen', fn: () => m.close() }]);
    const reqs = [...(await collectRequests()).values()];
    if (!m.ov.isConnected) return;
    m.md.querySelector('.vaf-sub').innerHTML =
      `<b style="color:#fff">${reqs.length}</b> offene Anfrage${reqs.length === 1 ? '' : 'n'} in „${esc(groupName())}“.<br>` +
      `Jedes Profil wird unsichtbar geöffnet. Typ ${S().groupReq.accept.join(' / ')} → annehmen, ` +
      `Typ ${S().groupReq.reject.join(' / ')} → ablehnen, alles andere → manuell prüfen.` +
      (dry() ? '<br><span style="color:#ffb300">Testmodus: Es wird nichts angeklickt.</span>' : '');
    m.buttons([
      { label: 'Jetzt prüfen …', primary: true, focus: true, disabled: !reqs.length, fn: async () => { const vis = await Vis.guard('Die Prüfung der Beitrittsanfragen'); if (vis) runGroupCheck(m, reqs, vis); } },
      { label: 'Schließen', fn: () => m.close() },
    ]);
  }

  async function runGroupCheck(m, reqs, vis) {
    const run = groupRun = { modal: m, stop: false, results: [] };
    m.closable = false;
    const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    const cnt = { accept: 0, reject: 0, manual: 0, fail: 0 };
    m.md.innerHTML = `<h2>Beitrittsanfragen prüfen</h2>
      <div class="vaf-warn">Bitte diese Seite nicht verlassen, solange die Prüfung läuft.</div>
      <div class="vaf-bar"><div></div></div><div class="vaf-cur"></div>
      <div class="vaf-stats"></div>`;
    const bar = m.md.querySelector('.vaf-bar>div'), cur = m.md.querySelector('.vaf-cur'), stats = m.md.querySelector('.vaf-stats');
    const showStats = () => {
      stats.innerHTML = `<span>Automatisch angenommen</span><b>${cnt.accept}</b><span>Automatisch abgelehnt</span><b>${cnt.reject}</b>` +
        `<span>Manuelle Prüfung nötig</span><b>${cnt.manual}</b><span>Fehlschlag</span><b>${cnt.fail}</b>`;
    };
    showStats();
    m.buttons([{ label: 'Abbrechen', focus: true, fn: () => { run.stop = true; cur.textContent = 'Breche nach dieser Anfrage ab …'; } }]);

    let i = 0;
    for (const r of reqs) {
      if (run.stop) break;
      i++;
      bar.style.width = `${Math.round((i - 1) / reqs.length * 100)}%`;
      cur.textContent = `${i}/${reqs.length}: ${r.name} – Profil wird geprüft …`;
      const res = { ...r, fields: {}, photos: [], verdict: 'fail', reason: '' };
      try {
        const pr = (await apiProbe(r.name).catch(() => null)) || await probeProfile(r.name);
        res.fields = pr.fields; res.photos = pr.photos;
        applyFacts({ nick: r.name, avatar: r.avatar }, pr.fields).catch(() => {});
        if (pr.loggedOut) { res.reason = pr.error; run.results.push(res); cnt.fail++; showStats(); run.stop = true; cur.textContent = `Abgebrochen: ${pr.error}`; break; }
        if (pr.error && !Object.keys(pr.fields).length) { res.reason = pr.error; }
        else {
          const d = decide(pr.fields, { listAvatar: r.avatar, avatar: pr.avatar, photos: pr.photos });
          res.verdict = d.verdict; res.reason = d.reason;
          if (d.verdict === 'accept' || d.verdict === 'reject') {
            cur.textContent = `${i}/${reqs.length}: ${r.name} – ${d.verdict === 'accept' ? 'annehmen' : 'ablehnen'} …`;
            const out = await decideRequest(r.name, d.verdict === 'accept');
            if (out !== 'ok' && out !== 'Test') { res.verdict = 'fail'; res.reason = out.replace(/^Fehlschlag: /, ''); }
          }
        }
      } catch (e) { res.verdict = 'fail'; res.reason = e.message || String(e); }
      cnt[res.verdict]++;
      run.results.push(res);
      showStats();
      console.log('[Beitrittsanfragen]', res.name, res.verdict, res.reason, res.fields);
      if (i < reqs.length && !run.stop) await sleep(rand(1500, 3000));
    }
    bar.style.width = '100%';
    if (probeFrame) { probeFrame.remove(); probeFrame = null; }
    window.removeEventListener('beforeunload', guard);
    Vis.restore(vis);
    groupRun = null;
    m.closable = true;
    m.md.querySelector('.vaf-warn').remove();
    cur.textContent = run.stop ? 'Abgebrochen.' : (dry() ? 'Fertig (Testmodus – nichts angeklickt).' : 'Fertig.');
    const open = run.results.filter((x) => x.verdict === 'manual' || x.verdict === 'fail');
    m.buttons([
      ...(open.length ? [{ label: 'Manuell prüfen', primary: true, focus: true, fn: () => { m.close(); openManualReview(open); } }] : []),
      { label: 'Schließen', focus: !open.length, fn: () => m.close() },
    ]);
  }


  // ---------- Popup "Manuell prüfen" ----------
  function openManualReview(list) {
    const m = openModal();
    const prev = document.createElement('img');
    prev.className = 'vaf-prev';
    m.ov.appendChild(prev);
    m.md.innerHTML = `<h2>Beitrittsanfragen prüfen – manuell</h2><div class="vaf-sub"></div><div class="vaf-list"></div>`;
    const sub = m.md.querySelector('.vaf-sub'), box = m.md.querySelector('.vaf-list');
    const refresh = () => {
      const n = box.children.length;
      sub.textContent = n ? `${n} Anfrage${n === 1 ? '' : 'n'} konnte${n === 1 ? '' : 'n'} nicht automatisch entschieden werden.` : 'Alles erledigt.';
      if (!n) setTimeout(() => m.close(), 800);
    };
    for (const r of list) {
      const el = document.createElement('div');
      el.className = 'vaf-item';
      const dot = /success/.test(r.online) ? '#52c41a' : /error/.test(r.online) ? '#e53935' : '';
      const chips = S().groupReq.fields.map((f) => {
        const v = r.fields[f];
        return `<span class="vaf-chip"><i>${esc(f)}:</i> ${v ? esc(v) : '<span class="vaf-na">–</span>'}</span>`;
      }).join('');
      el.innerHTML = `
        <div class="vaf-top">
          <img class="vaf-av" alt="" src="${esc(r.avatar || '')}">
          <div class="vaf-who"><a href="${esc(profileUrl(r.name))}" target="_blank" rel="noopener">${esc(r.name)}</a>${dot ? `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dot};margin-left:4px;vertical-align:middle"></span>` : ''}
            <div class="vaf-meta">${esc(r.desc)}</div></div>
          <div><button type="button" class="vaf-sb vaf-acc">Akzeptieren</button><button type="button" class="vaf-sb vaf-rej">Ablehnen</button></div>
        </div>
        <div class="vaf-reason${r.verdict === 'fail' ? ' vaf-fail' : ''}">${r.verdict === 'fail' ? 'Fehlschlag' : 'Manuelle Prüfung'}: ${esc(r.reason || '')}</div>
        ${Object.keys(r.fields).length ? `<div class="vaf-det">${chips}</div>` : ''}
        ${r.photos.length ? `<div class="vaf-th">${r.photos.map((p) => `<img alt="" src="${esc(thumbUrl(p))}" data-big="${esc(p)}">`).join('')}</div>` : ''}
        <input class="vaf-note" type="text" placeholder="Notiz für dich hinzufügen (optional)">`;
      // Profilbild-Klick öffnet ebenfalls das Profil
      el.querySelector('.vaf-av').addEventListener('click', () => window.open(profileUrl(r.name), '_blank', 'noopener'));
      el.querySelector('.vaf-av').style.cursor = 'pointer';
      // Großansicht beim Darüberfahren
      for (const im of el.querySelectorAll('.vaf-th img')) {
        im.addEventListener('mouseenter', () => { prev.src = im.dataset.big; prev.style.display = 'block'; });
        im.addEventListener('mouseleave', () => { prev.style.display = 'none'; });
        im.addEventListener('error', () => { im.src = im.dataset.big; });
      }
      // Notiz in das Notizfeld der Originalseite übernehmen
      const note = el.querySelector('.vaf-note');
      note.addEventListener('change', async () => {
        const it = await findRequestByName(r.name);
        if (it && it.note) await writeNote(it.root, note.value, true);
      });
      const act = async (accept) => {
        for (const b of el.querySelectorAll('button')) b.disabled = true;
        const out = await decideRequest(r.name, accept);
        if (out === 'ok' || out === 'Test') { el.remove(); refresh(); }
        else {
          el.querySelector('.vaf-reason').className = 'vaf-reason vaf-fail';
          el.querySelector('.vaf-reason').textContent = out;
          for (const b of el.querySelectorAll('button')) b.disabled = false;
        }
      };
      el.querySelector('.vaf-acc').addEventListener('click', () => act(true));
      el.querySelector('.vaf-rej').addEventListener('click', () => act(false));
      box.appendChild(el);
    }
    refresh();
    m.buttons([{ label: 'Schließen', focus: true, fn: () => m.close() }]);
  }

  // ---------- Knopf im Kasten "Mehrere Anfragen verwalten" ----------
  function ensureGroupButton() {
    if (!isGroupRequestsPage() || !groupMatch()) return;
    if (document.getElementById('vaf-group-btn')) return;
    const h = [...document.querySelectorAll('main h3, main h2')].find((x) => /Mehrere Anfragen verwalten/i.test(x.textContent));
    if (!h) return;
    // Kasten = nächster Vorfahr, der auch das Formular enthält
    let boxEl = h.parentElement;
    for (let i = 0; i < 5 && boxEl && !boxEl.querySelector('form'); i++) boxEl = boxEl.parentElement;
    if (!boxEl) return;
    const wrap = document.createElement('div');
    wrap.id = 'vaf-group-btn';
    wrap.className = 'ant-form-item-control-input';
    wrap.style.marginBottom = '12px';
    wrap.innerHTML = '<div class="ant-form-item-control-input-content"><button type="button" class="ant-btn ant-theme ant-btn-primary ant-btn-color-primary ant-btn-variant-solid" style="width:100%"><span>Automatische Annahme/Ablehnung</span></button></div>';
    wrap.querySelector('button').addEventListener('click', () => openGroupCheck().catch((e) => console.error('[Beitrittsanfragen]', e)));
    boxEl.insertBefore(wrap, boxEl.firstChild);
  }

  function initGroupRequests() {
    const tick = () => { if (isGroupRequestsPage()) { try { linkifyRequestNames(); ensureGroupButton(); } catch (e) { console.log('[Beitrittsanfragen]', e); } } };
    tick();
    if (!window.__vafGroupTimer) window.__vafGroupTimer = setInterval(tick, 1000);
  }

  // =====================================================================================
  // Favicons der Plattformen (einmalig über den Google-Favicon-Dienst bezogen, fest eingebaut).
  // Die Symbole gehören den jeweiligen Markeninhabern. Eronity: kein Favicon verfügbar → Kürzel.
  // =====================================================================================
  const PF_FAVICONS = {
    joyclub: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABEUlEQVQ4jZWOv2rCYBRHzw0h6FARCkK/IVRcxc3FZ/AdnMzg4OLb6OQ7+AxZBAdxFSuCBaEgdkj9EnM7hJZatPS78OPA/ccRjSIljnGuTgcZj8UnjqHfd38wmQDgYS2cz0WGw2v+1bcWAMnrdZVez1lAp1O8zUZIw1BVVXU0cmIahgogiTFa6nadDT5mM8r7vZAYU3yOIicmxhQG77WaBkHgbGCt5eFwEO9yuXw3g93uXwT4upO3alUrlYqzwel04vF4FC/LMnzfv852e5s/kmVZYbAvl/Wp0XA2eF2vMUkifp7nUCrd3prPod2+OcrzHAA/TdO7SwwGd2fpYgGAaKulL6uVmz/w3Gwiy6U4H/6uTxDi2OxBMhgHAAAAAElFTkSuQmCC',
    poppen: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEd0lEQVRYhb2Xa2xUZRCGnzlnW7rUphcK2ysqCCgRCXc1GIRYQmJMJbElRqJBSimXxPBHiQEpGKMkAmJSoKVIQmIIbQyGajCAFrkEFGiMCLUEbcRettCyvQC9bPeMP4Cy2+3ZHgg4/843M+/7zjnfzPk+4UGssNDweD3JURoTD9Abra3eLxc1I6L3CyVOAzOW7h7jJ7BAIEvRSUBcv5A2kCpED9HLvqbSJbUPRUDqsp1T1GKDCvNQDId6AyAVqPlRU8mi8w8kIGPVZre/M+4zlBWA6ZC4P3qvoJuTUhLWXizM7XEsIDm/ONUlxgGFqQ9EHEYiJwwNzG8oWdo8qIDk/OJUU+RnkDEPgzzIzptqzekvIuSbZqwqc7swKh4BOcAES8z943PKom0F+G+1bVRhyiMgB0DRmS1J7YXBa32fIGVJyTQ15HR/UY/A/GLpJO/O/AuEkLmMDf8DOUAUhhTefRCAtGW7xgUsq5oIbTnaE8/cCSOJHeLiXO01jlbXoUFzLy0xljdmPIU72kVV7VV+/KMOS20HY8A0zScbtr37rwvAUuvNSOQr5j7Hh69PxTTuvaDKi3UsLj7Cre5enhgex8HV2STGxvT5T11q5O3th+noHLD9TcsK5AKbDACFLDvyWc+ks2b+9BBygNnjM/g453kAMofFhZADvDA2tc9vY1kABjllJspEu6iFM59GbN7NghfHMiLezYmaBuqu3wjzz58+mqHRrgFzVW93m5Hp6fAAsXYCRiY/ZluCyzCYkJmMKtRebQ/zD3GZpCQMtUsfNiq/ON7w+yXBlgG4fqPb1qcKDb7blacnhtegqvhu2uZLV0xM/KBtd7ymwda38cBZqut9zJv4OKM88WH+C3XXIwkAwIiK0tZIAftOXbLbybR39vD+a5PZkTd7QH/pTxciQetQNVuFnDLTk9TWRoR98NbMcWxa+FIksDA7/mc9C7b+YD8LRK417cgbYVCeG0D4LRLY1ydq2FUZsZoQu+xtpaC0MtIgQtAquDN6xeLwYKBry06z51i1I/LcrQdpudEVMU7UONQnwIzSvUDEA6Wlygd7T7L5+yrsCjv791WyN31Hg+9mZJVCr5hd5XDnqNVxpqIlblr2DGDQc8DJS41caW5nzrOZuMx7TbT/zF/klRyhvdM/GAQifNO4vWAXBP39RHQtEBg0Gyj/5TLZn1dwpbkDf8CisPw0y7+qpLPHUbpfDNb18QZ7PAWlX6D6nhMUgDh3NGkJsdQ0+pymgPBJ044la+4+hgwid4q5WoQzTrE6Onvui1yQYxmWtT50rZ8NX747xbR6j6oyzjGyI3b53WV2zakvWtkSvBw2iq9tW+QNGD0vI/z68LjlmMuMCiMfUMBtESu87i7XLES24HBj2pgf9NN0K/BKfdE7YeTg4GqWVlA6KaCsB33VTvAAFhCRbzGtdd6i/Igj1PHldER+8WgRMxfIAmsySNDvT1REWxXOiXBIDClrLMr7xwmuYwEhpirpK/ck+Q1NoLub6FjTV7dlsQ/u/3r+HzWCm+ylyNaoAAAAAElFTkSuQmCC',
    xhamster: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAflBMVEVHcEz////////////////////////9/f3///////////////////////////////8BAQEwMDAaGhoSEhIjIyPs7OwtLS1KSkq/v7/19fWMjIzh4eGCgoIpKSnIyMikpKRzc3PX19esrKxdXV03NzeZmZnQ0NC3t7cA2DtHcEwRgJGfAAAAKnRSTlMAzyizYnve/DoRgKfBib7//////////////////////////////////wBsgjnhAAACEElEQVQ4jY1TiY6jMAylZzqdw84FJOQAEpj//8O1aTutVrPSWlVN7Bcfz07T/JfsD+f3t1fD2+F8uDyPR/j2CV4MF0j+G44/cAhocIG35nI8XY8XMixkCPAIehrQmBaTADGs00AqYWsMDqc74DCjdTXWueAmZZZROovz4Q74yAiQVKs6369r7zv6TACYP+6A928cwGppZthkNlJbGLB/fzRB0SAbKfXE/klLaTJQ3uNPF3XMFEAZZQEsKQqRx/rTRQOdIVNIXncAnfYpENx08GBFDEpK1dtZBEwJg5htz5ZJXG6sZZSy7RwqGVTOKlSFrmulxLyxS6xpRYCV/qLqexVbqVYCKE3sbjQWmJSMhe60LUDLukTKAIXJ3Hl0MFBnUVJQ6nOihJJAegCHfteIQpVzTSQmMA/BbAfVU0dFNFDKHdDG6BngI1VxA5Cv2S2UwnEfxvpbimAN98DmZcdFLgCj4Ruiw45+giPGEag/njiMaHlUmsP33vesNY/L4shkXh0TnHWFOTkxTMKlGarOTLq7MpXnREiKAz0qXatW2MPNks73YWY+Bwd1gWmCpYIL7M+Pce6pmsKZLfJGUUkkhWrfP7d8xsrLYmkrC/unSjv08g72YopIOe5iA8bpeX+TnfCIYyKMSyOiF7u/X9+R7unb2mtvn6/qRa4C1ux9XkGcfnFvxX5+nc9fn5d/uH+XP5IMOpRrzmiWAAAAAElFTkSuQmCC',
    spicymatch: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAPFBMVEWNKJpxGnxgEGt4HYRpFXT///+FJJNMBldWCWGLJ5h/IYxpAXawlLZ5CoeHT5DGssrv6vDWyNl0PH2Zcp8S7yOlAAAAAXRSTlPk54H+BwAAAUlJREFUOI2FkoGSgyAMRFHA5AgB1P//10sCotPp1GUE2X3GNuLc30+5l1yIV2B70QBS+QwuZwCl8bYxs0XMaeOzcQeSinPMxLlm9olLroVTi2zRBGJrUVSo6rLLnh5A8urGJn62WVSvCt5U1GPS7LAiO5mfXM89kxb1SRM+Z+79BXgyUx5Oy3LImyawDEkkZvCV5D5Gf/kTWBYBcglElSgq9glQPinvRCUi7TMXIFwifU2BFjHc5uJ0CsPpTRIg3K6bbFgD5Qcw5MS3gUdBROlAW9dwj+DWLtAeVsQjg3DrrQFgiXuWr6XxGTN+AzKAthhx2WPBB4A25N8dpUDVInI4EIe/OhzS/u8AxU5FuFxUYLU7OCTS9ay5R/2aFUB7UOU3AgA+JIDtQQI5jGA7m6GvDiyzC2zFx2RAtycx4PmAewRf5V5yeKuA/ymzHEVOrf18AAAAAElFTkSuQmCC',
    kaufmich: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACwElEQVRYhbWXQW7bMBBFH4PunW6yIuDkBM2ieycHKOoCXRaIeYKqJ3BygiQnkLztJgp6gMonqHOC2oAOYO+6YxccWQxFKXJif8CwSY40n8PPmbGy1nJolMocA9fAd5ky2qYZwLuI8SlwCqy1TRd7cl4AH7zpBGgSEOcLYCDjFTDRNi08m3PgGDiXqQWAbxMgC5zjj8MIjCvngiHwu1TmRhx+bnFCqQzAHMiBTNt0XSozaXlmXv04ChaOW94/7XLuYQTcAstSmWtc6J8idss2AvvCAEe6AO6ATbCeHZpAhaEQWHpzc18vIYGC/WNALboNMPEXVZgHSmUOmRi+aJvm/sT2FpTKjHEifKSf4F6DBHdLtvCPYELzvPaNUanMRRuBc9x5jQ9IAAIN+ASGwfchMMPVhCiBQ8PId+ZPNopRT2xwV3aBK1wXdEdujtPWFXDjLxwFRn0x1jattFIIAUMz41XI5HMPZKUySYzAegcCuXdtE1zxyYRIjMRa2/SUOmq3MQLFDgQGwAPwDyeqMYD0D9cR+7FcvweeV9s6E0ov8HcHEhU2uF0V1AKLvecT8KsaaJsq8CKgbbokXjpfwgBXhqe4o1i22H2k1tnWT3gN715BwMdSOqYYEuBnZRclIEJavYFAgRNiDAPgRN5fRAkIkshcHzzJBrqenwLf6GpIpFzOXkFgIm3YS6n8q7bp9sq3peKE3QRpcHlkKuMVrqyHmFF30+0EhOFFTxIzCb1fRYdC6BKXen8AZ7jQj3yhthajniRW1GcedtRXuKSUa5ve4cpwHtp2VkOPxH2LSeadZ+xf1Aj4I1lwimTBrqY0SkLbNMGFM7yihWeXE1Q6wUwcVsJ+tpne/YC2aSEF5RInsA3N9i0H3mubKkm1Z7jkVEXpTDazRaMrfgtKZXK6G9pGV7zXjkh6hBuaR/UIXIbOAf4DpT32sZ3VgREAAAAASUVORK5CYII=',
    fetish: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFuElEQVRYhcWXbYxcZRXHf+feO/fu3Zkt2y6lS7vFpiWbIltTWlllqVjaoKnFjKwyUaMomvAFTQ3V2MQ1Qi2mJtKokPjFCPEDLRNZmJT9UNuuWFsbAvR1I1C32haXUsrotjM79965L48fZnY6b+wsDYTz6d7nOef8/+c8L+c8wiwlTfoa27Q3RhKtE5GVKlJLEDoBUEyKJmeUUsc0pY06RWckRerSbPxKK4Vha7jXUMYWJeqrgD1Lvo4o2RVIsH3QGzx1VQTSpG3LsrYB3wdiswSuFx943PO8oRQpZ9YEMlbmRkGeU6i+qwSuA5Exhbon6SXHWxLIxDK3iCZ7FGr+BwFeReKiitTnk37y6HsSKEf+9w8avIYEaqA6E9r0R5q0XU77hwIOoFDzBXkuTbqymY3pD8uytjVbc+nw0fuzaNe5qEmT4OUu1LtWU4DYhreIDZ5DdAjHE/i7ewhPdtaT6LMsaxsem6G8BMPWcK+OPkbVbpfOIvbWE5j3/RtpC694CIXi8z0UNq9CvV0KRFuaw37kJOZXztUuqoLi8GIK37sV9T+zmocfEvYNeoOnDIDyOa+Aaz0FEntG0Zflm+WxJPkY6Ar7l0exHhhHzKhRV8D88ptovTny69ejLlcgYoYytgDfkTTpayzLOs/0JaMrOg7sxVj930bsvEFuw52EL3dBW0jbQ69h/3Ss6WFWWZNipgf/L92o821oiwsUdy6pVnE8z7vesE17Y0RU2RTmvWcbwSMhODif/NduR2UtjDveof23r6Avv9wIPGky9eAnCfZ3oyZN0BVtQyext/yD8FQH4atd06q2bdobjUiiddUOzHvPNTgtpm9g6tu3lay2HqftR681RF3cvQj34RWoyzGiN+MAaEvyxP94GKM/C0Bs/YVqAkQSrTNEZKVSqjKoVUcVCO6vl+NsXYHWe5n2XxwndvdEbcSehveHZTibV0FUZmWFxNZdIP77l5Au74rvRYUaWxFZaZSrWtVohR75L30Wf183Mt8l8cxB9JtqU+4+thz30T5UoXKaMe8/TfzxV8BQ1IuaMmr/I7XEqJTUadzX56AvzeM+0Yu/rxujP0si81dkbrHG2HtqKc7QytKpEEXbpjewfvA62gL3PUtceGRe7YDQadQrFZ9dTHShDednnyiBv/AiMsevzAeHrsXZ1kdwYAGoUlrjTx/C+FS2MeKcgT+yiOLOjxH+s4PobKJBRzJm5l2ErvoJvW+Sjr2jNZGH/0qQ/8JaojMlR8ZtF4nvPITW7dbYRhM2zsMrCPZdT3R+hhZCkTXKnUwtASMi/szBK+AKnJ+vwN2xHFwd43PniX3mHaxNb9ReQIHg/q4Xd2sfKte6hRBNzhhKqWPA6pqZQGPqmwMknv0bMsdn6lufxn+hB+ks0v7kYcx7/lMfCcGReRQevJXw2NyWwBUzpY4ZmtJGI4m+Wz8ZHplHbs1dSE+B8KVrwYzoOLAXvTdXoxdN2OQH7yAc64SwtPu0hQViX5yg+KcbUNnmhQtAU9qo4RSdEcuyHJr0e9FEO0y0Q3tA4ulDteBRqSi52z9OeGIussDF/skYEg8w1lwkn1ozIzjgOEVnREuRuiRKds2Yq4JBcPA6KC939JZNbsNapr5+O9qNOTr276fzdAbrgXH0my+Ru3M94fGZl0KU7EqRumQABBJs19G/wQzNp/urm4jOxrEfOUHxz91oiwskdr9I7K63Kzr+yEKm7htouHCaiB9IsB2qroyMlXkMeKiVpXn/adp/82pD+XWf6MX58S2VfdBCdiS95Gaoask8zxsSZKyVZfHJZeQ3riXKlhuMQChsWo3zw1WzAhdkzPO8oSv/VfJ+mlJtaZ74U4dxH70Zf8/ClsBl8Iam9CNvy7V6xaSfPKpQA7NZjvcBPqZQA/XgTQkAJL3kuOu5/cAOSs+rqxUf2OF6bn+zV1GJXAv5yB6n9fJhPc//D03FgIqlrjuNAAAAAElFTkSuQmCC',
    gays: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACWUlEQVRYhdWXS2tTQRSAv7lJNY9atUlq2hqFLgQfVaIUKjXW+kBB7cLHSnClRTeuXfkT1JWP6MpVVhpQUUqDSMGNohVBEWNDHq2hbTRNE03TJteF9TYlEe692lxzVmdm7jnnmzkzc+YKk//akZKMH1n2UEsRIi4JBiRDggPIsqck45cMCV4GIRkWfEHMeoxMQuBrbWd7s4uiXGIkNcmL5DhyLQD2uNu56dvP1mbnkv6XE0kuDod4PTWhyZ+mFGxZ62Dw6ImK4ABdLW6Gjp3E07hq+QDu9R3GYl5ctFcTSUbKZrxmpYW7vYc0AahOgctiZadrndI+NfiQ+5EwAOc3d3J770EA+to8rJBMFEpFVX5Vr4DX2aLo8eyMEhzgzod35ObmADBLEp2OyhT9NUCrza7oU/kfFeNfZ/OK7rbaVAPoOobVpCcYwCz9mk/ye672AIlcVpddfd6Ev8VhsbChsami/3MmTaZQWH6A0x2buOE7UNF//EmQx7GIKh/1nYJP02kC4Y8A9G/swNbQUFuA0FiM0FgMgOiZc7oADE9BfQIIIwBi2RlFd5fVBQBJCFwWa9Vv/xnAm7K677bZubTNq7Sv7OpW3gmzxXnef0upBlB9CtKFWZ6PJ+htWw/A9Z59XPZ2YRYSTuvi7B9FIxRl9a9DTXvg7LOnpMvLrs2+JPiXXJYLw0NaXGoDiGdn6H4QYCgRrRgLRsLsDgZI5fNVLP8sQty6quc1TUfTanY4XMyXSrxNTWraeOWi+yYczUwzmpnWa67If3ARCRE3LLoQcUkSDBgCsfB7/hOW1bjQgjQfQgAAAABJRU5ErkJggg==',
    telegram: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEj0lEQVRYhbWXT0xUVxTGf/e9N8MMU8A//HdsQUHEqpuqwaaaYGtq0xqTJmrcWOyicdGoiUlXjV26auLCtK6UuhFt0qQ7TaukxkRFNy0qAQcadITCiBRmGIbhvXe6eDMD6ryZociX3M28eef7zn3n3Hs+RQHY8PMLA2gEPgRagU1ADVCc+kscGAa6gU7gOvD40f4VZr7YKjfxmA5sAY4AHwNBwMgT0wTCwDXgAnD/0f6V1oIFNF95XqvgBKg2oCIPqRsiIO0CZ3oOlA8VLKD5yvOtwPfAB7lEFggBbgEnew6U38sroPlypBXFOWDdIolfRR/C0Z6DFZ2uApovj24DdRFoesPkafSCHO45WNn1moDmy6O1wCVg5xKRp3ETONRzsHIIQANY3zGiichxEdkpIizx2ikix9d3jGgZAcA2oO1NpCeAJYJpO4QuaEtxotZfGtZBnQWOLobYBkQg4FE0lhkEAzr3Ikki07ZbG50D+doAmkD2/B9SAWwBTUEwoLOjpojdQR+bVhiUeDVOdU3SEYpjaFlf3wM0GQK7cE64wolFsAWKDcWGFR72rPbRuspHMKCjqTlxs7YAgmTfgyCwy0CklfzHK6SyBVjp09heXcRn7/jYUuGl1Kthy8s9nbSE0WkrrThbOANoNUA25sw2RawrqC81+Cjo45O3/TQtM/Ck0h2MmvwWTrC3zk+VXwdgykwLcC1EgI0GQk12YsES8BuKd5d7+bTOz65VPmoDeibTpCVcezpNRyjO5/XFVPj0zPvjMzbjCQuFgLie5jWGIIFsT0o8zjbvrfPTUlVEqfflSnoSMzn3IMrtkRmOby5lX10xah7PSNwiOut0gLjvQsB49fsITtbfbiljb10x+ivik7bw+9NpznZHmUzanNq6jN2r/a+VWThmMmPabsQZGMAUUJL+QQGzlkPiUbC53EuVX8ejKZ7ETM73RPllYIpyn87p7cvZUePLGngwamKKYKicl+mUATI8XwCAacPVwTjXw3Gq/DpryzyUeDQevkgyMGmy+i2d0y3LaanOTm4JDEZnnerPfZkPGyLygCxXr6bAsuFZzORpzMzsDsCmlV7eqyxyjRqbtQnHTOf7ux/HAA80nBnOdXZTymlBXTmiNIRbQ9Oc/WuCsUT2SWssYRGJm04HuMMEOjVEbiASRoRClkpl+GP3BMduRrg7ksgcUGk8i5lMJFMF6B4rjMgNDUUvyFWn/gtbCkEQ7vyT4NgfEX7o/pfxmbmKD03MkjDtfHGuouhVAA0X/25B+BWozLVn2SAISiner/bx1cYyqosNvrs7xu3haTT3DhhFsS90uP6OAaCgS5B24JuFClAA4tTFn89nCBiKSMJKXUquNdCuUF2Z9wEafhqoBVnUSCbiUGq5W+8mqEOhL9YMvSQAoKG9fxuwxEMph0Nta18fStNY2x5qhSUay+Fof1uD+1g+T8RWRN6sMVHqZH9bQ35jkhFx4XEtcAJngFyENaMdONN/pLFwazYnom/OnMoCzalKm1N1v/9I48LN6XysOd83z55LHnuuOoHrCh73f7kurz3/D7m0PchUhAS/AAAAAElFTkSuQmCC',
    whatsapp: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAMAAADX9CSSAAAAYFBMVEX///8l02b8//0713U21nKE5qm+8tJV3Yj4/vri+eov1W1D2Xvw/PXo++9q4ZZ35KDY9+TS9uCu78Z/5aWz8MpL2oFj35Hr+/HE89WN6K/L9dun7cKS6bOZ6rdz45248c6vq6y0AAABAElEQVQokWVSWZbEIAik1Lhmt7N1pyf3v+WgWecNHwkWUAUi0W7tYqSXZmnpaW+D08buQm0EZKGddbqQQCEOeIDvD5/Ex8Pshxrqydp5xPR/AUxp75AG3lwYsHKSkuIKRJgUlZYEy/UXXnq0HFy4e24w3BINvjQkMsf4z41vGEnBsRcQbn4uDwSU7K3I4cMmePI7YBCqR75k/jm5TkF2og4fmycwez8ph1sdWF5NlDENtStOdb5PPpWKe+R5vwftzBGliQoMlL7xnrTj2hlZcoD+syPt0aQUeOu211XRAMbmmb1iObNVJJyO6txXTFfWjP/2OzZ9GrT61oHfw3qu5xftDQn2WS5NigAAAABJRU5ErkJggg==',
    threema: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADAklEQVRYhZ1X7ZHjIAx98m0flxRyY7yVpJI1bCPpJMJbyW0j1v0Ag/hysseMEyMEekjiCQMARMSKCMuLbX+tcz5PxIIA7MH4j9q5mSczy8mWREQQmwAgAUBa0LzCswcAuE8HYwwAYJ7n9D5qeo1jKdSo9t72oswYIwCEwlr5oSyz1lZu2qv/suEFpwkzlwbPnggmARngOLoox/diwi4i1trhbsNDQzDWlSAap2QAGl4eDcbHBmpgPVn2xN4NQpGEdcJMRL0hAARjdNIRnF0heTgsEF+YeZyg3aCLiLO2vytAXNzVg1mYWWRvQ6XDZIxpwxB7DYAjF3qGj0VzeEKfmas5VACgpNOimFrnAuy3vrfUu/c+HWrnXAyLSZptXCVLVWQbAADwtSkARA17yEEp3ewpbVD82bavJC2m9fzSHD11EoYtTkcndACJWUxPPYRANGYBvN+qXQcNsxjdVTsRSMz8RWU76T1X3jqWn6CVIAAhxFIaz+dFqFwEoORqqdSPvjGmG7EpK+fl5vlPkGkENZqT+GtdTSU9VpnKQSpVDzKJ7tVF8thtl8a0bhxf148u/syERa0UvC/v4M1neZxhrcU8z8VCpF6WZWnwGLOA+dFBipDWPY7WFZAocv2A7xtZxYQFCVVtwIShhfpPT409r4jjO1QBYK8Q1Aabi8iTZ1wDsnDILC0ZPX8InZtR325qb03+FcljAADrumKL9GytLZJSv0ucs65rVX4zdQuV9863NA4UKOZ5xse6JpGpGE4QC1IUrB9ro5d3lplLd4HjGFYuGHlkJB+1oH8+ayoPcgLaWepF41LrtxSquWtK/C3j5b3f8OlcA8h7H+8CqlHQd841deFQKIryOEfDPzMnEgrHas+35XhD1qVWX2T1MRzZae4D9Z0tMyIJKKs/qm+FozE/uvLRMfxlrTUALv2IES6XC4gI3ntYa1OWX6McAG63Wyq333+/cb1eAQLu9zt+Xy5NFpRXDRG7V+h+8ME7UDqZVH2cBn74jy/k58ZOkXMwDvwDUCDuAtixfl0AAAAASUVORK5CYII=',
    signal: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEIklEQVRYhbWXQW7bRhSGvzckjQDqgj5B2BNU2blmgzJoKQjdRD1BlBPEOYHlE1g9gZQbyDsHMhAFiJLurJzA7AmiRe2FqJnXBUmFlpXaSeR/RbzhzPvnzXvz/hG+EnFqByBN0AgIS/N8OvZ2AfbTZXen4Y0mI5nfZT1z2w97bY0et+xxzdQFbdacU/8WZJBfuk9xagdJW6NvJpB0NIxbeuxZd+GUg9WA8lKxj4KG2Z2OPZmOPQkaZrdGYFIRza27iFt6nHQ05AuQTca9tkaedW+AagfD6dh7ftturs+3PZBnpSkLGubRpmO5QSBJNMwDdw5ECJmq/fP9eGcGRVQWV7wQ1QTRCF0RnIPMUD0JfDOanEq2IuLcG3Hu1buzoHfnCPzye95TkShoeAeTkcyLHekANLljEIaBZ44qItc22NGwHgn50kCFn1N9YXA9rifdXTB3hqMPr71+Zdhv6aGo69aPY5WE+RWH+y09rK+w39JDg+t/g3OA0DiOqzWTREPBdYEov2LlR2CVdBcAQcPsTkYyL3fe37Ty18IZXn547fX300VT8M4BAs/8ODmVzAB41lWMhtWZl2HfCozjMGlrVCSzvgJYWncAYJJEQ6BbsjqqEfqWsH8JYW51AGA9rweg8CzpaGgWge1AcYFMTiXbK26v7hadl9Ak6Wj496lkFJdVaC9txxfkVwA1egLgLV1nc3F+P5ZX7gDoTcfmSWUzAk0AsW4GgMjT+3EPqsVm6/Dfjb1Ha78174tA2UGr2/YTMN/UjLaZfOuIACaT1YUXmji1GqdW79Hp/8IAcyiuYgCE7B79Fb6SVXueG6FwuFiUnU1vNpBtQZAZwPJBkfiIZEZFPwKIdUlh07f3RaAqdV26goDqzKgyAcAV5bc0ZnhfBAIxI4Dpmdcv1dRzs5N7I2AOmiRtjYzN76sKhpv0gV+WxErTPf5t2XG3StWvxrzqM4Wqpksp8264ciLR1t2rPVrvMxUhE7eWwzi1+jhddgFEVjpvKxB1R9OznX7S0bAUugjur+o4bgZb9eGWfM9R+7ISo4t/dUApdP2G36t+8lHzEBRVzQrKEn2vZ0EmvifPJ6deVtkM9qOKaQbGPKlrT399sgqhqMxQMsT+o2oyo5pZ4zIAUS8Rkadafx0JmahkqH3r/+D3KwdJW6Mq1O/Ogt5eW4fT9UqIW/YiTq3e9oy6yzOrwl5bozi1gzi1ui5017GKwBKipK0sy47lsBHA+1N/CJBbdxGnboLqifhm5j9gVg/l/h/alIVLEHlKeasCGF2uSnwjAVFOFF6odW/y2oB8lkXDz1ZNEBK1jvwS4tQyHXsCILk7L6YowFxwr3zP79fzYCMBPze9PLAhUqgVKZuRotcmBg2zu7i0HYFEMD/p9ec5gswUnSn6tniee3d6nv8HxAEAdLK9GeYAAAAASUVORK5CYII=',
  };

  // =====================================================================================
  // Fickliste
  // =====================================================================================
  const FSTATES = {
    want: { label: 'Will ich', i: 1 },
    done: { label: 'Gefickt', i: 2 },
    no: { label: 'Nein, danke!', i: 3 },
    never: { label: 'Nie wieder!', i: 4 },
  };
  // Symbole wie beim JOYclub-Skript (Ficken-Icon; Quelle: SVG Repo „sex-doggy“)
  const FL_D = 'M65.9,26.7c0-13.6,11-24.6,24.6-24.6s24.6,11,24.6,24.6s-11,24.6-24.6,24.6S65.9,40.3,65.9,26.7z M254,191.2c0,8.7-7.1,15.8-15.8,15.8h-78.8c-8.7,0-15.8-7.1-15.8-15.8v-27.5H74.8v30.4c0,7.1-5.7,12.8-12.8,12.8H14.8c-7.1,0-12.8-5.7-12.8-12.8s5.7-12.8,12.8-12.8h34.5c0,0,0.1-36.7,0.1-37.3c-0.4-7.9,5.2-14.9,13.1-16.3l45.9-7.7c0,0,0-59.2,0-59.2c0-11.7,9.5-21.3,21.3-21.3c3.7,0,7.2,0.9,10.2,2.6c8.4,4.5,41.9,29.7,61.1,44c8.8,6.6,13.9,16.9,13.9,27.8l0.1,61.4h23.3C246.9,175.4,254,182.5,254,191.2z M183.5,175.4l-0.2-36c0-10.4-4.8-20.1-13-26.5L134,84.7v31.1l10.9-1.8c0,0,0.1,0,0.1,0c7.5-1.2,15.2,0.9,21,5.8c5.8,4.9,9.2,12.1,9.3,19.7c0,0.1,0,0.1,0,0.2v35.7h7.9H183.5z M16.5,140.3c12.4,5.6,26.3-0.3,32.6-12.3c8-15.5,4.5-33.1-2.4-42.9c0,0,0,0,0,0c-4.8,5.8-12.2,7.6-19.6,8.1C15.3,94,8.4,98.4,4.2,107.7C-1.4,120.1,4.1,134.7,16.5,140.3z';
  const FL_RED = '#e01b1b';
  const FL_KIND = ['', 'will', 'gef', 'nein', 'nie'];
  // kind: '' (Umriss dünn = inaktiv) | will | gef | nein | nie | trash; opt: { size, color, shadow, redGef }
  function flIcon(kind, opt = {}) {
    const size = opt.size || 20;
    const sh = opt.shadow === false ? '' : 'filter:drop-shadow(1px 2px 1.5px rgba(0,0,0,.7));';
    const st = `width:${size}px;height:${size}px;flex:none;vertical-align:middle;${sh}`;
    if (kind === 'trash') {
      return `<svg class="vaf-fl-svg" viewBox="0 0 24 24" style="${st}color:${opt.color || 'currentColor'}" aria-hidden="true"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9zm4 2v9h1.6v-9H10zm3.4 0v9H15v-9h-1.6z"/></svg>`;
    }
    const fill = `<path fill="currentColor" d="${FL_D}"/>`;
    const line = `<path fill="none" stroke="currentColor" stroke-width="${kind === 'nein' ? 12 : 9}" stroke-linejoin="round" d="${FL_D}"/>`;
    const col = opt.color || (kind === 'gef' && opt.redGef ? FL_RED : 'currentColor');
    if (kind === 'nein' || kind === 'nie') {
      return `<svg class="vaf-fl-svg" viewBox="-48 -71.5 352 352" style="${st}color:${col}" aria-hidden="true">` +
        `<g transform="translate(128 104.5) scale(.78) translate(-128 -104.5)">${kind === 'nein' ? line : fill}</g>` +
        `<circle cx="128" cy="104.5" r="158" fill="none" stroke="${FL_RED}" stroke-width="22"/>` +
        `<line x1="16.3" y1="216.2" x2="239.7" y2="-7.2" stroke="${FL_RED}" stroke-width="22" stroke-linecap="round"/></svg>`;
    }
    return `<svg class="vaf-fl-svg" viewBox="${kind ? '-4 -4 264 217' : '-8 -8 272 225'}" style="${st}color:${col}" aria-hidden="true">${kind ? fill : line}</svg>`;
  }
  // 0 inaktiv · 1 will ich · 2 gefickt · 3 nein danke · 4 nie wieder; red = „Gefickt“ rot (Listen, Karten)
  const fickIcon = (i, size = 18, red = false) => flIcon(FL_KIND[i] || '', { size, redGef: red });
  const TRASH = flIcon('trash', { size: 16, shadow: false });

  // ---------- Plattformen und Links ----------
  // Kürzel und Farben wie im JOYclub-Skript
  const PLATFORMS = {
    joyclub: { name: 'JOYclub', icon: 'J', color: '#c71b1b' },
    poppen: { name: 'poppen.de', icon: 'P', color: '#d6246e' },
    xhamster: { name: 'xHamster', icon: 'xH', color: '#d9700b' },
    eronity: { name: 'Eronity', icon: 'Er', color: '#7b3fb5' },
    spicymatch: { name: 'SpicyMatch', icon: 'SM', color: '#b4440f' },
    kaufmich: { name: 'Kaufmich', icon: 'KM', color: '#a3164f' },
    fetish: { name: 'Fetish.com', icon: 'Fe', color: '#3f3f46' },
    gays: { name: 'Gays.com', icon: 'G', color: '#2563eb' },
    telegram: { name: 'Telegram', icon: 'TG', color: '#1f8bc4' },
    whatsapp: { name: 'WhatsApp', icon: 'WA', color: '#1f8a3a' },
    threema: { name: 'Threema', icon: 'Th', color: '#3c3c3c' },
    signal: { name: 'Signal', icon: 'Si', color: '#3a6fd8' },
    other: { name: 'Andere …', icon: '?', color: '#5c6470' },
  };
  const OWN_PF = 'poppen';
  const PF_HINT = {
    telegram: '@Name oder t.me/Name', whatsapp: 'Telefonnummer oder wa.me-Link', threema: 'Threema-ID (8 Zeichen)',
    signal: 'Telefonnummer, signal.me-Link oder Benutzername', other: 'Link oder Name',
  };
  const pfHint = (pf) => PF_HINT[pf] || `Profil-Link oder Name auf ${(PLATFORMS[pf] || PLATFORMS.other).name}`;
  const pfLabel = (pf, pfName) => (pf === 'other' && pfName ? pfName : (PLATFORMS[pf] || PLATFORMS.other).name.replace(' …', ''));
  const pfBadge = (pf, title = '', pfName = '', size = 16) => {
    const p = PLATFORMS[pf] || PLATFORMS.other;
    const fav = pf !== 'other' && PF_FAVICONS[pf];
    if (fav) return `<img class="vaf-pf" data-pf="${esc(pf)}" src="${fav}" alt="${esc(p.icon)}" title="${esc(title || pfLabel(pf, pfName))}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;margin-right:3px;vertical-align:-3px;border-radius:3px;flex:none;object-fit:contain">`;
    const ab = pf === 'other' && pfName ? pfName.slice(0, 2) : p.icon;
    return `<span class="vaf-pf" data-pf="${esc(pf || 'other')}" title="${esc(title || pfLabel(pf, pfName))}" style="display:inline-flex;align-items:center;justify-content:center;min-width:${size}px;height:${size}px;padding:0 3px;margin-right:3px;` +
      `border-radius:4px;background:${p.color};color:#fff;font:bold ${Math.round(size * 0.58)}px system-ui,sans-serif;line-height:1;vertical-align:-3px;box-sizing:border-box;flex:none">${esc(ab)}</span>`;
  };
  // „Profil gelöscht“: Austauschfeld dead (ältere Stände: deleted / gone)
  const isDead = (x) => !!(x && (x.dead || x.deleted || x.gone));
  const copyBtn = (t) => `<a href="#" data-copy="${esc(t)}" title="kopieren" style="margin-left:3px">⧉</a>`;
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-copy]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    try { navigator.clipboard.writeText(a.dataset.copy); toast('Kopiert.'); } catch {}
  }, true);
  const digits = (s) => String(s || '').replace(/\D/g, '');
  function phoneIntl(s) {
    let d = String(s || '').trim();
    if (/^\+/.test(d)) return digits(d);
    d = digits(d);
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('0')) return '49' + d.slice(1);
    return d.length >= 10 && !d.startsWith('49') && d.length <= 11 ? '49' + d : d;
  }
  const phonePretty = (intl) => { const d = digits(intl); return d.startsWith('49') ? `+49 ${d.slice(2, 5)} ${d.slice(5)}` : '+' + d; };
  // Eingabe → { pf, url, name, text }  (url = gespeicherte Schreibweise)
  function normalizeProfile(pf, input) {
    const v = String(input || '').trim();
    if (!v) return null;
    if (pf === 'telegram') {
      const m = /^(?:@|(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.me\/)([A-Za-z0-9_]{3,})/i.exec(v) || /^([A-Za-z0-9_]{3,})$/.exec(v);
      return m ? { pf, url: 'https://t.me/' + m[1], name: '@' + m[1] } : null;
    }
    if (pf === 'whatsapp') {
      const m = /wa\.me\/\+?(\d+)/i.exec(v);
      const intl = m ? m[1] : phoneIntl(v);
      return intl.length >= 8 ? { pf, url: 'https://wa.me/' + intl, name: phonePretty(intl) } : null;
    }
    if (pf === 'threema') {
      const m = /threema\.id\/([A-Za-z0-9*]{8})/i.exec(v) || /^([A-Za-z0-9*]{8})$/.exec(v);
      return m ? { pf, url: 'https://threema.id/' + m[1].toUpperCase(), name: m[1].toUpperCase() } : null;
    }
    if (pf === 'signal') {
      if (/signal\.me\//i.test(v)) return { pf, url: v.replace(/^http:/i, 'https:'), name: 'Signal-Link' };
      if (/^\+?[\d\s/()-]{8,}$/.test(v)) { const intl = phoneIntl(v); return { pf, url: 'https://signal.me/#p/+' + intl, name: phonePretty(intl) }; }
      return { pf, url: '', name: v, text: v };                     // Benutzername: kein Link möglich
    }
    if (/^https?:\/\//i.test(v) || /^[\w.-]+\.[a-z]{2,}\//i.test(v)) {
      const url = /^https?:/i.test(v) ? v : 'https://' + v;
      return { pf, url, name: decodeURIComponent((url.split('/').filter(Boolean).pop() || url)) };
    }
    if (pf === 'poppen') return { pf, url: 'https://www.poppen.de' + pathOfName(v), name: v };
    return { pf, url: '', name: v, text: v };
  }
  // Vereinheitlichter Link zum Vergleichen
  function linkKey(p) {
    if (!p) return '';
    if (!p.url) return p.text ? `${p.pf}:${norm(p.text)}` : '';
    let u = String(p.url).trim();
    try { u = decodeURIComponent(u); } catch {}
    u = u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, (x) => (/signal\.me/.test(u) ? x : '')).replace(/\/+$/, '');
    u = u.replace(/^telegram\.me\//, 't.me/');
    return u;
  }
  function platformOfUrl(url) {
    const u = String(url || '').toLowerCase();
    if (/poppen\.de/.test(u)) return 'poppen';
    if (/joyclub\.(de|com)/.test(u)) return 'joyclub';
    if (/xhamster/.test(u)) return 'xhamster';
    if (/eronity/.test(u)) return 'eronity';
    if (/spicymatch/.test(u)) return 'spicymatch';
    if (/kaufmich/.test(u)) return 'kaufmich';
    if (/fetish\.com/.test(u)) return 'fetish';
    if (/gays\.com/.test(u)) return 'gays';
    if (/t\.me|telegram\.me/.test(u)) return 'telegram';
    if (/wa\.me|whatsapp/.test(u)) return 'whatsapp';
    if (/threema\.id/.test(u)) return 'threema';
    if (/signal\.me/.test(u)) return 'signal';
    return 'other';
  }

  // ---------- Datenhaltung ----------
  const Fick = {
    async get(id) { return DB.get('fick', id); },
    async all() { return DB.all('fick'); },
    async put(p) { p.updated = now(); await DB.put('fick', p); chan.post({ t: 'fick' }); Bus.emit('fick'); try { if (typeof bkSendPerson === 'function' && !p.__fromBk) bkSendPerson(p); } catch {} return p; },
    async del(id) { await DB.del('fick', id); Bus.emit('fick'); },
    idOf: (uid) => 'p:' + uid,
    async forMember(uid, nick) {
      let p = await Fick.get(Fick.idOf(uid));
      if (!p) p = { id: Fick.idOf(uid), status: null, statusAt: 0, profiles: [], meets: [], history: [], created: now(), main: { pf: 'poppen', uid: String(uid), nick } };
      if (nick && p.main) p.main.nick = nick;
      const url = 'https://www.poppen.de' + pathOfName(p.main.nick || nick || '');
      if (nick && !p.profiles.some((x) => x.pf === 'poppen' && x.uid === String(uid))) p.profiles.unshift({ pf: 'poppen', url, name: nick, uid: String(uid) });
      else for (const x of p.profiles) if (x.pf === 'poppen' && x.uid === String(uid) && nick) { x.url = url; x.name = nick; }
      return p;
    },
    // Einträge ohne poppen-Hauptprofil, die ein poppen-Profil dieses Mitglieds enthalten (z. B. aus dem JOYclub-Import),
    // zu einer poppen-Person machen: Hauptprofil = poppen, fremdes Hauptprofil bleibt als Profil (main:true).
    async adopt(uid, nick) {
      uid = String(uid);
      const key = nick ? linkKey({ url: 'https://www.poppen.de' + pathOfName(nick) }) : '';
      const all = await Fick.all();
      const cands = all.filter((q) => !pm(q) && (q.profiles || []).some((x) => x.pf === 'poppen' && (x.uid === uid || (key && linkKey(x) === key))));
      if (!cands.length) return null;
      let t = await Fick.get(Fick.idOf(uid));
      if (!t) t = { id: Fick.idOf(uid), status: null, statusAt: 0, profiles: [], meets: [], history: [], created: now(), main: { pf: 'poppen', uid, nick } };
      for (const q of cands) {
        const hadExt = 'ext' in t, hadImp = 'imported' in t;
        mergeFick(t, q);
        if (!hadExt) delete t.ext;
        if (!hadImp) delete t.imported;
        t.main = { ...(t.main || {}), pf: 'poppen', uid, nick: nick || (t.main && t.main.nick) };
        t.history = [...(t.history || []), { at: now(), what: `Mit poppen-Profil verbunden (aus ${PLATFORMS[(q.main && q.main.pf) || 'other'] ? pfLabel((q.main && q.main.pf) || 'other') : 'Import'})` }];
        await Fick.del(q.id);
      }
      for (const x of t.profiles) if (x.pf === 'poppen' && (x.uid === uid || (key && linkKey(x) === key))) { x.uid = uid; if (nick) x.name = nick; }
      await Fick.put(t);
      return t;
    },
    async setStatus(p, st) {
      const old = p.status;
      p.status = st || null; p.statusAt = now();
      for (const x of p.profiles || []) if (x.sync === true) { x.status = p.status; x.statusAt = p.statusAt; }
      p.history = [...(p.history || []), { at: now(), what: `Fickstatus: ${old ? FSTATES[old].label : 'Ficken?'} → ${st ? FSTATES[st].label : 'zurückgesetzt'}` }];
      if (!p.status && !(p.meets || []).length && !p.ext) { await Fick.del(p.id); return null; }
      return Fick.put(p);
    },
  };
  const isFickDone = (p) => p.status === 'done' || p.status === 'never';
  // Hauptprofil auf poppen.de? (Personen aus dem JOYclub-Import behalten ihr fremdes Hauptprofil)
  const pm = (p) => (p && p.main && (!p.main.pf || p.main.pf === 'poppen') && p.main.uid ? p.main : null);
  const foreignUrl = (p) => (p && p.main && !pm(p) && p.main.url) || '';

  // ---------- Profil-Fakten (Persönliche Details) ----------
  function detailsFrom(doc = document) {
    const h = [...doc.querySelectorAll('main h2, h2')].find((x) => x.textContent.trim().startsWith('Persönliche Details'));
    if (!h) return {};
    let sec = h; for (let i = 0; i < 6 && sec; i++, sec = sec.parentElement) if (sec.querySelector('label')) break;
    const out = {};
    for (const lab of (sec || h.parentElement).querySelectorAll('label')) {
      const v = lab.nextElementSibling; const k = lab.textContent.trim();
      if (!k || !v) continue;
      const vals = [...v.children].map((c) => c.textContent.trim()).filter(Boolean);
      out[k] = (vals.length ? vals : [v.textContent.trim()]).join(', ');
    }
    return out;
  }
  async function applyFacts(x, fields) {
    let uid = x.uid || uidFromAvatar(x.avatar);
    if (!uid && x.nick) { const m = await Members.byNick(x.nick); uid = m && m.uid; }
    if (!uid) return;
    const num = (s) => { const m = /(\d{2,3})/.exec(String(s || '')); return m ? +m[1] : 0; };
    await Members.update(uid, (m) => {
      if (x.nick) m.nick = m.nick || x.nick;
      const z = fields['Sternzeichen'];
      if (z) { m.zod = z.split(',').map((t) => t.trim()); if (m.birth) m.birth = m.birth.map((b, i) => (m.zod[i] ? applyZodiac(b, m.zod[i]) : b)); }
      const h = num(fields['Größe']), w = num(fields['Gewicht']);
      if (h && w) m.body = [{ h, wlo: w, whi: w, at: now(), src: 'Profil' }];
      if (fields['Figur']) m.fig = fields['Figur'];
    });
  }

  // ---------- Profilseite: Button, Abschnitt, Archiv, eigenes Profil ----------
  const profileNick = () => (/^\/p\/([^/]+)\/?$/.exec(location.pathname) || [])[1];
  function profileHeaderInfo() {
    const send = [...document.querySelectorAll('main button')].find((b) => norm(b.textContent) === 'nachricht senden');
    const box = send && send.closest('main > *, main');
    const nameEl = box && box.querySelector('[class*="ellipsis"]');
    const desc = box && [...box.querySelectorAll('div,span')].find((e) => e.children.length === 0 && /\d+\s*Jahre/.test(e.textContent));
    const img = document.querySelector('main img[alt]');
    return { send, nick: nameEl ? nameEl.textContent.trim() : slugOf(location.pathname), desc: desc ? desc.textContent : '', avatar: img ? img.getAttribute('src') : '' };
  }
  let profBusy = false;
  async function profilePage() {
    const slug = profileNick();
    if (!slug || isBlockedProfilePage() || profBusy) return;
    const pi = profileHeaderInfo();
    const me = Me.get();
    const own = me && norm(me.nick) === norm(slugOf(location.pathname));
    if (own) { ownProfileBox(); return; }
    if (!pi.send) return;
    profBusy = true;
    try {
      let uid = uidFromAvatar(pi.avatar);
      let m = uid ? await Members.get(uid) : await Members.byNick(pi.nick);
      if (m && !uid) uid = m.uid;
      if (!uid) return;
      if (!document.body.dataset.vafProfileSeen || document.body.dataset.vafProfileSeen !== uid) {
        document.body.dataset.vafProfileSeen = uid;
        m = await seen({ uid, nick: pi.nick, ages: agesFromText(pi.desc), g: genderFromText(pi.desc), avatar: pi.avatar }, 'Profil');
        setTimeout(async () => { await applyFacts({ uid, nick: pi.nick }, detailsFrom()); await snapshot(uid, pi.nick, 'Profilaufruf'); }, 2500);
      }
      await Fick.adopt(uid, pi.nick).catch((e) => warn('Fickliste verbinden', e));
      await fickButton(uid, pi);
      await fickSection(uid, pi.nick);
    } finally { profBusy = false; }
  }

  // Button nach „Nachricht senden“
  async function fickButton(uid, pi) {
    const bar = pi.send.parentElement;
    let b = bar.querySelector('#vaf-fick-btn');
    const p = await Fick.get(Fick.idOf(uid));
    const st = p && p.status;
    const i = st ? FSTATES[st].i : 0;
    const label = st ? FSTATES[st].label : 'Ficken?';
    if (b && b.dataset.st === (st || '') ) return;
    if (!b) {
      const tpl = [...bar.querySelectorAll('button')].find((x) => norm(x.textContent) === 'sticker') || pi.send;
      b = tpl.cloneNode(false);
      b.id = 'vaf-fick-btn';
      b.className = tpl.className.replace(/ant-btn-primary|ant-btn-color-primary|ant-btn-variant-solid/g, '') + ' ant-btn-default ant-btn-variant-outlined';
      b.type = 'button';
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fickMenu(b, uid, pi.nick); });
      pi.send.after(b);
    }
    b.dataset.st = st || '';
    // wie auf JOYclub: „Gefickt“ als roter (primärer) Button mit weißem Symbol
    const prim = ['ant-btn-primary', 'ant-btn-color-primary', 'ant-btn-variant-solid'], dflt = ['ant-btn-default', 'ant-btn-color-default', 'ant-btn-variant-outlined'];
    b.classList.remove(...prim, ...dflt); b.classList.add(...(st === 'done' ? prim : dflt));
    b.innerHTML = `<span class="ant-btn-icon" style="display:inline-flex">${fickIcon(i, 18)}</span><span>${esc(label)}</span>`;
    b.title = 'Fickliste – nur für dich sichtbar';
  }
  // Menü wie „Speichern“: alle anderen Zustände + zurücksetzen
  async function fickMenu(anchor, uid, nick) {
    const old = document.getElementById('vaf-fick-menu'); if (old) { old.remove(); return; }
    const p = await Fick.forMember(uid, nick);
    const r = anchor.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'vaf-fick-menu';
    menu.className = 'ant-dropdown ant-theme';
    menu.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 6}px;z-index:2147483600`;
    const items = Object.entries(FSTATES).filter(([k]) => k !== p.status).map(([k, v]) => `<li class="ant-dropdown-menu-item" role="menuitem" data-k="${k}" style="display:flex;gap:8px;align-items:center">${fickIcon(v.i, 16)}<span>${esc(v.label)}</span></li>`);
    if (p.status) items.push(`<li class="ant-dropdown-menu-item" role="menuitem" data-k="reset" style="display:flex;gap:8px;align-items:center">${TRASH}<span>Fickstatus zurücksetzen</span></li>`);
    items.push(`<li class="ant-dropdown-menu-item" role="menuitem" data-k="meet" style="display:flex;gap:8px;align-items:center">＋<span>Treffen eintragen …</span></li>`);
    items.push(`<li class="ant-dropdown-menu-item" role="menuitem" data-k="also" style="display:flex;gap:8px;align-items:center">${pfBadge('joyclub', 'andere Plattformen')}<span>Auch auf …</span></li>`);
    menu.innerHTML = `<ul class="ant-dropdown-menu ant-dropdown-menu-root ant-dropdown-menu-vertical ant-dropdown-menu-light" role="menu">${items.join('')}</ul>`;
    document.body.appendChild(menu);
    const close = (e) => { if (!menu.contains(e.target) && e.target !== anchor) { menu.remove(); document.removeEventListener('mousedown', close, true); } };
    document.addEventListener('mousedown', close, true);
    menu.querySelectorAll('[data-k]').forEach((li) => li.addEventListener('click', async () => {
      menu.remove(); document.removeEventListener('mousedown', close, true);
      const k = li.dataset.k;
      if (k === 'meet') { editMeet(p, null); return; }
      if (k === 'also') {
        const fresh = !(await Fick.get(p.id));
        if (fresh) await Fick.put(p);
        // neu angelegt und nichts eingetragen → wieder entfernen
        addProfileDialog(p, async () => { const q = await Fick.get(p.id); if (fresh && q && !q.status && !(q.meets || []).length && !otherProfiles(q).length) await Fick.del(p.id); refreshProfileFick(); });
        return;
      }
      await Fick.setStatus(p, k === 'reset' ? null : k);
      await snapshot(uid, nick, 'Fickstatus geändert', true);
      refreshProfileFick();
    }));
  }
  function refreshProfileFick() {
    const b = document.getElementById('vaf-fick-btn'); if (b) b.dataset.st = '#';
    const s = document.getElementById('vaf-fick-sec'); if (s) s.remove();
    profilePage();
  }

  // ---------- Anmerkungen einer Person (persons[].notes, höchstens 8000 Zeichen) ----------
  const NOTES_MAX = 8000;
  const notesOf = (p) => String((p && (p.notes != null ? p.notes : (p.joy && p.joy.notes != null ? p.joy.notes : p.note))) || '');
  async function setNotes(p, text) {
    const t = String(text || '').slice(0, NOTES_MAX);
    if (t === notesOf(p)) return p;
    const me = Me.get() || {};
    p.notes = t; p.notesAt = now(); p.notesBy = { platform: 'poppen', account: me.nick || '' };
    delete p.note;
    p.history = [...(p.history || []), { at: now(), what: t ? 'Anmerkungen geändert' : 'Anmerkungen gelöscht' }];
    return Fick.put(p);
  }
  function editNotes(p, done) {
    const m = modal({ title: 'Anmerkungen', sub: esc((pm(p) && pm(p).nick) || (p.ext && p.ext.name) || (p.main && p.main.nick) || ''),
      html: `<textarea class="vaf-in" data-f="n" rows="8" maxlength="${NOTES_MAX}" style="resize:vertical">${esc(notesOf(p))}</textarea><div class="vaf-mini" data-f="c" style="text-align:right"></div>` });
    const ta = m.body.querySelector('[data-f=n]'), c = m.body.querySelector('[data-f=c]');
    const upd = () => { c.textContent = `Noch ${fmtN(NOTES_MAX - ta.value.length)} Zeichen möglich`; };
    ta.addEventListener('input', upd); upd();
    m.buttons([
      { label: 'Speichern', primary: true, fn: async () => { if (!(await Fick.get(p.id))) await Fick.put(p); await setNotes(p, ta.value.trim()); m.close(); if (done) done(); else refreshProfileFick(); } },
      { label: 'Abbrechen', focus: true, fn: () => m.close() },
    ]);
    setTimeout(() => ta.focus(), 50);
  }
  const notesBlock = (p) => `<div style="margin-bottom:8px"><span style="color:#8c8c8c">Anmerkungen</span> <a href="#" data-a="notes" title="Anmerkungen bearbeiten">✎</a>${notesOf(p) ? `<div style="white-space:pre-wrap;margin-top:2px">${esc(notesOf(p))}</div>` : ''}</div>`;

  // Abschnitt „Fickliste“ unter „Fotos“ und „Videos“
  async function fickSection(uid, nick) {
    const p = await Fick.get(Fick.idOf(uid));
    let sec = document.getElementById('vaf-fick-sec');
    if (!p) { if (sec) sec.remove(); return; }
    if (sec && sec.dataset.u === String(p.updated)) return;
    const h2s = [...document.querySelectorAll('main h2')];
    const blockOf = (h) => { let b = h; while (b.parentElement && b.parentElement.tagName !== 'MAIN' && b.parentElement.children.length < 3) b = b.parentElement; return b; };
    const vid = h2s.find((h) => /^Videos/.test(h.textContent.trim()));
    const fot = h2s.find((h) => /^Fotos/.test(h.textContent.trim()));
    const stat = h2s.find((h) => /^Statistiken/.test(h.textContent.trim()));
    const ref = vid || fot;
    const host = ref ? blockOf(ref) : stat ? blockOf(stat) : null;
    if (!host) return;
    if (!sec) { sec = document.createElement('div'); sec.id = 'vaf-fick-sec'; sec.dataset.vafSkip = '1'; }
    sec.className = host.className;
    sec.dataset.u = String(p.updated);
    const st = p.status ? FSTATES[p.status] : null;
    const meets = [...(p.meets || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    sec.innerHTML = `<div class="${(host.firstElementChild && host.firstElementChild.className) || ''}"><h2>Fickliste <span style="font-size:12px;font-weight:400;color:#8c8c8c">· Nur für dich sichtbar</span></h2></div>
      <div style="padding:4px 0 12px;font-size:14px;color:#e8e8e8">
        <div style="margin-bottom:8px">${fickIcon(st ? st.i : 0, 18, true)} <b>${esc(st ? st.label : 'kein Fickstatus')}</b></div>
        ${meets.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">${meets.map((t) => meetLine(t)).join('')}</div>` : '<div style="color:#8c8c8c;margin-bottom:8px">Noch keine Treffen eingetragen.</div>'}
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px"><a href="#" data-a="add">+ Treffen eintragen</a></div>
        ${notesBlock(p)}
        <div class="vaf-also" style="margin-bottom:6px"><span style="color:#8c8c8c">Auch auf:</span>${(p.profiles || []).filter((x) => !(x.pf === 'poppen' && x.uid === String(uid))).map(profLink).map((h) => `<span class="vaf-also-i">${h}</span>`).join('')}<button type="button" class="vaf-plus" data-a="prof" title="Profil auf einer anderen Plattform zufügen">+</button></div>
        <div style="display:flex;gap:16px"><a href="/setting/profile#archiv=${encodeURIComponent(uid)}" target="_blank">Profil-Archiv</a><a href="/setting/profile#fickliste" target="_blank">Zu meiner Fickliste</a></div>
      </div>`;
    if (!sec.isConnected || sec.previousElementSibling !== (ref ? host : null)) { if (ref) host.after(sec); else host.before(sec); }
    sec.querySelector('[data-a=add]').addEventListener('click', (e) => { e.preventDefault(); editMeet(p, null); });
    sec.querySelector('[data-a=prof]').addEventListener('click', (e) => { e.preventDefault(); addProfileDialog(p); });
    sec.querySelector('[data-a=notes]').addEventListener('click', (e) => { e.preventDefault(); editNotes(p); });
    sec.querySelectorAll('[data-meet]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); editMeet(p, p.meets.find((t) => t.id === a.dataset.meet)); }));
  }
  function meetLine(t) {
    const d = t.date ? deDate(new Date(t.date + 'T12:00')) : 'ohne Datum';
    const where = [t.where, t.club].filter(Boolean).map(esc).join(' · ');
    const link = t.link ? ` <a href="${esc(t.link)}" target="_blank" rel="noopener">${pfBadge(t.pf || platformOfUrl(t.link))}Link</a>` : '';
    return `<div><a href="#" data-meet="${esc(t.id)}" title="Treffen bearbeiten">${esc(d)}${t.time ? ' ' + esc(t.time) : ''}</a>${where ? ' · ' + where : ''}${link}${t.note ? ` <span style="color:#a6a6a6">– ${esc(t.note)}</span>` : ''}</div>`;
  }
  function profLink(x) {
    const strike = isDead(x) ? 'vaf-strike' : '';
    const title = pfLabel(x.pf, x.pfName) + (isDead(x) ? ' · Profil gelöscht' : '');
    if (!x.url) return `<span class="${strike}">${pfBadge(x.pf, title, x.pfName)}${esc(x.name || x.text)}</span>${copyBtn(x.text || x.name || '')}`;
    const own = 'status' in x && x.sync !== true ? ` <span title="eigener Status dieses Profils: ${esc(x.status ? FSTATES[x.status].label : 'kein')}">${fickIcon(x.status ? FSTATES[x.status].i : 0, 14, true)}</span>` : '';
    return `<a href="${esc(x.url)}" target="_blank" rel="noopener" class="${strike}">${pfBadge(x.pf, title, x.pfName)}${esc(x.name || x.url)}</a>${own}`;
  }
  // Treffen eintragen / bearbeiten
  function editMeet(p, t) {
    const isNew = !t;
    t = t ? { ...t } : { id: 'm' + now().toString(36), date: isoDay(new Date()), time: '', where: '', club: '', link: '', note: '', pf: 'poppen' };
    const m = modal({ title: isNew ? 'Treffen eintragen' : 'Treffen bearbeiten', sub: esc((p.main && p.main.nick) || (p.ext && p.ext.name) || ''),
      html: `<div class="vaf-grid"><label>Datum<input class="vaf-in" type="date" data-f="date" value="${esc(t.date)}"></label><label>Uhrzeit<input class="vaf-in" type="time" data-f="time" value="${esc(t.time)}"></label>
        <label>Was (Party, Anlass)<input class="vaf-in" data-f="where" value="${esc(t.where)}"></label><label>Wo (Club, Ort)<input class="vaf-in" data-f="club" value="${esc(t.club)}"></label></div>
        <label>Link (Party, Club, poppen-Ort …)<input class="vaf-in" data-f="link" value="${esc(t.link)}" placeholder="https://…"></label>
        <label style="display:block;margin-top:10px">Notiz<textarea class="vaf-in" data-f="note" rows="3">${esc(t.note)}</textarea></label>` });
    const read = () => { m.body.querySelectorAll('[data-f]').forEach((i) => { t[i.dataset.f] = i.value.trim(); }); if (t.link && !/^https?:/i.test(t.link)) t.link = 'https://' + t.link; t.pf = t.link ? platformOfUrl(t.link) : 'poppen'; };
    m.buttons([
      { label: 'Speichern', primary: true, focus: true, fn: async () => {
        read();
        p.meets = (p.meets || []).filter((x) => x.id !== t.id).concat([{ ...t, at: now() }]);
        p.history = [...(p.history || []), { at: now(), what: `${isNew ? 'Treffen eingetragen' : 'Treffen geändert'}: ${t.date}` }];
        if (!p.status) { p.status = 'done'; p.statusAt = now(); }
        await Fick.put(p); m.close(); refreshProfileFick(); Bus.emit('fick');
      } },
      ...(isNew ? [] : [{ label: 'Treffen löschen', fn: async () => { if (!W.confirm('Treffen löschen?')) return; p.meets = p.meets.filter((x) => x.id !== t.id); await Fick.put(p); m.close(); refreshProfileFick(); } }]),
      { label: 'Abbrechen', fn: () => m.close() },
    ]);
  }
  // Profile, die im Popup „Auch auf …“ erscheinen (nicht das eigene poppen-Hauptprofil)
  const otherProfiles = (p) => (p.profiles || []).filter((x) => !(x.pf === OWN_PF && pm(p) && x.uid === String(pm(p).uid)));
  // Importierte Einträge einer Plattform ohne eigenes Profil hier (Vorschläge zum Zusammenführen)
  async function importSuggestions(p, pf) {
    const all = await Fick.all();
    return all.filter((q) => q.id !== p.id && !pm(q) && (q.imported || String(q.id).startsWith('i:')) &&
      ((q.main && q.main.pf === pf) || (q.profiles || []).some((x) => x.pf === pf)));
  }
  // Importierten Eintrag q mit Person p zusammenführen: neuerer Status, Treffen/Profile/Verlauf übernehmen, Anmerkungen anhängen
  async function mergeImported(p, q) {
    mergeFick(p, q);
    const note = [q.ext && q.ext.short, q.ext && q.ext.texts, q.note].filter(Boolean).join('\n').trim();
    if (note) {
      const k = q.main && q.main.url ? linkKey(q.main) : '';
      const x = (k && p.profiles.find((y) => linkKey(y) === k)) || null;
      if (x) x.text = [x.text, note].filter(Boolean).join('\n');
      else p.notes = [notesOf(p), note].filter(Boolean).join('\n').slice(0, NOTES_MAX);
    }
    p.history = [...(p.history || []), { at: now(), what: `Zusammengeführt mit importiertem Eintrag ${(q.main && q.main.nick) || (q.ext && q.ext.name) || ''}` }];
    await Fick.put(p);
    await Fick.del(q.id);
  }
  function addProfileDialog(p, done) {
    const pfOpts = Object.entries(PLATFORMS).filter(([k]) => k !== OWN_PF).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
    const nick = (pm(p) && pm(p).nick) || (p.ext && p.ext.name) || (p.main && p.main.nick) || '';
    const m = modal({ title: 'Auch auf …', sub: esc(nick), html: `<div data-f="list"></div>
      <h3 style="margin:14px 0 6px;font-size:15px">+ Profil zufügen</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <select class="vaf-in" data-f="pf" style="width:auto">${pfOpts}</select>
        <input class="vaf-in" data-f="pfName" placeholder="Name der Plattform" style="width:180px;display:none">
        <input class="vaf-in" data-f="v" style="flex:1;min-width:200px">
        <button type="button" class="vaf-big vaf-pri" data-a="add" style="width:auto">Zufügen</button></div>
      <div class="vaf-cur" data-f="hint"></div><div data-f="sugg"></div>`, onClose: () => { if (done) done(); else refreshProfileFick(); } });
    const $ = (f) => m.body.querySelector(`[data-f=${f}]`);
    const pfSel = $('pf'), inp = $('v'), hint = $('hint'), pfName = $('pfName');
    pfSel.value = 'joyclub';
    const drawList = () => {
      const l = otherProfiles(p);
      $('list').innerHTML = l.length ? l.map((x, i) => `<div style="display:flex;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid #2c2c2c">
          <span style="flex:1;min-width:0">${profLink(x)}</span>
          <label style="display:flex;gap:5px;align-items:center;font-size:12px;color:#a6a6a6;white-space:nowrap"><input type="checkbox" data-dead="${i}" ${isDead(x) ? 'checked' : ''}> Profil gelöscht</label>
          <a href="#" data-rm="${i}" title="entfernen" style="color:#ff7875;text-decoration:none">✕</a></div>`).join('')
        : '<div style="color:#8c8c8c">Noch keine Profile auf anderen Plattformen.</div>';
      $('list').querySelectorAll('[data-dead]').forEach((c) => c.addEventListener('change', async () => {
        const x = l[+c.dataset.dead];
        delete x.deleted; delete x.gone;
        if (c.checked) x.dead = true; else delete x.dead;
        p.history = [...(p.history || []), { at: now(), what: `${pfLabel(x.pf, x.pfName)} ${x.name || ''}: ${c.checked ? 'Profil gelöscht' : 'Profil wieder da'}` }];
        await Fick.put(p); drawList();
      }));
      $('list').querySelectorAll('[data-rm]').forEach((a) => a.addEventListener('click', async (e) => {
        e.preventDefault();
        const x = l[+a.dataset.rm];
        if (!W.confirm(`${pfLabel(x.pf, x.pfName)}-Profil „${x.name || x.url}“ entfernen?`)) return;
        p.profiles = p.profiles.filter((y) => y !== x);
        p.history = [...(p.history || []), { at: now(), what: `Profil entfernt: ${pfLabel(x.pf, x.pfName)} ${x.name || ''}` }];
        await Fick.put(p); drawList();
      }));
    };
    const drawSugg = async () => {
      const pf = pfSel.value;
      const l = await importSuggestions(p, pf);
      $('sugg').innerHTML = l.length ? `<div class="vaf-mini" style="margin:8px 0 4px">Importierte Einträge von ${esc(pfLabel(pf))} – Klick führt sie mit dieser Person zusammen</div>` +
        l.map((q) => { const n = (q.main && q.main.nick) || (q.ext && q.ext.name) || '?'; const st = q.status ? FSTATES[q.status] : null;
          return `<div data-q="${esc(q.id)}" style="display:flex;gap:8px;align-items:center;padding:5px 8px;border-radius:6px;cursor:pointer;background:#2a2a2a;margin-bottom:4px">${pfBadge(pf)}<span>${esc(n)}</span>${st ? fickIcon(st.i, 15, true) : ''}<span class="vaf-mini">${(q.meets || []).length} Treffen</span></div>`; }).join('') : '';
      $('sugg').querySelectorAll('[data-q]').forEach((d) => d.addEventListener('click', async () => {
        const q = l.find((x) => x.id === d.dataset.q);
        const n = (q.main && q.main.nick) || (q.ext && q.ext.name) || '?';
        if (!W.confirm(`„${n}“ mit dieser Person zusammenführen? Der importierte Eintrag verschwindet danach.`)) return;
        await mergeImported(p, q);
        hint.textContent = `„${n}“ zusammengeführt.`;
        drawList(); drawSugg();
      }));
    };
    const upd = () => {
      pfName.style.display = pfSel.value === 'other' ? '' : 'none';
      inp.placeholder = pfHint(pfSel.value);
      const r = normalizeProfile(pfSel.value, inp.value);
      hint.textContent = !inp.value.trim() ? '' : r ? (r.url ? 'Gespeichert als: ' + r.url : 'Ohne Link (nur Text): ' + r.name) : 'Das passt nicht zu ' + pfLabel(pfSel.value, pfName.value) + '.';
    };
    pfSel.addEventListener('change', () => { upd(); drawSugg(); }); inp.addEventListener('input', upd);
    const add = async () => {
      const r = normalizeProfile(pfSel.value, inp.value);
      if (!r) { hint.textContent = `Das passt nicht zu ${pfLabel(pfSel.value, pfName.value)} (${pfHint(pfSel.value)}).`; return; }
      if (r.pf === 'other') { const n = pfName.value.trim(); if (!n) { hint.textContent = 'Bitte den Namen der Plattform eingeben.'; pfName.focus(); return; } r.pfName = n; }
      if ((p.profiles || []).some((x) => linkKey(x) === linkKey(r)) || (p.main && p.main.url && linkKey(p.main) === linkKey(r))) { hint.textContent = 'Dieses Profil ist schon eingetragen.'; return; }
      p.profiles = [...(p.profiles || []), r];
      p.history = [...(p.history || []), { at: now(), what: `Profil zugefügt: ${pfLabel(r.pf, r.pfName)} ${r.name}` }];
      await Fick.put(p);
      inp.value = ''; upd(); hint.textContent = 'Zugefügt.'; drawList();
    };
    m.body.querySelector('[data-a=add]').addEventListener('click', add);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    m.buttons([{ label: 'Schließen', focus: true, fn: () => m.close() }]);
    drawList(); upd(); drawSugg();
  }

  // ---------- Profil-Archiv ----------
  async function hashText(s) { const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
  async function snapshot(uid, nick, reason, force = false) {
    const main = document.querySelector('main');
    if (!main || !uid) return;
    const c = main.cloneNode(true);
    c.querySelectorAll('script, style, iframe, #vaf-fick-sec, #vaf-fick-btn, .vaf-mark, [data-vaf-own]').forEach((e) => e.remove());
    c.querySelectorAll('input, textarea').forEach((e) => e.setAttribute('disabled', ''));
    const html = c.innerHTML;
    if (html.length < 500) return;
    const h = await hashText(html.replace(/==,\d+\//g, '/'));
    const prev = await DB.byIndex('archive', 'uid', String(uid));
    prev.sort((a, b) => a.at - b.at);
    const last = prev[prev.length - 1];
    if (last && last.hash === h && !force) return;
    const p = await Fick.get(Fick.idOf(uid));
    const img = await Images.get(uid);
    await DB.put('archive', { uid: String(uid), nick, at: now(), reason: last && last.nick !== nick ? `Nick geändert (${last.nick} → ${nick})` : reason, html, hash: h, img });
    // ohne Fickliste-Eintrag nur den letzten Stand behalten
    if (!p) for (const old of prev) await DB.del('archive', old.id);
    else if (prev.length > 60) for (const old of prev.slice(0, prev.length - 60)) await DB.del('archive', old.id);
  }
  async function renderArchive(el, uid) {
    ensureStyle();
    const list = (await DB.byIndex('archive', 'uid', String(uid))).sort((a, b) => a.at - b.at);
    const m = await Members.get(uid);
    const p = await Fick.get(Fick.idOf(uid));
    if (!list.length) { el.innerHTML = `<div style="padding:24px;color:#e8e8e8"><h2>Profil-Archiv</h2><p>Für ${esc((m && m.nick) || (p && p.main && p.main.nick) || (p && p.ext && p.ext.name) || uid)} gibt es noch keinen gespeicherten Stand. Er entsteht, sobald du das Profil öffnest.</p></div>`; return; }
    let idx = list.length - 1;
    try { const k = sessionStorage.getItem('vaf_arch_' + uid); if (k != null && list[+k]) idx = +k; } catch {}
    const meetDates = ((p && p.meets) || []).map((t) => t.date).filter(Boolean).sort();
    const draw = () => {
      const a = list[idx];
      try { sessionStorage.setItem('vaf_arch_' + uid, String(idx)); } catch {}
      const opts = list.map((x, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${deDateTime(x.at)} – ${esc(x.reason || '')}</option>`).join('') + '<option value="live">aktuell (echtes Profil)</option>';
      el.innerHTML = `<div style="position:sticky;top:0;z-index:5;background:#141414;padding:10px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:#e8e8e8">
          <b>Profil-Archiv: ${esc(a.nick || '')}</b>
          <button type="button" class="vaf-big" style="width:auto;padding:4px 10px" data-n="ff" title="Stand direkt vor dem vorigen Treffen">«</button>
          <button type="button" class="vaf-big" style="width:auto;padding:4px 10px" data-n="p">‹</button>
          <select class="vaf-in" style="width:auto" data-n="sel">${opts}</select>
          <button type="button" class="vaf-big" style="width:auto;padding:4px 10px" data-n="n">›</button>
          <button type="button" class="vaf-big" style="width:auto;padding:4px 10px" data-n="fn" title="Stand direkt nach dem nächsten Treffen">»</button></div>
        <div data-n="body" style="pointer-events:auto"></div>`;
      el.querySelector('[data-n=body]').innerHTML = a.html;
      el.querySelectorAll('[data-n=body] a[href^="/"]').forEach((x) => { x.target = '_blank'; });
      const at = (i) => { if (i >= 0 && i < list.length) { idx = i; draw(); } };
      el.querySelector('[data-n=p]').onclick = () => at(idx - 1);
      el.querySelector('[data-n=n]').onclick = () => at(idx + 1);
      el.querySelector('[data-n=sel]').onchange = (e) => { if (e.target.value === 'live') W.open(profileUrl(a.nick), '_blank'); else at(+e.target.value); };
      const day = (x) => isoDay(new Date(x.at));
      el.querySelector('[data-n=ff]').onclick = () => { const cur = day(list[idx]); const md = [...meetDates].reverse().find((d) => d < cur); if (!md) return; let j = -1; list.forEach((x, i) => { if (day(x) <= md) j = i; }); at(Math.max(0, j)); };
      el.querySelector('[data-n=fn]').onclick = () => { const cur = day(list[idx]); const md = meetDates.find((d) => d > cur); if (!md) return; const j = list.findIndex((x) => day(x) >= md); at(j < 0 ? list.length - 1 : j); };
    };
    draw();
    if (m && m.del) toast(`<b>Dieser Benutzer ist nicht mehr auf poppen.de</b><br>Du betrachtest eine statische Kopie seines alten Profils.`, 10000);
  }

  // ---------- Externe Ficks ----------
  async function renderExternal(el, id) {
    ensureStyle();
    let p = id ? await Fick.get(id) : null;
    if (!p) { el.innerHTML = '<div style="padding:24px;color:#e8e8e8">Eintrag nicht gefunden.</div>'; return; }
    const x = p.ext || (p.ext = {});
    const draw = () => {
      el.innerHTML = `<div style="padding:16px 0;color:#e8e8e8;max-width:760px">
        <div style="display:flex;gap:16px;align-items:center">
          <label style="cursor:pointer" title="Bild ändern"><img src="${esc(x.img || '')}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;background:#2a2a2a"><input type="file" accept="image/*" data-f="img" style="display:none"></label>
          <div style="flex:1"><input class="vaf-in" data-f="name" value="${esc(x.name || '')}" placeholder="Name" style="font-size:20px;font-weight:700">
          <div class="vaf-grid" style="margin-top:6px"><input class="vaf-in" data-f="typ" value="${esc(x.typ || '')}" placeholder="Typ (Mann, Frau, Paar …)"><input class="vaf-in" data-f="city" value="${esc(x.city || '')}" placeholder="Ort"></div></div></div>
        <textarea class="vaf-in" data-f="short" rows="2" placeholder="Kurztext" style="margin-top:10px">${esc(x.short || '')}</textarea>
        <textarea class="vaf-in" data-f="texts" rows="6" placeholder="Steckbrief, Beschreibung, Notizen …" style="margin-top:10px">${esc(x.texts || '')}</textarea>
        <label class="vaf-chk"><input type="checkbox" data-f="gone" ${x.gone ? 'checked' : ''}> Profil gelöscht (war auf einer Plattform)</label>
        <div style="margin:10px 0">${fickIcon(p.status ? FSTATES[p.status].i : 0, 18, true)} <select class="vaf-in" data-f="status" style="width:auto">${['', ...Object.keys(FSTATES)].map((k) => `<option value="${k}" ${k === (p.status || '') ? 'selected' : ''}>${k ? FSTATES[k].label : 'Ficken?'}</option>`).join('')}</select></div>
        <div class="vaf-also"><b>Auch auf:</b> ${[...(foreignUrl(p) ? [{ pf: p.main.pf, url: p.main.url, name: p.main.nick }] : []), ...(p.profiles || [])].map(profLink).map((h) => `<span class="vaf-also-i">${h}</span>`).join('')}<button type="button" class="vaf-plus" data-a="prof" title="Profil auf einer anderen Plattform zufügen">+</button></div>
        <h3>Treffen</h3><div>${[...(p.meets || [])].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(meetLine).join('') || '–'}</div>
        <div style="margin-top:10px">${notesBlock(p)}</div>
        <div style="margin-top:8px"><a href="#" data-a="add">+ Treffen eintragen</a> · <a href="/setting/profile#archiv=${encodeURIComponent(p.id)}">Profil-Archiv</a> · <a href="#" data-a="del">Eintrag löschen</a></div></div>`;
      const save = async (what) => { await Fick.put(p); await DB.put('archive', { uid: p.id, nick: x.name, at: now(), reason: what, html: el.innerHTML, hash: '' }); };
      el.querySelectorAll('input[data-f]:not([type=file]):not([type=checkbox]), textarea[data-f]').forEach((i) => i.addEventListener('change', () => { x[i.dataset.f] = i.value.trim(); save(`${i.dataset.f} geändert`); }));
      el.querySelector('[data-f=gone]').addEventListener('change', (e) => { x.gone = e.target.checked ? now() : 0; save('Profil gelöscht'); });
      el.querySelector('[data-f=status]').addEventListener('change', async (e) => { p = await Fick.setStatus(p, e.target.value || null) || p; draw(); });
      el.querySelector('[data-f=img]').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const bmp = await createImageBitmap(f); const c = document.createElement('canvas'); const s = 200 / Math.max(bmp.width, bmp.height);
        c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        x.img = c.toDataURL('image/jpeg', 0.8); await save('Profilbild geändert'); draw();
      });
      el.querySelector('[data-a=prof]').onclick = (e) => { e.preventDefault(); addProfileDialog(p, draw); };
      el.querySelector('[data-a=add]').onclick = (e) => { e.preventDefault(); editMeet(p, null); };
      el.querySelector('[data-a=notes]').onclick = (e) => { e.preventDefault(); editNotes(p, draw); };
      el.querySelectorAll('[data-meet]').forEach((a) => { a.onclick = (e) => { e.preventDefault(); editMeet(p, p.meets.find((t) => t.id === a.dataset.meet)); }; });
      el.querySelector('[data-a=del]').onclick = async (e) => { e.preventDefault(); if (W.confirm('Diesen externen Eintrag löschen?')) { await Fick.del(p.id); goHash('fickliste'); } };
    };
    draw();
    Bus.on('fick', async () => { const n = await Fick.get(p.id); if (n && ownView && ownView.kind === 'extern:' + id) { p = n; draw(); } });
  }
  async function newExternal() {
    const p = { id: 'x:' + now().toString(36) + Math.random().toString(36).slice(2, 6), status: null, statusAt: 0, profiles: [], meets: [], history: [{ at: now(), what: 'angelegt' }], created: now(), ext: { name: 'Neuer Eintrag' } };
    await Fick.put(p);
    goHash('extern=' + encodeURIComponent(p.id));
  }

  // ---------- Meine Fickliste ----------
  async function renderFickList(el) {
    ensureStyle();
    const persons = await Fick.all();
    const st = { sort: 'date', dir: -1, member: '', where: '', club: '', from: '', to: '', pfs: [], status: '' };
    try { Object.assign(st, JSON.parse(sessionStorage.getItem('vaf_fl') || '{}')); } catch {}
    if (!Array.isArray(st.pfs)) st.pfs = [];
    delete st.pf;
    const memberOf = async (p) => (pm(p) ? await Members.get(pm(p).uid) : null);
    const rows = [];
    for (const p of persons) {
      const m = await memberOf(p);
      const name = (p.main && (m && m.nick || p.main.nick)) || (p.ext && p.ext.name) || '?';
      const base = { p, name, del: !!(m && m.del) || !!(p.ext && p.ext.gone), inactive: m && m.active === false, url: pm(p) ? profileUrl(name) : ((p.profiles || []).find((x) => x.pf === OWN_PF && x.url) || {}).url || foreignUrl(p) || '/setting/profile#extern=' + encodeURIComponent(p.id), arch: '/setting/profile#archiv=' + encodeURIComponent(pm(p) ? pm(p).uid : p.id), pfs: uniq([...(p.main && p.main.pf && !pm(p) ? [p.main.pf] : []), ...(p.profiles || []).map((x) => x.pf)]),
        badges: uniq([...(foreignUrl(p) ? [p.main.pf + '|'] : []), ...otherProfiles(p).map((x) => `${x.pf}|${x.pf === 'other' ? (x.pfName || '') : ''}`)]) };
      if (!(p.meets || []).length) rows.push({ ...base, t: null });
      for (const t of p.meets || []) rows.push({ ...base, t });
    }
    const clubs = uniq(rows.map((r) => (r.t && r.t.club) || '')).sort();
    const pfOrder = Object.keys(PLATFORMS);
    const pfAll = uniq(rows.flatMap((r) => [...r.pfs, ...(r.t && r.t.link ? [r.t.pf || platformOfUrl(r.t.link)] : [])])).sort((a, b) => pfOrder.indexOf(a) - pfOrder.indexOf(b));
    const counts = Object.fromEntries(Object.keys(FSTATES).map((k) => [k, persons.filter((p) => p.status === k).length]));
    const draw = () => {
      try { sessionStorage.setItem('vaf_fl', JSON.stringify(st)); } catch {}
      let list = rows.filter((r) => {
        if (st.status && r.p.status !== st.status) return false;
        if (st.member && !norm(r.name).includes(norm(st.member))) return false;
        if (st.where && !norm(r.t && r.t.where).includes(norm(st.where))) return false;
        if (st.club) { const c = (r.t && r.t.club) || ''; if (st.club === '(unbekannt)' ? c : c !== st.club) return false; }
        if (st.from && (!r.t || (r.t.date || '') < st.from)) return false;
        if (st.to && (!r.t || (r.t.date || '') > st.to)) return false;
        if (st.pfs.length) {
          const foreign = r.pfs.filter((x) => x !== OWN_PF && x !== 'other');
          const ok = st.pfs.some((f) => f === 'none' ? !foreign.length : r.pfs.includes(f) || (r.t && r.t.pf === f));
          if (!ok) return false;
        }
        return true;
      });
      list.sort((a, b) => st.sort === 'name' ? st.dir * a.name.localeCompare(b.name, 'de') : st.dir * (((a.t && a.t.date) || '').localeCompare((b.t && b.t.date) || '') || a.name.localeCompare(b.name, 'de')));
      el.innerHTML = `<div style="padding:8px 0 40px;color:#e8e8e8">
        <h2 style="color:#fff;margin:4px 0 12px">Meine Fickliste <span style="font-size:12px;font-weight:400;color:#8c8c8c">· Nur für dich sichtbar</span></h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">${Object.entries(FSTATES).map(([k, v]) => `<button type="button" class="vaf-tile ${st.status === k ? 'vaf-on' : ''}" data-st="${k}" title="${esc(v.label)}" style="padding:6px 12px">${fickIcon(v.i, 18, true)} <b style="display:inline">${counts[k]}</b></button>`).join('')}</div>
        <div class="vaf-grid" style="grid-template-columns:repeat(6,1fr)">
          <input class="vaf-in" data-f="member" list="vaf-fl-names" placeholder="Mitglied" value="${esc(st.member)}"><datalist id="vaf-fl-names">${uniq(rows.map((r) => r.name)).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
          <input class="vaf-in" data-f="where" placeholder="Was (Party, Anlass)" value="${esc(st.where)}">
          <select class="vaf-in" data-f="club"><option value="">Wo: alle Clubs/Orte</option><option value="(unbekannt)" ${st.club === '(unbekannt)' ? 'selected' : ''}>(unbekannt)</option>${clubs.filter(Boolean).map((c) => `<option ${c === st.club ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <input class="vaf-in" type="date" data-f="from" value="${esc(st.from)}" title="von"><input class="vaf-in" type="date" data-f="to" value="${esc(st.to)}" title="bis">
          <div style="position:relative"><button type="button" class="vaf-in" data-a="pfdd" style="text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Plattform: ${st.pfs.length ? st.pfs.map((f) => (f === 'none' ? 'Andere / ohne' : pfLabel(f))).map(esc).join(', ') : 'alle'}</button>
            <div data-a="pfmenu" style="display:none;position:absolute;z-index:50;top:100%;right:0;background:#1f1f1f;border:1px solid #444;border-radius:8px;padding:6px 10px;min-width:190px">
              ${[...pfAll.filter((k) => k !== 'other'), 'none'].map((k) => `<label style="display:flex;gap:8px;align-items:center;padding:3px 0;cursor:pointer"><input type="checkbox" data-pfc="${k}" ${st.pfs.includes(k) ? 'checked' : ''}>${k === 'none' ? 'Andere / ohne' : pfBadge(k) + esc(pfLabel(k))}</label>`).join('')}
              <a href="#" data-a="pfall" style="font-size:12px">alle</a></div></div></div>
        <table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:#a6a6a6">
          <th style="cursor:pointer;padding:6px" data-sort="date">Datum ${st.sort === 'date' ? (st.dir < 0 ? '▼' : '▲') : ''}</th><th style="cursor:pointer;padding:6px" data-sort="name">Mitglied ${st.sort === 'name' ? (st.dir < 0 ? '▼' : '▲') : ''}</th><th></th><th>Was</th><th>Wo</th><th>Notiz</th></tr></thead>
          <tbody>${list.map((r, i) => `<tr data-i="${i}" style="border-top:1px solid #2c2c2c;cursor:pointer">
            <td style="padding:6px;white-space:nowrap">${r.t && r.t.date ? deDate(new Date(r.t.date + 'T12:00')) : '–'}</td>
            <td style="padding:6px"><a href="${esc(r.url)}" target="_blank" rel="noopener" class="${r.del ? 'vaf-strike' : ''}" style="${r.inactive ? 'color:#ff7875' : ''}">${esc(r.name)}</a><br><a href="${esc(r.arch)}" style="font-size:12px;color:#a6a6a6">Profil-Archiv</a> · <a href="#" data-also="${i}" style="font-size:12px;color:#a6a6a6">Auch auf …</a>${notesOf(r.p) ? `<div title="${esc(notesOf(r.p))}" style="font-size:12px;color:#8c8c8c;max-width:360px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap">${esc(notesOf(r.p))}</div>` : ''}</td>
            <td style="white-space:nowrap">${fickIcon(r.p.status ? FSTATES[r.p.status].i : 0, 18, true)} ${r.badges.map((b) => { const [pf, n] = b.split('|'); return pfBadge(pf, '', n); }).join('')}</td>
            <td>${esc((r.t && r.t.where) || '')}</td><td>${esc((r.t && r.t.club) || '')}${r.t && r.t.link ? ` <a href="${esc(r.t.link)}" target="_blank" rel="noopener">${pfBadge(r.t.pf || platformOfUrl(r.t.link))}</a>` : ''}</td>
            <td style="color:#a6a6a6">${esc((r.t && r.t.note) || '')}</td></tr>`).join('') || '<tr><td colspan="6" style="padding:12px;color:#8c8c8c">Keine Einträge.</td></tr>'}</tbody></table>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button type="button" class="vaf-big" style="width:auto" data-a="ext">+ Externen Fick zufügen</button>
          <button type="button" class="vaf-big" style="width:auto" data-a="exp">Exportieren</button><button type="button" class="vaf-big" style="width:auto" data-a="imp">Importieren</button></div></div>`;
      el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { st.status = st.status === b.dataset.st ? '' : b.dataset.st; draw(); }));
      el.querySelectorAll('[data-f]').forEach((i) => i.addEventListener('change', () => { st[i.dataset.f] = i.value; draw(); }));
      el.querySelectorAll('[data-sort]').forEach((h) => h.addEventListener('click', () => { if (st.sort === h.dataset.sort) st.dir = -st.dir; else { st.sort = h.dataset.sort; st.dir = h.dataset.sort === 'date' ? -1 : 1; } draw(); }));
      el.querySelectorAll('tr[data-i]').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('a')) return; const r = list[+tr.dataset.i]; if (r.t) editMeet(r.p, r.t); else if (!pm(r.p)) goHash('extern=' + encodeURIComponent(r.p.id)); else editMeet(r.p, null); }));
      const dd = el.querySelector('[data-a=pfmenu]');
      el.querySelector('[data-a=pfdd]').onclick = (e) => { e.stopPropagation(); dd.style.display = dd.style.display === 'none' ? '' : 'none'; };
      dd.querySelectorAll('[data-pfc]').forEach((c) => c.addEventListener('change', () => { const k = c.dataset.pfc; st.pfs = c.checked ? uniq([...st.pfs, k]) : st.pfs.filter((x) => x !== k); draw(); el.querySelector('[data-a=pfmenu]').style.display = ''; }));
      dd.querySelector('[data-a=pfall]').onclick = (e) => { e.preventDefault(); st.pfs = []; draw(); };
      el.querySelectorAll('[data-also]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); addProfileDialog(list[+a.dataset.also].p, () => renderFickList(el)); }));
      el.querySelector('[data-a=ext]').onclick = () => newExternal();
      el.querySelector('[data-a=exp]').onclick = () => exportFick();
      el.querySelector('[data-a=imp]').onclick = () => importFick().then(() => { hideOwn(); routeSettings(); });
    };
    draw();
  }

  // ---------- Kasten im eigenen Profil ----------
  async function ownProfileBox() {
    if (document.getElementById('vaf-own-fick')) return;
    const stat = [...document.querySelectorAll('main h2')].find((h) => /^Statistiken/.test(h.textContent.trim()));
    if (!stat) return;
    let host = stat; while (host.parentElement && host.parentElement.tagName !== 'MAIN' && host.parentElement.children.length < 3) host = host.parentElement;
    const persons = await Fick.all();
    const counts = Object.fromEntries(Object.keys(FSTATES).map((k) => [k, persons.filter((p) => p.status === k).length]));
    const last = persons.filter(isFickDone).map((p) => ({ p, t: [...(p.meets || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] })).filter((x) => x.t)
      .sort((a, b) => (b.t.date || '').localeCompare(a.t.date || '')).slice(0, 3);
    const box = document.createElement('div');
    box.id = 'vaf-own-fick'; box.className = host.className; box.dataset.vafSkip = '1';
    const rowsH = await Promise.all(last.map(async ({ p, t }) => {
      const img = pm(p) ? await Images.get(pm(p).uid) : (p.ext && p.ext.img) || '';
      const name = (p.main && p.main.nick) || (p.ext && p.ext.name);
      return `<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><img src="${esc(img)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:#3a3a3a"><a href="${pm(p) ? esc(profileUrl(name)) : esc(foreignUrl(p) || '/setting/profile#extern=' + encodeURIComponent(p.id))}" target="_blank">${esc(name)}</a><span style="color:#a6a6a6">${esc([t.where, t.club].filter(Boolean).join(' · '))} · ${t.date ? deDate(new Date(t.date + 'T12:00')) : ''}</span></div>`;
    }));
    box.innerHTML = `<div><h2>Fickliste <span style="font-size:12px;font-weight:400;color:#8c8c8c">· Nur für dich sichtbar</span></h2></div>
      <div style="display:flex;gap:14px;margin:6px 0 10px">${Object.entries(FSTATES).map(([k, v]) => `<a href="/setting/profile#fickliste" data-st="${k}" title="${esc(v.label)}" style="color:#e8e8e8">${fickIcon(v.i, 18, true)} ${counts[k]}</a>`).join('')}</div>
      <div style="color:#a6a6a6;font-size:12px">Letzte Ficks</div>${rowsH.join('') || '<div style="color:#8c8c8c">–</div>'}
      <a href="/setting/profile#fickliste" style="display:inline-block;margin-top:8px">Zu meiner Fickliste</a>`;
    box.querySelectorAll('[data-st]').forEach((a) => a.addEventListener('click', () => { try { sessionStorage.setItem('vaf_fl', JSON.stringify({ status: a.dataset.st })); } catch {} }));
    host.before(box);
  }

  // ---------- Export / Import mit automatischem Verknüpfen ----------
  async function cryptKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(norm(pass)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function encryptJSON(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await cryptKey(pass, salt);
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
    let bin = ''; for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { alg: 'AES-GCM/PBKDF2', salt: b64(salt), iv: b64(iv), data: btoa(bin) };
  }
  async function decryptJSON(enc, pass) {
    const key = await cryptKey(pass, unb64(enc.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, key, unb64(enc.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function exportFick() {
    const me = Me.get() || await loadMe();
    const persons = await Fick.all();
    for (const p of persons) for (const x of p.profiles || []) { if (isDead(x)) x.dead = true; delete x.deleted; delete x.gone; }
    for (const p of persons) if (pm(p)) { const m = await Members.get(pm(p).uid); if (m && m.nick) { p.main.nick = m.nick; } }
    const payload = { format: 'fickliste', version: 1, platform: 'poppen', exported: new Date().toISOString(), persons };
    const enc = await encryptJSON(payload, me.nick);
    download(`fickliste-poppen-${stamp()}.json`, JSON.stringify({ format: 'fickliste-enc', platform: 'poppen', account: me.nick, ...enc }));
    toast(`${persons.length} Einträge exportiert (verschlüsselt mit deinem Nick).`);
  }
  async function readFickFile(text) {
    let j = JSON.parse(text);
    if (j.format === 'fickliste-enc' || j.alg) {
      let pass = (Me.get() || {}).nick || '';
      for (let i = 0; i < 3; i++) {
        try { return await decryptJSON(j, pass); }
        catch { pass = W.prompt(`Entschlüsseln fehlgeschlagen. Mit welchem Nick wurde die Datei erstellt?${j.account ? ` (Datei von: ${j.account})` : ''}`, j.account || ''); if (!pass) return null; }
      }
      return null;
    }
    return j;
  }
  async function importFick(...a) { return Prio.run('Fickliste-Import', () => importFick_(...a)); }
  async function importFick_() {
    const text = await pickFile();
    if (!text) return;
    let data;
    try { data = await readFickFile(text); } catch (e) { toast('Datei nicht lesbar: ' + esc(e.message)); return; }
    if (!data || !Array.isArray(data.persons)) { toast(Array.isArray(data && data.templates) ? 'Das ist eine Textvorlagen-Datei (Fickliste → Meine Fickliste, Textvorlagen → Messenger).' : 'Keine Fickliste in der Datei.'); return; }
    const from = data.platform || 'joyclub';
    const local = await Fick.all();
    const mainLink = (p) => (!p.main ? null : pm(p) ? { pf: 'poppen', url: 'https://www.poppen.de' + pathOfName(p.main.nick || '') } : p.main.url ? { pf: p.main.pf, url: p.main.url } : null);
    const keysOf = (p) => uniq([...(p.profiles || []), mainLink(p)].map(linkKey).filter(Boolean));
    const index = new Map();
    for (const p of local) for (const k of keysOf(p)) { if (!index.has(k)) index.set(k, new Set()); index.get(k).add(p.id); }
    const sum = { neu: 0, verknuepft: 0, konflikt: 0, gleich: 0 };
    for (const ip0 of data.persons) {
      const ip = clone(ip0);
      ip.origin = ip.origin || from;
      // Herkunfts-Profil als Link aufnehmen
      const hits = new Set();
      for (const k of keysOf(ip)) for (const id of index.get(k) || []) hits.add(id);
      let target = null;
      if (hits.size === 1) target = local.find((p) => p.id === [...hits][0]);
      else if (hits.size > 1) {
        sum.konflikt++;
        const names = [...hits].map((id) => { const p = local.find((x) => x.id === id); return (p.main && p.main.nick) || (p.ext && p.ext.name) || id; });
        const v = await ask('Import – Konflikt', `<p>Der Eintrag <b>${esc((ip.main && ip.main.nick) || (ip.ext && ip.ext.name) || '?')}</b> passt zu mehreren Personen: ${names.map(esc).join(', ')}.</p>`, [
          { label: 'Zusammenführen', value: 'merge', primary: true }, { label: 'Getrennt lassen', value: 'sep', focus: true, cancel: true }]);
        if (v === 'merge') { target = local.find((p) => p.id === [...hits][0]); for (const id of [...hits].slice(1)) { const o = local.find((p) => p.id === id); mergeFick(target, o); await Fick.del(id); } }
      }
      if (target) {
        const before = JSON.stringify([target.status, target.meets, target.profiles]);
        mergeFick(target, ip);
        if (JSON.stringify([target.status, target.meets, target.profiles]) === before) sum.gleich++; else { sum.verknuepft++; await Fick.put(target); }
      } else if (!hits.size || hits.size > 1) {
        const np = { ...ip, id: from === 'poppen' && ip.id ? ip.id : `i:${from}:${(ip.id || Math.random().toString(36).slice(2))}`, imported: from };
        if (!pm(np)) np.ext = np.ext || { name: (np.main && np.main.nick) || '?' };
        await Fick.put(np); local.push(np); sum.neu++;
        for (const k of keysOf(np)) { if (!index.has(k)) index.set(k, new Set()); index.get(k).add(np.id); }
      }
    }
    // Importierte Einträge mit poppen-Profil gleich verbinden, wenn das Mitglied bekannt ist (sonst beim nächsten Profilaufruf)
    let adopted = 0;
    for (const q of await Fick.all()) {
      if (pm(q)) continue;
      for (const x of (q.profiles || []).filter((y) => y.pf === 'poppen' && y.url)) {
        const mm = /poppen\.de\/p\/([^/?#]+)/i.exec(x.url);
        const nick = mm ? decodeURIComponent(mm[1]) : '';
        const mem = x.uid ? await Members.get(x.uid) : nick ? await Members.byNick(nick) : null;
        if (mem && await Fick.adopt(mem.uid, mem.nick || nick)) { adopted++; break; }
      }
    }
    if (adopted) sum.verknuepft += adopted;
    await ask('Import fertig', `<div class="vaf-stats"><span>Neu</span><b>${sum.neu}</b><span>Automatisch verknüpft</span><b>${sum.verknuepft}</b><span>Konflikte</span><b>${sum.konflikt}</b><span>Unverändert</span><b>${sum.gleich}</b></div>`, [{ label: 'OK', value: 1, primary: true, focus: true }]);
  }
  // b in a zusammenführen: Status = zuletzt geändert, Treffen und Profile vereinigen
  function mergeFick(a, b) {
    // Anmerkungen: notes (sonst joy.notes); neuerer Stand gewinnt, leere Seite übernimmt
    {
      const bn = b.notes != null ? b.notes : (b.joy && b.joy.notes != null ? b.joy.notes : null);
      if (bn != null) {
        const an = notesOf(a);
        if (!an || ((b.notesAt || 0) > (a.notesAt || 0) && bn !== an)) {
          if (String(bn).length > NOTES_MAX) log(`Anmerkungen gekürzt (${String(bn).length} → ${NOTES_MAX} Zeichen)`);
          a.notes = String(bn).slice(0, NOTES_MAX); a.notesAt = b.notesAt || a.notesAt || now(); if (b.notesBy) a.notesBy = b.notesBy; delete a.note;
        }
      }
    }
    if ((b.statusAt || 0) > (a.statusAt || 0)) { a.status = b.status; a.statusAt = b.statusAt; }
    const mk = (t) => `${t.pf || ''}|${t.uid || ''}|${t.date || ''}|${norm(t.where)}|${norm(t.club)}|${linkKey({ url: t.link })}`;
    const seenM = new Set((a.meets || []).map(mk));
    a.meets = [...(a.meets || [])];
    for (const t of b.meets || []) if (!seenM.has(mk(t))) { a.meets.push({ ...t, id: t.id || 'm' + Math.random().toString(36).slice(2) }); seenM.add(mk(t)); }
    const seenP = new Set((a.profiles || []).map(linkKey));
    a.profiles = [...(a.profiles || [])];
    for (const p of b.profiles || []) {
      const k = linkKey(p);
      if (!k) continue;
      if (!seenP.has(k)) { a.profiles.push({ ...p }); seenP.add(k); continue; }
      const x = a.profiles.find((y) => linkKey(y) === k);
      if ('status' in p && (p.statusAt || 0) > (x.statusAt || 0)) { x.status = p.status; x.statusAt = p.statusAt; }
      if ('sync' in p && !('sync' in x)) x.sync = p.sync;
      for (const f of Object.keys(p)) if (!(f in x)) x[f] = p[f];          // unbekannte Felder durchreichen
    }
    if (b.main && !a.main) a.main = { ...b.main };
    else if (b.main && b.main.url && a.main && (b.main.pf || 'poppen') !== (a.main.pf || 'poppen')) {
      // fremdes Hauptprofil der anderen Seite als Profil behalten
      const k = linkKey(b.main);
      if (k && !seenP.has(k)) { a.profiles.push({ pf: b.main.pf, url: b.main.url, name: b.main.nick || '', uid: b.main.uid, main: true }); seenP.add(k); }
    }
    for (const f of Object.keys(b)) if (!(f in a)) a[f] = clone(b[f]);      // unbekannte Felder durchreichen
    a.history = [...(a.history || []), ...(b.history || []).map((h) => ({ ...h, what: h.what + ' (importiert)' }))].sort((x, y) => x.at - y.at).slice(-200);
    if (b.ext && !a.main) a.ext = { ...(b.ext || {}), ...(a.ext || {}) };
    return a;
  }

  // =====================================================================================
  // Figur: „Kurvig“ → „Mollig“, „Plus-size“ → „Mastschwein“ (überall), Zusatzoption „Qualle“ (Suche),
  // Vermessung über die Größen-/Gewichtsfilter der Suche, Badges, Ausblenden, Sortierung
  // =====================================================================================
  const FIG_RENAME = { 'Kurvig': 'Mollig', 'Plus-size': 'Mastschwein', 'Plus-Size': 'Mastschwein' };
  const FIG_MODES = { mollig: { min: 30, hide: 0 }, mastschwein: { min: 35, hide: 35 }, qualle: { min: 40, hide: 40 } };
  const BANDS = [[40, 'Qualle'], [35, 'Mastschwein'], [30, 'mollig']];

  function renameTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue.trim();
      if (FIG_RENAME[t] && !(n.parentElement && n.parentElement.closest('input, textarea, [contenteditable]'))) n.nodeValue = n.nodeValue.replace(t, FIG_RENAME[t]);
    }
    if (root.querySelectorAll) for (const e of root.querySelectorAll('[title="Kurvig"], [title="Plus-size"], [title="Plus-Size"]')) e.setAttribute('title', FIG_RENAME[e.getAttribute('title')]);
  }

  // ---------- „Qualle“ in der Klappliste der Suche ----------
  const qualleOn = () => location.pathname.startsWith('/search') && G.get('qualle', false);
  function qualleOption() {
    for (const dd of document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')) {
      const opts = [...dd.querySelectorAll('.ant-select-item-option')];
      const mast = opts.find((o) => !o.classList.contains('vaf-qualle') && /^(Mastschwein|Plus-size)$/i.test(o.textContent.trim()));
      if (!mast || !opts.some((o) => /^Schlank$/.test(o.textContent.trim()))) continue;
      if (!location.pathname.startsWith('/search')) continue;
      let q = dd.querySelector('.vaf-qualle');
      if (!q) {
        q = mast.cloneNode(true);
        q.classList.add('vaf-qualle');
        q.classList.remove('ant-select-item-option-selected', 'ant-select-item-option-active');
        q.setAttribute('title', 'Qualle');
        const c = q.querySelector('.ant-select-item-option-content'); if (c) c.textContent = 'Qualle';
        q.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); }, true);
        q.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          G.set('qualle', true);
          const m2 = [...dd.querySelectorAll('.ant-select-item-option:not(.vaf-qualle)')].find((o) => /Mastschwein|Plus-size/i.test(o.textContent));
          if (m2) { m2.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); m2.click(); }
          setTimeout(qualleDisplay, 100);
        }, true);
        mast.after(q);
        // andere Auswahl → Qualle aus
        for (const o of opts) if (!o.classList.contains('vaf-qualle')) o.addEventListener('click', () => G.set('qualle', false), true);
      }
      const sel = qualleOn();
      q.classList.toggle('ant-select-item-option-selected', sel);
      mast.classList.toggle('ant-select-item-option-selected', !sel && mast.classList.contains('ant-select-item-option-selected'));
    }
    qualleDisplay();
  }
  function qualleDisplay() {
    if (!qualleOn()) return;
    for (const it of document.querySelectorAll('.ant-select-selection-item')) {
      if (/^(Mastschwein|Plus-size)$/i.test(it.textContent.trim())) { it.textContent = 'Qualle'; it.title = 'Qualle (sucht „Plus-size“ und blendet unter BMI 40 aus)'; }
    }
  }

  // ---------- Körpermaße im Gedächtnis ----------
  const bmiOf = (h, w) => w / ((h / 100) ** 2);
  const wFor = (bmi, h) => Math.ceil(bmi * (h / 100) ** 2);
  function bodyInfo(m, s = S()) {
    if (!m || !m.body || !m.body[0]) return null;
    const b = m.body[0];
    if (now() - b.at > s.expert.bodyValidDays * DAY) return null;
    const lo = bmiOf(b.h, b.wlo), hi = bmiOf(b.h, b.whi);
    return { h: b.h, wlo: b.wlo, whi: b.whi, bmi: b.wlo === b.whi ? lo : lo, exact: b.wlo === b.whi, lo, hi };
  }
  const bandOf = (bmi) => (BANDS.find(([t]) => bmi >= t) || [0, ''])[1];
  // Sortier-/Filterwert eines Mitglieds in einem Figur-Modus (UNKNOWN = niedrigster Wert der Suche, 0 kg)
  function figKey(m, mode) {
    const bi = bodyInfo(m);
    if (!bi) return { bmi: FIG_MODES[mode].min, w: 0, unknown: true };
    return { bmi: Math.floor(bi.lo * 10) / 10, w: bi.wlo, unknown: false };
  }

  // ---------- Suchantworten umsortieren und filtern ----------
  let lastFig = null;   // { mode, payload, key }
  function figModeOf(body) {
    if (!body || !Array.isArray(body.figure) || !body.figure.length) return null;
    if (body.figure.includes(6)) return G.get('qualle', false) ? 'qualle' : 'mastschwein';
    if (body.figure.includes(5)) return 'mollig';
    return null;
  }
  onApi(/^user\/search$/, null, (data, info) => {
    if (!location.pathname.startsWith('/search')) return null;
    if (info.body && info.body.size_min === info.body.size_max && info.body.size_min !== 130) return null;   // eigene Vermessungs-Abfrage
    const mode = figModeOf(info.body);
    if (!mode) { lastFig = null; return null; }
    const { page, limit, ...rest } = info.body;
    const key = JSON.stringify({ ...rest, q: mode });
    lastFig = { mode, payload: rest, key };
    if (!Measure.done.has(key)) setTimeout(() => Measure.start(rest, mode, key), 500);
    const users = (data && data.users) || [];
    const cache = Members.cached();
    const withKey = users.map((u, i) => ({ u, i, k: figKey(cache.get(String(u.uid)), mode) }));
    const hide = FIG_MODES[mode].hide;
    const kept = withKey.filter((x) => x.k.unknown || x.k.bmi >= hide);
    kept.sort((a, b) => b.k.bmi - a.k.bmi || b.k.w - a.k.w || a.i - b.i);
    return { ...data, users: kept.map((x) => x.u) };
  });

  // ---------- Vermessung im Hintergrund ----------
  const Measure = {
    done: new Set(), running: false, stop: false,
    async start(payload, mode, key) {
      if (this.running || this.done.has(key)) return;
      this.running = true; this.stop = false;
      if (!(await Lock.take('measure', key))) { this.running = false; return; }
      const tt = toast('Figur-Badges: vermesse Größe und Gewicht über die Suchfilter …', 0);
      const ctx = { stop: () => this.stop, step: () => {} };
      try {
        const ths = mode === 'mollig' ? [30, 35, 40] : mode === 'mastschwein' ? [35, 40] : [40];
        const base = { ...payload, weight_min: 0, weight_max: 300 };
        const s = S();
        const all = new Map();       // uid → { h, wlo, whi }
        let heights = 0;
        for (let h = 130; h <= 220 && !this.stop; h++) {
          const atH = new Set();
          await searchAll({ ...base, size_min: h, size_max: h }, ctx, async (users) => { for (const u of users) { atH.add(u.uid); all.set(u.uid, { h, wlo: 0, whi: 300 }); } });
          if (!atH.size) continue;
          heights++;
          tt.innerHTML = `Figur-Badges: vermesse … <b>${h} cm</b> (${fmtN(all.size)} Mitglieder)`;
          // grobe Bänder
          let prev = null;
          for (const T of ths) {
            const inT = new Set();
            await searchAll({ ...base, size_min: h, size_max: h, weight_min: wFor(T, h) }, ctx, async (users) => { for (const u of users) inT.add(u.uid); });
            for (const uid of atH) {
              const b = all.get(uid);
              if (inT.has(uid)) b.wlo = Math.max(b.wlo, wFor(T, h));
              else b.whi = Math.min(b.whi, wFor(T, h) - 1);
            }
            prev = inT;
            if (!inT.size) break;
          }
          // feine Bänder (ganzzahliger BMI) nur für noch nicht vermessene Treffer ab der untersten Grenze
          const pending = new Set([...atH].filter((uid) => { const b = all.get(uid); const m = Members.cached().get(uid); return b.wlo >= wFor(ths[0], h) && !bodyInfo(m); }));
          for (let k = ths[0]; pending.size && k < 90 && !this.stop; k++) {
            const lo = wFor(k, h), hi = wFor(k + 1, h) - 1;
            if (lo > 300) break;
            await searchAll({ ...base, size_min: h, size_max: h, weight_min: lo, weight_max: Math.min(300, hi) }, ctx, async (users) => {
              for (const u of users) { const b = all.get(u.uid); if (b) { b.wlo = Math.max(b.wlo, lo); b.whi = Math.min(b.whi, hi); } pending.delete(u.uid); }
            });
          }
          for (const uid of atH) {
            const b = all.get(uid);
            await Members.update(uid, (m) => {
              const old = m.body && m.body[0];
              if (old && old.src === 'Profil' && now() - old.at < s.expert.bodyValidDays * DAY) return;
              const keepFine = old && old.h === h && old.wlo >= b.wlo && old.whi <= b.whi && now() - old.at < s.expert.bodyValidDays * DAY;
              m.body = [keepFine ? old : { h, wlo: b.wlo, whi: b.whi, at: now() }];
              delete m.bodyUnk;
            });
          }
          markSearchFig();
        }
        // in der eigentlichen Suche, aber in keiner Größen-Suche → UNKNOWN
        if (!this.stop) {
          await searchAll(base, ctx, async (users) => { for (const u of users) if (!all.has(u.uid)) await Members.update(u.uid, (m) => { if (!m.body) m.bodyUnk = now(); }); });
          this.done.add(key);
        }
        tt.innerHTML = `Figur-Badges: <b>fertig</b> – ${fmtN(all.size)} Mitglieder vermessen. <a href="#" id="vaf-fig-reload" style="color:#ffc21a">Liste neu sortieren</a>`;
        const a = document.getElementById('vaf-fig-reload'); if (a) a.onclick = (e) => { e.preventDefault(); location.reload(); };
        setTimeout(() => tt.remove(), 20000);
      } catch (e) { tt.textContent = 'Figur-Vermessung abgebrochen: ' + e.message; setTimeout(() => tt.remove(), 8000); }
      finally { this.running = false; Lock.release('measure'); markSearchFig(); }
    },
  };

  // ---------- Badges auf der Suchseite ----------
  async function markSearchFig() {
    if (!location.pathname.startsWith('/search') || !lastFig) return;
    const mode = lastFig.mode;
    const min = FIG_MODES[mode].min, hide = FIG_MODES[mode].hide;
    for (const x of cardsOn(document)) {
      const m = x.uid ? await Members.get(x.uid) : await Members.byNick(x.nick);
      const bi = bodyInfo(m);
      let b = x.card.querySelector('.vaf-fig');
      if (bi && bi.lo < hide) { x.card.style.display = 'none'; continue; }
      x.card.style.display = '';
      const bmi = bi ? Math.floor(bi.lo) : null;
      const band = bi ? bandOf(bi.lo) : '';
      if (!bi || bi.lo < min || !band) { if (b) b.remove(); continue; }
      if (!b) { b = document.createElement('div'); b.className = 'vaf-fig vaf-mark'; (x.host || x.card).prepend(b); }
      b.textContent = `${band} · BMI ${bmi}${bi.exact ? '' : '+'}`;
      b.title = `${bi.h} cm · ${bi.exact ? bi.wlo : `${bi.wlo}–${bi.whi}`} kg`;
      b.style.cssText = `background:${band === 'Qualle' ? '#6a1b9a' : band === 'Mastschwein' ? '#ad1457' : '#ef6c00'};color:#fff`;
    }
  }

  function initFigur() {
    renameTextNodes(document.body);
    let t = null;
    new MutationObserver((muts) => {
      for (const mu of muts) for (const n of mu.addedNodes) { if (n.nodeType === 1) renameTextNodes(n); else if (n.nodeType === 3 && n.parentElement) renameTextNodes(n.parentElement); }
      clearTimeout(t); t = setTimeout(() => { qualleOption(); markSearchFig(); }, 200);
    }).observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  // =====================================================================================
  // ---------- Sonderseiten: Wartung, abgemeldet, Login, Werbung, nicht gefunden ----------
  // =====================================================================================
  const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const ssSet = (k, v) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch {} };

  // Welche Art Seite ist gerade zu sehen?
  //   'wartung' | 'login' | 'werbung' | 'notfound' | 'abgemeldet' | 'normal' | 'loading'
  function pageKind(doc = document) {
    const title = doc.title || '';
    const body = doc.body ? (doc.body.textContent || '') : '';
    if (/Wartungszustand/i.test(title) || /routinemäßige Wartungsarbeiten/i.test(body)) return 'wartung';
    const path = (doc.location && doc.location.pathname) || '';
    if (doc.querySelector('input#username') && doc.querySelector('input#password')) return 'login';
    if (path.startsWith('/login')) return 'loading';                       // Login-Formular lädt noch
    if (path.startsWith('/view/announcement/')) return 'werbung';
    const skip = [...doc.querySelectorAll('main a[href="/home"]')].find((a) => norm(a.textContent) === 'skip');
    if (skip) return 'werbung';
    const err = doc.querySelector('main .ant-result-error');
    if (err && /spurlos verschwunden|nicht gefunden/i.test(err.textContent || '')) return 'notfound';
    const header = doc.querySelector('header');
    if (!header) return 'loading';
    if (header.querySelector('a[href="/inbox"]')) return 'normal';
    if (doc.querySelector('a[href="/login"]') || /Neues Konto erstellen/.test(body)) return 'abgemeldet';
    return 'loading';
  }

  const runTarget = () => null;

  // ---------- „Du hast die Regie!“ (/view/announcement/page/1236): immer überspringen ----------
  const isRegie = (path = location.pathname, doc = document) => /^\/view\/announcement\/page\/1236\b/.test(path) ||
    (/^\/view\/announcement\//.test(path) && /Du hast die Regie/i.test((doc.querySelector('main') || {}).textContent || ''));
  function skipRegie() {
    const last = +(ssGet('vaf_regie_at') || 0);
    ssSet('vaf_regie_at', String(now()));
    const ref = document.referrer && document.referrer.startsWith(location.origin) ? document.referrer : '';
    const prev = ssGet('vaf_prev_url') || ssGet('vaf_last_url') || ref;
    // zweiter Treffer innerhalb weniger Sekunden: nicht zurück, sondern auf /home (keine Endlosschleife)
    if (now() - last < 8000 || !prev || /\/view\/announcement\//.test(prev)) { location.replace(location.origin + '/home'); return; }
    if (history.length > 1) history.back(); else location.replace(prev);
  }
  // Seitenwechsel ohne Neuladen beobachten (pushState/replaceState/popstate)
  (() => {
    let cur = location.href;
    const check = () => {
      if (location.href === cur) return;
      if (!/\/view\/announcement\//.test(cur)) ssSet('vaf_prev_url', cur);
      cur = location.href;
      if (isRegie()) skipRegie();
      else setTimeout(() => { if (isRegie()) skipRegie(); }, 1200);    // Überschrift erst nach dem Laden sichtbar
    };
    for (const fn of ['pushState', 'replaceState']) {
      const orig = W.history[fn];
      W.history[fn] = function (...a) { const r = orig.apply(this, a); setTimeout(check, 0); return r; };
    }
    W.addEventListener('popstate', () => setTimeout(check, 0));
  })();

  function specialPanel(title, html) { return toast(`<b>${esc(word())}-Schutz – ${title}</b><br>${html}`, 0); }

  // Wiederaufnahme nach einem Login: wohin wollte dieser Tab?
  function rememberResume() {
    if (G.get('resume', null)) return;
    const url = runTarget() || ssGet('vaf_last_url');
    if (url) G.set('resume', { tab: TAB_ID, url, ts: Date.now() });
  }

  // Gibt true zurück, wenn die Seite eine Sonderseite war und init() nicht weitermachen soll
  async function handleSpecialPage() {
    const kind = await waitFor(() => { const k = pageKind(); return k === 'loading' ? null : k; }, 8000) || 'normal';

    if (kind !== 'werbung') ssSet('vaf_ad_count', null);

    if (kind === 'normal') {
      ssSet('vaf_last_url', location.href);
      ssSet('vaf_notfound_reload', null);
      // Nach erfolgreichem Login dort weitermachen, wo der Tab unterbrochen wurde
      const r = G.get('resume', null);
      if (r && r.tab === TAB_ID) {
        G.del('resume');
        if (Date.now() - r.ts < 60 * 60000 && r.url && r.url !== location.href) {
          specialPanel('wieder eingeloggt', 'Mache weiter, wo ich unterbrochen wurde …');
          await sleep(1500);
          location.href = r.url;
          return true;
        }
      }
      return false;
    }

    if (kind === 'wartung') {
      const min = S().maintenanceMin;
      const at = new Date(Date.now() + min * 60000);
      const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      specialPanel('Wartung', `poppen.de wird gerade gewartet – alles angehalten.<br>Neuer Versuch um ${hhmm} Uhr.`);
            setTimeout(() => location.reload(), min * 60000);
      return true;
    }

    if (kind === 'abgemeldet') {
      rememberResume();
            specialPanel('Nicht eingeloggt', 'Nicht eingeloggt – bitte <a href="/login" style="color:#ffc21a">anmelden</a>.<br>Danach geht es automatisch weiter.');
      return true;
    }

    if (kind === 'login') {
      rememberResume();
            await handleLoginPage();
      return true;
    }

    if (isRegie() || (kind === 'werbung' && isRegie(location.pathname))) { skipRegie(); return true; }
    if (kind === 'werbung') {
      const n = (+ssGet('vaf_ad_count') || 0) + 1;
      ssSet('vaf_ad_count', String(n));
      if (n >= 3) {
        specialPanel('Werbeseite', 'Die Werbe-Zwischenseite kommt immer wieder – angehalten.<br>Bitte einmal selbst auf „SKIP“ klicken.');
        return true;
      }
      const target = runTarget();
      specialPanel('Werbeseite', 'Werbe-Zwischenseite – wird übersprungen …');
      await sleep(800);
      if (target) { location.href = target; return true; }
      const skip = [...document.querySelectorAll('main a[href="/home"]')].find((a) => norm(a.textContent) === 'skip');
      if (skip) skip.click(); else location.href = location.origin + '/home';
      return true;
    }

    if (kind === 'notfound') {
      // Profilseiten behandelt der jeweilige Lauf selbst (Konto gilt als nicht vorhanden)
      if (/^\/p\/[^/]+$/.test(location.pathname.replace(/\/+$/, ''))) return false;
      const key = location.pathname;
      if (ssGet('vaf_notfound_reload') !== key) {
        ssSet('vaf_notfound_reload', key);
        specialPanel('Seite nicht gefunden', 'Seite nicht gefunden – lade einmal neu …');
        await sleep(1500);
        location.reload();
        return true;
      }
      specialPanel('Seite nicht gefunden', 'Diese Seite gibt es nicht (auch nach dem Neuladen) – angehalten.');
      return true;
    }
    return false;
  }

  // Login-Seite: "Angemeldet bleiben" einschalten, bei ausgefüllten Feldern einmal "Anmelden" klicken
  async function handleLoginPage() {
    await sleep(1500);                                   // dem Browser Zeit für das automatische Ausfüllen geben
    const sw = (() => {
      const lab = [...document.querySelectorAll('span, label, div')].find((e) => e.children.length === 0 && norm(e.textContent) === 'angemeldet bleiben');
      let box = lab;
      for (let i = 0; i < 5 && box; i++, box = box.parentElement) {
        const b = box.querySelector('button[role=switch]');
        if (b) return b;
      }
      return null;
    })();
    if (sw && sw.getAttribute('aria-checked') !== 'true') { sw.click(); await sleep(400); }

    const user = document.querySelector('input#username');
    const pass = document.querySelector('input#password');
    const autofilled = (el) => { try { return el.matches(':autofill') || el.matches(':-webkit-autofill'); } catch { return false; } };
    const filled = (el) => !!el && (el.value.trim() !== '' || autofilled(el));
    const submit = () => {
      const f = (pass && pass.closest('form')) || document.querySelector('main form');
      return f && [...f.querySelectorAll('button')].find((b) => norm(b.textContent) === 'anmelden');
    };
    const mark = () => {
      const b = submit();
      if (b) { b.style.boxShadow = '0 0 0 4px #ffc21a'; b.scrollIntoView({ block: 'center' }); }
    };

    if (!filled(user) || !filled(pass)) {
      specialPanel('Nicht eingeloggt', 'Nicht eingeloggt – bitte anmelden.<br>Danach geht es automatisch weiter.');
      mark();
      return;
    }
    const lastTry = G.get('login_try', 0);
    if (S().autoLogin && Date.now() - lastTry > S().autoLoginPauseMin * 60000) {
      G.set('login_try', Date.now());
      specialPanel('Login', 'Melde mich an …');
      const b = submit();
      if (b) b.click();
      // Hat es geklappt, verlässt die Seite das Login-Formular (dann übernimmt init() auf der neuen Seite)
      if (await waitFor(() => !document.querySelector('input#password'), 8000)) return;
    }
    specialPanel('Login', 'Bitte einmal auf <b>Anmelden</b> klicken – danach geht es automatisch weiter.');
    mark();
  }

  // =====================================================================================
  // Sichern / Wiederherstellen, Gedächtnis exportieren / importieren, 99-Jährige, Umstellung von 1.x
  // =====================================================================================
  async function backupAll() {
    const me = Me.get() || await loadMe();
    if (!me || !me.nick) { toast('Eigenes Profil unbekannt – bitte einmal neu laden.'); return; }
    const tt = toast('Sichere alle Daten …', 0);
    await Members.flush();
    const gm = {};
    for (const k of GM_listValues()) if (k.startsWith('vaf2_') && !k.startsWith('vaf2_lock_')) gm[k] = GM_getValue(k);
    const out = { format: 'opa-schutz-backup', version: VERSION, at: new Date().toISOString(), account: me.nick, gm, stores: {} };
    for (const st of ['members', 'queue', 'kv', 'images', 'archive']) out.stores[st] = await DB.all(st);
    out.fick = await encryptJSON(await DB.all('fick'), me.nick);
    download(`opa-schutz-sicherung-${stamp()}.json`, JSON.stringify(out));
    tt.innerHTML = `Gesichert: ${fmtN(out.stores.members.length)} Mitglieder, ${fmtN(out.stores.queue.length)} auf der Warteliste.`;
    setTimeout(() => tt.remove(), 6000);
  }
  async function restoreAll() {
    const text = await pickFile();
    if (!text) return;
    let d;
    try { d = JSON.parse(text); } catch { toast('Datei nicht lesbar.'); return; }
    if (d.format !== 'opa-schutz-backup') { toast('Das ist keine Sicherung des Opa-Schutzes.'); return; }
    const ok = await ask('Alle Daten wiederherstellen', `<p>Alle Daten werden durch die Sicherung vom ${esc(deDateTime(d.at))} (${esc(d.account || '?')}) ersetzt.</p>`, [
      { label: 'Wiederherstellen', value: true, primary: true }, { label: 'Abbrechen', value: false, focus: true, cancel: true }]);
    if (!ok) return;
    let fick = null;
    let pass = (Me.get() || {}).nick || d.account || '';
    for (let i = 0; i < 3 && d.fick; i++) {
      try { fick = await decryptJSON(d.fick, pass); break; }
      catch { pass = W.prompt('Die Fickliste ist mit dem Nick verschlüsselt, der beim Sichern galt. Welcher war es? (leer = ohne Fickliste wiederherstellen)', d.account || ''); if (!pass) break; }
    }
    for (const k of GM_listValues()) if (k.startsWith('vaf2_') && !k.startsWith('vaf2_lock_')) GM_deleteValue(k);
    for (const [k, v] of Object.entries(d.gm || {})) GM_setValue(k, v);
    for (const st of ['members', 'queue', 'kv', 'images', 'archive']) { await DB.clear(st); await DB.putMany(st, d.stores[st] || []); }
    if (fick) { await DB.clear('fick'); await DB.putMany('fick', fick); }
    Members.cached().clear();
    loadSettings();
    toast(`Wiederhergestellt${fick ? '' : ' (ohne Fickliste)'}. Seite wird neu geladen …`);
    setTimeout(() => location.reload(), 1500);
  }

  // Nur das Wissen über andere Mitglieder (für ein zweites Konto)
  const MEM_FIELDS = ['uid', 'nick', 'nl', 'nicks', 'g', 'ages', 'ageAt', 'birth', 'by', 'zod', 'pay', 'city', 'first', 'last', 'lastLogin', 'body', 'bodyUnk', 'fig', 'del', 'active', 'avatar'];
  async function exportMemory(withImages) {
    const tt = toast('Exportiere Gedächtnis …', 0);
    const list = [];
    await Members.each((m) => { const o = {}; for (const f of MEM_FIELDS) if (m[f] !== undefined) o[f] = m[f]; list.push(o); });
    const out = { format: 'opa-schutz-gedaechtnis', version: VERSION, at: new Date().toISOString(), members: list };
    if (withImages) out.images = await DB.all('images');
    download(`opa-schutz-gedaechtnis-${stamp()}.json`, JSON.stringify(out));
    tt.innerHTML = `${fmtN(list.length)} Mitglieder exportiert${withImages ? ` (${fmtN(out.images.length)} Bilder)` : ''}.`;
    setTimeout(() => tt.remove(), 6000);
  }
  async function importMemory() {
    const text = await pickFile();
    if (!text) return;
    let d;
    try { d = JSON.parse(text); } catch { toast('Datei nicht lesbar.'); return; }
    if (d.format !== 'opa-schutz-gedaechtnis') { toast('Das ist kein Gedächtnis-Export.'); return; }
    const tt = toast('Mische Gedächtnis …', 0);
    let neu = 0, erg = 0, eig = 0, i = 0;
    for (const x of d.members || []) {
      if (!x.uid) continue;
      if (++i % 500 === 0) tt.textContent = `Mische Gedächtnis … ${fmtN(i)}`;
      const m = await Members.get(x.uid);
      if (!m) { Members.put({ ...x, nl: norm(x.nick) }); neu++; continue; }
      const before = JSON.stringify(m);
      if ((x.last || 0) > (m.last || 0) && x.nick && x.nick !== m.nick) { m.nicks = uniq([...(m.nicks || []), m.nick]); m.nick = x.nick; m.nl = norm(x.nick); }
      m.nicks = uniq([...(m.nicks || []), ...(x.nicks || [])]).filter((n) => n !== m.nick);
      if (x.birth && x.birth.length) m.birth = m.birth && m.birth.length === x.birth.length ? m.birth.map((b, k) => intersect(b, x.birth[k]) || b) : (m.birth && m.birth.length ? m.birth : x.birth);
      for (const f of ['zod', 'by', 'g', 'pay', 'city', 'fig']) if (m[f] === undefined && x[f] !== undefined) m[f] = x[f];
      if (x.body && (!m.body || (x.body[0].at || 0) > (m.body[0].at || 0))) m.body = x.body;
      if ((x.lastLogin || 0) > (m.lastLogin || 0)) m.lastLogin = x.lastLogin;
      if ((x.ageAt || '') > (m.ageAt || '')) { m.ages = x.ages; m.ageAt = x.ageAt; }
      if (x.del && !m.del) m.del = x.del;
      if (JSON.stringify(m) !== before) { Members.put(m); erg++; } else eig++;
    }
    for (const im of d.images || []) {
      const cur = await DB.get('images', im.uid);
      if (!cur || (im.at || 0) > (cur.at || 0)) await DB.put('images', im);
    }
    await Members.flush();
    tt.innerHTML = `Gedächtnis gemischt: <b>${fmtN(neu)}</b> neu, <b>${fmtN(erg)}</b> ergänzt, <b>${fmtN(eig)}</b> eigene behalten.`;
    setTimeout(() => tt.remove(), 10000);
  }
  async function export99() {
    const l = await KV.get('log99', {});
    const lines = Object.values(l).map((x) => 'https://www.poppen.de' + pathOfName(x.nick)).sort();
    download(`poppen-99-jaehrige-${stamp()}.txt`, lines.join('\r\n') + '\r\n', 'text/plain');
  }

  // ---------- Umstellung von Version 1.x ----------
  // Die alten Listen kannten keine Benutzer-IDs. Sie werden ins neue Gedächtnis übernommen, sobald
  // ein Mitglied mit ID auftaucht (Blockierliste, Listen); die alten Daten bleiben erhalten.
  let legacy = null;
  async function migrateV1() {
    if (G.get('migrated_v1', false)) { legacy = await KV.get('legacy', null); return; }
    const done = GM_getValue('vaf_done', null);
    if (!Array.isArray(done)) { G.set('migrated_v1', true); return; }
    const src = GM_getValue('vaf_done_src', {}) || {}, time = GM_getValue('vaf_done_time', {}) || {}, birth = GM_getValue('vaf_birth', {}) || {};
    const L = { done: {}, birth: {} };
    for (const p of done) L.done[slugOf(p)] = { src: src[p] || '', at: time[p] ? Date.parse(time[p]) : 0 };
    for (const [p, b] of Object.entries(birth)) L.birth[slugOf(p)] = b.persons || [];
    await KV.set('legacy', L);
    legacy = L;
    // alte Whitelist-Einträge aus dem Quelltext stehen bereits in den Standardwerten
    G.set('migrated_v1', true);
    log(`Umstellung von 1.x: ${done.length} Erledigte, ${Object.keys(L.birth).length} Geburtszeiträume übernommen.`);
  }
  // beim ersten Sehen eines Mitglieds: alte Daten einfließen lassen
  Bus.on('legacy-check', () => {});
  async function legacyApply(m) {
    if (!legacy || !m || !m.nl) return;
    const b = legacy.birth[m.nl];
    if (b && b.length && m.birth && m.birth.length === b.length) m.birth = m.birth.map((x, i) => intersect(x, b[i]) || x);
    const d = legacy.done[m.nl];
    if (d && !m.blk && !m.unblk) m.blk = { at: d.at || now(), src: d.src || 'Sync', note: '', opa: true, legacy: true };
  }

  // =====================================================================================
  // Messenger: Abschnitt „Termine“ (zwischen „Aktionen“ und „Anhänge“ in der rechten Spalte).
  // Quelle: lokale Textdatei (File System Access API, nur Chrome/Edge), Zeilen „wann - wo - was - Link“.
  // Gelesen wird von oben, vergangene Termine werden übersprungen, Schluss nach 5 kommenden.
  // =====================================================================================
  const TERM_KEY = 'termine_file';
  const TERM_MAX = 5;
  const termSupported = () => typeof W.showOpenFilePicker === 'function';

  // „wann“ am Zeilenanfang: Datum oder Zeitraum (14.09.2026 · 14.09.-23.09.2026 · 14.-23.09.2026 · 28.12.2026 - 02.01.2027)
  const TERM_D = '(\\d{1,2})\\.(?:(\\d{1,2})\\.)?(\\d{4})?';
  const TERM_RE = new RegExp(`^\\s*${TERM_D}(?:\\s*[-–]\\s*${TERM_D})?(?=\\s*(?:[-–]\\s|$))`);
  function parseTermLine(line) {
    const m = TERM_RE.exec(line);
    if (!m) return null;
    const [, d1, m1, y1, d2, m2, y2] = m;
    const year = +(y2 || y1 || new Date().getFullYear());
    const end = d2 ? { d: +d2, m: +(m2 || m1), y: +(y2 || y1 || year) } : { d: +d1, m: +m1, y: +(y1 || year) };
    if (!end.m) return null;
    const endDate = new Date(end.y, end.m - 1, end.d);
    if (endDate.getMonth() !== end.m - 1) return null;                // ungültiges Datum
    const st = { d: +d1, m: +(m1 || end.m), y: +(y1 || (d2 && +(m1 || end.m) > end.m ? end.y - 1 : end.y)) };
    const startDate = new Date(st.y, st.m - 1, st.d);
    const wann = m[0].trim();
    const rest = line.slice(m[0].length).replace(/^\s*[-–]\s*/, '');
    const parts = rest.split(/\s+[-–]\s+/).map((x) => x.trim()).filter(Boolean);
    let link = '';
    if (parts.length > 1 && /^(https?:\/\/|www\.)\S+$/i.test(parts[parts.length - 1])) link = parts.pop();
    const wo = parts.shift() || '';
    const was = parts.join(' - ');
    return { line: line.trim(), wann, wo, was, link, start: startDate, end: endDate, label: [wann, wo, was].filter(Boolean).join(' - ') };
  }
  function upcomingTerms(text) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const out = [];
    let bad = 0;
    for (const raw of String(text).split(/\r?\n/)) {
      if (!raw.trim()) continue;
      const t = parseTermLine(raw);
      if (!t) { bad++; continue; }
      if (t.end < today) continue;                                       // vergangen: überspringen
      out.push(t);
      if (out.length >= TERM_MAX) break;
    }
    // chronologisch; gleiches Datum: Reihenfolge der Datei (stabile Sortierung)
    out.sort((a, b) => a.start - b.start);
    return { list: out, bad };
  }
  // alle gültigen Zeilen (auch vergangene) – zum Ausschreiben verkürzter Termin-Zeilen
  function allTerms(text) { return String(text).split(/\r?\n/).map((l) => (l.trim() ? parseTermLine(l) : null)).filter(Boolean); }
  // JOYclub-Links vereinheitlichen: https://www.joyclub.de/…
  const normJoyLink = (u) => String(u || '').replace(/^(?:https?:\/\/)?(?:www\.)?joyclub\.(de|com)\//i, 'https://www.joyclub.de/');
  const linkCmp = (u) => normJoyLink(u).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

  let termMem = null;                       // zuletzt gewählte Datei (auch falls das Speichern scheitert)
  async function termHandle() {
    if (termMem) return termMem;
    let h = null;
    try { h = await KV.get(TERM_KEY, null); } catch {}
    return h && typeof h.getFile === 'function' ? (termMem = h) : null;
  }
  // Datei wählen (braucht einen Klick)
  async function pickTermFile() {
    if (!termSupported()) { toast('Das geht nur in Chrome oder Edge.'); return null; }
    try {
      const [h] = await W.showOpenFilePicker({ multiple: false, types: [{ description: 'Textdatei', accept: { 'text/plain': ['.txt', '.text', '.md'] } }] });
      termMem = h;
      try { await KV.set(TERM_KEY, h); } catch (e) { warn('Termine: Datei merken', e); }
      return h;
    } catch (e) { if (e && e.name !== 'AbortError') warn('Termine', e); return null; }
  }
  // Inhalt lesen; ask=true darf nach der Erlaubnis fragen (nur aus einem Klick heraus)
  async function readTermFile(ask) {
    const h = await termHandle();
    if (!h) return { state: 'none' };
    let perm = 'granted';
    try { perm = await h.queryPermission({ mode: 'read' }); } catch {}
    if (perm !== 'granted' && ask) { try { perm = await h.requestPermission({ mode: 'read' }); } catch {} }
    if (perm !== 'granted') return { state: 'perm', name: h.name };
    try { const f = await h.getFile(); return { state: 'ok', name: h.name, text: await f.text() }; }
    catch (e) { return { state: 'error', name: h.name, error: e.message || String(e) }; }
  }

  // Zeile in das Eingabefeld des Chats einfügen (nicht senden)
  function insertIntoChat(text) {
    const ta = document.querySelector('main textarea.rc-textarea, main .ant-mentions textarea');
    if (!ta) { toast('Eingabefeld nicht gefunden.'); return; }
    const v = ta.value || '';
    const pos = typeof ta.selectionStart === 'number' && document.activeElement === ta ? ta.selectionStart : v.length;
    const before = v.slice(0, pos), after = v.slice(pos);
    const ins = (before && !/\n$/.test(before) ? '\n' : '') + text + (after && !/^\n/.test(after) ? '\n' : '');
    const nv = before + ins + after;
    const setter = Object.getOwnPropertyDescriptor(W.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, nv);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    const c = (before + ins).length;
    try { ta.setSelectionRange(c, c); } catch {}
  }

  // Abschnitt in der rechten Spalte
  function messengerTerms() {
    const titles = [...document.querySelectorAll('aside .ant-collapse-item .ant-collapse-title')];
    const act = titles.find((t) => t.textContent.trim() === 'Aktionen');
    const att = titles.find((t) => t.textContent.trim() === 'Anhänge');
    if (!act || !att) return;
    const attItem = att.closest('.ant-collapse-item');
    const actItem = act.closest('.ant-collapse-item');
    let item = document.getElementById('vaf-terms');
    if (item && item.nextElementSibling === attItem) return;
    if (item) item.remove();
    // Aufbau wie die vorhandenen Abschnitte
    item = attItem.cloneNode(false);
    item.id = 'vaf-terms';
    item.className = attItem.className.replace(/\bant-collapse-item-active\b/g, '').trim();
    const head = attItem.querySelector('.ant-collapse-header').cloneNode(true);
    head.querySelector('.ant-collapse-title').textContent = 'Termine';
    const panel = document.createElement('div');
    panel.className = 'ant-collapse-panel';
    const body = document.createElement('div');
    body.className = 'ant-collapse-body';
    panel.appendChild(body);
    item.append(head, panel);
    actItem.after(item);
    const menuCls = (actItem.querySelector('ul.ant-menu') || {}).className || 'ant-menu ant-menu-root ant-menu-vertical ant-menu-light ant-theme';
    const icon = actItem.querySelector('.ant-collapse-expand-icon');
    const setOpen = (open) => {
      item.classList.toggle('ant-collapse-item-active', open);
      head.setAttribute('aria-expanded', String(open));
      panel.className = 'ant-collapse-panel ' + (open ? 'ant-collapse-panel-active' : 'ant-collapse-panel-inactive ant-collapse-panel-hidden');
      panel.style.display = open ? '' : 'none';
      const svg = head.querySelector('.ant-collapse-expand-icon svg');
      if (svg) svg.style.transform = open ? 'rotate(0deg)' : 'rotate(-90deg)';      // wie bei „Aktionen“/„Anhänge“
    };
    const li = (html, title, fn, extraCss = '') => {
      const e = document.createElement('li');
      e.className = 'ant-menu-item';
      e.setAttribute('role', 'menuitem');
      e.tabIndex = -1;
      e.title = title || '';
      e.innerHTML = `<span class="ant-menu-title-content" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${extraCss}">${html}</span>`;
      if (fn) e.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); });
      else e.style.cursor = 'default';
      return e;
    };
    const render = async (ask) => {
      const ul = document.createElement('ul');
      ul.className = menuCls;
      ul.setAttribute('role', 'menu');
      body.innerHTML = '';
      body.appendChild(ul);
      if (!termSupported()) { ul.appendChild(li('Nur in Chrome oder Edge verfügbar', '', null, 'opacity:.6')); return; }
      const r = await readTermFile(ask);
      if (r.state === 'none') { ul.appendChild(li('Datei mit Terminen wählen …', 'Textdatei mit Zeilen „wann - wo - was - Link“', async () => { if (await pickTermFile()) render(false); })); return; }
      if (r.state === 'perm') { ul.appendChild(li('Zugriff auf die Datei erlauben', r.name, () => render(true))); ul.appendChild(li('Datei ändern …', '', async () => { if (await pickTermFile()) render(false); }, 'opacity:.7')); return; }
      if (r.state === 'error') { ul.appendChild(li(`Datei nicht lesbar: ${esc(r.name)}`, r.error, null, 'color:#ff7875')); ul.appendChild(li('Datei ändern …', '', async () => { if (await pickTermFile()) render(false); }, 'opacity:.7')); return; }
      const { list } = upcomingTerms(r.text);
      if (!list.length) ul.appendChild(li('Keine kommenden Termine', r.name, null, 'opacity:.6'));
      for (const t of list) ul.appendChild(li(esc(t.label), t.line, () => insertIntoChat(t.line)));
      ul.appendChild(li('Datei ändern …', `Derzeit: ${r.name}`, async () => { if (await pickTermFile()) render(false); }, 'opacity:.7;font-size:12px'));
    };
    head.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const open = !item.classList.contains('ant-collapse-item-active');
      G.set('terms_open', open);
      setOpen(open);
      if (open) render(true);                 // Klick: darf nach der Datei-Erlaubnis fragen
    });
    const open = !!G.get('terms_open', false);
    setOpen(open);
    if (open) render(false);
    void icon;
  }

  // =====================================================================================
  // Smiley-Übersetzung JOYclub <-> poppen <-> Unicode (Tabelle aus smiley-map.json, fest eingebaut)
  // =====================================================================================
  const SMILEY_MAP = {"joyToPoppen": {"*danke*": ":pray:", "*thankyou*": ":pray:", "*g*": ":)", ":)": ":)", ":-)": ":)", "*kuss*": ":kiss:", "*schleck4*": ":kiss:", "*top*": ":thumbsup:", "*ggg*": ":D", ":D": ":D", ":-D": ":D", "*lol*": ":joy:", ":lol:": ":joy:", "*smile*": ":relaxed:", "*gg*": ":smiley:", "*zwinker*": ";)", ";)": ";)", ";-)": ";)", "*zwinker2*": ";)", ":wink:": ";)", "*xd*": "xD", "*achtung*": ":exclamation:", ":!:": ":exclamation:", "*exclaim*": ":exclamation:", "*alarm*": ":rotating_light:", "*freu2*": ":jumping:", "*knuddel*": "🤗", "*wink*": ":wave:", "*grins*": ":grin:", "*mrgreen*": ":grin:", ":mrgreen:": ":grin:", "*fiesgrins*": ":smiling_imp:", ":twisted:": ":smiling_imp:", "*twisted*": ":smiling_imp:", "*lach*": "xD", "*haha*": "xD", "*rotfl*": "🤣", "*rofl*": "🤣", "*haumichwech*": "🤣", "*freu*": ":smiley:", "*juhu*": "🥳", "*juchu*": "🥳", "*happy*": ":relaxed:", "*witz*": "xD", "*traenenlach*": ":joy:", "*aetsch*": ":stuck_out_tongue:", "*baeh*": ":P", ":P": ":P", ":-P": ":P", ":razz:": ":P", "*razz*": ":P", "*selbstgefall*": ":smirk:", "*goofy*": "🤪", "*oh*": ":o", ":o": ":o", ":-o": ":o", ":surprised:": ":o", "*surprised*": ":o", "*oh2*": ":hushed:", "*schock*": ":scream:", ":shock:": ":scream:", "*shock*": ":scream:", "*panik*": ":fearful:", "*umfall*": ":dizzy_face:", "*gr*": ">:(", ":x": ">:(", "*gr2*": ":imp:", ":evil:": ":imp:", "*evil*": ":imp:", "*gr3*": ":rage:", "*gleichplatz*": "🤬", "*uah*": ":confounded:", "*motz*": ":triumph:", "*fluch*": "🤬", "*basta*": ":triumph:", "*freundchen*": ">:(", "*kommmalherfreundchen*": ">:(", "*blauesauge*": "🤕", "*headcrash*": "🤕", "*grimasse*": ":grimacing:", "*snief*": ":(", ":(": ":(", ":-(": ":(", ":sad:": ":(", "*sad*": ":(", "*snief2*": ":cry:", ":cry:": ":cry:", "*cry*": ":cry:", "*heul*": ":sob:", "*heul2*": ":sob:", "*snief3*": ":sob:", "*flenn*": ":sob:", "*traurig*": ":pensive:", "*liebeskummer*": ":broken_heart:", "*troest*": "🤗", "*keks*": "🤗", "*muede*": ":|", ":|": ":|", ":-|": ":|", ":neutral:": ":|", "*neutral*": ":|", "*morgen*": ":|", "*gaehn*": "🥱", "*gaehn2*": "🥱", "*zzz*": ":zzz:", "*heia*": ":sleeping:", "*heia2*": ":sleeping:", "*baby2*": ":baby:", "*tel*": ":telephone_receiver:", "*blabla*": ":speech_balloon:", "*bla*": ":speech_balloon:", "*bla2*": ":speech_balloon:", "*lalala*": ":notes:", "*schweig*": "🤐", "*fluester*": "🤫", "*dafuer*": ":thumbsup:", "*dagegen*": ":thumbsdown:", "*flop*": ":thumbsdown:", "*top2*": ":thumbsup:", "*bravo*": ":clap:", "*zugabe*": ":clap:", "*spitze*": ":ok_hand:", "*tomaten*": ":tomato:", "*wow*": ":astonished:", "*sabber*": "🤤", "*umpf*": "🤢", "*arg*": "🤢", "*pfui*": "🤢", "*victory*": ":v:", "*hi5*": ":raised_hands:", "*hutab*": ":tophat:", "*100*": ":100:", "*wuerg*": "🤮", "*wuerg2*": "🤮", "*ko*": ":dizzy_face:", "*crazy2*": ":dizzy_face:", "*aspirin*": ":pill:", "*sternchen*": ":dizzy:", "*3tagewach*": ":weary:", "*schnupfen*": "🤧", "*hatschi*": "🤧", "*gehirnschnecke*": ":snail:", "*schwester*": ":dr_love:", "*mundschutz*": ":mask:", "*essen*": ":fork_and_knife:", "*grill*": ":meat_on_bone:", "*bier*": ":beer:", "*eis*": ":icecream:", "*lolli*": ":lollipop:", "*torte*": ":birthday:", "*muffin*": "🧁", "*kaffee*": ":coffee_morning:", "*tee*": ":tea:", "*wein*": ":wine_glass:", "*cocktail*": ":cocktail:", "*fliege2*": "🦟", "*whiskey*": "🥃", "*prost*": ":beers:", "*party*": ":beers:", "*cheers*": "🥂", "*stoesschen*": "🥂", "*sekt*": "🍾", "*party2*": "🍾", "*zig*": ":smoking:", "*troet*": ":tada:", "*twist*": ":dancer:", "*yo*": ":dancer:", "*walk*": ":dancer:", "*dance*": ":dancer:", "*boogie*": ":dancer:", "*hicks*": "🥴", "*headbang*": ":urock:", "*hochleb*": ":raised_hands:", "*stammtisch*": ":beers:", "*feuerwerk*": ":fireworks:", "*knuddel2*": ":kissing_closed_eyes:", "*knutsch*": ":kissing_closed_eyes:", "*knutsch2*": ":kissing_closed_eyes:", "*liebhab*": ":hearts_around:", "*imogdi*": ":hearts_around:", "*iloveyou*": ":hearts_around:", "*friends*": ":couple:", "*bussi*": ":kissing_smiling_eyes:", "*kuss2*": ":kiss:", "*herz*": ":heart:", "*herz2*": ":two_hearts:", "*herz3*": ":heartpulse:", "*herz4*": ":sparkling_heart:", "*love*": ":heart:", "*love2*": ":heart:", "*love3*": ":heart:", "*love4*": ":heart:", "*love5*": ":heart_eyes:", "*blume*": ":rose:", "*blumezupf*": ":blossom:", "*blumenschenk*": ":bouquet:", "*roseschenk*": ":rose:", "*geschenk*": ":gift:", "*osolemio*": ":microphone:", "*hochzeit*": ":wedding:", "*kuss3*": ":kissing_heart:", "*bussi2*": ":kissing_heart:", "*knutsch3*": ":kissing_heart:", "*knutsch4*": ":kissing_heart:", "*blume2*": ":tulip:", "*sweetkiss*": ":kissing_heart:", "*liebguck*": "🥰", "*anbet*": ":bow:", "*floet*": ":kissing:", "*skeptisch*": "🤨", "*pueh*": "¬¬", "*schmoll*": "¬¬", "*stolzbin*": ":relieved:", "*autsch*": "🤕", "*cool*": "B|", "8)": "B|", "8-)": "B|", "*cool2*": "B|", "*crazy*": ":crazy:", "*crazy4*": ":crazy:", "*aua*": "🤕", "*huch*": ":astonished:", "*oh3*": ":astonished:", "*oh4*": ":astonished:", "*hae*": "O.o", ":?": "O.o", "*nixweiss*": "🤷", "*naund*": "🤷", "*schiefguck*": ":confused:", ":/": ":confused:", ":-/": ":confused:", ":confused:": ":confused:", "*confused*": ":confused:", "*roll*": "🙄", ":roll:": "🙄", "*sarkasmus*": "🙄", "*gruebel*": "🤔", "*nachdenk*": "🤔", "*kopfklatsch*": "🤦", "*rotwerd*": ":flushed:", ":oops:": ":flushed:", ":redface:": ":flushed:", "*redface*": ":flushed:", "*schaem*": ":flushed:", "*angsthab*": ":cold_sweat:", "*ballaballa*": "🤪", "*blumenwiese*": ":blossom:", "*vielglueck*": ":four_leaf_clover:", "*augenzu*": ":see_no_evil:", "*tanz*": ":dancer:", "*tanz2*": ":dancer:", "*tipp*": ":computer:", "*les*": ":newspaper:", "*mail*": ":envelope:", "*duschen*": ":shower:", "*wc*": ":toilet:", "*omm*": "(A)", "*huhu*": ":wave:", "*bye*": ":wave:", "*fahr*": ":red_car:", "*knips*": ":camera:", "*film*": ":movie_camera:", "*meld*": ":raising_hand:", "*knicks*": ":bow:", "*popcorn*": "🍿", "*popcorn2*": "🍿", "*puh*": ":sweat_smile:", "*clown*": "🤡", "*sing*": ":guitar:", "*strick*": "🧶", "*putz*": "🧹", "*tauch*": ":swimmer:", "*fussball*": ":soccer:", "*spanner*": ":eyes:", "*zocker*": ":video_game:", "*megaphon*": ":loudspeaker:", "*pumpi*": ":muscle:", "*pumpi2*": ":muscle:", "*fernglas*": ":telescope:", "*pimper*": ":poppen:", "*popp*": ":poppen-1:", "*bananen*": ":bananarama:", "*kondom*": ":safesex:", "*peitsche*": ":whipping:", "*schleck*": ":lick:", "*schleck2*": ":lick:", "*schleck3*": ":lick:", "*arsch*": ":ass:", "*hotass*": ":ass:", "*hothips*": ":stocking:", "*hotbum*": ":ass:", "*titten*": ":tits:", "*knackarsch*": ":ass:", "*blowjob*": ":suckmy:", "*leck*": ":lick:", "*ffm*": ":threesome:", "*mmf*": ":threesome:", "*fessel*": ":handcuffs:", "*sextoy*": ":vibrator:", "*engel*": "(A)", "*engel2*": ":angel:", "*oma*": ":older_woman:", "*opa*": ":older_man:", "*baby*": ":baby:", "*bauarbeiter*": ":construction_worker:", "*polizei*": ":cop:", "*maler*": ":art:", "*koenig*": ":crown:", "*koenigin*": ":princess:", "*dj*": ":headphones:", "*rock*": ":guitar:", "*gitarre*": ":guitar:", "*drummer*": "🥁", "*piano*": ":musical_keyboard:", "*nikolaus*": ":santa:", "*teufel*": ":smiling_imp:", "*angel*": ":angel:", "*wahrsager*": ":crystal_ball:", "*katze*": ":cat:", "*kuh*": ":cow:", "*huhn*": ":chicken:", "*dance2*": ":chicken:", "*schwein*": ":pig:", "*hund*": ":dog:", "*schmetterling*": "🦋", "*bug*": ":bug:", "*einhorn*": "🦄", "*fuchs*": "🦊", "*schnecke*": ":snail:", "*wolf*": ":wolf:", "*hamster*": ":hamster:", "*sonne*": ":sunny:", "*regen*": ":umbrella:", "*frier*": "🥶", "*schwitz*": ":sweat:", "*regenbogen*": ":rainbow:", "*pfeil*": ":arrow_right:", ":arrow:": ":arrow_right:", "*arrow*": ":arrow_right:", "*frage*": ":question:", ":?:": ":question:", "*question*": ":question:", "*idee*": ":bulb:", ":idea:": ":bulb:", "*idea*": ":bulb:", "*foto*": ":camera:", "*beep*": ":rotating_light:", "*hilfe*": ":sos:", "*help*": ":sos:", "*happybirthday*": ":birthday:", "*deutschland*": ":de:", "*bayern*": "Bayern", "*bw*": "Baden-Württemberg", "*berlin*": "Berlin", "*brandenburg*": "Brandenburg", "*bremen*": "Bremen", "*hamburg*": "Hamburg", "*hessen*": "Hessen", "*mv*": "Mecklenburg-Vorpommern", "*niedersachsen*": "Niedersachsen", "*nrw*": "Nordrhein-Westfalen", "*rheinland*": "Rheinland-Pfalz", "*saarland*": "Saarland", "*sachsen*": "Sachsen", "*anhalt*": "Sachsen-Anhalt", "*schleswig*": "Schleswig-Holstein", "*thueringen*": "Thüringen", "*oesterreich*": "🇦🇹", "*schweiz*": "🇨🇭", "*niederlande*": "🇳🇱", "*brueste*": ":tits:", "*brueste2*": ":tits:"}, "poppenToJoy": {":jumping:": "*freu2*", ":hearts_around:": "*liebhab*", ":heart_eyes:": "*love5*", ":coffee_morning:": "*kaffee*", ":coffee_happy:": "*kaffee*", ":dr_love:": "*schwester*", ":confused:": ":/", ":D": ":D", ":smiley:": "*gg*", ":)": ":)", ":relaxed:": "*smile*", "9_9": "☺", ";)": ";)", ":x": "*love5*", ":kissing_heart:": "*kuss3*", ":kissing_closed_eyes:": "*knutsch*", ":kissing:": "*floet*", ":kissing_smiling_eyes:": "*bussi*", ":P": ":P", ":stuck_out_tongue_closed_eyes:": "😝", ":stuck_out_tongue:": "*aetsch*", ":flushed:": ":oops:", ":grin:": "*grins*", ":pensive:": "*traurig*", ":relieved:": "*stolzbin*", "¬¬": "*pueh*", ":(": ":(", ":persevere:": "😣", ":cry:": ":cry:", ":joy:": "*traenenlach*", ":sob:": "*heul*", ":sleepy:": "😪", ":disappointed_relieved:": "😥", ":cold_sweat:": "*angsthab*", ":sweat_smile:": "*puh*", ":sweat:": "*schwitz*", ":weary:": "*3tagewach*", ":tired_face:": "😫", ":fearful:": "*panik*", ":scream:": ":shock:", ">:(": ":x", ":rage:": "*gr3*", ":triumph:": "*motz*", ":confounded:": "*uah*", "xD": "*xd*", ":yum:": "😋", ":mask:": "*mundschutz*", "B|": "8)", ":sleeping:": "*heia*", ":dizzy_face:": "*umfall*", ":astonished:": "*wow*", ":worried:": "😟", "o.O": "😦", "-_-": "😧", ":smiling_imp:": ":twisted:", ":imp:": ":evil:", ":o": ":o", ":grimacing:": "*grimasse*", ":-/": ":/", "O.o": ":?", ":hushed:": "*oh2*", ":no_mouth:": "😶", "(A)": "*engel*", ":smirk:": "*selbstgefall*", ":|": ":|", ":man_with_gua_pi_mao:": "👲", ":man_with_turban:": "👳", ":cop:": "*polizei*", ":construction_worker:": "*bauarbeiter*", ":guardsman:": "💂", ":baby:": "*baby*", ":boy:": "👦", ":girl:": "👧", ":man:": "👨", ":woman:": "👩", ":older_man:": "*opa*", ":older_woman:": "*oma*", ":person_with_blond_hair:": "👱", ":angel:": "*engel2*", ":princess:": "*koenigin*", ":smiley_cat:": "😺", ":smile_cat:": "😸", ":heart_eyes_cat:": "😻", ":kissing_cat:": "😽", ":smirk_cat:": "😼", ":scream_cat:": "🙀", ":crying_cat_face:": "😿", ":joy_cat:": "😹", ":pouting_cat:": "😾", ":japanese_ogre:": "👹", ":japanese_goblin:": "👺", ":see_no_evil:": "*augenzu*", ":hear_no_evil:": "🙉", ":speak_no_evil:": "🙊", ":skull:": "💀", ":alien:": "👽", ":poop:": "💩", ":fire:": "🔥", ":sparkles:": "✨", ":star2:": "🌟", ":dizzy:": "*sternchen*", ":boom:": "💥", ":anger:": "💢", ":sweat_drops:": "💦", ":droplet:": "💧", ":zzz:": "*zzz*", ":dash:": "💨", ":ear:": "👂", ":eyes:": "*spanner*", ":nose:": "👃", ":tongue:": "*schleck*", ":lips:": "👄", ":thumbsup:": "*top*", ":thumbsdown:": "*flop*", ":ok_hand:": "*spitze*", ":punch:": "👊", ":fist:": "✊", ":v:": "*victory*", ":wave:": "*wink*", ":raised_hand:": "✋", ":open_hands:": "👐", ":point_up_2:": "👆", ":point_down:": "👇", ":point_right:": "👉", ":point_left:": "👈", ":raised_hands:": "*hi5*", ":pray:": "*danke*", ":point_up:": "☝", ":clap:": "*bravo*", ":muscle:": "*pumpi*", ":walking:": "🚶", ":runner:": "🏃", ":dancer:": "*dance*", ":couple:": "*friends*", ":family:": "👪", ":two_men_holding_hands:": "👬", ":two_women_holding_hands:": "👭", ":couplekiss:": "💏", ":couple_with_heart:": "💑", ":dancers:": "👯", ":ok_woman:": "🙆", ":no_good:": "🙅", ":information_desk_person:": "💁", ":raising_hand:": "*meld*", ":massage:": "💆", ":haircut:": "💇", ":nail_care:": "💅", ":bride_with_veil:": "👰", ":person_with_pouting_face:": "🙎", ":person_frowning:": "🙍", ":bow:": "*anbet*", ":tophat:": "*hutab*", ":crown:": "*koenig*", ":womans_hat:": "👒", ":athletic_shoe:": "👟", ":mans_shoe:": "👞", ":sandal:": "👡", ":high_heel:": "👠", ":boot:": "👢", ":shirt:": "👕", ":necktie:": "👔", ":womans_clothes:": "👚", ":dress:": "👗", ":running_shirt_with_sash:": "🎽", ":jeans:": "👖", ":kimono:": "👘", ":bikini:": "👙", ":briefcase:": "💼", ":handbag:": "👜", ":pouch:": "👝", ":purse:": "👛", ":eyeglasses:": "👓", ":ribbon:": "🎀", ":closed_umbrella:": "🌂", ":lipstick:": "💄", ":yellow_heart:": "💛", ":blue_heart:": "💙", ":purple_heart:": "💜", ":green_heart:": "💚", ":heart:": "*herz*", ":broken_heart:": "*liebeskummer*", ":heartpulse:": "*herz3*", ":heartbeat:": "💓", ":two_hearts:": "*herz2*", ":sparkling_heart:": "*herz4*", ":revolving_hearts:": "💞", ":cupid:": "💘", ":love_letter:": "💌", ":kiss:": "*kuss2*", ":ring:": "💍", ":gem:": "💎", ":bust_in_silhouette:": "👤", ":busts_in_silhouette:": "👥", ":speech_balloon:": "*blabla*", ":footprints:": "👣", ":thought_balloon:": "💭", ":poppen:": "*pimper*", ":poppen-1:": "*popp*", ":suckmy:": "*blowjob*", ":lick:": "*schleck*", ":handcuffs:": "*fessel*", ":vibrator:": "*sextoy*", ":whipping:": "*peitsche*", ":crazy:": "*crazy*", ":cum:": "💦", ":bed:": "*popp*", ":ass:": "*arsch*", ":pussy:": "🍯", ":stocking:": "*hothips*", ":safesex:": "*kondom*", ":cock:": "🍆", ":tits:": "*titten*", ":banana:": "🍌", ":bananarama:": "*bananen*", ":spermatozoon:": "💦", ":threesome:": "*ffm*", ":fucku:": "🖕", ":urock:": "*headbang*", ":wdrop:": "💧", ":ydrop:": "💧", ":wdrops:": "💦", ":ydrops:": "💦", ":bdrops:": "💦", ":dog:": "*hund*", ":wolf:": "*wolf*", ":cat:": "*katze*", ":mouse:": "🐭", ":hamster:": "*hamster*", ":rabbit:": "🐰", ":frog:": "🐸", ":tiger:": "🐯", ":koala:": "🐨", ":bear:": "🐻", ":pig:": "*schwein*", ":pig_nose:": "🐽", ":cow:": "*kuh*", ":boar:": "🐗", ":monkey_face:": "🐵", ":monkey:": "🐒", ":horse:": "🐴", ":sheep:": "🐑", ":elephant:": "🐘", ":panda_face:": "🐼", ":penguin:": "🐧", ":bird:": "🐦", ":baby_chick:": "🐤", ":hatched_chick:": "🐥", ":hatching_chick:": "🐣", ":chicken:": "*huhn*", ":snake:": "🐍", ":turtle:": "🐢", ":bug:": "*bug*", ":bee:": "🐝", ":ant:": "🐜", ":beetle:": "🐞", ":snail:": "*schnecke*", ":octopus:": "🐙", ":shell:": "🐚", ":tropical_fish:": "🐠", ":fish:": "🐟", ":dolphin:": "🐬", ":whale:": "🐳", ":whale2:": "🐋", ":cow2:": "🐄", ":ram:": "🐏", ":rat:": "🐀", ":water_buffalo:": "🐃", ":tiger2:": "🐅", ":rabbit2:": "🐇", ":dragon:": "🐉", ":racehorse:": "🐎", ":goat:": "🐐", ":rooster:": "🐓", ":dog2:": "🐕", ":pig2:": "🐖", ":mouse2:": "🐁", ":ox:": "🐂", ":dragon_face:": "🐲", ":blowfish:": "🐡", ":crocodile:": "🐊", ":camel:": "🐫", ":dromedary_camel:": "🐪", ":leopard:": "🐆", ":cat2:": "🐈", ":poodle:": "🐩", ":feet:": "🐾", ":bouquet:": "*blumenschenk*", ":cherry_blossom:": "🌸", ":tulip:": "*blume2*", ":four_leaf_clover:": "*vielglueck*", ":rose:": "*blume*", ":sunflower:": "🌻", ":hibiscus:": "🌺", ":maple_leaf:": "🍁", ":leaves:": "🍃", ":fallen_leaf:": "🍂", ":herb:": "🌿", ":ear_of_rice:": "🌾", ":mushroom:": "🍄", ":cactus:": "🌵", ":palm_tree:": "🌴", ":evergreen_tree:": "🌲", ":deciduous_tree:": "🌳", ":chestnut:": "🌰", ":seedling:": "🌱", ":blossom:": "*blumezupf*", ":globe_with_meridians:": "🌐", ":sun_with_face:": "🌞", ":full_moon_with_face:": "🌝", ":new_moon_with_face:": "🌚", ":new_moon:": "🌑", ":waxing_crescent_moon:": "🌒", ":first_quarter_moon:": "🌓", ":waxing_gibbous_moon:": "🌔", ":full_moon:": "🌕", ":waning_gibbous_moon:": "🌖", ":last_quarter_moon:": "🌗", ":waning_crescent_moon:": "🌘", ":last_quarter_moon_with_face:": "🌜", ":first_quarter_moon_with_face:": "🌛", ":crescent_moon:": "🌙", ":earth_africa:": "🌍", ":earth_americas:": "🌎", ":earth_asia:": "🌏", ":volcano:": "🌋", ":milky_way:": "🌌", ":stars:": "🌠", ":star:": "⭐", ":sunny:": "*sonne*", ":partly_sunny:": "⛅", ":cloud:": "☁", ":zap:": "⚡", ":umbrella:": "*regen*", ":snowflake:": "❄", ":snowman:": "⛄", ":cyclone:": "🌀", ":foggy:": "🌁", ":rainbow:": "*regenbogen*", ":ocean:": "🌊", ":bamboo:": "🎍", ":gift_heart:": "💝", ":dolls:": "🎎", ":school_satchel:": "🎒", ":mortar_board:": "🎓", ":flags:": "🎏", ":fireworks:": "*feuerwerk*", ":sparkler:": "🎇", ":wind_chime:": "🎐", ":rice_scene:": "🎑", ":jack_o_lantern:": "🎃", ":ghost:": "👻", ":santa:": "*nikolaus*", ":christmas_tree:": "🎄", ":gift:": "*geschenk*", ":tanabata_tree:": "🎋", ":tada:": "*troet*", ":confetti_ball:": "🎊", ":balloon:": "🎈", ":crossed_flags:": "🎌", ":crystal_ball:": "*wahrsager*", ":movie_camera:": "*film*", ":camera:": "*knips*", ":video_camera:": "📹", ":vhs:": "📼", ":cd:": "💿", ":dvd:": "📀", ":minidisc:": "💽", ":floppy_disk:": "💾", ":computer:": "*tipp*", ":iphone:": "📱", ":telephone:": "☎", ":telephone_receiver:": "*tel*", ":pager:": "📟", ":fax:": "📠", ":satellite:": "📡", ":tv:": "📺", ":radio:": "📻", ":loud_sound:": "🔊", ":sound:": "🔉", ":speaker:": "🔈", ":mute:": "🔇", ":bell:": "🔔", ":no_bell:": "🔕", ":loudspeaker:": "*megaphon*", ":mega:": "📣", ":hourglass_flowing_sand:": "⏳", ":hourglass:": "⌛", ":alarm_clock:": "⏰", ":watch:": "⌚", ":unlock:": "🔓", ":lock:": "🔒", ":lock_with_ink_pen:": "🔏", ":closed_lock_with_key:": "🔐", ":key:": "🔑", ":mag_right:": "🔎", ":bulb:": ":idea:", ":flashlight:": "🔦", ":high_brightness:": "🔆", ":low_brightness:": "🔅", ":electric_plug:": "🔌", ":battery:": "🔋", ":mag:": "🔍", ":bathtub:": "🛁", ":bath:": "🛀", ":shower:": "*duschen*", ":toilet:": "*wc*", ":wrench:": "🔧", ":nut_and_bolt:": "🔩", ":hammer:": "🔨", ":door:": "🚪", ":smoking:": "*zig*", ":bomb:": "💣", ":gun:": "🔫", ":knife:": "🔪", ":pill:": "*aspirin*", ":syringe:": "💉", ":moneybag:": "💰", ":yen:": "💴", ":dollar:": "💵", ":pound:": "💷", ":euro:": "💶", ":credit_card:": "💳", ":money_with_wings:": "💸", ":calling:": "📲", ":e-mail:": "📧", ":inbox_tray:": "📥", ":outbox_tray:": "📤", ":envelope:": "*mail*", ":envelope_with_arrow:": "📩", ":incoming_envelope:": "📨", ":postal_horn:": "📯", ":mailbox:": "📫", ":mailbox_closed:": "📪", ":mailbox_with_mail:": "📬", ":mailbox_with_no_mail:": "📭", ":postbox:": "📮", ":package:": "📦", ":pencil:": "📝", ":page_facing_up:": "📄", ":page_with_curl:": "📃", ":bookmark_tabs:": "📑", ":bar_chart:": "📊", ":chart_with_upwards_trend:": "📈", ":chart_with_downwards_trend:": "📉", ":scroll:": "📜", ":clipboard:": "📋", ":date:": "📅", ":calendar:": "📆", ":card_index:": "📇", ":file_folder:": "📁", ":open_file_folder:": "📂", ":scissors:": "✂", ":pushpin:": "📌", ":paperclip:": "📎", ":black_nib:": "✒", ":pencil2:": "✏", ":straight_ruler:": "📏", ":triangular_ruler:": "📐", ":closed_book:": "📕", ":green_book:": "📗", ":blue_book:": "📘", ":orange_book:": "📙", ":notebook:": "📓", ":notebook_with_decorative_cover:": "📔", ":ledger:": "📒", ":books:": "📚", ":book:": "📖", ":bookmark:": "🔖", ":name_badge:": "📛", ":microscope:": "🔬", ":telescope:": "*fernglas*", ":newspaper:": "*les*", ":art:": "*maler*", ":clapper:": "🎬", ":microphone:": "*osolemio*", ":headphones:": "*dj*", ":musical_score:": "🎼", ":musical_note:": "🎵", ":notes:": "*lalala*", ":musical_keyboard:": "*piano*", ":violin:": "🎻", ":trumpet:": "🎺", ":saxophone:": "🎷", ":guitar:": "*rock*", ":space_invader:": "👾", ":video_game:": "*zocker*", ":black_joker:": "🃏", ":flower_playing_cards:": "🎴", ":mahjong:": "🀄", ":game_die:": "🎲", ":dart:": "🎯", ":football:": "🏈", ":basketball:": "🏀", ":soccer:": "*fussball*", ":baseball:": "⚾", ":tennis:": "🎾", ":8ball:": "🎱", ":rugby_football:": "🏉", ":bowling:": "🎳", ":golf:": "⛳", ":mountain_bicyclist:": "🚵", ":bicyclist:": "🚴", ":checkered_flag:": "🏁", ":horse_racing:": "🏇", ":trophy:": "🏆", ":ski:": "🎿", ":snowboarder:": "🏂", ":swimmer:": "*tauch*", ":surfer:": "🏄", ":fishing_pole_and_fish:": "🎣", ":coffee:": "*kaffee*", ":tea:": "*tee*", ":sake:": "🍶", ":baby_bottle:": "🍼", ":beer:": "*bier*", ":beers:": "*prost*", ":cocktail:": "*cocktail*", ":tropical_drink:": "🍹", ":wine_glass:": "*wein*", ":fork_and_knife:": "*essen*", ":pizza:": "🍕", ":hamburger:": "🍔", ":fries:": "🍟", ":poultry_leg:": "🍗", ":meat_on_bone:": "*grill*", ":spaghetti:": "🍝", ":curry:": "🍛", ":fried_shrimp:": "🍤", ":bento:": "🍱", ":sushi:": "🍣", ":fish_cake:": "🍥", ":rice_ball:": "🍙", ":rice_cracker:": "🍘", ":rice:": "🍚", ":ramen:": "🍜", ":stew:": "🍲", ":oden:": "🍢", ":dango:": "🍡", ":egg:": "🍳", ":bread:": "🍞", ":doughnut:": "🍩", ":custard:": "🍮", ":icecream:": "*eis*", ":ice_cream:": "🍨", ":shaved_ice:": "🍧", ":birthday:": "*torte*", ":cake:": "🍰", ":cookie:": "🍪", ":chocolate_bar:": "🍫", ":candy:": "🍬", ":lollipop:": "*lolli*", ":honey_pot:": "🍯", ":apple:": "🍎", ":green_apple:": "🍏", ":tangerine:": "🍊", ":lemon:": "🍋", ":cherries:": "🍒", ":grapes:": "🍇", ":watermelon:": "🍉", ":strawberry:": "🍓", ":peach:": "*arsch*", ":melon:": "🍈", ":pear:": "🍐", ":pineapple:": "🍍", ":sweet_potato:": "🍠", ":eggplant:": "🍆", ":tomato:": "*tomaten*", ":corn:": "🌽", ":house:": "🏠", ":house_with_garden:": "🏡", ":school:": "🏫", ":office:": "🏢", ":post_office:": "🏣", ":hospital:": "🏥", ":bank:": "🏦", ":convenience_store:": "🏪", ":love_hotel:": "🏩", ":hotel:": "🏨", ":wedding:": "*hochzeit*", ":church:": "⛪", ":department_store:": "🏬", ":european_post_office:": "🏤", ":city_sunset:": "🌇", ":city_dusk:": "🌆", ":japanese_castle:": "🏯", ":european_castle:": "🏰", ":tent:": "⛺", ":factory:": "🏭", ":tokyo_tower:": "🗼", ":japan:": "🗾", ":mount_fuji:": "🗻", ":sunrise_over_mountains:": "🌄", ":sunrise:": "🌅", ":night_with_stars:": "🌃", ":statue_of_liberty:": "🗽", ":bridge_at_night:": "🌉", ":carousel_horse:": "🎠", ":ferris_wheel:": "🎡", ":fountain:": "⛲", ":roller_coaster:": "🎢", ":ship:": "🚢", ":sailboat:": "⛵", ":speedboat:": "🚤", ":rowboat:": "🚣", ":anchor:": "⚓", ":rocket:": "🚀", ":airplane:": "✈", ":seat:": "💺", ":helicopter:": "🚁", ":steam_locomotive:": "🚂", ":tram:": "🚊", ":station:": "🚉", ":mountain_railway:": "🚞", ":train2:": "🚆", ":bullettrain_side:": "🚄", ":bullettrain_front:": "🚅", ":light_rail:": "🚈", ":metro:": "🚇", ":monorail:": "🚝", ":train:": "🚋", ":railway_car:": "🚃", ":trolleybus:": "🚎", ":bus:": "🚌", ":oncoming_bus:": "🚍", ":blue_car:": "🚙", ":oncoming_automobile:": "🚘", ":red_car:": "*fahr*", ":taxi:": "🚕", ":oncoming_taxi:": "🚖", ":articulated_lorry:": "🚛", ":truck:": "🚚", ":rotating_light:": "*alarm*", ":police_car:": "🚓", ":oncoming_police_car:": "🚔", ":fire_engine:": "🚒", ":ambulance:": "🚑", ":minibus:": "🚐", ":bike:": "🚲", ":aerial_tramway:": "🚡", ":suspension_railway:": "🚟", ":mountain_cableway:": "🚠", ":tractor:": "🚜", ":barber:": "💈", ":busstop:": "🚏", ":ticket:": "🎫", ":vertical_traffic_light:": "🚦", ":traffic_light:": "🚥", ":warning:": "⚠", ":construction:": "🚧", ":beginner:": "🔰", ":fuelpump:": "⛽", ":izakaya_lantern:": "🏮", ":slot_machine:": "🎰", ":hotsprings:": "♨", ":moyai:": "🗿", ":circus_tent:": "🎪", ":performing_arts:": "🎭", ":round_pushpin:": "📍", ":triangular_flag_on_post:": "🚩", ":cn:": "🇨🇳", ":us:": "🇺🇸", ":jp:": "🇯🇵", ":ru:": "🇷🇺", ":de:": "*deutschland*", ":gb:": "🇬🇧", ":fr:": "🇫🇷", ":kr:": "🇰🇷", ":it:": "🇮🇹", ":es:": "🇪🇸", ":no_smoking:": "🚭", ":over18:": "🔞", ":copyright:": "©", ":parking:": "🅿", ":wc:": "🚾", ":hash:": "#⃣", ":one:": "1⃣", ":two:": "2⃣", ":three:": "3⃣", ":four:": "4⃣", ":five:": "5⃣", ":six:": "6⃣", ":seven:": "7⃣", ":eight:": "8⃣", ":nine:": "9⃣", ":zero:": "0⃣", ":keycap_ten:": "🔟", ":1234:": "🔢", ":symbols:": "🔣", ":arrow_up:": "⬆", ":arrow_down:": "⬇", ":arrow_left:": "⬅", ":arrow_right:": ":arrow:", ":capital_abcd:": "🔠", ":abcd:": "🔡", ":abc:": "🔤", ":arrow_upper_right:": "↗", ":arrow_upper_left:": "↖", ":arrow_lower_right:": "↘", ":arrow_lower_left:": "↙", ":left_right_arrow:": "↔", ":arrow_up_down:": "↕", ":arrows_counterclockwise:": "🔄", ":arrow_backward:": "◀", ":arrow_forward:": "▶", ":arrow_up_small:": "🔼", ":arrow_down_small:": "🔽", ":leftwards_arrow_with_hook:": "↩", ":arrow_right_hook:": "↪", ":information_source:": "ℹ", ":rewind:": "⏪", ":fast_forward:": "⏩", ":arrow_double_up:": "⏫", ":arrow_double_down:": "⏬", ":arrow_heading_down:": "⤵", ":arrow_heading_up:": "⤴", ":ok:": "🆗", ":twisted_rightwards_arrows:": "🔀", ":repeat:": "🔁", ":repeat_one:": "🔂", ":new:": "🆕", ":up:": "🆙", ":cool:": "🆒", ":free:": "🆓", ":ng:": "🆖", ":signal_strength:": "📶", ":cinema:": "🎦", ":koko:": "🈁", ":u6307:": "🈯", ":u7a7a:": "🈳", ":u6e80:": "🈵", ":u5408:": "🈴", ":u7981:": "🈲", ":ideograph_advantage:": "🉐", ":u5272:": "🈹", ":u55b6:": "🈺", ":u6709:": "🈶", ":u7121:": "🈚", ":restroom:": "🚻", ":mens:": "🚹", ":womens:": "🚺", ":baby_symbol:": "🚼", ":potable_water:": "🚰", ":put_litter_in_its_place:": "🚮", ":wheelchair:": "♿", ":u6708:": "🈷", ":u7533:": "🈸", ":sa:": "🈂", ":m:": "Ⓜ", ":passport_control:": "🛂", ":baggage_claim:": "🛄", ":left_luggage:": "🛅", ":customs:": "🛃", ":accept:": "🉑", ":secret:": "㊙", ":congratulations:": "㊗", ":cl:": "🆑", ":sos:": "*hilfe*", ":id:": "🆔", ":no_entry_sign:": "🚫", ":no_mobile_phones:": "📵", ":do_not_litter:": "🚯", ":non-potable_water:": "🚱", ":no_bicycles:": "🚳", ":no_pedestrians:": "🚷", ":children_crossing:": "🚸", ":no_entry:": "⛔", ":eight_spoked_asterisk:": "✳", ":sparkle:": "❇", ":negative_squared_cross_mark:": "❎", ":white_check_mark:": "✅", ":eight_pointed_black_star:": "✴", ":heart_decoration:": "💟", ":vs:": "🆚", ":vibration_mode:": "📳", ":mobile_phone_off:": "📴", ":a:": "🅰", ":b:": "🅱", ":ab:": "🆎", ":o2:": "🅾", ":diamond_shape_with_a_dot_inside:": "💠", ":loop:": "➿", ":recycle:": "♻", ":aries:": "♈", ":taurus:": "♉", ":gemini:": "♊", ":cancer:": "♋", ":leo:": "♌", ":virgo:": "♍", ":libra:": "♎", ":scorpius:": "♏", ":sagittarius:": "♐", ":capricorn:": "♑", ":aquarius:": "♒", ":pisces:": "♓", ":ophiuchus:": "⛎", ":six_pointed_star:": "🔯", ":atm:": "🏧", ":chart:": "💹", ":heavy_dollar_sign:": "💲", ":currency_exchange:": "💱", ":registered:": "®", ":tm:": "™", ":part_alternation_mark:": "〽", ":wavy_dash:": "〰", ":top:": "🔝", ":end:": "🔚", ":back:": "🔙", ":on:": "🔛", ":soon:": "🔜", ":x:": "❌", ":o:": "⭕", ":exclamation:": ":!:", ":question:": ":?:", ":grey_exclamation:": "❕", ":grey_question:": "❔", ":bangbang:": "‼", ":interrobang:": "⁉", ":arrows_clockwise:": "🔃", ":clock12:": "🕛", ":clock1230:": "🕧", ":clock1:": "🕐", ":clock130:": "🕜", ":clock2:": "🕑", ":clock230:": "🕝", ":clock3:": "🕒", ":clock330:": "🕞", ":clock4:": "🕓", ":clock430:": "🕟", ":clock5:": "🕔", ":clock530:": "🕠", ":clock6:": "🕕", ":clock7:": "🕖", ":clock8:": "🕗", ":clock9:": "🕘", ":clock10:": "🕙", ":clock11:": "🕚", ":clock630:": "🕡", ":clock730:": "🕢", ":clock830:": "🕣", ":clock930:": "🕤", ":clock1030:": "🕥", ":clock1130:": "🕦", ":heavy_multiplication_x:": "✖", ":heavy_plus_sign:": "➕", ":heavy_minus_sign:": "➖", ":heavy_division_sign:": "➗", ":spades:": "♠", ":hearts:": "♥", ":clubs:": "♣", ":diamonds:": "♦", ":white_flower:": "💮", ":100:": "*100*", ":heavy_check_mark:": "✔", ":ballot_box_with_check:": "☑", ":radio_button:": "🔘", ":link:": "🔗", ":curly_loop:": "➰", ":trident:": "🔱", ":black_square_button:": "🔲", ":white_square_button:": "🔳", ":black_medium_square:": "◼", ":white_medium_square:": "◻", ":black_medium_small_square:": "◾", ":white_medium_small_square:": "◽", ":black_small_square:": "▪", ":white_small_square:": "▫", ":small_red_triangle:": "🔺", ":white_large_square:": "⬜", ":black_large_square:": "⬛", ":black_circle:": "⚫", ":white_circle:": "⚪", ":red_circle:": "🔴", ":large_blue_circle:": "🔵", ":small_red_triangle_down:": "🔻", ":large_orange_diamond:": "🔶", ":large_blue_diamond:": "🔷", ":small_orange_diamond:": "🔸", ":small_blue_diamond:": "🔹"}, "unicodeToPoppen": {"😃": ":D", "😄": ":smiley:", "😀": ":)", "😊": ":relaxed:", "☺": "9_9", "😉": ";)", "😍": ":x", "😘": ":kissing_heart:", "😚": ":kissing_closed_eyes:", "😗": ":kissing:", "😙": ":kissing_smiling_eyes:", "😜": ":P", "😝": ":stuck_out_tongue_closed_eyes:", "😛": ":stuck_out_tongue:", "😳": ":flushed:", "😁": ":grin:", "😔": ":pensive:", "😌": ":relieved:", "😒": "¬¬", "😞": ":(", "😣": ":persevere:", "😢": ":cry:", "😂": ":joy:", "😭": ":sob:", "😪": ":sleepy:", "😥": ":disappointed_relieved:", "😰": ":cold_sweat:", "😅": ":sweat_smile:", "😓": ":sweat:", "😩": ":weary:", "😫": ":tired_face:", "😨": ":fearful:", "😱": ":scream:", "😠": ">:(", "😡": ":rage:", "😤": ":triumph:", "😖": ":confounded:", "😆": "xD", "😋": ":yum:", "😷": ":mask:", "😎": "B|", "😴": ":sleeping:", "😵": ":dizzy_face:", "😲": ":astonished:", "😟": ":worried:", "😦": "o.O", "😧": "-_-", "😈": ":smiling_imp:", "👿": ":imp:", "😮": ":o", "😬": ":grimacing:", "😐": ":-/", "😕": "O.o", "😯": ":hushed:", "😶": ":no_mouth:", "😇": "(A)", "😏": ":smirk:", "😑": ":|", "👲": ":man_with_gua_pi_mao:", "👳": ":man_with_turban:", "👮": ":cop:", "👷": ":construction_worker:", "💂": ":guardsman:", "👶": ":baby:", "👦": ":boy:", "👧": ":girl:", "👨": ":man:", "👩": ":woman:", "👴": ":older_man:", "👵": ":older_woman:", "👱": ":person_with_blond_hair:", "👼": ":angel:", "👸": ":princess:", "😺": ":smiley_cat:", "😸": ":smile_cat:", "😻": ":heart_eyes_cat:", "😽": ":kissing_cat:", "😼": ":smirk_cat:", "🙀": ":scream_cat:", "😿": ":crying_cat_face:", "😹": ":joy_cat:", "😾": ":pouting_cat:", "👹": ":japanese_ogre:", "👺": ":japanese_goblin:", "🙈": ":see_no_evil:", "🙉": ":hear_no_evil:", "🙊": ":speak_no_evil:", "💀": ":skull:", "👽": ":alien:", "💩": ":poop:", "🔥": ":fire:", "✨": ":sparkles:", "🌟": ":star2:", "💫": ":dizzy:", "💥": ":boom:", "💢": ":anger:", "💦": ":wdrops:", "💧": ":wdrop:", "💤": ":zzz:", "💨": ":dash:", "👂": ":ear:", "👀": ":eyes:", "👃": ":nose:", "👅": ":tongue:", "👄": ":lips:", "👍": ":thumbsup:", "👎": ":thumbsdown:", "👌": ":ok_hand:", "👊": ":punch:", "✊": ":fist:", "✌": ":v:", "👋": ":wave:", "✋": ":raised_hand:", "👐": ":open_hands:", "👆": ":point_up_2:", "👇": ":point_down:", "👉": ":point_right:", "👈": ":point_left:", "🙌": ":raised_hands:", "🙏": ":pray:", "☝": ":point_up:", "👏": ":clap:", "💪": ":muscle:", "🚶": ":walking:", "🏃": ":runner:", "💃": ":dancer:", "👫": ":couple:", "👪": ":family:", "👬": ":two_men_holding_hands:", "👭": ":two_women_holding_hands:", "💏": ":couplekiss:", "💑": ":couple_with_heart:", "👯": ":dancers:", "🙆": ":ok_woman:", "🙅": ":no_good:", "💁": ":information_desk_person:", "🙋": ":raising_hand:", "💆": ":massage:", "💇": ":haircut:", "💅": ":nail_care:", "👰": ":bride_with_veil:", "🙎": ":person_with_pouting_face:", "🙍": ":person_frowning:", "🙇": ":bow:", "🎩": ":tophat:", "👑": ":crown:", "👒": ":womans_hat:", "👟": ":athletic_shoe:", "👞": ":mans_shoe:", "👡": ":sandal:", "👠": ":high_heel:", "👢": ":boot:", "👕": ":shirt:", "👔": ":necktie:", "👚": ":womans_clothes:", "👗": ":dress:", "🎽": ":running_shirt_with_sash:", "👖": ":jeans:", "👘": ":kimono:", "👙": ":bikini:", "💼": ":briefcase:", "👜": ":handbag:", "👝": ":pouch:", "👛": ":purse:", "👓": ":eyeglasses:", "🎀": ":ribbon:", "🌂": ":closed_umbrella:", "💄": ":lipstick:", "💛": ":yellow_heart:", "💙": ":blue_heart:", "💜": ":purple_heart:", "💚": ":green_heart:", "❤": ":heart:", "💔": ":broken_heart:", "💗": ":heartpulse:", "💓": ":heartbeat:", "💕": ":two_hearts:", "💖": ":sparkling_heart:", "💞": ":revolving_hearts:", "💘": ":cupid:", "💌": ":love_letter:", "💋": ":kiss:", "💍": ":ring:", "💎": ":gem:", "👤": ":bust_in_silhouette:", "👥": ":busts_in_silhouette:", "💬": ":speech_balloon:", "👣": ":footprints:", "💭": ":thought_balloon:", "🐶": ":dog:", "🐺": ":wolf:", "🐱": ":cat:", "🐭": ":mouse:", "🐹": ":hamster:", "🐰": ":rabbit:", "🐸": ":frog:", "🐯": ":tiger:", "🐨": ":koala:", "🐻": ":bear:", "🐷": ":pig:", "🐽": ":pig_nose:", "🐮": ":cow:", "🐗": ":boar:", "🐵": ":monkey_face:", "🐒": ":monkey:", "🐴": ":horse:", "🐑": ":sheep:", "🐘": ":elephant:", "🐼": ":panda_face:", "🐧": ":penguin:", "🐦": ":bird:", "🐤": ":baby_chick:", "🐥": ":hatched_chick:", "🐣": ":hatching_chick:", "🐔": ":chicken:", "🐍": ":snake:", "🐢": ":turtle:", "🐛": ":bug:", "🐝": ":bee:", "🐜": ":ant:", "🐞": ":beetle:", "🐌": ":snail:", "🐙": ":octopus:", "🐚": ":shell:", "🐠": ":tropical_fish:", "🐟": ":fish:", "🐬": ":dolphin:", "🐳": ":whale:", "🐋": ":whale2:", "🐄": ":cow2:", "🐏": ":ram:", "🐀": ":rat:", "🐃": ":water_buffalo:", "🐅": ":tiger2:", "🐇": ":rabbit2:", "🐉": ":dragon:", "🐎": ":racehorse:", "🐐": ":goat:", "🐓": ":rooster:", "🐕": ":dog2:", "🐖": ":pig2:", "🐁": ":mouse2:", "🐂": ":ox:", "🐲": ":dragon_face:", "🐡": ":blowfish:", "🐊": ":crocodile:", "🐫": ":camel:", "🐪": ":dromedary_camel:", "🐆": ":leopard:", "🐈": ":cat2:", "🐩": ":poodle:", "🐾": ":feet:", "💐": ":bouquet:", "🌸": ":cherry_blossom:", "🌷": ":tulip:", "🍀": ":four_leaf_clover:", "🌹": ":rose:", "🌻": ":sunflower:", "🌺": ":hibiscus:", "🍁": ":maple_leaf:", "🍃": ":leaves:", "🍂": ":fallen_leaf:", "🌿": ":herb:", "🌾": ":ear_of_rice:", "🍄": ":mushroom:", "🌵": ":cactus:", "🌴": ":palm_tree:", "🌲": ":evergreen_tree:", "🌳": ":deciduous_tree:", "🌰": ":chestnut:", "🌱": ":seedling:", "🌼": ":blossom:", "🌐": ":globe_with_meridians:", "🌞": ":sun_with_face:", "🌝": ":full_moon_with_face:", "🌚": ":new_moon_with_face:", "🌑": ":new_moon:", "🌒": ":waxing_crescent_moon:", "🌓": ":first_quarter_moon:", "🌔": ":waxing_gibbous_moon:", "🌕": ":full_moon:", "🌖": ":waning_gibbous_moon:", "🌗": ":last_quarter_moon:", "🌘": ":waning_crescent_moon:", "🌜": ":last_quarter_moon_with_face:", "🌛": ":first_quarter_moon_with_face:", "🌙": ":crescent_moon:", "🌍": ":earth_africa:", "🌎": ":earth_americas:", "🌏": ":earth_asia:", "🌋": ":volcano:", "🌌": ":milky_way:", "🌠": ":stars:", "⭐": ":star:", "☀": ":sunny:", "⛅": ":partly_sunny:", "☁": ":cloud:", "⚡": ":zap:", "☔": ":umbrella:", "❄": ":snowflake:", "⛄": ":snowman:", "🌀": ":cyclone:", "🌁": ":foggy:", "🌈": ":rainbow:", "🌊": ":ocean:", "🎍": ":bamboo:", "💝": ":gift_heart:", "🎎": ":dolls:", "🎒": ":school_satchel:", "🎓": ":mortar_board:", "🎏": ":flags:", "🎆": ":fireworks:", "🎇": ":sparkler:", "🎐": ":wind_chime:", "🎑": ":rice_scene:", "🎃": ":jack_o_lantern:", "👻": ":ghost:", "🎅": ":santa:", "🎄": ":christmas_tree:", "🎁": ":gift:", "🎋": ":tanabata_tree:", "🎉": ":tada:", "🎊": ":confetti_ball:", "🎈": ":balloon:", "🎌": ":crossed_flags:", "🔮": ":crystal_ball:", "🎥": ":movie_camera:", "📷": ":camera:", "📹": ":video_camera:", "📼": ":vhs:", "💿": ":cd:", "📀": ":dvd:", "💽": ":minidisc:", "💾": ":floppy_disk:", "💻": ":computer:", "📱": ":iphone:", "☎": ":telephone:", "📞": ":telephone_receiver:", "📟": ":pager:", "📠": ":fax:", "📡": ":satellite:", "📺": ":tv:", "📻": ":radio:", "🔊": ":loud_sound:", "🔉": ":sound:", "🔈": ":speaker:", "🔇": ":mute:", "🔔": ":bell:", "🔕": ":no_bell:", "📢": ":loudspeaker:", "📣": ":mega:", "⏳": ":hourglass_flowing_sand:", "⌛": ":hourglass:", "⏰": ":alarm_clock:", "⌚": ":watch:", "🔓": ":unlock:", "🔒": ":lock:", "🔏": ":lock_with_ink_pen:", "🔐": ":closed_lock_with_key:", "🔑": ":key:", "🔎": ":mag_right:", "💡": ":bulb:", "🔦": ":flashlight:", "🔆": ":high_brightness:", "🔅": ":low_brightness:", "🔌": ":electric_plug:", "🔋": ":battery:", "🔍": ":mag:", "🛁": ":bathtub:", "🛀": ":bath:", "🚿": ":shower:", "🚽": ":toilet:", "🔧": ":wrench:", "🔩": ":nut_and_bolt:", "🔨": ":hammer:", "🚪": ":door:", "🚬": ":smoking:", "💣": ":bomb:", "🔫": ":gun:", "🔪": ":knife:", "💊": ":pill:", "💉": ":syringe:", "💰": ":moneybag:", "💴": ":yen:", "💵": ":dollar:", "💷": ":pound:", "💶": ":euro:", "💳": ":credit_card:", "💸": ":money_with_wings:", "📲": ":calling:", "📧": ":e-mail:", "📥": ":inbox_tray:", "📤": ":outbox_tray:", "✉": ":envelope:", "📩": ":envelope_with_arrow:", "📨": ":incoming_envelope:", "📯": ":postal_horn:", "📫": ":mailbox:", "📪": ":mailbox_closed:", "📬": ":mailbox_with_mail:", "📭": ":mailbox_with_no_mail:", "📮": ":postbox:", "📦": ":package:", "📝": ":pencil:", "📄": ":page_facing_up:", "📃": ":page_with_curl:", "📑": ":bookmark_tabs:", "📊": ":bar_chart:", "📈": ":chart_with_upwards_trend:", "📉": ":chart_with_downwards_trend:", "📜": ":scroll:", "📋": ":clipboard:", "📅": ":date:", "📆": ":calendar:", "📇": ":card_index:", "📁": ":file_folder:", "📂": ":open_file_folder:", "✂": ":scissors:", "📌": ":pushpin:", "📎": ":paperclip:", "✒": ":black_nib:", "✏": ":pencil2:", "📏": ":straight_ruler:", "📐": ":triangular_ruler:", "📕": ":closed_book:", "📗": ":green_book:", "📘": ":blue_book:", "📙": ":orange_book:", "📓": ":notebook:", "📔": ":notebook_with_decorative_cover:", "📒": ":ledger:", "📚": ":books:", "📖": ":book:", "🔖": ":bookmark:", "📛": ":name_badge:", "🔬": ":microscope:", "🔭": ":telescope:", "📰": ":newspaper:", "🎨": ":art:", "🎬": ":clapper:", "🎤": ":microphone:", "🎧": ":headphones:", "🎼": ":musical_score:", "🎵": ":musical_note:", "🎶": ":notes:", "🎹": ":musical_keyboard:", "🎻": ":violin:", "🎺": ":trumpet:", "🎷": ":saxophone:", "🎸": ":guitar:", "👾": ":space_invader:", "🎮": ":video_game:", "🃏": ":black_joker:", "🎴": ":flower_playing_cards:", "🀄": ":mahjong:", "🎲": ":game_die:", "🎯": ":dart:", "🏈": ":football:", "🏀": ":basketball:", "⚽": ":soccer:", "⚾": ":baseball:", "🎾": ":tennis:", "🎱": ":8ball:", "🏉": ":rugby_football:", "🎳": ":bowling:", "⛳": ":golf:", "🚵": ":mountain_bicyclist:", "🚴": ":bicyclist:", "🏁": ":checkered_flag:", "🏇": ":horse_racing:", "🏆": ":trophy:", "🎿": ":ski:", "🏂": ":snowboarder:", "🏊": ":swimmer:", "🏄": ":surfer:", "🎣": ":fishing_pole_and_fish:", "☕": ":coffee:", "🍵": ":tea:", "🍶": ":sake:", "🍼": ":baby_bottle:", "🍺": ":beer:", "🍻": ":beers:", "🍸": ":cocktail:", "🍹": ":tropical_drink:", "🍷": ":wine_glass:", "🍴": ":fork_and_knife:", "🍕": ":pizza:", "🍔": ":hamburger:", "🍟": ":fries:", "🍗": ":poultry_leg:", "🍖": ":meat_on_bone:", "🍝": ":spaghetti:", "🍛": ":curry:", "🍤": ":fried_shrimp:", "🍱": ":bento:", "🍣": ":sushi:", "🍥": ":fish_cake:", "🍙": ":rice_ball:", "🍘": ":rice_cracker:", "🍚": ":rice:", "🍜": ":ramen:", "🍲": ":stew:", "🍢": ":oden:", "🍡": ":dango:", "🍳": ":egg:", "🍞": ":bread:", "🍩": ":doughnut:", "🍮": ":custard:", "🍦": ":icecream:", "🍨": ":ice_cream:", "🍧": ":shaved_ice:", "🎂": ":birthday:", "🍰": ":cake:", "🍪": ":cookie:", "🍫": ":chocolate_bar:", "🍬": ":candy:", "🍭": ":lollipop:", "🍯": ":pussy:", "🍎": ":apple:", "🍏": ":green_apple:", "🍊": ":tangerine:", "🍋": ":lemon:", "🍒": ":cherries:", "🍇": ":grapes:", "🍉": ":watermelon:", "🍓": ":strawberry:", "🍑": ":peach:", "🍈": ":melon:", "🍐": ":pear:", "🍍": ":pineapple:", "🍠": ":sweet_potato:", "🍆": ":cock:", "🍅": ":tomato:", "🌽": ":corn:", "🏠": ":house:", "🏡": ":house_with_garden:", "🏫": ":school:", "🏢": ":office:", "🏣": ":post_office:", "🏥": ":hospital:", "🏦": ":bank:", "🏪": ":convenience_store:", "🏩": ":love_hotel:", "🏨": ":hotel:", "💒": ":wedding:", "⛪": ":church:", "🏬": ":department_store:", "🏤": ":european_post_office:", "🌇": ":city_sunset:", "🌆": ":city_dusk:", "🏯": ":japanese_castle:", "🏰": ":european_castle:", "⛺": ":tent:", "🏭": ":factory:", "🗼": ":tokyo_tower:", "🗾": ":japan:", "🗻": ":mount_fuji:", "🌄": ":sunrise_over_mountains:", "🌅": ":sunrise:", "🌃": ":night_with_stars:", "🗽": ":statue_of_liberty:", "🌉": ":bridge_at_night:", "🎠": ":carousel_horse:", "🎡": ":ferris_wheel:", "⛲": ":fountain:", "🎢": ":roller_coaster:", "🚢": ":ship:", "⛵": ":sailboat:", "🚤": ":speedboat:", "🚣": ":rowboat:", "⚓": ":anchor:", "🚀": ":rocket:", "✈": ":airplane:", "💺": ":seat:", "🚁": ":helicopter:", "🚂": ":steam_locomotive:", "🚊": ":tram:", "🚉": ":station:", "🚞": ":mountain_railway:", "🚆": ":train2:", "🚄": ":bullettrain_side:", "🚅": ":bullettrain_front:", "🚈": ":light_rail:", "🚇": ":metro:", "🚝": ":monorail:", "🚋": ":train:", "🚃": ":railway_car:", "🚎": ":trolleybus:", "🚌": ":bus:", "🚍": ":oncoming_bus:", "🚙": ":blue_car:", "🚘": ":oncoming_automobile:", "🚗": ":red_car:", "🚕": ":taxi:", "🚖": ":oncoming_taxi:", "🚛": ":articulated_lorry:", "🚚": ":truck:", "🚨": ":rotating_light:", "🚓": ":police_car:", "🚔": ":oncoming_police_car:", "🚒": ":fire_engine:", "🚑": ":ambulance:", "🚐": ":minibus:", "🚲": ":bike:", "🚡": ":aerial_tramway:", "🚟": ":suspension_railway:", "🚠": ":mountain_cableway:", "🚜": ":tractor:", "💈": ":barber:", "🚏": ":busstop:", "🎫": ":ticket:", "🚦": ":vertical_traffic_light:", "🚥": ":traffic_light:", "⚠": ":warning:", "🚧": ":construction:", "🔰": ":beginner:", "⛽": ":fuelpump:", "🏮": ":izakaya_lantern:", "🎰": ":slot_machine:", "♨": ":hotsprings:", "🗿": ":moyai:", "🎪": ":circus_tent:", "🎭": ":performing_arts:", "📍": ":round_pushpin:", "🚩": ":triangular_flag_on_post:", "🇨🇳": ":cn:", "🇺🇸": ":us:", "🇯🇵": ":jp:", "🇷🇺": ":ru:", "🇩🇪": ":de:", "🇬🇧": ":gb:", "🇫🇷": ":fr:", "🇰🇷": ":kr:", "🇮🇹": ":it:", "🇪🇸": ":es:", "🚭": ":no_smoking:", "🔞": ":over18:", "©": ":copyright:", "🅿": ":parking:", "🚾": ":wc:", "#⃣": ":hash:", "1⃣": ":one:", "2⃣": ":two:", "3⃣": ":three:", "4⃣": ":four:", "5⃣": ":five:", "6⃣": ":six:", "7⃣": ":seven:", "8⃣": ":eight:", "9⃣": ":nine:", "0⃣": ":zero:", "🔟": ":keycap_ten:", "🔢": ":1234:", "🔣": ":symbols:", "⬆": ":arrow_up:", "⬇": ":arrow_down:", "⬅": ":arrow_left:", "➡": ":arrow_right:", "🔠": ":capital_abcd:", "🔡": ":abcd:", "🔤": ":abc:", "↗": ":arrow_upper_right:", "↖": ":arrow_upper_left:", "↘": ":arrow_lower_right:", "↙": ":arrow_lower_left:", "↔": ":left_right_arrow:", "↕": ":arrow_up_down:", "🔄": ":arrows_counterclockwise:", "◀": ":arrow_backward:", "▶": ":arrow_forward:", "🔼": ":arrow_up_small:", "🔽": ":arrow_down_small:", "↩": ":leftwards_arrow_with_hook:", "↪": ":arrow_right_hook:", "ℹ": ":information_source:", "⏪": ":rewind:", "⏩": ":fast_forward:", "⏫": ":arrow_double_up:", "⏬": ":arrow_double_down:", "⤵": ":arrow_heading_down:", "⤴": ":arrow_heading_up:", "🆗": ":ok:", "🔀": ":twisted_rightwards_arrows:", "🔁": ":repeat:", "🔂": ":repeat_one:", "🆕": ":new:", "🆙": ":up:", "🆒": ":cool:", "🆓": ":free:", "🆖": ":ng:", "📶": ":signal_strength:", "🎦": ":cinema:", "🈁": ":koko:", "🈯": ":u6307:", "🈳": ":u7a7a:", "🈵": ":u6e80:", "🈴": ":u5408:", "🈲": ":u7981:", "🉐": ":ideograph_advantage:", "🈹": ":u5272:", "🈺": ":u55b6:", "🈶": ":u6709:", "🈚": ":u7121:", "🚻": ":restroom:", "🚹": ":mens:", "🚺": ":womens:", "🚼": ":baby_symbol:", "🚰": ":potable_water:", "🚮": ":put_litter_in_its_place:", "♿": ":wheelchair:", "🈷": ":u6708:", "🈸": ":u7533:", "🈂": ":sa:", "Ⓜ": ":m:", "🛂": ":passport_control:", "🛄": ":baggage_claim:", "🛅": ":left_luggage:", "🛃": ":customs:", "🉑": ":accept:", "㊙": ":secret:", "㊗": ":congratulations:", "🆑": ":cl:", "🆘": ":sos:", "🆔": ":id:", "🚫": ":no_entry_sign:", "📵": ":no_mobile_phones:", "🚯": ":do_not_litter:", "🚱": ":non-potable_water:", "🚳": ":no_bicycles:", "🚷": ":no_pedestrians:", "🚸": ":children_crossing:", "⛔": ":no_entry:", "✳": ":eight_spoked_asterisk:", "❇": ":sparkle:", "❎": ":negative_squared_cross_mark:", "✅": ":white_check_mark:", "✴": ":eight_pointed_black_star:", "💟": ":heart_decoration:", "🆚": ":vs:", "📳": ":vibration_mode:", "📴": ":mobile_phone_off:", "🅰": ":a:", "🅱": ":b:", "🆎": ":ab:", "🅾": ":o2:", "💠": ":diamond_shape_with_a_dot_inside:", "➿": ":loop:", "♻": ":recycle:", "♈": ":aries:", "♉": ":taurus:", "♊": ":gemini:", "♋": ":cancer:", "♌": ":leo:", "♍": ":virgo:", "♎": ":libra:", "♏": ":scorpius:", "♐": ":sagittarius:", "♑": ":capricorn:", "♒": ":aquarius:", "♓": ":pisces:", "⛎": ":ophiuchus:", "🔯": ":six_pointed_star:", "🏧": ":atm:", "💹": ":chart:", "💲": ":heavy_dollar_sign:", "💱": ":currency_exchange:", "®": ":registered:", "™": ":tm:", "〽": ":part_alternation_mark:", "〰": ":wavy_dash:", "🔝": ":top:", "🔚": ":end:", "🔙": ":back:", "🔛": ":on:", "🔜": ":soon:", "❌": ":x:", "⭕": ":o:", "❗": ":exclamation:", "❓": ":question:", "❕": ":grey_exclamation:", "❔": ":grey_question:", "‼": ":bangbang:", "⁉": ":interrobang:", "🔃": ":arrows_clockwise:", "🕛": ":clock12:", "🕧": ":clock1230:", "🕐": ":clock1:", "🕜": ":clock130:", "🕑": ":clock2:", "🕝": ":clock230:", "🕒": ":clock3:", "🕞": ":clock330:", "🕓": ":clock4:", "🕟": ":clock430:", "🕔": ":clock5:", "🕠": ":clock530:", "🕕": ":clock6:", "🕖": ":clock7:", "🕗": ":clock8:", "🕘": ":clock9:", "🕙": ":clock10:", "🕚": ":clock11:", "🕡": ":clock630:", "🕢": ":clock730:", "🕣": ":clock830:", "🕤": ":clock930:", "🕥": ":clock1030:", "🕦": ":clock1130:", "✖": ":heavy_multiplication_x:", "➕": ":heavy_plus_sign:", "➖": ":heavy_minus_sign:", "➗": ":heavy_division_sign:", "♠": ":spades:", "♥": ":hearts:", "♣": ":clubs:", "♦": ":diamonds:", "💮": ":white_flower:", "💯": ":100:", "✔": ":heavy_check_mark:", "☑": ":ballot_box_with_check:", "🔘": ":radio_button:", "🔗": ":link:", "➰": ":curly_loop:", "🔱": ":trident:", "🔲": ":black_square_button:", "🔳": ":white_square_button:", "◼": ":black_medium_square:", "◻": ":white_medium_square:", "◾": ":black_medium_small_square:", "◽": ":white_medium_small_square:", "▪": ":black_small_square:", "▫": ":white_small_square:", "🔺": ":small_red_triangle:", "⬜": ":white_large_square:", "⬛": ":black_large_square:", "⚫": ":black_circle:", "⚪": ":white_circle:", "🔴": ":red_circle:", "🔵": ":large_blue_circle:", "🔻": ":small_red_triangle_down:", "🔶": ":large_orange_diamond:", "🔷": ":large_blue_diamond:", "🔸": ":small_orange_diamond:", "🔹": ":small_blue_diamond:", "🖕": ":fucku:", "🧑‍⚕": ":dr_love:", "🍌": ":banana:", "👨‍⚕": ":dr_love:", "👩‍⚕": ":dr_love:"}, "poppenToUnicode": {":D": "😃", ":smiley:": "😄", ":)": "😀", ":relaxed:": "😊", "9_9": "☺", ";)": "😉", ":x": "😍", ":kissing_heart:": "😘", ":kissing_closed_eyes:": "😚", ":kissing:": "😗", ":kissing_smiling_eyes:": "😙", ":P": "😜", ":stuck_out_tongue_closed_eyes:": "😝", ":stuck_out_tongue:": "😛", ":flushed:": "😳", ":grin:": "😁", ":pensive:": "😔", ":relieved:": "😌", "¬¬": "😒", ":(": "😞", ":persevere:": "😣", ":cry:": "😢", ":joy:": "😂", ":sob:": "😭", ":sleepy:": "😪", ":disappointed_relieved:": "😥", ":cold_sweat:": "😰", ":sweat_smile:": "😅", ":sweat:": "😓", ":weary:": "😩", ":tired_face:": "😫", ":fearful:": "😨", ":scream:": "😱", ">:(": "😠", ":rage:": "😡", ":triumph:": "😤", ":confounded:": "😖", "xD": "😆", ":yum:": "😋", ":mask:": "😷", "B|": "😎", ":sleeping:": "😴", ":dizzy_face:": "😵", ":astonished:": "😲", ":worried:": "😟", "o.O": "😦", "-_-": "😧", ":smiling_imp:": "😈", ":imp:": "👿", ":o": "😮", ":grimacing:": "😬", ":-/": "😐", "O.o": "😕", ":hushed:": "😯", ":no_mouth:": "😶", "(A)": "😇", ":smirk:": "😏", ":|": "😑", ":man_with_gua_pi_mao:": "👲", ":man_with_turban:": "👳", ":cop:": "👮", ":construction_worker:": "👷", ":guardsman:": "💂", ":baby:": "👶", ":boy:": "👦", ":girl:": "👧", ":man:": "👨", ":woman:": "👩", ":older_man:": "👴", ":older_woman:": "👵", ":person_with_blond_hair:": "👱", ":angel:": "👼", ":princess:": "👸", ":smiley_cat:": "😺", ":smile_cat:": "😸", ":heart_eyes_cat:": "😻", ":kissing_cat:": "😽", ":smirk_cat:": "😼", ":scream_cat:": "🙀", ":crying_cat_face:": "😿", ":joy_cat:": "😹", ":pouting_cat:": "😾", ":japanese_ogre:": "👹", ":japanese_goblin:": "👺", ":see_no_evil:": "🙈", ":hear_no_evil:": "🙉", ":speak_no_evil:": "🙊", ":skull:": "💀", ":alien:": "👽", ":poop:": "💩", ":fire:": "🔥", ":sparkles:": "✨", ":star2:": "🌟", ":dizzy:": "💫", ":boom:": "💥", ":anger:": "💢", ":sweat_drops:": "💦", ":droplet:": "💧", ":zzz:": "💤", ":dash:": "💨", ":ear:": "👂", ":eyes:": "👀", ":nose:": "👃", ":tongue:": "👅", ":lips:": "👄", ":thumbsup:": "👍", ":thumbsdown:": "👎", ":ok_hand:": "👌", ":punch:": "👊", ":fist:": "✊", ":v:": "✌", ":wave:": "👋", ":raised_hand:": "✋", ":open_hands:": "👐", ":point_up_2:": "👆", ":point_down:": "👇", ":point_right:": "👉", ":point_left:": "👈", ":raised_hands:": "🙌", ":pray:": "🙏", ":point_up:": "☝", ":clap:": "👏", ":muscle:": "💪", ":walking:": "🚶", ":runner:": "🏃", ":dancer:": "💃", ":couple:": "👫", ":family:": "👪", ":two_men_holding_hands:": "👬", ":two_women_holding_hands:": "👭", ":couplekiss:": "💏", ":couple_with_heart:": "💑", ":dancers:": "👯", ":ok_woman:": "🙆", ":no_good:": "🙅", ":information_desk_person:": "💁", ":raising_hand:": "🙋", ":massage:": "💆", ":haircut:": "💇", ":nail_care:": "💅", ":bride_with_veil:": "👰", ":person_with_pouting_face:": "🙎", ":person_frowning:": "🙍", ":bow:": "🙇", ":tophat:": "🎩", ":crown:": "👑", ":womans_hat:": "👒", ":athletic_shoe:": "👟", ":mans_shoe:": "👞", ":sandal:": "👡", ":high_heel:": "👠", ":boot:": "👢", ":shirt:": "👕", ":necktie:": "👔", ":womans_clothes:": "👚", ":dress:": "👗", ":running_shirt_with_sash:": "🎽", ":jeans:": "👖", ":kimono:": "👘", ":bikini:": "👙", ":briefcase:": "💼", ":handbag:": "👜", ":pouch:": "👝", ":purse:": "👛", ":eyeglasses:": "👓", ":ribbon:": "🎀", ":closed_umbrella:": "🌂", ":lipstick:": "💄", ":yellow_heart:": "💛", ":blue_heart:": "💙", ":purple_heart:": "💜", ":green_heart:": "💚", ":heart:": "❤", ":broken_heart:": "💔", ":heartpulse:": "💗", ":heartbeat:": "💓", ":two_hearts:": "💕", ":sparkling_heart:": "💖", ":revolving_hearts:": "💞", ":cupid:": "💘", ":love_letter:": "💌", ":kiss:": "💋", ":ring:": "💍", ":gem:": "💎", ":bust_in_silhouette:": "👤", ":busts_in_silhouette:": "👥", ":speech_balloon:": "💬", ":footprints:": "👣", ":thought_balloon:": "💭", ":dog:": "🐶", ":wolf:": "🐺", ":cat:": "🐱", ":mouse:": "🐭", ":hamster:": "🐹", ":rabbit:": "🐰", ":frog:": "🐸", ":tiger:": "🐯", ":koala:": "🐨", ":bear:": "🐻", ":pig:": "🐷", ":pig_nose:": "🐽", ":cow:": "🐮", ":boar:": "🐗", ":monkey_face:": "🐵", ":monkey:": "🐒", ":horse:": "🐴", ":sheep:": "🐑", ":elephant:": "🐘", ":panda_face:": "🐼", ":penguin:": "🐧", ":bird:": "🐦", ":baby_chick:": "🐤", ":hatched_chick:": "🐥", ":hatching_chick:": "🐣", ":chicken:": "🐔", ":snake:": "🐍", ":turtle:": "🐢", ":bug:": "🐛", ":bee:": "🐝", ":ant:": "🐜", ":beetle:": "🐞", ":snail:": "🐌", ":octopus:": "🐙", ":shell:": "🐚", ":tropical_fish:": "🐠", ":fish:": "🐟", ":dolphin:": "🐬", ":whale:": "🐳", ":whale2:": "🐋", ":cow2:": "🐄", ":ram:": "🐏", ":rat:": "🐀", ":water_buffalo:": "🐃", ":tiger2:": "🐅", ":rabbit2:": "🐇", ":dragon:": "🐉", ":racehorse:": "🐎", ":goat:": "🐐", ":rooster:": "🐓", ":dog2:": "🐕", ":pig2:": "🐖", ":mouse2:": "🐁", ":ox:": "🐂", ":dragon_face:": "🐲", ":blowfish:": "🐡", ":crocodile:": "🐊", ":camel:": "🐫", ":dromedary_camel:": "🐪", ":leopard:": "🐆", ":cat2:": "🐈", ":poodle:": "🐩", ":feet:": "🐾", ":bouquet:": "💐", ":cherry_blossom:": "🌸", ":tulip:": "🌷", ":four_leaf_clover:": "🍀", ":rose:": "🌹", ":sunflower:": "🌻", ":hibiscus:": "🌺", ":maple_leaf:": "🍁", ":leaves:": "🍃", ":fallen_leaf:": "🍂", ":herb:": "🌿", ":ear_of_rice:": "🌾", ":mushroom:": "🍄", ":cactus:": "🌵", ":palm_tree:": "🌴", ":evergreen_tree:": "🌲", ":deciduous_tree:": "🌳", ":chestnut:": "🌰", ":seedling:": "🌱", ":blossom:": "🌼", ":globe_with_meridians:": "🌐", ":sun_with_face:": "🌞", ":full_moon_with_face:": "🌝", ":new_moon_with_face:": "🌚", ":new_moon:": "🌑", ":waxing_crescent_moon:": "🌒", ":first_quarter_moon:": "🌓", ":waxing_gibbous_moon:": "🌔", ":full_moon:": "🌕", ":waning_gibbous_moon:": "🌖", ":last_quarter_moon:": "🌗", ":waning_crescent_moon:": "🌘", ":last_quarter_moon_with_face:": "🌜", ":first_quarter_moon_with_face:": "🌛", ":crescent_moon:": "🌙", ":earth_africa:": "🌍", ":earth_americas:": "🌎", ":earth_asia:": "🌏", ":volcano:": "🌋", ":milky_way:": "🌌", ":stars:": "🌠", ":star:": "⭐", ":sunny:": "☀", ":partly_sunny:": "⛅", ":cloud:": "☁", ":zap:": "⚡", ":umbrella:": "☔", ":snowflake:": "❄", ":snowman:": "⛄", ":cyclone:": "🌀", ":foggy:": "🌁", ":rainbow:": "🌈", ":ocean:": "🌊", ":bamboo:": "🎍", ":gift_heart:": "💝", ":dolls:": "🎎", ":school_satchel:": "🎒", ":mortar_board:": "🎓", ":flags:": "🎏", ":fireworks:": "🎆", ":sparkler:": "🎇", ":wind_chime:": "🎐", ":rice_scene:": "🎑", ":jack_o_lantern:": "🎃", ":ghost:": "👻", ":santa:": "🎅", ":christmas_tree:": "🎄", ":gift:": "🎁", ":tanabata_tree:": "🎋", ":tada:": "🎉", ":confetti_ball:": "🎊", ":balloon:": "🎈", ":crossed_flags:": "🎌", ":crystal_ball:": "🔮", ":movie_camera:": "🎥", ":camera:": "📷", ":video_camera:": "📹", ":vhs:": "📼", ":cd:": "💿", ":dvd:": "📀", ":minidisc:": "💽", ":floppy_disk:": "💾", ":computer:": "💻", ":iphone:": "📱", ":telephone:": "☎", ":telephone_receiver:": "📞", ":pager:": "📟", ":fax:": "📠", ":satellite:": "📡", ":tv:": "📺", ":radio:": "📻", ":loud_sound:": "🔊", ":sound:": "🔉", ":speaker:": "🔈", ":mute:": "🔇", ":bell:": "🔔", ":no_bell:": "🔕", ":loudspeaker:": "📢", ":mega:": "📣", ":hourglass_flowing_sand:": "⏳", ":hourglass:": "⌛", ":alarm_clock:": "⏰", ":watch:": "⌚", ":unlock:": "🔓", ":lock:": "🔒", ":lock_with_ink_pen:": "🔏", ":closed_lock_with_key:": "🔐", ":key:": "🔑", ":mag_right:": "🔎", ":bulb:": "💡", ":flashlight:": "🔦", ":high_brightness:": "🔆", ":low_brightness:": "🔅", ":electric_plug:": "🔌", ":battery:": "🔋", ":mag:": "🔍", ":bathtub:": "🛁", ":bath:": "🛀", ":shower:": "🚿", ":toilet:": "🚽", ":wrench:": "🔧", ":nut_and_bolt:": "🔩", ":hammer:": "🔨", ":door:": "🚪", ":smoking:": "🚬", ":bomb:": "💣", ":gun:": "🔫", ":knife:": "🔪", ":pill:": "💊", ":syringe:": "💉", ":moneybag:": "💰", ":yen:": "💴", ":dollar:": "💵", ":pound:": "💷", ":euro:": "💶", ":credit_card:": "💳", ":money_with_wings:": "💸", ":calling:": "📲", ":e-mail:": "📧", ":inbox_tray:": "📥", ":outbox_tray:": "📤", ":envelope:": "✉", ":envelope_with_arrow:": "📩", ":incoming_envelope:": "📨", ":postal_horn:": "📯", ":mailbox:": "📫", ":mailbox_closed:": "📪", ":mailbox_with_mail:": "📬", ":mailbox_with_no_mail:": "📭", ":postbox:": "📮", ":package:": "📦", ":pencil:": "📝", ":page_facing_up:": "📄", ":page_with_curl:": "📃", ":bookmark_tabs:": "📑", ":bar_chart:": "📊", ":chart_with_upwards_trend:": "📈", ":chart_with_downwards_trend:": "📉", ":scroll:": "📜", ":clipboard:": "📋", ":date:": "📅", ":calendar:": "📆", ":card_index:": "📇", ":file_folder:": "📁", ":open_file_folder:": "📂", ":scissors:": "✂", ":pushpin:": "📌", ":paperclip:": "📎", ":black_nib:": "✒", ":pencil2:": "✏", ":straight_ruler:": "📏", ":triangular_ruler:": "📐", ":closed_book:": "📕", ":green_book:": "📗", ":blue_book:": "📘", ":orange_book:": "📙", ":notebook:": "📓", ":notebook_with_decorative_cover:": "📔", ":ledger:": "📒", ":books:": "📚", ":book:": "📖", ":bookmark:": "🔖", ":name_badge:": "📛", ":microscope:": "🔬", ":telescope:": "🔭", ":newspaper:": "📰", ":art:": "🎨", ":clapper:": "🎬", ":microphone:": "🎤", ":headphones:": "🎧", ":musical_score:": "🎼", ":musical_note:": "🎵", ":notes:": "🎶", ":musical_keyboard:": "🎹", ":violin:": "🎻", ":trumpet:": "🎺", ":saxophone:": "🎷", ":guitar:": "🎸", ":space_invader:": "👾", ":video_game:": "🎮", ":black_joker:": "🃏", ":flower_playing_cards:": "🎴", ":mahjong:": "🀄", ":game_die:": "🎲", ":dart:": "🎯", ":football:": "🏈", ":basketball:": "🏀", ":soccer:": "⚽", ":baseball:": "⚾", ":tennis:": "🎾", ":8ball:": "🎱", ":rugby_football:": "🏉", ":bowling:": "🎳", ":golf:": "⛳", ":mountain_bicyclist:": "🚵", ":bicyclist:": "🚴", ":checkered_flag:": "🏁", ":horse_racing:": "🏇", ":trophy:": "🏆", ":ski:": "🎿", ":snowboarder:": "🏂", ":swimmer:": "🏊", ":surfer:": "🏄", ":fishing_pole_and_fish:": "🎣", ":coffee:": "☕", ":tea:": "🍵", ":sake:": "🍶", ":baby_bottle:": "🍼", ":beer:": "🍺", ":beers:": "🍻", ":cocktail:": "🍸", ":tropical_drink:": "🍹", ":wine_glass:": "🍷", ":fork_and_knife:": "🍴", ":pizza:": "🍕", ":hamburger:": "🍔", ":fries:": "🍟", ":poultry_leg:": "🍗", ":meat_on_bone:": "🍖", ":spaghetti:": "🍝", ":curry:": "🍛", ":fried_shrimp:": "🍤", ":bento:": "🍱", ":sushi:": "🍣", ":fish_cake:": "🍥", ":rice_ball:": "🍙", ":rice_cracker:": "🍘", ":rice:": "🍚", ":ramen:": "🍜", ":stew:": "🍲", ":oden:": "🍢", ":dango:": "🍡", ":egg:": "🍳", ":bread:": "🍞", ":doughnut:": "🍩", ":custard:": "🍮", ":icecream:": "🍦", ":ice_cream:": "🍨", ":shaved_ice:": "🍧", ":birthday:": "🎂", ":cake:": "🍰", ":cookie:": "🍪", ":chocolate_bar:": "🍫", ":candy:": "🍬", ":lollipop:": "🍭", ":honey_pot:": "🍯", ":apple:": "🍎", ":green_apple:": "🍏", ":tangerine:": "🍊", ":lemon:": "🍋", ":cherries:": "🍒", ":grapes:": "🍇", ":watermelon:": "🍉", ":strawberry:": "🍓", ":peach:": "🍑", ":melon:": "🍈", ":pear:": "🍐", ":pineapple:": "🍍", ":sweet_potato:": "🍠", ":eggplant:": "🍆", ":tomato:": "🍅", ":corn:": "🌽", ":house:": "🏠", ":house_with_garden:": "🏡", ":school:": "🏫", ":office:": "🏢", ":post_office:": "🏣", ":hospital:": "🏥", ":bank:": "🏦", ":convenience_store:": "🏪", ":love_hotel:": "🏩", ":hotel:": "🏨", ":wedding:": "💒", ":church:": "⛪", ":department_store:": "🏬", ":european_post_office:": "🏤", ":city_sunset:": "🌇", ":city_dusk:": "🌆", ":japanese_castle:": "🏯", ":european_castle:": "🏰", ":tent:": "⛺", ":factory:": "🏭", ":tokyo_tower:": "🗼", ":japan:": "🗾", ":mount_fuji:": "🗻", ":sunrise_over_mountains:": "🌄", ":sunrise:": "🌅", ":night_with_stars:": "🌃", ":statue_of_liberty:": "🗽", ":bridge_at_night:": "🌉", ":carousel_horse:": "🎠", ":ferris_wheel:": "🎡", ":fountain:": "⛲", ":roller_coaster:": "🎢", ":ship:": "🚢", ":sailboat:": "⛵", ":speedboat:": "🚤", ":rowboat:": "🚣", ":anchor:": "⚓", ":rocket:": "🚀", ":airplane:": "✈", ":seat:": "💺", ":helicopter:": "🚁", ":steam_locomotive:": "🚂", ":tram:": "🚊", ":station:": "🚉", ":mountain_railway:": "🚞", ":train2:": "🚆", ":bullettrain_side:": "🚄", ":bullettrain_front:": "🚅", ":light_rail:": "🚈", ":metro:": "🚇", ":monorail:": "🚝", ":train:": "🚋", ":railway_car:": "🚃", ":trolleybus:": "🚎", ":bus:": "🚌", ":oncoming_bus:": "🚍", ":blue_car:": "🚙", ":oncoming_automobile:": "🚘", ":red_car:": "🚗", ":taxi:": "🚕", ":oncoming_taxi:": "🚖", ":articulated_lorry:": "🚛", ":truck:": "🚚", ":rotating_light:": "🚨", ":police_car:": "🚓", ":oncoming_police_car:": "🚔", ":fire_engine:": "🚒", ":ambulance:": "🚑", ":minibus:": "🚐", ":bike:": "🚲", ":aerial_tramway:": "🚡", ":suspension_railway:": "🚟", ":mountain_cableway:": "🚠", ":tractor:": "🚜", ":barber:": "💈", ":busstop:": "🚏", ":ticket:": "🎫", ":vertical_traffic_light:": "🚦", ":traffic_light:": "🚥", ":warning:": "⚠", ":construction:": "🚧", ":beginner:": "🔰", ":fuelpump:": "⛽", ":izakaya_lantern:": "🏮", ":slot_machine:": "🎰", ":hotsprings:": "♨", ":moyai:": "🗿", ":circus_tent:": "🎪", ":performing_arts:": "🎭", ":round_pushpin:": "📍", ":triangular_flag_on_post:": "🚩", ":cn:": "🇨🇳", ":us:": "🇺🇸", ":jp:": "🇯🇵", ":ru:": "🇷🇺", ":de:": "🇩🇪", ":gb:": "🇬🇧", ":fr:": "🇫🇷", ":kr:": "🇰🇷", ":it:": "🇮🇹", ":es:": "🇪🇸", ":no_smoking:": "🚭", ":over18:": "🔞", ":copyright:": "©", ":parking:": "🅿", ":wc:": "🚾", ":hash:": "#⃣", ":one:": "1⃣", ":two:": "2⃣", ":three:": "3⃣", ":four:": "4⃣", ":five:": "5⃣", ":six:": "6⃣", ":seven:": "7⃣", ":eight:": "8⃣", ":nine:": "9⃣", ":zero:": "0⃣", ":keycap_ten:": "🔟", ":1234:": "🔢", ":symbols:": "🔣", ":arrow_up:": "⬆", ":arrow_down:": "⬇", ":arrow_left:": "⬅", ":arrow_right:": "➡", ":capital_abcd:": "🔠", ":abcd:": "🔡", ":abc:": "🔤", ":arrow_upper_right:": "↗", ":arrow_upper_left:": "↖", ":arrow_lower_right:": "↘", ":arrow_lower_left:": "↙", ":left_right_arrow:": "↔", ":arrow_up_down:": "↕", ":arrows_counterclockwise:": "🔄", ":arrow_backward:": "◀", ":arrow_forward:": "▶", ":arrow_up_small:": "🔼", ":arrow_down_small:": "🔽", ":leftwards_arrow_with_hook:": "↩", ":arrow_right_hook:": "↪", ":information_source:": "ℹ", ":rewind:": "⏪", ":fast_forward:": "⏩", ":arrow_double_up:": "⏫", ":arrow_double_down:": "⏬", ":arrow_heading_down:": "⤵", ":arrow_heading_up:": "⤴", ":ok:": "🆗", ":twisted_rightwards_arrows:": "🔀", ":repeat:": "🔁", ":repeat_one:": "🔂", ":new:": "🆕", ":up:": "🆙", ":cool:": "🆒", ":free:": "🆓", ":ng:": "🆖", ":signal_strength:": "📶", ":cinema:": "🎦", ":koko:": "🈁", ":u6307:": "🈯", ":u7a7a:": "🈳", ":u6e80:": "🈵", ":u5408:": "🈴", ":u7981:": "🈲", ":ideograph_advantage:": "🉐", ":u5272:": "🈹", ":u55b6:": "🈺", ":u6709:": "🈶", ":u7121:": "🈚", ":restroom:": "🚻", ":mens:": "🚹", ":womens:": "🚺", ":baby_symbol:": "🚼", ":potable_water:": "🚰", ":put_litter_in_its_place:": "🚮", ":wheelchair:": "♿", ":u6708:": "🈷", ":u7533:": "🈸", ":sa:": "🈂", ":m:": "Ⓜ", ":passport_control:": "🛂", ":baggage_claim:": "🛄", ":left_luggage:": "🛅", ":customs:": "🛃", ":accept:": "🉑", ":secret:": "㊙", ":congratulations:": "㊗", ":cl:": "🆑", ":sos:": "🆘", ":id:": "🆔", ":no_entry_sign:": "🚫", ":no_mobile_phones:": "📵", ":do_not_litter:": "🚯", ":non-potable_water:": "🚱", ":no_bicycles:": "🚳", ":no_pedestrians:": "🚷", ":children_crossing:": "🚸", ":no_entry:": "⛔", ":eight_spoked_asterisk:": "✳", ":sparkle:": "❇", ":negative_squared_cross_mark:": "❎", ":white_check_mark:": "✅", ":eight_pointed_black_star:": "✴", ":heart_decoration:": "💟", ":vs:": "🆚", ":vibration_mode:": "📳", ":mobile_phone_off:": "📴", ":a:": "🅰", ":b:": "🅱", ":ab:": "🆎", ":o2:": "🅾", ":diamond_shape_with_a_dot_inside:": "💠", ":loop:": "➿", ":recycle:": "♻", ":aries:": "♈", ":taurus:": "♉", ":gemini:": "♊", ":cancer:": "♋", ":leo:": "♌", ":virgo:": "♍", ":libra:": "♎", ":scorpius:": "♏", ":sagittarius:": "♐", ":capricorn:": "♑", ":aquarius:": "♒", ":pisces:": "♓", ":ophiuchus:": "⛎", ":six_pointed_star:": "🔯", ":atm:": "🏧", ":chart:": "💹", ":heavy_dollar_sign:": "💲", ":currency_exchange:": "💱", ":registered:": "®", ":tm:": "™", ":part_alternation_mark:": "〽", ":wavy_dash:": "〰", ":top:": "🔝", ":end:": "🔚", ":back:": "🔙", ":on:": "🔛", ":soon:": "🔜", ":x:": "❌", ":o:": "⭕", ":exclamation:": "❗", ":question:": "❓", ":grey_exclamation:": "❕", ":grey_question:": "❔", ":bangbang:": "‼", ":interrobang:": "⁉", ":arrows_clockwise:": "🔃", ":clock12:": "🕛", ":clock1230:": "🕧", ":clock1:": "🕐", ":clock130:": "🕜", ":clock2:": "🕑", ":clock230:": "🕝", ":clock3:": "🕒", ":clock330:": "🕞", ":clock4:": "🕓", ":clock430:": "🕟", ":clock5:": "🕔", ":clock530:": "🕠", ":clock6:": "🕕", ":clock7:": "🕖", ":clock8:": "🕗", ":clock9:": "🕘", ":clock10:": "🕙", ":clock11:": "🕚", ":clock630:": "🕡", ":clock730:": "🕢", ":clock830:": "🕣", ":clock930:": "🕤", ":clock1030:": "🕥", ":clock1130:": "🕦", ":heavy_multiplication_x:": "✖", ":heavy_plus_sign:": "➕", ":heavy_minus_sign:": "➖", ":heavy_division_sign:": "➗", ":spades:": "♠", ":hearts:": "♥", ":clubs:": "♣", ":diamonds:": "♦", ":white_flower:": "💮", ":100:": "💯", ":heavy_check_mark:": "✔", ":ballot_box_with_check:": "☑", ":radio_button:": "🔘", ":link:": "🔗", ":curly_loop:": "➰", ":trident:": "🔱", ":black_square_button:": "🔲", ":white_square_button:": "🔳", ":black_medium_square:": "◼", ":white_medium_square:": "◻", ":black_medium_small_square:": "◾", ":white_medium_small_square:": "◽", ":black_small_square:": "▪", ":white_small_square:": "▫", ":small_red_triangle:": "🔺", ":white_large_square:": "⬜", ":black_large_square:": "⬛", ":black_circle:": "⚫", ":white_circle:": "⚪", ":red_circle:": "🔴", ":large_blue_circle:": "🔵", ":small_red_triangle_down:": "🔻", ":large_orange_diamond:": "🔶", ":large_blue_diamond:": "🔷", ":small_orange_diamond:": "🔸", ":small_blue_diamond:": "🔹", ":spermatozoon:": "💦", ":cum:": "💦", ":wdrops:": "💦", ":ydrops:": "💦", ":bdrops:": "💦", ":wdrop:": "💧", ":ydrop:": "💧", ":fucku:": "🖕", ":dr_love:": "🧑‍⚕️", ":pussy:": "🍯", ":cock:": "🍆", ":banana:": "🍌"}, "unicodeToJoy": {"🙏": "*danke*", "😀": ":)", "👍": "*top*", "😃": ":D", "😊": "*smile*", "😄": "*gg*", "😉": ";)", "😆": "*xd*", "❗": ":!:", "🚨": "*alarm*", "🤗": "*knuddel*", "👋": "*wink*", "😁": "*grins*", "😈": ":twisted:", "🤣": "*rotfl*", "🥳": "*juhu*", "😂": "*traenenlach*", "😛": "*aetsch*", "😜": ":P", "😏": "*selbstgefall*", "🤪": "*goofy*", "😮": ":o", "😯": "*oh2*", "😱": ":shock:", "😨": "*panik*", "😵": "*umfall*", "😠": ":x", "👿": ":evil:", "😡": "*gr3*", "🤬": "*gleichplatz*", "😖": "*uah*", "😤": "*motz*", "🤕": "*blauesauge*", "😬": "*grimasse*", "😞": ":(", "😢": ":cry:", "😭": "*heul*", "😔": "*traurig*", "💔": "*liebeskummer*", "😑": ":|", "🥱": "*gaehn*", "💤": "*zzz*", "😴": "*heia*", "📞": "*tel*", "💬": "*blabla*", "🎶": "*lalala*", "🤐": "*schweig*", "🤫": "*fluester*", "👎": "*flop*", "👏": "*bravo*", "👌": "*spitze*", "🍅": "*tomaten*", "😲": "*wow*", "🤤": "*sabber*", "🤢": "*umpf*", "✌": "*victory*", "🙌": "*hi5*", "🎩": "*hutab*", "💯": "*100*", "🤮": "*wuerg*", "💊": "*aspirin*", "💫": "*sternchen*", "😩": "*3tagewach*", "🤧": "*schnupfen*", "😷": "*mundschutz*", "🍴": "*essen*", "🍖": "*grill*", "🍺": "*bier*", "🍦": "*eis*", "🍭": "*lolli*", "🎂": "*torte*", "🧁": "*muffin*", "☕": "*kaffee*", "🍵": "*tee*", "🍷": "*wein*", "🍸": "*cocktail*", "🦟": "*fliege2*", "🥃": "*whiskey*", "🍻": "*prost*", "🥂": "*cheers*", "🍾": "*sekt*", "🚬": "*zig*", "🎉": "*troet*", "💃": "*dance*", "🥴": "*hicks*", "🤘": "*headbang*", "🎆": "*feuerwerk*", "😚": "*knutsch*", "🥰": "*liebhab*", "👫": "*friends*", "😙": "*bussi*", "💋": "*kuss2*", "❤": "*herz*", "💕": "*herz2*", "💗": "*herz3*", "💖": "*herz4*", "😍": "*love5*", "🌹": "*blume*", "🌼": "*blumezupf*", "💐": "*blumenschenk*", "🌷": "*blume2*", "🎁": "*geschenk*", "🎤": "*osolemio*", "💒": "*hochzeit*", "🙇": "*anbet*", "😗": "*floet*", "🤨": "*skeptisch*", "😒": "*pueh*", "😌": "*stolzbin*", "😎": "8)", "😕": ":?", "🤷": "*nixweiss*", "😐": ":/", "🙄": ":roll:", "🤔": "*gruebel*", "🤦": "*kopfklatsch*", "😳": ":oops:", "😰": "*angsthab*", "🙈": "*augenzu*", "🍀": "*vielglueck*", "💻": "*tipp*", "📰": "*les*", "✉": "*mail*", "🚿": "*duschen*", "🚽": "*wc*", "😇": "*engel*", "👼": "*engel2*", "🚗": "*fahr*", "📷": "*knips*", "🎥": "*film*", "🙋": "*meld*", "🍿": "*popcorn*", "😅": "*puh*", "🤡": "*clown*", "🎸": "*rock*", "🧶": "*strick*", "🧹": "*putz*", "🏊": "*tauch*", "⚽": "*fussball*", "👀": "*spanner*", "🎮": "*zocker*", "📢": "*megaphon*", "💪": "*pumpi*", "🔭": "*fernglas*", "👅": "*schleck*", "🍑": "*arsch*", "👵": "*oma*", "👴": "*opa*", "👶": "*baby*", "👷": "*bauarbeiter*", "👮": "*polizei*", "🎨": "*maler*", "👑": "*koenig*", "👸": "*koenigin*", "🎧": "*dj*", "🥁": "*drummer*", "🎹": "*piano*", "🎅": "*nikolaus*", "🔮": "*wahrsager*", "🐱": "*katze*", "🐮": "*kuh*", "🐔": "*huhn*", "🐷": "*schwein*", "🐶": "*hund*", "🦋": "*schmetterling*", "🐛": "*bug*", "🦄": "*einhorn*", "🦊": "*fuchs*", "🐌": "*schnecke*", "🐺": "*wolf*", "🐹": "*hamster*", "☀": "*sonne*", "☔": "*regen*", "🥶": "*frier*", "😓": "*schwitz*", "🌈": "*regenbogen*", "➡": ":arrow:", "❓": ":?:", "💡": ":idea:", "🆘": "*hilfe*", "🇩🇪": "*deutschland*", "🇦🇹": "*oesterreich*", "🇨🇭": "*schweiz*", "🇳🇱": "*niederlande*", "🧑‍⚕": "*schwester*", "😘": "*kuss3*"}, "joyTokens": ["*kommmalherfreundchen*", "*ihrseiddiegroessten*", "*kissenschlacht*", "*gehirnschnecke*", "*featuremonster*", "*happybirthday*", "*kopfschuettel*", "*baerenaufbind*", "*experimentier*", "*partnertausch*", "*computercrash*", "*schmetterling*", "*niedersachsen*", "*klugscheisser*", "*gutebesserung*", "*werderwachsen*", "*winterdienst*", "*selbstgefall*", "*diegroessten*", "*guckstduhier*", "*liebeskummer*", "*kindergarten*", "*kammerjaeger*", "*guterbeitrag*", "*cheerleading*", "*blumenschenk*", "*haumichwech*", "*deutschland*", "*traenenlach*", "*letzteswort*", "*zaubertrank*", "*willkommen2*", "*feinschleif*", "*gleichplatz*", "*geschlossen*", "*spassbremse*", "*verdaechtig*", "*niederlande*", "*huebschmach*", "*oesterreich*", "*blumenwiese*", "*brandenburg*", "*keinproblem*", "*bitteschoen*", "*kopfklatsch*", "*bauarbeiter*", "*ungeduldig*", "*gehbuegeln*", "*hotupshirt*", "*arschkneif*", "*geheimtipp*", "*gelbekarte*", "*vielglueck*", "*stoesschen*", "*musketiere*", "*schneeball*", "*willkommen*", "*mundschutz*", "*regenbogen*", "*freundchen*", "*ventilator*", "*schiefguck*", "*knackarsch*", "*thueringen*", "*verfuehren*", "*liegestuhl*", "*hotsqueeze*", "*blauesauge*", "*waschbrett*", "*ninjaclown*", "*ballaballa*", "*hackfresse*", "*roseschenk*", "*stammtisch*", "*steinwerf*", "*skeptisch*", "*feuerwehr*", "*poledance*", "*surprised*", "*schleswig*", "*schleimer*", "*3tagewach*", "*feuerwerk*", "*gutenacht*", "*headcrash*", "*slipstrip*", "*schwester*", "*rotekarte*", "*sarkasmus*", "*wahrsager*", "*zufaechel*", "*abgedreht*", "*taetschel*", "*sternchen*", "*fiesgrins*", "*schnupfen*", "*hotbanana*", "*sweetkiss*", "*zaunpfahl*", ":surprised:", "*blumezupf*", "*rheinland*", "*nikolaus*", "*meinheld*", "*iloveyou*", "*osolemio*", "*schleck4*", "*fancycat*", "*nixweiss*", "*schleck3*", "*hotboobs*", "*geschenk*", "*hochzeit*", "*offtopic*", "*saarland*", "*question*", "*schleck2*", "*stolzbin*", "*zeigpics*", "*my2cents*", "*peitsche*", "*zwinker2*", "*zumthema*", "*superman*", "*knutsch2*", "*hotkiss2*", "*knutsch4*", "*headbang*", "*nachdenk*", "*koenigin*", "*schnecke*", "*cocktail*", "*hotlady3*", "*grimasse*", "*confused*", "*angsthab*", "*fussball*", "*guerilla*", "*brueste2*", "*fernglas*", "*fluester*", "*duschen2*", "*hotlady2*", "*handkuss*", "*liebguck*", "*megaphon*", "*kopfkino*", "*raeusper*", "*knuddel2*", "*popcorn2*", "*thankyou*", "*guckguck*", "*schlumpf*", "*knutsch3*", ":confused:", "*fliege2*", "*neutral*", "*welcome*", "*redface*", "*blowjob*", ":twisted:", "*schimpf*", "*bananen*", "*knuddel*", "*fisting*", "*duschen*", "*hamburg*", "*traurig*", "*exclaim*", "*hothips*", "*hamster*", "*sixpack*", "*dagegen*", "*achtung*", "*tomaten*", "*aspirin*", ":neutral:", "*faechel*", "*whiskey*", "*frieden*", "*rotwerd*", "*schweig*", "*drummer*", "*twisted*", "*augenzu*", "*zwinker*", "*wiegeil*", ":redface:", "*gitarre*", "*schweiz*", "*hatschi*", "*brueste*", "*schleck*", "*knutsch*", "*schmoll*", "*hotkiss*", "*hochleb*", "*popcorn*", "*joyclub*", "*victory*", "*schwitz*", "*polizei*", "*hotlady*", "*gruebel*", ":mrgreen:", "*einhorn*", "*friends*", "*mrgreen*", "*sachsen*", "*undwech*", "*spanner*", "*kuschel*", "*liebhab*", "*schwein*", "*party2*", "*knicks*", "*hexhex*", "*bandit*", "*titten*", "*berlin*", "*troest*", "*crazy2*", "*pumpi2*", "*koenig*", "*lalala*", "*strick*", "*schock*", "*snief3*", "*boogie*", "*bayern*", "*janein*", "*stupid*", "*imogdi*", "*matrix*", "*voting*", "*blabla*", "*teufel*", "*cheers*", "*kaffee*", "*paddle*", "*kondom*", "*sabber*", "*wuerg2*", "*dafuer*", "*bremen*", "*gaehn2*", "*pimper*", "*autsch*", "*crazy4*", "*streit*", "*umfall*", "*snief2*", "*ironie*", "*holmes*", "*sextoy*", "*crazy5*", "*arbeit*", "*engel2*", "*hotass*", "*hotbum*", "*morgen*", "*fessel*", "*zugabe*", "*blume2*", "*dance2*", "*neinja*", "*muffin*", "*wolke7*", "*zocker*", "*sexypo*", "*hotman*", "*anmach*", "*crazy3*", "*3affen*", "*barbar*", "*fliege*", "*bussi2*", "*spitze*", "*schaem*", "*aetsch*", "*anhalt*", "*hessen*", "*katze*", "*prost*", "*jedi2*", "*smile*", "*twist*", "*bravo*", "*bussi*", "*sauna*", "*hand4*", "*frage*", "*hutab*", "*love5*", "*troet*", "*basta*", "*tuete*", "*arrow*", "*doggy*", "*pirat*", "*panik*", "*flenn*", "*blume*", "*tauch*", "*regen*", "*goofy*", "*clown*", "*kuss2*", "*sorry*", "*maler*", "*fluch*", "*hypno*", "*modda*", "*pfeil*", "*naund*", "*cool2*", "*love4*", "*love3*", "*alarm*", "*tanz2*", "*neid2*", "*happy*", "*genau*", "*lolli*", "*floet*", "*vogel*", "*hand2*", "*gaehn*", "*heia2*", "*party*", "*heul2*", "*hand3*", "*snief*", "*wuerg*", "*biker*", "*herz3*", "*spank*", ":arrow:", "*hand5*", "*hilfe*", "*herz2*", "*grins*", "*strip*", "*love2*", "*hicks*", "*piano*", "*angel*", "*bunny*", "*baby2*", "*anbet*", ":shock:", "*pumpi*", "*tonne*", "*elvis*", "*ninja*", "*kuss3*", "*juchu*", "*sonne*", "*pieks*", "*grill*", "*crazy*", "*fuchs*", "*dance*", "*troll*", "*arsch*", "*freu2*", "*shock*", "*torte*", "*essen*", "*danke*", "*muede*", "*frier*", "*knips*", "*rotfl*", "*engel*", "*herz4*", "*hexe*", "*walk*", "*senf*", "*umpf*", "*nono*", "*heia*", "*rofl*", "*nick*", ":roll:", "*fahr*", "*huch*", "*hot3*", "*witz*", "*fans*", "*nase*", "*kuss*", "*beep*", "*next*", "*heul*", ":evil:", "*tipp*", "*guru*", "*evil*", "*help*", "*baeh*", "*sekt*", "*jedi*", "*film*", "*date*", "*wolf*", "*neck*", "*idee*", "*hot2*", "*flop*", "*hand*", "*bla2*", "*love*", "*wein*", "*top2*", "*pfui*", "*mail*", "*huhn*", "*pueh*", "*bier*", "*spam*", "*nein*", "*snob*", "*wuah*", ":idea:", "*neid*", "*freu*", "*lach*", "*huhu*", "*juhu*", ":razz:", "*nene*", ":oops:", "*idea*", "*tanz*", "*motz*", "*herz*", "*oede*", "*meld*", "*keks*", "*popp*", ":wink:", "*haha*", "*oops*", "*razz*", "*dito*", "*wink*", "*hund*", "*roll*", "*sing*", "*cool*", "*yoda*", "*koch*", "*rock*", "*foto*", "*leck*", "*baby*", "*putz*", "*oh3*", "*oh4*", "*hae*", "*bla*", "*gr2*", "*hi5*", "*zig*", "*mmf*", "*eis*", "*sad*", "*wua*", "*arg*", "*ggg*", "*100*", "*lol*", "*puh*", "*tee*", ":sad:", "*cry*", "*oh2*", "*oma*", "*nrw*", "*aua*", "*omm*", "*les*", "*bug*", "*kuh*", "*uah*", "*zzz*", ":lol:", "*top*", "*gr3*", "*opa*", "*bye*", "*tel*", "*wow*", "*oha*", "*ffm*", ":cry:", "*hot*", "*ko*", "*yo*", "*gr*", "*ja*", "*mv*", "*oh*", "*wc*", "*bw*", "*dd*", "*dj*", "*xd*", "*hm*", "*gg*", ":!:", ":-|", ":-D", ":-/", ":?:", ":-(", "*g*", ";-)", "8-)", ":-o", ":-)", ":-P", ":o", ":P", ":/", "8)", ":|", ";)", ":)", ":?", ":x", ":(", ":D"], "poppenTokens": [":diamond_shape_with_a_dot_inside:", ":notebook_with_decorative_cover:", ":stuck_out_tongue_closed_eyes:", ":first_quarter_moon_with_face:", ":last_quarter_moon_with_face:", ":negative_squared_cross_mark:", ":chart_with_downwards_trend:", ":leftwards_arrow_with_hook:", ":twisted_rightwards_arrows:", ":black_medium_small_square:", ":white_medium_small_square:", ":person_with_pouting_face:", ":chart_with_upwards_trend:", ":eight_pointed_black_star:", ":two_women_holding_hands:", ":information_desk_person:", ":running_shirt_with_sash:", ":triangular_flag_on_post:", ":arrows_counterclockwise:", ":put_litter_in_its_place:", ":small_red_triangle_down:", ":person_with_blond_hair:", ":hourglass_flowing_sand:", ":sunrise_over_mountains:", ":vertical_traffic_light:", ":heavy_multiplication_x:", ":disappointed_relieved:", ":two_men_holding_hands:", ":fishing_pole_and_fish:", ":eight_spoked_asterisk:", ":part_alternation_mark:", ":ballot_box_with_check:", ":kissing_smiling_eyes:", ":globe_with_meridians:", ":waxing_crescent_moon:", ":waning_crescent_moon:", ":closed_lock_with_key:", ":mailbox_with_no_mail:", ":flower_playing_cards:", ":european_post_office:", ":large_orange_diamond:", ":small_orange_diamond:", ":kissing_closed_eyes:", ":man_with_gua_pi_mao:", ":construction_worker:", ":busts_in_silhouette:", ":full_moon_with_face:", ":waxing_gibbous_moon:", ":waning_gibbous_moon:", ":envelope_with_arrow:", ":oncoming_automobile:", ":oncoming_police_car:", ":ideograph_advantage:", ":heavy_division_sign:", ":black_square_button:", ":white_square_button:", ":black_medium_square:", ":white_medium_square:", ":bust_in_silhouette:", ":new_moon_with_face:", ":first_quarter_moon:", ":telephone_receiver:", ":mountain_bicyclist:", ":suspension_railway:", ":information_source:", ":arrow_heading_down:", ":black_small_square:", ":white_small_square:", ":small_red_triangle:", ":white_large_square:", ":black_large_square:", ":large_blue_diamond:", ":small_blue_diamond:", ":couple_with_heart:", ":last_quarter_moon:", ":lock_with_ink_pen:", ":incoming_envelope:", ":mailbox_with_mail:", ":house_with_garden:", ":convenience_store:", ":statue_of_liberty:", ":bullettrain_front:", ":articulated_lorry:", ":mountain_cableway:", ":arrow_upper_right:", ":arrow_lower_right:", ":arrow_double_down:", ":non-potable_water:", ":children_crossing:", ":heavy_dollar_sign:", ":currency_exchange:", ":large_blue_circle:", ":stuck_out_tongue:", ":revolving_hearts:", ":four_leaf_clover:", ":money_with_wings:", ":open_file_folder:", ":triangular_ruler:", ":musical_keyboard:", ":department_store:", ":night_with_stars:", ":steam_locomotive:", ":mountain_railway:", ":bullettrain_side:", ":arrow_upper_left:", ":arrow_lower_left:", ":left_right_arrow:", ":arrow_down_small:", ":arrow_right_hook:", ":arrow_heading_up:", ":passport_control:", ":no_mobile_phones:", ":white_check_mark:", ":heart_decoration:", ":mobile_phone_off:", ":six_pointed_star:", ":grey_exclamation:", ":arrows_clockwise:", ":heavy_minus_sign:", ":heavy_check_mark:", ":man_with_turban:", ":crying_cat_face:", ":japanese_goblin:", ":bride_with_veil:", ":person_frowning:", ":closed_umbrella:", ":sparkling_heart:", ":thought_balloon:", ":dromedary_camel:", ":high_brightness:", ":japanese_castle:", ":european_castle:", ":bridge_at_night:", ":izakaya_lantern:", ":performing_arts:", ":arrow_double_up:", ":signal_strength:", ":congratulations:", ":heavy_plus_sign:", ":coffee_morning:", ":heart_eyes_cat:", ":womans_clothes:", ":speech_balloon:", ":hatching_chick:", ":cherry_blossom:", ":evergreen_tree:", ":deciduous_tree:", ":earth_americas:", ":school_satchel:", ":jack_o_lantern:", ":christmas_tree:", ":low_brightness:", ":mailbox_closed:", ":page_facing_up:", ":page_with_curl:", ":straight_ruler:", ":rugby_football:", ":checkered_flag:", ":tropical_drink:", ":fork_and_knife:", ":carousel_horse:", ":roller_coaster:", ":rotating_light:", ":aerial_tramway:", ":arrow_backward:", ":arrow_up_small:", ":no_pedestrians:", ":vibration_mode:", ":hearts_around:", ":kissing_heart:", ":japanese_ogre:", ":speak_no_evil:", ":athletic_shoe:", ":hatched_chick:", ":tropical_fish:", ":water_buffalo:", ":sun_with_face:", ":crescent_moon:", ":tanabata_tree:", ":confetti_ball:", ":crossed_flags:", ":electric_plug:", ":bookmark_tabs:", ":musical_score:", ":space_invader:", ":chocolate_bar:", ":oncoming_taxi:", ":traffic_light:", ":round_pushpin:", ":arrow_up_down:", ":arrow_forward:", ":potable_water:", ":baggage_claim:", ":no_entry_sign:", ":do_not_litter:", ":grey_question:", ":coffee_happy:", ":hear_no_evil:", ":raised_hands:", ":raising_hand:", ":yellow_heart:", ":purple_heart:", ":broken_heart:", ":spermatozoon:", ":threefingers:", ":earth_africa:", ":partly_sunny:", ":mortar_board:", ":crystal_ball:", ":movie_camera:", ":video_camera:", ":nut_and_bolt:", ":musical_note:", ":horse_racing:", ":meat_on_bone:", ":fried_shrimp:", ":rice_cracker:", ":sweet_potato:", ":ferris_wheel:", ":oncoming_bus:", ":construction:", ":slot_machine:", ":capital_abcd:", ":fast_forward:", ":left_luggage:", ":white_flower:", ":radio_button:", ":black_circle:", ":white_circle:", ":sweat_smile:", ":smiling_imp:", ":older_woman:", ":kissing_cat:", ":pouting_cat:", ":see_no_evil:", ":sweat_drops:", ":raised_hand:", ":point_right:", ":green_heart:", ":love_letter:", ":monkey_face:", ":dragon_face:", ":fallen_leaf:", ":ear_of_rice:", ":floppy_disk:", ":loudspeaker:", ":alarm_clock:", ":credit_card:", ":outbox_tray:", ":postal_horn:", ":file_folder:", ":closed_book:", ":orange_book:", ":black_joker:", ":snowboarder:", ":baby_bottle:", ":poultry_leg:", ":green_apple:", ":post_office:", ":city_sunset:", ":tokyo_tower:", ":railway_car:", ":fire_engine:", ":circus_tent:", ":arrow_right:", ":baby_symbol:", ":no_bicycles:", ":sagittarius:", ":exclamation:", ":interrobang:", ":heart_eyes:", ":cold_sweat:", ":tired_face:", ":confounded:", ":dizzy_face:", ":astonished:", ":smiley_cat:", ":scream_cat:", ":thumbsdown:", ":open_hands:", ":point_up_2:", ":point_down:", ":point_left:", ":couplekiss:", ":womans_hat:", ":eyeglasses:", ":blue_heart:", ":heartpulse:", ":two_hearts:", ":footprints:", ":rubberdoll:", ":safebanana:", ":bananarama:", ":twofingers:", ":panda_face:", ":baby_chick:", ":maple_leaf:", ":earth_asia:", ":gift_heart:", ":wind_chime:", ":rice_scene:", ":loud_sound:", ":flashlight:", ":inbox_tray:", ":card_index:", ":green_book:", ":name_badge:", ":microscope:", ":microphone:", ":headphones:", ":video_game:", ":basketball:", ":wine_glass:", ":shaved_ice:", ":watermelon:", ":strawberry:", ":love_hotel:", ":mount_fuji:", ":helicopter:", ":light_rail:", ":trolleybus:", ":police_car:", ":hotsprings:", ":no_smoking:", ":keycap_ten:", ":arrow_down:", ":arrow_left:", ":repeat_one:", ":wheelchair:", ":registered:", ":curly_loop:", ":red_circle:", ":persevere:", ":grimacing:", ":guardsman:", ":older_man:", ":smile_cat:", ":smirk_cat:", ":nail_care:", ":mans_shoe:", ":high_heel:", ":briefcase:", ":heartbeat:", ":handcuffs:", ":highheels:", ":threesome:", ":racehorse:", ":crocodile:", ":sunflower:", ":palm_tree:", ":full_moon:", ":milky_way:", ":snowflake:", ":fireworks:", ":telephone:", ":satellite:", ":hourglass:", ":mag_right:", ":bar_chart:", ":clipboard:", ":paperclip:", ":black_nib:", ":blue_book:", ":telescope:", ":newspaper:", ":saxophone:", ":bicyclist:", ":hamburger:", ":spaghetti:", ":fish_cake:", ":rice_ball:", ":ice_cream:", ":honey_pot:", ":tangerine:", ":pineapple:", ":city_dusk:", ":speedboat:", ":ambulance:", ":copyright:", ":capricorn:", ":ophiuchus:", ":wavy_dash:", ":clock1230:", ":clock1030:", ":clock1130:", ":clapping:", ":confused:", ":relieved:", ":sleeping:", ":no_mouth:", ":princess:", ":sparkles:", ":thumbsup:", ":point_up:", ":ok_woman:", ":lipstick:", ":poppen-1:", ":dickface:", ":vibrator:", ":whipping:", ":stocking:", ":pig_nose:", ":elephant:", ":blowfish:", ":hibiscus:", ":mushroom:", ":chestnut:", ":seedling:", ":new_moon:", ":umbrella:", ":sparkler:", ":minidisc:", ":computer:", ":moneybag:", ":envelope:", ":calendar:", ":scissors:", ":notebook:", ":bookmark:", ":game_die:", ":football:", ":baseball:", ":cocktail:", ":doughnut:", ":icecream:", ":birthday:", ":lollipop:", ":cherries:", ":eggplant:", ":hospital:", ":fountain:", ":sailboat:", ":airplane:", ":monorail:", ":blue_car:", ":beginner:", ":fuelpump:", ":arrow_up:", ":restroom:", ":no_entry:", ":scorpius:", ":aquarius:", ":question:", ":bangbang:", ":clock130:", ":clock230:", ":clock330:", ":clock430:", ":clock530:", ":clock630:", ":clock730:", ":clock830:", ":clock930:", ":diamonds:", ":jumping:", ":dr_love:", ":relaxed:", ":kissing:", ":flushed:", ":pensive:", ":fearful:", ":triumph:", ":worried:", ":joy_cat:", ":droplet:", ":ok_hand:", ":walking:", ":dancers:", ":no_good:", ":massage:", ":haircut:", ":necktie:", ":handbag:", ":strapon:", ":safesex:", ":hamster:", ":penguin:", ":chicken:", ":octopus:", ":dolphin:", ":rabbit2:", ":rooster:", ":leopard:", ":bouquet:", ":blossom:", ":volcano:", ":snowman:", ":cyclone:", ":rainbow:", ":balloon:", ":speaker:", ":no_bell:", ":battery:", ":bathtub:", ":smoking:", ":syringe:", ":calling:", ":mailbox:", ":postbox:", ":package:", ":pushpin:", ":pencil2:", ":clapper:", ":trumpet:", ":mahjong:", ":bowling:", ":swimmer:", ":custard:", ":wedding:", ":factory:", ":sunrise:", ":rowboat:", ":station:", ":red_car:", ":minibus:", ":tractor:", ":busstop:", ":warning:", ":parking:", ":symbols:", ":customs:", ":sparkle:", ":recycle:", ":clock12:", ":clock10:", ":clock11:", ":trident:", ":praise:", ":smiley:", ":sleepy:", ":scream:", ":hushed:", ":tongue:", ":muscle:", ":runner:", ":dancer:", ":couple:", ":family:", ":tophat:", ":sandal:", ":kimono:", ":bikini:", ":ribbon:", ":poppen:", ":suckmy:", ":collar:", ":banana:", ":hottub:", ":wdrops:", ":ydrops:", ":bdrops:", ":rabbit:", ":monkey:", ":turtle:", ":beetle:", ":whale2:", ":tiger2:", ":dragon:", ":mouse2:", ":poodle:", ":leaves:", ":cactus:", ":bamboo:", ":camera:", ":iphone:", ":unlock:", ":shower:", ":toilet:", ":wrench:", ":hammer:", ":dollar:", ":e-mail:", ":pencil:", ":scroll:", ":ledger:", ":violin:", ":guitar:", ":soccer:", ":tennis:", ":trophy:", ":surfer:", ":coffee:", ":cookie:", ":grapes:", ":tomato:", ":school:", ":office:", ":church:", ":anchor:", ":rocket:", ":train2:", ":barber:", ":ticket:", ":over18:", ":rewind:", ":repeat:", ":cinema:", ":womens:", ":accept:", ":secret:", ":taurus:", ":gemini:", ":cancer:", ":pisces:", ":clock1:", ":clock2:", ":clock3:", ":clock4:", ":clock5:", ":clock6:", ":clock7:", ":clock8:", ":clock9:", ":spades:", ":hearts:", ":sweat:", ":weary:", ":smirk:", ":woman:", ":angel:", ":skull:", ":alien:", ":star2:", ":dizzy:", ":anger:", ":punch:", ":crown:", ":shirt:", ":dress:", ":jeans:", ":pouch:", ":purse:", ":heart:", ":cupid:", ":crazy:", ":pussy:", ":fucku:", ":urock:", ":wdrop:", ":ydrop:", ":mouse:", ":tiger:", ":koala:", ":horse:", ":sheep:", ":snake:", ":snail:", ":shell:", ":whale:", ":camel:", ":tulip:", ":stars:", ":sunny:", ":cloud:", ":foggy:", ":ocean:", ":dolls:", ":flags:", ":ghost:", ":santa:", ":pager:", ":radio:", ":sound:", ":watch:", ":knife:", ":pound:", ":books:", ":notes:", ":8ball:", ":beers:", ":pizza:", ":fries:", ":curry:", ":bento:", ":sushi:", ":ramen:", ":dango:", ":bread:", ":candy:", ":apple:", ":lemon:", ":peach:", ":melon:", ":house:", ":hotel:", ":japan:", ":metro:", ":train:", ":truck:", ":moyai:", ":three:", ":seven:", ":eight:", ":u6307:", ":u7a7a:", ":u6e80:", ":u5408:", ":u7981:", ":u5272:", ":u55b6:", ":u6709:", ":u7121:", ":u6708:", ":u7533:", ":aries:", ":virgo:", ":libra:", ":chart:", ":clubs:", ":grin:", ":rage:", ":mask:", ":baby:", ":girl:", ":poop:", ":fire:", ":boom:", ":dash:", ":eyes:", ":nose:", ":lips:", ":fist:", ":wave:", ":pray:", ":clap:", ":boot:", ":kiss:", ":ring:", ":lick:", ":bite:", ":gimp:", ":cock:", ":tits:", ":lgbt:", ":wolf:", ":frog:", ":bear:", ":boar:", ":bird:", ":fish:", ":cow2:", ":goat:", ":dog2:", ":pig2:", ":cat2:", ":feet:", ":rose:", ":herb:", ":star:", ":gift:", ":tada:", ":mute:", ":bell:", ":mega:", ":lock:", ":bulb:", ":bath:", ":door:", ":bomb:", ":pill:", ":euro:", ":date:", ":book:", ":dart:", ":golf:", ":sake:", ":beer:", ":rice:", ":stew:", ":oden:", ":cake:", ":pear:", ":corn:", ":bank:", ":tent:", ":ship:", ":seat:", ":tram:", ":taxi:", ":bike:", ":hash:", ":four:", ":five:", ":nine:", ":zero:", ":1234:", ":abcd:", ":cool:", ":free:", ":koko:", ":mens:", ":loop:", ":back:", ":soon:", ":link:", ":cry:", ":joy:", ":sob:", ":yum:", ":imp:", ":cop:", ":boy:", ":man:", ":zzz:", ":ear:", ":bow:", ":gem:", ":wax:", ":cum:", ":bed:", ":ass:", ":car:", ":dog:", ":cat:", ":pig:", ":cow:", ":bug:", ":bee:", ":ant:", ":ram:", ":rat:", ":zap:", ":vhs:", ":dvd:", ":fax:", ":key:", ":mag:", ":gun:", ":yen:", ":art:", ":ski:", ":tea:", ":egg:", ":bus:", ":one:", ":two:", ":six:", ":abc:", ":new:", ":sos:", ":leo:", ":atm:", ":top:", ":end:", ":100:", ":ox:", ":cd:", ":tv:", ":cn:", ":us:", ":jp:", ":ru:", ":de:", ":gb:", ":fr:", ":kr:", ":it:", ":es:", ":wc:", ":ok:", ":up:", ":ng:", ":sa:", ":cl:", ":id:", ":vs:", ":ab:", ":o2:", ":tm:", ":on:", "9_9", ">:(", "o.O", "-_-", ":-/", "O.o", "(A)", ":v:", ":m:", ":a:", ":b:", ":x:", ":o:", ":D", ":)", ";)", ":x", ":P", "¬¬", ":(", "xD", "B|", ":o", ":|"]};
  const SM = SMILEY_MAP;
  // Graphem-/Token-weises Zerlegen: an jeder Stelle den längsten passenden Code; Links bleiben unangetastet.
  const emojiRe = /^(?:\p{RI}\p{RI}|(?:\p{Extended_Pictographic})(?:️|⃣)?(?:‍(?:\p{Extended_Pictographic})(?:️|⃣)?)*|[0-9#*]️?⃣)/u;
  function translateSmileys(text, from, to) {
    if (from === to || !text) return { text, missing: [] };
    const tokens = from === 'joyclub' ? SM.joyTokens : from === 'poppen' ? SM.poppenTokens : [];
    const table = from === 'joyclub' ? (to === 'poppen' ? SM.joyToPoppen : null)
      : from === 'poppen' ? (to === 'joyclub' ? SM.poppenToJoy : SM.poppenToUnicode)
      : /* unicode */ (to === 'poppen' ? SM.unicodeToPoppen : SM.unicodeToJoy);
    const out = []; const missing = [];
    let i = 0;
    const s = String(text);
    while (i < s.length) {
      // Links unangetastet lassen
      if (/^(https?:\/\/|www\.)/i.test(s.slice(i))) { const m = s.slice(i).match(/^\S+/); out.push(m[0]); i += m[0].length; continue; }
      // 1) plattformeigene Codes (längste zuerst)
      let hit = '';
      if (tokens.length) { for (const tk of tokens) { if (tk && s.startsWith(tk, i)) { hit = tk; break; } } }
      if (hit) {
        const rep = table && table[hit];
        if (rep != null) out.push(rep); else { out.push(hit); missing.push(hit); }
        i += hit.length; continue;
      }
      // 2) Unicode-Emoji als Graphem-Cluster
      const em = s.slice(i).match(emojiRe);
      if (em) {
        const e = em[0];
        const rep = to === 'poppen' ? (SM.unicodeToPoppen[e] || SM.unicodeToPoppen[e.replace(/️/g, '')]) : to === 'joyclub' ? (SM.unicodeToJoy[e] || SM.unicodeToJoy[e.replace(/️/g, '')]) : null;
        if (to === 'unicode' || from === 'unicode') {
          // nach Unicode: Code→Emoji bereits in table abgedeckt; from=unicode: table liefert Ziel
          if (from === 'unicode') { const r = table[e] || table[e.replace(/️/g, '')]; if (r != null) { out.push(r); } else { out.push(e); missing.push(e); } i += e.length; continue; }
        }
        out.push(rep != null ? rep : e);
        if (rep == null && to !== 'unicode') missing.push(e);
        i += e.length; continue;
      }
      out.push(s[i]); i++;
    }
    return { text: out.join(''), missing: uniq(missing) };
  }
  // Codes/Emojis entfernen → Vergleichstext (Abschnitt 4.3)
  function stripSmileys(text) {
    let s = String(text || '');
    const r = translateSmileys(s, 'joyclub', 'poppen').text;     // JOY-Codes vereinheitlichen (zur Erkennung)
    s = s;
    // alle poppen- und joy-Codes entfernen
    for (const tk of [...SM.poppenTokens, ...SM.joyTokens]) { if (tk) s = s.split(tk).join(' '); }
    // Unicode-Emojis und Modifikatoren entfernen
    s = s.replace(/\p{RI}\p{RI}|\p{Extended_Pictographic}(?:️|⃣)?(?:‍\p{Extended_Pictographic}(?:️|⃣)?)*|[️‍⃣\u{1F3FB}-\u{1F3FF}]/gu, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  void stripSmileys;

  // =====================================================================================
  // Textvorlagen (bis 100 Stück, je bis 8000 Zeichen) – GM-Speicher, Export/Import,
  // Termine-Bereich, Smiley-Übersetzung. Knopf + Menü im Messenger.
  // =====================================================================================
  const TPL_MAX = 100, TPL_LEN = 8000;
  const K_TPL = 'vaf2_templates';
  const getTpls = () => { const l = GM_getValue(K_TPL, []); return Array.isArray(l) ? l : []; };
  const setTpls = (l) => { GM_setValue(K_TPL, l); Bus.emit('tpl'); };
  // Beim Speichern einer Vorlage: Metadaten setzen und über den Briefkasten senden (falls aktiv)
  function saveTemplate(list, t, isNew) {
    if (typeof tplEnsureMeta === 'function') tplEnsureMeta(t);
    t.updatedAt = now(); t.updatedBy = { platform: 'poppen', account: (Me.get() || {}).nick || '' };
    setTpls(list);
    try { if (typeof bkSendTemplate === 'function') bkSendTemplate({ id: t.id, name: t.name, text: t.text, updatedAt: t.updatedAt, updatedBy: t.updatedBy, deletedAt: null }); } catch {}
  }
  const tplNameKey = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const tplIcon = (sz = 22) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/><path d="M8.5 15.5l5.4-5.4a1.2 1.2 0 0 1 1.7 1.7L10.2 17.2l-2.4.6.7-2.3z"/></svg>`;
  // Symbol des Benutzers für den Messenger-Knopf
  const TPL_BTN_ICON = `<svg viewBox="0 0 22 22" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M20.167,0H1.833A1.833,1.833,0,0,0,0,1.833V20.167A1.833,1.833,0,0,0,1.833,22H14.667a.914.914,0,0,0,.648-.269l6.417-6.417A.916.916,0,0,0,22,14.667V1.833A1.833,1.833,0,0,0,20.167,0M14.428,7.563H12.171v7.75a1.162,1.162,0,1,1-2.324,0V7.566H7.581a1.02,1.02,0,0,1-1-1.039,1.008,1.008,0,0,1,1.008-.991h6.84a1.014,1.014,0,0,1,0,2.028"></path></svg>`;

  // ---------- Termine (gemeinsame Datei mit dem Messenger-Abschnitt; Format wann - wo - was - Link) ----------
  // Kurzform (wann - wo - Link, ohne was) beim Einfügen über die Datei wieder ausschreiben.
  async function expandMeetLines(text) {
    let r = await readTermFile(false).catch(() => ({ state: 'none' }));
    if (r.state !== 'ok') return text;
    const all = allTerms(r.text);
    const byLink = new Map(), byDW = new Map();
    for (const t of all) { if (t.link) byLink.set(linkCmp(t.link), t); byDW.set(t.wann + '|' + norm(t.wo), t); }
    return String(text).split(/\r?\n/).map((line) => {
      const t = parseTermLine(line);
      if (!t || t.was) return line;
      const hit = (t.link && byLink.get(linkCmp(t.link))) || byDW.get(t.wann + '|' + norm(t.wo));
      return hit && hit.was ? hit.line : line;
    }).join('\n');
  }

  // ---------- Overlay „Textvorlagen“ ----------
  function tplOverlay() {
    const ov = document.createElement('div'); ov.className = 'vaf-ov'; ov.id = 'vaf-tpl-ov';
    const box = document.createElement('div'); box.className = 'vaf-md'; box.style.cssText = 'display:flex;flex-direction:column;max-height:92vh;padding:0;overflow:hidden';
    box.innerHTML = `<div class="vaf-tpl-head" style="display:flex;align-items:center;gap:10px;padding:16px 20px 10px">
        <button type="button" class="vaf-tpl-back" title="Zurück" style="border:0;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;padding:0 4px">‹</button>
        <h2 style="margin:0;font-size:20px;font-weight:700;color:#fff" data-r="title">Textvorlagen</h2></div>
      <div class="vaf-cur" data-r="toast" style="min-height:0;margin:0 20px"></div>
      <div class="vaf-tpl-body" data-r="body" style="flex:1;overflow:auto;padding:4px 20px"></div>
      <div class="vaf-tpl-foot" data-r="foot" style="display:flex;flex-direction:column;gap:10px;padding:12px 20px 16px;border-top:1px solid #2c2c2c"></div>`;
    ov.appendChild(box); document.body.appendChild(ov);
    const $ = (r) => box.querySelector(`[data-r=${r}]`);
    const m = {
      ov, box, backFn: null,
      close() { if (ov.isConnected) ov.remove(); document.removeEventListener('keydown', onKey, true); },
      title: (t) => { $('title').textContent = t; },
      setBody: (html) => { $('body').innerHTML = html; return $('body'); },
      setFoot: (btns) => { const f = $('foot'); f.innerHTML = ''; for (const b of btns) { const e = document.createElement('button'); e.type = 'button'; e.className = 'vaf-big' + (b.primary ? ' vaf-pri' : ''); e.textContent = b.label; e.disabled = !!b.disabled; if (b.title) e.title = b.title; e.style.width = b.half ? '' : '100%'; if (b.half) e.style.flex = '1'; e.addEventListener('click', () => b.fn(e)); f.appendChild(e); } f.style.flexDirection = btns.some((b) => b.half) ? 'row' : 'column'; },
      toast: (t) => { $('toast').textContent = t; if (t) setTimeout(() => { if ($('toast').textContent === t) $('toast').textContent = ''; }, 3000); },
    };
    box.querySelector('.vaf-tpl-back').addEventListener('click', () => (m.backFn ? m.backFn() : m.close()));
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) m.close(); });
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); m.backFn ? m.backFn() : m.close(); } };
    document.addEventListener('keydown', onKey, true);
    return m;
  }
  function openTemplates() {
    const m = tplOverlay();
    const trashCount = () => { try { return (G.get('tpl_trash', []) || []).length; } catch { return 0; } };
    const counter = () => `<div style="display:flex;justify-content:space-between;align-items:baseline;margin:2px 0 10px"><b style="color:#fff">Textvorlagen</b><span class="vaf-mini">${getTpls().length} von ${TPL_MAX}${trashCount() ? ` · <a href="#" data-a="trash">Papierkorb (${trashCount()})</a>` : ''}</span></div>`;
    const showList = () => {
      m.backFn = null; m.title('Textvorlagen');
      const tpls = getTpls();
      const body = m.setBody(counter() + (tpls.length ? tpls.map((t, i) => `<div class="vaf-tpl-item" data-i="${i}" style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #2c2c2c;cursor:pointer">
          <span style="color:#ffc21a;flex:none;margin-top:2px">${tplIcon(22)}</span>
          <div style="min-width:0"><div style="font-weight:600;color:#fff">${esc(t.name)}</div><div class="vaf-mini" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap">${esc(t.text)}</div></div></div>`).join('')
        : '<div class="vaf-mini" style="padding:12px 0">Noch keine Textvorlagen.</div>'));
      body.querySelectorAll('.vaf-tpl-item').forEach((el) => el.addEventListener('click', () => showEdit(+el.dataset.i)));
      const tl = body.querySelector('[data-a=trash]'); if (tl) tl.addEventListener('click', (e) => { e.preventDefault(); showTrash(); });
      m.setFoot([
        { label: 'Textvorlage hinzufügen', primary: true, disabled: tpls.length >= TPL_MAX, title: tpls.length >= TPL_MAX ? `Höchstens ${TPL_MAX} Textvorlagen` : '', fn: () => showEdit(-1) },
        { label: 'Textvorlagen exportieren/importieren', fn: () => exportImportDialog(showList) },
      ]);
    };
    const showEdit = (idx) => {
      m.backFn = showList; m.title(idx < 0 ? 'Textvorlage hinzufügen' : 'Textvorlage bearbeiten');
      const tpls = getTpls();
      const t = idx < 0 ? { name: '', text: '' } : { ...tpls[idx] };
      const isTermin = () => /termin/i.test(nameEl.value);
      const body = m.setBody(counter() +
        `<label class="vaf-fl" style="display:block;margin-bottom:10px"><span class="vaf-mini">Name der Textvorlage</span><input class="vaf-in" data-f="name" value="${esc(t.name)}"></label>
         <label class="vaf-fl" style="display:block"><span class="vaf-mini">Nachricht</span><textarea class="vaf-in" data-f="text" rows="6" maxlength="${TPL_LEN}" style="resize:none;height:9em">${esc(t.text)}</textarea></label>
         <div class="vaf-mini" data-f="cnt" style="text-align:right;margin-top:2px"></div>
         <div data-f="termine"></div>`);
      const nameEl = body.querySelector('[data-f=name]'), textEl = body.querySelector('[data-f=text]'), cnt = body.querySelector('[data-f=cnt]');
      const upd = () => { cnt.textContent = `Noch ${fmtN(TPL_LEN - textEl.value.length)} Zeichen möglich`; };
      textEl.addEventListener('input', upd); upd();
      nameEl.addEventListener('input', () => drawTermine());
      const drawTermine = async () => {
        const box = body.querySelector('[data-f=termine]');
        if (!isTermin()) { box.innerHTML = ''; return; }
        box.innerHTML = '<div style="margin-top:14px;border-top:1px solid #2c2c2c;padding-top:10px"><div class="vaf-mini">Termine</div><div data-f="tl">…</div></div>';
        const tl = box.querySelector('[data-f=tl]');
        const render = async (ask) => {
          if (!termSupported()) { tl.innerHTML = '<div class="vaf-mini">Nur in Chrome/Edge.</div>'; return; }
          const r = await readTermFile(ask);
          if (r.state === 'none') { tl.innerHTML = '<a href="#" data-a="pick">Datei mit Terminen wählen …</a>'; }
          else if (r.state === 'perm') { tl.innerHTML = '<a href="#" data-a="perm">Zugriff auf die Datei erlauben</a> · <a href="#" data-a="pick">Datei ändern …</a>'; }
          else if (r.state === 'error') { tl.innerHTML = `<div class="vaf-mini" style="color:#ff7875">Datei nicht lesbar: ${esc(r.name)}</div><a href="#" data-a="pick">Datei ändern …</a>`; }
          else {
            const { list } = upcomingTerms(r.text);
            tl.innerHTML = (list.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0">${list.map((t, i) => `<button type="button" class="vaf-btn" data-t="${i}" title="${esc(t.line)}" style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.label)}</button>`).join('')}</div>
              <div style="display:flex;gap:12px;flex-wrap:wrap"><a href="#" data-a="all">Alle übernehmen</a><a href="#" data-a="pick">Datei ändern …</a></div>`
              : '<div class="vaf-mini">Keine kommenden Termine.</div><a href="#" data-a="pick">Datei ändern …</a>');
            const fmt = (t) => [t.wann, t.wo, (t.link ? normJoyLink(t.link) : t.was)].filter(Boolean).join(' - ');
            tl.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => insertAtCursor(textEl, fmt(list[+b.dataset.t]))));
            const allBtn = tl.querySelector('[data-a=all]'); if (allBtn) allBtn.addEventListener('click', (e) => { e.preventDefault(); textEl.value = list.map(fmt).join('\n\n').slice(0, TPL_LEN); upd(); });
          }
          const pk = tl.querySelector('[data-a=pick]'); if (pk) pk.addEventListener('click', async (e) => { e.preventDefault(); if (await pickTermFile()) render(false); });
          const pm2 = tl.querySelector('[data-a=perm]'); if (pm2) pm2.addEventListener('click', (e) => { e.preventDefault(); render(true); });
        };
        render(false);
      };
      drawTermine();
      const save = () => {
        const name = nameEl.value.trim(), text = textEl.value;
        if (!name) { m.toast('Bitte einen Namen eingeben.'); return; }
        if (!text.trim()) { m.toast('Bitte einen Text eingeben.'); return; }
        const list = getTpls();
        if (list.some((x, i) => i !== idx && tplNameKey(x.name) === tplNameKey(name))) { m.toast('Name schon vergeben.'); return; }
        let t;
        if (idx < 0) { t = { name, text }; list.push(t); } else { t = { ...list[idx], name, text }; list[idx] = t; }
        saveTemplate(list, t, idx < 0); showList();
      };
      m.setFoot([
        ...(idx < 0 ? [] : [{ label: 'Textvorlage löschen', half: true, fn: () => { if (W.confirm('Diese Textvorlage löschen?')) { const l = getTpls(); const cur = l[idx]; if (cur && cur.id && typeof tplTrash === 'function') tplTrash(cur.id); else { l.splice(idx, 1); setTpls(l); } showList(); } } }]),
        { label: 'Textvorlage speichern', primary: true, half: idx >= 0, fn: save },
      ]);
    };
    const showTrash = () => {
      m.backFn = showList; m.title('Papierkorb');
      const tr = (G.get('tpl_trash', []) || []);
      const body = m.setBody(tr.length ? tr.map((t, i) => `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #2c2c2c"><div><div style="font-weight:600;color:#fff">${esc(t.name)}</div><div class="vaf-mini">gelöscht am ${deDateTime(t.deletedAt || 0)}</div></div><button type="button" class="vaf-btn" data-i="${i}">Wiederherstellen</button></div>`).join('') : '<div class="vaf-mini" style="padding:12px 0">Papierkorb ist leer.</div>');
      body.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { if (typeof tplRestore === 'function') tplRestore(tr[+b.dataset.i].id); showTrash(); }));
      m.setFoot([{ label: 'Zurück', fn: showList }]);
    };
    showList();
    return m;
  }

  // ---------- Export / Import ----------
  async function tplExportPayload() {
    const me = Me.get() || await loadMe();
    return { payload: { format: 'fickliste', version: 1, platform: 'poppen', exported: Date.now(), templates: getTpls().map((t) => ({ name: t.name, text: t.text })) }, nick: me.nick };
  }
  function exportImportDialog(done) {
    const m = modal({ title: 'Textvorlagen', html: '<p>Was möchtest du tun?</p>' });
    m.buttons([
      { label: 'Exportieren', primary: true, fn: () => { m.close(); wayDialog('export', done); } },
      { label: 'Importieren', fn: () => { m.close(); wayDialog('import', done); } },
      { label: 'Abbrechen', focus: true, fn: () => m.close() },
    ]);
  }
  function wayDialog(mode, done) {
    const m = modal({ title: mode === 'export' ? 'Exportieren' : 'Importieren', html: '' });
    m.buttons([
      { label: 'per Datei', primary: true, fn: async () => { m.close(); mode === 'export' ? await tplExportFile() : await tplImport(await pickFile(), done); } },
      { label: 'per Zwischenablage', fn: async () => { m.close(); mode === 'export' ? await tplExportClip() : tplImportClip(done); } },
      { label: 'Abbrechen', focus: true, fn: () => m.close() },
    ]);
  }
  async function tplExportText() {
    const { payload, nick } = await tplExportPayload();
    const enc = await encryptJSON(payload, nick);
    return JSON.stringify({ format: 'fickliste-enc', platform: 'poppen', account: nick, ...enc });
  }
  async function tplExportFile() { download(`textvorlagen-poppen-${stamp()}.json`, await tplExportText()); toast('Exportiert.'); }
  async function tplExportClip() { try { await navigator.clipboard.writeText(await tplExportText()); toast('In die Zwischenablage kopiert.'); } catch { toast('Zwischenablage nicht verfügbar.'); } }
  function tplImportClip(done) {
    navigator.clipboard.readText().then((t) => tplImport(t, done)).catch(() => {
      const m = modal({ title: 'Importieren', html: '<p>Füge den Inhalt mit Strg+V ein:</p><textarea class="vaf-in" data-f="t" rows="6" style="resize:vertical"></textarea>' });
      m.buttons([{ label: 'Importieren', primary: true, fn: () => { const v = m.body.querySelector('[data-f=t]').value; m.close(); tplImport(v, done); } }, { label: 'Abbrechen', focus: true, fn: () => m.close() }]);
    });
  }
  async function tplImport(text, done) {
    if (!text) return;
    let data;
    try { data = await readFickFile(text); } catch (e) { toast('Datei nicht lesbar: ' + esc(e.message)); return; }
    if (!data || !Array.isArray(data.templates)) { toast('Keine Textvorlagen in der Datei.'); return; }
    const from = data.platform || 'joyclub';
    const list = getTpls();
    const sum = { neu: 0, unveraendert: 0, ergaenzt: 0, ersetzt: 0, beide: 0, uebersprungen: 0 };
    const missing = [];
    for (const imp of data.templates) {
      if (!imp || !imp.name) continue;
      const tr = translateSmileys(String(imp.text || ''), from === 'poppen' ? 'poppen' : from === 'joyclub' ? 'joyclub' : 'unicode', 'poppen');
      if (tr.missing.length) missing.push(`${imp.name}: ${tr.missing.join(' ')}`);
      let newText = tr.text.slice(0, TPL_LEN);
      const idx = list.findIndex((x) => tplNameKey(x.name) === tplNameKey(imp.name));
      if (idx < 0) {
        if (list.length >= TPL_MAX) { sum.uebersprungen++; continue; }
        list.push({ name: imp.name.trim(), text: newText }); sum.neu++; continue;
      }
      const mine = list[idx];
      const a = stripSmileys(mine.text), b = stripSmileys(imp.text);
      if (a === b) { sum.unveraendert++; continue; }
      if ((b.startsWith(a) || b.endsWith(a)) && a) {
        // ergänzen: nur das neue Rohstück übersetzen und an die eigene Vorlage anfügen; der Rest bleibt
        const rawCut = fragmentCut(imp.text, a, b.startsWith(a) ? 'start' : 'end');
        const frag = b.startsWith(a) ? imp.text.slice(rawCut) : imp.text.slice(0, rawCut);
        const fragT = translateSmileys(frag, from === 'poppen' ? 'poppen' : from === 'joyclub' ? 'joyclub' : 'unicode', 'poppen').text;
        const merged = b.startsWith(a) ? mine.text + fragT : fragT + mine.text;
        if (merged.length <= TPL_LEN) { list[idx] = { ...mine, text: merged }; sum.ergaenzt++; continue; }
      }
      const v = W.confirm(`Textvorlage „${imp.name}“ wurde auf beiden Seiten geändert.\n\nOK = importierte übernehmen, Abbrechen = eigene behalten.`);
      if (v) { list[idx] = { ...mine, text: newText }; sum.ersetzt++; } else sum.uebersprungen++;
    }
    setTpls(list);
    await ask('Import fertig', `<div class="vaf-stats"><span>Neu</span><b>${sum.neu}</b><span>Unverändert</span><b>${sum.unveraendert}</b><span>Ergänzt</span><b>${sum.ergaenzt}</b><span>Ersetzt</span><b>${sum.ersetzt}</b><span>Übersprungen</span><b>${sum.uebersprungen}</b></div>${missing.length ? `<h3>Nicht übersetzte Smileys</h3><div class="vaf-list">${missing.map(esc).map((x) => `<div>${x}</div>`).join('')}</div>` : ''}`, [{ label: 'OK', primary: true, focus: true }]);
    if (done) done();
  }
  // Rohtext-Position, ab der (start) bzw. bis zu der (end) der gemeinsame Vergleichstext reicht
  function fragmentCut(raw, common, side) {
    const s = String(raw);
    const target = common.length;
    if (side === 'start') { let i = 0; while (i < s.length && stripSmileys(s.slice(0, i)).length < target) i++; return i; }
    let i = s.length; while (i > 0 && stripSmileys(s.slice(i)).length < target) i--; return i;
  }

  // ---------- Einfügen ins Chat-Eingabefeld ----------
  function insertAtCursor(ta, text) {
    const v = ta.value || '';
    const pos = typeof ta.selectionStart === 'number' ? ta.selectionStart : v.length;
    const before = v.slice(0, pos), after = v.slice(pos);
    const ins = (before && !/\n$/.test(before) ? '\n' : '') + text + (after && !/^\n/.test(after) ? '\n' : '');
    try { const setter = Object.getOwnPropertyDescriptor(W.HTMLTextAreaElement.prototype, 'value').set; setter.call(ta, before + ins + after); } catch { ta.value = before + ins + after; }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    const c = (before + ins).length; try { ta.setSelectionRange(c, c); } catch {}
  }
  // Vorlage in die Chat-Eingabezeile einfügen (Termin-Kurzform ausschreiben)
  async function insertTemplate(tpl) {
    const ta = document.querySelector('main textarea.rc-textarea, main .ant-mentions textarea');
    if (!ta) { toast('Eingabefeld nicht gefunden.'); return; }
    let text = tpl.text;
    try { text = await expandMeetLines(text); } catch {}
    insertAtCursor(ta, text);
  }

  // ---------- Knopf neben der Eingabezeile (nur /inbox/p/<nick>) ----------
  function templateButton() {
    if (!/^\/inbox\/p\//.test(location.pathname)) return;
    const bar = document.querySelector('main .sNIvTu');
    if (!bar || bar.querySelector('#vaf-tpl-btn')) return;
    const gif = [...bar.querySelectorAll('button')].pop();
    const b = (gif || bar.lastElementChild).cloneNode(false);
    b.id = 'vaf-tpl-btn'; b.type = 'button'; b.title = 'Textvorlagen'; b.removeAttribute('aria-hidden');
    b.innerHTML = `<span class="ant-btn-icon">${TPL_BTN_ICON}</span>`;
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); templatePopup(b); });
    bar.appendChild(b);
  }
  function templatePopup(anchor) {
    const old = document.getElementById('vaf-tpl-pop'); if (old) { old.remove(); return; }
    const tpls = getTpls();
    const r = anchor.getBoundingClientRect();
    const pop = document.createElement('div'); pop.id = 'vaf-tpl-pop';
    pop.style.cssText = `position:fixed;left:${Math.round(r.left)}px;bottom:${Math.round(innerHeight - r.top + 8)}px;z-index:2147483600;background:#1f1f1f;border:1px solid #333;border-radius:14px;padding:8px 0;min-width:220px;max-height:60vh;overflow:auto;box-shadow:0 8px 28px rgba(0,0,0,.6);font:600 15px system-ui,sans-serif;color:#fff`;
    pop.innerHTML = tpls.length ? tpls.map((t, i) => `<div class="vaf-tpl-pi" data-i="${i}" style="padding:9px 18px;cursor:pointer;white-space:nowrap">${esc(t.name)}</div>`).join('')
      : '<div style="padding:9px 18px;color:#8c8c8c;font-weight:400">Noch keine Textvorlagen – über ⋮ → Textvorlagen anlegen</div>';
    document.body.appendChild(pop);
    pop.querySelectorAll('.vaf-tpl-pi').forEach((el) => { el.addEventListener('mouseenter', () => (el.style.background = '#2c2c2c')); el.addEventListener('mouseleave', () => (el.style.background = '')); el.addEventListener('click', () => { pop.remove(); insertTemplate(tpls[+el.dataset.i]); }); });
    const close = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener('mousedown', close, true); } };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  }
  // Eintrag „Textvorlagen“ im Drei-Punkte-Menü (nach „Nachrichtenfilter“)
  function templateMenuEntry() {
    for (const ul of document.querySelectorAll('ul.ant-dropdown-menu')) {
      const items = [...ul.querySelectorAll(':scope > li')];
      const filter = items.find((li) => /Nachrichtenfilter/.test(li.textContent));
      if (!filter || ul.querySelector('#vaf-tpl-menu')) continue;
      const li = filter.cloneNode(true);
      li.id = 'vaf-tpl-menu'; li.removeAttribute('data-menu-id');
      const c = li.querySelector('.ant-dropdown-menu-title-content') || li;
      c.textContent = 'Textvorlagen';
      li.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); document.body.click(); openTemplates(); }, true);
      filter.after(li);
    }
  }
  function templateUi() { try { templateButton(); templateMenuEntry(); } catch (e) { warn('Textvorlagen', e); } }

  // =====================================================================================
  // Briefkasten: automatischer Abgleich von Fickliste und Textvorlagen mit dem JOYclub-Skript
  // über eine leere, neutrale Seite (GitHub Pages). Siehe Nachtrag „Abgleich über den Briefkasten“.
  // =====================================================================================
  const BK_URL = 'https://schimmelreiter.github.io/joyclub-opa-scan/briefkasten.html';
  const BK_HOST = 'schimmelreiter.github.io';
  const PLAT = (() => { const h = location.hostname; return /joyclub\.de$/.test(h) ? 'joyclub' : /poppen\.de$/.test(h) ? 'poppen' : h === BK_HOST ? 'bk' : 'other'; })();
  // Betriebsart: 'poppen' (eigene Seite) | 'joyclub' (passiv) | 'briefkasten' (iframe) | 'inert' (nichts tun)
  const BK_MODE = (() => {
    const inFrame = W.top !== W;
    if (PLAT === 'bk') return inFrame ? 'briefkasten' : 'inert';
    if (inFrame) return 'inert';                       // in fremden iframes (auch poppen eigene) nichts tun
    if (PLAT === 'poppen') return 'poppen';
    if (PLAT === 'joyclub') return 'joyclub';
    return 'inert';
  })();

  // ---------- Postausgang/-eingang im GM-Speicher (die Seiten-Instanz füllt, die iframe-Instanz leert) ----------
  let bkApplying = false;              // während des Anwendens eingegangener Daten nicht zurücksenden
  const bkOut = () => G.get('bk_out', { nextSeq: 1, items: [] });
  function bkSend(kind, data) {
    if (BK_MODE !== 'poppen' || bkApplying) return;
    const o = bkOut();
    o.items.push({ seq: o.nextSeq, ts: now(), kind, data });
    o.nextSeq++;
    // Grenze 1 MB: bei Überlauf Vollabgleich vormerken
    try { if (JSON.stringify(o).length > 1024 * 1024) { o.items = [{ seq: o.nextSeq, ts: now(), kind: 'full', data: null }]; o.nextSeq++; } } catch {}
    G.set('bk_out', o);
  }
  function bkSendTemplate(t) { bkSend('template', t); }
  function bkSendPerson(p) { bkSend('person', p); }
  async function bkFullData() {
    const persons = await Fick.all().catch(() => []);
    return { templates: getTpls(), persons };
  }

  // ---------- Seiten-Instanz (poppen.de): Eingänge anwenden, Postausgang kürzen ----------
  async function bkApplyInbox() {
    if (BK_MODE !== 'poppen') return;
    if (!(await Lock.take('bk_page', 'inbox'))) return;
    try {
      const inb = G.get('bk_in', { items: [] });
      if (!inb.items.length) return;
      const items = inb.items.slice();
      bkApplying = true;
      try {
      for (const it of items) {
        try {
          if (it.kind === 'template') await bkMergeTemplate(it.data);
          else if (it.kind === 'person') await bkMergePerson(it.data);
          else if (it.kind === 'full') await bkMergeFull(it.data);
        } catch (e) { warn('Briefkasten anwenden', e); }
      }
      } finally { bkApplying = false; }
      // verarbeitete entfernen (nur die, die wir gesehen haben; neue bleiben)
      const rest = (G.get('bk_in', { items: [] }).items || []).filter((x) => !items.some((y) => y.seq === x.seq && y.ts === x.ts));
      G.set('bk_in', { items: rest });
      Bus.emit('tpl'); Bus.emit('fick');
    } finally { Lock.release('bk_page'); }
  }
  function bkTrimOut() {
    if (BK_MODE !== 'poppen') return;
    const acked = G.get('bk_out_acked', 0) || 0;
    const o = bkOut();
    const before = o.items.length;
    o.items = o.items.filter((x) => x.seq > acked);
    if (o.items.length !== before) G.set('bk_out', o);
  }

  // ---------- Textvorlagen: Felder für den Abgleich + Drei-Wege-Merge ----------
  function tplEnsureMeta(t) {
    if (!t.id) t.id = uuid();
    if (!t.updatedAt) t.updatedAt = now();
    if (!t.updatedBy) t.updatedBy = { platform: 'poppen', account: (Me.get() || {}).nick || '' };
    return t;
  }
  async function tplHash(text) { return (await sha256hex(stripSmileys(text || ''))).slice(0, 16); }
  const bkBase = () => G.get('bk_base', {});          // { 'tpl:'+id : {hash,name,at} }
  const bkSetBase = (b) => G.set('bk_base', b);
  // einen eingegangenen Vorlagen-Stand R anwenden
  async function bkMergeTemplate(R) {
    if (!R || !R.name) return;
    const list = getTpls().map(tplEnsureMeta);
    const base = bkBase();
    const bk = 'tpl:' + (R.id || '');
    let idx = R.id ? list.findIndex((x) => x.id === R.id) : -1;
    if (idx < 0) idx = list.findIndex((x) => tplNameKey(x.name) === tplNameKey(R.name));
    const Rtext = translateSmileys(String(R.text || ''), 'joyclub', 'poppen').text.slice(0, TPL_LEN);
    const Rhash = await tplHash(R.text);
    if (idx < 0) {
      // Grabstein ohne eigene Vorlage → ignorieren
      if (R.deletedAt) return;
      if (list.length >= TPL_MAX) { log('Briefkasten: Textvorlage übersprungen (Limit)'); return; }
      const nt = tplEnsureMeta({ id: R.id || uuid(), name: R.name, text: Rtext, updatedAt: R.updatedAt || now(), updatedBy: R.updatedBy });
      list.push(nt); setTpls(list);
      base[bk] = { hash: Rhash, name: R.name, at: now() }; bkSetBase(base);
      return;
    }
    const L = list[idx];
    L.id = L.id || R.id || uuid();
    const b = base['tpl:' + L.id] || base[bk];
    const B = b ? b.hash : null;
    const Lhash = await tplHash(L.text);
    if (R.deletedAt) {
      if (Lhash === B || !B) { tplTrash(L.id); }                 // unverändert → Papierkorb
      else if (W.confirm(`„${L.name}“ wurde auf der anderen Seite gelöscht, hier aber geändert. OK = löschen, Abbrechen = behalten.`)) tplTrash(L.id);
      base['tpl:' + L.id] = { hash: Rhash, name: R.name, at: now() }; bkSetBase(base);
      return;
    }
    if (Lhash === Rhash) { base['tpl:' + L.id] = { hash: Rhash, name: R.name, at: Math.max(L.updatedAt || 0, R.updatedAt || 0) }; bkSetBase(base); applyName(L, R); setTpls(list); return; }
    if (B && Lhash === B && Rhash !== B) { L.text = Rtext; L.updatedAt = R.updatedAt || now(); L.updatedBy = R.updatedBy; applyName(L, R); }
    else if (B && Rhash === B && Lhash !== B) { /* eigenes behalten */ }
    else {
      // Notfall bzw. kein base: Mischregeln, sonst Rückfrage
      const a = stripSmileys(L.text), rr = stripSmileys(R.text);
      if (B == null && (rr.startsWith(a) || rr.endsWith(a)) && a) {
        const cut = fragmentCut(R.text, a, rr.startsWith(a) ? 'start' : 'end');
        const frag = rr.startsWith(a) ? R.text.slice(cut) : R.text.slice(0, cut);
        const fragT = translateSmileys(frag, 'joyclub', 'poppen').text;
        L.text = (rr.startsWith(a) ? L.text + fragT : fragT + L.text).slice(0, TPL_LEN);
      } else {
        const keep = W.confirm(`„${L.name}“ wurde auf beiden Seiten geändert.\nZuletzt: ${deDateTime(R.updatedAt || now())} auf ${R.updatedBy && R.updatedBy.platform === 'joyclub' ? 'JOYclub' : 'der anderen Seite'}.\n\nOK = andere übernehmen, Abbrechen = eigene behalten.`);
        if (keep) { L.text = Rtext; L.updatedAt = R.updatedAt || now(); L.updatedBy = R.updatedBy; applyName(L, R); }
      }
    }
    base['tpl:' + L.id] = { hash: await tplHash(L.text), name: L.name, at: L.updatedAt || now() }; bkSetBase(base);
    setTpls(list);
    function applyName(L2, R2) { if (R2.name && (R2.updatedAt || 0) >= (L2.updatedAt || 0) && tplNameKey(R2.name) !== tplNameKey(L2.name) && !list.some((x) => x !== L2 && tplNameKey(x.name) === tplNameKey(R2.name))) L2.name = R2.name; }
  }
  async function bkMergePerson(R) { if (R) { const local = await Fick.all(); const t = local.find((p) => p.id === R.id) || null; if (t) { mergeFick(t, R); await Fick.put(t); } else { await Fick.put({ ...R }); } } }
  async function bkMergeFull(d) {
    if (!d) return;
    for (const t of d.templates || []) await bkMergeTemplate({ ...t });
    for (const p of d.persons || []) await bkMergePerson(p);
  }

  // ---------- Papierkorb (Grabsteine, 30 Tage) ----------
  const bkTrashStore = () => G.get('tpl_trash', []);
  function tplTrash(id) {
    const list = getTpls();
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [t] = list.splice(i, 1);
    const tr = bkTrashStore(); tr.push({ ...t, deletedAt: now() }); G.set('tpl_trash', tr);
    setTpls(list);
    bkSend('template', { ...t, deletedAt: now() });
  }
  function tplRestore(id) {
    const tr = bkTrashStore(); const i = tr.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [t] = tr.splice(i, 1); delete t.deletedAt; G.set('tpl_trash', tr);
    const list = getTpls(); list.push(tplEnsureMeta({ ...t, updatedAt: now() })); setTpls(list);
    bkSendTemplate(list[list.length - 1]);
  }
  function tplPurgeTrash() { const tr = bkTrashStore().filter((x) => now() - (x.deletedAt || 0) < 30 * DAY); G.set('tpl_trash', tr); }

  // ---------- iframe einbetten (poppen.de und joyclub.de) ----------
  function bkEmbed() {
    setTimeout(() => {
      try {
        if (document.getElementById('opa-briefkasten')) return;
        const f = document.createElement('iframe');
        f.id = 'opa-briefkasten';
        f.src = BK_URL + '#host=' + location.hostname;
        f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
        f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;visibility:hidden';
        (document.documentElement || document.body).appendChild(f);
      } catch (e) { warn('Briefkasten einbetten', e); }
    }, Math.random() * 1500);
  }

  // ---------- Briefkasten-Instanz (läuft im iframe auf github.io) ----------
  function bkIframeMain() {
    const LS = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } } };
    const mine = PLAT === 'bk' ? bkIframeHost() : 'poppen';
    function bkIframeHost() { const m = /host=([^&]+)/.exec(location.hash || ''); const h = m ? decodeURIComponent(m[1]) : ''; return /joyclub/.test(h) ? 'joyclub' : 'poppen'; }
    const other = mine === 'poppen' ? 'joyclub' : 'poppen';
    const K = { outMine: 'opa-bk:out:' + mine, outOther: 'opa-bk:out:' + other, ackMine: 'opa-bk:ack:' + mine, ackOther: 'opa-bk:ack:' + other, helloMine: 'opa-bk:hello:' + mine, helloOther: 'opa-bk:hello:' + other };
    // Lebenszeichen + Hallo
    const beat = () => { G.set('bk_alive', now()); LS.set(K.helloMine, JSON.stringify({ v: 1, ts: now(), script: 'poppen', version: VERSION })); G.set('bk_store_ok', LS.set('opa-bk:selftest:' + mine, String(now())) ? now() : 0); const ho = LS.get(K.helloOther); if (ho) { try { G.set('bk_hello_joy', JSON.parse(ho)); } catch {} } };
    beat(); setInterval(beat, 15000);
    // GM-Postausgang → localStorage
    const pushOut = () => { const o = G.get('bk_out', { nextSeq: 1, items: [] }); LS.set(K.outMine, JSON.stringify({ v: 1, platform: mine, account: (G.get('me', {}) || {}).nick || '', ts: now(), items: o.items })); W.dispatchEvent(new CustomEvent('opa-bk')); };
    try { GM_addValueChangeListener('vaf2_bk_out', pushOut); } catch {}
    pushOut();
    // localStorage des anderen → GM-Posteingang
    const pullIn = () => {
      const raw = LS.get(K.outOther); if (!raw) return;
      let box; try { box = JSON.parse(raw); } catch { return; }
      const items = (box && box.items) || [];
      if (!items.length) return;
      const lastIn = G.get('bk_in_last', 0) || 0;
      const fresh = items.filter((x) => x.seq > lastIn);
      if (fresh.length) {
        const inb = G.get('bk_in', { items: [] }); inb.items.push(...fresh); G.set('bk_in', inb);
        G.set('bk_in_last', Math.max(...items.map((x) => x.seq)));
      }
      LS.set(K.ackOther, String(Math.max(lastIn, ...items.map((x) => x.seq))));
      // Ack des anderen für unseren Postausgang
      const a = +(LS.get(K.ackMine) || 0); if (a) G.set('bk_out_acked', a);
    };
    pullIn();
    W.addEventListener('opa-bk', pullIn);
    W.addEventListener('storage', (e) => { if (e.key === K.outOther || e.key === K.ackMine) pullIn(); });
    setInterval(pullIn, 5000);
  }

  // ---------- Funktionstest ----------
  async function bkTest() {
    if (BK_MODE !== 'poppen') return;
    const r = { at: now(), alive: false, store: false, joy: false };
    const t0 = now();
    while (now() - t0 < 10000) { if (now() - (G.get('bk_alive', 0) || 0) < 12000) { r.alive = true; break; } await sleep(500); }
    r.store = !!G.get('bk_store_ok', 0);
    r.joy = !!G.get('bk_hello_joy', null);
    r.msg = !r.alive ? 'Briefkasten blockiert' : !r.store ? 'Speicher gesperrt' : !r.joy ? 'JOYclub-Skript nicht gefunden' : 'bereit';
    G.set('bk_test', r);
    return r;
  }

  // ---------- Verdrahtung ----------
  function bkStartPoppen() {
    bkEmbed();
    setInterval(bkApplyInbox, 3000);
    setInterval(bkTrimOut, 7000);
    try { GM_addValueChangeListener('vaf2_bk_in', () => bkApplyInbox().catch(() => {})); } catch {}
    tplPurgeTrash();
    // erster Kontakt / Speicher zurückgesetzt → Vollabgleich
    setTimeout(async () => {
      const acked = G.get('bk_out_acked', 0) || 0, nextSeq = bkOut().nextSeq;
      if (!G.get('bk_full_sent', 0) || acked >= nextSeq) { bkSend('full', await bkFullData()); G.set('bk_full_sent', now()); }
    }, 8000);
    // Funktionstest beim Start und täglich
    setTimeout(() => { if (now() - G.get('bk_test_at', 0) > DAY) { G.set('bk_test_at', now()); bkTest().catch(() => {}); } }, 12000);
  }

  // =====================================================================================
  // Start
  // =====================================================================================
  loadSettings();
  if (BK_MODE === 'poppen') installPassiveHooks();

  function ensureUi() {
    try { settingsMenu(); } catch (e) { warn('Menü', e); }
    try { routeSettings(); } catch (e) { warn('Einstellungen', e); }
    try { ignoreListUi(); } catch (e) { warn('Blockierliste', e); }
    try { profileMenu(); } catch (e) { warn('Profil-Menü', e); }
    try { messengerTerms(); } catch (e) { warn('Termine', e); }
    try { templateUi(); } catch (e) { warn('Textvorlagen', e); }
    if (/^\/p\/[^/]+\/?$/.test(location.pathname)) {
      blockedProfileUi().catch((e) => warn('Geblocktes Profil', e));
      profilePage().catch((e) => warn('Profil', e));
    }
    if (location.pathname === '/setting/profile') readSecondHomeFromPage();
  }

  async function init() {
    ensureStyle();
    await migrateV1().catch((e) => warn('Umstellung', e));
    if (await handleSpecialPage()) return;
    loadMe().then(() => { headerButton(); return loadSecondHome(); }).catch(() => {});
    checkReblock().catch((e) => warn('Wiedersperren', e));
    hookTrash();
    leaveGuard();
    initListPages();
    initFigur();
    initGroupRequests();
    Etappe.start();
    bkStartPoppen();
    headerButton();
    setInterval(headerButton, 1500);
    refreshPending().catch(() => {});
    setInterval(() => refreshPending().catch(() => {}), 5 * 60000);
    // Zahl der Blockierten gelegentlich auffrischen
    if (now() - G.get('blocked_count_at', 0) > 3600000) {
      BL.uids().then((l) => { G.set('blocked_count', l.length); G.set('blocked_count_at', now()); }).catch(() => {});
    }
    // Blockierliste nach einem Update (und wöchentlich) still ins Gedächtnis einlesen
    setTimeout(async () => {
      if (!ingestDue()) return;
      if (!(await Lock.take('blocklist', 'ingest'))) return;
      try { await ingestBlocklist(); } catch (e) { warn('Blockierliste einlesen', e); }
      finally { Lock.release('blocklist'); }
    }, 8000);
    // einmalig: alte Rekorder-Aufnahmen verwerfen (vor 2.5 unvollständig geschwärzt)
    if (!G.get('rec_cleared_25', 0)) { Recorder.clear().catch(() => {}); G.set('rec_cleared_25', now()); }
    // einmalig: verschleierte Einträge (uid ohne Nummer) aus Gedächtnis und Warteliste räumen
    if (!G.get('masked_purged', 0)) setTimeout(async () => {
      try {
        const bad = []; await Members.each((m) => { if (!/^\d+$/.test(String(m.uid))) bad.push(m.uid); });
        for (const uid of bad) { Members.cached().delete(uid); await DB.del('members', uid); }
        for (const q of await Queue.list()) if (!q.uid.startsWith('nick:') && !/^\d+$/.test(q.uid)) await Queue.remove(q.uid);
        G.set('masked_purged', now()); if (bad.length) log(`${bad.length} verschleierte Einträge entfernt.`);
      } catch (e) { warn('Aufräumen', e); }
    }, 12000);
    // Freunde und Favoriten einmal täglich vollständig einlesen
    setTimeout(async () => {
      if (now() - G.get('ff_at', 0) < DAY) return;
      if (!(await Lock.take('ff'))) return;
      try { await refreshFriendsFavs(null); } catch (e) { warn('Freunde/Favoriten', e); } finally { Lock.release('ff'); }
    }, 15000);
    // Gruppen-Whitelist einmal täglich im Hintergrund
    setTimeout(async () => {
      if (!isOn() || now() - G.get('grp_wl_at', 0) < DAY) return;
      if (!(await Lock.take('grpwl'))) return;
      try { await refreshManagedWhitelist({ stop: () => false, step: () => {}, notes: [] }); } catch (e) { warn('Gruppen-Whitelist', e); }
      finally { Lock.release('grpwl'); }
    }, 20000);
    // Nick-Abgleich der bösen Popsters einmal täglich (TM-Speicher aus dem Gedächtnis nachführen)
    setTimeout(async () => {
      if (now() - G.get('evil_sync_at', 0) < DAY) return;
      if (!(await Lock.take('evilsync'))) return;
      try { await syncEvilNames(); G.set('evil_sync_at', now()); } catch (e) { warn('Nick-Abgleich', e); } finally { Lock.release('evilsync'); }
    }, 22000);
    // „Besonders böse Popsters“ alle 30 Minuten aus der Blockierer-Liste auffüllen (ersetzt den Inhalt)
    const EVIL_EVERY = 30 * 60000;
    const evilTick = async () => {
      if (now() - G.get('evil_at', 0) < EVIL_EVERY - 5000) return;
      if (!(await Lock.take('evilblk'))) return;
      try { await refreshEvilFromBlockers(); } catch (e) { warn('Blockierer-Liste', e); } finally { Lock.release('evilblk'); }
    };
    setTimeout(evilTick, 25000);
    setInterval(evilTick, 5 * 60000);
    // Oberfläche aktuell halten (die Seite baut Teile laufend neu auf)
    let t = null;
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(ensureUi, 250); }).observe(document.body, { childList: true, subtree: true });
    W.addEventListener('hashchange', ensureUi);
    let last = location.pathname + location.hash;
    setInterval(() => { const cur = location.pathname + location.hash; if (cur !== last) { last = cur; ensureUi(); checkReblock().catch(() => {}); } }, 500);
    ensureUi();
    Bus.on('settings', () => { headerButton(); });
    Bus.on('on', () => headerButton());
    if (S().expert.debug) W.__opaSchutz = { S, saveSettings, Members, Queue, Etappe, KV, DB, G, api, classify, Recorder, Fick, BL, Prio, G, refreshFriendsFavs, ingestUserInfo, getTpls, setTpls, openTemplates, translateSmileys, stripSmileys, tplImport, insertTemplate, bkMergeTemplate, bkMergePerson, tplTrash, tplRestore, BK_MODE, seen, judge, openScanPopup, scanInteractions, scanGroups, scanGroupsWhite, scanGroupsBlack, groupLead, refreshEvilFromBlockers, syncEvilNames, buildEvilList, scanSearch, scanVisitors, Me, loadMe };
    log(`Version ${VERSION} bereit.`);
  }
  // Betriebsart (Briefkasten): nur auf poppen.de volle Funktion; auf joyclub.de passiv (nur Briefkasten einbetten);
  // im Briefkasten-iframe nur die Relais-Logik; sonst nichts.
  if (BK_MODE === 'briefkasten') {
    try { bkIframeMain(); } catch (e) { console.error('[Opa-Schutz] Briefkasten:', e); }
  } else if (BK_MODE === 'joyclub') {
    onReady(() => { try { bkEmbed(); } catch (e) { warn('Briefkasten', e); } });
  } else if (BK_MODE === 'poppen') {
    if (/^\/view\/announcement\/page\/1236\b/.test(location.pathname) && W.top === W) { try { skipRegie(); } catch {} }
    onReady(() => init().catch((e) => { console.error('[Opa-Schutz] Fehler beim Start:', e); }));
  }
})();
