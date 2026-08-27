'use strict';

// Die Karte auf mehrere Seiten verteilen.
//
// Eine lange Karte passt zwar immer auf den Bildschirm - fitToBox() verkleinert
// sie, bis sie passt -, aber irgendwann liest sie aus drei Metern niemand mehr.
// Optional laeuft sie deshalb als mehrere Seiten direkt hintereinander.

const { test, expect, beispiel, schleifeMitschreiben } = require('./hilfe/bar');

function gruppen(n) {
  const namen = ['Bier', 'Cocktails', 'Alkoholfrei', 'Shots', 'Vom Grill', 'Kaffee'];
  return namen.slice(0, n).map((name, i) => ({
    id: 'g' + i, category: name,
    items: [{ id: 'i' + i, name: name + ' eins', price: '4,00 €' }]
  }));
}

function programm(zusatz) {
  return beispiel(Object.assign({
    settings: {
      pricesEvery: 1, pricesDuration: 3, timetableEvery: 0, lichtEvery: 0,
      pricesTitle: 'GETRÄNKE'
    },
    prices: gruppen(6),
    special: { enabled: false }
  }, zusatz || {}));
}

test.describe('Auf der Anzeige', () => {
  test('ohne Einstellung bleibt alles auf einer Seite', async ({ page, bar }) => {
    bar.konfig(programm());
    await page.goto(bar.adresse + '/');
    await page.waitForSelector('.slide[data-kind=prices]');

    await expect(page.locator('.priceCat')).toHaveCount(6);
    await expect(page.locator('.seitenMarke')).toHaveCount(0);
  });

  test('mit zwei Gruppen je Seite werden es drei Seiten', async ({ page, bar }) => {
    bar.konfig(programm({ settings: { pricesProSeite: 2 } }));
    await page.goto(bar.adresse + '/');
    await page.waitForSelector('.slide[data-kind=prices]');

    await expect(page.locator('.priceCat')).toHaveCount(2);
    await expect(page.locator('.seitenMarke')).toHaveText('1 / 3');
  });

  test('die Seiten laufen direkt nacheinander', async ({ page, bar }) => {
    // Und zwar am Stueck: die Karte kommt gleich oft wie vorher, nur laenger.
    bar.konfig(programm({ settings: { pricesProSeite: 2, pricesDuration: 3 } }));
    const spur = schleifeMitschreiben(page);
    await page.goto(bar.adresse + '/');
    await page.waitForSelector('.slide[data-kind=prices]');
    await page.waitForTimeout(9000);

    // Drei Seiten am Stueck: zwischen der ersten und der dritten Kartenseite
    // darf nichts anderes stehen.
    const erste = spur.indexOf('prices');
    expect(erste, 'die Karte ist gelaufen').toBeGreaterThanOrEqual(0);
    expect(spur.slice(erste, erste + 3), 'drei Seiten ohne Unterbrechung')
      .toEqual(['prices', 'prices', 'prices']);
  });

  test('jede Gruppe kommt genau einmal vor', async ({ page, bar }) => {
    bar.konfig(programm({ settings: { pricesProSeite: 2 } }));
    await page.goto(bar.adresse + '/');
    await page.waitForSelector('.slide[data-kind=prices]');

    const gesehen = [];
    for (let seite = 0; seite < 3; seite++) {
      const namen = await page.evaluate((nr) => {
        const el = document.querySelector('.slide[data-kind=prices]');
        el.innerHTML = renderSlide('prices', nr);
        return [...el.querySelectorAll('.priceCat h2')].map(h => h.textContent);
      }, seite);
      gesehen.push(...namen);
    }
    expect(gesehen).toEqual(['Bier', 'Cocktails', 'Alkoholfrei', 'Shots',
                             'Vom Grill', 'Kaffee']);
  });

  test('das Hervorgehobene steht nur unter der letzten Seite',
    async ({ page, bar }) => {
      // Sonst stuende derselbe Spezialshot dreimal da.
      bar.konfig(programm({
        settings: { pricesProSeite: 2, priceNote: 'Alle Preise in Euro' },
        special: { enabled: true, name: 'Feigling', price: '2,00 €', label: 'SHOT' }
      }));
      await page.goto(bar.adresse + '/');
      await page.waitForSelector('.slide[data-kind=prices]');

      const proSeite = await page.evaluate(() => {
        const el = document.querySelector('.slide[data-kind=prices]');
        const raus = [];
        for (let nr = 0; nr < 3; nr++) {
          el.innerHTML = renderSlide('prices', nr);
          raus.push({
            spezial: !!el.querySelector('.specialBar, .special'),
            hinweis: !!el.querySelector('.priceNote')
          });
        }
        return raus;
      });
      expect(proSeite.map(x => x.spezial)).toEqual([false, false, true]);
      expect(proSeite.map(x => x.hinweis)).toEqual([false, false, true]);
    });

  test('eine kurze Karte bleibt trotz Einstellung einseitig',
    async ({ page, bar }) => {
      // Zwei Gruppen bei zwei je Seite - das waere eine Seite, kein Grund fuer
      // eine Seitenzahl.
      bar.konfig(programm({ settings: { pricesProSeite: 2 }, prices: gruppen(2) }));
      await page.goto(bar.adresse + '/');
      await page.waitForSelector('.slide[data-kind=prices]');

      await expect(page.locator('.priceCat')).toHaveCount(2);
      await expect(page.locator('.seitenMarke')).toHaveCount(0);
    });
});

test.describe('Auf der Bedienseite', () => {
  test('die Gruppen pro Seite lassen sich einstellen', async ({ page, bar }) => {
    bar.konfig(programm());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Karte', exact: true }).click();

    await page.locator('#s_pricesProSeite').fill('3');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    expect(bar.lies().settings.pricesProSeite).toBe(3);
  });
});
