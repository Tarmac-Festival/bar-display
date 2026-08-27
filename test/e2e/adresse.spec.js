'use strict';

// Die Adresse fuers Handy im Auge behalten.
//
// Sie aendert sich, sobald der Rechner das Netz wechselt - und beim Aufbau
// passiert genau das staendig: Hotspot am Handy an, Rechner verbindet sich,
// neue Adresse. Stand hier noch die alte, fuehrte der QR-Code ins Leere.

const { test, expect, beispiel } = require('./hilfe/bar');

/** Zaehlt, wie oft die Seite nach der Netzlage gefragt hat. */
function abfragenZaehlen(page) {
  const treffer = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/fern')) treffer.push(r.url());
  });
  return treffer;
}

async function systemOeffnen(page, bar) {
  bar.konfig(beispiel({ prices: [] }));
  await page.goto(bar.adresse + '/einstellungen');
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(page.locator('#fernAdresse')).toBeVisible();
}

test('die Karte fragt regelmaessig nach', async ({ page, bar }) => {
  const abfragen = abfragenZaehlen(page);
  await page.clock.install();
  await systemOeffnen(page, bar);

  const vorher = abfragen.length;
  await page.clock.runFor(40000);
  await expect.poll(() => abfragen.length,
    { message: 'in vierzig Sekunden wurde mehrfach nachgesehen' })
    .toBeGreaterThan(vorher + 1);
});

test('bei gleicher Lage bleibt der QR-Code stehen', async ({ page, bar }) => {
  // Sonst blinkt er alle paar Sekunden auf.
  await page.clock.install();
  await systemOeffnen(page, bar);
  await expect(page.locator('#fernQr svg')).toBeVisible();

  // Markierung am vorhandenen Bild: wird es neu gezeichnet, ist sie weg.
  await page.evaluate(() => {
    document.querySelector('#fernQr svg').dataset.marke = 'alt';
  });
  await page.clock.runFor(40000);

  await expect(page.locator('#fernQr svg[data-marke=alt]'),
    'derselbe QR-Code wie vorher').toHaveCount(1);
});

test('nur eine Uhr, auch nach mehrmaligem Speichern', async ({ page, bar }) => {
  // fillSettingsFields() laeuft bei jedem Speichern. Ohne Sperre kaeme jedes
  // Mal eine weitere Uhr dazu - und die Seite fragte immer haeufiger nach.
  await page.clock.install();
  await systemOeffnen(page, bar);

  // Der Port ist auf der Bedienseite ausgeblendet - wer den Dienst von dort
  // umstellt, saegt den Ast ab. Zum Ausloesen reicht Speichern.
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();
  }

  const abfragen = abfragenZaehlen(page);
  await page.clock.runFor(40000);
  // Bei acht Sekunden Takt sind das fuenf Abfragen; mit vier Uhren waeren es
  // zwanzig. Die Grenze liegt bewusst dazwischen.
  await expect.poll(() => abfragen.length).toBeGreaterThan(2);
  expect(abfragen.length, 'es laeuft genau eine Uhr').toBeLessThan(10);
});
