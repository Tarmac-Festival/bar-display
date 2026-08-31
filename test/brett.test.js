'use strict';

// Welches Brett erkennt das Einrichtungsskript?
//
// An dieser einen Entscheidung haengt alles Weitere: nur auf einem Raspberry Pi
// wird an der Firmware-Datei config.txt geschrieben. Auf einem Odroid N2+ oder
// sonst einem Brett waere das bestenfalls wirkungslos - dort bringt der Kernel
// den Grafiktreiber mit.
//
// Geprueft wird das Skript selbst, nicht eine Nachbildung: es laeuft mit
// NUR_ERKENNEN=1 bis zur Erkennung und gibt sie aus.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('   ok  ' + name); }
  else { fail++; console.log('  FEHL ' + name + '\n       erwartet: ' +
                             JSON.stringify(want) + '\n       bekommen: ' + JSON.stringify(got)); }
}

const SKRIPT = path.join(__dirname, '..', 'pi', 'install.sh');

/** Gibt es ueberhaupt eine bash? Ohne sie laesst sich hier nichts pruefen. */
function bashDa() {
  const r = spawnSync('bash', ['--version'], { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

/** Laesst das Skript ein Modell erkennen und gibt "Brett|IstPi" zurueck. */
function erkennen(modell) {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'bar-display-brett-'));
  const datei = path.join(ordner, 'model');
  // Echte Geraete haengen ein Null-Byte an - genau daran ist schon einmal ein
  // Vergleich gescheitert, deshalb steht es hier auch in der Nachbildung.
  if (modell !== null) fs.writeFileSync(datei, modell + '\0');

  try {
    return execFileSync('bash', [SKRIPT], {
      env: Object.assign({}, process.env, {
        MODELL_DATEIEN: datei.replace(/\\/g, '/'),
        NUR_ERKENNEN: '1'
      }),
      encoding: 'utf8'
    }).trim();
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
}

console.log('-- Brett erkennen --');

if (!bashDa()) {
  console.log('   (keine bash gefunden - uebersprungen)');
} else {
  check('Raspberry Pi 3', erkennen('Raspberry Pi 3 Model B Plus Rev 1.3'),
        'Raspberry Pi 3 Model B Plus Rev 1.3|1');
  check('Raspberry Pi 4', erkennen('Raspberry Pi 4 Model B Rev 1.5'),
        'Raspberry Pi 4 Model B Rev 1.5|1');
  check('Raspberry Pi 5', erkennen('Raspberry Pi 5 Model B Rev 1.0'),
        'Raspberry Pi 5 Model B Rev 1.0|1');

  // Home Assistant Blue ist ein Odroid N2+ im Gehaeuse
  check('Odroid N2+', erkennen('Hardkernel ODROID-N2Plus'),
        'Hardkernel ODROID-N2Plus|0');
  check('Odroid N2', erkennen('Hardkernel ODROID-N2'), 'Hardkernel ODROID-N2|0');
  check('irgendein anderes Brett', erkennen('Some Other Board'), 'Some Other Board|0');

  // Ohne Datei: kein Geraetebaum, also kein Pi - und schon gar kein Grund, in
  // einer config.txt herumzuschreiben.
  check('ohne Modelldatei', erkennen(null), 'unbekannt|0');

  // Ein Name, in dem "Raspberry Pi" nur vorkommt, zaehlt trotzdem: es gibt
  // Nachbauten und Computermodule mit Zusaetzen davor und dahinter.
  check('Compute Module', erkennen('Raspberry Pi Compute Module 4 Rev 1.0'),
        'Raspberry Pi Compute Module 4 Rev 1.0|1');
}

console.log('');
console.log(pass + ' bestanden, ' + fail + ' fehlgeschlagen');
process.exitCode = fail ? 1 : 0;
