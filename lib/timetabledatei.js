'use strict';

// Timetable weitergeben - als eine Datei, inklusive der Act-Fotos.
//
// Eine Bar richtet den Timetable ein, die anderen uebernehmen ihn. Ohne die
// Fotos waere das eine halbe Sache: die Eintraege verweisen auf Dateinamen, die
// es auf dem anderen Rechner nicht gibt, und ueberall stuenden leere Kaesten.
// Also liegen die Bilder mit in der Datei, als Base64.
//
// Steht hier und nicht in main.js, weil es zweimal gebraucht wird: am Rechner
// ueber den Dateidialog und am Handy ueber den Dienst. Zwei Fassungen davon
// wuerden frueher oder spaeter auseinanderlaufen - und das faellt erst auf,
// wenn eine Bar eine Datei bekommt, die die andere nicht lesen kann.

const KENNUNG = 'bar-display-timetable';
const FASSUNG = 1;

/** Vorschlag fuer den Dateinamen - an beiden Stellen derselbe. */
const DATEINAME = 'timetable.bardisplay.json';

/**
 * Baut den Inhalt der Datei aus der Konfiguration.
 *
 * Fehlt ein Foto auf der Platte, bleibt der Eintrag trotzdem drin: lieber ein
 * Act ohne Bild als ein Timetable ohne Act.
 */
function bauen(cfg, fs, path, fotoOrdner) {
  const entries = (cfg && cfg.timetable) || [];
  const photos = {};

  for (const e of entries) {
    if (!e || !e.photo || photos[e.photo]) continue;
    try {
      photos[e.photo] = fs.readFileSync(path.join(fotoOrdner, e.photo)).toString('base64');
    } catch (err) { /* Foto fehlt - der Eintrag bleibt */ }
  }

  return { kind: KENNUNG, version: FASSUNG, entries, photos };
}

/** Ist das ueberhaupt eine weitergegebene Timetable-Datei? */
function istTimetableDatei(daten) {
  return !!daten && daten.kind === KENNUNG && Array.isArray(daten.entries);
}

/**
 * Nimmt den Inhalt einer Datei an: schreibt die Fotos in den Ordner und gibt
 * die Eintraege zurueck. Gespeichert wird die Konfiguration hier nicht - das
 * macht die Bedienseite, damit man vorher noch schauen kann.
 *
 * Der Dateiname jedes Fotos wird auf seinen letzten Teil gekuerzt und danach
 * geprueft: eine Datei mit "../../etwas" im Namen darf nicht aus dem
 * Fotoordner herausschreiben.
 */
function uebernehmen(daten, fs, path, fotoOrdner) {
  if (!istTimetableDatei(daten)) {
    throw new Error('Das ist keine weitergegebene Timetable-Datei.');
  }

  const ziel = path.resolve(fotoOrdner);
  for (const [name, b64] of Object.entries(daten.photos || {})) {
    const datei = path.resolve(path.join(ziel, path.basename(name)));
    if (path.dirname(datei) !== ziel) continue;
    try { fs.writeFileSync(datei, Buffer.from(String(b64), 'base64')); }
    catch (err) { /* ein Bild weniger, der Rest kommt trotzdem an */ }
  }

  return daten.entries;
}

module.exports = { KENNUNG, FASSUNG, DATEINAME, bauen, uebernehmen, istTimetableDatei };
