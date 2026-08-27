'use strict';

// Was passiert, wenn die Umgebung nicht mitspielt: eine von Hand zerschossene
// Konfiguration, geloeschte Ordner, ein abgezogener Monitor. Nichts davon darf
// die Anzeige umbringen - sie laeuft an einer Bar unbeaufsichtigt durch.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('../hilfe/rechner');

test('Konfiguration von aussen zerstoert', async ({ rechner }) => {
  // Jemand editiert die Datei von Hand und macht sie kaputt
  fs.writeFileSync(path.join(rechner.ordner, 'config.json'), '{ das ist kein JSON');
  const gelesen = rechner.lies();
  expect(gelesen.settings.barName, 'faellt auf die Voreinstellung zurueck').toBeTruthy();
  expect(Array.isArray(gelesen.videos)).toBe(true);
});

test('Medienordner waehrend des Betriebs geloescht', async ({ rechner }) => {
  const fehler = [];
  rechner.anzeige.on('pageerror', e => fehler.push(e.message));

  fs.rmSync(path.join(rechner.ordner, 'media'), { recursive: true, force: true });
  fs.rmSync(path.join(rechner.ordner, 'photos'), { recursive: true, force: true });

  // Die Anzeige muss weiterlaufen, nicht abstuerzen
  await rechner.anzeige.reload();
  await rechner.anzeige.waitForTimeout(2500);
  await expect(rechner.anzeige.locator('.slide.show')).toBeVisible();
  expect(fehler, 'keine Ausnahme').toEqual([]);
});

test('Bildschirm-Kennung zeigt ins Leere', async ({ rechner }) => {
  // Ein abgezogener Monitor: die gespeicherte Kennung gibt es nicht mehr
  rechner.konfig({ settings: { displayId: '999999999' } });
  const w = await rechner.einstellungen();
  await w.getByRole('button', { name: 'System', exact: true }).click();

  // Die Anzeige muss trotzdem laufen und die Auswahl bedienbar bleiben
  await expect(rechner.anzeige.locator('.slide.show')).toBeVisible();
  await expect(w.locator('#s_displayId')).toBeVisible();
  // Und die Seite sagt, dass gerade eingesprungen wird - vorher behauptete die
  // Auswahl, die Anzeige liefe dauerhaft auf dem anderen Schirm.
  const hinweis = w.locator('#schirmFehlt');
  await expect(hinweis).toBeVisible();
  await expect(hinweis).toContainText('nicht angeschlossen');
  await expect(hinweis).toContainText('springt zurück');
  // Die Einstellung bleibt stehen, damit sie zurueckspringen kann
  expect(rechner.lies().settings.displayId).toBe('999999999');
  console.log('>> Hinweis: ' + (await hinweis.innerText()).slice(0, 80));
});
