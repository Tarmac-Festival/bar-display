'use strict';

// Die Übergänge zwischen zwei Beiträgen - fest gewählt und abwechselnd.

const { test, expect, beispiel, uebergaengeMitschreiben } = require('./hilfe/bar');

// Kurze Standzeit, damit in wenigen Sekunden viele Wechsel zusammenkommen
const FLOTT = { settings: { imageDuration: 2, transitionMs: 300, fadeMs: 200, timetableEvery: 0 } };

async function sammeln(page, bar, wieViele) {
  const lauf = uebergaengeMitschreiben(page);
  await page.goto(bar.adresse + '/');
  await expect.poll(() => lauf.length, { timeout: 40000 }).toBeGreaterThanOrEqual(wieViele);
  return lauf;
}

test.describe('Fest gewaehlt', () => {
  for (const modus of ['fade', 'cut', 'schwarz', 'zoom', 'schieben', 'wipe', 'logo']) {
    test(modus + ' kommt immer', async ({ page, bar }) => {
      bar.konfig(beispiel(FLOTT));
      bar.konfig({ settings: { transition: modus } });
      bar.bilder('eins.png', 'zwei.png', 'drei.png');

      const lauf = await sammeln(page, bar, 4);
      expect(new Set(lauf.slice(0, 4))).toEqual(new Set([modus]));
    });
  }
});

test.describe('Abwechselnd', () => {
  test('es kommt nicht immer dasselbe', async ({ page, bar }) => {
    bar.konfig(beispiel(FLOTT));
    bar.konfig({ settings: { transition: 'mix',
                             uebergaenge: ['fade', 'zoom', 'schieben', 'wipe'] } });
    bar.bilder('eins.png', 'zwei.png', 'drei.png');

    const lauf = await sammeln(page, bar, 8);
    const acht = lauf.slice(0, 8);

    // Innerhalb von acht Wechseln muss jeder der vier drangewesen sein
    expect(new Set(acht)).toEqual(new Set(['fade', 'zoom', 'schieben', 'wipe']));

    // Und nie zweimal hintereinander derselbe - auch nicht an der Nahtstelle
    // zwischen dem ersten und dem zweiten Durchgang.
    for (let i = 1; i < acht.length; i++) {
      expect(acht[i], 'zweimal hintereinander: ' + acht.join(' > ')).not.toBe(acht[i - 1]);
    }
  });

  test('nur was angehakt ist, kommt auch dran', async ({ page, bar }) => {
    bar.konfig(beispiel(FLOTT));
    bar.konfig({ settings: { transition: 'mix', uebergaenge: ['zoom', 'schwarz'] } });
    bar.bilder('eins.png', 'zwei.png');

    const lauf = await sammeln(page, bar, 6);
    expect(new Set(lauf.slice(0, 6))).toEqual(new Set(['zoom', 'schwarz']));
  });

  test('ein einziger angehakter kommt eben immer', async ({ page, bar }) => {
    bar.konfig(beispiel(FLOTT));
    bar.konfig({ settings: { transition: 'mix', uebergaenge: ['wipe'] } });
    bar.bilder('eins.png', 'zwei.png');

    const lauf = await sammeln(page, bar, 3);
    expect(new Set(lauf.slice(0, 3))).toEqual(new Set(['wipe']));
  });

  test('eine neue Auswahl greift sofort', async ({ page, bar }) => {
    bar.konfig(beispiel(FLOTT));
    bar.konfig({ settings: { transition: 'mix', uebergaenge: ['zoom'] } });
    bar.bilder('eins.png', 'zwei.png');

    const lauf = await sammeln(page, bar, 2);
    bar.konfig({ settings: { uebergaenge: ['schwarz'] } });
    const stand = lauf.length;

    await expect.poll(() => lauf.length, { timeout: 20000 }).toBeGreaterThan(stand + 1);
    expect(lauf.slice(stand + 1)).not.toContain('zoom');
  });
});

test.describe('Sparmodus', () => {
  test('schneidet hart, egal was eingestellt ist', async ({ page, bar }) => {
    bar.konfig(beispiel(FLOTT));
    bar.konfig({ settings: { transition: 'mix', sparmodus: true,
                             uebergaenge: ['zoom', 'wipe', 'logo'] } });
    bar.bilder('eins.png', 'zwei.png');

    const lauf = await sammeln(page, bar, 4);
    expect(new Set(lauf.slice(0, 4))).toEqual(new Set(['cut']));
  });
});

test.describe('Was dabei wirklich passiert', () => {
  test('Schub: die Ebenen fahren zur Seite', async ({ page, bar }) => {
    bar.konfig(beispiel({ settings: { imageDuration: 3, transitionMs: 1200, timetableEvery: 0 } }));
    bar.konfig({ settings: { transition: 'schieben' } });
    bar.bilder('eins.png', 'zwei.png');

    await page.goto(bar.adresse + '/');

    // Mitten im Wechsel nachsehen, ob wirklich eine Bewegung laeuft
    const bewegt = await page.evaluate(async () => {
      for (let i = 0; i < 120; i++) {
        const laufend = Array.from(document.querySelectorAll('.layer'))
          .flatMap(el => el.getAnimations())
          .filter(a => a.playState === 'running');
        if (laufend.length) {
          return laufend.some(a => {
            const kf = a.effect.getKeyframes();
            return kf.some(k => (k.transform || '').includes('translateX'));
          });
        }
        await new Promise(r => setTimeout(r, 50));
      }
      return null;
    });
    expect(bewegt, 'es lief eine seitliche Bewegung').toBe(true);
  });

  test('Kurz auf Schwarz: der Vorhang ist wirklich schwarz', async ({ page, bar }) => {
    bar.konfig(beispiel({ settings: { imageDuration: 3, transitionMs: 1500, timetableEvery: 0 } }));
    bar.konfig({ settings: { transition: 'schwarz' } });
    bar.bilder('eins.png', 'zwei.png');

    await page.goto(bar.adresse + '/');

    const vorhang = await page.evaluate(async () => {
      const c = document.getElementById('curtain');
      for (let i = 0; i < 150; i++) {
        if (c.classList.contains('active')) {
          const mark = c.querySelector('.curtainMark');
          return {
            klasse: c.className,
            farbe: getComputedStyle(mark).backgroundColor,
            // Bewusst leer - kein Logo, kein Bar-Name
            inhalt: mark.innerHTML.trim()
          };
        }
        await new Promise(r => setTimeout(r, 50));
      }
      return null;
    });

    expect(vorhang).not.toBeNull();
    expect(vorhang.klasse).toContain('schwarz');
    expect(vorhang.farbe).toBe('rgb(0, 0, 0)');
    expect(vorhang.inhalt).toBe('');
  });
});
