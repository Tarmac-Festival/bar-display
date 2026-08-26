'use strict';

// Die Anzeige selbst, so wie sie am Raspberry Pi laeuft: Chromium holt sich
// player.html vom Dienst. Genau dieser Weg hat die meisten Rueckmeldungen von
// der Bar ausgeloest.

const { test, expect, beispiel, schleifeMitschreiben } = require('./hilfe/bar');

test.describe('Laufschrift', () => {
  test('laeuft von rechts herein, nur einmal, ueber die volle Breite', async ({ page, bar }) => {
    bar.konfig(beispiel({
      announcement: {
        enabled: true, modus: 'lauf', tempo: 'normal', until: '',
        text: 'Letzte Runde am Hangar – die Bar schließt um 02:00', plans: []
      }
    }));

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(bar.adresse + '/');

    const balken = page.locator('#durchsage');
    await expect(balken).toHaveClass(/an/);
    // Erst messen, wenn die Schrift steht - vorher ist der Text schmaler und
    // die Anzeige rechnet gleich noch einmal nach.
    await page.evaluate(() => document.fonts.ready);

    // Frueher stand der Text zweimal auf dem Balken - bei kurzem Text sah man
    // beide Fassungen gleichzeitig.
    await expect(page.locator('.laufStueck')).toHaveCount(1);

    const lage = await page.evaluate(() => {
      const spur = document.querySelector('.laufSpur');
      const stueck = document.querySelector('.laufStueck');
      const st = getComputedStyle(spur);
      const an = spur.getAnimations()[0];
      const fenster = document.querySelector('.durchsageText').getBoundingClientRect();
      return {
        start: parseFloat(st.getPropertyValue('--laufStart')),
        ende: parseFloat(st.getPropertyValue('--laufEnde')),
        breite: stueck.getBoundingClientRect().width,
        fensterBreite: fenster.width,
        balkenBreite: document.querySelector('#durchsage').getBoundingClientRect().width,
        laeuft: !!an
      };
    });

    expect(lage.laeuft, 'die Laufschrift wird bewegt').toBe(true);
    // Start ganz rechts ausserhalb, Ende ganz links ausserhalb - der Text
    // ploppt also nicht auf, sondern zieht durch.
    expect(lage.start).toBeCloseTo(lage.fensterBreite, 0);
    expect(lage.ende).toBeCloseTo(-lage.breite, 0);
    // Und der Balken nutzt die ganze Breite, nicht 88 % mit Polsterung
    expect(lage.balkenBreite).toBe(1280);
    expect(lage.fensterBreite).toBe(1280);
  });

  test('breites Bild: der Balken bleibt so breit wie der Schirm', async ({ page, bar }) => {
    bar.konfig(beispiel({
      announcement: { enabled: true, modus: 'lauf', tempo: 'normal', until: '',
                      text: 'Shuttle ab 01:30 vom Tor Nord', plans: [] }
    }));

    // 21:9, wie der Fernseher an der Bar
    await page.setViewportSize({ width: 2560, height: 1080 });
    await page.goto(bar.adresse + '/');
    await expect(page.locator('#durchsage')).toHaveClass(/an/);
    await page.evaluate(() => document.fonts.ready);

    const breiten = await page.evaluate(() => ({
      balken: document.querySelector('#durchsage').getBoundingClientRect().width,
      text: document.querySelector('.durchsageText').getBoundingClientRect().width
    }));
    expect(breiten.balken).toBe(2560);
    expect(breiten.text).toBe(2560);
  });

  test('schnell braucht weniger Zeit als langsam', async ({ page, bar }) => {
    const dauer = async (tempo) => {
      bar.konfig(beispiel({
        announcement: { enabled: true, modus: 'lauf', tempo, until: '',
                        text: 'Immer derselbe Satz, damit nur das Tempo zaehlt', plans: [] }
      }));
      await page.goto(bar.adresse + '/');
      await expect(page.locator('#durchsage')).toHaveClass(/an/);
      await page.evaluate(() => document.fonts.ready);
      return page.evaluate(() => {
        const an = document.querySelector('.laufSpur').getAnimations()[0];
        return an.effect.getComputedTiming().duration;
      });
    };

    const langsam = await dauer('langsam');
    const schnell = await dauer('schnell');
    expect(schnell).toBeLessThan(langsam);
  });

  test('feste Durchsage laeuft nicht', async ({ page, bar }) => {
    bar.konfig(beispiel({
      announcement: { enabled: true, modus: 'fest', tempo: 'normal', until: '',
                      text: 'Kurz und laut', plans: [] }
    }));
    await page.goto(bar.adresse + '/');
    await expect(page.locator('#durchsage')).toHaveClass(/an/);
    await expect(page.locator('.laufSpur')).toHaveCount(0);
    await expect(page.locator('.durchsageText')).toHaveText('Kurz und laut');
  });
});

