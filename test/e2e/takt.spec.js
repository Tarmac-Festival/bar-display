'use strict';

// Häufigkeit der Info-Seiten: gezählt in Beiträgen oder abgewartet in Minuten.
//
// Die Uhr wird gestellt und vorgespult (page.clock), sonst müsste ein Test über
// zwei Minuten echt warten.

const { test, expect, beispiel, schleifeMitschreiben } = require('./hilfe/bar');

const ABEND = new Date(2026, 7, 28, 22, 0, 0).getTime();

function programm(zusatz) {
  return beispiel(Object.assign({
    settings: { transition: 'cut', fadeMs: 0, pricesEvery: 0, lichtEvery: 0 },
    timetable: [{ date: '2026-08-28', start: '21:00', end: '23:00', act: 'Nachtflug' }],
    prices: []
  }, zusatz || {}));
}

async function laufen(page, bar, sekunden) {
  const lauf = schleifeMitschreiben(page);
  await page.clock.install({ time: ABEND });
  await page.goto(bar.adresse + '/');
  // In Schritten vorspulen, damit die Zeitgeber der Anzeige dazwischenkommen
  for (let i = 0; i < sekunden / 15; i++) await page.clock.runFor(15000);
  await page.waitForTimeout(400);
  return lauf;
}

test('nach Minuten: die Seite kommt, wenn die Zeit um ist', async ({ page, bar }) => {
  // Beiträge à 30 s, Timetable alle 2 Minuten -> nach je vier Beiträgen
  bar.konfig(programm({
    settings: { imageDuration: 30, timetableEvery: 2, timetableEinheit: 'minuten',
                timetableDuration: 5 }
  }));
  bar.bilder('a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png', 'g.png', 'h.png');

  const lauf = await laufen(page, bar, 400);
  const stellen = lauf.map((x, i) => (x === 'timetable' ? i : -1)).filter(i => i >= 0);

  expect(stellen.length, lauf.join(' > ')).toBeGreaterThanOrEqual(2);
  // Zwischen zwei Timetables liegen vier Beiträge à 30 Sekunden
  for (let i = 1; i < stellen.length; i++) {
    expect(stellen[i] - stellen[i - 1] - 1, lauf.join(' > ')).toBe(4);
  }
});

test('der laufende Beitrag laeuft immer zu Ende', async ({ page, bar }) => {
  // Ein sehr langer Beitrag und eine sehr kurze Frist: die Seite darf trotzdem
  // nicht mitten hineinplatzen.
  bar.konfig(programm({
    settings: { imageDuration: 60, timetableEvery: 1, timetableEinheit: 'minuten',
                timetableDuration: 5 }
  }));
  bar.bilder('a.png', 'b.png');

  const lauf = schleifeMitschreiben(page);
  await page.clock.install({ time: ABEND });
  await page.goto(bar.adresse + '/');
  await expect.poll(() => lauf.length, { timeout: 15000 }).toBeGreaterThanOrEqual(1);

  // Nach 20 Sekunden ist die Frist noch nicht um und der Beitrag laeuft
  await page.clock.runFor(20000);
  expect(lauf.length, 'nichts dazwischengeplatzt').toBe(1);

  // Nach 70 Sekunden ist der Beitrag durch und die Seite dran
  await page.clock.runFor(50000);
  await page.waitForTimeout(300);
  expect(lauf[1]).toBe('timetable');
});

test('nach Beitraegen bleibt alles wie gehabt', async ({ page, bar }) => {
  bar.konfig(programm({
    settings: { imageDuration: 5, timetableEvery: 2, timetableEinheit: 'beitraege',
                timetableDuration: 3 }
  }));
  bar.bilder('a.png', 'b.png', 'c.png', 'd.png');

  const lauf = await laufen(page, bar, 120);
  const stellen = lauf.map((x, i) => (x === 'timetable' ? i : -1)).filter(i => i >= 0);
  expect(stellen.length, lauf.join(' > ')).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < stellen.length; i++) {
    expect(stellen[i] - stellen[i - 1] - 1, lauf.join(' > ')).toBe(2);
  }
});

test('zwei Seiten nach der Uhr behindern sich nicht', async ({ page, bar }) => {
  bar.konfig(programm({
    settings: { imageDuration: 20, timetableDuration: 4, pricesDuration: 4,
                timetableEvery: 1, timetableEinheit: 'minuten',
                pricesEvery: 2, pricesEinheit: 'minuten' },
    prices: [{ id: 'g', category: 'Bier', stil: 'liste',
               items: [{ id: 'i', name: 'Pils', price: '4,00' }] }]
  }));
  bar.bilder('a.png', 'b.png', 'c.png');

  const lauf = await laufen(page, bar, 400);
  const tt = lauf.filter(x => x === 'timetable').length;
  const pr = lauf.filter(x => x === 'prices').length;

  expect(tt, lauf.join(' > ')).toBeGreaterThanOrEqual(2);
  // Die seltenere Seite wird nicht dauerhaft verdraengt
  expect(pr, lauf.join(' > ')).toBeGreaterThanOrEqual(1);
});

test('die Runde wird dadurch nicht durcheinandergebracht', async ({ page, bar }) => {
  bar.konfig(programm({
    settings: { imageDuration: 30, timetableEvery: 2, timetableEinheit: 'minuten',
                timetableDuration: 5 }
  }));
  bar.bilder('a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png');

  const lauf = await laufen(page, bar, 400);
  const nurBilder = lauf.filter(x => x.endsWith('.png'));

  // Die Beitraege laufen in ihrer Reihenfolge weiter, als waere nichts gewesen
  const reihe = ['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png'];
  for (let i = 0; i < nurBilder.length; i++) {
    expect(nurBilder[i], lauf.join(' > ')).toBe(reihe[i % reihe.length]);
  }
});
