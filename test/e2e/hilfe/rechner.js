'use strict';

// Geruest fuer die Tests am Bar-Rechner: Playwright startet das echte
// Electron-Programm.
//
// Auch hier bekommt jeder Test eine eigene, leere Datenablage - waehrend der
// Entwicklung ist mir einmal die laufende Konfiguration ueberschrieben worden,
// das soll ein Testlauf nie koennen. Uebergeben wird sie als
// --user-data-dir, denselben Weg benutzt Electron fuer app.getPath('userData').

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

const basis = require('@playwright/test');
const { _electron } = require('@playwright/test');
const konfigablage = require('../../../lib/konfigablage');

const WURZEL = path.join(__dirname, '..', '..', '..');

/** Einen Port suchen, den gerade niemand belegt. */
function freierPort() {
  return new Promise((fertig, schief) => {
    const horcher = net.createServer();
    horcher.on('error', schief);
    horcher.listen(0, '127.0.0.1', () => {
      const p = horcher.address().port;
      horcher.close(() => fertig(p));
    });
  });
}

const test = basis.test.extend({
  rechner: async ({}, benutze, hinweis) => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-display-electron-'));
    const ablage = konfigablage.erstellen(ordner);
    ablage.ordnerAnlegen();

    // Vorab-Konfiguration, damit das Programm nicht mit dem Standardport 8080
    // startet - der ist auf einem Entwicklungsrechner gern belegt.
    const port = await freierPort();
    ablage.schreiben({
      settings: {
        fernbedienung: true, fernPort: port, fernHinweis: false,
        transition: 'cut', fadeMs: 0, imageDuration: 3, qrEnabled: false,
        timetableEvery: 3, timetableDuration: 3, pricesEvery: 0
      },
      timetable: [{ date: '2026-08-26', start: '21:00', end: '23:00',
                    act: 'Nachtflug', info: 'DJ-Set', photo: '' }]
    });

    const app = await _electron.launch({
      args: [WURZEL, '--user-data-dir=' + ordner],
      cwd: WURZEL
    });

    const anzeige = await app.firstWindow();
    await anzeige.waitForLoadState('domcontentloaded');

    await benutze({
      app,
      anzeige,
      ordner,
      port,
      adresse: 'http://127.0.0.1:' + port,
      lies: () => ablage.lesen(),
      konfig: (teil) => ablage.schreiben(konfigablage.tiefMischen(ablage.lesen(), teil || {})),

      /** Oeffnet das Einstellungsfenster so, wie es der Benutzer tut. */
      async einstellungen() {
        const kommt = app.waitForEvent('window');
        await anzeige.evaluate(() => window.api.openSettings());
        const w = await kommt;
        await w.waitForLoadState('domcontentloaded');
        // Die Seite holt sich Pfade und Konfiguration erst nach dem Laden
        await w.waitForFunction(() => typeof state !== 'undefined' && state && state.settings);
        return w;
      }
    });

    await app.close();
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});

module.exports = { test, expect: basis.expect, freierPort, WURZEL };
