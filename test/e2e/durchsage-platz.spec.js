'use strict';

// Eine Durchsage darf das Bild nicht zudecken.
//
// Der Balken lag ueber der Anzeige: beim Video war der untere Rand weg, beim
// Timetable die letzten Zeilen. Jetzt endet die Buehne darueber - das Video
// bekommt Raender an der Seite, die Seiten rechnen sich in die kleinere Flaeche.

const { test, expect, beispiel } = require('./hilfe/bar');

function acts(n) {
  const raus = [];
  for (let i = 0; i < n; i++) {
    const von = 21 + i;
    raus.push({
      id: 'a' + i,
      date: von < 24 ? '2026-09-11' : '2026-09-12',
      start: String(von % 24).padStart(2, '0') + ':00',
      end: String((von + 1) % 24).padStart(2, '0') + ':00',
      act: 'Act Nummer ' + (i + 1),
      info: 'DJ-Set'
    });
  }
  return raus;
}

function programm(anzahl) {
  return beispiel({
    settings: {
      timetableEvery: 1, timetableDuration: 600, pricesEvery: 0, lichtEvery: 0,
      timetableMaxNext: 12
    },
    timetable: acts(anzahl || 3),
    prices: [],
    announcement: { enabled: false, text: '' }
  });
}

async function anzeige(page, bar, anzahl) {
  bar.konfig(programm(anzahl));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.clock.install({ time: new Date(2026, 8, 11, 21, 30, 0) });
  await page.goto(bar.adresse + '/');
  await page.waitForSelector('.slide[data-kind=timetable]');

  // Die Anzeige misst neu, sobald die Schrift steht (siehe player.js). Vorher
  // gemessen bekommt man mal die eine, mal die andere Groesse.
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(400);
}

async function durchsageAn(page, bar, text) {
  bar.konfig({ announcement: { enabled: true, text: text || 'Letzte Bestellung' } });
  await page.waitForSelector('#durchsage.an');
  await page.waitForTimeout(600);
}

const buehne = (page) => page.evaluate(() => {
  const b = document.getElementById('stage').getBoundingClientRect();
  const d = document.getElementById('durchsage');
  const dr = d.classList.contains('an') ? d.getBoundingClientRect() : null;
  const inner = document.querySelector('.layer.show .slideInner');
  return {
    hoch: Math.round(b.height),
    unten: Math.round(b.bottom),
    balkenOben: dr ? Math.round(dr.top) : null,
    skala: inner ? Number(getComputedStyle(inner).getPropertyValue('--scale')) : null
  };
});

test('ohne Durchsage hat die Buehne den ganzen Schirm', async ({ page, bar }) => {
  await anzeige(page, bar);
  const b = await buehne(page);
  expect(b.hoch).toBe(1080);
});

test('mit Durchsage endet die Buehne genau darueber', async ({ page, bar }) => {
  await anzeige(page, bar);
  await durchsageAn(page, bar);

  const b = await buehne(page);
  expect(b.hoch, 'die Buehne ist kuerzer geworden').toBeLessThan(1080);
  expect(b.unten, 'und stoesst genau an den Balken').toBe(b.balkenOben);
});

test('nichts von der Anzeige liegt unter dem Balken', async ({ page, bar }) => {
  await anzeige(page, bar, 8);
  await durchsageAn(page, bar);

  const verdeckt = await page.evaluate(() => {
    const oben = document.getElementById('durchsage').getBoundingClientRect().top;
    const raus = [];
    document.querySelectorAll('.layer.show .ttRow, .layer.show .ttNow, ' +
                              '.layer.show .slideFoot').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > oben + 1) raus.push(el.className + ' bis ' + Math.round(r.bottom));
    });
    return raus;
  });
  expect(verdeckt).toEqual([]);
});

test('ein langer Timetable rechnet sich kleiner', async ({ page, bar }) => {
  // Der Beweis, dass nicht nur die Buehne kuerzer wird, sondern der Inhalt
  // auch neu eingepasst wird.
  await anzeige(page, bar, 12);
  const ohne = await buehne(page);
  await durchsageAn(page, bar);
  const mit = await buehne(page);

  expect(mit.skala, 'kleiner als ohne Durchsage').toBeLessThan(ohne.skala);
});

test('nach der Durchsage ist wieder alles da', async ({ page, bar }) => {
  await anzeige(page, bar, 12);
  const vorher = await buehne(page);
  await durchsageAn(page, bar);

  bar.konfig({ announcement: { enabled: false, text: '' } });
  await expect(page.locator('#durchsage.an')).toHaveCount(0);
  await page.waitForTimeout(600);

  const nachher = await buehne(page);
  expect(nachher.hoch).toBe(1080);
  expect(nachher.skala, 'und die Schrift wieder so gross wie vorher')
    .toBe(vorher.skala);
});

test('auch ein Video bleibt ueber dem Balken', async ({ page, bar }) => {
  // Das Video fuellt seine Ebene, die Ebene die Buehne. Endet die Buehne ueber
  // dem Balken, kann das Video nicht darunterreichen - "contain" gibt ihm dann
  // Raender an der Seite, statt es unten abzuschneiden.
  await anzeige(page, bar);
  await durchsageAn(page, bar);

  const lage = await page.evaluate(() => {
    const b = document.getElementById('stage').getBoundingClientRect();
    const ebenen = [...document.querySelectorAll('#stage .layer')]
      .map(el => Math.round(el.getBoundingClientRect().bottom));
    return { unten: Math.round(b.bottom), ebenen };
  });
  for (const u of lage.ebenen) expect(u).toBeLessThanOrEqual(lage.unten);
});
