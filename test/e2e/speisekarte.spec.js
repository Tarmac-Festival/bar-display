'use strict';

// Getränke und Speisen auf derselben Seite: eine Gruppe kompakt wie eine
// Getränkekarte, die nächste mit Foto und Beschreibung wie an einem Essenstand.

const { test, expect, beispiel, bildGeladen } = require('./hilfe/bar');

function karte(bar, zusatz) {
  bar.datei('photo', 'burger.png');
  bar.datei('photo', 'chili.png');
  return bar.konfig(beispiel(Object.assign({
    settings: { pricesEvery: 1, pricesDuration: 200, timetableEvery: 0, lichtEvery: 0 },
    timetable: [],
    prices: [
      { id: 'g1', category: 'Bier', stil: 'liste', items: [
        { id: 'i1', name: 'Pils', size: '0,5 l', price: '4,00' },
        { id: 'i2', name: 'Radler', size: '0,5 l', price: '4,00' } ] },
      { id: 'g2', category: 'Vom Grill', stil: 'karten', items: [
        { id: 'i3', name: 'Halloumi-Burger', size: '', price: '8,50', photo: 'burger.png',
          text: 'Gegrillter Halloumi, Rucola, hausgemachte Aioli' } ],
        spezial: { enabled: true, label: 'Tagesgericht', name: 'Chili sin Carne',
                   size: 'Schale', price: '7,50', photo: 'chili.png',
                   text: 'Mit Sauerrahm und Fladenbrot' } }
    ]
  }, zusatz || {})));
}

test.describe('Zwei Darstellungen auf einer Seite', () => {
  test('kompakt bleibt kompakt, mit Foto bekommt Foto', async ({ page, bar }) => {
    karte(bar);
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.slide[data-kind=prices]')).toBeVisible();

    const bier = page.locator('.priceCat').filter({ hasText: 'BIER' });
    await expect(bier).toHaveClass(/liste/);
    await expect(bier.locator('.priceItem')).toHaveCount(2);
    await expect(bier.locator('.essKarte')).toHaveCount(0);

    const grill = page.locator('.priceCat').filter({ hasText: 'VOM GRILL' });
    await expect(grill).toHaveClass(/karten/);
    await expect(grill.locator('.essKarte')).toHaveCount(1);
    await expect(grill.locator('.priceItem')).toHaveCount(0);
  });

  test('Foto, Beschreibung und Preis stehen beim Gericht', async ({ page, bar }) => {
    karte(bar);
    await page.goto(bar.adresse + '/');

    const gericht = page.locator('.essKarte').first();
    await expect(gericht.locator('.essName')).toHaveText('Halloumi-Burger');
    await expect(gericht.locator('.essPreis')).toHaveText('8,50');
    await expect(gericht.locator('.essBeschreibung')).toContainText('Rucola');

    const bild = gericht.locator('.essFoto img');
    await expect(bild).toHaveAttribute('src', '/photos/burger.png');
    await bildGeladen(bild);
  });

  test('das Foto steht links neben dem Text', async ({ page, bar }) => {
    karte(bar);
    await page.goto(bar.adresse + '/');
    await bildGeladen(page.locator('.essKarte .essFoto img').first());

    const lage = await page.locator('.essKarte').first().evaluate((el) => {
      const f = el.querySelector('.essFoto').getBoundingClientRect();
      const t = el.querySelector('.essText').getBoundingClientRect();
      return { fotoLinks: f.right <= t.left + 1, quadratisch: Math.abs(f.width - f.height) < 2,
               breite: f.width };
    });
    expect(lage.fotoLinks, 'das Foto steht links vom Text').toBe(true);
    expect(lage.quadratisch, 'das Foto ist quadratisch beschnitten').toBe(true);
    expect(lage.breite).toBeGreaterThan(20);
  });

  test('ohne Beschreibung bleibt die Zeile schlicht', async ({ page, bar }) => {
    karte(bar, {
      prices: [{ id: 'g', category: 'Vom Grill', stil: 'karten',
                 items: [{ id: 'i', name: 'Pommes', size: 'groß', price: '4,50' }] }]
    });
    await page.goto(bar.adresse + '/');

    await expect(page.locator('.essKarte')).toHaveCount(1);
    await expect(page.locator('.essBeschreibung')).toHaveCount(0);
    await expect(page.locator('.essFoto')).toHaveCount(0);
    await expect(page.locator('.essName')).toHaveText('Pommes');
  });
});

