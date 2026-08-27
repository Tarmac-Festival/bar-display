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

test('ein Abbrechen wird sofort gemeldet', async ({ page, bar }) => {
  // Seit Safari 16 sagt der Browser selbst Bescheid. Vorher hing die Auswahl
  // bis zum Ablauf einer Uhr - und die riss das Feld unter einer noch offenen
  // Auswahl weg.
  await timetableOeffnen(page, bar);
  await page.getByRole('button', { name: 'Videos', exact: true }).click();

  const [wahl] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: '+ Videos & Bilder hinzufügen' }).click()
  ]);
  void wahl;

  // Playwright loest kein "cancel" aus - das Ereignis wird hier von Hand
  // geschickt, um zu pruefen, dass die Seite darauf hoert.
  const weg = await page.evaluate(async () => {
    const feld = document.querySelector('input[type=file]');
    feld.dispatchEvent(new Event('cancel'));
    await new Promise(r => setTimeout(r, 50));
    return !document.querySelector('input[type=file]');
  });
  expect(weg, 'die Auswahl ist beendet und aufgeraeumt').toBe(true);
});

test('das Feld wird nicht weggeraeumt, solange die Auswahl laeuft',
  async ({ page, bar }) => {
    // Der gemeldete Ablauf: in der Cloud auf einen Fehler laufen, mehrfach
    // "Wiederholen" tippen - das dauert. Vorher gab die Seite nach einer halben
    // Minute auf und nahm das Feld mit; ein Tippen auf eine Datei fuehrte dann
    // ins Leere. Jetzt wartet sie auf "change" oder "cancel" und sonst nichts.
    // Die Uhr muss vor dem Laden stehen, sonst uebernimmt sie das laufende
    // Intervall der Seite nicht und der Test misst nichts.
    await page.clock.install();
    await timetableOeffnen(page, bar);
    await page.getByRole('button', { name: 'Videos', exact: true }).click();

    const [wahl] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: '+ Videos & Bilder hinzufügen' }).click()
    ]);
    void wahl;

    // Fokus kommt zurueck (die Auswahl liegt darueber), danach vergeht Zeit
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.runFor(5 * 60000);

    const da = await page.evaluate(() => !!document.querySelector('input[type=file]'));
    expect(da, 'auch nach fuenf Minuten ist das Feld noch da').toBe(true);
  });
