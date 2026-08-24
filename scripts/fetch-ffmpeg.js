#!/usr/bin/env node
'use strict';

// Holt die ffmpeg-Binaerdateien fuer alle Zielplattformen nach vendor/.
// Wird von "npm run vendor:ffmpeg" aufgerufen und vom Build vorausgesetzt,
// weil ffmpeg-static beim Installieren immer nur die eigene Plattform holt.

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');

const TAG = 'b6.1.1';
const BASIS = 'https://github.com/eugeneware/ffmpeg-static/releases/download/' + TAG;

const ZIELE = [
  { plattform: 'win32', arch: 'x64', datei: 'ffmpeg.exe', magie: [0x4d, 0x5a] },              // MZ
  { plattform: 'linux', arch: 'x64', datei: 'ffmpeg', magie: [0x7f, 0x45, 0x4c, 0x46] }       // ELF
];

const MINDESTGROESSE = 10 * 1024 * 1024;
const VERSUCHE = 3;

function lade(url, ziel, sprung = 0) {
  return new Promise((resolve, reject) => {
    if (sprung > 5) return reject(new Error('zu viele Weiterleitungen'));

    const anfrage = https.get(url, { headers: { 'User-Agent': 'bar-display' } }, (res) => {
      const code = res.statusCode;

      // GitHub leitet Release-Dateien weiter; je nach Route mit 301, 302, 303,
      // 307 oder 308 - deshalb alle Umleitungen behandeln, nicht nur zwei.
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        return lade(new URL(res.headers.location, url).toString(), ziel, sprung + 1)
          .then(resolve, reject);
      }
      if (code !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + code + ' bei ' + url));
      }

      const entpacker = zlib.createGunzip();
      const aus = fs.createWriteStream(ziel);
      let erledigt = false;
      const scheitern = (err) => {
        if (erledigt) return;
        erledigt = true;
        res.destroy();
        entpacker.destroy();
        aus.destroy();
        reject(err);
      };

      // Jede Stufe braucht einen eigenen Fehlerbehandler. Fehlt einer, beendet
      // Node den Prozess mit einer unbehandelten Ausnahme statt sauber zu melden.
      res.on('error', scheitern);
      entpacker.on('error', (e) => scheitern(new Error('Entpacken fehlgeschlagen: ' + e.message)));
      aus.on('error', scheitern);
      aus.on('finish', () => { if (!erledigt) { erledigt = true; resolve(); } });

      res.pipe(entpacker).pipe(aus);
    });

    anfrage.on('error', reject);
    anfrage.setTimeout(120000, () => anfrage.destroy(new Error('Zeitüberschreitung beim Laden')));
  });
}

function pruefen(ziel, z) {
  const groesse = fs.statSync(ziel).size;
  if (groesse < MINDESTGROESSE) {
    throw new Error('Datei nur ' + groesse + ' Bytes gross - Download unvollstaendig');
  }
  const kopf = Buffer.alloc(z.magie.length);
  const fd = fs.openSync(ziel, 'r');
  try { fs.readSync(fd, kopf, 0, kopf.length, 0); } finally { fs.closeSync(fd); }
  if (!kopf.equals(Buffer.from(z.magie))) {
    throw new Error('Datei ist kein Programm fuer ' + z.plattform + ' (Kopf: ' + kopf.toString('hex') + ')');
  }
  return groesse;
}

(async () => {
  for (const z of ZIELE) {
    const ordner = path.join(__dirname, '..', 'vendor', 'ffmpeg', z.plattform + '-' + z.arch);
    const ziel = path.join(ordner, z.datei);

    if (fs.existsSync(ziel)) {
      try {
        pruefen(ziel, z);
        console.log('vorhanden : ' + z.plattform + '-' + z.arch);
        continue;
      } catch (err) {
        console.log('erneut    : ' + z.plattform + '-' + z.arch + ' (' + err.message + ')');
        try { fs.unlinkSync(ziel); } catch (e) { /* egal */ }
      }
    }

    fs.mkdirSync(ordner, { recursive: true });
    const url = BASIS + '/ffmpeg-' + z.plattform + '-' + z.arch + '.gz';

    let letzterFehler = null;
    for (let versuch = 1; versuch <= VERSUCHE; versuch++) {
      try {
        process.stdout.write('lade      : ' + z.plattform + '-' + z.arch +
                             (versuch > 1 ? ' (Versuch ' + versuch + ')' : '') + ' ... ');
        await lade(url, ziel);
        const groesse = pruefen(ziel, z);
        if (z.plattform !== 'win32') fs.chmodSync(ziel, 0o755);
        console.log(Math.round(groesse / 1048576) + ' MB');
        letzterFehler = null;
        break;
      } catch (err) {
        letzterFehler = err;
        console.log('fehlgeschlagen: ' + err.message);
        try { if (fs.existsSync(ziel)) fs.unlinkSync(ziel); } catch (e) { /* egal */ }
        if (versuch < VERSUCHE) await new Promise(r => setTimeout(r, 2000 * versuch));
      }
    }
    if (letzterFehler) throw letzterFehler;
  }
  console.log('fertig');
})().catch((err) => {
  console.error('Fehlgeschlagen: ' + err.message);
  process.exit(1);
});
