'use strict';

// Dateiauswahl auf dem Handy.
//
// Gemeldet: auf dem iPhone liess sich aus Google Drive nichts hinzufuegen -
// "Inhalt nicht verfuegbar, unbekannter Fehler". Ursache ist der Typfilter,
// den iOS an den Dateianbieter weiterreicht. Deshalb wird auf iOS keiner
// gesetzt; was wirklich taugt, entscheidet ohnehin der Dienst beim Hochladen.

const { test, expect, beispiel } = require('./hilfe/bar');

async function timetableOeffnen(page, bar) {
  bar.konfig(beispiel({ prices: [] }));
  await page.goto(bar.adresse + '/einstellungen');
}

/** Oeffnet die Auswahl und gibt zurueck, womit sie aufgemacht wurde. */
async function auswahlOeffnen(page, knopf) {
  const [wahl] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: knopf }).click()
  ]);
  const accept = await page.evaluate(() => {
    const f = document.querySelector('input[type=file]');
    return f ? f.getAttribute('accept') : 'kein Feld';
  });
  return { wahl, accept };
}

test('auf dem iPhone wird kein Typfilter gesetzt', async ({ page, bar }) => {
  // Sonst reicht iOS ihn an Google Drive weiter, und dort bleibt der Ordner
  // leer - siehe Kopf dieser Datei.
  expect(await page.evaluate(() => navigator.userAgent),
    'dieser Test ergibt nur auf einem iPhone Sinn').toContain('iPhone');

  await timetableOeffnen(page, bar);
  await page.getByRole('button', { name: 'Videos', exact: true }).click();

  const { wahl, accept } = await auswahlOeffnen(page, '+ Videos & Bilder hinzufügen');
  expect(accept, 'ohne Filter listet der Anbieter seinen Ordner normal auf')
    .toBe(null);
  await wahl.setFiles([]);
});

test('die Auswahl laesst mehrere Clips zu', async ({ page, bar }) => {
  await timetableOeffnen(page, bar);
  await page.getByRole('button', { name: 'Videos', exact: true }).click();

  const [wahl] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '+ Videos & Bilder hinzufügen' }).click()
  ]);
  expect(wahl.isMultiple()).toBe(true);
  await wahl.setFiles([]);
});
