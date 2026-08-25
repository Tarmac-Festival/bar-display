'use strict';

// Dateien, die über die Bedienseite vom Handy kommen, entgegennehmen.
//
// Bewusst kein multipart/form-data: der Absender ist unsere eigene Seite, also
// schicken wir die Datei als rohen Rumpf und den Namen in der Adresse. Das
// spart einen Parser, den man an genau dieser Stelle nicht falsch bauen möchte.
//
// Geschrieben wird streamend in eine Teildatei und erst am Ende umbenannt -
// bricht die Verbindung mitten im Upload ab (Handy im Funkloch), bleibt kein
// halbes Video im Medienordner liegen, das die Anzeige dann überspringt.

const fs = require('fs');
const path = require('path');
const { sicherName } = require('./dateiname');

// Was in welchen Ordner darf, und wie groß es höchstens sein darf.
const ARTEN = {
  media: {
    endungen: ['.mp4', '.webm', '.ogv', '.m4v', '.mov', '.mkv', '.avi',
               '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'],
    grenze: 500 * 1024 * 1024
  },
  photo: {
    endungen: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'],
    grenze: 25 * 1024 * 1024
  },
  logo: {
    endungen: ['.png', '.svg', '.jpg', '.jpeg', '.webp'],
    grenze: 10 * 1024 * 1024
  },
  font: {
    endungen: ['.ttf', '.otf', '.woff', '.woff2'],
    grenze: 10 * 1024 * 1024
  }
};

// Der Pi soll sich nicht die SD-Karte volllaufen lassen. Was darunter bleibt,
// wird abgelehnt statt halb geschrieben.
const RESERVE = 300 * 1024 * 1024;

