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
    // Lange Standzeit. Sonst blaettert die Schleife waehrend des Messens weiter,
    // und eine Erwartung, die auf "nichts da" wartet, geht auch dann auf, wenn
    // die Seite nur weitergeschaltet hat. Tests, die die Schleife selbst
    // beobachten wollen, geben eigene settings mit - die ersetzen diese hier.
    settings: { timetableDuration: 600, pricesDuration: 600 },
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
  test('die Lichtphase steht in einer eigenen Spalte, nicht in einer eigenen Zeile',
    async ({ page, bar }) => {
      bar.konfig(programm());
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');

      // Nur die beiden Acts - die Lichtphase reisst die Liste nicht auseinander
      await expect(page.locator('.ttRow')).toHaveCount(2);
      await expect(page.locator('.ttList')).toHaveClass(/mitLicht/);

      // Die Vorband spielt 21-23 Uhr, das Licht faengt erst 23:30 an
      const vorband = page.locator('.ttRow').filter({ hasText: 'Vorband' });
      await expect(vorband).not.toHaveClass(/hatLicht/);
      await expect(vorband.locator('.lichtBalken')).toHaveCount(0);

      // Nachtflug spielt 23-01:30 und wird getroffen
      const nachtflug = page.locator('.ttRow').filter({ hasText: 'Nachtflug' });
      await expect(nachtflug).toHaveClass(/hatLicht/);
      await expect(nachtflug.locator('.lichtBalken')).toHaveCount(1);
      // Beschriftet mit der eigenen Zeitspanne, nicht mit der des Acts
      await expect(nachtflug.locator('.lmZeit')).toHaveText('23:30–01:00');

      // Die Bemerkung steht hier nicht: sie musste sich in denselben Platz
      // quetschen und drueckte die Uhrzeit weg. Zu lesen ist sie in der
      // Wochenenduebersicht und in der Warnung, solange die Phase laeuft.
      await expect(nachtflug.locator('.lmNote')).toHaveCount(0);
      await expect(nachtflug).not.toContainText('Hauptbühne');
    });

  test('die Spalte steht rechts und traegt oben das Zeichen als Reiter',
    async ({ page, bar }) => {
      bar.konfig(programm());
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');

      const reiter = page.locator('.klLicht');
      await expect(reiter).toBeVisible();
      await expect(reiter).toContainText('Lichteffekte');
      await expect(reiter.locator('.lichtZeichen img')).toHaveCount(1);

      const lage = await page.evaluate(() => {
        const zeile = document.querySelector('.ttRow.hatLicht');
        const s = (w) => zeile.querySelector(w).getBoundingClientRect();
        const k = document.querySelector('.klLicht').getBoundingClientRect();
        const block = s('.lichtBalken');
        return {
          rechtsVomAct: block.left >= s('.act').right,
          rechtsVomTag: block.left >= s('.day').right,
          // Der Reiter sitzt ueber den Bloecken und ist genau so breit wie sie.
          // Nach seinem Text bemessen stand er links ueber die Spalte hinaus,
          // bis fast an die Tagesangabe.
          kopfUeberBlock: Math.abs(k.right - block.right) < 2 &&
                          Math.abs(k.left - block.left) < 2 && k.bottom <= block.top,
          // und laeuft nicht ueber den Bildrand hinaus
          imBild: k.right <= window.innerWidth
        };
      });

      expect(lage.rechtsVomAct, 'die Spalte steht rechts vom Act').toBe(true);
      expect(lage.rechtsVomTag, 'und rechts vom Tag').toBe(true);
      expect(lage.kopfUeberBlock, 'der Reiter sitzt ueber den Bloecken').toBe(true);
      expect(lage.imBild, 'der Reiter passt ins Bild').toBe(true);
    });

  test('der Reiter passt in die Spalte und deckt nichts zu',
    async ({ page, bar }) => {
      // Nach seinem Text bemessen war er breiter als die Spalte und ragte nach
      // links darueber hinaus - bis fast an die Tagesangabe daneben.
      bar.konfig(programm());
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');
      await page.waitForSelector('.ttRow.hatLicht');

      const lage = await page.evaluate(() => {
        const el = document.querySelector('.klLicht');
        const k = el.getBoundingClientRect();
        const b = document.querySelector('.lichtBalken').getBoundingClientRect();
        const tag = document.querySelector('.ttRow .day').getBoundingClientRect();
        const zeichen = el.querySelector('.lichtZeichen').getBoundingClientRect();
        const wort = el.querySelector('.klWort').getBoundingClientRect();
        return {
          breiter: Math.round(k.width - b.width),
          ueberDenTag: k.left < tag.right,
          sichtbar: el.querySelector('.klWort').textContent,
          // Der Kasten hat eine feste Breite und schneidet ab, was nicht
          // hineinpasst - lautlos. Also nachsehen, ob der Inhalt wirklich
          // hineinpasst, statt nur die Breite des Kastens zu pruefen.
          luftLinks: Math.round(zeichen.left - k.left),
          luftRechts: Math.round(k.right - wort.right)
        };
      });
      expect(lage.breiter, 'nicht breiter als ein Block').toBeLessThanOrEqual(1);
      expect(lage.ueberDenTag, 'und nicht ueber die Tagesangabe').toBe(false);
      expect(lage.sichtbar, 'die Beschriftung steht noch da').toBe('Lichteffekte');
      expect(lage.luftLinks, 'Zeichen und Wort werden nicht abgeschnitten')
        .toBeGreaterThan(3);
      expect(lage.luftRechts, 'auch rechts nicht').toBeGreaterThan(3);
    });

  test('ohne Lichtzeiten gibt es auch keinen Reiter', async ({ page, bar }) => {
    bar.konfig(programm({ lichteffekte: [] }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.klLicht')).toHaveCount(0);
  });

  test('der Block sitzt versetzt - dort, wo die Phase wirklich anfaengt',
    async ({ page, bar }) => {
      bar.konfig(programm());
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');

      // Nachtflug 23:00-01:30, Licht 23:30-01:00: der Block muss auf einem
      // Fuenftel der Spielzeit anfangen und bei vier Fuenfteln aufhoeren.
      // Genau das war der Punkt an der eigenen Spalte - eine eigene Zeile
      // konnte nicht zeigen, dass das Licht mitten im Set beginnt.
      const lage = await page.locator('.ttRow.hatLicht').evaluate((zeile) => {
        const spur = zeile.querySelector('.lichtSpur').getBoundingClientRect();
        const balken = zeile.querySelector('.lichtBalken').getBoundingClientRect();
        return {
          von: (balken.top - spur.top) / spur.height,
          bis: (balken.bottom - spur.top) / spur.height,
          breite: balken.width
        };
      });

      expect(lage.von).toBeGreaterThan(0.12);
      expect(lage.von).toBeLessThan(0.28);
      expect(lage.bis).toBeGreaterThan(0.72);
      expect(lage.bis).toBeLessThan(0.88);
      // Und breit genug, um aus der Entfernung ueberhaupt aufzufallen
      expect(lage.breite).toBeGreaterThan(30);
    });

  test('die Uhrzeit steht im Block', async ({ page, bar }) => {
    bar.konfig(programm());
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const lage = await page.locator('.ttRow.hatLicht').evaluate((zeile) => {
      const m = zeile.querySelector('.lichtMarke').getBoundingClientRect();
      const b = zeile.querySelector('.lichtBalken').getBoundingClientRect();
      return { obenDrin: m.top >= b.top - 2, untenDrin: m.bottom <= b.bottom + 2,
               linksDrin: m.left >= b.left - 2, rechtsDrin: m.right <= b.right + 2 };
    });
    expect(lage).toEqual({ obenDrin: true, untenDrin: true,
                           linksDrin: true, rechtsDrin: true });
  });

  test('auch eine kurze Phase traegt ihre Uhrzeit', async ({ page, bar }) => {
    // Zwanzig Minuten in einem zweistuendigen Set sind rechnerisch ein
    // Sechstel der Zeile - darin steht keine Uhrzeit. Der Block bekommt
    // deshalb eine Mindesthoehe, die den Text traegt und in der Zeile bleibt.
    bar.konfig(programm({
      lichteffekte: [{ id: 'l1', date: '2026-08-28', start: '22:30', end: '22:50', note: '' }]
    }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const lage = await page.locator('.ttRow.hatLicht').evaluate((zeile) => {
      const spur = zeile.querySelector('.lichtSpur').getBoundingClientRect();
      const m = zeile.querySelector('.lichtMarke').getBoundingClientRect();
      const b = zeile.querySelector('.lichtBalken').getBoundingClientRect();
      return { imKasten: m.top >= b.top - 2 && m.bottom <= b.bottom + 2,
               inDerSpur: b.top >= spur.top - 1 && b.bottom <= spur.bottom + 1 };
    });
    expect(lage.imKasten, 'die Uhrzeit passt in den Kasten').toBe(true);
    expect(lage.inDerSpur, 'und der Kasten bleibt in seiner Spur').toBe(true);
  });

  test('die Spur greift nicht in die Nachbarzeile', async ({ page, bar }) => {
    // Sie reicht bis in die Mitte des Abstands, damit die Stuecke einer Phase
    // ueber mehrere Acts aneinanderstossen - aber keinen Millimeter weiter.
    bar.konfig(programm());
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const ueberlappt = await page.evaluate(() => {
      const zeilen = [...document.querySelectorAll('.ttRow')];
      const raus = [];
      zeilen.forEach((z, i) => {
        const spur = z.querySelector('.lichtSpur');
        if (!spur) return;
        const s = spur.getBoundingClientRect();
        zeilen.forEach((andere, j) => {
          if (i === j) return;
          const r = andere.getBoundingClientRect();
          if (s.top < r.bottom - 1 && s.bottom > r.top + 1) raus.push(i + '/' + j);
        });
      });
      return raus;
    });
    expect(ueberlappt).toEqual([]);
  });

  test('der Kasten ist rundum umrandet - offen nur da, wo es weitergeht',
    async ({ page, bar }) => {
      // Eine Phase ueber zwei Acts: oben schliesst der Kasten ab, unten laeuft
      // er weiter - dort darf keine Kante stehen, sonst sieht es aus wie zwei
      // getrennte Phasen.
      bar.konfig(programm({
        lichteffekte: [{ id: 'l1', date: '2026-08-28', start: '22:30',
                         end: '23:45', note: '' }]
      }));
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');
      await expect(page.locator('.ttRow.hatLicht')).toHaveCount(2);

      const kanten = await page.evaluate(() =>
        [...document.querySelectorAll('.lichtBalken')].map((b) => {
          const st = getComputedStyle(b);
          const da = (w) => parseFloat(st['border' + w + 'Width']) > 0;
          return { beginnt: b.classList.contains('beginnt'),
                   endet: b.classList.contains('endet'),
                   oben: da('Top'), unten: da('Bottom'),
                   links: da('Left'), rechts: da('Right') };
        }));

      for (const k of kanten) {
        expect(k.links, 'seitlich immer umrandet').toBe(true);
        expect(k.rechts, 'seitlich immer umrandet').toBe(true);
        expect(k.oben, 'oben zu, wenn die Phase hier anfaengt').toBe(k.beginnt);
        expect(k.unten, 'unten zu, wenn sie hier aufhoert').toBe(k.endet);
      }
      // Genau einmal offen oben und einmal offen unten - die Naht dazwischen
      expect(kanten.filter(k => !k.oben).length).toBe(1);
      expect(kanten.filter(k => !k.unten).length).toBe(1);
    });

  test('die Trennlinie hoert vor der Lichtspalte auf', async ({ page, bar }) => {
    // Quer durch die Spalte geschnitten zerteilte sie die Bahnen.
    bar.konfig(programm());
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const frei = await page.locator('.ttRow.hatLicht').evaluate((zeile) => {
      const linie = getComputedStyle(zeile, '::after');
      const spur = zeile.querySelector('.lichtSpur').getBoundingClientRect();
      const r = zeile.getBoundingClientRect();
      // right ist der Abstand vom rechten Zeilenrand
      const rechts = parseFloat(linie.right) || 0;
      return { linieEndet: r.right - rechts, spurBeginnt: spur.left,
               keinRahmen: getComputedStyle(zeile).borderBottomStyle };
    });
    expect(frei.keinRahmen, 'kein Rahmen quer ueber die Zeile').toBe('none');
    expect(frei.linieEndet, 'die Linie endet vor der Spalte')
      .toBeLessThanOrEqual(frei.spurBeginnt);
  });

  test('ueber zwei Acts ergeben die Stuecke einen durchgehenden Kasten',
    async ({ page, bar }) => {
      // Zwei Kaesten mit einer Luecke dazwischen sehen aus wie zwei Phasen.
      bar.konfig(programm({
        lichteffekte: [{ id: 'l1', date: '2026-08-28', start: '22:30',
                         end: '23:45', note: '' }]
      }));
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');
      await expect(page.locator('.lichtBalken')).toHaveCount(2);

      const naht = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.lichtBalken')]
          .map(el => el.getBoundingClientRect())
          .sort((x, y) => x.top - y.top);
        return Math.round(b[1].top - b[0].bottom);
      });
      expect(naht, 'die Stuecke stossen ohne Luecke aneinander').toBe(0);

      // Und die Uhrzeit steht einmal, in der Mitte des ganzen Kastens
      await expect(page.locator('.lmZeit')).toHaveCount(1);
      const mittig = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.lichtBalken')]
          .map(el => el.getBoundingClientRect())
          .sort((x, y) => x.top - y.top);
        const m = document.querySelector('.lichtMarke').getBoundingClientRect();
        const mitteKasten = (b[0].top + b[1].bottom) / 2;
        const mitteMarke = (m.top + m.bottom) / 2;
        return Math.abs(mitteKasten - mitteMarke);
      });
      expect(mittig, 'die Uhrzeit sitzt in der Mitte des ganzen Kastens')
        .toBeLessThan(12);
    });

  test('die Spalte hat keinen eigenen Hintergrund', async ({ page, bar }) => {
    // Eine Bahn hinter dem Kasten war ein zweiter Farbton neben dem
    // Hintergrund - hell wie dunkel. Farbe bekommt nur, wo Licht ist.
    bar.konfig(programm());
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const grund = await page.locator('.ttRow.hatLicht .lichtSpur').evaluate((el) => {
      const durchsichtig = (f) => f === 'transparent' || f === 'rgba(0, 0, 0, 0)';
      return { eigen: getComputedStyle(el).backgroundColor,
               davor: getComputedStyle(el, '::before').content,
               ok: durchsichtig(getComputedStyle(el).backgroundColor) };
    });
    expect(grund.ok, 'die Spur selbst bleibt durchsichtig: ' + grund.eigen).toBe(true);
    expect(grund.davor, 'und legt auch nichts davor').toBe('none');
  });

  test('ein Untertitel aendert den Massstab der Spalte nicht',
    async ({ page, bar }) => {
      // Die Spur war ein Rasterkind und deckte nur die erste Rasterzeile ab.
      // Eine Zeile mit Zusatz ("DJ-Set") bekam dadurch eine kuerzere Spur als
      // ihre Nachbarn - derselbe Zeitanteil ergab je nach Zeile eine andere
      // Hoehe, und die Spalte log.
      bar.konfig(programm({
        timetable: [
          { date: '2026-08-28', start: '21:00', end: '23:00', act: 'Vorband' },
          { date: '2026-08-28', start: '23:00', end: '01:00', act: 'Nachtflug', info: 'DJ-Set' }
        ],
        lichteffekte: [
          { id: 'l1', date: '2026-08-28', start: '21:00', end: '23:00', note: '' },
          { id: 'l2', date: '2026-08-28', start: '23:00', end: '01:00', note: '' }
        ]
      }));
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');

      const zeilen = await page.evaluate(() =>
        [...document.querySelectorAll('.ttRow')].map((tr) => {
          const r = tr.getBoundingClientRect();
          const s = tr.querySelector('.lichtSpur').getBoundingClientRect();
          return { zusatz: !!tr.querySelector('.info'),
                   fehlt: Math.round(r.height - s.height) };
        }));

      // Die Spur deckt ihre Zeile ab - bis auf die Einrueckung von zweimal
      // 0.3em, damit die Bahnen benachbarter Zeilen sich nicht beruehren.
      // Vorher fehlten in der Zeile mit Zusatz vierzig Prozent.
      expect(zeilen.length).toBe(2);
      expect(zeilen.some(z => z.zusatz), 'eine Zeile hat einen Zusatz').toBe(true);
      for (const z of zeilen) {
        expect(z.fehlt, 'Zeile mit Zusatz: ' + z.zusatz).toBeLessThan(16);
      }
    });

  test('kein Block ragt in die Nachbarzeile', async ({ page, bar }) => {
    // Der eigentliche Fehler: eine Mindesthoehe im CSS schob den Block ueber
    // die Unterkante seiner Zeile hinaus - er stand dann neben dem naechsten
    // Act. Gemessen wurden bis zu vierzehn Pixel daneben.
    bar.konfig(programm({
      lichteffekte: [
        { id: 'l1', date: '2026-08-28', start: '23:30', end: '01:00', note: '' },
        { id: 'l2', date: '2026-08-29', start: '01:15', end: '01:40', note: 'kurz' },
        { id: 'l3', date: '2026-08-29', start: '02:50', end: '03:05', note: 'sehr kurz' }
      ]
    }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');
    await page.waitForSelector('.ttRow.hatLicht');

    const ausreisser = await page.evaluate(() => {
      const raus = [];
      document.querySelectorAll('.ttRow').forEach((zeile) => {
        const spur = zeile.querySelector('.lichtSpur');
        if (!spur) return;
        const s = spur.getBoundingClientRect();
        zeile.querySelectorAll('.lichtBalken').forEach((b) => {
          const r = b.getBoundingClientRect();
          if (r.top < s.top - 1 || r.bottom > s.bottom + 1) {
            raus.push({ oben: Math.round(r.top - s.top),
                        unten: Math.round(r.bottom - s.bottom) });
          }
        });
      });
      return raus;
    });
    expect(ausreisser).toEqual([]);
  });

  test('ueber zwei Acts laeuft der Balken durch', async ({ page, bar }) => {
    bar.konfig(programm({
      lichteffekte: [{ id: 'l1', date: '2026-08-28', start: '22:30', end: '23:45',
                       note: 'Hauptbühne' }]
    }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    // Beide Acts sind betroffen
    await expect(page.locator('.ttRow.hatLicht')).toHaveCount(2);
    // Beschriftet wird nur da, wo die Phase anfaengt
    await expect(page.locator('.lmZeit')).toHaveCount(1);

    const kanten = await page.locator('.ttRow.hatLicht').evaluateAll((zeilen) =>
      zeilen.map((z) => {
        const b = z.querySelector('.lichtBalken');
        return { beginnt: b.classList.contains('beginnt'), endet: b.classList.contains('endet') };
      }));
    expect(kanten[0]).toEqual({ beginnt: true, endet: false });
    expect(kanten[1]).toEqual({ beginnt: false, endet: true });
  });

  test('ohne eingetragene Zeiten gibt es die Spalte gar nicht', async ({ page, bar }) => {
    bar.konfig(programm({ lichteffekte: [] }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    await expect(page.locator('.ttRow')).toHaveCount(2);
    await expect(page.locator('.ttList')).not.toHaveClass(/mitLicht/);
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

    await expect(page.locator('.lichtBalken')).toHaveCount(0);
    await expect(page.locator('.lichtZeichen')).toHaveCount(0);
  });

  test('eine Phase ohne Act daneben faellt nicht unter den Tisch',
    async ({ page, bar }) => {
      bar.konfig(programm({
        lichteffekte: [{ id: 'l1', date: '2026-08-29', start: '02:00', end: '02:30',
                         note: 'Afterhour' }]
      }));
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');

      // Kein Act laeuft um 02:00 - also steht sie unter der Liste
      await expect(page.locator('.lichtBalken')).toHaveCount(0);
      const sonst = page.locator('.lichtSonst');
      await expect(sonst).toBeVisible();
      await expect(sonst).toContainText('02:00–02:30');
      await expect(sonst).toContainText('Afterhour');
    });

  test('waehrend der Lichtphase steht die Warnung ganz oben', async ({ page, bar }) => {
    bar.konfig(programm());
    // 00:15 in der Nacht auf Samstag - mitten in der Phase
    await zeitStellen(page, new Date(2026, 7, 29, 0, 15, 0).getTime());
    await page.goto(bar.adresse + '/');

    const warnung = page.locator('.lichtJetzt');
    await expect(warnung).toBeVisible();
    await expect(warnung).toContainText('Starke Lichteffekte');
    // Ein Zeitpunkt, keine Dauer - und ohne "noch". Beim Act darueber steht
    // "nur noch X min"; zwei Angaben mit demselben Wort direkt uebereinander
    // liest niemand auseinander.
    await expect(warnung).toContainText('endet um 01:00');
    await expect(warnung).not.toContainText('noch');
    await expect(warnung.locator('.lichtZeichen')).toHaveCount(1);

    // Und sie steht nicht noch einmal darunter - dieselbe Angabe zweimal auf
    // dem Schirm verwirrt mehr, als sie hilft.
    await expect(page.locator('.lichtBalken')).toHaveCount(0);
    await expect(page.locator('.lichtSonst')).toHaveCount(0);
    // Auch nicht als Zeichen an der JETZT-Karte: der Balken sagt dasselbe,
    // nur genauer.
    await expect(page.locator('.ttNow .lichtZeichen')).toHaveCount(0);
  });

  test('ohne laufende Phase bleibt das Zeichen an der JETZT-Karte',
    async ({ page, bar }) => {
      // Gegenprobe: es sagt "in diesem Set kommt Licht vor" - das faellt nur
      // weg, solange der Balken es ohnehin lauter sagt.
      bar.konfig(programm({
        timetable: [{ id: 'a1', date: '2026-08-28', start: '23:00', end: '01:30',
                      act: 'Nachtflug' }],
        lichteffekte: [{ id: 'l1', date: '2026-08-29', start: '01:00',
                         end: '01:20', note: '' }]
      }));
      // 23:30 - das Licht kommt erst spaeter im Set
      await zeitStellen(page, new Date(2026, 7, 28, 23, 30, 0).getTime());
      await page.goto(bar.adresse + '/');

      await expect(page.locator('.lichtJetzt')).toHaveCount(0);
      await expect(page.locator('.ttNow .lichtZeichen')).toHaveCount(1);
    });

  test('eine vorbei Lichtphase laesst kein Zeichen zurueck',
    async ({ page, bar }) => {
      // Gemeldet: 23:30, der Act laeuft bis 00:00, die Phase war um 23:00 zu
      // Ende - und das Zeichen stand trotzdem noch am Act. Es hiess damit "in
      // diesem Set blitzt es", obwohl im Rest des Sets nichts mehr kommt.
      bar.konfig(programm({
        // Lange Standzeit: sonst wechselt die Schleife die Seite, waehrend
        // gemessen wird - und "nichts da" waere dann nur "nichts mehr da".
        settings: { timetableDuration: 600 },
        timetable: [
          { id: 'a1', date: '2026-08-28', start: '22:30', end: '00:00', act: 'Doubkore' },
          { id: 'a2', date: '2026-08-29', start: '00:00', end: '01:30', act: 'Omikron' }
        ],
        lichteffekte: [
          { id: 'l1', date: '2026-08-28', start: '22:00', end: '23:00', note: '' },
          { id: 'l2', date: '2026-08-29', start: '01:00', end: '02:00', note: '' }
        ]
      }));
      await zeitStellen(page, new Date(2026, 7, 28, 23, 30, 0).getTime());
      await page.goto(bar.adresse + '/');
      await expect(page.locator('.ttNow')).toContainText('Doubkore');

      // Einmal messen, nicht wiederholt pruefen: eine Erwartung, die auf Null
      // wartet, geht auch dann auf, wenn die Seite inzwischen weitergeblaettert
      // hat. Genau daran ist dieser Test beim Gegenpruefen erst vorbeigelaufen.
      const stand = await page.evaluate(() => ({
        balken: document.querySelectorAll('.lichtJetzt').length,
        zeichen: document.querySelectorAll('.layer.show .ttNow .lichtZeichen').length,
        spalte: document.querySelectorAll('.layer.show .ttList .lichtBalken').length
      }));
      expect(stand.balken, 'es laeuft gerade keine Phase').toBe(0);
      expect(stand.zeichen, 'und im Rest des Sets kommt auch keine mehr').toBe(0);
      // Die Spalte bei den kommenden Acts bleibt davon unberuehrt
      expect(stand.spalte, 'die kommende Phase steht weiter in der Spalte').toBe(1);
    });

  test('kommt im Rest des Sets noch Licht, bleibt das Zeichen',
    async ({ page, bar }) => {
      // Gegenprobe zum Test darueber: dieselbe Lage, nur liegt die Phase noch
      // vor uns.
      bar.konfig(programm({
        settings: { timetableDuration: 600 },
        timetable: [
          { id: 'a1', date: '2026-08-28', start: '22:30', end: '00:00', act: 'Doubkore' }
        ],
        lichteffekte: [
          { id: 'l1', date: '2026-08-28', start: '23:40', end: '23:55', note: '' }
        ]
      }));
      await zeitStellen(page, new Date(2026, 7, 28, 23, 30, 0).getTime());
      await page.goto(bar.adresse + '/');
      await expect(page.locator('.ttNow')).toContainText('Doubkore');

      const stand = await page.evaluate(() => ({
        balken: document.querySelectorAll('.lichtJetzt').length,
        zeichen: document.querySelectorAll('.layer.show .ttNow .lichtZeichen').length
      }));
      expect(stand.balken, 'noch laeuft nichts').toBe(0);
      expect(stand.zeichen, 'aber es kommt noch etwas').toBe(1);
    });

  test('Restzeit und Lichtwarnung sind auseinanderzuhalten',
    async ({ page, bar }) => {
      // Beide sagen "wie lange noch" - die eine ueber den Act, die andere ueber
      // das Licht. Sie duerfen sich nicht gleichen.
      bar.konfig(programm({
        timetable: [{ id: 'a1', date: '2026-08-28', start: '22:00', end: '23:00',
                      act: 'Nachtflug' }],
        lichteffekte: [{ id: 'l1', date: '2026-08-28', start: '22:30',
                         end: '22:50', note: '' }]
      }));
      // 22:40 - Act noch 20 Minuten, Licht laeuft und endet 22:50
      await zeitStellen(page, new Date(2026, 7, 28, 22, 40, 0).getTime());
      await page.goto(bar.adresse + '/');

      await expect(page.locator('.ttRest')).toHaveText('nur noch 20 min');
      await expect(page.locator('.lichtZeit')).toHaveText('endet um 22:50');

      // Die eine ist eine Dauer beim Act, die andere ein Zeitpunkt auf dem
      // Balken - und nur eine von beiden traegt das Warnzeichen.
      await expect(page.locator('.ttNow .lichtZeichen')).toHaveCount(0);
      await expect(page.locator('.lichtJetzt .lichtZeichen')).toHaveCount(1);
    });

  test('das Zeichen ueberdeckt den Act-Namen nicht', async ({ page, bar }) => {
    bar.konfig(programm());
    // 23:10 - Nachtflug laeuft, das Licht kommt erst um 23:30. Nur dann steht
    // das Zeichen an der Karte; waehrend einer laufenden Phase sagt es der
    // Balken darunter.
    await zeitStellen(page, new Date(2026, 7, 28, 23, 10, 0).getTime());
    await page.goto(bar.adresse + '/');

    // Der laufende Act ist betroffen und traegt das Zeichen
    const karte = page.locator('.ttNow');
    await expect(karte.locator('.lichtZeichen')).toHaveCount(1);

    const drin = await karte.evaluate((el) => {
      const k = el.getBoundingClientRect();
      const z = el.querySelector('.lichtZeichen').getBoundingClientRect();
      return z.right <= k.right + 1 && z.bottom <= k.bottom + 1;
    });
    expect(drin, 'das Zeichen bleibt in der Karte').toBe(true);
  });
});

test.describe('Das Zeichen', () => {
  test('wird geladen und sitzt auf heller Plakette', async ({ page, bar }) => {
    bar.konfig(programm());
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const bild = page.locator('.klLicht .lichtZeichen img');
    await expect(bild).toHaveAttribute('src', 'branding/lichteffekte.png');
    await bildGeladen(bild);

    // Die gelieferte Grafik ist schwarz auf transparent. Ohne helle Flaeche
    // waere sie auf dem dunklen Hintergrund praktisch unsichtbar.
    const grund = await page.locator('.klLicht .lichtZeichen')
      .evaluate(el => getComputedStyle(el).backgroundColor);
    expect(grund).toBe('rgb(255, 255, 255)');

    // Und sie muss eine brauchbare Groesse haben, nicht ein paar Pixel
    const hoehe = await bild.evaluate(el => el.getBoundingClientRect().height);
    expect(hoehe).toBeGreaterThan(20);
  });

  test('steht einmal ueber der Spalte, nicht in jeder Zeile',
    async ({ page, bar }) => {
      // In jeder Zeile wiederholt war es Zierrat, der die Uhrzeiten zudeckte.
      bar.konfig(programm());
      await zeitStellen(page, FREITAG_20_UHR);
      await page.goto(bar.adresse + '/');
      await page.waitForSelector('.ttRow.hatLicht');

      await expect(page.locator('.klLicht .lichtZeichen')).toHaveCount(1);
      await expect(page.locator('.lichtSpur .lichtZeichen')).toHaveCount(0);
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

  test('ordnet nach Naechten, nicht nach Kalendertagen', async ({ page, bar }) => {
    // 01:00 gehoert zur Freitagnacht, nicht zum Samstag. Vorher wurde eine
    // Nacht auf zwei Spalten zerrissen.
    bar.konfig(programm({
      settings: { lichtEvery: 1, lichtDuration: 60, timetableEvery: 0, pricesEvery: 0 },
      timetable: [], prices: [],
      lichteffekte: [
        { id: 'a', date: '2026-08-28', start: '22:00', end: '23:00' },
        { id: 'b', date: '2026-08-29', start: '01:00', end: '02:00' },
        { id: 'c', date: '2026-08-29', start: '23:00', end: '00:00' }
      ]
    }));
    await zeitStellen(page, FREITAG_20_UHR);
    await page.goto(bar.adresse + '/');

    const seite = page.locator('.slide[data-kind=licht]');
    await expect(seite).toBeVisible();
    await expect(seite.locator('.lichtTag')).toHaveCount(2);

    const erste = seite.locator('.lichtTag').first();
    await expect(erste.locator('.lichtDatum')).toContainText('HEUTE NACHT');
    await expect(erste.locator('.lichtSpanneDatum')).toHaveText('28.08. auf 29.08.');
    await expect(erste.locator('.lichtSpanne')).toHaveCount(2);
    await expect(erste).toContainText('22:00–23:00');
    await expect(erste).toContainText('01:00–02:00');

    const zweite = seite.locator('.lichtTag').nth(1);
    await expect(zweite.locator('.lichtDatum')).toContainText('NACHT AUF SONNTAG');
    await expect(zweite.locator('.lichtSpanne')).toHaveCount(1);
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

  test('mit lauter vergangenen Zeiten laeuft sie nicht mehr', async ({ page, bar }) => {
    // Nach dem Festival lief die Seite weiter und meldete "nichts angemeldet"
    bar.konfig(programm({
      settings: { lichtEvery: 1, lichtDuration: 3, timetableEvery: 0, pricesEvery: 0,
                  imageDuration: 2 },
      timetable: [], prices: [],
      lichteffekte: [{ id: 'l', date: '2020-01-01', start: '22:00', end: '23:00' }]
    }));
    bar.bilder('eins.png', 'zwei.png');
    await zeitStellen(page, FREITAG_20_UHR);

    const lauf = schleifeMitschreiben(page);
    await page.goto(bar.adresse + '/');
    await expect.poll(() => lauf.length, { timeout: 25000 }).toBeGreaterThanOrEqual(6);
    expect(lauf).not.toContain('licht');
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
