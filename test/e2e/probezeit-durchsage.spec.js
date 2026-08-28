'use strict';

// Durchsagen waehrend einer Probezeit.
//
// Gemeldet: sie erscheinen nicht. Der Grund war, dass beide Seiten von
// verschiedenen Momenten sprachen. "Jetzt anzeigen" legte das Ende der
// Durchsage nach der echten Uhr fest, die Anzeige verglich es mit der
// Probezeit - und fand es laengst abgelaufen. Auf der Bedienseite stand
// "laeuft gerade", auf dem Bildschirm stand nichts.

const { test, expect, beispiel } = require('./hilfe/bar');

const ACHT_STUNDEN = 8 * 3600 * 1000;

function programm(versatz) {
  return beispiel({
    settings: {
      zeitVersatz: versatz || 0,
      timetableEvery: 1, timetableDuration: 600, pricesEvery: 0, lichtEvery: 0
    },
    timetable: [{ id: 'a1', date: '2026-09-11', start: '21:00', end: '23:00',
                  act: 'Nachtflug' }],
    prices: [],
    announcement: { enabled: false, text: '', plans: [] }
  });
}

async function durchsageAusloesen(page, bar, minuten) {
  await page.goto(bar.adresse + '/einstellungen');
  await page.locator('#an_text').fill('Letzte Bestellung');
  await page.locator('#an_dauer').selectOption(String(minuten));
  await page.getByRole('button', { name: 'Jetzt anzeigen' }).click();
  await expect(page.locator('#dirty')).toBeHidden();
}

test('mit Probezeit erscheint die Durchsage auf der Anzeige',
  async ({ page, bar, context }) => {
    bar.konfig(programm(ACHT_STUNDEN));
    await durchsageAusloesen(page, bar, 5);

    const anzeige = await context.newPage();
    await anzeige.goto(bar.adresse + '/');
    await expect(anzeige.locator('#durchsage.an')).toBeVisible();
    await expect(anzeige.locator('.durchsageText')).toContainText('Letzte Bestellung');
  });

test('ohne Probezeit natuerlich auch', async ({ page, bar, context }) => {
  // Gegenprobe: der Fehler lag an der Verschiebung, nicht an der Durchsage.
  bar.konfig(programm(0));
  await durchsageAusloesen(page, bar, 5);

  const anzeige = await context.newPage();
  await anzeige.goto(bar.adresse + '/');
  await expect(anzeige.locator('#durchsage.an')).toBeVisible();
});

test('das Ende liegt in der Probezeit, nicht in der echten', async ({ page, bar }) => {
  bar.konfig(programm(ACHT_STUNDEN));
  await durchsageAusloesen(page, bar, 5);

  const bis = new Date(bar.lies().announcement.until).getTime();
  const erwartet = Date.now() + ACHT_STUNDEN + 5 * 60000;
  expect(Math.abs(bis - erwartet), 'fuenf Minuten nach der Probezeit')
    .toBeLessThan(10000);
});

test('eine abgelaufene Durchsage bleibt abgelaufen', async ({ page, bar, context }) => {
  // Die Grenze soll ja weiterhin wirken - nur eben auf derselben Uhr.
  bar.konfig(beispiel({
    settings: { zeitVersatz: ACHT_STUNDEN, timetableEvery: 1, pricesEvery: 0, lichtEvery: 0 },
    prices: [],
    announcement: {
      enabled: true, text: 'Von gestern',
      until: new Date(Date.now() + ACHT_STUNDEN - 60000).toISOString()
    }
  }));

  const anzeige = await context.newPage();
  await anzeige.goto(bar.adresse + '/');
  await anzeige.waitForTimeout(1200);
  await expect(anzeige.locator('#durchsage.an')).toHaveCount(0);
  void page;
});

test('die Bedienseite sagt dasselbe wie die Anzeige', async ({ page, bar }) => {
  // Vorher stand hier "laeuft gerade", waehrend der Bildschirm leer blieb.
  bar.konfig(programm(ACHT_STUNDEN));
  await durchsageAusloesen(page, bar, 5);
  await expect(page.locator('#an_status')).toContainText('läuft gerade');

  // Und nach dem Ausblenden auch wieder dasselbe
  await page.getByRole('button', { name: 'Ausblenden' }).click();
  await expect(page.locator('#an_status')).toContainText('Keine Durchsage');
});

test('waehrend einer Probezeit wird nichts geloescht', async ({ page, bar }) => {
  // Nach einer erfundenen Uhr zu loeschen waere gefaehrlich: bei acht Stunden
  // Vorlauf gelten Zeiten als vergangen, die noch bevorstehen.
  bar.konfig(beispiel({
    settings: { zeitVersatz: ACHT_STUNDEN, timetableEvery: 1, pricesEvery: 0, lichtEvery: 0 },
    timetable: [
      { id: 'a1', date: '2026-09-11', start: '21:00', end: '23:00', act: 'Nachtflug' }
    ],
    prices: []
  }));
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Timetable', exact: true }).click();
  page.on('dialog', d => d.accept());

  await page.getByRole('button', { name: 'Vergangene löschen' }).first().click();
  await expect(page.locator('#toast')).toContainText('Probezeit');
  await expect(page.locator('#ttBody tr')).toHaveCount(1);
});