function freierPlatz(dir) {
  try {
    if (typeof fs.statfsSync !== 'function') return null;
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch (e) {
    return null;   // keine Auskunft - dann eben ohne Prüfung
  }
}

function menschlich(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1024 * 1024) return Math.round(bytes / 1048576) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

/**
 * Nimmt den Rumpf von `req` entgegen und legt ihn in `dir` ab.
 * Löst mit { name, groesse } auf oder wirft mit einer Meldung im Klartext.
 */
function entgegennehmen(req, art, wunschname, dir) {
  const regeln = ARTEN[art];
  if (!regeln) return Promise.reject(new Error('Unbekannte Art: ' + art));

  const name = sicherName(wunschname, dir);
  const endung = path.extname(name).toLowerCase();
  if (!regeln.endungen.includes(endung)) {
    return Promise.reject(new Error(
      'Dieses Dateiformat nehmen wir hier nicht an' +
      (endung ? ' (' + endung + ')' : '') + '. Erlaubt: ' + regeln.endungen.join(', ')));
  }

  const angekuendigt = Number(req.headers['content-length'] || 0);
  if (angekuendigt && angekuendigt > regeln.grenze) {
    return Promise.reject(new Error(
      'Die Datei ist ' + menschlich(angekuendigt) + ' groß, hier gehen höchstens ' +
      menschlich(regeln.grenze) + '.'));
  }

  const platz = freierPlatz(dir);
  if (platz !== null && angekuendigt && platz - angekuendigt < RESERVE) {
    return Promise.reject(new Error(
      'Zu wenig Platz: noch ' + menschlich(platz) + ' frei. Bitte erst etwas löschen.'));
  }

  const ziel = path.join(dir, name);
  const teil = ziel + '.teil';

  return new Promise((fertig, fehlgeschlagen) => {
    const raus = fs.createWriteStream(teil);
    let geschrieben = 0;
    let abgebrochen = false;

    const aufraeumen = () => { try { fs.unlinkSync(teil); } catch (e) { /* egal */ } };
    const abbrechen = (meldung) => {
      if (abgebrochen) return;
      abgebrochen = true;
      req.unpipe(raus);
      raus.destroy();
      aufraeumen();
      fehlgeschlagen(new Error(meldung));
    };

    req.on('data', (stueck) => {
      geschrieben += stueck.length;
      // Auch ohne glaubwürdiges Content-Length nicht ins Unendliche schreiben
      if (geschrieben > regeln.grenze) {
        abbrechen('Die Datei ist größer als die erlaubten ' + menschlich(regeln.grenze) + '.');
        req.destroy();
      }
    });
    req.on('error', () => abbrechen('Die Übertragung ist abgebrochen.'));
    raus.on('error', (e) => abbrechen('Schreiben fehlgeschlagen: ' + e.message));

    raus.on('finish', () => {
      if (abgebrochen) return;
      if (geschrieben === 0) { aufraeumen(); return fehlgeschlagen(new Error('Die Datei war leer.')); }
      try {
        fs.renameSync(teil, ziel);
      } catch (e) {
        aufraeumen();
        return fehlgeschlagen(new Error('Ablegen fehlgeschlagen: ' + e.message));
      }
      fertig({ name, groesse: geschrieben });
    });

    req.pipe(raus);
  });
}

// ---------------------------------------------------------------------------
// Grobe Formatauskunft für Videos
// ---------------------------------------------------------------------------
// Ein Pi 3B dekodiert H.264 in Hardware, HEVC (H.265) überhaupt nicht - und
// genau das nehmen iPhones standardmäßig auf. Der Upload klappt dann, der Clip
// wird auf dem Bildschirm aber stumm übersprungen. Deshalb schauen wir kurz
// nach, welcher Codec im Container steckt, und sagen es sofort statt abends.
//
// Gesucht wird die Vierzeichenkennung aus der Beschreibung der Spur. Sie steht
// im moov-Kasten, der je nach Programm am Anfang oder am Ende der Datei liegt -
// darum beide Enden absuchen statt die ganze Datei zu lesen.
const SPANNE = 4 * 1024 * 1024;

function videoCodec(datei) {
  let fd = null;
  try {
    fd = fs.openSync(datei, 'r');
    const groesse = fs.fstatSync(fd).size;
    const stuecke = [];

    const lies = (von, laenge) => {
      if (laenge <= 0) return;
      const puffer = Buffer.alloc(laenge);
      const gelesen = fs.readSync(fd, puffer, 0, laenge, von);
      stuecke.push(puffer.slice(0, gelesen));
    };

    lies(0, Math.min(SPANNE, groesse));
    if (groesse > SPANNE) lies(Math.max(0, groesse - SPANNE), Math.min(SPANNE, groesse));

    const text = Buffer.concat(stuecke).toString('latin1');
    if (text.includes('hvc1') || text.includes('hev1')) return 'hevc';
    if (text.includes('avc1') || text.includes('avc3')) return 'h264';
    if (text.includes('av01')) return 'av1';
    if (text.includes('vp09') || text.includes('VP90')) return 'vp9';
    return null;
  } catch (e) {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e) { /* egal */ } }
  }
}

// Klartext für die Bedienseite. null heisst: nichts zu meckern.
function formatHinweis(datei) {
  const endung = path.extname(datei).toLowerCase();
  const istVideo = ['.mp4', '.m4v', '.mov', '.mkv', '.avi', '.webm', '.ogv'].includes(endung);
  if (!istVideo) return null;

  const codec = videoCodec(datei);
  if (codec === 'h264') return null;

  if (codec === 'hevc') {
    return 'Dieser Clip ist in HEVC (H.265) aufgenommen - das spielt ein Raspberry Pi nicht ab '
         + 'und wird auf dem Bildschirm übersprungen. iPhones nehmen so auf; in den '
         + 'Kameraeinstellungen unter "Formate" auf "Maximale Kompatibilität" stellen, '
         + 'oder den Clip am Rechner nach MP4 (H.264) umwandeln.';
  }
  if (codec === 'av1' || codec === 'vp9') {
    return 'Dieser Clip ist in ' + (codec === 'av1' ? 'AV1' : 'VP9') + ' kodiert. Auf einem '
         + 'Raspberry Pi läuft das höchstens ruckelig. Am sichersten ist MP4 mit H.264.';
  }
  if (['.mkv', '.avi', '.mov'].includes(endung)) {
    return 'Ob dieses Format hier abspielbar ist, lässt sich nicht sicher sagen. '
         + 'Am sichersten ist MP4 mit H.264 - notfalls am Rechner umwandeln.';
  }
  return null;
}

module.exports = { entgegennehmen, formatHinweis, videoCodec, ARTEN, menschlich };
