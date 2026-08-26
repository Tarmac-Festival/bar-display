'use strict';

// Die Bedienseite, wie sie ueber das Netz ausgeliefert wird - der Weg vom
// Handy und vom Raspberry Pi.

const { test, expect, beispiel, bildGeladen } = require('./hilfe/bar');

test.describe('Vorschaubilder', () => {
  test('Act-Foto und Logo werden wirklich geladen', async ({ page, bar }) => {
    bar.datei('photo', 'act_nachtflug.png');
    bar.datei('logo', 'eigenes_logo.png');
    bar.konfig(beispiel({
      settings: { logo: 'eigenes_logo.png' },
      timetable: [{ date: '2026-08-26', start: '21:00', end: '23:00',
                    act: 'Nachtflug', info: '', photo: 'act_nachtflug.png' }]
    }));

    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();

    const foto = page.locator('#ttTable .photoBox img');
    // Frueher stand hier eine file://-Adresse - der Pfad auf der Platte des
    // Bar-Rechners. Im Browser des Handys blockiert das der Browser, die
    // Vorschau blieb leer.
    await expect(foto).toHaveAttribute('src', '/photos/act_nachtflug.png');
    await bildGeladen(foto);

    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();
    const logo = page.locator('#logoPreview img');
    await expect(logo).toHaveAttribute('src', '/branding/eigenes_logo.png');
    await bildGeladen(logo);
  });

  test('der Ausschnitt-Editor zeigt dasselbe Bild', async ({ page, bar }) => {
    bar.datei('photo', 'act.png');
    bar.konfig(beispiel({
      timetable: [{ date: '2026-08-26', start: '21:00', end: '23:00',
                    act: 'Nachtflug', info: '', photo: 'act.png' }]
    }));

    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();
    await page.locator('#ttTable .photoCrop').click();

    const gross = page.locator('.cropBuehne img');
    await expect(gross).toBeVisible();
    await bildGeladen(gross);
  });
});

test.describe('Was es am Handy nicht gibt', () => {
  test('ohne waehlbare Bildschirme bleibt die Karte weg', async ({ page, bar }) => {
    // Der Dienst hier kennt keine Bildschirme - genau wie auf dem Pi
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'System', exact: true }).click();

    await expect(page.locator('#s_displayId')).toBeHidden();
    // Autostart betrifft das Geraet an der Anzeige - nicht aus der Ferne
    await expect(page.locator('#s_autostart')).toBeHidden();
  });

  test('Pruefen und Umwandeln meldet sich nicht ungefragt', async ({ page, bar }) => {
    bar.bilder('clip.png');
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Videos', exact: true }).click();

    // Die Abspielprobe lief frueher im Browser des Handys ueber eine
    // file://-Adresse und meldete jeden Clip als nicht abspielbar.
    const gefragt = await page.evaluate(async () => {
      let ran = false;
      const alt = window.api.canConvert;
      window.api.canConvert = function () { ran = true; return alt.apply(null, arguments); };
      await pruefeUndWandle([{ id: 'x', file: 'clip.png', title: 'Clip' }], true);
      return { ran, meldung: document.getElementById('toast').classList.contains('hidden') ? null
                              : document.getElementById('toast').textContent };
    });
    expect(gefragt.ran, 'am Handy wird nicht auf Abspielbarkeit geprueft').toBe(false);
    expect(gefragt.meldung).toBe(null);
  });
});

test.describe('Haeufigkeiten stehen im jeweiligen Reiter', () => {
  const wo = [
    ['Timetable', ['s_timetableEvery', 's_timetableDuration', 's_timetableMaxNext']],
    ['Getränkepreise', ['s_pricesEvery', 's_pricesDuration']],
    ['Videos', ['s_imageDuration']]
  ];

  for (const [reiter, felder] of wo) {
    test(reiter, async ({ page, bar }) => {
      bar.konfig(beispiel());
      await page.goto(bar.adresse + '/einstellungen');
      await page.getByRole('button', { name: reiter, exact: true }).click();
      for (const id of felder) await expect(page.locator('#' + id)).toBeVisible();
    });
  }
});

test.describe('Wenn zwei gleichzeitig speichern', () => {
  test('Rueckfrage statt stillem Ueberschreiben', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();

    // Hier etwas eintippen, ohne zu speichern
    const name = page.locator('#s_barName');
    await name.fill('Von diesem Geraet');
    await expect(page.locator('#dirty')).toBeVisible();

    // Und jetzt speichert jemand anders
    bar.konfig({ settings: { barName: 'Vom anderen Geraet' } });

    // Die Eingabe bleibt stehen, aber die Seite sagt Bescheid
    await expect(page.locator('#fremd')).toBeVisible();
    await expect(name).toHaveValue('Von diesem Geraet');

    // Beim Speichern kommt die Rueckfrage. Abbrechen laedt den neuen Stand.
    page.once('dialog', d => d.dismiss());
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(name).toHaveValue('Vom anderen Geraet');
    await expect(page.locator('#dirty')).toBeHidden();
    await expect(page.locator('#fremd')).toBeHidden();
    expect(bar.lies().settings.barName).toBe('Vom anderen Geraet');
  });

  test('bewusst ueberschreiben geht auch', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();

    await page.locator('#s_barName').fill('Von diesem Geraet');
    bar.konfig({ settings: { barName: 'Vom anderen Geraet' } });
    await expect(page.locator('#fremd')).toBeVisible();

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.locator('#fremd')).toBeHidden();
    await expect.poll(() => bar.lies().settings.barName).toBe('Von diesem Geraet');
  });

  test('ohne offene Eingabe wird der neue Stand einfach uebernommen', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();

    bar.konfig({ settings: { barName: 'Vom anderen Geraet' } });

    await expect(page.locator('#s_barName')).toHaveValue('Vom anderen Geraet');
    await expect(page.locator('#fremd')).toBeHidden();
  });
});