test.describe('Hervorgehobenes je Gruppe', () => {
  test('jede Gruppe kann ihr eigenes haben', async ({ page, bar }) => {
    karte(bar, {
      prices: [
        { id: 'g1', category: 'Bier', stil: 'liste',
          items: [{ id: 'i1', name: 'Pils', size: '0,5 l', price: '4,00' }],
          spezial: { enabled: true, label: 'Shot des Abends', name: 'Kümmerling',
                     size: '2 cl', price: '2,00', text: 'Kalt. Sehr kalt.' } },
        { id: 'g2', category: 'Vom Grill', stil: 'karten',
          items: [{ id: 'i2', name: 'Pommes', price: '4,50' }],
          spezial: { enabled: true, label: 'Tagesgericht', name: 'Chili sin Carne',
                     price: '7,50', photo: 'chili.png' } }
      ]
    });
    await page.goto(bar.adresse + '/');

    await expect(page.locator('.gruppenSpezial')).toHaveCount(2);
    const bier = page.locator('.priceCat').filter({ hasText: 'BIER' }).locator('.gruppenSpezial');
    // text-transform macht Grossbuchstaben nur in der Darstellung
    await expect(bier.locator('.gsTag')).toHaveText('Shot des Abends');
    await expect(bier).toContainText('Kümmerling');

    const grill = page.locator('.priceCat').filter({ hasText: 'VOM GRILL' }).locator('.gruppenSpezial');
    await expect(grill.locator('.gsTag')).toHaveText('Tagesgericht');
    await bildGeladen(grill.locator('.essFoto img'));
  });

  test('es steht in seiner Gruppe, nicht am Seitenende', async ({ page, bar }) => {
    karte(bar);
    await page.goto(bar.adresse + '/');

    const drin = await page.locator('.gruppenSpezial').first()
      .evaluate(el => !!el.closest('.priceCat'));
    expect(drin, 'das Hervorgehobene steht in seiner Gruppe').toBe(true);
  });

  test('abgeschaltet erscheint es nicht', async ({ page, bar }) => {
    karte(bar, {
      prices: [{ id: 'g', category: 'Vom Grill', stil: 'karten',
                 items: [{ id: 'i', name: 'Pommes', price: '4,50' }],
                 spezial: { enabled: false, label: 'Tagesgericht', name: 'Chili' } }]
    });
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.gruppenSpezial')).toHaveCount(0);
  });

  test('eine Gruppe nur mit Tagesgericht erscheint trotzdem', async ({ page, bar }) => {
    // Am Essenstand steht manchmal nur das Tagesgericht dran
    karte(bar, {
      prices: [{ id: 'g', category: 'Heute', stil: 'karten', items: [],
                 spezial: { enabled: true, label: 'Tagesgericht', name: 'Chili sin Carne',
                            price: '7,50' } }]
    });
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.priceCat')).toHaveCount(1);
    await expect(page.locator('.gruppenSpezial')).toContainText('Chili sin Carne');
  });

  test('der seitenweite Spezialshot bleibt davon unberuehrt', async ({ page, bar }) => {
    karte(bar, {
      special: { enabled: true, label: 'SPEZIALSHOT', name: 'Feigling', size: '2 cl',
                 price: '2,00', text: '' }
    });
    await page.goto(bar.adresse + '/');

    // Beide gleichzeitig: einer in der Gruppe, einer ueber die volle Breite
    await expect(page.locator('.gruppenSpezial')).toHaveCount(1);
    await expect(page.locator('.special')).toHaveCount(1);
    await expect(page.locator('.special')).toContainText('Feigling');
  });
});

