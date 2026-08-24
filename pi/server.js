#!/usr/bin/env node
'use strict';

// Dienst für den Raspberry Pi.
//
// Electron ist auf einem Pi 3 oder Zero 2 W zu schwer, und 1080p bekommt man
// dort nur mit der Hardware-Dekodierung flüssig - die kann das Chromium von
// Raspberry Pi OS, Electrons eigenes nicht. Deshalb liefert dieser Dienst
// dieselben Dateien aus wie die Electron-Fassung, und Chromium zeigt sie im
// Kiosk-Modus an. Die Anzeige selbst (src/player.*) ist unverändert dieselbe.
//
// Zusätzlich bedient er die Einstellungsseite fürs Handy im selben WLAN.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;

// Dieselbe Datenablage wie die Electron-Fassung, damit auf einem Rechner beide
// Wege dieselbe Konfiguration sehen.
function standardOrdner() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
                     'Bar Display');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Bar Display');
  }
  return path.join(os.homedir(), '.config', 'Bar Display');
}

const USER_DIR = process.env.BARDISPLAY_DIR || standardOrdner();
const MEDIA_DIR = path.join(USER_DIR, 'media');
const PHOTO_DIR = path.join(USER_DIR, 'photos');
const BRAND_DIR = path.join(USER_DIR, 'branding');
const FONT_DIR = path.join(USER_DIR, 'fonts');
const CONFIG_PATH = path.join(USER_DIR, 'config.json');
const BACKUP_PATH = path.join(USER_DIR, 'config.backup.json');

const SRC_DIR = path.join(__dirname, '..', 'src');

const TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.avif': 'image/avif', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.ogv': 'video/ogg', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// ---------------------------------------------------------------------------
// Konfiguration - dasselbe Format wie die Electron-Fassung
// ---------------------------------------------------------------------------
const STANDARD = {
  version: 2,
  settings: {
    barName: 'TARMAC BAR', subtitle: 'Planetenweide',
    bgColor: '#450b6f', accent: '#74ff40', accent2: '#f04e23',
    logo: '', logoHeight: 9, fontFile: '',
    titleStyle: 'blob', pattern: 'dots', displayId: '', rotation: 0,
    transition: 'fade', transitionMs: 900,
    timetableTitle: 'TIMETABLE', timetableSubtitle: 'line up',
    pricesTitle: 'GETRÄNKE', pricesSubtitle: 'preise',
    pin: '', timetableEvery: 3, timetableDuration: 20,
    pricesEvery: 5, pricesDuration: 25, showClock: true,
    fadeMs: 700, imageDuration: 12, timetableMaxNext: 5, priceNote: ''
  },
  videos: [], timetable: [], prices: [],
  special: { enabled: false, label: 'SPEZIALSHOT', name: '', size: '', price: '', text: '' }
};

function tiefMischen(basis, drueber) {
  if (Array.isArray(basis)) return Array.isArray(drueber) ? drueber : basis;
  if (basis && typeof basis === 'object') {
    const raus = Object.assign({}, basis);
    if (drueber && typeof drueber === 'object') {
      for (const k of Object.keys(drueber)) raus[k] = tiefMischen(basis[k], drueber[k]);
    }
    return raus;
  }
  return drueber === undefined ? basis : drueber;
}

function ordnerAnlegen() {
  for (const d of [MEDIA_DIR, PHOTO_DIR, BRAND_DIR, FONT_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function konfigLesen() {
  try {
    const roh = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^﻿/, ''));
    return tiefMischen(STANDARD, roh);
  } catch (err) {
    return JSON.parse(JSON.stringify(STANDARD));
  }
}

function konfigSchreiben(cfg) {
  ordnerAnlegen();
  const gemischt = tiefMischen(STANDARD, cfg || {});
  try {
    if (fs.existsSync(CONFIG_PATH)) fs.copyFileSync(CONFIG_PATH, BACKUP_PATH);
  } catch (e) { /* egal */ }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(gemischt, null, 2), 'utf8');
  return gemischt;
}

// ---------------------------------------------------------------------------
// Angemeldete Anzeigen, damit Änderungen sofort ankommen
// ---------------------------------------------------------------------------
const lauscher = new Set();

function verkuenden(cfg) {
  const nachricht = 'event: config\ndata: ' + JSON.stringify(cfg) + '\n\n';
  for (const res of lauscher) {
    try { res.write(nachricht); } catch (e) { lauscher.delete(res); }
  }
}

