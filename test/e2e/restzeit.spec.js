'use strict';

// Wie lange der laufende Act noch spielt.
//
// Gegen Ende ist das die Information, die zaehlt: wer den Floor wechseln will,
// muss sonst selbst rechnen - im Dunkeln, aus drei Metern.

const { test, expect, beispiel } = require('./hilfe/bar');

// Nachtflug spielt 21:00 bis 23:00
function programm() {
  return beispiel({
    settings: { timetableEvery: 1, timetableDuration: 600, pricesEvery: 0, lichtEvery: 0 },
    timetable: [
      { id: 'a1', date: '2026-09-11', start: '21:00', end: '23:00', act: 'Nachtflug' },
      { id: 'a2', date: '2026-09-11', start: '23:00', end: '01:00', act: 'Doubkore' }
    ],
    prices: []
  });
}

async function anzeigeUm(page, bar, stunde, minute) {
  bar.konfig(programm());
  await page.clock.install({ time: new Date(2026, 8, 11, stunde, minute, 0) });
  await page.goto(bar.adresse + '/');
  await page.waitForSelector('.ttNow');
}

test('mitten im Set steht keine Restzeit da', async ({ page, bar }) => {
  await anzeigeUm(page, bar, 21, 30);          // noch 90 Minuten
  await expect(page.locator('.ttNow')).toContainText('Nachtflug');
  await expect(page.locator('.ttRest')).toHaveCount(0);
});

test('in der letzten halben Stunde schon', async ({ page, bar }) => {
  await anzeigeUm(page, bar, 22, 32);          // noch 28 Minuten
  await expect(page.locator('.ttRest')).toHaveText('nur noch 28 min');
});

test('sie steht beim laufenden Act, nicht in der Liste', async ({ page, bar }) => {
  await anzeigeUm(page, bar, 22, 45);
  await expect(page.locator('.ttNow .ttRest')).toHaveCount(1);
  await expect(page.locator('.ttList .ttRest')).toHaveCount(0);
});

test('sie zaehlt herunter', async ({ page, bar }) => {
  // Die Anzeige frischt sich alle zwanzig Sekunden auf.
  await anzeigeUm(page, bar, 22, 40);
  await expect(page.locator('.ttRest')).toHaveText('nur noch 20 min');

  await page.clock.runFor(5 * 60000 + 21000);
  await expect(page.locator('.ttRest')).toHaveText('nur noch 15 min');
});

test('nach dem Wechsel gilt sie fuer den naechsten Act', async ({ page, bar }) => {
  await anzeigeUm(page, bar, 22, 50);
  await expect(page.locator('.ttRest')).toHaveText('nur noch 10 min');

  // 23:10 - jetzt laeuft Doubkore, und der hat noch fast zwei Stunden
  await page.clock.runFor(20 * 60000 + 1000);
  await expect(page.locator('.ttNow')).toContainText('Doubkore');
  await expect(page.locator('.ttRest')).toHaveCount(0);
});

test('ohne Endzeit steht nichts da', async ({ page, bar }) => {
  bar.konfig(beispiel({
    settings: { timetableEvery: 1, timetableDuration: 600, pricesEvery: 0, lichtEvery: 0 },
    timetable: [{ id: 'a1', date: '2026-09-11', start: '21:00', end: '', act: 'Offen' }],
    prices: []
  }));
  await page.clock.install({ time: new Date(2026, 8, 11, 21, 30, 0) });
  await page.goto(bar.adresse + '/');
  await page.waitForSelector('.ttNow');
  await expect(page.locator('.ttRest')).toHaveCount(0);
});
