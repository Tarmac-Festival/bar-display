'use strict';

// Was nach einem Speichern weiter getippt wird, muss auch ankommen.
//
// Der Server setzt die Konfiguration beim Speichern neu zusammen und gibt sie
// zurueck. Uebernahm die Bedienseite diese Antwort, ohne die Listen neu zu
// bauen, zeigten die Zeilen weiter auf die alten Eintraege: Getipptes stand im
// Feld, kam aber nirgends an - und war beim naechsten Neuaufbau weg.

const { test, expect, beispiel } = require('./hilfe/bar');

function programm() {
  return beispiel({
    timetable: [{ id: 'a1', date: '2026-09-11', start: '21:00', end: '22:30', act: 'Elyxtra' }],
    prices: [{ id: 'g1', category: 'Bier', items: [{ id: 'p1', name: 'Pils', price: '4' }] }]
  });
}

async function timetableOeffnen(page, bar) {
  bar.konfig(programm());
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Timetable', exact: true }).click();
}

test('nach dem Speichern kommt Getipptes weiter im Zustand an',
  async ({ page, bar }) => {
    await timetableOeffnen(page, bar);
    const act = page.locator('#ttBody tr').first().locator('input[data-f=act]');

    await act.fill('Elyxtra live');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    await act.fill('Elyxtra B2B Doubkore');
    const imZustand = await page.evaluate(() => state.timetable[0].act);
    expect(imZustand, 'das Feld und der Zustand duerfen nicht auseinanderlaufen')
      .toBe('Elyxtra B2B Doubkore');
  });

test('ein neuer Act wirft die ungespeicherte Aenderung nicht weg',
  async ({ page, bar }) => {
    // Genau der gemeldete Ablauf: speichern, weitertippen, Act hinzufuegen.
    await timetableOeffnen(page, bar);
    const act = page.locator('#ttBody tr').first().locator('input[data-f=act]');

    await act.fill('Elyxtra live');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    await act.fill('Elyxtra B2B Doubkore');
    await page.getByRole('button', { name: '+ Act hinzufügen' }).click();

    await expect(page.locator('#ttBody tr').first().locator('input[data-f=act]'))
      .toHaveValue('Elyxtra B2B Doubkore');
    await expect(page.locator('#ttBody tr')).toHaveCount(2);
  });

test('dasselbe gilt fuer die Karte', async ({ page, bar }) => {
  bar.konfig(programm());
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Karte', exact: true }).click();

  const name = page.locator('#priceList .iName').first();
  await name.fill('Pils 0,3');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('#dirty')).toBeHidden();

  await name.fill('Pils vom Fass');
  expect(await page.evaluate(() => state.prices[0].items[0].name))
    .toBe('Pils vom Fass');
});

test('Strg+S uebernimmt ein noch nicht verlassenes Zeitfeld',
  async ({ page, bar }) => {
    // Datum und Uhrzeit werden erst beim Verlassen des Feldes uebernommen.
    // Ohne Zutun sicherte Strg+S deshalb den alten Wert, waehrend im Feld
    // schon der neue stand.
    await timetableOeffnen(page, bar);
    const bis = page.locator('#ttBody tr').first().locator('td[data-titel=Bis] .feldText');

    await bis.click();
    await bis.fill('23:45');
    await page.keyboard.press('Control+s');
    await expect(page.locator('#dirty')).toBeHidden();

    expect(bar.lies().timetable[0].end).toBe('23:45');
  });

test('der Fokus bleibt nach dem Speichern im selben Feld',
  async ({ page, bar }) => {
    // Wer zwanzig Acts eintippt und zwischendurch Strg+S drueckt, soll nicht
    // jedes Mal den Faden verlieren.
    await timetableOeffnen(page, bar);
    const bis = page.locator('#ttBody tr').first().locator('td[data-titel=Bis] .feldText');

    await bis.click();
    await bis.fill('23:45');
    await page.keyboard.press('Control+s');
    await expect(page.locator('#dirty')).toBeHidden();

    const wo = await page.evaluate(() => {
      const el = document.activeElement;
      const td = el.closest && el.closest('td');
      const tr = el.closest && el.closest('tr');
      return { klasse: el.className, wert: el.value,
               zeile: tr && tr.dataset.eid, spalte: td && td.dataset.titel };
    });
    expect(wo).toEqual({ klasse: 'feldText', wert: '23:45', zeile: 'a1', spalte: 'Bis' });
  });

test('auch ein gewoehnliches Textfeld bekommt den Fokus zurueck',
  async ({ page, bar }) => {
    await timetableOeffnen(page, bar);
    const act = page.locator('#ttBody tr').first().locator('input[data-f=act]');

    await act.click();
    await act.fill('Elyxtra live');
    await page.keyboard.press('Control+s');
    await expect(page.locator('#dirty')).toBeHidden();

    const wo = await page.evaluate(() => {
      const el = document.activeElement;
      const tr = el.closest && el.closest('tr');
      return { feld: el.dataset && el.dataset.f, zeile: tr && tr.dataset.eid };
    });
    expect(wo).toEqual({ feld: 'act', zeile: 'a1' });
  });
