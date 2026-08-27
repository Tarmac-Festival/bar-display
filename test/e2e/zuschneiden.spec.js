'use strict';

// Nach dem Hochladen gleich zuschneiden.
//
// Fast jedes Handyfoto ist hochkant, die Anzeige beschneidet aber quadratisch -
// der erste Blick gilt also ohnehin dem Ausschnitt. Vorher musste man ihn ueber
// einen kleinen Knopf auf der Miniatur suchen.

const { test, expect, beispiel, PNG } = require('./hilfe/bar');

const BILD = { name: 'gericht.png', mimeType: 'image/png', buffer: PNG };

async function fotoWaehlen(page, knopf) {
  const [wahl] = await Promise.all([
    page.waitForEvent('filechooser'),
    knopf.click()
  ]);
  await wahl.setFiles([BILD]);
}

test('beim Act geht der Ausschnitt gleich auf', async ({ page, bar }) => {
  bar.konfig(beispiel({
    timetable: [{ id: 'a1', date: '2026-09-11', start: '21:00', end: '22:30',
                  act: 'Elyxtra', photo: '' }]
  }));
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Timetable', exact: true }).click();

  await fotoWaehlen(page, page.locator('.photoAdd').first());
  await expect(page.locator('.cropSchirm')).toBeVisible();
  // Die organische Form der Act-Fotos
  await expect(page.locator('.cropBuehne')).not.toHaveClass(/karte/);
});

test('bei der Karte geht er in der Form der Karte auf', async ({ page, bar }) => {
  bar.konfig(beispiel({
    prices: [{ id: 'g1', category: 'Vom Grill', stil: 'karten',
               items: [{ id: 'p1', name: 'Daal', price: '5,00 €', photo: '' }] }]
  }));
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Karte', exact: true }).click();

  await fotoWaehlen(page, page.locator('.itemRow .photoAdd').first());
  await expect(page.locator('.cropSchirm')).toBeVisible();
  await expect(page.locator('.cropBuehne')).toHaveClass(/karte/);
});

test('Abbrechen laesst das Foto stehen', async ({ page, bar }) => {
  // Der Ausschnitt ist ein Angebot, keine Pflicht.
  bar.konfig(beispiel({
    timetable: [{ id: 'a1', date: '2026-09-11', start: '21:00', end: '22:30',
                  act: 'Elyxtra', photo: '' }]
  }));
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Timetable', exact: true }).click();

  await fotoWaehlen(page, page.locator('.photoAdd').first());
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  await expect(page.locator('.cropSchirm')).toHaveCount(0);

  await expect(page.locator('.photoWrap img')).toBeVisible();
  expect(await page.evaluate(() => state.timetable[0].photo)).toBe('gericht.png');
});

test('ein neues Foto erbt nicht den Ausschnitt des alten',
  async ({ page, bar }) => {
    // Der Ausschnitt gehoerte zum alten Bild. Uebernommen sass er beim neuen
    // irgendwo - beim Essen gern auf dem Tellerrand.
    bar.datei('photo', 'alt.png');
    bar.konfig(beispiel({
      timetable: [{ id: 'a1', date: '2026-09-11', start: '21:00', end: '22:30',
                    act: 'Elyxtra', photo: 'alt.png',
                    crop: { x: 10, y: 90, z: 2.5 } }]
    }));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();

    // Auf den Bildkasten, nicht auf das Bild: ein stark vergroessertes Bild
    // ragt ueber seinen Kasten hinaus, und die Mitte seines Rahmens liegt dann
    // ausserhalb des Sichtbaren - dort waere der Loeschknopf.
    await fotoWaehlen(page, page.locator('.photoWrap .photoBox').first());
    await page.getByRole('button', { name: 'Abbrechen' }).click();

    const e = await page.evaluate(() => state.timetable[0]);
    expect(e.photo).toBe('gericht.png');
    expect(e.crop, 'der alte Ausschnitt ist weg').toBeUndefined();
  });
