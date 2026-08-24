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
  { plattform: 'win32', arch: 'x64', datei: 'ffmpeg.exe' },
  { plattform: 'linux', arch: 'x64', datei: 'ffmpeg' }
];

function lade(url, ziel) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'bar-display' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return lade(res.headers.location, ziel).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(url + ' -> HTTP ' + res.statusCode));
      }
      const aus = fs.createWriteStream(ziel);
      res.pipe(zlib.createGunzip()).pipe(aus);
      aus.on('finish', () => aus.close(resolve));
      aus.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  for (const z of ZIELE) {
    const ordner = path.join(__dirname, '..', 'vendor', 'ffmpeg', z.plattform + '-' + z.arch);
    const ziel = path.join(ordner, z.datei);
    if (fs.existsSync(ziel) && fs.statSync(ziel).size > 1000000) {
      console.log('vorhanden : ' + z.plattform + '-' + z.arch);
      continue;
    }
    fs.mkdirSync(ordner, { recursive: true });
    const url = BASIS + '/ffmpeg-' + z.plattform + '-' + z.arch + '.gz';
    process.stdout.write('lade      : ' + z.plattform + '-' + z.arch + ' ... ');
    await lade(url, ziel);
    if (z.plattform !== 'win32') fs.chmodSync(ziel, 0o755);
    console.log(Math.round(fs.statSync(ziel).size / 1048576) + ' MB');
  }
  console.log('fertig');
})().catch((err) => {
  console.error('Fehlgeschlagen: ' + err.message);
  process.exit(1);
});
