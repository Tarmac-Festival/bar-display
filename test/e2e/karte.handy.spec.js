'use strict';

// Die Karte am Handy.
//
// Gemeldet: die Zeilen sind gequetscht und manches laesst sich nicht treffen.
// Beides stimmte. Nebeneinander blieben fuer den Namen keine vierzig Pixel
// uebrig, und die Knoepfe am Foto standen neben dem Bild statt darauf.

const { test, expect, beispiel } = require('./hilfe/bar');

function speisen(bar) {
  bar.datei('photo', 'a.png');
  bar.datei('photo', 'b.png');
  return beispiel({
    prices: [{
      id: 'g1', category: 'Vom Grill', stil: 'karten',
      items: [
        { id: 'p1', name: 'Daal', size: '', price: '5,00 €',
          text: 'Leckeres indisches Daal', photo: 'a.png' },
        { id: 'p2', name: 'Pad Thai', size: '', price: '7,50 €',
          text: 'Reisnudeln', photo: 'b.png' }
      ]
    }]
  });
}

async function karteOeffnen(page, bar) {
  bar.konfig(speisen(bar));
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Karte', exact: true }).click();
  await page.waitForSelector('.itemRow');
}

test('der Name bekommt genug Platz', async ({ page, bar }) => {
  // Vorher: 37 Pixel. Das Wichtigste an der Zeile war das Schmalste daran.
  await karteOeffnen(page, bar);
  const breiten = await page.evaluate(() =>
    [...document.querySelectorAll('.itemRow .iName')]
      .map(el => Math.round(el.getBoundingClientRect().width)));

  expect(breiten.length).toBeGreaterThan(0);
  for (const b of breiten) expect(b).toBeGreaterThan(150);
});

test('die Zeile passt ins Fenster', async ({ page, bar }) => {
  await karteOeffnen(page, bar);
  const breit = await page.evaluate(() => ({
    seite: document.documentElement.scrollWidth,
    fenster: window.innerWidth
  }));
  expect(breit.seite, 'kein Querscrollen').toBeLessThanOrEqual(breit.fenster + 1);
});

test('Groesse und Preis stehen nebeneinander, nicht untereinander',
  async ({ page, bar }) => {
    await karteOeffnen(page, bar);
    const lage = await page.locator('.itemRow').first().evaluate((r) => {
      const a = r.querySelector('.iSize').getBoundingClientRect();
      const b = r.querySelector('.iPrice').getBoundingClientRect();
      return { nebeneinander: a.right <= b.left + 1,
               gleicheZeile: Math.abs(a.top - b.top) < 2 };
    });
    expect(lage).toEqual({ nebeneinander: true, gleicheZeile: true });
  });

test('die Knoepfe sitzen auf dem Foto, nicht daneben', async ({ page, bar }) => {
  // Die Bildhuelle war ein <span> ohne display:block. Hoehe und Breite griffen
  // damit nicht, das Bild rutschte in seiner Zeilenschachtel nach unten - und
  // Loeschkreuz und Ausschnittknopf blieben oben stehen.
  await karteOeffnen(page, bar);

  const lage = await page.locator('.itemRow .fotoZelle').first().evaluate((z) => {
    const r = (w) => z.querySelector(w).getBoundingClientRect();
    const bild = r('img'), huelle = r('.photoBox');
    const auf = (b) => b.left < bild.right && b.right > bild.left &&
                       b.top < bild.bottom && b.bottom > bild.top;
    return {
      huelleAufBild: Math.abs(huelle.height - bild.height) < 4,
      loeschenAufBild: auf(r('.photoDel')),
      ausschnittAufBild: auf(r('.photoCrop'))
    };
  });
  expect(lage).toEqual({ huelleAufBild: true, loeschenAufBild: true,
                         ausschnittAufBild: true });
});

test('die Knoepfe am Foto sind gross genug fuer einen Daumen',
  async ({ page, bar }) => {
    await karteOeffnen(page, bar);
    const masse = await page.locator('.itemRow .fotoZelle').first().evaluate((z) => {
      const m = (w) => {
        const b = z.querySelector(w).getBoundingClientRect();
        return Math.min(b.width, b.height);
      };
      return { loeschen: m('.photoDel'), ausschnitt: m('.photoCrop') };
    });
    expect(masse.loeschen).toBeGreaterThanOrEqual(26);
    expect(masse.ausschnitt).toBeGreaterThanOrEqual(24);
  });

test('die Ausschnitt-Vorschau hat die Form der Karte', async ({ page, bar }) => {
  // Auf der Karte steht das Foto als abgerundetes Quadrat. Die Vorschau zeigte
  // die organische Form der Act-Fotos - und behauptete dabei, so sehe es
  // spaeter auf der Anzeige aus.
  await karteOeffnen(page, bar);
  await page.locator('.itemRow .photoCrop').first().click();
  await expect(page.locator('.cropBuehne')).toBeVisible();

  const form = await page.locator('.cropBuehne').evaluate(el => ({
    karte: el.classList.contains('karte'),
    ecken: getComputedStyle(el).borderRadius
  }));
  expect(form.karte).toBe(true);
  expect(form.ecken, 'kein Blasenrand mit vier verschiedenen Prozentwerten')
    .not.toContain('%');
});

test('beim Act bleibt die Vorschau die organische Form', async ({ page, bar }) => {
  // Gegenprobe: dort steht auf der Anzeige tatsaechlich eine Blase.
  bar.datei('photo', 'act.png');
  bar.konfig(beispiel({
    timetable: [{ id: 'a1', date: '2026-09-11', start: '21:00', end: '22:30',
                  act: 'Elyxtra', photo: 'act.png' }]
  }));
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Timetable', exact: true }).click();
  await page.locator('.photoCrop').first().click();

  const form = await page.locator('.cropBuehne').evaluate(el => ({
    karte: el.classList.contains('karte'),
    ecken: getComputedStyle(el).borderRadius
  }));
  expect(form.karte).toBe(false);
  expect(form.ecken).toContain('%');
});
