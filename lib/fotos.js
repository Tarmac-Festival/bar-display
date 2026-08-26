'use strict';

// Welche Fotos aus dem Foto-Ordner werden gerade benutzt?
//
// Steht hier und nicht an den beiden Aufraeum-Stellen, weil es genau eine
// Antwort geben darf: main.js (Electron) und lib/webserver.js (Raspberry Pi)
// raeumen denselben Ordner auf und loeschen, was nicht in dieser Liste steht.
//
// Genau daran ist es schon einmal schiefgegangen: die Aufraeumfunktion kannte
// nur die Act-Fotos aus dem Timetable. Als die Speisekarte Fotos bekam, haette
// ein Klick auf "Unbenutzte Fotos aufraeumen" sie alle geloescht - stillschweigend
// und ohne Weg zurueck. Wer hier eine neue Stelle mit Fotos einbaut, traegt sie
// bitte hier nach.

/**
 * Alle Dateinamen, die in der Konfiguration auf ein Foto zeigen.
 * @param {object} cfg  die vollstaendige Konfiguration
 * @returns {Set<string>}
 */
function benutzteFotos(cfg) {
  const c = cfg || {};
  const raus = new Set();
  const nimm = (name) => {
    if (typeof name === 'string' && name.trim()) raus.add(name);
  };

  // Acts im Timetable
  for (const e of (c.timetable || [])) nimm(e && e.photo);

  // Positionen der Karte und das Hervorgehobene je Gruppe
  for (const gruppe of (c.prices || [])) {
    if (!gruppe) continue;
    for (const pos of (gruppe.items || [])) nimm(pos && pos.photo);
    nimm(gruppe.spezial && gruppe.spezial.photo);
  }

  // Der seitenweite Spezialshot
  nimm(c.special && c.special.photo);

  return raus;
}

/**
 * Raeumt den Foto-Ordner auf: alles weg, was nirgends mehr vorkommt.
 * Liefert die Zahl der geloeschten Dateien.
 */
function fotosAufraeumen(fs, path, ordner, cfg) {
  const benutzt = benutzteFotos(cfg);
  let weg = 0;
  for (const datei of fs.readdirSync(ordner)) {
    if (benutzt.has(datei)) continue;
    try { fs.unlinkSync(path.join(ordner, datei)); weg++; } catch (e) { /* egal */ }
  }
  return weg;
}

module.exports = { benutzteFotos, fotosAufraeumen };
