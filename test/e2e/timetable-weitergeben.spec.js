'use strict';

// Timetable weitergeben - jetzt auch vom Handy.
//
// Eine Bar richtet den Timetable ein, die anderen uebernehmen ihn. Bisher ging
// das nur am Rechner ueber den Dateidialog; die beiden Knoepfe waren auf der
// Bedienseite ausgeblendet.

const { test, expect, beispiel } = require('./hilfe/bar');

function programm() {
  return beispiel({
    timetable: [
      { id: 'a1', date: '2026-09-11', start: '21:00', end: '22:30',
        act: 'Elyxtra', photo: 'elyxtra.png' },
      { id: 'a2', date: '2026-09-11', start: '22:30', end: '00:00',
        act: 'Doubkore', photo: '' }
    ],
    prices: []
  });
}

test.describe('Weitergeben', () => {
  test('der Dienst liefert eine Datei mit Fotos', async ({ page, bar }) => {
    bar.datei('photo', 'elyxtra.png');
    bar.konfig(programm());

    const antwort = await page.request.get(bar.adresse + '/api/timetable');
    expect(antwort.ok()).toBe(true);
    expect(antwort.headers()['content-disposition'])
      .toContain('timetable.bardisplay.json');

    const daten = await antwort.json();
    expect(daten.kind).toBe('bar-display-timetable');
    expect(daten.entries.map(e => e.act)).toEqual(['Elyxtra', 'Doubkore']);
    expect(Object.keys(daten.photos), 'das Foto liegt bei')
      .toEqual(['elyxtra.png']);
  });

  test('der Knopf ist auf der Bedienseite da', async ({ page, bar }) => {
    bar.konfig(programm());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Timetable weitergeben…' }))
      .toBeVisible();
    await expect(page.getByRole('button', { name: 'Timetable übernehmen…' }))
      .toBeVisible();
  });

  test('der Knopf laedt die Datei herunter', async ({ page, bar }) => {
    bar.datei('photo', 'elyxtra.png');
    bar.konfig(programm());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Timetable weitergeben…' }).click()
    ]);
    expect(download.suggestedFilename()).toBe('timetable.bardisplay.json');
  });
});

test.describe('Uebernehmen', () => {
  const DATEI = {
    kind: 'bar-display-timetable',
    version: 1,
    entries: [
      { id: 'x1', date: '2026-09-12', start: '20:00', end: '21:00',
        act: 'Von woanders', photo: 'fremd.png' }
    ],
    photos: { 'fremd.png': Buffer.from('BILD').toString('base64') }
  };

  test('der Dienst nimmt die Datei an und legt das Foto ab',
    async ({ page, bar }) => {
      bar.konfig(programm());

      const antwort = await page.request.post(bar.adresse + '/api/timetable',
        { data: DATEI });
      expect(antwort.ok()).toBe(true);

      const erg = await antwort.json();
      expect(erg.ok).toBe(true);
      expect(erg.entries.map(e => e.act)).toEqual(['Von woanders']);

      // Und das Bild liegt jetzt wirklich im Fotoordner: die Anzeige holt es
      // ueber dieselbe Adresse wie jedes andere.
      const bild = await page.request.get(bar.adresse + '/photos/fremd.png');
      expect(bild.ok(), 'das mitgelieferte Foto ist abgelegt').toBe(true);
    });

  test('eine fremde Datei wird abgelehnt', async ({ page, bar }) => {
    bar.konfig(programm());
    const antwort = await page.request.post(bar.adresse + '/api/timetable',
      { data: { kind: 'irgendwas', entries: [] } });
    expect(antwort.status()).toBe(400);
    expect((await antwort.json()).fehler).toContain('keine weitergegebene');
  });

  test('kaputtes JSON auch', async ({ page, bar }) => {
    bar.konfig(programm());
    const antwort = await page.request.post(bar.adresse + '/api/timetable', {
      headers: { 'Content-Type': 'application/json' },
      data: '{ das ist kein JSON'
    });
    expect(antwort.status()).toBe(400);
  });

  test('die Bedienseite uebernimmt die Datei', async ({ page, bar }) => {
    bar.konfig(programm());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();
    page.on('dialog', d => d.accept());

    const [wahl] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Timetable übernehmen…' }).click()
    ]);
    await wahl.setFiles([{
      name: 'timetable.bardisplay.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(DATEI))
    }]);

    await expect(page.locator('#ttBody tr')).toHaveCount(1);
    await expect(page.locator('#ttBody input[data-f=act]'))
      .toHaveValue('Von woanders');

    // Noch nicht gespeichert - erst schauen, dann sichern
    await expect(page.locator('#dirty')).toBeVisible();
    expect(bar.lies().timetable.length, 'auf der Platte steht noch das Alte').toBe(2);
  });
});

test.describe('Mit PIN', () => {
  test('uebernehmen verlangt die Anmeldung', async ({ page, bar }) => {
    bar.konfig(beispiel({ settings: { pin: '4321' }, prices: [] }));

    const antwort = await page.request.post(bar.adresse + '/api/timetable', {
      data: { kind: 'bar-display-timetable', version: 1, entries: [], photos: {} }
    });
    expect(antwort.status()).toBe(401);
  });

  test('weitergeben darf jeder, der zusehen darf', async ({ page, bar }) => {
    // Lesen ist ohnehin offen - die Anzeige selbst kann keine PIN eintippen.
    bar.konfig(beispiel({ settings: { pin: '4321' }, prices: [] }));
    const antwort = await page.request.get(bar.adresse + '/api/timetable');
    expect(antwort.ok()).toBe(true);
  });
});
