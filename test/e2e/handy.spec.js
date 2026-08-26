'use strict';

// Dieselbe Bedienseite, aber auf einem Telefon-Bildschirm (iPhone 13, siehe
// playwright.config.js). Was am Rechner bequem aussieht, ist hier schnell
// unbedienbar - die Reiterleiste war es.

const { test, expect, beispiel, bildGeladen } = require('./hilfe/bar');

test('die Reiterleiste bekommt eine eigene Zeile und laesst sich treffen', async ({ page, bar }) => {
  bar.konfig(beispiel());
  await page.goto(bar.adresse + '/einstellungen');

  const leiste = page.locator('#tabs');
  await expect(leiste).toBeVisible();

  const mass = await page.evaluate(() => {
    const leiste = document.getElementById('tabs');
    const speichern = document.getElementById('saveBtn');
    const reiter = Array.from(document.querySelectorAll('.tab'));
    const l = leiste.getBoundingClientRect();
    const s = speichern.getBoundingClientRect();
    return {
      // Eigene Zeile heisst: die Leiste steht unter dem Speichern-Knopf,
      // nicht daneben eingequetscht.
      eigeneZeile: l.top >= s.bottom - 1,
      leisteBreit: l.width,
      fenster: window.innerWidth,
      zeilen: new Set(reiter.map(r => Math.round(r.getBoundingClientRect().top))).size,
      kleinsterReiter: Math.min(...reiter.map(r => r.getBoundingClientRect().width)),
      seitlichesWischen: document.documentElement.scrollWidth > window.innerWidth + 1
    };
  });

  expect(mass.eigeneZeile, 'die Reiter stehen in einer eigenen Zeile').toBe(true);
  expect(mass.leisteBreit).toBeGreaterThan(mass.fenster * 0.9);
  // Sechs Reiter passen auf einem Telefon nicht in eine Zeile - sie sollen
  // umbrechen, nicht seitlich verschwinden.
  expect(mass.zeilen).toBeGreaterThan(1);
  expect(mass.seitlichesWischen, 'die Seite laesst sich nicht seitlich wischen').toBe(false);
  // Kein Reiter darf zum Nadelöhr werden
  expect(mass.kleinsterReiter).toBeGreaterThan(44);
});

test('jeder Reiter laesst sich antippen', async ({ page, bar }) => {
  bar.konfig(beispiel());
  await page.goto(bar.adresse + '/einstellungen');

  for (const name of ['Durchsage', 'Timetable', 'Getränkepreise', 'Videos', 'Anzeige', 'System']) {
    await page.getByRole('button', { name, exact: true }).tap();
    await expect(page.getByRole('button', { name, exact: true })).toHaveClass(/active/);
  }
});

test('Act-Foto ist auch am Handy zu sehen', async ({ page, bar }) => {
  bar.datei('photo', 'act.png');
  bar.konfig(beispiel({
    timetable: [{ date: '2026-08-26', start: '21:00', end: '23:00',
                  act: 'Nachtflug', info: '', photo: 'act.png' }]
  }));

  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'Timetable', exact: true }).tap();

  const foto = page.locator('#ttTable .photoBox img');
  await expect(foto).toBeVisible();
  await bildGeladen(foto);
});