// ---------------------------------------------------------------------------
// Dateien ausliefern
// ---------------------------------------------------------------------------
function ausliefern(res, datei, req) {
  let stat;
  try { stat = fs.statSync(datei); } catch (e) { return fehler(res, 404, 'Nicht gefunden'); }
  if (!stat.isFile()) return fehler(res, 404, 'Nicht gefunden');

  const typ = TYPEN[path.extname(datei).toLowerCase()] || 'application/octet-stream';

  // Videos brauchen Bereichsanfragen, sonst springt der Browser nicht und
  // beginnt bei grossen Dateien erst nach vollstaendigem Laden.
  const bereich = req.headers.range;
  if (bereich) {
    const treffer = /^bytes=(\d*)-(\d*)$/.exec(bereich);
    if (treffer) {
      let von = treffer[1] ? parseInt(treffer[1], 10) : 0;
      let bis = treffer[2] ? parseInt(treffer[2], 10) : stat.size - 1;
      if (isNaN(von) || von < 0) von = 0;
      if (isNaN(bis) || bis >= stat.size) bis = stat.size - 1;
      if (von > bis) return fehler(res, 416, 'Bereich ungueltig');
      res.writeHead(206, {
        'Content-Type': typ,
        'Content-Length': bis - von + 1,
        'Content-Range': 'bytes ' + von + '-' + bis + '/' + stat.size,
        'Accept-Ranges': 'bytes'
      });
      return fs.createReadStream(datei, { start: von, end: bis }).pipe(res);
    }
  }

  res.writeHead(200, {
    'Content-Type': typ,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(datei).pipe(res);
}

function fehler(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function json(res, daten, code = 200) {
  const koerper = JSON.stringify(daten);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(koerper)
  });
  res.end(koerper);
}

// Nur Dateien innerhalb des erlaubten Ordners herausgeben
function sicherJoin(basis, rest) {
  const ziel = path.join(basis, path.normalize(rest).replace(/^([.][.][\\/])+/, ''));
  const echt = path.resolve(ziel);
  if (echt !== path.resolve(basis) && !echt.startsWith(path.resolve(basis) + path.sep)) return null;
  return echt;
}

function koerperLesen(req) {
  return new Promise((resolve, reject) => {
    let daten = '';
    let zuViel = false;
    req.on('data', (stueck) => {
      daten += stueck;
      if (daten.length > 40 * 1024 * 1024) { zuViel = true; req.destroy(); }
    });
    req.on('end', () => zuViel ? reject(new Error('zu gross')) : resolve(daten));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Achtung: nicht "/fonts" verwenden - unter src/fonts liegt die mitgelieferte
// Josefin Sans, auf die player.css per @font-face verweist. Eine eigene Schrift
// der Bar wird deshalb unter /eigeneschrift ausgeliefert.
const ORDNER = {
  '/media': MEDIA_DIR,
  '/photos': PHOTO_DIR,
  '/branding': BRAND_DIR,
  '/eigeneschrift': FONT_DIR
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pfad = decodeURIComponent(url.pathname);

  try {
    if (pfad === '/' || pfad === '/anzeige') {
      return ausliefern(res, path.join(SRC_DIR, 'player.html'), req);
    }
    if (pfad === '/einstellungen') {
      return ausliefern(res, path.join(SRC_DIR, 'settings.html'), req);
    }

    if (pfad === '/api/paths') {
      return json(res, {
        mode: 'http',
        mediaDir: '/media', photoDir: '/photos',
        brandDir: '/branding', fontDir: '/eigeneschrift',
        userDir: USER_DIR, configPath: CONFIG_PATH,
        version: require('../package.json').version
      });
    }

    if (pfad === '/api/config' && req.method === 'GET') {
      return json(res, konfigLesen());
    }

    if (pfad === '/api/config' && req.method === 'POST') {
      const roh = await koerperLesen(req);
      const gespeichert = konfigSchreiben(JSON.parse(roh));
      verkuenden(gespeichert);
      return json(res, gespeichert);
    }

    if (pfad === '/api/media') {
      ordnerAnlegen();
      return json(res, fs.readdirSync(MEDIA_DIR));
    }

    if (pfad === '/api/canconvert') {
      return json(res, false);   // Umwandeln passiert am Rechner, nicht auf dem Pi
    }

    if (pfad === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.write('retry: 3000\n\n');
      lauscher.add(res);
      const puls = setInterval(() => { try { res.write(': puls\n\n'); } catch (e) { /* egal */ } }, 25000);
      req.on('close', () => { clearInterval(puls); lauscher.delete(res); });
      return;
    }

    // Medien, Fotos, Logo, Schrift
    for (const [praefix, ordner] of Object.entries(ORDNER)) {
      if (pfad.startsWith(praefix + '/')) {
        const datei = sicherJoin(ordner, pfad.slice(praefix.length + 1));
        if (!datei) return fehler(res, 403, 'Nicht erlaubt');
        return ausliefern(res, datei, req);
      }
    }

    // alles Übrige aus src/ (player.js, player.css, Schriften, Standardlogo ...)
    const datei = sicherJoin(SRC_DIR, pfad.replace(/^\//, ''));
    if (!datei) return fehler(res, 403, 'Nicht erlaubt');
    return ausliefern(res, datei, req);

  } catch (err) {
    return fehler(res, 500, 'Fehler: ' + err.message);
  }
});

ordnerAnlegen();
server.listen(PORT, () => {
  const adressen = [];
  for (const liste of Object.values(os.networkInterfaces())) {
    for (const n of liste || []) {
      if (n.family === 'IPv4' && !n.internal) adressen.push(n.address);
    }
  }
  console.log('Bar Display läuft.');
  console.log('  Anzeige      : http://localhost:' + PORT + '/');
  for (const a of adressen) {
    console.log('  Einstellungen: http://' + a + ':' + PORT + '/einstellungen');
  }
  console.log('  Datenablage  : ' + USER_DIR);
});
