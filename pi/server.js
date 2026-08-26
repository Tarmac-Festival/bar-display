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
// Der HTTP-Teil steckt in lib/webserver.js, weil ihn inzwischen auch die
// Electron-Fassung startet. Hier bleibt nur, was den Pi ausmacht: die Ablage
// der Konfiguration, denn dort gibt es keinen Hauptprozess, der sie verwaltet.

const fs = require('fs');
const path = require('path');
const os = require('os');

const webserver = require('../lib/webserver');

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
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
                   'Bar Display');
}

const USER_DIR = process.env.BARDISPLAY_DIR || standardOrdner();
const ORDNER = {
  user: USER_DIR,
  media: path.join(USER_DIR, 'media'),
  photo: path.join(USER_DIR, 'photos'),
  brand: path.join(USER_DIR, 'branding'),
  font: path.join(USER_DIR, 'fonts'),
  config: path.join(USER_DIR, 'config.json')
};
const BACKUP_PATH = path.join(USER_DIR, 'config.backup.json');

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
  for (const d of [ORDNER.media, ORDNER.photo, ORDNER.brand, ORDNER.font]) {
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
    const roh = migrieren(JSON.parse(fs.readFileSync(ORDNER.config, 'utf8').replace(/^﻿/, '')));
    return tiefMischen(STANDARD, roh);
  } catch (err) {
    return JSON.parse(JSON.stringify(STANDARD));
  }
}

function konfigSchreiben(cfg) {
  ordnerAnlegen();
  const gemischt = tiefMischen(STANDARD, cfg || {});
  try {
    if (fs.existsSync(ORDNER.config)) fs.copyFileSync(ORDNER.config, BACKUP_PATH);
  } catch (e) { /* egal */ }
  fs.writeFileSync(ORDNER.config, JSON.stringify(gemischt, null, 2), 'utf8');
  return gemischt;
}

// ---------------------------------------------------------------------------
const { server } = webserver.erstellen({
  ordner: ORDNER,
  lesen: konfigLesen,
  schreiben: konfigSchreiben,
  version: require('../package.json').version
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
  console.log('Bar Display läuft.');
  console.log('  Anzeige      : http://localhost:' + PORT + '/');
  for (const a of webserver.adressen()) {
    console.log('  Einstellungen: http://' + a + ':' + PORT + '/einstellungen');
  }
  console.log('  Datenablage  : ' + ORDNER.user);
});
