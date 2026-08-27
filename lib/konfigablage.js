'use strict';

// Die Konfiguration auf der Platte: lesen, schreiben, Ordner anlegen.
//
// Auf dem Raspberry Pi gibt es keinen Electron-Hauptprozess, der das uebernimmt
// - dort macht es der Dienst selbst. Frueher stand das mitten in pi/server.js;
// seit es hier liegt, laesst es sich einzeln pruefen, und die Testumgebung
// benutzt dieselbe Ablage wie der Pi statt einer Nachbildung, die mit der Zeit
// auseinanderlaeuft.
//
// Achtung: main.js hat eine eigene Fassung davon (DEFAULT_CONFIG, migrate,
// loadConfig, saveConfig). Beide muessen dieselben Schritte gehen, sonst sieht
// eine Konfiguration je nach Geraet anders aus.

const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION_KONFIG = 3;

const STANDARD = {
  version: VERSION_KONFIG,
  // Fortlaufende Nummer jeder gespeicherten Fassung - daran erkennen Handy und
  // Einstellungsfenster, ob sie noch auf dem Stand sind, den sie geladen haben.
  stand: 0,
  settings: {
    barName: 'TARMAC BAR', subtitle: 'Planetenweide',
    bgColor: '#450b6f', accent: '#74ff40', accent2: '#f04e23',
    logo: '', logoHeight: 9, fontFile: '',
    titleStyle: 'blob', pattern: 'dots', displayId: '', rotation: 0,
    sparmodus: false,
    fernbedienung: true, fernPort: 8080, fernHinweis: true,
    transition: 'fade', transitionMs: 900,
    uebergaenge: ['fade', 'zoom', 'schieben', 'wipe', 'logo'],
    uebergangsFolge: 'zufall',
    qrEnabled: false, qrUrl: '', qrLabel: 'Programm & Infos',
    timetableTitle: 'TIMETABLE', timetableSubtitle: 'line up',
    pricesTitle: 'GETRÄNKE', pricesSubtitle: 'preise',
    pin: '', timetableEvery: 3, timetableDuration: 20,
    timetableEinheit: 'beitraege',
    pricesEvery: 5, pricesDuration: 25, showClock: true,
    zeitVersatz: 0,
    pricesEinheit: 'beitraege',
    lichtEvery: 0, lichtDuration: 20, lichtEinheit: 'beitraege',
    lichtTitel: 'LICHTEFFEKTE', lichtUnterzeile: 'wann es blitzt',
    lichtDoku: 'https://docs.google.com/document/d/1N-lTeO5lJyfZbEJVk--TiU1DMayqi5ldfZ8Uu_MODT4/edit',
    fadeMs: 700, imageDuration: 12, timetableMaxNext: 5, priceNote: ''
  },
  videos: [], timetable: [], prices: [],
  // Zeiten fuer starke Lichteffekte, siehe lichtFenster() in src/common.js
  lichteffekte: [],
  announcement: { enabled: false, text: '', until: '',
                  modus: 'fest', tempo: 'normal', plans: [] },
  quiet: { enabled: false, from: '06:00', to: '14:00' },
  special: { enabled: false, label: 'SPEZIALSHOT', name: '', size: '', price: '', text: '' }
};

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
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
                   'Bar Display');
}

function ordnerFuer(userDir) {
  return {
    user: userDir,
    media: path.join(userDir, 'media'),
    photo: path.join(userDir, 'photos'),
    brand: path.join(userDir, 'branding'),
    font: path.join(userDir, 'fonts'),
    config: path.join(userDir, 'config.json')
  };
}

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

// Muss dieselben Schritte gehen wie migrate() in main.js.
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

/**
 * Ablage in einem bestimmten Ordner. Ohne Angabe der uebliche Ort des Systems.
 * Liefert genau die Teile, die lib/webserver.js braucht.
 */
function erstellen(userDir) {
  const ordner = ordnerFuer(userDir || standardOrdner());
  const sicherung = path.join(ordner.user, 'config.backup.json');

  function ordnerAnlegen() {
    for (const d of [ordner.media, ordner.photo, ordner.brand, ordner.font]) {
      fs.mkdirSync(d, { recursive: true });
    }
  }

  function lesen() {
    try {
      // Der BOM am Anfang laesst JSON.parse sonst scheitern - Windows-Editoren
      // schreiben ihn gern mit.
      const roh = migrieren(JSON.parse(fs.readFileSync(ordner.config, 'utf8').replace(/^﻿/, '')));
      return tiefMischen(STANDARD, roh);
    } catch (err) {
      return JSON.parse(JSON.stringify(STANDARD));
    }
  }

  function schreiben(cfg) {
    ordnerAnlegen();
    const gemischt = tiefMischen(STANDARD, cfg || {});
    // Siehe STANDARD.stand: fortlaufende Nummer der Fassung
    gemischt.stand = (Number(lesen().stand) || 0) + 1;
    // kleines Sicherheitsnetz: letzte Fassung aufheben
    try {
      if (fs.existsSync(ordner.config)) fs.copyFileSync(ordner.config, sicherung);
    } catch (e) { /* egal */ }
    fs.writeFileSync(ordner.config, JSON.stringify(gemischt, null, 2), 'utf8');
    return gemischt;
  }

  return { ordner, lesen, schreiben, ordnerAnlegen, sicherung };
}

module.exports = { erstellen, standardOrdner, ordnerFuer, tiefMischen, migrieren,
                   STANDARD, VERSION_KONFIG };
