'use strict';

// Gemeinsames Geruest fuer die Playwright-Tests.
//
// Jeder Test bekommt seinen eigenen Dienst auf einem freien Port und eine
// eigene, leere Datenablage in einem Wegwerf-Ordner. Damit kann nichts eine
// echte Konfiguration anfassen - das ist beim Entwickeln schon einmal
// schiefgegangen - und die Tests koennen nebeneinander laufen.
//
// Benutzt wird bewusst dieselbe Ablage wie auf dem Raspberry Pi
// (lib/konfigablage.js), nicht eine Nachbildung: ein Fehler darin faellt so
// hier auf, statt erst an der Bar.

const fs = require('fs');
const os = require('os');
const path = require('path');

const basis = require('@playwright/test');
const webserver = require('../../../lib/webserver');
const konfigablage = require('../../../lib/konfigablage');

const WURZEL = path.join(__dirname, '..', '..', '..');

// Ein gueltiges 8x8-PNG. Klein genug, um es hier stehen zu lassen, und echt
// genug, dass der Browser es wirklich laedt - eine leere Datei wuerde still
// scheitern und der Test waere wertlos.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHUlEQVQoU2NkYGD4z0AEYBxV' +
  'iKGYgWHUmYQCCQBcXQMBgqLLbwAAAABJRU5ErkJggg==', 'base64');

// Ein Video-Container mit HEVC-Kennung - reicht fuer die Formatauskunft, die
// nur nachsieht, welcher Codec im Container steht.
const HEVC = Buffer.from('....ftypqt  ....hvc1....', 'latin1');

/**
 * Beispielkonfiguration: genug, damit auf der Anzeige etwas zu sehen ist.
 * `zusatz` wird tief eingemischt - ein einzelner Wert unter settings soll nicht
 * den ganzen Block ersetzen.
 */
function beispiel(zusatz) {
  const heute = new Date();
  const iso = heute.getFullYear() + '-' +
              String(heute.getMonth() + 1).padStart(2, '0') + '-' +
              String(heute.getDate()).padStart(2, '0');
  return konfigablage.tiefMischen({
    settings: {
      barName: 'TARMAC BAR', subtitle: 'Planetenweide',
      // Harte Schnitte und kurze Standzeiten: die Tests sollen nicht auf
      // Blenden warten muessen.
      transition: 'cut', fadeMs: 0, imageDuration: 3,
      timetableEvery: 3, timetableDuration: 3,
      pricesEvery: 0, pricesDuration: 3,
      fernHinweis: false, qrEnabled: false
    },
    timetable: [
      { date: iso, start: '21:00', end: '23:00', act: 'Nachtflug', info: 'DJ-Set', photo: '' }
    ],
    prices: [
      { id: 'p1', category: 'Bier', items: [{ id: 'i1', name: 'Pils', size: '0,5 l', price: '4,00' }] }
    ]
  }, zusatz || {});
}

const test = basis.test.extend({
  // ---------------------------------------------------------------------
  // Der Dienst, wie ihn Handy und Raspberry Pi sehen
  // ---------------------------------------------------------------------
  bar: async ({}, benutze) => {
    const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-display-e2e-'));
    const ablage = konfigablage.erstellen(ordner);
    ablage.ordnerAnlegen();

    const gebaut = webserver.erstellen({
      ordner: ablage.ordner,
      lesen: ablage.lesen,
      schreiben: ablage.schreiben,
      version: 'test',
      srcDir: path.join(WURZEL, 'src')
    });

    await new Promise(r => gebaut.server.listen(0, '127.0.0.1', r));
    const adresse = 'http://127.0.0.1:' + gebaut.server.address().port;

    const bar = {
      adresse,
      ordner: ablage.ordner,

      /** Konfiguration setzen; ergaenzt, was schon da steht. */
      konfig(teil) {
        const neu = konfigablage.tiefMischen(ablage.lesen(), teil || {});
        const gespeichert = ablage.schreiben(neu);
        gebaut.verkuenden(gespeichert);   // wie beim Speichern aus der Bedienseite
        return gespeichert;
      },

      lies() { return ablage.lesen(); },

      /** Legt eine Datei in media/, photos/, branding/ oder fonts/ ab. */
      datei(art, name, inhalt) {
        const wohin = { media: ablage.ordner.media, photo: ablage.ordner.photo,
                        logo: ablage.ordner.brand, font: ablage.ordner.font }[art];
        fs.writeFileSync(path.join(wohin, name), inhalt || PNG);
        return name;
      },

      /** Legt Bilder als Beitraege an und traegt sie in die Schleife ein. */
      bilder(...namen) {
        const videos = namen.map((n, i) => {
          this.datei('media', n);
          return { id: 'b' + i, file: n, title: n, enabled: true, always: true, windows: [] };
        });
        this.konfig({ videos });
        return videos;
      },

      PNG, HEVC
    };

    await benutze(bar);

    // Offene Ereignisstroeme halten den Dienst sonst am Leben
    if (gebaut.server.closeAllConnections) gebaut.server.closeAllConnections();
    await new Promise(r => gebaut.server.close(r));
    fs.rmSync(ordner, { recursive: true, force: true });
  }
});

/**
 * Sammelt die Zeilen, die die Anzeige ueber die laufende Schleife schreibt.
 * Ergibt eine Liste wie ['eins.png', 'timetable', 'zwei.png', ...].
 */
function schleifeMitschreiben(seite) {
  const lauf = [];
  seite.on('console', (m) => {
    const t = m.text();
    if (t.startsWith('[schleife]')) {
      lauf.push(t.replace('[schleife] ', '').replace('video ', '').trim());
    }
  });
  return lauf;
}

/** Wartet, bis das Bild wirklich geladen ist - nicht nur, bis es im HTML steht. */
async function bildGeladen(fund) {
  await basis.expect.poll(
    () => fund.evaluate(el => el.complete && el.naturalWidth > 0),
    { message: 'Bild wurde nicht geladen' }
  ).toBe(true);
}

module.exports = { test, expect: basis.expect, beispiel, schleifeMitschreiben,
                   bildGeladen, PNG, HEVC, WURZEL };
