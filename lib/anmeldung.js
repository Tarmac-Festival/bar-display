'use strict';

// PIN-Schutz für die Bedienseite im Netzwerk.
//
// Bisher konnte jeder im selben WLAN unter /einstellungen alles ändern. Solange
// es dabei um Preise ging, war das ärgerlich; sobald Dateien hochgeladen werden
// können, ist es das nicht mehr. Deshalb: lesen bleibt offen - die Anzeige
// selbst braucht die Konfiguration und kann keine PIN eintippen - schreiben
// verlangt die PIN.
//
// Der Nachweis ist ein zufälliges Kürzel in einem Cookie. Es liegt nur im
// Arbeitsspeicher; nach einem Neustart des Dienstes muss neu angemeldet werden.

const crypto = require('crypto');

const GUELTIG_MS = 12 * 60 * 60 * 1000;   // ein Festivaltag reicht
const MARKE = 'bardisplay';

const kuerzel = new Map();   // kuerzel -> Ablaufzeitpunkt

function aufraeumen() {
  const jetzt = Date.now();
  for (const [k, bis] of kuerzel) if (bis <= jetzt) kuerzel.delete(k);
}

function anmelden() {
  aufraeumen();
  const k = crypto.randomBytes(24).toString('hex');
  kuerzel.set(k, Date.now() + GUELTIG_MS);
  return k;
}

function abmeldenAlle() { kuerzel.clear(); }

function cookieLesen(req) {
  const roh = req.headers.cookie || '';
  for (const teil of roh.split(';')) {
    const [k, ...rest] = teil.trim().split('=');
    if (k === MARKE) return rest.join('=');
  }
  return '';
}

function angemeldet(req) {
  aufraeumen();
  const k = cookieLesen(req);
  return !!(k && kuerzel.has(k));
}

// Zeitkonstanter Vergleich, damit sich die PIN nicht Ziffer für Ziffer
// erraten lässt. Bei vier Ziffern ist das eher Prinzip als Notwendigkeit -
// aber es kostet nichts.
function pinStimmt(eingabe, erwartet) {
  const a = Buffer.from(String(eingabe || ''), 'utf8');
  const b = Buffer.from(String(erwartet || ''), 'utf8');
  if (a.length !== b.length) {
    // trotzdem vergleichen, damit die Laufzeit nicht verrät wie lang die PIN ist
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function cookieKopf(k) {
  return MARKE + '=' + k + '; Path=/; Max-Age=' + Math.floor(GUELTIG_MS / 1000) +
         '; HttpOnly; SameSite=Strict';
}

// Die PIN selbst darf nie zu jemandem gehen, der sie nicht schon kennt -
// sonst könnte man sie aus /api/config einfach ablesen.
function ohnePin(cfg) {
  const kopie = JSON.parse(JSON.stringify(cfg));
  kopie.settings = kopie.settings || {};
  kopie.settings.pinAktiv = !!(kopie.settings.pin || '').trim();
  kopie.settings.pin = '';
  return kopie;
}

module.exports = { anmelden, angemeldet, abmeldenAlle, pinStimmt, cookieKopf, ohnePin };
