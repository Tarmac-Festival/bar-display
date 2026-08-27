'use strict';

// Gegenstueck zu hochladen.handy.spec.js: ausserhalb von iOS bleibt der
// Typfilter. Er macht die Auswahl bequemer und richtet dort keinen Schaden an -
// weggenommen wird er nur da, wo er die Dateianbieter lahmlegt.

const { test, expect, beispiel } = require('./hilfe/bar');

test('am Rechner bleibt der Typfilter gesetzt', async ({ page, bar }) => {
  expect(await page.evaluate(() => navigator.userAgent),
    'dieser Test ergibt nur ausserhalb von iOS Sinn').not.toContain('iPhone');

  bar.konfig(beispiel({ prices: [] }));
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Videos', exact: true }).click();

  const [wahl] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '+ Videos & Bilder hinzufügen' }).click()
  ]);
  const accept = await page.evaluate(() =>
    document.querySelector('input[type=file]').getAttribute('accept'));
  expect(accept).toBe('video/*,image/*');
  await wahl.setFiles([]);
});

test('Logo und Schrift nennen auch die Medientypen, nicht nur Endungen',
  async ({ page, bar }) => {
    // Manche Dateianbieter koennen mit einer blossen Endung nichts anfangen
    // und zeigen dann gar nichts an.
    bar.konfig(beispiel({ prices: [] }));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();

    const [wahl] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Eigenes Logo wählen…' }).click()
    ]);
    const accept = await page.evaluate(() =>
      document.querySelector('input[type=file]').getAttribute('accept'));
    expect(accept).toContain('image/png');
    expect(accept, 'die Endungen bleiben dabei').toContain('.svg');
    await wahl.setFiles([]);
  });