test.describe('Schleife', () => {
  test('zwei Beitraege, Timetable nach je 3: kein Bild wiederholt sich', async ({ page, bar }) => {
    bar.konfig(beispiel());
    bar.bilder('eins.png', 'zwei.png');

    const lauf = schleifeMitschreiben(page);
    await page.goto(bar.adresse + '/');

    // Lang genug fuer zwei volle Runden
    await expect.poll(() => lauf.filter(x => x === 'timetable').length,
                      { timeout: 30000 }).toBeGreaterThanOrEqual(2);

    // Zwischen zwei Timetables darf kein Bild zweimal stehen - sonst laeuft ein
    // Beitrag nur, damit die eingestellte Zahl rechnerisch aufgeht.
    let seit = [];
    for (const x of lauf) {
      if (x === 'timetable') { seit = []; continue; }
      expect(seit, 'Beitrag wiederholt sich vor dem Timetable: ' + lauf.join(' > ')).not.toContain(x);
      seit.push(x);
    }
    expect(new Set(lauf.filter(x => x.endsWith('.png'))).size).toBe(2);
  });

  test('Speichern wirft die Schleife nicht zurueck', async ({ page, bar }) => {
    bar.konfig(beispiel({ settings: { imageDuration: 8 } }));
    bar.bilder('eins.png', 'zwei.png', 'drei.png');

    const lauf = schleifeMitschreiben(page);
    await page.goto(bar.adresse + '/');

    // Warten, bis der zweite Beitrag laeuft - mitten in der Runde
    await expect.poll(() => lauf.length, { timeout: 20000 }).toBeGreaterThanOrEqual(2);
    const bisher = lauf.length;
    const laeuft = lauf[lauf.length - 1];

    // Jemand tippt am Handy einen Preis um
    bar.konfig({ settings: { barName: 'Beim Speichern umbenannt' } });
    await page.waitForTimeout(1500);

    expect(lauf.length, 'kein Schnitt beim Speichern').toBe(bisher);
    expect(lauf[lauf.length - 1]).toBe(laeuft);

    // Danach geht es weiter - und nicht wieder beim ersten Beitrag
    await expect.poll(() => lauf.length, { timeout: 20000 }).toBeGreaterThan(bisher);
    expect(lauf[bisher]).not.toBe(lauf[0]);
  });

  test('faellt der laufende Beitrag weg, wird sofort weitergeschaltet', async ({ page, bar }) => {
    bar.konfig(beispiel({ settings: { imageDuration: 10, timetableEvery: 0 } }));
    bar.bilder('eins.png', 'zwei.png');

    const lauf = schleifeMitschreiben(page);
    await page.goto(bar.adresse + '/');
    await expect.poll(() => lauf.length, { timeout: 20000 }).toBeGreaterThanOrEqual(1);

    const laeuft = lauf[lauf.length - 1];
    const bisher = lauf.length;
    bar.konfig({ videos: bar.lies().videos.filter(v => v.file !== laeuft) });

    await expect.poll(() => lauf.length, { timeout: 5000 }).toBeGreaterThan(bisher);
    expect(lauf[lauf.length - 1]).not.toBe(laeuft);
  });
});

test.describe('Info-Slides', () => {
  test('ohne Beitraege laufen Timetable und Preise trotzdem', async ({ page, bar }) => {
    bar.konfig(beispiel({ settings: { pricesEvery: 5 } }));

    const lauf = schleifeMitschreiben(page);
    await page.goto(bar.adresse + '/');
    await expect.poll(() => lauf.length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    expect(lauf).toContain('timetable');
    expect(lauf).toContain('prices');
  });

  test('der laufende Act steht auf dem Timetable', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/');
    await expect(page.locator('.slide[data-kind=timetable]')).toBeVisible();
    await expect(page.locator('.slide[data-kind=timetable]')).toContainText('Nachtflug');
  });
});
