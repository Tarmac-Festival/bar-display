'use strict';

// Zeiten für starke Lichteffekte.
//
// Hier gilt eine andere Messlatte als beim übrigen Programm: wer sich auf diese
// Angabe verlässt, tut das aus gesundheitlichen Gründen. Eine falsche oder
// unsichtbare Warnung ist schlimmer als gar keine — deshalb wird hier nicht nur
// geprüft, dass etwas dasteht, sondern auch, dass man es sieht.

const { test, expect, beispiel, bildGeladen, schleifeMitschreiben } = require('./hilfe/bar');

// Feste Uhrzeit, damit die Tests nicht davon abhängen, wann sie laufen
const FREITAG_20_UHR = new Date(2026, 7, 28, 20, 0, 0).getTime();

async function zeitStellen(page, wann) {
  await page.clock.install({ time: wann });
}

function programm(zusatz) {
  return beispiel(Object.assign({
    timetable: [
      { date: '2026-08-28', start: '21:00', end: '23:00', act: 'Vorband', info: 'Live', photo: '' },
      { date: '2026-08-28', start: '23:00', end: '01:30', act: 'Nachtflug', info: 'DJ-Set', photo: '' }
    ],
    lichteffekte: [
      { id: 'l1', date: '2026-08-28', start: '23:30', end: '01:00', note: 'Hauptbühne' }
    ]
  }, zusatz || {}));
}

