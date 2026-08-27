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
    ['Karte', ['s_pricesEvery', 's_pricesDuration']],
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
  async function anzeigeReiter(page, bar, zusatz) {
    bar.konfig(beispiel(zusatz));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();
  }

  test('bei widerspruechlicher Konfiguration gilt der einzelne Uebergang',
    async ({ page, bar }) => {
      // Aeltere Installationen haben genau das: transition auf einem einzelnen
      // Wert, uebergaenge auf den Voreinstellungen. Die Liste muss zeigen, was
      // laeuft - nicht die Liste daneben.
      await anzeigeReiter(page, bar, {
        settings: { transition: 'kreis',
                    uebergaenge: ['fade', 'zoom', 'schieben', 'wipe', 'logo'] }
      });
      const an = await page.locator('#uebergangsListe input:checked')
        .evaluateAll(els => els.map(e => e.dataset.uebergang));
      expect(an).toEqual(['kreis']);
    });

  test('alle Uebergaenge stehen als Liste da', async ({ page, bar }) => {
    await anzeigeReiter(page, bar);

    // Frueher versteckte sich die Auswahl hinter dem Eintrag "Abwechselnd" im
    // Klappmenue - wer den nicht fand, sah nie, dass es mehrere sein koennen.
    await expect(page.locator('#uebergangsWahl')).toBeVisible();
    await expect(page.locator('#uebergangsListe input[type=checkbox]')).toHaveCount(10);
    await expect(page.locator('#s_transition')).toHaveCount(0);
  });

  test('genau einer angehakt heisst: immer der', async ({ page, bar }) => {
    await anzeigeReiter(page, bar, { settings: { transition: 'mix', uebergaenge: ['fade', 'zoom'] } });

    await page.locator('[data-uebergang=fade]').uncheck();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    const s = bar.lies().settings;
    expect(s.uebergaenge).toEqual(['zoom']);
    expect(s.transition).toBe('zoom');
  });

  test('mehrere angehakt heisst: sie wechseln sich ab', async ({ page, bar }) => {
    await anzeigeReiter(page, bar, { settings: { transition: 'zoom', uebergaenge: ['zoom'] } });

    await page.locator('[data-uebergang=kreis]').check();
    await page.locator('[data-uebergang=hoch]').check();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    const s = bar.lies().settings;
    expect(s.transition).toBe('mix');
    // In der Reihenfolge der Liste, unabhaengig vom Anhaken
    expect(s.uebergaenge).toEqual(['zoom', 'hoch', 'kreis']);
  });

  test('der letzte Haken laesst sich nicht entfernen', async ({ page, bar }) => {
    await anzeigeReiter(page, bar, { settings: { transition: 'zoom', uebergaenge: ['zoom'] } });

    const zoom = page.locator('[data-uebergang=zoom]');
    await expect(zoom).toBeChecked();
    // Bewusst click() statt uncheck(): uncheck() bestuende darauf, dass der
    // Haken hinterher weg ist - und genau das soll hier nicht passieren.
    await zoom.click();

    await expect(page.locator('#toast')).toContainText('Mindestens ein Übergang');
    await expect(zoom).toBeChecked();
  });

  test('die Reihenfolge laesst sich waehlen', async ({ page, bar }) => {
    await anzeigeReiter(page, bar,
      { settings: { transition: 'mix', uebergaenge: ['fade', 'zoom', 'kreis'] } });

    await expect(page.locator('#s_uebergangsFolge')).toHaveValue('zufall');
    await page.locator('#s_uebergangsFolge').selectOption('reihe');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('#dirty')).toBeHidden();

    expect(bar.lies().settings.uebergangsFolge).toBe('reihe');
  });

  test('bei nur einem Uebergang ist die Reihenfolge gegenstandslos',
    async ({ page, bar }) => {
      await anzeigeReiter(page, bar, { settings: { transition: 'zoom', uebergaenge: ['zoom'] } });
      await expect(page.locator('#folgeFeld')).toHaveClass(/gedimmt/);

      await page.locator('[data-uebergang=kreis]').check();
      await expect(page.locator('#folgeFeld')).not.toHaveClass(/gedimmt/);
    });
});

