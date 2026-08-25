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
const { zeitStatus } = require('../lib/zeitstatus');
const { entgegennehmen, formatHinweis } = require('../lib/hochladen');
const anmeldung = require('../lib/anmeldung');

const VERSION_KONFIG = 3;

const STANDARD = {
  version: VERSION_KONFIG,
  settings: {
    barName: 'TARMAC BAR', subtitle: 'Planetenweide',
    bgColor: '#450b6f', accent: '#74ff40', accent2: '#f04e23',
    logo: '', logoHeight: 9, fontFile: '',
    titleStyle: 'blob', pattern: 'dots', displayId: '', rotation: 0,
    sparmodus: false,
    transition: 'fade', transitionMs: 900,
    qrEnabled: false, qrUrl: '', qrLabel: 'Programm & Infos',
    timetableTitle: 'TIMETABLE', timetableSubtitle: 'line up',
    pricesTitle: 'GETRÄNKE', pricesSubtitle: 'preise',
    pin: '', timetableEvery: 3, timetableDuration: 20,
    pricesEvery: 5, pricesDuration: 25, showClock: true,
    fadeMs: 700, imageDuration: 12, timetableMaxNext: 5, priceNote: ''
  },
  videos: [], timetable: [], prices: [],
  announcement: { enabled: false, text: '', until: '', plans: [] },
  quiet: { enabled: false, from: '06:00', to: '14:00' },
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

// Muss dieselben Schritte gehen wie migrate() in main.js, sonst sieht eine
// Konfiguration je nach Geraet anders aus.
function migrieren(roh) {
  if (!roh.version || roh.version < 2) {
    roh.settings = roh.settings || {};
    delete roh.settings.accent;
  }
  // v3: eigener Schalter fuer den QR-Code. Vorher galt eine eingetragene
  // Adresse als "an" - das muss so bleiben.
  if (!roh.version || roh.version < 3) {
    roh.settings = roh.settings || {};
    if (roh.settings.qrEnabled === undefined) {
      roh.settings.qrEnabled = !!(roh.settings.qrUrl || '').trim();
    }
  }
  roh.version = VERSION_KONFIG;
  return roh;
}

function konfigLesen() {
  try {
    const roh = migrieren(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^﻿/, '')));
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

// Schreiben verlangt die PIN, sofern eine gesetzt ist. Lesen bleibt offen -
// die Anzeige im Kiosk-Browser kann keine PIN eintippen und braucht die
// Konfiguration trotzdem.
function darfSchreiben(req, res) {
  const cfg = konfigLesen();
  if (!(cfg.settings.pin || '').trim()) return true;
  if (anmeldung.angemeldet(req)) return true;
  json(res, { ok: false, fehler: 'Bitte erst die PIN eingeben.' }, 401);
  return false;
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

    if (pfad === '/api/zeit') {
      // Bewusst await: ein returntes Versprechen laeuft am try/catch vorbei,
      // und eine unbehandelte Ablehnung beendet in Node den ganzen Prozess.
      // Der Dienst wuerde dann bei jeder Zeitabfrage neu starten.
      return json(res, await zeitStatus());
    }

    // Die PIN steht in der Konfiguration - wer sie nicht kennt, bekommt sie
    // hier auch nicht zu lesen.
    if (pfad === '/api/config' && req.method === 'GET') {
      const cfg = konfigLesen();
      return json(res, anmeldung.angemeldet(req) ? cfg : anmeldung.ohnePin(cfg));
    }

    if (pfad === '/api/status') {
      const cfg = konfigLesen();
      return json(res, {
        pinAktiv: !!(cfg.settings.pin || '').trim(),
        angemeldet: anmeldung.angemeldet(req)
      });
    }

    if (pfad === '/api/anmelden' && req.method === 'POST') {
      const cfg = konfigLesen();
      const erwartet = (cfg.settings.pin || '').trim();
      if (!erwartet) return json(res, { ok: true, pinAktiv: false });

      const eingabe = JSON.parse(await koerperLesen(req) || '{}').pin;
      if (!anmeldung.pinStimmt(eingabe, erwartet)) {
        return json(res, { ok: false, fehler: 'PIN stimmt nicht.' }, 401);
      }
      res.setHeader('Set-Cookie', anmeldung.cookieKopf(anmeldung.anmelden()));
      return json(res, { ok: true });
    }

    if (pfad === '/api/config' && req.method === 'POST') {
      if (!darfSchreiben(req, res)) return;
      const roh = await koerperLesen(req);
      const neu = JSON.parse(roh);
      const alt = konfigLesen();

      // Wer die Konfiguration ungeschuetzt gelesen hat, bekam sie ohne PIN und
      // mit der Marke pinAktiv. Schickt er sie so zurueck, wuerde die echte PIN
      // stillschweigend verschwinden - also an der Marke erkennen und behalten.
      // Eine bewusst geleerte PIN kommt ohne die Marke, weil sie nur beim
      // Ausblenden gesetzt wird.
      if (neu.settings && neu.settings.pinAktiv && !(neu.settings.pin || '').trim()) {
        neu.settings.pin = alt.settings.pin;
      }
      if (neu.settings) delete neu.settings.pinAktiv;
      const gespeichert = konfigSchreiben(neu);
      // Wurde die PIN geaendert, gelten alte Anmeldungen nicht mehr
      if ((gespeichert.settings.pin || '') !== (alt.settings.pin || '')) anmeldung.abmeldenAlle();
      verkuenden(gespeichert);
      return json(res, gespeichert);
    }

    // ---- Datei vom Handy entgegennehmen ---------------------------------
    if (pfad === '/api/upload' && req.method === 'POST') {
      if (!darfSchreiben(req, res)) return;
      const art = url.searchParams.get('art') || '';
      const ordner = { media: MEDIA_DIR, photo: PHOTO_DIR, logo: BRAND_DIR, font: FONT_DIR }[art];
      if (!ordner) return json(res, { ok: false, fehler: 'Unbekannte Art.' }, 400);

      ordnerAnlegen();
      try {
        const erg = await entgegennehmen(req, art, url.searchParams.get('name') || '', ordner);
        const hinweis = art === 'media' ? formatHinweis(path.join(ordner, erg.name)) : null;
        return json(res, { ok: true, file: erg.name, groesse: erg.groesse, hinweis });
      } catch (err) {
        return json(res, { ok: false, fehler: err.message }, 400);
      }
    }

    // ---- Unbenutzte Act-Fotos wegraeumen --------------------------------
    if (pfad === '/api/aufraeumen' && req.method === 'POST') {
      if (!darfSchreiben(req, res)) return;
      ordnerAnlegen();
      const benutzt = new Set((konfigLesen().timetable || []).map(e => e.photo).filter(Boolean));
      let weg = 0;
      for (const f of fs.readdirSync(PHOTO_DIR)) {
        if (benutzt.has(f)) continue;
        try { fs.unlinkSync(path.join(PHOTO_DIR, f)); weg++; } catch (e) { /* egal */ }
      }
      return json(res, { ok: true, weg });
    }

    // ---- Datei wieder loeschen ------------------------------------------
    if (pfad === '/api/loeschen' && req.method === 'POST') {
      if (!darfSchreiben(req, res)) return;
      const art = url.searchParams.get('art') || '';
      const ordner = { media: MEDIA_DIR, photo: PHOTO_DIR, logo: BRAND_DIR, font: FONT_DIR }[art];
      if (!ordner) return json(res, { ok: false, fehler: 'Unbekannte Art.' }, 400);
      const name = path.basename(String(url.searchParams.get('name') || ''));
      const ziel = path.join(ordner, name);
      if (!name || path.dirname(path.resolve(ziel)) !== path.resolve(ordner)) {
        return json(res, { ok: false, fehler: 'Ungueltiger Name.' }, 400);
      }
      try { fs.unlinkSync(ziel); } catch (e) { return json(res, { ok: false, fehler: e.message }, 400); }
      return json(res, { ok: true });
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
        const rest = pfad.slice(praefix.length + 1);
        const datei = sicherJoin(ordner, rest);
        if (!datei) return fehler(res, 403, 'Nicht erlaubt');

        // Das mitgelieferte L300-Logo liegt in src/branding, nicht im Ordner der
        // Bar. Ohne diesen Rueckfall zeigt der Player unter Electron das
        // Standardlogo (relativer Pfad ab src/) und am Pi nichts.
        if (!fs.existsSync(datei) && praefix === '/branding') {
          const mitgeliefert = sicherJoin(path.join(SRC_DIR, 'branding'), rest);
          if (mitgeliefert && fs.existsSync(mitgeliefert)) return ausliefern(res, mitgeliefert, req);
        }
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

// Letztes Netz: ein einzelner Fehler in einer Anfrage darf nicht die ganze
// Anzeige mitnehmen. Node beendet sich bei unbehandelten Ablehnungen sonst von
// selbst, und mit Restart=always haette man einen Neustartkreisel statt einer
// Fehlermeldung.
process.on('unhandledRejection', (grund) => {
  console.error('[dienst] unbehandelte Ablehnung:', grund && grund.stack ? grund.stack : grund);
});
process.on('uncaughtException', (fehler) => {
  console.error('[dienst] unbehandelter Fehler:', fehler && fehler.stack ? fehler.stack : fehler);
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