test.describe('Hochladen', () => {
  test('HEVC vom iPhone wird erkannt und benannt', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');

    const antwort = await page.evaluate(async () => {
      const roh = new Uint8Array([...'....ftypqt  ....hvc1....'].map(c => c.charCodeAt(0)));
      const datei = new File([roh], 'iphone.mov', { type: 'video/quicktime' });
      return window.barDisplayUpload.hochladen(datei, 'media', 'iphone.mov');
    });

    expect(antwort.ok).toBe(true);
    expect(antwort.hinweis).toContain('HEVC');
  });

  test('zwei Aufnahmen mit demselben Namen ueberschreiben sich nicht', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');

    // Am iPhone heisst jede frische Aufnahme "image.jpg"
    const namen = await page.evaluate(async () => {
      const raus = [];
      for (let i = 0; i < 2; i++) {
        const datei = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' });
        const erg = await window.barDisplayUpload.hochladen(datei, 'photo', 'image.png');
        raus.push(erg.file);
      }
      return raus;
    });
    expect(namen[0]).not.toBe(namen[1]);
  });

  test('ein spaet geliefertes Bild wird nicht verschluckt', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');

    // Genau der Ablauf am iPhone: die Kamera geht zu, die Seite bekommt den
    // Fokus zurueck - und erst Sekunden spaeter liegt das Bild vor. Frueher gab
    // die Auswahl nach knapp zwei Sekunden auf.
    const ergebnis = await page.evaluate(async () => {
      const zusage = window.barDisplayUpload.dateienWaehlen('photo');
      await new Promise(r => setTimeout(r, 100));
      const feld = document.querySelector('input[type=file]');
      window.dispatchEvent(new Event('focus'));
      await new Promise(r => setTimeout(r, 4000));
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array([1, 2, 3])], 'image.jpg', { type: 'image/jpeg' }));
      feld.files = dt.files;
      feld.dispatchEvent(new Event('change'));
      const da = await zusage;
      return da.map(d => d.name);
    });
    expect(ergebnis).toEqual(['image.jpg']);
  });

  test('ein Abbruch bleibt ein Abbruch', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');

    const anzahl = await page.evaluate(async () => {
      const zusage = window.barDisplayUpload.dateienWaehlen('photo');
      await new Promise(r => setTimeout(r, 100));
      document.querySelector('input[type=file]').dispatchEvent(new Event('change'));
      return (await zusage).length;
    });
    expect(anzahl).toBe(0);
  });
});

test.describe('Uebergaenge einstellen', () => {
  async function anzeigeReiter(page, bar) {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();
  }

  test('die Auswahl erscheint erst bei "Abwechselnd"', async ({ page, bar }) => {
    await anzeigeReiter(page, bar);

    await expect(page.locator('#uebergangsWahl')).toBeHidden();
    await page.locator('#s_transition').selectOption('mix');
    await expect(page.locator('#uebergangsWahl')).toBeVisible();

    // Alle sieben stehen zur Wahl
    await expect(page.locator('#uebergangsListe input[type=checkbox]')).toHaveCount(7);

    await page.locator('#s_transition').selectOption('fade');
    await expect(page.locator('#uebergangsWahl')).toBeHidden();
  });

  test('ein Haken landet in der Konfiguration', async ({ page, bar }) => {
    await anzeigeReiter(page, bar);
    await page.locator('#s_transition').selectOption('mix');

    const schwarz = page.locator('[data-uebergang=schwarz]');
    await expect(schwarz).not.toBeChecked();
    await schwarz.check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    const s = bar.lies().settings;
    expect(s.transition).toBe('mix');
    expect(s.uebergaenge).toContain('schwarz');
  });

  test('der letzte Haken laesst sich nicht entfernen', async ({ page, bar }) => {
    bar.konfig(beispiel({ settings: { transition: 'mix', uebergaenge: ['zoom'] } }));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();

    const zoom = page.locator('[data-uebergang=zoom]');
    await expect(zoom).toBeChecked();
    // Bewusst click() statt uncheck(): uncheck() bestuende darauf, dass der
    // Haken hinterher weg ist - und genau das soll hier nicht passieren.
    await zoom.click();

    // Ohne einen einzigen Uebergang gaebe es keinen Wechsel mehr - der Haken
    // springt zurueck und die Seite sagt, warum.
    await expect(page.locator('#toast')).toContainText('Mindestens ein Übergang');
    await expect(zoom).toBeChecked();
  });

  test('die Reihenfolge in der Konfiguration bleibt die der Liste', async ({ page, bar }) => {
    bar.konfig(beispiel({ settings: { transition: 'mix', uebergaenge: ['logo'] } }));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();

    await page.locator('[data-uebergang=fade]').check();
    await page.locator('[data-uebergang=zoom]').check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    // fade steht in der Liste vor zoom, zoom vor logo - unabhaengig davon, in
    // welcher Reihenfolge angehakt wurde.
    expect(bar.lies().settings.uebergaenge).toEqual(['fade', 'zoom', 'logo']);
  });
});
