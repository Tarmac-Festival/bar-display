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
// Hier steht nur noch das Starten: der HTTP-Teil liegt in lib/webserver.js
// (den startet inzwischen auch die Electron-Fassung), die Ablage der
// Konfiguration in lib/konfigablage.js.

const webserver = require('../lib/webserver');
const konfigablage = require('../lib/konfigablage');

const PORT = Number(process.env.PORT) || 8080;

const ablage = konfigablage.erstellen(process.env.BARDISPLAY_DIR);

const { server } = webserver.erstellen({
  ordner: ablage.ordner,
  lesen: ablage.lesen,
  schreiben: ablage.schreiben,
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

ablage.ordnerAnlegen();
server.listen(PORT, () => {
  console.log('Bar Display läuft.');
  console.log('  Anzeige      : http://localhost:' + PORT + '/');
  for (const a of webserver.adressen()) {
    console.log('  Einstellungen: http://' + a + ':' + PORT + '/einstellungen');
  }
  console.log('  Datenablage  : ' + ablage.ordner.user);
});
