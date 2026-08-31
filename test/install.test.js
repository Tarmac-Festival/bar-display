'use strict';

// Das Einrichtungsskript pi/install.sh.
//
// Zwei Dinge lassen sich hier pruefen, ohne ein Geraet zu haben: was es
// erkennt, bevor es irgendetwas tut - und ob die Skripte, die es schreibt,
// ueberhaupt heil sind.
//
// Was erkennt das Einrichtungsskript, bevor es irgendetwas tut?
//
// Zwei Entscheidungen, an denen alles Weitere haengt:
//
//   Brett      Nur auf einem Raspberry Pi wird an der Firmware-Datei config.txt
//              geschrieben. Anderswo gibt es sie nicht - dort bringt der Kernel
//              den Grafiktreiber mit.
//   Anzeigeart Ohne Arbeitsflaeche uebernimmt cage tty1; mit einer laeuft
//              Chromium in der vorhandenen Sitzung. Der erste Weg bekaeme den
//              Bildschirm sonst gar nicht.
//
// Geprueft wird das Skript selbst, nicht eine Nachbildung: es laeuft mit
// NUR_ERKENNEN=1 bis zu den Entscheidungen und gibt sie aus.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('   ok  ' + name); }
  else {
    fail++;
    console.log('  FEHL ' + name +
                '\n       erwartet: ' + JSON.stringify(want) +
                '\n       bekommen: ' + JSON.stringify(got));
  }
}

const SKRIPT = path.join(__dirname, '..', 'pi', 'install.sh');

/** Gibt es ueberhaupt eine bash? Ohne sie laesst sich hier nichts pruefen. */
function bashDa() {
  const r = spawnSync('bash', ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

/** Laesst das Skript erkennen und gibt "Brett|IstPi|Anzeigeart" zurueck. */
function erkennen(modell, zusatz) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-display-brett-'));
  const datei = path.join(ordner, 'model');
  // Echte Geraete haengen ein Null-Byte an - genau daran ist schon einmal ein
  // Vergleich gescheitert, deshalb steht es hier auch in der Nachbildung.
  if (modell !== null) fs.writeFileSync(datei, modell + '\0');

  const grund = {
    MODELL_DATEIEN: datei.split(path.sep).join('/'),
    STANDARDZIEL: 'multi-user.target',
    NUR_ERKENNEN: '1'
  };
  try {
    return execFileSync('bash', [SKRIPT], {
      env: Object.assign({}, process.env, grund, zusatz || {}),
      encoding: 'utf8'
    }).trim();
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
}

console.log('-- Brett und Anzeigeart erkennen --');

if (!bashDa()) {
  console.log('   (keine bash gefunden - uebersprungen)');
} else {
  check('Raspberry Pi 3', erkennen('Raspberry Pi 3 Model B Plus Rev 1.3'),
        'Raspberry Pi 3 Model B Plus Rev 1.3|1|konsole');
  check('Raspberry Pi 4', erkennen('Raspberry Pi 4 Model B Rev 1.5'),
        'Raspberry Pi 4 Model B Rev 1.5|1|konsole');
  check('Raspberry Pi 5', erkennen('Raspberry Pi 5 Model B Rev 1.0'),
        'Raspberry Pi 5 Model B Rev 1.0|1|konsole');

  // Home Assistant Blue ist ein Odroid N2+ im Gehaeuse
  check('Odroid N2+', erkennen('Hardkernel ODROID-N2Plus'),
        'Hardkernel ODROID-N2Plus|0|konsole');
  check('Odroid N2', erkennen('Hardkernel ODROID-N2'),
        'Hardkernel ODROID-N2|0|konsole');
  check('irgendein anderes Brett', erkennen('Some Other Board'),
        'Some Other Board|0|konsole');

  // Ohne Datei: kein Geraetebaum, also kein Pi - und schon gar kein Grund, in
  // einer config.txt herumzuschreiben.
  check('ohne Modelldatei', erkennen(null), 'unbekannt|0|konsole');

  // Ein Name, in dem "Raspberry Pi" nur vorkommt, zaehlt trotzdem: es gibt
  // Nachbauten und Computermodule mit Zusaetzen davor und dahinter.
  check('Compute Module', erkennen('Raspberry Pi Compute Module 4 Rev 1.0'),
        'Raspberry Pi Compute Module 4 Rev 1.0|1|konsole');

  // ---- Konsole oder Arbeitsflaeche ----------------------------------------
  const mitDesktop = { STANDARDZIEL: 'graphical.target' };

  // Ubuntu mit GNOME auf einem N2+: dort gehoert der Bildschirm dem
  // Anmeldedienst, cage bekaeme ihn gar nicht.
  check('N2+ mit Arbeitsflaeche', erkennen('Hardkernel ODROID-N2Plus', mitDesktop),
        'Hardkernel ODROID-N2Plus|0|desktop');

  // Auf einem Pi bleibt es beim schlanken Aufsatz: 1 GB, und die Arbeitsflaeche
  // ist dort meist nur mitinstalliert, nicht gewollt.
  check('Pi mit Arbeitsflaeche bleibt bei cage',
        erkennen('Raspberry Pi 3 Model B', mitDesktop),
        'Raspberry Pi 3 Model B|1|konsole');

  // Von Hand geht beides, in beide Richtungen
  check('Pi, aber ausdruecklich Arbeitsflaeche',
        erkennen('Raspberry Pi 3 Model B',
                 { STANDARDZIEL: 'graphical.target', KIOSK: 'desktop' }),
        'Raspberry Pi 3 Model B|1|desktop');
  check('N2+, aber ausdruecklich ohne',
        erkennen('Hardkernel ODROID-N2Plus',
                 { STANDARDZIEL: 'graphical.target', KIOSK: 'konsole' }),
        'Hardkernel ODROID-N2Plus|0|konsole');
}

// ---------------------------------------------------------------------------
// Die Helferbefehle, die das Skript schreibt
// ---------------------------------------------------------------------------
// Sie stecken in Heredocs - "bash -n pi/install.sh" sieht da nicht hinein. Ein
// Tippfehler darin faellt sonst erst auf dem Geraet auf, und zwar erst dann,
// wenn jemand den Befehl braucht.
console.log('');
console.log('-- Eingebettete Helferskripte --');

if (!bashDa()) {
  console.log('   (keine bash gefunden - uebersprungen)');
} else {
  const quelle = fs.readFileSync(SKRIPT, 'utf8');
  const marken = ['AKTUELL', 'KONSOLE', 'ANZEIGE'];
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-display-helfer-'));

  for (const marke of marken) {
    // Ohne regulaeren Ausdruck: der Koerper wird zwischen der Anfangs- und
    // der Schlussmarke herausgeschnitten. Weniger Zeichen zum Verwechseln.
    const anfang = quelle.indexOf("<<'" + marke + "'");
    const kopfEnde = anfang < 0 ? -1 : quelle.indexOf('\n', anfang) + 1;
    const schluss = kopfEnde < 1 ? -1 : quelle.indexOf('\n' + marke + '\n', kopfEnde);
    if (schluss < 0) { check(marke + ' gefunden', false, true); continue; }

    const datei = path.join(ordner, marke + '.sh');
    fs.writeFileSync(datei, quelle.slice(kopfEnde, schluss));
    const r = spawnSync('bash', ['-n', datei], { encoding: 'utf8' });
    check(marke + ' ist syntaktisch heil',
          r.status === 0 ? 'ok' : (r.stderr || '').trim(), 'ok');
  }
  fs.rmSync(ordner, { recursive: true, force: true });
}

console.log('');
console.log(pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exitCode = fail ? 1 : 0;
