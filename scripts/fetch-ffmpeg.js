#!/usr/bin/env node
'use strict';

// Holt die ffmpeg-Binaerdateien fuer alle Zielplattformen nach vendor/.
// Wird von "npm run vendor:ffmpeg" aufgerufen und vom Build vorausgesetzt,
// weil ffmpeg-static beim Installieren immer nur die eigene Plattform holt.

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const TAG = 'b6.1.1';
const BASIS = 'https://github.com/eugeneware/ffmpeg-static/releases/download/' + TAG;

// Die Pruefsummen sind bewusst fest eingetragen: damit ist ein Bau von heute
// und einer in zwei Jahren garantiert mit derselben ffmpeg-Fassung gebaut,
// auch wenn beim Anbieter etwas ausgetauscht wird.
const ZIELE = [
  {
    plattform: 'win32', arch: 'x64', datei: 'ffmpeg.exe',
    magie: [0x4d, 0x5a],                                             // MZ
    sha256: '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
    groesse: 82797568
  },
  {
    plattform: 'linux', arch: 'x64', datei: 'ffmpeg',
    magie: [0x7f, 0x45, 0x4c, 0x46],                                 // ELF
    sha256: 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
    groesse: 79826272
  },
  // macOS: beide Bauarten, weil ein Mac-Paket auf Apple Silicon wie auf Intel
  // laufen soll. Zur Laufzeit wird die passende ausgewaehlt.
  {
    plattform: 'darwin', arch: 'x64', datei: 'ffmpeg-x64',
    magie: [0xcf, 0xfa, 0xed, 0xfe],                                 // Mach-O 64
    sha256: 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
    groesse: 78862176
  },
  {
    plattform: 'darwin', arch: 'arm64', datei: 'ffmpeg-arm64',
    magie: [0xcf, 0xfa, 0xed, 0xfe],                                 // Mach-O 64
    sha256: 'a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584',
    groesse: 45568216
  }
];

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
  const inhalt = fs.readFileSync(ziel);
  const sha0 = crypto.createHash('sha256').update(inhalt).digest('hex');

  // Noch keine Sollwerte eingetragen: nur melden, damit sie uebernommen werden koennen
  if (!z.sha256) {
    console.log('\n  (noch ungeprueft) ' + z.plattform + '-' + z.arch +
                '  sha256 ' + sha0 + '  ' + groesse + ' Bytes');
    return groesse;
  }

  if (groesse !== z.groesse) {
    throw new Error('Groesse ' + groesse + ' statt ' + z.groesse + ' Bytes');
  }
  if (!inhalt.subarray(0, z.magie.length).equals(Buffer.from(z.magie))) {
    throw new Error('kein Programm fuer ' + z.plattform +
                    ' (Kopf: ' + inhalt.subarray(0, z.magie.length).toString('hex') + ')');
  }
  const sha = sha0;
  if (sha !== z.sha256) {
    throw new Error('Pruefsumme weicht ab\n  erwartet ' + z.sha256 + '\n  bekommen ' + sha);
  }
  return groesse;
}

(async () => {
  for (const z of ZIELE) {
    const ordner = path.join(__dirname, '..', 'vendor', 'ffmpeg',
                             z.plattform === 'darwin' ? 'darwin' : z.plattform + '-' + z.arch);
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
