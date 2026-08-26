// Tests fuer den Dienst hinter der Bedienseite:  npm test
//
// Zwei Dinge, die sich nur hier pruefen lassen: dass zwei Geraete sich nicht
// gegenseitig ueberschreiben (Stand der Fassung), und dass der Formathinweis
// zum Anzeigegeraet passt.
const fs = require('fs');
const os = require('os');
const path = require('path');

const webserver = require('../lib/webserver');
const konfigablage = require('../lib/konfigablage');
const { formatHinweis } = require('../lib/hochladen');
const { benutzteFotos, fotosAufraeumen } = require('../lib/fotos');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else {
    fail++;
    console.log('  FEHLER ' + name + ': erwartet ' + JSON.stringify(want) +
                ', bekommen ' + JSON.stringify(got));
  }
}

// ---------------------------------------------------------------------------
// Stand der Fassung: wer auf einer ueberholten Fassung aufsetzt, wird gefragt
// ---------------------------------------------------------------------------
async function standPruefen() {
  console.log('-- Stand der Fassung --');

  // Ablage im Arbeitsspeicher - der Dienst kennt nur lesen() und schreiben().
  let abgelegt = { version: 3, stand: 1, settings: { pin: '' }, videos: [], timetable: [], prices: [] };
  const lesen = () => JSON.parse(JSON.stringify(abgelegt));
  const schreiben = (neu) => {
    abgelegt = Object.assign({}, neu, { stand: (Number(abgelegt.stand) || 0) + 1 });
    return lesen();
  };

  const ordner = path.join(os.tmpdir(), 'bar-display-test-' + process.pid);
  const { server } = webserver.erstellen({
    ordner: { basis: ordner, media: ordner, photo: ordner, brand: ordner, font: ordner, config: ordner },
    lesen, schreiben, version: 'test'
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const basis = 'http://127.0.0.1:' + server.address().port;

  const speichern = async (cfg) => {
    const antwort = await fetch(basis + '/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    return { status: antwort.status, koerper: await antwort.json() };
  };

  // Auf dem aktuellen Stand aufgesetzt -> geht durch, Stand zaehlt eins hoch
  let a = await speichern({ stand: 1, settings: { barName: 'Erste' } });
  check('auf aktuellem Stand: angenommen', a.status, 200);
  check('auf aktuellem Stand: Stand zaehlt hoch', a.koerper.stand, 2);

  // Zweites Geraet, das noch die alte Fassung geladen hatte
  a = await speichern({ stand: 1, settings: { barName: 'Zweite' } });
  check('ueberholter Stand: Rueckfrage', a.status, 409);
  check('ueberholter Stand: als Konflikt gekennzeichnet', a.koerper.konflikt, true);
  check('ueberholter Stand: aktuelle Fassung liegt bei', a.koerper.aktuell.settings.barName, 'Erste');
  check('ueberholter Stand: nichts geschrieben', abgelegt.settings.barName, 'Erste');

  // Bewusst ueberschreiben: auf den mitgelieferten Stand aufsetzen
  a = await speichern({ stand: a.koerper.aktuell.stand, settings: { barName: 'Zweite' } });
  check('nach dem Aufsetzen: angenommen', a.status, 200);
  check('nach dem Aufsetzen: geschrieben', abgelegt.settings.barName, 'Zweite');

  // Aeltere Sicherung ohne Stand laesst sich nicht pruefen und wird durchgelassen
  a = await speichern({ settings: { barName: 'Ohne Stand' } });
  check('ohne Stand: angenommen', a.status, 200);

  // Offene Keep-alive-Verbindungen halten den Dienst sonst am Leben
  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise(r => server.close(r));
}

// ---------------------------------------------------------------------------
// Formathinweis
// ---------------------------------------------------------------------------
function formatPruefen() {
  console.log('');
  console.log('-- Formathinweis --');

  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-display-format-'));
  const legen = (name, kennung) => {
    const p = path.join(ordner, name);
    // Die Kennung steht im Original im moov-Kasten; fuer die Suche reicht es,
    // dass sie ueberhaupt in der Datei steht.
    fs.writeFileSync(p, Buffer.from('....ftypqt  ....' + kennung + '....', 'latin1'));
    return p;
  };

  const hevc = legen('iphone.mov', 'hvc1');
  const h264 = legen('normal.mp4', 'avc1');
  const bild = legen('foto.jpg', 'avc1');

  check('H.264 gibt nichts zu meckern', formatHinweis(h264, 'pi'), null);
  check('Bilder werden nicht geprueft', formatHinweis(bild, 'pi'), null);

  const amPi = formatHinweis(hevc, 'pi');
  const amRechner = formatHinweis(hevc, 'rechner');
  check('HEVC am Pi: Hinweis kommt', typeof amPi, 'string');
  check('HEVC am Pi: nennt den Pi', /Raspberry Pi/.test(amPi), true);
  check('HEVC am Rechner: Hinweis kommt', typeof amRechner, 'string');
  check('HEVC am Rechner: keine Pi-Warnung', /Raspberry Pi/.test(amRechner), false);
  check('HEVC am Rechner: sagt, dass es meist laeuft',
        /meisten Rechner spielen das ab/.test(amRechner), true);
  check('ohne Angabe wie am Pi', formatHinweis(hevc), amPi);

  fs.rmSync(ordner, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Zwei Standardkonfigurationen, ein Programm
// ---------------------------------------------------------------------------
// main.js (Electron) und lib/konfigablage.js (Raspberry Pi) halten jeweils eine
// eigene Fassung der Voreinstellungen. Laufen sie auseinander, sieht dieselbe
// Konfiguration je nach Geraet anders aus - und das faellt erst an der Bar auf.
// Deshalb hier ein Abgleich bei jedem Testlauf.
function standardPruefen() {
  console.log('');
  console.log('-- Voreinstellungen auf beiden Wegen --');

  const vm = require('vm');
  const quelle = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const von = quelle.indexOf('const DEFAULT_CONFIG = {');
  const bis = quelle.indexOf('\nfunction deepMerge', von);
  const ctx = vm.createContext({});
  vm.runInContext('const CONFIG_VERSION = 3;\n' + quelle.slice(von, bis) +
                  '\nglobalThis.D = DEFAULT_CONFIG;', ctx);

  const flach = (o, praefix) => {
    const raus = {};
    for (const key of Object.keys(o || {})) {
      const wert = o[key];
      if (wert && typeof wert === 'object' && !Array.isArray(wert)) {
        Object.assign(raus, flach(wert, (praefix || '') + key + '.'));
      } else {
        raus[(praefix || '') + key] = Array.isArray(wert) ? JSON.stringify(wert) : wert;
      }
    }
    return raus;
  };

  const A = flach(ctx.D), B = flach(konfigablage.STANDARD);
  const alle = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
  const abweichungen = [];
  for (const schluessel of alle) {
    // Die laufende Nummer wird beim Schreiben gesetzt, nicht voreingestellt
    if (schluessel === 'stand') continue;
    if (!(schluessel in A)) abweichungen.push(schluessel + ' fehlt in main.js');
    else if (!(schluessel in B)) abweichungen.push(schluessel + ' fehlt beim Pi');
    else if (JSON.stringify(A[schluessel]) !== JSON.stringify(B[schluessel])) {
      abweichungen.push(schluessel + ': main=' + JSON.stringify(A[schluessel]) +
                        ' pi=' + JSON.stringify(B[schluessel]));
    }
  }

  check('beide Voreinstellungen stimmen ueberein', abweichungen, []);
  check('und sie sind nicht leer', alle.length > 30, true);
}

// ---------------------------------------------------------------------------
// Aufraeumen des Foto-Ordners
// ---------------------------------------------------------------------------
// Hier wird geloescht, ohne Weg zurueck. Die Aufraeumfunktion kannte lange nur
// die Act-Fotos aus dem Timetable; als die Karte Fotos bekam, haette ein Klick
// auf "Unbenutzte Fotos aufraeumen" saemtliche Speisen-Fotos mitgenommen.
function fotosPruefen() {
  console.log('');
  console.log('-- Benutzte Fotos --');

  const cfg = {
    timetable: [{ photo: 'act.jpg' }, { photo: '' }, {}],
    prices: [
      { items: [{ photo: 'burger.jpg' }, { name: 'Pommes' }],
        spezial: { photo: 'chili.jpg' } },
      { items: [] },
      null
    ],
    special: { photo: 'shot.jpg' }
  };

  check('alle vier Fundstellen', [...benutzteFotos(cfg)].sort(),
        ['act.jpg', 'burger.jpg', 'chili.jpg', 'shot.jpg']);
  check('leere Konfiguration', benutzteFotos(null).size, 0);
  check('leere Namen zaehlen nicht', benutzteFotos({ timetable: [{ photo: '  ' }] }).size, 0);

  // Und jetzt wirklich aufraeumen, mit echten Dateien
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-display-fotos-'));
  for (const n of ['act.jpg', 'burger.jpg', 'chili.jpg', 'shot.jpg', 'verwaist.jpg']) {
    fs.writeFileSync(path.join(ordner, n), 'x');
  }

  const weg = fotosAufraeumen(fs, path, ordner, cfg);
  const uebrig = fs.readdirSync(ordner).sort();

  check('genau eine Datei geloescht', weg, 1);
  check('das Speisen-Foto ist noch da', uebrig.indexOf('burger.jpg') >= 0, true);
  check('das Tagesgericht auch', uebrig.indexOf('chili.jpg') >= 0, true);
  check('der Spezialshot auch', uebrig.indexOf('shot.jpg') >= 0, true);
  check('nur die verwaiste ist weg', uebrig, ['act.jpg', 'burger.jpg', 'chili.jpg', 'shot.jpg']);

  fs.rmSync(ordner, { recursive: true, force: true });
}

(async () => {
  await standPruefen();
  fotosPruefen();
  formatPruefen();
  standardPruefen();
  console.log('');
  console.log(pass + ' bestanden, ' + fail + ' fehlgeschlagen');
  // Kein process.exit: Node soll seine Handles selbst abraeumen.
  process.exitCode = fail ? 1 : 0;
})();