test.describe('Eintragen auf der Bedienseite', () => {
  async function reiter(page, bar) {
    karte(bar);
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Karte', exact: true }).click();
  }

  test('jede Gruppe hat ihren eigenen Umschalter', async ({ page, bar }) => {
    await reiter(page, bar);

    const wahl = page.locator('.catCard .catStil');
    await expect(wahl).toHaveCount(2);
    await expect(wahl.nth(0)).toHaveValue('liste');
    await expect(wahl.nth(1)).toHaveValue('karten');
  });

  test('umschalten blendet Foto und Beschreibung ein', async ({ page, bar }) => {
    await reiter(page, bar);

    // Nur die Positionen, nicht das Hervorgehobene darunter - das hat seine
    // eigene Fotozelle, auch im kompakten Stil.
    const bier = page.locator('.catCard').first();
    const zeilen = bier.locator('[data-items] .itemRow');
    await expect(zeilen.locator('.iText')).toHaveCount(0);
    await expect(zeilen.locator('.fotoZelle')).toHaveCount(0);

    await bier.locator('.catStil').selectOption('karten');
    await expect(zeilen.first()).toHaveClass(/mitFoto/);
    await expect(zeilen.first().locator('.iText')).toBeVisible();
    await expect(zeilen.first().locator('.fotoZelle')).toBeVisible();

    // Und der Knopf heisst dann auch anders
    await expect(bier.getByRole('button', { name: '+ Gericht' })).toBeVisible();
  });

  test('Beschreibung und Umschalter landen in der Konfiguration', async ({ page, bar }) => {
    await reiter(page, bar);

    const bier = page.locator('.catCard').first();
    await bier.locator('.catStil').selectOption('karten');
    await bier.locator('[data-items] .itemRow').first().locator('.iText')
      .fill('Frisch gezapft, aus der Region');

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    const g = bar.lies().prices[0];
    expect(g.stil).toBe('karten');
    expect(g.items[0].text).toBe('Frisch gezapft, aus der Region');
  });

  test('das Hervorgehobene steht bei jeder Gruppe', async ({ page, bar }) => {
    await reiter(page, bar);
    await expect(page.locator('.gruppenSpezialBox')).toHaveCount(2);

    const bier = page.locator('.catCard').first();
    await bier.locator('.gruppenSpezialBox input[type=checkbox]').check();
    await bier.locator('.gruppenSpezialBox [data-f=label]').fill('Shot des Abends');
    await bier.locator('.gruppenSpezialBox [data-f=name]').fill('Kümmerling');
    await bier.locator('.gruppenSpezialBox [data-f=price]').fill('2,00');

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    const sp = bar.lies().prices[0].spezial;
    expect(sp.enabled).toBe(true);
    expect(sp.label).toBe('Shot des Abends');
    expect(sp.name).toBe('Kümmerling');
  });

  test('das Foto einer Position ist zu sehen', async ({ page, bar }) => {
    await reiter(page, bar);

    const grill = page.locator('.catCard').nth(1);
    const bild = grill.locator('[data-items] .itemRow .photoBox img').first();
    await expect(bild).toHaveAttribute('src', '/photos/burger.png');
    await bildGeladen(bild);
  });
});

test.describe('Eine einzige Gruppe', () => {
  // Feste Fenstergroesse: die Schwellen unten sind Pixel, und die haengen sonst
  // von der Voreinstellung des Testlaufs ab.
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('nimmt die volle Breite und wird groesser', async ({ page, bar }) => {
    karte(bar, {
      prices: [{ id: 'g', category: 'Vom Grill', stil: 'karten', items: [
        { id: 'i', name: 'Halloumi-Burger', price: '8,50', photo: 'burger.png',
          text: 'Gegrillter Halloumi, Rucola, hausgemachte Aioli' } ] }]
    });
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.priceGrid')).toHaveClass(/nurEine/);

    const m = await page.evaluate(() => {
      const g = document.querySelector('.priceGrid').getBoundingClientRect();
      const c = document.querySelector('.priceCat').getBoundingClientRect();
      const f = document.querySelector('.essFoto').getBoundingClientRect();
      const n = document.querySelector('.essKopf');
      return { anteil: c.width / g.width,
               foto: f.width,
               schrift: parseFloat(getComputedStyle(n).fontSize) };
    });
    expect(m.anteil).toBeGreaterThan(0.99);
    // Deutlich groesser als im mehrspaltigen Fall - sonst steht sie verloren
    // in der Mitte, denn fitToBox() verkleinert nur, es vergroessert nie.
    expect(m.foto).toBeGreaterThan(90);
    expect(m.schrift).toBeGreaterThan(40);
  });

  test('bei zwei Gruppen bleibt es bei der Spaltenbreite', async ({ page, bar }) => {
    karte(bar);
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.priceGrid')).not.toHaveClass(/nurEine/);

    const m = await page.evaluate(() => {
      const g = document.querySelector('.priceGrid').getBoundingClientRect();
      const c = document.querySelector('.priceCat').getBoundingClientRect();
      return { anteil: c.width / g.width,
               foto: document.querySelector('.essFoto').getBoundingClientRect().width };
    });
    expect(m.anteil).toBeLessThan(0.6);
    expect(m.foto).toBeLessThan(90);
  });

  test('eine Gruppe mit Punktlinie wird ebenfalls gross', async ({ page, bar }) => {
    karte(bar, {
      prices: [{ id: 'g', category: 'Bier', stil: 'liste', items: [
        { id: 'a', name: 'Pils', size: '0,5 l', price: '4,00' },
        { id: 'b', name: 'Radler', size: '0,5 l', price: '4,00' } ] }]
    });
    await page.goto(bar.adresse + '/');

    const schrift = await page.locator('.priceItem').first()
      .evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(schrift).toBeGreaterThan(40);
  });
});