test.describe('Kennzeichnung im Timetable', () => {
  test('betroffener Act bekommt das Zeichen, der andere nicht', async ({ page, bar }) => {
    bar.konfig(programm());
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const zeilen = page.locator('.ttRow');
    await expect(zeilen).toHaveCount(3);       // zwei Acts, eine Lichtphase

    // Die Vorband spielt 21-23 Uhr, das Licht faengt erst 23:30 an
    const vorband = zeilen.filter({ hasText: 'Vorband' });
    await expect(vorband).not.toHaveClass(/hatLicht/);
    await expect(vorband.locator('.lichtZeichen')).toHaveCount(0);

    // Nachtflug spielt 23-01:30 und wird getroffen
    const nachtflug = zeilen.filter({ hasText: 'Nachtflug' });
    await expect(nachtflug).toHaveClass(/hatLicht/);
    await expect(nachtflug.locator('.lichtZeichen')).toHaveCount(1);
  });

  test('die Lichtphase steht als eigene Zeile mit ihrer echten Zeit',
    async ({ page, bar }) => {
      bar.konfig(programm());
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');

      const licht = page.locator('.ttRow.licht');
      await expect(licht).toHaveCount(1);
      // Die eigene Zeitspanne, nicht die des Acts (23:00-01:30)
      await expect(licht.locator('.when')).toHaveText('23:30–01:00');
      await expect(licht).toContainText('Starke Lichteffekte');
      await expect(licht).toContainText('Hauptbühne');
    });

  test('die Zeilen stehen in der richtigen Reihenfolge', async ({ page, bar }) => {
    bar.konfig(programm());
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const zeiten = await page.locator('.ttRow .when').allInnerTexts();
    expect(zeiten).toEqual(['21:00–23:00', '23:00–01:30', '23:30–01:00']);
  });

  test('ohne eingetragene Zeiten aendert sich nichts', async ({ page, bar }) => {
    bar.konfig(programm({ lichteffekte: [] }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    await expect(page.locator('.ttRow')).toHaveCount(2);
    await expect(page.locator('.lichtZeichen')).toHaveCount(0);
  });

  test('ein Eintrag ohne Endzeit wird nicht angezeigt', async ({ page, bar }) => {
    // Eine Angabe ohne Ende ist genau die ungefaehre Auskunft, auf die sich
    // niemand verlassen kann - sie darf gar nicht erst erscheinen.
    bar.konfig(programm({
      lichteffekte: [{ id: 'l1', date: '2026-08-28', start: '23:30', note: 'unfertig' }]
    }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    await expect(page.locator('.ttRow.licht')).toHaveCount(0);
    await expect(page.locator('.lichtZeichen')).toHaveCount(0);
  });

  test('waehrend der Lichtphase steht die Warnung ganz oben', async ({ page, bar }) => {
    bar.konfig(programm());
    // 00:15 in der Nacht auf Samstag - mitten in der Phase
    await zeitStellen(page, new Date(2026, 7, 29, 0, 15, 0).getTime());
    await page.goto(bar.adresse + '/');

    const warnung = page.locator('.lichtJetzt');
    await expect(warnung).toBeVisible();
    await expect(warnung).toContainText('Starke Lichteffekte');
    await expect(warnung).toContainText('noch bis 01:00');
    await expect(warnung.locator('.lichtZeichen')).toHaveCount(1);

    // Und sie steht nicht noch einmal in der Liste darunter - dieselbe Angabe
    // zweimal auf dem Schirm verwirrt mehr, als sie hilft.
    await expect(page.locator('.ttRow.licht')).toHaveCount(0);
  });

  test('das Zeichen ueberdeckt den Act-Namen nicht', async ({ page, bar }) => {
    bar.konfig(programm());
    await zeitStellen(page, new Date(2026, 7, 29, 0, 15, 0).getTime());
    await page.goto(bar.adresse + '/');

    // Der laufende Act ist betroffen und traegt das Zeichen
    const karte = page.locator('.ttNow');
    await expect(karte.locator('.lichtZeichen')).toHaveCount(1);

    const lage = await karte.evaluate((el) => {
      const name = el.querySelector('.act > span, .act');
      const zeichen = el.querySelector('.lichtZeichen');
      const k = el.getBoundingClientRect();
      const z = zeichen.getBoundingClientRect();
      return {
        // Das Zeichen muss innerhalb der Karte bleiben
        drin: z.right <= k.right + 1 && z.bottom <= k.bottom + 1,
        // und rechts vom Text stehen, nicht darauf
        textEnde: name.getBoundingClientRect().right,
        zeichenAnfang: z.left
      };
    });
    expect(lage.drin, 'das Zeichen bleibt in der Karte').toBe(true);
  });
});

test.describe('Das Zeichen', () => {
  test('wird geladen und sitzt auf heller Plakette', async ({ page, bar }) => {
    bar.konfig(programm());
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const bild = page.locator('.ttRow.licht .lichtZeichen img');
    await expect(bild).toHaveAttribute('src', 'branding/lichteffekte.png');
    await bildGeladen(bild);

    // Die gelieferte Grafik ist schwarz auf transparent. Ohne helle Flaeche
    // waere sie auf dem dunklen Hintergrund praktisch unsichtbar.
    const grund = await page.locator('.ttRow.licht .lichtZeichen')
      .evaluate(el => getComputedStyle(el).backgroundColor);
    expect(grund).toBe('rgb(255, 255, 255)');

    // Und sie muss eine brauchbare Groesse haben, nicht ein paar Pixel
    const hoehe = await bild.evaluate(el => el.getBoundingClientRect().height);
    expect(hoehe).toBeGreaterThan(10);
  });
});

test.describe('Eigene Seite fuers Wochenende', () => {
  test('laeuft nur mit, wenn sie eingeschaltet ist', async ({ page, bar }) => {
    bar.konfig(programm({ settings: { lichtEvery: 0, timetableEvery: 0, pricesEvery: 0 } }));
    bar.bilder('eins.png', 'zwei.png');
    await zeitStellen(page, FREITAG_20_UHR);

    const lauf = schleifeMitschreiben(page);
    await page.goto(bar.adresse + '/');
    await expect.poll(() => lauf.length, { timeout: 20000 }).toBeGreaterThanOrEqual(4);
    expect(lauf).not.toContain('licht');
  });

  test('eingeschaltet kommt sie in der Schleife', async ({ page, bar }) => {
    bar.konfig(programm({
      settings: { lichtEvery: 2, lichtDuration: 3, timetableEvery: 0, pricesEvery: 0,
                  imageDuration: 2 }
    }));
    bar.bilder('eins.png', 'zwei.png');
    await zeitStellen(page, FREITAG_20_UHR);

    const lauf = schleifeMitschreiben(page);
    await page.goto(bar.adresse + '/');
    await expect.poll(() => lauf.includes('licht'), { timeout: 25000 }).toBe(true);
  });

  test('zeigt die Zeiten nach Tagen, Vergangenes faellt weg', async ({ page, bar }) => {
    bar.konfig(programm({
      settings: { lichtEvery: 1, lichtDuration: 30, timetableEvery: 0, pricesEvery: 0 },
      lichteffekte: [
        { id: 'a', date: '2026-08-27', start: '22:00', end: '23:00', note: 'vorbei' },
        { id: 'b', date: '2026-08-28', start: '23:30', end: '01:00', note: 'Hauptbühne' },
        { id: 'c', date: '2026-08-29', start: '22:00', end: '23:00', note: '' }
      ]
    }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const seite = page.locator('.slide[data-kind=licht]');
    await expect(seite).toBeVisible();
    await expect(seite.locator('.lichtTag')).toHaveCount(2);
    await expect(seite).not.toContainText('vorbei');
    await expect(seite.locator('.lichtSpanne').first()).toContainText('23:30–01:00');
    await expect(seite).toContainText('Hauptbühne');
  });

  test('die laufende Phase ist auf der Seite hervorgehoben', async ({ page, bar }) => {
    bar.konfig(programm({
      settings: { lichtEvery: 1, lichtDuration: 30, timetableEvery: 0, pricesEvery: 0 }
    }));
    await zeitStellen(page, new Date(2026, 7, 29, 0, 15, 0).getTime());
    await page.goto(bar.adresse + '/');

    const laeuft = page.locator('.slide[data-kind=licht] .lichtSpanne.laeuft');
    await expect(laeuft).toHaveCount(1);
    await expect(laeuft).toContainText('läuft');
  });

  test('ohne Zeiten sagt die Seite das auch', async ({ page, bar }) => {
    bar.konfig(programm({
      settings: { lichtEvery: 1, lichtDuration: 30, timetableEvery: 0, pricesEvery: 0 },
      lichteffekte: []
    }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    // Ohne angemeldete Zeiten laeuft die Seite gar nicht erst mit
    await expect(page.locator('.slide[data-kind=licht]')).toHaveCount(0);
  });
});

test.describe('Eintragen auf der Bedienseite', () => {
  async function reiter(page, bar, zusatz) {
    bar.konfig(programm(zusatz));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();
  }

  test('die Liste steht getrennt vom Timetable', async ({ page, bar }) => {
    await reiter(page, bar);

    const block = page.locator('.lichtBlock');
    await expect(block).toBeVisible();
    await expect(block.getByRole('heading', { name: /Starke Lichteffekte/ })).toBeVisible();

    // Eine Zeile, die vorhandene
    await expect(page.locator('#lichtBody tr')).toHaveCount(1);
    await expect(page.locator('#lichtBody tr [data-f=start]')).toHaveValue('23:30');
    await expect(page.locator('#lichtBody tr [data-f=end]')).toHaveValue('01:00');
    await expect(page.locator('#lichtBody tr [data-f=note]')).toHaveValue('Hauptbühne');
  });

  test('das Zeichen steht auch hier auf heller Plakette', async ({ page, bar }) => {
    await reiter(page, bar);
    const bild = page.locator('#lichtSymbol img');
    await bildGeladen(bild);
    const grund = await page.locator('#lichtSymbol')
      .evaluate(el => getComputedStyle(el).backgroundColor);
    expect(grund).toBe('rgb(255, 255, 255)');
  });

  test('ein Zeitraum laesst sich anlegen und speichern', async ({ page, bar }) => {
    await reiter(page, bar, { lichteffekte: [] });
    await expect(page.locator('#lichtEmpty')).toBeVisible();

    await page.getByRole('button', { name: '+ Zeitraum hinzufügen' }).click();
    const zeile = page.locator('#lichtBody tr').first();
    await zeile.locator('[data-f=date]').fill('2026-08-28');
    await zeile.locator('[data-f=start]').fill('23:30');
    await zeile.locator('[data-f=end]').fill('01:00');
    await zeile.locator('[data-f=note]').fill('Hauptbühne');

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    const gespeichert = bar.lies().lichteffekte;
    expect(gespeichert).toHaveLength(1);
    expect(gespeichert[0].start).toBe('23:30');
    expect(gespeichert[0].end).toBe('01:00');
    expect(gespeichert[0].note).toBe('Hauptbühne');
  });

  test('eine Zeile ohne Endzeit wird angemeckert', async ({ page, bar }) => {
    // Sie wird auf der Anzeige nicht gezeigt - das darf nicht erst abends
    // auffallen.
    await reiter(page, bar, { lichteffekte: [] });
    await page.getByRole('button', { name: '+ Zeitraum hinzufügen' }).click();

    const zeile = page.locator('#lichtBody tr').first();
    await zeile.locator('[data-f=date]').fill('2026-08-28');
    await zeile.locator('[data-f=start]').fill('23:30');
    await expect(zeile).toHaveClass(/ohneEnde/);

    await zeile.locator('[data-f=end]').fill('01:00');
    await expect(zeile).not.toHaveClass(/ohneEnde/);
  });

  test('vergangene Zeitraeume lassen sich wegraeumen', async ({ page, bar }) => {
    await reiter(page, bar, {
      lichteffekte: [
        { id: 'alt', date: '2020-01-01', start: '22:00', end: '23:00', note: 'lange her' },
        { id: 'neu', date: '2099-01-01', start: '22:00', end: '23:00', note: 'kommt noch' }
      ]
    });
    await expect(page.locator('#lichtBody tr')).toHaveCount(2);

    await page.getByRole('button', { name: 'Vergangene löschen' }).nth(1).click();
    await expect(page.locator('#lichtBody tr')).toHaveCount(1);
    await expect(page.locator('#lichtBody tr [data-f=note]')).toHaveValue('kommt noch');
  });

  test('der Doku-Knopf fuehrt zur hinterlegten Adresse', async ({ page, bar, context }) => {
    await reiter(page, bar);
    await expect(page.locator('#s_lichtDoku')).toHaveValue(/docs\.google\.com/);

    // Im Browser geht die Doku in einem neuen Tab auf
    const neuerTab = context.waitForEvent('page');
    await page.getByRole('button', { name: 'Doku öffnen…' }).click();
    const doku = await neuerTab;
    expect(doku.url()).toContain('docs.google.com');
    await doku.close();
  });

  test('ohne hinterlegte Adresse passiert nichts Stilles', async ({ page, bar }) => {
    await reiter(page, bar, { settings: { lichtDoku: '' } });
    await page.getByRole('button', { name: 'Doku öffnen…' }).click();
    await expect(page.locator('#toast')).toContainText('Keine Adresse hinterlegt');
  });
});
