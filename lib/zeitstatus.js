'use strict';

// Steht die Systemuhr richtig?
//
// Ein Raspberry Pi hat keine batteriegepufferte Uhr. Ohne Abgleich aus dem Netz
// startet er mit der Zeit des letzten Herunterfahrens - und das sieht auf den
// ersten Blick voellig plausibel aus. Daran haengt hier aber alles: Timetable,
// Zeitfenster der Clips, Ruhezeit und die geplanten Durchsagen. Deshalb fragen
// wir das System, ob die Uhr wirklich aus dem Netz kommt, statt es zu raten.
//
// Wird von main.js (Electron) und pi/server.js gleichermassen benutzt.

const { execFile } = require('child_process');
const fs = require('fs');

// Jede Abfrage startet einen timedatectl-Prozess. Steht die Uhr, aendert sich
// daran praktisch nie etwas - dann reicht alle zehn Minuten. Steht sie nicht,
// warten wir auf den Abgleich und fragen oefter, damit der Warnhinweis zuegig
// wieder verschwindet, sobald das Netz da ist.
const FRISCH_OK_MS = 600000;    // zehn Minuten
const FRISCH_WARTEN_MS = 20000; // zwanzig Sekunden
let zwischenspeicher = null;
let geholtUm = 0;

function jetztAlsText(d) {
  const z = (n) => String(n).padStart(2, '0');
  return z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear() +
         ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
}

// Windows und macOS halten ihre Uhr selbst in Ordnung und haben eine echte
// Hardware-Uhr - dort gibt es nichts zu warnen.
function pruefbar() {
  return process.platform === 'linux';
}

function timedatectl() {
  return new Promise((fertig) => {
    execFile('timedatectl', ['show', '-p', 'NTPSynchronized', '--value'],
      { timeout: 4000 }, (fehler, aus) => {
        if (fehler) return fertig(null);
        const wert = String(aus || '').trim().toLowerCase();
        if (wert === 'yes' || wert === 'true') return fertig(true);
        if (wert === 'no' || wert === 'false') return fertig(false);
        fertig(null);
      });
  });
}

// systemd-timesyncd legt diese Datei an, sobald es einmal abgeglichen hat.
// Faellt timedatectl aus, ist das der zweitbeste Anhaltspunkt.
function markierungsdatei() {
  try {
    return fs.existsSync('/run/systemd/timesync/synchronized');
  } catch (e) {
    return false;
  }
}

async function zeitStatus() {
  const jetzt = new Date();

  if (!pruefbar()) {
    return { pruefbar: false, synchronisiert: null, zeit: jetzt.toISOString(),
             anzeige: jetztAlsText(jetzt) };
  }

  const haltbar = zwischenspeicher && zwischenspeicher.synchronisiert
    ? FRISCH_OK_MS : FRISCH_WARTEN_MS;
  if (zwischenspeicher && Date.now() - geholtUm < haltbar) {
    return Object.assign({}, zwischenspeicher,
      { zeit: jetzt.toISOString(), anzeige: jetztAlsText(jetzt) });
  }

  let sync = await timedatectl();
  if (sync === null) sync = markierungsdatei();

  zwischenspeicher = { pruefbar: true, synchronisiert: !!sync };
  geholtUm = Date.now();
  return Object.assign({}, zwischenspeicher,
    { zeit: jetzt.toISOString(), anzeige: jetztAlsText(jetzt) });
}

module.exports = { zeitStatus, pruefbar };