test.describe('Aufgeraeumtes Bedienmenue', () => {
  const REITER = ['Durchsage', 'Timetable', 'Karte', 'Videos', 'Anzeige', 'System'];

  test('keine leeren Karten und keine leeren Knopfreihen', async ({ page, bar }) => {
    // Am Handy werden einzelne Knoepfe ausgeblendet. Frueher blieben ihre
    // Huellen stehen: vier Knopfreihen ohne Knopf und die Karte "Fenster" mit
    // nichts als der Ueberschrift.
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');

    for (const name of REITER) {
      await page.getByRole('button', { name, exact: true }).click();
      const fund = await page.evaluate(() => {
        const sichtbar = (el) => el.offsetParent !== null;
        const leereKarten = [];
        for (const k of document.querySelectorAll('.panel.active .card')) {
          if (!sichtbar(k)) continue;
          const bedienbar = Array.from(k.querySelectorAll('input,select,textarea,button,img'));
          if (bedienbar.some(sichtbar)) continue;
          const titel = k.querySelector('h2');
          const rest = Array.from(k.children)
            .filter(x => x !== titel && sichtbar(x) && x.textContent.trim());
          if (!rest.length) leereKarten.push(titel ? titel.textContent.trim() : '(ohne Titel)');
        }
        const leereReihen = [];
        for (const r of document.querySelectorAll('.panel.active .btnRow')) {
          if (!sichtbar(r)) continue;
          const b = Array.from(r.querySelectorAll('button'));
          if (b.length && !b.some(sichtbar)) leereReihen.push(r.className);
        }
        return { leereKarten, leereReihen };
      });
      expect(fund.leereKarten, name + ': leere Karten').toEqual([]);
      expect(fund.leereReihen, name + ': leere Knopfreihen').toEqual([]);
    }
  });

  test('das Aufraeumen nimmt nicht zu viel mit', async ({ page, bar }) => {
    // Der erste Anlauf pruefte mit offsetParent - das ist auch dann null, wenn
    // der Reiter gerade nicht dran ist. Damit galten saemtliche Karten der
    // uebrigen fuenf Reiter als leer und verschwanden.
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');

    for (const name of REITER) {
      await page.getByRole('button', { name, exact: true }).click();
      const karten = await page.locator('.panel.active .card').evaluateAll(
        (ks) => ks.filter(k => k.offsetParent !== null).length);
      expect(karten, name + ' hat noch Karten').toBeGreaterThan(0);
    }
  });

  test('jede Karte gehoert zu einem Reiter', async ({ page, bar }) => {
    // Die Vorschau war beim Verschieben aus ihrem Reiter herausgerutscht und
    // stand danach auf allen sechs.
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');
    await expect(page.locator('main > .card')).toHaveCount(0);
  });

  test('Geraeteeinstellungen stehen unter System', async ({ page, bar }) => {
    bar.konfig(beispiel());
    await page.goto(bar.adresse + '/einstellungen');

    await page.getByRole('button', { name: 'System', exact: true }).click();
    for (const id of ['s_rotation', 's_sparmodus', 'q_enabled', 'q_from', 'q_to']) {
      await expect(page.locator('#' + id)).toBeVisible();
    }

    await page.getByRole('button', { name: 'Anzeige', exact: true }).click();
    for (const id of ['s_uebergangsFolge', 's_transitionMs', 's_fadeMs', 's_titleStyle', 's_pattern']) {
      await expect(page.locator('#' + id)).toBeVisible();
    }
    // und nicht doppelt
    for (const id of ['s_rotation', 's_sparmodus', 's_uebergangsFolge', 's_fadeMs']) {
      await expect(page.locator('#' + id)).toHaveCount(1);
    }
  });
});

test.describe('Timetable eintippen', () => {
  test('ein neuer Act faengt da an, wo der vorige aufhoert', async ({ page, bar }) => {
    bar.konfig(beispiel({
      timetable: [{ id: 'a', date: '2026-09-10', start: '18:00', end: '21:00', act: 'Karaoke' }]
    }));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();

    await page.getByRole('button', { name: '+ Act hinzufügen' }).click();
    const neu = page.locator('#ttBody tr').last();
    await expect(neu.locator('[data-f=date]')).toHaveValue('2026-09-10');
    await expect(neu.locator('[data-f=start]')).toHaveValue('21:00');
  });

  test('ueber Mitternacht wandert das Datum mit', async ({ page, bar }) => {
    bar.konfig(beispiel({
      timetable: [{ id: 'a', date: '2026-09-10', start: '23:00', end: '00:00', act: 'Knolle' }]
    }));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();

    await page.getByRole('button', { name: '+ Act hinzufügen' }).click();
    const neu = page.locator('#ttBody tr').last();
    // 00:00 nach einem Act, der um 23:00 anfing, ist schon der Folgetag
    await expect(neu.locator('[data-f=date]')).toHaveValue('2026-09-11');
    await expect(neu.locator('[data-f=start]')).toHaveValue('00:00');
  });

  test('ohne Endzeit beim vorigen bleibt die Startzeit leer', async ({ page, bar }) => {
    bar.konfig(beispiel({
      timetable: [{ id: 'a', date: '2026-09-10', start: '18:00', act: 'Offen' }]
    }));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();

    await page.getByRole('button', { name: '+ Act hinzufügen' }).click();
    const neu = page.locator('#ttBody tr').last();
    await expect(neu.locator('[data-f=date]')).toHaveValue('2026-09-10');
    await expect(neu.locator('[data-f=start]')).toHaveValue('');
  });

  test('der allererste Act bekommt das heutige Datum', async ({ page, bar }) => {
    bar.konfig(beispiel({ timetable: [] }));
    await page.goto(bar.adresse + '/einstellungen');
    await page.getByRole('button', { name: 'Timetable', exact: true }).click();

    await page.getByRole('button', { name: '+ Act hinzufügen' }).click();
    const neu = page.locator('#ttBody tr').last();
    await expect(neu.locator('[data-f=date]')).not.toHaveValue('');
    await expect(neu.locator('[data-f=start]')).toHaveValue('');
  });
});
