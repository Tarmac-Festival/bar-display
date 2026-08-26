'use strict';

// Das Programm am Bar-Rechner. Hier laeuft es als Electron-Anwendung; alles,
// was mit Fenstern, Bildschirmen und dem Hauptprozess zu tun hat, gibt es nur
// auf diesem Weg.

const { test, expect } = require('../hilfe/rechner');

test.describe('Start', () => {
  test('die Anzeige geht auf und zeigt den Timetable', async ({ rechner }) => {
    await expect(rechner.anzeige.locator('.slide[data-kind=timetable]')).toBeVisible();
    await expect(rechner.anzeige.locator('.slide[data-kind=timetable]')).toContainText('Nachtflug');
  });

  test('die Anzeige laeuft ueber die Electron-Bruecke, nicht ueber HTTP', async ({ rechner }) => {
    const modus = await rechner.anzeige.evaluate(() => window.api.paths().then(p => p.mode));
    expect(modus).toBeUndefined();
  });
});

test.describe('Einstellungsfenster', () => {
  test('laesst sich oeffnen und zeigt die Reiter in der gewohnten Reihenfolge',
    async ({ rechner }) => {
      const w = await rechner.einstellungen();
      const reiter = await w.locator('.tab').allInnerTexts();
      expect(reiter).toEqual(['Durchsage', 'Timetable', 'Karte', 'Videos',
                              'Anzeige', 'System']);
    });

  test('hier gibt es Bildschirmauswahl und Autostart - anders als am Handy',
    async ({ rechner }) => {
      const w = await rechner.einstellungen();
      await w.getByRole('button', { name: 'System', exact: true }).click();

      await expect(w.locator('#s_displayId')).toBeVisible();
      await expect(w.locator('#s_autostart')).toBeVisible();
      // Mindestens der Hauptbildschirm muss in der Liste stehen
      expect(await w.locator('#s_displayId option').count()).toBeGreaterThan(0);
    });

  test('Speichern kommt auf der Anzeige an', async ({ rechner }) => {
    const w = await rechner.einstellungen();
    await w.getByRole('button', { name: 'Anzeige', exact: true }).click();
    await w.locator('#s_barName').fill('UMBENANNT IM TEST');
    await w.getByRole('button', { name: 'Speichern' }).click();

    await expect(w.locator('#dirty')).toBeHidden();
    await expect.poll(() => rechner.lies().settings.barName).toBe('UMBENANNT IM TEST');
    // Und die Anzeige hat es uebernommen, ohne dass jemand neu laden musste
    await expect(rechner.anzeige.locator('.slide.show .brand'))
      .toContainText('UMBENANNT IM TEST');
  });

  test('woanders gespeichert: Rueckfrage statt stillem Ueberschreiben',
    async ({ rechner }) => {
      const w = await rechner.einstellungen();
      await w.getByRole('button', { name: 'Anzeige', exact: true }).click();
      await w.locator('#s_barName').fill('Vom Rechner');
      await expect(w.locator('#dirty')).toBeVisible();

      // Jemand speichert vom Handy
      rechner.konfig({ settings: { barName: 'Vom Handy' } });

      // Abbrechen heisst: den neuen Stand laden, die eigene Eingabe verwerfen
      w.once('dialog', d => d.dismiss());
      await w.getByRole('button', { name: 'Speichern' }).click();
      await expect(w.locator('#s_barName')).toHaveValue('Vom Handy');
    });
});

test.describe('Bedienung vom Handy, angeboten vom Rechner', () => {
  test('die Bedienseite ist im Netz erreichbar', async ({ rechner, request }) => {
    const antwort = await request.get(rechner.adresse + '/einstellungen');
    expect(antwort.status()).toBe(200);
    expect(await antwort.text()).toContain('Bar Display');
  });

  test('vom Handy aus laesst sich der Bildschirm waehlen', async ({ rechner, request }) => {
    // Diese Auskunft gibt es nur, wenn Electron sie hereinreicht - auf dem
    // Raspberry Pi ist die Liste leer und die Karte verschwindet.
    const antwort = await request.get(rechner.adresse + '/api/displays');
    expect(antwort.status()).toBe(200);
    const liste = await antwort.json();
    expect(Array.isArray(liste)).toBe(true);
    expect(liste.length).toBeGreaterThan(0);
    expect(liste[0]).toHaveProperty('breite');
    expect(liste[0]).toHaveProperty('nummer');
  });

  test('die genannte Adresse ist keine VPN-Adresse', async ({ rechner, request }) => {
    const auskunft = await (await request.get(rechner.adresse + '/api/fern')).json();
    expect(auskunft.port).toBe(rechner.port);
    for (const a of auskunft.adressen || []) {
      // 10.2.0.2 war der ProtonVPN-Zugang, der oben in der Liste stand
      expect(a).not.toMatch(/^10\.2\./);
    }
  });
});
