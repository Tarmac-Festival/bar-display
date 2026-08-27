'use strict';

// Probezeit: die Anzeige tut so, als wäre es eine andere Zeit — damit sich der
// Timetable für 23 Uhr ansehen lässt, ohne bis 23 Uhr zu warten.
//
// Die Systemuhr wird dabei ausdrücklich nicht angefasst. Das ist der Punkt,
// den diese Tests festhalten.

const { test, expect, beispiel } = require('./hilfe/bar');

const NACHMITTAG = new Date(2026, 7, 28, 14, 0, 0).getTime();
const ACHT_STUNDEN = 8 * 3600 * 1000;

function programm(zusatz) {
  return beispiel(Object.assign({
    settings: { timetableEvery: 1, timetableDuration: 200, pricesEvery: 0, lichtEvery: 0 },
    timetable: [{ date: '2026-08-28', start: '21:00', end: '23:00', act: 'Nachtflug' }],
    prices: []
  }, zusatz || {}));
}

test.describe('Auf der Anzeige', () => {
  test('ohne Probezeit gilt die echte Uhr', async ({ page, bar }) => {
    bar.konfig(programm());
    await page.clock.install({ time: NACHMITTAG });
    await page.goto(bar.adresse + '/');

    await expect(page.locator('.slideFoot')).toContainText('14:00');
    // Um 14 Uhr laeuft kein Act
    await expect(page.locator('.ttNow')).toHaveCount(0);
    await expect(page.locator('.probezeit')).toHaveCount(0);
  });

  test('mit Probezeit rechnet die Anzeige mit der verschobenen Zeit',
    async ({ page, bar }) => {
      bar.konfig(programm({ settings: { zeitVersatz: ACHT_STUNDEN } }));
      await page.clock.install({ time: NACHMITTAG });
      await page.goto(bar.adresse + '/');

      await expect(page.locator('.slideFoot')).toContainText('22:00');
      // Um 22 Uhr laeuft Nachtflug - genau das will man beim Einrichten sehen
      await expect(page.locator('.ttNow')).toContainText('Nachtflug');
    });

  test('die Systemuhr bleibt unangetastet', async ({ page, bar }) => {
    bar.konfig(programm({ settings: { zeitVersatz: ACHT_STUNDEN } }));
    await page.clock.install({ time: NACHMITTAG });
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.slideFoot')).toContainText('22:00');

    const echt = await page.evaluate(() => new Date().getHours());
    expect(echt, 'die Uhr des Rechners zeigt weiter 14 Uhr').toBe(14);
  });

  test('eine laufende Probezeit steht auf der Anzeige', async ({ page, bar }) => {
    // Sonst laeuft die Bar den ganzen Abend in einer Zeit, die jemand vor drei
    // Tagen zum Ausprobieren eingestellt hat.
    bar.konfig(programm({ settings: { zeitVersatz: ACHT_STUNDEN } }));
    await page.clock.install({ time: NACHMITTAG });
    await page.goto(bar.adresse + '/');

    const marke = page.locator('.probezeit');
    await expect(marke).toBeVisible();
    await expect(marke).toHaveText('Probezeit');
  });

  test('ein kleiner Rest gilt nicht als Probezeit', async ({ page, bar }) => {
    // Unter einer Minute ist Rundung, keine Probe
    bar.konfig(programm({ settings: { zeitVersatz: 20000 } }));
    await page.clock.install({ time: NACHMITTAG });
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.probezeit')).toHaveCount(0);
  });

  test('das Aufheben wirkt sofort', async ({ page, bar }) => {
    bar.konfig(programm({ settings: { zeitVersatz: ACHT_STUNDEN } }));
    await page.clock.install({ time: NACHMITTAG });
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.slideFoot')).toContainText('22:00');

    bar.konfig({ settings: { zeitVersatz: 0 } });
    await expect(page.locator('.slideFoot')).toContainText('14:00');
    await expect(page.locator('.probezeit')).toHaveCount(0);
  });
});

test.describe('Auf der Bedienseite', () => {
  test('das Feld zeigt die echte Zeit, solange keine Probe laeuft',
    async ({ page, bar }) => {
      bar.konfig(programm());
      await page.clock.install({ time: NACHMITTAG });
      await page.goto(bar.adresse + '/einstellungen');
      await page.getByRole('button', { name: 'System', exact: true }).click();

      await expect(page.locator('#s_probezeit')).toHaveValue('2026-08-28T14:00');
      await expect(page.locator('#probeStand')).toBeHidden();
    });

  test('eine andere Zeit eintragen ergibt den passenden Versatz',
    async ({ page, bar }) => {
      bar.konfig(programm());
      await page.clock.install({ time: NACHMITTAG });
      await page.goto(bar.adresse + '/einstellungen');
      await page.getByRole('button', { name: 'System', exact: true }).click();

      await page.locator('#s_probezeit').fill('2026-08-28T22:00');
      await expect(page.locator('#probeStand')).toBeVisible();
      await expect(page.locator('#probeStand')).toContainText('8 h 0 min vor');

      await page.getByRole('button', { name: 'Speichern' }).click();
      await expect(page.locator('#dirty')).toBeHidden();

      // Der Versatz wird im Moment der Eingabe berechnet, gegen eine laufende
      // Uhr - auf die Sekunde genau kann er also gar nicht sein.
      const gespeichert = bar.lies().settings.zeitVersatz;
      expect(Math.abs(gespeichert - ACHT_STUNDEN)).toBeLessThan(5000);
    });

  test('der Knopf setzt zurueck auf jetzt', async ({ page, bar }) => {
    bar.konfig(programm({ settings: { zeitVersatz: ACHT_STUNDEN } }));
    await page.clock.install({ time: NACHMITTAG });
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'System', exact: true }).click();

    await expect(page.locator('#probeStand')).toBeVisible();
    await page.getByRole('button', { name: 'Auf jetzt' }).click();

    await expect(page.locator('#probeStand')).toBeHidden();
    await expect(page.locator('#s_probezeit')).toHaveValue('2026-08-28T14:00');

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();
    expect(bar.lies().settings.zeitVersatz).toBe(0);
  });

  test('auch zurueck in die Vergangenheit', async ({ page, bar }) => {
    bar.konfig(programm());
    await page.clock.install({ time: NACHMITTAG });
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'System', exact: true }).click();

    await page.locator('#s_probezeit').fill('2026-08-28T12:00');
    await expect(page.locator('#probeStand')).toContainText('2 h 0 min zurück');
  });
});
